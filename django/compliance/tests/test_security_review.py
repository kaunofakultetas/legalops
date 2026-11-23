############################################################
#  [*] Tests — the security review (2026-09)
#
#  One regression test per finding of the review, next to
#  the checks that were found sound and are pinned so they
#  stay that way. docs/markdown/en/architecture.md "Security review
#  (2026-09)" is the prose; the authorization matrix and the
#  audit / no-5xx sweeps over every route live in
#  test_authz_matrix.py.
#
#    JsonBodyTests      — NaN / 1e999, lone surrogates, NUL,
#                         depth, the memory cap
#    InputLimitTests    — the per-route string and list caps
#    UploadTests        — sniffing vs the extension, the
#                         sandbox, the quota, stored names
#    McpUrlTests        — the MCP server URL (assistant SSRF)
#    FetcherTests       — the corpus fetcher's URL handling
#    SessionTests       — entropy, expiry, logout-all, resets
#    LoginWindowTests   — per-account and per-IP windows
#    ErrorTextTests     — no internal host in error texts
#    CitationBudgetTests — the citation check's model call
############################################################


import hmac
import io
import json
import os
import subprocess
import zipfile
from datetime import timedelta
from decimal import Decimal
from unittest import mock


import bcrypt
import requests
from django.conf import settings
from django.test import SimpleTestCase, TestCase, override_settings


from compliance.assistant import gateway
from compliance.assistant.models import LlmCall, McpServer
from compliance.audit.models import AuditLog
from compliance.common import sandbox
from compliance.common.extraction import clean_text
from compliance.common.ratelimit import reset_rate_limits
from compliance.common.timestamps import utc_now
from compliance.companies.api import document_views
from compliance.companies.models import CompanyDocument
from compliance.corpus import fetchers
from compliance.corpus.fetchers import FetchError, check_url
from compliance.corpus.models import LegalDocument, LegalDocumentVersion, LegalUnit
from compliance.jobs.models import Job
from compliance.prompts.models import Prompt
from compliance.prompts.store import add_version, seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.utils import PASSWORD, ApiClient, create_admin, create_user, patch_json, post_json, signed_in
from compliance.users.auth import hash_token
from compliance.users.models import Session


SECRET = "test-internal-secret"








############################################################
# upload / seed_act / raw_post
############################################################
#
# A multipart upload of `data` named `name`; one ingested act
# ("MiCA", article 59) the corpus routes can find; a POST of
# raw JSON text (what a hostile client sends, not what
# json.dumps would).
#
# Used by:
#   - the test cases below
############################################################

def upload(client, name, data, **fields):
    handle = io.BytesIO(data)
    handle.name = name
    return client.post("/api/documents", {"file": handle, **fields})


def seed_act():
    now = utc_now()
    act = LegalDocument.objects.create(id="act-mica", slug="mica", title="MiCA reglamentas", short_title="MiCA",
                                       jurisdiction="EU", source_kind="upload", created_at=now, updated_at=now)
    version = LegalDocumentVersion.objects.create(id="ver-mica", document=act, version_no=1, content_hash="0" * 64,
                                                  file_path="/nonexistent", status="ready", created_at=now)
    LegalDocument.objects.filter(id=act.id).update(current_version=version)
    LegalUnit.objects.create(id="unit-59", version=version, ordinal=0, unit_type="article", number="59",
                             path="59 str.", heading="Leidimas teikti kriptoturto paslaugas",
                             text="Kriptoturto paslaugų teikėjai privalo turėti leidimą.")
    act.refresh_from_db()
    return act


def raw_post(client, path, text):
    return client.post(path, data=text, content_type="application/json")








