// -----------------------------------------------------------
//  [*] Chat — the company panel
//
//  What the conversation knows about its company, at a
//  glance: on top the link itself — which of the user's
//  companies and which of its role profiles the conversation
//  uses, changed right there (ThreadLink.jsx) — then the
//  profile (type, form, size, NACE, the tri-state AI /
//  personal-data facts), credentials (claimed vs verified),
//  documents (with their extraction state), the role
//  profiles (the conversation's role marked) and a link to
//  the full company page (/companies/:id).
//
//  The thread row says which company is linked (the chat
//  header reads the same row, through the same linkedNames,
//  for its company and role label); the row and the company
//  are refreshed when a turn ends — the assistant may just
//  have created, linked or edited it — and the company
//  pages' caches are refreshed with them; a link changed in
//  the panel writes Django's answer into the row at once. A
//  failed load is the app's ErrorState: what failed, why,
//  and a retry.
//
//  Split into (root component last):
//
//    useThreadRow  — the open thread's row (named export)
//    linkedNames   — the row's company and role names
//                    (named export)
//    listOf        — a related list, or []
//    Section       — a titled block with an empty line
//    ProfileFacts  — the profile's facts as a definition list
//    RunRefresh    — refetch when a turn ends (named export)
//    CompanyPanel  — the panel (default export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the panel shares its thread query, and its reading of the
   row, with the chat header */

import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuiState } from '@assistant-ui/react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';
import useEnumLabel from '@/hooks/useEnumLabel';
import ThreadLink from '@/pages/Chat/ThreadLink';







// -----------------------------------------------------------
// useThreadRow
// -----------------------------------------------------------
//
//   const thread = useThreadRow();   — a TanStack query
//   thread.data?.companyName
//
// GET /api/chat/threads/{id} for the open conversation
// (disabled while it has no remote id — a new chat); one
// cache entry per thread, refreshed by RunRefresh and
// replaced by ThreadLink's and ModelPicker's PATCH answers.
//
// Used by:
//   - CompanyPanel, RunRefresh (below)
//   - Chat.jsx — ChatHeader's company label
//   - ModelPicker.jsx — the conversation's model
// -----------------------------------------------------------

export function useThreadRow() {
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  return useQuery({
    queryKey: ['chat', 'thread', remoteId],
    queryFn: async () => (await api.get(`/api/chat/threads/${encodeURIComponent(remoteId)}`)).data,
    enabled: Boolean(remoteId),
  });
}







// -----------------------------------------------------------
// linkedNames
// -----------------------------------------------------------
//
//   linkedNames(thread.data) → { company: 'UAB …', role: 'Atitikties pareigūnas' }
//                              — either null when not linked
//
// The names a thread row links the conversation to: its
// company's, and its role's — only with a company, which a
// role belongs to. Anything but a non-empty string (a row
// not loaded, a malformed answer) is no name, so the header
// and the panel never print a placeholder or an object.
//
// Used by:
//   - CompanyPanel (below) — the role caption
//   - Chat.jsx — ChatHeader's company button
// -----------------------------------------------------------

export function linkedNames(row) {
  const company = typeof row?.companyName === 'string' && row.companyName ? row.companyName : null;
  const role = company && typeof row?.role?.name === 'string' && row.role.name ? row.role.name : null;
  return { company, role };
}







// -----------------------------------------------------------
// listOf
// -----------------------------------------------------------
//
//   listOf(company.credentials) → its rows, [] for anything
//                                 that is not a list of them
//
// The company's related lists as the panel renders them — a
// malformed answer lists nothing rather than breaking; each
// row is keyed by id AND position (ids need not be unique in
// an answer the panel did not make).
//
// Used by:
//   - CompanyPanel (below)
// -----------------------------------------------------------

function listOf(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}







// -----------------------------------------------------------
// Section
// -----------------------------------------------------------
//
// A small titled block; `empty` is shown instead of the
// children when there is nothing to list.
//
// Used by:
//   - CompanyPanel (below)
// -----------------------------------------------------------

