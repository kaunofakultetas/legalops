// -----------------------------------------------------------
//  [*] Assistant — the internal MCP door
//
//    POST /internal/mcp/list-tools — connect to one MCP
//                                    server and list its tools
//
//  The MCP admin page's "test connection": Django calls this
//  with a 45 s timeout, so the listing here gives up sooner.
//  The route sits behind requireInternal (app.js). The
//  server's headers are credentials — used, never logged or
//  echoed, even when the server's own error repeats them. A
//  host missing from the egress allowlist (compose extra_hosts
//  and exit/Caddyfile) fails as a plain connection error.
//
//  Split into:
//
//    readServer — the server config, validated
//    redact     — a failure text without the credentials
//    router     — the route (default export)
// -----------------------------------------------------------

import { Router } from "express";

import { HttpError } from "../middleware/errors.js";
import { listServerTools } from "../llm/mcp.js";


// How long connecting and listing may take together — less
// than Django's 45 s timeout
const LIST_TIMEOUT_MS = 40_000;

// The Express router this module exports
const router = Router();







// -----------------------------------------------------------
// readServer
// -----------------------------------------------------------
//
// Validates the server to connect to: an absolute http(s) URL
// without user:password in it (fetch refuses one and quotes
// the whole URL, credentials included, in its error), the
// http or sse transport, and at most 20 headers, all strings.
// Anything else is a 400.
//
// Used by:
//   - the list-tools route (below)
// -----------------------------------------------------------

export function readServer(body) {
  let parsed;
  try {
    parsed = new URL(String(body?.url || ""));
  } catch {
    throw new HttpError(400, "INVALID_URL", "url must be an absolute http(s) URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpError(400, "INVALID_URL", "url must be an absolute http(s) URL");
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(400, "INVALID_URL", "url must not carry credentials — send them as headers");
  }
  const transport = body?.transport ?? "http";
  if (transport !== "http" && transport !== "sse") {
    throw new HttpError(400, "INVALID_TRANSPORT", "transport must be http or sse");
  }
  const headers = body?.headers ?? {};
  if (typeof headers !== "object" || Array.isArray(headers) || Object.keys(headers).length > 20
      || Object.values(headers).some((value) => typeof value !== "string")) {
    throw new HttpError(400, "INVALID_HEADERS", "headers must be an object of string values");
  }
  return { url: parsed.toString(), transport, headers };
}







// -----------------------------------------------------------
// redact
// -----------------------------------------------------------
//
// The failure text with the credentials cut out. The MCP
// client quotes the server's error body, and a server may
// repeat what it was sent, so every header value and every
// word of eight or more characters in one (the token after
// "Bearer") is replaced, longest first.
//
// Used by:
//   - the list-tools route (below)
// -----------------------------------------------------------

function redact(text, headers) {
  const secrets = Object.values(headers)
    .flatMap((value) => [value.trim(), ...value.split(/\s+/).filter((word) => word.length >= 8)])
    .filter((secret) => secret.length >= 4)
    .sort((a, b) => b.length - a.length);
  return secrets.reduce((out, secret) => out.replaceAll(secret, "[redacted]"), text);
}







// -----------------------------------------------------------
// list-tools route
// -----------------------------------------------------------
//
// POST /internal/mcp/list-tools
//
// Connects to the server the request describes and answers
// with its tools' names and descriptions. Any failure to
// connect or list is a 502 MCP_UNREACHABLE naming the cause,
// the credentials cut out.
//
// Used by:
//   - Django — assistant/gateway.py mcp_list_tools(), behind
//     POST /api/mcp/servers/{id}/test (the MCP admin page's
//     test button)
// -----------------------------------------------------------

router.post("/list-tools", async (req, res, next) => {
  try {
    const server = readServer(req.body);
    let tools;
    try {
      tools = await listServerTools(server, LIST_TIMEOUT_MS);
    } catch (err) {
      const cause = redact(String(err?.message || err), server.headers).slice(0, 300);
      throw new HttpError(502, "MCP_UNREACHABLE", `Could not list the server's tools: ${cause}`);
    }
    res.json({
      tools: tools.map((t) => ({ name: String(t.name), description: String(t.description || "").slice(0, 1000) })),
    });
  } catch (err) {
    next(err);
  }
});


export default router;
