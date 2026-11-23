// -----------------------------------------------------------
//  [*] Tests — the answer stream (llm/stream.js)
//
//  shapeTurn, streamErrorText and pipeToResponse alone, over
//  hand-made parts and a fake Express response; then whole
//  turns through the real AI SDK loop wired as routes/chat.js
//  wires it, over scripted models and real tools, read back
//  as SSE by a real http client. A stop meets a model that
//  ends on the abort as providers do (helpers/liveModel.mjs).
//
//  Defects guarded here:
//
//    ASSISTANT-ROUTES-6 — bad tool input stored as STREAM_FAILED
//    ASSISTANT-LLM-19   — the stream named no charset
//    ASSISTANT-LLM-20   — the empty line after a full answer
//    ASSISTANT-LLM-24   — a rawInput warning per refused call
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { mock, test } from "node:test";

import "./env.mjs";
import {
  APICallError, InvalidToolInputError, NoSuchToolError, RetryError, StreamProviderError, UI_MESSAGE_STREAM_HEADERS, isStepCount, streamText,
  toUIMessageStream,
} from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";

import { MAX_STEPS } from "../config.js";
import { TurnTimeoutError, pipeToResponse, shapeTurn, streamErrorText } from "../llm/stream.js";
import { ToolFailure, defineTool } from "../llm/tools/shared.js";
import { classifyProviderError, HttpError } from "../middleware/errors.js";
import { sdkAbortSignal } from "../routes/chat.js";
import { liveStep } from "./helpers/liveModel.mjs";
import { scripted, textStream, toolCallStream } from "./mockModel.mjs";


// The usage a reasoning step reports (3 reasoning tokens)
const REASONING_USAGE = {
  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 9, text: 6, reasoning: 3 },
};

// What the chat stream answers with: the AI SDK's own stream
// headers, the charset named (ASSISTANT-LLM-19)
const SSE_HEADERS = { ...UI_MESSAGE_STREAM_HEADERS, "content-type": "text/event-stream; charset=utf-8" };

// The warning the AI SDK raises from its own code for every
// refused tool call (quietSdkWarnings filters it)
const RAW_INPUT_SETTING = "rawInput in output-error UI message parts";







// -----------------------------------------------------------
// shape
// -----------------------------------------------------------
//
// Runs hand-made stream parts through shapeTurn and returns
// the parts that came out and the fallbacks it noted.
//
// Used by:
//   - the shapeTurn tests (below)
// -----------------------------------------------------------

async function shape(parts, { language = "lt", run = null } = {}) {
  const notes = [];
  const stream = new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(shapeTurn({ language, run, onNote: (kind) => notes.push(kind) }));
  const out = [];
  for await (const part of stream) out.push(part);
  return { parts: out, notes };
}







// -----------------------------------------------------------
// injected
// -----------------------------------------------------------
//
// The text shapeTurn added itself — its fallback lines, told
// apart by their part ids.
//
// Used by:
//   - the shapeTurn tests (below)
// -----------------------------------------------------------

function injected(parts) {
  return parts.filter((p) => p.type === "text-delta" && String(p.id).startsWith("fallback-")).map((p) => p.text).join("");
}







// -----------------------------------------------------------
// FakeResponse
// -----------------------------------------------------------
//
// The slice of an Express response that pipeToResponse uses.
// It records the frames and flushes; write reports a full
// buffer once highWater writes are pending, until the test
// calls drain().
//
// Used by:
//   - the pipeToResponse tests (below)
// -----------------------------------------------------------

class FakeResponse extends EventEmitter {
  constructor(highWater = Infinity) {
    super();
    Object.assign(this, { status: null, headers: null, frames: [], flushes: 0, pending: 0, highWater, writableEnded: false });
  }

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
  }

  flushHeaders() {}

  write(bytes) {
    this.frames.push(new TextDecoder().decode(bytes));
    this.pending += 1;
    return this.pending < this.highWater;
  }

  flush() {
    this.flushes += 1;
  }

  drain() {
    this.pending = 0;
    this.emit("drain");
  }

  end() {
    this.writableEnded = true;
  }
}







// -----------------------------------------------------------
// chunkStream
// -----------------------------------------------------------
//
// A UI chunk stream of count text deltas, optionally slow,
// that records whether it was cancelled.
//
// Used by:
//   - the pipeToResponse tests (below)
// -----------------------------------------------------------

function chunkStream(count, delayMs = 0) {
  const state = { cancelled: false, sent: 0 };
  const stream = new ReadableStream({
    async pull(controller) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (state.sent === count) return controller.close();
      state.sent += 1;
      controller.enqueue({ type: "text-delta", id: "t", delta: `c${state.sent}` });
    },
    cancel() { state.cancelled = true; },
  });
  return { stream, state };
}







// -----------------------------------------------------------
// lookupTool
// -----------------------------------------------------------
//
// A real defineTool tool that records its calls: the query
// "missing" fails as Django's 404, "crash" throws
// unexpectedly, and anything else is found.
//
// Used by:
//   - runTurn (below)
// -----------------------------------------------------------

