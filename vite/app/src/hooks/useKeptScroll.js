// -----------------------------------------------------------
//  [*] useKeptScroll — a scroller that keeps its place
//
//  For the scrollers inside a page that come and go with it
//  or with a panel: the conversation list (a column, or the
//  phone drawer that unmounts it when it closes) and an act's
//  provision tree (its tab unmounts it). The position is kept
//  by NAME, whatever the history entry — the list is the same
//  list wherever it shows — recorded on scroll and brought
//  back on mount once the content is tall enough
//  (utils/restoreScroll.js: bounded, ended by the user's own
//  scrolling or typing).
//
//  The page's own <main> follows the history instead
//  (useScrollMemory).
// -----------------------------------------------------------

import { useLayoutEffect } from 'react';
import restoreScroll from '@/utils/restoreScroll';
import { recallKept, rememberKept } from '@/utils/navigationMemory';







// -----------------------------------------------------------
// useKeptScroll (default export)
// -----------------------------------------------------------
//
//   const listRef = useRef(null);
//   useKeptScroll(listRef, 'chat.threads');
//   <div ref={listRef} className="overflow-y-auto">
//
//   useKeptScroll(treeRef, wide ? `corpus.tree.${id}` : null)
//                                 — null: nothing kept (the
//                                   element scrolls with main)
//
// Used by:
//   - pages/Chat/ThreadList.jsx — the conversation list
//   - pages/Corpus/CorpusDocument.jsx — the provision tree
//     beside the viewer (md and up)
// -----------------------------------------------------------

export default function useKeptScroll(ref, name) {
  useLayoutEffect(() => {

    const element = ref.current;
    if (!element || !name) return undefined;


    // The restore's own moves are not the user's
    let restoring = false;
    const record = () => {
      if (!restoring) rememberKept(name, element.scrollTop);
    };


    const top = recallKept(name);
    let cancel = null;
    if (top > 0) {
      restoring = true;
      cancel = restoreScroll(element, top, {
        onEnd: (how) => {
          restoring = false;
          if (how !== 'cancelled') record();
        },
      });
    }
    element.addEventListener('scroll', record, { passive: true });
    return () => {
      element.removeEventListener('scroll', record);
      cancel?.();
    };
  }, [ref, name]);
}
