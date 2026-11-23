// -----------------------------------------------------------
//  [*] Tests — the Express application (app.js)
//
//  The real createApp() on a random port, with the Django stub
//  behind it. ROUTES is the whole route table; around it, the
//  tail answers a wrong method or an unknown path with the
//  JSON envelope, and the /internal gate stands before both.
//  Also the body limits, routing details and /health.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "./env.mjs";
import { startStubDjango } from "./stubDjango.mjs";


// A thread id the thread routes accept
const THREAD = "0b6f8e8c-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

// Every route the app serves and one request it answers on its
// own terms: method, path, secret or not, body, status, code
const ROUTES = [
  ["POST", "/api/assistant/chat", false, {}, 401, "AUTH_REQUIRED"],
  ["POST", `/api/assistant/chat/${THREAD}/stop`, false, {}, 200, null],
  ["GET", `/api/assistant/chat/${THREAD}/status`, false, undefined, 200, null],
  ["POST", "/internal/llm/generate", true, {}, 400, "INVALID_PROMPT"],
  ["POST", "/internal/llm/embed", true, {}, 400, "INVALID_TEXTS"],
  ["GET", "/internal/llm/models", true, undefined, 200, null],
  ["POST", "/internal/mcp/list-tools", true, { url: "ftp://x" }, 400, "INVALID_URL"],
  ["GET", "/health", false, undefined, 200, null],
];

// Every method a client could try
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// The stub and the app on its random port, set up by before()
let stub;
let server;
let base;
let app;







// -----------------------------------------------------------
// call
// -----------------------------------------------------------
//
// One request to the app, with the internal secret and a
// bearer when asked for; a body that is not a string goes as
// JSON. Returns the status, headers, raw text and the parsed
// JSON, or null when the answer is not JSON.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function call(method, path, { secret = false, bearer = false, body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Internal-Secret": "s3cret" } : {}),
      ...(bearer ? { Authorization: "Bearer tok" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, headers: response.headers, text, json };
}







// -----------------------------------------------------------
// jsonBodyOf
// -----------------------------------------------------------
//
// The text of a JSON object exactly `bytes` long, so a body can
// land on a limit or one byte past it.
//
// Used by:
//   - the JSON-only and body limit tests (below)
// -----------------------------------------------------------

function jsonBodyOf(bytes) {
  return `{"p":"${"x".repeat(bytes - 8)}"}`;
}


before(async () => {
  stub = await startStubDjango({
    "GET /api/auth/me": () => ({ json: { id: "u1", displayName: "Tomas", role: "user" } }),
  });
  process.env.DJANGO_URL = stub.url;
  const { createApp } = await import("../app.js");
  app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await stub.close();
});


test("every route of the table answers its own JSON", async (t) => {
  t.mock.method(console, "warn", () => {});
  for (const [method, path, secret, body, status, code] of ROUTES) {
    const answer = await call(method, path, { secret, bearer: path.includes(THREAD), body });
    assert.equal(answer.status, status, `${method} ${path}: ${answer.text}`);
    assert.match(answer.headers.get("content-type"), /^application\/json/, `${method} ${path}`);
    assert.ok(answer.json, `${method} ${path} answered JSON`);
    if (code) assert.equal(answer.json.error.code, code, `${method} ${path}`);
  }
  assert.deepEqual((await call("GET", `/api/assistant/chat/${THREAD}/status`, { bearer: true })).json, { running: false, startedAt: null });
  assert.deepEqual((await call("POST", `/api/assistant/chat/${THREAD}/stop`, { bearer: true, body: {} })).json, { stopped: false });
});


