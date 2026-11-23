// -----------------------------------------------------------
//  [*] ObligationsPanel — the obligation review list
//
//  GET /api/obligations?document=&status=&category=&q=
//  &verification=&order=&limit= → {obligations, total};
//  severity filters the loaded rows.
//  One panel for the admin review queue (/obligations, act
//  picker shown) and for an act's obligations tab (act
//  fixed). Admins select rows and approve / reject / set
//  back to proposed in bulk (POST /api/obligations/review,
//  ≤ 500 ids per call — a larger selection goes in chunks;
//  an older backend without the route falls back to one
//  PATCH per row; a refused review keeps the selection for
//  another try), or per row with the icon actions. A row —
//  or its title, a button a keyboard reaches — opens the
//  edit dialog. Users see the same list read-only (the title
//  is their only door to an obligation's details). A delete
//  refreshes the acts too (their obligation counts).
//
//  Every obligation carries what a second model — the judge —
//  made of it when it compared the obligation with the full
//  text of the provisions it cites (`verification`: supported,
//  partly, unsupported; nothing while it was never judged, or
//  its title or text changed since). The judge decides
//  nothing: an admin still approves or rejects. Its verdict is
//  a chip right after the obligation's title, quiet unless it
//  doubts — in the title's cell, not in a column of its own:
//  one more column would push the row's actions off a
//  laptop's screen. A doubted row says under its title what
//  is off and the judge's note (English, as the model wrote
//  it — whole in the dialog). The check filter is the server's
//  (?verification=, the two doubts also as one), and for the
//  reviewer the list is asked with the doubted first
//  (?order=review — the default of the review queue, behind a
//  switch that turns it off). Above the list, once any row is
//  judged: how many are doubted and how many still unchecked.
//
//  The filters and the table's page and sort live in the
//  address (replaced, never pushed): on /obligations under
//  plain names (?status=all&severity=high&q=…&page=3; the
//  status is absent at the panel's default, "all" for every
//  status; ?verification=doubt; ?order=plain or review only
//  when it is not the panel's default), in an act's tab under
//  the `urlPrefix` (?obligations.status=…). Back from a
//  provision an obligation linked to finds the list as it
//  was; a value the panel does not know — an act the
//  catalogue does not hold among them — is ignored. The
//  selection is not kept: a bulk action must never meet rows
//  picked in another visit.
//
//  Split into (root component last):
//
//    LIMIT            — rows fetched per query
//    REVIEW_CHUNK     — ids per bulk call
//    NO_SELECTION     — the empty selection model
//    CHECK_FILTERS    — what the check filter offers
//    selectedIds      — a v8 row-selection model → ids
//    checkOf          — the judge's verdict of a row
//    isDoubted        — did the judge doubt a row
//    Filters          — act, status, domain, severity, check,
//                       the review order, search
//    CheckNote        — what is off in a doubted row
//    BulkBar          — the selection actions and progress
//    ObligationsPanel — the panel (default export)
// -----------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { errorInfo, useErrorMessage } from '@/utils/errors';
import { idParam, oneOf, paramName } from '@/utils/viewParams';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useJobText from '@/hooks/useJobText';
import useViewParams from '@/hooks/useViewParams';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { CATEGORIES, OBLIGATION_STATUSES, SEVERITIES } from '@/constants/enums';
import ObligationDialog from '@/pages/Obligations/ObligationDialog';


// Rows per query — MiCA alone has ~500 obligations
const LIMIT = 1000;

// The bulk review route takes at most 500 ids per call
const REVIEW_CHUNK = 500;

// An empty v8 selection model
const NO_SELECTION = { type: 'include', ids: new Set() };

// What the check filter offers (the ?verification= values):
// the two doubts as one first, then each verdict, then the
// obligations the judge never saw
const CHECK_FILTERS = ['doubt', 'unsupported', 'partly', 'supported', 'unchecked'];







// -----------------------------------------------------------
// selectedIds
// -----------------------------------------------------------
//
// DataGrid v8's {type, ids} selection model → the selected
// row ids ("exclude" means every row except those).
//
// Used by:
//   - ObligationsPanel (below)
// -----------------------------------------------------------

function selectedIds(model, rows) {
  if (model.type === 'exclude') return rows.map((row) => row.id).filter((id) => !model.ids.has(id));
  return [...model.ids];
}







// -----------------------------------------------------------
// checkOf
// -----------------------------------------------------------
//
// What the judge made of an obligation: its verdict, or
// "unchecked" for a row it never judged (no `verification`,
// which is also what an edit of the title or text leaves).
//
// Used by:
//   - isDoubted, ObligationsPanel (below)
// -----------------------------------------------------------

