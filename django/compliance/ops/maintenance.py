############################################################
#  [*] ops.maintenance — the daily housekeeping job
#
#  `ops.maintenance` (scheduled daily by the worker):
#    - purge expired bearer sessions
#    - delete finished jobs (and their steps) older than
#      JOB_RETENTION_DAYS, keeping those a report points at
#    - delete LlmCall telemetry older than TELEMETRY_RETENTION_DAYS
#    - remove orphaned files under UPLOAD_DIR/documents that
#      no CompanyDocument row references (a crash between
#      writing the file and the row)
#    - drop expired login rate-limit windows
#    - delete chat uploads nobody used: no company, older than
#      ORPHAN_UPLOAD_DAYS, and named by no chat message (a file
#      dropped into the composer and never sent)
############################################################


import logging
import os
from datetime import timedelta


from django.conf import settings


from compliance.analysis.models import Report
from compliance.chat.models import ChatMessage
from compliance.assistant.models import LlmCall
from compliance.common.timestamps import utc_now
from compliance.companies.models import CompanyDocument
from compliance.jobs.models import Job
from compliance.jobs.registry import register
from compliance.ops.models import RateLimitWindow
from compliance.users.models import Session


logger = logging.getLogger(__name__)

JOB_RETENTION_DAYS = 90
ORPHAN_UPLOAD_DAYS = 7
ORPHAN_UPLOAD_BATCH = 500
TELEMETRY_RETENTION_DAYS = 400
ORPHAN_GRACE_HOURS = 6








############################################################
# maintenance
############################################################
#
# The `ops.maintenance` job; answers what it removed.
#
# Used by:
#   - jobs/schedule.py — the daily tick
############################################################

@register("ops.maintenance", max_attempts=1)
def maintenance(job, ctx):
    now = utc_now()
    removed = {}


    # STEP 1: expired sessions
    # ========================
    removed["sessions"], _ = Session.objects.filter(expires_at__lt=now).delete()


    # STEP 2: old finished jobs a report does not point at
    # ====================================================
    keep = Report.objects.exclude(job_id=None).values_list("job_id", flat=True)
    old = Job.objects.filter(status__in=("done", "failed", "cancelled"),
                             finished_at__lt=now - timedelta(days=JOB_RETENTION_DAYS)).exclude(id__in=keep)
    removed["jobs"], _ = old.delete()


    # STEP 3: old telemetry
    # =====================
    removed["llmCalls"], _ = LlmCall.objects.filter(created_at__lt=now - timedelta(days=TELEMETRY_RETENTION_DAYS)).delete()


    # STEP 4: orphaned document files
    # ===============================
    directory = os.path.join(settings.UPLOAD_DIR, "documents")
    known = set(CompanyDocument.objects.values_list("file_path", flat=True))
    orphans = 0
    if os.path.isdir(directory):
        cutoff = (now - timedelta(hours=ORPHAN_GRACE_HOURS)).timestamp()
        for name in os.listdir(directory):
            path = os.path.join(directory, name)
            if path not in known and os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                os.remove(path)
                orphans += 1
    removed["orphanFiles"] = orphans


    # STEP 5: expired rate-limit windows
    # ==================================
    removed["rateLimitWindows"], _ = RateLimitWindow.objects.filter(reset_at__lt=now).delete()


    # STEP 6: chat uploads that were never sent or attached
    # =====================================================
    unused = 0
    candidates = CompanyDocument.objects.filter(company__isnull=True,
                                                uploaded_at__lt=now - timedelta(days=ORPHAN_UPLOAD_DAYS))
    for document in candidates.only("id", "file_path")[:ORPHAN_UPLOAD_BATCH]:
        if ChatMessage.objects.filter(content__icontains=document.id).exists():
            continue
        path = document.file_path
        document.delete()
        try:
            os.remove(path)
        except OSError:
            pass
        unused += 1
    removed["unusedUploads"] = unused
    logger.info("Maintenance removed %s", removed)
    return removed
