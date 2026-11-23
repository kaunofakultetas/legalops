// -----------------------------------------------------------
//  [*] PageLoading — the full-page spinner
//
//  Shown while the first lazy page loads, while the session
//  check runs (before any page can render with authData)
//  and while a hard redirect or reload is on its way.
//
//  The spinner is named ("Įkeliama…"): an unnamed
//  progressbar reaches a screen reader as a bare "progress
//  bar". The name comes from translate(), which reads the
//  locale cookie — the router's hydrate fallback renders
//  this OUTSIDE App and so outside the IntlProvider, where
//  useTranslations would always answer Lithuanian.
// -----------------------------------------------------------

import CircularProgress from '@mui/material/CircularProgress';
import { translate } from '@/i18n';







// -----------------------------------------------------------
// PageLoading (default export)
// -----------------------------------------------------------
//
// A centred MUI spinner filling the viewport.
//
// Used by:
//   - router.jsx — the root route's hydrate fallback (the
//     first lazy page still loading)
//   - PageWrapper.jsx — until authData is known
//   - AuthGuard.jsx — no token: the redirect to /login
//   - pages/Login/Login.jsx — a signed-in visitor sent on
//   - pages/RouteError/RouteError.jsx — the chunk reload
// -----------------------------------------------------------

export default function PageLoading() {
  return (
    <div className="h-screen flex items-center justify-center">
      <CircularProgress aria-label={translate('COMPONENTS.common.loading')} />
    </div>
  );
}
