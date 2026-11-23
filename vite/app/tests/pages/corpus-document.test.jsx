// -----------------------------------------------------------
//  [*] Tests — CorpusDocument page (/corpus/:documentId)
//
//  One legal act end to end against the backend double:
//  the frame (the short title as the heading, the official
//  title, the chips, the check stamp, the official source,
//  the back link, the skeletons, a failed / unknown / non-act
//  answer), the tabs in ?tab= (with ?unit= kept), the
//  versions tab (ActVersions: newest first, the current one
//  marked, the counts, a failed version's error, none yet, a
//  malformed list), the details tab (ActInfo, dashes for the
//  blanks), the obligations tab (ObligationsPanel fixed to
//  the act: every status for an admin, the approved ones
//  read-only for a user), the latest-job card (a running job
//  as a status with its progress, a failed one as an alert,
//  the link to /jobs, the 3 s poll), the disabled note, the
//  admin actions (refresh and forced re-process, a standard
//  re-processed with its structure read another way, upload
//  a new version as multipart — the backend's 60 MB said, a
//  larger file refused as it is chosen — extract obligations
//  with a language, re-embed this act, enable / disable,
//  delete; the disabled states, the refusals inside the
//  dialogs), the check of the obligations (the confirmation
//  that says what the judge does, POST …/verify-obligations
//  for the obligations not judged yet — and {again: true}
//  once all are — the judge's job asked by its subject and
//  shown like the latest job, the list read again when it
//  ends, nothing of it for a plain user), the
//  ActMetadataDialog (pre-filled, a PATCH of only the changed
//  fields, the checks, the refusals, the reset), coming back
//  (the obligations tab's filters and the versions table's
//  order under their own names in the address, kept through
//  a tab switch; the back link and the delete going Back to
//  the catalogue right behind, in both languages), a plain
//  user, Lithuanian, and the backend contract matrices for
//  GET /api/corpus/documents/:documentId and for the judge's
//  job (GET /api/jobs by its subject).
//
//  The structure tab (the provision tree and the unit viewer)
//  has its own file: corpus-provisions.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, userAuthData, ListProbe, renderRoutes } from '../support/render';
import { given, server, url, readBody } from '../support/backend/server';
import { VARIANTS, describeEndpointContract, settle } from '../support/backend/contract';
import { mediaQueryMatches } from '../support/setup';
import * as f from '../support/backend/fixtures';
import CorpusDocument from '@/pages/Corpus/CorpusDocument';


// The structure tab's layout query (theme.breakpoints.up('md'));
// setup.js keeps a matched query for the rest of the file, so
// every test that widens the screen is undone here
const WIDE = '(min-width:900px)';

afterEach(() => {
  mediaQueryMatches(WIDE, false);
});

const MICA = f.ID.mica;

// The MiCA detail every test starts from (versions + the done
// ingest job), and a copy with the given changes
const mica = f.act(MICA);
const micaWith = (patch) => ({ ...mica, ...patch });

