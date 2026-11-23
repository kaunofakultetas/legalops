// -----------------------------------------------------------
//  [*] Tests — a turn's life: status, stop, leaving, sharing
//
//  The run registry seen through the three chat routes. The
//  models are provider-like (helpers/liveModel.mjs): chunks
//  come on a clock, and an abort errors the stream the way the
//  gateway's fetch does, which a plain mock never shows.
//
//  Defects guarded here:
//
//    ASSISTANT-ROUTES-1 — a registry abort surfaced as a failure
//    ASSISTANT-ROUTES-3 — a browser gone early hung the handler
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { OTHER_THREAD, THREAD, postTurn, replyPosts, resetStub, settle, startChatApp, waitForLog, waitForReply } from "./helpers/chatApp.mjs";
import { liveStep } from "./helpers/liveModel.mjs";
import { openSse, readSse, textOf } from "./helpers/sse.mjs";
import { scripted } from "./mockModel.mjs";
import { drainRuns } from "../services/runs.js";


// The words of a slow answer; a stop lands after the first
const WORDS = ["Pirma. ", "Antra. ", "Trečia. ", "Ketvirta. ", "Penkta."];

let bench;
let stub;
let base;
let setModelForTests;







// -----------------------------------------------------------
// status
// -----------------------------------------------------------
//
// Asks for a thread's run status the way the GUI's
// ReplyWatcher (Thread.jsx) polls it; answers the HTTP
// status, the Cache-Control header and the body. A null token
// sends no bearer.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function status(threadId = THREAD, token = "tok") {
  const response = await fetch(`${base}/api/assistant/chat/${threadId}/status`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { http: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
}







// -----------------------------------------------------------
// stop
// -----------------------------------------------------------
//
// Posts a thread's stop the way the GUI's requestStop
// (ChatRuntime.jsx) does, with an empty JSON body; answers
// the HTTP status and the body. A null token sends no bearer.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function stop(threadId = THREAD, token = "tok") {
  const response = await fetch(`${base}/api/assistant/chat/${threadId}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: "{}",
  });
  return { http: response.status, body: await response.json() };
}







// -----------------------------------------------------------
// replyText
// -----------------------------------------------------------
//
// The text of a stored reply: its text parts, joined.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function replyText(reply) {
  return reply.body.content.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
}


before(async () => {
  bench = await startChatApp();
  ({ stub, base, setModelForTests } = bench);
});

beforeEach(() => {
  resetStub(stub);
});

// A test that failed mid-turn must not leave its turn running
// into the next: the counts and statuses below assume a quiet
// registry
afterEach(async () => {
  await drainRuns(0, 2_000);
});

after(async () => {
  await bench.close();
});


test("status: a running turn is { running: true, startedAt }, never cached, and it ends with the turn", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: WORDS, delayMs: 60 })]) });
  const before = Date.now();
  const sse = openSse(await postTurn(base));
  await sse.until((c) => c.type === "text-delta");

  const live = await status();
  assert.equal(live.http, 200);
  assert.equal(live.cache, "no-store", "a poll must never be answered from a cache");
  assert.equal(live.body.running, true);
  assert.ok(Date.parse(live.body.startedAt) >= before - 1_000 && Date.parse(live.body.startedAt) <= Date.now(), live.body.startedAt);

  const { done } = await sse.rest();
  assert.ok(done);
  await waitForLog(stub);
  assert.deepEqual((await status()).body, { running: false, startedAt: null });
});


test("status and stop answer only the owner: another user's live turn reads as not running and cannot be stopped", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: WORDS, delayMs: 50 })]) });
  const sse = openSse(await postTurn(base));
  await sse.until((c) => c.type === "text-delta");

  assert.deepEqual((await status(THREAD, "other")).body, { running: false, startedAt: null }, "no existence leak");
  assert.deepEqual(await stop(THREAD, "other"), { http: 200, body: { stopped: false } });
  assert.equal((await status()).body.running, true, "the owner's turn runs on");

  await sse.rest();
  const reply = await waitForReply(stub);
  assert.equal(replyText(reply), WORDS.join(""));
  assert.equal(reply.body.content.metadata, undefined);
});


test("status and stop of a thread with no turn answer false; both routes refuse guests, dead sessions and bad ids", async () => {
  assert.deepEqual(await status(OTHER_THREAD), { http: 200, cache: "no-store", body: { running: false, startedAt: null } });
  assert.deepEqual(await stop(OTHER_THREAD), { http: 200, body: { stopped: false } });

  for (const call of [status, stop]) {
    const guest = await call(THREAD, null);
    assert.deepEqual([guest.http, guest.body.error.code], [401, "AUTH_REQUIRED"], call.name);
    const dead = await call(THREAD, "revoked-session");
    assert.deepEqual([dead.http, dead.body.error.code], [401, "SESSION_INVALID"], call.name);
    for (const id of ["not-a-uuid", `${THREAD}x`, "..%2F..%2Fhealth"]) {
      const bad = await call(id);
      assert.deepEqual([bad.http, bad.body.error.code], [400, "INVALID_THREAD"], `${call.name} ${id}`);
    }
  }
  assert.equal(stub.requests.filter((r) => r.path !== "/api/auth/me").length, 0, "the run routes ask Django nothing else");
});


test("stop with a real provider's abort: the wire ends with an abort part and [DONE], the reply is stored as stopped, the turn logged stopped (ASSISTANT-ROUTES-1, FIXED 2026-09-27)", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: WORDS, delayMs: 150 })]) });
  const sse = openSse(await postTurn(base));
  await sse.until((c) => c.type === "text-delta");

  assert.deepEqual(await stop(), { http: 200, body: { stopped: true } });
  const { chunks, done } = await sse.rest();
  assert.ok(done, "the terminator still comes");
  assert.equal(chunks.filter((c) => c.type === "error").length, 0, "a stop is not a failure");
  const [abort, status_] = chunks.slice(-2);
  assert.equal(abort.type, "abort", "the stream ends on the abort …");
  assert.match(abort.reason, /Turn user$/);
  assert.deepEqual(status_, { type: "message-metadata", messageMetadata: { status: "stopped" } }, "… and the reply's status");

  const reply = await waitForReply(stub);
  assert.equal(reply.body.content.metadata?.status, "stopped");
  assert.ok(replyText(reply).startsWith("Pirma.") && !replyText(reply).includes("Penkta"), replyText(reply));
  assert.equal((await waitForLog(stub)).body.outcome, "stopped");
  assert.deepEqual((await status()).body, { running: false, startedAt: null });
});


test("the GUI's stop — the request aborted and /stop posted at once — stores the partial answer as stopped", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: WORDS, delayMs: 150 })]) });
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => { stop(); }, { once: true });
  const sse = openSse(await postTurn(base, {}, { signal: controller.signal }));
  await sse.until((c) => c.type === "text-delta");
  controller.abort();

  const reply = await waitForReply(stub);
  assert.equal(reply.body.content.metadata?.status, "stopped");
  assert.ok(!replyText(reply).includes("Penkta"));
  assert.equal((await waitForLog(stub)).body.outcome, "stopped");
});


test("stop is idempotent: a second stop changes nothing and one reply is stored; a stop after the end answers false", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: WORDS, delayMs: 150 })]) });
  const sse = openSse(await postTurn(base));
  await sse.until((c) => c.type === "text-delta");

  const [first, second] = await Promise.all([stop(), stop()]);
  assert.deepEqual([first.http, second.http], [200, 200]);
  assert.ok(first.body.stopped === true && typeof second.body.stopped === "boolean");
  await sse.rest();
  await waitForLog(stub);
  await settle(200);
  assert.equal(replyPosts(stub, THREAD).length, 1, "one reply");
  assert.equal(stub.requests.filter((r) => r.path === "/internal/assistant/turn-log").length, 1, "one log row");
  assert.equal(replyPosts(stub, THREAD)[0].body.content.metadata?.status, "stopped");
  assert.deepEqual(await stop(), { http: 200, body: { stopped: false } });
});


test("a stop before the first word stores nothing, logs the turn as stopped, and still ends the wire cleanly", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: ["Vėlu."], firstDelayMs: 2_000 })]) });
  const sse = openSse(await postTurn(base));
  await sse.until((c) => c.type === "start");
  await settle(100);
  assert.deepEqual((await stop()).body, { stopped: true });

  const { chunks, done } = await sse.rest();
  assert.ok(done);
  assert.deepEqual(chunks.slice(-2).map((c) => c.type), ["abort", "message-metadata"]);
  assert.equal(textOf(chunks), "");
  assert.equal((await waitForLog(stub)).body.outcome, "stopped");
  assert.equal(replyPosts(stub).length, 0, "an empty reply is never stored");
});


test("a browser that leaves mid-answer never stops the turn: status stays running, the whole reply is stored, then status ends", async () => {
  setModelForTests({ language: scripted([liveStep({ deltas: WORDS, delayMs: 80 })]) });
  const controller = new AbortController();
  const sse = openSse(await postTurn(base, {}, { signal: controller.signal }));
  await sse.until((c) => c.type === "text-delta");
  controller.abort();
  await settle(50);

  assert.equal((await status()).body.running, true, "the reload finds the turn still being written");
  const reply = await waitForReply(stub);
  assert.equal(replyText(reply), WORDS.join(""));
  assert.equal(reply.body.content.metadata, undefined, "a finished answer, not an interrupted one");
  assert.equal((await waitForLog(stub)).body.outcome, "ok");
  assert.deepEqual((await status()).body, { running: false, startedAt: null });
});


test("a browser gone before the answer starts: the turn still runs and is stored, and its dead response is ended (ASSISTANT-ROUTES-3, FIXED 2026-09-27)", async () => {
  stub.routes["GET /internal/assistant/budget"] = async () => {
    await settle(300);
    return { json: { remaining: 10 } };
  };
  const responses = [];
  const capture = (req, res) => { if ((req.originalUrl || req.url) === "/api/assistant/chat") responses.push(res); };
  bench.server.on("request", capture);
  setModelForTests({ language: scripted([liveStep({ deltas: ["Vis tiek ", "atsakau."], delayMs: 20 })]) });
  try {
    const controller = new AbortController();
    const pending = postTurn(base, {}, { signal: controller.signal }).catch((err) => err.name);
    await settle(80);
    controller.abort();
    assert.equal(await pending, "AbortError");

    const reply = await waitForReply(stub);
    assert.equal(replyText(reply), "Vis tiek atsakau.");
    await waitForLog(stub);
    await settle(100);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].writableEnded, true, "the handler finished: no pump left waiting on a socket that is gone");
  } finally {
    bench.server.off("request", capture);
  }
});


test("a second turn in the same thread supersedes the first: its wire ends with abort, its partial reply is stored as interrupted (ASSISTANT-ROUTES-1, FIXED 2026-09-27)", async () => {
  setModelForTests({ language: scripted([
    liveStep({ deltas: WORDS, delayMs: 150 }),
    liveStep({ deltas: ["Naujas ", "atsakymas ", "čia."], delayMs: 150 }),
  ]) });
  const first = openSse(await postTurn(base, { id: "u-first" }));
  await first.until((c) => c.type === "text-delta");

  const second = openSse(await postTurn(base, { id: "u-second" }));
  const firstEnd = await first.rest();
  assert.ok(firstEnd.done);
  const [abort, status_] = firstEnd.chunks.slice(-2);
  assert.equal(abort.type, "abort");
  assert.match(abort.reason, /Turn superseded$/);
  assert.deepEqual(status_, { type: "message-metadata", messageMetadata: { status: "interrupted" } });
  const interrupted = await stub.waitFor((r) => r.path === `/internal/assistant/threads/${THREAD}/messages` && r.body.parent_id === "u-first");
  assert.equal(interrupted.body.content.metadata?.status, "interrupted");
  assert.ok(!replyText(interrupted).includes("Penkta"));

  await second.until((c) => c.type === "text-delta");
  assert.equal((await status()).body.running, true, "the thread's live turn is the second one");
  assert.deepEqual((await stop()).body, { stopped: true }, "the stop button stops the current turn");
  await second.rest();
  const stopped = await stub.waitFor((r) => r.path === `/internal/assistant/threads/${THREAD}/messages` && r.body.parent_id === "u-second");
  assert.equal(stopped.body.content.metadata?.status, "stopped");
  const outcomes = stub.requests.filter((r) => r.path === "/internal/assistant/turn-log").map((r) => r.body.outcome).sort();
  assert.deepEqual(outcomes, ["interrupted", "stopped"]);
});


test("turns in two threads are independent: stopping one leaves the other to finish", async () => {
  setModelForTests({ language: scripted([
    liveStep({ deltas: WORDS, delayMs: 100 }),
    liveStep({ deltas: WORDS, delayMs: 100 }),
  ]) });
  const one = openSse(await postTurn(base, { id: "u-one" }));
  await one.until((c) => c.type === "text-delta");
  const two = openSse(await postTurn(base, { id: "u-two", threadId: OTHER_THREAD, parentId: null }));
  await two.until((c) => c.type === "text-delta");

  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.activeTurns, 2, "/health counts the live turns");
  assert.deepEqual((await stop(THREAD)).body, { stopped: true });
  await Promise.all([one.rest(), two.rest()]);

  const stopped = await waitForReply(stub, { threadId: THREAD });
  const finished = await waitForReply(stub, { threadId: OTHER_THREAD });
  assert.equal(stopped.body.content.metadata?.status, "stopped");
  assert.equal(replyText(finished), WORDS.join(""));
  assert.equal(finished.body.content.metadata, undefined);
  await waitForLog(stub, { threadId: OTHER_THREAD });
  await settle(50);
  assert.equal((await (await fetch(`${base}/health`)).json()).activeTurns, 0);
});


test("a turn's run is released after a failure too: status is false and the next turn starts clean", async () => {
  setModelForTests({ language: scripted([() => { throw new Error("boom"); }, liveStep({ deltas: ["Veikia."] })]) });
  const { chunks } = await readSse(await postTurn(base));
  assert.ok(chunks.some((c) => c.type === "error"));
  await waitForLog(stub);
  assert.deepEqual((await status()).body, { running: false, startedAt: null });

  const again = await readSse(await postTurn(base));
  assert.equal(textOf(again.chunks), "Veikia.");
});
