// -----------------------------------------------------------
//  [*] McpServers — external MCP tool servers (admin)
//
//    GET    /api/mcp/servers            → {servers}
//    PATCH  /api/mcp/servers/{id}       {enabled}
//    DELETE /api/mcp/servers/{id}
//    POST   /api/mcp/servers/{id}/test  → server + ok (≤ ~45 s)
//
//  One card per server: name, description, address,
//  transport, on/off, the header NAMES (values are secrets
//  and never come back), the allowed tools and the tools the
//  last test discovered, when it was checked and its last
//  error. "Test" connects and lists the tools — slow, so the
//  button says how long it may take. A server saved before
//  the address rule can be neither switched on nor tested:
//  the card says its address is no longer allowed and to
//  edit it first, naming the part that is wrong in the
//  dialog's words. A note reminds that the server's host
//  must be on the egress allowlist; it is a static note
//  (role="status"), not an alert — screen readers announce
//  an alert as urgent. A spinner holds the place of
//  the cards while the list loads, and an answer that is not
//  a list of servers with ids of their own fails like any
//  other bad answer (the error state with its retry).
//
//  A server's tool list the user opened stays open when they
//  come back (sessionStorage).
//
//  Split into (root component last):
//
//    rowsOf      — the answer's list, checked
//    isIdList    — a stored list of server ids
//    ServerCard  — one server with its actions
//    McpServers  — the page (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { refusedFields, useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import PageLayout from '@/components/layout/PageLayout';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import McpServerDialog, { urlProblem } from '@/pages/Mcp/McpServerDialog';







// -----------------------------------------------------------
// rowsOf
// -----------------------------------------------------------
//
//   rowsOf(answer, 'servers') → answer.servers
//
// The list an answer carries under `key`, checked before it
// is drawn: every card is keyed — and tested, edited and
// deleted — by its id, so a list whose rows lack an id or
// share one is a broken answer. It fails the query (the
// error state and its retry) instead of mixing up the cards
// or passing for an empty list.
//
// Used by:
//   - McpServers (below) — the servers query
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
// isIdList
// -----------------------------------------------------------
//
// A stored list of the servers whose tool list is open: ids
// as strings or numbers.
//
// Used by:
//   - McpServers (below) — useSessionState's check
// -----------------------------------------------------------

function isIdList(value) {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' || typeof id === 'number');
}







// -----------------------------------------------------------
// ServerCard
// -----------------------------------------------------------
//
// The server's facts, the enable switch and the test / edit
// / delete actions; the test result toasts and refreshes.
// The tool list is open when `toolsOpen`, and says so to
// `onTools` when the user toggles it.
// The chips and the tool list are keyed by position: a
// server's listing may name a tool twice, and those lists
// hold no state a key would have to carry.
//
// A server saved before the address rule (mcp_views
// url_problem) can be neither switched on nor tested with
// that address: Django refuses both (400 INVALID_FIELD on
// "url"). The card says so in one sentence — the address is
// no longer allowed, edit it first — with the part that is
// wrong under it in the dialog's own words (the rule itself
// when only the server sees the fault, an IDN host), never
// as a generic invalid field.
//
// Used by:
//   - McpServers (below)
// -----------------------------------------------------------

