// -----------------------------------------------------------
//  [*] EditFields — the small controls a draft is edited with
//
//  The editing views of the three kinds are built from the
//  same few pieces, kept here so they look and behave alike:
//
//    - ChoiceField — one value out of a fixed few, as a
//      labelled field. It is the browser's own select inside
//      the theme's field frame: the options are few, a table
//      may hold dozens of these, and the native control costs
//      nothing to render and works with every keyboard.
//    - CellSelect — the same choice without a frame of its
//      own, for a cell of a table; its accessible name is
//      given by the caller, since a cell has no room for a
//      visible label.
//    - TextList — a list of short texts (decisions, actions,
//      owners): a field per item with a button that removes
//      it, and a button that adds an empty one.
//
//  Every control reports the new value; none keeps state of
//  its own — the draft lives in the page.
//
//  Split into:
//
//    CELL_SELECT — the frame of a select in a table cell
//    ChoiceField — a labelled choice (named export)
//    CellSelect  — a choice in a table cell (named export)
//    TextList    — an editable list of texts (named export)
// -----------------------------------------------------------

import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslations } from '@/i18n';


// A bare select as a table cell wears it: the field outline,
// the sheet's ground, the ink focus ring
const CELL_SELECT = 'h-8 max-w-full rounded border border-field bg-surface px-1 text-sm text-content focus-visible:outline-2 focus-visible:outline-primary';







// -----------------------------------------------------------
// ChoiceField
// -----------------------------------------------------------
//
// One value out of `options` ({value, label} each) as a
// labelled field. The value travels as the option's own
// value: a number stays a number, null stays null — the
// select itself only knows text, so the choice is read back
// by its place in the list.
//
// Used by:
//   - PolicyDocuments.jsx — a missing document's level and
//     priority
//   - ScenarioEditor.jsx — a scenario's scores and response
// -----------------------------------------------------------

export function ChoiceField({ label, value, options, onChange, className = '' }) {
  const index = options.findIndex((option) => option.value === value);
  return (
    <TextField select size="small" label={label} value={index < 0 ? '' : String(index)} className={className}
               onChange={(event) => onChange(options[Number(event.target.value)]?.value)}
               slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
      {index < 0 && <option value="" />}
      {options.map((option, at) => <option key={at} value={String(at)}>{option.label}</option>)}
    </TextField>
  );
}







// -----------------------------------------------------------
// CellSelect
// -----------------------------------------------------------
//
// The same choice inside a table cell: no frame, no visible
// label — `label` is its accessible name.
//
// Used by:
//   - GovernanceRaci.jsx — a cell of the matrix, the role to
//     add
//   - GovernanceProcess.jsx — the source of a step's basis
//   - GovernanceStructure.jsx, PolicyDocuments.jsx — a row's
//     choices
// -----------------------------------------------------------

export function CellSelect({ label, value, options, onChange, className = '' }) {
  const index = options.findIndex((option) => option.value === value);
  return (
    <select aria-label={label} value={index < 0 ? '' : String(index)} className={`${CELL_SELECT} ${className}`}
            onChange={(event) => onChange(options[Number(event.target.value)]?.value)}>
      {index < 0 && <option value="" />}
      {options.map((option, at) => <option key={at} value={String(at)}>{option.label}</option>)}
    </select>
  );
}







// -----------------------------------------------------------
// TextList
// -----------------------------------------------------------
//
// A list of short texts, each in a field of its own with a
// remove button, and a button that adds an empty one.
// `itemLabel` names an item by its number (the field's
// label, and what the remove button says it removes).
//
// Used by:
//   - PolicyParts.jsx — a part's decisions
//   - ScenarioEditor.jsx — a scenario's actions and owners
// -----------------------------------------------------------

export function TextList({ items, onChange, itemLabel, addLabel, multiline = false }) {
  const t = useTranslations('PAGES.programme.LIST');
  const list = Array.isArray(items) ? items : [];
  return (
    <div className="flex flex-col gap-2">
      {list.map((item, index) => (
        <div key={index} className="flex items-start gap-1">
          <TextField size="small" fullWidth multiline={multiline} label={itemLabel(index + 1)} value={String(item ?? '')}
                     onChange={(event) => onChange(list.map((entry, at) => (at === index ? event.target.value : entry)))} />
          <IconButton aria-label={t('remove', { label: itemLabel(index + 1) })} onClick={() => onChange(list.filter((_, at) => at !== index))}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </div>
      ))}
      <div>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...list, ''])}>{addLabel}</Button>
      </div>
    </div>
  );
}
