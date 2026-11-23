############################################################
#  [*] MCP servers API — external tool servers, admin-only
#
#    GET    /api/mcp/servers                 → {servers}
#    POST   /api/mcp/servers                 {name, url, transport?, headers?, allowedTools?, description?, enabled?}
#    GET    /api/mcp/servers/{id}
#    PATCH  /api/mcp/servers/{id}            any subset of the same
#    DELETE /api/mcp/servers/{id}
#    POST   /api/mcp/servers/{id}/test       → connect, list tools, remember them
#    GET    /api/llm/models                  → the models the gateway offers (with prices)
#
#  An MCP server plugs an external corpus (e.g. an EU
#  compliance MCP) into the chat: the assistant loads the
#  ENABLED servers per turn and offers their (allowed) tools
#  to the model. Header VALUES are credentials — they are
#  never returned (only the names), and they leave Django only
#  through the internal door. The server's host must also be
#  on the egress allowlist (exit/Caddyfile + extra_hosts),
#  otherwise the test fails with a connection error. The URL
#  itself must be https to a public DNS name (url_problem):
#  the assistant's container sits next to every internal
#  service, so an admin-set URL is an SSRF door otherwise.
############################################################


import re
import uuid
from urllib.parse import urlparse


from django.db import IntegrityError, transaction


from compliance.assistant import gateway
from compliance.assistant.models import MCP_TRANSPORTS, McpServer
from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods
from compliance.common.timestamps import utc_now
from compliance.users.auth import require_role


NAME = re.compile(r"^[a-z][a-z0-9_]{1,30}\Z")
HEADER_NAME = re.compile(r"^[A-Za-z0-9-]{1,64}\Z")
MAX_HEADERS = 10

# A dotted DNS name whose last label starts with a letter —
# no IP literal in any spelling ("127.1", "0x7f.1"), no
# single-label container name ("legalops-django")
PUBLIC_HOST = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]\Z")
PRIVATE_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".lan", ".home.arpa")








############################################################
# url_problem
############################################################
#
#   url_problem("https://mcp.example.eu/mcp")     → None
#   url_problem("http://legalops-django:8000/") → "url must …"
#
# Why an admin-set URL is still checked: the ASSISTANT
# connects to it, and its container shares the isolated
# network with django, postgres and its own /internal door —
# the egress allowlist guards only the way out, not these
# neighbours. So the URL must name a public TLS endpoint:
# https on the standard port (the exit passes nothing else,
# so nothing that could work is refused), a public DNS name,
# no credentials, no whitespace or control characters. The
# assistant then verifies the certificate against that name,
# which no container here can present.
#
# Used by:
#   - _apply, test (below)
#   - assistant/api/internal_views.py — mcp_servers
############################################################

def url_problem(url):
    if not isinstance(url, str) or len(url) > 500 or any(c.isspace() or ord(c) < 32 for c in url):
        return "url must be an https:// URL of at most 500 characters"
    parsed = urlparse(url)
    try:
        port = parsed.port
    except ValueError:
        return "url must be an https:// URL on the standard port"
    if parsed.scheme != "https" or not parsed.hostname or port not in (None, 443):
        return "url must be an https:// URL on the standard port"
    if parsed.username or parsed.password:
        return "url must not carry credentials — put them in a header"
    host = parsed.hostname.lower()
    if not PUBLIC_HOST.match(host) or host.endswith(PRIVATE_SUFFIXES):
        return "url must name a public host (a DNS name — not an address, a container or a local name)"
    return None








############################################################
# serialize_server
############################################################
#
# Header names only — the values are secrets.
#
# Used by:
#   - every route in this file
############################################################

def serialize_server(row):
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "url": row.url,
        "transport": row.transport,
        "headerNames": sorted((row.headers or {}).keys()),
        "allowedTools": row.allowed_tools,
        "enabled": row.enabled,
        "tools": row.tools,
        "lastCheckedAt": row.last_checked_at,
        "lastError": row.last_error,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }








############################################################
# _apply
############################################################
#
# Copies the accepted fields; answers an error message or
# None. URLs pass url_problem (above) — https to a public
# host, without user:password (the URL is shown to every
# admin — secrets go in the headers, whose values never
# leave Django but through the internal door); a server is
# enabled only with such a URL (rows saved before the rule
# included). Headers merge — a null value removes that
# header, so the GUI can change one secret without
# re-typing the others.
#
# Used by:
#   - servers_collection, server_item (below)
############################################################

def _apply(row, data):
    if "name" in data:
        if not isinstance(data["name"], str) or not NAME.match(data["name"]):
            return "name must be 2–31 characters: lowercase letters, digits, underscore"
        row.name = data["name"]
    if "description" in data:
        if not isinstance(data["description"], str):
            return "description must be text"
        row.description = data["description"][:1000]
    if "url" in data:
        problem = url_problem(data["url"])
        if problem:
            return problem
        row.url = data["url"]
    if "transport" in data:
        if data["transport"] not in MCP_TRANSPORTS:
            return f"transport must be one of {', '.join(MCP_TRANSPORTS)}"
        row.transport = data["transport"]
    if "headers" in data:
        headers = data["headers"] or {}
        if not isinstance(headers, dict):
            return "headers must be an object"
        merged = dict(row.headers or {})
        for key, value in headers.items():
            if not HEADER_NAME.match(key) or (value is not None and (not isinstance(value, str) or len(value) > 4000
                                                                     or "\n" in value or "\r" in value)):
                return f"header {key!r} is not valid"
            if value is None:
                merged.pop(key, None)
            else:
                merged[key] = value
        if len(merged) > MAX_HEADERS:
            return f"at most {MAX_HEADERS} headers"
        row.headers = merged
    if "allowedTools" in data:
        tools = data["allowedTools"] or []
        if not isinstance(tools, list) or len(tools) > 200 or not all(
                isinstance(t, str) and 0 < len(t) <= 100 for t in tools):
            return "allowedTools must be a list of tool names"
        row.allowed_tools = tools
    if "enabled" in data:
        if not isinstance(data["enabled"], bool):
            return "enabled must be true or false"
        row.enabled = data["enabled"]
    if row.enabled and url_problem(row.url):
        return url_problem(row.url)
    return None








