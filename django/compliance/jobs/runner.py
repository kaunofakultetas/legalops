############################################################
#  [*] jobs.runner — claim, run, heartbeat, recover
#
#  The worker loop (run_once):
#    1. recover_stale(): running jobs whose heartbeat is
#       older than STALE_S belong to a died worker — re-queued
#       while attempts remain, else failed (their open steps
#       too, and the kind's on_abandon hook runs)
#    2. claim(): one queued job, FOR UPDATE SKIP LOCKED
#    3. run(): the handler under a heartbeat thread;
#       success → done, JobCancelled → cancelled,
#       WorkerStopping (SIGTERM) → queued again without
#       spending the attempt, JobLost → nothing written, any
#       other exception → queued again with backoff while
#       attempts remain, else failed
#
#  Every write after the claim is fenced by locked_by: a
#  worker that was presumed dead (a long pause) and recovered
#  by another can no longer overwrite the job.
#
#  Handlers get a JobContext:
#    ctx.progress(step, percent, message) — visible to the GUI
#    with ctx.step("name", model=..., prompt_version_id=...) as s:
#        s.output = {...}; s.usage = {...}
#    ctx.check_cancelled() — raises JobCancelled on request
#
#  A step that ends — done or failed, or failed by recovery —
#  gets its model, prompt version and usage from its own
#  LlmCall rows (every model call is logged with its
#  job_step_id), so a handler never has to count them.
############################################################


import logging
import socket
import threading
import traceback
import uuid
from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal


from django.db import connection, transaction
from django.db.models import Count, Sum


from compliance.assistant.models import LlmCall
from compliance.common.timestamps import utc_now
from compliance.jobs.models import Job, JobStep
from compliance.jobs.registry import JobCancelled, JobLost, WorkerStopping, abandon, get_handler


logger = logging.getLogger(__name__)

HEARTBEAT_S = 15
STALE_S = 120
BACKOFF_S = 30

# Recorded in jobs.locked_by so a stuck row names its worker
WORKER_ID = f"{socket.gethostname()}:{uuid.uuid4().hex[:8]}"

# Set by run_worker's SIGTERM handler: the running handler
# stops at its next check_cancelled and the job is re-queued
STOPPING = threading.Event()








############################################################
# _Step
############################################################
#
# What a handler receives inside `with ctx.step(...) as s`:
# the JobStep row plus the two fields the handler fills in
# (output, usage) that are written back on exit.
#
# Used by:
#   - JobContext.step (below)
############################################################

class _Step:

    def __init__(self, row):
        self.row = row
        self.output = None
        self.usage = {}








############################################################
# JobContext
############################################################
#
# The handler's window onto its own job: progress reports,
# cancellation checks and the step recorder. One instance
# per run; the ordinal counter numbers the steps.
#
# Used by:
#   - run (below) — one per handler call
############################################################

