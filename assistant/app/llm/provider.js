// -----------------------------------------------------------
//  [*] Assistant — the model door (provider registry)
//
//  A model is named by a provider prefix and the provider's
//  own id; a spec without a known prefix is the gateway's:
//
//    gateway:   — the university gateway, OpenAI's API:
//                 language models on its Responses API,
//                 embeddings on /embeddings; AI_GATEWAY_KEY
//                 goes as x-bf-vk and bearer
//    openai:    — OpenAI, with OPENAI_API_KEY
//    anthropic: — Anthropic, with ANTHROPIC_API_KEY
//    ollama:    — an Ollama server at OLLAMA_BASE_URL
//
//  Embedding models use the same scheme. A provider without
//  credentials fails loudly instead of handing the call to
//  another one, and so does a spec that names no model. A
//  caller that lets the SDK retry wraps its model in
//  finalBudgetRefusals, so a spent budget is asked once.
//
//  The gateway's language models run on the Responses API
//  (/v1/responses), not chat completions: its newer models
//  (GPT-6 Astra, GPT-6.1 Sol) take function tools only
//  there, and the chat always sends its tools. Every call is
//  stateless (gatewayLanguageModel).
//
//  Split into:
//
//    parseModelId          — a spec as its prefix and id
//    requireModelId        — the same, refusing an empty id
//    providerFor           — a prefix's provider, built once
//    isReasoningModel      — a gateway model reasons first
//    gatewayLanguageModel  — a gateway model, stateless
//    isModelConfigured     — the default chat model is usable
//    configuredProviders   — the prefixes with credentials
//    setModelForTests      — mock models for the tests
//    resolveModel          — the language model of a spec
//    resolveEmbeddingModel — the embedding model of a spec
//    finalBudgetRefusals   — budget refusals made final
// -----------------------------------------------------------

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapEmbeddingModel, wrapLanguageModel } from "ai";

import {
  AI_CHAT_MODEL, AI_EMBED_MODEL, AI_GATEWAY_KEY, AI_GATEWAY_URL,
  ANTHROPIC_API_KEY, OLLAMA_BASE_URL, OPENAI_API_KEY,
} from "../config.js";
import { classifyProviderError } from "../middleware/errors.js";


// The providers by prefix: whether each holds its
// credentials, how to build it — once, since its headers are
// static and it keeps no state — and how it makes a language
// model and an embedding model (Anthropic makes none). The
// gateway is two clients on one key: OpenAI's for the
// Responses API, the OpenAI-compatible one for embeddings
const PROVIDERS = {
  gateway: {
    configured: () => AI_GATEWAY_KEY.length > 0,
    build: () => ({
      responses: createOpenAI({ name: "gateway", baseURL: AI_GATEWAY_URL, apiKey: AI_GATEWAY_KEY,
                                headers: { "x-bf-vk": AI_GATEWAY_KEY } }),
      compatible: createOpenAICompatible({ name: "gateway", baseURL: AI_GATEWAY_URL,
                                           headers: { "x-bf-vk": AI_GATEWAY_KEY, Authorization: `Bearer ${AI_GATEWAY_KEY}` } }),
    }),
    language: (built, id) => gatewayLanguageModel(built.responses, id),
    embedding: (built, id) => built.compatible.embeddingModel(id),
  },
  openai: {
    configured: () => OPENAI_API_KEY.length > 0,
    build: () => createOpenAI({ apiKey: OPENAI_API_KEY }),
    language: (built, id) => built(id),
    embedding: (built, id) => built.embeddingModel(id),
  },
  anthropic: {
    configured: () => ANTHROPIC_API_KEY.length > 0,
    build: () => createAnthropic({ apiKey: ANTHROPIC_API_KEY }),
    language: (built, id) => built(id),
  },
  ollama: {
    configured: () => OLLAMA_BASE_URL.length > 0,
    build: () => createOpenAICompatible({ name: "ollama", baseURL: OLLAMA_BASE_URL, includeUsage: true }),
    language: (built, id) => built.chatModel(id),
    embedding: (built, id) => built.embeddingModel(id),
  },
};

// The providers built so far, by prefix
const built = new Map();

// Mock models planted by the tests; the app never sets them
const overrides = { language: null, embedding: null };







