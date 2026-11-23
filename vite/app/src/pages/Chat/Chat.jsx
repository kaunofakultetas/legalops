// -----------------------------------------------------------
//  [*] Chat — the main screen
//
//  The page after login: the app frame (navbar + sidebar,
//  the copyright band below them) around the conversation
//  list, the thread and the company
//  panel. The URL /chat/:threadId opens a conversation; the
//  runtime keeps the URL in step when the user switches.
//
//  Behaviour worth knowing:
//
//    - the last open conversation is remembered per user:
//      coming back to "/" from another page reopens it, while
//      a link to "/" inside the chat (the navbar's wordmark,
//      the sidebar's Chat) starts a fresh one;
//    - a link to a conversation that does not exist (or is
//      not the user's) lands on "/" with a notice, never on a
//      phantom thread;
//    - while an answer is being written, leaving the chat
//      page (a link, Back, reload, closing the tab) asks
//      first — the reply is saved server-side anyway;
//    - below 1024 px the conversation list is a drawer (a
//      button in the chat header opens it — its icon alone
//      below sm, where the words took a third of a 360 px
//      header): on a tablet a third column beside the
//      navigation left the thread a narrow strip. Below
//      1200 px the company panel is a drawer too; above,
//      both are columns;
//    - the header's company button is labelled with the
//      conversation's linked company and the role it adopts,
//      and opens the panel, where the company and the role
//      are linked, changed or unlinked (ThreadLink); the
//      label follows such a change at once, and a link the
//      assistant makes during a turn when the turn ends
//      (RunRefresh);
//    - a conversation is renamed from its row in the list
//      (ThreadList); the header's title follows.
//
//  Split into (root component last):
//
//    LAST_THREAD_KEY   — the remembered conversation's key
//    PANEL_KEY         — the panel column's open state key
//    ROOMY             — the header's sm breakpoint
//    rememberedThread  — read the remembered conversation
//    UrlSync           — URL ↔ the main thread (+ memory)
//    LeaveGuard        — "the answer is still being written"
//    ChatHeader        — title, list and company buttons
//    Chat              — the page (default export)
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import toast from '@/utils/toast';
import { useAuiState } from '@assistant-ui/react';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { useTranslations } from '@/i18n';
import IconAction from '@/components/IconAction/IconAction';
import Navbar from '@/components/layout/Navbar';
import PageFooter from '@/components/layout/PageFooter';
import Sidebar from '@/components/layout/Sidebar';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import ChatRuntime from '@/pages/Chat/ChatRuntime';
import CompanyPanel, { RunRefresh, linkedNames, useThreadRow } from '@/pages/Chat/CompanyPanel';
import ThreadList from '@/pages/Chat/ThreadList';
import Thread from '@/pages/Chat/Thread';


// localStorage key of the remembered conversation, per user
const LAST_THREAD_KEY = 'chat.lastThread.';

// The company panel's open state on wide screens
const PANEL_KEY = 'chat.companyPanel';

// Tailwind's sm — the width the header's classes switch at:
// below it the conversations button is its icon alone
const ROOMY = '(min-width:640px)';







// -----------------------------------------------------------
// rememberedThread
// -----------------------------------------------------------
//
// The user's remembered conversation id, or null (storage
// may be unavailable — private windows).
//
// Used by:
//   - UrlSync (below)
// -----------------------------------------------------------

