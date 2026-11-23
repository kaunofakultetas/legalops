############################################################
#  [*] Test fakes — a model and an embedder without a network
#
#    with fake_models():   # patches gateway.generate/embed
#        run_once(heartbeat=False)
#
#  The embedder hashes words into a 1536-wide bag of words,
#  so texts sharing words are near each other and the hybrid
#  searches behave like the real thing. The model reads the
#  refs the pipeline put into its prompt (<act ref="A1">,
#  <provision ref="P1">, <obligation ref="O2">, [F3],
#  <citation ref="C1">, <document ref="D1">) and answers each
#  strict schema with plausible content — the pipeline's
#  parsing, joining and storage run for real. Every act
#  applies unless a test says otherwise (FakeModel.verdicts);
#  every finding quotes the first line of the first document
#  it was shown — and a sentence no document holds, which the
#  pipeline must not be able to place; every planning call
#  answers one action that closes its first three findings.
#  Asked for a standard's outline, it marks the lines that
#  open with a control code and those printed in capitals.
#  Every document's inventory cites CITATIONS; the citation
#  judge reads what each block claims and the provision's
#  real heading and decides by the words.
############################################################


import hashlib
import math
import re
from contextlib import contextmanager
from unittest import mock


from compliance.assistant import gateway


WORD = re.compile(r"\w{3,}", re.UNICODE)
DIMENSIONS = 1536

# How a control's line opens in the test frameworks: a
# family code and a number, or an enhancement's number in
# brackets
OUTLINE_CODE = re.compile(r"^((?:[A-Z]{2}\.)?[A-Z]{2}-\d+|\(\d+\))[:.]? ")

# The finding statuses the fake gap analysis cycles through
STATUS_CYCLE = ("missing", "partial", "met", "unknown")

# The references every fake inventory finds — against the
# test corpus (MiCA with Articles 1, 59 and 78) one of each
# verdict: right, wrong (MiCA named by its number, so the
# CELEX lookup finds it), no such article, act not in the
# corpus
CITATIONS = (
    {"act": "MiCA", "article": "59", "paragraph": "", "point": "",
     "claim": "Authorisation of crypto-asset service providers",
     "quote": "Įmonė veikia turėdama leidimą pagal MiCA 59 straipsnį."},
    {"act": "Regulation (EU) 2023/1114", "article": "78", "paragraph": "", "point": "",
     "claim": "Advice on crypto-assets", "quote": "Konsultavimą reglamentuoja Reglamento (ES) 2023/1114 78 str."},
    {"act": "MiCA", "article": "81", "paragraph": "", "point": "",
     "claim": "Portfolio management", "quote": "MiCA 81 str."},
    {"act": "DORA", "article": "5", "paragraph": "", "point": "",
     "claim": "ICT risk management governance", "quote": "DORA 5 str."},
)








############################################################
# embed_text
############################################################
#
# One normalised bag-of-words vector.
#
# Used by:
#   - fake_embed (below)
############################################################

def embed_text(text):
    vector = [0.0] * DIMENSIONS
    for word in WORD.findall(text.lower()):
        vector[int(hashlib.md5(word.encode()).hexdigest(), 16) % DIMENSIONS] += 1.0
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]








############################################################
# fake_embed
############################################################
#
# Used by:
#   - fake_models (below)
############################################################

def fake_embed(texts, model=None, timeout=None, retries=None):
    return gateway.EmbedResult(embeddings=[embed_text(t) for t in texts], model="gateway:fake-embed",
                               dimensions=DIMENSIONS, tokens=sum(len(t.split()) for t in texts), duration_ms=1)








