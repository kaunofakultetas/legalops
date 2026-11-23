// -----------------------------------------------------------
//  [*] DataTable — the pager in the grid's footer
//
//  Numbered page buttons in place of the DataGrid's own
//  "previous / next" footer, after the pager of the tracer
//  system (its ButtonsPagination): outlined, rounded items
//  with the current page filled in, arrows to the first and
//  the last page, and up to four pages at either end of the
//  row. What this one adds:
//
//    - the range ("1–50 of 1,000") and the rows-per-page
//      choice stay beside the buttons — tracer's pager
//      replaced them;
//    - a hover is a light tint of the brand's blue, not the
//      dark fill of the selected page, and a keyboard focus
//      has its ring;
//    - what has no use is left out: the page buttons of a
//      list that fits one page, and the rows-per-page choice
//      of a list shorter than the smallest page;
//    - every button is named for a screen reader in the
//      interface's language (the theme's MuiPagination
//      texts, localeTheme.js), and the current page is
//      marked as such.
//
//  It must be rendered inside a DataGrid slot: it reads and
//  sets the page through the grid's API, so the page and the
//  page size a table keeps in the address keep working. The
//  grid counts pages from 0, the buttons from 1.
//
//  On a phone the row is at most seven 36 px items —
//  previous, the first page, the current one, the last one
//  (ellipses between) and next — centred under the range, so
//  it fits a 300 px grid on one line; the first and last
//  page numbers stand in for the arrows that jump there. There is no hover tint
//  there: a touch screen keeps the last tapped button
//  "hovered".
//
//  Split into:
//
//    PAGER_SX   — the look of the page buttons
//    TablePager — the footer row (default export)
// -----------------------------------------------------------

import { useId } from 'react';
import { alpha } from '@mui/material/styles';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Select from '@mui/material/Select';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  gridPageCountSelector, gridPaginationModelSelector, gridPaginationRowCountSelector, useGridApiContext, useGridRootProps,
  useGridSelector,
} from '@mui/x-data-grid';


// The page buttons: hairline boxes with tabular digits, the
// current page in the brand's ink, a hover as the light tint
// the navigation uses for "you are here" (none on a touch
// screen), 36 px targets on a phone
const PAGER_SX = (theme) => ({
  '& .MuiPagination-ul': { flexWrap: 'nowrap' },
  '& .MuiPaginationItem-root': {
    fontVariantNumeric: 'tabular-nums',
    borderColor: theme.palette.divider,
    '&:hover': { backgroundColor: alpha(theme.palette.primary.light, 0.12) },
    '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
    '&.Mui-selected': {
      backgroundColor: theme.palette.primary.main,
      borderColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      '&:hover, &.Mui-focusVisible': { backgroundColor: theme.palette.primary.dark },
    },
  },
  [theme.breakpoints.down('md')]: {
    '& .MuiPaginationItem-root': {
      minWidth: 36,
      height: 36,
      '&:hover': { backgroundColor: 'transparent' },
      '&.Mui-selected:hover': { backgroundColor: theme.palette.primary.main },
    },
  },
});







// -----------------------------------------------------------
// TablePager (default export)
// -----------------------------------------------------------
//
// The footer row of a paged grid: which rows are shown, how
// many a page holds (a choice among the grid's page sizes)
// and the page buttons. The range and the label of the
// choice are the grid's own translated texts. A page size
// may be given as a number or as a value with a label.
//
// Used by:
//   - DataTable.jsx — the pagination slot of every grid
// -----------------------------------------------------------

export default function TablePager() {

  const apiRef = useGridApiContext();
  const rootProps = useGridRootProps();
  const { page, pageSize } = useGridSelector(apiRef, gridPaginationModelSelector);
  const pageCount = useGridSelector(apiRef, gridPageCountSelector);
  const rowCount = useGridSelector(apiRef, gridPaginationRowCountSelector);
  const phone = useMediaQuery((theme) => theme.breakpoints.down('md'), { noSsr: true });
  const labelId = useId();
  const sizes = (rootProps.pageSizeOptions ?? []).map((option) => (typeof option === 'object' ? option : { value: option, label: String(option) }));
  const smallest = Math.min(...sizes.map((option) => option.value));
  const from = rowCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(rowCount, (page + 1) * pageSize);


  return (
    <div className="ml-auto flex flex-wrap items-center justify-center md:justify-end gap-x-5 gap-y-2 py-2 px-3 text-sm">
      <span className="text-muted tabular-nums">
        {apiRef.current.getLocaleText('paginationDisplayedRows')({ from, to, count: rowCount, estimated: undefined })}
      </span>
      {sizes.length > 1 && rowCount > smallest && (
        <span className="flex items-center gap-1.5 text-muted">
          <span id={labelId}>{apiRef.current.getLocaleText('paginationRowsPerPage')}</span>
          <Select
            variant="standard" disableUnderline value={pageSize} labelId={labelId}
            onChange={(event) => apiRef.current.setPageSize(Number(event.target.value))}
            sx={{ fontSize: 'inherit', '& .MuiSelect-select': { py: 0.25, fontVariantNumeric: 'tabular-nums' } }}
          >
            {sizes.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </Select>
        </span>
      )}
      {pageCount > 1 && (
        <Pagination
          variant="outlined" shape="rounded" page={page + 1} count={pageCount}
          siblingCount={phone ? 0 : 1} boundaryCount={phone ? 1 : 4}
          showFirstButton={!phone} showLastButton={!phone}
          onChange={(_, value) => apiRef.current.setPage(value - 1)}
          sx={PAGER_SX}
        />
      )}
    </div>
  );
}
