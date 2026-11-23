############################################################
#  [*] assistant.llm — run a stored prompt over data
#
#    run_prompt("report.gap_analysis", payload_text,
#               shared=…, schema=GAP_SCHEMA, variables={...},
#               job_step_id=…, user_id=…)
#        → PromptRun(object, text, result, version)
#
#  The one way a pipeline step talks to a model: the ACTIVE
#  version of the slug supplies the instructions (system
#  message, placeholders filled), the model id and sampling
#  settings; the caller supplies the data (user message) and
#  the strict output schema — and, apart from the data, what
#  all the calls of its step share (`shared`), which the
#  provider caches after the first call. A call made for a
#  job step is background work: it waits a provider's rate
#  limit out instead of failing its step. Every call is
#  logged as an LlmCall with the prompt version, so a report
#  can always be traced to the exact instructions that
#  produced it.
############################################################


from dataclasses import dataclass


from compliance.assistant import gateway
from compliance.assistant.usage import record_call
from compliance.prompts.store import active_version, render








############################################################
# PromptRun
############################################################
#
# The parsed object (schema calls) or text, the raw gateway
# result and the PromptVersion used.
#
# Used by:
#   - run_prompt (below) and its callers
############################################################

@dataclass
class PromptRun:
    object: object
    text: str | None
    result: gateway.GenerateResult
    version: object








############################################################
# run_prompt
############################################################
#
# Raises PromptNotConfigured (no active version) or
# GatewayError (after the gateway client's retries).
#
# Used by:
#   - corpus/obligations.py, analysis/pipeline.py,
#     companies/inventory.py
############################################################

def run_prompt(slug, data, *, shared=None, schema=None, schema_name="result", variables=None, job_step_id=None,
               user_id=None, purpose=None, model=None):
    version = active_version(slug)
    system = render(version.text, variables or {})
    result = gateway.generate(data, system=system, shared=shared, model=model or version.model, schema=schema,
                              schema_name=schema_name, temperature=version.temperature,
                              max_output_tokens=version.max_tokens, patient=job_step_id is not None)
    record_call(kind="job_step", purpose=purpose or slug, model=result.model or version.model,
                input_tokens=result.input_tokens, output_tokens=result.output_tokens,
                reasoning_tokens=result.reasoning_tokens, duration_ms=result.duration_ms,
                cached_input_tokens=result.cached_input_tokens, cache_write_tokens=result.cache_write_tokens,
                user_id=user_id, job_step_id=job_step_id, prompt_version_id=version.id)
    return PromptRun(object=result.object, text=result.text, result=result, version=version)
