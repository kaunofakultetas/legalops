############################################################
#  [*] Tests — the report's citation audit
#
#  The references a company's documents make to specific
#  legal provisions: recorded by the inventory (its strict
#  schema, the cache key that re-reads every older inventory
#  once, readers that take an inventory without them as
#  none), checked by the pipeline's `citations` step against
#  the corpus — one reference made by two documents judged
#  once and fanned out, batches of the checker's size, the
#  judge's calls filed under the step and the report, the
#  word overlap when the judge is down, a budget refusal
#  failing the report, a cancel stopping it — stored as
#  ReportCitation rows problems first (a re-run replaces
#  them), counted in the stats, served with the full report,
#  handed to the action plan and the summary, exported to PDF
#  and Excel and priced by the estimate. The act lookup that
#  resolves documents' ways of naming acts, and ranges and
#  lists of articles judged article by article (the best
#  article answers for the reference), are pinned too. The
#  fake model and embedder (tests/fakes.py) answer — no real
#  model call.
############################################################


import io
import math
import uuid
from unittest import mock


from django.test import TestCase


from compliance.analysis.estimate import CITATION_CALL_TOKENS
from compliance.analysis.exports import render_xlsx
from compliance.analysis.models import Action, Finding, Report, ReportCitation
from compliance.analysis.pdf import render_html
from compliance.analysis.pipeline import citation_lookups
from compliance.assistant import gateway
from compliance.assistant.models import LlmCall
from compliance.common.timestamps import utc_now
from compliance.companies.inventory import (
    CITATION_SCHEMA, SCHEMA, SCHEMA_VERSION, citation_key, ensure_inventory, inventory_citations, inventory_key,
)
from compliance.companies.models import CompanyDocument
from compliance.corpus.search import _celex_named, resolve_document
from compliance.jobs.models import Job, JobStep
from compliance.jobs.queue import enqueue
from compliance.prompts.models import Prompt
from compliance.prompts.schemas import schema_for
from compliance.prompts.store import active_version, add_version, seed_defaults
from compliance.tests import fakes
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.test_pipeline import drain
from compliance.tests.utils import create_admin, create_user, post_json, signed_in


POLICY = """ATITIKTIES POLITIKA
1. Leidimai
Įmonė veikia turėdama leidimą pagal MiCA 59 straipsnį.
2. Konsultavimas
Konsultavimą reglamentuoja Reglamento (ES) 2023/1114 78 str.
"""

PROCEDURE = """PINIGŲ PLOVIMO PREVENCIJOS PROCEDŪRA
1. Tikslas
Procedūra įgyvendina MiCA 59 straipsnį ir DORA 5 straipsnį.
"""

# The keys a citation-audit row carries on the wire
ROW_KEYS = {"id", "documentId", "documentTitle", "act", "article", "paragraph", "point", "claim", "quote", "status",
            "headingMatch", "verdict", "judgedBy", "legalDocumentId", "shortTitle", "unitId", "unitPath", "heading",
            "note", "excerpt", "citationUrl"}








############################################################
# judge_raising
############################################################
#
# A gateway.generate that answers like `model` except for the
# citation judge (schema "verdicts"), which raises `error`.
#
# Used by:
#   - the audit tests below
############################################################

def judge_raising(model, error):
    def generate(prompt, **kwargs):
        if kwargs.get("schema_name") == "verdicts":
            raise error
        return model(prompt, **kwargs)
    return generate








class InventoryCitationTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.user = create_user()
        self.document = CompanyDocument.objects.create(
            id=str(uuid.uuid4()), owner=self.user, title="Politika", file_path="/nonexistent", sha256="0" * 64,
            text=POLICY, char_count=len(POLICY), extraction_status="done", uploaded_at=utc_now())

    def test_the_schema_asks_for_structured_citations_strictly(self):
        self.assertIn("citations", SCHEMA["required"])
        self.assertIn("lawsReferenced", SCHEMA["required"], "kept for its readers (the document drawer)")
        self.assertEqual(SCHEMA["properties"]["citations"], {"type": "array", "items": CITATION_SCHEMA})
        self.assertEqual(CITATION_SCHEMA["required"], ["act", "article", "paragraph", "point", "claim", "quote"])
        self.assertFalse(CITATION_SCHEMA["additionalProperties"])
        self.assertEqual({v["type"] for v in CITATION_SCHEMA["properties"].values()}, {"string"})
        self.assertIs(schema_for("report.inventory")[0], SCHEMA, "the prompt editor's test run uses the same schema")
        self.assertIn("citations:", active_version("report.inventory").text, "the shipped default describes them")

    def test_the_cache_key_carries_the_schema_version_so_older_inventories_are_read_once_more(self):
        version = active_version("report.inventory")
        self.assertTrue(inventory_key(self.document, version.id).endswith(f":{version.id}:s{SCHEMA_VERSION}"))
        # An inventory cached before `citations` existed, under
        # the key of that time and the SAME prompt version — an
        # admin's own version keeps its id across a deploy
        old_key = inventory_key(self.document, version.id).rsplit(":", 1)[0]
        CompanyDocument.objects.filter(id=self.document.id).update(
            inventory={"documentType": "policy", "summary": "Sena"}, inventory_key=old_key)
        self.document.refresh_from_db()
        with fake_models() as model:
            inventory = ensure_inventory(self.document)
            self.document.refresh_from_db()
            again = ensure_inventory(self.document)
        self.assertEqual([name for name, _ in model.calls], ["inventory"], "re-read once, then cached")
        self.assertEqual(len(inventory["citations"]), len(fakes.CITATIONS))
        self.assertEqual(again, inventory)
        self.assertEqual(self.document.inventory_key, inventory_key(self.document, version.id))

    def test_the_inventory_prompt_names_the_company_and_keeps_no_placeholder(self):
        # The prompt's first sentence names the company: the
        # model read a literal {COMPANY_NAME} there until the
        # call passed the name. A document that lost its company
        # is still read, as a document of "the company"
        with fake_models() as model:
            ensure_inventory(self.document)
        self.assertEqual(model.instructions[0][0], "inventory")
        self.assertIn("one internal document of the company.", model.instructions[0][1])
        self.assertNotRegex(model.instructions[0][1], r"\{[A-Z_]+\}")

    def test_a_document_without_text_has_no_citations_and_costs_no_call(self):
        CompanyDocument.objects.filter(id=self.document.id).update(text="  ")
        self.document.refresh_from_db()
        with fake_models() as model:
            self.assertEqual(ensure_inventory(self.document)["citations"], [])
        self.assertEqual(model.calls, [])

    def test_readers_take_an_old_or_malformed_inventory_as_no_citations(self):
        for inventory in (None, [], "x", {}, {"citations": None}, {"citations": "MiCA 63"}, {"citations": [1, None, []]}):
            self.assertEqual(inventory_citations(inventory), [], inventory)
        [citation] = inventory_citations({"citations": [
            {"act": " MiCA ", "article": 63, "paragraph": None, "claim": "Saugo\n  klientų   turtą", "quote": "q" * 300,
             "point": True, "extra": "ignored"}]})
        self.assertEqual(citation, {"act": "MiCA", "article": "63", "paragraph": "", "point": "",
                                    "claim": "Saugo klientų turtą", "quote": "q" * 200})

    def test_a_reference_is_the_same_whatever_its_spacing_or_letter_case_but_not_its_claim(self):
        one = {"act": "MiCA", "article": "63", "paragraph": "", "point": "", "claim": "Saugo turtą", "quote": "a"}
        self.assertEqual(citation_key(one), citation_key({**one, "act": " mica ", "claim": "saugo  TURTĄ", "quote": "b"}))
        self.assertNotEqual(citation_key(one), citation_key({**one, "claim": "Kitas dalykas"}))
        self.assertNotEqual(citation_key(one), citation_key({**one, "paragraph": "2"}))








