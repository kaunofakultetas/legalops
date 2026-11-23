// -----------------------------------------------------------
//  [*] Tests — Login page (pages/Login/Login.jsx)
//
//  The sign-in card on /login, rendered the way App renders
//  it — inside the providers, outside the session check:
//
//    - the card: the h1, the subtitle, both labelled fields
//      (a username field and a current-password field for
//      password managers), the page's own validation instead
//      of the browser's, the main landmark, the email field
//      autofocused only with a fine pointer
//    - validation: both fields required, "something@
//      something" (a dotless admin@localhost passes), the
//      messages after the first submit and live after that,
//      nothing sent while a field is wrong
//    - signing in: the trimmed email and the untouched
//      password POSTed with RAW axios, the token stored, the
//      page REPLACED by a safe ?next= — every open-redirect
//      shape and /login itself go to "/" — Enter submits,
//      the busy button stays busy until the page is gone,
//      and a double click or an Enter while busy sends
//      nothing more
//    - refusals, inline and without a redirect: the wrong
//      password (a 401 — never the api client's "session
//      expired" bounce), a rate limit with and without
//      Retry-After, a validation code, a 5xx, a proxy's HTML
//      page, a dead network, a 200 without a token; the
//      error cleared when the next attempt starts and
//      re-translated after a language switch
//    - the ?expired=1 notice: a polite status (never an
//      alert) that gives way to a failure
//    - the language switcher naming the other language in
//      that language, and an already signed-in visitor sent
//      on without seeing the form
//    - both languages
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import Login from '@/pages/Login/Login';
import { renderPage } from '../support/render';
import { signIn, TOKEN_KEY } from '../support/auth';
import { server, url, given, apiError } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import { mediaQueryMatches } from '../support/setup';
import * as f from '../support/backend/fixtures';


// The login page on its route, as App renders it
const mountLogin = (route = '/login', options = {}) => renderPage(<Login />, { route, path: '/login', ...options });

// The two fields and the button, by their accessible names in
// either language
const emailField = () => screen.getByRole('textbox', { name: /^(Email|El\. paštas)/ });
const passwordField = () => screen.getByLabelText(/^(Password|Slaptažodis)/);
const submitButton = () => screen.getByRole('button', { name: /^(Sign in|Prisijungti)$/ });

// Types both fields and presses the submit button
const signInWith = async (user, email = 'jonas@example.lt', password = 'Slaptas-Žodis-1') => {
  if (email) await user.type(emailField(), email);
  if (password) await user.type(passwordField(), password);
  await user.click(submitButton());
};

// Counts the login POSTs while answering them with `respond`
const countLogins = (respond) => {
  const calls = { count: 0 };
  server.use(http.post(url('/api/auth/login'), async (info) => {
    calls.count += 1;
    return respond(info);
  }));
  return calls;
};

const refusal = () => screen.findByRole('alert');







// -----------------------------------------------------------
// the card
// -----------------------------------------------------------

describe('Login — the card', () => {

  it('shows the heading, the subtitle, both labelled fields and the submit button inside the main landmark', () => {
    mountLogin();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(within(main).getByText('Ask about the law, upload your company\'s documents and get a compliance report.')).toBeInTheDocument();
    expect(emailField()).toHaveValue('');
    expect(passwordField()).toHaveValue('');
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });


  it('marks the fields up for password managers and phones: a required username email field, a required current password', () => {
    mountLogin();
    expect(emailField()).toHaveAttribute('type', 'email');
    expect(emailField()).toHaveAttribute('autocomplete', 'username');
    expect(emailField()).toHaveAttribute('inputmode', 'email');
    expect(emailField()).toBeRequired();
    expect(passwordField()).toHaveAttribute('type', 'password');
    expect(passwordField()).toHaveAttribute('autocomplete', 'current-password');
    expect(passwordField()).toBeRequired();
  });


  it('validates on its own (noValidate) so the messages speak the UI language', () => {
    mountLogin();
    expect(emailField().closest('form')).toHaveAttribute('novalidate');
  });


  it('focuses the email field with a fine pointer (a mouse) only — on a phone the keyboard would cover the card', async () => {
    mediaQueryMatches('(pointer: fine)');
    try {
      mountLogin();
      await waitFor(() => expect(emailField()).toHaveFocus());
    } finally {
      mediaQueryMatches('(pointer: fine)', false);
    }
  });


  it('leaves the focus alone with a coarse pointer', async () => {
    mountLogin();
    await settle(20);
    expect(emailField()).not.toHaveFocus();
  });
});







// -----------------------------------------------------------
// validation
// -----------------------------------------------------------

