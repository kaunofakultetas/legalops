############################################################
#  [*] Users API — the admin's account directory
#
#    GET    /api/users                      → {users: [user]}
#    POST   /api/users                      {email, displayName, role, password}
#    GET    /api/users/{id}
#    PATCH  /api/users/{id}                 {displayName?, role?, active?, dailyBudgetUsd?}
#    DELETE /api/users/{id}                 → deactivate
#    DELETE /api/users/{id}?purge=true      → delete the account with its data
#    POST   /api/users/{id}/reset-password  {password}
#
#  Continuity guard: the last active admin can neither be
#  demoted, deactivated nor deleted, and an admin cannot do
#  any of it to THEMSELVES — the console must always keep one
#  door. Every mutation writes an audit row.
############################################################


import re
import uuid


from compliance.audit.log import audit
from decimal import Decimal


from compliance.common.http import get_json_object, json_error, json_response, json_safe, methods
from compliance.common.timestamps import utc_now
from compliance.users.auth import hash_password, require_role, serialize_user, validate_new_password
from compliance.users.models import ROLES, Session, User
from compliance.users.purge import analysis_running, owned_data, purge_account


# One "@" between a non-empty mailbox and domain, no
# whitespace, at most the RFC 5321 path length — the login
# form and the audit trail show it verbatim
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\Z")
MAX_EMAIL_CHARS = 254
MAX_NAME_CHARS = 200








############################################################
# _load
############################################################
#
# The user row by id, or None — every per-id route starts
# here and answers the same 404.
#
# Used by:
#   - user_item, reset_password (below)
############################################################

def _load(user_id):
    return User.objects.filter(id=user_id).first()








############################################################
# _would_remove_last_admin
############################################################
#
# True when the proposed role/active change would leave the
# installation with no active admin — the continuity guard
# both PATCH and DELETE consult before writing.
#
# Used by:
#   - user_item (below)
############################################################

def _would_remove_last_admin(user, new_role=None, new_active=None):
    if user.role != "admin" or not user.active:
        return False
    loses_admin = (new_role is not None and new_role != "admin") or (new_active is False)
    if not loses_admin:
        return False
    return not User.objects.filter(role="admin", active=True).exclude(id=user.id).exists()








############################################################
# users_collection
############################################################
#
# GET  /api/users
# POST /api/users
#
# The whole directory (deactivated rows included, oldest
# first), and account creation: email normalised to lower
# case and refused when taken in any casing, the password
# through the one policy, the role through the CHECK list.
#
# Used by:
#   - Users.jsx — the table and the create dialog
############################################################

@methods("GET", "POST")
@require_role("admin")
def users_collection(request):
    if request.method == "GET":
        rows = User.objects.order_by("created_at", "id")
        return json_response({"users": [serialize_user(u) for u in rows]})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    email = data.get("email").strip().lower() if isinstance(data.get("email"), str) else ""
    display_name = data.get("displayName").strip() if isinstance(data.get("displayName"), str) else ""
    role = data.get("role") or "user"
    password = data.get("password")
    if len(email) > MAX_EMAIL_CHARS or not EMAIL.match(email):
        return json_error("A valid email is required", 400, code="INVALID_EMAIL")
    if not display_name:
        return json_error("displayName is required", 400, code="MISSING_FIELDS")
    display_name = display_name[:MAX_NAME_CHARS]
    if role not in ROLES:
        return json_error("Unknown role", 400, code="INVALID_ROLE")
    error = validate_new_password(password)
    if error:
        return json_error(error, 400, code="WEAK_PASSWORD")
    if User.objects.filter(email__iexact=email).exists():
        return json_error("An account with this email already exists", 409, code="EMAIL_TAKEN")

    now = utc_now()
    user = User.objects.create(
        id=str(uuid.uuid4()), email=email, display_name=display_name,
        password_hash=hash_password(password), role=role, active=True,
        created_at=now, updated_at=now,
    )
    audit(request, "users.create", "user", user.id, {"email": email, "role": role})
    return json_response(serialize_user(user), status=201)








############################################################
# user_item
############################################################
#
# GET    /api/users/{id}
# PATCH  /api/users/{id}
# DELETE /api/users/{id}
#
# DELETE deactivates (the rows stay) and kills the
# account's sessions. DELETE ?purge=true deletes the account
# for good together with what it owns (users/purge.py) —
# never the admin's own account or the last active admin,
# and not while one of its companies has an analysis at
# work; it answers what it removed. PATCH edits name, role
# and active with the continuity guard on role/active.
# Deactivating through PATCH also kills the sessions.
#
# Used by:
#   - Users.jsx — the edit and deactivate dialogs, and the
#     hold-to-delete button of every account row
############################################################

