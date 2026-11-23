// -----------------------------------------------------------
//  [*] ReportActs — which legal acts apply, and what the
//      report did with each
//
//  The applicability step's verdicts (report.acts), by what
//  the report did with the act (reportUtils actAssessment).
//  As cards, each with the model's confidence, reasoning and
//  the scope provisions it cited: the acts whose obligations
//  were assessed; those assessed as preparation, with the
//  date they start to apply; and those NOT assessed because
//  their applicability hangs on facts the profile does not
//  state — with the questions that decide it, which are the
//  user's next step. Below them, collapsed: the directives
//  (assessed through the national law that transposes them),
//  the acts that only organise an authority or a procedure
//  before it (they reach the company through that
//  authority's decisions), the acts the model judged not
//  applicable and those the catalogue screened out before
//  any model read them (the act targets other institution
//  types). A standard the company adopted is among the
//  assessed ones, marked as a standard and without a
//  confidence: it applies by the adoption, no model judged
//  it. Every card links to the act in the corpus and to its
//  official source. An act that got a newer version after
//  the run (the report's outdatedActs, by short title as the
//  backend names them) is marked on its card — the verdict
//  read the old text. A group the user opened stays open
//  when they come back (sessionStorage, per report).
//
//  A report made with the review of its list of acts carries
//  a person's decision too. The acts that person decided
//  against the verdict stand in two groups of their own
//  (reportUtils actChoice): those that do not bind the
//  company and were assessed all the same, as good practice,
//  and those that apply and were left out. One line above the
//  groups says who approved the list and when — or that the
//  report ran without the review; a report from before the
//  review existed says nothing.
//
//  The same groups are the approval screen of a report that
//  still waits for that decision (ReportScope.jsx): given a
//  `review`, every card — the screened-out ones included —
//  carries the "assess" switch, starting where the run
//  decided, with a note when the switch goes against the
//  verdict and, for an act switched on, how many obligations
//  the assessment would judge. The acts stay in the groups
//  the run put them in while the switches move.
//
//  A report that also assessed the company's own rules holds
//  one more row among its acts, which is no legal act (its
//  docType is "internal"): the criterion there is what the
//  company's own policies require. It is kept out of every
//  group above and shown last, in a small group of its own
//  that says what was assessed — no verdict, no confidence,
//  no link to the law, and never a switch on the approval
//  screen: it is not an act a person takes in or leaves out.
//
//  Split into (root component last):
//
//    isOpenGroups    — a stored {group: open} map
//    AssessSwitch    — an act's switch on the approval screen
//    ActCard         — one act's verdict
//    ActSection      — an open group of acts, with why
//    ActGroup        — a collapsed group of acts
//    OwnRequirements — the company's own rules, apart
//    ApprovedLine    — who approved the list of acts
//    ActGroups       — the acts in their groups (named export)
//    ReportActs      — the tab (default export)
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import SectionCard from '@/components/SectionCard/SectionCard';
import StatusChip from '@/components/StatusChip/StatusChip';
import CitationLinks from '@/pages/Reports/CitationLinks';
import { actAssessment, actChoice, isAssessed, isInternal, rowKeys } from '@/pages/Reports/reportUtils';







// -----------------------------------------------------------
// isOpenGroups
// -----------------------------------------------------------
//
// A stored {indirect, institutional, notApplicable,
// screenedOut} map of booleans — which of the folded groups
// the user left open.
//
// Used by:
//   - ActGroups (below) — useSessionState's check
// -----------------------------------------------------------

function isOpenGroups(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((flag) => typeof flag === 'boolean');
}







// -----------------------------------------------------------
// AssessSwitch
// -----------------------------------------------------------
//
// The "assess" switch of one act on the approval screen, as
// the review holds it (ReportScope.jsx useScopeReview). The
// switch is named after its act for a screen reader — a page
// of switches all called "assess" tells nothing apart. Beside
// it, for an act switched on, how many obligations the
// assessment would judge, or that the act is read for the
// first time (its count is then only a guess, so it is not
// shown). A note says what going against the verdict means:
// an act that does not bind the company is assessed as good
// practice; an act that applies and that the run would have
// assessed is left out of this report. An act the answer
// gave no id cannot be named to the backend and gets no
// switch — it keeps what the run decided.
//
// Used by:
//   - ActCard (below)
// -----------------------------------------------------------

