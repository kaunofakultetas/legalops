// -----------------------------------------------------------
//  [*] CompanyRoles — role profiles a chat can adopt
//
//  A role (the compliance officer, the AML officer…) is a
//  short ROLE_CONTEXT text — duties, reporting line,
//  independence, conflicts — distilled from the company's
//  own documents; a chat thread that adopts the role gets it
//  in its instructions.
//
//    GET/POST          /api/companies/{id}/roles
//    PATCH/DELETE      /api/companies/{id}/roles/{rid}
//
//  Names are unique per company (409 DUPLICATE_NAME shows on
//  the name field until the name changes; a refusal naming
//  the context or the sources goes when that one changes);
//  the context is capped at 6000 chars and the sources
//  ([{documentId, title, section}]) at 50.
//
//  Split into (root component last):
//
//    MAX_CONTEXT    — the backend's context cap
//    MAX_SOURCES    — the backend's sources cap
//    EMPTY_ROLE     — the blank form
//    REFUSAL_FIELDS — the fields a refusal is about
//    WIRE_FIELDS    — the same, by the prose's wire name
//    SourcesEditor  — document + section rows
//    RoleDialog     — the add / edit form
//    RoleCard       — one role in the list
//    CompanyRoles   — the tab (default export)
// -----------------------------------------------------------

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { errorInfo, refusedFields, useErrorMessage } from '@/utils/errors';
import SectionCard from '@/components/SectionCard/SectionCard';
import EmptyState from '@/components/EmptyState/EmptyState';
import IconAction from '@/components/IconAction/IconAction';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import usableRows from '@/pages/Companies/usableRows';


// MAX_CONTEXT_CHARS in django companies/api/role_views.py
const MAX_CONTEXT = 6000;

// MAX_SOURCES in the same file
const MAX_SOURCES = 50;

// The blank form
const EMPTY_ROLE = { name: '', context: '', sources: [] };

// The form fields a refusal is about — its message goes as
// soon as one of them changes
const REFUSAL_FIELDS = { DUPLICATE_NAME: ['name'] };

// The wire names _apply_role's INVALID_FIELD prose (and the
// MISSING_FIELDS "name is required") opens with → the fields
const WIRE_FIELDS = { name: ['name'], context: ['context'], sources: ['sources'] };







// -----------------------------------------------------------
// SourcesEditor
// -----------------------------------------------------------
//
// One row per source: a company document (its title is
// copied along) and the section text; add / remove.
//
// Used by:
//   - RoleDialog (below)
// -----------------------------------------------------------

