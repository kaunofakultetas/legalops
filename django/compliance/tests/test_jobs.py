############################################################
#  [*] Tests — the queue and the worker
#
#  The queue's claim / run / retry / recovery paths on the
#  smoke-test kind, the jobs API's tenancy, what a step
#  records when it ends (its model, prompt version and usage
#  read back from its own LlmCall rows: done, failed, failed
#  by recovery), and how a new worker loop takes over from the
#  one still running.
############################################################


import os
import shutil
import signal
import subprocess
import sys
import tempfile
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest import mock


from django.core.management import call_command
from django.test import SimpleTestCase, TestCase


from compliance.assistant.models import LlmCall
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument
from compliance.jobs.management.commands import run_worker
from compliance.jobs.models import Job, JobStep
from compliance.jobs.queue import enqueue
from compliance.jobs.runner import JobContext, claim, recover_stale, run_once
from compliance.prompts.store import active_version, seed_defaults
from compliance.tests.utils import create_admin, create_user, signed_in


GPT = "gateway:azure/gpt-5.5"
TERRA = "gateway:azure/gpt-5.6-terra"
EMBED = "gateway:azure/text-embedding-3-small"








############################################################
# log_call
############################################################
#
# One LlmCall row of a step, as record_call writes it (the
# cost given, not priced — the price list is not the point).
#
# Used by:
#   - StepUsageTests (below)
############################################################

def log_call(step_id, model, input_tokens, output_tokens, cost, version=None):
    return LlmCall.objects.create(
        id=str(uuid.uuid4()), kind="embed" if model == EMBED else "job_step", model=model, job_step_id=step_id,
        prompt_version_id=version, input_tokens=input_tokens, output_tokens=output_tokens,
        cost_usd=Decimal(cost), created_at=utc_now(),
    )








class QueueTests(TestCase):

    def test_unknown_kind_is_refused_at_enqueue(self):
        with self.assertRaises(ValueError):
            enqueue("does.not.exist")

    def test_run_once_executes_steps_progress_and_result(self):
        job = enqueue("ops.noop", {"steps": 3}, subject="test:1")
        done = run_once(heartbeat=False)
        self.assertEqual(done.id, job.id)
        self.assertEqual(done.status, "done")
        self.assertEqual(done.result, {"steps": 3})
        self.assertEqual(done.progress["percent"], 100)
        self.assertEqual(JobStep.objects.filter(job=job, status="done").count(), 3)
        self.assertIsNotNone(done.finished_at)
        self.assertIsNone(run_once(heartbeat=False), "the queue is empty now")

    def test_failure_is_recorded_and_not_retried_beyond_max_attempts(self):
        job = enqueue("ops.noop", {"steps": 1, "fail": True})
        done = run_once(heartbeat=False)
        self.assertEqual(done.status, "failed")
        self.assertIn("forced failure", done.error)
        self.assertEqual(done.attempts, 1)
        self.assertEqual(Job.objects.get(id=job.id).status, "failed")

    def test_retry_requeues_with_backoff_while_attempts_remain(self):
        job = enqueue("ops.noop", {"steps": 1, "fail": True})
        Job.objects.filter(id=job.id).update(max_attempts=2)
        first = run_once(heartbeat=False)
        self.assertEqual(first.status, "queued")
        self.assertEqual(first.attempts, 1)
        self.assertGreater(first.run_after, utc_now())
        # Not claimable until run_after passes
        self.assertIsNone(claim())
        Job.objects.filter(id=job.id).update(run_after=utc_now() - timedelta(seconds=1))
        second = run_once(heartbeat=False)
        self.assertEqual(second.status, "failed")
        self.assertEqual(second.attempts, 2)

    def test_priority_then_age_decides_the_order(self):
        low = enqueue("ops.noop", {"steps": 1}, priority=0)
        high = enqueue("ops.noop", {"steps": 1}, priority=5)
        self.assertEqual(run_once(heartbeat=False).id, high.id)
        self.assertEqual(run_once(heartbeat=False).id, low.id)

    def test_cancel_request_stops_the_job_between_steps(self):
        job = enqueue("ops.noop", {"steps": 2})
        Job.objects.filter(id=job.id).update(cancel_requested=True)
        done = run_once(heartbeat=False)
        self.assertEqual(done.status, "cancelled")
        self.assertEqual(JobStep.objects.filter(job=job).count(), 0)

    def test_stale_running_jobs_are_requeued(self):
        job = enqueue("ops.noop", {"steps": 1})
        Job.objects.filter(id=job.id).update(status="running", locked_by="dead",
                                             heartbeat_at=utc_now() - timedelta(minutes=10))
        self.assertEqual(recover_stale(), 1)
        self.assertEqual(Job.objects.get(id=job.id).status, "queued")
        # A fresh heartbeat is left alone
        Job.objects.filter(id=job.id).update(status="running", heartbeat_at=utc_now())
        self.assertEqual(recover_stale(), 0)


