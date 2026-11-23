############################################################
#  [*] programme.governance — who answers for compliance:
#      structure, process and RACI
#
#    generate(run) → the content as the model wrote it
#    validate(content, library, language, judge=None) → (content, checks)
#
#  The second product of the course's second assignment. Two
#  calls over the company's whole library:
#
#  - the positions and units the documents name, each with
#    the passage that names it; the roles and functions a
#    financial market participant needs and the documents do
#    not show; and a proposed structure — governing bodies,
#    committees, the three lines — as a tree, with what is
#    proposed marked apart from what exists;
#  - the compliance management process in steps named by
#    what is done, each resting on a clause of ISO 37301 or a
#    paragraph of the Bank of Lithuania's compliance function
#    guidelines, and the RACI matrix that gives every step to
#    the roles of the structure.
#
#  The rules the product must keep, whoever wrote or edited
#  it: a structure that is a tree under a governing body;
#  the second line never under the first and internal audit
#  under a governing body alone; every step with exactly one
#  accountable role and at least one responsible one — the
#  golden rule of RACI (a role that both does the work and
#  answers for it holds "AR"). Warnings: a role with a letter in
#  every step, a role accountable for more than half of them,
#  a step resting on no known clause, a quote the document
#  does not hold.
#
#  A RACI matrix is an agreement of the people in it. What
#  comes out here is the draft they start from.
############################################################


from compliance.programme.policy import report_brief
from compliance.programme.run import check
from compliance.prompts.schemas import FILLED


TITLE = {"lt": "Valdymo struktūra, atitikties procesas ir RACI", "en": "Structure, compliance process and RACI"}
NEEDS = ("policy",)
# The steps of its generation, between reading the documents and checking the references
STEPS = ("structure", "process_raci")

LINES = ("governing", "first", "second", "third", "external")
NODE_KINDS = ("body", "committee", "function", "unit")
# One letter a role and step — or "AR" where the role that does
# the work also answers for it
RACI = ("R", "A", "AR", "C", "I")
SOURCES = ("ISO 37301", "LB gairės")
MIN_STEPS = 5

# The clauses of ISO 37301:2021 a step may rest on, and the
# paragraphs of the Bank of Lithuania's guidelines of 2022
ISO_CLAUSES = {"4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "5.1", "5.1.1", "5.1.2", "5.1.3", "5.2", "5.3", "5.3.1", "5.3.2",
               "5.3.3", "5.3.4", "6.1", "6.2", "6.3", "7.1", "7.2", "7.2.1", "7.2.2", "7.2.3", "7.3", "7.4", "7.5", "8.1", "8.2",
               "8.3", "8.4", "9.1", "9.1.1", "9.1.2", "9.1.3", "9.1.4", "9.1.5", "9.2", "9.3", "10.1", "10.2"}
GUIDELINE_PARAGRAPHS = range(1, 80)

# The passages that name a position: at least one, since a
# position is listed only when the documents name it
_SOURCES = {"type": "array", "minItems": 1, "items": {
    "type": "object", "additionalProperties": False, "required": ["documentRef", "quote"],
    "properties": {"documentRef": FILLED, "quote": FILLED}}}

STRUCTURE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["title", "positions", "gaps", "structure"],
    "properties": {
        "title": FILLED,
        "positions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["name", "unit", "line", "duties", "sources"],
            "properties": {"name": FILLED, "unit": {"type": "string"},
                           "line": {"type": "string", "enum": list(LINES)}, "duties": {"type": "string"},
                           "sources": _SOURCES}}},
        "gaps": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["role", "line", "why"],
            "properties": {"role": FILLED, "line": {"type": "string", "enum": list(LINES)},
                           "why": FILLED}}},
        "structure": {"type": "array", "minItems": 1, "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "name", "kind", "line", "parentId", "proposed", "note"],
            # parentId is empty for the top of the tree only
            "properties": {"id": FILLED, "name": FILLED,
                           "kind": {"type": "string", "enum": list(NODE_KINDS)},
                           "line": {"type": "string", "enum": list(LINES)}, "parentId": {"type": "string"},
                           "proposed": {"type": "boolean"}, "note": {"type": "string"}}}},
    },
}

RACI_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["steps", "raci"],
    "properties": {
        "steps": {"type": "array", "minItems": MIN_STEPS, "items": {
            "type": "object", "additionalProperties": False, "required": ["id", "name", "description", "frequency", "basis"],
            "properties": {"id": FILLED, "name": FILLED, "description": FILLED,
                           "frequency": FILLED,
                           "basis": {"type": "array", "items": {
                               "type": "object", "additionalProperties": False, "required": ["source", "ref"],
                               "properties": {"source": {"type": "string", "enum": list(SOURCES)},
                                              "ref": FILLED}}}}}},
        "raci": {"type": "array", "minItems": 1, "items": {
            "type": "object", "additionalProperties": False, "required": ["stepId", "roleId", "value"],
            "properties": {"stepId": FILLED, "roleId": FILLED,
                           "value": {"type": "string", "enum": list(RACI)}}}},
    },
}








