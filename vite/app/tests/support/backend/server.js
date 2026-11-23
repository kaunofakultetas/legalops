// -----------------------------------------------------------
//  [*] Test support — the msw backend double
//
//  The SPA never talks to a real backend in this suite. msw
//  (Mock Service Worker, node build) intercepts every
//  XMLHttpRequest and fetch the code under test issues — the
//  shared axios instance in api/client.js included, with its
//  bearer and 401 interceptors and relative URLs exactly as
//  in production, and the chat's fetch stream — and answers
//  from handlers:
//
//    - handlers.js holds the DEFAULT answer for every
//      endpoint the SPA calls (the happy path, bodies shaped
//      like the Django serializers, values from fixtures.js)
//    - a test declares deviations through `given` below
//      (an error envelope, a proxy's HTML page, an empty body,
//      a wrong shape, a hang, a network failure, a 401), which
//      take precedence until setup.js resets the handlers
//      after the test
//    - contract.js turns those deviations into a matrix a
//      page test can run against each endpoint it consumes
//
//  Handlers are registered with ABSOLUTE urls on the jsdom
//  origin (TEST_ORIGIN): jsdom resolves the SPA's relative
//  "/api/…" requests against document.baseURI, and matching on
//  the absolute form keeps that independent of the
//  window.location double the tests install.
//
//  Used by:
//    - setup.js — lifecycle, unhandled-request verdict
//    - every test that shapes a backend answer (given.*)
// -----------------------------------------------------------

import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { defaultHandlers } from './handlers';
import { TEST_ORIGIN } from '../location';


// Requests no handler answered during the current test —
// setup.js fails the test on them (see allowUnhandledRequests)
export const unhandledRequests = [];


export const server = setupServer(...defaultHandlers);

server.events.on('request:unhandled', ({ request }) => {
  unhandledRequests.push({ method: request.method, url: request.url });
});







// -----------------------------------------------------------
// url
// -----------------------------------------------------------
//
// "/api/users" → "http://localhost:3000/api/users". Paths may
// carry msw params (":id") and wildcards ("*"); an absolute
// URL is returned unchanged.
//
// Used by:
//   - handlers.js, given (below), contract.js
// -----------------------------------------------------------

export const url = (path) => (/^https?:\/\//.test(path) ? path : `${TEST_ORIGIN}${path}`);







// -----------------------------------------------------------
// apiError
// -----------------------------------------------------------
//
// The body of every Django failure: {"error": "<English
// prose>", "code": "<SLUG>"} (common/http.py). The prose
// only ever reaches the English UI for the validation codes
// (utils/errors.js DETAIL_CODES); everything else is mapped
// from the code or the status.
//
//   apiError('NOT_FOUND')
//   apiError('INVALID_QUERY', 'limit must be between 1 and 500')
//
// Used by:
//   - given.apiError, contract.js, the api client tests
// -----------------------------------------------------------

export const apiError = (code, error = `${code} (test)`) => ({ error, code });







// -----------------------------------------------------------
// readBody
// -----------------------------------------------------------
//
// A request body as the test wants to see it: JSON parsed,
// multipart as {field: value} with files as {name, size,
// type}, anything else as text, null when empty.
//
// Used by:
//   - given.capture (below)
// -----------------------------------------------------------

export async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const fields = {};
    for (const [key, value] of form.entries()) {
      fields[key] = typeof value === 'string' ? value : { name: value.name, size: value.size, type: value.type };
    }
    return fields;
  }
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}







// -----------------------------------------------------------
// given
// -----------------------------------------------------------
//
// One-liners that override the answer of a single endpoint
// for the rest of the test. `method` is 'get' | 'post' |
// 'put' | 'patch' | 'delete'; `path` is a "/api/…" path with
// optional msw params. Every override is registered with
// server.use and so is dropped by the handler reset in
// setup.js afterEach.
//
//   given.json('get', '/api/users', { users: [] })    — any body, 200
//   given.json('post', '/api/users', {…}, { status: 201 })
//   given.apiError('post', '/api/users', 'EMAIL_TAKEN', { status: 409 })
//   given.apiError('get', '/api/audit', 'INVALID_QUERY', { status: 400, error: 'limit must be…' })
//   given.unauthorized('get', '/api/users')            — the 401 envelope
//   given.html('get', '/api/users')                    — a proxy's HTML 502
//   given.text('get', '/api/users', 'hello')           — text/plain 200
//   given.empty('get', '/api/users')                   — 200 with no body
//   given.networkError('get', '/api/users')            — connection failed
//   given.hang('get', '/api/users')                    — never answers
//   given.slow('get', '/api/users', 300, body)         — answers after ms
//   const calls = given.capture('post', '/api/users', body, { status: 201 })
//     → calls[i] = { url, query, body, headers } per request
//   given.sequence('get', '/api/x', [resp1, resp2])    — one per call,
//     the last one repeats; a resp is { status?, body?, error?, html?,
//     empty?, headers? } — `body: null` answers JSON null, `empty` no body
//   const calls = given.spy('get', '/api/users')       — records like
//     capture, then lets the default handler answer
//
// Used by:
//   - page/component tests, contract.js
// -----------------------------------------------------------

