// -----------------------------------------------------------
//  [*] ActVersions — an act's versions (redakcijos)
//
//  Every fetched or uploaded text of the act, newest first,
//  with its ingestion status and counts (provisions,
//  articles, chunks, characters), the parser and embedding
//  model that processed it, and when obligations were
//  extracted from it — the parser by its name, except the
//  ways a standard's structure was read, which are worded.
//  The current version is marked. Rows a
//  malformed answer cannot show are dropped (tableRows.js).
//  The table's page and sort stay in the address
//  (?versions.sort=…).
// -----------------------------------------------------------

import { useMemo } from 'react';
import Tooltip from '@mui/material/Tooltip';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import StatusChip from '@/components/StatusChip/StatusChip';
import tableRows from '@/pages/Corpus/tableRows';
import { STRUCTURE_PARSERS } from '@/constants/enums';







// -----------------------------------------------------------
// ActVersions (default export)
// -----------------------------------------------------------
//
//   <ActVersions versions={act.versions} currentId={act.currentVersion?.id} />
//
// Used by:
//   - CorpusDocument.jsx — the versions tab
// -----------------------------------------------------------

export default function ActVersions({ versions, currentId }) {

  const t = useTranslations('PAGES.corpusDocument.VERSIONS');
  const label = useEnumLabel();
  const fmt = useFormat();


  const columns = useMemo(() => [
    { field: 'versionNo', headerName: t('COLUMNS.version'), width: 130,
      renderCell: ({ row }) => <span>v{row.versionNo}{row.id === currentId && <span className="text-xs text-primary font-semibold"> · {t('current')}</span>}</span> },
    { field: 'status', headerName: t('COLUMNS.status'), width: 170,
      renderCell: ({ row }) => (
        <span className="flex h-full items-center gap-1">
          <StatusChip kind="version" value={row.status} label={label('versionStatus', row.status)} />
          {row.error && <Tooltip title={row.error}><ErrorOutlineIcon color="error" fontSize="small" tabIndex={0} aria-label={row.error} /></Tooltip>}
        </span>
      ) },
    { field: 'label', headerName: t('COLUMNS.label'), width: 190, valueFormatter: (value) => value || '—' },
    { field: 'effectiveDate', headerName: t('COLUMNS.effective'), width: 120, valueFormatter: (value) => fmt.date(value) },
    { field: 'unitCount', headerName: t('COLUMNS.units'), width: 100, type: 'number', valueFormatter: (value) => fmt.number(value) },
    { field: 'articleCount', headerName: t('COLUMNS.articles'), width: 100, type: 'number', valueFormatter: (value) => fmt.number(value) },
    { field: 'chunkCount', headerName: t('COLUMNS.chunks'), width: 100, type: 'number', valueFormatter: (value) => fmt.number(value) },
    { field: 'charCount', headerName: t('COLUMNS.chars'), width: 110, type: 'number', valueFormatter: (value) => fmt.number(value) },
    { field: 'parser', headerName: t('COLUMNS.parser'), width: 150,
      valueFormatter: (value) => (STRUCTURE_PARSERS.includes(value) ? t(`PARSERS.${value}`) : value || '—') },
    { field: 'embedModel', headerName: t('COLUMNS.embed'), width: 200, valueFormatter: (value) => value || '—' },
    { field: 'obligationsExtractedAt', headerName: t('COLUMNS.obligations'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
    { field: 'createdAt', headerName: t('COLUMNS.created'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
  ], [t, label, fmt, currentId]);


  const rows = tableRows(versions);
  if (!rows.length) return <EmptyState title={t('empty')} />;
  return (
    <DataTable rows={rows} columns={columns} label={t('COLUMNS.version')} persist="versions"
               mobileHidden={['label', 'chunkCount', 'charCount', 'parser', 'embedModel', 'createdAt']} />
  );
}
