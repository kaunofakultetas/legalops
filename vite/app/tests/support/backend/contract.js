// -----------------------------------------------------------
//  [*] Test support — the backend contract matrix
//
//  What a page must survive from its backend. For one
//  endpoint the page consumes, describeEndpointContract()
//  generates a test per response VARIANT — every way the
//  answer can be broken, wrong, late or missing:
//
//    failures the API defines (the {error, code} envelope:
//    500 SERVER_ERROR, 403 FORBIDDEN, 404 NOT_FOUND, a 400
//    validation code with the backend's prose, a 429 with
//    Retry-After, the AI provider's 402, an unknown code), a
//    proxy's HTML error page, an empty 5xx, a dropped
//    connection, a 401 — each must reach the screen as an
//    alert carrying the translated sentence utils/errors.js
//    maps it to (or, for the 401, as the hard redirect to
//    /login), the page's own chrome still standing, nothing
//    crashing
//
//    modified bodies (an empty body, null, a string, a number,
//    the wrong container, an empty object, rows with every
//    field missing, every leaf null, types swapped, extra
//    fields, a huge list, hostile unicode/markup in every
//    string) — the page must not crash: no render error, no
//    route-error card, its chrome still there, and markup in
//    a string rendered as text, never as elements
//
//    timing (a hang, a slow answer) — the loading state must
//    hold, then the data must land
//
//  A page test calls it once per endpoint, with the render
//  and the assertions that page understands; the variants a
//  page cannot meet are pinned with `pins` (it.fails, with
//  the bug id) so the suite stays green while the defect is
//  on record.
//
//  Used by:
//    - every page test (tests/pages/*)
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, url, apiError } from './server';


// The English sentences utils/errors.js turns the failures
// into — see messages/COMPONENTS/errors/en.json
export const ALERT_TEXT = {
  serverError: 'Server error. Try again later.',
  forbidden: 'You are not allowed to do this.',
  notFound: 'Not found — it may have been deleted.',
  conflict: 'This conflicts with the record\'s current state.',
  rateLimited: 'Too many attempts. Wait a moment and try again. Try again in 30 s.',
  aiBudget: 'The AI service budget is used up — try again later or contact your administrator.',
  badGateway: 'The server is temporarily unreachable. Try again.',
  unavailable: 'The service is temporarily unavailable. Try again later.',
  network: 'Could not reach the server. Check your internet connection.',
};

// The English prose of the 400 variant — shown verbatim in
// the English UI (a DETAIL_CODES code)
export const VALIDATION_PROSE = 'limit must be between 1 and 500';

// What the hostile-string variant puts in every string field
export const HOSTILE_STRING = '💾 Ąžuolas <script>alert(1)</script> <img src=x onerror=alert(2)> {placeholder} \u0000';







// -----------------------------------------------------------
// Body mutators
// -----------------------------------------------------------
//
// Pure transforms of a fixture body into a "modified" one.
// They walk arrays and plain objects; leaves are replaced
// according to the variant (the hostile and swapped variants
// leave every `id` as it was, so the rows stay distinct). The
// list mutators understand the API's envelopes ({users: [...]},
// {documents, total}): they act on every array a top-level
// key holds.
//
// Used by:
//   - VARIANTS (below)
// -----------------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const mapLeaves = (value, fn) => {
  if (Array.isArray(value)) return value.map((v) => mapLeaves(v, fn));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapLeaves(v, fn)]));
  return fn(value);
};

// The same walk, but an `id` keeps its value: the hostile and
// swapped variants test what a page does with odd CONTENT —
// rows that all carried one id would be refused (or deduped)
// before a single hostile string reached the screen
const mapLeavesKeepIds = (value, fn) => {
  if (Array.isArray(value)) return value.map((v) => mapLeavesKeepIds(v, fn));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' ? v : mapLeavesKeepIds(v, fn)]));
  }
  return fn(value);
};

// Applies `fn` to the body when it is a list, else to every
// list one level down (the envelope's rows)
const mapLists = (body, fn) => {
  if (Array.isArray(body)) return fn(body);
  if (!isPlainObject(body)) return body;
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? fn(v) : v]));
};

export const nullLeaves = (body) => mapLeaves(body, () => null);

export const swapTypes = (body) => mapLeavesKeepIds(body, (v) => {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v === '' ? 0 : 12345;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v;
});

export const hostileStrings = (body) => mapLeavesKeepIds(body, (v) => (typeof v === 'string' ? HOSTILE_STRING : v));

export const withExtraFields = (body) => {
  const add = (o) => (isPlainObject(o) ? { ...o, extra_field: { deep: [1, 2, { x: null }] }, another: 'unexpected' } : o);
  const top = add(body);
  return Array.isArray(top) ? top.map(add) : mapLists(top, (rows) => rows.map(add));
};

export const missingFields = (body) => (isPlainObject(body) && Object.values(body).some(Array.isArray)
  ? mapLists(body, (rows) => rows.map(() => ({})))
  : (Array.isArray(body) ? body.map(() => ({})) : {}));

