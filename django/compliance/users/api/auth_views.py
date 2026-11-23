############################################################
#  [*] Auth API — login, the caller's profile, logout
#
#    POST /api/auth/login            {email, password} → {token, user}
#    GET  /api/auth/me               → user
#    GET  /api/auth/checkauth/admin  → the admin tools' gate (Caddy)
#    POST /api/auth/logout           → kill the presented session
#    POST /api/auth/logout-all       → kill every session
#    POST /api/auth/change-password  {currentPassword, newPassword}
#
#  Login is rate-limited per client IP and per account
#  (the change-password check counts in the same account
#  window) and timing-equalized with a dummy bcrypt check so
#  an unknown email costs the same as a wrong password. There
#  is NO self-registration: admins create accounts
#  (users_views.py). Login also sets the gate cookie, which
#  the two logouts expire (users/auth.py).
############################################################


from django.conf import settings


from compliance.audit.log import audit
from compliance.common.http import client_ip, get_json_object, json_error, json_response, methods
from compliance.common.ratelimit import check_rate_limit
from compliance.common.timestamps import utc_now
from compliance.users.auth import (
    DUMMY_PASSWORD_HASH, bearer_token, check_password, clear_gate_cookie, gate_user, hash_password, hash_token,
    mint_session, require_auth, serialize_user, set_gate_cookie, validate_new_password,
)
from compliance.users.models import Session, User


# Per client IP: settings.LOGIN_RATE_PER_IP attempts per
# window. Generous on purpose: when the proxies in front lose
# the real client address, a whole classroom shares one IP
# (see docs/markdown/en/operations.md) — the per-account window below is
# the brute-force guard
LOGIN_WINDOW_S = 60
EMAIL_LIMIT = 10           # attempts per account per window —
EMAIL_WINDOW_S = 600       # a botnet rotating IPs still stalls








############################################################
# account_window
############################################################
#
#   account_window(user, "tomas@knf.vu.lt") → seconds to wait, or 0
#
# The per-account window every password check counts in —
# login and the change-password check share it, so a stolen
# bearer cannot guess the password beside the login limit.
# The key is the ACCOUNT the email resolved to, not the typed
# text: email__iexact compares with Postgres UPPER(), which
# folds "ı" and "ſ" to I and S, so "admın@…" signs in as
# "admin@…" — a key on the typed string would give every
# such spelling a fresh window. An unknown email keys on
# itself (there is no account to protect).
#
# Used by:
#   - login, change_password (below)
############################################################

def account_window(user, email=None):
    key = f"login-account:id:{user.id}" if user is not None else f"login-account:email:{email}"
    return check_rate_limit(key, EMAIL_LIMIT, EMAIL_WINDOW_S)








############################################################
# too_many_attempts
############################################################
#
# The 429 with its Retry-After.
#
# Used by:
#   - login, change_password (below)
############################################################

def too_many_attempts(retry_after):
    response = json_error("Too many login attempts", 429, code="RATE_LIMITED")
    response["Retry-After"] = str(retry_after)
    return response








############################################################
# login
############################################################
#
# POST /api/auth/login
#
# Email is matched case-insensitively. The three refusals
# (unknown email, wrong password, deactivated account) share
# one 401 and one bcrypt cost, so the answer never says which
# it was — the audit row does (auth.login_failed; the typed
# email is not stored, it may be a mistyped password). A
# successful login stamps last_login_at, writes the audit
# row with the user passed explicitly — the request carries
# no session yet — and sets the gate cookie with the same
# token, for the admin tools behind Caddy's gate. Two
# windows gate it: per IP and per account (account_window,
# above).
#
# Used by:
#   - Login.jsx — the sign-in form (raw axios)
############################################################

@methods("POST")
def login(request):
    # STEP 1: the per-IP window, before any work
    # ==========================================
    retry_after = check_rate_limit(f"login:{client_ip(request)}", settings.LOGIN_RATE_PER_IP, LOGIN_WINDOW_S)
    if retry_after:
        return too_many_attempts(retry_after)


    # STEP 2: the body
    # ================
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    email, password = data.get("email"), data.get("password")
    if not isinstance(email, str) or not email.strip() or not isinstance(password, str) or not password:
        return json_error("email and password are required", 400, code="MISSING_FIELDS")
    email = email.strip().lower()[:254]
    user = User.objects.filter(email__iexact=email).first()
    retry_after = account_window(user, email)
    if retry_after:
        return too_many_attempts(retry_after)


    # STEP 3: the check — same bcrypt cost on every path
    # ==================================================
    if user is None or not user.active:
        check_password(password, DUMMY_PASSWORD_HASH.decode())
        audit(request, "auth.login_failed", "user", user.id if user else None,
              {"reason": "inactive" if user else "unknown_email"}, user=user)
        return json_error("Invalid email or password", 401, code="INVALID_CREDENTIALS")
    if not check_password(password, user.password_hash):
        audit(request, "auth.login_failed", "user", user.id, {"reason": "wrong_password"}, user=user)
        return json_error("Invalid email or password", 401, code="INVALID_CREDENTIALS")


    # STEP 4: the session
    # ===================
    token = mint_session(user, request)
    user.last_login_at = utc_now()
    user.save(update_fields=["last_login_at"])
    audit(request, "auth.login", "user", user.id, user=user)
    return set_gate_cookie(json_response({"token": token, "user": serialize_user(user)}), token)








