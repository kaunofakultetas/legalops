// -----------------------------------------------------------
//  [*] IconAction — an icon button that says what it does
//
//  The accessible name sits on the BUTTON (aria-label), not
//  on the tooltip's wrapper: Tooltip is in describeChild mode
//  and the span it needs (a disabled button fires no hover
//  events) carries no label of its own. `to` renders a router
//  link, `href` an external link in a new tab, otherwise a
//  plain button.
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';







// -----------------------------------------------------------
// IconAction (default export)
// -----------------------------------------------------------
//
//   <IconAction label="Redaguoti" icon={<EditIcon />} onClick={…} />
//   <IconAction label="Atidaryti" icon={…} to="/reports/1" />
//
// Used by:
//   - row and card actions: Users, Jobs, CorpusCatalogue,
//     ObligationsPanel, CompanyCredentials, CompanyDocuments,
//     CompanyRoles
//   - Sidebar.jsx — the phone drawer's close button
//   - DocumentDrawer.jsx, UnitViewer.jsx, the chat's
//     CompanyPanel.jsx and ThreadLink.jsx — panel buttons
//   - the chat's Chat.jsx — the header's conversations
//     button below sm
//   - McpServerDialog.jsx (a header row), CitationChecker.jsx
//     (a citation row) — the remove buttons
// -----------------------------------------------------------

export default function IconAction({ label, icon, onClick, to, href, disabled = false, color = 'default', size = 'small', ...rest }) {

  const common = { 'aria-label': label, disabled, color, size, ...rest };


  let button = <IconButton onClick={onClick} {...common}>{icon}</IconButton>;
  if (to && !disabled) button = <IconButton component={Link} to={to} {...common}>{icon}</IconButton>;
  if (href && !disabled) button = <IconButton component="a" href={href} target="_blank" rel="noopener noreferrer" {...common}>{icon}</IconButton>;


  return (
    <Tooltip title={label} describeChild>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  );
}
