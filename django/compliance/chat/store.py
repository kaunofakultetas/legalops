############################################################
#  [*] chat.store — the one message writer, and the titles
#
#  upsert_message stores a message and answers whether it
#  was new. It is shared by the GUI's history route (users
#  write their own messages) and the assistant's internal
#  door (the only writer of assistant messages — their tool
#  outputs are what the model is shown on the next turn, so
#  a browser must never be able to forge them).
#
#  A thread names itself after the first text of its first
#  user message, cut to 80 characters. That automatic title
#  can then be replaced once by a short one the assistant's
#  model writes (set_ai_title), but only while it is still
#  the automatic one — a title the user set always stays.
############################################################


import json
import re


from compliance.chat.models import ChatMessage, ChatThread
from compliance.common.timestamps import utc_now


MAX_CONTENT_CHARS = 400_000

# assistant-ui / AI SDK message ids are short random tokens
# (\Z, not $: "$" also accepts a trailing newline)
MESSAGE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,128}\Z")

# The row format the GUI and the assistant write: the AI SDK
# UIMessage itself, its role at the top — never wrapped
AI_SDK_FORMAT = "ai-sdk/v6"

# The automatic title: the first message's opening, cut here
AUTO_TITLE_CHARS = 80

# The longest title a thread keeps (the threads routes cut
# a user's title there too)
MAX_TITLE_CHARS = 200








############################################################
# message_role
############################################################
#
# The ONE role of a stored UI message, or None when it has
# none or is ambiguous. assistant-ui's history format wraps
# the message as {message: {...}}, the AI SDK format carries
# the role at the top — and the assistant reads the top.
# So a row may not say two things: a top-level role that
# differs from the wrapped one, or a wrapper inside an AI SDK
# row, is refused (the browser could otherwise pass a "user"
# row here that the model reads as an assistant reply with
# forged tool outputs).
#
# Used by:
#   - upsert_message (below)
############################################################

def message_role(content, fmt=None):
    if not isinstance(content, dict):
        return None
    top = content.get("role")
    wrapped = content.get("message")
    if wrapped is not None and (not isinstance(wrapped, dict) or fmt == AI_SDK_FORMAT):
        return None
    inner = wrapped.get("role") if isinstance(wrapped, dict) else None
    if top is not None and inner is not None and top != inner:
        return None
    role = inner if inner is not None else top
    return role if isinstance(role, str) else None








############################################################
# first_text
############################################################
#
# The first text part of a UI message, for the auto title.
#
# Used by:
#   - upsert_message (below)
############################################################

def first_text(content):
    message = content.get("message", content) if isinstance(content, dict) else {}
    for part in message.get("parts", []) if isinstance(message, dict) else []:
        if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
            return str(part["text"]).strip()
    return ""








############################################################
# upsert_message
############################################################
#
# Validates {id, parent_id, format, content}, then creates
# or updates the message WITHIN `thread` only: an id that
# already lives in another thread is refused, never moved (an
# upsert by bare id would let one user overwrite and re-home
# another user's message), and an update keeps the original
# created_at so a re-sent message never reorders history.
# The thread row is locked first, so concurrent appends count
# right. Answers (created, None) or (None, (status, message,
# code)).
#
# Used by:
#   - chat/api/views.py — thread_messages (user messages)
#   - assistant/api/internal_views.py — thread_message
############################################################

def upsert_message(thread, data, allowed_roles):
    message_id, fmt, parent_id = data.get("id"), data.get("format"), data.get("parent_id")
    content = data.get("content")
    if not isinstance(message_id, str) or not MESSAGE_ID.match(message_id) \
            or not isinstance(fmt, str) or not 0 < len(fmt) <= 64 or not isinstance(content, dict):
        return None, (400, "id, format and content are required", "MISSING_FIELDS")
    if parent_id is not None and (not isinstance(parent_id, str) or not MESSAGE_ID.match(parent_id)):
        return None, (400, "parent_id must be a message id", "INVALID_FIELD")
    if len(json.dumps(content, ensure_ascii=False)) > MAX_CONTENT_CHARS:
        return None, (413, "Message too large", "MESSAGE_TOO_LARGE")
    role = message_role(content, fmt)
    if role is None:
        return None, (400, "content must carry exactly one role", "INVALID_FIELD")
    if role not in allowed_roles:
        return None, (403, f"Messages with role {role!r} cannot be written here", "ROLE_NOT_ALLOWED")

    thread = ChatThread.objects.select_for_update().get(id=thread.id)
    existing = ChatMessage.objects.filter(id=message_id).first()
    if existing is not None and existing.thread_id != thread.id:
        return None, (409, "Message id already in use", "MESSAGE_ID_TAKEN")
    if existing is not None and existing.role != role:
        return None, (409, "A message cannot change its role", "MESSAGE_ID_TAKEN")

    now = utc_now()
    if existing is not None:
        existing.parent_id, existing.format, existing.content = parent_id, fmt, content
        existing.save(update_fields=["parent_id", "format", "content"])
    else:
        ChatMessage.objects.create(id=message_id, thread=thread, parent_id=parent_id, format=fmt,
                                   role=role, content=content, created_at=now)
        thread.message_count = thread.messages.count()
        # The first user message names the thread until it is renamed
        if thread.title is None and role == "user":
            thread.title = first_text(content)[:AUTO_TITLE_CHARS] or None
    thread.updated_at = now
    thread.save(update_fields=["message_count", "title", "updated_at"])
    return existing is None, None








############################################################
# auto_title
############################################################
#
# The title the thread gives itself (upsert_message): the
# first text of its earliest user message that has any, cut
# to AUTO_TITLE_CHARS — None while no user message has text.
#
# Used by:
#   - title_is_automatic (below)
############################################################

def auto_title(thread):
    rows = thread.messages.filter(role="user").order_by("created_at", "id").values_list("content", flat=True)
    for content in rows.iterator():
        text = first_text(content)[:AUTO_TITLE_CHARS]
        if text:
            return text
    return None








############################################################
# title_is_automatic
############################################################
#
# True while the thread still carries the title it gave
# itself: nobody renamed it and no AI title replaced it. The
# assistant asks its model for a title only then, and
# set_ai_title applies one only then. A thread with no title
# yet has nothing to replace.
#
# Used by:
#   - chat/api/views.py — thread_messages, the answer's
#     autoTitle
#   - set_ai_title (below)
############################################################

def title_is_automatic(thread):
    return thread.title is not None and thread.title == auto_title(thread)








############################################################
# set_ai_title
############################################################
#
# Replaces the automatic title of `user_id`'s thread with
# the one the assistant's model wrote, under the row lock,
# so a rename that lands first always wins. The title is
# trimmed and cut to MAX_TITLE_CHARS; updated_at stays, as
# the thread did not change for the user. Answers True when
# the title was applied, False when it was no longer the
# automatic one (or the new one is blank), None when the
# thread is not the user's.
#
# Used by:
#   - assistant/api/internal_views.py — thread_title
############################################################

def set_ai_title(thread_id, user_id, title):
    thread = ChatThread.objects.select_for_update().filter(id=thread_id, user_id=user_id).first()
    if thread is None:
        return None
    title = title.strip()[:MAX_TITLE_CHARS]
    if not title or not title_is_automatic(thread):
        return False
    thread.title = title
    thread.save(update_fields=["title"])
    return True
