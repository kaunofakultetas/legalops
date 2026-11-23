// -----------------------------------------------------------
//  [*] Tests — UnsavedChangesDialog ("leave without saving?")
//
//  The dialog a dirty form shows while a data-router blocker
//  (useUnsavedChanges → useBlocker) holds a navigation: open
//  only while the blocker is "blocked"; an ALERT dialog named
//  "Unsaved changes" and described by what is at stake (the
//  question read out as it opens); "Stay" (reset — also
//  Escape and the backdrop) keeps the page and the typing,
//  "Leave without saving" (the danger colour) lets the held
//  navigation through; a clean form leaves freely and a tab
//  switch on the same path passes; the blocker's proceed /
//  reset each called once — a double click too — and a
//  blocker without them does not crash; both languages.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { Link, useSearchParams } from 'react-router-dom';
import { renderPage } from '../support/render';
import useUnsavedChanges from '@/hooks/useUnsavedChanges';
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog/UnsavedChangesDialog';


const PAGE = { route: '/companies/c1', path: '/companies/:companyId' };







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// Editor: a page with a field that makes it dirty, a link
// away, a same-path tab switch and the dialog on the real
// blocker. prompt(): the open dialog. The router of
// renderPage shows the "navigated-away" probe on any other
// path.
// -----------------------------------------------------------

function Editor() {
  const [name, setName] = useState('UAB Pavyzdys');
  const [, setParams] = useSearchParams();
  const blocker = useUnsavedChanges(name !== 'UAB Pavyzdys');
  return (
    <>
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Link to="/companies">Back to the list</Link>
      <button type="button" onClick={() => setParams({ tab: 'documents' })}>Documents tab</button>
      <UnsavedChangesDialog blocker={blocker} />
    </>
  );
}

const prompt = () => screen.getByRole('alertdialog', { name: 'Unsaved changes' });

const makeDirty = (user) => user.type(screen.getByLabelText('Name'), ' (edited)');







// -----------------------------------------------------------
// With the data router
// -----------------------------------------------------------

describe('UnsavedChangesDialog with a router blocker', () => {

  it('stays shut while the form is clean — a link simply leaves', async () => {
    const { user } = renderPage(<Editor />, PAGE);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    expect(screen.getByTestId('navigated-away')).toHaveTextContent('/companies');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });


  it('holds a dirty form\'s navigation in a dialog that says what is at stake', async () => {
    const { user, router } = renderPage(<Editor />, PAGE);
    await makeDirty(user);
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    const box = prompt();
    expect(within(box).getByText('You have unsaved changes. Leave this page anyway?')).toBeInTheDocument();
    // An alert dialog, its question read out with its title
    // as it opens — not a plain dialog
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(box).toHaveAccessibleDescription('You have unsaved changes. Leave this page anyway?');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(box).getAllByRole('button').map((b) => b.textContent)).toEqual(['Stay', 'Leave without saving']);
    expect(within(box).getByRole('button', { name: 'Leave without saving' })).toHaveClass('MuiButton-colorDelete');
    expect(router.state.location.pathname).toBe('/companies/c1');
  });


  it('"Stay" keeps the page and the typing, and closes the dialog', async () => {
    const { user, router } = renderPage(<Editor />, PAGE);
    await makeDirty(user);
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    await user.click(within(prompt()).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/companies/c1');
    expect(screen.getByLabelText('Name')).toHaveValue('UAB Pavyzdys (edited)');
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('"Leave without saving" lets the held navigation through', async () => {
    const { user } = renderPage(<Editor />, PAGE);
    await makeDirty(user);
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    await user.click(within(prompt()).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(/^\/companies$/);
  });


  it('Escape and the backdrop mean "stay"', async () => {
    const { user, router } = renderPage(<Editor />, PAGE);
    await makeDirty(user);
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/companies/c1');

    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    fireEvent.click(prompt().closest('.MuiDialog-root').querySelector('.MuiBackdrop-root'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/companies/c1');
  });


  it('asks again on the next attempt after "Stay"', async () => {
    const { user } = renderPage(<Editor />, PAGE);
    await makeDirty(user);
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    await user.click(within(prompt()).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    expect(prompt()).toBeInTheDocument();
  });


  it('lets a same-path move (a tab switch in the query) pass while dirty', async () => {
    const { user, router } = renderPage(<Editor />, PAGE);
    await makeDirty(user);
    await user.click(screen.getByRole('button', { name: 'Documents tab' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(router.state.location.search).toBe('?tab=documents');
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderPage(<Editor />, { ...PAGE, locale: 'lt' });
    await makeDirty(user);
    await user.click(screen.getByRole('link', { name: 'Back to the list' }));
    const box = screen.getByRole('alertdialog', { name: 'Neišsaugoti pakeitimai' });
    expect(within(box).getByText('Turite neišsaugotų pakeitimų. Ar tikrai norite išeiti iš šio puslapio?')).toBeInTheDocument();
    expect(box).toHaveAccessibleDescription('Turite neišsaugotų pakeitimų. Ar tikrai norite išeiti iš šio puslapio?');
    expect(within(box).getAllByRole('button').map((b) => b.textContent)).toEqual(['Likti', 'Išeiti neišsaugojus']);
  });
});







// -----------------------------------------------------------
// With a blocker double
// -----------------------------------------------------------
//
// The dialog only reads blocker.state and calls reset /
// proceed — a plain object shows the exact calls.
// -----------------------------------------------------------

describe('UnsavedChangesDialog blocker calls', () => {

  const blocked = () => ({ state: 'blocked', reset: vi.fn(), proceed: vi.fn(), location: { pathname: '/elsewhere' } });


  it.each([['unblocked'], ['proceeding']])('is shut while the blocker is %s', (state) => {
    renderPage(<UnsavedChangesDialog blocker={{ state, reset: vi.fn(), proceed: vi.fn() }} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });


  it('Stay calls reset once, Leave calls proceed once — never the other', async () => {
    const blocker = blocked();
    const { user } = renderPage(<UnsavedChangesDialog blocker={blocker} />);
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(blocker.reset).toHaveBeenCalledTimes(1);
    expect(blocker.proceed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(blocker.proceed).toHaveBeenCalledTimes(1);
    expect(blocker.reset).toHaveBeenCalledTimes(1);
  });


  it('a double click on "Leave without saving" proceeds once', async () => {
    const blocker = blocked();
    const { user } = renderPage(<UnsavedChangesDialog blocker={blocker} />);
    await user.dblClick(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(blocker.proceed).toHaveBeenCalledTimes(1);
  });


  it('survives a blocker without reset and proceed', async () => {
    const { user } = renderPage(<UnsavedChangesDialog blocker={{ state: 'blocked' }} />);
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(screen.queryByTestId('render-crashed')).toBeNull();
  });
});
