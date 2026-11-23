// -----------------------------------------------------------
//  [*] useDocumentIntake — the assistant reads what was uploaded
//
//    POST /api/chat/threads  {companyId}      → the conversation
//    POST /api/assistant/chat                 → one turn (a stream)
//
//  A document uploaded on the company's Documents tab is
//  handed to the assistant the way a file dropped into a
//  conversation is. The hook opens a conversation of the
//  company and sends one turn in the user's name: a sentence
//  saying that documents were uploaded, with the documents
//  attached. The chat's own rule does the rest — the assistant
//  reads them and files what they establish (the profile, each
//  document's kind, licences, standards, role profiles) and
//  says in its answer what it filed and what it still needs to
//  know. Nobody has to ask for it.
//
//  The turn runs on the server and outlives the page; its
//  stream is read here only to know when it ends and whether
//  it ended well. A refusal before the stream (today's budget
//  spent, no assistant configured) and an error inside it are
//  kept as the chat's own error facts, so the tab words them
//  as the chat would.
//
//  Documents wait their turn: one conversation at a time, at
//  most MAX_DOCUMENTS a turn (a message carries 30 parts), and
//  what is uploaded meanwhile is read next, in a conversation
//  of its own — a turn that carried the earlier documents
//  again would pay for reading them twice.
//
//  Split into:
//
//    CHAT_API          — the assistant's chat route
//    MAX_DOCUMENTS     — the documents of one turn
//    IDLE              — the state before any upload
//    refusal           — a refused turn, as the chat reads one
//    streamFailure     — the error a turn's stream carries
//    sendIntakeTurn    — one turn, settled when it has ended
//    useDocumentIntake — the hook (default export)
// -----------------------------------------------------------

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { redirectToLogin } from '@/auth/session';
import { clearToken, getToken } from '@/auth/token';
import { useLocale, useTranslations } from '@/i18n';
import { chatErrorInfo, chatFailure } from '@/pages/Chat/chatErrors';


// The chat backend route (Caddy → legalops-assistant)
const CHAT_API = '/api/assistant/chat';

// One part of a message is its text, the rest its documents
const MAX_DOCUMENTS = 29;

// Nothing uploaded yet, or the notice was closed
const IDLE = { phase: 'idle', count: 0, threadId: null, error: null };







// -----------------------------------------------------------
// refusal
// -----------------------------------------------------------
//
// A turn the assistant refused before it began, as an Error
// that chatErrorInfo reads like the AI SDK's own: the status
// and the answer's text, which holds the error envelope.
//
// Used by:
//   - sendIntakeTurn (below)
// -----------------------------------------------------------

function refusal(status, body) {
  return Object.assign(new Error(body || `HTTP ${status}`), { statusCode: status, responseBody: body });
}







// -----------------------------------------------------------
// streamFailure (exported for the tests)
// -----------------------------------------------------------
//
// What went wrong inside a turn's stream, as the Error the
// chat makes of it: the error chunk's text is the envelope
// chatErrorInfo reads. A turn that was stopped or superseded
// (an abort chunk) did not finish either — STREAM_FAILED says
// so. Null for a turn that ended as it should.
//
// Used by:
//   - sendIntakeTurn (below)
//   - tests/pages/company-document-intake.test.jsx
// -----------------------------------------------------------

export function streamFailure(body) {
  for (const line of String(body || '').split('\n')) {
    if (!line.startsWith('data:')) continue;
    let chunk;
    try { chunk = JSON.parse(line.slice(5)); } catch { continue; }
    if (chunk?.type === 'error') return new Error(typeof chunk.errorText === 'string' ? chunk.errorText : '');
    if (chunk?.type === 'abort') return new Error(JSON.stringify({ error: { code: 'STREAM_FAILED' } }));
  }
  return null;
}







// -----------------------------------------------------------
// sendIntakeTurn
// -----------------------------------------------------------
//
// One turn of the conversation `threadId`: `text` with the
// documents attached, each as the part the chat composer
// sends for an uploaded file. Settles when the turn has ended
// — the assistant closes the stream only once its answer is
// stored — and fails with the turn's refusal or its stream's
// error. A session that has ended goes to the login page, as
// everywhere.
//
// Used by:
//   - useDocumentIntake (below)
// -----------------------------------------------------------