function AssessSwitch({ act, review }) {

  const t = useTranslations('PAGES.report.SCOPE');
  const fmt = useFormat();
  const state = review.stateOf(act);


  if (!state) return null;
  const { on, priced } = state;
  const binding = !act.screenedOut && act.applicability !== 'not_applies';
  let note = null;
  if (on && !binding) note = t('goodPractice');
  if (!on && isAssessed(act) && act.applicability === 'applies') note = t('skipped');


  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap rounded bg-canvas px-3 py-1">
      <FormControlLabel label={t('assess')} className="mr-0"
                        control={<Switch checked={on} disabled={review.busy} onChange={(event) => review.toggle(act, event.target.checked)}
                                         slotProps={{ input: { 'aria-label': t('assessLabel', { act: act.shortTitle || act.documentTitle || '' }) } }} />} />
      {priced && (
        <Typography variant="body2" color="text.secondary">
          {priced.toExtract ? t('toExtract') : t('obligations', { count: fmt.number(priced.obligations) })}
        </Typography>
      )}
      {note && <Typography variant="body2" className="font-medium">{note}</Typography>}
    </div>
  );
}







// -----------------------------------------------------------
// ActCard
// -----------------------------------------------------------
//
// Title, jurisdiction, the standard mark, verdict, the date
// an act assessed as preparation starts to apply, the
// "updated since" mark, confidence (none for a standard, and
// none beside "to be confirmed", where a number reads as its
// opposite), reasoning, what is still to confirm (highlighted
// — it is the user's homework; for an act that was not
// assessed, the questions to answer) and the cited scope
// provisions. On the approval screen (`review`) the card
// opens with the act's switch, above everything the person
// reads to decide.
//
// Used by:
//   - ActSection, ActGroup (below)
// -----------------------------------------------------------

