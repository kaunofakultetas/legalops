// -----------------------------------------------------------
//  [*] Tests — the process (server.js), spawned for real
//
//  server.js runs as a child process against the Django stub,
//  with helpers/serverPreload.mjs loaded first so every chat
//  turn streams a scripted model: the boot, and above all the
//  shutdown drain — live turns finish and are stored, nothing
//  new is admitted, and a turn that outlives SHUTDOWN_GRACE_MS
//  is stored as interrupted.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { freePort, spawnNode } from "./helpers/process.mjs";
import { startStubDjango } from "./stubDjango.mjs";


// The secrets the children run with — distinctive, so a leak
// into their output is unmistakable
const SECRET = "srv-internal-secret-4f2a";
const GATEWAY_KEY = "srv-gateway-key-9c1e";
const BEARER = "srv-bearer-token-77aa";

// Two threads — a new turn in the same thread supersedes the
// old one, so parallel turns need their own
const THREAD_A = "7d1c2f7e-0a4b-4c1e-9a55-3f6b1c2d3e4f";
const THREAD_B = "8e2d3a8f-1b5c-4d2f-8b66-4a7c2d3e4f5a";

// The preload that plants the scripted model
const PRELOAD = "./tests/helpers/serverPreload.mjs";

// The Django stub every child talks to, set up by before()
let stub;







// -----------------------------------------------------------
// startServer
// -----------------------------------------------------------
//
// Spawns server.js on a free port with the stub as Django, the
// test's own variables on top and the scripted model unless
// preload is off, and returns the child, its port and base URL
// once it logs that it listens. The child is SIGKILLed after
// the test whatever happens.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function startServer(t, env = {}, { preload = true } = {}) {
  const port = await freePort();
  const child = spawnNode([...(preload ? ["--import", PRELOAD] : []), "server.js"], {
    env: {
      PORT: String(port), DJANGO_URL: stub.url, ASSISTANT_INTERNAL_SECRET: SECRET,
      AI_GATEWAY_KEY: GATEWAY_KEY, AI_GATEWAY_URL: "http://127.0.0.1:9/v1", ...env,
    },
  });
  t.after(() => child.kill("SIGKILL"));
  await child.waitForOutput(new RegExp(`assistant listening on :${port}\\b`));
  return { child, port, base: `http://127.0.0.1:${port}` };
}







// -----------------------------------------------------------
// turnBody
// -----------------------------------------------------------
//
// The slim chat body the GUI sends, for one thread.
//
// Used by:
//   - startTurn, the boot test and the raw-socket tests (below)
// -----------------------------------------------------------

function turnBody(threadId) {
  return JSON.stringify({
    id: threadId, trigger: "submit-message", parentId: null, locale: "en",
    message: { id: `u-${Math.random().toString(36).slice(2, 8)}`, role: "user", parts: [{ type: "text", text: "Labas" }] },
  });
}







// -----------------------------------------------------------
// startTurn
// -----------------------------------------------------------
//
// Posts a chat turn and returns a reader over its SSE stream:
// until() reads on until a marker has arrived, rest() reads to
// the end and reports the text and whether the stream ended
// cleanly or was cut.
//
// Used by:
//   - the drain and leak tests (below)
// -----------------------------------------------------------

async function startTurn(base, threadId) {
  const response = await fetch(`${base}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BEARER}` },
    body: turnBody(threadId),
  });
  assert.equal(response.status, 200, "the turn started");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  return {
    async until(marker) {
      while (!seen.includes(marker)) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`stream ended before ${marker}: ${seen}`);
        seen += decoder.decode(value, { stream: true });
      }
      return seen;
    },
    async rest() {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          seen += decoder.decode(value, { stream: true });
        }
        return { text: seen, error: null };
      } catch (err) {
        return { text: seen, error: err };
      }
    },
  };
}







// -----------------------------------------------------------
// answerText
// -----------------------------------------------------------
//
// The text a stored reply carries, its text parts joined.
//
// Used by:
//   - the drain tests (below)
// -----------------------------------------------------------

function answerText(reply) {
  return reply.body.content.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
}







// -----------------------------------------------------------
// connectRefused
// -----------------------------------------------------------
//
// Resolves true when a new TCP connection to the port is
// refused, false when it is accepted.
//
// Used by:
//   - the drain tests (below)
// -----------------------------------------------------------

