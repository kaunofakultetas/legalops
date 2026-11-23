// -----------------------------------------------------------
//  [*] Tests — utils/errors.js
//
//  Any failure → one translated sentence: errorInfo's facts
//  for axios answers, the assistant's nested envelope, Caddy's
//  bodiless answers, network drops, timeouts and cancels;
//  errorMessage's order (the code's own sentence → the status
//  sentence → the network family), the English-only prose of
//  the validation codes, the named-field INVALID_FIELD, the
//  WEAK_PASSWORD numbers, the 429 wait; refusedFields (the
//  form fields a refusal is about, by its code or by the wire
//  name its prose opens with); readBlobError for the export
//  downloads; useErrorMessage following the locale.
//  Every code the Django API emits must reach the user as its
//  own sentence, never as the raw code or English prose in
//  the Lithuanian UI.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AxiosError } from 'axios';
import { messagesMap } from '@/messages';
import { IntlProvider, useSetLocale } from '@/i18n';
import { errorInfo, errorMessage, readBlobError, refusedFields, useErrorMessage } from '@/utils/errors';


// An axios-like failure with an HTTP answer
const httpError = (status, data, headers = {}) => {
  const error = new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE');
  error.response = { status, data, headers };
  return error;
};

const envelope = (code, error = `${code} prose`) => ({ error, code });

// Every error code the Django API and the assistant can send
// (grep of `code=` in django/compliance and assistant/app,
// docs/markdown/en/api.md) — each needs its own sentence
const BACKEND_CODES = [
  'NOT_FOUND', 'INVALID_FIELD', 'INVALID_BODY', 'MISSING_FIELDS', 'INVALID_QUERY', 'SELF_LOCKOUT', 'WEAK_PASSWORD',
  'NOT_CANCELLABLE', 'MISSING_FILE', 'MESSAGE_ID_TAKEN', 'LAST_ADMIN', 'INVALID_ROLE', 'INVALID_CREDENTIALS',
  'EMPTY_UPDATE', 'DUPLICATE_NAME', 'STILL_RUNNING', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'NOT_FINISHED',
  'METHOD_NOT_ALLOWED', 'FILE_TOO_LARGE', 'CORPUS_EMPTY', 'BUDGET_EXCEEDED', 'BAD_REQUEST', 'ALREADY_RUNNING',
  'WRONG_PASSWORD', 'SLUG_TAKEN', 'SERVER_ERROR', 'PROMPT_NOT_CONFIGURED', 'NO_FILE', 'NOT_INGESTED', 'MODEL_ERROR',
  'INVALID_VALUE', 'INVALID_EMAIL', 'INTERNAL_ONLY', 'EMAIL_TAKEN', 'AUTH_REQUIRED', 'FORBIDDEN', 'UNCHANGED',
  'AI_BUDGET_EXHAUSTED', 'UNKNOWN_MODEL', 'MODELS_UNAVAILABLE',
];

// Codes the GUI can never meet (a role refusal reads fine as
// the 403 sentence) — they fall back to their status sentence
// on purpose
const STATUS_ONLY_CODES = ['ROLE_NOT_ALLOWED', 'MESSAGE_TOO_LARGE', 'PAYLOAD_TOO_LARGE'];







// -----------------------------------------------------------
// errorInfo
// -----------------------------------------------------------

