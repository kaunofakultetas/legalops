// -----------------------------------------------------------
//  [*] Tests — Reports page (the list, ReportsTable)
//
//  The /reports page end to end against the backend double:
//  the frame (heading, subtitle, "New analysis", the two
//  filters), the ReportsTable rows newest first (the title
//  link or its dated fallback, company, status chip with the
//  live progress bar of a running analysis — a report that
//  waits for its list of acts to be approved says so, with
//  no bar — the finding counts of a finished one, language,
//  stamps), a click on a row or its link → the report, the
//  company filter (the server's ?companyId=, the company
//  column dropped; a failed company list said, with its
//  retry) and the status filter (client side), the empty and
//  the filtered-empty states, the loading overlay, a failed
//  list with its retry, the 5 s poll while an analysis runs
//  (and none when nothing runs, or a report only waits for
//  its approval), the start dialog door, coming back (both
//  filters and the table's sort read from and replaced in the
//  address; an unknown company or status ignored),
//  Lithuanian, and the backend contract matrix for
//  GET /api/reports. The list's counts follow a reviewer's
//  override (FE-REPORTS-1, fixed — the stored stats count the
//  effective statuses).
//
//  The start dialog itself is covered by
//  start-analysis.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, apiError } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Reports from '@/pages/Reports/Reports';
import ReportsTable from '@/pages/Reports/ReportsTable';


const DONE_TITLE = 'UAB Pavyzdys atitikties vertinimas: MiCA, DORA ir PPTFPĮ';

// The world's rows with UAB Pavyzdys' newest analysis on top:
// the one that waits for its list of acts to be approved
const WITH_WAITING = [f.waitingReport, ...f.reports];

// The three rows as the grid shows them, newest first
const ROWS_EN = [
  'Report, 27/09/2026 | UAB Kreditas | Running |  | Lithuanian | 27/09/2026, 09:40 | —',
  `${DONE_TITLE} | UAB Pavyzdys | Finished | 1 not met · 2 partial · 2 met | Lithuanian | 21/09/2026, 09:15 | 21/09/2026, 09:31`,
  'Report, 20/09/2026 | UAB Pavyzdys | Failed |  | Lithuanian | 20/09/2026, 15:02 | 20/09/2026, 15:05',
];







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderReports: the page on its real route, so a navigation
// ends on the "navigated away" probe. gridRows: the data
// rows' cells joined, top to bottom — the header row has no
// gridcell. columnHeaders: the header titles (a header's
// accessible name also carries its sort and menu buttons).
// pick: an option of an open MUI list (the popper lives
// outside the page, hence screen). The grid re-creates its
// row elements on new data, so a wait re-finds the row.
// -----------------------------------------------------------

const renderReports = (options = {}) => renderPage(<Reports authData={authData} />, { route: '/reports', path: '/reports', ...options });

const gridRows = () => within(screen.getByRole('grid')).getAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent).join(' | '))
  .filter(Boolean);

const columnHeaders = () => within(screen.getByRole('grid')).getAllByRole('columnheader').map((c) => c.textContent);

const rowOf = async (text) => (await screen.findByText(text)).closest('[role="row"]');

