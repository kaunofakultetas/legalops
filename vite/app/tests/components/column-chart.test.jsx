// -----------------------------------------------------------
//  [*] Tests — ColumnChart (a daily stacked column chart)
//
//  The usage page's tokens-per-day chart: the legend naming
//  the series; the plot as a group named by the label, the
//  legend and the table view each named apart from it
//  ("<label> — legend", "<label> — table"); one
//  focusable column per day, named by its date and every
//  series' value, sized on a clean axis (niceMax — ticks at
//  max, half, 0), its non-zero segments stacked in the
//  series colours with only the top one rounded; the tooltip
//  on hover and on keyboard focus (date, each series, the
//  total); the x labels thinned to at most eight, the newest
//  day always labelled; the table view with the same numbers
//  and back (kept for the tab under a stateKey); the caller's
//  formatter everywhere; nothing, zeros and one day; both
//  languages.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage } from '../support/render';
import { SERIES } from '@/components/charts/chartTokens';
import ColumnChart from '@/components/charts/ColumnChart';


// "#3e6fb0" → "rgb(62, 111, 176)", the way jsdom reads a style
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

// The plot's height in px, less the 2 px the baseline keeps
const DRAWN = 158;

const TWO_SERIES = [{ label: 'Input', color: SERIES[0] }, { label: 'Output', color: SERIES[1] }];

// n days ending 09-27, input 100·(i+1), output 10·(i+1)
const days = (n) => Array.from({ length: n }, (_, i) => {
  const day = 27 - (n - 1 - i);
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  return { key: date, label: `09-${String(day).padStart(2, '0')}`, values: [100 * (i + 1), 10 * (i + 1)] };
});

const plot = (name = 'Tokens per day') => screen.getByRole('group', { name });

// The focusable day columns, oldest first
const columns = (name) => within(plot(name)).getAllByRole('img');

// The drawn segments of a column, bottom first
const segmentsOf = (column) => [...column.firstElementChild.children];

// The x-axis labels band (aria-hidden), one span per day
const xLabels = () => [...plot().lastElementChild.children].map((span) => span.textContent);

// The y-axis tick labels, top first (the hidden width ghost excluded)
const yTicks = (name) => [...plot(name).firstElementChild.querySelectorAll('span.absolute')].map((span) => span.textContent);

// jsdom's :focus-visible heuristic misses a Tab onto a
// focusable div (it does match a Tab-focused button); in a
// browser an element focused from the keyboard matches — the
// spy restores that rule for the tooltip's focus check
const keyboardFocusIsVisible = () => {
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (selector) {
    return selector === ':focus-visible' ? this === document.activeElement : matches.call(this, selector);
  });
};







// -----------------------------------------------------------
// The chart
// -----------------------------------------------------------

describe('ColumnChart chart', () => {

  it('names its series in a legend and its plot as a group', () => {
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} />);
    const legend = screen.getByRole('list', { name: 'Tokens per day — legend' });
    const entries = within(legend).getAllByRole('listitem');
    expect(entries.map((li) => li.textContent)).toEqual(['Input', 'Output']);
    const swatch = entries[1].firstElementChild;
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
    expect(swatch.style.background).toBe(rgb(SERIES[1]));
    expect(plot()).toBeInTheDocument();
  });


  it('draws one focusable column per day, named by its date and every series', () => {
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} format={(n) => `${n} t`} />);
    expect(columns().map((c) => c.getAttribute('aria-label'))).toEqual([
      '09-25: Input 100 t, Output 10 t',
      '09-26: Input 200 t, Output 20 t',
      '09-27: Input 300 t, Output 30 t',
    ]);
    for (const column of columns()) expect(column).toHaveAttribute('tabindex', '0');
  });


  it('puts the axis on a clean maximum — ticks at max, half and zero — and scales the columns to it', () => {
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} />);
    // the largest total is 330 → a clean 500
    expect(yTicks()).toEqual(['500', '250', '0']);
    const [input, output] = segmentsOf(columns()[2]);
    expect(input.style.height).toBe(`${(300 / 500) * DRAWN}px`);
    expect(output.style.height).toBe(`${(30 / 500) * DRAWN}px`);
    expect(input.style.background).toBe(rgb(SERIES[0]));
    expect(output.style.background).toBe(rgb(SERIES[1]));
  });


  it('rounds only the top drawn segment and draws nothing for a zero', () => {
    const data = [
      { key: 'a', label: 'A', values: [50, 20] },
      { key: 'b', label: 'B', values: [50, 0] },
      { key: 'c', label: 'C', values: [0, 0] },
    ];
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={data} />);
    const [a, b, c] = columns();
    expect(segmentsOf(a).map((s) => s.className)).toEqual(['', 'rounded-t']);
    // the zero output is not drawn, so the input is the top
    expect(segmentsOf(b).map((s) => s.className)).toEqual(['rounded-t']);
    expect(segmentsOf(c)).toHaveLength(0);
    expect(c).toHaveAttribute('aria-label', 'C: Input 0, Output 0');
  });


  it('labels at most eight days, counted back from the newest, which always has its label', () => {
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(27)} />);
    const labels = xLabels();
    expect(labels).toHaveLength(27);
    const shown = labels.filter(Boolean);
    expect(shown.length).toBeLessThanOrEqual(8);
    expect(labels.at(-1)).toBe('09-27');
    // every 4th day: 27, 23, 19 … 3
    expect(shown).toEqual(['09-03', '09-07', '09-11', '09-15', '09-19', '09-23', '09-27']);
    expect(plot().lastElementChild).toHaveAttribute('aria-hidden', 'true');
  });


  it('labels every day of a short series', () => {
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(5)} />);
    expect(xLabels()).toEqual(['09-23', '09-24', '09-25', '09-26', '09-27']);
  });


  it('shows the date, each series and the total in a tooltip on hover', async () => {
    const { user } = renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} format={(n) => `${n} t`} />);
    await user.hover(columns()[1]);
    const tooltip = await screen.findByRole('tooltip');
    expect([...tooltip.querySelectorAll('.text-xs > div')].map((d) => d.textContent)).toEqual([
      '09-26', 'Input: 200 t', 'Output: 20 t', 'Total: 220 t',
    ]);
    await user.unhover(columns()[1]);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });


  it('walks the columns with Tab, the tooltip following the focus', async () => {
    keyboardFocusIsVisible();
    const { user } = renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} />);
    // the table toggle comes first
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show table' })).toHaveFocus();
    await user.tab();
    expect(columns()[0]).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('09-25');
    await user.tab();
    expect(columns()[1]).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('09-26'));
  });


  it('copes with no days and with only zeros: an axis of 1, no segments', () => {
    const { unmount } = renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={[]} />);
    expect(within(plot()).queryAllByRole('img')).toHaveLength(0);
    expect(yTicks()).toEqual(['1', '0.5', '0']);
    unmount();
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={[{ key: 'z', label: 'Z', values: [0, 0] }]} />);
    expect(yTicks()).toEqual(['1', '0.5', '0']);
    expect(segmentsOf(columns()[0])).toHaveLength(0);
  });


  it('works with a single series', () => {
    renderPage(<ColumnChart label="Cost per day" series={[{ label: 'Cost', color: SERIES[0] }]}
                             data={[{ key: 'd', label: '09-27', values: [2.5] }]} format={(n) => `$${n}`} />);
    const [column] = columns('Cost per day');
    expect(column).toHaveAttribute('aria-label', '09-27: Cost $2.5');
    expect(yTicks('Cost per day')).toEqual(['$2.5', '$1.25', '$0']);
    expect(segmentsOf(column)[0]).toHaveClass('rounded-t');
  });
});







