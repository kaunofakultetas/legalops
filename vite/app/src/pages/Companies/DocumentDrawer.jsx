// -----------------------------------------------------------
//  [*] DocumentDrawer — one company document, opened
//
//  GET /api/documents/{id} (metadata + outline + evidence
//  inventory) and GET /api/documents/{id}/text in windows of
//  TEXT_WINDOW characters. The outline's headings jump the
//  text window to their offset; a search hit opens the drawer
//  at its passage (`startAt`). The inventory — what the
//  document proves (controls with quotes, roles, registers,
//  approval, review cycle, laws, weaknesses) — is built by
//  the analysis and cached; before that the drawer says so.
//
//  A finding's evidence passage (`passage`: {charStart,
//  quote}) opens the page of the text that holds it — the
//  TEXT_WINDOW window containing charStart, so the passage
//  keeps its context above — with the passage marked (the
//  quote where the text holds it, else the line the passage
//  starts on) and scrolled into view once; paging on keeps
//  the mark wherever its window is shown. The same goes for
//  the criterion of a finding of the company's own
//  requirements — the passage of the policy that states the
//  requirement (`passage.criterion`): it is marked the same
//  way, and the note above the text says what it is, since a
//  criterion is not evidence.
//
//  Split into (root component last):
//
//    TEXT_WINDOW    — characters per text page
//    PASSAGE_SPAN   — how far past its start a quote is looked for
//    LINE_SPAN      — the longest line a fallback mark covers
//    passageStart   — a passage's usable charStart, or null
//    passageRange   — where to mark a passage in one window
//    InventoryView  — the evidence inventory, labelled
//    OutlineList    — the clickable headings
//    TextViewer     — the paged text window
//    DocumentDrawer — the drawer (default export)
// -----------------------------------------------------------

import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import IconAction from '@/components/IconAction/IconAction';
import ErrorState from '@/components/ErrorState/ErrorState';
import StatusChip from '@/components/StatusChip/StatusChip';


// One text page — big enough to read, small enough to render
const TEXT_WINDOW = 20_000;

// A cited chunk is at most 1800 characters of the text
// (companies/indexing.py WINDOW_CHARS) and its quote lies in
// it; the slack covers whitespace the chunk had squeezed
const PASSAGE_SPAN = 2400;

// A passage whose quote is not found is marked on its first
// line, cut here when the line runs on
const LINE_SPAN = 300;







// -----------------------------------------------------------
// passageStart
// -----------------------------------------------------------
//
// The passage's charStart when it is a usable offset (a
// whole number ≥ 0), else null — a passage whose chunk is
// gone (charStart null) or a report from before charStart
// opens the document at its top, unmarked.
//
// Used by:
//   - DocumentDrawer (below)
// -----------------------------------------------------------

function passageStart(passage) {
  const at = passage?.charStart;
  return typeof at === 'number' && Number.isInteger(at) && at >= 0 ? at : null;
}







// -----------------------------------------------------------
// passageRange
// -----------------------------------------------------------
//
//   passageRange(text, at, quote) → {from, to} | null
//
// Where to mark a cited passage in one window's text: `at`
// is where the passage starts in it (null, or outside the
// window → nothing). The quote is looked for from there on,
// within PASSAGE_SPAN, any whitespace run matching any other
// (the chunk the model quoted had its spaces squeezed) and
// case ignored — then in the rest of the window (the chunks
// of a document re-indexed since the run may start
// elsewhere). A quote the text does not hold (paraphrased,
// or cut off by the window's end) marks the line the passage
// starts on instead.
//
// Used by:
//   - TextViewer (below)
// -----------------------------------------------------------

function passageRange(text, at, quote) {
  if (typeof text !== 'string' || !Number.isInteger(at) || at < 0 || at >= text.length) return null;
  const words = typeof quote === 'string' ? quote.trim().split(/\s+/).filter(Boolean) : [];
  if (words.length) {
    const pattern = new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i');
    const near = pattern.exec(text.slice(at, at + PASSAGE_SPAN));
    if (near) return { from: at + near.index, to: at + near.index + near[0].length };
    const elsewhere = pattern.exec(text);
    if (elsewhere) return { from: elsewhere.index, to: elsewhere.index + elsewhere[0].length };
  }
  const blank = text.slice(at).search(/\S/);
  if (blank === -1) return null;
  const from = at + blank;
  const newline = text.indexOf('\n', from);
  return { from, to: Math.min(newline === -1 ? text.length : newline, from + LINE_SPAN) };
}







// -----------------------------------------------------------
// InventoryView
// -----------------------------------------------------------
//
// The inventory's fields with their labels; lists of words
// as chips, controls as quoted cards.
//
// Used by:
//   - DocumentDrawer (below)
// -----------------------------------------------------------

