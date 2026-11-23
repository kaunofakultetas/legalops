// -----------------------------------------------------------
//  [*] Dashboard — the landing overview
//
//  What needs attention, at a glance: a KPI row (companies,
//  finished reports, running analyses, ready legal acts, and
//  for admins the obligations waiting for review and the
//  users), today's AI budget as a meter, the latest reports
//  and companies, the corpus health (acts with ingestion
//  errors listed), and the job queue — exact queued / running
//  / failed counts (GET /api/jobs/counts), each linking to the
//  jobs page filtered to that status, with the latest jobs.
//  The admin-only tiles ask routes a plain user never calls.
//
//  Every section owns its query and shows its own error
//  (review #7): a failed request is never an empty list, and
//  one failed section never takes the others down. A tile
//  whose count comes from a section's query shows "—" and
//  leaves the error to that section; the admin-only tiles,
//  which have no section, show theirs in the tile's place.
//  Lists key their rows by id and leave out rows without one
//  (or with a repeated one), so a malformed answer cannot
//  break them. The queue polls every 10 s, the reports while
//  an analysis is still going; the rest refetch on focus.
//
//  Split into (root component last):
//
//    QUEUE_STATUSES  — the statuses the queue card counts
//    keyedRows       — the rows of a list answer React can key
//    KpiTile         — a tile with a query of its own
//    KpiRow          — the headline tiles
//    BudgetCard      — today's AI budget
//    RecentReports   — the newest reports
//    RecentCompanies — the newest companies
//    CorpusHealth    — ready / processing / failed acts
//    JobQueue        — the queue counters and latest jobs
//    Dashboard       — the page (default export)
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import HourglassTopOutlinedIcon from '@mui/icons-material/HourglassTopOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useJobText from '@/hooks/useJobText';
import PageLayout from '@/components/layout/PageLayout';
import SectionCard from '@/components/SectionCard/SectionCard';
import ErrorState from '@/components/ErrorState/ErrorState';
import StatusChip from '@/components/StatusChip/StatusChip';
import Meter from '@/components/charts/Meter';
import StatTile from '@/components/charts/StatTile';
import { isActive, isWaiting, reportTitle } from '@/pages/Reports/reportUtils';


// The job statuses the queue card counts, in its order; each
// counter links to the jobs page filtered to its status
const QUEUE_STATUSES = ['queued', 'running', 'failed'];







// -----------------------------------------------------------
// keyedRows
// -----------------------------------------------------------
//
// The rows of a list answer React can key: objects with an
// id, each id once. Whatever else a malformed answer holds
// (no list at all, a row without an id, one id twice) is
// left out rather than breaking the list's keys.
//
// Used by:
//   - KpiRow, RecentReports, RecentCompanies, CorpusHealth,
//     JobQueue, Dashboard (below)
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
// KpiTile
// -----------------------------------------------------------
//
// A headline tile whose count comes from a query no section
// below shows: the count (already formatted, "—" until it
// lands), or — when that query failed — the failure in the
// tile's place, titled with the tile's label and with its
// own retry, so a failed count never passes for a missing
// one.
//
// Used by:
//   - KpiRow (below) — the admin-only tiles
// -----------------------------------------------------------

function KpiTile({ label, query, count, to, symbol }) {
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} title={label} />;
  return <StatTile label={label} value={count} to={to} symbol={symbol} />;
}







// -----------------------------------------------------------
// KpiRow
// -----------------------------------------------------------
//
// The headline tiles; each tile links to its page and wears
// that page's icon from the navigation — the running
// analyses an hourglass, so the two report tiles differ. A
// report waiting for its list of acts to be approved is
// neither finished nor running: the running tile names how
// many wait under its number, since they wait for the user.
// The counts of the section queries (companies, reports,
// acts) show "—" until those land — or when they failed,
// which their section says. The admin-only tiles ask the
// admin-only routes, and only for an admin.
//
// Used by:
//   - Dashboard (below)
// -----------------------------------------------------------

