// -----------------------------------------------------------
//  [*] Tests — ProductPage (/programme/:productId), the frame
//
//  One work product of a compliance programme, end to end
//  against the backend double — what the page does whatever
//  the kind. The header (title, the way back to the company's
//  programme, status, kind, company, version, the stamps);
//  the rules of the kind above a draft (the verdict, the
//  broken rule first with its detail, kept rules said in
//  words); the approval — off, with the reason, while a
//  blocking rule is broken; the dialog, its note, PATCH
//  {approved: true, note}, the notice that follows, a refusal
//  inside the dialog; an approved product (read-only, "new
//  version" → POST …/revise → the new draft, a refusal as a
//  toast); the exports by kind as blob downloads; deleting a
//  version; a running generation (the steps in words, the
//  bar, the poll, stopping it); a failed and a cancelled
//  one; the provenance tab; the tab in ?tab=; unsaved edits
//  guarded against leaving; Lithuanian; and the contract
//  matrix of GET /api/programme/{id}.
//
//  The kinds' own content is in programme-policy,
//  programme-governance and programme-risks.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given, url } from '../support/backend/server';
import { describeEndpointContract } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import * as p from '../support/backend/programme';
import ProductPage from '@/pages/Programme/ProductPage';


const POLICY = p.product(f.ID.productPolicy);
const APPROVED = p.product(f.ID.productPolicyApproved);
const GOVERNANCE = p.product(f.ID.productGovernance);
const RISKS = p.product(f.ID.productRisks);
const RUNNING = p.product(f.ID.productRisksRunning);
const PROGRAMME_TAB = `/companies/${f.ID.pavyzdys}?tab=programme`;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderProduct: the page on its real route pattern, so a
// navigation away ends on the probe. main: the page's main
// landmark. rules: the rules panel. statusWith: the status
// note carrying a text. menuItem: an entry of the header's
// menu. exportClicks: the downloads handed to the browser.
// fakeClock / tick: the polls' clock.
// -----------------------------------------------------------

function renderProduct(id = f.ID.productPolicy, { search = '', ...options } = {}) {
  return renderPage(<ProductPage authData={authData} />, { route: `/programme/${id}${search}`, path: '/programme/:productId', ...options });
}

const main = () => screen.getByRole('main');

const rules = () => screen.findByRole('region', { name: /^(Rules|Taisyklės)$/ });

async function statusWith(text) {
  let found;
  await waitFor(() => {
    found = screen.getAllByRole('status').find((element) => element.textContent.includes(text));
    expect(found).toBeTruthy();
  });
  return found;
}

async function menuItem(user, name) {
  await user.click(screen.getByRole('button', { name: 'More document actions' }));
  return screen.findByRole('menuitem', { name });
}

function exportClicks() {
  const clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicks.push({ href: this.href, download: this.download });
  });
  return clicks;
}

const fakeClock = () => vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });

async function tick(ms) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
}

const navigatedTo = async (path) => {
  await waitFor(() => expect(screen.getByTestId('navigated-away')).toHaveTextContent(path));
};







// -----------------------------------------------------------
// The frame
// -----------------------------------------------------------