function rememberedThread(userId) {
  try {
    return localStorage.getItem(LAST_THREAD_KEY + userId);
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// UrlSync
// -----------------------------------------------------------
//
// Mirrors the main thread's remote id into the URL (replace,
// not push, so Back does not walk every switch) and into the
// per-user memory — but only when the runtime moved: a row
// picked in the list, "New conversation", a fresh one given
// its id by its first message. When the URL moved instead (a
// link to "/" or to a conversation, Back, a deep link), the
// runtime follows it through ChatRuntime and nothing is
// written back. Answering a URL move with the thread still
// open made the two chase each other between "/" and
// /chat/<id> without end, since the switch lands only later.
//
// On the first render at "/" the remembered conversation is
// opened. Leaving a stored conversation for a fresh one
// forgets it and writes "/", so a link to "/" from inside
// the chat starts a fresh conversation, as "New
// conversation" does; a deep link survives the initial load,
// where nothing was open yet.
//
// Used by:
//   - Chat (below)
// -----------------------------------------------------------

function UrlSync({ userId }) {

  const navigate = useNavigate();
  const { threadId } = useParams();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  // The runtime's thread the URL last followed
  const followed = useRef(undefined);
  const restored = useRef(false);


  // Coming back to the chat from another page
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const last = rememberedThread(userId);
    if (!threadId && last) navigate(`/chat/${last}`, { replace: true });
  }, [threadId, userId, navigate]);


  // Only a move of the runtime reaches the URL
  useEffect(() => {
    const previous = followed.current;
    if (remoteId === previous) return;
    followed.current = remoteId;
    if (remoteId) {
      try { localStorage.setItem(LAST_THREAD_KEY + userId, remoteId); } catch { /* storage off */ }
      if (remoteId !== threadId) navigate(`/chat/${remoteId}`, { replace: true });
    } else if (previous) {
      try { localStorage.removeItem(LAST_THREAD_KEY + userId); } catch { /* storage off */ }
      if (threadId) navigate('/', { replace: true });
    }
  }, [remoteId, threadId, userId, navigate]);


  return null;
}







// -----------------------------------------------------------
// LeaveGuard
// -----------------------------------------------------------
//
// While a run is live: leaving the chat page through the
// router asks in a dialog (switching conversations inside the
// chat does not — the other turn keeps running server-side),
// and reload / tab close get the browser's own prompt.
//
// Used by:
//   - Chat (below)
// -----------------------------------------------------------

