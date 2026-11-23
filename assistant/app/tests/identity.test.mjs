// -----------------------------------------------------------
//  [*] Tests — who is asking (services/identity.js)
//
//  resolveIdentity against the Django stub, and the raw double
//  for the answers the stub cannot give, with Date.now driven
//  by hand so the cache expires on cue. Only Django's 401 may
//  become our 401: the GUI signs the user out on it.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { startRawServer } from "./helpers/rawServer.mjs";
import { startStubDjango } from "./stubDjango.mjs";
import { IDENTITY_CACHE_MS } from "../config.js";
import { HttpError } from "../middleware/errors.js";
import { userClient } from "../services/django.js";
import { forgetToken, resetIdentityCacheForTests, resolveIdentity } from "../services/identity.js";


// AbortSignal.timeout as the platform ships it
const realTimeout = AbortSignal.timeout.bind(AbortSignal);

// What /api/auth/me answers, by bearer
const ANSWERS = {
  "Bearer tok": () => ({ json: { id: "u1", displayName: "Tomas", role: "admin", email: "t@x.lt" } }),
  "Bearer bare": () => ({ json: { id: "u2" } }),
  "Bearer forbidden": () => ({ status: 403, json: { error: "Insufficient role", code: "FORBIDDEN" } }),
  "Bearer broken": () => ({ status: 500, json: { error: "Server error", code: "SERVER_ERROR" } }),
  "Bearer busy": () => ({ status: 503, json: { error: "Database unavailable", code: "SERVICE_UNAVAILABLE" } }),
  "Bearer no-id": () => ({ json: { displayName: "Nobody" } }),
  "Bearer empty": () => ({ json: {} }),
};

// The stub and the raw double; the clock Date.now reads, an
// hour on per test; flaky makes an unlisted bearer a 500
let stub;
let raw;
let clock = 1_800_000_000_000;
let flaky = false;







// -----------------------------------------------------------
// request
// -----------------------------------------------------------
//
// A stand-in request carrying what resolveIdentity reads: the
// Authorization header and the X-Real-IP.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function request(authorization, realIp = "203.0.113.4") {
  const headers = { authorization, "x-real-ip": realIp };
  return { get: (name) => headers[name.toLowerCase()], socket: { remoteAddress: "10.0.0.5" } };
}







// -----------------------------------------------------------
// meCalls
// -----------------------------------------------------------
//
// How many times the stub was asked who someone is during this
// test (beforeEach clears the record).
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function meCalls() {
  return stub.requests.filter((r) => r.path === "/api/auth/me").length;
}







// -----------------------------------------------------------
// rejection
// -----------------------------------------------------------
//
// Resolves a request that must fail and returns its HttpError;
// the test fails when it resolves or rejects with anything
// else.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function rejection(req) {
  try {
    const value = await resolveIdentity(req);
    assert.fail(`expected a rejection, got ${JSON.stringify(value)}`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    assert.ok(err instanceof HttpError, `${err?.name}: ${err?.message}`);
    return err;
  }
}


before(async () => {
  stub = await startStubDjango({
    "GET /api/auth/me": (_b, req) => {
      const answer = ANSWERS[req.headers.authorization];
      if (answer) return answer();
      if (flaky) return { status: 500, json: { error: "down", code: "SERVER_ERROR" } };
      if (/^Bearer t-\d+$/.test(req.headers.authorization)) return { json: { id: req.headers.authorization.slice(7) } };
      return { status: 401, json: { error: "Authentication required", code: "AUTH_REQUIRED" } };
    },
    "GET /api/companies": () => ({ status: 401, json: { error: "Authentication required", code: "AUTH_REQUIRED" } }),
  });
  raw = await startRawServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html>hiccup</html>"); });
});

beforeEach((t) => {
  process.env.DJANGO_URL = stub.url;
  stub.requests.length = 0;
  flaky = false;
  resetIdentityCacheForTests();
  clock += 3_600_000;
  t.mock.method(Date, "now", () => clock);
});

after(async () => {
  await stub.close();
  await raw.close();
});


test("a bearer becomes the user: /api/auth/me asked with the bearer and the end user's IP", async () => {
  const user = await resolveIdentity(request("Bearer tok", "198.51.100.23"));
  assert.deepEqual(user, { userId: "u1", displayName: "Tomas", role: "admin", token: "tok", clientIp: "198.51.100.23" });
  const [me] = stub.requests;
  assert.deepEqual([me.method, me.path, me.auth, me.realIp, me.secret], ["GET", "/api/auth/me", "Bearer tok", "198.51.100.23", null]);
  assert.deepEqual(await resolveIdentity(request("Bearer bare")),
                   { userId: "u2", displayName: null, role: "user", token: "bare", clientIp: "203.0.113.4" }, "defaults");
});


test("no bearer, or another scheme, is a guest — and Django is not asked", async () => {
  for (const header of [undefined, "", "Basic dG9rOng=", "Bearer", "Bearer ", "Bearer    ", "Token tok", "Bearertok", "tok"]) {
    assert.deepEqual(await resolveIdentity(request(header)),
                     { userId: null, displayName: null, role: null, token: null, clientIp: "203.0.113.4" }, JSON.stringify(header));
  }
  assert.equal(meCalls(), 0);
  assert.equal((await resolveIdentity(request(undefined, "1.2.3.4:5"))).clientIp, null, "a guest's malformed IP is dropped too");
});


