// -----------------------------------------------------------
//  [*] DataTable — the house DataGrid
//
//  One wrapper so every table looks and behaves the same:
//  the white card, compact density, 25/50/100 paging with
//  numbered page buttons (TablePager.jsx), an
//  aria-label, translated built-in texts (they come from the
//  theme, see localeTheme.js) and phone-friendly columns —
//  the fields in `mobileHidden` start hidden below md, those
//  in `hiddenColumns` start hidden everywhere (the column
//  menu brings them back).
//  `autoRowHeight` lets rows grow with wrapped text (cells
//  get vertical padding then). The
//  grid is re-keyed on the breakpoint so a rotation re-reads
//  the visibility. Clickable rows get a pointer; the caller
//  still renders a real link in the first cell so keyboard
//  users reach the same page.
//
//  A table never ends in mid-air: one with few rows reaches
//  down to the bottom of the screen, its footer on the bottom
//  edge and the room between as empty table; one with many
//  rows runs past the screen as its rows need, and the page
//  scrolls. Only the table that closes its page is stretched
//  (useFillHeight) — never one with a section below it, or
//  one in a dialog or drawer; `fill={false}` turns it off.
//
//  Loading is announced, not only drawn: a visually hidden
//  status says "Įkeliama…", the grid is aria-busy, and the
//  grid's own overlay (skeleton rows, or an unnamed progress
//  bar over old rows) is kept from screen readers.
//
//  Space presses a button inside a cell (the Usage and Audit
//  time buttons, the Obligations titles, the icon actions).
//  The grid reads Space on a cell as "a page down" and
//  cancels it — a button in the cell never clicked; Enter
//  was never the grid's key, so it always worked. The grid
//  keeps Space where it belongs: on a cell itself, and with
//  Shift (its row selection).
//
//  Garbage rows never reach the grid: the DataGrid THROWS on
//  a row without an id and breaks on duplicate ids (React
//  keys), so a malformed backend answer would take the whole
//  page down. Rows that are not objects, or whose id (the
//  caller's getRowId, else row.id) is missing, not a string
//  or number, or already taken are dropped — the first of a
//  duplicate stays. A well-formed list passes through as the
//  same array.
//
//  A table with `persist` keeps its page, page size and sort
//  in the address (useViewParams — replaced, never pushed):
//  Back to the list, a reload or a shared link finds the
//  same page of the same order. `persist` alone uses the
//  plain names (?page=2&size=50&sort=name.desc — 1-based
//  page; "none" when the user cleared a default sort); a name
//  prefixes them for a table inside a tab
//  (?documents.page=2). Defaults leave no parameter; a page,
//  size or column the table does not know reads as the
//  default. The grid itself clamps a page beyond the rows
//  once they arrive (never while it still has none).
//
//  Split into (root component last):
//
//    EMPTY                — the stable empty row list
//    SPACE_CONTROLS       — the controls Space presses
//    PAGE_SIZES           — the page sizes offered
//    FILL_GAP             — how much may follow a filled table
//    SORT_DIRECTIONS      — a sort parameter's directions
//    usableRows           — the rows the grid can take
//    keepSpaceForControls — Space in a cell → its button
//    parseSort            — ?sort= → a sort model
//    sortParam            — a sort model → ?sort=
//    useUrlGridState      — page, size and sort in the address
//    useFillHeight        — the height down to the screen's end
//    Grid                 — the grid itself
//    UrlStateGrid         — Grid with its state in the address
//    DataTable            — the wrapper (default export)
// -----------------------------------------------------------

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { DataGrid } from '@mui/x-data-grid';
import { useTranslations } from '@/i18n';
import useViewParams from '@/hooks/useViewParams';
import { paramName } from '@/utils/viewParams';
import TablePager from '@/components/DataTable/TablePager';


// One empty list for every "nothing usable" answer, so the
// grid never sees a new rows array for the same nothing
const EMPTY = [];

// The controls whose own key Space is: buttons, checkboxes,
// radios and switches, native or by role
const SPACE_CONTROLS = [
  'button', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  'input[type="checkbox"]', 'input[type="radio"]',
  '[role="button"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
].join(', ');

// The page sizes the footer offers (a stored size outside
// them reads as the table's default)
const PAGE_SIZES = [25, 50, 100];

