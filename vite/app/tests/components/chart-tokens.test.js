// -----------------------------------------------------------
//  [*] Tests — charts/chartTokens (the palette and scales)
//
//  The colour tokens every chart shares — the two
//  categorical series in their fixed order (the brand's blue,
//  then its gold), readable on the white card (≥ 3:1, WCAG
//  1.4.11) and apart from each other,
//  the reserved status scale, the meter track as a lighter
//  step of the accent, the recessive grid ink — and niceMax,
//  the clean axis maximum (1 / 2 / 2.5 / 5 × 10ⁿ at or above
//  the value, 1 for nothing to show).
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { GRID, METER_TRACK, SERIES, STATUS, niceMax } from '@/components/charts/chartTokens';


// WCAG relative luminance of a #rrggbb colour
const luminance = (hex) => {
  const channel = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};

// WCAG contrast ratio of two colours
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const HEX = /^#[0-9a-f]{6}$/i;

// The card surface every chart sits on
const WHITE = '#ffffff';







// -----------------------------------------------------------
// Colour tokens
// -----------------------------------------------------------

describe('chart colour tokens', () => {

  it('holds two categorical series, the brand blue then the gold, in that fixed order', () => {
    expect(SERIES).toEqual(['#3e6fb0', '#b5820c']);
  });


  it('keeps every series readable on the white card (≥ 3:1) and distinct from the other', () => {
    for (const colour of SERIES) {
      expect(colour).toMatch(HEX);
      expect(contrast(colour, WHITE), colour).toBeGreaterThanOrEqual(3);
    }
    expect(SERIES[0].toLowerCase()).not.toBe(SERIES[1].toLowerCase());
  });


  it('reserves the five status colours', () => {
    expect(Object.keys(STATUS).sort()).toEqual(['critical', 'good', 'neutral', 'serious', 'warning']);
    for (const colour of Object.values(STATUS)) expect(colour).toMatch(HEX);
    // Status colours never double as a series
    for (const colour of Object.values(STATUS)) expect(SERIES).not.toContain(colour);
  });


  it('draws the meter track as a lighter step of the accent blue', () => {
    expect(METER_TRACK).toMatch(HEX);
    expect(luminance(METER_TRACK)).toBeGreaterThan(luminance(SERIES[0]));
    // blue-dominant, like the ramp it comes from
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(METER_TRACK.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });


  it('keeps the grid ink recessive: the gridline lighter than the baseline, both far lighter than a series', () => {
    expect(GRID.line).toMatch(HEX);
    expect(GRID.baseline).toMatch(HEX);
    expect(luminance(GRID.line)).toBeGreaterThan(luminance(GRID.baseline));
    expect(contrast(GRID.line, WHITE)).toBeLessThan(contrast(SERIES[0], WHITE));
  });
});







// -----------------------------------------------------------
// niceMax
// -----------------------------------------------------------

describe('niceMax', () => {

  it.each([
    [1, 1], [0.7, 1], [2, 2], [3, 5], [7, 10], [10, 10], [12, 20], [20, 20], [21, 25], [25, 25], [26, 50],
    [50, 50], [51, 100], [99, 100], [100, 100], [101, 200], [180, 200], [240, 250], [1234567, 2000000],
    [0.3, 0.5], [0.2, 0.2], [0.05, 0.05], [0.0042, 0.005],
  ])('%s → %s', (value, expected) => {
    expect(niceMax(value)).toBeCloseTo(expected, 12);
  });


  it('never answers less than the value, and at most 2.5× it', () => {
    for (let value = 0.013; value < 5e6; value *= 1.37) {
      const top = niceMax(value);
      expect(top, String(value)).toBeGreaterThanOrEqual(value);
      expect(top / value, String(value)).toBeLessThanOrEqual(2.5);
    }
  });


  it.each([
    [0], [-5], [null], [undefined], [NaN],
  ])('answers 1 for nothing to show (%s) — an axis never collapses to 0', (value) => {
    expect(niceMax(value)).toBe(1);
  });
});
