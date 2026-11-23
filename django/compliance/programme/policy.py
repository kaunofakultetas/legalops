############################################################
#  [*] programme.policy — the compliance policy and the
#      documents it still needs
#
#    generate(run) → the content as the model wrote it
#    validate(content, library, language) → (content, checks)
#    report_brief(report) → what the latest report found, for a prompt
#
#  The first product of the course's second assignment. Two
#  calls over the company's whole library:
#
#  - the policy itself, in the eight parts the task fixes —
#    purpose and fit, the management's commitment, the
#    compliance function's mandate, the commitment to comply
#    and improve, roles by the three lines, the core
#    processes, reporting of breaches, consequences. It is the
#    organisation's first-level document: why and what, with
#    the how left to the documents below it. What the
#    governing body has yet to decide is marked in the text
#    and listed (`decisions`), never invented;
#  - every document of the library placed on its level (1 the
#    policy and the code of conduct, 2 thematic policies, 3
#    procedures and instructions; 0 for a text that is no rule
#    at all), and the second- and third-level documents the
#    company lacks for the policy to work, each with the
#    provision that asks for it.
#
#  The rules a policy must keep, whoever wrote or edited it:
#  all eight parts written; no article named that its act
#  does not have (an act the corpus does not hold cannot be
#  checked here — a warning); no provision named for
#  something it does not regulate (a warning, from the
#  citation judge); every quote
#  in the document it names (a warning);
#  every document of the library placed (a warning — a
#  document uploaded later is not).
############################################################


import json


from compliance.analysis.models import Finding, ReportAct
from compliance.programme.run import check
from compliance.prompts.schemas import FILLED


TITLE = {"lt": "Atitikties politika", "en": "Compliance policy"}
NEEDS = ()
# The steps of its generation, between reading the documents and checking the references
STEPS = ("policy", "document_gaps")
# The longest a part's text is kept
PART_CHARS = 12_000

# key → (Lithuanian heading, English heading, what the part covers)
PARTS = (
    ("purpose", "Įvadas: tikslas, apimtis ir tinkamumas", "Introduction: purpose, scope and fit",
     "why the policy exists, whom and what it covers, and how it is fitted to the organisation's size and risk "
     "profile (proportionality)"),
    ("commitment", "Vadovybės įsipareigojimas ir sąsajos su vertybėmis", "Management commitment and values",
     "the tone at the top: the governing body's and the managers' commitment, ethics and compliance before "
     "commercial gain"),
    ("mandate", "Atitikties funkcijos įgaliojimai (mandatas)", "Mandate of the compliance function",
     "structural and operational independence, the right to all information and to investigate breaches, direct "
     "access to the governing body, the guarantee of adequate resources"),
    ("compliance", "Įsipareigojimas laikytis reikalavimų ir nuolatinis tobulėjimas",
     "Commitment to comply and to improve continually",
     "the commitment to meet every applicable requirement, mandatory and voluntary, and to improve the compliance "
     "system continually"),
    ("roles", "Rolių ir atsakomybių apibrėžimas", "Roles and responsibilities",
     "the three lines: the first manages risk, the second oversees and advises, the third gives independent "
     "assurance; what the governing body, the managers and every employee answer for"),
    ("processes", "Pagrindiniai atitikties procesai", "Core compliance processes",
     "compliance risk assessment, monitoring and control, advice, reporting to the management"),
    ("whistleblowing", "Pranešimai apie pažeidimus", "Reporting of breaches (whistleblowing)",
     "a speak-up culture, the channels, confidentiality, protection from retaliation"),
    ("consequences", "Pasekmės už neatitikimą", "Consequences of non-compliance",
     "the same rules for everyone and the disciplinary measures that follow a breach"),
)
KEYS = tuple(part[0] for part in PARTS)
PRIORITIES = ("high", "medium", "low")
MIN_PART_CHARS = 150

# A provision named as a legal basis: its act and article, and
# in `why` what it regulates — what the citation check
# compares the provision with; only the paragraph may be empty
_BASIS = {"type": "array", "items": {
    "type": "object", "additionalProperties": False, "required": ["act", "article", "paragraph", "why"],
    "properties": {"act": FILLED, "article": FILLED, "paragraph": {"type": "string"}, "why": FILLED}}}

POLICY_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["title", "parts"],
    "properties": {
        "title": FILLED,
        "parts": {"type": "array", "minItems": len(KEYS), "maxItems": len(KEYS), "items": {
            "type": "object", "additionalProperties": False,
            "required": ["key", "text", "decisions", "sources", "legalBasis"],
            "properties": {
                "key": {"type": "string", "enum": list(KEYS)},
                "text": FILLED,
                "decisions": {"type": "array", "items": {"type": "string"}},
                "sources": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["documentRef", "quote"],
                    "properties": {"documentRef": FILLED, "quote": FILLED}}},
                "legalBasis": _BASIS,
            }}},
    },
}

