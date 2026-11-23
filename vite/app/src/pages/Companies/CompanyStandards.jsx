// -----------------------------------------------------------
//  [*] CompanyStandards — the standards the company adopted
//
//  ISO/IEC 27001, ISO 9001 and the like, as the company stands
//  with each: certified, implementing it, or planning to.
//  Every analysis of the company assesses it against the
//  requirements of these standards, next to the acts that
//  apply. A standard is picked from the corpus (an admin
//  uploads the licensed copy there); a certificate is one of
//  the company's credentials, linked here.
//
//    GET    /api/corpus/documents?docType=standard
//    POST   /api/companies/{id}/standards
//    PATCH  /api/companies/{id}/standards/{sid}
//    DELETE /api/companies/{id}/standards/{sid}
//
//  Split into (root component last):
//
//    EMPTY_STANDARD   — the blank form
//    toForm           — a row → the form
//    toBody           — the form → the wire body
//    StandardDialog   — add / edit form
//    StandardsTable   — the grid with the row actions
//    CompanyStandards — the tab (default export)
// -----------------------------------------------------------

import { useCallback, useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import SectionCard from '@/components/SectionCard/SectionCard';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import usableRows from '@/pages/Companies/usableRows';
import { STANDARD_STATUSES } from '@/constants/enums';


// The blank add form
const EMPTY_STANDARD = { documentId: '', status: 'implementing', scope: '', certificateId: '', notes: '' };







// -----------------------------------------------------------
// toForm
// -----------------------------------------------------------
//
// An adoption row → the dialog's strings (null → "").
//
// Used by:
//   - CompanyStandards (below) — opening the edit dialog
// -----------------------------------------------------------

function toForm(row) {
  return Object.fromEntries(Object.keys(EMPTY_STANDARD).map((key) => [key, row?.[key] ?? EMPTY_STANDARD[key]]));
}







// -----------------------------------------------------------
// toBody
// -----------------------------------------------------------
//
// The dialog's strings → the wire body: the scope and notes
// trimmed, no certificate as null. The standard itself is
// named only when adding — an adoption never moves to another
// standard.
//
// Used by:
//   - CompanyStandards (below) — the add body, and the edit
//     body cut down to the fields that changed
// -----------------------------------------------------------

function toBody(form, adding) {
  const body = { status: form.status, scope: form.scope.trim(), certificateId: form.certificateId || null, notes: form.notes.trim() };
  return adding ? { documentId: form.documentId, ...body } : body;
}







// -----------------------------------------------------------
// StandardDialog
// -----------------------------------------------------------
//
// The add / edit form: the standard (any of the corpus's
// standards the company has not adopted yet; fixed once
// adopted), how far the company is with it (each choice says
// what it means for a report), the scope it covers, the
// certificate among the company's credentials, and notes.
//
// Used by:
//   - CompanyStandards (below)
// -----------------------------------------------------------

function StandardDialog({ open, editing, form, setForm, errors, standards, certificates, busy, error, onClose, onSubmit, onExited }) {

  const t = useTranslations('PAGES.company.STANDARDS');
  const tCommon = useTranslations('COMPONENTS.common');
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
        <TextField select {...field('documentId')} required disabled={editing} autoFocus={!editing}
                   helperText={errors.documentId || t('HINTS.documentId')} className="sm:col-span-2">
          {standards.map((doc) => (
            <MenuItem key={doc.id} value={doc.id} disabled={doc.adopted && doc.id !== form.documentId}>
              {doc.shortTitle || doc.title}{doc.shortTitle ? ` — ${doc.title}` : ''}
            </MenuItem>
          ))}
        </TextField>
        <FormControl className="sm:col-span-2">
          <FormLabel id={statusLabelId}>{t('FIELDS.status')}</FormLabel>
          <RadioGroup value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-labelledby={statusLabelId}>
            {STANDARD_STATUSES.map((status) => (
              <FormControlLabel key={status} value={status} control={<Radio />} label={t(`HINTS.${status}`)} />
            ))}
          </RadioGroup>
        </FormControl>
        <TextField {...field('scope')} multiline minRows={2} helperText={t('HINTS.scope')} className="sm:col-span-2" />
        <TextField select {...field('certificateId')} helperText={t('HINTS.certificate')} className="sm:col-span-2">
          <MenuItem value="">{t('FIELDS.noCertificate')}</MenuItem>
          {certificates.map((cred) => <MenuItem key={cred.id} value={cred.id}>{cred.name}</MenuItem>)}
        </TextField>
        <TextField {...field('notes')} multiline minRows={2} className="sm:col-span-2" />
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// StandardsTable
// -----------------------------------------------------------
//
// The standard (designation and title — and a warning while
// the corpus has no usable copy of it, as an analysis then
// skips it), the status pill, the scope, the certificate and
// the row actions; its page and sort stay in the address
// (?standards.sort=…).
//
// Used by:
//   - CompanyStandards (below)
// -----------------------------------------------------------

function StandardsTable({ rows, credentials, onEdit, onRemove }) {

  const t = useTranslations('PAGES.company.STANDARDS');
  const label = useEnumLabel();
  const names = useMemo(() => Object.fromEntries(credentials.map((c) => [c.id, c.name])), [credentials]);


  const columns = useMemo(() => [
    { field: 'shortTitle', headerName: t('COLUMNS.standard'), flex: 1.4, minWidth: 200,
      valueGetter: (value, row) => value || row.title,
      renderCell: ({ row, value }) => (
        <div className="flex flex-col items-start py-1 leading-snug">
          <span className="font-medium">{value}</span>
          {row.shortTitle && row.title && <span className="text-xs text-muted">{row.title}</span>}
          {row.ready === false && <StatusChip value="cancelled" label={t('notReady')} className="mt-1" />}
        </div>
      ) },
    { field: 'status', headerName: t('COLUMNS.status'), width: 150,
      renderCell: ({ row }) => <StatusChip kind="standard" value={row.status} label={label('standardStatus', row.status)} /> },
    { field: 'scope', headerName: t('COLUMNS.scope'), flex: 1.2, minWidth: 160, valueFormatter: (value) => value || '—' },
    { field: 'certificateId', headerName: t('COLUMNS.certificate'), flex: 1, minWidth: 140,
      valueFormatter: (value) => (value ? names[value] || '—' : '—') },
    { field: 'actions', headerName: t('COLUMNS.actions'), width: 100, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <div className="flex">
          <IconAction label={t('edit')} icon={<EditOutlinedIcon fontSize="small" />} onClick={() => onEdit(row)} />
          <IconAction label={t('remove')} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => onRemove(row)} />
        </div>
      ) },
  ], [t, label, names, onEdit, onRemove]);


  return (
    <DataTable rows={rows} columns={columns} label={t('title')} autoRowHeight persist="standards"
               mobileHidden={['scope', 'certificateId']} hideFooter={rows.length <= 25} />
  );
}







