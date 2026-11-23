// -----------------------------------------------------------
//  [*] Console — mounts the console
//
//  Started by the entry (main.jsx) for an address under
//  /console. Renders the router (route table in router.jsx,
//  providers in App.jsx) into the #root div of index.html,
//  wrapped in the TanStack Query provider — ONE QueryClient
//  owns every backend fetch. Global styles (Tailwind) are pulled in here,
//  and the two typefaces of the theme: self-hosted from the
//  @fontsource packages (the bundle carries the font files,
//  so no visitor's browser asks a font CDN), the browser
//  fetching only the subsets a page uses — Latin and Latin
//  Extended for Lithuanian.
//
//  Vite fires vite:preloadError when a chunk's CSS/JS preload
//  fails — the typical symptom of a tab that outlived a
//  deploy; the listener reloads once (utils/chunkReload.js)
//  instead of leaving a half-broken page.
// -----------------------------------------------------------

import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/router';
import { reloadOnce } from '@/utils/chunkReload';
import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/source-sans-3/wght-italic.css';
import '@fontsource-variable/source-serif-4';
import '@/globals.css';


// One client for the whole app. retry 1: a poll that fails
// twice in a row should surface its error state, not spin.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});


// A stale chunk: reload once; preventDefault only when the
// reload happens, so a repeated failure still surfaces
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});


ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