DOCUMENTS_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["hierarchy", "missing"],
    "properties": {
        "hierarchy": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["documentRef", "level", "topic", "note"],
            "properties": {"documentRef": FILLED, "level": {"type": "integer", "enum": [0, 1, 2, 3]},
                           "topic": FILLED, "note": {"type": "string"}}}},
        "missing": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["level", "title", "purpose", "supports", "priority", "legalBasis", "partlyCoveredBy"],
            "properties": {"level": {"type": "integer", "enum": [2, 3]}, "title": FILLED,
                           "purpose": FILLED, "supports": {"type": "string", "enum": list(KEYS)},
                           "priority": {"type": "string", "enum": list(PRIORITIES)}, "legalBasis": _BASIS,
                           "partlyCoveredBy": {"type": "array", "items": {"type": "string"}}}}},
    },
}








############################################################
# report_brief
############################################################
#
# What the company's latest report found, short enough for a
# prompt: the acts it assessed, the findings by status, and
# per theme how many obligations nothing provided could show
# or the documents miss, with a few of them by name. Empty
# when the company has no finished report.
#
# Used by:
#   - generate (below), programme/governance.py, programme/risks.py
############################################################

def report_brief(report, examples=4):
    if report is None:
        return "(the company has no finished compliance report yet)"
    acts = ReportAct.objects.filter(report=report, assessment__in=("assessed", "upcoming")).order_by("order")
    lines = [f"Report of {report.created_at:%Y-%m-%d}. Acts assessed: "
             + ", ".join((act.short_title or act.document_title) + (" (applies later)" if act.assessment == "upcoming" else "")
                         for act in acts)]
    findings = list(Finding.objects.filter(report=report).order_by("order"))
    status = lambda finding: finding.override_status or finding.status
    counts = {name: sum(status(f) == name for f in findings) for name in ("met", "partial", "missing", "unknown")}
    lines.append("Findings: " + ", ".join(f"{name} {count}" for name, count in counts.items()))
    themes = {}
    for finding in findings:
        if status(finding) in ("missing", "unknown", "partial"):
            themes.setdefault(finding.category, []).append(finding)
    lines.append("OPEN THEMES (obligations not met, met in part or not evidenced, by theme)")
    for category, rows in sorted(themes.items(), key=lambda item: -len(item[1])):
        open_counts = ", ".join(f"{name} {sum(status(f) == name for f in rows)}" for name in ("missing", "unknown", "partial"))
        lines.append(f"- {category}: {open_counts}")
        for finding in rows[:examples]:
            provision = ", ".join(c.get("path", "") for c in finding.citations)
            lines.append(f"    · [{status(finding)}] {finding.obligation_title} ({finding.short_title or finding.document_title} {provision})")
    return "\n".join(lines)








############################################################
# _context
############################################################
#
# What both calls are told beside the shared profile and
# documents: how the company is classified, the role contexts
# it keeps, and what its latest report found.
#
# Used by:
#   - generate (below)
############################################################

def _context(run):
    roles = "\n".join(f"- {role.name}: {role.context[:1200]}" for role in run.company.roles.order_by("created_at")[:6])
    market = json.dumps(run.company.financial_market, ensure_ascii=False) if run.company.financial_market else "(not classified yet)"
    return (f"FINANCIAL MARKET CLASSIFICATION\n{market}\n\n"
            f"ROLE CONTEXTS THE COMPANY KEEPS\n{roles or '(none)'}\n\n"
            f"LATEST COMPLIANCE REPORT\n{report_brief(run.report)}")








############################################################
# generate
############################################################
#
# The two calls, each a step of the job: the policy in its
# eight parts, then the library's levels and the documents
# still missing — which is told what the policy says, so it
# can ask what the policy needs to work. Answers the content
# with the calls' document refs turned into the documents.
#
# Used by:
#   - programme/run.py — generate
############################################################

def generate(run):
    index = 0 if run.lt else 1
    spec = "\n".join(f"- {key} — \"{headings[index]}\": {covers}" for key, *headings, covers in PARTS)
    with run.step("policy") as step:
        answer = run.ask("programme.policy", f"{_context(run)}\n\nPARTS TO WRITE, IN THIS ORDER\n{spec}",
                         POLICY_SCHEMA, "policy", step)
        parts = []
        for part in answer.get("parts", []):
            sources = [{"documentId": getattr(run.document(s.get("documentRef")), "id", None), "quote": s.get("quote", "")}
                       for s in part.get("sources", [])]
            parts.append({"key": part.get("key"), "text": part.get("text", ""), "decisions": part.get("decisions", []),
                          "sources": sources, "legalBasis": part.get("legalBasis", [])})
        step.output = {"parts": len(parts)}
    with run.step("document_gaps") as step:
        listing = "\n".join(
            f"- {ref}: {document.title} — {(run.inventories.get(document.id) or {}).get('documentType') or document.kind}; "
            f"{(run.inventories.get(document.id) or {}).get('summary', '')[:300]}"
            for ref, document in run.document_refs.items())
        drafted = "\n".join(f"- {part['key']}: {part['text'][:500]}" for part in parts)
        answer2 = run.ask("programme.documents",
                          f"{_context(run)}\n\nTHE LIBRARY\n{listing}\n\nTHE POLICY JUST DRAFTED (its parts, shortened)\n{drafted}",
                          DOCUMENTS_SCHEMA, "documents", step)
        hierarchy = [{"documentId": getattr(run.document(row.get("documentRef")), "id", None), "level": row.get("level"),
                      "topic": row.get("topic", ""), "note": row.get("note", "")} for row in answer2.get("hierarchy", [])]
        missing = [{**{key: row.get(key) for key in ("level", "title", "purpose", "supports", "priority", "legalBasis")},
                    "partlyCoveredBy": [{"documentId": getattr(run.document(ref), "id", None)}
                                        for ref in row.get("partlyCoveredBy", [])]}
                   for row in answer2.get("missing", [])]
        step.output = {"placed": len(hierarchy), "missing": len(missing)}
    return {"title": answer.get("title", ""), "parts": parts, "hierarchy": hierarchy, "missing": missing}








