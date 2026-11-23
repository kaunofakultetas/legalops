// -----------------------------------------------------------
//  [*] Tests — router.jsx (the route table) and zodSetup.js
//
//  The table's shape: one layout route "/" rendering App,
//  with the root RouteError (bringing its own providers) and
//  the spinner as hydrate fallback; /login eager and outside
//  PageWrapper; every page a lazy module that resolves to its
//  page component inside PageWrapper with the right admin
//  guard; a title key and a RouteError on every route; "*"
//  the in-frame not-found page.
//
//  Then the table at work (renderApp): a deep link loading
//  its page module, a detail route handing its param on; a
//  page module that fails to load — a stale chunk reloads
//  the page ONCE (location.reloads), the same failure again
//  within 30 s shows the "app was updated" card in the frame,
//  any other load failure the crash card at once; a page that
//  crashes while rendering caught by its route's RouteError
//  with the router still alive; the unknown path; the root
//  error element with its own providers. Last, zodSetup: zod
//  goes jitless when imported, and only the chat routes
//  import it.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act, within, cleanup } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import { config as zodConfig } from 'zod';
import { router } from '@/router';
import App from '@/App';
import PageWrapper from '@/PageWrapper';
import PageLoading from '@/components/layout/PageLoading';
import Login from '@/pages/Login/Login';
import NotFound from '@/pages/NotFound/NotFound';
import RouteError from '@/pages/RouteError/RouteError';
import { renderApp, setLocaleCookie } from '../support/render';
import { userAuthData } from '../support/auth';
import { installLocationDouble } from '../support/location';
import { given } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import { allowConsoleErrors } from '../support/setup';
import * as f from '../support/backend/fixtures';


// The page table: path (null = the index route), its title
// key, the module of the page it renders, admin-only
const PAGES = [
  { label: '(index)', path: null, title: 'sidebar.MAIN.chat', load: () => import('@/pages/Chat/Chat'), adminOnly: false },
  { label: 'chat/:threadId', path: 'chat/:threadId', title: 'sidebar.MAIN.chat', load: () => import('@/pages/Chat/Chat'), adminOnly: false },
  { label: 'dashboard', path: 'dashboard', title: 'sidebar.MAIN.dashboard', load: () => import('@/pages/Dashboard/Dashboard'), adminOnly: false },
  { label: 'companies', path: 'companies', title: 'sidebar.COMPLIANCE.companies', load: () => import('@/pages/Companies/Companies'), adminOnly: false },
  { label: 'companies/:companyId', path: 'companies/:companyId', title: 'PAGES.company.TITLE', load: () => import('@/pages/Companies/CompanyDetail'), adminOnly: false },
  { label: 'reports', path: 'reports', title: 'sidebar.COMPLIANCE.reports', load: () => import('@/pages/Reports/Reports'), adminOnly: false },
  { label: 'reports/:reportId', path: 'reports/:reportId', title: 'PAGES.report.TITLE', load: () => import('@/pages/Reports/ReportDetail'), adminOnly: false },
  { label: 'programme/:productId', path: 'programme/:productId', title: 'PAGES.programme.TITLE', load: () => import('@/pages/Programme/ProductPage'), adminOnly: false },
  { label: 'corpus', path: 'corpus', title: 'sidebar.LAW.corpus', load: () => import('@/pages/Corpus/Corpus'), adminOnly: false },
  { label: 'corpus/:documentId', path: 'corpus/:documentId', title: 'PAGES.corpusDocument.TITLE', load: () => import('@/pages/Corpus/CorpusDocument'), adminOnly: false },
  { label: 'obligations', path: 'obligations', title: 'sidebar.LAW.obligations', load: () => import('@/pages/Obligations/Obligations'), adminOnly: true },
  { label: 'prompts', path: 'prompts', title: 'sidebar.ADMIN.prompts', load: () => import('@/pages/Prompts/Prompts'), adminOnly: true },
  { label: 'prompts/:slug', path: 'prompts/:slug', title: 'PAGES.promptEditor.TITLE', load: () => import('@/pages/Prompts/PromptEditor'), adminOnly: true },
  { label: 'settings/mcp', path: 'settings/mcp', title: 'sidebar.ADMIN.mcp', load: () => import('@/pages/Mcp/McpServers'), adminOnly: true },
  { label: 'users', path: 'users', title: 'sidebar.ADMIN.users', load: () => import('@/pages/Users/Users'), adminOnly: true },
  { label: 'audit', path: 'audit', title: 'sidebar.ADMIN.audit', load: () => import('@/pages/Audit/Audit'), adminOnly: true },
  { label: 'usage', path: 'usage', title: 'sidebar.SYSTEM.usage', load: () => import('@/pages/Usage/Usage'), adminOnly: false },
  { label: 'jobs', path: 'jobs', title: 'sidebar.SYSTEM.jobs', load: () => import('@/pages/Jobs/Jobs'), adminOnly: false },
  { label: 'account', path: 'account', title: 'sidebar.SYSTEM.account', load: () => import('@/pages/Account/Account'), adminOnly: false },
];