class JsonBodyTests(TestCase):

    def setUp(self):
        self.client_user = signed_in(create_user())

    def test_spelled_out_and_overflowed_infinities_are_refused(self):
        # 1e999 is valid JSON that float() turns into inf — the
        # NaN/Infinity hook never saw it
        for text in ('{"name": 1e999}', '{"name": "UAB", "employees": -1E400}', '{"name": NaN}',
                     '{"name": Infinity}', '{"name": "UAB", "attributes": {"x": [1e999]}}'):
            response = raw_post(self.client_user, "/api/companies", text)
            self.assertEqual((response.status_code, response.json()["code"]), (400, "INVALID_BODY"), text)
        self.assertEqual(raw_post(self.client_user, "/api/companies", '{"name": "UAB", "attributes": {"x": 1e308}}')
                         .status_code, 201, "a large finite number is fine")

    def test_lone_surrogates_and_nul_are_refused_in_values_and_keys(self):
        # "\ud800" is valid JSON text, but UTF-8 cannot encode it:
        # psycopg raised at the first query — a 500
        for text in ('{"name": "\\ud800"}', '{"name": "UAB", "attributes": {"\\udfff": 1}}',
                     '{"name": "UAB", "naceCodes": ["\\ud83d"]}', '{"name": "a\\u0000b"}'):
            response = raw_post(self.client_user, "/api/companies", text)
            self.assertEqual((response.status_code, response.json()["code"]), (400, "INVALID_BODY"), text)
        response = raw_post(self.client_user, "/api/companies", '{"name": "UAB \\ud83d\\ude00"}')
        self.assertEqual(response.json()["name"], "UAB 😀", "a surrogate PAIR is a real character")

    def test_the_login_survives_a_surrogate_email(self):
        response = raw_post(ApiClient(), "/api/auth/login", '{"email": "\\ud800@x.lt", "password": "x"}')
        self.assertEqual(response.status_code, 400)

    def test_nesting_is_bounded(self):
        def nested(depth):
            value = 1
            for _ in range(depth):
                value = {"a": value}
            return value
        self.assertEqual(post_json(self.client_user, "/api/companies",
                                   {"name": "UAB", "attributes": nested(40)}).json()["code"], "INVALID_BODY")
        self.assertEqual(post_json(self.client_user, "/api/companies",
                                   {"name": "UAB", "attributes": nested(10)}).status_code, 201)
        self.assertEqual(raw_post(self.client_user, "/api/companies", "[" * 100_000).json()["code"], "INVALID_BODY")

    def test_a_body_over_the_memory_cap_is_a_json_400(self):
        text = json.dumps({"name": "UAB", "activities": "x" * (settings.DATA_UPLOAD_MAX_MEMORY_SIZE + 1)})
        response = ApiClient(token=self.client_user.token, raise_request_exception=False).post(
            "/api/companies", data=text, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "BAD_REQUEST")








