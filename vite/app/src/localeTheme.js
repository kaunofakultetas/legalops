// -----------------------------------------------------------
//  [*] localeTheme — MUI's own texts in the UI language
//
//  MUI ships no Lithuanian locale for the core components or
//  the DataGrid, so the texts live in messages/COMPONENTS/
//  {mui,dataGrid} like every other string, and this module
//  turns them into MUI locale objects (the {components:
//  {MuiX: {defaultProps}}} shape createTheme merges). The
//  function-valued texts (counts, page ranges) are built
//  here from {placeholder} templates; the grid's footer
//  counts are grouped in the UI language like every other
//  number (a bare toLocaleString() followed the browser, so
//  a Lithuanian page could print "1,500" — one and a half).
//
//  Split into:
//
//    fill           — {name} template → string
//    coreLocale     — Alert, Autocomplete, pagination texts
//    gridLocale     — the DataGrid localeText
//    useLocaleTheme — the theme for the live locale
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useLocale, useTranslations } from '@/i18n';
import { buildTheme } from '@/theme';
import { formatNumber } from '@/utils/format';


// DataGrid texts that are plain strings in the message file
const GRID_STRING_KEYS = [
  'noRowsLabel', 'noResultsOverlayLabel', 'noColumnsOverlayLabel', 'noColumnsOverlayManageColumns',
  'toolbarDensity', 'toolbarDensityLabel', 'toolbarDensityCompact', 'toolbarDensityStandard',
  'toolbarDensityComfortable', 'toolbarColumns', 'toolbarColumnsLabel', 'toolbarFilters', 'toolbarFiltersLabel',
  'toolbarFiltersTooltipHide', 'toolbarFiltersTooltipShow', 'toolbarQuickFilterPlaceholder', 'toolbarQuickFilterLabel',
  'toolbarQuickFilterDeleteIconLabel', 'toolbarExport', 'toolbarExportLabel', 'toolbarExportCSV', 'toolbarExportPrint',
  'columnsManagementSearchTitle', 'columnsManagementNoColumns', 'columnsManagementShowHideAllText',
  'columnsManagementReset', 'columnsManagementDeleteIconLabel', 'filterPanelAddFilter', 'filterPanelRemoveAll',
  'filterPanelDeleteIconLabel', 'filterPanelLogicOperator', 'filterPanelOperator', 'filterPanelOperatorAnd',
  'filterPanelOperatorOr', 'filterPanelColumns', 'filterPanelInputLabel', 'filterPanelInputPlaceholder',
  'filterOperatorContains', 'filterOperatorDoesNotContain', 'filterOperatorEquals', 'filterOperatorDoesNotEqual',
  'filterOperatorStartsWith', 'filterOperatorEndsWith', 'filterOperatorIs', 'filterOperatorNot',
  'filterOperatorAfter', 'filterOperatorOnOrAfter', 'filterOperatorBefore', 'filterOperatorOnOrBefore',
  'filterOperatorIsEmpty', 'filterOperatorIsNotEmpty', 'filterOperatorIsAnyOf', 'filterValueAny',
  'filterValueTrue', 'filterValueFalse', 'columnMenuLabel', 'columnMenuShowColumns', 'columnMenuManageColumns',
  'columnMenuFilter', 'columnMenuHideColumn', 'columnMenuUnsort', 'columnMenuSortAsc', 'columnMenuSortDesc',
  'columnHeaderFiltersLabel', 'columnHeaderSortIconLabel', 'footerTotalRows', 'checkboxSelectionHeaderName',
  'checkboxSelectionSelectAllRows', 'checkboxSelectionUnselectAllRows', 'checkboxSelectionSelectRow',
  'checkboxSelectionUnselectRow', 'booleanCellTrueLabel', 'booleanCellFalseLabel', 'actionsCellMore',
  'pinToLeft', 'pinToRight', 'unpin', 'paginationRowsPerPage',
];







// -----------------------------------------------------------
// fill
// -----------------------------------------------------------
//
// fill("{from}–{to} iš {count}", {from: 1, to: 25, count: 90})
//
// Used by:
//   - coreLocale, gridLocale (below)
// -----------------------------------------------------------

