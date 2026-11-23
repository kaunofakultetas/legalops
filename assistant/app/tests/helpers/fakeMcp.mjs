// -----------------------------------------------------------
//  [*] Tests — a scripted MCP server (both transports)
//
//  A local stand-in for an external MCP server, speaking the
//  JSON-RPC the @ai-sdk/mcp client sends: Streamable HTTP
//  with the legacy handshake (discovery refused, a session
//  id, an inbound event stream held open, a DELETE on close)
//  or the modern one, or the older HTTP+SSE transport.
//  Everything is recorded, so a test can assert what the
//  assistant sent and whether it hung up.
// -----------------------------------------------------------

import http from "node:http";


// The legacy protocol version the client falls back to
const LEGACY_PROTOCOL = "2025-11-25";

// The modern protocol version the client probes first
const MODERN_PROTOCOL = "2026-07-28";







// -----------------------------------------------------------
// startFakeMcp
// -----------------------------------------------------------
//
// Starts the server on a random port, at path /mcp. Its
// options stay live through the returned options object, so a
// test can change them mid-file: the tools it lists (paged,
// or an endless cursor like a buggy server), the handshake
// and the transport, the tools/call result, and failures — a
// status and body for every GET and POST, a redirect or a
// delay for every POST.
//
// Used by:
//   - tests/internal-mcp.test.mjs
//   - tests/chat-mcp.test.mjs
// -----------------------------------------------------------

export async function startFakeMcp(initial = {}) {
  const options = { tools: [], pageSize: 100, endless: false, modern: false, sse: false, failWith: null, failBody: null,
                    redirectTo: null, hangMs: 0, callResult: null, ...initial };
  const requests = [];
  const deletes = [];
  const streams = new Set();
  const sseSessions = new Map();
  const sockets = new Set();
  let sessions = 0;

  const rpcAnswer = (message) => {
    // The modern protocol stamps every result with its type
    const reply = (result) => ({ jsonrpc: "2.0", id: message.id, result: options.modern ? { resultType: "complete", ...result } : result });
    const refuse = (code, text) => ({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });
    switch (message.method) {
      case "server/discover":
        return options.modern
          ? reply({ supportedVersions: [MODERN_PROTOCOL], capabilities: { tools: {} } })
          : refuse(-32601, "Method not found");
      case "initialize":
        return reply({ protocolVersion: LEGACY_PROTOCOL, capabilities: { tools: {} },
                       serverInfo: { name: "fake-mcp", version: "1.0.0" } });
      case "tools/list": {
        if (options.endless) return reply({ tools: [], nextCursor: "again" });
        const start = Number(message.params?.cursor || 0);
        const page = options.tools.slice(start, start + options.pageSize);
        const next = start + options.pageSize < options.tools.length ? String(start + options.pageSize) : undefined;
        return reply({ tools: page, ...(next ? { nextCursor: next } : {}) });
      }
      case "tools/call":
        return reply(options.callResult?.(message.params?.name, message.params?.arguments)
          ?? { content: [{ type: "text", text: `called ${message.params?.name}` }] });
      default:
        return refuse(-32601, "Method not found");
    }
  };

  // A held-open event stream: counted while open
  const openStream = (res, first) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(first);
    streams.add(res);
    res.on("close", () => streams.delete(res));
  };

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", async () => {
      const url = new URL(req.url, "http://fake");
      let message = null;
      try { message = raw ? JSON.parse(raw) : null; } catch { message = null; }
      requests.push({ method: req.method, path: url.pathname, rpc: message?.method ?? null, params: message?.params ?? null,
                      headers: { ...req.headers } });

      if (req.method === "DELETE") {
        deletes.push(req.headers["mcp-session-id"] || null);
        res.writeHead(200).end();
        return;
      }
      if (req.method === "GET") {
        if (options.failWith) {
          res.writeHead(options.failWith, { "Content-Type": "text/plain" }).end(options.failBody?.(req.headers) ?? "upstream says no");
          return;
        }
        if (!options.sse) {
          // The inbound stream a legacy Streamable HTTP client
          // opens after initialize — held until it hangs up
          openStream(res, ": open\n\n");
          return;
        }
        sessions += 1;
        const session = `sse-${sessions}`;
        sseSessions.set(session, res);
        res.on("close", () => sseSessions.delete(session));
        openStream(res, `event: endpoint\ndata: /mcp/messages?session=${session}\n\n`);
        return;
      }
      if (options.hangMs) await new Promise((resolve) => setTimeout(resolve, options.hangMs));
      if (options.redirectTo) {
        res.writeHead(302, { Location: options.redirectTo }).end();
        return;
      }
      if (options.failWith) {
        res.writeHead(options.failWith, { "Content-Type": "text/plain" }).end(options.failBody?.(req.headers) ?? "upstream says no");
        return;
      }
      if (options.sse) {
        const stream = sseSessions.get(url.searchParams.get("session"));
        res.writeHead(stream ? 202 : 404).end();
        if (stream && message && message.id !== undefined) {
          stream.write(`event: message\ndata: ${JSON.stringify(rpcAnswer(message))}\n\n`);
        }
        return;
      }
      if (!message || message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const headers = { "Content-Type": "application/json" };
      if (message.method === "initialize") {
        sessions += 1;
        headers["mcp-session-id"] = `session-${sessions}`;
      }
      res.writeHead(200, headers).end(JSON.stringify(rpcAnswer(message)));
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    options,
    requests,
    deletes,
    openStreams: () => streams.size,
    rpcCalls: (method) => requests.filter((r) => r.rpc === method),
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}