class JobContext:

    def __init__(self, job, lost=None):
        self.job = job
        self._ordinal = 0
        self._lost = lost or threading.Event()






    ############################################################
    # progress
    ############################################################
    #
    # Writes {step, percent, message} onto the job row — what
    # the jobs page and the details drawer show while it runs.
    #
    # Used by:
    #   - every handler
    ############################################################

    def progress(self, step, percent=None, message=None):
        self.job.progress = {"step": step, "percent": percent, "message": message}
        Job.objects.filter(id=self.job.id, locked_by=self.job.locked_by).update(progress=self.job.progress)






    ############################################################
    # check_cancelled
    ############################################################
    #
    # Raises JobCancelled when the API flagged the row,
    # WorkerStopping when the worker is shutting down and
    # JobLost when the heartbeat found the job taken over; a
    # handler calls it between expensive phases so any of them
    # lands within one phase, not at the end.
    #
    # Used by:
    #   - every handler with more than one phase
    ############################################################

    def check_cancelled(self):
        if self._lost.is_set():
            raise JobLost()
        if STOPPING.is_set():
            raise WorkerStopping()
        if Job.objects.filter(id=self.job.id, cancel_requested=True).exists():
            raise JobCancelled()






    ############################################################
    # step
    ############################################################
    #
    #   with ctx.step("gap_analysis", model=..., prompt_version_id=...) as s:
    #       s.output = {...}; s.usage = {"pages": ...}
    #
    # Opens a JobStep row as running, and on exit marks it
    # done (output written) or failed (error kept, exception
    # re-raised) with its duration — and, either way, with
    # what its model calls used (_finish_step).
    #
    # Used by:
    #   - every handler
    ############################################################

    @contextmanager
    def step(self, name, model=None, prompt_version_id=None, input_ref=None):
        self._ordinal += 1
        started = utc_now()
        row = JobStep.objects.create(
            id=str(uuid.uuid4()), job=self.job, ordinal=self._ordinal, name=name,
            status="running", model=model, prompt_version_id=prompt_version_id,
            input_ref=input_ref or {}, started_at=started,
        )
        step = _Step(row)
        try:
            yield step
        except Exception as exc:
            self._finish_step(row, step, started, "failed", error=str(exc)[:2000])
            raise
        self._finish_step(row, step, started, "done")






    ############################################################
    # _finish_step
    ############################################################
    #
    # The step's closing write: status, error, output and
    # duration, plus the model, prompt version and usage read
    # back from the step's LlmCall rows (_usage_from_calls). A
    # step that made no model call keeps what the handler
    # passed: its model and prompt version, its own usage.
    #
    # Used by:
    #   - step (above) — done and failed alike
    ############################################################

    def _finish_step(self, row, step, started, status, error=None):
        finished = utc_now()
        spent = _usage_from_calls([(row.id, row.model, row.prompt_version_id, step.usage)]).get(row.id)
        JobStep.objects.filter(id=row.id).update(
            status=status, error=error, output=step.output, finished_at=finished,
            duration_ms=int((finished - started).total_seconds() * 1000),
            **(spent or {"usage": step.usage or {}}),
        )








############################################################
# _usage_from_calls
############################################################
#
#   _usage_from_calls([(step_id, model, prompt_version_id, usage), …])
#       → {step_id: {"usage": …, "model": …, "prompt_version_id": …}}
#
# What the given steps' model calls used, from one grouped
# query over their LlmCall rows:
#   - usage = {calls, inputTokens, outputTokens, costUsd,
#     models: [{model, calls, inputTokens, outputTokens,
#     costUsd}, …] — most calls first}, merged over the
#     handler's own usage keys (the calls' numbers win)
#   - model = the most-used model (most calls, then cost)
#   - prompt_version_id = the one prompt version the calls
#     ran on (embedding calls run on none), else the
#     handler's own
# A step without calls is absent from the answer. Telemetry
# never fails a step: the read runs in its own savepoint and
# a failure is logged and answered with {}.
#
# Used by:
#   - JobContext._finish_step (above) — a step's end
#   - recover_stale (below) — the steps a dead worker left
############################################################

def _usage_from_calls(steps):
    step_ids = [step_id for step_id, _, _, _ in steps]
    try:
        with transaction.atomic():
            grouped = list(
                LlmCall.objects.filter(job_step_id__in=step_ids)
                .values("job_step_id", "model", "prompt_version_id")
                .annotate(calls=Count("id"), input_tokens=Sum("input_tokens"),
                          output_tokens=Sum("output_tokens"), cost=Sum("cost_usd"))
            )
    except Exception:
        logger.exception("Could not read the model calls of the steps %s", step_ids)
        return {}
    per_model, versions = {}, {}
    for row in grouped:
        entry = per_model.setdefault(row["job_step_id"], {}).setdefault(row["model"], {
            "model": row["model"], "calls": 0, "inputTokens": 0, "outputTokens": 0, "costUsd": Decimal(0)})
        entry["calls"] += row["calls"]
        entry["inputTokens"] += int(row["input_tokens"] or 0)
        entry["outputTokens"] += int(row["output_tokens"] or 0)
        entry["costUsd"] += row["cost"] or Decimal(0)
        if row["prompt_version_id"]:
            versions.setdefault(row["job_step_id"], set()).add(row["prompt_version_id"])
    fields = {}
    for step_id, model, prompt_version_id, usage in steps:
        if step_id not in per_model:
            continue
        used = sorted(per_model[step_id].values(), key=lambda m: (-m["calls"], -m["costUsd"], m["model"]))
        cost = sum((m["costUsd"] for m in used), Decimal(0))
        used = [{**m, "costUsd": float(round(m["costUsd"], 6))} for m in used]
        ran_on = versions.get(step_id, set())
        fields[step_id] = {
            "usage": {**(usage or {}), "calls": sum(m["calls"] for m in used),
                      "inputTokens": sum(m["inputTokens"] for m in used),
                      "outputTokens": sum(m["outputTokens"] for m in used),
                      "costUsd": float(round(cost, 6)), "models": used},
            "model": used[0]["model"] or model,
            "prompt_version_id": next(iter(ran_on)) if len(ran_on) == 1 else prompt_version_id,
        }
    return fields








