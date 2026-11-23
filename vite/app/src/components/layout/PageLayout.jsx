// -----------------------------------------------------------
//  [*] PageLayout — the shared frame of every page
//
//  Navbar on top; under it ONE scrolling area that holds the
//  Sidebar on the left (a drawer on phones), the page content
//  with a header row — an optional back link, the h1 title
//  with an optional subtitle, and `actions` on the right
//  (buttons, filters — they wrap under the title on narrow
//  screens) — and, after both, the copyright band
//  (PageFooter). A skip link jumps keyboard users past the
//  navigation. The frame uses the dynamic viewport height so
//  mobile browser toolbars never hide the bottom of the page.
//
//  The band is the END of the scrolling page, across the
//  whole window: under a short page the row above it grows,
//  so it stands at the bottom of the screen; under a long one
//  it comes after the last row, and the sidebar — which stays
//  in sight while the content scrolls — makes way for it. The
//  scrolling area is a size container, which is how the
//  sidebar knows the height of the screen it keeps to
//  (Sidebar — RailColumn), and it is positioned, so that
//  what a page hides for screen readers only scrolls with the
//  page instead of stretching the document under it.
//
//  Past its ends the page keeps the colour it ends in. A
//  browser that lets a scrolling area be pulled beyond its
//  content shows the area's own ground there: the desk's
//  grey-blue above the first row, the footer band's ink below
//  the last (BEYOND) — a pale strip under the ink band read as
//  a gap in the page. The row itself paints the desk, so the
//  ink never shows through a page. Where the whole window is
//  pulled instead, the ink is the document's own
//  (index.html), above the bar and below the band.
//
//  The document title is set centrally from the route table
//  (App.jsx — TitleSync), not here.
//
//  The scrolling area keeps its place in the history
//  (useScrollMemory): Back / Forward bring a page back where
//  it was left, a new page starts at the top, a tab or a
//  filter changing the address moves nothing. The back link
//  behaves like Back (useReturnTo): when the list is right
//  behind it IS Back — the list comes back with its filters,
//  its table page and its place; from elsewhere it opens the
//  list as last seen.
//
//  Split into (root component last):
//
//    BEYOND     — the scrolling area's ground past its ends
//    BackLink   — the header's way back to the list
//    PageHeader — back link, title, subtitle, actions
//    PageLayout — the frame (default export)
// -----------------------------------------------------------

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslations } from '@/i18n';
import useReturnTo from '@/hooks/useReturnTo';
import useScrollMemory from '@/hooks/useScrollMemory';
import Navbar from '@/components/layout/Navbar';
import PageFooter from '@/components/layout/PageFooter';
import Sidebar from '@/components/layout/Sidebar';


// The ground of the scrolling area itself, seen only when it
// is pulled past its content: the desk in its upper half, the
// footer band's ink in its lower
const BEYOND = 'bg-[linear-gradient(to_bottom,var(--mui-palette-background-default)_50%,var(--mui-palette-primary-main)_50%)]';







// -----------------------------------------------------------
// BackLink
// -----------------------------------------------------------
//
// A real link to the list's address (a new tab, a copied
// link, a screen reader's link list all get the list), whose
// plain click returns the way useReturnTo decides — Back when
// the list is right behind. A click with a modifier (a new
// tab or window) stays the browser's.
//
// Used by:
//   - PageHeader (below)
// -----------------------------------------------------------

function BackLink({ to, label }) {

  const returnTo = useReturnTo();


  const onClick = (event) => {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    returnTo(to);
  };


  return (
    <Link to={to} onClick={onClick} className="inline-flex items-center gap-1 text-sm text-primary no-underline hover:underline mb-1">
      <ArrowBackIcon sx={{ fontSize: 16 }} aria-hidden />
      {label}
    </Link>
  );
}







// -----------------------------------------------------------
// PageHeader
// -----------------------------------------------------------
//
// `back` is {to, label} (`to` the list's path); the title —
// the serif of the theme's h5, the page read as a document —
// wraps (long company and act names) instead of overflowing.
//
// Used by:
//   - PageLayout (below)
// -----------------------------------------------------------

function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5">
      {back && <BackLink to={back.to} label={back.label} />}
      <div className="flex items-start justify-between flex-wrap gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <Typography variant="h5" component="h1" className="[overflow-wrap:anywhere]">{title}</Typography>
          {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap items-center pt-0.5">{actions}</div>}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// PageLayout (default export)
// -----------------------------------------------------------
//
// The frame around a page's content: the bars (pages pass
// authData through for them), the header built from the
// title, the optional subtitle, actions and way back, and
// the footer at the end of the scrolling area. <main> is the
// content beside the sidebar; the area around both scrolls.
//
// Used by:
//   - every page except Login and Chat (the chat page builds
//     its own frame from Navbar + Sidebar)
//   - RouteError.jsx, NotFound.jsx — the error pages
// -----------------------------------------------------------

export default function PageLayout({ authData, title, subtitle = null, actions = null, back = null, children }) {

  const t = useTranslations('COMPONENTS.common');
  const scrollRef = useRef(null);
  useScrollMemory(scrollRef);


  return (
    <div className="h-dvh flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[2000] focus:bg-surface focus:px-3 focus:py-2 focus:rounded focus:shadow-float">
        {t('skipToContent')}
      </a>
      <Navbar authData={authData} />
      <div ref={scrollRef} id="page-scroll" data-page-scroll className={`relative flex-1 min-h-0 overflow-auto flex flex-col [container-type:size] ${BEYOND}`}>
        <div className="flex grow shrink-0 bg-canvas">
          <Sidebar authData={authData} />
          <main id="main-content" data-page-body tabIndex={-1} className="flex-1 min-w-0 px-4 pt-5 pb-6 md:px-8 md:pt-7 md:pb-8 outline-none">
            <PageHeader title={title} subtitle={subtitle} actions={actions} back={back} />
            {children}
          </main>
        </div>
        <PageFooter />
      </div>
    </div>
  );
}
