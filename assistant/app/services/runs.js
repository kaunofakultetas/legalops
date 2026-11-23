// -----------------------------------------------------------
//  [*] Assistant — the live turns (run registry)
//
//  A chat turn outlives its HTTP request: if the browser
//  reloads or leaves mid-answer, the model keeps going and the
//  reply is stored when it ends. Only the stop button, a newer
//  turn in the same thread or the shutdown aborts a turn. This
//  is the in-memory registry of those turns, one per thread —
//  the service runs as a single instance on purpose.
//
//  A run's stopReason stays null until the registry aborts it,
//  so an abort without a reason is one of the turn's own
//  timeouts.
//
//  Split into:
//
//    startRun       — register a turn (supersedes the old)
//    abortRun       — abort with a recorded reason
//    stopRun        — the user's stop button
//    runStatus      — is the thread's turn still live
//    activeRunCount — how many turns are live
//    drainRuns      — graceful-shutdown wait
// -----------------------------------------------------------

// threadId → the thread's current run (lookups by thread)
const byThread = new Map();

// Every run not yet finished — a superseded run leaves
// byThread at once but stays here until it has persisted
const live = new Set();

// Settles every waiter of drainRuns when `live` empties
const idleWaiters = new Set();







// -----------------------------------------------------------
// startRun
// -----------------------------------------------------------
//
// Registers the thread's new turn and returns it: its abort
// signal, its stop reason and finish(). A turn still running
// in the thread is aborted as "superseded" (its partial reply
// is still stored). The caller calls finish() once the turn
// has stored its reply; a second call does nothing.
//
// Used by:
//   - routes/chat.js — the POST handler
// -----------------------------------------------------------

export function startRun(threadId, userId) {
  const previous = byThread.get(threadId);
  if (previous) abortRun(previous, "superseded");

  const controller = new AbortController();
  const run = {
    id: crypto.randomUUID(),
    threadId,
    userId,
    startedAt: new Date().toISOString(),
    signal: controller.signal,
    controller,
    stopReason: null,
    finished: false,
    finish() {
      if (run.finished) return;
      run.finished = true;
      live.delete(run);
      if (byThread.get(threadId) === run) byThread.delete(threadId);
      if (live.size === 0) {
        for (const resolve of idleWaiters) resolve();
        idleWaiters.clear();
      }
    },
  };
  byThread.set(threadId, run);
  live.add(run);
  return run;
}







// -----------------------------------------------------------
// abortRun
// -----------------------------------------------------------
//
// Records why and aborts; the first reason wins.
//
// Used by:
//   - startRun, stopRun, drainRuns (this file)
// -----------------------------------------------------------

function abortRun(run, reason) {
  if (run.stopReason == null) run.stopReason = reason;
  if (!run.controller.signal.aborted) run.controller.abort(new Error(`Turn ${reason}`));
}







// -----------------------------------------------------------
// stopRun
// -----------------------------------------------------------
//
// The stop button: aborts the thread's turn if it is this
// user's. Another user's thread reads as "nothing to stop",
// so it does not reveal that the thread exists.
//
// Used by:
//   - routes/chat.js — POST /:threadId/stop
// -----------------------------------------------------------

export function stopRun(threadId, userId) {
  const run = byThread.get(threadId);
  if (!run || run.userId !== userId) return false;
  abortRun(run, "user");
  return true;
}







// -----------------------------------------------------------
// runStatus
// -----------------------------------------------------------
//
// Whether the thread has a live turn — the GUI asks after a
// reload, shows that the answer is still being written, and
// reloads the thread when it ends.
//
// Used by:
//   - routes/chat.js — GET /:threadId/status
// -----------------------------------------------------------

export function runStatus(threadId, userId) {
  const run = byThread.get(threadId);
  if (!run || run.userId !== userId) return { running: false, startedAt: null };
  return { running: true, startedAt: run.startedAt };
}







// -----------------------------------------------------------
// activeRunCount
// -----------------------------------------------------------
//
// How many turns are live — for the shutdown log and /health.
//
// Used by:
//   - server.js, app.js — /health
// -----------------------------------------------------------

export function activeRunCount() {
  return live.size;
}







// -----------------------------------------------------------
// drainRuns
// -----------------------------------------------------------
//
// Graceful shutdown: gives the live turns graceMs to finish on
// their own, then aborts the rest as "shutdown" (their partial
// replies are stored as interrupted) and waits up to settleMs
// for those writes.
//
// Used by:
//   - server.js — SIGTERM / SIGINT
// -----------------------------------------------------------

export async function drainRuns(graceMs, settleMs = 5_000) {
  const idle = () => new Promise((resolve) => {
    if (live.size === 0) return resolve();
    idleWaiters.add(resolve);
  });
  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());

  await Promise.race([idle(), timeout(graceMs)]);
  if (live.size === 0) return;
  for (const run of live) abortRun(run, "shutdown");
  await Promise.race([idle(), timeout(settleMs)]);
}
