// -----------------------------------------------------------
//  [*] Chat — the composer
//
//  The input row at the bottom of the thread: attachment
//  chips above the textarea, the attach button (file picker),
//  a real drop zone (the whole composer; it highlights while a
//  file is dragged over it), and send / stop. Under it, one
//  row: the AI notice in the middle (AI Act Art. 50
//  transparency — a short line, its info icon opening the
//  full text) and the conversation's model on the right
//  (ModelPicker.jsx).
//
//  Behaviour worth knowing:
//
//    - the textarea has a real (visually hidden) label; it is
//      autofocused only on devices with a hover pointer — on a
//      phone it would pop the keyboard open over the thread;
//    - send is visibly disabled while there is nothing to send;
//    - while an answer is being written Enter does nothing —
//      no second send, and no line break either (assistant-ui
//      lets the key through as one); Shift+Enter still
//      breaks the line. The inline message editor
//      (Messages.jsx) holds Enter through the same hook
//      (useHoldEnter);
//    - nothing can be typed or sent while the conversation's
//      history is still loading — a message sent then went out
//      without its parent (the assistant answered with no
//      history) and vanished when the history arrived;
//    - stop aborts the answer AND tells the server (see
//      ChatRuntime's transport) — the partial reply is kept;
//    - an attachment chip shows the upload progress, then the
//      document's state; only its delete icon removes it. The
//      inline message editor (Messages.jsx) shows the
//      documents a message already carries with the same
//      chip — "stays with the message";
//    - a file the chat does not take is never dropped without
//      a word. assistant-ui refuses a type outside CHAT_ACCEPT
//      before the adapter sees it and says nothing — picked
//      (the dialog switched to "All files"), dropped or
//      pasted — so every batch is screened here first and the
//      refused files are named in the banner ("Not
//      attached"); a file over 50 MB is refused, and named,
//      by the adapter (ChatRuntime). The limit is in the
//      attach button's tooltip and description and in the
//      drop overlay.
//
//  Split into (root component last):
//
//    canHover        — hover-pointer device?
//    useHoldEnter    — Enter does nothing while answering
//                      (named export)
//    ComposerButton  — icon button with tooltip + label
//    AttachButton    — the file picker, screened
//    attachmentName  — what a chip calls its document
//    AttachmentChip  — one document of a message being
//                      written or edited (named export)
//    AiNotice        — the transparency line + its dialog
//    Composer        — the field and the row under it
//                      (default export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the inline message editor shares the composer's Enter hold
   (and its attachment chip) */

import { useCallback, useId, useState } from 'react';
import { AttachmentPrimitive, AuiIf, ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import { useTranslations } from '@/i18n';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { CHAT_ACCEPT, MAX_DOCUMENT_BYTES } from '@/constants/uploads';
import { screenFiles } from '@/utils/files';
import { useFormat } from '@/utils/format';
import { useChatState } from '@/pages/Chat/ChatRuntime';
import ModelPicker from '@/pages/Chat/ModelPicker';







// -----------------------------------------------------------
// canHover
// -----------------------------------------------------------
//
// True on devices with a hover-capable pointer (desktops) —
// the ones where autofocus does not summon a keyboard.
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function canHover() {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
}







// -----------------------------------------------------------
// useHoldEnter
// -----------------------------------------------------------
//
//   const holdEnter = useHoldEnter();
//   <ComposerPrimitive.Input onKeyDown={holdEnter} … />
//
// The keydown handler of both message inputs: while an
// answer is being written, Enter does nothing. It runs
// before assistant-ui's own keydown, which refuses to send
// then but lets the key through as a line break — this one
// cancels the key, and with it that handler. The state is
// read at the keypress, not from the last render.
// Shift+Enter still breaks the line, and an IME composing a
// word keeps its Enter (it commits the word).
//
// Used by:
//   - Composer (below) — the message input
//   - Messages.jsx — UserEditComposer, the inline editor
// -----------------------------------------------------------

export function useHoldEnter() {
  const aui = useAui();
  return useCallback((event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (aui.thread().getState().isRunning) event.preventDefault();
  }, [aui]);
}







// -----------------------------------------------------------
// ComposerButton
// -----------------------------------------------------------
//
// An icon button named by its own aria-label. The tooltip
// does not open on focus: the file dialog hands focus back to
// the attach button, and a focus tooltip would then stick.
// A `hint` joins the tooltip and describes the button to a
// screen reader (aria-describedby) — the name stays the
// label. Passes every other prop on (it is the asChild
// target of the composer primitives — onClick, disabled,
// ref).
//
// Used by:
//   - AttachButton, Composer (below)
// -----------------------------------------------------------

function ComposerButton({ label, hint, children, ...rest }) {
  const hintId = useId();
  return (
    <Tooltip title={hint ? `${label} — ${hint}` : label} describeChild disableFocusListener disableInteractive>
      <span className="inline-flex">
        <IconButton aria-label={label} aria-describedby={hint ? hintId : undefined} {...rest}>{children}</IconButton>
        {hint && <span id={hintId} className="sr-only">{hint}</span>}
      </span>
    </Tooltip>
  );
}







// -----------------------------------------------------------
// AttachButton
// -----------------------------------------------------------
//
// The paper clip. It opens the picker the way assistant-ui's
// AddAttachment does — a fresh hidden input per click,
// appended to the body, filtered to CHAT_ACCEPT, several
// files at once, taken away again when the dialog is
// cancelled — but hands the choice to `onFiles` instead of
// adding it: that primitive drops a file of another type (the
// dialog switched to "All files") without a word.
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function AttachButton({ label, hint, onFiles }) {

  const editing = useAuiState((s) => s.composer.isEditing);


  const open = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;
    input.accept = CHAT_ACCEPT;
    document.body.appendChild(input);
    input.onchange = () => {
      const files = Array.from(input.files || []);
      input.remove();
      onFiles(files);
    };
    input.oncancel = () => input.remove();
    input.click();
  };


  return (
    <ComposerButton label={label} hint={hint} size="small" disabled={!editing} onClick={open} data-testid="composer-attach">
      <AttachFileOutlinedIcon />
    </ComposerButton>
  );
}







