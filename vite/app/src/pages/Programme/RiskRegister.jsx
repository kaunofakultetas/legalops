// -----------------------------------------------------------
//  [*] RiskRegister — the register of legal risk scenarios
//
//  The "register" tab of a risk product: the 5×5 matrix with
//  every scenario in the cell its levels put it in, then the
//  scenarios one by one as cards, in the register's order.
//
//  In a draft being edited each card carries two buttons:
//  one opens the scenario as a form in the card's place (one
//  at a time, so the page stays a register and not a wall of
//  fields), the other removes it. The backend numbers the
//  scenarios anew on every save, so after a removal the ids
//  shift once the save comes back — until then the page
//  keeps the ids it was given.
//
//  "Add a scenario" appends an empty one and opens its form.
//  It has no id of the register until the server numbers it
//  — it goes by "new scenario" — and none of its eight
//  scores is set: it reads "not scored", stays out of the
//  matrix, and the server's rules about a whole sentence, a
//  unit and a policy, and scores on the scale stay broken
//  until a person fills it in.
//
//  A scenario whose eight scores differ from what the server
//  last scored is "pending": the page shows neither its old
//  level nor one of its own making, in the matrix or on the
//  card, until the save answers.
//
//  Split into (root component last):
//
//    emptyScenario   — a scenario with nothing filled in
//    ScenarioActions — a card's edit and remove buttons
//    RiskRegister    — the tab (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useTranslations } from '@/i18n';
import SectionCard from '@/components/SectionCard/SectionCard';
import RiskMatrix from '@/pages/Programme/RiskMatrix';
import ScenarioCard from '@/pages/Programme/ScenarioCard';
import ScenarioEditor from '@/pages/Programme/ScenarioEditor';
import {
  IMPACT_DIMENSIONS, LIKELIHOOD_DIMENSIONS, NEW_SCENARIO, isNewScenario, listOf, patchAt, scenarioPending, scenarioUnset, withoutAt,
} from '@/pages/Programme/programmeUtils';







// -----------------------------------------------------------
// emptyScenario
// -----------------------------------------------------------
//
// A scenario as "add a scenario" appends it: every text
// empty, no policies, no provisions, the response the
// backend falls back to, and all eight scores unset — 0,
// never a level a person did not choose. Its id is a handle
// of the page's own, told apart from the others added in
// the same editing session by `number`.
//
// Used by:
//   - RiskRegister (below)
// -----------------------------------------------------------

function emptyScenario(number) {
  const unset = (dimensions) => ({ ...Object.fromEntries(dimensions.map((name) => [name, 0])), level: 0, why: '' });
  return {
    id: `${NEW_SCENARIO}${number}`, area: '', unit: '', sentence: '', event: '', source: '', consequences: '', objective: '',
    categories: [], sourceType: null, consequenceType: null, objectiveType: null, legalBasis: [], policies: [],
    internalConclusion: '', externalConclusion: '', likelihood: unset(LIKELIHOOD_DIMENSIONS), impact: unset(IMPACT_DIMENSIONS),
    score: 0, band: null, response: 'mitigate', actions: [], owners: [], deadline: '',
  };
}







// -----------------------------------------------------------
// ScenarioActions
// -----------------------------------------------------------
//
// The two buttons under a scenario's card in a draft being
// edited, each naming the scenario it acts on — by its id,
// or as "the new scenario".
//
// Used by:
//   - RiskRegister (below)
// -----------------------------------------------------------

function ScenarioActions({ scenario, onEdit, onRemove }) {
  const t = useTranslations('PAGES.programme.RISKS');
  const fresh = isNewScenario(scenario);
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit}>
        {fresh ? t('editNew') : t('editScenario', { id: scenario.id })}
      </Button>
      <Button size="small" color="delete" startIcon={<DeleteOutlineIcon />} onClick={onRemove}>
        {fresh ? t('removeNew') : t('removeScenario', { id: scenario.id })}
      </Button>
    </>
  );
}







// -----------------------------------------------------------
// RiskRegister (default export)
// -----------------------------------------------------------
//
// The matrix and the scenarios of the content as it stands;
// `saved` is the content the server last answered, which the
// pending scores are told against, and `documents` the
// company's documents a scenario's policies are picked from.
// The matrix gets only the scenarios whose place the server
// vouches for: not the pending ones, not the unscored.
// `change` takes a function from the content to the edited
// content.
//
// Used by:
//   - ProductPage.jsx — the register tab of a risk product
// -----------------------------------------------------------

export default function RiskRegister({ content, saved, documents, editing, change }) {

  const t = useTranslations('PAGES.programme.RISKS');
  // The id of the scenario open in the editor, if any, and
  // how many scenarios were added here — the next one's handle
  const [open, setOpen] = useState(null);
  const [added, setAdded] = useState(0);
  const scenarios = listOf(content.scenarios);
  const scored = Object.fromEntries(listOf(saved?.scenarios).map((scenario) => [scenario.id, scenario]));
  const pending = scenarios.filter((scenario) => !scenarioUnset(scenario) && scenarioPending(scenario, scored[scenario.id])).map((scenario) => scenario.id);
  const placed = scenarios.filter((scenario) => !scenarioUnset(scenario) && !pending.includes(scenario.id));
  const nameOf = (scenario) => (isNewScenario(scenario) ? t('newScenario') : scenario.id);


  const patch = (index, fields) => change((current) => ({ ...current, scenarios: patchAt(listOf(current.scenarios), index, fields) }));
  const remove = (index) => change((current) => ({ ...current, scenarios: withoutAt(listOf(current.scenarios), index) }));
  const add = () => {
    const scenario = emptyScenario(added + 1);
    setAdded(added + 1);
    change((current) => ({ ...current, scenarios: [...listOf(current.scenarios), scenario] }));
    setOpen(scenario.id);
  };


  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('matrix')}>
        <RiskMatrix scenarios={placed} appetite={content.appetite} pending={pending} />
      </SectionCard>
      <SectionCard title={`${t('scenarios')} (${scenarios.length})`}
                   actions={editing ? <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={add}>{t('addScenario')}</Button> : null}>
        {scenarios.length === 0 && <Typography variant="body2" color="text.secondary">{t('noScenarios')}</Typography>}
        <div className="flex flex-col gap-3">
          {scenarios.map((scenario, index) => (editing && open === scenario.id
            ? (
              <ScenarioEditor key={scenario.id ?? index} scenario={scenario} name={nameOf(scenario)} documents={documents} pending={pending.includes(scenario.id)}
                              closeLabel={isNewScenario(scenario) ? t('closeNew') : t('closeScenario', { id: scenario.id })}
                              onChange={(fields) => patch(index, fields)} onDone={() => setOpen(null)} />
            )
            : (
              <ScenarioCard key={scenario.id ?? index} scenario={scenario} name={nameOf(scenario)} pending={pending.includes(scenario.id)}
                            actions={editing ? <ScenarioActions scenario={scenario} onEdit={() => setOpen(scenario.id)} onRemove={() => remove(index)} /> : null} />
            )))}
        </div>
      </SectionCard>
    </div>
  );
}