function checkOf(row) {
  const verdict = row?.verification?.verdict;
  return typeof verdict === 'string' && verdict ? verdict : 'unchecked';
}







// -----------------------------------------------------------
// isDoubted
// -----------------------------------------------------------
//
// True for a row the judge found only partly supported by
// its provisions, or not at all — where a review starts.
//
// Used by:
//   - CheckNote, ObligationsPanel (below)
// -----------------------------------------------------------

function isDoubted(row) {
  return ['unsupported', 'partly'].includes(checkOf(row));
}







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// The act picker (only without a fixed act; `acts` the
// panel's list), status, domain, severity, the judge's
// verdict and the text search — and, with `showOrder` (an
// admin's list), the switch that asks for the doubted
// obligations first.
//
// Used by:
//   - ObligationsPanel (below)
// -----------------------------------------------------------

function Filters({ filters, setFilters, showAct, showOrder, acts }) {

  const t = useTranslations('PAGES.obligations');
  const label = useEnumLabel();
  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });


  return (
    <div className="flex gap-2 flex-wrap mb-3">
      {showAct && (
        <Autocomplete
          size="small" className="w-64 max-w-full" options={acts} value={acts.find((a) => a.id === filters.act) ?? null}
          onChange={(_, act) => setFilters({ ...filters, act: act?.id ?? '' })} getOptionLabel={(a) => a.shortTitle || a.title}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label={t('act')} placeholder={t('allActs')} />}
        />
      )}
      <TextField select size="small" label={t('status')} value={filters.status} onChange={set('status')} sx={{ minWidth: 150 }}>
        <MenuItem value="">{t('all')}</MenuItem>
        {OBLIGATION_STATUSES.map((s) => <MenuItem key={s} value={s}>{label('obligationStatus', s)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t('category')} value={filters.category} onChange={set('category')} sx={{ minWidth: 190 }}>
        <MenuItem value="">{t('all')}</MenuItem>
        {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{label('category', c)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t('severity')} value={filters.severity} onChange={set('severity')} sx={{ minWidth: 150 }}>
        <MenuItem value="">{t('all')}</MenuItem>
        {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{label('severity', s)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t('check')} value={filters.check} onChange={set('check')} sx={{ minWidth: 150 }}>
        <MenuItem value="">{t('all')}</MenuItem>
        {CHECK_FILTERS.map((c) => <MenuItem key={c} value={c}>{t(`CHECK.${c}`)}</MenuItem>)}
      </TextField>
      <TextField size="small" label={t('search')} value={filters.search} onChange={set('search')} className="w-64 max-w-full"
                 slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      {showOrder && (
        <FormControlLabel label={t('reviewOrder')} className="ml-0"
                          control={<Switch size="small" checked={filters.review} onChange={(e) => setFilters({ ...filters, review: e.target.checked })} />} />
      )}
    </div>
  );
}







// -----------------------------------------------------------
// CheckNote
// -----------------------------------------------------------
//
// Under a doubted row's title: what the judge found off (the
// duty itself, whom it binds, its condition, its deadline, or
// several duties merged into one) and its note, cut to two
// lines — the whole note is in the dialog. The note is the
// model's own English, marked as such for a screen reader.
// Nothing for a row the judge did not doubt.
//
// Used by:
//   - ObligationsPanel (below) — the title cell
// -----------------------------------------------------------

function CheckNote({ row }) {
  const t = useTranslations('PAGES.obligations');
  const label = useEnumLabel();
  if (!isDoubted(row)) return null;
  const { issue, note } = row.verification;
  const named = typeof issue === 'string' && issue && issue !== 'none';
  if (!named && !note) return null;
  return (
    <span className="text-xs whitespace-normal line-clamp-2 border-l-4 border-amber-400 pl-2 my-0.5">
      {named && <span className="font-semibold">{t('checkIssue', { issue: label('verificationIssue', issue) })} </span>}
      {note && <span lang="en">{note}</span>}
    </span>
  );
}







// -----------------------------------------------------------
// BulkBar
// -----------------------------------------------------------
//
// Shown while rows are selected: the count, the three bulk
// statuses and, while running, the progress.
//
// Used by:
//   - ObligationsPanel (below)
// -----------------------------------------------------------

function BulkBar({ count, progress, onReview }) {
  const t = useTranslations('PAGES.obligations.BULK');
  const busy = Boolean(progress);
  return (
    <Paper variant="outlined" className="p-2 mb-3 flex items-center gap-2 flex-wrap" role="region" aria-label={t('selected', { count })}>
      <Typography variant="body2" className="font-semibold mr-2">{t('selected', { count })}</Typography>
      <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />} disabled={busy} onClick={() => onReview('approved')}>{t('approve')}</Button>
      <Button size="small" variant="outlined" color="delete" startIcon={<BlockIcon />} disabled={busy} onClick={() => onReview('rejected')}>{t('reject')}</Button>
      <Button size="small" disabled={busy} onClick={() => onReview('proposed')}>{t('propose')}</Button>
      {busy && (
        <div className="flex-1 min-w-48" aria-live="polite">
          <Typography variant="caption">{t('progress', progress)}</Typography>
          <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} />
        </div>
      )}
    </Paper>
  );
}