describe('errorInfo', () => {

  it('reads status, code and prose from the Django envelope', () => {
    expect(errorInfo(httpError(404, envelope('NOT_FOUND', 'No such company')))).toEqual({
      status: 404, code: 'NOT_FOUND', detail: 'No such company', retryAfter: null, network: false, timeout: false, canceled: false,
    });
  });


  it('reads the assistant container\'s nested envelope {error: {code, message}}', () => {
    const info = errorInfo(httpError(502, { error: { code: 'MODEL_ERROR', message: 'upstream failed' } }));
    expect(info.code).toBe('MODEL_ERROR');
    expect(info.detail).toBe('upstream failed');
  });


  it('takes a numeric Retry-After and ignores a date or garbage one', () => {
    expect(errorInfo(httpError(429, envelope('RATE_LIMITED'), { 'retry-after': '30' })).retryAfter).toBe(30);
    expect(errorInfo(httpError(429, envelope('RATE_LIMITED'), { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })).retryAfter).toBeNull();
    expect(errorInfo(httpError(429, envelope('RATE_LIMITED'), { 'retry-after': '-5' })).retryAfter).toBeNull();
  });


  it('has no code for a bodiless, HTML, string or Blob answer', () => {
    expect(errorInfo(httpError(502, '<html>502</html>')).code).toBeNull();
    expect(errorInfo(httpError(500, '')).code).toBeNull();
    expect(errorInfo(httpError(500, null)).code).toBeNull();
    expect(errorInfo(httpError(500, new Blob(['{"code":"X"}']))).code).toBeNull();
    expect(errorInfo(httpError(500, { code: 42 })).code).toBeNull();
  });


  it('tells a network drop, a timeout and a cancel apart', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(errorInfo(network)).toMatchObject({ status: null, network: true, timeout: false, canceled: false });
    const timeout = new AxiosError('timeout of 1000ms exceeded', 'ECONNABORTED');
    expect(errorInfo(timeout)).toMatchObject({ network: false, timeout: true, canceled: false });
    const canceled = new AxiosError('canceled', 'ERR_CANCELED');
    canceled.name = 'CanceledError';
    expect(errorInfo(canceled)).toMatchObject({ network: false, timeout: false, canceled: true });
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    expect(errorInfo(abort)).toMatchObject({ network: false, canceled: true });
  });


  it('survives null, undefined and a plain Error — none of them is a network failure', () => {
    expect(errorInfo(null)).toMatchObject({ status: null, code: null, network: false });
    expect(errorInfo(undefined)).toMatchObject({ status: null, code: null, network: false });
    expect(errorInfo(new Error('boom'))).toMatchObject({ status: null, code: null, network: false });
  });


  it('counts fetch\'s transport TypeError as a network failure, but not a TypeError from a bug', () => {
    for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed']) {
      expect(errorInfo(new TypeError(message)).network, message).toBe(true);
    }
    expect(errorInfo(new TypeError('Cannot read properties of undefined (reading \'map\')')).network).toBe(false);
  });
});







// -----------------------------------------------------------
// errorMessage
// -----------------------------------------------------------

