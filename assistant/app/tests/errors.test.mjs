// -----------------------------------------------------------
//  [*] Tests — the failure discipline and the caches
//
//  The JSON error envelope is a contract with the GUI. The
//  middleware runs on fake requests and responses, then in a
//  bare Express app that has only the parser and the error
//  tail. Alongside: the identity and prompt caches, which never
//  keep a dead bearer or a failure, and the provider-failure
//  classification.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-26 — a rate limit read as a spent budget
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "./env.mjs";
import { APICallError, RetryError } from "ai";
import express from "express";
import net from "node:net";

import { startStubDjango } from "./stubDjango.mjs";
import {
  HttpError, classifyProviderError, errorMiddleware, formatStreamError, normalizeError,
} from "../middleware/errors.js";
import { checkTurnLimit } from "../services/ratelimit.js";
import { RATE_LIMIT_TURNS } from "../config.js";


// The Django stub, the /api/auth/me calls it has answered, and
// whether its prompt route is up (a test switches it)
let stub;
let meCalls = 0;
let promptUp = true;







// -----------------------------------------------------------
// fakeRes
// -----------------------------------------------------------
//
// A stand-in response that records what the middleware does
// to it: the status, the headers, the JSON body, the end.
//
// Used by:
//   - the middleware tests (below)
// -----------------------------------------------------------

function fakeRes() {
  const res = {
    headersSent: false, statusCode: null, body: null, ended: false, headers: {},
    status(code) { res.statusCode = code; return res; },
    set(name, value) { res.headers[name] = value; return res; },
    json(payload) { res.body = payload; return res; },
    end() { res.ended = true; },
  };
  return res;
}







// -----------------------------------------------------------
// fakeReq
// -----------------------------------------------------------
//
// A request with a bearer and an X-Real-IP, enough for
// resolveIdentity and for the middleware's log line.
//
// Used by:
//   - the middleware tests and the identity cache test (below)
// -----------------------------------------------------------

function fakeReq(token) {
  const headers = { authorization: `Bearer ${token}`, "x-real-ip": "192.0.2.1" };
  return { method: "POST", originalUrl: "/x", get: (name) => headers[name.toLowerCase()] };
}







// -----------------------------------------------------------
// captureConsole
// -----------------------------------------------------------
//
// Silences console.warn and console.error for one test and
// keeps every line each was given.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function captureConsole(t) {
  const logs = { warn: [], error: [] };
  for (const level of ["warn", "error"]) {
    t.mock.method(console, level, (...args) => { logs[level].push(args.map(String).join(" ")); });
  }
  return logs;
}







// -----------------------------------------------------------
// bareApp
// -----------------------------------------------------------
//
// A bare Express app on a random port, closed after the test:
// the JSON parser with a 1 kb limit, the routes the test adds
// and the error tail. Returns its base URL, so the failure
// discipline is tested apart from the assistant's own routes.
//
// Used by:
//   - the pipeline tests (below)
// -----------------------------------------------------------

async function bareApp(t, addRoutes) {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  addRoutes(app);
  app.use(errorMiddleware);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}







// -----------------------------------------------------------
// providerError
// -----------------------------------------------------------
//
// An AI SDK APICallError carrying the status, message and body
// a provider answered.
//
// Used by:
//   - the classification and stream log tests (below)
// -----------------------------------------------------------

function providerError(statusCode, message, responseBody) {
  return new APICallError({ message, url: "http://provider/v1", requestBodyValues: {}, statusCode, responseBody });
}


before(async () => {
  stub = await startStubDjango({
    "GET /api/auth/me": () => { meCalls += 1; return { json: { id: "u1", displayName: "Tomas", role: "user" } }; },
    "GET /api/companies": () => ({ status: 401, json: { error: "Session expired", code: "SESSION_INVALID" } }),
    "GET /internal/assistant/prompt": () => (promptUp
      ? { json: { id: "pv1", version: 2, text: "Prompt", model: null } }
      : { status: 500, json: { error: "down", code: "SERVER_ERROR" } }),
  });
  process.env.DJANGO_URL = stub.url;
});

after(async () => { await stub.close(); });