// -----------------------------------------------------------
// parseModelId
// -----------------------------------------------------------
//
// Splits a model spec into its provider prefix and id. Only a
// known prefix before the first colon counts, so an Ollama
// tag keeps its own colon and any other spec is a gateway id.
// The spec is trimmed, and so is the id after a prefix.
//
// Used by:
//   - requireModelId, isModelConfigured (below)
//   - routes/internal.js — qualifiedModel
// -----------------------------------------------------------

export function parseModelId(spec) {
  const value = String(spec || "").trim();
  const colon = value.indexOf(":");
  if (colon > 0 && Object.hasOwn(PROVIDERS, value.slice(0, colon))) {
    return { prefix: value.slice(0, colon), id: value.slice(colon + 1).trim() };
  }
  return { prefix: "gateway", id: value };
}







// -----------------------------------------------------------
// requireModelId
// -----------------------------------------------------------
//
// parseModelId, but a spec that names no model throws here:
// built anyway, it would only fail at the provider, as a
// confusing 400 in the middle of a stream.
//
// Used by:
//   - resolveModel, resolveEmbeddingModel (below)
// -----------------------------------------------------------

function requireModelId(spec) {
  const parsed = parseModelId(spec);
  if (!parsed.id) throw new Error(`Model id "${String(spec ?? "").slice(0, 80)}" names no model`);
  return parsed;
}







// -----------------------------------------------------------
// providerFor
// -----------------------------------------------------------
//
// The provider of a prefix, built on first use and reused;
// throws when the provider has no credentials.
//
// Used by:
//   - resolveModel, resolveEmbeddingModel (below)
// -----------------------------------------------------------

function providerFor(prefix) {
  const entry = PROVIDERS[prefix];
  if (!entry) throw new Error(`Unknown model provider "${prefix}"`);
  if (!entry.configured()) throw new Error(`Model provider "${prefix}" is not configured (missing key or URL)`);
  if (!built.has(prefix)) built.set(prefix, entry.build());
  return built.get(prefix);
}







// -----------------------------------------------------------
// isReasoningModel
// -----------------------------------------------------------
//
// Whether a gateway model reasons before it answers: GPT-5
// and later (not the "chat" variant of a whole version) and
// the o series. It is the SDK's own rule for OpenAI's ids,
// read here on the name after the gateway's deployment
// prefix (azure/…), which the SDK's check does not expect.
//
// Used by:
//   - gatewayLanguageModel (below)
// -----------------------------------------------------------

function isReasoningModel(id) {
  const name = id.slice(id.lastIndexOf("/") + 1);
  const gpt = /^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/.exec(name);
  if (gpt) return Number(gpt[1]) >= 5 && !(gpt[2] === undefined && (gpt[3] ?? "").startsWith("chat"));
  return /^o\d+(?:-|$)/.test(name);
}







// -----------------------------------------------------------
// gatewayLanguageModel
// -----------------------------------------------------------
//
// A gateway language model on the Responses API, every call
// stateless: store is off, so neither the gateway nor Azure
// keeps what was asked and answered, and a tool turn sends
// its earlier steps back in full rather than by reference.
// A reasoning model is marked as one (forceReasoning), since
// the SDK cannot tell from the gateway's id: it then asks for
// the model's reasoning in encrypted form, which the next
// step of a stateless tool turn must be handed back, and
// sends the system prompt as the developer message. It takes
// no temperature, so that is left out here — the SDK would
// drop it too, with a console warning on every call. A
// call's own provider options win over these.
//
// Used by:
//   - PROVIDERS.gateway (above)
// -----------------------------------------------------------

function gatewayLanguageModel(responses, id) {
  const reasoning = isReasoningModel(id);
  const defaults = reasoning ? { store: false, forceReasoning: true } : { store: false };
  return wrapLanguageModel({
    model: responses.responses(id),
    middleware: {
      transformParams: async ({ params }) => ({
        ...params,
        ...(reasoning && { temperature: undefined, topP: undefined }),
        providerOptions: { ...params.providerOptions, openai: { ...defaults, ...params.providerOptions?.openai } },
      }),
    },
  });
}







