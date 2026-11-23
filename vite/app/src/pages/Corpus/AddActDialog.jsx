// -----------------------------------------------------------
//  [*] AddActDialog — add a legal act or a standard to the
//      corpus (admin)
//
//  POST /api/corpus/documents with the catalogue metadata;
//  the source decides what else is needed (the backend's
//  own rules, checked here first):
//
//    cellar            — a CELEX number (EUR-Lex)
//    etar / eseimas    — the register's document id
//    lb                — a www.lb.lt page address
//    url               — any https:// address
//    upload            — a file, sent right after the act is
//                        created (POST …/upload, with progress);
//                        one over the backend's 60 MB is
//                        refused as it is chosen
//
//  The fields' own errors are MUI helper texts (tied to their
//  input, which turns aria-invalid); the missing file has no
//  input of its own, so its "Choose a file" is an alert — a
//  screen reader hears it the moment Add refuses.
//
//  A standard (type "standard") is the organisation's
//  licensed copy, uploaded: picking the type switches the form
//  to it — international jurisdiction, an upload in English —
//  and drops the "applies to" fields, since a standard applies
//  to the companies that adopted it (their Standards tab), not
//  by institution type.
//
//  A fetchable act queues its first ingestion at once; the
//  dialog then opens the act's page, where the job's
//  progress shows. An uploaded act whose file was refused
//  exists without a text: nothing is queued, the toast says
//  so, and its page offers the upload again.
//
//  Split into (root component last):
//
//    DOMAIN_RE    — the backend's tag pattern
//    EMPTY_ACT    — the blank form
//    STANDARD     — what picking the standard type sets
//    validate     — form → {field: message}
//    toBody       — form → POST body
//    AddActDialog — the dialog (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import FileDrop from '@/components/FileDrop/FileDrop';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { DOC_STATUSES, DOC_TYPES, INSTITUTION_TYPES, JURISDICTIONS, SOURCE_KINDS } from '@/constants/enums';
import { ACT_ACCEPT, MAX_ACT_BYTES } from '@/constants/uploads';


// DOMAIN_TAG in django corpus/api/views.py
const DOMAIN_RE = /^[a-z][a-z0-9_]{1,39}$/;

// The blank form
const EMPTY_ACT = {
  title: '', shortTitle: '', titleEn: '', jurisdiction: 'EU', docType: 'regulation', status: 'in_force', language: 'lt',
  sourceKind: 'url', sourceUrl: '', externalId: '', domains: [], appliesTo: [], applicabilityNotes: '', file: null,
};

// Picking the standard type: an uploaded copy, usually of an
// international standard in English
const STANDARD = { jurisdiction: 'INTL', sourceKind: 'upload', language: 'en', appliesTo: [], domains: [] };







// -----------------------------------------------------------
// validate
// -----------------------------------------------------------
//
// The backend's rules for the chosen source kind.
//
// Used by:
//   - AddActDialog (below)
// -----------------------------------------------------------

function validate(form, t) {
  const errors = {};
  if (!form.title.trim()) errors.title = t('titleRequired');
  const url = form.sourceUrl.trim();
  if (['url', 'lb'].includes(form.sourceKind) && !url.startsWith('https://')) errors.sourceUrl = t('urlRequired');
  else if (form.sourceKind === 'lb' && !`${url}/`.includes('://www.lb.lt/')) errors.sourceUrl = t('lbOnly');
  if (['cellar', 'etar', 'eseimas'].includes(form.sourceKind) && !form.externalId.trim()) errors.externalId = t('externalIdRequired');
  if (form.sourceKind === 'upload' && !form.file) errors.file = t('fileRequired');
  const badTag = form.domains.find((tag) => !DOMAIN_RE.test(tag));
  if (badTag) errors.domains = t('domainInvalid', { tag: badTag });
  return errors;
}







// -----------------------------------------------------------
// toBody
// -----------------------------------------------------------
//
// The POST body: only the source field the kind uses; a
// standard sends no "applies to" (it applies by adoption).
//
// Used by:
//   - AddActDialog (below)
// -----------------------------------------------------------

function toBody(form) {
  return {
    title: form.title.trim(),
    shortTitle: form.shortTitle.trim(),
    titleEn: form.titleEn.trim(),
    jurisdiction: form.jurisdiction,
    docType: form.docType,
    status: form.status,
    language: form.language,
    sourceKind: form.sourceKind,
    ...(['url', 'lb'].includes(form.sourceKind) ? { sourceUrl: form.sourceUrl.trim() } : {}),
    ...(['cellar', 'etar', 'eseimas'].includes(form.sourceKind) ? { externalId: form.externalId.trim() } : {}),
    ...(form.docType === 'standard' ? {} : { domains: form.domains, appliesTo: form.appliesTo }),
    applicabilityNotes: form.applicabilityNotes,
  };
}







// -----------------------------------------------------------
// AddActDialog (default export)
// -----------------------------------------------------------
//
//   <AddActDialog open onClose={…} />
//
// Used by:
//   - Corpus.jsx — "Pridėti teisės aktą" (admin)
// -----------------------------------------------------------

