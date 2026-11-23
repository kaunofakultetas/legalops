// -----------------------------------------------------------
//  [*] Tests — Dashboard page (the landing overview)
//
//  The /dashboard page end to end against the backend double:
//  the KPI tiles and the counts they derive from GET
//  /api/companies, /api/reports, /api/corpus/documents and —
//  for an admin only — /api/obligations?status=proposed&
//  limit=1 and /api/users (a plain user never asks those two),
//  each tile's failure state (the admin-only tiles show their
//  own error with a retry, the others leave it to their
//  section) and the tiles as links; today's AI budget from
//  GET /api/usage?days=1 (unlimited for an admin, a meter
//  with its near- and over-limit states, a token budget, a
//  failure with a retry); the latest reports and companies
//  (a report waiting for its list of acts to be approved is
//  named as such, and counted under the running tile);
//  the corpus health card (ready / processing / failed /
//  no-text / switched-off counts, the failed acts with their
//  reasons, nothing while loading); the job queue (the exact
//  counters linking to the jobs page filtered to their status,
//  the latest five jobs in words with their subject links, a
//  retry that asks again whichever request failed); the 10 s
//  polls (the queue always, the reports only while an
//  analysis runs); Lithuanian; and the backend contract
//  matrix for all eight GETs.
// -----------------------------------------------------------

import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, apiError, server } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Dashboard from '@/pages/Dashboard/Dashboard';


// The clock functions the polls run on
const POLL_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];

// Every GET the dashboard sends for an admin (path + query);
// a plain user's are the same minus the last two
const USER_GETS = ['/api/companies', '/api/reports', '/api/corpus/documents', '/api/usage?days=1', '/api/jobs/counts', '/api/jobs?limit=5'];
const ADMIN_GETS = [...USER_GETS, '/api/obligations?status=proposed&limit=1', '/api/users'];

// The finished report's model-written title
const DONE_TITLE = 'UAB Pavyzdys atitikties vertinimas: MiCA, DORA ir PPTFPĮ';

// Every job count at zero
const NO_JOBS = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };

// Listeners on the msw server, removed after each test
const stopRecording = [];

afterEach(() => {
  while (stopRecording.length) stopRecording.pop()();
});







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// main: the page's content landmark — the sidebar carries
// links named like some tiles, so lookups stay inside it.
// tile / section / rowsOf: a KPI tile is a link named by its
// label and value; a card is a <section> labelled by its
// heading (a region); its rows are list items. counter: a
// queue counter is a link too, but its two lines are inline
// spans without CSS in jsdom, so its name reads
// "Queued1" — the pattern allows either. recordGets: every
// GET the page sends, as path + query, in order.
// -----------------------------------------------------------

const main = () => screen.getByRole('main');

const renderDashboard = (session = authData, options = {}) =>
  renderPage(<Dashboard authData={session} />, { route: '/dashboard', path: '/dashboard', ...options });

const tile = (name) => within(main()).getByRole('link', { name });

const findTile = (name) => within(main()).findByRole('link', { name });

const section = (name) => within(main()).getByRole('region', { name });

const rowsOf = (name) => within(section(name)).queryAllByRole('listitem');

const counter = (label, value) => within(main()).getByRole('link', { name: new RegExp(`^${label}\\s*${value}$`) });

const findCounter = (label, value) => within(main()).findByRole('link', { name: new RegExp(`^${label}\\s*${value}$`) });

function recordGets() {
  const seen = [];
  const listener = ({ request }) => {
    if (request.method !== 'GET') return;
    const { pathname, search } = new URL(request.url);
    seen.push(`${pathname}${search}`);
  };
  server.events.on('request:start', listener);
  stopRecording.push(() => server.events.removeListener('request:start', listener));
  return seen;
}

// The page has settled when its last card (the queue) is full
const loaded = async () => {
  await within(main()).findByText('Scheduled job: Maintenance');
  await findTile('Users 3');
};







// -----------------------------------------------------------
// The frame
// -----------------------------------------------------------