function lookupTool(calls) {
  return defineTool("lookup", {
    description: "Look something up",
    input: z.strictObject({ q: z.string().min(1) }),
    run: async ({ q }) => {
      if (q === "missing") throw new HttpError(404, "NOT_FOUND", "Nothing found");
      if (q === "crash") throw new TypeError("secret internal detail");
      return { found: q };
    },
  }, { record: (call) => calls.push(call) });
}







// -----------------------------------------------------------
// runTurn
// -----------------------------------------------------------
//
// One whole turn, wired as routes/chat.js streamTurn wires it
// (a copy: keep the two in step) and served by pipeToResponse
// on a real http server; the client presses stop when a chunk
// of the stopOn type arrives. Returns what the client read,
// what the persist hook received with the reply's status, the
// usage summed per step and the tool calls.
//
// Used by:
//   - the turn tests and the ASSISTANT-LLM-20 test (below)
// -----------------------------------------------------------

async function runTurn({ steps, language = "lt", timeout = undefined, stopOn = null }) {
  const model = scripted(steps);
  const calls = [];
  const tools = { lookup: lookupTool(calls) };
  const controller = new AbortController();
  const run = { signal: controller.signal, stopReason: null };
  const usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  let finished;
  const ended = new Promise((resolve) => { finished = resolve; });

  const server = http.createServer(async (_req, res) => {
    const result = streamText({
      model, messages: [{ role: "user", content: "Klausimas" }], tools, maxRetries: 0, abortSignal: sdkAbortSignal(run.signal), timeout,
      stopWhen: isStepCount(MAX_STEPS),
      prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" } : undefined),
      onStepEnd: ({ usage: step }) => {
        usage.inputTokens += step?.inputTokens ?? 0;
        usage.outputTokens += step?.outputTokens ?? 0;
        usage.reasoningTokens += step?.outputTokenDetails?.reasoningTokens ?? step?.reasoningTokens ?? 0;
      },
      onError: () => {},
    });
    let fallback = null;
    let status = null;
    const messageMetadata = ({ part }) => {
      if (part.type === "abort") status = run.stopReason === "user" ? "stopped" : "interrupted";
      else if (part.type === "error") {
        status = part.error instanceof TurnTimeoutError ? "timeout" : classifyProviderError(part.error).budget ? "budget" : "error";
      } else if (part.type === "finish" && fallback) status = fallback;
      else return undefined;
      return { status };
    };
    const uiStream = toUIMessageStream({
      stream: result.stream.pipeThrough(shapeTurn({ language, run, onNote: (kind) => { fallback = kind; } })),
      tools,
      originalMessages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Klausimas" }] }],
      generateMessageId: () => "srv-test",
      messageMetadata,
      onError: streamErrorText,
      onEnd: (event) => finished({ ...event, status }),
    });
    const [toBrowser, toServer] = uiStream.tee();
    toServer.pipeTo(new WritableStream()).catch(() => {});
    await pipeToResponse(toBrowser, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), SSE_HEADERS["content-type"]);
    const chunks = [];
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const bytes of response.body) {
      buffer += decoder.decode(bytes, { stream: true });
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, cut).replace(/^data: /, "");
        buffer = buffer.slice(cut + 2);
        if (!frame || frame === "[DONE]") continue;
        const chunk = JSON.parse(frame);
        chunks.push(chunk);
        if (stopOn && chunk.type === stopOn && !run.stopReason) {
          run.stopReason = "user";
          controller.abort(new Error("Turn user"));
        }
      }
    }
    const end = await ended;
    const text = chunks.filter((c) => c.type === "text-delta").map((c) => c.delta).join("");
    return { chunks, model, end, usage, calls, text };
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}







// -----------------------------------------------------------
// replyText
// -----------------------------------------------------------
//
// The text of the message the persist hook received.
//
// Used by:
//   - the turn tests (below)
// -----------------------------------------------------------

function replyText(end) {
  return end.responseMessage.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
}


