############################################################
#  [*] jobs.schedule — the periodic ticks
#
#  The worker checks SCHEDULE on every loop turn and enqueues
#  a kind when its last run (any status) is older than its
#  interval. No cron container and no docker socket: the
#  schedule lives with the queue it feeds, and a kind that is
#  still queued or running is never enqueued twice.
#
#    ops.maintenance     — daily
#    corpus.refresh_all  — weekly (every enabled fetchable act)
############################################################


import logging
from datetime import timedelta


from compliance.common.timestamps import utc_now
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue


logger = logging.getLogger(__name__)

# kind → interval between runs
SCHEDULE = {
    "ops.maintenance": timedelta(days=1),
    "corpus.refresh_all": timedelta(days=7),
}








############################################################
# tick
############################################################
#
# Enqueues every due kind; answers the kinds enqueued. Cheap
# enough to run on every idle loop of the worker (a handful
# of indexed queries).
#
# Used by:
#   - jobs/management/commands/run_worker.py
############################################################

def tick():
    due = []
    now = utc_now()
    for kind, interval in SCHEDULE.items():
        last = Job.objects.filter(kind=kind).order_by("-created_at").first()
        if last is not None and (last.status in ("queued", "running") or last.created_at > now - interval):
            continue
        enqueue(kind, {}, subject=f"schedule:{kind}", priority=-5)
        due.append(kind)
        logger.info("Scheduled %s", kind)
    return due
