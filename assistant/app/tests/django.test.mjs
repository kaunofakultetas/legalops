// -----------------------------------------------------------
//  [*] Tests — the Django clients (services/django.js)
//
//  Both doors and userClient against the Django stub, and
//  against a raw HTTP double that misbehaves on purpose: an
//  HTML page, a body cut off mid-way, silence. A failed or
//  unreadable answer must be a 502, never a silent null that
//  identity would read as "signed out".
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { startRawServer } from "./helpers/rawServer.mjs";
import { startStubDjango } from "./stubDjango.mjs";
import { HttpError } from "../middleware/errors.js";
import { internalFetch, onUnauthorized, publicFetch, userClient } from "../services/django.js";


// AbortSignal.timeout as the platform ships it
const realTimeout = AbortSignal.timeout.bind(AbortSignal);

// The Django stub and the raw double, whose answer each test
// sets in rawAnswer
let stub;
let raw;
let rawAnswer = (_req, res) => res.end("{}");







// -----------------------------------------------------------
// failure
// -----------------------------------------------------------
//
// Awaits a call that must fail and returns its HttpError; the
// test fails when the call resolves or rejects with anything
// else.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function failure(promise) {
  try {
    const value = await promise;
    assert.fail(`expected a rejection, got ${JSON.stringify(value)}`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    assert.ok(err instanceof HttpError, `an HttpError, not ${err?.name}: ${err?.message}`);
    return err;
  }
}







// -----------------------------------------------------------
// shortTimeouts
// -----------------------------------------------------------
//
// Caps every AbortSignal.timeout at `ms` for one test and
// records the delays asked for — the client's 15 s ceiling
// is checked without waiting 15 s.
//
// Used by:
//   - the timeout tests (below)
// -----------------------------------------------------------

function shortTimeouts(t, ms = 150) {
  return t.mock.method(AbortSignal, "timeout", (delay) => realTimeout(Math.min(delay, ms)));
}


before(async () => {
  stub = await startStubDjango({
    "GET /api/echo": (body, req) => ({ json: { method: req.method, body } }),
    "POST /api/echo": (body, req) => ({ json: { method: req.method, body } }),
    "PUT /api/echo": (body, req) => ({ json: { method: req.method, body } }),
    "PATCH /api/echo": (body, req) => ({ json: { method: req.method, body } }),
    "DELETE /api/echo": (body, req) => ({ json: { method: req.method, body } }),
    "GET /api/list": () => ({ json: [{ id: 1 }, { id: 2 }] }),
    "GET /api/company-missing": () => ({ status: 404, json: { error: "Company not found", code: "NOT_FOUND" } }),
    "GET /api/nested": () => ({ status: 409, json: { error: { code: "ALREADY_RUNNING", message: "A run is live" } } }),
    "GET /api/message-only": () => ({ status: 400, json: { message: "Bad thing" } }),
    "GET /api/numeric-code": () => ({ status: 422, json: { error: "Nope", code: 42 } }),
    "GET /api/long": () => ({ status: 400, json: { error: "x".repeat(2_000), code: "INVALID_FIELD" } }),
    "GET /api/unauthorized": () => ({ status: 401, json: { error: "Authentication required", code: "AUTH_REQUIRED" } }),
    "GET /api/forbidden": () => ({ status: 403, json: { error: "Insufficient role", code: "FORBIDDEN" } }),
    "GET /internal/assistant/x": () => ({ json: { ok: true } }),
    "POST /internal/assistant/x": (body) => ({ status: 201, json: { got: body } }),
    "GET /internal/assistant/unauthorized": () => ({ status: 401, json: { error: "no", code: "AUTH_REQUIRED" } }),
    "GET /internal/assistant/refused": () => ({ status: 403, json: { error: "Forbidden", code: "INTERNAL_ONLY" } }),
  });
  raw = await startRawServer((req, res, body) => rawAnswer(req, res, body));
  process.env.DJANGO_URL = stub.url;
});

beforeEach(() => {
  process.env.DJANGO_URL = stub.url;
  stub.requests.length = 0;
});

after(async () => {
  await stub.close();
  await raw.close();
});


test("the public door: bearer and X-Real-IP when known, JSON content type, never the internal secret", async () => {
  await publicFetch("/api/echo", { token: "tok-1", clientIp: "203.0.113.4" });
  await publicFetch("/api/echo");
  await publicFetch("/api/echo", { token: "tok-2" });
  const [full, bare, noIp] = stub.requests;
  assert.deepEqual([full.auth, full.realIp, full.secret], ["Bearer tok-1", "203.0.113.4", null]);
  assert.deepEqual([bare.auth, bare.realIp, bare.secret], [null, null, null], "no bearer, no IP → neither header");
  assert.deepEqual([noIp.auth, noIp.realIp], ["Bearer tok-2", null]);
  const raws = raw.requests.length;
  process.env.DJANGO_URL = raw.url;
  rawAnswer = (_req, res) => res.end("{}");
  await publicFetch("/api/echo", { token: "t", headers: { "X-Extra": "1" } });
  const seen = raw.requests[raws].headers;
  assert.equal(seen["content-type"], "application/json");
  assert.equal(seen["x-extra"], "1", "extra headers ride along");
  assert.equal(seen["x-internal-secret"], undefined);
});


