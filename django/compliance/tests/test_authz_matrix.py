############################################################
#  [*] Tests — the authorization matrix
#
#  Every route of compliance/urls.py, read from urlpatterns
#  itself, against every kind of caller. ROUTES classifies
#  each (route, method); a route added to urls.py without a
#  row here fails test_every_route_is_classified, and a view
#  that accepts a method its row does not declare (or refuses
#  one it does) fails test_declared_methods_are_the_accepted_ones.
#
#    public    — health and login: no bearer needed
#    signed-in — any active account, no row id in the path
#    admin     — role "admin" only; a user gets 403 FORBIDDEN
#    owned     — the path names tenant rows: their owner and
#                the admins; anyone else gets 404, never 200
#                or 500 (a 403 would confirm the id exists)
#    personal  — owned, but admins are refused too: another
#                user's chat thread and its messages
#    internal  — /internal/*: 403 INTERNAL_ONLY without the
#                shared secret (the ingress never proxies it:
#                only /api/* reaches Django from outside)
#
#  Every user owns one record of each kind (seed_tenant): a
#  company with a credential, an adopted standard and a role,
#  a document, a report
#  with a finding, a chat thread with a message, a job and a
#  usage call. The catalogue rows (an act, a provision, an
#  obligation, a standard nobody adopted, a prompt, an MCP
#  server) are shared.
#
#  Also here: every admin write leaves an audit row, and no
#  malformed or type-confused body makes any write route
#  answer 5xx.
############################################################


import io
import json
import re
import sys
import uuid
from contextlib import ExitStack
from datetime import timedelta
from types import SimpleNamespace
from unittest import mock


from django.db import transaction
from django.test import TestCase
from django.urls import URLPattern


from compliance import urls
from compliance.analysis.models import CompanyAction, Finding, Report, ReportAct
from compliance.programme.models import WorkProduct
from compliance.assistant import gateway
from compliance.assistant.models import LlmCall, McpServer
from compliance.audit.models import AuditLog
from compliance.chat.models import ChatMessage, ChatThread
from compliance.common import http as http_module
from compliance.common.ratelimit import reset_rate_limits
from compliance.common.timestamps import utc_now
from compliance.companies.models import (
    Company, CompanyCredential, CompanyDocument, CompanyDocumentChunk, CompanyRole, CompanyStandard,
)
from compliance.corpus.models import LegalDocument, LegalDocumentVersion, LegalUnit, Obligation
from compliance.jobs.models import Job
from compliance.prompts.models import Prompt
from compliance.prompts.store import add_version
from compliance.tests.fakes import fake_models
from compliance.tests.utils import ApiClient, create_admin, create_user, signed_in
from compliance.users.auth import hash_token
from compliance.users.models import Session


PUBLIC, SIGNED_IN, ADMIN, OWNED, PERSONAL, INTERNAL = "public", "signed-in", "admin", "owned", "personal", "internal"

# Every method the probes try; a route answers 405 to the
# ones its row does not declare
METHODS = ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
WRITES = ("POST", "PUT", "PATCH", "DELETE")

SECRET = "test-internal-secret"

# The id of the catalogue's standard nobody adopted — a body
# that would adopt it succeeds on the caller's own company
CATALOGUE_STANDARD = "std-matrix"

# "<str:company_id>" → company_id
PARAM = re.compile(r"<(?:\w+:)?(\w+)>")








############################################################
# ROUTES
############################################################
#
# route (as written in urls.py) → ({method: policy}, {path
# parameter: the kind of row it names}). The kinds resolve
# through Seeds.value (below): tenant rows (company,
# credential, standard, role, document, report, finding,
# thread, job, call) come from the tenant under test,
# catalogue rows (act,
# unit, obligation, prompt, version_no, mcp) are shared, and
# "user" is the tenant's account.
############################################################

