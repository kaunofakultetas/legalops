// -----------------------------------------------------------
//  [*] Tests — api/client.js, auth/token.js, auth/session.js
//
//  The one axios instance every request goes through: the
//  bearer it attaches, the 401 → /login?next=…&expired=1 hard
//  redirect with the token dropped (and the promise that
//  never settles behind it), the opt-outs (skipAuthRedirect,
//  silent), the de-duplicated translated toast for a failed
//  mutation and the silence for a failed GET or a cancel;
//  the token store; the ?next= sanitiser that keeps the login
//  page from becoming an open redirect.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import toast from 'react-hot-toast';
import api, { errorText } from '@/api/client';
import { clearToken, getToken, setToken } from '@/auth/token';
import { loginUrl, redirectToLogin, safeNext } from '@/auth/session';
import { given, apiError } from '../support/backend/server';
import { installLocationDouble } from '../support/location';


// Resolves with 'pending' when the promise has not settled
// within a few macrotasks — the 401 path never settles
const stateOf = async (promise) => Promise.race([
  promise.then(() => 'resolved', () => 'rejected'),
  new Promise((resolve) => setTimeout(() => resolve('pending'), 100)),
]);







// -----------------------------------------------------------
// token store
// -----------------------------------------------------------

describe('auth/token', () => {

  it('keeps one token under one localStorage key', () => {
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(getToken()).toBe('abc');
    expect(localStorage.getItem('complianceToken')).toBe('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });
});







// -----------------------------------------------------------
// session helpers
// -----------------------------------------------------------

describe('auth/session', () => {

  it('safeNext keeps same-origin paths with their query and hash', () => {
    expect(safeNext('/companies/1?tab=reports#top')).toBe('/companies/1?tab=reports#top');
    expect(safeNext('/console/reports/1?tab=plan')).toBe('/console/reports/1?tab=plan');
  });


  it('safeNext turns every open-redirect shape, the bare root and the login page itself into the console\'s first page', () => {
    for (const value of ['https://evil.example/', '//evil.example/x', '/\\evil.example', '\\\\evil', 'javascript:alert(1)',
      'companies', '', null, undefined, 42, '/', '/console/login', '/console/login?next=/x', '/console/login/', '/CONSOLE/LOGIN',
      '/console/login#top', '/login', '/login?next=/x', '/login/', '/LOGIN', '/Login/', '/login#top']) {
      expect(safeNext(value), String(value)).toBe('/console/');
    }
  });


  it('loginUrl carries next (unless it is the console\'s first page) and the expired flag', () => {
    expect(loginUrl()).toBe('/console/login');
    expect(loginUrl({ next: '/' })).toBe('/console/login');
    expect(loginUrl({ next: '/console/' })).toBe('/console/login');
    expect(loginUrl({ next: '/console' })).toBe('/console/login');
    expect(loginUrl({ next: '/reports/1' })).toBe('/console/login?next=%2Freports%2F1');
    expect(loginUrl({ next: '/reports/1', expired: true })).toBe('/console/login?next=%2Freports%2F1&expired=1');
    expect(loginUrl({ next: '//evil.example', expired: true })).toBe('/console/login?expired=1');
  });


  it('redirectToLogin REPLACES the page (no history entry) and remembers path, query and hash', () => {
    const location = installLocationDouble('/companies/c1?tab=roles#r2');
    const replace = vi.spyOn(location, 'replace');
    redirectToLogin({ expired: true });
    expect(replace).toHaveBeenCalledWith('/console/login?next=%2Fcompanies%2Fc1%3Ftab%3Droles%23r2&expired=1');
    expect(location.navigations).toEqual(['/console/login?next=%2Fcompanies%2Fc1%3Ftab%3Droles%23r2&expired=1']);
  });
});







// -----------------------------------------------------------
// the bearer
// -----------------------------------------------------------

describe('api client — the bearer token', () => {

  it('attaches "Authorization: Bearer <token>" when a token is stored', async () => {
    setToken('tok-123');
    const calls = given.capture('get', '/api/probe', { ok: true });
    await api.get('/api/probe');
    expect(calls[0].headers.authorization).toBe('Bearer tok-123');
  });


  it('sends no Authorization header without a token', async () => {
    const calls = given.capture('get', '/api/probe', { ok: true });
    await api.get('/api/probe');
    expect(calls[0].headers.authorization).toBeUndefined();
  });


  it('reads the token per request — a login in between is picked up', async () => {
    const calls = given.capture('get', '/api/probe', { ok: true });
    await api.get('/api/probe');
    setToken('fresh');
    await api.get('/api/probe');
    expect(calls.map((c) => c.headers.authorization)).toEqual([undefined, 'Bearer fresh']);
  });
});







// -----------------------------------------------------------
// 401
// -----------------------------------------------------------

describe('api client — a 401', () => {

  it('drops the token and replaces the page with /login?next=<here>&expired=1; the call never settles', async () => {
    installLocationDouble('/reports/r1');
    setToken('dead');
    given.unauthorized('get', '/api/probe');
    const state = await stateOf(api.get('/api/probe'));
    expect(state).toBe('pending');
    expect(getToken()).toBeNull();
    expect(window.location.navigations).toEqual(['/console/login?next=%2Freports%2Fr1&expired=1']);
  });


  it('without a token there was no session to expire — no expired flag', async () => {
    installLocationDouble('/users');
    given.unauthorized('post', '/api/probe');
    expect(await stateOf(api.post('/api/probe', {}))).toBe('pending');
    expect(window.location.navigations).toEqual(['/console/login?next=%2Fusers']);
  });


  it('skipAuthRedirect makes a 401 an ordinary rejection (logout with a dead token)', async () => {
    const toastError = vi.spyOn(toast, 'error');
    setToken('dead');
    given.unauthorized('post', '/api/probe');
    await expect(api.post('/api/probe', {}, { skipAuthRedirect: true, silent: true })).rejects.toMatchObject({ response: { status: 401 } });
    expect(window.location.navigations).toEqual([]);
    expect(getToken()).toBe('dead');
    expect(toastError).not.toHaveBeenCalled();
  });


  it('any other failure keeps the token — a 5xx or a dead network does not sign anybody out', async () => {
    setToken('alive');
    given.apiError('get', '/api/probe', 'SERVER_ERROR', { status: 500 });
    await expect(api.get('/api/probe')).rejects.toMatchObject({ response: { status: 500 } });
    given.networkError('get', '/api/probe');
    await expect(api.get('/api/probe')).rejects.toBeTruthy();
    given.apiError('get', '/api/probe', 'FORBIDDEN', { status: 403 });
    await expect(api.get('/api/probe')).rejects.toMatchObject({ response: { status: 403 } });
    expect(getToken()).toBe('alive');
    expect(window.location.navigations).toEqual([]);
  });
});







// -----------------------------------------------------------
// toasts
// -----------------------------------------------------------

describe('api client — the failure toast', () => {

  it('a failed mutation toasts the translated sentence once per text, for as long as it takes to read, and still rejects', async () => {
    const toastError = vi.spyOn(toast, 'error');
    for (const method of ['post', 'put', 'patch', 'delete']) {
      given.apiError(method, '/api/probe', 'NOT_FOUND', { status: 404 });
      await expect(api[method]('/api/probe')).rejects.toMatchObject({ response: { status: 404 } });
    }
    expect(toastError).toHaveBeenCalledTimes(4);
    for (const [text, options] of toastError.mock.calls) {
      expect(text).toBe('Not found — it may have been deleted.');
      // A short sentence: an error's four seconds (utils/toast)
      expect(options).toEqual({ id: 'Not found — it may have been deleted.', duration: 4000 });
    }
  });


  it('toasts in the UI language — never the backend\'s English prose or the raw code', async () => {
    document.cookie = 'locale=lt; path=/';
    const toastError = vi.spyOn(toast, 'error');
    given.apiError('post', '/api/probe', 'LAST_ADMIN', { status: 409, error: 'Cannot demote the last active admin' });
    await expect(api.post('/api/probe', {})).rejects.toBeTruthy();
    expect(toastError.mock.calls[0][0]).toBe('Paskutinio aktyvaus administratoriaus negalima deaktyvuoti ar pažeminti.');
  });


  it('a network failure of a mutation toasts the network sentence', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.networkError('delete', '/api/probe');
    await expect(api.delete('/api/probe')).rejects.toBeTruthy();
    expect(toastError.mock.calls[0][0]).toBe('Could not reach the server. Check your internet connection.');
  });


  it('a failed GET toasts nothing — its query shows the error inline', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.apiError('get', '/api/probe', 'SERVER_ERROR', { status: 500 });
    await expect(api.get('/api/probe')).rejects.toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });


  it('`silent` keeps a failed mutation quiet — the dialog shows it inline', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.apiError('post', '/api/probe', 'EMAIL_TAKEN', { status: 409 });
    await expect(api.post('/api/probe', {}, { silent: true })).rejects.toMatchObject({ response: { data: { code: 'EMAIL_TAKEN' } } });
    expect(toastError).not.toHaveBeenCalled();
  });


  it('a cancelled mutation toasts nothing', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.hang('post', '/api/probe');
    const controller = new AbortController();
    const pending = api.post('/api/probe', {}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(toastError).not.toHaveBeenCalled();
  });


  it('errorText is the same translation the toast uses', async () => {
    given.apiError('get', '/api/probe', 'CORPUS_EMPTY', { status: 409 });
    const error = await api.get('/api/probe').catch((e) => e);
    expect(errorText(error)).toBe('The legal corpus is empty — an administrator must add legal acts first.');
  });
});