function ServerCard({ server, onEdit, onDelete, toolsOpen, onTools }) {

  const t = useTranslations('PAGES.mcp');
  const label = useEnumLabel();
  const fmt = useFormat();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();


  // True (and said) when the failure is the server refusing
  // the saved address; any other failure is the caller's to
  // word
  const refuseAddress = (error) => {
    if (!refusedFields(error, {}, { url: ['url'] }).includes('url')) return false;
    const problem = typeof server.url === 'string' ? urlProblem(server.url) : null;
    toast.error((
      <span>
        <span className="block font-medium">{t('addressRefused', { name: server.name })}</span>
        <span className="block">{t(`FORM.${problem ?? 'urlHint'}`)}</span>
      </span>
    ), { id: `mcp-address-${server.id}`, duration: 10_000 });
    return true;
  };


  const test = useMutation({
    mutationFn: async () => (await api.post(`/api/mcp/servers/${server.id}/test`, null, { silent: true, timeout: 90_000 })).data,
    onSuccess: (result) => {
      if (result.ok) toast.success(t('testOk', { count: result.tools?.length ?? 0 }));
      else toast.error(t('testFailed'));
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
    onError: (error) => {
      if (!refuseAddress(error)) toast.error(`${t('testFailed')}: ${describe(error)}`);
    },
  });
  // Silent: a refused address gets its own sentence, anything
  // else the toast the api client would have shown
  const toggle = useMutation({
    mutationFn: () => api.patch(`/api/mcp/servers/${server.id}`, { enabled: !server.enabled }, { silent: true }),
    onSuccess: () => { toast.success(server.enabled ? t('TOASTS.disabled') : t('TOASTS.enabled')); queryClient.invalidateQueries({ queryKey: ['mcpServers'] }); },
    onError: (error) => {
      if (refuseAddress(error)) return;
      const text = describe(error);
      toast.error(text, { id: text });
    },
  });


  return (
    <Paper component="li" className="p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <Typography variant="subtitle1" component="h2" className="font-mono font-semibold">{server.name}</Typography>
          {server.description && <Typography variant="body2" color="text.secondary">{server.description}</Typography>}
          <Typography variant="body2" className="[overflow-wrap:anywhere]">{server.url} · {label('mcpTransport', server.transport)}</Typography>
        </div>
        <FormControlLabel control={<Switch checked={server.enabled} onChange={() => toggle.mutate()} disabled={toggle.isPending} />}
                          label={server.enabled ? t('enabled') : t('disabled')} />
      </div>
      <div className="text-sm flex flex-col gap-1">
        <div>
          <span className="text-muted">{t('headers')}: </span>
          {server.headerNames?.length ? server.headerNames.map((name, index) => <Chip key={index} size="small" label={`${name}: ••••`} title={t('headerValueHidden')} className="mr-1" />) : t('noHeaders')}
        </div>
        <div>
          <span className="text-muted">{t('allowedTools')}: </span>
          {server.allowedTools?.length ? server.allowedTools.map((name, index) => <Chip key={index} size="small" variant="outlined" label={name} className="mr-1" />) : t('allTools')}
        </div>
        <div className="text-muted">{server.lastCheckedAt ? t('lastChecked', { date: fmt.dateTime(server.lastCheckedAt) }) : t('neverChecked')}</div>
      </div>
      {server.lastError && <Alert severity="error"><span className="whitespace-pre-wrap">{server.lastError}</span></Alert>}
      <Accordion disableGutters variant="outlined" expanded={toolsOpen} onChange={(_, expanded) => onTools(expanded)}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">{t('tools', { count: server.tools?.length ?? 0 })}</Typography></AccordionSummary>
        <AccordionDetails>
          {server.tools?.length ? (
            <ul className="m-0 pl-5 text-sm">
              {server.tools.map((tool, index) => <li key={index}><code>{tool.name}</code>{tool.description ? ` — ${tool.description}` : ''}</li>)}
            </ul>
          ) : <Typography variant="body2" color="text.secondary">{t('noTools')}</Typography>}
        </AccordionDetails>
      </Accordion>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outlined" onClick={() => test.mutate()} loading={test.isPending} loadingPosition="start" startIcon={<HubOutlinedIcon />}>
          {test.isPending ? t('testing') : t('test')}
        </Button>
        <Button onClick={() => onEdit(server)}>{t('edit')}</Button>
        <Button color="delete" onClick={() => onDelete(server)}>{t('delete')}</Button>
      </div>
    </Paper>
  );
}







// -----------------------------------------------------------
// McpServers (default export)
// -----------------------------------------------------------
//
// The list query, the add / edit dialog, the delete
// confirmation and which servers' tool lists are open (kept
// for the tab).
//
// Used by:
//   - router.jsx — route /settings/mcp (adminOnly)
// -----------------------------------------------------------

export default function McpServers({ authData }) {

  const t = useTranslations('PAGES.mcp');
  const tCommon = useTranslations('COMPONENTS.common');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [openTools, setOpenTools] = useSessionState('mcp.openTools', [], isIdList);
  const toggleTools = (id) => (open) => setOpenTools((current) => (open ? [...current.filter((item) => item !== id), id] : current.filter((item) => item !== id)));


  const { data: servers = [], isLoading, error, refetch } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: async () => rowsOf((await api.get('/api/mcp/servers')).data, 'servers'),
  });


  const remove = useMutation({
    mutationFn: () => api.delete(`/api/mcp/servers/${deleting.server.id}`, { silent: true }),
    onSuccess: () => {
      toast.success(t('TOASTS.deleted'));
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      setDeleting((current) => ({ ...current, open: false }));
    },
  });


  const addButton = <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ server: null, open: true })}>{t('add')}</Button>;


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')} actions={addButton}>
      <Alert severity="info" role="status" className="mb-4">{t('egress')}</Alert>
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {isLoading && <div className="flex justify-center py-8" role="status" aria-label={tCommon('loading')}><CircularProgress size={24} /></div>}
      {!error && !isLoading && servers.length === 0 && <EmptyState icon={HubOutlinedIcon} title={t('empty')} text={t('emptyText')} />}
      {servers.length > 0 && (
        <ul className="m-0 p-0 list-none grid grid-cols-1 xl:grid-cols-2 gap-4">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} onEdit={(s) => setEditing({ server: s, open: true })}
                        onDelete={(s) => { remove.reset(); setDeleting({ server: s, open: true }); }}
                        toolsOpen={openTools.includes(server.id)} onTools={toggleTools(server.id)} />
          ))}
        </ul>
      )}
      <McpServerDialog open={Boolean(editing?.open)} server={editing?.server ?? null} onClose={() => setEditing((current) => ({ ...current, open: false }))} />
      <UniversalModal open={Boolean(deleting?.open)} onClose={() => setDeleting((current) => ({ ...current, open: false }))} onConfirm={() => remove.mutate()}
                      onExited={() => setDeleting(null)} danger busy={remove.isPending} error={remove.error ? describe(remove.error) : null}
                      title={t('deleteTitle', { name: deleting?.server?.name })} confirmLabel={t('delete')}>
        <Typography>{t('deleteText')}</Typography>
      </UniversalModal>
    </PageLayout>
  );
}