test("shapeTurn: an answer with text passes through untouched", async () => {
  const parts = [
    { type: "start" }, { type: "start-step" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", text: "Labas" },
    { type: "text-end", id: "t" }, { type: "finish-step", finishReason: "stop" }, { type: "finish", finishReason: "stop" },
  ];
  const { parts: out, notes } = await shape(parts);
  assert.deepEqual(out, parts);
  assert.deepEqual(notes, []);
});


test("shapeTurn: a final step without text gets its fallback line, before the finish, in the turn's language", async () => {
  const steps = (finishReason, text = null) => [
    { type: "start-step" }, ...(text ? [{ type: "text-delta", id: "t", text }] : []), { type: "finish", finishReason },
  ];
  const cases = [
    ["tool-calls", "lt", "step-limit", "Pasiekiau vieno atsakymo veiksmų ribą ir nespėjau parašyti išvados. Parašykite „tęsk“ – tęsiu nuo čia."],
    ["tool-calls", "en", "step-limit", "I reached the step limit for one answer before writing a conclusion. Reply \"continue\" and I will pick up from here."],
    ["stop", "en", "empty", "The model returned no answer text. Please ask again."],
    ["other", "lt", "empty", "Modelis negrąžino atsakymo teksto. Pabandykite paklausti dar kartą."],
    ["error", "en", "empty", "The model returned no answer text. Please ask again."],
    ["length", "en", "length", "*(The answer was cut off at the length limit. Reply \"continue\".)*"],
    ["content-filter", "lt", "content-filter", "*(Atsakymą sustabdė modelio turinio filtras.)*"],
  ];
  for (const [finishReason, language, note, line] of cases) {
    const { parts, notes } = await shape(steps(finishReason), { language });
    assert.equal(injected(parts), line, `${finishReason}/${language}: a standalone line has no leading blank lines`);
    assert.deepEqual(notes, [note]);
    assert.deepEqual(parts.slice(-4).map((p) => p.type), ["text-start", "text-delta", "text-end", "finish"]);
    assert.match(parts.at(-2).id, /^fallback-[0-9a-f-]{36}$/);
  }
  for (const language of ["de", undefined, "LT"]) {
    assert.match(injected((await shape(steps("stop"), { language })).parts), /^Modelis/, "anything but en is Lithuanian");
  }
});


test("shapeTurn: a cut answer WITH text gets the note appended; whitespace and reasoning are not text", async () => {
  const cut = await shape([{ type: "start-step" }, { type: "text-delta", id: "t", text: "Pusė" }, { type: "finish", finishReason: "length" }]);
  assert.equal(injected(cut.parts), "\n\n*(Atsakymas nutrūko – pasiektas ilgio limitas. Parašykite „tęsk“.)*");
  assert.deepEqual(cut.notes, ["length"]);
  const blank = await shape([{ type: "start-step" }, { type: "text-delta", id: "t", text: " \n " }, { type: "finish", finishReason: "stop" }]);
  assert.deepEqual(blank.notes, ["empty"], "whitespace is no answer");
  // The whole turn's text counts, not the final step's
  // (ASSISTANT-LLM-20); reasoning, in any step, is no answer
  const thoughtOnly = await shape([
    { type: "start-step" }, { type: "reasoning-delta", id: "r", text: "hmm" }, { type: "finish-step" },
    { type: "start-step" }, { type: "reasoning-delta", id: "r2", text: "hmm" }, { type: "finish", finishReason: "stop" },
  ]);
  assert.deepEqual(thoughtOnly.notes, ["empty"], "reasoning is not an answer");
  const stopped = await shape([{ type: "start-step" }, { type: "text-delta", id: "t", text: "Gerai" }, { type: "finish", finishReason: "stop" }]);
  assert.deepEqual(stopped.notes, [], "a normal stop with text needs nothing");
});


test("shapeTurn: reasoning goes on only once it says something, and without its provider metadata — the encrypted reasoning of the Responses API is left out", async () => {
  const blob = { openai: { itemId: "rs_1", reasoningEncryptedContent: "gAAAA-opaque" } };
  const { parts } = await shape([
    { type: "start-step" },
    { type: "reasoning-start", id: "rs_1:0", providerMetadata: blob }, { type: "reasoning-end", id: "rs_1:0", providerMetadata: blob },
    { type: "reasoning-start", id: "r2", providerMetadata: blob }, { type: "reasoning-delta", id: "r2", text: "", providerMetadata: blob },
    { type: "reasoning-delta", id: "r2", text: "Tikrinu", providerMetadata: blob }, { type: "reasoning-end", id: "r2", providerMetadata: blob },
    { type: "text-delta", id: "t", text: "Gerai" }, { type: "finish", finishReason: "stop" },
  ]);
  assert.deepEqual(parts.filter((part) => part.type.startsWith("reasoning-")), [
    { type: "reasoning-start", id: "r2" }, { type: "reasoning-delta", id: "r2", text: "Tikrinu" }, { type: "reasoning-end", id: "r2" },
  ]);
  assert.ok(!JSON.stringify(parts).includes("gAAAA"), "no blob goes on");
});


test("shapeTurn: an earlier step's answer is an answer — the empty line only for a turn with no text at all (ASSISTANT-LLM-20, FIXED 2026-09-28)", async () => {
  const answeredEarlier = [
    { type: "start-step" }, { type: "text-delta", id: "t", text: "Visas atsakymas: reikia CASP leidimo." },
    { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} }, { type: "finish-step" },
    { type: "start-step" }, { type: "finish", finishReason: "stop" },
  ];
  for (const language of ["lt", "en"]) {
    const { parts, notes } = await shape(answeredEarlier, { language });
    assert.deepEqual(notes, [], `${language}: no fallback after a written answer`);
    assert.equal(injected(parts), "");
    assert.deepEqual(parts, answeredEarlier, "the parts pass untouched");
  }
  const silent = await shape([{ type: "start-step" }, { type: "finish-step" }, { type: "start-step" }, { type: "finish", finishReason: "stop" }]);
  assert.deepEqual(silent.notes, ["empty"], "a turn with no text at all still gets the line");
  const limit = await shape([
    { type: "start-step" }, { type: "text-delta", id: "t", text: "Tikrinu…" }, { type: "finish-step" },
    { type: "start-step" }, { type: "tool-call", toolCallId: "c2", toolName: "lookup", input: {} },
    { type: "finish", finishReason: "tool-calls" },
  ]);
  assert.deepEqual(limit.notes, ["step-limit"], "a preamble is no conclusion: the step limit is still said");
  const lengthCut = await shape([
    { type: "start-step" }, { type: "text-delta", id: "t", text: "Pradžia" }, { type: "finish-step" },
    { type: "start-step" }, { type: "finish", finishReason: "length" },
  ]);
  assert.deepEqual(lengthCut.notes, ["length"], "a cut is still said");

  const turn = await runTurn({ steps: [{ stream: convertArrayToReadableStream([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" }, { type: "text-delta", id: "t1", delta: "Reikia CASP leidimo." }, { type: "text-end", id: "t1" },
    { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: JSON.stringify({ q: "MiCA" }) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: REASONING_USAGE },
  ]) }, textStream("")] });
  assert.equal(turn.model.doStreamCalls.length, 2, "the tool round ran and the model closed it silently");
  assert.equal(turn.text, "Reikia CASP leidimo.", "the answer, and no \"no answer text\" line after it");
  assert.equal(turn.end.status, null, "the reply is stored without an 'empty' status");
  assert.equal(turn.chunks.at(-1).messageMetadata, undefined);
});


