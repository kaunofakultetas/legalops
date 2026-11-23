// -----------------------------------------------------------
//  [*] Chat — the thread view
//
//  The scrollable message viewport with the welcome state,
//  the error banner, the "answer still being written" watcher
//  and the composer pinned at the bottom.
//
//  Behaviour worth knowing:
//
//    - the banner holds error FACTS and translates them at
//      render (chatErrors.js), so it follows a language
//      switch; it clears on the next send and on a switch,
//      and shows only the open thread's failures (and the
//      page's own);
//    - a turn outlives the page: after a reload mid-answer the
//      last message is the user's and the server says the turn
//      is still running — the watcher shows so, polls, and
//      reloads the thread when the reply is stored; a user
//      message left without any reply offers to generate one;
//    - screen readers hear "writing…" when a reply starts and
//      "reply received" when it ends (a polite live region —
//      not the whole markdown).
//
//  Split into (root component last):
//
//    POLL_MS          — the watcher's polling period
//    SUGGESTIONS      — the welcome prompts' message keys
//    ThreadWelcome    — empty state with suggestions
//    HistoryLoading   — "loading the conversation" status
//    ChatErrorNotice  — the banner
//    ReplyWatcher     — the pending / missing reply line
//    ReplyAnnouncer   — the live region
//    ScrollToBottom   — floating button
//    Thread           — the viewport (default export)
// -----------------------------------------------------------

