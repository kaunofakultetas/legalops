// -----------------------------------------------------------
//  [*] Chat — the conversation list
//
//  The left panel (a column from 1024 px, the content of a
//  drawer below): a "new conversation" button, a loading skeleton, an
//  empty state, and one row per thread (the title Django gave
//  it, or the user's own). Each row can be:
//
//    - renamed — a small dialog with the title (Enter saves,
//      Escape cancels, a blank title is refused, at most the
//      200 characters Django keeps); the row and the chat
//      header change at once, Django gets PATCH {title}, and
//      the automatic first-turn title never replaces it;
//    - removed — asked first: Django archives it and has no
//      way back from the GUI, so an undo would promise too
//      much.
//
//  Both buttons are always reachable by keyboard (shown on
//  hover, focus and on touch screens). The list keeps its
//  place (useKeptScroll): the phone drawer unmounts it when
//  it closes and leaving the chat unmounts the column, yet
//  it opens again where it was left.
//
//  As a column its right edge is dragged to make it wider or
//  narrower — between 208 and 480 px, and never more than 35%
//  of the window, so the thread keeps its room — and the
//  width is remembered; a double click on the edge puts it
//  back, and the keyboard moves it too (WidthHandle). The
//  drawer keeps its own width.
//
//  Split into (root component last):
//
//    PickContext    — "a row was picked" (closes the drawer)
//    REVEAL         — the row buttons' show-on-hover classes
//    MAX_TITLE      — the longest title Django keeps
//    WIDTH_KEY      — the column width's localStorage key
//    WIDTH          — the column's start, bounds and step
//    ThreadSkeleton — three placeholder rows while loading
//    RenameDialog   — the title field and its save
//    RenameButton   — the pencil icon + its dialog
//    ArchiveButton  — the remove icon + its confirmation
//    ThreadRow      — one conversation
//    clampWidth     — a width inside the bounds
//    readWidth      — the stored width
//    useListWidth   — the width, followed and stored
//    WidthHandle    — the draggable edge, a splitter
//    ThreadList     — the panel (default export)
// -----------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { ThreadListItemPrimitive, ThreadListPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useKeptScroll from '@/hooks/useKeptScroll';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { useChatState } from '@/pages/Chat/ChatRuntime';


// Called after a row or "new" was picked — the drawer closes;
// a context, so the row component stays a static reference
const PickContext = createContext(null);

// The row buttons take no room until the row is hovered or
// focused, so a title runs to the row's edge and is cut
// shorter only while the buttons show beside it — which on a
// touch screen (no hover) is always
const REVEAL = 'flex shrink-0 w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100 '
  + 'group-focus-within:w-auto group-focus-within:overflow-visible group-focus-within:opacity-100 '
  + '[@media(hover:none)]:w-auto [@media(hover:none)]:overflow-visible [@media(hover:none)]:opacity-100';

// Django keeps the first 200 characters of a title
// (chat/api/views.py thread_item) — the field stops there
const MAX_TITLE = 200;

// localStorage key of the column's width, in px
const WIDTH_KEY = 'chat.listWidth';

// The column's width in px: where it starts (Tailwind's
// w-64), its bounds and one arrow-key step; `share` caps it
// at that part of the window
const WIDTH = { start: 256, min: 208, max: 480, share: 0.35, step: 16 };







// -----------------------------------------------------------
// ThreadSkeleton
// -----------------------------------------------------------
//
// Placeholder rows while the first list loads; announced as
// busy so a screen reader does not read "no conversations".
//
// Used by:
//   - ThreadList (below)
// -----------------------------------------------------------

function ThreadSkeleton({ label }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="px-2 py-1 space-y-2">
      {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={28} />)}
    </div>
  );
}







