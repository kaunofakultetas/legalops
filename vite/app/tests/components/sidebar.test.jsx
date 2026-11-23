// -----------------------------------------------------------
//  [*] Tests — Sidebar (the navigation, filtered by role)
//
//  The left navigation on its own inside the production
//  frame: the column as the "Main navigation" landmark with
//  its five titled sections, each a GROUP named by its title
//  (the grouping a sighted user sees, told to a screen reader
//  too; the title written and shown in sentence case); every
//  link and its page; the admin-only links
//  and the empty Administration section kept from a plain
//  user (or no session); aria-current="page" on the link the
//  path belongs to — exact routes and the nested detail pages
//  (/chat/…, /companies/…, /reports/…, /corpus/…,
//  /prompts/…) — never on a look-alike path; the router
//  moving it; the pin and the rail: pinned by default, the
//  column folded to a rail of icons by its pin button (an
//  ink bar with the pin alone, the words in its name and
//  tooltip) and
//  remembered across pages, the rail opened over the page by
//  the pointer or the keyboard focus and folded a moment
//  after either leaves, the words only faded so every link
//  and group keeps its name; and the phone drawer: closed by default, a
//  modal dialog NAMED like the navigation, with the app title
//  and a close button, the same sections, closed by a link, a
//  route change, its close button, Escape, the backdrop, and
//  by the window growing past md — where it never opens.
//  Both languages.
// -----------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import { renderPage, renderRoutes, authData, userAuthData } from '../support/render';
import { mediaQueryMatches } from '../support/setup';
import { useNavDrawer } from '@/components/layout/NavDrawer';
import Sidebar from '@/components/layout/Sidebar';


// MUI's `theme.breakpoints.up('md')` as useMediaQuery asks
// matchMedia for it — the width the sidebar calls "wide"
const WIDE = '(min-width:900px)';

// Every link of the admin's column, in order
const ADMIN_LINKS = [
  ['/', 'Chat'], ['/dashboard', 'Overview'],
  ['/companies', 'Companies'], ['/reports', 'Reports'],
  ['/corpus', 'Legal corpus'], ['/obligations', 'Obligation review'],
  ['/prompts', 'AI prompts'], ['/settings/mcp', 'MCP servers'], ['/users', 'Users'], ['/audit', 'Audit log'],
  ['/usage', 'AI usage'], ['/jobs', 'Jobs'], ['/account', 'Account'],
];

const ADMIN_ONLY = ['/obligations', '/prompts', '/settings/mcp', '/users', '/audit'];

// The pin's localStorage key (Sidebar.jsx: PINNED_KEY)
const PINNED_KEY = 'sidebar.pinned';


// The matchMedia stub remembers matches across tests — every
// test starts on a phone-width window (jsdom's default here:
// no query matches) unless it says otherwise
beforeEach(() => {
  mediaQueryMatches(WIDE, false);
});







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// column: the permanent column's landmark (the first "Main
// navigation" — the drawer, when open, holds the second).
// linksOf / sectionsOf: the links and the section groups of
// a landmark, in order. current: the link(s) marked as the
// page. panel: the column's panel box, the one the rail
// folds and the fly-over opens. label: a link's words, the
// part the rail fades out. DrawerToggle: the navbar's menu
// button in miniature. OverviewPage / ReportsPage: two pages
// with a sidebar each, as in the app — a page change mounts
// a new one.
// resizableMedia: a matchMedia whose answers follow a window
// width that can change after mount (setup.js's stub
// answers once).
// -----------------------------------------------------------

const column = () => screen.getAllByRole('navigation', { name: 'Main navigation', hidden: true })[0];

const panel = () => column().firstElementChild;

const label = (name) => within(column()).getByRole('link', { name }).lastElementChild;

const linksOf = (landmark) => within(landmark).getAllByRole('link', { hidden: true }).map((a) => [a.getAttribute('href'), a.textContent]);

const sectionsOf = (landmark) => within(landmark).getAllByRole('group', { hidden: true }).map((group) => ({
  name: group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby'))?.textContent,
  links: within(group).getAllByRole('link', { hidden: true }).map((a) => a.textContent),
}));

