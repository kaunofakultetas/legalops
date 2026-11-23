// -----------------------------------------------------------
//  [*] Tests — Corpus page (tabs, catalogue, admin actions,
//      add act)
//
//  The /corpus page end to end against the backend double:
//  the three tabs kept in ?tab=, the CorpusCatalogue table
//  (the acts in catalogue order, jurisdiction, type, in-force
//  status, the "v{no} · {status}" version cell, provisions,
//  obligations, the last error beside the version, the
//  disabled note, the summary line, a row click and the act
//  link, the 5 s poll while a version is still ingesting),
//  its filters (the debounced ?q=, ?jurisdiction=, the type
//  filter on the loaded rows, the empty and filtered-empty
//  states), coming back (the filters and the table's sort
//  read from and replaced in the address, kept through a tab
//  switch, unknown values ignored), a failed list and its
//  retry, the admin row
//  actions through useQueueJob (the POST, the "Job queued"
//  toast with its link to /jobs, the refetch, the refusals),
//  the confirmed bulk jobs (check all sources, re-embed
//  everything), the AddActDialog (every source kind, the
//  checks made before sending — the missing file an alert —
//  the POST body, the upload's multipart, a file over the
//  backend's 60 MB refused as it is chosen, the named
//  INVALID_FIELD, SLUG_TAKEN), what a
//  plain user sees, both languages, and the backend contract
//  matrix for GET /api/corpus/documents.
//
//  The search and citation tabs have their own file
//  (corpus-search.test.jsx).
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, server, url, readBody } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Corpus from '@/pages/Corpus/Corpus';


const MICA = f.ID.mica;

// The acts in the catalogue's order (jurisdiction, short
// title, title), as the view sorts them
const CATALOGUE = ['DI aktas', 'DORA', 'MiCA', 'TFR (2015)', 'LB KTPT taisyklės', 'PPTFPĮ', 'VKĮ'];

// The body the create answers is merged over (fixtures NEW)
const NEW_ACT = f.ID.newAct;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderCorpus: the page on its real route. record: every
// request to one endpoint (query and body) while the default
// handler still answers it. shownActs: the acts the grid
// lists, top to bottom (the act cell's link). actRow / cell:
// a row by its act, a cell by its column field. choose: an
// MUI select or autocomplete option. openAdd: the header's
// "Add an act or standard" → the dialog. withActs: the catalogue
// answering these rows.
// -----------------------------------------------------------

function renderCorpus({ session = authData, route = '/corpus', locale } = {}) {
  return renderPage(<Corpus authData={session} />, { route, path: '/corpus', locale });
}

function record(method, path) {
  const calls = [];
  server.use(http[method](url(path), async ({ request }) => {
    calls.push({ url: request.url, query: Object.fromEntries(new URL(request.url).searchParams), body: await readBody(request.clone()) });
  }));
  return calls;
}

const shownActs = () => within(screen.getByRole('grid')).queryAllByRole('link').map((link) => link.textContent);

const actRow = async (name) => (await screen.findByRole('link', { name })).closest('[role="row"]');

const cell = (row, field) => row.querySelector(`[data-field="${field}"]`);

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

async function openAdd(user) {
  await screen.findByRole('link', { name: 'MiCA' });
  await user.click(screen.getByRole('button', { name: 'Add an act or standard' }));
  return screen.findByRole('dialog', { name: 'New legal act' });
}

const withActs = (rows) => given.json('get', '/api/corpus/documents', { documents: rows });

// An act row with its current version in another state
const withVersion = (act, patch) => ({ ...act, currentVersion: { ...act.currentVersion, ...patch } });







// -----------------------------------------------------------
// Corpus page — the frame and the tabs
// -----------------------------------------------------------
//
// The layout, the three tabs and ?tab=.
// -----------------------------------------------------------

