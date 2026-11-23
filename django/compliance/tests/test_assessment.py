############################################################
#  [*] Tests — what a report assesses
#
#  Six acts met six ways (the fake model's verdicts,
#  tests/fakes.py): one in force, one that applies from a
#  later date, one whose applicability waits for facts, a
#  directive, one that organises an authority, and one the
#  catalogue screens out. The run assesses the first two —
#  the second as preparation, counted apart — and lists the
#  others unassessed, unless the report's scope names them.
#  The plan closes every open finding, asks for the missing
#  facts, is merged from its drafts when it took several
#  calls, and comes out in the
#  pipeline's order; the summary and the wire say what was
#  assessed and what was not. The two rules behind it — the
#  date an act applies from and what the report does with an
#  act — are pinned on their own.
############################################################


import io
import re
from datetime import date
from types import SimpleNamespace
from unittest import mock


from django.test import SimpleTestCase, TestCase


from compliance.analysis.exports import render_xlsx
from compliance.analysis.models import Action, Finding, Report, ReportAct
from compliance.analysis.pdf import render_html, render_pdf
from compliance.analysis.pipeline import applies_from_of, assessment_of, screened_reasoning
from compliance.corpus.models import LegalDocument, LegalDocumentVersion, Obligation
from compliance.jobs.models import JobStep
from compliance.prompts.models import Prompt
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import FakeModel, fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.test_pipeline import POLICY, drain
from compliance.tests.utils import create_admin, create_user, post_json, signed_in


# (short title, title, CELEX number, type, the institution
# types its catalogue row names)
ACTS = (
    ("MiCA", "Markets in crypto-assets", "32023R1114", "regulation", ("casp",)),
    ("AMLR", "Anti-money laundering regulation", "32024R1624", "regulation", ("casp",)),
    ("AI Act", "Artificial intelligence act", "32024R1689", "regulation", ("casp",)),
    ("AMLD6", "Anti-money laundering directive", "32024L1640", "directive", ("casp",)),
    ("LBĮ", "Law on the central bank", "", "law", ("casp",)),
    ("CRR", "Capital requirements regulation", "32013R0575", "regulation", ("bank",)),
)

# What the fake model answers for the acts that are not simply
# in force: one applies later, one hangs on a fact the profile
# does not state, one organises an authority
QUESTION = "Ar įmonė naudoja DI sistemas klientams vertinti?"
VERDICTS = {
    "AMLR": {"appliesFrom": "2099-07-10"},
    "AI Act": {"applicability": "uncertain", "confidence": 0.4, "conditionsToVerify": QUESTION},
    "LBĮ": {"effect": "institutional"},
}








############################################################
# plan_in_two
############################################################
#
# A planning answer that tests the pipeline's part of the
# plan. For the open findings: the preparation for the later
# act first, then today's gaps with one of them left out,
# then an action naming a finding that does not exist. Any
# other call is answered as the fake model does.
#
# Used by:
#   - AssessmentTests.test_the_plan_closes_every_open_finding_today_before_preparation
############################################################

def plan_in_two(model, prompt):
    if "OPEN FINDINGS" not in prompt:
        return FakeModel._action_plan(model, prompt)
    rows = re.findall(r"- \[(F\d+)\] \S+ / \S+( / applies from \S+)? — ", prompt)
    later = [ref for ref, upcoming in rows if upcoming]
    today = [ref for ref, upcoming in rows if not upcoming]

    def action(title, refs, timeframe):
        return {"title": title, "description": "-", "effort": "medium", "timeframe": timeframe,
                "ownerRole": "Valdyba", "category": "licensing", "findingRefs": refs}

    return {"actions": [action("Pasirengti AMLR", later, "12_months"), action("Gauti leidimą", today[1:], "immediate"),
                        action("Veiksmas be radinio", ["F999"], "immediate")]}








