// -----------------------------------------------------------
//  [*] ProvisionTree — an act's structure, browsable
//
//  GET /api/corpus/documents/{id}/units?type=&q=&offset=&limit=
//  pages through the current version's provisions in
//  document order (200 at a time, "show more" appends). By
//  default only the skeleton is listed — parts, titles,
//  chapters, sections, articles, a standard's clauses,
//  annexes — since an article's text already includes its
//  paragraphs and points; the
//  filter switches to every provision, articles only,
//  recitals or annexes, and the search box narrows by text.
//
//  The tree is the ordered list itself: each unit is indented
//  by its depth, and a unit followed by deeper ones gets a
//  collapse toggle (aria-expanded) hiding them. Picking a
//  unit hands its id to the viewer (and the URL). A malformed
//  page adds only the rows it can show (tableRows.js), so a
//  broken answer never takes the tree down.
//
//  Coming back finds the tree as it was: the filter and the
//  search live in the address (?structure.type=article&
//  structure.q=…, replaced), the collapsed units in
//  sessionStorage per act (for the filter they were
//  collapsed under — a new filter starts expanded, as it
//  always did).
//
//  Split into (root component last):
//
//    PAGE_SIZE     — units per request
//    TYPE_FILTERS  — filter key → the units' type list
//    NOTHING_KEPT  — the collapsed units before any toggle
//    isCollapsed   — a stored collapse the tree can use
//    visibleRows   — the rows left after collapsing
//    UnitRow       — one provision line
//    ProvisionTree — the tree (default export)
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import ErrorState from '@/components/ErrorState/ErrorState';
import tableRows from '@/pages/Corpus/tableRows';


// A page of the units route (its limit caps at 1000)
const PAGE_SIZE = 200;

// The filter's options → the ?type= list ("" = everything);
// a standard's skeleton is its clauses
const TYPE_FILTERS = {
  structure: 'part,title,chapter,section,subsection,article,clause,annex',
  all: '',
  article: 'article',
  recital: 'recital',
  annex: 'annex',
};

// The collapsed units before any toggle: none, under the
// default filter
const NOTHING_KEPT = { filter: 'structure', ids: [] };







// -----------------------------------------------------------
// isCollapsed
// -----------------------------------------------------------
//
// A stored {filter, ids} the tree can use: a filter it
// offers and a list of unit ids.
//
// Used by:
//   - ProvisionTree (below) — useSessionState's check
// -----------------------------------------------------------

function isCollapsed(value) {
  return Object.keys(TYPE_FILTERS).includes(value?.filter) && Array.isArray(value.ids)
    && value.ids.every((id) => typeof id === 'string' || typeof id === 'number');
}







// -----------------------------------------------------------
// visibleRows
// -----------------------------------------------------------
//
// The rows not hidden by a collapsed ancestor, each marked
// with whether it has deeper rows after it (a toggle).
//
// Used by:
//   - ProvisionTree (below)
// -----------------------------------------------------------

function visibleRows(units, collapsed) {
  const rows = [];
  let hideBelow = null;
  units.forEach((unit, index) => {
    const next = units[index + 1];
    const parent = Boolean(next && next.depth > unit.depth);
    if (hideBelow !== null && unit.depth > hideBelow) return;
    hideBelow = collapsed.has(unit.id) ? unit.depth : null;
    rows.push({ unit, parent });
  });
  return rows;
}







// -----------------------------------------------------------
// UnitRow
// -----------------------------------------------------------
//
// The toggle (or its space), then the path and heading as
// a button; the selected unit is tinted and aria-current.
//
// Used by:
//   - ProvisionTree (below)
// -----------------------------------------------------------

