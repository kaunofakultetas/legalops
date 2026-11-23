// -----------------------------------------------------------
//  [*] ActionState — an action's state, as a chip
//
//  The one place the state of an action of the register
//  becomes a chip: open neutral, in work in the info blue,
//  late in the warning tone, done — carried out and waiting
//  for the re-test — in ink, closed in green (StatusChip's
//  `action` table). The words carry the state and the colour
//  only repeats it; the late chip also wears the warning
//  mark, the one state that calls for a person. A state this
//  build does not know is shown by its own name, in the
//  neutral tone.
// -----------------------------------------------------------

import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import StatusChip from '@/components/StatusChip/StatusChip';
import useEnumLabel from '@/hooks/useEnumLabel';







// -----------------------------------------------------------
// ActionState (default export)
// -----------------------------------------------------------
//
// The chip of one state, labelled in the interface language
// from the actionState enum.
//
// Used by:
//   - ActionRow.jsx — every action of the register
// -----------------------------------------------------------

export default function ActionState({ state, className = '' }) {
  const label = useEnumLabel();
  return (
    <StatusChip kind="action" value={state} label={label('actionState', state)} className={className}
                icon={state === 'late' ? <WarningAmberOutlinedIcon aria-hidden /> : undefined} />
  );
}
