// -----------------------------------------------------------
//  [*] Tests — the approval of a report's list of acts
//      (ReportDetail on a waiting report, ReportScope)
//
//  The report page of an analysis that stopped once the acts
//  that apply were decided and waits for a person, end to end
//  against the backend double: the frame (the status, the
//  banner saying what is asked, the acts tab first in line,
//  no progress card, no exports, nothing polled); the tabs
//  (the citation audit and the frozen profile to read, the
//  tabs of the second part saying it is not there yet, the
//  banner's way back to the acts); the acts in the groups
//  the run put them in, every one with its "assess" switch
//  where the run decided — the folded and the screened-out
//  ones included — and what the price says of each; the
//  price panel (POST …/scope without `approved`, asked at
//  once and again after a pause with only the acts whose
//  switch differs from the run, the one-time reading apart,
//  the budget left and the over-budget note, nothing asked
//  and nothing to approve with every act off, a failed price
//  with its retry); the notes on a switch that goes against
//  the verdict; the selection kept through another tab; the
//  approval (the same map with approved: true, the toast,
//  the page turning to the running report, the lists
//  refreshed) and its refusals (NOTHING_TO_ASSESS and
//  BUDGET_EXCEEDED said in the panel, NOT_WAITING reading
//  the report again); cancelling in its own words; a
//  finished report made this way (the two groups, the
//  approval line); Lithuanian; and the contract matrices for
//  the waiting report's GET and for the price's POST.
//  And for a report started with the company's own
//  requirements: their part of the price as a line of its
//  own, counted against the budget; and the row they hang on,
//  should the list hold it — shown apart, without a switch,
//  never among the acts counted or named.
//
//  The groups and the approval line of a finished report are
//  covered piece by piece in report-parts.test.jsx; the
//  start dialog's review box in start-analysis.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, makeQueryClient } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import ReportDetail from '@/pages/Reports/ReportDetail';


// UAB Pavyzdys' analysis that waits for its list of acts, and
// its acts by the names their cards and switches carry
const WAITING = f.report(f.ID.reportWaiting);
const ACT = Object.fromEntries(WAITING.acts.map((row) => [row.shortTitle, row]));

// The same report once its list was approved as it stood: the
// approval's answer, and what the next read finds
const QUEUED = {
  ...WAITING, status: 'queued', jobId: f.ID.newReportJob, jobStatus: 'queued', progress: {},
  scopeApprovedBy: f.me.id, scopeApprovedByName: f.me.displayName, scopeApprovedAt: f.NOW,
};

// A finished report made this way: Jonas approved the list,
// taking the consumer credit law in as good practice and
// leaving DORA out
const DONE = f.report(f.ID.reportDone);
const FINISHED = {
  ...DONE,
  scope: { ...DONE.scope, review: true },
  scopeApprovedBy: f.ID.jonas, scopeApprovedByName: f.user(f.ID.jonas).displayName, scopeApprovedAt: '2026-09-21T09:20:00+00:00',
  acts: DONE.acts.map((row) => {
    if (row.shortTitle === 'VKĮ') return { ...row, assessment: 'assessed', screenedOut: false };
    if (row.shortTitle === 'DORA') return { ...row, assessment: 'none' };
    return row;
  }),
};

// The sentences the price panel says of the run's own plan:
// DORA 2, MiCA 327 (to be read first), PPTFPĮ 2, the AI Act 1
const PLAN = {
  acts: 'Acts to assess: 4',
  obligations: 'Obligations in all: ~332',
  price: 'Upper-bound cost of the assessment: ~$5.55',
  reading: 'Of which ~$3.46 is the one-time reading of acts (their obligations are extracted for the first time).',
};

const APPROVE = 'Approve and continue';
const CANCEL = 'Cancel the analysis';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderWaiting: the page on its real route pattern, opened
// on the waiting report. ready: the page once the price of
// the run's plan landed. main: the content landmark. card:
// an act's card by its short title. toggle: an act's switch
// (named after its act). openGroup: a folded group's header
// — its cards are hidden until it is opened. scopeCalls:
// every POST …/scope the page sends, the default handler
// still answering. refuseApproval: the approval answers a
// refusal while the dry run keeps answering the price.
// priceOf: the dry-run body for a set of choices.
// -----------------------------------------------------------

function renderWaiting({ id = f.ID.reportWaiting, search = '', ...options } = {}) {
  return renderPage(<ReportDetail authData={authData} />, { route: `/reports/${id}${search}`, path: '/reports/:reportId', ...options });
}

const main = () => screen.getByRole('main');

const ready = () => screen.findByText(PLAN.obligations);

const card = (shortTitle) => screen.getByRole('heading', { level: 3, name: new RegExp(`^${shortTitle} — `) }).closest('.MuiPaper-root');

const toggle = (shortTitle) => screen.getByRole('switch', { name: `Assess: ${shortTitle}` });

const openGroup = (user, name) => user.click(screen.getByRole('button', { name }));

const scopeCalls = () => given.spy('post', '/api/reports/:reportId/scope');

const priceOf = (choices = {}) => f.scopeEstimate(f.ID.reportWaiting, choices);