############################################################
# FakeModel
############################################################
#
# gateway.generate's stand-in; `calls` records (schema_name,
# what the model was given to read) for assertions — a
# step's shared data, when it has any, then the call's own;
# `shared` records (schema_name, the shared data) alone and
# `instructions` (schema_name, the rendered prompt) — what a
# test reads to see that every placeholder was filled.
# `extra_headings` are entries a test adds to every outline
# answer — what a model might invent. `verdicts` maps an
# act's short title to the fields that replace its default
# "applies" verdict, `scopes` an act's short title to the
# institution types its scope provisions are read as covering
# (nobody, unless a test says otherwise), `checks` an
# obligation's title to the judge's verdict on it (supported,
# unless a test says otherwise), `tiers` what an act's
# sanction provisions are read as laying down (one tier for
# a company on Article 59, unless a test says otherwise),
# `requirements` how many requirements a policy document is
# read as setting (three, one of them unusable).
#
# Used by:
#   - fake_models (below)
############################################################

class FakeModel:

    def __init__(self):
        self.calls = []
        self.shared = []
        self.instructions = []
        self.extra_headings = []
        self.verdicts = {}
        self.scopes = {}
        self.requirements = 3
        self.tiers = [{"provisionRef": "P1", "where": "3 d.", "infringedAct": "this", "articles": ["59"], "all": False,
                       "condition": "", "addressee": "legal", "maxFineEur": 5000000, "maxFinePercent": 3, "benefitMultiple": 2,
                       "measures": ["withdrawal", "public_statement"]}]
        self.checks = {}






    ############################################################
    # __call__
    ############################################################
    #
    # Dispatches on the schema name the pipeline asked for.
    #
    # Used by:
    #   - every patched gateway.generate call
    ############################################################

    def __call__(self, prompt, *, system=None, shared=None, model=None, schema=None, schema_name="result",
                 temperature=None, max_output_tokens=None, timeout=None, retries=None, patient=None):
        if shared:
            self.shared.append((schema_name, shared))
            prompt = f"{shared}\n\n{prompt}"
        self.calls.append((schema_name, prompt))
        self.instructions.append((schema_name, system or ""))
        answer = getattr(self, f"_{schema_name}", lambda p: {})(prompt)
        return gateway.GenerateResult(text=None, object=answer, model="gateway:fake-model", finish_reason="stop",
                                      input_tokens=len(prompt) // 4, output_tokens=200, reasoning_tokens=0,
                                      duration_ms=5)






    ############################################################
    # _inventory / _scope / _applicability / _obligations /
    # _checks / _requirements / _outline / _findings /
    # _action_plan / _plan_merge / _summary / _verdicts /
    # _policy / _documents / _structure / _raci /
    # _risk_criteria / _risk_scenarios
    ############################################################
    #
    # One answer per strict schema.
    #
    # Used by:
    #   - __call__ (above)
    ############################################################

    def _inventory(self, prompt):
        return {"documentType": "policy", "summary": "Atitikties politika.", "scope": "Visa įmonė",
                "controls": [{"name": "Atitikties pareigūnas", "description": "Paskirtas pareigūnas",
                              "quote": "Atitikties pareigūnas atsiskaito valdybai"}],
                "roles": ["Valdyba"], "registers": [], "approval": "", "reviewCycle": "kasmet",
                "lawsReferenced": ["MiCA"], "citations": [dict(c) for c in CITATIONS],
                "weaknesses": ["Nėra patvirtinimo datos"]}

    def _scope(self, prompt):
        acts = re.findall(r'<act ref="(A\d+)" title="[^"]*" short="([^"]*)"', prompt)
        return {"acts": [{"actRef": ref, "institutionTypes": list(self.scopes.get(short, ())),
                          "reasoning": "Art. 2 names whom the act covers."} for ref, short in acts]}

    def _internal_requirements(self, prompt):
        title = re.search(r'<document title="([^"]*)"', prompt).group(1)
        first = re.search(r'<document [^>]*>\n([^\n]+)', prompt).group(1)
        return {"requirements": [
            {"title": f"Peržiūrėti prieigos teises ({title})", "text": "Prieigos teisės peržiūrimos kas pusmetį.",
             "section": "5.2", "quote": first[:80], "addressee": "Sistemos savininkas", "category": "ict_security",
             "severity": "high"},
            {"title": "Tikrinti atsargines kopijas", "text": "Atsarginės kopijos atkuriamos bandomuoju būdu kas ketvirtį.",
             "section": "", "quote": "Šio sakinio dokumente nėra.", "addressee": "", "category": "nonsense",
             "severity": "urgent"},
            {"title": "", "text": "Be pavadinimo – praleidžiama.", "section": "", "quote": "", "addressee": "",
             "category": "other", "severity": "low"}][:self.requirements]}

    def _sanctions(self, prompt):
        return {"tiers": [dict(tier) for tier in self.tiers], "note": ""}

    def _applicability(self, prompt):
        acts = re.findall(r'<act ref="(A\d+)" title="[^"]*" short="([^"]*)"', prompt)
        return {"acts": [{"actRef": ref, "applicability": "applies", "confidence": 0.9,
                          "effect": "direct", "reasoning": "Įmonė teikia kriptoturto paslaugas.", "conditionsToVerify": "",
                          "appliesFrom": "", "provisionRefs": [f"{ref}.P1"], **self.verdicts.get(short, {})}
                         for ref, short in acts]}

    def _obligations(self, prompt):
        refs = re.findall(r'<provision ref="(P\d+)"', prompt)
        return {"obligations": [{
            "title": f"Gauti leidimą ({ref})", "titleEn": f"Obtain authorisation ({ref})",
            "text": "Kriptoturto paslaugų teikėjas privalo turėti leidimą.", "textEn": "A CASP must be authorised.",
            "addressee": "kriptoturto paslaugų teikėjas", "conditions": "", "appliesTo": ["casp"],
            "category": "licensing", "evidence": "Lietuvos banko leidimas", "deadline": "",
            "severity": "critical", "provisionRefs": [ref]} for ref in refs[:2]]}

    def _checks(self, prompt):
        entries = re.findall(r'<obligation ref="(O\d+)"[^>]*>\nTitle: ([^\n]*)', prompt)
        return {"checks": [{"obligationRef": ref, "verdict": "supported", "issue": "none", "note": "",
                            **self.checks.get(title, {})} for ref, title in entries]}

    def _policy(self, prompt):
        keys = re.findall(r"^- (\w+) — \"", prompt, re.MULTILINE)
        return {"title": "UAB Kripto atitikties politika", "parts": [{
            "key": key, "text": f"Bendrovė įsipareigoja laikytis reikalavimų ({key}). " * 6,
            "decisions": ["Kam atskaitingas atitikties pareigūnas"] if key == "mandate" else [],
            "sources": [{"documentRef": "D1", "quote": "Atitikties pareigūnas atsiskaito valdybai"}],
            "legalBasis": [{"act": "MiCA", "article": "1 straipsnis", "paragraph": "", "why": "subject matter"}]} for key in keys]}

    def _documents(self, prompt):
        refs = re.findall(r"^- (D\d+): ", prompt, re.MULTILINE)
        return {"hierarchy": [{"documentRef": ref, "level": 2, "topic": "atitiktis", "note": ""} for ref in refs],
                "missing": [{"level": 3, "title": "Pranešimų apie pažeidimus nagrinėjimo tvarka",
                             "purpose": "Nustato, kaip priimami ir nagrinėjami pranešimai.", "supports": "whistleblowing",
                             "priority": "high", "legalBasis": [{"act": "MiCA", "article": "999", "paragraph": "", "why": "no such article"}],
                             "partlyCoveredBy": refs[:1]}]}

    def _structure(self, prompt):
        node = lambda i, name, kind, line, parent, proposed=False: {
            "id": f"n{i}", "name": name, "kind": kind, "line": line, "parentId": parent, "proposed": proposed, "note": ""}
        return {"title": "UAB Kripto valdymo struktūra",
                "positions": [{"name": "Atitikties pareigūnas", "unit": "", "line": "second", "duties": "Atsiskaito valdybai.",
                               "sources": [{"documentRef": "D1", "quote": "Atitikties pareigūnas atsiskaito valdybai"}]}],
                "gaps": [{"role": "Vidaus auditas", "line": "third", "why": "Dokumentuose nenurodytas nepriklausomas patikinimas."}],
                "structure": [node(1, "Valdyba", "body", "governing", ""), node(2, "Vadovas", "function", "first", "n1"),
                              node(3, "Veiklos padalinys", "unit", "first", "n2"),
                              node(4, "Atitikties pareigūnas", "function", "second", "n1"),
                              node(5, "Vidaus auditas", "function", "third", "n1", True)]}

    def _raci(self, prompt):
        steps = [{"id": f"s{i}", "name": name, "description": "Aprašymas.", "frequency": "kasmet",
                  "basis": [{"source": "ISO 37301", "ref": clause}]}
                 for i, (name, clause) in enumerate((("Teisės aktų pokyčių stebėjimas", "4.5"),
                                                     ("Atitikties rizikos vertinimas", "4.6"),
                                                     ("Kontrolės priemonių nustatymas", "8.2"),
                                                     ("Stebėsena ir testavimas", "9.1"),
                                                     ("Ataskaitų teikimas valdybai", "9.1.4"),
                                                     ("Taisomųjų veiksmų stebėjimas", "10.2")), 1)]
        return {"steps": steps,
                "raci": [cell for step in steps for cell in ({"stepId": step["id"], "roleId": "n4", "value": "R"},
                                                             {"stepId": step["id"], "roleId": "n1", "value": "A"},
                                                             {"stepId": step["id"], "roleId": "n2", "value": "C"})]}

    def _risk_criteria(self, prompt):
        return {"likelihood": [{"level": n, "control": f"kontrolė {n}", "clarity": f"aiškumas {n}",
                                "counterparty": f"kontrahentai {n}", "frequency": f"dažnumas {n}"} for n in range(1, 6)],
                "impact": [{"level": n, "financial": f"iki {n} % pajamų", "regulatory": f"priežiūra {n}",
                            "reputation": f"reputacija {n}", "reach": f"mastas {n}"} for n in range(1, 6)],
                "appetite": [{"band": band, "comment": f"Komentaras ({band}).", "decision": "Sprendžia valdyba."}
                             for band in ("negligible", "tolerable", "medium", "high", "critical")],
                "calibration": "Pritaikyta mažai bendrovei; apyvarta nenurodyta."}

    def _risk_scenarios(self, prompt):
        scenario = lambda category: {
            "area": "Kriptoturto saugojimas", "unit": "Technologijų padalinys",
            "sentence": "Tikėtinas raktų praradimas, kylantis iš silpnos prieigos kontrolės, gali sukelti klientų "
                        "reikalavimus, kurie paveiks veiklos leidimą.",
            "event": "raktų praradimas", "source": "silpna prieigos kontrolė", "consequences": "klientų reikalavimai",
            "objective": "veiklos leidimas", "categories": [category], "sourceType": 6, "consequenceType": 2,
            "objectiveType": 1, "legalBasis": [{"act": "MiCA", "article": "1", "paragraph": "", "why": "subject matter"}],
            "policyRefs": ["D1"], "internalConclusion": "Politika nenustato raktų atkūrimo.",
            "likelihood": {"control": 3, "clarity": 2, "counterparty": 2, "frequency": 3, "why": "Kontrolė dalinė."},
            "impact": {"financial": 2, "regulatory": 4, "reputation": 3, "reach": 2, "why": "Galimi veiklos apribojimai."},
            "response": "mitigate", "actions": ["Parengti raktų valdymo procedūrą."], "owners": ["CTO"],
            "deadline": "2027 Q1"}
        return {"title": "UAB Kripto teisinės rizikos registras", "scenarios": [scenario(c) for c in (1, 2, 3, 4, 2)]}

    def _requirements(self, prompt):
        refs = re.findall(r'<provision ref="(P\d+)"', prompt)
        return {"requirements": [{
            "title": f"Įgyvendinti reikalavimą ({ref})", "titleEn": f"Implement the requirement ({ref})",
            "text": "Organizacija turi nustatyti ir taikyti procesą.", "textEn": "The organization shall apply a process.",
            "addressee": "organizacija", "conditions": "", "category": "governance",
            "evidence": "dokumentuota informacija", "deadline": "", "severity": "high",
            "provisionRefs": [ref]} for ref in refs[:3]]}

    def _outline(self, prompt):
        headings = list(self.extra_headings)
        for number, text in re.findall(r"(?m)^L(\d+)\| (.*)$", prompt):
            code = OUTLINE_CODE.match(text)
            if code:
                headings.append({"line": int(number), "lastLine": int(number), "identifier": code.group(1),
                                 "level": 3 if code.group(1).startswith("(") else 2})
            elif text.isupper() and len(text) <= 60 and len(text.split()) >= 2 and not re.search(r"\d", text):
                headings.append({"line": int(number), "lastLine": int(number), "identifier": "", "level": 1})
        return {"headings": headings}

    def _findings(self, prompt):
        refs = re.findall(r'<obligation ref="(O\d+)"', prompt)
        evidence = [{"ref": "C1", "quote": "CASP licencija"}]
        document = re.search(r'<document ref="(D\d+)"[^>]*>\n([^\n]+)', prompt)
        if document:
            evidence += [{"ref": document.group(1), "quote": f"„{document.group(2)[:60]}“"},
                         {"ref": document.group(1), "quote": "Šio sakinio dokumente nėra."}]
        return {"findings": [{
            "obligationRef": ref, "status": STATUS_CYCLE[i % len(STATUS_CYCLE)],
            "analysis": "Leidimo įrodymo nėra.", "recommendation": "Pateikti paraišką Lietuvos bankui.",
            "evidence": [dict(e) for e in evidence]} for i, ref in enumerate(refs)]}

    def _action_plan(self, prompt):
        # One action a call, named for what the call was given; it
        # closes the first three findings and leaves the rest to
        # the pipeline's own completion
        refs = re.findall(r"\[(F\d+)\]", prompt)
        title = ("Pataisyti nuorodas į teisės aktus" if "CITATION PROBLEMS" in prompt
                 else "Išsiaiškinti, ar aktai taikomi" if "ACTS TO CONFIRM" in prompt else "Parengti leidimo paraišką")
        return {"actions": [{"title": title, "description": "Paraiška Lietuvos bankui.",
                             "effort": "high", "timeframe": "immediate",
                             "ownerRole": "Valdyba", "category": "licensing", "findingRefs": refs[:3]}]}

    def _plan_merge(self, prompt):
        # Merges nothing: every draft stays the action it was
        return {"actions": []}

    def _summary(self, prompt):
        return {"title": "Atitikties vertinimas", "summary": "**Bendras vertinimas** — trūksta leidimo."}

    def _verdicts(self, prompt):
        # A claim matches when it holds every word of the real
        # heading ("Authorisation" ⊂ "Authorisation of crypto-asset
        # service providers"), else it names something else
        blocks = re.findall(r'<citation ref="(C\d+)"[^>]*>\nClaimed subject: (.*)\nActual heading: (.*)\n', prompt)
        verdicts = []
        for ref, claim, heading in blocks:
            words = {w.casefold() for w in re.findall(r"\w{4,}", heading)}
            matched = bool(words) and words <= {w.casefold() for w in re.findall(r"\w{4,}", claim)}
            verdicts.append({"ref": ref, "verdict": "match" if matched else "mismatch",
                             "note": "Matches the provision." if matched else "Execution of orders."})
        return {"verdicts": verdicts}








############################################################
# fake_models
############################################################
#
# Patches gateway.generate and gateway.embed (and the price
# table) for the duration; yields the FakeModel. The report
# pipeline's parallel_map runs in the test's own thread
# meanwhile: a TestCase keeps its rows in one uncommitted
# transaction, which a worker thread's own connection cannot
# see (a step with two model calls would find no prompt). What
# runs is the same code, one item at a time.
#
# Used by:
#   - every test that ingests an act or runs a report
############################################################

@contextmanager
def fake_models():
    model = FakeModel()
    with mock.patch.object(gateway, "generate", side_effect=model), \
            mock.patch.object(gateway, "embed", side_effect=fake_embed), \
            mock.patch("compliance.assistant.usage.price_table", return_value={}), \
            mock.patch("compliance.analysis.pipeline.parallel_map",
                       side_effect=lambda fn, items, workers=4: [fn(item) for item in items]):
        yield model