export default function AddActDialog({ open, onClose }) {

  const t = useTranslations('PAGES.corpus.ADD');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_ACT);
  const [tried, setTried] = useState(false);
  const [percent, setPercent] = useState(null);


  const errors = validate(form, t);
  const shown = tried ? errors : {};
  const standard = form.docType === 'standard';
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const setType = (value) => setForm((current) => ({ ...current, docType: value, ...(value === 'standard' ? STANDARD : {}) }));
  const field = (key) => ({
    label: t(key === 'title' ? 'titleField' : key), value: form[key], onChange: (e) => set(key)(e.target.value),
    error: Boolean(shown[key]), helperText: shown[key] || null, fullWidth: true,
  });


  const create = useMutation({
    mutationFn: async () => {
      const act = (await api.post('/api/corpus/documents', toBody(form), { silent: true })).data;
      if (form.sourceKind === 'upload') {
        const data = new FormData();
        data.append('file', form.file);
        setPercent(0);
        try {
          await api.post(`/api/corpus/documents/${encodeURIComponent(act.id)}/upload`, data, {
            silent: true, onUploadProgress: (e) => setPercent(e.total ? Math.round((e.loaded * 100) / e.total) : 0),
          });
        } catch (error) {
          // The act exists without its text — open it anyway,
          // the upload can be retried from its page; nothing
          // was queued, so the toast tells what happened
          toast.error(t('uploadFailed', { reason: describe(error) }));
          return { act, queued: false };
        }
      }
      return { act, queued: true };
    },
    onSuccess: ({ act, queued }) => {
      if (queued) toast.success(t('queued'));
      queryClient.invalidateQueries({ queryKey: ['corpus'] });
      onClose();
      navigate(`/corpus/${act.id}`);
    },
  });


  const submit = () => { setTried(true); if (Object.keys(errors).length === 0) create.mutate(); };
  const exited = () => { setForm(EMPTY_ACT); setTried(false); setPercent(null); create.reset(); };


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={submit} onExited={exited} busy={create.isPending} maxWidth="md"
                    error={create.error ? describe(create.error, { fields: { sourceUrl: t('sourceUrl'), externalId: t('externalId'), domains: t('domains') } }) : null}
                    title={standard ? t('titleStandard') : t('title')} confirmLabel={t('submit')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <TextField {...field('title')} required autoFocus className="sm:col-span-2" multiline maxRows={3} />
        <TextField {...field('shortTitle')} helperText={standard ? t('shortTitleHintStandard') : t('shortTitleHint')} />
        <TextField {...field('titleEn')} />
        <TextField select {...field('jurisdiction')}>
          {JURISDICTIONS.map((j) => <MenuItem key={j} value={j}>{label('jurisdiction', j)}</MenuItem>)}
        </TextField>
        <TextField select {...field('docType')} onChange={(e) => setType(e.target.value)}>
          {DOC_TYPES.map((d) => <MenuItem key={d} value={d}>{label('docType', d)}</MenuItem>)}
        </TextField>
        <TextField select {...field('status')}>
          {DOC_STATUSES.map((s) => <MenuItem key={s} value={s}>{label('docStatus', s)}</MenuItem>)}
        </TextField>
        <TextField select {...field('language')}>
          {['lt', 'en'].map((l) => <MenuItem key={l} value={l}>{label('language', l)}</MenuItem>)}
        </TextField>
        <TextField select {...field('sourceKind')} className="sm:col-span-2">
          {SOURCE_KINDS.map((s) => <MenuItem key={s} value={s}>{label('sourceKind', s)}</MenuItem>)}
        </TextField>
        {['url', 'lb'].includes(form.sourceKind) && (
          <TextField {...field('sourceUrl')} required className="sm:col-span-2" inputMode="url"
                     helperText={shown.sourceUrl || (form.sourceKind === 'lb' ? t('sourceUrlLb') : t('sourceUrlHint'))} />
        )}
        {['cellar', 'etar', 'eseimas'].includes(form.sourceKind) && (
          <TextField {...field('externalId')} required className="sm:col-span-2"
                     helperText={shown.externalId || (form.sourceKind === 'cellar' ? t('externalIdCellar') : t('externalIdEtar'))} />
        )}
        {form.sourceKind === 'upload' && (
          <div className="sm:col-span-2 flex flex-col gap-1">
            <Typography variant="body2" color="text.secondary">{standard ? t('fileStandard') : t('file')}</Typography>
            <FileDrop accept={ACT_ACCEPT} maxSize={MAX_ACT_BYTES} onFiles={([file]) => set('file')(file)}
                      hint={standard ? t('fileHintStandard') : t('fileHint')} />
            {form.file && <Typography variant="caption">{t('fileChosen', { name: form.file.name })}</Typography>}
            {shown.file && <Typography variant="caption" color="error" role="alert">{shown.file}</Typography>}
            {percent != null && (
              <>
                <Typography variant="caption">{t('uploading', { percent })}</Typography>
                <LinearProgress variant="determinate" value={percent} />
              </>
            )}
          </div>
        )}
        {standard && <Typography variant="body2" color="text.secondary" className="sm:col-span-2">{t('standardHint')}</Typography>}
        {!standard && (
          <>
            <Autocomplete
              multiple freeSolo autoSelect options={[]} value={form.domains} className="sm:col-span-2"
              onChange={(_, tags) => set('domains')(tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))}
              renderValue={(tags, getItemProps) => tags.map((tag, index) => {
                const { key, ...props } = getItemProps({ index });
                return <Chip key={key} size="small" label={tag} {...props} />;
              })}
              renderInput={(params) => <TextField {...params} label={t('domains')} error={Boolean(shown.domains)} helperText={shown.domains || t('domainsHint')} />}
            />
            <Autocomplete
              multiple options={['all', ...INSTITUTION_TYPES.filter((type) => !['unknown', 'none'].includes(type))]}
              value={form.appliesTo} onChange={(_, types) => set('appliesTo')(types)} className="sm:col-span-2"
              getOptionLabel={(type) => label('institutionType', type)}
              renderInput={(params) => <TextField {...params} label={t('appliesTo')} />}
            />
          </>
        )}
        <TextField {...field('applicabilityNotes')} multiline minRows={2} className="sm:col-span-2" />
      </div>
    </UniversalModal>
  );
}
