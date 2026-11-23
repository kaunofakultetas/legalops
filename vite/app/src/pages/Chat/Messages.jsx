// -----------------------------------------------------------
//  [*] Chat — the messages
//
//  The renderers ThreadPrimitive.Messages mounts: the
//  assistant's reply (markdown set on the page, tool pills
//  and cards, copy / regenerate), the user's bubble (plain
//  text, document chips, edit) and the inline editor.
//
//  Behaviour worth knowing:
//
//    - no empty replies: an assistant message without text or
//      tools shows the thinking dots while running and, once
//      over, only its note ("Atsakymas sustabdytas." …);
//    - the note comes from the stored reply's metadata.status
//      (stopped, interrupted, timeout, error, budget) after a
//      reload, else from the live status (stopped — also when
//      the stop cut a tool call — or failed);
//    - a document attached to a message is a chip (title and
//      size), never the model-facing line with its id; old
//      messages that carry that line are shown as a chip too;
//    - the action bars are keyboard-reachable: shown on hover,
//      on focus inside the message, and always on touch
//      screens; every icon button has its own label;
//    - the inline editor does nothing on Enter while an
//      answer is being written, like the composer; it shows
//      the documents the message carries as the composer's
//      chips (one removed there leaves the edited message
//      only) and takes no new ones — a file pasted into it
//      does nothing;
//    - markdown goes through the shared safe renderer (links
//      in a new tab without referrer, images as links, wide
//      tables scroll, only http(s)/mailto URLs).
//
//  Split into (root component last):
//
//    LEGACY_MARKER     — the old attachment line, parsed
//    TOOL_CARDS        — the tools with a card of their own
//    NOTED / REVEAL    — the noted endings, the reveal classes
//    ActionButton      — icon button with tooltip + label
//    BouncingDots      — the "thinking" indicator
//    EmptyReply        — dots while running, nothing after
//    AssistantText     — markdown renderer
//    DocumentChip      — one attached document
//    DocumentPart      — the data-document part → a chip
//    UserText          — plain text (or a legacy marker chip)
//    ReplyNote         — stopped / failed / timed-out note
//    BranchPicker      — ← 1 / 2 → for edited messages
//    UserEditComposer  — inline edit form (named export)
//    AssistantMessage  — the assistant's reply (named export)
//    UserMessage       — the user's bubble (named export)
// -----------------------------------------------------------

import {
  ActionBarPrimitive, AuiIf, BranchPickerPrimitive, ComposerPrimitive, MessagePrimitive, useAuiState, useMessagePartText,
} from '@assistant-ui/react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import Markdown from '@/components/Markdown/Markdown';
import { Mark } from '@/components/layout/Wordmark';
import { AttachmentChip, useHoldEnter } from '@/pages/Chat/Composer';
import { ActionsToolCard, CorpusToolCard, EstimateToolCard, ProductToolCard, ReportToolCard, ToolPill } from '@/pages/Chat/ToolCards';


// The line older builds put into the user's message for an
// attachment: 'Įkėliau dokumentą: "title" (document id …; …).'
const LEGACY_MARKER = /^(?:Įkėliau dokumentą|I attached a document): "(.+)" \(document id ([\w-]+); ([^)]*)\)\.?$/;

// Tools with their own rendering; everything else is a pill
const TOOL_CARDS = {
  runComplianceAnalysis: ReportToolCard,
  approveReportScope: ReportToolCard,
  getReport: ReportToolCard,
  searchLegalCorpus: CorpusToolCard,
  getLegalProvision: CorpusToolCard,
  checkCitations: CorpusToolCard,
  estimateAnalysisCost: EstimateToolCard,
  startWorkProduct: ProductToolCard,
  getWorkProduct: ProductToolCard,
  getActionRegister: ActionsToolCard,
};

// The live (status) or stored (metadata) reply states that
// get a note under the reply
const NOTED = new Set(['stopped', 'interrupted', 'timeout', 'error', 'budget']);

// Reveal classes of an action bar: hover, focus inside, and
// always on devices without hover
const REVEAL = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity';







