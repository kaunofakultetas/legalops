// -----------------------------------------------------------
//  [*] Specimens — the product shown on the public site
//
//  A visitor without an account cannot open the console, so
//  the site shows it: small pieces of its screens rebuilt as
//  plain HTML in the console's own look — a finding with its
//  evidence, the acts a report sorts, the status bar, the
//  action plan, a report's first page, a conversation, the
//  reference check and an analysis at work. Some of their
//  parts are marked to arrive in turn ([data-rv] — rows
//  rising, the bar growing, the question before its answer):
//  that only happens inside a band that reveals, on the first
//  page; anywhere else they simply stand. They are drawn,
//  not screenshotted: the text is real text in the visitor's
//  language, sharp at any size, and nothing of a real
//  company is ever on show.
//
//  What they say is made up for one imaginary company and
//  kept true to the law it quotes: the duty is MiCA's own
//  Article 70(1), the answer in the conversation is what
//  DORA's Article 19(1) says, and the two wrong references
//  are of the kind the reference check finds. The labels —
//  the statuses, the timeframes, a report's tabs — are the
//  console's own messages, so the site cannot call a status
//  by another name than the product does.
//
//  Split into (the largest last):
//
//    STATUS_COLORS     — a status's colour in the bar
//    STATUS_TONES      — a status's tone as a tag
//    PROGRESS          — the sample analysis
//    COUNTS            — the sample report's counts
//    Label             — the small heading inside a specimen
//    Check             — the tick of a finished step
//    MarkFrame         — the mark's four tiles round a sheet
//    FindingSpecimen   — a finding with its evidence
//    ActsSpecimen      — three acts and what a report does
//    StatusBar         — the duties as one bar, by status
//    StatusesSpecimen  — the bar of the five statuses
//    PlanSpecimen      — actions of the plan
//    CitationsSpecimen — the reference check
//    ProgressSpecimen  — an analysis at work
//    ChatSpecimen      — a question and its cited answer
//    ReportSpecimen    — a report's first page
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { COLORS } from '@/brand';
import { useLocale, useTranslations } from '@/i18n';
import { GRID, STATUS } from '@/components/charts/chartTokens';
import { Mark } from '@/components/layout/Wordmark';
import { Sheet, StatusTag } from '@/site/parts';
import useSeen from '@/site/useSeen';


// The colour of each status in the bar — the console's own
// status colours (chartTokens.js), "not applicable" drawn in
// the pale grey of something set aside
const STATUS_COLORS = {
  met: STATUS.good,
  partial: STATUS.warning,
  missing: STATUS.critical,
  unknown: STATUS.neutral,
  not_applicable: GRID.baseline,
};

// The tone of each status's tag, as the console's reports
// tint them
const STATUS_TONES = { met: 'success', partial: 'warning', missing: 'error' };

// The sample analysis: its stages in order, what it has
// spent when each is done (USD), the estimate agreed to, and
// how many stages are done in the still picture
const PROGRESS = {
  stages: ['documents', 'citations', 'applicability', 'obligations', 'gaps', 'plan'],
  spent: [0.02, 0.26, 0.52, 0.52, 4.33, 5.02],
  estimate: 5.8,
  rest: 4,
};

// The sample report in numbers: the duties per status, the
// acts assessed and the actions of its plan
const COUNTS = { met: 148, partial: 163, missing: 41, unknown: 96, not_applicable: 212 };
const ACTS_ASSESSED = 8;
const ACTIONS = 24;







// -----------------------------------------------------------
// Label
// -----------------------------------------------------------
//
// The small heading of a part of a specimen ("Obligation",
// "Evidence") — the console's own quiet label, in sentence
// case.
//
// Used by:
//   - the specimens (below)
// -----------------------------------------------------------

function Label({ children }) {
  return <p className="m-0 mb-1.5 text-xs font-semibold text-muted">{children}</p>;
}







// -----------------------------------------------------------
// Check
// -----------------------------------------------------------
//
// The tick of a finished step, drawn; decoration beside the
// step's own word for its state.
//
// Used by:
//   - ProgressSpecimen (below)
// -----------------------------------------------------------

function Check() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false" className="shrink-0">
      <circle cx="8" cy="8" r="8" fill={STATUS.good} />
      <path d="M4.5 8.2l2.3 2.3 4.7-4.9" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}