// -----------------------------------------------------------
// isModelConfigured
// -----------------------------------------------------------
//
// Whether the default chat model's provider holds its
// credentials, or the tests planted a model — the chat route
// answers a clean 503 otherwise.
//
// Used by:
//   - server.js — the boot warning
//   - app.js — /health
//   - routes/chat.js — the POST handler, before streaming
// -----------------------------------------------------------

export function isModelConfigured() {
  if (overrides.language) return true;
  return PROVIDERS[parseModelId(AI_CHAT_MODEL).prefix]?.configured() ?? false;
}







// -----------------------------------------------------------
// configuredProviders
// -----------------------------------------------------------
//
// The prefixes that hold credentials right now — what a
// prompt editor may offer.
//
// Used by:
//   - app.js — /health
//   - routes/internal.js — the models route
// -----------------------------------------------------------

export function configuredProviders() {
  return Object.entries(PROVIDERS).filter(([, entry]) => entry.configured()).map(([prefix]) => prefix);
}







// -----------------------------------------------------------
// setModelForTests
// -----------------------------------------------------------
//
// Plants mock models that the resolvers return instead of a
// provider's, so routes run deterministically with no
// network; called with nothing, it clears them.
//
// Used by:
//   - tests/helpers/chatApp.mjs — startChatApp
//   - tests/helpers/serverPreload.mjs — the spawned server
//   - tests/internal.test.mjs, tests/mcp.test.mjs,
//     tests/provider.test.mjs, tests/transcript.test.mjs
// -----------------------------------------------------------

export function setModelForTests({ language = null, embedding = null } = {}) {
  overrides.language = language;
  overrides.embedding = embedding;
}







// -----------------------------------------------------------
// resolveModel
// -----------------------------------------------------------
//
// The language model a spec names, or AI_CHAT_MODEL when no
// spec is given; a planted test model wins over both. OpenAI
// and Anthropic models come from their own SDKs, the
// gateway's on its Responses API (gatewayLanguageModel),
// Ollama's as OpenAI-compatible chat models. Throws when the
// spec names no model or its provider has no credentials.
//
// Used by:
//   - routes/chat.js — streamTurn
//   - routes/internal.js — the generate route
//   - services/title.js — nameThread
// -----------------------------------------------------------

export function resolveModel(qualified = null) {
  if (overrides.language) return overrides.language;
  const { prefix, id } = requireModelId(qualified || AI_CHAT_MODEL);
  return PROVIDERS[prefix].language(providerFor(prefix), id);
}







// -----------------------------------------------------------
// resolveEmbeddingModel
// -----------------------------------------------------------
//
// The embedding model a spec names, or AI_EMBED_MODEL when no
// spec is given; a planted test model wins over both.
// Anthropic offers no embedding models, so asking for one
// throws.
//
// Used by:
//   - routes/internal.js — the embed route
// -----------------------------------------------------------

export function resolveEmbeddingModel(qualified = null) {
  if (overrides.embedding) return overrides.embedding;
  const { prefix, id } = requireModelId(qualified || AI_EMBED_MODEL);
  if (prefix === "anthropic") throw new Error("Anthropic offers no embedding models");
  return PROVIDERS[prefix].embedding(providerFor(prefix), id);
}







// -----------------------------------------------------------
// finalBudgetRefusals
// -----------------------------------------------------------
//
// The same model — language or embedding, a provider's or a
// planted one — with its budget and quota refusals made
// final. The SDK retries every error marked retryable, a 429
// included, but a spent budget does not come back in seconds:
// a failure classifyProviderError flags as budget is rethrown
// marked not retryable, so it is asked once. A plain rate
// limit and a 5xx are still retried.
//
// Used by:
//   - routes/internal.js — the generate and embed routes
// -----------------------------------------------------------

export function finalBudgetRefusals(model) {
  const final = (err) => {
    if (err?.isRetryable === true && classifyProviderError(err).budget) err.isRetryable = false;
    throw err;
  };
  if (typeof model.doEmbed === "function") {
    return wrapEmbeddingModel({ model, middleware: { wrapEmbed: ({ doEmbed }) => doEmbed().catch(final) } });
  }
  return wrapLanguageModel({ model, middleware: {
    wrapGenerate: ({ doGenerate }) => doGenerate().catch(final),
    wrapStream: ({ doStream }) => doStream().catch(final),
  } });
}
