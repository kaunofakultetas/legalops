############################################################
#  [*] Assistant internal API — the node container's door
#
#    GET  /internal/assistant/prompt?slug=chat.assistant  → the active version
#    POST /internal/assistant/turn-log                     → one LlmCall row
#    GET  /internal/assistant/budget?user_id=              → today's USD budget
#    POST /internal/assistant/threads/{id}/messages        → persist an assistant reply
#    POST /internal/assistant/threads/{id}/title           → an AI title over the automatic one
#    GET  /internal/assistant/mcp-servers                  → enabled MCP servers WITH headers
#
#  ISOLATED-NETWORK ONLY: Caddy never proxies /internal/*,
#  and every view additionally demands the compose-injected
#  X-Internal-Secret header (require_internal fails CLOSED
#  when the setting is empty). Everything that concerns a
#  user's own data (companies, documents, threads) the
#  assistant reaches through the public API with the user's
#  bearer instead — the tenancy rule lives there once. The
#  exceptions are writing assistant messages — only this door
#  may, so a browser can never forge a tool output — and
#  giving a thread the title the assistant's model wrote.
############################################################


import hmac
from functools import wraps


from django.conf import settings


from compliance.assistant.api.mcp_views import url_problem
from compliance.assistant.models import McpServer
from compliance.assistant.usage import budget_status, record_call
from compliance.chat.models import ChatThread
from compliance.chat.store import set_ai_title, upsert_message
from compliance.common.http import bounded_int, get_json_object, json_error, json_response, methods, str_id
from compliance.prompts.models import Prompt
from compliance.prompts.serializers import serialize_version
from compliance.users.models import User








############################################################
# require_internal
############################################################
#
# The shared-secret gate; constant-time compare over bytes
# (compare_digest raises on a non-ASCII str, which a crafted
# header would otherwise turn into a 500), and an empty
# configured secret refuses everything.
#
# Used by:
#   - every view in this file
############################################################