function UnitRow({ unit, parent, collapsed, selected, onToggle, onSelect, baseDepth }) {

  const t = useTranslations('PAGES.corpusDocument.STRUCTURE');
  const label = useEnumLabel();
  const indent = Math.max(0, unit.depth - baseDepth) * 14;
  // A part / title / chapter's path is its (truncated) heading
  // — show the heading once; an article shows "4 str." + it
  const container = ['part', 'title', 'chapter', 'section', 'subsection'].includes(unit.unitType);
  const head = container ? (unit.heading || unit.path) : (unit.path || label('unitType', unit.unitType));
  const title = !container && unit.heading && unit.heading !== unit.path ? unit.heading : '';
  // A standard's numbered paragraph opens with its number,
  // which the path beside it already shows
  const text = String(unit.text ?? '');
  const preview = (unit.number && text.startsWith(`${unit.number} `) ? text.slice(String(unit.number).length + 1) : text).slice(0, 90);


  return (
    <li className="flex items-start" style={{ paddingLeft: indent }}>
      {parent ? (
        <button type="button" onClick={() => onToggle(unit.id)} aria-expanded={!collapsed} aria-label={`${collapsed ? t('expand') : t('collapse')}: ${head}`}
                className="shrink-0 bg-transparent border-0 p-0.5 cursor-pointer text-muted rounded hover:bg-canvas">
          {collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </button>
      ) : <span className="shrink-0 w-6" aria-hidden />}
      <button type="button" onClick={() => onSelect(unit.id)} aria-current={selected ? 'true' : undefined}
              className={`flex-1 min-w-0 text-left border-0 rounded px-1.5 py-0.5 cursor-pointer text-sm ${selected ? 'bg-primary-light/12 text-primary' : 'bg-transparent hover:bg-canvas text-content'}`}>
        <span className={['article', 'annex'].includes(unit.unitType) ? 'font-semibold' : ['part', 'title', 'chapter', 'section'].includes(unit.unitType) ? 'font-semibold text-xs text-muted' : ''}>
          {head}
        </span>
        {title && <span className="text-muted"> {title}</span>}
        {!title && !['article', 'annex', 'part', 'title', 'chapter', 'section', 'subsection'].includes(unit.unitType) && preview && (
          <span className="text-muted"> {preview}</span>
        )}
      </button>
    </li>
  );
}







// -----------------------------------------------------------
// ProvisionTree (default export)
// -----------------------------------------------------------
//
// The tree of the act `documentId`; `selectedId` is the unit
// on show, and `onSelect` receives the id of the unit picked.
// The filter and the search are the page's ?structure.type=
// and ?structure.q=; the collapsed units are kept per act.
//
// Used by:
//   - CorpusDocument.jsx — the structure tab
// -----------------------------------------------------------

export default function ProvisionTree({ documentId, selectedId, onSelect }) {

  const t = useTranslations('PAGES.corpusDocument.STRUCTURE');
  const label = useEnumLabel();
  const fmt = useFormat();
  const [params, setView] = useViewParams();
  const filter = oneOf(params.get('structure.type'), Object.keys(TYPE_FILTERS), 'structure');
  const q = (params.get('structure.q') ?? '').trim();
  const [search, setSearch] = useDraftText(q, (text) => setView({ 'structure.q': text }));
  const [kept, setKept] = useSessionState(`corpus.${documentId}.collapsed`, NOTHING_KEPT, isCollapsed);
  // A collapse kept for another filter is not this tree's
  const collapsed = useMemo(() => new Set(kept.filter === filter ? kept.ids : []), [kept, filter]);


  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['corpus', 'units', documentId, filter, q],
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({ offset: String(pageParam), limit: String(PAGE_SIZE) });
      if (TYPE_FILTERS[filter]) query.set('type', TYPE_FILTERS[filter]);
      if (q) query.set('q', q);
      const page = (await api.get(`/api/corpus/documents/${encodeURIComponent(documentId)}/units?${query}`)).data;
      return { units: tableRows(page?.units), total: Number(page?.total) || 0, offset: Number(page?.offset) || pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.units.length < last.total ? last.offset + last.units.length : undefined),
  });


  const units = useMemo(() => data?.pages.flatMap((page) => page.units) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const baseDepth = units.length ? Math.min(...units.map((u) => u.depth)) : 0;
  const rows = useMemo(() => visibleRows(units, collapsed), [units, collapsed]);
  const toggle = (id) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setKept({ filter, ids: [...next] });
  };
  // Another filter lists other units: it starts expanded
  const pickFilter = (value) => {
    setView({ 'structure.type': value === 'structure' ? null : value });
    setKept({ filter: value, ids: [] });
  };


  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <TextField select size="small" label={t('filter')} value={filter} onChange={(e) => pickFilter(e.target.value)} sx={{ minWidth: 220 }}>
          {Object.keys(TYPE_FILTERS).map((key) => <MenuItem key={key} value={key}>{label('unitFilter', key)}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-48"
                   slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </div>
      {isLoading && <CircularProgress size={24} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!isLoading && !error && units.length === 0 && <Typography color="text.secondary">{t('empty')}</Typography>}
      {rows.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col" aria-label={t('list')}>
          {rows.map(({ unit, parent }) => (
            <UnitRow key={unit.id} unit={unit} parent={parent} collapsed={collapsed.has(unit.id)} selected={unit.id === selectedId}
                     onToggle={toggle} onSelect={onSelect} baseDepth={baseDepth} />
          ))}
        </ul>
      )}
      {hasNextPage && (
        <div>
          <Button size="small" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
            {t('loadMore', { shown: fmt.number(units.length), total: fmt.number(total) })}
          </Button>
        </div>
      )}
    </div>
  );
}
