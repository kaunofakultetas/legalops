// -----------------------------------------------------------
//  [*] Assistant — the internal door's gate
//
//  /internal/* is for container-to-container calls only:
//  Caddy never proxies it, and every request must carry the
//  compose-injected X-Internal-Secret. The comparison runs in
//  constant time, and an empty configured secret refuses
//  everything (fail closed).
//
//  Split into:
//
//    secretMatches   — the constant-time comparison
//    requireInternal — the gate itself
// -----------------------------------------------------------

import { timingSafeEqual } from "node:crypto";

import { INTERNAL_SECRET } from "../config.js";
import { HttpError } from "./errors.js";







// -----------------------------------------------------------
// secretMatches
// -----------------------------------------------------------
//
// Compares two strings in constant time, whatever their
// lengths: a length mismatch is refused before the compare,
// which leaks only the length.
//
// Used by:
//   - requireInternal (below)
// -----------------------------------------------------------

function secretMatches(presented, expected) {
  const a = Buffer.from(String(presented || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}







// -----------------------------------------------------------
// requireInternal
// -----------------------------------------------------------
//
// Lets a request through only when its X-Internal-Secret
// matches a non-empty configured secret; anything else is 403
// INTERNAL_ONLY. The secret is re-read from the environment on
// every request, so the tests can change it.
//
// Used by:
//   - app.js — createApp, before the body parser of every
//     /internal path
// -----------------------------------------------------------

export function requireInternal(req, _res, next) {
  const secret = process.env.ASSISTANT_INTERNAL_SECRET ?? INTERNAL_SECRET;
  if (!secret || !secretMatches(req.get("x-internal-secret"), secret)) {
    return next(new HttpError(403, "INTERNAL_ONLY", "Forbidden"));
  }
  return next();
}