class InputLimitTests(TestCase):

    def setUp(self):
        self.admin = signed_in(create_admin())

    def test_a_new_account_needs_a_real_email_and_a_bounded_name(self):
        base = {"displayName": "Rasa", "role": "user", "password": "slaptas-zodis-1"}
        for email in ({"a@b": 1}, ["x@y.lt"], "be-eta", "a@", "@b.lt", "a b@c.lt", "a@b@c.lt", "x" * 250 + "@b.lt"):
            response = post_json(self.admin, "/api/users", {**base, "email": email})
            self.assertEqual(response.json()["code"], "INVALID_EMAIL", email)
        response = post_json(self.admin, "/api/users", {**base, "email": "rasa@knf.vu.lt", "displayName": "R" * 1000})
        self.assertEqual(len(response.json()["displayName"]), 200)
        self.assertEqual(post_json(self.admin, "/api/users", {**base, "email": "x@y.lt", "displayName": {"a": 1}})
                         .json()["code"], "MISSING_FIELDS")

    def test_corpus_lists_are_bounded_and_typed(self):
        act = seed_act()
        url = f"/api/corpus/documents/{act.id}"
        self.assertEqual(patch_json(self.admin, url, {"domains": [f"tag_{i}" for i in range(51)]}).status_code, 400)
        self.assertEqual(patch_json(self.admin, url, {"domains": [f"tag_{i}" for i in range(50)]}).status_code, 200)
        for applies in ([["casp"]], [{"casp": 1}], "casp", ["alien"]):
            self.assertEqual(patch_json(self.admin, url, {"appliesTo": applies}).status_code, 400, applies)

    def test_obligation_fields_are_text_and_bounded(self):
        act = seed_act()
        with fake_models():
            created = post_json(self.admin, "/api/obligations",
                                {"title": "Standartas", "text": "Tekstas", "documentId": act.id})
            self.assertEqual(created.status_code, 201)
            url = f"/api/obligations/{created.json()['id']}"
            for body in ({"title": "T" * 1001}, {"text": "x" * 20_001}, {"text": {"a": 1}}, {"notes": ["x"]},
                         {"appliesTo": [["casp"]]}, {"appliesTo": [{"a": 1}]}):
                response = patch_json(self.admin, url, body)
                self.assertEqual((response.status_code, response.json()["code"]), (400, "INVALID_FIELD"), body)
            self.assertEqual(patch_json(self.admin, url, {"notes": None, "text": "x" * 20_000}).status_code, 200)

    def test_reembed_names_a_real_act_or_none(self):
        act = seed_act()
        for bad in ({"a": 1}, ["x"], "nope", ""):
            response = post_json(self.admin, "/api/corpus/reembed", {"documentId": bad})
            self.assertEqual(response.status_code, 404, bad)
        self.assertEqual(Job.objects.filter(kind="corpus.reembed").count(), 0)
        self.assertEqual(post_json(self.admin, "/api/corpus/reembed", {"documentId": act.id}).status_code, 202)
        self.assertEqual(post_json(self.admin, "/api/corpus/reembed", {}).status_code, 202)
        self.assertEqual(sorted(str(j.payload["document_id"]) for j in Job.objects.filter(kind="corpus.reembed")),
                         sorted([act.id, "None"]))

    def test_citation_references_are_bounded(self):
        seed_act()
        user = signed_in(create_user())
        for item in ({"act": "M" * 301, "article": "59"}, {"act": "MiCA", "article": "5" * 301},
                     {"act": "MiCA", "article": "59", "claimedHeading": "h" * 301}):
            response = post_json(user, "/api/corpus/check-citations", {"citations": [item]})
            self.assertEqual(response.status_code, 400, item)

    def test_prompt_test_variables_are_bounded(self):
        now = utc_now()
        prompt = Prompt.objects.create(id="p-test", slug="t.vars", name="Vars", created_at=now, updated_at=now)
        add_version(prompt, "{A}", "gateway:azure/gpt-5.5", activate=True)
        variables = {f"V{i}": "x" for i in range(51)}
        response = post_json(self.admin, "/api/prompts/t.vars/test", {"input": "x", "variables": variables})
        self.assertEqual(response.status_code, 400)
        response = post_json(self.admin, "/api/prompts/t.vars/test", {"input": "x", "variables": {"A": "x" * 200_001}})
        self.assertEqual(response.status_code, 400)








