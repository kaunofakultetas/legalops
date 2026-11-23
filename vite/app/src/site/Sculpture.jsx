// -----------------------------------------------------------
//  [*] Sculpture — the object every page opens on
//
//  The first thing a visitor sees: the brand's mark as one
//  polished object standing in the light, turning slowly,
//  its yellow piece now and then gliding out of its place
//  and back — the missing piece of the mosaic, which is what
//  the product finds (sculptureScene.js, in WebGL). Behind
//  it, out of focus, tiles of the same mosaic drift at their
//  own depths, and under it lies a soft shadow: the stage is
//  plain CSS, only the object itself is drawn in three
//  dimensions.
//
//  The first page shows the mark whole on a large stage; the
//  head of every other page shows the same four pieces in an
//  arrangement of its own on a small one (`small`), so each
//  page is signed with the mark, rearranged to its subject
//  (sculpture.js — ARRANGEMENTS).
//
//  As the page scrolls the object's pieces drift apart — the
//  object's own answer to the scroll, as every band below
//  has one.
//
//  All of it is decoration and hidden from assistive
//  technology. The scene loads after the page is drawn, in a
//  chunk of its own, and its canvas fades in on the first
//  frame. Under reduced motion it draws one still frame and
//  the tiles behind stand still; where the browser has no
//  WebGL, refuses it or takes it away, the mark is shown as
//  a flat picture leaning in CSS perspective.
//
//  Split into (root component last):
//
//    TILES      — the tiles out of focus, large stage
//    HEAD_TILES — the same for the small stage
//    SHAPES     — a tile's drawing per shape
//    canWebGL   — does this browser draw WebGL at all
//    Backdrop   — the tiles out of focus and the shadow
//    Flat       — the mark as a flat picture
//    FlatPair   — two tiles of the mark, for the small stage
//    Sculpture  — the object on its stage (default export)
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { COLORS } from '@/brand';
import { PIECES } from '@/site/sculpture';


// The tiles out of focus: the shape (S the square, A–D the
// quarter disc's four turns), where its centre stands in the
// stage (percent), its size (rem), how far out of focus it is
// (px of blur), its colour and how much of it shows, and the
// time and delay of its drift (seconds). `wide` tiles are
// left out on a phone, where the stage is small.
const TILES = [
  { shape: 'S', x: 12, y: 20, size: 5.5, blur: 9, color: COLORS.blue, show: 0.5, time: 15, delay: -2, wide: true },
  { shape: 'A', x: 90, y: 14, size: 7, blur: 6, color: COLORS.blue, show: 0.6, time: 17, delay: -6 },
  { shape: 'S', x: 80, y: 86, size: 4.5, blur: 4, color: COLORS.sky, show: 0.34, time: 13, delay: -9, wide: true },
  { shape: 'C', x: 18, y: 82, size: 8, blur: 12, color: COLORS.blue, show: 0.45, time: 19, delay: -4 },
  { shape: 'S', x: 97, y: 52, size: 3.25, blur: 3, color: COLORS.sky, show: 0.3, time: 12, delay: -7, wide: true },
  { shape: 'D', x: 56, y: 6, size: 3.5, blur: 5, color: COLORS.sky, show: 0.24, time: 16, delay: -11, wide: true },
  { shape: 'B', x: 62, y: 95, size: 3, blur: 2, color: COLORS.sun, show: 0.5, time: 14, delay: -1 },
];

// The small stage has room for three, nearer and fainter
const HEAD_TILES = [
  { shape: 'S', x: 8, y: 22, size: 3.5, blur: 7, color: COLORS.blue, show: 0.5, time: 15, delay: -3, wide: true },
  { shape: 'D', x: 93, y: 16, size: 4.5, blur: 5, color: COLORS.blue, show: 0.55, time: 17, delay: -8 },
  { shape: 'S', x: 86, y: 90, size: 2.75, blur: 3, color: COLORS.sky, show: 0.3, time: 13, delay: -5, wide: true },
];

// A tile's drawing on a hundred-unit square
const SHAPES = {
  A: 'M100 100H0A100 100 0 0 1 100 0Z',
  B: 'M0 0H100A100 100 0 0 1 0 100Z',
  C: 'M0 100V0A100 100 0 0 1 100 100Z',
  D: 'M100 0V100A100 100 0 0 1 0 0Z',
};







// -----------------------------------------------------------
// canWebGL
// -----------------------------------------------------------
//
// Whether the browser knows WebGL at all — asked without
// touching a canvas, so an environment that has none (a test
// runner's DOM, a very old browser) is simply shown the flat
// picture.
//
// Used by:
//   - Sculpture (below)
// -----------------------------------------------------------

function canWebGL() {
  return typeof window !== 'undefined' && typeof window.WebGLRenderingContext !== 'undefined';
}







// -----------------------------------------------------------
// Backdrop
// -----------------------------------------------------------
//
// The stage behind the object: `tiles` of the mosaic out of
// focus — each blurred by its own distance and drifting up
// and down at its own pace — and, with `shadow`, the soft
// shadow the object would cast on a floor under where it
// stands.
//
// Used by:
//   - Sculpture (below)
// -----------------------------------------------------------

