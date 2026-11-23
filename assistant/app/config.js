// -----------------------------------------------------------
//  [*] Assistant — configuration
//
//  Every environment variable and tuning constant of the
//  service, read once when the module is first imported. The
//  limits are the abuse ceilings the routes enforce before any
//  model call.
//
//  The environment it reads; unset or blank is the default:
//
//    PORT                       3000
//    DJANGO_URL                 http://legalops-django:8000
//    ASSISTANT_INTERNAL_SECRET  empty — internal calls refused
//    AI_GATEWAY_URL             https://ai.knf.vu.lt/v1
//    AI_GATEWAY_KEY             empty — no gateway
//    AI_CHAT_MODEL              gateway:azure/gpt-5.5
//    AI_EMBED_MODEL             gateway:azure/text-embedding-3-large
//    ANTHROPIC_API_KEY          empty — no "anthropic:" ids
//    OPENAI_API_KEY             empty — no "openai:" ids
//    OLLAMA_BASE_URL            empty — no "ollama:" ids
//    CHAT_TIMEOUT_MS            900000  (a whole chat turn)
//    CHAT_STEP_TIMEOUT_MS       300000  (one model step)
//    CHAT_CHUNK_TIMEOUT_MS       90000  (silence between chunks)
//    GENERATE_TIMEOUT_MS        900000  (one generate call)
//    EMBED_TIMEOUT_MS            60000  (one embed batch)
//    RATE_LIMIT_TURNS               12  (turns per user a minute)
//    IDENTITY_CACHE_MS           15000  (0 asks Django every turn)
//    SHUTDOWN_GRACE_MS          190000  (0 aborts turns at once)
//
//  A number that is not a plain integer in its range falls
//  back to the default with a boot warning: as NaN or 0 it
//  would time out every turn or switch the rate limit off.
//  URLs lose their trailing slashes; keys, secrets and model
//  ids are kept byte for byte.
//
//  Split into (the settings first, one banner each):
//
//    intFromEnv  — a numeric setting, range-checked
//    urlFromEnv  — a base URL without trailing slashes
//    textFromEnv — a key, a secret or a model id
// -----------------------------------------------------------


// The longest delay a Node timer can hold (2^31 − 1 ms, about
// 24.8 days); a longer one fires at once
const MAX_TIMER_MS = 2_147_483_647;







// -----------------------------------------------------------
// PORT
// -----------------------------------------------------------
//
// The port Express listens on: Caddy proxies /api/assistant/*
// here, and Django calls /internal/* directly.
//
// Used by:
//   - server.js
// -----------------------------------------------------------

export const PORT = intFromEnv("PORT", 3000, 1, 65_535);







// -----------------------------------------------------------
// DJANGO_URL
// -----------------------------------------------------------
//
// The Django container: its public API, called with the
// user's bearer, and its /internal/assistant/* door.
//
// Used by:
//   - services/django.js — every Django call
// -----------------------------------------------------------

export const DJANGO_URL = urlFromEnv("DJANGO_URL", "http://legalops-django:8000");







// -----------------------------------------------------------
// INTERNAL_SECRET
// -----------------------------------------------------------
//
// ASSISTANT_INTERNAL_SECRET: the shared secret of the
// internal door, in both directions. Empty refuses every
// internal call (fail closed) and server.js warns at boot;
// any other value is used byte for byte, as Django
// compares it.
//
// Used by:
//   - services/django.js — internalFetch
//   - middleware/internal.js — requireInternal
//   - server.js — the boot warning
// -----------------------------------------------------------

export const INTERNAL_SECRET = textFromEnv("ASSISTANT_INTERNAL_SECRET", "");







// -----------------------------------------------------------
// AI_GATEWAY_URL
// -----------------------------------------------------------
//
// The university gateway's base URL (OpenAI wire format).
//
// Used by:
//   - llm/provider.js — the gateway provider
//   - routes/internal.js — fetchGatewayModels
// -----------------------------------------------------------