function connectRefused(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}







// -----------------------------------------------------------
// replyFor
// -----------------------------------------------------------
//
// The stored reply of one thread as the stub recorded it,
// waited for up to `ms`.
//
// Used by:
//   - the drain and leak tests (below)
// -----------------------------------------------------------

function replyFor(threadId, ms = 10_000) {
  return stub.waitFor((r) => r.method === "POST" && r.path === `/internal/assistant/threads/${threadId}/messages`, ms);
}


before(async () => {
  stub = await startStubDjango({
    "GET /api/auth/me": (_b, req) => (req.headers.authorization === `Bearer ${BEARER}`
      ? { json: { id: "u1", displayName: "Tomas", role: "user" } }
      : { status: 401, json: { error: "Invalid session", code: "AUTH_REQUIRED" } }),
    "GET /internal/assistant/prompt": () => ({ json: { id: "pv1", version: 1, text: "Answer briefly.", model: null } }),
    "GET /internal/assistant/budget": () => ({ json: { remaining: 100 } }),
    "GET /internal/assistant/mcp-servers": () => ({ json: { servers: [] } }),
    "GET /api/chat/threads/[^/]+": (_b, _req, url) => ({ json: { id: url.pathname.split("/")[4], companyId: null, role: null } }),
    "POST /api/chat/threads/[^/]+/messages": () => ({ json: { ok: true, created: true } }),
    "POST /internal/assistant/threads/[^/]+/messages": () => ({ status: 201, json: { ok: true, created: true } }),
    "POST /internal/assistant/turn-log": () => ({ status: 201, json: { id: "log1" } }),
  });
});

beforeEach(() => {
  stub.requests.length = 0;
});

after(async () => {
  await stub.close();
});


test("startup: listens on PORT, logs the line, answers /health with the Keep-Alive timeout above Caddy's 55 s", async (t) => {
  const { child, base, port } = await startServer(t);
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", model: "configured", providers: ["gateway"], activeTurns: 0 });

  const keepAlive = await new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: "/health", agent: new http.Agent({ keepAlive: true }) }, (res) => {
      res.resume();
      resolve(res.headers["keep-alive"]);
    }).on("error", reject);
  });
  assert.equal(keepAlive, "timeout=65", "the upstream idle timeout outlives Caddy's 55 s pool");

  assert.doesNotMatch(child.output(), /has no credentials|is empty/, "a configured process boots without warnings");
  child.kill("SIGTERM");
  assert.equal((await child.exited).code, 0);
});


test("boot warns about the two half-configurations and still starts; the internal door stays shut", async (t) => {
  const { child, base } = await startServer(t, { AI_GATEWAY_KEY: "", ASSISTANT_INTERNAL_SECRET: "" }, { preload: false });
  await child.waitForOutput(/The default chat model's provider has no credentials — chat will answer 503/);
  await child.waitForOutput(/ASSISTANT_INTERNAL_SECRET is empty — every internal call will be refused/);
  assert.equal((await (await fetch(`${base}/health`)).json()).model, "missing-key");

  for (const secret of ["", SECRET, "anything"]) {
    const refused = await fetch(`${base}/internal/llm/models`, { headers: { "X-Internal-Secret": secret } });
    assert.equal(refused.status, 403, `secret ${JSON.stringify(secret)} with none configured`);
    assert.equal((await refused.json()).error.code, "INTERNAL_ONLY");
  }
  const chat = await fetch(`${base}/api/assistant/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${BEARER}` }, body: turnBody(THREAD_A),
  });
  assert.equal(chat.status, 503);
  assert.equal((await chat.json()).error.code, "NOT_CONFIGURED");
  child.kill("SIGTERM");
  assert.equal((await child.exited).code, 0);
});


