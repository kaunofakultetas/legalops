// -----------------------------------------------------------
//  [*] Tests — DataTable (the house DataGrid)
//
//  The wrapper every list page renders its rows through:
//  the grid named by its label, compact and auto-height in
//  the white card; 25 rows a page by default, the 25 / 50 /
//  100 choice and a caller's own size; the grid's texts in
//  both languages and across a live switch; the columns that
//  start hidden everywhere (hiddenColumns) or only below md
//  (mobileHidden — behind the matchMedia double, re-read when
//  the width crosses the breakpoint); the initial sort; row
//  clicks (the pointer, the row handed over once, never a
//  selection); autoRowHeight; pass-through props; Space
//  pressing a button or an icon action inside a cell as Enter
//  does (the grid keeping Space on a cell itself and
//  Shift+Space); the ANNOUNCED loading state (a status,
//  aria-busy, the overlay kept from screen readers); and the
//  guard that keeps a malformed answer — no list, rows that
//  are not objects, rows without a usable id, duplicate ids —
//  from crashing the page, with a caller's getRowId honoured;
//  and `persist`: the page, page size and sort read from and
//  replaced in the address (plain names or a table's prefix),
//  defaults leaving no parameter, unknown values read as the
//  defaults, a cleared default sort kept as "none", a page
//  beyond late rows brought to the last one once they come,
//  and no router needed without it.
// -----------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import { renderPage } from '../support/render';
import { mediaQueryMatches } from '../support/setup';
import { useSetLocale } from '@/i18n';
import Providers from '@/providers';
import DataTable from '@/components/DataTable/DataTable';
import IconAction from '@/components/IconAction/IconAction';


// MUI's `theme.breakpoints.down('md')` as useMediaQuery asks
// matchMedia for it — the query DataTable calls "phone"
const PHONE = '(max-width:899.95px)';

const COLUMNS = [
  { field: 'name', headerName: 'Name', width: 220 },
  { field: 'country', headerName: 'Country', width: 110 },
  { field: 'employees', headerName: 'Employees', type: 'number', width: 120 },
  { field: 'updatedAt', headerName: 'Updated', width: 150 },
];