// -----------------------------------------------------------
// bodies
// -----------------------------------------------------------

describe('api client — bodies', () => {

  it('sends JSON bodies as JSON and hands back the parsed answer', async () => {
    const calls = given.capture('post', '/api/probe', { id: 'x1', name: 'Ąžuolas' }, { status: 201 });
    const { data, status } = await api.post('/api/probe', { name: 'Ąžuolas', flags: [true, null] });
    expect(status).toBe(201);
    expect(data).toEqual({ id: 'x1', name: 'Ąžuolas' });
    expect(calls[0].headers['content-type']).toMatch(/^application\/json/);
    expect(calls[0].body).toEqual({ name: 'Ąžuolas', flags: [true, null] });
  });


  it('sends a FormData body as multipart with the file', async () => {
    const calls = given.capture('post', '/api/probe', { ok: true }, { status: 201 });
    const form = new FormData();
    form.append('file', new File(['%PDF-1.7 test'], 'Politika.pdf', { type: 'application/pdf' }));
    form.append('companyId', 'c1');
    await api.post('/api/probe', form);
    expect(calls[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(calls[0].body).toEqual({ file: { name: 'Politika.pdf', size: 13, type: 'application/pdf' }, companyId: 'c1' });
  });


  it('the error envelope helper matches what the backend double answers', () => {
    expect(apiError('NOT_FOUND', 'No such thing')).toEqual({ error: 'No such thing', code: 'NOT_FOUND' });
  });
});
