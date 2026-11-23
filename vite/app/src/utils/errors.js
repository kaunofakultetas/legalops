// -----------------------------------------------------------
//  [*] errors — any failed request → one translated sentence
//
//  Django answers failures as {"error": "<English prose>",
//  "code": "<SLUG>"} (the assistant container nests it as
//  {error: {code, message}}); Caddy and a dead network answer
//  with no body at all. The Lithuanian UI must never show
//  that English prose or a raw [CODE], so every failure is
//  mapped here, in this order:
//
//    1. a backend code with its own sentence
//       → COMPONENTS.errors.CODES.<code> (WEAK_PASSWORD and
//         INVALID_FIELD read a number / field name out of
//         the prose first)
//    2. no known code → the HTTP status sentence (STATUS.<n>)
//    3. no response at all → NETWORK / TIMEOUT / CANCELED —
//       NETWORK only for a real transport failure (axios got
//       no answer, fetch threw its "failed to fetch"); any
//       other exception (a bug in a queryFn) is UNKNOWN, not
//       "check your internet connection"
//
//  In English the validation codes (DETAIL_CODES) show the
//  backend's own prose instead: it names the field and the
//  rule, and it is English already. A 429 appends the
//  Retry-After wait when the header made it through.
//
//  Split into:
//
//    DETAIL_CODES    — codes whose English prose beats ours
//    errorInfo       — the normalised facts of one failure
//    errorMessage    — the displayable sentence
//    refusedFields   — the form fields a refusal is about
//    readBlobError   — a JSON error hidden in a Blob body
//    useErrorMessage — errorMessage bound to the live locale
// -----------------------------------------------------------

import { useCallback } from 'react';
import { getLocale, translate, useLocale } from '@/i18n';


// Validation codes: the backend's English prose names the
// field and the rule, so the English UI shows it verbatim
const DETAIL_CODES = new Set([
  'INVALID_FIELD', 'MISSING_FIELDS', 'INVALID_QUERY', 'INVALID_VALUE', 'INVALID_BODY', 'EMPTY_UPDATE',
]);

// The translation namespace every key below lives in
const NAMESPACE = 'COMPONENTS.errors';

// fetch()'s transport failure, as Chrome, Firefox, Safari and
// Node word it — a TypeError like any bug, told apart by text
const FETCH_FAILED = /failed to fetch|networkerror|load failed|fetch failed/i;

// The wire name a validation refusal's prose opens with
// ("sourceUrl must be an https:// URL", "name is required")
const WIRE_NAME = /^([A-Za-z][A-Za-z0-9]*)\b/;







// -----------------------------------------------------------
// errorInfo
// -----------------------------------------------------------
//
// The facts of one failure, whatever threw it (axios, fetch,
// a plain Error): {status, code, detail, retryAfter, network,
// timeout, canceled}. `detail` is the backend's prose — for
// logs and the English validation messages only. `network`
// is a transport failure only: an axios request without an
// answer, or fetch's TypeError ("Failed to fetch" and the
// other engines' wordings).
//
// Used by:
//   - errorMessage (below)
//   - AuthGuard.jsx — a network failure of the session check
//   - StartAnalysisDialog.jsx — ALREADY_RUNNING / CORPUS_EMPTY
//   - ReportScope.jsx — NOT_WAITING (the report is read again)
//   - CompanyRoles.jsx, McpServerDialog.jsx — DUPLICATE_NAME
//     on the name field
//   - ObligationsPanel.jsx — the bulk endpoint fallback
//     (404/405)
// -----------------------------------------------------------

export function errorInfo(error) {
  const response = error?.response;
  const body = response?.data;
  const data = body && typeof body === 'object' && !(typeof Blob !== 'undefined' && body instanceof Blob) ? body : null;
  const nested = data?.error && typeof data.error === 'object' ? data.error : null;
  const header = response?.headers?.['retry-after'];
  const canceled = error?.name === 'CanceledError' || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
  const timeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
  const fetchFailed = error instanceof TypeError && FETCH_FAILED.test(error.message || '');
  return {
    status: response?.status ?? null,
    code: typeof data?.code === 'string' ? data.code : (typeof nested?.code === 'string' ? nested.code : null),
    detail: typeof data?.error === 'string' ? data.error : (nested?.message || data?.message || ''),
    retryAfter: header != null && /^\d+$/.test(String(header)) ? Number(header) : null,
    network: Boolean(error?.isAxiosError || fetchFailed) && !response && !canceled && !timeout,
    timeout,
    canceled,
  };
}







// -----------------------------------------------------------
// has
// -----------------------------------------------------------
//
// True when the key exists in the active message tree —
// translate() answers the key itself for a missing one.
//
// Used by:
//   - sentence (below)
// -----------------------------------------------------------

function has(key, locale) {
  const value = translate(`${NAMESPACE}.${key}`, undefined, locale);
  return typeof value === 'string' && value !== `${NAMESPACE}.${key}`;
}







// -----------------------------------------------------------
// sentence
// -----------------------------------------------------------
//
// The translated sentence for a failure that DID get an HTTP
// answer; `fields` maps wire names to form labels so an
// INVALID_FIELD can say which field.
//
// Used by:
//   - errorMessage (below)
// -----------------------------------------------------------