describe('Corpus page — frame and tabs', () => {

  it('frames the catalogue in the page layout: the title, the subtitle and three tabs with the catalogue selected', async () => {
    renderCorpus();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Legal corpus' })).toBeInTheDocument();
    expect(within(main).getByText('The EU and Lithuanian legal acts, and the standards, compliance is assessed against.')).toBeInTheDocument();
    const tablist = screen.getByRole('tablist', { name: 'Legal corpus sections' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Catalogue', 'Search', 'Citation checker']);
    expect(within(tablist).getByRole('tab', { name: 'Catalogue' })).toHaveAttribute('aria-selected', 'true');
    // The panel is named by its tab, and the tab points at it
    const panel = screen.getByRole('tabpanel', { name: 'Catalogue' });
    expect(within(tablist).getByRole('tab', { name: 'Catalogue' })).toHaveAttribute('aria-controls', panel.id);
    expect(await within(panel).findByRole('grid', { name: 'Legal corpus' })).toBeInTheDocument();
  });


  it('opens the tab ?tab= names, and falls back to the catalogue for an unknown one', async () => {
    const { unmount } = renderCorpus({ route: '/corpus?tab=search' });
    expect(screen.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    unmount();

    const second = renderCorpus({ route: '/corpus?tab=citations' });
    expect(screen.getByRole('tab', { name: 'Citation checker' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Check the citations' })).toBeInTheDocument();
    second.unmount();

    renderCorpus({ route: '/corpus?tab=nope' });
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });


  it('a tab click replaces ?tab= in the address and swaps the panel', async () => {
    const { user, router } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await user.click(screen.getByRole('tab', { name: 'Citation checker' }));
    expect(router.state.location.search).toBe('?tab=citations');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByRole('tabpanel', { name: 'Citation checker' })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Catalogue' }));
    expect(router.state.location.search).toBe('?tab=catalogue');
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// CorpusCatalogue — the acts table
// -----------------------------------------------------------
//
// The rows and their cells, the links, the summary, the
// disabled act, the last error, the ingestion poll, failures.
// -----------------------------------------------------------

describe('CorpusCatalogue — the acts table', () => {

  it('lists every act in catalogue order with its jurisdiction, type, status, version, provisions and obligations', async () => {
    renderCorpus();
    const mica = await actRow('MiCA');
    expect(shownActs()).toEqual(CATALOGUE);
    expect(cell(mica, 'jurisdiction')).toHaveTextContent('EU');
    expect(cell(mica, 'docType')).toHaveTextContent('Regulation');
    expect(cell(mica, 'status')).toHaveTextContent('In force');
    expect(cell(mica, 'version')).toHaveTextContent('v2 · Ready');
    expect(cell(mica, 'units')).toHaveTextContent('1,512');
    expect(cell(mica, 'obligationCount')).toHaveTextContent('3');

    const aml = await actRow('PPTFPĮ');
    expect(cell(aml, 'jurisdiction')).toHaveTextContent('Lithuania');
    expect(cell(aml, 'docType')).toHaveTextContent('Law');
    expect(cell(aml, 'version')).toHaveTextContent('v1 · Ready');

    const tfr = await actRow('TFR (2015)');
    expect(cell(tfr, 'status')).toHaveTextContent('Repealed');

    // The checked stamp is a column the admin has to ask for
    expect(screen.queryByRole('columnheader', { name: 'Checked' })).toBeNull();
    for (const name of ['Legal act', 'Jurisdiction', 'Type', 'Status', 'Version', 'Provisions', 'Obligations', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });


  it('shows the short title as the link to the act page and the official title under it', async () => {
    renderCorpus();
    const link = await screen.findByRole('link', { name: 'MiCA' });
    expect(link).toHaveAttribute('href', `/corpus/${MICA}`);
    const row = link.closest('[role="row"]');
    expect(within(row).getByText('2023 m. gegužės 31 d. Europos Parlamento ir Tarybos reglamentas (ES) 2023/1114 dėl kriptoturto rinkų')).toBeInTheDocument();
  });


  it('an act without a short title is linked by its official title, shown once', async () => {
    const untitled = { ...f.act(MICA), shortTitle: '' };
    withActs([untitled]);
    renderCorpus();
    const link = await screen.findByRole('link', { name: untitled.title });
    expect(within(link.closest('[role="row"]')).getAllByText(untitled.title)).toHaveLength(1);
  });


  it('a row click opens the act page', async () => {
    const { user } = renderCorpus();
    const row = await actRow('DORA');
    await user.click(cell(row, 'jurisdiction'));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${f.ID.dora}`);
  });


  it('sums up the catalogue: how many acts, how many ready, how many with errors', async () => {
    renderCorpus();
    expect(await screen.findByText('Legal acts: 7 · ready: 6 · with errors: 1')).toBeInTheDocument();
  });


  it('counts a failed current version as an error too, and a version still ingesting as not ready', async () => {
    withActs([
      withVersion(f.acts[2], { status: 'failed', error: 'parse failed: no articles found' }),
      withVersion(f.acts[1], { status: 'parsing' }),
      f.acts[0],
    ]);
    renderCorpus();
    expect(await screen.findByText('Legal acts: 3 · ready: 1 · with errors: 1')).toBeInTheDocument();
  });


  it('names the version state in the version cell, and an act never ingested says so', async () => {
    withActs([
      withVersion(f.acts[0], { status: 'pending', versionNo: 3 }),
      withVersion(f.acts[1], { status: 'embedding' }),
      withVersion(f.acts[2], { status: 'failed', error: 'no text' }),
      f.acts[4],
    ]);
    renderCorpus();
    expect(cell(await actRow('DI aktas'), 'version')).toHaveTextContent('v3 · Pending');
    expect(cell(await actRow('DORA'), 'version')).toHaveTextContent('v1 · Embedding');
    expect(cell(await actRow('MiCA'), 'version')).toHaveTextContent('v2 · Failed');
    const lb = await actRow('LB KTPT taisyklės');
    expect(cell(lb, 'version')).toHaveTextContent('Not ingested');
    expect(cell(lb, 'units')).toHaveTextContent('—');
  });


  it('puts the last ingestion error beside the version, named for assistive tech', async () => {
    withActs([f.acts[4], withVersion(f.acts[2], { status: 'failed', error: 'parse failed: no articles found' }), f.acts[1]]);
    renderCorpus();
    const lb = await actRow('LB KTPT taisyklės');
    expect(within(lb).getByLabelText('Error: www.lb.lt answered HTTP 503 for https://www.lb.lt/lt/ktpt-veiklos-taisykles')).toBeInTheDocument();
    // A failed version carries its own error when the act has none
    expect(within(await actRow('MiCA')).getByLabelText('Error: parse failed: no articles found')).toBeInTheDocument();
    expect(within(await actRow('DORA')).queryByLabelText(/^Error:/)).toBeNull();
  });


  it('marks a disabled act (an admin still sees it) and dims its row', async () => {
    renderCorpus();
    const tfr = await actRow('TFR (2015)');
    expect(within(tfr).getByText('Disabled')).toBeInTheDocument();
    expect(tfr).toHaveClass('opacity-60');
    const mica = await actRow('MiCA');
    expect(within(mica).queryByText('Disabled')).toBeNull();
    expect(mica).not.toHaveClass('opacity-60');
  });


  it('polls every 5 s while a version is still being ingested, and stops once every version is ready', async () => {
    const ingesting = { documents: f.acts.map((row) => (row.id === MICA ? withVersion(row, { status: 'embedding' }) : row)) };
    let calls = 0;
    server.use(http.get(url('/api/corpus/documents'), () => {
      calls += 1;
      return HttpResponse.json(calls === 1 ? ingesting : { documents: f.acts });
    }));
    // The interval is set when the query subscribes, so the fake
    // clock must be in place before the render
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    renderCorpus();
    expect(cell(await actRow('MiCA'), 'version')).toHaveTextContent('v2 · Embedding');
    expect(calls).toBe(1);

    await act(async () => { vi.advanceTimersByTime(5000); });
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(async () => expect(cell(await actRow('MiCA'), 'version')).toHaveTextContent('v2 · Ready'));

    await act(async () => { vi.advanceTimersByTime(15000); });
    vi.useRealTimers();
    await settle(50);
    expect(calls).toBe(2);
  });


  it('does not poll when every version is ready', async () => {
    const calls = record('get', '/api/corpus/documents');
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    renderCorpus();
    await actRow('MiCA');
    await act(async () => { vi.advanceTimersByTime(12000); });
    vi.useRealTimers();
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('shows the translated error with a retry when the list fails, and the rows once the retry succeeds', async () => {
    given.sequence('get', '/api/corpus/documents', [{ status: 500, body: { error: 'boom', code: 'SERVER_ERROR' } }, { body: { documents: f.acts } }]);
    const { user } = renderCorpus();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The legal acts could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText(/^Legal acts: /)).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'MiCA' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it('an empty corpus invites the admin to add acts', async () => {
    withActs([]);
    renderCorpus();
    expect(await screen.findByText('No legal acts yet')).toBeInTheDocument();
    expect(screen.getByText('Add legal acts — the compliance analysis depends on them.')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText(/^Legal acts: /)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add an act or standard' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// CorpusCatalogue — filters
// -----------------------------------------------------------
//
// The title search (server, debounced), the jurisdiction
// (server) and the act type (client), the filtered-empty
// state.
// -----------------------------------------------------------

describe('CorpusCatalogue — filters', () => {

  it('sends the title search as ?q= once the typing settles, not per keystroke', async () => {
    const calls = record('get', '/api/corpus/documents');
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await user.type(screen.getByRole('textbox', { name: 'Search by title' }), '  mica ');
    await waitFor(() => expect(shownActs()).toEqual(['MiCA']));
    // The first load, then one request for the settled, trimmed term
    expect(calls.map((call) => call.query.q)).toEqual([undefined, 'mica']);
    expect(screen.getByText('Legal acts: 1 · ready: 1 · with errors: 0')).toBeInTheDocument();
  });


  it('asks the backend for one jurisdiction, and for every act again with "All"', async () => {
    const calls = record('get', '/api/corpus/documents');
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await choose(user, screen.getByRole('combobox', { name: 'Jurisdiction' }), 'Lithuania');
    await waitFor(() => expect(shownActs()).toEqual(['LB KTPT taisyklės', 'PPTFPĮ', 'VKĮ']));
    expect(calls.at(-1).query).toEqual({ jurisdiction: 'LT' });

    await choose(user, screen.getByRole('combobox', { name: 'Jurisdiction' }), 'EU');
    await waitFor(() => expect(shownActs()).toEqual(['DI aktas', 'DORA', 'MiCA', 'TFR (2015)']));
    expect(calls.at(-1).query).toEqual({ jurisdiction: 'EU' });

    await choose(user, screen.getByRole('combobox', { name: 'Jurisdiction' }), 'All');
    await waitFor(() => expect(shownActs()).toEqual(CATALOGUE));
    expect(calls.at(-1).query).toEqual({});
  });


  it('combines the search with the jurisdiction in one request', async () => {
    const calls = record('get', '/api/corpus/documents');
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await choose(user, screen.getByRole('combobox', { name: 'Jurisdiction' }), 'Lithuania');
    await user.type(screen.getByRole('textbox', { name: 'Search by title' }), 'kredito');
    await waitFor(() => expect(shownActs()).toEqual(['VKĮ']));
    expect(calls.at(-1).query).toEqual({ q: 'kredito', jurisdiction: 'LT' });
  });


  it('narrows the loaded rows by act type without asking the backend again', async () => {
    const calls = record('get', '/api/corpus/documents');
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await choose(user, screen.getByRole('combobox', { name: 'Type' }), 'Law');
    await waitFor(() => expect(shownActs()).toEqual(['PPTFPĮ', 'VKĮ']));
    await choose(user, screen.getByRole('combobox', { name: 'Type' }), 'Resolution');
    await waitFor(() => expect(shownActs()).toEqual(['LB KTPT taisyklės']));
    await settle(50);
    expect(calls).toHaveLength(1);
    // The summary still speaks of the whole answer
    expect(screen.getByText('Legal acts: 7 · ready: 6 · with errors: 1')).toBeInTheDocument();
  });


  it('says no act matches the filters, without the admin invitation', async () => {
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await choose(user, screen.getByRole('combobox', { name: 'Type' }), 'Directive');
    expect(await screen.findByText('No legal acts match the filters')).toBeInTheDocument();
    expect(screen.queryByText('Add legal acts — the compliance analysis depends on them.')).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
  });


  it('a search that finds nothing says so', async () => {
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await user.type(screen.getByRole('textbox', { name: 'Search by title' }), 'gdpr');
    expect(await screen.findByText('No legal acts match the filters')).toBeInTheDocument();
    expect(screen.queryByText('Add legal acts — the compliance analysis depends on them.')).toBeNull();
  });
});







// -----------------------------------------------------------
// Coming back to the catalogue
// -----------------------------------------------------------
//
// The filters and the table's page and sort live in the
// address (replaced), and a tab switch keeps them: Back from
// an act finds the catalogue as it was left.
// -----------------------------------------------------------

describe('CorpusCatalogue — coming back', () => {

  it('the search, the jurisdiction, the type and the sort come from the address', async () => {
    const calls = record('get', '/api/corpus/documents');
    renderCorpus({ route: '/corpus?q=a&jurisdiction=LT&type=law&sort=title.desc' });
    await waitFor(() => expect(shownActs()).toEqual(['VKĮ', 'PPTFPĮ']));
    expect(calls[0].query).toEqual({ q: 'a', jurisdiction: 'LT' });
    expect(screen.getByRole('textbox', { name: 'Search by title' })).toHaveValue('a');
    expect(screen.getByRole('combobox', { name: 'Jurisdiction' })).toHaveTextContent('Lithuania');
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Law');
  });


  it('the filters write the address (replacing it, the page reset); a tab switch keeps them', async () => {
    const { user, router } = renderCorpus({ route: '/corpus?page=2' });
    await screen.findByRole('link', { name: 'MiCA' });
    await choose(user, screen.getByRole('combobox', { name: 'Jurisdiction' }), 'EU');
    await waitFor(() => expect(router.state.location.search).toBe('?jurisdiction=EU'));
    expect(router.state.historyAction).toBe('REPLACE');
    await choose(user, screen.getByRole('combobox', { name: 'Type' }), 'Regulation');
    await user.type(screen.getByRole('textbox', { name: 'Search by title' }), 'DORA');
    await waitFor(() => expect(router.state.location.search).toBe('?jurisdiction=EU&type=regulation&q=DORA'));

    await user.click(screen.getByRole('tab', { name: 'Search' }));
    expect(router.state.location.search).toBe('?jurisdiction=EU&type=regulation&q=DORA&tab=search');
    await user.click(screen.getByRole('tab', { name: 'Catalogue' }));
    await waitFor(() => expect(shownActs()).toEqual(['DORA']));
    expect(screen.getByRole('textbox', { name: 'Search by title' })).toHaveValue('DORA');
  });


  it('a jurisdiction, type or column the catalogue does not know is ignored', async () => {
    const calls = record('get', '/api/corpus/documents');
    renderCorpus({ route: '/corpus?jurisdiction=MARS&type=poem&sort=secret.asc' });
    await waitFor(() => expect(shownActs()).toEqual(CATALOGUE));
    expect(calls[0].query).toEqual({});
  });


  it('in Lithuanian too', async () => {
    renderCorpus({ route: '/corpus?jurisdiction=LT&type=law', locale: 'lt' });
    await waitFor(() => expect(shownActs()).toEqual(['PPTFPĮ', 'VKĮ']));
    expect(screen.getByRole('combobox', { name: 'Jurisdikcija' })).toHaveTextContent('Lietuva');
    expect(screen.getByRole('combobox', { name: 'Rūšis' })).toHaveTextContent('Įstatymas');
  });
});







// -----------------------------------------------------------
// CorpusCatalogue — the admin row actions
// -----------------------------------------------------------
//
// Refresh and extract per act through useQueueJob: the POST,
// the toast with its link to /jobs, the refetch, the disabled
// states, the refusals — and the page staying put.
// -----------------------------------------------------------

describe('CorpusCatalogue — admin row actions', () => {

  it('refresh queues the ingest: the POST, the "Job queued" toast linking to /jobs, the list refetched — and the page stays', async () => {
    const posts = given.capture('post', '/api/corpus/documents/:documentId/refresh', f.queuedJob('corpus.ingest', `corpus:${MICA}`), { status: 202 });
    const gets = record('get', '/api/corpus/documents');
    const { user, router } = renderCorpus();
    const row = await actRow('MiCA');
    await user.click(within(row).getByRole('button', { name: 'Refresh from the source' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/corpus/documents/${MICA}/refresh`));
    expect(posts[0].body).toEqual({});
    const link = await screen.findByRole('link', { name: 'View job' });
    expect(link).toHaveAttribute('href', '/jobs');
    expect(link.parentElement).toHaveTextContent('Job queued · View job');
    await waitFor(() => expect(gets).toHaveLength(2));
    // The button acts in place: no trip to the act page
    await settle(50);
    expect(router.state.location.pathname).toBe('/corpus');
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('the toast\'s link opens the jobs page', async () => {
    const { user } = renderCorpus();
    await user.click(within(await actRow('DORA')).getByRole('button', { name: 'Refresh from the source' }));
    await user.click(await screen.findByRole('link', { name: 'View job' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/jobs');
  });


  it('extract queues the obligation extraction in Lithuanian, the page staying put', async () => {
    const posts = given.capture('post', '/api/corpus/documents/:documentId/extract-obligations', f.queuedJob('corpus.extract_obligations', `obligations:${f.ID.aml}`), { status: 202 });
    const { user, router } = renderCorpus();
    await user.click(within(await actRow('PPTFPĮ')).getByRole('button', { name: 'Extract obligations' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/corpus/documents/${f.ID.aml}/extract-obligations`));
    expect(posts[0].body).toEqual({ language: 'lt' });
    expect(await screen.findByRole('link', { name: 'View job' })).toBeInTheDocument();
    await settle(50);
    expect(router.state.location.pathname).toBe('/corpus');
  });


  it('an act without a version cannot be extracted; an uploaded act without a file cannot be refreshed', async () => {
    const upload = { ...f.NEW.act, shortTitle: 'Įkeltas aktas', obligationCount: 0 };
    withActs([f.acts[4], upload, f.acts[2]]);
    renderCorpus();
    const lb = await actRow('LB KTPT taisyklės');
    expect(within(lb).getByRole('button', { name: 'Extract obligations' })).toBeDisabled();
    expect(within(lb).getByRole('button', { name: 'Refresh from the source' })).toBeEnabled();
    const uploaded = await actRow('Įkeltas aktas');
    expect(within(uploaded).getByRole('button', { name: 'Refresh from the source' })).toBeDisabled();
    expect(within(uploaded).getByRole('button', { name: 'Extract obligations' })).toBeDisabled();
    const mica = await actRow('MiCA');
    expect(within(mica).getByRole('button', { name: 'Refresh from the source' })).toBeEnabled();
    expect(within(mica).getByRole('button', { name: 'Extract obligations' })).toBeEnabled();
  });


  // Refusals of the queued work: the api client toasts the
  // translated sentence, nothing is announced as queued
  const REFUSALS = [
    ['NOT_INGESTED', 409, 'extract-obligations', 'Extract obligations', 'The legal act has not been ingested yet.'],
    ['FORBIDDEN', 403, 'refresh', 'Refresh from the source', 'You are not allowed to do this.'],
    ['AI_BUDGET_EXHAUSTED', 402, 'extract-obligations', 'Extract obligations', 'The AI service budget is used up — try again later or contact your administrator.'],
  ];

  for (const [code, status, route, button, text] of REFUSALS) {
    it(`a ${status} ${code} on ${route} toasts "${text}" and queues nothing`, async () => {
      given.apiError('post', `/api/corpus/documents/:documentId/${route}`, code, { status });
      const { user, router } = renderCorpus();
      await user.click(within(await actRow('MiCA')).getByRole('button', { name: button }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'View job' })).toBeNull();
      expect(router.state.location.pathname).toBe('/corpus');
    });
  }


  it('a dropped connection on refresh toasts the network sentence', async () => {
    given.networkError('post', '/api/corpus/documents/:documentId/refresh');
    const { user } = renderCorpus();
    await user.click(within(await actRow('MiCA')).getByRole('button', { name: 'Refresh from the source' }));
    expect(await screen.findByText('Could not reach the server. Check your internet connection.')).toBeInTheDocument();
  });


  it('a 401 on refresh sends the admin to /login with the page as ?next=', async () => {
    given.unauthorized('post', '/api/corpus/documents/:documentId/refresh');
    const { user } = renderCorpus();
    await user.click(within(await actRow('MiCA')).getByRole('button', { name: 'Refresh from the source' }));
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fcorpus']));
    expect(screen.queryByRole('link', { name: 'View job' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Corpus page — the bulk jobs
// -----------------------------------------------------------
//
// "Check all sources" and "Re-embed everything" behind the
// header menu, each confirmed first.
// -----------------------------------------------------------

describe('Corpus page — the confirmed bulk jobs', () => {

  const openMenuItem = async (user, name) => {
    await screen.findByRole('link', { name: 'MiCA' });
    const more = screen.getByRole('button', { name: 'More actions' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await user.click(await screen.findByRole('menuitem', { name }));
  };


  it('the menu offers the two bulk jobs', async () => {
    const { user } = renderCorpus();
    await screen.findByRole('link', { name: 'MiCA' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Check all sources', 'Re-embed everything']);
  });


  it('"Check all sources" asks first, then POSTs /refresh-all, toasts the queued job and closes', async () => {
    const posts = given.capture('post', '/api/corpus/refresh-all', f.queuedJob('corpus.refresh_all', 'corpus:refresh-all'), { status: 202 });
    const { user } = renderCorpus();
    await openMenuItem(user, 'Check all sources');
    const dialog = await screen.findByRole('dialog', { name: 'Check all sources?' });
    expect(dialog).toHaveTextContent('The sources (EUR-Lex, e-TAR, the Bank of Lithuania) are checked for new versions; changed acts are ingested again.');
    expect(posts).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({});
    expect(await screen.findByRole('link', { name: 'View job' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('"Re-embed everything" warns about the cost, then POSTs /reembed for every act', async () => {
    const posts = given.capture('post', '/api/corpus/reembed', f.queuedJob('corpus.reembed', 'corpus:reembed'), { status: 202 });
    const { user } = renderCorpus();
    await openMenuItem(user, 'Re-embed everything');
    const dialog = await screen.findByRole('dialog', { name: 'Re-embed every legal act?' });
    expect(dialog).toHaveTextContent('Every act\'s chunks are embedded again — only needed after the embedding model changed. This uses the AI model and costs money.');
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    // No documentId: the whole corpus
    expect(posts[0].body).toEqual({});
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('Cancel closes the confirmation without sending anything', async () => {
    const posts = given.capture('post', '/api/corpus/refresh-all');
    const { user } = renderCorpus();
    await openMenuItem(user, 'Check all sources');
    const dialog = await screen.findByRole('dialog', { name: 'Check all sources?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(posts).toHaveLength(0);
  });


  it('a failed bulk job keeps the confirmation open with the error inside; the next confirmation starts clean', async () => {
    given.apiError('post', '/api/corpus/refresh-all', 'SERVER_ERROR', { status: 500 });
    const { user } = renderCorpus();
    await openMenuItem(user, 'Check all sources');
    const dialog = await screen.findByRole('dialog', { name: 'Check all sources?' });
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(within(dialog).getByRole('button', { name: 'Run' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'View job' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await openMenuItem(user, 'Re-embed everything');
    const next = await screen.findByRole('dialog', { name: 'Re-embed every legal act?' });
    expect(within(next).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Corpus page — a plain user
// -----------------------------------------------------------
//
// Reading only: no add, no bulk menu, no row actions, no
// obligation counts; the backend lists the enabled acts only.
// -----------------------------------------------------------

describe('Corpus page — a plain user', () => {

  it('reads the catalogue without any admin control or the obligation counts', async () => {
    // The view lists a user the enabled acts only
    withActs(f.acts.filter((row) => row.enabled));
    renderCorpus({ session: userAuthData });
    await screen.findByRole('link', { name: 'MiCA' });
    expect(shownActs()).toEqual(CATALOGUE.filter((name) => name !== 'TFR (2015)'));
    expect(screen.queryByRole('button', { name: 'Add an act or standard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh from the source' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Extract obligations' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Obligations/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Actions/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('an empty corpus tells a user there is nothing, without the invitation meant for admins', async () => {
    withActs([]);
    renderCorpus({ session: userAuthData });
    expect(await screen.findByText('No legal acts yet')).toBeInTheDocument();
    expect(screen.queryByText('Add legal acts — the compliance analysis depends on them.')).toBeNull();
  });


  it('keeps the three tabs for a user', async () => {
    renderCorpus({ session: userAuthData, route: '/corpus?tab=search' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Catalogue', 'Search', 'Citation checker']);
    expect(screen.getByRole('search')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// AddActDialog
// -----------------------------------------------------------
//
// The defaults, the per-source fields and checks, the POST
// body, the upload, the refusals and the reset on close.
// -----------------------------------------------------------

describe('AddActDialog', () => {

  const field = (dialog, name) => within(dialog).getByRole('textbox', { name });


  it('opens blank with the defaults: EU, Regulation, In force, Lithuanian, a web address source', async () => {
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    expect(field(dialog, /^Official title/)).toHaveValue('');
    expect(field(dialog, /^Official title/)).toHaveFocus();
    expect(within(dialog).getByRole('combobox', { name: 'Jurisdiction' })).toHaveTextContent('EU');
    expect(within(dialog).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Regulation');
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toHaveTextContent('In force');
    expect(within(dialog).getByRole('combobox', { name: 'Text language' })).toHaveTextContent('Lithuanian');
    expect(within(dialog).getByRole('combobox', { name: 'Source' })).toHaveTextContent('Web address');
    expect(field(dialog, /^Address/)).toBeInTheDocument();
    expect(within(dialog).getByText('An https:// address')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: /^Identifier/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeEnabled();
  });


  it('offers every source kind', async () => {
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Source' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['EUR-Lex (CELEX)', 'e-TAR', 'e-seimas', 'Bank of Lithuania website', 'Web address', 'Uploaded file']);
  });


  it('checks the form before sending: a title and an https:// address are required', async () => {
    const posts = given.capture('post', '/api/corpus/documents');
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('Enter a title')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter an https:// address')).toBeInTheDocument();
    expect(field(dialog, /^Official title/)).toHaveAttribute('aria-invalid', 'true');

    await user.type(field(dialog, /^Address/), 'http://example.lt/aktas');
    expect(within(dialog).getByText('Enter an https:// address')).toBeInTheDocument();
    await settle(50);
    expect(posts).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'New legal act' })).toBeInTheDocument();
  });


  it('a Bank of Lithuania source must be a www.lb.lt address', async () => {
    const posts = given.capture('post', '/api/corpus/documents');
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'Bank of Lithuania website');
    expect(within(dialog).getByText('A www.lb.lt page address')).toBeInTheDocument();
    await user.type(field(dialog, /^Official title/), 'Taisyklės');
    await user.type(field(dialog, /^Address/), 'https://www.example.lt/taisykles');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('The address must be on www.lb.lt')).toBeInTheDocument();
    await settle(50);
    expect(posts).toHaveLength(0);
  });


  it('a register source asks for its identifier: the CELEX hint for EUR-Lex, the e-TAR one for the registers', async () => {
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'EUR-Lex (CELEX)');
    expect(within(dialog).getByText('CELEX number, e.g. 32023R1114')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: /^Address/ })).toBeNull();
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'e-seimas');
    expect(within(dialog).getByText('e-TAR document identifier')).toBeInTheDocument();
    await user.type(field(dialog, /^Official title/), 'Įstatymas');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('Enter the identifier')).toBeInTheDocument();
  });


  it('creates an EUR-Lex act: the POST carries the metadata and the CELEX number, the toast says it is queued, the act page opens', async () => {
    const posts = record('post', '/api/corpus/documents');
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), '  Reglamentas (ES) 2023/1113 dėl informacijos, pridedamos prie lėšų pervedimų  ');
    await user.type(field(dialog, /^Short title/), 'TFR');
    await user.type(field(dialog, /^English title/), 'Transfer of Funds Regulation');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Status' }), 'Not yet applicable');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'EUR-Lex (CELEX)');
    await user.type(field(dialog, /^Identifier/), ' 32023R1113 ');
    const domains = within(dialog).getByRole('combobox', { name: 'Domains (tags)' });
    await user.type(domains, 'AML{Enter}');
    await user.type(domains, 'crypto{Enter}');
    expect(within(dialog).getByRole('button', { name: 'aml' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Typically applies to' }));
    await user.click(await screen.findByRole('option', { name: 'Crypto-asset service provider' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Typically applies to' }));
    await user.click(await screen.findByRole('option', { name: 'Payment institution' }));
    await user.type(field(dialog, /^Applicability notes/), 'Pakeičia 2015 m. reglamentą.');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({
      title: 'Reglamentas (ES) 2023/1113 dėl informacijos, pridedamos prie lėšų pervedimų',
      shortTitle: 'TFR',
      titleEn: 'Transfer of Funds Regulation',
      jurisdiction: 'EU',
      docType: 'regulation',
      status: 'not_yet_applicable',
      language: 'lt',
      sourceKind: 'cellar',
      externalId: '32023R1113',
      domains: ['aml', 'crypto'],
      appliesTo: ['casp', 'payment_institution'],
      applicabilityNotes: 'Pakeičia 2015 m. reglamentą.',
    });
    expect(await screen.findByText('Legal act added; its ingestion is queued.')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${NEW_ACT}`);
  }, 30000);


  // Each fetchable source sends exactly the one source field it
  // uses (the other one never travels)
  const SOURCES = [
    ['e-TAR', /^Identifier/, 'TAR.5C1E0F2A7B90', { sourceKind: 'etar', externalId: 'TAR.5C1E0F2A7B90' }],
    ['e-seimas', /^Identifier/, 'XIV-1234', { sourceKind: 'eseimas', externalId: 'XIV-1234' }],
    ['Bank of Lithuania website', /^Address/, 'https://www.lb.lt/lt/ktpt-veiklos-taisykles', { sourceKind: 'lb', sourceUrl: 'https://www.lb.lt/lt/ktpt-veiklos-taisykles' }],
    ['Web address', /^Address/, ' https://example.lt/aktas ', { sourceKind: 'url', sourceUrl: 'https://example.lt/aktas' }],
  ];

  for (const [source, label, value, expected] of SOURCES) {
    it(`a "${source}" source sends ${Object.keys(expected).join(' and ')} only`, async () => {
      const posts = record('post', '/api/corpus/documents');
      const { user } = renderCorpus();
      const dialog = await openAdd(user);
      await user.type(field(dialog, /^Official title/), 'Aktas');
      await choose(user, within(dialog).getByRole('combobox', { name: 'Jurisdiction' }), 'Lithuania');
      await choose(user, within(dialog).getByRole('combobox', { name: 'Type' }), 'Law');
      if (source !== 'Web address') await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), source);
      await user.type(field(dialog, label), value);
      await user.click(within(dialog).getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0].body).toEqual({
        title: 'Aktas', shortTitle: '', titleEn: '', jurisdiction: 'LT', docType: 'law', status: 'in_force', language: 'lt',
        domains: [], appliesTo: [], applicabilityNotes: '', ...expected,
      });
      expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${NEW_ACT}`);
    });
  }


  it('an uploaded act needs a file; the act is created first, then the file goes to /upload as multipart, then the act page opens', async () => {
    const creates = record('post', '/api/corpus/documents');
    const uploads = given.capture('post', '/api/corpus/documents/:documentId/upload', f.queuedJob('corpus.ingest', `corpus:${NEW_ACT}`), { status: 202 });
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Vidaus taisyklės');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'Uploaded file');
    expect(within(dialog).queryByRole('textbox', { name: /^Address/ })).toBeNull();
    expect(within(dialog).getByText('A PDF, DOCX, HTML or TXT file')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    // The message reads like the file button next to it
    await waitFor(() => expect(within(dialog).getAllByText('Choose a file').filter((node) => node.tagName !== 'BUTTON')).toHaveLength(1));
    expect(creates).toHaveLength(0);

    const file = new File(['%PDF-1.7 taisyklės'], 'taisykles.pdf', { type: 'application/pdf' });
    await user.upload(dialog.querySelector('input[type="file"]'), file);
    expect(within(dialog).getByText('Chosen: taisykles.pdf')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(creates).toHaveLength(1);
    expect(creates[0].body).toEqual({
      title: 'Vidaus taisyklės', shortTitle: '', titleEn: '', jurisdiction: 'EU', docType: 'regulation', status: 'in_force',
      language: 'lt', sourceKind: 'upload', domains: [], appliesTo: [], applicabilityNotes: '',
    });
    expect(uploads[0].url).toBe(url(`/api/corpus/documents/${NEW_ACT}/upload`));
    expect(uploads[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(uploads[0].body).toEqual({ file: { name: 'taisykles.pdf', size: file.size, type: 'application/pdf' } });
    expect(await screen.findByText('Legal act added; its ingestion is queued.')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${NEW_ACT}`);
  });


  it('a standard: the form switches to an uploaded international copy in English, without "applies to", and posts none', async () => {
    const creates = given.capture('post', '/api/corpus/documents', { ...f.NEW.act, docType: 'standard', jurisdiction: 'INTL' }, { status: 201 });
    const uploads = given.capture('post', '/api/corpus/documents/:documentId/upload', f.queuedJob('corpus.ingest', `corpus:${NEW_ACT}`), { status: 202 });
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Information security management systems — Requirements');
    await user.type(field(dialog, /^Short title/), 'ISO/IEC 27001:2022');
    expect(within(dialog).getByRole('combobox', { name: 'Typically applies to' })).toBeInTheDocument();
    await choose(user, within(dialog).getByRole('combobox', { name: 'Type' }), 'Standard');

    expect(screen.getByRole('dialog', { name: 'New standard' })).toBe(dialog);
    expect(within(dialog).getByRole('combobox', { name: 'Jurisdiction' })).toHaveTextContent('International');
    expect(within(dialog).getByRole('combobox', { name: 'Source' })).toHaveTextContent('Uploaded file');
    expect(within(dialog).getByRole('combobox', { name: 'Text language' })).toHaveTextContent('English');
    expect(within(dialog).queryByRole('combobox', { name: 'Typically applies to' })).toBeNull();
    expect(within(dialog).getByText(/^A standard applies to the companies that adopted it/)).toBeInTheDocument();
    expect(within(dialog).getByText(/^The designation, e\.g\. ISO\/IEC 27001:2022/)).toBeInTheDocument();
    expect(within(dialog).getByText(/^A PDF with selectable text works best/)).toBeInTheDocument();

    const file = new File(['%PDF-1.7 ISO/IEC 27001'], 'iso-27001.pdf', { type: 'application/pdf' });
    await user.upload(dialog.querySelector('input[type="file"]'), file);
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(creates[0].body).toEqual({
      title: 'Information security management systems — Requirements', shortTitle: 'ISO/IEC 27001:2022', titleEn: '',
      jurisdiction: 'INTL', docType: 'standard', status: 'in_force', language: 'en', sourceKind: 'upload', applicabilityNotes: '',
    });
    expect(uploads[0].body).toEqual({ file: { name: 'iso-27001.pdf', size: file.size, type: 'application/pdf' } });
  });


  it('the missing file is an alert — a screen reader hears it the moment Add refuses — gone once a file is chosen', async () => {
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Vidaus taisyklės');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'Uploaded file');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/^Choose a file$/);
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['%PDF-1.7'], 'taisykles.pdf', { type: 'application/pdf' }));
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('an act\'s file over the backend\'s 60 MB is refused as it is chosen: named with the limit, not chosen, nothing sent', async () => {
    const posts = given.capture('post', '/api/corpus/documents');
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Didelis aktas');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'Uploaded file');
    expect(within(dialog).getByText('Maximum file size: 60 MB')).toBeInTheDocument();
    const huge = new File(['%PDF-1.7'], 'didelis.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 60 * 1024 * 1024 + 1 });
    await user.upload(dialog.querySelector('input[type="file"]'), huge);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('didelis.pdf — file too large (at most 60 MB)');
    expect(within(dialog).queryByText('Chosen: didelis.pdf')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(within(dialog).getAllByRole('alert')).toHaveLength(2));
    expect(within(dialog).getAllByRole('alert').map((alert) => alert.textContent))
      .toEqual(['didelis.pdf — file too large (at most 60 MB)', 'Choose a file']);
    await settle(50);
    expect(posts).toHaveLength(0);
  });


  it('says the limit, the refusal and the missing file in Lithuanian', async () => {
    const { user } = renderCorpus({ locale: 'lt' });
    await screen.findByRole('link', { name: 'MiCA' });
    await user.click(screen.getByRole('button', { name: 'Pridėti teisės aktą ar standartą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Naujas teisės aktas' });
    await user.type(field(dialog, /^Oficialus pavadinimas/), 'Aktas');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Šaltinis' }), 'Įkeltas failas');
    expect(within(dialog).getByText('Didžiausias failo dydis: 60 MB')).toBeInTheDocument();
    const huge = new File(['x'], 'aktas.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 61 * 1024 * 1024 });
    await user.upload(dialog.querySelector('input[type="file"]'), huge);
    await user.click(within(dialog).getByRole('button', { name: 'Pridėti' }));
    await waitFor(() => expect(within(dialog).getAllByRole('alert')).toHaveLength(2));
    expect(within(dialog).getAllByRole('alert').map((alert) => alert.textContent))
      .toEqual(['aktas.pdf — per didelis failas (daugiausia 60 MB)', 'Pasirinkite failą']);
  });


  it('an upload refused after the act was created says the act exists without its file, queues nothing and still opens the act', async () => {
    given.apiError('post', '/api/corpus/documents/:documentId/upload', 'FILE_TOO_LARGE', { status: 413 });
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Didelis aktas');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'Uploaded file');
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['x'], 'didelis.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('The legal act was added, but its file could not be uploaded: The file is too large. Upload it again on the act\'s page.')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${NEW_ACT}`);
    // Nothing was queued — no toast may say it was
    expect(screen.queryByText('Legal act added; its ingestion is queued.')).toBeNull();
  });


  it('says the same in Lithuanian', async () => {
    given.apiError('post', '/api/corpus/documents/:documentId/upload', 'UNSUPPORTED_TYPE', { status: 415 });
    const { user } = renderCorpus({ locale: 'lt' });
    await screen.findByRole('link', { name: 'MiCA' });
    await user.click(screen.getByRole('button', { name: 'Pridėti teisės aktą ar standartą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Naujas teisės aktas' });
    await user.type(field(dialog, /^Oficialus pavadinimas/), 'Aktas');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Šaltinis' }), 'Įkeltas failas');
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['x'], 'aktas.txt', { type: 'text/plain' }));
    expect(within(dialog).getByText('Pasirinkta: aktas.txt')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Pridėti' }));
    expect(await screen.findByText('Teisės aktas pridėtas, bet jo failo įkelti nepavyko: Šio tipo failai nepalaikomi. Įkelkite failą dar kartą teisės akto puslapyje.')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${NEW_ACT}`);
  });


  it('refuses an invalid domain tag before sending', async () => {
    const posts = given.capture('post', '/api/corpus/documents');
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Aktas');
    await user.type(field(dialog, /^Address/), 'https://example.lt/aktas');
    await user.type(within(dialog).getByRole('combobox', { name: 'Domains (tags)' }), 'Crypto assets{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('Invalid tag: crypto assets')).toBeInTheDocument();
    await settle(50);
    expect(posts).toHaveLength(0);
  });


  it('shows the backend\'s own prose for an INVALID_FIELD in English, inline, without a toast', async () => {
    given.apiError('post', '/api/corpus/documents', 'INVALID_FIELD', { status: 400, error: 'sourceUrl must be a www.lb.lt address for sourceKind lb' });
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Aktas');
    await user.type(field(dialog, /^Address/), 'https://example.lt/aktas');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('sourceUrl must be a www.lb.lt address for sourceKind lb');
    expect(screen.getByRole('dialog', { name: 'New legal act' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeEnabled();
    await settle(50);
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('names the refused field in Lithuanian (INVALID_FIELD)', async () => {
    given.apiError('post', '/api/corpus/documents', 'INVALID_FIELD', { status: 400, error: 'externalId is required for sourceKind cellar' });
    const { user } = renderCorpus({ locale: 'lt' });
    await screen.findByRole('link', { name: 'MiCA' });
    await user.click(screen.getByRole('button', { name: 'Pridėti teisės aktą ar standartą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Naujas teisės aktas' });
    await user.type(field(dialog, /^Oficialus pavadinimas/), 'Aktas');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Šaltinis' }), 'EUR-Lex (CELEX)');
    await user.type(field(dialog, /^Identifikatorius/), '32023R1113');
    await user.click(within(dialog).getByRole('button', { name: 'Pridėti' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Neteisinga lauko „Identifikatorius“ reikšmė.');
  });


  it('says a legal act with this short title already exists (SLUG_TAKEN) and keeps the dialog open', async () => {
    given.apiError('post', '/api/corpus/documents', 'SLUG_TAKEN', { status: 409 });
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Kitas MiCA');
    await user.type(field(dialog, /^Short title/), 'MiCA');
    await user.type(field(dialog, /^Address/), 'https://example.lt/mica');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A legal act with this short title already exists.');
    expect(field(dialog, /^Short title/)).toHaveValue('MiCA');
    await settle(50);
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('Enter in a one-line field submits the form; in the multi-line title it is a line break', async () => {
    const posts = record('post', '/api/corpus/documents');
    const { user } = renderCorpus();
    const dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Aktas{Enter}');
    await settle(50);
    expect(posts).toHaveLength(0);
    await user.type(field(dialog, /^Address/), 'https://example.lt/aktas');
    await user.type(field(dialog, /^Short title/), 'AKT{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ title: 'Aktas', shortTitle: 'AKT', sourceUrl: 'https://example.lt/aktas' });
  });


  it('starts blank again after Cancel', async () => {
    const { user } = renderCorpus();
    let dialog = await openAdd(user);
    await user.type(field(dialog, /^Official title/), 'Pusiau užpildytas');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Source' }), 'EUR-Lex (CELEX)');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await within(dialog).findByText('Enter the identifier');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Add an act or standard' }));
    dialog = await screen.findByRole('dialog', { name: 'New legal act' });
    expect(field(dialog, /^Official title/)).toHaveValue('');
    expect(within(dialog).getByRole('combobox', { name: 'Source' })).toHaveTextContent('Web address');
    expect(within(dialog).queryByText('Enter the identifier')).toBeNull();
    expect(within(dialog).queryByText('Enter a title')).toBeNull();
  });
});







// -----------------------------------------------------------
// Corpus page — in Lithuanian
// -----------------------------------------------------------

describe('Corpus page — in Lithuanian', () => {

  it('speaks Lithuanian: the title, tabs, columns, cells, summary and the admin controls', async () => {
    renderCorpus({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Teisės aktų bazė' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Katalogas', 'Paieška', 'Citatų tikrinimas']);
    const mica = await actRow('MiCA');
    expect(cell(mica, 'jurisdiction')).toHaveTextContent('ES');
    expect(cell(mica, 'docType')).toHaveTextContent('Reglamentas');
    expect(cell(mica, 'status')).toHaveTextContent('Galioja');
    expect(cell(mica, 'version')).toHaveTextContent('v2 · Paruošta');
    const lb = await actRow('LB KTPT taisyklės');
    expect(cell(lb, 'jurisdiction')).toHaveTextContent('Lietuva');
    expect(cell(lb, 'version')).toHaveTextContent('Neįkeltas');
    expect(within(lb).getByLabelText(/^Klaida: www\.lb\.lt answered HTTP 503/)).toBeInTheDocument();
    expect(within(await actRow('TFR (2015)')).getByText('Išjungtas')).toBeInTheDocument();
    expect(screen.getByText('Teisės aktų: 7 · paruošta: 6 · su klaidomis: 1')).toBeInTheDocument();
    for (const name of ['Teisės aktas', 'Jurisdikcija', 'Rūšis', 'Galiojimas', 'Redakcija', 'Nuostatų', 'Pareigų', 'Veiksmai']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Pridėti teisės aktą ar standartą' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daugiau veiksmų' })).toBeInTheDocument();
    expect(within(mica).getByRole('button', { name: 'Atnaujinti iš šaltinio' })).toBeInTheDocument();
    expect(within(mica).getByRole('button', { name: 'Išskirti pareigas' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ieškoti pagal pavadinimą' })).toBeInTheDocument();
  });


  it('confirms and toasts in Lithuanian', async () => {
    const { user } = renderCorpus({ locale: 'lt' });
    await screen.findByRole('link', { name: 'MiCA' });
    await user.click(screen.getByRole('button', { name: 'Daugiau veiksmų' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Perskaičiuoti visus vektorius' }));
    const dialog = await screen.findByRole('dialog', { name: 'Perskaičiuoti visų teisės aktų vektorius?' });
    await user.click(within(dialog).getByRole('button', { name: 'Paleisti' }));
    const link = await screen.findByRole('link', { name: 'Žiūrėti užduotį' });
    expect(link.parentElement).toHaveTextContent('Užduotis įtraukta į eilę · Žiūrėti užduotį');
  });


  it('the empty and filtered-empty states in Lithuanian', async () => {
    withActs([]);
    renderCorpus({ locale: 'lt' });
    expect(await screen.findByText('Teisės aktų dar nėra')).toBeInTheDocument();
    expect(screen.getByText('Pridėkite teisės aktus — nuo jų priklauso atitikties analizė.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the catalogue's endpoint.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/corpus/documents',
  fixture: { documents: f.acts },
  render: () => renderCorpus(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Legal corpus' }),
  loaded: async () => { await screen.findByRole('link', { name: 'MiCA' }); },
});