test("the internal door: the shared secret, never a bearer or an X-Real-IP", async () => {
  assert.deepEqual(await internalFetch("/internal/assistant/x"), { ok: true });
  assert.deepEqual(await internalFetch("/internal/assistant/x", { method: "POST", body: { a: "ą" } }), { got: { a: "ą" } });
  for (const request of stub.requests) {
    assert.equal(request.secret, "s3cret");
    assert.equal(request.auth, null);
    assert.equal(request.realIp, null);
  }
});


test("userClient binds one user to every verb; bodies are JSON and UTF-8 both ways", async () => {
  const django = userClient({ token: "tok-u", clientIp: "198.51.100.8" });
  const text = "Įmonė „Kripto“ — 💶 €";
  assert.deepEqual(await django.get("/api/echo"), { method: "GET", body: null });
  assert.deepEqual(await django.post("/api/echo", { text }), { method: "POST", body: { text } });
  assert.deepEqual(await django.put("/api/echo", { n: 1 }), { method: "PUT", body: { n: 1 } });
  assert.deepEqual(await django.patch("/api/echo", { n: 2 }), { method: "PATCH", body: { n: 2 } });
  assert.deepEqual(await django.del("/api/echo"), { method: "DELETE", body: null });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.auth, r.realIp]), [
    ["GET", "Bearer tok-u", "198.51.100.8"], ["POST", "Bearer tok-u", "198.51.100.8"], ["PUT", "Bearer tok-u", "198.51.100.8"],
    ["PATCH", "Bearer tok-u", "198.51.100.8"], ["DELETE", "Bearer tok-u", "198.51.100.8"],
  ]);
  assert.deepEqual(await django.get("/api/list"), [{ id: 1 }, { id: 2 }], "an array answer is returned as is");
});


test("Django's error envelope survives: status, code, message, and the path in the details", async () => {
  const missing = await failure(publicFetch("/api/company-missing", { token: "t" }));
  assert.deepEqual([missing.status, missing.code, missing.message], [404, "NOT_FOUND", "Company not found"]);
  assert.deepEqual(missing.details, { path: "/api/company-missing", upstreamStatus: 404 });
  const nested = await failure(publicFetch("/api/nested"));
  assert.deepEqual([nested.status, nested.code, nested.message], [409, "ALREADY_RUNNING", "A run is live"]);
  const bare = await failure(publicFetch("/api/message-only"));
  assert.deepEqual([bare.status, bare.code, bare.message], [400, "DJANGO_API_ERROR", "Bad thing"]);
  const numeric = await failure(publicFetch("/api/numeric-code"));
  assert.deepEqual([numeric.status, numeric.code], [422, "DJANGO_API_ERROR"], "a non-string code is not trusted");
  const long = await failure(publicFetch("/api/long"));
  assert.equal(long.message.length, 500, "the message is capped");
  const refused = await failure(internalFetch("/internal/assistant/refused"));
  assert.deepEqual([refused.status, refused.code], [403, "INTERNAL_ONLY"], "the internal door maps the same way");
});


test("an error answer that is not JSON (a proxy page, nothing at all) is DJANGO_API_ERROR with its status", async () => {
  process.env.DJANGO_URL = raw.url;
  rawAnswer = (_req, res) => { res.writeHead(502, { "Content-Type": "text/html" }); res.end("<html><h1>Bad Gateway</h1></html>"); };
  const page = await failure(publicFetch("/api/x"));
  assert.deepEqual([page.status, page.code, page.message], [502, "DJANGO_API_ERROR", "Backend answered 502"]);
  rawAnswer = (_req, res) => { res.writeHead(500); res.end(); };
  const empty = await failure(publicFetch("/api/x"));
  assert.deepEqual([empty.status, empty.code, empty.message], [500, "DJANGO_API_ERROR", "Backend answered 500"]);
});


test("an OK answer: JSON as is, an empty body is null", async () => {
  process.env.DJANGO_URL = raw.url;
  rawAnswer = (_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"id":"u1","name":"Ūla 😀"}'); };
  assert.deepEqual(await publicFetch("/api/x"), { id: "u1", name: "Ūla 😀" });
  rawAnswer = (_req, res) => { res.writeHead(204); res.end(); };
  assert.equal(await publicFetch("/api/x"), null);
  rawAnswer = (_req, res) => { res.writeHead(200); res.end(); };
  assert.equal(await publicFetch("/api/x"), null);
  rawAnswer = (_req, res) => { res.writeHead(200); res.end("null"); };
  assert.equal(await publicFetch("/api/x"), null);
});


