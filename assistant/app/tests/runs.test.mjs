// -----------------------------------------------------------
//  [*] Tests — the live turns (services/runs.js)
//
//  The run registry that the chat, stop and status routes,
//  /health and the shutdown share: registering a turn and
//  superseding the old one, stop and status for the owner only,
//  finish(), the first stop reason winning, and the shutdown
//  drain. Every test finishes the runs it starts, so the
//  registry is empty between tests.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { activeRunCount, drainRuns, runStatus, startRun, stopRun } from "../services/runs.js";


// Every run started by the current test
const started = [];







// -----------------------------------------------------------
// run
// -----------------------------------------------------------
//
// Starts a run and remembers it, so afterEach can finish it.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function run(threadId, userId) {
  const handle = startRun(threadId, userId);
  started.push(handle);
  return handle;
}


afterEach(() => {
  for (const handle of started.splice(0)) handle.finish();
  assert.equal(activeRunCount(), 0, "the registry is empty between tests");
});


test("startRun registers a fresh live run", () => {
  const handle = run("t-1", "u-1");
  assert.match(handle.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual([handle.threadId, handle.userId, handle.stopReason, handle.finished], ["t-1", "u-1", null, false]);
  assert.ok(!Number.isNaN(Date.parse(handle.startedAt)) && handle.startedAt.endsWith("Z"), "an ISO timestamp");
  assert.equal(handle.signal.aborted, false);
  assert.equal(activeRunCount(), 1);
  assert.deepEqual(runStatus("t-1", "u-1"), { running: true, startedAt: handle.startedAt });
  assert.notEqual(run("t-2", "u-1").id, handle.id, "every run has its own id");
});


test("only the owner sees or stops a run: another user reads 'nothing there'", () => {
  const handle = run("t-own", "u-owner");
  assert.deepEqual(runStatus("t-own", "u-intruder"), { running: false, startedAt: null });
  assert.equal(stopRun("t-own", "u-intruder"), false);
  assert.equal(handle.signal.aborted, false, "the intruder's stop did nothing");
  assert.deepEqual(runStatus("t-unknown", "u-owner"), { running: false, startedAt: null });
  assert.equal(stopRun("t-unknown", "u-owner"), false);
});


test("stopRun aborts with reason 'user'; a double stop stays 'user' and answers true until the run finishes", () => {
  const handle = run("t-stop", "u-1");
  assert.equal(stopRun("t-stop", "u-1"), true);
  assert.equal(handle.signal.aborted, true);
  assert.equal(handle.stopReason, "user");
  assert.equal(handle.signal.reason.message, "Turn user");
  assert.equal(stopRun("t-stop", "u-1"), true, "still registered while it persists");
  assert.equal(handle.stopReason, "user");
  assert.equal(activeRunCount(), 1, "a stopped run counts until it has persisted");
  handle.finish();
  assert.equal(stopRun("t-stop", "u-1"), false, "nothing left to stop");
  assert.deepEqual(runStatus("t-stop", "u-1"), { running: false, startedAt: null });
});


test("finish() is idempotent", () => {
  const handle = run("t-fin", "u-1");
  run("t-other", "u-1");
  handle.finish();
  handle.finish();
  assert.equal(handle.finished, true);
  assert.equal(activeRunCount(), 1, "the second finish removed nothing else");
});


test("a new turn in the same thread supersedes the old one, which counts until it has persisted", () => {
  const first = run("t-sup", "u-1");
  const second = run("t-sup", "u-1");
  assert.equal(first.signal.aborted, true);
  assert.equal(first.stopReason, "superseded");
  assert.equal(first.signal.reason.message, "Turn superseded");
  assert.equal(second.signal.aborted, false);
  assert.equal(activeRunCount(), 2);
  assert.deepEqual(runStatus("t-sup", "u-1"), { running: true, startedAt: second.startedAt });

  first.finish();
  assert.equal(activeRunCount(), 1);
  assert.deepEqual(runStatus("t-sup", "u-1"), { running: true, startedAt: second.startedAt },
                   "the old run's finish never unregisters its successor");
  assert.equal(stopRun("t-sup", "u-1"), true);
  assert.equal(second.stopReason, "user", "the stop reaches the current run");
});


test("threads are independent; one user's runs in several threads are stopped one by one", () => {
  const a = run("t-a", "u-1");
  const b = run("t-b", "u-1");
  const c = run("t-c", "u-2");
  assert.equal(activeRunCount(), 3);
  stopRun("t-a", "u-1");
  assert.deepEqual([a.signal.aborted, b.signal.aborted, c.signal.aborted], [true, false, false]);
  assert.equal(runStatus("t-b", "u-1").running, true);
  assert.equal(runStatus("t-c", "u-2").running, true);
});


test("the first reason wins: a stopped run stays 'user' through a later supersede", () => {
  const first = run("t-reason", "u-1");
  stopRun("t-reason", "u-1");
  run("t-reason", "u-1");
  assert.equal(first.stopReason, "user");
});


test("drainRuns returns at once when no turn is live", async () => {
  const startedAt = Date.now();
  await drainRuns(10_000);
  assert.ok(Date.now() - startedAt < 100);
});


test("drainRuns returns as soon as the last live turn finishes within the grace", async () => {
  const a = run("t-drain-a", "u-1");
  const b = run("t-drain-b", "u-2");
  setTimeout(() => a.finish(), 50);
  setTimeout(() => b.finish(), 120);
  const startedAt = Date.now();
  await drainRuns(10_000);
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 100 && elapsed < 1_000, `returned after the last finish (${elapsed} ms)`);
  assert.equal(a.stopReason, null, "nobody was aborted");
  assert.equal(b.stopReason, null);
});


test("past the grace, stragglers are aborted with 'shutdown' and given the settle time to persist", async () => {
  const straggler = run("t-slow", "u-1");
  const persisted = [];
  straggler.signal.addEventListener("abort", () => setTimeout(() => {
    persisted.push(straggler.stopReason);
    straggler.finish();
  }, 30));
  const startedAt = Date.now();
  await drainRuns(80, 5_000);
  const elapsed = Date.now() - startedAt;
  assert.equal(straggler.stopReason, "shutdown");
  assert.equal(straggler.signal.reason.message, "Turn shutdown");
  assert.deepEqual(persisted, ["shutdown"], "the drain waited for it to persist");
  assert.ok(elapsed >= 80 && elapsed < 2_000, `${elapsed} ms`);
});


test("a straggler that never persists is given up after the settle time", async () => {
  const stuck = run("t-stuck", "u-1");
  const startedAt = Date.now();
  await drainRuns(40, 120);
  const elapsed = Date.now() - startedAt;
  assert.equal(stuck.stopReason, "shutdown");
  assert.ok(elapsed >= 150 && elapsed < 1_500, `grace + settle, then on (${elapsed} ms)`);
  assert.equal(activeRunCount(), 1, "it is still live — the process exits anyway");
});


test("a user's stop before the shutdown keeps its reason: the partial reply is stored as stopped", async () => {
  const handle = run("t-both", "u-1");
  stopRun("t-both", "u-1");
  setTimeout(() => handle.finish(), 150);
  await drainRuns(20, 1_000);
  assert.equal(handle.stopReason, "user");
});
