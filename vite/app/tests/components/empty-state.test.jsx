// -----------------------------------------------------------
//  [*] Tests — EmptyState (a list that loaded with no rows)
//
//  The centred "nothing here yet" block every list page and
//  tab shows: the title and the optional explanation as a
//  STATUS message (a search or a filter that leaves nothing
//  must reach a screen reader without moving focus — WCAG
//  4.1.3 — and politely, never as an alert), the decorative
//  icon kept out of the accessibility tree, the call to
//  action as a real control outside the announced words,
//  the caller's className, and text of any shape rendered
//  as text.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import Button from '@mui/material/Button';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { renderPage } from '../support/render';
import EmptyState from '@/components/EmptyState/EmptyState';


// The block itself: the status region's parent (the frame's
// Toaster renders next to it, so the container's first child
// is not it)
const rootOf = () => screen.getByRole('status').parentElement;







// -----------------------------------------------------------
// Content and roles
// -----------------------------------------------------------

describe('EmptyState content', () => {

  it('says what is empty in a status region — the title, then the explanation — and raises no alert', () => {
    renderPage(<EmptyState icon={BusinessOutlinedIcon} title="No companies yet" text="Add the first company to start an analysis." />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('No companies yetAdd the first company to start an analysis.');
    const title = within(status).getByText('No companies yet');
    expect(title.tagName).toBe('P');
    expect(within(status).getByText('Add the first company to start an analysis.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('draws the icon as decoration only — hidden from assistive technology, outside the status', () => {
    renderPage(<EmptyState icon={BusinessOutlinedIcon} title="No companies yet" />);
    const icon = screen.getByTestId('BusinessOutlinedIcon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).not.toContainElement(icon);
    expect(screen.queryByRole('img')).toBeNull();
  });


  it('shows only the title when there is no icon, text or action', () => {
    const { container } = renderPage(<EmptyState title="Nothing matches the filters" />);
    expect(container.querySelector('svg')).toBeNull();
    const status = screen.getByRole('status');
    expect(status.children).toHaveLength(1);
    expect(status).toHaveTextContent(/^Nothing matches the filters$/);
    expect(screen.queryByRole('button')).toBeNull();
  });


  it('an empty explanation adds no second paragraph', () => {
    renderPage(<EmptyState title="Empty" text="" />);
    expect(screen.getByRole('status').children).toHaveLength(1);
  });


  it('renders markup, emoji and Lithuanian letters in the words as plain text', () => {
    const hostile = '💾 Ąžuolas <b>bold</b> <img src=x onerror=alert(1)> {q}';
    const { container } = renderPage(<EmptyState title={hostile} text={`„${hostile}“`} />);
    expect(screen.getByRole('status')).toHaveTextContent(`${hostile}„${hostile}“`);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });


  it('keeps a long explanation to a readable measure, centred', () => {
    const long = 'Nėra jokių įrašų. '.repeat(40);
    renderPage(<EmptyState title="Empty" text={long} />);
    // No layout in jsdom — the utility classes are the witness
    expect(screen.getByText(long.trim())).toHaveClass('max-w-lg');
    expect(rootOf()).toHaveClass('text-center', 'items-center');
  });
});







// -----------------------------------------------------------
// Call to action and styling
// -----------------------------------------------------------

describe('EmptyState action', () => {

  it('offers the call to action as a working control, not part of the announced words', async () => {
    const onClick = vi.fn();
    const { user } = renderPage(
      <EmptyState title="No reports yet" text="Run the first analysis." action={<Button onClick={onClick}>Run analysis</Button>} />
    );
    const button = screen.getByRole('button', { name: 'Run analysis' });
    expect(screen.getByRole('status')).not.toContainElement(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });


  it('reaches the action by keyboard', async () => {
    const onClick = vi.fn();
    const { user } = renderPage(<EmptyState title="No roles" action={<Button onClick={onClick}>Add role</Button>} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Add role' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });


  it('adds the caller\'s className to its own layout classes', () => {
    renderPage(<EmptyState title="Empty" className="border rounded" />);
    expect(rootOf()).toHaveClass('flex', 'flex-col', 'py-10', 'border', 'rounded');
  });
});
