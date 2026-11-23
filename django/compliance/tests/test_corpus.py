############################################################
#  [*] Tests — the legal corpus: structure, ingest, search,
#      provisions, citations and obligations
#
#  Acts are ingested through the real API and the real job
#  (upload → sandboxed extraction → parse → chunk → embed →
#  activate); only the model and the embedder are fakes
#  (tests/fakes.py).
############################################################


import io
import os
from unittest import mock


from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase


from compliance.assistant import gateway
from compliance.common.timestamps import utc_now
from compliance.corpus.citations import check_citations
from compliance.corpus.fetchers import FetchResult
from compliance.corpus.links import citation_url
from compliance.corpus.models import LegalChunk, LegalDocument, LegalDocumentVersion, LegalUnit, Obligation
from compliance.corpus.search import find_provision, search_corpus
from compliance.corpus.standards import without_furniture
from compliance.corpus.structure import citation_path, iter_units, parse_structure
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.jobs.runner import run_once
from compliance.prompts.models import Prompt
from compliance.prompts.store import add_version, seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.utils import create_admin, create_user, post_json, signed_in


LT_LAW = """LIETUVOS RESPUBLIKOS
MOKĖJIMO ĮSTAIGŲ
ĮSTATYMAS
2009 m. gruodžio 10 d. Nr. XI-549
Vilnius
PIRMASIS SKIRSNIS
BENDROSIOS NUOSTATOS
1 straipsnis. Įstatymo paskirtis
1. Šis įstatymas nustato mokėjimo įstaigų steigimo tvarką.
2. Šio įstatymo nuostatos suderintos su Europos Sąjungos teisės aktais.
Straipsnio pakeitimai:
Nr. XIII-1234, 2018-06-28, paskelbta TAR 2018-07-10, i. k. 2018-11546
2 straipsnis. Pagrindinės šio įstatymo sąvokos
1. Mokėjimo įstaiga – juridinis asmuo, turintis licenciją.
2. Kitos sąvokos:
1) kliento lėšos – lėšos, gautos iš klientų;
2) pagrindinė veikla – mokėjimo paslaugos.
12¹ straipsnis. Įterptas straipsnis
Tekstas be dalių.
ANTRASIS SKIRSNIS
LICENCIJAVIMAS
5 straipsnis. Licencija
Licenciją išduoda Lietuvos bankas."""

EU_EN = """REGULATION (EU) 2023/1114 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL
of 31 May 2023
on markets in crypto-assets
Whereas:
(1) It is important to ensure that Union legislative acts on financial services are fit for the digital age.
(2) Crypto-assets are one of the main applications of blockchain technology.
continuation of recital two.
HAVE ADOPTED THIS REGULATION:
TITLE I
SUBJECT MATTER, SCOPE AND DEFINITIONS
Article 1
Subject matter
1. This Regulation lays down uniform requirements for the offer to the public of crypto-assets.
2. In particular, this Regulation lays down the following:
(a) transparency and disclosure requirements;
(b) requirements for the authorisation of crypto-asset service providers;
(c) requirements for issuers.
TITLE V
AUTHORISATION AND OPERATING CONDITIONS FOR CRYPTO-ASSET SERVICE PROVIDERS
CHAPTER 1
Authorisation of crypto-asset service providers
Article 59
Authorisation
1. A person shall not provide crypto-asset services, within the Union, unless that person is:
(a) a legal person that has been authorised as a crypto-asset service provider in accordance with Article 63; or
(b) a credit institution.
2. Crypto-asset service providers shall have their registered office in a Member State.
Article 78
Execution of orders for crypto-assets on behalf of clients
1. Crypto-asset service providers executing orders shall take all necessary steps to obtain the best possible result.
ANNEX I
INFORMATION ITEMS FOR THE CRYPTO-ASSET WHITE PAPER
Part A: Information about the offeror"""

LB = """LIETUVOS BANKO VALDYBA
NUTARIMAS
DĖL INFORMACINIŲ IR RYŠIŲ TECHNOLOGIJŲ IR SAUGUMO RIZIKOS VALDYMO REIKALAVIMŲ APRAŠO PATVIRTINIMO
I SKYRIUS
BENDROSIOS NUOSTATOS
1. Aprašas nustato reikalavimus.
2. Aprašas taikomas:
2.1. bankams;
2.2. mokėjimo įstaigoms.
II SKYRIUS
VALDYMAS
3. Įstaiga turi turėti IRT strategiją.
papildomas sakinys."""