// How many pixels of page may follow a table that is
// stretched to the bottom of the screen: the paddings of the
// cards around it, not another section
const FILL_GAP = 120;

// The directions a ?sort= parameter may carry
const SORT_DIRECTIONS = ['asc', 'desc'];







// -----------------------------------------------------------
// usableRows
// -----------------------------------------------------------
//
//   usableRows([{ id: 1 }, null, { id: 1 }, {}]) → [{ id: 1 }]
//   usableRows(goodList) === goodList
//
// The rows the DataGrid can render: plain objects with a
// string or finite-number id nobody took before (ids are
// compared as the grid compares them — as strings, so 1 and
// "1" collide). A getRowId that throws on a row drops it.
//
// Used by:
//   - DataTable (below)
// -----------------------------------------------------------

function usableRows(rows, getRowId) {
  if (!Array.isArray(rows)) return EMPTY;

  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    let id;
    try {
      id = getRowId ? getRowId(row) : row.id;
    } catch {
      continue;
    }
    const valid = typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
    if (!valid || seen.has(String(id))) continue;
    seen.add(String(id));
    kept.push(row);
  }
  return kept.length === rows.length ? rows : kept;
}







// -----------------------------------------------------------
// keepSpaceForControls
// -----------------------------------------------------------
//
// Part of the grid's onCellKeyDown, which MUI runs BEFORE
// its own keyboard handling (a prop handler is subscribed
// first): a plain Space whose target is a control INSIDE the
// cell sets event.defaultMuiPrevented, the grid's documented
// way to skip its default — no page-down, no preventDefault
// — so the browser presses the control. The cell itself (no
// control) and Shift+Space stay the grid's.
//
// Used by:
//   - DataTable (below)
// -----------------------------------------------------------

function keepSpaceForControls(event) {
  if (event.key !== ' ' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target?.matches?.(SPACE_CONTROLS)) event.defaultMuiPrevented = true;
}







// -----------------------------------------------------------
// parseSort
// -----------------------------------------------------------
//
//   parseSort('name.desc', ['name', 'country'], [])   → [{ field: 'name', sort: 'desc' }]
//   parseSort('none', ['name'], [{ field: 'name', sort: 'asc' }]) → []
//   parseSort('ghost.asc', ['name'], fallback)        → fallback
//
// A ?sort= value as the grid's sort model: one sortable
// column and a direction, "none" for no sort at all;
// anything else (no value, an unknown column, a bad
// direction) is `fallback`, the table's own default.
//
// Used by:
//   - useUrlGridState (below)
// -----------------------------------------------------------

function parseSort(value, sortable, fallback) {
  if (!value) return fallback;
  if (value === 'none') return [];
  const dot = value.lastIndexOf('.');
  const field = value.slice(0, dot);
  const sort = value.slice(dot + 1);
  return dot > 0 && sortable.includes(field) && SORT_DIRECTIONS.includes(sort) ? [{ field, sort }] : fallback;
}







// -----------------------------------------------------------
// sortParam
// -----------------------------------------------------------
//
//   sortParam([{ field: 'name', sort: 'desc' }], [])  → 'name.desc'
//   sortParam(fallback, fallback)                   → null
//   sortParam([], [{ field: 'createdAt', … }])      → 'none'
//
// The grid's sort model as the ?sort= value parseSort reads:
// null (no parameter) for the table's default, "none" for a
// cleared default.
//
// Used by:
//   - useUrlGridState (below)
// -----------------------------------------------------------

function sortParam(model, fallback) {
  const [first] = Array.isArray(model) ? model : [];
  if (!first?.sort) return fallback.length ? 'none' : null;
  if (fallback[0]?.field === first.field && fallback[0]?.sort === first.sort) return null;
  return `${first.field}.${first.sort}`;
}







// -----------------------------------------------------------
// useUrlGridState
// -----------------------------------------------------------
//
//   const state = useUrlGridState('documents', { pageSize, initialSort, columns });
//   <DataGrid {...state} />  — paginationModel, sortModel and
//                              their change handlers
//
// Reads the table's page, size and sort from the address and
// writes the user's changes back (replace). The models are
// rebuilt only when their parameters change: a new model
// object makes the grid publish a change (a new sort model
// resets it to the first page).
//
// Used by:
//   - UrlStateGrid (below)
// -----------------------------------------------------------

