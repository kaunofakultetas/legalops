// -----------------------------------------------------------
//  [*] Audit — the action trail (admin)
//
//  GET /api/audit?limit=&before=&beforeId=&action=&user=
//  → {entries, next}, newest first by (createdAt, id).
//  `action` is a prefix on the server, so the picker offers
//  whole areas ("companies.") and the single actions under
//  them. "Load older entries" asks for the page the answer's
//  `next` names — {before, beforeId}, the stamp and id of the
//  oldest entry shown, sent back as they are — so entries
//  sharing that stamp are not skipped; a null `next` ends the
//  trail (a full last page offers nothing more). The "until
//  (inclusive)" filter starts the first page with `before`
//  alone, the server's strict "earlier than", after the
//  chosen minute. A failed "load older" keeps the entries
//  already shown and offers the retry under them.
//  Every action is labelled in the UI language (its code is
//  in the details); targets link to their page when there is
//  one. A row opens the full entry with its details — and so
//  does its time, a button, so a keyboard reaches it too. An
//  answer that is not a list of rows with ids of their own
//  (the DataGrid would throw), or whose `next` is not a
//  cursor, fails like any bad answer.
//
//  The filters and the table's page and sort live in the
//  address (?action=reports.&user=<id>&before=2026-09-24T14:05
//  &page=3 — replaced), so Back from a target's page finds
//  the trail as it was (the pages loaded so far come back
//  from the query cache while it holds them). An action the
//  picker does not offer, a user not in the directory or an
//  unreadable moment is ignored.
//
//  Split into (root component last):
//
//    PAGE          — entries per request
//    ACTION_GROUPS — the audited areas and their actions
//    ACTIONS       — every value the action picker offers
//    MOMENT        — the "until" field's value shape
//    rowsOf        — an answer's list, checked
//    nextOf        — an answer's cursor, checked
//    untilCursor   — the "until" filter → the first cursor
//    targetLink    — a target → its page, if any
//    Filters       — action, user, until
//    EntryDialog   — one entry in full
//    Audit         — the page (default export)
// -----------------------------------------------------------

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useViewParams from '@/hooks/useViewParams';
import { idParam, oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import JsonView from '@/components/JsonView/JsonView';
import UniversalModal from '@/components/UniversalModal/UniversalModal';


// Entries per request (the route caps at 500)
const PAGE = 200;

// The audited areas → their action codes (audit() calls in
// django); the labels are ENUMS.auditAction
const ACTION_GROUPS = {
  auth: ['login', 'login_failed', 'logout_all', 'change_password'],
  users: ['create', 'update', 'reset_password', 'deactivate', 'purge'],
  companies: ['create', 'update', 'delete', 'credential_add', 'credential_update', 'credential_remove', 'role_create', 'role_update', 'role_delete'],
  documents: ['upload', 'update', 'delete'],
  corpus: ['create', 'update', 'delete', 'refresh', 'upload', 'reembed', 'refresh_all'],
  obligations: ['create', 'update', 'delete', 'extract', 'review'],
  reports: ['create', 'delete', 'cancel', 'review_finding', 'export', 'approve', 'unapprove'],
  prompts: ['version_create', 'activate'],
  mcp: ['create', 'update', 'delete', 'test'],
  jobs: ['cancel'],
};

// Every value the action picker offers: a whole area
// ("companies.") and each action under it
const ACTIONS = Object.entries(ACTION_GROUPS).flatMap(([group, actions]) => [`${group}.`, ...actions.map((action) => `${group}.${action}`)]);

// The "until" field's value: a datetime-local minute
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;







// -----------------------------------------------------------
// rowsOf
// -----------------------------------------------------------
//
//   rowsOf(answer, 'entries') → answer.entries
//
// The list an answer carries under `key`, checked before the
// grid or the user picker sees it: the DataGrid throws on a
// row without an id (taking the page down), React mixes up
// rows that share one, and a page that is not a list would
// break the paging. Such an answer fails the query — the
// error state and its retry — instead.
//
// Used by:
//   - Filters (below) — the users query
//   - Audit (below) — the entries query
// -----------------------------------------------------------

function rowsOf(answer, key) {
  const rows = answer?.[key];
  const ids = Array.isArray(rows) ? rows.map((row) => row?.id) : [];
  if (!Array.isArray(rows) || ids.some((id) => id == null) || new Set(ids).size !== ids.length) {
    throw new Error(`Unexpected answer: "${key}" is not a list of rows with distinct ids`);
  }
  return rows;
}







// -----------------------------------------------------------
// nextOf
// -----------------------------------------------------------
//
//   nextOf({ entries, next: { before, beforeId } }) → { before, beforeId }
//   nextOf({ entries, next: null })                 → null
//
// The cursor of the page after an answer: the stamp and id
// of its oldest entry, which the next request sends back as
// they are. null — or no `next` at all — ends the trail. A
// `next` that is not two strings is a broken answer and
// fails the query like one instead of quietly ending the
// trail: an audit log that looks complete has to be.
//
// Used by:
//   - Audit (below) — the entries query
// -----------------------------------------------------------

function nextOf(answer) {
  const next = answer?.next;
  if (next == null) return null;
  if (typeof next.before !== 'string' || !next.before || typeof next.beforeId !== 'string' || !next.beforeId) {
    throw new Error('Unexpected answer: "next" is not a {before, beforeId} cursor');
  }
  return { before: next.before, beforeId: next.beforeId };
}







// -----------------------------------------------------------
// untilCursor
// -----------------------------------------------------------
//
//   untilCursor('2026-09-24T14:05') → the start of 14:06
//                                     local time, as UTC ISO
//
// The "until (inclusive)" filter as the first page's
// `before`, sent without a `beforeId`. The picker chooses
// minutes and `before` alone is a strict "earlier than", so
// the bound is the start of the NEXT minute — the entries of
// the chosen minute stay in. '' for an empty or unreadable
// value.
//
// Used by:
//   - Audit (below) — the first page's cursor
// -----------------------------------------------------------

function untilCursor(value) {
  const moment = value ? new Date(value) : null;
  if (!moment || Number.isNaN(moment.getTime())) return '';
  // Second 60 rolls over into the next minute's first second
  moment.setSeconds(60, 0);
  return moment.toISOString();
}







// -----------------------------------------------------------
// targetLink
// -----------------------------------------------------------
//
// An entry's target → a route, or null when there is no
// page for it (a finding links to its report via details).
//
// Used by:
//   - Audit (below) — the target column
// -----------------------------------------------------------

function targetLink(entry) {
  const id = entry.targetId;
  if (!id || id === 'all') return null;
  switch (entry.targetType) {
    case 'company': return `/companies/${id}`;
    case 'report': return `/reports/${id}`;
    case 'finding': return entry.details?.report ? `/reports/${entry.details.report}?tab=findings` : null;
    case 'legal_document': return `/corpus/${id}`;
    case 'prompt': return `/prompts/${id}`;
    case 'user': return '/users';
    case 'mcp_server': return '/settings/mcp';
    default: return null;
  }
}







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// The grouped action picker, the user picker (`users` the
// page's directory) and the "until" moment (`before` its
// field's draft — a date field cannot follow the address,
// which renders in a transition); any change restarts the
// paging.
//
// Used by:
//   - Audit (below)
// -----------------------------------------------------------

function Filters({ filters, setFilters, users, before, onBefore }) {

  const t = useTranslations('PAGES.audit');
  const label = useEnumLabel();


  const options = [];
  for (const [group, actions] of Object.entries(ACTION_GROUPS)) {
    options.push(<ListSubheader key={`h-${group}`}>{t(`GROUPS.${group}`)}</ListSubheader>);
    options.push(<MenuItem key={`${group}.`} value={`${group}.`}>{t('allOf', { group: t(`GROUPS.${group}`) })}</MenuItem>);
    for (const action of actions) {
      options.push(<MenuItem key={`${group}.${action}`} value={`${group}.${action}`} className="pl-8">{label('auditAction', `${group}.${action}`)}</MenuItem>);
    }
  }


  return (
    <div className="flex gap-2 flex-wrap mb-3 items-center">
      <TextField select size="small" label={t('action')} value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} sx={{ minWidth: 260 }}>
        <MenuItem value="">{t('allActions')}</MenuItem>
        {options}
      </TextField>
      <TextField select size="small" label={t('user')} value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })} sx={{ minWidth: 200 }}>
        <MenuItem value="">{t('allUsers')}</MenuItem>
        {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
        {/* The address's user while the directory loads — the
            select must hold its value to show it */}
        {filters.user && !users.some((u) => u.id === filters.user) && <MenuItem value={filters.user} className="hidden">…</MenuItem>}
      </TextField>
      <TextField size="small" type="datetime-local" label={t('before')} value={before}
                 onChange={(e) => onBefore(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      {(filters.action || filters.user || before) && (
        <Button size="small" onClick={() => setFilters({ action: '', user: '', before: '' })}>{t('clear')}</Button>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// EntryDialog
// -----------------------------------------------------------
//
// The whole entry: who, when, from where, the action (label
// and code), the target and the details.
//
// Used by:
//   - Audit (below)
// -----------------------------------------------------------

function EntryDialog({ entry, onClose }) {
  const t = useTranslations('PAGES.audit');
  const label = useEnumLabel();
  const fmt = useFormat();
  return (
    <UniversalModal open={Boolean(entry)} onClose={onClose} title={t('DETAILS.title')} cancelLabel={t('DETAILS.close')} maxWidth="md">
      {entry && (
        <div className="flex flex-col gap-3">
          <Typography>{label('auditAction', entry.action)}</Typography>
          <Typography variant="body2" color="text.secondary">
            {fmt.dateTime(entry.createdAt)} · {entry.userName || t('system')} · {entry.ip || '—'}
          </Typography>
          <Typography variant="body2">
            {t('DETAILS.code')}: <code>{entry.action}</code>{entry.targetType ? ` · ${label('targetType', entry.targetType)} ${entry.targetId || ''}` : ''}
          </Typography>
          <Typography variant="subtitle2" component="h3">{t('DETAILS.details')}</Typography>
          <JsonView value={entry.details} />
        </div>
      )}
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// Audit (default export)
// -----------------------------------------------------------
//
// Owns the filters (read from and written to the address),
// the directory the user filter picks from and is checked
// against, the keyset-paged query (each page is {entries,
// next}; the next request goes where `next` points) and the
// open entry (opened by a row click or the row's time
// button).
// Entries on screen stay there when a later request
// fails: a failed "load older" shows its error under them,
// a failed refresh above them.
//
// Used by:
//   - router.jsx — route /audit (adminOnly)
// -----------------------------------------------------------

export default function Audit({ authData }) {

  const t = useTranslations('PAGES.audit');
  const label = useEnumLabel();
  const fmt = useFormat();
  const [params, setView] = useViewParams();
  const [open, setOpen] = useState(null);


  // The same query (key and answer check) as the Users page
  const directory = useQuery({
    queryKey: ['users'],
    queryFn: async () => rowsOf((await api.get('/api/users')).data, 'users'),
  });
  const users = useMemo(() => directory.data ?? [], [directory.data]);


  // A user filter holds once the directory is known to have
  // them (while it loads, the address is believed); one
  // object per address, so the query key only changes with it
  const actionParam = oneOf(params.get('action'), ACTIONS);
  const userParam = idParam(params.get('user'));
  const beforeParam = MOMENT.test(params.get('before') ?? '') ? params.get('before') : '';
  const userKnown = !directory.data || users.some((u) => u.id === userParam);
  const filters = useMemo(() => ({ action: actionParam, user: userParam && userKnown ? userParam : '', before: beforeParam }),
    [actionParam, userParam, userKnown, beforeParam]);
  const setFilters = (next) => setView({ action: next.action, user: next.user, before: next.before, page: null });
  const [before, setBefore] = useDraftText(beforeParam, (value) => setView({ before: value, page: null }));


  const {
    data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: ['audit', filters],
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE) });
      if (filters.action) query.set('action', filters.action);
      if (filters.user) query.set('user', filters.user);
      // A later page goes where the previous answer's `next`
      // points; the first starts at the "until" bound, if any
      const cursor = pageParam ?? { before: untilCursor(filters.before) };
      if (cursor.before) query.set('before', cursor.before);
      if (cursor.beforeId) query.set('beforeId', cursor.beforeId);
      const answer = (await api.get(`/api/audit?${query}`)).data;
      return { entries: rowsOf(answer, 'entries'), next: nextOf(answer) };
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const entries = useMemo(() => data?.pages.flatMap((page) => page.entries) ?? [], [data]);


  const columns = useMemo(() => [
    // The time is a button: the row click is mouse-only, the
    // button is how a keyboard opens the entry
    { field: 'createdAt', headerName: t('COLUMNS.time'), width: 160, valueFormatter: (value) => fmt.dateTime(value),
      renderCell: ({ row, formattedValue }) => (
        <button type="button" aria-label={t('DETAILS.open', { time: formattedValue })}
                className="bg-transparent border-0 p-0 cursor-pointer text-primary text-left [font:inherit]"
                onClick={(event) => { event.stopPropagation(); setOpen(row); }}>
          {formattedValue}
        </button>
      ) },
    { field: 'userName', headerName: t('COLUMNS.user'), width: 170, valueFormatter: (value) => value || t('system') },
    { field: 'action', headerName: t('COLUMNS.action'), flex: 1, minWidth: 220, valueFormatter: (value) => label('auditAction', value) },
    // The short id; String() keeps a target id of the wrong
    // type from taking the grid down
    { field: 'target', headerName: t('COLUMNS.target'), flex: 1, minWidth: 200, sortable: false,
      valueGetter: (_, row) => (row.targetType ? `${label('targetType', row.targetType)} ${row.targetId ? String(row.targetId).slice(0, 8) : ''}` : '—'),
      renderCell: ({ row, value }) => {
        const to = targetLink(row);
        return to ? <Link to={to} className="text-primary" onClick={(e) => e.stopPropagation()}>{value}</Link> : value;
      } },
    { field: 'details', headerName: t('COLUMNS.details'), flex: 1.2, minWidth: 220, sortable: false,
      valueGetter: (value) => (value && Object.keys(value).length
        ? Object.entries(value).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
        : '') },
    { field: 'ip', headerName: t('COLUMNS.ip'), width: 130 },
  ], [t, label, fmt]);


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}>
      <Filters filters={filters} setFilters={setFilters} users={users} before={before} onBefore={setBefore} />
      {error && !isFetchNextPageError && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && entries.length === 0 && <EmptyState icon={HistoryOutlinedIcon} title={t('empty')} />}
      {(isLoading || entries.length > 0) && (
        <>
          <DataTable rows={entries} columns={columns} loading={isLoading} label={t('TITLE')} pageSize={50} persist
                     mobileHidden={['details', 'ip', 'target']} onRowClick={({ row }) => setOpen(row)} />
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <Typography variant="body2" color="text.secondary">{t('loaded', { count: fmt.number(entries.length) })}</Typography>
            {hasNextPage && !isFetchNextPageError && <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>{t('loadMore')}</Button>}
          </div>
          {/* A failed "load older" keeps the entries shown; its
              retry asks for that page again */}
          {isFetchNextPageError && <ErrorState error={error} onRetry={() => fetchNextPage()} title={t('loadMoreError')} className="mt-3" />}
        </>
      )}
      <EntryDialog entry={open} onClose={() => setOpen(null)} />
    </PageLayout>
  );
}
