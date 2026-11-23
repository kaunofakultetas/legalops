// -----------------------------------------------------------
//  [*] MUI theme — ink on paper, the sources in a serif
//
//  The app's one light colour scheme (dark mode is not
//  supported). MUI emits every palette value as a CSS custom
//  property (--mui-*), and globals.css maps those onto the
//  Tailwind utilities, so both styling systems draw from the
//  values here.
//
//  The look in short: the brand's colours — those of the
//  mosaic mark (Wordmark.jsx) — on white sheets over a
//  grey-blue desk. Ink blue carries the top bar, the actions
//  and the links; the mark's middle blue tints the current
//  place and draws progress; its yellow marks what matters:
//  quoted evidence, the text selection, the current page in
//  the navigation, the keyboard focus on the ink bar. Text
//  is ink-black, rules are hairlines instead of shadows —
//  only what floats above the page (menus, dialogs, drawers,
//  toasts) casts one. Source Sans 3 carries the interface
//  and the assistant's prose; Source Serif 4 the page titles
//  and the texts the app quotes (the law, the company's
//  documents), so a reader can always tell the source from
//  the comment on it. Everything is set in sentence case —
//  MUI's capitals on buttons, tabs and overlines are
//  switched off, and Lithuanian reads far better without
//  them. Corners grow with the layer: 3 px tags, 4 px
//  controls, 6 px sheets, 8 px dialogs.
//
//  Source Sans 3 has a small x-height, so the UI base is 15
//  px (typography.fontSize scales every MUI component) and
//  globals.css moves Tailwind's text-sm / text-xs to match.
//
//  The colours, the font stacks and the verdict tints are
//  the brand's (brand.js — shared with the public site, which
//  wears them without MUI); COLORS and FONTS are handed on
//  from here under the same names.
//
//  The theme is rebuilt per locale (localeTheme.js) with the
//  translated built-in texts of MUI and the DataGrid merged
//  in; buildTheme is that entry point.
//
//  Split into:
//
//    FLOAT_SHADOW  — the shadow of a floating layer (named)
//    themeOptions  — the options object (named export)
//    shadowScale   — MUI's 25 elevations
//    chipStyle     — every Chip as a tag
//    alertStyle    — every standard Alert as a tinted sheet
//    buildTheme    — options + locale texts (named export)
// -----------------------------------------------------------

import { alpha, createTheme } from '@mui/material/styles';
import { COLORS, FONTS, TONES } from '@/brand';


// The brand's table under the names the console has always
// imported from here (providers.jsx, Particles.jsx)
export { COLORS, FONTS };







// -----------------------------------------------------------
// FLOAT_SHADOW
// -----------------------------------------------------------
//
// The one shadow of the app, under what floats above the
// page; sheets on the page carry a hairline instead.
//
// Used by:
//   - themeOptions (below) — the elevations of menus,
//     popovers, drawers and dialogs
//   - providers.jsx — the toasts
// -----------------------------------------------------------

export const FLOAT_SHADOW = '0 2px 6px rgba(22, 30, 43, 0.08), 0 12px 32px rgba(22, 30, 43, 0.14)';







// -----------------------------------------------------------
// themeOptions
// -----------------------------------------------------------
//
// The options object, exported separately so the locale-
// aware rebuild (buildTheme) starts from it. Besides the
// palette and the type scale it restyles the components the
// pages lean on: buttons (no ripple — the press moves the
// button a pixel instead, and the keyboard focus draws an ink
// ring), the ink top bar, sheets, inputs, tabs, tags, alerts,
// menus, tooltips, accordions, progress bars and the
// DataGrid.
//
// Used by:
//   - buildTheme and the default export (below)
// -----------------------------------------------------------

