// -----------------------------------------------------------
//  [*] Chat — how tool calls look in a reply
//
//  Every tool call renders inline where the model made it:
//
//    - ToolPill — the default: the tool's name, its state in
//      words AND an icon (running / done / failed / stopped —
//      never colour alone), a failed call's error code, and on
//      click (aria-expanded) the input and the result;
//    - ReportToolCard — runComplianceAnalysis /
//      approveReportScope / getReport: a card with the
//      status, live progress (polled while the analysis
//      runs), counts by status and severity — those of the
//      acts in force, with the company's own requirements,
//      when the report assessed them, as one quiet line of
//      their own: they are no breaches of law and are never
//      among the other counts — and a link to
//      /reports/:id (a new tab). A report that waits
//      for its list of acts to be approved shows that status
//      and the link — the card approves nothing: that is
//      done on the report's page, or by the assistant's
//      approveReportScope once the user has said yes — and is
//      not polled: it moves only when a person acts;
//    - CorpusToolCard — searchLegalCorpus / getLegalProvision
//      / checkCitations: the same pill, grown to hold the
//      articles that were read — each one a link to its
//      official text (citationUrl, a new tab), and for a
//      citation check marked with its verdict in words — so
//      the law behind an answer shows at a glance; opened, it
//      shows the call's exact input and output like any pill;
//    - EstimateToolCard — estimateAnalysisCost: the upper-bound
//      USD cost of a run and the budget left, so the user can
//      answer the assistant's "shall I start it?";
//    - ProductToolCard — startWorkProduct / getWorkProduct:
//      the work products of a company's compliance
//      programme (the policy, the governance product, the
//      risk register) as a card — one product
//      or a list of them, each with its title, version and
//      status, the blocking rules a draft breaks, and a link
//      to /programme/:id (a new tab). A product being
//      generated is followed live, like a running report; a
//      start the backend refused says why in plain words;
//    - ActionsToolCard — getActionRegister: a company's
//      action register at a glance — how many actions stand
//      in each state, the late first, each count with its
//      state in words — and a link to the company's Actions
//      tab (a new tab), the one place an action is kept up.
//      The tool only reads, so the card offers nothing to do.
//
//  A failed or still-running call always falls back to the
//  pill, so the error code is shown the same way everywhere.
//  An output of the wrong shape (an older build's stored
//  reply) renders as little as it can — never breaks the page.
//
//  Split into (root component last):
//
//    ACTIVE_REPORT   — report statuses that still change
//    VERDICTS        — how a check's verdict shows on a row
//    PILL            — the frame every pill wears
//    toolState       — part status → running/done/failed/stopped
//    errorCode       — "[NOT_FOUND] …" → NOT_FOUND
//    listOf          — a list of objects, or []
//    useToolLabel    — translated tool name (MCP-aware)
//    StateMark       — the state's icon + words
//    PillButton      — the pill's line, a disclosure button
//    CallDetails     — a call's exact input and output
//    ToolPill        — the default rendering
//    CountChips      — "label: n" chips
//    OwnCounts       — the company's own requirements, one line
//    ReportCard      — the report card body
//    ReportToolCard  — report tools (named export)
//    verdictOf       — a checked reference's verdict
//    ArticleRef      — one article, a link to its official text
//    Articles        — the articles a corpus call read
//    CorpusToolCard  — corpus tools (named export)
//    EstimateToolCard — the analysis cost before a run
//    countOf         — a count given as a number or a list
//    productRows     — the products a tool result carries
//    ProductRow      — one product of a card
//    ProductToolCard — programme tools (named export)
//    REGISTER_COUNTS — the register tool's counts, in order
//    ActionsToolCard — the action register (named export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '@/api/client';
import { useLocale, useTranslations } from '@/i18n';
import StatusChip from '@/components/StatusChip/StatusChip';
import useEnumLabel from '@/hooks/useEnumLabel';
import { formatUsd } from '@/utils/format';
import { companyActionsPath, productPath } from '@/paths';
import ProductStatus from '@/pages/Programme/ProductStatus';
import { fetchProduct, programmeKeys } from '@/pages/Programme/programmeApi';
import { brokenRules, isActive, runProgress } from '@/pages/Programme/programmeUtils';
import { findingCounts } from '@/pages/Reports/reportUtils';


// The register tool's counts as the card tells them: the
// state each stands for and the key the tool sends it under,
// the late first
const REGISTER_COUNTS = [['late', 'late'], ['open', 'open'], ['in_progress', 'inProgress'], ['done', 'done'], ['closed', 'closed']];

