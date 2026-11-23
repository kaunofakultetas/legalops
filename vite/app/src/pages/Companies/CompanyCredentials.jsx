// -----------------------------------------------------------
//  [*] CompanyCredentials — licences, permits, certificates
//
//  What the company already holds; the gap analysis checks
//  obligations against these first. Each row is "claimed"
//  (the company says so) or "verified" (a person checked it
//  in the issuer's register or against an evidence document)
//  — the table shows the difference with a pill and an icon,
//  and verifying is its own confirmed act that records who
//  and when (the backend stamps it).
//
//    POST   /api/companies/{id}/credentials
//    PATCH  /api/companies/{id}/credentials/{cid}
//    DELETE /api/companies/{id}/credentials/{cid}
//
//  Split into (root component last):
//
//    EMPTY_CREDENTIAL   — the blank form
//    toForm             — a row → the form
//    toBody             — the form → the wire body
//    CredentialDialog   — add / edit form
//    CredentialsTable   — the grid with the row actions
//    CompanyCredentials — the tab (default export)
// -----------------------------------------------------------

import { useCallback, useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import SectionCard from '@/components/SectionCard/SectionCard';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import usableRows from '@/pages/Companies/usableRows';
import { CREDENTIAL_KINDS } from '@/constants/enums';


// The blank add form
const EMPTY_CREDENTIAL = {
  kind: 'license', name: '', issuer: '', identifier: '', validFrom: '', validTo: '', scope: '', notes: '',
  status: 'claimed', evidenceDocumentId: '',
};







// -----------------------------------------------------------
// toForm
// -----------------------------------------------------------
//
// A credential row → the dialog's strings (null → "").
//
// Used by:
//   - CompanyCredentials (below) — opening the edit dialog
// -----------------------------------------------------------

function toForm(row) {
  return Object.fromEntries(Object.keys(EMPTY_CREDENTIAL).map((key) => [key, row?.[key] ?? EMPTY_CREDENTIAL[key]]));
}







// -----------------------------------------------------------
// toBody
// -----------------------------------------------------------
//
// The dialog's strings → the wire body (trimmed; an empty
// optional field is null).
//
// Used by:
//   - CompanyCredentials (below) — the add body, and the edit
//     body cut down to the fields that changed
// -----------------------------------------------------------

function toBody(form) {
  const text = (value) => String(value ?? '').trim();
  return {
    kind: form.kind, name: text(form.name), issuer: text(form.issuer) || null, identifier: text(form.identifier) || null,
    validFrom: form.validFrom || null, validTo: form.validTo || null, scope: form.scope, notes: form.notes,
    status: form.status, evidenceDocumentId: form.evidenceDocumentId || null,
  };
}







// -----------------------------------------------------------
// CredentialDialog
// -----------------------------------------------------------
//
// The add / edit form: kind, name, issuer, number, validity
// dates, scope, notes, the claimed / verified choice (with
// what each means) and the evidence document.
//
// Used by:
//   - CompanyCredentials (below)
// -----------------------------------------------------------

function CredentialDialog({ open, editing, form, setForm, errors, documents, busy, error, onClose, onSubmit, onExited }) {

  const t = useTranslations('PAGES.company.CREDENTIALS');
  const tCommon = useTranslations('COMPONENTS.common');
  const label = useEnumLabel();
  // Names the radio group — a FormLabel alone labels nothing
  const statusLabelId = useId();
  const field = (key) => ({
    label: t(`FIELDS.${key}`), value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: Boolean(errors[key]), helperText: errors[key] || null, fullWidth: true,
  });


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={onSubmit} onExited={onExited} busy={busy} error={error}
                    maxWidth="md" title={editing ? t('editTitle') : t('addTitle')} confirmLabel={tCommon('save')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <TextField select {...field('kind')}>
          {CREDENTIAL_KINDS.map((kind) => <MenuItem key={kind} value={kind}>{label('credentialKind', kind)}</MenuItem>)}
        </TextField>
        <TextField {...field('name')} required autoFocus />
        <TextField {...field('issuer')} helperText={errors.issuer || t('HINTS.issuer')} />
        <TextField {...field('identifier')} />
        <TextField {...field('validFrom')} type="date" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField {...field('validTo')} type="date" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField {...field('scope')} multiline minRows={2} helperText={t('HINTS.scope')} className="sm:col-span-2" />
        <TextField {...field('notes')} multiline minRows={2} className="sm:col-span-2" />
        <TextField select {...field('evidenceDocumentId')} helperText={t('HINTS.evidence')} className="sm:col-span-2">
          <MenuItem value="">{t('FIELDS.noEvidence')}</MenuItem>
          {documents.map((doc) => <MenuItem key={doc.id} value={doc.id}>{doc.title}</MenuItem>)}
        </TextField>
        <FormControl className="sm:col-span-2">
          <FormLabel id={statusLabelId}>{t('FIELDS.status')}</FormLabel>
          <RadioGroup value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-labelledby={statusLabelId}>
            <FormControlLabel value="claimed" control={<Radio />} label={t('HINTS.claimed')} />
            <FormControlLabel value="verified" control={<Radio />} label={t('HINTS.verified')} />
          </RadioGroup>
        </FormControl>
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// CredentialsTable
// -----------------------------------------------------------
//
// Kind, name, issuer, number, validity (an expired one says
// so), status (icon + pill + verification date), evidence
// document and the row actions; its page and sort stay in
// the address (?credentials.sort=…).
//
// Used by:
//   - CompanyCredentials (below)
// -----------------------------------------------------------

function CredentialsTable({ rows, documents, onEdit, onVerify, onRemove }) {

  const t = useTranslations('PAGES.company.CREDENTIALS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const titles = useMemo(() => Object.fromEntries(documents.map((d) => [d.id, d.title])), [documents]);
  // Today on the LOCAL calendar the dates are written in —
  // toISOString() would give UTC's date, a day behind in
  // Vilnius for the first hours after midnight
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;


  const validity = useCallback((row) => {
    if (row.validFrom && row.validTo) return t('validRange', { from: fmt.date(row.validFrom), to: fmt.date(row.validTo) });
    if (row.validFrom) return t('validFromOnly', { from: fmt.date(row.validFrom) });
    if (row.validTo) return t('validToOnly', { to: fmt.date(row.validTo) });
    return '—';
  }, [t, fmt]);


  const columns = useMemo(() => [
    { field: 'kind', headerName: t('COLUMNS.kind'), width: 120, valueFormatter: (value) => label('credentialKind', value) },
    { field: 'name', headerName: t('COLUMNS.name'), flex: 1.4, minWidth: 180 },
    { field: 'issuer', headerName: t('COLUMNS.issuer'), flex: 1, minWidth: 130, valueFormatter: (value) => value || '—' },
    { field: 'identifier', headerName: t('COLUMNS.identifier'), width: 120, valueFormatter: (value) => value || '—' },
    { field: 'validity', headerName: t('COLUMNS.validity'), flex: 1, minWidth: 150, sortable: false,
      valueGetter: (_, row) => validity(row),
      renderCell: ({ row, value }) => (
        <span>
          {value}
          {row.validTo && row.validTo < today && <StatusChip value="failed" label={t('expired')} className="ml-2" />}
        </span>
      ) },
    { field: 'status', headerName: t('COLUMNS.status'), width: 160,
      renderCell: ({ row }) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusChip kind="credential" value={row.status} label={label('credentialStatus', row.status)}
                      icon={row.status === 'verified' ? <VerifiedOutlinedIcon /> : <HelpOutlineIcon />} />
          {row.status === 'verified' && row.verifiedAt && <span className="text-xs text-muted">{t('verifiedAt', { date: fmt.date(row.verifiedAt) })}</span>}
        </div>
      ) },
    { field: 'evidenceDocumentId', headerName: t('COLUMNS.evidence'), flex: 1, minWidth: 130,
      valueFormatter: (value) => (value ? titles[value] || '—' : '—') },
    { field: 'actions', headerName: t('COLUMNS.actions'), width: 130, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <div className="flex">
          <IconAction label={t('edit')} icon={<EditOutlinedIcon fontSize="small" />} onClick={() => onEdit(row)} />
          {row.status === 'verified'
            ? <IconAction label={t('unverify')} icon={<GppMaybeOutlinedIcon fontSize="small" />} onClick={() => onVerify(row, 'claimed')} />
            : <IconAction label={t('verify')} icon={<GppGoodOutlinedIcon fontSize="small" />} onClick={() => onVerify(row, 'verified')} />}
          <IconAction label={t('remove')} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => onRemove(row)} />
        </div>
      ) },
  ], [t, label, fmt, titles, today, validity, onEdit, onVerify, onRemove]);


  return (
    <DataTable rows={rows} columns={columns} label={t('title')} autoRowHeight persist="credentials"
               mobileHidden={['issuer', 'identifier', 'evidenceDocumentId']} hideFooter={rows.length <= 25} />
  );
}







// -----------------------------------------------------------
// CompanyCredentials (default export)
// -----------------------------------------------------------
//
// Owns the dialogs (add/edit form, verify/unverify and
// remove confirmations) and the three mutations; every
// success refreshes the company.
//
// Used by:
//   - CompanyDetail.jsx — the credentials tab
// -----------------------------------------------------------

export default function CompanyCredentials({ company }) {

  const t = useTranslations('PAGES.company.CREDENTIALS');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  // {kind: 'add'|'edit'|'verify'|'remove', row?, status?}
  const [dialog, setDialog] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_CREDENTIAL);
  const [tried, setTried] = useState(false);
  const base = `/api/companies/${company.id}/credentials`;
  const credentials = company.credentials || [];
  // Only documents the evidence select can key (the grid's
  // rows are DataTable's to filter)
  const documents = useMemo(() => usableRows(company.documents), [company.documents]);
  // An INVALID_FIELD refusal names the field by its label
  const fieldLabels = useMemo(() => Object.fromEntries(Object.keys(EMPTY_CREDENTIAL).map((key) => [key, t(`FIELDS.${key}`)])), [t]);


  const errors = {};
  if (!form.name.trim()) errors.name = t('nameRequired');
  if (form.validFrom && form.validTo && form.validTo < form.validFrom) errors.validTo = t('dateOrder');
  const shown = tried ? errors : {};


  const refresh = () => queryClient.invalidateQueries({ queryKey: ['company', company.id] });
  const body = () => toBody(form);
  // An edit sends only what the user changed: a page opened
  // before someone else verified the credential must not
  // un-verify it by re-sending the status it once showed
  const changes = () => {
    const before = toBody(toForm(dialog.row));
    return Object.fromEntries(Object.entries(body()).filter(([key, value]) => before[key] !== value));
  };


  const save = useMutation({
    mutationFn: () => (dialog.kind === 'edit'
      ? api.patch(`${base}/${dialog.row.id}`, changes(), { silent: true })
      : api.post(base, body(), { silent: true })),
    onSuccess: () => { toast.success(dialog.kind === 'edit' ? t('TOASTS.updated') : t('TOASTS.added')); refresh(); setOpen(false); },
  });
  const verify = useMutation({
    mutationFn: () => api.patch(`${base}/${dialog.row.id}`, { status: dialog.status }, { silent: true }),
    onSuccess: () => { toast.success(dialog.status === 'verified' ? t('TOASTS.verified') : t('TOASTS.unverified')); refresh(); setOpen(false); },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`${base}/${dialog.row.id}`, { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.removed')); refresh(); setOpen(false); },
  });


  const resetSave = save.reset;
  const resetVerify = verify.reset;
  const resetRemove = remove.reset;
  const show = useCallback((next, row = null) => {
    resetSave(); resetVerify(); resetRemove();
    setForm(row ? toForm(row) : EMPTY_CREDENTIAL);
    setTried(false);
    setDialog(next);
    setOpen(true);
  }, [resetSave, resetVerify, resetRemove]);
  const onEdit = useCallback((row) => show({ kind: 'edit', row }, row), [show]);
  const onVerify = useCallback((row, status) => show({ kind: 'verify', row, status }), [show]);
  const onRemove = useCallback((row) => show({ kind: 'remove', row }), [show]);
  const exited = () => { setDialog(null); setForm(EMPTY_CREDENTIAL); setTried(false); };
  const submit = () => { setTried(true); if (Object.keys(errors).length === 0) save.mutate(); };


  const addButton = <Button variant="outlined" onClick={() => show({ kind: 'add' })}>{t('add')}</Button>;
  const name = dialog?.row?.name;


  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')} actions={credentials.length > 0 ? addButton : null}>
      {credentials.length === 0
        ? <EmptyState icon={WorkspacePremiumOutlinedIcon} title={t('empty')} text={t('emptyText')} action={addButton} />
        : <CredentialsTable rows={credentials} documents={documents} onEdit={onEdit} onVerify={onVerify} onRemove={onRemove} />}

      <CredentialDialog open={open && ['add', 'edit'].includes(dialog?.kind)} editing={dialog?.kind === 'edit'} form={form} setForm={setForm}
                        errors={shown} documents={documents} busy={save.isPending} error={save.error ? describe(save.error, { fields: fieldLabels }) : null}
                        onClose={() => setOpen(false)} onSubmit={submit} onExited={exited} />
      <UniversalModal open={open && dialog?.kind === 'verify'} onClose={() => setOpen(false)} onConfirm={() => verify.mutate()} onExited={exited}
                      busy={verify.isPending} error={verify.error ? describe(verify.error) : null}
                      title={dialog?.status === 'verified' ? t('verifyTitle', { name }) : t('unverifyTitle', { name })}
                      confirmLabel={dialog?.status === 'verified' ? t('verify') : t('unverify')}>
        <Typography>{dialog?.status === 'verified' ? t('verifyText') : t('unverifyText')}</Typography>
      </UniversalModal>
      <UniversalModal open={open && dialog?.kind === 'remove'} onClose={() => setOpen(false)} onConfirm={() => remove.mutate()} onExited={exited}
                      busy={remove.isPending} error={remove.error ? describe(remove.error) : null} danger
                      title={t('removeTitle', { name })} confirmLabel={t('remove')}>
        <Typography>{t('removeText')}</Typography>
      </UniversalModal>
    </SectionCard>
  );
}
