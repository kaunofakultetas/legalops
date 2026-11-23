############################################################
#  [*] Usage API — what the models cost, per day and person
#
#    GET /api/usage?days=30&scope=all&userId=   → budget, days, byKind, byModel, byUser, totals
#    GET /api/usage/calls?limit=&offset=&kind=&userId=  → {calls, total}
#    GET /api/usage/calls/{id}                  → one call with tool calls + transcript
#
#  A user sees their own calls; an admin may widen to every
#  account (scope=all) or look at one (userId=). Pipeline
#  steps count for the user who started the report, chat
#  turns for the chatting user. The call detail carries the
#  chat transcript — the audit of what the assistant said.
############################################################


from datetime import timedelta


from django.db.models import Count, Sum
from django.db.models.expressions import RawSQL
from django.db.models.functions import TruncDate


from compliance.assistant.models import CALL_KINDS, LlmCall
from compliance.assistant.usage import budget_status
from compliance.common.http import json_error, json_response, methods, query_int, str_id
from compliance.common.timestamps import utc_now
from compliance.users.auth import require_auth
from compliance.users.models import User


MAX_DAYS = 366
MAX_CALLS_LISTED = 200








############################################################
# _scoped_calls
############################################################
#
# The LlmCall rows the caller may read under the query's
# scope, or an error response. Users: their own, always.
#
# Used by:
#   - usage_summary, calls_list, call_item (below)
############################################################

def _scoped_calls(request):
    rows = LlmCall.objects.all()
    user_id = request.GET.get("userId")
    if request.user.role != "admin":
        if (user_id and user_id != request.user.id) or request.GET.get("scope") == "all":
            return None, json_error("Only admins can read other accounts' usage", 403, code="FORBIDDEN")
        return rows.filter(user_id=request.user.id), None
    if user_id:
        return rows.filter(user_id=str_id(user_id)), None
    if request.GET.get("scope") == "all":
        return rows, None
    return rows.filter(user_id=request.user.id), None








############################################################
# _totals
############################################################
#
# {calls, inputTokens, outputTokens, costUsd} of a queryset
# or of one aggregated row.
#
# Used by:
#   - usage_summary (below)
############################################################

def _totals(row):
    return {
        "calls": int(row.get("calls") or 0),
        "inputTokens": int(row.get("i") or 0),
        "outputTokens": int(row.get("o") or 0),
        "costUsd": round(float(row.get("c") or 0), 6),
    }








############################################################
# usage_summary
############################################################
#
# GET /api/usage?days=30
#
# The last `days` UTC days (zero-filled, oldest first), the
# split by call kind and by model, the per-account split for
# an admin's wide scope, and the caller's own budget (or the
# looked-at account's).
#
# Used by:
#   - Usage.jsx
#   - Dashboard.jsx — the budget meter
############################################################

@methods("GET")
@require_auth
def usage_summary(request):
    rows, error = _scoped_calls(request)
    if error:
        return error
    days = query_int(request, "days", 30, 1, MAX_DAYS)
    if days is None:
        return json_error(f"days must be 1..{MAX_DAYS}", 400, code="INVALID_QUERY")
    today = utc_now().date()
    first = today - timedelta(days=days - 1)
    window = rows.filter(created_at__date__gte=first)
    measures = {"calls": Count("id"), "i": Sum("input_tokens"), "o": Sum("output_tokens"), "c": Sum("cost_usd")}


    # STEP 1: per day, zero-filled
    # ============================
    per_day = {row["day"]: row for row in window.annotate(day=TruncDate("created_at")).values("day")
               .annotate(**measures)}
    series = []
    for offset in range(days):
        day = first + timedelta(days=offset)
        series.append({"date": day.isoformat(), **_totals(per_day.get(day, {}))})


    # STEP 2: the splits
    # ==================
    by_kind = [{"kind": row["kind"], **_totals(row)} for row in
               window.values("kind").annotate(**measures).order_by("kind")]
    by_model = [{"model": row["model"], **_totals(row)} for row in
                window.values("model").annotate(**measures).order_by("-c")]
    payload = {"days": series, "byKind": by_kind, "byModel": by_model, "totals": _totals(window.aggregate(**measures)),
               "from": first.isoformat(), "to": today.isoformat()}
    looked_at = str_id(request.GET.get("userId")) or request.user.id
    payload["budget"] = budget_status(looked_at)
    if request.user.role == "admin" and request.GET.get("scope") == "all":
        users = {u.id: u for u in User.objects.all()}
        payload["byUser"] = [
            {"userId": row["user_id"], "name": users[row["user_id"]].display_name if row["user_id"] in users else None,
             "email": users[row["user_id"]].email if row["user_id"] in users else None, **_totals(row)}
            for row in window.values("user_id").annotate(**measures).order_by("-c")
        ]
    return json_response(payload)








