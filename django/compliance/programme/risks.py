############################################################
#  [*] programme.risks — legal compliance risk: criteria,
#      scenarios and the register
#
#    generate(run) → the content as the model wrote it
#    validate(content, library, language, judge=None) → (content, checks)
#    band_of(score) → the band a score falls in
#
#  The product of the course's third assignment, built the
#  way its lecture builds a legal risk assessment (ISO 31022):
#
#  - the criteria: likelihood on five levels over four
#    dimensions (internal control, legal clarity and
#    supervisory practice, counterparties, frequency) and
#    impact on five levels over four (financial, supervisory
#    and licence, reputation, reach), worded and scaled for
#    this company;
#  - the appetite: the five bands of the 5×5 matrix — 1–3,
#    4–6, 8–12, 15–16, 20–25 — with what each means for the
#    company and who decides on a risk in it. The bands and
#    the responses each allows are the lecture's and are held
#    here, not asked of the model;
#  - the scenarios, each one sentence in the lecture's form —
#    a likely event, arising from a source, may cause
#    consequences that affect an objective — with its type of
#    legal risk (the six of ISO 31022 Annex A), the unit and
#    the internal policies it concerns, its legal basis, what
#    the company's documents and its latest report show, its
#    scores, and its treatment with owners and a deadline.
#    Together they are the register.
#
#  No level, score or band is taken from the model. The model
#  scores the eight dimensions of a scenario; the likelihood
#  is the mean of its four, rounded, the impact the highest
#  of its four (one catastrophic consequence is a catastrophic
#  impact, whatever the others), the score their product, the
#  band the score's.
#
#  The rules a register must keep, whoever wrote or edited
#  it: the criteria complete; at least five scenarios over at
#  least four types of legal risk; every scenario a whole
#  sentence with its four parts, tied to a unit and to a
#  policy of the library, with valid scores; no article named
#  that its act does not have. Warnings: a scenario without
#  an owner or a deadline, a response its band does not
#  allow, a sentence off the form, an unverifiable act, a
#  provision named for something else.
############################################################


from compliance.analysis.models import Finding
from compliance.programme.policy import report_brief
from compliance.programme.run import check
from compliance.prompts.schemas import FILLED


TITLE = {"lt": "Teisinės atitikties rizikos vertinimo kriterijai ir registras",
         "en": "Legal compliance risk criteria and register"}
NEEDS = ("policy", "governance")
# The steps of its generation, between reading the documents and checking the references
STEPS = ("criteria", "scenarios")

# level → (Lithuanian, English)
LIKELIHOOD = {1: ("Labai mažai tikėtina", "Very unlikely"), 2: ("Mažai tikėtina", "Unlikely"),
              3: ("Vidutiniškai tikėtina", "Possible"), 4: ("Tikėtina", "Likely"), 5: ("Beveik neabejotina", "Almost certain")}
IMPACT = {1: ("Nereikšmingas", "Insignificant"), 2: ("Mažas", "Minor"), 3: ("Vidutinis", "Moderate"),
          4: ("Didelis", "Major"), 5: ("Katastrofinis", "Catastrophic")}
LIKELIHOOD_DIMENSIONS = ("control", "clarity", "counterparty", "frequency")
IMPACT_DIMENSIONS = ("financial", "regulatory", "reputation", "reach")
RESPONSES = ("accept", "increase", "mitigate", "transfer", "avoid")
# band → (lowest score, highest score, Lithuanian, English, the responses it allows)
BANDS = {"negligible": (1, 3, "Nereikšminga", "Negligible", ("accept", "increase")),
         "tolerable": (4, 6, "Toleruotina", "Tolerable", ("accept", "mitigate")),
         "medium": (8, 12, "Vidutinė", "Medium", ("mitigate", "transfer")),
         "high": (15, 16, "Didelė", "High", ("mitigate", "avoid")),
         "critical": (20, 25, "Kritinė", "Critical", ("avoid",))}
# The types of legal risk of ISO 31022:2020 Annex A, and the
# lecture's typologies of sources, consequences and objectives
CATEGORIES = {1: ("Teisinės aplinkos nenuspėjamumas", "Unpredictability of the legal environment"),
              2: ("Taikytinų teisės aktų nesilaikymas", "Non-compliance with applicable laws"),
              3: ("Sutarties pažeidimas", "Breach of contract"),
              4: ("Trečiųjų asmenų teisių pažeidimas", "Infringement of rights"),
              5: ("Neveikimas įgyvendinant teises", "Omission in exercising rights"),
              6: ("Netinkamas pasirinkimas", "Improper choice")}
