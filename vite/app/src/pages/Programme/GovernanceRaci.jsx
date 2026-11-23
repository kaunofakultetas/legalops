// -----------------------------------------------------------
//  [*] GovernanceRaci — the process and who does what in it
//
//  The "process and RACI" tab of a governance product. First
//  the compliance management process, step by step
//  (GovernanceProcess.jsx). Then the RACI matrix that gives
//  every step to the roles of the structure — steps down, in
//  the process's own order, roles across.
//
//  A role is a node of the structure; the matrix shows only
//  the roles that hold a letter in some step. A cell holds
//  one letter — R responsible, A accountable, C consulted, I
//  informed — or "AR" where the role that does the work also
//  answers for it. As in the exported file, the accountable
//  cell is filled in ink and the responsible one in pale
//  blue; the letter itself always stands in the cell, so the
//  fill only repeats it. The roles' names run up their
//  columns, which keeps a matrix of twenty roles on a
//  screen; the table scrolls sideways inside its sheet when
//  it still does not fit, the steps staying in view — in a
//  narrower column on a phone, so that some roles fit beside
//  them.
//
//  The golden rule of RACI — every step has exactly one
//  accountable role and at least one responsible one — is
//  checked on the page for every step as the cells stand
//  right now: a step that breaks it is marked on its row, in
//  words, the moment a cell changes, before anything is
//  saved. The backend's own check follows on the save and
//  decides whether the product can be approved.
//
//  In a draft being edited each cell is a small select,
//  named after its step and its role, and a role that holds
//  no letter yet can be added as a column. The steps are
//  edited above the matrix: a step added at the end has no
//  letters, so its row carries the golden rule's mark at
//  once; a step removed takes its letters with it.
//
//  Split into (root component last):
//
//    LETTERS      — the choices of a cell
//    tintOf       — a letter's fill
//    GoldenMark   — a step's breach of the golden rule
//    RaciMatrix   — the matrix
//    AddRole      — the select that adds a column
//    GovernanceRaci — the tab (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useTranslations } from '@/i18n';
import SectionCard from '@/components/SectionCard/SectionCard';
import { CellSelect } from '@/pages/Programme/EditFields';
import GovernanceProcess from '@/pages/Programme/GovernanceProcess';
import { RACI_TINTS, RACI_VALUES, goldenRule, listOf, nextId, patchAt, raciValue } from '@/pages/Programme/programmeUtils';
import { ROW, SCROLL, TH } from '@/pages/Programme/tableClasses';


// What a cell may be set to: nothing, or one of the letters
const LETTERS = [{ value: '', label: '—' }, ...RACI_VALUES.map((value) => ({ value, label: value }))];







// -----------------------------------------------------------
// tintOf
// -----------------------------------------------------------
//
// The fill of a cell by its letter: ink for the accountable
// role ("A" and "AR"), pale blue for a responsible one, none
// for the rest.
//
// Used by:
//   - RaciMatrix (below)
// -----------------------------------------------------------

function tintOf(value) {
  if (value.includes('A')) return RACI_TINTS.accountable;
  return value === 'R' ? RACI_TINTS.responsible : undefined;
}







// -----------------------------------------------------------
// GoldenMark
// -----------------------------------------------------------
//
// What a step lacks under the golden rule, in words under
// its name: not exactly one accountable role, no responsible
// one, or both. The box is a status that is always there —
// empty while the step keeps the rule — so a screen reader
// hears the breach when a changed cell causes it.
//
// Used by:
//   - RaciMatrix (below)
// -----------------------------------------------------------