import { Fragment, useEffect, useRef, useState } from 'react';
import { AuiIf, ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import api from '@/api/client';
import { CHAT_ACCEPT, MAX_DOCUMENT_BYTES } from '@/constants/uploads';
import { useLocale, useTranslations } from '@/i18n';
import { describeRefused } from '@/utils/files';
import { useChatState } from '@/pages/Chat/ChatRuntime';
import { describeChatError } from '@/pages/Chat/chatErrors';
import Composer from '@/pages/Chat/Composer';
import { AssistantMessage, UserEditComposer, UserMessage } from '@/pages/Chat/Messages';
import { Mark } from '@/components/layout/Wordmark';


// How often the watcher asks whether a turn still runs
const POLL_MS = 2_500;

// The welcome suggestions, by message key
const SUGGESTIONS = ['suggestion1', 'suggestion2', 'suggestion3'];







// -----------------------------------------------------------
// ThreadWelcome
// -----------------------------------------------------------
//
// Three example prompts that go straight to the assistant —
// each one something the platform really does (classify a
// company, assess it against acts with the analysis, check
// a document's citations) — under the question the
// conversation starts from, the app's mark on its line. Set
// left-aligned in the reading column, like the answers that
// will follow, and centred only while it fits. On the
// question's line the mark takes no height of its own, so a
// phone shows it too: there the viewport starts scrolled to
// its end (assistant-ui), and nothing may stand above the
// title to push it out of sight.
//
// Used by:
//   - Thread (below)
// -----------------------------------------------------------

function ThreadWelcome() {
  const t = useTranslations('PAGES.chat');
  return (
    <div className="flex-1 flex flex-col justify-center-safe gap-3 px-4 sm:px-6 py-8 chat-column w-full mx-auto">
      <div className="flex items-center gap-3">
        <Mark size={32} />
        <Typography variant="h5" component="h2">{t('welcomeTitle')}</Typography>
      </div>
      <Typography color="text.secondary" className="max-w-[38rem]">{t('welcomeText')}</Typography>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 w-full">
        {SUGGESTIONS.map((key) => (
          <ThreadPrimitive.Suggestion key={key} prompt={t(key)} send asChild>
            <button type="button" className="flex items-start text-left text-sm text-content px-4 py-3 rounded-md border border-edge bg-surface transition hover:border-primary hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer h-full motion-reduce:hover:translate-y-0">
              {t(key)}
            </button>
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// HistoryLoading
// -----------------------------------------------------------
//
// While a conversation's history loads the thread is empty
// and the composer waits (Composer.jsx) — this says why, to
// the eye and to a screen reader.
//
// Used by:
//   - Thread (below)
// -----------------------------------------------------------

function HistoryLoading() {
  const t = useTranslations('PAGES.chat');
  return (
    <div className="flex-1 flex items-center justify-center gap-2 py-8 text-sm text-muted" role="status">
      <CircularProgress size={18} aria-hidden />
      <span>{t('historyLoading')}</span>
    </div>
  );
}







// -----------------------------------------------------------
// ChatErrorNotice
// -----------------------------------------------------------
//
// The dismissable banner above the composer; the sentence is
// built at render from the stored facts. Nothing renders
// while there is no error — nor for a failure of another
// thread (one that landed after the user switched away).
// Files refused before any upload (a type or a size) read
// "Not attached:", a line per reason naming its files.
//
// Used by:
//   - Thread (below)
// -----------------------------------------------------------

function ChatErrorNotice() {
  const t = useTranslations('PAGES.chat.ERRORS');
  const locale = useLocale();
  const { error, clearError } = useChatState();
  const threadId = useAuiState((s) => s.threadListItem.id);
  if (!error || (error.thread != null && error.thread !== threadId)) return null;
  const refusals = error.refused ? describeRefused(error.refused, { accept: CHAT_ACCEPT, maxSize: MAX_DOCUMENT_BYTES }, locale) : null;
  return (
    <div className="chat-column mx-auto w-full px-3 sm:px-4 pt-3">
      <Alert severity="error" onClose={() => clearError()} slotProps={{ closeButton: { 'aria-label': t('dismiss'), title: t('dismiss') } }}>
        <strong>{refusals ? t('notAttached') : t('title')}:</strong>{' '}
        {refusals
          ? refusals.map((sentence, index) => (
            <Fragment key={sentence}>{index > 0 && ' '}<span className={`[overflow-wrap:anywhere] ${index > 0 ? 'block' : ''}`}>{sentence}</span></Fragment>
          ))
          : describeChatError(error, t, locale)}
      </Alert>
    </div>
  );
}







// -----------------------------------------------------------
// ReplyWatcher
// -----------------------------------------------------------
//
// When the thread is loaded, idle, and its last message is
// the user's, asks the assistant whether a turn is still
// running (GET /api/assistant/chat/:id/status): running →
// "still being written" and a poll, reloading the thread when
// it ends; not running → "no reply" with a button that
// generates one for that message.
//
// Used by:
//   - Thread (below)
// -----------------------------------------------------------

function ReplyWatcher() {

  const t = useTranslations('PAGES.chat.REPLY');
  const aui = useAui();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const running = useAuiState((s) => s.thread.isRunning);
  const loading = useAuiState((s) => s.thread.isLoading);
  const lastId = useAuiState((s) => s.thread.messages.at(-1)?.id ?? null);
  const lastRole = useAuiState((s) => s.thread.messages.at(-1)?.role ?? null);
  const [phase, setPhase] = useState(null);


  useEffect(() => {
    setPhase(null);
    if (!remoteId || running || loading || lastRole !== 'user') return undefined;
    let cancelled = false;
    let timer = null;
    let seenRunning = false;
    const poll = async () => {
      try {
        const { data } = await api.get(`/api/assistant/chat/${encodeURIComponent(remoteId)}/status`);
        if (cancelled) return;
        if (data.running) {
          seenRunning = true;
          setPhase('pending');
          timer = setTimeout(poll, POLL_MS);
        } else if (seenRunning) {
          setPhase(null);
          aui.threads().reloadMainThread().catch((err) => console.warn('Thread reload failed:', err));
        } else {
          setPhase('missing');
        }
      } catch {
        if (!cancelled) setPhase(null);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [remoteId, running, loading, lastId, lastRole, aui]);


  if (!phase) return null;
  return (
    <div className="chat-column w-full mx-auto px-3 sm:px-4 py-2" role="status">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted pl-9">
        {phase === 'pending' && <CircularProgress size={14} aria-hidden />}
        <span>{t(phase)}</span>
        {phase === 'missing' && (
          <Button size="small" onClick={() => aui.thread().startRun({ parentId: lastId })}>{t('generate')}</Button>
        )}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// ReplyAnnouncer
// -----------------------------------------------------------
//
// A polite live region: "writing…" when a run starts, "reply
// received" when it ends.
//
// Used by:
//   - Thread (below)
// -----------------------------------------------------------

function ReplyAnnouncer() {

  const t = useTranslations('PAGES.chat.REPLY');
  const running = useAuiState((s) => s.thread.isRunning);
  const wasRunning = useRef(running);
  const [text, setText] = useState('');


  useEffect(() => {
    if (running && !wasRunning.current) setText(t('running'));
    if (!running && wasRunning.current) setText(t('done'));
    wasRunning.current = running;
  }, [running, t]);


  return <div className="sr-only" role="status" aria-live="polite">{text}</div>;
}







// -----------------------------------------------------------
// ScrollToBottom
// -----------------------------------------------------------
//
// Floats above the composer once the user scrolled up;
// assistant-ui disables (hides) it at the bottom.
//
// Used by:
//   - Thread (below)
// -----------------------------------------------------------

function ScrollToBottom() {
  const t = useTranslations('PAGES.chat');
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <IconButton size="small" aria-label={t('scrollToBottom')} title={t('scrollToBottom')}
                  className="absolute -top-11 left-1/2 -translate-x-1/2 bg-surface! border border-edge shadow-float disabled:invisible">
        <ArrowDownwardIcon fontSize="small" />
      </IconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
}







// -----------------------------------------------------------
// Thread (default export)
// -----------------------------------------------------------
//
// The viewport auto-scrolls on new messages; the welcome
// state shows only while the thread is empty and loaded.
//
// Used by:
//   - Chat.jsx
// -----------------------------------------------------------

export default function Thread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full relative">
      <ThreadPrimitive.Viewport className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth pb-4">
        <div className="min-h-full flex flex-col">
          <AuiIf condition={(s) => s.thread.isEmpty && !s.thread.isLoading}><ThreadWelcome /></AuiIf>
          <AuiIf condition={(s) => s.thread.isLoading}><HistoryLoading /></AuiIf>
          <div className="flex flex-col w-full my-auto">
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage, UserEditComposer }} />
            <ReplyWatcher />
          </div>
        </div>
      </ThreadPrimitive.Viewport>
      <ReplyAnnouncer />
      <div className="shrink-0 bg-surface relative">
        <ScrollToBottom />
        <ChatErrorNotice />
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  );
}
