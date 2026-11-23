############################################################
#  [*] prompts.schemas — the output schema of each prompt
#
#    schema_for("report.gap_analysis") → (schema, name) | (None, None)
#
#  The pipeline code owns its strict JSON schemas (the parser
#  of every answer depends on them); the prompt editor's test
#  run needs the same schema to show what a draft produces.
#  Imports are lazy — the pipeline modules pull in the whole
#  analysis stack.
#
#  In a strict schema every field is "required", and that
#  promises the key only: a field typed as a plain string may
#  come back empty and a list may come back with nothing in
#  it. So what an answer MUST carry is marked in the schema
#  itself — a text with FILLED, a list with minItems — and
#  the provider's decoder and the assistant's own check both
#  hold the model to it. A field the prompt allows to be
#  empty ("else ''", "an empty list when …") stays plain, and
#  so does one that is mandatory in some answers only (the
#  recommendation of an open finding): that could be written
#  as two shapes of the item under anyOf, and was measured —
#  the gap analysis then judged differently (two to three of
#  the evaluation's 71 cases), so the prompt alone asks for it.
############################################################


from importlib import import_module


# A text that must carry content
FILLED = {"type": "string", "minLength": 1}

# slug → (module, attribute, schema name)
SCHEMAS = {
    "report.inventory": ("compliance.companies.inventory", "SCHEMA", "inventory"),
    "report.applicability": ("compliance.analysis.pipeline", "APPLICABILITY_SCHEMA", "applicability"),
    "report.gap_analysis": ("compliance.analysis.pipeline", "GAP_SCHEMA", "findings"),
    "report.action_plan": ("compliance.analysis.pipeline", "PLAN_SCHEMA", "action_plan"),
    "report.plan_merge": ("compliance.analysis.pipeline", "MERGE_SCHEMA", "plan_merge"),
    "report.summary": ("compliance.analysis.pipeline", "SUMMARY_SCHEMA", "summary"),
    "corpus.extract_obligations": ("compliance.corpus.obligations", "SCHEMA", "obligations"),
    "corpus.extract_requirements": ("compliance.corpus.obligations", "REQUIREMENT_SCHEMA", "requirements"),
    "corpus.check_citations": ("compliance.corpus.citations", "JUDGE_SCHEMA", "verdicts"),
    "corpus.standard_outline": ("compliance.corpus.outline", "OUTLINE_SCHEMA", "outline"),
    "corpus.scope": ("compliance.corpus.scope", "SCHEMA", "scope"),
    "corpus.verify_obligations": ("compliance.corpus.verify", "SCHEMA", "checks"),
    "corpus.sanctions": ("compliance.corpus.sanctions", "SCHEMA", "sanctions"),
    "company.internal_requirements": ("compliance.analysis.internal", "SCHEMA", "internal_requirements"),
    "report.internal_gap": ("compliance.analysis.pipeline", "GAP_SCHEMA", "findings"),
    "programme.policy": ("compliance.programme.policy", "POLICY_SCHEMA", "policy"),
    "programme.documents": ("compliance.programme.policy", "DOCUMENTS_SCHEMA", "documents"),
    "programme.structure": ("compliance.programme.governance", "STRUCTURE_SCHEMA", "structure"),
    "programme.raci": ("compliance.programme.governance", "RACI_SCHEMA", "raci"),
    "programme.risk_criteria": ("compliance.programme.risks", "CRITERIA_SCHEMA", "risk_criteria"),
    "programme.risk_scenarios": ("compliance.programme.risks", "SCENARIOS_SCHEMA", "risk_scenarios"),
}








############################################################
# schema_for
############################################################
#
# Used by:
#   - prompts/api/views.py — test_run
############################################################

def schema_for(slug):
    entry = SCHEMAS.get(slug)
    if entry is None:
        return None, None
    module, attribute, name = entry
    return getattr(import_module(module), attribute), name
