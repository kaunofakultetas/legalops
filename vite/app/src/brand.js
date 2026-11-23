// -----------------------------------------------------------
//  [*] brand — the colours and faces of the product
//
//  The palette by name, the two font stacks and the tints of
//  the four verdict tones, free of any component library: the
//  console builds its MUI theme from them (theme.js) and the
//  public site wears them without loading MUI at all
//  (site/main.jsx). One table, so the two halves of the
//  origin cannot drift apart in colour.
//
//  Split into:
//
//    TONES  — the severity tints (named export)
//    COLORS — the named colours (named export)
//    FONTS  — the two font stacks (named export)
// -----------------------------------------------------------







// -----------------------------------------------------------
// TONES
// -----------------------------------------------------------
//
// The tints of a verdict per severity: the sheet, its rule
// and the ink of its text and icon. Every ink passes 4.5:1
// on its own sheet and on paper.
//
// Used by:
//   - theme.js — alerts and tags
//   - site/parts.jsx — StatusTag, the verdict tags of the
//     public site's specimens
// -----------------------------------------------------------

export const TONES = {
  success: { bg: '#EDF6F0', border: '#BCDCC8', ink: '#1E7B4E' },
  info: { bg: '#EBF2FA', border: '#C3D7EE', ink: '#1F6FB2' },
  warning: { bg: '#FCF3E5', border: '#EDD2A6', ink: '#9A5400' },
  error: { bg: '#FBEDEB', border: '#EFC3BD', ink: '#B3261E' },
};







// -----------------------------------------------------------
// COLORS
// -----------------------------------------------------------
//
// The palette by name. The first five are the brand's — the
// colours of the mosaic mark. Ink is the brand blue: the top
// bar, primary buttons, links and the focus ring; its dark
// step is the hover shade and the dark end of the login
// page's gradient. Blue, the mark's middle blue, is that
// gradient's light end, the tint of the current place (the
// page in the navigation, the open conversation, the chosen
// provision) and the colour of progress; sky is the pale
// blue the mark wears on ink, and its tint (skyTint, opaque,
// so rows scrolled under it never show through) the band of
// a table's header row. Sun, the mark's yellow, is the
// marker: the highlighter of quoted evidence and of the text
// selection, and the sign of "here" — the current page's
// stripe in the navigation, the keyboard focus on the ink
// bar. It never fills a control or carries text of its own.
//
// The rest are the neutrals. Text is ink-black, graphite the
// secondary text and icons. Desk is the canvas, paper the
// sheets on it; rule draws hairlines (sheets, tables,
// dividers) and field the outline of an input, dark enough
// (3:1 on paper) to show where a field is. Every text colour
// passes 4.5:1 on paper and on desk; white passes it on ink
// and on blue, ink on skyTint.
//
// Used by:
//   - theme.js — the palette of the console's theme (it
//     hands them on under the same name)
//   - components/layout/Wordmark.jsx — the mark's colours
//   - site/main.jsx — the public site's palette; the site's
//     sculpture and specimens draw with the same colours
// -----------------------------------------------------------

export const COLORS = {
  ink: '#173A6E',
  inkDark: '#0F2A52',
  blue: '#3E6FB0',
  sky: '#8FB1E3',
  skyTint: '#DCE6F4',
  sun: '#FFD84A',
  text: '#161E2B',
  graphite: '#5B6676',
  desk: '#EEF1F5',
  paper: '#FFFFFF',
  rule: '#DCE1E8',
  ruleStrong: '#C3CBD6',
  field: '#8C96A5',
};







// -----------------------------------------------------------
// FONTS
// -----------------------------------------------------------
//
// The two families, self-hosted (console.jsx imports the
// @fontsource packages, so no page ever asks a font CDN).
// The same stacks are Tailwind's font-sans / font-serif in
// globals.css. Both ship tabular figures by default, so
// numbers line up in tables without a class.
//
// Used by:
//   - theme.js — the typography of the console's theme (it
//     hands them on under the same name)
// -----------------------------------------------------------

export const FONTS = {
  sans: '"Source Sans 3 Variable", "Source Sans 3", "Segoe UI", system-ui, sans-serif',
  serif: '"Source Serif 4 Variable", "Source Serif 4", Georgia, "Times New Roman", serif',
};
