// -----------------------------------------------------------
//  [*] CompanyProfile — the company profile editor
//
//  Every editable field of the profile, grouped in cards,
//  saved with one PUT /api/companies/{id} carrying only the
//  changed fields (the backend merges). The rules mirror the
//  backend's strict validation so a refusal is rare: name and
//  country required, short texts ≤ 500 chars, employees
//  0..10 000 000, turnover 0..10^14, EVRK/NACE codes ≤ 20
//  chars each, the activities / AI texts 20k / 10k, the
//  attributes a JSON object ≤ 60k chars.
//
//  The four flags are tri-state (TriStateField): null means
//  "unknown" and is sent as null — never guessed. The
//  financial-market classification is the assistant's and is
//  shown read-only, every key its tool writes labelled (the
//  flags in words, the citations as a list); the attributes
//  bag reads as a list and can be edited as JSON.
//
//  Unsaved edits survive tab switches (the panel stays
//  mounted), a background refetch (the form re-syncs only
//  while clean) and are guarded against navigation.
//
//  Split into (root component last):
//
//    LIMITS            — the backend's length/number caps
//    MARKET_KEYS       — the classification's labelled keys
//    toForm            — company → form state
//    toWire            — form state → PUT body
//    validate          — form state → {field: message}
//    BasicSection      — identity, type, size, NACE
//    ActivitySection   — the activities text
//    AiSection         — the four flags + AI description
//    MarketValue       — one classification value, in words
//    MarketSection     — the read-only classification
//    AttributesSection — the JSON bag, view or edit
//    SaveBar           — the sticky "unsaved changes" bar
//    CompanyProfile    — the editor (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useUnsavedChanges from '@/hooks/useUnsavedChanges';
import SectionCard from '@/components/SectionCard/SectionCard';
import TriStateField from '@/components/TriStateField/TriStateField';
import JsonView from '@/components/JsonView/JsonView';
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog/UnsavedChangesDialog';
import { INSTITUTION_TYPES, SIZE_CATEGORIES } from '@/constants/enums';

// The caps of django companies/api/company_views.py
const LIMITS = { text: 500, country: 100, activities: 20_000, aiDescription: 10_000, employees: 10_000_000, turnover: 1e14, nace: 20, json: 60_000 };

// The classification keys the assistant's updateCompany tool
// writes (assistant/app/llm/tools/companies.js
// FINANCIAL_MARKET), in its order — each has a MARKET label
const MARKET_KEYS = [
  'markets', 'serviceCategory', 'institutes', 'licenseRequired', 'authorisation', 'authority', 'legalBasis',
  'crossCuttingRegimes', 'reasoning', 'citations', 'verified',
];







// -----------------------------------------------------------
// toForm
// -----------------------------------------------------------
//
// The wire company → strings for the inputs (null → "", a
// stray number or boolean as its text), the NACE codes that
// are codes, the attributes pretty-printed for the JSON
// editor.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function toForm(company) {

  // Every input holds a string: a malformed answer (a number
  // where a text belongs) must not crash validate()'s trim()
  const text = (value) => (value == null ? '' : String(value));
  // Only codes become chips — a chip cannot show an object
  const codes = Array.isArray(company.naceCodes)
    ? company.naceCodes.filter((code) => typeof code === 'string' || typeof code === 'number').map(String)
    : [];


  return {
    name: text(company.name),
    registrationCode: text(company.registrationCode),
    country: text(company.country),
    legalForm: text(company.legalForm),
    sector: text(company.sector),
    institutionType: text(company.institutionType) || 'unknown',
    sizeCategory: text(company.sizeCategory) || 'unknown',
    employees: text(company.employees),
    annualTurnoverEur: text(company.annualTurnoverEur),
    naceCodes: codes,
    activities: text(company.activities),
    usesAi: company.usesAi ?? null,
    providesAi: company.providesAi ?? null,
    aiDescription: text(company.aiDescription),
    processesPersonalData: company.processesPersonalData ?? null,
    isPublicSector: company.isPublicSector ?? null,
    attributesText: JSON.stringify(company.attributes ?? {}, null, 2),
  };
}







// -----------------------------------------------------------
// toWire
// -----------------------------------------------------------
//
// Form state → the PUT body fields (empty optional texts
// become null, numbers become numbers). Unparseable JSON
// maps to undefined — validate() refuses that form first.
//
// Used by:
//   - CompanyProfile (below) — the diff and the save
// -----------------------------------------------------------