// -----------------------------------------------------------
// MarkFrame
// -----------------------------------------------------------
//
// The brand's mark taken apart and laid round a specimen:
// its four tiles stand behind the sheet's four corners, each
// showing its outer edge — a quarter disc top left and the
// yellow one bottom right, the two squares between them, in
// the mark's colours on paper (ink and the middle blue) or,
// with `onDark`, on ink (white and the pale blue). The sheet
// sits where the mark's seams cross: the product in the
// middle of its own sign. In a band that reveals, the tiles
// come out from behind the sheet towards their corners, from
// `turn` on. Decoration only; on a phone the tiles stay
// inside the page's gutter.
//
// Used by:
//   - pages/Home.jsx — the first finding
// -----------------------------------------------------------

export function MarkFrame({ onDark = false, turn = 0, children }) {
  const tile = 'absolute w-28 h-28 sm:w-40 sm:h-40';
  const disc = onDark ? COLORS.paper : COLORS.ink;
  const square = onDark ? COLORS.sky : COLORS.blue;
  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" aria-hidden focusable="false" data-rv="tl" style={{ '--i': turn }} className={`${tile} -top-3 -left-3 sm:-top-10 sm:-left-10`}>
        <path d="M100 100H0A100 100 0 0 1 100 0Z" fill={disc} />
      </svg>
      <svg viewBox="0 0 100 100" aria-hidden focusable="false" data-rv="tr" style={{ '--i': turn + 1 }} className={`${tile} -top-3 -right-3 sm:-top-10 sm:-right-10`}>
        <rect width="100" height="100" rx="17" fill={square} />
      </svg>
      <svg viewBox="0 0 100 100" aria-hidden focusable="false" data-rv="bl" style={{ '--i': turn + 1 }} className={`${tile} -bottom-3 -left-3 sm:-bottom-10 sm:-left-10`}>
        <rect width="100" height="100" rx="17" fill={square} />
      </svg>
      <svg viewBox="0 0 100 100" aria-hidden focusable="false" data-rv="br" style={{ '--i': turn + 2 }} className={`${tile} -bottom-3 -right-3 sm:-bottom-10 sm:-right-10`}>
        <path d="M0 0H100A100 100 0 0 1 0 100Z" fill={COLORS.sun} />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}







// -----------------------------------------------------------
// FindingSpecimen
// -----------------------------------------------------------
//
// One finding as a report shows it: the act and provision
// with the verdict, the duty in the law's words, the passage
// of the company's document that decides it — marked the way
// the console marks evidence — and the assessment. With
// `draw` the passage waits unmarked and the marker is drawn
// across it once, when the passage has come into view: it
// shows the one thing the product is about, to a visitor who
// is looking.
//
// Used by:
//   - pages/Home.jsx — the first finding
//   - pages/Product.jsx — "a finding with its evidence"
// -----------------------------------------------------------

export function FindingSpecimen({ label, draw = false }) {

  const t = useTranslations('SITE.specimens.finding');
  const tEnum = useTranslations('ENUMS');
  const passage = useRef(null);
  const seen = useSeen(passage);
  const stroke = !draw ? '' : (seen ? 'marked-draw' : 'marked-wait');


  return (
    <Sheet label={label}>
      <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3">
        <p className="m-0 text-sm font-semibold">MiCA · {t('ref')}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{tEnum('severity.high')}</span>
          <StatusTag tone="error">{tEnum('findingStatus.missing')}</StatusTag>
        </div>
      </div>
      <div className="px-5 py-4">
        <Label>{t('obligation')}</Label>
        <p className="m-0 font-serif text-[1.0625rem] leading-[1.55]">{t('duty')}</p>
      </div>
      <div className="border-t border-edge bg-canvas/60 px-5 py-4">
        <Label>{t('evidence')} · {t('document')}, {t('place')}</Label>
        <blockquote className="m-0 font-serif text-[1.0625rem] leading-[1.7]">
          {t('before')}
          <mark ref={passage} className={`marked ${stroke}`}>{t('quote')}</mark>
          {t('after')}
        </blockquote>
      </div>
      <div className="border-t border-edge px-5 py-4">
        <Label>{t('assessment')}</Label>
        <p className="m-0 text-sm leading-[1.55]">{t('verdict')}</p>
      </div>
    </Sheet>
  );
}







// -----------------------------------------------------------
// ActsSpecimen
// -----------------------------------------------------------
//
// Three acts and the three things a report does with an act
// that concerns the company: it assesses one that applies,
// assesses as preparation one that applies from a later date
// (the date is the anti-money-laundering regulation's own),
// and leaves one alone until the facts are known.
//
// Used by:
//   - pages/Home.jsx — "works out which acts apply"
// -----------------------------------------------------------

