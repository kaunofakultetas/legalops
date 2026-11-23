// -----------------------------------------------------------
//  [*] Assistant — the versioned system prompt
//
//  Django keeps immutable prompt versions, one active per
//  slug, edited in the GUI and never in code. This module
//  fetches a slug's active version; llm/prompt.js renders it.
//
//  Only real answers are cached. An answer, or a 404 for "no
//  active version", is reused for CACHE_MS, so an activation
//  reaches live turns within a minute. A failed refresh
//  serves the previous answer and retries after RETRY_MS. A
//  failure with nothing cached caches nothing and is a 503
//  PROMPT_UNAVAILABLE, so the next turn asks again instead of
//  running without a prompt for a minute.
//
//  Split into:
//
//    activePrompt             — a slug's active version
//    resetPromptCacheForTests — drop the cache
// -----------------------------------------------------------

import { HttpError } from "../middleware/errors.js";
import { internalFetch } from "./django.js";


// Milliseconds a real answer is reused
const CACHE_MS = 60_000;

// Milliseconds before a failed refresh is retried
const RETRY_MS = 5_000;

// Each slug's last answer and how long it stays fresh
const cache = new Map();

// The answer for "this slug has no active version"
const EMPTY = { id: null, version: null, text: "", model: null, temperature: null, maxTokens: null };







// -----------------------------------------------------------
// activePrompt
// -----------------------------------------------------------
//
// The slug's active version: its id, number, text, model,
// temperature and output cap, each null when Django sent
// none, except the text, which is then empty. A slug without
// an active version answers EMPTY, whose empty text the chat
// route refuses as 503 PROMPT_NOT_CONFIGURED (and the title
// call takes as "no AI titles").
//
// Used by:
//   - routes/chat.js — the POST handler, every turn
//   - services/title.js — nameThread, the chat.title prompt
// -----------------------------------------------------------

export async function activePrompt(slug) {
  const hit = cache.get(slug);
  if (hit && Date.now() < hit.until) return hit.answer;

  try {
    const row = await internalFetch(`/internal/assistant/prompt?slug=${encodeURIComponent(slug)}`);
    const answer = {
      id: row?.id ?? null,
      version: typeof row?.version === "number" ? row.version : null,
      text: typeof row?.text === "string" ? row.text : "",
      model: row?.model ?? null,
      temperature: row?.temperature ?? null,
      maxTokens: row?.maxTokens ?? null,
    };
    cache.set(slug, { until: Date.now() + CACHE_MS, answer });
    return answer;
  } catch (err) {
    if (err?.status === 404) {
      cache.set(slug, { until: Date.now() + CACHE_MS, answer: EMPTY });
      return EMPTY;
    }
    if (hit) {
      console.error(`Prompt fetch failed for ${slug} (serving the previous version):`, err?.message);
      hit.until = Date.now() + RETRY_MS;
      return hit.answer;
    }
    console.error(`Prompt fetch failed for ${slug} (nothing cached):`, err?.message);
    throw new HttpError(503, "PROMPT_UNAVAILABLE", "The assistant's instructions could not be loaded — try again shortly");
  }
}







// -----------------------------------------------------------
// resetPromptCacheForTests
// -----------------------------------------------------------
//
// Drops the cache between test cases.
//
// Used by:
//   - tests/prompts-service.test.mjs
//   - tests/chat-gate.test.mjs
//   - tests/errors.test.mjs
// -----------------------------------------------------------

export function resetPromptCacheForTests() {
  cache.clear();
}