############################################################
# me
############################################################
#
# GET /api/auth/me
#
# The caller's own profile — the session check the GUI runs
# on every app start (AuthGuard.jsx).
#
# Used by:
#   - AuthGuard.jsx — the session query
#   - assistant/app/services/identity.js — bearer → user
############################################################

@methods("GET")
@require_auth
def me(request):
    return json_response(serialize_user(request.user))








############################################################
# checkauth_admin
############################################################
#
# GET /api/auth/checkauth/admin
#
# The admin gate Caddy's forward_auth asks before it passes
# a request on to an admin tool (DBGate at /dbgate/): 200
# with the caller's profile for an active admin, 401
# AUTH_REQUIRED without a valid session, 403 FORBIDDEN for
# any other role — Caddy hands a refusal back as it is. The
# session counts from the bearer header or, as a tool opened
# in the browser sends only cookies, from the gate cookie
# login set (users/auth.py gate_user). Nothing is written per
# call: the gate answers every request a tool's page makes.
#
# Used by:
#   - Caddy (endpoint/Caddyfile) — forward_auth of /dbgate/*
############################################################

@methods("GET")
def checkauth_admin(request):
    user = gate_user(request)
    if user is None:
        return json_error("Authentication required", 401, code="AUTH_REQUIRED")
    if user.role != "admin":
        return json_error("Insufficient role", 403, code="FORBIDDEN")
    return json_response(serialize_user(user))








############################################################
# logout
############################################################
#
# POST /api/auth/logout
#
# Kills the presented session only — other devices stay
# signed in — and expires this browser's gate cookie.
#
# Used by:
#   - Navbar.jsx — the account menu
############################################################

@methods("POST")
@require_auth
def logout(request):
    Session.objects.filter(token_hash=hash_token(bearer_token(request))).delete()
    return clear_gate_cookie(json_response({"ok": True}))








############################################################
# logout_all
############################################################
#
# POST /api/auth/logout-all
#
# Kills every session of the caller, the presented one
# included, and expires this browser's gate cookie — audited,
# because it is the "I think my token leaked" button.
#
# Used by:
#   - Account.jsx — "log out everywhere"
############################################################

@methods("POST")
@require_auth
def logout_all(request):
    Session.objects.filter(user=request.user).delete()
    audit(request, "auth.logout_all", "user", request.user.id)
    return clear_gate_cookie(json_response({"ok": True}))








############################################################
# change_password
############################################################
#
# POST /api/auth/change-password
#
# Rotates the hash and kills every OTHER session, so a
# stolen token dies the moment the owner changes the
# password; the presented session survives. The current-
# password check counts in the account's login window and a
# wrong one is audited: without that, a stolen bearer could
# guess the password here at bcrypt speed, change it and
# lock the owner out.
#
# Used by:
#   - Account.jsx — the password form
############################################################

@methods("POST")
@require_auth
def change_password(request):
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    current = data.get("currentPassword")
    new = data.get("newPassword")
    retry_after = account_window(request.user)
    if retry_after:
        return too_many_attempts(retry_after)
    if not isinstance(current, str) or not check_password(current, request.user.password_hash):
        audit(request, "auth.change_password_failed", "user", request.user.id)
        return json_error("Current password is wrong", 400, code="WRONG_PASSWORD")
    error = validate_new_password(new)
    if error:
        return json_error(error, 400, code="WEAK_PASSWORD")

    request.user.password_hash = hash_password(new)
    request.user.updated_at = utc_now()
    request.user.save(update_fields=["password_hash", "updated_at"])
    Session.objects.filter(user=request.user).exclude(token_hash=hash_token(bearer_token(request))).delete()
    audit(request, "auth.change_password", "user", request.user.id)
    return json_response({"ok": True})