############################################################
# validate
############################################################
#
# Brings a policy's content into its stored shape and checks
# it against the rules of the kind — the model's answer and a
# person's edit alike. The parts come out in the fixed order
# under the fixed headings; quotes are placed in their
# documents and provisions looked up in the corpus; entries
# naming a document the company does not have are dropped.
#
# Used by:
#   - programme/run.py — generate
#   - programme/api/views.py — a person's edit
############################################################

def validate(content, library, language, judge=None):
    index = 0 if language == "lt" else 1
    given = {part.get("key"): part for part in content.get("parts") or [] if isinstance(part, dict)}
    absent = [row for row in content.get("missing") or [] if isinstance(row, dict) and str(row.get("title") or "").strip()]


    # STEP 1: every provision the content names, looked up together
    # =============================================================
    owners = [given.get(key) or {} for key, *_ in PARTS] + absent
    named = [[entry for entry in owner.get("legalBasis") or [] if isinstance(entry, dict)] for owner in owners]
    looked_up = iter(library.provisions([entry for entries in named for entry in entries], judge))
    kept = lambda entry: str(entry.get("act", "")).strip() and str(entry.get("article", "")).strip()
    bases = [[next(looked_up) for entry in entries if kept(entry)] for entries in named]
    every = [entry for basis in bases for entry in basis]
    wrong = sorted({f"{entry['shortTitle']} {entry['article']}" for entry in every if entry["status"] == "not_found"})
    unverified = sorted({entry["act"] for entry in every if entry["status"] == "act_not_in_corpus"})
    mismatched = sorted({f"{entry['shortTitle']} {entry['path']}" for entry in every if entry["match"] == "mismatch"})


    # STEP 2: the parts in their order, the library's levels, the missing documents
    # ==============================================================================
    parts, unplaced = [], []
    for (key, *headings, _), basis in zip(PARTS, bases):
        part = given.get(key) or {}
        sources = library.sources(part.get("sources"))
        unplaced += [source["document"] for source in sources if source["start"] is None]
        parts.append({"key": key, "heading": headings[index], "text": str(part.get("text") or "").strip()[:PART_CHARS],
                      "decisions": [str(d).strip()[:500] for d in part.get("decisions") or [] if str(d).strip()],
                      "sources": sources, "legalBasis": basis})
    hierarchy, placed = [], set()
    for row in content.get("hierarchy") or []:
        document = library.by_id.get(row.get("documentId")) if isinstance(row, dict) else None
        if document is None or document.id in placed or row.get("level") not in (0, 1, 2, 3):
            continue
        placed.add(document.id)
        hierarchy.append({"documentId": document.id, "document": document.title, "level": row["level"],
                          "topic": str(row.get("topic") or "")[:200], "note": str(row.get("note") or "")[:600]})
    missing = []
    for row, basis in zip(absent, bases[len(PARTS):]):
        covered = [{"documentId": d.id, "document": d.title}
                   for d in (library.by_id.get(entry.get("documentId")) for entry in row.get("partlyCoveredBy") or []
                             if isinstance(entry, dict)) if d is not None]
        missing.append({"level": row.get("level") if row.get("level") in (2, 3) else 3,
                        "title": str(row["title"]).strip()[:300], "purpose": str(row.get("purpose") or "").strip()[:1200],
                        "supports": row.get("supports") if row.get("supports") in KEYS else "processes",
                        "priority": row.get("priority") if row.get("priority") in PRIORITIES else "medium",
                        "legalBasis": basis, "partlyCoveredBy": covered})
    short = [part["key"] for part in parts if len(part["text"]) < MIN_PART_CHARS]
    unplaced_documents = [d.title for d in library.documents if d.id not in placed]
    checks = [
        check("parts", not short, ", ".join(short)),
        check("provisions", not wrong, ", ".join(wrong)),
        check("provisions_unverified", not unverified, ", ".join(unverified), blocking=False),
        check("provision_subjects", not mismatched, ", ".join(mismatched), blocking=False),
        check("quotes", not unplaced, ", ".join(sorted(set(unplaced))[:12]), blocking=False),
        check("hierarchy", not unplaced_documents, ", ".join(unplaced_documents[:12]), blocking=False),
    ]
    return ({"title": str(content.get("title") or "").strip()[:300], "parts": parts, "hierarchy": hierarchy,
             "missing": missing}, checks)