const current = (landmark = column()) => within(landmark).queryAllByRole('link', { hidden: true })
  .filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent);

const drawer = () => document.getElementById('app-navigation-drawer');

function OverviewPage() {
  return <><Sidebar authData={authData} /><main>The overview</main></>;
}

function ReportsPage() {
  return <><Sidebar authData={authData} /><main>The reports</main></>;
}

const TWO_PAGES = [{ path: '/dashboard', element: <OverviewPage /> }, { path: '/reports', element: <ReportsPage /> }];

function DrawerToggle() {
  const { open, toggle } = useNavDrawer();
  return <button type="button" onClick={toggle}>{open ? 'drawer is open' : 'open the drawer'}</button>;
}

const openDrawer = async (user) => {
  await user.click(screen.getByRole('button', { name: 'open the drawer' }));
  return screen.findByRole('dialog', { name: 'Main navigation' });
};

function resizableMedia(initialWidth) {
  let width = initialWidth;
  const lists = [];
  const matches = (query) => {
    const max = query.match(/max-width:\s*([\d.]+)px/);
    const min = query.match(/min-width:\s*([\d.]+)px/);
    if (max) return width <= Number(max[1]);
    if (min) return width >= Number(min[1]);
    return false;
  };
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const listeners = new Set();
    const list = {
      media: query,
      get matches() { return matches(query); },
      onchange: null,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      dispatchEvent: () => false,
      listeners,
    };
    lists.push(list);
    return list;
  });
  return {
    resize(next) {
      width = next;
      act(() => {
        for (const list of lists) for (const fn of list.listeners) fn({ matches: list.matches, media: list.media });
      });
    },
  };
}







// -----------------------------------------------------------
// Sections and links
// -----------------------------------------------------------

