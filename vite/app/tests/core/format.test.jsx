// -----------------------------------------------------------
//  [*] Tests — utils/timestamps.js and utils/format.js
//
//  Every stamp, number, cost, size and duration the UI prints:
//  the Lithuanian and the English (en-GB: European day order,
//  24-hour clock) forms, the "—" for nothing or garbage, bare
//  ISO dates that stay on their day in any timezone, the carry
//  of a rounded duration, and useFormat binding them to the
//  live locale.
// -----------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { IntlProvider, useSetLocale } from '@/i18n';
import { formatDate, formatDateTime, formatDuration, formatShortDate, localeTag } from '@/utils/timestamps';
import { formatBytes, formatNumber, formatPercent, formatTokens, formatUsd, useFormat } from '@/utils/format';


// The no-break space Intl puts between digit groups and units
// in Lithuanian
const NB = ' ';

afterEach(() => {
  process.env.TZ = 'UTC';
});







// -----------------------------------------------------------
// timestamps
// -----------------------------------------------------------

describe('timestamps', () => {

  it('maps the UI locale to its Intl tag, a full tag passing through', () => {
    expect(localeTag('lt')).toBe('lt-LT');
    expect(localeTag('en')).toBe('en-GB');
    expect(localeTag('de-DE')).toBe('de-DE');
    expect(localeTag(undefined)).toBe('lt-LT');
  });


  it('formats an aware stamp as date + 24-hour time in both languages', () => {
    expect(formatDateTime('2026-09-21T13:21:00+00:00', 'lt')).toBe('2026-09-21 13:21');
    expect(formatDateTime('2026-09-21T13:21:00+00:00', 'en')).toBe('21/09/2026, 13:21');
  });


  it('shows the stamp in the viewer\'s own timezone', () => {
    process.env.TZ = 'Europe/Vilnius';
    expect(formatDateTime('2026-09-21T13:21:00+00:00', 'lt')).toBe('2026-09-21 16:21');
  });


  it('keeps a bare ISO date on its day, even west of Greenwich', () => {
    process.env.TZ = 'America/New_York';
    expect(formatDate('2026-09-27', 'lt')).toBe('2026-09-27');
    expect(formatDate('2026-09-27', 'en')).toBe('27/09/2026');
    expect(formatShortDate('2026-09-27', 'lt')).toBe('09-27');
    expect(formatShortDate('2026-09-27', 'en')).toBe('27/09');
  });


  it('formats the date part of a full stamp', () => {
    expect(formatDate('2026-09-21T13:21:00+00:00', 'lt')).toBe('2026-09-21');
    expect(formatShortDate('2026-09-21T13:21:00+00:00', 'en')).toBe('21/09');
  });


  it('answers "—" for nothing and for garbage', () => {
    for (const fn of [formatDateTime, formatDate, formatShortDate]) {
      for (const value of [null, undefined, '', 'not a date', '2026-13-45']) {
        expect(fn(value, 'lt'), `${fn.name}(${value})`).toBe('—');
      }
    }
  });


  it('formats durations with the carry rounded into the bigger unit', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(503)).toBe('503 ms');
    expect(formatDuration(503.6)).toBe('504 ms');
    expect(formatDuration(1500, 'en')).toBe('1.5 s');
    expect(formatDuration(59_949, 'en')).toBe('59.9 s');
    expect(formatDuration(59_960)).toBe('1 min 0 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(formatDuration(119_600)).toBe('2 min 0 s');
    expect(formatDuration(3_599_600)).toBe('1 h 0 min');
    expect(formatDuration(11_520_000)).toBe('3 h 12 min');
    expect(formatDuration(7_170_000)).toBe('2 h 0 min');
  });


  it('writes the seconds with the locale\'s decimal mark', () => {
    expect(formatDuration(1500, 'lt')).toBe('1,5 s');
    expect(formatDuration(1500)).toBe('1,5 s');
    expect(formatDuration(41_800, 'lt')).toBe('41,8 s');
    expect(formatDuration(41_800, 'en')).toBe('41.8 s');
    expect(formatDuration(2000, 'en')).toBe('2.0 s');
    // Whole seconds: no part of a second, in either language
    const whole = { whole: true };
    expect(formatDuration(44_900, 'lt', whole)).toBe('45 s');
    expect(formatDuration(44_900, 'en', whole)).toBe('45 s');
    expect(formatDuration(25, 'lt', whole)).toBe('< 1 s');
    expect(formatDuration(1400, 'lt', whole)).toBe('1 s');
    expect(formatDuration(59_600, 'lt', whole)).toBe('1 min 0 s');
    expect(formatDuration(125_000, 'lt', whole)).toBe('2 min 5 s');
  });


  it('formats a numeric string duration and answers "—" for nothing or garbage', () => {
    expect(formatDuration('1500', 'en')).toBe('1.5 s');
    for (const value of [null, undefined, 'soon', NaN, Infinity]) expect(formatDuration(value)).toBe('—');
  });
});