class UploadTests(TestCase):

    def setUp(self):
        self.user = create_user()
        self.client_user = signed_in(self.user)

    def _zip(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("a.bin", b"\x00\x01binary" * 100)
        return buffer.getvalue()

    def test_binary_content_named_as_text_is_unsupported_not_garbage(self):
        # Before: stored as "done" garbage (and embedded, and paid
        # for) — or, with a NUL byte, a misleading 400
        cases = {"arch.txt": self._zip(), "photo.txt": b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" * 20,
                 "page.html": b"\x1f\x8b\x08\x00" + b"\x00" * 50, "nul.md": b"Politika\x00su NUL",
                 "old.txt": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 50}
        for name, data in cases.items():
            response = upload(self.client_user, name, data)
            self.assertEqual(response.status_code, 201, name)
            self.assertEqual((response.json()["extractionStatus"], response.json()["extractionError"]),
                             ("failed", "Unsupported file type"), name)
            self.assertEqual(CompanyDocument.objects.get(id=response.json()["id"]).text, "")

    def test_the_leading_bytes_win_over_the_name(self):
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)
        buffer = io.BytesIO()
        writer.write(buffer)
        response = upload(self.client_user, "report.txt", buffer.getvalue())
        self.assertEqual(response.json()["extractionStatus"], "empty", "read as the PDF it is")

    def test_utf16_text_and_late_control_characters(self):
        response = upload(self.client_user, "windows.txt", "Politika ąčęėįšųūž".encode("utf-16"))
        self.assertEqual(response.json()["extractionStatus"], "done")
        document = CompanyDocument.objects.get(id=response.json()["id"])
        self.assertEqual(document.text, "Politika ąčęėįšųūž")
        response = upload(self.client_user, "late.txt", b"a" * 9000 + b"\x00\x01 pabaiga")
        self.assertEqual(response.json()["extractionStatus"], "done", "a stray NUL past the sniffed head")
        self.assertTrue(CompanyDocument.objects.get(id=response.json()["id"]).text.endswith("pabaiga"))

    def test_clean_text_drops_what_no_database_text_can_hold(self):
        self.assertEqual(clean_text("a\x00b\x01c\x7fd\ud800e\udfff"), "abcde")
        self.assertEqual(clean_text("eilutė\tčia\r\nkita"), "eilutė čia\nkita")

    def test_names_never_steer_the_stored_path(self):
        directory = os.path.join(settings.UPLOAD_DIR, "documents")
        for name, ext in (("../../etc/passwd.txt", ".txt"), ("..\\..\\evil.txt", ".txt"), ("a.t xt", ""),
                          ("a.<script>", ""), ("x." + "a" * 20, ""), (".htaccess", "")):
            response = upload(self.client_user, name, b"Politika")
            self.assertEqual(response.status_code, 201, name)
            document = CompanyDocument.objects.get(id=response.json()["id"])
            self.assertEqual(document.file_path, os.path.join(directory, f"{document.id}{ext}"), name)
            self.assertTrue(os.path.exists(document.file_path))
            self.assertNotIn("/", document.title)
            self.assertNotIn("\\", document.title)

    @override_settings(UPLOAD_QUOTA_FILES=1)
    def test_the_file_quota(self):
        self.assertEqual(upload(self.client_user, "a.txt", b"Politika").status_code, 201)
        response = upload(self.client_user, "b.txt", b"Politika")
        self.assertEqual((response.status_code, response.json()["code"]), (413, "QUOTA_EXCEEDED"))

    @override_settings(UPLOAD_QUOTA_BYTES=10)
    def test_the_byte_quota(self):
        response = upload(self.client_user, "a.txt", b"Politika ilgesne nei 10 baitu")
        self.assertEqual((response.status_code, response.json()["code"]), (413, "QUOTA_EXCEEDED"))

    @override_settings(UPLOAD_QUOTA_FILES=1)
    def test_an_upload_racing_past_the_quota_is_undone(self):
        # Two concurrent uploads both pass the first check; the
        # recount after the insert undoes the one that tipped it
        self.assertEqual(upload(self.client_user, "a.txt", b"Politika").status_code, 201)
        real, calls = document_views._over_quota, []

        def first_check_misses(user, extra_files=0, extra_bytes=0):
            calls.append(extra_files)
            return False if len(calls) == 1 else real(user, extra_files, extra_bytes)

        before = set(os.listdir(os.path.join(settings.UPLOAD_DIR, "documents")))
        with mock.patch.object(document_views, "_over_quota", side_effect=first_check_misses):
            response = upload(self.client_user, "b.txt", b"Politika")
        self.assertEqual((response.status_code, response.json()["code"]), (413, "QUOTA_EXCEEDED"))
        self.assertEqual(CompanyDocument.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(set(os.listdir(os.path.join(settings.UPLOAD_DIR, "documents"))), before, "no orphan file")

    def test_a_hung_extraction_is_a_failed_document(self):
        with mock.patch.object(sandbox.subprocess, "run", side_effect=subprocess.TimeoutExpired("x", 60)):
            response = upload(self.client_user, "hang.pdf", b"%PDF-1.7 ...")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["extractionStatus"], "failed")
        self.assertIn("timed out", response.json()["extractionError"])

    def test_the_child_gets_no_secrets_and_caps_itself(self):
        seen = {}
        real_run = subprocess.run

        def spy(command, **kwargs):
            seen.update(command=command, env=kwargs["env"])
            return real_run(command, **kwargs)

        with mock.patch.object(sandbox.subprocess, "run", side_effect=spy):
            text, error = sandbox.extract_text_sandboxed(b"Politika", "a.txt", "text/plain")
        self.assertEqual((text, error), ("Politika", None))
        self.assertEqual(set(seen["env"]), {"PATH", "PYTHONPATH", "PYTHONDONTWRITEBYTECODE", "PYTHONIOENCODING"})
        self.assertEqual(seen["command"][-2:], [str(sandbox.CHILD_MEMORY_MB), str(sandbox.CHILD_CPU_S)])

    def test_the_memory_cap_holds(self):
        # 96 MB of input under a 64 MB address-space cap: the
        # child dies, the caller gets an error string
        with mock.patch.object(sandbox, "CHILD_MEMORY_MB", 64):
            text, error = sandbox.extract_text_sandboxed(b"a" * (96 * 1024 * 1024), "big.txt", "text/plain")
        self.assertEqual(text, "")
        self.assertTrue(error.startswith("Extraction failed"), error)








