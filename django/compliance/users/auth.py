############################################################
#  [*] Bearer-session authentication — the one token scheme
#
#  Opaque bearer sessions, NOT JWT and NOT cookies: login
#  mints 256 random bits (secrets.token_urlsafe), stores
#  their sha256 in the sessions table with a 30-day expiry
#  and hands the client the raw value — a DB or backup leak
#  never yields a usable bearer. Tokens minted before were
#  uuid4 strings (122 random bits); they resolve the same way
#  until they expire.
#  Every protected route resolves the presented token through
#  resolve_session_token, which re-loads the user on every
#  request so a deactivated account is locked out at once.
#
#  One narrow exception to "no cookies": login also puts the
#  token into the gate cookie, for the admin tools Caddy
#  gates with forward_auth (DBGate): a tool opened in the
#  browser sends cookies, never the bearer the GUI keeps in
#  its own storage. Only the gate view reads that cookie —
#  the API routes resolve the bearer header alone, so the
#  cookie opens no route to a cross-site request.
#
#  The decorators attach the resolved User to request.user.
#
#    hash_token / bearer_token         — primitives
#    hash_password / check_password    — bcrypt
#    validate_new_password(password)   — the one password policy
#    resolve_session_token(token)      — token → User | None
#    get_current_user(request)         — header → User, cached
#                                        per request
#    require_auth / require_role       — the route gates
#    mint_session(user, request)       — 30-day row + LRU trim
#    serialize_user(user)              — the public shape
#    set_gate_cookie / clear_gate_cookie — the gate cookie
#    gate_user(request)                — the gate's account
############################################################


import hashlib
import secrets
import uuid
from datetime import timedelta
from functools import wraps


from django.conf import settings


import bcrypt


from compliance.common.http import client_ip, json_error
from compliance.common.timestamps import utc_now
from compliance.users.models import Session


SESSION_DAYS = 30
SESSIONS_PER_USER = 10  # newest rows kept per user at login

# The cookie carrying the session to the admin tools' gate
# (gate_user); no API route reads it
GATE_COOKIE = "compliance_gate"

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_BYTES = 72  # bcrypt silently truncates past 72 bytes

# Burned once at import so an unknown email costs the same
# bcrypt work as a wrong password — login timing must not
# reveal whether an account exists
DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"legalops-timing-equalizer", bcrypt.gensalt())








############################################################
# hash_token
############################################################
#
# sha256 hex is what sessions.token_hash stores; the raw
# token lives only on the client.
#
# Used by:
#   - resolve_session_token, mint_session (below)
#   - api/auth_views.py — logout, change_password
############################################################

def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()








############################################################
# bearer_token
############################################################
#
# Parses "Authorization: Bearer <token>" once, scheme matched
# case-insensitively (RFC 7235); None for any other shape.
#
# Used by:
#   - get_current_user (below)
#   - api/auth_views.py — logout, change_password
############################################################

def bearer_token(request):
    scheme, _, token = request.META.get("HTTP_AUTHORIZATION", "").partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    return token or None








############################################################
# hash_password
############################################################
#
# A fresh bcrypt hash with a fresh salt.
#
# Used by:
#   - api/auth_views.py — change_password
#   - api/users_views.py — create, reset_password
#   - management/commands/create_admin.py
############################################################

def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode()








############################################################
# check_password
############################################################
#
# False, never an exception, for a malformed hash or a
# non-string password — a corrupt row is a failed login.
#
# Used by:
#   - api/auth_views.py — login (real and dummy checks),
#     change_password
############################################################

def check_password(password, password_hash):
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode())
    except (ValueError, TypeError):
        return False








############################################################
# validate_new_password
############################################################
#
# The one password policy: a minimum length and bcrypt's
# 72-byte ceiling (past which it silently truncates). Answers
# an error message or None. The operator's create_admin asks
# for no minimum: whoever runs a command on the server
# chooses the password.
#
# Used by:
#   - api/auth_views.py — change_password
#   - api/users_views.py — create, reset_password
#   - management/commands/create_admin.py
############################################################

def validate_new_password(password, min_length=PASSWORD_MIN_LENGTH):
    if not isinstance(password, str) or len(password) < min_length:
        return f"Password must be at least {min_length} characters"
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        return f"Password must be at most {PASSWORD_MAX_BYTES} bytes"
    return None








############################################################
# resolve_session_token
############################################################
#
# The RAW token → its User, or None for an unknown/expired
# token or a deactivated account. An expired row is purged
# on the spot; the user is re-loaded on every call so a
# deactivation takes effect on live sessions.
#
# Used by:
#   - get_current_user (below)
#   - tests/utils.py — signed_in clients go through it
############################################################

def resolve_session_token(token):
    row = Session.objects.select_related("user").filter(token_hash=hash_token(token)).first()
    if row is None:
        return None
    if row.expires_at <= utc_now():
        row.delete()
        return None
    if not row.user.active:
        return None
    return row.user








