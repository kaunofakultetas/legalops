############################################################
#  [*] Tests — the prompts' labelled cases and their runner
#
#  The case files are data a person edits, so their shape is
#  pinned: unique ids, a known expectation, a reason. The
#  suites are run here against the fake model — which proves
#  the plumbing, not the prompts: a case is put through the
#  code the product runs and scored against its label, an act
#  the corpus lacks fails its case with the reason, and the
#  command records a baseline and refuses a score below it.
############################################################


import io
import json
import re
import tempfile
from pathlib import Path

import yaml

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from compliance.analysis.models import FINDING_STATUSES
from compliance.corpus.models import LegalDocument
from compliance.prompts.evals import suites
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.utils import create_admin, signed_in








class EvalTests(TestCase):

    def setUp(self):
        seed_defaults()

    # The judge's answers that make every verify case come out right
    def _doubts(self):
        return {" ".join(case["entry"]["title"].split()): {"verdict": "partly", "issue": "addressee", "note": "x"}
                for case in suites.load("verify") if case["expect"] == "doubt"}

    def test_the_case_files_are_well_formed(self):
        for name in suites.SUITES:
            cases = suites.load(name)
            self.assertGreaterEqual(len(cases), 9, name)
            ids = [case["id"] for case in cases]
            self.assertEqual(len(ids), len(set(ids)), f"{name}: an id is used twice")
        for case in suites.load("verify"):
            self.assertIn(case["expect"], ("supported", "doubt"), case["id"])
            self.assertTrue(case["why"] and case["provision"]["text"] and case["entry"]["text"], case["id"])
        for case in suites.load("scope"):
            self.assertTrue(case["why"] and case.get("must"), case["id"])
        for case in suites.load("citations"):
            self.assertIn(case["expect"], ("match", "mismatch"), case["id"])
        with open(suites.DATA / "1009-ltd" / "library.yaml", encoding="utf-8") as handle:
            library = yaml.safe_load(handle)
        self.assertEqual(len(library["documents"]), 26)
        for entry in library["documents"]:
            self.assertTrue((suites.DATA / "1009-ltd" / "documents" / entry["file"]).read_text(encoding="utf-8").strip())
        for case in suites.load("gap"):
            self.assertIn(case["expect"], FINDING_STATUSES, case["id"])
            self.assertLessEqual(set(case.get("accept") or []), set(FINDING_STATUSES), case["id"])
            self.assertIn(case["act"], library["acts"], case["id"])
            self.assertTrue(case["why"] and case["obligation"]["text"] and case["obligation"]["provisions"], case["id"])
        companies = suites.load("applicability", "companies")
        for case in suites.load("applicability"):
            self.assertIn(case["expect"], ("applies", "not_applies", "uncertain"), case["id"])
            self.assertLessEqual(set(case.get("accept") or []), {"applies", "not_applies", "uncertain"}, case["id"])
            self.assertIn(case.get("effect", "direct"), ("direct", "institutional"), case["id"])
            self.assertIn(case["company"], companies, case["id"])
            self.assertTrue(case["why"] and case["act"], case["id"])
        for name, spec in companies.items():
            self.assertTrue(spec.get("profile") or (suites.DATA / spec["file"]).read_text(encoding="utf-8").strip(), name)
        for case in suites.load("sanctions"):
            self.assertTrue(case["why"] and case["act"] and isinstance(case["article"], int), case["id"])
            # The ceiling for any breach, that none is stated, or the highest ceiling the article is shown
            asked = case.get("expect") or case.get("highest") or {}
            self.assertTrue(asked.get("none") or asked.get("eur") or asked.get("percent"), case["id"])
            self.assertFalse(case.get("expect") and case.get("highest"), case["id"])
        expected = [case["expect"] for case in suites.load("verify")]
        self.assertGreaterEqual(expected.count("doubt"), 5, "the judge is tested on entries it must doubt")
        self.assertGreaterEqual(expected.count("supported"), 5, "and on entries it must let pass")

    def test_a_judge_case_is_put_as_the_job_puts_it_and_scored_against_its_label(self):
        with fake_models() as model:
            results = suites.run("verify")
        # The fake judge supports everything: the entries to doubt are the misses
        self.assertEqual({result["id"] for result in results if not result["ok"]},
                         {case["id"] for case in suites.load("verify") if case["expect"] == "doubt"})
        read = next(prompt for name, prompt in model.calls if name == "checks")
        self.assertIn("ACT: Lietuvos Respublikos finansų įstaigų įstatymas", read)
        self.assertIn('<provision ref="P1" path="23 str.">', read)
        self.assertIn('<obligation ref="O1" in="P1" cites="23 str. 1 d.">', read)

        with fake_models() as model:
            model.checks = self._doubts()
            results = suites.run("verify")
        self.assertTrue(all(result["ok"] for result in results), [r for r in results if not r["ok"]])

    def test_a_gap_case_is_put_with_the_whole_library_as_a_report_puts_it(self):
        with fake_models() as model:
            results = suites.run("gap")
        cases = suites.load("gap")
        self.assertEqual([result["id"] for result in results], [case["id"] for case in cases])
        self.assertTrue(all(result["got"] in FINDING_STATUSES for result in results))
        calls = [prompt for name, prompt in model.calls if name == "findings"]
        self.assertGreaterEqual(len(calls), len({case["act"] for case in cases}), "at least a call an act")
        for prompt in calls:
            self.assertIn("COMPANY\nCompany: 1009 LTD (demo)", prompt)
            self.assertIn('<document ref="D1" title="00-company-profile.md" kind="profile">', prompt)
            self.assertIn('<document ref="D26" title="F12-marketing-disclosures.md"', prompt)
            self.assertLessEqual(prompt.count("<obligation "), 15)
        first = next(prompt for prompt in calls if "ACT: " in prompt and 'act="MiCA"' in prompt)
        self.assertIn("Applicability verdict: applies — ", first)

        # A status the case accepts as a second reading passes it
        with fake_models() as model:
            model._findings = lambda prompt: {"findings": [
                {"obligationRef": ref, "status": "partial", "analysis": "", "recommendation": "", "evidence": []}
                for ref in re.findall(r'<obligation ref="(O\d+)"', prompt)]}
            results = {result["id"]: result for result in suites.run("gap")}
        for case in cases:
            self.assertEqual(results[case["id"]]["ok"], "partial" in [case["expect"]] + list(case.get("accept") or []),
                             case["id"])

    def test_a_scope_case_reads_the_corpus_and_stores_nothing(self):
        admin_client = signed_in(create_admin())
        with fake_models():
            act = ingest_act(admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                             external_id="32023R1114")
        LegalDocument.objects.filter(id=act.id).update(slug="mica")
        with fake_models() as model:
            model.scopes = {"MiCA": ["casp"]}
            results = {result["id"]: result for result in suites.run("scope")}
        self.assertTrue(results["mica-covers-crypto-providers"]["ok"])
        self.assertEqual(results["mica-covers-crypto-providers"]["got"], ["casp"])
        missing = results["fii-covers-crypto-providers"]
        self.assertEqual((missing["ok"], missing["got"]), (False, "the act is not in the corpus"))
        self.assertIsNone(LegalDocument.objects.get(id=act.id).current_version.scope, "an eval stores no reading")

        # "all" covers what must be covered and breaks what must not
        with fake_models() as model:
            model.scopes = {"MiCA": ["all"]}
            results = {result["id"]: result for result in suites.run("scope")}
        self.assertFalse(results["mica-covers-crypto-providers"]["ok"])

    def test_an_applicability_case_is_judged_on_its_verdict_its_effect_and_its_start(self):
        admin_client = signed_in(create_admin())
        with fake_models():
            act = ingest_act(admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                             external_id="32023R1114")
        LegalDocument.objects.filter(id=act.id).update(slug="mica")

        def run(**verdict):
            with fake_models() as model:
                model.verdicts = {"MiCA": verdict}
                return {result["id"]: result for result in suites.run("applicability")}, model

        # The fake model says "applies, direct" of every act it is shown
        results, model = run()
        self.assertEqual((results["casp-mica"]["ok"], results["casp-mica"]["got"]), (True, "applies, direct"))
        self.assertEqual((results["payments-mica"]["ok"], results["payments-mica"]["got"]), (False, "applies"))
        self.assertEqual((results["casp-dora"]["ok"], results["casp-dora"]["got"]), (False, "the act is not in the corpus"))
        asked = [prompt for name, prompt in model.calls if name == "applicability"]
        self.assertEqual(len(asked), 2, "a call a company")
        self.assertIn("COMPANY\nCompany: 1009 LTD (demo)", asked[0])
        self.assertIn("COMPANY\nCompany: Mokėk (UAB, LT)", asked[1])
        self.assertIn('<act ref="A1" title="Markets in crypto-assets" short="MiCA"', asked[0])
        self.assertIn('<provision ref="A1.P1" path="', asked[0])

        # An act put off to a date still ahead is not an act that applies today
        results, _ = run(appliesFrom="2099-01-01")
        self.assertEqual((results["casp-mica"]["ok"], results["casp-mica"]["got"]), (False, "applies, direct, from 2099-01-01"))
        # A date that has come is no date to wait for
        self.assertTrue(run(appliesFrom="2024-12-30")[0]["casp-mica"]["ok"])
        # The effect a case fixes is part of its answer
        self.assertFalse(run(effect="institutional")[0]["casp-mica"]["ok"])
        results, _ = run(applicability="not_applies")
        self.assertEqual((results["casp-mica"]["ok"], results["payments-mica"]["ok"]), (False, True))

    def test_a_sanction_case_joins_the_reading_to_its_article_and_stores_nothing(self):
        admin_client = signed_in(create_admin())
        penalties = EU_EN.replace("ANNEX I\n", "Article 111\nAdministrative penalties\n1. Fines of EUR 5 000 000.\nANNEX I\n", 1)
        with fake_models():
            act = ingest_act(admin_client, penalties, title="Markets in crypto-assets", short_title="MiCA",
                             external_id="32023R1114")
        LegalDocument.objects.filter(id=act.id).update(slug="mica")

        def run(*tiers):
            with fake_models() as model:
                model.tiers = [{"provisionRef": "P1", "where": "3 d.", "infringedAct": "this", "all": False, "condition": "",
                                "addressee": "legal", "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None,
                                "measures": [], **tier} for tier in tiers]
                return {result["id"]: result for result in suites.run("sanctions")}, model

        results, model = run({"articles": ["59", "60", "64-83"], "maxFineEur": 5000000, "maxFinePercent": 5},
                             {"articles": ["4-14"], "maxFineEur": 5000000, "maxFinePercent": 3})
        self.assertEqual(sum(name == "sanctions" for name, _ in model.calls), 1, "an act is read once for all its cases")
        self.assertEqual((results["mica-casp-conduct"]["ok"], results["mica-casp-conduct"]["got"]),
                         (True, "{'eur': 5000000.0, 'percent': 5.0}"))
        self.assertTrue(results["mica-white-paper"]["ok"])
        self.assertEqual((results["mica-insider-dealing"]["ok"], results["mica-insider-dealing"]["got"]), (False, "no ceiling"))
        self.assertEqual(results["gdpr-security"]["got"], "the act is not in the corpus")
        self.assertIsNone(LegalDocument.objects.get(id=act.id).current_version.sanctions, "an eval stores no reading")
        # The wrong ceiling on the right articles fails the case
        results, _ = run({"articles": ["59-83"], "maxFineEur": 5000000, "maxFinePercent": 3})
        self.assertFalse(results["mica-casp-conduct"]["ok"])

        # An act that sets one ceiling a kind of person: the case also asks whose ceiling is shown. And a case
        # that asks only for the highest ceiling takes it bound to a kind of breach too
        for slug, external in (("nis2", "32022L2555"), ("kibernetinio-saugumo-istatymas", "TAR-2024-KSI")):
            with fake_models():
                other = ingest_act(admin_client, penalties, title=f"Act {slug}", short_title=slug[:5].upper(), external_id=external)
            LegalDocument.objects.filter(id=other.id).update(slug=slug)
        kinds = lambda articles, **more: [
            {"articles": articles, "persons": ["esminis subjektas"], "maxFineEur": 10000000, "maxFinePercent": 2, **more},
            {"articles": articles, "persons": ["svarbus subjektas"], "maxFineEur": 7000000, "maxFinePercent": 1.4, **more}]
        results, _ = run(*kinds(["21", "23"]), *kinds(["14"], condition="pavojingas pažeidimas"))
        directive, law = results["nis2-one-ceiling-a-kind-of-entity"], results["cybersecurity-law-fines-what-another-article-lists"]
        self.assertEqual((directive["ok"], directive["got"]), (True, "{'eur': 10000000.0, 'percent': 2.0}, only for esminis subjektas"))
        self.assertEqual((law["ok"], law["got"]),
                         (True, "None, graver {'eur': 10000000.0, 'percent': 2.0}, only for esminis subjektas"))
        results, _ = run({"articles": ["21", "23"], "maxFineEur": 10000000, "maxFinePercent": 2},
                         {"articles": ["14"], "maxFineEur": 7000000, "maxFinePercent": 1.4})
        self.assertFalse(results["nis2-one-ceiling-a-kind-of-entity"]["ok"], "the right ceiling, and nothing says whose")
        self.assertFalse(results["cybersecurity-law-fines-what-another-article-lists"]["ok"])

        # A ceiling that must stand alone: the national law's higher one, for what another article of the
        # regulation lists, belongs to that article and may not be shown beside the ceiling for any breach
        with fake_models():
            national = ingest_act(admin_client, penalties, title="Kriptoturto rinkų įstatymas", short_title="KRĮ",
                                  external_id="TAR-2025-KRI")
        LegalDocument.objects.filter(id=national.id).update(slug="kriptoturto-rinku-istatymas")
        any_breach = {"infringedAct": "MiCA", "articles": [], "all": True, "maxFineEur": 5000000, "maxFinePercent": 10}
        listed = {"infringedAct": "MiCA", "condition": "111 straipsnio 1 dalies b ir c punktuose nurodyti pažeidimai",
                  "maxFineEur": 5000000, "maxFinePercent": 12.5}
        results, _ = run(any_breach, {**listed, "articles": ["111"]})
        self.assertTrue(results["national-fine-for-casp-conduct"]["ok"])
        results, _ = run(any_breach, {**listed, "articles": [], "all": True})
        self.assertEqual((results["national-fine-for-casp-conduct"]["ok"], results["national-fine-for-casp-conduct"]["got"]),
                         (False, "{'eur': 5000000.0, 'percent': 10.0}, graver {'eur': 5000000.0, 'percent': 12.5}"))

    def test_the_command_records_a_baseline_and_refuses_a_score_below_it(self):
        with tempfile.TemporaryDirectory() as folder:
            baseline = Path(folder) / "baseline.json"
            out = io.StringIO()
            with fake_models() as model:
                model.checks = self._doubts()
                call_command("eval_prompts", "verify", "--record", "--baseline", str(baseline), stdout=out)
            cases = len(suites.load("verify"))
            self.assertIn(f"verify: {cases} of {cases} with corpus.verify_obligations v1 on ", out.getvalue())
            self.assertIn("(no baseline)", out.getvalue())
            recorded = json.loads(baseline.read_text(encoding="utf-8"))["verify"]
            self.assertEqual((recorded["passed"], recorded["of"], recorded["prompt"]),
                             (cases, cases, "corpus.verify_obligations v1"))

            # The same cases with a judge that doubts nothing: below the baseline
            out = io.StringIO()
            with fake_models():
                with self.assertRaisesMessage(CommandError, "Below the baseline: verify"):
                    call_command("eval_prompts", "verify", "--baseline", str(baseline), stdout=out)
            self.assertIn("MISS verify/fii-23-report-wrong-addressee: expected doubt, got supported", out.getvalue())
            self.assertIn(f"(baseline {cases} of {cases}, corpus.verify_obligations v1)", out.getvalue())
            self.assertEqual(json.loads(baseline.read_text(encoding="utf-8"))["verify"]["passed"], cases,
                             "a run that does not record leaves the baseline alone")
            # A suite with slack fails only below it
            recorded = json.loads(baseline.read_text(encoding="utf-8"))
            recorded["verify"]["slack"] = cases
            baseline.write_text(json.dumps(recorded), encoding="utf-8")
            out = io.StringIO()
            with fake_models():
                call_command("eval_prompts", "verify", "--baseline", str(baseline), stdout=out)
            self.assertIn(f"(baseline {cases} of {cases}, fails below 0, ", out.getvalue())
        with self.assertRaisesMessage(CommandError, "No suite is called nonsense"):
            call_command("eval_prompts", "nonsense")
