// -----------------------------------------------------------
//  [*] McpServerDialog — add or edit an MCP server (admin)
//
//    POST  /api/mcp/servers        {name, url, transport,
//                                   headers, allowedTools,
//                                   description, enabled}
//    PATCH /api/mcp/servers/{id}   the changed fields only
//
//  Header VALUES are credentials: the backend never returns
//  them, so in edit mode an existing header shows its name
//  with an empty value meaning "unchanged"; typing a value
//  replaces it, removing the row sends null (delete). The
//  name follows the backend's slug rule and must be unique
//  (409 DUPLICATE_NAME shows on the field until the name
//  changes; a refusal naming another field goes when that
//  one changes). A new server is created disabled until it
//  passes a test. An edit that changes nothing closes
//  without a request.
//
//  The address follows the backend's url_problem: https on
//  the standard port to a public DNS name — no IP address in
//  any spelling, no container or local name, no user:password
//  — because the assistant that connects to it sits next to
//  every internal service. The form says which part is wrong
//  before any request; the server's own refusal of it is the
//  backstop and shows on the field too. A row saved before
//  the rule can still be edited and switched off: its address
//  is judged only when it changes or the server stays on.
//
//  Split into (root component last):
//
//    NAME_RE         — the backend's name rule
//    HEADER_RE       — the backend's header-name rule
//    MAX_HEADERS     — the backend's header cap
//    MAX_URL         — the backend's address length cap
//    PUBLIC_HOST     — a public DNS name, as the backend reads it
//    LOCAL_SUFFIXES  — the local names it refuses
//    IPV4            — an IPv4 address, as the URL parser spells it
//    REFUSAL_FIELDS  — the fields a refusal is about
//    WIRE_FIELDS     — the same, by the prose's wire name
//    urlProblem      — the address against the backend's rule
//                      (named export)
//    toForm          — server → form state
//    fieldsOf        — form → the plain fields of a body
//    bodyOf          — form → the POST / PATCH body
//    HeadersEditor   — the name / value rows
//    McpServerDialog — the dialog (default export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the server cards judge a saved address by the dialog's rule */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { errorInfo, refusedFields, useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import IconAction from '@/components/IconAction/IconAction';
import UniversalModal from '@/components/UniversalModal/UniversalModal';


// NAME of django assistant/api/mcp_views.py
const NAME_RE = /^[a-z][a-z0-9_]{1,30}$/;

// HEADER_NAME of the same file
const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/;

// MAX_HEADERS of the same file
const MAX_HEADERS = 10;

// url_problem's cap on the address's length
const MAX_URL = 500;

// PUBLIC_HOST of the same file: a dotted DNS name whose last
// label starts with a letter — no IP literal, no single-label
// container name ("legalops-django")
const PUBLIC_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

// PRIVATE_SUFFIXES of the same file — names only a local
// network resolves
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home.arpa'];

// The browser's URL parser writes every spelling of an IPv4
// address (0x7f.1, 2130706433, 127.1) as dotted decimal
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// The form fields a refusal is about — its message goes as
// soon as one of them changes
const REFUSAL_FIELDS = { DUPLICATE_NAME: ['name'] };

// The wire names _apply's INVALID_FIELD prose opens with
// ("header 'X' is not valid" too) → the form fields
const WIRE_FIELDS = {
  name: ['name'], description: ['description'], url: ['url'], transport: ['transport'],
  headers: ['headers', 'removed'], header: ['headers', 'removed'], allowedTools: ['allowedTools'], enabled: ['enabled'],
};







// -----------------------------------------------------------
// urlProblem
// -----------------------------------------------------------
//
//   urlProblem('https://mcp.example.eu/mcp')      → null
//   urlProblem('http://legalops-django:8000/')  → 'urlNotHttps'
//   urlProblem('https://127.0.0.1/mcp')           → 'urlAddress'
//
// url_problem of django assistant/api/mcp_views.py, in its
// order, as the FORM message key of the part that is wrong
// (null when none is): an https:// address — checked on the
// text itself, since the browser's parser would also take
// "https:host" or backslashes and the server's does not —
// without spaces or control characters, of at most MAX_URL
// characters, on the standard port, without user:password
// (the address is shown to every admin — secrets go in a
// header), naming a public DNS name: not an IP address in
// any spelling (the parser writes each one out as dotted
// decimal or [v6]), not a single-label or local name. What
// the parser reads differently (an IDN host, a %-escape) is
// left to the server's own refusal.
//
// Used by:
//   - McpServerDialog (below)
//   - McpServers.jsx — ServerCard, the part of a saved address
//     the server refused
// -----------------------------------------------------------