const respond = (method, path, resolver) => {
  server.use(http[method](url(path), resolver));
};

export const given = {

  json(method, path, body, { status = 200, headers } = {}) {
    respond(method, path, () => HttpResponse.json(body, { status, headers }));
  },

  apiError(method, path, code, { status = 400, error, headers } = {}) {
    respond(method, path, () => HttpResponse.json(apiError(code, error), { status, headers }));
  },

  unauthorized(method, path) {
    respond(method, path, () => HttpResponse.json(apiError('AUTH_REQUIRED', 'Authentication required'), { status: 401 }));
  },

  html(method, path, status = 502, text = '<html><body><h1>502 Bad Gateway</h1></body></html>') {
    respond(method, path, () => new HttpResponse(text, { status, headers: { 'Content-Type': 'text/html' } }));
  },

  text(method, path, text, status = 200) {
    respond(method, path, () => new HttpResponse(text, { status, headers: { 'Content-Type': 'text/plain' } }));
  },

  empty(method, path, status = 200) {
    respond(method, path, () => new HttpResponse(null, { status }));
  },

  networkError(method, path) {
    respond(method, path, () => HttpResponse.error());
  },

  hang(method, path) {
    respond(method, path, () => new Promise(() => {}));
  },

  slow(method, path, ms, body = {}, { status = 200 } = {}) {
    respond(method, path, async () => {
      await delay(ms);
      return HttpResponse.json(body, { status });
    });
  },

  capture(method, path, body = {}, { status = 200 } = {}) {
    const calls = [];
    respond(method, path, async ({ request }) => {
      const requestUrl = new URL(request.url);
      calls.push({
        url: request.url,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        body: await readBody(request),
        headers: Object.fromEntries(request.headers.entries()),
      });
      return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(body, { status });
    });
    return calls;
  },

  sequence(method, path, responses) {
    let i = 0;
    respond(method, path, () => {
      const step = responses[Math.min(i, responses.length - 1)];
      i += 1;
      if (step.error) return HttpResponse.error();
      if (step.html) return new HttpResponse(step.html, { status: step.status ?? 502, headers: { 'Content-Type': 'text/html' } });
      if (step.empty || step.status === 204) return new HttpResponse(null, { status: step.status ?? 200, headers: step.headers });
      return HttpResponse.json('body' in step ? step.body : {}, { status: step.status ?? 200, headers: step.headers });
    });
  },

  spy(method, path) {
    const calls = [];
    server.use(http[method](url(path), async ({ request }) => {
      const requestUrl = new URL(request.url);
      calls.push({
        url: request.url,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        body: await readBody(request.clone()),
        headers: Object.fromEntries(request.headers.entries()),
      });
      // No answer: msw goes on to the next handler (the default)
      return undefined;
    }));
    return calls;
  },
};







// -----------------------------------------------------------
// recordRequests
// -----------------------------------------------------------
//
//   const seen = recordRequests();
//   … render, act …
//   expect(seen.map((r) => r.path)).not.toContain('/api/users');
//
// Every request that reaches the double from now on, as
// { method, path, query }, whoever answers it — for "which
// endpoints does this page call at all" (a plain user must
// not call the admin-only ones). Stops recording with the
// test (setup.js removes the listeners after each test).
//
// Used by:
//   - page tests
// -----------------------------------------------------------

const recorders = new Set();

server.events.on('request:start', ({ request }) => {
  if (recorders.size === 0) return;
  const requestUrl = new URL(request.url);
  const entry = { method: request.method, path: requestUrl.pathname, query: Object.fromEntries(requestUrl.searchParams.entries()) };
  for (const seen of recorders) seen.push(entry);
});

export function recordRequests() {
  const seen = [];
  recorders.add(seen);
  return seen;
}

export function stopRecordingRequests() {
  recorders.clear();
}
