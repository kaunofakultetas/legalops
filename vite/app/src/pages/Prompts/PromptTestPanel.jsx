// -----------------------------------------------------------
//  [*] PromptTestPanel — one model run of a prompt
//
//  POST /api/prompts/{slug}/test {input, text?, model?,
//  temperature?, maxTokens?, variables?, versionNo?} runs the
//  editor's draft (text + settings) or a stored version with
//  the given input as the data and the declared variables
//  filled (TODAY defaults to today). The answer shows the
//  text or, for pipeline prompts with a schema, the parsed
//  object; then the usage, cost, duration and finish reason,
//  and — collapsed — the final instructions the model got.
//  A run costs money and the panel says so; 502 MODEL_ERROR
//  and 429 BUDGET_EXCEEDED arrive as translated errors. The
//  cost note and the "draft is invalid" note are role=
//  "status" (MUI's Alert defaults to an urgent "alert"); only
//  a failed run is an alert.
//
//  The form (what runs, the input, the variables) and the
//  last answer are kept per prompt in sessionStorage: the
//  tab unmounts on a switch to another tab, and a run costs
//  money — neither the typed input nor the answer may vanish
//  with it (or with leaving the editor and coming back).
//
//  Split into (root component last):
//
//    NO_TEST         — the form before any input
//    isTestForm      — a stored form the tab can use
//    isTestResult    — a stored answer the tab can show
//    TestResult      — the answer and its numbers
//    PromptTestPanel — the tab (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useSessionState from '@/hooks/useSessionState';
import SectionCard from '@/components/SectionCard/SectionCard';
import ErrorState from '@/components/ErrorState/ErrorState';


// The form before any input: the draft runs, no input, no
// variables filled
const NO_TEST = { source: 'draft', input: '', variables: {} };







// -----------------------------------------------------------
// isTestForm
// -----------------------------------------------------------
//
// A stored form the tab can use: a source and an input as
// text, the variables a map of texts.
//
// Used by:
//   - PromptTestPanel (below) — useSessionState's check
// -----------------------------------------------------------

function isTestForm(value) {
  return typeof value?.source === 'string' && typeof value.input === 'string'
    && Boolean(value.variables) && typeof value.variables === 'object' && !Array.isArray(value.variables)
    && Object.values(value.variables).every((text) => typeof text === 'string');
}







// -----------------------------------------------------------
// isTestResult
// -----------------------------------------------------------
//
// A stored answer the tab can show: an object (null before
// any run).
//
// Used by:
//   - PromptTestPanel (below) — useSessionState's check
// -----------------------------------------------------------

function isTestResult(value) {
  return value === null || (Boolean(value) && typeof value === 'object' && !Array.isArray(value));
}







// -----------------------------------------------------------
// TestResult
// -----------------------------------------------------------
//
// {text, object, usage, costUsd, durationMs, finishReason,
// model, renderedInstructions} laid out.
//
// Used by:
//   - PromptTestPanel (below)
// -----------------------------------------------------------

function TestResult({ result }) {

  const t = useTranslations('PAGES.promptEditor.TEST');
  const fmt = useFormat();
  const usage = result.usage || {};


  return (
    <section className="flex flex-col gap-2 mt-4" aria-live="polite">
      <Typography variant="subtitle2" component="h3">{result.object ? t('object') : t('output')}</Typography>
      <pre className="m-0 p-3 bg-canvas rounded text-sm whitespace-pre-wrap [overflow-wrap:anywhere] max-h-96 overflow-auto">
        {result.object ? JSON.stringify(result.object, null, 2) : result.text}
      </pre>
      <Typography variant="body2" color="text.secondary">{t('model', { model: result.model })}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('usage', { input: fmt.number(usage.inputTokens ?? 0), output: fmt.number(usage.outputTokens ?? 0), reasoning: fmt.number(usage.reasoningTokens ?? 0) })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('costLine', { cost: result.costUsd == null ? '—' : fmt.usd(result.costUsd), duration: fmt.duration(result.durationMs), finish: result.finishReason || '—' })}
      </Typography>
      {result.renderedInstructions && (
        <details className="text-sm">
          <summary className="cursor-pointer">{t('rendered')}</summary>
          <pre className="m-0 mt-2 p-3 bg-canvas rounded text-xs whitespace-pre-wrap [overflow-wrap:anywhere] max-h-96 overflow-auto">{result.renderedInstructions}</pre>
        </details>
      )}
    </section>
  );
}







