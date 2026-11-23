// -----------------------------------------------------------
//  [*] Test support — the window.location double
//
//  jsdom cannot navigate: assigning window.location logs
//  "Not implemented: navigation" and changes nothing, so the
//  hard redirects the app performs (the api client's 401 →
//  /login?next=…&expired=1, AuthProvider's "no token" →
//  /login, the login page's ?next= return, the navbar
//  logout, RouteError's reload / home, chunkReload's one
//  automatic reload) could neither be asserted nor kept
//  quiet. installLocationDouble() replaces the global
//  `location` with a plain object that RECORDS every
//  navigation instead: tests read location.navigations (the
//  hrefs assigned / replaced, in order) and location.reloads
//  (how often reload() ran).
//
//  Only window.location is replaced — document.baseURI, the
//  cookie jar and the XHR URL resolution keep jsdom's real
//  origin (vitest's default, http://localhost:3000), which is
//  also where the msw handlers listen.
//
//  Used by:
//    - setup.js — installed fresh before every test
//    - tests that start on a specific path (a 401 must carry
//      the page the user was on as ?next=)
// -----------------------------------------------------------

import { vi } from 'vitest';


export const TEST_ORIGIN = 'http://localhost:3000';







// -----------------------------------------------------------
// installLocationDouble
// -----------------------------------------------------------
//
// Builds the double at `url` (an absolute URL or a path on
// TEST_ORIGIN), installs it as the global `location` through
// vi.stubGlobal (undone by vi.unstubAllGlobals in setup.js)
// and returns it. `href` is a live getter/setter: reading it
// gives the current URL, assigning it records the navigation
// AND moves the double there, so code that reads
// window.location after a redirect sees the new page — the
// way a real navigation (followed by the app restarting)
// would look to a unit test.
//
// Used by:
//   - setup.js (beforeEach), tests that need another start
// -----------------------------------------------------------

export function installLocationDouble(url = '/') {
  const state = { url: new URL(url, TEST_ORIGIN) };
  const navigations = [];
  let reloads = 0;

  const double = {
    navigations,
    get reloads() { return reloads; },
    get href() { return state.url.href; },
    set href(value) {
      navigations.push(String(value));
      state.url = new URL(value, state.url);
    },
    get origin() { return state.url.origin; },
    get protocol() { return state.url.protocol; },
    get host() { return state.url.host; },
    get hostname() { return state.url.hostname; },
    get port() { return state.url.port; },
    get pathname() { return state.url.pathname; },
    get search() { return state.url.search; },
    get hash() { return state.url.hash; },
    assign(value) { double.href = value; },
    replace(value) { double.href = value; },
    reload() { reloads += 1; },
    toString() { return state.url.href; },
  };

  vi.stubGlobal('location', double);
  return double;
}
