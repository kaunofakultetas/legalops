############################################################
#  [*] Tests — the work products of a compliance programme
#
#  A product is generated in the background from the company's
#  documents and comes out a draft with the rules of its kind
#  checked: a compliance policy has its eight parts in their
#  order, its quotes placed in the documents they name and
#  its provisions looked up in the corpus — one that is not
#  there breaks a blocking rule, and a draft that breaks one
#  cannot be approved. A person's edit goes through the same
#  rules and can mend it; only a person approves; an approved
#  product is frozen and revised as a new version. The run is
#  refused where it cannot work, cancelled while it waits,
#  and seen only by those who see the company. A draft or an
#  approved product exports as a file in the formats of its
#  kind, its cover saying which of the two it is. The chart of
#  a structure reads the three lines left to right and hangs
#  the childless functions of a body together, so it fits a
#  page. A legal basis that names an inserted article is
#  looked up as that article, however its index is written.
############################################################


import io
import json
import re

from django.test import SimpleTestCase, TestCase

from compliance.audit.models import AuditLog
from compliance.companies.models import Company
from compliance.corpus.models import LegalUnit
from compliance.jobs.models import JobStep
from compliance.programme import exports
from compliance.programme.chart import structure_svg
from compliance.programme.models import WorkProduct
from compliance.programme.policy import KEYS
from compliance.programme.risks import band_of
from compliance.programme.run import Library, _numbered
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, LT_LAW, ingest_act
from compliance.tests.test_pipeline import POLICY, drain
from compliance.tests.utils import create_admin, create_user, patch_json, post_json, signed_in








