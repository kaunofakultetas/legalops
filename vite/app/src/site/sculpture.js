// -----------------------------------------------------------
//  [*] Sculpture — the mark as four solid pieces
//
//  The public site opens on the brand's mark made solid: its
//  four tiles as thick pieces with softly rounded edges,
//  standing together as one object that turns slowly in the
//  light (sculptureScene.js draws it). This file is what the
//  object IS, free of any drawing: the four pieces and where
//  each stands — in the mark, and in the other arrangements
//  the heads of the other pages show — a piece's outline
//  with the direction every point of it faces, and the solid
//  an outline becomes.
//
//  The shapes are the mark's own — the rounded square and the
//  quarter disc — with one refinement the flat mark does not
//  need: the quarter disc's three sharp corners are rounded a
//  little, so light runs round the whole edge of a piece
//  without a break.
//
//  Split into:
//
//    PIECE    — a piece's measures
//    PIECES   — the four pieces of the mark
//    ARRANGEMENTS — the pieces set out, one way per page
//    outline  — a piece's outline, with its normals
//    slab     — an outline raised into a rounded solid
//    rim      — an outline as a thin flat band
// -----------------------------------------------------------

import { COLORS } from '@/brand';







// -----------------------------------------------------------
// PIECE
// -----------------------------------------------------------
//
// A piece's measures in the mark's own unit, the distance
// between the centres of two neighbouring tiles: half its
// side, the radius of a square's corners (the mark's
// proportion), the radius the quarter disc's sharp corners
// are softened by, its depth, and the radius of the rounding
// between its face and its side — the curve the light
// follows.
//
// Used by:
//   - outline, slab (below)
//   - sculptureScene.js
// -----------------------------------------------------------

export const PIECE = { half: 0.45, corner: 0.15, soft: 0.06, depth: 0.2, edge: 0.055 };







// -----------------------------------------------------------
// PIECES
// -----------------------------------------------------------
//
// The mark's four tiles as it is drawn on ink: the white
// quarter disc top left, the two pale blue squares, the
// yellow quarter disc bottom right — the marked one. Shapes:
// S the rounded square; A and B the quarter disc with its
// centre at the tile's bottom right and top left corner (C
// and D, the two other turns, complete the set). `at` is the
// tile's centre, y upwards.
//
// Used by:
//   - sculptureScene.js — the pieces it draws
//   - Sculpture.jsx — the flat picture
// -----------------------------------------------------------

export const PIECES = [
  { key: 'disc', shape: 'A', color: COLORS.paper, at: [-0.5, 0.5] },
  { key: 'upper', shape: 'S', color: COLORS.sky, at: [0.5, 0.5] },
  { key: 'lower', shape: 'S', color: COLORS.sky, at: [-0.5, -0.5] },
  { key: 'marked', shape: 'B', color: COLORS.sun, at: [0.5, -0.5] },
];







// -----------------------------------------------------------
// ARRANGEMENTS
// -----------------------------------------------------------
//
// The same four pieces set out in different ways — one for
// the first page and one for the head of each other page, so
// every page is signed with the mark, rearranged to say what
// the page is about:
//
//   mark    the mark itself, whole (the first page, "about");
//           `wander` lets its yellow piece leave and return
//   steps   the pieces in a rising line, the yellow one last
//           — the way from a conversation to a report
//   layers  the pieces one behind another, like the layers
//           of an analysis taken apart
//   shelf   the pieces standing side by side, turned like
//           volumes on a shelf — the acts the assistant reads
//
// A piece of an arrangement is a piece of PIECES with where
// it stands (`at`), how far back (`back`) and how it is
// turned about its own upright axis (`turn`, radians). `view`
// is the camera's distance and the object's pose at rest;
// `fit` is the canvas's width-to-height ratio below which
// the camera steps back, so a wide arrangement still fits a
// narrow canvas.
//
// Used by:
//   - sculptureScene.js — what it draws
//   - Sculpture.jsx — which arrangement a stage shows
// -----------------------------------------------------------

const [DISC, UPPER, LOWER, MARKED] = PIECES;

export const ARRANGEMENTS = {
  mark: {
    pieces: PIECES,
    view: { distance: 6.7, pitch: -0.17, yaw: 0.38, fit: 1.05 },
    wander: true,
  },
  steps: {
    pieces: [
      { ...LOWER, at: [-1.5, -0.6], back: 0.2 },
      { ...DISC, at: [-0.5, -0.2], back: 0.07 },
      { ...UPPER, at: [0.5, 0.2], back: -0.07 },
      { ...MARKED, at: [1.5, 0.6], back: -0.2 },
    ],
    view: { distance: 7.4, pitch: -0.14, yaw: 0.26, fit: 1.4 },
  },
  layers: {
    pieces: [
      { ...LOWER, at: [-0.21, 0.15], back: -0.84 },
      { ...UPPER, at: [-0.07, 0.05], back: -0.28 },
      { ...DISC, at: [0.07, -0.05], back: 0.28 },
      { ...MARKED, at: [0.21, -0.15], back: 0.84 },
    ],
    view: { distance: 5.6, pitch: -0.3, yaw: 0.74, fit: 1.1 },
  },
  shelf: {
    pieces: [
      { ...LOWER, at: [-0.9, 0], turn: 1.0 },
      { ...DISC, at: [-0.3, 0], turn: 1.0 },
      { ...UPPER, at: [0.3, 0], turn: 1.0 },
      { ...MARKED, at: [0.9, 0], turn: 1.0 },
    ],
    view: { distance: 5.5, pitch: -0.18, yaw: 0.0, fit: 1.2 },
  },
};