// -----------------------------------------------------------
// ActionButton
// -----------------------------------------------------------
//
// An icon button whose accessible name is its own aria-label
// (not the tooltip's wrapper). Used as the asChild target of
// assistant-ui primitives, so it passes every prop it is given
// (onClick, disabled, ref) on to the IconButton.
//
// Used by:
//   - BranchPicker, AssistantMessage, UserMessage (below)
// -----------------------------------------------------------

function ActionButton({ label, children, ...rest }) {
  return (
    <Tooltip title={label} describeChild disableInteractive>
      <span className="inline-flex">
        <IconButton size="small" aria-label={label} {...rest}>{children}</IconButton>
      </span>
    </Tooltip>
  );
}







// -----------------------------------------------------------
// BouncingDots
// -----------------------------------------------------------
//
// The streaming indicator, with a spoken label; the dots
// rest under reduced motion.
//
// Used by:
//   - EmptyReply (below)
// -----------------------------------------------------------

function BouncingDots() {
  const t = useTranslations('PAGES.chat.REPLY');
  return (
    <div className="flex items-center gap-1.5 py-2" role="status" aria-label={t('thinking')}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-primary/60 animate-[bounce-dot_1.2s_ease-in-out_infinite] motion-reduce:animate-none"
              aria-hidden style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}







// -----------------------------------------------------------
// EmptyReply
// -----------------------------------------------------------
//
// assistant-ui's Empty slot: shown for a message with nothing
// to render yet (or whose last part is a finished tool call);
// dots while the turn runs, nothing once it is over.
//
// Used by:
//   - AssistantMessage (below)
// -----------------------------------------------------------

function EmptyReply({ status }) {
  return status?.type === 'running' ? <BouncingDots /> : null;
}







// -----------------------------------------------------------
// AssistantText
// -----------------------------------------------------------
//
// Markdown through the shared safe renderer at reading size
// (16 px, an open line height — answers run long), with chat
// spacing; an empty text part renders nothing.
//
// Used by:
//   - AssistantMessage (below)
// -----------------------------------------------------------

function AssistantText() {
  const { text } = useMessagePartText();
  if (!text) return null;
  // Table cells keep their words whole — a wide table scrolls
  // inside its own box instead of breaking "Stulpelis" apart.
  // The answer sits right under the conversation's h1, so its
  // "#" becomes h2
  return (
    <Markdown headingOffset={1} className="text-base leading-[1.65] prose-p:my-2.5 prose-li:my-0.5 prose-table:text-sm prose-th:px-2 prose-td:px-2 prose-th:[overflow-wrap:normal] prose-td:[overflow-wrap:normal]">
      {text}
    </Markdown>
  );
}







// -----------------------------------------------------------
// DocumentChip
// -----------------------------------------------------------
//
// One attached document: icon, title and size (or "no text
// extracted") — never its internal id. The size is grouped
// the UI language's way ("12,345" / "12 345").
//
// Used by:
//   - DocumentPart, UserText (below)
// -----------------------------------------------------------

function DocumentChip({ title, charCount, extractionStatus }) {
  const t = useTranslations('PAGES.chat.ATTACHMENT');
  const fmt = useFormat();
  const detail = extractionStatus && extractionStatus !== 'done' ? t('noText')
    : charCount ? t('chars', { count: fmt.number(charCount) }) : null;
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full rounded bg-surface border border-edge px-2 py-1 my-1 text-sm">
      <DescriptionOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
      <span className="sr-only">{t('document')}:</span>
      <span className="truncate">{title}</span>
      {detail && <span className="text-muted text-xs whitespace-nowrap">· {detail}</span>}
    </span>
  );
}







// -----------------------------------------------------------
// DocumentPart
// -----------------------------------------------------------
//
// The data-document part of a user message (see
// ChatRuntime's attachment adapter) as a chip.
//
// Used by:
//   - UserMessage (below) — data.by_name.document
// -----------------------------------------------------------

function DocumentPart({ data }) {
  return <div><DocumentChip title={data?.title || '—'} charCount={data?.charCount} extractionStatus={data?.extractionStatus} /></div>;
}