class PolicyProductTests(TestCase):

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
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
        self.path = f"/api/companies/{self.company['id']}/programme"

    # A policy generated and read back whole
    def _generated(self):
        with fake_models() as model:
            started = post_json(self.client_user, self.path, {"kind": "policy"})
            self.assertEqual(started.status_code, 201, started.content)
            self.assertEqual((started.json()["status"], started.json()["version"]), ("queued", 1))
            drain()
        product = self.client_user.get(f"/api/programme/{started.json()['id']}").json()
        self.assertEqual(product["status"], "draft", product["error"])
        # The job said where the run stood, last at the checking of the references
        self.assertEqual(product["progress"], {"step": "references", "percent": 92, "message": None})
        return product, model

    def _put(self, product, content):
        return self.client_user.put(f"/api/programme/{product['id']}/content", data={"content": content},
                                    content_type="application/json")

    def test_a_policy_comes_out_a_draft_with_its_rules_checked(self):
        product, model = self._generated()
        content = product["content"]
        self.assertEqual(product["title"], "UAB Kripto atitikties politika")
        self.assertEqual([part["key"] for part in content["parts"]], list(KEYS))
        self.assertEqual(content["parts"][0]["heading"], "Įvadas: tikslas, apimtis ir tinkamumas")
        self.assertEqual(content["parts"][2]["decisions"], ["Kam atskaitingas atitikties pareigūnas"])

        # A quote is placed in the document it names, a provision looked up in the corpus
        source = content["parts"][0]["sources"][0]
        self.assertEqual((source["document"], source["quote"]), ("politika.md", "Atitikties pareigūnas atsiskaito valdybai"))
        self.assertEqual(source["start"], POLICY.index("Atitikties pareigūnas atsiskaito valdybai"))
        basis = content["parts"][0]["legalBasis"][0]
        self.assertEqual((basis["found"], basis["shortTitle"], bool(basis["citationUrl"] or basis["path"])), (True, "MiCA", True))
        self.assertEqual([(row["document"], row["level"]) for row in content["hierarchy"]], [("politika.md", 2)])
        missing = content["missing"][0]
        self.assertEqual((missing["level"], missing["supports"], missing["priority"]), (3, "whistleblowing", "high"))
        self.assertEqual(missing["partlyCoveredBy"][0]["document"], "politika.md")
        self.assertFalse(missing["legalBasis"][0]["found"])

        # The rules of the kind: a provision the corpus lacks blocks approval
        checks = {c["rule"]: c for c in product["checks"]}
        self.assertEqual({rule: c["ok"] for rule, c in checks.items()},
                         {"parts": True, "provisions": False, "provisions_unverified": True, "provision_subjects": True,
                          "quotes": True, "hierarchy": True})
        self.assertEqual((checks["provisions"]["blocking"], checks["provisions"]["detail"]), (True, "MiCA 999"))
        self.assertEqual(product["basis"]["documents"][0]["title"], "politika.md")
        self.assertIsNone(product["basis"]["reportId"])
        self.assertIn("costUsd", product["stats"])

        # What the model was given, and where the run's calls are filed
        policy_call = next(prompt for name, prompt in model.calls if name == "policy")
        self.assertIn("COMPANY\n", policy_call)
        self.assertIn('<document ref="D1" title="politika.md"', policy_call)
        self.assertIn('- mandate — "Atitikties funkcijos įgaliojimai (mandatas)": structural and operational', policy_call)
        self.assertIn("(the company has no finished compliance report yet)", policy_call)
        gaps_call = next(prompt for name, prompt in model.calls if name == "documents")
        self.assertIn("THE LIBRARY\n- D1: politika.md — ", gaps_call)
        self.assertIn("THE POLICY JUST DRAFTED", gaps_call)
        row = WorkProduct.objects.get(id=product["id"])
        self.assertEqual(list(JobStep.objects.filter(job=row.job).order_by("ordinal").values_list("name", flat=True)),
                         ["documents", "policy", "document_gaps", "references"])
        listed = self.client_user.get(self.path).json()
        self.assertEqual([(p["kind"], p["version"], p["status"]) for p in listed["products"]], [("policy", 1, "draft")])
        self.assertNotIn("content", listed["products"][0])
        self.assertEqual(listed["kinds"][0]["kind"], "policy")

    def test_the_policy_reads_the_classification_as_json(self):
        # Printed as it is, a Python dict reads None and single
        # quotes; every other prompt gives the model JSON
        Company.objects.filter(id=self.company["id"]).update(
            financial_market={"market": "kriptoturto rinka", "licence": None})
        _, model = self._generated()
        told = next(prompt for name, prompt in model.calls if name == "policy")
        self.assertIn('FINANCIAL MARKET CLASSIFICATION\n{"market": "kriptoturto rinka", "licence": null}\n', told)

    def test_a_person_mends_approves_and_revises(self):
        product, _ = self._generated()
        refused = patch_json(self.client_user, f"/api/programme/{product['id']}", {"approved": True})
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "RULES_BROKEN"))

        # The edit goes through the same rules: the unknown provision is taken out
        content = product["content"]
        # …and an act the corpus does not hold is said, not forbidden
        content["missing"][0]["legalBasis"] = [{"act": "Darbo kodeksas", "article": "58 straipsnis", "why": "dismissal"}]
        content["parts"][0]["text"] = "Trumpai."
        edited = self._put(product, content)
        self.assertEqual(edited.status_code, 200, edited.content)
        checks = {c["rule"]: c for c in edited.json()["checks"]}
        self.assertEqual((checks["provisions"]["ok"], checks["parts"]["ok"], checks["parts"]["detail"]), (True, False, "purpose"))
        self.assertEqual((checks["provisions_unverified"]["ok"], checks["provisions_unverified"]["blocking"],
                          checks["provisions_unverified"]["detail"]), (False, False, "Darbo kodeksas"))
        self.assertEqual(edited.json()["content"]["missing"][0]["legalBasis"][0]["article"], "58")
        content["parts"][0]["text"] = "Ši politika nustato, kodėl ir kaip bendrovė laikosi jai taikomų reikalavimų. " * 3
        content["parts"][0]["sources"].append({"documentId": "no-such-document", "quote": "x"})
        content["parts"][0]["sources"].append({"documentId": content["hierarchy"][0]["documentId"], "quote": "Šito tekste nėra"})
        edited = self._put(product, content).json()
        checks = {c["rule"]: c for c in edited["checks"]}
        self.assertTrue(all(c["ok"] for c in edited["checks"] if c["blocking"]))
        self.assertEqual((checks["quotes"]["ok"], checks["quotes"]["blocking"], checks["quotes"]["detail"]), (False, False, "politika.md"))
        self.assertEqual(len(edited["content"]["parts"][0]["sources"]), 2, "a source naming no document of the company is dropped")
        self.assertEqual(edited["editedByName"], "Tomas")

        approved = patch_json(self.client_user, f"/api/programme/{product['id']}", {"approved": True, "note": "Valdybai"})
        self.assertEqual((approved.status_code, approved.json()["status"], approved.json()["approvedByName"]),
                         (200, "approved", "Tomas"))
        self.assertEqual({row.action for row in AuditLog.objects.filter(target_id=product["id"])},
                         {"programme.create", "programme.edit", "programme.approve"})

        # Approved is frozen: a change is a new version
        frozen = self._put(product, content)
        self.assertEqual((frozen.status_code, frozen.json()["code"]), (409, "NOT_DRAFT"))
        revised = post_json(self.client_user, f"/api/programme/{product['id']}/revise", {})
        self.assertEqual((revised.status_code, revised.json()["version"], revised.json()["status"]), (201, 2, "draft"))
        self.assertEqual(revised.json()["basis"]["revisedFrom"], product["id"])
        self.assertEqual(revised.json()["content"]["parts"][0]["text"], edited["content"]["parts"][0]["text"])
        again = post_json(self.client_user, f"/api/programme/{product['id']}/revise", {})
        self.assertEqual((again.status_code, again.json()["code"]), (409, "NEWER_VERSION"))
        self.assertEqual(WorkProduct.objects.get(id=product["id"]).status, "approved")

    def test_the_run_is_refused_cancelled_and_kept_to_its_company(self):
        def refused(body, client=None, path=None):
            answer = post_json(client or self.client_user, path or self.path, body)
            return answer.status_code, answer.json()["code"]

        self.assertEqual(refused({"kind": "manifesto"}), (400, "INVALID_FIELD"))
        self.assertEqual(refused({"kind": "policy", "language": "de"}), (400, "INVALID_FIELD"))
        self.assertEqual(refused({"kind": "policy"}, signed_in(create_user("kitas@knf.vu.lt"))), (404, "NOT_FOUND"))
        empty = post_json(self.client_user, "/api/companies", {"name": "UAB Tuščia", "institutionType": "casp"}).json()
        self.assertEqual(refused({"kind": "policy"}, path=f"/api/companies/{empty['id']}/programme"), (409, "NO_DOCUMENTS"))

        with fake_models():
            started = post_json(self.client_user, self.path, {"kind": "policy", "language": "en"}).json()
            self.assertEqual(refused({"kind": "policy"}), (409, "ALREADY_RUNNING"))
            self.assertEqual(self.client_user.delete(f"/api/programme/{started['id']}").json()["code"], "STILL_RUNNING")
            # Nor can the company go while a document of its is being written
            gone = self.client_user.delete(f"/api/companies/{self.company['id']}")
            self.assertEqual((gone.status_code, gone.json()["code"]), (409, "STILL_RUNNING"))
            cancelled = post_json(self.client_user, f"/api/programme/{started['id']}/cancel", {})
            self.assertEqual((cancelled.status_code, cancelled.json()["status"]), (200, "cancelled"))
            drain()
        self.assertEqual(WorkProduct.objects.get(id=started["id"]).status, "cancelled")
        stranger = signed_in(create_user("svetimas@knf.vu.lt"))
        self.assertEqual(stranger.get(f"/api/programme/{started['id']}").status_code, 404)
        self.assertEqual(self.client_user.delete(f"/api/programme/{started['id']}").status_code, 200)
        self.assertFalse(WorkProduct.objects.filter(id=started["id"]).exists())

        # The next version counts on from the versions there were
        with fake_models():
            again = post_json(self.client_user, self.path, {"kind": "policy", "language": "en"}).json()
            drain()
        product = self.client_user.get(f"/api/programme/{again['id']}").json()
        self.assertEqual((product["version"], product["status"], product["content"]["parts"][0]["heading"]),
                         (1, "draft", "Introduction: purpose, scope and fit"))








class GovernanceProductTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.company = post_json(self.client_user, "/api/companies",
                                 {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()
        upload = io.BytesIO(POLICY.encode())
        upload.name = "politika.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": self.company["id"]})
        self.path = f"/api/companies/{self.company['id']}/programme"

    def _generated(self, kind="governance"):
        with fake_models() as model:
            started = post_json(self.client_user, self.path, {"kind": kind})
            self.assertEqual(started.status_code, 201, started.content)
            drain()
        product = self.client_user.get(f"/api/programme/{started.json()['id']}").json()
        self.assertEqual(product["status"], "draft", product["error"])
        return product, model

    def _edited(self, product, change):
        content = json.loads(json.dumps(product["content"]))
        change(content)
        answer = self.client_user.put(f"/api/programme/{product['id']}/content", data={"content": content},
                                      content_type="application/json")
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer.json(), {c["rule"]: c for c in answer.json()["checks"]}

    def test_the_structure_the_process_and_the_matrix_come_out_checked(self):
        product, model = self._generated()
        content = product["content"]
        self.assertEqual(content["positions"][0]["sources"][0]["start"], POLICY.index("Atitikties pareigūnas atsiskaito valdybai"))
        self.assertEqual([(n["id"], n["line"], n["parentId"], n["proposed"]) for n in content["structure"]],
                         [("n1", "governing", None, False), ("n2", "first", "n1", False), ("n3", "first", "n2", False),
                          ("n4", "second", "n1", False), ("n5", "third", "n1", True)])
        self.assertEqual(len(content["process"]), 6)
        self.assertEqual(len(content["raci"]), 18)
        checks = {c["rule"]: c for c in product["checks"]}
        self.assertTrue(all(c["ok"] for c in product["checks"] if c["blocking"]), product["checks"])
        # The matrix keeps the golden rule but leans on three roles: said, not forbidden
        self.assertEqual((checks["raci_everywhere"]["ok"], checks["raci_everywhere"]["blocking"]), (False, False))
        self.assertEqual(checks["raci_heavy"]["detail"], "Valdyba")

        # The second call may only use the roles the first proposed, and no policy exists yet
        structure_call = next(prompt for name, prompt in model.calls if name == "structure")
        self.assertIn("- D1 politika.md: Valdyba", structure_call)
        self.assertIn("(the company has no compliance policy product yet)", structure_call)
        raci_call = next(prompt for name, prompt in model.calls if name == "raci")
        self.assertIn("- n5: Vidaus auditas (third line, proposed)", raci_call)

        # The structure is drawn once, for the page and the PDF
        chart = self.client_user.get(f"/api/programme/{product['id']}/chart")
        self.assertEqual((chart.status_code, chart["Content-Type"]), (200, "image/svg+xml"))
        drawing = chart.content.decode()
        self.assertEqual(drawing.count("<rect "), 5 + 5, "five nodes and the legend's five lines")
        self.assertEqual(drawing.count('stroke-dasharray="5 3"'), 1, "what is proposed is dashed")
        self.assertIn(">Vidaus auditas</text>", drawing)
        self.assertIn(">siūloma</text>", drawing)

    def test_the_golden_rule_and_the_independence_of_the_lines_are_enforced(self):
        product, _ = self._generated()

        def without_accountable(content):
            content["raci"] = [c for c in content["raci"] if not (c["stepId"] == "s1" and c["value"] == "A")]
        edited, checks = self._edited(product, without_accountable)
        self.assertEqual((checks["raci_accountable"]["ok"], checks["raci_accountable"]["detail"]),
                         (False, "Teisės aktų pokyčių stebėjimas"))
        refused = patch_json(self.client_user, f"/api/programme/{product['id']}", {"approved": True})
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "RULES_BROKEN"))

        def two_accountable(content):
            content["raci"].append({"stepId": "s2", "roleId": "n2", "value": "A"})
        _, checks = self._edited(product, two_accountable)
        self.assertEqual(checks["raci_accountable"]["detail"], "Atitikties rizikos vertinimas")

        # One role doing the work and answering for it holds AR: both letters count
        def doer_answers(content):
            content["raci"] = [c for c in content["raci"] if c["stepId"] != "s3"]
            content["raci"] += [{"stepId": "s3", "roleId": "n4", "value": "AR"},
                                {"stepId": "s3", "roleId": "no-such-role", "value": "R"},
                                {"stepId": "no-such-step", "roleId": "n1", "value": "A"}]
        edited, checks = self._edited(product, doer_answers)
        self.assertTrue(checks["raci_accountable"]["ok"] and checks["raci_responsible"]["ok"])
        self.assertEqual([c for c in edited["content"]["raci"] if c["stepId"] == "s3"],
                         [{"stepId": "s3", "roleId": "n4", "value": "AR"}], "a cell naming no role or step is dropped")

        def no_doer(content):
            content["raci"] = [c for c in content["raci"] if not (c["stepId"] == "s4" and c["value"] == "R")]
        _, checks = self._edited(product, no_doer)
        self.assertEqual((checks["raci_responsible"]["ok"], checks["raci_responsible"]["detail"]), (False, "Stebėsena ir testavimas"))

        # The second line under the first, internal audit under the chief executive
        def subordinate(content):
            nodes = {n["id"]: n for n in content["structure"]}
            nodes["n4"]["parentId"], nodes["n5"]["parentId"] = "n3", "n2"
        _, checks = self._edited(product, subordinate)
        self.assertEqual((checks["independence"]["ok"], checks["independence"]["detail"]),
                         (False, "Atitikties pareigūnas, Vidaus auditas"))

        # A circle of parents is cut, a tree without a governing body at its top is no structure
        def circle(content):
            nodes = {n["id"]: n for n in content["structure"]}
            nodes["n1"]["parentId"] = "n3"
        edited, checks = self._edited(product, circle)
        parents = {n["id"]: n["parentId"] for n in edited["content"]["structure"]}
        self.assertIn(None, parents.values())
        self.assertEqual(len(edited["content"]["structure"]), 5)

        def headless(content):
            content["structure"][0]["line"] = "first"
        _, checks = self._edited(product, headless)
        self.assertFalse(checks["structure"]["ok"])

        # A node that names a parent that is not there hangs nowhere, and a function
        # left on top beside the governing body is not under it: neither is a tree
        def detached(content):
            nodes = {n["id"]: n for n in content["structure"]}
            nodes["n5"]["parentId"] = "n9"
        _, checks = self._edited(product, detached)
        self.assertEqual((checks["structure"]["ok"], checks["structure"]["detail"]), (False, "Vidaus auditas"))

        def beside(content):
            nodes = {n["id"]: n for n in content["structure"]}
            nodes["n5"]["parentId"] = ""
        _, checks = self._edited(product, beside)
        self.assertEqual((checks["structure"]["ok"], checks["structure"]["detail"]), (False, "Vidaus auditas"))

        # An outside party may stand beside the tree
        def outside(content):
            content["structure"].append({"id": "n9", "name": "Išorės auditorius", "kind": "function", "line": "external",
                                         "parentId": "", "proposed": False, "note": ""})
        _, checks = self._edited(product, outside)
        self.assertTrue(checks["structure"]["ok"], checks["structure"])

        # Mended as generated, a person approves it
        mended, checks = self._edited(product, lambda content: None)
        self.assertTrue(all(c["ok"] for c in mended["checks"] if c["blocking"]))
        approved = patch_json(self.client_user, f"/api/programme/{product['id']}", {"approved": True})
        self.assertEqual((approved.status_code, approved.json()["status"]), (200, "approved"))

    def test_the_structure_builds_on_the_compliance_policy_there_is(self):
        policy, _ = self._generated("policy")
        product, model = self._generated()
        structure_call = next(prompt for name, prompt in model.calls if name == "structure")
        self.assertIn("Version 1, a draft, not yet approved.\n[mandate] Bendrovė įsipareigoja", structure_call)
        self.assertEqual(product["basis"]["products"]["policy"], {"id": policy["id"], "version": 1, "status": "draft"})
        kinds = {k["kind"]: k for k in self.client_user.get(self.path).json()["kinds"]}
        self.assertEqual(kinds["governance"]["needs"], ["policy"])








