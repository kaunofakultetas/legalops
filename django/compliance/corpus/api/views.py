############################################################
#  [*] Corpus API — the indexed legal acts
#
#    GET    /api/corpus/documents                  ?q=&jurisdiction=&docType=&domain= → {documents}
#    POST   /api/corpus/documents                  {title, jurisdiction, …} (admin)
#    GET    /api/corpus/documents/{id}             → document + versions + latest job
#    PATCH  /api/corpus/documents/{id}             metadata / enabled (admin)
#    DELETE /api/corpus/documents/{id}             (admin)
#    POST   /api/corpus/documents/{id}/refresh     {force?} → ingest job (admin)
#    POST   /api/corpus/documents/{id}/upload      multipart file → new version + job (admin)
#    GET    /api/corpus/documents/{id}/units       ?type=&offset=&limit= → the provision list
#    GET    /api/corpus/units/{id}                 → one provision in full
#    GET    /api/corpus/provision                  ?document=&article=&paragraph= (or &clause=) → exact text
#    POST   /api/corpus/search                     {query, k?, documents?, jurisdiction?, kind?} → hits
#    POST   /api/corpus/check-citations            {citations: [{act, article, paragraph?, point?, claimedHeading?}]}
#    POST   /api/corpus/reembed                    {documentId?} → job (admin)
#    POST   /api/corpus/refresh-all                → job (admin)
#
#  Reading is open to every signed-in user (it is public law,
#  and the standards are the organisation's licensed copies);
#  writing is admin-only and audited. Ingestion always runs in
#  the worker — these routes only queue it. A standard is a
#  document like any other (doc_type "standard", usually
#  jurisdiction INTL), uploaded and read by its clauses.
############################################################


import hashlib
import os
import re
import shutil
import uuid


from django.conf import settings
from django.db import IntegrityError
from django.db.models import Count


from compliance.assistant.usage import budget_status
from compliance.audit.log import audit
from compliance.common.http import bounded_int, get_json_object, json_error, json_response, methods, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.models import INSTITUTION_TYPES
from compliance.corpus.ingest import next_version_no, store_raw
from compliance.corpus.links import citation_url
from compliance.corpus.models import (
    DOC_STATUSES, DOC_TYPES, JURISDICTIONS, SOURCE_KINDS, LegalDocument, LegalDocumentVersion, LegalUnit,
)
from compliance.corpus.citations import MAX_ITEMS as MAX_CITATIONS, check_references
from compliance.corpus.fetchers import FetchError, check_url
from compliance.corpus.outline import METHODS
from compliance.corpus.search import KINDS, find_provision, search_corpus
from compliance.corpus.serializers import serialize_document, serialize_unit
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue, serialize_job
from compliance.users.auth import require_auth, require_role


MAX_UPLOAD_BYTES = 60 * 1024 * 1024
APPLIES_TO = set(INSTITUTION_TYPES) | {"all"}
DOMAIN_TAG = re.compile(r"^[a-z][a-z0-9_]{1,39}\Z")
MAX_DOMAINS = 50

# A claimed citation's act, article, paragraph, point and
# heading: a reference, never a document
MAX_CITATION_FIELD_CHARS = 300








############################################################
# slugify
############################################################
#
# "Mokėjimo įstaigų įstatymas" → "mokejimo-istaigu-istatymas"
# (Lithuanian letters folded to ASCII, 80 chars max).
#
# Used by:
#   - _unique_slug (below)
############################################################

def slugify(value):
    folded = str(value or "").lower().translate(str.maketrans("ąčęėįšųūž", "aceeisuuz"))
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")[:80] or "act"








############################################################
# _unique_slug
############################################################
#
# The slug, suffixed -2, -3… until free.
#
# Used by:
#   - documents_collection (below)
############################################################

def _unique_slug(base):
    slug, n = base, 2
    while LegalDocument.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug








############################################################
# _apply_fields
############################################################
#
# Validated wire fields → the document row; answers an error
# message or None. `creating` requires title + jurisdiction.
#
# Used by:
#   - documents_collection, document_item (below)
############################################################

