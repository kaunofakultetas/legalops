// -----------------------------------------------------------
//  [*] Users — the admin's account directory
//
//  A table over GET /api/users with three form dialogs
//  (create, edit name/role/active/AI budget, reset password),
//  a deactivate confirmation, and a hold-to-delete button on
//  every row — the account for good, with all its data, once
//  the button has been held for two seconds (LongPressButton,
//  no dialog). Every mutation invalidates the users query; a
//  delete, everything (the account's companies, reports and
//  documents are gone from every page).
//
//  The dialogs are real forms (review #14): Enter submits,
//  the first field takes focus, the fields are validated in
//  the UI language after the first submit, and a server
//  refusal (EMAIL_TAKEN, WEAK_PASSWORD, LAST_ADMIN…) shows
//  inside the dialog instead of a toast. A refusal about a
//  field goes as soon as that field changes (EMAIL_TAKEN
//  with the email, LAST_ADMIN with the role or the active
//  switch, a refused budget with the budget); one about the
//  request (a server error, a lost connection, an account
//  deleted meanwhile) stays until the next submit. The form
//  is cleared only after the close animation (onExited), so
//  the fields never visibly blank out. The signed-in admin
//  cannot edit their own role/active state, deactivate or
//  delete themselves — the backend refuses it, the controls
//  say so first.
//
//  The daily AI budget (dailyBudgetUsd) is tri-modal on the
//  wire: null = the installation default, 0 = unlimited,
//  n = a custom limit in US dollars per UTC day.
//
//  The edit sends only the fields the admin changed (every
//  field sent is written and audited as a change); an edit
//  that changed nothing closes without a request. A users
//  answer that is not a list of rows with ids of their own
//  fails like any bad answer (the DataGrid would throw). A
//  failed refresh keeps the directory on screen with the
//  error above it, as the Audit and MCP pages do; only a
//  failed first load has no table to keep.
//
//  Split into (root component last):
//
//    PASSWORD_MIN        — the backend's password policy
//    EMAIL_RE            — the "x@y" shape check
//    EMPTY_FORM          — the blank dialog state
//    REFUSAL_FIELDS      — the fields a refusal is about
//    WIRE_FIELDS         — the same, by the prose's wire name
//    rowsOf              — the answer's list, checked
//    formFromUser        — a row → the edit form
//    budgetFromForm      — the form → dailyBudgetUsd
//    changesFrom         — the form → the PATCH body
//    validate            — field errors for one dialog kind
//    RoleSelect          — the role dropdown
//    BudgetField         — default / unlimited / custom
//    UsersTable          — the grid with the row actions
//    CreateUserDialog    — name, email, role, password
//    EditUserDialog      — name, role, active, budget
//    ResetPasswordDialog — one password field
//    DeactivateDialog    — the confirmation
//    Users               — the page (default export)
// -----------------------------------------------------------