// -----------------------------------------------------------
// RenameDialog
// -----------------------------------------------------------
//
// The row's title in a field, selected whole; Enter submits
// the form, Escape closes the dialog. A blank title is
// refused, the field stops at MAX_TITLE (a longer value that
// got in anyway is refused, never cut), an unchanged title
// closes without a request. The thread is first marked as
// titled by the user (userTitles) — a first-turn title whose
// read is already under way then cannot replace it — and the
// title goes through the thread list item: the row and the
// chat header show it at once, the adapter PATCHes it. A
// refused save puts the old title back and says why inside
// the dialog (the PATCH is silent — no toast on top).
//
// Used by:
//   - RenameButton (below) — mounted afresh per opening
// -----------------------------------------------------------

function RenameDialog({ open, onClose }) {

  const t = useTranslations('PAGES.chat.RENAME');
  const tCommon = useTranslations('COMPONENTS.common');
  const describe = useErrorMessage();
  const aui = useAui();
  const { userTitles } = useChatState();
  const title = useAuiState((s) => s.threadListItem.title) ?? '';
  const [value, setValue] = useState(title);
  const [invalid, setInvalid] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);


  const save = async () => {
    const next = value.trim();
    if (!next || next.length > MAX_TITLE) {
      setInvalid(next ? tCommon('tooLong', { max: MAX_TITLE }) : tCommon('required'));
      return;
    }
    if (next === title) {
      onClose();
      return;
    }
    setBusy(true);
    setFailure(null);
    let marked = null;
    try {
      // The remote id — a row created a moment ago may still
      // be waiting for it
      const { remoteId } = await aui.threadListItem().initialize();
      if (!userTitles.has(remoteId)) marked = remoteId;
      userTitles.add(remoteId);
      await aui.threadListItem().rename(next);
      onClose();
    } catch (error) {
      // Not a title the user set after all — unless an
      // earlier rename made it one
      if (marked) userTitles.delete(marked);
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={save} busy={busy} title={t('title')}
                    confirmLabel={tCommon('save')} error={failure ? describe(failure) : null}>
      <TextField autoFocus fullWidth margin="dense" label={t('label')} value={value}
                 onChange={(event) => { setValue(event.target.value); setInvalid(null); }}
                 onFocus={(event) => event.target.select()}
                 error={Boolean(invalid)} helperText={invalid ?? tCommon('characters', { count: value.length, max: MAX_TITLE })}
                 slotProps={{ htmlInput: { maxLength: MAX_TITLE } }} />
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// RenameButton
// -----------------------------------------------------------
//
// The pencil icon of one row ("Rename conversation: <title>"
// to a screen reader) and its dialog — a fresh one for every
// opening, so the field starts from the title as it is then.
//
// Used by:
//   - ThreadRow (below)
// -----------------------------------------------------------

function RenameButton() {

  const t = useTranslations('PAGES.chat');
  const title = useAuiState((s) => s.threadListItem.title) || t('untitled');
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);


  const start = () => {
    setOpening((count) => count + 1);
    setOpen(true);
  };


  return (
    <>
      <Tooltip title={t('renameThread')} describeChild>
        <IconButton size="small" aria-label={`${t('renameThread')}: ${title}`} onClick={start}>
          <EditOutlinedIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
      <RenameDialog key={opening} open={open} onClose={() => setOpen(false)} />
    </>
  );
}







// -----------------------------------------------------------
// ArchiveButton
// -----------------------------------------------------------
//
// The trash icon of one row and the "remove this
// conversation?" dialog; confirming archives it through the
// thread list item (the adapter DELETEs it in Django). A
// refused DELETE keeps the dialog open: the api client has
// toasted why, and assistant-ui puts the row back.
//
// Used by:
//   - ThreadRow (below)
// -----------------------------------------------------------

function ArchiveButton() {

  const t = useTranslations('PAGES.chat');
  const aui = useAui();
  const title = useAuiState((s) => s.threadListItem.title) || t('untitled');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);


  const confirm = async () => {
    setBusy(true);
    try {
      await aui.threadListItem().archive();
      setOpen(false);
    } catch {
      // Toasted by the api client — nothing may escape the
      // click handler as an unhandled rejection
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      <Tooltip title={t('archiveThread')} describeChild>
        <IconButton size="small" aria-label={`${t('archiveThread')}: ${title}`} onClick={() => setOpen(true)}>
          <DeleteOutlineIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
      <UniversalModal open={open} onClose={() => setOpen(false)} onConfirm={confirm} busy={busy} danger
                      title={t('archiveTitle')} confirmLabel={t('archiveConfirm')}>
        <Typography>{t('archiveText', { title })}</Typography>
      </UniversalModal>
    </>
  );
}







// -----------------------------------------------------------
// ThreadRow
// -----------------------------------------------------------
//
// Title ("Naujas pokalbis" until Django or the user names
// it), the rename and the remove buttons — out of the
// title's way until the row is hovered or focused; the active
// row is tinted and marked with aria-current. A pick also tells
// PickContext (the drawer closes).
//
// Used by:
//   - ThreadList (below) — ThreadListPrimitive.Items
// -----------------------------------------------------------

function ThreadRow() {
  const t = useTranslations('PAGES.chat');
  const onPick = useContext(PickContext);
  const active = useAuiState((s) => s.threadListItem.id === s.threads.mainThreadId);
  return (
    <ThreadListItemPrimitive.Root
      className="group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-canvas data-[active]:bg-primary-light/12 data-[active]:text-primary data-[active]:font-semibold">
      <ThreadListItemPrimitive.Trigger aria-current={active ? 'page' : undefined} onClick={onPick ?? undefined}
                                       className="flex-1 min-w-0 text-left text-sm truncate cursor-pointer py-1 rounded focus-visible:outline-2 focus-visible:outline-primary">
        <ThreadListItemPrimitive.Title fallback={t('untitled')} />
      </ThreadListItemPrimitive.Trigger>
      <span className={REVEAL}>
        <RenameButton />
        <ArchiveButton />
      </span>
    </ThreadListItemPrimitive.Root>
  );
}







// -----------------------------------------------------------
// clampWidth
// -----------------------------------------------------------
//
// A width inside the bounds, in whole pixels: never under the
// minimum, never over the maximum nor over its share of the
// window as it is now (on a window too narrow for both, the
// minimum wins).
//
// Used by:
//   - readWidth, WidthHandle (below)
// -----------------------------------------------------------

function clampWidth(width) {
  const max = Math.max(WIDTH.min, Math.min(WIDTH.max, Math.round(window.innerWidth * WIDTH.share)));
  return Math.round(Math.min(Math.max(width, WIDTH.min), max));
}







// -----------------------------------------------------------
// readWidth
// -----------------------------------------------------------
//
// The stored width, fitted to the window the chat opens in;
// the starting width when nothing usable is stored, or the
// storage is off (a private window).
//
// Used by:
//   - useListWidth (below)
// -----------------------------------------------------------

function readWidth() {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored > 0 ? clampWidth(stored) : WIDTH.start;
  } catch {
    return WIDTH.start;
  }
}