class JobsApiTests(TestCase):

    def setUp(self):
        self.admin, self.user = create_admin(), create_user()
        self.mine = enqueue("ops.noop", {"steps": 1}, created_by=self.user, subject="s:1")
        self.theirs = enqueue("ops.noop", {"steps": 1}, created_by=self.admin)

    def test_counts_per_status(self):
        self.assertEqual(signed_in(self.user).get("/api/jobs/counts").json()["queued"], 1)
        counts = signed_in(self.admin).get("/api/jobs/counts").json()
        self.assertEqual((counts["queued"], counts["done"]), (2, 0))

    def test_users_see_own_jobs_admins_see_all(self):
        self.assertEqual(len(signed_in(self.user).get("/api/jobs").json()["jobs"]), 1)
        self.assertEqual(len(signed_in(self.admin).get("/api/jobs").json()["jobs"]), 2)
        self.assertEqual(signed_in(self.user).get(f"/api/jobs/{self.theirs.id}").status_code, 404)
        self.assertEqual(len(signed_in(self.admin).get("/api/jobs?subject=s:1").json()["jobs"]), 1)
        self.assertEqual(signed_in(self.admin).get("/api/jobs?status=bogus").status_code, 400)

    def test_a_job_about_a_legal_act_names_the_act(self):
        now = utc_now()
        act = lambda slug, title, short: LegalDocument.objects.create(
            id=f"act-{slug}", slug=slug, title=title, short_title=short, jurisdiction="EU", created_at=now, updated_at=now)
        mica = act("mica", "Regulation (EU) 2023/1114 on markets in crypto-assets", "MiCA")
        long_title = "Lietuvos banko valdybos nutarimas dėl informacinių ir ryšių technologijų ir saugumo rizikos valdymo reikalavimų aprašo"
        untitled = act("lb", long_title, "")
        reading = enqueue("corpus.extract_obligations", {"document_id": mica.id}, subject=f"obligations:{mica.id}")
        fetching = enqueue("corpus.ingest", {"document_id": untitled.id}, subject=f"corpus:{untitled.id}", created_by=self.user)
        enqueue("corpus.reembed", {}, subject="corpus:reembed")
        enqueue("corpus.ingest", {"document_id": "gone"}, subject="corpus:gone")
        admin = signed_in(self.admin)
        with self.assertNumQueries(5):
            # the request's savepoint and its release, the session,
            # the jobs, and one query for all the acts' names
            listed = admin.get("/api/jobs").json()["jobs"]
        titles = {job["subject"]: job["subjectTitle"] for job in listed}
        self.assertEqual(titles, {f"obligations:{mica.id}": "MiCA", f"corpus:{untitled.id}": long_title[:80], "corpus:reembed": None,
                                  "corpus:gone": None, "s:1": None, None: None})
        self.assertEqual(admin.get(f"/api/jobs/{reading.id}").json()["subjectTitle"], "MiCA")
        self.assertEqual(signed_in(self.user).post(f"/api/jobs/{fetching.id}/cancel").json()["subjectTitle"], long_title[:80])

    def test_get_includes_steps_after_a_run(self):
        run_once(heartbeat=False)
        run_once(heartbeat=False)
        body = signed_in(self.user).get(f"/api/jobs/{self.mine.id}").json()
        self.assertEqual(body["status"], "done")
        self.assertEqual(len(body["steps"]), 1)
        self.assertEqual(body["steps"][0]["name"], "noop-1")

    def test_cancel_queued_is_immediate_and_finished_is_409(self):
        r = signed_in(self.user).post(f"/api/jobs/{self.mine.id}/cancel")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "cancelled")
        self.assertEqual(signed_in(self.user).post(f"/api/jobs/{self.mine.id}/cancel").status_code, 409)
        self.assertIsNone(Job.objects.filter(id=self.mine.id, status="queued").first())


