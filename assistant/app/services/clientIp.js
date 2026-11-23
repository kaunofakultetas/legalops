// -----------------------------------------------------------
//  [*] Assistant — the end user's address
//
//  The end user's address is the X-Real-IP header. The
//  ingress sets it to the X-Forwarded-For it received
//  (endpoint/Caddyfile), so it is what the proxy in front of
//  the endpoint put there; without it, the socket peer is the
//  endpoint itself. X-Forwarded-For is never read here (trust
//  proxy is off in app.js): its left end is whatever the
//  client wrote.
//
//  Split into:
//
//    clientIpOf  — X-Real-IP, validated
//    clientKeyOf — X-Real-IP or the socket peer
// -----------------------------------------------------------

import { isIP } from "node:net";







// -----------------------------------------------------------
// clientIpOf
// -----------------------------------------------------------
//
// The X-Real-IP address, forwarded to Django on the user's
// calls. Only a bare IPv4 or IPv6 literal passes; anything
// else (a port, a list, a hostname, a zone) is null, so
// nothing is forwarded and Django falls back to its peer
// address.
//
// Used by:
//   - services/identity.js — resolveIdentity
//   - clientKeyOf (below)
// -----------------------------------------------------------

export function clientIpOf(req) {
  const value = String(req.get?.("x-real-ip") || "").trim();
  return value.length <= 64 && isIP(value) !== 0 && !value.includes("%") ? value : null;
}







// -----------------------------------------------------------
// clientKeyOf
// -----------------------------------------------------------
//
// The address a request is logged by: X-Real-IP, else the
// socket peer (a direct call on the internal network).
//
// Used by:
//   - middleware/errors.js — errorMiddleware's log line
// -----------------------------------------------------------

export function clientKeyOf(req) {
  return clientIpOf(req) || req.socket?.remoteAddress || "unknown";
}
