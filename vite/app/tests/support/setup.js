// -----------------------------------------------------------
//  [*] Test support — the vitest setup file
//
//  Runs before every test file (vite.config.js → test.setupFiles):
//
//    - jest-dom matchers (toBeInTheDocument, toBeDisabled, …)
//    - the browser APIs jsdom lacks that MUI, the DataGrid,
//      react-hot-toast, assistant-ui and the app's own
//      components touch: ResizeObserver, IntersectionObserver,
//      matchMedia, pointer capture, element scrolling,
//      createObjectURL, canvas contexts
//    - the msw backend double (backend/server.js): started
//      once per file, handlers reset after every test, and a
//      request that no handler answers FAILS the test — a page
//      calling an endpoint the double does not know is exactly
//      the kind of drift this suite exists to catch
//    - Node's FormData / File / Blob in place of jsdom's, so
//      uploads reach the double as real multipart bodies
//    - relative fetch() URLs: the chat streams through the AI
//      SDK's fetch transport ("/api/assistant/chat"); Node's
//      fetch has no document to resolve a path against, so
//      paths are resolved on the jsdom origin first — the way
//      the browser resolves them
//    - a fresh window.location double per test (location.js)
//    - a clean slate per test: DOM, cookies, localStorage
//      (the bearer token), sessionStorage and the navigation
//      memory kept beside it (utils/navigationMemory.js —
//      scroll positions, the entries behind), timers, toasts,
//      stubbed globals and environment variables, mocks
//    - a console guard: React's own bug reports (a missing
//      key, a state update on another component while
//      rendering, an unknown DOM prop, invalid HTML nesting)
//      and a render crash (React's report of an error that an
//      error boundary caught — the router's RouteError,
//      renderPage's TestErrorBoundary) fail the test that
//      caused them; act() warnings are printed but tolerated
//      (an async response landing after the last assertion is
//      not a defect)
//
//  Nothing here reaches a real backend, browser or the
//  network — the whole suite is self-contained to vite/app.
// -----------------------------------------------------------

import '@testing-library/jest-dom/vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import toast from 'react-hot-toast';
import { forgetNavigationMemory } from '@/utils/navigationMemory';
import { server, stopRecordingRequests, unhandledRequests } from './backend/server';
import { installLocationDouble, TEST_ORIGIN } from './location';


// Uploads: jsdom's FormData / File / Blob cannot cross into
// msw — vitest's jsdom Request shim converts them by reading
// jsdom internals that jsdom 30 no longer has (a multipart
// body with a jsdom File throws before any handler runs), and
// jsdom's FormData stringifies a Node File. Node's own three
// classes (the ones its fetch and Request understand) replace
// them for the whole run, so the app's `new FormData()` + a
// test's `new File([...])` reach the handler as a real
// multipart body. They are defined as plain values on the
// global: vitest exposes jsdom's classes through accessors
// that write through to the jsdom window, and the shim must
// keep seeing jsdom's own classes there (else it would try to
// "convert" the Node ones). Node's FormData class is
// reachable only through an instance, hence the parsed empty
// form.
const NodeFormData = (await new Response('', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).formData()).constructor;
for (const [name, value] of Object.entries({ FormData: NodeFormData, File: NodeFile, Blob: NodeBlob })) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: false });
}


// Messages console.error may carry that mean the code under
// test has a bug (not a test-timing artefact)
const FATAL_CONSOLE_PATTERNS = [
  /unique "key" prop/,
  /Encountered two children with the same key/,
  /Cannot update a component .* while rendering a different component/,
  /Maximum update depth exceeded/,
  /React does not recognize the .* prop on a DOM element/,
  /Invalid DOM property/,
  /for a non-boolean attribute/,
  /Rendered more hooks than during the previous render/,
  /Rendered fewer hooks than expected/,
  /Invalid hook call/,
  /Objects are not valid as a React child/,
  /cannot be a (child|descendant) of/,
  /is changing an? (un)?controlled input to be (un)?controlled/,
  /The above error occurred in/,
];







