// -----------------------------------------------------------
//  [*] ActionRow — one action of a company's register
//
//  A row of the register: the action's title — the button
//  that opens the row — and under it, on one line, where it
//  stands: the state as a chip (the late one with the
//  warning mark), the owner, the due date (a late action
//  says by how many days, in words), its priority in the
//  plan it came from, how many findings it is to close — and
//  how many of them a report has confirmed, once one has —
//  and the report whose plan it came from, a link named by
//  that report's date.
//
//  Opened, the row tells the rest: what is to be done; the
//  findings the action is to close — the first few, and the
//  whole list when asked: one action of a real plan closes
//  dozens, and the form must not sink under them — each with
//  its act and
//  provision, how the finding stood in the report, and, once
//  a later signed-off report found the obligation met, the
//  mark "confirmed" with the date and the way to that report;
//  for a closed action how it was closed — by which report,
//  or by whom by hand. A finding without an obligation id
//  can never be confirmed by a report, and says why: its
//  obligation was replaced since — the act was read again,
//  or, for one of the company's own requirements, the policy
//  it comes from. An action no later report can ever confirm
//  (`byHandOnly` — it has such a finding, or it closes no
//  finding at all, like correcting the documents'
//  references) says so in one quiet line: only a person
//  closes it, with the reason in the note. An action without
//  findings shows that line where the list would stand.
//
//  The opened row is also where a person keeps the action
//  up: owner, due date, status and note, saved in one PATCH
//  that carries only what changed (PATCH /api/actions/{id}).
//  The status offered is the person's own — open, in
//  progress, done, closed — never "late". "Done" is the
//  owner's word, not a closure: a later signed-off report
//  closes the action, and the form says so under the select.
//  What a report closed is not reopened by hand: the select
//  is off and the line under it says where to dispute the
//  closure — at the finding, in that report.
//  Closing by hand needs the note first — the save stays off
//  and the note field says what is asked; the backend's own
//  refusal (NOTE_REQUIRED) reads the same. A saved change
//  reads the register again, so the row takes its new place
//  and the counts follow.
//
//  Split into (root component last):
//
//    OWNER_MAX / NOTE_MAX — what the backend keeps of a text
//    ITEMS_SHOWN  — findings an opened row lists at first
//    ISO_DATE     — a date as a date field holds it
//    textOf       — a field's value as text
//    dateOf       — a due date a date field can hold
//    changesOf    — what a person changed, as the PATCH body
//    Block        — a captioned part of the opened row
//    ItemLine     — one finding the action is to close
//    ClosedHow    — how a closed action was closed
//    ActionEditor — owner, due date, status, note
//    ActionFacts  — the line under the title
//    ActionRow    — the row (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import toast from '@/utils/toast';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import { ACTION_STATUSES } from '@/constants/enums';
import ActionState from '@/pages/Companies/ActionState';
import { actionKeys, daysLate, saveAction } from '@/pages/Companies/actionRegister';
import FindingStatusIcon from '@/pages/Reports/FindingStatusIcon';


// What the backend keeps of an owner and of a note
const OWNER_MAX = 300;
const NOTE_MAX = 4000;

// Findings an opened row lists before it is asked for the rest
const ITEMS_SHOWN = 8;

// A date as a date field holds it
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;







// -----------------------------------------------------------
// textOf
// -----------------------------------------------------------
//
// A field of an action as text: nothing for a missing value,
// the value's own words for anything else — an answer of the
// wrong type must not break a text field.
//
// Used by:
//   - ActionEditor, ItemLine (below)
// -----------------------------------------------------------

function textOf(value) {
  return value == null ? '' : String(value);
}







// -----------------------------------------------------------
// dateOf
// -----------------------------------------------------------
//
// An action's due date as a date field can hold it, or
// nothing when the answer carries something else there.
//
// Used by:
//   - ActionEditor (below)
// -----------------------------------------------------------

function dateOf(value) {
  return ISO_DATE.test(textOf(value)) ? value : '';
}