test("SIGTERM: a live turn finishes and is persisted, the stream ends cleanly, new connections are refused, exit 0", async (t) => {
  const { child, base, port } = await startServer(t, { TEST_MODEL_CHUNKS: "6", TEST_MODEL_DELAY_MS: "150" });
  const turn = await startTurn(base, THREAD_A);
  await turn.until("text-delta");

  child.kill("SIGTERM");
  await child.waitForOutput(/SIGTERM received — draining \(1 live turns\)/);
  assert.equal(await connectRefused(port), true, "a new connection is refused at once");

  const { text, error } = await turn.rest();
  assert.equal(error, null, `the browser's stream ends cleanly, not cut (${error?.message})`);
  assert.match(text, /"type":"finish"/);
  assert.match(text, /data: \[DONE\]/, "the stream's own end marker arrived");
  const reply = await replyFor(THREAD_A);
  assert.equal(answerText(reply), "part-1 part-2 part-3 part-4 part-5 part-6 ", "the whole answer was persisted");
  assert.equal(reply.body.content.metadata, undefined, "a turn that finished in time is a normal reply");
  assert.equal((await child.exited).code, 0);
  assert.equal(child.output().match(/received — draining/g).length, 1);
});


test("SIGTERM past SHUTDOWN_GRACE_MS: the straggler is aborted, stored as interrupted, and the process exits 0", async (t) => {
  const { child, base } = await startServer(t, { TEST_MODEL_CHUNKS: "60", TEST_MODEL_DELAY_MS: "150", SHUTDOWN_GRACE_MS: "300" });
  const turn = await startTurn(base, THREAD_A);
  await turn.until("text-delta");

  const stoppedAt = Date.now();
  child.kill("SIGTERM");
  const { code } = await child.exited;
  assert.equal(code, 0);
  assert.ok(Date.now() - stoppedAt < 5_000, `the drain respected the grace (${Date.now() - stoppedAt} ms)`);

  const reply = await replyFor(THREAD_A, 2_000);
  assert.equal(reply.body.content.metadata.status, "interrupted");
  const text = answerText(reply);
  assert.ok(text.startsWith("part-1 ") && !text.includes("part-60"), `a partial answer: ${text}`);
  const log = await stub.waitFor((r) => r.path === "/internal/assistant/turn-log", 2_000);
  assert.equal(log.body.outcome, "interrupted");
  await turn.rest();
});


test("SIGINT drains like SIGTERM; a second signal during the drain is ignored", async (t) => {
  const idle = await startServer(t);
  idle.child.kill("SIGINT");
  await idle.child.waitForOutput(/SIGINT received — draining \(0 live turns\)/);
  assert.equal((await idle.child.exited).code, 0);

  const { child, base } = await startServer(t, { TEST_MODEL_CHUNKS: "5", TEST_MODEL_DELAY_MS: "150" });
  const turn = await startTurn(base, THREAD_B);
  await turn.until("text-delta");
  child.kill("SIGTERM");
  await child.waitForOutput(/SIGTERM received — draining/);
  child.kill("SIGTERM");
  child.kill("SIGINT");
  const { error } = await turn.rest();
  assert.equal(error, null);
  assert.equal(answerText(await replyFor(THREAD_B)), "part-1 part-2 part-3 part-4 part-5 ", "the second signal cut nothing");
  assert.equal((await child.exited).code, 0);
  assert.equal(child.output().match(/received — draining/g).length, 1, "the second signal started no second drain");
});