class McpUrlTests(TestCase):

    def setUp(self):
        self.admin = signed_in(create_admin())

    def test_only_https_to_a_public_dns_name(self):
        # The assistant connects to this URL from inside the
        # isolated network: every refused URL is a way to its
        # neighbours (django :8000, postgres, its own /internal)
        refused = [
            "http://mcp.example.eu/mcp", "http://legalops-django:8000/internal/assistant/mcp-servers",
            "https://legalops-django:8000/api/users", "https://legalops-postgres/", "https://localhost/mcp",
            "https://127.0.0.1/mcp", "https://[::1]/mcp", "https://127.1/mcp", "https://0x7f.1/mcp",
            "https://2130706433/mcp", "https://172.28.10.30/mcp", "https://169.254.169.254/latest/meta-data",
            "https://mcp.localhost/mcp", "https://mcp.internal/mcp", "https://printer.local/mcp",
            "https://mcp.example.eu:8443/mcp", "https://mcp.example.eu:0/mcp", "https://mcp.example.eu:x/mcp",
            "https://mcp.example.eu/mcp\n", "https://mcp.example.eu/ mcp", "https://u:p@mcp.example.eu/mcp",
            "ftp://mcp.example.eu/", "//mcp.example.eu/mcp", "mcp.example.eu", "https://ex ample.eu/",
            "https://müller.example/mcp",
        ]
        for url in refused:
            response = post_json(self.admin, "/api/mcp/servers", {"name": "eu_law", "url": url})
            self.assertEqual((response.status_code, response.json()["code"]), (400, "INVALID_FIELD"), url)
        for url in ("https://mcp.example.eu/mcp", "https://MCP.Example.EU:443/sse?x=1"):
            response = post_json(self.admin, "/api/mcp/servers", {"name": f"ok_{len(url)}", "url": url})
            self.assertEqual(response.status_code, 201, url)

    def test_a_row_saved_before_the_rule_is_never_used(self):
        now = utc_now()
        legacy = McpServer.objects.create(id="mcp-legacy", name="legacy", url="http://legalops-django:8000/api",
                                          enabled=True, headers={"Authorization": "Bearer x"}, created_at=now,
                                          updated_at=now)
        good = McpServer.objects.create(id="mcp-good", name="good", url="https://mcp.example.eu/mcp", enabled=True,
                                        created_at=now, updated_at=now)
        with mock.patch.object(gateway, "mcp_list_tools") as listed:
            response = post_json(self.admin, f"/api/mcp/servers/{legacy.id}/test", {})
        self.assertEqual(response.status_code, 400)
        listed.assert_not_called()
        self.assertEqual(patch_json(self.admin, f"/api/mcp/servers/{legacy.id}", {"description": "x"}).status_code,
                         400, "still enabled with the old URL")
        self.assertEqual(patch_json(self.admin, f"/api/mcp/servers/{legacy.id}", {"enabled": False}).status_code, 200)
        McpServer.objects.filter(id=legacy.id).update(enabled=True)
        served = ApiClient().get("/internal/assistant/mcp-servers", HTTP_X_INTERNAL_SECRET=SECRET).json()["servers"]
        self.assertEqual([s["id"] for s in served], [good.id])

    def test_the_connection_test_is_audited_either_way(self):
        server = post_json(self.admin, "/api/mcp/servers", {"name": "eu_law", "url": "https://mcp.example.eu/mcp"}).json()
        failure = gateway.GatewayError(502, "MCP_UNREACHABLE", "connect ECONNREFUSED")
        with mock.patch.object(gateway, "mcp_list_tools", side_effect=failure):
            post_json(self.admin, f"/api/mcp/servers/{server['id']}/test", {})
        with mock.patch.object(gateway, "mcp_list_tools", return_value=[{"name": "search"}]):
            post_json(self.admin, f"/api/mcp/servers/{server['id']}/test", {})
        outcomes = [row.details["ok"] for row in AuditLog.objects.filter(action="mcp.test").order_by("created_at")]
        self.assertEqual(outcomes, [False, True])

    def test_the_model_list_is_for_admins(self):
        with mock.patch.object(gateway, "list_models", return_value={"providers": [], "models": []}):
            self.assertEqual(signed_in(create_user()).get("/api/llm/models").status_code, 403)
            self.assertEqual(self.admin.get("/api/llm/models").status_code, 200)








