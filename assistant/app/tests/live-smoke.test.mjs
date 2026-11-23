// -----------------------------------------------------------
//  [*] Tests — live smoke (opt-in: RUN_LIVE=1)
//
//  Checks the running assistant (LIVE_URL, or port 3000 on
//  loopback) at no cost: /health, the 404 and 405 envelopes,
//  the chat's refusal of a missing and of a made-up bearer
//  (the second proves Django answers the assistant), the
//  internal door's refusals, the gateway's model list holding
//  the configured models, and no answer carrying the key or
//  the secret. No chat turn is started — a turn spends the AI
//  budget. The model list is cached, a failure keeping the
//  last good one, so a pass proves only that the gateway
//  answered at some point since the process started — right
//  after a deploy, that means now.
//
//  Skipped unless RUN_LIVE=1, so runTests.sh never runs it;
//  tests/README.md has the commands for both modes.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";


// Where the running assistant listens (inside its container,
// or a container sharing its network)
const BASE = (process.env.LIVE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

// The live layer is opt-in; any non-empty RUN_LIVE runs it
const SKIP = process.env.RUN_LIVE ? false : "live smoke is opt-in: set RUN_LIVE=1";

// The service's own secret and key — present inside its
// container; compared against, never printed
const SECRET = process.env.ASSISTANT_INTERNAL_SECRET || "";
const GATEWAY_KEY = process.env.AI_GATEWAY_KEY || "";

// Every answer body seen, for the leak check at the end
const BODIES = [];







// -----------------------------------------------------------
// call
// -----------------------------------------------------------
//
// One request to the running assistant, answering its status,
// headers and parsed JSON (null when the body is not JSON).
// Every body is kept for the leak check, and a 20-second
// bound fails the test on a hung service instead of waiting.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function call(method, path, { headers = {}, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  BODIES.push(text);
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, json };
}







test("/health answers ok and names a configured model", { skip: SKIP }, async () => {
  const { status, json } = await call("GET", "/health");
  assert.equal(status, 200);
  assert.equal(json?.status, "ok");
  assert.equal(json.model, "configured", "the service has no model key (\"missing-key\")");
  assert.ok(Array.isArray(json.providers) && json.providers.length > 0, "at least one provider is configured");
  assert.ok(Number.isInteger(json.activeTurns) && json.activeTurns >= 0);
});


test("an unknown path is the JSON 404 envelope, a wrong method the 405 with its Allow list", { skip: SKIP }, async () => {
  const missing = await call("GET", "/live-smoke/no-such-path");
  assert.equal(missing.status, 404);
  assert.equal(missing.json?.error?.code, "NOT_FOUND");
  const wrong = await call("POST", "/health");
  assert.equal(wrong.status, 405);
  assert.equal(wrong.json?.error?.code, "METHOD_NOT_ALLOWED");
  assert.equal(wrong.headers.get("allow"), "GET, HEAD");
});


test("the chat refuses a request without a bearer before asking anybody", { skip: SKIP }, async () => {
  const { status, json } = await call("POST", "/api/assistant/chat", { body: {} });
  assert.equal(status, 401);
  assert.equal(json?.error?.code, "AUTH_REQUIRED");
});


test("a made-up bearer is SESSION_INVALID — Django answered the assistant's identity check", { skip: SKIP }, async () => {
  const { status, json } = await call("POST", "/api/assistant/chat", {
    headers: { Authorization: "Bearer live-smoke-not-a-session" }, body: {},
  });
  assert.notEqual(status, 502, "the assistant could not reach Django (DJANGO_URL, the isolated network)");
  assert.equal(status, 401);
  assert.equal(json?.error?.code, "SESSION_INVALID");
});


test("the internal door refuses a missing and a wrong secret", { skip: SKIP }, async () => {
  assert.equal((await call("GET", "/internal/llm/models")).status, 403);
  assert.equal((await call("GET", "/internal/llm/models", { headers: { "X-Internal-Secret": "live-smoke-wrong-secret" } })).status, 403);
});


test("with the service's own secret, the gateway's model list holds the configured models — no token spent", {
  skip: SKIP || (SECRET ? false : "ASSISTANT_INTERNAL_SECRET is not in this environment (run inside the assistant's container, or pass --env-file ../.env)"),
}, async () => {
  const { status, json } = await call("GET", "/internal/llm/models", { headers: { "X-Internal-Secret": SECRET } });
  assert.equal(status, 200);
  const ids = (json?.models ?? []).map((model) => model.id);
  assert.ok(ids.length > 0, "the gateway listed no models: its key or the way out (legalops-exit) is broken");
  for (const name of ["AI_CHAT_MODEL", "AI_EMBED_MODEL"]) {
    const configured = process.env[name];
    if (!configured) continue;
    const id = configured.includes(":") ? configured : `gateway:${configured}`;
    if (id.startsWith("gateway:")) assert.ok(ids.includes(id), `${name} (${id}) is not among the gateway's models`);
  }
});


test("no answer carries the gateway key or the internal secret", { skip: SKIP }, () => {
  assert.ok(BODIES.length >= 6, "the checks above ran");
  for (const [name, value] of [["the gateway key", GATEWAY_KEY], ["the internal secret", SECRET]]) {
    if (value) assert.ok(!BODIES.some((body) => body.includes(value)), `an answer carries ${name}`);
  }
});
