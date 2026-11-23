// -----------------------------------------------------------
//  [*] FindingStatusIcon — the verdict as a shape
//
//  The second channel next to the colour: a tick for met, a
//  half circle for partial, a cross for missing, a question
//  mark for "not evidenced", a bar for "not applicable" — so
//  the verdict reads in greyscale and for colour-blind
//  readers too.
// -----------------------------------------------------------

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContrastOutlinedIcon from '@mui/icons-material/ContrastOutlined';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';


// verdict → icon component
const ICONS = {
  met: CheckCircleOutlineIcon,
  partial: ContrastOutlinedIcon,
  missing: HighlightOffIcon,
  unknown: HelpOutlineIcon,
  not_applicable: DoNotDisturbAltOutlinedIcon,
};







// -----------------------------------------------------------
// FindingStatusIcon (default export)
// -----------------------------------------------------------
//
//   <FindingStatusIcon status="missing" fontSize="small" />
//
// Decorative (aria-hidden) — the label beside it speaks.
//
// Used by:
//   - ReportFindings.jsx — the verdict chips and filters, a
//     finding's earlier verdicts
//   - ReportOverview.jsx — the status bar legend
//   - pages/Companies/ActionRow.jsx — how a finding stood
//     when its action came into the register
//   - pages/Companies/LawChanges.jsx — the findings to look
//     at again
// -----------------------------------------------------------

export default function FindingStatusIcon({ status, ...props }) {
  const Icon = ICONS[status] || HelpOutlineIcon;
  return <Icon aria-hidden {...props} />;
}