function KpiRow({ isAdmin, companies, reports, acts }) {

  const t = useTranslations('PAGES.dashboard.KPI');
  const fmt = useFormat();


  const toReview = useQuery({
    queryKey: ['obligations', 'count', 'proposed'],
    queryFn: async () => (await api.get('/api/obligations?status=proposed&limit=1')).data.total,
    enabled: isAdmin,
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/api/users')).data.users,
    enabled: isAdmin,
  });


  // undefined (not landed) stays unknown — never a zero
  const listed = (data) => (data === undefined ? null : keyedRows(data));
  const reportRows = listed(reports);
  const waiting = reportRows?.filter(isWaiting).length;
  const inUse = listed(acts)?.filter((a) => a.enabled !== false);
  const ready = inUse?.filter((a) => a.currentVersion?.status === 'ready').length;
  const count = (value) => (value == null ? '—' : fmt.number(value));


  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 ${isAdmin ? 'xl:grid-cols-6' : ''} gap-3`}>
      <StatTile label={t('companies')} value={count(listed(companies)?.length)} to="/companies" symbol={<BusinessOutlinedIcon />} />
      <StatTile label={t('reportsDone')} value={count(reportRows?.filter((r) => r.status === 'done').length)} to="/reports"
                symbol={<AssessmentOutlinedIcon />} />
      <StatTile label={t('reportsRunning')} value={count(reportRows?.filter(isActive).length)} to="/reports"
                sub={waiting ? t('reportsWaiting', { count: fmt.number(waiting) }) : null} symbol={<HourglassTopOutlinedIcon />} />
      <StatTile label={t('acts')} value={count(ready)} sub={inUse ? t('actsSub', { total: fmt.number(inUse.length) }) : null} to="/corpus"
                symbol={<GavelOutlinedIcon />} />
      {isAdmin && <KpiTile label={t('toReview')} query={toReview} count={count(toReview.data)} to="/obligations"
                           symbol={<FactCheckOutlinedIcon />} />}
      {isAdmin && <KpiTile label={t('users')} query={users} count={count(listed(users.data)?.length)} to="/users"
                           symbol={<PeopleOutlineIcon />} />}
    </div>
  );
}







// -----------------------------------------------------------
// BudgetCard
// -----------------------------------------------------------
//
// The signed-in account's AI budget for today (the budget of
// GET /api/usage?days=1) as a meter — "unlimited" when the
// limit is 0, an admin's default — or the query's failure
// with a retry. Nothing while the first answer is on its way.
//
// Used by:
//   - Dashboard (below)
// -----------------------------------------------------------

function BudgetCard({ query }) {

  const t = useTranslations('PAGES.dashboard');
  const fmt = useFormat();
  const budget = query.data?.budget;
  const format = (value) => (budget?.unit === 'USD' ? fmt.usd(value) : fmt.tokens(value));


  if (!query.error && !budget) return null;
  return (
    <SectionCard title={t('budget')}>
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} title={t('loadError')} className={budget ? 'mb-2' : ''} />}
      {budget && <Meter label={t('budgetMeter')} value={budget.used ?? 0} limit={budget.limit || null} format={format} />}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// RecentReports
// -----------------------------------------------------------
//
// The five newest reports: status, title, company, date.
// The title keeps room for its first words: on a phone the
// company and the date wrap under it instead of squeezing
// it to an ellipsis.
//
// Used by:
//   - Dashboard (below)
// -----------------------------------------------------------

function RecentReports({ query }) {

  const t = useTranslations('PAGES.dashboard');
  const tReports = useTranslations('PAGES.reports');
  const label = useEnumLabel();
  const fmt = useFormat();
  const reports = keyedRows(query.data).slice(0, 5);


  return (
    <SectionCard title={t('RECENT.reports')} actions={<Button size="small" component={Link} to="/reports">{t('RECENT.all')}</Button>}>
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} title={t('loadError')} />}
      {!query.error && !query.isLoading && reports.length === 0 && <Typography color="text.secondary">{t('RECENT.noReports')}</Typography>}
      <ul className="m-0 p-0 list-none divide-y divide-edge">
        {reports.map((report) => (
          <li key={report.id} className="py-2 flex items-center gap-2 flex-wrap text-sm">
            <StatusChip value={report.status} label={label('reportStatus', report.status)} />
            <Link to={`/reports/${report.id}`} className="text-primary min-w-0 truncate flex-1 basis-48">{reportTitle(report, tReports('untitled'), fmt.date)}</Link>
            <span className="text-muted">{report.companyName} · {fmt.dateTime(report.createdAt)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// RecentCompanies
// -----------------------------------------------------------
//
// The five most recently updated companies.
//
// Used by:
//   - Dashboard (below)
// -----------------------------------------------------------

function RecentCompanies({ query }) {

  const t = useTranslations('PAGES.dashboard');
  const label = useEnumLabel();
  const fmt = useFormat();
  const companies = keyedRows(query.data).slice(0, 5);


  return (
    <SectionCard title={t('RECENT.companies')} actions={<Button size="small" component={Link} to="/companies">{t('RECENT.all')}</Button>}>
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} title={t('loadError')} />}
      {!query.error && !query.isLoading && companies.length === 0 && <Typography color="text.secondary">{t('RECENT.noCompanies')}</Typography>}
      <ul className="m-0 p-0 list-none divide-y divide-edge">
        {companies.map((company) => (
          <li key={company.id} className="py-2 flex items-center gap-2 flex-wrap text-sm">
            <Link to={`/companies/${company.id}`} className="text-primary font-semibold min-w-0 truncate">{company.name}</Link>
            <span className="text-muted">{label('institutionType', company.institutionType)}</span>
            <span className="ml-auto text-muted">{fmt.dateTime(company.updatedAt)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// CorpusHealth
// -----------------------------------------------------------
//
// Ready / processing / failed / without-text counts of the
// acts in use, how many are switched off, and the acts whose
// last ingestion failed (links). Says nothing until the
// catalogue landed — a loading corpus is not "Ready: 0".
//
// Used by:
//   - Dashboard (below)
// -----------------------------------------------------------

function CorpusHealth({ query }) {

  const t = useTranslations('PAGES.dashboard.CORPUS');
  const tDash = useTranslations('PAGES.dashboard');
  const acts = keyedRows(query.data);
  const inUse = acts.filter((a) => a.enabled !== false);
  const failed = inUse.filter((a) => a.lastError || a.currentVersion?.status === 'failed');
  const ingesting = inUse.filter((a) => ['pending', 'parsing', 'embedding'].includes(a.currentVersion?.status));
  const ready = inUse.filter((a) => a.currentVersion?.status === 'ready');
  const noText = inUse.filter((a) => !a.currentVersion && !a.lastError);
  const disabled = acts.length - inUse.length;
  const allGood = failed.length === 0 && ingesting.length === 0 && noText.length === 0;


  return (
    <SectionCard title={t('title')} actions={<Button size="small" component={Link} to="/corpus">{t('open')}</Button>}>
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} title={tDash('loadError')} />}
      {!query.error && !query.isLoading && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            <StatusChip kind="version" value="ready" label={t('ready', { count: ready.length })} />
            {ingesting.length > 0 && <StatusChip kind="version" value="parsing" label={t('ingesting', { count: ingesting.length })} />}
            {failed.length > 0 && <StatusChip kind="version" value="failed" label={t('failed', { count: failed.length })} />}
            {noText.length > 0 && <StatusChip kind="extraction" value="empty" label={t('noText', { count: noText.length })} />}
            {disabled > 0 && <StatusChip kind="version" value="pending" label={t('disabled', { count: disabled })} />}
          </div>
          {allGood && <Typography variant="body2" color="text.secondary">{t('allGood')}</Typography>}
          {failed.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3">{t('problems')}</Typography>
              <ul className="m-0 p-0 list-none text-sm flex flex-col gap-1">
                {failed.slice(0, 6).map((act) => (
                  <li key={act.id}>
                    <Link to={`/corpus/${act.id}`} className="text-primary">{act.shortTitle || act.title}</Link>
                    {/* String(): the reason is the backend's prose, but
                        a malformed row must not crash the card */}
                    <span className="text-muted"> — {String(act.lastError || act.currentVersion?.error || '').slice(0, 120)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// JobQueue
// -----------------------------------------------------------
//
// The three exact counters (links to the jobs page filtered
// to that status) and the five latest jobs in words (kind,
// subject link, status). Both queries poll every 10 s; the
// retry asks again whichever of the two failed.
//
// Used by:
//   - Dashboard (below)
// -----------------------------------------------------------

function JobQueue() {

  const t = useTranslations('PAGES.dashboard');
  const label = useEnumLabel();
  const text = useJobText();
  const fmt = useFormat();


  // One polled answer serves every counter
  const counts = useQuery({
    queryKey: ['jobs', 'counts'],
    queryFn: async () => (await api.get('/api/jobs/counts')).data,
    refetchInterval: 10_000,
  });
  const recent = useQuery({
    queryKey: ['jobs', 'recent'],
    queryFn: async () => (await api.get('/api/jobs?limit=5')).data.jobs,
    refetchInterval: 10_000,
  });
  const jobs = keyedRows(recent.data).slice(0, 5);


  const error = recent.error || counts.error;
  const retry = () => {
    if (recent.error) recent.refetch();
    if (counts.error) counts.refetch();
  };


  return (
    <SectionCard title={t('RECENT.jobs')} actions={<Button size="small" component={Link} to="/jobs">{t('RECENT.all')}</Button>}>
      {error && <ErrorState error={error} onRetry={retry} title={t('loadError')} className="mb-2" />}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {QUEUE_STATUSES.map((status) => {
          const value = counts.data?.[status];
          return (
            <Link key={status} to={`/jobs?status=${status}`} className="no-underline text-inherit rounded bg-canvas p-2 flex flex-col">
              <span className="text-xs text-muted">{t(`JOBS.${status}`)}</span>
              <span className="text-xl font-semibold">{value == null ? '—' : fmt.number(value)}</span>
            </Link>
          );
        })}
      </div>
      {!recent.error && !recent.isLoading && jobs.length === 0 && <Typography color="text.secondary">{t('RECENT.noJobs')}</Typography>}
      <ul className="m-0 p-0 list-none divide-y divide-edge">
        {jobs.map((job) => {
          const subject = text.subject(job.subject, job.subjectTitle);
          return (
            <li key={job.id} className="py-2 flex items-center gap-2 flex-wrap text-sm">
              <StatusChip value={job.status} label={label('jobStatus', job.status)} />
              <span>{label('jobKind', job.kind)}</span>
              {subject.to ? <Link to={subject.to} className="text-primary">{subject.label}</Link> : <span className="text-muted">{subject.label}</span>}
              <span className="ml-auto text-muted">{fmt.dateTime(job.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// Dashboard (default export)
// -----------------------------------------------------------
//
// Owns the queries several sections share (companies,
// reports, corpus) and today's usage budget.
//
// Used by:
//   - router.jsx — route /dashboard
// -----------------------------------------------------------

export default function Dashboard({ authData }) {

  const t = useTranslations('PAGES.dashboard');
  const isAdmin = authData.role === 'admin';


  const companies = useQuery({
    queryKey: ['companies', { q: '', scope: '' }],
    queryFn: async () => (await api.get('/api/companies')).data.companies,
  });
  const reports = useQuery({
    queryKey: ['reports', { companyId: null }],
    queryFn: async () => (await api.get('/api/reports')).data.reports,
    refetchInterval: (query) => (keyedRows(query.state.data).some(isActive) ? 10_000 : false),
  });
  const acts = useQuery({
    queryKey: ['corpus', 'documents', { q: '', jurisdiction: '' }],
    queryFn: async () => (await api.get('/api/corpus/documents')).data.documents,
  });
  const usage = useQuery({
    queryKey: ['usage', 1, ''],
    queryFn: async () => (await api.get('/api/usage?days=1')).data,
  });


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('welcome', { name: authData.displayName })}>
      <div className="flex flex-col gap-4">
        <KpiRow isAdmin={isAdmin} companies={companies.data} reports={reports.data} acts={acts.data} />
        <BudgetCard query={usage} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <RecentReports query={reports} />
          <RecentCompanies query={companies} />
          <CorpusHealth query={acts} />
          <JobQueue />
        </div>
      </div>
    </PageLayout>
  );
}