// -----------------------------------------------------------
// useListWidth
// -----------------------------------------------------------
//
// The column's width and the two ways to change it: `resize`
// follows a drag move by move, `commit` settles a width and
// stores it — once when a drag ends, and on every key press.
//
// Used by:
//   - ThreadList (below)
// -----------------------------------------------------------

function useListWidth() {

  const [width, setWidth] = useState(readWidth);


  const commit = useCallback((next) => {
    setWidth(next);
    try { localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* storage off */ }
  }, []);


  return { width, resize: setWidth, commit };
}







// -----------------------------------------------------------
// WidthHandle
// -----------------------------------------------------------
//
// The column's right edge as the WAI-ARIA window splitter: a
// focusable separator valued in pixels, named, and pointing
// at the list it sizes (`controls`). Dragged with a mouse, a
// pen or a finger, it follows the pointer — the moves are
// read on the window, so the pointer may stray off the thin
// edge — and the width is stored when it is let go; while it
// is dragged the whole page shows the resize cursor and no
// text gets selected. The arrow keys move it a step, Home
// and End to its bounds, and a double click puts it back
// where it started. An 8 px strip straddles the border, its
// line in the brand blue under the pointer and in ink while
// dragged or focused.
//
// Used by:
//   - ThreadList (below) — the column, not the drawer
// -----------------------------------------------------------

