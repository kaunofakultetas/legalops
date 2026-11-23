// -----------------------------------------------------------
//  [*] SiteLayout — the frame of every public page
//
//  The public site's layout route: the ink bar, the page the
//  router chose, the footer. Two things live here because
//  every page needs them:
//
//    - the document title, which follows the route and the
//      language like the console's;
//    - the scroll: a new page opens at its top, and Back
//      returns to where the visitor was (the router's own
//      ScrollRestoration).
//
//  The first focusable thing is a link past the bar to the
//  content, shown only when the keyboard reaches it.
//
//  Split into (root component last):
//
//    TitleSync  — document.title from the route
//    SiteLayout — the frame (default export)
// -----------------------------------------------------------

import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useMatches } from 'react-router-dom';
import { useTranslations } from '@/i18n';
import SiteFooter from '@/site/SiteFooter';
import SiteHeader from '@/site/SiteHeader';







// -----------------------------------------------------------
// TitleSync
// -----------------------------------------------------------
//
// "<page> · <product>" from the route's title key, in the
// current language; the home page's own title already says
// what the product is, so it leads there too.
//
// Used by:
//   - SiteLayout (below)
// -----------------------------------------------------------

function TitleSync() {

  const t = useTranslations();
  const matches = useMatches();
  const key = [...matches].reverse().find((match) => match.handle?.title)?.handle.title;
  const product = t('navbar.title');
  const page = key ? t(key) : null;


  useEffect(() => {
    document.title = page ? `${page} · ${product}` : product;
  }, [page, product]);


  return null;
}







// -----------------------------------------------------------
// SiteLayout (default export)
// -----------------------------------------------------------
//
// The frame: at least as tall as the window, so a short page
// still ends with the footer at the bottom.
//
// Used by:
//   - site/router.jsx — the layout route of every page
// -----------------------------------------------------------

export default function SiteLayout() {

  const t = useTranslations('SITE.common');


  return (
    <div className="flex min-h-dvh flex-col bg-surface font-sans text-content antialiased">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-primary"
      >
        {t('skip')}
      </a>
      <TitleSync />
      <SiteHeader />
      <main id="content" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}