test("shapeTurn: after an error no fallback is added — the error is the answer", async () => {
  const { parts, notes } = await shape([
    { type: "start-step" }, { type: "error", error: new Error("x") }, { type: "finish", finishReason: "error" },
  ]);
  assert.deepEqual(notes, []);
  assert.equal(injected(parts), "");
});


test("shapeTurn: an abort nobody asked for (a timeout) becomes a TurnTimeoutError; a user's stop stays an abort", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    const timedOut = await shape([{ type: "start-step" }, { type: "abort", reason: "chunk timeout" }], { run: { stopReason: null } });
    assert.deepEqual(timedOut.parts.map((p) => p.type), ["start-step", "error"], "the abort itself is not forwarded");
    const error = timedOut.parts[1].error;
    assert.ok(error instanceof TurnTimeoutError);
    assert.equal(error.name, "TurnTimeoutError");
    assert.equal(error.message, "The answer took too long (chunk timeout)");
    assert.equal(new TurnTimeoutError().message, "The answer took too long (timeout)");
    assert.match(warn.mock.calls[0].arguments.join(" "), /Chat turn timed out/);
  } finally {
    warn.mock.restore();
  }
  for (const run of [{ stopReason: "user" }, { stopReason: "superseded" }, null]) {
    const { parts } = await shape([{ type: "abort", reason: "Turn user" }], { run });
    assert.deepEqual(parts, [{ type: "abort", reason: "Turn user" }], JSON.stringify(run));
  }
});


test("streamErrorText: tool failures verbatim, bad tool calls INVALID_TOOL_INPUT, everything else a bare code — a provider's by whether retrying can help", () => {
  const failure = new ToolFailure("getCompany", "NOT_FOUND", "Company not found", 404);
  assert.equal(streamErrorText(failure), "[NOT_FOUND] getCompany failed (HTTP 404): Company not found");
  const invalid = new InvalidToolInputError({ toolName: "lookup", toolInput: "{\"q\":\"\"}", cause: new Error("q too short ".repeat(60)) });
  assert.match(streamErrorText(invalid), /^\[INVALID_TOOL_INPUT\] /);
  assert.ok(streamErrorText(invalid).length <= "[INVALID_TOOL_INPUT] ".length + 400, "capped");
  assert.match(streamErrorText(new NoSuchToolError({ toolName: "dropDatabase", availableTools: ["lookup"] })), /^\[INVALID_TOOL_INPUT\] .*dropDatabase/);

  const envelope = (error) => JSON.parse(streamErrorText(error));
  const api = (statusCode, message, responseBody) => new APICallError({ message, url: "u", requestBodyValues: {}, statusCode, responseBody });
  const retry = (last) => new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [last, last, last] });
  const cases = [
    [new TurnTimeoutError("step timeout"), "MODEL_TIMEOUT"],
    [api(402, "Budget exceeded"), "AI_BUDGET_EXHAUSTED"],
    [retry(api(402, "Budget exceeded")), "AI_BUDGET_EXHAUSTED"],
    [api(429, "You exceeded your current quota"), "AI_BUDGET_EXHAUSTED"],
    // A passing failure: try again later
    [api(429, "Rate limit reached"), "MODEL_UNAVAILABLE"],
    [api(408, "Request Timeout"), "MODEL_UNAVAILABLE"],
    [api(500, "boom"), "MODEL_UNAVAILABLE"],
    [retry(api(503, "down")), "MODEL_UNAVAILABLE"],
    [new APICallError({ message: "Cannot connect to API: fetch failed", url: "u", requestBodyValues: {}, isRetryable: true }), "MODEL_UNAVAILABLE"],
    [new StreamProviderError({ message: "The server had an error while processing your request", code: "server_error", statusCode: 500 }), "MODEL_UNAVAILABLE"],
    // A final one: retrying cannot help, the code says what can
    [api(400, "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions."), "MODEL_REFUSED"],
    [api(404, "The model `azure/gpt-4` does not exist", '{"error":{"code":"model_not_found"}}'), "MODEL_REFUSED"],
    [new RetryError({ message: "Failed after 2 attempts", reason: "errorNotRetryable", errors: [api(503, "down"), api(422, "Unprocessable")] }), "MODEL_REFUSED"],
    [api(400, "This model's maximum context length is 400000 tokens. However, your messages resulted in 412000 tokens."), "MODEL_CONTEXT_EXCEEDED"],
    [api(400, "Invalid request", '{"error":{"message":"Your input exceeds the context window of this model.","code":"context_length_exceeded"}}'), "MODEL_CONTEXT_EXCEEDED"],
    [api(413, "Request Entity Too Large"), "MODEL_CONTEXT_EXCEEDED"],
    [new StreamProviderError({ message: "Your input exceeds the context window of this model.", code: "context_length_exceeded", statusCode: 400 }), "MODEL_CONTEXT_EXCEEDED"],
    [api(400, "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
         '{"error":{"code":"content_filter"}}'), "MODEL_CONTENT_FILTERED"],
    [api(401, "virtual key not found. The provided virtual key does not exist or has been revoked."), "MODEL_ACCESS_DENIED"],
    [api(403, "Forbidden"), "MODEL_ACCESS_DENIED"],
    // The gateway's 403 for a model its key may not use (or no
    // longer serves) is about the model, not the key
    [api(403, "Model 'gpt-4' is not allowed for this virtual key"), "MODEL_REFUSED"],
    [new Error("secret upstream detail"), "STREAM_FAILED"],
    [{ message: "a plain object from a provider chunk" }, "STREAM_FAILED"],
    ["just a string", "STREAM_FAILED"],
    [undefined, "STREAM_FAILED"],
  ];
  for (const [error, code] of cases) {
    const answer = envelope(error);
    assert.deepEqual(answer, { message: "The assistant could not finish the answer", error: { code } }, String(error?.message ?? error));
  }
  assert.ok(!streamErrorText(new Error("secret upstream detail")).includes("secret"));
  const own = streamErrorText(new Error("x"));
  assert.equal(streamErrorText(new Error(own)), own, "our own envelope handed back passes through, never nested");
});


