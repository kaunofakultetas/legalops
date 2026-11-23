// -----------------------------------------------------------
//  [*] Tests — App.jsx (TitleSync, NavigationProgress, the
//      login door) and console.jsx
//
//  The layout route every page renders through, on the REAL
//  route table (renderApp) and, where a route the table does
//  not have is needed, on a small table with App as the
//  layout:
//
//    - TitleSync: "<page> · <app>" from the deepest titled
//      route, per route and per locale; the app name alone
//      for an untitled route or a title key the messages
//      lack; the title following a navigation and a live
//      language switch
//    - NavigationProgress: the "Loading…" bar while a lazy
//      page module loads, the old page (and its title)
//      staying on screen until the new one is ready
//    - the login door: /login (as the router matches it —
//      any case, a trailing slash) renders without the
//      session check; every other path is guarded
//    - console.jsx: one QueryClient (retry 1) around the
//      router, mounted into #root, and the vite:preloadError
//      listener — one automatic reload for a stale chunk,
//      a second failure within 30 s left to surface
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import App from '@/App';
import { renderApp, makeQueryClient } from '../support/render';
import { signIn } from '../support/auth';
import { installLocationDouble } from '../support/location';
import { server, url } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';


// console.jsx mounts into #root when imported: the root it asks
// react-dom for is recorded instead of rendered. Every other
// container (Testing Library's) gets the real createRoot.
const mainRoots = vi.hoisted(() => []);

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal();
  const createRoot = (container, options) => {
    if (container?.id !== 'root') return actual.createRoot(container, options);
    const root = { container, rendered: [], render: (element) => root.rendered.push(element), unmount: () => {} };
    mainRoots.push(root);
    return root;
  };
  return { ...actual, createRoot, default: { ...(actual.default ?? actual), createRoot } };
});


const APP = { en: 'Compliance assistant', lt: 'Atitikties asistentas' };

// Counts the session checks, answering the administrator
const countChecks = () => {
  const calls = { count: 0 };
  server.use(http.get(url('/api/auth/me'), () => {
    calls.count += 1;
    return HttpResponse.json(f.me);
  }));
  return calls;
};

// App as the layout of a hand-made table (the route shapes
// the real one lacks), signed in, on `route`
const renderShell = (children, route) => {
  signIn();
  installLocationDouble(route);
  const router = createMemoryRouter([{ path: '/', element: <App />, children }], { initialEntries: [route] });
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
};

const titled = (title) => waitFor(() => expect(document.title).toBe(title));

// The bar NavigationProgress draws (the spinners of the pages
// are unnamed)
const progressBar = (name = 'Loading…') => screen.queryByRole('progressbar', { name });

// A lazy page module that loads only when release() is called
const gatePageModule = (path, text) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  vi.doMock(path, async () => {
    await gate;
    return { default: ({ authData }) => <p>{text} for {authData.email}</p> };
  });
  return () => release();
};







// -----------------------------------------------------------
// TitleSync
// -----------------------------------------------------------