// -----------------------------------------------------------
// UserText
// -----------------------------------------------------------
//
// Plain text with line breaks kept — user input is never
// markdown. A text part that is exactly an old attachment
// line becomes a chip.
//
// Used by:
//   - UserMessage (below)
// -----------------------------------------------------------

function UserText() {
  const { text } = useMessagePartText();
  const legacy = text.trim().match(LEGACY_MARKER);
  if (legacy) {
    const size = legacy[3].match(/^(\d+) characters extracted$/);
    return <div><DocumentChip title={legacy[1]} charCount={size?.[1]} extractionStatus={size ? 'done' : 'failed'} /></div>;
  }
  return <div className="whitespace-pre-wrap [overflow-wrap:anywhere] text-base leading-relaxed">{text}</div>;
}







// -----------------------------------------------------------
// ReplyNote
// -----------------------------------------------------------
//
// The line under a reply that did not end normally, with an
// icon and words (never colour alone).
//
// Used by:
//   - AssistantMessage (below)
// -----------------------------------------------------------

function ReplyNote({ kind }) {
  const t = useTranslations('PAGES.chat.REPLY');
  return (
    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
      <InfoOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
      <span>{t(kind)}</span>
    </div>
  );
}







// -----------------------------------------------------------
// BranchPicker
// -----------------------------------------------------------
//
// ← n / m → between the versions of an edited or regenerated
// message; hidden with a single branch.
//
// Used by:
//   - AssistantMessage, UserMessage (below)
// -----------------------------------------------------------

