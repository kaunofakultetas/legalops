// -----------------------------------------------------------
//  [*] SiteFooter — the foot of every public page
//
//  A band in the dark ink: the wordmark with one sentence on
//  what the product is, the site's pages once more, the way
//  into the console, then what a reader must know before
//  trusting the product — it is an artificial intelligence
//  system and its findings are an aid — as one line wherever
//  the window is wide enough for it, and under a hairline,
//  centred, the copyright line the console's own footer
//  carries.
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import { useTranslations } from '@/i18n';
import { CONSOLE_LOGIN } from '@/paths';
import Wordmark from '@/components/layout/Wordmark';
import { Wrap } from '@/site/parts';
import { PAGES } from '@/site/sitemap';


// A link of the footer: quiet white, underlined under the
// pointer, with the yellow focus ring of the dark grounds
const LINK = 'rounded-sm text-white/80 no-underline hover:text-white hover:underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-marker';







// -----------------------------------------------------------
// SiteFooter (default export)
// -----------------------------------------------------------
//
// The band, as the page's footer landmark.
//
// Used by:
//   - SiteLayout.jsx — under every page of the site
// -----------------------------------------------------------

export default function SiteFooter() {

  const t = useTranslations('SITE.common');
  const tNav = useTranslations('navbar');
  const tCommon = useTranslations('COMPONENTS.common');


  return (
    <footer aria-label={t('footer.label')} className="bg-primary-dark text-white">
      <Wrap className="pt-12 pb-6 sm:pt-14">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-6">
            <Wordmark name={tNav('title')} onDark size={28} />
            <p className="m-0 mt-4 max-w-[26rem] text-[0.9375rem] leading-[1.6] text-white/70">{t('footer.about')}</p>
          </div>
          <div className="md:col-span-3">
            <p className="m-0 text-sm font-semibold text-white">{t('footer.pages')}</p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-[0.9375rem]">
              {PAGES.map((page) => <li key={page.to}><Link to={page.to} className={LINK}>{t(`nav.${page.key}`)}</Link></li>)}
            </ul>
          </div>
          <div className="md:col-span-3">
            <p className="m-0 text-sm font-semibold text-white">{t('footer.console')}</p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-[0.9375rem]">
              <li><a href={CONSOLE_LOGIN} className={LINK}>{t('signIn')}</a></li>
            </ul>
          </div>
        </div>
        <p className="m-0 mt-10 text-[0.8125rem] leading-[1.6] text-white/60">{t('footer.disclaimer')}</p>
        <p className="m-0 mt-6 border-t border-white/15 pt-6 text-center text-[0.8125rem] leading-[1.6] text-white/60">{tCommon('copyright')}</p>
      </Wrap>
    </footer>
  );
}
