############################################################
#  [*] Tests — the judge of the register
#
#  Every obligation a model read out of an act is compared
#  with the full text of the provisions it cites, and the
#  verdict — supported, partly, unsupported — is kept on the
#  obligation with a note. It orders a person's review: the
#  list filters by verdict and puts the doubtful first. It
#  decides nothing: the obligations stay proposed. Only the
#  unjudged are read the next time, an edited text loses its
#  verdict, an obligation whose provisions are gone is marked
#  without a call, and the command queues the acts that still
#  hold unjudged obligations.
############################################################


import io

from django.core.management import call_command
from django.test import TestCase

from compliance.audit.models import AuditLog
from compliance.corpus.models import Obligation
from compliance.jobs.models import Job, JobStep
from compliance.jobs.runner import run_once
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.utils import create_admin, create_user, patch_json, post_json, signed_in


DOUBT = {"verdict": "partly", "issue": "addressee", "note": "Art. 2 binds issuers, not every provider."}








class VerifyObligationsTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin = create_admin()
        self.admin_client = signed_in(self.admin)
        with fake_models():
            self.mica = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                                   external_id="32023R1114")
            self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/extract-obligations")
            while run_once(heartbeat=False):
                pass
        self.first, self.second = Obligation.objects.order_by("title")
        self.path = f"/api/corpus/documents/{self.mica.id}/verify-obligations"

    # The judge, queued through the route and run
    def _verify(self, checks=None, body=None):
        with fake_models() as model:
            model.checks = checks or {}
            queued = post_json(self.admin_client, self.path, body or {})
            self.assertEqual(queued.status_code, 202, queued.content)
            while run_once(heartbeat=False):
                pass
        return model, Job.objects.get(id=queued.json()["id"])

    def _listed(self, query):
        return [row["title"] for row in self.admin_client.get(f"/api/obligations?{query}").json()["obligations"]]

    def test_the_judge_marks_each_obligation_and_orders_the_review(self):
        model, job = self._verify({self.second.title: DOUBT})
        self.assertEqual(job.status, "done", job.error)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual((self.first.verification["verdict"], self.first.verification["issue"]), ("supported", "none"))
        self.assertEqual({key: self.second.verification[key] for key in ("verdict", "issue", "note")}, DOUBT)
        self.assertEqual(self.second.verification["model"], "gateway:fake-model")
        self.assertTrue(self.second.verification["checkedAt"])
        self.assertEqual({self.first.status, self.second.status}, {"proposed"}, "the judge approves nothing")
        self.assertEqual(JobStep.objects.get(job=job, name="verify").output,
                         {"supported": 1, "partly": 1, "unsupported": 0})
        self.assertEqual(AuditLog.objects.get(action="obligations.verify").target_id, self.mica.id)

        # The judge read the whole article around what each obligation cites
        read = next(prompt for name, prompt in model.calls if name == "checks")
        self.assertIn("ACT: Markets in crypto-assets", read)
        self.assertRegex(read, r'<provision ref="P1" path="[^"]+">\n')
        self.assertRegex(read, r'<obligation ref="O1" in="P\d" cites="[^"]+">\nTitle: ' + self.first.title.replace("(", r"\(").replace(")", r"\)"))

        # The review starts where the judge doubts
        self.assertEqual(self._listed("verification=doubt"), [self.second.title])
        self.assertEqual(self._listed("verification=supported"), [self.first.title])
        self.assertEqual(self._listed("verification=unchecked"), [])
        self.assertEqual(self._listed("order=review"), [self.second.title, self.first.title])
        wire = self.admin_client.get(f"/api/obligations/{self.second.id}").json()
        self.assertEqual(wire["verification"]["note"], DOUBT["note"])

    def test_only_the_unjudged_are_read_again_and_an_edited_text_loses_its_verdict(self):
        self._verify()
        edited = patch_json(self.admin_client, f"/api/obligations/{self.first.id}", {"text": "Teikėjas privalo gauti leidimą."})
        self.assertEqual((edited.status_code, edited.json()["verification"]), (200, None))
        kept = patch_json(self.admin_client, f"/api/obligations/{self.second.id}", {"severity": "high"})
        self.assertEqual(kept.json()["verification"]["verdict"], "supported", "a new weight is not a new text")
        self.assertEqual(self._listed("verification=unchecked"), [self.first.title])

        model, _ = self._verify()
        read = [prompt for name, prompt in model.calls if name == "checks"]
        self.assertEqual(len(read), 1)
        self.assertEqual(read[0].count("<obligation "), 1, "only the unjudged obligation is read")
        self.assertIn("Teikėjas privalo gauti leidimą.", read[0])
        self.assertEqual(self._listed("verification=unchecked"), [])

        # Nothing left: no call. Everything again: both are read
        model, _ = self._verify()
        self.assertEqual([name for name, _ in model.calls if name == "checks"], [])
        model, _ = self._verify(body={"again": True})
        self.assertEqual(sum(prompt.count("<obligation ") for name, prompt in model.calls if name == "checks"), 2)

    def test_an_obligation_whose_provisions_are_gone_is_marked_without_a_call(self):
        Obligation.objects.filter(id=self.first.id).update(citations=[{"path": "99 str.", "unitId": "no-such-unit"}])
        Obligation.objects.filter(id=self.second.id).update(status="rejected")
        model, job = self._verify()
        self.assertEqual(job.status, "done", job.error)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual((self.first.verification["verdict"], self.first.verification["model"]), ("unsupported", None))
        self.assertIn("current version", self.first.verification["note"])
        self.assertIsNone(self.second.verification, "a rejected obligation is not judged")
        self.assertEqual([name for name, _ in model.calls if name == "checks"], [])

    def test_the_command_queues_the_acts_that_hold_unjudged_obligations(self):
        out = io.StringIO()
        call_command("verify_obligations", stdout=out)
        self.assertIn("Queued: mica (2 obligations)", out.getvalue().replace(self.mica.slug, "mica"))
        self.assertIn("1 act(s) queued, 2 obligations to judge with corpus.verify_obligations v1", out.getvalue())
        again = io.StringIO()
        call_command("verify_obligations", stdout=again)
        self.assertIn("Already waiting", again.getvalue())
        with fake_models():
            while run_once(heartbeat=False):
                pass
        self.assertEqual(self._listed("verification=unchecked"), [])
        nothing = io.StringIO()
        call_command("verify_obligations", stdout=nothing)
        self.assertIn("0 act(s) queued, 0 obligations to judge", nothing.getvalue())
        anew = io.StringIO()
        call_command("verify_obligations", "--again", stdout=anew)
        self.assertIn("1 act(s) queued, 2 obligations to judge", anew.getvalue())

    def test_the_judge_is_the_admins_to_start(self):
        user_client = signed_in(create_user())
        refused = post_json(user_client, self.path, {})
        self.assertEqual((refused.status_code, refused.json()["code"]), (403, "FORBIDDEN"))
        wrong = post_json(self.admin_client, self.path, {"again": "yes"})
        self.assertEqual((wrong.status_code, wrong.json()["code"]), (400, "INVALID_FIELD"))
        missing = post_json(self.admin_client, "/api/corpus/documents/no-such-act/verify-obligations", {})
        self.assertEqual(missing.status_code, 404)

        # A second request while the judge waits answers the same job
        with fake_models():
            first = post_json(self.admin_client, self.path, {}).json()
            second = post_json(self.admin_client, self.path, {}).json()
        self.assertEqual(first["id"], second["id"])
