############################################################
#  [*] Request/response helpers — JSON in, JSON out
#
#  The primitives every api view leans on. Backend errors
#  are one envelope, {"error": prose, "code"?: slug}: the
#  GUI branches on the machine `code` and shows the prose.
#  Datetimes serialise as plain isoformat() — the aware wire
#  shape ends "+00:00".
#
#    get_json_object(request)           — body → dict | None
#    json_response(payload, status)     — JsonResponse, our encoder
#    json_safe(value)                   — the same encoding, as plain
#                                         JSON data (for JSONFields)
#    json_error(message, status, code)  — the error envelope
#    methods("GET", "POST")             — JSON-405 method gate
#    client_ip(request)                 — the rate-limit identity
#    strict_bool / bounded_int / str_id — typed field readers
#    query_int(request, name, default, low, high)
#                                       — a bounded ?name= integer
#    bad_request / forbidden / not_found / server_error
#                                       — JSON handler400/403/404/500
############################################################


import json
import math
import re
from datetime import date, datetime
from decimal import Decimal
from functools import wraps


from django.http import JsonResponse

# Nesting deeper than this is refused before it can exhaust
# the recursion limit anywhere downstream
MAX_JSON_DEPTH = 32

# Characters no database text can hold: NUL (Postgres TEXT
# refuses it) and the lone UTF-16 surrogates a JSON "\ud800"
# escape decodes to (UTF-8 cannot encode them — psycopg
# would raise at the first query, a 500)
UNSTORABLE = re.compile("[\x00\ud800-\udfff]")








############################################################
# _StampEncoder
############################################################
#
# isoformat() verbatim — Django's stock encoder would
# rewrite the "+00:00" offset to "Z" and change the wire;
# Decimals (costs) serialise as numbers.
#
# Used by:
#   - json_response (below)
############################################################

class _StampEncoder(json.JSONEncoder):

    def default(self, o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)








############################################################
# _refuse_constant
############################################################
#
# json.loads hook: NaN / Infinity are not JSON and must never
# reach the database or a float column.
#
# Used by:
#   - get_json_object (below)
############################################################

def _refuse_constant(name):
    raise ValueError(f"{name} is not allowed")








############################################################
# _finite_float
############################################################
#
# json.loads hook for every number with a fraction or an
# exponent: 1e999 is valid JSON text that float() turns into
# inf — the Infinity parse_constant never sees.
#
# Used by:
#   - get_json_object (below)
############################################################

def _finite_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise ValueError(f"{text[:20]} is out of range")
    return value








############################################################
# _clean_tree
############################################################
#
# True when the parsed body is acceptable: no UNSTORABLE
# character in any key or string and no nesting deeper than
# MAX_JSON_DEPTH.
#
# Used by:
#   - get_json_object (below)
############################################################

def _clean_tree(value, depth=0):
    if depth > MAX_JSON_DEPTH:
        return False
    if isinstance(value, str):
        return UNSTORABLE.search(value) is None
    if isinstance(value, dict):
        return all(_clean_tree(k, depth + 1) and _clean_tree(v, depth + 1) for k, v in value.items())
    if isinstance(value, list):
        return all(_clean_tree(v, depth + 1) for v in value)
    return True








############################################################
# get_json_object
############################################################
#
# The body as a dict, or None for anything else: bad JSON,
# an array or bare value, NaN/Infinity (spelled out or
# overflowed, 1e999), NUL characters or lone surrogates, or
# absurd nesting. Handlers treat None as "body missing" and
# answer their usual 400 instead of crashing.
#
# Used by:
#   - every POST/PATCH/PUT view
############################################################

def get_json_object(request):
    try:
        data = json.loads(request.body, parse_constant=_refuse_constant, parse_float=_finite_float)
    except (ValueError, UnicodeDecodeError, RecursionError):
        return None
    if not isinstance(data, dict) or not _clean_tree(data):
        return None
    return data








############################################################
# json_safe
############################################################
#
#   json_safe({"at": datetime(...)}) → {"at": "2026-09-27T…+00:00"}
#
# A wire payload as plain JSON data — what a JSONField can
# store (a serialized row snapshot carries datetimes, dates
# and Decimals the database adapter refuses).
#
# Used by:
#   - analysis/pipeline.py — the report's profile snapshot
############################################################

def json_safe(value):
    return json.loads(json.dumps(value, cls=_StampEncoder))








############################################################
# json_response
############################################################
#
# JsonResponse without key sorting (serializer dicts keep
# their shape), UTF-8 kept literal, our datetime encoding;
# safe=False so a top-level list (the chat history rows) is
# allowed too.
#
# Used by:
#   - every view, directly or through json_error
############################################################