def _apply_fields(document, data, creating=False):
    text_fields = {"title": "title", "titleEn": "title_en", "shortTitle": "short_title", "externalId": "external_id",
                   "sourceUrl": "source_url", "applicabilityNotes": "applicability_notes"}
    for wire, column in text_fields.items():
        if wire in data:
            if data[wire] is not None and not isinstance(data[wire], str):
                return f"{wire} must be text"
            value = (data[wire] or "").strip()
            if wire == "title" and not value:
                return "title cannot be empty"
            if wire == "sourceUrl" and value and not value.startswith("https://"):
                return "sourceUrl must be an https:// URL"
            setattr(document, column, value[:2000])
    if creating and not document.title:
        return "title is required"
    choices = {"jurisdiction": ("jurisdiction", JURISDICTIONS), "docType": ("doc_type", DOC_TYPES),
               "sourceKind": ("source_kind", SOURCE_KINDS), "status": ("status", DOC_STATUSES)}
    for wire, (column, allowed) in choices.items():
        if wire in data:
            if data[wire] not in allowed:
                return f"{wire} must be one of {', '.join(allowed)}"
            setattr(document, column, data[wire])
    if creating and document.jurisdiction not in JURISDICTIONS:
        return f"jurisdiction is required ({', '.join(JURISDICTIONS)})"
    if "language" in data:
        if data["language"] not in ("lt", "en"):
            return "language must be lt or en"
        document.language = data["language"]
    if "domains" in data:
        domains = data["domains"]
        if not isinstance(domains, list) or len(domains) > MAX_DOMAINS \
                or not all(isinstance(d, str) and DOMAIN_TAG.match(d) for d in domains):
            return f"domains must be a list of at most {MAX_DOMAINS} lowercase tags"
        document.domains = sorted(set(domains))
    if "appliesTo" in data:
        applies = data["appliesTo"]
        # Strings first: set() of a nested list or object raises
        # TypeError (a 500), not a refusal
        if not isinstance(applies, list) or not all(isinstance(a, str) for a in applies) \
                or not set(applies) <= APPLIES_TO:
            return f"appliesTo must be a list of: {', '.join(sorted(APPLIES_TO))}"
        document.applies_to = sorted(set(applies))
    if "enabled" in data:
        if not isinstance(data["enabled"], bool):
            return "enabled must be true or false"
        document.enabled = data["enabled"]
    if document.source_kind in ("url", "lb"):
        if not document.source_url:
            return f"sourceUrl is required for sourceKind {document.source_kind}"
        try:
            check_url(document.source_url)
        except FetchError as exc:
            return str(exc)
        if document.source_kind == "lb" and "://www.lb.lt/" not in document.source_url + "/":
            return "sourceUrl must be a www.lb.lt address for sourceKind lb"
    if document.source_kind in ("cellar", "etar", "eseimas") and not document.external_id:
        return f"externalId is required for sourceKind {document.source_kind}"
    return None








############################################################
# _latest_job
############################################################
#
# The job the act's page should know about: the ingestion or
# the obligation extraction that is queued or running now —
# so the page can say the act is being worked on, and that
# its obligations are not there yet because they are being
# read — or, when nothing is, the most recent of either.
#
# Used by:
#   - document_item, refresh, upload_version (below)
############################################################

def _latest_job(document_id):
    jobs = Job.objects.filter(subject__in=(f"corpus:{document_id}", f"obligations:{document_id}")).order_by("-created_at")
    return jobs.filter(status__in=("queued", "running")).first() or jobs.first()








############################################################
# documents_collection
############################################################
#
# GET  /api/corpus/documents?q=&jurisdiction=&docType=&domain=
# POST /api/corpus/documents
#
# A created fetchable act queues its first ingest at once; an
# upload-kind act waits for its file.
#
# Used by:
#   - Corpus.jsx — the table and the add dialog
#   - the assistant's listLegalActs tool
############################################################

@methods("GET", "POST")
@require_auth
def documents_collection(request):
    if request.method == "GET":
        rows = (LegalDocument.objects.select_related("current_version").defer("current_version__text")
                .order_by("jurisdiction", "short_title", "title", "id"))
        if request.user.role != "admin":
            rows = rows.filter(enabled=True)
        if request.GET.get("jurisdiction") in JURISDICTIONS:
            rows = rows.filter(jurisdiction=request.GET["jurisdiction"])
        if request.GET.get("docType") in DOC_TYPES:
            rows = rows.filter(doc_type=request.GET["docType"])
        if request.GET.get("domain"):
            rows = rows.filter(domains__contains=[request.GET["domain"]])
        if request.GET.get("q"):
            q = request.GET["q"].strip()
            rows = rows.filter(title__icontains=q) | rows.filter(short_title__icontains=q) | rows.filter(slug__icontains=q)
        counts = dict(LegalDocument.objects.annotate(n=Count("obligations")).values_list("id", "n")) \
            if _has_obligations() else {}
        return json_response({"documents": [serialize_document(d, obligation_count=counts.get(d.id)) for d in rows]})

    if request.user.role != "admin":
        return json_error("Insufficient role", 403, code="FORBIDDEN")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    now = utc_now()
    document = LegalDocument(id=str(uuid.uuid4()), created_by=request.user, created_at=now, updated_at=now,
                             source_kind="upload", jurisdiction="")
    error = _apply_fields(document, data, creating=True)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    document.slug = _unique_slug(slugify(data.get("slug") or document.short_title or document.title))
    try:
        document.save()
    except IntegrityError:
        return json_error("A document with this slug already exists", 409, code="SLUG_TAKEN")
    job = None
    if document.source_kind != "upload":
        job = enqueue("corpus.ingest", {"document_id": document.id}, subject=f"corpus:{document.id}",
                      created_by=request.user)
    audit(request, "corpus.create", "legal_document", document.id, {"slug": document.slug, "source": document.source_kind})
    return json_response(serialize_document(document, latest_job=job), status=201)








