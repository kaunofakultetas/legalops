// -----------------------------------------------------------
//  [*] useRevealFocus — the focus after "Show more"
//
//  When ShowMore reveals the next page of a long report list,
//  the keyboard focus moves to the first row it revealed —
//  that row's [data-reveal-focus] control, else the row itself
//  (which then carries tabIndex={-1}) — so a keyboard user
//  carries on where the new rows begin instead of staying on
//  a button that moved down, or vanished with the last page.
// -----------------------------------------------------------

import { useCallback, useEffect, useRef } from 'react';







// -----------------------------------------------------------
// useRevealFocus (default export)
// -----------------------------------------------------------
//
//   const listRef = useRef(null);
//   const reveal = useRevealFocus(listRef, limit);
//   onMore={() => { reveal(limit); setLimit(limit + PAGE_SIZE); }}
//
// `reveal(index)` marks the first row the coming render adds;
// once the list renders with the new `limit`, the focus
// moves to that row among the list's direct children marked
// [data-reveal-row] — its [data-reveal-focus] element, else
// the row itself (give it tabIndex={-1}). A render without a
// pending reveal moves nothing.
//
// Used by:
//   - ReportFindings.jsx — FindingGroup
//   - ReportCitations.jsx — the list
// -----------------------------------------------------------

export default function useRevealFocus(listRef, limit) {

  const pending = useRef(null);


  useEffect(() => {
    if (pending.current === null) return;
    const row = listRef.current?.querySelectorAll(':scope > [data-reveal-row]')[pending.current];
    pending.current = null;
    (row?.querySelector('[data-reveal-focus]') || row)?.focus();
  }, [limit, listRef]);


  return useCallback((index) => { pending.current = index; }, []);
}
