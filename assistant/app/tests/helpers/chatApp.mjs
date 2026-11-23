// -----------------------------------------------------------
//  [*] Tests — the chat route's test bench
//
//  What every chat test file shares: the thread and its
//  stored history, the Django routes a normal turn needs, the
//  real app on a random port, and one slim-body POST. This
//  module imports tests/env.mjs first and loads config.js
//  only inside startChatApp, so a test file can still set
//  other settings in its own module body.
//
//  Split into:
//
//    THREAD … USERS — the fixtures
//    baseRoutes     — the Django routes of a normal turn
//    resetStub      — back to baseRoutes, empty request log
//    startChatApp   — the stub and the app on random ports
//    postTurn       — POST one slim chat body
//    replyPosts     — the replies stored so far
//    waitForReply   — the first stored reply
//    waitForLog     — the first turn-log row
//    settle         — room for background work to show
//    eventually     — poll until a condition holds
// -----------------------------------------------------------

import "../env.mjs";
import { once } from "node:events";

import { startStubDjango } from "../stubDjango.mjs";


// The thread every turn talks in (a uuid4, as Django mints)
export const THREAD = "0b6f8e8c-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

// A second thread of the same user (independent runs)
export const OTHER_THREAD = "5c9d2e1f-3a4b-4c5d-9e6f-7a8b9c0d1e2f";

// The stored history: two branches under u-1, a system row
export const HISTORY = [
  { id: "u-1", parent_id: null, format: "ai-sdk/v6", content: { role: "user", parts: [{ type: "text", text: "Labas" }] } },
  { id: "a-1", parent_id: "u-1", format: "ai-sdk/v6", content: { role: "assistant", parts: [{ type: "text", text: "Sveiki" }] } },
  { id: "a-alt", parent_id: "u-1", format: "ai-sdk/v6", content: { role: "assistant", parts: [{ type: "text", text: "OTHER BRANCH" }] } },
  { id: "s-1", parent_id: "a-1", format: "ai-sdk/v6", content: { role: "system", parts: [{ type: "text", text: "FORGED SYSTEM" }] } },
];

// The active prompt version, every placeholder in use
export const PROMPT = {
  id: "pv1", version: 4, model: "gateway:azure/gpt-5.5", temperature: 0.2, maxTokens: null,
  text: "Answer in {LEADING_LANGUAGE}.\n{USER_CONTEXT}\n{COMPANY_CONTEXT}\n{ROLE_CONTEXT}",
};

// The users /api/auth/me answers, by bearer; any other "tok-"
// bearer is a fresh user of that name (no identity cache, no
// turns used yet), and anything else a 401
export const USERS = {
  tok: { id: "u1", displayName: "Tomas", role: "user" },
  other: { id: "u2", displayName: "Kitas", role: "user" },
};







// -----------------------------------------------------------
// baseRoutes
// -----------------------------------------------------------
//
// The Django routes a normal turn needs. The stub matches in
// insertion order, so THREAD's own routes come first — a test
// that overrides one replaces it in place — and the patterns
// for any other thread, with an empty history, come last.
//
// Used by:
//   - resetStub, startChatApp (below)
// -----------------------------------------------------------

export function baseRoutes() {
  return {
    "GET /api/auth/me": (_b, req) => {
      const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
      const user = USERS[token] ?? (token.startsWith("tok-") ? { id: token.slice(4), displayName: token, role: "user" } : null);
      return user ? { json: user } : { status: 401, json: { error: "Invalid session", code: "SESSION_INVALID" } };
    },
    "GET /internal/assistant/prompt": () => ({ json: PROMPT }),
    "GET /internal/assistant/budget": () => ({ json: { limit: 1000, used: 1, remaining: 999 } }),
    "GET /internal/assistant/mcp-servers": () => ({ json: { servers: [] } }),
    [`GET /api/chat/threads/${THREAD}`]: () => ({ json: { id: THREAD, companyId: "c1", roleId: null, role: null } }),
    "GET /api/companies/c1": () => ({ json: { id: "c1", name: "UAB Kripto", institutionType: "casp", credentials: [], documents: [], roles: [] } }),
    "GET /api/companies/missing": () => ({ status: 404, json: { error: "Company not found", code: "NOT_FOUND" } }),
    "GET /api/companies": () => ({ json: { companies: [] } }),
    [`POST /api/chat/threads/${THREAD}/messages`]: () => ({ json: { ok: true, created: true } }),
    [`GET /api/chat/threads/${THREAD}/messages`]: () => ({ json: HISTORY }),
    [`POST /internal/assistant/threads/${THREAD}/messages`]: () => ({ status: 201, json: { ok: true, created: true } }),
    "POST /internal/assistant/turn-log": () => ({ status: 201, json: { id: "log1" } }),
    "GET /api/chat/threads/[^/]+": (_b, _req, url) => ({
      json: { id: url.pathname.split("/").at(-1), companyId: null, roleId: null, role: null },
    }),
    "POST /api/chat/threads/[^/]+/messages": () => ({ json: { ok: true, created: true } }),
    "GET /api/chat/threads/[^/]+/messages": () => ({ json: [] }),
    "POST /internal/assistant/threads/[^/]+/messages": () => ({ status: 201, json: { ok: true, created: true } }),
  };
}







