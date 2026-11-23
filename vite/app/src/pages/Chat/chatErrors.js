// -----------------------------------------------------------
//  [*] Chat — what went wrong, in the user's language
//
//  Chat failures arrive in four shapes:
//
//    - the AI SDK's APICallError for a refused request — the
//      HTTP status in statusCode and our JSON envelope
//      ({message, error: {code, retryAfterS?}}) as text;
//    - an Error whose message IS an envelope — the stream's
//      own error chunk (MODEL_TIMEOUT, STREAM_FAILED, …);
//    - an axios error from the thread / history / upload
//      calls — utils/errors.js already translates those;
//    - a failure the GUI finds itself, no request answered —
//      chatFailure(code) with a LOCAL_KEYS code (a new
//      conversation whose POST came back without an id).
//
//  chatErrorInfo() reduces any of them to plain facts
//  ({code, status, retryAfter, network}) that are stored in
//  state; describeChatError() turns the facts into a sentence
//  at RENDER time, so a language switch re-translates a
//  banner already on screen. Neither ever answers backend
//  prose or a bracketed code.
//
//  Split into:
//
//    TRANSPORT_FAILED  — how fetch words a dead connection
//    CODE_KEYS         — backend code → message key
//    LOCAL_KEYS        — the GUI's own code → message key
//    chatFailure       — an Error carrying a LOCAL_KEYS code
//    parseEnvelope     — JSON text → {code, retryAfter}
//    chatErrorInfo     — any error → facts
//    describeChatError — facts → the translated sentence
// -----------------------------------------------------------

import { errorMessage } from '@/utils/errors';


// A dead connection, as the engines word fetch's TypeError —
// before the answer ("Failed to fetch", "fetch failed", "Load
// failed") or while the stream is read ("network error",
// "NetworkError …"); the AI SDK tells a disconnect the same
// way. A TypeError from a bug ("Cannot read properties of
// undefined") is not one.
const TRANSPORT_FAILED = /fetch|network|load failed/i;







// -----------------------------------------------------------
// CODE_KEYS (exported for the tests)
// -----------------------------------------------------------
//
// Backend code → its chat sentence (PAGES.chat.ERRORS.<key>);
// anything else falls back to the app-wide table by status.
// Every code the assistant sends is here: its routes' refusals
// and the codes of its stream's error chunk (llm/stream.js) —
// a model's failure by whether trying again can help:
// MODEL_UNAVAILABLE asks to wait, MODEL_REFUSED to pick
// another model, MODEL_CONTEXT_EXCEEDED to start a new
// conversation, MODEL_CONTENT_FILTERED to rephrase, and
// MODEL_ACCESS_DENIED for the administrator. SHUTTING_DOWN is
// the 503 of a container being redeployed.
//
// Used by:
//   - describeChatError (below)
//   - tests/pages/chat-errors.test.jsx — every code, both
//     languages
// -----------------------------------------------------------

export const CODE_KEYS = {
  RATE_LIMITED: 'RATE_LIMITED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  AI_BUDGET_EXHAUSTED: 'AI_BUDGET_EXHAUSTED',
  MODEL_TIMEOUT: 'MODEL_TIMEOUT',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  MODEL_REFUSED: 'MODEL_REFUSED',
  MODEL_CONTEXT_EXCEEDED: 'MODEL_CONTEXT_EXCEEDED',
  MODEL_CONTENT_FILTERED: 'MODEL_CONTENT_FILTERED',
  MODEL_ACCESS_DENIED: 'MODEL_ACCESS_DENIED',
  STREAM_FAILED: 'STREAM_FAILED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  PROMPT_NOT_CONFIGURED: 'PROMPT_NOT_CONFIGURED',
  PROMPT_UNAVAILABLE: 'PROMPT_UNAVAILABLE',
  THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  PAYLOAD_TOO_LARGE: 'INPUT_TOO_LARGE',
  EMPTY_MESSAGE: 'EMPTY_MESSAGE',
  AUTH_REQUIRED: 'SESSION',
  SESSION_INVALID: 'SESSION',
  HISTORY_UNREADABLE: 'HISTORY',
  DJANGO_UNREACHABLE: 'SERVER',
  DJANGO_API_ERROR: 'SERVER',
  ASSISTANT_ERROR: 'SERVER',
  INTERNAL_ERROR: 'SERVER',
  SHUTTING_DOWN: 'RESTARTING',
  INVALID_JSON: 'INVALID',
  INVALID_BODY: 'INVALID',
  INVALID_MESSAGE: 'INVALID',
  INVALID_PART: 'INVALID',
  INVALID_PARENT: 'INVALID',
  INVALID_THREAD: 'INVALID',
  INVALID_TRIGGER: 'INVALID',
  MESSAGE_ID_TAKEN: 'INVALID',
  UNSUPPORTED_ENCODING: 'INVALID',
};







