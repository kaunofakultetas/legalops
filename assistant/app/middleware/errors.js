// -----------------------------------------------------------
//  [*] Assistant — error handling
//
//  One failure discipline for the whole service: routes throw
//  HttpError, and the error middleware turns every throw into
//  the JSON envelope the GUI and Django read — a message and
//  an error code, and on a 429 the seconds to wait. Any other
//  throw is a generic 500 (a bad body or path keeps its 4xx),
//  its real message kept for the log. A failure in the middle
//  of a chat stream never reaches here: llm/stream.js folds it
//  into the stream.
//
//  Provider failures are classified here once, so a spent
//  budget or quota is AI_BUDGET_EXHAUSTED everywhere, and a
//  rate limit, however worded, stays a pause. A refusal that
//  no retry will turn — the request itself, or the key — is
//  told apart from a pause, so the user is never asked to
//  wait for an answer that will not come.
//
//  Split into:
//
//    HttpError             — the typed throw
//    normalizeError        — any throw as one shape
//    errorMiddleware       — the Express error tail
//    classifyProviderError — a provider failure: status, budget
//    providerPause         — a provider's rate limit, and its wait
//    providerFailureKind   — what a provider failure means for
//                            the person who asked
//    formatStreamError     — the log line of a stream failure
// -----------------------------------------------------------

import { clientKeyOf } from "../services/clientIp.js";


// The status, code and message each body-parser failure gets
const BODY_ERRORS = {
  "entity.parse.failed": [400, "INVALID_JSON", "Request body is not valid JSON"],
  "entity.too.large": [413, "PAYLOAD_TOO_LARGE", "Request body too large"],
  "encoding.unsupported": [415, "UNSUPPORTED_ENCODING", "Unsupported request encoding"],
  "charset.unsupported": [415, "UNSUPPORTED_ENCODING", "Unsupported request charset"],
};

// How providers say the money ran out ("Budget exceeded",
// "exceeded your current quota", "credit balance is too low"):
// a money word and a ran-out word must both appear
const BUDGET_WORDS = [/budget|quota|billing|insufficient[ _]funds|credit balance/i, /exceed|exhaust|insufficient|reached|spent|too low/i];

// The statuses a worded budget failure arrives with
// (Anthropic's 400, a 403, OpenAI's 429, or none); a 5xx that
// mentions a quota is an outage, not a spent account
const BUDGET_STATUSES = new Set([400, 403, 429]);

// A rate limit, however worded, is a pause — Azure's carries a
// money word (its quota link) and an "exceeded". Not "too many
// requests": OpenAI's spent quota arrives as that 429
const RATE_LIMIT_WORDS = /rate[ _-]?limit|call rate|retry after \d/i;

// The seconds a provider's rate-limit message asks to wait
const RETRY_AFTER_WORDS = /retry after (\d{1,4})/i;

// The client-error statuses that still mean "not now": a
// timeout, a conflict, a rate limit (the SDK retries them too)
const PAUSE_STATUSES = new Set([408, 409, 429]);

// A request longer than the model takes: the conversation,
// with what its tools read, outgrew the model's context
const CONTEXT_WORDS = /context_length_exceeded|context (?:length|window)|maximum context|too many tokens|(?:input|prompt) is too long/i;

// A request the provider's content filter stopped — Azure's
// content management policy (code content_filter)
const FILTER_WORDS = /content[ _]filter|content management policy|responsibleaipolicyviolation/i;

// A refusal of the model rather than of the key: the gateway
// answers a model its key may not use (or no longer serves)
// with a 403 — "Model '…' is not allowed for this virtual key"
const MODEL_REFUSAL_WORDS = /\bmodel\b.*\bnot allowed|model_not_found|\bmodel\b.*\bdoes not exist/i;







