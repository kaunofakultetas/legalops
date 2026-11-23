############################################################
#  [*] Chat API — threads and message history
#
#    GET    /api/chat/models                    → {default, models}
#    GET    /api/chat/threads?companyId=        → {threads}
#    POST   /api/chat/threads                   {companyId?, title?}
#    GET    /api/chat/threads/{id}
#    PATCH  /api/chat/threads/{id}              {title?, companyId?, roleId?, model?}
#    DELETE /api/chat/threads/{id}              → archive
#    GET    /api/chat/threads/{id}/messages     → [{id, parent_id, format, content}]
#    POST   /api/chat/threads/{id}/messages     {id, parent_id, format, content}  (upsert)
#
#  The GUI's assistant-ui runtime calls these directly with
#  the bearer: the thread list adapter (list/create/delete)
#  and the history adapter (load/append). Threads belong to
#  their user — admins included: a transcript is personal,
#  the audit of what the assistant said lives in llm_calls.
#  A conversation answers with the model its user picked from
#  the gateway's chat models, or with the chat prompt's own.
############################################################


import uuid


from compliance.assistant import gateway


from compliance.chat.models import ChatThread
from compliance.chat.store import title_is_automatic, upsert_message
from compliance.common.http import get_json_object, json_error, json_response, methods, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.api.company_views import visible_companies
from compliance.companies.models import CompanyRole
from compliance.companies.serializers import serialize_role
from compliance.prompts.store import PromptNotConfigured, active_version
from compliance.users.auth import require_auth


MAX_THREADS_LISTED = 300

# The chat's prompt: its active version's model is what a
# conversation without a model of its own answers with
CHAT_PROMPT = "chat.assistant"

# What the GUI's history adapter may write: the user's own
# messages only. Assistant replies — whose tool outputs the
# model is shown on the next turn — are written solely by the
# assistant container through the internal door (chat/store.py)
GUI_WRITABLE_ROLES = ("user",)








############################################################
# offered_models
############################################################
#
# The models a conversation may answer with: the gateway's
# chat models (not its embedding ones), each as {id, name,
# pricing} — pricing in USD per token, null when the gateway
# names none. Empty while the gateway cannot be reached.
#
# Used by:
#   - chat_models, thread_item (below)
############################################################

def offered_models():
    listing = gateway.list_models(timeout=15)
    return [
        {"id": entry["id"], "name": entry.get("name") or entry["id"], "pricing": entry.get("pricing")}
        for entry in listing.get("models", [])
        if isinstance(entry, dict) and entry.get("kind") == "chat" and isinstance(entry.get("id"), str)
    ]








############################################################
# default_model
############################################################
#
# The model a conversation without one of its own answers
# with: the active chat prompt version's — null while the
# chat has no active prompt (it then does not answer at all).
#
# Used by:
#   - chat_models (below)
############################################################

def default_model():
    try:
        return active_version(CHAT_PROMPT).model
    except PromptNotConfigured:
        return None








############################################################
# visible_threads
############################################################
#
# The tenancy rule for threads: a user's own, for every
# role. The admin console never needs another user's
# conversation, and the assistant acts on the thread as its
# owner.
#
# Used by:
#   - every route in this file
############################################################

def visible_threads(request):
    return ChatThread.objects.filter(user=request.user)








############################################################
# serialize_thread
############################################################
#
# Used by:
#   - the thread routes (below)
############################################################

def serialize_thread(thread):
    return {
        "id": thread.id,
        "userId": thread.user_id,
        "companyId": thread.company_id,
        "companyName": thread.company.name if thread.company_id and thread.company else None,
        "roleId": thread.role_id,
        # A thread shows its role's name and the assistant reads its
        # context: the sources go out as stored, without a query a thread
        "role": serialize_role(thread.role, ()) if thread.role_id and thread.role else None,
        "title": thread.title,
        "model": thread.model,
        "messageCount": thread.message_count,
        "archived": thread.archived,
        "createdAt": thread.created_at,
        "updatedAt": thread.updated_at,
    }








############################################################
# threads_collection
############################################################
#
# GET  /api/chat/threads
# POST /api/chat/threads
#
# Unarchived threads, most recently updated first.
#
# Used by:
#   - ChatRuntime.jsx — the thread list adapter
############################################################

@methods("GET", "POST")
@require_auth
def threads_collection(request):
    if request.method == "GET":
        rows = visible_threads(request).filter(archived=False).select_related("company", "role").order_by(
            "-updated_at", "-id")
        if request.GET.get("companyId"):
            rows = rows.filter(company_id=request.GET["companyId"])
        return json_response({"threads": [serialize_thread(t) for t in rows[:MAX_THREADS_LISTED]]})

    data = get_json_object(request) or {}
    company = None
    if data.get("companyId") is not None:
        company = visible_companies(request).filter(id=str_id(data["companyId"])).first()
        if company is None:
            return json_error("Company not found", 404, code="NOT_FOUND")
    title = data.get("title")
    now = utc_now()
    thread = ChatThread.objects.create(
        id=str(uuid.uuid4()), user=request.user, company=company,
        title=(title.strip()[:200] or None) if isinstance(title, str) else None, created_at=now, updated_at=now,
    )
    return json_response(serialize_thread(thread), status=201)








