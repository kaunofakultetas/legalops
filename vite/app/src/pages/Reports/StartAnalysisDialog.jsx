// -----------------------------------------------------------
//  [*] StartAnalysisDialog — "run a compliance analysis"
//
//  POST /api/reports {companyId, language, documentIds?,
//  review?, internal?}; on success the new report page opens
//  (it shows the progress). A report is made in two parts:
//  the acts that apply are decided first, the obligations
//  judged after. By default the run stops between them until
//  a person approves the list of acts (review: true) — the
//  second part is where the money goes; ticking "continue
//  without waiting" leaves the flag out and the run goes
//  through unattended.
//  Before the user confirms, GET /api/reports/estimate shows
//  the upper-bound USD cost for the chosen company and scope:
//  the analysis itself, the one-time corpus work (obligations
//  extracted for the first time — paid from the shared
//  budget, not the user's) and the user's remaining daily
//  budget, with a note when the user's own part (the
//  analysis) exceeds it. The start stays open then: the
//  backend refuses only an (almost) spent budget, and a
//  started run is never stopped halfway (docs/markdown/en/api.md). The
//  optional scope (only these acts) is what moves the cost.
//  When a model's price is unknown (pricesKnown false) the
//  total counts only the priced calls — a floor: it says
//  so and shows "at least" that much, and a floor already
//  over the budget left still gets the note.
//
//  A report may also assess the company's own rules — whether
//  its procedures carry out what its own policies require —
//  as a group counted apart from the acts. Ticking that
//  option asks the estimate again with internal=true: the
//  answer prices the group apart (the policy-level documents
//  to read, the requirements expected, the cost — a line of
//  its own in the estimate, and the caller's own expense, so
//  it meets the budget with the analysis), and the start then
//  sends internal: true. Every estimate says how many
//  policy-level documents the company has (policyDocuments);
//  with none the option would do nothing, so it is off from
//  the start — no tick needed to find out — and says why,
//  and the start does not ask for it.
//
//  The report language follows the UI language until the
//  user picks one. A company, act or estimate list that
//  fails to load says so (with a retry) instead of looking
//  empty.
//
//  The three refusals the backend knows are shown inside the
//  dialog, translated: 409 CORPUS_EMPTY, 409 ALREADY_RUNNING
//  (with a link to the report in the way — running, or
//  waiting for its list of acts to be approved — looked up
//  on the spot) and 429 BUDGET_EXCEEDED.
//
//  With `companyId` the company is fixed (the company page);
//  without it the user picks one (the reports page).
//
//  Split into (root component last):
//
//    CompanyPicker       — the company autocomplete
//    ScopePicker         — the optional acts
//    OwnRulesChoice      — assess the company's own rules too
//    ReviewChoice        — wait for the approval, or not
//    useEstimate         — the estimate of the company and scope
//    CostEstimate        — the estimate block
//    RunningLink         — the ALREADY_RUNNING way out
//    StartAnalysisDialog — the dialog (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useLocale, useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { errorInfo, useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import ErrorState from '@/components/ErrorState/ErrorState';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { chargedUsd, isActive, isWaiting, ownEstimate, policyDocuments } from '@/pages/Reports/reportUtils';







// -----------------------------------------------------------
// CompanyPicker
// -----------------------------------------------------------
//
// The caller's companies (admins: all) as an autocomplete;
// a failed list says so under it, with a retry.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function CompanyPicker({ value, onChange, error }) {

  const t = useTranslations('PAGES.reports');


  const { data: companies = [], isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['companies', { q: '', scope: '' }],
    queryFn: async () => (await api.get('/api/companies')).data.companies,
  });


  return (
    <div className="flex flex-col gap-2">
      <Autocomplete
        options={companies}
        loading={isLoading}
        value={companies.find((c) => c.id === value) ?? null}
        onChange={(_, company) => onChange(company?.id ?? null)}
        getOptionLabel={(company) => company.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => <TextField {...params} label={t('START.company')} required autoFocus error={Boolean(error)} helperText={error} />}
      />
      {loadError && <ErrorState error={loadError} onRetry={refetch} title={t('START.companiesFailed')} />}
    </div>
  );
}