# A supervisor's guidelines as their PDF reads: numbered paragraphs of the opening part, then guidelines whose
# headings carry no number of their own and whose paragraphs are numbered "4.1.", "4.2."
GUIDELINES = """EBA/GL/2021/02
1. Prievolės laikytis gairių ir teikti pranešimus
1. Šiame dokumente pateiktos gairės.
2. Kompetentingos institucijos turi pranešti EBI, ar laikosi šių gairių.
1 gairė. Rizikos vertinimas. Visoms įmonėms taikomi pagrindiniai
principai
1.1. Įmonės turėtų užtikrinti, kad nuodugniai supranta kylančią riziką.
1.2. Šiuo tikslu įmonės turėtų įvertinti:
a) riziką, kylančią dėl jų veiklos pobūdžio;
b) riziką, kylančią užmezgus dalykinius santykius.
2 gairė. Rizikos veiksnių nustatymas
Įmonės turėtų nustatyti rizikos veiksnius, susijusius su klientais.
Įmonės turėtų atkreipti dėmesį, kad išvardyti ne visi veiksniai.
4 gairė. Deramo klientų tikrinimo priemonės.
4.1. Įmonės turėtų nustatyti deramo klientų tikrinimo politiką.
4.2. 8 gairėje pateiktos korespondentiniams santykiams skirtos gairės.
tęsinys be numerio.
Guideline 21: Sectoral guideline for crypto-asset service providers
21.1. CASPs should be mindful of the risk."""








############################################################
# ingest_act
############################################################
#
# Creates an upload-kind act through the admin API, uploads
# `text` as its file and runs the ingest job to completion.
# Answers the LegalDocument.
#
# Used by:
#   - the test cases below, tests/test_pipeline.py,
#     tests/test_assessment.py and the other pipeline tests
############################################################

def ingest_act(admin_client, text, *, title, short_title, jurisdiction="EU", language="en", external_id="",
               applies_to=("casp",), domains=("crypto",), doc_type="regulation"):
    body = {"title": title, "shortTitle": short_title, "jurisdiction": jurisdiction, "language": language,
            "docType": doc_type, "sourceKind": "upload", "externalId": external_id,
            "appliesTo": list(applies_to), "domains": list(domains)}
    created = post_json(admin_client, "/api/corpus/documents", body)
    assert created.status_code == 201, created.content
    upload = io.BytesIO(text.encode("utf-8"))
    upload.name = f"{short_title}.txt"
    response = admin_client.post(f"/api/corpus/documents/{created.json()['id']}/upload", {"file": upload})
    assert response.status_code in (201, 202), response.content
    while run_once(heartbeat=False):
        pass
    return LegalDocument.objects.get(id=created.json()["id"])