test("pipeToResponse: the SDK's stream headers with the charset named, one SSE frame per chunk, a flush each, [DONE], the end (ASSISTANT-LLM-19, FIXED 2026-09-28)", async () => {
  const res = new FakeResponse();
  const { stream } = chunkStream(3);
  await pipeToResponse(stream, res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.headers, SSE_HEADERS, "every header the AI SDK sends — the content type with its charset");
  assert.equal(res.headers["content-type"], "text/event-stream; charset=utf-8");
  for (const [name, value] of Object.entries(UI_MESSAGE_STREAM_HEADERS).filter(([name]) => name !== "content-type")) {
    assert.equal(res.headers[name], value, `${name} is the SDK's`);
  }
  assert.deepEqual(res.frames, [
    'data: {"type":"text-delta","id":"t","delta":"c1"}\n\n', 'data: {"type":"text-delta","id":"t","delta":"c2"}\n\n',
    'data: {"type":"text-delta","id":"t","delta":"c3"}\n\n', "data: [DONE]\n\n",
  ]);
  assert.equal(res.flushes, 4, "a compression layer is flushed per chunk");
  assert.equal(res.writableEnded, true);
  assert.equal(res.listenerCount("close"), 0, "no listener leaks");
});


test("pipeToResponse: backpressure waits for 'drain' before writing on", async () => {
  const res = new FakeResponse(1);
  const { stream } = chunkStream(3);
  const piping = pipeToResponse(stream, res);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(res.frames.length, 1, "held after a full buffer");
  res.drain();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(res.frames.length, 2);
  res.highWater = Infinity;
  res.drain();
  await piping;
  assert.equal(res.frames.length, 4);
});


test("pipeToResponse: a client that vanishes mid-wait ends the pipe at once and cancels only the browser branch", async () => {
  const res = new FakeResponse(1);
  const { stream, state } = chunkStream(50, 5);
  const [toBrowser, toServer] = stream.tee();
  const serverSide = [];
  const drained = toServer.pipeTo(new WritableStream({ write: (chunk) => serverSide.push(chunk) }));
  const piping = pipeToResponse(toBrowser, res);
  await new Promise((resolve) => setTimeout(resolve, 30));
  res.emit("close");
  await piping;
  assert.equal(res.writableEnded, true, "the response is ended");
  const written = res.frames.length;
  await drained;
  assert.equal(serverSide.length, 50, "the turn itself runs to the end");
  assert.equal(state.cancelled, false, "the source is not cancelled while the server branch reads");
  assert.equal(res.frames.length, written, "nothing is written after the close");

  const lone = new FakeResponse();
  const idle = chunkStream(1, 400);
  const idlePipe = pipeToResponse(idle.stream, lone);
  setTimeout(() => lone.emit("close"), 20);
  const started = performance.now();
  await idlePipe;
  assert.ok(performance.now() - started < 300, "a pending read does not hold the pipe");
  assert.equal(lone.writableEnded, true);
  const until = performance.now() + 1_500;
  while (!idle.state.cancelled && performance.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(idle.state.cancelled, true, "a lone stream is cancelled up to its source");
});


test("pipeToResponse: a failing stream is logged and the response still ends", async () => {
  const res = new FakeResponse();
  const failing = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "text-delta", id: "t", delta: "a" });
      controller.error(new Error("broken"));
    },
  });
  const error = mock.method(console, "error", () => {});
  try {
    await pipeToResponse(failing, res);
    assert.match(error.mock.calls[0].arguments.join(" "), /Stream pipe error: broken/);
    assert.equal(res.writableEnded, true);
  } finally {
    error.mock.restore();
  }
});