// A report in these states is still moving — the card polls.
// One waiting for its acts to be approved (scope_review) is
// not among them: no job is at work on it
const ACTIVE_REPORT = new Set(['queued', 'running']);

// How a citation check's verdict shows on its article's row:
// the colour of the row and the mark after the citation — a
// check for what stands, the error mark for what does not.
// The verdict's words are in the row's tooltip and, for a
// screen reader, in the row itself
const VERDICTS = {
  verified: { tone: '', Mark: CheckCircleOutlineIcon, mark: 'text-green-700' },
  found: { tone: '', Mark: CheckCircleOutlineIcon, mark: 'text-muted' },
  mismatch: { tone: 'text-red-700', Mark: ErrorOutlineIcon, mark: 'text-red-700' },
  not_found: { tone: 'text-red-700', Mark: ErrorOutlineIcon, mark: 'text-red-700' },
  act_not_in_corpus: { tone: 'text-red-700', Mark: ErrorOutlineIcon, mark: 'text-red-700' },
};

// The frame every pill wears
const PILL = 'max-w-full px-2.5 py-1 rounded-md bg-canvas border border-edge text-xs text-content transition-colors';







// -----------------------------------------------------------
// toolState
// -----------------------------------------------------------
//
// assistant-ui's part status → one of our four states. A call
// cut short by a stopped turn is "stopped", not "failed" —
// and so is a call left without its result when the turn
// ended: assistant-ui marks it requires-action (it would wait
// for a client-side tool or an approval; this app has
// neither, every tool runs in the assistant), which must not
// spin as "running" forever.
//
// Used by:
//   - ToolPill, ReportToolCard, CorpusToolCard,
//     EstimateToolCard, ProductToolCard (below)
// -----------------------------------------------------------

function toolState(status, isError) {
  if (status?.type === 'running') return 'running';
  if (status?.type === 'requires-action') return 'stopped';
  if (status?.type === 'incomplete' && status.reason === 'cancelled') return 'stopped';
  if (isError || status?.type === 'incomplete') return 'failed';
  return 'done';
}







// -----------------------------------------------------------
// errorCode
// -----------------------------------------------------------
//
//   errorCode({ error: "[NOT_FOUND] getCompany failed …" }) → "NOT_FOUND"
//
// The assistant's tool errors open with the Django code in
// brackets; anything else → null.
//
// Used by:
//   - ToolPill (below)
// -----------------------------------------------------------

function errorCode(result) {
  const text = typeof result?.error === 'string' ? result.error : '';
  return text.match(/^\[([A-Z0-9_]{2,40})\]/)?.[1] ?? null;
}







// -----------------------------------------------------------
// listOf
// -----------------------------------------------------------
//
// The objects of a list, or an empty list for anything that
// is not one — a stored answer of an older build may hold
// anything where a list is expected.
//
// Used by:
//   - CorpusToolCard, productRows (below)
// -----------------------------------------------------------

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}







// -----------------------------------------------------------
// useToolLabel
// -----------------------------------------------------------
//
// The translated tool name; an MCP tool (mcp_<server>_<tool>)
// reads "External source: …"; an unknown tool shows its name.
//
// Used by:
//   - ToolPill, ReportToolCard, CorpusToolCard,
//     EstimateToolCard, ProductToolCard (below)
// -----------------------------------------------------------

function useToolLabel(toolName) {
  const t = useTranslations('PAGES.chat.TOOLS');
  if (toolName.startsWith('mcp_')) return t('external', { name: toolName.slice(4).replace(/_/g, ' ') });
  const label = t(`NAMES.${toolName}`);
  return label === `NAMES.${toolName}` ? toolName : label;
}







// -----------------------------------------------------------
// StateMark
// -----------------------------------------------------------
//
// The state as an icon plus words — the words carry the
// meaning, the colour only repeats it.
//
// Used by:
//   - ToolPill, ReportToolCard, CorpusToolCard (below)
// -----------------------------------------------------------

function StateMark({ state }) {
  const t = useTranslations('PAGES.chat.TOOLS.STATE');
  const icon = {
    running: <CircularProgress size={11} thickness={6} aria-hidden />,
    done: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} className="text-green-700" aria-hidden />,
    failed: <ErrorOutlineIcon sx={{ fontSize: 14 }} className="text-red-700" aria-hidden />,
    stopped: <BlockIcon sx={{ fontSize: 14 }} className="text-muted" aria-hidden />,
  }[state];
  return <span className="inline-flex items-center gap-1 text-muted">{icon}<span>{t(state)}</span></span>;
}







