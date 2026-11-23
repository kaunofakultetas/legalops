// -----------------------------------------------------------
//  [*] Tests — POST /internal/mcp/list-tools, the admin's test
//
//  The route behind the admin's "test connection" button:
//  Django's gateway.py calls it once, with a 45 s timeout, and
//  stores a refusal's message as the server's last error. The
//  real app runs against the scripted MCP server of
//  helpers/fakeMcp.mjs and throwaway local servers.
//
//  Defects guarded here:
//
//    ASSISTANT-ROUTES-7 — a server's error leaked its credentials
// -----------------------------------------------------------

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";

import { startFakeMcp } from "./helpers/fakeMcp.mjs";


// The credential the tests send: it must reach the MCP server,
// never an answer or a log line
const SECRET = "mcp-credential-9d8c7b6a";

// Five tools, the second without a description, the third
// with an oversized one
const TOOLS = [
  { name: "find_act", description: "Finds a legal act", inputSchema: { type: "object", properties: { q: { type: "string" } } } },
  { name: "no_description", inputSchema: { type: "object" } },
  { name: "verbose", description: "V".repeat(2_000), inputSchema: { type: "object" } },
  { name: "fourth", description: "4", inputSchema: { type: "object" } },
  { name: "fifth", description: "5", inputSchema: { type: "object" } },
];

// The app under test and the scripted MCP server, set up in
// before()
let base;
let server;
let mcp;







// -----------------------------------------------------------
// list
// -----------------------------------------------------------
//
// Calls the route as Django does and returns its status and
// parsed body. The shared secret rides along unless a test
// passes another or none; a string body goes out as it is, so
// a test can send malformed JSON.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function list(body, secret = "s3cret") {
  const response = await fetch(`${base}/internal/mcp/list-tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { "X-Internal-Secret": secret } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}







// -----------------------------------------------------------
// listen
// -----------------------------------------------------------
//
// A throwaway local HTTP server that counts its hits — the
// redirect target, or a server answering garbage.
//
// Used by:
//   - closedPort (below)
//   - the failure test (below)
// -----------------------------------------------------------

async function listen(handler) {
  const state = { hits: 0 };
  const listener = http.createServer((req, res) => {
    state.hits += 1;
    handler(req, res);
  });
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${listener.address().port}/mcp`;
  state.close = () => {
    listener.closeAllConnections();
    return new Promise((resolve) => listener.close(resolve));
  };
  return state;
}







// -----------------------------------------------------------
// closedPort
// -----------------------------------------------------------
//
// A port that refuses connections: a probe server held it a
// moment ago and has closed again.
//
// Used by:
//   - the failure and credentials tests (below)
// -----------------------------------------------------------

async function closedPort() {
  const probe = await listen(() => {});
  const { port } = new URL(probe.url);
  await probe.close();
  return port;
}


before(async () => {
  mcp = await startFakeMcp({ tools: TOOLS });
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  Object.assign(mcp.options, { tools: TOOLS, pageSize: 100, endless: false, modern: false, sse: false, failWith: null,
                               failBody: null, redirectTo: null, hangMs: 0 });
  mcp.requests.length = 0;
  mcp.deletes.length = 0;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await mcp.close();
});


test("the door demands the shared secret before anything is connected", async () => {
  for (const secret of [null, "wrong"]) {
    const answer = await list({ url: mcp.url }, secret);
    assert.deepEqual([answer.status, answer.body.error.code], [403, "INTERNAL_ONLY"]);
  }
  assert.equal(mcp.requests.length, 0);
});