test("an HttpError answers its own status; a 429 adds Retry-After and retryAfterS", () => {
  const res = fakeRes();
  errorMiddleware(new HttpError(429, "RATE_LIMITED", "Wait", { retryAfterS: 30 }), fakeReq("t"), res, () => {});
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "30");
  assert.deepEqual(res.body, { message: "Wait", error: { code: "RATE_LIMITED", message: "Wait", retryAfterS: 30 } });
});


test("a generic throw is a 500 whose real message stays OFF the wire; parse errors stay 4xx", () => {
  const res = fakeRes();
  errorMiddleware(new Error("secret leaked"), fakeReq("t"), res, () => {});
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes("secret leaked"));
  assert.equal(normalizeError(Object.assign(new SyntaxError("x"), { type: "entity.parse.failed", status: 400 })).code, "INVALID_JSON");
  assert.equal(normalizeError(Object.assign(new Error("x"), { type: "entity.too.large", status: 413 })).status, 413);
});


test("the turn limiter admits the window then answers 429 with a Retry-After", () => {
  const key = "user:limits-test";
  for (let turn = 0; turn < RATE_LIMIT_TURNS; turn += 1) checkTurnLimit(key);
  assert.throws(() => checkTurnLimit(key), (err) => err.status === 429 && err.details.retryAfterS >= 1);
  checkTurnLimit("user:limits-other");
});


test("the identity cache serves a bearer until Django answers 401 for it anywhere", async () => {
  const { resolveIdentity, resetIdentityCacheForTests } = await import("../services/identity.js");
  const { userClient } = await import("../services/django.js");
  resetIdentityCacheForTests();
  meCalls = 0;
  const first = await resolveIdentity(fakeReq("tok-a"));
  assert.equal(first.userId, "u1");
  assert.equal(first.clientIp, "192.0.2.1");
  await resolveIdentity(fakeReq("tok-a"));
  assert.equal(meCalls, 1, "cached");
  await assert.rejects(() => userClient({ token: "tok-a" }).get("/api/companies"), (err) => err.status === 401);
  await resolveIdentity(fakeReq("tok-a"));
  assert.equal(meCalls, 2, "the 401 evicted the bearer");
});


test("the prompt cache never caches a cold-start failure, and serves the last answer after one", async () => {
  const { activePrompt, resetPromptCacheForTests } = await import("../services/prompts.js");
  resetPromptCacheForTests();
  promptUp = false;
  await assert.rejects(() => activePrompt("chat.assistant"), (err) => err.status === 503 && err.code === "PROMPT_UNAVAILABLE");
  promptUp = true;
  const answer = await activePrompt("chat.assistant");
  assert.equal(answer.version, 2, "the failure was not cached");
  resetPromptCacheForTests();
  await activePrompt("chat.assistant");
  promptUp = false;
  const calls = stub.requests.filter((r) => r.path === "/internal/assistant/prompt").length;
  assert.equal((await activePrompt("chat.assistant")).version, 2, "served from cache");
  assert.equal(stub.requests.filter((r) => r.path === "/internal/assistant/prompt").length, calls);
  promptUp = true;
});


