// -----------------------------------------------------------
//  [*] Test support — the session fixtures
//
//  What GET /api/auth/me answers (users/auth.py user_json:
//  {id, email, displayName, role, active, dailyBudgetUsd,
//  createdAt, lastLoginAt}) and what PageWrapper hands every
//  page as `authData`. The default is the ADMINISTRATOR, so
//  a page renders all of its admin-only actions and columns;
//  `userAuthData` is the plain user for the role-gated paths
//  (the sidebar hides the admin links, PageWrapper shows the
//  "access restricted" page, pages hide admin actions).
//
//  The bearer token lives in localStorage (auth/token.js);
//  AuthProvider sends nobody to the backend without one, so
//  renderApp signs in with signIn() before rendering.
//
//  Used by:
//    - render.jsx — renderApp's token, the authData re-export
//    - page tests — <Page authData={authData} />
// -----------------------------------------------------------

import { adminUser, plainUser } from './backend/fixtures';


// The localStorage key auth/token.js reads
export const TOKEN_KEY = 'complianceToken';


// The administrator (the default session) and the plain user
export const authData = Object.freeze({ ...adminUser });
export const userAuthData = Object.freeze({ ...plainUser });







// -----------------------------------------------------------
// signIn / signOut
// -----------------------------------------------------------
//
// Puts a bearer token where auth/token.js looks for it (the
// session the backend double then answers /api/auth/me for),
// or takes it away. setup.js clears localStorage after every
// test.
//
// Used by:
//   - render.jsx — renderApp({ signedIn })
//   - auth guard, api client and login tests
// -----------------------------------------------------------

export function signIn(token = 'test-token') {
  localStorage.setItem(TOKEN_KEY, token);
}

export function signOut() {
  localStorage.removeItem(TOKEN_KEY);
}
