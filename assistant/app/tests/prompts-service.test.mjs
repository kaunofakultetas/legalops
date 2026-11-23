// -----------------------------------------------------------
//  [*] Tests — the active prompt (services/prompts.js)
//
//  activePrompt against the stub's /internal/assistant/prompt,
//  answered as Django's active_prompt view answers, with
//  Date.now driven by hand through the minute's cache and the
//  5 s retry. Only real answers are cached: a failure on a cold
//  cache is a 503 the next turn retries, never "no active
//  prompt" for a minute.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { startRawServer } from "./helpers/rawServer.mjs";
import { startStubDjango } from "./stubDjango.mjs";
import { activePrompt, resetPromptCacheForTests } from "../services/prompts.js";


// A thread the chat tests post into
const THREAD = "0b6f8e8c-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

// The active version Django answers by default (beforeEach
// restores it)
const VERSION = {
  id: "pv4", promptSlug: "chat.assistant", version: 4, model: "gateway:azure/gpt-5.5", temperature: 0.2, maxTokens: 900,
  note: "n", source: "user", createdBy: "u9", createdAt: "2026-09-27T10:00:00+00:00", text: "Tu esi asistentas.",
};

// How the stub answers the prompt route right now, and the
// version it serves in mode "ok"
let mode = "ok";
let version = VERSION;

// The stub, the raw double and the app; the clock Date.now
// reads, an hour on per test
let stub;
let raw;
let server;
let base;
let clock = 1_800_000_000_000;







// -----------------------------------------------------------
// promptCalls
// -----------------------------------------------------------
//
// The prompt fetches the stub has seen.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function promptCalls() {
  return stub.requests.filter((r) => r.path === "/internal/assistant/prompt");
}







// -----------------------------------------------------------
// chatTurn
// -----------------------------------------------------------
//
// Posts a valid chat turn as user u1 and returns the status and
// the parsed body.
//
// Used by:
//   - the chat route test (below)
// -----------------------------------------------------------

