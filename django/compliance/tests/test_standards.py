############################################################
#  [*] Tests — standards: the clause tree, the ingest, the
#      lookups, the requirements, the adoptions and the report
#
#  A standard is uploaded through the real API and read by
#  the real ingest job (upload → sandboxed extraction →
#  clause parser → chunk → embed → activate); only the model
#  and the embedder are fakes (tests/fakes.py). The fixture
#  text is laid out as the PDF extractor delivers a licensed
#  copy: pages split by form feeds, each with the designation,
#  the copyright line and the licence stamp, a table of
#  contents without dot leaders, a heading split from its
#  number, a top-level heading lost, and an Annex A control
#  table that numbers its controls without the letter.
############################################################


import io
from unittest import mock


from django.test import TestCase


from compliance.analysis.models import Finding, ReportAct
from compliance.companies.models import CompanyStandard
from compliance.corpus.citations import check_citations
from compliance.corpus.models import LegalChunk, LegalDocument, LegalUnit, Obligation
from compliance.corpus.search import find_provision, resolve_document, search_corpus
from compliance.corpus.standards import parse_standard, standard_reference
from compliance.corpus.structure import iter_units
from compliance.jobs.runner import run_once
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.utils import create_admin, create_user, patch_json, post_json, signed_in


HEAD = "ISO/IEC 27001:2022(E)"
FOOT = "© ISO/IEC 2022 – All rights reserved"
STAMP = "Licensed to UAB Testas. Order 1042, downloaded 2026-11-01. Single user licence only."

ISO_PAGES = [
    ["INTERNATIONAL STANDARD", "ISO/IEC 27001", "Third edition 2022-10",
     "Information security management systems — Requirements", STAMP],
    [HEAD, "Contents Page", "Foreword iv", "1 Scope 1", "2 Normative references 1", "3 Terms and definitions 1",
     "4 Context of the organization 1", "4.1 Understanding the organization and its context 1",
     "6 Planning 3", "Annex A (normative) Information security controls reference 9",
     "Annex B (informative) Correspondence with earlier editions 12", f"{FOOT} iii", STAMP],
    [HEAD, "Foreword", "This third edition cancels and replaces the second edition.", f"{FOOT} iv", STAMP],
    [HEAD, "Introduction", "0.1 General", "This document provides requirements for an information security "
     "management system.", f"{FOOT} v", STAMP],
    [HEAD, "1 Scope", "This document specifies the requirements for establishing the system.",
     "2 Normative references", "The following documents are referred to in the text.",
     "3 Terms and definitions", "For the purposes of this document, the terms of ISO/IEC 27000 apply.",
     "4 Context of the organization", "4.1 Understanding the organization and its context",
     "The organization shall determine external and internal issues that are relevant to its purpose.",
     "4.2", "Understanding the needs and expectations of interested parties",
     "The organization shall determine:", "a) interested parties that are relevant;",
     "b) the relevant requirements of these interested parties.", f"{FOOT} 1", STAMP],
    [HEAD, "5 days after a change the organization shall review the scope.",
     "5.1 Leadership and commitment", "Top management shall demonstrate leadership and commitment.",
     "6 Planning", "6.1 Actions to address risks and opportunities", "6.1.1 General",
     "When planning, the organization shall consider the issues referred to in 4.1.",
     "6.1.2 Information security risk assessment",
     "The organization shall define and apply an information security risk assessment process.",
     f"{FOOT} 2", STAMP],
    [HEAD, "Annex A", "(normative)", "Information security controls reference",
     "Table A.1 — Information security controls", "5 Organizational controls",
     "5.1 Policies for information security Control",
     "Information security policy and topic-specific policies shall be defined and approved by management.",
     "5.2 Information security roles and responsibilities Control",
     "Information security roles and responsibilities shall be defined and allocated.",
     "8 Technological controls", "8.1 User endpoint devices Control",
     "Information stored on, processed by or accessible via user endpoint devices shall be protected.",
     f"{FOOT} 9", STAMP],
    [HEAD, "Annex B", "(informative)", "Correspondence with earlier editions", "B.1 General",
     "This annex lists the controls renumbered since the previous edition.", "Bibliography",
     "[1] ISO/IEC 27002:2022, Information security controls", f"{FOOT} 12", STAMP],
]
ISO_TEXT = "\n\f\n".join("\n".join(page) for page in ISO_PAGES)

