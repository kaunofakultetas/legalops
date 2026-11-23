############################################################
#  [*] Tests — official sources: structural parsers, the
#      fetchers' egress rules, and an ingest from CELLAR
#
#  The fixtures (tests/fixtures/corpus/) are real, trimmed
#  publications fetched on 2026-09-27: MiCA from CELLAR
#  (Official Journal and consolidated XHTML, Lithuanian), the
#  Mokėjimo įstaigų įstatymas and LB resolution 03-126 from
#  e-tar, a Bank of Lithuania licensing page. No network: the
#  HTTP layer is mocked.
############################################################


import json
from pathlib import Path
from unittest import mock


from django.test import SimpleTestCase, TestCase


from compliance.common.sandbox import parse_structure_sandboxed
from compliance.corpus import fetchers
from compliance.corpus.fetchers import FetchError, check_url, pick_eu_version
from compliance.corpus.models import LegalDocument, LegalUnit
from compliance.corpus.sources.bridge import detect_parser, to_parsed_units
from compliance.corpus.structure import iter_units
from compliance.jobs.runner import run_once
from compliance.tests.fakes import fake_models
from compliance.tests.utils import create_admin, post_json, signed_in


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "corpus"








############################################################
# fixture / units_of
############################################################
#
# A fixture's bytes; a fixture parsed (in the sandbox) into
# ParsedUnits, as {path: unit} plus the flat list.
#
# Used by:
#   - the test cases below
############################################################

def fixture(name):
    return (FIXTURES / name).read_bytes()


def units_of(name, parser, language="lt"):
    tree, error = parse_structure_sandboxed(fixture(name), parser, timeout=120)
    assert tree is not None, error
    units = to_parsed_units(tree, language)
    flat = [unit for unit, _, _ in iter_units(units)]
    return {unit.path: unit for unit in flat if unit.path}, flat, units








############################################################
# FakeResponse
############################################################
#
# What requests.request answers in the fetcher tests.
#
# Used by:
#   - FetcherTests (below)
############################################################

class FakeResponse:

    def __init__(self, status, body=b"", headers=None):
        self.status_code, self.body, self.headers = status, body, headers or {}

    def iter_content(self, size):
        yield self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False








class ParserTests(SimpleTestCase):

    def test_detects_the_publication_format(self):
        self.assertEqual(detect_parser(fixture("cellar_mica_oj_lt.xhtml"), "a.xhtml"), "eu_xhtml")
        self.assertEqual(detect_parser(fixture("etar_mii_2025-07-01.html"), "a.html"), "etar_html")
        self.assertEqual(detect_parser(fixture("lb_casp_licensing.html"), "a.html", source_kind="lb"), "lb_html")
        self.assertIsNone(detect_parser(b"%PDF-1.7 ...", "a.pdf", "application/pdf"))

    def test_mica_official_journal_lithuanian(self):
        by_path, flat, _ = units_of("cellar_mica_oj_lt.xhtml", "eu_xhtml")
        article = by_path["59 str."]
        self.assertEqual(article.unit_type, "article")
        self.assertIn("59 straipsnis", article.full_text("lt"))
        point = by_path["59 str. 1 d. a p."]
        self.assertTrue(point.lines[0].startswith("a) "))
        self.assertTrue(any(u.unit_type == "recital" for u in flat))

    def test_mica_consolidated_matches_the_journal(self):
        consolidated, _, _ = units_of("cellar_mica_consolidated_lt.xhtml", "eu_xhtml")
        journal, _, _ = units_of("cellar_mica_oj_lt.xhtml", "eu_xhtml")
        common = [p for p in journal if p.endswith(" str.") and p in consolidated]
        self.assertTrue(common)
        for path in common:
            self.assertEqual(len(consolidated[path].children), len(journal[path].children), path)

    def test_lithuanian_law_from_etar(self):
        by_path, flat, _ = units_of("etar_mii_2025-07-01.html", "etar_html")
        self.assertIn("1 str. 1 d.", by_path)
        self.assertTrue(by_path["1 str. 1 d."].lines[0].startswith("1. Šis įstatymas"))
        chapters = [u.heading for u in flat if u.unit_type == "chapter"]
        self.assertTrue(chapters[0].startswith("I SKYRIUS"))
        self.assertFalse(any("Straipsnio pakeitimai" in line for u in flat for line in u.lines))

    def test_bank_of_lithuania_resolution_points(self):
        by_path, flat, _ = units_of("etar_lb_03-126.html", "etar_html")
        self.assertIn("5.1 pap.", by_path)
        self.assertTrue(any(u.unit_type == "annex" for u in flat))

    def test_bank_of_lithuania_page(self):
        _, flat, _ = units_of("lb_casp_licensing.html", "lb_html")
        self.assertTrue(any(u.unit_type in ("section", "subsection") for u in flat))
        self.assertGreater(sum(u.unit_type == "point" for u in flat), 10)