test("a wrong method on any route's path is 405 with the exact Allow list; the envelope is JSON (FIXED 2026-09)", async (t) => {
  t.mock.method(console, "warn", () => {});
  const allowed = new Map();
  for (const [method, path, secret] of ROUTES) {
    const entry = allowed.get(path) ?? { secret, methods: new Set() };
    entry.methods.add(method);
    if (method === "GET") entry.methods.add("HEAD");
    allowed.set(path, entry);
  }
  for (const [path, { secret, methods }] of allowed) {
    for (const method of METHODS.filter((m) => !methods.has(m))) {
      const answer = await call(method, path, { secret, bearer: true, body: method === "GET" ? undefined : {} });
      assert.equal(answer.status, 405, `${method} ${path}`);
      assert.equal(answer.headers.get("allow"), [...methods].sort().join(", "), `${method} ${path}`);
      assert.deepEqual(answer.json, { message: "Method not allowed", error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
    }
  }
});


test("an unknown path is the JSON 404 envelope, whatever the method (FIXED 2026-09)", async (t) => {
  t.mock.method(console, "warn", () => {});
  const paths = ["/", "/nope", "/api", "/api/assistant", "/api/assistant/chat/x/y", "/api/assistant/chats", "/healthz", "/internals"];
  for (const path of paths) {
    for (const method of METHODS) {
      const answer = await call(method, path, { body: method === "GET" ? undefined : {} });
      assert.equal(answer.status, 404, `${method} ${path}`);
      assert.deepEqual(answer.json, { message: "Not found", error: { code: "NOT_FOUND", message: "Not found" } }, `${method} ${path}`);
      assert.equal(answer.headers.get("allow"), null);
    }
  }
});


test("the /internal gate stands before the tail: no secret, no 404 or 405 — just 403", async (t) => {
  t.mock.method(console, "warn", () => {});
  const shut = [["GET", "/internal/llm/nope"], ["DELETE", "/internal/llm/generate"], ["GET", "/internal/mcp/x"], ["GET", "/internal"],
                ["POST", "/internal/other"]];
  for (const [method, path] of shut) {
    assert.equal((await call(method, path)).json.error.code, "INTERNAL_ONLY", `${method} ${path}`);
  }
  const unknown = await call("GET", "/internal/llm/nope", { secret: true });
  assert.equal(unknown.status, 404, "with the secret, the tail answers");
  const wrong = await call("GET", "/internal/llm/generate", { secret: true });
  assert.deepEqual([wrong.status, wrong.headers.get("allow")], [405, "POST"]);
});


test("no answer carries X-Powered-By, and every one but the stream and OPTIONS is JSON", async (t) => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  const answers = [
    await call("GET", "/health"),
    await call("GET", "/nope"),
    await call("DELETE", "/health"),
    await call("POST", "/api/assistant/chat", { body: "{not json" }),
    await call("POST", "/api/assistant/chat", { body: jsonBodyOf(600_000) }),
    await call("GET", "/internal/llm/models"),
    await call("GET", "/api/assistant/chat/%E0%A4%A/status", { bearer: true }),
  ];
  for (const answer of answers) {
    assert.equal(answer.headers.get("x-powered-by"), null, `${answer.status}`);
    assert.match(answer.headers.get("content-type"), /^application\/json; charset=utf-8$/, `${answer.status}`);
  }
  assert.equal(app.get("x-powered-by"), false);
});


test("OPTIONS answers the router's own Allow list (text/plain) — the documented exception to JSON-only", async (t) => {
  t.mock.method(console, "warn", () => {});
  const chat = await call("OPTIONS", "/api/assistant/chat");
  assert.deepEqual([chat.status, chat.headers.get("allow"), chat.headers.get("content-type"), chat.text], [200, "POST", "text/plain", "POST"]);
  assert.equal(chat.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await call("OPTIONS", "/nope")).json.error.code, "NOT_FOUND");
  assert.equal((await call("OPTIONS", "/internal/llm/generate")).json.error.code, "INTERNAL_ONLY", "the gate first");
});


test("the public body limit is 512 kB exactly; the internal door takes 16 MB; the parsers are JSON-only", async (t) => {
  t.mock.method(console, "warn", () => {});
  const limit = 512 * 1024;
  const fits = await call("POST", "/api/assistant/chat", { body: jsonBodyOf(limit) });
  assert.equal(fits.json.error.code, "AUTH_REQUIRED", "a body of exactly 512 kB passes the parser");
  const over = await call("POST", "/api/assistant/chat", { body: jsonBodyOf(limit + 1) });
  assert.equal(over.status, 413);
  assert.deepEqual(over.json, { message: "Request body too large", error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } });

  const internalBig = await call("POST", "/internal/llm/embed", { secret: true, body: jsonBodyOf(8 * 1024 * 1024) });
  assert.equal(internalBig.json.error.code, "INVALID_TEXTS", "8 MB passes the internal parser");
  const internalOver = await call("POST", "/internal/llm/embed", { secret: true, body: jsonBodyOf(16 * 1024 * 1024 + 1) });
  assert.equal(internalOver.status, 413);

  const text = await call("POST", "/internal/llm/generate", { secret: true, body: "prompt=x", headers: { "Content-Type": "text/plain" } });
  assert.equal(text.json.error.code, "INVALID_PROMPT", "a non-JSON content type is not parsed at all");
});


test("routing: case-insensitive, a trailing slash tolerated, HEAD served by GET routes, a broken %-escape a 400", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal((await call("GET", "/HEALTH")).status, 200);
  assert.equal((await call("GET", "/health/")).status, 200);
  const head = await fetch(`${base}/health`, { method: "HEAD" });
  assert.deepEqual([head.status, await head.text()], [200, ""]);
  const headPost = await fetch(`${base}/api/assistant/chat`, { method: "HEAD" });
  assert.deepEqual([headPost.status, headPost.headers.get("allow")], [405, "POST"]);
  const broken = await call("GET", "/api/assistant/chat/%E0%A4%A/status", { bearer: true });
  assert.deepEqual([broken.status, broken.json.error.code], [400, "BAD_REQUEST"], "not a 500 (FIXED 2026-09)");
});


test("trust proxy is off for every address and hop (tests/clientIp.test.mjs drives the headers)", () => {
  assert.equal(app.get("trust proxy"), false);
  assert.equal(app.get("trust proxy fn")("127.0.0.1", 0), false);
});


test("/health: liveness, configuration and the live turn count, with no secret and no bearer", async () => {
  const { startRun } = await import("../services/runs.js");
  assert.deepEqual((await call("GET", "/health")).json, { status: "ok", model: "configured", providers: ["gateway"], activeTurns: 0 });
  const run = startRun(THREAD, "u1");
  try {
    assert.equal((await call("GET", "/health")).json.activeTurns, 1);
    const status = await call("GET", `/api/assistant/chat/${THREAD}/status`, { bearer: true });
    assert.deepEqual(status.json, { running: true, startedAt: run.startedAt });
    assert.equal(status.headers.get("cache-control"), "no-store");
  } finally {
    run.finish();
  }
  assert.equal((await call("GET", "/health")).json.activeTurns, 0);
});
