// -----------------------------------------------------------
//  [*] Tests — the chat route's ceilings, in their own process
//
//  config.js reads its settings once at load, so this file
//  sets its own before the bench loads it: the turn limit and
//  the three model timeouts shrunk until a test can reach
//  them, and no gateway key, so the assistant is unconfigured
//  whenever no test model is planted.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { THREAD, postTurn, replyPosts, resetStub, settle, startChatApp, waitForLog, waitForReply } from "./helpers/chatApp.mjs";
import { liveStep } from "./helpers/liveModel.mjs";
import { readSse, textOf } from "./helpers/sse.mjs";
import { scripted, textStream } from "./mockModel.mjs";


// The shrunk ceilings and no gateway key; config.js loads
// only in before(), so these win over tests/env.mjs
const LIMITS = { RATE_LIMIT_TURNS: 3, CHAT_CHUNK_TIMEOUT_MS: 300, CHAT_STEP_TIMEOUT_MS: 800, CHAT_TIMEOUT_MS: 1_600 };
for (const [name, value] of Object.entries(LIMITS)) process.env[name] = String(value);
process.env.AI_GATEWAY_KEY = "";

let bench;
let stub;
let base;
let setModelForTests;







// -----------------------------------------------------------
// timeoutError
// -----------------------------------------------------------
//
// The code of the stream's error chunk; the test fails when
// the stream carried no error chunk.
//
// Used by:
//   - the timeout tests (below)
// -----------------------------------------------------------

function timeoutError(chunks) {
  const chunk = chunks.find((c) => c.type === "error");
  assert.ok(chunk, `an error chunk in ${chunks.map((c) => c.type)}`);
  return JSON.parse(chunk.errorText).error.code;
}


before(async () => {
  bench = await startChatApp();
  ({ stub, base, setModelForTests } = bench);
});

beforeEach(() => {
  resetStub(stub);
  setModelForTests({});
});

after(async () => {
  await bench.close();
});


test("no model credentials: 503 NOT_CONFIGURED before the turn limit is touched; /health says missing-key; the run routes still answer", async () => {
  for (let attempt = 0; attempt <= LIMITS.RATE_LIMIT_TURNS + 1; attempt += 1) {
    const response = await postTurn(base, {}, { token: "tok-unconfigured" });
    const body = await response.json();
    assert.deepEqual([response.status, body.error.code], [503, "NOT_CONFIGURED"], `attempt ${attempt}: never a 429`);
  }
  assert.deepEqual(stub.requests.map((r) => r.path), ["/api/auth/me"], "who is asking, then nothing else");

  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.model, "missing-key");
  assert.deepEqual(health.providers, []);
  const status = await fetch(`${base}/api/assistant/chat/${THREAD}/status`, { headers: { Authorization: "Bearer tok-unconfigured" } });
  assert.deepEqual(await status.json(), { running: false, startedAt: null });

  setModelForTests({ language: scripted([textStream("Dabar veikiu.")]) });
  const configured = await postTurn(base, {}, { token: "tok-unconfigured" });
  assert.equal(configured.status, 200, "the refused attempts spent none of the user's turns");
  assert.equal(textOf((await readSse(configured)).chunks), "Dabar veikiu.");
});


test("the turn limit: RATE_LIMIT_TURNS pass, the next is 429 RATE_LIMITED with Retry-After and retryAfterS, per user", async () => {
  setModelForTests({ language: scripted([]) });
  for (let turn = 0; turn < LIMITS.RATE_LIMIT_TURNS; turn += 1) {
    const response = await postTurn(base, {}, { token: "tok-busy" });
    assert.equal(response.status, 200, `turn ${turn + 1}`);
    await response.text();
  }

  stub.requests.length = 0;
  const limited = await postTurn(base, {}, { token: "tok-busy" });
  assert.equal(limited.status, 429);
  const text = await limited.text();
  const body = JSON.parse(text);
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, `Retry-After ${retryAfter}`);
  assert.deepEqual(body.error, { code: "RATE_LIMITED", message: body.message, retryAfterS: retryAfter });
  assert.deepEqual(stub.requests, [], "refused before the budget, the prompt or the thread were asked");

  const other = await postTurn(base, {}, { token: "tok-quiet" });
  assert.equal(other.status, 200, "another user has a window of their own");
  await other.text();
  const statusStillAnswers = await fetch(`${base}/api/assistant/chat/${THREAD}/status`, { headers: { Authorization: "Bearer tok-busy" } });
  assert.equal(statusStillAnswers.status, 200, "polling the status is never limited");
});