export function ActsSpecimen({ label }) {

  const t = useTranslations('SITE.specimens.acts');
  const tEnum = useTranslations('ENUMS');
  const rows = [
    { act: 'MiCA', tone: 'info', verdict: tEnum('applicability.applies') },
    { act: 'AMLR', tone: undefined, verdict: t('later') },
    { act: 'AI Act', tone: 'warning', verdict: t('confirm') },
  ];


  return (
    <Sheet label={label}>
      <ul className="m-0 list-none divide-y divide-edge p-0">
        {rows.map((row, index) => (
          <li key={row.act} data-rv="rise" style={{ '--i': 3 + index }} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-sm font-semibold">{row.act}</span>
            <StatusTag tone={row.tone}>{row.verdict}</StatusTag>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}







// -----------------------------------------------------------
// StatusBar
// -----------------------------------------------------------
//
// The sample report's duties as one bar cut by status, with
// the legend that names every colour and gives its count —
// the console's own summary chart, redrawn. A screen reader
// is given the legend; the bar is its picture.
//
// Used by:
//   - StatusesSpecimen, ReportSpecimen (below)
// -----------------------------------------------------------

function StatusBar() {

  const tEnum = useTranslations('ENUMS.findingStatus');
  const total = Object.values(COUNTS).reduce((sum, count) => sum + count, 0);


  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 gap-[2px]" aria-hidden>
        {Object.entries(COUNTS).map(([status, count], index, all) => (
          <span
            key={status} data-rv="grow"
            className={`h-full ${index === 0 ? 'rounded-l-sm' : ''} ${index === all.length - 1 ? 'rounded-r-sm' : ''}`}
            style={{ width: `${(count / total) * 100}%`, background: STATUS_COLORS[status], '--i': 5 + index * 1.5 }}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
        {Object.entries(COUNTS).map(([status, count]) => (
          <li key={status} className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLORS[status] }} aria-hidden />
            <span className="text-muted">{tEnum(status)}</span>
            <span className="font-semibold">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}







// -----------------------------------------------------------
// StatusesSpecimen
// -----------------------------------------------------------
//
// The five statuses a duty can end in, as the bar a report
// opens with, under the number of duties it assessed.
//
// Used by:
//   - pages/Home.jsx — "checks every duty"
// -----------------------------------------------------------

export function StatusesSpecimen({ label }) {

  const t = useTranslations('SITE.specimens.statuses');
  const total = Object.values(COUNTS).reduce((sum, count) => sum + count, 0);


  return (
    <Sheet label={label} className="px-4 py-3.5">
      <p className="m-0 mb-3 text-sm font-semibold">{t('total', { count: total })}</p>
      <StatusBar />
    </Sheet>
  );
}







// -----------------------------------------------------------
// PlanSpecimen
// -----------------------------------------------------------
//
// Actions of the plan as its tab lists them: the place in
// the plan, the work, then who owns it, by when and how many
// findings it closes. `rows` picks which of the three sample
// actions are shown, in that order — one on the home page,
// all three on the product page.
//
// Used by:
//   - pages/Home.jsx — "draws up the action plan"
//   - pages/Product.jsx — the plan
// -----------------------------------------------------------

export function PlanSpecimen({ label, rows = ['custody', 'cdd', 'refs'] }) {

  const t = useTranslations('SITE.specimens.plan');
  const tEnum = useTranslations('ENUMS.timeframe');
  const actions = {
    custody: { timeframe: '30_days', closes: 8 },
    cdd: { timeframe: 'immediate', closes: 34 },
    refs: { timeframe: '30_days', closes: 0 },
  };


  return (
    <Sheet label={label}>
      <ol className="m-0 list-none divide-y divide-edge p-0">
        {rows.map((key, index) => (
          <li key={key} data-rv="rise" style={{ '--i': 5 + index * 1.5 }} className="flex gap-3 px-4 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-muted" aria-hidden>
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold leading-snug">{t(`${key}.title`)}</p>
              <p className="m-0 mt-1 text-xs text-muted">
                {[t(`${key}.owner`), tEnum(actions[key].timeframe), actions[key].closes ? t('closes', { count: actions[key].closes }) : null]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}







// -----------------------------------------------------------
// CitationsSpecimen
// -----------------------------------------------------------
//
// The reference check: three references a company's
// documents make to the law, what each is cited for, and the
// verdict — one correct, one to a provision that does not
// exist, one to a provision about something else (with what
// it is really about).
//
// Used by:
//   - pages/Product.jsx — the reference check
// -----------------------------------------------------------

export function CitationsSpecimen({ label }) {

  const t = useTranslations('SITE.specimens.citations');
  const tEnum = useTranslations('ENUMS.citationVerdict');
  const rows = [
    { key: 'custody', verdict: 'match', tone: 'success' },
    { key: 'transfer', verdict: 'not_found', tone: 'error' },
    { key: 'vendors', verdict: 'mismatch', tone: 'error', note: true },
  ];


  return (
    <Sheet label={label}>
      <p className="m-0 border-b border-edge px-4 py-2.5 text-sm font-semibold">{t('title')}</p>
      <ul className="m-0 list-none divide-y divide-edge p-0">
        {rows.map((row, index) => (
          <li key={row.key} data-rv="rise" style={{ '--i': 4 + index * 2.5 }} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 font-serif text-[0.9375rem] font-semibold">{t(`${row.key}.ref`)}</p>
                <p className="m-0 mt-0.5 text-xs text-muted">{t(`${row.key}.claim`)}</p>
              </div>
              <StatusTag tone={row.tone}>{tEnum(row.verdict)}</StatusTag>
            </div>
            {row.note && <p className="m-0 mt-2 text-xs leading-[1.5]">{t(`${row.key}.note`)}</p>}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}







// -----------------------------------------------------------
// ProgressSpecimen
// -----------------------------------------------------------
//
// An analysis at work, as the report page shows it while it
// runs: the stages in their order, each with its state in a
// word, and the cost so far beside the estimate the user
// agreed to. The dot of a stage only repeats its word.
//
// At rest it is a still: four stages done, the fifth
// running. With `live` it runs once it has come into view —
// a stage finishes every second or so and the cost climbs
// with it (in the proportions of a real run: the gap
// assessment is most of the bill), it stands finished for a
// moment and starts over. Under reduced motion it stays the
// still.
//
// Used by:
//   - pages/Product.jsx — the analysis
// -----------------------------------------------------------

export function ProgressSpecimen({ label, live = false }) {

  const t = useTranslations('SITE.specimens.progress');
  const locale = useLocale();
  const sheet = useRef(null);
  const seen = useSeen(sheet, { share: 0.5, off: !live });
  // How many stages are done; past the last, the finished
  // picture is held for two more ticks
  const [done, setDone] = useState(PROGRESS.rest);


  useEffect(() => {
    if (!live || !seen || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)) return undefined;
    const timer = setInterval(() => setDone((count) => (count >= PROGRESS.stages.length + 2 ? 0 : count + 1)), 1150);
    return () => clearInterval(timer);
  }, [live, seen]);


  const money = (amount) => `${new Intl.NumberFormat(locale === 'lt' ? 'lt-LT' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} USD`;
  const finished = Math.min(done, PROGRESS.stages.length);
  const dots = {
    done: <Check />,
    running: <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-light border-t-transparent motion-reduce:animate-none" aria-hidden />,
    waiting: <span className="h-4 w-4 shrink-0 rounded-full border-2 border-edge bg-surface" aria-hidden />,
  };


  return (
    <div ref={sheet}>
      <Sheet label={label}>
        <p className="m-0 border-b border-edge px-4 py-2.5 text-sm font-semibold">{t('title')}</p>
        <ol className="m-0 list-none p-0 px-4 py-2">
          {PROGRESS.stages.map((stage, index) => {
            const state = index < finished ? 'done' : (index === finished ? 'running' : 'waiting');
            return (
              <li key={stage} className="flex items-center gap-3 py-1.5 text-sm">
                {dots[state]}
                <span className={state === 'waiting' ? 'text-muted' : ''}>{t(stage)}</span>
                <span className="ml-auto text-xs text-muted">{t(state)}</span>
              </li>
            );
          })}
        </ol>
        <p className="m-0 border-t border-edge bg-canvas/60 px-4 py-2.5 text-xs tabular-nums text-muted">
          {t('cost', { spent: money(finished === 0 ? 0 : PROGRESS.spent[finished - 1]), estimate: money(PROGRESS.estimate) })}
        </p>
      </Sheet>
    </div>
  );
}







// -----------------------------------------------------------
// ChatSpecimen
// -----------------------------------------------------------
//
// A turn of the conversation: the question, and the answer
// signed with the mark as the console signs the assistant —
// what the article says, the article itself with the way to
// its official text, and a sentence the assistant has not
// read in the corpus, marked "(to verify)". In a band that
// reveals, the turn is played: the question, the assistant's
// three dots for a moment, then the answer. The field below
// is the composer's, drawn: nothing here can be typed into.
//
// Used by:
//   - pages/Home.jsx — "ask about the law"
//   - pages/Product.jsx — the conversation
// -----------------------------------------------------------

export function ChatSpecimen({ label }) {

  const t = useTranslations('SITE.specimens.chat');
  const tCompany = useTranslations('SITE.specimens');


  return (
    <Sheet label={label}>
      <p className="m-0 border-b border-edge px-4 py-2.5 text-sm font-semibold">{tCompany('company')}</p>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div data-rv="pop" style={{ '--i': 5 }} className="flex origin-bottom-right flex-col items-end gap-1">
          <span className="text-xs text-muted">{t('you')}</span>
          <p className="m-0 max-w-[85%] rounded-lg bg-canvas px-3.5 py-2 text-sm leading-[1.5]">{t('question')}</p>
        </div>
        <div className="flex gap-3">
          <span data-rv="pop" style={{ '--i': 8 }} className="shrink-0"><Mark size={24} /></span>
          <div className="relative min-w-0 flex-1 text-sm leading-[1.55]">
            <div data-rv="think" style={{ '--i': 9 }} aria-hidden className="absolute left-0 top-1.5 items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            </div>
            <div data-rv="rise" style={{ '--i': 20 }}>
              <p className="m-0">{t('answer')}</p>
              <p className="m-0 mt-2.5 inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded border border-edge px-2.5 py-1.5">
                <span className="font-serif font-semibold">{t('ref')}</span>
                <span className="text-xs font-semibold text-primary underline underline-offset-2">{t('official')}</span>
              </p>
              <p className="m-0 mt-2.5 text-muted">{t('note')}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-edge px-4 py-3" aria-hidden>
        <p className="m-0 rounded border border-field px-3 py-2 text-sm text-muted">{t('placeholder')}</p>
      </div>
    </Sheet>
  );
}







// -----------------------------------------------------------
// ReportSpecimen
// -----------------------------------------------------------
//
// A report's first page under the console's ink bar: the
// company and the tabs a report has, the figures it opens
// with, the bar of the statuses and the gravest gaps — each
// with its verdict, the duty and the provision. The tabs are
// drawn, not links; the first is the one "open".
//
// Used by:
//   - pages/Home.jsx — "a report you can check"
// -----------------------------------------------------------

export function ReportSpecimen({ label }) {

  const t = useTranslations('SITE.specimens.report');
  const tCompany = useTranslations('SITE.specimens');
  const tApp = useTranslations('navbar');
  const tTabs = useTranslations('PAGES.report.TABS');
  const tEnum = useTranslations('ENUMS.findingStatus');
  const total = Object.values(COUNTS).reduce((sum, count) => sum + count, 0);
  const tiles = [
    [ACTS_ASSESSED, t('acts')], [total, t('duties')], [COUNTS.missing, tEnum('missing')], [ACTIONS, t('actions')],
  ];
  const gaps = [['custody', 'missing'], ['incidents', 'partial'], ['records', 'unknown']];


  return (
    <Sheet label={label} bar={tApp('title')}>
      <div className="px-5 pt-4">
        <p className="m-0 text-xs text-muted">{tCompany('company')}</p>
        <p className="m-0 mt-0.5 font-serif text-xl font-semibold">{t('title')}</p>
      </div>
      <ul className="m-0 mt-3 flex list-none gap-5 overflow-hidden border-b border-edge p-0 px-5 text-sm" aria-hidden>
        {['summary', 'acts', 'findings', 'plan', 'citations'].map((tab, index) => (
          <li key={tab} className={`whitespace-nowrap pb-2 ${index === 0 ? 'border-b-2 border-primary font-semibold text-primary' : 'text-muted'}`}>
            {tTabs(tab)}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-5 px-5 py-5">
        <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([value, name], index) => (
            <div key={name} data-rv="pop" style={{ '--i': 6 + index }} className="flex flex-col-reverse rounded-md border border-edge px-3 py-2.5">
              <dt className="text-xs leading-snug text-muted">{name}</dt>
              <dd className="m-0 text-2xl font-semibold leading-tight">{value}</dd>
            </div>
          ))}
        </dl>
        <StatusBar />
        <div>
          <Label>{t('gaps')}</Label>
          <ul className="m-0 list-none divide-y divide-edge rounded-md border border-edge p-0">
            {gaps.map(([key, status], index) => (
              <li key={key} data-rv="rise" style={{ '--i': 14 + index * 1.5 }} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="m-0 font-serif text-[0.9375rem] leading-snug">{t(key)}</p>
                  <p className="m-0 mt-0.5 text-xs text-muted">{t(`${key}Ref`)}</p>
                </div>
                <StatusTag tone={STATUS_TONES[status]}>{tEnum(status)}</StatusTag>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