// -----------------------------------------------------------
// PromptTestPanel (default export)
// -----------------------------------------------------------
//
//   <PromptTestPanel prompt draft draftErrors />
//
// The form and the last answer are kept per prompt; a kept
// source the prompt no longer has reads as the draft.
//
// Used by:
//   - PromptEditor.jsx — the test tab
// -----------------------------------------------------------

export default function PromptTestPanel({ prompt, draft, draftErrors }) {

  const t = useTranslations('PAGES.promptEditor.TEST');
  const [form, setForm] = useSessionState(`prompt.${prompt.slug}.test`, NO_TEST, isTestForm);
  const [result, setResult] = useSessionState(`prompt.${prompt.slug}.testResult`, null, isTestResult);
  const [tried, setTried] = useState(false);
  const { input, variables } = form;
  const source = (prompt.versions || []).some((v) => String(v.version) === form.source) ? form.source : 'draft';
  const setSource = (value) => setForm((current) => ({ ...current, source: value }));
  const setInput = (value) => setForm((current) => ({ ...current, input: value }));
  const setVariables = (value) => setForm((current) => ({ ...current, variables: value }));


  const run = useMutation({
    mutationFn: async () => {
      const filled = Object.fromEntries(Object.entries(variables).filter(([, value]) => String(value).trim()));
      const body = { input, ...(Object.keys(filled).length ? { variables: filled } : {}) };
      if (source === 'draft') {
        Object.assign(body, { text: draft.text, model: draft.model.trim() });
        if (draft.temperature.trim()) body.temperature = Number(draft.temperature.replace(',', '.'));
        if (draft.maxTokens.trim()) body.maxTokens = Number(draft.maxTokens);
      } else {
        body.versionNo = Number(source);
      }
      return (await api.post(`/api/prompts/${prompt.slug}/test`, body, { silent: true })).data;
    },
    onSuccess: (answer) => setResult(answer && typeof answer === 'object' ? answer : null),
  });
  const shown = run.isPending || run.error ? null : result;


  const draftInvalid = source === 'draft' && Object.keys(draftErrors).length > 0;
  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (input.trim() && !draftInvalid) run.mutate();
  };


  return (
    <SectionCard>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <TextField select size="small" label={t('source')} value={source} onChange={(e) => setSource(e.target.value)} className="max-w-xs">
          <MenuItem value="draft">{t('draft')}</MenuItem>
          {(prompt.versions || []).map((v) => <MenuItem key={v.version} value={String(v.version)}>{t('version', { version: v.version })}</MenuItem>)}
        </TextField>
        <TextField label={t('input')} value={input} onChange={(e) => setInput(e.target.value)} multiline minRows={5} maxRows={16} required
                   error={tried && !input.trim()} helperText={tried && !input.trim() ? t('inputRequired') : t('inputHint')} />
        {(prompt.variables || []).length > 0 && (
          <div className="flex flex-col gap-2">
            <Typography variant="body2" color="text.secondary">{t('variables')}</Typography>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {prompt.variables.map((name) => (
                <TextField key={name} size="small" label={`{${name}}`} value={variables[name] ?? ''}
                           onChange={(e) => setVariables({ ...variables, [name]: e.target.value })}
                           helperText={name === 'TODAY' ? t('todayHint') : null} slotProps={{ inputLabel: { className: 'font-mono' } }} />
              ))}
            </div>
          </div>
        )}
        <Alert severity="info" role="status">{t('cost')}</Alert>
        {draftInvalid && tried && <Alert severity="warning" role="status">{Object.values(draftErrors).join(' ')}</Alert>}
        <div><Button type="submit" variant="contained" loading={run.isPending}>{t('run')}</Button></div>
      </form>
      {run.error && <ErrorState error={run.error} className="mt-3" />}
      {shown && <TestResult result={shown} />}
    </SectionCard>
  );
}