LST_TEXT = """LIETUVOS STANDARTAS
LST EN ISO/IEC 27001:2023
Turinys
Pratarmė ........................ 4
1 Taikymo sritis ......... 5
Pratarmė
Šis dokumentas parengtas pagal tarptautinį standartą.
1 Taikymo sritis
Šiame dokumente nustatomi reikalavimai.
3 Terminai ir apibrėžtys
3.1
prieigos valdymas
priemonės, užtikrinančios, kad prieiga būtų suteikta pagal poreikį
4 Organizacijos kontekstas
4.1 Organizacijos ir jos konteksto supratimas
Organizacija turi nustatyti išorės ir vidaus aplinkybes.
A priedas
(norminis)
Informacijos saugumo kontrolės priemonių nuorodos
A.1 Bendrosios nuostatos
Organizacija turi apibrėžti informacijos saugumo politiką.
Bibliografija
[1] ISO/IEC 27002"""

# A copy whose clause numbers did not survive (a DOCX with
# automatic numbering): headings without numbers — what
# becomes of it is in tests/test_standard_outline.py
UNNUMBERED_TEXT = "\n".join(
    ["Information security management systems — Requirements", "Scope",
     "This document specifies the requirements for establishing the system."]
    + ["Context of the organization", "The organization shall determine external and internal issues."] * 20)








############################################################
# outline
############################################################
#
# A parsed tree as (unit type, number, heading, path) rows in
# document order.
#
# Used by:
#   - ParserTests (below)
############################################################

def outline(text, language):
    return [(unit.unit_type, unit.number, unit.heading, unit.path)
            for unit, _, _ in iter_units(parse_standard(text, language))]








############################################################
# ingest_standard
############################################################
#
# Creates a standard through the admin API, uploads `text`
# (or a file's bytes, under `filename`) as its file and runs
# the ingest job to completion; answers the LegalDocument.
#
# Used by:
#   - the test cases below, tests/test_standard_layouts.py
############################################################

def ingest_standard(admin_client, text, *, title="Information security management systems — Requirements",
                    short_title="ISO/IEC 27001:2022", language="en", jurisdiction="INTL", filename="standard.txt"):
    body = {"title": title, "shortTitle": short_title, "jurisdiction": jurisdiction, "language": language,
            "docType": "standard", "sourceKind": "upload"}
    created = post_json(admin_client, "/api/corpus/documents", body)
    assert created.status_code == 201, created.content
    upload = io.BytesIO(text.encode("utf-8") if isinstance(text, str) else text)
    upload.name = filename
    response = admin_client.post(f"/api/corpus/documents/{created.json()['id']}/upload", {"file": upload})
    assert response.status_code in (201, 202), response.content
    while run_once(heartbeat=False):
        pass
    return LegalDocument.objects.get(id=created.json()["id"])








