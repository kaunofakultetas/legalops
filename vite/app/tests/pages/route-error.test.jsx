// -----------------------------------------------------------
//  [*] Tests — RouteError page (pages/RouteError/RouteError.jsx)
//
//  The router's error element, in each of its three kinds:
//
//    - a crash (a render throw, any thrown value, a routing
//      error response other than 404): "Something went
//      wrong", the stack (or message, or the value) in the
//      details
//    - a routing 404: "Page not found", "404 Not Found"
//    - a stale chunk (the browsers' wordings, a CSS preload,
//      one wrapped as a cause): ONE automatic reload with a
//      spinner while the page goes; a second failure within
//      30 s shows the "app was updated" card instead of a
//      reload loop
//
//  Where it renders: inside the frame (navbar, sidebar, the
//  h1 title, the card in the main landmark) once the session
//  is known, the full-page card otherwise; the root instance
//  brings its own providers. The card is an alert (a
//  failure); its details box starts collapsed; Reload is a
//  hard reload and Home a hard navigation to "/" (the
//  location double records both); the error goes to the
//  console for whoever debugs it. Both languages.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { lazy, Suspense } from 'react';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, RouterProvider, createMemoryRouter, data } from 'react-router-dom';
import RouteError from '@/pages/RouteError/RouteError';
import Providers from '@/providers';
import PageWrapper from '@/PageWrapper';
import { AuthProvider } from '@/AuthGuard';
import { renderPage, makeQueryClient, setLocaleCookie } from '../support/render';
import { signIn } from '../support/auth';
import { installLocationDouble } from '../support/location';
import { settle } from '../support/backend/contract';
import { allowConsoleErrors } from '../support/setup';


// What Chrome throws for a chunk the last deploy removed
const STALE_CHUNK = 'Failed to fetch dynamically imported module: http://localhost:3000/assets/Reports-8c2e41.js';

const CRASH = {
  en: ['Something went wrong', 'The page could not be shown. Try reloading it — if the error keeps coming back, tell your administrator.'],
  lt: ['Kažkas nepavyko', 'Puslapio nepavyko parodyti. Pabandykite perkrauti puslapį — jei klaida kartojasi, praneškite administratoriui.'],
};
const CHUNK = {
  en: ['The app was updated', 'A new version of the app was deployed. Reload the page to load it.'],
  lt: ['Programa atnaujinta', 'Įdiegta nauja programos versija. Perkraukite puslapį, kad ją įkeltumėte.'],
};


// A route at /broken whose page throws `error`, with
// RouteError as its error element:
//   session — signed in, under AuthProvider, the page behind
//             PageWrapper (as the real table has it: a page
//             renders once the session is known, so its error
//             does too)
//   root    — no error element of its own: the error reaches
//             the root route's <RouteError root>, which sits
//             outside every provider
//   loader  — the route throws from a loader instead
// The crash is on purpose, so React's report of it (which
// setup.js's console guard fails a test on) is declared.

const renderRouteError = (error, { session = false, root = false, locale = 'en', route = '/broken', loader } = {}) => {
  allowConsoleErrors(/The above error occurred in the <Crashing> component/);
  setLocaleCookie(locale);
  installLocationDouble(route);
  function Crashing() {
    throw error;
  }
  let layout = <Outlet />;
  let page = <Crashing />;
  if (session) {
    signIn();
    layout = <AuthProvider><Outlet /></AuthProvider>;
    page = <PageWrapper component={Crashing} />;
  }
  const child = { path: 'broken', element: page, ...(root ? {} : { errorElement: <RouteError /> }), ...(loader ? { loader } : {}) };
  const router = createMemoryRouter([{
    path: '/',
    element: root ? layout : <Providers>{layout}</Providers>,
    ...(root ? { errorElement: <RouteError root /> } : {}),
    children: [child],
  }], { initialEntries: [route] });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { user, router };
};

const card = () => screen.findByRole('alert');
const detailsOf = (alert) => alert.querySelector('details');

// An Error without a stack, so the details show its message
const stackless = (message) => {
  const error = new Error(message);
  error.stack = undefined;
  return error;
};







// -----------------------------------------------------------
// a crash
// -----------------------------------------------------------

