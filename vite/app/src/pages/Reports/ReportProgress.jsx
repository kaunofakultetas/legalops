// -----------------------------------------------------------
//  [*] ReportProgress — a running analysis, step by step
//
//  Shown while the report is queued or running. The report
//  itself (polled by ReportDetail) carries the job's live
//  progress {step, percent, message}; the job (GET
//  /api/jobs/{jobId}, polled here every 3 s) carries the
//  finished steps with their durations. A user sees only the
//  jobs they started, so for a report an admin started the
//  job is a 404 — the card then shows the report's own
//  progress line and says why the steps are missing. Any
//  other failure of the job is shown as the failure it is
//  (the poll goes on and clears it once an answer lands).
//
//  The overall bar counts finished steps plus the running
//  step's percentage out of the steps of this run
//  (reportSteps — the citation audit among them, and the
//  assessment of the company's own requirements only for a
//  report started with it: listed for any other, the step
//  would stay "waiting" to the end and hold the bar back).
//  Until the job's steps are known (or when they are hidden)
//  the report's own progress stands in: the steps before the
//  one it names are done. The elapsed time ticks every
//  second, and neither it nor a step's duration shows a part
//  of a second; a requested cancel is a status note.
//
//  A report made with the review of its list of acts runs
//  in two parts, each a job of its own, with a person's
//  approval between them. The second job knows nothing of
//  the first one's steps, so once the list is approved the
//  steps up to the applicability verdicts count as done
//  whatever the job says of them (it reads the documents
//  again, and that record wins while it lasts), and the
//  elapsed time counts from the approval — not across the
//  hours the report may have waited.
//
//  A step that ended with model calls names its model and
//  what it cost, and the card sums the cost so far — the
//  runner records a step's usage when the step ends, so the
//  running step joins the sum once it is done
//  (pages/Jobs/stepUsage.js).
//
//  Split into (root component last):
//
//    FIRST_PART     — the steps before the approval
//    StepIcon       — done / running / failed / waiting
//    useElapsed     — a ticking "2 min 5 s"
//    ReportProgress — the card (default export)
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useJobText from '@/hooks/useJobText';
import { errorInfo } from '@/utils/errors';
import ErrorState from '@/components/ErrorState/ErrorState';
import SectionCard from '@/components/SectionCard/SectionCard';
import { jobUsage, stepUsage } from '@/pages/Jobs/stepUsage';
import { PIPELINE_STEPS, reportSteps } from '@/pages/Reports/reportUtils';


// The steps of a run's first part — everything up to the
// applicability verdicts, after which a reviewed report
// waits for its list of acts to be approved
const FIRST_PART = PIPELINE_STEPS.slice(0, PIPELINE_STEPS.indexOf('applicability') + 1);







// -----------------------------------------------------------
// StepIcon
// -----------------------------------------------------------
//
// The step's state as a shape (the label says it too).
//
// Used by:
//   - ReportProgress (below)
// -----------------------------------------------------------

function StepIcon({ status }) {
  if (status === 'done') return <CheckCircleIcon color="success" fontSize="small" aria-hidden />;
  if (status === 'failed') return <ErrorIcon color="error" fontSize="small" aria-hidden />;
  if (status === 'running') {
    return <span className="inline-flex w-5 justify-center"><CircularProgress size={16} thickness={6} disableShrink aria-hidden /></span>;
  }
  return <RadioButtonUncheckedIcon color="disabled" fontSize="small" aria-hidden />;
}







// -----------------------------------------------------------
// useElapsed
// -----------------------------------------------------------
//
// Milliseconds since `since`, re-rendering every second.
//
// Used by:
//   - ReportProgress (below)
// -----------------------------------------------------------

function useElapsed(since) {

  const [now, setNow] = useState(() => Date.now());


  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);


  return since ? Math.max(0, now - new Date(since).getTime()) : null;
}







// -----------------------------------------------------------
// ReportProgress (default export)
// -----------------------------------------------------------
//
// The card of a queued or running report; `action` is the
// page's stop button, shown in the card's header. A reviewed
// report past its approval is in its second part: its first
// part's steps are done and its clock starts at the approval.
//
// Used by:
//   - ReportDetail.jsx — while the analysis is active
// -----------------------------------------------------------