// -----------------------------------------------------------
// changesOf
// -----------------------------------------------------------
//
// What a person changed in the form, as the PATCH body: only
// the fields that differ from the action as loaded, the texts
// trimmed the way the backend stores them. An emptied due
// date is no change — an action always has one.
//
// Used by:
//   - ActionEditor (below)
// -----------------------------------------------------------

function changesOf(base, values) {
  const changes = {};
  if (values.owner.trim() !== base.owner.trim()) changes.owner = values.owner.trim();
  if (values.dueDate && values.dueDate !== base.dueDate) changes.dueDate = values.dueDate;
  if (values.status !== base.status) changes.status = values.status;
  if (values.note.trim() !== base.note.trim()) changes.note = values.note.trim();
  return changes;
}







// -----------------------------------------------------------
// Block
// -----------------------------------------------------------
//
// A part of the opened row under a small caption, the way
// the finding card heads its parts.
//
// Used by:
//   - ActionRow (below)
// -----------------------------------------------------------

function Block({ title, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Typography variant="caption" color="text.secondary" component="h4" className="font-semibold">{title}</Typography>
      {children}
    </div>
  );
}







// -----------------------------------------------------------
// ItemLine
// -----------------------------------------------------------
//
// One finding the action is to close: its title, the act and
// provision — a reference to the law, so in the serif — how
// the finding stood in the report that brought the action in
// (the verdict's own mark and word), and the "confirmed"
// mark with its date once a later signed-off report found
// the obligation met — a link to that report. A finding no
// later report can confirm says why, quietly: its act, or
// for a requirement of the company's own its policy, was
// read again since.
//
// Used by:
//   - ActionRow (below)
// -----------------------------------------------------------

function ItemLine({ item }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const provision = [item.act, item.path].map(textOf).filter(Boolean).join(' ');
  const confirmed = item.confirmed && typeof item.confirmed === 'object' ? item.confirmed : null;


  return (
    <li className="border-l-2 border-edge pl-3 py-0.5 flex flex-col gap-0.5">
      <div className="text-sm font-semibold">{textOf(item.title)}</div>
      <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-sm">
        {provision && <span className="font-serif">{provision}</span>}
        <span className="inline-flex items-center gap-1 text-muted">
          <FindingStatusIcon status={item.status} sx={{ fontSize: 16 }} />
          {t('stood', { status: label('findingStatus', item.status) })}
        </span>
        {confirmed && (
          <span className="inline-flex items-center gap-1 text-green-800">
            <CheckCircleOutlineIcon sx={{ fontSize: 16 }} aria-hidden />
            {confirmed.reportId
              ? <Link to={`/reports/${confirmed.reportId}`} className="text-green-800 underline">{t('confirmed', { date: fmt.date(confirmed.at) })}</Link>
              : t('confirmed', { date: fmt.date(confirmed.at) })}
          </span>
        )}
      </div>
      {item.obligationId == null && !confirmed && (
        <div className="text-xs text-muted">{item.sourceKind === 'internal' ? t('ownRequirement') : t('replaced')}</div>
      )}
    </li>
  );
}







// -----------------------------------------------------------
// ClosedHow
// -----------------------------------------------------------
//
// How a closed action was closed, in the export's own words:
// confirmed by a later report — with the way to it — or
// closed by a person, named when the backend names them,
// and when.
//
// Used by:
//   - ActionRow (below)
// -----------------------------------------------------------

function ClosedHow({ action }) {

  const t = useTranslations('PAGES.company.ACTIONS.CLOSED');
  const fmt = useFormat();
  const date = fmt.date(action.closedAt);


  if (action.closedHow === 'confirmed') {
    return (
      <div className="text-sm flex items-center gap-x-3 gap-y-0.5 flex-wrap">
        <span>{t('confirmed', { date })}</span>
        {action.confirmedReportId && <Link to={`/reports/${action.confirmedReportId}`} className="text-primary">{t('openReport')}</Link>}
      </div>
    );
  }
  return <div className="text-sm">{action.closedByName ? t('manualBy', { name: textOf(action.closedByName), date }) : t('manual', { date })}</div>;
}