test("a connection kept alive across the stop signal is closed once its response ends, and serves nothing new", async (t) => {
  const { child, base, port } = await startServer(t, { TEST_MODEL_CHUNKS: "8", TEST_MODEL_DELAY_MS: "150" });

  // Turn A on a raw keep-alive socket, turn B on its own
  // connection (still running after A's end keeps the drain
  // going — the window a reused connection could slip into)
  const socket = net.connect(port, "127.0.0.1");
  let raw = "";
  let ended = false;
  socket.on("data", (chunk) => { raw += chunk; });
  socket.on("end", () => { ended = true; });
  socket.on("error", () => { ended = true; });
  await new Promise((resolve) => socket.once("connect", resolve));
  const body = turnBody(THREAD_A);
  socket.write(`POST /api/assistant/chat HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\nContent-Type: application/json\r\n`
    + `Authorization: Bearer ${BEARER}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  while (!raw.includes("text-delta")) await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const turnB = await startTurn(base, THREAD_B);
  await turnB.until("text-delta");

  child.kill("SIGTERM");
  await child.waitForOutput(/draining \(2 live turns\)/);
  while (!raw.includes("\r\n0\r\n\r\n") && !ended) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(raw, /data: \[DONE\]/, "turn A's response completed");
  const afterA = raw.length;
  if (!ended) {
    socket.write("GET /health HTTP/1.1\r\nHost: x\r\n\r\n");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const extra = raw.slice(afterA);
  assert.doesNotMatch(extra, /HTTP\/1\.1 200/, `nothing new was served on the old connection: ${JSON.stringify(extra)}`);
  assert.ok(ended || /HTTP\/1\.1 503/.test(extra), "the connection was closed, or the request refused");

  const { error } = await turnB.rest();
  assert.equal(error, null, "the other live turn still finished");
  assert.equal((await child.exited).code, 0);
  socket.destroy();
});


test("a request that reaches a draining process on an old connection is refused: 503 SHUTTING_DOWN, Connection: close", async (t) => {
  const { child, port } = await startServer(t, { TEST_MODEL_CHUNKS: "6", TEST_MODEL_DELAY_MS: "150" });
  const socket = net.connect(port, "127.0.0.1");
  let raw = "";
  let ended = false;
  socket.on("data", (chunk) => { raw += chunk; });
  socket.on("end", () => { ended = true; });
  await new Promise((resolve) => socket.once("connect", resolve));
  const body = turnBody(THREAD_A);
  socket.write(`POST /api/assistant/chat HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n`
    + `Authorization: Bearer ${BEARER}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  while (!raw.includes("text-delta")) await new Promise((resolve) => setTimeout(resolve, 20));

  child.kill("SIGTERM");
  await child.waitForOutput(/draining \(1 live turns\)/);
  // Pipelined behind the live stream: parsed now, answered
  // after it — by then the process is stopping
  socket.write("GET /health HTTP/1.1\r\nHost: x\r\n\r\n");
  while (!ended) await new Promise((resolve) => setTimeout(resolve, 20));

  const second = raw.slice(raw.indexOf("\r\n0\r\n\r\n") + 7);
  assert.match(raw, /data: \[DONE\]/, "the live stream completed first");
  assert.match(second, /^HTTP\/1\.1 503 /);
  assert.match(second, /\r\nConnection: close\r\n/i);
  assert.match(second, /\r\nRetry-After: 5\r\n/i);
  const envelope = JSON.parse(second.slice(second.indexOf("\r\n\r\n") + 4));
  assert.equal(envelope.error.code, "SHUTTING_DOWN");
  assert.equal(envelope.message, envelope.error.message);
  assert.equal((await child.exited).code, 0);
});


test("an unhandled rejection is logged and the process keeps serving", async (t) => {
  const { child, base } = await startServer(t, { TEST_UNHANDLED_REJECTION: "1" });
  await child.waitForOutput(/Unhandled rejection: Error: stray rejection from the preload/);
  assert.equal((await fetch(`${base}/health`)).status, 200, "still alive");
  child.kill("SIGTERM");
  assert.equal((await child.exited).code, 0);
});


test("a taken port fails the start loudly instead of hanging", async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, "0.0.0.0", resolve));
  const { port } = blocker.address();
  try {
    const child = spawnNode(["server.js"], {
      env: { PORT: String(port), DJANGO_URL: stub.url, ASSISTANT_INTERNAL_SECRET: SECRET, AI_GATEWAY_KEY: GATEWAY_KEY },
      timeoutMs: 15_000,
    });
    const { code, signal } = await child.exited;
    assert.equal(signal, null, "it exited on its own, not by the safety kill");
    assert.notEqual(code, 0);
    assert.match(child.output(), /EADDRINUSE/);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});


test("a whole turn plus a drain print nothing that carries the bearer, the secret or the gateway key", async (t) => {
  const { child, base } = await startServer(t, { TEST_MODEL_CHUNKS: "2", TEST_MODEL_DELAY_MS: "20" });
  const turn = await startTurn(base, THREAD_A);
  await turn.rest();
  await replyFor(THREAD_A);
  await fetch(`${base}/internal/llm/models`, { headers: { "X-Internal-Secret": "wrong-secret" } });
  await fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { Authorization: `Bearer ${BEARER}-expired` } });
  child.kill("SIGTERM");
  await child.exited;
  const output = child.output();
  for (const secret of [BEARER, SECRET, GATEWAY_KEY]) assert.ok(!output.includes(secret), `${secret} leaked:\n${output}`);
});