function ActCard({ act, outdated = false, review = null }) {

  const t = useTranslations('PAGES.report.ACTS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const title = act.shortTitle && act.shortTitle !== act.documentTitle ? `${act.shortTitle} — ${act.documentTitle}` : act.documentTitle;
  const standard = act.docType === 'standard';
  const assessment = actAssessment(act);


  return (
    <Paper variant="outlined" className="p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <Typography variant="subtitle1" component="h3" className="font-semibold [overflow-wrap:anywhere]">{title}</Typography>
        <div className="flex gap-1 flex-wrap">
          {act.jurisdiction && <StatusChip value={act.jurisdiction} label={label('jurisdiction', act.jurisdiction)} />}
          {standard && <StatusChip value="standard" label={label('docType', 'standard')} />}
          <StatusChip kind="applicability" value={act.applicability} label={label('applicability', act.applicability)} />
          {assessment === 'upcoming' && act.appliesFrom && <Chip size="small" variant="outlined" label={t('appliesFrom', { date: fmt.date(act.appliesFrom) })} />}
          {outdated && <Chip size="small" color="warning" variant="outlined" label={t('outdated')} />}
        </div>
      </div>
      {review && <AssessSwitch act={act} review={review} />}
      {!act.screenedOut && !standard && act.applicability !== 'uncertain' && (
        <Typography variant="body2" color="text.secondary">{t('confidence', { value: fmt.percent(act.confidence) })}</Typography>
      )}
      {act.reasoning && (
        <div>
          <Typography variant="caption" color="text.secondary">{t('reasoning')}</Typography>
          <Typography variant="body2" className="whitespace-pre-wrap">{act.reasoning}</Typography>
        </div>
      )}
      {act.conditionsToVerify && (
        <div className="rounded bg-amber-50 border-l-4 border-amber-400 p-2">
          <Typography variant="caption" color="text.secondary">{t(assessment === 'unconfirmed' ? 'questions' : 'conditions')}</Typography>
          <Typography variant="body2" className="whitespace-pre-wrap">{act.conditionsToVerify}</Typography>
        </div>
      )}
      {act.citations?.length > 0 && (
        <div className="flex flex-col gap-1">
          <Typography variant="caption" color="text.secondary">{t('citations')}</Typography>
          <CitationLinks citations={act.citations} documentId={act.documentId} />
        </div>
      )}
      <div className="flex gap-3 flex-wrap text-sm">
        {act.documentId && <Link to={`/corpus/${act.documentId}`} className="text-primary">{t('openAct')}</Link>}
        {act.sourceUrl && (
          <a href={act.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1">
            {t('source')}<OpenInNewIcon sx={{ fontSize: 14 }} aria-hidden />
          </a>
        )}
      </div>
    </Paper>
  );
}







// -----------------------------------------------------------
// ActSection
// -----------------------------------------------------------
//
// An open group of acts as cards, under a title and — when
// the group needs one — the sentence saying what the report
// did with these acts; renders nothing for an empty group.
//
// Used by:
//   - ActGroups (below)
// -----------------------------------------------------------

function ActSection({ title, hint, acts, isOutdated, keyOf, review }) {
  if (acts.length === 0) return null;
  return (
    <SectionCard title={title} subtitle={hint}>
      <div className="flex flex-col gap-3">
        {acts.map((act) => <ActCard key={keyOf.get(act)} act={act} outdated={isOutdated(act)} review={review} />)}
      </div>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// ActGroup
// -----------------------------------------------------------
//
// An accordion of acts (directives, acts that organise an
// authority, not applicable, screened out), folded unless
// `open`, with an optional sentence above its cards; renders
// nothing for an empty group. Cards are keyed by the tab's
// keyOf (reportUtils rowKeys).
//
// Used by:
//   - ActGroups (below)
// -----------------------------------------------------------

function ActGroup({ title, hint, acts, isOutdated, keyOf, review, open, onToggle }) {
  if (acts.length === 0) return null;
  return (
    <Accordion disableGutters variant="outlined" expanded={open} onChange={(_, expanded) => onToggle(expanded)}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{title}</Typography></AccordionSummary>
      <AccordionDetails className="flex flex-col gap-2">
        {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
        {acts.map((act) => <ActCard key={keyOf.get(act)} act={act} outdated={isOutdated(act)} review={review} />)}
      </AccordionDetails>
    </Accordion>
  );
}







// -----------------------------------------------------------
// OwnRequirements
// -----------------------------------------------------------
//
// The row the company's own requirements hang on, as a small
// group after the acts: its title and the row's reasoning —
// the sentence saying what was assessed and that these are
// the company's rules for itself, not duties under an act.
// Renders nothing for a report without the row.
//
// Used by:
//   - ActGroups (below)
// -----------------------------------------------------------

function OwnRequirements({ rows, keyOf }) {
  const t = useTranslations('PAGES.report.ACTS');
  if (rows.length === 0) return null;
  return (
    <SectionCard title={t('internal')}>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={keyOf.get(row)}>
            <Typography variant="caption" color="text.secondary">{t('reasoning')}</Typography>
            <Typography variant="body2" className="whitespace-pre-wrap max-w-[90ch]">{row.reasoning || row.documentTitle}</Typography>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// ApprovedLine
// -----------------------------------------------------------
//
// Who stands behind the list of acts the report assessed: the
// person who approved it and when; or, for a report started
// without the review, that nobody looked at the list. A
// reviewed report whose approver's name is gone (the account
// was removed) says the date alone rather than "without a
// review", which would be false. A report from before the
// review existed carries no stamp and shows no line.
//
// Used by:
//   - ReportActs (below)
// -----------------------------------------------------------

function ApprovedLine({ report }) {
  const t = useTranslations('PAGES.report.ACTS');
  const fmt = useFormat();
  if (!report.scopeApprovedAt) return null;
  const date = fmt.dateTime(report.scopeApprovedAt);
  let line = t('scopeUnattended');
  if (report.scopeApprovedByName) line = t('scopeApprovedBy', { name: report.scopeApprovedByName, date });
  else if (report.scope?.review) line = t('scopeApprovedAt', { date });
  return <Typography variant="body2" color="text.secondary">{line}</Typography>;
}







// -----------------------------------------------------------
// ActGroups
// -----------------------------------------------------------
//
// Splits report.acts by what the report did with them, each
// group in the report's own order, and hands each card
// whether it is outdated. The acts a person decided against
// the verdict come out first, into their two groups; every
// other act goes where it always went. An act without an id,
// or repeating one, is still shown. Owns which folded group
// is open (kept per report). With a `review` (the approval
// screen) every card carries its switch. The row of the
// company's own requirements is no act: it is taken out
// before the acts are split and shown last, without a switch.
//
// Used by:
//   - ReportActs (below) — a report past its approval
//   - ReportScope.jsx — the approval screen
// -----------------------------------------------------------

export function ActGroups({ report, review = null }) {

  const t = useTranslations('PAGES.report.ACTS');
  const [open, setOpen] = useSessionState(`report.${report.id}.actGroups`, {}, isOpenGroups);
  const toggle = (group) => (expanded) => setOpen((current) => ({ ...current, [group]: expanded }));
  const rows = report.acts || [];
  const acts = rows.filter((act) => !isInternal(act));
  const chosen = acts.filter((act) => actChoice(act) === 'chosen');
  const leftOut = acts.filter((act) => actChoice(act) === 'leftOut');
  const plain = acts.filter((act) => actChoice(act) === null);
  const of = (assessment) => plain.filter((act) => !act.screenedOut && actAssessment(act) === assessment);
  const assessed = of('assessed');
  // An act that binds indirectly says through what: a
  // directive through national law, any other through the
  // authority it organises
  const directives = of('indirect').filter((act) => act.docType === 'directive');
  const institutional = of('indirect').filter((act) => act.docType !== 'directive');
  const screened = plain.filter((act) => act.screenedOut);
  const keyOf = rowKeys(rows);
  // serializers.py names an outdated act by its short title,
  // else its full title; a screened-out act was never read
  const outdated = new Set(Array.isArray(report.outdatedActs) ? report.outdatedActs : []);
  const isOutdated = (act) => !act.screenedOut && outdated.has(act.shortTitle || act.documentTitle);
  const shared = { isOutdated, keyOf, review };


  return (
    <div className="flex flex-col gap-4">
      {assessed.length === 0
        ? <SectionCard title={t('assessed')}><Typography color="text.secondary">{t('none')}</Typography></SectionCard>
        : <ActSection title={t('assessed')} acts={assessed} {...shared} />}
      <ActSection title={t('chosen')} hint={t('chosenHint')} acts={chosen} {...shared} />
      <ActSection title={t('upcoming')} hint={t('upcomingHint')} acts={of('upcoming')} {...shared} />
      <ActSection title={t('unconfirmed')} hint={t('unconfirmedHint')} acts={of('unconfirmed')} {...shared} />
      <ActSection title={t('leftOut')} hint={t('leftOutHint')} acts={leftOut} {...shared} />
      <ActGroup title={t('indirect', { count: directives.length })} hint={t('indirectHint')} acts={directives} {...shared}
                open={Boolean(open.indirect)} onToggle={toggle('indirect')} />
      <ActGroup title={t('institutional', { count: institutional.length })} hint={t('institutionalHint')} acts={institutional} {...shared}
                open={Boolean(open.institutional)} onToggle={toggle('institutional')} />
      <ActGroup title={t('notApplicable', { count: of('none').length })} acts={of('none')} {...shared}
                open={Boolean(open.notApplicable)} onToggle={toggle('notApplicable')} />
      <ActGroup title={t('screenedOut', { count: screened.length })} acts={screened} {...shared}
                open={Boolean(open.screenedOut)} onToggle={toggle('screenedOut')} />
      <OwnRequirements rows={rows.filter(isInternal)} keyOf={keyOf} />
    </div>
  );
}







// -----------------------------------------------------------
// ReportActs (default export)
// -----------------------------------------------------------
//
// The acts tab of a report past its approval: the line
// saying who approved the list of acts, then the groups.
//
// Used by:
//   - ReportDetail.jsx — the acts tab
// -----------------------------------------------------------

export default function ReportActs({ report }) {
  return (
    <div className="flex flex-col gap-3">
      <ApprovedLine report={report} />
      <ActGroups report={report} />
    </div>
  );
}