function Section({ title, empty, isEmpty, children }) {
  return (
    <section className="px-4 py-3 border-b border-edge">
      <Typography variant="overline" component="h3" className="text-muted block leading-6">{title}</Typography>
      {isEmpty ? <Typography variant="body2" color="text.secondary">{empty}</Typography> : children}
    </section>
  );
}







// -----------------------------------------------------------
// ProfileFacts
// -----------------------------------------------------------
//
// The typed profile as label/value rows; tri-state facts read
// "Taip / Ne / Nežinoma" — an unknown is never shown as "no".
//
// Used by:
//   - CompanyPanel (below)
// -----------------------------------------------------------

function ProfileFacts({ company }) {
  const t = useTranslations('PAGES.chat.PANEL');
  const label = useEnumLabel();
  const rows = [
    [t('institutionType'), label('institutionType', company.institutionType)],
    [t('legalForm'), company.legalForm || '—'],
    [t('country'), company.country || '—'],
    [t('size'), `${label('sizeCategory', company.sizeCategory)}${company.employees != null ? ` · ${t('employees', { count: company.employees })}` : ''}`],
    [t('nace'), Array.isArray(company.naceCodes) && company.naceCodes.length ? company.naceCodes.join(', ') : '—'],
    [t('usesAi'), label('boolean', String(company.usesAi ?? null))],
    [t('providesAi'), label('boolean', String(company.providesAi ?? null))],
    [t('personalData'), label('boolean', String(company.processesPersonalData ?? null))],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm m-0">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-muted">{name}</dt>
          <dd className="m-0 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}







// -----------------------------------------------------------
// RunRefresh
// -----------------------------------------------------------
//
// When a turn ends (isRunning true → false), the thread row
// and the company are refetched, and the company pages'
// caches are marked stale. Mounted once for the whole page —
// the header's label follows the row with the panel closed.
//
// Used by:
//   - Chat.jsx — inside the runtime provider
// -----------------------------------------------------------

export function RunRefresh() {

  const queryClient = useQueryClient();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const companyId = useThreadRow().data?.companyId ?? null;
  const running = useAuiState((s) => s.thread.isRunning);
  const wasRunning = useRef(running);


  useEffect(() => {
    if (wasRunning.current && !running) {
      queryClient.invalidateQueries({ queryKey: ['chat', 'thread', remoteId] });
      if (companyId) queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['chatThreads'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }
    wasRunning.current = running;
  }, [running, remoteId, companyId, queryClient]);


  return null;
}







// -----------------------------------------------------------
// CompanyPanel (default export)
// -----------------------------------------------------------
//
//   <CompanyPanel userId={authData.id} onClose={…} />
//
// The panel content; Chat.jsx places it in a column or a
// drawer. id="chat-company-panel" is what the header button
// controls. The link editor shows once the row says what is
// linked (at once for a new conversation, which has no row)
// — never while the conversation the address names is still
// being opened: until then the open thread is the fresh
// draft, and a pick there would create a conversation of
// its own instead of linking that one. `userId` (the
// signed-in user) is the link editor's: it names the owner
// of every company that is not the user's own.
//
// Used by:
//   - Chat.jsx
// -----------------------------------------------------------

export default function CompanyPanel({ userId, onClose }) {

  const t = useTranslations('PAGES.chat.PANEL');
  const label = useEnumLabel();
  const fmt = useFormat();
  const { threadId: addressed } = useParams();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  // Keys the link editor: a switch starts it clean
  const itemId = useAuiState((s) => s.threadListItem.id);
  const opening = Boolean(addressed) && addressed !== remoteId;


  const thread = useThreadRow();
  const companyId = thread.data?.companyId ?? null;
  const company = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => (await api.get(`/api/companies/${encodeURIComponent(companyId)}`)).data,
    enabled: Boolean(companyId),
  });
  const data = company.data;
  const roleId = thread.data?.roleId ?? null;
  const { role } = linkedNames(thread.data);


  return (
    <aside id="chat-company-panel" aria-label={t('title')}
           className="w-full lg:w-80 shrink-0 h-full flex flex-col bg-surface border-l border-edge overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-edge">
        <BusinessOutlinedIcon fontSize="small" className="text-muted" aria-hidden />
        <Typography variant="subtitle1" component="h2" className="flex-1">{t('title')}</Typography>
        <IconAction label={t('close')} icon={<CloseIcon fontSize="small" />} onClick={onClose} />
      </div>

      <div className="relative flex-1 overflow-y-auto">
        {!opening && !thread.isLoading && !thread.isError && (
          <ThreadLink key={itemId} row={thread.data} company={company.data} userId={userId} />
        )}

        {(thread.isLoading || company.isLoading) && (
          <div className="flex justify-center py-8" role="status" aria-label={t('loading')}><CircularProgress size={24} /></div>
        )}
        {/* A failure says which and why, like every query of the
            app (ErrorState), and can be retried in place */}
        {(thread.isError || company.isError) && (
          <ErrorState error={thread.error ?? company.error} title={t('loadFailed')} className="m-3"
                      onRetry={() => (thread.isError ? thread.refetch() : company.refetch())} />
        )}

        {/* Not linked yet — what to do about it */}
        {!thread.isLoading && !thread.isError && !companyId && (
          <div className="px-4 py-6 text-center">
            <Typography variant="body2">{t('none')}</Typography>
            <Typography variant="caption" color="text.secondary" component="p" className="mt-1">{t('noneHint')}</Typography>
          </div>
        )}

        {data && (
          <>
            <section className="px-4 py-3 border-b border-edge">
              <Typography variant="h6" component="p" className="[overflow-wrap:anywhere] leading-snug">{data.name}</Typography>
              {role && <Typography variant="caption" color="text.secondary">{t('role', { name: role })}</Typography>}
              <div className="mt-2"><ProfileFacts company={data} /></div>
              <Button component={Link} to={`/companies/${data.id}`} size="small" endIcon={<OpenInNewIcon fontSize="inherit" />} className="mt-2">
                {t('openPage')}
              </Button>
            </section>

            <Section title={t('credentials')} empty={t('noCredentials')} isEmpty={!listOf(data.credentials).length}>
              <ul className="list-none p-0 m-0 space-y-2">
                {listOf(data.credentials).map((c, i) => (
                  <li key={`${c.id}:${i}`} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 [overflow-wrap:anywhere]">{c.name}</span>
                      <StatusChip kind="credential" value={c.status} label={label('credentialStatus', c.status)} />
                    </div>
                    <div className="text-xs text-muted">
                      {label('credentialKind', c.kind)}{c.issuer ? ` · ${c.issuer}` : ''}{c.identifier ? ` · ${c.identifier}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t('documents')} empty={t('noDocuments')} isEmpty={!listOf(data.documents).length}>
              <ul className="list-none p-0 m-0 space-y-2">
                {listOf(data.documents).map((d, i) => (
                  <li key={`${d.id}:${i}`} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 [overflow-wrap:anywhere]">{d.title}</span>
                      <StatusChip kind="extraction" value={d.extractionStatus} label={label('extractionStatus', d.extractionStatus)} />
                    </div>
                    <div className="text-xs text-muted">{label('documentKind', d.kind)}{d.charCount ? ` · ${t('chars', { count: fmt.number(d.charCount) })}` : ''}</div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t('roles')} empty={t('noRoles')} isEmpty={!listOf(data.roles).length}>
              <ul className="list-none p-0 m-0 space-y-1">
                {listOf(data.roles).map((r, i) => (
                  <li key={`${r.id}:${i}`} className="text-sm flex items-center gap-2">
                    <span className="flex-1 [overflow-wrap:anywhere]">{r.name}</span>
                    {r.id === roleId && <StatusChip value="active" label={t('activeRole')} />}
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