class RiskProductTests(TestCase):

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
        with fake_models() as model:
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            started = post_json(self.client_user, f"/api/companies/{self.company['id']}/programme", {"kind": "risks"})
            self.assertEqual(started.status_code, 201, started.content)
            drain()
        self.model = model
        self.product = self.client_user.get(f"/api/programme/{started.json()['id']}").json()
        self.assertEqual(self.product["status"], "draft", self.product["error"])

    def _edited(self, change):
        content = json.loads(json.dumps(self.product["content"]))
        change(content)
        answer = self.client_user.put(f"/api/programme/{self.product['id']}/content", data={"content": content},
                                      content_type="application/json")
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer.json()["content"], {c["rule"]: c for c in answer.json()["checks"]}

    def test_the_register_comes_out_scored_by_code(self):
        content = self.product["content"]
        self.assertEqual([(row["level"], row["name"]) for row in content["criteria"]["likelihood"]][::4],
                         [(1, "Labai mažai tikėtina"), (5, "Beveik neabejotina")])
        self.assertEqual(content["criteria"]["impact"][4]["name"], "Katastrofinis")
        self.assertEqual([(a["band"], a["name"], a["from"], a["to"], a["responses"]) for a in content["appetite"]], [
            ("negligible", "Nereikšminga", 1, 3, ["accept", "increase"]), ("tolerable", "Toleruotina", 4, 6, ["accept", "mitigate"]),
            ("medium", "Vidutinė", 8, 12, ["mitigate", "transfer"]), ("high", "Didelė", 15, 16, ["mitigate", "avoid"]),
            ("critical", "Kritinė", 20, 25, ["avoid"])])
        self.assertEqual([s["id"] for s in content["scenarios"]], ["LR-01", "LR-02", "LR-03", "LR-04", "LR-05"])
        first = content["scenarios"][0]
        # Likelihood: the mean of 3, 2, 2, 3 rounded; impact: the highest of 2, 4, 3, 2
        self.assertEqual((first["likelihood"]["level"], first["impact"]["level"], first["score"], first["band"]), (3, 4, 12, "medium"))
        self.assertEqual((first["policies"], first["legalBasis"][0]["found"]),
                         ([{"documentId": first["policies"][0]["documentId"], "document": "politika.md"}], True))
        self.assertTrue(all(c["ok"] for c in self.product["checks"]), self.product["checks"])

        asked = next(prompt for name, prompt in self.model.calls if name == "risk_scenarios")
        self.assertIn("LIKELIHOOD CRITERIA (level: dimension: what the level means)\n- 1: control: kontrolė 1; ", asked)
        self.assertIn("TYPES OF LEGAL RISK (categories)\n1 Teisinės aplinkos nenuspėjamumas; 2 Taikytinų teisės aktų nesilaikymas", asked)
        self.assertIn("(no structure product yet — use the units the documents name)", asked)
        self.assertIn("THE LIBRARY (policies a scenario can concern)\n- D1: politika.md", asked)
        criteria_call = next(prompt for name, prompt in self.model.calls if name == "risk_criteria")
        self.assertIn("- medium: score 8–12 (Vidutinė); responses allowed: mitigate, transfer", criteria_call)

    def test_no_level_score_or_band_is_taken_on_trust(self):
        def rescored(content):
            row = content["scenarios"][0]
            row["likelihood"].update({"control": 5, "clarity": 5, "counterparty": 5, "frequency": 5, "level": 1})
            row["impact"].update({"financial": 5, "regulatory": 1, "reputation": 1, "reach": 1, "level": 1})
            row["score"], row["band"] = 1, "negligible"
        content, checks = self._edited(rescored)
        first = content["scenarios"][0]
        self.assertEqual((first["likelihood"]["level"], first["impact"]["level"], first["score"], first["band"]), (5, 5, 25, "critical"))
        # A critical risk is not "mitigated": its band allows only to avoid it
        self.assertEqual((checks["response_fit"]["ok"], checks["response_fit"]["blocking"], checks["response_fit"]["detail"]),
                         (False, False, "LR-01"))

        def out_of_scale(content):
            content["scenarios"][1]["impact"]["regulatory"] = 7
        content, checks = self._edited(out_of_scale)
        self.assertEqual((checks["scores"]["ok"], checks["scores"]["detail"]), (False, "LR-02"))
        self.assertEqual((content["scenarios"][1]["score"], content["scenarios"][1]["band"]), (0, None))

    def test_the_rules_of_a_register(self):
        def four(content):
            content["scenarios"].pop()
        _, checks = self._edited(four)
        self.assertEqual((checks["scenarios"]["ok"], checks["scenarios"]["detail"]), (False, "4"))

        def narrow(content):
            for row in content["scenarios"]:
                row["categories"] = [2] if row["id"] != "LR-01" else [1, 3]
        _, checks = self._edited(narrow)
        self.assertEqual((checks["categories"]["ok"], checks["categories"]["detail"]), (False, "1, 2, 3"))

        def loose(content):
            content["scenarios"][2]["policies"] = [{"documentId": "no-such-document"}]
            content["scenarios"][3]["objective"] = ""
            content["scenarios"][4]["sentence"] = "Raktai gali būti prarasti."
            content["scenarios"][4]["owners"] = []
            content["criteria"]["impact"][2]["reach"] = ""
        content, checks = self._edited(loose)
        self.assertEqual((checks["ties"]["detail"], checks["sentence"]["detail"], checks["criteria"]["detail"]),
                         ("LR-03", "LR-04", "1"))
        self.assertEqual((checks["sentence_form"]["ok"], checks["sentence_form"]["detail"]), (False, "LR-05"))
        self.assertEqual((checks["owners"]["blocking"], checks["owners"]["detail"]), (False, "LR-05"))
        refused = patch_json(self.client_user, f"/api/programme/{self.product['id']}", {"approved": True})
        self.assertEqual((refused.status_code, refused.json()["code"]), (409, "RULES_BROKEN"))

        # The criteria are not complete while a band says nothing or the fitting is not explained
        def bare(content):
            content["appetite"][1]["decision"] = ""
            content["appetite"][3]["comment"] = " "
            content["criteria"]["calibration"] = ""
        _, checks = self._edited(bare)
        self.assertEqual((checks["criteria"]["ok"], checks["criteria"]["detail"]), (False, "3"))

        # A decision and a calibration of a few sentences are kept whole, not cut in a word
        def long(content):
            content["appetite"][0]["decision"] = "d" * 900
            content["criteria"]["calibration"] = "c" * 3_000
        content, checks = self._edited(long)
        self.assertEqual((len(content["appetite"][0]["decision"]), len(content["criteria"]["calibration"])), (900, 3_000))
        self.assertTrue(checks["criteria"]["ok"])

    def test_every_score_falls_in_a_band(self):
        bands = {score: band_of(score) for score in sorted({t * p for t in range(1, 6) for p in range(1, 6)})}
        self.assertEqual(bands, {1: "negligible", 2: "negligible", 3: "negligible", 4: "tolerable", 5: "tolerable",
                                 6: "tolerable", 8: "medium", 9: "medium", 10: "medium", 12: "medium", 15: "high",
                                 16: "high", 20: "critical", 25: "critical"})








