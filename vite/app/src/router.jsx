// -----------------------------------------------------------
//  [*] Router — the app's route table
//
//  createBrowserRouter under /console (paths.js): the root of
//  the origin belongs to the public site, which has a router
//  of its own (site/router.jsx). The paths below are written
//  without that base — the router adds it to every link.
//  Every page is a child of the App layout route ("/") and
//  renders through PageWrapper (authData as a prop), except
//  /login, which App renders without the auth guard.
//
//  Pages are lazy route modules (review #17): each is its own
//  chunk, fetched on first visit — the router keeps the old
//  page on screen meanwhile (App's progress bar runs). Login
//  and the small error pages stay in the entry chunk. A
//  chunk that fails to load (a tab older than the deploy)
//  renders RouteError, which reloads once.
//
//  Every route carries a translated error element and a
//  handle.title (a message key App turns into the document
//  title); "*" is the in-frame "page not found". The chat
//  routes load zodSetup alongside the page (zod's jitless
//  mode must be on before the AI SDK parses anything).
//
//  Split into:
//
//    loadChat   — the chat page module + zodSetup
//    loadFailed — the stand-in page for a module that failed
//    page       — a lazy page route (PageWrapper + guard + title)
//    router     — the table (named export)
// -----------------------------------------------------------

import { createBrowserRouter } from 'react-router-dom';
import App from '@/App';
import PageWrapper from '@/PageWrapper';
import PageLoading from '@/components/layout/PageLoading';
import { CONSOLE_BASENAME } from '@/paths';

// Eager pages — the entry and the error screens
import Login from '@/pages/Login/Login';
import NotFound from '@/pages/NotFound/NotFound';
import RouteError from '@/pages/RouteError/RouteError';







// -----------------------------------------------------------
// router
// -----------------------------------------------------------
//
// The route table; admin-only pages pass adminOnly (the
// sidebar hides their links as well). It is built at module
// load from the helpers below — function declarations are
// hoisted, so they are defined by then.
//
// Used by:
//   - console.jsx — passed to RouterProvider
// -----------------------------------------------------------

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError root />,
    hydrateFallbackElement: <PageLoading />,
    children: [
      { path: 'login', element: <Login />, errorElement: <RouteError />, handle: { title: 'PAGES.login.TITLE' } },
      { index: true, ...page(loadChat, { title: 'sidebar.MAIN.chat' }) },
      { path: 'chat/:threadId', ...page(loadChat, { title: 'sidebar.MAIN.chat' }) },
      { path: 'dashboard', ...page(() => import('@/pages/Dashboard/Dashboard'), { title: 'sidebar.MAIN.dashboard' }) },
      { path: 'companies', ...page(() => import('@/pages/Companies/Companies'), { title: 'sidebar.COMPLIANCE.companies' }) },
      { path: 'companies/:companyId', ...page(() => import('@/pages/Companies/CompanyDetail'), { title: 'PAGES.company.TITLE' }) },
      { path: 'reports', ...page(() => import('@/pages/Reports/Reports'), { title: 'sidebar.COMPLIANCE.reports' }) },
      { path: 'reports/:reportId', ...page(() => import('@/pages/Reports/ReportDetail'), { title: 'PAGES.report.TITLE' }) },
      { path: 'programme/:productId', ...page(() => import('@/pages/Programme/ProductPage'), { title: 'PAGES.programme.TITLE' }) },
      { path: 'corpus', ...page(() => import('@/pages/Corpus/Corpus'), { title: 'sidebar.LAW.corpus' }) },
      { path: 'corpus/:documentId', ...page(() => import('@/pages/Corpus/CorpusDocument'), { title: 'PAGES.corpusDocument.TITLE' }) },
      { path: 'obligations', ...page(() => import('@/pages/Obligations/Obligations'), { title: 'sidebar.LAW.obligations', adminOnly: true }) },
      { path: 'prompts', ...page(() => import('@/pages/Prompts/Prompts'), { title: 'sidebar.ADMIN.prompts', adminOnly: true }) },
      { path: 'prompts/:slug', ...page(() => import('@/pages/Prompts/PromptEditor'), { title: 'PAGES.promptEditor.TITLE', adminOnly: true }) },
      { path: 'settings/mcp', ...page(() => import('@/pages/Mcp/McpServers'), { title: 'sidebar.ADMIN.mcp', adminOnly: true }) },
      { path: 'users', ...page(() => import('@/pages/Users/Users'), { title: 'sidebar.ADMIN.users', adminOnly: true }) },
      { path: 'audit', ...page(() => import('@/pages/Audit/Audit'), { title: 'sidebar.ADMIN.audit', adminOnly: true }) },
      { path: 'usage', ...page(() => import('@/pages/Usage/Usage'), { title: 'sidebar.SYSTEM.usage' }) },
      { path: 'jobs', ...page(() => import('@/pages/Jobs/Jobs'), { title: 'sidebar.SYSTEM.jobs' }) },
      { path: 'account', ...page(() => import('@/pages/Account/Account'), { title: 'sidebar.SYSTEM.account' }) },
      { path: '*', element: <PageWrapper component={NotFound} />, errorElement: <RouteError />, handle: { title: 'PAGES.notFound.TITLE' } },
    ],
  },
], { basename: CONSOLE_BASENAME });







// -----------------------------------------------------------
// loadChat
// -----------------------------------------------------------
//
// The chat page's module, with zodSetup evaluated first (both
// fetched in parallel; the page renders only after both).
//
// Used by:
//   - router (above) — the index and /chat/:threadId routes
// -----------------------------------------------------------

function loadChat() {
  return Promise.all([import('@/zodSetup'), import('@/pages/Chat/Chat')]).then(([, chat]) => chat);
}







// -----------------------------------------------------------
// loadFailed
// -----------------------------------------------------------
//
// The page component standing in for a module that failed to
// load: RouteError with that error. It goes through the same
// PageWrapper as the page would, so it waits for the session
// like the page (a bare RouteError flashed the full-page card
// until the session check answered, then swapped to the
// in-frame one) and keeps the admin guard.
//
// Used by:
//   - page (below)
// -----------------------------------------------------------

function loadFailed(error) {
  return function PageLoadFailed() {
    return <RouteError error={error} />;
  };
}







// -----------------------------------------------------------
// page
// -----------------------------------------------------------
//
//   { path: 'users', ...page(() => import('…/Users'), { title, adminOnly: true }) }
//
// The route pieces of one lazy page: the module loader, the
// PageWrapper element (with the admin guard), the title key
// and the error element. A module that fails to load is
// caught HERE: React Router swallows a rejected lazy() on a
// route without a loader and would render nothing at all,
// so the route gets RouteError as its page instead (it
// reloads once, then says the app was updated).
//
// Used by:
//   - router (above)
// -----------------------------------------------------------

function page(load, { title, adminOnly = false } = {}) {
  return {
    handle: { title },
    errorElement: <RouteError />,
    lazy: async () => {
      try {
        const { default: Component } = await load();
        return { element: <PageWrapper component={Component} adminOnly={adminOnly} /> };
      } catch (error) {
        return { element: <PageWrapper component={loadFailed(error)} adminOnly={adminOnly} /> };
      }
    },
  };
}
