// -----------------------------------------------------------
//  [*] ReportsTable — a list of gap-analysis reports
//
//  One table for the reports page and the company page's
//  reports tab: title (a real link), company (hidden inside
//  a company), status with a live progress bar while the
//  analysis runs, the finding counts that matter (not met /
//  partial / met), language and stamps. Rows click through
//  to the report. A row without an id (or one already
//  listed) cannot be linked or keyed and is left out — the
//  grid would throw on it.
//
//  Split into (root component last):
//
//    INITIAL_SORT — newest first
//    linkableRows — the rows the grid can key
//    ReportsTable — the table (default export)
// -----------------------------------------------------------

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LinearProgress from '@mui/material/LinearProgress';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import StatusChip from '@/components/StatusChip/StatusChip';
import DataTable from '@/components/DataTable/DataTable';
import { findingCounts, isActive, reportTitle } from '@/pages/Reports/reportUtils';


// Newest first until the user sorts
const INITIAL_SORT = [{ field: 'createdAt', sort: 'desc' }];







// -----------------------------------------------------------
// linkableRows
// -----------------------------------------------------------
//
// The reports with a usable id, the first of each id only —
// a broken answer (ids missing or repeated) must not take
// the table down: the DataGrid throws on a row without an
// id and React refuses two rows with one key.
//
// Used by:
//   - ReportsTable (below)
// -----------------------------------------------------------

function linkableRows(reports) {
  const seen = new Set();
  return (Array.isArray(reports) ? reports : []).filter((row) => {
    const id = row?.id;
    const usable = (typeof id === 'string' && id !== '') || Number.isFinite(id);
    if (!usable || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}







// -----------------------------------------------------------
// ReportsTable (default export)
// -----------------------------------------------------------
//
//   <ReportsTable reports={…} loading={…} persist />          — the page's list
//   <ReportsTable … hideCompany persist="reports" />         — inside a tab
//
// `persist` goes to DataTable: the page and sort in the
// address, under plain or prefixed names.
//
// Used by:
//   - Reports.jsx — the reports page
//   - pages/Companies/CompanyReports.jsx — one company's list
// -----------------------------------------------------------

export default function ReportsTable({ reports, loading, hideCompany = false, persist }) {

  const t = useTranslations('PAGES.reports');
  const label = useEnumLabel();
  const fmt = useFormat();
  const navigate = useNavigate();
  const rows = useMemo(() => linkableRows(reports), [reports]);


  const columns = useMemo(() => [
    { field: 'title', headerName: t('COLUMNS.title'), flex: 1.4, minWidth: 220,
      valueGetter: (_, row) => reportTitle(row, t('untitled'), fmt.date),
      renderCell: ({ row, value }) => <Link to={`/reports/${row.id}`} className="text-primary" onClick={(e) => e.stopPropagation()}>{value}</Link> },
    ...(hideCompany ? [] : [{ field: 'companyName', headerName: t('COLUMNS.company'), flex: 1, minWidth: 160 }]),
    { field: 'status', headerName: t('COLUMNS.status'), width: 170,
      renderCell: ({ row }) => (
        <div className="flex flex-col justify-center h-full gap-1">
          <div><StatusChip value={row.status} label={label('reportStatus', row.status)} /></div>
          {isActive(row) && (row.progress?.percent != null
            ? <LinearProgress variant="determinate" value={row.progress.percent} aria-label={label('stepName', row.progress?.step)} />
            : <LinearProgress aria-label={label('reportStatus', row.status)} />)}
        </div>
      ) },
    { field: 'findings', headerName: t('COLUMNS.findings'), width: 250, sortable: false,
      valueGetter: (_, row) => {
        if (row.status !== 'done') return '';
        return t('findingsSummary', findingCounts(row));
      } },
    { field: 'language', headerName: t('COLUMNS.language'), width: 110, valueFormatter: (value) => label('language', value) },
    { field: 'createdAt', headerName: t('COLUMNS.created'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
    { field: 'finishedAt', headerName: t('COLUMNS.finished'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
  ], [t, label, fmt, hideCompany]);


  return (
    <DataTable
      rows={rows}
      columns={columns}
      loading={loading}
      label={t('TITLE')}
      mobileHidden={['findings', 'language', 'createdAt', 'finishedAt']}
      onRowClick={({ row }) => navigate(`/reports/${row.id}`)}
      initialSort={INITIAL_SORT}
      persist={persist}
    />
  );
}
