// -----------------------------------------------------------
//  [*] Login — the particles backdrop
//
//  The drifting dots-and-lines network behind the sign-in
//  sheet, the same scene as jauka's login page and with its
//  settings: tsparticles (slim build) on a canvas that fills
//  the page behind the sheet, over the page's dark gradient.
//  The dots drift slowly, link up when they come close and
//  step aside for the cursor; white, the dots faint and the
//  lines half see-through, so the form stays the one thing
//  to read. Their number follows the viewport's width, read
//  once when the page opens, so a wide screen is not empty
//  and a phone not crowded.
//
//  Under the system's "reduce motion" setting the network
//  stands still and ignores the cursor; the slim build does
//  not follow that setting on its own. Where the browser
//  draws nothing on a canvas (canvas blocked, or the test
//  environment's inert stub) nothing renders at all.
//  Login.jsx loads this module lazily, so the library stays
//  out of the bundle every page loads and the form never
//  waits for it.
//
//  Split into (root component last):
//
//    REDUCED_MOTION   — the "reduce motion" media query
//    canDraw          — does this browser draw on a canvas
//    useReducedMotion — the setting, kept in step
//    sceneOptions     — the tsparticles options
//    LoginParticles   — the canvas layer (default export)
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import Particles from 'react-tsparticles';
import { loadSlim } from 'tsparticles-slim';
import { COLORS } from '@/theme';


// The media query of the system's "reduce motion" setting
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';







// -----------------------------------------------------------
// canDraw
// -----------------------------------------------------------
//
// True when a canvas hands out a 2D context. A browser that
// blocks the canvas answers null, and so does the vitest
// setup's stub — the scene then never starts an engine that
// would draw nothing.
//
// Used by:
//   - LoginParticles (below)
// -----------------------------------------------------------

function canDraw() {
  try {
    return Boolean(document.createElement('canvas').getContext('2d'));
  } catch {
    return false;
  }
}







// -----------------------------------------------------------
// useReducedMotion
// -----------------------------------------------------------
//
// The system's "reduce motion" setting: read on the first
// render, so a still scene never starts out moving, and
// followed when it is switched while the page is open.
//
// Used by:
//   - LoginParticles (below)
// -----------------------------------------------------------

function useReducedMotion() {

  const [reduce, setReduce] = useState(() => window.matchMedia(REDUCED_MOTION).matches);


  useEffect(() => {
    const setting = window.matchMedia(REDUCED_MOTION);
    const follow = (event) => setReduce(event.matches);
    setting.addEventListener('change', follow);
    return () => setting.removeEventListener('change', follow);
  }, []);


  return reduce;
}







// -----------------------------------------------------------
// sceneOptions
// -----------------------------------------------------------
//
// The tsparticles options for `count` dots, moving or (with
// `still`) standing still — jauka's values: white dots and
// lines (lines join dots closer than 150 px), a drift of up
// to 1 px a frame, the cursor pushing dots within 100 px.
// The canvas covers its layer, not the whole screen, and
// listens on the window, so the cursor still pushes the dots
// aside although the layer lets every click through to the
// form. 30 frames a second is plenty for a backdrop.
//
// Used by:
//   - LoginParticles (below)
// -----------------------------------------------------------

function sceneOptions(count, still) {
  return {
    fullScreen: { enable: false },
    fpsLimit: 30,
    detectRetina: true,
    interactivity: {
      detectsOn: 'window',
      events: {
        onHover: { enable: !still, mode: 'repulse' },
      },
      modes: {
        repulse: { distance: 100 },
      },
    },
    particles: {
      color: { value: COLORS.paper },
      links: { enable: true, color: COLORS.paper, distance: 150, opacity: 0.5 },
      move: { enable: !still, speed: { min: 0.01, max: 1.0 } },
      opacity: { value: { min: 0.0, max: 0.2 } },
      size: { value: { min: 1, max: 3 } },
      number: { value: count },
    },
  };
}







// -----------------------------------------------------------
// LoginParticles (default export)
// -----------------------------------------------------------
//
// The layer: absolutely placed over the whole login page
// beneath the sheet, hidden from assistive technology (it
// says nothing) and transparent to the pointer. One dot per
// 10 px of the viewport's width; the library loads its slim
// bundle into the engine it is handed, and rebuilds the
// scene when the motion setting changes.
//
// Used by:
//   - Login.jsx — behind the sign-in sheet (lazily loaded)
// -----------------------------------------------------------

export default function LoginParticles() {

  const still = useReducedMotion();
  const [drawable] = useState(canDraw);
  const [count] = useState(() => Math.round(window.innerWidth / 10));
  const init = useCallback(async (engine) => { await loadSlim(engine); }, []);
  const options = useMemo(() => sceneOptions(count, still), [count, still]);


  if (!drawable) return null;
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      <Particles id="login-particles" className="h-full w-full" width="100%" height="100%" init={init} options={options} />
    </div>
  );
}
