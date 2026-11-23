// -----------------------------------------------------------
//  [*] Sculpture scene — the mark as an object in the light
//
//  The four pieces of sculpture.js, in one of their
//  arrangements, drawn as one polished object in a small
//  WebGL scene of its own — no library:
//  the shapes, one shader and the arithmetic of a camera are
//  all it takes, and a visitor's first screen should not
//  wait for a 3D engine.
//
//  The look is a studio photograph's. Each piece is glazed
//  ceramic: its own colour under a soft light from the upper
//  left, and over it the reflection of the room — bright
//  above, the page's ink below, one long window of light —
//  which grows towards the edges, as a glaze's does. Because
//  the edges are round, that window shows as a fine line of
//  light travelling along them while the object turns.
//
//  What moves, all of it slowly:
//
//    - the pieces come together when the page opens, from
//      the four corners and from far away, the yellow last;
//    - the object turns a little from side to side, each
//      piece breathing in and out of its plane, and leans
//      after the pointer;
//    - in the mark itself, now and then the yellow piece
//      glides out of its place and waits beside it — its
//      place is left as a fine line of light, the missing
//      piece of the mosaic — then glides back;
//    - as the page scrolls, the pieces drift apart (the
//      caller says how far).
//
//  With `still` (reduced motion) the object is drawn once,
//  whole, and nothing moves. The scene draws only while its
//  canvas is on screen, and gives the context back when
//  stopped.
//
//  Split into:
//
//    VIEW, PACE      — the camera and the timing
//    VERTEX, FRAGMENT — the shader
//    perspective     — the camera's matrix
//    translation     — a move as a matrix
//    turning         — a turn as a matrix
//    product         — two matrices multiplied
//    rgb             — a hex colour as three fractions
//    compile         — the shader program
//    upload          — a buffer on the graphics card
//    ease            — slow in, slow out
//    startSculpture  — the scene (named export)
// -----------------------------------------------------------

import { COLORS } from '@/brand';
import { ARRANGEMENTS, PIECE, outline, rim, slab } from '@/site/sculpture';


// The camera's field of view, and how far the object sways
// and how far the pointer may lean it (radians: about the
// level axis, then the upright one). Its distance and the
// pose at rest are the arrangement's own (sculpture.js).
const VIEW = { fov: 0.46, sway: [0.03, 0.13], pointer: [0.07, 0.16] };

// The timing, in seconds: how long a piece takes to arrive
// and how far apart the four start; when the yellow piece
// first leaves, how long it travels, waits, and rests between
const PACE = { arrive: 1.9, apart: 0.16, first: 5, travel: 2.4, wait: 2.6, rest: 6.5 };

// A corner goes in with its normal; out come where it is as
// the camera sees it and which way its surface faces
const VERTEX = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uModel;
varying vec3 vPlace;
varying vec3 vNormal;
void main() {
  vec4 placed = uModel * vec4(aPosition, 1.0);
  vPlace = placed.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProjection * placed;
}`;

// The glaze. The piece's colour is lit by the key light and
// a faint fill; over it lies the room's reflection, weak
// where the surface faces the camera and strong where it
// turns away (the edges), a small sharp highlight with a
// wide soft one round it, and on the edges that face right a
// rim of the mark's pale blue, which lifts them off the ink.
// uGlow instead draws a flat line of light — the missing
// piece's place.
const FRAGMENT = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
varying vec3 vPlace;
varying vec3 vNormal;
vec3 room(vec3 ray) {
  vec3 below = vec3(0.05, 0.13, 0.27);
  vec3 above = vec3(0.80, 0.88, 1.0);
  vec3 tone = mix(below, above, smoothstep(-0.25, 0.85, ray.y));
  float window = smoothstep(0.80, 0.97, dot(ray, normalize(vec3(-0.42, 0.66, 0.62))));
  return tone + vec3(1.0) * window * 1.1;
}
void main() {
  if (uGlow > 0.5) {
    gl_FragColor = vec4(uColor * uAlpha, uAlpha);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 eye = normalize(-vPlace);
  vec3 key = normalize(vec3(-0.34, 0.52, 0.78));
  float lit = max(dot(normal, key), 0.0);
  float fill = max(dot(normal, normalize(vec3(0.7, -0.1, 0.5))), 0.0);
  vec3 body = uColor * (0.60 + 0.44 * lit + 0.06 * fill);
  float facing = max(dot(normal, eye), 0.0);
  float mirror = mix(0.09, 0.66, pow(1.0 - facing, 3.0));
  vec3 color = body * (1.0 - mirror * 0.55) + room(reflect(-eye, normal)) * mirror;
  vec3 half_way = normalize(key + eye);
  float shine = max(dot(normal, half_way), 0.0);
  color += vec3(1.0) * (pow(shine, 120.0) * 0.30 + pow(shine, 14.0) * 0.07);
  color += vec3(0.56, 0.70, 0.92) * pow(1.0 - facing, 4.0) * smoothstep(0.0, 0.7, normal.x) * 0.30;
  gl_FragColor = vec4(min(color, vec3(1.0)) * uAlpha, uAlpha);
}`;