import { useCallback, useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import InputAdornment from '@mui/material/InputAdornment';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { refusedFields, useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import PageLayout from '@/components/layout/PageLayout';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import StatusChip from '@/components/StatusChip/StatusChip';
import IconAction from '@/components/IconAction/IconAction';
import { LongPressDeleteButton } from '@/components/LongPressButton/LongPressButton';
import ErrorState from '@/components/ErrorState/ErrorState';
import DataTable from '@/components/DataTable/DataTable';


// PASSWORD_MIN_LENGTH in django users/auth.py — the server
// stays the authority, this only saves a round trip
const PASSWORD_MIN = 10;

// Something@something — the backend's own rule ("@" in a
// non-empty address; admin@localhost is valid)
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

// What every dialog starts from; edit fills it from the row
const EMPTY_FORM = {
  email: '', displayName: '', role: 'user', password: '', active: true, budgetMode: 'default', budget: '',
};

// The hold-to-delete button in the size and shape of the
// row's icon buttons (IconButton small), its ring a red fill
// over a grey track
const HOLD_SX = { width: 30, height: 30, minWidth: 0, p: '5px', borderRadius: '6px' };

// Keeps the hold button's mouse events from the grid's cell:
// a held button takes no focus on mousedown, so the grid,
// seeing focus outside the cell on mouseup, moved it to the
// cell's first button (Edit, its tooltip popping up)
const stayInButton = (event) => event.stopPropagation();

// The form fields each refusal of the users routes is about —
// its message goes as soon as one of them changes. The
// continuity guard (LAST_ADMIN, SELF_LOCKOUT) refuses a
// demotion or a deactivation, so either control lifts it
const REFUSAL_FIELDS = {
  EMAIL_TAKEN: ['email'], INVALID_EMAIL: ['email'], WEAK_PASSWORD: ['password'], INVALID_ROLE: ['role'],
  LAST_ADMIN: ['role', 'active'], SELF_LOCKOUT: ['role', 'active'],
};

// The wire names the routes' INVALID_FIELD / MISSING_FIELDS
// prose opens with → the form fields that edit them
const WIRE_FIELDS = {
  email: ['email'], displayName: ['displayName'], role: ['role'], password: ['password'], active: ['active'],
  dailyBudgetUsd: ['budgetMode', 'budget'],
};







// -----------------------------------------------------------
// rowsOf
// -----------------------------------------------------------
//
//   rowsOf(answer, 'users') → answer.users
//
// The list an answer carries under `key`, checked before the
// grid sees it: the DataGrid throws on a row without an id
// (taking the page down) and mixes up rows that share one,
// and every row action targets the id. Such an answer fails
// the query — the error state and its retry — instead of
// crashing the page or passing for an empty directory.
//
// Used by:
//   - Users (below) — the users query
// -----------------------------------------------------------

function rowsOf(answer, key) {
  const rows = answer?.[key];
  const ids = Array.isArray(rows) ? rows.map((row) => row?.id) : [];
  if (!Array.isArray(rows) || ids.some((id) => id == null) || new Set(ids).size !== ids.length) {
    throw new Error(`Unexpected answer: "${key}" is not a list of rows with distinct ids`);
  }
  return rows;
}







// -----------------------------------------------------------
// formFromUser
// -----------------------------------------------------------
//
// A directory row → the edit form (budget mode from the
// null / 0 / n convention).
//
// Used by:
//   - Users (below) — opening a dialog
// -----------------------------------------------------------

function formFromUser(user) {
  const budget = user.dailyBudgetUsd;
  return {
    ...EMPTY_FORM,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    budgetMode: budget == null ? 'default' : budget === 0 ? 'unlimited' : 'custom',
    budget: budget ? String(budget) : '',
  };
}







// -----------------------------------------------------------
// budgetFromForm
// -----------------------------------------------------------
//
// The form's budget mode → the wire's dailyBudgetUsd.
//
// Used by:
//   - changesFrom (below) — the PATCH body
// -----------------------------------------------------------

function budgetFromForm(form) {
  if (form.budgetMode === 'default') return null;
  if (form.budgetMode === 'unlimited') return 0;
  return Number(form.budget.trim().replace(',', '.'));
}







// -----------------------------------------------------------
// changesFrom
// -----------------------------------------------------------
//
// The PATCH body: the fields whose value differs from the
// row as loaded. The backend writes — and audits — every
// field it is sent, so an unchanged role or budget sent back
// would show in the trail as a change and would undo what
// another admin saved meanwhile. The caller's own role and
// active state are never sent (the backend refuses a self-
// lockout; the dialog locks both).
//
// Used by:
//   - Users (below) — the update mutation and the "nothing
//     changed" check
// -----------------------------------------------------------

function changesFrom(user, form, isSelf) {
  const next = {
    displayName: form.displayName.trim(),
    ...(isSelf ? {} : { role: form.role, active: form.active }),
    dailyBudgetUsd: budgetFromForm(form),
  };
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== (user[key] ?? null)));
}







// -----------------------------------------------------------
// validate
// -----------------------------------------------------------
//
// {field: message} for the fields the dialog `kind` shows;
// an empty object means the form may be sent.
//
// Used by:
//   - Users (below) — before every mutation, and to paint
//     the fields after the first submit
// -----------------------------------------------------------

