############################################################
#  [*] prompts.evals.suites — the cases put to the model
#
#    SUITES — name → (the prompt it measures, its runner)
#    load(name) → the cases of cases/<name>.yaml
#    run(name) → [{id, expected, got, ok}] in the file's order
#
#  One runner per suite, each going through the function the
#  product itself calls, so a suite measures the prompt as it
#  is used and not a copy of it:
#
#  - verify — the judge of the register (corpus/verify.py).
#    A case carries its own provision and entry; "doubt"
#    stands for either of the judge's two doubting verdicts.
#  - scope — whom an act's own text covers (corpus/scope.py).
#    A case names an act of this installation's corpus; a
#    reading of "all" covers every type.
#  - citations — does an article regulate what a document
#    says (corpus/citations.py). A case names an act and an
#    article of this installation's corpus.
#
#  - gap — does a company's documents meet an obligation
#    (analysis/pipeline.py, gap_data). A case carries its own
#    obligation; the company is the sample one of data/, whose
#    whole library and profile every call is given, as a
#    report's calls are. A case may accept a second status
#    where two readers of the rules would differ.
#
#  - applicability — does an act apply to a company
#    (analysis/pipeline.py, applicability_data). A case names
#    a company profile of its file and an act of this
#    installation's corpus; besides the verdict it may fix
#    the act's effect or the date it starts to apply, since
#    those decide what a report does with the act.
#
#  - sanctions — what a breach of an article can cost
#    (corpus/sanctions.py). A case names an act of this
#    installation's corpus and an article of it, or of another
#    act it lays fines down for; the reading is joined to the
#    article by the code a report uses, and nothing is stored.
#
#  A case that cannot be put — its act is not in the corpus —
#  counts as failed and says why in `got`.
############################################################


from datetime import date
from pathlib import Path
from types import SimpleNamespace

import yaml

from compliance.analysis import pipeline
from compliance.assistant.llm import run_prompt
from compliance.common.timestamps import utc_now
from compliance.corpus import verify
from compliance.corpus.citations import check_citations
from compliance.corpus.models import LegalDocument
from compliance.corpus import sanctions
from compliance.corpus.scope import ACTS_PER_CALL, scope_readings


CASES = Path(__file__).parent / "cases"
DATA = Path(__file__).parent / "data"








############################################################
# load
############################################################
#
# The cases of a suite, as its file lists them — or another
# part of that file, such as the companies its cases name.
#
# Used by:
#   - run, _applicability (below), tests/test_evals.py
############################################################

def load(name, part="cases"):
    with open(CASES / f"{name}.yaml", encoding="utf-8") as handle:
        return yaml.safe_load(handle)[part]








############################################################
# _verify
############################################################
#
# One call per case: the article and the entry, rendered as
# the judge's job renders them.
#
# Used by:
#   - SUITES (below)
############################################################

def _verify(cases):
    results = []
    for case in cases:
        entry, provision = case["entry"], case["provision"]
        article = SimpleNamespace(id="article", path=provision["path"], text=provision["text"])
        row = SimpleNamespace(citations=[{"unitId": "article", "path": entry["cites"]}], title=entry["title"],
                              text=entry["text"], addressee=entry.get("addressee", ""),
                              conditions=entry.get("conditions", ""), deadline=entry.get("deadline", ""),
                              applies_to=entry.get("appliesTo") or [])
        data = verify._render(SimpleNamespace(title=case["act"]), [article], [row], {"article": article})
        run = run_prompt("corpus.verify_obligations", data, schema=verify.SCHEMA, schema_name="checks",
                         purpose="eval:verify")
        verdict = next((check.get("verdict") for check in (run.object or {}).get("checks", [])), None)
        got = "supported" if verdict == "supported" else "doubt" if verdict in verify.VERDICTS else "no answer"
        results.append({"id": case["id"], "expected": case["expect"], "got": got if got != "doubt" else f"doubt ({verdict})",
                        "ok": got == case["expect"]})
    return results








############################################################
# _scope
############################################################
#
# The acts in the groups one call reads; nothing is stored on
# their versions.
#
# Used by:
#   - SUITES (below)
############################################################

