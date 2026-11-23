// -----------------------------------------------------------
//  [*] FullPageMessage — a whole-screen notice
//
//  For the states where no page frame can render: the
//  session check could not reach the server, or the route
//  tree itself crashed. A centred card on the canvas with an
//  icon, a heading, a sentence, optional technical details
//  (collapsed) and the way out (buttons).
// -----------------------------------------------------------

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';







// -----------------------------------------------------------
// FullPageMessage (default export)
// -----------------------------------------------------------
//
// The notice as an alert sheet on the desk, floating like
// the login page's; the details fold away under their label.
//
// Used by:
//   - AuthGuard.jsx — ServerUnreachable
//   - pages/RouteError/RouteError.jsx — outside the frame
// -----------------------------------------------------------

export default function FullPageMessage({ icon: Icon, title, text, details, detailsLabel, actions }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-canvas p-4">
      <Paper className="w-full max-w-md p-6 sm:p-8 flex flex-col gap-3 shadow-float" role="alert">
        {Icon && <Icon color="action" sx={{ fontSize: 40 }} aria-hidden />}
        <Typography variant="h5" component="h1">{title}</Typography>
        {text && <Typography color="text.secondary">{text}</Typography>}
        {details && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">{detailsLabel}</summary>
            <pre className="whitespace-pre-wrap mt-2">{details}</pre>
          </details>
        )}
        {actions && <div className="flex gap-2 flex-wrap mt-2">{actions}</div>}
      </Paper>
    </div>
  );
}