class ExportTests(TestCase):

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
        self.products = {}
        with fake_models():
            ingest_act(self.admin_client, EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                       external_id="32023R1114")
            for kind in ("policy", "governance", "risks"):
                started = post_json(self.client_user, f"/api/companies/{self.company['id']}/programme", {"kind": kind})
                self.assertEqual(started.status_code, 201, started.content)
                drain()
                self.products[kind] = WorkProduct.objects.get(id=started.json()["id"])
                self.assertEqual(self.products[kind].status, "draft", self.products[kind].error)

    def _export(self, kind, fmt, client=None):
        return (client or self.client_user).get(f"/api/programme/{self.products[kind].id}/export?format={fmt}")

    def test_every_kind_is_a_pdf_whose_cover_says_draft_or_approved(self):
        for kind in ("policy", "governance", "risks"):
            answer = self._export(kind, "pdf")
            self.assertEqual((answer.status_code, answer["Content-Type"], answer.content[:5]),
                             (200, "application/pdf", b"%PDF-"), kind)
            self.assertEqual(answer["Content-Disposition"], f'attachment; filename="{kind}-UAB-Kripte-v1.pdf"')
            self.assertEqual(answer["Cache-Control"], "no-store")
        self.assertEqual(sorted(AuditLog.objects.filter(action="programme.export").values_list("details__kind", flat=True)),
                         ["governance", "policy", "risks"])

        page = exports.render_html(self.products["policy"])
        self.assertIn("Projektas — žmogaus dar nepatvirtintas", page)
        self.assertIn("Įvadas: tikslas, apimtis ir tinkamumas", page)
        self.assertIn("Dokumentų hierarchija", page)
        page = exports.render_html(self.products["governance"])
        self.assertIn("<svg", page)
        self.assertIn('class="grid raci"', page)
        self.assertIn('<section id="s3" class="wide">', page)
        page = exports.render_html(self.products["risks"])
        self.assertIn("LR-01", page)
        self.assertIn('class="c b-medium">12 · Vidutinė', page)
        # The rules of the kind close every product, each in words
        self.assertIn("Yra bent penki rizikos scenarijai", page)

        approved = patch_json(self.client_user, f"/api/programme/{self.products['risks'].id}",
                              {"approved": True, "note": "Valdybos 2026-11-12 sprendimas"})
        self.assertEqual(approved.status_code, 200, approved.content)
        page = exports.render_html(WorkProduct.objects.get(id=self.products["risks"].id))
        self.assertIn("Patvirtino: Tomas", page)
        self.assertIn("Valdybos 2026-11-12 sprendimas", page)
        self.assertNotIn("Projektas — žmogaus dar nepatvirtintas", page)

    def test_the_policy_is_a_word_file_and_the_register_a_workbook(self):
        from docx import Document
        from openpyxl import load_workbook

        answer = self._export("policy", "docx")
        self.assertEqual(answer.status_code, 200, answer.content[:200])
        self.assertEqual(answer["Content-Disposition"], 'attachment; filename="policy-UAB-Kripte-v1.docx"')
        texts = [paragraph.text for paragraph in Document(io.BytesIO(answer.content)).paragraphs]
        self.assertIn("1. Įvadas: tikslas, apimtis ir tinkamumas", texts)
        self.assertTrue(any("Projektas — žmogaus dar nepatvirtintas" in text for text in texts), texts[:3])
        self.assertEqual(sum(text[:2] in {f"{n}." for n in range(1, 9)} for text in texts), 8)

        # A scenario whose sentence starts like a formula stays text in the workbook
        product = self.products["risks"]
        product.content["scenarios"][0]["sentence"] = "=1+1 Tikėtinas pažeidimas"
        product.save(update_fields=["content"])
        answer = self._export("risks", "xlsx")
        self.assertEqual(answer.status_code, 200, answer.content[:200])
        book = load_workbook(io.BytesIO(answer.content))
        register = book.worksheets[0]
        self.assertEqual((register.title, len(book.worksheets)), ("Teisinės rizikos registras", 4))
        self.assertEqual([register.cell(1, 1).value, register.cell(2, 1).value, register.cell(6, 1).value], ["ID", "LR-01", "LR-05"])
        sentence = register.cell(2, 4)
        self.assertEqual((sentence.data_type, sentence.value[:5]), ("s", "=1+1 "))
        # T, P and the score are numbers a reader can sort by
        self.assertEqual([register.cell(2, column).value for column in (9, 10, 11, 12)], [3, 4, 12, "Vidutinė"])
        self.assertEqual(book.worksheets[1].cell(2, 1).value, "1 — Labai mažai tikėtina")

    def test_a_scenarios_typologies_and_a_missing_documents_policy_part_are_printed(self):
        from openpyxl import load_workbook

        # The lecture's three typologies, in the lecture's words, under the type of legal risk
        product = self.products["risks"]
        for scenario in product.content["scenarios"]:
            scenario.update(sourceType=None, consequenceType=None, objectiveType=None)
        product.content["scenarios"][0].update(sourceType=6, consequenceType=2, objectiveType=1)
        product.save(update_fields=["content"])
        line = ("Šaltinio rūšis: Vidiniai procesai, kontrolės sistemos ir IT architektūra · "
                "Pasekmių rūšis: Priežiūros ir licencinės pasekmės · "
                "Saugomo tikslo rūšis: Teisinės atitikties ir licenciniai tikslai")
        self.assertEqual(exports.render_html(product).count(line), 2, "on the scenario's card and in the register's row")
        register = load_workbook(io.BytesIO(self._export("risks", "xlsx").content)).worksheets[0]
        self.assertTrue(register.cell(2, 4).value.endswith(line), register.cell(2, 4).value)
        self.assertNotIn("Šaltinio rūšis", register.cell(3, 4).value, "a scenario placed in none prints none")

        # The part of the policy a missing document makes workable, by that part's heading
        policy = self.products["policy"]
        policy.content["missing"] = [{"level": 2, "title": "Duomenų apsaugos politika", "purpose": "Nustato tvarką.",
                                      "supports": "mandate", "priority": "high", "legalBasis": [], "partlyCoveredBy": []}]
        policy.save(update_fields=["content"])
        heading = next(part["heading"] for part in policy.content["parts"] if part["key"] == "mandate")
        self.assertIn(f"Politikos dalis: {heading}", exports.render_html(policy))

    def test_what_cannot_be_exported_is_refused(self):
        self.assertEqual((self._export("governance", "xlsx").status_code, self._export("governance", "xlsx").json()["code"]),
                         (400, "INVALID_QUERY"))
        self.assertEqual(self._export("risks", "docx").status_code, 400)
        stranger = signed_in(create_user(email="kitas@knf.vu.lt"))
        self.assertEqual(self._export("policy", "pdf", stranger).status_code, 404)
        WorkProduct.objects.filter(id=self.products["policy"].id).update(status="failed")
        answer = self._export("policy", "pdf")
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NOT_READY"))

    def test_a_product_s_text_never_becomes_markup(self):
        product = self.products["governance"]
        product.title = "<script>alert(1)</script>"
        product.content["structure"][0]["name"] = "<b>Valdyba</b> & Co"
        product.content["process"][0]["name"] = "<img src=x onerror=alert(1)>"
        page = exports.render_html(product)
        self.assertNotIn("<script>alert", page)
        self.assertNotIn("<img", page)
        self.assertNotIn("<b>Valdyba", page)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)








