// -----------------------------------------------------------
//  [*] CompanyDocuments — the company's evidence documents
//
//    GET    /api/documents?companyId=&limit=500 → {documents, total}
//    POST   /api/documents   multipart {file, companyId, kind}
//    DELETE /api/documents/{id}
//    GET    /api/documents/search?q=&companyId=&k=8 → {hits}
//
//  Upload: drop or pick files, they go up one after another
//  with a progress bar each (axios onUploadProgress); the
//  text is extracted during the upload, the evidence index
//  (chunks + vectors) is built by the worker afterwards —
//  the list polls while a fresh document still waits for it.
//  A file over the backend's 50 MB is refused by the drop
//  zone before any request, the rest of the batch still goes
//  up; a 413 that gets through anyway (the backend's own
//  check, the proxy's) reads as "file too large".
//
//  When a batch is up, its documents are handed to the
//  assistant (useDocumentIntake): it reads them in a
//  conversation of the company and files what they establish
//  — the profile, the documents' kinds, licences, standards,
//  roles — as it does for files dropped into a chat. A notice
//  under the drop zone says so while it reads, links to that
//  conversation, and says how it ended.
//
//  The list shows the text extraction status, the index
//  status and the inventory's one-line summary once an
//  analysis has read the document; its page and sort stay in
//  the address (?documents.page=…). The search box runs the
//  semantic document search on Enter only (every search
//  embeds the query); a hit opens the document at its
//  passage. The last search and its hits are kept for the
//  company in sessionStorage (useSessionState) — coming back
//  to the company finds them without searching (paying)
//  again.
//
//  Split into (root component last):
//
//    FRESH_MS          — how long a document may wait for its index
//    NO_SEARCH         — the kept search before any
//    isKeptSearch      — a stored search the tab can show
//    UploadPanel       — kind select, drop zone, progress rows
//    IntakeNotice      — what the assistant does with the batch
//    DocumentSearch    — the search box and its hits
//    DocumentsTable    — the grid with the row actions
//    CompanyDocuments  — the tab (default export)
// -----------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useLocale, useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import SectionCard from '@/components/SectionCard/SectionCard';
import DataTable from '@/components/DataTable/DataTable';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import FileDrop from '@/components/FileDrop/FileDrop';
import IconAction from '@/components/IconAction/IconAction';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import DocumentDrawer from '@/pages/Companies/DocumentDrawer';
import useDocumentIntake from '@/pages/Companies/useDocumentIntake';
import { describeChatError } from '@/pages/Chat/chatErrors';
import { DOCUMENT_KINDS } from '@/constants/enums';
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES } from '@/constants/uploads';


// A document with text but no index after this long is not
// "indexing" any more — the list stops polling for it
const FRESH_MS = 10 * 60 * 1000;

// The kept search before the first one: no query, no hits
const NO_SEARCH = { q: '', hits: null };







// -----------------------------------------------------------
// isKeptSearch
// -----------------------------------------------------------
//
// A stored {q, hits} the search can show again: a query and
// a list of hit objects (null before any search).
//
// Used by:
//   - DocumentSearch (below) — useSessionState's check
// -----------------------------------------------------------

function isKeptSearch(value) {
  return typeof value?.q === 'string'
    && (value.hits === null || (Array.isArray(value.hits) && value.hits.every((hit) => hit && typeof hit === 'object')));
}







// -----------------------------------------------------------
// UploadPanel
// -----------------------------------------------------------
//
// The kind for the next upload, the drop zone, and one row
// per file of the current batch (progress, then done or the
// translated error). When the batch is through, the rows the
// backend answered go to onBatch — the documents the
// assistant then reads.
//
// Used by:
//   - CompanyDocuments (below)
// -----------------------------------------------------------

