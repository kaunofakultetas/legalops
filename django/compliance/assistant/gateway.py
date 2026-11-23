############################################################
#  [*] assistant.gateway — the worker's door to the models
#
#  Django never talks to a model provider: every generation
#  and embedding goes through the node assistant's internal
#  routes (/internal/llm/*), which own the provider registry
#  and its credentials. This module is the one client:
#
#    generate(prompt, system=, shared=, model=, schema=, ...)
#        → GenerateResult(text, object, usage, model, ...)
#    embed(texts, model=)  → EmbedResult(embeddings, ...)
#    list_models()         → {providers, models}
#    mcp_list_tools(server) → [{name, description}]
#
#  Transient failures (connection errors, 429, 5xx) are
#  retried with exponential backoff; other 4xx answers raise
#  GatewayError at once. For background work (`patient`) a
#  rate limit is no failure at all: the provider counts
#  tokens per minute, a report sends many large calls, and
#  the limit clears by itself — the call waits as long as the
#  provider asks and goes again. Every successful call can be
#  logged as an LlmCall row by the caller (see
#  assistant.usage).
############################################################


import json
import logging
import random
import time
from dataclasses import dataclass, field


import requests
from django.conf import settings


logger = logging.getLogger(__name__)

# Seconds between retries: 2, 6, 18
BACKOFF_BASE_S = 2
BACKOFF_MAX_S = 30

# A patient call waits a rate limit out: as long as the
# provider asks (Retry-After), else RATE_LIMIT_WAIT_S and
# that much longer each time up to a minute — a quarter more
# or less, so the calls of one step do not all come back in
# the same second — for RATE_LIMIT_PATIENCE_S in all before
# it gives up.
# (2026-11-10: four gap-analysis calls of 59 000 tokens at a
# time ran into Azure's token rate limit within two minutes,
# and a retry after 2, 6 and 18 seconds met it again.)
RATE_LIMIT_WAIT_S = 20
RATE_LIMIT_PATIENCE_S = 900

# A connection that never got an answer (the assistant was
# restarting, a deploy) is retried more patiently than an
# HTTP error: the call itself was fine, only the transport
# went away — about two minutes of retries before giving up
CONNECTION_RETRIES = 5
RETRYABLE_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}

# How long generate() waits for the assistant: half a minute
# past the assistant's own ceiling of fifteen minutes
# (GENERATE_TIMEOUT_MS in its config.js), so its refusal
# arrives before this side gives up. The ceiling is that high
# because a model that writes some 70 tokens a second needs
# five minutes and more for the obligations of a dense batch
GENERATE_TIMEOUT_S = 930








############################################################
# GatewayError
############################################################
#
# A failed model call: the HTTP status (0 for a network
# failure), the machine code and the message the assistant
# answered (it carries the provider's cause) — and, for a
# rate limit, the seconds the provider asks to wait when it
# said.
#
# Used by:
#   - every caller of generate / embed
############################################################