// -----------------------------------------------------------
// CompanyStandards (default export)
// -----------------------------------------------------------
//
// Owns the corpus's list of standards, the dialogs (add/edit
// form, remove confirmation) and the two mutations; every
// success refreshes the company. While the corpus holds no
// standard at all, the empty state says an admin must upload
// one first, and nothing can be added; a list that could not
// be read says so with a retry, and one with nothing left to
// add says that under the table.
//
// Used by:
//   - CompanyDetail.jsx — the standards tab
// -----------------------------------------------------------

export default function CompanyStandards({ company }) {

  const t = useTranslations('PAGES.company.STANDARDS');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  // {kind: 'add'|'edit'|'remove', row?}
  const [dialog, setDialog] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_STANDARD);
  const [tried, setTried] = useState(false);
  const base = `/api/companies/${company.id}/standards`;
  const adopted = useMemo(() => usableRows(company.standards), [company.standards]);
  const credentials = useMemo(() => usableRows(company.credentials), [company.credentials]);
  // A certificate is what proves a standard; an entry of
  // another kind already linked stays offered
  const certificates = useMemo(() => credentials.filter((c) => c.kind === 'certificate' || c.id === form.certificateId),
    [credentials, form.certificateId]);


  const corpus = useQuery({
    queryKey: ['corpus', 'standards'],
    queryFn: async () => usableRows((await api.get('/api/corpus/documents', { params: { docType: 'standard' } })).data?.documents),
  });
  const taken = useMemo(() => new Set(adopted.map((row) => row.documentId)), [adopted]);
  const standards = useMemo(() => (corpus.data || []).map((doc) => ({ ...doc, adopted: taken.has(doc.id) })), [corpus.data, taken]);
  const free = standards.filter((doc) => !doc.adopted);


  const errors = {};
  if (!form.documentId) errors.documentId = t('standardRequired');
  const shown = tried ? errors : {};


  const refresh = () => queryClient.invalidateQueries({ queryKey: ['company', company.id] });
  // An edit sends only what the user changed
  const changes = () => {
    const before = toBody(toForm(dialog.row), false);
    return Object.fromEntries(Object.entries(toBody(form, false)).filter(([key, value]) => before[key] !== value));
  };


  const save = useMutation({
    mutationFn: () => (dialog.kind === 'edit'
      ? api.patch(`${base}/${dialog.row.id}`, changes(), { silent: true })
      : api.post(base, toBody(form, true), { silent: true })),
    onSuccess: () => { toast.success(dialog.kind === 'edit' ? t('TOASTS.updated') : t('TOASTS.added')); refresh(); setOpen(false); },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`${base}/${dialog.row.id}`, { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.removed')); refresh(); setOpen(false); },
  });


  const resetSave = save.reset;
  const resetRemove = remove.reset;
  const show = useCallback((next, row = null) => {
    resetSave(); resetRemove();
    setForm(row ? toForm(row) : EMPTY_STANDARD);
    setTried(false);
    setDialog(next);
    setOpen(true);
  }, [resetSave, resetRemove]);
  const onEdit = useCallback((row) => show({ kind: 'edit', row }, row), [show]);
  const onRemove = useCallback((row) => show({ kind: 'remove', row }), [show]);
  const exited = () => { setDialog(null); setForm(EMPTY_STANDARD); setTried(false); };
  const submit = () => { setTried(true); if (dialog?.kind === 'edit' || Object.keys(errors).length === 0) save.mutate(); };


  const addButton = (
    <Button variant="outlined" onClick={() => show({ kind: 'add' })} disabled={free.length === 0}>{t('add')}</Button>
  );
  const name = dialog?.row?.shortTitle || dialog?.row?.title;
  const noneInCorpus = corpus.isSuccess && standards.length === 0;


  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')} actions={adopted.length > 0 ? addButton : null}>
      {corpus.isError && <ErrorState error={corpus.error} onRetry={corpus.refetch} title={t('corpusError')} className="mb-3" />}
      {adopted.length === 0
        ? <EmptyState icon={RuleOutlinedIcon} title={t('empty')} text={noneInCorpus ? t('noneInCorpus') : t('emptyText')}
                      action={noneInCorpus ? null : addButton} />
        : <StandardsTable rows={adopted} credentials={credentials} onEdit={onEdit} onRemove={onRemove} />}
      {adopted.length > 0 && corpus.isSuccess && free.length === 0 && (
        <Typography variant="body2" color="text.secondary" className="mt-2">{t('allAdded')}</Typography>
      )}

      <StandardDialog open={open && ['add', 'edit'].includes(dialog?.kind)} editing={dialog?.kind === 'edit'} form={form} setForm={setForm}
                      errors={shown} standards={standards} certificates={certificates} busy={save.isPending}
                      error={save.error ? describe(save.error) : null}
                      onClose={() => setOpen(false)} onSubmit={submit} onExited={exited} />
      <UniversalModal open={open && dialog?.kind === 'remove'} onClose={() => setOpen(false)} onConfirm={() => remove.mutate()} onExited={exited}
                      busy={remove.isPending} error={remove.error ? describe(remove.error) : null} danger
                      title={t('removeTitle', { name })} confirmLabel={t('remove')}>
        <Typography>{t('removeText')}</Typography>
      </UniversalModal>
    </SectionCard>
  );
}
