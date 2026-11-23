############################################################
#  [*] Ops API — the readiness probe
#
#    GET /api/health  → 200 ok / 503 naming the failed check
#
#  Public on purpose: it carries no data, and a probe that
#  needs credentials is a probe nobody wires up. The answer
#  names WHICH check failed, never why (an exception text
#  would hand a stranger hostnames and paths) — the why is in
#  the log.
############################################################


import logging
import os


from django.conf import settings
from django.db import connection, transaction


from compliance.common.http import json_response, methods


logger = logging.getLogger(__name__)








############################################################
# health
############################################################
#
# GET /api/health
#
# Readiness, not liveness: the database must answer a
# trivial query and the upload directory must be writable.
# The two published keys are {"status", "service"}; the
# per-check fields are additive. Outside ATOMIC_REQUESTS —
# with the database down, opening the request transaction
# would already raise, and the probe must answer 503, not
# 500.
#
# Used by:
#   - the operator's check after an install
#     (docs/markdown/en/deployment.md §3)
#   - tests/test_health.py
############################################################

@transaction.non_atomic_requests
@methods("GET", "HEAD")
def health(request):
    # STEP 1: the database must answer a trivial query
    # ================================================
    checks = {"database": "ok", "uploads": "ok"}
    reason = None
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        checks["database"] = "error"
        reason = "database"
        logger.exception("Health probe: database check failed")


    # STEP 2: uploads must still be writable
    # ======================================
    upload_dir = settings.UPLOAD_DIR
    if not os.access(upload_dir, os.W_OK):
        checks["uploads"] = "error"
        reason = reason or "uploads"
        logger.warning("Health probe: %s is not writable", upload_dir)

    if reason:
        return json_response({"status": "error", "service": "legalops-django", "reason": reason, **checks},
                             status=503)
    return json_response({"status": "ok", "service": "legalops-django", **checks})
