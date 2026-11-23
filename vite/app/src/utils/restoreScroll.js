// -----------------------------------------------------------
//  [*] restoreScroll — bring a scroller back to a position
//
//  A page coming back from history renders before its data
//  may have arrived (a query that is not cached, a grid that
//  measures itself first): the position it was left at does
//  not exist yet. The restore sets it as soon as the element
//  is tall enough — checked at once, then once per animation
//  frame — and gives up after RESTORE_TIMEOUT_MS, scrolling as
//  far as the content then allows.
//
//  Reaching the position is not the end: a grid first lays
//  its rows out at an estimated height and measures them a
//  moment later, and the browser's scroll anchoring then
//  moves the view with the rows above it — a phone's tall,
//  wrapped rows moved it by a whole screen. So the restore
//  holds the position until the content's height has not
//  changed for SETTLE_FRAMES frames.
//
//  It never fights the user: a wheel, a touch or a pointer
//  press on the scroller, or any key pressed anywhere, ends
//  it where it is. It moves only scrollTop — the keyboard
//  focus stays where it was. Every listener and the frame
//  loop end with it, and it ends by itself once the scroller
//  leaves the page (its page unmounted).
//
//  Split into:
//
//    RESTORE_TIMEOUT_MS — how long late content is waited for
//    SETTLE_FRAMES      — how long a reached position is held
//    USER_EVENTS        — the scroller's "the user took over"
//    restoreScroll      — the restore (default export)
// -----------------------------------------------------------

// Frames the content's height must stay the same before a
// reached position is let go (~0.2 s at 60 Hz)
const SETTLE_FRAMES = 12;

// Pointer, wheel and touch input on the scroller itself (keys
// are listened for on the window: the focus may be anywhere)
const USER_EVENTS = ['wheel', 'touchstart', 'pointerdown'];







// -----------------------------------------------------------
// RESTORE_TIMEOUT_MS
// -----------------------------------------------------------
//
// How long a restore waits for the content to grow tall
// enough — long enough for a slow list query, short enough
// that a page that never grows is left alone.
//
// Used by:
//   - restoreScroll (below)
//   - tests/core/scroll-memory.test.jsx — the give-up case
// -----------------------------------------------------------

export const RESTORE_TIMEOUT_MS = 4000;







// -----------------------------------------------------------
// restoreScroll (default export)
// -----------------------------------------------------------
//
//   const cancel = restoreScroll(main, 1840, { onEnd: (how) => … })
//   const cancel = restoreScroll(main, () => targetTop ?? null)
//
// `top` is a number, or a function answering it — null while
// the target cannot be known yet (a #hash element not
// rendered). The position is set the moment the content
// holds it (so a page that already does shows no flash of
// the top) and held while the content settles. onEnd(how)
// runs once, with 'restored' (reached and settled),
// 'timeout' (as far as it went), 'user' (input ended it) or
// 'cancelled' (the caller's cancel, or the scroller left the
// page). A target of 0 ends at once, before restoreScroll
// returns.
//
// Used by:
//   - hooks/useScrollMemory.js — the page's <main>
//   - hooks/useKeptScroll.js — the conversation list, the
//     provision tree
// -----------------------------------------------------------

export default function restoreScroll(element, top, { onEnd = () => {} } = {}) {

  const deadline = Date.now() + RESTORE_TIMEOUT_MS;
  const target = typeof top === 'function' ? top : () => top;
  let frame = 0;
  let over = false;
  // The content's height at the last frame, and for how many
  // frames it has stayed so
  let height = -1;
  let still = 0;


  const end = (how) => {
    if (over) return;
    over = true;
    cancelAnimationFrame(frame);
    for (const type of USER_EVENTS) element.removeEventListener(type, userTookOver);
    window.removeEventListener('keydown', userTookOver, true);
    onEnd(how);
  };
  function userTookOver() { end('user'); }


  // Once per frame: a scroller that left the page (its page
  // unmounted) ends the restore; one the content fills far
  // enough takes the position (again, if anchoring moved it)
  // and keeps it until the height settles; past the deadline
  // it goes as far as the content lets it
  const step = () => {
    if (!element.isConnected) {
      end('cancelled');
      return;
    }
    const wanted = target();
    const room = Math.max(0, element.scrollHeight - element.clientHeight);
    still = element.scrollHeight === height ? still + 1 : 0;
    height = element.scrollHeight;
    if (wanted !== null && room >= wanted) {
      // A pixel's slack: a zoomed page reads scrollTop back
      // with a fraction
      if (Math.abs(element.scrollTop - wanted) > 1) element.scrollTop = wanted;
      if (wanted === 0 || still >= SETTLE_FRAMES) {
        end('restored');
        return;
      }
    }
    if (Date.now() >= deadline) {
      if (wanted !== null) element.scrollTop = Math.min(wanted, room);
      end(wanted !== null && room >= wanted ? 'restored' : 'timeout');
      return;
    }
    frame = requestAnimationFrame(step);
  };


  for (const type of USER_EVENTS) element.addEventListener(type, userTookOver, { passive: true });
  window.addEventListener('keydown', userTookOver, true);
  step();
  return () => end('cancelled');
}
