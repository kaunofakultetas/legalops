// -----------------------------------------------------------
//  [*] Jobs — the queue monitor
//
//  A polled table over GET /api/jobs, status and kind
//  filters, a cancel action and a details drawer with the
//  job's steps.
//
//  The page moves on its own. While anything is queued or
//  running — anywhere in the queue, whatever the filters show
//  (GET /api/jobs/counts) — the list, the counts and an open
//  job are asked again every 2 s; an idle queue is looked at
//  every 30 s, a finished job in the drawer not at all. So
//  that the movement is on the first page, the rows come in
//  the order of the work: what runs now, then what waits in
//  the order the worker will take it, then what ended, newest
//  first (a column the user sorts by replaces that). A line
//  above the table says how many jobs run and wait, and that
//  the list renews itself; a running job that has reported
//  nothing yet shows a moving bar.
//
//  The filters live in the address (/jobs?status=failed&
//  kind=report.analyze) — the dashboard's queue counters link
//  straight to one status — and a change replaces the entry
//  rather than piling up history; so do the table's page and
//  sort (?page=2&sort=createdAt.asc). A value the page does
//  not know is ignored. The details drawer is an entry of its
//  own (?job=<id>, useOverlayParam): Back closes it, and the
//  job's subject link followed from inside it comes Back to
//  it open.
//
//  Nothing machine-shaped reaches the screen: kinds, step
//  names, statuses and the result's fields are labelled
//  (ENUMS, RESULT), subjects become "Ataskaita · 1c2d…" with
//  a link to the page — a job about a legal act names the act
//  (the API's subjectTitle) —, the worker's English progress
//  messages are translated (useJobText). Progress is
//  shown only for work still under way: the handlers report
//  up to their last step and never a closing 100 %, so the
//  bar of a finished job would stand at 95 % for good. A job
//  that ended has no bar in the table — its status says how
//  it ended — and the drawer shows a done job's result in
//  place of a progress line, a failed one's last progress
//  beside its error. A failed list query shows its
//  error instead of an empty table (review #7); an empty list
//  says so, and whether the filters emptied it. Rows without
//  an id (or with a repeated one) are left out — the grid
//  cannot show them and they could not be opened or
//  cancelled.
//
//  The drawer reads top to bottom as: what and where (status,
//  subject), when (the stamps, how long it took — counted on
//  while it runs —, the attempts), what the AI cost (calls,
//  tokens in and out, cost as four figures), how far it is
//  (unless done), what went wrong, the steps, the result. A
//  step that ended carries what its model calls used (the
//  runner fills it from the usage log): each step names the
//  prompt version that ran it ("report.summary v3" — the API
//  names it; a bare id would say nothing) and its models with
//  their calls, and, when several steps called a model, its
//  own tokens and cost — a sole step's are the job's total
//  above it (stepUsage.js).
//
//  Split into (root component last):
//
//    STATUSES         — the filter options
//    ACTIVE           — the statuses still cancellable
//    KINDS            — the job kinds the filter offers
//    RESULT_KEYS      — the result fields the handlers write
//    LIVE_MS, IDLE_MS — the two paces of the polls
//    keyedRows        — the rows a grid / list can key
//    workOrder        — the rows in the order of the work
//    activeCount      — how many jobs run or wait
//    jobDuration      — how long a job ran, or has run
//    Filters          — the two dropdowns in the title row
//    QueueLine        — running and waiting, in a line
//    JobProgress      — step name + bar
//    UsageFigures     — calls, tokens and cost as figures
//    StepFacts        — a step's prompt, models and usage
//    StepsList        — the ordered step rows
//    DrawerBody       — the drawer's content for one job
//    JobDetailsDrawer — the right-hand drawer with its query
//    JobsTable        — the grid with the row actions
//    Jobs             — the page (default export)
// -----------------------------------------------------------

import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Drawer from '@mui/material/Drawer';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useJobText from '@/hooks/useJobText';
import useOverlayParam from '@/hooks/useOverlayParam';
import useViewParams from '@/hooks/useViewParams';
import { idParam, oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import StatusChip from '@/components/StatusChip/StatusChip';
import IconAction from '@/components/IconAction/IconAction';
import ErrorState from '@/components/ErrorState/ErrorState';
import EmptyState from '@/components/EmptyState/EmptyState';
import DataTable from '@/components/DataTable/DataTable';
import JsonView from '@/components/JsonView/JsonView';
import { jobUsage, stepUsage } from '@/pages/Jobs/stepUsage';


// The backend's job statuses, in lifecycle order
const STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];