class StructureTests(TestCase):

    def _outline(self, text, language):
        tree, rows, chain = parse_structure(text, language), [], []
        for unit, parent, depth in iter_units(tree):
            chain = chain[:depth] + [unit]
            rows.append((unit.unit_type, unit.number, citation_path(chain, language)))
        return rows

    def test_lithuanian_law(self):
        rows = self._outline(LT_LAW, "lt")
        paths = [path for kind, number, path in rows if kind == "article"]
        self.assertEqual(paths, ["1 str.", "2 str.", "12¹ str.", "5 str."])
        self.assertIn(("point", "1", "2 str. 2 d. 1 p."), rows)
        # e-seimas amendment notes are noise, not content
        article = next(u for u, _, _ in iter_units(parse_structure(LT_LAW, "lt")) if u.number == "1")
        self.assertNotIn("Straipsnio pakeitimai", article.full_text())

    def test_eu_regulation(self):
        rows = self._outline(EU_EN, "en")
        kinds = {kind for kind, _, _ in rows}
        self.assertTrue({"recital", "title", "chapter", "article", "paragraph", "point", "annex"} <= kinds)
        self.assertIn(("point", "a", "Art. 59(1)(a)"), rows)
        self.assertIn(("article", "78", "Art. 78"), rows)

    def test_bank_of_lithuania_resolution(self):
        rows = self._outline(LB, "lt")
        chapters = [(n, p) for k, n, p in rows if k == "chapter"]
        self.assertEqual(chapters, [("I", "I SKYRIUS BENDROSIOS NUOSTATOS"), ("II", "II SKYRIUS VALDYMAS")])
        points = [(number, path) for kind, number, path in rows if kind in ("point", "subpoint")]
        self.assertEqual(points[:4], [("1", "1 p."), ("2", "2 p."), ("2.1", "2.1 p."), ("2.2", "2.2 p.")])
        # "2.1." stands under its point "2."
        self.assertEqual([(kind, number) for kind, number, _ in rows if number in ("2", "2.1")], [("point", "2"), ("subpoint", "2.1")])

    def test_a_paged_text_loses_what_every_page_repeats(self):
        words = ("klientų", "valstybių", "produktų", "paslaugų", "kanalų", "sandorių", "tarpininkų", "technologijų")
        verbs = ("įvertinti", "nustatyti", "peržiūrėti", "dokumentuoti", "stebėti", "sumažinti")
        body = [[f"{page}.{line}. Įmonės turėtų {verbs[page - 1]} {words[line - 1]} riziką." for line in range(1, 9)]
                for page in range(1, 7)]
        paged = "\n\f\n".join("\n".join(["GALUTINĖ ATASKAITA DĖL RIZIKOS VEIKSNIŲ GAIRIŲ", str(number), "EBA Regular Use"] + lines)
                               for number, lines in enumerate(body, 1))
        cleaned = without_furniture(paged)
        self.assertEqual(cleaned.split("\n"), [line for lines in body for line in lines])
        self.assertEqual(without_furniture("1. Vienas puslapis.\n2\nEBA Regular Use"), "1. Vienas puslapis.\n2\nEBA Regular Use",
                         "a text of one page shows no pattern and is left as it is")

    def test_guidelines_number_their_paragraphs_under_unnumbered_headings(self):
        tree = parse_structure(GUIDELINES, "lt")
        sections = [unit for unit in tree if unit.unit_type == "section"]
        self.assertEqual([(unit.number, unit.heading) for unit in sections], [
            ("1", "1 gairė. Rizikos vertinimas. Visoms įmonėms taikomi pagrindiniai principai"),
            ("2", "2 gairė. Rizikos veiksnių nustatymas"),
            ("4", "4 gairė. Deramo klientų tikrinimo priemonės."),
            ("21", "Guideline 21: Sectoral guideline for crypto-asset service providers")])
        # Each paragraph is a provision of its own, beside the one before it — not under the first. A guideline
        # printed without its paragraph numbers keeps its text as one run
        self.assertEqual([[(child.unit_type, child.number) for child in unit.children] for unit in sections],
                         [[("point", "1.1"), ("point", "1.2")], [("text", "")], [("point", "4.1"), ("point", "4.2")],
                          [("point", "21.1")]])
        self.assertEqual(len(sections[1].children[0].lines), 2)
        rows = self._outline(GUIDELINES, "lt")
        self.assertIn(("point", "4.2", "4.2 p."), rows)
        second = sections[0].children[1]
        self.assertIn("b) riziką, kylančią užmezgus dalykinius santykius.", second.full_text(), "a list stays in its paragraph")
        # A mention of a guideline inside a sentence opens nothing, and unnumbered text stays where it is
        self.assertIn("tęsinys be numerio.", sections[2].children[1].full_text())
        self.assertEqual(len(sections[2].children), 2)
        # The opening part keeps its own numbered points, outside the guidelines
        self.assertEqual([unit.number for unit in tree if unit.unit_type == "point"], ["1", "1", "2"])


