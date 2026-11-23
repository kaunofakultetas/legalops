// -----------------------------------------------------------
//  [*] Tests — the internal door's gate (middleware/internal.js)
//
//  /internal/* answers only a caller presenting the compose-
//  injected X-Internal-Secret. The gate is tested alone with a
//  fake request and through the real app; raw socket requests
//  carry the header shapes fetch will not send, and a child
//  process starts the app with no secret configured.
//
//  Defects guarded here:
//
//    ASSISTANT-ROUTES-9 — the JSON parser ran before the gate
// -----------------------------------------------------------

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import { after, before, test } from "node:test";

import "./env.mjs";
import { runNode } from "./helpers/process.mjs";


// The secret env.mjs configures
const SECRET = "s3cret";

// Every route behind the gate, with a body it would accept
const INTERNAL_ROUTES = [
  ["GET", "/internal/llm/models", undefined],
  ["POST", "/internal/llm/generate", { prompt: "x" }],
  ["POST", "/internal/llm/embed", { texts: ["x"] }],
  ["POST", "/internal/mcp/list-tools", { url: "http://127.0.0.1:9/mcp" }],
];

// The app under test and the gate itself, set up in before()
let server;
let base;
let requireInternal;







// -----------------------------------------------------------
// call
// -----------------------------------------------------------
//
// One JSON request against the app, returning its status and
// parsed body (null when empty). It carries no secret unless
// a test passes the header.
//
// Used by:
//   - the app tests (below)
// -----------------------------------------------------------

async function call(method, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}







// -----------------------------------------------------------
// rawStatus
// -----------------------------------------------------------
//
// The status of a hand-written request for the model list,
// written to a raw socket — for the header shapes fetch will
// not send as written (non-ASCII bytes, a duplicate,
// surrounding spaces).
//
// Used by:
//   - the header-name and odd-header tests (below)
// -----------------------------------------------------------

function rawStatus(headerLines) {
  return new Promise((resolve, reject) => {
    const { port } = new URL(base);
    const socket = net.connect(Number(port), "127.0.0.1", () => {
      socket.write(Buffer.concat([
        Buffer.from("GET /internal/llm/models HTTP/1.1\r\nHost: x\r\nConnection: close\r\n"),
        ...headerLines.map((line) => Buffer.concat([line, Buffer.from("\r\n")])),
        Buffer.from("\r\n"),
      ]));
    });
    let raw = "";
    socket.on("data", (chunk) => { raw += chunk; });
    socket.on("end", () => resolve(Number(raw.split(" ")[1])));
    socket.on("error", reject);
  });
}







// -----------------------------------------------------------
// fakeReq
// -----------------------------------------------------------
//
// A stand-in request with only the req.get requireInternal
// reads: it answers the given secret for X-Internal-Secret,
// in any letter case, and nothing for other headers.
//
// Used by:
//   - gate (below)
// -----------------------------------------------------------

function fakeReq(secret) {
  return { get: (name) => (name.toLowerCase() === "x-internal-secret" ? secret : undefined) };
}







// -----------------------------------------------------------
// gate
// -----------------------------------------------------------
//
// Runs requireInternal on a fake request presenting the given
// secret and returns what it handed to next(): nothing when
// the request may pass, else the error.
//
// Used by:
//   - the unit tests (below)
// -----------------------------------------------------------

function gate(secret) {
  let passed = "never called";
  requireInternal(fakeReq(secret), {}, (err) => { passed = err; });
  return passed;
}


before(async () => {
  ({ requireInternal } = await import("../middleware/internal.js"));
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});


test("the gate: the right secret passes; missing, empty, wrong, longer or shorter is 403 INTERNAL_ONLY", () => {
  assert.equal(gate(SECRET), undefined, "passes with no error");
  for (const presented of [undefined, null, "", "s3cre", "s3cret!", "S3CRET", "s3creT", " ", "s3cret\u0000"]) {
    const err = gate(presented);
    assert.equal(err?.status, 403, JSON.stringify(presented));
    assert.equal(err.code, "INTERNAL_ONLY");
    assert.equal(err.message, "Forbidden");
  }
});


test("every same-length candidate is compared with crypto.timingSafeEqual; another length never reaches it", (t) => {
  const spy = t.mock.method(crypto, "timingSafeEqual");
  syncBuiltinESMExports();
  t.after(() => syncBuiltinESMExports());
  gate(SECRET);
  gate("s3creX");
  gate("XXXXXX");
  assert.equal(spy.mock.callCount(), 3, "right and wrong alike, in constant time");
  gate("short");
  gate("a-much-longer-candidate");
  gate("");
  assert.equal(spy.mock.callCount(), 3, "a length mismatch is refused before the compare (it leaks only the length)");
});


test("the source never compares the secret with === / !== (only timingSafeEqual)", async () => {
  const source = await readFile(new URL("../middleware/internal.js", import.meta.url), "utf8");
  const code = source.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
  assert.match(code, /timingSafeEqual\(a, b\)/);
  assert.doesNotMatch(code, /(secret|presented|expected)\s*[!=]==|[!=]==\s*(secret|presented|expected)/i);
});