function toWire(form) {
  let attributes;
  try { attributes = JSON.parse(form.attributesText || '{}'); } catch { attributes = undefined; }
  const optional = (value) => value.trim() || null;
  return {
    name: form.name.trim(),
    registrationCode: optional(form.registrationCode),
    country: /^[A-Za-z]{2}$/.test(form.country.trim()) ? form.country.trim().toUpperCase() : form.country.trim(),
    legalForm: optional(form.legalForm),
    sector: optional(form.sector),
    institutionType: form.institutionType,
    sizeCategory: form.sizeCategory,
    employees: form.employees === '' ? null : Number(form.employees),
    annualTurnoverEur: form.annualTurnoverEur === '' ? null : Number(form.annualTurnoverEur),
    naceCodes: form.naceCodes,
    activities: form.activities,
    usesAi: form.usesAi,
    providesAi: form.providesAi,
    aiDescription: form.aiDescription,
    processesPersonalData: form.processesPersonalData,
    isPublicSector: form.isPublicSector,
    attributes,
  };
}







// -----------------------------------------------------------
// validate
// -----------------------------------------------------------
//
// {field: message} with the backend's rules; empty = valid.
// The limits in the messages are grouped the UI language's
// way (fmt), not the browser's.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function validate(form, tCommon, fmt) {

  const errors = {};
  const tooLong = (max) => tCommon('tooLong', { max });


  if (!form.name.trim()) errors.name = tCommon('required');
  else if (form.name.length > LIMITS.text) errors.name = tooLong(LIMITS.text);
  if (!form.country.trim()) errors.country = tCommon('required');
  else if (form.country.length > LIMITS.country) errors.country = tooLong(LIMITS.country);
  for (const key of ['registrationCode', 'legalForm', 'sector']) {
    if (form[key].length > LIMITS.text) errors[key] = tooLong(LIMITS.text);
  }


  if (form.employees !== '' && (!/^\d+$/.test(form.employees) || Number(form.employees) > LIMITS.employees)) {
    errors.employees = tCommon('wholeNumber', { min: 0, max: fmt.number(LIMITS.employees) });
  }
  if (form.annualTurnoverEur !== '' && (!/^\d+$/.test(form.annualTurnoverEur) || Number(form.annualTurnoverEur) > LIMITS.turnover)) {
    errors.annualTurnoverEur = tCommon('wholeNumber', { min: 0, max: '10¹⁴' });
  }
  if (form.activities.length > LIMITS.activities) errors.activities = tooLong(LIMITS.activities);
  if (form.aiDescription.length > LIMITS.aiDescription) errors.aiDescription = tooLong(LIMITS.aiDescription);


  try {
    const parsed = JSON.parse(form.attributesText || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) errors.attributes = tCommon('jsonObject');
    else if (JSON.stringify(parsed).length > LIMITS.json) errors.attributes = tooLong(LIMITS.json);
  } catch (error) {
    errors.attributes = tCommon('invalidJson', { message: error.message });
  }
  return errors;
}







// -----------------------------------------------------------
// BasicSection
// -----------------------------------------------------------
//
// Identity (name, code, country, legal form, sector), the
// institution type and size selects, the two numbers and
// the NACE codes as free-typed chips.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function BasicSection({ form, set, errors }) {

  const t = useTranslations('PAGES.company.PROFILE');
  const label = useEnumLabel();
  const field = (key, extra = {}) => ({
    label: t(`FIELDS.${key}`), value: form[key], onChange: (e) => set(key, e.target.value),
    error: Boolean(errors[key]), helperText: errors[key] || extra.hint || null, fullWidth: true,
  });


  return (
    <SectionCard title={t('SECTIONS.basic')}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField {...field('name')} required />
        <TextField {...field('registrationCode')} />
        <TextField {...field('legalForm', { hint: t('HINTS.legalForm') })} />
        <TextField {...field('country', { hint: t('HINTS.country') })} required />
        <TextField {...field('sector')} />
        <TextField select {...field('institutionType')}>
          {INSTITUTION_TYPES.map((type) => <MenuItem key={type} value={type}>{label('institutionType', type)}</MenuItem>)}
        </TextField>
        <TextField select {...field('sizeCategory')}>
          {SIZE_CATEGORIES.map((size) => <MenuItem key={size} value={size}>{label('sizeCategory', size)}</MenuItem>)}
        </TextField>
        <TextField {...field('employees')} inputMode="numeric" onChange={(e) => set('employees', e.target.value.replace(/[^\d]/g, ''))} />
        <TextField {...field('annualTurnoverEur')} inputMode="numeric" onChange={(e) => set('annualTurnoverEur', e.target.value.replace(/[^\d]/g, ''))} />
        <Autocomplete
          multiple freeSolo autoSelect options={[]} value={form.naceCodes}
          onChange={(_, codes) => set('naceCodes', codes.map((c) => String(c).trim()).filter(Boolean).map((c) => c.slice(0, LIMITS.nace)))}
          renderValue={(codes, getItemProps) => codes.map((code, index) => {
            const { key, ...props } = getItemProps({ index });
            return <Chip key={key} size="small" label={code} {...props} />;
          })}
          renderInput={(params) => <TextField {...params} label={t('FIELDS.naceCodes')} helperText={t('HINTS.naceCodes')} />}
        />
      </div>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// ActivitySection
// -----------------------------------------------------------
//
// The free-text activities description with its counter.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function ActivitySection({ form, set, errors }) {
  const t = useTranslations('PAGES.company.PROFILE');
  const tCommon = useTranslations('COMPONENTS.common');
  return (
    <SectionCard title={t('SECTIONS.activity')}>
      <TextField
        label={t('FIELDS.activities')} value={form.activities} onChange={(e) => set('activities', e.target.value)}
        multiline minRows={4} maxRows={16} fullWidth error={Boolean(errors.activities)}
        helperText={errors.activities || `${t('HINTS.activities')} ${tCommon('characters', { count: form.activities.length, max: LIMITS.activities })}`}
      />
    </SectionCard>
  );
}







