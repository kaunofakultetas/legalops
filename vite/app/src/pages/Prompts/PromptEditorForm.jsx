// -----------------------------------------------------------
//  [*] PromptEditorForm — the prompt text and model settings
//
//  The draft editor: which stored version it starts from,
//  the placeholder chips (a click inserts {NAME} at the
//  cursor — the variables the prompt declares), a note for
//  placeholders the prompt does not declare (they would stay
//  literal; a status, not an alert — nothing failed), the
//  monospace text with its counter, the model (picked from
//  GET /api/llm/models or typed, provider-qualified; a
//  failed list says so and can be retried — the field still
//  takes a typed id), temperature, max tokens, the change
//  note and "activate right away". Saving (POST …/versions)
//  is the parent's; this form only edits the draft.
//
//  Split into (root component last):
//
//    chatModels       — the model list the picker offers
//    ModelField       — the model autocomplete with prices
//    PromptEditorForm — the form (default export)
// -----------------------------------------------------------

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import ErrorState from '@/components/ErrorState/ErrorState';
import SectionCard from '@/components/SectionCard/SectionCard';
import { MAX_TEXT, placeholders } from '@/pages/Prompts/promptDraft';







// -----------------------------------------------------------
// chatModels
// -----------------------------------------------------------
//
// GET /api/llm/models's rows → the chat models the picker
// offers: embedding models left out, one row per id (the id
// is the option and its key). An answer without a model
// list throws — the field's error state, not an empty list.
//
// Used by:
//   - ModelField (below) — the models query
// -----------------------------------------------------------

function chatModels(data) {
  if (!Array.isArray(data?.models)) throw new Error('The model list answer has no models');
  const seen = new Set();
  return data.models.filter((model) => {
    if (typeof model?.id !== 'string' || !model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return !model.kind || model.kind === 'chat';
  });
}







// -----------------------------------------------------------
// ModelField
// -----------------------------------------------------------
//
// Free text with the gateway's chat models offered (name
// and per-million-token prices beside each id). A failed
// list shows its error with a retry under the field
// (review #7: a failed query must not look like an empty
// list); typing an id keeps working.
//
// Used by:
//   - PromptEditorForm (below)
// -----------------------------------------------------------

function ModelField({ value, onChange, error }) {

  const t = useTranslations('PAGES.promptEditor.EDITOR');
  const fmt = useFormat();


  const { data: models = [], error: listError, refetch } = useQuery({
    queryKey: ['llmModels'],
    queryFn: async () => chatModels((await api.get('/api/llm/models')).data),
    staleTime: 5 * 60_000,
  });


  const price = (model) => (model.pricing
    ? t('modelPrice', { input: fmt.usd(model.pricing.promptPerToken * 1e6), output: fmt.usd(model.pricing.completionPerToken * 1e6) })
    : '');


  return (
    <div className="flex flex-col gap-2">
      <Autocomplete
        freeSolo options={models.map((m) => m.id)} value={value} onInputChange={(_, next) => onChange(next)}
        renderOption={(props, id) => {
          const { key, ...rest } = props;
          const model = models.find((m) => m.id === id);
          return (
            <li key={key} {...rest}>
              <div className="flex flex-col">
                <span>{id}</span>
                {model && <span className="text-xs text-muted">{model.name} · {price(model)}</span>}
              </div>
            </li>
          );
        }}
        renderInput={(params) => <TextField {...params} label={t('model')} required error={Boolean(error)} helperText={error || t('modelHint')} />}
      />
      {listError && <ErrorState error={listError} onRetry={refetch} title={t('modelsError')} />}
    </div>
  );
}







// -----------------------------------------------------------
// PromptEditorForm (default export)
// -----------------------------------------------------------
//
//   <PromptEditorForm prompt draft setDraft errors baseNo
//                     onLoadBase onSave saving dirty />
//
// Used by:
//   - PromptEditor.jsx — the left column
// -----------------------------------------------------------

export default function PromptEditorForm({ prompt, draft, setDraft, errors, baseNo, onLoadBase, onSave, saving, dirty }) {

  const t = useTranslations('PAGES.promptEditor.EDITOR');
  const tCommon = useTranslations('COMPONENTS.common');
  const textRef = useRef(null);
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const unknown = placeholders(draft.text).filter((name) => !(prompt.variables || []).includes(name));


  // Insert {NAME} at the caret and put the caret after it
  const insert = (name) => {
    const input = textRef.current;
    const token = `{${name}}`;
    const start = input?.selectionStart ?? draft.text.length;
    const end = input?.selectionEnd ?? draft.text.length;
    set('text')(`${draft.text.slice(0, start)}${token}${draft.text.slice(end)}`);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };


  return (
    <SectionCard title={t('title')}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 items-center flex-wrap">
          <TextField select size="small" label={t('base')} value={baseNo ?? ''} onChange={(e) => onLoadBase(Number(e.target.value))} sx={{ minWidth: 200 }}>
            {(prompt.versions || []).map((v) => (
              <MenuItem key={v.version} value={v.version}>
                {t('baseVersion', { version: v.version, active: v.version === prompt.activeVersion ? t('activeMark') : '' })}
              </MenuItem>
            ))}
          </TextField>
        </div>
        {(prompt.variables || []).length > 0 && (
          <div className="flex flex-col gap-1">
            <Typography variant="body2" color="text.secondary">{t('placeholders')}</Typography>
            <div className="flex flex-wrap gap-1">
              {prompt.variables.map((name) => <Chip key={name} size="small" label={`{${name}}`} onClick={() => insert(name)} clickable className="font-mono" />)}
            </div>
            <Typography variant="caption" color="text.secondary">{t('placeholdersHint')}</Typography>
          </div>
        )}
        {unknown.length > 0 && <Alert severity="warning" role="status">{t('unknownPlaceholders', { names: unknown.map((n) => `{${n}}`).join(', ') })}</Alert>}
        <TextField
          label={t('text')} value={draft.text} onChange={(e) => set('text')(e.target.value)} multiline minRows={14} maxRows={36} required
          inputRef={textRef} error={Boolean(errors.text)}
          helperText={errors.text || tCommon('characters', { count: draft.text.length, max: MAX_TEXT })}
          slotProps={{ htmlInput: { className: 'font-mono text-sm', spellCheck: false } }}
        />
        <ModelField value={draft.model} onChange={set('model')} error={errors.model} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* inputMode belongs on the <input> (htmlInput): on the
              TextField it lands on the wrapper div, and phones
              would not open the numeric keyboard */}
          <TextField label={t('temperature')} value={draft.temperature} onChange={(e) => set('temperature')(e.target.value)}
                     slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                     error={Boolean(errors.temperature)} helperText={errors.temperature || t('temperatureHint')} />
          <TextField label={t('maxTokens')} value={draft.maxTokens} onChange={(e) => set('maxTokens')(e.target.value.replace(/[^\d]/g, ''))}
                     slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                     error={Boolean(errors.maxTokens)} helperText={errors.maxTokens || t('maxTokensHint')} />
        </div>
        <TextField label={t('note')} value={draft.note} onChange={(e) => set('note')(e.target.value.slice(0, 500))} helperText={t('noteHint')} />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <FormControlLabel control={<Checkbox checked={draft.activate} onChange={(e) => set('activate')(e.target.checked)} />} label={t('activate')} />
          <Button variant="contained" onClick={onSave} loading={saving} disabled={!dirty}>{dirty ? t('save') : t('unchanged')}</Button>
        </div>
      </div>
    </SectionCard>
  );
}
