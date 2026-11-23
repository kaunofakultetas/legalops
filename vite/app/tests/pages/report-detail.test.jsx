// -----------------------------------------------------------
//  [*] Tests — ReportDetail page (/reports/:reportId)
//
//  The report page end to end against the backend double,
//  one face per status: the frame (the title or its dated
//  fallback, back link, status and approval chips, the
//  company link, the report language and stamps; skeletons
//  while loading, a failed load with its retry); a running
//  analysis (the progress card polling GET /api/jobs/:jobId
//  every 3 s under fake timers, the step list, the progress
//  sentence from useJobText, the stop → POST …/cancel with
//  its refusal and the "cancel requested" note, the page
//  flipping to the finished face when the poll brings it); a
//  queued one; a failed one (the error title and text, the
//  technical details, the AI_BUDGET_EXHAUSTED wording) and a
//  cancelled one; the finished face (tabs in ?tab=, the
//  outdated-acts note, the analysis data tab with the scope
//  by name — and, for a report started with that option, the
//  line saying the company's own requirements were assessed
//  too); run again; delete (confirm, toast, the list —
//  and 409 STILL_RUNNING in the dialog); coming back (the
//  back link and the delete going Back to the list right
//  behind, in both languages; the plan's focus kept in the
//  address, an unknown action ignored); the PDF / Excel
//  exports through downloadFile (the file name from
//  Content-Disposition, 409 NOT_FINISHED); the report
//  language against the UI language; and the contract
//  matrices for GET /api/reports/:id and the progress
//  card's GET /api/jobs/:id.
//
//  The tabs' contents have their own files: report-parts
//  (summary, acts, plan, progress card units),
//  report-findings and report-approval. The face of a report
//  that waits for its list of acts to be approved
//  (scope_review) is report-scope.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, makeQueryClient, ListProbe, renderRoutes } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import ReportDetail from '@/pages/Reports/ReportDetail';


const DONE = f.report(f.ID.reportDone);
const RUNNING = f.report(f.ID.reportRunning);
const RUNNING_ROW = f.reports.find((row) => row.id === f.ID.reportRunning);
const FAILED = f.report(f.ID.reportFailed);
const DONE_TITLE = DONE.title;

// The running analysis as the poll finds it once it ended
const RUNNING_DONE = {
  ...RUNNING, status: 'done', jobStatus: 'done', title: 'UAB Kreditas atitikties vertinimas', finishedAt: '2026-09-27T10:05:00+00:00',
  progress: { step: 'gap_analysis', percent: 100, message: '3/3 batches' },
};

// A cancelled run of UAB Pavyzdys (the failed one, stopped)
const CANCELLED = { ...FAILED, status: 'cancelled', jobStatus: 'cancelled', error: null };







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderReport: the page on its real route pattern, so
// useParams reads the id and a navigation away ends on the
// probe. fakeClock: timers and Date faked, time still
// flowing for the requests (the polls are created at mount,
// so it goes in before the render). tick: advance the fake
// clock and let the answers land. menuItem: an entry of the
// "more" menu. exportClicks: the downloads handed to the
// browser (the temporary link's click). statusWith: the
// status note carrying a text (a page may hold several).
// -----------------------------------------------------------

function renderReport(id = f.ID.reportDone, { search = '', ...options } = {}) {
  return renderPage(<ReportDetail authData={authData} />, { route: `/reports/${id}${search}`, path: '/reports/:reportId', ...options });
}

const fakeClock = () => vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });

async function tick(ms) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
}

const main = () => screen.getByRole('main');

async function menuItem(user, name) {
  await user.click(screen.getByRole('button', { name: 'More report actions' }));
  return screen.findByRole('menuitem', { name });
}

async function statusWith(text) {
  let found;
  await waitFor(() => {
    found = screen.getAllByRole('status').find((element) => element.textContent.includes(text));
    expect(found).toBeTruthy();
  });
  return found;
}

function exportClicks() {
  const clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicks.push({ href: this.href, download: this.download });
  });
  return clicks;
}







// -----------------------------------------------------------
// The frame
// -----------------------------------------------------------