describe('TitleSync — the document title', () => {

  it.each([
    ['/account', 'en', 'Account'],
    ['/account', 'lt', 'Paskyra'],
    ['/users', 'en', 'Users'],
    ['/users', 'lt', 'Naudotojai'],
    [`/reports/${f.ID.reportDone}`, 'en', 'Report'],
    [`/reports/${f.ID.reportDone}`, 'lt', 'Ataskaita'],
    ['/no/such/page', 'en', 'Page not found'],
    ['/no/such/page', 'lt', 'Puslapis nerastas'],
  ])('%s (%s) is "<page> · <app>"', async (route, locale, page) => {
    await renderApp({ route, locale });
    await titled(`${page} · ${APP[locale]}`);
  });


  it.each([
    ['en', 'Sign in'],
    ['lt', 'Prisijungimas'],
  ])('titles the sign-in page too, signed out (%s)', async (locale, page) => {
    await renderApp({ route: '/login', signedIn: false, locale });
    await titled(`${page} · ${APP[locale]}`);
  });


  it('follows the navigation', async () => {
    const { router } = await renderApp({ route: '/account' });
    await titled(`Account · ${APP.en}`);
    await act(async () => { await router.navigate('/users'); });
    await titled(`Users · ${APP.en}`);
    await act(async () => { await router.navigate('/nowhere/at/all'); });
    await titled(`Page not found · ${APP.en}`);
  });


  it('follows a live language switch — both parts of the title', async () => {
    const { user } = await renderApp({ route: '/account' });
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    await titled(`Account · ${APP.en}`);
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    await titled(`Paskyra · ${APP.lt}`);
    await user.click(screen.getByRole('button', { name: 'Switch the interface to English' }));
    await titled(`Account · ${APP.en}`);
  });


  it('is the app name alone on a route without a title', async () => {
    renderShell([{ path: 'plain', element: <p>Untitled page</p> }], '/plain');
    expect(await screen.findByText('Untitled page')).toBeInTheDocument();
    await titled(APP.en);
  });


  it('is the app name alone — never the raw key — for a title key the messages lack', async () => {
    renderShell([{ path: 'broken', element: <p>Broken title</p>, handle: { title: 'PAGES.nowhere.TITLE' } }], '/broken');
    expect(await screen.findByText('Broken title')).toBeInTheDocument();
    await titled(APP.en);
    expect(document.title).not.toMatch(/PAGES/);
  });


  it('takes the deepest route that has a title', async () => {
    const children = [{
      path: 'outer',
      element: <Outlet />,
      handle: { title: 'sidebar.MAIN.dashboard' },
      children: [
        { path: 'inner', element: <p>Inner page</p>, handle: { title: 'sidebar.SYSTEM.jobs' } },
        { path: 'bare', element: <p>Bare page</p> },
      ],
    }];
    const router = renderShell(children, '/outer/inner');
    await screen.findByText('Inner page');
    await titled(`Jobs · ${APP.en}`);
    await act(async () => { await router.navigate('/outer/bare'); });
    await screen.findByText('Bare page');
    await titled(`Overview · ${APP.en}`);
  });
});







// -----------------------------------------------------------
// NavigationProgress
// -----------------------------------------------------------

describe('NavigationProgress — the bar while a page module loads', () => {

  it('runs while the next page\'s module loads; the old page and its title stay until the new one is ready', async () => {
    const release = gatePageModule('@/pages/Jobs/Jobs', 'Jobs stand-in');
    try {
      const { router } = await renderApp({ route: '/account' });
      await screen.findByRole('heading', { level: 1, name: 'Account' });
      await titled(`Account · ${APP.en}`);
      expect(progressBar()).toBeNull();

      act(() => { router.navigate('/jobs'); });
      await waitFor(() => expect(progressBar()).toBeInTheDocument());
      await settle(50);
      expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
      expect(document.title).toBe(`Account · ${APP.en}`);
      expect(progressBar()).toHaveClass('fixed', 'top-0');

      release();
      expect(await screen.findByText('Jobs stand-in for admin@example.lt')).toBeInTheDocument();
      await waitFor(() => expect(progressBar()).toBeNull());
      await titled(`Jobs · ${APP.en}`);
    } finally {
      vi.doUnmock('@/pages/Jobs/Jobs');
    }
  });


  it('is named in the UI language', async () => {
    const release = gatePageModule('@/pages/Usage/Usage', 'Usage stand-in');
    try {
      const { router } = await renderApp({ route: '/account', locale: 'lt' });
      await screen.findByRole('heading', { level: 1, name: 'Paskyra' });
      act(() => { router.navigate('/usage'); });
      await waitFor(() => expect(progressBar('Įkeliama…')).toBeInTheDocument());
      release();
      await screen.findByText('Usage stand-in for admin@example.lt');
      await waitFor(() => expect(progressBar('Įkeliama…')).toBeNull());
    } finally {
      vi.doUnmock('@/pages/Usage/Usage');
    }
  });


  it('stays away while nothing loads — a page\'s own spinners are not it', async () => {
    await renderApp({ route: '/users' });
    await screen.findByText('Jonas Naudotojas');
    expect(progressBar()).toBeNull();
  });
});







