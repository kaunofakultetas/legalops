############################################################
#  [*] corpus.verify — is an obligation what its provisions say
#
#    verify_for_document(document, ctx, user_id=None,
#                        step_id=None, again=False)
#        → how many obligations got each verdict
#    job corpus.verify_obligations {document_id, again?}
#
#  The register's obligations are a model's reading of the
#  law, and a person approves or rejects each one. With
#  thousands of them that review only happens when it is told
#  where to look. So a second model — a judge, not the reader
#  — compares every obligation with the full text of the
#  provisions it cites and says whether they carry it:
#  "supported", "partly" (the duty is there, but who owes it,
#  when or under what condition is not as written) or
#  "unsupported" (the provisions do not impose it), with a
#  note naming what is off. The verdict is kept on the
#  obligation (Obligation.verification) and the review page
#  shows the doubtful ones first.
#
#  The judge decides nothing: an obligation stays "proposed"
#  until a person approves it, and a report uses it meanwhile
#  as before. An obligation whose text a person edits loses
#  its verdict (the judge saw other words), and one whose
#  cited provisions are no longer in the current version is
#  marked unsupported without a call.
#
#  A paragraph or a point rarely says on its own who is bound
#  — the article's opening does — so the judge is shown the
#  whole article around each cited provision.
############################################################


from compliance.assistant.llm import run_prompt
from compliance.common.parallel import parallel_map
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument, LegalUnit, Obligation
from compliance.jobs.registry import register
from compliance.prompts.schemas import FILLED


# What one call reads: the articles' text and the obligations
# judged against them
BATCH_CHARS = 24_000
PROVISION_CHARS = 20_000
OBLIGATIONS_PER_CALL = 20

VERDICTS = ("supported", "partly", "unsupported")
# What is off: the duty itself, who owes it, the condition it
# hangs on, its deadline or frequency, or several duties
# written as one
ISSUES = ("none", "duty", "addressee", "condition", "deadline", "merged")

# A doubted obligation needs its issue and its note, a
# supported one neither — the prompt asks for that and the
# schema does not: written as two shapes of a check (anyOf),
# the same rule moved verdicts of the gap analysis in the
# evaluation, so no schema here takes that form
SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["checks"],
    "properties": {"checks": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["obligationRef", "verdict", "issue", "note"],
        "properties": {
            "obligationRef": FILLED,
            "verdict": {"type": "string", "enum": list(VERDICTS)},
            "issue": {"type": "string", "enum": list(ISSUES)},
            "note": {"type": "string"},
        }}}},
}








############################################################
# _articles
############################################################
#
# For the units a version's obligations cite: the article
# around each (the unit itself where nothing above it is an
# article — a standard's clause, a point of an act without
# articles). Answers {cited unit id: the unit to show}.
#
# Used by:
#   - verify_for_document (below)
############################################################

def _articles(version_id, cited_ids):
    tree = {row["id"]: row for row in LegalUnit.objects.filter(version_id=version_id).values("id", "parent_id", "unit_type")}
    around = {}
    for unit_id in cited_ids:
        node, article = tree.get(unit_id), None
        while node is not None:
            if node["unit_type"] == "article":
                article = node["id"]
            node = tree.get(node["parent_id"])
        if unit_id in tree:
            around[unit_id] = article or unit_id
    shown = LegalUnit.objects.in_bulk(set(around.values()))
    return {unit_id: shown[target] for unit_id, target in around.items() if target in shown}








############################################################
# _batches
############################################################
#
# The obligations in the groups one call judges: obligations
# citing the same articles go together, and a group is closed
# when its articles reach BATCH_CHARS or it holds
# OBLIGATIONS_PER_CALL. Answers [(articles, obligations)].
#
# Used by:
#   - verify_for_document (below)
############################################################

def _batches(rows, around):
    batches, articles, obligations, size = [], {}, [], 0
    ordered = sorted(rows, key=lambda row: min((around[c["unitId"]].ordinal for c in row.citations
                                                if c.get("unitId") in around), default=0))
    for row in ordered:
        new = {around[c["unitId"]].id: around[c["unitId"]] for c in row.citations if c.get("unitId") in around}
        added = sum(min(len(unit.text), PROVISION_CHARS) for unit_id, unit in new.items() if unit_id not in articles)
        if obligations and (size + added > BATCH_CHARS or len(obligations) >= OBLIGATIONS_PER_CALL):
            batches.append((list(articles.values()), obligations))
            articles, obligations, size = {}, [], 0
            added = sum(min(len(unit.text), PROVISION_CHARS) for unit in new.values())
        articles.update(new)
        obligations.append(row)
        size += added
    if obligations:
        batches.append((list(articles.values()), obligations))
    return batches








############################################################
# _render
############################################################
#
# What the judge reads for one group: the articles, each
# under a ref, then the obligations with the refs of the
# articles they cite and the provisions as the register
# names them.
#
# Used by:
#   - verify_for_document (below)
############################################################