// -----------------------------------------------------------
// HttpError
// -----------------------------------------------------------
//
// The error thrown on purpose: an HTTP status, a machine code,
// a human message, and optional details for the log only —
// except a 429's retryAfterS, which the GUI shows.
//
// Used by:
//   - app.js, middleware/internal.js and every routes/ file
//   - services/django.js, identity.js, prompts.js,
//     ratelimit.js, transcript.js
//   - llm/tools/shared.js — the tools' failures
// -----------------------------------------------------------

export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}







// -----------------------------------------------------------
// normalizeError
// -----------------------------------------------------------
//
// Reduces any thrown value to a status, code, message and
// details. An HttpError passes through, a body-parser failure
// keeps its 4xx, a path whose %-escapes do not decode is a
// 400; anything else is a generic 500 whose real message, or
// the thrown value itself, stays in the details for the log.
//
// Used by:
//   - errorMiddleware (below)
//   - tests/errors.test.mjs
// -----------------------------------------------------------

export function normalizeError(err) {
  if (err instanceof HttpError) {
    return {
      status: err.status || 500,
      code: err.code || "ASSISTANT_ERROR",
      message: err.message || "Assistant error",
      details: err.details ?? null,
    };
  }
  const known = BODY_ERRORS[err?.type];
  if (known) {
    return { status: known[0], code: known[1], message: known[2], details: err?.message || null };
  }
  if (err?.type && Number(err?.status) >= 400 && Number(err?.status) < 500) {
    return { status: Number(err.status), code: "INVALID_BODY", message: "Invalid request body", details: err?.message || null };
  }
  if (err instanceof URIError && Number(err.status) === 400) {
    return { status: 400, code: "BAD_REQUEST", message: "Malformed request path", details: err.message };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal assistant error",
    details: err?.stack || err?.message || (err == null ? null : String(err)),
  };
}







// -----------------------------------------------------------
// errorMiddleware
// -----------------------------------------------------------
//
// Logs the failure with the client's address (a 5xx with its
// details) and answers the envelope without them; a 429 also
// gets Retry-After. Once headers are out, as in a live stream,
// it only closes the response.
//
// Used by:
//   - app.js — createApp, registered last
// -----------------------------------------------------------