describe('Login — validation', () => {

  it('an empty submit asks for both fields, marks them invalid and sends nothing', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('admin@example.lt'));
    const { user } = mountLogin();
    await user.click(submitButton());
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordField()).toHaveAttribute('aria-invalid', 'true');
    expect(emailField()).toHaveAccessibleDescription('Enter your email address');
    expect(passwordField()).toHaveAccessibleDescription('Enter your password');
    await settle(20);
    expect(calls).toHaveLength(0);
  });


  it('says nothing before the first submit, however the fields look', async () => {
    const { user } = mountLogin();
    await user.type(emailField(), 'not-an-address');
    expect(screen.queryByText('Enter a valid email address')).toBeNull();
    expect(emailField()).toHaveAttribute('aria-invalid', 'false');
  });


  it('refuses an address without "@", then updates the message live while typing', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('x'));
    const { user } = mountLogin();
    await signInWith(user, 'jonas.example.lt');
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    await user.clear(emailField());
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    await user.type(emailField(), 'jonas@example.lt');
    expect(screen.queryByText(/Enter (your|a valid) email address/)).toBeNull();
    expect(emailField()).toHaveAttribute('aria-invalid', 'false');
    expect(calls).toHaveLength(0);
  });


  it.each(['a b@example.lt', '@example.lt', 'jonas@', 'jonas@@example.lt', '   '])('refuses "%s"', async (email) => {
    const calls = given.capture('post', '/api/auth/login', f.login('x'));
    const { user } = mountLogin();
    await signInWith(user, email);
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    await settle(20);
    expect(calls).toHaveLength(0);
  });


  it('accepts a dotless address such as admin@localhost — the backend does too', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('admin@localhost'));
    const { user } = mountLogin();
    await signInWith(user, 'admin@localhost', 'x');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.email).toBe('admin@localhost');
  });


  it('the letterhead is the way out to the public site — a plain link to the root, named in both languages', () => {
    const first = mountLogin();
    expect(screen.getByRole('link', { name: 'Compliance assistant — about the product' }).getAttribute('href')).toBe('/');
    first.unmount();
    mountLogin('/login', { locale: 'lt' });
    expect(screen.getByRole('link', { name: 'Atitikties asistentas — apie produktą' }).getAttribute('href')).toBe('/');
  });


  it('speaks Lithuanian', async () => {
    const { user } = mountLogin('/login', { locale: 'lt' });
    await user.click(submitButton());
    expect(screen.getByText('Įveskite el. pašto adresą')).toBeInTheDocument();
    expect(screen.getByText('Įveskite slaptažodį')).toBeInTheDocument();
    await user.type(emailField(), 'jonas');
    expect(screen.getByText('Įveskite teisingą el. pašto adresą')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// signing in
// -----------------------------------------------------------

describe('Login — signing in', () => {

  it('POSTs the trimmed email and the untouched password as JSON, stores the token and replaces the page with "/"', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('jonas@example.lt'));
    const { user } = mountLogin();
    await signInWith(user, '  Jonas@Example.lt ', ' tarpai aplink ');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/']));
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ email: 'Jonas@Example.lt', password: ' tarpai aplink ' });
    expect(calls[0].headers['content-type']).toMatch(/^application\/json/);
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(localStorage.getItem(TOKEN_KEY)).toBe(f.SESSION_TOKEN);
  });


  it('replaces (never pushes) the page, so Back cannot return to the form', async () => {
    const { user } = mountLogin();
    const replace = vi.spyOn(window.location, 'replace');
    const assign = vi.spyOn(window.location, 'assign');
    await signInWith(user);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/console/'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });


  it('returns to the page the redirect remembered in ?next=, query and hash included', async () => {
    const { user } = mountLogin(`/login?next=${encodeURIComponent('/companies/c1?tab=roles#r2')}&expired=1`);
    await signInWith(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/companies/c1?tab=roles#r2']));
  });


  it.each([
    ['//evil.example/x', 'a protocol-relative URL'],
    ['https://evil.example/', 'an absolute URL'],
    ['/\\evil.example', 'a backslash trick'],
    ['javascript:alert(1)', 'a script URL'],
    ['/login', 'the login page itself'],
    ['/login?next=%2Fusers', 'a nested login'],
    ['users', 'a relative path'],
    ['', 'an empty value'],
  ])('refuses %s (%s) as the way back and goes home', async (next) => {
    const { user } = mountLogin(`/login?next=${encodeURIComponent(next)}`);
    await signInWith(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/']));
  });


  it('Enter in the password field submits', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('jonas@example.lt'));
    const { user } = mountLogin();
    await user.type(emailField(), 'jonas@example.lt');
    await user.type(passwordField(), 'Slaptas{Enter}');
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/']));
  });


  it('while the request runs: the button is busy (disabled, its spinner named after it); a second click or an Enter sends nothing', async () => {
    const calls = countLogins(() => new Promise(() => {}));
    const { user } = mountLogin();
    await signInWith(user);
    await waitFor(() => expect(submitButton()).toBeDisabled());
    expect(screen.getByRole('progressbar', { name: 'Sign in' })).toBeInTheDocument();
    fireEvent.click(submitButton());
    await user.type(passwordField(), '{Enter}');
    await settle(50);
    expect(calls.count).toBe(1);
  });


  it('stays busy after success until the page is gone', async () => {
    const { user } = mountLogin();
    await signInWith(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/']));
    expect(submitButton()).toBeDisabled();
  });


  it('the language switch never submits the form', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('x'));
    const { user } = mountLogin();
    await user.click(screen.getByRole('button', { name: 'Lietuvių' }));
    expect(screen.queryByText('Įveskite el. pašto adresą')).toBeNull();
    await settle(20);
    expect(calls).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// refusals
// -----------------------------------------------------------

describe('Login — a refused sign-in', () => {

  it('a wrong password (401 INVALID_CREDENTIALS) is said inline — no redirect, no token, the form usable again', async () => {
    given.apiError('post', '/api/auth/login', 'INVALID_CREDENTIALS', { status: 401, error: 'Invalid email or password' });
    const { user } = mountLogin('/login?next=%2Fusers');
    await signInWith(user, 'jonas@example.lt', 'neteisingas');
    expect(await refusal()).toHaveTextContent('Wrong email address or password.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Invalid email or password');
    await settle(50);
    expect(window.location.navigations).toEqual([]);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(submitButton()).toBeEnabled();
    expect(emailField()).toHaveValue('jonas@example.lt');
    expect(passwordField()).toHaveValue('neteisingas');
  });


  it.each([
    ['429 RATE_LIMITED with Retry-After — how long to wait', () => HttpResponse.json(apiError('RATE_LIMITED', 'Too many login attempts'), { status: 429, headers: { 'Retry-After': '30' } }), 'Too many attempts. Wait a moment and try again. Try again in 30 s.'],
    ['429 RATE_LIMITED without the header', () => HttpResponse.json(apiError('RATE_LIMITED', 'Too many login attempts'), { status: 429 }), 'Too many attempts. Wait a moment and try again.'],
    ['400 MISSING_FIELDS — the backend\'s own English prose', () => HttpResponse.json(apiError('MISSING_FIELDS', 'email and password are required'), { status: 400 }), 'email and password are required'],
    ['500 SERVER_ERROR', () => HttpResponse.json(apiError('SERVER_ERROR', 'Internal server error'), { status: 500 }), 'Server error. Try again later.'],
    ['a proxy\'s HTML 502', () => new HttpResponse('<html><body><h1>502 Bad Gateway</h1></body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } }), 'The server is temporarily unreachable. Try again.'],
    ['a dead network', () => HttpResponse.error(), 'Could not reach the server. Check your internet connection.'],
    ['a 200 without a token', () => HttpResponse.json({ user: f.me }), 'Something unexpected went wrong.'],
    ['a 200 with an empty body', () => new HttpResponse(null, { status: 200 }), 'Something unexpected went wrong.'],
  ])('%s', async (_, respond, text) => {
    countLogins(respond);
    const { user } = mountLogin();
    await signInWith(user);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
    await settle(30);
    expect(screen.getByRole('alert').textContent).toBe(text);
    expect(window.location.navigations).toEqual([]);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(submitButton()).toBeEnabled();
  });


  it('clears the error the moment the next attempt starts', async () => {
    let answer = () => HttpResponse.json(apiError('INVALID_CREDENTIALS'), { status: 401 });
    countLogins(() => answer());
    const { user } = mountLogin();
    await signInWith(user);
    await refusal();
    answer = () => new Promise(() => {});
    await user.click(submitButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(submitButton()).toBeDisabled();
  });


  it('a second attempt that works signs in', async () => {
    given.sequence('post', '/api/auth/login', [{ status: 401, body: apiError('INVALID_CREDENTIALS') }, { body: f.login('jonas@example.lt') }]);
    const { user } = mountLogin('/login?next=%2Fjobs');
    await signInWith(user, 'jonas@example.lt', 'neteisingas');
    await refusal();
    await user.clear(passwordField());
    await user.type(passwordField(), 'teisingas{Enter}');
    await waitFor(() => expect(window.location.navigations).toEqual(['/jobs']));
    expect(localStorage.getItem(TOKEN_KEY)).toBe(f.SESSION_TOKEN);
  });


  it('re-translates the error after a language switch', async () => {
    given.apiError('post', '/api/auth/login', 'INVALID_CREDENTIALS', { status: 401 });
    const { user } = mountLogin();
    await signInWith(user);
    expect(await refusal()).toHaveTextContent('Wrong email address or password.');
    await user.click(screen.getByRole('button', { name: 'Lietuvių' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Neteisingas el. pašto adresas arba slaptažodis.');
  });


  it('speaks Lithuanian — the backend\'s English prose never shows', async () => {
    given.apiError('post', '/api/auth/login', 'MISSING_FIELDS', { status: 400, error: 'email and password are required' });
    const { user } = mountLogin('/login', { locale: 'lt' });
    await signInWith(user);
    expect(await refusal()).toHaveTextContent('Užpildykite visus privalomus laukus.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('required');
  });


  it('a Lithuanian wrong password', async () => {
    given.apiError('post', '/api/auth/login', 'INVALID_CREDENTIALS', { status: 401 });
    const { user } = mountLogin('/login', { locale: 'lt' });
    await signInWith(user);
    expect(await refusal()).toHaveTextContent('Neteisingas el. pašto adresas arba slaptažodis.');
  });
});







// -----------------------------------------------------------
// the ?expired=1 notice
// -----------------------------------------------------------

describe('Login — the "session ended" notice', () => {

  it('tells a visitor sent back by a dead session why — a polite status, not an alert', () => {
    mountLogin('/login?next=%2Freports&expired=1');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Your session has ended. Sign in again — you will return to where you were.');
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('is absent on a plain visit and for any other flag value', () => {
    mountLogin('/login?next=%2Freports&expired=0');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Your session has ended/)).toBeNull();
  });


  it('gives way to the failure of an attempt', async () => {
    given.apiError('post', '/api/auth/login', 'INVALID_CREDENTIALS', { status: 401 });
    const { user } = mountLogin('/login?expired=1');
    await signInWith(user);
    await refusal();
    expect(screen.queryByText(/Your session has ended/)).toBeNull();
  });


  it('speaks Lithuanian', () => {
    mountLogin('/login?expired=1', { locale: 'lt' });
    expect(screen.getByRole('status')).toHaveTextContent('Sesija baigėsi. Prisijunkite iš naujo — grįšite ten, kur buvote.');
  });
});







// -----------------------------------------------------------
// languages
// -----------------------------------------------------------

describe('Login — the language switcher', () => {

  it('stands in the letterhead, on the wordmark\'s line — not under the form', () => {
    mountLogin();
    const switcher = screen.getByRole('button', { name: 'Lietuvių' });
    const wordmark = screen.getByRole('link', { name: 'Compliance assistant — about the product' });
    expect(switcher.parentElement).toBe(wordmark.parentElement);
    expect(switcher.parentElement.className).toContain('justify-between');
    expect(switcher.compareDocumentPosition(submitButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(submitButton().closest('form').contains(switcher)).toBe(false);
  });


  it('names the other language in that language and switches the whole card live, remembering it', async () => {
    const { user } = mountLogin();
    const switcher = screen.getByRole('button', { name: 'Lietuvių' });
    expect(switcher).toHaveAttribute('lang', 'lt');
    expect(screen.queryByRole('button', { name: 'English' })).toBeNull();
    await user.click(switcher);
    expect(screen.getByRole('heading', { level: 1, name: 'Prisijungimas' })).toBeInTheDocument();
    expect(screen.getByText('Užduokite klausimą apie teisės aktus, įkelkite įmonės dokumentus ir gaukite atitikties ataskaitą.')).toBeInTheDocument();
    expect(emailField()).toHaveAccessibleName(/^El\. paštas/);
    expect(passwordField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prisijungti' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
    expect(document.cookie).toMatch(/(^|; )locale=lt(;|$)/);
    expect(document.documentElement.lang).toBe('lt');
  });


  it('keeps what was typed across a switch', async () => {
    const { user } = mountLogin();
    await user.type(emailField(), 'jonas@example.lt');
    await user.click(screen.getByRole('button', { name: 'Lietuvių' }));
    expect(emailField()).toHaveValue('jonas@example.lt');
  });


  it('starts in Lithuanian from the cookie', () => {
    mountLogin('/login', { locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Prisijungimas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// an already signed-in visitor
// -----------------------------------------------------------

describe('Login — a visitor who is signed in already', () => {

  it('is sent on to ?next= at once, without the form and without a request', async () => {
    const calls = given.capture('post', '/api/auth/login', f.login('x'));
    signIn();
    mountLogin('/login?next=%2Fjobs%3Fstatus%3Dfailed');
    await waitFor(() => expect(window.location.navigations).toEqual(['/jobs?status=failed']));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    expect(calls).toHaveLength(0);
  });


  it('goes home without ?next=, and for an unsafe one', async () => {
    signIn();
    mountLogin('/login?next=%2F%2Fevil.example');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/']));
  });
});
