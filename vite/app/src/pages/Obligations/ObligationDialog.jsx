// -----------------------------------------------------------
//  [*] ObligationDialog — one obligation, read or edited
//
//  For an admin a form over PATCH /api/obligations/{id}
//  (only the changed fields are sent; a changed title/text is
//  re-embedded server-side); for a user the same fields read
//  only. The citations link to the provisions in the corpus
//  viewer; who extracted it (model) and when it was reviewed
//  are shown under the form.
//
//  Above the form stands what the judge made of the
//  obligation — a second model that compared it with the
//  full text of the provisions it cites: the verdict, what
//  is off, its note in full, when and by which model. The
//  judge decides nothing; and since its verdict is about the
//  title and the text as they stood, the backend drops it
//  when either changes — the PATCH then answers the
//  obligation without it. That answer goes straight into the
//  lists, so the row's chip turns to "not checked" with the
//  save rather than a moment later.
//
//  Split into (root component last):
//
//    TEXT_FIELDS      — the free-text fields, in form order
//    toForm           — obligation → form state
//    withRow          — a list answer with one row replaced
//    CheckResult      — the judge's verdict on the obligation
//    ObligationDialog — the dialog (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { CATEGORIES, INSTITUTION_TYPES, OBLIGATION_STATUSES, SEVERITIES } from '@/constants/enums';


// The editable texts (EDITABLE of django obligation_views.py)
const TEXT_FIELDS = ['title', 'titleEn', 'text', 'textEn', 'addressee', 'conditions', 'evidence', 'deadline', 'notes'];







// -----------------------------------------------------------
// toForm
// -----------------------------------------------------------
//
// The wire obligation → the form (null texts → "").
//
// Used by:
//   - ObligationDialog (below)
// -----------------------------------------------------------

function toForm(obligation) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, obligation?.[key] ?? ''])),
    category: obligation?.category ?? 'other',
    severity: obligation?.severity ?? 'medium',
    status: obligation?.status ?? 'proposed',
    appliesTo: obligation?.appliesTo ?? [],
  };
}







// -----------------------------------------------------------
// withRow
// -----------------------------------------------------------
//
// A cached answer of the obligations list with the saved
// obligation in the place of its old row. Anything else kept
// under the same query key — a bare count — passes untouched.
//
// Used by:
//   - ObligationDialog (below) — after a save
// -----------------------------------------------------------

function withRow(list, updated) {
  if (!list || typeof list !== 'object' || !Array.isArray(list.obligations)) return list;
  return { ...list, obligations: list.obligations.map((row) => (row?.id === updated.id ? updated : row)) };
}







// -----------------------------------------------------------
// CheckResult
// -----------------------------------------------------------
//
// What the judge made of the obligation: the verdict as the
// list's chip shows it, what is off when it named something
// (the duty, the addressee, the condition, the deadline,
// duties merged into one), its note in full — the model's
// own English, marked as such — and when and by which model
// the check was made (the date alone when no model ran: none
// of the cited provisions was in the act's current version).
// A doubt is set off the way the report sets off what is
// still to confirm. An obligation never judged says so. Who
// can edit is told that a new title or text clears the
// result.
//
// Used by:
//   - ObligationDialog (below)
// -----------------------------------------------------------

