// -----------------------------------------------------------
//  [*] Tests — a scripted MCP server double
//
//  A local http server speaking the part of the Model Context
//  Protocol that @ai-sdk/mcp's client uses, so llm/mcp.js
//  runs against a real wire with no network. Over Streamable
//  HTTP a DELETE is how a test sees the client closed; over
//  the SSE transport a closed event stream is the closed
//  client. Every request is recorded, and per-method handlers
//  script the misbehaving servers.
//
//  Split into:
//
//    tool           — one tool definition, briefly
//    startMcpServer — the double
// -----------------------------------------------------------

import http from "node:http";


// The legacy protocol version the client falls back to
const LEGACY_VERSION = "2025-11-25";

// The stateless protocol version the client probes first
const MODERN_VERSION = "2026-07-28";







// -----------------------------------------------------------
// tool
// -----------------------------------------------------------
//
// One MCP tool definition as tools/list answers it, with a
// stock description and one string parameter unless the test
// gives its own.
//
// Used by:
//   - tests/mcp.test.mjs
// -----------------------------------------------------------

export function tool(name, description = `The ${name} tool`, properties = { q: { type: "string" } }) {
  return { name, description, inputSchema: { type: "object", properties } };
}







// -----------------------------------------------------------
// startMcpServer
// -----------------------------------------------------------
//
// Starts the double on a random port. Discovery is refused
// unless it is modern, so the client takes the legacy
// handshake; tools/call goes to the test's call function (a
// throw becomes a JSON-RPC error) or echoes its arguments. A
// handler replaces one method's answer with a result, an
// error, an HTTP status, a raw body or a hang, and hangAll
// leaves every request unanswered. Without sessions no
// session id is issued, so the client never sends a DELETE.
//
// Used by:
//   - tests/mcp.test.mjs
// -----------------------------------------------------------

export async function startMcpServer({
  tools = [], call = null, pageSize = 0, handlers = {}, modern = false, hangAll = false, sessions = true,
} = {}) {
  const requests = [];
  const closedSessions = [];
  const streams = new Map();
  const pending = new Set();
  let sessionCount = 0;
  let streamCount = 0;

  // The built-in answer to one JSON-RPC request: a result or
  // a JSON-RPC error (notifications never get here)
  const defaultAnswer = async (message, headers) => {
    const params = message.params || {};
    if (message.method === "server/discover") {
      return modern
        ? { result: { resultType: "complete", supportedVersions: [MODERN_VERSION], capabilities: { tools: {} } } }
        : { error: { code: -32601, message: "Method not found" } };
    }
    if (message.method === "initialize") {
      return { result: { protocolVersion: LEGACY_VERSION, capabilities: { tools: {} },
                         serverInfo: { name: "double", version: "1.0.0" } } };
    }
    if (message.method === "tools/list") {
      const start = Number(params.cursor || 0);
      const size = pageSize || tools.length || 1;
      const page = tools.slice(start, start + size);
      const next = start + size < tools.length ? String(start + size) : undefined;
      return { result: { tools: page, ...(next ? { nextCursor: next } : {}) } };
    }
    if (message.method === "tools/call") {
      if (!call) return { result: { content: [{ type: "text", text: JSON.stringify(params.arguments ?? {}) }] } };
      try {
        return { result: await call(params.name, params.arguments ?? {}, headers) };
      } catch (err) {
        return { error: { code: -32603, message: String(err?.message || err) } };
      }
    }
    if (message.method === "ping") return { result: {} };
    return { error: { code: -32601, message: `Unknown method ${message.method}` } };
  };

  // The reply to one JSON-RPC message — status, body and
  // headers, or a hang; a method's handler comes first
  const respond = async (message, headers) => {
    if (!message || typeof message !== "object") return { status: 400, body: "not json-rpc" };
    if (message.id === undefined) return { status: 202, body: "" };
    const custom = handlers[message.method];
    const answer = custom ? await custom(message.params || {}, headers, message) : await defaultAnswer(message, headers);
    if (answer?.hang) return { hang: true };
    if (answer?.http) return { status: answer.http, body: answer.body ?? "", contentType: "text/plain" };
    if (answer?.raw !== undefined) return { status: 200, body: answer.raw, contentType: answer.contentType || "application/json" };
    const result = answer.result && modern && typeof answer.result === "object" && !answer.result.resultType
      ? { resultType: "complete", ...answer.result } : answer.result;
    const envelope = answer.error
      ? { jsonrpc: "2.0", id: message.id, error: answer.error }
      : { jsonrpc: "2.0", id: message.id, result };
    const extra = message.method === "initialize" && sessions ? { "mcp-session-id": `s-${++sessionCount}` } : {};
    return { status: 200, body: JSON.stringify(envelope), contentType: "application/json", headers: extra };
  };

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", async () => {
      const url = new URL(req.url, "http://mcp");
      let message = null;
      try { message = raw ? JSON.parse(raw) : null; } catch { message = null; }
      requests.push({
        http: req.method, path: url.pathname, rpc: message?.method ?? null, id: message?.id ?? null,
        params: message?.params ?? null, headers: { ...req.headers },
      });

      if (hangAll) {
        pending.add(res);
        return;
      }

      // The sse transport: the event stream and its POST endpoint
      if (req.method === "GET" && url.pathname.endsWith("/sse")) {
        const id = `sse-${++streamCount}`;
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        res.write(`event: endpoint\ndata: ${url.pathname.replace(/\/sse$/, "")}/messages?stream=${id}\n\n`);
        streams.set(id, res);
        // res, not req: a request's 'close' fires once its body is
        // read, the response's when the client hangs up
        res.on("close", () => {
          streams.delete(id);
          closedSessions.push(id);
        });
        return;
      }
      if (req.method === "POST" && url.searchParams.get("stream")) {
        const stream = streams.get(url.searchParams.get("stream"));
        if (!stream) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(202).end();
        const answer = await respond(message, req.headers);
        if (answer.hang || message?.id === undefined) return;
        stream.write(`event: message\ndata: ${answer.body}\n\n`);
        return;
      }

      // The http transport
      if (req.method === "DELETE") {
        closedSessions.push(req.headers["mcp-session-id"] || null);
        res.writeHead(200).end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      const answer = await respond(message, req.headers);
      if (answer.hang) {
        pending.add(res);
        return;
      }
      res.writeHead(answer.status, { ...(answer.contentType ? { "Content-Type": answer.contentType } : {}), ...(answer.headers || {}) });
      res.end(answer.body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  // Whether the predicate came true in time, timed with
  // performance.now(): the cache tests freeze the Date clock
  const waitFor = async (predicate, ms = 3_000) => {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    sseUrl: `http://127.0.0.1:${port}/mcp/sse`,
    requests,
    closedSessions,
    openStreams: () => streams.size,
    waitFor,
    close: () => new Promise((resolve) => {
      for (const res of pending) res.destroy();
      for (const res of streams.values()) res.destroy();
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}