// -----------------------------------------------------------
// LOCAL_KEYS (exported for the tests)
// -----------------------------------------------------------
//
// The GUI's own failure codes → their chat sentence. Never
// sent by the assistant, so they stay out of CODE_KEYS (the
// assistant's list):
//
//   THREAD_NOT_CREATED — POST /api/chat/threads answered
//                        without the thread's id; the turn
//                        is not sent (see ChatRuntime)
//
// Used by:
//   - chatErrorInfo, describeChatError (below)
//   - tests/pages/chat-errors.test.jsx
// -----------------------------------------------------------

export const LOCAL_KEYS = {
  THREAD_NOT_CREATED: 'THREAD_NOT_CREATED',
};







// -----------------------------------------------------------
// chatFailure
// -----------------------------------------------------------
//
//   throw chatFailure('THREAD_NOT_CREATED')
//
// A failure no request answered: an Error tagged with a
// LOCAL_KEYS code (chatCode), which chatErrorInfo reads
// before any other shape.
//
// Used by:
//   - ChatRuntime.jsx — the thread list adapter's initialize()
//   - tests/pages/chat-errors.test.jsx
// -----------------------------------------------------------

export function chatFailure(code) {
  return Object.assign(new Error(code), { chatCode: code });
}







// -----------------------------------------------------------
// parseEnvelope (exported for the tests)
// -----------------------------------------------------------
//
// Our error envelope from a JSON string (a response body or
// a stream error text) → { code, retryAfter }, or null when
// the text is not one.
//
// Used by:
//   - chatErrorInfo (below)
//   - tests/pages/chat-errors.test.jsx
// -----------------------------------------------------------

export function parseEnvelope(text) {
  if (typeof text !== 'string' || !text.trim().startsWith('{')) return null;
  try {
    const body = JSON.parse(text);
    const nested = body?.error && typeof body.error === 'object' ? body.error : null;
    const code = nested?.code || (typeof body?.code === 'string' ? body.code : null);
    if (!code) return null;
    const retryAfter = Number(nested?.retryAfterS) || null;
    return { code, retryAfter };
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// chatErrorInfo
// -----------------------------------------------------------
//
//   chatErrorInfo(error) → { code, status, retryAfter, network, axios }
//
// The facts of one chat failure; `axios` keeps the original
// error for the app-wide translator when it came from axios.
// `network` only for a transport failure (TRANSPORT_FAILED).
// A chatFailure is its LOCAL_KEYS code and nothing else.
//
// Used by:
//   - ChatRuntime.jsx — useChat onError, adapter failures
//   - ThreadLink.jsx — a link that could not be saved
// -----------------------------------------------------------

export function chatErrorInfo(error) {
  if (error?.chatCode && LOCAL_KEYS[error.chatCode]) {
    return { code: error.chatCode, status: null, retryAfter: null, network: false, axios: null };
  }
  if (error?.isAxiosError || error?.response) {
    return { code: null, status: error.response?.status ?? null, retryAfter: null, network: !error.response, axios: error };
  }
  const envelope = parseEnvelope(error?.responseBody) || parseEnvelope(error?.message);
  const status = Number(error?.statusCode) || null;
  const network = !status && !envelope && error instanceof TypeError && TRANSPORT_FAILED.test(error.message || '');
  return { code: envelope?.code ?? null, status, retryAfter: envelope?.retryAfter ?? null, network, axios: null };
}







// -----------------------------------------------------------
// describeChatError
// -----------------------------------------------------------
//
//   describeChatError(info, t, locale) → "Per daug klausimų…"
//
// `t` is useTranslations('PAGES.chat.ERRORS'). Order: a chat
// code with its own sentence (the assistant's or the GUI's;
// 429 with the real wait), an axios error through
// utils/errors, then by status class, then the generic line.
//
// Used by:
//   - Thread.jsx — ChatErrorNotice
//   - ThreadLink.jsx — a link that could not be saved
// -----------------------------------------------------------

export function describeChatError(info, t, locale) {
  if (!info) return '';
  const key = info.code ? (CODE_KEYS[info.code] ?? LOCAL_KEYS[info.code] ?? null) : null;
  if (key === 'RATE_LIMITED') return info.retryAfter ? t('RATE_LIMITED', { seconds: info.retryAfter }) : t('RATE_LIMITED_NOWAIT');
  if (key) return t(key);
  if (info.axios) return errorMessage(info.axios, { locale });
  if (info.network) return t('NETWORK');
  if (info.status === 429) return t('RATE_LIMITED_NOWAIT');
  if (info.status === 401) return t('SESSION');
  if (info.status >= 500) return t('SERVER');
  if (info.status >= 400) return t('INVALID');
  return t('UNKNOWN');
}