function useUrlGridState(prefix, { pageSize, initialSort, columns }) {

  const [params, setView] = useViewParams();
  const names = useMemo(() => ({
    page: paramName(prefix, 'page'), size: paramName(prefix, 'size'), sort: paramName(prefix, 'sort'),
  }), [prefix]);
  const page = params.get(names.page);
  const size = params.get(names.size);
  const sort = params.get(names.sort);
  // Strings, so a re-render with new column objects rebuilds
  // nothing
  const sortable = columns.filter((column) => column.sortable !== false).map((column) => column.field).join(',');
  const fallback = JSON.stringify(initialSort ?? []);


  const paginationModel = useMemo(() => ({
    page: /^\d{1,6}$/.test(page ?? '') ? Math.max(0, Number(page) - 1) : 0,
    pageSize: PAGE_SIZES.includes(Number(size)) ? Number(size) : pageSize,
  }), [page, size, pageSize]);
  const sortModel = useMemo(() => parseSort(sort, sortable.split(','), JSON.parse(fallback)), [sort, sortable, fallback]);


  const onPaginationModelChange = useCallback((model) => setView({
    [names.page]: model.page > 0 ? model.page + 1 : null,
    [names.size]: model.pageSize !== pageSize ? model.pageSize : null,
  }), [setView, names, pageSize]);
  const onSortModelChange = useCallback((model) => setView({ [names.sort]: sortParam(model, JSON.parse(fallback)) }),
    [setView, names, fallback]);


  return { paginationModel, onPaginationModelChange, sortModel, onSortModelChange };
}







// -----------------------------------------------------------
// useFillHeight
// -----------------------------------------------------------
//
// The least height at which the element reaches the bottom
// of the page's scrolling area (PageLayout's; a bare <main>
// counts as one), in pixels, or 0 when it should keep its own
// height: no such area around it (a dialog, a drawer), `enabled` off, or more than FILL_GAP
// after it in the page — a table followed by another section
// would push that section off the screen. The page's footer
// (PageLayout) is not such a section: it keeps its place
// under the table, at the bottom of the screen.
//
// The height is what is left of the area after everything
// above the element, everything below it and the footer, and
// none of those depends on the element's own height, so
// applying the answer changes nothing it was computed from.
// It is taken
// again when the window, the area or one of the area's
// blocks changes size — a note appearing above the table, a
// filter row wrapping.
//
// Used by:
//   - Grid (below)
// -----------------------------------------------------------

