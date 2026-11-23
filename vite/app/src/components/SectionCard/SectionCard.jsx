// -----------------------------------------------------------
//  [*] SectionCard — a titled white card
//
//  The one card shape of the detail pages: an h2 title with
//  optional subtitle and actions on the right, then the body.
//  The title labels the <section> for screen readers.
// -----------------------------------------------------------

import { useId } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';







// -----------------------------------------------------------
// SectionCard (default export)
// -----------------------------------------------------------
//
// A sheet with a hairline (the theme's Paper); the header
// row shows only when there is a title or actions.
//
// Used by:
//   - Dashboard and every detail page (company, report,
//     corpus act, prompt editor, usage)
// -----------------------------------------------------------

export default function SectionCard({ title, subtitle, actions = null, children, className = '', bodyClassName = '' }) {

  const id = useId();


  return (
    <Paper component="section" aria-labelledby={title ? id : undefined} className={`p-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
          <div className="min-w-0">
            {title && <Typography id={id} variant="h6" component="h2">{title}</Typography>}
            {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
          </div>
          {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Paper>
  );
}
