// -----------------------------------------------------------
//  [*] Assistant — who is asking
//
//  Resolves the request's bearer against Django's
//  /api/auth/me. No bearer is a guest, never an error. Only
//  Django's own 401 becomes a 401 here, because the GUI signs
//  the user out on one; any other failure stays what it was,
//  and an answer without a user is a 502.
//
//  Answers are cached by token for IDENTITY_CACHE_MS, so a
//  busy thread does not hammer Django, and any later 401 for
//  that bearer evicts it at once — a logout is felt on the
//  next call, not when the cache runs out.
//
//  Split into:
//
//    resolveIdentity            — the per-request lookup
//    forgetToken                — evict one bearer
//    resetIdentityCacheForTests — drop the cache
// -----------------------------------------------------------

import { IDENTITY_CACHE_MS } from "../config.js";
import { HttpError } from "../middleware/errors.js";
import { clientIpOf } from "./clientIp.js";
import { onUnauthorized, publicFetch } from "./django.js";


// The most bearers remembered at once; expired rows are
// pruned first, then the oldest
const MAX_CACHED = 1_000;

// Each bearer's identity and expiry, oldest first: a Map
// keeps insertion order and a refreshed bearer goes in last
const cache = new Map();

// The answer for a request without a bearer
const GUEST = { userId: null, displayName: null, role: null, token: null };

// Django refusing a bearer anywhere means the session is gone
onUnauthorized((token) => forgetToken(token));







// -----------------------------------------------------------
// resolveIdentity
// -----------------------------------------------------------
//
// The caller's user id, display name, role and bearer, plus
// the client address, which is per request and never cached.
// The header is split the way Django's bearer_token splits
// it: a case-insensitive scheme up to the first space, then
// the token, trimmed. Any other shape is no bearer, so it
// never reaches Django.
//
// Used by:
//   - routes/chat.js — the first call of every route
// -----------------------------------------------------------

export async function resolveIdentity(req) {
  const clientIp = clientIpOf(req);
  const header = req.get("authorization") || "";
  const space = header.indexOf(" ");
  const scheme = space < 0 ? header : header.slice(0, space);
  const token = space < 0 ? "" : header.slice(space + 1).trim();
  if (!token || scheme.toLowerCase() !== "bearer") {
    return { ...GUEST, clientIp };
  }

  const cached = cache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.user, clientIp };
  }
  cache.delete(token);

  let me;
  try {
    me = await publicFetch("/api/auth/me", { token, clientIp });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      throw new HttpError(401, "SESSION_INVALID", "Session expired or invalid");
    }
    throw err;
  }
  if (!me?.id) {
    // Django answers a live session with the user and a dead
    // one with 401 (caught above) — anything else is a broken
    // answer, never a reason to sign the user out
    throw new HttpError(502, "DJANGO_UNREACHABLE", "Backend answered without a user", { path: "/api/auth/me" });
  }

  const user = { userId: me.id, displayName: me.displayName || null, role: me.role || "user", token };
  const now = Date.now();
  for (const [key, row] of cache) {
    if (row.expiresAt <= now || cache.size >= MAX_CACHED) cache.delete(key);
    else break;
  }
  cache.set(token, { user, expiresAt: now + IDENTITY_CACHE_MS });
  return { ...user, clientIp };
}







// -----------------------------------------------------------
// forgetToken
// -----------------------------------------------------------
//
// Drops one bearer from the cache, so its next request asks
// Django again.
//
// Used by:
//   - the onUnauthorized listener (above)
// -----------------------------------------------------------

export function forgetToken(token) {
  cache.delete(token);
}







// -----------------------------------------------------------
// resetIdentityCacheForTests
// -----------------------------------------------------------
//
// Drops the token cache between test cases.
//
// Used by:
//   - tests/identity.test.mjs
//   - tests/clientIp.test.mjs
//   - tests/errors.test.mjs
// -----------------------------------------------------------

export function resetIdentityCacheForTests() {
  cache.clear();
}