############################################################
# chat_models
############################################################
#
# GET /api/chat/models
#
# What the conversation's model picker offers: the chat
# models (offered_models) and the default a conversation
# without its own answers with (default_model). Every call
# reaches the assistant, which keeps the gateway's list for
# ten minutes.
#
# Used by:
#   - ModelPicker.jsx — the list and the default
############################################################

@methods("GET")
@require_auth
def chat_models(request):
    return json_response({"default": default_model(), "models": offered_models()})








############################################################
# thread_item
############################################################
#
# GET    /api/chat/threads/{id}
# PATCH  /api/chat/threads/{id}
# DELETE /api/chat/threads/{id}
#
# DELETE archives — the transcript stays for the audit of
# what the assistant said. A thread adopts one of its
# company's roles (roleId); changing the company drops it.
# Its model is one of the gateway's chat models
# (offered_models — a 400 UNKNOWN_MODEL otherwise, a 503
# MODELS_UNAVAILABLE while the list cannot be read) or null,
# the chat prompt's own.
#
# Used by:
#   - ChatRuntime.jsx — fetch / rename / delete
#   - ThreadLink.jsx — the company and role link (PATCH)
#   - ModelPicker.jsx — the conversation's model (PATCH)
#   - the assistant's setThreadCompany tool (PATCH)
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def thread_item(request, thread_id):
    thread = visible_threads(request).select_related("company", "role").filter(id=thread_id).first()
    if thread is None:
        return json_error("Thread not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        return json_response(serialize_thread(thread))

    if request.method == "DELETE":
        thread.archived = True
        thread.updated_at = utc_now()
        thread.save(update_fields=["archived", "updated_at"])
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    fields = []
    if "title" in data:
        if data["title"] is not None and not isinstance(data["title"], str):
            return json_error("title must be a string", 400, code="INVALID_FIELD")
        thread.title = (data["title"] or "").strip()[:200] or None
        fields.append("title")
    if "companyId" in data:
        if data["companyId"]:
            company = visible_companies(request).filter(id=str_id(data["companyId"])).first()
            if company is None:
                return json_error("Company not found", 404, code="NOT_FOUND")
            if thread.company_id != company.id:
                thread.role = None
                fields.append("role")
            thread.company = company
        else:
            thread.company, thread.role = None, None
            fields.append("role")
        fields.append("company")
    if "roleId" in data:
        if data["roleId"]:
            company_id = thread.company.id if thread.company else None
            role = CompanyRole.objects.filter(id=str_id(data["roleId"]), company_id=company_id).first()
            if role is None:
                return json_error("Role not found for the thread's company", 404, code="NOT_FOUND")
            thread.role = role
        else:
            thread.role = None
        if "role" not in fields:
            fields.append("role")
    if "model" in data:
        model = data["model"]
        if model is not None and (not isinstance(model, str) or not model.strip()):
            return json_error("model must be a model id or null", 400, code="INVALID_FIELD")
        if model is not None:
            offered = {entry["id"] for entry in offered_models()}
            if not offered:
                return json_error("The model list is unavailable — try again shortly", 503, code="MODELS_UNAVAILABLE")
            if model not in offered:
                return json_error("Unknown model", 400, code="UNKNOWN_MODEL")
        thread.model = model
        fields.append("model")
    if not fields:
        return json_error("Nothing to update", 400, code="EMPTY_UPDATE")
    thread.updated_at = utc_now()
    thread.save(update_fields=[*fields, "updated_at"])
    return json_response(serialize_thread(thread))








############################################################
# thread_messages
############################################################
#
# GET  /api/chat/threads/{id}/messages
# POST /api/chat/threads/{id}/messages
#
# Rows in the exact shape assistant-ui's history adapter
# encodes and decodes; POST upserts by message id within
# this thread (chat/store.py), so a re-sent edit overwrites
# its earlier row and never another thread's. Its answer
# also says whether the thread still carries the title it
# gave itself (autoTitle): the assistant, which stores the
# user's message this way too, then asks its model for a
# short title in its place.
#
# Used by:
#   - ChatRuntime.jsx — the history adapter
#   - assistant/app/services/transcript.js — saveUserMessage
############################################################

@methods("GET", "POST")
@require_auth
def thread_messages(request, thread_id):
    thread = visible_threads(request).filter(id=thread_id).first()
    if thread is None:
        return json_error("Thread not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        rows = thread.messages.order_by("created_at", "id")
        return json_response([
            {"id": m.id, "parent_id": m.parent_id, "format": m.format, "content": m.content}
            for m in rows
        ])

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    created, error = upsert_message(thread, data, allowed_roles=GUI_WRITABLE_ROLES)
    if error:
        return json_error(error[1], error[0], code=error[2])
    thread.refresh_from_db(fields=["title"])
    return json_response({"ok": True, "created": created, "autoTitle": title_is_automatic(thread)})
