// -----------------------------------------------------------
//  [*] Chat — the assistant-ui runtime
//
//  Wires assistant-ui to this stack:
//
//    - the thread list adapter — Django's /api/chat/threads
//      (list, create, rename, archive); a deep link to a thread
//      that is gone reports onMissing (the page goes to "/")
//      and opens nothing; a deep link whose row cannot be read
//      (a failure, a malformed answer) still opens the thread
//      the URL names — the banner says what failed; a create
//      answered without the thread's id fails the turn before
//      it is sent (assistant-ui would send it under its local
//      draft id, which the assistant refuses)
//    - titles — Django names a thread from its first message
//      and the transport pulls that name in after a turn,
//      unless the user titled the thread themselves (the
//      list's rename dialog records it in `userTitles`): a
//      title the user set is never overwritten
//    - the history adapter — /api/chat/threads/{id}/messages:
//      load() decodes the readable rows (dropping legacy empty
//      replies and rows that are not messages, head = the
//      newest message); append() writes ONLY user messages —
//      assistant replies are persisted by the assistant
//      container itself, the only writer of them
//    - the transport — POST /api/assistant/chat with the SLIM
//      body: { id, trigger, messageId, message, parentId,
//      locale } (the history is Django's, never re-sent); a
//      user stop also calls /api/assistant/chat/{id}/stop,
//      because closing the connection alone no longer stops a
//      turn — and leaving the page does NOT call it (a reload
//      or navigation must not lose the reply); a 401 goes to
//      the login page
//    - the attachment adapter — a dropped file uploads to
//      /api/documents at once (progress through an async
//      generator) and is sent as a data-document part: the
//      GUI shows a chip, the model reads a line with its id;
//      a file over the backend's 50 MB is refused before any
//      request, without a chip — the banner names it
//      (reportRefused, which the composer also feeds with the
//      types assistant-ui refuses on its own)
//
//  The error banner keeps FACTS (chatErrors.js) and is
//  translated at render, so a language switch re-renders it.
//  Every failure also records the thread it belongs to (null
//  for the page itself — the conversation list): a switch
//  clears the banner of the thread left behind, never the
//  failure of the thread being opened.
//
//  Split into (root component last):
//
//    CHAT_API / USER_PARTS / … — constants
//    ChatStateContext / useChatState — banner, refusals, titles
//    progressQueue           — upload progress as an iterable
//    isThreadRow             — a thread row with an id
//    titleOf                 — a thread row's title, if any
//    readableRows            — history rows that are messages
//    isEmptyReply            — a stored reply with nothing in it
//    toRepository            — history rows → the repository
//    slimMessage             — the user message as sent
//    createThreadListAdapter — Django thread CRUD
//    createAttachmentAdapter — upload-on-add, data part on send
//    createHistoryAdapter    — load + user-only append
//    createTransport         — the slim-body chat transport
//    useThreadRuntime        — one thread: history + transport
//    ErrorAutoClear          — clears the banner on send/switch
//    ChatRuntime             — the provider (default export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the provider and its hook belong together */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider, CompositeAttachmentAdapter, useAui, useAuiState, useRemoteThreadListRuntime,
} from '@assistant-ui/react';
import { AssistantChatTransport, useAISDKRuntime } from '@assistant-ui/react-ai-sdk';
import { useChat } from '@ai-sdk/react';
import api from '@/api/client';
import { redirectToLogin } from '@/auth/session';
import { clearToken, getToken } from '@/auth/token';
import { CHAT_ACCEPT, MAX_DOCUMENT_BYTES } from '@/constants/uploads';
import { useLocale } from '@/i18n';
import { chatErrorInfo, chatFailure } from '@/pages/Chat/chatErrors';


// The chat backend route (Caddy → legalops-assistant)
const CHAT_API = '/api/assistant/chat';

// The part types a user message carries to the assistant
const USER_PARTS = new Set(['text', 'data-document']);