export const AI_GATEWAY_URL = urlFromEnv("AI_GATEWAY_URL", "https://ai.knf.vu.lt/v1");







// -----------------------------------------------------------
// AI_GATEWAY_KEY
// -----------------------------------------------------------
//
// The gateway key, sent both as x-bf-vk and as a bearer.
// Empty means the gateway provider is not configured.
//
// Used by:
//   - llm/provider.js — the gateway provider
//   - routes/internal.js — fetchGatewayModels
// -----------------------------------------------------------

export const AI_GATEWAY_KEY = textFromEnv("AI_GATEWAY_KEY", "");







// -----------------------------------------------------------
// AI_CHAT_MODEL
// -----------------------------------------------------------
//
// The model a chat turn or a generate call runs when its
// prompt version or request names none; an id without a known
// provider prefix is a gateway id.
//
// Used by:
//   - llm/provider.js — resolveModel, isModelConfigured
//   - routes/internal.js — the generate route
// -----------------------------------------------------------

export const AI_CHAT_MODEL = textFromEnv("AI_CHAT_MODEL", "gateway:azure/gpt-5.5");







// -----------------------------------------------------------
// AI_EMBED_MODEL
// -----------------------------------------------------------
//
// The model every stored vector comes from (corpus chunks,
// obligations, company documents), so changing it means the
// full re-embed (corpus.reembed without a document). The
// -large model, cut to the 1536 dimensions Django stores,
// matches Lithuanian and English text far better than -small.
//
// Used by:
//   - llm/provider.js — resolveEmbeddingModel
//   - routes/internal.js — the embed route
// -----------------------------------------------------------

export const AI_EMBED_MODEL = textFromEnv("AI_EMBED_MODEL", "gateway:azure/text-embedding-3-large");







// -----------------------------------------------------------
// ANTHROPIC_API_KEY
// -----------------------------------------------------------
//
// Optional: enables "anthropic:<model>" ids.
//
// Used by:
//   - llm/provider.js
// -----------------------------------------------------------

export const ANTHROPIC_API_KEY = textFromEnv("ANTHROPIC_API_KEY", "");







// -----------------------------------------------------------
// OPENAI_API_KEY
// -----------------------------------------------------------
//
// Optional: enables "openai:<model>" ids.
//
// Used by:
//   - llm/provider.js
// -----------------------------------------------------------

export const OPENAI_API_KEY = textFromEnv("OPENAI_API_KEY", "");







// -----------------------------------------------------------
// OLLAMA_BASE_URL
// -----------------------------------------------------------
//
// Optional: an Ollama server's OpenAI-compatible base URL
// enables "ollama:<model>" ids. The assistant must be able to
// reach it, and from the isolated network only the egress
// allowlist is reachable (docs/markdown/en/deployment.md).
//
// Used by:
//   - llm/provider.js
// -----------------------------------------------------------

export const OLLAMA_BASE_URL = urlFromEnv("OLLAMA_BASE_URL", "");







// -----------------------------------------------------------
// CHAT_TIMEOUT_MS
// -----------------------------------------------------------
//
// The longest a whole chat turn may stream. A quarter of an
// hour: the turn in which a company's documents arrive reads
// them all and files the whole profile, the credentials and
// the role profiles before it answers — with two dozen
// documents that alone is several minutes.
//
// Used by:
//   - routes/chat.js — streamTurn
// -----------------------------------------------------------

export const CHAT_TIMEOUT_MS = intFromEnv("CHAT_TIMEOUT_MS", 900_000, 1);







// -----------------------------------------------------------
// CHAT_STEP_TIMEOUT_MS
// -----------------------------------------------------------
//
// The ceiling for one model step (one tool round) — long
// enough for a reasoning model writing a full gap summary,
// or the role profiles of a company in one round.
//
// Used by:
//   - routes/chat.js — streamTurn
// -----------------------------------------------------------

