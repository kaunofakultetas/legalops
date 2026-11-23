// -----------------------------------------------------------
//  [*] AuthGuard — session state for the whole app
//
//  Checks the session once on app start (GET /api/auth/me
//  with the bearer the api client attaches) as a TanStack
//  query that never goes stale, and shares the result
//  through React context: null until the check finishes,
//  then the account object ({id, email, displayName, role}).
//
//  The outcomes, kept apart on purpose (review #3/#4):
//
//    - no token at all → straight to /login?next=<here>,
//      without a request
//    - 401             → the api client drops the token and
//                        replaces the page with
//                        /login?next=<here>&expired=1
//    - 5xx / network   → the token STAYS; a full-page
//                        "server unreachable" card with a
//                        retry (a restart of the backend must
//                        not log everybody out)
//    - a 200 that is no account (an empty body, null, the
//      SPA's index.html from a misrouted proxy) → the same
//      card: the app never runs signed in as nobody
//
//  Split into (root component last):
//
//    isAccount         — is this answer a session
//    useAuth           — the session data (null while loading)
//    ServerUnreachable — the retry card
//    AuthProvider      — the provider (named export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the provider and its hook belong together; editing this
   file reloads the page instead of hot-swapping it */

import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import api from '@/api/client';
import { clearToken, getToken } from '@/auth/token';
import { redirectToLogin } from '@/auth/session';
import { useTranslations } from '@/i18n';
import { errorInfo, useErrorMessage } from '@/utils/errors';
import FullPageMessage from '@/components/layout/FullPageMessage';
import PageLoading from '@/components/layout/PageLoading';


// null until the /api/auth/me answer arrives
const AuthContext = createContext(null);

// The roles a session can have — the role gates what the UI
// shows, so an answer with any other is no session
const ROLES = ['admin', 'user'];







// -----------------------------------------------------------
// isAccount
// -----------------------------------------------------------
//
// True for what users/auth.py user_json writes: an object
// with a non-empty string id and a known role. Anything else
// in a 200 (null, "", a list, an HTML page, a role the UI
// does not know) would leave the app on a spinner for ever or
// let it in as a role-less nobody.
//
// Used by:
//   - AuthProvider (below) — the query function
// -----------------------------------------------------------

function isAccount(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.id === 'string' && data.id !== ''
    && ROLES.includes(data.role);
}







// -----------------------------------------------------------
// useAuth
// -----------------------------------------------------------
//
// The session data, or null while the check is running.
//
// Used by:
//   - PageWrapper.jsx — reads authData for every routed page
//   - pages/RouteError/RouteError.jsx — frame or bare card
// -----------------------------------------------------------

export function useAuth() {
  return useContext(AuthContext);
}







// -----------------------------------------------------------
// ServerUnreachable
// -----------------------------------------------------------
//
// The whole-page state for a session check that failed for
// any reason but a 401: the translated cause, a retry, and
// a way to sign in again (which does drop the token).
//
// Used by:
//   - AuthProvider (below)
// -----------------------------------------------------------

function ServerUnreachable({ error, retrying, onRetry }) {

  const t = useTranslations('COMPONENTS.errors');
  const describe = useErrorMessage();
  const info = errorInfo(error);


  const signInAgain = () => {
    clearToken();
    redirectToLogin();
  };


  return (
    <FullPageMessage
      icon={CloudOffOutlinedIcon}
      title={t('UNREACHABLE_TITLE')}
      text={`${describe(error)} ${t('UNREACHABLE_TEXT')}`}
      details={info.status ? `HTTP ${info.status}${info.code ? ` · ${info.code}` : ''}` : null}
      detailsLabel={t('details')}
      actions={(
        <>
          <Button variant="contained" onClick={onRetry} loading={retrying}>{t('retry')}</Button>
          <Button onClick={signInAgain}>{t('loginAgain')}</Button>
        </>
      )}
    />
  );
}







// -----------------------------------------------------------
// AuthProvider
// -----------------------------------------------------------
//
// One check per app start: never stale, never refetched on
// focus/reconnect. A network error is retried once (a blip),
// a server answer never is — the retry button is the user's.
// Whether there is a token at all is decided at mount.
// An answer that is no account fails the check with the
// response attached (so it is not retried and the card can
// say "HTTP 200"). While Retry runs, the card stays up with
// the last failure and a busy button.
//
// Used by:
//   - App.jsx — wraps every page except /login
// -----------------------------------------------------------

export function AuthProvider({ children }) {

  // Decided once, when the guard mounts: a token dropped later
  // (the api client's 401, "Sign in again") comes with its own
  // redirect, and a second one from the effect below would
  // override it — /login without ?expired=1
  const [hasToken] = useState(() => Boolean(getToken()));


  const { data: authData = null, error, isError, isFetching, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await api.get('/api/auth/me');
      if (!isAccount(response.data)) throw Object.assign(new Error('GET /api/auth/me answered no account'), { response });
      return response.data;
    },
    enabled: hasToken,
    staleTime: Infinity,
    retry: (count, err) => count < 1 && !err?.response,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });


  // TanStack clears the error of a query that never succeeded
  // the moment it refetches — the card would give way to a
  // spinner while Retry runs (and take the focus with it), so
  // the last failure is held until an answer arrives
  const [lastError, setLastError] = useState(null);
  if (isError && error !== lastError) setLastError(error);
  const shownError = isError ? error : (isFetching && !authData ? lastError : null);


  // Never signed in — no request, no "expired" notice
  useEffect(() => {
    if (!hasToken) redirectToLogin();
  }, [hasToken]);


  if (!hasToken) return <PageLoading />;
  if (shownError) return <ServerUnreachable error={shownError} retrying={isFetching} onRetry={() => refetch()} />;


  return (
    <AuthContext.Provider value={authData}>
      {children}
    </AuthContext.Provider>
  );
}