export const themeOptions = {
  cssVariables: true,

  palette: {
    primary: { main: COLORS.ink, dark: COLORS.inkDark, light: COLORS.blue, contrastText: '#FFFFFF' },
    // The mark's middle blue (MUI's own secondary is a purple)
    secondary: { main: COLORS.blue, dark: COLORS.ink, light: COLORS.sky, contrastText: '#FFFFFF' },
    success: { main: TONES.success.ink, contrastText: '#FFFFFF' },
    info: { main: TONES.info.ink, contrastText: '#FFFFFF' },
    warning: { main: TONES.warning.ink, contrastText: '#FFFFFF' },
    error: { main: TONES.error.ink, contrastText: '#FFFFFF' },
    text: { primary: COLORS.text, secondary: COLORS.graphite },
    divider: COLORS.rule,
    background: { default: COLORS.desk, paper: COLORS.paper },
    action: { hover: alpha(COLORS.ink, 0.05), selected: alpha(COLORS.ink, 0.09) },

    // Destructive buttons (color="delete"): the error red
    delete: { main: TONES.error.ink, dark: '#8C1D17', contrastText: '#FFFFFF' },

    // The highlighter, the brand's yellow (globals.css:
    // --color-marker)
    marker: { main: COLORS.sun },
  },

  shape: { borderRadius: 4 },
  shadows: shadowScale(),

  typography: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeightMedium: 600,
    h1: { fontFamily: FONTS.serif, fontWeight: 600, fontSize: '3rem', lineHeight: 1.1, letterSpacing: '-0.015em' },
    h2: { fontFamily: FONTS.serif, fontWeight: 600, fontSize: '2.25rem', lineHeight: 1.15, letterSpacing: '-0.01em' },
    h3: { fontFamily: FONTS.serif, fontWeight: 600, fontSize: '1.875rem', lineHeight: 1.2, letterSpacing: '-0.01em' },
    h4: { fontWeight: 600, fontSize: '2rem', lineHeight: 1.15, letterSpacing: '-0.01em' },
    h5: { fontFamily: FONTS.serif, fontWeight: 600, fontSize: '1.75rem', lineHeight: 1.2, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, fontSize: '1.1875rem', lineHeight: 1.3 },
    subtitle1: { fontWeight: 600, fontSize: '1.0625rem', lineHeight: 1.4 },
    subtitle2: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.4 },
    body1: { fontSize: '1rem', lineHeight: 1.55 },
    body2: { fontSize: '0.9375rem', lineHeight: 1.5 },
    caption: { fontSize: '0.8125rem', lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    overline: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.5, letterSpacing: 0 },
  },

  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 4,
          transition: 'background-color 120ms, border-color 120ms, color 120ms, transform 80ms',
          '&:active': { transform: 'translateY(1px)' },
          '&.Mui-focusVisible': { outline: `2px solid ${COLORS.ink}`, outlineOffset: 2 },
        },
        outlined: ({ ownerState }) => (ownerState.color === 'primary' || ownerState.color === 'inherit'
          ? { borderColor: COLORS.ruleStrong, '&:hover': { borderColor: COLORS.ink, backgroundColor: alpha(COLORS.ink, 0.04) } }
          : {}),
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          '&.Mui-focusVisible': { outline: `2px solid ${COLORS.ink}`, outlineOffset: 1 },
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          color: COLORS.graphite,
          borderColor: COLORS.ruleStrong,
          '&.Mui-selected': { color: COLORS.ink, backgroundColor: alpha(COLORS.ink, 0.09) },
          '&.Mui-selected:hover': { backgroundColor: alpha(COLORS.ink, 0.13) },
          '&.Mui-focusVisible': { outline: `2px solid ${COLORS.ink}`, outlineOffset: -2 },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: 6 },
        elevation1: { border: `1px solid ${COLORS.rule}` },
        outlined: { borderColor: COLORS.rule },
      },
    },

    MuiAccordion: {
      styleOverrides: {
        root: { '&::before': { display: 'none' } },
      },
    },

    // The ink bar: its buttons get a white wash under the
    // pointer and the yellow focus ring (an ink ring would
    // vanish on ink)
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: COLORS.ink,
          color: COLORS.paper,
          '& .MuiButtonBase-root:hover': { backgroundColor: alpha(COLORS.paper, 0.1) },
          '& .MuiButtonBase-root.Mui-focusVisible': { outlineColor: COLORS.sun },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: COLORS.paper,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.field },
          '&:hover:not(.Mui-disabled, .Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.text },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: { height: 2 },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: '10px 14px',
          color: COLORS.graphite,
          '&.Mui-selected': { color: COLORS.text },
          '&.Mui-focusVisible': { outline: `2px solid ${COLORS.ink}`, outlineOffset: -2 },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: chipStyle,
        sizeSmall: { height: 22 },
        labelSmall: { paddingLeft: 7, paddingRight: 7 },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: alertStyle,
        message: { padding: '7px 0' },
      },
    },

    MuiAlertTitle: {
      styleOverrides: {
        root: { fontWeight: 600, marginBottom: 2 },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: COLORS.text, fontSize: '0.8125rem', lineHeight: 1.4, borderRadius: 4, padding: '5px 8px' },
        arrow: { color: COLORS.text },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 8 },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: { border: `1px solid ${COLORS.rule}` },
      },
    },

    MuiMenu: {
      styleOverrides: {
        list: { padding: 4 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: { borderRadius: 4, minHeight: 36 },
      },
    },

    // Progress in the mark's middle blue; a bar in a status
    // colour (an upload that finished) keeps it
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 3, backgroundColor: alpha(COLORS.blue, 0.18) },
        bar: ({ ownerState }) => (ownerState.color === 'primary' ? { backgroundColor: COLORS.blue } : {}),
      },
    },

    MuiDataGrid: {
      styleOverrides: {
        root: {
          '--DataGrid-rowBorderColor': COLORS.rule,
          backgroundColor: COLORS.paper,
          borderColor: COLORS.rule,
          borderRadius: 6,
          // The header row as a band of the brand's sky, ruled off
          // from the rows in sky, its titles and icons in ink. Set
          // on the header cells themselves: the grid (v8) paints
          // them from a variable of its own that a theme value
          // does not outrank
          '& .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeaders .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller--header': {
            backgroundColor: COLORS.skyTint,
          },
          '& .MuiDataGrid-row--borderBottom .MuiDataGrid-columnHeader, & .MuiDataGrid-row--borderBottom .MuiDataGrid-filler, & .MuiDataGrid-row--borderBottom .MuiDataGrid-scrollbarFiller': {
            borderBottom: `1px solid ${COLORS.sky}`,
          },
          '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': { color: COLORS.ink },
          // The footer is ruled off from the rows as firmly as
          // the table is from the page: the grid's own line there
          // is all but white
          '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${COLORS.rule}` },
          '& .MuiDataGrid-columnSeparator': { color: COLORS.sky },
        },
        columnHeaderTitle: { fontWeight: 600, color: COLORS.ink },
        row: { '&:hover': { backgroundColor: alpha(COLORS.ink, 0.035) } },
        cell: { '&:focus, &:focus-within': { outline: `2px solid ${COLORS.ink}`, outlineOffset: -2 } },
        columnHeader: { '&:focus, &:focus-within': { outline: `2px solid ${COLORS.ink}`, outlineOffset: -2 } },
      },
    },
  },
};


