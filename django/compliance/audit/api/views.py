############################################################
#  [*] Audit API — the trail, admin-only
#
#    GET /api/audit?limit=100&before=<iso>&beforeId=<id>&action=&user=
#        → {entries, next}
#
#  Newest first, ordered by (created_at, id): the id breaks
#  the tie between entries that share a stamp, so the order
#  is total and a page boundary inside a run of equal stamps
#  skips nothing. `next` is what the following page needs —
#  {before, beforeId}, the stamp and id of the page's oldest
#  entry, passed back as they are — or null after the last
#  page. `before` alone keeps its old meaning, a strict
#  "earlier than" bound (the GUI's "until" filter, older
#  clients).
############################################################


from datetime import timezone


from django.db.models import Q
from django.utils.dateparse import parse_datetime


from compliance.audit.models import AuditLog
from compliance.common.http import json_error, json_response, methods
from compliance.users.auth import require_role








############################################################
# serialize_audit
############################################################
#
# The wire shape of one row, with the actor's display name
# resolved (select_related in the caller).
#
# Used by:
#   - list_audit (below)
############################################################

def serialize_audit(row):
    return {
        "id": row.id,
        "userId": row.user_id,
        "userName": row.user.display_name if row.user_id and row.user else None,
        "action": row.action,
        "targetType": row.target_type,
        "targetId": row.target_id,
        "details": row.details,
        "ip": row.ip,
        "createdAt": row.created_at,
    }








############################################################
# _cursor
############################################################
#
#   ?before=<iso>                → strictly older than <iso>
#   ?before=<iso>&beforeId=<id>  → after the entry (<iso>, <id>)
#
# The page's keyset filter, or an error response. With
# `beforeId` the position is after that entry in (-created_at,
# -id) order: older, or as old with a smaller id. The
# created_at <= before bound is redundant, but it lets the
# created_at index narrow the scan. A naive stamp is UTC (the
# database's zone). The stamp must come back exactly as
# `next` gave it, microseconds included, and URL-encoded — an
# unencoded "+00:00" arrives as " 00:00" and is refused.
#
# Used by:
#   - list_audit (below)
############################################################

def _cursor(request):
    raw = request.GET.get("before", "").strip()
    before_id = request.GET.get("beforeId", "").strip()
    if not raw:
        if before_id:
            return None, json_error("beforeId needs before", 400, code="INVALID_QUERY")
        return Q(), None
    try:
        before = parse_datetime(raw)
    except ValueError:
        before = None
    if before is None:
        return None, json_error("before must be an ISO 8601 datetime", 400, code="INVALID_QUERY")
    if before.tzinfo is None:
        before = before.replace(tzinfo=timezone.utc)
    if not before_id:
        return Q(created_at__lt=before), None
    return Q(created_at__lte=before) & (Q(created_at__lt=before) | Q(id__lt=before_id)), None








############################################################
# list_audit
############################################################
#
# GET /api/audit
#
# Newest first; `action` is a prefix filter ("users." for
# every account change), `user` one account, `before` /
# `beforeId` the keyset cursor (_cursor). One row more than
# the page is read, so `next` is null exactly when nothing
# older is left — never an empty last page.
#
# Used by:
#   - Audit.jsx — the trail and its "load older entries"
#   - tests/test_audit.py
############################################################

@methods("GET")
@require_role("admin")
def list_audit(request):
    try:
        limit = max(1, min(int(request.GET.get("limit", 100)), 500))
    except ValueError:
        return json_error("limit must be an integer", 400, code="INVALID_QUERY")
    cursor, error = _cursor(request)
    if error:
        return error
    rows = AuditLog.objects.select_related("user").filter(cursor).order_by("-created_at", "-id")
    if request.GET.get("action"):
        rows = rows.filter(action__startswith=request.GET["action"])
    if request.GET.get("user"):
        rows = rows.filter(user_id=request.GET["user"])
    page = list(rows[:limit + 1])
    last = page[limit - 1] if len(page) > limit else None
    return json_response({
        "entries": [serialize_audit(r) for r in page[:limit]],
        "next": {"before": last.created_at, "beforeId": last.id} if last else None,
    })