class AssessmentTests(TestCase):

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
        with fake_models():
            self.acts = {short: ingest_act(self.admin_client, EU_EN, title=title, short_title=short, external_id=celex,
                                           doc_type=kind, applies_to=applies_to)
                         for short, title, celex, kind, applies_to in ACTS}

    def _run(self, plan=None, scopes=None, **extra):
        with fake_models() as model:
            model.verdicts = VERDICTS
            if scopes is not None:
                model.scopes = scopes
            if plan:
                # The model's answers are looked up on the instance
                model._action_plan = lambda prompt: plan(model, prompt)
            started = post_json(self.client_user, "/api/reports",
                                {"companyId": self.company["id"], "language": "lt", **extra})
            self.assertEqual(started.status_code, 201, started.content)
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        return report, model

    def test_the_run_assesses_what_binds_the_company_and_lists_the_rest(self):
        report, model = self._run()
        acts = {act.short_title: act for act in ReportAct.objects.filter(report=report)}
        self.assertEqual({short: (act.applicability, act.assessment, act.applies_from) for short, act in acts.items()}, {
            "MiCA": ("applies", "assessed", None),
            "AMLR": ("applies", "upcoming", date(2099, 7, 10)),
            "AI Act": ("uncertain", "unconfirmed", None),
            "AMLD6": ("applies", "indirect", None),
            "LBĮ": ("applies", "indirect", None),
            "CRR": ("not_applies", "none", None)})
        self.assertTrue(acts["CRR"].screened_out)
        self.assertEqual(acts["AI Act"].conditions_to_verify, QUESTION)

        # Only the two are read for obligations and judged
        self.assertEqual(set(Finding.objects.filter(report=report).values_list("short_title", flat=True)),
                         {"MiCA", "AMLR"})
        self.assertEqual(set(Obligation.objects.values_list("document__short_title", flat=True)), {"MiCA", "AMLR"},
                         "an act left unassessed is not extracted either")
        steps = {step.name: step for step in JobStep.objects.filter(job=report.job)}
        self.assertEqual(steps["obligations"].input_ref, {"acts": 2})
        self.assertEqual(steps["applicability"].output,
                         {"applies": 4, "scopesRead": 1, "standards": 0, "uncertain": 1, "notApplies": 1,
                          "assessed": 1, "upcoming": 1, "unconfirmed": 1, "indirect": 2})

        # The calls that judge the later act say what it is
        calls = [prompt for name, prompt in model.calls if name == "findings"]
        later = [prompt for prompt in calls if "ACT: Anti-money laundering regulation" in prompt]
        self.assertTrue(later)
        for prompt in calls:
            self.assertEqual("It applies from 2099-07-10: assess the company's readiness for it." in prompt,
                             prompt in later)

        # The summary is told what was assessed and what was not
        summary = next(prompt for name, prompt in model.calls if name == "summary")
        self.assertIn("ACTS ASSESSED (in force for the company)\n- MiCA: ", summary)
        # …with the counts act by act, so it can say where the documents are strong
        counts = summary[summary.index("FINDING COUNTS (acts in force)"):summary.index("MOST SEVERE OPEN FINDINGS")]
        self.assertRegex(counts, r"\n- MiCA: met: \d+, partially met: \d+, not met: \d+, not evidenced: \d+, "
                                 r"not applicable: \d+")
        self.assertNotIn("- AMLR", counts)
        self.assertIn("\n- AMLR: applies from 2099-07-10", summary[summary.index("UPCOMING ACTS"):])
        self.assertIn(f"\n- AI Act: {QUESTION}", summary[summary.index("ACTS TO CONFIRM (NOT assessed"):])
        directives = summary[summary.index("DIRECTIVES (NOT assessed"):summary.index("INSTITUTIONAL ACTS (NOT assessed")]
        self.assertIn("\n- AMLD6", directives)
        self.assertNotIn("LBĮ", directives)
        self.assertIn("\n- LBĮ", summary[summary.index("INSTITUTIONAL ACTS (NOT assessed"):summary.index("ACTION PLAN")])
        self.assertNotIn("CRR", summary)

    def test_an_act_is_left_out_only_when_its_own_scope_agrees_with_the_catalogue(self):
        # The catalogue lists CRR for banks; the model reads its scope the same way
        report, model = self._run(scopes={"CRR": ["bank"]})
        crr = ReportAct.objects.get(report=report, short_title="CRR")
        self.assertTrue(crr.screened_out)
        self.assertEqual(crr.reasoning, "Atmestas pagal katalogą: aktas skirtas bankams, o įmonė įrašyta kaip kriptoturto "
                                        "paslaugų teikėjas. Akto taikymo srities nuostatos perskaitytos — jos įmonės "
                                        "rūšies taip pat neapima.")
        scope_calls = [prompt for name, prompt in model.calls if name == "scope"]
        self.assertEqual(len(scope_calls), 1)
        self.assertIn('short="CRR"', scope_calls[0])
        self.assertNotIn('short="MiCA"', scope_calls[0], "an act the catalogue lets in is not read")
        reading = LegalDocumentVersion.objects.get(document_id=self.acts["CRR"].id).scope
        self.assertEqual((reading["types"], reading["model"]), (["bank"], "gateway:fake-model"))

        # The reading is kept on the version: the next report asks nothing
        _, again = self._run()
        self.assertEqual([name for name, _ in again.calls if name == "scope"], [])

    def test_a_scope_reading_that_names_no_kind_is_not_called_an_agreement(self):
        # The provisions shown do not say whom the act covers: the model returns no kind, as it is told to
        report, model = self._run(scopes={"CRR": []})
        crr = ReportAct.objects.get(report=report, short_title="CRR")
        self.assertTrue(crr.screened_out, "the catalogue still leaves it out")
        self.assertEqual(crr.reasoning, "Atmestas pagal katalogą: aktas skirtas bankams, o įmonė įrašyta kaip kriptoturto "
                                        "paslaugų teikėjas. Akto taikymo srities nuostatos perskaitytos — jos nenurodo, "
                                        "kam aktas taikomas.")
        self.assertNotIn("taip pat neapima", crr.reasoning)
        english = screened_reasoning(LegalDocument.objects.get(id=self.acts["CRR"].id), "casp", "en")
        self.assertTrue(english.endswith("The act's scope provisions were read and do not say whom it covers."), english)

    def test_an_act_whose_own_scope_covers_the_company_is_judged_whatever_its_list_says(self):
        # The list says banks; the act's text names crypto-asset service providers too
        with fake_models() as model:
            model.verdicts, model.scopes = VERDICTS, {"CRR": ["bank", "casp"]}
            started = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt"})
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        crr = ReportAct.objects.get(report=report, short_title="CRR")
        self.assertEqual((crr.applicability, crr.assessment, crr.screened_out), ("applies", "assessed", False))
        verdict_call = next(prompt for name, prompt in model.calls if name == "applicability" and 'short="CRR"' in prompt)
        self.assertIn("typically applies to bank; ", verdict_call)
        self.assertIn("its scope provisions were read as covering bank, casp", verdict_call)
        self.assertTrue(Finding.objects.filter(report=report, short_title="CRR").exists())

        # The estimate counts the act from then on
        estimate = self.client_user.get(f"/api/reports/estimate?companyId={self.company['id']}").json()
        self.assertEqual(estimate["acts"], 6)

    def test_without_the_scope_prompt_the_catalogue_decides_alone(self):
        Prompt.objects.filter(slug="corpus.scope").delete()
        report, model = self._run()
        crr = ReportAct.objects.get(report=report, short_title="CRR")
        self.assertTrue(crr.screened_out)
        self.assertNotIn("perskaitytos", crr.reasoning)
        self.assertEqual([name for name, _ in model.calls if name == "scope"], [])
        self.assertIsNone(LegalDocumentVersion.objects.get(document_id=self.acts["CRR"].id).scope)

    def test_the_findings_of_a_later_act_are_counted_apart_and_say_their_date(self):
        report, _ = self._run()
        current = Finding.objects.filter(report=report, short_title="MiCA")
        later = Finding.objects.filter(report=report, short_title="AMLR")
        stats = report.stats
        self.assertEqual(stats["acts"], {"applies": 4, "uncertain": 1, "not_applies": 1,
                                         "assessed": 1, "upcoming": 1, "unconfirmed": 1, "indirect": 2})
        for counts, rows in ((stats, current), (stats["upcoming"], later)):
            self.assertTrue(rows)
            self.assertEqual({status: n for status, n in counts["findings"].items() if n},
                             {status: rows.filter(status=status).count() for status in set(rows.values_list("status", flat=True))})
            self.assertEqual(sum(counts["openBySeverity"].values()), rows.filter(status__in=("missing", "partial")).count())

        full = self.client_user.get(f"/api/reports/{report.id}").json()
        self.assertEqual({act["shortTitle"]: (act["assessment"], act["appliesFrom"]) for act in full["acts"]},
                         {"MiCA": ("assessed", None), "AMLR": ("upcoming", "2099-07-10"),
                          "AI Act": ("unconfirmed", None), "AMLD6": ("indirect", None), "LBĮ": ("indirect", None),
                          "CRR": ("none", None)})
        self.assertEqual({(finding["shortTitle"], finding["appliesFrom"]) for finding in full["findings"]},
                         {("MiCA", None), ("AMLR", "2099-07-10")})

        # A review of a later act's finding recounts that part only,
        # and its answer keeps the date
        target = later.filter(status="missing").first()
        answer = self.client_user.patch(f"/api/reports/{report.id}/findings/{target.id}",
                                        data={"overrideStatus": "met"}, content_type="application/json")
        self.assertEqual((answer.json()["effectiveStatus"], answer.json()["appliesFrom"]), ("met", "2099-07-10"))
        after = Report.objects.get(id=report.id).stats
        self.assertEqual(after["findings"], stats["findings"])
        self.assertEqual(after["upcoming"]["findings"]["missing"], stats["upcoming"]["findings"]["missing"] - 1)
        self.assertEqual(after["upcoming"]["findings"]["met"], stats["upcoming"]["findings"]["met"] + 1)
        listed = next(row for row in self.client_user.get("/api/reports").json()["reports"] if row["id"] == report.id)
        self.assertEqual(listed["stats"]["upcoming"], after["upcoming"])

    def test_the_plan_closes_every_open_finding_today_before_preparation(self):
        report, model = self._run(plan=plan_in_two)
        open_findings = Finding.objects.filter(report=report, status__in=("missing", "partial", "unknown"))
        later = set(open_findings.filter(short_title="AMLR").values_list("id", flat=True))
        today = set(open_findings.filter(short_title="MiCA").values_list("id", flat=True))
        self.assertTrue(len(later) > 0 and len(today) > 1)

        # Three calls: the findings, the wrong references, the acts
        # that wait for facts
        plans = [prompt for name, prompt in model.calls if name == "action_plan"]
        self.assertEqual([next(mark for mark in ("OPEN FINDINGS", "CITATION PROBLEMS", "ACTS TO CONFIRM") if mark in plan)
                          for plan in plans], ["OPEN FINDINGS", "CITATION PROBLEMS", "ACTS TO CONFIRM"])
        self.assertIn("THEME: licensing", plans[0])
        self.assertIn(f"- AI Act: Įmonė teikia kriptoturto paslaugas. Questions: {QUESTION}", plans[2])

        # Today's gaps, the facts to find out, the references to
        # correct, then the preparation — whatever order the model
        # answered in
        actions = list(Action.objects.filter(report=report).order_by("order"))
        self.assertEqual([(action.priority, action.title) for action in actions],
                         [(1, "Gauti leidimą"), (2, "Išsiaiškinti, ar aktai taikomi"),
                          (3, "Pataisyti nuorodas į teisės aktus"), (4, "Pasirengti AMLR")])
        # The finding the model left out joined the action of its
        # own act; the action that closed nothing is gone
        self.assertEqual(set(actions[0].finding_ids), today)
        self.assertEqual(set(actions[3].finding_ids), later)
        self.assertEqual((actions[1].finding_ids, actions[2].finding_ids), ([], []))
        closed = [finding_id for action in actions for finding_id in action.finding_ids]
        self.assertEqual(sorted(closed), sorted(today | later), "every open finding, each by one action")
        step = JobStep.objects.get(job=report.job, name="action_plan")
        self.assertEqual(step.input_ref, {"openFindings": len(closed), "citationProblems": 2, "actsToConfirm": 1,
                                          "calls": 3})
        self.assertEqual(step.output, {"actions": 4, "drafted": 4, "calls": 3, "planned": len(closed), "repaired": 1,
                                       "unplanned": 0})

    def test_a_plan_drafted_in_several_calls_is_merged_and_no_finding_loses_its_action(self):
        merges = []

        def merge(model, prompt):
            # The two drafts of the findings become one action; the
            # answer also names a draft that does not exist
            merges.append(prompt)
            return {"actions": [{"title": "Sutvarkyti leidimus", "description": "-", "effort": "high", "timeframe": "30_days",
                                 "ownerRole": "Valdyba", "category": "licensing", "draftRefs": ["A1", "A2", "A9"]}]}

        with mock.patch("compliance.analysis.pipeline.PLAN_FINDINGS_PER_CALL", 2):
            with fake_models() as model:
                model.verdicts = VERDICTS
                model._plan_merge = lambda prompt: merge(model, prompt)
                started = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt"})
                drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        open_ids = set(Finding.objects.filter(report=report, status__in=("missing", "partial", "unknown"))
                       .values_list("id", flat=True))
        self.assertEqual(len(open_ids), 4)
        # Only the drafts that close findings are offered for merging
        self.assertEqual(len(merges), 1)
        self.assertEqual(re.findall(r"- \[(A\d+)\] ", merges[0]), ["A1", "A2"])
        self.assertIn("closes 2 findings — Parengti leidimo paraišką", merges[0])
        actions = list(Action.objects.filter(report=report).order_by("order"))
        self.assertEqual([action.title for action in actions],
                         ["Sutvarkyti leidimus", "Išsiaiškinti, ar aktai taikomi", "Pataisyti nuorodas į teisės aktus"])
        self.assertEqual(set(actions[0].finding_ids), open_ids, "the merged action closes what its drafts closed")
        self.assertEqual((actions[0].timeframe, actions[0].owner_role), ("30_days", "Valdyba"))
        step = JobStep.objects.get(job=report.job, name="action_plan")
        self.assertEqual(step.output, {"actions": 3, "drafted": 4, "calls": 5, "planned": 4, "repaired": 0, "unplanned": 0})

        # A merge that names no draft leaves every draft the action it was
        with mock.patch("compliance.analysis.pipeline.PLAN_FINDINGS_PER_CALL", 2):
            kept, _ = self._run()
        self.assertEqual(Action.objects.filter(report=kept).count(), 4)
        closed = [i for action in Action.objects.filter(report=kept) for i in action.finding_ids]
        self.assertEqual(len(closed), len(set(closed)))
        self.assertEqual(len(closed), 4)

    def test_the_exports_keep_preparation_apart_and_say_what_was_not_assessed(self):
        from openpyxl import load_workbook
        report, _ = self._run()
        open_today = Finding.objects.filter(report=report, short_title="MiCA", status__in=("missing", "partial")).count()
        html = render_html(report)

        # At a glance: the result is today's; the later act has a
        # table of its own, and the act that waits is counted
        glance = html[html.index('<section id="glance">'):html.index('<section id="summary">')]
        self.assertIn(f'<div class="kpi lead"><div class="v">{open_today}</div>', glance)
        today, later = glance.split("Vėliau taikomi aktai — pasirengimas")
        self.assertIn('<td class="serif">MiCA</td>', today)
        self.assertNotIn("AMLR", today)
        self.assertIn('<td class="serif">AMLR <span class="muted small">taikomas nuo 2099-07-10</span></td>', later)
        self.assertIn("Teisės aktų, kurie nevertinti, nes jų taikymą dar reikia patvirtinti: 1", later)

        # The acts, by what the report did with them: numbered
        # sub-headings of the section
        acts = html[html.index('<section id="acts">'):html.index('<section id="findings">')]
        places = [acts.index(heading) for heading in (
            '<span class="no">5.1</span> Taikomi — įvertinti</h3>', "Markets in crypto-assets",
            '<span class="no">5.2</span> Taikomi vėliau — įvertintas pasirengimas</h3>',
            '<span class="no">5.3</span> Taikymą reikia patvirtinti — nevertinti</h3>',
            '<span class="no">5.4</span> Direktyvos — taikomos per nacionalinę teisę</h3>',
            '<span class="no">5.5</span> Institucijų veiklą ir procedūras nustatantys aktai — atskirai nevertinti</h3>',
            '<span class="no">5.6</span> Atmesti teisės aktai (netaikomi pagal katalogą)</h3>')]
        self.assertEqual(places, sorted(places))
        self.assertIn('<span class="muted small">taikomas nuo 2099-07-10</span>', acts)
        self.assertIn(f'<span class="k">Atsakytini klausimai:</span> {QUESTION}', acts)

        # The findings: the later act last, named with its date; an
        # act that was not assessed has none
        findings = html[html.index('<section id="findings">'):html.index('<section id="citations">')]
        self.assertLess(findings.index('<span class="no">6.1</span> MiCA</h3>'),
                        findings.index('<div class="act"><h3>Vėliau taikomi aktai — pasirengimas</h3>'))
        self.assertIn('<h3 id="findings-2" data-sub=" · AMLR"><span class="no">6.2</span> AMLR '
                      '<span class="muted small">— taikomas nuo 2099-07-10</span></h3>', findings)
        self.assertNotIn("AI Act", findings)

        # The contents list the sub-headings of the acts and of the
        # findings, the later act with its date
        contents = html[html.index('<ol class="toc">'):html.index('<section id="glance">')]
        self.assertIn('<a href="#acts-3"><span class="no">5.3</span> Taikymą reikia patvirtinti — nevertinti</a>', contents)
        self.assertIn('<a href="#findings-1"><span class="no">6.1</span> MiCA</a>', contents)
        self.assertIn('<a href="#findings-2"><span class="no">6.2</span> AMLR <span class="muted">— taikomas nuo 2099-07-10</span></a>', contents)
        self.assertTrue(render_pdf(report).startswith(b"%PDF"))

        book = load_workbook(io.BytesIO(render_xlsx(report)))
        overview = {row[0].value: row[1].value for row in book[book.sheetnames[0]].iter_rows()}
        self.assertEqual(overview["Neatitinka"], report.stats["findings"]["missing"])
        self.assertEqual(overview["Vėliau taikomi aktai (pasirengimas): neatitinka"],
                         report.stats["upcoming"]["findings"]["missing"])
        sheet = book[book.sheetnames[2]]
        self.assertEqual([cell.value for cell in sheet[1]][6:], ["Ataskaitoje", "Taikomas nuo", "Ką patvirtinti"])
        rows = {row[0].value: [cell.value for cell in row][6:] for row in sheet.iter_rows(min_row=2)}
        self.assertEqual(rows, {"MiCA": ["Įvertintas", None, None],
                                "AMLR": ["Įvertintas pasirengimas", "2099-07-10", None],
                                "AI Act": ["Nevertintas — taikymą reikia patvirtinti", None, QUESTION],
                                "AMLD6": ["Nevertintas — taikomas per nacionalinę teisę", None, None],
                                "LBĮ": ["Nevertintas — nustato institucijos veiklą ar procedūras", None, None],
                                "CRR": ["Nevertintas — netaikomas", None, None]})
        sheet = book[book.sheetnames[3]]
        self.assertEqual(sheet["N1"].value, "Taikomas nuo")
        self.assertEqual({(row[1].value, row[13].value) for row in sheet.iter_rows(min_row=2)},
                         {("MiCA", None), ("AMLR", "2099-07-10")})

    def test_an_act_the_reports_scope_names_is_assessed_whatever_the_doubt(self):
        report, _ = self._run(documentIds=[self.acts["AI Act"].id, self.acts["AMLD6"].id])
        self.assertEqual({act.short_title: (act.applicability, act.assessment)
                          for act in ReportAct.objects.filter(report=report)},
                         {"AI Act": ("uncertain", "assessed"), "AMLD6": ("applies", "assessed")})
        self.assertEqual(set(Finding.objects.filter(report=report).values_list("short_title", flat=True)),
                         {"AI Act", "AMLD6"})
        self.assertNotIn("upcoming", report.stats)