describe('Dashboard — the frame', () => {

  it('titles the page "Overview" inside the layout and greets the signed-in account by name', async () => {
    renderDashboard();
    expect(within(main()).getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(within(main()).getByText('Welcome, Rūta Administratorė')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    await loaded();
  });


  it('greets a plain user by their own name', async () => {
    renderDashboard(userAuthData);
    expect(within(main()).getByText('Welcome, Jonas Naudotojas')).toBeInTheDocument();
    await within(main()).findByText('Scheduled job: Maintenance');
  });


  it('lays the cards out in order: the tiles, the budget, then the reports, companies, corpus and queue', async () => {
    renderDashboard();
    await loaded();
    const headings = within(main()).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['AI budget today', 'Latest reports', 'Latest companies', 'Legal corpus', 'Latest jobs']);
  });
});







// -----------------------------------------------------------
// KPI tiles
// -----------------------------------------------------------
//
// The counts, what they are derived from, who asks which
// route, the failure states and the tiles as links.
// -----------------------------------------------------------

describe('KPI tiles', () => {

  it('shows an admin the six headline counts, each tile a link to its page', async () => {
    renderDashboard();
    const expected = [
      ['Companies 2', '/companies'],
      ['Finished reports 1', '/reports'],
      ['Running analyses 1', '/reports'],
      ['Legal acts ready 5 of 6', '/corpus'],
      ['Obligations to review 4', '/obligations'],
      ['Users 3', '/users'],
    ];
    for (const [name, href] of expected) {
      expect(await findTile(name)).toHaveAttribute('href', href);
    }
  });


  it('counts finished and still-going analyses apart — a queued one is still going, a failed or cancelled one neither', async () => {
    const [running, done, failed] = f.reports;
    given.json('get', '/api/reports', { reports: [
      running,
      { ...running, id: 'e0000000-0000-4000-8000-0000000000a1', status: 'queued' },
      done,
      { ...done, id: 'e0000000-0000-4000-8000-0000000000a2' },
      failed,
      { ...failed, id: 'e0000000-0000-4000-8000-0000000000a3', status: 'cancelled' },
    ] });
    renderDashboard();
    expect(await findTile('Finished reports 2')).toBeInTheDocument();
    expect(tile('Running analyses 2')).toBeInTheDocument();
  });


  it('a report waiting for its list of acts is neither finished nor running — the running tile says how many wait', async () => {
    given.json('get', '/api/reports', { reports: [f.waitingReport, ...f.reports] });
    renderDashboard();
    expect(await findTile('Running analyses 1 awaiting approval: 1')).toHaveAttribute('href', '/reports');
    expect(tile('Finished reports 1')).toBeInTheDocument();
  });


  it('counts the ready acts among the acts in use, and all the acts in use as "of N" — a switched-off act is in neither', async () => {
    const [aiAct, dora, mica] = f.acts;
    given.json('get', '/api/corpus/documents', { documents: [
      aiAct,
      { ...dora, currentVersion: { ...dora.currentVersion, status: 'embedding' } },
      { ...mica, enabled: false },
    ] });
    renderDashboard();
    expect(await findTile('Legal acts ready 1 of 2')).toHaveAttribute('href', '/corpus');
  });


  it('takes the review count from the total of the one-row obligations page, not from the rows', async () => {
    const calls = given.capture('get', '/api/obligations', { obligations: f.obligations.slice(0, 1), total: 17 });
    renderDashboard();
    expect(await findTile('Obligations to review 17')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({ status: 'proposed', limit: '1' });
  });


  it('asks exactly its eight routes for an admin', async () => {
    const gets = recordGets();
    renderDashboard();
    await loaded();
    await settle(50);
    expect([...new Set(gets)].sort()).toEqual([...ADMIN_GETS].sort());
  });


  it('shows a plain user the four shared tiles and never asks the admin-only routes', async () => {
    const gets = recordGets();
    const obligations = given.capture('get', '/api/obligations', { obligations: [], total: 0 });
    const users = given.capture('get', '/api/users', { users: f.users });
    renderDashboard(userAuthData);
    expect(await findTile('Companies 2')).toBeInTheDocument();
    expect(tile('Finished reports 1')).toBeInTheDocument();
    expect(tile('Running analyses 1')).toBeInTheDocument();
    expect(tile('Legal acts ready 5 of 6')).toBeInTheDocument();
    await within(main()).findByText('Scheduled job: Maintenance');
    await settle(100);
    expect(within(main()).queryByRole('link', { name: /^Obligations to review/ })).toBeNull();
    expect(within(main()).queryByRole('link', { name: /^Users/ })).toBeNull();
    expect(obligations).toHaveLength(0);
    expect(users).toHaveLength(0);
    expect([...new Set(gets)].sort()).toEqual([...USER_GETS].sort());
  });


  it('shows "—" in every tile until its answer lands', async () => {
    for (const path of ['/api/companies', '/api/reports', '/api/corpus/documents', '/api/obligations', '/api/users']) given.hang('get', path);
    renderDashboard();
    await within(main()).findByText('Scheduled job: Maintenance');
    for (const label of ['Companies', 'Finished reports', 'Running analyses', 'Legal acts ready', 'Obligations to review', 'Users']) {
      expect(tile(`${label} —`)).toBeInTheDocument();
    }
    expect(within(main()).queryByRole('alert')).toBeNull();
  });


  it('a failed user count shows its error in the tile\'s place with a retry, the other tiles standing; the retry brings the count', async () => {
    given.sequence('get', '/api/users', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { users: f.users } }]);
    const { user } = renderDashboard();
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('Users');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(main()).queryByRole('link', { name: /^Users/ })).toBeNull();
    expect(await findTile('Obligations to review 4')).toBeInTheDocument();
    expect(tile('Companies 2')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await findTile('Users 3')).toBeInTheDocument();
    await waitFor(() => expect(within(main()).queryByRole('alert')).toBeNull());
  });


  it('a refused review count says why in its tile', async () => {
    given.apiError('get', '/api/obligations', 'FORBIDDEN', { status: 403 });
    renderDashboard();
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('Obligations to review');
    expect(alert).toHaveTextContent('You are not allowed to do this.');
    expect(await findTile('Users 3')).toBeInTheDocument();
  });


  it('a failed reports list leaves both report tiles at "—" and says why in its section — the rest of the page stands', async () => {
    given.apiError('get', '/api/reports', 'SERVER_ERROR', { status: 500 });
    renderDashboard();
    const alert = await within(section('Latest reports')).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(tile('Finished reports —')).toBeInTheDocument();
    expect(tile('Running analyses —')).toBeInTheDocument();
    expect(within(section('Latest reports')).queryByText('No reports yet')).toBeNull();
    expect(await findTile('Companies 2')).toBeInTheDocument();
    expect(await within(section('Latest companies')).findByRole('link', { name: 'UAB Kreditas' })).toBeInTheDocument();
    expect(within(main()).getAllByRole('alert')).toHaveLength(1);
  });


  it('a failed companies or corpus list does the same for its tile', async () => {
    given.apiError('get', '/api/companies', 'SERVER_ERROR', { status: 500 });
    given.networkError('get', '/api/corpus/documents');
    renderDashboard();
    expect(await within(section('Latest companies')).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(await within(section('Legal corpus')).findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
    expect(tile('Companies —')).toBeInTheDocument();
    expect(tile('Legal acts ready —')).toBeInTheDocument();
    expect(await findTile('Finished reports 1')).toBeInTheDocument();
  });


  it('a click on a tile opens its page', async () => {
    const { user, router } = renderDashboard();
    await user.click(await findTile('Obligations to review 4'));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/obligations');
    expect(router.state.location.pathname).toBe('/obligations');
  });
});







// -----------------------------------------------------------
// AI budget
// -----------------------------------------------------------
//
// Today's budget of the signed-in account as the meter
// shows it, and its failure.
// -----------------------------------------------------------

describe('AI budget', () => {

  it('shows an admin today\'s spend as unlimited — no meter bar — from the one-day usage', async () => {
    const calls = given.capture('get', '/api/usage', f.usage({ days: 1 }));
    renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'AI budget today' });
    expect(within(card).getByText('Used')).toBeInTheDocument();
    expect(within(card).getByText('$0.216 · Unlimited')).toBeInTheDocument();
    expect(within(card).queryByRole('meter')).toBeNull();
    expect(calls[0].query).toEqual({ days: '1' });
  });


  it('shows a plain user\'s budget as a meter: used of the limit, readable by assistive technology', async () => {
    given.json('get', '/api/usage', f.usage({ days: 1, userId: f.ID.jonas }));
    renderDashboard(userAuthData);
    const card = await within(main()).findByRole('region', { name: 'AI budget today' });
    expect(within(card).getByText('$0.0526 of $5.00')).toBeInTheDocument();
    const meter = within(card).getByRole('meter', { name: 'Used' });
    expect(meter).toHaveAttribute('aria-valuenow', '0.0526');
    expect(meter).toHaveAttribute('aria-valuemax', '5');
    expect(meter).toHaveAttribute('aria-valuetext', '$0.0526 of $5.00');
    expect(within(card).queryByText('Close to the limit')).toBeNull();
    expect(within(card).queryByText('Limit exceeded')).toBeNull();
  });


  it('warns in words close to the limit and past it', async () => {
    const budget = { limit: 5, used: 4.2, remaining: 0.8, unit: 'USD' };
    given.json('get', '/api/usage', { ...f.usage({ days: 1 }), budget });
    const { unmount } = renderDashboard(userAuthData);
    const card = await within(main()).findByRole('region', { name: 'AI budget today' });
    expect(within(card).getByText('$4.20 of $5.00')).toBeInTheDocument();
    expect(within(card).getByText('Close to the limit')).toBeInTheDocument();
    unmount();

    given.json('get', '/api/usage', { ...f.usage({ days: 1 }), budget: { ...budget, used: 5.35, remaining: 0 } });
    renderDashboard(userAuthData);
    const over = await within(main()).findByRole('region', { name: 'AI budget today' });
    expect(within(over).getByText('$5.35 of $5.00')).toBeInTheDocument();
    expect(within(over).getByText('Limit exceeded')).toBeInTheDocument();
    // The bar is full, not past its end
    expect(within(over).getByRole('meter')).toHaveAttribute('aria-valuenow', '5');
  });


  it('formats a budget kept in tokens as tokens', async () => {
    given.json('get', '/api/usage', { ...f.usage({ days: 1 }), budget: { limit: 50000, used: 12000, remaining: 38000, unit: 'tokens' } });
    renderDashboard(userAuthData);
    const card = await within(main()).findByRole('region', { name: 'AI budget today' });
    expect(within(card).getByText('12k of 50k')).toBeInTheDocument();
  });


  it('a failed usage request shows the budget card with the error and a retry, which brings the meter', async () => {
    given.sequence('get', '/api/usage', [{ status: 503 }, { body: f.usage({ days: 1 }) }]);
    const { user } = renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'AI budget today' });
    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    expect(alert).toHaveTextContent('The service is temporarily unavailable. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(card).findByText('$0.216 · Unlimited')).toBeInTheDocument();
    await waitFor(() => expect(within(card).queryByRole('alert')).toBeNull());
  });


  it('shows no budget card while the usage loads, nor for an answer without a budget', async () => {
    given.hang('get', '/api/usage');
    const { unmount } = renderDashboard();
    await loaded();
    expect(within(main()).queryByRole('region', { name: 'AI budget today' })).toBeNull();
    unmount();

    const { budget, ...withoutBudget } = f.usage({ days: 1 });
    expect(budget).toBeTruthy();
    given.json('get', '/api/usage', withoutBudget);
    renderDashboard();
    await loaded();
    expect(within(main()).queryByRole('region', { name: 'AI budget today' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Latest reports / latest companies
// -----------------------------------------------------------

describe('Latest reports', () => {

  it('lists the reports newest first: status, title — or "Report, <date>" until one is written — company and start', async () => {
    renderDashboard();
    await within(section('Latest reports')).findByRole('link', { name: DONE_TITLE });
    const rows = rowsOf('Latest reports');
    expect(rows).toHaveLength(3);

    const [running, done, failed] = rows;
    expect(within(running).getByText('Running')).toBeInTheDocument();
    expect(within(running).getByRole('link', { name: 'Report, 27/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
    expect(within(running).getByText('UAB Kreditas · 27/09/2026, 09:40')).toBeInTheDocument();

    expect(within(done).getByText('Finished')).toBeInTheDocument();
    expect(within(done).getByRole('link', { name: DONE_TITLE })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(within(done).getByText('UAB Pavyzdys · 21/09/2026, 09:15')).toBeInTheDocument();

    expect(within(failed).getByText('Failed')).toBeInTheDocument();
    expect(within(failed).getByRole('link', { name: 'Report, 20/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportFailed}`);
  });


  it('names a report that waits for its list of acts to be approved, with the way to it', async () => {
    given.json('get', '/api/reports', { reports: [f.waitingReport, ...f.reports] });
    renderDashboard();
    await within(section('Latest reports')).findByText('Awaiting scope approval');
    const [waiting] = rowsOf('Latest reports');
    expect(within(waiting).getByText('Awaiting scope approval')).toBeInTheDocument();
    expect(within(waiting).getByRole('link', { name: 'Report, 27/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportWaiting}`);
    expect(within(waiting).getByText('UAB Pavyzdys · 27/09/2026, 09:50')).toBeInTheDocument();
  });


  it('shows the five newest reports at most', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...f.reports[1], id: `e0000000-0000-4000-8000-0000000001${i}0`, title: `Ataskaita nr. ${i + 1}` }));
    given.json('get', '/api/reports', { reports: many });
    renderDashboard();
    await within(section('Latest reports')).findByRole('link', { name: 'Ataskaita nr. 1' });
    expect(rowsOf('Latest reports').map((row) => within(row).getByRole('link').textContent))
      .toEqual(['Ataskaita nr. 1', 'Ataskaita nr. 2', 'Ataskaita nr. 3', 'Ataskaita nr. 4', 'Ataskaita nr. 5']);
    // The tiles still count every report
    expect(tile('Finished reports 7')).toBeInTheDocument();
  });


  it('says "No reports yet" for an empty list, and its "All" button opens the reports page', async () => {
    given.json('get', '/api/reports', { reports: [] });
    const { user } = renderDashboard();
    expect(await within(section('Latest reports')).findByText('No reports yet')).toBeInTheDocument();
    expect(rowsOf('Latest reports')).toHaveLength(0);
    expect(tile('Finished reports 0')).toBeInTheDocument();
    await user.click(within(section('Latest reports')).getByRole('link', { name: 'All' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/reports');
  });


  it('a failed list says so with a retry instead of "No reports yet", and the retry lists them', async () => {
    given.sequence('get', '/api/reports', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { reports: f.reports } }]);
    const { user } = renderDashboard();
    const alert = await within(section('Latest reports')).findByRole('alert');
    expect(within(section('Latest reports')).queryByText('No reports yet')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(section('Latest reports')).findByRole('link', { name: DONE_TITLE })).toBeInTheDocument();
    expect(await findTile('Finished reports 1')).toBeInTheDocument();
    await waitFor(() => expect(within(section('Latest reports')).queryByRole('alert')).toBeNull());
  });


  it('lists a report once even when the answer repeats it, and skips a row without an id', async () => {
    const [running, done] = f.reports;
    given.json('get', '/api/reports', { reports: [running, running, { ...done, id: null }, done] });
    renderDashboard();
    await within(section('Latest reports')).findByRole('link', { name: DONE_TITLE });
    expect(rowsOf('Latest reports')).toHaveLength(2);
    expect(tile('Running analyses 1')).toBeInTheDocument();
  });
});


describe('Latest companies', () => {

  it('lists the companies most recently updated first: name linking to its page, institution type, last update', async () => {
    renderDashboard();
    await within(section('Latest companies')).findByRole('link', { name: 'UAB Kreditas' });
    const [pavyzdys, kreditas] = rowsOf('Latest companies');
    expect(within(pavyzdys).getByRole('link', { name: 'UAB Pavyzdys' })).toHaveAttribute('href', `/companies/${f.ID.pavyzdys}`);
    expect(within(pavyzdys).getByText('Crypto-asset service provider')).toBeInTheDocument();
    expect(within(pavyzdys).getByText('26/09/2026, 11:30')).toBeInTheDocument();
    expect(within(kreditas).getByRole('link', { name: 'UAB Kreditas' })).toHaveAttribute('href', `/companies/${f.ID.kreditas}`);
    expect(within(kreditas).getByText('Consumer credit provider')).toBeInTheDocument();
    expect(within(kreditas).getByText('24/09/2026, 14:20')).toBeInTheDocument();
  });


  it('says "No companies yet" for an empty list, and a company without an institution type shows "—"', async () => {
    given.json('get', '/api/companies', { companies: [] });
    const { unmount } = renderDashboard();
    expect(await within(section('Latest companies')).findByText('No companies yet')).toBeInTheDocument();
    expect(tile('Companies 0')).toBeInTheDocument();
    unmount();

    given.json('get', '/api/companies', { companies: [{ ...f.companies[1], institutionType: null }] });
    renderDashboard();
    const link = await within(section('Latest companies')).findByRole('link', { name: 'UAB Kreditas' });
    expect(within(link.closest('li')).getByText('—')).toBeInTheDocument();
  });


  it('the company link opens the company page', async () => {
    const { user } = renderDashboard();
    await user.click(await within(section('Latest companies')).findByRole('link', { name: 'UAB Pavyzdys' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/companies/${f.ID.pavyzdys}`);
  });
});







// -----------------------------------------------------------
// Legal corpus health
// -----------------------------------------------------------

describe('Legal corpus health', () => {

  const [aiAct, dora, mica, tfr, lbRules, aml] = f.acts;


  it('counts the acts in use — ready, with errors — and the switched-off ones, and lists the failed act with its reason', async () => {
    renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'Legal corpus' });
    expect(await within(card).findByText('Ready: 5')).toBeInTheDocument();
    expect(within(card).getByText('With errors: 1')).toBeInTheDocument();
    expect(within(card).getByText('Switched off: 1')).toBeInTheDocument();
    expect(within(card).queryByText(/^Processing/)).toBeNull();
    expect(within(card).queryByText(/^No text yet/)).toBeNull();
    expect(within(card).queryByText('Every act in use is ready.')).toBeNull();

    expect(within(card).getByRole('heading', { level: 3, name: 'Acts with errors' })).toBeInTheDocument();
    const [problem] = within(card).getAllByRole('listitem');
    expect(within(problem).getByRole('link', { name: 'LB KTPT taisyklės' })).toHaveAttribute('href', `/corpus/${f.ID.lbRules}`);
    expect(problem).toHaveTextContent('LB KTPT taisyklės — www.lb.lt answered HTTP 503 for https://www.lb.lt/lt/ktpt-veiklos-taisykles');
    expect(within(card).getByRole('link', { name: 'Open the corpus' })).toHaveAttribute('href', '/corpus');
  });


  it('says every act in use is ready when none failed, none is processing and all have text', async () => {
    given.json('get', '/api/corpus/documents', { documents: [aiAct, dora, mica, tfr, aml] });
    renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'Legal corpus' });
    expect(await within(card).findByText('Every act in use is ready.')).toBeInTheDocument();
    expect(within(card).getByText('Ready: 4')).toBeInTheDocument();
    expect(within(card).getByText('Switched off: 1')).toBeInTheDocument();
    expect(within(card).queryByRole('heading', { name: 'Acts with errors' })).toBeNull();
  });


  it('counts the acts still processing and those without a text yet', async () => {
    given.json('get', '/api/corpus/documents', { documents: [
      aiAct,
      { ...dora, currentVersion: { ...dora.currentVersion, status: 'parsing' } },
      { ...mica, currentVersion: { ...mica.currentVersion, status: 'embedding' } },
      { ...lbRules, lastError: null },
    ] });
    renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'Legal corpus' });
    expect(await within(card).findByText('Processing: 2')).toBeInTheDocument();
    expect(within(card).getByText('No text yet: 1')).toBeInTheDocument();
    expect(within(card).getByText('Ready: 1')).toBeInTheDocument();
    expect(within(card).queryByText(/^With errors/)).toBeNull();
    expect(within(card).queryByText('Every act in use is ready.')).toBeNull();
  });


  it('lists an act whose version failed with the version\'s error, at most six acts, each reason cut at 120 characters', async () => {
    const reason = `Parser error: ${'x'.repeat(200)}`;
    const broken = Array.from({ length: 8 }, (_, i) => ({
      ...dora, id: `d0000000-0000-4000-8000-0000000009${i}0`, shortTitle: `Aktas ${i + 1}`,
      currentVersion: { ...dora.currentVersion, status: 'failed', error: reason },
    }));
    given.json('get', '/api/corpus/documents', { documents: broken });
    renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'Legal corpus' });
    expect(await within(card).findByText('With errors: 8')).toBeInTheDocument();
    const problems = within(card).getAllByRole('listitem');
    expect(problems.map((row) => within(row).getByRole('link').textContent)).toEqual(['Aktas 1', 'Aktas 2', 'Aktas 3', 'Aktas 4', 'Aktas 5', 'Aktas 6']);
    expect(problems[0]).toHaveTextContent(`Aktas 1 — ${reason.slice(0, 120)}`);
    expect(problems[0].textContent).not.toContain(reason.slice(0, 121));
  });


  it('names an act without a short title by its title', async () => {
    given.json('get', '/api/corpus/documents', { documents: [{ ...lbRules, shortTitle: '' }] });
    renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'Legal corpus' });
    expect(await within(card).findByRole('link', { name: lbRules.title })).toBeInTheDocument();
  });


  it('says nothing while the catalogue loads — a loading corpus is not "Ready: 0"', async () => {
    given.hang('get', '/api/corpus/documents');
    renderDashboard();
    await loaded();
    const card = section('Legal corpus');
    expect(within(card).queryByText(/^Ready:/)).toBeNull();
    expect(within(card).queryByText('Every act in use is ready.')).toBeNull();
  });


  it('a failed catalogue shows the alert with a retry in place of the counts', async () => {
    given.sequence('get', '/api/corpus/documents', [{ status: 502, html: '<html><body>Bad Gateway</body></html>' }, { body: { documents: f.acts } }]);
    const { user } = renderDashboard();
    const card = await within(main()).findByRole('region', { name: 'Legal corpus' });
    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent('The server is temporarily unreachable. Try again.');
    expect(within(card).queryByText(/^Ready:/)).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(card).findByText('Ready: 5')).toBeInTheDocument();
    expect(await findTile('Legal acts ready 5 of 6')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Job queue
// -----------------------------------------------------------
//
// The exact counters, the latest jobs in words, the links,
// the empty queue and each request's failure.
// -----------------------------------------------------------

describe('Job queue', () => {

  it('counts the queued, running and failed jobs, each counter a link to the jobs page filtered to its status', async () => {
    renderDashboard();
    expect(await findCounter('Queued', 1)).toHaveAttribute('href', '/jobs?status=queued');
    expect(counter('Running', 1)).toHaveAttribute('href', '/jobs?status=running');
    expect(counter('Failed', 2)).toHaveAttribute('href', '/jobs?status=failed');
    expect(within(section('Latest jobs')).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/jobs');
  });


  it('lists the five latest jobs in words: status, kind, the subject with a link where it has a page, and when it was queued', async () => {
    renderDashboard();
    await within(section('Latest jobs')).findByText('Scheduled job: Maintenance');
    const rows = rowsOf('Latest jobs');
    expect(rows).toHaveLength(5);

    const expected = [
      ['Queued', 'Obligation extraction', 'Obligations of an act · d0000000', `/corpus/${f.ID.mica}?tab=obligations`, '27/09/2026, 09:59'],
      ['Running', 'Compliance analysis', 'Report · e0000000', `/reports/${f.ID.reportRunning}`, '27/09/2026, 09:40'],
      ['Done', 'Document indexing', 'Company document · c3000000', null, '26/09/2026, 13:10'],
      ['Failed', 'Legal act ingestion', 'Legal act · d0000000', `/corpus/${f.ID.lbRules}`, '26/09/2026, 08:14'],
      ['Done', 'Maintenance', 'Scheduled job: Maintenance', null, '26/09/2026, 02:00'],
    ];
    rows.forEach((row, index) => {
      const [status, kind, subject, href, created] = expected[index];
      expect(within(row).getByText(status)).toBeInTheDocument();
      expect(within(row).getByText(kind)).toBeInTheDocument();
      expect(within(row).getByText(created)).toBeInTheDocument();
      if (href) {
        expect(within(row).getByRole('link', { name: subject })).toHaveAttribute('href', href);
      } else {
        expect(within(row).getByText(subject)).toBeInTheDocument();
        expect(within(row).queryByRole('link')).toBeNull();
      }
    });
  });


  it('names the act a latest job is about in place of its id', async () => {
    given.json('get', '/api/jobs', { jobs: f.jobs.slice(0, 5).map((row, index) => (index === 0 ? { ...row, subjectTitle: 'MiCA' } : row)) });
    renderDashboard();
    const link = await within(section('Latest jobs')).findByRole('link', { name: 'Obligations of an act · MiCA' });
    expect(link).toHaveAttribute('href', `/corpus/${f.ID.mica}?tab=obligations`);
    expect(within(section('Latest jobs')).getByRole('link', { name: 'Report · e0000000' })).toBeInTheDocument();
  });


  it('names the corpus-wide jobs by what they cover', async () => {
    const reembed = f.jobs.find((row) => row.kind === 'corpus.reembed');
    given.json('get', '/api/jobs', { jobs: [reembed, { ...reembed, id: 'b0000000-0000-4000-8000-0000000000c1', kind: 'corpus.refresh_all', subject: 'corpus:refresh-all', status: 'running' }] });
    renderDashboard();
    const reembedRow = (await within(section('Latest jobs')).findByText('Re-embedding')).closest('li');
    expect(within(reembedRow).getByRole('link', { name: 'All legal acts' })).toHaveAttribute('href', '/corpus');
    expect(within(reembedRow).getByText('Cancelled')).toBeInTheDocument();
    const refreshRow = within(section('Latest jobs')).getByText('Source check (all acts)').closest('li');
    expect(within(refreshRow).getByRole('link', { name: 'All sources' })).toHaveAttribute('href', '/corpus');
  });


  it('a click on a counter opens the jobs page filtered to that status', async () => {
    const { user, router } = renderDashboard();
    await user.click(await findCounter('Failed', 2));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/jobs?status=failed');
    expect(router.state.location.search).toBe('?status=failed');
  });


  it('a subject link opens its page', async () => {
    const { user } = renderDashboard();
    await user.click(await within(section('Latest jobs')).findByRole('link', { name: 'Report · e0000000' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.reportRunning}`);
  });


  it('says "No jobs yet" for an empty queue, with the counters at zero', async () => {
    given.json('get', '/api/jobs', { jobs: [] });
    given.json('get', '/api/jobs/counts', NO_JOBS);
    renderDashboard();
    expect(await within(section('Latest jobs')).findByText('No jobs yet')).toBeInTheDocument();
    expect(counter('Queued', 0)).toBeInTheDocument();
    expect(counter('Running', 0)).toBeInTheDocument();
    expect(counter('Failed', 0)).toBeInTheDocument();
  });


  it('shows the counters as "—" until the counts land', async () => {
    given.hang('get', '/api/jobs/counts');
    renderDashboard();
    await within(section('Latest jobs')).findByText('Scheduled job: Maintenance');
    for (const label of ['Queued', 'Running', 'Failed']) expect(counter(label, '—')).toBeInTheDocument();
  });


  it('failed counts: the alert over counters at "—" and a standing list — "Try again" asks for the counts again', async () => {
    given.sequence('get', '/api/jobs/counts', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: f.jobCounts }]);
    const { user } = renderDashboard();
    const card = section('Latest jobs');
    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(counter('Failed', '—')).toBeInTheDocument();
    expect(await within(card).findByText('Scheduled job: Maintenance')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await findCounter('Failed', 2)).toBeInTheDocument();
    await waitFor(() => expect(within(card).queryByRole('alert')).toBeNull());
  });


  it('a failed job list: the alert, the counters still counted, no "No jobs yet" — the retry brings the list', async () => {
    given.sequence('get', '/api/jobs', [{ status: 429, body: apiError('RATE_LIMITED'), headers: { 'Retry-After': '30' } }, { body: { jobs: f.jobs.slice(0, 5) } }]);
    const { user } = renderDashboard();
    const card = section('Latest jobs');
    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent('Too many attempts. Wait a moment and try again. Try again in 30 s.');
    expect(await findCounter('Failed', 2)).toBeInTheDocument();
    expect(within(card).queryByText('No jobs yet')).toBeNull();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(card).findByText('Scheduled job: Maintenance')).toBeInTheDocument();
    await waitFor(() => expect(within(card).queryByRole('alert')).toBeNull());
  });
});







// -----------------------------------------------------------
// Polling
// -----------------------------------------------------------
//
// Fake timers go in before the render, so the polls'
// intervals are fake ones; shouldAdvanceTime keeps requests
// and answers flowing meanwhile. The real time the render
// takes moves the fake clock too, hence the margins below
// each 10-second mark.
// -----------------------------------------------------------

describe('Polling', () => {

  it('polls the queue counters and the latest jobs every 10 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: POLL_TIMERS });
    const counts = given.capture('get', '/api/jobs/counts', f.jobCounts);
    const recent = given.capture('get', '/api/jobs', { jobs: f.jobs.slice(0, 5) });
    renderDashboard();
    await findCounter('Failed', 2);
    expect(counts).toHaveLength(1);
    expect(recent).toHaveLength(1);

    await act(async () => { vi.advanceTimersByTime(7_000); });
    expect(counts).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(4_000); });
    await waitFor(() => expect(counts).toHaveLength(2));
    await waitFor(() => expect(recent).toHaveLength(2));
    vi.useRealTimers();
    expect(recent[1].query).toEqual({ limit: '5' });
  });


  it('a changed count lands with the next poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: POLL_TIMERS });
    given.sequence('get', '/api/jobs/counts', [{ body: f.jobCounts }, { body: { ...f.jobCounts, failed: 3 } }]);
    renderDashboard();
    await findCounter('Failed', 2);
    await act(async () => { vi.advanceTimersByTime(11_000); });
    expect(await findCounter('Failed', 3)).toBeInTheDocument();
    vi.useRealTimers();
  });


  it('polls the reports every 10 seconds while an analysis runs — its end moves the tiles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: POLL_TIMERS });
    const finished = f.reports.map((row) => (row.status === 'running' ? { ...row, status: 'done', title: 'UAB Kreditas vertinimas' } : row));
    given.sequence('get', '/api/reports', [{ body: { reports: f.reports } }, { body: { reports: finished } }]);
    renderDashboard();
    expect(await findTile('Running analyses 1')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(11_000); });
    expect(await findTile('Running analyses 0')).toBeInTheDocument();
    expect(tile('Finished reports 2')).toBeInTheDocument();
    expect(within(section('Latest reports')).getByRole('link', { name: 'UAB Kreditas vertinimas' })).toBeInTheDocument();
    vi.useRealTimers();
  });


  it('leaves the reports alone once no analysis runs, and fetches the companies, the corpus and the budget once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: POLL_TIMERS });
    const settled = f.reports.filter((row) => row.status !== 'running');
    const reports = given.capture('get', '/api/reports', { reports: settled });
    const companies = given.capture('get', '/api/companies', { companies: f.companies });
    const acts = given.capture('get', '/api/corpus/documents', { documents: f.acts });
    const usage = given.capture('get', '/api/usage', f.usage({ days: 1 }));
    const counts = given.capture('get', '/api/jobs/counts', f.jobCounts);
    renderDashboard();
    expect(await findTile('Running analyses 0')).toBeInTheDocument();
    // Two poll periods, one at a time — a tick that finds the
    // previous poll still on the wire joins it instead
    await act(async () => { vi.advanceTimersByTime(11_000); });
    await waitFor(() => expect(counts).toHaveLength(2));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await waitFor(() => expect(counts).toHaveLength(3));
    vi.useRealTimers();
    expect(reports).toHaveLength(1);
    expect(companies).toHaveLength(1);
    expect(acts).toHaveLength(1);
    expect(usage).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('Dashboard in Lithuanian', () => {

  it('says in Lithuanian that a report waits for its list of acts — on the tile and in the list', async () => {
    given.json('get', '/api/reports', { reports: [f.waitingReport, ...f.reports] });
    renderDashboard(authData, { locale: 'lt' });
    expect(await findTile('Vykdomos analizės 1 laukia patvirtinimo: 1')).toBeInTheDocument();
    expect(within(section('Naujausios ataskaitos')).getByText('Laukia apimties patvirtinimo')).toBeInTheDocument();
  });


  it('speaks Lithuanian: the title, the tiles, the budget, the cards and the queue', async () => {
    renderDashboard(authData, { locale: 'lt' });
    expect(within(main()).getByRole('heading', { level: 1, name: 'Apžvalga' })).toBeInTheDocument();
    expect(within(main()).getByText('Sveiki, Rūta Administratorė')).toBeInTheDocument();
    for (const name of ['Įmonės 2', 'Baigtos ataskaitos 1', 'Vykdomos analizės 1', 'Paruošti teisės aktai 5 iš 6', 'Pareigos peržiūrai 4', 'Naudotojai 3']) {
      expect(await findTile(name)).toBeInTheDocument();
    }

    const budget = await within(main()).findByRole('region', { name: 'DI biudžetas šiandien' });
    expect(within(budget).getByText('Išnaudota')).toBeInTheDocument();
    // Intl's no-break space reads as a plain one to the text queries
    expect(within(budget).getByText('0,216 USD · Neribota')).toBeInTheDocument();

    const reports = section('Naujausios ataskaitos');
    expect(within(reports).getByRole('link', { name: 'Ataskaita, 2026-09-27' })).toBeInTheDocument();
    expect(within(reports).getByText('UAB Kreditas · 2026-09-27 09:40')).toBeInTheDocument();
    expect(within(reports).getByText('Baigta')).toBeInTheDocument();

    const companies = section('Naujausios įmonės');
    expect(within(companies).getByText('Kriptoturto paslaugų teikėjas')).toBeInTheDocument();
    expect(within(companies).getByText('2026-09-26 11:30')).toBeInTheDocument();

    const corpus = section('Teisės aktų bazė');
    expect(within(corpus).getByText('Paruošta: 5')).toBeInTheDocument();
    expect(within(corpus).getByText('Su klaidomis: 1')).toBeInTheDocument();
    expect(within(corpus).getByText('Išjungta: 1')).toBeInTheDocument();
    expect(within(corpus).getByRole('heading', { name: 'Aktai su klaidomis' })).toBeInTheDocument();

    const queue = section('Paskutinės užduotys');
    expect(counter('Laukia', 1)).toBeInTheDocument();
    expect(counter('Nepavyko', 2)).toBeInTheDocument();
    expect(await within(queue).findByText('Planinė užduotis: Sistemos priežiūra')).toBeInTheDocument();
    expect(within(queue).getByRole('link', { name: 'Teisės akto pareigos · d0000000' })).toBeInTheDocument();
    expect(within(queue).getByText('Pareigų išskyrimas')).toBeInTheDocument();
    expect(within(queue).getByText('Laukia eilėje')).toBeInTheDocument();
  });


  it('says a failure in Lithuanian', async () => {
    given.apiError('get', '/api/users', 'SERVER_ERROR', { status: 500 });
    renderDashboard(authData, { locale: 'lt' });
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('Naudotojai');
    expect(alert).toHaveTextContent('Serverio klaida. Bandykite dar kartą vėliau.');
    expect(within(alert).getByRole('button', { name: 'Bandyti dar kartą' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against each of the eight GETs, the
// other seven keeping their default answers — the page's
// heading must stand through all of them. A tile's "—" is
// the loading probe of the tile queries; the budget card's
// absence is the budget's.
// -----------------------------------------------------------

const chrome = () => within(main()).getByRole('heading', { level: 1, name: 'Overview' });

describeEndpointContract({
  path: '/api/companies',
  fixture: { companies: f.companies },
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await within(main()).findByRole('link', { name: 'UAB Kreditas' }); },
  loading: () => tile('Companies —'),
});


describeEndpointContract({
  path: '/api/reports',
  fixture: { reports: f.reports },
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await within(main()).findByRole('link', { name: DONE_TITLE }); },
  loading: () => tile('Finished reports —'),
});


describeEndpointContract({
  path: '/api/corpus/documents',
  fixture: { documents: f.acts },
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await within(main()).findByRole('link', { name: 'LB KTPT taisyklės' }); },
  loading: () => tile('Legal acts ready —'),
});


describeEndpointContract({
  path: '/api/jobs/counts',
  fixture: f.jobCounts,
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await findCounter('Failed', 2); },
  loading: () => counter('Failed', '—'),
});


describeEndpointContract({
  path: '/api/jobs',
  fixture: { jobs: f.jobs.slice(0, 5) },
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await within(main()).findByText('Scheduled job: Maintenance'); },
  loading: () => within(section('Latest jobs')).queryByText('No jobs yet') === null,
});


describeEndpointContract({
  path: '/api/obligations',
  fixture: { obligations: f.obligations.filter((row) => row.status === 'proposed').slice(0, 1), total: 4 },
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await findTile('Obligations to review 4'); },
  loading: () => tile('Obligations to review —'),
});


describeEndpointContract({
  path: '/api/usage',
  fixture: f.usage({ days: 1 }),
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await within(main()).findByText('$0.216 · Unlimited'); },
  loading: () => within(main()).queryByRole('region', { name: 'AI budget today' }) === null,
});


describeEndpointContract({
  path: '/api/users',
  fixture: { users: f.users },
  render: () => renderDashboard(),
  chrome,
  loaded: async () => { await findTile('Users 3'); },
  loading: () => tile('Users —'),
});
