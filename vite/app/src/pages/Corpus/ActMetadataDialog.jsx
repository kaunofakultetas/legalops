// -----------------------------------------------------------
//  [*] ActMetadataDialog — edit an act's catalogue data (admin)
//
//  PATCH /api/corpus/documents/{id} with the changed fields:
//  titles, jurisdiction, type, status, language, the source
//  address or identifier its kind needs, the domain tags,
//  "applies to" and the applicability notes. The source kind
//  itself is fixed after creation (a different source is a
//  different act). The domains and "applies to" feed the
//  analysis's applicability screen, so they matter. The
//  checks are AddActDialog's (a Bank of Lithuania address
//  stays on www.lb.lt), and a refusal names its field.
//
//  Split into (root component last):
//
//    DOMAIN_RE         — the backend's tag pattern
//    FIELDS            — the wire names the form edits
//    toForm            — act → form state
//    ActMetadataDialog — the dialog (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { DOC_STATUSES, DOC_TYPES, INSTITUTION_TYPES, JURISDICTIONS } from '@/constants/enums';


// DOMAIN_TAG in django corpus/api/views.py
const DOMAIN_RE = /^[a-z][a-z0-9_]{1,39}$/;

// The wire names the form edits (their labels are INFO.<name>)
// — what an INVALID_FIELD refusal can name
const FIELDS = [
  'title', 'shortTitle', 'titleEn', 'jurisdiction', 'docType', 'status', 'language', 'sourceUrl', 'externalId',
  'domains', 'appliesTo', 'applicabilityNotes',
];







// -----------------------------------------------------------
// toForm
// -----------------------------------------------------------
//
// The act → the editable fields: texts as strings and tags as
// lists whatever the answer held (the dialog is mounted, and
// its checks run, while it is still closed).
//
// Used by:
//   - ActMetadataDialog (below)
// -----------------------------------------------------------

function toForm(act) {
  const text = (value) => (value == null ? '' : String(value));
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    title: text(act.title), shortTitle: text(act.shortTitle), titleEn: text(act.titleEn), jurisdiction: act.jurisdiction,
    docType: act.docType, status: act.status, language: act.language ?? 'lt', sourceUrl: text(act.sourceUrl),
    externalId: text(act.externalId), domains: list(act.domains), appliesTo: list(act.appliesTo),
    applicabilityNotes: text(act.applicabilityNotes),
  };
}







// -----------------------------------------------------------
// ActMetadataDialog (default export)
// -----------------------------------------------------------
//
//   <ActMetadataDialog act={act} open onClose />
//
// Used by:
//   - CorpusDocument.jsx — "edit the metadata" (admin)
// -----------------------------------------------------------

export default function ActMetadataDialog({ act, open, onClose }) {

  const t = useTranslations('PAGES.corpusDocument');
  const tAdd = useTranslations('PAGES.corpus.ADD');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => toForm(act));
  const [tried, setTried] = useState(false);


  const base = toForm(act);
  const changed = Object.keys(form).filter((key) => JSON.stringify(form[key]) !== JSON.stringify(base[key]));
  const errors = {};
  if (!form.title.trim()) errors.title = tAdd('titleRequired');
  const url = form.sourceUrl.trim();
  if (['url', 'lb'].includes(act.sourceKind) && !url.startsWith('https://')) errors.sourceUrl = tAdd('urlRequired');
  else if (act.sourceKind === 'lb' && !`${url}/`.includes('://www.lb.lt/')) errors.sourceUrl = tAdd('lbOnly');
  if (['cellar', 'etar', 'eseimas'].includes(act.sourceKind) && !form.externalId.trim()) errors.externalId = tAdd('externalIdRequired');
  const badTag = form.domains.find((tag) => !DOMAIN_RE.test(tag));
  if (badTag) errors.domains = tAdd('domainInvalid', { tag: badTag });
  const shown = tried ? errors : {};


  const save = useMutation({
    mutationFn: () => api.patch(`/api/corpus/documents/${encodeURIComponent(act.id)}`, Object.fromEntries(changed.map((key) => [key, form[key]])), { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.saved')); queryClient.invalidateQueries({ queryKey: ['corpus'] }); onClose(); },
  });


  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    if (changed.length === 0) { onClose(); return; }
    save.mutate();
  };
  const field = (key, labelKey = key) => ({
    label: t(`INFO.${labelKey}`), value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: Boolean(shown[key]), helperText: shown[key] || null, fullWidth: true,
  });


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={submit} busy={save.isPending} maxWidth="md" title={t('EDIT.title')} confirmLabel={t('EDIT.save')}
                    error={save.error ? describe(save.error, { fields: Object.fromEntries(FIELDS.map((key) => [key, t(`INFO.${key}`)])) }) : null}
                    onExited={() => { setForm(toForm(act)); setTried(false); save.reset(); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <TextField {...field('title')} required multiline maxRows={3} className="sm:col-span-2" autoFocus />
        <TextField {...field('shortTitle')} />
        <TextField {...field('titleEn')} />
        <TextField select {...field('jurisdiction')}>
          {JURISDICTIONS.map((j) => <MenuItem key={j} value={j}>{label('jurisdiction', j)}</MenuItem>)}
        </TextField>
        <TextField select {...field('docType')}>
          {DOC_TYPES.map((d) => <MenuItem key={d} value={d}>{label('docType', d)}</MenuItem>)}
        </TextField>
        <TextField select {...field('status')}>
          {DOC_STATUSES.map((s) => <MenuItem key={s} value={s}>{label('docStatus', s)}</MenuItem>)}
        </TextField>
        <TextField select {...field('language')}>
          {['lt', 'en'].map((l) => <MenuItem key={l} value={l}>{label('language', l)}</MenuItem>)}
        </TextField>
        {['url', 'lb'].includes(act.sourceKind) && <TextField {...field('sourceUrl')} required className="sm:col-span-2" />}
        {['cellar', 'etar', 'eseimas'].includes(act.sourceKind) && <TextField {...field('externalId')} required className="sm:col-span-2" />}
        <Autocomplete
          multiple freeSolo autoSelect options={[]} value={form.domains} className="sm:col-span-2"
          onChange={(_, tags) => setForm({ ...form, domains: tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean) })}
          renderValue={(tags, getItemProps) => tags.map((tag, index) => {
            const { key, ...props } = getItemProps({ index });
            return <Chip key={key} size="small" label={tag} {...props} />;
          })}
          renderInput={(params) => <TextField {...params} label={t('INFO.domains')} error={Boolean(shown.domains)} helperText={shown.domains || tAdd('domainsHint')} />}
        />
        <Autocomplete
          multiple options={['all', ...INSTITUTION_TYPES.filter((type) => !['unknown', 'none'].includes(type))]} className="sm:col-span-2"
          value={form.appliesTo} onChange={(_, types) => setForm({ ...form, appliesTo: types })} getOptionLabel={(type) => label('institutionType', type)}
          renderInput={(params) => <TextField {...params} label={t('INFO.appliesTo')} />}
        />
        <TextField {...field('applicabilityNotes')} multiline minRows={2} className="sm:col-span-2" />
      </div>
    </UniversalModal>
  );
}