function WidthHandle({ width, controls, onResize, onCommit }) {

  const t = useTranslations('PAGES.chat');
  const [dragging, setDragging] = useState(false);
  const stopRef = useRef(null);


  // A drag the page leaves mid-way still lets go
  useEffect(() => () => stopRef.current?.(), []);


  const startDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const from = event.clientX;
    const page = document.body.style;
    let next = width;
    const move = (moveEvent) => {
      next = clampWidth(width + moveEvent.clientX - from);
      onResize(next);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      page.cursor = '';
      page.userSelect = '';
      stopRef.current = null;
      setDragging(false);
      onCommit(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    page.cursor = 'col-resize';
    page.userSelect = 'none';
    stopRef.current = stop;
    setDragging(true);
  };


  const onKeyDown = (event) => {
    const targets = { ArrowLeft: width - WIDTH.step, ArrowRight: width + WIDTH.step, Home: WIDTH.min, End: WIDTH.max };
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    onCommit(clampWidth(targets[event.key]));
  };


  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('resizeThreads')}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={WIDTH.min}
      aria-valuemax={clampWidth(WIDTH.max)}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(clampWidth(WIDTH.start))}
      className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none"
    >
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 transition-colors group-hover:bg-primary-light group-focus-visible:bg-primary group-data-[dragging]:bg-primary" />
    </div>
  );
}







// -----------------------------------------------------------
// ThreadList (default export)
// -----------------------------------------------------------
//
// Without `onNavigate` the panel is the column (from 1024
// px), sized by its edge; inside the drawer `onNavigate`
// closes the drawer once a row or "new" is picked.
//
// The new-conversation button over the rows, the skeleton
// while the first page loads, the empty state after. The
// panel is a named navigation landmark ("Conversations") —
// an aria-label on a plain div would be ignored. The rows'
// scroller keeps its place ("chat.threads") in the column
// and the drawer alike.
//
// Used by:
//   - Chat.jsx
// -----------------------------------------------------------

export default function ThreadList({ onNavigate = null }) {

  const t = useTranslations('PAGES.chat');
  const loading = useAuiState((s) => s.threads.isLoading);
  const count = useAuiState((s) => s.threads.threadIds.length);
  const inDrawer = Boolean(onNavigate);
  const listId = useId();
  const { width, resize, commit } = useListWidth();
  const rowsRef = useRef(null);
  useKeptScroll(rowsRef, 'chat.threads');


  return (
    <ThreadListPrimitive.Root render={<nav />} id={listId} aria-label={t('threads')}
                              className={`flex flex-col bg-surface ${inDrawer ? 'h-full w-full' : 'relative shrink-0 max-w-[35vw] border-r border-edge'}`}
                              style={inDrawer ? undefined : { width }}>
      <div className="p-3 border-b border-edge">
        <ThreadListPrimitive.New asChild>
          <Button fullWidth variant="outlined" startIcon={<AddIcon />} onClick={onNavigate ?? undefined}>{t('newThread')}</Button>
        </ThreadListPrimitive.New>
      </div>
      <Typography variant="overline" component="h2" className="px-4 pt-3 pb-0.5 text-muted">{t('threads')}</Typography>
      <div ref={rowsRef} className="relative flex-1 overflow-y-auto px-2 pb-2">
        {loading && count === 0 && <ThreadSkeleton label={t('threadsLoading')} />}
        {!loading && count === 0 && (
          <div className="flex flex-col items-center text-center gap-1 px-3 py-6 text-muted">
            <ForumOutlinedIcon aria-hidden />
            <Typography variant="body2">{t('noThreads')}</Typography>
            <Typography variant="caption">{t('noThreadsHint')}</Typography>
          </div>
        )}
        <PickContext.Provider value={onNavigate}>
          <ThreadListPrimitive.Items components={{ ThreadListItem: ThreadRow }} />
        </PickContext.Provider>
      </div>
      {!inDrawer && <WidthHandle width={width} controls={listId} onResize={resize} onCommit={commit} />}
    </ThreadListPrimitive.Root>
  );
}
