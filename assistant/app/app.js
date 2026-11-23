// -----------------------------------------------------------
//  [*] Assistant — the Express application
//
//  The service's HTTP surface:
//
//    /api/assistant/chat  — the chat stream, stop and status
//                           (public, through Caddy)
//    /internal/llm/*      — generate, embed and models for the
//                           worker (shared secret)
//    /internal/mcp/*      — the admin page's MCP connection
//                           test (shared secret)
//    /health              — liveness and configuration probe
//
//  Every answer except the chat stream is JSON, errors
//  included. createApp() builds the app without listening, so
//  the tests can mount it; server.js is the one place that
//  listens.
//
//  Split into:
//
//    createApp      — the configured app
//    unmatched      — the 404 / 405 tail
//    allowedMethods — what the route table serves for a path
// -----------------------------------------------------------

import express from "express";

import { MAX_REQUEST_BYTES } from "./config.js";
import { configuredProviders, isModelConfigured } from "./llm/provider.js";
import { HttpError, errorMiddleware } from "./middleware/errors.js";
import { requireInternal } from "./middleware/internal.js";
import chatRoutes from "./routes/chat.js";
import internalRoutes from "./routes/internal.js";
import internalMcpRoutes from "./routes/internalMcp.js";
import { activeRunCount } from "./services/runs.js";







// -----------------------------------------------------------
// createApp
// -----------------------------------------------------------
//
// Wires the middleware and routes. Proxy headers are not
// trusted: the client's address is the X-Real-IP header
// (services/clientIp.js). The public chat gets a small
// body limit — one message, the history lives in Django — and
// the internal door 16 MB, its secret checked before any body
// is parsed. The 404 / 405 tail and the error middleware come
// last, so every failure leaves as the JSON envelope.
//
// Used by:
//   - server.js — the process
// -----------------------------------------------------------

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use("/api/assistant", express.json({ limit: MAX_REQUEST_BYTES }));
  app.use("/internal", requireInternal, express.json({ limit: "16mb" }));

  app.use("/api/assistant/chat", chatRoutes);
  app.use("/internal/llm", internalRoutes);
  app.use("/internal/mcp", internalMcpRoutes);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok", model: isModelConfigured() ? "configured" : "missing-key", providers: configuredProviders(),
      activeTurns: activeRunCount(),
    });
  });

  app.use(unmatched);
  app.use(errorMiddleware);
  return app;
}







// -----------------------------------------------------------
// unmatched
// -----------------------------------------------------------
//
// Reached when no route answered: a path served under other
// methods is a 405 with its Allow header, anything else a
// 404 — both as the JSON envelope, never Express's HTML page.
// Without the secret every /internal path is already a 403.
//
// Used by:
//   - createApp (above)
// -----------------------------------------------------------

function unmatched(req, res, next) {
  const allowed = allowedMethods(req.app.router.stack, req.path);
  if (allowed.length > 0) {
    res.set("Allow", allowed.join(", "));
    return next(new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed"));
  }
  return next(new HttpError(404, "NOT_FOUND", "Not found"));
}







// -----------------------------------------------------------
// allowedMethods
// -----------------------------------------------------------
//
// The methods Express's own route table serves for a path,
// matched the way the router matches (parameters included,
// mounted routers walked); HEAD comes with every GET.
//
// Used by:
//   - unmatched (above)
// -----------------------------------------------------------

function allowedMethods(stack, path) {
  const methods = new Set();
  for (const layer of stack) {
    let matched = false;
    try {
      matched = layer.match(path);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods).filter((name) => !name.startsWith("_"))) {
        methods.add(method.toUpperCase());
        if (method === "get") methods.add("HEAD");
      }
    } else if (Array.isArray(layer.handle?.stack)) {
      for (const method of allowedMethods(layer.handle.stack, path.slice(layer.path.length) || "/")) methods.add(method);
    }
  }
  return [...methods].sort();
}