############################################################
# _policy_parts
############################################################
#
# What the company's compliance policy says of roles, the
# function's mandate and the core processes — the parts this
# product builds on — or that there is no policy yet.
#
# Used by:
#   - generate (below)
############################################################

def _policy_parts(run):
    policy = run.earlier.get("policy")
    if policy is None:
        return "(the company has no compliance policy product yet)"
    parts = {part["key"]: part["text"] for part in policy.content.get("parts", [])}
    state = "approved" if policy.status == "approved" else "a draft, not yet approved"
    return (f"Version {policy.version}, {state}.\n"
            + "\n".join(f"[{key}] {parts.get(key, '')[:1800]}" for key in ("mandate", "roles", "processes")))








############################################################
# generate
############################################################
#
# The two calls, each a step of the job. The second is given
# the structure the first proposed, so the matrix can only
# name roles that are in it.
#
# Used by:
#   - programme/run.py — generate
############################################################

def generate(run):
    named = "\n".join(
        f"- {ref} {document.title}: {', '.join((run.inventories.get(document.id) or {}).get('roles') or []) or '-'}"
        for ref, document in run.document_refs.items())
    context = (f"COMPLIANCE POLICY (the parts on mandate, roles and processes)\n{_policy_parts(run)}\n\n"
               f"LATEST COMPLIANCE REPORT\n{report_brief(run.report, examples=2)}")
    with run.step("structure") as step:
        answer = run.ask("programme.structure",
                         f"ROLES EACH DOCUMENT NAMES (from its inventory — check them in the documents)\n{named}\n\n{context}",
                         STRUCTURE_SCHEMA, "structure", step)
        positions = [{**{key: row.get(key) for key in ("name", "unit", "line", "duties")},
                      "sources": [{"documentId": getattr(run.document(s.get("documentRef")), "id", None),
                                   "quote": s.get("quote", "")} for s in row.get("sources", [])]}
                     for row in answer.get("positions", [])]
        nodes = answer.get("structure", [])
        step.output = {"positions": len(positions), "nodes": len(nodes), "gaps": len(answer.get("gaps", []))}
    with run.step("process_raci") as step:
        roles = "\n".join(f"- {node.get('id')}: {node.get('name')} ({node.get('line')} line"
                          f"{', proposed' if node.get('proposed') else ''})" for node in nodes)
        answer2 = run.ask("programme.raci", f"ROLES OF THE STRUCTURE (use these ids)\n{roles}\n\n{context}",
                          RACI_SCHEMA, "raci", step)
        step.output = {"steps": len(answer2.get("steps", [])), "cells": len(answer2.get("raci", []))}
    return {"title": answer.get("title", ""), "positions": positions, "gaps": answer.get("gaps", []),
            "structure": nodes, "process": answer2.get("steps", []), "raci": answer2.get("raci", [])}








############################################################
# validate
############################################################
#
# Brings the content into its stored shape and checks it
# against the rules of the kind — the model's answer and a
# person's edit alike. Nodes with no name or a repeated id
# go; a parent that is not a node, or that would close a
# circle, is cut; a matrix cell naming no step or no role of
# the structure goes, and of several letters a role has in
# one step the last stands.
#
# Used by:
#   - programme/run.py — generate
#   - programme/api/views.py — a person's edit
############################################################

