// -----------------------------------------------------------
//  [*] Tests — StatusBar (part-to-whole of a few statuses)
//
//  The findings-by-status figure: a figure named by its
//  label; one focusable segment per NON-zero status, sized
//  by its share, in its colour, the last one rounded, each
//  named "label: count (share)" and showing the same words
//  in a tooltip on hover and on keyboard focus; the legend
//  that carries EVERY status as text (a zero one included)
//  so no number needs a hover; no bar at all for an empty
//  total; numbers and shares in the UI language's format.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { renderPage } from '../support/render';
import { STATUS } from '@/components/charts/chartTokens';
import StatusBar from '@/components/charts/StatusBar';


// "#0ca30c" → "rgb(12, 163, 12)", the way jsdom reads a style
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

// Findings by status, 100 in all
const ITEMS = [
  { key: 'met', label: 'Met', value: 40, color: STATUS.good, icon: <CheckCircleOutlineIcon aria-hidden /> },
  { key: 'partial', label: 'Partly met', value: 35, color: STATUS.warning },
  { key: 'missing', label: 'Not met', value: 25, color: STATUS.critical },
  { key: 'unknown', label: 'Not evidenced', value: 0, color: STATUS.neutral },
];

const figure = (name = 'Findings by status') => screen.getByRole('figure', { name });

// The focusable bar segments, in order
const segments = () => screen.queryAllByRole('img').filter((node) => node.hasAttribute('tabindex'));

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

// The legend rows as [label, count, share]
const legend = (name) => within(figure(name)).getAllByRole('listitem').map((li) => {
  const spans = li.querySelectorAll(':scope > span');
  return [...spans].slice(1).map((span) => span.textContent);
});







// -----------------------------------------------------------
// The bar
// -----------------------------------------------------------

describe('StatusBar bar', () => {

  it('is a figure named by its label, with one focusable segment per non-zero status', () => {
    renderPage(<StatusBar label="Findings by status" items={ITEMS} />);
    expect(figure()).toBeInTheDocument();
    expect(segments().map((segment) => segment.getAttribute('aria-label'))).toEqual([
      'Met: 40 (40%)', 'Partly met: 35 (35%)', 'Not met: 25 (25%)',
    ]);
    for (const segment of segments()) expect(segment).toHaveAttribute('tabindex', '0');
  });


  it('sizes each segment by its share, paints it in its colour and rounds only the end', () => {
    renderPage(<StatusBar label="Findings by status" items={ITEMS} />);
    const [met, partial, missing] = segments();
    expect([met, partial, missing].map((s) => s.style.width)).toEqual(['40%', '35%', '25%']);
    expect(met.style.background).toBe(rgb(STATUS.good));
    expect(missing.style.background).toBe(rgb(STATUS.critical));
    // a sliver stays visible
    expect(met.style.minWidth).toBe('4px');
    expect(missing).toHaveClass('rounded-r');
    expect(met).not.toHaveClass('rounded-r');
    expect(partial).not.toHaveClass('rounded-r');
  });


  it('shows a segment\'s words in a tooltip on hover', async () => {
    const { user } = renderPage(<StatusBar label="Findings by status" items={ITEMS} />);
    await user.hover(segments()[1]);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Partly met: 35 (35%)');
    await user.unhover(segments()[1]);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });


  it('walks the segments with Tab, each showing its tooltip on focus', async () => {
    keyboardFocusIsVisible();
    const { user } = renderPage(<StatusBar label="Findings by status" items={ITEMS} />);
    await user.tab();
    expect(segments()[0]).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Met: 40 (40%)');
    await user.tab();
    expect(segments()[1]).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Partly met: 35 (35%)'));
    await user.tab();
    await user.tab();
    // three segments, then out of the figure
    expect(figure()).not.toContainElement(document.activeElement);
    await act(async () => { document.activeElement.blur(); });
  });


  it('draws no bar at all when every count is zero', () => {
    renderPage(<StatusBar label="Findings by status" items={ITEMS.map((item) => ({ ...item, value: 0 }))} />);
    expect(segments()).toHaveLength(0);
    expect(legend().map(([, count, share]) => `${count} ${share}`)).toEqual(['0 (0%)', '0 (0%)', '0 (0%)', '0 (0%)']);
  });


  it('a single status fills the whole bar', () => {
    renderPage(<StatusBar label="Findings by status" items={[{ key: 'met', label: 'Met', value: 7, color: STATUS.good }]} />);
    expect(segments()).toHaveLength(1);
    expect(segments()[0].style.width).toBe('100%');
    expect(segments()[0]).toHaveClass('rounded-r');
    expect(segments()[0]).toHaveAttribute('aria-label', 'Met: 7 (100%)');
  });
});







// -----------------------------------------------------------
// The legend
// -----------------------------------------------------------

describe('StatusBar legend', () => {

  it('lists every status as text — the zero one too — with its count and share', () => {
    renderPage(<StatusBar label="Findings by status" items={ITEMS} />);
    expect(legend()).toEqual([
      ['Met', '40', '(40%)'],
      ['Partly met', '35', '(35%)'],
      ['Not met', '25', '(25%)'],
      ['Not evidenced', '0', '(0%)'],
    ]);
  });


  it('keeps the colour swatch decorative and shows the status icon beside the words', () => {
    renderPage(<StatusBar label="Findings by status" items={ITEMS} />);
    const [met] = within(figure()).getAllByRole('listitem');
    const swatch = met.firstElementChild;
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
    expect(swatch.style.background).toBe(rgb(STATUS.good));
    expect(within(met).getByTestId('CheckCircleOutlineIcon')).toBeInTheDocument();
  });


  it('rounds the shares and groups big counts', () => {
    const items = [
      { key: 'a', label: 'A', value: 1, color: STATUS.good },
      { key: 'b', label: 'B', value: 2, color: STATUS.warning },
      { key: 'c', label: 'C', value: 123456, color: STATUS.critical },
    ];
    renderPage(<StatusBar label="Findings by status" items={items} />);
    expect(legend()).toEqual([['A', '1', '(0%)'], ['B', '2', '(0%)'], ['C', '123,456', '(100%)']]);
  });


  it('speaks Lithuanian number formats', () => {
    const items = [
      { key: 'met', label: 'Atitinka', value: 1500, color: STATUS.good },
      { key: 'missing', label: 'Neatitinka', value: 500, color: STATUS.critical },
    ];
    renderPage(<StatusBar label="Išvados pagal būseną" items={items} />, { locale: 'lt' });
    const lt = (n) => new Intl.NumberFormat('lt-LT').format(n);
    const pct = (x) => new Intl.NumberFormat('lt-LT', { style: 'percent', maximumFractionDigits: 0 }).format(x);
    expect(segments()[0]).toHaveAttribute('aria-label', `Atitinka: ${lt(1500)} (${pct(0.75)})`);
    expect(legend('Išvados pagal būseną')[0]).toEqual(['Atitinka', lt(1500), `(${pct(0.75)})`]);
    expect(figure('Išvados pagal būseną')).toBeInTheDocument();
  });


  it('renders unicode and markup in the labels as text', () => {
    const label = '💾 Ąžuolas <b>x</b>';
    const { container } = renderPage(<StatusBar label="Findings by status" items={[{ key: 'x', label, value: 1, color: STATUS.good }]} />);
    expect(segments()[0]).toHaveAttribute('aria-label', `${label}: 1 (100%)`);
    expect(legend()[0][0]).toBe(label);
    expect(container.querySelector('b')).toBeNull();
  });
});
