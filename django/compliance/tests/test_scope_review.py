############################################################
#  [*] Tests — a person approves what a report assesses
#
#  A report started with the review stops once it has decided
#  which acts apply, and judges nothing until a person has
#  approved the list. The person may take an act in — one
#  that waits for facts, or one that does not bind the
#  company and is assessed by choice, read whole — and leave
#  one out; the approval is stamped, audited with its changes,
#  and the second part of the run starts from the rows the
#  first left. The price of a selection is asked without
#  changing anything. A waiting report can be cancelled, keeps
#  another from starting, and its two parts are counted as
#  one cost. Without the review a report runs through as it
#  always did.
############################################################


import io

from django.test import TestCase

from compliance.analysis.exports import render_xlsx
from compliance.analysis.models import Finding, Report, ReportAct, ReportCitation
from compliance.analysis.pdf import render_html
from compliance.assistant.models import LlmCall
from compliance.audit.models import AuditLog
from compliance.corpus.models import Obligation
from compliance.jobs.models import Job, JobStep
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_assessment import ACTS, QUESTION, VERDICTS
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.test_pipeline import POLICY, drain
from compliance.tests.utils import create_admin, create_user, post_json, signed_in








class ScopeReviewTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()
        upload = io.BytesIO(POLICY.encode())
        upload.name = "politika.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})
        with fake_models():
            self.acts = {short: ingest_act(self.admin_client, EU_EN, title=title, short_title=short, external_id=celex,
                                           doc_type=kind, applies_to=applies_to)
                         for short, title, celex, kind, applies_to in ACTS}

    # A report started with the review, run until it waits
    def _waiting(self, model):
        model.verdicts = VERDICTS
        started = post_json(self.client_user, "/api/reports",
                            {"companyId": self.company["id"], "language": "lt", "review": True})
        self.assertEqual(started.status_code, 201, started.content)
        drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "scope_review", report.error)
        return report

    def _acts(self, report):
        return {act.short_title: act for act in ReportAct.objects.filter(report=report)}

    def test_a_report_waits_for_its_scope_and_goes_on_when_a_person_approves(self):
        with fake_models() as model:
            report = self._waiting(model)

            # The cheap part is done, nothing is judged yet
            self.assertEqual({short: act.assessment for short, act in self._acts(report).items()},
                             {"MiCA": "assessed", "AMLR": "upcoming", "AI Act": "unconfirmed", "AMLD6": "indirect",
                              "LBĮ": "indirect", "CRR": "none"})
            self.assertTrue(ReportCitation.objects.filter(report=report).exists())
            self.assertFalse(Finding.objects.filter(report=report).exists())
            self.assertFalse(Obligation.objects.exists(), "no act is read for obligations before the approval")
            self.assertIsNone(report.scope_approved_at)
            self.assertIsNone(report.finished_at)
            first_job = report.job_id
            first_tokens = report.stats["tokens"]
            self.assertGreater(first_tokens, 0)
            self.assertEqual([name for name, _ in model.calls if name in ("findings", "action_plan", "summary")], [])
            wire = self.client_user.get(f"/api/reports/{report.id}").json()
            self.assertEqual((wire["status"], wire["scopeApprovedAt"], len(wire["acts"])), ("scope_review", None, 6))

            # Another report of the company does not start meanwhile
            second = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"]})
            self.assertEqual((second.status_code, second.json()["code"]), (409, "ALREADY_RUNNING"))

            # Approved as it stands: the second part runs from the rows the first left
            approved = post_json(self.client_user, f"/api/reports/{report.id}/scope", {"approved": True})
            self.assertEqual(approved.status_code, 200, approved.content)
            self.assertEqual((approved.json()["status"], approved.json()["scopeApprovedBy"]), ("queued", self.user.id))
            drain()
        report.refresh_from_db()
        self.assertEqual(report.status, "done", report.error)
        self.assertNotEqual(report.job_id, first_job)
        self.assertEqual(report.scope_approved_by_id, self.user.id)
        self.assertEqual(set(Finding.objects.filter(report=report).values_list("short_title", flat=True)),
                         {"MiCA", "AMLR"})
        self.assertEqual(len(self._acts(report)), 6, "the acts are not judged a second time")
        self.assertEqual(len([name for name, _ in model.calls if name == "applicability"]), 2)

        # Both parts are one report's cost
        steps = JobStep.objects.filter(job__subject=f"report:{report.id}")
        self.assertEqual(Job.objects.filter(subject=f"report:{report.id}").count(), 2)
        calls = LlmCall.objects.filter(job_step_id__in=steps.values_list("id", flat=True))
        self.assertEqual(report.stats["tokens"], sum(call.input_tokens + call.output_tokens for call in calls))
        self.assertGreater(report.stats["tokens"], first_tokens)
        row = AuditLog.objects.get(action="reports.approve_scope")
        self.assertEqual((row.target_id, row.details), (report.id, {"changes": []}))

    def test_a_person_takes_acts_in_and_leaves_acts_out(self):
        with fake_models() as model:
            report = self._waiting(model)
            acts = self._acts(report)
            choices = {acts["CRR"].id: "assess", acts["AI Act"].id: "assess", acts["MiCA"].id: "skip",
                       acts["AMLD6"].id: "skip"}

            # The price of the selection is asked first, and changes nothing
            priced = post_json(self.client_user, f"/api/reports/{report.id}/scope", {"acts": choices})
            self.assertEqual(priced.status_code, 200, priced.content)
            estimate = priced.json()["estimate"]
            self.assertEqual({row["id"] for row in estimate["acts"]},
                             {acts["CRR"].id, acts["AI Act"].id, acts["AMLR"].id})
            self.assertTrue(all(row["toExtract"] for row in estimate["acts"]))
            self.assertIn("pricesKnown", estimate)
            self.assertIn("remaining", priced.json()["budget"])
            self.assertEqual(self._acts(report)["CRR"].assessment, "none")
            self.assertEqual(Report.objects.get(id=report.id).status, "scope_review")

            approved = post_json(self.client_user, f"/api/reports/{report.id}/scope",
                                 {"acts": choices, "approved": True})
            self.assertEqual(approved.status_code, 200, approved.content)
            drain()
        report.refresh_from_db()
        self.assertEqual(report.status, "done", report.error)
        acts = self._acts(report)

        # The verdicts stay; what the report does with the acts is the person's
        self.assertEqual({short: (act.applicability, act.assessment, act.screened_out) for short, act in acts.items()}, {
            "MiCA": ("applies", "none", False), "AMLR": ("applies", "upcoming", False),
            "AI Act": ("uncertain", "assessed", False), "AMLD6": ("applies", "indirect", False),
            "LBĮ": ("applies", "indirect", False), "CRR": ("not_applies", "assessed", False)})
        self.assertEqual(set(Finding.objects.filter(report=report).values_list("short_title", flat=True)),
                         {"CRR", "AI Act", "AMLR"})

        # An act assessed by choice is read whole and judged as if addressed to the company
        self.assertTrue(Obligation.objects.filter(document=self.acts["CRR"]).exists())
        chosen = [prompt for name, prompt in model.calls
                  if name == "findings" and "ACT: Capital requirements regulation" in prompt]
        self.assertTrue(chosen)
        for prompt in chosen:
            self.assertIn("by its own choice, as good practice", prompt)

        # The summary and the exports say what the person decided
        summary = next(prompt for name, prompt in model.calls if name == "summary")
        self.assertIn("- CRR: does not bind the company — assessed by the company's own choice", summary)
        self.assertIn("\n- MiCA", summary[summary.index("ACTS LEFT OUT (NOT assessed"):summary.index("ACTION PLAN")])
        html = render_html(report)
        self.assertIn("Neprivalomi — įvertinti įmonės pasirinkimu", html)
        self.assertIn("Taikomi — apimtį tvirtinusio asmens sprendimu nevertinti", html)
        self.assertRegex(html, r"Vertinamų aktų sąrašą patvirtino</td><td>Tomas, \d{4}-\d\d-\d\d<")
        self.assertTrue(render_xlsx(report))
        changes = AuditLog.objects.get(action="reports.approve_scope").details["changes"]
        self.assertEqual(sorted((c["act"], c["from"], c["to"]) for c in changes),
                         [("AI Act", "unconfirmed", "assessed"), ("CRR", "none", "assessed"), ("MiCA", "assessed", "none")])

    def test_the_approval_is_refused_when_it_cannot_stand(self):
        with fake_models() as model:
            report = self._waiting(model)
            acts = self._acts(report)
            path = f"/api/reports/{report.id}/scope"

            def refused(body, client=None):
                answer = post_json(client or self.client_user, path, body)
                return answer.status_code, answer.json()["code"]

            self.assertEqual(refused({"acts": {"no-such-act": "assess"}}), (400, "INVALID_FIELD"))
            self.assertEqual(refused({"acts": {acts["MiCA"].id: "maybe"}}), (400, "INVALID_FIELD"))
            self.assertEqual(refused({"acts": [acts["MiCA"].id]}), (400, "INVALID_FIELD"))
            self.assertEqual(refused({"approved": "yes"}), (400, "INVALID_FIELD"))
            self.assertEqual(refused({"acts": {acts["MiCA"].id: "skip", acts["AMLR"].id: "skip"}, "approved": True}),
                             (400, "NOTHING_TO_ASSESS"))
            self.assertEqual(refused({"approved": True}, signed_in(create_user("kitas@knf.vu.lt"))), (404, "NOT_FOUND"))
            self.assertEqual(Report.objects.get(id=report.id).status, "scope_review")

            # Approved once; a second approval finds nothing waiting
            self.assertEqual(post_json(self.client_user, path, {"approved": True}).status_code, 200)
            self.assertEqual(refused({"approved": True}), (409, "NOT_WAITING"))
            drain()
        self.assertEqual(Report.objects.get(id=report.id).status, "done")

    def test_a_waiting_report_is_cancelled_and_frees_the_company(self):
        with fake_models() as model:
            report = self._waiting(model)
            cancelled = post_json(self.client_user, f"/api/reports/{report.id}/cancel", {})
            self.assertEqual((cancelled.status_code, cancelled.json()["status"]), (200, "cancelled"))
            report.refresh_from_db()
            self.assertIsNotNone(report.finished_at)
            again = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"]})
            self.assertEqual(again.status_code, 201, again.content)
            drain()

    def test_the_report_shows_the_company_its_findings_were_judged_on(self):
        # The second part reads the company again. A licence
        # verified while the report waited is relied on by the
        # gap analysis — so the report must show it verified,
        # not the company of the day the report was started
        with fake_models() as model:
            report = self._waiting(model)
            self.assertEqual(report.profile_snapshot["credentials"], [])
            added = post_json(self.client_user, f"/api/companies/{self.company['id']}/credentials",
                              {"kind": "license", "name": "CASP leidimas", "issuer": "Lietuvos bankas",
                               "status": "verified"})
            self.assertEqual(added.status_code, 201, added.content)
            approved = post_json(self.client_user, f"/api/reports/{report.id}/scope", {"approved": True})
            self.assertEqual(approved.status_code, 200, approved.content)
            drain()
        report.refresh_from_db()
        self.assertEqual(report.status, "done", report.error)
        judged = next(prompt for name, prompt in model.calls if name == "findings")
        self.assertIn("license: CASP leidimas; issuer Lietuvos bankas", judged)
        self.assertEqual([(c["name"], c["status"]) for c in report.profile_snapshot["credentials"]],
                         [("CASP leidimas", "verified")])

    def test_without_the_review_a_report_runs_through_and_stamps_itself(self):
        with fake_models() as model:
            model.verdicts = VERDICTS
            started = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt"})
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        self.assertIsNotNone(report.scope_approved_at)
        self.assertIsNone(report.scope_approved_by_id)
        self.assertEqual(Job.objects.filter(subject=f"report:{report.id}").count(), 1)
        self.assertIn("Niekas — ataskaita paleista be apimties peržiūros", render_html(report))
        self.assertEqual(self._acts(report)["AI Act"].conditions_to_verify, QUESTION)
        refused = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "review": "yes"})
        self.assertEqual((refused.status_code, refused.json()["code"]), (400, "INVALID_FIELD"))
