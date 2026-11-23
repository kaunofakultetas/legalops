// -----------------------------------------------------------
//  [*] Assistant — the internal LLM gateway
//
//  Django's worker never calls a model provider itself: every
//  pipeline step and embedding batch comes through here, so
//  the providers and their credentials live in one container.
//
//    POST /internal/llm/generate — one completion: text, or an
//                                  object of a JSON schema
//    POST /internal/llm/embed    — a batch of embeddings
//    GET  /internal/llm/models   — the providers and the
//                                  gateway's models with prices
//
//  Every route sits behind requireInternal (app.js). The SDK
//  retries a failed call twice, except a spent budget, which
//  is asked once; a rate limit that outlasts that is answered
//  as a 429 with the wait the provider asks for, and the
//  worker waits it out. A generation is read from the provider as a
//  stream and answered whole, so a model that writes for many
//  minutes is not cut by the five minutes Node waits for the
//  first byte of a response. Its usage says how much of the
//  input the provider read from its prompt cache and wrote to
//  it (llm/usage.js), and the model list carries the prices of
//  both where the gateway names them — the worker's cost of a
//  call counts each part at its own price.
//
//  The provider caches the instructions of a request (and a
//  whole earlier request that a later one repeats or
//  extends), but nothing of a message that only begins like
//  an earlier one: such a message is billed in full every
//  time (measured 2026-11-10 on gpt-6.1-sol — the same
//  8 800-token block was read from the cache when it stood in
//  the instructions, and written anew as the opening of a
//  user message, as a message of its own, with a cache key
//  and with a retention hint). So what the calls of one step
//  share — a report's company profile and documents — comes
//  as `shared` and is placed behind the instructions.
//
//  Split into:
//
//    readGenerateBody   — the generate request, validated
//    qualifiedModel     — a model spec as "prefix:id"
//    schemaOutput       — the schema, sent and checked
//    fetchGatewayModels — the gateway's model list, cached
//    providerFailure    — a failed call as the worker's error
//    fitDimensions      — a vector cut to the columns' width
//    router             — the three routes (default export)
// -----------------------------------------------------------

import { Router } from "express";
import { Output, embedMany, jsonSchema, streamText } from "ai";
import { z } from "zod";

import {
  AI_CHAT_MODEL, AI_EMBED_MODEL, AI_GATEWAY_KEY, AI_GATEWAY_URL, EMBED_TIMEOUT_MS, GENERATE_TIMEOUT_MS,
} from "../config.js";
import { HttpError, classifyProviderError, providerPause } from "../middleware/errors.js";
import {
  configuredProviders, finalBudgetRefusals, parseModelId, resolveEmbeddingModel, resolveModel,
} from "../llm/provider.js";
import { usageOf } from "../llm/usage.js";


// The most texts one embed call may carry (the worker batches
// below it)
const MAX_EMBED_TEXTS = 256;

// How long the gateway's model list is reused
const MODELS_CACHE_MS = 10 * 60_000;

// The width of Django's vector columns (EMBED_DIMENSIONS in
// its companies and corpus models)
const EMBED_DIMENSIONS = 1536;

// The embedding models that accept the API's dimensions
// option; no other family is asked for a width
const DIMENSIONED_MODEL = /text-embedding-3/;

// The last gateway model list and when it was fetched
let modelsCache = { at: 0, models: [] };

// The Express router this module exports
const router = Router();







// -----------------------------------------------------------
// readGenerateBody
// -----------------------------------------------------------
//
// Validates the generate request: a non-empty prompt; an
// optional model, system text, temperature and output cap;
// optional `shared` data that the calls of one step all carry;
// an optional JSON schema, which must be strict-mode shaped
// (the gateway enforces strict schemas).
//
// Used by:
//   - the generate route (below)
// -----------------------------------------------------------

