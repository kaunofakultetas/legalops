// -----------------------------------------------------------
//  [*] Assistant — the turn rate limiter
//
//  A fixed window per user: RATE_LIMIT_TURNS chat turns per
//  RATE_LIMIT_WINDOW_MS; the chat route refuses a guest
//  before it asks. A refused turn neither counts nor
//  stretches the window. The windows live in memory — the
//  service is a single instance on purpose. Every check
//  sweeps the expired ones, which keeps the map to the active
//  users and is also what gives a key a fresh window.
//
//  Split into:
//
//    checkTurnLimit         — record a turn or refuse it
//    trackedWindowsForTests — how many windows are held
// -----------------------------------------------------------

import { RATE_LIMIT_TURNS, RATE_LIMIT_WINDOW_MS } from "../config.js";
import { HttpError } from "../middleware/errors.js";


// Each key's open window: its turn count and when it ends
const windows = new Map();







// -----------------------------------------------------------
// checkTurnLimit
// -----------------------------------------------------------
//
// Counts one turn for the key, or throws a 429 RATE_LIMITED
// once its window is full. The error carries the seconds the
// window has left; the error middleware turns them into
// Retry-After and the envelope's retryAfterS, which the GUI
// shows as the real wait.
//
// Used by:
//   - routes/chat.js — the POST handler, before model work
// -----------------------------------------------------------

export function checkTurnLimit(key) {
  const now = Date.now();
  for (const [candidate, window] of windows) {
    if (window.resetAt <= now) windows.delete(candidate);
  }

  const window = windows.get(key);
  if (!window) {
    windows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (window.count >= RATE_LIMIT_TURNS) {
    const retryAfterS = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
    throw new HttpError(429, "RATE_LIMITED", "Too many questions in a row — wait a moment", { retryAfterS });
  }
  window.count += 1;
}







// -----------------------------------------------------------
// trackedWindowsForTests
// -----------------------------------------------------------
//
// How many keys hold a window right now — the tests' view of
// the sweep.
//
// Used by:
//   - tests/ratelimit.test.mjs
// -----------------------------------------------------------

export function trackedWindowsForTests() {
  return windows.size;
}