// The roles a stored history row may carry
const HISTORY_ROLES = new Set(['user', 'assistant']);

// The part types whose `text` the renderers read as a string
const TEXT_PARTS = new Set(['text', 'reasoning']);

// { error, reportRefused, clearError, userTitles } — the
// defaults serve a component rendered outside the provider
const ChatStateContext = createContext({
  error: null, reportRefused: () => {}, clearError: () => {}, userTitles: new Set(),
});







// -----------------------------------------------------------
// useChatState
// -----------------------------------------------------------
//
//   const { error, reportRefused, clearError, userTitles } = useChatState();
//
//   reportRefused([{ name, reason: 'type' | 'size' }])
//                               — files refused before any
//                                 upload, added to the open
//                                 thread's notice of them
//   clearError()                — the banner goes
//   clearError({ keep: id })    — unless it is thread id's or
//                                 the page's
//   userTitles.add(remoteId)    — the user titled that thread
//
// The banner's facts (null when clear; `thread` says whose;
// a refusal notice is { refused, thread } instead of a
// failure's facts) and the remote ids whose title the user
// set in this session — the automatic title leaves those
// alone. Failures are reported, and turns stopped, only by
// the adapters and the transport, which the provider hands
// its reportError and requestStop directly — so neither is
// offered here.
//
// Used by:
//   - Thread.jsx — ChatErrorNotice
//   - ThreadList.jsx — RenameDialog (userTitles)
//   - Composer.jsx — reportRefused (the types it screens)
//   - ErrorAutoClear (below)
// -----------------------------------------------------------

export function useChatState() {
  return useContext(ChatStateContext);
}







// -----------------------------------------------------------
// progressQueue
// -----------------------------------------------------------
//
// A push-to-pull bridge: axios pushes upload fractions, the
// attachment generator pulls them with for-await; values that
// pile up between two pulls collapse to the latest.
//
// Used by:
//   - createAttachmentAdapter (below)
// -----------------------------------------------------------

