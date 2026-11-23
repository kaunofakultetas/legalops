// -----------------------------------------------------------
//  [*] auth/session — where a missing session sends you
//
//  A signed-out visitor, an expired token and a logout all
//  end at the console's sign-in page (/console/login,
//  paths.js), and that page sends the user back to where
//  they were. The way back rides in ?next= and is only
//  honoured for a path on this origin (an open redirect
//  through ?next=//evil.example must not exist); ?expired=1
//  makes the
//  login page say the session ended instead of looking like
//  a fresh visit. location.replace keeps the dead page out of
//  the history, so Back never lands on it again.
//
//  Split into:
//
//    safeNext        — a ?next= value → a safe local path
//    loginUrl        — the sign-in page with next + expired
//    redirectToLogin — hard redirect from anywhere
// -----------------------------------------------------------

import { CONSOLE_BASE, CONSOLE_BASENAME, CONSOLE_LOGIN } from '@/paths';







// -----------------------------------------------------------
// safeNext
// -----------------------------------------------------------
//
// A path on this origin passes, with its query and hash.
// Everything else falls back to the console's first page:
// absolute URLs, protocol-relative "//host", backslash
// tricks, the bare root (the public site's first page is no
// way back from a sign-in) and the sign-in page itself — in
// any case, with or without a trailing slash, as the router
// matches it, and at the address it had before the console
// moved under its base as well. A path from those days (a
// bookmarked /reports/…) passes: the public site hands it on
// to the console (site/pages/Missing.jsx).
//
// Used by:
//   - loginUrl (below)
//   - pages/Login/Login.jsx — where to go after signing in
// -----------------------------------------------------------

export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return CONSOLE_BASE;
  const lower = value.toLowerCase();
  const at = (page) => lower === page || ['/', '?', '#'].some((mark) => lower.startsWith(`${page}${mark}`));
  if (value === '/' || at(CONSOLE_LOGIN) || at('/login')) return CONSOLE_BASE;
  return value;
}







// -----------------------------------------------------------
// loginUrl
// -----------------------------------------------------------
//
// The sign-in page's address with the way back and the
// "session ended" flag as its query. The console's first
// page as the way back is left out — it is the default
// anyway.
//
// Used by:
//   - redirectToLogin (below)
// -----------------------------------------------------------

export function loginUrl({ next, expired = false } = {}) {
  const params = new URLSearchParams();
  const target = safeNext(next);
  if (target !== CONSOLE_BASE && target !== CONSOLE_BASENAME) params.set('next', target);
  if (expired) params.set('expired', '1');
  const query = params.toString();
  return `${CONSOLE_LOGIN}${query ? `?${query}` : ''}`;
}







// -----------------------------------------------------------
// redirectToLogin
// -----------------------------------------------------------
//
// Hard-replaces the page with the sign-in page, remembering
// the current path; `expired` for a token the backend
// refused.
//
// Used by:
//   - api/client.js — a 401 on any request
//   - AuthGuard.jsx — no token at all
// -----------------------------------------------------------

export function redirectToLogin({ expired = false } = {}) {
  const { pathname, search, hash } = window.location;
  window.location.replace(loginUrl({ next: `${pathname}${search}${hash}`, expired }));
}