class GatewayError(Exception):

    def __init__(self, status, code, message, retry_after=None):
        super().__init__(f"[{status}] {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after






    ############################################################
    # retryable
    ############################################################
    #
    # True for network failures, rate limits and server errors.
    #
    # Used by:
    #   - _post (below)
    ############################################################

    @property
    def retryable(self):
        return self.status == 0 or self.status in RETRYABLE_STATUSES








############################################################
# GenerateResult / EmbedResult
############################################################
#
# The two answers, with the usage the telemetry rows need.
#
# Used by:
#   - generate / embed (below) and their callers
############################################################

@dataclass
class GenerateResult:
    text: str | None
    object: dict | list | None
    model: str
    finish_reason: str | None
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    duration_ms: int = 0
    # Of the input tokens: read from the provider's prompt
    # cache / written to it
    cached_input_tokens: int = 0
    cache_write_tokens: int = 0


@dataclass
class EmbedResult:
    embeddings: list = field(default_factory=list)
    model: str = ""
    dimensions: int = 0
    tokens: int = 0
    duration_ms: int = 0








############################################################
# _post
############################################################
#
# One JSON POST to the assistant's internal door with the
# shared secret, retried on transient failures: `retries`
# times for retryable HTTP answers (429, 5xx), at least
# CONNECTION_RETRIES times when the connection itself failed
# (the assistant restarting under a long pipeline run). A
# `patient` call — background work nobody waits at a screen
# for — sits a rate limit out instead (RATE_LIMIT_WAIT_S),
# which uses none of those retries up.
# Answers the parsed body or raises GatewayError.
#
# Used by:
#   - generate, embed (below)
############################################################

def _post(path, body, timeout, retries, patient=False):
    url = f"{settings.ASSISTANT_URL}{path}"
    headers = {"Content-Type": "application/json", "X-Internal-Secret": settings.ASSISTANT_INTERNAL_SECRET}
    attempt, limited, waited = 0, 0, 0.0
    while True:
        try:
            response = requests.post(url, data=json.dumps(body), headers=headers, timeout=timeout)
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            if response.status_code == 200:
                return payload
            error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
            wait = error.get("retryAfterS")
            raise GatewayError(response.status_code, error.get("code") or "GATEWAY_ERROR",
                               payload.get("message") or f"HTTP {response.status_code}",
                               retry_after=wait if isinstance(wait, (int, float)) and wait > 0 else None)
        # The transport's own text names the internal host, port
        # and route ("HTTPConnectionPool(host='legalops-
        # assistant', port=3000) … /internal/llm/generate"); it
        # goes to the log, while the error — which ends up in
        # report, job and corpus rows users read — says what
        # happened in words
        except requests.Timeout as exc:
            logger.warning("Gateway %s timed out: %s", path, exc)
            failure = GatewayError(0, "GATEWAY_TIMEOUT", f"The AI service did not answer within {timeout} s")
        except requests.RequestException as exc:
            logger.warning("Gateway %s unreachable: %s", path, exc)
            failure = GatewayError(0, "GATEWAY_UNREACHABLE",
                                   f"The AI service could not be reached ({type(exc).__name__})")
        except GatewayError as exc:
            failure = exc
        if failure.status == 429 and patient and waited < RATE_LIMIT_PATIENCE_S:
            delay = (failure.retry_after or min(RATE_LIMIT_WAIT_S * (limited + 1), 60)) * random.uniform(0.75, 1.25)
            limited += 1
            waited += delay
            logger.warning("Gateway %s is rate limited — waiting %ds (%d s so far)", path, delay, waited)
            time.sleep(delay)
            continue
        unreachable = failure.code == "GATEWAY_UNREACHABLE" and retries > 0
        allowed = max(retries, CONNECTION_RETRIES) if unreachable else retries
        if not failure.retryable or attempt >= allowed:
            raise failure
        delay = min(BACKOFF_BASE_S * (3 ** attempt), BACKOFF_MAX_S)
        logger.warning("Gateway %s failed (%s) — retry %d in %ds", path, failure, attempt + 1, delay)
        time.sleep(delay)
        attempt += 1








############################################################
# generate
############################################################
#
# One model answer to a prompt, under an optional system text,
# from the named model or the assistant's default. `shared`
# is data that every call of one step carries — a report's
# company profile and documents: the assistant places it
# where the provider caches (behind the instructions), so the
# step pays for it once and reads it at a fraction after.
# `patient` is for background work: a rate limit is waited
# out instead of failing the call (_post). With a
# schema the answer's .object is the parsed JSON (the gateway
# enforces strict schemas: every property required,
# additionalProperties false, optional values as nullable
# types); without one, .text is the completion. The assistant
# reads the model's stream to its end before it answers, so
# the call takes as long as the model writes — up to
# GENERATE_TIMEOUT_S.
#
# Used by:
#   - corpus/obligations.py, analysis/pipeline.py,
#     prompts/api/views.py (test run)
############################################################

def generate(prompt, *, system=None, shared=None, model=None, schema=None, schema_name="result",
             temperature=None, max_output_tokens=None, timeout=GENERATE_TIMEOUT_S, retries=1, patient=False):
    body = {"prompt": prompt, "system": system, "shared": shared, "model": model, "schema": schema,
            "schemaName": schema_name, "temperature": temperature, "maxOutputTokens": max_output_tokens}
    payload = _post("/internal/llm/generate", {k: v for k, v in body.items() if v is not None}, timeout, retries,
                    patient=patient)
    usage = payload.get("usage") or {}
    return GenerateResult(
        text=payload.get("text"),
        object=payload.get("object"),
        model=payload.get("model") or model or "",
        finish_reason=payload.get("finishReason"),
        input_tokens=int(usage.get("inputTokens") or 0),
        output_tokens=int(usage.get("outputTokens") or 0),
        reasoning_tokens=int(usage.get("reasoningTokens") or 0),
        duration_ms=int(payload.get("durationMs") or 0),
        cached_input_tokens=int(usage.get("cachedInputTokens") or 0),
        cache_write_tokens=int(usage.get("cacheWriteTokens") or 0),
    )








############################################################
# embed
############################################################
#
#   embed(["text one", "text two"]) → EmbedResult with one
#   vector per text, in order
#
# The caller batches (at most 256 texts per call).
#
# Used by:
#   - corpus/ingest.py, companies/indexing.py,
#     corpus/search.py (the query vector)
############################################################

def embed(texts, *, model=None, timeout=120, retries=3):
    body = {"texts": list(texts)}
    if model:
        body["model"] = model
    payload = _post("/internal/llm/embed", body, timeout, retries)
    usage = payload.get("usage") or {}
    return EmbedResult(
        embeddings=payload.get("embeddings") or [],
        model=payload.get("model") or model or "",
        dimensions=int(payload.get("dimensions") or 0),
        tokens=int(usage.get("tokens") or 0),
        duration_ms=int(payload.get("durationMs") or 0),
    )








############################################################
# list_models
############################################################
#
# The configured providers and the gateway's models (with
# prices); an empty answer when the assistant is down.
#
# Used by:
#   - assistant/usage.py — the price table
#   - prompts/api/views.py — the model dropdown
############################################################

def list_models(timeout=20):
    try:
        response = requests.get(f"{settings.ASSISTANT_URL}/internal/llm/models", timeout=timeout,
                                headers={"X-Internal-Secret": settings.ASSISTANT_INTERNAL_SECRET})
        if response.status_code == 200:
            return response.json()
        logger.warning("Model list answered HTTP %s", response.status_code)
    except requests.RequestException as exc:
        logger.warning("Model list unavailable: %s", exc)
    return {"providers": [], "models": []}









############################################################
# mcp_list_tools
############################################################
#
#   mcp_list_tools({"url": ..., "transport": "http", "headers": {...}})
#       → [{"name", "description"}]
#
# The assistant connects to one MCP server and lists its
# tools — the admin's "test connection". Raises GatewayError
# with the connection failure.
#
# Used by:
#   - assistant/api/mcp_views.py — test
############################################################

def mcp_list_tools(server, timeout=45):
    payload = _post("/internal/mcp/list-tools", server, timeout, retries=0)
    return payload.get("tools") or []
