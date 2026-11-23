############################################################
#  [*] chat — conversation threads and messages
#
#  Models:
#    - ChatThread  — one conversation of one user, optionally
#                    about one company and in one of its roles,
#                    answered by the model the user picked (none:
#                    the chat prompt's own)
#    - ChatMessage — one stored message in the assistant-ui
#                    history format ({id, parent_id, format,
#                    content}); content is the UI message JSON
#
#  The GUI's history adapter appends the user's rows; the
#  node assistant persists its own replies through the
#  internal door (chat/store.py is the one writer).
#
#  Tables: chat_threads, chat_messages
############################################################


from django.db import models


from compliance.companies.models import Company, CompanyRole
from compliance.users.models import User


class ChatThread(models.Model):
    id = models.TextField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_threads")
    company = models.ForeignKey(Company, null=True, blank=True, on_delete=models.SET_NULL, related_name="chat_threads")
    role = models.ForeignKey(CompanyRole, null=True, blank=True, on_delete=models.SET_NULL, related_name="chat_threads")
    title = models.TextField(null=True, blank=True)
    # The gateway model the user picked for this conversation
    # ("gateway:azure/…"); null answers with the active chat
    # prompt's model
    model = models.TextField(null=True, blank=True)
    message_count = models.IntegerField(default=0)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "chat_threads"
        indexes = [models.Index(fields=["user", "archived", "-updated_at"], name="chat_threads_user_idx")]


class ChatMessage(models.Model):
    id = models.TextField(primary_key=True)
    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="messages")
    parent_id = models.TextField(null=True, blank=True)
    format = models.TextField()
    role = models.TextField(null=True, blank=True)
    content = models.JSONField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = "chat_messages"
        indexes = [models.Index(fields=["thread", "created_at"], name="chat_messages_thread_idx")]