############################################################
# recover_stale
############################################################
#
# Running rows whose heartbeat is older than STALE_S belong
# to a worker that died mid-job. Each is settled in its own
# transaction with a conditional update (another worker may
# be recovering the same row): back to queued while attempts
# remain, else failed — the job's still-running steps are
# failed with it (with what their model calls had used so
# far) and the kind's on_abandon hook runs, so no subject row
# (a Report) stays "running" forever.
#
# Used by:
#   - run_once (below) — every iteration
############################################################

def recover_stale():
    now = utc_now()
    cutoff = now - timedelta(seconds=STALE_S)
    recovered = 0
    for job in Job.objects.filter(status="running", heartbeat_at__lt=cutoff):
        with transaction.atomic():
            stale = Job.objects.filter(id=job.id, status="running", heartbeat_at__lt=cutoff)
            if job.attempts < job.max_attempts:
                n = stale.update(status="queued", locked_by=None, heartbeat_at=None,
                                 progress={"step": None, "percent": None,
                                           "message": "re-queued after a worker stopped"})
            else:
                n = stale.update(status="failed", locked_by=None, heartbeat_at=None, finished_at=now,
                                 error="The worker running this job stopped unexpectedly")
            if not n:
                continue
            open_steps = JobStep.objects.filter(job_id=job.id, status="running")
            spent = _usage_from_calls(list(open_steps.values_list("id", "model", "prompt_version_id", "usage")))
            open_steps.update(status="failed", error="The worker stopped during this step", finished_at=now)
            for step_id, fields in spent.items():
                JobStep.objects.filter(id=step_id).update(**fields)
        recovered += 1
        if job.attempts >= job.max_attempts:
            abandon(job, "failed", "The worker running this job stopped unexpectedly")
    if recovered:
        logger.warning("Recovered %d stale job(s)", recovered)
    return recovered








############################################################
# claim
############################################################
#
# One queued job whose run_after has passed, highest priority
# then oldest, taken with FOR UPDATE SKIP LOCKED so several
# workers never claim the same row. The row leaves the
# transaction already marked running and locked by this
# worker. Nothing is claimed once the worker is stopping.
#
# Used by:
#   - run_once (below)
#   - tests/test_jobs.py — the backoff check
############################################################

def claim():
    if STOPPING.is_set():
        return None
    now = utc_now()
    with transaction.atomic():
        job = (
            Job.objects.select_for_update(skip_locked=True)
            .filter(status="queued", run_after__lte=now)
            .order_by("-priority", "created_at")
            .first()
        )
        if job is None:
            return None
        job.status = "running"
        job.locked_by = WORKER_ID
        job.heartbeat_at = now
        job.started_at = job.started_at or now
        job.attempts += 1
        job.save(update_fields=["status", "locked_by", "heartbeat_at", "started_at", "attempts"])
        return job








############################################################
# _heartbeat_loop
############################################################
#
# The daemon thread that stamps heartbeat_at every
# HEARTBEAT_S while the handler runs — only while the row is
# still this worker's: when the stamp matches nothing, the
# job was recovered by another worker and `lost` is set (the
# handler stops at its next check). It closes its own
# connection each tick because Django connections are
# per-thread.
#
# Used by:
#   - run (below)
############################################################