############################################################
# _has_obligations
############################################################
#
# True once the obligations relation exists (the app that
# adds it may be absent in a partial deployment).
#
# Used by:
#   - documents_collection (above)
############################################################

def _has_obligations():
    return any(f.name == "obligations" for f in LegalDocument._meta.get_fields())








############################################################
# document_item
############################################################
#
# GET    /api/corpus/documents/{id}
# PATCH  /api/corpus/documents/{id}
# DELETE /api/corpus/documents/{id}
#
# DELETE removes every version, unit, chunk and stored file.
#
# Used by:
#   - CorpusDocument.jsx
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def document_item(request, document_id):
    document = (LegalDocument.objects.select_related("current_version").defer("current_version__text")
                .filter(id=document_id).first())
    if document is None or (not document.enabled and request.user.role != "admin"):
        return json_error("Document not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        count = document.obligations.count() if _has_obligations() else None
        return json_response(serialize_document(document, with_versions=True, latest_job=_latest_job(document.id),
                                                obligation_count=count))

    if request.user.role != "admin":
        return json_error("Insufficient role", 403, code="FORBIDDEN")

    if request.method == "DELETE":
        shutil.rmtree(os.path.join(settings.UPLOAD_DIR, "corpus", document.id), ignore_errors=True)
        document.delete()
        audit(request, "corpus.delete", "legal_document", document_id, {"slug": document.slug})
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    error = _apply_fields(document, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    document.updated_at = utc_now()
    document.save()
    audit(request, "corpus.update", "legal_document", document.id, {"fields": sorted(data.keys())})
    return json_response(serialize_document(document))








############################################################
# refresh
############################################################
#
# POST /api/corpus/documents/{id}/refresh  {force?, structure?}
#
# Queues a fetch-and-ingest; `force` re-processes even an
# unchanged text (after a parser improvement). An upload-kind
# act re-processes its current file. `structure` says how a
# standard's structure is read this time — one of
# corpus/outline.py METHODS — when the automatic choice did
# not suit the document.
#
# Used by:
#   - Corpus.jsx, CorpusDocument.jsx — the refresh buttons
############################################################

@methods("POST")
@require_role("admin")
def refresh(request, document_id):
    document = LegalDocument.objects.filter(id=document_id).first()
    if document is None:
        return json_error("Document not found", 404, code="NOT_FOUND")
    data = get_json_object(request) or {}
    payload = {"document_id": document.id, "force": bool(data.get("force"))}
    if data.get("structure") is not None:
        if document.doc_type != "standard" or data["structure"] not in METHODS:
            return json_error(f"structure is one of {', '.join(METHODS)}, for a standard", 400, code="INVALID_FIELD")
        payload["structure"] = data["structure"]
    if document.source_kind == "upload":
        if document.current_version_id is None:
            return json_error("Upload a file first", 409, code="NO_FILE")
        payload["version_id"] = document.current_version_id
    active = Job.objects.filter(subject=f"corpus:{document.id}", status__in=("queued", "running")).first()
    if active is not None:
        return json_response(serialize_job(active), status=202)
    job = enqueue("corpus.ingest", payload, subject=f"corpus:{document.id}", created_by=request.user)
    audit(request, "corpus.refresh", "legal_document", document.id,
          {"force": payload["force"], **({"structure": payload["structure"]} if "structure" in payload else {})})
    return json_response(serialize_job(job), status=202)








############################################################
# upload_version
############################################################
#
# POST /api/corpus/documents/{id}/upload   multipart: file
#
# Stores the bytes as a new pending version and queues its
# ingest. Identical bytes to the current version are refused.
#
# Used by:
#   - CorpusDocument.jsx — the upload button
############################################################

@methods("POST")
@require_role("admin")
def upload_version(request, document_id):
    document = (LegalDocument.objects.select_related("current_version").defer("current_version__text")
                .filter(id=document_id).first())
    if document is None:
        return json_error("Document not found", 404, code="NOT_FOUND")
    upload = request.FILES.get("file")
    if upload is None:
        return json_error("multipart field 'file' is required", 400, code="MISSING_FILE")
    if upload.size > MAX_UPLOAD_BYTES:
        return json_error("File too large", 413, code="FILE_TOO_LARGE")
    raw = upload.read()
    digest = hashlib.sha256(raw).hexdigest()
    if document.current_version and document.current_version.content_hash == digest:
        return json_error("This file is identical to the current version", 409, code="UNCHANGED")
    version_id = str(uuid.uuid4())
    version = LegalDocumentVersion.objects.create(
        id=version_id, document=document, version_no=next_version_no(document), content_hash=digest,
        file_path=store_raw(document, version_id, raw, upload.name, upload.content_type),
        content_type=upload.content_type or "", source_url="", status="pending", created_by=request.user,
        created_at=utc_now(),
    )
    job = enqueue("corpus.ingest", {"document_id": document.id, "version_id": version.id},
                  subject=f"corpus:{document.id}", created_by=request.user)
    audit(request, "corpus.upload", "legal_document", document.id, {"version": version.version_no, "bytes": len(raw)})
    return json_response(serialize_job(job), status=202)








############################################################
# document_units
############################################################
#
# GET /api/corpus/documents/{id}/units?type=article&offset=0&limit=200
#
# The provisions of the current (or ?version=) version in
# document order with trimmed texts — the structure browser.
#
# Used by:
#   - CorpusDocument.jsx — the structure tab
############################################################

@methods("GET")
@require_auth
def document_units(request, document_id):
    document = LegalDocument.objects.filter(id=document_id).first()
    if document is None or (not document.enabled and request.user.role != "admin"):
        return json_error("Document not found", 404, code="NOT_FOUND")
    version_id = request.GET.get("version") or document.current_version_id
    if version_id is None:
        return json_response({"units": [], "total": 0})
    try:
        offset = max(0, int(request.GET.get("offset", 0)))
        limit = max(1, min(int(request.GET.get("limit", 200)), 1000))
    except ValueError:
        return json_error("offset and limit must be integers", 400, code="INVALID_QUERY")
    rows = LegalUnit.objects.filter(version_id=version_id, version__document=document).order_by("ordinal")
    if request.GET.get("type"):
        rows = rows.filter(unit_type__in=request.GET["type"].split(","))
    if request.GET.get("q"):
        rows = rows.filter(text__icontains=request.GET["q"][:200])
    total = rows.count()
    return json_response({"units": [serialize_unit(u, preview=True) for u in rows[offset:offset + limit]],
                          "total": total, "offset": offset, "limit": limit})








############################################################
# unit_item
############################################################
#
# GET /api/corpus/units/{id}
#
# The provision in full, with its act, its version and the
# link to the official text (citation_url: the EUR-Lex
# article anchor for EU acts, the source page otherwise).
#
# Used by:
#   - CorpusDocument.jsx, UnitViewer.jsx, the report's
#     citation links
############################################################

@methods("GET")
@require_auth
def unit_item(request, unit_id):
    unit = LegalUnit.objects.select_related("version__document").filter(id=unit_id).first()
    if unit is None or (not unit.version.document.enabled and request.user.role != "admin"):
        return json_error("Provision not found", 404, code="NOT_FOUND")
    document = unit.version.document
    data = serialize_unit(unit)
    data.update({"documentId": document.id, "documentTitle": document.title,
                 "shortTitle": document.short_title, "sourceUrl": document.source_url,
                 "versionNo": unit.version.version_no, "isCurrent": unit.version_id == document.current_version_id,
                 "citationUrl": citation_url(document, unit)})
    return json_response(data)








############################################################
# provision
############################################################
#
# GET /api/corpus/provision?document=&article=&paragraph=
#
# The exact text of one provision (corpus/search.py
# find_provision). A standard's clause may come as `clause`
# instead of `article`.
#
# Used by:
#   - the assistant's getLegalProvision tool
############################################################

@methods("GET")
@require_auth
def provision(request):
    found = find_provision(request.GET.get("document"),
                           request.GET.get("article") or request.GET.get("clause") or "",
                           paragraph=request.GET.get("paragraph") or None,
                           unit_type=request.GET.get("type") or None)
    if found is None:
        return json_error("No such provision in the corpus", 404, code="NOT_FOUND")
    return json_response(found)








############################################################
# search
############################################################
#
# POST /api/corpus/search  {query, k?, documents?, jurisdiction?, kind?}
#
# `kind` keeps the acts or the standards only.
#
# Used by:
#   - the assistant's searchLegalCorpus tool
#   - Corpus.jsx — the retrieval test box
############################################################

@methods("POST")
@require_auth
def search(request):
    data = get_json_object(request)
    if data is None or not isinstance(data.get("query"), str) or not data["query"].strip():
        return json_error("query is required", 400, code="MISSING_FIELDS")
    documents = data.get("documents")
    if documents is not None and (not isinstance(documents, list) or len(documents) > 50
                                  or not all(isinstance(d, str) and 0 < len(d) <= 100 for d in documents)):
        return json_error("documents must be a list of ids, slugs or short titles", 400, code="INVALID_FIELD")
    k = bounded_int(data.get("k", 8), 1, 30)
    if k is None:
        return json_error("k must be an integer from 1 to 30", 400, code="INVALID_FIELD")
    jurisdiction = data.get("jurisdiction")
    if jurisdiction is not None and jurisdiction not in JURISDICTIONS:
        return json_error(f"jurisdiction must be one of {', '.join(JURISDICTIONS)}", 400, code="INVALID_FIELD")
    kind = data.get("kind")
    if kind is not None and kind not in KINDS:
        return json_error(f"kind must be one of {', '.join(KINDS)}", 400, code="INVALID_FIELD")
    hits = search_corpus(data["query"][:2000], k=k, documents=documents, jurisdiction=jurisdiction, kind=kind)
    return json_response({"hits": hits})








############################################################
# citations
############################################################
#
# POST /api/corpus/check-citations
#      {citations: [{act, article, paragraph?, point?, claimedHeading?}]}
#
# One verdict per citation (corpus/citations.py): whether the
# unit exists in the act's current version, its real heading
# and opening text with a deep link, and — when the claimant
# said what it is about — whether that matches (one small
# model call, counted against the caller's budget; once
# today's budget is spent, the word overlap judges instead of
# the model — the check itself never stops). What stops a
# model (or a policy author) from confirming a wrong article.
#
# Used by:
#   - the assistant's checkCitations tool
#   - Corpus.jsx — the citation checker
############################################################

@methods("POST")
@require_auth
def citations(request):
    data = get_json_object(request)
    items = data.get("citations") if data else None
    if not isinstance(items, list) or not 0 < len(items) <= MAX_CITATIONS:
        return json_error(f"citations must be a list of 1..{MAX_CITATIONS} items", 400, code="INVALID_FIELD")
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("act"), str) or not item.get("article") \
                or not all(isinstance(item.get(k), (str, int, type(None))) for k in ("article", "paragraph", "point")) \
                or not isinstance(item.get("claimedHeading") or "", str) \
                or any(len(str(item.get(k) or "")) > MAX_CITATION_FIELD_CHARS
                       for k in ("act", "article", "paragraph", "point", "claimedHeading")):
            return json_error("each citation needs act (text) and article; paragraph, point and claimedHeading "
                              f"are optional (each at most {MAX_CITATION_FIELD_CHARS} characters)", 400,
                              code="INVALID_FIELD")
    budget = budget_status(request.user.id)
    spent = budget["remaining"] is not None and budget["remaining"] <= 0
    return json_response({"results": check_references(items, user_id=request.user.id, use_model=not spent)})








############################################################
# reembed
############################################################
#
# POST /api/corpus/reembed  {documentId?}
#
# Used by:
#   - Corpus.jsx — after the embedding model changed
############################################################

@methods("POST")
@require_role("admin")
def reembed(request):
    data = get_json_object(request) or {}
    # An absent / null documentId means every act; anything
    # else must name one — the worker would otherwise fail the
    # job on an object or list id
    document_id = data.get("documentId")
    if document_id is not None:
        document_id = str_id(document_id)
        if document_id is None or not LegalDocument.objects.filter(id=document_id).exists():
            return json_error("Document not found", 404, code="NOT_FOUND")
    job = enqueue("corpus.reembed", {"document_id": document_id}, subject="corpus:reembed",
                  created_by=request.user)
    audit(request, "corpus.reembed", "legal_document", document_id or "all")
    return json_response(serialize_job(job), status=202)








############################################################
# refresh_all
############################################################
#
# POST /api/corpus/refresh-all
#
# Used by:
#   - Corpus.jsx — "check all sources"
############################################################

@methods("POST")
@require_role("admin")
def refresh_all(request):
    job = enqueue("corpus.refresh_all", {}, subject="corpus:refresh-all", created_by=request.user)
    audit(request, "corpus.refresh_all", "legal_document", "all")
    return json_response(serialize_job(job), status=202)