def validate(content, library, language, judge=None):
    text = lambda value, limit=600: str(value or "").strip()[:limit]


    # STEP 1: the positions the documents name, and what they lack
    # ============================================================
    positions, unplaced = [], []
    for row in content.get("positions") or []:
        if not isinstance(row, dict) or not text(row.get("name")):
            continue
        sources = library.sources(row.get("sources"))
        unplaced += [source["document"] for source in sources if source["start"] is None]
        positions.append({"name": text(row["name"], 200), "unit": text(row.get("unit"), 200),
                          "line": row.get("line") if row.get("line") in LINES else "first",
                          "duties": text(row.get("duties")), "sources": sources})
    gaps = [{"role": text(row.get("role"), 200), "line": row.get("line") if row.get("line") in LINES else "second",
             "why": text(row.get("why"), 1000)}
            for row in content.get("gaps") or [] if isinstance(row, dict) and text(row.get("role"))]


    # STEP 2: the structure as a tree
    # ===============================
    nodes, seen = [], set()
    for row in content.get("structure") or []:
        node_id = text(row.get("id"), 40) if isinstance(row, dict) else ""
        if not node_id or node_id in seen or not text(row.get("name")):
            continue
        seen.add(node_id)
        nodes.append({"id": node_id, "name": text(row["name"], 200),
                      "kind": row.get("kind") if row.get("kind") in NODE_KINDS else "function",
                      "line": row.get("line") if row.get("line") in LINES else "first",
                      "parentId": text(row.get("parentId"), 40) or None, "proposed": bool(row.get("proposed")),
                      "note": text(row.get("note"))})
    by_id = {node["id"]: node for node in nodes}
    detached = []
    for node in nodes:
        if node["parentId"] not in by_id or node["parentId"] == node["id"]:
            # A parent that is named and is no node: the node is not the top, it hangs nowhere
            if node["parentId"]:
                detached.append(node["name"])
            node["parentId"] = None
    for node in nodes:
        walked, parent = {node["id"]}, node["parentId"]
        while parent is not None:
            if parent in walked:
                node["parentId"] = None
                break
            walked.add(parent)
            parent = by_id[parent]["parentId"]
    roots = [node for node in nodes if node["parentId"] is None]
    # On top stands a governing body; an outside party may stand beside the tree, nothing else
    detached += [node["name"] for node in roots if node["line"] not in ("governing", "external")
                 and node["name"] not in detached]
    subordinated = [node["name"] for node in nodes if node["line"] == "second" and node["parentId"]
                    and by_id[node["parentId"]]["line"] == "first"]
    subordinated += [node["name"] for node in nodes if node["line"] == "third" and node["parentId"]
                     and by_id[node["parentId"]]["line"] != "governing"]


    # STEP 3: the process and its matrix
    # ==================================
    steps, step_ids, unknown_basis = [], set(), []
    for row in content.get("process") or []:
        step_id = text(row.get("id"), 40) if isinstance(row, dict) else ""
        if not step_id or step_id in step_ids or not text(row.get("name")):
            continue
        step_ids.add(step_id)
        basis = [{"source": entry.get("source"), "ref": text(entry.get("ref"), 20)}
                 for entry in row.get("basis") or [] if isinstance(entry, dict) and entry.get("source") in SOURCES
                 and text(entry.get("ref"))]
        known = [entry for entry in basis if _known(entry)]
        if not known:
            unknown_basis.append(text(row["name"], 80))
        steps.append({"id": step_id, "name": text(row["name"], 200), "description": text(row.get("description"), 1000),
                      "frequency": text(row.get("frequency"), 200), "basis": basis})
    cells = {}
    for row in content.get("raci") or []:
        if isinstance(row, dict) and row.get("stepId") in step_ids and row.get("roleId") in by_id and row.get("value") in RACI:
            cells[(row["stepId"], row["roleId"])] = row["value"]
    raci = [{"stepId": step_id, "roleId": role_id, "value": value} for (step_id, role_id), value in cells.items()]
    letters = lambda step_id, letter: sum(letter in value for (cell_step, _), value in cells.items() if cell_step == step_id)
    accountable = [step["name"] for step in steps if letters(step["id"], "A") != 1]
    responsible = [step["name"] for step in steps if letters(step["id"], "R") < 1]
    roles = {role_id for _, role_id in cells}
    everywhere = [by_id[role]["name"] for role in roles
                  if steps and all((step["id"], role) in cells for step in steps)]
    heavy = [by_id[role]["name"] for role in roles
             if sum("A" in value for (_, cell_role), value in cells.items() if cell_role == role) * 2 > len(steps) > 0]

    checks = [
        check("structure", bool(nodes) and any(node["line"] == "governing" for node in roots) and not detached,
              ", ".join(detached) if nodes else "no structure"),
        check("independence", not subordinated, ", ".join(subordinated)),
        check("process", len(steps) >= MIN_STEPS, str(len(steps))),
        check("raci_accountable", bool(steps) and not accountable, ", ".join(accountable)),
        check("raci_responsible", bool(steps) and not responsible, ", ".join(responsible)),
        check("raci_everywhere", not everywhere, ", ".join(everywhere), blocking=False),
        check("raci_heavy", not heavy, ", ".join(heavy), blocking=False),
        check("process_basis", not unknown_basis, ", ".join(unknown_basis), blocking=False),
        check("quotes", not unplaced, ", ".join(sorted(set(unplaced))[:12]), blocking=False),
    ]
    return ({"title": text(content.get("title"), 300), "positions": positions, "gaps": gaps, "structure": nodes,
             "process": steps, "raci": raci}, checks)








############################################################
# _known
############################################################
#
# Whether a step's basis names a clause of ISO 37301 or a
# paragraph of the guidelines that exists.
#
# Used by:
#   - validate (above)
############################################################

def _known(entry):
    ref = entry["ref"].strip().rstrip(".")
    if entry["source"] == "ISO 37301":
        return ref.lstrip("A.") in ISO_CLAUSES if ref.startswith("A.") else ref in ISO_CLAUSES
    number = ref.split(".")[0].split()[0] if ref else ""
    return number.isdigit() and int(number) in GUIDELINE_PARAGRAPHS