function SourcesEditor({ sources, documents, onChange }) {

  const t = useTranslations('PAGES.company.ROLES');
  const titles = Object.fromEntries(documents.map((d) => [d.id, d.title]));
  const patch = (index, change) => onChange(sources.map((s, i) => (i === index ? { ...s, ...change } : s)));


  return (
    <div className="flex flex-col gap-2">
      <Typography variant="body2" color="text.secondary">{t('HINTS.sources')}</Typography>
      {sources.map((source, index) => (
        <div key={index} className="flex gap-2 items-start flex-col sm:flex-row">
          <TextField select size="small" label={t('FIELDS.document')} value={titles[source.documentId] ? source.documentId : ''} className="sm:w-64 w-full"
                     helperText={!titles[source.documentId] && source.title ? t('HINTS.sourceNotHeld', { title: source.title }) : undefined}
                     onChange={(e) => patch(index, { documentId: e.target.value, title: titles[e.target.value] || source.title })}>
            <MenuItem value="">—</MenuItem>
            {documents.map((doc) => <MenuItem key={doc.id} value={doc.id}>{doc.title}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('FIELDS.section')} value={source.section || ''} className="flex-1 w-full"
                     onChange={(e) => patch(index, { section: e.target.value.slice(0, 300) })} />
          <IconAction label={t('FIELDS.removeSource')} icon={<RemoveCircleOutlineIcon fontSize="small" />}
                      onClick={() => onChange(sources.filter((_, i) => i !== index))} />
        </div>
      ))}
      <div>
        <Button size="small" startIcon={<AddIcon />} disabled={sources.length >= MAX_SOURCES}
                onClick={() => onChange([...sources, { documentId: '', title: '', section: '' }])}>
          {t('FIELDS.addSource')}
        </Button>
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// RoleDialog
// -----------------------------------------------------------
//
// Name, context (with a counter) and the sources.
//
// Used by:
//   - CompanyRoles (below)
// -----------------------------------------------------------

function RoleDialog({ open, editing, form, setForm, errors, documents, busy, error, onClose, onSubmit, onExited }) {
  const t = useTranslations('PAGES.company.ROLES');
  const tCommon = useTranslations('COMPONENTS.common');
  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={onSubmit} onExited={onExited} busy={busy} error={error} maxWidth="md"
                    title={editing ? t('editTitle') : t('addTitle')} confirmLabel={tCommon('save')}>
      <div className="flex flex-col gap-4 pt-2">
        <TextField label={t('FIELDS.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus
                   error={Boolean(errors.name)} helperText={errors.name || t('HINTS.name')} />
        <TextField label={t('FIELDS.context')} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })}
                   multiline minRows={6} maxRows={18} error={Boolean(errors.context)}
                   helperText={errors.context || `${t('HINTS.context')} ${tCommon('characters', { count: form.context.length, max: MAX_CONTEXT })}`} />
        <SourcesEditor sources={form.sources} documents={documents} onChange={(sources) => setForm({ ...form, sources })} />
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// RoleCard
// -----------------------------------------------------------
//
// The role's name, the first lines of its context, the
// source count and the edit / delete actions.
//
// Used by:
//   - CompanyRoles (below)
// -----------------------------------------------------------

function RoleCard({ role, onEdit, onDelete }) {
  const t = useTranslations('PAGES.company.ROLES');
  const tCommon = useTranslations('COMPONENTS.common');
  const fmt = useFormat();
  return (
    <Paper variant="outlined" className="p-3 flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <Typography variant="subtitle1" component="h3" className="font-semibold">{role.name}</Typography>
        <div className="flex shrink-0">
          <IconAction label={t('edit')} icon={<EditOutlinedIcon fontSize="small" />} onClick={() => onEdit(role)} />
          <IconAction label={t('delete')} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => onDelete(role)} />
        </div>
      </div>
      <Typography variant="body2" className="whitespace-pre-wrap line-clamp-4">{role.context || '—'}</Typography>
      <Typography variant="caption" color="text.secondary">
        {t('sourcesCount', { count: role.sources?.length || 0 })} · {tCommon('updatedAt')} {fmt.dateTime(role.updatedAt)}
      </Typography>
    </Paper>
  );
}







// -----------------------------------------------------------
// CompanyRoles (default export)
// -----------------------------------------------------------
//
// Owns the dialogs and the create / update / delete
// mutations; every success refreshes the company.
//
// Used by:
//   - CompanyDetail.jsx — the roles tab
// -----------------------------------------------------------

export default function CompanyRoles({ company }) {

  const t = useTranslations('PAGES.company.ROLES');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  // {kind: 'add'|'edit'|'delete', role?}
  const [dialog, setDialog] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ROLE);
  const [tried, setTried] = useState(false);
  const base = `/api/companies/${company.id}/roles`;
  // Only roles (and source documents) that can be keyed
  const roles = useMemo(() => usableRows(company.roles), [company.roles]);
  const documents = useMemo(() => usableRows(company.documents), [company.documents]);


  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(), context: form.context,
        sources: form.sources.filter((s) => s.documentId || s.title || s.section).map((s) => ({
          ...(s.documentId ? { documentId: s.documentId } : {}), ...(s.title ? { title: s.title } : {}), ...(s.section ? { section: s.section } : {}),
        })),
      };
      return dialog.kind === 'edit' ? api.patch(`${base}/${dialog.role.id}`, body, { silent: true }) : api.post(base, body, { silent: true });
    },
    onSuccess: () => {
      toast.success(dialog.kind === 'edit' ? t('TOASTS.updated') : t('TOASTS.added'));
      queryClient.invalidateQueries({ queryKey: ['company', company.id] });
      setOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`${base}/${dialog.role.id}`, { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.deleted')); queryClient.invalidateQueries({ queryKey: ['company', company.id] }); setOpen(false); },
  });


  const errors = {};
  if (!form.name.trim()) errors.name = t('nameRequired');
  if (form.context.length > MAX_CONTEXT) errors.context = t('contextTooLong', { max: MAX_CONTEXT });
  const shown = tried ? { ...errors } : {};
  if (save.error && errorInfo(save.error).code === 'DUPLICATE_NAME') shown.name = describe(save.error);


  // A refusal about a field (DUPLICATE_NAME on the name) goes
  // as soon as the edit changes that field; the others wait
  // for the next save
  const refused = refusedFields(save.error, REFUSAL_FIELDS, WIRE_FIELDS);
  const editForm = (next) => {
    if (refused.some((key) => next[key] !== form[key])) save.reset();
    setForm(next);
  };


  const show = (next, role = null) => {
    save.reset(); remove.reset();
    setForm(role ? { name: role.name, context: role.context || '', sources: role.sources || [] } : EMPTY_ROLE);
    setTried(false);
    setDialog(next);
    setOpen(true);
  };
  const submit = () => { setTried(true); if (Object.keys(errors).length === 0) save.mutate(); };
  const exited = () => { setDialog(null); setForm(EMPTY_ROLE); setTried(false); };
  // An INVALID_FIELD refusal names the field by its label
  const fieldLabels = { name: t('FIELDS.name'), context: t('FIELDS.context'), sources: t('FIELDS.sources') };
  const saveError = save.error && errorInfo(save.error).code !== 'DUPLICATE_NAME' ? describe(save.error, { fields: fieldLabels }) : null;
  const addButton = <Button variant="outlined" onClick={() => show({ kind: 'add' })}>{t('add')}</Button>;


  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')} actions={roles.length > 0 ? addButton : null}>
      {roles.length === 0
        ? <EmptyState icon={BadgeOutlinedIcon} title={t('empty')} text={t('emptyText')} action={addButton} />
        : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {roles.map((role) => (
              <RoleCard key={role.id} role={role} onEdit={(r) => show({ kind: 'edit', role: r }, r)} onDelete={(r) => show({ kind: 'delete', role: r })} />
            ))}
          </div>
        )}
      <RoleDialog open={open && dialog?.kind !== 'delete'} editing={dialog?.kind === 'edit'} form={form} setForm={editForm} errors={shown}
                  documents={documents} busy={save.isPending} error={saveError}
                  onClose={() => setOpen(false)} onSubmit={submit} onExited={exited} />
      <UniversalModal open={open && dialog?.kind === 'delete'} onClose={() => setOpen(false)} onConfirm={() => remove.mutate()} onExited={exited}
                      danger busy={remove.isPending} error={remove.error ? describe(remove.error) : null}
                      title={t('deleteTitle', { name: dialog?.role?.name })} confirmLabel={t('delete')}>
        <Typography>{t('deleteText')}</Typography>
      </UniversalModal>
    </SectionCard>
  );
}