class StepUsageTests(TestCase):

    def setUp(self):
        self.job = enqueue("ops.noop", {"steps": 1})
        self.ctx = JobContext(self.job)

    def test_a_done_step_records_its_calls_the_most_used_model_and_its_one_prompt_version(self):
        with self.ctx.step("documents") as step:
            log_call(step.row.id, TERRA, 1000, 200, "0.0044", version="pv-inventory")
            log_call(step.row.id, TERRA, 3000, 800, "0.0156", version="pv-inventory")
            # The embedding calls run on no prompt: one version was used
            log_call(step.row.id, EMBED, 500, 0, "0.00001")
        row = JobStep.objects.get(id=step.row.id)
        self.assertEqual((row.status, row.model, row.prompt_version_id), ("done", TERRA, "pv-inventory"))
        self.assertEqual(row.usage, {
            "calls": 3, "inputTokens": 4500, "outputTokens": 1000, "costUsd": 0.02001,
            "models": [{"model": TERRA, "calls": 2, "inputTokens": 4000, "outputTokens": 1000, "costUsd": 0.02},
                       {"model": EMBED, "calls": 1, "inputTokens": 500, "outputTokens": 0, "costUsd": 0.00001}],
        })

    def test_a_failed_step_records_what_it_spent_before_the_failure(self):
        with self.assertRaises(RuntimeError):
            with self.ctx.step("summary") as step:
                log_call(step.row.id, GPT, 16200, 2700, "0.162", version="pv-summary")
                raise RuntimeError("[504] GATEWAY_ERROR: Upstream request timed out")
        row = JobStep.objects.get(id=step.row.id)
        self.assertEqual((row.status, row.error), ("failed", "[504] GATEWAY_ERROR: Upstream request timed out"))
        self.assertEqual((row.model, row.prompt_version_id), (GPT, "pv-summary"))
        self.assertEqual((row.usage["calls"], row.usage["inputTokens"], row.usage["costUsd"]), (1, 16200, 0.162))
        self.assertIsNotNone(row.duration_ms)

    def test_several_prompt_versions_name_none_and_a_tie_in_calls_goes_to_the_costlier_model(self):
        with self.ctx.step("gap_analysis") as step:
            log_call(step.row.id, TERRA, 12000, 5000, "0.084", version="pv-gap-1")
            log_call(step.row.id, GPT, 12000, 5000, "0.21", version="pv-gap-2")
        row = JobStep.objects.get(id=step.row.id)
        self.assertEqual((row.model, row.prompt_version_id), (GPT, None))
        self.assertEqual([m["model"] for m in row.usage["models"]], [GPT, TERRA])

    def test_a_step_without_calls_keeps_what_the_handler_passed(self):
        with self.ctx.step("embed", model=EMBED) as step:
            step.usage = {"pages": 3}
        row = JobStep.objects.get(id=step.row.id)
        self.assertEqual((row.model, row.prompt_version_id, row.usage), (EMBED, None, {"pages": 3}))
        with self.ctx.step("profile") as step:
            pass
        row = JobStep.objects.get(id=step.row.id)
        self.assertEqual((row.model, row.usage), (None, {}))

    def test_the_handlers_own_usage_keys_stay_but_the_counted_numbers_win(self):
        with self.ctx.step("extract", prompt_version_id="pv-own") as step:
            log_call(step.row.id, EMBED, 310, 0, "0.000006")
            step.usage = {"pages": 2, "calls": 99}
        row = JobStep.objects.get(id=step.row.id)
        self.assertEqual((row.usage["pages"], row.usage["calls"]), (2, 1))
        # The calls ran on no prompt version — the handler's stays
        self.assertEqual((row.model, row.prompt_version_id), (EMBED, "pv-own"))

    def test_each_step_counts_only_its_own_calls(self):
        with self.ctx.step("applicability") as first:
            log_call(first.row.id, GPT, 22000, 1800, "0.164", version="pv-applicability")
        with self.ctx.step("gap_analysis") as second:
            for _ in range(3):
                log_call(second.row.id, TERRA, 12000, 5000, "0.084", version="pv-gap")
        rows = {row.name: row for row in JobStep.objects.filter(job=self.job)}
        self.assertEqual((rows["applicability"].usage["calls"], rows["gap_analysis"].usage["calls"]), (1, 3))
        self.assertEqual(rows["gap_analysis"].usage["costUsd"], 0.252)
        self.assertEqual(rows["gap_analysis"].usage["outputTokens"], 15000)

    def test_a_step_a_dead_worker_left_is_failed_with_what_it_had_spent(self):
        Job.objects.filter(id=self.job.id).update(status="running", attempts=1, locked_by="dead",
                                                  heartbeat_at=utc_now() - timedelta(minutes=10))
        JobStep.objects.create(id="s-open", job=self.job, ordinal=1, name="gap_analysis", status="running",
                               started_at=utc_now() - timedelta(minutes=11))
        JobStep.objects.create(id="s-quiet", job=self.job, ordinal=2, name="noop-2", status="running",
                               started_at=utc_now() - timedelta(minutes=11))
        log_call("s-open", TERRA, 12000, 5000, "0.084", version="pv-gap")
        self.assertEqual(recover_stale(), 1)
        opened, quiet = JobStep.objects.get(id="s-open"), JobStep.objects.get(id="s-quiet")
        self.assertEqual((opened.status, opened.error), ("failed", "The worker stopped during this step"))
        self.assertEqual((opened.model, opened.prompt_version_id, opened.usage["calls"]), (TERRA, "pv-gap", 1))
        self.assertEqual((quiet.status, quiet.model, quiet.usage), ("failed", None, {}))

    def test_the_jobs_api_serves_each_steps_model_prompt_version_and_usage(self):
        admin = create_admin()
        seed_defaults()
        version = active_version("report.summary")
        with self.ctx.step("summary") as step:
            log_call(step.row.id, GPT, 16200, 2700, "0.162", version=version.id)
        # A version row that is gone: the bare id stays, no name
        with self.ctx.step("action_plan") as step:
            log_call(step.row.id, GPT, 14800, 3900, "0.191", version="pv-gone")
        body = signed_in(admin).get(f"/api/jobs/{self.job.id}").json()
        served, orphan = body["steps"]
        self.assertEqual((served["model"], served["promptVersionId"], served["prompt"]),
                         (GPT, version.id, {"slug": "report.summary", "version": version.version_no}))
        self.assertEqual((orphan["promptVersionId"], orphan["prompt"]), ("pv-gone", None))
        self.assertEqual(served["usage"], {"calls": 1, "inputTokens": 16200, "outputTokens": 2700, "costUsd": 0.162,
                                           "models": [{"model": GPT, "calls": 1, "inputTokens": 16200,
                                                       "outputTokens": 2700, "costUsd": 0.162}]})