test("the client key is the ingress's X-Real-IP, else the socket peer — never X-Forwarded-For", async () => {
  const { clientIpOf, clientKeyOf } = await import("../services/clientIp.js");
  const req = (headers, peer = "10.0.0.5") => ({ get: (name) => headers[name.toLowerCase()], socket: { remoteAddress: peer } });
  assert.equal(clientKeyOf(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6" })), "203.0.113.7");
  assert.equal(clientKeyOf(req({ "x-forwarded-for": "6.6.6.6" })), "10.0.0.5");
  assert.equal(clientIpOf(req({ "x-real-ip": "not an ip; DROP" })), null, "a malformed value is not forwarded");
});


test("HttpError carries status, code, message and details (null by default) and is an Error", () => {
  const err = new HttpError(409, "DUPLICATE_NAME", "Taken", { path: "/x" });
  assert.ok(err instanceof Error);
  assert.deepEqual([err.status, err.code, err.message, err.details], [409, "DUPLICATE_NAME", "Taken", { path: "/x" }]);
  assert.equal(new HttpError(400, "X", "m").details, null);
  assert.deepEqual(normalizeError(new HttpError(0, "", "")),
                   { status: 500, code: "ASSISTANT_ERROR", message: "Assistant error", details: null }, "empty fields get defaults");
  assert.equal(normalizeError(new HttpError(418, "TEAPOT", "m", undefined)).details, null);
});


test("every body-parser failure maps to its own 4xx; an unknown 4xx type is INVALID_BODY; a 5xx type is a 500", () => {
  const parser = (type, status) => Object.assign(new Error(`parser said ${type}`), { type, status });
  const cases = [
    ["entity.parse.failed", 400, 400, "INVALID_JSON", "Request body is not valid JSON"],
    ["entity.too.large", 413, 413, "PAYLOAD_TOO_LARGE", "Request body too large"],
    ["encoding.unsupported", 415, 415, "UNSUPPORTED_ENCODING", "Unsupported request encoding"],
    ["charset.unsupported", 415, 415, "UNSUPPORTED_ENCODING", "Unsupported request charset"],
    ["request.aborted", 400, 400, "INVALID_BODY", "Invalid request body"],
    ["request.size.invalid", 400, 400, "INVALID_BODY", "Invalid request body"],
    ["stream.not.readable", 500, 500, "INTERNAL_ERROR", "Internal assistant error"],
  ];
  for (const [type, status, expectedStatus, code, message] of cases) {
    const normal = normalizeError(parser(type, status));
    assert.deepEqual([normal.status, normal.code, normal.message], [expectedStatus, code, message], type);
  }
  assert.equal(normalizeError(parser("entity.parse.failed", 400)).details, "parser said entity.parse.failed", "the cause is kept for the log");
});


test("a thrown non-Error is a 500 whose value still reaches the log (FIXED 2026-09, regression guard)", () => {
  assert.equal(normalizeError("boom").details, "boom");
  assert.equal(normalizeError(42).details, "42");
  assert.equal(normalizeError({ message: "plain object" }).details, "plain object");
  assert.equal(normalizeError(null).details, null);
  assert.equal(normalizeError(undefined).details, null);
  for (const thrown of ["boom", 42, null, undefined, { message: "m" }]) {
    assert.deepEqual([normalizeError(thrown).status, normalizeError(thrown).code], [500, "INTERNAL_ERROR"]);
  }
});


test("the log line: 4xx a warning with method, URL and client; 5xx an error with its details capped at 800", (t) => {
  const logs = captureConsole(t);
  const req = { method: "GET", originalUrl: "/api/x?y=1", get: (name) => ({ "x-real-ip": "203.0.113.5" })[name.toLowerCase()] };
  errorMiddleware(new HttpError(404, "THREAD_NOT_FOUND", "Thread not found"), req, fakeRes(), () => {});
  assert.deepEqual(logs.warn, ["[404] THREAD_NOT_FOUND: Thread not found (GET /api/x?y=1 from 203.0.113.5)"]);
  errorMiddleware(new HttpError(502, "DJANGO_UNREACHABLE", "Backend unreachable", { path: "/p", cause: "x".repeat(2_000) }),
                  req, fakeRes(), () => {});
  assert.equal(logs.error.length, 1);
  assert.ok(logs.error[0].startsWith("[502] DJANGO_UNREACHABLE: Backend unreachable (GET /api/x?y=1 from 203.0.113.5) {\"path\":\"/p\""));
  assert.ok(logs.error[0].length < 1_000, "details are capped");
  errorMiddleware(new Error("the real cause"), req, fakeRes(), () => {});
  assert.match(logs.error[1], /INTERNAL_ERROR.*Error: the real cause/s, "the stack goes to the log");
});


test("details never reach the wire, and only a 429 exposes its wait", (t) => {
  captureConsole(t);
  const res = fakeRes();
  errorMiddleware(new HttpError(409, "ALREADY_RUNNING", "Busy", { retryAfterS: 30, cause: "internal detail" }), fakeReq("t"), res, () => {});
  assert.deepEqual(res.body, { message: "Busy", error: { code: "ALREADY_RUNNING", message: "Busy" } });
  assert.deepEqual(res.headers, {}, "no Retry-After outside a 429");

  const bare = fakeRes();
  errorMiddleware(new HttpError(429, "RATE_LIMITED", "Wait"), fakeReq("t"), bare, () => {});
  assert.deepEqual(bare.body, { message: "Wait", error: { code: "RATE_LIMITED", message: "Wait" } });
  assert.equal(bare.headers["Retry-After"], undefined, "no wait known → no header, no field");

  const junk = fakeRes();
  errorMiddleware(new HttpError(429, "RATE_LIMITED", "Wait", { retryAfterS: "soon" }), fakeReq("t"), junk, () => {});
  assert.equal(junk.headers["Retry-After"], undefined, "a non-numeric wait is dropped");
});


test("a failure after the headers went out only ends the response — no second envelope", (t) => {
  const logs = captureConsole(t);
  const res = { ...fakeRes(), headersSent: true };
  res.end = () => { res.ended = true; };
  errorMiddleware(new Error("mid-stream"), fakeReq("t"), res, () => {});
  assert.equal(res.ended, true);
  assert.equal(res.statusCode, null);
  assert.equal(res.body, null);
  assert.equal(logs.error.length, 1, "still logged");
});


test("through Express: malformed JSON 400, an oversized body 413, a foreign charset 415 — all envelopes", async (t) => {
  captureConsole(t);
  const base = await bareApp(t, (app) => app.post("/echo", (req, res) => res.json({ got: req.body })));
  const post = (body, contentType = "application/json") => fetch(`${base}/echo`, {
    method: "POST", headers: { "Content-Type": contentType }, body,
  });
  const cases = [
    ["{not json", "application/json", 400, "INVALID_JSON"],
    ['"a bare string"', "application/json", 400, "INVALID_JSON"],
    [JSON.stringify({ text: "x".repeat(2_000) }), "application/json", 413, "PAYLOAD_TOO_LARGE"],
    ["{}", "application/json; charset=latin1", 415, "UNSUPPORTED_ENCODING"],
  ];
  for (const [body, contentType, status, code] of cases) {
    const response = await post(body, contentType);
    assert.equal(response.status, status, code);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    const envelope = await response.json();
    assert.equal(envelope.error.code, code);
    assert.equal(envelope.message, envelope.error.message);
  }
  assert.deepEqual(await (await post('{"ok":true}')).json(), { got: { ok: true } }, "a good body passes");
});


test("through Express: an unknown error — sync, async, a string, a bare rejection — is a bare 500 envelope, no internals", async (t) => {
  const logs = captureConsole(t);
  const base = await bareApp(t, (app) => {
    app.get("/sync", () => { throw new Error("SELECT secret FROM /app/services/x.js"); });
    app.get("/async", async () => { throw new TypeError("Cannot read properties of null (reading 'token')"); });
    app.get("/string", () => { throw "raw string thrown"; });
    app.get("/undefined", async () => { throw undefined; });
  });
  for (const path of ["/sync", "/async", "/string", "/undefined"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 500, path);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), {
      message: "Internal assistant error", error: { code: "INTERNAL_ERROR", message: "Internal assistant error" },
    }, path);
    for (const leak of ["secret", "/app/", "token", "raw string", "at ", "stack"]) assert.ok(!text.includes(leak), `${path} leaked ${leak}`);
  }
  assert.ok(logs.error.some((line) => line.includes("raw string thrown")), "the thrown string reached the log");
  assert.ok(logs.error.some((line) => line.includes("SELECT secret")), "the real message reached the log");
});


