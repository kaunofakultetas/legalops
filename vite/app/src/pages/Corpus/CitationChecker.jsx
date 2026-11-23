// -----------------------------------------------------------
//  [*] CitationChecker — do these article references exist?
//
//  POST /api/corpus/check-citations {citations: [{act,
//  article, paragraph?, point?, claimedHeading?}]} (≤ 50).
//  For students auditing a policy's legal references: each
//  row says whether the provision exists in the act's current
//  version (found / not found / act not in the corpus), shows
//  its real heading and opening text with links, and — when
//  the row states what the article is about — whether that
//  matches (a small model call against the caller's budget,
//  so the form says so).
//
//  A check refused for an empty act or article says so in an
//  alert under the rows (a screen reader hears it at once);
//  each empty field turns aria-invalid and is described by
//  that alert, so it is heard again on the way back to it.
//
//  The rows and the last verdicts are kept in sessionStorage:
//  Back from a provision a verdict linked to finds the rows
//  typed and the answer — without checking (and paying for
//  the heading match) again.
//
//  Split into (root component last):
//
//    MAX_ROWS        — the backend's cap
//    EMPTY_ROW       — a blank citation row
//    ROW_FIELDS      — a row's text fields
//    isRows          — stored rows the form can use
//    isResults       — stored verdicts the tab can show
//    CitationRow     — one input row
//    CitationResult  — one verdict
//    CitationChecker — the tab (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';


// MAX_ITEMS of django corpus/citations.py
const MAX_ROWS = 50;

// One citation, blank
const EMPTY_ROW = { act: '', article: '', paragraph: '', point: '', claimedHeading: '' };

// The text fields every row carries
const ROW_FIELDS = Object.keys(EMPTY_ROW);







// -----------------------------------------------------------
// isRows
// -----------------------------------------------------------
//
// Stored rows the form can use: 1 to MAX_ROWS rows, each
// with every field a string.
//
// Used by:
//   - CitationChecker (below) — useSessionState's check
// -----------------------------------------------------------

function isRows(value) {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_ROWS
    && value.every((row) => row && ROW_FIELDS.every((field) => typeof row[field] === 'string'));
}







// -----------------------------------------------------------
// isResults
// -----------------------------------------------------------
//
// Stored verdicts the tab can show: a list of objects (null
// before any check).
//
// Used by:
//   - CitationChecker (below) — useSessionState's check
// -----------------------------------------------------------

function isResults(value) {
  return value === null || (Array.isArray(value) && value.every((result) => result && typeof result === 'object'));
}







// -----------------------------------------------------------
// CitationRow
// -----------------------------------------------------------
//
// Act (free text with the corpus short titles offered),
// article, paragraph, point and the stated topic. Once a
// check was tried, an empty act or article is invalid and
// described by the form's alert (`describedBy`, its id).
//
// Used by:
//   - CitationChecker (below)
// -----------------------------------------------------------

function CitationRow({ row, acts, onChange, onRemove, invalid, describedBy }) {

  const t = useTranslations('PAGES.corpus.CITATIONS');
  const set = (key) => (e) => onChange({ ...row, [key]: e.target.value });
  const missingAct = invalid && !row.act.trim();
  const missingArticle = invalid && !row.article.trim();


  return (
    <div className="grid grid-cols-2 md:grid-cols-[12rem_6rem_6rem_6rem_1fr_auto] gap-2 items-start">
      {/* The autocomplete's own input props carry its wiring —
          the description joins them, never replaces them */}
      <Autocomplete
        freeSolo options={acts} value={row.act} onInputChange={(_, act) => onChange({ ...row, act })} size="small" className="col-span-2 md:col-span-1"
        renderInput={(params) => (
          <TextField {...params} label={t('act')} required error={missingAct}
                     inputProps={{ ...params.inputProps, 'aria-describedby': missingAct ? describedBy : undefined }} />
        )}
      />
      <TextField size="small" label={t('article')} value={row.article} onChange={set('article')} required error={missingArticle}
                 slotProps={{ htmlInput: { 'aria-describedby': missingArticle ? describedBy : undefined } }} />
      <TextField size="small" label={t('paragraph')} value={row.paragraph} onChange={set('paragraph')} />
      <TextField size="small" label={t('point')} value={row.point} onChange={set('point')} />
      <TextField size="small" label={t('claimedHeading')} value={row.claimedHeading} onChange={set('claimedHeading')} className="col-span-2 md:col-span-1" />
      <IconAction label={t('removeRow')} icon={<RemoveCircleOutlineIcon fontSize="small" />} onClick={onRemove} />
    </div>
  );
}







// -----------------------------------------------------------
// CitationResult
// -----------------------------------------------------------
//
// The verdict with an icon, the real heading, the heading
// match (when a topic was given), the excerpt and links.
//
// Used by:
//   - CitationChecker (below)
// -----------------------------------------------------------