export function urlProblem(value) {
  const text = value.trim();
  if (!text || /\s/.test(text) || [...text].some((char) => char.charCodeAt(0) < 32)) return 'urlInvalid';
  if (text.length > MAX_URL) return 'urlTooLong';
  if (!/^https:\/\//i.test(text)) return 'urlNotHttps';
  let url;
  try {
    url = new URL(text);
  } catch {
    return 'urlInvalid';
  }
  if (url.port !== '') return 'urlPort';
  if (url.username || url.password) return 'urlCredentials';
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || IPV4.test(host)) return 'urlAddress';
  if (!PUBLIC_HOST.test(host) || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'urlInternal';
  return null;
}







// -----------------------------------------------------------
// toForm
// -----------------------------------------------------------
//
// A server (or none) → the form; existing headers become
// rows with an empty value ("unchanged") and existing: true.
//
// Used by:
//   - bodyOf (below) — the server as loaded, to compare
//   - McpServerDialog (below)
// -----------------------------------------------------------

function toForm(server) {
  return {
    name: server?.name ?? '',
    description: server?.description ?? '',
    url: server?.url ?? '',
    transport: server?.transport ?? 'http',
    headers: (server?.headerNames ?? []).map((name) => ({ name, value: '', existing: true })),
    removed: [],
    allowedTools: server?.allowedTools ?? [],
    enabled: server?.enabled ?? false,
  };
}







// -----------------------------------------------------------
// fieldsOf
// -----------------------------------------------------------
//
// The form's plain fields as the body carries them (the
// texts trimmed) — for the form being saved and, through
// toForm, for the server as it was loaded, so the two
// compare like for like.
//
// Used by:
//   - bodyOf (below)
// -----------------------------------------------------------

function fieldsOf(form) {
  return {
    name: form.name, description: form.description.trim(), url: form.url.trim(), transport: form.transport,
    allowedTools: form.allowedTools, enabled: form.enabled,
  };
}







// -----------------------------------------------------------
// bodyOf
// -----------------------------------------------------------
//
// The request body. A new server (`server` null) sends every
// field; an edit sends only what differs from the server as
// loaded — an unchanged field sent back would be listed as
// changed in the audit trail and would undo what another
// admin saved meanwhile. Headers travel only when a value
// was typed (new or replacing) or a row was removed (null);
// the removals go first, so a header removed and added again
// under the same name ends up with its new value instead of
// being deleted.
//
// Used by:
//   - McpServerDialog (below) — submit
// -----------------------------------------------------------

function bodyOf(form, server) {
  const fields = fieldsOf(form);
  const base = server ? fieldsOf(toForm(server)) : null;
  const changed = base
    ? Object.fromEntries(Object.entries(fields).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])))
    : fields;
  const headers = Object.fromEntries([
    ...form.removed.map((name) => [name, null]),
    ...form.headers.filter((h) => h.value).map((h) => [h.name.trim(), h.value]),
  ]);
  return { ...changed, ...(Object.keys(headers).length ? { headers } : {}) };
}







// -----------------------------------------------------------
// HeadersEditor
// -----------------------------------------------------------
//
// Name / secret value rows; an existing header's name is
// fixed and its empty value means "keep". The rows' error
// (after a refused save) is an alert: it belongs to no one
// field, so no helper text would carry it to a screen reader.
//
// Used by:
//   - McpServerDialog (below)
// -----------------------------------------------------------

