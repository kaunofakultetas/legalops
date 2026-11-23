// -----------------------------------------------------------
//  [*] Tests — CompanyReports and CompanyThreads (the
//      reports and chats tabs)
//
//  The two read-only tabs of /companies/:companyId end to
//  end against the backend double, rendered in their page
//  (the reports table's order kept in ?reports.sort=).
//  Reports: GET /api/reports?companyId= through the shared
//  reports table without its company column (the title as a
//  link — the untitled one named by its date — the status,
//  the finding counts of a finished report, the language, the
//  stamps, a row click, the live progress bar of a running
//  analysis and the 5-second poll that follows it, no poll
//  when nothing runs — a report waiting for its list of acts
//  to be approved names that status, without a bar and
//  without a poll), the empty tab whose "Run compliance
//  analysis" opens the start dialog, the failure with its
//  retry. Chats: GET /api/chat/threads?companyId= (the links
//  into the chat, "Untitled chat", the stamp, the loading
//  bar, the empty tab, the failure with its retry). Both
//  languages, and the contract matrices for both GETs.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { http } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const REPORT_DONE = f.reports.find((row) => row.id === f.ID.reportDone);
const REPORT_FAILED = f.reports.find((row) => row.id === f.ID.reportFailed);
const REPORT_RUNNING = f.reports.find((row) => row.id === f.ID.reportRunning);
const LICENCE_THREAD = f.threads.find((row) => row.id === f.ID.licenceThread);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderTab: the company page on one tab; waits for the page.
//
// gridRows: the grid's cell texts.
//
// spy: records the query of every request and lets the
// default handler answer it.
// -----------------------------------------------------------

async function renderTab(tab, { id = f.ID.pavyzdys, locale = 'en', session = authData } = {}) {
  const view = renderPage(<CompanyDetail authData={session} />, { route: `/companies/${id}?tab=${tab}`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: f.company(id).name });
  return view;
}

const panel = () => screen.getByRole('tabpanel');

const gridRows = () => within(screen.getByRole('grid')).queryAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
  .filter((cells) => cells.length > 0);

function spy(method, path) {
  const calls = [];
  server.use(http[method](url(path), ({ request }) => {
    calls.push(Object.fromEntries(new URL(request.url).searchParams));
  }));
  return calls;
}

const navigatedTo = async (path) => {
  await waitFor(() => expect(screen.getByTestId('navigated-away')).toHaveTextContent(path));
};







// -----------------------------------------------------------
// Reports
// -----------------------------------------------------------