class AssessmentRuleTests(SimpleTestCase):

    def test_an_act_applies_from_a_date_only_while_that_date_is_ahead(self):
        pc = SimpleNamespace(today=date(2026, 11, 10))
        self.assertEqual(applies_from_of(pc, {"appliesFrom": "2027-07-10"}), date(2027, 7, 10))
        self.assertEqual(applies_from_of(pc, {"appliesFrom": " 2027-07-10T00:00:00Z"}), date(2027, 7, 10))
        for given in ("2026-11-10", "2025-01-17", "", "soon", None):
            self.assertIsNone(applies_from_of(pc, {"appliesFrom": given}), given)
        self.assertIsNone(applies_from_of(pc, {}))

    def test_what_the_report_does_with_an_act(self):
        pc = SimpleNamespace(scope_ids={"named"})
        regulation = SimpleNamespace(id="r", doc_type="regulation")
        directive = SimpleNamespace(id="d", doc_type="directive")
        named = SimpleNamespace(id="named", doc_type="directive")
        later = date(2027, 7, 10)
        for act, applicability, applies_from, expected in (
                (regulation, "applies", None, "assessed"),
                (regulation, "applies", later, "upcoming"),
                (regulation, "uncertain", None, "unconfirmed"),
                (regulation, "uncertain", later, "unconfirmed"),
                (regulation, "not_applies", None, "none"),
                (directive, "applies", None, "indirect"),
                (directive, "applies", later, "indirect"),
                (directive, "uncertain", None, "unconfirmed"),
                # Named in the report's scope: assessed all the same —
                # but never an act judged not to apply
                (named, "uncertain", None, "assessed"),
                (named, "applies", later, "upcoming"),
                (named, "not_applies", None, "none")):
            self.assertEqual(assessment_of(pc, act, applicability, applies_from), expected,
                             (act.id, applicability, applies_from))
        # An act that organises an authority stands behind its
        # decisions, like a directive behind its law
        for act, applicability, expected in ((regulation, "applies", "indirect"), (regulation, "uncertain", "unconfirmed"),
                                             (regulation, "not_applies", "none"), (named, "applies", "assessed")):
            self.assertEqual(assessment_of(pc, act, applicability, None, institutional=True), expected, (act.id, applicability))