function InventoryView({ inventory }) {

  const t = useTranslations('PAGES.company.DOCUMENTS.DRAWER');
  const label = useEnumLabel();
  // Keyed by position: the model may name a role or a law twice
  const chips = (items) => (items?.length ? <div className="flex flex-wrap gap-1">{items.map((item, index) => <Chip key={index} size="small" label={item} />)}</div> : '—');
  const row = (key, value) => (
    <div key={key} className="flex flex-col gap-1">
      <Typography variant="caption" color="text.secondary">{t(`INVENTORY.${key}`)}</Typography>
      <div className="text-sm whitespace-pre-wrap">{value || '—'}</div>
    </div>
  );


  return (
    <div className="flex flex-col gap-3">
      {row('documentType', label('inventoryType', inventory.documentType))}
      {row('summary', inventory.summary)}
      {row('scope', inventory.scope)}
      {row('approval', inventory.approval)}
      {row('reviewCycle', inventory.reviewCycle)}
      {row('roles', chips(inventory.roles))}
      {row('registers', chips(inventory.registers))}
      {row('lawsReferenced', chips(inventory.lawsReferenced))}
      {row('controls', inventory.controls?.length ? (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none">
          {inventory.controls.map((control, index) => (
            <li key={index} className="border-l-2 border-primary pl-3">
              <div className="font-semibold">{control.name}</div>
              {control.description && <div>{control.description}</div>}
              {control.quote && <blockquote className="m-0 mt-1 text-muted italic">„{control.quote}“</blockquote>}
            </li>
          ))}
        </ul>
      ) : null)}
      {row('weaknesses', inventory.weaknesses?.length ? (
        <ul className="m-0 pl-5">{inventory.weaknesses.map((item, index) => <li key={index}>{item}</li>)}</ul>
      ) : null)}
    </div>
  );
}







// -----------------------------------------------------------
// OutlineList
// -----------------------------------------------------------
//
// The document's headings, indented by level; a click moves
// the text window to the heading's offset.
//
// Used by:
//   - DocumentDrawer (below)
// -----------------------------------------------------------

function OutlineList({ outline, onJump }) {
  const t = useTranslations('PAGES.company.DOCUMENTS.DRAWER');
  if (!outline?.length) return <Typography variant="body2" color="text.secondary">{t('noOutline')}</Typography>;
  return (
    <ol className="m-0 p-0 list-none max-h-64 overflow-auto">
      {outline.map((heading, index) => (
        <li key={index} style={{ paddingLeft: `${Math.max(0, (heading.level || 1) - 1) * 12}px` }}>
          <button type="button" className="text-left text-sm text-primary hover:underline py-0.5 cursor-pointer bg-transparent border-0 p-0"
                  onClick={() => onJump(heading.offset || 0)}>
            {heading.title}
          </button>
        </li>
      ))}
    </ol>
  );
}







// -----------------------------------------------------------
// TextViewer
// -----------------------------------------------------------
//
// One window of the extracted text with previous / next;
// an answer without its text is a failed load, with a retry.
// The text is the company's own, so it reads in the serif of
// the sources. `mark` ({at, quote, criterion}) is a cited
// passage: drawn with the marker wherever
// the shown window holds it (never on the previous window's
// text still shown while the next one loads), with a note
// saying why — as the evidence of a finding, or as the
// requirement it is measured against (`criterion`) — and
// scrolled into view the first time it
// shows — a heading or a page turn after that is the
// reader's own move and is not undone.
//
// Used by:
//   - DocumentDrawer (below)
// -----------------------------------------------------------

function TextViewer({ documentId, offset, onOffset, mark }) {

  const t = useTranslations('PAGES.company.DOCUMENTS.DRAWER');
  const fmt = useFormat();
  // The window starts AT the requested offset, so a heading
  // or a search hit opens at the top of the box
  const start = Math.max(0, offset);
  const markRef = useRef(null);
  const scrolledTo = useRef(null);


  const { data, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['documentText', documentId, start],
    queryFn: async () => {
      const answer = (await api.get(`/api/documents/${documentId}/text?offset=${start}&limit=${TEXT_WINDOW}`)).data;
      // A window without its text is a failed load, not a page
      if (typeof answer?.text !== 'string') throw new Error('The text answer has no text');
      return answer;
    },
    placeholderData: (previous) => previous,
  });


  const range = data && !isPlaceholderData && mark ? passageRange(data.text, mark.at - start, mark.quote) : null;
  const markKey = range ? `${documentId}:${mark.at}` : null;
  useEffect(() => {
    if (!markKey || scrolledTo.current === markKey || !markRef.current) return;
    scrolledTo.current = markKey;
    markRef.current.scrollIntoView?.({ block: 'center' });
  }, [markKey]);


  if (isLoading) return <CircularProgress size={24} aria-label={t('text')} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  // A total that is not a number cannot page: the window's end
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : start + data.text.length;
  const end = Math.min(total, start + data.text.length);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Typography variant="caption" color="text.secondary">
          {t('textRange', { from: fmt.number(start + 1), to: fmt.number(end), total: fmt.number(total) })}
        </Typography>
        <div className="flex gap-1">
          <Button size="small" disabled={start === 0} onClick={() => onOffset(Math.max(0, start - TEXT_WINDOW))}>{t('prev')}</Button>
          <Button size="small" disabled={end >= total} onClick={() => onOffset(start + TEXT_WINDOW)}>{t('next')}</Button>
        </div>
      </div>
      {range && <Typography variant="caption" color="text.secondary">{t(mark.criterion ? 'criterion' : 'passage')}</Typography>}
      <div className="font-serif text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] bg-canvas rounded p-3 max-h-[28rem] overflow-auto">
        {range ? (
          <>
            {data.text.slice(0, range.from)}
            <mark ref={markRef} className="marked">{data.text.slice(range.from, range.to)}</mark>
            {data.text.slice(range.to)}
          </>
        ) : data.text}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// DocumentDrawer (default export)
