############################################################
#  [*] Tests — what a breach of an act can cost
#
#  An act's sanction provisions are read once per version
#  into tiers kept on the version: the articles a tier
#  covers, whom it addresses, its ceilings and measures, and
#  the act it concerns — the act itself, or another one a
#  national law lays fines down for. An act without such
#  provisions is read as having none, without a model call.
#  A report reads the acts it assesses and gives each finding
#  the tier that covers its provision: one naming the article
#  before one for any infringement, a company's and never a
#  person's, the act's own beside another act's. An article
#  is told by its whole number: one inserted after another
#  (47-7, 45a) is an article of its own, for the tier that
#  names it and for the finding that cites it. A tier that
#  binds only certain persons and names no article says whom
#  it binds wherever it is shown, and is narrowed to the
#  articles whose obligations are addressed to them where
#  those stand in the tier's own part of the act alone. A
#  technical
#  standard lays down no sanction: a finding under it is
#  shown what the article it was adopted under costs, and
#  through which article. Only a person writes a finding's
#  cause. The operator's command queues the reading of the
#  rest of the corpus.
############################################################


import io
import re
from types import SimpleNamespace
from unittest import mock

import yaml
from django.core.management import call_command
from django.test import TestCase
from openpyxl import load_workbook

from compliance.analysis.exports import LABELS, consequence_text, render_xlsx
from compliance.analysis.models import Finding, Report
from compliance.analysis.pdf import render_html
from compliance.audit.models import AuditLog
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument, LegalDocumentVersion, LegalUnit, Obligation
from compliance.corpus import sanctions
from compliance.corpus.sanctions import Consequences, read_sanctions, sanction_provisions
from compliance.jobs.models import Job, JobStep
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.test_pipeline import POLICY, drain
from compliance.tests.utils import create_admin, create_user, patch_json, post_json, signed_in


# The test regulation with the article that lays its penalties down
WITH_PENALTIES = EU_EN.replace("ANNEX I\n", """Article 111
Administrative penalties and other administrative measures
1. Member States shall provide for competent authorities to have the power to take administrative penalties.
3. For infringements of Articles 59 and 78 the maximum administrative fines shall be at least EUR 5 000 000.
ANNEX I
""", 1)
# A regulation whose penalties article fines what another article lists, beside an article that only speaks
# of infringements
WITH_A_LIST = EU_EN.replace("ANNEX I\n", """Article 110
Infringements
1. Infringements are breaches of the requirements laid down in Articles 59 and 78.
Article 111
Penalties
1. For the infringements referred to in Article 110 the maximum administrative fine shall be at least EUR 5 000 000.
2. Paragraph 1 is without prejudice to Article 112.
Article 112
Reporting of infringements
1. Competent authorities shall establish mechanisms for the reporting of infringements.
ANNEX I
""", 1)
NATIONAL = """LIETUVOS RESPUBLIKOS
KRIPTOTURTO RINKŲ
ĮSTATYMAS

1 straipsnis. Įstatymo paskirtis
1. Šis įstatymas nustato kriptoturto paslaugų teikėjų priežiūrą.

15 straipsnis. Baudos
1. Už Reglamento (ES) 2023/1114 59 straipsnio pažeidimą juridiniam asmeniui skiriama bauda iki 700 000 eurų.
"""








class SanctionTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())
        self.user = create_user()
        self.client_user = signed_in(self.user)
        with fake_models():
            self.mica = ingest_act(self.admin_client, WITH_PENALTIES, title="Markets in crypto-assets",
                                   short_title="MiCA", external_id="32023R1114")
            self.plain = ingest_act(self.admin_client, EU_EN, title="Digital operational resilience", short_title="DORA",
                                    external_id="32022R2554")

    def _company(self):
        company = post_json(self.client_user, "/api/companies",
                            {"name": "UAB Kripto", "institutionType": "casp", "usesAi": False}).json()
        upload = io.BytesIO(POLICY.encode())
        upload.name = "politika.md"
        self.client_user.post("/api/documents", {"file": upload, "companyId": company["id"]})
        return company

    def test_the_sanction_provisions_are_read_into_tiers_once_a_version(self):
        self.assertEqual([unit.path for unit in sanction_provisions(self.mica)], ["Art. 111"])
        self.assertEqual(sanction_provisions(self.plain), [])
        with fake_models() as model:
            model.tiers = [
                {"provisionRef": "P1", "where": "3 d.", "infringedAct": "this", "articles": ["59", "64-83", "Article 78"],
                 "all": False, "condition": "", "addressee": "legal", "maxFineEur": 5000000, "maxFinePercent": 3,
                 "benefitMultiple": 2, "measures": ["withdrawal", "public_statement", "public_statement", "something else"]},
                {"provisionRef": "P1", "where": "1 d.", "infringedAct": "MiCA", "articles": [], "all": False,
                 "condition": "  for a repeated breach ", "addressee": "nobody", "maxFineEur": None, "maxFinePercent": 0,
                 "benefitMultiple": None, "measures": ["cease"]},
                {"provisionRef": "P9", "where": "", "infringedAct": "this", "articles": [], "all": True, "condition": "",
                 "addressee": "any", "maxFineEur": 1, "maxFinePercent": None, "benefitMultiple": None, "measures": []},
                {"provisionRef": "P1", "where": "9 d.", "infringedAct": "this", "articles": [], "all": True, "condition": "",
                 "addressee": "any", "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None, "measures": []},
                # Articles named in a way that cannot be read: a tier for those articles, never one "for any breach"
                {"provisionRef": "P1", "where": "5 d.", "infringedAct": "this", "articles": ["59(1)", "III skyrius"],
                 "all": False, "condition": "", "addressee": "legal", "maxFineEur": 100000, "maxFinePercent": None,
                 "benefitMultiple": None, "measures": []},
                # A periodic penalty and nothing else: the article named is the one the instruction was given under
                {"provisionRef": "P1", "where": "7 d.", "infringedAct": "this", "articles": ["59"], "all": False,
                 "condition": "not carrying out the instructions given under Article 59", "addressee": "any",
                 "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None, "measures": ["periodic_penalty"]},
                {"provisionRef": "P1", "where": "8 d.", "infringedAct": "this", "articles": ["59"], "all": False,
                 "condition": "", "addressee": "any", "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None,
                 "measures": ["periodic_penalty", "cease"]}]
            self.assertEqual(read_sanctions([self.mica, self.plain]), 2)
            asked = [prompt for name, prompt in model.calls if name == "sanctions"]
        self.assertEqual(len(asked), 1, "an act without sanction provisions costs no call")
        self.assertIn("ACT: Markets in crypto-assets (short title: MiCA; jurisdiction EU; type regulation)", asked[0])
        self.assertIn('<provision ref="P1" path="Art. 111" heading="Administrative penalties and other administrative measures">',
                      asked[0])
        self.assertIn("For infringements of Articles 59 and 78", asked[0])

        reading = LegalDocument.objects.get(id=self.mica.id).current_version.sanctions
        self.assertEqual(reading["provisions"], ["Art. 111"])
        # The tier of a provision that was not given is dropped, and so are one that states
        # nothing and one whose articles cannot be read
        first, second, compels, orders = reading["tiers"]
        self.assertEqual(first, {
            "path": "Art. 111", "where": "3 d.", "condition": "", "documentId": self.mica.id, "infringedAct": "",
            "articles": [["59", "59"], ["64", "83"], ["78", "78"]], "all": False, "addressee": "legal", "persons": [],
            "maxFineEur": 5000000.0,
            "maxFinePercent": 3.0, "benefitMultiple": 2.0, "measures": ["withdrawal", "public_statement"]})
        # No article named covers every infringement; an unknown addressee is anyone; a ceiling of nothing is none
        self.assertEqual((second["documentId"], second["all"], second["addressee"], second["maxFinePercent"],
                          second["condition"]), (self.mica.id, True, "any", None, "for a repeated breach"))
        # A tier that is a periodic penalty alone covers any infringement, bound to its condition; with another
        # measure beside it the tier is for the articles it names
        self.assertEqual((compels["articles"], compels["all"], compels["condition"]),
                         ([], True, "not carrying out the instructions given under Article 59"))
        self.assertEqual((orders["articles"], orders["all"]), ([["59", "59"]], False))
        empty = LegalDocument.objects.get(id=self.plain.id).current_version.sanctions
        self.assertEqual((empty["tiers"], empty["promptVersionId"]), ([], None))

    def test_a_finding_is_shown_the_tier_that_covers_its_provision(self):
        tier = lambda where, act="this", articles=(), **more: {
            "provisionRef": "P1", "where": where, "infringedAct": act, "articles": list(articles), "all": not articles,
            "condition": "", "addressee": "legal", "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None,
            "measures": [], **more}
        with fake_models() as model:
            national = ingest_act(self.admin_client, NATIONAL, title="Kriptoturto rinkų įstatymas", short_title="KRĮ",
                                  jurisdiction="LT", language="lt", doc_type="law")
            model.tiers = [tier("3 d.", articles=["59"], maxFineEur=5000000, maxFinePercent=3),
                           tier("5 d.", articles=["59"], addressee="natural", maxFineEur=9000000),
                           tier("2 d.", addressee="any", measures=["public_statement"]),
                           tier("4 d.", articles=["59"], condition="sistemingas pažeidimas.", maxFineEur=10000000,
                                maxFinePercent=12.5),
                           tier("7 d.", condition="reikšmingų žetonų emitentams", maxFinePercent=15),
                           tier("6 d.", condition="nepateikus informacijos", maxFinePercent=0.5)]
            read_sanctions([self.mica])
            model.tiers = [tier("1 d.", act="Reglamentas (ES) 2023/1114", articles=["59"], maxFineEur=700000,
                                measures=["withdrawal"]),
                           tier("2 d.", act="Nežinomas aktas", articles=["1"], maxFineEur=1)]
            read_sanctions([national])
        foreign = LegalDocument.objects.get(id=national.id).current_version.sanctions["tiers"]
        self.assertEqual([(row["documentId"], row["infringedAct"]) for row in foreign],
                         [(self.mica.id, "Reglamentas (ES) 2023/1114"), (None, "Nežinomas aktas")])

        table = Consequences()
        # Another act's tiers reach a finding only when that act binds the company too
        self.assertEqual([c["act"] for c in table.of(self.mica.id, ["Art. 59"], within={self.mica.id, self.plain.id})],
                         ["MiCA", "MiCA"])
        shown = table.of(self.mica.id, ["Art. 59", "Art. 59(1)"], within={self.mica.id, national.id})
        # The act's own: the company's tier that names the article — never the person's — with the measures of
        # every tier that covers it; then the higher ceiling bound to a kind of breach; then the national law's
        self.assertEqual(shown, [
            {"act": "MiCA", "path": "Art. 111", "where": "3 d.", "condition": "", "maxFineEur": 5000000.0,
             "maxFinePercent": 3.0, "benefitMultiple": None, "persons": [], "measures": ["public_statement"],
             "measuresFrom": ["Art. 111 2 d."]},
            {"act": "MiCA", "path": "Art. 111", "where": "4 d.", "condition": "sistemingas pažeidimas",
             "maxFineEur": 10000000.0, "maxFinePercent": 12.5, "benefitMultiple": None, "persons": [], "measures": [],
             "measuresFrom": []},
            {"act": "KRĮ", "path": "15 str.", "where": "1 d.", "condition": "", "maxFineEur": 700000.0,
             "maxFinePercent": None, "benefitMultiple": None, "persons": [], "measures": ["withdrawal"], "measuresFrom": []}])
        # An article no tier names falls under the tiers for any infringement; beside a tier that names
        # the article (above) such a tier is not shown as its graver case
        self.assertEqual([(c["where"], c["condition"], c["measures"]) for c in table.of(self.mica.id, ["Art. 78"])],
                         [("7 d.", "reikšmingų žetonų emitentams", ["public_statement"])])
        self.assertEqual(table.of(self.plain.id, ["Art. 59"]), [])
        self.assertEqual(table.of(self.mica.id, ["ANNEX I", None]), table.of(self.mica.id, ["Art. 1"]))

        # In words, as the exports print it
        labels = LABELS["lt"]
        text = consequence_text(labels, SimpleNamespace(consequence=shown))
        self.assertEqual(text, (
            "bauda iki 5\u00a0000\u00a0000 EUR arba 3\u00a0% metinės apyvartos (pajamų); taip pat: viešas pranešimas apie "
            "pažeidimą (MiCA Art. 111 3 d., Art. 111 2 d.); "
            "bauda iki 10\u00a0000\u00a0000 EUR arba 12,5\u00a0% metinės apyvartos (pajamų) – sistemingas pažeidimas "
            "(MiCA Art. 111 4 d.); "
            "bauda iki 700\u00a0000 EUR; taip pat: leidimo panaikinimas ar sustabdymas (KRĮ 15 str. 1 d.)"))
        self.assertEqual(consequence_text(labels, SimpleNamespace(consequence=[])), "")

    def test_a_ceiling_given_in_separate_places_is_shown_whole(self):
        # A provision gives one ceiling in pieces — the sum in one point, the share of turnover in the next, the
        # multiple of the benefit in a paragraph of its own — and one reading kept them as one tier, the next as
        # three: the finding was shown the whole ceiling or only its sum
        tier = lambda where, articles=(), persons=(), **more: {
            "provisionRef": "P1", "where": where, "infringedAct": "this", "articles": list(articles), "all": not articles,
            "condition": "", "addressee": "legal", "persons": list(persons), "maxFineEur": None, "maxFinePercent": None,
            "benefitMultiple": None, "measures": [], **more}
        ceiling = lambda entry: (entry["where"], entry["maxFineEur"], entry["maxFinePercent"], entry["benefitMultiple"])

        def shown(path, *tiers):
            with fake_models() as model:
                model.tiers = list(tiers)
                read_sanctions([self.mica])
            return [ceiling(entry) for entry in Consequences().of(self.mica.id, [path])]

        whole = shown("Art. 59", tier("3 d. a–c p.", articles=["59"], maxFineEur=5000000, maxFinePercent=5, benefitMultiple=2))
        pieces = shown("Art. 59", tier("3 d. a p.", articles=["59"], maxFineEur=5000000),
                       tier("3 d. c p.", articles=["59"], maxFinePercent=5),
                       tier("2 d. d p.", articles=["59"], addressee="any", benefitMultiple=2),
                       tier("4 d.", articles=["59"], condition="sistemingas pažeidimas", maxFinePercent=12.5))
        self.assertEqual(whole, [("3 d. a–c p.", 5000000.0, 5.0, 2.0)])
        # The same ceiling either way, saying every place it was taken from; what is bound to a kind of
        # breach stays the graver case and gives the base nothing
        self.assertEqual(pieces, [("3 d. a p.; 3 d. c p.; 2 d. d p.", 5000000.0, 5.0, 2.0), ("4 d.", None, 12.5, None)])

        # Only what stands beside the base as its equal completes it: not the ceiling of certain persons, not one
        # bound to a kind of breach, not one of a tier for any infringement beside a tier that names the article
        self.assertEqual(shown("Art. 78", tier("7 d.", maxFineEur=1000000), tier("8 d.", persons=["emitentas"], maxFinePercent=9),
                               tier("9 d.", condition="pakartotinai", benefitMultiple=3)),
                         [("7 d.", 1000000.0, None, None), ("8 d.", None, 9.0, None)])
        self.assertEqual(shown("Art. 59", tier("3 d.", articles=["59"], maxFineEur=5000000), tier("7 d.", maxFinePercent=9)),
                         [("3 d.", 5000000.0, None, None)])
        # … and not what another provision states: two articles of an act set two ceilings
        apart = lambda path, where, **more: (True, {
            "act": "MiCA", "path": path, "where": where, "condition": "", "addressee": "legal", "persons": [],
            "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None, "measures": [], **more})
        self.assertEqual([ceiling(entry) for entry in sanctions._of_act([apart("Art. 111", "1 d.", maxFineEur=5000000.0),
                                                                         apart("Art. 112", "2 d.", maxFinePercent=5.0)])],
                         [("1 d.", 5000000.0, None, None)])

    def test_an_inserted_article_is_an_article_of_its_own(self):
        # An article reference was kept as its number and a finding's provision told by its first number: a tier
        # for an article inserted after another hung under every article of that number
        tier = lambda where, articles=(), **more: {
            "provisionRef": "P1", "where": where, "infringedAct": "this", "articles": list(articles), "all": not articles,
            "condition": "", "addressee": "legal", "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None,
            "measures": [], **more}
        ceilings = lambda act, *paths: [(c["where"], c["maxFineEur"]) for c in Consequences().of(act.id, list(paths))]
        with fake_models() as model:
            lettered = ingest_act(self.admin_client, WITH_PENALTIES.replace(
                "Article 78\n", "Article 59a\nNotification\n1. A provider shall notify the competent authority.\nArticle 78\n", 1),
                title="Markets in crypto-assets as amended", short_title="MiCA 2")
            inserted = ingest_act(self.admin_client, NATIONAL.replace(
                "15 straipsnis. Baudos\n", "9 straipsnis. Priežiūra\n1. Priežiūrą atlieka Lietuvos bankas.\n\n"
                "9(1) straipsnis. Pranešimai\n1. Teikėjas praneša Lietuvos bankui.\n\n15 straipsnis. Baudos\n", 1),
                title="Kriptoturto rinkų įstatymas", short_title="KRĮ", jurisdiction="LT", language="lt", doc_type="law")
            model.tiers = [tier("3 d.", articles=["59"], maxFineEur=5000000), tier("4 d.", articles=["59a"], maxFineEur=700000),
                           tier("5 d.", articles=["1-59"], maxFineEur=1000)]
            read_sanctions([lettered])
            # The act's own article of that number is one article; without one, a rising pair is a range
            model.tiers = [tier("1 d.", articles=["9-1"], maxFineEur=30000), tier("2 d.", articles=["1-9"], maxFineEur=2000)]
            read_sanctions([inserted])
        kept = lambda act: [row["articles"] for row in LegalDocument.objects.get(id=act.id).current_version.sanctions["tiers"]]
        self.assertEqual(kept(lettered), [[["59", "59"]], [["59a", "59a"]], [["1", "59"]]])
        self.assertEqual(kept(inserted), [[["9-1", "9-1"]], [["1", "9"]]])

        # Each article its own tier; a range ends with its last article, not with those inserted after it
        self.assertEqual(ceilings(lettered, "Art. 59(1)"), [("3 d.", 5000000.0)])
        self.assertEqual(ceilings(lettered, "Art. 59a"), [("4 d.", 700000.0)])
        self.assertEqual(ceilings(lettered, "Art. 1"), [("5 d.", 1000.0)])
        # The text parser raises the inserted number, the register's markup hyphenates it: one article either way
        self.assertTrue(LegalUnit.objects.filter(version_id=inserted.current_version_id, path="9¹ str.").exists())
        self.assertEqual(sanctions._key("9-1"), sanctions._key("9¹"))
        self.assertEqual(ceilings(inserted, "9¹ str. 1 d."), [("1 d.", 30000.0)])
        self.assertEqual(ceilings(inserted, "9-1 str."), [("1 d.", 30000.0)])
        self.assertEqual(ceilings(inserted, "9 str. 1 d."), [("2 d.", 2000.0)])

        # How a reference is read without the act's articles at hand
        known = {sanctions._key(number) for number in ("5", "5-7", "6", "7")}
        self.assertEqual(sanctions._span("5-7", known), ["5-7", "5-7"])
        self.assertEqual(sanctions._span("5-7"), ["5", "7"])
        self.assertEqual(sanctions._span("47-7"), ["47-7", "47-7"], "a range does not run backwards")
        self.assertEqual(sanctions._span("45a-45l"), ["45a", "45l"])
        self.assertIsNone(sanctions._span("59(1)"))

        # A reading kept from before article numbers were stored whole reaches every article of the number, as it did
        version = LegalDocument.objects.get(id=lettered.id).current_version
        old = [{**row, "articles": [[59, 59]]} for row in version.sanctions["tiers"][:1]]
        LegalDocumentVersion.objects.filter(id=version.id).update(sanctions={**version.sanctions, "tiers": old})
        self.assertEqual((ceilings(lettered, "Art. 59a"), ceilings(lettered, "Art. 59"), ceilings(lettered, "Art. 78")),
                         ([("3 d.", 5000000.0)], [("3 d.", 5000000.0)], []))

    def test_a_tier_that_binds_only_certain_persons_is_narrowed_to_their_provisions(self):
        # The fines of an article that binds only one kind of person, and names no article, were read as fines
        # for any infringement of the act and shown under all of it
        tier = lambda where, articles=(), persons=(), **more: {
            "provisionRef": "P1", "where": where, "infringedAct": "this", "articles": list(articles), "all": not articles,
            "condition": "", "addressee": "legal", "persons": list(persons), "maxFineEur": None, "maxFinePercent": None,
            "benefitMultiple": None, "measures": [], **more}
        now = utc_now()
        unit = lambda number: LegalUnit.objects.get(version_id=self.mica.current_version_id, unit_type="article", number=number)
        for index, (number, addressee) in enumerate([("59", "Kriptoturto paslaugų teikėjai"), ("78", "kriptoturto paslaugų teikėjas"),
                                                     ("1", "Reikšmingų žetonų emitentai ir siūlytojai"), ("1", "Emitentai")]):
            Obligation.objects.create(
                id=f"ob-{index}", source_kind="legal", document=self.mica, version_id=self.mica.current_version_id,
                unit=unit(number), title=f"Pareiga {index}", text="Tekstas", addressee=addressee, status="approved",
                citations=[{"unitId": unit(number).id, "path": unit(number).path}], created_at=now, updated_at=now)

        def read(*tiers):
            with fake_models() as model:
                model.tiers = list(tiers)
                read_sanctions([self.mica])
            kept = [(row["where"], row["articles"], row["all"], row["persons"])
                    for row in LegalDocument.objects.get(id=self.mica.id).current_version.sanctions["tiers"]]
            table = Consequences()
            return kept, lambda *paths: [(c["where"], c["persons"]) for c in table.of(self.mica.id, list(paths))]

        # The persons' obligations stand only in the tier's own part of the act — here the chapter of Articles 59, 78
        # and 111: a regime closed in one section. The tier covers the articles of those obligations and no other,
        # whatever the grammatical form of the names; one that names only the article it is written in names none
        providers = ["kriptoturto paslaugų teikėjas"]
        kept, shown = read(tier("6 d.", persons=providers, condition="nepateikus informacijos", maxFinePercent=10),
                           tier("9 d.", articles=["111"], persons=providers, maxFineEur=100000),
                           tier("8 d.", articles=["1"], persons=providers, maxFineEur=1))
        self.assertEqual(kept, [("6 d.", [], True, providers), ("9 d.", [], True, providers), ("8 d.", [["1", "1"]], False, [])],
                         "kept as read; a tier that lists its articles binds by them")
        self.assertEqual((shown("Art. 59"), shown("Art. 78")), ([("9 d.", providers), ("6 d.", providers)],) * 2)
        self.assertEqual((shown("Art. 1"), shown("Art. 111")), ([("8 d.", [])], []), "no longer a fine for any infringement of the act")

        # Persons whose obligations stand in other parts too keep their tier for any infringement, beside a fine for
        # whoever breaches the act or without one: an issuer of significant tokens is an issuer, and which kind a
        # company is the words do not tell. The finding is told whom the tier binds; the fine for whoever breaches
        # the act goes first, and a higher one for certain persons beside it
        significant, issuers = ["reikšmingo žetono emitentas"], ["emitentas"]
        kept, shown = read(tier("3 d.", maxFineEur=5000000),
                           tier("6 d.", persons=significant, condition="tyčia", maxFinePercent=12.5),
                           tier("7 d.", persons=["Sąjungos institucija"], maxFineEur=9000000))
        self.assertEqual([row[2] for row in kept], [True, True, True])
        self.assertEqual(shown("Art. 78"), [("3 d.", []), ("7 d.", ["Sąjungos institucija"])])
        _, shown = read(tier("6 d.", persons=issuers, maxFinePercent=5), tier("7 d.", persons=providers, maxFinePercent=2))
        self.assertEqual((shown("Art. 1"), shown("Art. 111")), ([("6 d.", issuers)],) * 2)
        self.assertEqual(shown("Art. 59"), [("7 d.", providers)], "narrowed to their part, the providers' tier names the article there")
        finding = SimpleNamespace(consequence=Consequences().of(self.mica.id, ["Art. 111"]))
        self.assertEqual(consequence_text(LABELS["lt"], finding),
                         "bauda iki 5\u00a0% metinės apyvartos (pajamų) – tik šiems asmenims: emitentas (MiCA Art. 111 6 d.)")
        self.assertEqual(consequence_text(LABELS["en"], finding),
                         "a fine of up to 5\u00a0% of annual turnover (income) – only for: emitentas (MiCA Art. 111 6 d.)")

        # Two ceilings for the same articles, each for a kind of person: the persons tell them apart and are kept,
        # and the finding is told whose ceiling it is shown. On a lone tier that names its articles they say
        # nothing the articles do not
        essential, important = ["esminis subjektas"], ["svarbus subjektas"]
        kept, shown = read(tier("4 d.", articles=["59", "78"], persons=essential, maxFineEur=10000000, maxFinePercent=2),
                           tier("5 d.", articles=["59", "78"], persons=important, maxFineEur=7000000, maxFinePercent=1.4),
                           tier("6 d.", articles=["1"], persons=providers, maxFineEur=5))
        self.assertEqual([row[3] for row in kept], [essential, important, []])
        self.assertEqual((shown("Art. 59"), shown("Art. 1")), ([("4 d.", essential)], [("6 d.", [])]))

        # What is too long to print is cut at a whole word and says so
        long = "kredito unija, kuri valdo tinklų ir informacines sistemas nepriklausomai nuo centrinės kredito unijos"
        self.assertEqual((sanctions._cut(long, 200), sanctions._cut(long, 60), sanctions._cut("  trumpas. ", 60)),
                         (long, "kredito unija, kuri valdo tinklų ir informacines sistemas…", "trumpas."))

        # How an addressee is told to name a kind of person
        named = sanctions._addressed
        self.assertTrue(named(["labai didelės interneto platformos paslaugos teikėjas"],
                              "Labai didelių interneto platformų ar labai didelių interneto paieškos sistemų paslaugų teikėjai"))
        self.assertTrue(named(["finansų įstaiga", "užsienio finansų įstaigos filialas"], "Finansų įstaigos ir kiti įpareigotieji subjektai"))
        self.assertFalse(named(["reikšmingo su turtu susieto žetono emitentas"], "su turtu susietų žetonų emitentas"))
        self.assertFalse(named(["mokėjimo paslaugų teikėjas"], "mokėtojo kriptoturto paslaugų tiekėjas"))
        self.assertFalse(named(["ir", ""], "bet kas"), "a kind of person without a word of its own names nobody")

    def test_the_article_that_lists_the_infringements_is_read_with_the_one_that_fines_them(self):
        # "The infringements referred to in Article 110" cannot be read without Article 110: the reading named
        # the list itself, where no obligation stands, and the act's findings were shown no ceiling
        with fake_models() as model:
            act = ingest_act(self.admin_client, WITH_A_LIST, title="Cyber resilience", short_title="CRA",
                             external_id="32024R2847")
            self.assertEqual([unit.path for unit in sanction_provisions(act)], ["Art. 110", "Art. 111"],
                             "the list a sanction article cites — not an article it cites that only mentions them")
            model.tiers = [{"provisionRef": "P2", "where": "1 d.", "infringedAct": "this", "articles": ["59", "78"], "all": False,
                            "condition": "", "addressee": "legal", "persons": [], "maxFineEur": 5000000, "maxFinePercent": None,
                            "benefitMultiple": None, "measures": []}]
            read_sanctions([act])
            asked = [prompt for name, prompt in model.calls if name == "sanctions"][-1]
        self.assertIn('<provision ref="P1" path="Art. 110" heading="Infringements">', asked)
        self.assertIn('<provision ref="P2" path="Art. 111" heading="Penalties">', asked)
        reading = LegalDocument.objects.get(id=act.id).current_version.sanctions
        self.assertEqual((reading["provisions"], [tier["path"] for tier in reading["tiers"]]),
                         (["Art. 110", "Art. 111"], ["Art. 111"]))

    def test_a_technical_standard_costs_what_the_article_it_was_adopted_under_costs(self):
        # A level 2 act has no sanction provisions; the second act of the fixture stands in for one
        tier = lambda where, articles=(), **more: {
            "provisionRef": "P1", "where": where, "infringedAct": "this", "articles": list(articles), "all": not articles,
            "condition": "", "addressee": "legal", "maxFineEur": None, "maxFinePercent": None, "benefitMultiple": None,
            "measures": [], **more}
        with fake_models() as model:
            model.tiers = [tier("3 d.", articles=["59"], maxFineEur=5000000), tier("7 d.", maxFinePercent=2)]
            read_sanctions([self.mica, self.plain])
        standard, parent = self.plain, self.mica

        def table(*articles):
            with mock.patch.object(sanctions, "adopted_under", return_value={standard.slug: (parent.slug, articles)}):
                return Consequences()

        # Whatever provision of the standard a finding cites, the answer is the parent article's, saying so
        through = table(59)
        own = through.of(parent.id, ["Art. 59"])
        self.assertEqual([entry["maxFineEur"] for entry in own], [5000000.0])
        shown = through.of(standard.id, ["Art. 1(2)", "ANNEX I"])
        self.assertEqual(shown, [{**entry, "via": {"act": "MiCA", "path": "Art. 59"}} for entry in own])
        self.assertEqual(consequence_text(LABELS["lt"], SimpleNamespace(consequence=shown)),
                         "bauda iki 5\u00a0000\u00a0000 EUR (MiCA Art. 111 3 d.) – šis aktas priimtas pagal MiCA Art. 59")
        self.assertEqual(consequence_text(LABELS["en"], SimpleNamespace(consequence=shown)),
                         "a fine of up to 5\u00a0000\u00a0000 EUR (MiCA Art. 111 3 d.) – this act was adopted under MiCA Art. 59")
        # The parent's own findings are answered as before, with no such note
        self.assertTrue(all("via" not in entry for entry in own))

        # Adopted under several articles: a consequence only when every one of them costs the same —
        # which of them a provision of the standard details is not recorded
        self.assertNotEqual(through.of(parent.id, ["Art. 59"]), through.of(parent.id, ["Art. 78"]))
        self.assertEqual(table(59, 78).of(standard.id, ["Art. 1"]), [])
        both = table(1, 78)
        self.assertEqual(both.of(standard.id, ["Art. 1"]),
                         [{**entry, "via": {"act": "MiCA", "path": "Art. 1, Art. 78"}} for entry in both.of(parent.id, ["Art. 78"])])
        # No link, no consequence — as before; and a parent the corpus does not hold links nothing
        self.assertEqual(Consequences().of(standard.id, ["Art. 1"]), [])
        with mock.patch.object(sanctions, "adopted_under", return_value={standard.slug: ("not-in-the-corpus", (59,))}):
            self.assertEqual(Consequences().of(standard.id, ["Art. 1"]), [])

    def test_every_level_2_act_of_the_catalogue_names_what_it_was_adopted_under(self):
        # The catalogue's key is what the code reads; the note beside it is what a person verified
        links = sanctions.adopted_under.__wrapped__()
        with open(sanctions.CATALOG, encoding="utf-8") as handle:
            entries = yaml.safe_load(handle)["acts"]
        slugs = {entry["slug"] for entry in entries}
        noted = {}
        for entry in entries:
            note = re.match(r"Level 2 of (\S+) \((?:RTS|ITS) under Art\. (.+?)\):", " ".join((entry.get("notes") or "").split()))
            if note:
                numbers = re.findall(r"(?:^|,\s*|and\s+)(\d+)", re.sub(r"\([^)]*\)", "", note.group(2)))
                noted[entry["slug"]] = (note.group(1).lower(), tuple(int(number) for number in numbers))
        self.assertEqual(len(links), 20)
        self.assertEqual(links, noted)
        self.assertTrue(all(parent in slugs for parent, _ in links.values()))

    def test_a_report_reads_what_it_assesses_and_only_a_person_writes_the_cause(self):
        company = self._company()
        with fake_models() as model:
            started = post_json(self.client_user, "/api/reports", {"companyId": company["id"], "language": "lt"})
            self.assertEqual(started.status_code, 201, started.content)
            drain()
            first_calls = sum(name == "sanctions" for name, _ in model.calls)
        report = Report.objects.get(id=started.json()["id"])
        self.assertEqual(report.status, "done", report.error)
        step = JobStep.objects.get(job=report.job, name="obligations")
        self.assertEqual((step.output["sanctionsRead"], first_calls), (2, 1))
        findings = list(Finding.objects.filter(report=report, short_title="MiCA"))
        self.assertTrue(findings)
        for finding in findings:
            cited = {citation["path"].split("(")[0] for citation in finding.citations}
            expected = [{"act": "MiCA", "path": "Art. 111", "where": "3 d.", "condition": "", "maxFineEur": 5000000.0,
                         "maxFinePercent": 3.0, "benefitMultiple": 2.0, "persons": [],
                         "measures": ["withdrawal", "public_statement"], "measuresFrom": []}] if "Art. 59" in cited else []
            self.assertEqual((finding.consequence, finding.cause), (expected, ""), finding.citations)
        self.assertTrue(any(finding.consequence for finding in findings), "a finding on Article 59 carries the tier")
        self.assertTrue(all(f.consequence == [] for f in Finding.objects.filter(report=report, short_title="DORA")))

        # The next report reads nothing anew
        with fake_models() as model:
            again = post_json(self.client_user, "/api/reports", {"companyId": company["id"], "language": "lt"})
            drain()
            self.assertEqual(sum(name == "sanctions" for name, _ in model.calls), 0)
        self.assertNotIn("sanctionsRead", JobStep.objects.get(job=Report.objects.get(id=again.json()["id"]).job,
                                                              name="obligations").output)

        finding = next(f for f in findings if f.consequence)
        path = f"/api/reports/{report.id}/findings/{finding.id}"
        listed = self.client_user.get(f"/api/reports/{report.id}").json()["findings"]
        shown = next(row for row in listed if row["id"] == finding.id)
        self.assertEqual((shown["consequence"][0]["maxFineEur"], shown["cause"]), (5000000.0, ""))
        self.assertEqual(patch_json(self.client_user, path, {"cause": 7}).json()["code"], "INVALID_FIELD")
        answer = patch_json(self.client_user, path, {"cause": "  Procedūra nebuvo atnaujinta po MiCA įsigaliojimo.  "})
        self.assertEqual((answer.status_code, answer.json()["cause"], answer.json()["overrideStatus"]),
                         (200, "Procedūra nebuvo atnaujinta po MiCA įsigaliojimo.", None))
        self.assertEqual(Finding.objects.get(id=finding.id).reviewed_by_id, self.user.id)
        self.assertTrue(AuditLog.objects.filter(action="reports.review_finding", target_id=finding.id,
                                                details__cause=True).exists())
        stranger = signed_in(create_user("kitas@knf.vu.lt"))
        self.assertEqual(patch_json(stranger, path, {"cause": "x"}).status_code, 404)

        # The exports say both: the cause the reviewer wrote and, for a gap, what a breach can cost
        Finding.objects.filter(id=finding.id).update(status="missing", override_status=None)
        report = Report.objects.get(id=report.id)
        page = render_html(report)
        self.assertIn("Priežastis:</span> Procedūra nebuvo atnaujinta po MiCA įsigaliojimo.", page)
        self.assertIn("Pasekmė:</span> bauda iki 5\u00a0000\u00a0000 EUR arba 3\u00a0% metinės apyvartos (pajamų) arba 2 kartų gautos naudos "
                      "ar išvengtų nuostolių; taip pat: leidimo panaikinimas ar sustabdymas, viešas pranešimas apie pažeidimą "
                      "(MiCA Art. 111 3 d.)", page)
        self.assertIn("tai riba, ne prognozė", page)
        sheet = load_workbook(io.BytesIO(render_xlsx(report)))["Išvados"]
        header = [cell.value for cell in sheet[1]]
        self.assertEqual(header[-2:], ["Pasekmė", "Priežastis"])
        row = next(row for row in sheet.iter_rows(min_row=2, values_only=True) if row[-1])
        self.assertTrue(row[-2].startswith("bauda iki 5\u00a0000\u00a0000 EUR"))
        self.assertEqual(row[-1], "Procedūra nebuvo atnaujinta po MiCA įsigaliojimo.")
        # What is met has no consequence to show — on the page and in the workbook alike
        Finding.objects.filter(id=finding.id).update(status="met")
        self.assertNotIn("Pasekmė:</span>", render_html(Report.objects.get(id=report.id)))
        sheet = load_workbook(io.BytesIO(render_xlsx(report)))["Išvados"]
        row = next(row for row in sheet.iter_rows(min_row=2, values_only=True) if row[-1])
        self.assertEqual((row[-2], row[-1]), (None, "Procedūra nebuvo atnaujinta po MiCA įsigaliojimo."))
        # A reviewer's verdict decides, not the model's: overridden to a gap, the ceiling shows again
        Finding.objects.filter(id=finding.id).update(override_status="partial")
        row = next(row for row in load_workbook(io.BytesIO(render_xlsx(report)))["Išvados"].iter_rows(min_row=2, values_only=True)
                   if row[-1])
        self.assertTrue(row[-2].startswith("bauda iki 5\u00a0000\u00a0000 EUR"))

    def test_the_command_queues_one_reading_of_the_acts_nobody_read(self):
        out = io.StringIO()
        call_command("read_sanctions", stdout=out)
        self.assertIn("Queued: 2 act(s) to read with corpus.sanctions v1 on ", out.getvalue())
        again = io.StringIO()
        call_command("read_sanctions", stdout=again)
        self.assertIn("already waiting", again.getvalue())
        with fake_models() as model:
            drain()
            self.assertEqual(sum(name == "sanctions" for name, _ in model.calls), 1)
        job = Job.objects.get(kind="corpus.read_sanctions")
        self.assertEqual((job.status, JobStep.objects.get(job=job).output), ("done", {"acts": 2, "read": 2, "tiers": 1}))
        done = io.StringIO()
        call_command("read_sanctions", stdout=done)
        self.assertIn("nothing to do", done.getvalue())
        named = io.StringIO()
        call_command("read_sanctions", self.mica.slug, "--again", stdout=named)
        self.assertIn("Queued: 1 act(s)", named.getvalue())
        with self.assertRaisesMessage(Exception, "No ingested act is called nonsense"):
            call_command("read_sanctions", "nonsense")
