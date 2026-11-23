// -----------------------------------------------------------
//  [*] Login — the sign-in page
//
//  POSTs /api/auth/login with RAW axios on purpose: a wrong
//  password is a 401 and must not trigger the api client's
//  redirect. On success the token is stored and the page is
//  REPLACED (not pushed) by ?next= or the console's first
//  page, so Back never returns to the form (review #3).
//
//  Arriving with a token (Back from the app, a bookmark)
//  skips the form and goes home — a stale token then meets
//  its 401 there and comes back with ?expired=1, which
//  prints the "session ended" notice above the form. The
//  page no longer clears the token on mount: logout clears
//  it itself.
//
//  Validation is the page's own (noValidate) so the messages
//  speak the UI language, and it only asks for "something@
//  something" — Django accepts dotless addresses such as
//  admin@localhost, so the form must too. Errors come from
//  utils/errors.js (a rate limit says how long to wait); an
//  answer without a token is refused rather than stored (a
//  stored "undefined" would bounce straight back here as an
//  expired session). The "session ended" notice is a polite
//  status, the failure an alert. The email field autofocuses
//  only with a fine pointer — on a phone it would pop the
//  keyboard over the form.
//
//  The page is headed paper: one sheet on the desk with the
//  wordmark — the link out to the public site, which says
//  what the product is — the language switch on the same
//  line, and an ink rule under them, like a letterhead;
//  then the title, a sentence on what the app does and the
//  form. Behind the sheet lies the
//  backdrop of jauka's login page in the brand's colours: a
//  gradient from the dark ink through ink to the mark's
//  middle blue, and the drifting dots-and-lines network over
//  it (Particles.jsx, which loads after the form, never
//  before it).
//
//  Split into (root component last):
//
//    EMAIL_RE       — the "x@y" shape check (no dot needed)
//    LoginParticles — the backdrop, loaded lazily
//    LanguageSwitch — the LT/EN text button in the letterhead
//    LoginForm      — email + password + submit
//    Login          — the page (default export)
// -----------------------------------------------------------

import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { getToken, setToken } from '@/auth/token';
import { safeNext } from '@/auth/session';
import { useLocale, useSetLocale, useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import PageLoading from '@/components/layout/PageLoading';
import Wordmark from '@/components/layout/Wordmark';


// Something@something — the backend's own rule (it matches
// case-insensitively and needs no dot: admin@localhost)
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

// The particles backdrop, in a chunk of its own: the library
// is fetched only by the login page, and after the form
const LoginParticles = lazy(() => import('@/pages/Login/Particles'));







// -----------------------------------------------------------
// LanguageSwitch
// -----------------------------------------------------------
//
// Names the other language (in that language) and switches
// to it. It stands at the right end of the letterhead, on
// the wordmark's line — where the console's bar and the
// public site keep theirs.
//
// Used by:
//   - Login (below)
// -----------------------------------------------------------

function LanguageSwitch() {
  const t = useTranslations('navbar');
  const locale = useLocale();
  const setLocale = useSetLocale();
  const target = locale === 'lt' ? 'en' : 'lt';
  return (
    <Button size="small" onClick={() => setLocale(target)} lang={target} className="-mr-1.5 shrink-0">
      {target === 'en' ? t('english') : t('lithuanian')}
    </Button>
  );
}







// -----------------------------------------------------------
// LoginForm
// -----------------------------------------------------------
//
// Owns the two fields, the field errors (shown after the
// first submit), the server error box and the submit.
//
// Used by:
//   - Login (below)
// -----------------------------------------------------------

function LoginForm({ next, expired }) {

  const t = useTranslations('PAGES.login');
  const describe = useErrorMessage();
  const finePointer = useMediaQuery('(pointer: fine)', { noSsr: true });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);


  const emailError = !email.trim() ? t('emailRequired') : !EMAIL_RE.test(email.trim()) ? t('emailInvalid') : null;
  const passwordError = !password ? t('passwordRequired') : null;


  const submit = async (event) => {
    event.preventDefault();
    setTried(true);
    if (emailError || passwordError) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await axios.post('/api/auth/login', { email: email.trim(), password });
      if (typeof data?.token !== 'string' || !data.token) throw new Error('POST /api/auth/login answered no token');
      setToken(data.token);
      window.location.replace(next);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };


  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="mb-1">
        <Typography variant="h5" component="h1" className="text-[2rem]">{t('TITLE')}</Typography>
        <Typography color="text.secondary" className="mt-2">{t('subtitle')}</Typography>
      </div>
      {expired && !error && <Alert severity="info" role="status">{t('expired')}</Alert>}
      <TextField
        label={t('email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        required autoFocus={finePointer} autoComplete="username"
        error={tried && Boolean(emailError)} helperText={tried ? emailError : null}
        // TextField hands unknown props to its wrapper div — the
        // keyboard hint must reach the <input> itself
        slotProps={{ htmlInput: { inputMode: 'email' } }}
      />
      <TextField
        label={t('password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        required autoComplete="current-password"
        error={tried && Boolean(passwordError)} helperText={tried ? passwordError : null}
      />
      {error && <Alert severity="error" role="alert">{describe(error)}</Alert>}
      <Button type="submit" variant="contained" size="large" loading={busy} className="mt-1">{t('submit')}</Button>
    </form>
  );
}







// -----------------------------------------------------------
// Login (default export)
// -----------------------------------------------------------
//
// The sheet on the ink gradient, as the page's main
// landmark: the letterhead — the wordmark with the language
// switch at its right end — and the form, raised over the
// particles layer (the main is
// its own stacking context, so the layers stay inside it).
// Nothing but the particles sits on the gradient itself, so
// every word keeps the sheet's contrast. With a token
// already stored it only redirects.
//
// Used by:
//   - router.jsx — route /login (rendered without AuthGuard)
// -----------------------------------------------------------

export default function Login() {

  const tNav = useTranslations('navbar');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const hasToken = Boolean(getToken());


  useEffect(() => {
    if (hasToken) window.location.replace(next);
  }, [hasToken, next]);


  if (hasToken) return <PageLoading />;


  return (
    <main className="relative isolate overflow-hidden min-h-dvh flex items-center justify-center bg-linear-to-br from-primary-dark via-primary to-primary-light px-4 py-8">
      <Suspense fallback={null}><LoginParticles /></Suspense>
      <div className="relative w-full max-w-[27rem] bg-surface border border-edge rounded-lg shadow-float px-6 pt-6 pb-5 sm:px-10 sm:pt-8 sm:pb-7">
        <div className="pb-5 mb-7 border-b-2 border-primary flex items-center justify-between gap-3">
          <a
            href="/" aria-label={tNav('site')}
            className="flex min-w-0 no-underline rounded outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Wordmark name={tNav('title')} size={30} />
          </a>
          <LanguageSwitch />
        </div>
        <LoginForm next={next} expired={params.get('expired') === '1'} />
      </div>
    </main>
  );
}