// -----------------------------------------------------------
// ScopePicker
// -----------------------------------------------------------
//
// The enabled, ingested acts; none picked = the analysis
// screens the whole catalogue itself. A failed list says so
// under the picker, with a retry.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function ScopePicker({ value, onChange }) {

  const t = useTranslations('PAGES.reports.START');


  const { data: acts = [], error, refetch } = useQuery({
    queryKey: ['corpus', 'documents', { q: '', jurisdiction: '' }],
    queryFn: async () => (await api.get('/api/corpus/documents')).data.documents,
    select: (documents) => documents.filter((d) => d.enabled && d.currentVersion),
  });


  return (
    <div className="flex flex-col gap-2">
      <Autocomplete
        multiple size="small" options={acts} value={acts.filter((a) => value.includes(a.id))}
        onChange={(_, picked) => onChange(picked.map((a) => a.id))} getOptionLabel={(a) => a.shortTitle || a.title}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => <TextField {...params} label={t('scope')} helperText={t('scopeHint')} />}
      />
      {error && <ErrorState error={error} onRetry={refetch} title={t('actsFailed')} />}
    </div>
  );
}







// -----------------------------------------------------------
// OwnRulesChoice
// -----------------------------------------------------------
//
// The checkbox that adds the company's own requirements to
// the report, with the sentence saying what is then checked
// and that those findings are counted apart. For a company
// the estimate says has no policy-level document (`none`)
// there is nothing to assess: the box is off and unticked
// from the start, and the sentence says why instead.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function OwnRulesChoice({ checked, none, onChange }) {
  const t = useTranslations('PAGES.reports.START');
  const hintId = useId();
  return (
    <div className="flex flex-col">
      <FormControlLabel label={t('internal')}
                        control={<Checkbox checked={checked} disabled={none} onChange={(e) => onChange(e.target.checked)}
                                           slotProps={{ input: { 'aria-describedby': hintId } }} />} />
      <Typography id={hintId} variant="body2" color="text.secondary">{none ? t('internalNone') : t('internalHint')}</Typography>
    </div>
  );
}







// -----------------------------------------------------------
// ReviewChoice
// -----------------------------------------------------------
//
// The one checkbox that lets a run go through unattended.
// Unticked — the default — the report stops once the acts
// that apply are decided and waits for a person to approve
// the list; the sentence under the box says so, since the
// label alone names only the exception.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function ReviewChoice({ unattended, onChange }) {
  const t = useTranslations('PAGES.reports.START');
  const hintId = useId();
  return (
    <div className="flex flex-col">
      <FormControlLabel label={t('unattended')}
                        control={<Checkbox checked={unattended} onChange={(e) => onChange(e.target.checked)}
                                           slotProps={{ input: { 'aria-describedby': hintId } }} />} />
      <Typography id={hintId} variant="body2" color="text.secondary">{t('unattendedHint')}</Typography>
    </div>
  );
}







// -----------------------------------------------------------
// useEstimate
// -----------------------------------------------------------
//
// GET /api/reports/estimate for the company, the scope and —
// when `internal` — the company's own requirements; nothing
// is asked until a company is known, nor while the dialog is
// closed (`open` — its pages keep it mounted, and a closed
// dialog shows no price). The dialog reads the answer in two
// places: the estimate block shows it, and the option of the
// company's own requirements learns from it — asked with the
// option or without — whether the company has any
// policy-level document to assess.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function useEstimate(open, companyId, documentIds, internal) {
  const scope = documentIds.join(',');
  const query = `companyId=${companyId}${scope ? `&documentIds=${scope}` : ''}${internal ? '&internal=true' : ''}`;
  return useQuery({
    queryKey: ['reportEstimate', companyId, scope, internal],
    queryFn: async () => (await api.get(`/api/reports/estimate?${query}`)).data,
    enabled: open && Boolean(companyId),
    staleTime: 60_000,
  });
}