function validate(kind, form, t) {
  const errors = {};
  if ((kind === 'create' || kind === 'edit') && !form.displayName.trim()) errors.displayName = t('VALIDATION.name');
  if (kind === 'create' && !EMAIL_RE.test(form.email.trim())) errors.email = t('VALIDATION.email');
  if ((kind === 'create' || kind === 'reset') && form.password.length < PASSWORD_MIN) {
    errors.password = t('VALIDATION.password', { min: PASSWORD_MIN });
  }
  if (kind === 'edit' && form.budgetMode === 'custom'
      && (!/^\d{1,6}([.,]\d{1,2})?$/.test(form.budget.trim()) || Number(form.budget.replace(',', '.')) <= 0)) {
    errors.budget = t('VALIDATION.budget');
  }
  return errors;
}







// -----------------------------------------------------------
// RoleSelect
// -----------------------------------------------------------
//
// The two roles as a TextField select.
//
// Used by:
//   - CreateUserDialog, EditUserDialog (below)
// -----------------------------------------------------------

function RoleSelect({ value, onChange, disabled = false, helperText }) {
  const t = useTranslations('PAGES.users');
  return (
    <TextField select label={t('FORM.role')} value={value} onChange={onChange} disabled={disabled} helperText={helperText}>
      <MenuItem value="user">{t('ROLES.user')}</MenuItem>
      <MenuItem value="admin">{t('ROLES.admin')}</MenuItem>
    </TextField>
  );
}







// -----------------------------------------------------------
// BudgetField
// -----------------------------------------------------------
//
// Three radios and, for "custom", the amount in US dollars.
// The label names the radio group (aria-labelledby) — a
// FormLabel alone labels nothing for a screen reader.
//
// Used by:
//   - EditUserDialog (below)
// -----------------------------------------------------------

function BudgetField({ form, setForm, error }) {
  const t = useTranslations('PAGES.users');
  const labelId = useId();
  return (
    <FormControl>
      <FormLabel id={labelId}>{t('BUDGET.label')}</FormLabel>
      <RadioGroup row aria-labelledby={labelId} value={form.budgetMode} onChange={(e) => setForm({ ...form, budgetMode: e.target.value })}>
        <FormControlLabel value="default" control={<Radio />} label={t('BUDGET.default')} />
        <FormControlLabel value="unlimited" control={<Radio />} label={t('BUDGET.unlimited')} />
        <FormControlLabel value="custom" control={<Radio />} label={t('BUDGET.custom')} />
      </RadioGroup>
      {form.budgetMode === 'custom' && (
        <TextField
          label={t('BUDGET.amount')} value={form.budget} inputMode="decimal" className="mt-2"
          onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^\d.,]/g, '') })}
          error={Boolean(error)} helperText={error || t('BUDGET.hint')}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
        />
      )}
      {form.budgetMode !== 'custom' && <Typography variant="caption" color="text.secondary">{t('BUDGET.hint')}</Typography>}
    </FormControl>
  );
}







// -----------------------------------------------------------
// UsersTable
// -----------------------------------------------------------
//
// The grid; `onAction(kind, row)` opens the matching dialog,
// and the hold-to-delete button calls `onDelete(row)` once
// held. The deactivate button is disabled for inactive rows
// and for the caller's own row, the delete button for the
// caller's own row and while a delete is under way — the
// row being deleted shows a spinner in its place. Its page and sort live in the
// address (?page=2&sort=email.asc).
//
// Used by:
//   - Users (below)
// -----------------------------------------------------------

