// -----------------------------------------------------------
//  [*] Site — mounts the public site
//
//  Started by the entry (main.jsx) for every address outside
//  /console: the pages a visitor without an account reads
//  (site/router.jsx), inside the translations provider.
//  Nothing else — no MUI theme, no query client, no session:
//  the site asks the backend for nothing, and a visitor who
//  never signs in never downloads the console (console.jsx).
//
//  The stylesheet and the two typefaces are the console's
//  (globals.css, the self-hosted @fontsource packages), so
//  both halves of the origin are set in the same faces and
//  the browser fetches them once.
//
//  The palette is set here, before anything is drawn. The
//  stylesheet's utilities read the colours MUI's theme emits
//  as CSS variables on the document's root, and the site
//  loads no MUI — so the entry writes those same variables
//  itself, from the brand's table (brand.js). On the root,
//  not on the site's frame: the stylesheet's own variables
//  (the marker's yellow, the text selection) are resolved
//  there.
// -----------------------------------------------------------

import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { COLORS } from '@/brand';
import { IntlProvider } from '@/i18n';
import { router } from '@/site/router';
import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/source-serif-4';
import '@/globals.css';


// The variables globals.css maps onto the Tailwind utilities
// — the ones theme.js makes MUI emit in the console
const BRAND_VARS = {
  '--mui-palette-primary-main': COLORS.ink,
  '--mui-palette-primary-dark': COLORS.inkDark,
  '--mui-palette-primary-light': COLORS.blue,
  '--mui-palette-background-default': COLORS.desk,
  '--mui-palette-background-paper': COLORS.paper,
  '--mui-palette-text-primary': COLORS.text,
  '--mui-palette-text-secondary': COLORS.graphite,
  '--mui-palette-divider': COLORS.rule,
  '--mui-palette-marker-main': COLORS.sun,
};

for (const [name, value] of Object.entries(BRAND_VARS)) document.documentElement.style.setProperty(name, value);


ReactDOM.createRoot(document.getElementById('root')).render(
  <IntlProvider>
    <RouterProvider router={router} />
  </IntlProvider>
);
