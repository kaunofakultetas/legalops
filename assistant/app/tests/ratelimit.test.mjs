// -----------------------------------------------------------
//  [*] Tests — the turn rate limiter (services/ratelimit.js)
//
//  Its own process with RATE_LIMIT_TURNS at 3, set before
//  config.js loads, and Date.now driven by hand. The limiter
//  alone first — a fixed window per key, the countdown, the
//  sweep of ended windows — then through the app, where it
//  runs after identity and before the body is validated.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startStubDjango } from "./stubDjango.mjs";


// In place of env.mjs, whose lifted turn limit would hide the
// limiter; set before config.js loads in before()
process.env.RATE_LIMIT_TURNS = "3";
process.env.AI_GATEWAY_KEY = "test-key";
process.env.ASSISTANT_INTERNAL_SECRET = "s3cret";

// The window every key gets (config.js RATE_LIMIT_WINDOW_MS)
const WINDOW_MS = 60_000;

// The limiter, imported by before() once the environment is
// set; the stub and the app; the clock Date.now reads
let checkTurnLimit;
let trackedWindowsForTests;
let stub;
let server;
let base;
let clock = 1_800_000_000_000;







// -----------------------------------------------------------
// useClock
// -----------------------------------------------------------
//
// Date.now answers `clock` for the rest of the test; each test
// starts one hour after the previous one, so no window
// survives into the next test.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function useClock(t) {
  clock += 3_600_000;
  t.mock.method(Date, "now", () => clock);
}







// -----------------------------------------------------------
// refusal
// -----------------------------------------------------------
//
// Runs checkTurnLimit for the key and returns the error it
// threw, or null when the turn was admitted.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function refusal(key) {
  try {
    checkTurnLimit(key);
    return null;
  } catch (err) {
    return err;
  }
}


before(async () => {
  ({ checkTurnLimit, trackedWindowsForTests } = await import("../services/ratelimit.js"));
  const { RATE_LIMIT_TURNS, RATE_LIMIT_WINDOW_MS } = await import("../config.js");
  assert.equal(RATE_LIMIT_TURNS, 3);
  assert.equal(RATE_LIMIT_WINDOW_MS, WINDOW_MS);

  stub = await startStubDjango({
    "GET /api/auth/me": (_b, req) => ({ json: { id: req.headers.authorization.slice(7), displayName: null, role: "user" } }),
  });
  process.env.DJANGO_URL = stub.url;
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await stub.close();
});


test("three turns per window, then 429 RATE_LIMITED waiting the whole window", (t) => {
  useClock(t);
  for (let turn = 1; turn <= 3; turn += 1) assert.equal(refusal("user:a"), null, `turn ${turn}`);
  const err = refusal("user:a");
  assert.equal(err.status, 429);
  assert.equal(err.code, "RATE_LIMITED");
  assert.equal(err.message, "Too many questions in a row — wait a moment");
  assert.deepEqual(err.details, { retryAfterS: 60 });
});


test("retryAfterS counts down to the window's end and never below one second", (t) => {
  useClock(t);
  const start = clock;
  for (let turn = 0; turn < 3; turn += 1) checkTurnLimit("user:b");
  const waits = [[15_200, 45], [30_000, 30], [59_001, 1], [59_999, 1]].map(([offset, expected]) => {
    clock = start + offset;
    return [refusal("user:b").details.retryAfterS, expected];
  });
  for (const [actual, expected] of waits) assert.equal(actual, expected);
  clock = start + WINDOW_MS;
  assert.equal(refusal("user:b"), null, "the window's end resets the key");
});


test("a refused turn neither counts nor stretches the window", (t) => {
  useClock(t);
  const start = clock;
  for (let turn = 0; turn < 3; turn += 1) checkTurnLimit("user:c");
  for (let second = 1; second <= 50; second += 1) {
    clock = start + second * 1_000;
    assert.equal(refusal("user:c").status, 429);
  }
  clock = start + WINDOW_MS;
  for (let turn = 1; turn <= 3; turn += 1) assert.equal(refusal("user:c"), null, `fresh window, turn ${turn}`);
  assert.equal(refusal("user:c").status, 429, "and the fresh window has the same ceiling");
});


test("the window is fixed, not sliding: a burst across its edge is admitted", (t) => {
  useClock(t);
  const start = clock;
  checkTurnLimit("user:d");
  clock = start + 59_000;
  checkTurnLimit("user:d");
  checkTurnLimit("user:d");
  clock = start + WINDOW_MS;
  for (let turn = 0; turn < 3; turn += 1) assert.equal(refusal("user:d"), null);
  assert.equal(refusal("user:d").status, 429, "five admitted within two seconds — the documented fixed-window trade-off");
});


test("keys are isolated, compared as exact strings", (t) => {
  useClock(t);
  for (let turn = 0; turn < 3; turn += 1) checkTurnLimit("user:1");
  assert.equal(refusal("user:1").status, 429);
  for (const other of ["user:10", "user:1 ", "USER:1", "user:2", "ip:1"]) {
    assert.equal(refusal(other), null, JSON.stringify(other));
  }
});


test("each check sweeps every expired window and keeps the live ones", (t) => {
  useClock(t);
  const start = clock;
  for (let user = 0; user < 1_000; user += 1) checkTurnLimit(`user:old-${user}`);
  clock = start + 30_000;
  for (let user = 0; user < 10; user += 1) checkTurnLimit(`user:mid-${user}`);
  assert.equal(trackedWindowsForTests(), 1_010, "the earlier tests' windows, an hour old, went with the first check");

  clock = start + WINDOW_MS;
  checkTurnLimit("user:sweeper");
  assert.equal(trackedWindowsForTests(), 11, "only the ten live windows and the new one remain");
  clock = start + 30_000 + WINDOW_MS;
  checkTurnLimit("user:sweeper-2");
  assert.equal(trackedWindowsForTests(), 2, "the ten ended; the sweeper's (opened 30 s ago) lives on beside the new one");
});


test("through the app: after identity, before validation — a malformed turn counts; the 429 envelope has Retry-After", async (t) => {
  useClock(t);
  t.mock.method(console, "warn", () => {});
  const post = (user) => fetch(`${base}/api/assistant/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${user}` }, body: "{}",
  });
  for (let turn = 0; turn < 3; turn += 1) {
    const answer = await post("u-app");
    assert.equal(answer.status, 400, "the body is validated after the limiter counted the turn");
    assert.equal((await answer.json()).error.code, "INVALID_THREAD");
  }
  const limited = await post("u-app");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.deepEqual(await limited.json(), {
    message: "Too many questions in a row — wait a moment",
    error: { code: "RATE_LIMITED", message: "Too many questions in a row — wait a moment", retryAfterS: 60 },
  });
  assert.equal((await post("u-other")).status, 400, "another user is untouched");
  const guest = await fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(guest.status, 401, "a guest is refused before the limiter — it never holds a window");
});
