// -----------------------------------------------------------
//  [*] Method — how the assistant reaches a finding
//
//  The page a careful reader looks for before trusting a
//  report: the six steps of an analysis in their order, what
//  a report does with an act depending on how it applies,
//  what each of the five statuses means (in the words of the
//  user guide, docs/markdown/lt/user-guide.md §4 — change them together),
//  what stays with a person, and what the assistant does not
//  do. Its head shows the mark's pieces taken apart into
//  layers, and every band arrives as it is reached: the steps
//  in their order with their numbers, the statuses tag by
//  tag.
//
//  Split into (root component last):
//
//    STEPS    — the steps of an analysis, in order
//    STATUSES — the statuses and the tone of their tags
//    Steps    — the six steps
//    Acts     — what a report does with an act
//    Statuses — the five statuses
//    People   — review, approval, provenance
//    Method   — the page (default export)
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import Closing from '@/site/Closing';
import Limits from '@/site/Limits';
import { Band, Lede, PageHead, Part, StatusTag, Title } from '@/site/parts';
import { ActsSpecimen } from '@/site/specimens';


// The steps of an analysis as the pipeline runs them
const STEPS = ['documents', 'citations', 'applicability', 'obligations', 'gaps', 'plan'];

// The five statuses in a report's order, each with the tone
// its tag wears there (none: the neutral tag)
const STATUSES = [['met', 'success'], ['partial', 'warning'], ['missing', 'error'], ['unknown', undefined], ['not_applicable', undefined]];







// -----------------------------------------------------------
// Steps
// -----------------------------------------------------------
//
// The six steps as a numbered list — they are a sequence, so
// here the numbers say something: each step works on what
// the one before it produced. Two columns from a tablet's
// width up, read down the left one first.
//
// Used by:
//   - Method (below)
// -----------------------------------------------------------

function Steps() {

  const t = useTranslations('SITE.method.steps');


  return (
    <Band ground="paper" labelledBy="steps-title" reveal>
      <Part><Title id="steps-title">{t('title')}</Title></Part>
      <ol className="m-0 mt-10 grid list-none gap-x-12 p-0 md:grid-flow-col md:grid-cols-2 md:grid-rows-[repeat(3,auto)]">
        {STEPS.map((step, index) => (
          <Part as="li" key={step} turn={1 + index * 2} className="flex gap-5 border-t border-edge py-6">
            <span data-rv="pop" style={{ '--i': 3 + index * 2 }} className="font-serif text-[2rem] font-semibold leading-none text-primary-light" aria-hidden>{index + 1}</span>
            <div>
              <h3 className="m-0 font-serif text-[1.3125rem] font-semibold leading-[1.25]">{t(`${step}.name`)}</h3>
              <p className="m-0 mt-2 leading-[1.6] text-muted">{t(`${step}.text`)}</p>
            </div>
          </Part>
        ))}
      </ol>
    </Band>
  );
}







// -----------------------------------------------------------
// Acts
// -----------------------------------------------------------
//
// The four things a report does with an act, on the desk's
// grey-blue, beside three acts sorted the way a report sorts
// them.
//
// Used by:
//   - Method (below)
// -----------------------------------------------------------

function Acts() {

  const t = useTranslations('SITE.method.acts');


  return (
    <Band ground="desk" labelledBy="acts-title" reveal className="overflow-hidden py-16 sm:py-20 lg:py-24">
      <div className="grid items-start gap-x-14 gap-y-10 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <Part><Title id="acts-title">{t('title')}</Title></Part>
          <Part turn={1}><Lede className="mt-5">{t('lede')}</Lede></Part>
          <ul className="m-0 mt-7 max-w-[40rem] list-none p-0">
            {['applies', 'later', 'unknown', 'indirect'].map((kind, index) => (
              <Part as="li" key={kind} turn={2 + index} className="border-t border-[#C3CBD6] py-3 leading-[1.55]">{t(kind)}</Part>
            ))}
          </ul>
        </div>
        <Part move="right" turn={1} className="min-w-0 lg:col-span-5 lg:pt-3">
          <ActsSpecimen label={t('specimen')} />
        </Part>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Statuses
// -----------------------------------------------------------
//
// The five statuses as a list of definitions: the tag as a
// report draws it, then what it means. Under them, what the
// severity is — the other word on every finding, and not the
// same thing.
//
// Used by:
//   - Method (below)
// -----------------------------------------------------------

function Statuses() {

  const t = useTranslations('SITE.method.statuses');
  const tEnum = useTranslations('ENUMS.findingStatus');


  return (
    <Band ground="paper" labelledBy="statuses-title" reveal>
      <Part><Title id="statuses-title">{t('title')}</Title></Part>
      <dl className="m-0 mt-10 max-w-[52rem]">
        {STATUSES.map(([status, tone], index) => (
          <Part key={status} turn={1 + index * 1.5} className="grid gap-x-8 gap-y-2 border-t border-edge py-4 sm:grid-cols-[9.5rem_1fr]">
            <dt className="pt-0.5"><span data-rv="pop" style={{ '--i': 3 + index * 1.5 }} className="inline-flex origin-left"><StatusTag tone={tone}>{tEnum(status)}</StatusTag></span></dt>
            <dd className="m-0 leading-[1.6]">{t(status)}</dd>
          </Part>
        ))}
      </dl>
      <Part as="p" turn={10} className="m-0 mt-8 max-w-[52rem] border-l-2 border-primary pl-5 leading-[1.6] text-muted">{t('severity')}</Part>
    </Band>
  );
}







// -----------------------------------------------------------
// People
// -----------------------------------------------------------
//
// What stays with a person, on ink: the review of a finding,
// the approval of the report, and the record of what the
// report was made with.
//
// Used by:
//   - Method (below)
// -----------------------------------------------------------

function People() {

  const t = useTranslations('SITE.method.people');


  return (
    <Band ground="ink" labelledBy="people-title" reveal>
      <Part><Title id="people-title">{t('title')}</Title></Part>
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {['review', 'approval', 'provenance'].map((part, index) => (
          <Part key={part} turn={1 + index * 1.5} className="border-t border-white/30 pt-5">
            <h3 className="m-0 font-serif text-[1.3125rem] font-semibold">{t(`${part}.name`)}</h3>
            <p className="m-0 mt-2 leading-[1.6] text-white/75">{t(`${part}.text`)}</p>
          </Part>
        ))}
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Method (default export)
// -----------------------------------------------------------
//
// The head and the five bands; the closing band leaves its
// link to this very page out.
//
// Used by:
//   - site/router.jsx — route /method
// -----------------------------------------------------------

export default function Method() {

  const t = useTranslations('SITE.method');


  return (
    <>
      <PageHead id="method-head" title={t('head.title')} arrangement="layers">{t('head.lede')}</PageHead>
      <Steps />
      <Acts />
      <Statuses />
      <People />
      <Limits reveal />
      <Closing method={false} reveal />
    </>
  );
}
