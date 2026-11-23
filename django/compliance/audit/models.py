############################################################
#  [*] audit — the action trail
#
#  One row per admin-relevant mutation (login, user changes,
#  prompt activations, corpus changes, MCP changes, ...).
#  Written through audit.log.audit(), never directly.
#
#  Table: audit_log
############################################################


from django.db import models


from compliance.users.models import User


class AuditLog(models.Model):
    id = models.TextField(primary_key=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_rows")
    action = models.TextField()
    target_type = models.TextField(null=True, blank=True)
    target_id = models.TextField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "audit_log"
        indexes = [
            models.Index(fields=["-created_at"], name="audit_created_idx"),
            models.Index(fields=["target_type", "target_id"], name="audit_target_idx"),
        ]
