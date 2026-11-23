############################################################
#  [*] Tests — the company's own rules as criteria
#
#  A report started with the `internal` option reads the
#  requirements out of the company's policy-level documents
#  — those its compliance policy places on level 1 or 2, or
#  the documents filed as policies when it has no policy
#  product — once per document text, and judges each against
#  the whole library. The findings hang on an act row of
#  their own, are counted apart from the acts, keep the
#  passage of the policy as their criterion, and go into the
#  action plan. Without the option a report has none of it;
#  without a policy-level document the step adds nothing. The
#  estimate prices the option when asked.
############################################################


import io

from django.test import TestCase
from openpyxl import load_workbook

from compliance.analysis.exports import render_xlsx
from compliance.analysis.internal import source_documents
from compliance.analysis.pdf import render_html
from compliance.analysis.models import Action, Finding, Report, ReportAct
from compliance.companies.models import Company, CompanyDocument
from compliance.corpus.models import Obligation
from compliance.jobs.models import JobStep
from compliance.programme.models import WorkProduct
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.test_pipeline import POLICY, drain
from compliance.tests.utils import create_admin, create_user, post_json, signed_in
from compliance.common.timestamps import utc_now


PROCEDURE = "# Atsarginių kopijų procedūra\n\nKopijos daromos kasdien. Atkūrimo bandymą atlieka sistemos administratorius.\n"








class InternalRequirementTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()
        for name, text, kind in (("politika.md", POLICY, "policy"), ("kopijos.md", PROCEDURE, "procedure")):
            upload = io.BytesIO(text.encode())
            upload.name = name
            answer = self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"], "kind": kind})
            self.assertEqual(answer.status_code, 201, answer.content)
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        self.policy = CompanyDocument.objects.get(company_id=self.company["id"], title="politika.md")
        self.procedure = CompanyDocument.objects.get(company_id=self.company["id"], title="kopijos.md")

    def _report(self, **options):
        started = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt", **options})
        self.assertEqual(started.status_code, 201, started.content)
        drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        return report

    def test_a_report_with_the_option_judges_the_procedures_against_the_policies(self):
        self.assertEqual((self.policy.kind, self.procedure.kind), ("policy", "procedure"))
        self.assertEqual(source_documents(Company.objects.get(id=self.company["id"])), [self.policy])
        with fake_models() as model:
            report = self._report(internal=True)
            read = [prompt for name, prompt in model.calls if name == "internal_requirements"]
            judged = [prompt for name, prompt in model.calls if name == "findings" and "INTERNAL POLICY" in prompt]
        self.assertEqual(report.scope, {"documentIds": [], "internal": True})

        # The policy is read once, whole; the procedure is evidence, not a source
        self.assertEqual(len(read), 1)
        self.assertIn('<document title="politika.md" kind="policy">', read[0])
        rows = list(Obligation.objects.filter(source_kind="internal", company_id=self.company["id"]).order_by("created_at", "id"))
        self.assertEqual([(o.title, o.category, o.severity, o.status, o.company_document_id) for o in rows], [
            ("Peržiūrėti prieigos teises (politika.md)", "ict_security", "high", "proposed", self.policy.id),
            ("Tikrinti atsargines kopijas", "other", "medium", "proposed", self.policy.id)])
        placed, unplaced = rows[0].citations[0], rows[1].citations[0]
        self.assertEqual((placed["path"], placed["documentId"], placed["documentTitle"], placed["start"]),
                         ("5.2", self.policy.id, "politika.md", 0))
        self.assertIsNone(unplaced["start"], "a quote the policy does not hold keeps no place")
        self.assertEqual(CompanyDocument.objects.get(id=self.policy.id).requirements_key.split(":")[0], self.policy.sha256)

        # One call for the policy's requirements, with the whole library as shared data
        self.assertEqual(len(judged), 1)
        self.assertIn('INTERNAL POLICY: "politika.md" — a rule-setting document of the company itself', judged[0])
        self.assertIn('<obligation ref="O1" section="5.2" category="ict_security">', judged[0])
        self.assertIn("Requirement: Prieigos teisės peržiūrimos kas pusmetį.", judged[0])
        self.assertIn('title="kopijos.md"', judged[0])

        # A group of its own: one act row, its findings after the others, counted apart
        act = ReportAct.objects.get(report=report, doc_type="internal")
        self.assertEqual((act.document_title, act.short_title, act.applicability, act.assessment, act.document_id),
                         ("Įmonės vidaus reikalavimai", "Vidaus reikalavimai", "applies", "assessed", None))
        own = list(Finding.objects.filter(report=report, act=act).order_by("order"))
        legal = Finding.objects.filter(report=report).exclude(act=act)
        self.assertEqual(len(own), 2)
        self.assertTrue(all(f.source_kind == "internal" and f.consequence == [] and not f.obligation_reviewed for f in own))
        self.assertGreater(min(f.order for f in own), max(legal.values_list("order", flat=True)))
        self.assertEqual({f.citations[0]["documentTitle"] for f in own}, {"politika.md"})
        stats = Report.objects.get(id=report.id).stats
        self.assertEqual(sum(stats["internal"]["findings"].values()), 2)
        self.assertEqual(sum(stats["findings"].values()), legal.count(), "the headline counts are the acts' alone")
        self.assertEqual(stats["acts"]["applies"], ReportAct.objects.filter(report=report, applicability="applies")
                         .exclude(doc_type="internal").count())
        step = JobStep.objects.get(job=report.job, name="internal")
        self.assertEqual((step.output["documents"], step.output["read"], step.output["requirements"]), (1, 1, 2))
        steps = list(JobStep.objects.filter(job=report.job).order_by("ordinal").values_list("name", flat=True))
        self.assertEqual(steps[steps.index("gap_analysis") + 1], "internal")

        # The open ones are planned with the rest; the API serves the group like any other
        planned = {fid for action in Action.objects.filter(report=report) for fid in action.finding_ids}
        self.assertTrue({f.id for f in own if f.status in ("missing", "partial")} <= planned)
        served = self.client_user.get(f"/api/reports/{report.id}").json()
        row = next(a for a in served["acts"] if a["docType"] == "internal")
        self.assertEqual(row["documentTitle"], "Įmonės vidaus reikalavimai")
        finding = next(f for f in served["findings"] if f["sourceKind"] == "internal")
        self.assertEqual((finding["actId"], finding["citations"][0]["documentId"]), (row["id"], self.policy.id))

        # The exports keep the group apart too: no act among the acts, a table of its own beside the
        # result, the findings a last group under a note, each cited by the policy it comes from
        page = render_html(Report.objects.get(id=report.id))
        self.assertIn("<h4>Įmonės vidaus reikalavimų laikymasis</h4>", page)
        self.assertIn("ne teisės aktų pažeidimai; į bendrą rezultatą jos neįskaičiuotos", page)
        self.assertIn("<h3>Įmonės vidaus reikalavimai</h3>", page)
        self.assertNotIn("Vidaus reikalavimai</td><td>Taikomas", page.replace("\n", ""))
        self.assertIn("politika.md 5.2", page)
        self.assertLess(page.index('<h3>Įmonės vidaus reikalavimų laikymasis</h3>'), page.index("politika.md 5.2"))
        sheet = load_workbook(io.BytesIO(render_xlsx(Report.objects.get(id=report.id))))["Išvados"]
        cited = [row[2] for row in sheet.iter_rows(min_row=2, values_only=True) if row[1] == "Vidaus reikalavimai"]
        self.assertEqual(sorted(cited), ["politika.md", "politika.md 5.2"])

        # The next report reads nothing anew; a changed text is read again; a person's verdicts survive
        Obligation.objects.filter(id=rows[0].id).update(status="approved")
        Obligation.objects.filter(id=rows[1].id).update(status="rejected")
        with fake_models() as model:
            again = self._report(internal=True)
            self.assertEqual(sum(name == "internal_requirements" for name, _ in model.calls), 0)
        own_again = Finding.objects.filter(report=again, source_kind="internal")
        self.assertEqual([(f.obligation_id, f.obligation_reviewed) for f in own_again], [(rows[0].id, True)],
                         "a rejected requirement is not assessed, an approved one is marked reviewed")
        CompanyDocument.objects.filter(id=self.policy.id).update(sha256="changed")
        with fake_models() as model:
            self._report(internal=True)
            self.assertEqual(sum(name == "internal_requirements" for name, _ in model.calls), 1)
        kept = Obligation.objects.filter(source_kind="internal", company_id=self.company["id"])
        self.assertEqual(sorted(kept.values_list("status", flat=True)), ["approved", "proposed", "proposed", "rejected"])

    def test_a_requirement_read_again_from_the_same_passage_keeps_its_id(self):
        with fake_models():
            first = self._report(internal=True)
        rows = list(Obligation.objects.filter(source_kind="internal", company_id=self.company["id"]).order_by("created_at", "id"))
        own = Finding.objects.filter(report=first, source_kind="internal")
        self.assertEqual(set(own.values_list("obligation_id", flat=True)), {rows[0].id, rows[1].id})

        # The policy's first line is rewritten. Read again, the requirement stated elsewhere is the same
        # requirement — the earlier finding still knows it; the one that line stated is a new one
        policy = CompanyDocument.objects.get(id=self.policy.id)
        CompanyDocument.objects.filter(id=policy.id).update(text="# Nauja antraštė\n" + policy.text.split("\n", 1)[1],
                                                            sha256="edited")
        with fake_models() as model:
            self._report(internal=True)
            self.assertEqual(sum(name == "internal_requirements" for name, _ in model.calls), 1)
        again = list(Obligation.objects.filter(source_kind="internal", company_id=self.company["id"]).order_by("created_at", "id"))
        self.assertEqual(len(again), 2)
        self.assertEqual(again[1].id, rows[1].id, "the same passage is the same requirement")
        self.assertNotEqual(again[0].id, rows[0].id, "a passage that changed states a new one")
        self.assertEqual(set(own.values_list("obligation_id", flat=True)), {None, rows[1].id})

    def test_without_the_option_or_without_a_policy_there_is_no_group(self):
        with fake_models() as model:
            report = self._report()
            self.assertEqual(sum(name == "internal_requirements" for name, _ in model.calls), 0)
        self.assertFalse(ReportAct.objects.filter(report=report, doc_type="internal").exists())
        self.assertNotIn("internal", Report.objects.get(id=report.id).stats)
        self.assertFalse(JobStep.objects.filter(job=report.job, name="internal").exists())
        self.assertEqual(post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "internal": "yes"})
                         .json()["code"], "INVALID_FIELD")

        CompanyDocument.objects.filter(id=self.policy.id).update(kind="other")
        with fake_models() as model:
            report = self._report(internal=True)
            self.assertEqual(sum(name == "internal_requirements" for name, _ in model.calls), 0)
        self.assertEqual(JobStep.objects.get(job=report.job, name="internal").output,
                         {"documents": 0, "skipped": "no policy-level documents"})
        self.assertFalse(ReportAct.objects.filter(report=report, doc_type="internal").exists())

    def test_the_policy_products_hierarchy_names_the_sources_and_the_estimate_prices_them(self):
        company = Company.objects.get(id=self.company["id"])
        path = f"/api/reports/estimate?companyId={company.id}"
        plain = self.client_user.get(path).json()
        self.assertNotIn("internal", plain)
        self.assertEqual(plain["policyDocuments"], 1, "the plain estimate says whether the option has anything to read")
        priced = self.client_user.get(path + "&internal=true").json()
        self.assertEqual((priced["internal"]["documents"], priced["internal"]["requirements"]), (1, 8))
        self.assertAlmostEqual(priced["totalUsd"], round(plain["totalUsd"] + priced["internal"]["usd"], 2), places=2)

        # With a compliance policy product, its hierarchy decides: level 1 and 2 are sources, whatever their kind
        WorkProduct.objects.create(
            id="p1", company=company, kind="policy", version=1, status="draft", created_by=self.user, created_at=utc_now(),
            content={"hierarchy": [{"documentId": self.policy.id, "level": 3}, {"documentId": self.procedure.id, "level": 2}]})
        self.assertEqual(source_documents(company), [self.procedure])
        WorkProduct.objects.create(
            id="p2", company=company, kind="policy", version=2, status="draft", created_by=self.user, created_at=utc_now(),
            content={"hierarchy": [{"documentId": self.policy.id, "level": 0}, {"documentId": self.procedure.id, "level": 0}]})
        self.assertEqual(source_documents(company), [self.policy], "a hierarchy without a policy level falls back to the kind")
        WorkProduct.objects.filter(id="p1").update(status="approved")
        self.assertEqual(source_documents(company), [self.procedure], "the approved policy goes before a newer draft")
