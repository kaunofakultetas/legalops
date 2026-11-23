// -----------------------------------------------------------
//  [*] PolicyParts — the compliance policy as a document
//
//  The "policy" tab of a compliance policy: its parts in
//  their fixed order (eight in a whole policy), set as a
//  document a board reads — a sheet the width of a page,
//  numbered headings in the serif, the text in paragraphs at
//  a reading measure. Under each
//  part stands what it rests on: the points the governing
//  body has yet to decide before it adopts the policy, marked
//  apart as a callout (the model lists them, it never decides
//  them), the company documents the part quotes, by title,
//  and its legal basis as links to the provisions.
//
//  In a draft being edited every part turns into a form: its
//  text in one field, paragraphs separated by a blank line,
//  its decisions as a list that takes additions and removals,
//  and its legal basis with a button on each provision that
//  takes it out and a row that adds one. The headings are the kind's own and are not
//  edited.
//
//  Split into (root component last):
//
//    quotedDocuments — the titles a part's quotes come from
//    PartHeading     — a part's numbered heading
//    PartBasis       — what a part rests on, in small print
//    PartRead        — one part, as text
//    PartEdit        — one part, as a form
//    PolicyParts     — the tab (default export)
// -----------------------------------------------------------

import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import EmptyState from '@/components/EmptyState/EmptyState';
import { TextList } from '@/pages/Programme/EditFields';
import ProvisionLinks from '@/pages/Programme/ProvisionLinks';
import { listOf, paragraphs, patchAt, withoutAt } from '@/pages/Programme/programmeUtils';







// -----------------------------------------------------------
// quotedDocuments
// -----------------------------------------------------------
//
// The titles of the documents a part's quotes come from,
// each once, in alphabetical order — the way the exported
// file names them.
//
// Used by:
//   - PartBasis (below)
// -----------------------------------------------------------

function quotedDocuments(part) {
  return [...new Set(listOf(part.sources).map((source) => source.document).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}







// -----------------------------------------------------------
// PartHeading
// -----------------------------------------------------------
//
// A part's heading in the serif, its number set apart in the
// brand's middle blue, as the exported file sets it.
//
// Used by:
//   - PartRead, PartEdit (below)
// -----------------------------------------------------------

function PartHeading({ number, children }) {
  return (
    <h2 className="m-0 font-serif font-semibold text-[1.375rem] leading-snug [overflow-wrap:anywhere]">
      <span className="text-primary-light mr-2.5">{number}</span>{children}
    </h2>
  );
}







// -----------------------------------------------------------
// PartBasis
// -----------------------------------------------------------
//
// The small print under a part: the documents it quotes and
// its legal basis. In a draft being edited `onRemove` puts a
// remove button on every provision and `onAdd` the row that
// adds one — the basis line then shows even while it is
// empty.
//
// Used by:
//   - PartRead, PartEdit (below)
// -----------------------------------------------------------

function PartBasis({ part, onRemove = null, onAdd = null }) {

  const t = useTranslations('PAGES.programme');
  const documents = quotedDocuments(part);
  const basis = listOf(part.legalBasis);


  if (documents.length === 0 && basis.length === 0 && !onAdd) return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {documents.length > 0 && (
        <div><span className="text-muted">{t('POLICY.sources')}: </span>{documents.join('; ')}</div>
      )}
      {(basis.length > 0 || onAdd) && (
        <div><span className="text-muted">{t('PROVISION.basis')}: </span><ProvisionLinks entries={basis} onRemove={onRemove} onAdd={onAdd} /></div>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// PartRead
// -----------------------------------------------------------
//
// One part as it reads: the heading, the paragraphs, the
// callout of what the governing body must decide, then the
// small print.
//
// Used by:
//   - PolicyParts (below)
// -----------------------------------------------------------

function PartRead({ part, number }) {

  const t = useTranslations('PAGES.programme.POLICY');
  const decisions = (Array.isArray(part.decisions) ? part.decisions : []).filter(Boolean);


  return (
    <section className="flex flex-col gap-3">
      <PartHeading number={number}>{part.heading}</PartHeading>
      <div>
        {paragraphs(part.text).map((block, index) => (
          <p key={index} className="m-0 mb-3 last:mb-0 text-base leading-[1.65] whitespace-pre-line">{block}</p>
        ))}
      </div>
      {decisions.length > 0 && (
        <div className="rounded bg-amber-50 border-l-4 border-amber-400 px-3 py-2">
          <Typography variant="subtitle2" component="h3">{t('decisions')}</Typography>
          <ul className="m-0 mt-1 pl-5 list-disc flex flex-col gap-1 text-sm">
            {decisions.map((decision, index) => <li key={index}>{decision}</li>)}
          </ul>
        </div>
      )}
      <PartBasis part={part} />
    </section>
  );
}







// -----------------------------------------------------------
// PartEdit
// -----------------------------------------------------------
//
// One part as a form: the text in a field named — for a
// screen reader — by the heading that stands over it, the
// decisions as an editable list, the legal basis with its
// remove buttons and its adding row. `onChange` takes the changed fields of the
// part.
//
// Used by:
//   - PolicyParts (below)
// -----------------------------------------------------------

function PartEdit({ part, number, onChange }) {

  const t = useTranslations('PAGES.programme.POLICY');


  return (
    <section className="flex flex-col gap-3">
      <PartHeading number={number}>{part.heading}</PartHeading>
      <TextField hiddenLabel value={String(part.text ?? '')} onChange={(event) => onChange({ text: event.target.value })}
                 multiline minRows={6} fullWidth helperText={t('textHint')} slotProps={{ htmlInput: { 'aria-label': part.heading } }} />
      <Typography variant="subtitle2" component="h3">{t('decisions')}</Typography>
      <TextList items={part.decisions} onChange={(decisions) => onChange({ decisions })} multiline
                itemLabel={(index) => t('decision', { number: index })} addLabel={t('addDecision')} />
      <PartBasis part={part} onRemove={(index) => onChange({ legalBasis: withoutAt(listOf(part.legalBasis), index) })}
                 onAdd={(entry) => onChange({ legalBasis: [...listOf(part.legalBasis), entry] })} />
    </section>
  );
}







// -----------------------------------------------------------
// PolicyParts (default export)
// -----------------------------------------------------------
//
// The policy's parts on one sheet, read or — `editing` —
// as forms; `change` takes a function from the content to
// the edited content.
//
// Used by:
//   - ProductPage.jsx — the policy tab of a compliance policy
// -----------------------------------------------------------

export default function PolicyParts({ content, editing, change }) {

  const t = useTranslations('PAGES.programme.POLICY');
  const parts = listOf(content.parts);
  const patch = (index, fields) => change((current) => ({ ...current, parts: patchAt(listOf(current.parts), index, fields) }));


  if (parts.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <Paper className="p-4 md:px-12 md:py-10 max-w-4xl">
      <div className="max-w-[72ch] flex flex-col gap-10">
        {parts.map((part, index) => (editing
          ? <PartEdit key={part.key ?? index} part={part} number={index + 1} onChange={(fields) => patch(index, fields)} />
          : <PartRead key={part.key ?? index} part={part} number={index + 1} />))}
      </div>
    </Paper>
  );
}
