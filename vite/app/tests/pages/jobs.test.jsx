// -----------------------------------------------------------
//  [*] Tests — Jobs page (the queue monitor)
//
//  The /jobs page end to end against the backend double: the
//  DataGrid over GET /api/jobs (every status and kind of the
//  fixture world, in the order of the work: what runs, what
//  waits as the worker takes it, what ended newest first —
//  kind and status labels, the
//  subject in words with a link where it has a page — the
//  act a job is about by its name —, the progress bar named
//  in words while the job is under way and none once it
//  ended, the created and
//  finished stamps, cancel only while a job can still stop);
//  the kind
//  and status filters and the exact query they send, read
//  from and written to the address (the dashboard links to
//  /jobs?status=failed); the empty, filtered-empty and failed
//  list; the details drawer over GET /api/jobs/{id} (stamps,
//  duration, attempts, the job's AI usage as four figures,
//  progress unless the job is done, error, every step with
//  its label, status, duration, prompt version, models with
//  their calls and — when several steps called a model — its
//  own tokens and cost, and its error — a step's null prompt
//  version and empty or malformed usage tolerated — and the
//  result in words; stepUsage.js on its own); coming back (the drawer
//  as an entry of its own — ?job= pushed, Back closing it, the
//  × a Back or a replace, a bad id closed — and the table's
//  sort in the address); cancel (POST /api/jobs/{id}/cancel: the toast, the
//  refresh, a 409 NOT_CANCELLABLE for a job that finished
//  meanwhile, the pending cancel as a status note); the
//  auto-refresh (the list and GET /api/jobs/counts every 2 s
//  while anything in the queue is active, whatever the filters
//  show, 30 s when idle; the line that says so; the drawer
//  every 2 s until the job is final); a plain
//  user's own jobs; Lithuanian; and the backend contract
//  matrix for both GETs.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Jobs from '@/pages/Jobs/Jobs';
import { jobUsage, stepUsage } from '@/pages/Jobs/stepUsage';


// The clock functions the polls run on: with only these
// faked the polls stand still until a test moves the clock,
// while requests and the page's own waits run in real time
const POLL_TIMERS = ['setInterval', 'clearInterval'];

// The fixture jobs by name
const JOB = Object.fromEntries(f.jobs.map((row) => [Object.keys(f.ID).find((key) => f.ID[key] === row.id), row]));

// Why the Bank of Lithuania fetch and the 2026-09-20
// analysis failed (the fixtures' failure messages)
const LB_FAILURE = JOB.jobIngestLb.error;
const REPORT_FAILURE = JOB.jobReportFailed.error;

// The rows of a queue with nothing queued or running, and
// that queue's counts
const IDLE = f.jobs.filter((row) => !['queued', 'running'].includes(row.status));
const IDLE_COUNTS = { ...f.jobCounts, queued: 0, running: 0 };







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// The DataGrid's own attributes are the only handle on a row
// and a cell: a row carries its record's id as data-id, a
// cell its column as data-field (several rows share a
// subject label, "Report · e0000000"). shownIds reads the
// rows top to bottom. columnHeader: a sortable column's
// header is named with its sort button too ("Kind Sort").
// drawerHeader: the drawer's first line, the job's status
// chip and subject — the steps below carry chips of their
// own. pick opens a select by its label and clicks an
// option. term reads a <dt>'s <dd> — the drawer's stamps and
// a result's fields are definition lists. givenJob overrides
// the drawer's request: to a ':jobId' route "counts" is an id
// too, so each override is followed by the counts route,
// which msw then asks first — as the real backend does.
// queueLine is the line above the table. usageOf is the
// drawer's AI usage section (null when the job has none);
// its four figures are read with term.
// -----------------------------------------------------------

const renderJobs = (session = authData, options = {}) =>
  renderPage(<Jobs authData={session} />, { route: '/jobs', path: '/jobs', ...options });

const grid = () => screen.getByRole('grid');

const rowOf = (id) => grid().querySelector(`[role="row"][data-id="${id}"]`);

const findRow = async (id) => {
  await waitFor(() => expect(rowOf(id)).not.toBeNull());
  return rowOf(id);
};

const cell = (row, field) => row.querySelector(`[data-field="${field}"]`);

const shownIds = () => [...grid().querySelectorAll('[role="row"][data-id]')].map((row) => row.getAttribute('data-id'));

const drawer = () => screen.getByRole('dialog');

const columnHeader = (title) => within(grid()).getByRole('columnheader', { name: new RegExp(`^${title}(\\s\\S+)?$`) });

const drawerHeader = (dialog) => dialog.querySelector('.MuiChip-root').parentElement;

const givenJob = Object.fromEntries(['json', 'capture', 'sequence', 'apiError', 'hang'].map((kind) => [kind, (...args) => {
  const answer = given[kind]('get', '/api/jobs/:jobId', ...args);
  given.json('get', '/api/jobs/counts', f.jobCounts);
  return answer;
}]));

const queueLine = () => screen.queryByText(/^The list refreshes every/)?.parentElement ?? null;

const usageOf = (dialog, heading = 'AI usage') => within(dialog).queryByRole('heading', { level: 3, name: heading })?.parentElement ?? null;

