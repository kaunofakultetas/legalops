############################################################
#  [*] jobs.queue — enqueue and serialize
#
#    enqueue("report.analyze", {"report_id": ...},
#            subject="report:<id>", created_by=user)
#
#  Unknown kinds are refused at enqueue time so a typo
#  never sits in the table forever. The serializers here are
#  the one wire shape of a job and a step.
############################################################


import uuid


from compliance.common.timestamps import utc_now
from compliance.jobs.models import Job
from compliance.jobs.registry import get_handler
from compliance.prompts.models import PromptVersion








############################################################
# enqueue
############################################################
#
# One queued Job row. max_attempts comes from the handler's
# registration; run_after defaults to now (a future stamp
# delays the first claim). The owner is a User or, from a job
# that enqueues follow-ups, just its id.
#
# Used by:
#   - every app that owns background work (reports, corpus)
#   - tests/test_jobs.py
############################################################

def enqueue(kind, payload=None, subject=None, created_by=None, priority=0, run_after=None, created_by_id=None):
    handler = get_handler(kind)
    if handler is None:
        raise ValueError(f"Unknown job kind: {kind}")
    now = utc_now()
    return Job.objects.create(
        id=str(uuid.uuid4()),
        kind=kind,
        subject=subject,
        payload=payload or {},
        status="queued",
        priority=priority,
        max_attempts=handler["max_attempts"],
        run_after=run_after or now,
        created_by_id=created_by.id if created_by is not None else created_by_id,
        created_at=now,
    )








############################################################
# serialize_job
############################################################
#
# The camelCase wire shape of a job; with_steps=True appends
# the step rows in order (the details drawer's view), each
# naming its prompt version (step_prompts — one query).
# `titles` maps subjects to what they are called; a subject
# without an entry, or a caller that passes none, answers
# subjectTitle null.
#
# Used by:
#   - jobs/api/views.py — every answer, with the acts' titles
#   - corpus/api/views.py, corpus/api/obligation_views.py,
#     corpus/serializers.py — the job an action queued, the
#     act's latest job
############################################################

def serialize_job(job, with_steps=False, titles=None):
    data = {
        "id": job.id,
        "kind": job.kind,
        "subject": job.subject,
        "subjectTitle": (titles or {}).get(job.subject),
        "status": job.status,
        "priority": job.priority,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
        "attempts": job.attempts,
        "maxAttempts": job.max_attempts,
        "cancelRequested": job.cancel_requested,
        "createdBy": job.created_by_id,
        "createdAt": job.created_at,
        "startedAt": job.started_at,
        "finishedAt": job.finished_at,
    }
    if with_steps:
        steps = list(job.steps.order_by("ordinal"))
        prompts = step_prompts(steps)
        data["steps"] = [serialize_step(s, prompts.get(s.prompt_version_id)) for s in steps]
    return data








############################################################
# step_prompts
############################################################
#
#   step_prompts(steps) → {prompt_version_id: {"slug": "report.summary", "version": 3}}
#
# The prompt and version number behind each step's
# prompt_version_id, in one query: the drawer names
# "report.summary v3" where the bare id says nothing. An id
# whose version row is gone is simply absent.
#
# Used by:
#   - serialize_job (above)
############################################################

def step_prompts(steps):
    ids = {s.prompt_version_id for s in steps if s.prompt_version_id}
    if not ids:
        return {}
    rows = PromptVersion.objects.filter(id__in=ids).values_list("id", "prompt__slug", "version_no")
    return {pk: {"slug": slug, "version": number} for pk, slug, number in rows}








############################################################
# serialize_step
############################################################
#
# The wire shape of one JobStep row; `prompt` is its entry
# of step_prompts, or None.
#
# Used by:
#   - serialize_job (above)
############################################################

def serialize_step(step, prompt=None):
    return {
        "id": step.id,
        "ordinal": step.ordinal,
        "name": step.name,
        "status": step.status,
        "promptVersionId": step.prompt_version_id,
        "prompt": prompt,
        "model": step.model,
        "inputRef": step.input_ref,
        "output": step.output,
        "usage": step.usage,
        "durationMs": step.duration_ms,
        "error": step.error,
        "startedAt": step.started_at,
        "finishedAt": step.finished_at,
    }