function CheckResult({ verification, isAdmin }) {

  const t = useTranslations('PAGES.obligations.DIALOG.CHECK');
  const label = useEnumLabel();
  const fmt = useFormat();
  const titleId = useId();
  const verdict = typeof verification?.verdict === 'string' && verification.verdict ? verification.verdict : 'unchecked';
  const doubted = ['unsupported', 'partly'].includes(verdict);
  const issue = verification?.issue;
  const named = typeof issue === 'string' && issue && issue !== 'none';
  const checked = verification?.checkedAt ? fmt.dateTime(verification.checkedAt) : null;


  return (
    <section aria-labelledby={titleId}
             className={`sm:col-span-2 rounded p-3 flex flex-col gap-1 ${doubted ? 'bg-amber-50 border-l-4 border-amber-400' : 'bg-canvas'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Typography id={titleId} variant="subtitle2" component="h3">{t('title')}</Typography>
        <StatusChip kind="verification" value={verdict} label={label('verification', verdict)} />
        {named && <Typography variant="body2" className="font-semibold">{t('issue', { issue: label('verificationIssue', issue) })}</Typography>}
      </div>
      {verification?.note && <Typography variant="body2" lang="en" className="whitespace-pre-wrap">{verification.note}</Typography>}
      {!verification && <Typography variant="body2" color="text.secondary">{t('unchecked')}</Typography>}
      {checked && (
        <Typography variant="caption" color="text.secondary">
          {verification.model ? t('checkedBy', { date: checked, model: verification.model }) : t('checkedAt', { date: checked })}
        </Typography>
      )}
      {isAdmin && verification && <Typography variant="caption" color="text.secondary">{t('editHint')}</Typography>}
    </section>
  );
}







// -----------------------------------------------------------
// ObligationDialog (default export)
// -----------------------------------------------------------
//
// The dialog over one obligation of the panel: the legal
// basis, the judge's verdict, the form (read-only without
// admin rights) and who extracted and reviewed it. A save
// sends only what changed and puts the answered obligation
// into the cached lists before they are read again.
//
// Used by:
//   - ObligationsPanel.jsx — a row's edit / view
// -----------------------------------------------------------

export default function ObligationDialog({ obligation, open, isAdmin, onClose, onExited }) {

  const t = useTranslations('PAGES.obligations.DIALOG');
  const tToasts = useTranslations('PAGES.obligations.TOASTS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => toForm(obligation));
  const [loadedFor, setLoadedFor] = useState(obligation?.id);
  const [tried, setTried] = useState(false);


  // Opening an obligation loads its values — the same one
  // too, after a close (onExited forgets it): Cancel discards
  if (obligation && loadedFor !== obligation.id) {
    setLoadedFor(obligation.id);
    setForm(toForm(obligation));
    setTried(false);
  }


  const base = toForm(obligation);
  const changed = Object.keys(form).filter((key) => JSON.stringify(form[key]) !== JSON.stringify(base[key]));
  const errors = {};
  if (!form.title.trim()) errors.title = t('required');
  if (!form.text.trim()) errors.text = t('required');
  const shown = tried ? errors : {};


  const save = useMutation({
    mutationFn: async () => (await api.patch(`/api/obligations/${encodeURIComponent(obligation.id)}`,
      Object.fromEntries(changed.map((key) => [key, form[key]])), { silent: true })).data,
    onSuccess: (updated) => {
      toast.success(tToasts('saved'));
      // The answer is the obligation as it now stands — without
      // its check result when the title or the text changed
      if (updated && typeof updated === 'object' && updated.id === obligation.id) {
        queryClient.setQueriesData({ queryKey: ['obligations'] }, (list) => withRow(list, updated));
      }
      queryClient.invalidateQueries({ queryKey: ['obligations'] });
      onClose();
    },
  });


  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    if (changed.length === 0) { onClose(); return; }
    save.mutate();
  };
  const field = (key, extra = {}) => ({
    label: t(`FIELDS.${key}`), value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: Boolean(shown[key]), helperText: shown[key] || null, fullWidth: true, disabled: !isAdmin, ...extra,
  });


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={isAdmin ? submit : undefined} onExited={() => { save.reset(); setLoadedFor(null); onExited?.(); }}
                    busy={save.isPending} error={save.error ? describe(save.error) : null} maxWidth="md"
                    title={obligation?.documentTitle ? `${t('title')} — ${obligation.documentTitle}` : t('title')} confirmLabel={t('save')}>
      {obligation && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {obligation.citations?.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap gap-1 items-center">
              <Typography variant="body2" color="text.secondary" className="mr-1">{t('citations')}:</Typography>
              {obligation.citations.map((c, index) => (obligation.documentId && c.unitId
                ? <Chip key={index} size="small" variant="outlined" clickable component={Link} to={`/corpus/${obligation.documentId}?unit=${c.unitId}`} label={c.path} />
                : <Chip key={index} size="small" variant="outlined" label={c.path} />))}
            </div>
          )}
          <CheckResult verification={obligation.verification} isAdmin={isAdmin} />
          <TextField {...field('title')} required autoFocus={isAdmin} className="sm:col-span-2" />
          <TextField {...field('text')} required multiline minRows={3} className="sm:col-span-2" />
          <TextField {...field('titleEn')} className="sm:col-span-2" />
          <TextField {...field('textEn')} multiline minRows={2} className="sm:col-span-2" />
          <TextField {...field('addressee')} />
          <TextField {...field('deadline')} />
          <TextField {...field('conditions')} multiline minRows={2} className="sm:col-span-2" />
          <TextField {...field('evidence')} multiline minRows={2} className="sm:col-span-2" />
          <TextField select {...field('category')}>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{label('category', c)}</MenuItem>)}
          </TextField>
          <TextField select {...field('severity')}>
            {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{label('severity', s)}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple disabled={!isAdmin} className="sm:col-span-2"
            options={['all', ...INSTITUTION_TYPES.filter((type) => !['unknown', 'none'].includes(type))]}
            value={form.appliesTo} onChange={(_, types) => setForm({ ...form, appliesTo: types })}
            getOptionLabel={(type) => label('institutionType', type)}
            renderInput={(params) => <TextField {...params} label={t('FIELDS.appliesTo')} />}
          />
          <TextField select {...field('status')}>
            {OBLIGATION_STATUSES.map((s) => <MenuItem key={s} value={s}>{label('obligationStatus', s)}</MenuItem>)}
          </TextField>
          <TextField {...field('notes')} multiline minRows={1} />
          <Typography variant="caption" color="text.secondary" className="sm:col-span-2">
            {[obligation.model && t('model', { model: obligation.model }), obligation.reviewedAt && t('reviewed', { date: fmt.dateTime(obligation.reviewedAt) })]
              .filter(Boolean).join(' · ')}
          </Typography>
        </div>
      )}
    </UniversalModal>
  );
}