ROUTES = {
    "api/health":                                  ({"GET": PUBLIC, "HEAD": PUBLIC}, {}),
    "api/auth/login":                              ({"POST": PUBLIC}, {}),
    "api/auth/me":                                 ({"GET": SIGNED_IN}, {}),
    "api/auth/checkauth/admin":                    ({"GET": ADMIN}, {}),
    "api/auth/logout":                             ({"POST": SIGNED_IN}, {}),
    "api/auth/logout-all":                         ({"POST": SIGNED_IN}, {}),
    "api/auth/change-password":                    ({"POST": SIGNED_IN}, {}),
    "api/users":                                   ({"GET": ADMIN, "POST": ADMIN}, {}),
    "api/users/<str:user_id>":                     ({"GET": ADMIN, "PATCH": ADMIN, "DELETE": ADMIN}, {"user_id": "user"}),
    "api/users/<str:user_id>/reset-password":      ({"POST": ADMIN}, {"user_id": "user"}),
    "api/jobs":                                    ({"GET": SIGNED_IN}, {}),
    "api/jobs/counts":                             ({"GET": SIGNED_IN}, {}),
    "api/jobs/<str:job_id>":                       ({"GET": OWNED}, {"job_id": "job"}),
    "api/jobs/<str:job_id>/cancel":                ({"POST": OWNED}, {"job_id": "job"}),
    "api/audit":                                   ({"GET": ADMIN}, {}),
    "api/companies":                               ({"GET": SIGNED_IN, "POST": SIGNED_IN}, {}),
    "api/companies/<str:company_id>":              ({"GET": OWNED, "PUT": OWNED, "DELETE": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/credentials":  ({"GET": OWNED, "POST": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/credentials/<str:credential_id>":
                                                   ({"PATCH": OWNED, "DELETE": OWNED},
                                                    {"company_id": "company", "credential_id": "credential"}),
    "api/companies/<str:company_id>/standards":    ({"GET": OWNED, "POST": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/standards/<str:standard_id>":
                                                   ({"PATCH": OWNED, "DELETE": OWNED},
                                                    {"company_id": "company", "standard_id": "standard"}),
    "api/companies/<str:company_id>/roles":        ({"GET": OWNED, "POST": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/roles/<str:role_id>":
                                                   ({"GET": OWNED, "PATCH": OWNED, "DELETE": OWNED},
                                                    {"company_id": "company", "role_id": "role"}),
    "api/documents":                               ({"GET": SIGNED_IN, "POST": SIGNED_IN}, {}),
    "api/documents/search":                        ({"GET": SIGNED_IN}, {}),
    "api/documents/<str:document_id>":             ({"GET": OWNED, "PATCH": OWNED, "DELETE": OWNED}, {"document_id": "document"}),
    "api/documents/<str:document_id>/text":        ({"GET": OWNED}, {"document_id": "document"}),
    "api/corpus/documents":                        ({"GET": SIGNED_IN, "POST": ADMIN}, {}),
    "api/corpus/documents/<str:document_id>":      ({"GET": SIGNED_IN, "PATCH": ADMIN, "DELETE": ADMIN}, {"document_id": "act"}),
    "api/corpus/documents/<str:document_id>/refresh": ({"POST": ADMIN}, {"document_id": "act"}),
    "api/corpus/documents/<str:document_id>/upload":  ({"POST": ADMIN}, {"document_id": "act"}),
    "api/corpus/documents/<str:document_id>/units":   ({"GET": SIGNED_IN}, {"document_id": "act"}),
    "api/corpus/documents/<str:document_id>/extract-obligations": ({"POST": ADMIN}, {"document_id": "act"}),
    "api/corpus/documents/<str:document_id>/verify-obligations": ({"POST": ADMIN}, {"document_id": "act"}),
    "api/corpus/units/<str:unit_id>":              ({"GET": SIGNED_IN}, {"unit_id": "unit"}),
    "api/corpus/provision":                        ({"GET": SIGNED_IN}, {}),
    "api/corpus/search":                           ({"POST": SIGNED_IN}, {}),
    "api/corpus/check-citations":                  ({"POST": SIGNED_IN}, {}),
    "api/corpus/reembed":                          ({"POST": ADMIN}, {}),
    "api/corpus/refresh-all":                      ({"POST": ADMIN}, {}),
    "api/obligations":                             ({"GET": SIGNED_IN, "POST": ADMIN}, {}),
    "api/obligations/review":                      ({"POST": ADMIN}, {}),
    "api/obligations/<str:obligation_id>":         ({"GET": SIGNED_IN, "PATCH": ADMIN, "DELETE": ADMIN},
                                                    {"obligation_id": "obligation"}),
    "api/reports":                                 ({"GET": SIGNED_IN, "POST": SIGNED_IN}, {}),
    "api/reports/estimate":                        ({"GET": SIGNED_IN}, {}),
    "api/reports/<str:report_id>":                 ({"GET": OWNED, "PATCH": OWNED, "DELETE": OWNED}, {"report_id": "report"}),
    "api/reports/<str:report_id>/cancel":          ({"POST": OWNED}, {"report_id": "report"}),
    "api/reports/<str:report_id>/scope":           ({"POST": OWNED}, {"report_id": "report"}),
    "api/reports/<str:report_id>/findings/<str:finding_id>":
                                                   ({"PATCH": OWNED}, {"report_id": "report", "finding_id": "finding"}),
    "api/reports/<str:report_id>/export":          ({"GET": OWNED}, {"report_id": "report"}),
    "api/companies/<str:company_id>/programme":    ({"GET": OWNED, "POST": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/actions":      ({"GET": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/actions/export": ({"GET": OWNED}, {"company_id": "company"}),
    "api/companies/<str:company_id>/law-changes":  ({"GET": OWNED}, {"company_id": "company"}),
    "api/actions/<str:action_id>":                 ({"PATCH": OWNED}, {"action_id": "action"}),
    "api/programme/<str:product_id>":              ({"GET": OWNED, "PATCH": OWNED, "DELETE": OWNED}, {"product_id": "product"}),
    "api/programme/<str:product_id>/content":      ({"PUT": OWNED}, {"product_id": "product"}),
    "api/programme/<str:product_id>/revise":       ({"POST": OWNED}, {"product_id": "product"}),
    "api/programme/<str:product_id>/cancel":       ({"POST": OWNED}, {"product_id": "product"}),
    "api/programme/<str:product_id>/chart":        ({"GET": OWNED}, {"product_id": "product"}),
    "api/programme/<str:product_id>/export":       ({"GET": OWNED}, {"product_id": "product"}),
    "api/chat/models":                             ({"GET": SIGNED_IN}, {}),
    "api/chat/threads":                            ({"GET": SIGNED_IN, "POST": SIGNED_IN}, {}),
    "api/chat/threads/<str:thread_id>":            ({"GET": PERSONAL, "PATCH": PERSONAL, "DELETE": PERSONAL},
                                                    {"thread_id": "thread"}),
    "api/chat/threads/<str:thread_id>/messages":   ({"GET": PERSONAL, "POST": PERSONAL}, {"thread_id": "thread"}),
    "api/prompts":                                 ({"GET": ADMIN}, {}),
    "api/prompts/<str:slug>":                      ({"GET": ADMIN}, {"slug": "prompt"}),
    "api/prompts/<str:slug>/versions":             ({"POST": ADMIN}, {"slug": "prompt"}),
    "api/prompts/<str:slug>/versions/<int:version_no>/activate":
                                                   ({"POST": ADMIN}, {"slug": "prompt", "version_no": "version_no"}),
    "api/prompts/<str:slug>/test":                 ({"POST": ADMIN}, {"slug": "prompt"}),
    "api/usage":                                   ({"GET": SIGNED_IN}, {}),
    "api/usage/calls":                             ({"GET": SIGNED_IN}, {}),
    "api/usage/calls/<str:call_id>":               ({"GET": OWNED}, {"call_id": "call"}),
    "api/mcp/servers":                             ({"GET": ADMIN, "POST": ADMIN}, {}),
    "api/mcp/servers/<str:server_id>":             ({"GET": ADMIN, "PATCH": ADMIN, "DELETE": ADMIN}, {"server_id": "mcp"}),
    "api/mcp/servers/<str:server_id>/test":        ({"POST": ADMIN}, {"server_id": "mcp"}),
    "api/llm/models":                              ({"GET": ADMIN}, {}),
    "internal/assistant/prompt":                   ({"GET": INTERNAL}, {}),
    "internal/assistant/turn-log":                 ({"POST": INTERNAL}, {}),
    "internal/assistant/budget":                   ({"GET": INTERNAL}, {}),
    "internal/assistant/threads/<str:thread_id>/messages": ({"POST": INTERNAL}, {"thread_id": "thread"}),
    "internal/assistant/threads/<str:thread_id>/title": ({"POST": INTERNAL}, {"thread_id": "thread"}),
    "internal/assistant/mcp-servers":              ({"GET": INTERNAL}, {}),
}








############################################################
# TENANT_BODIES
############################################################
#
# A body that WOULD succeed on the owner's row, so a missing
# tenancy check shows up as a 2xx instead of a validation
# 400 that happens to hide it. (route, method) → body; a
# write without an entry sends {}.
############################################################

TENANT_BODIES = {
    ("api/companies/<str:company_id>", "PUT"): {"name": "Perimta"},
    ("api/companies/<str:company_id>/credentials", "POST"): {"kind": "license", "name": "Svetima licencija"},
    ("api/companies/<str:company_id>/credentials/<str:credential_id>", "PATCH"): {"name": "Pakeista", "status": "verified"},
    ("api/companies/<str:company_id>/standards", "POST"): {"documentId": CATALOGUE_STANDARD, "status": "planned"},
    ("api/companies/<str:company_id>/standards/<str:standard_id>", "PATCH"): {"status": "planned", "scope": "Perimta"},
    ("api/companies/<str:company_id>/roles", "POST"): {"name": "Svetimas vaidmuo", "context": "x"},
    ("api/companies/<str:company_id>/roles/<str:role_id>", "PATCH"): {"context": "Pakeista"},
    ("api/documents/<str:document_id>", "PATCH"): {"title": "Perimtas"},
    ("api/reports/<str:report_id>", "PATCH"): {"approved": True, "note": "Perimta"},
    ("api/companies/<str:company_id>/programme", "POST"): {"kind": "policy"},
    ("api/actions/<str:action_id>", "PATCH"): {"owner": "Perimta"},
    ("api/programme/<str:product_id>", "PATCH"): {"approved": True, "note": "Perimta"},
    ("api/programme/<str:product_id>/content", "PUT"): {"content": {"title": "Perimta"}},
    ("api/reports/<str:report_id>/findings/<str:finding_id>", "PATCH"): {"overrideStatus": "met", "reviewerNote": "x"},
    ("api/chat/threads/<str:thread_id>", "PATCH"): {"title": "Perimtas"},
    ("api/chat/threads/<str:thread_id>/messages", "POST"): {
        "id": "msg-intruder", "parent_id": None, "format": "ai-sdk/v6",
        "content": {"id": "msg-intruder", "role": "user", "parts": [{"type": "text", "text": "Labas"}]}},
}

# Query strings a GET needs to do real work
QUERIES = {
    "api/reports/<str:report_id>/export": "?format=xlsx",
    "api/programme/<str:product_id>/export": "?format=docx",
}








############################################################
# CONFUSED / MALFORMED
############################################################
#
# What a validator must refuse with a 4xx. The fuzz starts
# from a body that succeeds (NoServerErrorTests.valid_body)
# and replaces ONE field at a time — validators return on
# the first bad field, so an all-bad body would only ever
# reach the first check. Which fields a route reads is
# learned by recording the keys its view touches (Recorder,
# below), so a field added later is fuzzed without anyone
# listing it. CONFUSED are the shapes that reach set(),
# hashing, len() or the database adapter when a type check
# is missing; MALFORMED is JSON text a parser must survive.
############################################################

CONFUSED = (
    {"$ne": [1]},
    [[1], {"a": 1}],
    "\ud800",
    {"\ud800": "x"},
    True,
)

MALFORMED = [
    "[]", '"text"', "null", "{", '{"name": NaN}', '{"name": 1e999}', '{"name": "\\ud800"}',
    '{"name": "a\\u0000b"}', "[" * 40 + "]" * 40, '{"a":' * 40 + "1" + "}" * 40,
]








############################################################
# Recorder
############################################################
#
# The parsed body as a dict that notes every key the view
# reads (data[k], data.get(k), k in data). A view that
# enumerates the body ({**data}, sorted(data)) is marked
# WHOLE: it may read fields unseen (from a copy), so the fuzz
# also tries every field of FIELDS there — with one shape;
# the fields read for certain get every shape.
#
# Used by:
#   - NoServerErrorTests.fields_read (below)
############################################################

class Recorder(dict):

    def __init__(self, data, seen):
        super().__init__(data)
        self.seen = seen

    def __getitem__(self, key):
        self.seen.add(key)
        return super().__getitem__(key)

    def get(self, key, default=None):
        self.seen.add(key)
        return super().get(key, default)

    def __contains__(self, key):
        self.seen.add(key)
        return super().__contains__(key)

    def __iter__(self):
        self.seen.add(WHOLE)
        return super().__iter__()

    def keys(self):
        self.seen.add(WHOLE)
        return super().keys()

    def items(self):
        self.seen.add(WHOLE)
        return super().items()


# The marker of a view that enumerated its body
WHOLE = object()

# Every field any view reads today — tried on the views that
# enumerate their body
FIELDS = (
    "name", "title", "text", "email", "password", "displayName", "role", "active", "companyId", "documentId",
    "documentIds", "ids", "status", "kind", "url", "headers", "allowedTools", "appliesTo", "domains", "citations",
    "query", "k", "language", "input", "model", "note", "approved", "overrideStatus", "reviewerNote", "id",
    "format", "content", "parent_id", "sources", "context", "currentPassword", "newPassword", "dailyBudgetUsd",
    "force", "versionNo", "variables", "temperature", "maxTokens", "jurisdiction", "sourceKind", "sourceUrl",
    "externalId", "enabled", "category", "severity", "transport", "description", "evidenceDocumentId", "validFrom",
    "validTo", "naceCodes", "attributes", "financialMarket", "roleId", "slug", "user_id", "thread_id",
    "transcript", "tool_calls", "input_tokens", "titleEn", "shortTitle", "registrationCode", "employees",
    "institutionType", "country", "issuer", "identifier", "notes", "scope", "applicabilityNotes", "docType",
    "evidence", "deadline", "textEn", "addressee", "conditions", "usesAi", "sizeCategory", "activate",
    "certificateId",
)








############################################################
# new_id
############################################################
#
# Used by:
#   - seed_tenant, seed_catalogue (below)
############################################################

def new_id():
    return str(uuid.uuid4())








############################################################
# seed_tenant
############################################################
#
# One row of each kind for `user`, all linked the way the
# product links them (the credential's evidence is the
# company's document, the company adopted a standard of its
# own, certified by that credential, the thread adopted the
# company's role,
# the usage call is a chat turn of that thread). The job is
# queued far in the future, so no worker ever claims it.
#
# Used by:
#   - MatrixCase.setUpTestData (below)
############################################################

def seed_tenant(user, tag):
    now = utc_now()
    company = Company.objects.create(id=new_id(), owner=user, name=f"UAB {tag}", created_at=now, updated_at=now)
    text = f"Atitikties politika {tag}. Pareigūnas atsiskaito valdybai."
    document = CompanyDocument.objects.create(
        id=new_id(), owner=user, company=company, title=f"Politika {tag}", file_path=f"/nonexistent/{tag}.txt",
        sha256="0" * 64, text=text, char_count=len(text), extraction_status="done", uploaded_at=now)
    CompanyDocumentChunk.objects.create(id=new_id(), document=document, ordinal=0, text=text)
    credential = CompanyCredential.objects.create(
        id=new_id(), company=company, kind="license", name=f"Licencija {tag}", evidence_document=document,
        created_at=now, updated_at=now)
    standard_document = LegalDocument.objects.create(
        id=new_id(), slug=f"iso-matrix-{tag.lower()}", title=f"ISMS {tag}", short_title=f"ISO/IEC 27001 {tag}",
        jurisdiction="INTL", doc_type="standard", source_kind="upload", created_at=now, updated_at=now)
    standard = CompanyStandard.objects.create(id=new_id(), company=company, document=standard_document,
                                              status="certified", certificate=credential, created_at=now,
                                              updated_at=now)
    role = CompanyRole.objects.create(id=new_id(), company=company, name="Atitikties pareigūnas",
                                      context="Atsiskaito valdybai", created_by=user, created_at=now, updated_at=now)
    job = Job.objects.create(id=new_id(), kind="ops.noop", subject=f"matrix:{tag}", status="queued",
                             run_after=now + timedelta(days=365), created_by=user, created_at=now)
    report = Report.objects.create(id=new_id(), company=company, created_by=user, status="done", language="lt",
                                   title=f"Ataskaita {tag}", summary="Santrauka", created_at=now, finished_at=now)
    finding = Finding.objects.create(id=new_id(), report=report, obligation_title="Gauti leidimą", status="missing")
    thread = ChatThread.objects.create(id=new_id(), user=user, company=company, role=role, title=f"Pokalbis {tag}",
                                       message_count=1, created_at=now, updated_at=now)
    message = ChatMessage.objects.create(
        id=f"msg-{tag}", thread=thread, format="ai-sdk/v6", role="user", created_at=now,
        content={"id": f"msg-{tag}", "role": "user", "parts": [{"type": "text", "text": f"Slapta žinutė {tag}"}]})
    call = LlmCall.objects.create(
        id=new_id(), kind="chat", purpose="chat", user=user, thread_id=thread.id, model="gateway:azure/gpt-5.5",
        tool_calls=[{"name": "getCompany", "ms": 5, "ok": True}], created_at=now,
        transcript={"user": f"Slapta žinutė {tag}", "assistant": "Atsakymas"})
    product = WorkProduct.objects.create(
        id=new_id(), company=company, kind="policy", version=1, status="draft", title=f"Politika {tag}",
        content={"structure": [{"id": "n1", "name": "Valdyba", "kind": "body", "line": "governing", "parentId": None,
                                "proposed": False, "note": ""}]},
        created_by=user, created_at=now, finished_at=now)
    action = CompanyAction.objects.create(
        id=new_id(), company=company, report=report, plan_action_id=new_id(), title=f"Veiksmas {tag}", owner="Valdyba",
        due_date=now.date(), status="open", items=[], created_at=now, updated_at=now)
    return SimpleNamespace(user=user, company=company, document=document, credential=credential, standard=standard,
                           role=role, job=job, product=product, action=action,
                           report=report, finding=finding, thread=thread, message=message, call=call)








############################################################
# seed_catalogue
############################################################
#
# The shared rows: an ingested act with one provision and
# one proposed obligation, a standard nobody adopted, a
# prompt with an active version, a registered MCP server.
#
# Used by:
#   - MatrixCase.setUpTestData (below)
############################################################

def seed_catalogue(admin):
    now = utc_now()
    act = LegalDocument.objects.create(id=new_id(), slug="mica-matrix", title="MiCA reglamentas", short_title="MiCA",
                                       jurisdiction="EU", source_kind="upload", created_at=now, updated_at=now)
    version = LegalDocumentVersion.objects.create(id=new_id(), document=act, version_no=1, content_hash="0" * 64,
                                                  file_path="/nonexistent/act.txt", status="ready", created_at=now)
    LegalDocument.objects.filter(id=act.id).update(current_version=version)
    unit = LegalUnit.objects.create(id=new_id(), version=version, ordinal=0, unit_type="article", number="59",
                                    path="59 str.", heading="Leidimas",
                                    text="Kriptoturto paslaugų teikėjai privalo turėti leidimą.")
    obligation = Obligation.objects.create(id=new_id(), document=act, version=version, unit=unit,
                                           title="Gauti leidimą", text="Privaloma turėti leidimą.",
                                           status="proposed", created_at=now, updated_at=now)
    standard = LegalDocument.objects.create(
        id=CATALOGUE_STANDARD, slug="iso-9001-matrix", title="Quality management systems", short_title="ISO 9001:2015",
        jurisdiction="INTL", doc_type="standard", source_kind="upload", created_at=now, updated_at=now)
    prompt = Prompt.objects.create(id=new_id(), slug="t.matrix", name="Matrix", kind="pipeline",
                                   created_at=now, updated_at=now)
    add_version(prompt, "Instrukcija {TODAY}", "gateway:azure/gpt-5.5", activate=True)
    server = McpServer.objects.create(id=new_id(), name="eu_law", url="https://mcp.example.eu/mcp",
                                      headers={"X-Api-Key": "sekretas"}, created_by=admin, created_at=now,
                                      updated_at=now)
    return SimpleNamespace(act=act, unit=unit, obligation=obligation, standard=standard, prompt=prompt,
                           server=server)








############################################################
# route_table
############################################################
#
# {route string: URLPattern} straight from urls.py — the
# thing a new route cannot escape.
#
# Used by:
#   - every test class (below)
############################################################

def route_table():
    return {str(p.pattern): p for p in urls.urlpatterns if isinstance(p, URLPattern)}








############################################################
# send
############################################################
#
#   send(client, "PATCH", "/api/x", {"a": 1})
#
# One request with a JSON body (or a raw JSON text); GET,
# HEAD and OPTIONS go without one.
#
# Used by:
#   - every test class (below)
############################################################

def send(client, method, path, body=None, **extra):
    if method in ("GET", "HEAD", "OPTIONS"):
        return client.generic(method, path, **extra)
    data = body if isinstance(body, str) else json.dumps({} if body is None else body)
    return client.generic(method, path, data, content_type="application/json", **extra)








############################################################
# MatrixCase
############################################################
#
# The shared fixture: tenants A and B (plain users), an
# admin who owns records too, the catalogue, and a signed-in
# client for each account. The model gateway is faked for
# every test (no network, no retry sleeps).
############################################################

class MatrixCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.admin_user = create_admin(email="admin@knf.vu.lt")
        cls.a = seed_tenant(create_user(email="alfa@knf.vu.lt"), "A")
        cls.b = seed_tenant(create_user(email="beta@knf.vu.lt"), "B")
        cls.own = seed_tenant(cls.admin_user, "ADMIN")
        cls.catalogue = seed_catalogue(cls.admin_user)

    def setUp(self):
        reset_rate_limits()
        self.client_a = signed_in(self.a.user)
        self.client_b = signed_in(self.b.user)
        self.client_admin = signed_in(self.admin_user)
        fakes = fake_models()
        fakes.__enter__()
        self.addCleanup(fakes.__exit__, None, None, None)
        for name, value in (("list_models", {"providers": [], "models": []}), ("mcp_list_tools", [])):
            patcher = mock.patch.object(gateway, name, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def value(self, kind, tenant):
        catalogue = self.catalogue
        shared = {"act": catalogue.act.id, "unit": catalogue.unit.id, "obligation": catalogue.obligation.id,
                  "prompt": catalogue.prompt.slug, "version_no": 1, "mcp": catalogue.server.id}
        if kind in shared:
            return shared[kind]
        return getattr(tenant, kind).id

    def path(self, route, tenant, **overrides):
        params = ROUTES[route][1]
        return "/" + PARAM.sub(lambda m: str(overrides.get(m.group(1)) or self.value(params[m.group(1)], tenant)),
                               route)

    def rows(self, *policies):
        for route, (methods, _) in ROUTES.items():
            for method, policy in methods.items():
                if policy in policies:
                    yield route, method

    def assertAnswer(self, response, status, code, label):
        self.assertEqual(response.status_code, status, f"{label}: {response.content[:300]!r}")
        if code is not None:
            self.assertEqual(response.json().get("code"), code, label)








class RouteTableTests(MatrixCase):

    def test_every_route_is_classified(self):
        table = route_table()
        self.assertEqual(sorted(set(table) - set(ROUTES)), [],
                         "a new route needs its row in ROUTES (test_authz_matrix.py) — who may call it?")
        self.assertEqual(sorted(set(ROUTES) - set(table)), [], "ROUTES names a route urls.py no longer has")
        for route in ROUTES:
            self.assertEqual(set(PARAM.findall(route)), set(ROUTES[route][1]), route)

    def test_declared_methods_are_the_accepted_ones(self):
        anonymous = ApiClient()
        for route, (methods, _) in ROUTES.items():
            path = self.path(route, self.a)
            for method in METHODS:
                response = send(anonymous, method, path)
                with self.subTest(route=route, method=method):
                    if method in methods:
                        self.assertNotEqual(response.status_code, 405, f"{method} /{route} is declared")
                    else:
                        self.assertEqual(response.status_code, 405, f"{method} /{route} is not declared")
                        self.assertIn(methods and next(iter(methods)), response["Allow"])

    def test_internal_routes_are_exactly_the_internal_prefix(self):
        for route, (methods, _) in ROUTES.items():
            internal = set(methods.values()) == {INTERNAL}
            self.assertEqual(internal, route.startswith("internal/"), route)
            self.assertTrue(route.startswith(("api/", "internal/")), route)

    def test_unknown_routes_and_trailing_slashes_answer_json_404(self):
        for path in ("/api/nope", "/api/companies/", "/internal/nope", "/", "/admin/"):
            response = self.client_admin.get(path)
            self.assertAnswer(response, 404, "NOT_FOUND", path)








class AnonymousTests(MatrixCase):

    def _bearers(self):
        now = utc_now()
        expired = "expired-" + new_id()
        Session.objects.create(id=new_id(), user=self.b.user, token_hash=hash_token(expired),
                               expires_at=now - timedelta(seconds=1), created_at=now - timedelta(days=31))
        ghost = create_user(email="buves@knf.vu.lt")
        ghost_client = signed_in(ghost)
        ghost.active = False
        ghost.save(update_fields=["active"])
        return {"no bearer": ApiClient(), "garbage": ApiClient(token="not-a-session"),
                "expired": ApiClient(token=expired), "deactivated": ghost_client,
                "basic scheme": ApiClient(), "empty bearer": ApiClient()}

    def test_every_non_public_route_answers_401_without_a_live_session(self):
        extra = {"basic scheme": {"HTTP_AUTHORIZATION": "Basic YWRtaW46YWRtaW4="},
                 "empty bearer": {"HTTP_AUTHORIZATION": "Bearer "}}
        for name, client in self._bearers().items():
            for route, (methods, _) in ROUTES.items():
                path = self.path(route, self.a)
                for method, policy in methods.items():
                    response = send(client, method, path, **extra.get(name, {}))
                    label = f"{name}: {method} {path}"
                    with self.subTest(label):
                        self.assertLess(response.status_code, 500, label)
                        if policy == INTERNAL:
                            self.assertAnswer(response, 403, "INTERNAL_ONLY", label)
                        elif policy != PUBLIC:
                            self.assertAnswer(response, 401, "AUTH_REQUIRED", label)

    def test_public_routes_need_no_bearer(self):
        anonymous = ApiClient()
        self.assertEqual(anonymous.get("/api/health").status_code, 200)
        self.assertEqual(anonymous.head("/api/health").status_code, 200)
        response = send(anonymous, "POST", "/api/auth/login", {})
        self.assertAnswer(response, 400, "MISSING_FIELDS", "login without credentials")

    def test_an_expired_session_row_is_purged_on_sight(self):
        token = "expired-" + new_id()
        Session.objects.create(id=new_id(), user=self.b.user, token_hash=hash_token(token),
                               expires_at=utc_now() - timedelta(seconds=1), created_at=utc_now())
        self.assertEqual(ApiClient(token=token).get("/api/auth/me").status_code, 401)
        self.assertFalse(Session.objects.filter(token_hash=hash_token(token)).exists())








class RoleTests(MatrixCase):

    def test_a_plain_user_gets_403_on_every_admin_route(self):
        for route, method in self.rows(ADMIN):
            path = self.path(route, self.a)
            response = send(self.client_b, method, path, TENANT_BODIES.get((route, method)))
            with self.subTest(f"{method} {path}"):
                self.assertAnswer(response, 403, "FORBIDDEN", f"user: {method} {path}")

    def test_an_admin_passes_every_admin_gate(self):
        # Reads only: the writes are exercised (and audited) in
        # AuditCoverageTests
        for route, method in self.rows(ADMIN):
            if method != "GET":
                continue
            path = self.path(route, self.a)
            response = send(self.client_admin, method, path)
            with self.subTest(f"{method} {path}"):
                self.assertEqual(response.status_code, 200, f"admin: {method} {path}")

    def test_a_demoted_admin_loses_the_admin_routes_at_once(self):
        demoted = create_admin(email="buves.admin@knf.vu.lt")
        client = signed_in(demoted)
        self.assertEqual(client.get("/api/users").status_code, 200)
        demoted.role = "user"
        demoted.save(update_fields=["role"])
        self.assertAnswer(client.get("/api/users"), 403, "FORBIDDEN", "demoted admin")








class TenancyTests(MatrixCase):

    def test_the_owner_reaches_every_own_row(self):
        # Fixture sanity: the 404s below mean "not yours", not
        # "the seed is broken"
        for route, method in self.rows(OWNED, PERSONAL):
            if method != "GET":
                continue
            path = self.path(route, self.a) + QUERIES.get(route, "")
            response = send(self.client_a, method, path)
            with self.subTest(f"{method} {path}"):
                self.assertEqual(response.status_code, 200, f"owner: {method} {path}: {response.content[:200]!r}")

    def test_another_users_rows_answer_404_on_every_method(self):
        for route, method in self.rows(OWNED, PERSONAL):
            path = self.path(route, self.a) + QUERIES.get(route, "")
            response = send(self.client_b, method, path, TENANT_BODIES.get((route, method)))
            with self.subTest(f"{method} {path}"):
                self.assertAnswer(response, 404, "NOT_FOUND", f"B on A's row: {method} {path}")
        self._assert_a_untouched()

    def test_a_foreign_child_under_an_own_parent_is_404(self):
        mixed = [
            ("api/companies/<str:company_id>/credentials/<str:credential_id>", {"credential_id": self.a.credential.id}),
            ("api/companies/<str:company_id>/standards/<str:standard_id>", {"standard_id": self.a.standard.id}),
            ("api/companies/<str:company_id>/roles/<str:role_id>", {"role_id": self.a.role.id}),
            ("api/reports/<str:report_id>/findings/<str:finding_id>", {"finding_id": self.a.finding.id}),
        ]
        for route, overrides in mixed:
            path = self.path(route, self.b, **overrides)
            for method in ROUTES[route][0]:
                response = send(self.client_b, method, path, TENANT_BODIES.get((route, method)))
                with self.subTest(f"{method} {path}"):
                    self.assertAnswer(response, 404, "NOT_FOUND", f"B's parent, A's child: {method} {path}")
        self._assert_a_untouched()

    def test_lists_and_filters_never_show_another_users_rows(self):
        a = self.a
        secrets = [a.company.id, a.document.id, a.report.id, a.thread.id, a.job.id, a.call.id, a.message.id,
                   "Slapta žinutė A", "UAB A"]
        for path in ("/api/companies", "/api/companies?q=UAB", "/api/documents", f"/api/documents?companyId={a.company.id}",
                     "/api/documents/search?q=Atitikties", f"/api/documents/search?q=Atitikties&documentIds={a.document.id}",
                     f"/api/documents/search?q=Atitikties&companyId={a.company.id}", "/api/reports",
                     f"/api/reports?companyId={a.company.id}", "/api/chat/threads",
                     f"/api/chat/threads?companyId={a.company.id}", "/api/jobs", "/api/jobs?subject=matrix:A",
                     "/api/usage/calls", "/api/usage?days=7"):
            body = self.client_b.get(path).content.decode()
            for secret in secrets:
                self.assertNotIn(secret, body, f"B's {path} shows {secret}")
        self.assertEqual(self.client_b.get("/api/jobs/counts").json()["queued"], 1, "counts see own jobs only")

    def test_queries_and_bodies_naming_another_users_rows(self):
        a, b = self.a, self.b
        client = self.client_b
        self.assertAnswer(client.get(f"/api/reports/estimate?companyId={a.company.id}"), 404, "NOT_FOUND", "estimate")
        self.assertAnswer(client.get(f"/api/usage?userId={a.user.id}"), 403, "FORBIDDEN", "usage of A")
        self.assertAnswer(client.get(f"/api/usage/calls?userId={a.user.id}"), 403, "FORBIDDEN", "calls of A")
        self.assertAnswer(client.get("/api/usage?scope=all"), 403, "FORBIDDEN", "usage of all")
        self.assertAnswer(send(client, "POST", "/api/reports", {"companyId": a.company.id}), 404, "NOT_FOUND",
                          "a report on A's company")
        self.assertAnswer(send(client, "POST", "/api/chat/threads", {"companyId": a.company.id}), 404, "NOT_FOUND",
                          "a thread on A's company")
        self.assertAnswer(send(client, "PATCH", f"/api/chat/threads/{b.thread.id}", {"companyId": a.company.id}),
                          404, "NOT_FOUND", "re-homing B's thread on A's company")
        self.assertAnswer(send(client, "PATCH", f"/api/chat/threads/{b.thread.id}", {"roleId": a.role.id}),
                          404, "NOT_FOUND", "adopting A's role")
        self.assertAnswer(send(client, "PATCH", f"/api/documents/{b.document.id}", {"companyId": a.company.id}),
                          404, "NOT_FOUND", "attaching B's document to A's company")
        self.assertAnswer(send(client, "POST", f"/api/companies/{b.company.id}/credentials",
                               {"kind": "license", "name": "X", "evidenceDocumentId": a.document.id}),
                          400, "INVALID_FIELD", "A's document as B's evidence")
        upload = io.BytesIO(b"Politika")
        upload.name = "politika.txt"
        self.assertAnswer(client.post("/api/documents", {"file": upload, "companyId": a.company.id}), 404,
                          "NOT_FOUND", "an upload into A's company")
        self._assert_a_untouched()

    def test_a_foreign_message_id_is_refused_never_moved(self):
        body = dict(TENANT_BODIES[("api/chat/threads/<str:thread_id>/messages", "POST")])
        body["id"] = self.a.message.id
        body["content"] = {**body["content"], "id": self.a.message.id}
        response = send(self.client_b, "POST", f"/api/chat/threads/{self.b.thread.id}/messages", body)
        self.assertAnswer(response, 409, "MESSAGE_ID_TAKEN", "A's message id in B's thread")
        message = ChatMessage.objects.get(id=self.a.message.id)
        self.assertEqual((message.thread_id, message.content["parts"][0]["text"]), (self.a.thread.id, "Slapta žinutė A"))

    def _assert_a_untouched(self):
        a = self.a
        company = Company.objects.get(id=a.company.id)
        self.assertEqual(company.name, "UAB A")
        self.assertEqual(CompanyCredential.objects.get(id=a.credential.id).status, "claimed")
        self.assertEqual(list(CompanyStandard.objects.filter(company=a.company).values_list("id", "status", "scope")),
                         [(a.standard.id, "certified", "")])
        self.assertEqual(CompanyRole.objects.get(id=a.role.id).context, "Atsiskaito valdybai")
        self.assertEqual(CompanyDocument.objects.get(id=a.document.id).title, "Politika A")
        report = Report.objects.get(id=a.report.id)
        self.assertIsNone(report.approved_at)
        self.assertIsNone(Finding.objects.get(id=a.finding.id).override_status)
        thread = ChatThread.objects.get(id=a.thread.id)
        self.assertEqual((thread.title, thread.archived, thread.company_id), ("Pokalbis A", False, a.company.id))
        self.assertEqual(Job.objects.get(id=a.job.id).status, "queued")
        self.assertEqual(ChatMessage.objects.filter(thread=a.thread).count(), 1)








class AdminReachTests(MatrixCase):

    def test_an_admin_reads_every_owned_row_of_another_user(self):
        for route, method in self.rows(OWNED):
            if method != "GET":
                continue
            path = self.path(route, self.a) + QUERIES.get(route, "")
            response = send(self.client_admin, method, path)
            with self.subTest(f"{method} {path}"):
                self.assertEqual(response.status_code, 200, f"admin on A's row: {method} {path}")

    def test_an_admin_never_reaches_another_users_chat_thread(self):
        for route, method in self.rows(PERSONAL):
            path = self.path(route, self.a)
            response = send(self.client_admin, method, path, TENANT_BODIES.get((route, method)))
            with self.subTest(f"{method} {path}"):
                self.assertAnswer(response, 404, "NOT_FOUND", f"admin on A's thread: {method} {path}")
        listed = self.client_admin.get("/api/chat/threads").content.decode()
        self.assertNotIn(self.a.thread.id, listed)
        self.assertIn(self.own.thread.id, listed)
        self.assertEqual(ChatMessage.objects.filter(thread=self.a.thread).count(), 1)

    def test_an_admin_lists_every_company_report_document_and_job(self):
        client = self.client_admin
        for path, row in (("/api/companies", self.a.company), ("/api/reports", self.a.report),
                          ("/api/documents", self.a.document), ("/api/jobs", self.a.job),
                          ("/api/usage/calls?scope=all", self.a.call)):
            self.assertIn(row.id, client.get(path).content.decode(), path)
        # scope=own narrows an admin to their own rows (the chat
        # assistant's view)
        own = client.get("/api/companies?scope=own").content.decode()
        self.assertNotIn(self.a.company.id, own)
        self.assertIn(self.own.company.id, own)

    def test_the_usage_call_carries_the_documented_audit_transcript(self):
        # api.md: the call detail carries the chat transcript —
        # the audit of what the assistant said (user-guide §6).
        # The thread itself stays personal (above)
        call = self.client_admin.get(f"/api/usage/calls/{self.a.call.id}").json()
        self.assertEqual(call["userId"], self.a.user.id)
        self.assertEqual(call["toolCalls"][0]["name"], "getCompany")








class InternalDoorTests(MatrixCase):

    def test_the_door_refuses_every_caller_without_the_secret(self):
        callers = {
            "no secret": {},
            "wrong secret": {"HTTP_X_INTERNAL_SECRET": "wrong"},
            "prefix of the secret": {"HTTP_X_INTERNAL_SECRET": SECRET[:-1]},
            "secret plus a byte": {"HTTP_X_INTERNAL_SECRET": SECRET + "x"},
            "non-ascii": {"HTTP_X_INTERNAL_SECRET": "sekretas-ąčę"},
            "empty": {"HTTP_X_INTERNAL_SECRET": ""},
        }
        for name, headers in callers.items():
            for route, method in self.rows(INTERNAL):
                path = self.path(route, self.a)
                for client in (ApiClient(), self.client_admin):
                    response = send(client, method, path, {"user_id": self.a.user.id}, **headers)
                    with self.subTest(f"{name}: {method} {path}"):
                        self.assertAnswer(response, 403, "INTERNAL_ONLY", f"{name}: {method} {path}")

    def test_the_door_writes_only_into_the_named_users_thread(self):
        body = {"user_id": self.b.user.id, "id": "msg-forged", "parent_id": None, "format": "ai-sdk/v6",
                "content": {"id": "msg-forged", "role": "assistant", "parts": [{"type": "text", "text": "x"}]}}
        response = send(ApiClient(), "POST", f"/internal/assistant/threads/{self.a.thread.id}/messages", body,
                        HTTP_X_INTERNAL_SECRET=SECRET)
        self.assertAnswer(response, 404, "NOT_FOUND", "B's user id on A's thread")
        self.assertFalse(ChatMessage.objects.filter(id="msg-forged").exists())

    def test_the_door_titles_only_the_named_users_thread(self):
        response = send(ApiClient(), "POST", f"/internal/assistant/threads/{self.a.thread.id}/title",
                        {"user_id": self.b.user.id, "title": "Pakeista"}, HTTP_X_INTERNAL_SECRET=SECRET)
        self.assertAnswer(response, 404, "NOT_FOUND", "B's user id on A's thread")
        self.a.thread.refresh_from_db()
        self.assertNotEqual(self.a.thread.title, "Pakeista")


    def test_the_door_fails_closed_without_a_configured_secret(self):
        with self.settings(ASSISTANT_INTERNAL_SECRET=""):
            for route, method in self.rows(INTERNAL):
                response = send(ApiClient(), method, self.path(route, self.a), {}, HTTP_X_INTERNAL_SECRET="")
                self.assertAnswer(response, 403, "INTERNAL_ONLY", route)








############################################################
# AUDIT_CASES
############################################################
#
# (route, method) → a function of the test case answering
# (path, request kwargs) for a write that must SUCCEED — the
# admin-only writes, and the admin's writes on another user's
# rows (the reviewer's powers). Each must leave an AuditLog
# row naming the admin. test_every_admin_write_has_a_case
# keeps the table complete.
############################################################

def _json(body):
    return {"data": json.dumps(body), "content_type": "application/json"}


def _victim(case):
    return create_user(email=f"auka-{new_id()[:8]}@knf.vu.lt")


def _deactivated(case):
    user = _victim(case)
    user.active = False
    user.save(update_fields=["active"])
    return user


def _upload(name, data):
    handle = io.BytesIO(data)
    handle.name = name
    return {"data": {"file": handle}}


def _queued_report(case):
    now = utc_now()
    job = Job.objects.create(id=new_id(), kind="report.analyze", subject="matrix:queued", status="queued",
                             run_after=now + timedelta(days=365), created_by=case.a.user, created_at=now)
    return Report.objects.create(id=new_id(), company=case.a.company, created_by=case.a.user, job=job,
                                 status="queued", created_at=now)


def _waiting_report(case):
    now = utc_now()
    report = Report.objects.create(id=new_id(), company=case.a.company, created_by=case.a.user, status="scope_review",
                                   scope={"documentIds": [], "review": True}, created_at=now)
    ReportAct.objects.create(id=new_id(), report=report, document_title="Aktas", short_title="Aktas",
                             applicability="applies", assessment="assessed", order=1)
    return report


def _approved_product(case):
    now = utc_now()
    return WorkProduct.objects.create(id=new_id(), company=case.a.company, kind="governance", version=1,
                                      status="approved", created_by=case.a.user, created_at=now, approved_at=now)


def _queued_product(case):
    now = utc_now()
    job = Job.objects.create(id=new_id(), kind="programme.generate", subject="matrix:product", status="queued",
                             run_after=now + timedelta(days=365), created_by=case.a.user, created_at=now)
    return WorkProduct.objects.create(id=new_id(), company=case.a.company, kind="risks", version=1, status="queued",
                                      job=job, created_by=case.a.user, created_at=now)


AUDIT_CASES = {
    ("api/users", "POST"): lambda c: ("/api/users", _json(
        {"email": "naujas@knf.vu.lt", "displayName": "Naujas", "role": "user", "password": "labai-slapta-2026"})),
    ("api/users/<str:user_id>", "PATCH"): lambda c: (f"/api/users/{_victim(c).id}", _json({"displayName": "Kitas"})),
    ("api/users/<str:user_id>", "DELETE"): lambda c: (f"/api/users/{_victim(c).id}", {}),
    ("api/users/<str:user_id>/reset-password", "POST"): lambda c: (
        f"/api/users/{_victim(c).id}/reset-password", _json({"password": "nauja-slapta-2026"})),
    ("api/corpus/documents", "POST"): lambda c: ("/api/corpus/documents", _json(
        {"title": "Naujas aktas", "jurisdiction": "EU", "sourceKind": "upload"})),
    ("api/corpus/documents/<str:document_id>", "PATCH"): lambda c: (
        f"/api/corpus/documents/{c.catalogue.act.id}", _json({"title": "MiCA (pataisyta)"})),
    ("api/corpus/documents/<str:document_id>", "DELETE"): lambda c: (
        f"/api/corpus/documents/{c.catalogue.act.id}", {}),
    ("api/corpus/documents/<str:document_id>/refresh", "POST"): lambda c: (
        f"/api/corpus/documents/{c.catalogue.act.id}/refresh", _json({})),
    ("api/corpus/documents/<str:document_id>/upload", "POST"): lambda c: (
        f"/api/corpus/documents/{c.catalogue.act.id}/upload", _upload("mica.txt", b"1 straipsnis. Tekstas.")),
    ("api/corpus/documents/<str:document_id>/extract-obligations", "POST"): lambda c: (
        f"/api/corpus/documents/{c.catalogue.act.id}/extract-obligations", _json({})),
    ("api/corpus/documents/<str:document_id>/verify-obligations", "POST"): lambda c: (
        f"/api/corpus/documents/{c.catalogue.act.id}/verify-obligations", _json({})),
    ("api/corpus/reembed", "POST"): lambda c: ("/api/corpus/reembed", _json({})),
    ("api/corpus/refresh-all", "POST"): lambda c: ("/api/corpus/refresh-all", _json({})),
    ("api/obligations", "POST"): lambda c: ("/api/obligations", _json({"title": "Standartas", "text": "Tekstas"})),
    ("api/obligations/review", "POST"): lambda c: (
        "/api/obligations/review", _json({"ids": [c.catalogue.obligation.id], "status": "approved"})),
    ("api/obligations/<str:obligation_id>", "PATCH"): lambda c: (
        f"/api/obligations/{c.catalogue.obligation.id}", _json({"status": "approved"})),
    ("api/obligations/<str:obligation_id>", "DELETE"): lambda c: (
        f"/api/obligations/{c.catalogue.obligation.id}", {}),
    ("api/prompts/<str:slug>/versions", "POST"): lambda c: (
        f"/api/prompts/{c.catalogue.prompt.slug}/versions", _json({"text": "Nauja {TODAY}", "model": "gpt-5.5"})),
    ("api/prompts/<str:slug>/versions/<int:version_no>/activate", "POST"): lambda c: (
        f"/api/prompts/{c.catalogue.prompt.slug}/versions/1/activate", _json({})),
    ("api/prompts/<str:slug>/test", "POST"): lambda c: (
        f"/api/prompts/{c.catalogue.prompt.slug}/test", _json({"input": "Bandymas"})),
    ("api/mcp/servers", "POST"): lambda c: ("/api/mcp/servers", _json(
        {"name": "kitas", "url": "https://mcp.example.org/mcp"})),
    ("api/mcp/servers/<str:server_id>", "PATCH"): lambda c: (
        f"/api/mcp/servers/{c.catalogue.server.id}", _json({"description": "ES teisė"})),
    ("api/mcp/servers/<str:server_id>", "DELETE"): lambda c: (f"/api/mcp/servers/{c.catalogue.server.id}", {}),
    ("api/mcp/servers/<str:server_id>/test", "POST"): lambda c: (
        f"/api/mcp/servers/{c.catalogue.server.id}/test", _json({})),
    # The reviewer's powers over another user's rows
    ("api/companies/<str:company_id>", "PUT"): lambda c: (f"/api/companies/{c.a.company.id}", _json({"sector": "Fintech"})),
    ("api/companies/<str:company_id>", "DELETE"): lambda c: (f"/api/companies/{c.a.company.id}", {}),
    ("api/companies/<str:company_id>/credentials", "POST"): lambda c: (
        f"/api/companies/{c.a.company.id}/credentials", _json({"kind": "permit", "name": "Leidimas"})),
    ("api/companies/<str:company_id>/credentials/<str:credential_id>", "PATCH"): lambda c: (
        f"/api/companies/{c.a.company.id}/credentials/{c.a.credential.id}", _json({"status": "verified"})),
    ("api/companies/<str:company_id>/credentials/<str:credential_id>", "DELETE"): lambda c: (
        f"/api/companies/{c.a.company.id}/credentials/{c.a.credential.id}", {}),
    ("api/companies/<str:company_id>/standards", "POST"): lambda c: (
        f"/api/companies/{c.a.company.id}/standards", _json({"documentId": c.catalogue.standard.id})),
    ("api/companies/<str:company_id>/standards/<str:standard_id>", "PATCH"): lambda c: (
        f"/api/companies/{c.a.company.id}/standards/{c.a.standard.id}", _json({"status": "implementing"})),
    ("api/companies/<str:company_id>/standards/<str:standard_id>", "DELETE"): lambda c: (
        f"/api/companies/{c.a.company.id}/standards/{c.a.standard.id}", {}),
    ("api/companies/<str:company_id>/roles", "POST"): lambda c: (
        f"/api/companies/{c.a.company.id}/roles", _json({"name": "AML pareigūnas", "context": "x"})),
    ("api/companies/<str:company_id>/roles/<str:role_id>", "PATCH"): lambda c: (
        f"/api/companies/{c.a.company.id}/roles/{c.a.role.id}", _json({"context": "y"})),
    ("api/companies/<str:company_id>/roles/<str:role_id>", "DELETE"): lambda c: (
        f"/api/companies/{c.a.company.id}/roles/{c.a.role.id}", {}),
    ("api/documents/<str:document_id>", "PATCH"): lambda c: (f"/api/documents/{c.a.document.id}", _json({"kind": "policy"})),
    ("api/documents/<str:document_id>", "DELETE"): lambda c: (f"/api/documents/{c.a.document.id}", {}),
    ("api/reports/<str:report_id>", "PATCH"): lambda c: (f"/api/reports/{c.a.report.id}", _json({"approved": True})),
    ("api/reports/<str:report_id>", "DELETE"): lambda c: (f"/api/reports/{c.a.report.id}", {}),
    ("api/reports/<str:report_id>/findings/<str:finding_id>", "PATCH"): lambda c: (
        f"/api/reports/{c.a.report.id}/findings/{c.a.finding.id}", _json({"overrideStatus": "met"})),
    ("api/reports/<str:report_id>/cancel", "POST"): lambda c: (f"/api/reports/{_queued_report(c).id}/cancel", _json({})),
    ("api/reports/<str:report_id>/scope", "POST"): lambda c: (
        f"/api/reports/{_waiting_report(c).id}/scope", _json({"approved": True})),
    ("api/companies/<str:company_id>/programme", "POST"): lambda c: (
        f"/api/companies/{c.a.company.id}/programme", _json({"kind": "policy"})),
    ("api/actions/<str:action_id>", "PATCH"): lambda c: (f"/api/actions/{c.a.action.id}", _json({"owner": "Atitikties pareigūnas"})),
    ("api/programme/<str:product_id>", "PATCH"): lambda c: (f"/api/programme/{c.a.product.id}", _json({"approved": True})),
    ("api/programme/<str:product_id>", "DELETE"): lambda c: (f"/api/programme/{c.a.product.id}", {}),
    ("api/programme/<str:product_id>/content", "PUT"): lambda c: (
        f"/api/programme/{c.a.product.id}/content", _json({"content": {"title": "Pataisyta"}})),
    ("api/programme/<str:product_id>/revise", "POST"): lambda c: (
        f"/api/programme/{_approved_product(c).id}/revise", _json({})),
    ("api/programme/<str:product_id>/cancel", "POST"): lambda c: (
        f"/api/programme/{_queued_product(c).id}/cancel", _json({})),
    ("api/jobs/<str:job_id>/cancel", "POST"): lambda c: (f"/api/jobs/{c.a.job.id}/cancel", _json({})),
}








class AuditCoverageTests(MatrixCase):

    def test_every_admin_write_has_a_case(self):
        wanted = {(route, method) for route, method in self.rows(ADMIN, OWNED) if method in WRITES}
        self.assertEqual(sorted(wanted - set(AUDIT_CASES)), [], "an admin write without an audit case in AUDIT_CASES")
        self.assertEqual(sorted(set(AUDIT_CASES) - wanted), [], "AUDIT_CASES names a write ROUTES does not have")

    def test_every_admin_write_leaves_an_audit_row(self):
        for (route, method), case in AUDIT_CASES.items():
            with self.subTest(f"{method} {route}"):
                savepoint = transaction.savepoint()
                try:
                    path, kwargs = case(self)
                    before = set(AuditLog.objects.values_list("id", flat=True))
                    response = getattr(self.client_admin, method.lower())(path, **kwargs)
                    self.assertLess(response.status_code, 300, f"{method} {path}: {response.content[:300]!r}")
                    rows = AuditLog.objects.exclude(id__in=before)
                    self.assertTrue(rows.exists(), f"{method} {path} wrote no audit row")
                    self.assertTrue(all(r.user_id == self.admin_user.id for r in rows), f"{method} {path}")
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_the_purge_is_audited(self):
        victim = _deactivated(self)
        response = self.client_admin.delete(f"/api/users/{victim.id}?purge=true")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(AuditLog.objects.filter(action="users.purge", target_id=victim.id).exists())








class NoServerErrorTests(MatrixCase):

    def setUp(self):
        super().setUp()
        self.victim = create_user(email="auka@knf.vu.lt")
        self.login_user = create_user(email="prisijungimas@knf.vu.lt")
        # A client that answers a crash as the 500 it is, so
        # every failing request is listed, not the first one
        self.fuzzer = ApiClient(token=self.client_admin.token, raise_request_exception=False)

    def valid_body(self, route, method):
        # A body the route accepts from the admin on the admin's
        # own rows (non-empty wherever the view reads optional
        # fields, so the recorder sees them); None = not a JSON
        # write the fuzz can drive
        own, c = self.own, self.catalogue
        message = {"id": "msg-fuzz", "parent_id": None, "format": "ai-sdk/v6",
                   "content": {"id": "msg-fuzz", "role": "user", "parts": [{"type": "text", "text": "Labas"}]}}
        reply = {"user_id": self.admin_user.id, "id": "msg-fuzz-reply", "parent_id": None, "format": "ai-sdk/v6",
                 "content": {"id": "msg-fuzz-reply", "role": "assistant", "parts": [{"type": "text", "text": "Ats"}]}}
        return {
            ("api/auth/login", "POST"): {"email": self.login_user.email, "password": "labai-slapta-2026"},
            ("api/auth/change-password", "POST"): {"currentPassword": "labai-slapta-2026",
                                                   "newPassword": "nauja-slapta-2026"},
            ("api/users", "POST"): {"email": "fuzz@knf.vu.lt", "displayName": "Fuzz", "role": "user",
                                    "password": "labai-slapta-2026"},
            ("api/users/<str:user_id>", "PATCH"): {"displayName": "Fuzz"},
            ("api/users/<str:user_id>/reset-password", "POST"): {"password": "nauja-slapta-2026"},
            ("api/jobs/<str:job_id>/cancel", "POST"): {},
            ("api/companies", "POST"): {"name": "UAB Fuzz"},
            ("api/companies/<str:company_id>", "PUT"): {"name": "UAB Fuzz"},
            ("api/companies/<str:company_id>/credentials", "POST"): {"kind": "license", "name": "Licencija"},
            ("api/companies/<str:company_id>/credentials/<str:credential_id>", "PATCH"): {"name": "Licencija"},
            ("api/companies/<str:company_id>/standards", "POST"): {
                "documentId": c.standard.id, "status": "planned", "scope": "IT", "notes": "Pastaba",
                "certificateId": own.credential.id},
            ("api/companies/<str:company_id>/standards/<str:standard_id>", "PATCH"): {
                "status": "implementing", "scope": "IT", "notes": "Pastaba", "certificateId": own.credential.id},
            ("api/companies/<str:company_id>/roles", "POST"): {"name": "Vaidmuo", "context": "Kontekstas"},
            ("api/companies/<str:company_id>/roles/<str:role_id>", "PATCH"): {"context": "Kontekstas"},
            ("api/documents/<str:document_id>", "PATCH"): {"title": "Politika"},
            ("api/corpus/documents", "POST"): {"title": "Aktas", "jurisdiction": "EU", "sourceKind": "upload"},
            ("api/corpus/documents/<str:document_id>", "PATCH"): {"title": "Aktas"},
            ("api/corpus/documents/<str:document_id>/refresh", "POST"): {"force": False},
            ("api/corpus/documents/<str:document_id>/extract-obligations", "POST"): {"language": "lt"},
            ("api/corpus/documents/<str:document_id>/verify-obligations", "POST"): {"again": False},
            ("api/corpus/search", "POST"): {"query": "leidimas"},
            ("api/corpus/check-citations", "POST"): {"citations": [{"act": "MiCA", "article": "59",
                                                                     "claimedHeading": "Leidimas"}]},
            ("api/corpus/reembed", "POST"): {"documentId": c.act.id},
            ("api/corpus/refresh-all", "POST"): {},
            ("api/obligations", "POST"): {"title": "Standartas", "text": "Tekstas"},
            ("api/obligations/review", "POST"): {"ids": [c.obligation.id], "status": "approved"},
            ("api/obligations/<str:obligation_id>", "PATCH"): {"status": "approved"},
            ("api/reports", "POST"): {"companyId": own.company.id},
            ("api/reports/<str:report_id>", "PATCH"): {"approved": True},
            ("api/reports/<str:report_id>/cancel", "POST"): {},
            ("api/reports/<str:report_id>/scope", "POST"): {"acts": {}, "approved": False},
            ("api/companies/<str:company_id>/programme", "POST"): {"kind": "policy", "language": "lt"},
            ("api/actions/<str:action_id>", "PATCH"): {"owner": "Valdyba", "dueDate": "2027-01-31", "status": "in_progress",
                                                       "note": "Pradėta"},
            ("api/programme/<str:product_id>", "PATCH"): {"approved": True, "note": "Gerai"},
            ("api/programme/<str:product_id>/content", "PUT"): {"content": {"title": "Politika", "parts": []}},
            ("api/programme/<str:product_id>/revise", "POST"): {},
            ("api/programme/<str:product_id>/cancel", "POST"): {},
            ("api/reports/<str:report_id>/findings/<str:finding_id>", "PATCH"): {"overrideStatus": "met"},
            ("api/chat/threads", "POST"): {"title": "Pokalbis"},
            ("api/chat/threads/<str:thread_id>", "PATCH"): {"title": "Pokalbis"},
            ("api/chat/threads/<str:thread_id>/messages", "POST"): message,
            ("api/prompts/<str:slug>/versions", "POST"): {"text": "Nauja {TODAY}", "model": "gpt-5.5"},
            ("api/prompts/<str:slug>/versions/<int:version_no>/activate", "POST"): {},
            ("api/prompts/<str:slug>/test", "POST"): {"input": "Bandymas"},
            ("api/mcp/servers", "POST"): {"name": "fuzz", "url": "https://mcp.example.org/mcp"},
            ("api/mcp/servers/<str:server_id>", "PATCH"): {"description": "ES teisė"},
            ("api/mcp/servers/<str:server_id>/test", "POST"): {},
            ("internal/assistant/turn-log", "POST"): {"user_id": self.admin_user.id, "kind": "chat", "model": "m"},
            ("internal/assistant/threads/<str:thread_id>/messages", "POST"): reply,
            ("internal/assistant/threads/<str:thread_id>/title", "POST"): {"user_id": self.admin_user.id, "title": "Kriptoturto leidimas"},
        }.get((route, method))

    def json_writes(self):
        for route, (methods, _) in ROUTES.items():
            for method in methods:
                if method in ("POST", "PUT", "PATCH"):
                    yield route, method

    def request(self, route, method, body):
        extra = {"HTTP_X_INTERNAL_SECRET": SECRET} if route.startswith("internal/") else {}
        return send(self.fuzzer, method, self.path(route, self.own, user_id=self.victim.id), body, **extra)

    def fields_read(self, route, method, valid):
        # One request with the valid body behind a Recorder:
        # (the keys its view reads, whether it enumerated)
        seen = set()
        original = http_module.get_json_object

        def recording(request):
            data = original(request)
            return Recorder(data, seen) if isinstance(data, dict) else data

        modules = [m for m in list(sys.modules.values()) if getattr(m, "get_json_object", None) is original]
        with ExitStack() as stack:
            for module in modules:
                stack.enter_context(mock.patch.object(module, "get_json_object", recording))
            response = self.request(route, method, valid)
        # A state refusal (cancelling a finished report: 409) still
        # shows which fields the view read before refusing
        self.assertLess(response.status_code, 500, f"{method} /{route}: {response.content[:300]!r}")
        return {k for k in seen if isinstance(k, str)} | set(valid), WHOLE in seen

    def test_every_json_write_has_a_valid_body(self):
        skipped = {("api/auth/logout", "POST"), ("api/auth/logout-all", "POST"), ("api/documents", "POST"),
                   ("api/corpus/documents/<str:document_id>/upload", "POST")}
        missing = [(r, m) for r, m in self.json_writes() if (r, m) not in skipped and self.valid_body(r, m) is None]
        self.assertEqual(missing, [], "a write route without a valid body in NoServerErrorTests.valid_body")

    def test_one_confused_field_never_answers_5xx(self):
        crashes = []
        for route, method in self.json_writes():
            valid = self.valid_body(route, method)
            if valid is None:
                continue
            reset_rate_limits()
            read, whole = self.fields_read(route, method, valid)
            for field in sorted(read | set(FIELDS)) if whole else sorted(read):
                for value in CONFUSED if field in read else CONFUSED[:1]:
                    response = self.request(route, method, {**valid, field: value})
                    if response.status_code >= 500:
                        crashes.append(f"{method} /{route} with {field}={value!r}")
                    self.assertEqual(response["Content-Type"].split(";")[0], "application/json", route)
            self.assertEqual(self.fuzzer.get("/api/auth/me").status_code, 200, f"{method} /{route} ended the session")
        self.assertEqual(crashes, [], "5xx answers")

    def test_malformed_bodies_never_answer_5xx(self):
        crashes = []
        for route, (methods, _) in ROUTES.items():
            for method in methods:
                if method not in WRITES or route in ("api/auth/logout", "api/auth/logout-all"):
                    continue
                for body in MALFORMED:
                    if self.request(route, method, body).status_code >= 500:
                        crashes.append(f"{method} /{route} with {body[:40]}")
        self.assertEqual(crashes, [], "5xx answers")

    def test_an_unhandled_error_answers_the_bare_envelope(self):
        # A crash inside a view: the traceback goes to the log,
        # the client gets the envelope — no message, no path
        client = ApiClient(token=self.client_admin.token, raise_request_exception=False)
        boom = RuntimeError("boom at /app/compliance/secret.py with DATABASE_URL=postgres://x:y@db")
        with mock.patch("compliance.companies.api.company_views.serialize_company", side_effect=boom):
            response = client.get("/api/companies")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"error": "Internal server error", "code": "SERVER_ERROR"})

    def test_refusals_carry_no_traceback_or_path(self):
        for body in MALFORMED:
            text = send(self.client_admin, "POST", "/api/companies", body).content.decode()
            for leak in ("Traceback", "File \"", "/app/", "compliance/", "psycopg", "django."):
                self.assertNotIn(leak, text, body)