describe('errorMessage', () => {

  it('gives every code the backend emits its own sentence in both languages', () => {
    for (const code of BACKEND_CODES) {
      for (const locale of ['lt', 'en']) {
        expect(messagesMap[locale].COMPONENTS.errors.CODES[code], `${locale} CODES.${code}`).toEqual(expect.any(String));
      }
    }
  });


  it('maps a code to its sentence, never showing the code or the Lithuanian-UI prose', () => {
    const error = httpError(409, envelope('ALREADY_RUNNING', 'An analysis is already running for this company'));
    expect(errorMessage(error, { locale: 'en' })).toBe('A compliance analysis of this company is already running.');
    expect(errorMessage(error, { locale: 'lt' })).toBe(messagesMap.lt.COMPONENTS.errors.CODES.ALREADY_RUNNING);
    expect(errorMessage(error, { locale: 'lt' })).not.toMatch(/ALREADY_RUNNING|already running/);
  });


  it('falls back to the status sentence for a code without one, and for the codes kept status-only', () => {
    expect(errorMessage(httpError(409, envelope('SOMETHING_NEW')), { locale: 'en' })).toBe('This conflicts with the record\'s current state.');
    for (const code of STATUS_ONLY_CODES) {
      const status = { ROLE_NOT_ALLOWED: 403, MESSAGE_TOO_LARGE: 413, PAYLOAD_TOO_LARGE: 413 }[code];
      expect(errorMessage(httpError(status, envelope(code)), { locale: 'en' })).toBe(messagesMap.en.COMPONENTS.errors.STATUS[status]);
    }
  });


  it('maps an unlisted 4xx / 5xx status to the generic 400 / 500 sentence and an answer without status to UNKNOWN', () => {
    expect(errorMessage(httpError(418, null), { locale: 'en' })).toBe('The request is invalid.');
    expect(errorMessage(httpError(507, null), { locale: 'en' })).toBe('Server error. Try again later.');
    const odd = new AxiosError('odd');
    odd.response = { status: 0, data: null, headers: {} };
    expect(errorMessage(odd, { locale: 'en' })).toBe('Something unexpected went wrong.');
  });


  it('says UNKNOWN — not "check your internet connection" — for an exception that is not a transport failure', () => {
    expect(errorMessage(new TypeError('Cannot read properties of undefined (reading \'map\')'), { locale: 'en' }))
      .toBe('Something unexpected went wrong.');
    expect(errorMessage(new Error('boom'), { locale: 'lt' })).toBe('Įvyko nenumatyta klaida.');
  });


  it('says NETWORK, TIMEOUT or CANCELED when no answer came', () => {
    expect(errorMessage(new AxiosError('Network Error', 'ERR_NETWORK'), { locale: 'en' })).toBe('Could not reach the server. Check your internet connection.');
    expect(errorMessage(new AxiosError('timeout', 'ETIMEDOUT'), { locale: 'en' })).toBe('The server did not answer in time.');
    const canceled = new AxiosError('canceled', 'ERR_CANCELED');
    expect(errorMessage(canceled, { locale: 'lt' })).toBe('Užklausa nutraukta.');
  });


  it('shows the validation prose verbatim in English and the translated sentence in Lithuanian', () => {
    const error = httpError(400, envelope('INVALID_QUERY', 'limit must be between 1 and 500'));
    expect(errorMessage(error, { locale: 'en' })).toBe('limit must be between 1 and 500');
    expect(errorMessage(error, { locale: 'lt' })).toBe('Neteisingi paieškos arba filtro parametrai.');
  });


  it('an English validation code without prose still gets its sentence', () => {
    expect(errorMessage(httpError(400, { code: 'MISSING_FIELDS' }), { locale: 'en' })).toBe('Fill in all required fields.');
  });


  it('names the invalid field by its form label when the caller maps the wire name', () => {
    const error = httpError(400, envelope('INVALID_FIELD', 'sourceUrl must be an https:// URL'));
    expect(errorMessage(error, { locale: 'lt', fields: { sourceUrl: 'Šaltinio adresas' } })).toBe('Neteisinga lauko „Šaltinio adresas“ reikšmė.');
    // An unmapped wire name, or no map at all, keeps the generic sentence
    expect(errorMessage(error, { locale: 'lt', fields: { other: 'X' } })).toBe('Neteisinga lauko reikšmė.');
    expect(errorMessage(error, { locale: 'lt' })).toBe('Neteisinga lauko reikšmė.');
  });


  it('reads the password length rule out of the WEAK_PASSWORD prose', () => {
    expect(errorMessage(httpError(400, envelope('WEAK_PASSWORD', 'Password must be at least 10 characters')), { locale: 'en' }))
      .toBe('The password must be at least 10 characters long.');
    expect(errorMessage(httpError(400, envelope('WEAK_PASSWORD', 'Password must be at most 72 bytes')), { locale: 'lt' }))
      .toBe('Slaptažodis per ilgas (daugiausia 72 baitų).');
    expect(errorMessage(httpError(400, envelope('WEAK_PASSWORD', 'too common')), { locale: 'en' }))
      .toBe('The password does not meet the requirements.');
  });


  it('appends the Retry-After wait to a 429 — and only to a 429', () => {
    expect(errorMessage(httpError(429, envelope('RATE_LIMITED'), { 'retry-after': '45' }), { locale: 'en' }))
      .toBe('Too many attempts. Wait a moment and try again. Try again in 45 s.');
    expect(errorMessage(httpError(429, envelope('BUDGET_EXCEEDED')), { locale: 'en' }))
      .toBe('Today\'s AI usage budget is spent. Try again tomorrow.');
    expect(errorMessage(httpError(503, null, { 'retry-after': '45' }), { locale: 'en' }))
      .toBe('The service is temporarily unavailable. Try again later.');
  });


  it('follows the locale cookie when no locale is passed', () => {
    const error = httpError(404, envelope('NOT_FOUND'));
    document.cookie = 'locale=lt; path=/';
    expect(errorMessage(error)).toBe('Įrašas nerastas — galbūt jis jau ištrintas.');
    document.cookie = 'locale=en; path=/';
    expect(errorMessage(error)).toBe('Not found — it may have been deleted.');
  });
});







// -----------------------------------------------------------
// refusedFields
// -----------------------------------------------------------