SOURCE_TYPES = {1: "regulators and legislators", 2: "contractual partners and suppliers", 3: "clients and consumer communities",
                4: "external malicious actors", 5: "governance, staff and culture",
                6: "internal processes, control systems and IT architecture"}
CONSEQUENCE_TYPES = {1: "direct financial", 2: "supervisory and licence", 3: "reputational and market",
                     4: "operational and business continuity", 5: "organisational and geographic scale"}
OBJECTIVE_TYPES = {1: "legal compliance and licence", 2: "strategy and business development",
                   3: "financial stability, capital and liquidity", 4: "operational resilience and continuity",
                   5: "reputation, trust and ESG"}
MIN_SCENARIOS, MIN_CATEGORIES = 5, 4
# The longest a band's decision and the calibration are kept:
# room for what the prompt asks for, so that a text is not
# cut in the middle of a word (300 and 1,500 characters were)
DECISION_CHARS, CALIBRATION_CHARS = 1_000, 4_000
# The words the lecture's sentence turns on, per language
FORM = {"lt": ("Tikėtin", "kylan", "gali sukelti", "paveik"), "en": ("likely", "arising from", "may cause", "affect")}

_LEVEL = {"type": "integer", "enum": [1, 2, 3, 4, 5]}
# A provision named as a legal basis, as in the policy: only
# the paragraph may be empty
_BASIS = {"type": "array", "items": {
    "type": "object", "additionalProperties": False, "required": ["act", "article", "paragraph", "why"],
    "properties": {"act": FILLED, "article": FILLED, "paragraph": {"type": "string"}, "why": FILLED}}}

CRITERIA_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["likelihood", "impact", "appetite", "calibration"],
    "properties": {
        # Five levels each, every cell said; one entry for each band of the matrix
        "likelihood": {"type": "array", "minItems": 5, "maxItems": 5, "items": {
            "type": "object", "additionalProperties": False, "required": ["level", *LIKELIHOOD_DIMENSIONS],
            "properties": {"level": _LEVEL, **{name: FILLED for name in LIKELIHOOD_DIMENSIONS}}}},
        "impact": {"type": "array", "minItems": 5, "maxItems": 5, "items": {
            "type": "object", "additionalProperties": False, "required": ["level", *IMPACT_DIMENSIONS],
            "properties": {"level": _LEVEL, **{name: FILLED for name in IMPACT_DIMENSIONS}}}},
        "appetite": {"type": "array", "minItems": len(BANDS), "maxItems": len(BANDS), "items": {
            "type": "object", "additionalProperties": False, "required": ["band", "comment", "decision"],
            "properties": {"band": {"type": "string", "enum": list(BANDS)}, "comment": FILLED,
                           "decision": FILLED}}},
        "calibration": FILLED,
    },
}

SCENARIOS_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["title", "scenarios"],
    "properties": {
        "title": FILLED,
        "scenarios": {"type": "array", "minItems": MIN_SCENARIOS, "items": {
            "type": "object", "additionalProperties": False,
            "required": ["area", "unit", "sentence", "event", "source", "consequences", "objective", "categories",
                         "sourceType", "consequenceType", "objectiveType", "legalBasis", "policyRefs",
                         "internalConclusion", "likelihood", "impact", "response", "actions", "owners", "deadline"],
            "properties": {
                "area": FILLED, "unit": FILLED, "sentence": FILLED,
                "event": FILLED, "source": FILLED, "consequences": FILLED,
                "objective": FILLED,
                "categories": {"type": "array", "minItems": 1, "maxItems": 2,
                               "items": {"type": "integer", "enum": list(CATEGORIES)}},
                "sourceType": {"type": "integer", "enum": list(SOURCE_TYPES)},
                "consequenceType": {"type": "integer", "enum": list(CONSEQUENCE_TYPES)},
                "objectiveType": {"type": "integer", "enum": list(OBJECTIVE_TYPES)},
                "legalBasis": _BASIS,
                # A scenario is tied to at least one of the company's documents (the rule "ties")
                "policyRefs": {"type": "array", "minItems": 1, "items": FILLED},
                "internalConclusion": {"type": "string"},
                "likelihood": {"type": "object", "additionalProperties": False, "required": [*LIKELIHOOD_DIMENSIONS, "why"],
                               "properties": {**{name: _LEVEL for name in LIKELIHOOD_DIMENSIONS}, "why": FILLED}},
                "impact": {"type": "object", "additionalProperties": False, "required": [*IMPACT_DIMENSIONS, "why"],
                           "properties": {**{name: _LEVEL for name in IMPACT_DIMENSIONS}, "why": FILLED}},
                "response": {"type": "string", "enum": list(RESPONSES)},
                "actions": {"type": "array", "items": {"type": "string"}},
                "owners": {"type": "array", "items": {"type": "string"}},
                "deadline": {"type": "string"},
            }}},
    },
}








