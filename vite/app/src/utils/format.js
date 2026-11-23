// -----------------------------------------------------------
//  [*] format — every number, amount and date the UI prints
//
//  One hook binds the formatters to the live locale, so a
//  page writes fmt.dateTime(row.createdAt) and re-renders in
//  the other language after a switch. Lithuanian formatting
//  comes from Intl ("1 234,5", "0,28 US$", "85 %").
//
//  Split into:
//
//    formatNumber  — grouped digits
//    formatUsd     — the model cost (US dollars, 2–4 decimals)
//    formatBytes   — file sizes
//    formatTokens  — compact token counts ("1,2 mln.")
//    formatPercent — a 0..1 fraction as a percentage
//    useFormat     — all of the above plus the dates, bound
//                    to the locale
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useLocale } from '@/i18n';
import { formatDate, formatDateTime, formatDuration, formatShortDate, localeTag } from '@/utils/timestamps';


// Binary units: a "5 MB" upload limit means 5 × 1024² bytes
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'];







// -----------------------------------------------------------
// formatNumber
// -----------------------------------------------------------
//
// Grouped digits in the locale, or "—" for null/undefined.
//
// Used by:
//   - useFormat (below)
//   - localeTheme.js — the DataGrid's footer counts
// -----------------------------------------------------------

export function formatNumber(value, locale = 'lt', options = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat(localeTag(locale), options).format(Number(value));
}







// -----------------------------------------------------------
// formatUsd
// -----------------------------------------------------------
//
// Model costs are fractions of a cent per call, so amounts
// under a dollar keep four decimals. English shows "$0.42"
// (en-GB would print "US$0.42"); Lithuanian keeps the usual
// "0,42 USD". Nothing or not a number → "—".
//
// Used by:
//   - useFormat (below)
// -----------------------------------------------------------

export function formatUsd(value, locale = 'lt') {
  const amount = value == null ? NaN : Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'currency', currency: 'USD', currencyDisplay: locale === 'en' ? 'narrowSymbol' : 'code',
    minimumFractionDigits: 2, maximumFractionDigits: Math.abs(amount) < 1 ? 4 : 2,
  }).format(amount);
}







// -----------------------------------------------------------
// formatBytes
// -----------------------------------------------------------
//
// 5571 → "5,4 KB"; one decimal above a kilobyte; nothing or
// not a number → "—".
//
// Used by:
//   - useFormat (below)
// -----------------------------------------------------------

export function formatBytes(bytes, locale = 'lt') {
  let value = bytes == null ? NaN : Number(bytes);
  if (!Number.isFinite(value)) return '—';
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${BYTE_UNITS[unit]}`;
}







// -----------------------------------------------------------
// formatTokens
// -----------------------------------------------------------
//
// Compact token counts for meters and cards ("3 mln.",
// "125 tūkst." / "3m", "125k" — en-GB's own compact form).
//
// Used by:
//   - useFormat (below)
// -----------------------------------------------------------

export function formatTokens(value, locale = 'lt') {
  return formatNumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 });
}







// -----------------------------------------------------------
// formatPercent
// -----------------------------------------------------------
//
// 0.85 → "85 %" (lt) / "85%" (en).
//
// Used by:
//   - useFormat (below)
// -----------------------------------------------------------

export function formatPercent(fraction, locale = 'lt') {
  return formatNumber(fraction, locale, { style: 'percent', maximumFractionDigits: 0 });
}







// -----------------------------------------------------------
// useFormat
// -----------------------------------------------------------
//
//   const fmt = useFormat();
//   fmt.dateTime(row.createdAt)   fmt.date(cred.validTo)
//   fmt.shortDate('2026-09-27')   → "09-27" / "27/09"
//   fmt.number(1234)              fmt.usd(0.0283)
//   fmt.bytes(5571)               fmt.tokens(3_000_000)
//   fmt.percent(0.85)             fmt.duration(1500)
//   fmt.duration(44_900, { whole: true })   → "45 s"
//
// Memoised per locale so it is safe in hook dependencies.
//
// Used by:
//   - every page that prints a stamp, a number or a cost
// -----------------------------------------------------------

export function useFormat() {
  const locale = useLocale();
  return useMemo(() => ({
    locale,
    dateTime: (value) => formatDateTime(value, locale),
    date: (value) => formatDate(value, locale),
    shortDate: (value) => formatShortDate(value, locale),
    duration: (ms, options) => formatDuration(ms, locale, options),
    number: (value, options) => formatNumber(value, locale, options),
    usd: (value) => formatUsd(value, locale),
    bytes: (value) => formatBytes(value, locale),
    tokens: (value) => formatTokens(value, locale),
    percent: (value) => formatPercent(value, locale),
  }), [locale]);
}