class FetcherTests(SimpleTestCase):

    def _fetch(self, url, *answers):
        seen = []

        def answer(method, target, **kwargs):
            seen.append((target, kwargs))
            return answers[len(seen) - 1]

        with mock.patch.object(fetchers.requests, "request", side_effect=answer), mock.patch.object(fetchers, "_pace"):
            result = fetchers.request("GET", url)
        return result, seen

    def test_the_request_goes_to_the_host_that_was_checked(self):
        # The URL is rebuilt from the parsed, checked host, so a
        # parser disagreement between urlparse and requests
        # cannot send the request elsewhere
        from compliance.tests.test_sources import FakeResponse
        for url in ("https://evil.example\\@www.lb.lt/x", "https://WWW.LB.LT/x", "https://www.lb.lt:443/x"):
            (_, _, _, final), seen = self._fetch(url, FakeResponse(200, b"ok"))
            self.assertEqual(seen[0][0], "https://www.lb.lt/x", url)
            self.assertEqual(final, "https://www.lb.lt/x")
        # A user-info or look-alike trick goes, without its user-info,
        # to the host the parser saw — whether that host is reachable
        # is the egress allowlist's call
        for url, checked in (("https://www.lb.lt@evil.example/", "https://evil.example/"),
                             ("https://www.lb.lt.evil.example/", "https://www.lb.lt.evil.example/")):
            self.assertEqual(check_url(url), checked, url)
        with self.assertRaises(FetchError):
            check_url("https://www.lb.lt:80/")

    def test_tls_is_verified_and_redirects_are_manual(self):
        from compliance.tests.test_sources import FakeResponse
        _, seen = self._fetch("https://www.lb.lt/x", FakeResponse(200, b"ok"))
        kwargs = seen[0][1]
        self.assertNotIn("verify", kwargs, "certificate checks stay on: a rebound name cannot present one")
        self.assertIs(kwargs["allow_redirects"], False)

    def test_a_redirect_to_an_internal_service_is_refused(self):
        from compliance.tests.test_sources import FakeResponse
        for location in ("http://legalops-django:8000/internal/assistant/mcp-servers",
                         "http://legalops-assistant:3000/internal/llm/models", "https://www.lb.lt:8443/",
                         "file:///etc/passwd"):
            with self.assertRaises(FetchError, msg=location):
                self._fetch("https://www.lb.lt/x", FakeResponse(302, headers={"Location": location}))

    def test_the_body_is_size_capped(self):
        from compliance.tests.test_sources import FakeResponse
        with mock.patch.object(fetchers, "MAX_BYTES", 10):
            with self.assertRaises(FetchError):
                self._fetch("https://www.lb.lt/x", FakeResponse(200, b"x" * 11))








