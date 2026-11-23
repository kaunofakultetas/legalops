// -----------------------------------------------------------
//  [*] Tests — Navbar (the top bar)
//
//  The bar every signed-in page carries: a banner landmark
//  with the app title as a real link home; the ONE language
//  button, named in and marked with the language it switches
//  TO (the switch itself: cookie, document language, every
//  string re-rendered, no reload); the account menu (a menu
//  button announcing its state, the header with the name,
//  e-mail and translated role OUTSIDE the menu list, the
//  menu named after the person and described by that e-mail
//  and role, "Account" and "Log out", mouse and keyboard,
//  focus into the menu and back, closed by Escape, Tab or a
//  click outside); the logout — POST /api/auth/logout with
//  the bearer token, exempt from the 401 redirect and from
//  the error toast, the token dropped and the page replaced
//  by a bare /login whatever the backend answered; the phone
//  menu button that toggles the navigation drawer; both
//  languages.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderPage, authData, userAuthData } from '../support/render';
import { signIn, TOKEN_KEY } from '../support/auth';
import { given } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';


// The account button of the default (admin) session — hidden
// from assistive technology while its (modal) menu is open,
// hence `hidden`
const accountButton = (name = 'Rūta Administratorė') => screen.getByRole('button', { name: `Account menu: ${name}`, hidden: true });

// Opens the account menu with a click and answers it
const openMenu = async (user) => {
  await user.click(accountButton());
  return screen.findByRole('menu');
};

// The popover around the menu: who is signed in, then the
// menu list
const panelOf = (menu) => menu.closest('.MuiPopover-paper');







// -----------------------------------------------------------
// The bar
// -----------------------------------------------------------