// n companies, "Company 001" … in id order
const companies = (n) => Array.from({ length: n }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Company ${String(i + 1).padStart(3, '0')}`,
  country: i % 2 ? 'LT' : 'LV',
  employees: (i * 37) % 101,
  updatedAt: `2026-09-${String((i % 27) + 1).padStart(2, '0')}`,
}));


// The matchMedia stub remembers matches across tests — every
// test starts wide unless it says otherwise
beforeEach(() => {
  mediaQueryMatches(PHONE, false);
});







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// grid / names: the grid and the first cell of every body
// row, top to bottom. headers: the visible column headers.
// footerText: the pagination row. resizableMedia: a
// matchMedia whose answers follow a window width that can
// change after mount — setup.js's stub only answers once,
// and the breakpoint re-key needs a live change event.
// -----------------------------------------------------------

const grid = () => screen.getByRole('grid');

const names = () => within(grid()).queryAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell')[0]?.textContent)
  .filter(Boolean);

const headers = () => within(grid()).getAllByRole('columnheader').map((header) => header.textContent);

const footerText = () => document.querySelector('.MuiDataGrid-footerContainer').textContent;

function resizableMedia(initialWidth) {
  let width = initialWidth;
  const lists = [];
  const matches = (query) => {
    const max = query.match(/max-width:\s*([\d.]+)px/);
    const min = query.match(/min-width:\s*([\d.]+)px/);
    if (max) return width <= Number(max[1]);
    if (min) return width >= Number(min[1]);
    return false;
  };
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const listeners = new Set();
    const list = {
      media: query,
      get matches() { return matches(query); },
      onchange: null,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      dispatchEvent: () => false,
      listeners,
    };
    lists.push(list);
    return list;
  });
  return {
    resize(next) {
      width = next;
      act(() => {
        for (const list of lists) for (const fn of list.listeners) fn({ matches: list.matches, media: list.media });
      });
    },
  };
}

// The navbar's language switch in miniature
function LocaleSwitch({ to }) {
  const setLocale = useSetLocale();
  return <button type="button" onClick={() => setLocale(to)}>{`switch to ${to}`}</button>;
}







// -----------------------------------------------------------
// The grid
// -----------------------------------------------------------

describe('DataTable grid', () => {

  it('is a grid named by its label, with the column headers and one row per record', () => {
    renderPage(<DataTable rows={companies(3)} columns={COLUMNS} label="Companies" />);
    expect(screen.getByRole('grid', { name: 'Companies' })).toBeInTheDocument();
    expect(headers()).toEqual(['Name', 'Country', 'Employees', 'Updated']);
    expect(names()).toEqual(['Company 001', 'Company 002', 'Company 003']);
    const first = within(grid()).getAllByRole('row')[1];
    expect(within(first).getAllByRole('gridcell').map((cell) => cell.textContent)).toEqual(['Company 001', 'LV', '0', '2026-09-01']);
  });


  it('sits compact and auto-height in the white sheet, with the caller\'s className on the sheet', () => {
    const { container } = renderPage(<DataTable rows={companies(2)} columns={COLUMNS} label="Companies" className="mt-4" />);
    const root = container.querySelector('.MuiDataGrid-root');
    expect(root).toHaveClass('MuiDataGrid-root--densityCompact', 'MuiDataGrid-autoHeight');
    expect(root.parentElement).toHaveClass('bg-surface', 'rounded-md', 'mt-4');
  });


  it('shows the translated "No rows" overlay for an empty list', () => {
    renderPage(<DataTable rows={[]} columns={COLUMNS} label="Companies" />);
    expect(screen.getByText('No rows')).toBeInTheDocument();
    expect(names()).toEqual([]);
  });


  it('renders markup and unicode in the cells as text', () => {
    const hostile = '💾 Ąžuolas <img src=x onerror=alert(1)> <script>alert(2)</script>';
    const { container } = renderPage(<DataTable rows={[{ id: 'x', name: hostile, country: 'LT' }]} columns={COLUMNS} label="Companies" />);
    expect(names()).toEqual([hostile]);
    expect(container.querySelector('img, script')).toBeNull();
  });
});







// -----------------------------------------------------------
// Paging
// -----------------------------------------------------------

// -----------------------------------------------------------
// Height
// -----------------------------------------------------------
//
// jsdom lays nothing out, so the page is given its geometry:
// a scrolling area 800 px tall that begins 100 px down the
// screen, 40 px of bottom padding, the table 200 px into it
// and `after` px of page following the table. A page footer,
// where a test renders one, is 32 px tall.
// -----------------------------------------------------------

describe('DataTable height', () => {

  const geometry = (after) => {
    const rect = (top, bottom) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function clientHeight() { return this.tagName === 'MAIN' ? 800 : 0; });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function box() {
      if (this.tagName === 'MAIN') return rect(100, 900);
      if (this.tagName === 'FOOTER') return rect(900, 932);
      if (this.dataset?.testid === 'page') return rect(100, 400 + after);
      if (this.parentElement?.dataset?.testid === 'page') return rect(300, 400);
      return rect(0, 0);
    });
  };
  const paged = (table) => <main style={{ paddingBottom: 40 }}><div data-testid="page">{table}</div></main>;
  const table = (props) => <DataTable rows={companies(2)} columns={COLUMNS} label="Companies" {...props} />;
  const least = () => document.querySelector('.MuiDataGrid-root').style.minHeight;


  it('reaches down to the bottom of the screen when its rows end before it: the area less what is above and below it', () => {
    geometry(0);
    renderPage(paged(table()));
    expect(least()).toBe('560px');
  });


  it('leaves room for the page\'s footer under it: the footer is not a section that follows the table', () => {
    // The content block carries the padding (24 px) instead of
    // the area; the footer after it is 32 px tall
    geometry(0);
    renderPage(
      <main>
        <div data-page-body data-testid="page" style={{ paddingBottom: 24 }}>{table()}</div>
        <footer>©</footer>
      </main>,
    );
    // 800 of area − 200 above − 24 of padding − 32 of footer
    expect(least()).toBe('544px');
  });


  it('keeps its own height when a section follows it, with fill off, and outside a page\'s scrolling area', () => {
    geometry(300);
    const followed = renderPage(paged(table()));
    expect(least()).toBe('');
    followed.unmount();

    geometry(0);
    const off = renderPage(paged(table({ fill: false })));
    expect(least()).toBe('');
    off.unmount();

    renderPage(<div data-testid="page">{table()}</div>);
    expect(least()).toBe('');
  });
});







describe('DataTable paging', () => {

  it('shows 25 rows a page by default and says which ones', async () => {
    const { user } = renderPage(<DataTable rows={companies(60)} columns={COLUMNS} label="Companies" />);
    expect(names()).toHaveLength(25);
    expect(names()[0]).toBe('Company 001');
    expect(footerText()).toContain('Rows per page:');
    expect(footerText()).toContain('1–25 of 60');

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(names()[0]).toBe('Company 026');
    expect(footerText()).toContain('26–50 of 60');
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(names()).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(names()[0]).toBe('Company 026');
  });


  it('offers every page as a numbered button, the current one marked, with arrows to the first and the last', async () => {
    const { user } = renderPage(<DataTable rows={companies(120)} columns={COLUMNS} label="Companies" />);
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(pager).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Go to first page', 'Go to previous page', 'page 1', 'Go to page 2', 'Go to page 3', 'Go to page 4', 'Go to page 5', 'Go to next page', 'Go to last page',
    ]);
    expect(within(pager).getByRole('button', { name: 'page 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getByRole('button', { name: 'Go to first page' })).toBeDisabled();

    await user.click(within(pager).getByRole('button', { name: 'Go to page 4' }));
    expect(names()[0]).toBe('Company 076');
    expect(footerText()).toContain('76–100 of 120');
    expect(within(pager).getByRole('button', { name: 'page 4' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(pager).getByRole('button', { name: 'Go to last page' }));
    expect(names()).toHaveLength(20);
    expect(within(pager).getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: 'Go to first page' }));
    expect(names()[0]).toBe('Company 001');
  });


  it('keeps four pages at either end of a long list and the current one with its neighbours, the rest as gaps', async () => {
    renderPage(<DataTable rows={companies(1000)} columns={COLUMNS} label="Companies" persist />, { route: '/?page=20' });
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    const pages = within(pager).getAllByRole('listitem').map((item) => item.textContent).filter(Boolean);
    expect(pages).toEqual(['1', '2', '3', '4', '…', '19', '20', '21', '…', '37', '38', '39', '40']);
  });


  it('leaves out what has no use: the page buttons of a list on one page, the page size of a list shorter than the smallest page', () => {
    const { unmount } = renderPage(<DataTable rows={companies(30)} columns={COLUMNS} label="Companies" pageSize={50} />);
    expect(footerText()).toContain('1–30 of 30');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    expect(screen.getByRole('combobox', { name: /Rows per page/ })).toBeInTheDocument();
    unmount();

    renderPage(<DataTable rows={companies(7)} columns={COLUMNS} label="Companies" />);
    expect(footerText()).toBe('1–7 of 7');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Rows per page/ })).toBeNull();
  });


  it('on a phone shows the first page, the current one and the last between previous and next', () => {
    resizableMedia(390);
    renderPage(<DataTable rows={companies(1000)} columns={COLUMNS} label="Companies" persist />, { route: '/?page=20' });
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(pager).getAllByRole('listitem').map((item) => item.textContent).filter(Boolean)).toEqual(['1', '…', '20', '…', '40']);
    expect(within(pager).queryByRole('button', { name: 'Go to first page' })).toBeNull();
    expect(within(pager).getByRole('button', { name: 'Go to next page' })).toBeEnabled();
  });


  it('offers 25, 50 and 100 rows a page, and switches', async () => {
    const { user } = renderPage(<DataTable rows={companies(120)} columns={COLUMNS} label="Companies" />);
    await user.click(screen.getByRole('combobox', { name: /Rows per page/ }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['25', '50', '100']);
    await user.click(options[2]);
    await waitFor(() => expect(names()).toHaveLength(100));
    expect(footerText()).toContain('1–100 of 120');
  });


  it('starts at the caller\'s page size', () => {
    renderPage(<DataTable rows={companies(60)} columns={COLUMNS} label="Audit log" pageSize={50} />);
    expect(names()).toHaveLength(50);
    expect(footerText()).toContain('1–50 of 60');
  });


  it('speaks Lithuanian: the page size label, the range and the page buttons', () => {
    renderPage(<DataTable rows={companies(60)} columns={COLUMNS} label="Įmonės" />, { locale: 'lt' });
    expect(screen.getByRole('grid', { name: 'Įmonės' })).toBeInTheDocument();
    expect(footerText()).toContain('Eilučių puslapyje:');
    expect(footerText()).toContain('1–25 iš 60');
    expect(screen.getByRole('button', { name: 'Kitas puslapis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ankstesnis puslapis' })).toBeDisabled();
  });


  it('re-translates its texts on a live language switch, keeping the page', async () => {
    const { user } = renderPage(
      <>
        <LocaleSwitch to="lt" />
        <DataTable rows={companies(60)} columns={COLUMNS} label="Companies" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await user.click(screen.getByRole('button', { name: 'switch to lt' }));
    expect(footerText()).toContain('Eilučių puslapyje:');
    expect(footerText()).toContain('26–50 iš 60');
    expect(names()[0]).toBe('Company 026');
  });


  it('speaks Lithuanian in the empty overlay and the column menu', async () => {
    const { user } = renderPage(<DataTable rows={[]} columns={COLUMNS} label="Įmonės" />, { locale: 'lt' });
    expect(screen.getByText('Įrašų nėra')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stulpelio „Name“ meniu' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Slėpti stulpelį' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Tvarkyti stulpelius' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Columns
// -----------------------------------------------------------

describe('DataTable columns', () => {

  it('starts the hiddenColumns hidden on every width; the column manager brings them back', async () => {
    const { user } = renderPage(<DataTable rows={companies(2)} columns={COLUMNS} label="Companies" hiddenColumns={['updatedAt']} />);
    expect(headers()).toEqual(['Name', 'Country', 'Employees']);

    await user.click(screen.getByRole('button', { name: 'Name column menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Manage columns' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Updated' }));
    await waitFor(() => expect(headers()).toEqual(['Name', 'Country', 'Employees', 'Updated']));
  });


  it('keeps the mobileHidden columns on a wide screen', () => {
    renderPage(<DataTable rows={companies(2)} columns={COLUMNS} label="Companies" mobileHidden={['country', 'updatedAt']} />);
    expect(headers()).toEqual(['Name', 'Country', 'Employees', 'Updated']);
  });


  it('on a phone starts the mobileHidden columns hidden, together with the hiddenColumns', () => {
    mediaQueryMatches(PHONE);
    renderPage(
      <DataTable rows={companies(2)} columns={COLUMNS} label="Companies" mobileHidden={['country']} hiddenColumns={['updatedAt']} />,
    );
    expect(headers()).toEqual(['Name', 'Employees']);
  });


  it('re-reads the visibility when the width crosses the breakpoint (a rotation)', () => {
    const media = resizableMedia(1200);
    renderPage(<DataTable rows={companies(30)} columns={COLUMNS} label="Companies" mobileHidden={['country', 'updatedAt']} />);
    expect(headers()).toEqual(['Name', 'Country', 'Employees', 'Updated']);

    media.resize(390);
    expect(headers()).toEqual(['Name', 'Employees']);
    expect(names()).toHaveLength(25);

    media.resize(1024);
    expect(headers()).toEqual(['Name', 'Country', 'Employees', 'Updated']);
  });


  it('sorts by the initial sort on mount and marks the header', () => {
    renderPage(
      <DataTable rows={companies(5)} columns={COLUMNS} label="Companies" initialSort={[{ field: 'employees', sort: 'desc' }]} />,
    );
    // employees of companies(5): 0, 37, 74, 10, 47
    expect(names()).toEqual(['Company 003', 'Company 005', 'Company 002', 'Company 004', 'Company 001']);
    expect(screen.getByRole('columnheader', { name: /Employees/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute('aria-sort', 'none');
  });


  it('keeps the record order without an initial sort', () => {
    renderPage(<DataTable rows={companies(5).reverse()} columns={COLUMNS} label="Companies" />);
    expect(names()).toEqual(['Company 005', 'Company 004', 'Company 003', 'Company 002', 'Company 001']);
  });
});







// -----------------------------------------------------------
// Rows
// -----------------------------------------------------------

describe('DataTable rows', () => {

  it('hands a clicked row to onRowClick exactly once — the record itself — and marks clickable rows', async () => {
    const onRowClick = vi.fn();
    const rows = companies(3);
    const { user } = renderPage(<DataTable rows={rows} columns={COLUMNS} label="Companies" onRowClick={onRowClick} />);
    await user.click(screen.getByText('Company 002'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0].row).toBe(rows[1]);
    expect(onRowClick.mock.calls[0][0].id).toBe('c2');
    for (const row of within(grid()).getAllByRole('row').slice(1)) expect(row).toHaveClass('cursor-pointer');
  });


  it('marks no row clickable without onRowClick', () => {
    renderPage(<DataTable rows={companies(3)} columns={COLUMNS} label="Companies" />);
    for (const row of within(grid()).getAllByRole('row').slice(1)) expect(row).not.toHaveClass('cursor-pointer');
  });


  it('lets a caller\'s getRowClassName win', () => {
    renderPage(
      <DataTable rows={companies(2)} columns={COLUMNS} label="Companies" onRowClick={() => {}}
                 getRowClassName={({ row }) => (row.country === 'LT' ? 'opacity-60' : 'plain')} />,
    );
    const [first, second] = within(grid()).getAllByRole('row').slice(1);
    expect(first).toHaveClass('plain');
    expect(second).toHaveClass('opacity-60');
    expect(first).not.toHaveClass('cursor-pointer');
  });


  it('never selects a row on click — with checkboxSelection only the box selects', async () => {
    const onRowClick = vi.fn();
    const { user } = renderPage(
      <DataTable rows={companies(3)} columns={COLUMNS} label="Obligations" checkboxSelection onRowClick={onRowClick} />,
    );
    await user.click(screen.getByText('Company 001'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    const boxes = screen.getAllByRole('checkbox', { name: 'Select row' });
    expect(boxes.every((box) => !box.checked)).toBe(true);
    await user.click(boxes[1]);
    expect(boxes[1]).toBeChecked();
    expect(footerText()).toContain('Rows selected: 1');
  });


  it('grows rows with their text under autoRowHeight, and keeps them fixed otherwise', () => {
    const { unmount } = renderPage(<DataTable rows={companies(2)} columns={COLUMNS} label="Companies" autoRowHeight />);
    for (const row of within(grid()).getAllByRole('row').slice(1)) expect(row).toHaveClass('MuiDataGrid-row--dynamicHeight');
    unmount();
    renderPage(<DataTable rows={companies(2)} columns={COLUMNS} label="Companies" />);
    for (const row of within(grid()).getAllByRole('row').slice(1)) expect(row).not.toHaveClass('MuiDataGrid-row--dynamicHeight');
  });


  it('passes other DataGrid props through (hideFooter)', () => {
    renderPage(<DataTable rows={companies(2)} columns={COLUMNS} label="Credentials" hideFooter />);
    expect(document.querySelector('.MuiDataGrid-footerContainer')).toBeNull();
    expect(names()).toHaveLength(2);
  });


  it('follows new rows from its parent', async () => {
    function Parent() {
      const [rows, setRows] = useState(companies(2));
      return (
        <>
          <button type="button" onClick={() => setRows(companies(4))}>load more</button>
          <DataTable rows={rows} columns={COLUMNS} label="Companies" />
        </>
      );
    }
    const { user } = renderPage(<Parent />);
    expect(names()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'load more' }));
    expect(names()).toHaveLength(4);
  });
});







// -----------------------------------------------------------
// Keyboard
// -----------------------------------------------------------
//
// A row click is mouse-only, so the list pages put a real
// button in a cell (the Usage and Audit times, the
// Obligations titles, the icon actions). Space must press it
// as Enter does, while the grid keeps Space on a cell itself.
// withControls: those columns in miniature. fireEvent's
// answer is false when a handler cancelled the key.
// -----------------------------------------------------------

describe('DataTable keyboard', () => {

  const withControls = (onOpen, onDelete = () => {}) => [
    { field: 'name', headerName: 'Name', width: 220,
      renderCell: ({ row }) => (
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(row.id); }}>{row.name}</button>
      ) },
    ...COLUMNS.slice(1),
    { field: 'actions', headerName: 'Actions', width: 90, sortable: false,
      renderCell: ({ row }) => <IconAction label={`Delete ${row.name}`} icon={<span>×</span>} onClick={() => onDelete(row.id)} /> },
  ];


  it('Space presses a button inside a cell — once, the focus staying on it — as Enter does', async () => {
    const onOpen = vi.fn();
    const onRowClick = vi.fn();
    const { user } = renderPage(<DataTable rows={companies(3)} columns={withControls(onOpen)} label="Companies" onRowClick={onRowClick} />);
    const button = screen.getByRole('button', { name: 'Company 002' });
    button.focus();
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenLastCalledWith('c2');
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onRowClick).not.toHaveBeenCalled();
  });


  it('Space presses an icon action in a cell as well', async () => {
    const onDelete = vi.fn();
    const { user } = renderPage(<DataTable rows={companies(3)} columns={withControls(() => {}, onDelete)} label="Companies" />);
    screen.getByRole('button', { name: 'Delete Company 003' }).focus();
    await user.keyboard(' ');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenLastCalledWith('c3');
  });


  it('leaves Space on a cell itself, and Shift+Space everywhere, to the grid', () => {
    const onOpen = vi.fn();
    renderPage(<DataTable rows={companies(3)} columns={withControls(onOpen)} label="Companies" />);
    const button = screen.getByRole('button', { name: 'Company 001' });
    const country = within(button.closest('[role="row"]')).getAllByRole('gridcell')[1];
    // the grid's page-down cancels the key; a button's Space
    // is left alone
    expect(fireEvent.keyDown(country, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(button, { key: ' ' })).toBe(true);
    expect(fireEvent.keyDown(button, { key: ' ', shiftKey: true })).toBe(false);
    // Enter was never the grid's
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
  });


  it('still hands every cell key to a caller\'s onCellKeyDown, after the Space rule', () => {
    const seen = [];
    const onCellKeyDown = vi.fn((params, event) => seen.push([params.id, params.field, event.key, event.defaultMuiPrevented]));
    renderPage(<DataTable rows={companies(2)} columns={withControls(() => {})} label="Companies" onCellKeyDown={onCellKeyDown} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Company 001' }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Company 002' }), { key: 'a' });
    expect(seen).toEqual([['c1', 'name', ' ', true], ['c2', 'name', 'a', false]]);
  });
});







// -----------------------------------------------------------
// Loading
// -----------------------------------------------------------

describe('DataTable loading', () => {

  it('announces the load: a status says "Loading…" and the grid is busy', () => {
    renderPage(<DataTable rows={[]} columns={COLUMNS} label="Companies" loading />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Loading…$/);
    expect(screen.getByRole('status')).toHaveClass('sr-only');
    expect(grid()).toHaveAttribute('aria-busy', 'true');
  });


  it('keeps the grid\'s own loading picture from screen readers — no unnamed progress bar, no fake rows', () => {
    const { container } = renderPage(<DataTable rows={companies(3)} columns={COLUMNS} label="Companies" loading />);
    const overlay = container.querySelector('.MuiDataGrid-overlay');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    // the old rows stay readable under the overlay
    expect(names()).toHaveLength(3);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });


  it('says nothing and is not busy once loaded — and says it again on the next load', () => {
    function Parent() {
      const [loading, setLoading] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setLoading((v) => !v)}>flip</button>
          <DataTable rows={loading ? [] : companies(2)} columns={COLUMNS} label="Companies" loading={loading} />
        </>
      );
    }
    renderPage(<Parent />);
    act(() => { screen.getByRole('button', { name: 'flip' }).click(); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(grid()).not.toHaveAttribute('aria-busy');
    expect(names()).toHaveLength(2);
    act(() => { screen.getByRole('button', { name: 'flip' }).click(); });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });


  it('speaks Lithuanian while loading', () => {
    renderPage(<DataTable rows={[]} columns={COLUMNS} label="Įmonės" loading />, { locale: 'lt' });
    expect(screen.getByRole('status')).toHaveTextContent('Įkeliama…');
  });


  it('keeps a caller\'s own slotProps next to the loading wiring', () => {
    const { container } = renderPage(
      <DataTable rows={[]} columns={COLUMNS} label="Companies" loading
                 slotProps={{ main: { 'data-extra': 'main' }, loadingOverlay: { 'data-extra': 'overlay' } }} />,
    );
    expect(grid()).toHaveAttribute('data-extra', 'main');
    expect(grid()).toHaveAttribute('aria-busy', 'true');
    const overlay = container.querySelector('.MuiDataGrid-overlay');
    expect(overlay).toHaveAttribute('data-extra', 'overlay');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });
});







// -----------------------------------------------------------
// Malformed rows
// -----------------------------------------------------------
//
// What a backend double's broken answers hand a page — the
// contract matrices' wrong containers, missing fields, null
// leaves, swapped types and hostile strings — must never
// crash the grid.
// -----------------------------------------------------------

describe('DataTable malformed rows', () => {

  it.each([
    ['null', null], ['undefined', undefined], ['an object', { companies: [] }], ['a string', 'unexpected'], ['a number', 42],
  ])('rows given as %s show the empty grid', (_, rows) => {
    renderPage(<DataTable rows={rows} columns={COLUMNS} label="Companies" />);
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(screen.getByRole('grid', { name: 'Companies' })).toBeInTheDocument();
    expect(screen.getByText('No rows')).toBeInTheDocument();
  });


  it('drops rows that are not records or have no usable id, and keeps the good ones in order', () => {
    const rows = [
      { id: 'a', name: 'Kept A' },
      null,
      'a string',
      42,
      ['an', 'array'],
      {},
      { name: 'No id' },
      { id: null, name: 'Null id' },
      { id: { nested: 1 }, name: 'Object id' },
      { id: Number.NaN, name: 'NaN id' },
      { id: true, name: 'Boolean id' },
      { id: 7, name: 'Kept 7' },
      { id: '', name: 'Kept empty-string id' },
    ];
    renderPage(<DataTable rows={rows} columns={COLUMNS} label="Companies" />);
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(names()).toEqual(['Kept A', 'Kept 7', 'Kept empty-string id']);
  });


  it('keeps the first of duplicate ids — and 1 and "1" are the same id to the grid', () => {
    const rows = [
      { id: 'x', name: 'First x' }, { id: 'x', name: 'Second x' },
      { id: 1, name: 'Number 1' }, { id: '1', name: 'String 1' },
    ];
    renderPage(<DataTable rows={rows} columns={COLUMNS} label="Companies" />);
    expect(names()).toEqual(['First x', 'Number 1']);
  });


  it('survives the contract variants of a list: every field missing, every leaf null, swapped types, hostile strings', () => {
    const good = companies(4);
    const variants = {
      missing: good.map(() => ({})),
      nulls: good.map((row) => Object.fromEntries(Object.keys(row).map((k) => [k, null]))),
      swapped: good.map((row) => ({ ...row, id: 12345, employees: String(row.employees) })),
      hostile: good.map((row) => ({ ...row, id: '💾 <script>', name: '💾 <b>x</b>' })),
    };
    for (const [variant, rows] of Object.entries(variants)) {
      const { unmount } = renderPage(<DataTable rows={rows} columns={COLUMNS} label={variant} />);
      expect(screen.queryByTestId('render-crashed'), variant).toBeNull();
      expect(screen.getByRole('grid', { name: variant })).toBeInTheDocument();
      unmount();
    }
  });


  it('renders the unique rows of a 300-row answer full of duplicates, nulls and strings', () => {
    // i % 3: 0 → a record, 1 → its duplicate, 2 → null or a string
    const rows = Array.from({ length: 300 }, (_, i) => {
      const n = Math.floor(i / 3);
      if (i % 3 === 0) return { id: `r${n}`, name: `Row ${String(n).padStart(3, '0')}` };
      if (i % 3 === 1) return { id: `r${n}`, name: `Duplicate ${n}` };
      return n % 2 ? null : `garbage ${n}`;
    });
    renderPage(<DataTable rows={rows} columns={COLUMNS} label="Companies" pageSize={100} />);
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(names()).toHaveLength(100);
    expect(names().every((name) => name.startsWith('Row '))).toBe(true);
    expect(names().slice(0, 2)).toEqual(['Row 000', 'Row 001']);
    expect(footerText()).toContain('1–100 of 100');
  });


  it('keys the rows by the caller\'s getRowId — rows without an `id` field are fine then', async () => {
    const onRowClick = vi.fn();
    const prompts = [{ slug: 'gap-analysis', name: 'Gap analysis' }, { slug: 'chat', name: 'Chat' }, { slug: 'chat', name: 'Chat again' }];
    const { user } = renderPage(
      <DataTable rows={prompts} columns={COLUMNS} label="Prompts" getRowId={(row) => row.slug} onRowClick={onRowClick} />,
    );
    expect(names()).toEqual(['Gap analysis', 'Chat']);
    await user.click(screen.getByText('Chat'));
    expect(onRowClick.mock.calls[0][0].id).toBe('chat');
  });


  it('drops a row the caller\'s getRowId throws on, instead of crashing', () => {
    const rows = [{ key: { value: 'k1' }, name: 'Keyed' }, { name: 'No key' }];
    renderPage(<DataTable rows={rows} columns={COLUMNS} label="Companies" getRowId={(row) => row.key.value} />);
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(names()).toEqual(['Keyed']);
  });
});







// -----------------------------------------------------------
// Page, size and sort in the address
// -----------------------------------------------------------
//
// `persist`: the list comes back on the page, at the size and
// in the order it was left. renderPersisted puts a 120-row
// table on /t (its own route, so the address is its own).
// -----------------------------------------------------------

describe('DataTable page, size and sort in the address (persist)', () => {

  const renderPersisted = (route = '/t', props = {}) => renderPage(
    <DataTable rows={companies(120)} columns={COLUMNS} label="Companies" persist {...props} />,
    { route, path: '/t' },
  );

  // Rows that arrive after the first render, as a query's do
  function LateRows({ count }) {
    const [rows, setRows] = useState([]);
    return (
      <>
        <button type="button" onClick={() => setRows(companies(count))}>load</button>
        <DataTable rows={rows} loading={rows.length === 0} columns={COLUMNS} label="Companies" persist />
      </>
    );
  }


  it('starts on the page, at the size and in the order the address holds', () => {
    renderPersisted('/t?page=2&size=50&sort=name.desc');
    expect(footerText()).toContain('51–100 of 120');
    expect(names()[0]).toBe('Company 070');
    expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute('aria-sort', 'descending');
  });


  it('writes the user\'s changes back — replacing the entry — and a default leaves no parameter', async () => {
    const { router, user } = renderPersisted();
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
    expect(router.state.historyAction).toBe('REPLACE');

    await user.click(screen.getByRole('combobox', { name: /Rows per page/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: '50' }));
    await waitFor(() => expect(router.state.location.search).toBe('?page=2&size=50'));
    await waitFor(() => expect(footerText()).toContain('51–100 of 120'));

    // a sort starts the list over: the page goes with it
    await user.click(screen.getByRole('columnheader', { name: /^Name/ }).querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(router.state.location.search).toBe('?size=50&sort=name.asc'));
    await waitFor(() => expect(footerText()).toContain('1–50 of 120'));

    await user.click(screen.getByRole('combobox', { name: /Rows per page/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: '25' }));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=name.asc'));
  });


  it('a table inside a tab prefixes its names, and leaves the page\'s own parameters alone', async () => {
    const { router, user } = renderPersisted('/t?tab=documents&page=7', { persist: 'documents' });
    expect(footerText()).toContain('1–25 of 120');
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=documents&page=7&documents.page=2'));
  });


  it('a page, size or column the table does not know reads as the default', () => {
    renderPersisted('/t?page=abc&size=37&sort=ghost.asc');
    expect(footerText()).toContain('1–25 of 120');
    expect(names()[0]).toBe('Company 001');
    renderPersisted('/t?page=-2&size=1000&sort=name.sideways');
    expect(footerText()).toContain('1–25 of 120');
  });


  it('a cleared default sort is kept as "none" — and read back unsorted', async () => {
    const initialSort = [{ field: 'employees', sort: 'desc' }];
    const { router, user, unmount } = renderPersisted('/t', { initialSort });
    expect(screen.getByRole('columnheader', { name: /Employees/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('columnheader', { name: /Employees/ }).querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=none'));
    unmount();
    renderPersisted('/t?sort=none', { initialSort });
    expect(screen.getByRole('columnheader', { name: /Employees/ })).toHaveAttribute('aria-sort', 'none');
    expect(names()[0]).toBe('Company 001');
  });


  it('a page beyond rows that come late waits for them, then comes back to the last page', async () => {
    const { router, user } = renderPage(<LateRows count={60} />, { route: '/t?page=9', path: '/t' });
    await waitFor(() => expect(router.state.location.search).toBe('?page=9'));
    await user.click(screen.getByRole('button', { name: 'load' }));
    await waitFor(() => expect(footerText()).toContain('51–60 of 60'));
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'));
  });


  it('a page the late rows hold is kept as it was', async () => {
    const { router, user } = renderPage(<LateRows count={120} />, { route: '/t?page=3', path: '/t' });
    await user.click(screen.getByRole('button', { name: 'load' }));
    await waitFor(() => expect(footerText()).toContain('51–75 of 120'));
    expect(router.state.location.search).toBe('?page=3');
  });


  it('without persist it needs no router and writes nothing', async () => {
    const plain = render(<Providers><DataTable rows={companies(60)} columns={COLUMNS} label="Companies" /></Providers>);
    expect(names()).toHaveLength(25);
    plain.unmount();
    const { router, user } = renderPage(<DataTable rows={companies(60)} columns={COLUMNS} label="Companies" />, { route: '/t', path: '/t' });
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(footerText()).toContain('26–50 of 60');
    expect(router.state.location.search).toBe('');
  });
});