def _render(document, articles, obligations, around):
    refs = {unit.id: f"P{index}" for index, unit in enumerate(articles, 1)}
    parts = [f"ACT: {document.title}"]
    for unit in articles:
        cut = " (cut off)" if len(unit.text) > PROVISION_CHARS else ""
        parts.append(f'<provision ref="{refs[unit.id]}" path="{unit.path}"{cut}>\n{unit.text[:PROVISION_CHARS]}\n</provision>')
    for index, row in enumerate(obligations, 1):
        cited = sorted({refs[around[c["unitId"]].id] for c in row.citations if c.get("unitId") in around})
        parts.append("\n".join([
            f'<obligation ref="O{index}" in="{", ".join(cited)}" cites="{", ".join(c.get("path", "") for c in row.citations)}">',
            f"Title: {row.title}", f"Obligation: {row.text}", f"Addressee: {row.addressee or '-'}",
            f"Applies when: {row.conditions or '-'}", f"Deadline/frequency: {row.deadline or '-'}",
            f"Institution kinds: {', '.join(row.applies_to) or '-'}", "</obligation>"]))
    return "\n\n".join(parts)








############################################################
# verify_for_document
############################################################
#
# Judges the obligations of an act's current version that a
# person has not rejected — those never judged, or all of
# them with `again` — four calls at a time, and keeps each
# verdict on its obligation. An obligation none of whose
# cited provisions is in the version is marked unsupported
# without a call; one the judge passes over stays unjudged.
# Answers the count of each verdict given.
#
# Used by:
#   - verify_obligations (below)
############################################################

def verify_for_document(document, ctx, user_id=None, step_id=None, again=False):
    version = document.current_version
    if version is None:
        raise RuntimeError(f"{document.slug} has no ingested version yet")
    rows = Obligation.objects.filter(document=document, version=version).exclude(status="rejected")
    if not again:
        rows = rows.filter(verification__isnull=True)
    rows = list(rows.order_by("created_at"))
    around = _articles(version.id, {c.get("unitId") for row in rows for c in row.citations if c.get("unitId")})
    counts = {verdict: 0 for verdict in VERDICTS}


    # STEP 1: obligations whose provisions are gone
    # =============================================
    now = utc_now().isoformat()
    lost = [row for row in rows if not any(c.get("unitId") in around for c in row.citations)]
    for row in lost:
        Obligation.objects.filter(id=row.id).update(verification={
            "verdict": "unsupported", "issue": "duty", "note": "None of the cited provisions is in the act's current version.",
            "promptVersionId": None, "model": None, "checkedAt": now})
    counts["unsupported"] += len(lost)


    # STEP 2: the judge, group by group
    # =================================
    lost_ids = {row.id for row in lost}
    batches = _batches([row for row in rows if row.id not in lost_ids], around)
    done = {"n": 0}

    def judge(batch):
        ctx.check_cancelled()
        articles, obligations = batch
        run = run_prompt("corpus.verify_obligations", _render(document, articles, obligations, around), schema=SCHEMA,
                         schema_name="checks", job_step_id=step_id, user_id=user_id)
        done["n"] += 1
        ctx.progress("verify", int(done["n"] * 100 / max(len(batches), 1)), f"{done['n']}/{len(batches)} batches")
        return obligations, run

    for obligations, run in parallel_map(judge, batches, workers=4):
        answers = {answer.get("obligationRef"): answer for answer in (run.object or {}).get("checks", [])}
        for index, row in enumerate(obligations, 1):
            answer = answers.get(f"O{index}")
            if answer is None or answer.get("verdict") not in VERDICTS:
                continue
            Obligation.objects.filter(id=row.id).update(verification={
                "verdict": answer["verdict"], "issue": answer.get("issue") if answer.get("issue") in ISSUES else "none",
                "note": str(answer.get("note", ""))[:1000], "promptVersionId": run.version.id,
                "model": run.result.model, "checkedAt": utc_now().isoformat()})
            counts[answer["verdict"]] += 1
    return counts








############################################################
# verify_obligations
############################################################
#
# The `corpus.verify_obligations` job. Payload: {document_id,
# again?}. Charged to whoever queued it.
#
# Used by:
#   - corpus/api/obligation_views.py — verify
#   - corpus/management/commands/verify_obligations.py
############################################################

@register("corpus.verify_obligations", max_attempts=1)
def verify_obligations(job, ctx):
    document = LegalDocument.objects.select_related("current_version").get(id=job.payload["document_id"])
    with ctx.step("verify", input_ref={"document": document.slug}) as step:
        counts = verify_for_document(document, ctx, user_id=job.created_by_id, step_id=step.row.id,
                                     again=bool(job.payload.get("again")))
        step.output = counts
    return counts
