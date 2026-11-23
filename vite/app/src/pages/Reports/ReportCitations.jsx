// -----------------------------------------------------------
//  [*] ReportCitations — the citation audit of the documents
//
//  report.citations: every reference the company's documents
//  make to a specific legal provision, checked against the
//  corpus when the report ran (django analysis/pipeline.py
//  step_citations). Each is a card: the verdict chip —
//  correct / wrong provision / no such provision / act not in
//  the corpus / could not judge — the document (it opens in
//  the document drawer), the reference as written with what
//  the document claims it covers and the quote; for a found
//  provision its real heading, the judge's note (and a word
//  when the word overlap had to judge instead of the model),
//  an excerpt and its links (CitationLinks — the corpus
//  viewer, the official text); for a missing one the act in
//  the corpus.
//
//  Problems first — the order the pipeline stored — with
//  verdict toggles (counts per verdict), a text filter over
//  the document, the reference, the claim, the quote, the
//  heading and the note, and PAGE_SIZE cards before "Show
//  more" (the list follows a deferred copy of the filters,
//  like the findings). A report from before the audit (no
//  stats.citations) says the audit was not run for it; one
//  whose documents cite no provision says that instead.
//
//  Coming back finds the list as it was left: the filters in
//  the address (?citations.verdict=mismatch,not_found&
//  citations.q=… — read when the tab mounts; the toggles
//  answer at once, the search after a typing pause), the
//  pages shown in sessionStorage, per report.
//
//  Split into (root component last):
//
//    VERDICT_ICONS   — the shape each verdict wears
//    isPage          — a stored "Show more" state
//    citedAs         — the reference in the UI's citation style
//    CitationCard    — one reference (memoised)
//    Filters         — the verdict toggles and the search
//    matches         — does a reference pass the filters
//    ReportCitations — the tab (default export)
// -----------------------------------------------------------