############################################################
# get_current_user
############################################################
#
# Header → User, resolved once per request and cached on
# the request object. None when there is no valid session.
#
# Used by:
#   - require_auth (below)
############################################################

def get_current_user(request):
    if hasattr(request, "_compliance_user"):
        return request._compliance_user
    token = bearer_token(request)
    user = resolve_session_token(token) if token else None
    request._compliance_user = user
    return user








############################################################
# require_auth
############################################################
#
#   @require_auth            — any active account
#
# Attaches request.user. A missing/invalid session is a 401
# with code AUTH_REQUIRED.
#
# Used by:
#   - require_role (below)
#   - api/auth_views.py — me, logout, logout_all,
#     change_password
#   - jobs/api/views.py — every route
############################################################

def require_auth(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        user = get_current_user(request)
        if user is None:
            return json_error("Authentication required", 401, code="AUTH_REQUIRED")
        request.user = user
        return view(request, *args, **kwargs)
    return wrapper








############################################################
# require_role
############################################################
#
#   @require_role("admin")   — the named role(s)
#
# Wraps require_auth; the wrong role is a 403 with code
# FORBIDDEN.
#
# Used by:
#   - api/users_views.py — every route
#   - audit/api/views.py — list_audit
############################################################

def require_role(*roles):
    def decorator(view):
        @wraps(view)
        @require_auth
        def wrapper(request, *args, **kwargs):
            if request.user.role not in roles:
                return json_error("Insufficient role", 403, code="FORBIDDEN")
            return view(request, *args, **kwargs)
        return wrapper
    return decorator








############################################################
# mint_session
############################################################
#
# A fresh 30-day session for the user; the raw token is
# returned ONCE. Only the newest SESSIONS_PER_USER rows are
# kept so a client that never logs out cannot grow the table.
#
# Used by:
#   - api/auth_views.py — login
#   - tests/utils.py — signed_in
############################################################

def mint_session(user, request=None):
    token = secrets.token_urlsafe(32)
    now = utc_now()
    Session.objects.create(
        id=str(uuid.uuid4()),
        user=user,
        token_hash=hash_token(token),
        expires_at=now + timedelta(days=SESSION_DAYS),
        created_at=now,
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:300] if request else None),
        ip=(client_ip(request) if request else None),
    )
    stale = list(
        Session.objects.filter(user=user).order_by("-created_at")
        .values_list("id", flat=True)[SESSIONS_PER_USER:]
    )
    if stale:
        Session.objects.filter(id__in=stale).delete()
    return token








############################################################
# serialize_user
############################################################
#
# The public camelCase shape — the whitelist of what an
# account looks like on the wire. Never the hash.
#
# Used by:
#   - api/auth_views.py — login, me
#   - api/users_views.py — every answer
############################################################

def serialize_user(user):
    return {
        "id": user.id,
        "email": user.email,
        "displayName": user.display_name,
        "role": user.role,
        "active": user.active,
        "dailyBudgetUsd": float(user.daily_budget_usd) if user.daily_budget_usd is not None else None,
        "createdAt": user.created_at,
        "lastLoginAt": user.last_login_at,
    }








############################################################
# set_gate_cookie
############################################################
#
# Puts the session token into the gate cookie of `response`
# too: HttpOnly (no script reads it), SameSite=Strict (no
# cross-site request carries it, so a gated tool cannot be
# driven from another site), for the whole origin and as
# long as the session lives; Secure outside DEBUG, as the
# outer proxy serves the site over HTTPS.
#
# Used by:
#   - api/auth_views.py — login
############################################################

def set_gate_cookie(response, token):
    response.set_cookie(GATE_COOKIE, token, max_age=SESSION_DAYS * 24 * 3600, path="/",
                        secure=not settings.DEBUG, httponly=True, samesite="Strict")
    return response








############################################################
# clear_gate_cookie
############################################################
#
# Expires the gate cookie of `response`: the session it
# carried is gone, and a script cannot remove an HttpOnly
# cookie itself.
#
# Used by:
#   - api/auth_views.py — logout, logout_all
############################################################

def clear_gate_cookie(response):
    response.delete_cookie(GATE_COOKIE, path="/", samesite="Strict")
    return response








############################################################
# gate_user
############################################################
#
# The account behind a gate request: the session of the
# bearer header when there is one, else the session of the
# gate cookie, since an admin tool opened in the browser
# sends only cookies. None when neither resolves (an
# expired session or a deactivated account counts as none).
# Only the gate view calls it; every API route resolves the
# bearer alone.
#
# Used by:
#   - api/auth_views.py — checkauth_admin
############################################################

def gate_user(request):
    token = bearer_token(request) or request.COOKIES.get(GATE_COOKIE, "").strip() or None
    return resolve_session_token(token) if token else None