function GoldenMark({ rule }) {
  const t = useTranslations('PAGES.programme.GOVERNANCE');
  return (
    <div role="status">
      {!rule.kept && (
        <div className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-700">
          <ErrorOutlineIcon sx={{ fontSize: 15 }} className="shrink-0" aria-hidden />
          <span>
            {[rule.accountable !== 1 && t('goldenAccountable', { count: rule.accountable }), !rule.responsible && t('goldenResponsible')].filter(Boolean).join(' ')}
          </span>
        </div>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// RaciMatrix
// -----------------------------------------------------------
//
// The matrix: a row per step, a column per role. A cell
// shows its letter on its fill, or — `onSet` given, a draft
// being edited — a select that sets it. The step column
// stays in view while the table scrolls sideways.
//
// Used by:
//   - GovernanceRaci (below)
// -----------------------------------------------------------

function RaciMatrix({ steps, roles, raci, onSet = null }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');


  return (
    <div className={SCROLL}>
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-40 min-w-40 sm:w-80 sm:min-w-64 sticky left-0 z-[1] bg-surface`}>{t('step')}</th>
            {roles.map((role) => (
              <th key={role.id} scope="col" className={`px-1 pb-1.5 align-bottom font-normal ${onSet ? 'min-w-16' : 'min-w-12'}`}>
                <span className="inline-block max-h-48 text-left text-[0.8125rem] leading-tight [writing-mode:vertical-rl] rotate-180">{role.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <tr key={step.id ?? index} className={ROW}>
              <th scope="row" className="py-2 pr-4 text-left font-normal align-top sticky left-0 z-[1] bg-surface">
                <span>{index + 1}. {step.name || t('newStep')}</span>
                <GoldenMark rule={goldenRule(raci, step.id)} />
              </th>
              {roles.map((role) => {
                const value = raciValue(raci, step.id, role.id);
                return (
                  <td key={role.id} className="p-0.5 text-center align-middle font-bold border-l border-edge" style={tintOf(value)}>
                    {onSet
                      ? <CellSelect label={t('cell', { step: step.name || t('newStep'), role: role.name })} value={value} options={LETTERS} onChange={(next) => onSet(step.id, role.id, next)} className="w-14 font-normal" />
                      : <span className="inline-block min-h-8 leading-8">{value}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// AddRole
// -----------------------------------------------------------
//
// The select under the matrix of a draft being edited: the
// nodes of the structure that hold no letter yet. Choosing
// one adds its column. Nothing when every node has one.
//
// Used by:
//   - GovernanceRaci (below)
// -----------------------------------------------------------

function AddRole({ nodes, onAdd }) {
  const t = useTranslations('PAGES.programme.GOVERNANCE');
  if (nodes.length === 0) return null;
  const options = [{ value: '', label: t('addRoleChoose') }, ...nodes.map((node) => ({ value: node.id, label: node.name }))];
  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
      <span aria-hidden>{t('addRole')}</span>
      <CellSelect label={t('addRole')} value="" options={options} onChange={(id) => id && onAdd(id)} />
    </div>
  );
}







// -----------------------------------------------------------
// GovernanceRaci (default export)
// -----------------------------------------------------------
//
// The process and the matrix of the content as it stands.
// The roles shown are the nodes that hold a letter, in the
// structure's order, and those added here while editing —
// kept by this component, since a role without a letter is
// not in the content. A step added here gets an id none of
// the others has; a step removed takes its cells out of the
// matrix. `change` takes a function from the content to the
// edited content.
//
// Used by:
//   - ProductPage.jsx — the process tab of a governance
//     product
// -----------------------------------------------------------

export default function GovernanceRaci({ content, editing, change }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const [added, setAdded] = useState([]);
  const steps = listOf(content.process);
  const nodes = listOf(content.structure);
  const raci = listOf(content.raci);
  const holding = new Set(raci.map((cell) => cell.roleId));
  const roles = nodes.filter((node) => holding.has(node.id) || (editing && added.includes(node.id)));


  // One letter a role and step: the cell is replaced, or
  // taken out when it is set to nothing
  const setCell = (stepId, roleId, value) => change((current) => {
    const rest = listOf(current.raci).filter((cell) => !(cell.stepId === stepId && cell.roleId === roleId));
    return { ...current, raci: value ? [...rest, { stepId, roleId, value }] : rest };
  });


  const patchStep = (index, fields) => change((current) => ({ ...current, process: patchAt(listOf(current.process), index, fields) }));
  const removeStep = (index) => change((current) => {
    const gone = listOf(current.process)[index]?.id;
    return { ...current, process: listOf(current.process).filter((_, at) => at !== index), raci: listOf(current.raci).filter((cell) => cell.stepId !== gone) };
  });
  const addStep = () => change((current) => ({
    ...current, process: [...listOf(current.process), { id: nextId(listOf(current.process), 's'), name: '', description: '', frequency: '', basis: [] }],
  }));


  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('process')}
                   actions={editing ? <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addStep}>{t('addStep')}</Button> : null}>
        <GovernanceProcess steps={steps} onPatch={editing ? patchStep : null} onRemove={editing ? removeStep : null} />
      </SectionCard>
      <SectionCard title={t('raci')} subtitle={t('raciKey')}>
        {steps.length === 0
          ? <Typography variant="body2" color="text.secondary">{t('noSteps')}</Typography>
          : <RaciMatrix steps={steps} roles={roles} raci={raci} onSet={editing ? setCell : null} />}
        {editing && steps.length > 0 && <AddRole nodes={nodes.filter((node) => !roles.includes(node))} onAdd={(id) => setAdded((current) => [...current, id])} />}
      </SectionCard>
    </div>
  );
}