// What a browser throws for a chunk the last deploy removed
const STALE_CHUNK = 'Failed to fetch dynamically imported module: http://localhost:3000/assets/Audit-3f9a1c.js';

const children = () => router.routes[0].children;
const routeAt = (path) => children().find((route) => (path === null ? route.index : route.path === path));

// A route's element — the module-level browser router may
// already have loaded the route it started on (React Router
// then swaps `lazy` for the loaded element)
const elementOf = async (route) => (route.lazy ? (await route.lazy()).element : route.element);

// A page module that throws `error` when imported (vitest
// hands the import an error of its own with `error` as its
// cause — isChunkLoadError reads causes, the details box
// shows the outer message, so the tests below do not)
const failPageModule = (path, error) => vi.doMock(path, () => { throw error; });

const inFrameCard = () => within(screen.getByRole('main')).getByRole('alert');







// -----------------------------------------------------------
// the table's shape
// -----------------------------------------------------------

describe('the route table', () => {

  it('is one layout route at "/": App, the root RouteError (with its own providers), the spinner while the first page loads', () => {
    expect(router.routes).toHaveLength(1);
    const [root] = router.routes;
    expect(root.path).toBe('/');
    expect(root.element.type).toBe(App);
    expect(root.errorElement.type).toBe(RouteError);
    expect(root.errorElement.props).toEqual({ root: true });
    expect(root.hydrateFallbackElement.type).toBe(PageLoading);
    expect(router.basename).toBe('/console');
  });


  it('lists login, the pages in order and the catch-all', () => {
    expect(children().map((route) => (route.index ? '(index)' : route.path))).toEqual([
      'login', ...PAGES.map((row) => row.label), '*',
    ]);
  });


  it('renders /login eagerly and without PageWrapper — the login page itself, titled, with its error element', () => {
    const login = routeAt('login');
    expect(login.lazy).toBeUndefined();
    expect(login.element.type).toBe(Login);
    expect(login.handle).toEqual({ title: 'PAGES.login.TITLE' });
    expect(login.errorElement.type).toBe(RouteError);
  });


  it('makes "*" the in-frame not-found page: NotFound through PageWrapper, eagerly', () => {
    const catchAll = routeAt('*');
    expect(catchAll.lazy).toBeUndefined();
    expect(catchAll.element.type).toBe(PageWrapper);
    expect(catchAll.element.props.component).toBe(NotFound);
    expect(catchAll.element.props.adminOnly).toBeFalsy();
    expect(catchAll.handle).toEqual({ title: 'PAGES.notFound.TITLE' });
  });


  it('gives every route a RouteError of its own (not the root one) and a title key', () => {
    for (const route of children()) {
      expect(route.errorElement.type, route.path ?? '(index)').toBe(RouteError);
      expect(route.errorElement.props.root, route.path ?? '(index)').toBeUndefined();
      expect(route.handle.title, route.path ?? '(index)').toMatch(/^(sidebar|PAGES)\./);
    }
  });


  it.each(PAGES)('$label: titled $title, a lazy module resolving to its page inside PageWrapper, admin-only $adminOnly', async ({ path, title, load, adminOnly }) => {
    const route = routeAt(path);
    expect(route.handle).toEqual({ title });
    const element = await elementOf(route);
    const { default: Page } = await load();
    expect(element.type).toBe(PageWrapper);
    expect(element.props.component).toBe(Page);
    expect(Boolean(element.props.adminOnly)).toBe(adminOnly);
  });
});