@methods("GET", "PATCH", "DELETE")
@require_role("admin")
def user_item(request, user_id):
    user = _load(user_id)
    if user is None:
        return json_error("User not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        return json_response(serialize_user(user))


    # STEP 1: DELETE — deactivate, or delete with the data
    # ====================================================
    if request.method == "DELETE" and request.GET.get("purge") == "true":
        if user.id == request.user.id:
            return json_error("You cannot delete yourself", 400, code="SELF_LOCKOUT")
        if _would_remove_last_admin(user, new_active=False):
            return json_error("The last active admin cannot be deleted", 400, code="LAST_ADMIN")
        if analysis_running(user):
            return json_error("Cancel the running analysis of the account's company first", 409, code="STILL_RUNNING")
        email, removed = user.email, owned_data(user)
        purge_account(user)
        audit(request, "users.purge", "user", user_id, {"email": email, **removed})
        return json_response({"ok": True, "removed": removed})
    if request.method == "DELETE":
        if user.id == request.user.id:
            return json_error("You cannot deactivate yourself", 400, code="SELF_LOCKOUT")
        if _would_remove_last_admin(user, new_active=False):
            return json_error("The last active admin cannot be deactivated", 400, code="LAST_ADMIN")
        user.active = False
        user.updated_at = utc_now()
        user.save(update_fields=["active", "updated_at"])
        Session.objects.filter(user=user).delete()
        audit(request, "users.deactivate", "user", user.id)
        return json_response(serialize_user(user))


    # STEP 2: PATCH — collect the changes, guard each one
    # ===================================================
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    changes = {}
    if "displayName" in data:
        if not isinstance(data["displayName"], str) or not data["displayName"].strip():
            return json_error("displayName cannot be empty", 400, code="MISSING_FIELDS")
        changes["display_name"] = data["displayName"].strip()[:MAX_NAME_CHARS]
    if "dailyBudgetUsd" in data:
        budget = data["dailyBudgetUsd"]
        if budget is not None:
            if isinstance(budget, bool) or not isinstance(budget, (int, float)) or not 0 <= budget <= 10_000:
                return json_error("dailyBudgetUsd must be null or an amount from 0 to 10000", 400, code="INVALID_FIELD")
            budget = Decimal(str(round(budget, 2)))
        changes["daily_budget_usd"] = budget
    if "role" in data:
        if data["role"] not in ROLES:
            return json_error("Unknown role", 400, code="INVALID_ROLE")
        if user.id == request.user.id and data["role"] != "admin":
            return json_error("You cannot demote yourself", 400, code="SELF_LOCKOUT")
        if _would_remove_last_admin(user, new_role=data["role"]):
            return json_error("The last active admin cannot be demoted", 400, code="LAST_ADMIN")
        changes["role"] = data["role"]
    if "active" in data:
        if not isinstance(data["active"], bool):
            return json_error("active must be true or false", 400, code="INVALID_FIELD")
        active = data["active"]
        if user.id == request.user.id and not active:
            return json_error("You cannot deactivate yourself", 400, code="SELF_LOCKOUT")
        if _would_remove_last_admin(user, new_active=active):
            return json_error("The last active admin cannot be deactivated", 400, code="LAST_ADMIN")
        changes["active"] = active
    if not changes:
        return json_error("Nothing to update", 400, code="EMPTY_UPDATE")


    # STEP 3: write, drop sessions on deactivation, audit
    # ===================================================
    for field, value in changes.items():
        setattr(user, field, value)
    user.updated_at = utc_now()
    user.save(update_fields=[*changes.keys(), "updated_at"])
    if changes.get("active") is False:
        Session.objects.filter(user=user).delete()
    audit(request, "users.update", "user", user.id, json_safe(changes))
    return json_response(serialize_user(user))








############################################################
# reset_password
############################################################
#
# POST /api/users/{id}/reset-password
#
# An admin sets a new password for someone else; every
# session of that account dies so the old holder is out.
#
# Used by:
#   - Users.jsx — the reset-password dialog
############################################################

@methods("POST")
@require_role("admin")
def reset_password(request, user_id):
    user = _load(user_id)
    if user is None:
        return json_error("User not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    error = validate_new_password(data.get("password"))
    if error:
        return json_error(error, 400, code="WEAK_PASSWORD")
    user.password_hash = hash_password(data["password"])
    user.updated_at = utc_now()
    user.save(update_fields=["password_hash", "updated_at"])
    Session.objects.filter(user=user).delete()
    audit(request, "users.reset_password", "user", user.id)
    return json_response({"ok": True})