test("the limiter stands in front of the body: malformed requests spend turns too (the abuse gate before any parsing)", async () => {
  setModelForTests({ language: scripted([]) });
  for (let turn = 0; turn < LIMITS.RATE_LIMIT_TURNS; turn += 1) {
    const response = await postTurn(base, { extra: { id: "not-a-thread" } }, { token: "tok-sloppy" });
    assert.equal(response.status, 400);
    await response.text();
  }
  const valid = await postTurn(base, {}, { token: "tok-sloppy" });
  assert.equal(valid.status, 429);
  assert.equal((await valid.json()).error.code, "RATE_LIMITED");
});


test("a model that goes silent mid-answer: the chunk timeout ends the turn with MODEL_TIMEOUT, the partial reply stored as timeout", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: ["Pradedu ", "atsakymą."], delayMs: 50, end: "stall" })]) });
  const started = Date.now();
  const { chunks, done } = await readSse(await postTurn(base, {}, { token: "tok-chunk" }));
  const elapsed = Date.now() - started;
  assert.ok(done, "the wire still ends with its terminator");
  assert.ok(elapsed >= LIMITS.CHAT_CHUNK_TIMEOUT_MS && elapsed < LIMITS.CHAT_TIMEOUT_MS, `${elapsed} ms`);
  assert.equal(timeoutError(chunks), "MODEL_TIMEOUT");
  assert.deepEqual(chunks.at(-1), { type: "message-metadata", messageMetadata: { status: "timeout" } });
  assert.equal(textOf(chunks), "Pradedu atsakymą.");

  const reply = await waitForReply(stub);
  assert.equal(reply.body.content.metadata.status, "timeout");
  assert.equal(reply.body.content.parts.filter((p) => p.type === "text").map((p) => p.text).join(""), "Pradedu atsakymą.");
  assert.equal((await waitForLog(stub)).body.outcome, "timeout");
  const status = await fetch(`${base}/api/assistant/chat/${THREAD}/status`, { headers: { Authorization: "Bearer tok-chunk" } });
  assert.deepEqual(await status.json(), { running: false, startedAt: null }, "the run is released");
});


test("a model that never starts: the step timeout ends the turn with MODEL_TIMEOUT and nothing is stored", async () => {
  setModelForTests({ language: scripted([liveStep({ end: "stall" })]) });
  const started = Date.now();
  const { chunks, done } = await readSse(await postTurn(base, {}, { token: "tok-step" }));
  const elapsed = Date.now() - started;
  assert.ok(done);
  assert.ok(elapsed >= LIMITS.CHAT_STEP_TIMEOUT_MS && elapsed < LIMITS.CHAT_TIMEOUT_MS, `${elapsed} ms`);
  assert.equal(timeoutError(chunks), "MODEL_TIMEOUT");
  assert.equal(textOf(chunks), "");

  assert.equal((await waitForLog(stub)).body.outcome, "timeout");
  await settle(100);
  assert.equal(replyPosts(stub).length, 0, "an empty reply is never stored");
});


test("a turn that keeps working past its ceiling: the total timeout ends it, the tool work done so far is stored as timeout", async () => {
  const slowCall = (n) => liveStep({ toolCall: { toolName: "listCompanies", input: {}, toolCallId: `call-${n}` }, firstDelayMs: 500 });
  setModelForTests({ language: scripted([slowCall(1), slowCall(2), slowCall(3), slowCall(4), slowCall(5)]) });
  const started = Date.now();
  const { chunks, done } = await readSse(await postTurn(base, {}, { token: "tok-total" }));
  const elapsed = Date.now() - started;
  assert.ok(done);
  assert.ok(elapsed >= LIMITS.CHAT_TIMEOUT_MS && elapsed < LIMITS.CHAT_TIMEOUT_MS + 700, `${elapsed} ms`);
  assert.equal(timeoutError(chunks), "MODEL_TIMEOUT");
  const rounds = chunks.filter((c) => c.type === "tool-output-available").length;
  assert.ok(rounds >= 2 && rounds <= 4, `cut part-way (${rounds} of 5 rounds)`);

  const reply = await waitForReply(stub);
  assert.equal(reply.body.content.metadata.status, "timeout");
  assert.equal(reply.body.content.parts.filter((p) => p.type === "tool-listCompanies" && p.state === "output-available").length, rounds,
               "exactly the finished rounds are stored");
  const log = await waitForLog(stub);
  assert.equal(log.body.outcome, "timeout");
  assert.equal(log.body.tool_calls.length, rounds);
});