function refuseApproval(code, status) {
  const approvals = [];
  server.use(http.post(url('/api/reports/:reportId/scope'), async ({ request }) => {
    const body = await request.clone().json();
    if (!body.approved) return undefined;
    approvals.push(body);
    return HttpResponse.json(apiError(code), { status });
  }));
  return approvals;
}

async function statusWith(text) {
  let found;
  await waitFor(() => {
    found = screen.getAllByRole('status').find((element) => element.textContent.includes(text));
    expect(found).toBeTruthy();
  });
  return found;
}







// -----------------------------------------------------------
// The frame
// -----------------------------------------------------------

describe('a report waiting for its list of acts — the frame', () => {

  it('says what happened and what is asked, under the waiting status — a status, not an alarm', async () => {
    renderWaiting();
    expect(await within(main()).findByRole('heading', { level: 1, name: 'Report, 27/09/2026' })).toBeInTheDocument();
    expect(within(main()).getByText('Awaiting scope approval', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(main()).getByText('Report language: Lithuanian · Started 27/09/2026, 09:50')).toBeInTheDocument();
    const banner = await statusWith('Approve the list of legal acts');
    expect(banner).toHaveTextContent('The acts that apply have been decided. Review the list and approve it — the obligations are judged only after that.');
    await ready();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('opens on the acts tab of six — the findings tab counts nothing yet', async () => {
    renderWaiting();
    const tablist = await screen.findByRole('tablist', { name: 'Report sections' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Summary', 'Legal acts', 'Findings', 'Citations (6)', 'Action plan', 'Analysis data']);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Legal acts' })).toBeInTheDocument();
    await ready();
  });


  it('shows no progress card, no exports and no sign-off — and the report can be deleted, nothing is running', async () => {
    const { user } = renderWaiting();
    await ready();
    expect(screen.queryByRole('region', { name: 'Compliance analysis in progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop the analysis' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download the report as PDF' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve the report' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More report actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Delete the report' })).not.toHaveAttribute('aria-disabled');
  });


  it('polls nothing while it waits — neither the report nor a job', async () => {
    const reportCalls = given.capture('get', '/api/reports/:reportId', WAITING);
    const jobCalls = given.capture('get', '/api/jobs/:jobId', f.job(f.ID.jobReportWaiting));
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    renderWaiting();
    await ready();
    await act(async () => { vi.advanceTimersByTime(12000); });
    vi.useRealTimers();
    await settle(50);
    expect(reportCalls).toHaveLength(1);
    expect(jobCalls).toHaveLength(0);
  });


  it('keeps the tab of the address — and its own default once the report is past the approval', async () => {
    const view = renderWaiting({ search: '?tab=profile' });
    expect(await screen.findByRole('tab', { name: 'Analysis data', selected: true })).toBeInTheDocument();
    view.unmount();

    given.json('get', '/api/reports/:reportId', FINISHED);
    renderWaiting({ id: f.ID.reportDone });
    expect(await screen.findByRole('tab', { name: 'Summary', selected: true })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The tabs
// -----------------------------------------------------------

describe('a report waiting for its list of acts — the other tabs', () => {

  it('the tabs of the second part say it is not there yet — no zeros, no "nothing found"', async () => {
    const { user } = renderWaiting();
    await ready();
    for (const name of ['Summary', 'Findings', 'Action plan']) {
      await user.click(screen.getByRole('tab', { name }));
      const panel = screen.getByRole('tabpanel', { name });
      expect(within(panel).getByText('Nothing here yet')).toBeInTheDocument();
      expect(within(panel).getByText('The findings, the action plan and the summary are produced once you approve the list of legal acts.')).toBeInTheDocument();
      // Not what an empty result of a finished report would say
      for (const text of ['No summary.', 'No findings.', 'The action plan is empty — no open obligations were found.']) {
        expect(within(panel).queryByText(text), text).toBeNull();
      }
    }
  });


  it('the citation audit and the frozen profile are there to read', async () => {
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('tab', { name: 'Citations (6)' }));
    expect(within(screen.getByRole('tabpanel', { name: 'Citations (6)' })).queryByText('Nothing here yet')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Analysis data' }));
    const panel = screen.getByRole('tabpanel', { name: 'Analysis data' });
    expect(within(panel).getByRole('heading', { name: 'Company data at the time of the analysis' })).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'Scope of the analysis' })).toHaveTextContent('All applicable legal acts');
  });


  it('on another tab the banner leads back to the list of acts, and the keyboard focus follows to its tab', async () => {
    const { user, router } = renderWaiting({ search: '?tab=profile' });
    const banner = await statusWith('Approve the list of legal acts');
    await user.click(within(banner).getByRole('button', { name: 'Show the list of acts' }));
    const tab = await screen.findByRole('tab', { name: 'Legal acts', selected: true });
    expect(router.state.location.search).toBe('?tab=acts');
    await waitFor(() => expect(tab).toHaveFocus());
    // On the acts tab there is nowhere to lead
    expect(within(await statusWith('Approve the list of legal acts')).queryByRole('button', { name: 'Show the list of acts' })).toBeNull();
    await ready();
  });
});







// -----------------------------------------------------------
// The acts and their switches
// -----------------------------------------------------------

describe('a report waiting for its list of acts — the switches', () => {

  it('keeps the run\'s groups, with the verdict, the reasoning and the questions a person decides by', async () => {
    renderWaiting();
    await ready();
    const titles = (name) => within(screen.getByRole('region', { name })).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.split(' — ')[0]);
    expect(titles('Acts assessed')).toEqual(['DORA', 'MiCA', 'PPTFPĮ']);
    expect(titles('Applying later — readiness assessed')).toEqual(['DI aktas']);
    expect(titles('Applicability to confirm — not assessed')).toEqual(['EPĮ']);
    expect(screen.getByRole('button', { name: 'Directives — applied through national law (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Judged not applicable by the AI (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Screened out by the catalogue (1)' })).toHaveAttribute('aria-expanded', 'false');

    expect(within(card('DORA')).getByText('Applies')).toBeInTheDocument();
    expect(within(card('DORA')).getByText('Confidence 92%')).toBeInTheDocument();
    expect(within(card('DORA')).getByText(ACT.DORA.reasoning)).toBeInTheDocument();
    expect(within(card('DI aktas')).getByText('Applies from 02/08/2027')).toBeInTheDocument();
    expect(within(card('EPĮ')).getByText('To be confirmed')).toBeInTheDocument();
    expect(within(card('EPĮ')).getByText('Questions to answer')).toBeInTheDocument();
    expect(within(card('EPĮ')).getByText(ACT['EPĮ'].conditionsToVerify)).toBeInTheDocument();
  });


  it('gives every act a switch: on for what the run would assess, off for the rest — the folded and the screened-out ones too', async () => {
    const { user } = renderWaiting();
    await ready();
    for (const name of ['DORA', 'MiCA', 'PPTFPĮ', 'DI aktas']) expect(toggle(name), name).toBeChecked();
    expect(toggle('EPĮ')).not.toBeChecked();
    await openGroup(user, 'Directives — applied through national law (1)');
    expect(toggle('AMLD6')).not.toBeChecked();
    await openGroup(user, 'Judged not applicable by the AI (1)');
    expect(toggle('MĮ')).not.toBeChecked();
    await openGroup(user, 'Screened out by the catalogue (1)');
    expect(toggle('VKĮ')).not.toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(WAITING.acts.length);
    // No note while every switch stands where the run decided
    expect(screen.queryByText(/good practice/)).toBeNull();
    expect(screen.queryByText(/will not be assessed in this report/)).toBeNull();
  });


  it('says of every act switched on how many obligations would be judged — or that the act is read for the first time', async () => {
    renderWaiting();
    await ready();
    expect(within(card('DORA')).getByText('Obligations: 2')).toBeInTheDocument();
    expect(within(card('PPTFPĮ')).getByText('Obligations: 2')).toBeInTheDocument();
    expect(within(card('DI aktas')).getByText('Obligations: 1')).toBeInTheDocument();
    expect(within(card('MiCA')).getByText('Will be read for the first time')).toBeInTheDocument();
    expect(within(card('MiCA')).queryByText(/^Obligations:/)).toBeNull();
    // An act that is off is priced nothing
    expect(within(card('EPĮ')).queryByText(/^Obligations:/)).toBeNull();
    expect(within(card('EPĮ')).queryByText('Will be read for the first time')).toBeNull();
  });


  it('an act that does not bind the company, switched on, will be assessed as good practice', async () => {
    const { user } = renderWaiting();
    await ready();
    await openGroup(user, 'Screened out by the catalogue (1)');
    await user.click(toggle('VKĮ'));
    expect(toggle('VKĮ')).toBeChecked();
    expect(within(card('VKĮ')).getByText('Will be assessed as good practice — this act does not bind the company')).toBeInTheDocument();
    // It stays in the group the run put it in
    expect(screen.getByRole('button', { name: 'Screened out by the catalogue (1)' })).toBeInTheDocument();
    // …and is priced on all of its obligations
    expect(await within(card('VKĮ')).findByText('Obligations: 1')).toBeInTheDocument();

    await openGroup(user, 'Judged not applicable by the AI (1)');
    await user.click(toggle('MĮ'));
    expect(within(card('MĮ')).getByText('Will be assessed as good practice — this act does not bind the company')).toBeInTheDocument();
  });


  it('an act that applies, switched off, says it will not be assessed in this report', async () => {
    const { user } = renderWaiting();
    await ready();
    await user.click(toggle('DORA'));
    expect(toggle('DORA')).not.toBeChecked();
    expect(within(card('DORA')).getByText('Applies, but will not be assessed in this report')).toBeInTheDocument();
    expect(within(card('DORA')).queryByText(/^Obligations:/)).toBeNull();
    // Back on: the note goes
    await user.click(toggle('DORA'));
    expect(within(card('DORA')).queryByText('Applies, but will not be assessed in this report')).toBeNull();
  });


  it('an act waiting for facts or a directive, switched on, needs no note — and a directive left off was never "switched off"', async () => {
    const { user } = renderWaiting();
    await ready();
    await user.click(toggle('EPĮ'));
    expect(toggle('EPĮ')).toBeChecked();
    await openGroup(user, 'Directives — applied through national law (1)');
    expect(within(card('AMLD6')).queryByText('Applies, but will not be assessed in this report')).toBeNull();
    await user.click(toggle('AMLD6'));
    expect(toggle('AMLD6')).toBeChecked();
    expect(screen.queryByText(/good practice/)).toBeNull();
    expect(screen.queryByText(/will not be assessed in this report/)).toBeNull();
  });


  it('keeps a half-made selection through a look at another tab', async () => {
    const { user } = renderWaiting();
    await ready();
    await user.click(toggle('DORA'));
    await user.click(screen.getByRole('tab', { name: 'Analysis data' }));
    await user.click(screen.getByRole('tab', { name: 'Legal acts' }));
    expect(toggle('DORA')).not.toBeChecked();
    expect(toggle('MiCA')).toBeChecked();
    expect(await screen.findByText('Acts to assess: 3')).toBeInTheDocument();
  });


  it('the row of the company\'s own requirements, should the list hold it, is shown apart and never with a switch — nor counted or named among the acts', async () => {
    const own = f.report(f.ID.reportOwn).acts.find((row) => row.docType === 'internal');
    given.json('get', '/api/reports/:reportId', { ...WAITING, scope: { ...WAITING.scope, internal: true }, acts: [...WAITING.acts, own] });
    const calls = scopeCalls();
    const { user } = renderWaiting();
    await ready();
    const group = screen.getByRole('region', { name: 'Own requirements' });
    expect(within(group).getByText(/^Įmonės politikos lygmens dokumentų nustatyti reikalavimai/)).toBeInTheDocument();
    expect(within(group).queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('switch', { name: /Vidaus reikalavimai/ })).toBeNull();
    // Four acts are on, as without the row
    expect(screen.getByText(PLAN.acts)).toBeInTheDocument();
    await user.click(toggle('DORA'));
    expect(await screen.findByText('Acts to assess: 3')).toBeInTheDocument();
    await waitFor(() => expect(calls.at(-1).body).toEqual({ acts: { [ACT.DORA.id]: 'skip' } }));
  });


  it('an act the answer gave no id is listed without a switch — it cannot be named to the backend', async () => {
    given.json('get', '/api/reports/:reportId', { ...WAITING, acts: WAITING.acts.map((row) => (row.shortTitle === 'EPĮ' ? { ...row, id: null } : row)) });
    renderWaiting();
    await ready();
    expect(card('EPĮ')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Assess: EPĮ' })).toBeNull();
    expect(toggle('DORA')).toBeChecked();
  });
});







// -----------------------------------------------------------
// The price
// -----------------------------------------------------------

describe('a report waiting for its list of acts — the price', () => {

  it('prices the run\'s own plan at once: the acts, the obligations, the upper bound with the one-time reading apart, the budget', async () => {
    const calls = scopeCalls();
    renderWaiting();
    await ready();
    const panel = screen.getByRole('region', { name: 'Scope and price of the assessment' });
    expect(within(panel).getByText(PLAN.acts)).toBeInTheDocument();
    expect(within(panel).getByText(PLAN.obligations)).toBeInTheDocument();
    expect(within(panel).getByText(PLAN.price)).toBeInTheDocument();
    expect(within(panel).getByText(PLAN.reading)).toBeInTheDocument();
    expect(within(panel).getByText('Your daily AI budget is unlimited.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: APPROVE })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: CANCEL })).toBeEnabled();
    // Nothing differs from the run yet, nothing is stored
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(`/api/reports/${f.ID.reportWaiting}/scope`);
    expect(calls[0].body).toEqual({ acts: {} });
  });


  it('says "Working out the price…" while the first price is on the wire', async () => {
    given.hang('post', '/api/reports/:reportId/scope');
    renderWaiting();
    const panel = await screen.findByRole('region', { name: 'Scope and price of the assessment' });
    expect(await within(panel).findByText('Working out the price…')).toBeInTheDocument();
    expect(within(panel).getByText(PLAN.acts)).toBeInTheDocument();
    expect(within(panel).getByRole('progressbar', { name: 'Working out the price…' })).toBeInTheDocument();
  });


  it('a switch asks for the price again, after a pause, naming only the act that differs from the run', async () => {
    const calls = scopeCalls();
    const { user } = renderWaiting();
    await ready();
    await user.click(toggle('DORA'));
    // The count follows the switch at once; the price a moment later
    expect(screen.getByText('Acts to assess: 3')).toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).toEqual({ acts: { [ACT.DORA.id]: 'skip' } });
    expect(await screen.findByText('Obligations in all: ~330')).toBeInTheDocument();
    expect(screen.getByText('Upper-bound cost of the assessment: ~$5.54')).toBeInTheDocument();
  });


  it('names an act taken in as "assess", and leaves the reading line out once no act is read for the first time', async () => {
    const calls = scopeCalls();
    const { user } = renderWaiting();
    await ready();
    await openGroup(user, 'Screened out by the catalogue (1)');
    await user.click(toggle('VKĮ'));
    await waitFor(() => expect(calls.at(-1).body).toEqual({ acts: { [ACT['VKĮ'].id]: 'assess' } }));
    expect(await screen.findByText('Obligations in all: ~333')).toBeInTheDocument();
    expect(screen.getByText('Acts to assess: 5')).toBeInTheDocument();
    expect(screen.getByText(PLAN.reading)).toBeInTheDocument();

    await user.click(toggle('MiCA'));
    await waitFor(() => expect(calls.at(-1).body).toEqual({ acts: { [ACT.MiCA.id]: 'skip', [ACT['VKĮ'].id]: 'assess' } }));
    expect(await screen.findByText('Obligations in all: ~6')).toBeInTheDocument();
    expect(screen.getByText('Upper-bound cost of the assessment: ~$0.14')).toBeInTheDocument();
    expect(screen.queryByText(/one-time reading/)).toBeNull();
  });


  it('a run of clicks asks once, with all of them', async () => {
    const calls = scopeCalls();
    renderWaiting();
    await ready();
    // Both switches within the pause
    act(() => { toggle('DORA').click(); toggle('PPTFPĮ').click(); });
    await waitFor(() => expect(calls).toHaveLength(2));
    await settle(600);
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual({ acts: { [ACT.DORA.id]: 'skip', [ACT['PPTFPĮ'].id]: 'skip' } });
  });


  it('a switch put back where the run had it is no longer named — the plan is priced as it was', async () => {
    const calls = scopeCalls();
    const { user } = renderWaiting();
    await ready();
    await user.click(toggle('DORA'));
    await screen.findByText('Obligations in all: ~330');
    await user.click(toggle('DORA'));
    expect(await screen.findByText(PLAN.obligations)).toBeInTheDocument();
    expect(screen.getByText(PLAN.price)).toBeInTheDocument();
    await settle(600);
    // Whether the plan's price is asked again is the cache's
    // business (this client keeps nothing); what is asked names
    // no act
    expect(calls.slice(0, 2).map((call) => call.body)).toEqual([{ acts: {} }, { acts: { [ACT.DORA.id]: 'skip' } }]);
    expect(calls.slice(2).map((call) => call.body)).toEqual(calls.slice(2).map(() => ({ acts: {} })));
  });


  it('with every act off there is nothing to price and nothing to approve', async () => {
    const calls = scopeCalls();
    renderWaiting();
    await ready();
    act(() => { for (const name of ['DORA', 'MiCA', 'PPTFPĮ', 'DI aktas']) toggle(name).click(); });
    expect(screen.getByText('Acts to assess: 0')).toBeInTheDocument();
    expect(screen.getByText('No act is switched on — there is nothing to assess.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: APPROVE })).toBeDisabled();
    expect(screen.queryByText(PLAN.price)).toBeNull();
    await settle(600);
    expect(calls).toHaveLength(1);
    // One act back on: priced and approvable again
    act(() => { toggle('PPTFPĮ').click(); });
    expect(screen.getByRole('button', { name: APPROVE })).toBeEnabled();
    expect(await screen.findByText('Obligations in all: ~2')).toBeInTheDocument();
  });


  it('shows a plain user\'s budget left, and notes when the assessment alone exceeds it — the reading is not theirs to pay', async () => {
    const plan = priceOf();
    given.json('post', '/api/reports/:reportId/scope', { ...plan, budget: { limit: 5, used: 2.5, remaining: 2.5, unit: 'USD' } });
    const view = renderWaiting();
    await ready();
    // The assessment ($2.09) fits, though the total ($5.55) would not
    expect(plan.estimate.analysisUsd).toBeLessThan(2.5);
    expect(screen.getByText('Your remaining AI budget today: $2.50.')).toBeInTheDocument();
    expect(screen.queryByText(/exceeds your remaining daily budget/)).toBeNull();
    view.unmount();

    given.json('post', '/api/reports/:reportId/scope', { ...plan, budget: { limit: 5, used: 4, remaining: 1, unit: 'USD' } });
    renderWaiting();
    await ready();
    expect(await statusWith('The estimate exceeds your remaining daily budget.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: APPROVE })).toBeEnabled();
  });


  it('a report started with the company\'s own requirements: their part of the price is a line of its own, and the parts add up to the total', async () => {
    const plan = f.scopeEstimate(f.ID.reportWaiting, {}, true);
    given.json('post', '/api/reports/:reportId/scope', plan);
    renderWaiting();
    await ready();
    const panel = screen.getByRole('region', { name: 'Scope and price of the assessment' });
    // The plan's $5.55 and $0.21 for the one policy to read and judge
    expect(plan.estimate.totalUsd).toBe(Math.round((plan.estimate.analysisUsd + plan.estimate.extractionUsd + plan.estimate.internal.usd) * 100) / 100);
    expect(within(panel).getByText('Upper-bound cost of the assessment: ~$5.76')).toBeInTheDocument();
    expect(within(panel).getByText(PLAN.reading)).toBeInTheDocument();
    expect(within(panel).getByText('Of which ~$0.21 is the assessment of the company\'s own requirements (policy-level documents: 1, requirements: ~8).')).toBeInTheDocument();
    // It is no act: the acts and the obligations are the plan's
    expect(within(panel).getByText(PLAN.acts)).toBeInTheDocument();
    expect(within(panel).getByText(PLAN.obligations)).toBeInTheDocument();
  });


  it('that part is the user\'s own: with it the assessment may exceed a budget the acts alone fit', async () => {
    const plan = f.scopeEstimate(f.ID.reportWaiting, {}, true);
    // $2.09 of assessment fits $2.20; with $0.21 more it does not
    given.json('post', '/api/reports/:reportId/scope', { ...plan, budget: { limit: 5, used: 2.8, remaining: 2.2, unit: 'USD' } });
    renderWaiting();
    await ready();
    expect(plan.estimate.analysisUsd).toBeLessThan(2.2);
    expect(await statusWith('The estimate exceeds your remaining daily budget.')).toBeInTheDocument();
  });


  it('a plan without them says nothing of them', async () => {
    renderWaiting();
    await ready();
    expect(screen.queryByText(/company's own requirements/)).toBeNull();
  });


  it('a price that failed says so with a retry — approving stays possible — and the retry brings it', async () => {
    given.sequence('post', '/api/reports/:reportId/scope', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: priceOf() }]);
    const { user } = renderWaiting();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The price could not be worked out');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.getByRole('button', { name: APPROVE })).toBeEnabled();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await ready()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a price refused because the report waits no more reads the report again — the page shows what it became', async () => {
    given.apiError('post', '/api/reports/:reportId/scope', 'NOT_WAITING', { status: 409 });
    given.sequence('get', '/api/reports/:reportId', [{ body: WAITING }, { body: { ...WAITING, status: 'cancelled', finishedAt: f.NOW } }]);
    renderWaiting();
    expect(await statusWith('The analysis was cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});







// -----------------------------------------------------------
// Approving
// -----------------------------------------------------------

describe('a report waiting for its list of acts — approving', () => {

  it('approves the run\'s own plan: POSTs an empty map with approved: true, toasts, and the page shows the report running', async () => {
    const calls = scopeCalls();
    const client = makeQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { user } = renderWaiting({ client });
    await ready();
    // What the next read of the report finds
    given.json('get', '/api/reports/:reportId', QUEUED);
    await user.click(screen.getByRole('button', { name: APPROVE }));

    expect(await screen.findByText('List of acts approved — the analysis continues')).toBeInTheDocument();
    expect(calls.at(-1).body).toEqual({ acts: {}, approved: true });
    const progress = await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    expect(within(progress).getByText('The analysis is queued — it starts when a worker is free.')).toBeInTheDocument();
    expect(within(main()).getByText('Queued', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: APPROVE })).toBeNull();
    expect(screen.queryByText('Approve the list of legal acts')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop the analysis' })).toBeEnabled();
    // The report is read again, and the lists follow its new status
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['report', f.ID.reportWaiting] });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] }));
    // The first part's steps are behind it
    expect(within(progress).getAllByRole('listitem').slice(0, 4).map((item) => item.textContent))
      .toEqual(['Company profileDone', 'Document inventoryDone', 'Citation auditDone', 'Applicability of actsDone']);
  });


  it('approves a changed list: the map names the acts taken in and left out, and no other', async () => {
    const calls = scopeCalls();
    const { user } = renderWaiting();
    await ready();
    await user.click(toggle('DORA'));
    await openGroup(user, 'Screened out by the catalogue (1)');
    await user.click(toggle('VKĮ'));
    await user.click(toggle('EPĮ'));
    await user.click(toggle('EPĮ'));
    given.json('get', '/api/reports/:reportId', QUEUED);
    await user.click(screen.getByRole('button', { name: APPROVE }));
    await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    const approvals = calls.filter((call) => call.body.approved);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].body).toEqual({ acts: { [ACT.DORA.id]: 'skip', [ACT['VKĮ'].id]: 'assess' }, approved: true });
  });


  it('holds the buttons and the switches while the approval is on the wire — a second click sends nothing', async () => {
    const approvals = [];
    let answer;
    const answered = new Promise((resolve) => { answer = resolve; });
    server.use(http.post(url('/api/reports/:reportId/scope'), async ({ request }) => {
      const body = await request.clone().json();
      if (!body.approved) return undefined;
      approvals.push(body);
      await answered;
      return HttpResponse.json(QUEUED);
    }));
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: APPROVE }));
    await waitFor(() => expect(approvals).toHaveLength(1));
    expect(screen.getByRole('button', { name: APPROVE })).toBeDisabled();
    expect(screen.getByRole('button', { name: CANCEL })).toBeDisabled();
    expect(toggle('DORA')).toBeDisabled();
    given.json('get', '/api/reports/:reportId', QUEUED);
    answer();
    await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    expect(approvals).toHaveLength(1);
  });


  it('400 NOTHING_TO_ASSESS: said in the panel, without a toast — the screen stays', async () => {
    const approvals = refuseApproval('NOTHING_TO_ASSESS', 400);
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: APPROVE }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No legal act is selected — switch at least one on.');
    expect(screen.getAllByText('No legal act is selected — switch at least one on.')).toHaveLength(1);
    expect(approvals).toEqual([{ acts: {}, approved: true }]);
    expect(screen.getByRole('button', { name: APPROVE })).toBeEnabled();
    expect(toggle('DORA')).toBeChecked();
  });


  it('a refusal goes once the selection changes — it was about another one', async () => {
    refuseApproval('NOTHING_TO_ASSESS', 400);
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: APPROVE }));
    await screen.findByRole('alert');
    await user.click(toggle('EPĮ'));
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('429 BUDGET_EXCEEDED: says today\'s budget is spent, in the panel', async () => {
    refuseApproval('BUDGET_EXCEEDED', 429);
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: APPROVE }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Today\'s AI usage budget is spent. Try again tomorrow.');
    expect(screen.getByRole('tab', { name: 'Legal acts', selected: true })).toBeInTheDocument();
  });


  it('409 NOT_WAITING: someone approved it meanwhile — says so and reads the report again, which is running', async () => {
    refuseApproval('NOT_WAITING', 409);
    const { user } = renderWaiting();
    await ready();
    given.json('get', '/api/reports/:reportId', QUEUED);
    await user.click(screen.getByRole('button', { name: APPROVE }));
    // Said in the panel and in a toast that outlives it
    expect((await screen.findAllByText('This report no longer waits for approval — its list of acts was approved already, or the analysis was cancelled.')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('region', { name: 'Compliance analysis in progress' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: APPROVE })).toBeNull();
  });
});







// -----------------------------------------------------------
// Cancelling
// -----------------------------------------------------------

describe('a report waiting for its list of acts — cancelling', () => {

  it('asks first, in its own words, POSTs the cancel, and the page shows the cancelled report', async () => {
    const cancels = given.spy('post', '/api/reports/:reportId/cancel');
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: CANCEL }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel the analysis?' });
    expect(within(dialog).getByText('The list of acts stays unapproved and the obligations are not judged. AI costs already incurred are not refunded.')).toBeInTheDocument();
    // The way out is not another "cancel"
    expect(within(dialog).getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: CANCEL }));
    await waitFor(() => expect(cancels).toHaveLength(1));
    expect(new URL(cancels[0].url).pathname).toBe(`/api/reports/${f.ID.reportWaiting}/cancel`);
    expect(await statusWith('The analysis was cancelled')).toBeInTheDocument();
    expect(within(main()).getByText('Cancelled', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Approve the list of legal acts')).toBeNull();
  });


  it('"Go back" keeps the report waiting and sends nothing', async () => {
    const cancels = given.spy('post', '/api/reports/:reportId/cancel');
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: CANCEL }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel the analysis?' });
    await user.click(within(dialog).getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cancels).toHaveLength(0);
    expect(screen.getByRole('button', { name: APPROVE })).toBeEnabled();
  });


  it('a refused cancel says why inside the dialog', async () => {
    given.apiError('post', '/api/reports/:reportId/cancel', 'NOT_CANCELLABLE', { status: 409 });
    const { user } = renderWaiting();
    await ready();
    await user.click(screen.getByRole('button', { name: CANCEL }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel the analysis?' });
    await user.click(within(dialog).getByRole('button', { name: CANCEL }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This can no longer be cancelled — it has already finished.');
  });
});







// -----------------------------------------------------------
// After the approval
// -----------------------------------------------------------

describe('a finished report made with the review of its list of acts', () => {

  it('names who approved the list, and sets apart what that person decided against the verdict', async () => {
    given.json('get', '/api/reports/:reportId', FINISHED);
    renderWaiting({ id: f.ID.reportDone, search: '?tab=acts' });
    const panel = await screen.findByRole('tabpanel', { name: 'Legal acts' });
    expect(within(panel).getByText('The list of acts was approved by Jonas Naudotojas, 21/09/2026, 09:20')).toBeInTheDocument();
    const chosen = within(panel).getByRole('region', { name: 'Not binding — assessed by the company\'s choice' });
    expect(within(chosen).getByRole('heading', { level: 3 })).toHaveTextContent(/^VKĮ — /);
    expect(within(chosen).getByText(/took them in as good practice, so their findings show a distance from that practice, not a breach\.$/)).toBeInTheDocument();
    const left = within(panel).getByRole('region', { name: 'Applicable — left out by the person who approved the scope' });
    expect(within(left).getByRole('heading', { level: 3 })).toHaveTextContent(/^DORA — /);
    // Past the approval there is nothing to switch, price or approve
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Scope and price of the assessment' })).toBeNull();
    expect(screen.queryByText('Approve the list of legal acts')).toBeNull();
  });


  it('a report run without the review says so; one from before the review says nothing', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, scopeApprovedAt: '2026-09-21T09:17:00+00:00' });
    const view = renderWaiting({ id: f.ID.reportDone, search: '?tab=acts' });
    const panel = await screen.findByRole('tabpanel', { name: 'Legal acts' });
    expect(within(panel).getByText('The report was run without a review of the list of acts')).toBeInTheDocument();
    view.unmount();

    given.json('get', '/api/reports/:reportId', DONE);
    renderWaiting({ id: f.ID.reportDone, search: '?tab=acts' });
    const before = await screen.findByRole('tabpanel', { name: 'Legal acts' });
    expect(within(before).getByRole('region', { name: 'Acts assessed' })).toBeInTheDocument();
    expect(within(before).queryByText(/list of acts/)).toBeNull();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('the approval of the list of acts in Lithuanian', () => {

  it('speaks Lithuanian: the status, the banner, the price panel, the switches and their notes', async () => {
    const { user } = renderWaiting({ locale: 'lt' });
    expect(await within(main()).findByText('Laukia apimties patvirtinimo', { selector: '.MuiChip-label' })).toBeInTheDocument();
    const banner = await statusWith('Patvirtinkite teisės aktų sąrašą');
    expect(banner).toHaveTextContent('Nustatyta, kurie teisės aktai įmonei taikomi. Peržiūrėkite sąrašą ir jį patvirtinkite — pareigos vertinamos tik po to.');
    const panel = await screen.findByRole('region', { name: 'Vertinimo apimtis ir kaina' });
    expect(await within(panel).findByText('Pareigų iš viso: ~332')).toBeInTheDocument();
    expect(within(panel).getByText('Vertinamų aktų: 4')).toBeInTheDocument();
    expect(within(panel).getByText('Didžiausia tikėtina vertinimo kaina: ~5,55 USD')).toBeInTheDocument();
    expect(within(panel).getByText('Iš jos ~3,46 USD — vienkartinis aktų perskaitymas (jų pareigos išskiriamos pirmą kartą).')).toBeInTheDocument();
    expect(within(panel).getByText('Jūsų dienos DI biudžetas neribotas.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Patvirtinti ir tęsti' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: 'Atšaukti analizę' })).toBeEnabled();

    expect(within(card('DORA')).getByText('Vertinti')).toBeInTheDocument();
    expect(within(card('DORA')).getByText('Pareigų: 2')).toBeInTheDocument();
    expect(within(card('MiCA')).getByText('Bus perskaitytas pirmą kartą')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Vertinti: DORA' }));
    expect(within(card('DORA')).getByText('Taikomas, bet šioje ataskaitoje nebus vertinamas')).toBeInTheDocument();
    await openGroup(user, 'Atmesti pagal katalogą (1)');
    await user.click(screen.getByRole('switch', { name: 'Vertinti: VKĮ' }));
    expect(within(card('VKĮ')).getByText('Bus vertinamas kaip geroji praktika — įmonei šis aktas neprivalomas')).toBeInTheDocument();
  });


  it('says the empty tabs, the refusals and the cancel in Lithuanian', async () => {
    refuseApproval('NOTHING_TO_ASSESS', 400);
    const { user } = renderWaiting({ locale: 'lt' });
    await screen.findByText('Pareigų iš viso: ~332');
    await user.click(screen.getByRole('button', { name: 'Patvirtinti ir tęsti' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nepasirinktas nė vienas teisės aktas — įjunkite bent vieną.');

    await user.click(screen.getByRole('button', { name: 'Atšaukti analizę' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atšaukti analizę?' });
    expect(within(dialog).getByText('Aktų sąrašas liks nepatvirtintas ir pareigos nebus vertinamos. Jau sunaudotos DI sąnaudos negrąžinamos.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Grįžti' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('tab', { name: 'Santrauka' }));
    const summary = screen.getByRole('tabpanel', { name: 'Santrauka' });
    expect(within(summary).getByText('Kol kas tuščia')).toBeInTheDocument();
    expect(within(summary).getByText('Išvados, veiksmų planas ir santrauka bus parengti, kai patvirtinsite teisės aktų sąrašą.')).toBeInTheDocument();
  });


  it('says in Lithuanian who approved the list of a finished report, and what was decided against the verdict', async () => {
    given.json('get', '/api/reports/:reportId', FINISHED);
    renderWaiting({ id: f.ID.reportDone, search: '?tab=acts', locale: 'lt' });
    const panel = await screen.findByRole('tabpanel', { name: 'Teisės aktai' });
    expect(within(panel).getByText('Aktų sąrašą patvirtino Jonas Naudotojas, 2026-09-21 09:20')).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'Neprivalomi — įvertinti įmonės pasirinkimu' })).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'Taikomi — apimtį tvirtinusio asmens sprendimu nevertinti' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The waiting report itself (whatever shape it arrives in,
// the page must stand — and with it the approval screen
// under extra fields and a huge list of acts), and the price
// of its second part: the POST without `approved`, whose
// failures land in the panel with a retry.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/reports/:reportId',
  fixture: WAITING,
  render: () => renderWaiting(),
  chrome: () => within(screen.getByRole('main')).getByRole('link', { name: 'Reports' }),
  loaded: async () => { await screen.findByRole('region', { name: 'Scope and price of the assessment' }); },
  loading: () => screen.getByRole('main').querySelector('.MuiSkeleton-root'),
});


describeEndpointContract({
  path: '/api/reports/:reportId/scope',
  method: 'post',
  fixture: priceOf(),
  render: () => renderWaiting(),
  chrome: () => screen.getByRole('region', { name: 'Scope and price of the assessment' }),
  loaded: async () => { await screen.findByText(PLAN.obligations); },
  loading: () => screen.getByText('Working out the price…'),
});