function Backdrop({ tiles, shadow }) {
  return (
    <>
      {tiles.map((tile) => (
        <svg
          key={`${tile.x}-${tile.y}`} viewBox="0 0 100 100" focusable="false"
          className={`ghost-drift absolute -translate-x-1/2 -translate-y-1/2 ${tile.wide ? 'hidden sm:block' : ''}`}
          style={{
            left: `${tile.x}%`, top: `${tile.y}%`, width: `${tile.size}rem`, height: `${tile.size}rem`,
            filter: `blur(${tile.blur}px)`, opacity: tile.show, '--time': `${tile.time}s`, '--delay': `${tile.delay}s`,
          }}
        >
          {tile.shape === 'S' ? <rect width="100" height="100" rx="17" fill={tile.color} /> : <path d={SHAPES[tile.shape]} fill={tile.color} />}
        </svg>
      ))}
      {shadow && <div className="absolute left-1/2 top-[84%] h-[9%] w-[46%] -translate-x-1/2 rounded-[50%] bg-[#081A36] opacity-60 blur-2xl" />}
    </>
  );
}







// -----------------------------------------------------------
// Flat
// -----------------------------------------------------------
//
// The mark drawn flat — its four tiles in their colours on
// ink — for the caller to lean in CSS perspective: the
// object's place is never left empty.
//
// Used by:
//   - Sculpture (below) — where there is no WebGL
// -----------------------------------------------------------

function Flat() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-[0_28px_36px_rgba(6,18,40,0.5)]" focusable="false">
      {PIECES.map((piece) => {
        const x = 100 + piece.at[0] * 100 - 45;
        const y = 100 - piece.at[1] * 100 - 45;
        return piece.shape === 'S'
          ? <rect key={piece.key} x={x} y={y} width="90" height="90" rx="15" fill={piece.color} />
          : <path key={piece.key} d={SHAPES[piece.shape]} transform={`translate(${x} ${y}) scale(0.9)`} fill={piece.color} />;
      })}
    </svg>
  );
}







// -----------------------------------------------------------
// FlatPair
// -----------------------------------------------------------
//
// Two tiles of the mark — a pale blue square and the yellow
// quarter disc — standing on the stage's lower edge at its
// right end: how the head of a page is signed where the
// object cannot be drawn.
//
// Used by:
//   - Sculpture (below) — the small stage without WebGL
// -----------------------------------------------------------

function FlatPair() {
  return (
    <div className="absolute bottom-0 right-0 flex gap-2">
      <svg viewBox="0 0 100 100" className="h-24 w-24 lg:h-28 lg:w-28" focusable="false"><rect width="100" height="100" rx="17" fill={COLORS.sky} /></svg>
      <svg viewBox="0 0 100 100" className="h-24 w-24 lg:h-28 lg:w-28" focusable="false"><path d={SHAPES.B} fill={COLORS.sun} /></svg>
    </div>
  );
}







// -----------------------------------------------------------
// Sculpture (default export)
// -----------------------------------------------------------
//
// The stage in the box `className` gives it: the backdrop,
// and over it the scene's canvas — showing the named
// `arrangement` of the pieces — or a flat picture. `small`
// is the stage of a page's head: fewer tiles behind, no
// floor, and the pair of tiles as its flat picture. The
// scene's module is asked for once the page has been drawn;
// until its first frame only the backdrop shows — the pieces
// then arrive, which is the point of the opening. While the
// scene runs, the page's scroll is handed to it: by the time
// the stage has scrolled away the pieces have drifted apart.
//
// Used by:
//   - pages/Home.jsx — the hero
//   - parts.jsx — PageHead, the head of every other page
// -----------------------------------------------------------

export default function Sculpture({ arrangement = 'mark', small = false, className = '' }) {

  const canvas = useRef(null);
  const [flat, setFlat] = useState(() => !canWebGL());
  const [drawn, setDrawn] = useState(false);


  useEffect(() => {
    if (flat) return undefined;
    let scene = null;
    let left = false;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const scrolled = () => scene?.spread(window.scrollY / (small ? 420 : window.innerHeight * 0.85));
    import('@/site/sculptureScene')
      .then(({ startSculpture }) => {
        if (left) return;
        scene = startSculpture(canvas.current, { arrangement, still, onReady: () => setDrawn(true), onLost: () => setFlat(true) });
        if (!scene) setFlat(true);
        else scrolled();
      })
      .catch(() => setFlat(true));
    window.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      left = true;
      window.removeEventListener('scroll', scrolled);
      scene?.stop();
    };
  }, [flat, arrangement, small]);


  const picture = small
    ? <FlatPair />
    : (
      <div className="absolute inset-0 flex items-center justify-center [perspective:1200px]">
        <div className="aspect-square h-[52%] [transform:rotateX(10deg)_rotateY(24deg)]"><Flat /></div>
      </div>
    );


  return (
    <div aria-hidden className={`pointer-events-none ${className}`}>
      <Backdrop tiles={small ? HEAD_TILES : TILES} shadow={!small} />
      {flat
        ? picture
        : <canvas ref={canvas} className={`absolute inset-0 block h-full w-full transition-opacity duration-1000 ${drawn ? 'opacity-100' : 'opacity-0'}`} />}
    </div>
  );
}
