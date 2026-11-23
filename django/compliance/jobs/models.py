############################################################
#  [*] jobs — the database-backed queue
#
#  Models:
#    - Job      — one unit of background work
#    - JobStep  — one named phase inside a job (a pipeline
#                 step with its prompt, model and usage)
#
#  Claiming is SELECT ... FOR UPDATE SKIP LOCKED on the
#  queued rows (Postgres); the worker heartbeats while it
#  runs so a died worker's jobs are re-queued by the next.
#
#  Tables: jobs, job_steps
############################################################


from django.db import models


from compliance.users.models import User


JOB_STATUSES = ("queued", "running", "done", "failed", "cancelled")
STEP_STATUSES = ("running", "done", "failed", "skipped")


class Job(models.Model):
    id = models.TextField(primary_key=True)
    kind = models.TextField()
    subject = models.TextField(null=True, blank=True)   # e.g. "report:<id>" — the list filter
    payload = models.JSONField(default=dict, blank=True)
    status = models.TextField(default="queued")
    priority = models.IntegerField(default=0)
    progress = models.JSONField(default=dict, blank=True)  # {step, percent, message}
    result = models.JSONField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    attempts = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=1)
    cancel_requested = models.BooleanField(default=False)
    run_after = models.DateTimeField()
    locked_by = models.TextField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="jobs")
    created_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "jobs"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=JOB_STATUSES), name="jobs_status_check"),
        ]
        indexes = [
            models.Index(fields=["status", "run_after", "-priority", "created_at"], name="jobs_claim_idx"),
            models.Index(fields=["subject"], name="jobs_subject_idx"),
        ]


class JobStep(models.Model):
    id = models.TextField(primary_key=True)
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="steps")
    ordinal = models.IntegerField()
    name = models.TextField()
    status = models.TextField(default="running")
    # A PromptVersion id, kept as text: the step's record
    # outlives the version row (jobs/queue.py step_prompts)
    prompt_version_id = models.TextField(null=True, blank=True)
    model = models.TextField(null=True, blank=True)
    input_ref = models.JSONField(default=dict, blank=True)
    output = models.JSONField(null=True, blank=True)
    usage = models.JSONField(default=dict, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "job_steps"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=STEP_STATUSES), name="job_steps_status_check"),
        ]
        indexes = [models.Index(fields=["job", "ordinal"], name="job_steps_job_ordinal_idx")]