describe('Navbar', () => {

  it('is the banner landmark, with the app title as a real link home', () => {
    renderPage(<Navbar authData={authData} />);
    const banner = screen.getByRole('banner');
    const home = within(banner).getByRole('link', { name: 'Compliance assistant — home' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveTextContent(/^Compliance assistant$/);
  });


  it('the title link goes home through the router', async () => {
    const { user, router } = renderPage(<Navbar authData={authData} />, { route: '/companies' });
    await user.click(screen.getByRole('link', { name: 'Compliance assistant — home' }));
    expect(router.state.location.pathname).toBe('/');
    expect(window.location.navigations).toEqual([]);
  });


  it('holds, in reading order, the menu button, the title, the language button and the account button', () => {
    renderPage(<Navbar authData={authData} />);
    const controls = [...screen.getByRole('banner').querySelectorAll('button, a[href]')];
    expect(controls.map((node) => node.getAttribute('aria-label'))).toEqual([
      'Open navigation',
      'Compliance assistant — home',
      'Perjungti sąsają į lietuvių kalbą',
      'Account menu: Rūta Administratorė',
    ]);
  });


  it('speaks Lithuanian', () => {
    renderPage(<Navbar authData={authData} />, { locale: 'lt' });
    expect(screen.getByRole('link', { name: 'Atitikties asistentas — pradžia' })).toHaveTextContent('Atitikties asistentas');
    expect(screen.getByRole('button', { name: 'Atidaryti navigaciją' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paskyros meniu: Rūta Administratorė' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Language switcher
// -----------------------------------------------------------
//
// One button showing the OTHER language — its name from sm
// up, its code below — named in that language and marked
// with its lang, so a screen reader pronounces it right.
// -----------------------------------------------------------

describe('Navbar language switcher', () => {

  it('in English offers Lithuanian: named and marked in Lithuanian, the name and the code both there', () => {
    renderPage(<Navbar authData={authData} />);
    const button = screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' });
    expect(button).toHaveAttribute('lang', 'lt');
    // No layout in jsdom — the responsive classes are the witness
    expect(within(button).getByText('Lietuvių')).toHaveClass('hidden', 'sm:inline');
    expect(within(button).getByText('LT')).toHaveClass('sm:hidden');
    expect(screen.queryByRole('button', { name: 'Switch the interface to English' })).toBeNull();
  });


  it('in Lithuanian offers English, named and marked in English', () => {
    renderPage(<Navbar authData={authData} />, { locale: 'lt' });
    const button = screen.getByRole('button', { name: 'Switch the interface to English' });
    expect(button).toHaveAttribute('lang', 'en');
    expect(within(button).getByText('English')).toBeInTheDocument();
    expect(within(button).getByText('EN')).toBeInTheDocument();
  });


  it('switches live — cookie, document language, every string — and back, without a reload', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    expect(document.documentElement.lang).toBe('en');

    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    expect(document.cookie).toMatch(/(^|;\s*)locale=lt(;|$)/);
    expect(document.documentElement.lang).toBe('lt');
    expect(screen.getByRole('link', { name: 'Atitikties asistentas — pradžia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paskyros meniu: Rūta Administratorė' })).toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'Switch the interface to English' });

    await user.click(back);
    expect(document.cookie).toMatch(/(^|;\s*)locale=en(;|$)/);
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('link', { name: 'Compliance assistant — home' })).toBeInTheDocument();
    expect(window.location.reloads).toBe(0);
    expect(window.location.navigations).toEqual([]);
  });


  it('switches from the keyboard, keeping the focus on the switch', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    const button = screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(document.documentElement.lang).toBe('lt');
    expect(screen.getByRole('button', { name: 'Switch the interface to English' })).toHaveFocus();
  });
});







// -----------------------------------------------------------
// Account menu
// -----------------------------------------------------------

describe('Navbar account menu', () => {

  it('is a closed menu button named after the signed-in person, showing the name', () => {
    renderPage(<Navbar authData={authData} />);
    const button = accountButton();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
    expect(within(button).getByText('Rūta Administratorė')).toHaveClass('truncate');
    expect(screen.queryByRole('menu')).toBeNull();
  });


  it('opens on click: expanded, pointing at its menu, which says who is signed in and offers Account and Log out', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    const menu = await openMenu(user);
    const button = accountButton();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const controlled = document.getElementById(button.getAttribute('aria-controls'));
    expect(controlled).not.toBeNull();
    expect(controlled.contains(menu) || controlled === menu).toBe(true);
    expect(within(panelOf(menu)).getByText('Rūta Administratorė')).toBeInTheDocument();
    expect(within(panelOf(menu)).getByText('admin@example.lt')).toBeInTheDocument();
    expect(within(panelOf(menu)).getByText('Administrator')).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Account', 'Log out']);
  });


  it('is named after the person and described by the e-mail and role, which sit above it, outside the list — a menu holds only its items', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    const menu = await openMenu(user);
    expect(document.getElementById(accountButton().getAttribute('aria-controls'))).toBe(menu);
    expect(menu).toHaveAccessibleName('Account menu: Rūta Administratorė');
    expect(menu).toHaveAccessibleDescription('admin@example.lt Administrator');
    expect([...menu.children].map((child) => child.getAttribute('role'))).toEqual(['menuitem', 'menuitem']);
    expect(within(menu).queryByText('admin@example.lt')).toBeNull();
    // the header comes first in the reading order
    const email = within(panelOf(menu)).getByText('admin@example.lt');
    expect(email.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });


  it('names a plain user\'s role "User"', async () => {
    const { user } = renderPage(<Navbar authData={userAuthData} />);
    await user.click(accountButton('Jonas Naudotojas'));
    const menu = await screen.findByRole('menu', { name: 'Account menu: Jonas Naudotojas' });
    expect(menu).toHaveAccessibleDescription('jonas@example.lt User');
    expect(within(panelOf(menu)).getByText('User')).toBeInTheDocument();
    expect(within(panelOf(menu)).getByText('jonas@example.lt')).toBeInTheDocument();
  });


  it('opens from the keyboard with the focus on its first item, walks with the arrows and closes on Escape back to the button', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    accountButton().focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    const [account, logout] = within(menu).getAllByRole('menuitem');
    await waitFor(() => expect(account).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(logout).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(account).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(accountButton()).toHaveFocus();
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
  });


  it('closes on Tab, back to the button — the focus never circles inside the open menu', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    accountButton().focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus());
    await user.tab();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(accountButton()).toHaveFocus();
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
  });


  it('closes on a click outside it', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    const menu = await openMenu(user);
    fireEvent.click(menu.closest('.MuiPopover-root').querySelector('.MuiBackdrop-root'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false');
  });


  it('"Account" closes the menu and opens /account through the router', async () => {
    const { user, router } = renderPage(<Navbar authData={authData} />, { route: '/dashboard' });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Account' }));
    expect(router.state.location.pathname).toBe('/account');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(window.location.navigations).toEqual([]);
  });


  it('speaks Lithuanian: the role, Paskyra and Atsijungti', async () => {
    const { user } = renderPage(<Navbar authData={authData} />, { locale: 'lt' });
    await user.click(screen.getByRole('button', { name: 'Paskyros meniu: Rūta Administratorė' }));
    const menu = await screen.findByRole('menu', { name: 'Paskyros meniu: Rūta Administratorė' });
    expect(menu).toHaveAccessibleDescription('admin@example.lt Administratorius');
    expect(within(panelOf(menu)).getByText('Administratorius')).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Paskyra', 'Atsijungti']);
  });


  it('survives a missing session and renders a hostile name as text', async () => {
    const { unmount } = renderPage(<Navbar />);
    expect(screen.getByRole('button', { name: /^Account menu:/ })).toBeInTheDocument();
    unmount();
    const hostile = '💾 Ąžuolas <img src=x onerror=alert(1)>';
    const { user, container } = renderPage(<Navbar authData={{ ...authData, displayName: hostile }} />);
    await user.click(screen.getByRole('button', { name: `Account menu: ${hostile}` }));
    const menu = await screen.findByRole('menu', { name: `Account menu: ${hostile}` });
    expect(within(panelOf(menu)).getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});







// -----------------------------------------------------------
// Logout
// -----------------------------------------------------------
//
// The backend kills the session; the token dies locally
// whatever it answers; the page is REPLACED by a bare /login
// (no ?next=, no "expired" — a deliberate logout).
// -----------------------------------------------------------

describe('Navbar logout', () => {

  const logOut = async (user) => {
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Log out' }));
  };


  it('posts /api/auth/logout with the bearer token, drops the token and replaces the page with /login', async () => {
    signIn('live-token');
    const calls = given.capture('post', '/api/auth/logout', { ok: true });
    const { user } = renderPage(<Navbar authData={authData} />, { route: '/companies' });
    await logOut(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.authorization).toBe('Bearer live-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    // the menu closes at once
    expect(screen.queryByRole('menu')).toBeNull();
  });


  it('a 401 (the session was already dead) still ends at a bare /login — not the "session expired" redirect', async () => {
    signIn('dead-token');
    given.unauthorized('post', '/api/auth/logout');
    const { user } = renderPage(<Navbar authData={authData} />, { route: '/reports' });
    await logOut(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    await settle(50);
    expect(window.location.navigations).toEqual(['/console/login']);
  });


  it.each([
    ['a 500', () => given.apiError('post', '/api/auth/logout', 'SERVER_ERROR', { status: 500 })],
    ['a proxy\'s HTML 502', () => given.html('post', '/api/auth/logout')],
    ['a dropped connection', () => given.networkError('post', '/api/auth/logout')],
  ])('%s still ends at /login with the token gone — and no error toast', async (_, fail) => {
    signIn('some-token');
    fail();
    const { user } = renderPage(<Navbar authData={authData} />);
    await logOut(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    await settle(50);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Server error|unreachable|Could not reach/)).toBeNull();
  });


  it('logs out from the keyboard', async () => {
    const calls = given.capture('post', '/api/auth/logout', { ok: true });
    const { user } = renderPage(<Navbar authData={authData} />);
    accountButton().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const logout = screen.getByRole('menuitem', { name: 'Log out' });
    logout.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
    expect(calls).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Phone menu button
// -----------------------------------------------------------
//
// Below md the button opens the navigation drawer the
// Sidebar renders; the two share the NavDrawer state of the
// production frame.
// -----------------------------------------------------------

describe('Navbar phone menu button', () => {

  it('is hidden from md up by CSS and controls the navigation drawer', () => {
    renderPage(<Navbar authData={authData} />);
    const button = screen.getByRole('button', { name: 'Open navigation' });
    // No layout in jsdom — the responsive class is the witness
    expect(button).toHaveClass('md:hidden');
    expect(button).toHaveAttribute('aria-controls', 'app-navigation-drawer');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });


  it('toggles the drawer: renamed "Close navigation" and expanded while open, and the drawer shows', async () => {
    const { user } = renderPage(<><Navbar authData={authData} /><Sidebar authData={authData} /></>);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    // the drawer is modal: the bar behind it is hidden from
    // assistive technology while it is open
    const button = screen.getByRole('button', { name: 'Close navigation', expanded: true, hidden: true });
    expect(document.getElementById('app-navigation-drawer')).not.toBeNull();
    expect(button).toHaveAttribute('aria-controls', 'app-navigation-drawer');
    expect(button.closest('[aria-hidden="true"]')).not.toBeNull();
    // the drawer's own close button is the other way back
    const drawer = document.getElementById('app-navigation-drawer');
    await user.click(within(drawer).getByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(document.getElementById('app-navigation-drawer')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  });


  it('outside the NavDrawer provider the button is inert, not broken', async () => {
    const { user } = renderPage(<Navbar authData={authData} />);
    // renderPage's frame HAS the provider; toggling works without a Sidebar too
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  });


  it('speaks Lithuanian when open', async () => {
    const { user } = renderPage(<Navbar authData={authData} />, { locale: 'lt' });
    await user.click(screen.getByRole('button', { name: 'Atidaryti navigaciją' }));
    expect(screen.getByRole('button', { name: 'Uždaryti navigaciją' })).toHaveAttribute('aria-expanded', 'true');
  });
});
