// -----------------------------------------------------------
//  [*] StatTile — one headline number
//
//  The figure contract: a sentence-case label, the value in
//  the UI sans (semibold; Source Sans 3's figures are
//  tabular, so a row of tiles lines up), an optional
//  secondary line; `to` makes the whole tile a link — it
//  lifts a little and outlines in ink under the pointer, so
//  it reads as one — and `icon` (status icons) keeps a
//  coloured state readable without colour. `symbol` is an
//  icon for what the number counts, set beside it in a small
//  square of the page's own colour — the label names the tile
//  either way, so the symbol is hidden from screen readers.
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';







// -----------------------------------------------------------
// StatTile (default export)
// -----------------------------------------------------------
//
// A missing value shows a dash, never a misleading zero; a
// symbol sits at the far end of the number's line, so a long
// label keeps the tile's whole width.
//
// Used by:
//   - Dashboard.jsx — the counters
//   - pages/Reports/ReportOverview.jsx — the KPI row
//   - pages/Usage/Usage.jsx — the totals
// -----------------------------------------------------------

export default function StatTile({ label, value, sub, to, icon = null, symbol = null, className = '' }) {
  const figure = <Typography variant="h4" component="p" className="font-semibold">{value ?? '—'}</Typography>;
  const body = (
    <Paper className={`p-4 h-full flex flex-col gap-1 ${to ? 'transition hover:-translate-y-0.5 hover:border-primary motion-reduce:hover:translate-y-0' : ''} ${className}`}>
      <Typography variant="body2" color="text.secondary" className="flex items-center gap-1">{icon}{label}</Typography>
      {symbol ? (
        <div className="flex items-center justify-between gap-3">
          {figure}
          <span aria-hidden className="shrink-0 grid place-items-center size-11 rounded-lg bg-canvas text-primary [&_svg]:text-[26px]">
            {symbol}
          </span>
        </div>
      ) : figure}
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
  return to ? <Link to={to} className="no-underline text-inherit block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{body}</Link> : body;
}