export const CHAT_STEP_TIMEOUT_MS = intFromEnv("CHAT_STEP_TIMEOUT_MS", 300_000, 1);







// -----------------------------------------------------------
// CHAT_CHUNK_TIMEOUT_MS
// -----------------------------------------------------------
//
// The longest silent gap between two streamed chunks —
// reasoning models think silently before the first token.
//
// Used by:
//   - routes/chat.js — streamTurn
// -----------------------------------------------------------

export const CHAT_CHUNK_TIMEOUT_MS = intFromEnv("CHAT_CHUNK_TIMEOUT_MS", 90_000, 1);







// -----------------------------------------------------------
// GENERATE_TIMEOUT_MS
// -----------------------------------------------------------
//
// The ceiling of one /internal/llm/generate call (a pipeline
// step over a batch of articles): fifteen minutes, because a
// model that writes some 70 tokens a second needs five or
// more for the obligations of a dense batch. Django waits
// half a minute longer (GENERATE_TIMEOUT_S in its
// assistant/gateway.py), so the two move together.
//
// Used by:
//   - routes/internal.js — the generate route
// -----------------------------------------------------------

export const GENERATE_TIMEOUT_MS = intFromEnv("GENERATE_TIMEOUT_MS", 900_000, 1);







// -----------------------------------------------------------
// EMBED_TIMEOUT_MS
// -----------------------------------------------------------
//
// The ceiling of one embed batch, the SDK's retries included:
// half the 120 s the worker waits, so a hung gateway call
// becomes a 502 the worker retries instead of running on
// after Django gave up.
//
// Used by:
//   - routes/internal.js — the embed route
// -----------------------------------------------------------

export const EMBED_TIMEOUT_MS = intFromEnv("EMBED_TIMEOUT_MS", 60_000, 1);







// -----------------------------------------------------------
// MAX_STEPS
// -----------------------------------------------------------
//
// The model steps one chat turn may chain. The last one runs
// without tools so the turn ends in text; if it still ends
// without any, llm/stream.js adds a fallback line. Two dozen:
// reading a company's documents, filing its records and then
// answering took nine steps before the role profiles and the
// classification were part of it.
//
// Used by:
//   - routes/chat.js — streamTurn
// -----------------------------------------------------------

export const MAX_STEPS = 24;







// -----------------------------------------------------------
// MAX_MESSAGE_CHARS
// -----------------------------------------------------------
//
// The most text one user message may carry. The GUI sends
// only the new message (the history is Django's), so this is
// the whole per-request text ceiling.
//
// Used by:
//   - routes/chat.js — readTurnBody
// -----------------------------------------------------------

export const MAX_MESSAGE_CHARS = 60_000;







// -----------------------------------------------------------
// MAX_REQUEST_BYTES
// -----------------------------------------------------------
//
// Express's JSON limit on the public chat routes — one user
// message plus its ids (Caddy still allows 2 MB).
//
// Used by:
//   - app.js — createApp
// -----------------------------------------------------------

export const MAX_REQUEST_BYTES = "512kb";







// -----------------------------------------------------------
// MAX_HISTORY_MESSAGES
// -----------------------------------------------------------
//
// The longest branch rebuilt from Django; the oldest messages
// past it are dropped.
//
// Used by:
//   - services/transcript.js — buildBranch
// -----------------------------------------------------------

export const MAX_HISTORY_MESSAGES = 200;







// -----------------------------------------------------------
// MAX_HISTORY_CHARS
// -----------------------------------------------------------
//
// The serialized size of the model messages one turn may
// send (~100k tokens); whole old turns are dropped first.
//
// Used by:
//   - llm/messages.js — fitHistory
// -----------------------------------------------------------

export const MAX_HISTORY_CHARS = 400_000;







// -----------------------------------------------------------
// TITLE_TIMEOUT_MS
// -----------------------------------------------------------
//
// The longest the call naming a conversation may take. It
// runs beside the first answer, and the turn's stream ends
// only once the title is stored, so a slow model can hold
// the end of a quick answer this long at most; past it the
// automatic title stays.
//
// Used by:
//   - services/title.js — nameThread
// -----------------------------------------------------------