def json_response(payload, status=200):
    return JsonResponse(payload, status=status, encoder=_StampEncoder, safe=False,
                        json_dumps_params={"ensure_ascii": False})








############################################################
# json_error
############################################################
#
# The app-wide error body {"error": prose, "code"?: slug}.
#
# Used by:
#   - every view, users/auth.py, the JSON handlers (below)
############################################################

def json_error(message, status, code=None):
    body = {"error": message}
    if code is not None:
        body["code"] = code
    return json_response(body, status=status)








############################################################
# methods
############################################################
#
#   @methods("GET", "POST")
#
# Django's require_http_methods answers an empty HTML 405;
# this answers the JSON envelope with an Allow header.
#
# Used by:
#   - every api view
############################################################

def methods(*allowed):
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if request.method not in allowed:
                response = json_error(f"Method {request.method} not allowed", 405, code="METHOD_NOT_ALLOWED")
                response["Allow"] = ", ".join(allowed)
                return response
            return view(request, *args, **kwargs)
        return wrapper
    return decorator








############################################################
# client_ip
############################################################
#
# The rate-limit and audit identity: the X-Real-IP header,
# else the peer address. The ingress sets that header to the
# X-Forwarded-For it received (endpoint/Caddyfile), so it is
# what the proxy in front of the endpoint — or a client that
# reaches the endpoint directly — put there; when none came,
# every visitor is the endpoint's own address. The assistant
# container forwards the header on the calls it makes for a
# user.
#
# Used by:
#   - users/api/auth_views.py — the login windows
#   - users/auth.py — mint_session
#   - audit/log.py — every row
############################################################

def client_ip(request):
    real = request.META.get("HTTP_X_REAL_IP", "").strip()
    if real and len(real) <= 64:
        return real
    return request.META.get("REMOTE_ADDR") or "unknown"








############################################################
# strict_bool
############################################################
#
# A JSON boolean or None when the value is anything else —
# bool("false") is True, which is how "usesAi": "false"
# would silently become yes.
#
# Used by:
#   - companies/api/company_views.py, users/api/users_views.py,
#     corpus/api/views.py
############################################################

def strict_bool(value):
    return value if isinstance(value, bool) else None








############################################################
# bounded_int
############################################################
#
#   bounded_int(40, 0, 10_000_000) → 40
#   bounded_int("40", 0, 10)       → None   (strings refused)
#   bounded_int(3e9, 0, 10)        → None   (out of range)
#
# An integer within [low, high], else None (the caller
# answers 400). Floats with a fraction are refused.
#
# Used by:
#   - companies/api/company_views.py, prompts/api/views.py
############################################################

def bounded_int(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()):
        return None
    value = int(value)
    return value if low <= value <= high else None








############################################################
# str_id
############################################################
#
#   str_id("c9f3…")      → "c9f3…"
#   str_id({"$ne": 1})   → None
#   str_id("x" * 500)    → None
#
# A client-supplied row id, or None when it cannot be one:
# only a non-empty string of at most 64 characters may reach
# a primary-key lookup (a dict or list would otherwise reach
# the database adapter and end in a 500).
#
# Used by:
#   - every view that resolves an id from a body or query
############################################################

def str_id(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if 0 < len(value) <= 64 else None








############################################################
# query_int
############################################################
#
#   query_int(request, "limit", 50, 1, 500) → 50 when absent,
#   the value when a whole number in range, else None
#
# Used by:
#   - every view with paging or window parameters
############################################################

def query_int(request, name, default, low, high):
    raw = request.GET.get(name)
    if raw is None or raw == "":
        return default
    raw = raw.strip()
    if not raw.lstrip("-").isdigit() or len(raw) > 12:
        return None
    value = int(raw)
    return value if low <= value <= high else None








############################################################
# bad_request
############################################################
#
# handler400: the JSON envelope instead of Django's HTML page
# (DEBUG is off in production).
#
# Used by:
#   - urls.py
############################################################

def bad_request(request, exception=None):
    return json_error("Bad request", 400, code="BAD_REQUEST")








############################################################
# forbidden
############################################################
#
# handler403, the same envelope.
#
# Used by:
#   - urls.py
############################################################

def forbidden(request, exception=None):
    return json_error("Forbidden", 403, code="FORBIDDEN")








############################################################
# not_found
############################################################
#
# handler404 — every unknown route answers the envelope.
#
# Used by:
#   - urls.py
############################################################

def not_found(request, exception=None):
    return json_error("Not found", 404, code="NOT_FOUND")








############################################################
# server_error
############################################################
#
# handler500 — the traceback goes to the log only, never to
# the client.
#
# Used by:
#   - urls.py
############################################################

def server_error(request):
    return json_error("Internal server error", 500, code="SERVER_ERROR")