test("the server config is validated field by field; a refused config never reaches the network", async () => {
  const refused = [
    [{}, "INVALID_URL"], [{ url: "" }, "INVALID_URL"], [{ url: "not a url" }, "INVALID_URL"], [{ url: "/relative/mcp" }, "INVALID_URL"],
    [{ url: "ftp://files.example/mcp" }, "INVALID_URL"], [{ url: "javascript:alert(1)" }, "INVALID_URL"],
    [{ url: "file:///etc/passwd" }, "INVALID_URL"], [{ url: 42 }, "INVALID_URL"], [[mcp.url], "INVALID_URL"],
    [{ url: mcp.url.replace("http://", `http://admin:${SECRET}@`) }, "INVALID_URL"],
    [{ url: mcp.url, transport: "ws" }, "INVALID_TRANSPORT"], [{ url: mcp.url, transport: "HTTP" }, "INVALID_TRANSPORT"],
    [{ url: mcp.url, transport: 1 }, "INVALID_TRANSPORT"], [{ url: mcp.url, transport: "stdio" }, "INVALID_TRANSPORT"],
    [{ url: mcp.url, headers: [] }, "INVALID_HEADERS"], [{ url: mcp.url, headers: "Authorization: x" }, "INVALID_HEADERS"],
    [{ url: mcp.url, headers: { a: 1 } }, "INVALID_HEADERS"], [{ url: mcp.url, headers: { a: null } }, "INVALID_HEADERS"],
    [{ url: mcp.url, headers: { a: ["x"] } }, "INVALID_HEADERS"],
    [{ url: mcp.url, headers: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`x-h${i}`, "v"])) }, "INVALID_HEADERS"],
  ];
  for (const [body, code] of refused) {
    const answer = await list(body);
    assert.deepEqual([answer.status, answer.body.error.code], [400, code], JSON.stringify(body).slice(0, 100));
    assert.equal(typeof answer.body.message, "string", "Django stores the message as the last error");
    assert.ok(!answer.body.message.includes(SECRET), "a password in the URL is refused, never quoted");
  }
  const malformed = await list("{nope");
  assert.deepEqual([malformed.status, malformed.body.error.code], [400, "INVALID_JSON"]);
  assert.equal(mcp.requests.length, 0, "nothing was connected");

  const edges = [
    { url: mcp.url, transport: null, headers: null },
    { url: mcp.url, headers: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`x-h${i}`, `v${i}`])) },
    { url: `${mcp.url}?tenant=a#fragment` },
  ];
  for (const body of edges) {
    const answer = await list(body);
    assert.equal(answer.status, 200, JSON.stringify(body).slice(0, 100));
  }
  assert.equal(mcp.requests.find((r) => r.headers["x-h19"])?.headers["x-h19"], "v19", "all twenty headers were sent");
});