function CitationResult({ result }) {

  const t = useTranslations('PAGES.corpus.CITATIONS');
  const label = useEnumLabel();
  const found = result.status === 'found';
  const Icon = found ? CheckCircleOutlineIcon : result.status === 'not_found' ? HighlightOffIcon : HelpOutlineIcon;
  const asked = [result.act, result.article && `${result.article} str.`, result.paragraph && `${result.paragraph} d.`, result.point && `${result.point} p.`].filter(Boolean).join(' ');


  return (
    <Paper component="li" variant="outlined" className="p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip kind="citation" value={result.status} label={label('citationStatus', result.status)} icon={<Icon />} />
        <Typography variant="subtitle2" component="span">{asked}</Typography>
        {found && result.path && <span className="text-sm text-muted">→ {result.shortTitle} {result.path}</span>}
      </div>
      {found && (
        <>
          <Typography variant="body2"><span className="text-muted">{t('realHeading')}: </span>{result.heading || '—'}</Typography>
          {result.claimedHeading && (
            <div className="flex items-center gap-2 flex-wrap">
              <StatusChip kind="headingMatch" value={result.headingMatch} label={label('headingMatch', result.headingMatch)} />
              {result.note && <Typography variant="caption" color="text.secondary">{result.note}</Typography>}
            </div>
          )}
          {result.excerpt && <Typography variant="body2" className="text-muted line-clamp-3 whitespace-pre-wrap">{result.excerpt}</Typography>}
          <div className="flex gap-3 flex-wrap text-sm">
            {result.unitId && <Link to={`/corpus/${result.documentId}?unit=${result.unitId}`} className="text-primary">{t('openUnit')}</Link>}
            {result.citationUrl && (
              <a href={result.citationUrl} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1">
                {t('official')}<OpenInNewIcon sx={{ fontSize: 14 }} aria-hidden />
              </a>
            )}
          </div>
        </>
      )}
    </Paper>
  );
}







// -----------------------------------------------------------
// CitationChecker (default export)
// -----------------------------------------------------------
//
// Owns the rows and the check mutation; the rows and the
// last verdicts are kept for the tab.
//
// Used by:
//   - Corpus.jsx — the citation checker tab
// -----------------------------------------------------------

export default function CitationChecker() {

  const t = useTranslations('PAGES.corpus.CITATIONS');
  const incompleteId = useId();
  const [rows, setRows] = useSessionState('corpus.citations.rows', [EMPTY_ROW], isRows);
  const [results, setResults] = useSessionState('corpus.citations.results', null, isResults);
  const [tried, setTried] = useState(false);


  const { data: acts = [] } = useQuery({
    queryKey: ['corpus', 'documents', { q: '', jurisdiction: '' }],
    queryFn: async () => (await api.get('/api/corpus/documents')).data.documents,
    select: (documents) => documents.map((d) => d.shortTitle || d.slug).filter(Boolean),
  });


  const check = useMutation({
    mutationFn: async () => (await api.post('/api/corpus/check-citations', {
      citations: rows.map((row) => ({
        act: row.act.trim(), article: row.article.trim(),
        ...(row.paragraph.trim() ? { paragraph: row.paragraph.trim() } : {}),
        ...(row.point.trim() ? { point: row.point.trim() } : {}),
        ...(row.claimedHeading.trim() ? { claimedHeading: row.claimedHeading.trim() } : {}),
      })),
    }, { silent: true })).data.results,
    onSuccess: (answer) => setResults(Array.isArray(answer) ? answer : []),
  });
  const shown = check.isPending || check.error ? null : results;


  const incomplete = rows.some((row) => !row.act.trim() || !row.article.trim());
  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (!incomplete) check.mutate();
  };


  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <Paper component="form" onSubmit={submit} noValidate className="p-4 flex flex-col gap-3">
        <Typography variant="body2">{t('intro')}</Typography>
        {rows.map((row, index) => (
          <CitationRow key={index} row={row} acts={acts} invalid={tried} describedBy={incompleteId}
                       onChange={(next) => setRows(rows.map((r, i) => (i === index ? next : r)))}
                       onRemove={() => setRows(rows.length > 1 ? rows.filter((_, i) => i !== index) : [EMPTY_ROW])} />
        ))}
        {tried && incomplete && <Typography id={incompleteId} variant="caption" color="error" role="alert">{t('rowIncomplete')}</Typography>}
        <div className="flex gap-2 flex-wrap items-center">
          <Button startIcon={<AddIcon />} disabled={rows.length >= MAX_ROWS} onClick={() => setRows([...rows, EMPTY_ROW])}>{t('addRow')}</Button>
          <Button type="submit" variant="contained" loading={check.isPending}>{t('check')}</Button>
        </div>
        {rows.some((row) => row.claimedHeading.trim()) && <Alert severity="info" role="status">{t('costNote')}</Alert>}
      </Paper>
      {check.error && <ErrorState error={check.error} />}
      {shown && (
        <section aria-live="polite" className="flex flex-col gap-2">
          <Typography variant="subtitle1" component="h2">{t('results')}</Typography>
          <ol className="m-0 p-0 list-none flex flex-col gap-2">
            {shown.map((result, index) => <CitationResult key={index} result={result} />)}
          </ol>
        </section>
      )}
    </div>
  );
}