function UsersTable({ users, loading, selfId, onAction, onDelete, deletingId }) {

  const t = useTranslations('PAGES.users');
  const label = useEnumLabel();
  const fmt = useFormat();


  const columns = useMemo(() => [
    { field: 'displayName', headerName: t('COLUMNS.name'), flex: 1, minWidth: 160 },
    { field: 'email', headerName: t('COLUMNS.email'), flex: 1, minWidth: 200 },
    { field: 'role', headerName: t('COLUMNS.role'), width: 150,
      renderCell: ({ value }) => <StatusChip value={value} label={label('role', value)} /> },
    { field: 'active', headerName: t('COLUMNS.status'), width: 120,
      renderCell: ({ value }) => <StatusChip value={value ? 'active' : 'inactive'} label={t(`STATUS.${value ? 'active' : 'inactive'}`)} /> },
    { field: 'dailyBudgetUsd', headerName: t('COLUMNS.budget'), width: 170,
      valueFormatter: (value) => (value == null ? t('BUDGET.default') : Number(value) === 0 ? t('BUDGET.unlimited') : fmt.usd(value)) },
    { field: 'lastLoginAt', headerName: t('COLUMNS.lastLogin'), width: 170, valueFormatter: (value) => fmt.dateTime(value) },
    { field: 'actions', headerName: t('COLUMNS.actions'), width: 170, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <div className="flex">
          <IconAction label={t('ACTIONS.edit')} icon={<EditOutlinedIcon fontSize="small" />} onClick={() => onAction('edit', row)} />
          {/* A reset ends every session of the account — on the
              admin's own row it would sign them out; their own
              password is changed on the Account page */}
          <IconAction label={row.id === selfId ? t('ACTIONS.resetOwnPassword') : t('ACTIONS.resetPassword')}
                      icon={<KeyOutlinedIcon fontSize="small" />} disabled={row.id === selfId} onClick={() => onAction('reset', row)} />
          <IconAction label={t('ACTIONS.deactivate')} icon={<PersonOffOutlinedIcon fontSize="small" />}
                      disabled={!row.active || row.id === selfId} onClick={() => onAction('deactivate', row)} />
          <LongPressDeleteButton variant="text" sx={HOLD_SX} aria-label={t('ACTIONS.delete')} tooltip={t('ACTIONS.deleteHold')}
                                 onMouseDown={stayInButton} onMouseUp={stayInButton} onClick={stayInButton}
                                 disabled={row.id === selfId || deletingId != null} onComplete={() => onDelete(row)}
                                 uncompletedToastMessage={t('TOASTS.holdToDelete')}
                                 progressSize={18} progressThickness={5} progressColor="delete.main" progressBgColor="divider">
            {row.id === deletingId ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverOutlinedIcon fontSize="small" />}
          </LongPressDeleteButton>
        </div>
      ) },
  ], [t, label, fmt, selfId, onAction, onDelete, deletingId]);


  return <DataTable rows={users} columns={columns} loading={loading} label={t('TITLE')} persist mobileHidden={['email', 'dailyBudgetUsd', 'lastLoginAt']} />;
}







// -----------------------------------------------------------
// CreateUserDialog
// -----------------------------------------------------------
//
// POST /api/users; the password is set by the admin and
// handed over out of band.
//
// Used by:
//   - Users (below)
// -----------------------------------------------------------