// The statuses a job can still be cancelled (and polled) in
const ACTIVE = ['queued', 'running'];

// The registered job kinds (django …/@register)
const KINDS = ['report.analyze', 'corpus.ingest', 'corpus.extract_obligations', 'corpus.verify_obligations', 'corpus.reembed',
  'corpus.refresh_all', 'documents.index', 'ops.maintenance', 'ops.noop'];

// The fields the registered handlers put in a job's result
// (analysis/pipeline.py, corpus/ingest.py, corpus/obligations
// .py, companies/indexing.py, ops/maintenance.py,
// jobs/handlers.py) — labelled from PAGES.jobs.RESULT; a
// field not listed here is humanised by JsonView
const RESULT_KEYS = ['reportId', 'findings', 'actions', 'version', 'unchanged', 'units', 'articles', 'chunks', 'documents',
  'queued', 'obligations', 'skipped', 'sessions', 'jobs', 'llmCalls', 'orphanFiles', 'rateLimitWindows', 'unusedUploads',
  'steps', 'waitingForBudget', 'resumesAt'];

// How often the list, the counts and an open job are asked
// again while anything is queued or running, and how often
// an idle queue is looked at
const LIVE_MS = 2000;
const IDLE_MS = 30_000;







// -----------------------------------------------------------
// keyedRows
// -----------------------------------------------------------
//
// The rows of a list answer the grid and React can key:
// objects with an id, each id once. Whatever else a
// malformed answer holds (no list at all, a row without an
// id — the DataGrid throws on one —, one id twice) is left
// out.
//
// Used by:
//   - StepsList, Jobs (below)
// -----------------------------------------------------------

function keyedRows(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || typeof row !== 'object' || row.id == null || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}







// -----------------------------------------------------------
// workOrder
// -----------------------------------------------------------
//
// The rows in the order of the work: what runs now, then
// what waits as the worker will take it — the highest
// priority first, the oldest first within one — then what
// ended, in the order the list answers it (newest first).
// The moving part of a long queue is then on the first page
// instead of somewhere behind the jobs still waiting. The
// stamps are compared as text: they come from one serializer
// in one shape, and as dates they would lose the
// microseconds that tell jobs queued in one go apart.
//
// Used by:
//   - Jobs (below)
// -----------------------------------------------------------

function workOrder(rows) {
  const waiting = rows.filter((row) => row.status === 'queued').sort((a, b) => {
    const priority = (Number(b.priority) || 0) - (Number(a.priority) || 0);
    const first = String(a.createdAt ?? '');
    const second = String(b.createdAt ?? '');
    return priority || (first < second ? -1 : first > second ? 1 : 0);
  });
  return [...rows.filter((row) => row.status === 'running'), ...waiting, ...rows.filter((row) => !ACTIVE.includes(row.status))];
}







// -----------------------------------------------------------
// activeCount
// -----------------------------------------------------------
//
// How many jobs are queued or running by the counts answer;
// 0 for an answer that has not come, or holds no numbers.
//
// Used by:
//   - Jobs (below)
// -----------------------------------------------------------

function activeCount(counts) {
  return (Number(counts?.queued) || 0) + (Number(counts?.running) || 0);
}







// -----------------------------------------------------------
// jobDuration
// -----------------------------------------------------------
//
// How long the job ran, in milliseconds: from its start to
// its end, or — while it runs — to `now`, the moment of the
// last answer, so the figure counts on with every poll. Null
// for a job that never started, or whose stamps cannot be
// read; a clock that disagrees with the server's never makes
// it negative.
//
// Used by:
//   - DrawerBody (below)
// -----------------------------------------------------------

function jobDuration(job, now) {
  const started = Date.parse(job.startedAt);
  const ended = job.finishedAt ? Date.parse(job.finishedAt) : (job.status === 'running' ? now : NaN);
  return Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : null;
}







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// "" means every status / kind.
//
// Used by:
//   - Jobs (below)
// -----------------------------------------------------------

