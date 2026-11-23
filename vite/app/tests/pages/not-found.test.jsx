// -----------------------------------------------------------
//  [*] Tests — NotFound page (pages/NotFound/NotFound.jsx)
//
//  The "*" route's page and the admin-only refusal PageWrapper
//  shows in its place: both inside the normal frame (navbar,
//  sidebar, the main landmark with the h1 title), each with
//  its own decorative icon and sentence, both with the way
//  home and to the overview as real links (a navigation, not
//  a reload). A state description, never an alert. Both
//  roles, both languages, and once through the real route
//  table.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import NotFound from '@/pages/NotFound/NotFound';
import { renderPage, renderApp, authData, userAuthData } from '../support/render';
import { given } from '../support/backend/server';


// The page on an unknown path; other paths render the
// "navigated away" probe
const mountNotFound = (props = {}, options = {}) => renderPage(
  <NotFound authData={authData} {...props} />,
  { route: '/no/such/page', path: '/no/such/page', ...options },
);

const main = () => screen.getByRole('main');







// -----------------------------------------------------------
// page not found
// -----------------------------------------------------------

describe('NotFound — an unknown path', () => {

  it('says "Page not found" inside the frame, with its sentence and a decorative search-off icon', () => {
    mountNotFound();
    expect(within(main()).getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(within(main()).getByText('There is no such page. The link may be out of date or the address mistyped.')).toBeInTheDocument();
    const icon = within(main()).getByTestId('SearchOffOutlinedIcon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(within(main()).queryByTestId('LockOutlinedIcon')).toBeNull();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);
  });


  it('is a state, not a failure — nothing on it is announced as an alert', () => {
    mountNotFound();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('offers the way home and to the overview as real links', () => {
    mountNotFound();
    expect(within(main()).getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(within(main()).getByRole('link', { name: 'Go to the overview' })).toHaveAttribute('href', '/dashboard');
  });


  it('"Go home" navigates in the app — no reload', async () => {
    const { user, router } = mountNotFound();
    await user.click(within(main()).getByRole('link', { name: 'Go home' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByTestId('navigated-away')).toHaveTextContent('/');
    expect(window.location.navigations).toEqual([]);
    expect(window.location.reloads).toBe(0);
  });


  it('"Go to the overview" opens the dashboard', async () => {
    const { user, router } = mountNotFound();
    await user.click(within(main()).getByRole('link', { name: 'Go to the overview' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(screen.getByTestId('navigated-away')).toHaveTextContent('/dashboard');
  });


  it('speaks Lithuanian', () => {
    mountNotFound({}, { locale: 'lt' });
    expect(within(main()).getByRole('heading', { level: 1, name: 'Puslapis nerastas' })).toBeInTheDocument();
    expect(within(main()).getByText('Tokio puslapio nėra. Galbūt nuoroda pasenusi arba adresas surinktas su klaida.')).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'Į pradžią' })).toHaveAttribute('href', '/');
    expect(within(main()).getByRole('link', { name: 'Į apžvalgą' })).toHaveAttribute('href', '/dashboard');
  });
});







// -----------------------------------------------------------
// access restricted
// -----------------------------------------------------------

describe('NotFound — forbidden (an admin-only page opened by a user)', () => {

  it('says "Access restricted" with the lock icon and the admin-only sentence', () => {
    mountNotFound({ authData: userAuthData, forbidden: true });
    expect(within(main()).getByRole('heading', { level: 1, name: 'Access restricted' })).toBeInTheDocument();
    expect(within(main()).getByText('This page is for administrators only.')).toBeInTheDocument();
    expect(within(main()).getByTestId('LockOutlinedIcon')).toHaveAttribute('aria-hidden', 'true');
    expect(within(main()).queryByTestId('SearchOffOutlinedIcon')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('offers the same two ways out', () => {
    mountNotFound({ authData: userAuthData, forbidden: true });
    expect(within(main()).getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(within(main()).getByRole('link', { name: 'Go to the overview' })).toHaveAttribute('href', '/dashboard');
  });


  it('keeps the frame the plain user\'s: their name on the account menu, no admin links in the sidebar', () => {
    mountNotFound({ authData: userAuthData, forbidden: true });
    expect(screen.getByRole('button', { name: 'Account menu: Jonas Naudotojas' })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];
    for (const name of ['Users', 'Audit log', 'AI prompts', 'MCP servers', 'Obligation review']) {
      expect(within(nav).queryByRole('link', { name })).toBeNull();
    }
    expect(within(nav).getByRole('link', { name: 'Companies' })).toBeInTheDocument();
  });


  it('speaks Lithuanian', () => {
    mountNotFound({ authData: userAuthData, forbidden: true }, { locale: 'lt' });
    expect(within(main()).getByRole('heading', { level: 1, name: 'Prieiga ribojama' })).toBeInTheDocument();
    expect(within(main()).getByText('Šis puslapis skirtas tik administratoriams.')).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'Į pradžią' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// on the real route table
// -----------------------------------------------------------

describe('NotFound — on the real route table', () => {

  it('renders for any unmatched path, titled, in the frame', async () => {
    await renderApp({ route: '/companies/x/documents/nowhere' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Page not found · Compliance assistant'));
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });


  it('the administrator\'s frame shows the admin links', async () => {
    await renderApp({ route: '/nowhere' });
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];
    expect(within(nav).getByRole('link', { name: 'Users' })).toBeInTheDocument();
  });


  it('the forbidden variant takes an admin page\'s place for a plain user, in Lithuanian too', async () => {
    given.json('get', '/api/auth/me', userAuthData);
    await renderApp({ route: '/settings/mcp', locale: 'lt' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Prieiga ribojama' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('MCP serveriai · Atitikties asistentas'));
  });
});