// -----------------------------------------------------------
// AiSection
// -----------------------------------------------------------
//
// The four tri-state flags and the AI use description.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function AiSection({ form, set, errors }) {
  const t = useTranslations('PAGES.company.PROFILE');
  return (
    <SectionCard title={t('SECTIONS.ai')} subtitle={t('HINTS.triState')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {['usesAi', 'providesAi', 'processesPersonalData', 'isPublicSector'].map((key) => (
          <TriStateField key={key} label={t(`FIELDS.${key}`)} value={form[key]} onChange={(value) => set(key, value)} />
        ))}
      </div>
      <TextField
        label={t('FIELDS.aiDescription')} value={form.aiDescription} onChange={(e) => set('aiDescription', e.target.value)}
        multiline minRows={2} maxRows={10} fullWidth error={Boolean(errors.aiDescription)}
        helperText={errors.aiDescription || t('HINTS.aiDescription')}
      />
    </SectionCard>
  );
}







// -----------------------------------------------------------
// MarketValue
// -----------------------------------------------------------
//
// One classification value in words: the licence flag as
// yes / no / unknown (null — nobody could tell), the
// verified flag as what it vouches for, the citations as a
// list; texts and lists of words as JsonView draws them.
//
// Used by:
//   - MarketSection (below)
// -----------------------------------------------------------

function MarketValue({ name, value }) {

  const t = useTranslations('PAGES.company.PROFILE.MARKET');
  const label = useEnumLabel();


  if (name === 'licenseRequired') return <span>{label('boolean', String(value))}</span>;
  if (name === 'verified') return <span>{value === true ? t('verifiedYes') : t('verifiedNo')}</span>;
  if (name === 'citations' && Array.isArray(value) && value.length > 0) {
    return (
      <ul className="m-0 pl-5">
        {value.map((citation, index) => <li key={index}><JsonView value={citation} /></li>)}
      </ul>
    );
  }
  return <JsonView value={value} />;
}







// -----------------------------------------------------------
// MarketSection
// -----------------------------------------------------------
//
// The assistant's classification — read-only. Its keys (the
// MARKET_KEYS the updateCompany tool writes) are labelled in
// the tool's order; a key a later tool version adds is not
// lost, JsonView draws it under them with its humanised name.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function MarketSection({ value }) {

  const t = useTranslations('PAGES.company.PROFILE');
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const known = object ? MARKET_KEYS.filter((key) => key in object) : [];
  const rest = object ? Object.fromEntries(Object.entries(object).filter(([key]) => !MARKET_KEYS.includes(key))) : {};
  const empty = object ? known.length + Object.keys(rest).length === 0 : value == null || value === '';


  return (
    <SectionCard title={t('SECTIONS.market')} subtitle={empty ? null : t('MARKET.readOnly')}>
      {empty && <Typography color="text.secondary">{t('MARKET.empty')}</Typography>}
      {known.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-[minmax(9rem,max-content)_1fr] gap-x-4 gap-y-2 m-0">
          {known.map((key) => (
            <div key={key} className="contents">
              <dt className="text-sm text-muted">{t(`MARKET.${key}`)}</dt>
              <dd className="text-sm m-0 min-w-0"><MarketValue name={key} value={object[key]} /></dd>
            </div>
          ))}
        </dl>
      )}
      {Object.keys(rest).length > 0 && <JsonView value={rest} className={known.length > 0 ? 'mt-2' : ''} />}
      {!object && !empty && <JsonView value={value} />}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// AttributesSection