export const wrongContainer = (body) => (Array.isArray(body) ? {} : []);

export const hugeList = (body, n = 300) => mapLists(body, (rows) => {
  if (rows.length === 0) return rows;
  return Array.from({ length: n }, (_, i) => {
    const row = rows[i % rows.length];
    return isPlainObject(row) && 'id' in row ? { ...row, id: typeof row.id === 'number' ? 100000 + i : `${row.id}-${i}` } : row;
  });
});







// -----------------------------------------------------------
// VARIANTS
// -----------------------------------------------------------
//
// Every generated test: { name, respond(fixture) → msw
// response, expect: 'alert' | 'redirect' | 'survives' |
// 'hostile' | 'loading' | 'loaded', text? } — `text` is what
// the alert must carry.
//
// Used by:
//   - describeEndpointContract (below)
// -----------------------------------------------------------

const jsonResponse = (body, status = 200, headers) => HttpResponse.json(body, { status, headers });

export const VARIANTS = [
  { name: '500 SERVER_ERROR → alert with the translated sentence', respond: () => jsonResponse(apiError('SERVER_ERROR', 'Internal server error'), 500), expect: 'alert', text: ALERT_TEXT.serverError },
  { name: '403 FORBIDDEN → alert', respond: () => jsonResponse(apiError('FORBIDDEN', 'Forbidden'), 403), expect: 'alert', text: ALERT_TEXT.forbidden },
  { name: '404 NOT_FOUND → alert', respond: () => jsonResponse(apiError('NOT_FOUND', 'Not found'), 404), expect: 'alert', text: ALERT_TEXT.notFound },
  { name: '400 INVALID_QUERY → the backend prose (English UI)', respond: () => jsonResponse(apiError('INVALID_QUERY', VALIDATION_PROSE), 400), expect: 'alert', text: VALIDATION_PROSE },
  { name: '429 RATE_LIMITED with Retry-After → alert with the wait', respond: () => jsonResponse(apiError('RATE_LIMITED', 'Too many requests'), 429, { 'Retry-After': '30' }), expect: 'alert', text: ALERT_TEXT.rateLimited },
  { name: '402 AI_BUDGET_EXHAUSTED → alert', respond: () => jsonResponse(apiError('AI_BUDGET_EXHAUSTED', 'Budget exhausted'), 402), expect: 'alert', text: ALERT_TEXT.aiBudget },
  { name: 'an unknown code (409) → the status sentence, never the raw code', respond: () => jsonResponse(apiError('SOMETHING_NEW', 'Brand new failure'), 409), expect: 'alert', text: ALERT_TEXT.conflict },
  { name: 'HTML error page from the proxy (502) → the 502 sentence', respond: () => new HttpResponse('<html><body><h1>502 Bad Gateway</h1></body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } }), expect: 'alert', text: ALERT_TEXT.badGateway },
  { name: 'status 500 with an empty body → the 500 sentence', respond: () => new HttpResponse(null, { status: 500 }), expect: 'alert', text: ALERT_TEXT.serverError },
  { name: 'status 503 with an empty body → the 503 sentence', respond: () => new HttpResponse(null, { status: 503 }), expect: 'alert', text: ALERT_TEXT.unavailable },
  { name: 'connection dropped → the network sentence', respond: () => HttpResponse.error(), expect: 'alert', text: ALERT_TEXT.network },
  { name: '401 → hard redirect to /login, token dropped', respond: () => jsonResponse(apiError('AUTH_REQUIRED', 'Authentication required'), 401), expect: 'redirect' },
  { name: 'empty 200 body → page survives', respond: () => new HttpResponse(null, { status: 200 }), expect: 'survives' },
  { name: 'JSON null → page survives', respond: () => jsonResponse(null), expect: 'survives' },
  { name: 'a JSON string → page survives', respond: () => jsonResponse('unexpected'), expect: 'survives' },
  { name: 'a JSON number → page survives', respond: () => jsonResponse(42), expect: 'survives' },
  { name: 'wrong container (list for an object, object for a list) → page survives', respond: (fx) => jsonResponse(wrongContainer(fx)), expect: 'survives' },
  { name: 'an empty object → page survives', respond: () => jsonResponse({}), expect: 'survives' },
  { name: 'rows / object with every field missing → page survives', respond: (fx) => jsonResponse(missingFields(fx)), expect: 'survives' },
  { name: 'every leaf null → page survives', respond: (fx) => jsonResponse(nullLeaves(fx)), expect: 'survives' },
  { name: 'types swapped (numbers as strings, strings as numbers) → page survives', respond: (fx) => jsonResponse(swapTypes(fx)), expect: 'survives' },
  { name: 'unknown extra fields → page survives and still shows the data', respond: (fx) => jsonResponse(withExtraFields(fx)), expect: 'loaded' },
  { name: 'a huge list (300 rows) → page survives', respond: (fx) => jsonResponse(hugeList(fx)), expect: 'survives' },
  { name: 'hostile strings (unicode + markup) → rendered as text, never as elements', respond: (fx) => jsonResponse(hostileStrings(fx)), expect: 'hostile' },
  { name: 'a hanging request → the loading state holds, nothing crashes', respond: () => new Promise(() => {}), expect: 'loading' },
  { name: 'a slow answer (200 ms) → the data lands', respond: async (fx) => { await new Promise((r) => setTimeout(r, 200)); return jsonResponse(fx); }, expect: 'loaded' },
];







// -----------------------------------------------------------
// describeEndpointContract
// -----------------------------------------------------------
//
// Generates the matrix for one endpoint:
//
//   describeEndpointContract({
//     path: '/api/users',             // msw path, params allowed
//     method: 'get',                  // default
//     fixture: f.usersList,           // the happy body
//     render: () => renderPage(<Users authData={authData} />),
//     chrome: () => screen.getByRole('heading', { level: 1, name: 'Users' }),
//     loaded: async () => { await screen.findByText('Jonas Naudotojas'); },
//     loading: () => screen.getByRole('progressbar'),   // optional
//     alert: () => screen.findByRole('alert'),           // optional override
//     only: [...names], skip: { name: 'why' },           // optional
//     pins: { name: 'FE-BUG-123 …' },                    // it.fails
//   })
//
// `chrome` runs after every variant: the page must still show
// its own frame. `loaded` is awaited for the variants that
// end with data on screen. The variant list is VARIANTS.
//
// Used by:
//   - page tests
// -----------------------------------------------------------

export function describeEndpointContract({ path, method = 'get', fixture, render, chrome, loaded, loading, alert, only, skip = {}, pins = {} }) {

  const variants = only ? VARIANTS.filter((v) => only.includes(v.name)) : VARIANTS;

  describe(`backend contract — ${method.toUpperCase()} ${path}`, () => {

    for (const variant of variants) {
      if (variant.name in skip) {
        it.skip(`${variant.name} (skipped: ${skip[variant.name]})`, () => {});
        continue;
      }

      const runner = variant.name in pins ? it.fails : it;
      const title = variant.name in pins ? `${variant.name} — PINNED KNOWN BUG: ${pins[variant.name]}` : variant.name;

      runner(title, async () => {
        let answered = false;
        server.use(http[method](url(path), async () => {
          answered = true;
          return variant.respond(fixture);
        }));

        await render();

        if (variant.expect === 'loading') {
          // The request is in flight and stays so: the page must
          // show its loading state (when it has one) and nothing else
          await waitFor(() => expect(answered).toBe(true));
          await settle();
          if (loading) expect(loading()).toBeTruthy();
          expect(screen.queryByRole('alert')).toBeNull();
          expectNoCrash();
          if (chrome) expect(chrome()).toBeTruthy();
          return;
        }

        if (variant.expect === 'redirect') {
          await waitFor(() => expect(window.location.navigations.length).toBeGreaterThan(0));
          expect(window.location.navigations[0]).toMatch(/^\/console\/login(\?|$)/);
          expect(localStorage.getItem('complianceToken')).toBeNull();
          expectNoCrash();
          return;
        }

        if (variant.expect === 'alert') {
          const text = variant.text;
          if (alert) {
            expect(await alert()).toHaveTextContent(text);
          } else {
            await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent.includes(text))).toBe(true));
          }
          expectNoCrash();
          if (chrome) expect(chrome()).toBeTruthy();
          return;
        }

        if (variant.expect === 'loaded') {
          await loaded();
          expectNoCrash();
          if (chrome) expect(chrome()).toBeTruthy();
          return;
        }

        // 'survives' and 'hostile': wait for the answer to be
        // processed, then the page must simply still stand
        await waitFor(() => expect(answered).toBe(true));
        await settle();
        expectNoCrash();
        if (chrome) expect(chrome()).toBeTruthy();
        if (variant.expect === 'hostile') {
          expect(document.querySelector('script')).toBeNull();
          expect(document.querySelector('img[src="x"]')).toBeNull();
        }
      });
    }
  });
}







// -----------------------------------------------------------
// settle / expectNoCrash
// -----------------------------------------------------------
//
// settle() lets React flush the state updates an answered
// request triggers (a few macrotasks inside act, so the
// updates are not reported as un-acted); expectNoCrash()
// checks neither error net fired — the test boundary of
// renderPage (data-testid render-crashed) nor the router's
// RouteError card ("Something went wrong").
//
// Used by:
//   - describeEndpointContract (above), page tests, the
//     route sweep
// -----------------------------------------------------------

export async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

export function expectNoCrash() {
  const crashed = screen.queryByTestId('render-crashed');
  if (crashed) throw new Error(crashed.textContent);
  expect(screen.queryByText('Something went wrong')).toBeNull();
}