// -----------------------------------------------------------
//
// Opens on the document `documentId`: at the text offset
// `startAt` (a search hit), or at a cited `passage` (its
// charStart and quote, and whether it is a finding's
// criterion rather than its evidence), which is then marked;
// `onClose` closes the drawer.
//
// Used by:
//   - CompanyDocuments.jsx — a row's open button, a search hit
//   - ReportDetail.jsx — a finding's evidence (a document, a
//     passage) and the criterion of an own requirement
// -----------------------------------------------------------

export default function DocumentDrawer({ documentId, startAt = 0, passage = null, onClose }) {

  const t = useTranslations('PAGES.company.DOCUMENTS.DRAWER');
  const label = useEnumLabel();
  const fmt = useFormat();
  const titleId = useId();
  const passageAt = passageStart(passage);
  // A passage opens the page that holds it, not a window
  // starting at it: the reader sees what leads up to it
  const opening = passageAt == null ? startAt : Math.floor(passageAt / TEXT_WINDOW) * TEXT_WINDOW;
  const [offset, setOffset] = useState(opening);
  const [shownFor, setShownFor] = useState({ documentId, opening, passageAt });


  // A new document, hit or passage moves the text window
  if (shownFor.documentId !== documentId || shownFor.opening !== opening || shownFor.passageAt !== passageAt) {
    setShownFor({ documentId, opening, passageAt });
    setOffset(opening);
  }


  const { data: doc, isLoading, error, refetch } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const answer = (await api.get(`/api/documents/${documentId}`)).data;
      // null, a list or a proxy's text is a failed load (with
      // its retry), not an empty drawer
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('The document answer is not an object');
      return answer;
    },
    enabled: Boolean(documentId),
  });


  return (
    <Drawer anchor="right" open={Boolean(documentId)} onClose={onClose} slotProps={{ paper: { 'aria-labelledby': titleId } }}>
      <div className="w-[44rem] max-w-[100vw] p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <Typography id={titleId} variant="h6" component="h2" className="[overflow-wrap:anywhere]">{doc?.title || t('title')}</Typography>
          <IconAction label={t('close')} icon={<CloseIcon />} onClick={onClose} />
        </div>
        {isLoading && <CircularProgress aria-label={t('title')} />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {doc && (
          <>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <StatusChip kind="extraction" value={doc.extractionStatus} label={label('extractionStatus', doc.extractionStatus)} />
              <span className="text-muted">{label('documentKind', doc.kind)} · {fmt.bytes(doc.size)} · {t('chars')}: {fmt.number(doc.charCount)}</span>
              <span className="text-muted">{t('uploaded')}: {fmt.dateTime(doc.uploadedAt)}</span>
              {doc.indexedAt && <span className="text-muted">{t('indexed')}: {fmt.dateTime(doc.indexedAt)}</span>}
            </div>
            {doc.extractionError && <Typography variant="body2" color="error">{t('extraction')}: {doc.extractionError}</Typography>}
            <section className="flex flex-col gap-2">
              <Typography variant="subtitle1" component="h3">{t('inventory')}</Typography>
              {doc.inventory ? <InventoryView inventory={doc.inventory} /> : <Typography variant="body2" color="text.secondary">{t('noInventory')}</Typography>}
            </section>
            <section className="flex flex-col gap-2">
              <Typography variant="subtitle1" component="h3">{t('outline')}</Typography>
              <OutlineList outline={doc.outline} onJump={setOffset} />
            </section>
            {doc.charCount > 0 && (
              <section className="flex flex-col gap-2">
                <Typography variant="subtitle1" component="h3">{t('text')}</Typography>
                {/* The id asked for, not the answer's: a URL is never built from what the server sent */}
                <TextViewer documentId={documentId} offset={offset} onOffset={setOffset}
                            mark={passageAt == null ? null : { at: passageAt, quote: passage.quote, criterion: Boolean(passage.criterion) }} />
              </section>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
