// -----------------------------------------------------------
//  [*] Documentation — the book on how the system is built
//
//  The page that tells a visitor there is a book and hands
//  it over: what the system's documentation covers, how it
//  is arranged, how it marks who is acting — a model, the
//  code or a person — and the book itself as a PDF, in the
//  language the visitor is reading. The words follow the
//  book's own "About this document"
//  (docs/latex/*/front/about.tex) — change them together.
//
//  The books are not part of this application: the stack's
//  endpoint serves the built PDFs under /docs
//  (docker-compose.yml — legalops-docs), so the way to one is
//  a plain address outside the site's router. The head shows
//  the mark's pieces standing like volumes on a shelf.
//
//  Split into (root component last):
//
//    BOOK          — the book's address, per language
//    PARTS         — the four parts of the book
//    PANELS        — the three kinds of panel, with their rules
//    Open          — what the file is, and the way to it
//    Arranged      — the parts of the book
//    Acting        — who is acting, as the book marks it
//    Documentation — the page (default export)
// -----------------------------------------------------------

import { useLocale, useTranslations } from '@/i18n';
import Closing from '@/site/Closing';
import { Action, Band, Lede, PageHead, Part, Title } from '@/site/parts';


// The built book of each language, where the endpoint serves
// docs/output: one folder per language
const BOOK = {
  lt: '/docs/lt/documentation.pdf',
  en: '/docs/en/documentation.pdf',
};

// The parts of the book in its own order, by the key of
// their name and text (SITE.documentation.parts)
const PARTS = ['glance', 'ai', 'running', 'reference'];

// The three kinds of panel the book marks its pages with,
// each under a rule of its panel's colour: the model's
// yellow, the code's pale blue (brand.js — sky), and white
// for the frame around a person's decision
const PANELS = [
  ['model', 'border-marker'],
  ['code', 'border-[#8FB1E3]'],
  ['person', 'border-white'],
];







// -----------------------------------------------------------
// Open
// -----------------------------------------------------------
//
// What the file is on the left, the way to it on the right:
// one button that opens the edition in the visitor's
// language beside the site, so the page stays where it was,
// with a line under it on what will open. The other edition
// needs no second button — the bar's language switch changes
// this one.
//
// Used by:
//   - Documentation (below)
// -----------------------------------------------------------

function Open() {

  const t = useTranslations('SITE.documentation.open');
  const locale = useLocale();


  return (
    <Band ground="paper" labelledBy="open-title" reveal className="py-14 sm:py-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <Part>
          <Title id="open-title">{t('title')}</Title>
          <Lede className="mt-3">{t('text')}</Lede>
        </Part>
        <Part move="pop" turn={2} className="shrink-0">
          <Action href={BOOK[locale]} target="_blank" rel="noopener">{t('action')}</Action>
          <p className="m-0 mt-3 text-[0.9375rem] text-muted">{t('file')}</p>
        </Part>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Arranged
// -----------------------------------------------------------
//
// The parts of the book as a list of definitions on the
// desk's grey-blue: the part's name on the left from a
// tablet's width up, what it covers in a reading measure on
// the right.
//
// Used by:
//   - Documentation (below)
// -----------------------------------------------------------

function Arranged() {

  const t = useTranslations('SITE.documentation.parts');


  return (
    <Band ground="desk" labelledBy="arranged-title" reveal>
      <Part><Title id="arranged-title">{t('title')}</Title></Part>
      <dl className="m-0 mt-8">
        {PARTS.map((part, index) => (
          <Part key={part} turn={1 + index} className="grid gap-x-10 gap-y-2 border-t border-[#C3CBD6] py-6 md:grid-cols-[18rem_1fr]">
            <dt className="font-serif text-[1.3125rem] font-semibold leading-[1.25]">{t(`${part}.name`)}</dt>
            <dd className="m-0 max-w-[40rem] leading-[1.65]">{t(`${part}.text`)}</dd>
          </Part>
        ))}
      </dl>
    </Band>
  );
}







// -----------------------------------------------------------
// Acting
// -----------------------------------------------------------
//
// The line the book draws on every page, on ink: what a
// model wrote, what the code verified, what a person decided
// — the three kinds of panel side by side, each under a rule
// of its own colour.
//
// Used by:
//   - Documentation (below)
// -----------------------------------------------------------

function Acting() {

  const t = useTranslations('SITE.documentation.acting');


  return (
    <Band ground="ink" labelledBy="acting-title" reveal className="py-14 sm:py-16">
      <Part><Title id="acting-title">{t('title')}</Title></Part>
      <Part turn={1}><Lede onInk className="mt-4 max-w-[46rem]">{t('text')}</Lede></Part>
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {PANELS.map(([panel, rule], index) => (
          <Part key={panel} turn={2 + index * 1.5} className={`border-t-2 pt-5 ${rule}`}>
            <h3 className="m-0 font-serif text-[1.3125rem] font-semibold">{t(`${panel}.name`)}</h3>
            <p className="m-0 mt-2 leading-[1.6] text-white/80">{t(`${panel}.text`)}</p>
          </Part>
        ))}
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Documentation (default export)
// -----------------------------------------------------------
//
// The head, the way to the book, how it is arranged, and the
// line it draws.
//
// Used by:
//   - site/router.jsx — route /documentation
// -----------------------------------------------------------

export default function Documentation() {

  const t = useTranslations('SITE.documentation');


  return (
    <>
      <PageHead id="documentation-head" title={t('head.title')} arrangement="shelf">{t('head.lede')}</PageHead>
      <Open />
      <Arranged />
      <Acting />
      <Closing reveal />
    </>
  );
}