// -----------------------------------------------------------
// Browser API polyfills
// -----------------------------------------------------------
//
// Installed once per file, before any component code runs.
// Each stub is the smallest thing that keeps the library that
// needs it from throwing; tests that care about the real
// behaviour (a media query, a resize) override per test.
//
// Used by:
//   - every rendered component, implicitly
// -----------------------------------------------------------

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub {
  constructor() { this.root = null; this.rootMargin = ''; this.thresholds = []; }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

// matchMedia: every query reports "does not match" unless a
// test sets one (see mediaQueryMatches; cleared before every
// test) — so the app renders its wide (md and up) layout by
// default
const matchingQueries = new Set();

export function mediaQueryMatches(query, matches = true) {
  if (matches) matchingQueries.add(query); else matchingQueries.delete(query);
}

function matchMediaStub(query) {
  return {
    matches: matchingQueries.has(query),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  };
}

// findBy*/waitFor give up after 1 s by default — too little for a
// full page (session check + chrome + a DataGrid) on a loaded
// machine; nothing in the suite is meant to be timing-sensitive
// at that scale
configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  globalThis.ResizeObserver ??= ResizeObserverStub;
  globalThis.IntersectionObserver ??= IntersectionObserverStub;
  window.matchMedia = matchMediaStub;
  window.scrollTo = () => {};
  Element.prototype.scrollTo ??= function () {};
  Element.prototype.scrollBy ??= function () {};
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.setPointerCapture ??= function () {};
  Element.prototype.releasePointerCapture ??= function () {};
  Element.prototype.hasPointerCapture ??= function () { return false; };
  // Unconditional: vitest's jsdom environment defines its own
  // createObjectURL, which throws on jsdom's Blob
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
  // Charts probe a 2D context; jsdom would log "not
  // implemented" — an inert context is enough
  HTMLCanvasElement.prototype.getContext = () => null;
});







// -----------------------------------------------------------
// Backend double lifecycle
// -----------------------------------------------------------
//
// One msw server per test file: default handlers (the happy
// path for every endpoint the SPA calls) come back after each
// test, so a test only ever declares the deviation it is
// about. A request no handler matched is recorded by
// backend/server.js and fails the test in afterEach — unless
// the test declared it expects one (allowUnhandledRequests).
//
// fetch() is wrapped AFTER msw patched it, so a relative URL
// reaches msw (and its handlers) already resolved.
//
// Used by:
//   - every test, implicitly
// -----------------------------------------------------------

let unhandledAllowed = false;

export function allowUnhandledRequests() {
  unhandledAllowed = true;
}

// A test that deliberately provokes one of the FATAL console
// messages declares the pattern(s) it expects — those lines
// are then not counted against it
const allowedConsoleErrors = [];

export function allowConsoleErrors(...patterns) {
  allowedConsoleErrors.push(...patterns);
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
  const interceptedFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => interceptedFetch(
    typeof input === 'string' && input.startsWith('/') ? new URL(input, TEST_ORIGIN).href : input,
    init,
  );
});

afterAll(() => {
  server.close();
});







// -----------------------------------------------------------
// Per-test slate
// -----------------------------------------------------------
//
// Before: a fresh location double at "/", English locale
// cookie (the app's default is Lithuanian — the tests read
// English unless they switch). After: React trees unmounted,
// <body> emptied, handlers reset, storage (the navigation
// memory's in-memory copy too — every test's router starts
// at the key "default") and cookies wiped, real timers,
// stubbed globals, environment variables and mocks undone,
// toasts dropped — then the unhandled-request and console
// verdicts, which are the last thing so cleanup has happened
// even when they fail the test.
//
// Used by:
//   - every test, implicitly
// -----------------------------------------------------------

const consoleErrors = [];
let originalConsoleError;

beforeEach(() => {
  matchingQueries.clear();
  installLocationDouble('/');
  document.cookie = 'locale=en; path=/';
  document.title = '';
  unhandledAllowed = false;
  unhandledRequests.length = 0;
  consoleErrors.length = 0;
  allowedConsoleErrors.length = 0;
  originalConsoleError = console.error;
  console.error = (...args) => {
    consoleErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    originalConsoleError(...args);
  };
});

afterEach(() => {
  cleanup();
  // What a library appended to <body> outside React (the chat's
  // hidden file inputs wait there for a change event) must not
  // reach the next test
  document.body.replaceChildren();
  server.resetHandlers();
  stopRecordingRequests();
  toast.remove();
  localStorage.clear();
  sessionStorage.clear();
  forgetNavigationMemory();
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (name) document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  console.error = originalConsoleError;

  if (unhandledRequests.length && !unhandledAllowed) {
    const list = unhandledRequests.map((r) => `${r.method} ${r.url}`).join('\n  ');
    throw new Error(`request(s) the backend double has no handler for — add one in tests/support/backend/handlers.js or answer it in the test:\n  ${list}`);
  }

  const fatal = consoleErrors.filter((msg) =>
    FATAL_CONSOLE_PATTERNS.some((re) => re.test(msg)) && !allowedConsoleErrors.some((re) => re.test(msg)));
  if (fatal.length) {
    throw new Error(`console.error reported a defect during this test:\n  ${fatal.join('\n  ')}`);
  }
});