class SessionTests(TestCase):

    def setUp(self):
        reset_rate_limits()
        self.user = create_user()

    def _login(self, password=PASSWORD):
        return post_json(ApiClient(), "/api/auth/login", {"email": self.user.email, "password": password})

    def test_tokens_are_256_random_bits_stored_hashed_for_30_days(self):
        tokens = [self._login().json()["token"] for _ in range(3)]
        self.assertEqual(len(set(tokens)), 3)
        for token in tokens:
            self.assertRegex(token, r"^[A-Za-z0-9_-]{43}\Z")
            self.assertFalse(Session.objects.filter(token_hash=token).exists(), "never stored raw")
            row = Session.objects.get(token_hash=hash_token(token))
            self.assertEqual(row.expires_at - row.created_at, timedelta(days=30))

    def test_logout_all_includes_the_presented_session(self):
        a, b = signed_in(self.user), signed_in(self.user)
        self.assertEqual(a.post("/api/auth/logout-all").status_code, 200)
        self.assertEqual(a.get("/api/auth/me").status_code, 401)
        self.assertEqual(b.get("/api/auth/me").status_code, 401)
        self.assertEqual(Session.objects.filter(user=self.user).count(), 0)
        self.assertTrue(AuditLog.objects.filter(action="auth.logout_all", user=self.user).exists())

    def test_an_admin_reset_and_a_deactivation_end_every_session_for_good(self):
        admin = signed_in(create_admin())
        a = signed_in(self.user)
        post_json(admin, f"/api/users/{self.user.id}/reset-password", {"password": "nauja-slapta-2026"})
        self.assertEqual(a.get("/api/auth/me").status_code, 401)
        b = signed_in(self.user)
        patch_json(admin, f"/api/users/{self.user.id}", {"active": False})
        patch_json(admin, f"/api/users/{self.user.id}", {"active": True})
        self.assertEqual(b.get("/api/auth/me").status_code, 401, "re-activation does not revive old sessions")

    def test_a_wrong_current_password_is_throttled_and_audited(self):
        client = signed_in(self.user)
        for _ in range(10):
            response = post_json(client, "/api/auth/change-password",
                                 {"currentPassword": "spejimas-1234", "newPassword": "nauja-slapta-2026"})
            self.assertEqual(response.json()["code"], "WRONG_PASSWORD")
        response = post_json(client, "/api/auth/change-password",
                             {"currentPassword": PASSWORD, "newPassword": "nauja-slapta-2026"})
        self.assertEqual((response.status_code, response.json()["code"]), (429, "RATE_LIMITED"))
        self.assertTrue(response["Retry-After"])
        self.assertEqual(self._login().status_code, 429, "the account's one window")
        self.assertEqual(AuditLog.objects.filter(action="auth.change_password_failed", user=self.user).count(), 10)

    def test_every_refusal_costs_one_bcrypt_check(self):
        from compliance.users import auth
        from compliance.users.api import auth_views
        inactive = create_user(email="neaktyvus@knf.vu.lt", active=False)
        for email, password in ((self.user.email, "neteisingas-1"), ("niekas@knf.vu.lt", PASSWORD),
                                (inactive.email, PASSWORD)):
            with mock.patch.object(auth_views, "check_password", wraps=auth.check_password) as check:
                response = post_json(ApiClient(), "/api/auth/login", {"email": email, "password": password})
            self.assertEqual((response.status_code, check.call_count), (401, 1), email)

    def test_the_internal_secret_is_compared_in_constant_time(self):
        with mock.patch.object(hmac, "compare_digest", wraps=hmac.compare_digest) as compare:
            response = ApiClient().get("/internal/assistant/budget", HTTP_X_INTERNAL_SECRET="wrong")
        self.assertEqual(response.status_code, 403)
        compare.assert_called_once()








