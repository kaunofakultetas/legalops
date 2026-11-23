############################################################
#  [*] corpus.scope — whom an act's own text covers
#
#    scope_provisions(act) → the units that decide its scope
#    scope_batches(acts) → the acts in the groups one call reads
#    scope_readings(batch, job_step_id=None) → one reading per act
#    read_scopes(batch, job_step_id=None) → how many were read
#    covers(reading, kind) → whether a reading names the kind
#
#  The catalogue gives every act a list of the institution
#  types it applies to, written by hand when the act was
#  added, and a report leaves out the acts whose list does
#  not name the company's type. A list ages with its act: the
#  Law on Financial Institutions has counted crypto-asset
#  services among financial services since 2024, its list
#  never learned of it, and a report of 2026-11-11 left the
#  law out for a crypto-asset service provider without
#  anything having read it.
#
#  So the act's own scope provisions are read as well — once
#  per version, by the first report that would leave the act
#  out — and the answer is kept on the version
#  (LegalDocumentVersion.scope). An act is then left out only
#  when the list and the reading agree. The reading widens the
#  screen and never narrows it: an act it brings back still
#  gets the report's full verdict on the company itself.
#
#  The model's calls are shared corpus work, charged to
#  nobody. Without the prompt or the gateway nothing is read
#  and the list decides alone, as before.
############################################################


import logging

from compliance.assistant.gateway import GatewayError
from compliance.assistant.llm import run_prompt
from compliance.common.timestamps import utc_now
from compliance.companies.models import INSTITUTION_TYPES
from compliance.corpus.models import LegalDocumentVersion, LegalUnit
from compliance.prompts.schemas import FILLED
from compliance.prompts.store import PromptNotConfigured


logger = logging.getLogger(__name__)

# How many acts one call reads, and how much of each provision
ACTS_PER_CALL = 4
SCOPE_ARTICLES = 3
READ_CHARS = 12_000

# What a reading may name: the kinds a company is recorded as
# that an act can be written for, and "all" for an act that
# binds an undertaking whatever its kind
TYPES = tuple(kind for kind in INSTITUTION_TYPES if kind not in ("other_financial", "none", "unknown")) + ("all",)

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["acts"],
    "properties": {"acts": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["actRef", "institutionTypes", "reasoning"],
        "properties": {
            "actRef": FILLED,
            # Empty when the provisions shown do not say whom the act covers
            "institutionTypes": {"type": "array", "items": {"type": "string", "enum": list(TYPES)}},
            "reasoning": FILLED,
        }}}},
}








############################################################
# scope_provisions
############################################################
#
# The provisions that decide an act's scope: its first
# articles (subject matter, scope, definitions), or the first
# points of an act without articles.
#
# Used by:
#   - read_scopes (below)
#   - analysis/pipeline.py — step_applicability
############################################################

def scope_provisions(act):
    units = LegalUnit.objects.filter(version_id=act.current_version_id).order_by("ordinal")
    articles = list(units.filter(unit_type="article")[:SCOPE_ARTICLES])
    return articles or list(units.filter(unit_type="point", depth__lte=2)[:6])








############################################################
# scope_batches
############################################################
#
# The acts in the groups one call reads, so the caller can
# run the calls side by side.
#
# Used by:
#   - analysis/pipeline.py — step_applicability
############################################################

def scope_batches(acts):
    return [acts[i:i + ACTS_PER_CALL] for i in range(0, len(acts), ACTS_PER_CALL)]








############################################################
# scope_readings
############################################################
#
# Asks the model whom the acts of a group cover. Answers one
# reading per act, in the group's order — the institution
# types named, the model's reason, and what read it — or None
# for an act the model passed over. Stores nothing. A missing
# prompt or a failing gateway is the caller's to handle.
#
# Used by:
#   - read_scopes (below)
#   - prompts/evals/suites.py — the scope suite
############################################################

def scope_readings(batch, job_step_id=None, purpose=None):
    blocks = []
    for index, act in enumerate(batch, 1):
        parts = [f'<act ref="A{index}" title="{act.title}" short="{act.short_title}" '
                 f'jurisdiction="{act.jurisdiction}" type="{act.doc_type}">']
        for unit in scope_provisions(act):
            parts.append(f'<provision path="{unit.path}">\n{unit.text[:READ_CHARS]}\n</provision>')
        parts.append("</act>")
        blocks.append("\n".join(parts))
    run = run_prompt("corpus.scope", "ACTS TO READ\n" + "\n\n".join(blocks), schema=SCHEMA, schema_name="scope",
                     job_step_id=job_step_id, purpose=purpose)
    answers = {answer.get("actRef"): answer for answer in (run.object or {}).get("acts", [])}
    readings = []
    for index, act in enumerate(batch, 1):
        answer = answers.get(f"A{index}")
        readings.append(None if answer is None else {
            "types": sorted({kind for kind in answer.get("institutionTypes", []) if kind in TYPES}),
            "reasoning": str(answer.get("reasoning", ""))[:2000], "promptVersionId": run.version.id,
            "model": run.result.model, "readAt": utc_now().isoformat()})
    return readings








############################################################
# read_scopes
############################################################
#
# Reads the scope provisions of a group of acts and keeps
# each answer on the act's current version. Answers how many
# acts were read. An act the model passed over stays unread
# and is asked again by the next report; a missing prompt or
# a failing gateway reads nothing.
#
# Used by:
#   - analysis/pipeline.py — step_applicability
############################################################

def read_scopes(batch, job_step_id=None):
    try:
        readings = scope_readings(batch, job_step_id)
    except (PromptNotConfigured, GatewayError) as exc:
        logger.warning("The scope of %d act(s) was not read: %s", len(batch), exc)
        return 0
    read = 0
    for act, reading in zip(batch, readings):
        if reading is None:
            continue
        LegalDocumentVersion.objects.filter(id=act.current_version_id).update(scope=reading)
        act.current_version.scope = reading
        read += 1
    return read








############################################################
# covers
############################################################
#
# Whether a version's reading names the institution type, or
# says the act binds everyone. No reading covers nobody.
#
# Used by:
#   - analysis/pipeline.py — candidate_acts
############################################################

def covers(reading, kind):
    types = set((reading or {}).get("types") or ())
    return "all" in types or kind in types