test("an OK answer that is not JSON, or breaks off mid-way, is a 502 — never a silent null (FIXED 2026-09)", async () => {
  process.env.DJANGO_URL = raw.url;
  rawAnswer = (_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html>proxy says hi</html>"); };
  const html = await failure(publicFetch("/api/auth/me", { token: "t" }));
  assert.deepEqual([html.status, html.code, html.message], [502, "DJANGO_UNREACHABLE", "Backend answered an unreadable body"]);
  assert.deepEqual(html.details, { path: "/api/auth/me", upstreamStatus: 200 });

  rawAnswer = (_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"id": "u1", "na'); };
  assert.equal((await failure(internalFetch("/internal/assistant/prompt"))).code, "DJANGO_UNREACHABLE", "truncated JSON");

  rawAnswer = (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": "500" });
    res.write('{"id":"u1",');
    setTimeout(() => res.socket.destroy(), 30);
  };
  const cut = await failure(publicFetch("/api/auth/me", { token: "t" }));
  assert.deepEqual([cut.status, cut.code, cut.message], [502, "DJANGO_UNREACHABLE", "Backend unreachable"]);
  assert.equal(cut.details.path, "/api/auth/me");
});


test("Django down: a refused connection is 502 DJANGO_UNREACHABLE; the cause stays in the details", async () => {
  process.env.DJANGO_URL = "http://127.0.0.1:9";
  const down = await failure(publicFetch("/api/auth/me", { token: "t" }));
  assert.deepEqual([down.status, down.code, down.message], [502, "DJANGO_UNREACHABLE", "Backend unreachable"]);
  assert.equal(down.details.path, "/api/auth/me");
  assert.equal(typeof down.details.cause, "string");
  assert.equal((await failure(internalFetch("/internal/assistant/prompt"))).code, "DJANGO_UNREACHABLE");
});


test("Django silent: no answer within the ceiling (15 s, asked per call) is 502 DJANGO_UNREACHABLE", async (t) => {
  const timeouts = shortTimeouts(t);
  process.env.DJANGO_URL = raw.url;
  rawAnswer = () => {};
  const silent = await failure(publicFetch("/api/auth/me", { token: "t" }));
  assert.deepEqual([silent.status, silent.code], [502, "DJANGO_UNREACHABLE"]);
  assert.deepEqual(timeouts.mock.calls.map((call) => call.arguments[0]), [15_000]);
});


test("a call may name its own ceiling: the one that waits for a model in Django asks for longer", async (t) => {
  const asked = t.mock.method(AbortSignal, "timeout", (delay) => realTimeout(delay));
  stub.routes["POST /api/corpus/check-citations"] = () => ({ json: { results: [] } });
  const django = userClient({ token: "tok" });
  await django.post("/api/corpus/check-citations", { citations: [] }, { timeoutMs: 150_000 });
  await django.post("/api/corpus/check-citations", { citations: [] });
  assert.deepEqual(asked.mock.calls.map((call) => call.arguments[0]), [150_000, 15_000], "the option, then the default");
  const sent = stub.requests.at(-2);
  assert.deepEqual([sent.method, sent.body, sent.auth], ["POST", { citations: [] }, "Bearer tok"], "the option is not sent on");
});


test("Django stalled mid-body: the ceiling covers the body too — 502, not a hang or a null (FIXED 2026-09)", async (t) => {
  shortTimeouts(t);
  process.env.DJANGO_URL = raw.url;
  rawAnswer = (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": "100" });
    res.write('{"id":');
  };
  const started = Date.now();
  const stalled = await failure(internalFetch("/internal/assistant/prompt"));
  assert.deepEqual([stalled.status, stalled.code], [502, "DJANGO_UNREACHABLE"]);
  assert.ok(Date.now() - started < 3_000, "bounded by the (shortened) ceiling");
});


test("DJANGO_URL is read at call time and loses its trailing slashes (FIXED 2026-09)", async () => {
  process.env.DJANGO_URL = `${stub.url}///`;
  assert.deepEqual(await publicFetch("/api/echo"), { method: "GET", body: null });
  assert.equal(stub.requests.at(-1).path, "/api/echo", "no doubled slash reached Django");
  const raws = raw.requests.length;
  process.env.DJANGO_URL = raw.url;
  rawAnswer = (_req, res) => res.end('{"from":"raw"}');
  assert.deepEqual(await publicFetch("/api/echo"), { from: "raw" });
  assert.equal(raw.requests.length, raws + 1, "the next call went to the new URL");
});


test("a 401 on the public door with a bearer is broadcast; nothing else is", async () => {
  const heard = [];
  const unsubscribe = onUnauthorized((token) => heard.push(token));
  try {
    const refused = await failure(publicFetch("/api/unauthorized", { token: "tok-dead" }));
    assert.deepEqual([refused.status, refused.code], [401, "AUTH_REQUIRED"], "the 401 still reaches the caller");
    await failure(publicFetch("/api/unauthorized"));
    await failure(publicFetch("/api/forbidden", { token: "tok-403" }));
    await failure(internalFetch("/internal/assistant/unauthorized"));
    await failure(userClient({ token: "tok-client" }).get("/api/unauthorized"));
    assert.deepEqual(heard, ["tok-dead", "tok-client"]);
  } finally {
    unsubscribe();
  }
  await failure(publicFetch("/api/unauthorized", { token: "tok-after" }));
  assert.deepEqual(heard, ["tok-dead", "tok-client"], "an unsubscribed listener hears nothing");
});
