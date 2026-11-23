// -----------------------------------------------------------
//  [*] Tests — Audit page: opening an entry from the keyboard
//
//  A row click opens the entry dialog, but a DataGrid row
//  click is mouse-only; the time cell is a real button named
//  after the entry, so a keyboard user reaches it with Tab
//  and opens the same dialog with Enter or Space (DataTable
//  keeps the grid from taking Space as its "page down"), and
//  the focus comes back to it when the dialog closes. The
//  rest of the page is covered by audit.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import Audit from '@/pages/Audit/Audit';


// The newest entry (fixtures auditEntries[0]): the analysis the
// administrator started at 09:40
const NEWEST = 'Open the entry of 27/09/2026, 09:40';

const renderAudit = (options = {}) => renderPage(<Audit authData={authData} />, { route: '/audit', path: '/audit', ...options });







// -----------------------------------------------------------
// The time button
// -----------------------------------------------------------

describe('Audit — opening an entry from the keyboard', () => {

  it('the time of every row is a button named after the entry, in the tab order', async () => {
    const { user } = renderAudit();
    const button = await screen.findByRole('button', { name: NEWEST });
    expect(button).toHaveTextContent('27/09/2026, 09:40');
    expect(screen.getAllByRole('button', { name: /^Open the entry of / })).toHaveLength(16);
    button.focus();
    await user.tab();
    expect(button).not.toHaveFocus();
    await user.tab({ shift: true });
    expect(button).toHaveFocus();
  });


  it('Enter on the time opens the entry, and closing the dialog gives the focus back', async () => {
    const { user } = renderAudit();
    const button = await screen.findByRole('button', { name: NEWEST });
    button.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('Analysis started')).toBeInTheDocument();
    expect(within(dialog).getByText('27/09/2026, 09:40 · Rūta Administratorė · 203.0.113.10')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  });


  it('Space on the time opens the entry as well — the grid leaves the key to the button', async () => {
    const { user } = renderAudit();
    const button = await screen.findByRole('button', { name: NEWEST });
    button.focus();
    await user.keyboard(' ');
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('27/09/2026, 09:40 · Rūta Administratorė · 203.0.113.10')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });


  it('a click on the time opens that one entry, once', async () => {
    const { user } = renderAudit();
    await user.click(await screen.findByRole('button', { name: 'Open the entry of 12/09/2026, 07:58' }));
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('12/09/2026, 07:58 · System · 198.51.100.23')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });


  it('names the button in Lithuanian', async () => {
    renderAudit({ locale: 'lt' });
    expect(await screen.findByRole('button', { name: 'Atidaryti 2026-09-27 09:40 įrašą' })).toBeInTheDocument();
  });
});
