############################################################
#  [*] jobs.registry — kind → handler
#
#    @register("report.analyze", max_attempts=2)
#    def run(job, ctx): ...
#
#  A handler receives the Job row and a JobContext (see
#  runner.py) and returns the job's result (JSON-able) or
#  None. Raising fails the attempt; JobCancelled ends the
#  job as cancelled without counting as a failure.
#
#  on_abandon(job, status, error) — optional: called when the
#  job ends WITHOUT its handler seeing it end (a dead worker
#  past its attempts, a cancel while still queued), so the
#  subject row (a Report) never stays "running" forever.
############################################################


import logging


logger = logging.getLogger(__name__)

# kind → {"fn", "max_attempts", "on_abandon"}; filled by the
# @register decorators as jobs/handlers.py is imported
HANDLERS = {}


class JobCancelled(Exception):
    pass


# The worker is shutting down (SIGTERM on a deploy): the job
# goes back to the queue without spending an attempt
class WorkerStopping(Exception):
    pass


# Another worker took the job over (this one looked dead):
# nothing more may be written for it
class JobLost(Exception):
    pass








############################################################
# register
############################################################
#
# The decorator that puts a handler into HANDLERS under its
# kind, together with how many attempts the runner allows.
#
# Used by:
#   - jobs/handlers.py — every kind
############################################################

def register(kind, max_attempts=1, on_abandon=None):
    def decorator(fn):
        HANDLERS[kind] = {"fn": fn, "max_attempts": max_attempts, "on_abandon": on_abandon}
        return fn
    return decorator








############################################################
# get_handler
############################################################
#
# The registry entry for a kind, or None — the enqueue side
# refuses unknown kinds, the runner fails them.
#
# Used by:
#   - jobs/queue.py — enqueue
#   - jobs/runner.py — run
############################################################

def get_handler(kind):
    return HANDLERS.get(kind)








############################################################
# abandon
############################################################
#
# Runs a kind's on_abandon hook, never raising — the caller
# is the runner's recovery path or the cancel API.
#
# Used by:
#   - jobs/runner.py — recover_stale
#   - jobs/api/views.py — cancel_job (queued)
############################################################

def abandon(job, status, error=None):
    handler = HANDLERS.get(job.kind)
    if handler and handler.get("on_abandon"):
        try:
            handler["on_abandon"](job, status, error)
        except Exception:
            logger.exception("on_abandon failed for job %s", job.id)
