############################################################
#  [*] Prompts API — the versioned store, admin-only
#
#    GET  /api/prompts                              → {prompts}
#    GET  /api/prompts/{slug}                       → prompt + versions (with text)
#    POST /api/prompts/{slug}/versions              {text, model, temperature?, maxTokens?, note?, activate?}
#    POST /api/prompts/{slug}/versions/{n}/activate
#    POST /api/prompts/{slug}/test                  {input, text?, model?, temperature?,
#                                                    maxTokens?, variables?} → one model run
#
#  Every write is audited: prompts steer what the assistant
#  tells people about the law. A test run spends the admin's
#  own daily USD budget, is logged as an LlmCall and is
#  audited (prompts.test) whether the model answered or not.
############################################################


import re
from datetime import date


from django.db import transaction


from compliance.assistant import gateway
from compliance.assistant.usage import budget_status, record_call
from compliance.audit.log import audit
from compliance.common.http import bounded_int, get_json_object, json_error, json_response, methods
from compliance.prompts.models import Prompt
from compliance.prompts.schemas import schema_for
from compliance.prompts.serializers import serialize_prompt, serialize_version
from compliance.prompts.store import activate_version, add_version, render
from compliance.users.auth import require_role


MAX_TEXT_CHARS = 60_000
MAX_TEST_INPUT_CHARS = 200_000
MAX_TEST_VARIABLES = 50

# provider:model (bare ids mean the gateway), as the node
# assistant's parseModelId reads them; the name never ends in
# ":" (a bare "gateway:" names no model)
MODEL_ID = re.compile(r"^(?:(?:gateway|openai|anthropic|ollama):)?[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,118}[A-Za-z0-9._/-])?\Z")








############################################################
# _settings
############################################################
#
# The editable model settings of a body, validated:
# (text, model, temperature, max_tokens, error). Absent
# text/model fall back to `base` (the test run of a stored
# version).
#
# Used by:
#   - create_version, test_run (below)
############################################################

def _settings(data, base=None):
    text = data.get("text", base.text if base else None)
    model = data.get("model", base.model if base else None)
    if not isinstance(text, str) or not text.strip() or not isinstance(model, str) or not model.strip():
        return None, None, None, None, ("text and model are required", "MISSING_FIELDS")
    if len(text) > MAX_TEXT_CHARS:
        return None, None, None, None, (f"text is limited to {MAX_TEXT_CHARS} characters", "INVALID_FIELD")
    model = model.strip()
    if not MODEL_ID.match(model):
        return None, None, None, None, ("model must look like gateway:azure/gpt-5.5", "INVALID_FIELD")
    temperature = data.get("temperature", base.temperature if base else None)
    if temperature is not None and (isinstance(temperature, bool) or not isinstance(temperature, (int, float))
                                    or not 0 <= temperature <= 2):
        return None, None, None, None, ("temperature must be a number from 0 to 2", "INVALID_FIELD")
    max_tokens = data.get("maxTokens", base.max_tokens if base else None)
    if max_tokens is not None:
        max_tokens = bounded_int(max_tokens, 1, 128_000)
        if max_tokens is None:
            return None, None, None, None, ("maxTokens must be an integer from 1 to 128000", "INVALID_FIELD")
    return text.strip(), model, temperature, max_tokens, None








############################################################
# list_prompts
############################################################
#
# GET /api/prompts
#
# Used by:
#   - the prompts page (later)
############################################################

@methods("GET")
@require_role("admin")
def list_prompts(request):
    rows = Prompt.objects.select_related("active_version").order_by("kind", "slug")
    return json_response({"prompts": [serialize_prompt(p) for p in rows]})








############################################################
# prompt_item
############################################################
#
# GET /api/prompts/{slug}
#
# Used by:
#   - the prompt editor (later)
############################################################

@methods("GET")
@require_role("admin")
def prompt_item(request, slug):
    prompt = Prompt.objects.select_related("active_version").filter(slug=slug).first()
    if prompt is None:
        return json_error("Prompt not found", 404, code="NOT_FOUND")
    return json_response(serialize_prompt(prompt, with_versions=True))








############################################################
# create_version
############################################################
#
# POST /api/prompts/{slug}/versions
#
# Used by:
#   - the prompt editor (later)
############################################################

