// -----------------------------------------------------------
//  [*] api client — the app's single axios instance
//
//  Every backend call goes through this instance so the
//  cross-cutting concerns live in ONE place:
//
//    - the bearer token (auth/token.js) is attached to every
//      request as "Authorization: Bearer <token>"
//    - a 401 anywhere drops the stored token and replaces the
//      page with /login?next=<here>&expired=1 (auth/session.js)
//      — ONLY a 401: a 5xx or a dead network keeps the token
//    - any other failed MUTATION toasts the translated error
//      (utils/errors.js — never the backend's English prose or
//      a raw code) and rethrows; failed GETs surface through
//      their query's error state instead (a toast per failed
//      poll would spam)
//
//  Two per-request flags opt out (axios passes unknown config
//  keys through to the interceptors):
//
//    { silent: true }           — no toast; the caller shows
//                                 the error inline (dialogs)
//    { skipAuthRedirect: true } — a 401 is just an error
//                                 (logout with a dead token)
//
//  The login request itself uses raw axios on purpose — a
//  wrong password is a 401 and must not trigger the redirect.
//
//  Split into:
//
//    api       — the instance (named + default export)
//    errorText — the displayable sentence for one failure
// -----------------------------------------------------------

import axios from 'axios';
import toast from '@/utils/toast';
import { clearToken, getToken } from '@/auth/token';
import { redirectToLogin } from '@/auth/session';
import { errorMessage } from '@/utils/errors';







// -----------------------------------------------------------
// api
// -----------------------------------------------------------
//
// The instance with both interceptors installed.
//
// Used by:
//   - every useQuery queryFn and useMutation mutationFn
//   - AuthGuard.jsx — the /api/auth/me query
//   - utils/download.js — the blob exports
//   - pages/Chat/ChatRuntime.jsx — threads, history, uploads
// -----------------------------------------------------------

export const api = axios.create();


// Attach the bearer token to every request that has one
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const config = error.config ?? {};

    // Session expired or killed — drop the dead token and
    // restart at the login page, which brings the user back
    // here afterwards. The promise never settles: the page is
    // being replaced, and no caller should flash an error.
    if (status === 401 && !config.skipAuthRedirect) {
      const hadToken = Boolean(getToken());
      clearToken();
      redirectToLogin({ expired: hadToken });
      return new Promise(() => {});
    }

    const method = (config.method ?? 'get').toLowerCase();
    if (method !== 'get' && !config.silent && !axios.isCancel(error)) {
      // One toast per message: a bulk action failing ten
      // times in a row shows one line, not ten; it stays as
      // long as it takes to read (utils/toast)
      const text = errorMessage(error);
      toast.error(text, { id: text });
    }

    return Promise.reject(error);
  },
);







// -----------------------------------------------------------
// errorText
// -----------------------------------------------------------
//
// The translated sentence for one failure — kept for the
// callers that import it from here; new code uses
// useErrorMessage (utils/errors.js), which follows a locale
// switch.
//
// Used by:
//   - nothing in the pages at the moment (Login moved to
//     useErrorMessage); kept as the client's public helper
// -----------------------------------------------------------

export function errorText(error) {
  return errorMessage(error);
}


export default api;