// -----------------------------------------------------------
// CostEstimate
// -----------------------------------------------------------
//
// The estimate (useEstimate) of the company and scope: the
// upper bound, the shared corpus part, the part for the
// company's own requirements when the estimate was asked for
// them, the user's remaining budget and the over-budget
// note. The extraction is shared corpus work, so what meets
// the budget is the analysis with the company's own
// requirements (reportUtils chargedUsd).
// With a price unknown the totals count the priced calls
// only: the note says so and the total reads "at least"
// (none when nothing was priced). A failed estimate says
// so, with a retry — starting stays possible.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function CostEstimate({ companyId, estimate }) {

  const t = useTranslations('PAGES.reports.START');
  const fmt = useFormat();
  const { data, isFetching, error, refetch } = estimate;


  if (!companyId) return null;
  if (error) return <ErrorState error={error} onRetry={refetch} title={t('estimateFailed')} />;
  if (!data) return isFetching ? <Typography variant="body2" color="text.secondary">{t('estimating')}</Typography> : null;
  const remaining = data.budget?.remaining;
  const own = ownEstimate(data);
  // A floor over the budget left is over it all the more
  const over = remaining != null && chargedUsd(data) > Number(remaining);
  const floor = Number(data.totalUsd);
  const figures = { total: fmt.usd(data.totalUsd), acts: fmt.number(data.acts), obligations: fmt.number(data.obligations) };


  return (
    <div className="flex flex-col gap-1 rounded bg-canvas p-3" aria-live="polite">
      <Typography variant="subtitle2" component="h3">{t('estimateTitle')}</Typography>
      {isFetching && <LinearProgress className="my-1" />}
      {data.pricesKnown ? <Typography variant="body2">{t('estimate', figures)}</Typography> : (
        <>
          <Typography variant="body2">{t('estimateUnknown')}</Typography>
          {Number.isFinite(floor) && floor > 0 && <Typography variant="body2">{t('estimateFloor', figures)}</Typography>}
        </>
      )}
      {data.extractionUsd > 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('estimateExtraction', { extraction: fmt.usd(data.extractionUsd), acts: (data.actsToExtract || []).join(', ') })}
        </Typography>
      )}
      {own?.documents > 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('estimateInternal', { usd: fmt.usd(own.usd), documents: fmt.number(own.documents), requirements: fmt.number(own.requirements) })}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {remaining == null ? t('budgetUnlimited') : t('budgetLeft', { remaining: fmt.usd(remaining) })}
      </Typography>
      {over && <Alert severity="warning" role="status" className="mt-1">{t('overBudget')}</Alert>}
    </div>
  );
}







// -----------------------------------------------------------
// RunningLink
// -----------------------------------------------------------
//
// Finds the company's report that stands in the way of a new
// one — queued, running, or waiting for its list of acts to
// be approved — and links it, named by which of the two it
// is.
//
// Used by:
//   - StartAnalysisDialog (below)
// -----------------------------------------------------------

function RunningLink({ companyId, onNavigate }) {

  const t = useTranslations('PAGES.reports');


  const { data: running } = useQuery({
    queryKey: ['reports', { companyId }],
    queryFn: async () => (await api.get(`/api/reports?companyId=${companyId}`)).data.reports,
    select: (reports) => reports.find((report) => isActive(report) || isWaiting(report)),
  });


  if (!running) return null;
  return (
    <Button component={Link} to={`/reports/${running.id}`} size="small" onClick={onNavigate}>
      {isWaiting(running) ? t('START.openWaiting') : t('START.openRunning')}
    </Button>
  );
}