function BranchPicker() {
  const t = useTranslations('PAGES.chat');
  return (
    <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-0.5 text-xs text-muted">
      <BranchPickerPrimitive.Previous asChild>
        <ActionButton label={t('previousBranch')}><ChevronLeftIcon fontSize="inherit" /></ActionButton>
      </BranchPickerPrimitive.Previous>
      <span className="tabular-nums"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
      <BranchPickerPrimitive.Next asChild>
        <ActionButton label={t('nextBranch')}><ChevronRightIcon fontSize="inherit" /></ActionButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}







// -----------------------------------------------------------
// UserEditComposer
// -----------------------------------------------------------
//
// Replaces the user bubble while editing; sending creates a
// new branch (the old one stays reachable in the picker).
// Enter behaves as in the composer: it sends, and does
// nothing at all while an answer is being written (the
// composer's useHoldEnter — assistant-ui would break the
// line). The documents the message carries — assistant-ui's
// edit composer takes them over from the message — show as
// the composer's chips ("stays with the message"), so the
// user sees what goes with the edit; one removed there is
// left out of the edited message, and nothing is deleted
// (the original message keeps it). New documents are the
// composer's: there is no attach button here, and
// paste-to-attach is off — the editor has none of the
// composer's screening, and a pasted file used to go with
// the edit unseen.
//
// Used by:
//   - Thread.jsx — ThreadPrimitive.Messages components
// -----------------------------------------------------------

export function UserEditComposer() {
  const t = useTranslations('PAGES.chat');
  const holdEnter = useHoldEnter();
  return (
    <MessagePrimitive.Root className="flex justify-end py-2 px-3 sm:px-4 chat-column w-full mx-auto">
      <ComposerPrimitive.Root className="w-full sm:max-w-[80%] bg-surface border border-primary rounded-lg px-4 py-3">
        <div className="flex flex-wrap gap-2 mb-2 empty:hidden">
          <ComposerPrimitive.Attachments components={{ Attachment: AttachmentChip }} />
        </div>
        <ComposerPrimitive.Input autoFocus aria-label={t('editLabel')} onKeyDown={holdEnter} addAttachmentOnPaste={false}
                                 className="w-full resize-none bg-transparent text-base focus:outline-none min-h-10 max-h-52" />
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-edge">
          <ComposerPrimitive.Cancel asChild><Button size="small">{t('cancel')}</Button></ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild><Button size="small" variant="contained">{t('saveEdit')}</Button></ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}







// -----------------------------------------------------------
// AssistantMessage
// -----------------------------------------------------------
//
// Parts render inline where the model produced them (tool
// cards and pills included). The reply is set as text on the
// page, not in a bubble — an answer reads like a document
// and its tables get the width — signed with the app's mark;
// the text appears only with content or while running, the
// note and the action row (branches, copy, regenerate) below
// it.
//
// Used by:
//   - Thread.jsx — ThreadPrimitive.Messages components
// -----------------------------------------------------------

export function AssistantMessage() {

  const t = useTranslations('PAGES.chat');
  const status = useAuiState((s) => s.message.status);
  const stored = useAuiState((s) => s.message.metadata?.custom?.status);
  const hasContent = useAuiState((s) => s.message.content.some((part) =>
    (part.type === 'text' && part.text.trim()) || part.type === 'tool-call'));
  const running = status?.type === 'running';
  // A turn stopped while a tool ran leaves the call without a
  // result, and assistant-ui marks the message requires-action
  // instead of cancelled (see ToolCards' toolState)
  const live = status?.type === 'incomplete' ? (status.reason === 'cancelled' ? 'stopped' : 'error')
    : status?.type === 'requires-action' ? 'stopped' : null;
  // The stored status knows why a reloaded reply ended; the
  // live one is all a reply of this session has. A turn that
  // failed before a single word (refused, dropped) was not
  // "cut off" — the banner above says why there is no answer
  const kind = [stored, live].find((value) => NOTED.has(value)) ?? null;
  const note = kind === 'error' && !hasContent ? 'failed' : kind;


  return (
    <MessagePrimitive.Root className="flex gap-3 py-3 px-3 sm:px-4 chat-column w-full mx-auto group" data-testid="assistant-message">
      <div className="pt-1"><Mark size={24} /></div>
      <div className="flex-1 min-w-0">
        <span className="sr-only">{t('assistant')}:</span>
        {(hasContent || running) && (
          <div className="[overflow-wrap:anywhere]">
            <MessagePrimitive.Parts components={{
              Text: AssistantText,
              Empty: EmptyReply,
              tools: { by_name: TOOL_CARDS, Fallback: ToolPill },
            }} />
          </div>
        )}
        {note && <ReplyNote kind={note} />}
        {!running && (
          <div className={`mt-1 flex items-center gap-1 ${REVEAL}`}>
            <BranchPicker />
            {hasContent && (
              <ActionBarPrimitive.Copy asChild>
                <ActionButton label={t('copy')}>
                  <AuiIf condition={(s) => !s.message.isCopied}><ContentCopyOutlinedIcon fontSize="inherit" /></AuiIf>
                  <AuiIf condition={(s) => s.message.isCopied}><CheckIcon fontSize="inherit" color="success" /></AuiIf>
                </ActionButton>
              </ActionBarPrimitive.Copy>
            )}
            <ActionBarPrimitive.Reload asChild>
              <ActionButton label={t('regenerate')}><ReplayOutlinedIcon fontSize="inherit" /></ActionButton>
            </ActionBarPrimitive.Reload>
          </div>
        )}
      </div>
    </MessagePrimitive.Root>
  );
}







// -----------------------------------------------------------
// UserMessage
// -----------------------------------------------------------
//
// Right-aligned bubble in a tint of the mark's blue (text
// and document chips) with the branch picker and the edit
// action below it — the question stands apart from the
// answers without out-shouting them.
//
// Used by:
//   - Thread.jsx — ThreadPrimitive.Messages components
// -----------------------------------------------------------

export function UserMessage() {
  const t = useTranslations('PAGES.chat');
  return (
    <MessagePrimitive.Root className="flex justify-end py-2 px-3 sm:px-4 chat-column w-full mx-auto group" data-testid="user-message">
      <div className="max-w-[92%] sm:max-w-[80%] min-w-0">
        <span className="sr-only">{t('you')}:</span>
        <div className="bg-primary-light/10 text-content rounded-lg rounded-br-sm px-4 py-2.5">
          <MessagePrimitive.Parts components={{ Text: UserText, data: { by_name: { document: DocumentPart } } }} />
        </div>
        <div className={`mt-1 flex items-center justify-end gap-1 ${REVEAL}`}>
          <BranchPicker />
          <ActionBarPrimitive.Edit asChild>
            <ActionButton label={t('edit')}><EditOutlinedIcon fontSize="inherit" /></ActionButton>
          </ActionBarPrimitive.Edit>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
