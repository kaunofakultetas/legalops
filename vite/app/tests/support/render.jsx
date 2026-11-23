// -----------------------------------------------------------
//  [*] Test support — rendering with the app's providers
//
//  Pages and components are rendered the way App.jsx frames
//  them in production, so nothing in a test is fed a context
//  the real app would not provide:
//
//    QueryClientProvider — one TanStack client per render,
//                          retries off and no cache keep-
//                          alive (the retry policy of console.jsx
//                          and AuthProvider's own are tested
//                          on their own)
//    a memory DATA router — the pages use data-router hooks
//                          (useBlocker for the unsaved-changes
//                          guard, useMatches), so a plain
//                          MemoryRouter would not do; the page
//                          sits on `path` (its real route
//                          pattern, so useParams works) and
//                          every other path renders a
//                          "navigated away" probe
//    Providers           — the real IntlProvider + locale-aware
//                          MUI theme + Toaster + nav drawer
//                          from providers.jsx, INSIDE the
//                          router like App.jsx puts it (toasts
//                          carry router links)
//    NavigationMemory    — App.jsx's history tracker, so a
//                          page's back link and its scroll
//                          memory work as in the app
//
//  renderPage(ui)            — the frame above around any element
//  renderRoutes(routes)      — the same frame around several
//                              pages on one router (a list and
//                              its detail: the way back, a
//                              delete that returns)
//  renderApp({ route })      — the REAL route table (router.jsx)
//                              through App.jsx: AuthProvider →
//                              /api/auth/me → PageWrapper → the
//                              lazy page, exactly the production
//                              tree, in a memory router
//  nodeText(node)            — the text of a React node (toast
//                              messages built from elements)
//
//  Both also move the window.location double (location.js) to
//  `route`, so the hard redirects that read window.location (a
//  401's ?next=) see the page the test is on.
//
//  Used by:
//    - every component and page test
// -----------------------------------------------------------

import { Component } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import Providers from '@/providers';
import NavigationMemory from '@/components/layout/NavigationMemory';
import { authData as defaultAuthData, userAuthData, signIn } from './auth';
import { installLocationDouble } from './location';







// -----------------------------------------------------------
// makeQueryClient
// -----------------------------------------------------------
//
// A client whose failures surface at once: no retries (a page
// under test must show its error state on the first answer),
// zero retry delay for the queries that set their own retry
// rule (AuthProvider retries a network error once), no
// garbage-collection wait so a test leaves nothing behind.
//
// Used by:
//   - renderPage, renderApp (below)
// -----------------------------------------------------------

export function makeQueryClient(overrides = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: 0, ...overrides },
      mutations: { retry: false },
    },
  });
}







// -----------------------------------------------------------
// TestErrorBoundary
// -----------------------------------------------------------
//
// Catches a render-time throw of the element under test and
// shows it as "render crashed: <message>" — so a page that
// cannot cope with a backend answer fails its test with the
// real message instead of the router's generic error screen.
//
// Used by:
//   - renderPage (below)
// -----------------------------------------------------------

export class TestErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div data-testid="render-crashed">render crashed: {String(this.state.error?.message ?? this.state.error)}</div>;
    }
    return this.props.children;
  }
}







// -----------------------------------------------------------
// NavigatedAway
// -----------------------------------------------------------
//
// What renderPage's router shows on any path but the page's
// own: the path and query, readable like an address bar —
// a link or a navigate() in the page ends here.
//
// Used by:
//   - renderPage (below)
// -----------------------------------------------------------

function NavigatedAway() {
  const { pathname, search } = useLocation();
  return <div data-testid="navigated-away">{`${pathname}${search}`}</div>;
}







// -----------------------------------------------------------
// setLocaleCookie
// -----------------------------------------------------------
//
// The IntlProvider reads the `locale` cookie on mount — set it
// BEFORE rendering to start a test in Lithuanian.
//
// Used by:
//   - renderPage, renderApp (below), i18n tests
// -----------------------------------------------------------

export function setLocaleCookie(locale) {
  document.cookie = `locale=${locale}; path=/`;
}







// -----------------------------------------------------------
// renderPage
// -----------------------------------------------------------
//
// Renders `ui` inside the production frame (see the header)
// and returns Testing Library's result plus the router, the
// query client and a userEvent instance. Options:
//
//   route   — the memory router's initial entry ('/')
//   path    — the route pattern the page sits on ('*'), e.g.
//             '/companies/:companyId' with route '/companies/c1'
//   locale  — 'en' | 'lt' cookie before mount
//   client  — a prepared QueryClient (default: makeQueryClient())
//   wrapper — an extra component around `ui`
//
//   const { user, router } = renderPage(<Users authData={authData} />, { route: '/users' });
//   router.state.location.pathname
//
// Used by:
//   - component and page tests
// -----------------------------------------------------------

