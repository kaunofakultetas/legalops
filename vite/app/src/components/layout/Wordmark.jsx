// -----------------------------------------------------------
//  [*] Wordmark — the app's mark and name
//
//  The mark is the brand's mosaic: four tiles of one grid —
//  two quarter discs whose corners meet at the centre, in ink
//  and in yellow, and two rounded squares in the middle blue
//  between them. The yellow piece is the marked one, the way
//  the app marks the passage that proves a finding. It is the
//  same drawing as public/favicon.svg, so the tab and the
//  page agree. Beside it the name is set in the serif, the
//  typeface of the app's titles.
//
//  On the ink top bar the mark is reversed — the ink disc
//  turns white and the squares pale blue, the yellow stays —
//  and the name turns white. Pure decoration for assistive
//  technology: the mark is hidden, and the name is plain text
//  inside whatever link or heading the caller wraps it in, so
//  the caller's own accessible name stays in charge.
//
//  Split into (root component last):
//
//    GROUNDS  — the mark's colours on paper and on ink
//    Mark     — the mosaic alone (named export)
//    Wordmark — mosaic + name (default export)
// -----------------------------------------------------------

import { COLORS } from '@/brand';


// The mark's colours per ground: the quarter disc top left,
// the two squares, the quarter disc bottom right
const GROUNDS = {
  paper: { disc: COLORS.ink, square: COLORS.blue, marked: COLORS.sun },
  ink: { disc: COLORS.paper, square: COLORS.sky, marked: COLORS.sun },
};







// -----------------------------------------------------------
// Mark
// -----------------------------------------------------------
//
// The mosaic at `size` pixels, drawn on a 48-unit grid of
// 23-unit tiles with a 2-unit seam (the viewBox crops the
// mark's own margin, so the tiles fill the box). `onDark`
// reverses it for an ink ground. The chat signs the
// assistant's replies with it: the assistant is the product,
// so it wears the mark.
//
// Used by:
//   - Wordmark (below)
//   - pages/Chat/Messages.jsx — AssistantMessage
//   - pages/Chat/Thread.jsx — ThreadWelcome
// -----------------------------------------------------------

export function Mark({ size, onDark = false }) {
  const { disc, square, marked } = GROUNDS[onDark ? 'ink' : 'paper'];
  return (
    <svg viewBox="8 8 48 48" width={size} height={size} aria-hidden focusable="false" className="shrink-0">
      <path d="M31 31H8A23 23 0 0 1 31 8Z" fill={disc} />
      <rect x="33" y="8" width="23" height="23" rx="4" fill={square} />
      <rect x="8" y="33" width="23" height="23" rx="4" fill={square} />
      <path d="M33 33H56A23 23 0 0 1 33 56Z" fill={marked} />
    </svg>
  );
}







// -----------------------------------------------------------
// Wordmark (default export)
// -----------------------------------------------------------
//
// `name` is the translated app name and `size` the mark in
// pixels; `onDark` sets both for the ink bar. The name never
// wraps in the bar — it is cut with an ellipsis on a narrow
// phone.
//
// Used by:
//   - Navbar.jsx — the link home, on the ink bar
//   - Sidebar.jsx — the phone drawer's header
//   - pages/Login/Login.jsx — atop the sign-in sheet
// -----------------------------------------------------------

export default function Wordmark({ name, size = 26, onDark = false }) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <Mark size={size} onDark={onDark} />
      <span className={`font-serif font-semibold text-[1.0625rem] truncate ${onDark ? 'text-white' : 'text-content'}`}>
        {name}
      </span>
    </span>
  );
}