class ChartTests(SimpleTestCase):

    def _node(self, node_id, line, parent=None, proposed=False):
        return {"id": node_id, "name": f"Mazgas {node_id}", "kind": "function", "line": line, "parentId": parent,
                "proposed": proposed, "note": ""}

    def test_the_lines_read_left_to_right_and_childless_functions_share_a_rail(self):
        nodes = ([self._node("board", "governing"), self._node("audit", "third", "board"), self._node("ceo", "first", "board"),
                  self._node("it", "first", "ceo"), self._node("ops", "first", "ceo"), self._node("desk", "first", "it")]
                 + [self._node(f"s{number}", "second", "board") for number in range(1, 8)])
        drawing = structure_svg(nodes, "lt")
        boxes = dict(zip((node["id"] for node in nodes),
                         ((float(x), float(y)) for x, y in re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="180"', drawing))))
        self.assertEqual(len(boxes), len(nodes))
        # Five second-line functions hang on one rail, the sixth starts the next
        self.assertEqual(len({boxes[f"s{number}"][0] for number in range(1, 6)}), 1)
        self.assertEqual(boxes["s6"][0], boxes["s7"][0])
        self.assertGreater(boxes["s6"][0], boxes["s1"][0])
        self.assertEqual(boxes["s6"][1], boxes["s1"][1])
        # First line, then second, then third — whatever order the nodes came in
        self.assertLess(boxes["ceo"][0], boxes["s1"][0])
        self.assertLess(boxes["s7"][0], boxes["audit"][0])
        # A unit sits under its head, and what is under the unit a step to the right
        self.assertGreater(boxes["it"][1], boxes["ceo"][1])
        self.assertGreater(boxes["desk"][1], boxes["it"][1])
        # Nine direct reports do not take nine columns
        self.assertLess(int(re.search(r'width="(\d+)"', drawing).group(1)), 6 * 202)

    def test_an_empty_or_headless_structure_still_draws(self):
        self.assertEqual(structure_svg([], "en").count("<rect "), 5, "the legend alone")
        two = structure_svg([self._node("a", "governing"), self._node("b", "governing"), self._node("c", "first", "a")], "en")
        self.assertEqual(two.count('width="180"'), 3)
        self.assertIn(">Governing bodies</text>", two)








class LegalBasisTests(TestCase):

    def test_an_inserted_article_keeps_its_index(self):
        # The index is part of the article's number — never dropped, never read as the paragraph
        for written, numbered in (
                (("12-1 straipsnis", ""), ("12-1", "")),
                (("12¹ straipsnis", ""), ("12¹", "")),
                (("12^1 str.", ""), ("12^1", "")),
                (("12-1 straipsnio 2 dalis", ""), ("12-1", "2")),
                (("12¹ straipsnio 2 dalis", ""), ("12¹", "2")),
                (("12^1 str. 2 d.", ""), ("12^1", "2")),
                (("12-1", "3 dalis"), ("12-1", "3")),
                # A plain article, alone and with its paragraph, as before
                (("68 straipsnis", ""), ("68", "")),
                (("66 straipsnio 1 dalis", ""), ("66", "1")),
                (("Art. 66(1)", ""), ("66", "1")),
                (("Article 4a", "2"), ("4a", "2")),
                # A hyphen before a larger number is a range, read as its first article
                (("5-7 straipsniai", ""), ("5", "")),
                (("Art. 5-7(2)", ""), ("5", "2")),
                (("ISO 37301 4.1", ""), ("37301", "")),
                (("", ""), ("", ""))):
            self.assertEqual(_numbered(*written), numbered, written)

    def test_a_basis_without_its_act_or_its_article_is_dropped(self):
        # An act given as null was looked up as an act called "None"
        company = post_json(signed_in(create_user()), "/api/companies",
                            {"name": "UAB Bazė", "institutionType": "casp", "usesAi": False}).json()
        looked_up = Library(Company.objects.get(id=company["id"])).provisions(
            [{"act": None, "article": "5"}, {"act": "MiCA", "article": None}, {"article": "5"}, "not an entry",
             {"act": "MiCA", "article": "59"}])
        self.assertEqual([(entry["act"], entry["article"]) for entry in looked_up], [("MiCA", "59")])

    def test_a_legal_basis_naming_an_inserted_article_is_found(self):
        # Reduced to the number it begins with, 12-1 was looked
        # up as article 12: not found here, and in a law that has
        # both, another article found and judged in its place
        seed_defaults()
        user = create_user()
        company = post_json(signed_in(user), "/api/companies",
                            {"name": "UAB Mokėjimai", "institutionType": "payment_institution", "usesAi": False}).json()
        with fake_models():
            law = ingest_act(signed_in(create_admin()), LT_LAW, title="Mokėjimo įstaigų įstatymas", short_title="MĮĮ",
                             jurisdiction="LT", language="lt", doc_type="law")
        inserted = LegalUnit.objects.get(version=law.current_version, unit_type="article", number="12¹")
        library = Library(Company.objects.get(id=company["id"]))
        for stored in ("12¹", "12-1"):
            LegalUnit.objects.filter(id=inserted.id).update(number=stored)
            looked_up = library.provisions([{"act": "MĮĮ", "article": "12-1 straipsnis"},
                                            {"act": "MĮĮ", "article": "12¹ straipsnis"},
                                            {"act": "MĮĮ", "article": "12^1"},
                                            {"act": "MĮĮ", "article": "2 straipsnio 1 dalis"},
                                            {"act": "MĮĮ", "article": "12 straipsnis"}])
            self.assertEqual([entry["found"] for entry in looked_up], [True, True, True, True, False], stored)
            self.assertEqual({entry["path"] for entry in looked_up[:3]}, {inserted.path}, stored)
            self.assertEqual((looked_up[3]["article"], looked_up[3]["paragraph"]), ("2", "1"))