export default function ReportProgress({ report, action }) {

  const t = useTranslations('PAGES.report.PROGRESS');
  const label = useEnumLabel();
  const text = useJobText();
  const fmt = useFormat();
  const secondPart = Boolean(report.scope?.review && report.scopeApprovedAt);
  const elapsed = useElapsed(secondPart ? report.scopeApprovedAt : report.startedAt || report.createdAt);


  const { data: job, error } = useQuery({
    queryKey: ['jobs', report.jobId],
    queryFn: async () => (await api.get(`/api/jobs/${report.jobId}`)).data,
    enabled: Boolean(report.jobId),
    refetchInterval: 3000,
    retry: false,
  });


  const steps = Array.isArray(job?.steps) ? job.steps.filter((step) => step && typeof step === 'object') : null;
  const latest = Object.fromEntries((steps || []).map((step) => [step.name, step]));
  const current = report.progress?.step;
  // The steps this run goes through, in order
  const names = reportSteps(report);
  const currentIndex = names.indexOf(current);
  // A step's state: the job's own record, else what the
  // report's progress implies (the running step, and — while
  // the job's steps are unknown — the steps before it done)
  const stateOf = (name) => {
    if (latest[name]?.status) return latest[name].status;
    if (name === current && report.status === 'running') return 'running';
    if (secondPart && FIRST_PART.includes(name)) return 'done';
    if (!steps && currentIndex > names.indexOf(name)) return 'done';
    return 'pending';
  };
  const percent = Number(report.progress?.percent);
  const doneCount = names.filter((name) => stateOf(name) === 'done').length;
  const runningPercent = stateOf(current) === 'running' && report.progress?.percent != null && Number.isFinite(percent) ? percent / 100 : 0;
  const overall = Math.round(((doneCount + runningPercent) / names.length) * 100);
  const hidden = error && errorInfo(error).status === 404;
  const spent = jobUsage(steps);


  return (
    <SectionCard title={t('title')} actions={action}>
      <div className="flex flex-col gap-3 max-w-2xl" aria-live="polite">
        <Typography variant="body2">{report.status === 'queued' ? t('queued') : t('running')}</Typography>
        {report.status === 'queued'
          ? <LinearProgress aria-label={t('title')} />
          : <LinearProgress variant="determinate" value={overall} aria-label={t('title')} />}
        <div className="flex justify-between gap-2 flex-wrap text-sm">
          <span>{text.progress(report.progress)}</span>
          {elapsed != null && <span className="text-muted">{t('elapsed', { time: fmt.duration(elapsed, { whole: true }) })}</span>}
        </div>
        {job?.cancelRequested && <Alert severity="info" role="status">{t('cancelRequested')}</Alert>}
        <Typography variant="subtitle2" component="h3">{t('steps')}</Typography>
        {hidden && <Typography variant="body2" color="text.secondary">{t('stepsHidden')}</Typography>}
        {error && !hidden && <ErrorState error={error} />}
        <ol className="m-0 p-0 list-none flex flex-col gap-2">
          {names.map((name) => {
            const step = latest[name];
            const status = stateOf(name);
            const usage = stepUsage(step);
            return (
              <li key={name} className="flex items-center gap-2 text-sm flex-wrap">
                <StepIcon status={status} />
                <span className={status === 'pending' ? 'text-muted' : ''}>{label('stepName', name)}</span>
                <span className="sr-only">{status === 'pending' ? '' : label('stepStatus', status)}</span>
                {usage && <span className="text-muted text-xs [overflow-wrap:anywhere]">{[step.model, fmt.usd(usage.costUsd)].filter(Boolean).join(' · ')}</span>}
                {step?.durationMs != null && <span className="ml-auto text-muted">{fmt.duration(step.durationMs, { whole: true })}</span>}
              </li>
            );
          })}
        </ol>
        {spent && <Typography variant="body2" color="text.secondary">{t('spent', { cost: fmt.usd(spent.costUsd) })}</Typography>}
      </div>
    </SectionCard>
  );
}