// -----------------------------------------------------------
// perspective
// -----------------------------------------------------------
//
// The camera's perspective as WebGL wants a matrix: sixteen
// numbers, column by column. `fov` is the angle the view
// opens to from top to bottom, in radians.
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}







// -----------------------------------------------------------
// translation
// -----------------------------------------------------------
//
// The matrix of a move by (x, y, z).
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function translation(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}







// -----------------------------------------------------------
// turning
// -----------------------------------------------------------
//
// A turn as a matrix: about the upright axis first, then
// about the level one, both in radians. A positive turn
// about the upright axis sends the right side away from the
// viewer, a negative one about the level axis the top.
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function turning(aboutX, aboutY) {
  const [cx, sx, cy, sy] = [Math.cos(aboutX), Math.sin(aboutX), Math.cos(aboutY), Math.sin(aboutY)];
  return [cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1];
}







// -----------------------------------------------------------
// product
// -----------------------------------------------------------
//
// The product of two matrices: what `b` does, then what `a`
// does.
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function product(a, b) {
  const out = new Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}







// -----------------------------------------------------------
// rgb
// -----------------------------------------------------------
//
// A "#RRGGBB" colour as three fractions of one, the way a
// shader takes it.
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function rgb(hex) {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
}







// -----------------------------------------------------------
// compile
// -----------------------------------------------------------
//
// The shader program from its two sources, with the places
// of its attributes and uniforms looked up once. Nothing is
// returned when the browser refuses a shader — the caller
// then has no scene, and the page keeps its flat picture.
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function compile(gl, attributes, uniforms) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return {
    program,
    at: Object.fromEntries(attributes.map((name) => [name, gl.getAttribLocation(program, name)])),
    to: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(program, name)])),
  };
}







// -----------------------------------------------------------
// upload
// -----------------------------------------------------------
//
// A solid's numbers as a buffer on the graphics card, with
// how many corners it holds (six numbers each).
//
// Used by:
//   - startSculpture (below)
// -----------------------------------------------------------

function upload(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer, count: data.length / 6 };
}







// -----------------------------------------------------------
// ease
// -----------------------------------------------------------
//
// Slow in, slow out: a fraction of the way from 0 to 1 that
// starts and ends at rest. Out of range it stays at the end
// it is nearest.
//
// Used by:
//   - startSculpture (below) — every movement of a piece
// -----------------------------------------------------------

function ease(fraction) {
  const k = Math.min(1, Math.max(0, fraction));
  return k * k * k * (k * (6 * k - 15) + 10);
}







// -----------------------------------------------------------
// startSculpture (named export)
// -----------------------------------------------------------
//
// Starts the scene on `canvas` with the named arrangement of
// the pieces (sculpture.js — ARRANGEMENTS) and returns its
// handle — stop(), and spread(amount), by which the caller
// drifts the pieces apart (0 together, 1 fully apart) — or
// nothing when the browser gives no WebGL or refuses the
// shader.
// `onReady` is called after the first frame is drawn,
// `onLost` when the browser takes the context away.
//
// Every frame is worked out from the clock alone: where each
// piece is on its way in, how far the yellow piece is from
// its place, how the object is turned. Nothing depends on
// how many frames were drawn before.
//
// Used by:
//   - Sculpture.jsx — loaded once the page has been drawn
// -----------------------------------------------------------

