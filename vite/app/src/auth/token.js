// -----------------------------------------------------------
//  [*] auth/token — the bearer token store
//
//  The backend authenticates with an opaque bearer token
//  (returned by POST /api/auth/login, sent back on every call
//  as "Authorization: Bearer <token>"). This module is the
//  single place that token lives in the browser: one
//  localStorage key, read/written through these helpers so
//  no other file touches storage directly. The token survives
//  reloads on purpose — the backend expires sessions after
//  30 days anyway.
// -----------------------------------------------------------

// The one localStorage key
const TOKEN_KEY = 'complianceToken';







// -----------------------------------------------------------
// getToken
// -----------------------------------------------------------
//
// The stored token or null.
//
// Used by:
//   - api/client.js — the request interceptor
// -----------------------------------------------------------

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}







// -----------------------------------------------------------
// setToken
// -----------------------------------------------------------
//
// Stores a freshly minted token.
//
// Used by:
//   - Login.jsx — after a successful login
// -----------------------------------------------------------

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}







// -----------------------------------------------------------
// clearToken
// -----------------------------------------------------------
//
// Forgets the token (the server-side session may live on).
//
// Used by:
//   - api/client.js — on a 401
//   - AuthGuard.jsx — on a failed session check
//   - Navbar.jsx, Account.jsx — logout
// -----------------------------------------------------------

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
