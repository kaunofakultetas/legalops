// -----------------------------------------------------------
//  [*] Providers — i18n + MUI theme + toasts + nav drawer
//
//  Wraps the app in the IntlProvider (src/i18n.jsx), the MUI
//  styled engine in CSS-layer mode, the ThemeProvider with
//  the theme of the live locale (localeTheme.js — MUI's and
//  the DataGrid's own texts translated), the react-hot-toast
//  Toaster the forms use for feedback (a sheet like the
//  theme's floating layers: the app's type and ink, a
//  hairline, the one shadow), and the phone navigation
//  drawer's state. Dark mode is deliberately not supported.
//
//  CSS layers: MUI's styles go into @layer mui, declared
//  BELOW Tailwind's utilities, so a className on an MUI
//  component (mb-2, w-full…) finally wins over the
//  component's own styles. The order statement is injected
//  first through GlobalStyles (MUI leaves a bare @layer
//  statement unwrapped) and repeats globals.css.
//
//  Split into (root component last):
//
//    LAYER_ORDER    — the cascade layer order
//    TOAST_OPTIONS  — the toasts' look
//    LocalizedTheme — ThemeProvider for the live locale
//    Providers      — the stack (default export)
// -----------------------------------------------------------

import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import GlobalStyles from '@mui/material/GlobalStyles';
import CssBaseline from '@mui/material/CssBaseline';
import { Toaster } from 'react-hot-toast';
import { IntlProvider } from '@/i18n';
import { useLocaleTheme } from '@/localeTheme';
import { NavDrawerProvider } from '@/components/layout/NavDrawer';
import { COLORS, FLOAT_SHADOW, FONTS, themeOptions } from '@/theme';


// Tailwind's layers with MUI's slotted under the components
// and utilities — the same statement as globals.css
const LAYER_ORDER = '@layer theme, base, mui, components, utilities;';

// The toasts drawn like the theme's floating sheets; the
// icons in the theme's success and error inks
const TOAST_OPTIONS = {
  style: {
    fontFamily: FONTS.sans,
    fontSize: '0.9375rem',
    color: COLORS.text,
    background: COLORS.paper,
    border: `1px solid ${COLORS.rule}`,
    borderRadius: 6,
    boxShadow: FLOAT_SHADOW,
    maxWidth: 440,
  },
  success: { iconTheme: { primary: themeOptions.palette.success.main, secondary: COLORS.paper } },
  error: { iconTheme: { primary: themeOptions.palette.error.main, secondary: COLORS.paper } },
};







// -----------------------------------------------------------
// LocalizedTheme
// -----------------------------------------------------------
//
// Rebuilds the theme when the locale switches; must sit
// inside the IntlProvider.
//
// Used by:
//   - Providers (below)
// -----------------------------------------------------------

function LocalizedTheme({ children }) {
  const theme = useLocaleTheme();
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}







// -----------------------------------------------------------
// Providers (default export)
// -----------------------------------------------------------
//
// The provider stack every page renders under.
//
// Used by:
//   - App.jsx — around every route, /login included
//   - pages/RouteError/RouteError.jsx — the root error page,
//     which renders outside App
// -----------------------------------------------------------

export default function Providers({ children }) {
  return (
    <IntlProvider>
      <StyledEngineProvider enableCssLayer>
        <GlobalStyles styles={LAYER_ORDER} />
        <LocalizedTheme>
          <CssBaseline />
          <Toaster position="top-center" toastOptions={TOAST_OPTIONS} />
          <NavDrawerProvider>{children}</NavDrawerProvider>
        </LocalizedTheme>
      </StyledEngineProvider>
    </IntlProvider>
  );
}
