// -----------------------------------------------------------
//  [*] ProductProgress — a generation, step by step
//
//  Shown while a product is queued or running. A generation
//  takes about five minutes and has four steps: the documents
//  are read, the kind's two parts are written (the policy and
//  the missing documents; the structure, then the process
//  and the RACI matrix; the criteria, then the scenarios),
//  and every reference is checked (KIND_STEPS).
//
//  The product itself (polled by the page) carries the job's
//  progress {step, percent, message}: the step that is
//  running and how far through a run that step begins. The
//  job (GET /api/jobs/{id}, polled here every 3 s) carries
//  the finished steps with their durations and what their
//  model calls cost. A step the job has a record of shows
//  that record; for the others the product's progress
//  decides — the steps before the one it names are done,
//  that one is running, the rest wait. A user sees only the
//  jobs they started, so for a product somebody else started
//  the job is a 404: the card then goes by the product's
//  progress alone and says why the durations are missing.
//  Any other failure of the job is shown as the failure it
//  is; the poll goes on.
//
//  The bar shows the progress's percentage, or — when the
//  product names none — the finished steps out of the
//  kind's four. The elapsed time ticks every second. The
//  card sums the cost so far (pages/Jobs/stepUsage.js). A
//  requested stop is a status note.
//
//  Split into (root component last):
//
//    StepIcon        — done / running / failed / waiting
//    useElapsed      — a ticking duration
//    ProductProgress — the card (default export)
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
import { errorInfo } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import ErrorState from '@/components/ErrorState/ErrorState';
import SectionCard from '@/components/SectionCard/SectionCard';
import { jobUsage, stepUsage } from '@/pages/Jobs/stepUsage';
import { listOf, runProgress } from '@/pages/Programme/programmeUtils';







// -----------------------------------------------------------
// StepIcon
// -----------------------------------------------------------
//
// A step's state as a shape; the row says it in words too.
//
// Used by:
//   - ProductProgress (below)
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
// The milliseconds since a moment, counted anew every
// second; nothing while the moment is not known.
//
// Used by:
//   - ProductProgress (below)
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
// ProductProgress (default export)
// -----------------------------------------------------------
//
// The card of a queued or running product; `action` is the
// page's stop button, shown in the card's header.
//
// Used by:
//   - ProductPage.jsx — while the generation is on its way
// -----------------------------------------------------------

export default function ProductProgress({ product, action }) {

  const t = useTranslations('PAGES.programme.PROGRESS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const elapsed = useElapsed(product.startedAt || product.createdAt);
  const { steps: names, index: current, percent: reported } = runProgress(product);


  const { data: job, error } = useQuery({
    queryKey: ['jobs', product.jobId],
    queryFn: async () => (await api.get(`/api/jobs/${product.jobId}`)).data,
    enabled: Boolean(product.jobId),
    refetchInterval: 3000,
    retry: false,
  });


  const steps = Array.isArray(job?.steps) ? listOf(job.steps) : null;
  const latest = Object.fromEntries((steps || []).map((step) => [step.name, step]));
  // A step's state: the job's own record, else what the
  // product's progress says of it
  const stateOf = (name) => {
    if (latest[name]?.status) return latest[name].status;
    if (current > names.indexOf(name)) return 'done';
    if (current === names.indexOf(name) && product.status === 'running') return 'running';
    return 'pending';
  };
  const done = names.filter((name) => stateOf(name) === 'done').length;
  const percent = reported ?? (names.length ? Math.round((done / names.length) * 100) : 0);
  const hidden = error && errorInfo(error).status === 404;
  const spent = jobUsage(steps);


  return (
    <SectionCard title={t('title')} actions={action}>
      <div className="flex flex-col gap-3 max-w-2xl" aria-live="polite">
        <Typography variant="body2">{product.status === 'queued' ? t('queued') : t('running')}</Typography>
        {product.status === 'queued'
          ? <LinearProgress aria-label={t('title')} />
          : <LinearProgress variant="determinate" value={percent} aria-label={t('title')} />}
        <div className="flex justify-between gap-2 flex-wrap text-sm">
          <span>{t('stepOf', { done, total: names.length })}</span>
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
                <span className={status === 'pending' ? 'text-muted' : ''}>{t(`STEPS.${name}`)}</span>
                <span className="sr-only">{status === 'pending' ? '' : label('stepStatus', status)}</span>
                {usage && <span className="text-muted text-xs">{fmt.usd(usage.costUsd)}</span>}
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
