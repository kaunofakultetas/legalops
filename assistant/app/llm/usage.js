// -----------------------------------------------------------
//  [*] Assistant — the tokens of a model call
//
//  What a call costs depends on more than how many tokens
//  went in. The provider keeps the opening of a prompt it has
//  seen — a chat's instructions and history, the documents a
//  report's calls share — and bills what it reads from that
//  cache at a fraction of the input price, and what it writes
//  to it slightly above. A turn of twenty tool steps resends
//  its whole history twenty times and pays the full price for
//  very little of it.
//
//  So a call is counted in five numbers: the input whole, the
//  parts of it read from the cache and written to it, the
//  output, and the reasoning within the output. Django prices
//  each part (assistant/usage.py — cost_of); a provider that
//  reports no cache simply leaves those two at zero.
//
//  Split into:
//
//    usageOf  — the five counts of one call or step
//    addUsage — a step's counts added to a turn's total
//    usageLog — the counts as Django's turn log names them
// -----------------------------------------------------------







// -----------------------------------------------------------
// usageOf
// -----------------------------------------------------------
//
// The five counts of the usage the AI SDK reports for a call
// or a step — zero for whatever the provider did not report,
// and all zeros when given nothing, which is how a turn's
// total starts.
//
// Used by:
//   - addUsage (below)
//   - routes/internal.js — the generate route's answer
//   - routes/chat.js — the turn's total, before its first step
//   - services/title.js — the title call
// -----------------------------------------------------------

export function usageOf(usage) {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens ?? 0,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens ?? 0,
  };
}







// -----------------------------------------------------------
// addUsage
// -----------------------------------------------------------
//
// Adds one step's counts to a turn's running total, in place.
//
// Used by:
//   - routes/chat.js — at the end of every step of a turn
// -----------------------------------------------------------

export function addUsage(total, usage) {
  const step = usageOf(usage);
  for (const key of Object.keys(step)) total[key] += step[key];
  return total;
}







// -----------------------------------------------------------
// usageLog
// -----------------------------------------------------------
//
// The five counts under the names Django's turn log reads
// them by.
//
// Used by:
//   - routes/chat.js — the turn's telemetry row
//   - services/title.js — the title call's row
// -----------------------------------------------------------

export function usageLog(usage) {
  return {
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    cache_write_tokens: usage.cacheWriteTokens,
    output_tokens: usage.outputTokens,
    reasoning_tokens: usage.reasoningTokens,
  };
}
