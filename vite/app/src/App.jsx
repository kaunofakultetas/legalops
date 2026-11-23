// -----------------------------------------------------------
//  [*] App — the root layout route
//
//  Every page in router.jsx renders through its outlet.
//  /login renders inside the providers only (no auth check —
//  a failed check redirects to /login, so running it there
//  would loop); everything else sits behind AuthProvider.
//  "/login" is matched the way the router matches its route
//  (any case, a trailing slash allowed): a literal compare
//  put /login/ behind the guard, which bounced it to /login.
//
//  Two app-wide helpers live here because they need the
//  router and the providers at once:
//
//    - the document title follows the route (each route's
//      handle.title is a message key) and the locale
//    - a thin progress bar runs along the top while a lazy
//      page chunk loads (the old page stays on screen until
//      the new one is ready — the router waits for it)
//
//  And one that must see every location the router commits,
//  whatever page shows it: NavigationMemory, the history
//  tracker the pages' way back and scroll memory read.
//
//  Split into (root component last):
//
//    TitleSync          — document.title from the route
//    NavigationProgress — the top bar during navigation
//    App                — the layout route (default export)
// -----------------------------------------------------------

import { useEffect } from 'react';
import { matchPath, useLocation, useMatches, useNavigation, useOutlet } from 'react-router-dom';
import LinearProgress from '@mui/material/LinearProgress';
import Providers from '@/providers';
import { AuthProvider } from '@/AuthGuard';
import { useTranslations } from '@/i18n';
import NavigationMemory from '@/components/layout/NavigationMemory';


// The one unguarded route (router.jsx — path "login")
const LOGIN_PATH = '/login';







// -----------------------------------------------------------
// TitleSync
// -----------------------------------------------------------
//
// "<page> · <app>" from the deepest route with a title key,
// the app name alone otherwise; re-runs on a locale switch.
//
// Used by:
//   - App (below)
// -----------------------------------------------------------

function TitleSync() {

  const t = useTranslations();
  const matches = useMatches();
  const key = [...matches].reverse().find((match) => match.handle?.title)?.handle.title;
  const app = t('navbar.title');
  const page = key ? t(key) : null;


  useEffect(() => {
    document.title = page && page !== key ? `${page} · ${app}` : app;
  }, [page, key, app]);


  return null;
}







// -----------------------------------------------------------
// NavigationProgress
// -----------------------------------------------------------
//
// Visible only while the router is loading a route (a lazy
// page module); fixed along the top edge, over the ink bar,
// so it runs in the brand's yellow — the progress blue would
// barely show on ink.
//
// Used by:
//   - App (below)
// -----------------------------------------------------------

function NavigationProgress() {
  const t = useTranslations('COMPONENTS.common');
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return <LinearProgress color="inherit" aria-label={t('loading')} className="fixed top-0 left-0 right-0 z-[1400] text-marker" />;
}







// -----------------------------------------------------------
// App (default export)
// -----------------------------------------------------------
//
// Decides per pathname whether the outlet is guarded.
//
// Used by:
//   - router.jsx — element of the "/" layout route
// -----------------------------------------------------------

export default function App() {

  const { pathname } = useLocation();
  const outlet = useOutlet();
  const isLogin = matchPath(LOGIN_PATH, pathname) !== null;


  return (
    <Providers>
      <TitleSync />
      <NavigationMemory />
      <NavigationProgress />
      {isLogin ? outlet : <AuthProvider>{outlet}</AuthProvider>}
    </Providers>
  );
}