function Filters({ status, kind, onStatus, onKind }) {

  const t = useTranslations('PAGES.jobs');
  const label = useEnumLabel();


  return (
    <>
      <TextField select size="small" label={t('FILTER.kind')} value={kind} onChange={(e) => onKind(e.target.value)} sx={{ minWidth: 200 }}>
        <MenuItem value="">{t('FILTER.all')}</MenuItem>
        {KINDS.map((k) => <MenuItem key={k} value={k}>{label('jobKind', k)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t('FILTER.status')} value={status} onChange={(e) => onStatus(e.target.value)} sx={{ minWidth: 160 }}>
        <MenuItem value="">{t('FILTER.all')}</MenuItem>
        {STATUSES.map((s) => <MenuItem key={s} value={s}>{label('jobStatus', s)}</MenuItem>)}
      </TextField>
    </>
  );
}







// -----------------------------------------------------------
// QueueLine
// -----------------------------------------------------------
//
// The queue in a line while anything runs or waits: how many
// jobs of each, under the chips the rows wear, and how often
// the list renews itself. An idle queue draws nothing. It is
// plain text, not a live region: it changes with every poll,
// and a screen reader would read each change out.
//
// Used by:
//   - Jobs (below)
// -----------------------------------------------------------

function QueueLine({ counts }) {

  const t = useTranslations('PAGES.jobs');
  const label = useEnumLabel();
  const fmt = useFormat();


  if (activeCount(counts) === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted mb-3">
      {['running', 'queued'].map((status) => (
        <span key={status} className="flex items-center gap-1.5">
          <StatusChip value={status} label={label('jobStatus', status)} />
          <span className="text-content font-semibold tabular-nums">{fmt.number(Number(counts[status]) || 0)}</span>
        </span>
      ))}
      <span>{t('QUEUE.refresh', { seconds: fmt.number(LIVE_MS / 1000) })}</span>
    </div>
  );
}







// -----------------------------------------------------------
// JobProgress
// -----------------------------------------------------------
//
// The current step line and, when the handler reports a
// percentage, a determinate bar named by that line.
//
// Used by:
//   - DrawerBody (below)
// -----------------------------------------------------------

function JobProgress({ progress }) {
  const text = useJobText();
  if (!progress?.step) return null;
  return (
    <div className="flex flex-col gap-1">
      <Typography variant="body2">{text.progress(progress)}</Typography>
      {progress.percent != null && <LinearProgress variant="determinate" value={progress.percent} aria-label={text.progress(progress)} />}
    </div>
  );
}







// -----------------------------------------------------------
// UsageFigures
// -----------------------------------------------------------
//
// What the job's model calls used, as four figures under
// their names: calls, tokens in, tokens out and cost — two a
// row on a phone.
//
// Used by:
//   - DrawerBody (below)
// -----------------------------------------------------------

function UsageFigures({ usage }) {

  const t = useTranslations('PAGES.jobs');
  const fmt = useFormat();
  const figures = [
    [t('DETAILS.calls'), fmt.number(usage.calls)],
    [t('DETAILS.tokensIn'), fmt.number(usage.inputTokens)],
    [t('DETAILS.tokensOut'), fmt.number(usage.outputTokens)],
    [t('DETAILS.cost'), fmt.usd(usage.costUsd)],
  ];


  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 m-0">
      {figures.map(([name, value]) => (
        <div key={name}>
          <dt className="text-xs text-muted">{name}</dt>
          <dd className="m-0 font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}







// -----------------------------------------------------------
// StepFacts
// -----------------------------------------------------------
//
// What ran the step, as a small list under its line: the
// prompt version by name, the models — each with its number
// of calls, most used first; a step without counted calls
// shows only the model its handler named (an embedding
// step) — and, with `numbers`, the step's own tokens and
// cost. Nothing for a step that has none of these; a
// malformed `prompt` is left out.
//
// Used by:
//   - StepsList (below)
// -----------------------------------------------------------

function StepFacts({ step, numbers }) {

  const t = useTranslations('PAGES.jobs');
  const fmt = useFormat();
  const usage = stepUsage(step);
  const named = step.prompt && typeof step.prompt.slug === 'string' && step.prompt.slug && Number.isInteger(step.prompt.version);
  const models = usage?.models.length > 0
    ? usage.models.map((entry) => `${entry.model} × ${fmt.number(entry.calls)}`)
    : (step.model ? [String(step.model)] : []);
  const facts = [
    named && [t('DETAILS.prompt'), `${step.prompt.slug} v${step.prompt.version}`],
    models.length > 0 && [t(models.length > 1 ? 'DETAILS.models' : 'DETAILS.model'), models.map((model) => <div key={model}>{model}</div>)],
    usage && numbers && [t('DETAILS.tokens'), t('DETAILS.tokensValue', { input: fmt.number(usage.inputTokens), output: fmt.number(usage.outputTokens) })],
    usage && numbers && [t('DETAILS.cost'), fmt.usd(usage.costUsd)],
  ].filter(Boolean);


  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs m-0 mt-1.5">
      {facts.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-muted">{name}</dt>
          <dd className="m-0 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}







// -----------------------------------------------------------
// StepsList
// -----------------------------------------------------------
//
// One row per JobStep: status pill, name and duration, then
// what ran it and, below, its error. A step shows its own
// tokens and cost only when several steps called a model.
//
// Used by:
//   - DrawerBody (below)
// -----------------------------------------------------------

function StepsList({ steps }) {

  const t = useTranslations('PAGES.jobs');
  const label = useEnumLabel();
  const fmt = useFormat();
  const rows = keyedRows(steps);
  const several = rows.filter((step) => stepUsage(step)).length > 1;


  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">{t('DETAILS.noSteps')}</Typography>;
  return (
    <ol className="divide-y divide-edge text-sm m-0 p-0 list-none">
      {rows.map((step) => (
        <li key={step.id} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip value={step.status} label={label('stepStatus', step.status)} />
            <span className="font-semibold">{label('stepName', step.name)}</span>
            <span className="ml-auto text-muted tabular-nums">{fmt.duration(step.durationMs)}</span>
          </div>
          <StepFacts step={step} numbers={several} />
          {step.error && <div className="text-red-700 text-xs mt-1.5 whitespace-pre-wrap">{step.error}</div>}
        </li>
      ))}
    </ol>
  );
}







// -----------------------------------------------------------
// DrawerBody
// -----------------------------------------------------------
//
// The drawer's content, in the order of the header's story:
// status and subject; the stamps, the duration (to `now`
// while the job runs) and the attempts, two pairs a row from
// a tablet up; the AI usage over the steps listed, once a
// step recorded model calls; the progress, unless the job is
// done; the error; the steps; the result, its fields
// labelled. A cancel that is still pending is a note (role
// "status"), not an alarm.
//
// Used by:
//   - JobDetailsDrawer (below)
// -----------------------------------------------------------

function DrawerBody({ job, now }) {

  const t = useTranslations('PAGES.jobs');
  const tResult = useTranslations('PAGES.jobs.RESULT');
  const label = useEnumLabel();
  const text = useJobText();
  const fmt = useFormat();
  const subject = text.subject(job.subject, job.subjectTitle);
  const resultLabels = Object.fromEntries(RESULT_KEYS.map((key) => [key, tResult(key)]));
  const total = jobUsage(keyedRows(job.steps));
  const facts = [
    [t('DETAILS.created'), fmt.dateTime(job.createdAt)],
    [t('DETAILS.started'), fmt.dateTime(job.startedAt)],
    [t('DETAILS.finished'), fmt.dateTime(job.finishedAt)],
    [t('DETAILS.duration'), fmt.duration(jobDuration(job, now))],
    [t('DETAILS.attempts'), `${job.attempts} / ${job.maxAttempts}`],
  ];


  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip value={job.status} label={label('jobStatus', job.status)} />
        {subject.to
          ? <Link to={subject.to} className="text-sm text-primary [overflow-wrap:anywhere]">{subject.label}</Link>
          : <span className="text-sm text-muted [overflow-wrap:anywhere]">{subject.label}</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1.5 text-sm m-0">
        {facts.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted">{name}</dt>
            <dd className="m-0 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {job.cancelRequested && ACTIVE.includes(job.status) && <Alert severity="info" role="status">{t('DETAILS.cancelRequested')}</Alert>}
      {job.status !== 'done' && <JobProgress progress={job.progress} />}
      {job.error && <pre className="text-xs whitespace-pre-wrap bg-red-50 text-red-800 p-2 rounded m-0">{job.error}</pre>}
      {total && (
        <section className="flex flex-col gap-2 border-t border-edge pt-4">
          <Typography variant="subtitle2" component="h3">{t('DETAILS.total')}</Typography>
          <UsageFigures usage={total} />
        </section>
      )}
      <section className="flex flex-col gap-2 border-t border-edge pt-4">
        <Typography variant="subtitle2" component="h3">{t('DETAILS.steps')}</Typography>
        <StepsList steps={job.steps} />
      </section>
      {job.result && (
        <section className="flex flex-col gap-2 border-t border-edge pt-4">
          <Typography variant="subtitle2" component="h3">{t('DETAILS.result')}</Typography>
          <JsonView value={job.result} labels={resultLabels} className="bg-canvas p-2 rounded" />
        </section>
      )}
    </>
  );
}







// -----------------------------------------------------------
// JobDetailsDrawer
// -----------------------------------------------------------
//
// Owns the GET /api/jobs/{id} query; asks again every 2 s
// while the job is queued or running and stops once it is
// final; the moment of the last answer goes down as the
// "now" a running job's duration is counted to. The drawer
// is labelled by its title and has its own close button.
// `jobId` comes from the address (?job=), already screened
// by idParam, and is encoded into the path all the same.
//
// Used by:
//   - Jobs (below)
// -----------------------------------------------------------

function JobDetailsDrawer({ jobId, onClose }) {

  const t = useTranslations('PAGES.jobs');
  const label = useEnumLabel();
  const titleId = useId();


  const { data: job, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: async () => (await api.get(`/api/jobs/${encodeURIComponent(jobId)}`)).data,
    enabled: Boolean(jobId),
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.status) ? LIVE_MS : false),
  });


  return (
    <Drawer anchor="right" open={Boolean(jobId)} onClose={onClose} slotProps={{ paper: { 'aria-labelledby': titleId } }}>
      <div className="w-[36rem] max-w-[100vw] p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <Typography id={titleId} variant="h6" component="h2">
            {t('DETAILS.title')}{job ? `: ${label('jobKind', job.kind)}` : ''}
          </Typography>
          <IconAction label={t('DETAILS.close')} icon={<CloseIcon />} onClick={onClose} />
        </div>
        {isLoading && <div className="flex justify-center py-8"><CircularProgress aria-label={t('DETAILS.title')} /></div>}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {job && <DrawerBody job={job} now={dataUpdatedAt} />}
      </div>
    </Drawer>
  );
}







// -----------------------------------------------------------
// JobsTable
// -----------------------------------------------------------
//
// The grid; cancel is enabled only for queued/running rows.
// The subject names the act a job is about. The progress
// cell is for work under way only — a job that ended shows
// none, its status says how it ended —: a reported
// percentage as a bar, a
// step without one as its name, and for a running job that
// has reported nothing yet — an extraction says its first
// word when its first batch is back, minutes in — a moving
// bar, so the row shows the job is alive. Columns are
// memoised — they only change with the locale.
//
// Used by:
//   - Jobs (below)
// -----------------------------------------------------------

function JobsTable({ jobs, loading, onDetails, onCancel }) {

  const t = useTranslations('PAGES.jobs');
  const label = useEnumLabel();
  const text = useJobText();
  const fmt = useFormat();


  const columns = useMemo(() => [
    { field: 'kind', headerName: t('COLUMNS.kind'), width: 210, valueFormatter: (value) => label('jobKind', value) },
    { field: 'subject', headerName: t('COLUMNS.subject'), flex: 1, minWidth: 180,
      valueGetter: (value, row) => text.subject(value, row.subjectTitle).label,
      renderCell: ({ row, value }) => {
        const subject = text.subject(row.subject, row.subjectTitle);
        return subject.to ? <Link to={subject.to} className="text-primary">{value}</Link> : value;
      } },
    { field: 'status', headerName: t('COLUMNS.status'), width: 130,
      renderCell: ({ value }) => <StatusChip value={value} label={label('jobStatus', value)} /> },
    { field: 'progress', headerName: t('COLUMNS.progress'), width: 170, sortable: false,
      renderCell: ({ row, value }) => {
        if (!ACTIVE.includes(row.status)) return '';
        if (value?.percent != null) {
          return (
            <div className="w-full pt-4">
              <LinearProgress variant="determinate" value={value.percent} aria-label={text.progress(value)} />
            </div>
          );
        }
        if (value?.step) return label('stepName', value.step);
        return row.status === 'running'
          ? <div className="w-full pt-4"><LinearProgress aria-label={label('jobStatus', 'running')} /></div>
          : '';
      } },
    { field: 'createdAt', headerName: t('COLUMNS.created'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
    { field: 'finishedAt', headerName: t('COLUMNS.finished'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
    { field: 'actions', headerName: t('COLUMNS.actions'), width: 100, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <div className="flex">
          <IconAction label={t('ACTIONS.details')} icon={<InfoOutlinedIcon fontSize="small" />} onClick={() => onDetails(row.id)} />
          <IconAction label={t('ACTIONS.cancel')} icon={<CancelOutlinedIcon fontSize="small" />}
                      disabled={!ACTIVE.includes(row.status)} onClick={() => onCancel(row.id)} />
        </div>
      ) },
  ], [t, label, text, fmt, onDetails, onCancel]);


  return (
    <DataTable rows={jobs} columns={columns} loading={loading} label={t('TITLE')} persist
               mobileHidden={['progress', 'createdAt', 'finishedAt']} />
  );
}







// -----------------------------------------------------------
// Jobs (default export)
// -----------------------------------------------------------
//
// Owns the filters (read from and written to the address),
// the counts and the list queries — both asked at the live
// pace while the counts, or the list itself before they
// arrive, show a job queued or running —, the job whose
// drawer is open (?job=) and the cancel mutation. A failed
// counts request only leaves the line out: the list has its
// own error.
//
// Used by:
//   - router.jsx — route /jobs
// -----------------------------------------------------------

export default function Jobs({ authData }) {

  const t = useTranslations('PAGES.jobs');
  const queryClient = useQueryClient();
  const [params, setView] = useViewParams();
  const status = oneOf(params.get('status'), STATUSES);
  const kind = oneOf(params.get('kind'), KINDS);
  const [selected, openDetails, closeDetails] = useOverlayParam('job', idParam);


  // "" drops the filter from the address — and the table's
  // page, which belonged to the old list
  const setFilter = (name, value) => setView({ [name]: value, page: null });


  // The whole queue, whatever the filters show
  const counts = useQuery({
    queryKey: ['jobs', 'counts'],
    queryFn: async () => (await api.get('/api/jobs/counts')).data,
    refetchInterval: (query) => (activeCount(query.state.data) > 0 ? LIVE_MS : IDLE_MS),
  });
  const busy = activeCount(counts.data) > 0;


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', 'list', status, kind],
    queryFn: async () => {
      const query = new URLSearchParams({ limit: '200' });
      if (status) query.set('status', status);
      if (kind) query.set('kind', kind);
      return (await api.get(`/api/jobs?${query}`)).data.jobs;
    },
    refetchInterval: (query) => (busy || keyedRows(query.state.data).some((j) => ACTIVE.includes(j.status)) ? LIVE_MS : IDLE_MS),
  });
  const jobs = useMemo(() => workOrder(keyedRows(data)), [data]);


  // Refreshed however it ended: after a 409 NOT_CANCELLABLE
  // (the job finished meanwhile) the row must stop showing
  // it as running, with a cancel button
  const cancel = useMutation({
    mutationFn: (id) => api.post(`/api/jobs/${id}/cancel`),
    onSuccess: () => toast.success(t('TOASTS.cancelled')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}
                actions={<Filters status={status} kind={kind} onStatus={(value) => setFilter('status', value)} onKind={(value) => setFilter('kind', value)} />}>
      <QueueLine counts={counts.data} />
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && jobs.length === 0 && (
        <EmptyState icon={PendingActionsOutlinedIcon} title={status || kind ? t('emptyFiltered') : t('empty')} />
      )}
      {!error && (isLoading || jobs.length > 0) && (
        <JobsTable jobs={jobs} loading={isLoading} onDetails={openDetails} onCancel={cancel.mutate} />
      )}
      <JobDetailsDrawer jobId={selected} onClose={closeDetails} />
    </PageLayout>
  );
}
