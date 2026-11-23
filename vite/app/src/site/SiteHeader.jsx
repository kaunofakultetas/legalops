// -----------------------------------------------------------
//  [*] SiteHeader — the public site's ink bar
//
//  The same ink bar the console wears, so a visitor who
//  signs in stays under one roof: the reversed wordmark as
//  the link home, the site's pages, the language switch and
//  the way into the console (parts.jsx — ConsoleLink). It
//  stays at the top of the
//  window while the page scrolls. The page the visitor is on
//  carries the brand's yellow stripe — the console's own
//  sign for "here".
//
//  On a window narrower than a laptop's the pages fold into
//  a menu under the bar, opened by a button; it closes when
//  a page is chosen and on Escape.
//
//  Split into (root component last):
//
//    RING         — the focus ring on the ink bar
//    LocaleButton — the LT / EN switch
//    MenuButton   — the folded menu's button
//    SiteHeader   — the bar (default export)
// -----------------------------------------------------------

import { useEffect, useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useLocale, useSetLocale, useTranslations } from '@/i18n';
import Wordmark from '@/components/layout/Wordmark';
import { ConsoleLink, Wrap } from '@/site/parts';
import { PAGES } from '@/site/sitemap';


// The yellow focus ring of a control on the ink bar
const RING = 'outline-none focus-visible:ring-2 focus-visible:ring-marker focus-visible:ring-offset-2 focus-visible:ring-offset-primary';







// -----------------------------------------------------------
// LocaleButton
// -----------------------------------------------------------
//
// Switches between Lithuanian and English. It shows the
// language it switches TO, in that language, and says so in
// full to a screen reader; the choice is kept in the cookie
// the console reads too, so the two agree.
//
// Used by:
//   - SiteHeader (below)
// -----------------------------------------------------------

function LocaleButton() {

  const t = useTranslations('SITE.common');
  const tNav = useTranslations('navbar');
  const locale = useLocale();
  const setLocale = useSetLocale();
  const other = locale === 'lt' ? 'en' : 'lt';


  return (
    <button
      type="button" lang={other} onClick={() => setLocale(other)}
      aria-label={other === 'en' ? tNav('switchToEnglish') : tNav('switchToLithuanian')}
      className={`cursor-pointer rounded border-0 bg-transparent px-2.5 py-1.5 text-[0.9375rem] font-semibold text-white/80 hover:text-white ${RING}`}
    >
      {t('localeShort')}
    </button>
  );
}







// -----------------------------------------------------------
// MenuButton
// -----------------------------------------------------------
//
// The button for the folded pages on a phone or a tablet:
// three bars that become a cross while the menu is open,
// named for what a press will do.
//
// Used by:
//   - SiteHeader (below)
// -----------------------------------------------------------

function MenuButton({ open, controls, onToggle }) {
  const t = useTranslations('SITE.common');
  return (
    <button
      type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls}
      aria-label={open ? t('menuClose') : t('menuOpen')}
      className={`lg:hidden cursor-pointer rounded border-0 bg-transparent p-2 text-white ${RING}`}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
      </svg>
    </button>
  );
}







// -----------------------------------------------------------
// SiteHeader (default export)
// -----------------------------------------------------------
//
// The bar itself. The pages are one list drawn twice: in the
// bar from a laptop's width up — five names do not fit a
// tablet held upright — and folded under it on anything
// narrower. A navigation closes the folded menu — the
// location it was opened on is remembered, and the menu
// counts as open only while the visitor is still there.
//
// Used by:
//   - SiteLayout.jsx — atop every page of the site
// -----------------------------------------------------------

export default function SiteHeader() {

  const t = useTranslations('SITE.common');
  const tNav = useTranslations('navbar');
  const { key } = useLocation();
  const menuId = useId();
  const [openedAt, setOpenedAt] = useState(null);
  const open = openedAt === key;


  // Escape closes the folded menu, as it closes any menu
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === 'Escape') setOpenedAt(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);


  const link = ({ isActive }) => `flex h-full items-center border-b-2 px-3 text-[0.9375rem] font-semibold no-underline ${RING} ${
    isActive ? 'border-marker text-white' : 'border-transparent text-white/80 hover:text-white'}`;
  const folded = ({ isActive }) => `block border-l-2 py-2.5 pl-3 text-[1.0625rem] font-semibold no-underline ${RING} ${
    isActive ? 'border-marker text-white' : 'border-transparent text-white/80'}`;


  return (
    <header className="sticky top-0 z-40 bg-primary text-white">
      <Wrap className="flex h-[3.75rem] items-center justify-between gap-3">
        <Link to="/" aria-label={t('home')} className={`flex min-w-0 rounded py-1 no-underline ${RING}`}>
          <Wordmark name={tNav('title')} onDark size={28} />
        </Link>
        <nav aria-label={t('nav.label')} className="hidden h-full lg:block">
          <ul className="m-0 flex h-full list-none gap-1 p-0">
            {PAGES.map((page) => <li key={page.to}><NavLink to={page.to} className={link}>{t(`nav.${page.key}`)}</NavLink></li>)}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <LocaleButton />
          <span className="hidden sm:inline-flex"><ConsoleLink className="px-4 py-2 text-[0.9375rem]" /></span>
          <MenuButton open={open} controls={menuId} onToggle={() => setOpenedAt(open ? null : key)} />
        </div>
      </Wrap>
      <nav id={menuId} aria-label={t('nav.label')} hidden={!open} className="border-t border-white/15 lg:hidden">
        <Wrap className="py-4">
          <ul className="m-0 list-none p-0">
            {PAGES.map((page) => <li key={page.to}><NavLink to={page.to} className={folded}>{t(`nav.${page.key}`)}</NavLink></li>)}
          </ul>
          <p className="m-0 mt-4 sm:hidden"><ConsoleLink className="w-full" /></p>
        </Wrap>
      </nav>
    </header>
  );
}