class LoginWindowTests(TestCase):

    def setUp(self):
        reset_rate_limits()
        self.user = create_user(email="tomas@knf.vu.lt")
        # The unknown-email path pays the dummy bcrypt; a cheap
        # one keeps these tests fast (the cost equality is
        # SessionTests' concern)
        from compliance.users.api import auth_views
        patcher = mock.patch.object(auth_views, "DUMMY_PASSWORD_HASH", bcrypt.hashpw(b"x", bcrypt.gensalt(rounds=4)))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_account_window_holds_across_case_folded_spellings(self):
        # Postgres UPPER() folds "ſ" (long s) to S, so every
        # spelling below signs in as tomas@… — a window keyed on
        # the typed text gave each its own ten attempts
        spellings = ["tomas@knf.vu.lt", "tomaſ@knf.vu.lt", "TOMAS@KNF.VU.LT", "ToMaſ@knf.vu.lt"]
        for n in range(10):
            response = post_json(ApiClient(), "/api/auth/login", {"email": spellings[n % 4], "password": "neteisingas-1"})
            self.assertEqual(response.status_code, 401)
        for email in spellings:
            response = post_json(ApiClient(), "/api/auth/login", {"email": email, "password": PASSWORD})
            self.assertEqual((response.status_code, response.json()["code"]), (429, "RATE_LIMITED"), email)

    def test_an_unknown_email_has_its_own_window(self):
        for _ in range(11):
            post_json(ApiClient(), "/api/auth/login", {"email": "niekas@knf.vu.lt", "password": "x"})
        response = post_json(ApiClient(), "/api/auth/login", {"email": self.user.email, "password": PASSWORD})
        self.assertEqual(response.status_code, 200)

    @override_settings(LOGIN_RATE_PER_IP=3)
    def test_the_ip_window_follows_the_address_the_endpoint_resolved(self):
        for n in range(3):
            post_json(ApiClient(), "/api/auth/login", {"email": f"u{n}@x.lt", "password": "x"}, HTTP_X_REAL_IP="10.1.1.1")
        blocked = post_json(ApiClient(), "/api/auth/login", {"email": "u9@x.lt", "password": "x"}, HTTP_X_REAL_IP="10.1.1.1")
        other = post_json(ApiClient(), "/api/auth/login", {"email": "u9@x.lt", "password": "x"}, HTTP_X_REAL_IP="10.2.2.2")
        self.assertEqual((blocked.status_code, other.status_code), (429, 401))








class ErrorTextTests(TestCase):

    def test_transport_failures_never_name_internal_hosts(self):
        text = ("HTTPConnectionPool(host='legalops-assistant', port=3000): Max retries exceeded with url: "
                "/internal/llm/generate (Caused by NewConnectionError('Connection refused'))")
        for exc in (requests.ConnectionError(text), requests.ReadTimeout(text)):
            with mock.patch.object(requests, "post", side_effect=exc), \
                    mock.patch("compliance.assistant.gateway.time.sleep"):
                with self.assertRaises(gateway.GatewayError) as caught:
                    gateway.generate("x", retries=0)
            for leak in ("legalops-assistant", "3000", "/internal/", "HTTPConnectionPool"):
                self.assertNotIn(leak, str(caught.exception))

    def test_a_prompt_test_run_answers_the_words_not_the_transport(self):
        now = utc_now()
        prompt = Prompt.objects.create(id="p-err", slug="t.err", name="Err", created_at=now, updated_at=now)
        add_version(prompt, "Instrukcija", "gateway:azure/gpt-5.5", activate=True)
        text = "HTTPConnectionPool(host='legalops-assistant', port=3000): /internal/llm/generate"
        with mock.patch.object(requests, "post", side_effect=requests.ConnectionError(text)):
            response = post_json(signed_in(create_admin()), "/api/prompts/t.err/test", {"input": "x"})
        self.assertEqual((response.status_code, response.json()["code"]), (502, "MODEL_ERROR"))
        self.assertNotIn("legalops-assistant", response.json()["error"])
        self.assertTrue(AuditLog.objects.filter(action="prompts.test", details__ok=False).exists())








class CitationBudgetTests(TestCase):

    def setUp(self):
        seed_defaults()
        seed_act()
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.body = {"citations": [{"act": "MiCA", "article": "59", "claimedHeading": "Leidimas"}]}

    def test_the_model_judges_while_the_budget_lasts(self):
        with fake_models() as model:
            response = post_json(self.client_user, "/api/corpus/check-citations", self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([name for name, _ in model.calls], ["verdicts"])

    def test_a_spent_budget_falls_back_to_the_word_overlap(self):
        self.user.daily_budget_usd = Decimal("0.01")
        self.user.save(update_fields=["daily_budget_usd"])
        LlmCall.objects.create(id="spent", kind="chat", user=self.user, model="m", cost_usd=Decimal("0.02"),
                               created_at=utc_now())
        with fake_models() as model:
            response = post_json(self.client_user, "/api/corpus/check-citations", self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(model.calls, [], "no model call past the budget")
        self.assertEqual(response.json()["results"][0]["headingMatch"], "match", "the word overlap judged")