// -----------------------------------------------------------
// the login door
// -----------------------------------------------------------

describe('App — the login door', () => {

  it('renders /login outside the session check: the form, no request to /api/auth/me, no frame, no redirect', async () => {
    const checks = countChecks();
    await renderApp({ route: '/login', signedIn: false });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    await settle(100);
    expect(checks.count).toBe(0);
    expect(window.location.navigations).toEqual([]);
  });


  it('with a token, /login does not check the session either — the page sends the visitor on', async () => {
    const checks = countChecks();
    await renderApp({ route: '/login?next=%2Fjobs' });
    await waitFor(() => expect(window.location.navigations).toEqual(['/jobs']));
    await settle(50);
    expect(checks.count).toBe(0);
  });


  it.each(['/login/', '/LOGIN', '/Login?next=%2Fjobs'])('%s is the login route too — the form, never the guard', async (route) => {
    const checks = countChecks();
    await renderApp({ route, signedIn: false });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    await settle(100);
    expect(checks.count).toBe(0);
    expect(window.location.navigations).toEqual([]);
  });


  it('guards every other path — signed out, the page is replaced by /login?next=<it>', async () => {
    const checks = countChecks();
    await renderApp({ route: '/account', signedIn: false });
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Faccount']));
    expect(screen.queryByRole('heading', { level: 1, name: 'Account' })).toBeNull();
    await settle(50);
    expect(checks.count).toBe(0);
  });


  it('a path that merely starts with "/login" is no login route — it is guarded like any other', async () => {
    await renderApp({ route: '/login-help', signedIn: false });
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Flogin-help']));
    expect(screen.queryByRole('heading', { level: 1, name: 'Sign in' })).toBeNull();
  });


  it('signed in, a framed route checks the session once and renders the page in the frame', async () => {
    const checks = countChecks();
    await renderApp({ route: '/account' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(checks.count).toBe(1);
  });
});







// -----------------------------------------------------------
// console.jsx
// -----------------------------------------------------------

describe('console.jsx — the console\'s start', () => {

  // Imports the module (once per file — later calls reuse
  // it) with the #root it mounts into
  const loadMain = async () => {
    let container = document.getElementById('root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'root';
      document.body.append(container);
    }
    await import('@/console');
    return container;
  };


  it('mounts the route table inside ONE QueryClient, which retries a failed query once, into #root', async () => {
    const container = await loadMain();
    try {
      expect(mainRoots).toHaveLength(1);
      expect(mainRoots[0].container).toBe(container);
      const [element] = mainRoots[0].rendered;
      expect(element.type).toBe(QueryClientProvider);
      expect(element.props.client.getDefaultOptions().queries.retry).toBe(1);
      expect(element.props.children.type).toBe(RouterProvider);
      const { router } = await import('@/router');
      expect(element.props.children.props.router).toBe(router);
    } finally {
      container.remove();
    }
  });


  it('a stale chunk (vite:preloadError) reloads the page once and swallows the error; a second within 30 s is left to surface', async () => {
    const container = await loadMain();
    try {
      const first = new Event('vite:preloadError', { cancelable: true });
      window.dispatchEvent(first);
      expect(window.location.reloads).toBe(1);
      expect(first.defaultPrevented).toBe(true);

      const second = new Event('vite:preloadError', { cancelable: true });
      window.dispatchEvent(second);
      expect(window.location.reloads).toBe(1);
      expect(second.defaultPrevented).toBe(false);
    } finally {
      container.remove();
    }
  });
});