class FetcherTests(SimpleTestCase):

    def test_only_https_on_the_standard_port(self):
        self.assertEqual(check_url("http://publications.europa.eu/resource/cellar/x"),
                         "https://publications.europa.eu/resource/cellar/x")
        # Which hosts are reachable is the egress allowlist's call
        self.assertEqual(check_url("https://laws.example.org/a"), "https://laws.example.org/a")
        for bad in ("http://legalops-assistant:3000/internal/llm/models", "http://legalops-django:8000/api/",
                    "https://www.e-tar.lt:8443/x", "file:///etc/passwd", "gopher://x", "https:///no-host"):
            with self.assertRaises(FetchError, msg=bad):
                check_url(bad)

    def test_redirects_are_rechecked_on_every_hop(self):
        answers = [FakeResponse(302, headers={"Location": "https://www.lb.lt/lt/x"}),
                   FakeResponse(302, headers={"Location": "http://legalops-django:8000/admin/"})]
        with mock.patch.object(fetchers.requests, "request", side_effect=answers), \
                mock.patch.object(fetchers, "_pace"):
            with self.assertRaises(FetchError):
                fetchers.request("GET", "https://www.lb.lt/lt/start")

    def test_cellar_picks_the_consolidated_version_and_follows_http_redirects(self):
        versions_json = fixture("cellar_mica_versions.json")
        xhtml = fixture("cellar_mica_consolidated_lt.xhtml")
        seen = []

        def answer(method, url, **kwargs):
            seen.append(url)
            if "sparql" in url:
                return FakeResponse(200, versions_json)
            if "/resource/celex/" in url:
                return FakeResponse(303, headers={"Location": "http://publications.europa.eu/resource/cellar/abc/DOC_3"})
            return FakeResponse(200, xhtml, {"Content-Type": "application/xhtml+xml"})

        document = LegalDocument(external_id="32023R1114", language="lt", jurisdiction="EU")
        with mock.patch.object(fetchers.requests, "request", side_effect=answer), \
                mock.patch.object(fetchers, "_pace"):
            result = fetchers.fetch_cellar(document)
        self.assertEqual(result.parser, "eu_xhtml")
        self.assertTrue(result.version_label.startswith("02023R1114-"))
        self.assertEqual(seen[-1], "https://publications.europa.eu/resource/cellar/abc/DOC_3")
        self.assertIn("CELEX:02023R1114-", result.source_url)

    def test_cellar_without_its_version_index_fetches_nothing(self):
        # Taken in an outage of the index, the base act — the text as first
        # published — replaced the consolidated text in force of fourteen acts
        seen = []

        def answer(method, url, **kwargs):
            seen.append(url)
            if "sparql" in url:
                return FakeResponse(403, b"Forbidden")
            return FakeResponse(200, fixture("cellar_mica_consolidated_lt.xhtml"), {"Content-Type": "application/xhtml+xml"})

        document = LegalDocument(external_id="32023R1114", language="lt", jurisdiction="EU")
        with mock.patch.object(fetchers.requests, "request", side_effect=answer), \
                mock.patch.object(fetchers, "_pace"):
            with self.assertRaisesRegex(FetchError, "SPARQL endpoint answered HTTP 403"):
                fetchers.fetch_cellar(document)
        self.assertEqual(len(seen), 1, "no text is fetched in place of the version the index would have named")

    def test_version_choice_skips_future_consolidations(self):
        versions = [{"celex": "32013R0575", "date": None, "formats": {"LIT": {"xhtml"}}},
                    {"celex": "02013R0575-20260626", "date": "2026-06-26", "formats": {"LIT": {"xhtml"}}},
                    {"celex": "02013R0575-20270101", "date": "2027-01-01", "formats": {"LIT": {"xhtml"}}}]
        from datetime import date
        self.assertEqual(pick_eu_version("32013R0575", versions, "LIT", on=date(2026, 9, 27))[0], "02013R0575-20260626")
        self.assertEqual(pick_eu_version("32013R0575", versions[:1], "LIT", on=date(2026, 9, 27))[0], "32013R0575")

    def test_etar_takes_the_edition_valid_today(self):
        editions = fixture("etar_mii_editions.html")
        law = fixture("etar_mii_2025-07-01.html")

        def answer(method, url, **kwargs):
            return FakeResponse(200, editions if "legalActEditions" in url else law)

        document = LegalDocument(external_id="TAR.4A05AB3730DD", language="lt", jurisdiction="LT")
        with mock.patch.object(fetchers.requests, "request", side_effect=answer), \
                mock.patch.object(fetchers, "_pace"):
            result = fetchers.fetch_etar(document)
        self.assertEqual(result.parser, "etar_html")
        self.assertEqual(result.effective_date.isoformat(), "2025-07-01")
        self.assertTrue(result.version_label.startswith("TAR.4A05AB3730DD/"))
        with self.assertRaises(FetchError):
            fetchers.fetch_etar(LegalDocument(external_id="TAIS.361198"))

    def test_a_page_of_the_bank_is_labelled_by_its_date_and_a_file_by_nothing(self):
        # A page's bytes differ at every fetch, so its "last update" date says whether it changed. A PDF once
        # carried a constant label and was never read again; without one, its bytes and then its text decide
        page = '<html><div class="last_update">Atnaujinta: 2024-07-30</div><p>lb.lt</p></html>'

        def answer(method, url, **kwargs):
            if url.endswith(".pdf"):
                return FakeResponse(200, b"%PDF-1.7 the guidelines", {"Content-Type": "application/pdf"})
            return FakeResponse(200, page.encode(), {"Content-Type": "text/html"})

        with mock.patch.object(fetchers.requests, "request", side_effect=answer), mock.patch.object(fetchers, "_pace"):
            file = fetchers.fetch_lb(LegalDocument(source_url="https://www.lb.lt/uploads/documents/files/gaires.pdf"))
            shown = fetchers.fetch_lb(LegalDocument(source_url="https://www.lb.lt/lt/licencijavimas"))
        self.assertEqual((file.content_type, file.version_label, file.filename), ("application/pdf", "", "gaires.pdf"))
        self.assertEqual((shown.parser, shown.version_label, shown.effective_date.isoformat()),
                         ("lb_html", "2024-07-30", "2024-07-30"))