function LeaveGuard() {

  const t = useTranslations('PAGES.chat.LEAVE');
  const running = useAuiState((s) => s.thread.isRunning);
  const blocker = useBlocker(({ nextLocation }) =>
    running && nextLocation.pathname !== '/' && !nextLocation.pathname.startsWith('/chat/'));


  useEffect(() => {
    if (!running) return undefined;
    const warn = (event) => {
      event.preventDefault();
      // Legacy browsers read the prompt from returnValue
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);


  return (
    <UniversalModal
      role="alertdialog"
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
      title={t('title')}
      confirmLabel={t('leave')}
      cancelLabel={t('stay')}
    >
      <Typography>{t('text')}</Typography>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// ChatHeader
// -----------------------------------------------------------
//
// The strip above the thread: the conversation's title (the
// list's, so a rename shows at once), the "conversations"
// button (only when the list is a drawer: words from sm, the
// icon alone below — same name, same popup) and the company
// button — labelled with the linked company and the role the
// conversation adopts ("UAB … · Atitikties pareigūnas";
// "Company: UAB …, role: …" to a screen reader), "Company"
// while the conversation has none; it opens the panel where
// the link is changed. The label never takes more than half
// the strip and is cut at its end, so the role goes first;
// below sm the role is left out of sight (a phone has the
// room for the company alone) but stays in the button's
// accessible name and in its tooltip.
//
// Used by:
//   - Chat (below)
// -----------------------------------------------------------

function ChatHeader({ listIsDrawer, onOpenList, panelOpen, onTogglePanel }) {

  const t = useTranslations('PAGES.chat');
  const title = useAuiState((s) => s.threadListItem.title);
  const roomy = useMediaQuery(ROOMY);
  const { company, role } = linkedNames(useThreadRow().data);
  const name = role ? t('PANEL.buttonRole', { name: company, role }) : company && t('PANEL.button', { name: company });


  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-edge bg-surface min-h-12">
      {listIsDrawer && (roomy ? (
        <Button size="small" startIcon={<ForumOutlinedIcon />} onClick={onOpenList} aria-haspopup="dialog">
          {t('threads')}
        </Button>
      ) : (
        <IconAction label={t('threads')} icon={<ForumOutlinedIcon fontSize="small" />} onClick={onOpenList} aria-haspopup="dialog" />
      ))}
      <Typography component="h1" variant="subtitle1" className="flex-1 min-w-0 truncate" title={title || t('untitled')}>
        {title || t('untitled')}
      </Typography>
      <Button size="small" startIcon={<BusinessOutlinedIcon />} onClick={onTogglePanel}
              aria-expanded={panelOpen} aria-controls="chat-company-panel"
              aria-label={name || undefined} title={company ? [company, role].filter(Boolean).join(' · ') : undefined}
              className="min-w-0 shrink max-w-[50%]">
        <span className="truncate">
          {company ?? t('PANEL.title')}
          {role && <span className="hidden sm:inline"> · {role}</span>}
        </span>
      </Button>
    </div>
  );
}







// -----------------------------------------------------------
// Chat (default export)
// -----------------------------------------------------------
//
// The app frame around the runtime provider, the list, the
// thread and the company panel; the URL's threadId opens that
// conversation. The frame ends with the copyright band where
// the sidebar is a column; a phone, whose screen the thread
// fills, has none here.
//
// Used by:
//   - router.jsx — the index route and /chat/:threadId
// -----------------------------------------------------------

export default function Chat({ authData }) {

  const t = useTranslations('PAGES.chat');
  const tCommon = useTranslations('COMPONENTS.common');
  const navigate = useNavigate();
  const { threadId } = useParams();
  const wide = useMediaQuery('(min-width:1024px)');
  const extraWide = useMediaQuery('(min-width:1200px)');
  const [listOpen, setListOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem(PANEL_KEY) === 'open'; } catch { return false; }
  });


  // A link to a conversation that is gone: back to a fresh one
  const onMissingThread = useCallback(() => {
    try { localStorage.removeItem(LAST_THREAD_KEY + authData.id); } catch { /* storage off */ }
    toast(t('threadNotFound'), { id: 'chat-thread-missing' });
    navigate('/', { replace: true });
  }, [authData.id, navigate, t]);


  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    if (extraWide) {
      try { localStorage.setItem(PANEL_KEY, next ? 'open' : 'closed'); } catch { /* storage off */ }
    }
  };


  return (
    <div className="h-dvh flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[2000] focus:bg-surface focus:px-3 focus:py-2 focus:rounded focus:shadow-float">
        {tCommon('skipToContent')}
      </a>
      <Navbar authData={authData} />
      <div className="flex flex-1 min-h-0">
        <Sidebar authData={authData} />
        <ChatRuntime threadId={threadId} onMissingThread={onMissingThread}>
          <UrlSync userId={authData.id} />
          <LeaveGuard />
          <RunRefresh />

          {/* The conversation list — a column from lg, a drawer below */}
          {wide ? (
            <ThreadList />
          ) : (
            <Drawer open={listOpen} onClose={() => setListOpen(false)} slotProps={{ paper: { className: 'w-72 max-w-[85vw]' } }}>
              <ThreadList onNavigate={() => setListOpen(false)} />
            </Drawer>
          )}

          <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 flex flex-col bg-surface outline-none">
            <ChatHeader listIsDrawer={!wide} onOpenList={() => setListOpen(true)}
                        panelOpen={panelOpen} onTogglePanel={togglePanel} />
            <div className="flex-1 min-h-0"><Thread /></div>
          </main>

          {/* The company panel — a column on wide screens, a drawer below */}
          {extraWide ? (
            panelOpen && <CompanyPanel userId={authData.id} onClose={togglePanel} />
          ) : (
            <Drawer anchor="right" open={panelOpen} onClose={() => setPanelOpen(false)}
                    slotProps={{ paper: { className: 'w-96 max-w-[92vw]' } }}>
              <CompanyPanel userId={authData.id} onClose={() => setPanelOpen(false)} />
            </Drawer>
          )}
        </ChatRuntime>
      </div>
      <PageFooter className="hidden md:block" />
    </div>
  );
}