async function sendIntakeTurn({ threadId, documents, text, locale }) {
  const parts = [
    { type: 'text', text },
    ...documents.map((row) => ({
      type: 'data-document',
      data: { id: row.id, title: row.title, kind: row.kind, charCount: row.charCount, extractionStatus: row.extractionStatus },
    })),
  ];
  const response = await fetch(CHAT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
    body: JSON.stringify({
      id: threadId, trigger: 'submit-message', parentId: null, locale,
      message: { id: `intake-${crypto.randomUUID()}`, role: 'user', parts },
    }),
  });
  if (response.status === 401) {
    clearToken();
    redirectToLogin({ expired: true });
  }
  const body = await response.text();
  if (!response.ok) throw refusal(response.status, body);
  const failed = streamFailure(body);
  if (failed) throw failed;
}







// -----------------------------------------------------------
// useDocumentIntake (default export)
// -----------------------------------------------------------
//
//   const intake = useDocumentIntake(company.id);
//   intake.take(documents)   — rows POST /api/documents answered
//   intake.state             — { phase, count, threadId, error }
//   intake.dismiss()         — the notice goes
//
// phase is idle, reading (a turn is running: `count`
// documents, `threadId` once the conversation exists), done
// (the last turn ended well) or failed (`error` holds the
// chat's facts of what went wrong; the documents that still
// waited are let go, and the conversation of a turn refused
// before it began is archived — it holds nothing).
// Only documents with text are taken. When a turn ends the
// company's queries are refreshed, so its tabs show what the
// assistant filed — after a failed one too: a turn cut short
// may have filed part of it.
//
// Used by:
//   - CompanyDocuments.jsx — after an upload batch
// -----------------------------------------------------------

export default function useDocumentIntake(companyId) {

  const t = useTranslations('PAGES.company.DOCUMENTS.INTAKE');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [state, setState] = useState(IDLE);
  const waiting = useRef([]);
  const running = useRef(false);


  // What a turn filed shows at once: the company's tabs all
  // read the one company query
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    queryClient.invalidateQueries({ queryKey: ['companies'] });
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['chatThreads', companyId] });
  }, [queryClient, companyId]);


  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let threadId = null;
    try {
      while (waiting.current.length > 0) {
        const documents = waiting.current.splice(0, MAX_DOCUMENTS);
        threadId = null;
        setState({ phase: 'reading', count: documents.length, threadId, error: null });
        const { data: thread } = await api.post('/api/chat/threads', { companyId }, { silent: true });
        if (typeof thread?.id !== 'string' || !thread.id) throw chatFailure('THREAD_NOT_CREATED');
        threadId = thread.id;
        setState((current) => ({ ...current, threadId }));
        await sendIntakeTurn({ threadId, documents, text: t('message'), locale });
        setState({ phase: 'done', count: documents.length, threadId, error: null });
        refresh();
      }
    } catch (error) {
      waiting.current = [];
      // A turn refused before it began leaves a conversation
      // with nothing in it: it is put away again
      if (threadId && error?.statusCode) {
        api.delete(`/api/chat/threads/${encodeURIComponent(threadId)}`, { silent: true }).catch(() => {});
        threadId = null;
      }
      setState((current) => ({ ...current, phase: 'failed', threadId, error: chatErrorInfo(error) }));
      refresh();
    } finally {
      running.current = false;
    }
  }, [companyId, locale, refresh, t]);


  const take = useCallback((documents) => {
    const readable = (Array.isArray(documents) ? documents : [])
      .filter((row) => typeof row?.id === 'string' && row.extractionStatus === 'done');
    if (readable.length === 0) return;
    waiting.current.push(...readable);
    run();
  }, [run]);


  const dismiss = useCallback(() => setState((current) => (current.phase === 'reading' ? current : IDLE)), []);


  return { state, take, dismiss };
}