class IngestSearchTests(TestCase):

    def setUp(self):
        self.admin_client = signed_in(create_admin())
        with fake_models():
            self.mica = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                                   external_id="32023R1114")

    def test_ingest_activates_a_version_with_units_and_vectors(self):
        version = self.mica.current_version
        self.assertEqual(version.status, "ready")
        self.assertEqual(version.article_count, 3)
        self.assertTrue(LegalUnit.objects.filter(version=version, unit_type="article", number="59").exists())
        chunks = LegalChunk.objects.filter(version=version)
        self.assertTrue(chunks.exists())
        self.assertFalse(chunks.filter(embedding__isnull=True).exists())
        self.assertEqual(Job.objects.get(kind="corpus.ingest").status, "done")

    def test_a_new_upload_replaces_the_active_version(self):
        with fake_models():
            upload = io.BytesIO(EU_EN.replace("registered office", "head office").encode())
            upload.name = "MiCA.txt"
            self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/upload", {"file": upload})
            while run_once(heartbeat=False):
                pass
        self.mica.refresh_from_db()
        self.assertEqual(self.mica.current_version.version_no, 2)
        self.assertFalse(LegalChunk.objects.filter(document=self.mica).exclude(version=self.mica.current_version)
                         .exists(), "old chunks are gone from retrieval")

    def test_a_text_the_act_has_had_before_takes_over_what_was_read_from_it(self):
        # A refresh during an outage of the EU's version index put the base act in
        # place of the consolidated text; when the next refresh brought that text
        # back, its obligations and readings were still on the version before last
        first = self.mica.current_version
        unit = LegalUnit.objects.filter(version=first, unit_type="article", number="59").first()
        now = utc_now()
        for state in ("approved", "proposed"):
            Obligation.objects.create(id=f"ob-{state}", source_kind="legal", document=self.mica, version=first, unit=unit,
                                      title=state, text="Tekstas", status=state, citations=[{"unitId": unit.id, "path": unit.path}],
                                      created_at=now, updated_at=now)
        LegalDocumentVersion.objects.filter(id=first.id).update(
            scope={"types": ["casp"], "reasoning": "r"}, sanctions={"tiers": [], "note": "n"}, obligations_extracted_at=now)

        def upload(text):
            with fake_models():
                file = io.BytesIO(text.encode())
                file.name = "MiCA.txt"
                self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/upload", {"file": file})
                while run_once(heartbeat=False):
                    pass
            return LegalDocument.objects.get(id=self.mica.id).current_version, Job.objects.filter(kind="corpus.ingest").order_by("-created_at").first()

        other, job = upload(EU_EN.replace("registered office", "head office"))
        self.assertEqual((other.version_no, other.scope, other.obligations_extracted_at), (2, None, None))
        self.assertNotIn("takenOver", job.result)
        self.assertEqual(Obligation.objects.filter(version=first).count(), 2, "another text takes nothing over")

        back, job = upload(EU_EN)
        self.assertEqual((back.version_no, job.result["takenOver"]), (3, {"fromVersion": 1, "obligations": 2}))
        moved = Obligation.objects.filter(version=back)
        self.assertEqual(sorted(moved.values_list("status", flat=True)), ["approved", "proposed"])
        self.assertEqual({LegalUnit.objects.get(id=row.unit_id).version_id for row in moved}, {back.id})
        self.assertEqual((back.scope, back.sanctions), ({"types": ["casp"], "reasoning": "r"}, {"tiers": [], "note": "n"}))
        self.assertIsNotNone(back.obligations_extracted_at, "nothing is left for a model to read again")

    def test_an_edition_issued_again_with_the_same_text_is_no_new_version(self):
        # On 15 November 2026 the register gave the edition in
        # force of a law another id: other bytes, another label,
        # not a character of the text changed. Taken as a new
        # version, it left the act's approved obligations and
        # what was read of its scope and sanctions on the old one
        LegalDocument.objects.filter(id=self.mica.id).update(source_kind="etar")
        first = self.mica.current_version
        LegalDocumentVersion.objects.filter(id=first.id).update(label="TAR.0000/first")
        kept = Obligation.objects.create(
            id="kept", source_kind="legal", document=self.mica, version=first, title="Pareiga", text="Tekstas",
            status="approved", citations=[], created_at=utc_now(), updated_at=utc_now())

        def refresh(label, text, force=False):
            issued = FetchResult(raw=text.encode(), content_type="text/plain", source_url="https://www.e-tar.lt/x",
                                 filename="act.txt", version_label=label)
            with fake_models(), mock.patch("compliance.corpus.ingest.fetch_document", return_value=issued):
                post_json(self.admin_client, f"/api/corpus/documents/{self.mica.id}/refresh", {"force": force})
                while run_once(heartbeat=False):
                    pass
            self.mica.refresh_from_db()
            return Job.objects.filter(kind="corpus.ingest").order_by("-created_at").first()

        job = refresh("TAR.0000/second", EU_EN + "\n\n")
        self.assertEqual((job.status, job.result), ("done", {"unchanged": True, "version": 1}))
        self.assertEqual(self.mica.current_version_id, first.id)
        self.assertEqual(list(LegalDocumentVersion.objects.filter(document=self.mica).values_list("version_no", "label")),
                         [(1, "TAR.0000/second")], "no second version, and the next check knows the edition by its label")
        self.assertEqual(Obligation.objects.get(id=kept.id).version_id, self.mica.current_version_id)
        self.assertTrue(LegalChunk.objects.filter(version=first, embedding__isnull=False).exists())
        self.assertEqual(len(os.listdir(os.path.dirname(first.file_path))), 1, "the bytes read in vain are not kept")

        # A text that did change is a new version, as before
        refresh("TAR.0000/third", EU_EN.replace("registered office", "head office"))
        self.assertEqual((self.mica.current_version.version_no, self.mica.current_version.label), (2, "TAR.0000/third"))
        self.assertEqual(self.mica.current_version.changes["changed"], ["Art. 59"])
        # And an administrator's forced refresh reads even the same text again
        refresh("TAR.0000/fourth", EU_EN.replace("registered office", "head office"), force=True)
        self.assertEqual(self.mica.current_version.version_no, 3)

    def test_a_search_names_its_acts_as_any_lookup_does_whatever_the_case(self):
        query = "authorisation of crypto-asset service providers registered office"
        with fake_models():
            named = {name: search_corpus(query, k=3, documents=[name])
                     for name in ("MiCA", "mica", "32023r1114", self.mica.id, "no such act")}
        self.assertTrue(named["MiCA"])
        # The short title in lower case and the CELEX number in lower case mean the same act
        for name in ("mica", "32023r1114", self.mica.id):
            self.assertEqual([hit["unitId"] for hit in named[name]], [hit["unitId"] for hit in named["MiCA"]], name)
        self.assertEqual(named["no such act"], [], "a name that means no act narrows the search to nothing")

    def test_the_act_page_is_told_what_the_models_read_from_the_text(self):
        detail = lambda: self.admin_client.get(f"/api/corpus/documents/{self.mica.id}").json()
        self.assertIsNone(detail()["scopeReading"])
        self.assertIsNone(detail()["sanctionsReading"])
        LegalDocumentVersion.objects.filter(id=self.mica.current_version_id).update(
            scope={"types": ["casp"], "reasoning": "Article 2 names the providers.", "readAt": "2026-11-19T10:00:00+00:00",
                   "model": "m", "promptVersionId": "v"},
            sanctions={"tiers": [{"where": "1 d."}, {"where": "2 d."}], "note": "Ceilings are minimums.",
                       "readAt": "2026-11-19T10:01:00+00:00", "provisions": [], "model": "m", "promptVersionId": "v"})
        self.assertEqual(detail()["scopeReading"], {"types": ["casp"], "reasoning": "Article 2 names the providers.",
                                                    "readAt": "2026-11-19T10:00:00+00:00"})
        self.assertEqual(detail()["sanctionsReading"], {"tiers": 2, "note": "Ceilings are minimums.",
                                                        "readAt": "2026-11-19T10:01:00+00:00"})
        # The catalogue's rows do not carry the readings
        listed = self.admin_client.get("/api/corpus/documents").json()["documents"][0]
        self.assertNotIn("scopeReading", listed)

    def test_hybrid_search_and_exact_provisions(self):
        with fake_models():
            hits = search_corpus("authorisation of crypto-asset service providers registered office", k=3)
        self.assertTrue(hits)
        self.assertIn("59", hits[0]["path"])
        self.assertTrue(hits[0]["citationUrl"].startswith("https://eur-lex.europa.eu/legal-content/EN/TXT/"))

        found = find_provision("MiCA", "Article 59", paragraph="1")
        self.assertEqual(found["path"], "Art. 59(1)")
        self.assertIn("credit institution", found["text"])
        self.assertEqual(found["versionNo"], 1)
        self.assertTrue(found["citationUrl"].endswith("CELEX:32023R1114#art_59"))
        self.assertEqual(find_provision("32023R1114", "78")["heading"],
                         "Execution of orders for crypto-assets on behalf of clients")
        self.assertIsNone(find_provision("MiCA", "999"))

    def test_an_inserted_article_is_found_however_it_is_stored_and_asked_for(self):
        # The text parser keeps an inserted article as 12¹, the
        # e-tar parser as 12-1, the way the register's markup
        # carries it: a lookup that knew one spelling missed
        # every act read by the other parser
        with fake_models():
            law = ingest_act(self.admin_client, LT_LAW, title="Mokėjimo įstaigų įstatymas", short_title="MĮĮ",
                             jurisdiction="LT", language="lt", doc_type="law")
        inserted = LegalUnit.objects.get(version=law.current_version, unit_type="article", number="12¹")
        offline = gateway.GatewayError(0, "UNREACHABLE", "down")
        for stored in ("12¹", "12-1"):
            LegalUnit.objects.filter(id=inserted.id).update(number=stored)
            for asked in ("12¹", "12-1", "12(1)", "12^1", "straipsnis 12-1"):
                found = find_provision("MĮĮ", asked)
                self.assertEqual(found and found["heading"], "Įterptas straipsnis", (stored, asked))
            with mock.patch.object(gateway, "embed", side_effect=offline):
                results = check_citations([{"act": "MĮĮ", "article": "12-1"}, {"act": "MĮĮ", "article": "12¹"}])
            self.assertEqual([r["status"] for r in results], ["found", "found"], stored)
        self.assertIsNone(find_provision("MĮĮ", "121"), "12¹ is not article 121")

    def test_an_act_of_the_register_links_to_its_page_there(self):
        # The catalogue gives an e-tar act its id and no address;
        # its provisions still link to the official text
        act = LegalDocument(jurisdiction="LT", language="lt", source_kind="etar", external_id="TAR.B6B636C7384A")
        self.assertEqual(citation_url(act), "https://www.e-tar.lt/portal/lt/legalAct/TAR.B6B636C7384A/asr")
        act.external_id = "e45f4270b70011e6aae49c0b9525cbbb"
        self.assertEqual(citation_url(act), "https://www.e-tar.lt/portal/lt/legalAct/e45f4270b70011e6aae49c0b9525cbbb/asr")
        act.source_url = "https://www.lb.lt/lt/teises-aktai"
        self.assertEqual(citation_url(act), "https://www.lb.lt/lt/teises-aktai", "an address the catalogue gives wins")
        self.assertEqual(citation_url(LegalDocument(jurisdiction="LT", source_kind="etar", external_id="not an id")), "")
        self.assertEqual(citation_url(LegalDocument(jurisdiction="LT", source_kind="upload", external_id="")), "")

    def test_citation_check_catches_a_wrong_article(self):
        offline = gateway.GatewayError(0, "UNREACHABLE", "down")
        with mock.patch.object(gateway, "embed", side_effect=offline):
            results = check_citations([
                {"act": "MiCA", "article": "78", "claimedHeading": "Execution of orders on behalf of clients"},
                {"act": "MiCA", "article": "59", "claimedHeading": "Subject matter"},
                {"act": "MiCA", "article": "59", "paragraph": "1", "point": "b"},
                {"act": "MiCA", "article": "81"},
                {"act": "DORA", "article": "5"},
            ])
        self.assertEqual([r["status"] for r in results], ["found", "found", "found", "not_found", "act_not_in_corpus"])
        self.assertEqual(results[0]["headingMatch"], "match", "word overlap without a model")
        self.assertEqual(results[1]["headingMatch"], "mismatch")
        self.assertEqual(results[1]["heading"], "Authorisation")
        self.assertEqual(results[2]["path"], "Art. 59(1)(b)")
        self.assertEqual(results[2]["heading"], "Authorisation", "a point carries its article's heading")

        # With the model: one call judges the batch
        seed_defaults()
        with fake_models() as model:
            judged = check_citations([{"act": "MiCA", "article": "78", "claimedHeading": "Advice on crypto-assets"}])
        self.assertEqual(judged[0]["headingMatch"], "mismatch")
        self.assertEqual(judged[0]["note"], "Execution of orders.")
        self.assertEqual([name for name, _ in model.calls], ["verdicts"])

        client = signed_in(create_user())
        r = post_json(client, "/api/corpus/check-citations", {"citations": [{"act": "MiCA", "article": "59"}]})
        self.assertEqual(r.json()["results"][0]["status"], "found")
        for bad in ({}, {"citations": []}, {"citations": [{"article": "5"}]}, {"citations": "x"}):
            self.assertEqual(post_json(client, "/api/corpus/check-citations", bad).status_code, 400, bad)

    def test_the_checker_reads_a_range_or_list_as_the_audit_does(self):
        # A document or the chat quotes "Art. 58–60": each article
        # is looked up and the best one answers — not "no such
        # provision" for the whole range read as one number
        asked = [{"act": "MiCA", "article": "58–60", "claimedHeading": "Authorisation"},
                 {"act": "MiCA", "article": "2, 59", "claimedHeading": "Authorisation"},
                 {"act": "MiCA", "article": "Art. 59(1)(b)"},
                 {"act": "MiCA", "article": "2–3", "claimedHeading": "Authorisation"}]
        client = signed_in(create_user())
        results = post_json(client, "/api/corpus/check-citations", {"citations": asked}).json()["results"]
        self.assertEqual([r["status"] for r in results], ["found", "found", "found", "not_found"])
        self.assertEqual([r["article"] for r in results], ["58–60", "2, 59", "Art. 59(1)(b)", "2–3"],
                         "the answer echoes what was asked")
        self.assertEqual((results[0]["path"], results[0]["heading"]), ("Art. 59", "Authorisation"))
        self.assertEqual(results[2]["path"], "Art. 59(1)(b)")
        self.assertEqual(results[0]["claimedHeading"], "Authorisation", "no lookup note leaks into the answer")

    def test_a_provision_links_its_official_text(self):
        user = signed_in(create_user())
        paragraph = LegalUnit.objects.get(version=self.mica.current_version, unit_type="paragraph",
                                          parent__number="59", number="1")
        unit = user.get(f"/api/corpus/units/{paragraph.id}").json()
        self.assertEqual(unit["path"], "Art. 59(1)")
        self.assertTrue(unit["isCurrent"])
        # The EUR-Lex anchor names the ARTICLE the paragraph sits in
        self.assertTrue(unit["citationUrl"].endswith("CELEX:32023R1114#art_59"), unit["citationUrl"])
        self.assertEqual(user.get("/api/corpus/units/no-such-unit").status_code, 404)

    def test_readers_read_admins_write(self):
        user = signed_in(create_user())
        self.assertEqual(len(user.get("/api/corpus/documents").json()["documents"]), 1)
        self.assertEqual(post_json(user, "/api/corpus/documents", {"title": "X", "jurisdiction": "EU"}).status_code, 403)
        self.assertEqual(user.post(f"/api/corpus/documents/{self.mica.id}/refresh").status_code, 403)
        units = user.get(f"/api/corpus/documents/{self.mica.id}/units?type=article").json()
        self.assertEqual([u["number"] for u in units["units"]], ["1", "59", "78"])


class ObligationTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin = create_admin()
        self.admin_client = signed_in(self.admin)
        with fake_models():
            self.mica = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                                   external_id="32023R1114")

    def _extract(self):
        with fake_models():
            r = self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/extract-obligations")
            self.assertEqual(r.status_code, 202)
            while run_once(heartbeat=False):
                pass

    def test_the_act_names_its_extraction_while_it_waits_or_runs(self):
        latest = lambda: self.admin_client.get(f"/api/corpus/documents/{self.mica.id}").json()["latestJob"]
        self.assertEqual((latest()["kind"], latest()["status"]), ("corpus.ingest", "done"))
        with fake_models():
            queued = self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/extract-obligations").json()
        self.assertEqual((latest()["id"], latest()["kind"], latest()["status"]), (queued["id"], "corpus.extract_obligations", "queued"))
        # A later job that already ended does not hide the one still waiting
        ended = enqueue("corpus.ingest", {"document_id": self.mica.id}, subject=f"corpus:{self.mica.id}")
        Job.objects.filter(id=ended.id).update(status="failed", error="source down")
        self.assertEqual(latest()["id"], queued["id"])
        with fake_models():
            while run_once(heartbeat=False):
                pass
        # Nothing waits or runs: the most recent of the two kinds
        self.assertEqual((latest()["id"], latest()["status"]), (ended.id, "failed"))

    def test_the_extraction_is_told_whom_a_duty_may_apply_to_in_words(self):
        from compliance.corpus.obligations import APPLIES_TO_VALUES, SCHEMA

        with fake_models() as model:
            self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/extract-obligations")
            while run_once(heartbeat=False):
                pass
        told = next(text for name, text in model.instructions if name == "obligations")
        # The two values that are no licence category are said in words; a duty has an addressee, so "unknown" is none
        self.assertIn("other_financial (a financial institution of another kind), none (an addressee that is no "
                      "financial institution: an ICT provider, a project owner, an authority), all", told)
        self.assertNotIn("unknown", APPLIES_TO_VALUES)
        allowed = SCHEMA["properties"]["obligations"]["items"]["properties"]["appliesTo"]["items"]["enum"]
        self.assertEqual(allowed, APPLIES_TO_VALUES)

    def test_the_list_takes_one_state_or_several_with_commas_between(self):
        now = utc_now()
        for state in ("proposed", "approved", "rejected"):
            Obligation.objects.create(id=f"ob-{state}", source_kind="legal", document=self.mica,
                                      version=self.mica.current_version, title=state, text="Tekstas", status=state,
                                      citations=[], created_at=now, updated_at=now)
        listed = lambda query: sorted(row["id"] for row in self.admin_client.get(
            f"/api/obligations?document={self.mica.id}{query}").json()["obligations"])
        self.assertEqual(listed(""), ["ob-approved", "ob-proposed", "ob-rejected"])
        self.assertEqual(listed("&status=rejected"), ["ob-rejected"])
        # What a report assesses: everything a reviewer did not reject
        self.assertEqual(listed("&status=proposed,approved"), ["ob-approved", "ob-proposed"])
        self.assertEqual(listed("&status=maybe"), ["ob-approved", "ob-proposed", "ob-rejected"],
                         "a state that is none narrows nothing")

    def test_extraction_review_and_carry_forward(self):
        self._extract()
        proposed = Obligation.objects.filter(document=self.mica, status="proposed")
        self.assertTrue(proposed.exists())
        self.assertTrue(all(o.citations and o.embedding is not None for o in proposed))
        self.assertIsNotNone(LegalDocumentVersion.objects.get(id=self.mica.current_version_id).obligations_extracted_at)

        # Bulk review: approve all, reject nothing; non-admins refused
        ids = list(proposed.values_list("id", flat=True))
        self.assertEqual(post_json(signed_in(create_user()), "/api/obligations/review",
                                   {"ids": ids, "status": "approved"}).status_code, 403)
        r = post_json(self.admin_client, "/api/obligations/review", {"ids": ids, "status": "approved"})
        self.assertEqual(r.json()["updated"], len(ids))
        self.assertEqual(post_json(self.admin_client, "/api/obligations/review",
                                   {"ids": ids, "status": "maybe"}).status_code, 400)

        # A new version with the same provisions keeps the approvals
        # — also where two units share a path, as an article of the
        # register's laws does with its one unnumbered paragraph:
        # the obligation goes to the unit that holds its text
        cited = LegalUnit.objects.get(id=Obligation.objects.get(id=ids[0]).unit_id)

        def shares_the_path(version, twin_id):
            LegalUnit.objects.create(id=twin_id, version=version, parent=None, ordinal=cited.ordinal, depth=cited.depth,
                                     unit_type="paragraph", number="", path=cited.path, heading="",
                                     text="Other words under the same path.")

        shares_the_path(self.mica.current_version, "twin-1")
        with fake_models():
            upload = io.BytesIO((EU_EN + "\nPart B: Information about the issuer").encode())
            upload.name = "MiCA.txt"
            self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/upload", {"file": upload})
            while run_once(heartbeat=False):
                pass
        shares_the_path(LegalDocument.objects.get(id=self.mica.id).current_version, "twin-2")
        self._extract()
        self.mica.refresh_from_db()
        carried = Obligation.objects.filter(document=self.mica, status="approved", version=self.mica.current_version)
        self.assertEqual(carried.count(), len(ids))
        self.assertTrue(all(LegalUnit.objects.get(id=o.unit_id).version_id == self.mica.current_version_id
                            for o in carried))








class BulkExtractionTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        with fake_models():
            self.mica = ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                                   external_id="32023R1114")
            self.law = ingest_act(self.admin_client, LT_LAW, title="Pinigų plovimo prevencijos įstatymas",
                                  short_title="PPTFPĮ", jurisdiction="LT", language="lt")

    def _command(self, *slugs):
        out = io.StringIO()
        call_command("extract_obligations", *slugs, stdout=out)
        return out.getvalue()

    def _work(self):
        with fake_models() as model:
            while run_once(heartbeat=False):
                pass
        return [name for name, _ in model.calls]

    def _queued(self):
        return list(Job.objects.filter(kind="corpus.extract_obligations", status="queued").order_by("created_at"))

    def test_the_command_queues_the_acts_behind_the_prompt_in_force(self):
        # Never read: both acts, the smaller first, below the work users start
        said = self._command()
        jobs = self._queued()
        smaller_first = sorted([self.mica, self.law], key=lambda d: d.current_version.char_count)
        self.assertEqual([j.payload["document_id"] for j in jobs], [d.id for d in smaller_first])
        self.assertTrue(all(j.priority == -1 and j.payload["only_behind"] and j.created_by_id is None for j in jobs))
        self.assertIn("Queued 2 act(s) for corpus.extract_obligations v1 on gateway:azure/gpt-6.1-sol: ", said)

        # Asked again while they wait: nothing is queued twice
        self.assertIn("Already waiting", self._command())
        self.assertEqual(len(self._queued()), 2)

        # Read: nothing is behind any more
        self.assertEqual(self._work().count("obligations"), 2)
        self.assertTrue(Obligation.objects.filter(document=self.law, status="proposed").exists())
        self.assertIn("Nothing is behind", self._command())
        self.assertEqual(self._queued(), [])

        # A new version of the prompt puts every act behind again; a disabled act is left out
        prompt = Prompt.objects.get(slug="corpus.extract_obligations")
        add_version(prompt, prompt.active_version.text + "\nBe thorough.", "gateway:azure/gpt-6.1-sol", activate=True)
        LegalDocument.objects.filter(id=self.law.id).update(enabled=False)
        self.assertIn("Queued 1 act(s) for corpus.extract_obligations v2 on gateway:azure/gpt-6.1-sol: " + self.mica.slug,
                      self._command())
        self.assertEqual([j.payload["document_id"] for j in self._queued()], [self.mica.id])

    def test_a_named_act_is_read_whatever_its_state_and_an_unknown_name_is_refused(self):
        self._command()
        self._work()
        self.assertIn(": " + self.law.slug, self._command(self.law.slug))
        [job] = self._queued()
        self.assertEqual((job.payload["document_id"], job.payload["only_behind"]), (self.law.id, False))
        self.assertEqual(self._work(), ["obligations"], "read again although it was not behind")
        with self.assertRaisesMessage(CommandError, "No ingested act is called nope"):
            self._command(self.mica.slug, "nope")
        self.assertEqual(self._queued(), [], "nothing is queued when a name is wrong")

    def test_a_bulk_job_skips_an_act_that_was_read_while_it_waited(self):
        self._command()
        # A report read MiCA itself before the bulk job's turn came
        with fake_models():
            self.admin_client.post(f"/api/corpus/documents/{self.mica.id}/extract-obligations")
        waiting = Job.objects.get(subject=f"obligations:{self.mica.id}", status="queued")
        self.assertTrue(waiting.payload["only_behind"], "the extract button answers the waiting job")
        LegalDocumentVersion.objects.filter(id=self.mica.current_version_id).update(obligations_extracted_at=utc_now())
        self.assertEqual(self._work(), ["obligations"], "only the other act was read")
        waiting.refresh_from_db()
        self.assertEqual((waiting.status, waiting.result), ("done", {"skipped": True}))

    def test_without_the_prompt_the_command_says_what_to_run(self):
        Prompt.objects.filter(slug="corpus.extract_obligations").delete()
        with self.assertRaisesMessage(CommandError, "run seed_prompts first"):
            self._command()