function sentence(info, locale, fields) {

  const t = (key, params) => translate(`${NAMESPACE}.${key}`, params, locale);
  const { code, status, detail } = info;


  if (code === 'WEAK_PASSWORD') {
    const min = detail.match(/at least (\d+)/);
    if (min) return t('CODES.WEAK_PASSWORD_MIN', { min: min[1] });
    const max = detail.match(/at most (\d+)/);
    if (max) return t('CODES.WEAK_PASSWORD_MAX', { max: max[1] });
  }


  if (locale === 'en' && DETAIL_CODES.has(code) && detail) return detail;


  // "sourceUrl must be an https:// URL" — the prose opens
  // with the wire name of the offending field
  if (code === 'INVALID_FIELD' && fields) {
    const wire = detail.match(WIRE_NAME)?.[1];
    if (wire && fields[wire]) return t('CODES.INVALID_FIELD_NAMED', { field: fields[wire] });
  }


  if (code && has(`CODES.${code}`, locale)) return t(`CODES.${code}`);
  if (status && has(`STATUS.${status}`, locale)) return t(`STATUS.${status}`);
  if (status >= 500) return t('STATUS.500');
  if (status >= 400) return t('STATUS.400');
  return t('UNKNOWN');
}







// -----------------------------------------------------------
// errorMessage
// -----------------------------------------------------------
//
//   errorMessage(error)                          — cookie locale
//   errorMessage(error, { locale: 'en' })        — explicit
//   errorMessage(error, { fields: { name: 'Pavadinimas' } })
//                                                — names the
//                                                  invalid field
//
// Never answers raw backend prose in Lithuanian and never a
// bracketed code; a 429 carries the Retry-After wait.
//
// Used by:
//   - api/client.js — the mutation toast, errorText
//   - useErrorMessage (below) — every page through the hook
// -----------------------------------------------------------

export function errorMessage(error, { locale, fields } = {}) {

  const lang = locale || getLocale();
  const t = (key, params) => translate(`${NAMESPACE}.${key}`, params, lang);
  const info = errorInfo(error);


  if (info.canceled) return t('CANCELED');
  if (info.timeout) return t('TIMEOUT');
  if (info.network) return t('NETWORK');


  const text = sentence(info, lang, fields);
  if (info.status === 429 && info.retryAfter) return `${text} ${t('RETRY_AFTER', { seconds: info.retryAfter })}`;
  return text;
}







// -----------------------------------------------------------
// refusedFields
// -----------------------------------------------------------
//
//   refusedFields(save.error, { DUPLICATE_NAME: ['name'] }, { url: ['url'] })
//     → ['name'] for a DUPLICATE_NAME, ['url'] for
//       "url must be an http(s) URL", [] for a 500
//
// The form fields a failed save is about, so a dialog can
// drop the server's message as soon as the user changes one
// of them: by the refusal's code (`byCode`), or — for a
// validation refusal (INVALID_FIELD, MISSING_FIELDS) — by the
// wire name its prose opens with (`byWire`). [] for anything
// else, no error included: a failure of the request itself
// (a server error, a lost connection, a record gone) stays
// until the next try.
//
// Used by:
//   - Users.jsx, McpServerDialog.jsx, CompanyRoles.jsx — the
//     dialogs' server refusals
//   - McpServers.jsx — a server card's refused address (the
//     switch, the test)
// -----------------------------------------------------------

export function refusedFields(error, byCode = {}, byWire = {}) {
  const { code, detail } = errorInfo(error);
  if (code && Object.hasOwn(byCode, code)) return byCode[code];
  if (code !== 'INVALID_FIELD' && code !== 'MISSING_FIELDS') return [];
  const wire = detail.match(WIRE_NAME)?.[1];
  return wire && Object.hasOwn(byWire, wire) ? byWire[wire] : [];
}







// -----------------------------------------------------------
// readBlobError
// -----------------------------------------------------------
//
// A request made with responseType "blob" (the report
// exports) gets its JSON error envelope as a Blob too; this
// parses it back into response.data so errorMessage can map
// the code. Answers the same error object.
//
// Used by:
//   - utils/download.js — downloadFile
// -----------------------------------------------------------

export async function readBlobError(error) {
  const data = error?.response?.data;
  if (typeof Blob === 'undefined' || !(data instanceof Blob)) return error;
  try {
    error.response.data = JSON.parse(await data.text());
  } catch {
    error.response.data = null;
  }
  return error;
}







// -----------------------------------------------------------
// useErrorMessage
// -----------------------------------------------------------
//
//   const describe = useErrorMessage();
//   describe(query.error)                       — a sentence
//   describe(error, { fields: FIELD_LABELS })   — names fields
//
// errorMessage bound to the provider's locale, so a stored
// error re-renders in the new language after a switch.
//
// Used by:
//   - ErrorState.jsx, and every page that shows an inline
//     error (dialogs, Login, the export buttons)
// -----------------------------------------------------------

export function useErrorMessage() {
  const locale = useLocale();
  return useCallback((error, options) => errorMessage(error, { locale, ...options }), [locale]);
}
