// -----------------------------------------------------------
//  [*] TriStateField — yes / no / unknown
//
//  The company flags (uses AI, provides AI, processes
//  personal data, public sector) are tri-state on the wire:
//  true / false / null, and null means "nobody said" — the
//  analysis then keeps the acts the flag would rule out. A
//  checkbox cannot say "unknown", so this is a labelled
//  three-way toggle; the pressed state is announced by the
//  buttons (aria-pressed), not by colour alone.
// -----------------------------------------------------------

import { useId } from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';


// The toggle's own value → the wire value (null cannot be
// a toggle value, hence the 'unknown' stand-in)
const FROM_TOGGLE = { yes: true, no: false, unknown: null };







// -----------------------------------------------------------
// toToggle
// -----------------------------------------------------------
//
// The wire value → the toggle's value; anything that is not
// a boolean reads as unknown.
//
// Used by:
//   - TriStateField (below)
// -----------------------------------------------------------

function toToggle(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}







// -----------------------------------------------------------
// TriStateField (default export)
// -----------------------------------------------------------
//
//   <TriStateField label="Naudoja DI" value={form.usesAi}
//                  onChange={(v) => set('usesAi', v)} />
//
// Clicking the pressed button again keeps the value (the
// group would otherwise report "nothing selected").
//
// Used by:
//   - CompanyProfile.jsx — the four flags
// -----------------------------------------------------------

export default function TriStateField({ label, value, onChange, disabled = false, helperText }) {

  const t = useTranslations('COMPONENTS.common');
  const id = useId();
  const helperId = `${id}-helper`;


  // The helper text describes the group, so a screen reader
  // hears it with the buttons, not only when reading on
  return (
    <div role="group" aria-labelledby={id} aria-describedby={helperText ? helperId : undefined} className="flex flex-col gap-1">
      <Typography id={id} variant="body2" color="text.secondary">{label}</Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={toToggle(value)}
        disabled={disabled}
        onChange={(_, next) => { if (next) onChange(FROM_TOGGLE[next]); }}
      >
        <ToggleButton value="yes" className="px-4">{t('yes')}</ToggleButton>
        <ToggleButton value="no" className="px-4">{t('no')}</ToggleButton>
        <ToggleButton value="unknown" className="px-4">{t('unknown')}</ToggleButton>
      </ToggleButtonGroup>
      {helperText && <Typography id={helperId} variant="caption" color="text.secondary">{helperText}</Typography>}
    </div>
  );
}