test("an empty configured secret refuses everything — even an empty presented one", (t) => {
  const saved = process.env.ASSISTANT_INTERNAL_SECRET;
  t.after(() => { process.env.ASSISTANT_INTERNAL_SECRET = saved; });
  process.env.ASSISTANT_INTERNAL_SECRET = "";
  for (const presented of ["", SECRET, undefined, "anything"]) {
    assert.equal(gate(presented)?.code, "INTERNAL_ONLY", JSON.stringify(presented));
  }
});


test("a process started without a secret refuses every internal route whatever is presented", async () => {
  const run = await runNode(`
    const { createApp } = await import("./app.js");
    const server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    const routes = ${JSON.stringify(INTERNAL_ROUTES)};
    const statuses = [];
    for (const [method, path, body] of routes) {
      for (const secret of [null, "", "s3cret", "undefined"]) {
        const response = await fetch(base + path, {
          method, headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "X-Internal-Secret": secret }) },
          body: body == null ? undefined : JSON.stringify(body),
        });
        statuses.push([path, secret, response.status, (await response.json()).error?.code]);
      }
    }
    server.close();
    console.log(JSON.stringify(statuses));
  `, { env: { AI_GATEWAY_KEY: "k" } });
  assert.equal(run.code, 0, run.stderr);
  const statuses = JSON.parse(run.stdout);
  assert.equal(statuses.length, INTERNAL_ROUTES.length * 4);
  for (const [path, secret, status, code] of statuses) {
    assert.deepEqual([status, code], [403, "INTERNAL_ONLY"], `${path} with ${JSON.stringify(secret)}`);
  }
});


test("every internal route is behind the gate; a wrong secret gets the envelope and never reaches the log", async (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  for (const [method, path, body] of INTERNAL_ROUTES) {
    for (const headers of [{}, { "X-Internal-Secret": "wrong-presented-secret" }]) {
      const answer = await call(method, path, body, headers);
      assert.equal(answer.status, 403, `${method} ${path}`);
      assert.deepEqual(answer.body, { message: "Forbidden", error: { code: "INTERNAL_ONLY", message: "Forbidden" } });
    }
  }
  assert.equal(warnings.length, INTERNAL_ROUTES.length * 2);
  for (const line of warnings) {
    assert.match(line, /^\[403\] INTERNAL_ONLY: Forbidden \((GET|POST) \/internal\//);
    assert.ok(!line.includes("wrong-presented-secret") && !line.includes(SECRET), line);
  }
});


test("header names are case-insensitive; surrounding spaces are not part of the value", async () => {
  for (const name of ["X-Internal-Secret", "x-internal-secret", "X-INTERNAL-SECRET"]) {
    assert.equal((await call("GET", "/internal/llm/models", undefined, { [name]: SECRET })).status, 200, name);
  }
  assert.equal(await rawStatus([Buffer.from(`X-Internal-Secret:    ${SECRET}   `)]), 200, "optional whitespace is trimmed");
});


test("odd header shapes are refused cleanly, never a 500: non-ASCII, duplicated, 8 KB long", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal(await rawStatus([Buffer.from("X-Internal-Secret: s3crët", "latin1")]), 403);
  assert.equal(await rawStatus([Buffer.from("X-Internal-Secret: sÃ«cret", "latin1")]), 403, "UTF-8 bytes");
  assert.equal(await rawStatus([Buffer.from(`X-Internal-Secret: ${SECRET}`), Buffer.from(`X-Internal-Secret: ${SECRET}`)]), 403,
               "two headers join into one value that is not the secret");
  assert.equal(await rawStatus([Buffer.from(`X-Internal-Secret: ${"x".repeat(8_000)}`)]), 403);
});


test("the gate guards only /internal: health and the public chat door never ask for the secret", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal((await call("GET", "/health")).status, 200);
  const chat = await call("POST", "/api/assistant/chat", {});
  assert.equal(chat.status, 401, "the chat's own gate (a bearer) answers, not the internal one");
  assert.equal(chat.body.error.code, "AUTH_REQUIRED");
});


test("the gate stands before the JSON parser: without the secret no body is parsed (ASSISTANT-ROUTES-9, FIXED 2026-09)", async (t) => {
  t.mock.method(console, "warn", () => {});
  for (const body of ["{oops", JSON.stringify({ prompt: "x".repeat(17 * 1024 * 1024) })]) {
    const refused = await fetch(`${base}/internal/llm/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(refused.status, 403, `a ${body.length}-byte body without the secret`);
    assert.equal((await refused.json()).error.code, "INTERNAL_ONLY");
  }
  const malformed = await fetch(`${base}/internal/llm/generate`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Secret": SECRET }, body: "{oops",
  });
  assert.deepEqual([malformed.status, (await malformed.json()).error.code], [400, "INVALID_JSON"], "with the secret, the parser answers");
  const huge = await fetch(`${base}/internal/llm/generate`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Secret": SECRET },
    body: JSON.stringify({ prompt: "x".repeat(17 * 1024 * 1024) }),
  });
  assert.deepEqual([huge.status, (await huge.json()).error.code], [413, "PAYLOAD_TOO_LARGE"]);
  for (const path of ["/internal", "/internal/other", "/internal/assistant/prompt"]) {
    assert.equal((await call("GET", path)).status, 403, `${path}: the whole door is shut without the secret`);
  }
});