def _scope(cases):
    acts = {act.slug: act for act in LegalDocument.objects.select_related("current_version")
            .defer("current_version__text").filter(slug__in=[case["act"] for case in cases],
                                                   current_version__isnull=False)}
    present = [case for case in cases if case["act"] in acts]
    readings = {}
    for start in range(0, len(present), ACTS_PER_CALL):
        batch = present[start:start + ACTS_PER_CALL]
        answers = scope_readings([acts[case["act"]] for case in batch], purpose="eval:scope")
        readings.update({case["id"]: answer for case, answer in zip(batch, answers)})
    results = []
    for case in cases:
        expected = f"must {case.get('must', [])}" + (f", not {case['must_not']}" if case.get("must_not") else "")
        reading = readings.get(case["id"])
        if reading is None:
            got = "the act is not in the corpus" if case["act"] not in acts else "no answer"
            results.append({"id": case["id"], "expected": expected, "got": got, "ok": False})
            continue
        types = set(reading["types"])
        ok = (all(kind in types or "all" in types for kind in case.get("must", []))
              and not any(kind in types or "all" in types for kind in case.get("must_not", [])))
        results.append({"id": case["id"], "expected": expected, "got": sorted(types), "ok": ok})
    return results








############################################################
# _citations
############################################################
#
# The references through the citation check, as many at a
# time as it takes.
#
# Used by:
#   - SUITES (below)
############################################################

def _citations(cases):
    answers = check_citations([{"act": case["act"], "article": case["article"], "claimedHeading": case["claim"]}
                               for case in cases], use_model=True)
    results = []
    for case, answer in zip(cases, answers):
        got = answer["headingMatch"] if answer["status"] == "found" else answer["status"]
        results.append({"id": case["id"], "expected": case["expect"], "got": got, "ok": got == case["expect"]})
    return results








############################################################
# _gap
############################################################
#
# The cases act by act, as many obligations a call as a
# report sends, every call with the sample company's profile
# and its documents whole as the shared data.
#
# Used by:
#   - SUITES (below)
############################################################

def _gap(cases):
    folder = DATA / "1009-ltd"
    with open(folder / "library.yaml", encoding="utf-8") as handle:
        library = yaml.safe_load(handle)
    documents = [SimpleNamespace(id=entry["file"], title=entry["file"], kind=entry["kind"],
                                 text=(folder / "documents" / entry["file"]).read_text(encoding="utf-8"))
                 for entry in library["documents"]]
    reader = SimpleNamespace(inventories={})
    pack = "\n\n".join(pipeline.document_block(reader, f"D{index}", document)
                        for index, document in enumerate(documents, 1))
    profile = (folder / "profile.txt").read_text(encoding="utf-8").strip()
    shared = f"COMPANY\n{profile}\n\nDOCUMENTS\n{pack}"
    variables = {"LANGUAGE": "Lithuanian", "TODAY": utc_now().date().isoformat(), "COMPANY_NAME": "1009 LTD"}
    groups = {}
    for case in cases:
        groups.setdefault(case["act"], []).append(case)
    got = {}
    for short, group in groups.items():
        spec = library["acts"][short]
        act = SimpleNamespace(short_title=short, document_title=spec["title"], doc_type=spec["docType"],
                              applicability=spec["applicability"], reasoning=spec["reasoning"],
                              applies_from=date.fromisoformat(spec["appliesFrom"]) if spec.get("appliesFrom") else None)
        for start in range(0, len(group), pipeline.OBLIGATIONS_PER_CALL):
            batch = group[start:start + pipeline.OBLIGATIONS_PER_CALL]
            rows = [SimpleNamespace(citations=[{"path": case["obligation"]["provisions"]}],
                                    category=case["obligation"].get("category", ""), title=case["obligation"]["title"],
                                    text=case["obligation"]["text"], conditions=case["obligation"].get("appliesWhen", ""),
                                    addressee=case["obligation"].get("addressee", ""),
                                    evidence=case["obligation"].get("expectedEvidence", ""),
                                    deadline=case["obligation"].get("deadline", "")) for case in batch]
            run = run_prompt("report.gap_analysis", pipeline.gap_data(act, rows), shared=shared,
                             schema=pipeline.GAP_SCHEMA, schema_name="findings", variables=variables, purpose="eval:gap")
            statuses = {finding.get("obligationRef"): finding.get("status")
                        for finding in (run.object or {}).get("findings", [])}
            got.update({case["id"]: statuses.get(f"O{index}", "no answer") for index, case in enumerate(batch, 1)})
    results = []
    for case in cases:
        accepted = [case["expect"]] + list(case.get("accept") or [])
        results.append({"id": case["id"], "expected": " or ".join(accepted), "got": got[case["id"]],
                        "ok": got[case["id"]] in accepted})
    return results