// -----------------------------------------------------------
// the table at work
// -----------------------------------------------------------

describe('lazy pages through the real app', () => {

  it('a deep link loads the page module and renders the page inside the frame', async () => {
    await renderApp({ route: '/users' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(await screen.findByText('Jonas Naudotojas')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });


  it('a detail route hands its param to the page — the company it asks the backend for', async () => {
    const calls = given.capture('get', '/api/companies/:companyId', f.company(f.ID.pavyzdys));
    await renderApp({ route: `/companies/${f.ID.pavyzdys}` });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].url).toBe(`http://localhost:3000/api/companies/${f.ID.pavyzdys}`);
  });


  it('a navigation loads the next page module on demand', async () => {
    const { router: app } = await renderApp({ route: '/account' });
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    await act(async () => { await app.navigate('/jobs'); });
    expect(await screen.findByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();
    expect(app.state.location.pathname).toBe('/jobs');
  });


  it('"/" is the chat', async () => {
    await renderApp({ route: '/' });
    await waitFor(() => expect(document.title).toBe('Chat · Compliance assistant'));
    expect(await screen.findByText('Which company shall we talk about?')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// a page module that fails to load
// -----------------------------------------------------------

describe('a page module that fails to load', () => {

  it('a stale chunk: RouteError takes the page\'s place and reloads the page once — a spinner while it goes', async () => {
    failPageModule('@/pages/Audit/Audit', new TypeError(STALE_CHUNK));
    try {
      await renderApp({ route: '/audit' });
      await waitFor(() => expect(window.location.reloads).toBe(1));
      await waitFor(() => expect(document.title).toBe('Audit log · Compliance assistant'));
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'The app was updated' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      await settle(50);
      expect(window.location.reloads).toBe(1);
    } finally {
      vi.doUnmock('@/pages/Audit/Audit');
    }
  });


  it('the same failure again within 30 s: no reload loop — the "app was updated" card in the frame, its Reload the user\'s', async () => {
    failPageModule('@/pages/Audit/Audit', new TypeError(STALE_CHUNK));
    try {
      await renderApp({ route: '/audit' });
      await waitFor(() => expect(window.location.reloads).toBe(1));
      // The reloaded page (a fresh location, the same tab's
      // sessionStorage) fails the same way
      cleanup();
      const { user } = await renderApp({ route: '/audit' });
      // In the frame from its first paint — never the full-page
      // card first while the session check runs
      const heading = await screen.findByRole('heading', { level: 1, name: 'The app was updated' });
      expect(heading.closest('main')).not.toBeNull();
      const alert = inFrameCard();
      expect(alert).toHaveTextContent('A new version of the app was deployed. Reload the page to load it.');
      expect(within(alert).getByText('Technical details')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      await settle(50);
      expect(window.location.reloads).toBe(0);
      await user.click(within(alert).getByRole('button', { name: 'Reload the page' }));
      expect(window.location.reloads).toBe(1);
    } finally {
      vi.doUnmock('@/pages/Audit/Audit');
    }
  });


  it('a module that fails while evaluating is no stale chunk: no reload, "Something went wrong" at once', async () => {
    failPageModule('@/pages/Usage/Usage', new ReferenceError('process is not defined'));
    try {
      await renderApp({ route: '/usage' });
      const heading = await screen.findByRole('heading', { level: 1, name: 'Something went wrong' });
      expect(heading.closest('main')).not.toBeNull();
      expect(inFrameCard()).toHaveTextContent('The page could not be shown.');
      await settle(50);
      expect(window.location.reloads).toBe(0);
    } finally {
      vi.doUnmock('@/pages/Usage/Usage');
    }
  });
});







// -----------------------------------------------------------
// a page that crashes while rendering
// -----------------------------------------------------------

describe('a page that crashes while rendering', () => {

  it('is caught by its route\'s RouteError inside the frame; the router stays alive and the next navigation works', async () => {
    // The page module's default export is the crash, on purpose
    allowConsoleErrors(/The above error occurred in the <default> component/);
    vi.doMock('@/pages/Jobs/Jobs', () => ({ default: () => { throw new Error('Jobs exploded'); } }));
    try {
      const { router: app } = await renderApp({ route: '/jobs' });
      expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
      const alert = inFrameCard();
      expect(alert).toHaveTextContent('The page could not be shown. Try reloading it — if the error keeps coming back, tell your administrator.');
      expect(alert.querySelector('details pre')).toHaveTextContent('Jobs exploded');
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(window.location.reloads).toBe(0);

      await act(async () => { await app.navigate('/account'); });
      expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull();
    } finally {
      vi.doUnmock('@/pages/Jobs/Jobs');
    }
  });
});







// -----------------------------------------------------------
// unknown paths
// -----------------------------------------------------------

describe('an unknown path', () => {

  it('is the in-frame "Page not found": navbar, sidebar, the way home', async () => {
    await renderApp({ route: '/no/such/page' });
    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);
  });


  it('below a real page too, and for a plain user (whose sidebar keeps the admin links hidden)', async () => {
    given.json('get', '/api/auth/me', userAuthData);
    await renderApp({ route: '/users/extra/bits' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];
    expect(within(nav).queryByRole('link', { name: 'Users' })).toBeNull();
  });


  it('signed out, it sends the visitor to sign in first, remembering the path', async () => {
    await renderApp({ route: '/no/such/page', signedIn: false });
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fno%2Fsuch%2Fpage']));
  });
});







// -----------------------------------------------------------
// the root error element
// -----------------------------------------------------------
//
// The root route's RouteError renders when App itself fails,
// i.e. outside App's providers: it must bring its own (the
// language from the cookie, the MUI theme, the Toaster).
// -----------------------------------------------------------

describe('the root error element', () => {

  function BrokenLayout() {
    throw new Error('the layout failed');
  }

  const renderBrokenRoot = (locale = 'en') => {
    // The crash is on purpose — React's report of it is declared
    allowConsoleErrors(/The above error occurred in the <BrokenLayout> component/);
    setLocaleCookie(locale);
    installLocationDouble('/');
    const broken = createMemoryRouter([{ path: '/', element: <BrokenLayout />, errorElement: router.routes[0].errorElement }]);
    return render(<RouterProvider router={broken} />);
  };


  it('brings its own providers: the full-page card in the cookie language, and toasts work', async () => {
    renderBrokenRoot();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(alert.querySelector('details pre')).toHaveTextContent('the layout failed');
    expect(screen.queryByRole('banner')).toBeNull();
    act(() => { toast.success('Toaster alive'); });
    expect(await screen.findByText('Toaster alive')).toBeInTheDocument();
  });


  it('speaks Lithuanian from the cookie too', async () => {
    renderBrokenRoot('lt');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kažkas nepavyko' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Perkrauti puslapį' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// zodSetup
// -----------------------------------------------------------
//
// Last in the file: the second test resets the module
// registry to watch a fresh router's loaders.
// -----------------------------------------------------------

describe('zodSetup', () => {

  it('switches zod to jitless mode when imported', async () => {
    zodConfig({ jitless: false });
    await import('@/zodSetup?probe');
    expect(zodConfig().jitless).toBe(true);
  });


  it('is loaded by the chat routes\' loader alongside the page, and by no other route', async () => {
    // A fresh route table (so zodSetup is evaluated anew) whose
    // route `match` is loaded; answers zod's jitless flag after
    const jitlessAfterLoading = async (match) => {
      zodConfig({ jitless: false });
      vi.resetModules();
      installLocationDouble('/account');
      const { router: fresh } = await import('@/router');
      await fresh.routes[0].children.find(match).lazy();
      return zodConfig().jitless;
    };
    expect(await jitlessAfterLoading((route) => route.path === 'users')).toBe(false);
    expect(await jitlessAfterLoading((route) => route.path === 'companies/:companyId')).toBe(false);
    expect(await jitlessAfterLoading((route) => route.index)).toBe(true);
    expect(await jitlessAfterLoading((route) => route.path === 'chat/:threadId')).toBe(true);
  });
});
