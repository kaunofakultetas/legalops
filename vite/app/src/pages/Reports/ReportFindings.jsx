// -----------------------------------------------------------
//  [*] ReportFindings — every obligation's verdict
//
//  The findings of a finished report, grouped by legal act
//  or by domain (category), filtered by effective status and
//  severity (toggle buttons with counts) and by a text
//  search. Each finding is a card: verdict + severity chips,
//  a "reviewed" marker when a person overrode the model (the
//  model's verdict in its tooltip), an "unreviewed
//  obligation" marker when the obligation itself was never
//  approved by a person, the obligation title and its legal
//  basis; the disclosure opens the obligation text, the
//  assessment, why the gap exists (the cause — a reviewer's
//  sentence, shown when one was written), what a breach can
//  cost (the consequence — the sanction ceilings the acts
//  provide, in the exports' own words, shown only for a gap
//  of an act that binds the company today, and always with
//  the note that it is a ceiling, not a forecast), the
//  evidence (with quotes; documents open in
//  the document drawer, a cited passage at its place in the
//  text), the recommendation and deadline and the reviewer's
//  note. "Peržiūrėti" opens the review dialog.
//
//  A report may also hold the findings of the company's own
//  requirements — whether its procedures carry out what its
//  policies require. They are gaps between the company's
//  documents, not breaches of law, so they form one group of
//  their own under either grouping, after every other; their
//  cards call the criterion a requirement and cite the
//  passage of the policy it comes from, which opens that
//  document at the quote instead of linking to the law; they
//  carry no "unreviewed obligation" marker.
//
//  A finding of an act that starts to apply on a later date
//  is preparation, not a gap of today: its card says from
//  when the act applies, and grouped by act such acts come
//  last, named with that date and folded until opened.
//
//  A finding whose obligation the company's earlier finished
//  reports assessed too carries that history: a quiet row
//  "Before" on its card with the earlier verdicts, the newest
//  first — the date, then the verdict by its mark and word —
//  each the way to that report's findings.
//
//  Built for reports of hundreds of findings (a demo run has
//  700): a folded group mounts no cards (its accordion
//  unmounts them), an open one shows PAGE_SIZE cards and
//  "Show more" for the next page (ShowMore — the focus moves
//  to the first card revealed), the list follows a deferred
//  copy of the filters so the search box and the toggles
//  answer at once while the list re-renders when React has
//  time, and cards and groups are memoised so a keystroke
//  re-renders neither. The pages opened stay while the list
//  refreshes (a review re-reads the report) and reset with a
//  new filter or grouping — so a card whose review dialog or
//  document drawer is open stays mounted, and the focus goes
//  back to it when they close.
//
//  The action plan can focus the list on the findings one
//  action closes (`focus`); a note (role="status" — it
//  describes the list, it is no alarm) says so and clears it.
//  A focused list opens every group it shows and every
//  focused finding in it, however deep in its group; leaving
//  the focus returns the groups to their defaults.
//
//  Coming back finds the list as it was left. The filters
//  live in the address (?findings.status=missing,partial&
//  findings.severity=high&findings.q=…&findings.group=
//  category — read when the tab mounts; the toggles answer at
//  once and the address follows, the search after a typing
//  pause). The pages opened, the groups the user opened or
//  folded (for the grouping and focus they were toggled in)
//  and the expanded cards are kept per report in
//  sessionStorage; cards and groups read theirs once when
//  they mount, so a toggle re-renders nothing else.
//
//  Split into (root component last):
//
//    GROUP_PARAM     — the grouping's parameter
//    HISTORY_SHOWN   — how many earlier verdicts a card names
//    isPaging        — a stored "Show more" state
//    keptCards       — the report's expanded cards, kept
//    keptGroups      — the report's toggled groups, kept
//    EvidenceList    — the evidence entries with quotes
//    FindingBody     — the expanded details
//    FindingHistory  — the earlier verdicts of its obligation
//    FindingCard     — one finding (memoised)
//    statusCounts    — the filter toggles' counts
//    Filters         — status / severity / search / group-by
//    FindingGroup    — one act's or domain's findings (memoised)
//    groupFindings   — the filtered findings, grouped
//    ReportFindings  — the tab (default export)
// -----------------------------------------------------------

import { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { readSession, writeSession } from '@/utils/sessionStore';
import { listOf, listParam, oneOf } from '@/utils/viewParams';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import useViewParams from '@/hooks/useViewParams';
import StatusChip from '@/components/StatusChip/StatusChip';
import EmptyState from '@/components/EmptyState/EmptyState';
import CitationLinks from '@/pages/Reports/CitationLinks';
import FindingStatusIcon from '@/pages/Reports/FindingStatusIcon';
import ShowMore, { PAGE_SIZE } from '@/pages/Reports/ShowMore';
import useRevealFocus from '@/pages/Reports/useRevealFocus';
import { SEVERITIES } from '@/constants/enums';
import {
  FINDING_STATUSES, OPEN_STATUSES, consequenceText, effectiveStatus, isGap, isInternal, isUpcoming, rowKeys,
} from '@/pages/Reports/reportUtils';


// The grouping's parameter ("act" is the default: absent)
const GROUP_PARAM = 'findings.group';

// How many earlier verdicts a card names (the backend keeps
// one more)
const HISTORY_SHOWN = 3;







// -----------------------------------------------------------
// isPaging
// -----------------------------------------------------------
//
// A stored "Show more" state the tab can use: {key, limits}
// with a whole number of cards per group.
//
// Used by:
//   - ReportFindings (below) — useSessionState's check
// -----------------------------------------------------------

function isPaging(value) {
  return typeof value?.key === 'string' && value.limits && typeof value.limits === 'object'
    && Object.values(value.limits).every((limit) => Number.isInteger(limit) && limit > 0);
}







// -----------------------------------------------------------
// keptCards
// -----------------------------------------------------------
//
//   const cards = keptCards('report.42.findingCards');
//   cards.isOpen('id:7') / cards.set('id:7', true)
//
// The expanded cards of a report (by their row keys), read
// once and written on each toggle — an object, not state: a
// card reads it when it mounts and keeps its own state after,
// so one card's toggle re-renders no other.
//
// Used by:
//   - ReportFindings (below) — handed to every card
// -----------------------------------------------------------

function keptCards(key) {
  const open = new Set(readSession(key, [], (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')));
  return {
    isOpen: (card) => open.has(card),
    set: (card, isOpen) => {
      if (isOpen) open.add(card); else open.delete(card);
      writeSession(key, [...open]);
    },
  };
}







// -----------------------------------------------------------
// keptGroups
// -----------------------------------------------------------
//
//   const groups = keptGroups('report.42.findingGroups');
//   groups.isOpen('act-all', actId) → true | false | undefined
//   groups.set('act-all', actId, false)
//
// The groups the user opened or folded, for one mode (the
// grouping and whether the plan's focus is on — what the
// groups' keys carry): a group of another mode reads
// undefined (its default), and a toggle in a new mode starts
// the memory afresh, so leaving the focus still brings the
// defaults back. Read once, like keptCards.
//
// Used by:
//   - ReportFindings (below) — handed to every group
// -----------------------------------------------------------

function keptGroups(key) {
  const valid = (value) => typeof value?.mode === 'string' && value.open && typeof value.open === 'object'
    && Object.values(value.open).every((flag) => typeof flag === 'boolean');
  let kept = readSession(key, { mode: '', open: {} }, valid);
  return {
    isOpen: (mode, group) => (kept.mode === mode ? kept.open[group] : undefined),
    set: (mode, group, isOpen) => {
      kept = { mode, open: { ...(kept.mode === mode ? kept.open : {}), [group]: isOpen } };
      writeSession(key, kept);
    },
  };
}







// -----------------------------------------------------------
// EvidenceList
// -----------------------------------------------------------
//
// {kind, id, title, quote} entries: the kind as a label,
// the title (a document / passage opens the drawer), the
// quote as a blockquote — the company's own words, so in the
// serif of the sources, drawn with the marker: the passage
// that proves the verdict. A passage also carries documentId
// and charStart (serializers.py) — the drawer opens it at
// its place in the text, the quote marked. Without a
// charStart the document does not hold the quote word for
// word (or, in an older report, the passage is gone): the
// entry says so, and the drawer opens at the document's top.
//
// Used by:
//   - FindingBody (below)
// -----------------------------------------------------------

function EvidenceList({ evidence, onOpenDocument }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const label = useEnumLabel();
  const open = (item) => onOpenDocument(item.documentId || item.id,
    item.kind === 'passage' ? { charStart: item.charStart, quote: item.quote } : null);


  if (!evidence?.length) return <Typography variant="body2" color="text.secondary">{t('noEvidence')}</Typography>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {evidence.map((item, index) => (
        <li key={`${item.id}-${index}`} className="border-l-2 border-edge pl-3 py-0.5">
          <div className="text-sm">
            <span className="text-muted">{label('evidenceKind', item.kind)}: </span>
            {['document', 'passage'].includes(item.kind) && onOpenDocument
              ? <button type="button" className="text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline" onClick={() => open(item)}>{item.title}</button>
              : <span>{item.title}</span>}
          </div>
          {item.quote && <blockquote className="m-0 mt-1 font-serif text-sm leading-relaxed text-content"><span className="marked">„{item.quote}“</span></blockquote>}
          {item.kind === 'passage' && item.quote && !Number.isInteger(item.charStart) && (
            <div className="mt-1 text-xs text-muted">{t('quoteNotPlaced')}</div>
          )}
        </li>
      ))}
    </ul>
  );
}







// -----------------------------------------------------------
// FindingBody
// -----------------------------------------------------------
//
// The expanded finding: obligation, assessment, cause,
// consequence, evidence, recommendation, deadline, reviewer's
// note. The obligation is the law's duty — or, for a finding
// of the company's own requirements, the requirement its
// policy states, and named so — set in the serif at reading
// size; the assessment and the advice are the analysis
// speaking, in the sans. The cause shows whenever a reviewer
// wrote one. The consequence shows for a gap that carries
// sanction tiers (reportUtils consequenceText), with the
// quiet line under it saying what the figure is: the ceiling
// the act provides, never a forecast of the fine. A finding
// of an act that only starts to apply later is preparation:
// no sanction stands behind it yet, so it shows none — also
// when an older report kept tiers on it; "preparation" and a
// sanction never appear on one card.
//
// Used by:
//   - FindingCard (below)
// -----------------------------------------------------------

function FindingBody({ finding, onOpenDocument }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const tConsequence = useTranslations('PAGES.report.CONSEQUENCE');
  const fmt = useFormat();
  const consequence = isGap(finding) && !isUpcoming(finding) ? consequenceText(finding, tConsequence) : '';
  const block = (title, body) => (
    <div className="flex flex-col gap-1">
      <Typography variant="caption" color="text.secondary" component="h4" className="font-semibold">{title}</Typography>
      {body}
    </div>
  );


  return (
    <div className="flex flex-col gap-3.5 mt-2 pt-3 border-t border-edge">
      {finding.obligationText && block(t(isInternal(finding) ? 'requirement' : 'obligation'),
        <Typography className="whitespace-pre-wrap font-serif max-w-[72ch] leading-relaxed">{finding.obligationText}</Typography>)}
      {finding.analysis && block(t('analysis'), <Typography variant="body2" className="whitespace-pre-wrap">{finding.analysis}</Typography>)}
      {finding.cause && block(t('cause'), <Typography variant="body2" className="whitespace-pre-wrap">{finding.cause}</Typography>)}
      {consequence && block(t('consequence'), (
        <>
          <Typography variant="body2">{consequence}</Typography>
          <Typography variant="caption" color="text.secondary">{t('ceiling')}</Typography>
        </>
      ))}
      {block(t('evidence'), <EvidenceList evidence={finding.evidence} onOpenDocument={onOpenDocument} />)}
      {finding.recommendation && block(t('recommendation'), <Typography variant="body2" className="whitespace-pre-wrap">{finding.recommendation}</Typography>)}
      {finding.deadline && block(t('deadline'), <Typography variant="body2">{finding.deadline}</Typography>)}
      {(finding.reviewerNote || finding.reviewedAt) && block(
        t('reviewerNote'),
        <div className="rounded bg-canvas p-2">
          {finding.reviewerNote && <Typography variant="body2" className="whitespace-pre-wrap">{finding.reviewerNote}</Typography>}
          {finding.reviewedAt && <Typography variant="caption" color="text.secondary">{t('reviewed', { date: fmt.dateTime(finding.reviewedAt) })}</Typography>}
        </div>,
      )}
    </div>
  );
}







// -----------------------------------------------------------
// FindingHistory
// -----------------------------------------------------------
//
// How the finding's obligation stood in the company's
// earlier finished reports, as one quiet row: the newest
// HISTORY_SHOWN of them, each the date and the verdict — its
// mark beside its word, so it is not the colour alone — and
// a link to that report's findings. Nothing for a finding
// assessed for the first time.
//
// Used by:
//   - FindingCard (below)
// -----------------------------------------------------------

function FindingHistory({ history }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const rows = (Array.isArray(history) ? history : []).filter((row) => row && typeof row === 'object').slice(0, HISTORY_SHOWN);


  if (rows.length === 0) return null;
  return (
    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-muted">
      <span>{t('before')}</span>
      <ul className="m-0 p-0 list-none flex gap-x-4 gap-y-0.5 flex-wrap" aria-label={t('before')}>
        {rows.map((row, index) => {
          const words = <>{fmt.date(row.date)} — <FindingStatusIcon status={row.status} sx={{ fontSize: 14 }} />{label('findingStatus', row.status)}</>;
          return (
            <li key={`${row.reportId}-${index}`}>
              {row.reportId
                ? <Link to={`/reports/${row.reportId}?tab=findings`} className="inline-flex items-center gap-1 text-primary">{words}</Link>
                : <span className="inline-flex items-center gap-1">{words}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}







// -----------------------------------------------------------
// FindingCard
// -----------------------------------------------------------
//
// One finding; the title is the disclosure button
// (aria-expanded — and the focus target when "Show more"
// reveals this card), the markers carry tooltips — among
// them the date from which the finding's act applies, when
// that is still ahead. It starts
// expanded when `cards` (keptCards) remembers it so, and
// tells it every toggle. A finding of the company's own
// requirements speaks of a requirement where the others
// speak of an obligation, its criterion — the passage of
// the policy — opens the company document, and it never
// carries the "unreviewed obligation" mark: there is no
// register such a requirement could be reviewed in, and the
// card quotes its criterion. Under the legal basis stands
// what the earlier reports made of the same obligation
// (FindingHistory). Memoised: a card
// re-renders only when its finding (or a handler) changes,
// not with every change of the list around it.
//
// Used by:
//   - FindingGroup (below)
// -----------------------------------------------------------

const FindingCard = memo(function FindingCard({ finding, cardKey, cards, documentId, onReview, onOpenDocument }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const [open, setOpen] = useState(() => cards.isOpen(cardKey));
  const status = effectiveStatus(finding);
  const internal = isInternal(finding);


  const toggle = () => {
    setOpen(!open);
    cards.set(cardKey, !open);
  };


  return (
    <Paper variant="outlined" className="p-3 flex flex-col gap-2" id={`finding-${finding.id}`} data-reveal-row>
      <div className="flex items-center gap-1 flex-wrap">
        <StatusChip kind="finding" value={status} label={label('findingStatus', status)} icon={<FindingStatusIcon status={status} />} />
        <StatusChip kind="severity" value={finding.severity} label={label('severity', finding.severity)} />
        {finding.overrideStatus && (
          <Tooltip title={t('overriddenHint', { status: label('findingStatus', finding.status) })}>
            <Chip size="small" variant="outlined" icon={<RateReviewOutlinedIcon />} label={t('overridden')} tabIndex={0} />
          </Tooltip>
        )}
        {isUpcoming(finding) && (
          <Tooltip title={t('upcomingHint')}>
            <Chip size="small" variant="outlined" icon={<EventOutlinedIcon />} label={t('appliesFrom', { date: fmt.date(finding.appliesFrom) })} tabIndex={0} />
          </Tooltip>
        )}
        {finding.obligationReviewed === false && !internal && (
          <Tooltip title={t('unreviewedHint')}>
            <Chip size="small" variant="outlined" icon={<WarningAmberOutlinedIcon />} label={t('unreviewedObligation')} tabIndex={0} className="text-muted" />
          </Tooltip>
        )}
        <span className="text-xs text-muted ml-1">{label('category', finding.category)}</span>
      </div>
      <button type="button" onClick={toggle} aria-expanded={open} data-reveal-focus
              aria-label={`${finding.obligationTitle} — ${open ? t('collapse') : t('expand')}`}
              className="flex items-start justify-between gap-2 text-left bg-transparent border-0 p-0 cursor-pointer text-content">
        <Typography variant="subtitle2" component="span" className="font-semibold">{finding.obligationTitle}</Typography>
        {open ? <ExpandLessIcon aria-hidden /> : <ExpandMoreIcon aria-hidden />}
      </button>
      <CitationLinks citations={finding.citations} documentId={documentId} onOpenDocument={internal ? onOpenDocument : null} />
      <FindingHistory history={finding.history} />
      {open && <FindingBody finding={finding} onOpenDocument={onOpenDocument} />}
      <div><Button size="small" startIcon={<RateReviewOutlinedIcon />} onClick={() => onReview(finding)}>{t('review')}</Button></div>
    </Paper>
  );
});







// -----------------------------------------------------------
// statusCounts
// -----------------------------------------------------------
//
//   statusCounts(findings) → { status: {missing: 3, …}, severity: {high: 5, …} }
//
// How many findings hold each effective status and each
// severity — the toggles' counts, taken over the whole report
// in one pass (memoised on the findings, so typing in the
// search counts nothing).
//
// Used by:
//   - ReportFindings (below)
// -----------------------------------------------------------

function statusCounts(findings) {
  const counts = { status: {}, severity: {} };
  for (const finding of findings) {
    const status = effectiveStatus(finding);
    counts.status[status] = (counts.status[status] || 0) + 1;
    counts.severity[finding.severity] = (counts.severity[finding.severity] || 0) + 1;
  }
  return counts;
}







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// Multi-select status and severity toggles (with counts in
// the current report), the search box and the grouping. They
// hold the live filters — the list reads a deferred copy.
//
// Used by:
//   - ReportFindings (below)
// -----------------------------------------------------------

function Filters({ counts, filters, setFilters }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const label = useEnumLabel();


  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Typography variant="caption" color="text.secondary" id="finding-status-filter">{t('status')}</Typography>
        <ToggleButtonGroup size="small" value={filters.statuses} aria-labelledby="finding-status-filter" className="flex-wrap"
                           onChange={(_, statuses) => setFilters({ ...filters, statuses })}>
          {FINDING_STATUSES.map((status) => (
            <ToggleButton key={status} value={status} className="gap-1 normal-case">
              <FindingStatusIcon status={status} fontSize="small" />{label('findingStatus', status)} ({counts.status[status] || 0})
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div className="flex flex-col gap-1">
        <Typography variant="caption" color="text.secondary" id="finding-severity-filter">{t('severity')}</Typography>
        <ToggleButtonGroup size="small" value={filters.severities} aria-labelledby="finding-severity-filter" className="flex-wrap"
                           onChange={(_, severities) => setFilters({ ...filters, severities })}>
          {SEVERITIES.map((severity) => (
            <ToggleButton key={severity} value={severity} className="normal-case">{label('severity', severity)} ({counts.severity[severity] || 0})</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div className="flex gap-3 flex-wrap items-end">
        <TextField size="small" label={t('search')} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="w-72 max-w-full"
                   slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <div className="flex flex-col gap-1">
          <Typography variant="caption" color="text.secondary" id="finding-group-by">{t('groupBy')}</Typography>
          <ToggleButtonGroup size="small" exclusive value={filters.groupBy} aria-labelledby="finding-group-by"
                             onChange={(_, groupBy) => groupBy && setFilters({ ...filters, groupBy })}>
            <ToggleButton value="act" className="normal-case">{t('groupAct')}</ToggleButton>
            <ToggleButton value="category" className="normal-case">{t('groupCategory')}</ToggleButton>
          </ToggleButtonGroup>
        </div>
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// FindingGroup
// -----------------------------------------------------------
//
// An accordion titled with the act / domain and its counts
// (an act that applies later also with that date, the
// company's own requirements with what their findings are);
// open by default when it holds open findings of an act in
// force,
// or when the list is focused on the plan's findings —
// unless `groups`
// (keptGroups) remembers the user opening or folding it in
// this `mode`; every toggle is remembered. Folded, it mounts
// no cards (unmountOnExit); open, it shows the first
// `limit` cards and ShowMore for the next page, which hands
// the new limit up (the pages live in ReportFindings, so a
// refresh keeps them) and moves the focus to the first card
// revealed. Cards are keyed by the tab's keyOf (reportUtils
// rowKeys). Memoised, like the cards.
//
// Used by:
//   - ReportFindings (below)
// -----------------------------------------------------------

const FindingGroup = memo(function FindingGroup({ group, mode, limit, focused, keyOf, cards, groups, onMore, onReview, onOpenDocument }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const fmt = useFormat();
  const listRef = useRef(null);
  const reveal = useRevealFocus(listRef, limit);
  const open = group.findings.filter((f) => OPEN_STATUSES.includes(effectiveStatus(f))).length;
  const shown = group.findings.slice(0, limit);


  return (
    <Accordion defaultExpanded={groups.isOpen(mode, group.key) ?? (focused || (open > 0 && !group.appliesFrom))}
               onChange={(_, expanded) => groups.set(mode, group.key, expanded)}
               disableGutters variant="outlined" slotProps={{ transition: { unmountOnExit: true } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <div className="flex flex-col">
          <Typography className="font-semibold">{group.label}</Typography>
          <Typography variant="caption" color="text.secondary">
            {group.appliesFrom && `${t('groupUpcoming', { date: fmt.date(group.appliesFrom) })} · `}
            {group.internal && `${t('groupInternal')} · `}
            {t('groupSummary', { count: group.findings.length, open })}
          </Typography>
        </div>
      </AccordionSummary>
      <AccordionDetails className="flex flex-col gap-2">
        <div ref={listRef} className="flex flex-col gap-2">
          {shown.map((finding) => (
            <FindingCard key={keyOf.get(finding)} finding={finding} cardKey={keyOf.get(finding)} cards={cards}
                         documentId={group.documentIdFor(finding)} onReview={onReview} onOpenDocument={onOpenDocument} />
          ))}
        </div>
        <ShowMore shown={shown.length} total={group.findings.length} onMore={() => { reveal(shown.length); onMore(group.key, limit + PAGE_SIZE); }} />
      </AccordionDetails>
    </Accordion>
  );
});







// -----------------------------------------------------------
// groupFindings
// -----------------------------------------------------------
//
// The findings the filters (and the plan's focus) let
// through, grouped by act or by domain, with how many they
// are. Groups appear in the order of their first finding —
// the pipeline stores the findings worst first, so the act
// (or domain) with the worst verdict leads; the acts that
// apply only from a later date (their group carries the
// date) then go last, and domains are sorted by how many open
// findings they hold. The findings of the company's own
// requirements are one group under either grouping, named
// after their act row and marked `internal`: they are never
// spread over the domains among the breaches of law, and
// their group comes after every other.
//
// Used by:
//   - ReportFindings (below)
// -----------------------------------------------------------

function groupFindings(findings, filters, focus, actsById, label) {
  const needle = filters.q.trim().toLowerCase();
  const documentIdFor = (finding) => actsById[finding.actId]?.documentId ?? null;
  const groups = [];
  const byKey = new Map();
  let shown = 0;
  for (const finding of findings) {
    const status = effectiveStatus(finding);
    if (focus && !focus.ids.includes(finding.id)) continue;
    if (filters.statuses.length && !filters.statuses.includes(status)) continue;
    if (filters.severities.length && !filters.severities.includes(finding.severity)) continue;
    if (needle && ![finding.obligationTitle, finding.obligationText, finding.analysis, finding.recommendation]
      .some((text) => text?.toLowerCase().includes(needle))) continue;
    shown += 1;
    const act = actsById[finding.actId];
    const internal = isInternal(finding);
    const byAct = filters.groupBy === 'act' || internal;
    const key = byAct ? (finding.actId || finding.shortTitle || finding.documentTitle) : finding.category;
    if (!byKey.has(key)) {
      const groupLabel = byAct
        ? (act?.shortTitle || finding.shortTitle || finding.documentTitle || '—')
        : label('category', finding.category);
      const appliesFrom = filters.groupBy === 'act' && isUpcoming(finding) ? finding.appliesFrom : null;
      const group = { key, label: groupLabel, findings: [], documentIdFor, appliesFrom, internal };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).findings.push(finding);
  }
  if (filters.groupBy === 'category') {
    const openCount = (g) => g.findings.filter((f) => OPEN_STATUSES.includes(effectiveStatus(f))).length;
    groups.sort((a, b) => (a.internal - b.internal) || openCount(b) - openCount(a));
  } else {
    groups.sort((a, b) => (a.internal - b.internal) || Boolean(a.appliesFrom) - Boolean(b.appliesFrom));
  }
  return { shown, groups };
}







// -----------------------------------------------------------
// ReportFindings (default export)
// -----------------------------------------------------------
//
//   <ReportFindings report={…} focus={{ids, title}} onClearFocus
//                   onReview={(finding) => …}
//                   onOpenDocument={(id, passage) => …} />
//
// `passage` is {charStart, quote} for a passage's link —
// with `criterion` for the passage of a policy an own
// requirement is measured against — null
// for a whole document's. The filters are read from the
// address when the tab mounts — ReportDetail keys it by the
// report, so another report starts from its own address.
//
// Used by:
//   - ReportDetail.jsx — the findings tab
// -----------------------------------------------------------

export default function ReportFindings({ report, focus, onClearFocus, onReview, onOpenDocument }) {

  const t = useTranslations('PAGES.report.FINDINGS');
  const label = useEnumLabel();
  const [params, setView] = useViewParams();
  const findings = useMemo(() => (Array.isArray(report.findings) ? report.findings : []), [report.findings]);
  // A finding without an id, or repeating one, still shows
  const keyOf = useMemo(() => rowKeys(findings), [findings]);
  const counts = useMemo(() => statusCounts(findings), [findings]);
  const actsById = useMemo(() => Object.fromEntries((report.acts || []).map((a) => [a.id, a])), [report.acts]);
  const cards = useMemo(() => keptCards(`report.${report.id}.findingCards`), [report.id]);
  const groupMemory = useMemo(() => keptGroups(`report.${report.id}.findingGroups`), [report.id]);


  // The toggles and the grouping answer at once, and the
  // address follows (it renders in a transition — the toggle
  // would wait for the list); the search box types into a
  // draft the address gets after a pause
  const [choice, setChoice] = useState(() => ({
    statuses: listOf(params.get('findings.status'), FINDING_STATUSES),
    severities: listOf(params.get('findings.severity'), SEVERITIES),
    groupBy: oneOf(params.get(GROUP_PARAM), ['category'], 'act'),
  }));
  const [q, setQ] = useDraftText((params.get('findings.q') ?? '').trim(), (text) => setView({ 'findings.q': text }));
  const filters = useMemo(() => ({ ...choice, q }), [choice, q]);
  const setFilters = (next) => {
    setChoice({ statuses: next.statuses, severities: next.severities, groupBy: next.groupBy });
    if (next.q !== q) setQ(next.q);
    setView({
      'findings.status': listParam(next.statuses),
      'findings.severity': listParam(next.severities),
      [GROUP_PARAM]: next.groupBy === 'act' ? null : next.groupBy,
    });
  };


  // The list follows a deferred copy of the filters: the box
  // and the toggles re-render at once, the list when React
  // has time (a newer keystroke interrupts it)
  const listed = useDeferredValue(filters);
  const { shown, groups } = useMemo(() => groupFindings(findings, listed, focus, actsById, label),
    [findings, listed, focus, actsById, label]);
  // The groups' mode: what their keys carry besides the group
  const mode = `${listed.groupBy}-${focus ? 'focus' : 'all'}`;


  // The pages opened per group ("Show more"), valid for one
  // filter, grouping and focus — a new one (even one met
  // before) starts every group on its first page, reset here
  // during the render; a refresh of the report keeps them, and
  // so does leaving the page (sessionStorage, per report).
  // onMore depends on the key alone, so a keystroke leaves the
  // memoised groups untouched
  const pageKey = JSON.stringify([listed.statuses, listed.severities, listed.q.trim(), listed.groupBy, focus?.ids ?? null]);
  const [paging, setPaging] = useSessionState(`report.${report.id}.findingPages`, { key: pageKey, limits: {} }, isPaging);
  if (paging.key !== pageKey) setPaging({ key: pageKey, limits: {} });
  const onMore = useCallback((groupKey, limit) => setPaging((current) => (
    { key: pageKey, limits: { ...(current.key === pageKey ? current.limits : {}), [groupKey]: limit } })), [pageKey, setPaging]);
  // A focused list (the plan's findings) shows them all
  const limitOf = (group) => (focus ? group.findings.length
    : (paging.key === pageKey && paging.limits[group.key]) || PAGE_SIZE);
  const filtered = Boolean(filters.statuses.length || filters.severities.length || filters.q.trim());


  if (findings.length === 0) return <EmptyState title={t('none')} />;
  return (
    <div className="flex flex-col gap-4">
      <Paper className="p-4"><Filters counts={counts} filters={filters} setFilters={setFilters} /></Paper>
      {focus && (
        <Alert severity="info" role="status" action={<Button color="inherit" size="small" onClick={onClearFocus}>{t('focusClear')}</Button>}>
          {t('focused', { title: focus.title })}
        </Alert>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap" aria-live="polite">
        <Typography variant="body2" color="text.secondary">{t('count', { shown, total: findings.length })}</Typography>
        {filtered && <Button size="small" onClick={() => setFilters({ ...filters, statuses: [], severities: [], q: '' })}>{t('clear')}</Button>}
      </div>
      {shown === 0
        ? <EmptyState title={t('empty')} />
        : groups.map((group) => (
          // The focus is in the key: entering or leaving it mounts
          // the groups afresh, so their default opening applies
          <FindingGroup key={`${mode}-${group.key}`} group={group} mode={mode} limit={limitOf(group)} focused={Boolean(focus)}
                        keyOf={keyOf} cards={cards} groups={groupMemory} onMore={onMore} onReview={onReview} onOpenDocument={onOpenDocument} />
        ))}
    </div>
  );
}