test("through Express: a path parameter whose %-escape does not decode is a 400, not a 500 (FIXED 2026-09)", async (t) => {
  const logs = captureConsole(t);
  const base = await bareApp(t, (app) => app.get("/threads/:id", (req, res) => res.json({ id: req.params.id })));
  const response = await fetch(`${base}/threads/%E0%A4%A`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "Malformed request path", error: { code: "BAD_REQUEST", message: "Malformed request path" },
  });
  assert.equal(logs.error.length, 0, "a client's mistake is not logged as a server error");
  assert.deepEqual(await (await fetch(`${base}/threads/a%20b`)).json(), { id: "a b" }, "a good escape decodes");
  assert.equal(normalizeError(new URIError("URI malformed")).status, 500, "our own URIError (no router status) stays a 500");
});


test("through Express: a failure after the headers were sent cuts the response instead of appending JSON", async (t) => {
  captureConsole(t);
  const base = await bareApp(t, (app) => app.get("/stream", (_req, res, next) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: first\n\n");
    setTimeout(() => next(new Error("mid-stream failure")), 20);
  }));
  const text = await (await fetch(`${base}/stream`)).text();
  assert.equal(text, "data: first\n\n", "the stream ends; no envelope is glued onto it");
});


test("the assistant's app: an unknown route is the JSON 404 envelope, never Express's HTML page (FIXED 2026-09)", async (t) => {
  captureConsole(t);
  const { createApp } = await import("../app.js");
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const path of ["/nope", "/api/assistant", "/api/assistant/chat/x/y/z", "/internals"]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get("content-type"), /^application\/json/, path);
    assert.deepEqual(await response.json(), { message: "Not found", error: { code: "NOT_FOUND", message: "Not found" } });
  }
});


