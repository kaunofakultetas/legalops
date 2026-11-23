// -----------------------------------------------------------
//  [*] Home — the public site's first page
//
//  What the product is, for someone who has never seen it,
//  told in the order a compliance officer would ask: what is
//  it (the hero — the brand's mark as an object in three
//  dimensions, its yellow piece now and then missing), what
//  does a gap look like (a finding with the passage of the
//  company's document that decides it, marked), what does it
//  do, what do I get (the report), how do I talk to it (the
//  conversation), where does its law come from, and what must
//  I not expect of it (Limits.jsx). Under the hero every band
//  shows a piece of the product (specimens.jsx) rather than a
//  picture about it.
//
//  The page moves as it is read. The hero's words arrive as
//  it opens; every band below holds its parts back until the
//  visitor reaches it and then lets them take their places in
//  a way of its own — the finding is framed by the mark's
//  tiles coming out from behind it, the report tilts up from
//  the page, the conversation slides in and is spoken turn by
//  turn, the acts' names cascade (parts.jsx — Band's reveal
//  and Part; the movements are globals.css's). Under reduced
//  motion everything simply stands in its place.
//
//  Split into (root component last):
//
//    Hero    — the claim and the mark as an object, on ink
//    Proof   — one finding, up close
//    Does    — the three things the assistant does
//    Report  — the report, with its first page
//    Chat    — the conversation
//    Sources — where the texts come from, on ink
//    Home    — the page (default export)
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import Closing from '@/site/Closing';
import Limits from '@/site/Limits';
import Sculpture from '@/site/Sculpture';
import { HEADLINE_ACTS } from '@/site/acts';
import { Band, ConsoleLink, Lede, Part, TextLink, Title, Wrap } from '@/site/parts';
import {
  ActsSpecimen, ChatSpecimen, FindingSpecimen, MarkFrame, PlanSpecimen, ReportSpecimen, StatusesSpecimen,
} from '@/site/specimens';







// -----------------------------------------------------------
// Hero
// -----------------------------------------------------------
//
// The first screen, on the brand's ink: the mark as an object
// in three dimensions (Sculpture.jsx) stands in the right of
// it, lit from behind by a glow of the mark's blue; on the
// left the page's one h1, what the product does in a
// sentence, the way in, and one hard fact under a hairline —
// arriving one after another as the page opens, while the
// object comes together. On a narrow screen the words come
// first and the object stands under them.
//
// Used by:
//   - Home (below)
// -----------------------------------------------------------

function Hero() {

  const t = useTranslations('SITE.home.hero');


  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-linear-to-br from-primary-dark via-primary to-primary text-white">
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[26rem] bg-[radial-gradient(52%_48%_at_50%_50%,rgba(62,111,176,0.55),transparent_70%)] lg:inset-y-0 lg:left-auto lg:h-auto lg:w-[58%]" />
      <Sculpture className="absolute inset-x-0 bottom-0 h-[22rem] sm:h-[26rem] lg:inset-y-0 lg:left-auto lg:h-auto lg:w-[58%]" />
      <Wrap className="relative grid items-center pb-[22rem] pt-14 sm:pb-[26rem] sm:pt-20 lg:min-h-[calc(100dvh-3.75rem)] lg:grid-cols-12 lg:py-16">
        <div className="min-w-0 lg:col-span-6">
          <h1 id="hero-title" className="hero-rise m-0 font-serif text-[2.5rem] font-semibold leading-[1.06] tracking-[-0.015em] text-balance sm:text-[3.5rem] xl:text-[4rem]">
            {t('title')}
          </h1>
          <div className="hero-rise" style={{ '--i': 1 }}><Lede onInk className="mt-6 lg:max-w-[33rem]">{t('lede')}</Lede></div>
          <div className="hero-rise mt-8 flex flex-wrap items-center gap-x-6 gap-y-4" style={{ '--i': 2 }}>
            <ConsoleLink />
            <TextLink to="/method" onInk>{t('method')}</TextLink>
          </div>
          <p className="hero-rise m-0 mt-10 max-w-[33rem] border-t border-white/20 pt-5 text-[0.9375rem] leading-[1.55] text-white/75" style={{ '--i': 3 }}>{t('fact')}</p>
        </div>
      </Wrap>
    </section>
  );
}







// -----------------------------------------------------------
// Proof
// -----------------------------------------------------------
//
// One gap, up close, right under the hero: a finding with the
// passage of the company's document that decides it, framed
// by the four tiles of the mark. On reveal the sheet rises,
// the tiles come out from behind it to its corners, and the
// marker is drawn across the passage. Beside it, in two
// sentences, what a finding is.
//
// Used by:
//   - Home (below)
// -----------------------------------------------------------

