// -----------------------------------------------------------
//  [*] Tests — the embed ceiling (EMBED_TIMEOUT_MS)
//
//  Its own process: EMBED_TIMEOUT_MS is 500 and AI_GATEWAY_URL
//  points at the fake gateway before config.js loads, so
//  /internal/llm/embed runs the real gateway provider against
//  a gateway that can hang. A hung batch must end at the
//  ceiling rather than outlive the worker's wait and pile up
//  behind its retries.
//
//  Defects guarded here:
//
//    ASSISTANT-CORE-4 — the embed call had no ceiling
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "./env.mjs";
import { startFakeGateway } from "./helpers/fakeGateway.mjs";


// The ceiling this file runs with
const EMBED_TIMEOUT_MS = 500;

// The fake gateway and the app, set up by before()
let gateway;
let server;
let base;







// -----------------------------------------------------------
// embed
// -----------------------------------------------------------
//
// Posts a batch to /internal/llm/embed with the secret and
// returns the status, the parsed body and how long the answer
// took.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function embed(texts) {
  const started = Date.now();
  const response = await fetch(`${base}/internal/llm/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": "s3cret" },
    body: JSON.stringify({ texts }),
  });
  return { status: response.status, body: await response.json(), elapsed: Date.now() - started };
}


before(async () => {
  gateway = await startFakeGateway();
  process.env.AI_GATEWAY_URL = gateway.url;
  process.env.EMBED_TIMEOUT_MS = String(EMBED_TIMEOUT_MS);
  const config = await import("../config.js");
  assert.equal(config.EMBED_TIMEOUT_MS, EMBED_TIMEOUT_MS);
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await gateway.close();
});


test("a healthy batch goes through the real gateway provider and answers in time", async () => {
  gateway.requests.length = 0;
  const answer = await embed(["Pirmas tekstas", "Antras"]);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.deepEqual(answer.body.embeddings, [[14, 1, 0], [6, 1, 0]]);
  assert.equal(answer.body.model, "gateway:azure/text-embedding-3-large");
  const [request] = gateway.requests;
  assert.deepEqual([request.method, request.path, request.headers["x-bf-vk"]], ["POST", "/v1/embeddings", "test-key"]);
});


test("a slow gateway within the ceiling still answers", async () => {
  gateway.script.push(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { json: { object: "list", data: [{ object: "embedding", index: 0, embedding: [0.5, 0.5] }],
                     usage: { prompt_tokens: 1, total_tokens: 1 } } };
  });
  const answer = await embed(["lėtas"]);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.embeddings, [[0.5, 0.5]]);
});


test("a gateway that never answers is cut at EMBED_TIMEOUT_MS: 502 EMBEDDING_FAILED, the call aborted, not retried", {
  timeout: 10_000,
}, async (t) => {
  t.mock.method(console, "error", () => {});
  gateway.requests.length = 0;
  gateway.script.push({ hang: true });
  const answer = await embed(["kabo"]);
  assert.deepEqual([answer.status, answer.body.error.code], [502, "EMBEDDING_FAILED"], "502: the worker retries it");
  assert.match(answer.body.message, /^Embedding call failed: .*timeout/i, "the message names the timeout");
  assert.equal(answer.body.message, answer.body.error.message, "the worker reads the top-level message");
  assert.ok(answer.elapsed >= EMBED_TIMEOUT_MS && answer.elapsed < EMBED_TIMEOUT_MS + 1_500, `${answer.elapsed} ms`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(gateway.requests.length, 1, "an abort is not retried");
  assert.equal(gateway.requests[0].hungUp, true, "the provider's request was aborted, not left running");
});