// -----------------------------------------------------------
// The table view
// -----------------------------------------------------------

describe('ColumnChart table view', () => {

  it('swaps the chart for a table of the same numbers, and back', async () => {
    const { user } = renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} format={(n) => `${n} t`} />);
    await user.click(screen.getByRole('button', { name: 'Show table' }));
    expect(screen.queryByRole('group', { name: 'Tokens per day' })).toBeNull();
    const table = screen.getByRole('table', { name: 'Tokens per day — table' });
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Date', 'Input', 'Output', 'Total']);
    expect(within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((td) => td.textContent))).toEqual([
      ['09-25', '100 t', '10 t', '110 t'],
      ['09-26', '200 t', '20 t', '220 t'],
      ['09-27', '300 t', '30 t', '330 t'],
    ]);
    // the legend stays
    expect(screen.getByRole('list', { name: 'Tokens per day — legend' })).toBeInTheDocument();

    const back = screen.getByRole('button', { name: 'Show chart' });
    await user.click(back);
    expect(screen.queryByRole('table')).toBeNull();
    expect(plot()).toBeInTheDocument();
    // the toggle keeps the focus across the swap
    expect(screen.getByRole('button', { name: 'Show table' })).toHaveFocus();
  });


  it('with a stateKey the table view outlives the chart — without one every chart starts as a chart', async () => {
    const first = renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} stateKey="test.tokens" />);
    await first.user.click(screen.getByRole('button', { name: 'Show table' }));
    first.unmount();
    const second = renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} stateKey="test.tokens" />);
    expect(screen.getByRole('table', { name: 'Tokens per day — table' })).toBeInTheDocument();
    second.unmount();
    renderPage(<ColumnChart label="Tokens per day" series={TWO_SERIES} data={days(3)} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(plot()).toBeInTheDocument();
  });


  it('speaks Lithuanian: the toggle, the table headers and the tooltip total', async () => {
    const series = [{ label: 'Įvestis', color: SERIES[0] }, { label: 'Išvestis', color: SERIES[1] }];
    const { user } = renderPage(<ColumnChart label="Žetonai per dieną" series={series} data={days(2)} />, { locale: 'lt' });
    await user.hover(within(screen.getByRole('group', { name: 'Žetonai per dieną' })).getAllByRole('img')[0]);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Iš viso: 110');
    await user.click(screen.getByRole('button', { name: 'Rodyti lentelę' }));
    expect(within(screen.getByRole('table', { name: 'Žetonai per dieną — lentelė' })).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Data', 'Įvestis', 'Išvestis', 'Iš viso']);
    expect(screen.getByRole('list', { name: 'Žetonai per dieną — legenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rodyti grafiką' })).toBeInTheDocument();
  });


  it('gives the legend, the plot and the table view three different names', async () => {
    const { user } = renderPage(<ColumnChart label="Tokens a day" series={TWO_SERIES} data={days(2)} />);
    expect(screen.getByRole('list', { name: /Tokens a day/ })).toHaveAccessibleName('Tokens a day — legend');
    expect(screen.getByRole('group', { name: /Tokens a day/ })).toHaveAccessibleName('Tokens a day');
    await user.click(screen.getByRole('button', { name: 'Show table' }));
    expect(screen.getByRole('table', { name: /Tokens a day/ })).toHaveAccessibleName('Tokens a day — table');
  });


  it('renders unicode and markup in labels as text', () => {
    const label = '💾 Ąžuolas <b>x</b>';
    const { container } = renderPage(<ColumnChart label={label} series={[{ label, color: SERIES[0] }]} data={[{ key: 'k', label, values: [1] }]} />);
    expect(screen.getByRole('group', { name: label })).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});
