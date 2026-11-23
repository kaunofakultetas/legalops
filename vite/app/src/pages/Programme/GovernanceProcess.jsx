// -----------------------------------------------------------
//  [*] GovernanceProcess — the compliance process, step by
//      step
//
//  The steps of a governance product's compliance management
//  process, in their order: what is done in each, how often,
//  and what it rests on — a clause of ISO 37301 or a
//  paragraph of the Bank of Lithuania's guidelines. Read,
//  they are a table.
//
//  In a draft being edited every step is a small form: its
//  name, what is done, the frequency, and its basis as a list
//  of entries, each a source and a short reference, that
//  takes additions and removals. A step can be removed whole
//  — its letters leave the RACI matrix with it, which the
//  tab's root sees to — and the tab adds new ones at the end.
//  A step needs a name to be kept by the backend; the process
//  needs five of them, and each a known clause, for the
//  rules of the kind.
//
//  Split into (root component last):
//
//    StepsRead         — the steps as a table
//    BasisEdit         — a step's basis as an editable list
//    StepEdit          — one step as a form
//    GovernanceProcess — the steps, read or edited (default
//                        export)
// -----------------------------------------------------------

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslations } from '@/i18n';
import IconAction from '@/components/IconAction/IconAction';
import { CellSelect } from '@/pages/Programme/EditFields';
import { SOURCES, listOf, patchAt, withoutAt } from '@/pages/Programme/programmeUtils';
import { ROW, SCROLL, TABLE, TD, TH } from '@/pages/Programme/tableClasses';







// -----------------------------------------------------------
// StepsRead
// -----------------------------------------------------------
//
// The steps in their order: the step's name over what is
// done in it, how often, and what it rests on.
//
// Used by:
//   - GovernanceProcess (below)
// -----------------------------------------------------------

function StepsRead({ steps }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');


  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[48rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-8`}><span className="sr-only">#</span></th>
            <th scope="col" className={TH}>{t('step')}</th>
            <th scope="col" className={`${TH} w-[26%]`}>{t('frequency')}</th>
            <th scope="col" className={`${TH} w-[14%]`}>{t('restsOn')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <tr key={step.id ?? index} className={ROW}>
              <td className={`${TD} text-muted tabular-nums`}>{index + 1}</td>
              <td className={TD}>
                <div className="font-semibold">{step.name}</div>
                <div className="max-w-[80ch]">{step.description}</div>
              </td>
              <td className={TD}>{step.frequency}</td>
              <td className={TD}>
                {listOf(step.basis).map((entry, at) => <div key={at} className="whitespace-nowrap">{[entry.source, entry.ref].filter(Boolean).join(' ')}</div>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// BasisEdit
// -----------------------------------------------------------
//
// What a step rests on, as rows of a source and a reference
// — a clause number, a paragraph number — each with a remove
// button, and a button that adds a row. A new row starts on
// the first source with an empty reference; the backend
// keeps only the rows that have one. `onChange` takes the
// whole list.
//
// Used by:
//   - StepEdit (below)
// -----------------------------------------------------------

function BasisEdit({ basis, onChange }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const sources = SOURCES.map((value) => ({ value, label: value }));


  return (
    <div className="flex flex-col gap-2">
      <Typography variant="caption" color="text.secondary">{t('restsOn')}</Typography>
      {basis.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 flex-wrap">
          <CellSelect label={t('basisSource', { number: index + 1 })} value={entry.source} options={sources} className="h-10"
                      onChange={(source) => onChange(patchAt(basis, index, { source }))} />
          <TextField size="small" label={t('basisRef', { number: index + 1 })} value={String(entry.ref ?? '')} className="w-40"
                     onChange={(event) => onChange(patchAt(basis, index, { ref: event.target.value }))} />
          <IconAction label={t('removeBasis', { number: index + 1 })} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => onChange(withoutAt(basis, index))} />
        </div>
      ))}
      <div>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...basis, { source: SOURCES[0], ref: '' }])}>{t('addBasis')}</Button>
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// StepEdit
// -----------------------------------------------------------
//
// One step as a form, a region named by its number and name
// so that the same four fields of fourteen steps can be told
// apart: the name, what is done, the frequency, the basis,
// and the button that removes the step. `onChange` takes the
// changed fields of the step.
//
// Used by:
//   - GovernanceProcess (below)
// -----------------------------------------------------------

function StepEdit({ step, number, onChange, onRemove }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const name = step.name || t('newStep');


  return (
    <Paper variant="outlined" component="section" aria-label={t('stepLabel', { number, name })} className="p-3 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span className="pt-2 w-6 shrink-0 text-muted tabular-nums">{number}</span>
        <TextField size="small" fullWidth label={t('stepName')} value={String(step.name ?? '')} onChange={(event) => onChange({ name: event.target.value })} />
        <Button color="delete" size="small" startIcon={<DeleteOutlineIcon />} className="shrink-0 mt-0.5" aria-label={t('removeStep', { name })} onClick={onRemove}>
          {t('removeShort')}
        </Button>
      </div>
      <div className="pl-8 flex flex-col gap-3">
        <TextField size="small" fullWidth multiline minRows={2} label={t('what')} value={String(step.description ?? '')}
                   onChange={(event) => onChange({ description: event.target.value })} />
        <TextField size="small" fullWidth multiline label={t('frequency')} value={String(step.frequency ?? '')} onChange={(event) => onChange({ frequency: event.target.value })} />
        <BasisEdit basis={listOf(step.basis)} onChange={(basis) => onChange({ basis })} />
      </div>
    </Paper>
  );
}







// -----------------------------------------------------------
// GovernanceProcess (default export)
// -----------------------------------------------------------
//
// The steps as a table, or — `onPatch` given, a draft being
// edited — as forms. `onPatch` takes a step's index and its
// changed fields, `onRemove` the index of the step to drop.
// A process without steps says so.
//
// Used by:
//   - GovernanceRaci.jsx — the first sheet of the tab
// -----------------------------------------------------------

export default function GovernanceProcess({ steps, onPatch = null, onRemove = null }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');


  if (steps.length === 0) return <Typography variant="body2" color="text.secondary">{t('noSteps')}</Typography>;
  if (!onPatch) return <StepsRead steps={steps} />;
  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <StepEdit key={step.id ?? index} step={step} number={index + 1} onChange={(fields) => onPatch(index, fields)} onRemove={() => onRemove(index)} />
      ))}
    </div>
  );
}