@methods("POST")
@require_role("admin")
def create_version(request, slug):
    prompt = Prompt.objects.filter(slug=slug).first()
    if prompt is None:
        return json_error("Prompt not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    text, model, temperature, max_tokens, error = _settings(data)
    if error:
        return json_error(error[0], 400, code=error[1])
    note, activate = data.get("note") or "", data.get("activate") is True
    if not isinstance(note, str):
        return json_error("note must be a string", 400, code="INVALID_FIELD")

    version = add_version(prompt, text, model, temperature=temperature, max_tokens=max_tokens,
                          note=note.strip()[:500], created_by=request.user, activate=activate)
    audit(request, "prompts.version_create", "prompt", prompt.slug,
          {"version": version.version_no, "activated": activate})
    return json_response(serialize_version(version, with_text=True), status=201)








############################################################
# activate
############################################################
#
# POST /api/prompts/{slug}/versions/{n}/activate
#
# Used by:
#   - the prompt editor (later)
############################################################

@methods("POST")
@require_role("admin")
def activate(request, slug, version_no):
    prompt = Prompt.objects.filter(slug=slug).first()
    if prompt is None:
        return json_error("Prompt not found", 404, code="NOT_FOUND")
    version = prompt.versions.filter(version_no=version_no).first()
    if version is None:
        return json_error("Version not found", 404, code="NOT_FOUND")
    previous = prompt.active_version.version_no if prompt.active_version_id else None
    activate_version(prompt, version)
    audit(request, "prompts.activate", "prompt", prompt.slug, {"version": version_no, "previous": previous})
    return json_response(serialize_prompt(prompt))








############################################################
# test_run
############################################################
#
# POST /api/prompts/{slug}/test
#
#   {"input": "...", "versionNo": 3}                — a stored version
#   {"input": "...", "text": "...", "model": "..."} — an unsaved draft
#
# One model call with the draft (or stored version) as the
# instructions and `input` as the data — the same shape the
# pipeline uses, with the step's strict output schema when
# the slug has one. Variables fill the placeholders (TODAY
# defaults to today). Outside ATOMIC_REQUESTS: the call can
# take minutes and must not hold a transaction open.
#
# Used by:
#   - PromptEditor.jsx — the test panel
############################################################

@transaction.non_atomic_requests
@methods("POST")
@require_role("admin")
def test_run(request, slug):
    prompt = Prompt.objects.select_related("active_version").filter(slug=slug).first()
    if prompt is None:
        return json_error("Prompt not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")


    # STEP 1: which instructions — a stored version or a draft
    # ========================================================
    base = prompt.active_version
    if data.get("versionNo") is not None:
        number = bounded_int(data["versionNo"], 1, 1_000_000)
        base = prompt.versions.filter(version_no=number).first() if number else None
        if base is None:
            return json_error("Version not found", 404, code="NOT_FOUND")
    text, model, temperature, max_tokens, error = _settings(data, base)
    if error:
        return json_error(error[0], 400, code=error[1])
    source = data.get("input")
    variables = data.get("variables") or {}
    if not isinstance(source, str) or not source.strip() or len(source) > MAX_TEST_INPUT_CHARS:
        return json_error(f"input must be text of at most {MAX_TEST_INPUT_CHARS} characters", 400,
                          code="INVALID_FIELD")
    if not isinstance(variables, dict) or len(variables) > MAX_TEST_VARIABLES \
            or not all(isinstance(v, (str, int, float)) and len(k) <= 64 and len(str(v)) <= MAX_TEST_INPUT_CHARS
                       for k, v in variables.items()):
        return json_error(f"variables must map at most {MAX_TEST_VARIABLES} names to text", 400,
                          code="INVALID_FIELD")


    # STEP 2: the budget, then one call
    # =================================
    budget = budget_status(request.user.id)
    if budget["remaining"] is not None and budget["remaining"] <= 0:
        return json_error("Today's AI usage budget is spent — try again tomorrow", 429, code="BUDGET_EXCEEDED")
    schema, schema_name = schema_for(prompt.slug)
    filled = render(text, {"TODAY": date.today().isoformat(), **{str(k): v for k, v in variables.items()}})
    try:
        result = gateway.generate(source, system=filled, model=model, schema=schema,
                                  schema_name=schema_name or "result", temperature=temperature,
                                  max_output_tokens=max_tokens, retries=0)
    except gateway.GatewayError as exc:
        audit(request, "prompts.test", "prompt", prompt.slug, {"model": model, "ok": False, "code": exc.code})
        return json_error(f"The model call failed: {exc.message}", 502, code="MODEL_ERROR")
    row = record_call(kind="prompt_test", purpose=prompt.slug, model=result.model or model,
                       input_tokens=result.input_tokens, output_tokens=result.output_tokens,
                       reasoning_tokens=result.reasoning_tokens, duration_ms=result.duration_ms,
                       cached_input_tokens=result.cached_input_tokens, cache_write_tokens=result.cache_write_tokens,
                       user_id=request.user.id, prompt_version_id=base.id if base and "text" not in data else None)
    audit(request, "prompts.test", "prompt", prompt.slug,
          {"model": result.model or model, "version": base.version_no if base and "text" not in data else None,
           "ok": True, "costUsd": float(row.cost_usd) if row else None})
    return json_response({
        "model": result.model or model,
        "text": result.text,
        "object": result.object,
        "finishReason": result.finish_reason,
        "usage": {"inputTokens": result.input_tokens, "outputTokens": result.output_tokens,
                  "reasoningTokens": result.reasoning_tokens},
        "costUsd": float(row.cost_usd) if row else None,
        "durationMs": result.duration_ms,
        "renderedInstructions": filled,
    })
