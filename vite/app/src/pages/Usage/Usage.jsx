// -----------------------------------------------------------
//  [*] Usage — what the AI models cost
//
//    GET /api/usage?days=&scope=all&userId=  → budget, days,
//        byKind, byModel, byUser (scope=all), totals
//    GET /api/usage/calls?limit=&offset=&kind=&scope=&userId=
//    GET /api/usage/calls/{id}  → + toolCalls, transcript
//
//  Everyone sees their own usage; an admin can widen to all
//  accounts or look at one (the user picker is the only
//  reason the page asks GET /api/users, and only for an
//  admin). The page leads with today's USD budget as a meter
//  (null limit = unlimited), then the period's totals as stat
//  tiles, the cost per day and the tokens per day as two
//  column charts (two measures, two charts — never two axes),
//  the splits by purpose, model and user as tables, and the
//  call log; a call opens with its tool calls and, for chat
//  turns, the transcript (what the assistant told whom).
//
//  While another period or scope loads, the previous numbers
//  stay on screen dimmed and marked busy. The call log pages
//  by offset, so a call that moves onto the next page while
//  the log is open is listed once; rows without an id (or
//  with a repeated one) are left out — the grid cannot show
//  them. A call opens from its time cell, a button, so a
//  keyboard reaches it as well as a click on the row.
//
//  The view comes back as it was left: the period, the scope,
//  the log's purpose filter and its table page and sort live
//  in the address (?days=90&who=all&calls.kind=chat&
//  calls.page=2 — replaced), the open call too (?call=<id>,
//  useOverlayParam: Back closes it, and its conversation
//  link comes Back to it open); a chart shown as a table
//  stays a table (sessionStorage). A scope the page does not
//  know — a user not in the directory, "everyone" for a
//  plain user — reads as "mine".
//
//  Split into (root component last):
//
//    PERIODS      — the day ranges offered
//    CALL_KINDS   — the purposes the call log filters by
//    TOOL_KEYS    — the fields of a recorded tool call
//    keyedRows    — the rows a grid / list can key
//    Filters      — period, scope, user
//    SplitTable   — one {calls, tokens, cost} split
//    CallDialog   — one call in full
//    CallLog      — the paged call log
//    Usage        — the page (default export)
// -----------------------------------------------------------

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useOverlayParam from '@/hooks/useOverlayParam';
import useViewParams from '@/hooks/useViewParams';
import { idParam, oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import JsonView from '@/components/JsonView/JsonView';
import SectionCard from '@/components/SectionCard/SectionCard';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import ColumnChart from '@/components/charts/ColumnChart';
import Meter from '@/components/charts/Meter';
import StatTile from '@/components/charts/StatTile';
import { SERIES } from '@/components/charts/chartTokens';


// The period choices, in days
const PERIODS = [7, 30, 90];

// The call kinds the log's purpose filter offers
// (assistant/models.py CALL_KINDS)
const CALL_KINDS = ['chat', 'job_step', 'embed', 'prompt_test'];

// A recorded tool call's fields ({name, ms, ok, code?}) —
// labelled from PAGES.usage.CALL.TOOL
const TOOL_KEYS = ['name', 'ms', 'ok', 'code'];







// -----------------------------------------------------------
// keyedRows
// -----------------------------------------------------------
//
// The rows of a list answer the grid and React can key:
// objects with an id, each id once. Whatever else a
// malformed answer holds (no list at all, a row without an
// id — the DataGrid throws on one —, one id twice) is left
// out.
//
// Used by:
//   - Filters, CallLog (below)
// -----------------------------------------------------------

function keyedRows(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || typeof row !== 'object' || row.id == null || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// The period; for admins the scope (mine / everyone / one
// user; `directory` the page's users query). A failed user
// list leaves "mine" and "everyone" on offer and says why
// the people are missing.
//
// Used by:
//   - Usage (below)
// -----------------------------------------------------------

function Filters({ filters, setFilters, isAdmin, directory: { data, error, refetch } }) {

  const t = useTranslations('PAGES.usage');
  const users = keyedRows(data);


  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex gap-2 flex-wrap">
        <TextField select size="small" label={t('period')} value={filters.days} onChange={(e) => setFilters({ ...filters, days: e.target.value })} sx={{ minWidth: 170 }}>
          {PERIODS.map((d) => <MenuItem key={d} value={d}>{t('days', { days: d })}</MenuItem>)}
        </TextField>
        {isAdmin && (
          <TextField select size="small" label={t('scope')} value={filters.who} onChange={(e) => setFilters({ ...filters, who: e.target.value })} sx={{ minWidth: 220 }}>
            <MenuItem value="mine">{t('mine')}</MenuItem>
            <MenuItem value="all">{t('everyone')}</MenuItem>
            {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.displayName || u.email}</MenuItem>)}
            {/* The address's user while the directory loads — the
                select must hold its value to show it */}
            {!['mine', 'all'].includes(filters.who) && !users.some((u) => u.id === filters.who) && (
              <MenuItem value={filters.who} className="hidden">…</MenuItem>
            )}
          </TextField>
        )}
      </div>
      {isAdmin && error && <ErrorState error={error} onRetry={refetch} title={t('usersLoadError')} />}
    </div>
  );
}







