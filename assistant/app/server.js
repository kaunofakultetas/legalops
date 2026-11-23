// -----------------------------------------------------------
//  [*] Assistant — the process
//
//  Serves the app (app.js) and stops gracefully on SIGTERM or
//  SIGINT. A chat turn outlives its HTTP request
//  (services/runs.js), so waiting for sockets is not enough:
//
//    1. stop taking connections; from then on a connection
//       closes when its response ends, and a request on one
//       kept alive from before is refused with 503
//       SHUTTING_DOWN, so Caddy's pool never starts a turn on
//       a process that is going away;
//    2. give the live turns SHUTDOWN_GRACE_MS to finish, then
//       abort the rest (stored as interrupted);
//    3. give the open responses RESPONSE_TAIL_MS for their
//       last bytes — a turn is stored before its stream sends
//       the end marker — then close what remains and exit 0.
//
//  Docker's stop timeout must cover all three; compose sets
//  none, so a deploy kills the process after the default 10 s.
//  Boot only warns when the default model has no credentials
//  (chat answers 503) or the internal secret is empty (every
//  internal call is refused); a port that cannot be bound
//  exits 1. nodemon runs it in development, the image's CMD
//  in production.
//
//  Split into:
//
//    admit          — every request, before the app
//    responsesEnded — wait for the open responses
//    shutdown       — the graceful stop
// -----------------------------------------------------------

import http from "node:http";

import { createApp } from "./app.js";
import { INTERNAL_SECRET, PORT, SHUTDOWN_GRACE_MS } from "./config.js";
import { isModelConfigured } from "./llm/provider.js";
import { activeRunCount, drainRuns } from "./services/runs.js";


// How long the open responses get to write their tail once
// the turns have ended
const RESPONSE_TAIL_MS = 2_000;

// What a request arriving during the drain is told
const REFUSAL = "The assistant is restarting — try again in a moment";

// Set once — a second signal during the drain is ignored
let stopping = false;

// Responses not yet ended (a live stream, a request still in
// the app); the drain lets them finish before it closes
const openResponses = new Set();

// The Express app (app.js)
const app = createApp();

// The one listening server, admit() in front of the app
const server = http.createServer(admit);

// The idle keep-alive outlives Caddy's 55 s pool, so a reused
// connection is never closed under a request
server.requestTimeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 65_000;

server.on("error", (err) => {
  console.error(`assistant could not listen on :${PORT} — ${err.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`assistant listening on :${PORT}`);
  if (!isModelConfigured()) {
    console.warn("The default chat model's provider has no credentials — chat will answer 503");
  }
  if (!INTERNAL_SECRET) {
    console.warn("ASSISTANT_INTERNAL_SECRET is empty — every internal call will be refused");
  }
});







// -----------------------------------------------------------
// admit
// -----------------------------------------------------------
//
// The request listener in front of the app. It tracks every
// response until it ends, and once the drain has begun it
// closes the connection after the response instead of keeping
// it alive; a request arriving then never reaches the app and
// is refused with 503 SHUTTING_DOWN and Connection: close.
//
// Used by:
//   - the server (above), as its request listener
// -----------------------------------------------------------

function admit(req, res) {
  if (stopping) {
    const body = JSON.stringify({ message: REFUSAL, error: { code: "SHUTTING_DOWN", message: REFUSAL } });
    res.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body),
      Connection: "close", "Retry-After": "5",
    });
    res.end(body);
    return;
  }
  openResponses.add(res);
  res.once("close", () => {
    openResponses.delete(res);
    if (stopping) req.socket.end();
  });
  app(req, res);
}







// -----------------------------------------------------------
// responsesEnded
// -----------------------------------------------------------
//
// Waits until every open response has ended, or ms have
// passed.
//
// Used by:
//   - shutdown (below)
// -----------------------------------------------------------

async function responsesEnded(ms) {
  const until = Date.now() + ms;
  while (openResponses.size > 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}







// -----------------------------------------------------------
// shutdown
// -----------------------------------------------------------
//
// The graceful stop, in the three steps of the header; a
// second signal during the drain is ignored.
//
// Used by:
//   - the SIGTERM and SIGINT handlers (below)
// -----------------------------------------------------------

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received — draining (${activeRunCount()} live turns)`);
  const closed = new Promise((resolve) => server.close(resolve));
  server.closeIdleConnections();
  await drainRuns(SHUTDOWN_GRACE_MS);
  await responsesEnded(RESPONSE_TAIL_MS);
  server.closeAllConnections();
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 2_000).unref())]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A stray rejection is a bug to log, not a reason to drop
// every in-flight stream
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