// -----------------------------------------------------------
// ActionEditor
// -----------------------------------------------------------
//
// The form of one action: owner, due date, status and note,
// with what was typed held over the action as loaded — so
// the save sends only what differs and a discard is just
// forgetting it. Closing by hand without a note keeps the
// save off and asks for the reason at the note field. An
// action a report closed keeps its status: the select is off
// and the hint says how such a closure is disputed. The
// save stays busy until the register is read again, then the
// form shows what the backend stored; a refusal is said
// above the buttons.
//
// Used by:
//   - ActionRow (below)
// -----------------------------------------------------------

function ActionEditor({ action, companyId }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const tCommon = useTranslations('COMPONENTS.common');
  const tErrors = useTranslations('COMPONENTS.errors');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const hintId = useId();
  // What the person typed and has not saved, field by field
  const [draft, setDraft] = useState({});


  const base = {
    owner: textOf(action.owner),
    dueDate: dateOf(action.dueDate),
    status: ACTION_STATUSES.includes(action.status) ? action.status : 'open',
    note: textOf(action.note),
  };
  const values = { ...base, ...draft };
  const changes = changesOf(base, values);
  const dirty = Object.keys(changes).length > 0;
  // A closure without a report's confirmation is a person's
  // decision — the note says why
  const needsNote = values.status === 'closed' && base.status !== 'closed' && !values.note.trim();
  // A report's closure rests on that report's findings, not
  // on a person's word
  const byReport = action.closedHow === 'confirmed';


  const save = useMutation({
    mutationFn: () => saveAction(action.id, changes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: actionKeys.company(companyId) });
      setDraft({});
      toast.success(t('saved'));
    },
  });


  const change = (field) => (event) => {
    save.reset();
    setDraft({ ...draft, [field]: event.target.value });
  };
  const discard = () => {
    save.reset();
    setDraft({});
  };
  const submit = (event) => {
    event.preventDefault();
    if (dirty && !needsNote && !save.isPending) save.mutate();
  };


  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded bg-canvas p-3" aria-label={t('edit', { title: textOf(action.title) })}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField size="small" label={t('owner')} value={values.owner} onChange={change('owner')} className="bg-surface"
                   slotProps={{ htmlInput: { maxLength: OWNER_MAX } }} />
        <TextField size="small" type="date" label={t('due')} value={values.dueDate} onChange={change('dueDate')} className="bg-surface"
                   slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label={t('state')} value={values.status} onChange={change('status')} className="bg-surface" disabled={byReport}
                   slotProps={{ select: { native: true }, inputLabel: { shrink: true }, htmlInput: { 'aria-describedby': hintId } }}>
          {ACTION_STATUSES.map((status) => <option key={status} value={status}>{label('actionState', status)}</option>)}
        </TextField>
      </div>
      <Typography variant="caption" color="text.secondary" id={hintId}>{byReport ? t('closedByReport') : t('doneHint')}</Typography>
      <TextField size="small" multiline minRows={2} label={t('note')} value={values.note} onChange={change('note')} required={needsNote}
                 helperText={needsNote ? tErrors('CODES.NOTE_REQUIRED') : undefined}
                 slotProps={{ htmlInput: { maxLength: NOTE_MAX }, formHelperText: { className: 'text-amber-800 font-semibold' }, input: { className: 'bg-surface' } }} />
      {save.error && <Alert severity="error">{describe(save.error)}</Alert>}
      <div className="flex gap-2 flex-wrap justify-end">
        {dirty && <Button onClick={discard} disabled={save.isPending}>{tCommon('discard')}</Button>}
        <Button type="submit" variant="contained" disabled={!dirty || needsNote} loading={save.isPending}>{tCommon('save')}</Button>
      </div>
    </form>
  );
}







// -----------------------------------------------------------
// ActionFacts
// -----------------------------------------------------------
//
// The line under an action's title: its state, who owns it,
// when it is due — a late one adds by how many days, in
// words and in the warning ink, beside the chip that carries
// the warning mark — its priority in the plan, how many
// findings it is to close (how many of them are confirmed,
// once any is), and the report it came from, named by the
// date that report was made (without the date when the
// answer has none; no link once the report is gone).
//
// Used by:
//   - ActionRow (below)
// -----------------------------------------------------------

