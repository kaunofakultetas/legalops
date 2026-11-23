// -----------------------------------------------------------
//  [*] Tests — the tokens of a model call (llm/usage.js)
//
//  The five counts read from what the AI SDK reports — the
//  input whole, its parts read from the provider's prompt
//  cache and written to it, the output and the reasoning —
//  zeros for whatever is missing; a turn's total as its
//  steps' sum; and the names Django's turn log reads them by.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";
import { addUsage, usageLog, usageOf } from "../llm/usage.js";


// A step whose input was mostly read from the prompt cache,
// as the AI SDK reports it
const CACHED_STEP = {
  inputTokens: 11_921,
  inputTokenDetails: { noCacheTokens: 3, cacheReadTokens: 11_903, cacheWriteTokens: 15 },
  outputTokens: 40,
  outputTokenDetails: { textTokens: 30, reasoningTokens: 10 },
  totalTokens: 11_961,
};


test("usageOf: the input whole, what was read from the cache and written to it, the output and its reasoning", () => {
  assert.deepEqual(usageOf(CACHED_STEP),
                   { inputTokens: 11_921, cachedInputTokens: 11_903, cacheWriteTokens: 15, outputTokens: 40, reasoningTokens: 10 });
});


test("usageOf: a provider that reports no cache, or nothing at all, counts zeros", () => {
  assert.deepEqual(usageOf({ inputTokens: 10, outputTokens: 5 }),
                   { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5, reasoningTokens: 0 });
  const zeros = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  for (const nothing of [undefined, null, {}, { inputTokens: undefined, inputTokenDetails: {} }]) {
    assert.deepEqual(usageOf(nothing), zeros);
  }
});


test("usageOf: the flat names older answers used are still read", () => {
  assert.deepEqual(usageOf({ inputTokens: 100, cachedInputTokens: 60, outputTokens: 9, reasoningTokens: 4 }),
                   { inputTokens: 100, cachedInputTokens: 60, cacheWriteTokens: 0, outputTokens: 9, reasoningTokens: 4 });
});


test("addUsage: a turn's total is the sum of its steps, each kind of token apart", () => {
  const total = usageOf();
  assert.equal(addUsage(total, CACHED_STEP), total, "added in place");
  addUsage(total, CACHED_STEP);
  addUsage(total, undefined);
  assert.deepEqual(total, { inputTokens: 23_842, cachedInputTokens: 23_806, cacheWriteTokens: 30, outputTokens: 80, reasoningTokens: 20 });
});


test("usageLog: the counts under the names Django's turn log reads", () => {
  assert.deepEqual(usageLog(usageOf(CACHED_STEP)), {
    input_tokens: 11_921, cached_input_tokens: 11_903, cache_write_tokens: 15, output_tokens: 40, reasoning_tokens: 10,
  });
});
