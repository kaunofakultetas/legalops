// -----------------------------------------------------------
//  [*] ReportOverview — the report's summary tab
//
//  What a board member reads first: a KPI row (the acts
//  assessed, obligations assessed and how many a person had
//  approved, not met, partial, actions), what moved since the
//  company's previous report as one quiet line (only when
//  there was one — gaps closed, new gaps, gaps that came
//  back, with the titles of the ones that came back and of
//  the new ones when they are few), the findings as one
//  part-to-whole status bar with a full legend, the open
//  obligations by severity as four small tiles, the findings
//  of the company's own requirements as one quiet line of
//  counts (only for a report that assessed them), the acts
//  the report did not assess because their applicability is
//  still to confirm (the user's next step, with the way to
//  their questions), the preparation for acts that start to
//  apply later, the citation audit's counts (how many of the
//  references the company's documents make to specific
//  provisions are wrong, with a link to the citations tab —
//  or that the audit was not run for a report from before
//  it), the model's executive summary (markdown, rendered
//  safely) and the provenance — which prompt versions, models
//  and legal act versions produced this report, so it can be
//  reproduced.
//
//  The result is today's: the tiles, the bar and the
//  severity counts cover the acts in force for the company.
//  The findings of an act that applies from a later date are
//  preparation and have a card of their own. Every finding
//  count follows the effective status (the reviewer's
//  override wins, as in the findings tab and the exports):
//  counted from report.findings, not from the stats the run
//  stored when it ended. The findings of the company's own
//  requirements are in none of those numbers: they are gaps
//  between the company's policies and its procedures, not
//  breaches of law, and their line says so.
//
//  Split into (root component last):
//
//    NEW_LISTED      — how many new gaps are still named
//    tabLink         — the address of another tab of the report
//    KpiRow          — the headline tiles
//    SincePrevious   — what moved since the previous report
//    StatusSection   — findings by status + by severity
//    OwnRequirements — the company's own requirements, counted apart
//    ActsToConfirm   — the acts not assessed, and what to do
//    Preparation     — the acts that apply later, and their findings
//    CitationAudit   — the audit's counts and the way to it
//    Provenance      — prompts, models, act versions, cost
//    ReportOverview  — the tab (default export)
// -----------------------------------------------------------

import { useId } from 'react';
import { Link } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useViewParams from '@/hooks/useViewParams';
import SectionCard from '@/components/SectionCard/SectionCard';
import Markdown from '@/components/Markdown/Markdown';
import StatusChip from '@/components/StatusChip/StatusChip';
import StatTile from '@/components/charts/StatTile';
import StatusBar from '@/components/charts/StatusBar';
import FindingStatusIcon from '@/pages/Reports/FindingStatusIcon';
import { SEVERITIES } from '@/constants/enums';
import {
  CITATION_STAT_KEYS, CITATION_VERDICTS, FINDING_COLORS, FINDING_STATUSES, PROBLEM_VERDICTS, actAssessment, citationAudit,
  findingCounts, hasInternal, openBySeverity,
} from '@/pages/Reports/reportUtils';


// New gaps are named while they are this few; more than that
// are a number — the findings tab lists them
const NEW_LISTED = 3;







// -----------------------------------------------------------
// tabLink
// -----------------------------------------------------------
//
// The address of another tab of this report: ?tab= replaced,
// the page's other parameters kept — so a tab's own filters
// stay. ReportDetail hands the keyboard focus to the tab.
//
// Used by:
//   - ActsToConfirm, CitationAudit (below)
// -----------------------------------------------------------

function tabLink(params, tab) {
  const target = new URLSearchParams(params);
  target.set('tab', tab);
  return `?${target}`;
}