############################################################
# band_of
############################################################
#
# The band of the matrix a score (likelihood × impact) falls
# in. The products of two levels never land between the
# bands' ranges; the upper bounds decide all the same.
#
# Used by:
#   - validate (below)
############################################################

def band_of(score):
    for band, (_, highest, *_rest) in BANDS.items():
        if score <= highest:
            return band
    return "critical"








############################################################
# _open_findings
############################################################
#
# The gravest open findings of the company's latest report,
# short enough for a prompt: what a scenario's internal
# conclusion can rest on.
#
# Used by:
#   - generate (below)
############################################################

def _open_findings(report, limit=36):
    if report is None:
        return "(no report)"
    weight = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    order = {"missing": 0, "partial": 1, "unknown": 2}
    rows = [f for f in Finding.objects.filter(report=report) if (f.override_status or f.status) in order]
    rows.sort(key=lambda f: (weight.get(f.severity, 4), order[f.override_status or f.status]))
    return "\n".join(
        f"- [{f.severity}/{f.override_status or f.status}] {f.short_title or f.document_title} "
        f"{', '.join(c.get('path', '') for c in f.citations)}: {f.obligation_title} — {f.analysis[:220]}"
        for f in rows[:limit]) or "(no open findings)"








############################################################
# _units
############################################################
#
# The units of the structure proposed for the company (the
# first line's, which own the risks), or that there is none
# yet and the documents' own units are to be used.
#
# Used by:
#   - generate (below)
############################################################

def _units(run):
    governance = run.earlier.get("governance")
    names = [node["name"] for node in (governance.content.get("structure") or [])
             if node.get("kind") in ("unit", "function")] if governance is not None else []
    return "\n".join(f"- {name}" for name in names) or "(no structure product yet — use the units the documents name)"








############################################################
# generate
############################################################
#
# The two calls, each a step of the job: the criteria and the
# appetite, then the scenarios scored against those criteria.
#
# Used by:
#   - programme/run.py — generate
############################################################

def generate(run):
    index = 0 if run.lt else 1
    company = run.company
    scale = (f"Size: {company.size_category}; employees: {company.employees if company.employees is not None else 'not stated'}; "
             f"annual turnover EUR: {company.annual_turnover_eur if company.annual_turnover_eur is not None else 'not stated'}")
    bands = "\n".join(f"- {band}: score {low}–{high} ({names[index]}); responses allowed: {', '.join(allowed)}"
                      for band, (low, high, *names, allowed) in BANDS.items())
    with run.step("criteria") as step:
        criteria = run.ask("programme.risk_criteria",
                           f"THE COMPANY'S SCALE\n{scale}\n\nTHE BANDS OF THE MATRIX (fixed)\n{bands}\n\n"
                           f"LATEST COMPLIANCE REPORT\n{report_brief(run.report, examples=1)}",
                           CRITERIA_SCHEMA, "risk_criteria", step)
        step.output = {"likelihood": len(criteria.get("likelihood", [])), "impact": len(criteria.get("impact", []))}
    with run.step("scenarios") as step:
        table = lambda rows, names: "\n".join(
            f"- {row.get('level')}: " + "; ".join(f"{name}: {row.get(name, '')}" for name in names) for row in rows)
        listing = "\n".join(f"- {ref}: {document.title}" for ref, document in run.document_refs.items())
        types = lambda mapping: "; ".join(f"{number} {names[index] if isinstance(names, tuple) else names}"
                                          for number, names in mapping.items())
        answer = run.ask("programme.risk_scenarios",
                         f"LIKELIHOOD CRITERIA (level: dimension: what the level means)\n"
                         f"{table(criteria.get('likelihood', []), LIKELIHOOD_DIMENSIONS)}\n\n"
                         f"IMPACT CRITERIA\n{table(criteria.get('impact', []), IMPACT_DIMENSIONS)}\n\n"
                         f"TYPES OF LEGAL RISK (categories)\n{types(CATEGORIES)}\n"
                         f"SOURCE TYPES\n{types(SOURCE_TYPES)}\nCONSEQUENCE TYPES\n{types(CONSEQUENCE_TYPES)}\n"
                         f"OBJECTIVE TYPES\n{types(OBJECTIVE_TYPES)}\n\n"
                         f"UNITS\n{_units(run)}\n\nTHE LIBRARY (policies a scenario can concern)\n{listing}\n\n"
                         f"GRAVEST OPEN FINDINGS OF THE LATEST REPORT\n{_open_findings(run.report)}",
                         SCENARIOS_SCHEMA, "risk_scenarios", step)
        scenarios = [{**row, "policies": [{"documentId": getattr(run.document(ref), "id", None)}
                                          for ref in row.get("policyRefs", [])]}
                     for row in answer.get("scenarios", [])]
        step.output = {"scenarios": len(scenarios)}
    return {"title": answer.get("title", ""),
            "criteria": {"likelihood": criteria.get("likelihood", []), "impact": criteria.get("impact", []),
                         "calibration": criteria.get("calibration", "")},
            "appetite": criteria.get("appetite", []), "scenarios": scenarios}