export function startSculpture(canvas, { arrangement = 'mark', still = false, onReady, onLost } = {}) {

  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const shader = compile(gl, ['aPosition', 'aNormal'], ['uProjection', 'uModel', 'uColor', 'uAlpha', 'uGlow']);
  if (!shader) return null;


  // The arrangement's pieces with their solids, and for each
  // the way it moves outwards — from the middle of the
  // arrangement, or simply towards the viewer where it stands
  // in the middle. The marked piece also has the line of light
  // that stands in its place while it wanders.
  const { pieces: set, view, wander = false } = ARRANGEMENTS[arrangement] ?? ARRANGEMENTS.mark;
  const solids = {};
  const pieces = set.map((piece, index) => {
    solids[piece.shape] ??= upload(gl, slab(outline(piece.shape)));
    const reach = Math.hypot(piece.at[0], piece.at[1]);
    return {
      ...piece,
      index,
      color: rgb(piece.color),
      away: reach > 0.05 ? [piece.at[0] / reach, piece.at[1] / reach] : [0, 0],
      back: piece.back ?? 0,
      turn: piece.turn ?? 0,
      solid: solids[piece.shape],
    };
  });
  const marked = wander ? pieces.find((piece) => piece.key === 'marked') : null;
  const trace = marked ? upload(gl, rim(outline(marked.shape), 0.022, PIECE.depth / 2)) : null;
  const light = rgb(COLORS.sun);


  // How far the yellow piece is from its place at time `t`:
  // 0 in place, 1 beside it
  const absence = (t) => {
    if (still || !marked || t < PACE.first) return 0;
    const cycle = 2 * PACE.travel + PACE.wait + PACE.rest;
    const at = (t - PACE.first) % cycle;
    if (at < PACE.travel) return ease(at / PACE.travel);
    if (at < PACE.travel + PACE.wait) return 1;
    return 1 - ease((at - PACE.travel - PACE.wait) / PACE.travel);
  };


  // The pointer leans the object; the lean follows it slowly.
  // The spread is the caller's (the page's scroll) and is
  // followed the same way, so neither ever jerks.
  const aim = { x: 0, y: 0, spread: 0 };
  const now = { x: 0, y: 0, spread: 0 };
  const follow = (event) => {
    aim.x = (event.clientX / window.innerWidth) * 2 - 1;
    aim.y = (event.clientY / window.innerHeight) * 2 - 1;
  };


  const draw = (t) => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);

    now.x += (aim.x - now.x) * 0.035;
    now.y += (aim.y - now.y) * 0.035;
    now.spread += (aim.spread - now.spread) * 0.08;
    const idle = still ? 0 : 1;
    const pitch = view.pitch + idle * Math.sin(t * 0.31 + 1) * VIEW.sway[0] + now.y * VIEW.pointer[0];
    const yaw = view.yaw + idle * Math.sin(t * 0.23) * VIEW.sway[1] + now.x * VIEW.pointer[1] + now.spread * 0.3;
    // A canvas narrower than the arrangement was made for sees
    // it from further away, so it always fits
    const aspect = width / height;
    const distance = view.distance * Math.max(1, view.fit / aspect);
    const object = product(translation(0, 0, -distance), turning(pitch, yaw));
    const projection = perspective(VIEW.fov, aspect, 0.1, 60);
    const gone = absence(t);

    gl.useProgram(shader.program);
    gl.uniformMatrix4fv(shader.to.uProjection, false, projection);
    const bind = (shape) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, shape.buffer);
      gl.enableVertexAttribArray(shader.at.aPosition);
      gl.vertexAttribPointer(shader.at.aPosition, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(shader.at.aNormal);
      gl.vertexAttribPointer(shader.at.aNormal, 3, gl.FLOAT, false, 24, 12);
    };

    for (const piece of pieces) {
      // On its way in: from its own corner and from far away,
      // turning as it comes
      const come = still ? 1 : ease((t - 0.2 - piece.index * PACE.apart) / PACE.arrive);
      const far = 1 - come;
      const breath = idle * 0.045 * Math.sin(t * 0.7 + piece.index * 1.9);
      const out = far * 1.5 + now.spread * 0.42 + (piece === marked ? gone * 0.4 : 0);
      const x = piece.at[0] + piece.away[0] * out;
      const y = piece.at[1] + piece.away[1] * out;
      const z = -PIECE.depth / 2 + piece.back + breath - far * 3.2 + now.spread * 0.22 * (piece.index - 1.5) + (piece === marked ? gone * 0.26 : 0);
      const twist = piece.turn + far * 1.1 * (piece.index % 2 ? 1 : -1) + (piece === marked ? gone * -0.3 : 0);
      const model = product(product(object, translation(x, y, z)), turning(far * 0.5, twist));

      bind(piece.solid);
      gl.uniformMatrix4fv(shader.to.uModel, false, model);
      gl.uniform3fv(shader.to.uColor, piece.color);
      gl.uniform1f(shader.to.uAlpha, Math.min(1, come * 2.2));
      gl.uniform1f(shader.to.uGlow, 0);
      gl.drawArrays(gl.TRIANGLES, 0, piece.solid.count);
    }

    // The yellow piece's place while it is away
    if (marked && gone > 0.01) {
      bind(trace);
      gl.uniformMatrix4fv(shader.to.uModel, false, product(object, translation(marked.at[0], marked.at[1], -PIECE.depth / 2)));
      gl.uniform3fv(shader.to.uColor, light);
      gl.uniform1f(shader.to.uAlpha, gone * (0.75 + 0.2 * Math.sin(t * 2.4)));
      gl.uniform1f(shader.to.uGlow, 1);
      gl.drawArrays(gl.TRIANGLES, 0, trace.count);
    }
  };


  // The loop: the clock starts with the first frame; nothing
  // is drawn while the canvas is off screen
  let frame = null;
  let started = null;
  let seen = true;
  let ready = false;
  const tick = (time) => {
    started ??= time;
    const t = still ? 100 : (time - started) / 1000;
    if (seen) {
      draw(t);
      if (!ready) {
        ready = true;
        onReady?.();
      }
    }
    if (!still) frame = requestAnimationFrame(tick);
  };
  const watcher = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; });
  const sizer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (still) draw(100); });
  const lost = (event) => {
    event.preventDefault();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    onLost?.();
  };


  watcher?.observe(canvas);
  sizer?.observe(canvas);
  canvas.addEventListener('webglcontextlost', lost);
  if (!still) window.addEventListener('pointermove', follow, { passive: true });
  frame = requestAnimationFrame(tick);


  return {
    spread(amount) {
      aim.spread = still ? 0 : Math.min(1, Math.max(0, amount));
    },
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      watcher?.disconnect();
      sizer?.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      window.removeEventListener('pointermove', follow);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