function useFillHeight(ref, enabled) {

  const [height, setHeight] = useState(0);


  useLayoutEffect(() => {
    const element = ref.current;
    const area = enabled ? element?.closest('[data-page-scroll]') ?? element?.closest('main') : null;
    if (!area || typeof ResizeObserver === 'undefined') {
      setHeight(0);
      return undefined;
    }
    // The page's content is the block the layout marks, and the
    // footer the area's own; without a layout the content is the
    // area itself
    const body = area.querySelector('[data-page-body]') ?? area;
    const footer = area.querySelector(':scope > footer');
    const measure = () => {
      const box = element.getBoundingClientRect();
      const frame = area.getBoundingClientRect();
      const last = body.lastElementChild?.getBoundingClientRect().bottom ?? box.bottom;
      const below = last + (parseFloat(getComputedStyle(body).paddingBottom) || 0) - box.bottom;
      const above = box.top - frame.top + area.scrollTop;
      const foot = footer?.getBoundingClientRect().height ?? 0;
      setHeight(below <= FILL_GAP ? Math.max(0, Math.floor(area.clientHeight - above - below - foot)) : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    for (const block of body.children) observer.observe(block);
    if (footer) observer.observe(footer);
    measure();
    return () => observer.disconnect();
  }, [ref, enabled]);


  return height;
}







// -----------------------------------------------------------
// Grid
// -----------------------------------------------------------
//
// The DataGrid with the house defaults (see the header). A
// `paginationModel` / `sortModel` pair with their handlers
// (UrlStateGrid's) makes the page and sort controlled;
// without them they start from pageSize / initialSort and
// live in the grid. The grid is as tall as its rows, and at
// least as tall as reaches the bottom of the screen
// (useFillHeight).
//
// Used by:
//   - UrlStateGrid, DataTable (below)
// -----------------------------------------------------------

function Grid({
  rows, columns, loading = false, label, mobileHidden = [], hiddenColumns = [], onRowClick, pageSize = 25, initialSort,
  className = '', autoRowHeight = false, getRowId, slots, slotProps, onCellKeyDown, paginationModel, sortModel, fill = true, ...rest
}) {

  const t = useTranslations('COMPONENTS.common');
  const phone = useMediaQuery((theme) => theme.breakpoints.down('md'), { noSsr: true });
  const hidden = Object.fromEntries([...hiddenColumns, ...(phone ? mobileHidden : [])].map((field) => [field, false]));
  const shownRows = useMemo(() => usableRows(rows, getRowId), [rows, getRowId]);
  const controlled = paginationModel !== undefined;
  const frame = useRef(null);
  const minHeight = useFillHeight(frame, fill);


  return (
    <div ref={frame} className={`bg-surface rounded-md ${className}`}>
      {loading && <span role="status" className="sr-only">{t('loading')}</span>}
      <DataGrid
        key={phone ? 'phone' : 'wide'}
        rows={shownRows}
        columns={columns}
        loading={loading}
        label={label}
        getRowId={getRowId}
        autoHeight
        density="compact"
        disableRowSelectionOnClick
        onRowClick={onRowClick}
        onCellKeyDown={(params, event, details) => {
          keepSpaceForControls(event);
          onCellKeyDown?.(params, event, details);
        }}
        getRowClassName={onRowClick ? () => 'cursor-pointer' : undefined}
        getRowHeight={autoRowHeight ? () => 'auto' : undefined}
        sx={autoRowHeight ? { '& .MuiDataGrid-cell': { py: 1, display: 'flex', alignItems: 'center' } } : undefined}
        style={minHeight > 0 ? { minHeight } : undefined}
        initialState={{
          columns: { columnVisibilityModel: hidden },
          ...(controlled ? {} : { pagination: { paginationModel: { pageSize } } }),
          ...(!controlled && initialSort ? { sorting: { sortModel: initialSort } } : {}),
        }}
        {...(controlled ? { paginationModel, sortModel } : {})}
        pageSizeOptions={PAGE_SIZES}
        slots={{ pagination: TablePager, ...slots }}
        slotProps={{
          ...slotProps,
          main: { 'aria-busy': loading ? 'true' : undefined, ...slotProps?.main },
          loadingOverlay: { 'aria-hidden': true, ...slotProps?.loadingOverlay },
        }}
        {...rest}
      />
    </div>
  );
}







// -----------------------------------------------------------
// UrlStateGrid
// -----------------------------------------------------------
//
// Grid whose page, page size and sort live in the address
// under the `persist` names (true → plain names).
//
// Used by:
//   - DataTable (below)
// -----------------------------------------------------------

function UrlStateGrid({ persist, pageSize = 25, initialSort, columns, ...rest }) {
  const state = useUrlGridState(persist === true ? '' : persist, { pageSize, initialSort, columns });
  return <Grid {...rest} columns={columns} pageSize={pageSize} initialSort={initialSort} {...state} />;
}







// -----------------------------------------------------------
// DataTable (default export)
// -----------------------------------------------------------
//
//   <DataTable rows={…} columns={…} label="Įmonės"
//              mobileHidden={['country']} onRowClick={…} autoRowHeight
//              persist />                 — page / size / sort in ?page= …
//   <DataTable … persist="documents" />   — … in ?documents.page= …
//
// Any other DataGrid prop passes through (checkboxSelection,
// rowSelectionModel, getRowId, hideFooter…); slots are
// merged with the pager and slotProps with the loading
// wiring, the caller's win; a
// caller's onCellKeyDown runs after the Space rule. Without
// `persist` the table needs no router.
//
// Used by:
//   - Users, Jobs, Companies, Reports (ReportsTable), Corpus
//     (CorpusCatalogue, ActVersions), Obligations
//     (ObligationsPanel), Prompts, Audit, Usage — every list
//     page, each with `persist`
//   - CompanyCredentials, CompanyDocuments — the company tabs,
//     persisted under their own names
// -----------------------------------------------------------

export default function DataTable({ persist, ...props }) {
  return persist ? <UrlStateGrid persist={persist} {...props} /> : <Grid {...props} />;
}
