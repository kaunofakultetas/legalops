############################################################
#  [*] Tests — the MCP servers API (admin-only)
#
#  The external tool servers the chat can use: validation of
#  every field (a name, URL or header name must not smuggle a
#  trailing newline; a URL must not carry credentials), header
#  VALUES never returned — only their names, the header merge
#  where null removes one, the duplicate name, the connection
#  test through the assistant (mocked gateway) remembering
#  the tools or the error, and the admin gate.
############################################################


from unittest import mock


from django.test import TestCase


from compliance.assistant import gateway
from compliance.assistant.api import mcp_views
from compliance.assistant.models import McpServer
from compliance.chat import store
from compliance.corpus.api import views as corpus_views
from compliance.prompts.api import views as prompt_views
from compliance.tests.utils import create_admin, create_user, patch_json, post_json, signed_in


VALID = {"name": "eu_law", "url": "https://mcp.example.eu/mcp", "transport": "http",
         "headers": {"X-Api-Key": "sekretas-123"}, "allowedTools": ["search"], "description": "ES teisė"}








class McpServerTests(TestCase):

    def setUp(self):
        self.admin = signed_in(create_admin())

    def _create(self, **overrides):
        return post_json(self.admin, "/api/mcp/servers", {**VALID, **overrides})

    def test_create_starts_disabled_and_never_returns_header_values(self):
        r = self._create()
        self.assertEqual(r.status_code, 201, r.content)
        server = r.json()
        self.assertFalse(server["enabled"], "a new server starts disabled — test it first")
        self.assertEqual(server["headerNames"], ["X-Api-Key"])
        self.assertNotIn("sekretas-123", r.content.decode())
        listed = self.admin.get("/api/mcp/servers").content.decode()
        detail = self.admin.get(f"/api/mcp/servers/{server['id']}").content.decode()
        self.assertNotIn("sekretas-123", listed + detail)
        self.assertEqual(McpServer.objects.get(id=server["id"]).headers, {"X-Api-Key": "sekretas-123"})

    def test_every_field_is_validated(self):
        for bad in [{"name": "A"}, {"name": "x"}, {"name": "bad-name"}, {"name": "eu_law\n"}, {"name": ""},
                    {"url": "ftp://mcp.example.eu"}, {"url": "https://"}, {"url": "not a url"},
                    {"url": "https://user:secret@mcp.example.eu/mcp"}, {"url": "https://" + "a" * 500 + ".eu"},
                    {"transport": "grpc"}, {"headers": ["X-Api-Key"]}, {"headers": {"X-Api-Key\n": "v"}},
                    {"headers": {"X Api": "v"}}, {"headers": {"X-Api-Key": "a\r\nInjected: 1"}},
                    {"headers": {f"X-H{i}": "v" for i in range(11)}}, {"allowedTools": "search"},
                    {"allowedTools": [""]}, {"enabled": "yes"}]:
            r = self._create(**bad)
            self.assertEqual((r.status_code, r.json()["code"]), (400, "INVALID_FIELD"), bad)
        self.assertEqual(post_json(self.admin, "/api/mcp/servers", {"name": "x_y"}).json()["code"], "MISSING_FIELDS")
        self.assertFalse(McpServer.objects.exists())

    def test_patch_merges_headers_where_null_removes_one(self):
        server = self._create(headers={"X-Api-Key": "a", "X-Tenant": "b"}).json()
        r = patch_json(self.admin, f"/api/mcp/servers/{server['id']}", {"headers": {"X-Api-Key": None, "X-New": "c"}})
        self.assertEqual(r.json()["headerNames"], ["X-New", "X-Tenant"])
        self.assertEqual(McpServer.objects.get(id=server["id"]).headers, {"X-Tenant": "b", "X-New": "c"})
        r = patch_json(self.admin, f"/api/mcp/servers/{server['id']}", {"enabled": True, "url": "https://other.example.eu/mcp"})
        self.assertEqual((r.json()["enabled"], r.json()["url"]), (True, "https://other.example.eu/mcp"))
        r = patch_json(self.admin, f"/api/mcp/servers/{server['id']}", {"url": "https://u:p@other.example.eu/mcp"})
        self.assertEqual(r.status_code, 400)

    def test_a_duplicate_name_is_a_conflict(self):
        self._create()
        r = self._create()
        self.assertEqual((r.status_code, r.json()["code"]), (409, "DUPLICATE_NAME"))

    def test_the_connection_test_remembers_the_tools_or_the_error(self):
        server = self._create().json()
        url = f"/api/mcp/servers/{server['id']}/test"
        with mock.patch.object(gateway, "mcp_list_tools", return_value=[{"name": "search", "description": "Paieška"}, "junk"]) as listed:
            r = post_json(self.admin, url, {})
        self.assertEqual(r.json()["ok"], True)
        self.assertEqual(r.json()["tools"], [{"name": "search", "description": "Paieška"}])
        self.assertEqual(listed.call_args.args[0]["headers"], {"X-Api-Key": "sekretas-123"},
                         "the credentials leave Django only toward the assistant")
        failure = gateway.GatewayError(502, "MCP_UNREACHABLE", "connect ECONNREFUSED")
        with mock.patch.object(gateway, "mcp_list_tools", side_effect=failure):
            r = post_json(self.admin, url, {})
        self.assertEqual((r.status_code, r.json()["ok"], r.json()["lastError"]), (200, False, "connect ECONNREFUSED"))

    def test_delete_and_the_admin_gate(self):
        server = self._create().json()
        user = signed_in(create_user())
        self.assertEqual(user.get("/api/mcp/servers").status_code, 403)
        self.assertEqual(post_json(user, "/api/mcp/servers", VALID).status_code, 403)
        self.assertEqual(user.delete(f"/api/mcp/servers/{server['id']}").status_code, 403)
        self.assertEqual(self.admin.delete(f"/api/mcp/servers/{server['id']}").json(), {"ok": True})
        self.assertEqual(self.admin.get(f"/api/mcp/servers/{server['id']}").status_code, 404)








class ValidatorAnchorTests(TestCase):

    def test_no_input_validator_accepts_a_trailing_newline(self):
        # "$" matches before a final "\n" in Python — every input
        # validator anchors with "\Z" instead
        for pattern, valid in [(store.MESSAGE_ID, "msg-u-0001"), (prompt_views.MODEL_ID, "gateway:gpt-5.6-terra"),
                               (corpus_views.DOMAIN_TAG, "crypto"), (mcp_views.NAME, "eu_law"),
                               (mcp_views.HEADER_NAME, "X-Api-Key")]:
            self.assertIsNotNone(pattern.match(valid), pattern.pattern)
            self.assertIsNone(pattern.match(valid + "\n"), pattern.pattern)

    def test_a_model_id_names_a_model(self):
        for good in ["gateway:azure/gpt-5.5", "ollama:llama3.1:8b", "gpt-5.5", "a"]:
            self.assertIsNotNone(prompt_views.MODEL_ID.match(good), good)
        for bad in ["gateway:", "ollama:", "gpt-5:", "ollama:llama3.1:", ":gpt", ""]:
            self.assertIsNone(prompt_views.MODEL_ID.match(bad), bad)