function Proof() {

  const t = useTranslations('SITE.home.proof');


  return (
    <Band ground="paper" labelledBy="proof-title" reveal className="overflow-hidden py-16 sm:py-24">
      <div className="grid items-center gap-x-14 gap-y-12 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <Part><Title id="proof-title">{t('title')}</Title></Part>
          <Part turn={1}><Lede className="mt-5">{t('lede')}</Lede></Part>
        </div>
        <div className="min-w-0 px-1 sm:px-8 lg:col-span-7 lg:px-10">
          <MarkFrame turn={4}>
            <Part turn={2}><FindingSpecimen label={t('specimen')} draw /></Part>
          </MarkFrame>
        </div>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Does
// -----------------------------------------------------------
//
// The three things the assistant does, side by side under an
// ink rule — each shown first (the acts sorted, the bar of
// the statuses, actions of the plan), then named and told in
// two sentences. They are a sequence only loosely, so they
// carry no numbers. On reveal the columns rise one after
// another, and inside them the rows arrive and the bar grows.
//
// Used by:
//   - Home (below)
// -----------------------------------------------------------

function Does() {

  const t = useTranslations('SITE.home.does');
  const columns = [
    { key: 'applies', specimen: <ActsSpecimen label={t('applies.title')} /> },
    { key: 'compares', specimen: <StatusesSpecimen label={t('compares.title')} /> },
    { key: 'plans', specimen: <PlanSpecimen label={t('plans.title')} rows={['custody', 'cdd']} /> },
  ];


  return (
    <Band ground="desk" labelledBy="does-title" reveal>
      <Part><Title id="does-title">{t('title')}</Title></Part>
      <div className="mt-10 grid gap-x-10 gap-y-12 md:grid-cols-3">
        {columns.map((column, index) => (
          <Part key={column.key} turn={1 + index * 2} className="border-t-2 border-primary pt-6">
            <div className="flex items-start md:min-h-[10.25rem]">
              <div className="w-full">{column.specimen}</div>
            </div>
            <h3 className="m-0 mt-6 font-serif text-[1.3125rem] font-semibold leading-[1.25] text-balance">{t(`${column.key}.title`)}</h3>
            <p className="m-0 mt-2.5 leading-[1.6] text-muted">{t(`${column.key}.text`)}</p>
          </Part>
        ))}
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Report
// -----------------------------------------------------------
//
// The report: what a finding holds and what can be done with
// it on the left, a report's first page on the right. On
// reveal the page tilts up from the surface it lay on, and
// its figures, its bar and its gaps fill in.
//
// Used by:
//   - Home (below)
// -----------------------------------------------------------

function Report() {

  const t = useTranslations('SITE.home.report');


  return (
    <Band ground="paper" labelledBy="report-title" reveal className="overflow-hidden py-16 sm:py-20 lg:py-24">
      <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <Part><Title id="report-title">{t('title')}</Title></Part>
          <Part turn={1}><Lede className="mt-5">{t('lede')}</Lede></Part>
          <Part as="p" turn={2} className="m-0 mt-6"><TextLink to="/product">{t('link')}</TextLink></Part>
        </div>
        <Part move="tilt" turn={2} className="min-w-0 lg:col-span-7">
          <ReportSpecimen label={t('specimen')} />
        </Part>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Chat
// -----------------------------------------------------------
//
// The conversation: a turn of it on the left (after the
// words on a narrow screen), and on the right what makes its
// answers checkable, with three short facts under a
// hairline each. On reveal the conversation slides in and is
// spoken — the question, then the answer.
//
// Used by:
//   - Home (below)
// -----------------------------------------------------------

function Chat() {

  const t = useTranslations('SITE.home.chat');


  return (
    <Band ground="desk" labelledBy="chat-title" reveal className="overflow-hidden py-16 sm:py-20 lg:py-24">
      <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="min-w-0 lg:order-2 lg:col-span-6">
          <Part turn={1}><Title id="chat-title">{t('title')}</Title></Part>
          <Part turn={2}><Lede className="mt-5">{t('lede')}</Lede></Part>
          <ul className="m-0 mt-7 max-w-[40rem] list-none p-0">
            {['language', 'documents', 'reports'].map((point, index) => (
              <Part as="li" key={point} turn={3 + index} className="border-t border-[#C3CBD6] py-3 leading-[1.5]">{t(`points.${point}`)}</Part>
            ))}
          </ul>
        </div>
        <Part move="left" className="min-w-0 lg:col-span-6 lg:pr-6">
          <ChatSpecimen label={t('specimen')} />
        </Part>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Sources
// -----------------------------------------------------------
//
// Where the law comes from, on ink: the three official
// sources, each with what is taken from it, then the short
// names of the acts asked about first and the way to the
// whole list. On reveal the sources rise in turn and the
// names cascade after them.
//
// Used by:
//   - Home (below)
// -----------------------------------------------------------

function Sources() {

  const t = useTranslations('SITE.home.sources');


  return (
    <Band ground="ink" labelledBy="sources-title" reveal>
      <Part><Title id="sources-title">{t('title')}</Title></Part>
      <Part turn={1}><Lede onInk className="mt-5">{t('lede')}</Lede></Part>
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {['cellar', 'etar', 'lb'].map((source, index) => (
          <Part key={source} turn={2 + index} className="border-t border-white/30 pt-5">
            <h3 className="m-0 font-serif text-[1.3125rem] font-semibold">{t(`${source}.name`)}</h3>
            <p className="m-0 mt-2 leading-[1.6] text-white/75">{t(`${source}.text`)}</p>
          </Part>
        ))}
      </div>
      <ul className="m-0 mt-12 flex list-none flex-wrap gap-2 p-0">
        {HEADLINE_ACTS.map((act, index) => (
          <Part as="li" key={act} move="pop" turn={5 + index * 0.5} className="rounded-[3px] border border-white/25 px-2.5 py-1 text-[0.9375rem] font-semibold text-white/90">{act}</Part>
        ))}
      </ul>
      <Part as="p" turn={14} className="m-0 mt-7"><TextLink to="/sources" onInk>{t('link')}</TextLink></Part>
    </Band>
  );
}







// -----------------------------------------------------------
// Home (default export)
// -----------------------------------------------------------
//
// The bands in their order, closed by the invitation to sign
// in — every one of them revealed as the visitor reaches it.
//
// Used by:
//   - site/router.jsx — the index route
// -----------------------------------------------------------

export default function Home() {
  return (
    <>
      <Hero />
      <Proof />
      <Does />
      <Report />
      <Chat />
      <Sources />
      <Limits reveal />
      <Closing reveal />
    </>
  );
}