function UploadPanel({ companyId, onUploaded, onBatch }) {

  const t = useTranslations('PAGES.company.DOCUMENTS');
  const tCommon = useTranslations('COMPONENTS.common');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const [kind, setKind] = useState('policy');
  const [uploads, setUploads] = useState([]);
  const busy = uploads.some((u) => u.state === 'uploading');


  const patch = (index, change) => setUploads((rows) => rows.map((row, i) => (i === index ? { ...row, ...change } : row)));


  // A new batch replaces the rows of the previous one
  const upload = async (files) => {
    setUploads(files.map((file) => ({ name: file.name, percent: 0, state: 'queued' })));
    const stored = [];
    for (const [index, file] of files.entries()) {
      patch(index, { state: 'uploading' });
      const form = new FormData();
      form.append('file', file);
      form.append('companyId', companyId);
      form.append('kind', kind);
      try {
        const { data } = await api.post('/api/documents', form, {
          silent: true,
          onUploadProgress: (event) => patch(index, { percent: event.total ? Math.round((event.loaded * 100) / event.total) : 0 }),
        });
        stored.push(data);
        patch(index, { state: 'done', percent: 100 });
        toast.success(t('uploadedToast', { name: file.name }));
        onUploaded();
      } catch (error) {
        patch(index, { state: 'error', error });
      }
    }
    onBatch(stored);
  };


  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <TextField select size="small" label={t('kind')} value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-56">
          {DOCUMENT_KINDS.map((k) => <MenuItem key={k} value={k}>{label('documentKind', k)}</MenuItem>)}
        </TextField>
        <div className="flex-1">
          <FileDrop accept={DOCUMENT_ACCEPT} maxSize={MAX_DOCUMENT_BYTES} multiple disabled={busy} onFiles={upload} hint={t('dropHint')} />
        </div>
      </div>
      {uploads.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-2" aria-live="polite">
          {uploads.map((row, index) => (
            <li key={`${row.name}-${index}`} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{row.name}</span>
                <span className="text-muted shrink-0">
                  {row.state === 'done' ? tCommon('uploaded') : row.state === 'error' ? '' : tCommon('uploading', { percent: row.percent })}
                </span>
              </div>
              {row.state === 'error'
                ? <Alert severity="error" className="mt-1">{t('uploadFailed', { name: row.name, error: describe(row.error) })}</Alert>
                : <LinearProgress variant="determinate" value={row.percent} aria-label={row.name} color={row.state === 'done' ? 'success' : 'primary'} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// IntakeNotice
// -----------------------------------------------------------
//
// What the assistant does with the documents just uploaded
// (useDocumentIntake's state): reading them — with a link to
// the conversation once it exists —, done, or not finished,
// with the reason as the chat words it. Nothing before the
// first batch; a finished notice can be closed.
//
// Used by:
//   - CompanyDocuments (below)
// -----------------------------------------------------------

function IntakeNotice({ state, onDismiss }) {

  const t = useTranslations('PAGES.company.DOCUMENTS.INTAKE');
  const tChat = useTranslations('PAGES.chat.ERRORS');
  const locale = useLocale();
  if (state.phase === 'idle') return null;


  const reading = state.phase === 'reading';
  const text = reading ? t('reading', { count: state.count })
    : state.phase === 'done' ? t('done')
      : t('failed', { reason: describeChatError(state.error, tChat, locale) });
  return (
    <Alert
      severity={reading ? 'info' : state.phase === 'done' ? 'success' : 'warning'} className="mb-4" role="status"
      icon={reading ? <CircularProgress size={18} aria-label={t('progress')} /> : undefined}
      onClose={reading ? undefined : onDismiss} closeText={t('dismiss')}
    >
      {text}
      {state.threadId && <> <Link to={`/chat/${state.threadId}`} className="text-primary font-semibold">{t('open')}</Link></>}
    </Alert>
  );
}







// -----------------------------------------------------------
// DocumentSearch
// -----------------------------------------------------------
//
// The semantic search over this company's documents; runs
// on Enter, lists the passages with their section heading.
// The last answer is kept for the company (with the query
// the box starts from) and shown until the next one.
//
// Used by:
//   - CompanyDocuments (below)
// -----------------------------------------------------------

function DocumentSearch({ companyId, onOpen }) {

  const t = useTranslations('PAGES.company.DOCUMENTS');
  const fmt = useFormat();
  const [kept, setKept] = useSessionState(`company.${companyId}.search`, NO_SEARCH, isKeptSearch);
  const [text, setText] = useState(kept.q);


  const search = useMutation({
    mutationFn: async (q) => (await api.get(`/api/documents/search?q=${encodeURIComponent(q)}&companyId=${companyId}&k=8`)).data.hits,
    onSuccess: (hits, q) => setKept({ q, hits: Array.isArray(hits) ? hits : [] }),
  });
  const hits = search.isPending || search.error ? null : kept.hits;


  const submit = (event) => {
    event.preventDefault();
    if (text.trim()) search.mutate(text.trim());
  };


  return (
    <form onSubmit={submit} className="flex flex-col gap-2 mb-4" role="search">
      <TextField
        size="small" value={text} onChange={(e) => setText(e.target.value)} label={t('searchLabel')} className="max-w-xl"
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />
      {search.isPending && <LinearProgress className="max-w-xl" />}
      {search.error && <ErrorState error={search.error} className="max-w-xl" />}
      {hits && (
        <div aria-live="polite">
          <Typography variant="caption" color="text.secondary">
            {hits.length ? t('searchResults', { count: hits.length }) : t('searchEmpty')}
          </Typography>
          <ul className="m-0 p-0 list-none flex flex-col gap-2 mt-1">
            {hits.map((hit, index) => (
              <li key={`${hit.documentId}-${index}`}>
                <button type="button" onClick={() => onOpen(hit.documentId, hit.charStart || 0)}
                        className="w-full text-left bg-canvas hover:bg-primary/5 rounded p-2 border-0 cursor-pointer">
                  <div className="text-sm font-semibold text-primary">
                    {hit.title}{hit.heading ? ` — ${hit.heading}` : ''}
                    {hit.score != null && <span className="text-muted font-normal"> · {fmt.number(hit.score, { maximumFractionDigits: 2 })}</span>}
                  </div>
                  <div className="text-sm line-clamp-3">{hit.text}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}







// -----------------------------------------------------------
// DocumentsTable
// -----------------------------------------------------------
//
// Title (opens the drawer), kind, size, text status, index
// status, inventory summary, upload stamp, actions; the
// grid's loading overlay while the list is on its way.
//
// Used by:
//   - CompanyDocuments (below)
// -----------------------------------------------------------

function DocumentsTable({ rows, loading, onOpen, onDelete }) {

  const t = useTranslations('PAGES.company.DOCUMENTS');
  const label = useEnumLabel();
  const fmt = useFormat();


  const columns = useMemo(() => [
    { field: 'title', headerName: t('COLUMNS.title'), flex: 1.3, minWidth: 200,
      renderCell: ({ row, value }) => (
        <button type="button" onClick={() => onOpen(row.id)} className="text-left text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline truncate">
          {value}
        </button>
      ) },
    { field: 'kind', headerName: t('COLUMNS.kind'), width: 120, valueFormatter: (value) => label('documentKind', value) },
    { field: 'size', headerName: t('COLUMNS.size'), width: 100, valueFormatter: (value) => fmt.bytes(value) },
    { field: 'extractionStatus', headerName: t('COLUMNS.status'), width: 160,
      renderCell: ({ value }) => <StatusChip kind="extraction" value={value} label={label('extractionStatus', value)} /> },
    { field: 'indexedAt', headerName: t('COLUMNS.index'), width: 140,
      valueGetter: (value, row) => (value ? t('indexed') : row.extractionStatus === 'done' && Date.now() - new Date(row.uploadedAt).getTime() < FRESH_MS ? t('indexing') : t('notIndexed')) },
    { field: 'inventorySummary', headerName: t('COLUMNS.summary'), flex: 1.5, minWidth: 220, sortable: false,
      valueGetter: (value, row) => [row.documentType ? label('inventoryType', row.documentType) : null, value].filter(Boolean).join(' — ') || '—' },
    { field: 'uploadedAt', headerName: t('COLUMNS.uploaded'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
    { field: 'actions', headerName: t('COLUMNS.actions'), width: 100, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <div className="flex">
          <IconAction label={t('open')} icon={<VisibilityOutlinedIcon fontSize="small" />} onClick={() => onOpen(row.id)} />
          <IconAction label={t('delete')} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => onDelete(row)} />
        </div>
      ) },
  ], [t, label, fmt, onOpen, onDelete]);


  return (
    <DataTable rows={rows} columns={columns} loading={loading} label={t('title')} persist="documents"
               mobileHidden={['kind', 'size', 'indexedAt', 'inventorySummary', 'uploadedAt']} />
  );
}







// -----------------------------------------------------------
// CompanyDocuments (default export)
// -----------------------------------------------------------
//
// Owns the list query (polling while an index is pending),
// the open drawer, the delete confirmation and the hand-over
// of an uploaded batch to the assistant.
//
// Used by:
//   - CompanyDetail.jsx — the documents tab
// -----------------------------------------------------------

export default function CompanyDocuments({ company }) {

  const t = useTranslations('PAGES.company.DOCUMENTS');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const intake = useDocumentIntake(company.id);


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['documents', { companyId: company.id }],
    queryFn: async () => {
      const answer = (await api.get(`/api/documents?companyId=${company.id}&limit=500`)).data;
      // An answer without the list is a failed load — shown as
      // one, not as "no documents yet"
      if (!Array.isArray(answer?.documents)) throw new Error('The documents answer has no list');
      return answer;
    },
    refetchInterval: (query) => (query.state.data?.documents?.some((d) => d?.extractionStatus === 'done' && !d.indexedAt
      && Date.now() - new Date(d.uploadedAt).getTime() < FRESH_MS) ? 5000 : false),
  });
  const documents = data?.documents ?? [];


  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['company', company.id] });
  }, [queryClient, company.id]);


  const remove = useMutation({
    mutationFn: () => api.delete(`/api/documents/${deleting.id}`, { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.deleted')); refresh(); setConfirmOpen(false); },
  });


  const resetRemove = remove.reset;
  const onOpen = useCallback((id, at = 0) => setOpened({ id, at }), []);
  const onDelete = useCallback((row) => { resetRemove(); setDeleting(row); setConfirmOpen(true); }, [resetRemove]);


  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')}>
      <UploadPanel companyId={company.id} onUploaded={refresh} onBatch={intake.take} />
      <IntakeNotice state={intake.state} onDismiss={intake.dismiss} />
      {documents.length > 0 && <DocumentSearch companyId={company.id} onOpen={onOpen} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!error && !isLoading && documents.length === 0 && <EmptyState icon={DescriptionOutlinedIcon} title={t('empty')} text={t('emptyText')} />}
      {!error && (isLoading || documents.length > 0) && <DocumentsTable rows={documents} loading={isLoading} onOpen={onOpen} onDelete={onDelete} />}
      <DocumentDrawer documentId={opened?.id} startAt={opened?.at || 0} onClose={() => setOpened(null)} />
      <UniversalModal open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => remove.mutate()} danger
                      busy={remove.isPending} error={remove.error ? describe(remove.error) : null} onExited={() => setDeleting(null)}
                      title={t('deleteTitle', { name: deleting?.title })} confirmLabel={t('delete')}>
        <Typography>{t('deleteText')}</Typography>
      </UniversalModal>
    </SectionCard>
  );
}