function CreateUserDialog({ open, form, setForm, errors, busy, error, onClose, onSubmit, onExited }) {
  const t = useTranslations('PAGES.users');
  const field = (key) => ({
    value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: Boolean(errors[key]), helperText: errors[key],
  });
  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={onSubmit} onExited={onExited} title={t('MODALS.create')}
                    busy={busy} error={error} confirmLabel={t('new')}>
      <div className="flex flex-col gap-4 pt-2">
        <TextField label={t('FORM.name')} {...field('displayName')} required autoFocus />
        <TextField label={t('FORM.email')} type="email" {...field('email')} required autoComplete="off" />
        <RoleSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        <TextField label={t('FORM.password')} type="password" {...field('password')} required autoComplete="new-password"
                   helperText={errors.password || t('FORM.passwordHint', { min: PASSWORD_MIN })} />
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// EditUserDialog
// -----------------------------------------------------------
//
// PATCH /api/users/{id}; role and active are locked on the
// caller's own row (the backend would refuse anyway).
//
// Used by:
//   - Users (below)
// -----------------------------------------------------------

function EditUserDialog({ open, form, setForm, errors, busy, error, isSelf, onClose, onSubmit, onExited }) {
  const t = useTranslations('PAGES.users');
  const tCommon = useTranslations('COMPONENTS.common');
  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={onSubmit} onExited={onExited} title={t('MODALS.edit')}
                    busy={busy} error={error} confirmLabel={tCommon('save')}>
      <div className="flex flex-col gap-4 pt-2">
        <TextField label={t('FORM.name')} value={form.displayName} required autoFocus
                   onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                   error={Boolean(errors.displayName)} helperText={errors.displayName} />
        <RoleSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={isSelf}
                    helperText={isSelf ? t('FORM.selfLocked') : null} />
        <FormControlLabel control={<Switch checked={form.active} disabled={isSelf} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
                          label={t('FORM.active')} />
        <BudgetField form={form} setForm={setForm} error={errors.budget} />
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// ResetPasswordDialog
// -----------------------------------------------------------
//
// POST /api/users/{id}/reset-password — kills that account's
// sessions server-side.
//
// Used by:
//   - Users (below)
// -----------------------------------------------------------

function ResetPasswordDialog({ open, form, setForm, errors, busy, error, onClose, onSubmit, onExited }) {
  const t = useTranslations('PAGES.users');
  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={onSubmit} onExited={onExited} title={t('MODALS.resetPassword')}
                    busy={busy} error={error}>
      <div className="flex flex-col gap-3 pt-2">
        <Typography variant="body2" color="text.secondary">{t('MODALS.resetHint')}</Typography>
        <TextField fullWidth label={t('FORM.password')} type="password" value={form.password} autoFocus required
                   onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password"
                   error={Boolean(errors.password)} helperText={errors.password || t('FORM.passwordHint', { min: PASSWORD_MIN })} />
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// DeactivateDialog
// -----------------------------------------------------------
//
// DELETE /api/users/{id} — deactivation, never deletion, and
// the text says so.
//
// Used by:
//   - Users (below)
// -----------------------------------------------------------

function DeactivateDialog({ open, user, busy, error, onClose, onConfirm, onExited }) {
  const t = useTranslations('PAGES.users');
  return (
    <UniversalModal open={open} onClose={onClose} onConfirm={onConfirm} onExited={onExited} danger busy={busy} error={error}
                    title={t('MODALS.deactivate', { name: user?.displayName })} confirmLabel={t('ACTIONS.deactivate')}>
      <Typography>{t('MODALS.deactivateHint')}</Typography>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// Users (default export)
// -----------------------------------------------------------
//
// Owns the users query, the one open dialog (kept through
// the close animation — `open` flips first, the state is
// reset on exit), the form, the four dialog mutations — each
// success toasts, refetches and closes — and the delete,
// which a held row button starts and no dialog confirms. The dialogs edit the
// form through editForm, which drops a refusal about a field
// the edit changes.
//
// Used by:
//   - router.jsx — route /users (adminOnly)
// -----------------------------------------------------------

export default function Users({ authData }) {

  const t = useTranslations('PAGES.users');
  const fmt = useFormat();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  // { kind: 'create'|'edit'|'reset'|'deactivate', user? }
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tried, setTried] = useState(false);


  const { data: users, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: async () => rowsOf((await api.get('/api/users')).data, 'users'),
  });


  const create = useMutation({
    mutationFn: () => api.post('/api/users', {
      email: form.email.trim(), displayName: form.displayName.trim(), role: form.role, password: form.password,
    }, { silent: true }),
    onSuccess: () => done(t('TOASTS.created')),
  });
  const update = useMutation({
    mutationFn: () => api.patch(`/api/users/${modal.user.id}`, changesFrom(modal.user, form, modal.user.id === authData.id), { silent: true }),
    onSuccess: () => done(t('TOASTS.updated')),
  });
  const reset = useMutation({
    mutationFn: () => api.post(`/api/users/${modal.user.id}/reset-password`, { password: form.password }, { silent: true }),
    onSuccess: () => done(t('TOASTS.passwordReset')),
  });
  const deactivate = useMutation({
    mutationFn: () => api.delete(`/api/users/${modal.user.id}`, { silent: true }),
    onSuccess: () => done(t('TOASTS.deactivated')),
  });
  // The held delete button's request — the account with all
  // its data. Its companies, reports and documents went with
  // it, so every query is refreshed, not the users list alone;
  // the toast says what went, and a refusal is the api
  // client's own toast
  const purge = useMutation({
    mutationFn: (account) => api.delete(`/api/users/${account.id}`, { params: { purge: true } }),
    onSuccess: ({ data }, account) => {
      const removed = data?.removed ?? {};
      const count = (key) => (Number.isFinite(removed[key]) ? fmt.number(removed[key]) : '—');
      toast.success(t('TOASTS.deleted', {
        name: account.displayName, companies: count('companies'), reports: count('reports'),
        documents: count('documents'), threads: count('threads'),
      }));
      queryClient.invalidateQueries();
    },
  });
  const mutations = { create, edit: update, reset, deactivate };
  const current = modal ? mutations[modal.kind] : null;
  const busy = Boolean(current?.isPending);
  const serverError = current?.error ? describe(current.error, { fields: { displayName: t('FORM.name'), dailyBudgetUsd: t('BUDGET.label') } }) : null;
  const errors = tried && modal ? validate(modal.kind, form, t) : {};


  // Stable (the mutations' reset functions are), so the
  // table's memoised columns survive re-renders
  const clearErrors = [create.reset, update.reset, reset.reset, deactivate.reset];
  const [clearCreate, clearUpdate, clearReset, clearDeactivate] = clearErrors;
  const openDialog = useCallback((kind, user = null) => {
    clearCreate(); clearUpdate(); clearReset(); clearDeactivate();
    setForm(user ? formFromUser(user) : EMPTY_FORM);
    setTried(false);
    setModal({ kind, user });
    setOpen(true);
  }, [clearCreate, clearUpdate, clearReset, clearDeactivate]);
  const close = () => setOpen(false);
  const exited = () => { setModal(null); setForm(EMPTY_FORM); setTried(false); };
  const done = (message) => { toast.success(message); queryClient.invalidateQueries({ queryKey: ['users'] }); close(); };


  // A refusal about a field goes as soon as the edit changes
  // that field; one about the request stays until the next
  // submit (which clears it anyway)
  const refused = refusedFields(current?.error, REFUSAL_FIELDS, WIRE_FIELDS);
  const editForm = (next) => {
    if (refused.some((key) => next[key] !== form[key])) current.reset();
    setForm(next);
  };


  // An edit that changed nothing has nothing to send (the
  // backend would refuse the empty PATCH with EMPTY_UPDATE)
  const submit = () => {
    setTried(true);
    if (Object.keys(validate(modal.kind, form, t)).length > 0) return;
    if (modal.kind === 'edit' && Object.keys(changesFrom(modal.user, form, modal.user.id === authData.id)).length === 0) {
      close();
      return;
    }
    current.mutate();
  };


  const dialogProps = { form, setForm: editForm, errors, busy, error: serverError, onClose: close, onSubmit: submit, onExited: exited };
  const isSelf = modal?.user?.id === authData.id;


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}
                actions={<Button variant="contained" onClick={() => openDialog('create')}>{t('new')}</Button>}>
      {/* A failed refresh keeps the rows it had on screen, the
          error above them; a failed first load has none */}
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} className={users ? 'mb-3' : ''} />}
      {(!error || users) && (
        <UsersTable users={users ?? []} loading={isLoading} selfId={authData.id} onAction={openDialog}
                    onDelete={purge.mutate} deletingId={purge.isPending ? purge.variables?.id : null} />
      )}

      <CreateUserDialog open={open && modal?.kind === 'create'} {...dialogProps} />
      <EditUserDialog open={open && modal?.kind === 'edit'} {...dialogProps} isSelf={isSelf} />
      <ResetPasswordDialog open={open && modal?.kind === 'reset'} {...dialogProps} />
      <DeactivateDialog open={open && modal?.kind === 'deactivate'} user={modal?.user} busy={busy} error={serverError}
                        onClose={close} onConfirm={() => deactivate.mutate()} onExited={exited} />
    </PageLayout>
  );
}