class SourceIngestTests(TestCase):

    def test_a_cellar_act_ingests_with_official_citations(self):
        admin_client = signed_in(create_admin())
        xhtml = fixture("cellar_mica_consolidated_lt.xhtml")

        def answer(method, url, **kwargs):
            if "sparql" in url:
                return FakeResponse(200, fixture("cellar_mica_versions.json"))
            return FakeResponse(200, xhtml, {"Content-Type": "application/xhtml+xml"})

        with fake_models(), mock.patch.object(fetchers.requests, "request", side_effect=answer), \
                mock.patch.object(fetchers, "_pace"):
            r = post_json(admin_client, "/api/corpus/documents",
                          {"title": "MiCA", "shortTitle": "MiCA", "jurisdiction": "EU", "language": "lt",
                           "sourceKind": "cellar", "externalId": "32023R1114", "appliesTo": ["casp"]})
            self.assertEqual(r.status_code, 201, r.content)
            while run_once(heartbeat=False):
                pass
            document = LegalDocument.objects.get(id=r.json()["id"])
            version = document.current_version
            self.assertEqual((version.parser, version.status), ("eu_xhtml", "ready"))
            self.assertTrue(version.label.startswith("02023R1114-"))
            self.assertTrue(LegalUnit.objects.filter(version=version, path="59 str. 1 d. a p.").exists())

            # The same consolidated version again: nothing new
            admin_client.post(f"/api/corpus/documents/{document.id}/refresh")
            while run_once(heartbeat=False):
                pass
        document.refresh_from_db()
        self.assertEqual(document.current_version.version_no, 1)

        bad = post_json(admin_client, "/api/corpus/documents", {"title": "X", "jurisdiction": "EU",
                                                               "sourceKind": "url",
                                                               "sourceUrl": "http://legalops-django:8000/law.pdf"})
        self.assertEqual(bad.status_code, 400)
