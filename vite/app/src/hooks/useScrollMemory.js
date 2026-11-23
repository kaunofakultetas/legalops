// -----------------------------------------------------------
//  [*] useScrollMemory — the page's scroller keeps its place
//
//  The pages scroll inside PageLayout's scrolling area (the
//  `main` of this file), which every page renders afresh —
//  without this every return started at the top. The hook
//  records its position under the history entry on screen
//  and, when the entry changes, positions the page by how it
//  was reached:
//
//    - Back / Forward (POP)       → the entry's own position
//    - a return (useReturnTo: a "back" link whose page is not
//      right behind)              → the last position at
//                                   that address
//    - any other new page, or a link to another view of the
//      same page (pushed)         → the top (a #hash target
//                                   instead, when there is
//                                   one)
//    - the SAME page's own view changing its address (a tab,
//      a filter, a table page — replaced — or a drawer pushed
//      as an overlay), a jump to a #fragment the browser made
//      itself (the skip link)     → nothing moves
//
//  A position the content cannot hold yet (the list is still
//  loading) is restored once it can (utils/restoreScroll.js:
//  bounded in time, ended by the user's own scrolling or
//  typing); meanwhile the scroll events are the restore's, not
//  the user's, and are not recorded. Nothing takes the focus.
//
//  Split into:
//
//    hashTarget        — where main scrolls to show a #hash
//    stays             — whether a new address of the page on
//                        screen leaves the view where it is
//    useScrollMemory   — the hook (default export)
// -----------------------------------------------------------

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import restoreScroll from '@/utils/restoreScroll';
import { OVERLAY, RETURNING, recallScroll, rememberScroll } from '@/utils/navigationMemory';







// -----------------------------------------------------------
// hashTarget
// -----------------------------------------------------------
//
//   hashTarget(main, '#finding-42') → () => its top in main
//
// For a location's #hash: a function answering where main
// must scroll to show that element at its top — null while
// it is not rendered yet. null (no target at all) for no
// hash, a hash that does not decode, main's own id, or the
// page's <main> landmark inside it (the skip link's
// "#main-content" — the content begins where it is).
//
// Used by:
//   - useScrollMemory (below)
// -----------------------------------------------------------

function hashTarget(main, hash) {
  let id;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  if (!id || id === main.id || document.getElementById(id)?.tagName === 'MAIN') return null;
  return () => {
    const element = document.getElementById(id);
    if (!element || !main.contains(element)) return null;
    return Math.max(0, main.scrollTop + element.getBoundingClientRect().top - main.getBoundingClientRect().top);
  };
}







// -----------------------------------------------------------
// stays
// -----------------------------------------------------------
//
// True when a new address of the page on screen leaves the
// view where it is: a replace (its own tab, filter or table
// page), an overlay pushed on top of it (useOverlayParam), or
// a fragment the browser jumped to itself (the skip link, a
// footnote — history state is empty then, the key "default").
//
// Used by:
//   - useScrollMemory (below)
// -----------------------------------------------------------

function stays(location, action) {
  if (action === 'REPLACE') return true;
  if (action === 'PUSH') return location.state?.overlay === OVERLAY.overlay;
  return Boolean(location.hash) && location.key === 'default';
}







// -----------------------------------------------------------
// useScrollMemory (default export)
// -----------------------------------------------------------
//
//   const scrollRef = useRef(null);
//   useScrollMemory(scrollRef);
//   <div ref={scrollRef} className="overflow-auto">
//
// `ref` holds the page's scroller, rendered for the page's
// whole life.
//
// Used by:
//   - components/layout/PageLayout.jsx — every page's
//     scrolling area
// -----------------------------------------------------------

export default function useScrollMemory(ref) {

  const location = useLocation();
  const action = useNavigationType();
  // The entry on screen, and the page it was positioned for
  const shown = useRef(null);
  const shownPath = useRef(null);
  // The running restore: its cancel, null when none runs
  const restoring = useRef(null);


  // Scrolls are recorded under the entry on screen — except
  // while a restore runs (its own moves, or content growing)
  useEffect(() => {
    const main = ref.current;
    const record = () => {
      if (!restoring.current && shown.current) rememberScroll(shown.current, main.scrollTop);
    };
    main.addEventListener('scroll', record, { passive: true });
    return () => main.removeEventListener('scroll', record);
  }, [ref]);


  // Before paint, so a position the content already holds
  // shows without a flash of the top
  useLayoutEffect(() => {

    const main = ref.current;
    const samePage = shownPath.current === location.pathname;
    shown.current = location;
    shownPath.current = location.pathname;


    // The page's own view changed its address: nothing moves —
    // a restore still running carries on (for the new entry).
    // Back / Forward within the page still finds each entry's
    // place (an entry never scrolled stays put).
    const remembered = action === 'POP' ? recallScroll(location)
      : location.state?.returning === RETURNING.returning ? recallScroll(location, { byUrl: true }) : undefined;
    if (samePage && (stays(location, action) || (action === 'POP' && remembered === undefined))) {
      if (!restoring.current) rememberScroll(location, main.scrollTop);
      return;
    }


    const previous = restoring.current;
    restoring.current = null;
    previous?.();
    const hash = location.hash ? hashTarget(main, location.hash) : null;
    const target = remembered ?? hash ?? 0;


    // An ended restore records where it left the page; a
    // cancelled one belongs to a page no longer on screen. The
    // restore may end before it returns (the content already
    // holds the position) — then nothing is left running.
    let running = true;
    let cancel = null;
    cancel = restoreScroll(main, target, {
      onEnd: (how) => {
        running = false;
        if (restoring.current === cancel) restoring.current = null;
        if (how !== 'cancelled' && shown.current) rememberScroll(shown.current, main.scrollTop);
      },
    });
    if (running) restoring.current = cancel;
  }, [location, action, ref]);
}