test("a tool round: the call, its result on the wire, the result fed back to the model, the answer", async () => {
  const turn = await runTurn({ steps: [toolCallStream("lookup", { q: "MiCA" }, "c1"), textStream("Radau MiCA.")] });
  assert.deepEqual(turn.chunks.map((c) => c.type), [
    "start", "start-step", "tool-input-available", "tool-output-available", "finish-step",
    "start-step", "text-start", "text-delta", "text-delta", "text-end", "finish-step", "finish",
  ]);
  assert.equal(turn.chunks[0].messageId, "srv-test");
  assert.deepEqual(turn.chunks[3].output, { found: "MiCA" });
  const fed = turn.model.doStreamCalls[1].prompt.find((m) => m.role === "tool").content[0];
  assert.deepEqual([fed.toolCallId, fed.toolName, fed.output], ["c1", "lookup", { type: "json", value: { found: "MiCA" } }]);
  assert.equal(turn.text, "Radau MiCA.");
  assert.equal(turn.end.status, null, "a normal turn has no status");
  assert.deepEqual(turn.end.responseMessage.parts.map((p) => p.type), ["step-start", "tool-lookup", "step-start", "text"]);
  assert.deepEqual(turn.calls.map((c) => [c.name, c.ok]), [["lookup", true]]);
});


test("a tool failure reaches the wire and the model with Django's code; a crash only as TOOL_FAILED", async () => {
  const error = mock.method(console, "error", () => {});
  try {
    const turn = await runTurn({ steps: [toolCallStream("lookup", { q: "missing" }, "c1"), toolCallStream("lookup", { q: "crash" }, "c2"),
                                         textStream("Nepavyko.")] });
    const failures = turn.chunks.filter((c) => c.type === "tool-output-error").map((c) => c.errorText);
    assert.deepEqual(failures, ["[NOT_FOUND] lookup failed (HTTP 404): Nothing found",
                                "[TOOL_FAILED] lookup failed: Unexpected error while running the tool"]);
    const fed = JSON.stringify(turn.model.doStreamCalls[2].prompt.filter((m) => m.role === "tool"));
    assert.ok(fed.includes("[NOT_FOUND] lookup failed (HTTP 404): Nothing found"), "the model reads the code");
    assert.ok(!fed.includes("secret internal detail") && !JSON.stringify(turn.chunks).includes("secret internal detail"));
    assert.deepEqual(turn.calls.map((c) => [c.ok, c.code]), [[false, "NOT_FOUND"], [false, "TOOL_FAILED"]]);
    assert.equal(turn.text, "Nepavyko.");
  } finally {
    error.mock.restore();
  }
});


test("malformed input and an unknown tool are INVALID_TOOL_INPUT for the model to fix; nothing runs", async () => {
  const turn = await runTurn({ steps: [toolCallStream("lookup", { q: "", extra: 1 }, "c1"), toolCallStream("dropDatabase", {}, "c2"),
                                       textStream("Pataisiau.")] });
  const errors = turn.chunks.filter((c) => c.type === "tool-input-error");
  assert.equal(errors.length, 2);
  assert.ok(errors.every((c) => c.errorText.startsWith("[INVALID_TOOL_INPUT] ")), JSON.stringify(errors));
  assert.match(errors[1].errorText, /dropDatabase/);
  assert.equal(turn.calls.length, 0, "a rejected input never reaches the tool");
  assert.match(JSON.stringify(turn.model.doStreamCalls[1].prompt), /INVALID_TOOL_INPUT|Invalid input/, "the model is told");
  assert.equal(turn.text, "Pataisiau.");
});


