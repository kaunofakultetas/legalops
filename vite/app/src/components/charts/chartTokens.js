// -----------------------------------------------------------
//  [*] chartTokens — the colours and scales of every chart
//
//  The two categorical series are the brand's two hues: the
//  mosaic mark's middle blue and a gold stepped down from its
//  yellow, dark enough to read on the white card. The pair
//  was validated with the dataviz method (lightness band,
//  chroma floor, CVD and normal-vision separation, ≥ 3:1 on
//  white) and clears every gate by a wide margin. Then the
//  fixed status scale (good / warning / serious / critical —
//  always shown with an icon and a label, never by colour
//  alone; its good, critical and neutral steps sit near the
//  theme's own success, error and greys, so a chart and a tag
//  of the same verdict agree) and the meter's track (a pale
//  step of the brand blue). The greys are the theme's cool
//  ones. The app has no dark mode, so only the light steps
//  are defined.
//
//  Split into:
//
//    SERIES       — categorical slots, in fixed order
//    STATUS       — the reserved status colours
//    METER_TRACK  — the unfilled meter track
//    GRID         — hairline gridline / baseline ink
//    niceMax      — a clean axis maximum
// -----------------------------------------------------------







// -----------------------------------------------------------
// SERIES
// -----------------------------------------------------------
//
// Categorical identity, assigned in this order and never
// cycled: slot 1 the brand blue (theme.js COLORS.blue), slot
// 2 the gold. The yellow itself is too light to draw with on
// white, so the gold keeps its hue family at 3.4:1.
//
// Used by:
//   - Usage.jsx — the ColumnChart series colours
//   - Meter.jsx — the accent fill
// -----------------------------------------------------------

export const SERIES = ['#3e6fb0', '#b5820c'];







// -----------------------------------------------------------
// STATUS
// -----------------------------------------------------------
//
// Reserved meaning only (a finding that is met / partial /
// missing, a budget running out); paired with an icon and a
// label wherever it appears.
//
// Used by:
//   - reportUtils.js — FINDING_COLORS (StatusBar segments)
//   - Meter.jsx — near / over the limit
// -----------------------------------------------------------

export const STATUS = { good: '#2e9a5e', warning: '#f0aa2a', serious: '#ec835a', critical: '#c8372d', neutral: '#8a93a0' };







// -----------------------------------------------------------
// METER_TRACK
// -----------------------------------------------------------
//
// The brand blue at a pale step (the same hue, OKLCH
// lightness 0.90) — the meter's unfilled track, so the state
// reads across the whole bar.
//
// Used by:
//   - Meter.jsx
// -----------------------------------------------------------

export const METER_TRACK = '#d1dff2';







// -----------------------------------------------------------
// GRID
// -----------------------------------------------------------
//
// Recessive chart furniture: hairline gridlines and the
// baseline, one step off the surface.
//
// Used by:
//   - ColumnChart.jsx
// -----------------------------------------------------------

export const GRID = { line: '#e3e7ed', baseline: '#c5ccd6' };







// -----------------------------------------------------------
// niceMax
// -----------------------------------------------------------
//
// The smallest 1 / 2 / 2.5 / 5 × 10ⁿ at or above `value`,
// so axis ticks land on round numbers (0, 50k, 100k…).
//
// Used by:
//   - ColumnChart.jsx — the y-axis
// -----------------------------------------------------------

export function niceMax(value) {
  if (!value || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value);
  return step * power;
}
