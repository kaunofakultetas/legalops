// -----------------------------------------------------------
//  [*] RouteError — the router's errorElement
//
//  What renders when a route throws: a render crash, a lazy
//  page chunk that failed to load, a 404 from the router.
//  Every child route carries it (so a crashed page keeps the
//  navbar and sidebar when the session is known), and the
//  root route carries it too — there it renders outside App,
//  so it brings its own Providers.
//
//  A failed chunk (a tab older than the last deploy) reloads
//  the page once by itself (utils/chunkReload.js); only a
//  second failure shows the "app was updated" card.
//
//  Split into (root component last):
//
//    describe       — error → {kind, detail}
//    ErrorActions   — reload / home buttons
//    RouteErrorBody — the texts for one error kind
//    RouteError     — the page (default export)
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useTranslations } from '@/i18n';
import { useAuth } from '@/AuthGuard';
import { isChunkLoadError, reloadOnce } from '@/utils/chunkReload';
import Providers from '@/providers';
import { CONSOLE_BASE } from '@/paths';
import FullPageMessage from '@/components/layout/FullPageMessage';
import PageLayout from '@/components/layout/PageLayout';
import PageLoading from '@/components/layout/PageLoading';







// -----------------------------------------------------------
// describe
// -----------------------------------------------------------
//
// {kind: 'chunk' | 'notFound' | 'crash', detail} — detail is
// the technical line for the collapsed details box.
//
// Used by:
//   - RouteErrorBody, RouteError (below)
// -----------------------------------------------------------

function describe(error) {
  if (isRouteErrorResponse(error)) {
    return { kind: error.status === 404 ? 'notFound' : 'crash', detail: `${error.status} ${error.statusText || ''}`.trim() };
  }
  if (isChunkLoadError(error)) return { kind: 'chunk', detail: String(error?.message ?? error) };
  return { kind: 'crash', detail: String(error?.stack || error?.message || error) };
}







// -----------------------------------------------------------
// ErrorActions
// -----------------------------------------------------------
//
// Reload (a hard reload — the cure for a stale chunk) and a
// hard navigation home.
//
// Used by:
//   - RouteErrorBody (below)
// -----------------------------------------------------------

function ErrorActions() {
  const t = useTranslations('PAGES.routeError');
  return (
    <>
      <Button variant="contained" onClick={() => window.location.reload()}>{t('reload')}</Button>
      <Button onClick={() => window.location.assign(CONSOLE_BASE)}>{t('home')}</Button>
    </>
  );
}







// -----------------------------------------------------------
// RouteErrorBody
// -----------------------------------------------------------
//
// Inside the frame when the session is known (a card in the
// page), otherwise the full-page card.
//
// Used by:
//   - RouteError (below)
// -----------------------------------------------------------

function RouteErrorBody({ error }) {

  const t = useTranslations('PAGES.routeError');
  const authData = useAuth();
  const { kind, detail } = describe(error);
  const title = kind === 'chunk' ? t('chunkTitle') : kind === 'notFound' ? t('notFoundTitle') : t('TITLE');
  const text = kind === 'chunk' ? t('chunkText') : kind === 'notFound' ? t('notFoundText') : t('text');


  if (!authData) {
    return <FullPageMessage icon={ErrorOutlineIcon} title={title} text={text} details={detail} detailsLabel={t('details')} actions={<ErrorActions />} />;
  }


  return (
    <PageLayout authData={authData} title={title}>
      <Paper className="p-6 max-w-xl flex flex-col gap-3" role="alert">
        <Typography>{text}</Typography>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">{t('details')}</summary>
          <pre className="whitespace-pre-wrap mt-2 max-h-64 overflow-auto">{detail}</pre>
        </details>
        <div className="flex gap-2 flex-wrap"><ErrorActions /></div>
      </Paper>
    </PageLayout>
  );
}







// -----------------------------------------------------------
// RouteError (default export)
// -----------------------------------------------------------
//
// `root` marks the instance on the root route, which sits
// outside App and so wraps itself in Providers; `error` is
// passed when it stands in for a page whose lazy module
// failed to load (router.jsx loadFailed — rendered behind
// PageWrapper like the page, so the session is known). A
// chunk error first tries the one automatic reload (spinner
// while the page goes away).
//
// Used by:
//   - router.jsx — errorElement of the root and of every page,
//     and loadFailed, the stand-in for a page whose module
//     failed to load
// -----------------------------------------------------------

export default function RouteError({ root = false, error: passedError = null }) {

  const routeError = useRouteError();
  const error = passedError ?? routeError;
  const [reloading, setReloading] = useState(() => isChunkLoadError(error));


  useEffect(() => {
    if (reloading && !reloadOnce()) setReloading(false);
  }, [reloading]);


  // The console keeps the real stack for whoever debugs it
  useEffect(() => { console.error(error); }, [error]);


  const body = reloading ? <PageLoading /> : <RouteErrorBody error={error} />;
  return root ? <Providers>{body}</Providers> : body;
}