// A running ingest of MiCA, as the detail carries it
const runningJob = { ...f.queuedJob('corpus.ingest', `corpus:${MICA}`), status: 'running', attempts: 1, startedAt: '2026-09-27T09:58:00+00:00', progress: { step: 'embed', percent: 40, message: null } };







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderAct: the page on its real route (useParams reads the
// id). record: every request to an endpoint while the default
// handler still answers. withAct: the detail route answering
// this act. main: the page's main landmark. openMenu / pick:
// the "more" menu and one of its entries. dialogNamed: the
// dialog with that title. definitions: the details tab's
// <dl> as {term: text}. rowOf: a grid row by a cell's text.
// -----------------------------------------------------------

function renderAct({ id = MICA, session = authData, query = '', locale } = {}) {
  return renderPage(<CorpusDocument authData={session} />, { route: `/corpus/${id}${query}`, path: '/corpus/:documentId', locale });
}

function record(method, path) {
  const calls = [];
  server.use(http[method](url(path), async ({ request }) => {
    calls.push({ url: request.url, query: Object.fromEntries(new URL(request.url).searchParams), body: await readBody(request.clone()) });
  }));
  return calls;
}

const withAct = (body) => given.json('get', '/api/corpus/documents/:documentId', body);

const main = () => screen.getByRole('main');

async function openMenu(user) {
  const more = await screen.findByRole('button', { name: 'More legal act actions' });
  await user.click(more);
  return screen.findByRole('menu');
}

async function pick(user, name) {
  const menu = await openMenu(user);
  await user.click(within(menu).getByRole('menuitem', { name }));
}

const dialogNamed = (name) => screen.findByRole('dialog', { name });

function definitions() {
  const list = main().querySelector('dl');
  return Object.fromEntries([...list.querySelectorAll('dt')].map((term) => [term.textContent, term.nextElementSibling.textContent]));
}

const rowOf = async (text) => (await screen.findByText(text)).closest('[role="row"]');

const loaded = (name = 'MiCA') => screen.findByRole('heading', { level: 1, name });







// -----------------------------------------------------------
// The frame
// -----------------------------------------------------------

describe('CorpusDocument — the frame', () => {

  it('titles the page with the short title, with the official title, the chips, the check stamp and the official source under it', async () => {
    renderAct();
    await loaded();
    const header = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(within(header).getByText(mica.title)).toBeInTheDocument();
    for (const chip of ['EU', 'Regulation', 'In force', 'v2 · Ready']) expect(within(header).getByText(chip)).toBeInTheDocument();
    expect(within(header).getByText('· Source checked 24/09/2026, 07:12')).toBeInTheDocument();
    // The current version's own address beats the act's
    const source = within(header).getByRole('link', { name: 'Official source' });
    expect(source).toHaveAttribute('href', mica.currentVersion.sourceUrl);
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(main()).getByRole('link', { name: 'Legal corpus' })).toHaveAttribute('href', '/corpus');
  });


  it('an act without a short title is titled by its official title, not repeated under it', async () => {
    withAct(micaWith({ shortTitle: '' }));
    renderAct();
    await loaded(mica.title);
    expect(within(main()).getAllByText(mica.title)).toHaveLength(1);
  });


  it('an act without a version links its own source page; one never checked shows no stamp and no source', async () => {
    const { unmount } = renderAct({ id: f.ID.lbRules });
    await loaded('LB KTPT taisyklės');
    expect(within(main()).getByRole('link', { name: 'Official source' })).toHaveAttribute('href', 'https://www.lb.lt/lt/ktpt-veiklos-taisykles');
    expect(within(main()).queryByText(/v\d+ ·/)).toBeNull();
    unmount();

    renderAct({ id: f.ID.newAct });
    await loaded('Naujas teisės aktas');
    expect(within(main()).queryByRole('link', { name: 'Official source' })).toBeNull();
    expect(within(main()).queryByText(/Source checked/)).toBeNull();
  });


  it('the back link returns to the corpus', async () => {
    const { user } = renderAct();
    await loaded();
    await user.click(within(main()).getByRole('link', { name: 'Legal corpus' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(/^\/corpus$/);
  });


  it('holds skeletons for the title and the body while the act loads, the back link already there', async () => {
    given.hang('get', '/api/corpus/documents/:documentId');
    renderAct();
    await settle(50);
    // MUI's Skeleton has no role and no text — its class is the only handle
    expect(screen.getByRole('heading', { level: 1 }).querySelector('.MuiSkeleton-root')).not.toBeNull();
    expect(main().querySelectorAll('.MuiSkeleton-root')).toHaveLength(2);
    expect(within(main()).getByRole('link', { name: 'Legal corpus' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });


  it('a failed load says so with the translated sentence, and the retry loads the act', async () => {
    given.sequence('get', '/api/corpus/documents/:documentId', [{ status: 500, body: { error: 'x', code: 'SERVER_ERROR' } }, { body: mica }]);
    const { user } = renderAct();
    const alert = await screen.findByRole('alert');
    expect(screen.getByRole('heading', { level: 1, name: 'Legal act' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('The legal act could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await loaded();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('an unknown act (or one hidden from this user) says it may have been deleted', async () => {
    renderAct({ id: 'd0000000-0000-4000-8000-00000000dead' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.getByRole('heading', { level: 1, name: 'Legal act' })).toBeInTheDocument();
  });


  it('a disabled act is hidden from a plain user: the view answers 404, the page says it may have been deleted', async () => {
    // document_item: `not document.enabled and role != admin` → NOT_FOUND
    given.apiError('get', '/api/corpus/documents/:documentId', 'NOT_FOUND', { status: 404, error: 'Document not found' });
    renderAct({ id: f.ID.tfr, session: userAuthData });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The legal act could not be loaded');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.queryByText('Disabled — not used in search and analysis')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });


  it('an answer that is not an act at all is a failed load, not a crash', async () => {
    // given.sequence would send {} for a null body
    let calls = 0;
    server.use(http.get(url('/api/corpus/documents/:documentId'), () => {
      calls += 1;
      return HttpResponse.json(calls === 1 ? null : mica);
    }));
    const { user } = renderAct();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The legal act could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await loaded();
  });
});







// -----------------------------------------------------------
// The tabs
// -----------------------------------------------------------

describe('CorpusDocument — the tabs', () => {

  it('opens on the structure; the tabs are structure, versions, obligations with the act\'s count, details', async () => {
    renderAct();
    await loaded();
    const tablist = screen.getByRole('tablist', { name: 'Legal act sections' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Structure', 'Versions', 'Obligations (3)', 'Details']);
    expect(within(tablist).getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Structure' });
    expect(within(tablist).getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-controls', panel.id);
  });


  it('opens the tab ?tab= names, and the structure for an unknown one', async () => {
    const first = renderAct({ query: '?tab=info' });
    await loaded();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Details' })).toBeInTheDocument();
    first.unmount();

    renderAct({ query: '?tab=bogus' });
    await loaded();
    expect(screen.getByRole('tab', { name: 'Structure' })).toHaveAttribute('aria-selected', 'true');
  });


  it('a tab click replaces ?tab= and keeps the selected unit', async () => {
    // Wide: on a phone the selected unit opens in a drawer over the page
    mediaQueryMatches(WIDE);
    const { user, router } = renderAct({ query: `?unit=${f.ID.micaArt59}` });
    await loaded();
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ unit: f.ID.micaArt59, tab: 'versions' });
    expect(screen.getByRole('tabpanel', { name: 'Versions' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Structure' }));
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ unit: f.ID.micaArt59, tab: 'structure' });
  });


  it('the obligations tab carries no count when the backend sends none', async () => {
    const { obligationCount, ...rest } = mica;
    expect(obligationCount).toBe(3);
    withAct(rest);
    renderAct();
    await loaded();
    expect(screen.getByRole('tab', { name: 'Obligations' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The versions tab (ActVersions)
// -----------------------------------------------------------

describe('CorpusDocument — the versions tab', () => {

  it('lists the versions newest first, the current one marked, with their state, label, dates, counts, parser and model', async () => {
    renderAct({ query: '?tab=versions' });
    await loaded();
    const grid = await screen.findByRole('grid', { name: 'Version' });
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.querySelector('[data-field="versionNo"]').textContent)).toEqual(['v2 · current', 'v1']);
    const cells = (row) => Object.fromEntries([...row.querySelectorAll('[data-field]')].map((cell) => [cell.dataset.field, cell.textContent]));
    expect(cells(rows[0])).toEqual({
      versionNo: 'v2 · current', status: 'Ready', label: '02023R1114-20240109', effectiveDate: '09/01/2024', unitCount: '1,512',
      articleCount: '149', chunkCount: '634', charCount: '1,063,422', parser: 'eu_xhtml', embedModel: 'gateway:azure/text-embedding-3-small',
      obligationsExtractedAt: '—', createdAt: '24/09/2026, 07:05',
    });
    expect(cells(rows[1])).toMatchObject({ versionNo: 'v1', label: '32023R1114', effectiveDate: '29/06/2023', unitCount: '1,506', obligationsExtractedAt: '05/09/2026, 08:40' });
    for (const name of ['Version', 'Status', 'Label', 'In force from', 'Provisions', 'Articles', 'Chunks', 'Characters', 'Parser', 'Embedding model', 'Obligations extracted', 'Uploaded']) {
      expect(within(grid).getByRole('columnheader', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });


  it('words the way a standard\'s structure was read; any other parser keeps its own name', async () => {
    withAct(micaWith({ versions: [{ ...mica.versions[0], parser: 'standard-refined' }, { ...mica.versions[1], parser: 'standard-pages' }] }));
    renderAct({ query: '?tab=versions' });
    await loaded();
    const grid = await screen.findByRole('grid', { name: 'Version' });
    const parsers = within(grid).getAllByRole('row').slice(1).map((row) => row.querySelector('[data-field="parser"]').textContent);
    expect(parsers).toEqual(['Rules and AI', 'Pages']);
  });


  it('puts a failed version\'s error beside its state, named for assistive tech', async () => {
    const failed = { ...mica.versions[0], id: 'd1000000-0000-4000-8000-000000000099', versionNo: 3, status: 'failed', error: 'extract failed: the PDF has no text layer', unitCount: 0 };
    withAct(micaWith({ versions: [failed, ...mica.versions] }));
    renderAct({ query: '?tab=versions' });
    const row = await rowOf('v3');
    expect(within(row).getByText('Failed')).toBeInTheDocument();
    expect(within(row).getByLabelText('extract failed: the PDF has no text layer')).toBeInTheDocument();
    expect(within(await rowOf('v1')).queryByLabelText(/failed/)).toBeNull();
  });


  it('says there are no versions yet for an act never ingested', async () => {
    renderAct({ id: f.ID.lbRules, query: '?tab=versions' });
    expect(await screen.findByText('No versions yet')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });


  it('a malformed versions list does not break the tab: the unusable rows are left out', async () => {
    withAct(micaWith({ versions: [{}, null, { ...mica.versions[1] }, { ...mica.versions[1] }, 'v9'] }));
    renderAct({ query: '?tab=versions' });
    const row = await rowOf('v1');
    expect(within(screen.getByRole('grid')).getAllByRole('row')).toHaveLength(2);
    expect(row).toBeInTheDocument();
    expect(screen.queryByTestId('render-crashed')).toBeNull();
  });
});







// -----------------------------------------------------------
// The details tab (ActInfo)
// -----------------------------------------------------------

describe('CorpusDocument — the details tab', () => {

  it('lists the catalogue record: titles, identifiers, the labelled enums, the source, tags and stamps', async () => {
    renderAct({ query: '?tab=info' });
    await loaded();
    expect(definitions()).toEqual({
      'Official title': mica.title,
      'English title': 'Regulation (EU) 2023/1114 on markets in crypto-assets',
      'Short title': 'MiCA',
      'System identifier': 'mica',
      Jurisdiction: 'EU',
      Type: 'Regulation',
      Status: 'In force',
      'Text language': 'Lithuanian',
      Source: 'EUR-Lex (CELEX)',
      'External identifier': '32023R1114',
      'Source address': mica.sourceUrl,
      Domains: 'crypto',
      'Typically applies to': 'Crypto-asset service provider',
      'Applicability notes': 'Taikoma kriptoturto paslaugų teikėjams ir kriptoturto emitentams.',
      'Whom it covers, as read from its text': 'BankCrypto-asset service providerElectronic money institutionInvestment firm'
        + "The model's note: Article 2(1) applies the Regulation to persons that issue, offer or provide services related to crypto-assets.",
      'Sanctions, as read from its text': 'Sanction tiers: 9'
        + "The model's note: Article 111 states the ceilings Member States must provide for; national law may set higher ones.",
      'Source checked': '24/09/2026, 07:12',
      Added: '04/09/2026, 07:30',
      Updated: '24/09/2026, 07:12',
    });
    const address = within(main().querySelector('dl')).getByRole('link', { name: mica.sourceUrl });
    expect(address).toHaveAttribute('href', mica.sourceUrl);
    expect(address).toHaveAttribute('target', '_blank');
  });


  it('shows a dash for every blank field', async () => {
    renderAct({ id: f.ID.newAct, query: '?tab=info' });
    await loaded('Naujas teisės aktas');
    expect(definitions()).toMatchObject({
      'English title': '—', 'Short title': '—', 'External identifier': '—', 'Source address': '—', Domains: '—',
      'Typically applies to': '—', 'Applicability notes': '—', 'Source checked': '—', Source: 'Uploaded file', Type: 'Other',
      'Whom it covers, as read from its text': 'Not read yet', 'Sanctions, as read from its text': 'Not read yet',
    });
    expect(document.body.textContent).not.toMatch(/\b(null|undefined)\b/);
  });


  it('says so when the scope provisions name no kind of institution, with the note the model left', async () => {
    renderAct({ id: f.ID.lbRules, query: '?tab=info' });
    await loaded('LB KTPT taisyklės');
    expect(definitions()).toMatchObject({
      'Whom it covers, as read from its text': 'Its scope provisions do not say whom it covers'
        + "The model's note: Points 1 to 6 hold headings only; they do not name the institutions the rules apply to.",
      'Sanctions, as read from its text': 'Not read yet',
    });
  });


  it('labels several tags and institution types', async () => {
    renderAct({ id: f.ID.dora, query: '?tab=info' });
    await loaded('DORA');
    const details = definitions();
    expect(details.Domains).toBe('ictoperational_resilience');
    expect(details['Typically applies to']).toBe('BankCrypto-asset service providerCredit unionCrowdfunding service providerElectronic money institutionInsurance undertakingInvestment firmPayment institution');
  });
});







// -----------------------------------------------------------
// The obligations tab
// -----------------------------------------------------------
//
// ObligationsPanel fixed to this act (its own behaviour is in
// obligations.test.jsx).
// -----------------------------------------------------------

describe('CorpusDocument — the obligations tab', () => {

  it('lists every obligation of the act for an admin, without the act column or the act picker', async () => {
    const calls = record('get', '/api/obligations');
    renderAct({ query: '?tab=obligations' });
    await loaded();
    expect(await screen.findByText('Gauti kriptoturto paslaugų teikėjo leidimą')).toBeInTheDocument();
    expect(calls[0].query).toEqual({ limit: '1000', document: MICA });
    expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Legal act/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Legal act' })).toBeNull();
    // The admin can review here too
    expect(screen.getAllByRole('button', { name: 'Approve' }).length).toBeGreaterThan(0);
  });


  it('deleting an obligation here refreshes the act: its tab counts one fewer', async () => {
    given.sequence('get', '/api/corpus/documents/:documentId', [{ body: mica }, { body: micaWith({ obligationCount: 2 }) }]);
    const { user } = renderAct({ query: '?tab=obligations' });
    await loaded();
    expect(screen.getByRole('tab', { name: 'Obligations (3)' })).toBeInTheDocument();
    const row = (await screen.findByText('Skelbti kainodarą interneto svetainėje')).closest('[role="row"]');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(within(await dialogNamed('Delete the obligation?')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Obligation deleted')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Obligations (2)' })).toBeInTheDocument();
  });


  it('shows a plain user the approved obligations only, read-only', async () => {
    const calls = record('get', '/api/obligations');
    const { user } = renderAct({ session: userAuthData, query: '?tab=obligations' });
    await loaded();
    expect(await screen.findByText('Gauti kriptoturto paslaugų teikėjo leidimą')).toBeInTheDocument();
    expect(calls[0].query).toEqual({ limit: '1000', document: MICA, status: 'approved' });
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    await user.click(screen.getByText('Apsaugoti klientų kriptoturtą ir lėšas'));
    const dialog = await dialogNamed('Obligation — MiCA');
    expect(within(dialog).getByRole('textbox', { name: /^Title/ })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
  });
});







// -----------------------------------------------------------
// The latest job and the state notes
// -----------------------------------------------------------
//
// A running job is a status (live progress, not an alarm), a
// failed one an alert; the disabled and not-ingested notes
// are statuses too.
// -----------------------------------------------------------

describe('CorpusDocument — the latest job and the state notes', () => {

  it('a failed ingestion is an alert with the job\'s error and the link to all jobs, next to the last ingestion error', async () => {
    renderAct({ id: f.ID.lbRules });
    await loaded('LB KTPT taisyklės');
    const alerts = within(main()).getAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Last ingestion errorwww.lb.lt answered HTTP 503 for https://www.lb.lt/lt/ktpt-veiklos-taisykles',
      'Failed: Legal act ingestionwww.lb.lt answered HTTP 503 for https://www.lb.lt/lt/ktpt-veiklos-taisyklesAll jobs',
    ]);
    expect(within(alerts[1]).getByRole('link', { name: 'All jobs' })).toHaveAttribute('href', '/jobs');
    // "Not ingested" describes a state — a status, not an alarm
    expect(within(main()).getByRole('status')).toHaveTextContent('The act is not ingested yet — its structure appears after ingestion.');
  });


  it('a running job is a status with its progress in words and as a bar, not an alarm', async () => {
    withAct(micaWith({ latestJob: runningJob }));
    renderAct();
    await loaded();
    const card = within(main()).getByRole('status');
    expect(card).toHaveTextContent('Running: Legal act ingestion');
    expect(card).toHaveTextContent('Embedding (40%)');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(within(card).getByRole('link', { name: 'All jobs' })).toHaveAttribute('href', '/jobs');
    expect(within(main()).queryByRole('alert')).toBeNull();
  });


  it('a queued job without progress names its state, with a bar that just runs', async () => {
    withAct(micaWith({ latestJob: f.queuedJob('corpus.extract_obligations', `obligations:${MICA}`) }));
    renderAct();
    await loaded();
    const card = within(main()).getByRole('status');
    expect(card).toHaveTextContent('Running: Obligation extraction');
    expect(card).toHaveTextContent('Queued');
    expect(within(card).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });


  it('says where the empty obligations list would be that they are being extracted right now, with the progress — not that there are none', async () => {
    given.json('get', '/api/obligations', { obligations: [], total: 0 });
    const extracting = { ...f.queuedJob('corpus.extract_obligations', `obligations:${MICA}`), status: 'running', attempts: 1,
                         progress: { step: 'extract', percent: 30, message: '3/9 batches' } };
    withAct(micaWith({ obligationCount: 0, latestJob: extracting }));
    const { unmount } = renderAct({ query: '?tab=obligations' });
    await loaded();
    const note = await screen.findByText('The obligations are being extracted right now');
    expect(note.closest('[role="status"]')).toHaveTextContent('Extraction — 3 of 9 batches (30%)The list appears by itself once the extraction has finished.');
    expect(within(main()).getByRole('progressbar', { name: 'The obligations are being extracted right now' })).toHaveAttribute('aria-valuenow', '30');
    expect(screen.queryByText('No obligations')).toBeNull();
    unmount();

    // Still waiting for its turn: said as that, with a bar that just runs
    withAct(micaWith({ obligationCount: 0, latestJob: f.queuedJob('corpus.extract_obligations', `obligations:${MICA}`) }));
    const queued = renderAct({ query: '?tab=obligations' });
    await loaded();
    expect(await screen.findByText('The extraction of the obligations is waiting in the queue')).toBeInTheDocument();
    expect(within(main()).getByRole('progressbar', { name: 'The extraction of the obligations is waiting in the queue' })).not.toHaveAttribute('aria-valuenow');
    queued.unmount();

    // Another job of the act, or none: the plain empty list
    withAct(micaWith({ obligationCount: 0, latestJob: runningJob }));
    renderAct({ query: '?tab=obligations' });
    await loaded();
    expect(await screen.findByText('No obligations')).toBeInTheDocument();
    expect(screen.queryByText('The obligations are being extracted right now')).toBeNull();
  });


  it('fills the obligations list in by itself when the extraction ends', async () => {
    const extracting = { ...f.queuedJob('corpus.extract_obligations', `obligations:${MICA}`), status: 'running', attempts: 1 };
    let ended = false;
    let lists = 0;
    server.use(
      http.get(url('/api/corpus/documents/:documentId'), () => HttpResponse.json(ended ? micaWith({ obligationCount: 1 }) : micaWith({ obligationCount: 0, latestJob: extracting }))),
      http.get(url('/api/obligations'), ({ request }) => {
        // The page's count of unchecked obligations is no list
        if (new URL(request.url).searchParams.get('verification') === 'unchecked') return HttpResponse.json({ obligations: [], total: 0 });
        lists += 1;
        return HttpResponse.json(ended ? { obligations: f.obligations.slice(0, 1), total: 1 } : { obligations: [], total: 0 });
      }),
    );
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderAct({ query: '?tab=obligations' });
    await loaded();
    expect(await screen.findByText('The obligations are being extracted right now')).toBeInTheDocument();
    expect(lists).toBe(1);
    ended = true;
    await act(async () => { vi.advanceTimersByTime(3_100); });
    await waitFor(() => expect(screen.queryByText('The obligations are being extracted right now')).toBeNull());
    await waitFor(() => expect(within(main()).getByRole('grid')).toBeInTheDocument());
    vi.useRealTimers();
    expect(lists).toBe(2);
    expect(screen.getByRole('tab', { name: 'Obligations (1)' })).toBeInTheDocument();
  });


  it('shows no card once the job finished well or was cancelled', async () => {
    const { unmount } = renderAct();
    await loaded();
    expect(within(main()).queryByRole('status')).toBeNull();
    expect(within(main()).queryByRole('alert')).toBeNull();
    unmount();

    withAct(micaWith({ latestJob: { ...runningJob, status: 'cancelled', finishedAt: f.NOW } }));
    renderAct();
    await loaded();
    expect(within(main()).queryByText(/All jobs/)).toBeNull();
  });


  it('the card\'s link opens the jobs page', async () => {
    withAct(micaWith({ latestJob: runningJob }));
    const { user } = renderAct();
    await loaded();
    await user.click(within(main()).getByRole('link', { name: 'All jobs' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/jobs');
  });


  it('polls the act every 3 s while its job runs, and stops once it is done', async () => {
    let calls = 0;
    server.use(http.get(url('/api/corpus/documents/:documentId'), () => {
      calls += 1;
      return HttpResponse.json(calls === 1 ? micaWith({ latestJob: runningJob }) : mica);
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    renderAct();
    await loaded();
    expect(within(main()).getByRole('status')).toHaveTextContent('Running: Legal act ingestion');
    await act(async () => { vi.advanceTimersByTime(3000); });
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(within(main()).queryByRole('status')).toBeNull());
    await act(async () => { vi.advanceTimersByTime(9000); });
    vi.useRealTimers();
    await settle(50);
    expect(calls).toBe(2);
  });


  it('a disabled act says so as a status, and its menu offers Enable', async () => {
    const { user } = renderAct({ id: f.ID.tfr });
    await loaded('TFR (2015)');
    expect(within(main()).getByRole('status')).toHaveTextContent('Disabled — not used in search and analysis');
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Enable' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Disable' })).toBeNull();
  });
});







// -----------------------------------------------------------
// The admin actions
// -----------------------------------------------------------

describe('CorpusDocument — the admin actions', () => {

  it('the menu lists every action of an ingested act, all enabled', async () => {
    const { user } = renderAct();
    await loaded();
    expect(screen.getByRole('button', { name: 'Refresh from the source' })).toBeEnabled();
    const menu = await openMenu(user);
    // Every MiCA obligation is judged already: the check can only be made again
    await within(menu).findByRole('menuitem', { name: 'Check the obligations again' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Re-process (even if unchanged)', 'Upload a new version', 'Extract obligations', 'Check the obligations again', 'Re-embed', 'Edit the metadata',
      'Disable', 'Delete the legal act',
    ]);
    for (const item of items) expect(item).not.toHaveAttribute('aria-disabled');
  });


  it('refresh queues the ingest: the POST, the "Job queued" toast linking to /jobs, the act refetched', async () => {
    const posts = given.capture('post', '/api/corpus/documents/:documentId/refresh', f.queuedJob('corpus.ingest', `corpus:${MICA}`), { status: 202 });
    const gets = record('get', '/api/corpus/documents/:documentId');
    const { user } = renderAct();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Refresh from the source' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/corpus/documents/${MICA}/refresh`));
    expect(posts[0].body).toEqual({});
    const link = await screen.findByRole('link', { name: 'View job' });
    expect(link).toHaveAttribute('href', '/jobs');
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
  });


  it('"Re-process" queues a forced ingest of the unchanged text', async () => {
    const posts = given.capture('post', '/api/corpus/documents/:documentId/refresh', f.queuedJob('corpus.ingest', `corpus:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Re-process (even if unchanged)');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ force: true });
    expect(await screen.findByRole('link', { name: 'View job' })).toBeInTheDocument();
  });


  it('a standard can be re-processed with its structure read another way: the way picked goes with the forced ingest', async () => {
    const standard = micaWith({ docType: 'standard', sourceKind: 'upload', shortTitle: 'NIST SP 800-53',
                                currentVersion: { ...mica.currentVersion, parser: 'standard-pages' } });
    withAct(standard);
    const posts = given.capture('post', '/api/corpus/documents/:documentId/refresh', f.queuedJob('corpus.ingest', `corpus:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded('NIST SP 800-53');
    // Indexed by its pages: said on the page, as a note
    expect(screen.getByText('No clause structure was found in this standard: it is indexed and cited by its pages.').closest('[role="status"]')).not.toBeNull();
    await pick(user, 'Read the structure another way');
    const dialog = await dialogNamed('How should the structure of “NIST SP 800-53” be read?');
    expect(within(dialog).getByText('Read now by: Pages')).toBeInTheDocument();
    const ways = within(dialog).getByRole('radiogroup', { name: 'Way of reading the structure' });
    expect(within(ways).getAllByRole('radio').map((radio) => [radio.value, radio.checked])).toEqual(
      [['auto', true], ['rules', false], ['ai', false], ['pages', false]]);
    await user.click(within(ways).getByRole('radio', { name: /^AI model/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Re-process' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/corpus/documents/${MICA}/refresh`));
    expect(posts[0].body).toEqual({ force: true, structure: 'ai' });
  });


  it('a standard never ingested cannot have its structure read another way, and one read by its clauses carries no note', async () => {
    withAct(micaWith({ docType: 'standard', sourceKind: 'upload', currentVersion: null, versions: [] }));
    const { user } = renderAct();
    await loaded();
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Read the structure another way' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/indexed and cited by its pages/)).toBeNull();
  });


  it('an uploaded act without a file can be neither refreshed nor re-processed, extracted nor re-embedded', async () => {
    const { user } = renderAct({ id: f.ID.newAct });
    await loaded('Naujas teisės aktas');
    expect(screen.getByRole('button', { name: 'Refresh from the source' })).toBeDisabled();
    const menu = await openMenu(user);
    for (const name of ['Re-process (even if unchanged)', 'Extract obligations', 'Re-embed']) {
      expect(within(menu).getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    for (const name of ['Upload a new version', 'Edit the metadata', 'Disable', 'Delete the legal act']) {
      expect(within(menu).getByRole('menuitem', { name })).not.toHaveAttribute('aria-disabled');
    }
  });


  it('a fetchable act without a version can be refreshed but not extracted', async () => {
    const { user } = renderAct({ id: f.ID.lbRules });
    await loaded('LB KTPT taisyklės');
    expect(screen.getByRole('button', { name: 'Refresh from the source' })).toBeEnabled();
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Extract obligations' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'Re-process (even if unchanged)' })).not.toHaveAttribute('aria-disabled');
  });


  it('a refused refresh shows the reason on the page as an alert (and toasts it)', async () => {
    given.apiError('post', '/api/corpus/documents/:documentId/refresh', 'FORBIDDEN', { status: 403 });
    const { user } = renderAct();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Refresh from the source' }));
    expect(await within(main()).findByRole('alert')).toHaveTextContent('You are not allowed to do this.');
    await waitFor(() => expect(screen.getAllByText('You are not allowed to do this.')).toHaveLength(2));
    expect(screen.queryByRole('link', { name: 'View job' })).toBeNull();
  });


  it('extract asks for the language — Lithuanian by default — and queues the extraction in the one chosen', async () => {
    const posts = given.capture('post', '/api/corpus/documents/:documentId/extract-obligations', f.queuedJob('corpus.extract_obligations', `obligations:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Extract obligations');
    const dialog = await dialogNamed('Extract the obligations of “MiCA”?');
    expect(dialog).toHaveTextContent('The AI model reads the current version and proposes obligations for review. Approved obligations are kept. This uses the AI model and costs money.');
    const language = within(dialog).getByRole('radiogroup', { name: 'Language of the obligations' });
    expect(within(language).getByRole('radio', { name: 'Lithuanian' })).toBeChecked();
    await user.click(within(language).getByRole('radio', { name: 'English' }));
    expect(posts).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/corpus/documents/${MICA}/extract-obligations`));
    expect(posts[0].body).toEqual({ language: 'en' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('link', { name: 'View job' })).toBeInTheDocument();
  });


  it('the extraction keeps Lithuanian unless another language is picked', async () => {
    const posts = given.capture('post', '/api/corpus/documents/:documentId/extract-obligations', f.queuedJob('corpus.extract_obligations', `obligations:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Extract obligations');
    await user.click(within(await dialogNamed('Extract the obligations of “MiCA”?')).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ language: 'lt' });
  });


  it('a refused extraction stays in its dialog with the reason inside; the next opening starts clean', async () => {
    given.apiError('post', '/api/corpus/documents/:documentId/extract-obligations', 'FORBIDDEN', { status: 403 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Extract obligations');
    const dialog = await dialogNamed('Extract the obligations of “MiCA”?');
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You are not allowed to do this.');
    expect(within(dialog).getByRole('button', { name: 'Run' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await pick(user, 'Re-embed');
    const next = await dialogNamed('Re-embed “MiCA”?');
    expect(within(next).queryByRole('alert')).toBeNull();
  });


  it('re-embed asks first, then queues the re-embedding of this act only', async () => {
    const posts = given.capture('post', '/api/corpus/reembed', f.queuedJob('corpus.reembed', 'corpus:reembed'), { status: 202 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Re-embed');
    const dialog = await dialogNamed('Re-embed “MiCA”?');
    expect(dialog).toHaveTextContent('The act\'s chunks are embedded again — only needed after the embedding model changed. This costs money.');
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ documentId: MICA });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('Cancel on a confirmation sends nothing', async () => {
    const posts = given.capture('post', '/api/corpus/reembed');
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Re-embed');
    await user.click(within(await dialogNamed('Re-embed “MiCA”?')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(posts).toHaveLength(0);
  });


  it('disable PATCHes enabled: false, toasts, and the page follows the refetched act', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', { ...mica, enabled: false });
    given.sequence('get', '/api/corpus/documents/:documentId', [{ body: mica }, { body: micaWith({ enabled: false }) }]);
    const { user } = renderAct();
    await loaded();
    expect(within(main()).queryByRole('status')).toBeNull();
    await pick(user, 'Disable');
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ enabled: false });
    expect(await screen.findByText('Legal act disabled')).toBeInTheDocument();
    expect(await within(main()).findByRole('status')).toHaveTextContent('Disabled — not used in search and analysis');
    const menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Enable' })).toBeInTheDocument();
  });


  it('enable PATCHes enabled: true on a disabled act', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', { ...f.act(f.ID.tfr), enabled: true });
    const { user } = renderAct({ id: f.ID.tfr });
    await loaded('TFR (2015)');
    await pick(user, 'Enable');
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ enabled: true });
    expect(await screen.findByText('Legal act enabled')).toBeInTheDocument();
  });


  it('a refused enable toasts the reason', async () => {
    given.apiError('patch', '/api/corpus/documents/:documentId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderAct({ id: f.ID.tfr });
    await loaded('TFR (2015)');
    await pick(user, 'Enable');
    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    expect(screen.queryByText('Legal act enabled')).toBeNull();
  });


  it('delete asks first, naming the act, then DELETEs, toasts and returns to the corpus in place of this page', async () => {
    const deletes = given.capture('delete', '/api/corpus/documents/:documentId', { ok: true });
    const { user, router } = renderAct();
    await loaded();
    await pick(user, 'Delete the legal act');
    const dialog = await dialogNamed('Delete the legal act “MiCA”?');
    expect(dialog).toHaveTextContent('Every version, provision, chunk and file is deleted. Reports already produced do not change. To stop using the act only for a while, disable it instead.');
    expect(deletes).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Delete the legal act' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/corpus/documents/${MICA}`));
    expect(await screen.findByText('Legal act deleted')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(/^\/corpus$/);
    expect(router.state.historyAction).toBe('REPLACE');
  });


  it('a refused delete stays in the dialog with the reason, and nothing is left', async () => {
    given.apiError('delete', '/api/corpus/documents/:documentId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Delete the legal act');
    const dialog = await dialogNamed('Delete the legal act “MiCA”?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete the legal act' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByTestId('navigated-away')).toBeNull();
    expect(screen.queryByText('Legal act deleted')).toBeNull();
  });


  it('upload waits for a file, sends it to /upload as multipart, toasts and closes', async () => {
    const uploads = given.capture('post', '/api/corpus/documents/:documentId/upload', f.queuedJob('corpus.ingest', `corpus:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Upload a new version');
    const dialog = await dialogNamed('New version');
    expect(dialog).toHaveTextContent('Upload the text of the new version (PDF, DOCX, HTML or TXT). A file identical to the current version is refused.');
    const submit = within(dialog).getByRole('button', { name: 'Upload' });
    expect(submit).toBeDisabled();
    const file = new File(['<html><body>MiCA</body></html>'], 'mica-2024.html', { type: 'text/html' });
    await user.upload(dialog.querySelector('input[type="file"]'), file);
    expect(within(dialog).getByText('mica-2024.html')).toBeInTheDocument();
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].url).toBe(url(`/api/corpus/documents/${MICA}/upload`));
    expect(uploads[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(uploads[0].body).toEqual({ file: { name: 'mica-2024.html', size: file.size, type: 'text/html' } });
    expect(await screen.findByText('New version uploaded — processing queued')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('an identical file is refused inside the dialog (UNCHANGED), the file kept for another try', async () => {
    given.apiError('post', '/api/corpus/documents/:documentId/upload', 'UNCHANGED', { status: 409 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Upload a new version');
    const dialog = await dialogNamed('New version');
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['same'], 'mica.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This file is identical to the current version.');
    expect(within(dialog).getByText('mica.pdf')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.queryByText('New version uploaded — processing queued')).toBeNull();
  });


  it('the upload dialog starts empty again after Cancel', async () => {
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Upload a new version');
    let dialog = await dialogNamed('New version');
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['x'], 'draft.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await pick(user, 'Upload a new version');
    dialog = await dialogNamed('New version');
    expect(within(dialog).queryByText('draft.pdf')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
  });


  it('the upload says the backend\'s 60 MB and refuses a larger file as it is chosen — named, Upload still off, nothing sent', async () => {
    const uploads = given.capture('post', '/api/corpus/documents/:documentId/upload', f.queuedJob('corpus.ingest', `corpus:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded();
    await pick(user, 'Upload a new version');
    const dialog = await dialogNamed('New version');
    expect(within(dialog).getByText('Maximum file size: 60 MB')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Choose a file' })).toHaveAccessibleDescription('Maximum file size: 60 MB');
    const huge = new File(['%PDF-1.7'], 'mica-konsoliduota.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 75 * 1024 * 1024 });
    await user.upload(dialog.querySelector('input[type="file"]'), huge);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('mica-konsoliduota.pdf — file too large (at most 60 MB)');
    expect(within(dialog).queryByText('mica-konsoliduota.pdf')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
    await settle(50);
    expect(uploads).toHaveLength(0);

    // A file that fits is taken, and the refusal goes
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['%PDF-1.7'], 'mica-2024.pdf', { type: 'application/pdf' }));
    expect(within(dialog).getByText('mica-2024.pdf')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeEnabled();
  });


  it('a plain user reads the act: no refresh, no menu, no dialogs', async () => {
    renderAct({ session: userAuthData });
    await loaded();
    expect(screen.queryByRole('button', { name: 'Refresh from the source' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More legal act actions' })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The tabs' own state lives in the address under their names
// (the versions table's ?versions.sort=, the obligations
// tab's ?obligations.status= and its table), a tab switch
// keeps it; the back link and the delete return to the
// catalogue the way Back would.
// -----------------------------------------------------------

describe('CorpusDocument — the check of the obligations', () => {

  const VKI = f.ID.consumerCredit;
  const VERIFY = '/api/corpus/documents/:documentId/verify-obligations';
  const judging = (id, patch = {}) => ({
    ...f.queuedJob('corpus.verify_obligations', `verification:${id}`), status: 'running', attempts: 1, startedAt: '2026-09-27T09:59:00+00:00',
    progress: { step: 'verify', percent: 33, message: '1/3 batches' }, ...patch,
  });


  it('checks the obligations not judged yet: the confirmation says what the judge does, then POSTs without "again"', async () => {
    const posts = given.capture('post', VERIFY, f.queuedJob('corpus.verify_obligations', `verification:${VKI}`), { status: 202 });
    const counts = record('get', '/api/obligations');
    const { user } = renderAct({ id: VKI });
    await loaded('VKĮ');
    // The act's one obligation was never judged
    await waitFor(() => expect(counts.map((call) => call.query)).toContainEqual({ document: VKI, verification: 'unchecked', limit: '1' }));
    await pick(user, 'Check the obligations');
    const dialog = await dialogNamed('Check the obligations of “VKĮ”?');
    expect(dialog).toHaveTextContent('A second model compares every obligation with the provisions it rests on. It approves nothing — start your review with the doubted ones.');
    expect(dialog).toHaveTextContent('Only the obligations not checked yet are checked. This uses the AI model and costs money.');
    expect(posts).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/corpus/documents/${VKI}/verify-obligations`));
    expect(posts[0].body).toEqual({});
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('link', { name: 'View job' })).toHaveAttribute('href', '/jobs');
  });


  it('once every obligation is judged the menu offers to check them again — and sends again: true', async () => {
    const posts = given.capture('post', VERIFY, f.queuedJob('corpus.verify_obligations', `verification:${MICA}`), { status: 202 });
    const { user } = renderAct();
    await loaded();
    const menu = await openMenu(user);
    await user.click(await within(menu).findByRole('menuitem', { name: 'Check the obligations again' }));
    const dialog = await dialogNamed('Check the obligations of “MiCA” again?');
    expect(dialog).toHaveTextContent('Every obligation of this act has been checked — all of them are checked again. This uses the AI model and costs money.');
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ again: true });
  });


  it('shows the judge\'s job the way it shows the latest job: asked by its subject, a status with the progress in words', async () => {
    const jobs = given.capture('get', '/api/jobs', { jobs: [judging(MICA)] });
    renderAct();
    await loaded();
    const card = await within(main()).findByRole('status');
    expect(card).toHaveTextContent('Running: Obligation check');
    expect(card).toHaveTextContent('Checking — 1 of 3 batches (33%)');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(within(card).getByRole('link', { name: 'All jobs' })).toHaveAttribute('href', '/jobs');
    expect(jobs[0].query).toEqual({ subject: `verification:${MICA}`, limit: '1' });
    expect(within(main()).queryByRole('alert')).toBeNull();
  });


  it('queueing the check brings its job onto the page: the POST, then the judge\'s job asked again and shown running', async () => {
    let queued = false;
    server.use(
      http.post(url(VERIFY), () => { queued = true; return HttpResponse.json(f.queuedJob('corpus.verify_obligations', `verification:${MICA}`), { status: 202 }); }),
      http.get(url('/api/jobs'), () => HttpResponse.json({ jobs: queued ? [judging(MICA)] : [] })),
    );
    const { user } = renderAct();
    await loaded();
    expect(within(main()).queryByRole('status')).toBeNull();
    const menu = await openMenu(user);
    await user.click(await within(menu).findByRole('menuitem', { name: 'Check the obligations again' }));
    await user.click(within(await dialogNamed('Check the obligations of “MiCA” again?')).getByRole('button', { name: 'Run' }));
    // The page behind a dialog is hidden until it has closed
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(main()).findByRole('status')).toHaveTextContent('Running: Obligation check');
  });


  it('follows the judge\'s job every 3 s and, when it ends, reads the obligations again — their verdicts come into the open list', async () => {
    let ended = false;
    let lists = 0;
    server.use(
      http.get(url('/api/jobs'), () => HttpResponse.json({ jobs: [judging(MICA, ended ? { status: 'done', progress: { step: 'verify', percent: 100, message: '3/3 batches' } } : {})] })),
      http.get(url('/api/obligations'), ({ request }) => {
        if (new URL(request.url).searchParams.get('verification') !== 'unchecked') lists += 1;
        return undefined;
      }),
    );
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderAct({ query: '?tab=obligations' });
    await loaded();
    expect(await within(main()).findByRole('status')).toHaveTextContent('Running: Obligation check');
    await waitFor(() => expect(within(main()).getByRole('grid')).toBeInTheDocument());
    expect(lists).toBe(1);
    ended = true;
    await act(async () => { vi.advanceTimersByTime(3_100); });
    await waitFor(() => expect(within(main()).queryByRole('status')).toBeNull());
    await waitFor(() => expect(lists).toBe(2));
    vi.useRealTimers();
  });


  it('a failed check is an alert with the job\'s error; a finished one shows nothing', async () => {
    given.json('get', '/api/jobs', { jobs: [judging(MICA, { status: 'failed', progress: {}, error: '[402] AI_BUDGET_EXHAUSTED: the budget is used up' })] });
    const view = renderAct();
    await loaded();
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('Failed: Obligation check');
    expect(alert).toHaveTextContent('[402] AI_BUDGET_EXHAUSTED: the budget is used up');
    view.unmount();

    given.json('get', '/api/jobs', { jobs: [judging(MICA, { status: 'done' })] });
    renderAct();
    await loaded();
    await settle(100);
    expect(within(main()).queryByRole('status')).toBeNull();
    expect(within(main()).queryByRole('alert')).toBeNull();
  });


  it('a refused check stays in its dialog with the reason inside', async () => {
    given.apiError('post', VERIFY, 'FORBIDDEN', { status: 403 });
    const { user } = renderAct({ id: VKI });
    await loaded('VKĮ');
    await pick(user, 'Check the obligations');
    const dialog = await dialogNamed('Check the obligations of “VKĮ”?');
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You are not allowed to do this.');
    expect(screen.queryByRole('link', { name: 'View job' })).toBeNull();
  });


  it('an act without a version, or without obligations, has nothing to check', async () => {
    const { user, unmount } = renderAct({ id: f.ID.lbRules });
    await loaded('LB KTPT taisyklės');
    let menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'Check the obligations' })).toHaveAttribute('aria-disabled', 'true');
    unmount();

    withAct(micaWith({ obligationCount: 0 }));
    const counts = record('get', '/api/obligations');
    const second = renderAct();
    await loaded();
    menu = await openMenu(second.user);
    expect(within(menu).getByRole('menuitem', { name: 'Check the obligations' })).toHaveAttribute('aria-disabled', 'true');
    // …and nothing to count
    expect(counts.filter((call) => call.query.verification === 'unchecked')).toHaveLength(0);
  });


  it('a plain user is shown no check, and asks neither for the judge\'s job nor for the count', async () => {
    const jobs = record('get', '/api/jobs');
    const lists = record('get', '/api/obligations');
    renderAct({ session: userAuthData, query: '?tab=obligations' });
    await loaded();
    await waitFor(() => expect(within(main()).getByRole('grid')).toBeInTheDocument());
    await settle(100);
    expect(screen.queryByRole('button', { name: 'More legal act actions' })).toBeNull();
    expect(jobs).toHaveLength(0);
    expect(lists.filter((call) => call.query.verification === 'unchecked')).toHaveLength(0);
    // The reviewer's order is not asked for, nor offered
    expect(lists[0].query).toEqual({ limit: '1000', document: MICA, status: 'approved' });
    expect(screen.queryByRole('switch', { name: 'Doubted first' })).toBeNull();
  });


  it('the act\'s obligations tab shows the verdicts in the act\'s own order — an admin may ask for the doubted first', async () => {
    const lists = record('get', '/api/obligations');
    const { user, router } = renderAct({ id: f.ID.dora, query: '?tab=obligations' });
    await loaded('DORA');
    const row = await rowOf('Pranešti apie didelius su IRT susijusius incidentus');
    expect(row.querySelector('[data-field="title"] .MuiChip-root')).toHaveTextContent('Partly');
    expect(screen.getByText('Doubted: 2 · not checked: 0')).toBeInTheDocument();
    const order = screen.getByRole('switch', { name: 'Doubted first' });
    expect(order).not.toBeChecked();
    expect(lists.find((call) => call.query.limit === '1000').query).toEqual({ limit: '1000', document: f.ID.dora });
    await user.click(order);
    await waitFor(() => expect(lists.at(-1).query).toEqual({ limit: '1000', document: f.ID.dora, order: 'review' }));
    expect(router.state.location.search).toBe('?tab=obligations&obligations.order=review');
  });


  it('speaks Lithuanian: the menu entry, the confirmation and the running check', async () => {
    given.json('get', '/api/jobs', { jobs: [judging(VKI)] });
    const { user } = renderAct({ id: VKI, locale: 'lt' });
    await loaded('VKĮ');
    expect(await within(main()).findByRole('status')).toHaveTextContent('Vykdoma: Pareigų tikrinimas');
    expect(within(main()).getByRole('status')).toHaveTextContent('Tikrinimas — 1 iš 3 paketų (33 %)');
    await user.click(screen.getByRole('button', { name: 'Daugiau veiksmų su teisės aktu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Patikrinti pareigas' }));
    const dialog = await dialogNamed('Patikrinti „VKĮ“ pareigas?');
    expect(dialog).toHaveTextContent('Antras modelis palygina kiekvieną pareigą su nuostatomis, kuriomis ji remiasi. Jis nieko netvirtina — peržiūrą pradėkite nuo abejotinų.');
    expect(dialog).toHaveTextContent('Bus tikrinamos tik dar netikrintos pareigos. Tai naudoja DI modelį ir kainuoja.');
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------

describe('CorpusDocument — coming back', () => {

  const fromCatalogue = (locale = 'en') => renderRoutes([
    { path: '/corpus', element: <ListProbe to={`/corpus/${MICA}`} /> },
    { path: '/corpus/:documentId', element: <CorpusDocument authData={authData} /> },
  ], { route: '/corpus?jurisdiction=EU&type=regulation', locale });


  it('the obligations tab keeps its filters under its own names — a tab switch keeps them', async () => {
    const calls = record('get', '/api/obligations');
    const { user, router } = renderAct({ query: '?tab=obligations&obligations.status=approved&obligations.severity=high' });
    await loaded();
    await waitFor(() => expect(calls[0]?.query).toEqual({ limit: '1000', document: MICA, status: 'approved' }));
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Approved');
    expect(screen.getByRole('combobox', { name: 'Severity' })).toHaveTextContent('High');
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    await user.click(screen.getByRole('tab', { name: /^Obligations/ }));
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search)))
      .toEqual({ tab: 'obligations', 'obligations.status': 'approved', 'obligations.severity': 'high' });
    expect(await screen.findByRole('combobox', { name: 'Severity' })).toHaveTextContent('High');
  });


  it('the versions table keeps its order in ?versions.sort=', async () => {
    const { user, router } = renderAct({ query: '?tab=versions' });
    await loaded();
    const header = await screen.findByRole('columnheader', { name: /^Version/ });
    await user.click(header.querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=versions&versions.sort=versionNo.asc'));
    expect(screen.getByRole('columnheader', { name: /^Version/ })).toHaveAttribute('aria-sort', 'ascending');
  });


  it('with the catalogue right behind, the back link is Back — the catalogue\'s entry with its filters', async () => {
    const { user, router } = fromCatalogue();
    const catalogueKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await loaded();
    await user.click(within(main()).getByRole('link', { name: 'Legal corpus' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/corpus?jurisdiction=EU&type=regulation');
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(catalogueKey);
  });


  it('in Lithuanian the back link ("Teisės aktų bazė") does the same, and so does a delete', async () => {
    given.capture('delete', '/api/corpus/documents/:documentId', { ok: true });
    const { user, router } = fromCatalogue('lt');
    const catalogueKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await loaded();
    await user.click(within(main()).getByRole('link', { name: 'Teisės aktų bazė' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/corpus?jurisdiction=EU&type=regulation');

    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await loaded();
    const more = await screen.findByRole('button', { name: 'Daugiau veiksmų su teisės aktu' });
    await user.click(more);
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Ištrinti teisės aktą' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ištrinti teisės aktą' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/corpus?jurisdiction=EU&type=regulation');
    expect(router.state.location.key).toBe(catalogueKey);
  });
});







// -----------------------------------------------------------
// ActMetadataDialog
// -----------------------------------------------------------
//
// Pre-filled from the act, a PATCH of only what changed, the
// checks, the refusals, the reset on close.
// -----------------------------------------------------------

describe('ActMetadataDialog', () => {

  const openEditor = async (user) => {
    await loaded();
    await pick(user, 'Edit the metadata');
    return dialogNamed('Legal act metadata');
  };

  const textbox = (dialog, name) => within(dialog).getByRole('textbox', { name });


  it('opens pre-filled with the act\'s catalogue data, the identifier its source needs', async () => {
    const { user } = renderAct();
    const dialog = await openEditor(user);
    expect(textbox(dialog, /^Official title/)).toHaveValue(mica.title);
    expect(textbox(dialog, 'Short title')).toHaveValue('MiCA');
    expect(textbox(dialog, 'English title')).toHaveValue('Regulation (EU) 2023/1114 on markets in crypto-assets');
    expect(within(dialog).getByRole('combobox', { name: 'Jurisdiction' })).toHaveTextContent('EU');
    expect(within(dialog).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Regulation');
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toHaveTextContent('In force');
    expect(within(dialog).getByRole('combobox', { name: 'Text language' })).toHaveTextContent('Lithuanian');
    expect(textbox(dialog, /^External identifier/)).toHaveValue('32023R1114');
    expect(within(dialog).queryByRole('textbox', { name: /^Source address/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'crypto' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Crypto-asset service provider' })).toBeInTheDocument();
    expect(textbox(dialog, 'Applicability notes')).toHaveValue('Taikoma kriptoturto paslaugų teikėjams ir kriptoturto emitentams.');
  });


  it('saves only the changed fields, toasts, closes and refetches the act', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', mica);
    const gets = record('get', '/api/corpus/documents/:documentId');
    const { user } = renderAct();
    const dialog = await openEditor(user);
    await user.clear(textbox(dialog, 'Short title'));
    await user.type(textbox(dialog, 'Short title'), 'MiCA reglamentas');
    await user.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Repealed' }));
    await user.type(within(dialog).getByRole('combobox', { name: 'Domains' }), 'AML{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(url(`/api/corpus/documents/${MICA}`));
    expect(patches[0].body).toEqual({ shortTitle: 'MiCA reglamentas', status: 'repealed', domains: ['crypto', 'aml'] });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
  });


  it('Save with nothing changed just closes — a field changed back counts as unchanged', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', mica);
    const { user } = renderAct();
    const dialog = await openEditor(user);
    await user.type(textbox(dialog, 'Short title'), 'X');
    await user.type(textbox(dialog, 'Short title'), '{Backspace}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(patches).toHaveLength(0);
    expect(screen.queryByText('Saved')).toBeNull();
  });


  it('removing the last applies-to type sends an empty list', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', mica);
    const { user } = renderAct();
    const dialog = await openEditor(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Typically applies to' }));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Crypto-asset service provider' })).toBeNull());
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ appliesTo: [] });
  });


  it('checks the title, the identifier and the tags before saving', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', mica);
    const { user } = renderAct();
    const dialog = await openEditor(user);
    await user.clear(textbox(dialog, /^Official title/));
    await user.clear(textbox(dialog, /^External identifier/));
    await user.type(within(dialog).getByRole('combobox', { name: 'Domains' }), 'IRT saugumas{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter a title')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the identifier')).toBeInTheDocument();
    expect(within(dialog).getByText('Invalid tag: irt saugumas')).toBeInTheDocument();
    await settle(50);
    expect(patches).toHaveLength(0);
  });


  it('a web-address act edits its https:// address instead of an identifier', async () => {
    const urlAct = { ...f.act(f.ID.lbRules), sourceKind: 'url', sourceUrl: 'https://example.lt/taisykles' };
    withAct(urlAct);
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', urlAct);
    const { user } = renderAct({ id: f.ID.lbRules });
    await loaded('LB KTPT taisyklės');
    await pick(user, 'Edit the metadata');
    const dialog = await dialogNamed('Legal act metadata');
    expect(within(dialog).queryByRole('textbox', { name: /^External identifier/ })).toBeNull();
    const address = textbox(dialog, /^Source address/);
    expect(address).toHaveValue('https://example.lt/taisykles');
    await user.clear(address);
    await user.type(address, 'http://example.lt/nauja');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter an https:// address')).toBeInTheDocument();
    await user.clear(address);
    await user.type(address, 'https://example.lt/nauja');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ sourceUrl: 'https://example.lt/nauja' });
  });


  it('a Bank of Lithuania act\'s address must stay on www.lb.lt, as when it was added', async () => {
    const patches = given.capture('patch', '/api/corpus/documents/:documentId', f.act(f.ID.lbRules));
    const { user } = renderAct({ id: f.ID.lbRules });
    await loaded('LB KTPT taisyklės');
    await pick(user, 'Edit the metadata');
    const dialog = await dialogNamed('Legal act metadata');
    const address = textbox(dialog, /^Source address/);
    expect(address).toHaveValue('https://www.lb.lt/lt/ktpt-veiklos-taisykles');
    await user.clear(address);
    await user.type(address, 'https://www.example.lt/taisykles');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('The address must be on www.lb.lt')).toBeInTheDocument();
    await settle(50);
    expect(patches).toHaveLength(0);
    await user.clear(address);
    await user.type(address, 'https://www.lb.lt/lt/nauja-redakcija');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ sourceUrl: 'https://www.lb.lt/lt/nauja-redakcija' });
  });


  it('names the refused field in Lithuanian (INVALID_FIELD)', async () => {
    given.apiError('patch', '/api/corpus/documents/:documentId', 'INVALID_FIELD', { status: 400, error: 'appliesTo must be a list of: all, bank, casp' });
    const { user } = renderAct({ locale: 'lt' });
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Daugiau veiksmų su teisės aktu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Redaguoti metaduomenis' }));
    const dialog = await dialogNamed('Teisės akto metaduomenys');
    await user.type(within(dialog).getByRole('textbox', { name: 'Trumpas pavadinimas' }), '!');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Neteisinga lauko „Kam paprastai taikomas“ reikšmė.');
  });


  it('shows a refusal inside the dialog without a toast, keeping the edits', async () => {
    given.apiError('patch', '/api/corpus/documents/:documentId', 'INVALID_FIELD', { status: 400, error: 'appliesTo must be a list of: all, bank, casp' });
    const { user } = renderAct();
    const dialog = await openEditor(user);
    await user.type(textbox(dialog, 'Short title'), ' 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('appliesTo must be a list of: all, bank, casp');
    expect(screen.getAllByText('appliesTo must be a list of: all, bank, casp')).toHaveLength(1);
    expect(textbox(dialog, 'Short title')).toHaveValue('MiCA 2');
    expect(screen.queryByText('Saved')).toBeNull();
  });


  it('Cancel discards the edits: reopened, the form shows the act again', async () => {
    const { user } = renderAct();
    let dialog = await openEditor(user);
    await user.clear(textbox(dialog, 'Short title'));
    await user.type(textbox(dialog, 'Short title'), 'Juodraštis');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await pick(user, 'Edit the metadata');
    dialog = await dialogNamed('Legal act metadata');
    expect(textbox(dialog, 'Short title')).toHaveValue('MiCA');
  });
});







// -----------------------------------------------------------
// In Lithuanian
// -----------------------------------------------------------

describe('CorpusDocument — in Lithuanian', () => {

  it('speaks Lithuanian: the frame, tabs, actions, the menu and the stamps', async () => {
    const { user } = renderAct({ locale: 'lt' });
    await loaded();
    expect(within(main()).getByRole('link', { name: 'Teisės aktų bazė' })).toBeInTheDocument();
    expect(within(main()).getByText('· Šaltinis tikrintas 2026-09-24 07:12')).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'Oficialus šaltinis' })).toBeInTheDocument();
    for (const chip of ['ES', 'Reglamentas', 'Galioja', 'v2 · Paruošta']) expect(within(main()).getByText(chip)).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Struktūra', 'Redakcijos', 'Pareigos (3)', 'Informacija']);
    expect(screen.getByRole('button', { name: 'Atnaujinti iš šaltinio' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Daugiau veiksmų su teisės aktu' }));
    const menu = await screen.findByRole('menu');
    await within(menu).findByRole('menuitem', { name: 'Tikrinti pareigas iš naujo' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Apdoroti iš naujo (net jei nepasikeitė)', 'Įkelti naują redakciją', 'Išskirti pareigas', 'Tikrinti pareigas iš naujo', 'Perskaičiuoti vektorius',
      'Redaguoti metaduomenis', 'Išjungti', 'Ištrinti teisės aktą',
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: 'Išskirti pareigas' }));
    const dialog = await dialogNamed('Išskirti „MiCA“ pareigas?');
    const language = within(dialog).getByRole('radiogroup', { name: 'Pareigų kalba' });
    expect(within(language).getAllByRole('radio').map((radio) => radio.closest('label').textContent)).toEqual(['Lietuvių', 'Anglų']);
    expect(within(dialog).getByRole('button', { name: 'Paleisti' })).toBeInTheDocument();
  });


  it('the state notes, the versions and the details in Lithuanian', async () => {
    const { user } = renderAct({ id: f.ID.lbRules, locale: 'lt' });
    await loaded('LB KTPT taisyklės');
    expect(within(main()).getByRole('status')).toHaveTextContent('Teisės aktas dar neįkeltas — struktūra atsiras po įkėlimo.');
    expect(within(main()).getAllByRole('alert')[0]).toHaveTextContent('Paskutinio įkėlimo klaida');
    expect(within(main()).getAllByRole('alert')[1]).toHaveTextContent('Nepavyko: Teisės akto įkėlimas');
    expect(within(main()).getByRole('link', { name: 'Visos užduotys' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Redakcijos' }));
    expect(await screen.findByText('Redakcijų dar nėra')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Informacija' }));
    expect(definitions()).toMatchObject({ Jurisdikcija: 'Lietuva', Rūšis: 'Nutarimas', Šaltinis: 'Lietuvos banko svetainė', 'Teksto kalba': 'Lietuvių', 'Išorinis identifikatorius': '—' });
  });


  it('toasts and edits in Lithuanian', async () => {
    const { user } = renderAct({ locale: 'lt' });
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Daugiau veiksmų su teisės aktu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Redaguoti metaduomenis' }));
    const dialog = await dialogNamed('Teisės akto metaduomenys');
    expect(within(dialog).getByRole('textbox', { name: 'Trumpas pavadinimas' })).toHaveValue('MiCA');
    expect(within(dialog).getByRole('textbox', { name: /^Išorinis identifikatorius/ })).toHaveValue('32023R1114');
    await user.type(within(dialog).getByRole('textbox', { name: 'Trumpas pavadinimas' }), '!');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await screen.findByText('Išsaugota')).toBeInTheDocument();
  });


  it('the upload\'s limit and its refusal in Lithuanian', async () => {
    const { user } = renderAct({ locale: 'lt' });
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Daugiau veiksmų su teisės aktu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Įkelti naują redakciją' }));
    const dialog = await dialogNamed('Nauja redakcija');
    expect(within(dialog).getByText('Didžiausias failo dydis: 60 MB')).toBeInTheDocument();
    const huge = new File(['x'], 'redakcija.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 60 * 1024 * 1024 + 1 });
    await user.upload(dialog.querySelector('input[type="file"]'), huge);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('redakcija.pdf — per didelis failas (daugiausia 60 MB)');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the act's detail. The page's
// chrome while it fails is the back link (the heading turns
// into "Legal act" or a skeleton).
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/corpus/documents/:documentId',
  fixture: mica,
  render: () => renderAct(),
  chrome: () => within(screen.getByRole('main')).getByRole('link', { name: 'Legal corpus' }),
  loaded: async () => { await screen.findByRole('heading', { level: 1, name: 'MiCA' }); },
  loading: () => screen.getByRole('heading', { level: 1 }).querySelector('.MuiSkeleton-root'),
});


// The judge's job, asked by its subject on an admin's page.
// It is a side look: whatever it answers, the act stands. A
// failed lookup is not the act's failure and raises no alert
// — the page then shows the act without the check's card
describeEndpointContract({
  path: '/api/jobs',
  fixture: { jobs: [{ ...f.queuedJob('corpus.verify_obligations', `verification:${MICA}`), status: 'running', attempts: 1, progress: { step: 'verify', percent: 33, message: '1/3 batches' } }] },
  render: () => renderAct(),
  chrome: () => within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'MiCA' }),
  loaded: async () => { expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent('Running: Obligation check'); },
  skip: Object.fromEntries(VARIANTS.filter((variant) => variant.expect === 'alert').map((variant) => [variant.name, 'a failed lookup of the judge\'s job shows the act without it'])),
});