test("an invalid call's error part — a STRING from the SDK — is its reason, on the wire and in the stored reply (ASSISTANT-ROUTES-6, FIXED)", async () => {
  assert.equal(streamErrorText("AI_InvalidToolInputError: Invalid input for tool lookup: Type validation failed: q is required"),
               "[INVALID_TOOL_INPUT] Invalid input for tool lookup: Type validation failed: q is required", "the class prefix goes");
  assert.equal(streamErrorText("Invalid input for tool lookup: Type validation failed: q is required"),
               "[INVALID_TOOL_INPUT] Invalid input for tool lookup: Type validation failed: q is required");
  assert.equal(streamErrorText("AI_NoSuchToolError: Model tried to call unavailable tool 'x'. No tools are available."),
               "[INVALID_TOOL_INPUT] Model tried to call unavailable tool 'x'. No tools are available.");
  assert.equal(streamErrorText("Model tried to call unavailable tool 'dropDatabase'. Available tools: lookup."),
               "[INVALID_TOOL_INPUT] Model tried to call unavailable tool 'dropDatabase'. Available tools: lookup.");
  assert.equal(streamErrorText(`Invalid input for tool x: ${"z".repeat(1_000)}`).length, "[INVALID_TOOL_INPUT] ".length + 400);
  assert.equal(JSON.parse(streamErrorText("upstream said: key sk-live-1 refused")).error.code, "STREAM_FAILED",
               "any other string stays a bare code");
  const turn = await runTurn({ steps: [toolCallStream("lookup", { nope: 1 }, "c1"), toolCallStream("dropDatabase", {}, "c2"),
                                       textStream("Pataisiau.")] });
  const outputs = turn.chunks.filter((c) => c.type === "tool-output-error").map((c) => c.errorText);
  assert.equal(outputs.length, 2, "the SDK follows each refused call with an error part");
  assert.match(outputs[0], /^\[INVALID_TOOL_INPUT\] Invalid input for tool lookup/, "the GUI pill reads the code");
  assert.match(outputs[1], /^\[INVALID_TOOL_INPUT\] Model tried to call unavailable tool 'dropDatabase'/);
  const stored = turn.end.responseMessage.parts.filter((p) => p.state === "output-error").map((p) => p.errorText);
  assert.deepEqual(stored, outputs, "what the model re-reads on the next turn");
});


test("MAX_STEPS: the last step runs with tools off; a silent end is the step-limit line, stored with the reply", async () => {
  const steps = Array.from({ length: MAX_STEPS + 2 }, (_, i) => toolCallStream("lookup", { q: `q${i}` }, `c${i}`));
  const turn = await runTurn({ steps });
  assert.equal(turn.model.doStreamCalls.length, MAX_STEPS, "never more model calls than MAX_STEPS");
  assert.deepEqual(turn.model.doStreamCalls.at(-1).toolChoice, { type: "none" });
  assert.notDeepEqual(turn.model.doStreamCalls.at(-2).toolChoice, { type: "none" });
  assert.match(turn.text, /veiksmų ribą/);
  assert.equal(turn.end.status, "step-limit");
  assert.match(replyText(turn.end), /veiksmų ribą/, "the persisted reply carries the line");
  assert.equal(turn.chunks.at(-1).messageMetadata?.status, "step-limit", "the finish chunk tells the GUI");
});


test("the never-silent rule end to end: an empty answer and a length cut, in English", async () => {
  const empty = await runTurn({ steps: [textStream("")], language: "en" });
  assert.equal(empty.text, "The model returned no answer text. Please ask again.");
  assert.equal(empty.end.status, "empty");
  const cut = await runTurn({ steps: [textStream("Half an answer", "length")], language: "en" });
  assert.equal(cut.text, "Half an answer\n\n*(The answer was cut off at the length limit. Reply \"continue\".)*");
  assert.equal(cut.end.status, "length");
});


test("a spent provider budget mid-turn: AI_BUDGET_EXHAUSTED on the wire, the partial reply kept with status budget", async () => {
  const turn = await runTurn({ steps: [toolCallStream("lookup", { q: "MiCA" }, "c1"), () => {
    throw new APICallError({ message: "Budget exceeded: Team budget exceeded: 10.18 >= 10.00", url: "u", requestBodyValues: {}, statusCode: 402 });
  }] });
  const error = turn.chunks.find((c) => c.type === "error");
  assert.deepEqual(JSON.parse(error.errorText), { message: "The assistant could not finish the answer", error: { code: "AI_BUDGET_EXHAUSTED" } });
  assert.ok(!JSON.stringify(turn.chunks).includes("10.18"));
  assert.equal(turn.text, "", "no fallback line after an error");
  assert.equal(turn.end.status, "budget");
  assert.deepEqual(turn.end.responseMessage.parts.map((p) => p.type), ["step-start", "tool-lookup"], "the tool call is kept");
});


test("a provider error chunk is STREAM_FAILED on the wire; its detail stays on the server", async () => {
  const turn = await runTurn({ steps: [{ stream: convertArrayToReadableStream([
    { type: "stream-start", warnings: [] },
    { type: "error", error: new Error("upstream secret: key sk-live-123") },
    { type: "finish", finishReason: { unified: "error", raw: "error" }, usage: REASONING_USAGE },
  ]) }] });
  const error = turn.chunks.find((c) => c.type === "error");
  assert.equal(JSON.parse(error.errorText).error.code, "STREAM_FAILED");
  assert.ok(!JSON.stringify(turn.chunks).includes("sk-live-123"));
  assert.equal(turn.end.status, "error");
});


