// -----------------------------------------------------------
//  [*] Prompts — the versioned prompt store (admin)
//
//  GET /api/prompts: every prompt of the chat and the
//  analysis pipeline with its active version and model; a
//  "new default waiting" badge marks prompts where the
//  deployment shipped a newer default that is not active
//  because an administrator's own version is in use. A row
//  opens the editor.
//
//  The grid keys its rows by the slug (the link target); an
//  answer without a prompt list is the error state, and rows
//  without a usable slug are left out rather than crashing
//  the grid. Its page and sort live in the address
//  (?sort=kind.asc), so the editor's back link returns to
//  the list as it was.
//
//  Split into (root component last):
//
//    promptRows — the answer → the rows the grid can key
//    slugOf     — the grid's row id
//    Prompts    — the page (default export)
// -----------------------------------------------------------

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Chip from '@mui/material/Chip';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import PageLayout from '@/components/layout/PageLayout';
import DataTable from '@/components/DataTable/DataTable';
import ErrorState from '@/components/ErrorState/ErrorState';
import EmptyState from '@/components/EmptyState/EmptyState';
import usePromptText from '@/pages/Prompts/usePromptText';







// -----------------------------------------------------------
// promptRows
// -----------------------------------------------------------
//
// GET /api/prompts's {prompts} → the rows the grid shows:
// prompts with a non-empty string slug, each slug once (the
// DataGrid throws on a missing row id and repeats a React
// key on a duplicate one). An answer without the list
// throws — the error state with its retry, never "No
// prompts" for a broken answer.
//
// Used by:
//   - Prompts (below) — the list query
// -----------------------------------------------------------

function promptRows(data) {
  if (!Array.isArray(data?.prompts)) throw new Error('The prompts answer has no prompt list');
  const seen = new Set();
  return data.prompts.filter((row) => {
    if (typeof row?.slug !== 'string' || !row.slug || seen.has(row.slug)) return false;
    seen.add(row.slug);
    return true;
  });
}







// -----------------------------------------------------------
// slugOf
// -----------------------------------------------------------
//
// The grid's row id — module-level so its reference stays
// the same between renders (a new getRowId makes the grid
// rebuild its rows).
//
// Used by:
//   - Prompts (below) — DataTable getRowId
// -----------------------------------------------------------

function slugOf(row) {
  return row.slug;
}







// -----------------------------------------------------------
// Prompts (default export)
// -----------------------------------------------------------
//
// The list query and the table.
//
// Used by:
//   - router.jsx — route /prompts (adminOnly)
// -----------------------------------------------------------

export default function Prompts({ authData }) {

  const t = useTranslations('PAGES.prompts');
  const label = useEnumLabel();
  const text = usePromptText();
  const fmt = useFormat();
  const navigate = useNavigate();


  const { data: prompts = [], isLoading, error, refetch } = useQuery({
    queryKey: ['prompts'],
    queryFn: async () => promptRows((await api.get('/api/prompts')).data),
  });


  const columns = useMemo(() => [
    { field: 'name', headerName: t('COLUMNS.name'), flex: 2, minWidth: 260, valueGetter: (value, row) => text.name(row),
      renderCell: ({ row }) => (
        <div className="flex flex-col py-1 min-w-0">
          <Link to={`/prompts/${row.slug}`} className="text-primary font-semibold" onClick={(e) => e.stopPropagation()}>{text.name(row)}</Link>
          {row.description && <span className="text-xs text-muted line-clamp-2 whitespace-normal">{text.description(row)}</span>}
        </div>
      ) },
    { field: 'slug', headerName: t('COLUMNS.slug'), width: 220, renderCell: ({ value }) => <code className="text-xs">{value}</code> },
    { field: 'kind', headerName: t('COLUMNS.kind'), width: 160, valueFormatter: (value) => label('promptKind', value) },
    { field: 'activeVersion', headerName: t('COLUMNS.active'), width: 230,
      renderCell: ({ row }) => (
        <div className="flex items-center gap-1 flex-wrap py-1">
          <span>{row.activeVersion ? `v${row.activeVersion}` : t('noActive')}</span>
          {row.pendingDefault && <Chip size="small" color="warning" variant="outlined" icon={<NewReleasesOutlinedIcon />} label={t('pending', { version: row.pendingDefault })} />}
        </div>
      ) },
    { field: 'activeModel', headerName: t('COLUMNS.model'), width: 220, valueFormatter: (value) => value || '—' },
    { field: 'updatedAt', headerName: t('COLUMNS.updated'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
  ], [t, label, text, fmt]);


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}>
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && prompts.length === 0 && <EmptyState icon={PsychologyOutlinedIcon} title={t('empty')} />}
      {!error && (isLoading || prompts.length > 0) && (
        <DataTable rows={prompts} columns={columns} loading={isLoading} label={t('TITLE')} autoRowHeight getRowId={slugOf} persist
                   mobileHidden={['slug', 'kind', 'activeModel', 'updatedAt']} onRowClick={({ row }) => navigate(`/prompts/${row.slug}`)} />
      )}
    </PageLayout>
  );
}