############################################################
# serialize_call
############################################################
#
# One LlmCall on the wire; the tool calls and the transcript
# only in the detail.
#
# Used by:
#   - calls_list, call_item (below)
############################################################

def serialize_call(row, detail=False):
    data = {
        "id": row.id,
        "kind": row.kind,
        "purpose": row.purpose,
        "userId": row.user_id,
        "userName": (row.user.display_name or row.user.email) if row.user_id and row.user else None,
        "threadId": row.thread_id,
        "jobStepId": row.job_step_id,
        "promptVersionId": row.prompt_version_id,
        "model": row.model,
        "inputTokens": row.input_tokens,
        "cachedInputTokens": row.cached_input_tokens,
        "cacheWriteTokens": row.cache_write_tokens,
        "outputTokens": row.output_tokens,
        "reasoningTokens": row.reasoning_tokens,
        "costUsd": float(row.cost_usd),
        "durationMs": row.duration_ms,
        "outcome": row.outcome,
        # The list counts in SQL (tool_calls stays deferred there)
        "toolCallCount": row.tool_call_count if hasattr(row, "tool_call_count") else len(row.tool_calls or []),
        "createdAt": row.created_at,
    }
    if detail:
        data["toolCalls"] = row.tool_calls
        data["transcript"] = row.transcript
    return data








############################################################
# calls_list
############################################################
#
# GET /api/usage/calls?limit=50&offset=0&kind=chat
#
# Newest first.
#
# Used by:
#   - Usage.jsx — the call log
############################################################

@methods("GET")
@require_auth
def calls_list(request):
    rows, error = _scoped_calls(request)
    if error:
        return error
    kind = request.GET.get("kind")
    if kind:
        if kind not in CALL_KINDS:
            return json_error(f"kind must be one of {', '.join(CALL_KINDS)}", 400, code="INVALID_QUERY")
        rows = rows.filter(kind=kind)
    limit = query_int(request, "limit", 50, 1, MAX_CALLS_LISTED)
    offset = query_int(request, "offset", 0, 0, 10_000_000)
    if limit is None or offset is None:
        return json_error(f"limit must be 1..{MAX_CALLS_LISTED} and offset ≥ 0", 400, code="INVALID_QUERY")
    # The tool calls are counted in SQL: reading the deferred
    # list per row would cost one query per call listed
    count = RawSQL('CASE WHEN jsonb_typeof("llm_calls"."tool_calls") = \'array\' '
                   'THEN jsonb_array_length("llm_calls"."tool_calls") ELSE 0 END', [])
    rows = rows.select_related("user").defer("transcript", "tool_calls").annotate(tool_call_count=count) \
        .order_by("-created_at", "-id")
    return json_response({"calls": [serialize_call(r) for r in rows[offset:offset + limit]], "total": rows.count()})








############################################################
# call_item
############################################################
#
# GET /api/usage/calls/{id}
#
# Used by:
#   - Usage.jsx — the call drawer
############################################################

@methods("GET")
@require_auth
def call_item(request, call_id):
    rows = LlmCall.objects.all() if request.user.role == "admin" else LlmCall.objects.filter(user_id=request.user.id)
    row = rows.filter(id=call_id).first()
    if row is None:
        return json_error("Call not found", 404, code="NOT_FOUND")
    return json_response(serialize_call(row, detail=True))