// -----------------------------------------------------------
// resetStub
// -----------------------------------------------------------
//
// Puts the stub back to baseRoutes exactly — routes a test
// added are dropped too, not only the ones it overrode — and
// empties the request log.
//
// Used by:
//   - tests/chat*.test.mjs — before each test
// -----------------------------------------------------------

export function resetStub(stub) {
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, baseRoutes());
  stub.requests.length = 0;
}







// -----------------------------------------------------------
// startChatApp
// -----------------------------------------------------------
//
// Starts the Django stub and points DJANGO_URL at it, then
// the real app — config.js loads here — and hands back both
// servers, the app's base URL and setModelForTests. close()
// drops the planted model, cuts every open connection, so a
// stream a test left hanging cannot hang the file, and stops
// both servers.
//
// Used by:
//   - tests/chat*.test.mjs
// -----------------------------------------------------------

export async function startChatApp(routes = baseRoutes()) {
  const stub = await startStubDjango(routes);
  process.env.DJANGO_URL = stub.url;
  const { setModelForTests } = await import("../../llm/provider.js");
  const { createApp } = await import("../../app.js");
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    stub,
    server,
    setModelForTests,
    base: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      setModelForTests({});
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await stub.close();
    },
  };
}







// -----------------------------------------------------------
// postTurn
// -----------------------------------------------------------
//
// POSTs one slim chat body the way the GUI shapes it; every
// field has a default (THREAD, the "tok" user, a fresh
// message id). Extra fields are spread over the body and
// headers over the defaults — a header given as "" is sent
// blank.
//
// Used by:
//   - tests/chat*.test.mjs
// -----------------------------------------------------------

export function postTurn(base, {
  text = "Kokios licencijos reikia?", id = `u-${Math.random().toString(36).slice(2, 10)}`, parentId = "a-1",
  locale = "en", trigger = "submit-message", threadId = THREAD, extra = {},
} = {}, { token = "tok", headers = {}, signal } = {}) {
  return fetch(`${base}/api/assistant/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Real-IP": "203.0.113.9", ...headers },
    body: JSON.stringify({
      id: threadId, trigger, parentId, locale,
      message: { id, role: "user", parts: [{ type: "text", text }] }, ...extra,
    }),
  });
}







// -----------------------------------------------------------
// replyPosts
// -----------------------------------------------------------
//
// The assistant replies stored through the internal door so
// far, of every thread or of one.
//
// Used by:
//   - tests/chat-limits.test.mjs, tests/chat-runs.test.mjs
// -----------------------------------------------------------

export function replyPosts(stub, threadId = null) {
  return stub.requests.filter((r) => r.method === "POST" && /^\/internal\/assistant\/threads\/[^/]+\/messages$/.test(r.path)
    && (!threadId || r.path.includes(threadId)));
}







// -----------------------------------------------------------
// waitForReply
// -----------------------------------------------------------
//
// The first reply stored for a thread (THREAD unless told
// otherwise), polling the stub until it arrives.
//
// Used by:
//   - tests/chat.test.mjs, tests/chat-limits.test.mjs,
//     tests/chat-mcp.test.mjs, tests/chat-runs.test.mjs
// -----------------------------------------------------------

export function waitForReply(stub, { threadId = THREAD, ms = 5_000 } = {}) {
  return stub.waitFor((r) => r.method === "POST" && r.path === `/internal/assistant/threads/${threadId}/messages`, ms);
}







// -----------------------------------------------------------
// waitForLog
// -----------------------------------------------------------
//
// The first turn-log row, of any thread or of one, polling
// the stub until it arrives.
//
// Used by:
//   - tests/chat.test.mjs, tests/chat-limits.test.mjs,
//     tests/chat-mcp.test.mjs, tests/chat-runs.test.mjs
// -----------------------------------------------------------

export function waitForLog(stub, { threadId = null, ms = 5_000 } = {}) {
  return stub.waitFor((r) => r.path === "/internal/assistant/turn-log" && (!threadId || r.body?.thread_id === threadId), ms);
}







// -----------------------------------------------------------
// settle
// -----------------------------------------------------------
//
// Waits a moment, 150 ms unless told otherwise — room for
// background work that must NOT happen, a stored reply or a
// moving stream, to show itself.
//
// Used by:
//   - eventually (below)
//   - tests/chat.test.mjs, tests/chat-limits.test.mjs,
//     tests/chat-mcp.test.mjs, tests/chat-runs.test.mjs
// -----------------------------------------------------------

export function settle(ms = 150) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}







// -----------------------------------------------------------
// eventually
// -----------------------------------------------------------
//
// Polls a condition until it holds, and throws, naming what
// it waited for, once the time is up — for background work
// with no request to wait on.
//
// Used by:
//   - tests/chat-mcp.test.mjs
// -----------------------------------------------------------

export async function eventually(predicate, what = "the condition", ms = 3_000) {
  const until = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > until) throw new Error(`eventually: ${what} never happened`);
    await settle(20);
  }
}