############################################################
# _applicability
############################################################
#
# The acts a company's cases name, in the groups one report
# call judges, each call given that company's profile as its
# shared data. A verdict is right when it is the expected
# one (or an accepted second), has the effect the case
# fixes, and puts the act's start where the case does: an
# act expected to apply today must not be answered as
# applying only from a date still ahead.
#
# Used by:
#   - SUITES (below)
############################################################

def _applicability(cases):
    companies, today = load("applicability", "companies"), utc_now().date()
    slugs = {case["act"] for case in cases}
    acts = {act.slug: act for act in LegalDocument.objects.select_related("current_version")
            .filter(slug__in=slugs, current_version__isnull=False)}
    got = {}
    for name, spec in companies.items():
        profile = (DATA / spec["file"]).read_text(encoding="utf-8").strip() if spec.get("file") else spec["profile"].strip()
        company = profile.splitlines()[0].removeprefix("Company: ").split(" (")[0]
        asked = [case for case in cases if case["company"] == name and case["act"] in acts]
        for start in range(0, len(asked), pipeline.ACTS_PER_CALL):
            batch = asked[start:start + pipeline.ACTS_PER_CALL]
            data, _ = pipeline.applicability_data([acts[case["act"]] for case in batch])
            run = run_prompt("report.applicability", data, shared=f"COMPANY\n{profile}",
                             schema=pipeline.APPLICABILITY_SCHEMA, schema_name="applicability",
                             variables={"LANGUAGE": "Lithuanian", "TODAY": today.isoformat(), "COMPANY_NAME": company},
                             purpose="eval:applicability")
            verdicts = {verdict.get("actRef"): verdict for verdict in (run.object or {}).get("acts", [])}
            for index, case in enumerate(batch, 1):
                got[case["id"]] = verdicts.get(f"A{index}")
    results = []
    for case in cases:
        accepted = [case["expect"]] + list(case.get("accept") or [])
        expected = " or ".join(accepted) + (f", {case['effect']}" if case.get("effect") else "") \
            + (f", from {case['appliesFrom']}" if case.get("appliesFrom") else "")
        verdict = got.get(case["id"])
        if case["act"] not in acts or verdict is None:
            results.append({"id": case["id"], "expected": expected, "ok": False,
                            "got": "the act is not in the corpus" if case["act"] not in acts else "no answer"})
            continue
        starts = pipeline.applies_from_of(SimpleNamespace(today=today), verdict) if verdict.get("applicability") == "applies" else None
        said = verdict.get("applicability", "no answer") + (f", {verdict.get('effect')}" if case.get("effect") else "") \
            + (f", from {starts.isoformat()}" if starts else "")
        ok = verdict.get("applicability") in accepted \
            and (not case.get("effect") or verdict.get("applicability") != "applies" or verdict.get("effect") == case["effect"]) \
            and (verdict.get("applicability") != "applies"
                 or (starts.isoformat() if starts else None) == case.get("appliesFrom"))
        results.append({"id": case["id"], "expected": expected, "got": said, "ok": ok})
    return results








