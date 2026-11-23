// -----------------------------------------------------------
//  [*] RulesPanel — the rules of a kind, kept or broken
//
//  The backend checks every product against the rules of its
//  kind and sends one row per rule: kept, or broken — and
//  then either blocking, which keeps the product from
//  approval, or a note for the reviewer. The panel stands
//  above the content of a draft the whole time, so the
//  person who edits sees what an approval still waits for.
//
//  It opens with the verdict in a sentence: how many
//  blocking rules are broken, or that none is. Then every
//  rule in the words the exported file uses, the broken ones
//  first, each with its state in words beside an icon — never
//  by colour alone; a kept rule says so quietly, so the
//  broken ones stand out — and, for a broken rule, the detail the
//  backend gives (the ids or names that broke it). While the
//  draft has unsaved edits the panel says that the rules are
//  checked again on the save: what it shows is what the
//  server last saw.
//
//  Split into (root component last):
//
//    STATES     — how a rule's state looks
//    stateOf    — a check's state
//    RuleRow    — one rule
//    RulesPanel — the panel (default export)
// -----------------------------------------------------------

import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslations } from '@/i18n';
import SectionCard from '@/components/SectionCard/SectionCard';
import { brokenRules, listOf } from '@/pages/Programme/programmeUtils';


// A state's icon, the colour of the icon and of the state's
// word, and its place in the list — what stops an approval
// comes first
const STATES = {
  broken: { Icon: ErrorOutlineIcon, tone: 'text-red-700', order: 0 },
  note: { Icon: InfoOutlinedIcon, tone: 'text-amber-700', order: 1 },
  kept: { Icon: CheckCircleOutlineIcon, tone: 'text-green-700', order: 2 },
};







// -----------------------------------------------------------
// stateOf
// -----------------------------------------------------------
//
// A check's state: kept, broken (a blocking rule) or a note
// (a rule that never blocks).
//
// Used by:
//   - RuleRow, RulesPanel (below)
// -----------------------------------------------------------

function stateOf(check) {
  if (check.ok !== false) return 'kept';
  return check.blocking === false ? 'note' : 'broken';
}







// -----------------------------------------------------------
// RuleRow
// -----------------------------------------------------------
//
// One rule: its state as an icon and a word, the rule's
// sentence, and under a broken rule what broke it. A rule
// this build has no sentence for is shown by its id.
//
// Used by:
//   - RulesPanel (below)
// -----------------------------------------------------------

function RuleRow({ check }) {

  const t = useTranslations('PAGES.programme.RULES');
  const state = stateOf(check);
  const { Icon, tone } = STATES[state];
  const key = `NAMES.${check.rule}`;
  const sentence = t(key);


  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon sx={{ fontSize: 18 }} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0">
        <span>{sentence === key ? String(check.rule ?? '—') : sentence}</span>
        <span className={`ml-1.5 ${state === 'kept' ? 'text-muted' : `font-semibold ${tone}`}`}>— {t(state)}</span>
        {state !== 'kept' && check.detail && <div className="text-muted [overflow-wrap:anywhere]">{String(check.detail)}</div>}
      </div>
    </li>
  );
}







// -----------------------------------------------------------
// RulesPanel (default export)
// -----------------------------------------------------------
//
// The panel of a draft's checks; `stale` says the draft has
// unsaved edits the checks have not seen. Renders nothing
// when the product carries no checks at all.
//
// Used by:
//   - ProductPage.jsx — above the tabs of a draft
// -----------------------------------------------------------

export default function RulesPanel({ checks, stale = false }) {

  const t = useTranslations('PAGES.programme.RULES');
  const rows = listOf(checks);
  const { blocking } = brokenRules(rows);
  const ordered = [...rows].sort((a, b) => STATES[stateOf(a)].order - STATES[stateOf(b)].order);


  if (rows.length === 0) return null;
  return (
    <SectionCard title={t('title')} subtitle={t('hint')} className="mb-4">
      <div className="flex flex-col gap-3">
        <Alert severity={blocking.length ? 'warning' : 'success'} role="status" id="programme-rules-verdict">
          {blocking.length ? t('blocked', { count: blocking.length }) : t('allKept')}
        </Alert>
        <ul className="list-none m-0 p-0 grid gap-x-8 gap-y-2 lg:grid-cols-2">
          {ordered.map((check, index) => <RuleRow key={`${check.rule}-${index}`} check={check} />)}
        </ul>
        {stale && <Typography variant="body2" color="text.secondary">{t('stale')}</Typography>}
      </div>
    </SectionCard>
  );
}
