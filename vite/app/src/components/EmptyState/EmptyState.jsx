// -----------------------------------------------------------
//  [*] EmptyState — "nothing here yet", with a way forward
//
//  The centred icon, sentence and optional call to action a
//  list shows when it loaded fine but has no rows.
//
//  The words are a status message (role="status"): a search
//  or a filter that leaves nothing must reach a screen reader
//  without moving focus (WCAG 4.1.3) — politely, it is not a
//  failure. The icon is decoration; the call to action stays
//  outside the status, so it is not read out as part of the
//  message.
// -----------------------------------------------------------

import Typography from '@mui/material/Typography';







// -----------------------------------------------------------
// EmptyState (default export)
// -----------------------------------------------------------
//
// The icon, the title, an optional explaining sentence and
// an optional action, centred in the space the list leaves.
//
// Used by:
//   - every list page and tab (companies, reports, corpus,
//     obligations, jobs, prompts, MCP, audit, usage, the
//     company and report tabs) — its empty list
// -----------------------------------------------------------

export default function EmptyState({ icon: Icon, title, text, action = null, className = '' }) {
  return (
    <div className={`flex flex-col items-center text-center gap-2 py-10 px-4 ${className}`}>
      {Icon && <Icon className="text-muted" sx={{ fontSize: 40 }} aria-hidden />}
      <div role="status" className="flex flex-col items-center gap-2">
        <Typography variant="subtitle1" component="p">{title}</Typography>
        {text && <Typography variant="body2" color="text.secondary" className="max-w-lg">{text}</Typography>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