############################################################
# _sanctions
############################################################
#
# Each act the cases name is read once; a case's article is
# then given the tiers that cover it as a report's finding
# would be. A case is right when the ceiling for any breach
# is the expected one — or none is stated, where the case
# expects none — the graver ceiling, where the case names
# one, is found beside it — or none is, where the case says
# the ceiling stands alone — and the ceiling is said to bind
# the kind of person the case names (`whose`), where it
# names one. A case may ask instead for the highest ceiling
# the article is shown (`highest`), for any breach or bound
# to a kind of breach: an act that grades its fines by the
# gravity of the breach is read either way.
#
# Used by:
#   - SUITES (below)
############################################################

def _sanctions(cases):
    slugs = {case["act"] for case in cases} | {case["infringed"] for case in cases if case.get("infringed")}
    acts = {act.slug: act for act in LegalDocument.objects.select_related("current_version")
            .filter(slug__in=slugs, current_version__isnull=False)}
    readings = {}
    for slug in dict.fromkeys(case["act"] for case in cases):
        if slug in acts:
            readings[slug] = sanctions.sanction_reading(acts[slug], purpose="eval:sanctions")
    ceiling = lambda entry: {key: value for key, value in (("eur", entry.get("maxFineEur")), ("percent", entry.get("maxFinePercent")))
                             if value}
    same = lambda got, expected: {k: float(v) for k, v in got.items()} == {k: float(v) for k, v in expected.items()}
    results = []
    for case in cases:
        target = case.get("infringed") or case["act"]
        expect, graver, highest = dict(case.get("expect") or {}), case.get("graver"), case.get("highest")
        whose = case.get("whose")
        alone = bool(graver) and bool(graver.get("none"))
        expected = ("no ceiling" if expect.get("none") else f"at most {highest}" if highest else str(expect)) \
            + (", no graver one" if alone else f", graver {graver}" if graver else "") + (f", only for {whose}" if whose else "")
        if case["act"] not in acts or target not in acts:
            results.append({"id": case["id"], "expected": expected, "got": "the act is not in the corpus", "ok": False})
            continue
        # The tiers that concern the article's act, as a report gathers them: one that binds only certain
        # persons narrowed where their duties stand in its own part of the act alone
        tiers = [{**tier, "act": case["act"], "source": acts[case["act"]].id, "own": target == case["act"]}
                 for tier in readings[case["act"]]["tiers"] if tier["documentId"] == acts[target].id]
        sanctions._narrow({acts[target].id: tiers})
        covering = [(sanctions._names(tier, {sanctions._key(case["article"])}), tier)
                    for tier in tiers if tier["addressee"] != "natural"]
        entries = sanctions._of_act([(named, tier) for named, tier in covering if named or tier["all"]])
        fined = [entry for entry in entries if ceiling(entry)]
        first = next((entry for entry in fined if not entry["condition"]), None)
        base = ceiling(first) if first else None
        bound = next((ceiling(entry) for entry in fined if entry["condition"]), None)
        # Whose ceiling: the one for any breach — or the highest, where the case asks only for that
        told = max(fined, key=sanctions._height) if highest and fined else first
        persons = ", ".join(told["persons"]) if told else ""
        got = ("no ceiling" if not fined else str(base)) + (f", graver {bound}" if bound else "") \
            + (f", only for {persons}" if persons else "")
        if expect.get("none"):
            ok = not fined
        elif highest:
            ok = told is not None and same(ceiling(told), highest)
        else:
            ok = base is not None and same(base, expect) \
                and (graver is None or (bound is None if alone else bound is not None and same(bound, graver)))
        ok = ok and (not whose or sanctions._addressed([whose], persons))
        results.append({"id": case["id"], "expected": expected, "got": got, "ok": ok})
    return results








# name → (the prompt the suite measures, its runner)
SUITES = {
    "verify": ("corpus.verify_obligations", _verify),
    "scope": ("corpus.scope", _scope),
    "citations": ("corpus.check_citations", _citations),
    "gap": ("report.gap_analysis", _gap),
    "applicability": ("report.applicability", _applicability),
    "sanctions": ("corpus.sanctions", _sanctions),
}








############################################################
# run
############################################################
#
# Puts every case of a suite to the model.
#
# Used by:
#   - prompts/management/commands/eval_prompts.py
############################################################

def run(name):
    return SUITES[name][1](load(name))
