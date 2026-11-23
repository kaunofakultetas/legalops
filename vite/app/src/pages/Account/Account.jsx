// -----------------------------------------------------------
//  [*] Account — the caller's own settings
//
//  Profile summary, password change (rotates and kills the
//  other sessions server-side) and "log out everywhere"
//  behind a confirmation, which drops the local token
//  whatever the backend answers. The password form checks
//  the policy's two bounds and the repeat client-side, the
//  way users/auth.py counts them: at least 10 characters
//  (code points — an emoji is one, as in Python's len) and
//  at most 72 bytes of UTF-8 (bcrypt's ceiling — ą or ž take
//  two). The current password stays the server's
//  (WRONG_PASSWORD / WEAK_PASSWORD show under the form,
//  translated).
//
//  Split into (root component last):
//
//    PASSWORD_MIN       — the backend's minimum length
//    PASSWORD_MAX_BYTES — the backend's byte ceiling
//    EMPTY_PASSWORDS    — the blank password form
//    ProfileCard        — name, email, role pill
//    ChangePasswordCard — the three-field form
//    LogoutAllCard      — the red button, its confirmation
//    Account            — the page (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { clearToken } from '@/auth/token';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import { CONSOLE_LOGIN } from '@/paths';
import PageLayout from '@/components/layout/PageLayout';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';


// PASSWORD_MIN_LENGTH in django users/auth.py
const PASSWORD_MIN = 10;

// PASSWORD_MAX_BYTES in django users/auth.py — bcrypt
// silently truncates past 72 bytes
const PASSWORD_MAX_BYTES = 72;

// The password form, blank
const EMPTY_PASSWORDS = { current: '', next: '', repeat: '' };







// -----------------------------------------------------------
// ProfileCard
// -----------------------------------------------------------
//
// Read-only: the account as /api/auth/me reports it.
//
// Used by:
//   - Account (below)
// -----------------------------------------------------------

function ProfileCard({ authData }) {
  const t = useTranslations('PAGES.account');
  const label = useEnumLabel();
  return (
    <Paper className="p-4 flex flex-col gap-2">
      <Typography variant="h6" component="h2">{t('profile')}</Typography>
      <Typography>{authData.displayName}</Typography>
      <Typography color="text.secondary" className="[overflow-wrap:anywhere]">{authData.email}</Typography>
      <div><StatusChip value={authData.role} label={label('role', authData.role)} /></div>
    </Paper>
  );
}







// -----------------------------------------------------------
// ChangePasswordCard
// -----------------------------------------------------------
//
// Current + new + repeat; field errors appear after the
// first submit, the server's refusal under the form.
//
// Used by:
//   - Account (below)
// -----------------------------------------------------------

function ChangePasswordCard() {

  const t = useTranslations('PAGES.account');
  const describe = useErrorMessage();
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [tried, setTried] = useState(false);
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });


  // validate_new_password of users/auth.py: the length in
  // code points ([...s] — like Python's len; .length would
  // count an emoji twice), the ceiling in UTF-8 bytes
  const errors = {};
  if (!form.current) errors.current = t('required');
  if ([...form.next].length < PASSWORD_MIN) errors.next = t('tooShort', { min: PASSWORD_MIN });
  else if (new TextEncoder().encode(form.next).length > PASSWORD_MAX_BYTES) errors.next = t('tooLong', { max: PASSWORD_MAX_BYTES });
  if (form.repeat !== form.next) errors.repeat = t('mismatch');
  const shown = tried ? errors : {};


  const change = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', { currentPassword: form.current, newPassword: form.next }, { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.passwordChanged')); setForm(EMPTY_PASSWORDS); setTried(false); },
  });


  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(errors).length === 0) change.mutate();
  };


  return (
    <Paper className="p-4">
      <Typography variant="h6" component="h2" className="mb-1">{t('changePassword')}</Typography>
      <Typography variant="body2" color="text.secondary" className="mb-3">{t('changeNote')}</Typography>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <TextField label={t('currentPassword')} type="password" {...field('current')} required autoComplete="current-password"
                   error={Boolean(shown.current)} helperText={shown.current} />
        <TextField label={t('newPassword')} type="password" {...field('next')} required autoComplete="new-password"
                   error={Boolean(shown.next)} helperText={shown.next || t('passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX_BYTES })} />
        <TextField label={t('repeatPassword')} type="password" {...field('repeat')} required autoComplete="new-password"
                   error={Boolean(shown.repeat)} helperText={shown.repeat || ' '} />
        {change.error && <Alert severity="error">{describe(change.error)}</Alert>}
        <div><Button type="submit" variant="contained" loading={change.isPending}>{t('save')}</Button></div>
      </form>
    </Paper>
  );
}







// -----------------------------------------------------------
// LogoutAllCard
// -----------------------------------------------------------
//
// Kills every session including this one after a
// confirmation, then restarts at /login even if the call
// failed (the token is dropped regardless).
//
// Used by:
//   - Account (below)
// -----------------------------------------------------------

function LogoutAllCard() {

  const t = useTranslations('PAGES.account');
  const [confirming, setConfirming] = useState(false);


  const logoutAll = useMutation({
    mutationFn: () => api.post('/api/auth/logout-all', null, { skipAuthRedirect: true, silent: true }),
    onSettled: () => { clearToken(); window.location.replace(CONSOLE_LOGIN); },
  });


  return (
    <Paper className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <Typography>{t('logoutAll')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('logoutAllHint')}</Typography>
      </div>
      <Button color="delete" variant="outlined" className="shrink-0 self-start sm:self-auto" onClick={() => setConfirming(true)}>
        {t('logoutAll')}
      </Button>
      <UniversalModal open={confirming} onClose={() => setConfirming(false)} onConfirm={() => logoutAll.mutate()}
                      busy={logoutAll.isPending} danger title={t('logoutAllConfirm')} confirmLabel={t('logoutAll')}>
        <Typography>{t('logoutAllConfirmText')}</Typography>
      </UniversalModal>
    </Paper>
  );
}







// -----------------------------------------------------------
// Account (default export)
// -----------------------------------------------------------
//
// The three cards in a narrow column.
//
// Used by:
//   - router.jsx — route /account
// -----------------------------------------------------------

export default function Account({ authData }) {
  const t = useTranslations('PAGES.account');
  return (
    <PageLayout authData={authData} title={t('TITLE')}>
      <div className="flex flex-col gap-6 max-w-xl">
        <ProfileCard authData={authData} />
        <ChangePasswordCard />
        <LogoutAllCard />
      </div>
    </PageLayout>
  );
}