// -----------------------------------------------------------
// outline
// -----------------------------------------------------------
//
// A piece's outline round its own centre: a list of points
// running counter-clockwise (y upwards), each with the
// direction the edge faces there — its normal, of length
// one. Every shape is a closed chain of arcs joined by
// straight runs, so the normal turns smoothly all the way
// round and a light can travel along the edge. The quarter
// disc is built for shape A (centre at the bottom right) and
// turned by quarter turns for D, B and C. `steps` is how
// finely a quarter turn of an arc is cut.
//
// Used by:
//   - sculptureScene.js — the solids and the missing piece's
//     outline
// -----------------------------------------------------------

export function outline(shape, steps = 10) {

  const { half, corner, soft } = PIECE;
  const points = [];
  // An arc round (cx, cy): its points and their normals
  const arc = (cx, cy, radius, from, to) => {
    const pieces = Math.max(2, Math.ceil((Math.abs(to - from) / (Math.PI / 2)) * steps));
    for (let i = 0; i <= pieces; i += 1) {
      const angle = from + ((to - from) * i) / pieces;
      points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), nx: Math.cos(angle), ny: Math.sin(angle) });
    }
  };
  const quarter = Math.PI / 2;


  if (shape === 'S') {
    const inner = half - corner;
    arc(inner, -inner, corner, -quarter, 0);
    arc(inner, inner, corner, 0, quarter);
    arc(-inner, inner, corner, quarter, 2 * quarter);
    arc(-inner, -inner, corner, 2 * quarter, 3 * quarter);
    return points;
  }


  // The quarter disc of shape A, drawn round the disc's centre
  // (the tile's bottom right corner): the three softened
  // corners and the great arc between two of them
  const radius = 2 * half;
  const reach = Math.sqrt((radius - soft) ** 2 - soft ** 2);
  const upper = Math.atan2(reach, -soft);
  const lower = Math.atan2(soft, -reach);
  arc(-soft, soft, soft, -quarter, 0);
  arc(-soft, reach, soft, 0, upper);
  arc(0, 0, radius, upper, lower);
  arc(-reach, soft, soft, lower, 3 * quarter);
  const turns = { A: 0, D: 1, B: 2, C: 3 }[shape] ?? 0;
  return points.map((point) => {
    let [x, y, nx, ny] = [point.x + half, point.y - half, point.nx, point.ny];
    for (let turn = 0; turn < turns; turn += 1) [x, y, nx, ny] = [-y, x, -ny, nx];
    return { x, y, nx, ny };
  });
}







// -----------------------------------------------------------
// slab
// -----------------------------------------------------------
//
// The solid an outline becomes: a face in front, a face
// behind, the side wall between them and, where the wall
// meets each face, a rounding of radius `edge` cut into
// `rounds` strips. Triangles, each corner as six numbers —
// where it is and its normal. The normals are shared along
// the outline and round the roundings, so the piece is
// shaded as one smooth body and a highlight runs along its
// edge instead of breaking into facets. The solid sits with
// its back at z = 0 and its face at z = depth.
//
// Used by:
//   - sculptureScene.js — one solid per shape
// -----------------------------------------------------------

export function slab(points, depth = PIECE.depth, edge = PIECE.edge, rounds = 6) {

  const data = [];
  const count = points.length;
  const corner = (ring, i) => data.push(...ring[i]);
  // A ring of corners round the outline, at angle `turn` of
  // the rounding: 0 on the side wall, a quarter turn up on
  // the front face, a quarter turn down on the back one
  const ring = (turn, z) => points.map((point) => {
    const [out, up] = [Math.cos(turn), Math.sin(turn)];
    return [
      point.x - point.nx * edge * (1 - out), point.y - point.ny * edge * (1 - out), z + edge * up,
      point.nx * out, point.ny * out, up,
    ];
  });
  // Two rings joined by a strip of triangles facing outwards
  const strip = (lower, higher) => {
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      corner(lower, i); corner(lower, j); corner(higher, j);
      corner(lower, i); corner(higher, j); corner(higher, i);
    }
  };
  // A face: a fan from the middle of a ring
  const face = (edgeRing, z, facing) => {
    const middle = [
      edgeRing.reduce((sum, item) => sum + item[0] / count, 0), edgeRing.reduce((sum, item) => sum + item[1] / count, 0), z, 0, 0, facing,
    ];
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const [first, second] = facing > 0 ? [i, j] : [j, i];
      data.push(...middle, ...edgeRing[first], ...edgeRing[second]);
    }
  };


  const quarter = Math.PI / 2;
  const rings = [];
  for (let step = 0; step <= rounds; step += 1) rings.push(ring(-quarter + (quarter * step) / rounds, edge));
  for (let step = 0; step <= rounds; step += 1) rings.push(ring((quarter * step) / rounds, depth - edge));
  for (let index = 0; index < rings.length - 1; index += 1) strip(rings[index], rings[index + 1]);
  face(rings[rings.length - 1], depth, 1);
  face(rings[0], 0, -1);


  return new Float32Array(data);
}







// -----------------------------------------------------------
// rim
// -----------------------------------------------------------
//
// An outline as a thin flat band of the given width, facing
// forwards at height `z`: the trace a piece leaves in its
// place when it is away. The same six numbers a corner as a
// solid's.
//
// Used by:
//   - sculptureScene.js — the missing piece's place
// -----------------------------------------------------------

export function rim(points, width = 0.03, z = 0) {
  const data = [];
  const outer = points.map((point) => [point.x, point.y, z, 0, 0, 1]);
  const inner = points.map((point) => [point.x - point.nx * width, point.y - point.ny * width, z, 0, 0, 1]);
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    data.push(...outer[i], ...outer[j], ...inner[j], ...outer[i], ...inner[j], ...inner[i]);
  }
  return new Float32Array(data);
}