export function errorMiddleware(err, req, res, _next) {
  const normal = normalizeError(err);
  const line = `[${normal.status}] ${normal.code}: ${normal.message} (${req.method} ${req.originalUrl} from ${clientKeyOf(req)})`;
  if (normal.status >= 500) {
    console.error(line, normal.details ? String(typeof normal.details === "string" ? normal.details
      : JSON.stringify(normal.details)).slice(0, 800) : "");
  } else {
    console.warn(line);
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  const retryAfterS = normal.status === 429 ? Number(normal.details?.retryAfterS) || null : null;
  if (retryAfterS) res.set("Retry-After", String(retryAfterS));
  res.status(normal.status).json({
    message: normal.message,
    error: { code: normal.code, message: normal.message, ...(retryAfterS ? { retryAfterS } : {}) },
  });
}







// -----------------------------------------------------------
// classifyProviderError
// -----------------------------------------------------------
//
// A failed provider call's HTTP status — its own, or that of
// the last attempt or cause it wraps — and whether it means
// the account's budget or quota is spent: a 402, or a 400,
// 403, 429 or missing status whose text says so. Rate-limit
// wording never reads as a spent budget, even when it
// mentions a quota.
//
// Used by:
//   - llm/provider.js — finalBudgetRefusals (no retry)
//   - llm/stream.js — streamErrorText (the chat's error code)
//   - routes/chat.js — streamTurn (the reply's status)
//   - routes/internal.js — providerFailure (the 402)
// -----------------------------------------------------------

export function classifyProviderError(err) {
  const inner = err?.lastError ?? err?.cause ?? null;
  const statusCode = Number(err?.statusCode ?? inner?.statusCode) || null;
  const text = [err?.message, err?.responseBody, inner?.message, inner?.responseBody]
    .filter((value) => typeof value === "string").join(" ");
  const worded = BUDGET_WORDS.every((pattern) => pattern.test(text)) && !RATE_LIMIT_WORDS.test(text);
  const budget = statusCode === 402 || ((statusCode == null || BUDGET_STATUSES.has(statusCode)) && worded);
  return { statusCode, budget };
}







// -----------------------------------------------------------
// providerPause
// -----------------------------------------------------------
//
// Whether a failed provider call is a rate limit, and how long
// the provider asks to wait. A rate limit is a 429 that is not
// a spent budget — or, with no status at all, the words of
// one: a provider that had begun its stream reports the limit
// inside it (Azure's "exceeded token rate limit" under a
// report's large calls), and the SDK hands that on as a parse
// failure. The wait is the provider's Retry-After header, else
// the seconds its message names, else unknown.
//
// Used by:
//   - routes/internal.js — providerFailure (the worker's 429)
// -----------------------------------------------------------

export function providerPause(err) {
  const inner = err?.lastError ?? err?.cause ?? null;
  const { statusCode, budget } = classifyProviderError(err);
  const text = [err?.message, err?.responseBody, inner?.message, inner?.responseBody]
    .filter((value) => typeof value === "string").join(" ");
  const limited = !budget && (statusCode === 429 || (statusCode == null && RATE_LIMIT_WORDS.test(text)));
  if (!limited) return { limited: false, retryAfterS: null };
  const header = Number(err?.responseHeaders?.["retry-after"] ?? inner?.responseHeaders?.["retry-after"]);
  const worded = Number(RETRY_AFTER_WORDS.exec(text)?.[1]);
  const retryAfterS = header > 0 ? Math.ceil(header) : worded > 0 ? worded : null;
  return { limited: true, retryAfterS };
}







// -----------------------------------------------------------
// providerFailureKind
// -----------------------------------------------------------
//
// What a failed provider call means for the person who asked:
// whether asking again can help, and if not, what can. A
// spent budget is "budget" (classifyProviderError). A client
// error other than a pause is final: "context" when the
// request is longer than the model takes (or too large to
// send), "filtered" when the provider's content filter
// stopped it, "access" when the key was refused (401, or a
// 403 that is not about the model — only an administrator
// can help), and "refused" for any other, the gateway's 403
// for a model its key may not use included — this model will
// not take this request, however often it is asked. Everything else is "transient": the
// network, a timeout, a rate limit, the provider's own 5xx.
// The status and words are read through a retry's last
// attempt, and a failure mid-stream carries its own code.
//
// Used by:
//   - llm/stream.js — streamErrorText (the chat's error code)
// -----------------------------------------------------------

export function providerFailureKind(err) {
  const { statusCode, budget } = classifyProviderError(err);
  if (budget) return "budget";
  if (statusCode == null || statusCode < 400 || statusCode >= 500 || PAUSE_STATUSES.has(statusCode)) return "transient";
  const inner = err?.lastError ?? err?.cause ?? null;
  const words = [err?.message, err?.responseBody, err?.code, err?.type, inner?.message, inner?.responseBody, inner?.code, inner?.type]
    .filter((value) => typeof value === "string").join(" ");
  if (statusCode === 413 || CONTEXT_WORDS.test(words)) return "context";
  if (FILTER_WORDS.test(words)) return "filtered";
  if (statusCode === 401 || (statusCode === 403 && !MODEL_REFUSAL_WORDS.test(words))) return "access";
  return "refused";
}







// -----------------------------------------------------------
// formatStreamError
// -----------------------------------------------------------
//
// The log line of a failure mid-stream: the error's name and
// message, capped at 300 characters, never a dump of the SDK's
// error object. It never reaches the browser.
//
// Used by:
//   - routes/chat.js — streamTurn, the stream's onError
// -----------------------------------------------------------

export function formatStreamError(error) {
  const name = error?.name || "Error";
  const message = error?.message || String(error);
  return `${name}: ${message}`.slice(0, 300);
}