export function renderPage(ui, { route = '/', path = '*', locale = 'en', client, wrapper: Wrapper } = {}) {
  setLocaleCookie(locale);
  installLocationDouble(route);
  const queryClient = client ?? makeQueryClient();
  const user = userEvent.setup();

  const content = Wrapper ? <Wrapper>{ui}</Wrapper> : ui;
  const router = createMemoryRouter([
    {
      element: <Providers><NavigationMemory /><Outlet /></Providers>,
      children: [
        { path, element: <TestErrorBoundary>{content}</TestErrorBoundary> },
        ...(path === '*' ? [] : [{ path: '*', element: <NavigatedAway /> }]),
      ],
    },
  ], { initialEntries: [route] });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return { ...result, router, queryClient, user };
}







// -----------------------------------------------------------
// renderRoutes
// -----------------------------------------------------------
//
//   const { router, user } = renderRoutes([
//     { path: '/companies', element: <ListProbe /> },
//     { path: '/companies/:companyId', element: <CompanyDetail authData={authData} /> },
//   ], { route: '/companies?q=x' });
//
// renderPage's frame (query client, providers, the history
// tracker, the error boundary per page) around several routes
// on one memory router starting at `route`; any other path
// renders the "navigated away" probe. For what only a real
// sequence of pages shows: a back link that is a real Back
// when the list is right behind it.
//
// Used by:
//   - page tests of the ways back (company, report, act,
//     prompt pages)
// -----------------------------------------------------------

export function renderRoutes(routes, { route = '/', locale = 'en', client } = {}) {
  setLocaleCookie(locale);
  installLocationDouble(route);
  const queryClient = client ?? makeQueryClient();
  const user = userEvent.setup();

  const router = createMemoryRouter([
    {
      element: <Providers><NavigationMemory /><Outlet /></Providers>,
      children: [
        ...routes.map(({ path, element }) => ({ path, element: <TestErrorBoundary>{element}</TestErrorBoundary> })),
        { path: '*', element: <NavigatedAway /> },
      ],
    },
  ], { initialEntries: [route] });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return { ...result, router, queryClient, user };
}







// -----------------------------------------------------------
// ListProbe
// -----------------------------------------------------------
//
//   { path: '/companies', element: <ListProbe to="/companies/c1" /> }
//
// A stand-in list page for renderRoutes: its own address (so
// a test sees the list come back with its query) and one
// link into the detail ("Open the detail").
//
// Used by:
//   - page tests of the ways back, with renderRoutes
// -----------------------------------------------------------

export function ListProbe({ to }) {
  const { pathname, search } = useLocation();
  return (
    <>
      <p data-testid="list-probe">{`${pathname}${search}`}</p>
      <Link to={to}>Open the detail</Link>
    </>
  );
}







// -----------------------------------------------------------
// renderApp
// -----------------------------------------------------------
//
// The whole application tree on a memory router: the route
// table of router.jsx (App.jsx as the layout route with its
// providers, title sync and AuthProvider; PageWrapper around
// every lazy page) starting at `route`, signed in unless
// `signedIn: false`. The session comes from the backend
// double's /api/auth/me answer — override it with
// given.json('get', '/api/auth/me', …) before calling.
// Returns the router too, so a test can navigate the way a
// sidebar click would (router.navigate('/users')).
//
// Used by:
//   - App / PageWrapper / routing / auth tests, the route
//     sweep
// -----------------------------------------------------------

export async function renderApp({ route = '/', locale = 'en', client, signedIn = true, token } = {}) {
  setLocaleCookie(locale);
  installLocationDouble(route);
  if (signedIn) signIn(token);
  const { router: browserRouter } = await import('@/router');
  const router = createMemoryRouter(browserRouter.routes, { initialEntries: [route] });
  const queryClient = client ?? makeQueryClient();
  const user = userEvent.setup();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return { ...result, router, queryClient, user };
}







// -----------------------------------------------------------
// nodeText
// -----------------------------------------------------------
//
// The plain text inside a React node: strings and numbers as
// they are, elements by their children, arrays joined —
// enough to read a toast message built from elements.
//
// Used by:
//   - tests that spy on react-hot-toast
// -----------------------------------------------------------

export function nodeText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'function') return nodeText(node({}));
  if (node.props) return nodeText(node.props.children);
  return '';
}







// -----------------------------------------------------------
// authData / userAuthData (re-exports)
// -----------------------------------------------------------
//
// The two sessions, so a page test needs one import.
//
// Used by:
//   - page tests — <Page authData={authData} />
// -----------------------------------------------------------

export { defaultAuthData as authData, userAuthData };