class ParserTests(TestCase):

    def test_the_clause_tree_of_a_licensed_pdf_text(self):
        rows = outline(ISO_TEXT, "en")
        clauses = [(number, path) for kind, number, _, path in rows if kind == "clause"]
        self.assertEqual(clauses, [
            ("0", "Introduction"), ("0.1", "0.1"), ("1", "Clause 1"), ("2", "Clause 2"), ("3", "Clause 3"),
            ("4", "Clause 4"), ("4.1", "4.1"), ("4.2", "4.2"), ("5", "Clause 5"), ("5.1", "5.1"),
            ("6", "Clause 6"), ("6.1", "6.1"), ("6.1.1", "6.1.1"), ("6.1.2", "6.1.2"),
            ("A.5", "A.5"), ("A.5.1", "A.5.1"), ("A.5.2", "A.5.2"), ("A.8", "A.8"), ("A.8.1", "A.8.1"),
            ("B.1", "B.1")])
        annexes = [(number, heading, path) for kind, number, heading, path in rows if kind == "annex"]
        self.assertEqual(annexes, [("A", "Information security controls reference", "Annex A"),
                                   ("B", "Correspondence with earlier editions", "Annex B")])
        headings = {number: heading for kind, number, heading, _ in rows if kind == "clause"}
        # The heading printed under its number, the control
        # table's column word dropped, a lost heading left empty
        self.assertEqual(headings["4.2"], "Understanding the needs and expectations of interested parties")
        self.assertEqual(headings["A.5.1"], "Policies for information security")
        self.assertEqual(headings["5"], "")
        self.assertIn(("text", "", "", "Bibliography"), rows)

    def test_page_furniture_and_the_contents_are_gone(self):
        tree = parse_standard(ISO_TEXT, "en")
        text = "\n".join(unit.full_text("en") for unit in tree)
        for furniture in (HEAD, FOOT, "Licensed to", "Contents Page"):
            self.assertNotIn(furniture, "\n".join(u.full_text("en") for u in tree[1:]), furniture)
        # Each clause once: the contents' entries were replaced
        self.assertEqual(text.count("4.1 Understanding the organization and its context"), 1)
        # The foreword that followed the contents is kept in the
        # preamble
        self.assertEqual(tree[0].unit_type, "preamble")
        self.assertIn("This third edition cancels", tree[0].full_text("en"))

    def test_a_sentence_that_starts_with_a_number_stays_text(self):
        clause = next(unit for unit, _, _ in iter_units(parse_standard(ISO_TEXT, "en")) if unit.number == "4.2")
        self.assertIn("5 days after a change the organization shall review the scope.", clause.lines)

    def test_a_lithuanian_edition(self):
        rows = outline(LST_TEXT, "lt")
        paths = [path for kind, _, _, path in rows if kind in ("clause", "annex")]
        self.assertEqual(paths, ["1 skyrius", "3 skyrius", "3.1", "4 skyrius", "4.1", "A priedas", "A.1"])
        # A term entry: its heading under its number, in lower case
        self.assertIn(("clause", "3.1", "prieigos valdymas", "3.1"), rows)
        self.assertIn(("text", "", "", "Bibliografija"), rows)
        self.assertEqual(rows[0][0], "preamble")

    def test_references_name_clauses_and_annexes(self):
        for raw, wanted in (("6.1.2", ("clause", "6.1.2")), ("clause 6.1.2", ("clause", "6.1.2")),
                            ("Clause 4", ("clause", "4")), ("4 skyrius", ("clause", "4")),
                            ("A.5.15", ("clause", "A.5.15")), ("Annex A, control 5.15", ("clause", "A.5.15")),
                            ("A priedo 5.15 punktas", ("clause", "A.5.15")), ("A5.15", ("clause", "A.5.15")),
                            ("Annex A", ("annex", "A")), ("A priedas", ("annex", "A")),
                            ("6.1.3 d)", ("clause", "6.1.3")), ("ISO 27001", None), ("", None)):
            self.assertEqual(standard_reference(raw), wanted, raw)








class StandardIngestTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        with fake_models():
            self.standard = ingest_standard(self.admin_client, ISO_TEXT)

    def test_ingest_reads_the_clauses_and_chunks_them_with_their_headings(self):
        version = self.standard.current_version
        self.assertEqual((version.status, version.parser), ("ready", "standard"))
        self.assertEqual(version.article_count, LegalUnit.objects.filter(version=version, unit_type="clause").count())
        control = LegalUnit.objects.get(version=version, unit_type="clause", number="A.8.1")
        self.assertEqual((control.path, control.heading), ("A.8.1", "User endpoint devices"))
        self.assertEqual(control.parent.number, "A.8")
        # What every page repeats was removed on the way in: the
        # pages reach the parser apart (the sandboxed extraction
        # keeps their form feeds for a standard)
        self.assertIn("\f", version.text)
        for unit in LegalUnit.objects.filter(version=version).exclude(unit_type="preamble"):
            for furniture in (HEAD, "Licensed to", "All rights reserved"):
                self.assertNotIn(furniture, unit.text, f"{furniture!r} in {unit.path}")
        chunks = LegalChunk.objects.filter(version=version)
        self.assertFalse(chunks.filter(embedding__isnull=True).exists())
        assessment = chunks.get(path="6.1.1–6.1.2")
        self.assertTrue(assessment.text.startswith("6 Planning › 6.1 Actions to address risks and opportunities"))
        self.assertIn("6.1.2 Information security risk assessment", assessment.text)

    def test_a_designation_finds_the_standard_and_a_reference_its_clause(self):
        for ref in ("ISO/IEC 27001:2022", "ISO 27001", "ISO/IEC 27001", "LST EN ISO/IEC 27001:2022"):
            self.assertEqual(resolve_document(ref), self.standard, ref)
        self.assertIsNone(resolve_document("ISO 27002"))
        self.assertIsNone(resolve_document("ISO 27001:2013"))
        for reference, path in (("A.5.1", "A.5.1"), ("Annex A 5.2", "A.5.2"), ("clause 6.1.2", "6.1.2"),
                                ("4", "Clause 4"), ("Annex B", "Annex B"),
                                # Not in the body: the annex's control
                                ("control 8.1", "A.8.1")):
            found = find_provision("ISO 27001", reference)
            self.assertIsNotNone(found, reference)
            self.assertEqual((found["path"], found["docType"]), (path, "standard"), reference)
        self.assertEqual(find_provision("ISO 27001", "6.1", "2")["path"], "6.1.2")
        self.assertIsNone(find_provision("ISO 27001", "9.9"))

    def test_a_control_is_the_annexs_even_when_the_body_has_that_number(self):
        # 5.1 is leadership in the body and the policies in Annex A
        self.assertEqual(find_provision("ISO 27001", "5.1")["heading"], "Leadership and commitment")
        for reference in ("control 5.1", "5.1 kontrolės priemonė", "Annex A 5.1", "A.5.1"):
            self.assertEqual(find_provision("ISO 27001", reference)["path"], "A.5.1", reference)
        with fake_models():
            checked = check_citations([{"act": "ISO/IEC 27001", "article": "control 5.1",
                                        "claimedHeading": "Policies for information security"}])
        self.assertEqual((checked[0]["status"], checked[0]["path"], checked[0]["headingMatch"]), ("found", "A.5.1", "match"))

    def test_an_informative_annexs_table_never_answers_a_bare_number(self):
        text = "\n".join([
            "1 Scope", "This document specifies requirements.", "2 Normative references", "None.",
            "3 Terms and definitions", "None.", "4 Requirements", "4.1 Policy", "A policy shall be defined.",
            "Annex A (informative)", "Correspondence with the previous edition",
            "4.1 Policy", "Was clause 5.2 of the previous edition.", "4.9 Withdrawn", "No longer part of this document."])
        with fake_models():
            ingest_standard(self.admin_client, text, short_title="ISO 99003:2026")
        self.assertEqual(find_provision("ISO 99003", "control 4.1")["text"], "4.1 Policy\nA policy shall be defined.")
        self.assertIsNone(find_provision("ISO 99003", "4.9"), "only the informative table has it")
        self.assertEqual(find_provision("ISO 99003", "A.4.9")["heading"], "Withdrawn", "asked for by its letter, it is found")

    def test_the_latest_edition_answers_a_designation_without_a_year(self):
        older = LegalDocument.objects.create(
            id="iso-27001-2013", slug="iso-27001-2013", title="ISMS — Requirements", short_title="ISO/IEC 27001:2013",
            jurisdiction="INTL", doc_type="standard", current_version=self.standard.current_version,
            created_at=self.standard.created_at, updated_at=self.standard.updated_at)
        self.assertEqual(resolve_document("ISO 27001"), self.standard)
        self.assertEqual(resolve_document("ISO 27001:2013"), older)

    def test_search_narrows_to_standards_or_acts(self):
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            standards = search_corpus("information security policy", kind="standards")
            acts = search_corpus("information security policy", kind="acts")
            international = search_corpus("information security policy", jurisdiction="INTL")
        self.assertTrue(standards)
        self.assertEqual({hit["docType"] for hit in standards}, {"standard"})
        self.assertNotIn("standard", {hit["docType"] for hit in acts})
        self.assertEqual({hit["shortTitle"] for hit in international}, {"ISO/IEC 27001:2022"})
        self.assertEqual(post_json(self.admin_client, "/api/corpus/search",
                                   {"query": "policy", "kind": "rules"}).status_code, 400)
        listed = self.admin_client.get("/api/corpus/documents?docType=standard").json()["documents"]
        self.assertEqual([d["shortTitle"] for d in listed], ["ISO/IEC 27001:2022"])

    def test_citations_to_a_clause_are_checked(self):
        with fake_models():
            results = check_citations([
                {"act": "ISO 27001", "article": "A.5.1", "claimedHeading": "Policies for information security"},
                {"act": "ISO 27001", "article": "clause 9.2"}])
        self.assertEqual((results[0]["status"], results[0]["path"], results[0]["headingMatch"]),
                         ("found", "A.5.1", "match"))
        self.assertEqual(results[1]["status"], "not_found")

    def test_requirements_are_read_from_the_clauses_that_state_them(self):
        with fake_models() as model:
            response = self.admin_client.post(f"/api/corpus/documents/{self.standard.id}/extract-obligations")
            self.assertEqual(response.status_code, 202)
            while run_once(heartbeat=False):
                pass
        prompts = [prompt for name, prompt in model.calls if name == "requirements"]
        self.assertTrue(prompts)
        sent = "\n".join(prompts)
        for skipped in ("specifies the requirements for establishing", "terms of ISO/IEC 27000",
                        "renumbered since the previous edition", "This third edition"):
            self.assertNotIn(skipped, sent, skipped)
        self.assertIn('path="A.8.1"', sent)
        self.assertIn("Designation: ISO/IEC 27001:2022", sent)
        rows = Obligation.objects.filter(document=self.standard)
        self.assertTrue(rows.exists())
        self.assertEqual({(o.source_kind, tuple(o.applies_to), o.status) for o in rows},
                         {("standard", ("all",), "proposed")})
        self.assertTrue(all(o.citations and o.embedding is not None for o in rows))








