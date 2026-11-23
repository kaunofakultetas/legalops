// -----------------------------------------------------------
//  [*] Tests — Meter (a ratio against a limit)
//
//  The daily AI budget bar: a meter named by its label with
//  min, max, the (capped) current value and the value as
//  words; the fill width and the three severities — the
//  accent below 80 %, warning from 80 %, critical once the
//  budget is SPENT (at exactly 100 % the backend already
//  refuses the next call: remaining ≤ 0 → BUDGET_EXCEEDED)
//  and past it — each written out with an icon and words,
//  never colour alone; "Unlimited" for the backend's no-
//  limit (null / 0) with no bar; the caller's formatter;
//  both languages.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '../support/render';
import { METER_TRACK, SERIES, STATUS } from '@/components/charts/chartTokens';
import Meter from '@/components/charts/Meter';


// "#3e6fb0" → "rgb(62, 111, 176)", the way jsdom reads a style
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

const usd = (n) => `${n.toFixed(2)} USD`;

// The fill bar inside the meter
const fillOf = (meter) => meter.firstElementChild;







// -----------------------------------------------------------
// The meter
// -----------------------------------------------------------

describe('Meter', () => {

  it('is a meter named by its label, with its range, value and the value in words', () => {
    renderPage(<Meter label="Today" value={1.5} limit={5} format={usd} />);
    const meter = screen.getByRole('meter', { name: 'Today' });
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '5');
    expect(meter).toHaveAttribute('aria-valuenow', '1.5');
    expect(meter).toHaveAttribute('aria-valuetext', '1.50 USD of 5.00 USD');
    expect(screen.getByText('1.50 USD of 5.00 USD')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });


  it('fills to the used share in the accent colour, on the lighter track', () => {
    renderPage(<Meter label="Today" value={1.5} limit={5} format={usd} />);
    const meter = screen.getByRole('meter');
    expect(meter.style.background).toBe(rgb(METER_TRACK));
    expect(fillOf(meter).style.width).toBe('30%');
    expect(fillOf(meter).style.background).toBe(rgb(SERIES[0]));
  });


  it('says nothing more below 80 %', () => {
    renderPage(<Meter label="Today" value={3.99} limit={5} format={usd} />);
    expect(screen.queryByText(/Close to the limit|Limit reached|Limit exceeded/)).toBeNull();
    expect(screen.queryByTestId('WarningAmberOutlinedIcon')).toBeNull();
    expect(screen.queryByTestId('ErrorOutlineIcon')).toBeNull();
  });


  it('from 80 %: the warning colour, the warning icon and "Close to the limit"', () => {
    renderPage(<Meter label="Today" value={4} limit={5} format={usd} />);
    const meter = screen.getByRole('meter');
    expect(fillOf(meter).style.width).toBe('80%');
    expect(fillOf(meter).style.background).toBe(rgb(STATUS.warning));
    const note = screen.getByText('Close to the limit');
    const icon = screen.getByTestId('WarningAmberOutlinedIcon');
    expect(note).toContainElement(icon);
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });


  it('at exactly the limit the budget is spent: critical, the error icon and "Limit reached"', () => {
    renderPage(<Meter label="Today" value={5} limit={5} format={usd} />);
    const meter = screen.getByRole('meter');
    expect(fillOf(meter).style.width).toBe('100%');
    expect(fillOf(meter).style.background).toBe(rgb(STATUS.critical));
    expect(screen.getByText('Limit reached')).toContainElement(screen.getByTestId('ErrorOutlineIcon'));
    expect(screen.queryByText('Close to the limit')).toBeNull();
  });


  it('past the limit: critical, "Limit exceeded", the bar full and the announced value capped at the limit', () => {
    renderPage(<Meter label="Today" value={6.2} limit={5} format={usd} />);
    const meter = screen.getByRole('meter');
    expect(fillOf(meter).style.width).toBe('100%');
    expect(fillOf(meter).style.background).toBe(rgb(STATUS.critical));
    expect(meter).toHaveAttribute('aria-valuenow', '5');
    // the words keep the real figure
    expect(meter).toHaveAttribute('aria-valuetext', '6.20 USD of 5.00 USD');
    const note = screen.getByText('Limit exceeded');
    expect(note).toContainElement(screen.getByTestId('ErrorOutlineIcon'));
    expect(screen.getByTestId('ErrorOutlineIcon')).toHaveAttribute('aria-hidden', 'true');
  });


  it('an empty budget reads 0 %, with no note', () => {
    renderPage(<Meter label="Today" value={0} limit={5} format={usd} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(fillOf(meter).style.width).toBe('0%');
    expect(screen.getByText('0.00 USD of 5.00 USD')).toBeInTheDocument();
  });


  it.each([
    ['null', null], ['undefined', undefined], ['0 (the backend\'s "no limit")', 0],
  ])('a %s limit means unlimited: the value and the word, no bar and no warning', (_, limit) => {
    renderPage(<Meter label="Today" value={123.4} limit={limit} format={usd} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByText('123.40 USD · Unlimited')).toBeInTheDocument();
    expect(screen.queryByText(/Close to the limit|Limit reached|Limit exceeded/)).toBeNull();
  });


  it('formats with String when no formatter is given', () => {
    renderPage(<Meter label="Tokens" value={3} limit={10} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '3 of 10');
    expect(screen.getByText('3 of 10')).toBeInTheDocument();
  });


  it('speaks Lithuanian: the value, the notes and the unlimited word', () => {
    renderPage(
      <>
        <Meter label="Šiandien" value={1} limit={2} format={usd} />
        <Meter label="Artėja" value={1.8} limit={2} format={usd} />
        <Meter label="Pasiekta" value={2} limit={2} format={usd} />
        <Meter label="Viršyta" value={3} limit={2} format={usd} />
        <Meter label="Be ribų" value={1} limit={null} format={usd} />
      </>,
      { locale: 'lt' },
    );
    expect(screen.getByRole('meter', { name: 'Šiandien' })).toHaveAttribute('aria-valuetext', '1.00 USD iš 2.00 USD');
    expect(screen.getByText('Artėjama prie limito')).toBeInTheDocument();
    expect(screen.getByText('Limitas pasiektas')).toBeInTheDocument();
    expect(screen.getByText('Limitas viršytas')).toBeInTheDocument();
    expect(screen.getByText('1.00 USD · Neribota')).toBeInTheDocument();
  });
});