export function readGenerateBody(body) {
  if (typeof body?.prompt !== "string" || !body.prompt.trim()) {
    throw new HttpError(400, "INVALID_PROMPT", "prompt must be a non-empty string");
  }
  if (body.system != null && typeof body.system !== "string") {
    throw new HttpError(400, "INVALID_SYSTEM", "system must be a string");
  }
  if (body.shared != null && typeof body.shared !== "string") {
    throw new HttpError(400, "INVALID_SHARED", "shared must be a string");
  }
  if (body.schema != null && (typeof body.schema !== "object" || Array.isArray(body.schema))) {
    throw new HttpError(400, "INVALID_SCHEMA", "schema must be a JSON-schema object");
  }
  const temperature = body.temperature == null ? undefined : Number(body.temperature);
  if (temperature !== undefined && !(temperature >= 0 && temperature <= 2)) {
    throw new HttpError(400, "INVALID_TEMPERATURE", "temperature must be between 0 and 2");
  }
  const maxOutputTokens = body.maxOutputTokens == null ? undefined : Math.floor(Number(body.maxOutputTokens));
  if (maxOutputTokens !== undefined && !(maxOutputTokens > 0 && maxOutputTokens <= 128_000)) {
    throw new HttpError(400, "INVALID_MAX_TOKENS", "maxOutputTokens must be between 1 and 128000");
  }
  return {
    model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null,
    system: body.system || undefined,
    shared: body.shared || undefined,
    prompt: body.prompt,
    schema: body.schema || null,
    schemaName: typeof body.schemaName === "string" ? body.schemaName.slice(0, 64) : "result",
    temperature,
    maxOutputTokens,
  };
}







// -----------------------------------------------------------
// qualifiedModel
// -----------------------------------------------------------
//
// A model spec the way Django records and prices it, as
// "prefix:id" — the gateway's prefix when the spec names none.
//
// Used by:
//   - the generate and embed routes (below)
// -----------------------------------------------------------

function qualifiedModel(spec) {
  const { prefix, id } = parseModelId(spec);
  return `${prefix}:${id}`;
}







// -----------------------------------------------------------
// schemaOutput
// -----------------------------------------------------------
//
// The schema goes to the provider as a strict response format,
// and the answer is checked against it here as well: a provider
// without strict mode may drift, and Django reads the object by
// key, so a renamed key would silently mean "no findings". A
// mismatch fails the call (a 502 the worker retries). A schema
// the checker cannot read is sent unchecked.
//
// Used by:
//   - the generate route (below)
// -----------------------------------------------------------

function schemaOutput(schema, name) {
  let validator = null;
  try {
    validator = z.fromJSONSchema(schema);
  } catch (err) {
    console.warn(`Schema "${name}" cannot be checked here (${err?.message}) — trusting the provider's strict mode`);
  }
  const validate = (value) => {
    const result = validator.safeParse(value);
    return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
  };
  return Output.object({ name, schema: jsonSchema(schema, validator ? { validate } : {}) });
}







// -----------------------------------------------------------
// fetchGatewayModels
// -----------------------------------------------------------
//
// The gateway's model list (ids, context sizes, prices —
// those of input read from the prompt cache and written to
// it are null where the gateway names none), newest first by
// the date the gateway gives each model, so
// every model picker opens on the latest; a model without a
// date goes last, and the models of one date keep the
// gateway's order. Cached ten minutes. A failure keeps the
// previous list and is retried after a minute, so a gateway
// hiccup never empties the prompt editor's model picker.
//
// Used by:
//   - the models route (below)
// -----------------------------------------------------------