test("a Streamable HTTP server: the tools as { name, description }, the credentials on every request, the session ended afterwards", async () => {
  const answer = await list({ url: mcp.url, transport: "http", headers: { Authorization: `Bearer ${SECRET}`, "X-Tenant": "knf" } });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.deepEqual(answer.body.tools[0], { name: "find_act", description: "Finds a legal act" }, "no schema, nothing else");
  assert.equal(answer.body.tools[1].description, "", "a missing description is empty");
  assert.equal(answer.body.tools[2].description, "V".repeat(1_000), "descriptions are capped");

  const sent = mcp.requests.filter((r) => r.method === "POST");
  assert.deepEqual(sent.map((r) => r.rpc), ["server/discover", "initialize", "notifications/initialized", "tools/list"]);
  for (const request of mcp.requests) {
    assert.equal(request.headers.authorization, `Bearer ${SECRET}`, `${request.method} ${request.rpc}`);
    assert.equal(request.headers["x-tenant"], "knf");
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const session = mcp.requests.find((r) => r.headers["mcp-session-id"])?.headers["mcp-session-id"];
  assert.match(session ?? "", /^session-\d+$/, "the server's session was used");
  assert.deepEqual(mcp.deletes, [session], "and ended");
  assert.equal(mcp.openStreams(), 0, "no stream left open");
});


test("a server of the modern protocol is listed without a session; the HTTP+SSE transport lists over its event stream", async () => {
  mcp.options.modern = true;
  const modern = await list({ url: mcp.url });
  assert.equal(modern.status, 200);
  assert.equal(modern.body.tools.length, TOOLS.length);
  assert.deepEqual(mcp.requests.filter((r) => r.method === "POST").map((r) => r.rpc), ["server/discover", "tools/list"]);
  assert.equal(mcp.deletes.length, 0, "no session to end");

  Object.assign(mcp.options, { modern: false, sse: true });
  mcp.requests.length = 0;
  const sse = await list({ url: mcp.url, transport: "sse", headers: { Authorization: `Bearer ${SECRET}` } });
  assert.equal(sse.status, 200);
  assert.deepEqual(sse.body.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.equal(mcp.requests[0].method, "GET", "the stream first");
  assert.ok(mcp.requests.filter((r) => r.method === "POST").every((r) => r.path === "/mcp/messages"), "then the announced endpoint");
  assert.ok(mcp.requests.every((r) => r.headers.authorization === `Bearer ${SECRET}`));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(mcp.openStreams(), 0, "the event stream is closed afterwards");
});


test("the server's cursor is followed; a server that pages forever is cut off and still answered", async () => {
  mcp.options.pageSize = 2;
  const paged = await list({ url: mcp.url });
  assert.deepEqual(paged.body.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.deepEqual(mcp.rpcCalls("tools/list").map((r) => r.params?.cursor ?? null), [null, "2", "4"]);

  mcp.requests.length = 0;
  mcp.options.endless = true;
  const started = Date.now();
  const endless = await list({ url: mcp.url });
  assert.deepEqual([endless.status, endless.body.tools], [200, []]);
  assert.ok(mcp.rpcCalls("tools/list").length <= 50, `${mcp.rpcCalls("tools/list").length} pages`);
  assert.ok(Date.now() - started < 5_000);
});


test("a slow server is still answered within the listing budget", async () => {
  mcp.options.hangMs = 300;
  const answer = await list({ url: mcp.url });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.tools.length, TOOLS.length);
});


test("every failure is 502 MCP_UNREACHABLE naming it: an HTTP error, a refused connection, a redirect never followed, garbage", async () => {
  for (const status of [500, 401, 404]) {
    mcp.options.failWith = status;
    const answer = await list({ url: mcp.url });
    assert.deepEqual([answer.status, answer.body.error.code], [502, "MCP_UNREACHABLE"], String(status));
    assert.match(answer.body.message, new RegExp(`^Could not list the server's tools: .*HTTP ${status}`));
  }
  mcp.options.failWith = null;

  const refused = await list({ url: `http://127.0.0.1:${await closedPort()}/mcp` });
  assert.deepEqual([refused.status, refused.body.error.code], [502, "MCP_UNREACHABLE"]);

  const target = await listen((_req, res) => res.writeHead(200, { "Content-Type": "application/json" }).end("{}"));
  const garbage = await listen((_req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end("<html>Login</html>"));
  try {
    mcp.options.redirectTo = target.url;
    const redirected = await list({ url: mcp.url });
    assert.deepEqual([redirected.status, redirected.body.error.code], [502, "MCP_UNREACHABLE"]);
    assert.equal(target.hits, 0, "an allowlisted host cannot bounce the assistant elsewhere");

    const html = await list({ url: garbage.url });
    assert.deepEqual([html.status, html.body.error.code], [502, "MCP_UNREACHABLE"]);
  } finally {
    await target.close();
    await garbage.close();
  }
});


test("the credentials are never echoed or logged, even when the server's error repeats them (ASSISTANT-ROUTES-7, FIXED 2026-09-27)", async (t) => {
  const logged = [];
  for (const method of ["error", "warn", "log"]) t.mock.method(console, method, (...args) => logged.push(args.map(String).join(" ")));
  const token = `Bearer ${SECRET}`;
  mcp.options.failWith = 401;
  mcp.options.failBody = (headers) => `invalid credentials: ${headers.authorization}; key=${headers["x-api-key"]}`;

  const answers = [
    await list({ url: mcp.url, headers: { Authorization: token, "X-Api-Key": `${SECRET}-key` } }),
    await list({ url: `http://127.0.0.1:${await closedPort()}/mcp`, headers: { Authorization: token } }),
    await list({ url: mcp.url, headers: { "Bad Header": SECRET } }),
    await list({ url: mcp.url, headers: { Authorization: `${token}\r\nX-Injected: 1` } }),
  ];
  for (const answer of answers) {
    assert.deepEqual([answer.status, answer.body.error.code], [502, "MCP_UNREACHABLE"]);
    assert.ok(!JSON.stringify(answer.body).includes(SECRET), `echoed: ${answer.body.message}`);
  }
  assert.match(answers[0].body.message, /HTTP 401/, "the failure is still named");
  assert.ok(logged.length > 0, "the failures were logged");
  assert.ok(logged.every((line) => !line.includes(SECRET)), `logged: ${logged.find((line) => line.includes(SECRET))}`);
});
