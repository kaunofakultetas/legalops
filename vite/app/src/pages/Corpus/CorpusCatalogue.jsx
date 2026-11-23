// -----------------------------------------------------------
//  [*] CorpusCatalogue — the legal acts table
//
//  GET /api/corpus/documents?q=&jurisdiction= (users see the
//  enabled acts, admins all); the act type filter works on
//  the loaded rows. Each row: the act (short title + the
//  official title under it, a real link), jurisdiction, type,
//  in-force status, the current version with its ingestion
//  status, provisions, obligations (admins), when the source
//  was last checked and the last error. Admin row actions
//  queue a refresh or an obligation extraction in place (the
//  click never reaches the row, which opens the act). While
//  an act is still being ingested the list polls. A malformed
//  answer's unusable rows are dropped (tableRows.js).
//
//  The filters and the table's page and sort live in the
//  address (?q=…&jurisdiction=EU&type=regulation&page=2 —
//  replaced), so Back from an act finds the catalogue as it
//  was; a value the catalogue does not know is ignored.
//
//  Split into (root component last):
//
//    INGESTING       — version statuses that still move
//    Filters         — search, jurisdiction, type
//    CorpusCatalogue — the tab (default export)
// -----------------------------------------------------------

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';
import { DOC_TYPES, JURISDICTIONS } from '@/constants/enums';
import tableRows from '@/pages/Corpus/tableRows';
import useQueueJob from '@/pages/Corpus/useQueueJob';


// A version in one of these is still on its way to "ready"
const INGESTING = ['pending', 'parsing', 'embedding'];







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// The title search (server; `search` the box's draft),
// jurisdiction (server) and act type (client).
//
// Used by:
//   - CorpusCatalogue (below)
// -----------------------------------------------------------