class AdoptionTests(TestCase):

    def setUp(self):
        self.admin_client = signed_in(create_admin())
        with fake_models():
            self.standard = ingest_standard(self.admin_client, ISO_TEXT)
            self.act = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                                  external_id="32023R1114")
        self.client_user = signed_in(create_user())
        self.company = post_json(self.client_user, "/api/companies", {"name": "UAB Saugi"}).json()
        self.base = f"/api/companies/{self.company['id']}/standards"

    def test_adopt_change_and_remove_a_standard(self):
        certificate = post_json(self.client_user, f"/api/companies/{self.company['id']}/credentials",
                                {"kind": "certificate", "name": "ISO/IEC 27001 sertifikatas"}).json()
        created = post_json(self.client_user, self.base, {"documentId": self.standard.id, "status": "certified",
                                                          "scope": "IT paslaugos", "certificateId": certificate["id"]})
        self.assertEqual(created.status_code, 201, created.content)
        adoption = created.json()
        self.assertEqual((adoption["shortTitle"], adoption["status"], adoption["certificateId"], adoption["ready"]),
                         ("ISO/IEC 27001:2022", "certified", certificate["id"], True))
        self.assertEqual(post_json(self.client_user, self.base, {"documentId": self.standard.id}).json()["code"],
                         "ALREADY_ADOPTED")
        detail = self.client_user.get(f"/api/companies/{self.company['id']}").json()
        self.assertEqual([s["documentId"] for s in detail["standards"]], [self.standard.id])

        item = f"{self.base}/{adoption['id']}"
        changed = patch_json(self.client_user, item, {"status": "implementing", "certificateId": None})
        self.assertEqual((changed.json()["status"], changed.json()["certificateId"]), ("implementing", None))
        self.assertEqual(self.client_user.delete(item).status_code, 200)
        self.assertFalse(CompanyStandard.objects.exists())

    def test_what_an_adoption_refuses(self):
        other = post_json(self.client_user, "/api/companies", {"name": "UAB Kita"}).json()
        foreign = post_json(self.client_user, f"/api/companies/{other['id']}/credentials",
                            {"kind": "certificate", "name": "Kitos įmonės sertifikatas"}).json()
        LegalDocument.objects.filter(id=self.standard.id).update(enabled=False)
        self.assertEqual(post_json(self.client_user, self.base, {"documentId": self.standard.id}).json()["code"],
                         "INVALID_FIELD", "a switched-off standard is hidden from a user")
        LegalDocument.objects.filter(id=self.standard.id).update(enabled=True)
        for body, code in (({}, "MISSING_FIELDS"), ({"documentId": self.act.id}, "INVALID_FIELD"),
                           ({"documentId": self.standard.id, "status": "maybe"}, "INVALID_FIELD"),
                           ({"documentId": self.standard.id, "certificateId": foreign["id"]}, "INVALID_FIELD"),
                           ({"documentId": self.standard.id, "scope": 5}, "INVALID_FIELD")):
            self.assertEqual(post_json(self.client_user, self.base, body).json()["code"], code, body)
        self.assertFalse(CompanyStandard.objects.exists())








class StandardReportTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        with fake_models():
            self.standard = ingest_standard(self.admin_client, ISO_TEXT)
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        self.client_user = signed_in(create_user())
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()

    def _run(self, **extra):
        # One model call at a time: a call in a thread of its own
        # would not see the test's uncommitted rows (the act and
        # the standard make two gap-analysis batches)
        with fake_models() as model, mock.patch("compliance.analysis.pipeline.WORKERS", 1):
            started = post_json(self.client_user, "/api/reports",
                                {"companyId": self.company["id"], "language": "lt", **extra})
            self.assertEqual(started.status_code, 201, started.content)
            while run_once(heartbeat=False):
                pass
        return started.json()["id"], model

    def test_an_adopted_standard_is_assessed_by_its_requirements(self):
        post_json(self.client_user, f"/api/companies/{self.company['id']}/standards",
                  {"documentId": self.standard.id, "status": "certified", "scope": "IT paslaugos"})
        report_id, model = self._run()
        rows = {row.short_title: row for row in ReportAct.objects.filter(report_id=report_id)}
        self.assertEqual(set(rows), {"MiCA", "ISO/IEC 27001:2022"})
        standard = rows["ISO/IEC 27001:2022"]
        self.assertEqual((standard.doc_type, standard.applicability, standard.confidence), ("standard", "applies", 1.0))
        self.assertIn("sertifikuota", standard.reasoning)
        self.assertIn("IT paslaugos", standard.reasoning)
        self.assertEqual(rows["MiCA"].doc_type, "regulation")
        # The model judged only the act's applicability
        judged = [prompt for name, prompt in model.calls if name == "applicability"]
        self.assertTrue(judged)
        self.assertFalse(any("ISO/IEC 27001" in prompt.split("ACTS TO ASSESS")[1] for prompt in judged))
        # Its requirements were extracted and assessed
        findings = Finding.objects.filter(report_id=report_id, source_kind="standard")
        self.assertTrue(findings.exists())
        self.assertEqual({f.short_title for f in findings}, {"ISO/IEC 27001:2022"})
        gap = [prompt for name, prompt in model.calls if name == "findings" and "STANDARD: ISO/IEC 27001:2022" in prompt]
        self.assertTrue(gap)
        self.assertIn("Standards the company has adopted", gap[0])
        detail = self.client_user.get(f"/api/reports/{report_id}").json()
        self.assertIn("standard", {act["docType"] for act in detail["acts"]})

    def test_a_standard_not_adopted_is_left_out_unless_the_report_names_it(self):
        report_id, _ = self._run()
        self.assertFalse(ReportAct.objects.filter(report_id=report_id, doc_type="standard").exists())
        self.assertFalse(Finding.objects.filter(report_id=report_id, source_kind="standard").exists())
        scoped, _ = self._run(documentIds=[self.standard.id])
        rows = list(ReportAct.objects.filter(report_id=scoped))
        self.assertEqual([(row.short_title, row.applicability) for row in rows], [("ISO/IEC 27001:2022", "applies")])
        self.assertIn("ataskaitos apimtį", rows[0].reasoning)

    def test_the_estimate_counts_an_adopted_standard(self):
        post_json(self.client_user, f"/api/companies/{self.company['id']}/standards",
                  {"documentId": self.standard.id, "status": "planned"})
        estimate = self.client_user.get(f"/api/reports/estimate?companyId={self.company['id']}").json()
        self.assertEqual(estimate["acts"], 2)
        self.assertEqual(sorted(estimate["actsToExtract"]), ["ISO/IEC 27001:2022", "MiCA"])