async function fetchGatewayModels() {
  if (!AI_GATEWAY_KEY) return [];
  if (Date.now() - modelsCache.at < MODELS_CACHE_MS) return modelsCache.models;
  try {
    const response = await fetch(`${AI_GATEWAY_URL}/models`, {
      headers: { "x-bf-vk": AI_GATEWAY_KEY, Authorization: `Bearer ${AI_GATEWAY_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`the gateway answered HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.data)) throw new Error("the gateway's answer holds no model list");
    // `created` is in seconds; sort() is stable, which keeps
    // the gateway's order within one date
    const released = (m) => (Number.isFinite(m?.created) ? m.created : 0);
    const perToken = (price) => (price == null || !Number.isFinite(Number(price)) ? null : Number(price));
    const models = [...data.data].sort((a, b) => released(b) - released(a)).map((m) => ({
      id: `gateway:${m.id}`,
      name: m.normalized_name || m.id,
      kind: /embedding/i.test(m.id) ? "embedding" : "chat",
      contextLength: m.context_length ?? null,
      maxOutputTokens: m.max_output_tokens ?? null,
      pricing: m.pricing ? {
        promptPerToken: Number(m.pricing.prompt) || 0,
        completionPerToken: Number(m.pricing.completion) || 0,
        cacheReadPerToken: perToken(m.pricing.input_cache_read),
        cacheWritePerToken: perToken(m.pricing.input_cache_write),
      } : null,
    }));
    modelsCache = { at: Date.now(), models };
  } catch (err) {
    console.error("Gateway model list failed (keeping previous):", err?.message);
    modelsCache.at = Date.now() - MODELS_CACHE_MS + 60_000;
  }
  return modelsCache.models;
}







// -----------------------------------------------------------
// providerFailure
// -----------------------------------------------------------
//
// A failed model call as the error the worker receives. A
// spent budget is 402 AI_BUDGET_EXHAUSTED, which the worker
// does not retry. A rate limit is a 429 — also when the
// provider reported it inside a stream, with no status — with
// the wait the provider asks for (providerPause), which the
// worker sits out before it asks again. Anything else keeps
// its upstream status, so the worker can tell a retryable 5xx
// from a 4xx. The worker is the only caller, so the cause
// rides in the message and a failed job step says what went
// wrong.
//
// Used by:
//   - the generate and embed routes (below)
// -----------------------------------------------------------

function providerFailure(err, code, label) {
  if (err instanceof HttpError) return err;
  const cause = String(err?.message || err).slice(0, 500);
  const { statusCode, budget } = classifyProviderError(err);
  if (budget) {
    return new HttpError(402, "AI_BUDGET_EXHAUSTED",
                         `The AI provider's budget is exhausted — try again later or contact the administrator (${cause})`,
                         { cause });
  }
  const { limited, retryAfterS } = providerPause(err);
  if (limited) return new HttpError(429, code, `${label}: ${cause}`, { cause, retryAfterS });
  const status = statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 502;
  return new HttpError(status, code, `${label}: ${cause}`, { cause });
}







// -----------------------------------------------------------
// fitDimensions
// -----------------------------------------------------------
//
// Cuts a vector to the width of Django's columns the way the
// API's dimensions option does — its prefix, renormalised — so
// a provider that ignored the option still fits. A shorter
// vector is passed on, and the column refuses it.
//
// Used by:
//   - the embed route (below)
// -----------------------------------------------------------

function fitDimensions(vector) {
  if (vector.length <= EMBED_DIMENSIONS) return vector;
  const prefix = vector.slice(0, EMBED_DIMENSIONS);
  const norm = Math.hypot(...prefix) || 1;
  return prefix.map((value) => value / norm);
}







// -----------------------------------------------------------
// generate route
// -----------------------------------------------------------
//
// POST /internal/llm/generate
//
// One completion: with a schema the answer is the checked
// object, otherwise plain text. The instructions the provider
// reads are the system text and, behind it, the request's
// `shared` data — the one place the provider caches, so the
// calls of a step that share it pay for it once (see the
// header). The provider is asked for a
// stream, which is read here to its end, and the worker gets
// the whole answer at once: a slow model writes a long answer
// for many minutes, and Node drops a response whose first
// byte takes longer than five, while a stream begins at once.
// A stream that reports an error after it began is a failed
// call, never a shorter answer — the SDK would end it
// quietly, so the error is kept and thrown here. The answer
// names the model that ran — AI_CHAT_MODEL when the request
// names none — because the worker records and prices the
// call by it.
//
// Used by:
//   - Django — assistant/gateway.py generate(), every
//     pipeline step
// -----------------------------------------------------------

router.post("/generate", async (req, res, next) => {
  try {
    const input = readGenerateBody(req.body);
    const spec = input.model || AI_CHAT_MODEL;
    const startedAt = Date.now();
    let model;
    try {
      model = resolveModel(spec);
    } catch (err) {
      throw new HttpError(400, "UNKNOWN_MODEL", err.message);
    }
    let failure = null;
    const result = streamText({
      model: finalBudgetRefusals(model),
      instructions: [input.system, input.shared].filter(Boolean).join("\n\n") || undefined,
      prompt: input.prompt,
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
      maxRetries: 2,
      timeout: GENERATE_TIMEOUT_MS,
      onError: ({ error }) => { failure ??= error; },
      ...(input.schema ? { output: schemaOutput(input.schema, input.schemaName) } : {}),
    });
    // The provider's own error says more than the SDK's "no
    // output generated", and tells a retryable 429 from a 4xx
    const answer = await (input.schema ? result.output : result.text).then(
      (value) => { if (failure) throw failure; return value; },
      (err) => { throw failure ?? err; },
    );
    res.json({
      model: qualifiedModel(spec),
      text: input.schema ? null : answer,
      object: input.schema ? answer : null,
      finishReason: await result.finishReason,
      usage: usageOf(await result.usage),
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    return next(providerFailure(err, "GENERATION_FAILED", "Model call failed"));
  }
});







// -----------------------------------------------------------
// embed route
// -----------------------------------------------------------
//
// POST /internal/llm/embed
//
// Embeds a batch of texts with AI_EMBED_MODEL (or the model
// the request names), every vector cut to the columns' width.
// A batch that outlives EMBED_TIMEOUT_MS is aborted and
// answered as a 502 the worker retries.
//
// Used by:
//   - Django — assistant/gateway.py embed(), for indexing and
//     search
// -----------------------------------------------------------

router.post("/embed", async (req, res, next) => {
  try {
    const texts = req.body?.texts;
    if (!Array.isArray(texts) || texts.length === 0 || texts.some((t) => typeof t !== "string")) {
      throw new HttpError(400, "INVALID_TEXTS", "texts must be a non-empty array of strings");
    }
    if (texts.length > MAX_EMBED_TEXTS) {
      throw new HttpError(400, "TOO_MANY_TEXTS", `At most ${MAX_EMBED_TEXTS} texts per call`);
    }
    const spec = typeof req.body.model === "string" && req.body.model.trim() ? req.body.model.trim() : AI_EMBED_MODEL;
    let model;
    try {
      model = resolveEmbeddingModel(spec);
    } catch (err) {
      throw new HttpError(400, "UNKNOWN_MODEL", err.message);
    }
    const startedAt = Date.now();
    // Empty strings make some providers fail the whole batch —
    // a single space embeds to a harmless neutral vector
    const values = texts.map((t) => (t.trim() ? t : " "));
    const dimensions = { dimensions: EMBED_DIMENSIONS };
    const result = await embedMany({
      model: finalBudgetRefusals(model), values, maxParallelCalls: 4, maxRetries: 2,
      abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      providerOptions: DIMENSIONED_MODEL.test(spec) ? { openaiCompatible: dimensions, openai: dimensions } : undefined,
    });
    const embeddings = result.embeddings.map(fitDimensions);
    res.json({
      model: qualifiedModel(spec),
      embeddings,
      dimensions: embeddings[0]?.length ?? 0,
      usage: { tokens: result.usage?.tokens ?? 0 },
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    return next(providerFailure(err, "EMBEDDING_FAILED", "Embedding call failed"));
  }
});







// -----------------------------------------------------------
// models route
// -----------------------------------------------------------
//
// GET /internal/llm/models
//
// The configured providers and the models the gateway serves,
// newest first, with the prices the cost tracking uses.
//
// Used by:
//   - Django — assistant/gateway.py list_models(), behind
//     GET /api/llm/models (the prompt editor's model picker)
// -----------------------------------------------------------

router.get("/models", async (_req, res, next) => {
  try {
    res.json({ providers: configuredProviders(), models: await fetchGatewayModels() });
  } catch (err) {
    next(err);
  }
});


export default router;