############################################################
# _save
############################################################
#
# A duplicate name answers 409 without breaking the request
# transaction.
#
# Used by:
#   - servers_collection, server_item (below)
############################################################

def _save(row):
    try:
        with transaction.atomic():
            row.save()
    except IntegrityError:
        return json_error("An MCP server with that name exists", 409, code="DUPLICATE_NAME")
    return None








############################################################
# servers_collection
############################################################
#
# GET  /api/mcp/servers
# POST /api/mcp/servers
#
# A new server starts disabled — test it, then enable it.
#
# Used by:
#   - McpServers.jsx
############################################################

@methods("GET", "POST")
@require_role("admin")
def servers_collection(request):
    if request.method == "GET":
        return json_response({"servers": [serialize_server(r) for r in McpServer.objects.order_by("name")]})
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    if "name" not in data or "url" not in data:
        return json_error("name and url are required", 400, code="MISSING_FIELDS")
    now = utc_now()
    row = McpServer(id=str(uuid.uuid4()), created_by=request.user, created_at=now, updated_at=now)
    error = _apply(row, {**data, "enabled": data.get("enabled", False)})
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    conflict = _save(row)
    if conflict:
        return conflict
    audit(request, "mcp.create", "mcp_server", row.id, {"name": row.name, "url": row.url})
    return json_response(serialize_server(row), status=201)








############################################################
# server_item
############################################################
#
# GET    /api/mcp/servers/{id}
# PATCH  /api/mcp/servers/{id}
# DELETE /api/mcp/servers/{id}
#
# Used by:
#   - McpServers.jsx
############################################################

@methods("GET", "PATCH", "DELETE")
@require_role("admin")
def server_item(request, server_id):
    row = McpServer.objects.filter(id=server_id).first()
    if row is None:
        return json_error("MCP server not found", 404, code="NOT_FOUND")
    if request.method == "GET":
        return json_response(serialize_server(row))
    if request.method == "DELETE":
        row.delete()
        audit(request, "mcp.delete", "mcp_server", server_id, {"name": row.name})
        return json_response({"ok": True})
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    error = _apply(row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    row.updated_at = utc_now()
    conflict = _save(row)
    if conflict:
        return conflict
    audit(request, "mcp.update", "mcp_server", row.id,
          {"fields": sorted(data), "enabled": row.enabled, "headerNames": sorted(row.headers)})
    return json_response(serialize_server(row))








############################################################
# test
############################################################
#
# POST /api/mcp/servers/{id}/test
#
# The assistant connects and lists the tools; the listing (or
# the error) is remembered on the row, and both outcomes are
# audited. A row whose URL fails url_problem (saved before
# the rule) is never handed to the assistant. Outside the
# request transaction — a slow server must not hold one open.
#
# Used by:
#   - McpServers.jsx — the test button
############################################################

@transaction.non_atomic_requests
@methods("POST")
@require_role("admin")
def test(request, server_id):
    row = McpServer.objects.filter(id=server_id).first()
    if row is None:
        return json_error("MCP server not found", 404, code="NOT_FOUND")
    problem = url_problem(row.url)
    if problem:
        return json_error(problem, 400, code="INVALID_FIELD")
    try:
        tools = gateway.mcp_list_tools({"url": row.url, "transport": row.transport, "headers": row.headers})
    except gateway.GatewayError as exc:
        McpServer.objects.filter(id=row.id).update(last_checked_at=utc_now(), last_error=exc.message[:1000])
        row.refresh_from_db()
        audit(request, "mcp.test", "mcp_server", row.id, {"ok": False, "code": exc.code})
        return json_response({**serialize_server(row), "ok": False}, status=200)
    listing = [{"name": str(t.get("name"))[:100], "description": str(t.get("description") or "")[:500]}
               for t in tools if isinstance(t, dict) and t.get("name")][:200]
    McpServer.objects.filter(id=row.id).update(tools=listing, last_checked_at=utc_now(), last_error=None)
    row.refresh_from_db()
    audit(request, "mcp.test", "mcp_server", row.id, {"ok": True, "tools": len(listing)})
    return json_response({**serialize_server(row), "ok": True})








############################################################
# llm_models
############################################################
#
# GET /api/llm/models
#
# The models the assistant can reach (id, context size, USD
# prices) — the prompt editor's model picker, so admin-only
# like the rest of the prompt store (api.md lists it there);
# every call reaches the assistant.
#
# Used by:
#   - PromptEditorForm.jsx
############################################################

@methods("GET")
@require_role("admin")
def llm_models(request):
    return json_response(gateway.list_models(timeout=15))