// -----------------------------------------------------------
// attachmentName
// -----------------------------------------------------------
//
//   attachmentName(s.attachment) → 'politika.pdf'
//
// The name a chip shows: the title the attachment's
// data-document part carries, else its own name. A document
// the inline editor takes over from a sent message comes
// back from assistant-ui named after the part ("document"),
// its title only in the part; a file picked, dropped or
// pasted into the composer is named after the file.
//
// Used by:
//   - AttachmentChip (below)
// -----------------------------------------------------------

function attachmentName(attachment) {
  const parts = Array.isArray(attachment?.content) ? attachment.content : [];
  const title = parts.find((part) => part?.type === 'data' && part.name === 'document')?.data?.title;
  return typeof title === 'string' && title ? title : String(attachment?.name ?? '');
}







// -----------------------------------------------------------
// AttachmentChip
// -----------------------------------------------------------
//
// One document of the message: its name, then the upload
// progress, a failure note, "ready" for a fresh upload, or
// "stays with the message" for a document the message
// already carried (the inline editor's — assistant-ui marks
// those complete). The delete icon (only it) removes it: a
// fresh upload is deleted with it, while a carried document
// only leaves the edited message — the document itself, and
// the original message, keep it.
//
// Used by:
//   - Composer (below) — ComposerPrimitive.Attachments
//   - Messages.jsx — UserEditComposer, the documents of the
//     message being edited
// -----------------------------------------------------------