test("the user's stop: an abort on the wire, no fallback, the partial reply stored as stopped", async () => {
  const turn = await runTurn({ steps: [liveStep({ deltas: ["Pirma. ", "Antra. ", "Trečia."], delayMs: 150 })], stopOn: "text-delta" });
  assert.deepEqual(turn.chunks.slice(-2).map((c) => c.type), ["abort", "message-metadata"]);
  assert.deepEqual(turn.chunks.at(-1).messageMetadata, { status: "stopped" }, "the GUI learns the status");
  assert.ok(!turn.chunks.some((c) => c.type === "error"));
  assert.equal(turn.text, "Pirma. ", "nothing after the stop, no fallback line");
  assert.equal(turn.end.status, "stopped");
  assert.equal(replyText(turn.end), "Pirma. ");
});


test("a timeout: MODEL_TIMEOUT on the wire instead of an abort, the reply marked timeout", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    const turn = await runTurn({ steps: [liveStep({ deltas: ["Pradžia ", "vėliau"], delayMs: 400 })], timeout: { chunkMs: 100 } });
    assert.ok(!turn.chunks.some((c) => c.type === "abort"), "the abort was replaced");
    const error = turn.chunks.find((c) => c.type === "error");
    assert.equal(JSON.parse(error.errorText).error.code, "MODEL_TIMEOUT");
    assert.deepEqual(turn.chunks.at(-1), { type: "message-metadata", messageMetadata: { status: "timeout" } });
    assert.equal(turn.end.status, "timeout");
  } finally {
    warn.mock.restore();
  }
});


test("usage: the per-step fields routes/chat.js adds up are the ones the SDK reports, reasoning included", async () => {
  const reasoningStep = (text) => ({ stream: convertArrayToReadableStream([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: text }, { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: REASONING_USAGE },
  ]) });
  const one = await runTurn({ steps: [reasoningStep("Atsakymas.")] });
  assert.deepEqual(one.usage, { inputTokens: 20, outputTokens: 9, reasoningTokens: 3 });
  const three = await runTurn({ steps: [toolCallStream("lookup", { q: "a" }), toolCallStream("lookup", { q: "b" }), textStream("Gerai.")] });
  assert.deepEqual(three.usage, { inputTokens: 30, outputTokens: 15, reasoningTokens: 0 }, "every step counts");
});


test("a refused tool call logs no SDK rawInput deprecation — the SDK writes that field itself (ASSISTANT-LLM-24, FIXED 2026-09-28)", async (t) => {
  const emitted = t.mock.method(process, "emitWarning", () => {});
  const turn = await runTurn({ steps: [toolCallStream("lookup", { nope: 1 }, "c1"), toolCallStream("lookup", { q: "" }, "c2"),
                                       textStream("Pataisiau.")] });
  assert.equal(turn.chunks.filter((c) => c.type === "tool-input-error").length, 2, "two refused calls of a known tool");
  assert.ok(turn.end.responseMessage.parts.some((p) => p.type === "tool-lookup" && p.rawInput !== undefined),
            "the SDK still writes rawInput into the reply it rebuilds — the cause is its own; drop the filter when this fails");
  const logged = emitted.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(!logged.some((line) => line.includes(RAW_INPUT_SETTING)), logged.join("\n"));
  assert.equal(typeof globalThis.AI_SDK_LOG_WARNINGS, "function", "the filtered logger is installed at import");
});


test("every other AI SDK warning still reaches the log, worded and typed exactly as the SDK's own logger does it", async (t) => {
  const warnings = [
    { type: "unsupported", feature: "topK", details: "The gateway ignores it." },
    { type: "compatibility", feature: "specificationVersion" },
    { type: "deprecated", setting: "maxSteps", message: "Use stopWhen." },
    { type: "other", message: "Something to know." },
    { type: "deprecated", setting: RAW_INPUT_SETTING, message: "Use the \"input\" field instead." },
  ];
  const warned = () => new MockLanguageModelV4({ doStream: async () => ({ stream: convertArrayToReadableStream([
    { type: "stream-start", warnings },
    { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Gerai." }, { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: REASONING_USAGE },
  ]) }) });
  const logOf = async () => {
    const emitted = t.mock.method(process, "emitWarning", () => {});
    try {
      await streamText({ model: warned(), prompt: "x", maxRetries: 0 }).text;
      return emitted.mock.calls.map((c) => c.arguments)
        .filter(([line]) => !String(line).startsWith("AI SDK Warning System:"));
    } finally {
      emitted.mock.restore();
    }
  };

  const ours = await logOf();
  const installed = globalThis.AI_SDK_LOG_WARNINGS;
  globalThis.AI_SDK_LOG_WARNINGS = undefined;
  let sdks;
  try {
    sdks = await logOf();
  } finally {
    globalThis.AI_SDK_LOG_WARNINGS = installed;
  }
  assert.equal(sdks.length, 5, "the SDK's own logger emits all five");
  assert.deepEqual(ours, sdks.filter(([line]) => !line.includes(RAW_INPUT_SETTING)), "the same lines and types, minus the one");
  assert.deepEqual(ours.map(([, options]) => options.type), ["Warning", "Warning", "DeprecationWarning", "Warning"]);
  assert.match(ours[0][0], /^AI SDK Warning \(mock-provider \/ mock-model-id\): The feature "topK" is not supported\. The gateway ignores it\.$/);
});
