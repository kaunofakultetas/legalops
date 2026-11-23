// -----------------------------------------------------------
//  [*] timestamps — wire stamps → display strings
//
//  The backend sends aware ISO stamps ("...+00:00") and bare
//  ISO dates ("2026-09-27", credentials and effective dates);
//  the browser localises. Empty/invalid input renders as "—".
//  The UI locale maps to a BCP 47 tag here: English uses
//  en-GB, so both languages keep the European day order and
//  the 24-hour clock.
// -----------------------------------------------------------

// UI locale → the Intl tag every formatter uses
const LOCALE_TAGS = { lt: 'lt-LT', en: 'en-GB' };

// A bare calendar date — formatted in UTC so a negative
// offset never shows the previous day
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;







// -----------------------------------------------------------
// localeTag
// -----------------------------------------------------------
//
// "lt" → "lt-LT", "en" → "en-GB"; a full tag passes through.
//
// Used by:
//   - formatDateTime, formatDate (below)
//   - utils/format.js — the number formatters
// -----------------------------------------------------------

export function localeTag(locale) {
  return LOCALE_TAGS[locale] || locale || LOCALE_TAGS.lt;
}







// -----------------------------------------------------------
// formatDateTime
// -----------------------------------------------------------
//
// "2026-09-21 13:21" (lt) / "21/09/2026, 13:21" (en), or "—".
//
// Used by:
//   - utils/format.js — useFormat().dateTime (every page)
// -----------------------------------------------------------

export function formatDateTime(value, locale = 'lt') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(localeTag(locale), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}







// -----------------------------------------------------------
// formatDate
// -----------------------------------------------------------
//
// The calendar date alone; bare ISO dates stay on their day
// in every timezone.
//
// Used by:
//   - utils/format.js — useFormat().date
// -----------------------------------------------------------

export function formatDate(value, locale = 'lt') {
  if (!value) return '—';
  const bare = DATE_ONLY.test(String(value));
  const date = new Date(bare ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(localeTag(locale), {
    year: 'numeric', month: '2-digit', day: '2-digit', ...(bare ? { timeZone: 'UTC' } : {}),
  });
}







// -----------------------------------------------------------
// formatShortDate
// -----------------------------------------------------------
//
// Month and day only — "09-27" (lt) / "27/09" (en) — for
// chart axes where the year is obvious.
//
// Used by:
//   - utils/format.js — useFormat().shortDate
// -----------------------------------------------------------

export function formatShortDate(value, locale = 'lt') {
  if (!value) return '—';
  const bare = DATE_ONLY.test(String(value));
  const date = new Date(bare ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(localeTag(locale), { month: '2-digit', day: '2-digit', ...(bare ? { timeZone: 'UTC' } : {}) });
}







// -----------------------------------------------------------
// formatDuration
// -----------------------------------------------------------
//
// Milliseconds → "503 ms" / "1,5 s" (lt) · "1.5 s" (en) /
// "2 min 5 s" / "3 h 12 min", or "—" for nothing / not a
// number; the unit symbols read the same in both languages,
// the decimal mark is the locale's. The value is rounded
// ONCE to the unit shown, so a carry moves up ("2 min 0 s",
// never "1 min 60 s").
//
// `whole` shows no part of a second — for a clock that ticks
// once a second and for a reader who follows progress, not
// latency: "45 s", and "< 1 s" for anything shorter.
//
// Used by:
//   - utils/format.js — useFormat().duration
// -----------------------------------------------------------

export function formatDuration(ms, locale = 'lt', { whole = false } = {}) {
  const value = ms == null ? NaN : Number(ms);
  if (!Number.isFinite(value)) return '—';
  if (whole && value < 59_500) return value < 500 ? '< 1 s' : `${Math.round(value / 1000)} s`;
  if (value < 1000) return `${Math.round(value)} ms`;
  if (!whole && value < 59_950) {
    const seconds = (value / 1000).toLocaleString(localeTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${seconds} s`;
  }
  const seconds = Math.round(value / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  const minutes = Math.round(value / 60_000);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
