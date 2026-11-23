// -----------------------------------------------------------
//  [*] Missing — an address the public site does not have
//
//  Two different visitors end here. One follows an address
//  of the console from before it moved under /console — a
//  bookmarked report, a link to the sign-in page: the first
//  segment of the path gives it away (sitemap.js), and the
//  page is replaced by the same address under the console's
//  base, query and fragment kept, so old links go on
//  working. The other mistyped an address of the site, and
//  is told so, with the way home.
// -----------------------------------------------------------

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslations } from '@/i18n';
import { CONSOLE_BASENAME } from '@/paths';
import { Action, Band, Lede } from '@/site/parts';
import { CONSOLE_SECTIONS } from '@/site/sitemap';







// -----------------------------------------------------------
// Missing (default export)
// -----------------------------------------------------------
//
// Nothing is drawn for an address that is being handed to
// the console — the replacement is under way. location
// .replace keeps the old address out of the history, so Back
// does not bounce through it.
//
// Used by:
//   - site/router.jsx — the "*" route
// -----------------------------------------------------------

export default function Missing() {

  const t = useTranslations('SITE.missing');
  const { pathname, search, hash } = useLocation();
  const moved = CONSOLE_SECTIONS.includes(pathname.split('/')[1]);


  useEffect(() => {
    if (moved) window.location.replace(`${CONSOLE_BASENAME}${pathname}${search}${hash}`);
  }, [moved, pathname, search, hash]);


  if (moved) return null;


  return (
    <Band ground="paper" labelledBy="missing-title" className="py-24 sm:py-32">
      <h1 id="missing-title" className="m-0 font-serif text-[2.25rem] font-semibold leading-[1.1] sm:text-[3rem]">{t('TITLE')}</h1>
      <Lede className="mt-4">{t('text')}</Lede>
      <Action to="/" className="mt-8">{t('home')}</Action>
    </Band>
  );
}
