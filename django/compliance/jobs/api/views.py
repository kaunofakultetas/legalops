############################################################
#  [*] Jobs API — the queue monitor
#
#    GET  /api/jobs?status=&kind=&subject=&limit=  → {jobs}
#    GET  /api/jobs/counts                         → {queued, running, done, failed, cancelled}
#    GET  /api/jobs/{id}                           → job + steps
#    POST /api/jobs/{id}/cancel
#
#  Admins see every job; a user sees only the jobs they
#  created. Cancelling a queued job is immediate; a running
#  job gets cancel_requested and stops at its next check.
#  A job about a legal act names the act (subjectTitle), so
#  a queue of fifty extractions does not read as fifty ids.
############################################################


from django.db.models import Count


from compliance.audit.log import audit
from compliance.common.http import json_error, json_response, methods
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument
from compliance.jobs.models import JOB_STATUSES, Job
from compliance.jobs.queue import serialize_job
from compliance.jobs.registry import abandon
from compliance.users.auth import require_auth


# The subject prefixes whose rest is a legal act's id
ACT_SUBJECTS = ("corpus", "obligations", "verification")

# How much of a full title stands in for a missing short one
TITLE_CHARS = 80








############################################################
# _visible
############################################################
#
# The rows the caller may see: everything for an admin, own
# jobs otherwise — the one place the tenancy rule for jobs
# lives.
#
# Used by:
#   - list_jobs, get_job, cancel_job (below)
############################################################

def _visible(request):
    rows = Job.objects.all()
    if request.user.role != "admin":
        rows = rows.filter(created_by=request.user)
    return rows








############################################################
# _subject_titles
############################################################
#
# What the acts behind the given jobs are called: subject →
# the act's short title, or the start of its full one. Only
# a subject that names a legal act has an entry (its
# ingestion, the extraction of its obligations) — the corpus
# is open to every reader, so the name tells nobody anything
# new. One query, however many jobs.
#
# Used by:
#   - list_jobs, get_job, cancel_job (below)
############################################################

def _subject_titles(jobs):
    acts = {}
    for job in jobs:
        prefix, _, rest = (job.subject or "").partition(":")
        if prefix in ACT_SUBJECTS and rest:
            acts[job.subject] = rest
    names = {row["id"]: row["short_title"] or row["title"][:TITLE_CHARS]
             for row in LegalDocument.objects.filter(id__in=set(acts.values())).values("id", "short_title", "title")}
    return {subject: names[act] for subject, act in acts.items() if act in names}








############################################################
# list_jobs
############################################################
#
# GET /api/jobs
#
# Newest first, optional status/kind/subject filters, limit
# capped at 500; each job about an act carries the act's
# name.
#
# Used by:
#   - Jobs.jsx — the polled table
#   - Dashboard.jsx — the counters and the recent list
############################################################

@methods("GET")
@require_auth
def list_jobs(request):
    rows = _visible(request).order_by("-created_at", "-id")
    if request.GET.get("status"):
        if request.GET["status"] not in JOB_STATUSES:
            return json_error("Unknown status", 400, code="INVALID_QUERY")
        rows = rows.filter(status=request.GET["status"])
    if request.GET.get("kind"):
        rows = rows.filter(kind=request.GET["kind"])
    if request.GET.get("subject"):
        rows = rows.filter(subject=request.GET["subject"])
    try:
        limit = max(1, min(int(request.GET.get("limit", 100)), 500))
    except ValueError:
        return json_error("limit must be an integer", 400, code="INVALID_QUERY")
    jobs = list(rows[:limit])
    titles = _subject_titles(jobs)
    return json_response({"jobs": [serialize_job(j, titles=titles) for j in jobs]})








############################################################
# job_counts
############################################################
#
# GET /api/jobs/counts
#
# How many jobs the caller can see, per status — the
# dashboard's counters without paging through the list.
#
# Used by:
#   - Dashboard.jsx
############################################################

@methods("GET")
@require_auth
def job_counts(request):
    counts = dict(_visible(request).values_list("status").annotate(n=Count("id")))
    return json_response({status: counts.get(status, 0) for status in JOB_STATUSES})








############################################################
# get_job
############################################################
#
# GET /api/jobs/{id}
#
# One job with its steps; a job the caller may not see is a
# 404, same as a missing one.
#
# Used by:
#   - Jobs.jsx — the details drawer (polled while running)
############################################################

@methods("GET")
@require_auth
def get_job(request, job_id):
    job = _visible(request).filter(id=job_id).first()
    if job is None:
        return json_error("Job not found", 404, code="NOT_FOUND")
    return json_response(serialize_job(job, with_steps=True, titles=_subject_titles([job])))








############################################################
# cancel_job
############################################################
#
# POST /api/jobs/{id}/cancel
#
# Queued → cancelled at once (and the kind's on_abandon hook
# settles its subject); running → cancel_requested, honoured
# at the handler's next check; anything finished is a 409.
# Both writes are conditional, in that order, so a worker
# claiming the job between them still gets the flag.
#
# Used by:
#   - Jobs.jsx — the cancel button
############################################################

@methods("POST")
@require_auth
def cancel_job(request, job_id):
    job = _visible(request).filter(id=job_id).first()
    if job is None:
        return json_error("Job not found", 404, code="NOT_FOUND")
    if Job.objects.filter(id=job.id, status="queued").update(
            status="cancelled", cancel_requested=True, finished_at=utc_now()):
        job.refresh_from_db()
        abandon(job, "cancelled")
    elif Job.objects.filter(id=job.id, status="running").update(cancel_requested=True):
        job.refresh_from_db()
    else:
        job.refresh_from_db()
        return json_error(f"Job is already {job.status}", 409, code="NOT_CANCELLABLE")
    audit(request, "jobs.cancel", "job", job.id, {"kind": job.kind})
    return json_response(serialize_job(job, titles=_subject_titles([job])))
