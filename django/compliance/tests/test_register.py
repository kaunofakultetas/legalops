############################################################
#  [*] Tests — a company's action register
#
#  The register moves on one event: a person signing a
#  finished report off. The report's plan comes in — each
#  action with the open findings it is to close, an owner and
#  a due date — and nothing comes in twice. A later signed-off
#  report is the re-test: an obligation it finds met is
#  confirmed, an action whose obligations are all confirmed
#  is closed by it, an obligation it did not assess confirms
#  nothing, and an action called done whose obligation is
#  still open goes back to work. A withdrawn sign-off takes
#  its confirmations back. The reports speak in the order
#  they were made, whatever order they were signed in, and a
#  closure falls only with the evidence under it. A person
#  owns, dates and moves an action and may close one by hand
#  only with a reason. A
#  finding shows how its obligation stood before, and a
#  report says what moved since the last one. When an act
#  gets a new version, the company sees which provisions
#  changed and which of its findings rest on them.
############################################################


import io
from datetime import timedelta

from django.test import TestCase
from openpyxl import load_workbook

from compliance.analysis.models import Action, CompanyAction, Finding, Report
from compliance.analysis.pdf import render_html
from compliance.analysis.register import changes
from compliance.audit.models import AuditLog
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument, Obligation
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.test_pipeline import POLICY, drain
from compliance.tests.utils import create_admin, create_user, patch_json, post_json, signed_in








class RegisterTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kriptė", "institutionType": "casp", "usesAi": False}).json()
        upload = io.BytesIO(POLICY.encode())
        upload.name = "politika.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        self.register = f"/api/companies/{self.company['id']}/actions"

    def _report(self):
        with fake_models():
            started = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt"})
            self.assertEqual(started.status_code, 201, started.content)
            drain()
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        return report

    def _sign(self, report, approved=True):
        answer = patch_json(self.client_user, f"/api/reports/{report.id}", {"approved": approved})
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer.json()["register"]

    def test_a_sign_off_brings_the_plan_in_once(self):
        report = self._report()
        self.assertEqual(self.client_user.get(self.register).json()["actions"], [], "an unsigned report moves nothing")
        planned = list(Action.objects.filter(report=report).order_by("order"))
        open_ids = {f.id for f in Finding.objects.filter(report=report) if f.status in ("missing", "partial", "unknown")}
        expected = [action for action in planned if open_ids & set(action.finding_ids) or not action.finding_ids]
        moved = self._sign(report)
        self.assertEqual((moved["added"], moved["confirmed"], moved["closed"]), (len(expected), 0, 0))
        self.assertGreater(moved["added"], 0)

        listed = self.client_user.get(self.register).json()
        self.assertEqual((len(listed["actions"]), listed["counts"]["open"], listed["counts"]["late"]), (len(expected), len(expected), 0))
        first = next(row for row in listed["actions"] if row["title"] == expected[0].title)
        self.assertEqual((first["status"], first["state"], first["owner"], first["reportId"], first["closedHow"]),
                         ("open", "open", "Valdyba", report.id, None))
        self.assertEqual(first["reportDate"], report.created_at.date().isoformat())
        # "immediate" in the plan is a fortnight from the sign-off
        self.assertEqual(first["dueDate"], (utc_now() + timedelta(days=14)).date().isoformat())
        item = first["items"][0]
        finding = Finding.objects.get(id=item["findingId"])
        self.assertEqual((item["obligationId"], item["title"], item["act"], item["status"], item["confirmed"]),
                         (finding.obligation_id, finding.obligation_title, "MiCA", finding.status, None))
        self.assertTrue(all(i["status"] in ("missing", "partial", "unknown") for row in listed["actions"] for i in row["items"]),
                        "what is met needs no action")
        # An action that closes no finding (the documents' wrong references) comes in too, for a person to close
        bare = [row for row in listed["actions"] if not row["items"]]
        self.assertEqual([row["title"] for row in bare], [a.title for a in planned if not a.finding_ids])
        self.assertEqual({row["byHandOnly"] for row in listed["actions"]}, {True, False})
        self.assertTrue(all(row["byHandOnly"] == (not row["items"]) for row in listed["actions"]))
        self.assertTrue(AuditLog.objects.filter(action="reports.approve", target_id=report.id,
                                                details__register__added=moved["added"]).exists())

        # Signed again after a withdrawal, the plan brings nothing twice
        self.assertEqual(self._sign(report, approved=False), {"withdrawn": 0})
        again = self._sign(report)
        self.assertEqual((again["added"], CompanyAction.objects.count()), (0, len(expected)))

        # The next report's plan covers the same obligations: none gets a second action
        second = self._report()
        moved = self._sign(second)
        self.assertEqual(moved["added"], 0)
        self.assertGreater(moved["covered"], 0)
        self.assertEqual(CompanyAction.objects.count(), len(expected))

    def test_a_later_signed_report_is_the_re_test(self):
        first = self._report()
        self._sign(first)
        action = CompanyAction.objects.filter(company_id=self.company["id"]).exclude(items=[]) \
            .order_by("priority", "created_at").first()
        obligations = [item["obligationId"] for item in action.items]
        self.assertGreaterEqual(len(obligations), 2)
        path = f"/api/actions/{action.id}"
        self.assertEqual(patch_json(self.client_user, path, {"status": "done"}).json()["state"], "done")

        # The second report still finds the action's first obligation open: called done, back to work
        second = self._report()
        moved = self._sign(second)
        action.refresh_from_db()
        self.assertEqual((moved["closed"], moved["reopened"], action.status), (0, 1, "in_progress"))

        # A third report finds every obligation of the action met but one it did not assess: nothing closes
        third = self._report()
        Finding.objects.filter(report=third, obligation_id__in=obligations).update(status="met")
        Finding.objects.filter(report=third, obligation_id=obligations[-1]).delete()
        moved = self._sign(third)
        action.refresh_from_db()
        self.assertEqual((moved["closed"], action.status), (0, "in_progress"))
        self.assertEqual([bool(item["confirmed"]) for item in action.items], [True] * (len(obligations) - 1) + [False],
                         "an obligation the report did not assess confirms nothing")
        self.assertEqual(moved["confirmed"], len(obligations) - 1)

        # A fourth finds them all met: the action is closed by that report
        fourth = self._report()
        Finding.objects.filter(report=fourth, obligation_id__in=obligations).update(status="met")
        moved = self._sign(fourth)
        action.refresh_from_db()
        self.assertEqual((moved["closed"], action.status, action.confirmed_report_id, action.closed_from, action.closed_by_id),
                         (1, "closed", fourth.id, "in_progress", None))
        row = next(r for r in self.client_user.get(self.register).json()["actions"] if r["id"] == action.id)
        self.assertEqual((row["state"], row["closedHow"], row["confirmedReportId"]), ("closed", "confirmed", fourth.id))

        # Its sign-off withdrawn — by hand, or by a reviewer changing a finding — the closure goes back
        self.assertEqual(self._sign(fourth, approved=False), {"withdrawn": 1})
        action.refresh_from_db()
        self.assertEqual((action.status, action.confirmed_report_id, action.closed_at), ("in_progress", None, None))
        self.assertEqual([bool(item["confirmed"]) for item in action.items], [True] * (len(obligations) - 1) + [False],
                         "the third report's confirmations stand")
        self._sign(fourth)
        finding = Finding.objects.filter(report=fourth, obligation_id=obligations[0]).first()
        patch_json(self.client_user, f"/api/reports/{fourth.id}/findings/{finding.id}", {"overrideStatus": "missing"})
        action.refresh_from_db()
        self.assertEqual((action.status, Report.objects.get(id=fourth.id).approved_at), ("in_progress", None))

    def test_the_reports_speak_in_the_order_they_were_made(self):
        first = self._report()
        self._sign(first)
        action = CompanyAction.objects.filter(company_id=self.company["id"]).exclude(items=[]) \
            .order_by("priority", "created_at").first()
        obligations = [item["obligationId"] for item in action.items]
        self.assertGreaterEqual(len(obligations), 2)
        path = f"/api/actions/{action.id}"

        # The owner calls it done after the second report was made. Signed later, that report still finds an
        # obligation open — and sends nothing back: it never saw the finished work
        second = self._report()
        self.assertEqual(patch_json(self.client_user, path, {"status": "done"}).json()["status"], "done")
        moved = self._sign(second)
        action.refresh_from_db()
        self.assertEqual((moved["reopened"], action.status), (0, "done"))

        # Two more reports: the third finds all but the last obligation met, the fourth all of them.
        # The newer one is signed first and closes the action
        third, fourth = self._report(), self._report()
        Finding.objects.filter(report=third, obligation_id__in=obligations[:-1]).update(status="met")
        Finding.objects.filter(report=fourth, obligation_id__in=obligations).update(status="met")
        moved = self._sign(fourth)
        action.refresh_from_db()
        self.assertEqual((moved["closed"], action.status, action.confirmed_report_id), (1, "closed", fourth.id))
        actions = CompanyAction.objects.count()

        # The older third, signed after it, still finds the last obligation open: it overrules nothing,
        # and its plan brings no action for what the newer report finds met
        moved = self._sign(third)
        action.refresh_from_db()
        self.assertEqual((moved["added"], moved["closed"], moved["reopened"], action.status, action.confirmed_report_id),
                         (0, 0, 0, "closed", fourth.id))
        self.assertEqual(CompanyAction.objects.count(), actions)

        # What a report closed is not reopened by hand
        refused = patch_json(self.client_user, path, {"status": "open"})
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "CLOSED_BY_REPORT"))

        # The closing report's sign-off withdrawn: the third's confirmations stand, and the last obligation,
        # which the third — made after the action was called done — finds open, sends it back to work
        self.assertEqual(self._sign(fourth, approved=False), {"withdrawn": 1})
        action.refresh_from_db()
        self.assertEqual((action.status, action.confirmed_report_id), ("in_progress", None))
        self.assertEqual([(item["confirmed"] or {}).get("reportId") for item in action.items],
                         [third.id] * (len(obligations) - 1) + [None])

        # Signed again, the fourth closes it again. The third deleted: the fourth found the same, the closure stands
        self._sign(fourth)
        self.assertEqual(self.client_user.delete(f"/api/reports/{third.id}").status_code, 200)
        action.refresh_from_db()
        self.assertEqual((action.status, {item["confirmed"]["reportId"] for item in action.items}), ("closed", {fourth.id}))
        # The fourth deleted too: the evidence under the closure is gone, and so is the closure
        self.assertEqual(self.client_user.delete(f"/api/reports/{fourth.id}").status_code, 200)
        action.refresh_from_db()
        self.assertEqual((action.status, action.confirmed_report_id, [item["confirmed"] for item in action.items]),
                         ("in_progress", None, [None] * len(obligations)))

        # An obligation nobody approved is replaced when its act is read again: no later report carries it,
        # and the register says only a person can close the action
        Obligation.objects.filter(id=obligations[-1]).delete()
        row = next(r for r in self.client_user.get(self.register).json()["actions"] if r["id"] == action.id)
        self.assertEqual(([item["obligationId"] for item in row["items"]], row["byHandOnly"]),
                         (obligations[:-1] + [None], True))

    def test_a_person_owns_dates_moves_and_closes_an_action(self):
        self._sign(self._report())
        action = CompanyAction.objects.filter(company_id=self.company["id"]).exclude(items=[]).first()
        path = f"/api/actions/{action.id}"
        answer = patch_json(self.client_user, path, {"owner": "  Atitikties pareigūnas ", "dueDate": "2020-01-31",
                                                     "status": "in_progress"})
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual((answer.json()["owner"], answer.json()["dueDate"], answer.json()["status"], answer.json()["state"]),
                         ("Atitikties pareigūnas", "2020-01-31", "in_progress", "late"))
        self.assertEqual(self.client_user.get(self.register).json()["counts"]["late"], 1)
        self.assertEqual(self.client_user.get(self.register).json()["actions"][0]["id"], action.id, "the late come first")

        for body in ({"dueDate": "soon"}, {"status": "finished"}, {"owner": 5}, {"note": 5}):
            self.assertEqual(patch_json(self.client_user, path, body).json()["code"], "INVALID_FIELD", body)
        # Closed by hand only with the reason
        self.assertEqual(patch_json(self.client_user, path, {"status": "closed"}).json()["code"], "NOTE_REQUIRED")
        closed = patch_json(self.client_user, path, {"status": "closed", "note": "Paslauga nebeteikiama nuo 2026-10-01."})
        self.assertEqual((closed.json()["state"], closed.json()["closedHow"], closed.json()["closedByName"]),
                         ("closed", "manual", "Tomas"))
        reopened = patch_json(self.client_user, path, {"status": "open"})
        self.assertEqual((reopened.json()["state"], reopened.json()["closedAt"], reopened.json()["closedHow"]),
                         ("late", None, None))
        self.assertTrue(AuditLog.objects.filter(action="actions.update", target_id=action.id, details__status="closed").exists())
        stranger = signed_in(create_user("kitas@knf.vu.lt"))
        self.assertEqual(patch_json(stranger, path, {"owner": "x"}).status_code, 404)
        self.assertEqual(stranger.get(self.register).status_code, 404)

        # The register as a workbook
        exported = self.client_user.get(self.register + "/export")
        self.assertEqual(exported.status_code, 200, exported.content[:200])
        self.assertIn('filename="actions-UAB-Kripte-', exported["Content-Disposition"])
        sheet = load_workbook(io.BytesIO(exported.content)).active
        self.assertEqual([cell.value for cell in sheet[1]][:6], ["#", "Veiksmų planas", "Šalinamos išvados", "Atsakingas",
                                                                 "Terminas", "Būsena"])
        row = [cell.value for cell in sheet[2]]
        self.assertEqual((row[3], row[4], row[5]), ("Atitikties pareigūnas", "2020-01-31", "Vėluojantis"))
        self.assertIn("(MiCA ", row[2])

    def test_a_finding_shows_how_its_obligation_stood_and_a_report_what_moved(self):
        first = self._report()
        served = self.client_user.get(f"/api/reports/{first.id}").json()
        self.assertTrue(all(finding["history"] == [] for finding in served["findings"]))
        self.assertNotIn("changes", served["stats"])

        # A reviewer held the first report's partly met obligation to be met; the second report finds it a gap again
        gap = Finding.objects.filter(report=first, status="missing").first()
        held_met = Finding.objects.filter(report=first, status="partial").first()
        Finding.objects.filter(id=held_met.id).update(override_status="met")
        with fake_models() as model:
            started = post_json(self.client_user, "/api/reports", {"companyId": self.company["id"], "language": "lt"})
            drain()
            summary = next(prompt for name, prompt in model.calls if name == "summary")
        second = Report.objects.get(id=started.json()["id"])
        served = self.client_user.get(f"/api/reports/{second.id}").json()
        by_obligation = {finding["obligationId"]: finding for finding in served["findings"]}
        self.assertEqual(by_obligation[gap.obligation_id]["history"],
                         [{"reportId": first.id, "date": first.created_at.date().isoformat(), "status": "missing"}])
        self.assertEqual(by_obligation[held_met.obligation_id]["history"][0]["status"], "met", "the reviewer's verdict counts")
        moved = served["stats"]["changes"]
        self.assertEqual((moved["since"], moved["back"], moved["closed"]["count"], moved["new"]["count"]),
                         (first.id, {"count": 1, "titles": [held_met.obligation_title]}, 0, 0))
        self.assertIn(f"SINCE THE PREVIOUS REPORT ({first.created_at.date().isoformat()}; obligation by obligation)", summary)
        self.assertIn(f"- went back (were met, are a gap again): 1 ({held_met.obligation_title})", summary)
        self.assertIn("- gaps closed (were open, are met now): 0\n", summary)

        self.assertIn(f"Nuo ankstesnės ataskaitos ({first.created_at.date().isoformat()}): pašalinta spragų – 0, naujų spragų – 0, "
                      "vėl atsiradusių – 1.", render_html(second))

        # A gap of the first report that the second finds met is closed; one the first never assessed is new
        Finding.objects.filter(report=second, obligation_id=gap.obligation_id).update(status="met")
        Finding.objects.filter(id=held_met.id).delete()
        again = changes(second)
        self.assertEqual((again["closed"], again["new"]["count"], again["back"]["count"]),
                         ({"count": 1, "titles": [gap.obligation_title]}, 1, 0))

    def test_a_narrow_report_in_between_does_not_make_the_rest_look_new(self):
        first = self._report()
        gaps = list(Finding.objects.filter(report=first, status__in=("missing", "partial")))
        self.assertGreaterEqual(len(gaps), 2)
        # The second report assessed one obligation only; the third all of them again, one gap now met
        second = self._report()
        Finding.objects.filter(report=second).exclude(obligation_id=gaps[0].obligation_id).delete()
        third = self._report()
        Finding.objects.filter(report=third, obligation_id=gaps[1].obligation_id).update(status="met")
        moved = changes(third)
        self.assertEqual((moved["since"], moved["new"]["count"], moved["back"]["count"]), (second.id, 0, 0))
        self.assertEqual(moved["closed"], {"count": 1, "titles": [gaps[1].obligation_title]})

    def test_a_new_version_of_an_act_names_the_findings_to_look_at_again(self):
        path = f"/api/companies/{self.company['id']}/law-changes"
        self.assertEqual(self.client_user.get(path).json(), {"reportId": None, "reportDate": None, "acts": []})
        report = self._report()
        self.assertEqual(self.client_user.get(path).json()["acts"], [], "the act is as the report read it")
        mica = LegalDocument.objects.get(short_title="MiCA")
        self.assertIsNone(mica.current_version.changes, "a first version changed nothing")

        # Article 59 is reworded, Article 78 dropped, an Article 60 added
        text = EU_EN.replace("registered office", "head office") \
            .replace("Article 78\nExecution of orders for crypto-assets on behalf of clients\n"
                     "1. Crypto-asset service providers executing orders shall take all necessary steps to obtain the best possible result.\n",
                     "Article 60\nNotification\n1. An entity shall notify the competent authority.\n")
        self.assertNotEqual(text, EU_EN)
        with fake_models():
            upload = io.BytesIO(text.encode())
            upload.name = "MiCA.txt"
            self.admin_client.post(f"/api/corpus/documents/{mica.id}/upload", {"file": upload})
            drain()
        mica.refresh_from_db()
        self.assertEqual(mica.current_version.version_no, 2)
        self.assertEqual({kind: mica.current_version.changes[kind] for kind in ("changed", "added", "removed")},
                         {"changed": ["Art. 59"], "added": ["Art. 60"], "removed": ["Art. 78"]})

        served = self.client_user.get(path).json()
        self.assertEqual((served["reportId"], len(served["acts"])), (report.id, 1))
        act = served["acts"][0]
        self.assertEqual((act["act"], act["assessedVersion"], act["currentVersion"], act["recorded"], act["changed"],
                          act["added"], act["removed"]), ("MiCA", 1, 2, True, ["Art. 59"], ["Art. 60"], ["Art. 78"]))
        on_changed = {f.id for f in Finding.objects.filter(report=report)
                      if any(str(c.get("path", "")).startswith(("Art. 59", "Art. 78")) for c in f.citations)}
        self.assertTrue(on_changed)
        self.assertEqual({finding["id"] for finding in act["findings"]}, on_changed)
        self.assertTrue(all(finding["path"].startswith(("Art. 59", "Art. 78")) for finding in act["findings"]))
        # A version whose changes nobody recorded says so
        type(mica.current_version).objects.filter(id=mica.current_version_id).update(changes=None)
        self.assertEqual(self.client_user.get(path).json()["acts"][0]["recorded"], False)
        self.assertEqual(signed_in(create_user("svetimas@knf.vu.lt")).get(path).status_code, 404)