// -----------------------------------------------------------
// KpiRow
// -----------------------------------------------------------
//
// Five stat tiles: the finding counts by effective status
// (findingCounts — the acts in force), the acts, actions and
// approved obligations from report.stats. The acts tile
// counts those assessed and says under it how many more
// apply later or wait to be confirmed; a report from before
// acts were told apart counts the applicable ones, with the
// uncertain under them.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function KpiRow({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const fmt = useFormat();
  const stats = report.stats || {};
  const acts = stats.acts || {};
  const counts = findingCounts(report);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const told = acts.assessed != null;
  const more = [acts.upcoming ? t('actsUpcomingSub', { count: acts.upcoming }) : null,
    acts.unconfirmed ? t('actsUnconfirmedSub', { count: acts.unconfirmed }) : null].filter(Boolean).join(' · ');


  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {told
        ? <StatTile label={t('actsAssessed')} value={fmt.number(acts.assessed)} sub={more || null} />
        : <StatTile label={t('actsApplies')} value={fmt.number(acts.applies ?? 0)}
                    sub={acts.uncertain ? t('actsUncertainSub', { count: acts.uncertain }) : null} />}
      <StatTile label={t('findingsTotal')} value={fmt.number(total)}
                sub={stats.reviewedObligations != null ? t('reviewedSub', { count: stats.reviewedObligations }) : null} />
      <StatTile label={t('notMet')} value={fmt.number(counts.missing)} icon={<FindingStatusIcon status="missing" sx={{ fontSize: 16, color: FINDING_COLORS.missing }} />} />
      <StatTile label={t('partial')} value={fmt.number(counts.partial)} icon={<FindingStatusIcon status="partial" sx={{ fontSize: 16, color: '#b07800' }} />} />
      <StatTile label={t('actions')} value={fmt.number(stats.actions ?? report.actions?.length ?? 0)} />
    </div>
  );
}







// -----------------------------------------------------------
// SincePrevious
// -----------------------------------------------------------
//
// What moved since the company's previous finished report
// (stats.changes), as one quiet line: the date of that report
// — the way to it — then how many gaps were closed, how many
// are new and how many came back, each in words with its
// number. Under it the titles of the gaps that came back,
// and of the new ones while they are few; the backend sends
// the first titles only, so a longer list ends with how many
// more there are. Nothing for a company's first report, or
// for one from before reports were compared.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function SincePrevious({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const fmt = useFormat();
  const titleId = useId();
  const changes = report.stats?.changes;


  if (!changes || typeof changes !== 'object') return null;
  const count = (kind) => Number(changes[kind]?.count) || 0;
  const titles = (kind) => (Array.isArray(changes[kind]?.titles) ? changes[kind].titles.map(String) : []);
  const date = fmt.date(changes.sinceDate);
  const listed = [
    { kind: 'back', caption: t('changesBackList') },
    ...(count('new') <= NEW_LISTED ? [{ kind: 'new', caption: t('changesNewList') }] : []),
  ].filter((row) => titles(row.kind).length > 0);


  return (
    <Paper component="section" aria-labelledby={titleId} className="px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap text-sm">
        <Typography id={titleId} variant="subtitle2" component="h2">
          {t('changesSince')} ({changes.since ? <Link to={`/reports/${changes.since}`} className="text-primary">{date}</Link> : date}):
        </Typography>
        <span>{[t('changesClosed', { count: fmt.number(count('closed')) }), t('changesNew', { count: fmt.number(count('new')) }), t('changesBack', { count: fmt.number(count('back')) })].join(' · ')}</span>
      </div>
      {listed.map(({ kind, caption }) => (
        <div key={kind} className="text-sm flex gap-x-2 flex-wrap">
          <span className="text-muted">{caption}:</span>
          <ul className="m-0 p-0 list-none flex-1 min-w-[16rem]" aria-label={caption}>
            {titles(kind).map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}
            {count(kind) > titles(kind).length && <li className="text-muted">{t('changesMore', { count: fmt.number(count(kind) - titles(kind).length) })}</li>}
          </ul>
        </div>
      ))}
    </Paper>
  );
}







