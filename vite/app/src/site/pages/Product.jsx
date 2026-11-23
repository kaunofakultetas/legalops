// -----------------------------------------------------------
//  [*] Product — the way from a conversation to a report
//
//  The product in the order a user meets it: the
//  conversation, the analysis, a finding, the action plan,
//  the check of the documents' own references, and what is
//  done with a finished report. Each step is a band with the
//  words on one side and that screen of the console, drawn,
//  on the other (specimens.jsx); the sides and the grounds
//  alternate down the page. The page is alive the way the
//  first one is: its head shows the mark's pieces as steps,
//  every band arrives as it is reached, the conversation is
//  played, the analysis runs through its stages and the
//  marker is drawn across the finding's evidence.
//
//  Split into (root component last):
//
//    Step    — one step: words and its specimen
//    Finish  — review, approval and the exports
//    Product — the page (default export)
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import Closing from '@/site/Closing';
import { Band, Lede, PageHead, Part, Title } from '@/site/parts';
import { ChatSpecimen, CitationsSpecimen, FindingSpecimen, PlanSpecimen, ProgressSpecimen } from '@/site/specimens';







// -----------------------------------------------------------
// Step
// -----------------------------------------------------------
//
// One step of the way: its heading, what happens in it, and
// three short facts under a hairline each; beside them the
// specimen. `flip` puts the specimen on the left from a
// laptop's width up — on a narrow screen the words always
// come first. `name` is the step's key in the page's
// messages and the stem of its heading's id. As the visitor
// reaches the step its words rise in turn and the specimen
// comes in from its own side.
//
// Used by:
//   - Product (below)
// -----------------------------------------------------------

function Step({ name, ground, flip = false, children }) {

  const t = useTranslations('SITE.product');


  return (
    <Band ground={ground} labelledBy={`${name}-title`} reveal className="overflow-hidden py-16 sm:py-20 lg:py-24">
      <div className="grid items-center gap-x-14 gap-y-10 lg:grid-cols-12">
        <div className={`min-w-0 lg:col-span-6 ${flip ? 'lg:order-2' : ''}`}>
          <Part><Title id={`${name}-title`}>{t(`${name}.title`)}</Title></Part>
          <Part turn={1}><Lede className="mt-5">{t(`${name}.text`)}</Lede></Part>
          <ul className="m-0 mt-7 max-w-[40rem] list-none p-0">
            {['a', 'b', 'c'].map((point, index) => (
              <Part as="li" key={point} turn={2 + index} className={`border-t py-3 leading-[1.5] ${ground === 'desk' ? 'border-[#C3CBD6]' : 'border-edge'}`}>
                {t(`${name}.points.${point}`)}
              </Part>
            ))}
          </ul>
        </div>
        <Part move={flip ? 'left' : 'right'} turn={1} className={`min-w-0 lg:col-span-6 ${flip ? 'lg:pr-8' : 'lg:pl-8'}`}>{children}</Part>
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Finish
// -----------------------------------------------------------
//
// What happens to a finished report, on ink: a person has
// the last word on every finding and approves the report,
// and it leaves the console as a PDF for the board or an
// Excel workbook.
//
// Used by:
//   - Product (below)
// -----------------------------------------------------------

function Finish() {

  const t = useTranslations('SITE.product.finish');


  return (
    <Band ground="ink" labelledBy="finish-title" reveal>
      <Part><Title id="finish-title">{t('title')}</Title></Part>
      <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
        {['review', 'export'].map((part, index) => (
          <Part key={part} turn={1 + index * 2} className="border-t border-white/30 pt-5">
            <h3 className="m-0 font-serif text-[1.3125rem] font-semibold">{t(`${part}.title`)}</h3>
            <p className="m-0 mt-2 max-w-[34rem] leading-[1.6] text-white/75">{t(`${part}.text`)}</p>
          </Part>
        ))}
      </div>
    </Band>
  );
}







// -----------------------------------------------------------
// Product (default export)
// -----------------------------------------------------------
//
// The head, the five steps and what is done with the report,
// closed by the invitation to sign in.
//
// Used by:
//   - site/router.jsx — route /product
// -----------------------------------------------------------

export default function Product() {

  const t = useTranslations('SITE.product');


  return (
    <>
      <PageHead id="product-head" title={t('head.title')} arrangement="steps">{t('head.lede')}</PageHead>
      <Step name="chat" ground="paper"><ChatSpecimen label={t('chat.specimen')} /></Step>
      <Step name="analysis" ground="desk" flip><ProgressSpecimen label={t('analysis.specimen')} live /></Step>
      <Step name="finding" ground="paper"><FindingSpecimen label={t('finding.specimen')} draw /></Step>
      <Step name="plan" ground="desk" flip><PlanSpecimen label={t('plan.specimen')} /></Step>
      <Step name="citations" ground="paper"><CitationsSpecimen label={t('citations.specimen')} /></Step>
      <Finish />
      <Closing reveal />
    </>
  );
}