class CitationLookupTests(TestCase):

    def setUp(self):
        with fake_models():
            self.mica = ingest_act(signed_in(create_admin()), EU_EN, title="Markets in crypto-assets",
                                   short_title="MiCA", external_id="32023R1114")

    def test_acts_are_found_the_way_documents_name_them(self):
        for ref in ("MiCA", "mica", "32023R1114", "Regulation (EU) 2023/1114",
                    "Regulation (EU) 2023/1114 (Markets in Crypto-Assets Regulation, \"MiCA\")",
                    "Reglamentas (ES) 2023/1114", "Europos Parlamento ir Tarybos reglamento (ES) 2023/1114",
                    "MiCA Regulation", "the MiCA Regulation", "MiCA reglamentas"):
            self.assertEqual(getattr(resolve_document(ref), "id", None), self.mica.id, ref)
        for ref in ("Guidelines under MiCA", "Directive (EU) 2015/849 (AMLD5)", "MiCAR",
                    "Commission Delegated Regulation (EU) 2025/1 supplementing Regulation (EU) 2023/1114",
                    "DORA", "", "Regulation"):
            self.assertIsNone(resolve_document(ref), ref)

    def test_eu_act_numbers_map_to_celex_either_way_round(self):
        self.assertEqual(_celex_named("Regulation (EU) 2023/1113 (TFR)"), "32023R1113")
        self.assertEqual(_celex_named("Regulation (EU) No 575/2013"), "32013R0575")
        self.assertEqual(_celex_named("Regulation (EU) No 1093/2010"), "32010R1093")
        self.assertEqual(_celex_named("Directive 2009/110/EC"), "32009L0110")
        self.assertEqual(_celex_named("Direktyva (ES) 2015/2366"), "32015L2366")
        self.assertIsNone(_celex_named("PPTFPĮ 22 str."))

    def test_a_range_or_list_is_looked_up_article_by_article_but_an_inserted_article_stays_whole(self):
        base = {"act": "DORA", "paragraph": "", "point": "", "claim": "IRT incidentai", "quote": ""}
        articles = lambda written, **parts: [item["article"] for item in citation_lookups({**base, "article": written, **parts})]
        for written, expected in (("17–19", ["17", "18", "19"]), ("Art. 17—19", ["17", "18", "19"]),
                                  ("28 to 30", ["28", "29", "30"]), ("6-8, 26, 53", ["6", "7", "8", "26", "53"]),
                                  ("5 ir 6", ["5", "6"]), ("Articles 5 and 6", ["5", "6"]), ("12-1", ["12-1"]),
                                  ("12¹", ["12¹"]), ("Article 5", ["5"]), ("5 straipsnis", ["5"]), ("82a", ["82a"])):
            self.assertEqual(articles(written), expected, written)
        self.assertEqual(len(articles("31–44")), 14)
        self.assertEqual(len(articles("1–100")), 15, "at most MAX_SERIES_ARTICLES of one reference")
        # Every article of a list carries the claim, marked as one of
        # the articles cited together, and none a paragraph
        self.assertEqual({(item["paragraph"], item["point"], item["claimedHeading"])
                          for item in citation_lookups({**base, "article": "17–19", "paragraph": "2"})},
                         {("", "", "IRT incidentai [one of the articles 17–19 cited together]")})
        self.assertEqual(citation_lookups({**base, "article": "17"})[0]["claimedHeading"], "IRT incidentai")

    def test_one_article_is_read_leniently(self):
        base = {"act": "MiCA", "paragraph": "", "point": "", "claim": "Saugojimas", "quote": ""}
        [split] = citation_lookups({**base, "article": "63(2)(a)"})
        self.assertEqual((split["article"], split["paragraph"], split["point"]), ("63", "2", "a"))
        [kept] = citation_lookups({**base, "article": "63(2)", "paragraph": "3"})
        self.assertEqual((kept["article"], kept["paragraph"]), ("63(2)", "3"), "given parts win")
        for paragraph, number in (("2 dalis", "2"), ("(3)", "3"), ("par. 4", "4"), ("2 d.", "2")):
            self.assertEqual(citation_lookups({**base, "article": "5", "paragraph": paragraph})[0]["paragraph"], number, paragraph)
        for point, letter in (("(b)", "b"), ("point (c)", "c"), ("d", "d"), ("1 p.", "1"), ("iv", "iv")):
            self.assertEqual(citation_lookups({**base, "article": "5", "point": point})[0]["point"], letter, point)
        self.assertEqual(citation_lookups({**base, "article": "5"})[0]["claimedHeading"], "Saugojimas")








class CitationAuditTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()
        for name, text in (("politika.md", POLICY), ("procedura.md", PROCEDURE)):
            upload = io.BytesIO(text.encode())
            upload.name = name
            self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})
        with fake_models():
            self.mica = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                                   external_id="32023R1114")
            drain()

    def _run(self, language="lt", generate=None):
        with fake_models() as model:
            patch = mock.patch.object(gateway, "generate", side_effect=generate(model)) if generate else None
            if patch:
                patch.start()
            try:
                started = post_json(self.client_user, "/api/reports",
                                    {"companyId": self.company["id"], "language": language})
                self.assertEqual(started.status_code, 201, started.content)
                drain()
            finally:
                if patch:
                    patch.stop()
        return Report.objects.get(id=started.json()["id"]), model

    def _steps(self, report):
        return {step.name: step for step in JobStep.objects.filter(job=report.job)}

    def test_every_reference_is_checked_once_and_each_document_keeps_its_row(self):
        report, model = self._run()
        self.assertEqual(report.status, "done", report.error)
        rows = list(ReportCitation.objects.filter(report=report).order_by("order"))
        self.assertEqual(len(rows), 2 * len(fakes.CITATIONS), "four references in each of two documents")
        self.assertEqual({r.company_document_id for r in rows},
                         set(CompanyDocument.objects.filter(company_id=self.company["id"]).values_list("id", flat=True)))

        # Four unique references, two of them found with a claim:
        # ONE judge call compares exactly those two
        judge_calls = [prompt for name, prompt in model.calls if name == "verdicts"]
        self.assertEqual(len(judge_calls), 1)
        self.assertEqual(judge_calls[0].count("<citation ref="), 2)

        # Problems first: wrong provision, no such provision,
        # act not in the corpus, then the right ones
        verdicts = [(r.status, r.heading_match) for r in rows]
        self.assertEqual(verdicts, [("found", "mismatch")] * 2 + [("not_found", None)] * 2
                         + [("act_not_in_corpus", None)] * 2 + [("found", "match")] * 2)
        wrong = rows[0]
        self.assertEqual((wrong.act, wrong.article, wrong.claim), ("Regulation (EU) 2023/1114", "78", "Advice on crypto-assets"))
        self.assertEqual((wrong.legal_document_id, wrong.short_title, wrong.unit_path), (self.mica.id, "MiCA", "Art. 78"))
        self.assertEqual(wrong.heading, "Execution of orders for crypto-assets on behalf of clients")
        self.assertEqual((wrong.note, wrong.judged_by), ("Execution of orders.", "model"))
        self.assertTrue(wrong.citation_url.endswith("CELEX:32023R1114#art_78"), wrong.citation_url)
        self.assertTrue(wrong.excerpt.startswith("Execution of orders") or "best possible result" in wrong.excerpt)
        self.assertEqual(wrong.quote, "Konsultavimą reglamentuoja Reglamento (ES) 2023/1114 78 str.")
        self.assertIn(wrong.document_title, {d.title for d in CompanyDocument.objects.filter(company_id=self.company["id"])})
        missing = rows[2]
        self.assertEqual((missing.article, missing.legal_document_id, missing.unit_id, missing.judged_by),
                         ("81", self.mica.id, None, None))
        outside = rows[4]
        self.assertEqual((outside.act, outside.legal_document_id, outside.short_title), ("DORA", None, ""))
        right = rows[-1]
        self.assertEqual((right.unit_path, right.heading, right.judged_by), ("Art. 59", "Authorisation", "model"))
        self.assertIsNotNone(right.unit_id)

        self.assertEqual(report.stats["citations"], {"checked": 8, "match": 2, "mismatch": 2, "notFound": 2,
                                                     "notInCorpus": 2, "unknown": 0})

    def test_the_step_runs_after_the_documents_and_files_the_judges_calls(self):
        report, _ = self._run()
        steps = self._steps(report)
        order = [s.name for s in sorted(steps.values(), key=lambda s: s.ordinal)]
        self.assertEqual(order[:4], ["profile", "documents", "citations", "applicability"])
        step = steps["citations"]
        self.assertEqual(step.status, "done")
        self.assertEqual(step.input_ref, {"citations": 8, "unique": 4, "lookups": 4})
        self.assertEqual({k: step.output[k] for k in ("checked", "unique", "lookups", "checks", "judgedBy", "skipped")},
                         {"checked": 8, "unique": 4, "lookups": 4, "checks": 1, "judgedBy": "model", "skipped": 0})
        calls = LlmCall.objects.filter(job_step_id=step.id)
        self.assertEqual([c.purpose for c in calls], ["citations.check"])
        self.assertEqual(calls[0].user_id, self.user.id, "the report's starter pays, as for every step")
        self.assertEqual(step.usage["calls"], 1)
        self.assertEqual(step.usage["inputTokens"], calls[0].input_tokens)
        self.assertEqual((step.model, step.prompt_version_id),
                         ("gateway:fake-model", active_version("corpus.check_citations").id))
        # The report's usage and provenance count the audit
        run_calls = LlmCall.objects.filter(job_step_id__in=[s.id for s in steps.values()])
        self.assertEqual(report.stats["tokens"], sum(c.input_tokens + c.output_tokens for c in run_calls))
        self.assertIn("corpus.check_citations", [p["slug"] for p in report.stats["provenance"]["prompts"]])

    def test_references_go_to_the_checker_in_batches_of_its_size(self):
        with mock.patch("compliance.analysis.pipeline.CITATIONS_PER_CALL", 1):
            report, model = self._run()
        self.assertEqual(report.status, "done", report.error)
        # Four checks of one; only the two found references are
        # judged, so two judge calls
        self.assertEqual(self._steps(report)["citations"].output["checks"], 4)
        self.assertEqual(len([name for name, _ in model.calls if name == "verdicts"]), 2)
        self.assertEqual(ReportCitation.objects.filter(report=report).count(), 8)

        # More references than one check takes: none is dropped
        # (the inventories are read again to find them)
        many = tuple({"act": "MiCA", "article": str(n), "paragraph": "", "point": "",
                      "claim": f"Provision {n}", "quote": ""} for n in range(1, 61))
        CompanyDocument.objects.filter(company_id=self.company["id"]).update(inventory=None, inventory_key="")
        with mock.patch.object(fakes, "CITATIONS", many):
            report, _ = self._run()
        self.assertEqual(self._steps(report)["citations"].output["checks"], math.ceil(60 / 50))
        self.assertEqual(ReportCitation.objects.filter(report=report).count(), 120)
        self.assertEqual(report.stats["citations"]["checked"], 120)

    def test_a_range_or_list_is_judged_article_by_article_and_answered_by_its_best_article(self):
        cited = (
            # 59 is the authorisation, 78 the execution of orders: the
            # list is right — 78 answers for it
            {"act": "MiCA", "article": "59, 78", "paragraph": "", "point": "",
             "claim": "Execution of orders for crypto-assets on behalf of clients", "quote": ""},
            # 1 exists (subject matter), 80–81 do not: the one found
            # article answers — the claim names something else
            {"act": "MiCA", "article": "1, 80–81", "paragraph": "", "point": "", "claim": "Portfolio management", "quote": ""},
            # none of 80–82 exists in the test corpus
            {"act": "MiCA", "article": "Art. 80 to 82", "paragraph": "", "point": "", "claim": "Advice", "quote": ""},
        )
        CompanyDocument.objects.filter(company_id=self.company["id"]).update(inventory=None, inventory_key="")
        with mock.patch.object(fakes, "CITATIONS", cited):
            report, model = self._run()
        self.assertEqual(report.status, "done", report.error)
        step = self._steps(report)["citations"]
        self.assertEqual((step.output["unique"], step.output["lookups"], step.output["checks"]), (3, 8, 1))
        # One judge call compares the found articles of the lists
        [judged] = [prompt for name, prompt in model.calls if name == "verdicts"]
        self.assertEqual(judged.count("<citation ref="), 3)
        rows = {row.article: row for row in ReportCitation.objects.filter(report=report, company_document__title__startswith="politika")}
        self.assertEqual((rows["59, 78"].status, rows["59, 78"].heading_match, rows["59, 78"].unit_path), ("found", "match", "Art. 78"))
        self.assertEqual(rows["59, 78"].heading, "Execution of orders for crypto-assets on behalf of clients")
        self.assertEqual((rows["1, 80–81"].heading_match, rows["1, 80–81"].unit_path), ("mismatch", "Art. 1"))
        self.assertEqual((rows["Art. 80 to 82"].status, rows["Art. 80 to 82"].short_title), ("not_found", "MiCA"))
        self.assertEqual(report.stats["citations"], {"checked": 6, "match": 2, "mismatch": 2, "notFound": 2,
                                                     "notInCorpus": 0, "unknown": 0})

    def test_the_word_overlap_judges_when_the_judge_is_unavailable(self):
        down = gateway.GatewayError(503, "UPSTREAM_ERROR", "judge down")
        report, _ = self._run(generate=lambda model: judge_raising(model, down))
        self.assertEqual(report.status, "done", report.error)
        found = ReportCitation.objects.filter(report=report, status="found")
        self.assertEqual(set(found.values_list("judged_by", flat=True)), {"overlap"})
        self.assertEqual(set(found.values_list("note", flat=True)), {""})
        self.assertEqual(self._steps(report)["citations"].output["judgedBy"], "overlap")
        self.assertFalse(LlmCall.objects.filter(purpose="citations.check").exists())

    def test_a_budget_refusal_of_the_judge_fails_the_report_like_any_step(self):
        refused = gateway.GatewayError(402, "AI_BUDGET_EXHAUSTED", "budget exceeded")
        report, _ = self._run(generate=lambda model: judge_raising(model, refused))
        self.assertEqual(report.status, "failed")
        self.assertTrue(report.error.startswith("AI_BUDGET_EXHAUSTED"), report.error)
        steps = self._steps(report)
        self.assertEqual(steps["citations"].status, "failed")
        self.assertNotIn("applicability", steps)
        self.assertFalse(ReportCitation.objects.filter(report=report).exists())

    def test_a_cancel_during_the_audit_stops_the_report(self):
        def generate(model):
            def answer(prompt, **kwargs):
                if kwargs.get("schema_name") == "verdicts":
                    Job.objects.filter(kind="report.analyze").update(cancel_requested=True)
                return model(prompt, **kwargs)
            return answer

        report, _ = self._run(generate=generate)
        self.assertEqual(report.status, "cancelled")
        steps = self._steps(report)
        self.assertEqual(steps["citations"].status, "failed")
        self.assertNotIn("applicability", steps)
        self.assertFalse(ReportCitation.objects.filter(report=report).exists())

    def test_a_rerun_replaces_the_rows_of_the_previous_attempt(self):
        report, _ = self._run()
        first = set(ReportCitation.objects.filter(report=report).values_list("id", flat=True))
        judged = set(Finding.objects.filter(report=report).values_list("id", flat=True))

        def rerun():
            with fake_models():
                enqueue("report.analyze", {"report_id": report.id}, subject=f"report:{report.id}", created_by=self.user)
                drain()
            report.refresh_from_db()
            self.assertEqual(report.status, "done", report.error)
            return set(ReportCitation.objects.filter(report=report).values_list("id", flat=True))

        # A run interrupted in its second part: the audit the first
        # part made stays as it is, the findings are judged anew
        self.assertEqual(rerun(), first, "the first part's rows are kept, not doubled")
        again = set(Finding.objects.filter(report=report).values_list("id", flat=True))
        self.assertEqual(len(again), len(judged))
        self.assertFalse(judged & again, "the old findings are gone, not doubled")

        # A run interrupted in its first part — no scope approved yet — starts over
        Report.objects.filter(id=report.id).update(scope_approved_at=None)
        again = rerun()
        self.assertEqual(len(again), len(first))
        self.assertFalse(first & again, "the old rows are gone, not doubled")

    def test_an_inventory_without_citations_audits_nothing(self):
        # Inventories cached under the current key but in the old
        # shape (no `citations`) — read as none, no judge call
        version = active_version("report.inventory")
        for document in CompanyDocument.objects.filter(company_id=self.company["id"]):
            CompanyDocument.objects.filter(id=document.id).update(
                inventory={"documentType": "policy", "summary": "Sena", "lawsReferenced": ["MiCA"]},
                inventory_key=inventory_key(document, version.id))
        report, model = self._run()
        self.assertEqual(report.status, "done", report.error)
        self.assertNotIn("verdicts", [name for name, _ in model.calls])
        self.assertNotIn("inventory", [name for name, _ in model.calls], "the cached inventories were used")
        self.assertEqual(report.stats["citations"], {"checked": 0, "match": 0, "mismatch": 0, "notFound": 0,
                                                     "notInCorpus": 0, "unknown": 0})
        self.assertEqual(self._steps(report)["citations"].output["judgedBy"], None)

    def test_no_prompt_of_a_report_reaches_the_model_with_a_placeholder_unfilled(self):
        report, model = self._run()
        self.assertEqual(report.status, "done", report.error)
        self.assertTrue(model.instructions)
        for name, instructions in model.instructions:
            self.assertNotRegex(instructions, r"\{[A-Z][A-Z_]+\}", name)
        read = [text for name, text in model.instructions if name == "inventory"]
        self.assertTrue(read and all("one internal document of UAB Kripto." in text for text in read))

    def test_the_action_plan_and_the_summary_read_the_audit(self):
        report, model = self._run()
        # The wrong references are planned in a call of their own,
        # beside the one that plans the open findings
        plans = [prompt for name, prompt in model.calls if name == "action_plan"]
        self.assertEqual(["OPEN FINDINGS" in plan for plan in plans], [True, False])
        self.assertNotIn("CITATION PROBLEMS", plans[0])
        plan = plans[1]
        self.assertIn("CITATION PROBLEMS", plan)
        self.assertIn('cites Regulation (EU) 2023/1114, article 78 for: Advice on crypto-assets', plan)
        self.assertIn("actually covers: Execution of orders for crypto-assets on behalf of clients", plan)
        self.assertIn("cites MiCA, article 81 for: Portfolio management — MiCA has no such provision", plan)
        self.assertNotIn("Authorisation of crypto-asset service providers", plan, "a right reference is no problem")
        self.assertNotIn("ICT risk management governance", plan, "an act outside the corpus is no problem")
        summary = next(prompt for name, prompt in model.calls if name == "summary")
        self.assertIn('CITATION AUDIT', summary)
        self.assertIn('{"checked": 8, "match": 2, "mismatch": 2, "notFound": 2, "notInCorpus": 2, "unknown": 0}', summary)
        step = self._steps(report)["action_plan"]
        self.assertEqual((step.input_ref["citationProblems"], step.input_ref["calls"]), (4, 2))
        # The corrective action closes no finding and stands last
        actions = list(Action.objects.filter(report=report).order_by("priority"))
        self.assertEqual([bool(action.finding_ids) for action in actions], [True, False])

    def test_the_plan_runs_for_citation_problems_even_without_open_findings(self):
        with mock.patch.object(fakes, "STATUS_CYCLE", ("met",)):
            report, model = self._run()
        self.assertEqual(report.status, "done", report.error)
        plans = [prompt for name, prompt in model.calls if name == "action_plan"]
        self.assertEqual(len(plans), 1, "nothing to plan but the wrong references")
        self.assertNotIn("OPEN FINDINGS", plans[0])
        self.assertIn("CITATION PROBLEMS", plans[0])
        self.assertEqual(self._steps(report)["action_plan"].output,
                         {"actions": 1, "drafted": 1, "calls": 1, "planned": 0, "repaired": 0, "unplanned": 0})

    def test_the_full_report_serves_the_rows_and_the_list_only_the_counts(self):
        report, _ = self._run()
        full = self.client_user.get(f"/api/reports/{report.id}").json()
        self.assertEqual(len(full["citations"]), 8)
        self.assertEqual(set(full["citations"][0]), ROW_KEYS)
        self.assertEqual([row["verdict"] for row in full["citations"]],
                         ["mismatch"] * 2 + ["not_found"] * 2 + ["act_not_in_corpus"] * 2 + ["match"] * 2)
        wrong = full["citations"][0]
        self.assertEqual((wrong["status"], wrong["headingMatch"], wrong["judgedBy"], wrong["unitPath"]),
                         ("found", "mismatch", "model", "Art. 78"))
        self.assertEqual(wrong["legalDocumentId"], self.mica.id)
        self.assertTrue(wrong["unitId"] and wrong["documentId"])
        outside = full["citations"][4]
        self.assertEqual((outside["headingMatch"], outside["judgedBy"], outside["legalDocumentId"], outside["unitId"]),
                         (None, None, None, None))
        listed = next(r for r in self.client_user.get("/api/reports").json()["reports"] if r["id"] == report.id)
        self.assertNotIn("citations", listed)
        self.assertEqual(listed["stats"]["citations"]["checked"], 8)
        # A review recounts the findings and leaves the audit's counts
        finding = full["findings"][0]
        self.client_user.patch(f"/api/reports/{report.id}/findings/{finding['id']}", data={"overrideStatus": "met"},
                               content_type="application/json")
        self.assertEqual(Report.objects.get(id=report.id).stats["citations"]["checked"], 8)
        # A deleted document leaves its rows, titled as it was
        document = CompanyDocument.objects.get(id=wrong["documentId"])
        self.assertEqual(self.client_user.delete(f"/api/documents/{document.id}").status_code, 200)
        after = self.client_user.get(f"/api/reports/{report.id}").json()["citations"]
        orphans = [row for row in after if row["documentId"] is None]
        self.assertEqual({row["documentTitle"] for row in orphans}, {document.title})
        self.assertEqual(len(after), 8)

    def test_a_report_from_before_the_audit_serves_no_rows_and_no_counts(self):
        old = Report.objects.create(id=str(uuid.uuid4()), company_id=self.company["id"], created_by=self.user,
                                    status="done", language="lt", stats={"findings": {}}, created_at=utc_now())
        full = self.client_user.get(f"/api/reports/{old.id}").json()
        self.assertEqual(full["citations"], [])
        self.assertNotIn("citations", full["stats"])

    def test_the_exports_carry_the_audit_problems_first_in_the_reports_language(self):
        from openpyxl import load_workbook
        report, _ = self._run()
        html = render_html(report)
        # The audit is a section of its own after the findings; the
        # action plan is read before both
        self.assertLess(html.index('<section id="actions">'), html.index('<section id="findings">'))
        self.assertLess(html.index('<section id="findings">'), html.index('<section id="citations">'))
        section = html[html.index('<section id="citations">'):html.index('<section id="methodology">')]
        self.assertIn("Teisės aktų nuorodų patikra</h2>", section)
        self.assertLess(section.index("Ne ta nuostata</span></td>"), section.index("Tokios nuostatos nėra</span></td>"))
        self.assertLess(section.index("Akto nėra bazėje</span></td>"), section.index("Teisinga</span></td>"))
        self.assertIn("Regulation (EU) 2023/1114 78 str.", section)
        self.assertIn('href="https://eur-lex.europa.eu/', section)
        self.assertIn("Execution of orders for crypto-assets on behalf of clients", section)
        self.assertIn("„Konsultavimą reglamentuoja Reglamento (ES) 2023/1114 78 str.“", section)

        book = load_workbook(io.BytesIO(render_xlsx(report)))
        self.assertEqual(book.sheetnames[4], "Teisės aktų nuorodų patikra")
        sheet = book["Teisės aktų nuorodų patikra"]
        self.assertEqual(sheet.max_row, 9, "a header and eight rows")
        self.assertEqual([sheet.cell(row=r, column=10).value for r in range(2, 10)],
                         ["Ne ta nuostata"] * 2 + ["Tokios nuostatos nėra"] * 2 + ["Akto nėra bazėje"] * 2
                         + ["Teisinga"] * 2)
        self.assertTrue(sheet.cell(row=2, column=11).hyperlink.target.startswith("https://eur-lex.europa.eu/"))
        self.assertEqual(sheet.cell(row=2, column=14).value, "DI modelis")
        overview = book[book.sheetnames[0]]
        labels = {row[0].value: row[1].value for row in overview.iter_rows()}
        self.assertEqual(labels["Teisės aktų nuorodų patikra: ne ta nuostata"], 2)

        english, _ = self._run(language="en")
        self.assertIn("Citation audit</h2>", render_html(english))
        self.assertIn("Wrong provision", render_html(english))
        self.assertIn("Regulation (EU) 2023/1114 Art. 78", render_html(english))

    def test_a_report_from_before_the_audit_exports_that_it_was_not_run(self):
        from openpyxl import load_workbook
        report, _ = self._run()
        Report.objects.filter(id=report.id).update(stats={k: v for k, v in report.stats.items() if k != "citations"})
        ReportCitation.objects.filter(report=report).delete()
        report.refresh_from_db()
        self.assertIn("Šiai ataskaitai teisės aktų nuorodų patikra nebuvo atlikta.", render_html(report))
        sheet = load_workbook(io.BytesIO(render_xlsx(report)))["Teisės aktų nuorodų patikra"]
        self.assertEqual(sheet.cell(row=2, column=2).value, "Šiai ataskaitai teisės aktų nuorodų patikra nebuvo atlikta.")
        # A run that found no reference says that instead
        Report.objects.filter(id=report.id).update(stats={**report.stats, "citations": {"checked": 0}})
        report.refresh_from_db()
        self.assertIn("Įmonės dokumentuose nerasta nuorodų į konkrečias teisės aktų nuostatas.", render_html(report))

    def test_the_estimate_prices_the_rereads_and_the_judge_calls(self):
        def estimate():
            with mock.patch("compliance.assistant.usage.price_table", return_value={}):
                return self.client_user.get(f"/api/reports/estimate?companyId={self.company['id']}").json()

        before = estimate()
        # No inventory yet: both documents are read, and the judge
        # priced for CITATIONS_PER_DOCUMENT references each
        self.assertEqual((before["documentsToRead"], before["citationChecks"]), (2, math.ceil(2 * 20 / 50)))
        self._run()
        after = estimate()
        # Both inventories current: four unique references known
        self.assertEqual((after["documentsToRead"], after["citationChecks"]), (0, 1))

        # An inventory cached under the key of before the audit
        # (same prompt version, no schema version) is re-read
        document = CompanyDocument.objects.filter(company_id=self.company["id"]).first()
        version = active_version("report.inventory")
        CompanyDocument.objects.filter(id=document.id).update(
            inventory_key=inventory_key(document, version.id).rsplit(":", 1)[0])
        self.assertEqual(estimate()["documentsToRead"], 1)
        # A new inventory prompt version makes both stale
        add_version(Prompt.objects.get(slug="report.inventory"), version.text + "\nMore.", version.model,
                    activate=True)
        self.assertEqual(estimate()["documentsToRead"], 2)

        # The judge is priced at its own model (given one no other
        # step runs on, so its share can be told apart)
        judge = active_version("corpus.check_citations")
        add_version(Prompt.objects.get(slug="corpus.check_citations"), judge.text, "gateway:test/judge", activate=True)
        with mock.patch("compliance.analysis.estimate.cost_of", side_effect=lambda model, i, o, *cache: (
                (i + o) * 0.000001 if model == "gateway:test/judge" else 0)):
            priced = estimate()
        self.assertAlmostEqual(priced["analysisUsd"], round(priced["citationChecks"] * sum(CITATION_CALL_TOKENS) * 0.000001, 2))
