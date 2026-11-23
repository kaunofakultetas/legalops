// -----------------------------------------------------------
//  [*] Tests — provider-like model streams
//
//  mockModel.mjs scripts what a model says; liveStep also
//  scripts how a real provider behaves in time: chunks spaced
//  out, a stream that falls silent, and an abort handled the
//  way the gateway's fetch handles it — the stream errors with
//  the signal's reason the moment it fires. A plain simulated
//  stream ignores the abort and keeps talking, which no real
//  provider does.
//
//  Split into:
//
//    USAGE    — the usage every step reports
//    liveStep — one scripted step (a function of the call)
// -----------------------------------------------------------

// The usage block every step reports (reasoning included,
// and input read from the provider's prompt cache and written
// to it, so the turn log's sums of each are visible)
export const USAGE = {
  inputTokens: { total: 10, noCache: 2, cacheRead: 7, cacheWrite: 1 },
  outputTokens: { total: 5, text: 3, reasoning: 2 },
};







// -----------------------------------------------------------
// liveStep
// -----------------------------------------------------------
//
// One step for scripted(), built from the call it answers.
// The stream opens at once, waits firstDelayMs, then emits the
// tool call or the text deltas delayMs apart, and either
// finishes or, with end "stall", falls silent. On the call's
// abort every timer stops and the stream errors with the
// abort's reason, as undici does.
//
// Used by:
//   - tests/chat.test.mjs, tests/chat-runs.test.mjs,
//     tests/chat-limits.test.mjs, tests/stream.test.mjs
// -----------------------------------------------------------

export function liveStep({
  deltas = [], delayMs = 40, firstDelayMs = 0, end = "finish", finishReason = null, toolCall = null,
} = {}) {
  return ({ abortSignal }) => {
    const timers = new Set();
    const later = (ms, fn) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };
    const stream = new ReadableStream({
      start(controller) {
        const finish = (reason) => {
          controller.enqueue({ type: "finish", finishReason: { unified: reason, raw: reason }, usage: USAGE });
          controller.close();
        };
        controller.enqueue({ type: "stream-start", warnings: [] });
        abortSignal?.addEventListener("abort", () => {
          for (const timer of timers) clearTimeout(timer);
          timers.clear();
          try { controller.error(abortSignal.reason); } catch { /* already closed */ }
        }, { once: true });

        if (toolCall) {
          later(firstDelayMs, () => {
            controller.enqueue({
              type: "tool-call", toolCallId: toolCall.toolCallId ?? `call-${Math.random().toString(36).slice(2, 8)}`,
              toolName: toolCall.toolName, input: JSON.stringify(toolCall.input ?? {}),
            });
            if (end === "finish") finish(finishReason ?? "tool-calls");
          });
          return;
        }

        const emit = (index) => {
          if (index === 0) controller.enqueue({ type: "text-start", id: "t1" });
          if (index < deltas.length) {
            controller.enqueue({ type: "text-delta", id: "t1", delta: deltas[index] });
            later(delayMs, () => emit(index + 1));
            return;
          }
          if (end !== "finish") return;
          controller.enqueue({ type: "text-end", id: "t1" });
          finish(finishReason ?? "stop");
        };
        if (deltas.length || end === "finish") later(firstDelayMs, () => emit(0));
      },
    });
    return { stream };
  };
}