def require_internal(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        expected = settings.ASSISTANT_INTERNAL_SECRET.encode()
        presented = request.META.get("HTTP_X_INTERNAL_SECRET", "").encode("utf-8", "surrogateescape")
        if not expected or not hmac.compare_digest(presented, expected):
            return json_error("Forbidden", 403, code="INTERNAL_ONLY")
        return view(request, *args, **kwargs)
    return wrapper








############################################################
# active_prompt
############################################################
#
# GET /internal/assistant/prompt?slug=
#
# The active version of one prompt, or 404 when the prompt
# has none — the assistant then answers 503 rather than run
# on anything invisible.
#
# Used by:
#   - assistant/app/services/prompts.js
############################################################

@methods("GET")
@require_internal
def active_prompt(request):
    slug = request.GET.get("slug", "")
    prompt = Prompt.objects.select_related("active_version").filter(slug=slug).first()
    if prompt is None or prompt.active_version_id is None:
        return json_error("No active prompt", 404, code="PROMPT_NOT_CONFIGURED")
    return json_response(serialize_version(prompt.active_version, with_text=True))








############################################################
# turn_log
############################################################
#
# POST /internal/assistant/turn-log
#
# One telemetry row per chat turn, with its cost from the
# gateway's prices; unknown users become NULL, unknown kinds
# default to chat. Answers the user's remaining budget.
#
# Used by:
#   - assistant/app/routes/chat.js — after every turn
############################################################

@methods("POST")
@require_internal
def turn_log(request):
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    user_id = str_id(data.get("user_id"))
    if user_id and not User.objects.filter(id=user_id).exists():
        user_id = None
    counts = {key: bounded_int(data.get(key) or 0, 0, 2_000_000_000)
              for key in ("input_tokens", "output_tokens", "reasoning_tokens", "duration_ms",
                          "cached_input_tokens", "cache_write_tokens")}
    if None in counts.values():
        return json_error("Token counts and durations must be non-negative integers", 400, code="INVALID_FIELD")
    transcript = data.get("transcript")
    if isinstance(transcript, dict):
        transcript = {"user": str(transcript.get("user") or "")[:20_000],
                      "assistant": str(transcript.get("assistant") or "")[:100_000]}
    else:
        transcript = None
    row = record_call(
        kind=data.get("kind") or "chat", purpose=str(data.get("purpose") or "chat"),
        model=str(data.get("model") or "unknown"), user_id=user_id, thread_id=str_id(data.get("thread_id")),
        job_step_id=str_id(data.get("job_step_id")), prompt_version_id=str_id(data.get("prompt_version_id")),
        tool_calls=data.get("tool_calls") if isinstance(data.get("tool_calls"), list) else [],
        outcome=str(data.get("outcome") or "ok"), transcript=transcript, **counts,
    )
    return json_response({"id": row.id if row else None, "budget": budget_status(user_id)}, status=201)








############################################################
# thread_message
############################################################
#
# POST /internal/assistant/threads/{id}/messages
#      {user_id, id, parent_id, format, content}
#
# The assistant persists its own replies (text, tool calls
# and tool outputs) the moment a turn ends — the transcript
# survives a closed tab, and the only writer of an assistant
# message is the side that produced it. The thread must
# belong to user_id.
#
# Used by:
#   - assistant/app/routes/chat.js — onFinish of every turn
############################################################

@methods("POST")
@require_internal
def thread_message(request, thread_id):
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    thread = ChatThread.objects.filter(id=thread_id, user_id=str_id(data.get("user_id"))).first()
    if thread is None:
        return json_error("Thread not found", 404, code="NOT_FOUND")
    created, error = upsert_message(thread, data, allowed_roles=("assistant",))
    if error:
        return json_error(error[1], error[0], code=error[2])
    return json_response({"ok": True, "created": created}, status=201 if created else 200)








############################################################
# thread_title
############################################################
#
# POST /internal/assistant/threads/{id}/title
#      {user_id, title}
#
# The short title the assistant's model wrote for a thread
# from its first message. It replaces the automatic title
# (the opening of that message) only while that title is
# still the automatic one, so a title the user set always
# stays (chat/store.py set_ai_title). The thread must
# belong to user_id; the answer says whether it was applied.
#
# Used by:
#   - assistant/app/services/title.js — nameThread, in the
#     first turn of a thread
############################################################

@methods("POST")
@require_internal
def thread_title(request, thread_id):
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return json_error("title must be a non-empty string", 400, code="INVALID_FIELD")
    applied = set_ai_title(thread_id, str_id(data.get("user_id")), title)
    if applied is None:
        return json_error("Thread not found", 404, code="NOT_FOUND")
    return json_response({"ok": True, "applied": applied})








############################################################
# budget
############################################################
#
# GET /internal/assistant/budget?user_id=
#
# Today's USD budget of one user (usage.py budget_status) —
# the chat route refuses a turn when nothing remains.
#
# Used by:
#   - assistant/app/routes/chat.js — before every turn
############################################################

@methods("GET")
@require_internal
def budget(request):
    return json_response(budget_status(request.GET.get("user_id") or None))








############################################################
# mcp_servers
############################################################
#
# GET /internal/assistant/mcp-servers
#
# The enabled servers with their credentials — the only
# place header values leave Django. A row whose URL fails
# mcp_views.url_problem (saved before the rule: plain http,
# an address, a container name) is left out — the assistant
# would otherwise connect to its internal neighbours.
#
# Used by:
#   - assistant/app/llm/mcp.js — the per-turn tool set
############################################################

@methods("GET")
@require_internal
def mcp_servers(request):
    rows = [r for r in McpServer.objects.filter(enabled=True).order_by("name") if not url_problem(r.url)]
    return json_response({"servers": [
        {"id": r.id, "name": r.name, "url": r.url, "transport": r.transport, "headers": r.headers,
         "allowedTools": r.allowed_tools} for r in rows
    ]})