############################################################
# validate
############################################################
#
# Brings a register's content into its stored shape, works
# out every level, score and band, and checks the content
# against the rules of the kind — the model's answer and a
# person's edit alike. Scenarios are numbered anew in their
# order (LR-01 …); a policy that is no document of the
# company is dropped.
#
# Used by:
#   - programme/run.py — generate
#   - programme/api/views.py — a person's edit
############################################################

def validate(content, library, language, judge=None):
    index = 0 if language == "lt" else 1
    text = lambda value, limit=800: str(value or "").strip()[:limit]
    level = lambda value: value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 5 else 0


    # STEP 1: the criteria and the appetite, level by level and band by band
    # ======================================================================
    given = content.get("criteria") or {}

    def scale(rows, names, dimensions):
        by_level = {row.get("level"): row for row in rows or [] if isinstance(row, dict)}
        return [{"level": number, "name": names[number][index],
                 **{dimension: text((by_level.get(number) or {}).get(dimension), 500) for dimension in dimensions}}
                for number in range(1, 6)]

    likelihood = scale(given.get("likelihood"), LIKELIHOOD, LIKELIHOOD_DIMENSIONS)
    impact = scale(given.get("impact"), IMPACT, IMPACT_DIMENSIONS)
    stated = {row.get("band"): row for row in content.get("appetite") or [] if isinstance(row, dict)}
    appetite = [{"band": band, "name": names[index], "from": low, "to": high, "responses": list(allowed),
                 "comment": text((stated.get(band) or {}).get("comment")),
                 "decision": text((stated.get(band) or {}).get("decision"), DECISION_CHARS)}
                for band, (low, high, *names, allowed) in BANDS.items()]
    calibration = text(given.get("calibration"), CALIBRATION_CHARS)
    # What the tables must say: every cell of both scales, what each band means and who
    # decides on it, and how the scales were fitted — the assumptions about money are there
    blank = sum(not row[dimension] for row in likelihood for dimension in LIKELIHOOD_DIMENSIONS) \
        + sum(not row[dimension] for row in impact for dimension in IMPACT_DIMENSIONS) \
        + sum(not row[field] for row in appetite for field in ("comment", "decision")) + (not calibration)


    # STEP 2: every provision the scenarios name, looked up together
    # ==============================================================
    rows = [row for row in content.get("scenarios") or [] if isinstance(row, dict)]
    named = [[entry for entry in row.get("legalBasis") or [] if isinstance(entry, dict)] for row in rows]
    looked_up = iter(library.provisions([entry for entries in named for entry in entries], judge))
    kept = lambda entry: str(entry.get("act", "")).strip() and str(entry.get("article", "")).strip()
    bases = [[next(looked_up) for entry in entries if kept(entry)] for entries in named]
    every = [entry for basis in bases for entry in basis]
    wrong = sorted({f"{entry['shortTitle']} {entry['article']}" for entry in every if entry["status"] == "not_found"})
    unverified = sorted({entry["act"] for entry in every if entry["status"] == "act_not_in_corpus"})
    mismatched = sorted({f"{entry['shortTitle']} {entry['path']}" for entry in every if entry["match"] == "mismatch"})


    # STEP 3: the scenarios, scored
    # =============================
    scenarios, broken, untied, unscored, unowned, unfit, off_form = [], [], [], [], [], [], []
    for number, (row, basis) in enumerate(zip(rows, bases), 1):
        name = f"LR-{number:02d}"
        slots = {slot: text(row.get(slot), 600) for slot in ("event", "source", "consequences", "objective")}
        sentence = text(row.get("sentence"), 1500)
        policies = [{"documentId": d.id, "document": d.title}
                    for d in (library.by_id.get(entry.get("documentId")) for entry in row.get("policies") or []
                              if isinstance(entry, dict)) if d is not None]
        chance = {dimension: level((row.get("likelihood") or {}).get(dimension)) for dimension in LIKELIHOOD_DIMENSIONS}
        harm = {dimension: level((row.get("impact") or {}).get(dimension)) for dimension in IMPACT_DIMENSIONS}
        scored = all(chance.values()) and all(harm.values())
        # The likelihood is the mean of its dimensions, halves up; the impact the gravest of its dimensions
        t = int(sum(chance.values()) / len(chance) + 0.5) if scored else 0
        p = max(harm.values()) if scored else 0
        band = band_of(t * p) if scored else None
        response = row.get("response") if row.get("response") in RESPONSES else "mitigate"
        owners = [text(owner, 200) for owner in row.get("owners") or [] if text(owner)]
        if not sentence or not all(slots.values()):
            broken.append(name)
        if not text(row.get("unit")) or not policies:
            untied.append(name)
        if not scored:
            unscored.append(name)
        if not owners or not text(row.get("deadline")):
            unowned.append(name)
        if band and response not in BANDS[band][4]:
            unfit.append(name)
        if sentence and not all(marker.lower() in sentence.lower() for marker in FORM[language if language in FORM else "en"]):
            off_form.append(name)
        scenarios.append({
            "id": name, "area": text(row.get("area"), 300), "unit": text(row.get("unit"), 200), "sentence": sentence, **slots,
            "categories": sorted({c for c in row.get("categories") or [] if c in CATEGORIES})[:2],
            "sourceType": row.get("sourceType") if row.get("sourceType") in SOURCE_TYPES else None,
            "consequenceType": row.get("consequenceType") if row.get("consequenceType") in CONSEQUENCE_TYPES else None,
            "objectiveType": row.get("objectiveType") if row.get("objectiveType") in OBJECTIVE_TYPES else None,
            "legalBasis": basis, "policies": policies, "internalConclusion": text(row.get("internalConclusion"), 1200),
            "externalConclusion": text(row.get("externalConclusion"), 1200),
            "likelihood": {**chance, "level": t, "why": text((row.get("likelihood") or {}).get("why"), 600)},
            "impact": {**harm, "level": p, "why": text((row.get("impact") or {}).get("why"), 600)},
            "score": t * p, "band": band, "response": response,
            "actions": [text(action, 500) for action in row.get("actions") or [] if text(action)],
            "owners": owners, "deadline": text(row.get("deadline"), 60)})
    kinds = {category for scenario in scenarios for category in scenario["categories"]}
    checks = [
        check("criteria", not blank, str(blank) if blank else ""),
        check("scenarios", len(scenarios) >= MIN_SCENARIOS, str(len(scenarios))),
        check("categories", len(kinds) >= MIN_CATEGORIES, ", ".join(str(kind) for kind in sorted(kinds))),
        check("sentence", not broken, ", ".join(broken)),
        check("ties", not untied, ", ".join(untied)),
        check("scores", not unscored, ", ".join(unscored)),
        check("provisions", not wrong, ", ".join(wrong)),
        check("provisions_unverified", not unverified, ", ".join(unverified), blocking=False),
        check("provision_subjects", not mismatched, ", ".join(mismatched), blocking=False),
        check("owners", not unowned, ", ".join(unowned), blocking=False),
        check("response_fit", not unfit, ", ".join(unfit), blocking=False),
        check("sentence_form", not off_form, ", ".join(off_form), blocking=False),
    ]
    return ({"title": text(content.get("title"), 300),
             "criteria": {"likelihood": likelihood, "impact": impact, "calibration": calibration},
             "appetite": appetite, "scenarios": scenarios}, checks)