function HeadersEditor({ form, setForm, error }) {

  const t = useTranslations('PAGES.mcp.FORM');
  const patch = (index, change) => setForm({ ...form, headers: form.headers.map((h, i) => (i === index ? { ...h, ...change } : h)) });
  const remove = (index) => {
    const header = form.headers[index];
    setForm({
      ...form,
      headers: form.headers.filter((_, i) => i !== index),
      removed: header.existing ? [...form.removed, header.name] : form.removed,
    });
  };


  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Typography variant="body2" color="text.secondary">{t('headers')}</Typography>
      {form.headers.map((header, index) => (
        <div key={index} className="flex gap-2 items-start">
          <TextField size="small" label={t('headerName')} value={header.name} disabled={header.existing} className="w-48"
                     onChange={(e) => patch(index, { name: e.target.value })} />
          <TextField size="small" type="password" label={t('headerValue')} value={header.value} className="flex-1" autoComplete="new-password"
                     placeholder={header.existing ? t('headerKeep') : ''} onChange={(e) => patch(index, { value: e.target.value })}
                     slotProps={{ inputLabel: { shrink: true } }} />
          <IconAction label={t('removeHeader')} icon={<RemoveCircleOutlineIcon fontSize="small" />} onClick={() => remove(index)} />
        </div>
      ))}
      {error && <Typography variant="caption" color="error" role="alert">{error}</Typography>}
      <div>
        <Button size="small" startIcon={<AddIcon />} disabled={form.headers.length >= MAX_HEADERS}
                onClick={() => setForm({ ...form, headers: [...form.headers, { name: '', value: '', existing: false }] })}>
          {t('addHeader')}
        </Button>
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// McpServerDialog (default export)
// -----------------------------------------------------------
//
//   <McpServerDialog open server={null|server} onClose />
//
// Used by:
//   - McpServers.jsx — add / edit
// -----------------------------------------------------------

export default function McpServerDialog({ open, server, onClose }) {

  const t = useTranslations('PAGES.mcp');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const editing = Boolean(server);
  const [form, setForm] = useState(() => toForm(server));
  const [loadedFor, setLoadedFor] = useState(server?.id ?? null);
  const [tried, setTried] = useState(false);


  // Opening another server (or "add") reloads the form
  if ((server?.id ?? null) !== loadedFor) {
    setLoadedFor(server?.id ?? null);
    setForm(toForm(server));
    setTried(false);
  }


  const errors = {};
  if (!NAME_RE.test(form.name)) errors.name = t('FORM.nameInvalid');
  // Judged when the address is sent (a new server, a changed
  // one) or the server stays on — as the backend does, so a
  // row saved before the rule can still be edited and
  // switched off
  const urlKey = !editing || form.url.trim() !== server.url || form.enabled ? urlProblem(form.url) : null;
  if (urlKey) errors.url = t(`FORM.${urlKey}`);
  if (form.headers.some((h) => !h.existing && !HEADER_RE.test(h.name))) errors.headers = t('FORM.headerInvalid');
  // A new header row without its value would be dropped on save
  else if (form.headers.some((h) => !h.existing && !h.value)) errors.headers = t('FORM.headerValueMissing');
  const shown = tried ? { ...errors } : {};


  // The tools the last test found, each offered once (a
  // server's listing may name a tool twice)
  const toolOptions = [...new Set((server?.tools ?? []).map((tool) => tool.name))];


  const save = useMutation({
    mutationFn: (body) => (editing
      ? api.patch(`/api/mcp/servers/${server.id}`, body, { silent: true })
      : api.post('/api/mcp/servers', body, { silent: true })),
    onSuccess: () => {
      toast.success(editing ? t('TOASTS.saved') : t('TOASTS.added'));
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      onClose();
    },
  });
  if (save.error && errorInfo(save.error).code === 'DUPLICATE_NAME') shown.name = describe(save.error);


  // A refusal about a field (DUPLICATE_NAME on the name) goes
  // as soon as the edit changes that field; the others wait
  // for the next save
  const refused = refusedFields(save.error, REFUSAL_FIELDS, WIRE_FIELDS);
  const edit = (next) => {
    if (refused.some((key) => next[key] !== form[key])) save.reset();
    setForm(next);
  };


  // The server's refusal of the address — the backstop of the
  // check above (an IDN host, a rule changed on the server) —
  // is shown on the field, like a duplicate name on its own
  const urlRefused = refused.includes('url');
  if (urlRefused) shown.url = describe(save.error, { fields: { url: t('FORM.url') } });


  // An edit that changed nothing has nothing to send (the
  // backend would audit an update with no fields)
  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    const body = bodyOf(form, server);
    if (editing && Object.keys(body).length === 0) {
      onClose();
      return;
    }
    save.mutate(body);
  };


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={submit} busy={save.isPending} maxWidth="md"
                    error={save.error && errorInfo(save.error).code !== 'DUPLICATE_NAME' && !urlRefused ? describe(save.error) : null}
                    title={editing ? t('FORM.editTitle') : t('FORM.addTitle')} confirmLabel={t('FORM.save')}
                    onExited={() => { save.reset(); setLoadedFor(undefined); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <TextField label={t('FORM.name')} value={form.name} onChange={(e) => edit({ ...form, name: e.target.value.trim() })} required autoFocus
                   error={Boolean(shown.name)} helperText={shown.name || t('FORM.nameHint')} slotProps={{ htmlInput: { className: 'font-mono' } }} />
        <TextField select label={t('FORM.transport')} value={form.transport} onChange={(e) => edit({ ...form, transport: e.target.value })}>
          {['http', 'sse'].map((kind) => <MenuItem key={kind} value={kind}>{label('mcpTransport', kind)}</MenuItem>)}
        </TextField>
        <TextField label={t('FORM.url')} value={form.url} onChange={(e) => edit({ ...form, url: e.target.value })} required className="sm:col-span-2"
                   error={Boolean(shown.url)} helperText={shown.url || t('FORM.urlHint')} inputMode="url" />
        <TextField label={t('FORM.description')} value={form.description} onChange={(e) => edit({ ...form, description: e.target.value })}
                   multiline minRows={2} className="sm:col-span-2" />
        <HeadersEditor form={form} setForm={edit} error={shown.headers} />
        <Autocomplete
          multiple freeSolo autoSelect className="sm:col-span-2" options={toolOptions}
          value={form.allowedTools} onChange={(_, tools) => edit({ ...form, allowedTools: tools.map((name) => String(name).trim()).filter(Boolean) })}
          renderValue={(tools, getItemProps) => tools.map((tool, index) => {
            const { key, ...props } = getItemProps({ index });
            return <Chip key={key} size="small" label={tool} {...props} />;
          })}
          renderInput={(params) => <TextField {...params} label={t('FORM.allowedTools')} helperText={t('FORM.allowedHint')} />}
        />
        <div className="sm:col-span-2">
          {/* A new server starts disabled: test it, then enable it
              (the switch appears once it exists) */}
          {editing
            ? <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => edit({ ...form, enabled: e.target.checked })} />} label={t('FORM.enabled')} />
            : <Typography variant="caption" color="text.secondary" className="block">{t('FORM.newDisabled')}</Typography>}
        </div>
      </div>
    </UniversalModal>
  );
}