async function pick(user, comboboxName, optionName) {
  await user.click(screen.getByRole('combobox', { name: comboboxName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}







// -----------------------------------------------------------
// The page frame
// -----------------------------------------------------------

describe('Reports page frame', () => {

  it('titles the page, explains it and offers "New analysis" and the two filters', async () => {
    renderReports();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(within(main).getByText('Results of compliance analyses: applicable acts, findings and action plans.')).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: 'New analysis' })).toBeEnabled();
    expect(within(main).getByRole('combobox', { name: 'Company' })).toHaveValue('');
    // No status picked: the select is empty and its label stands in the field
    expect(within(main).getByRole('combobox', { name: 'Status' }).textContent.trim().replace(/\u200b/g, '')).toBe('');
    expect(await within(main).findByRole('grid', { name: 'Reports' })).toBeInTheDocument();
  });


  it('"New analysis" opens the start dialog with the company picker, and Cancel closes it without a request', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderReports();
    await screen.findByText(DONE_TITLE);
    await user.click(screen.getByRole('button', { name: 'New analysis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compliance analysis' });
    expect(within(dialog).getByRole('combobox', { name: /^Company/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts).toHaveLength(0);
  });


  it('a plain user sees the same page — the list is scoped by the backend, not hidden', async () => {
    renderPage(<Reports authData={userAuthData} />, { route: '/reports', path: '/reports' });
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New analysis' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// ReportsTable rows
// -----------------------------------------------------------

describe('ReportsTable rows', () => {

  it('lists every report newest first with title, company, status, findings, language and both stamps', async () => {
    renderReports();
    await screen.findByText(DONE_TITLE);
    expect(columnHeaders()).toEqual(['Report', 'Company', 'Status', 'Findings', 'Language', 'Started', 'Finished']);
    expect(gridRows()).toEqual(ROWS_EN);
  });


  it('titles an untitled report "Report, <date of start>" and links every title to its report', async () => {
    renderReports();
    const done = await screen.findByRole('link', { name: DONE_TITLE });
    expect(done).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(screen.getByRole('link', { name: 'Report, 27/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
    expect(screen.getByRole('link', { name: 'Report, 20/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportFailed}`);
  });


  it('shows the running analysis\' progress as a bar named after its step, and none on ended rows', async () => {
    renderReports();
    const running = await rowOf('UAB Kreditas');
    const bar = within(running).getByRole('progressbar', { name: 'Gap analysis' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');
    expect(within(await rowOf(DONE_TITLE)).queryByRole('progressbar')).toBeNull();
    expect(within(await rowOf('Report, 20/09/2026')).queryByRole('progressbar')).toBeNull();
  });


  it('a queued analysis without progress yet shows an indeterminate bar named "Queued"', async () => {
    given.json('get', '/api/reports', { reports: [f.NEW.report] });
    renderReports();
    const row = await rowOf('UAB Pavyzdys');
    const bar = within(row).getByRole('progressbar', { name: 'Queued' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(within(row).getByText('Queued')).toBeInTheDocument();
  });


  it('a running row whose progress names no step still gets a named bar', async () => {
    const running = f.reports[0];
    given.json('get', '/api/reports', { reports: [{ ...running, progress: {} }] });
    renderReports();
    const row = await rowOf('UAB Kreditas');
    expect(within(row).getByRole('progressbar', { name: 'Running' })).toBeInTheDocument();
  });


  it('labels every status and a cancelled analysis too', async () => {
    const cancelled = { ...f.reports[2], id: 'e0000000-0000-4000-8000-0000000000cc', status: 'cancelled', jobStatus: 'cancelled', error: null };
    given.json('get', '/api/reports', { reports: [...f.reports, cancelled] });
    renderReports();
    await screen.findByText(DONE_TITLE);
    const statuses = within(screen.getByRole('grid')).getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('gridcell')[2].textContent);
    expect(statuses.sort()).toEqual(['Cancelled', 'Failed', 'Finished', 'Running']);
  });


  it('a report waiting for its list of acts says so — no progress bar, nothing is running', async () => {
    given.json('get', '/api/reports', { reports: WITH_WAITING });
    renderReports();
    const row = await rowOf('Awaiting scope approval');
    expect(gridRows()[0]).toBe('Report, 27/09/2026 | UAB Pavyzdys | Awaiting scope approval |  | Lithuanian | 27/09/2026, 09:50 | —');
    expect(within(row).queryByRole('progressbar')).toBeNull();
    expect(within(row).getByRole('link', { name: 'Report, 27/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportWaiting}`);
  });


  it('counts the findings of a finished report only, from its stored stats (the list rows carry no findings)', async () => {
    renderReports();
    const done = await rowOf(DONE_TITLE);
    expect(within(done).getByText('1 not met · 2 partial · 2 met')).toBeInTheDocument();
    expect(within(await rowOf('UAB Kreditas')).queryByText(/not met/)).toBeNull();
  });


  // The reviewer's verdict wins everywhere (docs/markdown/en/api.md): the
  // stats a list row carries count the EFFECTIVE statuses —
  // the register finding (missing → partial) counts as
  // partial. FE-REPORTS-1, fixed in the backend
  // (pipeline.finding_counts; a review recounts the stats,
  // which the PDF / Excel covers read too).
  it('counts a finished report\'s findings as the reviewer left them, like the report page does [FE-REPORTS-1, FIXED]', async () => {
    renderReports();
    const done = await rowOf(DONE_TITLE);
    expect(within(done).getByText('1 not met · 2 partial · 2 met')).toBeInTheDocument();
  });


  it('a click anywhere on a row opens that report', async () => {
    const { user } = renderReports();
    await user.click(await screen.findByText('UAB Kreditas'));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.reportRunning}`);
  });


  it('the title link opens the report once — the row click does not fire on top of it', async () => {
    const { user, router } = renderReports();
    await user.click(await screen.findByRole('link', { name: DONE_TITLE }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.reportDone}`);
    // One push: back returns to the list, not to a duplicate entry
    expect(router.state.historyAction).toBe('PUSH');
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/reports');
  });


  it('hides the company column when rendered inside one company (the company page\'s tab)', async () => {
    renderPage(<ReportsTable reports={f.reports.filter((row) => row.companyId === f.ID.pavyzdys)} loading={false} hideCompany />);
    await screen.findByText(DONE_TITLE);
    expect(columnHeaders()).toEqual(['Report', 'Status', 'Findings', 'Language', 'Started', 'Finished']);
    expect(gridRows()).toHaveLength(2);
  });


  it('drops rows it cannot link — no id, or an id already shown — instead of crashing the table', async () => {
    const broken = [f.reports[1], { ...f.reports[2], id: null }, { ...f.reports[0], id: undefined }, { ...f.reports[1], title: 'Duplicate' }, null];
    renderPage(<ReportsTable reports={broken} loading={false} />);
    await screen.findByText(DONE_TITLE);
    expect(gridRows()).toHaveLength(1);
    expect(screen.queryByText('Duplicate')).toBeNull();
  });
});







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------

describe('Reports filters', () => {

  it('the company filter asks the server for that company\'s reports (?companyId=) and drops the company column', async () => {
    const calls = given.capture('get', '/api/reports', { reports: f.reports.filter((row) => row.companyId === f.ID.kreditas) });
    const { user } = renderReports();
    await screen.findByText('UAB Kreditas', { selector: '[role="gridcell"]' });
    expect(calls[0].query).toEqual({});

    await pick(user, 'Company', 'UAB Kreditas');
    await waitFor(() => expect(calls.at(-1).query).toEqual({ companyId: f.ID.kreditas }));
    await waitFor(() => expect(columnHeaders()).not.toContain('Company'));
    expect(gridRows()).toEqual(['Report, 27/09/2026 | Running |  | Lithuanian | 27/09/2026, 09:40 | —']);
    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('UAB Kreditas');
  });


  it('clearing the company filter lists every company again', async () => {
    const calls = given.capture('get', '/api/reports', { reports: f.reports });
    const { user } = renderReports();
    await screen.findByText(DONE_TITLE);
    await pick(user, 'Company', 'UAB Pavyzdys');
    await waitFor(() => expect(calls.at(-1).query).toEqual({ companyId: f.ID.pavyzdys }));
    await waitFor(() => expect(columnHeaders()).not.toContain('Company'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue(''));
    await waitFor(() => expect(columnHeaders()).toContain('Company'));
    expect(calls.at(-1).query).toEqual({});
  });


  it('a failed company list says so under the filters with a retry — the reports still list — and the retry fills the picker', async () => {
    given.sequence('get', '/api/companies', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { companies: f.companies } }]);
    const { user } = renderReports();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The companies could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await pick(user, 'Company', 'UAB Kreditas');
    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('UAB Kreditas');
  });


  it('the status filter narrows the rows on the client without asking again', async () => {
    const calls = given.capture('get', '/api/reports', { reports: f.reports });
    const { user } = renderReports();
    await screen.findByText(DONE_TITLE);
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All', 'Queued', 'Running', 'Awaiting scope approval', 'Finished', 'Failed', 'Cancelled']);
    await user.click(screen.getByRole('option', { name: 'Failed' }));
    await waitFor(() => expect(gridRows()).toEqual([ROWS_EN[2]]));
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('the status filter finds the reports that wait for approval', async () => {
    given.json('get', '/api/reports', { reports: WITH_WAITING });
    const { user } = renderReports();
    await screen.findByText(DONE_TITLE);
    await pick(user, 'Status', 'Awaiting scope approval');
    await waitFor(() => expect(gridRows()).toEqual(['Report, 27/09/2026 | UAB Pavyzdys | Awaiting scope approval |  | Lithuanian | 27/09/2026, 09:50 | —']));
  });


  it('says so when the filters leave nothing — no call to action, the list is not empty', async () => {
    const { user } = renderReports();
    await screen.findByText(DONE_TITLE);
    await pick(user, 'Status', 'Cancelled');
    expect(await screen.findByText('No reports match the filters')).toBeInTheDocument();
    expect(screen.queryByText('Pick a company and run a compliance analysis.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'New analysis' })).toHaveLength(1);
    expect(screen.queryByRole('grid')).toBeNull();
  });
});







// -----------------------------------------------------------
// Empty, loading, failed
// -----------------------------------------------------------

describe('Reports states', () => {

  it('an empty list invites the first analysis — its own "New analysis" opens the dialog', async () => {
    given.json('get', '/api/reports', { reports: [] });
    const { user } = renderReports();
    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
    expect(screen.getByText('Pick a company and run a compliance analysis.')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    const buttons = screen.getAllByRole('button', { name: 'New analysis' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]);
    expect(await screen.findByRole('dialog', { name: 'Compliance analysis' })).toBeInTheDocument();
  });


  it('holds the grid with its loading overlay while the list is on the wire — no empty state, no alert', async () => {
    given.hang('get', '/api/reports');
    renderReports();
    await settle(50);
    // The grid's skeleton rows have no role — their class is the handle
    expect(screen.getByRole('grid').querySelector('.MuiDataGrid-skeletonLoadingOverlay')).not.toBeNull();
    expect(screen.queryByText('No reports yet')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('shows the translated failure with a retry, and the rows once the retry succeeds', async () => {
    given.sequence('get', '/api/reports', [{ status: 500, body: apiError('SERVER_ERROR', 'Internal server error') }, { body: { reports: f.reports } }]);
    const { user } = renderReports();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The reports could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText('No reports yet')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(DONE_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Polling
// -----------------------------------------------------------

describe('Reports polling', () => {

  const fakeClock = () => vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });


  it('re-reads the list every 5 s while an analysis runs, and the finished row flips by itself', async () => {
    const finished = f.reports.map((row) => (row.id === f.ID.reportRunning
      ? { ...row, status: 'done', jobStatus: 'done', finishedAt: '2026-09-27T10:04:00+00:00', stats: { findings: { met: 1, partial: 0, missing: 2 } } } : row));
    const calls = given.capture('get', '/api/reports', { reports: f.reports });
    fakeClock();
    renderReports();
    await screen.findByText(DONE_TITLE);
    expect(calls).toHaveLength(1);
    given.json('get', '/api/reports', { reports: finished });
    await act(async () => { vi.advanceTimersByTime(5000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    vi.useRealTimers();
    await waitFor(() => expect(gridRows()[0]).toBe('Report, 27/09/2026 | UAB Kreditas | Finished | 2 not met · 0 partial · 1 met | Lithuanian | 27/09/2026, 09:40 | 27/09/2026, 10:04'));
    expect(within(screen.getByRole('grid')).queryByRole('progressbar')).toBeNull();
  });


  it('does not poll for a report that only waits for its approval — it moves when a person acts', async () => {
    const calls = given.capture('get', '/api/reports', { reports: [f.waitingReport, ...f.reports.filter((row) => row.status !== 'running')] });
    fakeClock();
    renderReports();
    await screen.findByText('Awaiting scope approval');
    await act(async () => { vi.advanceTimersByTime(15000); });
    vi.useRealTimers();
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('does not poll when nothing is queued or running', async () => {
    const ended = f.reports.filter((row) => row.status !== 'running');
    const calls = given.capture('get', '/api/reports', { reports: ended });
    fakeClock();
    renderReports();
    await screen.findByText(DONE_TITLE);
    await act(async () => { vi.advanceTimersByTime(15000); });
    vi.useRealTimers();
    await settle(50);
    expect(calls).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Coming back to the list
// -----------------------------------------------------------
//
// Both filters and the table's page and sort live in the
// address (replaced): Back from a report, its back link or a
// reload finds the list as it was left. A company the
// caller's list does not hold is ignored once it is known.
// -----------------------------------------------------------

describe('Reports — coming back to the list', () => {

  it('the company, the status and the sort come from the address', async () => {
    const calls = given.capture('get', '/api/reports', { reports: f.reports.filter((row) => row.companyId === f.ID.pavyzdys) });
    renderReports({ route: `/reports?company=${f.ID.pavyzdys}&status=done&sort=createdAt.asc` });
    await waitFor(() => expect(gridRows()).toEqual([
      `${DONE_TITLE} | Finished | 1 not met · 2 partial · 2 met | Lithuanian | 21/09/2026, 09:15 | 21/09/2026, 09:31`,
    ]));
    expect(calls[0].query).toEqual({ companyId: f.ID.pavyzdys });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('UAB Pavyzdys'));
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Finished');
    expect(screen.getByRole('columnheader', { name: /^Started/ })).toHaveAttribute('aria-sort', 'ascending');
  });


  it('the filters write the address, replacing the entry — a new filter starts on the first page', async () => {
    const { user, router } = renderReports({ route: '/reports?page=2' });
    await screen.findByText(DONE_TITLE);
    await pick(user, 'Status', 'Failed');
    await waitFor(() => expect(router.state.location.search).toBe('?status=failed'));
    expect(router.state.historyAction).toBe('REPLACE');
    await pick(user, 'Company', 'UAB Pavyzdys');
    await waitFor(() => expect(router.state.location.search).toBe(`?status=failed&company=${f.ID.pavyzdys}`));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=failed'));
  });


  it('a company the caller\'s list does not hold, or a status the page does not know, is ignored', async () => {
    const calls = given.capture('get', '/api/reports', { reports: f.reports });
    renderReports({ route: '/reports?company=c9999999-0000-4000-8000-000000000099&status=exploded' });
    await waitFor(() => expect(gridRows()).toEqual(ROWS_EN));
    await waitFor(() => expect(calls.at(-1).query).toEqual({}));
    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('');
  });


  it('in Lithuanian too', async () => {
    renderReports({ route: `/reports?company=${f.ID.kreditas}&status=running`, locale: 'lt' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Įmonė' })).toHaveValue('UAB Kreditas'));
    expect(screen.getByRole('combobox', { name: 'Būsena' })).toHaveTextContent('Vykdoma');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('Reports in Lithuanian', () => {

  it('speaks Lithuanian: heading, filters, columns, statuses, counts, dated titles and stamps', async () => {
    renderReports({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Ataskaitos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nauja analizė' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Įmonė' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Būsena' })).toBeInTheDocument();
    await screen.findByText(DONE_TITLE);
    expect(columnHeaders()).toEqual(['Ataskaita', 'Įmonė', 'Būsena', 'Išvados', 'Kalba', 'Pradėta', 'Baigta']);
    expect(gridRows()).toEqual([
      'Ataskaita, 2026-09-27 | UAB Kreditas | Vykdoma |  | Lietuvių | 2026-09-27 09:40 | —',
      `${DONE_TITLE} | UAB Pavyzdys | Baigta | 1 neatitinka · 2 iš dalies · 2 atitinka | Lietuvių | 2026-09-21 09:15 | 2026-09-21 09:31`,
      'Ataskaita, 2026-09-20 | UAB Pavyzdys | Nepavyko |  | Lietuvių | 2026-09-20 15:02 | 2026-09-20 15:05',
    ]);
    expect(screen.getByRole('progressbar', { name: 'Atitikties spragų analizė' })).toBeInTheDocument();
  });


  it('names the waiting status in Lithuanian — in the row and in the filter', async () => {
    given.json('get', '/api/reports', { reports: WITH_WAITING });
    const { user } = renderReports({ locale: 'lt' });
    await screen.findByText(DONE_TITLE);
    expect(gridRows()[0]).toBe('Ataskaita, 2026-09-27 | UAB Pavyzdys | Laukia apimties patvirtinimo |  | Lietuvių | 2026-09-27 09:50 | —');
    await user.click(screen.getByRole('combobox', { name: 'Būsena' }));
    expect(await screen.findByRole('option', { name: 'Laukia apimties patvirtinimo' })).toBeInTheDocument();
  });


  it('says the empty and the failed states in Lithuanian', async () => {
    given.sequence('get', '/api/reports', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { reports: [] } }]);
    const { user } = renderReports({ locale: 'lt' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nepavyko įkelti ataskaitų');
    await user.click(within(alert).getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('Ataskaitų dar nėra')).toBeInTheDocument();
    expect(screen.getByText('Pasirinkite įmonę ir paleiskite atitikties analizę.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant of the list the page reads; the
// company filter's GET /api/companies is the start dialog's
// matrix (start-analysis.test.jsx).
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/reports',
  fixture: { reports: f.reports },
  render: () => renderReports(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Reports' }),
  loaded: async () => { await screen.findByText(DONE_TITLE); },
  loading: () => screen.getByRole('grid').querySelector('.MuiDataGrid-skeletonLoadingOverlay'),
});