async function chatTurn() {
  const response = await fetch(`${base}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({
      id: THREAD, trigger: "submit-message", parentId: null, locale: "lt",
      message: { id: `u-${Math.random().toString(36).slice(2, 8)}`, role: "user", parts: [{ type: "text", text: "Labas" }] },
    }),
  });
  return { status: response.status, body: await response.json() };
}


before(async () => {
  stub = await startStubDjango({
    "GET /internal/assistant/prompt": () => ({
      ok: { json: version },
      missing: { status: 404, json: { error: "No active prompt", code: "PROMPT_NOT_CONFIGURED" } },
      refused: { status: 403, json: { error: "Forbidden", code: "INTERNAL_ONLY" } },
      broken: { status: 500, json: { error: "Server error", code: "SERVER_ERROR" } },
    })[mode],
    "GET /api/auth/me": () => ({ json: { id: "u1", displayName: "Tomas", role: "user" } }),
    "GET /internal/assistant/budget": () => ({ json: { remaining: 100 } }),
  });
  raw = await startRawServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html>hiccup</html>"); });
  process.env.DJANGO_URL = stub.url;
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach((t) => {
  process.env.DJANGO_URL = stub.url;
  mode = "ok";
  version = VERSION;
  stub.requests.length = 0;
  resetPromptCacheForTests();
  clock += 3_600_000;
  t.mock.method(Date, "now", () => clock);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await stub.close();
  await raw.close();
});


test("the active prompt: fetched through the internal door, the slug encoded, the fields typed", async () => {
  assert.deepEqual(await activePrompt("chat.assistant"), {
    id: "pv4", version: 4, text: "Tu esi asistentas.", model: "gateway:azure/gpt-5.5", temperature: 0.2, maxTokens: 900,
  });
  const [call] = promptCalls();
  assert.deepEqual(call.query, { slug: "chat.assistant" });
  assert.equal(call.secret, "s3cret");
  assert.equal(call.auth, null, "no bearer on the internal door");

  await activePrompt("a slug/with ?&= signs");
  assert.deepEqual(promptCalls()[1].query, { slug: "a slug/with ?&= signs" }, "encoded, then decoded intact by Django");

  version = { id: "pv5", version: "5", text: 42 };
  resetPromptCacheForTests();
  assert.deepEqual(await activePrompt("chat.assistant"),
                   { id: "pv5", version: null, text: "", model: null, temperature: null, maxTokens: null }, "types are enforced");
});


test("a real answer is reused for a minute: an activation reaches live turns within 60 s", async () => {
  const start = clock;
  assert.equal((await activePrompt("chat.assistant")).version, 4);
  version = { ...VERSION, id: "pv5", version: 5, text: "Nauja versija." };
  clock = start + 59_999;
  assert.equal((await activePrompt("chat.assistant")).version, 4, "still the cached version");
  assert.equal(promptCalls().length, 1);
  clock = start + 60_000;
  assert.equal((await activePrompt("chat.assistant")).version, 5, "the activation arrived");
  assert.equal(promptCalls().length, 2);
});


test("slugs are cached apart", async () => {
  await activePrompt("chat.assistant");
  await activePrompt("report.summary");
  await activePrompt("chat.assistant");
  await activePrompt("report.summary");
  assert.deepEqual(promptCalls().map((c) => c.query.slug), ["chat.assistant", "report.summary"]);
});


test("404 is a real answer — the empty prompt, cached for the minute like any other", async () => {
  mode = "missing";
  const start = clock;
  const empty = await activePrompt("chat.assistant");
  assert.deepEqual(empty, { id: null, version: null, text: "", model: null, temperature: null, maxTokens: null });
  mode = "ok";
  clock = start + 30_000;
  assert.equal((await activePrompt("chat.assistant")).text, "", "the empty answer is cached");
  assert.equal(promptCalls().length, 1);
  clock = start + 60_000;
  assert.equal((await activePrompt("chat.assistant")).version, 4, "a version activated since is picked up");
});


test("a failure with an answer in hand serves that answer, logs it, and retries after 5 s", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args.join(" ")));
  const start = clock;
  await activePrompt("chat.assistant");
  mode = "broken";
  clock = start + 60_000;
  assert.equal((await activePrompt("chat.assistant")).version, 4, "the previous version is served");
  assert.equal(promptCalls().length, 2);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Prompt fetch failed for chat\.assistant \(serving the previous version\): Server error$/);

  clock = start + 64_999;
  await activePrompt("chat.assistant");
  assert.equal(promptCalls().length, 2, "not re-asked within 5 s");
  mode = "ok";
  version = { ...VERSION, version: 6 };
  clock = start + 65_000;
  assert.equal((await activePrompt("chat.assistant")).version, 6, "re-asked after 5 s, and recovered");
  assert.ok(errors.every((line) => !line.includes("s3cret")));
});


test("a failure on a cold cache is 503 PROMPT_UNAVAILABLE and caches nothing — whatever the failure", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args.join(" ")));
  const failures = [
    ["refused", () => { mode = "refused"; }],
    ["broken", () => { mode = "broken"; }],
    ["down", () => { process.env.DJANGO_URL = "http://127.0.0.1:9"; }],
    ["unreadable", () => { process.env.DJANGO_URL = raw.url; }],
  ];
  for (const [name, breakIt] of failures) {
    resetPromptCacheForTests();
    breakIt();
    await assert.rejects(() => activePrompt("chat.assistant"), (err) => {
      assert.deepEqual([err.status, err.code, err.message],
                       [503, "PROMPT_UNAVAILABLE", "The assistant's instructions could not be loaded — try again shortly"], name);
      return true;
    });
    mode = "ok";
    process.env.DJANGO_URL = stub.url;
    assert.equal((await activePrompt("chat.assistant")).version, 4, `${name}: nothing was cached, the next call asks again`);
  }
  assert.ok(errors.every((line) => line.startsWith("Prompt fetch failed for chat.assistant (nothing cached):")));
});


test("an unreadable OK answer is a failure, never 'no active prompt' for a minute (FIXED 2026-09)", async (t) => {
  t.mock.method(console, "error", () => {});
  await activePrompt("chat.assistant");
  clock += 60_000;
  process.env.DJANGO_URL = raw.url;
  assert.equal((await activePrompt("chat.assistant")).version, 4, "the previous version, not an empty prompt");
});


test("the chat route: no active version (404) or an empty text is 503 PROMPT_NOT_CONFIGURED; a cold failure 503 PROMPT_UNAVAILABLE", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  mode = "missing";
  const missing = await chatTurn();
  assert.equal(missing.status, 503);
  assert.deepEqual(missing.body.error, {
    code: "PROMPT_NOT_CONFIGURED", message: "No active system prompt — activate one in the prompts page",
  });

  resetPromptCacheForTests();
  mode = "ok";
  version = { ...VERSION, text: "" };
  assert.equal((await chatTurn()).body.error.code, "PROMPT_NOT_CONFIGURED", "an active version with no text");

  resetPromptCacheForTests();
  mode = "broken";
  const cold = await chatTurn();
  assert.equal(cold.status, 503);
  assert.equal(cold.body.error.code, "PROMPT_UNAVAILABLE");
  assert.equal(stub.requests.filter((r) => r.path.startsWith("/api/chat/")).length, 0, "nothing past the prompt ran");
});
