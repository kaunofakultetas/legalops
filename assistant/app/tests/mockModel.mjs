// -----------------------------------------------------------
//  [*] Tests — scripted language models
//
//  Builders for MockLanguageModelV4 stream results, so a test
//  reads as the script of what the model says, one step per
//  model call.
//
//  Split into:
//
//    USAGE          — the usage every step reports
//    textStream     — one text answer
//    toolCallStream — one tool call
//    slowTextStream — one text answer, chunks spaced out
//    scripted       — the model that plays the script
// -----------------------------------------------------------

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";


// The usage block every scripted step reports
const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};







// -----------------------------------------------------------
// textStream
// -----------------------------------------------------------
//
// One step that answers the text in two deltas and finishes
// with the given reason, stop by default. An empty text sends
// no text part at all.
//
// Used by:
//   - scripted (below) — past the end of the script
//   - tests/chat, chat-gate, chat-limits, chat-mcp, stream,
//     transcript and mcp (.test.mjs)
// -----------------------------------------------------------

export function textStream(text, finish = "stop") {
  const half = Math.ceil(text.length / 2);
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start", warnings: [] },
      ...(text ? [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: text.slice(0, half) },
        { type: "text-delta", id: "t1", delta: text.slice(half) },
        { type: "text-end", id: "t1" },
      ] : []),
      { type: "finish", finishReason: { unified: finish, raw: finish }, usage: USAGE },
    ]),
  };
}







// -----------------------------------------------------------
// toolCallStream
// -----------------------------------------------------------
//
// One step that calls the named tool with the input and
// finishes for tool calls; the call id is random unless the
// test names one.
//
// Used by:
//   - tests/chat, chat-mcp, stream, transcript and mcp
//     (.test.mjs)
// -----------------------------------------------------------

export function toolCallStream(toolName, input, toolCallId = `call-${Math.random().toString(36).slice(2, 8)}`) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start", warnings: [] },
      { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE },
    ]),
  };
}







// -----------------------------------------------------------
// slowTextStream
// -----------------------------------------------------------
//
// One step whose text deltas arrive delayMs apart. It keeps
// talking after the call is aborted, which no provider does,
// so a turn a test stops mid-answer runs on
// helpers/liveModel.mjs instead.
//
// Used by:
//   - tests/helpers/serverPreload.mjs
// -----------------------------------------------------------

export function slowTextStream(deltas, delayMs = 40) {
  return {
    stream: simulateReadableStream({
      initialDelayInMs: 0,
      chunkDelayInMs: delayMs,
      chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        ...deltas.map((delta) => ({ type: "text-delta", id: "t1", delta })),
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
      ],
    }),
  };
}







// -----------------------------------------------------------
// scripted
// -----------------------------------------------------------
//
// A MockLanguageModelV4 that answers each call with the next
// step of the script. A step given as a function is called
// with the call's options, so it can look at what the model
// was sent; past the end the model answers "(end of script)".
//
// Used by:
//   - tests/chat, chat-gate, chat-limits, chat-mcp,
//     chat-runs, stream, transcript and mcp (.test.mjs)
// -----------------------------------------------------------

export function scripted(steps) {
  const queue = [...steps];
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const step = queue.shift();
      if (!step) return textStream("(end of script)");
      return typeof step === "function" ? step(options) : step;
    },
  });
}