def _heartbeat_loop(job_id, stop, lost):
    from compliance.jobs.management.commands.run_worker import touch_heartbeat

    while not stop.wait(HEARTBEAT_S):
        touch_heartbeat()
        try:
            n = Job.objects.filter(id=job_id, status="running", locked_by=WORKER_ID).update(heartbeat_at=utc_now())
            if not n:
                logger.warning("Job %s is no longer ours — stopping its handler", job_id)
                lost.set()
                return
        except Exception:
            logger.exception("Heartbeat failed for %s", job_id)
        finally:
            connection.close()








############################################################
# run
############################################################
#
# The handler call with the outcome discipline: done with a
# result, cancelled on JobCancelled, re-queued (attempt not
# spent) on WorkerStopping, untouched on JobLost, re-queued
# with backoff while attempts remain, failed otherwise — a
# failure after a cancel request ends as cancelled.
# heartbeat=False is for the test suite (no thread).
#
# Used by:
#   - run_once (below)
############################################################

def run(job, heartbeat=True):
    handler = get_handler(job.kind)
    if handler is None:
        _finish(job, "failed", error=f"No handler for kind {job.kind}")
        return job

    stop, lost = threading.Event(), threading.Event()
    thread = None
    if heartbeat:
        thread = threading.Thread(target=_heartbeat_loop, args=(job.id, stop, lost), daemon=True)
        thread.start()
    try:
        result = handler["fn"](job, JobContext(job, lost))
        _finish(job, "done", result=result)
    except JobCancelled:
        _finish(job, "cancelled")
    except JobLost:
        logger.warning("Job %s was taken over by another worker; this attempt is dropped", job.id)
    except WorkerStopping:
        logger.info("Job %s re-queued: worker %s is stopping", job.id, WORKER_ID)
        _fenced(job).update(status="queued", locked_by=None, heartbeat_at=None, attempts=job.attempts - 1,
                            progress={"step": None, "percent": None, "message": "re-queued: worker restarting"})
        job.refresh_from_db()
    except Exception as exc:
        logger.error("Job %s (%s) failed: %s\n%s", job.id, job.kind, exc, traceback.format_exc())
        if Job.objects.filter(id=job.id, cancel_requested=True).exists():
            _finish(job, "cancelled", error=str(exc)[:2000])
        elif job.attempts < job.max_attempts:
            _fenced(job).update(status="queued", locked_by=None, heartbeat_at=None,
                                error=str(exc)[:2000], run_after=utc_now() + timedelta(seconds=BACKOFF_S))
            job.refresh_from_db()
        else:
            _finish(job, "failed", error=str(exc)[:2000])
    finally:
        stop.set()
        if thread:
            thread.join(timeout=1)
    return job








############################################################
# _fenced
############################################################
#
# The job row, only while this worker still holds it.
#
# Used by:
#   - run, _finish (this file)
############################################################

def _fenced(job):
    return Job.objects.filter(id=job.id, status="running", locked_by=job.locked_by)








############################################################
# _finish
############################################################
#
# The terminal write: status, result/error, lock released,
# finished_at stamped — fenced, so a worker that lost the job
# writes nothing; the in-memory row is refreshed so the
# caller sees what the table says.
#
# Used by:
#   - run (above)
############################################################

def _finish(job, status, result=None, error=None):
    n = _fenced(job).update(
        status=status, result=result, error=error, locked_by=None,
        heartbeat_at=None, finished_at=utc_now(),
    )
    if not n:
        logger.warning("Job %s: lost the lock before finishing as %s — result dropped", job.id, status)
    job.refresh_from_db()








############################################################
# run_once
############################################################
#
# One iteration of the loop: recover, claim, run. Returns
# the finished Job or None when the queue was empty.
#
# Used by:
#   - management/commands/run_worker.py — the loop
#   - tests/test_jobs.py
############################################################

def run_once(heartbeat=True):
    recover_stale()
    job = claim()
    if job is None:
        return None
    logger.info("Running job %s (%s)", job.id, job.kind)
    return run(job, heartbeat=heartbeat)