// -----------------------------------------------------------
// SplitTable
// -----------------------------------------------------------
//
// A {key, calls, inputTokens, outputTokens, costUsd} list as
// a compact table, the first column labelled by `render`.
// Nothing for an empty (or malformed) split.
//
// Used by:
//   - Usage (below) — by purpose, by model, by user
// -----------------------------------------------------------

function SplitTable({ title, rows, keyHeader, render }) {

  const t = useTranslations('PAGES.usage.COLUMNS');
  const fmt = useFormat();
  const shown = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];


  if (shown.length === 0) return null;
  return (
    <SectionCard title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse tabular-nums">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal">{keyHeader}</th>
              <th className="py-1 pr-3 font-normal text-right">{t('calls')}</th>
              <th className="py-1 pr-3 font-normal text-right">{t('input')}</th>
              <th className="py-1 pr-3 font-normal text-right">{t('output')}</th>
              <th className="py-1 font-normal text-right">{t('cost')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index} className="border-t border-edge">
                <td className="py-1 pr-3">{render(row)}</td>
                <td className="py-1 pr-3 text-right">{fmt.number(row.calls)}</td>
                <td className="py-1 pr-3 text-right">{fmt.tokens(row.inputTokens)}</td>
                <td className="py-1 pr-3 text-right">{fmt.tokens(row.outputTokens)}</td>
                <td className="py-1 text-right font-semibold">{fmt.usd(row.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// CallDialog
// -----------------------------------------------------------
//
// GET /api/usage/calls/{id}: the numbers — with how much of
// the input the provider read from its prompt cache and
// wrote to it, which is why a long call costs less than its
// tokens suggest — the chat transcript when the call was a
// chat turn (as recorded, markdown and all) and the tool
// calls, their fields labelled. `callId` comes from the
// address (?call=), screened by idParam and encoded into the
// path.
//
// Used by:
//   - CallLog (below)
// -----------------------------------------------------------

function CallDialog({ callId, onClose }) {

  const t = useTranslations('PAGES.usage.CALL');
  const tTool = useTranslations('PAGES.usage.CALL.TOOL');
  const label = useEnumLabel();
  const fmt = useFormat();
  const toolLabels = Object.fromEntries(TOOL_KEYS.map((key) => [key, tTool(key)]));


  const { data: call, isLoading, error, refetch } = useQuery({
    queryKey: ['usageCall', callId],
    queryFn: async () => (await api.get(`/api/usage/calls/${encodeURIComponent(callId)}`)).data,
    enabled: Boolean(callId),
  });


  return (
    <UniversalModal open={Boolean(callId)} onClose={onClose} title={t('title')} cancelLabel={t('close')} maxWidth="md">
      {isLoading && <CircularProgress size={24} aria-label={t('title')} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {call && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip value={call.kind} label={label('callKind', call.kind)} />
            <StatusChip kind="outcome" value={call.outcome} label={label('outcome', call.outcome)} />
            <span className="text-sm text-muted">{fmt.dateTime(call.createdAt)} · {call.model} · {fmt.usd(call.costUsd)} · {fmt.duration(call.durationMs)}</span>
          </div>
          <Typography variant="body2" color="text.secondary">
            {t('tokens', { input: fmt.number(call.inputTokens), output: fmt.number(call.outputTokens), reasoning: fmt.number(call.reasoningTokens) })}
            {(call.cachedInputTokens > 0 || call.cacheWriteTokens > 0) && (
              <> · {t('cached', { read: fmt.number(call.cachedInputTokens ?? 0), written: fmt.number(call.cacheWriteTokens ?? 0) })}</>
            )}
          </Typography>
          {call.threadId && <Link to={`/chat/${call.threadId}`} className="text-primary text-sm">{t('thread')}</Link>}
          <Typography variant="subtitle2" component="h3">{t('transcript')}</Typography>
          {call.transcript ? (
            <div className="flex flex-col gap-2 text-sm">
              <div className="rounded bg-canvas p-2"><div className="text-xs text-muted">{t('userSaid')}</div><div className="whitespace-pre-wrap">{call.transcript.user}</div></div>
              <div className="rounded border border-edge p-2"><div className="text-xs text-muted">{t('assistantSaid')}</div><div className="whitespace-pre-wrap">{call.transcript.assistant}</div></div>
            </div>
          ) : <Typography variant="body2" color="text.secondary">{t('noTranscript')}</Typography>}
          {call.toolCalls?.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3">{t('tools')}</Typography>
              <JsonView value={call.toolCalls} labels={toolLabels} />
            </>
          )}
        </div>
      )}
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// CallLog
// -----------------------------------------------------------
//
// The newest calls, 100 at a time ("load more" appends from
// the offset of what the server has sent so far), filtered
// by purpose (?calls.kind=); a row — or its time, a button —
// opens CallDialog (?call=). The user column shows when the
// log is scoped wider than "mine".
//
// Used by:
//   - Usage (below)
// -----------------------------------------------------------

function CallLog({ scopeParams }) {

  const t = useTranslations('PAGES.usage');
  const label = useEnumLabel();
  const fmt = useFormat();
  const [params, setView] = useViewParams();
  const kind = oneOf(params.get('calls.kind'), CALL_KINDS);
  const setKind = (value) => setView({ 'calls.kind': value, 'calls.page': null });
  const [open, setOpen, closeCall] = useOverlayParam('call', idParam);


  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['usageCalls', scopeParams, kind],
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams(scopeParams);
      query.set('limit', '100');
      query.set('offset', String(pageParam));
      if (kind) query.set('kind', kind);
      return (await api.get(`/api/usage/calls?${query}`)).data;
    },
    initialPageParam: 0,
    // The offset counts what the server sent, shown or not
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (Array.isArray(page?.calls) ? page.calls.length : 0), 0);
      return loaded < Number(last?.total) ? loaded : undefined;
    },
  });
  const calls = useMemo(() => keyedRows(data?.pages.flatMap((page) => (Array.isArray(page?.calls) ? page.calls : []))), [data]);
  const total = data?.pages[0]?.total ?? 0;


  const columns = useMemo(() => [
    { field: 'createdAt', headerName: t('COLUMNS.time'), width: 160, valueFormatter: (value) => fmt.dateTime(value),
      renderCell: ({ row, formattedValue }) => (
        <button type="button" aria-label={t('CALLS.open', { time: formattedValue })}
                className="bg-transparent border-0 p-0 cursor-pointer text-primary text-left [font:inherit]"
                onClick={(event) => { event.stopPropagation(); setOpen(row.id); }}>
          {formattedValue}
        </button>
      ) },
    ...(scopeParams ? [{ field: 'userName', headerName: t('COLUMNS.user'), width: 160, valueFormatter: (value) => value || '—' }] : []),
    { field: 'kind', headerName: t('COLUMNS.kind'), width: 170, valueFormatter: (value) => label('callKind', value) },
    { field: 'purpose', headerName: t('COLUMNS.purpose'), width: 180 },
    { field: 'model', headerName: t('COLUMNS.model'), flex: 1, minWidth: 180 },
    { field: 'inputTokens', headerName: t('COLUMNS.input'), width: 100, type: 'number', valueFormatter: (value) => fmt.number(value) },
    { field: 'outputTokens', headerName: t('COLUMNS.output'), width: 100, type: 'number', valueFormatter: (value) => fmt.number(value) },
    { field: 'costUsd', headerName: t('COLUMNS.cost'), width: 110, type: 'number', valueFormatter: (value) => fmt.usd(value) },
    { field: 'durationMs', headerName: t('COLUMNS.duration'), width: 110, valueFormatter: (value) => fmt.duration(value) },
    { field: 'outcome', headerName: t('COLUMNS.outcome'), width: 130,
      renderCell: ({ value }) => <StatusChip kind="outcome" value={value} label={label('outcome', value)} /> },
    { field: 'toolCallCount', headerName: t('COLUMNS.tools'), width: 90, type: 'number' },
  ], [t, label, fmt, scopeParams, setOpen]);


  return (
    <SectionCard title={t('CALLS.title')} actions={(
      <TextField select size="small" label={t('CALLS.kind')} value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 190 }}>
        <MenuItem value="">{t('CALLS.all')}</MenuItem>
        {CALL_KINDS.map((k) => <MenuItem key={k} value={k}>{label('callKind', k)}</MenuItem>)}
      </TextField>
    )}>
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!error && !isLoading && calls.length === 0 && <Typography color="text.secondary">{t('CALLS.empty')}</Typography>}
      {!error && (isLoading || calls.length > 0) && (
        <>
          <DataTable rows={calls} columns={columns} loading={isLoading} label={t('CALLS.title')} pageSize={25} persist="calls"
                     mobileHidden={['purpose', 'model', 'inputTokens', 'outputTokens', 'durationMs', 'toolCallCount']}
                     onRowClick={({ row }) => setOpen(row.id)} className="shadow-none" />
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Typography variant="body2" color="text.secondary">{t('CALLS.loaded', { shown: fmt.number(calls.length), total: fmt.number(total) })}</Typography>
            {hasNextPage && <Button size="small" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>{t('CALLS.loadMore')}</Button>}
          </div>
        </>
      )}
      <CallDialog callId={open} onClose={closeCall} />
    </SectionCard>
  );
}