// -----------------------------------------------------------
// ObligationsPanel (default export)
// -----------------------------------------------------------
//
//   <ObligationsPanel isAdmin />                         — the queue
//   <ObligationsPanel documentId={id} isAdmin={…}
//                     defaultStatus="approved"
//                     urlPrefix="obligations"
//                     extraction={job} />                — one act
//
// `urlPrefix` names the panel's parameters (see the header).
// `reviewOrder` makes "the doubted first" the panel's own
// order (the review queue); an admin can switch it either
// way. `extraction` is the act's obligation extraction while
// it is queued or running: an empty list then says, where
// the table would be, that the obligations are being read
// right now — with the job's progress — instead of that
// there are none.
//
// Used by:
//   - Obligations.jsx — the review queue
//   - pages/Corpus/CorpusDocument.jsx — the obligations tab
// -----------------------------------------------------------

export default function ObligationsPanel({ documentId = null, isAdmin, defaultStatus = '', urlPrefix = '', reviewOrder = false, extraction = null }) {

  const t = useTranslations('PAGES.obligations');
  const label = useEnumLabel();
  const text = useJobText();
  const fmt = useFormat();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [params, setView] = useViewParams();
  const name = (key) => paramName(urlPrefix, key);
  const [selection, setSelection] = useState(NO_SELECTION);
  const [progress, setProgress] = useState(null);
  const [dialog, setDialog] = useState(null);


  // The act picker's list — also what an act in the address
  // is checked against (the same query as the picker's)
  const { data: acts = [] } = useQuery({
    queryKey: ['corpus', 'documents', { q: '', jurisdiction: '' }],
    queryFn: async () => (await api.get('/api/corpus/documents')).data.documents,
    enabled: !documentId,
  });


  // The filters as the address holds them: "all" names every
  // status, no parameter the panel's default
  const statusParam = params.get(name('status'));
  const wantedAct = documentId ? null : idParam(params.get(name('act')));
  const actKnown = !Array.isArray(acts) || acts.length === 0 || acts.some((item) => item?.id === wantedAct);
  const q = (params.get(name('q')) ?? '').trim();
  const [search, setSearch] = useDraftText(q, (text) => {
    setSelection(NO_SELECTION);
    setView({ [name('q')]: text, [name('page')]: null });
  });
  // The doubted first: a reviewer's order, so only an admin's
  // list asks for it — by the panel's default unless the
  // address says otherwise
  const orderParam = oneOf(params.get(name('order')), ['review', 'plain']);
  const filters = {
    act: wantedAct && actKnown ? wantedAct : '',
    status: statusParam === 'all' ? '' : oneOf(statusParam, OBLIGATION_STATUSES, defaultStatus),
    category: oneOf(params.get(name('category')), CATEGORIES),
    severity: oneOf(params.get(name('severity')), SEVERITIES),
    check: oneOf(params.get(name('verification')), CHECK_FILTERS),
    review: Boolean(isAdmin) && (orderParam ? orderParam === 'review' : reviewOrder),
    search,
  };
  const act = documentId || filters.act;


  // A new filter is a new list: its first page, no rows
  // picked; the search box's text goes through its draft
  const setFilters = (next) => {
    if (next.search !== filters.search) setSearch(next.search);
    const changes = {
      [name('act')]: documentId ? null : next.act || null,
      [name('status')]: next.status === defaultStatus ? null : (next.status || 'all'),
      [name('category')]: next.category || null,
      [name('severity')]: next.severity || null,
      [name('verification')]: next.check || null,
      [name('order')]: next.review === reviewOrder ? null : (next.review ? 'review' : 'plain'),
    };
    if (['act', 'status', 'category', 'severity', 'check', 'review'].every((key) => next[key] === filters[key])) return;
    setSelection(NO_SELECTION);
    setView({ ...changes, [name('page')]: null });
  };


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['obligations', { act, status: filters.status, category: filters.category, q, check: filters.check, review: filters.review }],
    queryFn: async () => {
      const query = new URLSearchParams({ limit: String(LIMIT) });
      if (act) query.set('document', act);
      if (filters.status) query.set('status', filters.status);
      if (filters.category) query.set('category', filters.category);
      if (q) query.set('q', q);
      if (filters.check) query.set('verification', filters.check);
      if (filters.review) query.set('order', 'review');
      return (await api.get(`/api/obligations?${query}`)).data;
    },
    placeholderData: (previous) => previous,
  });
  const loaded = data?.obligations ?? [];
  const rows = filters.severity ? loaded.filter((o) => o.severity === filters.severity) : loaded;


  // One status for many rows: the bulk route in chunks, or
  // (older backend) one PATCH per row
  const review = useCallback(async (ids, status) => {
    let done = 0;
    let failed = 0;
    setProgress({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += REVIEW_CHUNK) {
        const chunk = ids.slice(i, i + REVIEW_CHUNK);
        try {
          await api.post('/api/obligations/review', { ids: chunk, status }, { silent: true });
          done += chunk.length;
        } catch (err) {
          if (![404, 405].includes(errorInfo(err).status)) throw err;
          for (const id of chunk) {
            try { await api.patch(`/api/obligations/${encodeURIComponent(id)}`, { status }, { silent: true }); done += 1; } catch { failed += 1; }
            setProgress({ done: done + failed, total: ids.length });
          }
        }
        setProgress({ done: done + failed, total: ids.length });
      }
      if (failed) toast.error(t('BULK.partial', { done, total: ids.length, failed }));
      else toast.success(ids.length === 1 ? t(`TOASTS.${status}`) : t('BULK.done', { count: done }));
      setSelection(NO_SELECTION);
    } catch (err) {
      // Refused: the selection stays for another try
      toast.error(describe(err));
    } finally {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ['obligations'] });
      queryClient.invalidateQueries({ queryKey: ['corpus'] });
    }
  }, [t, describe, queryClient]);


  const remove = async () => {
    try {
      await api.delete(`/api/obligations/${encodeURIComponent(dialog.row.id)}`, { silent: true });
      toast.success(t('TOASTS.deleted'));
      queryClient.invalidateQueries({ queryKey: ['obligations'] });
      queryClient.invalidateQueries({ queryKey: ['corpus'] });
      setDialog((current) => ({ ...current, open: false }));
    } catch (err) {
      toast.error(describe(err));
    }
  };


  const columns = useMemo(() => [
    { field: 'title', headerName: t('COLUMNS.title'), flex: 2, minWidth: 240,
      // The title is a button: the row click is mouse-only, the
      // button is how a keyboard opens the obligation. The
      // judge's verdict follows the title's last word
      renderCell: ({ row }) => (
        <div className="flex flex-col py-1 min-w-0">
          <div className="whitespace-normal">
            <button type="button" className="inline bg-transparent border-0 p-0 cursor-pointer text-left text-content [font:inherit]"
                    onClick={(event) => { event.stopPropagation(); setDialog({ kind: 'edit', row, open: true }); }}>
              <span className="font-semibold whitespace-normal">{row.title}</span>
            </button>
            {' '}
            <StatusChip kind="verification" value={checkOf(row)} label={label('verification', checkOf(row))} className="align-middle" />
          </div>
          <CheckNote row={row} />
          <span className="text-xs text-muted line-clamp-2 whitespace-normal">{row.text}</span>
        </div>
      ) },
    ...(documentId ? [] : [{ field: 'documentTitle', headerName: t('COLUMNS.act'), width: 130 }]),
    { field: 'citations', headerName: t('COLUMNS.citations'), width: 120, sortable: false,
      valueGetter: (value) => (value || []).map((c) => c.path).join(', ') },
    { field: 'category', headerName: t('COLUMNS.category'), width: 150, valueFormatter: (value) => label('category', value) },
    { field: 'severity', headerName: t('COLUMNS.severity'), width: 125,
      renderCell: ({ value }) => <StatusChip kind="severity" value={value} label={label('severity', value)} /> },
    { field: 'appliesTo', headerName: t('COLUMNS.appliesTo'), width: 170, sortable: false,
      valueGetter: (value) => (value || []).map((type) => label('institutionType', type)).join(', ') },
    { field: 'status', headerName: t('COLUMNS.status'), width: 125,
      renderCell: ({ value }) => <StatusChip kind="obligation" value={value} label={label('obligationStatus', value)} /> },
    { field: 'updatedAt', headerName: t('COLUMNS.updated'), width: 150, valueFormatter: (value) => fmt.dateTime(value) },
    ...(isAdmin ? [{ field: 'actions', headerName: t('COLUMNS.actions'), width: 150, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <div className="flex" onClick={(e) => e.stopPropagation()} role="presentation">
          <IconAction label={t('ACTIONS.approve')} icon={<CheckIcon fontSize="small" />} disabled={row.status === 'approved'} onClick={() => review([row.id], 'approved')} />
          <IconAction label={t('ACTIONS.reject')} icon={<BlockIcon fontSize="small" />} disabled={row.status === 'rejected'} onClick={() => review([row.id], 'rejected')} />
          <IconAction label={t('ACTIONS.edit')} icon={<EditOutlinedIcon fontSize="small" />} onClick={() => setDialog({ kind: 'edit', row, open: true })} />
          <IconAction label={t('ACTIONS.delete')} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => setDialog({ kind: 'delete', row, open: true })} />
        </div>
      ) }] : []),
  ], [t, label, fmt, isAdmin, documentId, review]);


  const ids = selectedIds(selection, rows);
  const filtered = Boolean(filters.act || filters.status || filters.category || filters.severity || filters.check || q);
  // What the judge left for a person, among the rows shown —
  // said only once the judge has been over any of them
  const judged = rows.some((row) => row?.verification);
  const doubted = rows.filter(isDoubted).length;
  const unchecked = rows.filter((row) => checkOf(row) === 'unchecked').length;


  return (
    <div>
      <Filters filters={filters} setFilters={setFilters} showAct={!documentId} showOrder={Boolean(isAdmin)} acts={Array.isArray(acts) ? acts : []} />
      {data && (
        <div className="flex gap-x-4 gap-y-1 flex-wrap mb-2">
          <Typography variant="body2" color="text.secondary">
            {data.total > loaded.length ? t('truncated', { loaded: loaded.length, total: data.total }) : t('shown', { shown: rows.length, total: data.total })}
          </Typography>
          {judged && <Typography variant="body2" color="text.secondary">{t('checkCounts', { doubted: fmt.number(doubted), unchecked: fmt.number(unchecked) })}</Typography>}
        </div>
      )}
      {isAdmin && ids.length > 0 && <BulkBar count={ids.length} progress={progress} onReview={(status) => review(ids, status)} />}
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && rows.length === 0 && extraction && !filtered && (
        <EmptyState
          icon={FactCheckOutlinedIcon}
          title={extraction.status === 'running' ? t('extracting') : t('extractionQueued')}
          text={<>{text.progress(extraction.progress) && <span className="block">{text.progress(extraction.progress)}</span>}{t('extractingText')}</>}
          action={extraction.progress?.percent != null
            ? <LinearProgress variant="determinate" value={extraction.progress.percent} className="w-64 max-w-full" aria-label={t('extracting')} />
            : <LinearProgress className="w-64 max-w-full" aria-label={extraction.status === 'running' ? t('extracting') : t('extractionQueued')} />}
        />
      )}
      {!error && !isLoading && rows.length === 0 && !(extraction && !filtered) && (
        <EmptyState icon={FactCheckOutlinedIcon} title={filtered ? t('emptyFiltered') : t('empty')} text={filtered ? null : t('emptyText')} />
      )}
      {!error && (isLoading || rows.length > 0) && (
        <DataTable
          rows={rows} columns={columns} loading={isLoading} label={t('TITLE')} autoRowHeight pageSize={50} persist={urlPrefix || true}
          checkboxSelection={isAdmin} rowSelectionModel={selection} onRowSelectionModelChange={setSelection}
          keepNonExistentRowsSelected={false}
          hiddenColumns={['appliesTo', 'updatedAt']} mobileHidden={['documentTitle', 'citations', 'category']}
          onRowClick={({ row }) => setDialog({ kind: 'edit', row, open: true })}
        />
      )}
      <ObligationDialog obligation={dialog?.kind === 'edit' ? dialog.row : null} open={Boolean(dialog?.open && dialog.kind === 'edit')} isAdmin={isAdmin}
                        onClose={() => setDialog((current) => ({ ...current, open: false }))} onExited={() => setDialog(null)} />
      <UniversalModal open={Boolean(dialog?.open && dialog.kind === 'delete')} danger onConfirm={remove}
                      onClose={() => setDialog((current) => ({ ...current, open: false }))} onExited={() => setDialog(null)}
                      title={t('DIALOG.deleteTitle')} confirmLabel={t('ACTIONS.delete')}>
        <Typography className="font-semibold mb-2">{dialog?.row?.title}</Typography>
        <Typography>{t('DIALOG.deleteText')}</Typography>
      </UniversalModal>
    </div>
  );
}