// -----------------------------------------------------------
// PillButton
// -----------------------------------------------------------
//
// The pill's line: the tool's name, its state, a failed
// call's error code and the chevron — a button that says
// whether what it controls is open (aria-expanded,
// aria-controls). It wears the pill's frame itself, unless it
// is `bare` — the top line of a larger pill that holds more.
//
// Used by:
//   - ToolPill, CorpusToolCard (below)
// -----------------------------------------------------------

function PillButton({ label, state, code = null, open, onToggle, detailsId, bare = false }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={detailsId}
            className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-primary ${bare ? 'max-w-full text-xs text-content rounded' : `${PILL} hover:border-primary`}`}>
      <span className="font-medium">{label}</span>
      <span aria-hidden>·</span>
      <StateMark state={state} />
      {code && <code className="px-1 rounded bg-red-50 text-red-800">{code}</code>}
      {open ? <ExpandLessIcon sx={{ fontSize: 14 }} aria-hidden /> : <ExpandMoreIcon sx={{ fontSize: 14 }} aria-hidden />}
    </button>
  );
}







// -----------------------------------------------------------
// CallDetails
// -----------------------------------------------------------
//
// What an opened pill shows: the call's input and its result
// exactly as they were, both in full — the page scrolls, not
// a window inside it — or, for a failed call, its error text.
//
// Used by:
//   - ToolPill, CorpusToolCard (below)
// -----------------------------------------------------------

function CallDetails({ id, args, result, state }) {
  const t = useTranslations('PAGES.chat.TOOLS');
  return (
    <div id={id} className="mt-1 ml-1 pl-3 border-l-2 border-edge text-xs space-y-1">
      {args && Object.keys(args).length > 0 && (
        <>
          <div className="text-muted">{t('input')}</div>
          <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] bg-canvas rounded p-2 m-0">{JSON.stringify(args, null, 2)}</pre>
        </>
      )}
      {result !== undefined && (
        <>
          <div className="text-muted">{state === 'failed' ? t('error') : t('output')}</div>
          <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] bg-canvas rounded p-2 m-0">
            {typeof result?.error === 'string' ? result.error : typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// ToolPill
// -----------------------------------------------------------
//
// One tool call as a pill; click (or Enter) expands the input
// and the result (or the error text) below it.
//
// Used by:
//   - Messages.jsx — the tools Fallback
//   - ReportToolCard, CorpusToolCard, EstimateToolCard,
//     ProductToolCard, ActionsToolCard (below) — while
//     running and on failure
// -----------------------------------------------------------

export function ToolPill({ toolName, args, result, status, isError }) {

  const label = useToolLabel(toolName);
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const state = toolState(status, isError);
  const code = state === 'failed' ? errorCode(result) : null;


  return (
    <div className="my-1">
      <PillButton label={label} state={state} code={code} open={open} onToggle={() => setOpen((v) => !v)} detailsId={detailsId} />
      {open && <CallDetails id={detailsId} args={args} result={result} state={state} />}
    </div>
  );
}







// -----------------------------------------------------------
// CountChips
// -----------------------------------------------------------
//
// { met: 3, missing: 2 } → "Atitinka: 3", "Neatitinka: 2"
// chips, in `order`, zeros skipped; the colour follows the
// StatusChip table of `kind`, the text carries the meaning.
//
// Used by:
//   - ReportCard, ActionsToolCard (below)
// -----------------------------------------------------------

function CountChips({ counts, order, enumName, kind }) {
  const label = useEnumLabel();
  const entries = order.filter((key) => counts?.[key]);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((key) => (
        <StatusChip key={key} kind={kind} value={key} label={`${label(enumName, key)}: ${counts[key]}`} />
      ))}
    </div>
  );
}







// -----------------------------------------------------------
// OwnCounts
// -----------------------------------------------------------
//
// The findings of the company's own requirements as one line
// of plain text under the card's chips — the label, then
// each verdict with its count, zeros left out. Quiet on
// purpose: the chips above are the result against the law,
// and these gaps between the company's policies and its
// procedures are counted apart from it. Nothing without a
// count to show.
//
// Used by:
//   - ReportCard (below)
// -----------------------------------------------------------

function OwnCounts({ counts }) {
  const t = useTranslations('PAGES.chat.REPORT');
  const label = useEnumLabel();
  const parts = ['missing', 'partial', 'unknown', 'met', 'not_applicable'].filter((key) => counts?.[key])
    .map((key) => `${label('findingStatus', key)}: ${counts[key]}`);
  if (!parts.length) return null;
  return <div className="text-xs text-muted">{t('ownRequirements', { counts: parts.join(' · ') })}</div>;
}







// -----------------------------------------------------------
// ReportCard
// -----------------------------------------------------------
//
// The card body: status, progress (live while running — the
// report row is polled every 5 s), counts once done, and the
// link to the report page, which opens in a new tab so the
// conversation stays where it is (the link says so to a
// screen reader). A report that holds its company because it
// waits for approval is not "already running": the status
// says what it waits for, the note is left out. The counts
// are the tool's snapshot (counts, and ownRequirements for
// the company's own requirements) — or, once a report the
// card followed has finished, counted from its live findings
// the same way (reportUtils findingCounts): the acts in
// force in the chips, the company's own requirements in
// their line, neither among the other.
//
// Used by:
//   - ReportToolCard (below)
// -----------------------------------------------------------

function ReportCard({ card, toolName, alreadyRunning }) {

  const t = useTranslations('PAGES.chat.REPORT');
  const label = useEnumLabel();
  const toolLabel = useToolLabel(toolName);
  const active = ACTIVE_REPORT.has(card.report.status);


  // The tool result is a snapshot; while the analysis runs,
  // the card follows the live row
  const live = useQuery({
    queryKey: ['chat', 'report', card.report.id],
    queryFn: async () => (await api.get(`/api/reports/${encodeURIComponent(card.report.id)}`)).data,
    enabled: active,
    refetchInterval: (query) => (ACTIVE_REPORT.has(query.state.data?.status ?? 'running') ? 5_000 : false),
  });
  const report = live.data ? { ...card.report, ...live.data } : card.report;
  const percent = report.progress?.percent;
  const counted = Array.isArray(live.data?.findings);
  const findings = counted ? findingCounts(live.data) : card.counts?.findings;
  const own = counted ? findingCounts(live.data, { internal: true }) : card.ownRequirements?.counts;


  return (
    <div className="my-2 rounded-md border border-edge bg-canvas p-3 max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <AssessmentOutlinedIcon fontSize="small" className="text-primary" aria-hidden />
        <span className="text-xs text-muted">{toolLabel}</span>
      </div>
      <div className="font-medium [overflow-wrap:anywhere]">{report.title || t('title', { company: report.companyName || '—' })}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <StatusChip value={report.status} label={label('reportStatus', report.status)} />
        {alreadyRunning && report.status !== 'scope_review' && <span className="text-xs text-muted">{t('alreadyRunning')}</span>}
      </div>
      {ACTIVE_REPORT.has(report.status) && (
        <div className="mt-2" role="status">
          <LinearProgress variant={percent != null ? 'determinate' : 'indeterminate'} value={percent ?? 0}
                          aria-label={t('progress', { percent: percent ?? 0 })} />
          <div className="text-xs text-muted mt-1">
            {percent != null ? t('progress', { percent }) : t('progressUnknown')}
            {report.progress?.step ? ` · ${label('stepName', report.progress.step)}` : ''}
          </div>
        </div>
      )}
      {report.status === 'done' && (
        <div className="mt-2 space-y-1">
          <CountChips counts={findings} order={['missing', 'partial', 'unknown', 'met', 'not_applicable']} enumName="findingStatus" kind="finding" />
          <CountChips counts={card.counts?.openBySeverity} order={['critical', 'high', 'medium', 'low']} enumName="severity" kind="severity" />
          <OwnCounts counts={own} />
        </div>
      )}
      <Button component={Link} to={card.report.url || `/reports/${card.report.id}`} target="_blank" rel="noopener"
              aria-label={t('openNewTab')} size="small" className="mt-2" endIcon={<OpenInNewIcon fontSize="inherit" />}>
        {t('open')}
      </Button>
    </div>
  );
}







// -----------------------------------------------------------
// ReportToolCard
// -----------------------------------------------------------
//
// runComplianceAnalysis / approveReportScope / getReport:
// the card once the call answered a report, the pill while
// running or on failure. An approval answers the report as
// it goes on to its second part, so its card follows the run.
//
// Used by:
//   - Messages.jsx — tools.by_name
// -----------------------------------------------------------

export function ReportToolCard(props) {
  const { result, status, isError, toolName } = props;
  if (toolState(status, isError) !== 'done' || !result?.report?.id) return <ToolPill {...props} />;
  return <ReportCard card={result} toolName={toolName} alreadyRunning={Boolean(result.alreadyRunning)} />;
}







// -----------------------------------------------------------
// verdictOf
// -----------------------------------------------------------
//
// What a citation check found for one reference: the
// provision exists and is about what was claimed (verified),
// exists with nothing to compare (found), exists but governs
// something else (mismatch), does not exist (not_found), or
// its act is not in the corpus (act_not_in_corpus).
//
// Used by:
//   - Articles (below)
// -----------------------------------------------------------

function verdictOf(row) {
  if (row.status !== 'found') return row.status;
  return row.headingMatch === 'mismatch' ? 'mismatch' : row.headingMatch === 'match' ? 'verified' : 'found';
}







// -----------------------------------------------------------
// ArticleRef
// -----------------------------------------------------------
//
// One article by its citation: a link to the official text
// in a new tab when there is one, plain text otherwise; the
// provision's heading is its tooltip. Set in the serif, like
// every reference to the law.
//
// Used by:
//   - Articles (below)
// -----------------------------------------------------------

function ArticleRef({ text, name = text, url, heading }) {
  const t = useTranslations('PAGES.chat.CITATIONS');
  const ref = url ? (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={t('open', { label: name })}
       className="font-serif text-inherit underline decoration-edge underline-offset-2 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary rounded-sm">
      {text}
    </a>
  ) : <span className="font-serif">{text}</span>;
  return heading ? <Tooltip title={heading}>{ref}</Tooltip> : ref;
}







// -----------------------------------------------------------
// Articles
// -----------------------------------------------------------
//
// The articles a finished corpus call read, inside its pill,
// each on a row of its own:
// a search's hits, the one provision that was fetched (with
// the version it quotes), or every reference a citation
// check looked at — as it was claimed, followed by a check
// mark, or in red with the error mark when it does not hold.
// What exactly was found is the row's tooltip, as wide as its
// text: the verdict as an underlined headline — with a colon
// when lines follow it —, then what the
// source claimed the article is about — marked as holding or
// failing —, then what the article is in fact headed, each
// under its own underlined label. The same three are in the
// row for a screen reader, without the marks; a row without a link takes the keyboard's
// focus so its tooltip can be reached.
// A call that read nothing says so.
//
// Used by:
//   - CorpusToolCard (below)
// -----------------------------------------------------------

function Articles({ toolName, hits, checks }) {

  const t = useTranslations('PAGES.chat.CITATIONS');
  const cited = (row) => [row.shortTitle, row.path].filter(Boolean).join(' ') || row.title || '—';


  if (toolName === 'checkCitations' ? checks.length === 0 : hits.length === 0) {
    return <div className="text-muted">{toolName === 'checkCitations' ? t('noChecks') : t('noHits')}</div>;
  }
  if (toolName !== 'checkCitations') {
    return (
      <ul className="list-none m-0 p-0 flex flex-col gap-y-0.5">
        {hits.map((hit, index) => (
          <li key={`${hit.unitId}-${index}`}>
            <ArticleRef text={`${cited(hit)}${hit.versionDate ? ` · ${t('version', { date: hit.versionDate })}` : ''}`} name={cited(hit)}
                        url={hit.citationUrl} heading={hit.heading} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-y-0.5">
      {checks.map((row, index) => {
        const verdict = verdictOf(row);
        // "MiCA 74(1) b" — neutral in both languages
        const claimed = `${row.act} ${row.article}${row.paragraph ? `(${row.paragraph})` : ''}${row.point ? ` ${row.point}` : ''}`;
        const { tone, Mark, mark } = VERDICTS[verdict] ?? VERDICTS.not_found;
        const url = row.unitId ? row.citationUrl : null;
        // [mark, label, text]: the claim holds, fails, or could not be judged; what the article is headed is a fact
        const lines = [
          row.claimedHeading && [{ verified: '✅', mismatch: '❌' }[verdict] ?? '', t('claimed'), row.claimedHeading],
          row.unitId && row.heading && ['✅', t('actual'), row.heading],
        ].filter(Boolean);
        return (
          <li key={index} className="flex">
            <Tooltip placement="right" slotProps={{ tooltip: { sx: { maxWidth: 'min(92vw, 60rem)' } } }}
                     title={(
                       <>
                         <span className="block font-semibold">
                           <span className="underline underline-offset-2">{t(`VERDICT.${verdict}`)}</span>{lines.length > 0 && ':'}
                         </span>
                         {lines.map(([sign, name, text]) => (
                           <span key={name} className="block">
                             {sign && <span aria-hidden>{sign} </span>}<span className="underline underline-offset-2">{name}</span>: {text}
                           </span>
                         ))}
                       </>
                     )}>
              <span tabIndex={url ? undefined : 0}
                    className={`inline-flex items-center gap-x-1 rounded-sm focus-visible:outline-2 focus-visible:outline-primary ${tone}`}>
                <ArticleRef text={claimed} name={row.unitId ? cited(row) : claimed} url={url} />
                <Mark sx={{ fontSize: 13 }} className={mark} aria-hidden />
                <span className="sr-only">{[t(`VERDICT.${verdict}`), ...lines.map(([, name, text]) => `${name}: ${text}`)].join('. ')}</span>
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}







// -----------------------------------------------------------
// CorpusToolCard
// -----------------------------------------------------------
//
// A finished corpus call: one pill that holds the call's line
// and, under it, the articles it read (Articles) — the line
// is the button, the articles are links, so the frame is
// drawn around both rather than by the button. Opened, it
// shows the call's exact input and output, like every pill.
// Running or failed → the plain pill.
//
// Used by:
//   - Messages.jsx — tools.by_name
// -----------------------------------------------------------

export function CorpusToolCard(props) {

  const { toolName, args, result, status, isError } = props;
  const toolLabel = useToolLabel(toolName);
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  if (toolState(status, isError) !== 'done' || !result) return <ToolPill {...props} />;


  const hits = toolName === 'searchLegalCorpus' ? listOf(result.hits)
    : toolName === 'getLegalProvision' ? listOf([result.provision]) : [];
  const checks = toolName === 'checkCitations' ? listOf(result.results) : [];


  return (
    <div className="my-1">
      <div className={`inline-flex flex-col items-start gap-1 ${PILL} has-[button:hover]:border-primary`}>
        <PillButton bare label={toolLabel} state="done" open={open} onToggle={() => setOpen((v) => !v)} detailsId={detailsId} />
        <Articles toolName={toolName} hits={hits} checks={checks} />
      </div>
      {open && <CallDetails id={detailsId} args={args} result={result} state="done" />}
    </div>
  );
}







// -----------------------------------------------------------
// EstimateToolCard
// -----------------------------------------------------------
//
// estimateAnalysisCost: "up to $7.00 (analysis + extraction)"
// with the number of acts and the budget left; unknown prices
// are said so. Running or failed → the pill.
//
// Used by:
//   - Messages.jsx — tools.by_name
// -----------------------------------------------------------

export function EstimateToolCard(props) {

  const { toolName, result, status, isError } = props;
  const t = useTranslations('PAGES.chat.ESTIMATE');
  const locale = useLocale();
  const toolLabel = useToolLabel(toolName);
  if (toolState(status, isError) !== 'done' || !result || result.totalUsd == null) return <ToolPill {...props} />;


  const usd = (value) => formatUsd(value ?? 0, locale);
  const remaining = result.budget?.remaining;


  return (
    <div className="my-2 rounded-md border border-edge bg-canvas p-3 max-w-md text-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
        <span className="font-medium text-content">{toolLabel}</span>
        <span aria-hidden>·</span>
        <StateMark state="done" />
      </div>
      <div className="font-medium">{t('total', { total: usd(result.totalUsd) })}</div>
      <div className="text-xs text-muted">
        {t('parts', { analysis: usd(result.analysisUsd), extraction: usd(result.extractionUsd) })}
        {result.acts != null ? ` · ${t('acts', { count: result.acts })}` : ''}
      </div>
      <div className="text-xs mt-1">{remaining == null ? t('unlimited') : t('budget', { remaining: usd(remaining) })}</div>
      {!result.pricesKnown && <div className="text-xs text-muted mt-1">{t('pricesUnknown')}</div>}
    </div>
  );
}







// -----------------------------------------------------------
// countOf
// -----------------------------------------------------------
//
// How many rules a product breaks, whichever way the tool
// says it: a list of them, or their number. Anything else is
// none — which also makes it the reading of a register count
// the tool left out.
//
// Used by:
//   - ProductRow, ActionsToolCard (below)
// -----------------------------------------------------------

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  return Number.isFinite(value) && value > 0 ? value : 0;
}







// -----------------------------------------------------------
// productRows
// -----------------------------------------------------------
//
// The products a programme tool answered, whichever shape
// the answer has: the list of a company's products, the one
// product a start made (or found already running), or the
// answer itself when it is one product. Rows without a kind
// or a title of their own are still rows — a card shows what
// it is given.
//
// Used by:
//   - ProductToolCard (below)
// -----------------------------------------------------------

function productRows(result) {
  if (Array.isArray(result.products)) return listOf(result.products);
  if (result.product && typeof result.product === 'object') return listOf([result.product]);
  return ['string', 'number'].includes(typeof result.id) && typeof result.kind === 'string' ? [result] : [];
}







// -----------------------------------------------------------
// ProductRow
// -----------------------------------------------------------
//
// One product of a card: its title (the kind's name when it
// has none), its status as a chip with the version beside
// it, the run's bar and step while it is being generated,
// the blocking rules a draft breaks — how many, and which,
// in the rules' own sentences, when the answer names them —
// and the notes for its reviewer (as the tool counted them,
// or off the checks of a product read live), and the link to
// its page — a new tab, so the
// conversation stays where it is. A kind with no product yet
// has no version and no link. With `follow` a product being
// generated is read live every 5 s (the tool's answer is a
// snapshot); a live read that fails leaves the row as the
// tool left it.
//
// Used by:
//   - ProductToolCard (below)
// -----------------------------------------------------------

function ProductRow({ row, url = null, follow = false }) {

  const t = useTranslations('PAGES.chat.PRODUCT');
  const tSteps = useTranslations('PAGES.programme.PROGRESS.STEPS');
  const tRules = useTranslations('PAGES.programme.RULES.NAMES');
  const label = useEnumLabel();
  const known = ['string', 'number'].includes(typeof row.id);


  const live = useQuery({
    queryKey: programmeKeys.product(String(row.id)),
    queryFn: () => fetchProduct(row.id),
    enabled: follow && known && isActive(row),
    refetchInterval: (query) => (isActive(query.state.data ?? row) ? 5_000 : false),
  });
  const product = live.data ? { ...row, ...live.data } : row;
  const title = typeof product.title === 'string' && product.title ? product.title : label('productKind', product.kind);
  const { steps, index, percent } = runProgress(product);
  // The tools count the broken rules themselves; a product
  // read live carries its checks instead
  const checked = brokenRules(product.checks);
  const broken = countOf(product.rules?.broken ?? product.brokenRules ?? checked.blocking);
  const notes = countOf(product.rules?.notes ?? product.notes ?? checked.notes);
  // The broken rules by their sentences, where the answer
  // names them and this build knows the rule
  const named = [...new Set(listOf(product.rules?.broken ?? checked.blocking)
    .map((entry) => (typeof entry.rule === 'string' && tRules(entry.rule) !== entry.rule ? tRules(entry.rule) : null))
    .filter((sentence) => typeof sentence === 'string'))];
  const address = [row.url, url].find((value) => typeof value === 'string' && value.startsWith('/')) ?? (known ? productPath(row.id) : null);


  return (
    <div className="py-2 first:pt-0 last:pb-0 border-t border-edge first:border-t-0">
      <div className="font-medium [overflow-wrap:anywhere]">{title}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <ProductStatus status={product.status ?? 'none'} />
        {product.version != null && <span className="text-xs text-muted">{t('version', { version: product.version })}</span>}
      </div>
      {isActive(product) && (
        <div className="mt-2" role="status">
          <LinearProgress variant={percent != null ? 'determinate' : 'indeterminate'} value={percent ?? 0} aria-label={label('productStatus', product.status)} />
          {index >= 0 && <div className="text-xs text-muted mt-1">{tSteps(steps[index])}</div>}
        </div>
      )}
      {broken > 0 && <div className="text-xs mt-1 font-semibold text-red-700">{t('rulesBroken', { count: broken })}</div>}
      {named.length > 0 && (
        <ul className="list-disc m-0 mt-0.5 pl-4 text-xs">
          {named.map((sentence) => <li key={sentence}>{sentence}</li>)}
        </ul>
      )}
      {notes > 0 && <div className="text-xs mt-1 text-muted">{t('notes', { count: notes })}</div>}
      {address && product.status !== 'none' && (
        <Button component={Link} to={address} target="_blank" rel="noopener" aria-label={t('openLabel', { title })} size="small" className="mt-1"
                endIcon={<OpenInNewIcon fontSize="inherit" />}>
          {t('open')}
        </Button>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// ProductToolCard
// -----------------------------------------------------------
//
// startWorkProduct / getWorkProduct: a card once the call
// answered products or a refusal, the
// pill while running, on failure, and for an answer that
// carries neither. A refused start says why — the backend's
// code worded for a work product, or that the generation
// could not be started when the code is not known — and
// still shows the product standing in the way when the
// answer names it. A card of one product follows its
// generation; a list is a snapshot.
//
// Used by:
//   - Messages.jsx — tools.by_name
// -----------------------------------------------------------

export function ProductToolCard(props) {

  const { toolName, result, status, isError } = props;
  const t = useTranslations('PAGES.chat.PRODUCT');
  const tRefusals = useTranslations('PAGES.programme.REFUSALS');
  const toolLabel = useToolLabel(toolName);
  if (toolState(status, isError) !== 'done' || !result || typeof result !== 'object' || Array.isArray(result)) return <ToolPill {...props} />;


  const rows = productRows(result);
  const listed = Array.isArray(result.products);
  const refused = result.started === false;
  if (rows.length === 0 && !listed && !refused) return <ToolPill {...props} />;
  const code = [result.refused, result.code].find((value) => typeof value === 'string' && value);
  const reason = code && tRefusals(code) !== code ? tRefusals(code) : t('refused');


  return (
    <div className="my-2 rounded-md border border-edge bg-canvas p-3 max-w-md text-sm">
      <div className="flex items-center gap-2 mb-1">
        <ArticleOutlinedIcon fontSize="small" className="text-primary" aria-hidden />
        <span className="text-xs text-muted">{toolLabel}</span>
      </div>
      {refused && <div className="mb-2" role="status">{reason}</div>}
      {listed && rows.length === 0 && <div className="text-muted">{t('empty')}</div>}
      {/* The rows in a box of their own: the hairline between two of them must not fall above the first */}
      <div>
        {rows.map((row, index) => <ProductRow key={index} row={row} url={listed ? null : result.url} follow={!listed} />)}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// ActionsToolCard
// -----------------------------------------------------------
//
// getActionRegister: a card once the call answered a
// register — its counts, or its list of actions — and the
// pill while running, on failure, and for an answer that
// carries neither. The counts are told as chips, the late
// first, each a state in words with its number and zeros
// left out; a register without a single action says it is
// empty. The link goes to the company's Actions tab by the
// answer's own address — or, when the answer names none, by
// the company the call asked about — and opens in a new tab,
// so the conversation stays where it is.
//
// Used by:
//   - Messages.jsx — tools.by_name
// -----------------------------------------------------------

export function ActionsToolCard(props) {

  const { toolName, args, result, status, isError } = props;
  const t = useTranslations('PAGES.chat.ACTIONS');
  const toolLabel = useToolLabel(toolName);
  if (toolState(status, isError) !== 'done' || !result || typeof result !== 'object' || Array.isArray(result)) return <ToolPill {...props} />;


  const sent = result.counts && typeof result.counts === 'object' ? result.counts : null;
  if (!sent && !Array.isArray(result.actions)) return <ToolPill {...props} />;
  const counts = Object.fromEntries(REGISTER_COUNTS.map(([state, key]) => [state, countOf(sent?.[key])]));
  const empty = Object.values(counts).every((count) => count === 0) && listOf(result.actions).length === 0;
  const address = typeof result.url === 'string' && result.url.startsWith('/') ? result.url
    : (typeof args?.companyId === 'string' && args.companyId ? companyActionsPath(args.companyId) : null);


  return (
    <div className="my-2 rounded-md border border-edge bg-canvas p-3 max-w-md text-sm">
      <div className="flex items-center gap-2 mb-1">
        <ChecklistOutlinedIcon fontSize="small" className="text-primary" aria-hidden />
        <span className="text-xs text-muted">{toolLabel}</span>
      </div>
      {empty
        ? <div className="text-muted">{t('empty')}</div>
        : <CountChips counts={counts} order={REGISTER_COUNTS.map(([state]) => state)} enumName="actionState" kind="action" />}
      {address && (
        <Button component={Link} to={address} target="_blank" rel="noopener" size="small" className="mt-2" endIcon={<OpenInNewIcon fontSize="inherit" />}>
          {t('open')}
        </Button>
      )}
    </div>
  );
}