describe('ProductPage frame', () => {

  it('heads a draft with its title, the way back, the status, the kind, the company, the version and the stamps', async () => {
    renderProduct();
    expect(await within(main()).findByRole('heading', { level: 1, name: 'UAB Pavyzdys atitikties politika' })).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'The company\'s programme' })).toHaveAttribute('href', PROGRAMME_TAB);
    expect(within(main()).getByText('Draft', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(main()).getByText('Compliance policy')).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'UAB Pavyzdys' })).toHaveAttribute('href', PROGRAMME_TAB);
    expect(within(main()).getByText('Version 2')).toBeInTheDocument();
    expect(within(main()).getByText('Document language: Lithuanian · Generated 25/09/2026, 13:08')).toBeInTheDocument();
  });


  it('says who edited a draft last, and when', async () => {
    renderProduct(f.ID.productGovernance);
    expect(await within(main()).findByText('Document language: Lithuanian · Generated 25/09/2026, 13:25 · Edited by Jonas Naudotojas, 26/09/2026, 09:15')).toBeInTheDocument();
  });


  it('offers the tabs of the kind, ending with the provenance, and opens the first', async () => {
    renderProduct();
    const tabs = await screen.findByRole('tablist', { name: 'Document sections' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Policy', 'Documents', 'Provenance']);
    expect(within(tabs).getByRole('tab', { name: 'Policy' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'product-tab-policy');
  });


  it.each([
    [f.ID.productGovernance, ['Structure', 'Process and RACI', 'Positions and gaps', 'Provenance']],
    [f.ID.productRisks, ['Register', 'Criteria', 'Provenance']],
  ])('the tabs follow the kind (%s)', async (id, names) => {
    renderProduct(id);
    const tabs = await screen.findByRole('tablist', { name: 'Document sections' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(names);
  });


  it('?tab= opens that tab; a click replaces it in the address; an unknown one falls back to the first', async () => {
    const { user, router } = renderProduct(f.ID.productPolicy, { search: '?tab=documents' });
    expect(await screen.findByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Document hierarchy' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Provenance' }));
    expect(router.state.location.search).toBe('?tab=provenance');
    expect(screen.getByRole('heading', { name: 'Provenance' })).toBeInTheDocument();
  });


  it('an unknown ?tab= falls back to the kind\'s first tab', async () => {
    renderProduct(f.ID.productPolicy, { search: '?tab=register' });
    expect(await screen.findByRole('tab', { name: 'Policy' })).toHaveAttribute('aria-selected', 'true');
  });


  it('a product that is not there says so, with a retry', async () => {
    renderProduct('f0000000-0000-4000-8000-00000000dead');
    expect(await screen.findByRole('alert')).toHaveTextContent('The programme document could not be loaded');
    expect(screen.getByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });


  it('speaks Lithuanian', async () => {
    renderProduct(f.ID.productPolicy, { locale: 'lt' });
    expect(await within(main()).findByRole('link', { name: 'Įmonės programa' })).toBeInTheDocument();
    expect(within(main()).getByText('Projektas', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(main()).getByText('Atitikties politika')).toBeInTheDocument();
    expect(within(main()).getByText('2 versija')).toBeInTheDocument();
    expect(within(main()).getByText('Dokumento kalba: Lietuvių · Parengta 2026-09-25 13:08')).toBeInTheDocument();
    expect(within(screen.getByRole('tablist')).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Politika', 'Dokumentai', 'Kilmė']);
    for (const name of ['Redaguoti', 'Patvirtinti', 'Atsisiųsti dokumentą PDF formatu', 'Atsisiųsti dokumentą „Word“ formatu']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    const panel = await rules();
    expect(within(panel).getByRole('status')).toHaveTextContent('Dokumento patvirtinti negalima: pažeistų privalomų taisyklių — 1.');
    expect(within(panel).getByText('Nurodyti straipsniai yra teisės aktuose')).toBeInTheDocument();
    expect(within(panel).getByText('— pažeista')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The rules of the kind
// -----------------------------------------------------------

describe('ProductPage — the rules panel', () => {

  it('a draft that breaks a blocking rule: the verdict, the broken rule first with what broke it, the kept ones in words', async () => {
    renderProduct();
    const panel = await rules();
    expect(within(panel).getByRole('status')).toHaveTextContent('The document cannot be approved: 1 blocking rule(s) broken.');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(POLICY.checks.length);
    expect(rows[0]).toHaveTextContent('The articles named are in their acts— brokenLietuvos Respublikos darbo kodeksas 58');
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      'All eight parts of the policy are written— kept',
      'The acts named are in the legal corpus— kept',
      'The provisions named regulate what they are named for— kept',
      'The quotes stand in the documents they name— kept',
      'Every document of the company is placed on a level— kept',
    ]);
  });


  it('a draft that keeps every blocking rule says it can be approved; a broken rule that never blocks is a note', async () => {
    renderProduct(f.ID.productGovernance);
    const panel = await rules();
    expect(within(panel).getByRole('status')).toHaveTextContent('Every blocking rule is kept — the document can be approved.');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('No role takes part in every step— noteAtitikties pareigūnas');
    expect(rows).toHaveLength(GOVERNANCE.checks.length);
    expect(within(panel).queryByText('— broken')).toBeNull();
  });


  it('a kept rule does not show its detail; a rule the page has no sentence for is shown by its id', async () => {
    given.json('get', '/api/programme/:productId', { ...RISKS, checks: [...RISKS.checks, { rule: 'brand_new_rule', ok: false, blocking: true, detail: 'LR-09' }] });
    renderProduct(f.ID.productRisks);
    const panel = await rules();
    expect(within(panel).getByText('There are at least five risk scenarios').closest('li')).toHaveTextContent('There are at least five risk scenarios— kept');
    expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent('brand_new_rule— brokenLR-09');
  });


  it('an approved product shows no rules panel — its rules were kept when it was approved', async () => {
    renderProduct(f.ID.productPolicyApproved);
    await within(main()).findByRole('heading', { level: 1 });
    await screen.findByRole('tablist');
    expect(screen.queryByRole('region', { name: 'Rules' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Approving
// -----------------------------------------------------------

describe('ProductPage — approving', () => {

  it('is off while a blocking rule is broken, and the button says why', async () => {
    renderProduct();
    const button = await screen.findByRole('button', { name: 'Approve' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('It cannot be approved while a blocking rule is broken.');
  });


  it('approves with a note: the dialog explains the approval, PATCHes {approved: true, note}, toasts and shows who approved', async () => {
    const patches = given.spy('patch', '/api/programme/:productId');
    const { user } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the document?' });
    expect(within(dialog).getByText(/^By approving you state that you reviewed the document/)).toBeInTheDocument();
    const note = within(dialog).getByRole('textbox', { name: 'Note (optional)' });
    expect(note).toHaveFocus();
    await user.type(note, 'Aptarta valdyboje.');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ approved: true, note: 'Aptarta valdyboje.' });
    expect(patches[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productGovernance}`);
    expect(await screen.findByText('Document approved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const notice = await statusWith('Approved by Rūta Administratorė, 27/09/2026, 10:00');
    expect(notice).toHaveTextContent('Aptarta valdyboje.');
    // The approved product is read-only: no approve, no edit, no rules — and a new version is offered
    expect(within(main()).getByText('Approved', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Rules' })).toBeNull();
    expect(screen.getByRole('button', { name: 'New version' })).toBeInTheDocument();
  });


  it('a refused approval says why inside the dialog, without a toast, and the draft stays a draft', async () => {
    given.apiError('patch', '/api/programme/:productId', 'RULES_BROKEN', { status: 409, error: 'The draft breaks rules of its kind: process' });
    const { user } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the document?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The draft breaks blocking rules — mend it and try again.');
    expect(screen.getAllByText('The draft breaks blocking rules — mend it and try again.')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(main()).getByText('Draft', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });


  it('the default backend refuses a draft that breaks a blocking rule, should the page ever ask', async () => {
    const response = await fetch(url(`/api/programme/${f.ID.productPolicy}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'The draft breaks rules of its kind: provisions', code: 'RULES_BROKEN' });
  });
});







// -----------------------------------------------------------
// An approved product
// -----------------------------------------------------------

describe('ProductPage — an approved product', () => {

  it('says who approved it and when, with the note, as a status; the content is read-only', async () => {
    renderProduct(f.ID.productPolicyApproved);
    const notice = await statusWith('Approved by Rūta Administratorė, 23/09/2026, 09:10');
    expect(notice).toHaveTextContent('Patvirtinta valdybos posėdyje (protokolas Nr. 14).');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(main()).getByText('Approved', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(main()).getByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText('An approved document is not changed any more. To change it, create a new version.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download the document as PDF' })).toBeInTheDocument();
  });


  it('without the approver\'s name the notice gives the date alone', async () => {
    given.json('get', '/api/programme/:productId', { ...APPROVED, approvedByName: null, approvalNote: '' });
    renderProduct(f.ID.productPolicyApproved);
    expect(await statusWith('Approved 23/09/2026, 09:10')).toBeInTheDocument();
  });


  it('"New version" POSTs the revision and opens the draft it answers', async () => {
    const draft = p.revisedProduct({ ...GOVERNANCE, status: 'approved' });
    given.json('get', '/api/programme/:productId', { ...GOVERNANCE, status: 'approved', approvedByName: 'Rūta Administratorė', approvedAt: f.NOW });
    const posts = given.capture('post', '/api/programme/:productId/revise', draft, { status: 201 });
    const { user, router } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'New version' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productGovernance}/revise`);
    expect(draft).toMatchObject({ id: f.ID.newProduct, version: 2, status: 'draft', basis: { revisedFrom: f.ID.productGovernance } });
    expect(await screen.findByText('A draft of the new version was created')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/programme/${f.ID.newProduct}`));
  });


  it('a refused revision — a newer version is already in work — is said in a toast, and the page stays', async () => {
    const { user } = renderProduct(f.ID.productPolicyApproved);
    await user.click(await screen.findByRole('button', { name: 'New version' }));
    expect(await screen.findByText('A newer version of this document is already in work.')).toBeInTheDocument();
    expect(screen.queryByTestId('navigated-away')).toBeNull();
    expect(screen.getByRole('button', { name: 'New version' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// Exports
// -----------------------------------------------------------

describe('ProductPage — exports', () => {

  it.each([
    [f.ID.productPolicy, ['Download the document as PDF', 'Download the document as Word']],
    [f.ID.productGovernance, ['Download the document as PDF']],
    [f.ID.productRisks, ['Download the document as PDF', 'Download the document as Excel']],
  ])('offers the formats of the kind (%s)', async (id, names) => {
    renderProduct(id);
    await screen.findByRole('tablist');
    expect(screen.getAllByRole('button', { name: /^Download the document as/ }).map((button) => button.getAttribute('aria-label'))).toEqual(names);
  });


  it.each([
    [f.ID.productPolicy, 'Download the document as Word', 'docx', 'policy-UAB-Pavyzdys-v2.docx'],
    [f.ID.productRisks, 'Download the document as Excel', 'xlsx', 'risks-UAB-Pavyzdys-v1.xlsx'],
    [f.ID.productGovernance, 'Download the document as PDF', 'pdf', 'governance-UAB-Pavyzdys-v1.pdf'],
  ])('%s — "%s" fetches …/export?format=%s and hands the browser the file under the server\'s name', async (id, name, format, filename) => {
    const clicks = exportClicks();
    const calls = given.spy('get', '/api/programme/:productId/export');
    const { user } = renderProduct(id);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name }));
    expect(await screen.findByText(`Downloaded: ${filename}`)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`http://localhost:3000/api/programme/${id}/export?format=${format}`);
    expect(clicks).toEqual([{ href: 'blob:test', download: filename }]);
  });


  it('a draft exports too, and the other button waits while one download is on the wire', async () => {
    given.hang('get', '/api/programme/:productId/export');
    const { user } = renderProduct();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the document as PDF' }));
    expect(screen.getByRole('button', { name: 'Download the document as Word' })).toBeDisabled();
  });


  it('a refused export toasts the reason in the programme\'s words', async () => {
    exportClicks();
    given.apiError('get', '/api/programme/:productId/export', 'NOT_READY', { status: 409 });
    const { user } = renderProduct();
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: 'Download the document as PDF' }));
    expect(await screen.findByText('The download failed: Only a draft or an approved document can be downloaded.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Deleting a version
// -----------------------------------------------------------

describe('ProductPage — deleting', () => {

  it('deletes after a confirmation and returns to the company\'s programme tab', async () => {
    const deletes = given.spy('delete', '/api/programme/:productId');
    const { user } = renderProduct();
    await screen.findByRole('tablist');
    await user.click(await menuItem(user, 'Delete this version'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this version?' });
    expect(within(dialog).getByText(/^This version of the document is deleted for good/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete this version' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productPolicy}`);
    await navigatedTo(PROGRAMME_TAB);
  });


  it('a refused delete says why inside the dialog', async () => {
    given.apiError('delete', '/api/programme/:productId', 'STILL_RUNNING', { status: 409 });
    const { user } = renderProduct();
    await screen.findByRole('tablist');
    await user.click(await menuItem(user, 'Delete this version'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this version?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete this version' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Stop the generation first.');
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });
});







// -----------------------------------------------------------
// A generation on its way
// -----------------------------------------------------------

describe('ProductPage — a running generation', () => {

  it('shows the progress card: the steps of the kind in words with their states, the bar, the cost so far — and no tabs, no exports, no approval', async () => {
    renderProduct(f.ID.productRisksRunning);
    const card = await screen.findByRole('region', { name: 'The document is being generated' });
    expect(within(card).getByText('You can leave this page — the generation goes on in the background and the draft is saved.')).toBeInTheDocument();
    await within(card).findByText('58 s');
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Reading the documentsDone2 s', 'Writing the criteriaDone$0.1312' + '58 s', 'Writing the scenariosRunning', 'Checking the references',
    ]);
    expect(within(card).getByRole('progressbar', { name: 'The document is being generated' })).toHaveAttribute('aria-valuenow', '50');
    expect(within(card).getByText('2 of 4 steps')).toBeInTheDocument();
    expect(within(card).getByText('AI cost so far: $0.1312')).toBeInTheDocument();
    expect(within(main()).getByText('Generating', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More document actions' })).toBeNull();
  });


  it('goes by the product\'s own progress when the job is somebody else\'s (404), and says why the durations are missing', async () => {
    given.apiError('get', '/api/jobs/:jobId', 'NOT_FOUND', { status: 404 });
    renderProduct(f.ID.productRisksRunning);
    const card = await screen.findByRole('region', { name: 'The document is being generated' });
    expect(await within(card).findByText('The steps\' durations and cost are visible only to the user who started the generation.')).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Reading the documentsDone', 'Writing the criteriaDone', 'Writing the scenariosRunning', 'Checking the references',
    ]);
    expect(within(card).queryByRole('alert')).toBeNull();
  });


  it('a queued generation waits without a measure', async () => {
    renderProduct(f.ID.newProduct);
    const card = await screen.findByRole('region', { name: 'The document is being generated' });
    expect(within(card).getByText('The generation is queued — it starts when a worker is free.')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'The document is being generated' })).not.toHaveAttribute('aria-valuenow');
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Reading the documents', 'Writing the policy', 'Finding missing documents', 'Checking the references',
    ]);
  });


  it('polls the product and its job every 3 s while it runs', async () => {
    const productCalls = given.capture('get', '/api/programme/:productId', RUNNING);
    const jobCalls = given.capture('get', '/api/jobs/:jobId', p.productJob(f.ID.jobProductRunning));
    fakeClock();
    renderProduct(f.ID.productRisksRunning);
    await screen.findByRole('region', { name: 'The document is being generated' });
    await waitFor(() => expect(jobCalls).toHaveLength(1));
    expect(productCalls).toHaveLength(1);
    expect(jobCalls[0].url).toBe(`http://localhost:3000/api/jobs/${f.ID.jobProductRunning}`);
    await tick(3000);
    vi.useRealTimers();
    await waitFor(() => expect(productCalls).toHaveLength(2));
    await waitFor(() => expect(jobCalls).toHaveLength(2));
  });


  it('turns into the draft when the generation ends', async () => {
    given.sequence('get', '/api/programme/:productId', [{ body: RUNNING }, { body: { ...RISKS, id: RUNNING.id, version: 2 } }]);
    fakeClock();
    renderProduct(f.ID.productRisksRunning);
    await screen.findByRole('region', { name: 'The document is being generated' });
    await tick(3000);
    vi.useRealTimers();
    expect(await screen.findByRole('tablist', { name: 'Document sections' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'The document is being generated' })).toBeNull();
    expect(within(main()).getByText('Draft', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });


  it('stops it after a confirmation: POST …/cancel, a toast', async () => {
    const posts = given.spy('post', '/api/programme/:productId/cancel');
    const { user } = renderProduct(f.ID.productRisksRunning);
    await user.click(await screen.findByRole('button', { name: 'Stop the generation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stop the generation?' });
    expect(within(dialog).getByText('The generation stops at its next step. AI costs already incurred are not refunded.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productRisksRunning}/cancel`);
    expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('a stop the backend refuses says why inside the dialog', async () => {
    given.apiError('post', '/api/programme/:productId/cancel', 'NOT_CANCELLABLE', { status: 409 });
    const { user } = renderProduct(f.ID.productRisksRunning);
    await user.click(await screen.findByRole('button', { name: 'Stop the generation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stop the generation?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The generation can no longer be stopped — it has already ended.');
  });


  it('a job that asked to stop says so as a status', async () => {
    given.json('get', '/api/jobs/:jobId', { ...p.productJob(f.ID.jobProductRunning), cancelRequested: true });
    renderProduct(f.ID.productRisksRunning);
    expect(await statusWith('Cancellation requested — the generation stops at its next step.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// A generation that ended without a product
// -----------------------------------------------------------

describe('ProductPage — failed and cancelled', () => {

  const FAILED = { ...RUNNING, status: 'failed', jobStatus: 'failed', error: 'LLM call failed: [503] upstream unavailable', finishedAt: f.NOW };

  it('a failed generation: an alert with the error under "technical details" and the way to generate again on the company tab', async () => {
    given.json('get', '/api/programme/:productId', FAILED);
    const { user } = renderProduct(f.ID.productRisksRunning);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The generation failed');
    expect(alert).toHaveTextContent('The document could not be generated. You can generate it again.');
    expect(within(alert).getByRole('link', { name: 'Generate again' })).toHaveAttribute('href', PROGRAMME_TAB);
    await user.click(within(alert).getByText('Technical details'));
    expect(within(alert).getByText('LLM call failed: [503] upstream unavailable')).toBeInTheDocument();
    expect(within(main()).getByText('Failed', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull();
    expect(await menuItem(user, 'Delete this version')).not.toHaveAttribute('aria-disabled');
  });


  it('a cancelled generation is a status, not an alarm', async () => {
    given.json('get', '/api/programme/:productId', { ...RUNNING, status: 'cancelled', jobStatus: 'cancelled', finishedAt: f.NOW });
    renderProduct(f.ID.productRisksRunning);
    const note = await statusWith('The generation was cancelled');
    expect(note).toHaveTextContent('The generation was stopped before it finished. You can generate it again.');
    expect(within(note).getByRole('link', { name: 'Generate again' })).toHaveAttribute('href', PROGRAMME_TAB);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Provenance
// -----------------------------------------------------------

describe('ProductPage — the provenance tab', () => {

  it('names what the product was made from — the report, the earlier products, the documents — and how: the instructions, the models, the cost', async () => {
    renderProduct(f.ID.productRisks, { search: '?tab=provenance' });
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByRole('heading', { name: 'Provenance' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Compliance report' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(within(panel).getByRole('link', { name: 'Compliance policy, version 2' })).toHaveAttribute('href', `/programme/${f.ID.productPolicy}`);
    expect(within(panel).getByRole('link', { name: 'Structure, compliance process and RACI, version 1' })).toHaveAttribute('href', `/programme/${f.ID.productGovernance}`);
    expect(within(panel).getByText(`Company documents (${RISKS.basis.documents.length})`)).toBeInTheDocument();
    expect(within(panel).getByText(RISKS.basis.documents.map((document) => document.title).join(', '))).toBeInTheDocument();
    for (const prompt of RISKS.stats.provenance.prompts) {
      expect(within(panel).getByText(`${prompt.slug} v${prompt.version} (azure/gpt-6.1-sol)`)).toBeInTheDocument();
    }
    expect(within(panel).getByText('$0.4568 (136,525 tokens)')).toBeInTheDocument();
  });


  it('a product that builds on nothing, and a revised one that no model wrote, say so', async () => {
    const revised = p.revisedProduct({ ...POLICY, status: 'approved' });
    given.json('get', '/api/programme/:productId', { ...revised, basis: { ...revised.basis, reportId: null } });
    renderProduct(f.ID.newProduct, { search: '?tab=provenance' });
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('No compliance report was used.')).toBeInTheDocument();
    expect(within(panel).getByText('It builds on no other programme document.')).toBeInTheDocument();
    expect(within(panel).getByText('The approved version this draft was made from')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Compliance policy' })).toHaveAttribute('href', `/programme/${f.ID.productPolicy}`);
    expect(within(panel).getByText('No model was called for this version.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Unsaved edits
// -----------------------------------------------------------

describe('ProductPage — unsaved edits', () => {

  it('edits stay in the page until saved: the bar appears with the first change, the rules say they are stale, approving waits, deleting waits', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Finish editing' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'There are unsaved changes' })).toBeNull();
    const title = screen.getByRole('textbox', { name: 'Document title' });
    await user.type(title, ' 2026');
    const bar = await screen.findByRole('region', { name: 'There are unsaved changes' });
    expect(within(bar).getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(within(await rules()).getByText('The rules are checked again when you save the changes.')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription('Save or discard the changes first.');
    expect(await menuItem(user, 'Delete this version')).toHaveAttribute('aria-disabled', 'true');
    expect(puts).toHaveLength(0);
  });


  it('"Discard changes" puts the server\'s content back and sends nothing', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.type(screen.getByRole('textbox', { name: 'Document title' }), ' 2026');
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveValue(GOVERNANCE.content.title);
    expect(screen.queryByRole('region', { name: 'There are unsaved changes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(puts).toHaveLength(0);
  });


  it('saving PUTs the whole content and shows the title the server answers', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.type(screen.getByRole('textbox', { name: 'Document title' }), ' 2026   ');
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productGovernance}/content`);
    expect(puts[0].body).toEqual({ content: { ...GOVERNANCE.content, title: `${GOVERNANCE.content.title} 2026   ` } });
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
    // The server trimmed the title: the page shows its answer, in the header and in the field
    expect(await within(main()).findByRole('heading', { level: 1, name: `${GOVERNANCE.content.title} 2026` })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveValue(`${GOVERNANCE.content.title} 2026`);
    expect(screen.queryByRole('region', { name: 'There are unsaved changes' })).toBeNull();
    expect(within(main()).getByText(/Edited by Rūta Administratorė, 27\/09\/2026, 10:00/)).toBeInTheDocument();
  });


  it('a refused save says why in the bar and keeps the edits', async () => {
    given.apiError('put', '/api/programme/:productId/content', 'NOT_DRAFT', { status: 409 });
    const { user } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.type(screen.getByRole('textbox', { name: 'Document title' }), ' X');
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    const bar = screen.getByRole('region', { name: 'There are unsaved changes' });
    expect(await within(bar).findByRole('alert')).toHaveTextContent('Only a draft can be edited or approved.');
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveValue(`${GOVERNANCE.content.title} X`);
  });


  it('leaving with unsaved edits asks first; a tab switch does not', async () => {
    const { user, router } = renderProduct(f.ID.productGovernance);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.type(screen.getByRole('textbox', { name: 'Document title' }), ' X');
    await user.click(screen.getByRole('tab', { name: 'Process and RACI' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveValue(`${GOVERNANCE.content.title} X`);
    await act(async () => { router.navigate('/companies'); });
    const dialog = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The product itself, and the job of the one being
// generated. A 404 of the job is not a failure there: it is
// the job of someone else's run, and the card says so.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/programme/:productId',
  fixture: GOVERNANCE,
  render: () => renderProduct(f.ID.productGovernance),
  chrome: () => screen.getByRole('main'),
  loaded: async () => { await within(screen.getByRole('main')).findByRole('heading', { level: 1, name: GOVERNANCE.title }); },
  loading: () => screen.getByRole('main').querySelector('.MuiSkeleton-root'),
});


describeEndpointContract({
  path: '/api/jobs/:jobId',
  fixture: p.productJob(f.ID.jobProductRunning),
  render: () => renderProduct(f.ID.productRisksRunning),
  chrome: () => screen.getByRole('region', { name: 'The document is being generated' }),
  loaded: async () => { await screen.findByText('58 s'); },
  skip: { '404 NOT_FOUND → alert': 'a 404 is another user\'s job — the card goes by the product\'s own progress (above)' },
});


describe('the default export route', () => {

  it('refuses a format the kind does not export in, and a product that is not ready', async () => {
    const wrong = await fetch(url(`/api/programme/${f.ID.productGovernance}/export?format=xlsx`));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'format must be one of: pdf', code: 'INVALID_QUERY' });
    const early = await fetch(url(`/api/programme/${f.ID.productRisksRunning}/export?format=pdf`));
    expect(early.status).toBe(409);
    expect((await early.json()).code).toBe('NOT_READY');
  });
});