// The locale-less theme — the default for anything rendered
// outside the localized provider
const theme = createTheme(themeOptions);







// -----------------------------------------------------------
// shadowScale
// -----------------------------------------------------------
//
// MUI's 25 elevations. 0 and 1 cast nothing (a sheet at
// elevation 1 gets its hairline from the Paper override),
// the low ones a faint lift (a button or a toggle that sits
// raised), everything from 6 up — menus at 8, drawers at 16,
// dialogs at 24 — the floating shadow.
//
// Used by:
//   - themeOptions (below)
// -----------------------------------------------------------

function shadowScale() {
  const lift = '0 1px 2px rgba(22, 30, 43, 0.08)';
  return Array.from({ length: 25 }, (_, level) => {
    if (level <= 1) return 'none';
    return level < 6 ? lift : FLOAT_SHADOW;
  });
}







// -----------------------------------------------------------
// chipStyle
// -----------------------------------------------------------
//
// The tag look of every Chip: an outlined chip in a colour
// becomes a tinted tag (no outline, the colour's tint behind
// its own ink), a neutral one a grey tag (a translucent tint,
// so it shows on a sheet and on the desk alike); a filled
// chip (a critical severity) keeps MUI's solid fill. A tag
// that links somewhere (a citation) turns ink under the
// pointer. The text carries the meaning, so the tint is only
// a second cue.
//
// Used by:
//   - themeOptions (below) — MuiChip
// -----------------------------------------------------------

function chipStyle({ ownerState }) {
  const base = { borderRadius: 3, fontWeight: 600 };
  if (ownerState.variant !== 'outlined') return base;
  const tag = {
    ...base,
    border: '1px solid transparent',
    '&.MuiChip-clickable:hover': { backgroundColor: alpha(COLORS.ink, 0.12), color: COLORS.ink },
  };
  const tone = TONES[ownerState.color];
  if (tone) return { ...tag, backgroundColor: tone.bg, color: tone.ink };
  if (ownerState.color === 'primary') return { ...tag, backgroundColor: alpha(COLORS.ink, 0.08), color: COLORS.ink };
  return { ...tag, backgroundColor: alpha(COLORS.text, 0.07), color: COLORS.text };
}







// -----------------------------------------------------------
// alertStyle
// -----------------------------------------------------------
//
// A standard Alert as a tinted sheet with a hairline in its
// severity's colour and the icon in that colour's ink; the
// text stays ink-black so a long message reads like the rest
// of the page. Filled and outlined alerts keep MUI's look.
//
// Used by:
//   - themeOptions (below) — MuiAlert
// -----------------------------------------------------------

function alertStyle({ ownerState }) {
  const base = { borderRadius: 6, padding: '6px 14px', alignItems: 'flex-start' };
  const tone = TONES[ownerState.severity || ownerState.color];
  if (ownerState.variant !== 'standard' || !tone) return base;
  return {
    ...base,
    backgroundColor: tone.bg,
    border: `1px solid ${tone.border}`,
    color: COLORS.text,
    '& .MuiAlert-icon': { color: tone.ink },
  };
}







// -----------------------------------------------------------
// buildTheme
// -----------------------------------------------------------
//
// The theme with each override merged onto the base in
// turn; an override is a partial theme in MUI's locale-
// object shape (its components' default props).
//
// Used by:
//   - localeTheme.js — useLocaleTheme
// -----------------------------------------------------------

export function buildTheme(...overrides) {
  return createTheme(themeOptions, ...overrides);
}


export default theme;
