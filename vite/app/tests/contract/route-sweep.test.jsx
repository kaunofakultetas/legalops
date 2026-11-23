// -----------------------------------------------------------
//  [*] Tests — the route sweep (every page × every session /
//      backend state)
//
//  Every route of the real route table (router.jsx), rendered
//  through App.jsx on a memory router — AuthProvider, the
//  /api/auth/me check, PageWrapper, the lazy page — under the
//  conditions every page must tolerate whatever it does
//  inside:
//
//    - the administrator session — the page renders, titles
//      the tab "<page> · Compliance assistant" and makes only
//      requests the backend double knows
//    - a plain user — the admin-only pages show "Access
//      restricted" (without fetching anything), the others
//      render
//    - the Lithuanian locale — the tab title in Lithuanian
//    - every GET answering the 500 envelope — the page shows
//      at least one alert with the translated sentence (when
//      it fetched anything) and does not crash
//    - a 401 on the page's GETs — the hard redirect to
//      /login?next=<the page>&expired=1, nothing crashes
//    - every GET answering a JSON string, an empty object or
//      never answering — an answer of the wrong shape or none
//      at all must not crash the page
//
//  The per-page tests cover behaviour; this file is the
//  safety net that no route can be forgotten by.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '../support/render';
import { server, url, apiError, given } from '../support/backend/server';
import { settle, expectNoCrash } from '../support/backend/contract';
import { userAuthData } from '../support/auth';
import * as f from '../support/backend/fixtures';
import { messagesMap } from '@/messages';


// Fixture ids for the route params — the detail pages
const PARAM_VALUES = {
  threadId: f.ID.licenceThread,
  companyId: f.ID.pavyzdys,
  reportId: f.ID.reportDone,
  productId: f.ID.productGovernance,
  documentId: f.ID.mica,
  slug: 'report.gap_analysis',
};

const APP_TITLE = { en: 'Compliance assistant', lt: 'Atitikties asistentas' };


const routesToSweep = async () => {
  const { router } = await import('@/router');
  const routes = [];
  for (const r of router.routes[0].children) {
    if (r.path === 'login' || r.path === '*') continue;
    // The module-level browser router may already have loaded
    // the route it started on (React Router then swaps `lazy`
    // for the loaded element)
    const { element } = r.lazy ? await r.lazy() : r;
    routes.push({
      path: r.index ? '/' : '/' + r.path.replace(/:(\w+)/g, (_, name) => PARAM_VALUES[name]),
      titleKey: r.handle.title,
      adminOnly: Boolean(element.props.adminOnly),
    });
  }
  return routes;
};

const expectedTitle = (titleKey, locale = 'en') =>
  `${titleKey.split('.').reduce((node, key) => node?.[key], messagesMap[locale])} · ${APP_TITLE[locale]}`;

// Every GET but the session check answers `respond`; counts
// the GETs the page made and how many were answered
const everyGet = (respond) => {
  const calls = { count: 0, answered: 0, paths: [] };
  server.use(
    http.get(url('/api/*'), async ({ request }) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/api/auth/me') return undefined;
      calls.count += 1;
      calls.paths.push(pathname);
      const response = await respond(request);
      calls.answered += 1;
      return response;
    }),
  );
  return calls;
};

// Waits until every GET the page issued has been answered and
// React has rendered the outcome (a page that fetched nothing
// just gets the settle)
const backendIdle = async (gets) => {
  const deadline = Date.now() + 8000;
  let seen = -1;
  while (Date.now() < deadline) {
    await settle(250);
    if (gets.answered === gets.count && gets.count === seen) return;
    seen = gets.count;
  }
};

const titled = async (titleKey, locale = 'en') => {
  await waitFor(() => expect(document.title).toBe(expectedTitle(titleKey, locale)));
};







// -----------------------------------------------------------
// the sweep
// -----------------------------------------------------------

describe('route sweep', async () => {

  const routes = await routesToSweep();

  it('covers every framed route of the route table', () => {
    expect(routes.map((r) => r.path)).toEqual([
      '/', `/chat/${PARAM_VALUES.threadId}`, '/dashboard', '/companies', `/companies/${PARAM_VALUES.companyId}`,
      '/reports', `/reports/${PARAM_VALUES.reportId}`, `/programme/${PARAM_VALUES.productId}`, '/corpus', `/corpus/${PARAM_VALUES.documentId}`, '/obligations',
      '/prompts', `/prompts/${PARAM_VALUES.slug}`, '/settings/mcp', '/users', '/audit', '/usage', '/jobs', '/account',
    ]);
  });


  describe.each(routes)('$path', ({ path, titleKey, adminOnly }) => {

    it('renders under the administrator session and titles the tab', async () => {
      await renderApp({ route: path });
      await titled(titleKey);
      await settle(300);
      expectNoCrash();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Access restricted' })).toBeNull();
    });


    it(adminOnly ? 'shows "Access restricted" to a plain user without fetching' : 'renders for a plain user', async () => {
      given.json('get', '/api/auth/me', userAuthData);
      // An admin-only page must not even ask; the others use the
      // default answers
      const gets = adminOnly ? everyGet(() => HttpResponse.json(apiError('FORBIDDEN', 'Forbidden'), { status: 403 })) : null;
      await renderApp({ route: path });
      await titled(titleKey);
      await settle(300);
      expectNoCrash();
      if (adminOnly) {
        expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeInTheDocument();
        expect(gets.count).toBe(0);
      } else {
        expect(screen.queryByRole('heading', { name: 'Access restricted' })).toBeNull();
      }
    });


    it('renders in Lithuanian', async () => {
      await renderApp({ route: path, locale: 'lt' });
      await titled(titleKey, 'lt');
      await settle(300);
      expectNoCrash();
    });


    it('shows the failure, not a crash, when every GET answers 500', async () => {
      const gets = everyGet(() => HttpResponse.json(apiError('SERVER_ERROR', 'Internal server error'), { status: 500 }));
      await renderApp({ route: path });
      await titled(titleKey);
      await backendIdle(gets);
      expectNoCrash();
      if (gets.count > 0) {
        await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent.includes('Server error. Try again later.'))).toBe(true));
      }
    });


    it('redirects to /login with the page as ?next=, without crashing, when a GET answers 401', async () => {
      const gets = everyGet(() => HttpResponse.json(apiError('AUTH_REQUIRED', 'Authentication required'), { status: 401 }));
      await renderApp({ route: path });
      await titled(titleKey);
      await backendIdle(gets);
      expectNoCrash();
      if (gets.count > 0) {
        const next = path === '/' ? '' : `next=${encodeURIComponent(path)}&`;
        await waitFor(() => expect(window.location.navigations[0]).toBe(`/console/login?${next}expired=1`));
      }
    });


    it('survives every GET answering a JSON string', async () => {
      const gets = everyGet(() => HttpResponse.json('not what you expected'));
      await renderApp({ route: path });
      await titled(titleKey);
      await backendIdle(gets);
      expectNoCrash();
    });


    it('survives every GET answering an empty object', async () => {
      const gets = everyGet(() => HttpResponse.json({}));
      await renderApp({ route: path });
      await titled(titleKey);
      await backendIdle(gets);
      expectNoCrash();
    });


    it('keeps its frame while every GET hangs', async () => {
      everyGet(() => new Promise(() => {}));
      await renderApp({ route: path });
      await titled(titleKey);
      await settle(300);
      expectNoCrash();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
