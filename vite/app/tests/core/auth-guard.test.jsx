// -----------------------------------------------------------
//  [*] Tests — AuthGuard.jsx (AuthProvider, useAuth)
//
//  The one session check at app start, GET /api/auth/me with
//  the stored bearer, and its outcomes kept apart:
//
//    - no token        → straight to /login?next=<here>, no
//                        request, no "expired" notice
//    - 401             → the api client drops the token and
//                        replaces the page with
//                        /login?next=<here>&expired=1 — the
//                        one redirect, also when a Retry
//                        meets it (the guard adds none)
//    - 5xx / network   → the token STAYS; the full-page
//                        "Server unreachable" card with the
//                        translated cause, "HTTP <status> ·
//                        <CODE>" in the details, Retry (busy
//                        while it runs) and "Sign in again"
//    - a network error → retried once before the card
//    - a 200 that is no account (an empty body, null, the
//      SPA's index.html from a misrouted proxy, a list) →
//      the card too, never an app signed in as nobody
//
//  useAuth is null until the check answers; the check runs
//  ONCE per app start — no refetch on a re-render, a
//  navigation, a language switch, a window focus or a
//  reconnect. The contract matrix runs GET /api/auth/me
//  through the whole app (renderApp on /account, a page that
//  fetches nothing else).
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '@/AuthGuard';
import { renderPage, renderApp } from '../support/render';
import { signIn, TOKEN_KEY, userAuthData } from '../support/auth';
import { server, given, url, apiError } from '../support/backend/server';
import { describeEndpointContract, settle, nullLeaves, swapTypes } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';


// What the card says after the translated cause
const STILL_SIGNED_IN = 'You are still signed in — once the server is back you continue where you left off.';


// Shows what useAuth hands the tree under the provider
function SessionProbe() {
  const auth = useAuth();
  return <p data-testid="session">{auth ? `signed in as ${auth.email} (${auth.role})` : 'no session yet'}</p>;
}

// The provider around the probe in the production frame, on
// `route` (the page a redirect must remember)
const mount = (route = '/companies', options = {}) => renderPage(<SessionProbe />, { route, wrapper: AuthProvider, ...options });

// Counts the session checks while answering them with `respond`
const countChecks = (respond = () => HttpResponse.json(f.me)) => {
  const calls = { count: 0 };
  server.use(http.get(url('/api/auth/me'), async (info) => {
    calls.count += 1;
    return respond(info, calls.count);
  }));
  return calls;
};

// A check that waits for release() before answering the admin
const gatedCheck = () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = countChecks(async () => {
    await gate;
    return HttpResponse.json(f.me);
  });
  return { calls, release: () => release() };
};

const card = () => screen.findByRole('alert');
const cardHeading = () => screen.queryByRole('heading', { level: 1, name: 'Server unreachable' });
const detailsOf = (alert) => alert.querySelector('details pre')?.textContent ?? null;







// -----------------------------------------------------------
// no token
// -----------------------------------------------------------