describe('RouteError — a crash', () => {

  it('says "Something went wrong" with the reload advice — a full-page alert while no session is known', async () => {
    renderRouteError(new Error('Cannot read properties of undefined (reading \'map\')'));
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CRASH.en[0] })).toBeInTheDocument();
    expect(within(alert).getByText(CRASH.en[1])).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
    expect(window.location.reloads).toBe(0);
  });


  it('keeps the stack in a collapsed details box that opens on its summary', async () => {
    const { user } = renderRouteError(new Error('boom in render'));
    const details = detailsOf(await card());
    expect(details.open).toBe(false);
    expect(within(details).getByText('Technical details').tagName).toBe('SUMMARY');
    const pre = details.querySelector('pre');
    expect(pre.textContent).toMatch(/^Error: boom in render\n\s+at /);
    await user.click(within(details).getByText('Technical details'));
    expect(details.open).toBe(true);
  });


  it('shows the message when the error has no stack, and a thrown non-Error as itself', async () => {
    renderRouteError(stackless('no stack here'));
    expect(detailsOf(await card()).querySelector('pre')).toHaveTextContent(/^no stack here$/);
    cleanup();
    renderRouteError('plain words thrown');
    expect(detailsOf(await card()).querySelector('pre')).toHaveTextContent(/^plain words thrown$/);
  });


  it('renders the thrown text as text, never as markup', async () => {
    renderRouteError(stackless('<img src=x onerror=alert(1)> <b>bold</b>'));
    const pre = detailsOf(await card()).querySelector('pre');
    expect(pre).toHaveTextContent('<img src=x onerror=alert(1)> <b>bold</b>');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(pre.querySelector('b')).toBeNull();
  });


  it('a routing error response other than 404 (a loader\'s 503) is a crash, "503 Service Unavailable" in the details', async () => {
    renderRouteError(null, { loader: () => { throw data('down for maintenance', { status: 503, statusText: 'Service Unavailable' }); } });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CRASH.en[0] })).toBeInTheDocument();
    expect(detailsOf(alert).querySelector('pre')).toHaveTextContent(/^503 Service Unavailable$/);
  });


  it('logs the error to the console for whoever debugs it', async () => {
    const log = vi.spyOn(console, 'error');
    const error = new Error('logged crash');
    renderRouteError(error);
    await card();
    await waitFor(() => expect(log).toHaveBeenCalledWith(error));
  });


  it('speaks Lithuanian', async () => {
    renderRouteError(new Error('boom'), { locale: 'lt' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CRASH.lt[0] })).toBeInTheDocument();
    expect(within(alert).getByText(CRASH.lt[1])).toBeInTheDocument();
    expect(within(alert).getByText('Techninė informacija')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Perkrauti puslapį' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Į pradžią' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// a routing 404
// -----------------------------------------------------------

describe('RouteError — a routing 404', () => {

  it('a path no route matches (a table without "*") → "Page not found", "404 Not Found" in the details', async () => {
    renderRouteError(null, { root: true, route: '/nowhere/at/all' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(within(alert).getByText('There is no such page.')).toBeInTheDocument();
    expect(detailsOf(alert).querySelector('pre')).toHaveTextContent(/^404 Not Found$/);
    expect(window.location.reloads).toBe(0);
  });


  it('speaks Lithuanian', async () => {
    renderRouteError(null, { root: true, route: '/niekur', locale: 'lt' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: 'Puslapis nerastas' })).toBeInTheDocument();
    expect(within(alert).getByText('Tokio puslapio nėra.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// a stale chunk
// -----------------------------------------------------------
//
// sessionStorage keeps the time of the last automatic reload
// (utils/chunkReload.js) — the second render in a test is the
// reloaded page failing again within 30 s.
// -----------------------------------------------------------

describe('RouteError — a stale chunk', () => {

  it.each([
    ['Chrome', new TypeError(STALE_CHUNK)],
    ['Firefox', new TypeError('error loading dynamically imported module: http://localhost:3000/assets/Reports-8c2e41.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['a CSS preload', new Error('Unable to preload CSS for /assets/Reports-1f00aa.css')],
    ['a wrapped cause', new Error('Lazy element failed', { cause: new TypeError(STALE_CHUNK) })],
  ])('(%s) reloads the page once by itself — a spinner while it goes, no card', async (_, error) => {
    renderPage(<RouteError error={error} />);
    await waitFor(() => expect(window.location.reloads).toBe(1));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    await settle(50);
    expect(window.location.reloads).toBe(1);
  });


  it('as a route\'s error element too (a lazy piece inside a page) — one reload', async () => {
    // A lazy component that never loaded has no name to report
    allowConsoleErrors(/The above error occurred in one of your React components/);
    const Broken = lazy(() => Promise.reject(new TypeError(STALE_CHUNK)));
    function PageWithLazyPart() {
      return <Suspense fallback={<p>loading part</p>}><Broken /></Suspense>;
    }
    installLocationDouble('/broken');
    const router = createMemoryRouter([{ path: '/', element: <Providers><Outlet /></Providers>, children: [
      { path: 'broken', element: <PageWithLazyPart />, errorElement: <RouteError /> },
    ] }], { initialEntries: ['/broken'] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(window.location.reloads).toBe(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('failing again within 30 s shows "The app was updated" instead of reloading in a loop', async () => {
    const error = new TypeError(STALE_CHUNK);
    renderPage(<RouteError error={error} />);
    await waitFor(() => expect(window.location.reloads).toBe(1));
    cleanup();
    // The reloaded page: a fresh location, the same tab's storage
    const location = installLocationDouble('/reports');
    renderPage(<RouteError error={error} />, { route: '/reports' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CHUNK.en[0] })).toBeInTheDocument();
    expect(within(alert).getByText(CHUNK.en[1])).toBeInTheDocument();
    expect(detailsOf(alert).querySelector('pre')).toHaveTextContent(STALE_CHUNK);
    await settle(50);
    expect(window.location.reloads).toBe(0);
    expect(location.reloads).toBe(0);
  });


  it('after 30 s it is allowed one automatic reload again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    renderPage(<RouteError error={new TypeError(STALE_CHUNK)} />);
    await waitFor(() => expect(window.location.reloads).toBe(1));
    cleanup();
    vi.setSystemTime(new Date('2026-09-27T10:00:31Z'));
    renderPage(<RouteError error={new TypeError(STALE_CHUNK)} />);
    await waitFor(() => expect(window.location.reloads).toBe(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('the root instance reloads once as well, inside its own providers', async () => {
    renderRouteError(new TypeError(STALE_CHUNK), { root: true });
    await waitFor(() => expect(window.location.reloads).toBe(1));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });


  it('speaks Lithuanian', async () => {
    sessionStorage.setItem('complianceChunkReloadAt', String(Date.now()));
    renderPage(<RouteError error={new TypeError(STALE_CHUNK)} />, { locale: 'lt' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CHUNK.lt[0] })).toBeInTheDocument();
    expect(within(alert).getByText(CHUNK.lt[1])).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// where it renders
// -----------------------------------------------------------

describe('RouteError — inside the frame or on its own', () => {

  it('with the session known: inside the frame — navbar, sidebar, the title as the page\'s h1, the card in main', async () => {
    renderRouteError(new Error('boom behind the session'), { session: true });
    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: CRASH.en[0] })).toBeInTheDocument();
    const alert = within(main).getByRole('alert');
    expect(alert).toHaveTextContent(CRASH.en[1]);
    expect(detailsOf(alert).querySelector('pre')).toHaveTextContent('boom behind the session');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu: Rūta Administratorė' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);
  });


  it('the "app was updated" card sits in the frame too', async () => {
    sessionStorage.setItem('complianceChunkReloadAt', String(Date.now()));
    renderRouteError(new TypeError(STALE_CHUNK), { session: true });
    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: CHUNK.en[0] })).toBeInTheDocument();
    expect(within(main).getByRole('alert')).toHaveTextContent(CHUNK.en[1]);
  });


  it('the root instance brings its own providers — the cookie language, the full-page card', async () => {
    renderRouteError(new Error('the layout failed'), { root: true, locale: 'lt' });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CRASH.lt[0] })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });


  it('the root instance stays full-page even with a session around (it renders outside the guard)', async () => {
    renderRouteError(new Error('the layout failed'), { root: true, session: true });
    const alert = await card();
    expect(within(alert).getByRole('heading', { level: 1, name: CRASH.en[0] })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });
});







// -----------------------------------------------------------
// the actions
// -----------------------------------------------------------

describe('RouteError — the way out', () => {

  it('"Reload the page" is a hard reload', async () => {
    const { user } = renderRouteError(new Error('boom'));
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Reload the page' }));
    expect(window.location.reloads).toBe(1);
  });


  it('"Go home" is a hard navigation to "/" — a fresh start, not the router', async () => {
    const { user, router } = renderRouteError(new Error('boom'));
    const assign = vi.spyOn(window.location, 'assign');
    const alert = await card();
    await user.click(within(alert).getByRole('button', { name: 'Go home' }));
    expect(assign).toHaveBeenCalledWith('/console/');
    expect(window.location.navigations).toEqual(['/console/']);
    expect(router.state.location.pathname).toBe('/broken');
  });


  it('both buttons are there in the frame as well', async () => {
    const { user } = renderRouteError(new Error('boom'), { session: true });
    const main = await screen.findByRole('main');
    const alert = within(main).getByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Reload the page' }));
    expect(window.location.reloads).toBe(1);
    await user.click(within(alert).getByRole('button', { name: 'Go home' }));
    expect(window.location.navigations).toEqual(['/console/']);
  });
});
