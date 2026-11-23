// -----------------------------------------------------------
//  [*] Sources — the acts the assistant reads
//
//  The legal corpus for a visitor who cannot open its page
//  in the console: how the texts are kept (split down to the
//  point, refreshed weekly, each provision linked to its
//  official text) and which acts are there, by where they
//  come from — the EU's, Lithuania's laws, the supervisors'
//  own — then the licensing pages and the standards in a
//  paragraph each. The list is acts.js, and says as of when.
//  Its head shows the mark's pieces standing like volumes on
//  a shelf, and the lists arrive group by group as they are
//  scrolled to.
//
//  Split into (root component last):
//
//    Kept    — how the texts are kept
//    ActList — one group of acts
//    Corpus  — what is in the corpus
//    Sources — the page (default export)
// -----------------------------------------------------------

import { useLocale, useTranslations } from '@/i18n';
import Closing from '@/site/Closing';
import { EU_ACTS, LT_LAWS, SUPERVISOR_ACTS } from '@/site/acts';
import { Band, PageHead, Part, Reveal, Title } from '@/site/parts';







// -----------------------------------------------------------
// Kept
// -----------------------------------------------------------
//
// Three facts about how the texts are kept, side by side
// under an ink rule.
//
// Used by:
//   - Sources (below)
// -----------------------------------------------------------

function Kept() {

  const t = useTranslations('SITE.sources.kept');


  return (
    <Band ground="paper" labelledBy="kept-title" reveal>
      <Part><Title id="kept-title">{t('title')}</Title></Part>
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {['structure', 'weekly', 'linked'].map((fact, index) => (
          <Part key={fact} turn={1 + index * 1.5} className="border-t-2 border-primary pt-5">
            <h3 className="m-0 font-serif text-[1.3125rem] font-semibold">{t(`${fact}.name`)}</h3>
            <p className="m-0 mt-2 leading-[1.6] text-muted">{t(`${fact}.text`)}</p>
          </Part>
        ))}
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// ActList
// -----------------------------------------------------------
//
// One group of acts: its name with how many acts it holds,
// where its texts come from, and the acts as a list of
// definitions — the short name the console calls an act by,
// then its name in the visitor's language. Each group is
// revealed on its own, as the visitor reaches it, its acts
// arriving one after another. Two columns from a laptop's width up, read down
// the left one first.
//
// Used by:
//   - Corpus (below)
// -----------------------------------------------------------

function ActList({ name, source, acts }) {

  const locale = useLocale();


  return (
    <Reveal as="section" className="mt-12">
      <Part as="h3" className="m-0 flex items-baseline gap-3 font-serif text-[1.5rem] font-semibold">
        {name}
        <span className="font-sans text-[0.9375rem] font-semibold text-muted">{acts.length}</span>
      </Part>
      <Part as="p" turn={1} className="m-0 mt-1.5 text-muted">{source}</Part>
      <dl className="m-0 mt-5 gap-x-12 lg:columns-2">
        {acts.map((act, index) => (
          <Part key={act.short} turn={2 + index * 0.45} className="grid break-inside-avoid grid-cols-[7.5rem_1fr] gap-x-4 border-t border-[#C3CBD6] py-2.5">
            <dt className="font-semibold">{act.short}</dt>
            <dd className="m-0 font-serif leading-[1.45]">{act[locale] ?? act.lt}</dd>
          </Part>
        ))}
      </dl>
    </Reveal>
  );
}







// -----------------------------------------------------------
// Corpus
// -----------------------------------------------------------
//
// What is in the corpus, on the desk's grey-blue: the three
// groups of acts, the licensing pages and the standards as a
// paragraph each, and the date the list is true for. The
// band is long, so it does not reveal as one: each of its
// groups does (parts.jsx — Reveal).
//
// Used by:
//   - Sources (below)
// -----------------------------------------------------------

function Corpus() {

  const t = useTranslations('SITE.sources.list');


  return (
    <Band ground="desk" labelledBy="corpus-title">
      <Reveal><Part><Title id="corpus-title">{t('title')}</Title></Part></Reveal>
      <ActList name={t('eu.name')} source={t('eu.source')} acts={EU_ACTS} />
      <ActList name={t('lt.name')} source={t('lt.source')} acts={LT_LAWS} />
      <ActList name={t('supervisors.name')} source={t('supervisors.source')} acts={SUPERVISOR_ACTS} />
      <Reveal className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">
        {['licensing', 'standards'].map((part, index) => (
          <Part key={part} turn={index * 2}>
            <h3 className="m-0 font-serif text-[1.5rem] font-semibold">{t(`${part}.name`)}</h3>
            <p className="m-0 mt-2 leading-[1.6] text-muted">{t(`${part}.text`)}</p>
          </Part>
        ))}
      </Reveal>
      <Reveal><Part as="p" className="m-0 mt-12 max-w-[46rem] border-l-2 border-primary pl-5 leading-[1.6] text-muted">{t('asOf')}</Part></Reveal>
    </Band>
  );
}







// -----------------------------------------------------------
// Sources (default export)
// -----------------------------------------------------------
//
// The head, how the texts are kept, and the list.
//
// Used by:
//   - site/router.jsx — route /sources
// -----------------------------------------------------------

export default function Sources() {

  const t = useTranslations('SITE.sources');


  return (
    <>
      <PageHead id="sources-head" title={t('head.title')} arrangement="shelf">{t('head.lede')}</PageHead>
      <Kept />
      <Corpus />
      <Closing reveal />
    </>
  );
}