// -----------------------------------------------------------
// Usage (default export)
// -----------------------------------------------------------
//
// Owns the filters (read from and written to the address),
// the directory an admin's scope picks from and is checked
// against, and the summary query; the call log has its own.
//
// Used by:
//   - router.jsx — route /usage
// -----------------------------------------------------------

export default function Usage({ authData }) {

  const t = useTranslations('PAGES.usage');
  const label = useEnumLabel();
  const fmt = useFormat();
  const isAdmin = authData.role === 'admin';
  const [params, setView] = useViewParams();


  const directory = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/api/users')).data.users,
    enabled: isAdmin,
  });


  // "mine" and 30 days are the defaults (no parameter); one
  // user's scope holds once the directory is known to have
  // them (while it loads, the address is believed)
  const days = PERIODS.find((period) => String(period) === params.get('days')) ?? 30;
  const whoParam = isAdmin ? params.get('who') : null;
  const person = idParam(whoParam);
  const listed = !Array.isArray(directory.data) || keyedRows(directory.data).some((user) => user.id === person);
  const who = whoParam === 'all' ? 'all' : (person && listed ? person : 'mine');
  const filters = { days, who };
  const setFilters = (next) => setView({
    days: next.days === 30 ? null : next.days,
    who: next.who === 'mine' ? null : next.who,
    'calls.page': null,
  });


  // mine → no params; all → scope=all; a user id → userId=
  const scopeParams = filters.who === 'all' ? 'scope=all' : filters.who !== 'mine' ? `userId=${filters.who}` : '';
  const { data, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['usage', filters.days, scopeParams],
    queryFn: async () => (await api.get(`/api/usage?days=${filters.days}${scopeParams ? `&${scopeParams}` : ''}`)).data,
    placeholderData: (previous) => previous,
  });


  const budget = data?.budget;
  const money = budget?.unit === 'USD';
  const formatBudget = (value) => (money ? fmt.usd(value) : fmt.tokens(value));
  // Keyed by position: a day's date is data, and a malformed
  // series may repeat or lack one
  const chartDays = (Array.isArray(data?.days) ? data.days : []).filter((day) => day && typeof day === 'object')
    .map((day, index) => ({ key: String(index), label: fmt.shortDate(day.date), day }));


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}>
      <Filters filters={filters} setFilters={setFilters} isAdmin={isAdmin} directory={directory} />
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {isLoading && <CircularProgress aria-label={t('TITLE')} />}
      {data && (
        <div className={`flex flex-col gap-4 ${isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isPlaceholderData}>
          {budget && filters.who !== 'all' && (
            <SectionCard title={t('budgetTitle')} subtitle={t('budgetHint')}>
              <Meter label={t('budgetMeter')} value={budget.used ?? 0} limit={budget.limit || null} format={formatBudget} />
            </SectionCard>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label={t('KPI.cost')} value={fmt.usd(data.totals?.costUsd ?? 0)} sub={t('days', { days: filters.days })} />
            <StatTile label={t('KPI.calls')} value={fmt.number(data.totals?.calls ?? 0)} />
            <StatTile label={t('KPI.input')} value={fmt.tokens(data.totals?.inputTokens ?? 0)} />
            <StatTile label={t('KPI.output')} value={fmt.tokens(data.totals?.outputTokens ?? 0)} />
          </div>
          {(data.totals?.calls ?? 0) === 0 ? <EmptyState icon={QueryStatsOutlinedIcon} title={t('empty')} /> : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <SectionCard title={t('CHARTS.cost')}>
                  <ColumnChart label={t('CHARTS.cost')} stateKey="usage.costChart" series={[{ label: t('KPI.cost'), color: SERIES[0] }]} format={(v) => fmt.usd(v)}
                               data={chartDays.map(({ key, label: dayLabel, day }) => ({ key, label: dayLabel, values: [day.costUsd] }))} />
                </SectionCard>
                <SectionCard title={t('CHARTS.tokens')}>
                  <ColumnChart label={t('CHARTS.tokens')} stateKey="usage.tokensChart" format={(v) => fmt.tokens(v)}
                               series={[{ label: t('CHARTS.input'), color: SERIES[0] }, { label: t('CHARTS.output'), color: SERIES[1] }]}
                               data={chartDays.map(({ key, label: dayLabel, day }) => ({ key, label: dayLabel, values: [day.inputTokens, day.outputTokens] }))} />
                </SectionCard>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <SplitTable title={t('SPLITS.byKind')} rows={data.byKind} keyHeader={t('COLUMNS.kind')} render={(row) => label('callKind', row.kind)} />
                <SplitTable title={t('SPLITS.byModel')} rows={data.byModel} keyHeader={t('COLUMNS.model')} render={(row) => row.model} />
              </div>
              {data.byUser && <SplitTable title={t('SPLITS.byUser')} rows={data.byUser} keyHeader={t('COLUMNS.user')} render={(row) => row.name || row.email || '—'} />}
            </>
          )}
          <CallLog scopeParams={scopeParams} />
        </div>
      )}
    </PageLayout>
  );
}
