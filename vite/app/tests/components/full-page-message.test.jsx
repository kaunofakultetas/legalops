// -----------------------------------------------------------
//  [*] Tests — FullPageMessage (the whole-screen notice)
//
//  The card for the states no page frame can render in (the
//  session check cannot reach the server, the route tree
//  crashed): both callers show a FAILURE, so the card is an
//  alert — a decorative icon, the page's one h1, the
//  sentence, the technical details collapsed behind their
//  summary (opening on click and from the keyboard), the
//  way-out buttons — and each optional part is simply
//  absent without its prop.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import Button from '@mui/material/Button';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import { renderPage } from '../support/render';
import FullPageMessage from '@/components/layout/FullPageMessage';


// A ServerUnreachable-shaped card
const full = (props = {}) => (
  <FullPageMessage
    icon={CloudOffOutlinedIcon}
    title="Server unreachable"
    text="Could not reach the server. Check your internet connection."
    details="HTTP 502 · BAD_GATEWAY"
    detailsLabel="Technical details"
    actions={<><Button>Try again</Button><Button>Sign in again</Button></>}
    {...props}
  />
);







// -----------------------------------------------------------
// The card
// -----------------------------------------------------------

describe('FullPageMessage', () => {

  it('is an alert card — a failure — with the page\'s h1, the sentence and the way out', () => {
    renderPage(full());
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { level: 1, name: 'Server unreachable' })).toBeInTheDocument();
    expect(within(alert).getByText('Could not reach the server. Check your internet connection.')).toBeInTheDocument();
    expect(within(alert).getAllByRole('button').map((b) => b.textContent)).toEqual(['Try again', 'Sign in again']);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });


  it('keeps the icon decorative', () => {
    renderPage(full());
    const icon = screen.getByTestId('CloudOffOutlinedIcon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });


  it('keeps the technical details collapsed behind their summary until asked for', async () => {
    const { user } = renderPage(full());
    const summary = screen.getByText('Technical details');
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('HTTP 502 · BAD_GATEWAY').tagName).toBe('PRE');

    await user.click(summary);
    expect(details).toHaveAttribute('open');
    await user.click(summary);
    expect(details).not.toHaveAttribute('open');
  });


  it('keeps a long stack readable: the details wrap instead of scrolling the card sideways', () => {
    const stack = `TypeError: x is undefined\n${'    at someFunction (https://example.lt/assets/index-abc123.js:1:23456)\n'.repeat(30)}`;
    renderPage(full({ details: stack }));
    const pre = screen.getByText((_, node) => node?.tagName === 'PRE');
    expect(pre.textContent).toBe(stack);
    // No layout in jsdom — the utility class is the witness
    expect(pre).toHaveClass('whitespace-pre-wrap');
  });


  it('shows only the title when nothing else is given', () => {
    const { container } = renderPage(<FullPageMessage title="Something went wrong" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/^Something went wrong$/);
    expect(alert.children).toHaveLength(1);
    expect(container.querySelector('svg, details')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });


  it('the actions work', async () => {
    const onRetry = vi.fn();
    const { user } = renderPage(full({ actions: <Button onClick={onRetry}>Try again</Button> }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });


  it('fills the screen on the canvas colour, with the card centred', () => {
    renderPage(full());
    const screenBox = screen.getByRole('alert').parentElement;
    // No layout in jsdom — the utility classes are the witness
    expect(screenBox).toHaveClass('min-h-dvh', 'flex', 'items-center', 'justify-center', 'bg-canvas');
    expect(screen.getByRole('alert')).toHaveClass('MuiPaper-root', 'max-w-md', 'w-full');
  });


  it('renders markup and unicode in every text as text', () => {
    const hostile = '💾 Ąžuolas <script>alert(1)</script>';
    const { container } = renderPage(full({ title: hostile, text: hostile, details: hostile, detailsLabel: hostile }));
    expect(screen.getByRole('heading', { level: 1, name: hostile })).toBeInTheDocument();
    expect(screen.getAllByText(hostile)).toHaveLength(4);
    expect(container.querySelector('script')).toBeNull();
  });
});