// -----------------------------------------------------------
// numbers
// -----------------------------------------------------------

describe('numbers', () => {

  it('groups digits the locale\'s way', () => {
    expect(formatNumber(1234567.5, 'lt')).toBe(`1${NB}234${NB}567,5`);
    expect(formatNumber(1234567.5, 'en')).toBe('1,234,567.5');
    expect(formatNumber('42', 'en')).toBe('42');
    expect(formatNumber(null, 'en')).toBe('—');
    expect(formatNumber('abc', 'en')).toBe('—');
  });


  it('prints costs as USD — four decimals under a dollar, two above; "$" in English, "USD" in Lithuanian', () => {
    expect(formatUsd(0.0283, 'lt')).toBe(`0,0283${NB}USD`);
    expect(formatUsd(0.0283, 'en')).toBe('$0.0283');
    expect(formatUsd(1234.5, 'lt')).toBe(`1${NB}234,50${NB}USD`);
    expect(formatUsd(1234.5, 'en')).toBe('$1,234.50');
    expect(formatUsd(0, 'en')).toBe('$0.00');
    expect(formatUsd('2.5', 'en')).toBe('$2.50');
  });


  it('prints "—" for a missing or non-numeric cost instead of "NaN USD"', () => {
    for (const value of [null, undefined, 'n/a', NaN]) {
      expect(formatUsd(value, 'lt')).toBe('—');
      expect(formatUsd(value, 'en')).toBe('—');
    }
  });


  it('prints file sizes in binary units with one decimal above a kilobyte', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(5571, 'lt')).toBe('5,4 KB');
    expect(formatBytes(5571, 'en')).toBe('5.4 KB');
    expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5 MB');
    expect(formatBytes(3 * 1024 ** 4, 'en')).toBe('3,072 GB');
    expect(formatBytes(null, 'en')).toBe('—');
    expect(formatBytes('big', 'en')).toBe('—');
  });


  it('prints compact token counts and percentages', () => {
    expect(formatTokens(3_000_000, 'lt')).toBe(`3${NB}mln.`);
    expect(formatTokens(125_000, 'lt')).toBe(`125${NB}tūkst.`);
    expect(formatTokens(3_000_000, 'en')).toBe('3m');
    expect(formatTokens(1250, 'en')).toBe('1.3k');
    expect(formatTokens(999, 'en')).toBe('999');
    expect(formatPercent(0.85, 'lt')).toBe(`85${NB}%`);
    expect(formatPercent(0.85, 'en')).toBe('85%');
    expect(formatPercent(null, 'en')).toBe('—');
  });
});







// -----------------------------------------------------------
// useFormat
// -----------------------------------------------------------

describe('useFormat', () => {

  function Shown() {
    const fmt = useFormat();
    const setLocale = useSetLocale();
    return (
      <>
        <p data-testid="out">{[fmt.locale, fmt.dateTime('2026-09-21T13:21:00+00:00'), fmt.usd(0.5), fmt.duration(1500), fmt.percent(0.5)].join(' | ')}</p>
        <button onClick={() => setLocale('lt')}>lt</button>
      </>
    );
  }


  it('binds every formatter to the live locale and follows a switch', async () => {
    render(<IntlProvider><Shown /></IntlProvider>);
    expect(screen.getByTestId('out')).toHaveTextContent('en | 21/09/2026, 13:21 | $0.50 | 1.5 s | 50%');
    await act(async () => { screen.getByText('lt').click(); });
    expect(screen.getByTestId('out').textContent).toBe(`lt | 2026-09-21 13:21 | 0,50${NB}USD | 1,5 s | 50${NB}%`);
  });


  it('is the same object between renders in one locale (safe in hook dependencies)', () => {
    const seen = [];
    function Watcher() { seen.push(useFormat()); return null; }
    const { rerender } = render(<IntlProvider><Watcher /></IntlProvider>);
    rerender(<IntlProvider><Watcher /></IntlProvider>);
    expect(seen[1]).toBe(seen[0]);
  });
});