test("classifyProviderError: 402 and the worded budget answers are budget; a rate limit or an outage is not", () => {
  const cases = [
    [providerError(402, "Payment Required"), 402, true],
    [providerError(429, "You exceeded your current quota, please check your plan and billing details"), 429, true],
    [providerError(429, "Rate limit reached for requests"), 429, false],
    // Azure names a quota only in its link: a pause, retried (ASSISTANT-LLM-26)
    [providerError(429, "Your requests to text-embedding-3-small for text-embedding-3-small in Sweden Central have exceeded the call rate limit for your current OpenAI S0 pricing tier. Please retry after 22 seconds. To increase your default rate limit, visit: https://aka.ms/oai/quotaincrease."), 429, false],
    [providerError(undefined, "Your requests to text-embedding-3-small for text-embedding-3-small in Sweden Central have exceeded the call rate limit for your current OpenAI S0 pricing tier. Please retry after 22 seconds. To increase your default rate limit, visit: https://aka.ms/oai/quotaincrease."), null, false],
    [providerError(403, "Budget exceeded: Team budget exceeded: 10.18 >= 10.00 dollars"), 403, true],
    [providerError(403, "Forbidden: bad key"), 403, false],
    [providerError(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing."), 400, true],
    [providerError(400, "max_tokens: 200000 > 128000, which is the maximum allowed"), 400, false],
    [providerError(500, "quota service exceeded its deadline"), 500, false],
    [providerError(503, "Service Unavailable"), 503, false],
    [providerError(undefined, "Insufficient funds: billing account exhausted"), null, true],
    [providerError(429, "Too many requests", '{"error":{"code":"insufficient_quota","message":"quota exceeded"}}'), 429, true],
    [new Error("socket hang up"), null, false],
    [null, null, false],
  ];
  for (const [err, statusCode, budget] of cases) {
    assert.deepEqual(classifyProviderError(err), { statusCode, budget }, err?.message ?? String(err));
  }
});


test("classifyProviderError reads through a RetryError's last error and an error's cause", () => {
  const retry = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded",
                                 errors: [providerError(500, "x"), providerError(402, "Budget exceeded")] });
  assert.deepEqual(classifyProviderError(retry), { statusCode: 402, budget: true });
  const wrapped = Object.assign(new Error("stream failed"), { cause: providerError(429, "You exceeded your current quota") });
  assert.deepEqual(classifyProviderError(wrapped), { statusCode: 429, budget: true });
  assert.deepEqual(classifyProviderError(Object.assign(new Error("x"), { statusCode: "402" })), { statusCode: 402, budget: true });
});


test("formatStreamError is one capped log line: name and message, never the whole SDK object", () => {
  assert.equal(formatStreamError(providerError(503, "Service Unavailable")), "AI_APICallError: Service Unavailable");
  assert.equal(formatStreamError("a bare string"), "Error: a bare string");
  assert.equal(formatStreamError(null), "Error: null");
  assert.equal(formatStreamError({ name: "TurnTimeoutError", message: "slow" }), "TurnTimeoutError: slow");
  assert.equal(formatStreamError(new Error("m".repeat(1_000))).length, 300);
});


test("a request aborted mid-body never produces an answer or a crash", async (t) => {
  const logs = captureConsole(t);
  const base = await bareApp(t, (app) => app.post("/echo", (req, res) => res.json({ got: req.body })));
  const { port } = new URL(base);
  await new Promise((resolve) => {
    const socket = net.connect(Number(port), "127.0.0.1", () => {
      socket.write("POST /echo HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n{\"a\":");
      setTimeout(() => { socket.destroy(); resolve(); }, 50);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await fetch(`${base}/echo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 200,
               "the app still serves");
  assert.ok(logs.error.every((line) => !line.includes("INTERNAL_ERROR")), "an aborted body is not a server error");
});