describe('ReportDetail frame', () => {

  it('heads a finished report with its title, the way back, status and approval chips, the company and the stamps', async () => {
    renderReport();
    expect(await within(main()).findByRole('heading', { level: 1, name: DONE_TITLE })).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports');
    expect(within(main()).getByText('Finished')).toBeInTheDocument();
    expect(within(main()).getByText('Approved')).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'UAB Pavyzdys' })).toHaveAttribute('href', `/companies/${f.ID.pavyzdys}`);
    expect(within(main()).getByText('Report language: Lithuanian · Started 21/09/2026, 09:15 · Finished 21/09/2026, 09:31')).toBeInTheDocument();
  });


  it('offers the exports and the "more" menu on a finished report, and no approve button once it is approved', async () => {
    const { user } = renderReport();
    await within(main()).findByRole('heading', { level: 1, name: DONE_TITLE });
    expect(screen.getByRole('button', { name: 'Download the report as PDF' })).toHaveTextContent('PDF');
    expect(screen.getByRole('button', { name: 'Download the report as Excel' })).toHaveTextContent('Excel');
    expect(screen.queryByRole('button', { name: 'Approve the report' })).toBeNull();
    const more = screen.getByRole('button', { name: 'More report actions' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Run again', 'Delete the report']);
    expect(items[1]).not.toHaveAttribute('aria-disabled');
  });


  it('shows skeletons under the back link while the report loads — no alert, no tabs', async () => {
    given.hang('get', '/api/reports/:reportId');
    renderReport();
    await settle(50);
    expect(within(main()).getByRole('link', { name: 'Reports' })).toBeInTheDocument();
    // MUI's Skeleton has no role — its class is the only handle
    expect(main().querySelectorAll('.MuiSkeleton-root')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });


  it('a report that is gone says so under the generic title, with a retry that loads it once it answers', async () => {
    given.sequence('get', '/api/reports/:reportId', [{ status: 404, body: apiError('NOT_FOUND', 'Report not found') }, { body: DONE }]);
    const { user } = renderReport();
    expect(await within(main()).findByRole('heading', { level: 1, name: 'Report' })).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The report could not be loaded');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(main()).findByRole('heading', { level: 1, name: DONE_TITLE })).toBeInTheDocument();
  });


  it('asks for the report of the address', async () => {
    const calls = given.capture('get', '/api/reports/:reportId', FAILED);
    renderReport(f.ID.reportFailed);
    await within(main()).findByRole('heading', { level: 1, name: 'Report, 20/09/2026' });
    expect(calls[0].url).toBe(`http://localhost:3000/api/reports/${f.ID.reportFailed}`);
  });
});







// -----------------------------------------------------------
// A running analysis
// -----------------------------------------------------------

describe('ReportDetail — a running analysis', () => {

  it('shows the progress card: the sentence, the overall bar, the progress in words and every step\'s state', async () => {
    renderReport(f.ID.reportRunning);
    expect(await within(main()).findByRole('heading', { level: 1, name: 'Report, 27/09/2026' })).toBeInTheDocument();
    expect(within(main()).getByText('Running', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(main()).getByText('Report language: Lithuanian · Started 27/09/2026, 09:40')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Compliance analysis in progress' });
    expect(within(card).getByText('You can leave this page — the analysis keeps running and the results are saved.')).toBeInTheDocument();
    expect(within(card).getByText('Gap analysis — 1 of 3 batches (33%)')).toBeInTheDocument();
    // 5 steps done + a third of the sixth, of eight
    await waitFor(() => expect(within(card).getByRole('progressbar', { name: 'Compliance analysis in progress' })).toHaveAttribute('aria-valuenow', '67'));
    await waitFor(() => expect(within(card).getByText('1 min 26 s')).toBeInTheDocument());
    // A step that made model calls names its model and cost
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Company profileDone1 s', 'Document inventoryDone1 s', 'Citation auditDone< 1 s', 'Applicability of actsDonegateway:azure/gpt-5.5 · $0.1441 min 26 s', 'Obligation selectionDone1 s',
      'Gap analysisRunning', 'Action plan', 'Summary',
    ]);
    expect(within(card).getByText('AI cost so far: $0.144')).toBeInTheDocument();
  });


  it('offers stop and run again, but no exports, no approval, no tabs — and delete is disabled while it runs', async () => {
    const { user } = renderReport(f.ID.reportRunning);
    await within(main()).findByRole('heading', { level: 1, name: 'Report, 27/09/2026' });
    expect(screen.getByRole('button', { name: 'Stop the analysis' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Download the report as PDF' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve the report' })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(await menuItem(user, 'Delete the report')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Run again' })).not.toHaveAttribute('aria-disabled');
  });


  it('polls the report and its job every 3 s while it runs', async () => {
    const reportCalls = given.capture('get', '/api/reports/:reportId', RUNNING);
    const jobCalls = given.capture('get', '/api/jobs/:jobId', f.job(f.ID.jobReportRunning));
    fakeClock();
    renderReport(f.ID.reportRunning);
    await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    await waitFor(() => expect(jobCalls).toHaveLength(1));
    expect(reportCalls).toHaveLength(1);
    expect(jobCalls[0].url).toBe(`http://localhost:3000/api/jobs/${f.ID.jobReportRunning}`);
    await tick(3000);
    vi.useRealTimers();
    await waitFor(() => expect(reportCalls).toHaveLength(2));
    await waitFor(() => expect(jobCalls).toHaveLength(2));
  });


  it('moves the steps as the job reports them — a finished gap analysis ticks off and the bar grows', async () => {
    const next = f.job(f.ID.jobReportRunning);
    const moved = {
      ...next,
      steps: next.steps.map((step) => (step.name === 'gap_analysis' ? { ...step, status: 'done', durationMs: 240000, finishedAt: '2026-09-27T09:45:32+00:00' } : step))
        .concat([{ ...next.steps[5], id: 'b1000000-0000-4000-8000-000000000906', ordinal: 7, name: 'action_plan', status: 'running', durationMs: null, finishedAt: null }]),
    };
    given.sequence('get', '/api/jobs/:jobId', [{ body: next }, { body: moved }]);
    given.sequence('get', '/api/reports/:reportId', [{ body: RUNNING }, { body: { ...RUNNING, progress: { step: 'action_plan', percent: null, message: null } } }]);
    fakeClock();
    renderReport(f.ID.reportRunning);
    const card = await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    await waitFor(() => expect(within(card).getByRole('progressbar', { name: 'Compliance analysis in progress' })).toHaveAttribute('aria-valuenow', '67'));
    await tick(3000);
    vi.useRealTimers();
    await waitFor(() => expect(within(card).getByText('4 min 0 s')).toBeInTheDocument());
    await waitFor(() => expect(within(card).getByRole('progressbar', { name: 'Compliance analysis in progress' })).toHaveAttribute('aria-valuenow', '75'));
    expect(within(card).getAllByRole('listitem')[6]).toHaveTextContent('Action planRunning');
  });


  it('flips to the finished report when the poll brings it, and refreshes the report lists', async () => {
    const client = makeQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    given.sequence('get', '/api/reports/:reportId', [{ body: RUNNING }, { body: RUNNING_DONE }]);
    fakeClock();
    renderReport(f.ID.reportRunning, { client });
    await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    await tick(3000);
    vi.useRealTimers();
    expect(await within(main()).findByRole('heading', { level: 1, name: 'UAB Kreditas atitikties vertinimas' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Compliance analysis in progress' })).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Report sections' })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] });
  });


  it('stops asking once the analysis ended', async () => {
    const reportCalls = given.capture('get', '/api/reports/:reportId', DONE);
    fakeClock();
    renderReport();
    await within(main()).findByRole('heading', { level: 1, name: DONE_TITLE });
    await tick(9000);
    vi.useRealTimers();
    await settle(50);
    expect(reportCalls).toHaveLength(1);
  });


  it('stop: asks first, POSTs the cancel, toasts, and the card notes the request (role="status") at once', async () => {
    // The job carries the flag once the cancel went through
    const cancels = [];
    server.use(
      http.post(url('/api/reports/:reportId/cancel'), async ({ request }) => {
        cancels.push({ url: request.url, body: await request.text() });
        return HttpResponse.json(RUNNING_ROW);
      }),
      http.get(url('/api/jobs/:jobId'), () => HttpResponse.json({ ...f.job(f.ID.jobReportRunning), cancelRequested: cancels.length > 0 })),
    );
    const client = makeQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { user } = renderReport(f.ID.reportRunning, { client });
    const card = await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    await waitFor(() => expect(within(card).getByText('1 min 26 s')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Stop the analysis' }));

    const dialog = await screen.findByRole('dialog', { name: 'Stop the analysis?' });
    expect(within(dialog).getByText('The analysis stops at its next step. AI costs already incurred are not refunded.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(cancels).toHaveLength(1));
    expect(cancels[0]).toEqual({ url: `http://localhost:3000/api/reports/${f.ID.reportRunning}/cancel`, body: '' });
    expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The job is re-read at once, not at its next 3 s poll
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['jobs', f.ID.jobReportRunning] });
    const note = await within(card).findByRole('status');
    expect(note).toHaveTextContent('Cancellation requested — the analysis stops at its next step.');
    expect(within(card).queryByRole('alert')).toBeNull();
  });


  it('a refused stop (it ended meanwhile) says so inside the dialog, without a toast', async () => {
    given.apiError('post', '/api/reports/:reportId/cancel', 'NOT_CANCELLABLE', { status: 409 });
    const { user } = renderReport(f.ID.reportRunning);
    await user.click(await screen.findByRole('button', { name: 'Stop the analysis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stop the analysis?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This can no longer be cancelled — it has already finished.');
    expect(screen.getAllByText('This can no longer be cancelled — it has already finished.')).toHaveLength(1);
    // Reopening starts without the old refusal
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Stop the analysis' }));
    const again = await screen.findByRole('dialog', { name: 'Stop the analysis?' });
    expect(within(again).queryByRole('alert')).toBeNull();
  });


  it('a queued analysis says it waits for a worker, with an indeterminate bar and every step pending', async () => {
    renderReport(f.ID.newReport);
    const card = await screen.findByRole('region', { name: 'Compliance analysis in progress' });
    expect(within(card).getByText('The analysis is queued — it starts when a worker is free.')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Compliance analysis in progress' })).not.toHaveAttribute('aria-valuenow');
    expect(within(main()).getByText('Queued')).toBeInTheDocument();
    await settle(50);
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Company profile', 'Document inventory', 'Citation audit', 'Applicability of acts', 'Obligation selection', 'Gap analysis', 'Action plan', 'Summary',
    ]);
  });
});







// -----------------------------------------------------------
// Failed and cancelled
// -----------------------------------------------------------

describe('ReportDetail — failed and cancelled', () => {

  it('a failed analysis is announced (role="alert") with the reason under "Technical details" and "Run again"', async () => {
    renderReport(f.ID.reportFailed);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The analysis failed')).toBeInTheDocument();
    expect(alert).toHaveTextContent('The analysis could not be completed. You can run it again.');
    expect(within(alert).getByText('Technical details')).toBeInTheDocument();
    expect(within(alert).getByText('[504] GATEWAY_ERROR: Upstream request timed out after 120 s')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Run again' })).toBeInTheDocument();
    expect(within(main()).getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download the report as PDF' })).toBeNull();
  });


  it('names an exhausted AI provider budget plainly — the AI_BUDGET_EXHAUSTED text the pipeline writes', async () => {
    const error = 'AI_BUDGET_EXHAUSTED: the AI provider refused the call because its budget is used up — run the analysis again when the budget resets.';
    given.json('get', '/api/reports/:reportId', { ...FAILED, error });
    renderReport(f.ID.reportFailed);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The AI service budget is used up — try again later or contact your administrator.');
    expect(alert).not.toHaveTextContent('The analysis could not be completed.');
    expect(within(alert).getByText(error)).toBeInTheDocument();
  });


  it('recognises the older wordings of the same cause — the gateway\'s [402] and "budget exceeded"', async () => {
    for (const error of ['[402] PAYMENT_REQUIRED: gateway refused', 'LiteLLM: Budget exceeded for key']) {
      given.json('get', '/api/reports/:reportId', { ...FAILED, error });
      const view = renderReport(f.ID.reportFailed);
      expect(await screen.findByRole('alert'), error).toHaveTextContent('The AI service budget is used up');
      view.unmount();
    }
  });


  it('a failure without a stored reason shows no empty technical details', async () => {
    given.json('get', '/api/reports/:reportId', { ...FAILED, error: null });
    renderReport(f.ID.reportFailed);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The analysis could not be completed. You can run it again.');
    expect(within(alert).queryByText('Technical details')).toBeNull();
  });


  it('a cancelled analysis is a status, not an alarm, and offers "Run again"', async () => {
    given.json('get', '/api/reports/:reportId', CANCELLED);
    renderReport(f.ID.reportFailed);
    const note = await statusWith('The analysis was cancelled');
    expect(note).toHaveTextContent('The analysis was stopped before it finished. You can run it again.');
    expect(within(note).queryByText('Technical details')).toBeNull();
    expect(within(note).getByRole('button', { name: 'Run again' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(main()).getByText('Cancelled')).toBeInTheDocument();
  });


  it('"Run again" opens the start dialog for the same company — no company picker, its estimate at once', async () => {
    const estimates = given.capture('get', '/api/reports/estimate', f.estimate(f.ID.pavyzdys));
    const { user } = renderReport(f.ID.reportFailed);
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Run again' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compliance analysis' });
    expect(within(dialog).queryByRole('combobox', { name: /^Company/ })).toBeNull();
    expect(await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(estimates[0].query).toEqual({ companyId: f.ID.pavyzdys });
  });


  it('starting again from the report opens the new report', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderReport(f.ID.reportFailed);
    await screen.findByRole('alert');
    await user.click(await menuItem(user, 'Run again'));
    const dialog = await screen.findByRole('dialog', { name: 'Compliance analysis' });
    await user.click(within(dialog).getByRole('button', { name: 'Start the analysis' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true });
    await waitFor(() => expect(within(main()).getByRole('heading', { level: 1 })).toHaveTextContent('Report, 27/09/2026'));
    expect(screen.getByRole('region', { name: 'Compliance analysis in progress' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// A finished report
// -----------------------------------------------------------

describe('ReportDetail — a finished report', () => {

  it('opens on the summary tab of six, the findings and citations tabs counting their rows', async () => {
    renderReport();
    const tablist = await screen.findByRole('tablist', { name: 'Report sections' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Summary', 'Legal acts', 'Findings (7)', 'Citations (6)', 'Action plan', 'Analysis data']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Summary' });
    expect(within(panel).getByRole('heading', { name: 'Executive summary' })).toBeInTheDocument();
  });


  it('keeps the tab in ?tab= — a link opens that tab, a click replaces the address', async () => {
    const { user, router } = renderReport(f.ID.reportDone, { search: '?tab=plan' });
    expect(await screen.findByRole('tab', { name: 'Action plan', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Action plan' })).toHaveTextContent('Patvirtinti klientų kriptoturto ir lėšų apsaugos politiką');
    await user.click(screen.getByRole('tab', { name: 'Legal acts' }));
    expect(router.state.location.search).toBe('?tab=acts');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByRole('tabpanel', { name: 'Legal acts' })).toHaveTextContent('Acts assessed');
  });


  it('an unknown ?tab= falls back to the summary', async () => {
    renderReport(f.ID.reportDone, { search: '?tab=secrets' });
    expect(await screen.findByRole('tab', { name: 'Summary', selected: true })).toBeInTheDocument();
  });


  it('notes (role="status") the acts updated since the run, with "Run again" into the start dialog', async () => {
    const { user } = renderReport();
    await screen.findByRole('tablist');
    const note = await statusWith('Legal acts updated');
    expect(note).toHaveTextContent('These legal acts were updated after the report was produced: MiCA. Consider running the analysis again.');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(within(note).getByRole('button', { name: 'Run again' }));
    expect(await screen.findByRole('dialog', { name: 'Compliance analysis' })).toBeInTheDocument();
  });


  it('lists every outdated act, and says nothing when none is', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, outdatedActs: ['DORA', 'MiCA'] });
    const view = renderReport();
    await screen.findByRole('tablist');
    expect(screen.getByText('These legal acts were updated after the report was produced: DORA, MiCA. Consider running the analysis again.')).toBeInTheDocument();
    view.unmount();

    given.json('get', '/api/reports/:reportId', { ...DONE, outdatedActs: [] });
    renderReport();
    await screen.findByRole('tablist');
    expect(screen.queryByText('Legal acts updated')).toBeNull();
  });


  it('the analysis data tab shows the profile as frozen at the run and a whole-catalogue scope', async () => {
    renderReport(f.ID.reportDone, { search: '?tab=profile' });
    const panel = await screen.findByRole('tabpanel', { name: 'Analysis data' });
    expect(within(panel).getByRole('heading', { name: 'Company data at the time of the analysis' })).toBeInTheDocument();
    expect(within(panel).getByText('The analysis ran on this snapshot — later profile changes do not alter the report.')).toBeInTheDocument();
    expect(within(panel).getByText('Crypto-asset service provider')).toBeInTheDocument();
    // 22 employees at the run (the profile says 24 today)
    expect(within(panel).getByText('22')).toBeInTheDocument();
    expect(within(panel).queryByText('24')).toBeNull();
    expect(within(panel).getByText('Licence: Kriptoturto paslaugų teikėjo leidimas (Verified)')).toBeInTheDocument();
    expect(within(panel).getByText('Certificate: ISO/IEC 27001 sertifikatas (Claimed)')).toBeInTheDocument();
    const scope = within(panel).getByRole('region', { name: 'Scope of the analysis' });
    expect(scope).toHaveTextContent('All applicable legal acts');
  });


  it('names the scoped acts by their short titles, not by their ids', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, scope: { documentIds: [f.ID.mica, f.ID.dora, f.ID.newAct] } });
    renderReport(f.ID.reportDone, { search: '?tab=profile' });
    const scope = await screen.findByRole('region', { name: 'Scope of the analysis' });
    // An act the report did not assess keeps its id
    expect(scope).toHaveTextContent(`MiCA, DORA, ${f.ID.newAct}`);
  });


  it('a report started with the company\'s own requirements says so in its scope, in one line — no other report does', async () => {
    const view = renderReport(f.ID.reportOwn, { search: '?tab=profile' });
    const scope = await screen.findByRole('region', { name: 'Scope of the analysis' });
    expect(within(scope).getByText('All applicable legal acts')).toBeInTheDocument();
    expect(within(scope).getByText('The company\'s own requirements were assessed too.')).toBeInTheDocument();
    view.unmount();

    renderReport(f.ID.reportDone, { search: '?tab=profile' });
    const plain = await screen.findByRole('region', { name: 'Scope of the analysis' });
    expect(within(plain).getByText('All applicable legal acts')).toBeInTheDocument();
    expect(within(plain).queryByText(/own requirements/)).toBeNull();
  });


  it('says it beside a scope of named acts too, and in Lithuanian', async () => {
    given.json('get', '/api/reports/:reportId', { ...f.report(f.ID.reportOwn), scope: { documentIds: [f.ID.mica], internal: true } });
    renderReport(f.ID.reportOwn, { search: '?tab=profile', locale: 'lt' });
    const scope = await screen.findByRole('region', { name: 'Analizės apimtis' });
    expect(within(scope).getByText('MiCA')).toBeInTheDocument();
    expect(within(scope).getByText('Vertinti ir įmonės vidaus reikalavimai.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Delete
// -----------------------------------------------------------

describe('ReportDetail — delete', () => {

  it('asks first, DELETEs, toasts and replaces the page with the list', async () => {
    const deletes = given.capture('delete', '/api/reports/:reportId', { ok: true });
    const { user, router } = renderReport(f.ID.reportFailed);
    await screen.findByRole('alert');
    await user.click(await menuItem(user, 'Delete the report'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the report?' });
    expect(within(dialog).getByText('The report with all its findings and the action plan is deleted for good.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete the report' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(`http://localhost:3000/api/reports/${f.ID.reportFailed}`);
    expect(await screen.findByText('Report deleted')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/reports');
    expect(router.state.location.pathname).toBe('/reports');
    expect(router.state.historyAction).toBe('REPLACE');
  });


  it('Cancel keeps the report and sends nothing', async () => {
    const deletes = given.capture('delete', '/api/reports/:reportId', { ok: true });
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(await menuItem(user, 'Delete the report'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletes).toHaveLength(0);
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('409 STILL_RUNNING (it was restarted meanwhile) says so inside the dialog, without a toast, and stays', async () => {
    given.apiError('delete', '/api/reports/:reportId', 'STILL_RUNNING', { status: 409 });
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(await menuItem(user, 'Delete the report'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete the report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cancel the running analysis or the document generation first.');
    expect(screen.getAllByText('Cancel the running analysis or the document generation first.')).toHaveLength(1);
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });
});







// -----------------------------------------------------------
// Exports
// -----------------------------------------------------------

describe('ReportDetail — exports', () => {

  it('PDF: fetches the export, hands the browser the file under the server\'s name and toasts it', async () => {
    const clicks = exportClicks();
    // The real file, and which format was asked for
    const calls = [];
    server.use(http.get(url('/api/reports/:reportId/export'), ({ request, params }) => {
      calls.push({ id: params.reportId, format: new URL(request.url).searchParams.get('format') });
      const file = f.reportExport(f.ID.reportDone, 'pdf');
      return new HttpResponse(file.body, { headers: { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"` } });
    }));
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the report as PDF' }));
    expect(await screen.findByText('Downloaded: legalops-UAB-Pavyzdys-2026-09-21.pdf')).toBeInTheDocument();
    expect(calls).toEqual([{ id: f.ID.reportDone, format: 'pdf' }]);
    expect(clicks).toEqual([{ href: 'blob:test', download: 'legalops-UAB-Pavyzdys-2026-09-21.pdf' }]);
  });


  it('Excel: the same through the default export route, as an .xlsx', async () => {
    const clicks = exportClicks();
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the report as Excel' }));
    expect(await screen.findByText('Downloaded: legalops-UAB-Pavyzdys-2026-09-21.xlsx')).toBeInTheDocument();
    expect(clicks).toEqual([{ href: 'blob:test', download: 'legalops-UAB-Pavyzdys-2026-09-21.xlsx' }]);
  });


  it('disables both buttons while a download is on the wire', async () => {
    given.hang('get', '/api/reports/:reportId/export');
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the report as PDF' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download the report as PDF' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Download the report as Excel' })).toBeDisabled();
  });


  it('409 NOT_FINISHED: toasts the translated reason (read out of the Blob) and saves nothing', async () => {
    const clicks = exportClicks();
    given.apiError('get', '/api/reports/:reportId/export', 'NOT_FINISHED', { status: 409 });
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the report as PDF' }));
    expect(await screen.findByText('The download failed: Only finished reports can be exported.')).toBeInTheDocument();
    expect(clicks).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download the report as PDF' })).toBeEnabled());
  });


  it('a proxy failure toasts the status sentence', async () => {
    given.html('get', '/api/reports/:reportId/export', 502);
    const { user } = renderReport();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the report as Excel' }));
    expect(await screen.findByText('The download failed: The server is temporarily unreachable. Try again.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The back link and the delete return to the list the way
// Back would (renderRoutes: the list probe, then the report);
// the plan's focus on one action's findings is in the address
// (?findings.action=), so it outlives the page.
// -----------------------------------------------------------

describe('ReportDetail — coming back', () => {

  const fromList = (id = f.ID.reportDone, locale = 'en') => renderRoutes([
    { path: '/reports', element: <ListProbe to={`/reports/${id}`} /> },
    { path: '/reports/:reportId', element: <ReportDetail authData={authData} /> },
  ], { route: '/reports?status=done&sort=createdAt.asc', locale });


  it('with the list right behind, the back link is Back: the list\'s entry with its filters and order', async () => {
    const { user, router } = fromList();
    const listKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await screen.findByRole('tab', { name: 'Summary', selected: true });
    await user.click(screen.getByRole('tab', { name: 'Findings (7)' }));
    await user.click(within(main()).getByRole('link', { name: 'Reports' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/reports?status=done&sort=createdAt.asc');
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(listKey);
  });


  it('in Lithuanian the back link ("Ataskaitos") does the same', async () => {
    const { user, router } = fromList(f.ID.reportDone, 'lt');
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await user.click(await within(await screen.findByRole('main')).findByRole('link', { name: 'Ataskaitos' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/reports?status=done&sort=createdAt.asc');
    expect(router.state.historyAction).toBe('POP');
  });


  it('a delete with the list right behind goes Back to it', async () => {
    given.capture('delete', '/api/reports/:reportId', { ok: true });
    const { user, router } = fromList(f.ID.reportFailed);
    const listKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await screen.findByRole('alert');
    await user.click(await menuItem(user, 'Delete the report'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete the report' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/reports?status=done&sort=createdAt.asc');
    expect(router.state.location.key).toBe(listKey);
  });


  it('the plan\'s focus is in the address: the findings of that action come back with it', async () => {
    renderReport(f.ID.reportDone, { search: '?tab=findings&findings.action=e3000000-0000-4000-8000-000000000002' });
    expect(await screen.findByText('Showing 2 of 7')).toBeInTheDocument();
    expect(await statusWith('Showing the findings of the action')).toBeInTheDocument();
  });


  it('an action the report does not hold is ignored — the whole list shows', async () => {
    renderReport(f.ID.reportDone, { search: '?tab=findings&findings.action=e3000000-0000-4000-8000-0000000000ff' });
    expect(await screen.findByText('Showing 7 of 7')).toBeInTheDocument();
    expect(screen.queryByText(/Showing the findings of the action/)).toBeNull();
  });
});







// -----------------------------------------------------------
// The report's language and the UI's
// -----------------------------------------------------------

describe('ReportDetail — languages', () => {

  it('an English UI over a Lithuanian report: the chrome in English, the report\'s own words in Lithuanian', async () => {
    renderReport();
    await screen.findByRole('tablist');
    expect(within(main()).getByText(/^Report language: Lithuanian/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel', { name: 'Summary' });
    expect(within(panel).getByRole('heading', { name: 'Santrauka' })).toBeInTheDocument();
  });


  it('a Lithuanian UI names an English report\'s language in Lithuanian', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, language: 'en' });
    renderReport(f.ID.reportDone, { locale: 'lt' });
    expect(await within(main()).findByText('Ataskaitos kalba: Anglų · Pradėta 2026-09-21 09:15 · Baigta 2026-09-21 09:31')).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Ataskaitos skiltys' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Santrauka', 'Teisės aktai', 'Išvados (7)', 'Nuorodos (6)', 'Veiksmų planas', 'Analizės duomenys']);
    expect(within(main()).getByRole('link', { name: 'Ataskaitos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atsisiųsti ataskaitą PDF formatu' })).toBeInTheDocument();
    expect(screen.getByText('Teisės aktai atnaujinti')).toBeInTheDocument();
  });


  it('speaks Lithuanian on a running, a failed and a cancelled report', async () => {
    let view = renderReport(f.ID.reportRunning, { locale: 'lt' });
    const card = await screen.findByRole('region', { name: 'Vyksta atitikties analizė' });
    expect(within(card).getByText('Atitikties spragų analizė — 1 iš 3 paketų (33 %)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stabdyti analizę' })).toBeInTheDocument();
    view.unmount();

    view = renderReport(f.ID.reportFailed, { locale: 'lt' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Analizė nepavyko');
    expect(alert).toHaveTextContent('Analizės nepavyko užbaigti. Galite ją paleisti iš naujo.');
    expect(within(alert).getByText('Techninė informacija')).toBeInTheDocument();
    view.unmount();

    given.json('get', '/api/reports/:reportId', CANCELLED);
    renderReport(f.ID.reportFailed, { locale: 'lt' });
    expect(await statusWith('Analizė atšaukta')).toHaveTextContent('Analizė buvo sustabdyta prieš pabaigą. Galite ją paleisti iš naujo.');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The report itself (the finished one) and the running
// report's job. A 404 of the job is not a failure there: it
// is the job of someone else's run, and the card says the
// steps are hidden (report-parts.test.jsx).
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/reports/:reportId',
  fixture: DONE,
  render: () => renderReport(),
  chrome: () => within(screen.getByRole('main')).getByRole('link', { name: 'Reports' }),
  loaded: async () => { await within(screen.getByRole('main')).findByRole('heading', { level: 1, name: DONE_TITLE }); },
  loading: () => screen.getByRole('main').querySelector('.MuiSkeleton-root'),
});


describeEndpointContract({
  path: '/api/jobs/:jobId',
  fixture: f.job(f.ID.jobReportRunning),
  render: () => renderReport(f.ID.reportRunning),
  chrome: () => screen.getByRole('region', { name: 'Compliance analysis in progress' }),
  loaded: async () => { await screen.findByText('1 min 26 s'); },
  skip: { '404 NOT_FOUND → alert': 'a 404 is another user\'s job — the card says the steps are hidden (report-parts.test.jsx)' },
});