function progressQueue() {
  let latest = null;
  let wake = null;
  let closed = false;
  return {
    push(value) {
      latest = value;
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async* [Symbol.asyncIterator]() {
      while (true) {
        if (latest !== null) {
          const value = latest;
          latest = null;
          yield value;
          continue;
        }
        if (closed) return;
        await new Promise((resolve) => { wake = resolve; });
        wake = null;
      }
    },
  };
}







// -----------------------------------------------------------
// isThreadRow
// -----------------------------------------------------------
//
// A thread row the adapter can use: an object with a string
// id. Anything else in a list (or as a detail) is skipped —
// a thread without an id would be an entry assistant-ui can
// neither show nor open — and a create answered without one
// fails the turn.
//
// Used by:
//   - createThreadListAdapter (below) — list, initialize,
//     rename, fetch
//   - createTransport (below) — the title refresh
// -----------------------------------------------------------

function isThreadRow(row) {
  return Boolean(row) && typeof row === 'object' && typeof row.id === 'string' && row.id !== '';
}







// -----------------------------------------------------------
// titleOf
// -----------------------------------------------------------
//
// A thread row's title when it has a readable one, else
// undefined (the list shows "New conversation").
//
// Used by:
//   - createThreadListAdapter (below) — list, fetch
//   - createTransport (below) — the title refresh
// -----------------------------------------------------------

function titleOf(row) {
  return typeof row?.title === 'string' && row.title ? row.title : undefined;
}







// -----------------------------------------------------------
// readableRows (exported for the tests)
// -----------------------------------------------------------
//
//   readableRows(data) → the history rows that are messages
//
// GET …/messages must answer a list of rows {id, parent_id,
// format, content: {role, parts, metadata?}}. Anything else
// loads as an empty history, and inside the list a row is
// skipped unless it has a string id and a user / assistant
// message with a parts list; its parts keep only the ones
// with a type (a text part only with string text — the
// renderers trim it), and a repeated id keeps its first row.
// A skipped row's children hang under the row before it
// (toRepository), so one broken row does not cut the thread.
//
// Used by:
//   - createHistoryAdapter (below) — load()
//   - tests/pages/chat-runtime.test.jsx
// -----------------------------------------------------------

export function readableRows(data) {
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  const rows = [];
  for (const row of data) {
    const content = row?.content;
    if (typeof row?.id !== 'string' || !row.id || seen.has(row.id)) continue;
    if (!content || typeof content !== 'object' || !HISTORY_ROLES.has(content.role) || !Array.isArray(content.parts)) continue;
    const parts = content.parts.filter((part) => typeof part?.type === 'string'
      && (!TEXT_PARTS.has(part.type) || typeof part.text === 'string'));
    const parentId = typeof row.parent_id === 'string' && row.parent_id ? row.parent_id : null;
    seen.add(row.id);
    rows.push({ ...row, parent_id: parentId, content: { ...content, parts } });
  }
  return rows;
}







// -----------------------------------------------------------
// isEmptyReply (exported for the tests)
// -----------------------------------------------------------
//
// An assistant message with no visible text and no tool call
// — older builds stored those for stopped or failed turns.
//
// Used by:
//   - toRepository (below)
//   - tests/pages/chat-runtime.test.jsx
// -----------------------------------------------------------

export function isEmptyReply(message) {
  if (message?.role !== 'assistant') return false;
  return !(Array.isArray(message.parts) ? message.parts : []).some((part) =>
    (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) || String(part?.type || '').startsWith('tool-'));
}







// -----------------------------------------------------------
// toRepository (exported for the tests)
// -----------------------------------------------------------
//
// Decoded history items ([{parentId, message}], oldest first)
// → { headId, messages }: empty legacy replies are dropped
// (their children re-parented to the reply's parent, so the
// branch continues); a message whose parent is not stored at
// all (a reply that failed to persist) hangs under the message
// stored just before it — assistant-ui would otherwise hide it
// and everything after it; the head is the newest message —
// the branch the user last worked on, never an empty bubble.
//
// Used by:
//   - createHistoryAdapter (below) — load()
//   - tests/pages/chat-runtime.test.jsx
// -----------------------------------------------------------

export function toRepository(items) {
  const dropped = new Map();
  const kept = [];
  const keptIds = new Set();
  for (const item of items) {
    let parentId = item.parentId ?? null;
    while (parentId && dropped.has(parentId)) parentId = dropped.get(parentId);
    if (parentId && !keptIds.has(parentId)) parentId = kept.at(-1)?.message.id ?? null;
    if (isEmptyReply(item.message)) {
      dropped.set(item.message.id, parentId);
      continue;
    }
    kept.push({ ...item, parentId });
    keptIds.add(item.message.id);
  }
  return { headId: kept.at(-1)?.message.id ?? null, messages: kept };
}







// -----------------------------------------------------------
// slimMessage (exported for the tests)
// -----------------------------------------------------------
//
// The user message as the assistant accepts it: id, role,
// the text and document parts, and small metadata.
//
// Used by:
//   - createTransport (below)
//   - tests/pages/chat-runtime.test.jsx
// -----------------------------------------------------------

export function slimMessage(message) {
  return {
    id: message?.id,
    role: message?.role,
    parts: (message?.parts || []).filter((part) => USER_PARTS.has(part?.type))
      .map((part) => (part.type === 'text' ? { type: 'text', text: part.text } : { type: part.type, data: part.data })),
    ...(message?.metadata ? { metadata: message.metadata } : {}),
  };
}







// -----------------------------------------------------------
// createThreadListAdapter
// -----------------------------------------------------------
//
// assistant-ui's RemoteThreadListAdapter over Django. Titles
// come from Django (set from the first user message) or from
// the user (the list's rename dialog): rename skips the PATCH
// when the title is already Django's (the title refresh after
// the first turn is local only), else PATCHes {title}
// silently — the dialog shows a refusal — and remembers the
// row Django answers; archive goes back. A list answer that
// is not {threads: [...]} lists nothing; rows without an id
// are skipped.
//
// initialize() refuses a create answered without the new
// thread's id (THREAD_NOT_CREATED): the AssistantChatTransport
// would fall back to assistant-ui's local draft id and send
// the turn under it (the assistant refuses it,
// INVALID_THREAD). The turn fails before it is sent, the
// banner says why, and the draft stays new for the next try.
//
// fetch() opens a deep link: a thread that is gone (404)
// calls onMissing and fails the switch — no phantom
// conversation opens; any other failure, or an answer that
// is not the thread's row, still opens the thread the URL
// names (its history may load; the banner says what failed).
//
// Used by:
//   - ChatRuntime (below)
// -----------------------------------------------------------

function createThreadListAdapter({ reportError, metaRef, missingRef }) {
  const remember = (thread) => metaRef.current.set(thread.id, thread);
  return {
    async list() {
      try {
        const { data } = await api.get('/api/chat/threads');
        const rows = (Array.isArray(data?.threads) ? data.threads : []).filter(isThreadRow);
        rows.forEach(remember);
        return {
          threads: rows.map((t) => ({ remoteId: t.id, externalId: undefined, status: 'regular', title: titleOf(t) })),
        };
      } catch (err) {
        // The list is the page's, not one thread's
        reportError(err, null);
        return { threads: [] };
      }
    },
    async initialize() {
      // Silent: a failure fails the turn, and the chat banner
      // says why — the client's toast would say it twice
      const { data } = await api.post('/api/chat/threads', {}, { silent: true });
      if (!isThreadRow(data)) throw chatFailure('THREAD_NOT_CREATED');
      remember(data);
      return { remoteId: data.id, externalId: undefined };
    },
    async rename(remoteId, title) {
      const known = metaRef.current.get(remoteId);
      if (known && known.title === title) return;
      const { data } = await api.patch(`/api/chat/threads/${encodeURIComponent(remoteId)}`, { title }, { silent: true });
      if (isThreadRow(data) && data.id === remoteId) remember(data);
      else if (known) remember({ ...known, title });
    },
    async archive(remoteId) {
      await api.delete(`/api/chat/threads/${encodeURIComponent(remoteId)}`);
      metaRef.current.delete(remoteId);
    },
    async unarchive() {},
    async delete(remoteId) {
      await api.delete(`/api/chat/threads/${encodeURIComponent(remoteId)}`);
      metaRef.current.delete(remoteId);
    },
    async generateTitle() {
      // Django titles the thread from its first message; an
      // empty stream keeps assistant-ui's own generator quiet
      return new ReadableStream({ start(controller) { controller.close(); } });
    },
    async fetch(threadId) {
      let row = null;
      try {
        const { data } = await api.get(`/api/chat/threads/${encodeURIComponent(threadId)}`);
        if (isThreadRow(data) && data.id === threadId) row = data;
      } catch (err) {
        if (err?.response?.status === 404) {
          missingRef.current?.(threadId);
          // assistant-ui drops the switch; the page stays on
          // (and the URL goes to) a new conversation
          throw err;
        }
        // Keyed by the item the switch is about to open (a
        // fetched thread's item id is its remote id), so the
        // switch keeps the banner
        reportError(err, threadId);
      }
      if (row) remember(row);
      return { remoteId: threadId, externalId: undefined, status: 'regular', title: titleOf(row) };
    },
  };
}







// -----------------------------------------------------------
// createAttachmentAdapter
// -----------------------------------------------------------
//
// add() is an async generator: it yields the chip at once,
// then the upload progress, then the uploaded document (or an
// "incomplete" chip with the reason — the banner says why).
// remove() deletes the uploaded document (the chip's delete
// icon). send() turns the upload into one data-document part.
//
// A file over MAX_DOCUMENT_BYTES is refused before anything
// is yielded: no chip, no request (the backend would read it
// all to answer FILE_TOO_LARGE), the banner names it with the
// limit. Every picked, dropped or pasted file the runtime
// lets through comes here, so this is the one size check.
//
// A message may be sent (or a chip removed) while its upload
// still runs: both wait for it through `uploads` (chip id →
// the upload's document), so the part gets the document's id
// and a removed chip's document is deleted once it exists. A
// failed upload is sent without a part — a document part
// without an id makes the assistant refuse the whole message
// (INVALID_PART); the chip and the banner said what failed.
//
// Used by:
//   - ChatRuntime (below)
// -----------------------------------------------------------

function createAttachmentAdapter(reportError, reportRefused) {

  const uploads = new Map();

  // The chip's document: the one it carries, else the one its
  // running upload brings (null when that fails)
  const documentOf = async (attachment) => attachment.document ?? (await uploads.get(attachment.id)) ?? null;


  return {
    accept: CHAT_ACCEPT,
    async* add({ file }) {
      // Thrown before the first yield: assistant-ui adds no
      // chip, and the composer that handed the file over
      // swallows the error — the banner is the one message
      if (file.size > MAX_DOCUMENT_BYTES) {
        reportRefused([{ name: file.name, reason: 'size' }]);
        throw new Error('FILE_TOO_LARGE');
      }
      const base = {
        id: crypto.randomUUID(), type: 'document', name: file.name,
        contentType: file.type || 'application/octet-stream', file,
      };
      yield { ...base, status: { type: 'running', reason: 'uploading', progress: 0 } };

      const queue = progressQueue();
      const form = new FormData();
      form.append('file', file);
      const upload = api.post('/api/documents', form, {
        silent: true,
        onUploadProgress: (event) => queue.push(event.total ? Math.min(1, event.loaded / event.total) : 0),
      }).finally(() => queue.close());
      // Marks the rejection handled until it is awaited below
      upload.catch(() => {});
      uploads.set(base.id, upload.then(({ data }) => (typeof data?.id === 'string' ? data : null), () => null));

      for await (const progress of queue) {
        yield { ...base, status: { type: 'running', reason: 'uploading', progress } };
      }
      try {
        const { data } = await upload;
        yield { ...base, document: data, status: { type: 'requires-action', reason: 'composer-send' } };
      } catch (err) {
        reportError(err);
        yield { ...base, status: { type: 'incomplete', reason: 'error', message: String(err?.response?.status ?? 'network') } };
      } finally {
        uploads.delete(base.id);
      }
    },
    async remove(attachment) {
      const doc = await documentOf(attachment);
      if (!doc?.id) return;
      try {
        await api.delete(`/api/documents/${encodeURIComponent(doc.id)}`, { silent: true });
      } catch {
        // already gone — the chip goes either way
      }
    },
    async send(attachment) {
      const doc = await documentOf(attachment);
      return {
        ...attachment,
        status: { type: 'complete' },
        content: doc?.id ? [{
          type: 'data', name: 'document',
          data: {
            id: doc.id, title: doc.title ?? attachment.name, kind: doc.kind ?? null,
            charCount: doc.charCount ?? null, extractionStatus: doc.extractionStatus ?? null,
          },
        }] : [],
      };
    },
  };
}







// -----------------------------------------------------------
// createHistoryAdapter
// -----------------------------------------------------------
//
// The thread's history in assistant-ui's own row format
// (fmt = aiSDKV6FormatAdapter): load() as described in the
// header; append() upserts user messages only (the assistant
// container already stored them before answering — this is a
// harmless repeat) and never assistant ones. A thread that is
// gone (404) loads empty and silently — the thread adapter
// already reported it. Failures are this thread's (its item
// id): a load that fails while the switch to it is still
// under way must survive the switch.
//
// Used by:
//   - useThreadRuntime (below)
// -----------------------------------------------------------

function createHistoryAdapter(aui, reportError) {
  return {
    async load() { return { messages: [] }; },
    async append() {},
    withFormat: (fmt) => ({
      async load() {
        const { id, remoteId } = aui.threadListItem().getState();
        if (!remoteId) return { messages: [] };
        try {
          const { data } = await api.get(`/api/chat/threads/${encodeURIComponent(remoteId)}/messages`);
          return toRepository(readableRows(data).map((row) => fmt.decode(row)));
        } catch (err) {
          if (err?.response?.status !== 404) reportError(err, id);
          return { messages: [] };
        }
      },
      async append(item) {
        if (item.message.role !== 'user') return;
        const { remoteId } = await aui.threadListItem().initialize();
        if (!remoteId) return;
        try {
          await api.post(`/api/chat/threads/${encodeURIComponent(remoteId)}/messages`, {
            id: fmt.getId(item.message), parent_id: item.parentId, format: fmt.format, content: fmt.encode(item),
          }, { silent: true });
        } catch (err) {
          reportError(err, aui.threadListItem().getState().id);
        }
      },
    }),
  };
}







// -----------------------------------------------------------
// createTransport
// -----------------------------------------------------------
//
// The AssistantChatTransport (it initializes the remote
// thread and hands us its id) with our own request body and
// a fetch wrapper:
//
//   body  — { id, trigger, messageId, message, parentId,
//             locale }: the last message only, its parent, the
//             UI locale (it decides the answer's language)
//   fetch — a user stop (the request's signal aborts) also
//           calls the stop route — unless the abort is the
//           page going away (leavingRef, see useThreadRuntime);
//           a 401 ends the session; an accepted turn refreshes
//           an untitled thread's title — never one the user
//           set (userTitles) — and reads it once more when
//           that first turn's stream is over, by which time the
//           assistant's model has named the thread
//
// Used by:
//   - useThreadRuntime (below)
// -----------------------------------------------------------

function createTransport({ aui, localeRef, requestStop, rememberThread, userTitles, leavingRef }) {

  // Django names a thread from its first user message, which
  // the assistant stored before answering — pull the title
  // into the list; the fetched row is remembered first, so the
  // adapter's rename() sees Django's own title and skips the
  // PATCH. The item's snapshot in this scope is the one taken
  // when the thread's runtime mounted — assistant-ui does not
  // keep it live here (a new thread still reads "new", no
  // remote id, untitled, after its first turn), so it only
  // says whether the thread was titled already; the answer
  // for this transport's own thread decides, rename() goes
  // through the live thread list, and `titled` ends the
  // refreshes once it worked. A title the user set wins: it
  // is asked again when the row is in, because the user may
  // rename the thread while the row is on its way (Django's
  // answer then still carries its own title, and the
  // snapshot never sees the rename)
  let titled = false;
  let modelTitled = false;
  const refreshTitle = async (threadId) => {
    if (!threadId || titled || userTitles.has(threadId) || !aui.threadListItem.source || aui.threadListItem().getState().title) return;
    try {
      const { data } = await api.get(`/api/chat/threads/${encodeURIComponent(threadId)}`);
      if (!isThreadRow(data) || data.id !== threadId || userTitles.has(threadId)) return;
      rememberThread(data);
      const title = titleOf(data);
      if (!title) return;
      await aui.threadListItem().rename(title);
      titled = true;
    } catch {
      // the title can wait for the next list refresh
    }
  };


  // The model's title: the assistant asks for it beside the
  // first answer and stores it before the stream ends, in
  // place of the opening of the message Django named the
  // thread after. So once the first turn's stream is over
  // (and its first read is done), the row is read again and
  // a new title replaces the old one — remembered first, so
  // no PATCH; never over a title the user set meanwhile, and
  // only once per thread
  const finalTitle = async (threadId) => {
    if (!titled || modelTitled || userTitles.has(threadId)) return;
    modelTitled = true;
    try {
      const { data } = await api.get(`/api/chat/threads/${encodeURIComponent(threadId)}`);
      if (!isThreadRow(data) || data.id !== threadId || userTitles.has(threadId)) return;
      const title = titleOf(data);
      if (!title || title === aui.threadListItem().getState().title) return;
      rememberThread(data);
      await aui.threadListItem().rename(title);
    } catch {
      // the model's title waits for the next list refresh
    }
  };


  return new AssistantChatTransport({
    api: CHAT_API,
    headers: () => ({ Authorization: `Bearer ${getToken() ?? ''}` }),
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
      body: {
        id,
        trigger,
        messageId: messageId ?? null,
        message: slimMessage(messages.at(-1)),
        parentId: messages.at(-2)?.id ?? null,
        locale: localeRef.current,
      },
    }),
    fetch: async (input, init) => {
      let threadId = null;
      try { threadId = JSON.parse(init?.body ?? '{}').id ?? null; } catch { threadId = null; }
      init?.signal?.addEventListener('abort', () => {
        if (!leavingRef.current) requestStop(threadId);
      }, { once: true });
      const response = await globalThis.fetch(input, init);
      if (response.status === 401) {
        clearToken();
        redirectToLogin({ expired: true });
      }
      if (!response.ok) return response;
      const titling = refreshTitle(threadId);
      if (!response.body) return response;
      // The stream's end (never reached when it is stopped)
      // brings the model's title
      const watched = response.body.pipeThrough(new TransformStream({
        flush: () => { titling.then(() => finalTitle(threadId)); },
      }));
      return new Response(watched, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
}







// -----------------------------------------------------------
// useThreadRuntime
// -----------------------------------------------------------
//
// One thread's lifecycle: the history adapter, the transport
// (one per thread, wired to the runtime after render — never
// mutated during it) and the AI SDK chat hook composed into
// an assistant-ui runtime. A failure of the turn is this
// thread's (its item id), even when it lands after a switch.
//
// Used by:
//   - ChatRuntime (below) — as the runtimeHook
// -----------------------------------------------------------

function useThreadRuntime({ reportError, requestStop, rememberThread, userTitles, attachments, localeRef }) {

  const aui = useAui();
  const id = useAuiState((s) => s.threadListItem.id);
  const leavingRef = useRef(false);
  const history = useMemo(() => createHistoryAdapter(aui, reportError), [aui, reportError]);
  const [transport] = useState(() => createTransport({ aui, localeRef, requestStop, rememberThread, userTitles, leavingRef }));


  // Leaving the page unmounts this hook, and useChat's own
  // cleanup then aborts a live request — that is not a user
  // stop: the turn runs on and its reply is shown on the way
  // back. React runs a component's effect cleanups in the
  // order the effects were declared, so this one (declared
  // before useChat) marks the leave before that abort fires.
  useEffect(() => {
    leavingRef.current = false;
    return () => { leavingRef.current = true; };
  }, []);


  const chat = useChat({ id, transport, onError: (error) => reportError(error, id) });
  const runtime = useAISDKRuntime(chat, { adapters: { history, attachments } });


  useEffect(() => {
    transport.setRuntime(runtime);
    transport.__internal_setGetThreadListItem(() => (aui.threadListItem.source ? aui.threadListItem() : undefined));
  }, [transport, runtime, aui]);


  return runtime;
}







// -----------------------------------------------------------
// ErrorAutoClear
// -----------------------------------------------------------
//
// The banner belongs to one attempt in one thread: a new run
// (Enter, the send button, a suggestion, an edit, regenerate)
// clears it, and so does a switch to another thread — for the
// thread left behind. A failure of the thread being opened
// (its row, its history), which may land before the switch
// is done, stays; so does a failure of the page (the list).
//
// Used by:
//   - ChatRuntime (below)
// -----------------------------------------------------------

function ErrorAutoClear() {

  const { clearError } = useChatState();
  const running = useAuiState((s) => s.thread.isRunning);
  const threadId = useAuiState((s) => s.threadListItem.id);


  useEffect(() => {
    if (running) clearError();
  }, [running, clearError]);


  useEffect(() => {
    clearError({ keep: threadId });
  }, [threadId, clearError]);


  return null;
}







// -----------------------------------------------------------
// ChatRuntime (default export)
// -----------------------------------------------------------
//
//   <ChatRuntime threadId={urlId} onMissingThread={(id) => …}>
//
// The provider: the remote thread list runtime over Django
// plus the banner state and the user's own titles.
// `threadId` (from the URL) opens that conversation;
// onMissingThread fires for a deep link to a thread that
// does not exist (or is not the user's).
//
// Used by:
//   - Chat.jsx — around the chat page
// -----------------------------------------------------------

export default function ChatRuntime({ threadId, onMissingThread, children }) {

  const locale = useLocale();
  const [error, setError] = useState(null);
  const metaRef = useRef(new Map());
  const missingRef = useRef(onMissingThread);
  const localeRef = useRef(locale);
  const runtimeRef = useRef(null);
  // One Set for the page's life: the transports read it when
  // a turn is accepted, the rename dialog writes to it
  const [userTitles] = useState(() => new Set());


  // Handlers the adapters (created once) reach through refs
  useEffect(() => {
    missingRef.current = onMissingThread;
    localeRef.current = locale;
  }, [onMissingThread, locale]);


  // The facts plus whose failure it is: the thread item id
  // given, null for the page, by default the open thread's
  const reportError = useCallback((err, thread) => {
    const owner = thread !== undefined ? thread : (runtimeRef.current?.threads.getState().mainThreadId ?? null);
    setError({ ...chatErrorInfo(err), thread: owner });
  }, []);
  // Files refused before any upload: ONE notice in the open
  // thread for all of them — a drop can be refused in two
  // places (the composer's type check, the adapter's size
  // check), and a file named once stays named once; a
  // failure on the banner gives way to the notice
  const reportRefused = useCallback((refused) => {
    const owner = runtimeRef.current?.threads.getState().mainThreadId ?? null;
    setError((current) => {
      const named = current?.refused && current.thread === owner ? current.refused : [];
      const fresh = refused.filter((entry) => !named.some((seen) => seen.name === entry.name && seen.reason === entry.reason));
      if (named.length > 0 && fresh.length === 0) return current;
      return { refused: [...named, ...fresh], thread: owner };
    });
  }, []);
  const rememberThread = useCallback((thread) => metaRef.current.set(thread.id, thread), []);
  const clearError = useCallback(({ keep } = {}) => {
    setError((current) => (keep !== undefined && current && (current.thread === null || current.thread === keep) ? current : null));
  }, []);
  const requestStop = useCallback((id) => {
    if (!id) return;
    api.post(`${CHAT_API}/${encodeURIComponent(id)}/stop`, {}, { silent: true }).catch(() => {});
  }, []);


  const [adapter] = useState(() => createThreadListAdapter({ reportError, metaRef, missingRef }));
  const [attachments] = useState(() => new CompositeAttachmentAdapter([createAttachmentAdapter(reportError, reportRefused)]));
  // assistant-ui calls runtimeHook AS a hook (once per thread
  // list item), so the hook call inside the callback is the
  // documented pattern, not a rules-of-hooks violation
  const runtimeHook = useCallback(
    // eslint-disable-next-line react-hooks/rules-of-hooks
    () => useThreadRuntime({ reportError, requestStop, rememberThread, userTitles, attachments, localeRef }),
    [reportError, requestStop, rememberThread, userTitles, attachments],
  );
  const runtime = useRemoteThreadListRuntime({ runtimeHook, adapter, threadId: threadId || undefined });
  const value = useMemo(
    () => ({ error, reportRefused, clearError, userTitles }),
    [error, reportRefused, clearError, userTitles],
  );


  // reportError reads the open thread through it
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);


  return (
    <ChatStateContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ErrorAutoClear />
        {children}
      </AssistantRuntimeProvider>
    </ChatStateContext.Provider>
  );
}