// -----------------------------------------------------------
// StartAnalysisDialog (default export)
// -----------------------------------------------------------
//
// The dialog and its form state; `companyId` fixes the
// company (no picker). The start asks for the review of the
// list of acts unless the user ticked it away, and for the
// company's own requirements when the user ticked them in —
// unless the estimate said the company has no policy-level
// document. That is remembered for the company rather than
// read off the estimate at hand: the option decides which
// estimate is asked, so reading it back from there would
// turn the option on again while the next one loads.
//
// Used by:
//   - Reports.jsx — the "new analysis" button
//   - pages/Companies/CompanyDetail.jsx — "run analysis"
//   - ReportDetail.jsx — "run again"
// -----------------------------------------------------------

export default function StartAnalysisDialog({ open, onClose, companyId: fixedCompanyId = null }) {

  const t = useTranslations('PAGES.reports');
  const label = useEnumLabel();
  const locale = useLocale();
  const describe = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState(fixedCompanyId);
  // null = follow the UI language (a switch made after the
  // page loaded included) until the user picks one
  const [pickedLanguage, setPickedLanguage] = useState(null);
  const [documentIds, setDocumentIds] = useState([]);
  // Ticked = run through without the approval of the acts
  const [unattended, setUnattended] = useState(false);
  // Ticked = also assess the company's own requirements
  const [ownRules, setOwnRules] = useState(false);
  // The company an estimate said has no policy-level document
  const [bare, setBare] = useState(null);
  const [tried, setTried] = useState(false);
  const target = fixedCompanyId || companyId;
  const language = pickedLanguage || locale;
  const none = Boolean(target) && bare === target;
  const internal = ownRules && !none;
  const estimate = useEstimate(open, target, documentIds, internal);


  // Every estimate says how many policy-level documents the
  // company has: none switches the option off, from the start
  if (target && bare !== target && policyDocuments(estimate.data) === 0) setBare(target);


  const start = useMutation({
    mutationFn: async () => (await api.post('/api/reports', {
      companyId: target, language, ...(documentIds.length ? { documentIds } : {}), ...(unattended ? {} : { review: true }),
      ...(internal ? { internal: true } : {}),
    }, { silent: true })).data,
    onSuccess: (report) => {
      toast.success(t('START.started'));
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onClose();
      navigate(`/reports/${report.id}`);
    },
  });


  const submit = () => {
    setTried(true);
    if (target) start.mutate();
  };


  const reset = () => {
    setCompanyId(fixedCompanyId);
    setPickedLanguage(null);
    setDocumentIds([]);
    setUnattended(false);
    setOwnRules(false);
    setBare(null);
    setTried(false);
    start.reset();
  };
  const code = start.error ? errorInfo(start.error).code : null;


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={submit} onExited={reset} title={t('START.title')}
                    busy={start.isPending} confirmLabel={t('START.submit')} maxWidth="md">
      <div className="flex flex-col gap-4 pt-2">
        {!fixedCompanyId && <CompanyPicker value={companyId} onChange={setCompanyId} error={tried && !target ? t('START.companyRequired') : null} />}
        <div className="flex flex-col gap-1">
          <Typography variant="body2" color="text.secondary" id="report-language-label">{t('START.language')}</Typography>
          <ToggleButtonGroup exclusive size="small" color="primary" value={language} aria-labelledby="report-language-label"
                             onChange={(_, value) => value && setPickedLanguage(value)}>
            <ToggleButton value="lt" className="px-4">{label('language', 'lt')}</ToggleButton>
            <ToggleButton value="en" className="px-4">{label('language', 'en')}</ToggleButton>
          </ToggleButtonGroup>
        </div>
        <ScopePicker value={documentIds} onChange={setDocumentIds} />
        <Typography variant="body2">{t('START.note')}</Typography>
        <OwnRulesChoice checked={internal} none={none} onChange={setOwnRules} />
        <ReviewChoice unattended={unattended} onChange={setUnattended} />
        <CostEstimate companyId={target} estimate={estimate} />
        {start.error && (
          <Alert severity={code === 'ALREADY_RUNNING' ? 'warning' : 'error'}
                 action={code === 'ALREADY_RUNNING' ? <RunningLink companyId={target} onNavigate={onClose} /> : null}>
            {describe(start.error)}
          </Alert>
        )}
      </div>
    </UniversalModal>
  );
}
