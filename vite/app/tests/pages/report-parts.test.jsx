// -----------------------------------------------------------
//  [*] Tests — the parts of a report page: ReportOverview,
//      ReportActionPlan, ReportActs, CitationLinks,
//      ReportProgress, FindingStatusIcon
//
//  Each part rendered on its own in the production frame,
//  fed the fixture world's reports:
//
//    ReportOverview   — the KPI tiles, the status bar and
//                       the open-by-severity tiles counted by
//                       EFFECTIVE status (the reviewer's
//                       override wins, as in the findings tab
//                       and the exports — the stored stats
//                       count the model's verdicts) over the
//                       acts in force; the acts not assessed
//                       with the way to their questions, and
//                       the preparation for acts that apply
//                       later, counted apart; the executive
//                       summary as safe markdown, the
//                       provenance and the cost
//    ReportActionPlan — the actions by priority, their chips,
//                       "Related findings" handing the action
//                       over, the mark on an action that only
//                       prepares for a later act, the empty
//                       plan
//    ReportActs       — the acts by what the report did with
//                       them: assessed, assessed as
//                       preparation (with the date), waiting
//                       for facts (with their questions), and
//                       the folded groups — directives,
//                       judged not applicable, screened out
//                       (an opened one kept open for the
//                       report); confidence, reasoning,
//                       conditions, citations, the corpus and
//                       official links, the mark on an act
//                       updated since the run; for a report
//                       made with the review of its list of
//                       acts, the two groups a person decided
//                       against the verdict (assessed by
//                       choice, applicable but left out) and
//                       the line saying who approved the list
//                       — or that nobody reviewed it
//    CitationLinks    — corpus unit chips, plain chips, the
//                       official text links
//    ReportProgress   — the elapsed clock, the progress
//                       sentence in words, the step states,
//                       each finished step's model and cost
//                       and the cost so far, the steps of
//                       another user's run (404) against a
//                       failed job (the failure shown), the
//                       cancel-requested status, and the
//                       second part of a reviewed report (the
//                       first part's steps done, the clock
//                       from the approval)
//    FindingStatusIcon — one shape per verdict
//
//  And, through the parts, the company's own requirements of
//  the one report that assessed them: one quiet line of
//  counts on the overview, the headline numbers left to the
//  acts; a small group of its own at the end of the acts,
//  with its reasoning; a criterion that is a passage of a
//  company document, which the chip opens at the quote; the
//  step of a run started with them — and nothing of all this
//  for a report without the group. And on the overview what
//  moved since the company's previous report: the one line
//  with its three counts, the date a link to that report, the
//  titles of what came back and of the new gaps while they
//  are few — and no line for a first report.
//
//  Both languages throughout.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage } from '../support/render';
import { given } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import { AMLR_GAP, reportToday } from '../support/reportToday';
import ReportOverview from '@/pages/Reports/ReportOverview';
import ReportActionPlan from '@/pages/Reports/ReportActionPlan';
import ReportActs from '@/pages/Reports/ReportActs';
import CitationLinks from '@/pages/Reports/CitationLinks';
import ReportProgress from '@/pages/Reports/ReportProgress';
import FindingStatusIcon from '@/pages/Reports/FindingStatusIcon';


const DONE = f.report(f.ID.reportDone);
const RUNNING = f.report(f.ID.reportRunning);

// The report that also assessed the company's own
// requirements: the finished one with that group added
const OWN = f.report(f.ID.reportOwn);

// The finished report as a run makes it now: an act assessed
// as preparation, one waiting for facts, a directive
const TODAY = reportToday();

// The finished report as one made with the review of its
// list of acts: Jonas approved the list, taking the consumer
// credit law in as good practice and leaving DORA out
const APPROVED_SCOPE = {
  ...DONE,
  scope: { ...DONE.scope, review: true },
  scopeApprovedBy: f.ID.jonas,
  scopeApprovedByName: f.user(f.ID.jonas).displayName,
  scopeApprovedAt: '2026-09-21T09:20:00+00:00',
  acts: DONE.acts.map((row) => {
    if (row.shortTitle === 'VKĮ') return { ...row, assessment: 'assessed', screenedOut: false };
    if (row.shortTitle === 'DORA') return { ...row, assessment: 'none' };
    return row;
  }),
};

// The two models the fixture analyses ran on
const GPT = 'gateway:azure/gpt-5.5';
const TERRA = 'gateway:azure/gpt-5.6-terra';

// The finished report with the safeguarding finding
// overridden to "met" by a reviewer
const SAFEGUARDING_MET = {
  ...DONE,
  findings: DONE.findings.map((row) => (row.id === f.ID.findingSafeguarding ? { ...row, overrideStatus: 'met', effectiveStatus: 'met' } : row)),
};







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// text: an element's text with the no-break spaces the
// Lithuanian number formats use read as plain spaces (as
// Testing Library's own matchers read them). tile: a KPI
// tile by its label — its label, value and sub line as one
// text. legend: the status bar's legend rows. severityTiles:
// the open-by-severity tiles. section: a titled SectionCard
// (a region).
// -----------------------------------------------------------

const text = (element) => element.textContent.replace(/\u00a0/g, ' ');

const tile = (label) => text(screen.getByText(label, { selector: 'p' }).closest('.MuiPaper-root'));

const legend = () => within(screen.getByRole('figure', { name: /^(Findings by status|Išvados pagal būseną)$/ })).getAllByRole('listitem').map(text);

const severityTiles = (name = 'Open obligations by severity') => within(screen.getByRole('region', { name })).getAllByRole('listitem').map(text);

const section = (name) => screen.getByRole('region', { name });







// -----------------------------------------------------------
// What moved since the previous report
// -----------------------------------------------------------
//
// The overview's line from stats.changes. moved: the
// finished report with other changes. line: the line's
// section, found by its heading.
// -----------------------------------------------------------

