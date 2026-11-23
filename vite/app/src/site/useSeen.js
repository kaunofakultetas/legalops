// -----------------------------------------------------------
//  [*] useSeen — has an element come into view
//
//  The public site moves things as the visitor reaches them:
//  a band's parts rise into place, the marker is drawn across
//  a finding's evidence. This hook is the "reached": true
//  once the element has come into view, and from then on —
//  the answer never goes back, so nothing plays twice or
//  hides again.
//
//  Where the browser cannot tell (no IntersectionObserver)
//  the element counts as seen at once: content is never held
//  back for good.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';







// -----------------------------------------------------------
// useSeen (default export)
// -----------------------------------------------------------
//
// True once the element of `ref` is in view. `share` is how
// much of it must show (a fraction of its own area) and
// `inset` how far the bottom of the window is pulled in, so
// "in view" means a little way up the screen and not at its
// very edge. With `off` the hook watches nothing and answers
// true — for a caller that only sometimes waits.
//
// Used by:
//   - parts.jsx — Band, the reveal of a band's parts
//   - specimens.jsx — FindingSpecimen, when to draw the marker
// -----------------------------------------------------------

export default function useSeen(ref, { share = 0.6, inset = '0px', off = false } = {}) {

  const [seen, setSeen] = useState(() => off || typeof IntersectionObserver === 'undefined');


  useEffect(() => {
    if (seen || !ref.current) return undefined;
    const watcher = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setSeen(true); },
      { threshold: share, rootMargin: `0px 0px -${inset} 0px` },
    );
    watcher.observe(ref.current);
    return () => watcher.disconnect();
  }, [seen, ref, share, inset]);


  return seen;
}