test("the header is parsed exactly as Django parses it: scheme to the first space, the rest trimmed (FIXED 2026-09)", async () => {
  for (const header of ["bearer tok", "BEARER tok", "Bearer  tok", "Bearer tok   ", "Bearer \t tok"]) {
    resetIdentityCacheForTests();
    assert.equal((await resolveIdentity(request(header))).userId, "u1", JSON.stringify(header));
  }
  assert.ok(stub.requests.every((r) => r.auth === "Bearer tok"), "Django always gets the clean token");

  const spaced = await rejection(request("Bearer tok extra"));
  assert.deepEqual([spaced.status, spaced.code], [401, "SESSION_INVALID"], "a token with a space is not the token before it");
  assert.equal(stub.requests.at(-1).auth, "Bearer tok extra");
});


test("the cache: one Django call per token for IDENTITY_CACHE_MS, re-asked at expiry; the IP is never cached", async () => {
  assert.equal(IDENTITY_CACHE_MS, 15_000);
  const start = clock;
  await resolveIdentity(request("Bearer tok", "203.0.113.1"));
  clock = start + IDENTITY_CACHE_MS - 1;
  const cached = await resolveIdentity(request("Bearer tok", "203.0.113.2"));
  assert.equal(meCalls(), 1, "served from the cache");
  assert.equal(cached.clientIp, "203.0.113.2", "the IP is this request's, not the cached one");
  clock = start + IDENTITY_CACHE_MS;
  await resolveIdentity(request("Bearer tok"));
  assert.equal(meCalls(), 2, "asked again once the TTL ran out");
  assert.equal(stub.requests.at(-1).realIp, "203.0.113.4");
});


test("a failure is never cached: a 401 or a 5xx is asked again next time", async () => {
  flaky = true;
  const down = await rejection(request("Bearer t-1"));
  assert.deepEqual([down.status, down.code], [500, "SERVER_ERROR"]);
  flaky = false;
  assert.equal((await resolveIdentity(request("Bearer t-1"))).userId, "t-1");
  await rejection(request("Bearer dead"));
  await rejection(request("Bearer dead"));
  assert.equal(stub.requests.filter((r) => r.auth === "Bearer dead").length, 2);
});


test("any public 401 for a bearer evicts it at once; forgetToken and a reset drop it too", async () => {
  await resolveIdentity(request("Bearer tok"));
  await assert.rejects(() => userClient({ token: "tok" }).get("/api/companies"), (err) => err.status === 401);
  await resolveIdentity(request("Bearer tok"));
  assert.equal(meCalls(), 2, "the 401 on a tool call evicted the bearer");
  forgetToken("tok");
  await resolveIdentity(request("Bearer tok"));
  assert.equal(meCalls(), 3);
  resetIdentityCacheForTests();
  await resolveIdentity(request("Bearer tok"));
  assert.equal(meCalls(), 4);
  await assert.rejects(() => userClient({ token: "other" }).get("/api/companies"));
  await resolveIdentity(request("Bearer tok"));
  assert.equal(meCalls(), 4, "another bearer's 401 leaves this one cached");
});


test("the cache holds at most 1 000 bearers: the oldest is dropped first", async () => {
  for (let n = 0; n <= 1_000; n += 1) await resolveIdentity(request(`Bearer t-${n}`));
  assert.equal(meCalls(), 1_001);
  await resolveIdentity(request("Bearer t-1000"));
  await resolveIdentity(request("Bearer t-2"));
  assert.equal(meCalls(), 1_001, "the newest ones are still cached");
  await resolveIdentity(request("Bearer t-0"));
  assert.equal(meCalls(), 1_002, "the oldest had to go");
});


test("only Django's 401 is our 401; 403 and 5xx keep Django's status and code", async () => {
  const dead = await rejection(request("Bearer dead"));
  assert.deepEqual([dead.status, dead.code, dead.message], [401, "SESSION_INVALID", "Session expired or invalid"]);
  const cases = [["Bearer forbidden", 403, "FORBIDDEN"], ["Bearer broken", 500, "SERVER_ERROR"], ["Bearer busy", 503, "SERVICE_UNAVAILABLE"]];
  for (const [header, status, code] of cases) {
    const err = await rejection(request(header));
    assert.deepEqual([err.status, err.code], [status, code], header);
  }
});


test("an OK answer without a user is a 502, never a 401 that signs the user out (FIXED 2026-09)", async () => {
  for (const header of ["Bearer no-id", "Bearer empty"]) {
    const err = await rejection(request(header));
    assert.deepEqual([err.status, err.code, err.message], [502, "DJANGO_UNREACHABLE", "Backend answered without a user"], header);
  }
  process.env.DJANGO_URL = raw.url;
  const html = await rejection(request("Bearer tok"));
  assert.deepEqual([html.status, html.code], [502, "DJANGO_UNREACHABLE"], "an HTML page where the user should be");
});


test("Django down or silent is a 502, not a guest and not a 401", async (t) => {
  process.env.DJANGO_URL = "http://127.0.0.1:9";
  const down = await rejection(request("Bearer tok"));
  assert.deepEqual([down.status, down.code], [502, "DJANGO_UNREACHABLE"]);

  t.mock.method(AbortSignal, "timeout", (delay) => realTimeout(Math.min(delay, 100)));
  const silent = await startRawServer(() => {});
  t.after(() => silent.close());
  process.env.DJANGO_URL = silent.url;
  const timedOut = await rejection(request("Bearer tok"));
  assert.deepEqual([timedOut.status, timedOut.code], [502, "DJANGO_UNREACHABLE"]);
});


test("concurrent turns of one uncached bearer both resolve", async () => {
  const [a, b] = await Promise.all([resolveIdentity(request("Bearer tok")), resolveIdentity(request("Bearer tok"))]);
  assert.equal(a.userId, "u1");
  assert.equal(b.userId, "u1");
  await resolveIdentity(request("Bearer tok"));
  assert.ok(meCalls() <= 2, "and the cache serves the next one");
});