describe('ReportOverview — what moved since the previous report', () => {

  const moved = (changes) => ({ ...DONE, stats: { ...DONE.stats, changes } });
  const line = (name = /^Since the previous report/) => screen.getByRole('region', { name });


  it('says in one line how many gaps were closed, are new and came back, the date a link to the previous report', () => {
    renderPage(<ReportOverview report={DONE} />);
    const card = line();
    expect(card).toHaveTextContent('Since the previous report (08/09/2026):gaps closed 2 · new gaps 1 · went back 1');
    expect(within(card).getByRole('link', { name: '08/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportEarlier}`);
    expect(DONE.stats.changes).toMatchObject({ since: f.ID.reportEarlier, sinceDate: '2026-09-08', closed: { count: 2 }, new: { count: 1 }, back: { count: 1 } });
  });


  it('names the gaps that came back, and the new ones while they are few', () => {
    renderPage(<ReportOverview report={DONE} />);
    expect(within(within(line()).getByRole('list', { name: 'Went back' })).getAllByRole('listitem').map(text)).toEqual(['Pranešti apie didelius su IRT susijusius incidentus']);
    expect(within(within(line()).getByRole('list', { name: 'New gaps' })).getAllByRole('listitem').map(text)).toEqual(['Tvarkyti IRT paslaugų sutarčių informacijos registrą']);
    // The gaps that were closed are a number: the findings tab has them
    expect(within(line()).queryByText('Gauti kriptoturto paslaugų teikėjo leidimą')).toBeNull();
  });


  it('many new gaps are a number only; a list the backend cut short says how many more', () => {
    const titles = ['Pirma', 'Antra', 'Trečia', 'Ketvirta', 'Penkta'];
    renderPage(<ReportOverview report={moved({
      since: f.ID.reportEarlier, sinceDate: '2026-09-08', closed: { count: 0, titles: [] },
      new: { count: 4, titles: titles.slice(0, 4) }, back: { count: 7, titles },
    })} />);
    expect(line()).toHaveTextContent('gaps closed 0 · new gaps 4 · went back 7');
    expect(within(line()).queryByRole('list', { name: 'New gaps' })).toBeNull();
    expect(within(within(line()).getByRole('list', { name: 'Went back' })).getAllByRole('listitem').map(text)).toEqual([...titles, 'and 2 more']);
  });


  it('nothing moved: the line with three zeros and no lists', () => {
    renderPage(<ReportOverview report={OWN} />);
    expect(line()).toHaveTextContent('Since the previous report (21/09/2026):gaps closed 0 · new gaps 0 · went back 0');
    expect(within(line()).getByRole('link', { name: '21/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(within(line()).queryByRole('list')).toBeNull();
  });


  it('a company\'s first report, and a report from before reports were compared, show no such line', () => {
    const { changes, ...stats } = DONE.stats;
    expect(changes).toBeTruthy();
    renderPage(<ReportOverview report={{ ...DONE, stats }} />);
    expect(screen.queryByRole('region', { name: /^Since the previous report/ })).toBeNull();
    expect(screen.queryByText(/Since the previous report/)).toBeNull();
  });


  it.each([
    ['a string', 'none'],
    ['counts and titles of the wrong type', { since: 5, sinceDate: {}, closed: 'x', new: { count: 'many', titles: 'all' }, back: { count: null, titles: [1, null] } }],
    ['an empty object', {}],
  ])('changes that are %s break nothing', (_name, changes) => {
    renderPage(<ReportOverview report={moved(changes)} />);
    expect(tile('Actions in the plan')).toBe('Actions in the plan3');
  });


  it('speaks Lithuanian', () => {
    renderPage(<ReportOverview report={DONE} />, { locale: 'lt' });
    const card = line(/^Nuo ankstesnės ataskaitos/);
    expect(card).toHaveTextContent('Nuo ankstesnės ataskaitos (2026-09-08):pašalinta spragų: 2 · naujų spragų: 1 · vėl atsiradusių: 1');
    expect(within(card).getByRole('list', { name: 'Vėl atsirado' })).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: 'Naujos spragos' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// ReportOverview
// -----------------------------------------------------------

describe('ReportOverview', () => {

  it('heads the summary with five tiles: applicable acts, obligations assessed, not met, partial, actions', () => {
    renderPage(<ReportOverview report={DONE} />);
    expect(tile('Applicable legal acts')).toBe('Applicable legal acts31 more to be confirmed');
    expect(tile('Obligations assessed')).toBe('Obligations assessed74 approved by a person');
    expect(tile('Actions in the plan')).toBe('Actions in the plan3');
  });


  it('counts not met and partial by effective status — the overridden register finding is partial [known finding]', () => {
    // Even stale stats that still count the model's verdicts
    // (2 not met / 1 partial) do not decide the tiles — the
    // findings the detail carries do
    const stale = { ...DONE, stats: { ...DONE.stats, findings: { ...DONE.stats.findings, missing: 2, partial: 1 } } };
    renderPage(<ReportOverview report={stale} />);
    expect(tile('Not met')).toBe('Not met1');
    expect(tile('Partial')).toBe('Partial2');
  });


  it('draws the findings by effective status as one bar with a full legend — counts and shares as text', () => {
    renderPage(<ReportOverview report={DONE} />);
    expect(legend()).toEqual(['Not met1(14%)', 'Partial2(29%)', 'Not evidenced1(14%)', 'Met2(29%)', 'Not applicable1(14%)']);
    const bar = screen.getByRole('figure', { name: 'Findings by status' });
    expect(within(bar).getAllByRole('img').map((segment) => segment.getAttribute('aria-label')))
      .toEqual(['Not met: 1 (14%)', 'Partial: 2 (29%)', 'Not evidenced: 1 (14%)', 'Met: 2 (29%)', 'Not applicable: 1 (14%)']);
  });


  it('counts the open findings per severity by effective status', () => {
    renderPage(<ReportOverview report={DONE} />);
    expect(within(section('Open obligations by severity')).getByText('Findings rated “not met” or “partial”.')).toBeInTheDocument();
    expect(severityTiles()).toEqual(['Critical0', 'High2', 'Medium1', 'Low0']);
  });


  it('follows a fresh override everywhere — tiles, bar and severities move together', () => {
    renderPage(<ReportOverview report={SAFEGUARDING_MET} />);
    expect(tile('Not met')).toBe('Not met0');
    expect(tile('Obligations assessed')).toBe('Obligations assessed74 approved by a person');
    expect(legend()).toEqual(['Not met0(0%)', 'Partial2(29%)', 'Not evidenced1(14%)', 'Met3(43%)', 'Not applicable1(14%)']);
    // A zero draws no segment but stays in the legend
    expect(within(screen.getByRole('figure', { name: 'Findings by status' })).queryByRole('img', { name: /^Not met/ })).toBeNull();
    expect(severityTiles()).toEqual(['Critical0', 'High1', 'Medium1', 'Low0']);
  });


  it('renders the executive summary as markdown — headings, emphasis, lists', () => {
    renderPage(<ReportOverview report={DONE} />);
    const summary = section('Executive summary');
    // The summary's top heading ("##") sits right under the
    // card's own h2 — Markdown re-bases the levels
    expect(within(summary).getByRole('heading', { level: 3, name: 'Santrauka' })).toBeInTheDocument();
    expect(within(summary).getByText('Svarbiausios spragos').tagName).toBe('STRONG');
    expect(within(summary).getAllByRole('listitem')).toHaveLength(5);
    expect(within(summary).getByText('Kriptoturto paslaugų teikėjo leidimas (MiCA 59 str. 1 d.).')).toBeInTheDocument();
  });


  it('keeps model-written markdown harmless: no script, no javascript: link, an image only as a link', () => {
    const summary = '[spustelėk](javascript:alert(1)) <script>alert(1)</script> ![schema](https://example.com/x.png) [šaltinis](https://eur-lex.europa.eu/)';
    renderPage(<ReportOverview report={{ ...DONE, summary }} />);
    const card = section('Executive summary');
    expect(document.querySelector('script')).toBeNull();
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).getByText('spustelėk').closest('a')).toBeNull();
    expect(within(card).getByRole('link', { name: 'schema' })).toHaveAttribute('href', 'https://example.com/x.png');
    const source = within(card).getByRole('link', { name: 'šaltinis' });
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });


  it('says "No summary." when the model wrote none — or wrote something that is not text', () => {
    const view = renderPage(<ReportOverview report={{ ...DONE, summary: '' }} />);
    expect(within(section('Executive summary')).getByText('No summary.')).toBeInTheDocument();
    view.unmount();
    renderPage(<ReportOverview report={{ ...DONE, summary: 12345 }} />);
    expect(within(section('Executive summary')).getByText('No summary.')).toBeInTheDocument();
  });


  it('lists the provenance — prompt versions with models, models, act versions with dates — and the cost', () => {
    renderPage(<ReportOverview report={DONE} />);
    const provenance = section('Provenance');
    expect(within(provenance).getByText('Which prompt versions, models and legal act versions were used — so the result can be reproduced.')).toBeInTheDocument();
    const lists = within(provenance).getAllByRole('list').map((list) => within(list).getAllByRole('listitem').map((li) => li.textContent));
    expect(lists).toEqual([
      ['corpus.check_citations v1 (gateway:azure/gpt-5.6-luna)', 'report.action_plan v1 (gateway:azure/gpt-5.5)', 'report.applicability v1 (gateway:azure/gpt-5.5)', 'report.gap_analysis v2 (gateway:azure/gpt-5.6-terra)', 'report.summary v1 (gateway:azure/gpt-5.5)'],
      ['gateway:azure/gpt-5.5', 'gateway:azure/gpt-5.6-luna', 'gateway:azure/gpt-5.6-terra'],
      ['DORA: version 1, 17/01/2025', 'MiCA: version 1, 29/06/2023', 'DI aktas: version 1, 01/08/2024', 'PPTFPĮ: version 1, 01/01/2026'],
    ]);
    expect(within(provenance).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['AI prompts', 'Models', 'Legal act versions']);
    expect(within(provenance).getByText('AI cost: $0.8306 · 128,730 tokens')).toBeInTheDocument();
  });


  it('shows a dash for an empty provenance list, a version without its date, and survives repeated entries', () => {
    const stats = { ...DONE.stats, provenance: { prompts: [], models: ['gateway:azure/gpt-5.5', 'gateway:azure/gpt-5.5'], corpus: [{ act: 'MiCA', versionNo: 2, versionDate: null }] } };
    renderPage(<ReportOverview report={{ ...DONE, stats }} />);
    const provenance = section('Provenance');
    expect(within(provenance).getAllByText('—')).toHaveLength(1);
    expect(within(provenance).getAllByText('gateway:azure/gpt-5.5')).toHaveLength(2);
    expect(within(provenance).getByText('MiCA: version 2')).toBeInTheDocument();
  });


  it('leaves the provenance out, and shows zeros, for a report without stats (it never finished)', () => {
    renderPage(<ReportOverview report={{ ...f.report(f.ID.reportFailed) }} />);
    expect(screen.queryByRole('region', { name: 'Provenance' })).toBeNull();
    expect(tile('Applicable legal acts')).toBe('Applicable legal acts0');
    expect(tile('Obligations assessed')).toBe('Obligations assessed0');
    expect(tile('Actions in the plan')).toBe('Actions in the plan0');
    expect(severityTiles()).toEqual(['Critical0', 'High0', 'Medium0', 'Low0']);
    // No bar without findings, the legend still stands
    expect(within(screen.getByRole('figure', { name: 'Findings by status' })).queryAllByRole('img')).toHaveLength(0);
    expect(within(section('Executive summary')).getByText('No summary.')).toBeInTheDocument();
  });


  it('counts the acts assessed, and under them those that apply later and those still to confirm', () => {
    renderPage(<ReportOverview report={TODAY} />);
    expect(tile('Legal acts assessed')).toBe('Legal acts assessed31 applying later · 1 to confirm');
    expect(screen.queryByText('Applicable legal acts')).toBeNull();
    // A report from before acts were told apart keeps its tile
    renderPage(<ReportOverview report={DONE} />);
    expect(tile('Applicable legal acts')).toBe('Applicable legal acts31 more to be confirmed');
  });


  it('keeps the preparation for a later act out of today\'s result, in a card of its own', () => {
    renderPage(<ReportOverview report={TODAY} />);
    // Today: the AML regulation's partial (high) and met findings are not in it
    expect(tile('Obligations assessed')).toBe('Obligations assessed64 approved by a person');
    expect(tile('Partial')).toBe('Partial2');
    expect(legend()).toEqual(['Not met1(17%)', 'Partial2(33%)', 'Not evidenced0(0%)', 'Met2(33%)', 'Not applicable1(17%)']);
    expect(severityTiles()).toEqual(['Critical0', 'High2', 'Medium1', 'Low0']);
    const later = section('Acts that apply later — readiness');
    expect(within(later).getByText('These acts do not apply to the company yet. Their findings show readiness and are not part of the result above.')).toBeInTheDocument();
    expect(within(later).getAllByRole('listitem')[0]).toHaveTextContent('AMLR — applies from 10/07/2027');
    expect(within(within(later).getByRole('figure', { name: 'Acts that apply later — readiness' })).getAllByRole('listitem').map(text))
      .toEqual(['Not met0(0%)', 'Partial1(50%)', 'Not evidenced0(0%)', 'Met1(50%)', 'Not applicable0(0%)']);
  });


  it('names the acts that were not assessed and leads to their questions', () => {
    renderPage(<ReportOverview report={TODAY} />, { route: '/reports/r1?findings.q=registras' });
    const waiting = section('Acts not assessed: 1');
    expect(within(waiting).getByText(/^Whether these acts apply depends on facts the company profile does not state/)).toBeInTheDocument();
    expect(within(waiting).getAllByRole('listitem').map(text)).toEqual(['DI aktas']);
    expect(within(waiting).getByRole('link', { name: 'See the questions' })).toHaveAttribute('href', '/reports/r1?findings.q=registras&tab=acts');
  });


  it('shows neither card for a report that assessed every act — one from before, or one with nothing waiting', () => {
    renderPage(<ReportOverview report={DONE} />);
    expect(screen.queryByRole('region', { name: /^Acts not assessed/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Acts that apply later/ })).toBeNull();
  });


  it('speaks Lithuanian about what was and was not assessed', () => {
    renderPage(<ReportOverview report={TODAY} />, { locale: 'lt' });
    expect(tile('Įvertinti teisės aktai')).toBe('Įvertinti teisės aktai3vėliau taikomų: 1 · nepatvirtintų: 1');
    expect(within(section('Nevertinti teisės aktai: 1')).getByRole('link', { name: 'Peržiūrėti klausimus' })).toBeInTheDocument();
    expect(within(section('Vėliau taikomi aktai — pasirengimas')).getAllByRole('listitem')[0]).toHaveTextContent('AMLR — taikomas nuo 2027-07-10');
  });


  it('shows the company\'s own requirements as one quiet line of counts, saying what they are — the headline numbers stay those of the acts', () => {
    renderPage(<ReportOverview report={OWN} />);
    const own = section('Own requirements');
    expect(within(own).getByText('— gaps between the company\'s policies and its procedures; not breaches of law')).toBeInTheDocument();
    expect(within(own).getAllByRole('listitem').map(text)).toEqual(['Not met1', 'Partial1', 'Not evidenced0', 'Met1', 'Not applicable0']);
    // A line, not a chart: no bar and no tile of its own
    expect(within(own).queryByRole('figure')).toBeNull();
    expect(within(own).queryByRole('img')).toBeNull();
    // The result against the law is the finished report's, to the number
    expect(tile('Applicable legal acts')).toBe('Applicable legal acts31 more to be confirmed');
    expect(tile('Obligations assessed')).toBe('Obligations assessed74 approved by a person');
    expect(tile('Not met')).toBe('Not met1');
    expect(tile('Partial')).toBe('Partial2');
    expect(legend()).toEqual(['Not met1(14%)', 'Partial2(29%)', 'Not evidenced1(14%)', 'Met2(29%)', 'Not applicable1(14%)']);
    expect(severityTiles()).toEqual(['Critical0', 'High2', 'Medium1', 'Low0']);
    // Their open findings are in the plan with the rest
    expect(tile('Actions in the plan')).toBe('Actions in the plan4');
  });


  it('counts the group by effective status too — a reviewer\'s verdict moves its line and nothing above it', () => {
    const reviewed = {
      ...OWN,
      findings: OWN.findings.map((row) => (row.id === f.ID.findingOwnReports ? { ...row, overrideStatus: 'met', effectiveStatus: 'met' } : row)),
    };
    renderPage(<ReportOverview report={reviewed} />);
    expect(within(section('Own requirements')).getAllByRole('listitem').map(text)).toEqual(['Not met0', 'Partial1', 'Not evidenced0', 'Met2', 'Not applicable0']);
    expect(tile('Not met')).toBe('Not met1');
    expect(severityTiles()).toEqual(['Critical0', 'High2', 'Medium1', 'Low0']);
  });


  it('shows nothing of the group for a report without it — one from before, or one made today', () => {
    for (const report of [DONE, TODAY]) {
      const view = renderPage(<ReportOverview report={report} />);
      expect(screen.queryByRole('region', { name: 'Own requirements' })).toBeNull();
      expect(screen.queryByText(/not breaches of law/)).toBeNull();
      view.unmount();
    }
  });


  it('names the company\'s own requirements and what they are in Lithuanian', () => {
    renderPage(<ReportOverview report={OWN} />, { locale: 'lt' });
    const own = section('Vidaus reikalavimai');
    expect(within(own).getByText('— spragos tarp įmonės politikų ir procedūrų; ne teisės aktų pažeidimai')).toBeInTheDocument();
    expect(within(own).getAllByRole('listitem').map(text)).toEqual(['Neatitinka1', 'Iš dalies1', 'Neįrodyta0', 'Atitinka1', 'Netaikoma0']);
    expect(tile('Įvertintos pareigos')).toBe('Įvertintos pareigos7žmogaus patvirtintų: 4');
  });


  it('speaks Lithuanian: tiles, legend, severities, provenance and the cost with Lithuanian numbers', () => {
    renderPage(<ReportOverview report={DONE} />, { locale: 'lt' });
    expect(tile('Taikomi teisės aktai')).toBe('Taikomi teisės aktai3dar tikslintinų: 1');
    expect(tile('Įvertintos pareigos')).toBe('Įvertintos pareigos7žmogaus patvirtintų: 4');
    expect(tile('Neatitinka')).toBe('Neatitinka1');
    expect(tile('Iš dalies')).toBe('Iš dalies2');
    expect(tile('Veiksmai plane')).toBe('Veiksmai plane3');
    expect(legend()).toEqual(['Neatitinka1(14 %)', 'Iš dalies2(29 %)', 'Neįrodyta1(14 %)', 'Atitinka2(29 %)', 'Netaikoma1(14 %)']);
    expect(severityTiles('Neįvykdytos pareigos pagal reikšmingumą')).toEqual(['Kritinė0', 'Aukšta2', 'Vidutinė1', 'Žema0']);
    const provenance = section('Analizės kilmė');
    expect(within(provenance).getByText('MiCA: redakcija 1, 2023-06-29')).toBeInTheDocument();
    expect(within(provenance).getByText('DI sąnaudos: 0,8306 USD · žetonų: 128 730')).toBeInTheDocument();
    expect(section('Vadovybės santrauka')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// ReportActionPlan
// -----------------------------------------------------------

describe('ReportActionPlan', () => {

  const actionCards = () => within(screen.getByRole('list', { name: 'Action plan' })).getAllByRole('listitem');


  it('lists the actions by priority with the badge, title, description and chips', () => {
    renderPage(<ReportActionPlan report={DONE} onShowFindings={() => {}} />);
    const cards = actionCards();
    expect(cards).toHaveLength(3);
    const first = cards[0];
    expect(within(first).getByLabelText('Priority 1')).toHaveTextContent('1');
    expect(within(first).getByRole('heading', { level: 3, name: 'Patvirtinti klientų kriptoturto ir lėšų apsaugos politiką' })).toBeInTheDocument();
    expect(within(first).getByText(/^Parengti ir valdybos sprendimu patvirtinti/)).toBeInTheDocument();
    expect(within(first).getAllByText(/./, { selector: '.MuiChip-label' }).map((chip) => chip.textContent))
      .toEqual(['Within 30 days', 'Effort: Medium', 'Owner: Atitikties pareigūnas', 'Safeguarding of client funds']);
    expect(within(cards[2]).getAllByText(/./, { selector: '.MuiChip-label' }).map((chip) => chip.textContent))
      .toEqual(['Immediately', 'Effort: Low', 'Owner: Atitikties pareigūnas', 'AI governance']);
  });


  it('sorts by priority whatever order the actions come in', () => {
    const shuffled = [DONE.actions[2], DONE.actions[0], DONE.actions[1]];
    renderPage(<ReportActionPlan report={{ ...DONE, actions: shuffled }} onShowFindings={() => {}} />);
    expect(actionCards().map((card) => within(card).getByRole('heading').textContent)).toEqual(DONE.actions.map((action) => action.title));
  });


  it('lists an action without an id, or repeating one, like any other — React is left no key to trip on', () => {
    const actions = [{ ...DONE.actions[0], id: undefined }, { ...DONE.actions[1], id: 'same' }, { ...DONE.actions[2], id: 'same' }];
    renderPage(<ReportActionPlan report={{ ...DONE, actions }} onShowFindings={() => {}} />);
    expect(actionCards().map((card) => within(card).getByRole('heading').textContent)).toEqual(DONE.actions.map((action) => action.title));
  });


  it('"Related findings (n)" hands the whole action to the page', async () => {
    const shown = [];
    const { user } = renderPage(<ReportActionPlan report={DONE} onShowFindings={(action) => shown.push(action)} />);
    await user.click(within(actionCards()[1]).getByRole('button', { name: 'Related findings (2)' }));
    expect(shown).toEqual([DONE.actions[1]]);
  });


  it('leaves out what an action lacks: no related findings, no owner, no description', () => {
    const bare = { ...DONE.actions[0], findingIds: [], ownerRole: '', description: '' };
    renderPage(<ReportActionPlan report={{ ...DONE, actions: [bare] }} onShowFindings={() => {}} />);
    const card = actionCards()[0];
    expect(within(card).queryByRole('button')).toBeNull();
    expect(within(card).queryByText(/^Owner:/)).toBeNull();
    expect(within(card).queryByText(/^Parengti/)).toBeNull();
  });


  it('marks the action that only prepares for an act not yet in force', () => {
    const actions = [...TODAY.actions, { ...TODAY.actions[0], id: 'prep', priority: 4, title: 'Pasirengti AMLR', findingIds: [AMLR_GAP] },
      { ...TODAY.actions[0], id: 'mixed', priority: 5, title: 'Mišrus veiksmas', findingIds: [AMLR_GAP, f.ID.findingSafeguarding] }];
    renderPage(<ReportActionPlan report={{ ...TODAY, actions }} onShowFindings={() => {}} />);
    const chips = (card) => within(card).getAllByText(/./, { selector: '.MuiChip-label' }).map((chip) => chip.textContent);
    const cards = actionCards();
    expect(chips(cards[3])[0]).toBe('Preparation');
    // An action that also closes a gap of today is no preparation
    for (const index of [0, 1, 2, 4]) expect(chips(cards[index]), String(index)).not.toContain('Preparation');
  });


  it('says the plan is empty when no open obligation was found', () => {
    renderPage(<ReportActionPlan report={{ ...DONE, actions: [] }} onShowFindings={() => {}} />);
    expect(screen.getByText('The action plan is empty — no open obligations were found.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });


  it('speaks Lithuanian', () => {
    renderPage(<ReportActionPlan report={DONE} onShowFindings={() => {}} />, { locale: 'lt' });
    const card = within(screen.getByRole('list', { name: 'Veiksmų planas' })).getAllByRole('listitem')[1];
    expect(within(card).getByLabelText('Prioritetas 2')).toBeInTheDocument();
    expect(within(card).getAllByText(/./, { selector: '.MuiChip-label' }).map((chip) => chip.textContent))
      .toEqual(['Per 90 dienų', 'Sąnaudos: Vidutinės', 'Atsakingas: IT vadovas', 'Pranešimai apie incidentus']);
    expect(within(card).getByRole('button', { name: 'Susijusios išvados (2)' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// ReportActs
// -----------------------------------------------------------

describe('ReportActs', () => {

  const actCard = (shortTitle) => screen.getByRole('heading', { level: 3, name: new RegExp(`^${shortTitle} — `) }).closest('.MuiPaper-root');


  it('lists the acts the report assessed in its own order, each titled "short — full"', () => {
    renderPage(<ReportActs report={DONE} />);
    const applicable = section('Acts assessed');
    expect(within(applicable).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0])).toEqual(['DORA', 'MiCA', 'DI aktas', 'PPTFPĮ']);
    expect(actCard('DORA')).toHaveTextContent('DORA — 2022 m. gruodžio 14 d. Europos Parlamento ir Tarybos reglamentas (ES) 2022/2554');
  });


  it('shows an act without an id, or repeating one, like any other — in every group, without a key clash', async () => {
    const acts = DONE.acts.map((act, index) => ({ ...act, id: index === 0 ? undefined : (index % 2 ? 'same' : '') }));
    const { user } = renderPage(<ReportActs report={{ ...DONE, acts }} />);
    const applicable = section('Acts assessed');
    expect(within(applicable).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0])).toEqual(['DORA', 'MiCA', 'DI aktas', 'PPTFPĮ']);
    await user.click(screen.getByRole('button', { name: /^Screened out by the catalogue/ }));
    expect(await screen.findByRole('heading', { level: 3, name: /^VKĮ — / })).toBeInTheDocument();
  });


  it('marks an adopted standard as one, without a confidence — it applies by the adoption, no model judged it', () => {
    const standard = {
      ...DONE.acts[0], id: 'std-act', documentId: f.ID.iso27001Standard, shortTitle: 'ISO/IEC 27001:2022',
      documentTitle: 'Information security management systems — Requirements', jurisdiction: 'INTL', docType: 'standard',
      applicability: 'applies', confidence: 1, reasoning: 'Įmonė sertifikuota pagal šį standartą.', conditionsToVerify: '', citations: [],
    };
    renderPage(<ReportActs report={{ ...DONE, acts: [...DONE.acts, standard] }} />);
    const card = actCard('ISO/IEC 27001:2022');
    expect(within(card).getByText('Standard')).toBeInTheDocument();
    expect(within(card).getByText('International')).toBeInTheDocument();
    expect(within(card).getByText('Applies')).toBeInTheDocument();
    expect(within(card).queryByText(/^Confidence/)).toBeNull();
    expect(within(card).getByText('Įmonė sertifikuota pagal šį standartą.')).toBeInTheDocument();
    expect(within(actCard('DORA')).queryByText('Standard')).toBeNull();
  });


  it('shows the jurisdiction, the verdict, the confidence and the reasoning', () => {
    renderPage(<ReportActs report={DONE} />);
    const dora = actCard('DORA');
    expect(within(dora).getByText('EU')).toBeInTheDocument();
    expect(within(dora).getByText('Applies')).toBeInTheDocument();
    expect(within(dora).getByText('Confidence 92%')).toBeInTheDocument();
    expect(within(dora).getByText('Reasoning')).toBeInTheDocument();
    expect(within(dora).getByText(/^UAB Pavyzdys yra kriptoturto paslaugų teikėjas, gavęs leidimą pagal MiCA/)).toBeInTheDocument();
    const aml = actCard('PPTFPĮ');
    expect(within(aml).getByText('Lithuania')).toBeInTheDocument();
    expect(within(aml).queryByText('Conditions to confirm')).toBeNull();
    expect(within(aml).queryByText('Legal basis')).toBeNull();
  });


  it('highlights the conditions to confirm of an uncertain act', () => {
    renderPage(<ReportActs report={DONE} />);
    const ai = actCard('DI aktas');
    expect(within(ai).getByText('To be confirmed')).toBeInTheDocument();
    // A confidence beside "to be confirmed" would read as its opposite
    expect(within(ai).queryByText(/^Confidence/)).toBeNull();
    expect(within(ai).getByText('Conditions to confirm')).toBeInTheDocument();
    expect(within(ai).getByText(/^Patikrinti, ar modelis naudojamas fizinių asmenų kreditingumui vertinti/)).toBeInTheDocument();
  });


  it('links the cited scope provisions to the corpus, the act to its corpus page and to its official source', () => {
    renderPage(<ReportActs report={DONE} />);
    const dora = actCard('DORA');
    expect(within(dora).getByText('Legal basis')).toBeInTheDocument();
    expect(within(dora).getByRole('link', { name: 'Open the provision in the corpus: DORA 2 str.' }))
      .toHaveAttribute('href', `/corpus/${f.ID.dora}?unit=${f.ID.doraArt2}`);
    // An act's citations carry no official-text url
    expect(within(dora).queryByRole('link', { name: /^Official text/ })).toBeNull();
    expect(within(dora).getByRole('link', { name: 'The act in the corpus' })).toHaveAttribute('href', `/corpus/${f.ID.dora}`);
    const source = within(dora).getByRole('link', { name: 'Official source' });
    expect(source).toHaveAttribute('href', 'https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32022R2554');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  });


  it('marks the act updated since the run (outdatedActs) — only that one', () => {
    renderPage(<ReportActs report={DONE} />);
    expect(within(actCard('MiCA')).getByText('Updated since the analysis')).toBeInTheDocument();
    for (const act of ['DORA', 'DI aktas', 'PPTFPĮ']) expect(within(actCard(act)).queryByText('Updated since the analysis'), act).toBeNull();
  });


  it('matches an outdated act without a short title by its full title, and never marks a screened-out act', () => {
    const acts = DONE.acts.map((row) => (row.shortTitle === 'DORA' ? { ...row, shortTitle: '' } : row));
    renderPage(<ReportActs report={{ ...DONE, acts, outdatedActs: [DONE.acts[0].documentTitle, 'VKĮ'] }} />);
    const dora = screen.getByRole('heading', { level: 3, name: DONE.acts[0].documentTitle }).closest('.MuiPaper-root');
    expect(within(dora).getByText('Updated since the analysis')).toBeInTheDocument();
    expect(screen.getAllByText('Updated since the analysis')).toHaveLength(1);
  });


  it('sets apart the acts assessed as preparation, with the date they apply from', () => {
    renderPage(<ReportActs report={TODAY} />);
    expect(within(section('Acts assessed')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0]))
      .toEqual(['DORA', 'MiCA', 'PPTFPĮ']);
    const later = section('Applying later — readiness assessed');
    expect(within(later).getByText(/^These acts start to apply to the company on the date shown/)).toBeInTheDocument();
    const amlr = actCard('AMLR');
    expect(later).toContainElement(amlr);
    expect(within(amlr).getByText('Applies')).toBeInTheDocument();
    expect(within(amlr).getByText('Applies from 10/07/2027')).toBeInTheDocument();
    expect(within(actCard('MiCA')).queryByText(/^Applies from/)).toBeNull();
  });


  it('lists the acts that were not assessed with the questions that decide them', () => {
    renderPage(<ReportActs report={TODAY} />);
    const waiting = section('Applicability to confirm — not assessed');
    expect(within(waiting).getByText(/^Whether these acts apply depends on facts the company profile does not state, so their obligations were not assessed\. Answer each act's questions/)).toBeInTheDocument();
    const ai = actCard('DI aktas');
    expect(waiting).toContainElement(ai);
    expect(within(ai).getByText('Questions to answer')).toBeInTheDocument();
    expect(within(ai).queryByText('Conditions to confirm')).toBeNull();
    expect(within(ai).getByText(/^Patikrinti, ar modelis naudojamas fizinių asmenų kreditingumui vertinti/)).toBeInTheDocument();
  });


  it('folds the directives into a group that says they are assessed through national law', async () => {
    const { user } = renderPage(<ReportActs report={TODAY} />);
    const group = screen.getByRole('button', { name: 'Directives — applied through national law (1)' });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    await user.click(group);
    expect(await screen.findByText(/^A directive binds Member States; its requirements reach the company through the Lithuanian acts/)).toBeInTheDocument();
    expect(actCard('AMLD6')).toHaveTextContent('Direktyvą į Lietuvos teisę perkelia PPTFPĮ');
  });


  it('folds the acts that only organise an authority into a group of their own, saying why they were not assessed', async () => {
    const { user } = renderPage(<ReportActs report={TODAY} />);
    const group = screen.getByRole('button', { name: 'Acts that organise an authority or a procedure (1)' });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    await user.click(group);
    expect(await screen.findByText(/^These acts set out a supervisory authority's tasks, powers, sanctions or procedures/)).toBeInTheDocument();
    expect(actCard('LBĮ')).toHaveTextContent('Įstatymas nustato Lietuvos banko uždavinius ir priežiūros įgaliojimus.');
  });


  it('a report from before acts were told apart shows what it did: every act that applied or might, assessed', () => {
    const before = (act) => Object.fromEntries(Object.entries(act).filter(([key]) => !['assessment', 'appliesFrom'].includes(key)));
    renderPage(<ReportActs report={{ ...DONE, acts: DONE.acts.map(before) }} />);
    expect(within(section('Acts assessed')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0]))
      .toEqual(['DORA', 'MiCA', 'DI aktas', 'PPTFPĮ']);
    expect(within(actCard('DI aktas')).getByText('Conditions to confirm')).toBeInTheDocument();
    for (const name of [/^Applying later/, /^Applicability to confirm/]) expect(screen.queryByRole('region', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Directives/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Acts that organise/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Screened out by the catalogue (1)' })).toBeInTheDocument();
  });


  it('folds the acts the catalogue screened out into a closed group, without a confidence', async () => {
    const { user } = renderPage(<ReportActs report={DONE} />);
    const group = screen.getByRole('button', { name: 'Screened out by the catalogue (1)' });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Judged not applicable/ })).toBeNull();
    await user.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'true');
    const vki = actCard('VKĮ');
    expect(within(vki).getByText('Does not apply')).toBeInTheDocument();
    expect(within(vki).queryByText(/^Confidence/)).toBeNull();
    expect(within(vki).getByText(/^Screened out by the catalogue: the act targets consumer_credit/)).toBeInTheDocument();
  });


  it('a group the user opened is open again when they come back — per report', async () => {
    const first = renderPage(<ReportActs report={DONE} />);
    await first.user.click(screen.getByRole('button', { name: 'Screened out by the catalogue (1)' }));
    first.unmount();
    renderPage(<ReportActs report={DONE} />);
    expect(screen.getByRole('button', { name: 'Screened out by the catalogue (1)' })).toHaveAttribute('aria-expanded', 'true');
    expect(actCard('VKĮ')).toBeInTheDocument();
    renderPage(<ReportActs report={{ ...DONE, id: 'e9000000-0000-4000-8000-000000000009' }} />);
    expect(screen.getAllByRole('button', { name: 'Screened out by the catalogue (1)' })[1]).toHaveAttribute('aria-expanded', 'false');
  });


  it('groups the acts the AI judged not applicable apart from the screened-out ones', () => {
    const acts = DONE.acts.map((row) => (row.shortTitle === 'DI aktas' ? { ...row, applicability: 'not_applies', assessment: 'none' } : row));
    renderPage(<ReportActs report={{ ...DONE, acts }} />);
    expect(screen.getByRole('button', { name: 'Judged not applicable by the AI (1)' })).toBeInTheDocument();
    expect(within(section('Acts assessed')).getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });


  it('says so when no act applies', () => {
    renderPage(<ReportActs report={{ ...DONE, acts: DONE.acts.filter((row) => row.screenedOut) }} />);
    expect(within(section('Acts assessed')).getByText('No applicable legal acts were found.')).toBeInTheDocument();
  });


  it('sets apart the acts assessed by the company\'s choice — not binding, so their findings are no breach', () => {
    renderPage(<ReportActs report={APPROVED_SCOPE} />);
    const chosen = section('Not binding — assessed by the company\'s choice');
    expect(within(chosen).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0])).toEqual(['VKĮ']);
    expect(within(chosen).getByText('These acts do not bind the company. The person who approved the list of acts took them in as good practice, so their findings show a distance from that practice, not a breach.')).toBeInTheDocument();
    // The verdict stays on the card: it still says the act does not apply
    expect(within(actCard('VKĮ')).getByText('Does not apply')).toBeInTheDocument();
    // …and it is no longer among the screened-out ones
    expect(screen.queryByRole('button', { name: /^Screened out by the catalogue/ })).toBeNull();
  });


  it('sets apart the acts that apply but were left out by the person who approved the scope', () => {
    renderPage(<ReportActs report={APPROVED_SCOPE} />);
    const left = section('Applicable — left out by the person who approved the scope');
    expect(within(left).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0])).toEqual(['DORA']);
    expect(within(left).getByText('These acts apply to the company, but the person who approved the list of acts left them out of this report. Their obligations were not assessed.')).toBeInTheDocument();
    expect(within(actCard('DORA')).getByText('Applies')).toBeInTheDocument();
    expect(within(section('Acts assessed')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0])).toEqual(['MiCA', 'DI aktas', 'PPTFPĮ']);
    // Left out is not "judged not applicable"
    expect(screen.queryByRole('button', { name: /^Judged not applicable by the AI/ })).toBeNull();
  });


  it('an act taken in by choice that applies from a later date is with the chosen ones, not with the preparation', () => {
    const acts = APPROVED_SCOPE.acts.map((row) => (row.shortTitle === 'VKĮ' ? { ...row, assessment: 'upcoming', appliesFrom: '2027-01-01' } : row));
    renderPage(<ReportActs report={{ ...APPROVED_SCOPE, acts }} />);
    expect(within(section('Not binding — assessed by the company\'s choice')).getByText('Applies from 01/01/2027')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Applying later — readiness assessed' })).toBeNull();
  });


  it('shows neither group for a report whose approver changed nothing, nor for one from before the review', () => {
    renderPage(<ReportActs report={{ ...APPROVED_SCOPE, acts: DONE.acts }} />);
    expect(screen.queryByRole('region', { name: /^Not binding/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Applicable — left out/ })).toBeNull();
  });


  it('says who approved the list of acts, and when', () => {
    renderPage(<ReportActs report={APPROVED_SCOPE} />);
    expect(screen.getByText('The list of acts was approved by Jonas Naudotojas, 21/09/2026, 09:20')).toBeInTheDocument();
  });


  it('says a report ran without the review of its list of acts — the run stamped itself, nobody approved', () => {
    renderPage(<ReportActs report={{ ...DONE, scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: '2026-09-21T09:17:00+00:00' }} />);
    expect(screen.getByText('The report was run without a review of the list of acts')).toBeInTheDocument();
  });


  it('a reviewed report whose approver is gone says the date alone — never "without a review"', () => {
    renderPage(<ReportActs report={{ ...APPROVED_SCOPE, scopeApprovedBy: null, scopeApprovedByName: null }} />);
    expect(screen.getByText('The list of acts was approved 21/09/2026, 09:20')).toBeInTheDocument();
    expect(screen.queryByText('The report was run without a review of the list of acts')).toBeNull();
  });


  it('says nothing about the approval for a report from before the review existed, and never shows a switch on a report past it', () => {
    renderPage(<ReportActs report={DONE} />);
    expect(screen.queryByText(/list of acts/)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });


  it('shows the company\'s own requirements apart from the acts: a small group after them all, with its reasoning — no verdict, no confidence, no link', () => {
    renderPage(<ReportActs report={OWN} />);
    const own = section('Own requirements');
    expect(within(own).getByText('Reasoning')).toBeInTheDocument();
    expect(within(own).getByText('Įmonės politikos lygmens dokumentų nustatyti reikalavimai, vertinami pagal tai, ar juos įgyvendina kiti įmonės dokumentai. Tai įmonės pačios sau nustatytos taisyklės, ne teisės aktų pareigos.')).toBeInTheDocument();
    expect(within(own).queryByRole('link')).toBeNull();
    expect(within(own).queryByText('Applies')).toBeNull();
    expect(within(own).queryByText(/^Confidence/)).toBeNull();
    // After the last group of acts
    const lastGroup = screen.getByRole('button', { name: /^Screened out by the catalogue/ });
    expect(lastGroup.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });


  it('never counts the row among the acts — the groups are those of the report without it', () => {
    renderPage(<ReportActs report={OWN} />);
    expect(within(section('Acts assessed')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0])).toEqual(['DORA', 'MiCA', 'DI aktas', 'PPTFPĮ']);
    expect(screen.queryByRole('heading', { level: 3, name: /vidaus reikalavimai/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Screened out by the catalogue (1)' })).toBeInTheDocument();
  });


  it('shows no such group for a report without the row', () => {
    for (const report of [DONE, TODAY, APPROVED_SCOPE]) {
      const view = renderPage(<ReportActs report={report} />);
      expect(screen.queryByRole('region', { name: 'Own requirements' })).toBeNull();
      view.unmount();
    }
  });


  it('names the group of the company\'s own requirements in Lithuanian', () => {
    renderPage(<ReportActs report={OWN} />, { locale: 'lt' });
    const own = section('Vidaus reikalavimai');
    expect(within(own).getByText('Pagrindimas')).toBeInTheDocument();
    expect(within(own).getByText(/^Įmonės politikos lygmens dokumentų nustatyti reikalavimai/)).toBeInTheDocument();
  });


  it('speaks Lithuanian', () => {
    renderPage(<ReportActs report={DONE} />, { locale: 'lt' });
    expect(section('Įvertinti teisės aktai')).toBeInTheDocument();
    const mica = actCard('MiCA');
    expect(within(mica).getByText('Taikomas')).toBeInTheDocument();
    expect(within(mica).getByText('ES')).toBeInTheDocument();
    expect(within(mica).getByText('Patikimumas 97 %')).toBeInTheDocument();
    expect(within(mica).getByText('Atnaujintas po analizės')).toBeInTheDocument();
    expect(within(mica).getByRole('link', { name: 'Teisės aktas bazėje' })).toBeInTheDocument();
    expect(within(mica).getByRole('link', { name: 'Oficialus šaltinis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atmesti pagal katalogą (1)' })).toBeInTheDocument();
  });


  it('speaks Lithuanian about what the approver decided: the two groups and the line', () => {
    renderPage(<ReportActs report={APPROVED_SCOPE} />, { locale: 'lt' });
    expect(within(section('Neprivalomi — įvertinti įmonės pasirinkimu')).getByText('Šie aktai įmonei neprivalomi. Aktų sąrašą patvirtinęs asmuo įtraukė juos kaip gerąją praktiką, todėl jų išvados rodo atotrūkį nuo tos praktikos, o ne pažeidimą.')).toBeInTheDocument();
    expect(within(section('Taikomi — apimtį tvirtinusio asmens sprendimu nevertinti')).getByText('Šie aktai įmonei taikomi, tačiau aktų sąrašą patvirtinęs asmuo jų į šią ataskaitą neįtraukė. Jų pareigos nevertintos.')).toBeInTheDocument();
    expect(screen.getByText('Aktų sąrašą patvirtino Jonas Naudotojas, 2026-09-21 09:20')).toBeInTheDocument();
  });


  it('says in Lithuanian that a report ran without the review', () => {
    renderPage(<ReportActs report={{ ...DONE, scopeApprovedAt: '2026-09-21T09:17:00+00:00' }} />, { locale: 'lt' });
    expect(screen.getByText('Ataskaita paleista be aktų sąrašo peržiūros')).toBeInTheDocument();
  });


  it('speaks Lithuanian about the acts that apply later, wait for facts or stand behind national law', () => {
    renderPage(<ReportActs report={TODAY} />, { locale: 'lt' });
    expect(within(section('Taikomi vėliau — įvertintas pasirengimas')).getByText('Taikomas nuo 2027-07-10')).toBeInTheDocument();
    expect(within(section('Taikymą reikia patvirtinti — nevertinti')).getByText('Atsakytini klausimai')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Direktyvos — taikomos per nacionalinę teisę (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Institucijų veiklą ir procedūras nustatantys aktai (1)' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// CitationLinks
// -----------------------------------------------------------

describe('CitationLinks', () => {

  const micaCitation = DONE.findings[0].citations[0];


  it('renders nothing without citations', () => {
    const { container } = renderPage(<><CitationLinks citations={[]} documentId={f.ID.mica} /><CitationLinks citations={null} /></>);
    expect(container.querySelector('ul')).toBeNull();
  });


  it('links a citation to its provision in the corpus and to the official text', () => {
    renderPage(<CitationLinks citations={[micaCitation]} documentId={f.ID.mica} />);
    expect(screen.getByRole('link', { name: 'Open the provision in the corpus: MiCA 70 str. 1 d.' })).toHaveAttribute('href', `/corpus/${f.ID.mica}?unit=${f.ID.micaV1Art70Par1}`);
    expect(screen.getByRole('link', { name: 'Official text (opens in a new window): MiCA 70 str. 1 d.' })).toHaveAttribute('href', micaCitation.url);
  });


  it('shows a plain chip without the act\'s document id, or for a citation without a unit', () => {
    renderPage(<CitationLinks citations={[micaCitation, { path: '75 str.', documentTitle: 'MiCA' }]} documentId={null} />);
    expect(screen.queryByRole('link', { name: /^Open the provision/ })).toBeNull();
    expect(screen.getByText('MiCA 70 str. 1 d.')).toBeInTheDocument();
    expect(screen.getByText('MiCA 75 str.')).toBeInTheDocument();
    // The official text still links
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });


  it('labels a citation without an act title by its path alone, and lists repeated citations without a clash', () => {
    renderPage(<CitationLinks citations={[{ unitId: f.ID.micaArt59, path: '59 str.' }, { unitId: f.ID.micaArt59, path: '59 str.' }]} documentId={f.ID.mica} />);
    expect(screen.getAllByRole('link', { name: 'Open the provision in the corpus: 59 str.' })).toHaveLength(2);
  });


  it('a passage of a company document — the criterion of an own requirement — opens that document at the quote, and links to no law', async () => {
    const passage = OWN.findings.find((row) => row.id === f.ID.findingOwnReports).citations[0];
    expect(Number.isInteger(passage.start)).toBe(true);
    const opened = vi.fn();
    const { user } = renderPage(<CitationLinks citations={[passage]} documentId={null} onOpenDocument={opened} />);
    await user.click(screen.getByRole('button', { name: 'Open the document at the cited passage: Atitikties politika 7.2 p.' }));
    expect(opened).toHaveBeenCalledTimes(1);
    // Named as the criterion: the drawer must not call the requirement itself evidence
    expect(opened).toHaveBeenCalledWith(f.ID.policyDoc, { charStart: passage.start, quote: passage.quote, criterion: true });
    expect(screen.queryByRole('link')).toBeNull();
  });


  it('such a passage is plain text when its quote has no place in the document, or when nothing can open documents', () => {
    const placed = OWN.findings.find((row) => row.id === f.ID.findingOwnReports).citations[0];
    const unplaced = OWN.findings.find((row) => row.id === f.ID.findingOwnScope).citations[0];
    expect(unplaced.start).toBeNull();
    const view = renderPage(<CitationLinks citations={[unplaced]} documentId={null} onOpenDocument={vi.fn()} />);
    expect(screen.getByText('Atitikties politika 2 p.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    view.unmount();
    renderPage(<CitationLinks citations={[placed]} documentId={null} />);
    expect(screen.getByText('Atitikties politika 7.2 p.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });


  it('a citation of the law stays a link to the law when documents can be opened too', () => {
    renderPage(<CitationLinks citations={[micaCitation]} documentId={f.ID.mica} onOpenDocument={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Open the provision in the corpus: MiCA 70 str. 1 d.' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });


  it('speaks Lithuanian', () => {
    renderPage(<CitationLinks citations={[micaCitation]} documentId={f.ID.mica} />, { locale: 'lt' });
    expect(screen.getByRole('link', { name: 'Atidaryti nuostatą bazėje: MiCA 70 str. 1 d.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Oficialus tekstas (atsidaro naujame lange): MiCA 70 str. 1 d.' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// ReportProgress
// -----------------------------------------------------------

describe('ReportProgress', () => {

  const card = () => screen.getByRole('region', { name: 'Compliance analysis in progress' });
  const steps = () => within(card()).getAllByRole('listitem').map((li) => li.textContent);
  const overall = () => within(card()).getByRole('progressbar', { name: 'Compliance analysis in progress' });


  it('ticks the elapsed time every second from the start of the run', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(f.NOW));
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    // Started 09:40:03, the clock stands at 10:00:00
    expect(within(card()).getByText('Elapsed: 19 min 57 s')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(within(card()).getByText('Elapsed: 19 min 58 s')).toBeInTheDocument();
    vi.useRealTimers();
  });


  it('counts from the creation when the run has not started', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-09-27T10:00:05+00:00'));
    renderPage(<ReportProgress report={f.report(f.ID.newReport)} action={null} />);
    expect(within(card()).getByText('Elapsed: 5 s')).toBeInTheDocument();
    vi.useRealTimers();
  });


  it('the second part of a reviewed report: the steps before the approval are done whatever its new job knows, and the clock starts at the approval', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(f.NOW));
    // Approved at 09:58:15 after waiting since 09:52; its second
    // job (the queued one a start hands out) has no step yet
    const second = {
      ...f.report(f.ID.reportWaiting), status: 'running', jobId: f.ID.newReportJob, jobStatus: 'running',
      progress: { step: 'obligations', percent: null, message: null },
      scopeApprovedBy: f.ID.admin, scopeApprovedByName: f.me.displayName, scopeApprovedAt: '2026-09-27T09:58:15+00:00',
    };
    renderPage(<ReportProgress report={second} action={null} />);
    expect(within(card()).getByText('Elapsed: 1 min 45 s')).toBeInTheDocument();
    expect(steps()).toEqual(['Company profileDone', 'Document inventoryDone', 'Citation auditDone', 'Applicability of actsDone', 'Obligation selectionRunning', 'Gap analysis', 'Action plan', 'Summary']);
    // Four of eight done, the fifth without a percentage
    expect(overall()).toHaveAttribute('aria-valuenow', '50');
    vi.useRealTimers();
    await settle(50);
    expect(steps().slice(0, 4)).toEqual(['Company profileDone', 'Document inventoryDone', 'Citation auditDone', 'Applicability of actsDone']);
  });


  it('a run without the review stamps its own approval mid-way — its clock still counts from the start', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(f.NOW));
    renderPage(<ReportProgress report={{ ...RUNNING, scopeApprovedAt: '2026-09-27T09:42:00+00:00' }} action={null} />);
    expect(within(card()).getByText('Elapsed: 19 min 57 s')).toBeInTheDocument();
    vi.useRealTimers();
  });


  it('puts the page\'s action (the stop button) in the card header', () => {
    renderPage(<ReportProgress report={RUNNING} action={<button type="button">Stop it</button>} />);
    expect(within(card()).getByRole('button', { name: 'Stop it' })).toBeInTheDocument();
  });


  it('says the progress in words — the extraction of an act, a message it does not know, no percent when none', () => {
    const views = [
      [{ step: 'obligations', percent: null, message: 'extracting MiCA' }, 'Obligation selection — extracting obligations: MiCA'],
      [{ step: 'gap_analysis', percent: 80, message: 'retrying batch 4' }, 'Gap analysis — retrying batch 4 (80%)'],
      [{ step: 'summary', percent: 50, message: null }, 'Summary (50%)'],
      [{ step: null, percent: null, message: 're-queued after a worker stopped' }, 're-queued after a worker stopped'],
    ];
    for (const [progress, text] of views) {
      const view = renderPage(<ReportProgress report={{ ...RUNNING, progress }} action={null} />);
      expect(within(card()).getByText(text), text).toBeInTheDocument();
      view.unmount();
    }
  });


  it('marks a failed step as failed', async () => {
    const failed = f.job(f.ID.jobReportFailed);
    given.json('get', '/api/jobs/:jobId', { ...failed, status: 'running' });
    renderPage(<ReportProgress report={{ ...f.report(f.ID.reportFailed), status: 'running' }} action={null} />);
    // Name, state, then the model and cost of a step that made
    // calls — the failing one's too — and the duration; that run
    // predates the citation audit, whose step it never reached
    await waitFor(() => expect(steps()[5]).toBe(`Gap analysisFailed${TERRA} · $0.08242 min 8 s`));
    expect(steps().slice(0, 5)).toEqual(['Company profileDone1 s', `Document inventoryDone${TERRA} · $0.138648 s`,
      'Citation audit', `Applicability of actsDone${GPT} · $0.16239 s`, 'Obligation selectionDone1 s']);
  });


  it('sums what the finished steps\' model calls cost so far — the running step joins once it ends', async () => {
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    // The applicability step's one call; the running gap
    // analysis has spent too, but its usage is recorded at its end
    expect(await within(card()).findByText('AI cost so far: $0.144')).toBeInTheDocument();
    expect(steps()[3]).toBe(`Applicability of actsDone${GPT} · $0.1441 min 26 s`);
    expect(steps()[5]).toBe('Gap analysisRunning');
    // The audit found nothing to judge: done at once, no cost
    expect(steps()[2]).toBe('Citation auditDone< 1 s');
  });


  it('names no model or cost for a step without calls, and no sum before any step made one', async () => {
    const running = f.job(f.ID.jobReportRunning);
    given.json('get', '/api/jobs/:jobId', { ...running, steps: running.steps.map((step) => ({ ...step, model: null, usage: {} })) });
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    await waitFor(() => expect(steps()[3]).toBe('Applicability of actsDone1 min 26 s'));
    expect(within(card()).queryByText(/AI cost so far/)).toBeNull();
  });


  it('another user\'s run (the job is a 404): says the steps are hidden, and the bar still follows the report\'s own progress', async () => {
    given.apiError('get', '/api/jobs/:jobId', 'NOT_FOUND', { status: 404 });
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    expect(await within(card()).findByText('The step progress is visible to the user who started the analysis.')).toBeInTheDocument();
    expect(within(card()).queryByRole('alert')).toBeNull();
    // gap_analysis is the sixth step, a third done: (5 + 0.33) / 8
    expect(overall()).toHaveAttribute('aria-valuenow', '67');
    expect(steps()).toEqual(['Company profileDone', 'Document inventoryDone', 'Citation auditDone', 'Applicability of actsDone', 'Obligation selectionDone', 'Gap analysisRunning', 'Action plan', 'Summary']);
  });


  it('a failed job is shown as the failure it is — not as hidden steps', async () => {
    given.apiError('get', '/api/jobs/:jobId', 'SERVER_ERROR', { status: 500 });
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    expect(await within(card()).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(within(card()).queryByText('The step progress is visible to the user who started the analysis.')).toBeNull();
    expect(overall()).toHaveAttribute('aria-valuenow', '67');
  });


  it('recovers from a failed poll: the next answer brings the steps back and clears the failure', async () => {
    given.sequence('get', '/api/jobs/:jobId', [{ status: 503 }, { body: f.job(f.ID.jobReportRunning) }]);
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    expect(await within(card()).findByRole('alert')).toHaveTextContent('The service is temporarily unavailable. Try again later.');
    await act(async () => { vi.advanceTimersByTime(3000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    vi.useRealTimers();
    await waitFor(() => expect(within(card()).queryByRole('alert')).toBeNull());
    expect(within(card()).getByText('1 min 26 s')).toBeInTheDocument();
  });


  it('asks for no job when the report has none yet, and shows every step pending', async () => {
    const calls = given.capture('get', '/api/jobs/:jobId', {});
    renderPage(<ReportProgress report={{ ...f.report(f.ID.newReport), jobId: null }} action={null} />);
    await settle(50);
    expect(calls).toHaveLength(0);
    expect(steps()).toEqual(['Company profile', 'Document inventory', 'Citation audit', 'Applicability of acts', 'Obligation selection', 'Gap analysis', 'Action plan', 'Summary']);
  });


  it('a run started with the company\'s own requirements lists their step after the gap analysis, and counts it in the bar', async () => {
    given.apiError('get', '/api/jobs/:jobId', 'NOT_FOUND', { status: 404 });
    const own = { ...RUNNING, scope: { ...RUNNING.scope, internal: true } };
    renderPage(<ReportProgress report={own} action={null} />);
    await within(card()).findByText('The step progress is visible to the user who started the analysis.');
    expect(steps()).toEqual(['Company profileDone', 'Document inventoryDone', 'Citation auditDone', 'Applicability of actsDone', 'Obligation selectionDone',
      'Gap analysisRunning', 'Assessing the company\'s own requirements', 'Action plan', 'Summary']);
    // Nine steps now: (5 + 0.33) / 9
    expect(overall()).toHaveAttribute('aria-valuenow', '59');
  });


  it('while that step runs it says which policy is being read, then how far the judging is', () => {
    const own = { ...RUNNING, scope: { ...RUNNING.scope, internal: true } };
    const views = [
      [{ step: 'internal', percent: null, message: 'reading Atitikties politika' }, 'Assessing the company\'s own requirements — reading the document: Atitikties politika'],
      [{ step: 'internal', percent: 50, message: '1/2 batches' }, 'Assessing the company\'s own requirements — 1 of 2 batches (50%)'],
    ];
    for (const [progress, line] of views) {
      const view = renderPage(<ReportProgress report={{ ...own, progress, jobId: null }} action={null} />);
      expect(within(card()).getByText(line), line).toBeInTheDocument();
      expect(steps()[6]).toBe('Assessing the company\'s own requirementsRunning');
      expect(steps().slice(0, 6).every((step) => step.endsWith('Done'))).toBe(true);
      view.unmount();
    }
  });


  it('a run without them never lists that step — the bar would wait for it to the end', async () => {
    renderPage(<ReportProgress report={{ ...f.report(f.ID.newReport), jobId: null }} action={null} />);
    expect(steps()).toHaveLength(8);
    expect(steps()).not.toContain('Assessing the company\'s own requirements');
  });


  it('names the step in Lithuanian', () => {
    const own = { ...RUNNING, jobId: null, scope: { ...RUNNING.scope, internal: true }, progress: { step: 'internal', percent: null, message: 'reading Atitikties politika' } };
    renderPage(<ReportProgress report={own} action={null} />, { locale: 'lt' });
    const lt = screen.getByRole('region', { name: 'Vyksta atitikties analizė' });
    expect(within(lt).getByText('Vidaus reikalavimų vertinimas — skaitomas dokumentas: Atitikties politika')).toBeInTheDocument();
    expect(within(lt).getAllByRole('listitem')[6]).toHaveTextContent('Vidaus reikalavimų vertinimasVykdoma');
  });


  it('notes a requested cancel as a status, not an alarm', async () => {
    given.json('get', '/api/jobs/:jobId', { ...f.job(f.ID.jobReportRunning), cancelRequested: true });
    renderPage(<ReportProgress report={RUNNING} action={null} />);
    expect(await within(card()).findByRole('status')).toHaveTextContent('Cancellation requested — the analysis stops at its next step.');
    expect(within(card()).queryByRole('alert')).toBeNull();
  });


  it('speaks Lithuanian: the sentence, the progress in words, the steps and the hidden-steps note', async () => {
    given.apiError('get', '/api/jobs/:jobId', 'NOT_FOUND', { status: 404 });
    renderPage(<ReportProgress report={RUNNING} action={null} />, { locale: 'lt' });
    const lt = screen.getByRole('region', { name: 'Vyksta atitikties analizė' });
    expect(within(lt).getByText('Puslapį galite palikti — analizė tęsis, rezultatai išsisaugos.')).toBeInTheDocument();
    expect(within(lt).getByText('Atitikties spragų analizė — 1 iš 3 paketų (33 %)')).toBeInTheDocument();
    expect(await within(lt).findByText('Etapų eiga matoma analizę pradėjusiam naudotojui.')).toBeInTheDocument();
    expect(within(lt).getAllByRole('listitem')[2]).toHaveTextContent('Teisės aktų nuorodų patikraAtlikta');
    expect(within(lt).getAllByRole('listitem')[5]).toHaveTextContent('Atitikties spragų analizėVykdoma');
    expect(within(lt).getByRole('heading', { level: 3, name: 'Analizės etapai' })).toBeInTheDocument();
  });


  it('says the cost so far in Lithuanian', async () => {
    renderPage(<ReportProgress report={RUNNING} action={null} />, { locale: 'lt' });
    const lt = screen.getByRole('region', { name: 'Vyksta atitikties analizė' });
    expect(await within(lt).findByText('DI kaina iki šiol: 0,144 USD')).toBeInTheDocument();
    expect(within(lt).getAllByRole('listitem')[3]).toHaveTextContent(`${GPT} · 0,144 USD`);
  });
});







// -----------------------------------------------------------
// FindingStatusIcon
// -----------------------------------------------------------

describe('FindingStatusIcon', () => {

  it('draws one decorative shape per verdict, a question mark for anything else, and passes its props on', () => {
    const shapes = { met: 'CheckCircleOutlineIcon', partial: 'ContrastOutlinedIcon', missing: 'HighlightOffIcon', unknown: 'HelpOutlineIcon', not_applicable: 'DoNotDisturbAltOutlinedIcon', surprise: 'HelpOutlineIcon' };
    renderPage(
      <div>
        {Object.keys(shapes).map((status) => <span key={status} data-status={status}><FindingStatusIcon status={status} fontSize="small" /></span>)}
      </div>,
    );
    for (const [status, testId] of Object.entries(shapes)) {
      const icon = document.querySelector(`[data-status="${status}"] svg`);
      expect(icon, status).toHaveAttribute('data-testid', testId);
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveClass('MuiSvgIcon-fontSizeSmall');
    }
  });
});