function fill(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? params[name] : `{${name}}`));
}







// -----------------------------------------------------------
// coreLocale
// -----------------------------------------------------------
//
// The core components' built-in texts: the Alert close
// button (review #11), Autocomplete, TablePagination,
// Pagination and Breadcrumbs. Pagination's <nav> hard-codes
// aria-label="pagination navigation" but spreads its props
// after it, so the theme's default aria-label replaces it (a
// caller's own still wins).
//
// Used by:
//   - useLocaleTheme (below)
// -----------------------------------------------------------

function coreLocale(t) {
  const pageLabel = (type, page, selected) => {
    if (type === 'page') return selected ? fill(t('paginationPage'), { page }) : fill(t('paginationGoTo'), { page });
    return t({ first: 'paginationFirst', last: 'paginationLast', next: 'paginationNext', previous: 'paginationPrevious' }[type] || 'paginationNext');
  };
  return {
    components: {
      MuiAlert: { defaultProps: { closeText: t('alertClose') } },
      MuiAutocomplete: {
        defaultProps: {
          clearText: t('autocompleteClear'), closeText: t('autocompleteClose'), loadingText: t('autocompleteLoading'),
          noOptionsText: t('autocompleteNoOptions'), openText: t('autocompleteOpen'),
        },
      },
      MuiBreadcrumbs: { defaultProps: { expandText: t('breadcrumbsExpand') } },
      MuiTablePagination: {
        defaultProps: {
          labelRowsPerPage: t('tablePaginationRowsPerPage'),
          labelDisplayedRows: ({ from, to, count }) => fill(t('tablePaginationDisplayed'), {
            from, to, count: count !== -1 ? count : fill(t('tablePaginationMoreThan'), { to }),
          }),
          getItemAriaLabel: (type) => pageLabel(type),
        },
      },
      MuiPagination: { defaultProps: { getItemAriaLabel: pageLabel, 'aria-label': t('paginationNav') } },
    },
  };
}







// -----------------------------------------------------------
// gridLocale
// -----------------------------------------------------------
//
// The DataGrid's localeText: the plain strings straight from
// the message file, the counted ones as functions (the
// footer counts grouped in `locale`).
//
// Used by:
//   - useLocaleTheme (below)
// -----------------------------------------------------------

function gridLocale(t, locale) {
  const localeText = Object.fromEntries(GRID_STRING_KEYS.map((key) => [key, t(key)]));
  Object.assign(localeText, {
    toolbarFiltersTooltipActive: (count) => fill(t('toolbarFiltersTooltipActive'), { count }),
    columnHeaderFiltersTooltipActive: (count) => fill(t('columnHeaderFiltersTooltipActive'), { count }),
    columnMenuAriaLabel: (name) => fill(t('columnMenuAriaLabel'), { name }),
    footerRowSelected: (count) => fill(t('footerRowSelected'), { count: formatNumber(count, locale) }),
    footerTotalVisibleRows: (visible, total) => fill(t('footerTotalVisibleRows'), {
      visible: formatNumber(visible, locale), total: formatNumber(total, locale),
    }),
    paginationDisplayedRows: ({ from, to, count }) => fill(t('paginationDisplayedRows'), {
      from, to, count: count !== -1 ? count : fill(t('paginationMoreThan'), { to }),
    }),
    paginationItemAriaLabel: (type) => t({
      first: 'paginationFirst', last: 'paginationLast', next: 'paginationNext', previous: 'paginationPrevious',
    }[type] || 'paginationNext'),
  });
  return { components: { MuiDataGrid: { defaultProps: { localeText } } } };
}







// -----------------------------------------------------------
// useLocaleTheme
// -----------------------------------------------------------
//
// The theme for the live locale; rebuilt only on a switch
// (the t functions are memoised per locale).
//
// Used by:
//   - providers.jsx — LocalizedTheme
// -----------------------------------------------------------

export function useLocaleTheme() {
  const locale = useLocale();
  const tCore = useTranslations('COMPONENTS.mui');
  const tGrid = useTranslations('COMPONENTS.dataGrid');
  return useMemo(() => buildTheme(coreLocale(tCore), gridLocale(tGrid, locale)), [tCore, tGrid, locale]);
}