async function pick(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

async function openDetails(user, id, button = 'Job details') {
  const row = await findRow(id);
  await user.click(within(row).getByRole('button', { name: button }));
  return screen.findByRole('dialog');
}

const term = (container, name) => within(container).getByText(name, { selector: 'dt' }).nextElementSibling;







// -----------------------------------------------------------
// The table
// -----------------------------------------------------------

describe('Jobs — the table', () => {

  it('frames the grid in the page layout: title, subtitle, both filters and the columns', async () => {
    renderJobs();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();
    expect(within(main).getByText('Background jobs: legal act ingestion, document indexing, compliance analyses.')).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'Kind' })).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    await findRow(f.ID.jobReportRunning);
    expect(screen.getByRole('grid', { name: 'Jobs' })).toBe(grid());
    for (const title of ['Kind', 'Subject', 'Status', 'Progress', 'Created', 'Finished', 'Actions']) {
      expect(columnHeader(title)).toBeInTheDocument();
    }
  });


  it('lists the jobs in the order of the work: what runs, what waits, then what ended, newest first', async () => {
    renderJobs();
    await findRow(f.ID.jobReportFailed);
    const ended = f.jobs.filter((row) => !['queued', 'running'].includes(row.status)).map((row) => row.id);
    expect(shownIds()).toEqual([f.ID.jobReportRunning, f.ID.jobExtractMica, ...ended]);
  });


  it('lists what waits as the worker will take it: the highest priority first, the oldest first within one — to the microsecond', async () => {
    // A bulk run queued in one go, below the work users start:
    // the list answers it newest first, the worker takes the
    // oldest first
    const bulk = ['c1', 'c2', 'c3'].map((tail, n) => ({ ...JOB.jobExtractMica, id: `b0000000-0000-4000-8000-0000000000${tail}`, priority: -1,
                                                        createdBy: null, createdAt: `2026-09-27T10:05:00.0001${n}0+00:00` }));
    const upload = { ...JOB.jobIndexComplaints, id: 'b0000000-0000-4000-8000-0000000000c9', status: 'queued', priority: 5, createdAt: '2026-09-27T10:06:00+00:00' };
    given.json('get', '/api/jobs', { jobs: [upload, ...[...bulk].reverse(), ...f.jobs] });
    renderJobs();
    await findRow(f.ID.jobReportFailed);
    expect(shownIds().slice(0, 6)).toEqual([f.ID.jobReportRunning, upload.id, f.ID.jobExtractMica, bulk[0].id, bulk[1].id, bulk[2].id]);
  });


  it('a column the user sorts by replaces the order of the work', async () => {
    renderJobs(authData, { route: '/jobs?sort=createdAt.desc' });
    await findRow(f.ID.jobReportFailed);
    expect(shownIds()).toEqual(f.jobs.map((row) => row.id));
  });


  it('shows each job in words: kind, subject — a link where it has a page —, status, created and finished', async () => {
    renderJobs();
    const expected = [
      [f.ID.jobExtractMica, 'Obligation extraction', 'Obligations of an act · d0000000', `/corpus/${f.ID.mica}?tab=obligations`, 'Queued', '27/09/2026, 09:59', '—'],
      [f.ID.jobReportRunning, 'Compliance analysis', 'Report · e0000000', `/reports/${f.ID.reportRunning}`, 'Running', '27/09/2026, 09:40', '—'],
      [f.ID.jobIndexComplaints, 'Document indexing', 'Company document · c3000000', null, 'Done', '26/09/2026, 13:10', '26/09/2026, 13:10'],
      [f.ID.jobIngestLb, 'Legal act ingestion', 'Legal act · d0000000', `/corpus/${f.ID.lbRules}`, 'Failed', '26/09/2026, 08:14', '26/09/2026, 08:15'],
      [f.ID.jobMaintenance, 'Maintenance', 'Scheduled job: Maintenance', null, 'Done', '26/09/2026, 02:00', '26/09/2026, 02:00'],
      [f.ID.jobReembed, 'Re-embedding', 'All legal acts', '/corpus', 'Cancelled', '25/09/2026, 16:00', '25/09/2026, 16:02'],
      [f.ID.jobReportDone, 'Compliance analysis', 'Report · e0000000', `/reports/${f.ID.reportDone}`, 'Done', '21/09/2026, 09:15', '21/09/2026, 09:31'],
    ];
    for (const [id, kind, subject, href, status, created, finished] of expected) {
      const row = await findRow(id);
      expect(cell(row, 'kind')).toHaveTextContent(kind);
      expect(cell(row, 'subject')).toHaveTextContent(subject);
      if (href) expect(within(cell(row, 'subject')).getByRole('link', { name: subject })).toHaveAttribute('href', href);
      else expect(within(cell(row, 'subject')).queryByRole('link')).toBeNull();
      expect(cell(row, 'status')).toHaveTextContent(status);
      expect(cell(row, 'createdAt')).toHaveTextContent(created);
      expect(cell(row, 'finishedAt')).toHaveTextContent(finished);
    }
  });


  it('names the act a job is about in place of its id, links it the same, and sorts by the name', async () => {
    const named = f.jobs.map((row) => ({ ...row, subjectTitle: { [f.ID.jobExtractMica]: 'MiCA', [f.ID.jobIngestMica]: 'MiCA', [f.ID.jobExtractVki]: '  VKĮ ',
                                                               [f.ID.jobIngestLb]: '', [f.ID.jobReportDone]: 42 }[row.id] ?? null }));
    given.json('get', '/api/jobs', { jobs: named });
    const { user } = renderJobs();
    const row = await findRow(f.ID.jobExtractMica);
    expect(within(cell(row, 'subject')).getByRole('link', { name: 'Obligations of an act · MiCA' })).toHaveAttribute('href', `/corpus/${f.ID.mica}?tab=obligations`);
    expect(within(cell(rowOf(f.ID.jobIngestMica), 'subject')).getByRole('link', { name: 'Legal act · MiCA' })).toHaveAttribute('href', `/corpus/${f.ID.mica}`);
    expect(cell(rowOf(f.ID.jobExtractVki), 'subject')).toHaveTextContent(/^Obligations of an act · VKĮ$/);
    // No name, an empty one, one that is no text: the id, as before
    expect(cell(rowOf(f.ID.jobIngestLb), 'subject')).toHaveTextContent('Legal act · d0000000');
    expect(cell(rowOf(f.ID.jobReportDone), 'subject')).toHaveTextContent('Report · e0000000');
    expect(cell(rowOf(f.ID.jobReportRunning), 'subject')).toHaveTextContent('Report · e0000000');

    await user.click(columnHeader('Subject').querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(columnHeader('Subject')).toHaveAttribute('aria-sort', 'ascending'));
    const subjects = shownIds().map((id) => cell(rowOf(id), 'subject').textContent);
    expect(subjects).toEqual([...subjects].sort((a, b) => a.localeCompare(b)));
    expect(subjects.indexOf('Obligations of an act · MiCA')).toBeLessThan(subjects.indexOf('Obligations of an act · VKĮ'));
  });


  it('draws no progress for a job that ended, whatever its last report said: done, failed or cancelled', async () => {
    renderJobs();
    await findRow(f.ID.jobReportFailed);
    // Their last words were 95 %, 100 % and 25 %
    expect([JOB.jobExtractVki, JOB.jobIngestMica, JOB.jobReportFailed].map((row) => row.progress.percent)).toEqual([95, 100, 25]);
    for (const row of f.jobs.filter((job) => !['queued', 'running'].includes(job.status))) {
      expect(cell(rowOf(row.id), 'progress'), row.id).toHaveTextContent(/^$/);
      expect(within(cell(rowOf(row.id), 'progress')).queryByRole('progressbar'), row.id).toBeNull();
    }
    expect(within(cell(rowOf(f.ID.jobReportRunning), 'progress')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });


  it('draws a reported percentage as a bar named in words, a step without one as its name, a moving bar for a running job that has said nothing yet, and nothing for a waiting one', async () => {
    const fetching = { ...JOB.jobIngestLb, id: 'b0000000-0000-4000-8000-0000000000c1', status: 'running', progress: { step: 'fetch', percent: null, message: null } };
    const silent = { ...JOB.jobExtractMica, id: 'b0000000-0000-4000-8000-0000000000c2', status: 'running', progress: {} };
    given.json('get', '/api/jobs', { jobs: [...f.jobs, fetching, silent] });
    renderJobs();

    const running = await findRow(f.ID.jobReportRunning);
    const bar = within(cell(running, 'progress')).getByRole('progressbar', { name: 'Gap analysis — 1 of 3 batches (33%)' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');

    expect(cell(rowOf(fetching.id), 'progress')).toHaveTextContent('Fetch from source');
    expect(within(cell(rowOf(fetching.id), 'progress')).queryByRole('progressbar')).toBeNull();
    const moving = within(cell(rowOf(silent.id), 'progress')).getByRole('progressbar', { name: 'Running' });
    expect(moving).not.toHaveAttribute('aria-valuenow');
    expect(cell(rowOf(f.ID.jobExtractMica), 'progress')).toHaveTextContent(/^$/);
    expect(within(cell(rowOf(f.ID.jobExtractMica), 'progress')).queryByRole('progressbar')).toBeNull();
  });


  it('offers the cancel only for a job that is queued or running', async () => {
    renderJobs();
    await findRow(f.ID.jobReportFailed);
    for (const row of f.jobs) {
      const button = within(rowOf(row.id)).getByRole('button', { name: 'Cancel the job' });
      if (['queued', 'running'].includes(row.status)) expect(button, row.status).toBeEnabled();
      else expect(button, row.status).toBeDisabled();
    }
  });


  it('a subject link opens its page without opening the details', async () => {
    const { user } = renderJobs();
    const row = await findRow(f.ID.jobReportRunning);
    await user.click(within(row).getByRole('link', { name: 'Report · e0000000' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.reportRunning}`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('says "No jobs" for an empty queue, without a grid', async () => {
    given.json('get', '/api/jobs', { jobs: [] });
    renderJobs();
    expect(await screen.findByText('No jobs')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });


  it('a failed list shows the translated error with a retry instead of an empty table, and the retry lists the jobs', async () => {
    given.sequence('get', '/api/jobs', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { jobs: f.jobs } }]);
    const { user } = renderJobs();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The jobs could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByText('No jobs')).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await findRow(f.ID.jobReportRunning)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it('shows the backend\'s own words for a refused query in English', async () => {
    given.apiError('get', '/api/jobs', 'INVALID_QUERY', { status: 400, error: 'Unknown status' });
    renderJobs();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown status');
  });


  it('leaves out a row without an id and a repeated one, and shows the rest', async () => {
    given.json('get', '/api/jobs', { jobs: [JOB.jobReportRunning, JOB.jobReportRunning, { ...JOB.jobMaintenance, id: null }, JOB.jobReportDone] });
    renderJobs();
    await findRow(f.ID.jobReportDone);
    expect(shownIds()).toEqual([f.ID.jobReportRunning, f.ID.jobReportDone]);
  });
});







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// What each select offers, the exact query every choice
// sends, and the address as the filters' home.
// -----------------------------------------------------------

describe('Jobs — filters', () => {

  it('offers every kind and every status in words, "All" first', async () => {
    const { user } = renderJobs();
    await findRow(f.ID.jobReportRunning);
    await user.click(screen.getByRole('combobox', { name: 'Kind' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'All', 'Compliance analysis', 'Legal act ingestion', 'Obligation extraction', 'Obligation check', 'Re-embedding', 'Source check (all acts)',
      'Document indexing', 'Maintenance', 'Test job',
    ]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['All', 'Queued', 'Running', 'Done', 'Failed', 'Cancelled']);
  });


  it('asks 200 jobs of every status and kind by default', async () => {
    const calls = given.capture('get', '/api/jobs', { jobs: f.jobs });
    renderJobs();
    await findRow(f.ID.jobReportRunning);
    expect(calls[0].query).toEqual({ limit: '200' });
  });


  it('a status asks for that status only, shows its jobs and goes into the address', async () => {
    const calls = given.capture('get', '/api/jobs', { jobs: f.jobs.filter((row) => row.status === 'failed') });
    const { user, router } = renderJobs();
    await findRow(f.ID.jobIngestLb);
    await pick(user, 'Status', 'Failed');
    await waitFor(() => expect(calls.at(-1).query).toEqual({ limit: '200', status: 'failed' }));
    expect(shownIds()).toEqual([f.ID.jobIngestLb, f.ID.jobReportFailed]);
    expect(router.state.location.search).toBe('?status=failed');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Failed');
  });


  it('a kind asks for that kind; both filters combine; "All" drops one again', async () => {
    const calls = given.capture('get', '/api/jobs', { jobs: [] });
    const { user, router } = renderJobs();
    await screen.findByText('No jobs');

    await pick(user, 'Kind', 'Compliance analysis');
    await waitFor(() => expect(calls.at(-1).query).toEqual({ limit: '200', kind: 'report.analyze' }));
    await pick(user, 'Status', 'Done');
    await waitFor(() => expect(calls.at(-1).query).toEqual({ limit: '200', status: 'done', kind: 'report.analyze' }));
    expect(new URLSearchParams(router.state.location.search).toString()).toBe('kind=report.analyze&status=done');

    await pick(user, 'Status', 'All');
    await waitFor(() => expect(calls.at(-1).query).toEqual({ limit: '200', kind: 'report.analyze' }));
    expect(router.state.location.search).toBe('?kind=report.analyze');
  });


  it('narrows the rows the way the backend filters them', async () => {
    const { user } = renderJobs();
    await findRow(f.ID.jobReportRunning);
    await pick(user, 'Kind', 'Compliance analysis');
    await waitFor(() => expect(shownIds()).toEqual([f.ID.jobReportRunning, f.ID.jobReportDone, f.ID.jobReportFailed]));
    await pick(user, 'Status', 'Done');
    await waitFor(() => expect(shownIds()).toEqual([f.ID.jobReportDone]));
  });


  it('a filter change replaces the history entry instead of adding one', async () => {
    const { user, router } = renderJobs();
    await findRow(f.ID.jobReportRunning);
    await pick(user, 'Status', 'Running');
    await waitFor(() => expect(router.state.location.search).toBe('?status=running'));
    expect(router.state.historyAction).toBe('REPLACE');
  });


  it('opens with the filters in the address — the dashboard links to /jobs?status=… — and shows them selected', async () => {
    const calls = given.capture('get', '/api/jobs', { jobs: [JOB.jobReportRunning] });
    renderJobs(authData, { route: '/jobs?status=running&kind=report.analyze' });
    await findRow(f.ID.jobReportRunning);
    expect(calls[0].query).toEqual({ limit: '200', status: 'running', kind: 'report.analyze' });
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Running');
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveTextContent('Compliance analysis');
  });


  it('ignores a status or kind in the address it does not know', async () => {
    const calls = given.capture('get', '/api/jobs', { jobs: f.jobs });
    renderJobs(authData, { route: '/jobs?status=stuck&kind=ops.teleport' });
    await findRow(f.ID.jobReportRunning);
    expect(calls[0].query).toEqual({ limit: '200' });
  });


  it('filters that match nothing say so — not that there are no jobs at all', async () => {
    given.json('get', '/api/jobs', { jobs: [] });
    renderJobs(authData, { route: '/jobs?status=cancelled&kind=report.analyze' });
    expect(await screen.findByText('No jobs match the filters')).toBeInTheDocument();
    expect(screen.queryByText('No jobs')).toBeNull();
  });
});







// -----------------------------------------------------------
// Details drawer
// -----------------------------------------------------------
//
// GET /api/jobs/{id}: the header, stamps, progress, error,
// steps and result of each kind of job the fixtures hold.
// -----------------------------------------------------------

describe('Jobs — the details drawer', () => {

  it('opens the running analysis: its title, status, subject link, stamps, attempts and progress in words', async () => {
    const calls = givenJob.capture(f.job(f.ID.jobReportRunning));
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportRunning);
    expect(await screen.findByRole('dialog', { name: 'Job: Compliance analysis' })).toBe(dialog);
    expect(calls[0].url).toMatch(new RegExp(`/api/jobs/${f.ID.jobReportRunning}$`));

    expect(within(drawerHeader(dialog)).getByText('Running')).toBeInTheDocument();
    expect(within(drawerHeader(dialog)).getByRole('link', { name: 'Report · e0000000' })).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
    expect(term(dialog, 'Created')).toHaveTextContent('27/09/2026, 09:40');
    expect(term(dialog, 'Started')).toHaveTextContent('27/09/2026, 09:40');
    expect(term(dialog, 'Finished')).toHaveTextContent('—');
    expect(term(dialog, 'Attempts')).toHaveTextContent('1 / 1');
    // Counted from its start to the moment of the answer
    expect(term(dialog, 'Duration')).not.toHaveTextContent('—');
    expect(within(dialog).getByText('Gap analysis — 1 of 3 batches (33%)')).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar', { name: 'Gap analysis — 1 of 3 batches (33%)' })).toHaveAttribute('aria-valuenow', '33');
    expect(within(dialog).queryByRole('heading', { name: 'Result' })).toBeNull();
  });


  it('names the act in the drawer\'s subject link', async () => {
    givenJob.json({ ...f.job(f.ID.jobExtractVki), subjectTitle: 'VKĮ' });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobExtractVki);
    expect(await within(drawerHeader(dialog)).findByRole('link', { name: 'Obligations of an act · VKĮ' })).toHaveAttribute('href', `/corpus/${f.ID.consumerCredit}?tab=obligations`);
  });


  it('lists the steps so far in order: status, name, duration — the running step without one', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportRunning);
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Steps' })).toBeInTheDocument();
    const steps = within(dialog).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'DoneCompany profile1.0 s',
      'DoneDocument inventory1.0 s',
      // The one document cites no provision: nothing to judge
      'DoneCitation audit0 ms',
      // The one step that called a model so far: its numbers
      // are the job's total, above the steps
      'DoneApplicability of acts1 min 26 sPromptreport.applicability v1Modelgateway:azure/gpt-5.5 × 1',
      'DoneObligation selection1.0 s',
      // Its calls are counted once it ends
      'RunningGap analysis—',
    ]);
    expect(term(usageOf(dialog), 'Calls')).toHaveTextContent(/^1$/);
    expect(term(usageOf(dialog), 'Input tokens')).toHaveTextContent(/^19,800$/);
    expect(term(usageOf(dialog), 'Output tokens')).toHaveTextContent(/^1,500$/);
    expect(term(usageOf(dialog), 'Cost')).toHaveTextContent(/^\$0\.144$/);
  });


  it('shows a finished ingest: how long it took, every step\'s duration, the embedding step\'s model, the usage and the result in words — and no progress line', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobIngestMica);
    expect(await screen.findByRole('dialog', { name: 'Job: Legal act ingestion' })).toBeInTheDocument();
    await within(dialog).findByText('Embedding');
    expect(within(dialog).getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'DoneFetch from source38.0 s',
      'DoneExtraction1 min 30 s',
      'DoneStructure parsing15.0 s',
      'DoneChunking6.0 s',
      'DoneEmbedding4 min 58 sModelgateway:azure/text-embedding-3-small × 1',
    ]);
    expect(term(dialog, 'Duration')).toHaveTextContent(/^7 min 28 s$/);
    expect(['Calls', 'Input tokens', 'Output tokens', 'Cost'].map((name) => term(usageOf(dialog), name).textContent)).toEqual(['1', '486,200', '0', '$0.0097']);
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Result' })).toBeInTheDocument();
    expect(term(dialog, 'Version')).toHaveTextContent('2');
    expect(term(dialog, 'Provisions')).toHaveTextContent('1512');
    expect(term(dialog, 'Articles')).toHaveTextContent('149');
    expect(term(dialog, 'Chunks')).toHaveTextContent('634');
    // Done is said by the status and the result, not by a bar
    expect(within(dialog).queryByText('Done (100%)')).toBeNull();
    expect(within(dialog).queryByRole('progressbar')).toBeNull();
  });


  it('shows a failed analysis: the job\'s error, and the failing step with its own error', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportFailed);
    await within(dialog).findByText('Gap analysis — 1 of 4 batches (25%)');
    expect(within(drawerHeader(dialog)).getByText('Failed')).toBeInTheDocument();
    expect(term(dialog, 'Finished')).toHaveTextContent('20/09/2026, 15:05');
    const failedStep = within(dialog).getAllByRole('listitem').at(-1);
    // What the failing step had spent before it failed
    expect(failedStep.textContent.startsWith('FailedGap analysis2 min 8 sPromptreport.gap_analysis v2Modelgateway:azure/gpt-5.6-terra × 1')).toBe(true);
    expect(failedStep.textContent.endsWith(REPORT_FAILURE)).toBe(true);
    // How far it got stays on show
    expect(within(dialog).getByRole('progressbar', { name: 'Gap analysis — 1 of 4 batches (25%)' })).toHaveAttribute('aria-valuenow', '25');
    // Once for the job, once for its step
    expect(within(dialog).getAllByText(REPORT_FAILURE)).toHaveLength(2);
  });


  it('shows every attempt of a job that ran twice, each with its error', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobIngestLb);
    await within(dialog).findAllByText('Fetch from source');
    expect(term(dialog, 'Attempts')).toHaveTextContent('2 / 2');
    const steps = within(dialog).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    for (const step of steps) expect(step).toHaveTextContent(`FailedFetch from source1.0 s${LB_FAILURE}`);
  });


  it('a queued job has no steps yet, no start and no progress', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobExtractMica);
    expect(await within(dialog).findByText('No steps yet')).toBeInTheDocument();
    expect(term(dialog, 'Started')).toHaveTextContent('—');
    expect(term(dialog, 'Attempts')).toHaveTextContent('0 / 1');
    expect(term(dialog, 'Duration')).toHaveTextContent('—');
    expect(within(dialog).queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Job: Obligation extraction' })).toBeInTheDocument();
  });


  it('reads the result of a finished analysis and of the maintenance in words', async () => {
    const { user } = renderJobs();
    let dialog = await openDetails(user, f.ID.jobReportDone);
    await within(dialog).findByRole('heading', { name: 'Result' });
    expect(term(dialog, 'Report')).toHaveTextContent(f.ID.reportDone);
    expect(term(dialog, 'Findings')).toHaveTextContent('7');
    expect(term(dialog, 'Actions in the plan')).toHaveTextContent('3');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await openDetails(user, f.ID.jobMaintenance);
    await within(dialog).findByRole('heading', { name: 'Result' });
    expect(screen.getByRole('dialog', { name: 'Job: Maintenance' })).toBeInTheDocument();
    expect(within(dialog).getByText('Scheduled job: Maintenance')).toBeInTheDocument();
    expect(term(dialog, 'Expired sessions removed')).toHaveTextContent('3');
    expect(term(dialog, 'Old jobs removed')).toHaveTextContent('0');
    expect(term(dialog, 'Old AI call records removed')).toHaveTextContent('0');
    expect(term(dialog, 'Orphaned files removed')).toHaveTextContent('1');
    expect(term(dialog, 'Expired rate-limit windows removed')).toHaveTextContent('14');
    expect(term(dialog, 'Unused uploads removed')).toHaveTextContent('0');
  });


  it('says in words that an indexing job waits for the daily AI budget, and when it resumes', async () => {
    const detail = f.job(f.ID.jobReportDone);
    givenJob.json({ ...detail, kind: 'documents.index', steps: [],
      result: { waitingForBudget: true, resumesAt: '2026-09-29T00:05:00+00:00' } });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    await within(dialog).findByRole('heading', { name: 'Result' });
    expect(term(dialog, 'Waiting for the daily AI budget')).toHaveTextContent('Yes');
    expect(term(dialog, 'Resumes at (UTC)')).toHaveTextContent('2026-09-29T00:05:00+00:00');
  });


  it('labels a result field no handler writes yet by its humanised name', async () => {
    givenJob.json({ ...f.job(f.ID.jobIndexComplaints), result: { chunks: 1, retriedPages: 2 } });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobIndexComplaints);
    await within(dialog).findByRole('heading', { name: 'Result' });
    expect(term(dialog, 'Chunks')).toHaveTextContent('1');
    expect(term(dialog, 'Retried pages')).toHaveTextContent('2');
  });


  it('takes a step without a prompt version, with empty or missing usage and input, in its stride', async () => {
    const detail = f.job(f.ID.jobReportDone);
    givenJob.json({ ...detail, steps: detail.steps.map((step, i) => ({ ...step, promptVersionId: null, prompt: null, usage: i % 2 ? {} : null, inputRef: i % 3 ? {} : null, output: null })) });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    expect(await within(dialog).findByText('Action plan')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(8);
    expect(within(dialog).getAllByRole('listitem').at(-1)).toHaveTextContent(/^DoneSummary4 min 15 sModelgateway:azure\/gpt-5\.5$/);
    expect(within(dialog).queryByText('Prompt', { selector: 'dt' })).toBeNull();
    expect(usageOf(dialog)).toBeNull();
  });


  it('names a step\'s prompt only from a slug and a whole version — a malformed one is left out, the rest of the line stays', async () => {
    const detail = f.job(f.ID.jobReportDone);
    const malformed = [{ slug: 'report.profile' }, { slug: 5, version: 1 }, 'report.inventory v1', { slug: '', version: 1 }, ['x'], { slug: 'report.action_plan', version: '1' }, { slug: 'report.summary', version: 1.5 }];
    givenJob.json({ ...detail, steps: detail.steps.map((step, i) => ({ ...step, prompt: malformed[i] })) });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    await within(dialog).findByText('Action plan');
    expect(within(dialog).queryByText('Prompt', { selector: 'dt' })).toBeNull();
    expect(within(dialog).getAllByRole('listitem')[3]).toHaveTextContent(/^DoneApplicability of acts1 min 9 sModelgateway:azure\/gpt-5\.5 × 1Tokens22,400 in \/ 1,850 outCost\$0\.1675$/);
  });


  it('shows what each finished step\'s model calls used when several steps called a model, and the job\'s total over its steps as four figures', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    await within(dialog).findByText('Action plan');
    expect(within(dialog).getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'DoneCompany profile1.0 s',
      // The inventories were read by the earlier run: no calls
      'DoneDocument inventory4.0 s',
      'DoneCitation audit3.0 sPromptcorpus.check_citations v1Modelgateway:azure/gpt-5.6-luna × 1Tokens2,400 in / 380 outCost$0.0009',
      'DoneApplicability of acts1 min 9 sPromptreport.applicability v1Modelgateway:azure/gpt-5.5 × 1Tokens22,400 in / 1,850 outCost$0.1675',
      'DoneObligation selection1.0 s',
      'DoneGap analysis5 min 54 sPromptreport.gap_analysis v2Modelgateway:azure/gpt-5.6-terra × 4Tokens46,000 in / 18,100 outCost$0.3092',
      'DoneAction plan5 min 15 sPromptreport.action_plan v1Modelgateway:azure/gpt-5.5 × 1Tokens14,800 in / 3,900 outCost$0.191',
      'DoneSummary4 min 15 sPromptreport.summary v1Modelgateway:azure/gpt-5.5 × 1Tokens16,200 in / 2,700 outCost$0.162',
    ]);
    expect(['Calls', 'Input tokens', 'Output tokens', 'Cost'].map((name) => term(usageOf(dialog), name).textContent)).toEqual(['8', '101,800', '26,930', '$0.8306']);
    // The sections in reading order
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['AI usage', 'Steps', 'Result']);
  });


  it('names every model of a step that used several, each with its calls — the most used, then the costlier, first', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobExtractVki);
    await within(dialog).findByText('Extraction');
    const step = within(dialog).getAllByRole('listitem')[0];
    // A sole step: its tokens and cost are the job's total
    expect(step).toHaveTextContent(/^DoneExtraction6 min 12 sPromptcorpus\.extract_obligations v1Modelsgateway:azure\/gpt-5\.6-terra × 1gateway:azure\/text-embedding-3-small × 1$/);
    expect([...term(step, 'Models').children].map((line) => line.textContent)).toEqual(['gateway:azure/gpt-5.6-terra × 1', 'gateway:azure/text-embedding-3-small × 1']);
    expect(['Calls', 'Input tokens', 'Output tokens', 'Cost'].map((name) => term(usageOf(dialog), name).textContent)).toEqual(['2', '41,510', '26,800', '$0.404']);
  });


  it('says no usage — no line, no total — for a job whose steps made no model call', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobIngestLb);
    await within(dialog).findAllByText('Fetch from source');
    expect(usageOf(dialog)).toBeNull();
    expect(within(dialog).queryByText('Calls', { selector: 'dt' })).toBeNull();
    expect(within(dialog).queryByText('Tokens', { selector: 'dt' })).toBeNull();
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Steps']);
  });


  it('reads a malformed usage as none: the model its handler named still shows, the numbers do not', async () => {
    const detail = f.job(f.ID.jobReportDone);
    const steps = detail.steps.map((step, i) => ({
      ...step,
      usage: [{ calls: 'many' }, { calls: 0, costUsd: 5 }, { calls: -2 }, 'a lot', ['calls'], { calls: null }, { models: 'x' }][i],
    }));
    givenJob.json({ ...detail, steps });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    await within(dialog).findByText('Action plan');
    expect(within(dialog).queryByText('Tokens', { selector: 'dt' })).toBeNull();
    expect(usageOf(dialog)).toBeNull();
    expect(within(dialog).getAllByRole('listitem')[3]).toHaveTextContent(/^DoneApplicability of acts1 min 9 sPromptreport\.applicability v1Modelgateway:azure\/gpt-5\.5$/);
  });


  it('names a step or status the labels do not know yet instead of showing it raw', async () => {
    const detail = f.job(f.ID.jobIndexComplaints);
    givenJob.json({ ...detail, steps: [{ ...detail.steps[0], name: 'ocr_pages', status: 'skipped' }] });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobIndexComplaints);
    expect(await within(dialog).findByText('Ocr pages')).toBeInTheDocument();
    expect(within(dialog).getByText('Skipped')).toBeInTheDocument();
  });


  it('closes with its × and with Escape', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openDetails(user, f.ID.jobReportDone);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('a failed details request shows the error in the drawer, with a retry that loads the job', async () => {
    givenJob.sequence([{ status: 404, body: apiError('NOT_FOUND', 'Job not found') }, { body: f.job(f.ID.jobReportDone) }]);
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('dialog', { name: 'Job: Compliance analysis' })).toBeInTheDocument();
    await waitFor(() => expect(within(drawer()).queryByRole('alert')).toBeNull());
  });


  it('shows a spinner named after the drawer while the job loads', async () => {
    givenJob.hang();
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportDone);
    expect(within(dialog).getByRole('progressbar', { name: 'Job' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Job' })).toBe(dialog);
  });
});







// -----------------------------------------------------------
// Coming back: the drawer and the table in the address
// -----------------------------------------------------------
//
// The details drawer is an entry of its own (?job=<id>):
// opening pushes it, Back closes it, the subject link
// followed from inside comes Back to it open; closing it is a
// real Back (no trace left in the history), or a replace when
// the address carried the id from outside. The table's page
// and sort live in the address too.
// -----------------------------------------------------------

describe('Jobs — coming back', () => {

  it('opening the details pushes ?job= (Back closes the drawer), and the × is a Back to the list\'s own entry', async () => {
    const { user, router } = renderJobs(authData, { route: '/jobs?status=running' });
    const listKey = router.state.location.key;
    await openDetails(user, f.ID.jobReportRunning);
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.search).toBe(`?status=running&job=${f.ID.jobReportRunning}`);

    await user.click(within(drawer()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(listKey);

    await openDetails(user, f.ID.jobReportRunning);
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.search).toBe('?status=running');
  });


  it('a link with ?job= opens the drawer at once; closing it replaces the address without it', async () => {
    const { user, router } = renderJobs(authData, { route: `/jobs?job=${f.ID.jobIngestLb}` });
    const dialog = await screen.findByRole('dialog', { name: /^Job: / });
    expect(dialog).toHaveTextContent(LB_FAILURE);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.search).toBe('');
  });


  it('an id that is no id stays closed and asks for nothing', async () => {
    const calls = [];
    server.use(http.get(url('/api/jobs/:jobId'), ({ params }) => { calls.push(params.jobId); }));
    given.json('get', '/api/jobs/counts', f.jobCounts);
    renderJobs(authData, { route: '/jobs?job=..%2F..%2Fadmin' });
    await findRow(f.ID.jobReportRunning);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toEqual([]);
  });


  it('the table\'s sort comes from the address and a change goes back into it (replacing)', async () => {
    const { user, router } = renderJobs(authData, { route: '/jobs?sort=createdAt.asc' });
    await findRow(f.ID.jobReportRunning);
    expect(columnHeader('Created')).toHaveAttribute('aria-sort', 'ascending');
    await user.click(columnHeader('Kind').querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=kind.asc'));
    expect(router.state.historyAction).toBe('REPLACE');
  });


  it('in Lithuanian the drawer opens from the address too', async () => {
    renderJobs(authData, { route: `/jobs?job=${f.ID.jobIngestLb}`, locale: 'lt' });
    const dialog = await screen.findByRole('dialog', { name: /^Užduotis: / });
    expect(within(dialog).getByRole('button', { name: 'Uždaryti' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Cancel
// -----------------------------------------------------------

describe('Jobs — cancel', () => {

  it('cancels a running job: the POST, the "Cancellation requested" toast, and a fresh list', async () => {
    const posts = given.capture('post', '/api/jobs/:jobId/cancel', { ...JOB.jobReportRunning, cancelRequested: true });
    const lists = given.capture('get', '/api/jobs', { jobs: f.jobs });
    const { user } = renderJobs();
    const row = await findRow(f.ID.jobReportRunning);
    await user.click(within(row).getByRole('button', { name: 'Cancel the job' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toMatch(new RegExp(`/api/jobs/${f.ID.jobReportRunning}/cancel$`));
    expect(posts[0].body).toBeNull();
    expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
    await waitFor(() => expect(lists).toHaveLength(2));
  });


  it('cancels a queued job the same way', async () => {
    const posts = given.capture('post', '/api/jobs/:jobId/cancel', { ...JOB.jobExtractMica, status: 'cancelled', cancelRequested: true, finishedAt: f.NOW });
    const { user } = renderJobs();
    const row = await findRow(f.ID.jobExtractMica);
    await user.click(within(row).getByRole('button', { name: 'Cancel the job' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toMatch(new RegExp(`/api/jobs/${f.ID.jobExtractMica}/cancel$`));
    expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
  });


  it('a job that finished meanwhile answers 409 NOT_CANCELLABLE: the toast says so and the row shows it finished at once', async () => {
    // The polls stand still, so only the page itself can bring
    // the finished row
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    given.apiError('post', '/api/jobs/:jobId/cancel', 'NOT_CANCELLABLE', { status: 409, error: 'Job is already done' });
    const finished = f.jobs.map((row) => (row.id === f.ID.jobReportRunning ? { ...row, status: 'done', finishedAt: '2026-09-27T09:58:00+00:00' } : row));
    given.sequence('get', '/api/jobs', [{ body: { jobs: f.jobs } }, { body: { jobs: finished } }]);
    const { user } = renderJobs();
    const row = await findRow(f.ID.jobReportRunning);
    await user.click(within(row).getByRole('button', { name: 'Cancel the job' }));

    expect(await screen.findByText('This can no longer be cancelled — it has already finished.')).toBeInTheDocument();
    await waitFor(() => expect(cell(rowOf(f.ID.jobReportRunning), 'status')).toHaveTextContent('Done'));
    expect(within(rowOf(f.ID.jobReportRunning)).getByRole('button', { name: 'Cancel the job' })).toBeDisabled();
    expect(screen.queryByText('Cancellation requested')).toBeNull();
  });


  it('says a pending cancel in the drawer as a status note, not an alarm', async () => {
    givenJob.json({ ...f.job(f.ID.jobReportRunning), cancelRequested: true });
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportRunning);
    const note = await within(dialog).findByText('Cancellation requested — the job stops at its next step.');
    expect(note.closest('[role="status"]')).not.toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('no longer mentions the cancel once the job is final', async () => {
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReembed);
    expect(await screen.findByRole('dialog', { name: 'Job: Re-embedding' })).toBeInTheDocument();
    await within(dialog).findByText('Cancelled');
    expect(within(dialog).queryByText(/Cancellation requested/)).toBeNull();
  });


  it('a 401 on the cancel sends the browser to the login page, carrying this page', async () => {
    // No stored token in a page test, so no "expired" flag
    given.unauthorized('post', '/api/jobs/:jobId/cancel');
    const { user } = renderJobs();
    const row = await findRow(f.ID.jobReportRunning);
    await user.click(within(row).getByRole('button', { name: 'Cancel the job' }));
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fjobs']));
  });
});







// -----------------------------------------------------------
// Auto-refresh
// -----------------------------------------------------------
//
// The polls' intervals are faked before the render and stand
// still until a test moves the clock, so a pace is measured
// to the tenth of a second whatever the render took; requests
// run in real time.
// -----------------------------------------------------------

describe('Jobs — auto-refresh', () => {

  it('asks the list and the counts again every 2 seconds while a job is queued or running', async () => {
    vi.useFakeTimers({ toFake: POLL_TIMERS });
    const lists = given.capture('get', '/api/jobs', { jobs: f.jobs });
    const counts = given.capture('get', '/api/jobs/counts', f.jobCounts);
    renderJobs();
    await findRow(f.ID.jobReportRunning);
    await waitFor(() => expect(queueLine()).not.toBeNull());
    expect([lists.length, counts.length]).toEqual([1, 1]);
    await act(async () => { vi.advanceTimersByTime(1_900); });
    await settle(20);
    expect([lists.length, counts.length]).toEqual([1, 1]);
    await act(async () => { vi.advanceTimersByTime(200); });
    await waitFor(() => expect([lists.length, counts.length]).toEqual([2, 2]));
    await act(async () => { vi.advanceTimersByTime(2_000); });
    await waitFor(() => expect([lists.length, counts.length]).toEqual([3, 3]));
    vi.useRealTimers();
    expect(lists[2].query).toEqual({ limit: '200' });
  });


  it('slows to every 30 seconds once nothing is queued or running', async () => {
    vi.useFakeTimers({ toFake: POLL_TIMERS });
    const lists = given.capture('get', '/api/jobs', { jobs: IDLE });
    const counts = given.capture('get', '/api/jobs/counts', IDLE_COUNTS);
    renderJobs();
    await findRow(f.ID.jobReportDone);
    await waitFor(() => expect(counts).toHaveLength(1));
    await act(async () => { vi.advanceTimersByTime(29_000); });
    await settle(20);
    expect([lists.length, counts.length]).toEqual([1, 1]);
    await act(async () => { vi.advanceTimersByTime(1_500); });
    await waitFor(() => expect([lists.length, counts.length]).toEqual([2, 2]));
    vi.useRealTimers();
  });


  it('keeps the live pace for the whole queue: a filter that shows no active job still refreshes every 2 seconds', async () => {
    vi.useFakeTimers({ toFake: POLL_TIMERS });
    const lists = given.capture('get', '/api/jobs', { jobs: IDLE.filter((row) => row.status === 'failed') });
    renderJobs(authData, { route: '/jobs?status=failed' });
    await findRow(f.ID.jobReportFailed);
    await waitFor(() => expect(queueLine()).not.toBeNull());
    expect(lists).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(2_100); });
    await waitFor(() => expect(lists).toHaveLength(2));
    vi.useRealTimers();
    expect(lists[1].query).toEqual({ limit: '200', status: 'failed' });
  });


  it('without the counts the list sets its own pace from the rows it shows', async () => {
    vi.useFakeTimers({ toFake: POLL_TIMERS });
    given.apiError('get', '/api/jobs/counts', 'SERVER_ERROR', { status: 500 });
    const lists = given.capture('get', '/api/jobs', { jobs: f.jobs });
    renderJobs();
    await findRow(f.ID.jobReportRunning);
    await act(async () => { vi.advanceTimersByTime(2_100); });
    await waitFor(() => expect(lists).toHaveLength(2));
    vi.useRealTimers();
    expect(queueLine()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('says above the table how many jobs run and wait and that the list renews itself — and nothing for an idle queue', async () => {
    given.json('get', '/api/jobs/counts', { ...f.jobCounts, running: 1, queued: 1_045 });
    const { unmount } = renderJobs();
    await findRow(f.ID.jobReportRunning);
    await waitFor(() => expect(queueLine()).not.toBeNull());
    expect(queueLine()).toHaveTextContent(/^Running\s*1\s*Queued\s*1,045\s*The list refreshes every 2 seconds\.$/);
    expect(queueLine().closest('[aria-live], [role="status"]')).toBeNull();
    unmount();

    given.json('get', '/api/jobs', { jobs: IDLE });
    given.json('get', '/api/jobs/counts', IDLE_COUNTS);
    renderJobs();
    await findRow(f.ID.jobReportDone);
    await settle(20);
    expect(queueLine()).toBeNull();
  });


  it('counts that are no counts leave the line out and the table as it is', async () => {
    for (const answer of [null, [], 'counts', { queued: 'many', running: null }, { queued: -0 }]) {
      given.json('get', '/api/jobs/counts', answer);
      const { unmount } = renderJobs();
      await findRow(f.ID.jobReportRunning);
      await settle(20);
      expect(queueLine(), JSON.stringify(answer)).toBeNull();
      expect(shownIds()).toHaveLength(f.jobs.length);
      unmount();
    }
  });


  it('a finished job lands with the next refresh, and moves below the jobs still waiting', async () => {
    vi.useFakeTimers({ toFake: POLL_TIMERS });
    const finished = f.jobs.map((row) => (row.id === f.ID.jobReportRunning ? { ...row, status: 'done', progress: { ...row.progress, percent: 100, message: '3/3 batches' } } : row));
    given.sequence('get', '/api/jobs', [{ body: { jobs: f.jobs } }, { body: { jobs: finished } }]);
    renderJobs();
    const row = await findRow(f.ID.jobReportRunning);
    expect(cell(row, 'status')).toHaveTextContent('Running');
    expect(shownIds().slice(0, 2)).toEqual([f.ID.jobReportRunning, f.ID.jobExtractMica]);
    await act(async () => { vi.advanceTimersByTime(2_100); });
    await waitFor(() => expect(cell(rowOf(f.ID.jobReportRunning), 'status')).toHaveTextContent('Done'));
    vi.useRealTimers();
    // Its bar goes with it
    expect(within(rowOf(f.ID.jobReportRunning)).queryByRole('progressbar')).toBeNull();
    expect(shownIds().slice(0, 2)).toEqual([f.ID.jobExtractMica, f.ID.jobReportRunning]);
  });


  it('the drawer asks a running job again every 2 seconds and stops once it is final', async () => {
    vi.useFakeTimers({ toFake: POLL_TIMERS });
    const running = f.job(f.ID.jobReportRunning);
    const finished = { ...running, status: 'done', finishedAt: '2026-09-27T09:59:00+00:00' };
    let asked = 0;
    server.use(http.get(url('/api/jobs/:jobId'), () => {
      asked += 1;
      return HttpResponse.json(asked === 1 ? running : finished);
    }));
    given.json('get', '/api/jobs/counts', f.jobCounts);
    const { user } = renderJobs();
    const dialog = await openDetails(user, f.ID.jobReportRunning);
    await within(dialog).findByText('Gap analysis — 1 of 3 batches (33%)');
    expect(asked).toBe(1);

    await act(async () => { vi.advanceTimersByTime(1_900); });
    await settle(20);
    expect(asked).toBe(1);
    await act(async () => { vi.advanceTimersByTime(200); });
    await waitFor(() => expect(term(drawer(), 'Finished')).toHaveTextContent('27/09/2026, 09:59'));
    expect(asked).toBe(2);

    await act(async () => { vi.advanceTimersByTime(10_000); });
    await settle(20);
    vi.useRealTimers();
    expect(asked).toBe(2);
  });
});







// -----------------------------------------------------------
// A plain user
// -----------------------------------------------------------
//
// The backend scopes the list to the caller's own jobs; the
// page asks the same way and offers the same actions.
// -----------------------------------------------------------

describe('Jobs — a plain user', () => {

  it('sees their own jobs, with the cancel for their running analysis', async () => {
    const own = [{ ...JOB.jobReportRunning, createdBy: f.ID.jonas }, JOB.jobReportDone, JOB.jobReportFailed];
    const calls = given.capture('get', '/api/jobs', { jobs: own });
    const { user } = renderJobs(userAuthData);
    const row = await findRow(f.ID.jobReportRunning);
    expect(shownIds()).toEqual(own.map((job) => job.id));
    expect(calls[0].query).toEqual({ limit: '200' });
    expect(within(row).getByRole('button', { name: 'Cancel the job' })).toBeEnabled();
    expect(within(rowOf(f.ID.jobReportDone)).getByRole('button', { name: 'Cancel the job' })).toBeDisabled();

    const dialog = await openDetails(user, f.ID.jobReportDone);
    expect(await within(dialog).findByText('Action plan')).toBeInTheDocument();
  });


  it('a job of someone else answers 404 in the drawer, like a missing one', async () => {
    givenJob.apiError('NOT_FOUND', { status: 404, error: 'Job not found' });
    const { user } = renderJobs(userAuthData);
    const dialog = await openDetails(user, f.ID.jobReportRunning);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
  });
});







// -----------------------------------------------------------
// stepUsage / jobUsage
// -----------------------------------------------------------

describe('stepUsage and jobUsage', () => {

  const step = (usage) => ({ id: 's', usage });
  const USAGE = { calls: 4, inputTokens: 46000, outputTokens: 18100, costUsd: 0.3092, models: [{ model: 'gateway:azure/gpt-5.6-terra', calls: 4, inputTokens: 46000, outputTokens: 18100, costUsd: 0.3092 }] };


  it('reads a step\'s usage with its models by name and calls', () => {
    expect(stepUsage(step(USAGE))).toEqual({ calls: 4, inputTokens: 46000, outputTokens: 18100, costUsd: 0.3092, models: [{ model: 'gateway:azure/gpt-5.6-terra', calls: 4 }] });
  });


  it('answers null for a step without calls, a running step\'s empty usage and anything that is not a usage', () => {
    for (const usage of [{}, null, undefined, 'x', [USAGE], { calls: 0 }, { calls: -1 }, { calls: 'many' }, { calls: null }]) {
      expect(stepUsage(step(usage)), JSON.stringify(usage)).toBeNull();
    }
    expect(stepUsage(null)).toBeNull();
    expect(stepUsage('step')).toBeNull();
  });


  it('counts a number sent as text, reads any other count as 0 and drops a model entry without a name', () => {
    expect(stepUsage(step({ calls: '3', inputTokens: '1200', outputTokens: null, costUsd: 'free', models: [null, 'gpt', { calls: 2 }, { model: '', calls: 1 }, { model: 7, calls: 'x' }] })))
      .toEqual({ calls: 3, inputTokens: 1200, outputTokens: 0, costUsd: 0, models: [{ model: '7', calls: 0 }] });
  });


  it('sums the steps that recorded calls — every attempt counts — and says nothing when none did', () => {
    const second = { calls: 1, inputTokens: 1000, outputTokens: 500, costUsd: 0.02 };
    expect(jobUsage([step(USAGE), step({}), step(second), null, step(USAGE)]))
      .toEqual({ calls: 9, inputTokens: 93000, outputTokens: 36700, costUsd: 0.3092 + 0.02 + 0.3092 });
    expect(jobUsage([step({}), step(null)])).toBeNull();
    expect(jobUsage(undefined)).toBeNull();
    expect(jobUsage('steps')).toBeNull();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('Jobs in Lithuanian', () => {

  it('speaks Lithuanian: the title, the columns, the filters, the rows and the progress', async () => {
    renderJobs(authData, { locale: 'lt' });
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Užduotys' })).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'Rūšis' })).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'Būsena' })).toBeInTheDocument();
    const row = await findRow(f.ID.jobReportRunning);
    expect(screen.getByRole('grid', { name: 'Užduotys' })).toBe(grid());
    for (const title of ['Rūšis', 'Objektas', 'Būsena', 'Eiga', 'Sukurta', 'Baigta', 'Veiksmai']) {
      expect(columnHeader(title)).toBeInTheDocument();
    }
    expect(cell(row, 'kind')).toHaveTextContent('Atitikties analizė');
    expect(cell(row, 'subject')).toHaveTextContent('Ataskaita · e0000000');
    expect(cell(row, 'status')).toHaveTextContent('Vykdoma');
    expect(cell(row, 'createdAt')).toHaveTextContent('2026-09-27 09:40');
    expect(within(cell(row, 'progress')).getByRole('progressbar', { name: /^Atitikties spragų analizė — 1 iš 3 paketų \(33\s%\)$/ })).toBeInTheDocument();
    expect(cell(rowOf(f.ID.jobMaintenance), 'subject')).toHaveTextContent('Planinė užduotis: Sistemos priežiūra');
    expect(within(row).getByRole('button', { name: 'Atšaukti užduotį' })).toBeEnabled();
    expect(within(row).getByRole('button', { name: 'Užduoties informacija' })).toBeInTheDocument();
  });


  it('speaks Lithuanian in the drawer: stamps, steps and the result\'s fields', async () => {
    const { user } = renderJobs(authData, { locale: 'lt' });
    const dialog = await openDetails(user, f.ID.jobIngestMica, 'Užduoties informacija');
    expect(await screen.findByRole('dialog', { name: 'Užduotis: Teisės akto įkėlimas' })).toBe(dialog);
    await within(dialog).findByText('Vektorizavimas');
    expect(term(dialog, 'Sukurta')).toHaveTextContent('2026-09-24 07:05');
    expect(term(dialog, 'Pradėta')).toHaveTextContent('2026-09-24 07:05');
    expect(term(dialog, 'Baigta')).toHaveTextContent('2026-09-24 07:12');
    expect(term(dialog, 'Bandymai')).toHaveTextContent('1 / 2');
    expect(within(dialog).getByRole('heading', { name: 'Žingsniai' })).toBeInTheDocument();
    expect(within(dialog).getByText('Atsisiuntimas iš šaltinio')).toBeInTheDocument();
    expect(term(dialog, 'Trukmė')).toHaveTextContent(/^7 min 28 s$/);
    expect(term(within(dialog).getAllByRole('listitem').at(-1), 'Modelis')).toHaveTextContent('gateway:azure/text-embedding-3-small × 1');
    const usage = usageOf(dialog, 'DI sąnaudos');
    expect(['Iškvietimai', 'Įvesties žetonai', 'Išvesties žetonai', 'Kaina'].map((name) => term(usage, name).textContent.replace(/\s/g, ' ')))
      .toEqual(['1', '486 200', '0', '0,0097 USD']);
    expect(within(dialog).getByRole('heading', { name: 'Rezultatas' })).toBeInTheDocument();
    expect(term(dialog, 'Redakcija')).toHaveTextContent('2');
    expect(term(dialog, 'Nuostatos')).toHaveTextContent('1512');
    expect(term(dialog, 'Straipsniai')).toHaveTextContent('149');
    expect(term(dialog, 'Fragmentai')).toHaveTextContent('634');
    expect(within(dialog).getByRole('button', { name: 'Uždaryti' })).toBeInTheDocument();
  });


  it('names each step\'s prompt version in Lithuanian', async () => {
    const { user } = renderJobs(authData, { locale: 'lt' });
    const dialog = await openDetails(user, f.ID.jobReportDone, 'Užduoties informacija');
    await within(dialog).findByText('Veiksmų planas');
    const last = within(dialog).getAllByRole('listitem').at(-1);
    expect(term(last, 'Instrukcija')).toHaveTextContent(/^report\.summary v1$/);
    expect(term(last, 'Modelis')).toHaveTextContent(/^gateway:azure\/gpt-5\.5 × 1$/);
    expect(term(last, 'Žetonai').textContent.replace(/\s/g, ' ')).toBe('16 200 įvesties / 2 700 išvesties');
    expect(term(last, 'Kaina').textContent.replace(/\s/g, ' ')).toBe('0,162 USD');
  });


  it('toasts a cancel and its refusal in Lithuanian', async () => {
    const { user, unmount } = renderJobs(authData, { locale: 'lt' });
    const row = await findRow(f.ID.jobReportRunning);
    await user.click(within(row).getByRole('button', { name: 'Atšaukti užduotį' }));
    expect(await screen.findByText('Atšaukimas užregistruotas')).toBeInTheDocument();
    unmount();

    given.apiError('post', '/api/jobs/:jobId/cancel', 'NOT_CANCELLABLE', { status: 409, error: 'Job is already done' });
    const second = renderJobs(authData, { locale: 'lt' });
    const again = await findRow(f.ID.jobExtractMica);
    await second.user.click(within(again).getByRole('button', { name: 'Atšaukti užduotį' }));
    expect(await screen.findByText('Šios užduoties atšaukti nebegalima — ji jau baigta.')).toBeInTheDocument();
  });


  it('says the empty and failed states in Lithuanian', async () => {
    given.json('get', '/api/jobs', { jobs: [] });
    const { unmount } = renderJobs(authData, { locale: 'lt', route: '/jobs?status=failed' });
    expect(await screen.findByText('Pagal pasirinktus filtrus užduočių nėra')).toBeInTheDocument();
    unmount();

    given.apiError('get', '/api/jobs', 'SERVER_ERROR', { status: 500 });
    renderJobs(authData, { locale: 'lt' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nepavyko įkelti užduočių');
    expect(alert).toHaveTextContent('Serverio klaida. Bandykite dar kartą vėliau.');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the list, then against the
// details of the running analysis as its row's "Job
// details" opens them (the list keeps its default answer).
// While the drawer is open the page behind it is hidden from
// assistive technology, so the drawer is its chrome.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/jobs',
  fixture: { jobs: f.jobs },
  render: () => renderJobs(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Jobs' }),
  loaded: async () => { await findRow(f.ID.jobMaintenance); },
  // A grid loading without rows draws skeleton rows — no
  // progressbar, and nothing else a query can reach
  loading: () => grid().querySelector('.MuiDataGrid-skeletonLoadingOverlay'),
});


describeEndpointContract({
  path: '/api/jobs/:jobId',
  fixture: f.job(f.ID.jobReportRunning),
  render: async () => {
    const view = renderJobs();
    await openDetails(view.user, f.ID.jobReportRunning);
    return view;
  },
  chrome: () => drawer(),
  loaded: async () => { await within(drawer()).findByText('Applicability of acts'); },
  loading: () => within(drawer()).getByRole('progressbar', { name: 'Job' }),
});