import { memo, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { useTranslations } from '@/i18n';
import { listOf, listParam } from '@/utils/viewParams';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import useViewParams from '@/hooks/useViewParams';
import EmptyState from '@/components/EmptyState/EmptyState';
import StatusChip from '@/components/StatusChip/StatusChip';
import CitationLinks from '@/pages/Reports/CitationLinks';
import ShowMore, { PAGE_SIZE } from '@/pages/Reports/ShowMore';
import useRevealFocus from '@/pages/Reports/useRevealFocus';
import { CITATION_VERDICTS, PROBLEM_VERDICTS, citationAudit, citationVerdict, rowKeys } from '@/pages/Reports/reportUtils';


// The verdict's shape next to its word and colour — the
// meaning never rests on the colour alone
const VERDICT_ICONS = {
  match: CheckCircleOutlineIcon,
  mismatch: ErrorOutlineIcon,
  not_found: HighlightOffIcon,
  act_not_in_corpus: RemoveCircleOutlineIcon,
  unknown: HelpOutlineIcon,
};







// -----------------------------------------------------------
// isPage
// -----------------------------------------------------------
//
// A stored "Show more" state the tab can use: {key, limit}
// with a whole, positive number of cards.
//
// Used by:
//   - ReportCitations (below) — useSessionState's check
// -----------------------------------------------------------

function isPage(value) {
  return typeof value?.key === 'string' && Number.isInteger(value.limit) && value.limit > 0;
}







// -----------------------------------------------------------
// citedAs
// -----------------------------------------------------------
//
//   citedAs(t, row) → "MiCA 63 str. 2 d. a p." (lt)
//                     "MiCA Art. 63 para. 2 point a" (en)
//
// The reference as the document made it — act, article,
// paragraph, point — in the UI language's citation style
// (the quote below it carries the document's own wording).
//
// Used by:
//   - CitationCard, matches (below)
// -----------------------------------------------------------

function citedAs(t, row) {
  return [
    row.act,
    row.article ? t('article', { number: row.article }) : null,
    row.paragraph ? t('paragraph', { number: row.paragraph }) : null,
    row.point ? t('point', { number: row.point }) : null,
  ].filter(Boolean).join(' ');
}







// -----------------------------------------------------------
// CitationCard
// -----------------------------------------------------------
//
// One reference: the verdict chip, the document (a button
// into the document drawer while the document exists), the
// reference, the claim and the quote; what the corpus holds
// under that number follows (heading, the judge's note, an
// excerpt and the links), or why nothing could be shown. The
// reference and the quote are set in the serif of the
// sources. The card takes the focus when "Show more"
// reveals it.
//
// Used by:
//   - ReportCitations (below)
// -----------------------------------------------------------

const CitationCard = memo(function CitationCard({ row, onOpenDocument }) {

  const t = useTranslations('PAGES.report.CITATIONS');
  const label = useEnumLabel();
  const verdict = citationVerdict(row);
  const Icon = VERDICT_ICONS[verdict];
  const found = row.status === 'found';
  const provision = [row.shortTitle, row.unitPath].filter(Boolean).join(' ');
  const links = found && row.unitId
    ? [{ unitId: row.unitId, path: row.unitPath, documentTitle: row.shortTitle, url: row.citationUrl }]
    : null;


  return (
    <Paper component="li" variant="outlined" className="p-3 flex flex-col gap-2 outline-offset-2" tabIndex={-1} data-reveal-row>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip kind="citationVerdict" value={verdict} label={label('citationVerdict', verdict)} icon={<Icon />} />
        <span className="text-sm text-muted">{t('document')}:</span>
        {row.documentId && onOpenDocument
          ? <button type="button" className="text-sm text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline" onClick={() => onOpenDocument(row.documentId)}>{row.documentTitle}</button>
          : <span className="text-sm">{row.documentTitle}</span>}
      </div>
      <Typography variant="subtitle2" component="p" className="font-serif font-semibold">{citedAs(t, row)}</Typography>
      {row.claim && <Typography variant="body2"><span className="text-muted">{t('claim')}: </span>{row.claim}</Typography>}
      {row.quote && <blockquote className="m-0 font-serif text-sm leading-relaxed">„{row.quote}“</blockquote>}

      {found && (
        <div className="flex flex-col gap-1 border-l-2 border-edge pl-3">
          <Typography variant="body2">
            <span className="text-muted">{t('actual', { provision })}: </span>{row.heading || '—'}
          </Typography>
          {row.note && <Typography variant="body2"><span className="text-muted">{t('note')}: </span>{row.note}</Typography>}
          {row.judgedBy === 'overlap' && <Typography variant="caption" color="text.secondary">{t('overlap')}</Typography>}
          {row.excerpt && <Typography variant="body2" className="text-muted line-clamp-3 whitespace-pre-wrap">{row.excerpt}</Typography>}
          {links && <CitationLinks citations={links} documentId={row.legalDocumentId} />}
        </div>
      )}
      {row.status === 'not_found' && (
        <Typography variant="body2" color="text.secondary">
          {t('notFound', { act: row.shortTitle || row.act })}
          {row.legalDocumentId && <> <Link to={`/corpus/${row.legalDocumentId}`} className="text-primary">{t('openAct', { act: row.shortTitle || row.act })}</Link></>}
        </Typography>
      )}
      {row.status === 'act_not_in_corpus' && <Typography variant="body2" color="text.secondary">{t('notInCorpus')}</Typography>}
    </Paper>
  );
});







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// Multi-select verdict toggles (each with its count in the
// report) and the search box — the live filters; the list
// reads a deferred copy.
//
// Used by:
//   - ReportCitations (below)
// -----------------------------------------------------------

function Filters({ counts, filters, setFilters }) {

  const t = useTranslations('PAGES.report.CITATIONS');
  const label = useEnumLabel();


  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Typography variant="caption" color="text.secondary" id="citation-verdict-filter">{t('verdict')}</Typography>
        <ToggleButtonGroup size="small" value={filters.verdicts} aria-labelledby="citation-verdict-filter" className="flex-wrap"
                           onChange={(_, verdicts) => setFilters({ ...filters, verdicts })}>
          {CITATION_VERDICTS.map((verdict) => {
            const Icon = VERDICT_ICONS[verdict];
            return (
              <ToggleButton key={verdict} value={verdict} className="gap-1 normal-case">
                <Icon fontSize="small" aria-hidden />{label('citationVerdict', verdict)} ({counts[verdict] || 0})
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
      </div>
      <TextField size="small" label={t('search')} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="w-80 max-w-full"
                 slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
    </div>
  );
}







// -----------------------------------------------------------
// matches
// -----------------------------------------------------------
//
// Does a reference pass the filters: its verdict among the
// chosen ones (none chosen = all), and the search text (any
// case) in its document, reference, claim, quote, heading or
// note.
//
// Used by:
//   - ReportCitations (below)
// -----------------------------------------------------------

function matches(t, row, filters) {
  if (filters.verdicts.length && !filters.verdicts.includes(citationVerdict(row))) return false;
  const needle = filters.q.trim().toLowerCase();
  if (!needle) return true;
  return [row.documentTitle, citedAs(t, row), row.claim, row.quote, row.heading, row.note, row.shortTitle, row.unitPath]
    .some((text) => typeof text === 'string' && text.toLowerCase().includes(needle));
}







// -----------------------------------------------------------
// ReportCitations (default export)
// -----------------------------------------------------------
//
//   <ReportCitations report={…} onOpenDocument={(id) => …} />
//
// Owns the filters (from the address when it mounts —
// ReportDetail keys it by the report) and the page shown;
// the rows keep the server's order (problems first).
//
// Used by:
//   - ReportDetail.jsx — the citations tab
// -----------------------------------------------------------

export default function ReportCitations({ report, onOpenDocument }) {

  const t = useTranslations('PAGES.report.CITATIONS');
  const audit = citationAudit(report);
  const rows = useMemo(() => (Array.isArray(report.citations) ? report.citations.filter((row) => row && typeof row === 'object') : []),
    [report.citations]);
  const keyOf = useMemo(() => rowKeys(rows), [rows]);
  const counts = useMemo(() => {
    const byVerdict = {};
    for (const row of rows) byVerdict[citationVerdict(row)] = (byVerdict[citationVerdict(row)] || 0) + 1;
    return byVerdict;
  }, [rows]);
  const [params, setView] = useViewParams();


  // The toggles answer at once and the address follows; the
  // search box types into a draft the address gets after a
  // pause
  const [verdicts, setVerdicts] = useState(() => listOf(params.get('citations.verdict'), CITATION_VERDICTS));
  const [q, setQ] = useDraftText((params.get('citations.q') ?? '').trim(), (text) => setView({ 'citations.q': text }));
  const filters = useMemo(() => ({ verdicts, q }), [verdicts, q]);
  const setFilters = (next) => {
    setVerdicts(next.verdicts);
    if (next.q !== q) setQ(next.q);
    setView({ 'citations.verdict': listParam(next.verdicts) });
  };
  const listed = useDeferredValue(filters);
  const shown = useMemo(() => rows.filter((row) => matches(t, row, listed)), [rows, listed, t]);


  // The page shown ("Show more"), for one filter — a new
  // filter (even one met before) starts on the first page
  // again, reset here during the render; leaving the page
  // keeps it (sessionStorage, per report)
  const pageKey = JSON.stringify([listed.verdicts, listed.q.trim()]);
  const [paging, setPaging] = useSessionState(`report.${report.id}.citationPages`, { key: pageKey, limit: PAGE_SIZE }, isPage);
  if (paging.key !== pageKey) setPaging({ key: pageKey, limit: PAGE_SIZE });
  const limit = paging.key === pageKey ? paging.limit : PAGE_SIZE;
  const listRef = useRef(null);
  const reveal = useRevealFocus(listRef, limit);
  const problems = PROBLEM_VERDICTS.reduce((sum, verdict) => sum + (counts[verdict] || 0), 0);
  const filtered = Boolean(filters.verdicts.length || filters.q.trim());


  if (!audit) return <EmptyState icon={GavelOutlinedIcon} title={t('notRun')} text={t('notRunText')} />;
  if (rows.length === 0) return <EmptyState icon={GavelOutlinedIcon} title={t('none')} text={t('noneText')} />;
  return (
    <div className="flex flex-col gap-4">
      <Paper className="p-4 flex flex-col gap-3">
        <Typography variant="body2" color="text.secondary">{t('intro')}</Typography>
        <Filters counts={counts} filters={filters} setFilters={setFilters} />
      </Paper>
      <div className="flex items-center justify-between gap-2 flex-wrap" aria-live="polite">
        <Typography variant="body2" color="text.secondary">{t('count', { shown: shown.length, total: rows.length, problems })}</Typography>
        {filtered && <Button size="small" onClick={() => setFilters({ verdicts: [], q: '' })}>{t('clear')}</Button>}
      </div>
      {shown.length === 0 ? <EmptyState title={t('empty')} /> : (
        <>
          <ul ref={listRef} className="m-0 p-0 list-none flex flex-col gap-2" aria-label={t('list')}>
            {shown.slice(0, limit).map((row) => <CitationCard key={keyOf.get(row)} row={row} onOpenDocument={onOpenDocument} />)}
          </ul>
          <ShowMore shown={Math.min(limit, shown.length)} total={shown.length}
                    onMore={() => { reveal(limit); setPaging({ key: pageKey, limit: limit + PAGE_SIZE }); }} />
        </>
      )}
    </div>
  );
}