function ActionFacts({ action, total, confirmed }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const fmt = useFormat();
  const late = action.state === 'late' ? daysLate(action.dueDate) : null;
  const priority = Number(action.priority);


  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
      <ActionState state={action.state} />
      {action.owner && <span>{t('ownerIs', { owner: textOf(action.owner) })}</span>}
      <span>{t('dueOn', { date: fmt.date(action.dueDate) })}</span>
      {late != null && <span className="font-semibold text-amber-800">{t('lateBy', { days: late })}</span>}
      {Number.isFinite(priority) && action.priority != null && action.priority !== '' && <span className="text-muted">{t('priority', { n: priority })}</span>}
      {total > 0 && <span className="text-muted">{confirmed > 0 ? t('findingsConfirmed', { confirmed, total }) : t('findingsCount', { count: total })}</span>}
      {typeof action.reportId === 'string' && action.reportId && (
        <Link to={`/reports/${action.reportId}`} className="text-primary">
          {action.reportDate ? t('fromReport', { date: fmt.date(action.reportDate) }) : t('fromReportUndated')}
        </Link>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// ActionRow (default export)
// -----------------------------------------------------------
//
// One action as a list item: the title is the disclosure
// button of the row, the facts stand under it, and the
// opened row adds the description, the findings to close —
// the first ITEMS_SHOWN, the rest behind a button — the line
// of an action only a person can close (while it is not
// closed), how a closed action was closed and the form.
// The form is mounted with the opened row only, so a long
// register costs no more than its lines.
//
// Used by:
//   - CompanyActions.jsx — the register's list
// -----------------------------------------------------------

export default function ActionRow({ action, companyId }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  // The whole list of a long action only when asked
  const [whole, setWhole] = useState(false);
  const items = Array.isArray(action.items) ? action.items.filter((item) => item && typeof item === 'object') : [];
  const confirmed = items.filter((item) => item.confirmed && typeof item.confirmed === 'object').length;
  const shown = whole ? items : items.slice(0, ITEMS_SHOWN);


  return (
    <li className="py-3.5 first:pt-0 last:pb-0 border-t border-edge first:border-t-0 flex flex-col gap-2">
      <h3 className="m-0">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={open ? bodyId : undefined}
                className="w-full flex items-start justify-between gap-2 text-left bg-transparent border-0 p-0 cursor-pointer text-content">
          <Typography variant="subtitle1" component="span">{textOf(action.title)}</Typography>
          {open ? <ExpandLessIcon aria-hidden /> : <ExpandMoreIcon aria-hidden />}
        </button>
      </h3>
      <ActionFacts action={action} total={items.length} confirmed={confirmed} />
      {open && (
        <div id={bodyId} className="flex flex-col gap-3.5 mt-1 pt-3 border-t border-edge">
          {action.description && <Typography variant="body2" className="whitespace-pre-wrap max-w-3xl">{textOf(action.description)}</Typography>}
          {items.length > 0 && (
            <Block title={t('closes')}>
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {shown.map((item, index) => <ItemLine key={`${item.findingId}-${index}`} item={item} />)}
              </ul>
              {items.length > ITEMS_SHOWN && (
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  <Button size="small" variant="outlined" onClick={() => setWhole(!whole)} aria-expanded={whole}>
                    {whole ? t('showFewer') : t('showAll', { count: items.length })}
                  </Button>
                  {!whole && <Typography variant="caption" color="text.secondary">{t('shownOf', { shown: ITEMS_SHOWN, total: items.length })}</Typography>}
                </div>
              )}
            </Block>
          )}
          {action.byHandOnly === true && action.state !== 'closed' && <Typography variant="body2" color="text.secondary">{t('byHandOnly')}</Typography>}
          {action.state === 'closed' && <Block title={t('closedHow')}><ClosedHow action={action} /></Block>}
          <ActionEditor action={action} companyId={companyId} />
        </div>
      )}
    </li>
  );
}