describe('Sidebar sections', () => {

  it('is the "Main navigation" landmark: five sections, each a group named by its title', () => {
    renderPage(<Sidebar authData={authData} />);
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(1);
    expect(sectionsOf(column())).toEqual([
      { name: 'Main', links: ['Chat', 'Overview'] },
      { name: 'Compliance', links: ['Companies', 'Reports'] },
      { name: 'Law', links: ['Legal corpus', 'Obligation review'] },
      { name: 'Administration', links: ['AI prompts', 'MCP servers', 'Users', 'Audit log'] },
      { name: 'System', links: ['AI usage', 'Jobs', 'Account'] },
    ]);
    // the titles are words, not links or headings
    expect(within(column()).queryAllByRole('heading')).toHaveLength(0);
  });


  it('writes and shows the section titles in sentence case — a screen reader reads "Law", never spells "L-A-W"', () => {
    renderPage(<Sidebar authData={authData} />);
    const titles = within(column()).getAllByRole('group').map((group) => document.getElementById(group.getAttribute('aria-labelledby')));
    expect(titles.map((title) => title.textContent)).toEqual(['Main', 'Compliance', 'Law', 'Administration', 'System']);
    // No CSS in jsdom — the utility class is the witness
    for (const title of titles) expect(title).not.toHaveClass('uppercase');
    for (const group of within(column()).getAllByRole('group')) expect(group).not.toHaveAccessibleName(/^[A-ZĄČĘĖĮŠŲŪŽ]{2,}$/);
  });


  it('points every link at its page', () => {
    renderPage(<Sidebar authData={authData} />);
    expect(linksOf(column())).toEqual(ADMIN_LINKS);
  });


  it('keeps the icons decorative — every link\'s and the pin button\'s', () => {
    renderPage(<Sidebar authData={authData} />);
    const icons = column().querySelectorAll('svg');
    expect(icons).toHaveLength(ADMIN_LINKS.length + 1);
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true');
  });


  it('hides the admin-only links from a plain user — and the Administration section with them', () => {
    renderPage(<Sidebar authData={userAuthData} />);
    expect(sectionsOf(column())).toEqual([
      { name: 'Main', links: ['Chat', 'Overview'] },
      { name: 'Compliance', links: ['Companies', 'Reports'] },
      { name: 'Law', links: ['Legal corpus'] },
      { name: 'System', links: ['AI usage', 'Jobs', 'Account'] },
    ]);
    const hrefs = linksOf(column()).map(([href]) => href);
    for (const href of ADMIN_ONLY) expect(hrefs).not.toContain(href);
    expect(screen.queryByText('Administration')).toBeNull();
  });


  it.each([
    ['no session', undefined], ['a session without a role', { ...authData, role: undefined }], ['an unknown role', { ...authData, role: 'superuser' }],
  ])('treats %s as a plain user', (_, session) => {
    renderPage(<Sidebar authData={session} />);
    const hrefs = linksOf(column()).map(([href]) => href);
    for (const href of ADMIN_ONLY) expect(hrefs).not.toContain(href);
    expect(hrefs).toContain('/companies');
  });


  it('speaks Lithuanian', () => {
    renderPage(<Sidebar authData={authData} />, { locale: 'lt' });
    const nav = screen.getByRole('navigation', { name: 'Pagrindinė navigacija' });
    expect(sectionsOf(nav).map((section) => section.name)).toEqual(['Pagrindinis', 'Atitiktis', 'Teisė', 'Administravimas', 'Sistema']);
    expect(within(nav).getByRole('link', { name: 'Pokalbis' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Teisės aktų bazė' })).toHaveAttribute('href', '/corpus');
    expect(within(nav).getByRole('link', { name: 'Veiksmų žurnalas' })).toHaveAttribute('href', '/audit');
  });


  it('gives each section group its own title id, also when the drawer repeats the sections', async () => {
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    await openDrawer(user);
    const ids = [...document.querySelectorAll('[role="group"][aria-labelledby]')].map((g) => g.getAttribute('aria-labelledby'));
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });
});







// -----------------------------------------------------------
// Active link
// -----------------------------------------------------------
//
// aria-current="page" marks the one link the path belongs
// to; the brand tint and the left bar show it.
// -----------------------------------------------------------

describe('Sidebar active link', () => {

  it.each([
    ['/', ['Chat']],
    ['/chat/ca000000-0000-4000-8000-000000000001', ['Chat']],
    ['/dashboard', ['Overview']],
    ['/companies', ['Companies']],
    ['/companies/c0000000-0000-4000-8000-000000000001', ['Companies']],
    ['/reports', ['Reports']],
    ['/reports/e0000000-0000-4000-8000-000000000002', ['Reports']],
    ['/corpus', ['Legal corpus']],
    ['/corpus/d0000000-0000-4000-8000-000000000003', ['Legal corpus']],
    ['/obligations', ['Obligation review']],
    ['/prompts', ['AI prompts']],
    ['/prompts/gap-analysis', ['AI prompts']],
    ['/settings/mcp', ['MCP servers']],
    ['/users', ['Users']],
    ['/users/', ['Users']],
    ['/audit', ['Audit log']],
    ['/usage', ['AI usage']],
    ['/jobs', ['Jobs']],
    ['/account', ['Account']],
    ['/login', []],
    ['/nowhere', []],
    ['/companiesx', []],
    ['/chatroom', []],
    ['/settings', []],
    ['/dashboard/extra', []],
    ['/users/a0000000-0000-4000-8000-000000000002', []],
  ])('on %s the current link is %j', (route, expected) => {
    renderPage(<Sidebar authData={authData} />, { route });
    expect(current()).toEqual(expected);
  });


  it('paints the current link with the blue tint and the yellow stripe, the others plain', () => {
    renderPage(<Sidebar authData={authData} />, { route: '/reports/r1' });
    const reports = within(column()).getByRole('link', { name: 'Reports' });
    expect(reports).toHaveClass('border-marker', 'bg-primary-light/12', 'text-primary', 'font-semibold');
    const companies = within(column()).getByRole('link', { name: 'Companies' });
    expect(companies).toHaveClass('border-transparent', 'text-content');
    expect(companies).not.toHaveAttribute('aria-current');
  });


  it('follows the router: a click moves the current link, without a page load', async () => {
    const { user, router } = renderPage(<Sidebar authData={authData} />, { route: '/dashboard' });
    await user.click(within(column()).getByRole('link', { name: 'Jobs' }));
    expect(router.state.location.pathname).toBe('/jobs');
    expect(current()).toEqual(['Jobs']);
    expect(window.location.navigations).toEqual([]);
  });


  it('every link is a tab stop in order, after the pin button, and Enter follows it', async () => {
    const { user, router } = renderPage(<Sidebar authData={authData} />, { route: '/dashboard' });
    await user.tab();
    expect(within(column()).getByRole('button', { name: 'Unpin the sidebar' })).toHaveFocus();
    await user.tab();
    expect(within(column()).getByRole('link', { name: 'Chat' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(within(column()).getByRole('link', { name: 'Companies' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/companies');
  });
});







// -----------------------------------------------------------
// Pin and rail
// -----------------------------------------------------------
//
// From md up the column folds like tracer's: pinned (the
// default) it holds the full width; unpinned it is a rail of
// icons that opens over the page under the pointer or the
// keyboard focus. The pin is remembered across pages.
// -----------------------------------------------------------

describe('Sidebar pin and rail', () => {

  it('is pinned by default: the column holds the full width, the words show, the button offers to unpin', () => {
    renderPage(<Sidebar authData={authData} />);
    expect(column()).toHaveStyle({ width: '224px' });
    expect(panel()).toHaveStyle({ width: '224px' });
    expect(panel()).not.toHaveClass('shadow-float');
    expect(label('Reports')).toHaveClass('opacity-100');
    expect(within(column()).getByText('Compliance')).toHaveClass('opacity-100');
    expect(within(column()).getByRole('button', { name: 'Unpin the sidebar' })).toBeInTheDocument();
  });


  it('the pin is tracer\'s bar: an ink strip holding the pin alone, its words in the name and in a tooltip', async () => {
    const { user } = renderPage(<Sidebar authData={authData} />);
    const pin = within(column()).getByRole('button', { name: 'Unpin the sidebar' });
    expect(pin.textContent).toBe('');
    expect(pin).toHaveClass('w-full', 'bg-primary', 'text-white');
    await user.hover(pin);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unpin the sidebar');
  });


  it('unpinned it folds to the rail and remembers it: the next page opens on the rail, and pinning brings the column back', async () => {
    const first = renderPage(<Sidebar authData={authData} />);
    await first.user.click(within(column()).getByRole('button', { name: 'Unpin the sidebar' }));
    expect(column()).toHaveStyle({ width: '58px' });
    expect(localStorage.getItem(PINNED_KEY)).toBe('false');
    first.unmount();

    const next = renderPage(<Sidebar authData={authData} />);
    expect(column()).toHaveStyle({ width: '58px' });
    expect(panel()).toHaveStyle({ width: '58px' });
    expect(label('Reports')).toHaveClass('opacity-0');
    await next.user.click(within(column()).getByRole('button', { name: 'Pin the sidebar' }));
    expect(column()).toHaveStyle({ width: '224px' });
    expect(localStorage.getItem(PINNED_KEY)).toBe('true');
  });


  it('on the rail the pointer opens the panel over the page — the column keeps the rail\'s width — and leaving folds it a moment later', async () => {
    localStorage.setItem(PINNED_KEY, 'false');
    const { user } = renderPage(<Sidebar authData={authData} />);
    await user.hover(panel());
    expect(panel()).toHaveStyle({ width: '224px' });
    expect(panel()).toHaveClass('shadow-float');
    expect(column()).toHaveStyle({ width: '58px' });
    expect(label('Reports')).toHaveClass('opacity-100');
    await user.unhover(panel());
    // A slip past the edge does not fold it at once…
    expect(panel()).toHaveStyle({ width: '224px' });
    // …the grace period does
    await waitFor(() => expect(panel()).toHaveStyle({ width: '58px' }));
    expect(panel()).not.toHaveClass('shadow-float');
    expect(label('Reports')).toHaveClass('opacity-0');
  });


  it('keyboard focus opens the rail too; a Tab from link to link keeps it open, focus leaving folds it', async () => {
    localStorage.setItem(PINNED_KEY, 'false');
    const { user } = renderPage(<><Sidebar authData={authData} /><button type="button">after</button></>);
    await user.tab();
    expect(within(column()).getByRole('button', { name: 'Pin the sidebar' })).toHaveFocus();
    expect(panel()).toHaveStyle({ width: '224px' });
    await user.tab();
    await user.tab();
    expect(within(column()).getByRole('link', { name: 'Overview' })).toHaveFocus();
    // Past the grace period: each Tab left and landed again
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(panel()).toHaveStyle({ width: '224px' });
    await user.click(screen.getByRole('button', { name: 'after' }));
    await waitFor(() => expect(panel()).toHaveStyle({ width: '58px' }));
  });


  it('a page opened from the fly-over keeps it open under the pointer — no move needed — and the first move outside folds it', async () => {
    localStorage.setItem(PINNED_KEY, 'false');
    const { user, router } = renderRoutes(TWO_PAGES, { route: '/dashboard' });
    await user.hover(panel());
    await user.click(within(column()).getByRole('link', { name: 'Reports' }));
    expect(router.state.location.pathname).toBe('/reports');
    expect(screen.getByRole('main')).toHaveTextContent('The reports');
    // It used to fold here, and only a move brought it back
    expect(panel()).toHaveStyle({ width: '224px' });
    expect(current()).toEqual(['Reports']);
    await user.hover(screen.getByRole('main'));
    await waitFor(() => expect(panel()).toHaveStyle({ width: '58px' }));
  });


  it('only the pointer carries over: a page opened from the rail with the keyboard starts folded', async () => {
    localStorage.setItem(PINNED_KEY, 'false');
    const { user, router } = renderRoutes(TWO_PAGES, { route: '/dashboard' });
    for (let stop = 0; stop < 5; stop += 1) await user.tab();
    expect(within(column()).getByRole('link', { name: 'Reports' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/reports');
    expect(screen.getByRole('main')).toHaveTextContent('The reports');
    expect(panel()).toHaveStyle({ width: '58px' });
  });


  it('on the rail the words only fade: every link and group keeps its name, hairlines part the groups', () => {
    localStorage.setItem(PINNED_KEY, 'false');
    renderPage(<Sidebar authData={authData} />);
    expect(linksOf(column())).toEqual(ADMIN_LINKS);
    expect(sectionsOf(column()).map((section) => section.name)).toEqual(['Main', 'Compliance', 'Law', 'Administration', 'System']);
    expect(within(column()).getByText('Law')).toHaveClass('opacity-0');
    for (const group of within(column()).getAllByRole('group', { hidden: true })) {
      expect(group.firstElementChild.querySelector('[aria-hidden]')).toHaveClass('border-t', 'border-edge');
    }
    expect(within(column()).getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports');
  });


  it('marks the current page on the rail as well', () => {
    localStorage.setItem(PINNED_KEY, 'false');
    renderPage(<Sidebar authData={authData} />, { route: '/reports/r1' });
    expect(current()).toEqual(['Reports']);
    expect(within(column()).getByRole('link', { name: 'Reports' })).toHaveClass('border-marker', 'bg-primary-light/12');
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderPage(<Sidebar authData={authData} />, { locale: 'lt' });
    const nav = screen.getByRole('navigation', { name: 'Pagrindinė navigacija' });
    await user.click(within(nav).getByRole('button', { name: 'Atsegti šoninį meniu' }));
    expect(within(nav).getByRole('button', { name: 'Prisegti šoninį meniu' })).toBeInTheDocument();
  });


  it('the phone drawer always shows the whole menu, with no pin, even when the column is on the rail', async () => {
    localStorage.setItem(PINNED_KEY, 'false');
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    const dialog = await openDrawer(user);
    expect(within(dialog).queryByRole('button', { name: /sidebar/ })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Reports' }).lastElementChild).toHaveClass('opacity-100');
    expect(within(dialog).getByText('Compliance')).toHaveClass('opacity-100');
  });
});







// -----------------------------------------------------------
// Phone drawer
// -----------------------------------------------------------
//
// Below md the column is hidden by CSS and the drawer is the
// navigation; the navbar's menu button opens it (here a
// miniature toggle on the same NavDrawer state).
// -----------------------------------------------------------

describe('Sidebar phone drawer', () => {

  it('is closed by default — only the column is in the page, hidden by CSS below md', () => {
    renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    expect(drawer()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    // No layout in jsdom — the responsive classes are the witness
    expect(column()).toHaveClass('hidden', 'md:block');
  });


  it('opens as a modal dialog named like the navigation: the title, a close button and the same sections', async () => {
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    const dialog = await openDrawer(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(drawer()).toContainElement(dialog);
    expect(within(dialog).getByText('Compliance assistant')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    const nav = within(dialog).getByRole('navigation', { name: 'Main navigation' });
    expect(linksOf(nav)).toEqual(ADMIN_LINKS);
    // the page behind — the column included — is hidden while it is open
    expect(screen.getAllByRole('navigation')).toEqual([nav]);
  });


  it('marks the current page inside the drawer too', async () => {
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>, { route: '/companies/c1' });
    const dialog = await openDrawer(user);
    expect(current(within(dialog).getByRole('navigation'))).toEqual(['Companies']);
  });


  it('a plain user\'s drawer hides the admin links as well', async () => {
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={userAuthData} /></>);
    const dialog = await openDrawer(user);
    const hrefs = linksOf(within(dialog).getByRole('navigation')).map(([href]) => href);
    for (const href of ADMIN_ONLY) expect(hrefs).not.toContain(href);
  });


  it('closes when a link in it is followed — the route change is its cue', async () => {
    const { user, router } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>, { route: '/dashboard' });
    const dialog = await openDrawer(user);
    await user.click(within(dialog).getByRole('link', { name: 'Reports' }));
    expect(router.state.location.pathname).toBe('/reports');
    await waitFor(() => expect(drawer()).toBeNull());
    expect(screen.getByRole('button', { name: 'open the drawer' })).toBeInTheDocument();
  });


  it('closes on a route change made elsewhere (the browser\'s back button)', async () => {
    const { user, router } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>, { route: '/dashboard' });
    await openDrawer(user);
    await act(async () => { await router.navigate('/jobs'); });
    await waitFor(() => expect(drawer()).toBeNull());
  });


  it('stays open on a same-path move (only the query changed)', async () => {
    const { user, router } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>, { route: '/jobs' });
    await openDrawer(user);
    await act(async () => { await router.navigate('/jobs?status=failed'); });
    expect(screen.getByRole('dialog', { name: 'Main navigation' })).toBeInTheDocument();
  });


  it('closes with its close button, with Escape and with a tap on the backdrop', async () => {
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    const dialog = await openDrawer(user);
    await user.click(within(dialog).getByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(drawer()).toBeNull());

    await openDrawer(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawer()).toBeNull());

    await openDrawer(user);
    fireEvent.click(drawer().querySelector('.MuiBackdrop-root'));
    await waitFor(() => expect(drawer()).toBeNull());
    expect(screen.getByRole('button', { name: 'open the drawer' })).toBeInTheDocument();
  });


  it('closes when the window grows past md — the column takes over', async () => {
    const media = resizableMedia(390);
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    await openDrawer(user);
    media.resize(1280);
    await waitFor(() => expect(drawer()).toBeNull());
    // the shared flag is reset, not only the drawer hidden
    expect(screen.getByRole('button', { name: 'open the drawer' })).toBeInTheDocument();
  });


  it('never opens on a wide window', async () => {
    mediaQueryMatches(WIDE);
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>);
    await user.click(screen.getByRole('button', { name: 'open the drawer' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(drawer()).toBeNull();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(1);
  });


  it('speaks Lithuanian: the dialog, the title and the close button', async () => {
    const { user } = renderPage(<><DrawerToggle /><Sidebar authData={authData} /></>, { locale: 'lt' });
    await user.click(screen.getByRole('button', { name: 'open the drawer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pagrindinė navigacija' });
    expect(within(dialog).getByText('Atitikties asistentas')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Uždaryti navigaciją' })).toBeInTheDocument();
  });
});