export function AttachmentChip() {

  const t = useTranslations('PAGES.chat.ATTACHMENT');
  const name = useAuiState((s) => attachmentName(s.attachment));
  const status = useAuiState((s) => s.attachment.status);
  const uploading = status?.type === 'running';
  const failed = status?.type === 'incomplete';
  const carried = status?.type === 'complete';
  const percent = uploading && status.progress != null ? Math.round(status.progress * 100) : null;


  return (
    <AttachmentPrimitive.Root className={`inline-flex flex-col gap-1 rounded-lg border px-2 py-1 max-w-64 bg-surface ${failed ? 'border-red-300' : 'border-edge'}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {failed
          ? <ErrorOutlineIcon sx={{ fontSize: 16 }} className="text-red-700" aria-hidden />
          : <DescriptionOutlinedIcon sx={{ fontSize: 16 }} className="text-muted" aria-hidden />}
        <span className="text-sm truncate" title={name}>{name}</span>
        <AttachmentPrimitive.Remove asChild>
          <IconButton size="small" aria-label={t('remove', { name })} title={t('remove', { name })}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </AttachmentPrimitive.Remove>
      </div>
      <div className="text-xs text-muted" role="status">
        {uploading && (percent != null ? t('uploading', { percent }) : t('uploadingIndeterminate'))}
        {failed && <span className="text-red-800">{t('failed')}</span>}
        {!uploading && !failed && (carried ? t('kept') : t('ready'))}
      </div>
      {uploading && <LinearProgress variant={percent != null ? 'determinate' : 'indeterminate'} value={percent ?? 0} aria-hidden />}
    </AttachmentPrimitive.Root>
  );
}







// -----------------------------------------------------------
// AiNotice
// -----------------------------------------------------------
//
// "AI can make mistakes" with the info icon before it, in the
// middle of the row under the message field. It is short
// enough to stay for good, so it cannot be hidden; the icon
// opens the full notice (what the assistant is, that
// documents go to the university's AI gateway).
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function AiNotice() {

  const t = useTranslations('PAGES.chat.NOTICE');
  const [open, setOpen] = useState(false);


  return (
    <div className="col-start-2 flex items-center gap-0.5 text-xs text-muted">
      <IconButton size="small" aria-label={t('open')} title={t('open')} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <span>{t('short')}</span>
      <UniversalModal open={open} onClose={() => setOpen(false)} title={t('title')} cancelLabel={t('close')}>
        <Typography className="whitespace-pre-line">{t('full')}</Typography>
      </UniversalModal>
    </div>
  );
}







// -----------------------------------------------------------
// Composer (default export)
// -----------------------------------------------------------
//
// Enter sends, Shift+Enter breaks a line (assistant-ui's
// default); while streaming the stop button replaces send
// and Enter is a no-op (useHoldEnter); the input and send
// wait for the history to load.
//
// Used by:
//   - Thread.jsx
// -----------------------------------------------------------

export default function Composer() {

  const t = useTranslations('PAGES.chat');
  const aui = useAui();
  const inputId = useId();
  const [autoFocus] = useState(canHover);
  const loading = useAuiState((s) => s.thread.isLoading);
  const { reportRefused } = useChatState();
  const limit = useFormat().bytes(MAX_DOCUMENT_BYTES);
  const holdEnter = useHoldEnter();


  // Names the files of a batch whose type assistant-ui will
  // refuse in silence (a drop and a paste are screened on the
  // way to it, a pick before it). The sizes are the adapter's
  // to judge: every file the runtime lets through reaches it
  const nameRefused = (list) => {
    const { refused } = screenFiles(Array.from(list || []), { accept: CHAT_ACCEPT });
    if (refused.length > 0) reportRefused(refused);
  };


  // A pick then goes the way of a drop: every file to the
  // runtime, which drops the refused ones (already named)
  const pick = (files) => {
    nameRefused(files);
    files.forEach(async (file) => {
      try {
        await aui.composer.addAttachment(file);
      } catch {
        // refused — the banner names it already
      }
    });
  };


  return (
    <ComposerPrimitive.Root className="chat-column mx-auto w-full px-3 sm:px-4 pt-2 pb-3">
      <ComposerPrimitive.AttachmentDropzone
        onDropCapture={(event) => nameRefused(event.dataTransfer?.files)}
        className="group/drop relative rounded-lg data-[dragging=true]:outline-2 data-[dragging=true]:outline-dashed data-[dragging=true]:outline-primary">
        <div className="flex flex-wrap gap-2 mb-2 empty:hidden">
          <ComposerPrimitive.Attachments components={{ Attachment: AttachmentChip }} />
        </div>
        <div className="flex items-end gap-1 bg-surface border border-field rounded-lg px-2 py-1.5 shadow-float transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <AttachButton label={t('attach')} hint={t('attachHint', { limit })} onFiles={pick} />
          <label htmlFor={inputId} className="sr-only">{t('inputLabel')}</label>
          <ComposerPrimitive.Input id={inputId} rows={1} autoFocus={autoFocus} placeholder={t('placeholder')} disabled={loading}
                                   onKeyDown={holdEnter} onPaste={(event) => nameRefused(event.clipboardData?.files)}
                                   className="flex-1 min-w-0 resize-none bg-transparent text-base leading-relaxed focus:outline-none max-h-52 py-1.5 placeholder:text-muted" />
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send asChild disabled={loading}>
              <ComposerButton label={t('send')} size="small" color="primary" data-testid="composer-send"
                              className="bg-primary text-white hover:bg-primary-dark disabled:bg-transparent disabled:text-muted">
                <SendOutlinedIcon fontSize="small" />
              </ComposerButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <ComposerButton label={t('stop')} size="small" color="delete" data-testid="composer-stop"><StopCircleOutlinedIcon /></ComposerButton>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-lg bg-surface/90 text-sm text-primary font-medium group-data-[dragging=true]/drop:flex">
          {t('dropHere', { limit })}
        </div>
      </ComposerPrimitive.AttachmentDropzone>
      {/* The outer columns share the room equally, so the notice
          sits in the middle; a model's name wider than its share
          (on a phone) takes what it needs from the empty left one */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1">
        <AiNotice />
        <div className="col-start-3 justify-self-end">
          <ModelPicker />
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
