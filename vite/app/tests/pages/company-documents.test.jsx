// -----------------------------------------------------------
//  [*] Tests — CompanyDocuments and DocumentDrawer (the
//      documents tab)
//
//  The documents tab of /companies/:companyId end to end
//  against the backend double, rendered in its page: the
//  list (GET /api/documents?companyId=&limit=500 — title,
//  translated kind, size, the extraction status, the index
//  status with "Indexing…" for a fresh document and the poll
//  that waits for it, the inventory summary, the stamp), the
//  loading, empty and failed list and an answer without the
//  list; the upload (the file picked or dropped, the
//  multipart POST — file, companyId, kind, no title — the
//  kind chosen first, one file after another with a progress
//  row each, the toast and the refreshed list, the drop zone
//  disabled meanwhile, QUOTA_EXCEEDED / FILE_TOO_LARGE / a
//  bodiless 413 said in the file's row and not toasted, the
//  next file still going up, a new batch replacing the rows,
//  the backend's 50 MB said under the zone and a larger file
//  refused before any request — named, the rest still going
//  up);
//  the semantic search (Enter only, the query, the hits with
//  heading and score, "Nothing found", a failure, a hit that
//  opens the drawer at its passage, the last search and its
//  hits kept for the company when coming back — no new
//  request); the DocumentDrawer (a
//  labelled dialog: the metadata, the evidence inventory, the
//  outline and its jumps, the text in 20 000-character
//  windows with Previous / Next, the documents without text,
//  a failed extraction, the loading and failed detail and
//  text with their retries, Close and Escape); delete;
//  Lithuanian; and the contract matrices for the list, the
//  document detail, its text windows and the search.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PAVYZDYS_DOCS = f.companyDocuments.filter((doc) => doc.companyId === f.ID.pavyzdys);
const POLICY = f.companyDocument(f.ID.policyDoc);
const PROCEDURE = f.companyDocument(f.ID.procedureDoc);
const [POLICY_HIT, PROCEDURE_HIT] = f.documentHits;

// A document uploaded a minute before the world's NOW, with
// text but no index yet — "Indexing…", and the list polls
const FRESH = { ...f.NEW.document, companyId: f.ID.pavyzdys, title: 'Klientų informavimo tvarka', uploadedAt: '2026-09-27T09:59:00+00:00' };







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderDocuments: the company page on ?tab=documents; waits
// for the tab. Pass `list` to answer the documents list (a
// list of answers: one per request, the last repeating).
//
// gridRows / rowOf: the grid's cell texts; the row holding a
// title.
//
// fileInput / dropZone: the upload's two doors — the hidden
// file input behind "Choose a file" and the dashed zone (a
// mouse affordance with no role; the button is the keyboard
// path).
//
// openDrawer: a title → the drawer, a dialog named after the
// document once it has loaded.
//
// spy: records the query of every request and lets the
// default handler answer it.
// -----------------------------------------------------------

