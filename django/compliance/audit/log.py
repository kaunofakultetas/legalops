############################################################
#  [*] audit.log — the one writer
#
#    audit(request, "users.create", "user", user_id, {...})
#
#  The acting user is request.user when a decorator attached
#  one, else the explicit `user` argument (login, where the
#  session does not exist yet). Never raises: a failed audit
#  write is logged, the request goes on — and it runs in its
#  own savepoint, so a failed INSERT cannot poison the
#  request's transaction (ATOMIC_REQUESTS) either.
############################################################


import logging
import uuid


from django.db import transaction


from compliance.audit.models import AuditLog
from compliance.common.http import client_ip, json_safe
from compliance.common.timestamps import utc_now


logger = logging.getLogger(__name__)








############################################################
# audit
############################################################
#
# One AuditLog row. request may be None (management
# commands); details must be JSON-able.
#
# Used by:
#   - users/api/auth_views.py, users/api/users_views.py
#   - jobs/api/views.py — cancel
#   - every later admin mutation (prompts, corpus, MCP)
############################################################

def audit(request, action, target_type=None, target_id=None, details=None, user=None):
    actor = user or getattr(request, "user", None)
    try:
        with transaction.atomic():
            _write(request, action, target_type, target_id, details, actor)
    except Exception:
        logger.exception("Audit write failed for %s", action)








############################################################
# _write
############################################################
#
# Used by:
#   - audit (above)
############################################################

def _write(request, action, target_type, target_id, details, actor):
    AuditLog.objects.create(
        id=str(uuid.uuid4()),
        user=actor if actor is not None and getattr(actor, "id", None) else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=json_safe(details or {}),
        ip=client_ip(request) if request is not None else None,
        created_at=utc_now(),
    )