export const TITLE_TIMEOUT_MS = 8_000;







// -----------------------------------------------------------
// TITLE_INPUT_CHARS
// -----------------------------------------------------------
//
// How much of the first message the title model reads — its
// opening says what the conversation is about, and a long
// pasted document would only cost tokens.
//
// Used by:
//   - services/title.js — nameThread
// -----------------------------------------------------------

export const TITLE_INPUT_CHARS = 2_000;







// -----------------------------------------------------------
// RATE_LIMIT_TURNS
// -----------------------------------------------------------
//
// Chat turns per user per window (at least 1).
//
// Used by:
//   - services/ratelimit.js — checkTurnLimit
// -----------------------------------------------------------

export const RATE_LIMIT_TURNS = intFromEnv("RATE_LIMIT_TURNS", 12, 1);







// -----------------------------------------------------------
// RATE_LIMIT_WINDOW_MS
// -----------------------------------------------------------
//
// The window length of the turn limiter.
//
// Used by:
//   - services/ratelimit.js — checkTurnLimit
// -----------------------------------------------------------

export const RATE_LIMIT_WINDOW_MS = 60_000;







// -----------------------------------------------------------
// IDENTITY_CACHE_MS
// -----------------------------------------------------------
//
// How long a validated bearer is trusted before Django is
// asked again. Short on purpose: a logout or a deactivation
// must be felt within seconds, and any 401 from Django evicts
// the token at once. 0 asks Django on every turn.
//
// Used by:
//   - services/identity.js — resolveIdentity
// -----------------------------------------------------------

export const IDENTITY_CACHE_MS = intFromEnv("IDENTITY_CACHE_MS", 15_000, 0);







// -----------------------------------------------------------
// SHUTDOWN_GRACE_MS
// -----------------------------------------------------------
//
// How long live chat turns get to finish after a stop signal
// before they are aborted and stored as interrupted. A turn
// may run far longer (CHAT_TIMEOUT_MS), so the default only
// covers one that is nearly done — and compose sets no
// stop_grace_period, so Docker kills the process after 10 s.
//
// Used by:
//   - server.js — shutdown
// -----------------------------------------------------------

export const SHUTDOWN_GRACE_MS = intFromEnv("SHUTDOWN_GRACE_MS", 190_000, 0);







// -----------------------------------------------------------
// intFromEnv
// -----------------------------------------------------------
//
// An integer setting: unset or blank is the default, and any
// other value must be plain digits from min to max (by
// default the longest timer delay), or the default is used
// and a warning says so.
//
// Used by:
//   - every numeric setting above
// -----------------------------------------------------------

function intFromEnv(name, fallback, min, max = MAX_TIMER_MS) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  console.warn(`${name}=${JSON.stringify(raw.slice(0, 40))} is not an integer from ${min} to ${max} — using ${fallback}`);
  return fallback;
}







// -----------------------------------------------------------
// urlFromEnv
// -----------------------------------------------------------
//
// A base URL setting without its trailing slashes: the
// clients append their own paths, and a doubled slash is a
// different route upstream.
//
// Used by:
//   - DJANGO_URL, AI_GATEWAY_URL, OLLAMA_BASE_URL (above)
// -----------------------------------------------------------

function urlFromEnv(name, fallback) {
  return (process.env[name]?.trim() || fallback).replace(/\/+$/, "");
}







// -----------------------------------------------------------
// textFromEnv
// -----------------------------------------------------------
//
// A text setting (a key, a secret, a model id): unset or
// blank is the default — a whitespace-only key must not count
// as configured — and any other value is kept byte for byte.
//
// Used by:
//   - INTERNAL_SECRET, the provider keys, the model ids (above)
// -----------------------------------------------------------

function textFromEnv(name, fallback) {
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== "" ? raw : fallback;
}