async function renderDocuments({ company = f.company(f.ID.pavyzdys), list, locale = 'en' } = {}) {
  if (company.id !== f.ID.pavyzdys) given.json('get', '/api/companies/:companyId', company);
  if (list) given.sequence('get', '/api/documents', list.map((documents) => ({ body: { documents, total: documents.length } })));
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${company.id}?tab=documents`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: company.name });
  return view;
}

const panel = () => screen.getByRole('tabpanel');

const gridRows = () => within(screen.getByRole('grid')).queryAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
  .filter((cells) => cells.length > 0);

const rowOf = (title) => within(screen.getByRole('grid')).getByRole('button', { name: title }).closest('[role="row"]');

const fileInput = () => document.querySelector('input[type="file"]');

const dropZone = () => within(panel()).getByText(/^Drop files here or/).closest('[class*="border-dashed"]');

const pdf = (name, size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

// A PDF that REPORTS more than the backend's 50 MB without
// holding the bytes (the drop zone reads file.size only)
const oversized = (name, bytes = 50 * 1024 * 1024 + 1) => {
  const file = pdf(name, 16);
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
};

// The rows of the current upload batch (a polite live list)
const uploads = () => within(panel()).getAllByRole('list').find((list) => list.getAttribute('aria-live') === 'polite');

async function openDrawer(user, title) {
  await user.click(await within(screen.getByRole('grid')).findByRole('button', { name: title }));
  return screen.findByRole('dialog', { name: title });
}

function spy(method, path) {
  const calls = [];
  server.use(http[method](url(path), ({ request }) => {
    calls.push(Object.fromEntries(new URL(request.url).searchParams));
  }));
  return calls;
}

// The inventory's label → value rows inside the drawer
const inventoryValue = (dialog, label) => within(dialog).getByText(label, { selector: 'span' }).nextElementSibling;

const textCaption = (dialog) => within(dialog).getByText(/ characters$/);







// -----------------------------------------------------------
// The list
// -----------------------------------------------------------

describe('CompanyDocuments — the list', () => {

  it('titles the tab and lists the company\'s documents newest upload first, every column formatted', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(f.NOW) });
    const calls = spy('get', '/api/documents');
    await renderDocuments();
    expect(within(panel()).getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(within(panel()).getByText('Internal policies, procedures, contracts and registers — the evidence for the compliance analysis.')).toBeInTheDocument();
    await within(panel()).findByRole('button', { name: 'Atitikties politika' });
    expect(calls).toEqual([{ companyId: f.ID.pavyzdys, limit: '500' }]);
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Title', 'Kind', 'Size', 'Text', 'Index', 'Inventory', 'Uploaded', 'Actions']);
    const summary = (type, doc) => `${type} — ${doc.inventorySummary}`;
    const [contract, register, licence, procedure, policy] = PAVYZDYS_DOCS;
    expect(gridRows()).toEqual([
      [contract.title, 'Contract', '304.7 KB', 'Pending', 'Not indexed', '—', '27/09/2026, 09:58', ''],
      [register.title, 'Register', '247 B', 'Text extracted', 'Indexed', summary('Register', register), '15/09/2026, 13:11', ''],
      [licence.title, 'Other', '47 KB', 'Text extracted', 'Indexed', summary('Other', licence), '05/09/2026, 10:19', ''],
      [procedure.title, 'Procedure', '94 KB', 'Text extracted', 'Indexed', summary('Procedure', procedure), '05/09/2026, 10:05', ''],
      [policy.title, 'Policy', '180 KB', 'Text extracted', 'Indexed', summary('Policy', policy), '05/09/2026, 10:01', ''],
    ]);
  });


  it('every row can be opened and deleted; the title itself is a button that opens it', async () => {
    await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Atitikties politika' });
    expect(within(rowOf('Atitikties politika')).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent))
      .toEqual(['Atitikties politika', 'Open', 'Delete']);
  });


  it('a fresh document with text but no index yet reads "Indexing…"; after ten minutes "Not indexed"; a failed or empty extraction translated', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(f.NOW) });
    const stale = { ...FRESH, id: 'c3000000-0000-4000-8000-0000000000a1', title: 'Seniai įkeltas', uploadedAt: '2026-09-27T09:49:00+00:00' };
    const failed = { ...FRESH, id: 'c3000000-0000-4000-8000-0000000000a2', title: 'Užšifruotas PDF', extractionStatus: 'failed', extractionError: 'PDF is encrypted' };
    const empty = { ...FRESH, id: 'c3000000-0000-4000-8000-0000000000a3', title: 'Skenuotas', extractionStatus: 'empty' };
    await renderDocuments({ list: [[FRESH, stale, failed, empty]] });
    await within(panel()).findByRole('button', { name: 'Klientų informavimo tvarka' });
    expect(gridRows().map((cells) => [cells[0], cells[3], cells[4]])).toEqual([
      ['Klientų informavimo tvarka', 'Text extracted', 'Indexing…'],
      ['Seniai įkeltas', 'Text extracted', 'Not indexed'],
      ['Užšifruotas PDF', 'Failed', 'Not indexed'],
      ['Skenuotas', 'No text', 'Not indexed'],
    ]);
  });


  it('polls every 5 s while a fresh document waits for its index', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: new Date(f.NOW) });
    const calls = [];
    server.use(http.get(url('/api/documents'), () => {
      calls.push(1);
      return HttpResponse.json({ documents: [FRESH], total: 1 });
    }));
    await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Klientų informavimo tvarka' });
    expect(calls).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    await waitFor(() => expect(calls).toHaveLength(2));
  });


  it('does not poll when every document is indexed (or will not be)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: new Date(f.NOW) });
    const calls = spy('get', '/api/documents');
    await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Atitikties politika' });
    await act(async () => { vi.advanceTimersByTime(12000); });
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('the grid says it is busy while the list is on its way — no empty state meanwhile', async () => {
    given.hang('get', '/api/documents');
    await renderDocuments();
    expect(await within(panel()).findByRole('grid', { name: 'Documents', busy: true })).toBeInTheDocument();
    expect(within(panel()).getByRole('status')).toHaveTextContent('Loading…');
    expect(within(panel()).queryByText('No documents yet')).toBeNull();
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });


  it('no documents → the empty state; no search box, the upload stays', async () => {
    await renderDocuments({ list: [[]] });
    // The empty state's words are a polite status
    const status = (await within(panel()).findByText('No documents yet')).closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('Upload the company\'s policies and procedures — the assistant reads them and fills in the company\'s records from them, and the analysis uses them as evidence.');
    expect(within(panel()).queryByRole('search')).toBeNull();
    expect(within(panel()).queryByRole('grid')).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Choose a file' })).toBeEnabled();
  });


  it('a failed list shows the alert with a retry; the retry loads the rows', async () => {
    given.sequence('get', '/api/documents', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { documents: PAVYZDYS_DOCS, total: 5 } },
    ]);
    const { user } = await renderDocuments();
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(panel()).queryByText('No documents yet')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(panel()).findByRole('button', { name: 'Atitikties politika' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });


  it('an answer without the list is a failed load, not "no documents yet"', async () => {
    given.json('get', '/api/documents', { total: 0 });
    await renderDocuments();
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Something unexpected went wrong.');
    expect(within(panel()).queryByText('No documents yet')).toBeNull();
  });
});







// -----------------------------------------------------------
// Upload
// -----------------------------------------------------------
//
// FileDrop → POST /api/documents, one multipart body per
// file, one after another.
// -----------------------------------------------------------

describe('CompanyDocuments — upload', () => {

  it('offers the file types the extractor reads and the kind for the next upload (Policy)', async () => {
    await renderDocuments();
    expect(fileInput()).toHaveAttribute('accept', '.pdf,.docx,.txt,.md,.html,.htm,.csv,.json');
    expect(fileInput()).toHaveAttribute('multiple');
    expect(within(panel()).getByText('PDF, DOCX, TXT, MD, HTML, CSV or JSON.')).toBeInTheDocument();
    expect(within(panel()).getByRole('combobox', { name: 'Kind of the uploaded document' })).toHaveTextContent('Policy');
  });


  it('a picked file goes up as multipart: the file, the company and the kind — no title part, the backend names it after the file', async () => {
    const posts = given.capture('post', '/api/documents', { ...f.NEW.document, companyId: f.ID.pavyzdys, title: 'Klientų informavimo tvarka.md' }, { status: 201 });
    const { user } = await renderDocuments();
    const file = new File(['KLIENTŲ INFORMAVIMO TVARKA\n1. Prieš sudarant sutartį klientui pateikiama paslaugų kainodara.'], 'Klientų informavimo tvarka.md', { type: 'text/markdown' });
    await user.upload(fileInput(), file);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url('/api/documents'));
    expect(posts[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(posts[0].body).toEqual({
      file: { name: 'Klientų informavimo tvarka.md', size: file.size, type: 'text/markdown' },
      companyId: f.ID.pavyzdys,
      kind: 'policy',
    });
    expect(posts[0].body).not.toHaveProperty('title');
  });


  it('the kind chosen first travels with the upload', async () => {
    const posts = given.capture('post', '/api/documents', f.NEW.document, { status: 201 });
    const { user } = await renderDocuments();
    await user.click(within(panel()).getByRole('combobox', { name: 'Kind of the uploaded document' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Policy', 'Procedure', 'Contract', 'Register', 'Other']);
    await user.click(screen.getByRole('option', { name: 'Contract' }));
    await user.upload(fileInput(), pdf('sutartis.pdf'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.kind).toBe('contract');
  });


  it('the file\'s row ends "Uploaded" with a full bar, the toast names it, and the list shows it', async () => {
    const uploaded = { ...f.NEW.document, companyId: f.ID.pavyzdys, title: 'politika-2026.pdf' };
    given.capture('post', '/api/documents', uploaded, { status: 201 });
    const { user } = await renderDocuments({ list: [PAVYZDYS_DOCS, [uploaded, ...PAVYZDYS_DOCS]] });
    await within(panel()).findByRole('button', { name: 'Atitikties politika' });
    await user.upload(fileInput(), pdf('politika-2026.pdf'));
    const bar = await within(panel()).findByRole('progressbar', { name: 'politika-2026.pdf' });
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '100'));
    expect(within(uploads()).getByText('Uploaded')).toBeInTheDocument();
    expect(await screen.findByText('Uploaded: politika-2026.pdf')).toBeInTheDocument();
    expect(await within(panel()).findByRole('button', { name: 'politika-2026.pdf' })).toBeInTheDocument();
    // The page's company is fetched again too — the tab count follows
    expect(screen.getByRole('tab', { name: /^Documents/ })).toBeInTheDocument();
  });


  it('several files go up one after another, each with its own row', async () => {
    const posts = given.capture('post', '/api/documents', f.NEW.document, { status: 201 });
    const { user } = await renderDocuments();
    await user.upload(fileInput(), [pdf('a.pdf', 10), pdf('b.pdf', 20)]);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts.map((post) => post.body.file.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(await within(panel()).findByRole('progressbar', { name: 'a.pdf' })).toBeInTheDocument();
    expect(within(panel()).getByRole('progressbar', { name: 'b.pdf' })).toBeInTheDocument();
    await waitFor(() => expect(within(uploads()).getAllByText('Uploaded')).toHaveLength(2));
  });


  it('files dropped on the zone go up the same way', async () => {
    const posts = given.capture('post', '/api/documents', f.NEW.document, { status: 201 });
    await renderDocuments();
    fireEvent.drop(dropZone(), { dataTransfer: { files: [pdf('numesta.pdf')] } });
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.file.name).toBe('numesta.pdf');
  });


  it('while a batch goes up the drop zone is disabled and the row counts the percent', async () => {
    given.hang('post', '/api/documents');
    const { user } = await renderDocuments();
    await user.upload(fileInput(), pdf('lėtas.pdf'));
    await waitFor(() => expect(within(panel()).getByRole('button', { name: 'Choose a file' })).toBeDisabled());
    expect(within(panel()).getByText(/^Uploading \d+ %$/)).toBeInTheDocument();
    // A drop meanwhile is refused
    fireEvent.drop(dropZone(), { dataTransfer: { files: [pdf('kitas.pdf')] } });
    await settle(50);
    expect(within(panel()).queryByText('kitas.pdf')).toBeNull();
  });


  it('QUOTA_EXCEEDED is said in the file\'s row — not toasted — and the next file still goes up', async () => {
    given.sequence('post', '/api/documents', [
      { status: 413, body: apiError('QUOTA_EXCEEDED', 'Your document storage quota is used up — delete documents you no longer need') },
      { status: 201, body: f.NEW.document },
    ]);
    const { user } = await renderDocuments();
    await user.upload(fileInput(), [pdf('pirmas.pdf'), pdf('antras.pdf')]);
    const alert = await within(panel()).findByRole('alert');
    const text = '“pirmas.pdf” could not be uploaded: Your upload quota is used up — delete documents you no longer need or ask an administrator.';
    expect(alert).toHaveTextContent(text);
    expect(screen.getAllByText(text)).toHaveLength(1);
    expect(await screen.findByText('Uploaded: antras.pdf')).toBeInTheDocument();
    expect(within(panel()).queryByRole('progressbar', { name: 'pirmas.pdf' })).toBeNull();
  });


  it('FILE_TOO_LARGE reads "The file is too large."; a proxy\'s bodiless 413 the status sentence', async () => {
    given.sequence('post', '/api/documents', [
      { status: 413, body: apiError('FILE_TOO_LARGE', 'File too large') },
      { status: 413, html: '<html><body><h1>413 Request Entity Too Large</h1></body></html>' },
    ]);
    const { user } = await renderDocuments();
    await user.upload(fileInput(), [pdf('didelis.pdf'), pdf('dar-didesnis.pdf')]);
    await waitFor(() => expect(within(panel()).getAllByRole('alert')).toHaveLength(2));
    const [first, second] = within(panel()).getAllByRole('alert');
    expect(first).toHaveTextContent('“didelis.pdf” could not be uploaded: The file is too large.');
    expect(second).toHaveTextContent('“dar-didesnis.pdf” could not be uploaded: The file or request is too large.');
  });


  it('says the backend\'s 50 MB limit under the zone, and the file button carries it with the types', async () => {
    await renderDocuments();
    expect(within(panel()).getByText('Maximum file size: 50 MB')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Choose a file' }))
      .toHaveAccessibleDescription('PDF, DOCX, TXT, MD, HTML, CSV or JSON. Maximum file size: 50 MB');
  });


  it('a file over 50 MB is refused before any request — named with the limit, no row of its own — and the rest of the batch still goes up', async () => {
    const posts = given.capture('post', '/api/documents', f.NEW.document, { status: 201 });
    const { user } = await renderDocuments();
    await user.upload(fileInput(), [oversized('skenuotas-registras.pdf'), pdf('politika.pdf')]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.file.name).toBe('politika.pdf');
    expect(within(panel()).getByRole('alert')).toHaveTextContent('skenuotas-registras.pdf — file too large (at most 50 MB)');
    expect(await screen.findByText('Uploaded: politika.pdf')).toBeInTheDocument();
    expect(within(uploads()).queryByText('skenuotas-registras.pdf')).toBeNull();
    await settle(50);
    expect(posts).toHaveLength(1);
  });


  it('a drop of files all over the limit sends nothing and names every one', async () => {
    const posts = given.capture('post', '/api/documents', f.NEW.document, { status: 201 });
    await renderDocuments();
    fireEvent.drop(dropZone(), { dataTransfer: { files: [oversized('a.pdf'), oversized('b.pdf', 120 * 1024 * 1024)] } });
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('a.pdf, b.pdf — file too large (at most 50 MB)');
    await settle(50);
    expect(posts).toHaveLength(0);
    expect(within(panel()).queryByRole('progressbar')).toBeNull();
  });


  it('a new batch replaces the rows of the previous one', async () => {
    given.sequence('post', '/api/documents', [
      { status: 413, body: apiError('QUOTA_EXCEEDED', 'quota') },
      { status: 201, body: f.NEW.document },
    ]);
    const { user } = await renderDocuments();
    await user.upload(fileInput(), pdf('pirmas.pdf'));
    await within(panel()).findByRole('alert');
    await user.upload(fileInput(), pdf('antras.pdf'));
    expect(await screen.findByText('Uploaded: antras.pdf')).toBeInTheDocument();
    expect(within(panel()).queryByText('pirmas.pdf')).toBeNull();
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Search
// -----------------------------------------------------------
//
// GET /api/documents/search on Enter; a hit opens the drawer
// at its passage.
// -----------------------------------------------------------

describe('CompanyDocuments — search', () => {

  // The box comes with the list
  const searchBox = () => within(panel()).findByRole('textbox', { name: 'Search the documents\' text' });


  it('runs on Enter only — every search embeds the query: q, the company and k=8', async () => {
    const calls = spy('get', '/api/documents/search');
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'atitikties pareigūnas');
    await settle(400);
    expect(calls).toHaveLength(0);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ q: 'atitikties pareigūnas', companyId: f.ID.pavyzdys, k: '8' });
  });


  it('lists the passages: document — heading · score, and the passage text', async () => {
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'atitikties pareigūnas{Enter}');
    const search = within(panel()).getByRole('search');
    expect(await within(search).findByText('Passages found: 2')).toBeInTheDocument();
    const hits = within(search).getAllByRole('button');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toHaveTextContent(`Atitikties politika — 7.2 Atitikties pareigūnas · 0.03${POLICY_HIT.text.replace(/\n/g, ' ').slice(0, 40)}`);
    expect(hits[1]).toHaveTextContent(`Pinigų plovimo prevencijos procedūra — 3 Atsakingi asmenys · 0.02${PROCEDURE_HIT.text.replace(/\n/g, ' ').slice(0, 40)}`);
  });


  it('a hit without a heading or a score shows just the title', async () => {
    given.json('get', '/api/documents/search', { hits: [{ ...POLICY_HIT, heading: '', score: null }] });
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'politika{Enter}');
    const search = within(panel()).getByRole('search');
    await within(search).findByText('Passages found: 1');
    expect(within(search).getByText('Atitikties politika')).toBeInTheDocument();
    expect(within(search).queryByText(/·/)).toBeNull();
  });


  it('a blank query sends nothing', async () => {
    const calls = spy('get', '/api/documents/search');
    const { user } = await renderDocuments();
    await user.type(await searchBox(), '   {Enter}');
    await settle(200);
    expect(calls).toHaveLength(0);
  });


  it('no hits → "Nothing found"', async () => {
    given.json('get', '/api/documents/search', { hits: [] });
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'kvantinė kriptografija{Enter}');
    expect(await within(panel()).findByText('Nothing found')).toBeInTheDocument();
  });


  it('shows progress while searching, then the answer', async () => {
    given.slow('get', '/api/documents/search', 300, { hits: f.documentHits });
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'pareigūnas{Enter}');
    expect(await within(within(panel()).getByRole('search')).findByRole('progressbar')).toBeInTheDocument();
    expect(await within(panel()).findByText('Passages found: 2')).toBeInTheDocument();
    expect(within(within(panel()).getByRole('search')).queryByRole('progressbar')).toBeNull();
  });


  it('a failed search is said under the box in words', async () => {
    given.apiError('get', '/api/documents/search', 'MODEL_ERROR', { status: 502, error: 'embedding failed' });
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'pareigūnas{Enter}');
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('The AI model call failed. Try again.');
  });


  it('a hit opens the document in the drawer AT its passage: the text window starts at the hit\'s offset', async () => {
    const windows = spy('get', '/api/documents/:documentId/text');
    const { user } = await renderDocuments();
    await user.type(await searchBox(), 'pareigūnas{Enter}');
    const search = within(panel()).getByRole('search');
    await within(search).findByText('Passages found: 2');
    await user.click(within(search).getAllByRole('button')[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Atitikties politika' });
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent(`${POLICY_HIT.charStart + 1}–601 of 601 characters`));
    expect(windows).toEqual([{ offset: String(POLICY_HIT.charStart), limit: '20000' }]);
  });


  it('the search box is only there when there are documents to search', async () => {
    await renderDocuments({ list: [[]] });
    await within(panel()).findByText('No documents yet');
    expect(within(panel()).queryByRole('search')).toBeNull();
  });


  it('coming back to the company finds the last search and its hits — without searching (paying) again', async () => {
    const calls = spy('get', '/api/documents/search');
    const first = await renderDocuments();
    await first.user.type(await searchBox(), 'atitikties pareigūnas{Enter}');
    await within(panel()).findByText('Passages found: 2');
    first.unmount();

    await renderDocuments();
    expect(await searchBox()).toHaveValue('atitikties pareigūnas');
    expect(within(within(panel()).getByRole('search')).getByText('Passages found: 2')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });


  it('a kept search of another company stays with that company', async () => {
    const first = await renderDocuments();
    await first.user.type(await searchBox(), 'atitikties pareigūnas{Enter}');
    await within(panel()).findByText('Passages found: 2');
    first.unmount();

    await renderDocuments({ company: { ...f.company(f.ID.pavyzdys), id: 'c9000000-0000-4000-8000-000000000009', name: 'UAB Kitas' }, list: [PAVYZDYS_DOCS] });
    expect(await searchBox()).toHaveValue('');
    expect(within(panel()).queryByText(/Passages found/)).toBeNull();
  });
});







// -----------------------------------------------------------
// The drawer
// -----------------------------------------------------------
//
// DocumentDrawer: metadata, inventory, outline, text windows.
// -----------------------------------------------------------

describe('DocumentDrawer', () => {

  it('opens from the title as a dialog named after the document: status, kind, size, characters, the stamps', async () => {
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Atitikties politika' })).toBeInTheDocument();
    expect(within(dialog).getByText('Text extracted')).toBeInTheDocument();
    expect(within(dialog).getByText('Policy · 180 KB · Characters: 601')).toBeInTheDocument();
    expect(within(dialog).getByText('Uploaded: 05/09/2026, 10:01')).toBeInTheDocument();
    expect(within(dialog).getByText('Indexed: 05/09/2026, 10:02')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Evidence inventory', 'Outline', 'Text']);
  });


  it('the row\'s eye icon opens it too', async () => {
    const { user } = await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Leidimo išrašas' });
    await user.click(within(rowOf('Leidimo išrašas')).getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog', { name: 'Leidimo išrašas' })).toBeInTheDocument();
  });


  it('shows the evidence inventory with its labels: type, summary, scope, approval, review cycle, the lists as chips', async () => {
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    const inventory = POLICY.inventory;
    expect(inventoryValue(dialog, 'Document type')).toHaveTextContent('Policy');
    expect(inventoryValue(dialog, 'Summary')).toHaveTextContent(inventory.summary);
    expect(inventoryValue(dialog, 'Scope')).toHaveTextContent('Visi darbuotojai ir valdybos nariai');
    expect(inventoryValue(dialog, 'Approval')).toHaveTextContent('Tvirtinama valdybos sprendimu');
    expect(inventoryValue(dialog, 'Review cycle')).toHaveTextContent('Kasmet');
    expect(inventoryValue(dialog, 'Roles named')).toHaveTextContent('ValdybaAtitikties pareigūnas');
    expect(inventoryValue(dialog, 'Registers')).toHaveTextContent('Atitikties rizikų registras');
    expect(inventoryValue(dialog, 'Laws referenced')).toHaveTextContent('MiCAPPTFPĮ');
  });


  it('lists the controls with their descriptions and verbatim quotes, and the weaknesses', async () => {
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    const controls = within(inventoryValue(dialog, 'Controls')).getAllByRole('listitem');
    expect(controls).toHaveLength(2);
    expect(controls[0]).toHaveTextContent('Atitikties rizikos vertinimas');
    expect(controls[0]).toHaveTextContent('Atitikties rizika vertinama bent kartą per metus.');
    expect(controls[0]).toHaveTextContent('„Atitikties rizikos vertinimas atliekamas ne rečiau kaip kartą per metus.“');
    const weaknesses = within(inventoryValue(dialog, 'Weaknesses')).getAllByRole('listitem');
    expect(weaknesses.map((item) => item.textContent)).toEqual(['Nenurodyta, kas pavaduoja atitikties pareigūną jo nesant.']);
  });


  it('an empty inventory field reads as a dash; a list with a repeated word keeps both', async () => {
    given.json('get', '/api/documents/:documentId', { ...PROCEDURE, inventory: { ...PROCEDURE.inventory, lawsReferenced: ['PPTFPĮ', 'PPTFPĮ'], controls: [], weaknesses: [] } });
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Pinigų plovimo prevencijos procedūra');
    expect(inventoryValue(dialog, 'Approval')).toHaveTextContent(/^—$/);
    expect(inventoryValue(dialog, 'Review cycle')).toHaveTextContent(/^—$/);
    expect(inventoryValue(dialog, 'Controls')).toHaveTextContent(/^—$/);
    expect(inventoryValue(dialog, 'Weaknesses')).toHaveTextContent(/^—$/);
    expect(within(inventoryValue(dialog, 'Laws referenced')).getAllByText('PPTFPĮ')).toHaveLength(2);
  });


  it('a document no analysis has read says when its inventory comes', async () => {
    given.json('get', '/api/documents/:documentId', { ...POLICY, inventory: null });
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    expect(within(dialog).getByText('No inventory yet — it is built during a compliance analysis.')).toBeInTheDocument();
  });


  it('lists the outline\'s headings, a sub-heading indented under its heading', async () => {
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    // The outline is the drawer's one ordered list
    const outline = within(dialog).getAllByRole('list').find((list) => list.tagName === 'OL');
    const headings = within(outline).getAllByRole('button');
    expect(headings.map((button) => button.textContent)).toEqual(POLICY.outline.map((heading) => heading.title));
    expect(headings[3].closest('li')).toHaveStyle({ paddingLeft: '12px' });
    expect(headings[2].closest('li')).toHaveStyle({ paddingLeft: '0px' });
  });


  it('a heading moves the text window to it', async () => {
    const windows = spy('get', '/api/documents/:documentId/text');
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('1–601 of 601 characters'));
    await user.click(within(dialog).getByRole('button', { name: '7.2 Atitikties pareigūnas' }));
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('329–601 of 601 characters'));
    expect(windows).toEqual([{ offset: '0', limit: '20000' }, { offset: '328', limit: '20000' }]);
    expect(within(dialog).getByText(/^7\.2\. Atitikties pareigūnas/)).toBeInTheDocument();
  });


  it('a text without headings says so', async () => {
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'IRT incidentų registras');
    expect(within(dialog).getByText('No headings found')).toBeInTheDocument();
  });


  it('shows the text from its start with the range; a text that fits one window cannot page either way', async () => {
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('1–601 of 601 characters'));
    expect(within(dialog).getByText(/^I\. BENDROSIOS NUOSTATOS 1\. Ši politika nustato/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Next page' })).toBeDisabled();
  });


  it('a long text pages in windows of 20 000 characters — Next and Previous ask for the next window\'s offset', async () => {
    const long = `[1]${'x'.repeat(19_997)}[2]${'y'.repeat(19_997)}[3]${'z'.repeat(4_997)}`;
    given.json('get', '/api/documents/:documentId', { ...POLICY, charCount: long.length, outline: [] });
    const windows = [];
    server.use(http.get(url('/api/documents/:documentId/text'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      const offset = Number(query.get('offset'));
      const limit = Number(query.get('limit'));
      windows.push(offset);
      return HttpResponse.json({ id: f.ID.policyDoc, title: POLICY.title, offset, limit, total: long.length, extractionStatus: 'done', text: long.slice(offset, offset + limit) });
    }));
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('1–20,000 of 45,000 characters'));
    expect(within(dialog).getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('20,001–40,000 of 45,000 characters'));
    expect(within(dialog).getByText(/^\[2\]y/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('40,001–45,000 of 45,000 characters'));
    expect(within(dialog).getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('20,001–40,000 of 45,000 characters'));
    // (the test client keeps no unused cache, so the way back asks again)
    expect(windows.slice(0, 3)).toEqual([0, 20000, 40000]);
  });


  it('a document without text (a scan) has no text section; its status says "No text"', async () => {
    const kreditas = f.company(f.ID.kreditas);
    const { user } = await renderDocuments({ company: kreditas });
    const dialog = await openDrawer(user, 'Kreditavimo taisyklės (skenuota kopija)');
    expect(within(dialog).getByText('No text')).toBeInTheDocument();
    expect(within(dialog).getByText('Policy · 2.1 MB · Characters: 0')).toBeInTheDocument();
    expect(within(dialog).queryByRole('heading', { name: 'Text' })).toBeNull();
    expect(within(dialog).getByText('No headings found')).toBeInTheDocument();
    expect(within(dialog).queryByText(/^Indexed:/)).toBeNull();
  });


  it('a failed extraction says why', async () => {
    given.json('get', '/api/documents/:documentId', { ...POLICY, extractionStatus: 'failed', extractionError: 'PDF is encrypted', charCount: 0, indexedAt: null, inventory: null, outline: [] });
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    expect(within(dialog).getByText('Failed')).toBeInTheDocument();
    expect(within(dialog).getByText('Text extraction: PDF is encrypted')).toBeInTheDocument();
  });


  it('a labelled progress indicator while the document loads', async () => {
    given.hang('get', '/api/documents/:documentId');
    const { user } = await renderDocuments();
    await user.click(await within(panel()).findByRole('button', { name: 'Atitikties politika' }));
    const dialog = await screen.findByRole('dialog', { name: 'Document' });
    expect(within(dialog).getByRole('progressbar', { name: 'Document' })).toBeInTheDocument();
  });


  it('a failed document shows the alert with a retry inside the drawer; the retry loads it', async () => {
    given.sequence('get', '/api/documents/:documentId', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: POLICY },
    ]);
    const { user } = await renderDocuments();
    await user.click(await within(panel()).findByRole('button', { name: 'Atitikties politika' }));
    const dialog = await screen.findByRole('dialog', { name: 'Document' });
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('dialog', { name: 'Atitikties politika' })).toBeInTheDocument();
  });


  it('a failed text window gets its own alert and retry; the rest of the drawer stands', async () => {
    given.sequence('get', '/api/documents/:documentId/text', [
      { status: 503, body: apiError('SERVER_ERROR', 'Unavailable') },
      { body: f.documentText(f.ID.policyDoc) },
    ]);
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(dialog).getByRole('heading', { name: 'Evidence inventory' })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('1–601 of 601 characters'));
  });


  it('a labelled progress indicator while the text window loads', async () => {
    given.hang('get', '/api/documents/:documentId/text');
    const { user } = await renderDocuments();
    const dialog = await openDrawer(user, 'Atitikties politika');
    expect(await within(dialog).findByRole('progressbar', { name: 'Text' })).toBeInTheDocument();
  });


  it('Close and Escape close the drawer', async () => {
    const { user } = await renderDocuments();
    let dialog = await openDrawer(user, 'Atitikties politika');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openDrawer(user, 'Atitikties politika');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('another document opens at its own start, not where the last one was left', async () => {
    const windows = spy('get', '/api/documents/:documentId/text');
    const { user } = await renderDocuments();
    let dialog = await openDrawer(user, 'Atitikties politika');
    await user.click(await within(dialog).findByRole('button', { name: '7.2 Atitikties pareigūnas' }));
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('329–601 of 601 characters'));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openDrawer(user, 'Pinigų plovimo prevencijos procedūra');
    await waitFor(() => expect(textCaption(dialog)).toHaveTextContent('1–636 of 636 characters'));
    expect(windows.at(-1)).toEqual({ offset: '0', limit: '20000' });
  });
});







// -----------------------------------------------------------
// Delete
// -----------------------------------------------------------

describe('CompanyDocuments — delete', () => {

  it('asks first, naming the document and what is lost', async () => {
    const { user } = await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Leidimo išrašas' });
    await user.click(within(rowOf('Leidimo išrašas')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the document “Leidimo išrašas”?' });
    expect(within(dialog).getByText('The file and its text are deleted for good. Reports already produced do not change.')).toBeInTheDocument();
  });


  it('Delete sends the DELETE, toasts and the list refreshes', async () => {
    const deletes = given.capture('delete', '/api/documents/:documentId', { ok: true });
    const { user } = await renderDocuments({ list: [PAVYZDYS_DOCS, PAVYZDYS_DOCS.filter((doc) => doc.id !== f.ID.licenceDoc)] });
    await within(panel()).findByRole('button', { name: 'Leidimo išrašas' });
    await user.click(within(rowOf('Leidimo išrašas')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the document “Leidimo išrašas”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/documents/${f.ID.licenceDoc}`));
    expect(await screen.findByText('Document deleted')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(panel()).queryByRole('button', { name: 'Leidimo išrašas' })).toBeNull());
  });


  it('Cancel sends nothing', async () => {
    const deletes = given.capture('delete', '/api/documents/:documentId', { ok: true });
    const { user } = await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Leidimo išrašas' });
    await user.click(within(rowOf('Leidimo išrašas')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the document “Leidimo išrašas”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletes).toHaveLength(0);
  });


  it('a failed delete is said inside the dialog, which stays', async () => {
    given.apiError('delete', '/api/documents/:documentId', 'NOT_FOUND', { status: 404, error: 'Document not found' });
    const { user } = await renderDocuments();
    await within(panel()).findByRole('button', { name: 'Leidimo išrašas' });
    await user.click(within(rowOf('Leidimo išrašas')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the document “Leidimo išrašas”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.getAllByText('Not found — it may have been deleted.')).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('CompanyDocuments — Lithuanian', () => {

  it('speaks Lithuanian: the columns, the enum labels, the sizes, the stamps and the index states', async () => {
    await renderDocuments({ locale: 'lt' });
    await within(panel()).findByRole('button', { name: 'Atitikties politika' });
    expect(within(panel()).getByRole('heading', { name: 'Dokumentai' })).toBeInTheDocument();
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Pavadinimas', 'Rūšis', 'Dydis', 'Tekstas', 'Indeksas', 'Inventorius', 'Įkelta', 'Veiksmai']);
    const policy = gridRows().find((cells) => cells[0] === 'Atitikties politika');
    expect(policy).toEqual(['Atitikties politika', 'Politika', '180 KB', 'Tekstas išgautas', 'Indeksuota', `Politika — ${POLICY.inventorySummary}`, '2026-09-05 10:01', '']);
    expect(gridRows()[0].slice(1, 5)).toEqual(['Sutartis', '304,7 KB', 'Laukia', 'Neindeksuota']);
    expect(within(panel()).getByRole('combobox', { name: 'Įkeliamo dokumento rūšis' })).toHaveTextContent('Politika');
    expect(within(panel()).getByRole('button', { name: 'Pasirinkti failą' })).toBeInTheDocument();
  });


  it('the drawer, the upload error and the search in Lithuanian', async () => {
    given.apiError('post', '/api/documents', 'QUOTA_EXCEEDED', { status: 413, error: 'quota' });
    const { user } = await renderDocuments({ locale: 'lt' });
    await user.upload(fileInput(), pdf('politika.pdf'));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Nepavyko įkelti „politika.pdf“: Išnaudota įkėlimų kvota — ištrinkite nebereikalingus dokumentus arba kreipkitės į administratorių.');

    await user.type(within(within(panel()).getByRole('search')).getByRole('textbox', { name: 'Ieškoti dokumentų tekste' }), 'pareigūnas{Enter}');
    expect(await within(panel()).findByText('Rasta ištraukų: 2')).toBeInTheDocument();

    const dialog = await openDrawer(user, 'Atitikties politika');
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Įrodymų inventorius', 'Turinys', 'Tekstas']);
    expect(within(dialog).getByText('Politika · 180 KB · Simbolių: 601')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByText('1–601 iš 601 simbolių')).toBeInTheDocument());
    expect(within(dialog).getByRole('button', { name: 'Kitas puslapis' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Uždaryti' })).toBeInTheDocument();
  });


  it('the upload limit and a file refused for it in Lithuanian', async () => {
    const posts = given.capture('post', '/api/documents', f.NEW.document, { status: 201 });
    const { user } = await renderDocuments({ locale: 'lt' });
    expect(within(panel()).getByText('Didžiausias failo dydis: 50 MB')).toBeInTheDocument();
    await user.upload(fileInput(), oversized('registras.pdf'));
    expect(within(panel()).getByRole('alert')).toHaveTextContent('registras.pdf — per didelis failas (daugiausia 50 MB)');
    await settle(50);
    expect(posts).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the four GETs this tab
// reads: the list, and — through the drawer of "Atitikties
// politika" — the document, its text window, and the search.
// -----------------------------------------------------------

const renderTab = () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=documents`, path: '/companies/:companyId' });

const openPolicy = async () => {
  const view = renderTab();
  await view.user.click(await screen.findByRole('button', { name: 'Atitikties politika' }));
  return view;
};

describeEndpointContract({
  path: '/api/documents',
  fixture: { documents: PAVYZDYS_DOCS, total: PAVYZDYS_DOCS.length },
  render: renderTab,
  chrome: () => within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Documents' }),
  loaded: async () => { await screen.findByRole('button', { name: 'Atitikties politika' }); },
  loading: () => screen.getByRole('grid', { busy: true }),
});

describeEndpointContract({
  path: '/api/documents/:documentId',
  fixture: POLICY,
  render: openPolicy,
  chrome: () => screen.getByRole('button', { name: 'Close' }),
  loaded: async () => { await screen.findByRole('dialog', { name: 'Atitikties politika' }); },
  loading: () => screen.getByRole('progressbar', { name: 'Document' }),
});

describeEndpointContract({
  path: '/api/documents/:documentId/text',
  fixture: f.documentText(f.ID.policyDoc),
  render: openPolicy,
  chrome: () => screen.getByRole('button', { name: 'Close' }),
  loaded: async () => { await screen.findByText('1–601 of 601 characters'); },
  loading: () => screen.getByRole('progressbar', { name: 'Text' }),
});

describeEndpointContract({
  path: '/api/documents/search',
  fixture: { hits: f.documentHits },
  render: async () => {
    const view = renderTab();
    const search = await screen.findByRole('textbox', { name: 'Search the documents\' text' });
    await view.user.type(search, 'pareigūnas{Enter}');
    return view;
  },
  chrome: () => screen.getByRole('search'),
  loaded: async () => { await screen.findByText('Passages found: 2'); },
  loading: () => within(screen.getByRole('search')).getByRole('progressbar'),
});