function Filters({ filters, search, onSearch, onFilter }) {
  const t = useTranslations('PAGES.corpus');
  const label = useEnumLabel();
  const set = (key) => (e) => onFilter(key, e.target.value);
  return (
    <div className="flex gap-2 flex-wrap mb-3">
      <TextField size="small" label={t('search')} value={search} onChange={(e) => onSearch(e.target.value)} className="w-72 max-w-full"
                 slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      <TextField select size="small" label={t('jurisdiction')} value={filters.jurisdiction} onChange={set('jurisdiction')} sx={{ minWidth: 150 }}>
        <MenuItem value="">{t('all')}</MenuItem>
        {JURISDICTIONS.map((j) => <MenuItem key={j} value={j}>{label('jurisdiction', j)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t('docType')} value={filters.docType} onChange={set('docType')} sx={{ minWidth: 190 }}>
        <MenuItem value="">{t('all')}</MenuItem>
        {DOC_TYPES.map((d) => <MenuItem key={d} value={d}>{label('docType', d)}</MenuItem>)}
      </TextField>
    </div>
  );
}







// -----------------------------------------------------------
// CorpusCatalogue (default export)
// -----------------------------------------------------------
//
//   <CorpusCatalogue isAdmin={…} />
//
// Used by:
//   - Corpus.jsx — the catalogue tab
// -----------------------------------------------------------

export default function CorpusCatalogue({ isAdmin }) {

  const t = useTranslations('PAGES.corpus');
  const label = useEnumLabel();
  const fmt = useFormat();
  const navigate = useNavigate();
  const queue = useQueueJob();
  const [params, setView] = useViewParams();
  const q = (params.get('q') ?? '').trim();
  const filters = { jurisdiction: oneOf(params.get('jurisdiction'), JURISDICTIONS), docType: oneOf(params.get('type'), DOC_TYPES) };
  // A new filter is a new list: its first page
  const [search, setSearch] = useDraftText(q, (text) => setView({ q: text, page: null }));
  const setFilter = (key, value) => setView({ [key === 'docType' ? 'type' : key]: value, page: null });


  const { data: documents = [], isLoading, error, refetch } = useQuery({
    queryKey: ['corpus', 'documents', { q, jurisdiction: filters.jurisdiction }],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (q) query.set('q', q);
      if (filters.jurisdiction) query.set('jurisdiction', filters.jurisdiction);
      return tableRows((await api.get(`/api/corpus/documents?${query}`)).data.documents);
    },
    placeholderData: (previous) => previous,
    refetchInterval: (query) => (query.state.data?.some((d) => INGESTING.includes(d.currentVersion?.status)) ? 5000 : false),
  });


  const rows = filters.docType ? documents.filter((d) => d.docType === filters.docType) : documents;
  const ready = documents.filter((d) => d.currentVersion?.status === 'ready').length;
  const failed = documents.filter((d) => d.lastError || d.currentVersion?.status === 'failed').length;
  const filtered = Boolean(q || filters.jurisdiction || filters.docType);
  const mutate = queue.mutate;


  const columns = useMemo(() => [
    { field: 'title', headerName: t('COLUMNS.title'), flex: 2, minWidth: 260,
      valueGetter: (_, row) => row.shortTitle || row.title,
      renderCell: ({ row }) => (
        <div className="flex flex-col py-1 min-w-0">
          <Link to={`/corpus/${row.id}`} className="text-primary font-semibold truncate" onClick={(e) => e.stopPropagation()}>
            {row.shortTitle || row.title}
          </Link>
          {row.shortTitle && <span className="text-xs text-muted truncate" title={row.title}>{row.title}</span>}
          {!row.enabled && <span className="text-xs text-muted">{t('disabled')}</span>}
        </div>
      ) },
    { field: 'jurisdiction', headerName: t('COLUMNS.jurisdiction'), width: 100, valueFormatter: (value) => label('jurisdiction', value) },
    { field: 'docType', headerName: t('COLUMNS.docType'), width: 130, valueFormatter: (value) => label('docType', value) },
    { field: 'status', headerName: t('COLUMNS.status'), width: 130,
      renderCell: ({ value }) => <StatusChip kind="docStatus" value={value} label={label('docStatus', value)} /> },
    { field: 'version', headerName: t('COLUMNS.version'), width: 185, sortable: false,
      valueGetter: (_, row) => row.currentVersion?.status || '',
      renderCell: ({ row }) => {
        // The last ingestion error rides beside the version
        const problem = row.lastError || (row.currentVersion?.status === 'failed' ? row.currentVersion.error : null);
        return (
          <span className="flex items-center gap-1">
            {row.currentVersion
              ? <StatusChip kind="version" value={row.currentVersion.status} label={t('versionCell', { no: row.currentVersion.versionNo, status: label('versionStatus', row.currentVersion.status) })} />
              : <span className="text-muted text-sm">{t('noVersion')}</span>}
            {problem && <Tooltip title={problem}><ErrorOutlineIcon color="error" fontSize="small" tabIndex={0} aria-label={`${t('COLUMNS.problem')}: ${problem}`} /></Tooltip>}
          </span>
        );
      } },
    { field: 'units', headerName: t('COLUMNS.units'), width: 95, type: 'number',
      valueGetter: (_, row) => row.currentVersion?.unitCount ?? null, valueFormatter: (value) => (value == null ? '—' : fmt.number(value)) },
    ...(isAdmin ? [{ field: 'obligationCount', headerName: t('COLUMNS.obligations'), width: 95, type: 'number',
      valueFormatter: (value) => (value == null ? '—' : fmt.number(value)) }] : []),
    { field: 'lastCheckedAt', headerName: t('COLUMNS.lastChecked'), width: 150, valueFormatter: (value) => fmt.dateTime(value) },
    ...(isAdmin ? [{ field: 'actions', headerName: t('COLUMNS.actions'), width: 90, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        // The row click opens the act — a click on an action
        // (or beside a disabled one) must act in place
        <div className="flex" onClick={(e) => e.stopPropagation()} role="presentation">
          <IconAction label={t('ACTIONS.refresh')} icon={<SyncOutlinedIcon fontSize="small" />}
                      disabled={row.sourceKind === 'upload' && !row.currentVersion}
                      onClick={() => mutate({ url: `/api/corpus/documents/${encodeURIComponent(row.id)}/refresh` })} />
          <IconAction label={t('ACTIONS.extract')} icon={<FactCheckOutlinedIcon fontSize="small" />} disabled={!row.currentVersion}
                      onClick={() => mutate({ url: `/api/corpus/documents/${encodeURIComponent(row.id)}/extract-obligations`, body: { language: 'lt' } })} />
        </div>
      ) }] : []),
  ], [t, label, fmt, isAdmin, mutate]);


  return (
    <>
      <Filters filters={filters} search={search} onSearch={setSearch} onFilter={setFilter} />
      {documents.length > 0 && (
        <Typography variant="body2" color="text.secondary" className="mb-2">
          {t('summary', { total: documents.length, ready, failed })}
        </Typography>
      )}
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && rows.length === 0 && (
        <EmptyState icon={GavelOutlinedIcon} title={filtered ? t('emptyFiltered') : t('empty')}
                    text={isAdmin && !filtered ? t('emptyText') : null} />
      )}
      {!error && (isLoading || rows.length > 0) && (
        <DataTable rows={rows} columns={columns} loading={isLoading} label={t('TITLE')} autoRowHeight pageSize={50} persist
                   hiddenColumns={['lastCheckedAt']} mobileHidden={['jurisdiction', 'docType', 'status', 'units', 'obligationCount']}
                   getRowClassName={(params) => (params.row.enabled ? 'cursor-pointer' : 'cursor-pointer opacity-60')}
                   onRowClick={({ row }) => navigate(`/corpus/${row.id}`)} />
      )}
    </>
  );
}