describe('CompanyReports', () => {

  it('keeps its order under its own name in the address (?reports.sort=) — the page\'s ?tab= stays', async () => {
    const { user, router } = await renderTab('reports');
    await within(panel()).findByRole('link', { name: REPORT_DONE.title });
    // Newest first is the default: a click clears it ("none"), a second sorts oldest first
    const header = () => within(screen.getByRole('grid')).getByRole('columnheader', { name: /^Started/ });
    await user.click(header().querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=reports&reports.sort=none'));
    expect(router.state.historyAction).toBe('REPLACE');
    await user.click(header().querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=reports&reports.sort=createdAt.asc'));
    await waitFor(() => expect(gridRows()[0][0]).toBe('Report, 20/09/2026'));
  });


  it('asks for this company\'s reports and lists them newest first, without a company column', async () => {
    const calls = spy('get', '/api/reports');
    await renderTab('reports');
    expect(within(panel()).getByRole('heading', { name: 'Compliance reports' })).toBeInTheDocument();
    await within(panel()).findByRole('link', { name: REPORT_DONE.title });
    expect(calls).toEqual([{ companyId: f.ID.pavyzdys }]);
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Report', 'Status', 'Findings', 'Language', 'Started', 'Finished']);
    expect(gridRows()).toEqual([
      [REPORT_DONE.title, 'Finished', '1 not met · 2 partial · 2 met', 'Lithuanian', '21/09/2026, 09:15', '21/09/2026, 09:31'],
      ['Report, 20/09/2026', 'Failed', '', 'Lithuanian', '20/09/2026, 15:02', '20/09/2026, 15:05'],
    ]);
  });


  it('each title is a real link to its report', async () => {
    await renderTab('reports');
    expect(await within(panel()).findByRole('link', { name: REPORT_DONE.title })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(within(panel()).getByRole('link', { name: 'Report, 20/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportFailed}`);
  });


  it('following a title, or clicking anywhere on its row, opens the report', async () => {
    const { user } = await renderTab('reports');
    await user.click(await within(panel()).findByText('Failed'));
    await navigatedTo(`/reports/${f.ID.reportFailed}`);
  });


  it('a running analysis shows its live progress under the status, and the tab polls every 5 s while it runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: new Date(f.NOW) });
    const calls = spy('get', '/api/reports');
    await renderTab('reports', { id: f.ID.kreditas });
    const bar = await within(panel()).findByRole('progressbar', { name: 'Gap analysis' });
    expect(bar).toHaveAttribute('aria-valuenow', String(REPORT_RUNNING.progress.percent));
    expect(within(panel()).getByText('Running')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    await waitFor(() => expect(calls).toHaveLength(2));
  });


  it('does not poll when no analysis of the company runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: new Date(f.NOW) });
    const calls = spy('get', '/api/reports');
    await renderTab('reports');
    await within(panel()).findByRole('link', { name: REPORT_DONE.title });
    await act(async () => { vi.advanceTimersByTime(12000); });
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('a report waiting for its list of acts says so — no progress bar, and the tab does not poll for it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: new Date(f.NOW) });
    const calls = given.capture('get', '/api/reports', { reports: [f.waitingReport, REPORT_DONE, REPORT_FAILED] });
    await renderTab('reports');
    expect(await within(panel()).findByText('Awaiting scope approval')).toBeInTheDocument();
    expect(gridRows()[0]).toEqual(['Report, 27/09/2026', 'Awaiting scope approval', '', 'Lithuanian', '27/09/2026, 09:50', '—']);
    expect(within(panel()).queryByRole('progressbar')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(12000); });
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('names the waiting status in Lithuanian', async () => {
    given.json('get', '/api/reports', { reports: [f.waitingReport, REPORT_DONE, REPORT_FAILED] });
    await renderTab('reports', { locale: 'lt' });
    expect(await within(panel()).findByText('Laukia apimties patvirtinimo')).toBeInTheDocument();
  });


  it('no reports → the empty state explains the analysis and offers to run one — the start dialog, fixed to this company', async () => {
    given.json('get', '/api/reports', { reports: [] });
    const { user } = await renderTab('reports');
    // The empty state's words are a polite status
    const status = (await within(panel()).findByText('No reports yet')).closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('Run a compliance analysis — it determines the applicable acts, assesses the obligations and drafts an action plan.');
    expect(within(panel()).queryByRole('grid')).toBeNull();
    await user.click(within(panel()).getByRole('button', { name: 'Run compliance analysis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compliance analysis' });
    expect(within(dialog).queryByRole('combobox', { name: 'Company' })).toBeNull();
  });


  it('a failed list is said in words with a retry, not as "no reports"; the retry loads them', async () => {
    given.sequence('get', '/api/reports', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { reports: [REPORT_DONE, REPORT_FAILED] } },
    ]);
    const { user } = await renderTab('reports');
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(panel()).queryByText('No reports yet')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(panel()).findByRole('link', { name: REPORT_DONE.title })).toBeInTheDocument();
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });


  it('the grid says it is busy while the list is on its way', async () => {
    given.hang('get', '/api/reports');
    await renderTab('reports');
    expect(await within(panel()).findByRole('grid', { name: 'Reports', busy: true })).toBeInTheDocument();
    expect(within(panel()).queryByText('No reports yet')).toBeNull();
  });


  it('a plain user sees the same tab (their own company\'s reports)', async () => {
    await renderTab('reports', { session: userAuthData });
    expect(await within(panel()).findByRole('link', { name: REPORT_DONE.title })).toBeInTheDocument();
  });


  it('speaks Lithuanian: the columns, the statuses, the counts, the untitled report and the stamps', async () => {
    await renderTab('reports', { locale: 'lt' });
    expect(within(panel()).getByRole('heading', { name: 'Atitikties ataskaitos' })).toBeInTheDocument();
    await within(panel()).findByRole('link', { name: REPORT_DONE.title });
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Ataskaita', 'Būsena', 'Išvados', 'Kalba', 'Pradėta', 'Baigta']);
    expect(gridRows()).toEqual([
      [REPORT_DONE.title, 'Baigta', '1 neatitinka · 2 iš dalies · 2 atitinka', 'Lietuvių', '2026-09-21 09:15', '2026-09-21 09:31'],
      ['Ataskaita, 2026-09-20', 'Nepavyko', '', 'Lietuvių', '2026-09-20 15:02', '2026-09-20 15:05'],
    ]);
  });


  it('the empty tab in Lithuanian', async () => {
    given.json('get', '/api/reports', { reports: [] });
    await renderTab('reports', { locale: 'lt' });
    expect(await within(panel()).findByText('Ataskaitų dar nėra')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Pradėti atitikties analizę' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Chats
// -----------------------------------------------------------

describe('CompanyThreads', () => {

  it('asks for the caller\'s chats about this company and links each into the chat, with its stamp', async () => {
    const calls = spy('get', '/api/chat/threads');
    await renderTab('threads');
    expect(within(panel()).getByRole('heading', { name: 'Related chats' })).toBeInTheDocument();
    expect(within(panel()).getByText('Your chats linked to this company.')).toBeInTheDocument();
    const link = await within(panel()).findByRole('link', { name: LICENCE_THREAD.title });
    expect(link).toHaveAttribute('href', `/chat/${f.ID.licenceThread}`);
    expect(within(panel()).getByText('Updated 21/09/2026, 09:02')).toBeInTheDocument();
    expect(calls).toEqual([{ companyId: f.ID.pavyzdys }]);
    // Only this company's: the DORA question has no company
    expect(within(panel()).queryByText(/Per kiek laiko/)).toBeNull();
  });


  it('following a chat opens it', async () => {
    const { user } = await renderTab('threads');
    await user.click(await within(panel()).findByRole('link', { name: LICENCE_THREAD.title }));
    await navigatedTo(`/chat/${f.ID.licenceThread}`);
  });


  it('a chat without a title reads "Untitled chat"; a chat never updated shows when it was created', async () => {
    given.json('get', '/api/chat/threads', { threads: [{ ...LICENCE_THREAD, title: null, updatedAt: null, createdAt: '2026-09-21T09:00:12+00:00' }] });
    await renderTab('threads');
    expect(await within(panel()).findByRole('link', { name: 'Untitled chat' })).toBeInTheDocument();
    expect(within(panel()).getByText('Updated 21/09/2026, 09:00')).toBeInTheDocument();
  });


  it('a bar shows while the chats load, and no empty state meanwhile', async () => {
    given.hang('get', '/api/chat/threads');
    await renderTab('threads');
    expect(await within(panel()).findByRole('progressbar', { name: 'Related chats' })).toBeInTheDocument();
    expect(within(panel()).queryByText('No linked chats')).toBeNull();
  });


  it('no chats → "No linked chats", the new-chat button still there', async () => {
    given.json('get', '/api/chat/threads', { threads: [] });
    await renderTab('threads');
    expect((await within(panel()).findByText('No linked chats')).closest('[role="status"]')).not.toBeNull();
    expect(within(panel()).getByRole('button', { name: 'New chat about the company' })).toBeEnabled();
    expect(within(panel()).queryByRole('progressbar')).toBeNull();
  });


  it('a failed list is said in words with a retry; the retry loads them', async () => {
    given.sequence('get', '/api/chat/threads', [
      { status: 502, html: '<html><body><h1>502 Bad Gateway</h1></body></html>' },
      { body: { threads: [LICENCE_THREAD] } },
    ]);
    const { user } = await renderTab('threads');
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('The server is temporarily unreachable. Try again.');
    expect(within(panel()).queryByText('No linked chats')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(panel()).findByRole('link', { name: LICENCE_THREAD.title })).toBeInTheDocument();
  });


  it('speaks Lithuanian', async () => {
    given.json('get', '/api/chat/threads', { threads: [LICENCE_THREAD, { ...LICENCE_THREAD, id: f.ID.newThread, title: '' }] });
    await renderTab('threads', { locale: 'lt' });
    expect(within(panel()).getByRole('heading', { name: 'Susiję pokalbiai' })).toBeInTheDocument();
    expect(await within(panel()).findByRole('link', { name: 'Pokalbis be pavadinimo' })).toBeInTheDocument();
    expect(within(panel()).getAllByText('Atnaujinta 2026-09-21 09:02')).toHaveLength(2);
    expect(within(panel()).getByRole('button', { name: 'Naujas pokalbis apie įmonę' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the two lists.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/reports',
  fixture: { reports: [REPORT_DONE, REPORT_FAILED] },
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=reports`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Compliance reports' }),
  loaded: async () => { await screen.findByRole('link', { name: REPORT_DONE.title }); },
  loading: () => screen.getByRole('grid', { busy: true }),
});

describeEndpointContract({
  path: '/api/chat/threads',
  fixture: { threads: [LICENCE_THREAD] },
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=threads`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Related chats' }),
  loaded: async () => { await screen.findByRole('link', { name: LICENCE_THREAD.title }); },
  loading: () => screen.getByRole('progressbar', { name: 'Related chats' }),
});