// -----------------------------------------------------------
//
// The attributes bag: a readable list by default, a JSON
// text field after "Redaguoti JSON" (validated as an object).
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function AttributesSection({ form, set, errors, saved }) {

  const t = useTranslations('PAGES.company.PROFILE');
  const [editing, setEditing] = useState(false);
  const empty = !saved || Object.keys(saved).length === 0;


  const toggle = <Button size="small" onClick={() => setEditing(!editing)}>{editing ? t('ATTRIBUTES.view') : t('ATTRIBUTES.edit')}</Button>;


  return (
    <SectionCard title={t('SECTIONS.attributes')} subtitle={t('ATTRIBUTES.hint')} actions={toggle}>
      {editing || errors.attributes ? (
        <TextField
          value={form.attributesText} onChange={(e) => set('attributesText', e.target.value)} multiline minRows={6} maxRows={24}
          fullWidth error={Boolean(errors.attributes)} helperText={errors.attributes}
          slotProps={{ htmlInput: { className: 'font-mono text-sm', spellCheck: false, 'aria-label': t('FIELDS.attributes') } }}
        />
      ) : empty ? <Typography color="text.secondary">{t('ATTRIBUTES.empty')}</Typography> : <JsonView value={saved} />}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// SaveBar
// -----------------------------------------------------------
//
// Sticks to the bottom of the scroll area while the form is
// dirty: discard or save.
//
// Used by:
//   - CompanyProfile (below)
// -----------------------------------------------------------

function SaveBar({ busy, onDiscard, onSave }) {
  const t = useTranslations('PAGES.company.PROFILE');
  const tCommon = useTranslations('COMPONENTS.common');
  return (
    <Paper elevation={6} className="sticky bottom-0 z-10 mt-4 p-3 flex items-center justify-between gap-2 flex-wrap" role="region" aria-label={tCommon('unsavedBar')}>
      <Typography variant="body2" className="font-semibold">{tCommon('unsavedBar')}</Typography>
      <div className="flex gap-2">
        <Button onClick={onDiscard} disabled={busy}>{tCommon('discard')}</Button>
        <Button variant="contained" onClick={onSave} loading={busy}>{t('save')}</Button>
      </div>
    </Paper>
  );
}







// -----------------------------------------------------------
// CompanyProfile (default export)
// -----------------------------------------------------------
//
// Owns the form state, the "last synced" company it diffs
// against, validation (shown after the first save attempt)
// and the PUT.
//
// Used by:
//   - CompanyDetail.jsx — the profile tab
// -----------------------------------------------------------

export default function CompanyProfile({ company }) {

  const t = useTranslations('PAGES.company.PROFILE');
  const tCommon = useTranslations('COMPONENTS.common');
  const describe = useErrorMessage();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const [synced, setSynced] = useState(company);
  const [form, setForm] = useState(() => toForm(company));
  const [tried, setTried] = useState(false);


  const base = toWire(toForm(synced));
  const next = toWire(form);
  const changed = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(base[key]));
  const dirty = changed.length > 0;


  // A refetch (after a save, or the assistant editing the
  // profile in the chat) replaces the form — unless the user
  // is mid-edit, whose changes win
  if (company !== synced && !dirty) {
    setSynced(company);
    setForm(toForm(company));
  }


  const errors = validate(form, tCommon, fmt);
  const shown = tried ? errors : {};
  const blocker = useUnsavedChanges(dirty);


  const save = useMutation({
    mutationFn: async () => (await api.put(`/api/companies/${company.id}`,
      Object.fromEntries(changed.map((key) => [key, next[key]])), { silent: true })).data,
    onSuccess: (saved) => {
      toast.success(t('saved'));
      setTried(false);
      setSynced(saved);
      setForm(toForm(saved));
      queryClient.setQueryData(['company', company.id], saved);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });


  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };
  const discard = () => { setForm(toForm(synced)); setTried(false); save.reset(); };
  const fieldLabels = Object.fromEntries(Object.keys(next).map((key) => [key, t(`FIELDS.${key}`)]));


  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <BasicSection form={form} set={set} errors={shown} />
      <ActivitySection form={form} set={set} errors={shown} />
      <AiSection form={form} set={set} errors={shown} />
      <MarketSection value={company.financialMarket} />
      <AttributesSection form={form} set={set} errors={shown} saved={synced.attributes} />
      {save.error && <Alert severity="error">{describe(save.error, { fields: fieldLabels })}</Alert>}
      {dirty && <SaveBar busy={save.isPending} onDiscard={discard} onSave={submit} />}
      <UnsavedChangesDialog blocker={blocker} />
    </div>
  );
}