describe('refusedFields', () => {

  const BY_CODE = { DUPLICATE_NAME: ['name'], LAST_ADMIN: ['role', 'active'] };
  const BY_WIRE = { url: ['url'], dailyBudgetUsd: ['budgetMode', 'budget'] };


  it('names the fields of a refusal by its code', () => {
    expect(refusedFields(httpError(409, envelope('DUPLICATE_NAME')), BY_CODE, BY_WIRE)).toEqual(['name']);
    expect(refusedFields(httpError(400, envelope('LAST_ADMIN')), BY_CODE, BY_WIRE)).toEqual(['role', 'active']);
  });


  it('names the field a validation refusal\'s prose opens with, by its wire name', () => {
    expect(refusedFields(httpError(400, envelope('INVALID_FIELD', 'url must be an http(s) URL')), BY_CODE, BY_WIRE)).toEqual(['url']);
    expect(refusedFields(httpError(400, envelope('MISSING_FIELDS', 'dailyBudgetUsd is required')), BY_CODE, BY_WIRE)).toEqual(['budgetMode', 'budget']);
    // A wire name the form does not map, or prose naming none
    expect(refusedFields(httpError(400, envelope('INVALID_FIELD', 'at most 10 headers')), BY_CODE, BY_WIRE)).toEqual([]);
    expect(refusedFields(httpError(400, envelope('INVALID_FIELD', 'constructor must be text')), BY_CODE, BY_WIRE)).toEqual([]);
    // Another code's prose never names a field
    expect(refusedFields(httpError(400, envelope('INVALID_QUERY', 'url is odd')), BY_CODE, BY_WIRE)).toEqual([]);
  });


  it('names no field for a failure of the request itself, or for no error at all', () => {
    for (const error of [httpError(500, envelope('SERVER_ERROR')), httpError(404, envelope('NOT_FOUND')), httpError(502, '<html></html>'),
      new AxiosError('Network Error', 'ERR_NETWORK'), null, undefined]) {
      expect(refusedFields(error, BY_CODE, BY_WIRE)).toEqual([]);
    }
    expect(refusedFields(httpError(409, envelope('DUPLICATE_NAME')))).toEqual([]);
  });
});







// -----------------------------------------------------------
// readBlobError
// -----------------------------------------------------------

describe('readBlobError', () => {

  it('parses a JSON envelope out of a Blob body so the code maps', async () => {
    const error = httpError(409, new Blob([JSON.stringify(envelope('NOT_FINISHED'))], { type: 'application/json' }));
    const same = await readBlobError(error);
    expect(same).toBe(error);
    expect(error.response.data).toEqual(envelope('NOT_FINISHED'));
    expect(errorMessage(error, { locale: 'en' })).toBe('Only finished reports can be exported.');
  });


  it('turns a Blob that is not JSON into null data (the status sentence then)', async () => {
    const error = httpError(502, new Blob(['<html>bad gateway</html>'], { type: 'text/html' }));
    await readBlobError(error);
    expect(error.response.data).toBeNull();
    expect(errorMessage(error, { locale: 'en' })).toBe('The server is temporarily unreachable. Try again.');
  });


  it('leaves a non-Blob failure alone', async () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(await readBlobError(network)).toBe(network);
    const plain = httpError(404, envelope('NOT_FOUND'));
    await readBlobError(plain);
    expect(plain.response.data).toEqual(envelope('NOT_FOUND'));
  });
});







// -----------------------------------------------------------
// useErrorMessage
// -----------------------------------------------------------

describe('useErrorMessage', () => {

  function Shown({ error }) {
    const describe = useErrorMessage();
    const setLocale = useSetLocale();
    return (
      <>
        <p data-testid="sentence">{describe(error, { fields: { name: 'Pavadinimas' } })}</p>
        <button onClick={() => setLocale('lt')}>lt</button>
      </>
    );
  }


  it('re-renders a stored error in the new language after a switch', async () => {
    render(<IntlProvider><Shown error={httpError(404, envelope('NOT_FOUND'))} /></IntlProvider>);
    expect(screen.getByTestId('sentence')).toHaveTextContent('Not found — it may have been deleted.');
    await act(async () => { screen.getByText('lt').click(); });
    expect(screen.getByTestId('sentence')).toHaveTextContent('Įrašas nerastas — galbūt jis jau ištrintas.');
  });


  it('passes the options through (the field map)', async () => {
    document.cookie = 'locale=lt; path=/';
    render(<IntlProvider><Shown error={httpError(400, envelope('INVALID_FIELD', 'name is too long'))} /></IntlProvider>);
    expect(screen.getByTestId('sentence')).toHaveTextContent('Neteisinga lauko „Pavadinimas“ reikšmė.');
  });
});