class WorkerLoopTests(SimpleTestCase):

    def setUp(self):
        directory = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, directory, True)
        self.pid_file = os.path.join(directory, "worker.pid")
        for name, path in (("PID_FILE", self.pid_file), ("HEARTBEAT_FILE", os.path.join(directory, "heartbeat"))):
            patcher = mock.patch.object(run_worker, name, path)
            patcher.start()
            self.addCleanup(patcher.stop)

    def process(self, *argv):
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)", *argv])
        self.addCleanup(child.wait)
        self.addCleanup(child.kill)
        return child

    def named(self):
        with open(self.pid_file) as handle:
            return handle.read()

    def name(self, pid):
        with open(self.pid_file, "w") as handle:
            handle.write(str(pid))

    def test_a_new_loop_asks_the_running_one_to_stop_and_names_itself(self):
        old = self.process("run_worker")
        self.name(old.pid)
        run_worker.take_over()
        self.assertEqual(old.wait(timeout=10), -signal.SIGTERM)
        self.assertEqual(self.named(), str(os.getpid()))

    def test_a_reused_pid_that_is_no_worker_loop_is_left_alone(self):
        other = self.process()
        self.name(other.pid)
        run_worker.take_over()
        with self.assertRaises(subprocess.TimeoutExpired):
            other.wait(timeout=0.5)
        self.assertEqual(self.named(), str(os.getpid()))

    def test_a_missing_or_garbled_pid_file_only_names_the_new_loop(self):
        run_worker.take_over()
        self.assertEqual(self.named(), str(os.getpid()))
        self.name("not a pid")
        run_worker.take_over()
        self.assertEqual(self.named(), str(os.getpid()))

    def test_the_pid_file_is_released_only_by_the_loop_it_names(self):
        self.name(os.getpid())
        run_worker.release_pid_file()
        self.assertFalse(os.path.exists(self.pid_file))
        self.name(os.getpid() + 1)
        run_worker.release_pid_file()
        self.assertTrue(os.path.exists(self.pid_file), "a newer loop's file is left alone")

    def test_a_once_run_never_takes_over(self):
        for signum in (signal.SIGTERM, signal.SIGINT):
            self.addCleanup(signal.signal, signum, signal.getsignal(signum))
        with mock.patch.object(run_worker, "take_over") as take_over, \
                mock.patch.object(run_worker, "release_pid_file") as release, \
                mock.patch.object(run_worker, "run_once", return_value=None), \
                mock.patch.object(run_worker, "tick"), mock.patch.object(run_worker.connection, "close"):
            call_command("run_worker", "--once")
        take_over.assert_not_called()
        release.assert_not_called()