// -----------------------------------------------------------
// StatusSection
// -----------------------------------------------------------
//
// The findings' effective verdicts as a status bar (colour
// + icon + label + count) and the open obligations per
// severity.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function StatusSection({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const label = useEnumLabel();
  const fmt = useFormat();
  const counts = findingCounts(report);
  const open = openBySeverity(report);


  const items = FINDING_STATUSES.map((status) => ({
    key: status,
    label: label('findingStatus', status),
    value: counts[status],
    color: FINDING_COLORS[status],
    icon: <FindingStatusIcon status={status} sx={{ fontSize: 16 }} />,
  }));


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title={t('byStatus')}>
        <StatusBar label={t('byStatus')} items={items} />
      </SectionCard>
      <SectionCard title={t('bySeverity')} subtitle={t('bySeverityHint')}>
        <ul className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SEVERITIES.map((severity) => (
            <li key={severity} className="flex flex-col items-start gap-1 rounded bg-canvas p-3">
              <StatusChip kind="severity" value={severity} label={label('severity', severity)} />
              <span className="text-2xl font-semibold">{fmt.number(open[severity] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}







// -----------------------------------------------------------
// OwnRequirements
// -----------------------------------------------------------
//
// The findings of the company's own requirements as one
// quiet line: the label with the note saying what they are —
// gaps between the company's policies and its procedures, not
// breaches of law — and under it the count of each effective
// verdict. No bar and no tiles: the numbers above are the
// result against the law, and this group is counted apart
// from them. Nothing for a report without the group.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function OwnRequirements({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const label = useEnumLabel();
  const fmt = useFormat();
  const titleId = useId();
  const counts = findingCounts(report, { internal: true });


  if (!hasInternal(report)) return null;
  return (
    <Paper component="section" aria-labelledby={titleId} className="px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-x-2 flex-wrap">
        <Typography id={titleId} variant="subtitle2" component="h2">{t('internalTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">— {t('internalNote')}</Typography>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1">
        {FINDING_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-1.5 text-sm">
            <FindingStatusIcon status={status} sx={{ fontSize: 16 }} />
            <span>{label('findingStatus', status)}</span>
            <span className="font-semibold">{fmt.number(counts[status])}</span>
          </li>
        ))}
      </ul>
    </Paper>
  );
}







// -----------------------------------------------------------
// ActsToConfirm
// -----------------------------------------------------------
//
// The acts the report did not assess because whether they
// apply depends on facts the profile does not state — named,
// with what to do about them and, beside the names, a link
// to the acts tab, where each lists its questions. Nothing
// when there are none.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function ActsToConfirm({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const [params] = useViewParams();
  const waiting = (report.acts || []).filter((act) => actAssessment(act) === 'unconfirmed');


  if (waiting.length === 0) return null;
  return (
    <SectionCard title={t('toConfirmTitle', { count: waiting.length })} subtitle={t('toConfirmHint')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ul className="m-0 p-0 list-none flex gap-2 flex-wrap">
          {waiting.map((act, index) => (
            <li key={act.id ?? index} className="rounded bg-amber-50 border-l-4 border-amber-400 px-2 py-1 text-sm">{act.shortTitle || act.documentTitle}</li>
          ))}
        </ul>
        <Link to={tabLink(params, 'acts')} replace className="text-primary text-sm">{t('toConfirmOpen')}</Link>
      </div>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// Preparation
// -----------------------------------------------------------
//
// The acts that start to apply to the company on a later
// date, each with that date, and their findings as a status
// bar of their own — preparation, apart from today's result.
// Nothing when the report has no such act.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function Preparation({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const label = useEnumLabel();
  const fmt = useFormat();
  const later = (report.acts || []).filter((act) => actAssessment(act) === 'upcoming');
  const counts = findingCounts(report, { upcoming: true });


  if (later.length === 0) return null;
  const items = FINDING_STATUSES.map((status) => ({
    key: status,
    label: label('findingStatus', status),
    value: counts[status],
    color: FINDING_COLORS[status],
    icon: <FindingStatusIcon status={status} sx={{ fontSize: 16 }} />,
  }));
  return (
    <SectionCard title={t('upcomingTitle')} subtitle={t('upcomingHint')}>
      <ul className="m-0 mb-3 p-0 list-none flex gap-x-6 gap-y-1 flex-wrap text-sm">
        {later.map((act, index) => (
          <li key={act.id ?? index}>
            <span className="font-semibold">{act.shortTitle || act.documentTitle}</span>
            {act.appliesFrom && <span className="text-muted"> — {t('appliesFrom', { date: fmt.date(act.appliesFrom) })}</span>}
          </li>
        ))}
      </ul>
      <StatusBar label={t('upcomingTitle')} items={items} />
    </SectionCard>
  );
}







// -----------------------------------------------------------
// CitationAudit
// -----------------------------------------------------------
//
// The citation audit at a glance (reportUtils citationAudit):
// how many references need correcting (a wrong or a missing
// provision) of how many were checked, the count of each
// verdict, and a link to the citations tab (tabLink). A
// report from before the audit says it was not run.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function CitationAudit({ report }) {

  const t = useTranslations('PAGES.report.SUMMARY');
  const label = useEnumLabel();
  const fmt = useFormat();
  const [params] = useViewParams();
  const audit = citationAudit(report);
  const problems = audit ? PROBLEM_VERDICTS.reduce((sum, verdict) => sum + audit[CITATION_STAT_KEYS[verdict]], 0) : 0;
  const open = audit && <Link to={tabLink(params, 'citations')} replace className="text-primary text-sm">{t('citationsOpen')}</Link>;


  if (!audit) {
    return (
      <SectionCard title={t('citationsTitle')} subtitle={t('citationsHint')}>
        <Typography variant="body2" color="text.secondary">{t('citationsNotRun')}</Typography>
      </SectionCard>
    );
  }
  return (
    <SectionCard title={t('citationsTitle')} subtitle={t('citationsHint')} actions={open}>
      <Typography variant="body2" className="mb-3">
        {audit.checked ? t('citationsHeadline', { problems: fmt.number(problems), checked: fmt.number(audit.checked) }) : t('citationsNone')}
      </Typography>
      {audit.checked > 0 && (
        <ul className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-5 gap-2">
          {CITATION_VERDICTS.map((verdict) => (
            <li key={verdict} className="flex flex-col items-start gap-1 rounded bg-canvas p-3">
              <StatusChip kind="citationVerdict" value={verdict} label={label('citationVerdict', verdict)} />
              <span className="text-2xl font-semibold">{fmt.number(audit[CITATION_STAT_KEYS[verdict]])}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// Provenance
// -----------------------------------------------------------
//
// stats.provenance {prompts: [{slug, version, model}],
// models: [...], corpus: [{act, versionNo, versionDate}]}
// and the tokens / USD the run cost.
//
// Used by:
//   - ReportOverview (below)
// -----------------------------------------------------------

function Provenance({ report }) {

  const t = useTranslations('PAGES.report.PROVENANCE');
  const tSummary = useTranslations('PAGES.report.SUMMARY');
  const fmt = useFormat();
  const provenance = report.stats?.provenance;
  const stats = report.stats || {};


  if (!provenance && stats.costUsd == null) return null;
  // Keyed by position: the entries are display strings and
  // nothing keeps them unique (a broken answer may repeat one)
  const list = (items) => (items?.length
    ? <ul className="m-0 pl-5 text-sm">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
    : <span className="text-sm text-muted">—</span>);


  return (
    <SectionCard title={t('title')} subtitle={t('hint')}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Typography variant="subtitle2" component="h3">{t('prompts')}</Typography>
          {list(provenance?.prompts?.map((p) => t('promptVersion', { slug: p.slug, version: p.version, model: p.model })))}
        </div>
        <div>
          <Typography variant="subtitle2" component="h3">{t('models')}</Typography>
          {list(provenance?.models)}
        </div>
        <div>
          <Typography variant="subtitle2" component="h3">{t('corpus')}</Typography>
          {list(provenance?.corpus?.map((c) => (c.versionDate
            ? t('actVersionDate', { act: c.act, versionNo: c.versionNo, date: fmt.date(c.versionDate) })
            : t('actVersion', { act: c.act, versionNo: c.versionNo }))))}
        </div>
      </div>
      {stats.costUsd != null && (
        <Typography variant="body2" color="text.secondary" className="mt-3">
          {tSummary('cost', { cost: fmt.usd(stats.costUsd), tokens: fmt.number(stats.tokens ?? 0) })}
        </Typography>
      )}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// ReportOverview (default export)
// -----------------------------------------------------------
//
// The KPI row, what moved since the previous report, the
// status section, the line of the
// company's own requirements, the acts still to confirm, the
// preparation for later acts, the citation audit, the summary
// (markdown only when it is text — anything else reads as
// "no summary"), provenance.
//
// Used by:
//   - ReportDetail.jsx — the summary tab
// -----------------------------------------------------------

export default function ReportOverview({ report }) {
  const t = useTranslations('PAGES.report.SUMMARY');
  return (
    <div className="flex flex-col gap-4">
      <KpiRow report={report} />
      <SincePrevious report={report} />
      <StatusSection report={report} />
      <OwnRequirements report={report} />
      <ActsToConfirm report={report} />
      <Preparation report={report} />
      <CitationAudit report={report} />
      <SectionCard title={t('title')}>
        {typeof report.summary === 'string' && report.summary.trim()
          ? <Markdown>{report.summary}</Markdown>
          : <Typography color="text.secondary">{t('noSummary')}</Typography>}
      </SectionCard>
      <Provenance report={report} />
    </div>
  );
}
