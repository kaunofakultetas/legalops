// -----------------------------------------------------------
//  [*] About — whose the product is, and what it does with data
//
//  The page for the questions a careful visitor asks last:
//  who made this, who is it for, how does one get in, what
//  happens to what I type and upload, and how is it built.
//  The answers on the data are the user guide's
//  (docs/markdown/lt/user-guide.md §8) — change them together. It ends
//  with the caution every report carries: an artificial
//  intelligence system, whose findings are an aid. Its head
//  shows the mark whole, and its answers arrive one after
//  another as the page is read.
//
//  Split into (root component last):
//
//    Facts — who, access, the data, how it is built
//    About — the page (default export)
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import Closing from '@/site/Closing';
import { Band, PageHead, Part, Title } from '@/site/parts';







// -----------------------------------------------------------
// Facts
// -----------------------------------------------------------
//
// The answers as a list of definitions: the question on the
// left from a tablet's width up, the answer in a reading
// measure on the right; the data's four facts are a list of
// their own inside it.
//
// Used by:
//   - About (below)
// -----------------------------------------------------------

function Facts() {

  const t = useTranslations('SITE.about');
  const row = 'grid gap-x-10 gap-y-3 border-t border-edge py-8 md:grid-cols-[16rem_1fr]';
  const heading = 'm-0 font-serif text-[1.5rem] font-semibold leading-[1.2]';
  const answer = 'm-0 max-w-[40rem] text-[1.0625rem] leading-[1.65]';


  return (
    <Band ground="paper" reveal className="py-10 sm:py-14">
      <div className={`${row} border-t-0`}>
        <Part as="h2" className={heading}>{t('who.title')}</Part>
        <Part as="p" turn={1} className={answer}>{t('who.text')}</Part>
      </div>
      <div className={row}>
        <Part as="h2" turn={2} className={heading}>{t('access.title')}</Part>
        <Part as="p" turn={3} className={answer}>{t('access.text')}</Part>
      </div>
      <div className={row}>
        <Part as="h2" turn={4} className={heading}>{t('data.title')}</Part>
        <ul className="m-0 max-w-[40rem] list-none p-0 text-[1.0625rem] leading-[1.65]">
          {['chats', 'companies', 'log', 'gateway'].map((fact, index) => (
            <Part as="li" key={fact} turn={5 + index} className={index === 0 ? 'pb-3' : 'border-t border-edge py-3 last:pb-0'}>{t(`data.${fact}`)}</Part>
          ))}
        </ul>
      </div>
      <div className={row}>
        <Part as="h2" turn={9} className={heading}>{t('built.title')}</Part>
        <Part as="p" turn={10} className={answer}>{t('built.text')}</Part>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// About (default export)
// -----------------------------------------------------------
//
// The head, the answers, then the caution on ink — the same
// sentence the footer carries, here where it is read.
//
// Used by:
//   - site/router.jsx — route /about
// -----------------------------------------------------------

export default function About() {

  const t = useTranslations('SITE.about');
  const tCommon = useTranslations('SITE.common.footer');


  return (
    <>
      <PageHead id="about-head" title={t('head.title')} arrangement="mark">{t('head.lede')}</PageHead>
      <Facts />
      <Band ground="ink" labelledBy="caution-title" reveal className="py-14 sm:py-16">
        <Part><Title id="caution-title">{t('caution.title')}</Title></Part>
        <Part as="p" turn={1} className="m-0 mt-4 max-w-[46rem] text-[1.125rem] leading-[1.6] text-white/80">{tCommon('disclaimer')}</Part>
      </Band>
      <Closing reveal />
    </>
  );
}