describe('AuthProvider — no token', () => {

  it('asks nobody: straight to /login?next=<here> (path, query and hash), no "expired" notice, a spinner meanwhile', async () => {
    const checks = countChecks();
    mount('/companies/c1?tab=roles#r2');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fcompanies%2Fc1%3Ftab%3Droles%23r2']));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('session')).toBeNull();
    await settle(50);
    expect(checks.count).toBe(0);
    expect(window.location.navigations).toHaveLength(1);
  });


  it('leaves the start page out of ?next= — "/" is where the login lands anyway', async () => {
    mount('/');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
  });


  it('through the whole app: a signed-out deep link never reaches the page or the backend', async () => {
    const checks = countChecks();
    const users = given.capture('get', '/api/users', { users: f.users });
    await renderApp({ route: '/users', signedIn: false });
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fusers']));
    await settle(100);
    expect(checks.count).toBe(0);
    expect(users).toHaveLength(0);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});







// -----------------------------------------------------------
// the check answers
// -----------------------------------------------------------

describe('AuthProvider — the check answers', () => {

  it('sends the stored bearer once and hands the account to the tree', async () => {
    const calls = given.capture('get', '/api/auth/me', f.me);
    signIn('bearer-123');
    mount();
    expect(await screen.findByText('signed in as admin@example.lt (admin)')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.authorization).toBe('Bearer bearer-123');
    expect(window.location.navigations).toEqual([]);
  });


  it('useAuth is null while the check runs — the children render, the session does not exist yet', async () => {
    const { calls, release } = gatedCheck();
    signIn();
    mount();
    expect(await screen.findByText('no session yet')).toBeInTheDocument();
    await waitFor(() => expect(calls.count).toBe(1));
    await settle(50);
    expect(screen.getByTestId('session')).toHaveTextContent('no session yet');
    release();
    expect(await screen.findByText('signed in as admin@example.lt (admin)')).toBeInTheDocument();
  });


  it('hands over a plain user\'s session just the same', async () => {
    given.json('get', '/api/auth/me', userAuthData);
    signIn();
    mount();
    expect(await screen.findByText('signed in as jonas@example.lt (user)')).toBeInTheDocument();
  });


  it('keeps every field of the account — PageWrapper passes it on as authData', async () => {
    let seen = null;
    function Keeper() {
      seen = useAuth();
      return null;
    }
    signIn();
    renderPage(<Keeper />, { wrapper: AuthProvider });
    await waitFor(() => expect(seen).toEqual(f.me));
  });
});







// -----------------------------------------------------------
// a 401
// -----------------------------------------------------------

describe('AuthProvider — a 401', () => {

  it('is the api client\'s: the token is dropped and the page replaced by /login?next=<here>&expired=1 — no card, no retry', async () => {
    const checks = countChecks(() => HttpResponse.json(apiError('AUTH_REQUIRED', 'Authentication required'), { status: 401 }));
    signIn('dead-token');
    mount('/reports/r1?tab=findings');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Freports%2Fr1%3Ftab%3Dfindings&expired=1']));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    await settle(50);
    expect(checks.count).toBe(1);
    expect(cardHeading()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('session')).toHaveTextContent('no session yet');
  });


  it('a page\'s own 401 later on: exactly one redirect, the "expired" one — the guard does not add a second', async () => {
    given.unauthorized('get', '/api/users');
    await renderApp({ route: '/users' });
    await waitFor(() => expect(window.location.navigations.length).toBeGreaterThan(0));
    await settle(100);
    expect(window.location.navigations).toEqual(['/console/login?next=%2Fusers&expired=1']);
  });
});







// -----------------------------------------------------------
// the server cannot answer
// -----------------------------------------------------------

describe('AuthProvider — the server cannot answer', () => {

  it('500: the "Server unreachable" card with the translated cause and "HTTP 500 · SERVER_ERROR"; the token stays, no retry', async () => {
    const checks = countChecks(() => HttpResponse.json(apiError('SERVER_ERROR', 'Internal server error'), { status: 500 }));
    signIn('alive');
    mount();
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: 'Server unreachable' })).toBeInTheDocument();
    expect(within(alert).getByText(`Server error. Try again later. ${STILL_SIGNED_IN}`)).toBeInTheDocument();
    expect(within(alert).getByText('Technical details')).toBeInTheDocument();
    expect(detailsOf(alert)).toBe('HTTP 500 · SERVER_ERROR');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(within(alert).getByRole('button', { name: 'Sign in again' })).toBeEnabled();
    expect(screen.queryByTestId('session')).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('alive');
    expect(window.location.navigations).toEqual([]);
    await settle(50);
    expect(checks.count).toBe(1);
  });


  it('never shows the backend\'s English prose — the code\'s own sentence, in the details only the code', async () => {
    given.apiError('get', '/api/auth/me', 'SERVER_ERROR', { status: 500, error: 'psycopg.OperationalError: connection refused' });
    signIn();
    mount();
    const alert = await card();
    expect(alert).not.toHaveTextContent('psycopg');
    expect(alert).toHaveTextContent('Server error. Try again later.');
  });


  it('a proxy\'s HTML 502: the 502 sentence, "HTTP 502" without a code', async () => {
    given.html('get', '/api/auth/me');
    signIn();
    mount();
    const alert = await card();
    expect(alert).toHaveTextContent(`The server is temporarily unreachable. Try again. ${STILL_SIGNED_IN}`);
    expect(detailsOf(alert)).toBe('HTTP 502');
  });


  it('an empty 503: the 503 sentence', async () => {
    given.empty('get', '/api/auth/me', 503);
    signIn();
    mount();
    const alert = await card();
    expect(alert).toHaveTextContent('The service is temporarily unavailable. Try again later.');
    expect(detailsOf(alert)).toBe('HTTP 503');
  });


  it('a network error is retried once, then the card says so — without a details box (there was no answer)', async () => {
    const checks = countChecks(() => HttpResponse.error());
    signIn('alive');
    mount();
    const alert = await card();
    expect(alert).toHaveTextContent(`Could not reach the server. Check your internet connection. ${STILL_SIGNED_IN}`);
    expect(within(alert).queryByText('Technical details')).toBeNull();
    expect(checks.count).toBe(2);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('alive');
  });


  it('a network blip the one retry heals never shows the card', async () => {
    const checks = countChecks((_, n) => (n === 1 ? HttpResponse.error() : HttpResponse.json(f.me)));
    signIn();
    mount();
    expect(await screen.findByText('signed in as admin@example.lt (admin)')).toBeInTheDocument();
    expect(checks.count).toBe(2);
    expect(cardHeading()).toBeNull();
  });


  it('"Try again" runs the check once more and lets the app in when it succeeds', async () => {
    given.sequence('get', '/api/auth/me', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: f.me }]);
    signIn();
    const { user } = mount();
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('signed in as admin@example.lt (admin)')).toBeInTheDocument();
    expect(cardHeading()).toBeNull();
    expect(window.location.navigations).toEqual([]);
  });


  it('while the retry runs the card stays — the same button, busy (disabled, its spinner named after it), keeps the focus', async () => {
    countChecks((_, n) => (n === 1 ? HttpResponse.json(apiError('SERVER_ERROR'), { status: 500 }) : new Promise(() => {})));
    signIn();
    const { user } = mount();
    const alert = await card();
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    await user.click(retry);
    await waitFor(() => expect(retry).toBeDisabled());
    expect(retry).toBeInTheDocument();
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByRole('progressbar', { name: 'Try again' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(alert).getByRole('button', { name: 'Sign in again' })).toBeEnabled();
    expect(screen.queryByTestId('session')).toBeNull();
  });


  it('a failed retry leaves the very same card in place (no spinner flash in between)', async () => {
    const checks = countChecks(() => HttpResponse.json(apiError('SERVER_ERROR'), { status: 500 }));
    signIn();
    const { user } = mount();
    const alert = await card();
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    await user.click(retry);
    await waitFor(() => expect(checks.count).toBe(2));
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByRole('alert')).toBe(alert);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });


  it('a retry that fails again keeps the card, now with the new cause', async () => {
    given.sequence('get', '/api/auth/me', [{ status: 500, body: apiError('SERVER_ERROR') }, { status: 503 }]);
    signIn();
    const { user } = mount();
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The service is temporarily unavailable. Try again later.'));
    expect(detailsOf(screen.getByRole('alert'))).toBe('HTTP 503');
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' })).toBeEnabled();
  });


  it('a retry that meets a 401 hands over to the api client: token dropped, /login?next=<here>&expired=1', async () => {
    given.sequence('get', '/api/auth/me', [{ status: 500, body: apiError('SERVER_ERROR') }, { status: 401, body: apiError('AUTH_REQUIRED') }]);
    signIn('stale');
    const { user } = mount('/reports');
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Freports&expired=1']));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });


  it('"Sign in again" drops the token and replaces the page with /login?next=<here> — no "expired" notice', async () => {
    given.apiError('get', '/api/auth/me', 'SERVER_ERROR', { status: 500 });
    signIn('alive');
    const { user } = mount('/users?role=admin');
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Sign in again' }));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.location.navigations).toEqual(['/console/login?next=%2Fusers%3Frole%3Dadmin']);
  });


  it('speaks Lithuanian', async () => {
    given.apiError('get', '/api/auth/me', 'SERVER_ERROR', { status: 500 });
    signIn();
    mount('/companies', { locale: 'lt' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: 'Serveris nepasiekiamas' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('Serverio klaida. Bandykite dar kartą vėliau. Jūs likote prisijungę — kai serveris vėl veiks, tęsite ten, kur baigėte.');
    expect(within(alert).getByText('Techninė informacija')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Bandyti dar kartą' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Prisijungti iš naujo' })).toBeInTheDocument();
  });


  it('through the whole app: the card replaces the frame, and Retry brings the page', async () => {
    given.sequence('get', '/api/auth/me', [{ status: 502, html: '<html><body>Bad Gateway</body></html>' }, { body: f.me }]);
    const { user } = await renderApp({ route: '/account' });
    const alert = await card();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// an answer that is no account
// -----------------------------------------------------------
//
// A 200 whose body is not an account must not let the app in
// as nobody (a spinner for ever on null / an empty body, the
// pages rendered for a role-less "user" on anything else):
// the card with the generic sentence, "HTTP 200" as the
// technical detail, no retry of its own — Retry is the
// user's, and it recovers once the answer is right.
// -----------------------------------------------------------

describe('AuthProvider — an answer that is no account', () => {

  it.each([
    ['an empty body', () => new HttpResponse(null, { status: 200 })],
    ['JSON null', () => HttpResponse.json(null)],
    ['a JSON string', () => HttpResponse.json('unexpected')],
    ['a JSON number', () => HttpResponse.json(42)],
    ['a list', () => HttpResponse.json([f.me])],
    ['an empty object', () => HttpResponse.json({})],
    ['every field null', () => HttpResponse.json(nullLeaves(f.me))],
    ['the types swapped', () => HttpResponse.json(swapTypes(f.me))],
    ['the SPA\'s index.html from a misrouted proxy', () => new HttpResponse('<!doctype html><html><body><div id="root"></div></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })],
  ])('%s → the card, never a session', async (_, respond) => {
    const checks = countChecks(respond);
    signIn('alive');
    mount();
    const alert = await card();
    expect(alert).toHaveTextContent(`Something unexpected went wrong. ${STILL_SIGNED_IN}`);
    expect(detailsOf(alert)).toBe('HTTP 200');
    expect(screen.queryByTestId('session')).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('alive');
    await settle(50);
    expect(checks.count).toBe(1);
  });


  it('Retry lets the app in once the answer is an account', async () => {
    given.sequence('get', '/api/auth/me', [{ body: {} }, { body: f.me }]);
    signIn();
    const { user } = mount();
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('signed in as admin@example.lt (admin)')).toBeInTheDocument();
  });


  it('through the whole app: no page renders for a session of nulls', async () => {
    given.json('get', '/api/auth/me', nullLeaves(f.me));
    await renderApp({ route: '/account' });
    expect(await card()).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByRole('heading', { level: 1, name: 'Account' })).toBeNull();
  });
});







// -----------------------------------------------------------
// one check per app start
// -----------------------------------------------------------

describe('AuthProvider — one check per app start', () => {

  it('never re-checks on a re-render, a window focus, a visibility change or a reconnect — not even once the answer is stale', async () => {
    const checks = countChecks();
    signIn();
    const { queryClient, rerender } = mount();
    await screen.findByText('signed in as admin@example.lt (admin)');
    // Stale on purpose: a refetch-on-focus would fire now
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'], refetchType: 'none' });
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('online'));
      });
      rerender(<p>re-rendered</p>);
      await settle(100);
      expect(checks.count).toBe(1);
    } finally {
      focusManager.setFocused(undefined);
      onlineManager.setOnline(true);
    }
  });


  it('does not poll — an hour on the page sends no second check', async () => {
    const checks = countChecks();
    // The query subscribes on mount, so the fake clock must be
    // in place before the render
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    signIn();
    mount();
    await screen.findByText('signed in as admin@example.lt (admin)');
    await act(async () => { vi.advanceTimersByTime(60 * 60 * 1000); });
    vi.useRealTimers();
    await settle(50);
    expect(checks.count).toBe(1);
  });


  it('through the whole app: navigating between pages and switching the language keep the one check', async () => {
    const checks = countChecks();
    const { router, user } = await renderApp({ route: '/account' });
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    await act(async () => { await router.navigate('/jobs'); });
    await screen.findByRole('heading', { level: 1, name: 'Jobs' });
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    await screen.findByRole('heading', { level: 1, name: 'Užduotys' });
    await act(async () => { await router.navigate('/account'); });
    await screen.findByRole('heading', { level: 1, name: 'Paskyra' });
    await settle(50);
    expect(checks.count).toBe(1);
  });
});







// -----------------------------------------------------------
// useAuth
// -----------------------------------------------------------

describe('useAuth', () => {

  it('is null outside the provider', () => {
    let value = 'unset';
    function Outside() {
      value = useAuth();
      return null;
    }
    render(<Outside />);
    expect(value).toBeNull();
  });
});







// -----------------------------------------------------------
// backend contract
// -----------------------------------------------------------
//
// GET /api/auth/me through the whole app on /account (a page
// with no GET of its own). Its "chrome" is one of the three
// states the guard may leave the app in: the page (its h1),
// the card, or the spinner of a check still running — never
// a crash, a blank screen or a route-error card. A 200 that
// is no account ends on the card (see the section above).
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/auth/me',
  fixture: f.me,
  render: () => renderApp({ route: '/account' }),
  chrome: () => screen.queryByRole('heading', { level: 1, name: 'Account' }) ?? cardHeading() ?? screen.queryByRole('progressbar'),
  loaded: async () => {
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    expect(within(screen.getByRole('main')).getByText('admin@example.lt')).toBeInTheDocument();
  },
  loading: () => screen.getByRole('progressbar'),
});
