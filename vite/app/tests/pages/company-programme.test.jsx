// -----------------------------------------------------------
//  [*] Tests — CompanyProgramme (the programme tab)
//
//  The programme tab of /companies/:companyId against the
//  backend double, rendered in its page. GET
//  /api/companies/{id}/programme: the three kinds in their
//  order, each with its title, what it is and what it builds
//  on, and the state of its newest version — nothing yet; a
//  draft with its broken blocking rules and its notes;
//  approved, by whom and when; being generated, with the
//  step it is on; waiting in the queue; failed, with the
//  error; cancelled — the earlier versions under it, and the
//  buttons that fit. The 5-second poll while a product is on
//  its way, none otherwise.
//
//  Generating: the dialog (what it takes and costs, the
//  version it makes, what it will lack, the language — the
//  interface's until one is picked), POST …/programme {kind,
//  language}, the toast and the list read again; and the
//  refusals in plain words inside the dialog — no readable
//  documents, already being generated, today's budget spent.
//  Both languages, and the contract matrix of the list.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given } from '../support/backend/server';
import { describeEndpointContract } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import * as p from '../support/backend/programme';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PROGRAMME = p.companyProgramme(f.ID.pavyzdys);
const EMPTY = p.companyProgramme(f.ID.kreditas);
const TITLES = p.KINDS.map((kind) => kind.title.en);
const [POLICY, GOVERNANCE, RISKS] = TITLES;
const row = (id) => p.products.find((product) => product.id === id);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderTab: the company page on its programme tab; waits
// for the page. kind: the list item of one kind, found by
// its title. fakeClock / tick: the poll's clock.
// -----------------------------------------------------------

async function renderTab({ id = f.ID.pavyzdys, locale = 'en' } = {}) {
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${id}?tab=programme`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: f.company(id).name });
  return view;
}

const kind = async (title) => (await screen.findByRole('heading', { level: 3, name: title })).closest('li');

const fakeClock = () => vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });

async function tick(ms) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
}







// -----------------------------------------------------------
// The kinds and their states
// -----------------------------------------------------------

describe('CompanyProgramme — the kinds', () => {

  it('is the "Programme" tab of the company, between the actions and the chats', async () => {
    await renderTab();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs.slice(-3)).toEqual(['Actions', 'Programme', 'Chats']);
    expect(screen.getByRole('tab', { name: 'Programme' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { level: 2, name: 'Compliance programme' })).toBeInTheDocument();
  });


  it('lists the three kinds in their order, each with what it is and what it builds on', async () => {
    await renderTab();
    await kind(POLICY);
    expect(within(screen.getByRole('tabpanel')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(TITLES);
    expect(await kind(POLICY)).toHaveTextContent('The top-level compliance document: the eight parts of the policy, the document hierarchy and the missing documents.');
    expect(await kind(POLICY)).not.toHaveTextContent('Builds on');
    expect(await kind(GOVERNANCE)).toHaveTextContent(`Builds on: ${POLICY}.`);
    expect(await kind(RISKS)).toHaveTextContent(`Builds on: ${POLICY}, ${GOVERNANCE}.`);
  });


  it('a draft that breaks a blocking rule says how many, in words; its earlier approved version stands under it', async () => {
    await renderTab();
    const item = await kind(POLICY);
    expect(within(item).getByText('Draft', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(item).toHaveTextContent('Version 2 · generated 25/09/2026');
    expect(within(item).getByText('Blocking rules broken: 1')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: `Open: ${POLICY}, version 2` })).toHaveAttribute('href', `/programme/${f.ID.productPolicy}`);
    const older = within(item).getByRole('list', { name: `Earlier versions: ${POLICY}` });
    expect(within(older).getAllByRole('listitem').map((entry) => entry.textContent)).toEqual(['Version 1 · Approved · 23/09/2026Open']);
    expect(within(older).getByRole('link', { name: `Open: ${POLICY}, version 1` })).toHaveAttribute('href', `/programme/${f.ID.productPolicyApproved}`);
    expect(within(item).getByRole('button', { name: `Generate a new version: ${POLICY}` })).toBeEnabled();
  });


  it('a draft that keeps every blocking rule says so, with its notes for the reviewer', async () => {
    await renderTab();
    const item = await kind(GOVERNANCE);
    expect(item).toHaveTextContent('Version 1 · generated 25/09/2026');
    expect(within(item).getByText('Every blocking rule is kept')).toBeInTheDocument();
    expect(within(item).getByText('Notes for the reviewer: 1')).toBeInTheDocument();
    expect(within(item).queryByRole('list', { name: /^Earlier versions/ })).toBeNull();
  });


  it('a version being generated shows the step it is on and offers no second generation', async () => {
    await renderTab();
    const item = await kind(RISKS);
    expect(within(item).getByText('Generating', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(item).getByRole('progressbar', { name: `Generating: ${RISKS}` })).toHaveAttribute('aria-valuenow', '50');
    expect(within(item).getByText('2 of 4 steps · Writing the scenarios')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: `Open: ${RISKS}, version 2` })).toHaveAttribute('href', `/programme/${f.ID.productRisksRunning}`);
    expect(within(item).queryByRole('button', { name: /^Generate/ })).toBeNull();
    expect(within(within(item).getByRole('list', { name: `Earlier versions: ${RISKS}` })).getAllByRole('listitem').map((entry) => entry.textContent)).toEqual(['Version 1 · Draft · 26/09/2026Open']);
  });


  it('a company without any product: every kind "not generated yet", with "Generate" and nothing to open', async () => {
    await renderTab({ id: f.ID.kreditas });
    for (const title of TITLES) {
      const item = await kind(title);
      expect(within(item).getByText('Not generated yet')).toBeInTheDocument();
      expect(within(item).getByRole('button', { name: `Generate: ${title}` })).toHaveTextContent('Generate');
      expect(within(item).queryByRole('link')).toBeNull();
    }
  });


  it.each([
    ['approved', { status: 'approved', approvedByName: 'Rūta Administratorė', approvedAt: '2026-09-26T08:00:00+00:00' }, 'Version 1 · Approved by Rūta Administratorė, 26/09/2026', 'Approved'],
    ['approved without a name', { status: 'approved', approvedByName: null, approvedAt: '2026-09-26T08:00:00+00:00' }, 'Version 1 · Approved 26/09/2026', 'Approved'],
    ['cancelled', { status: 'cancelled' }, 'Version 1 · The generation was cancelled', 'Cancelled'],
    ['queued', { status: 'queued', progress: {}, jobStatus: 'queued' }, 'Waiting in the queue', 'Queued'],
  ])('a version that is %s says so', async (_name, changes, words, chip) => {
    given.json('get', '/api/companies/:companyId/programme', { ...PROGRAMME, products: [{ ...row(f.ID.productGovernance), ...changes }] });
    await renderTab();
    const item = await kind(GOVERNANCE);
    expect(item).toHaveTextContent(words);
    expect(within(item).getByText(chip, { selector: '.MuiChip-label' })).toBeInTheDocument();
  });


  it('a failed version shows the error, and the kind can be generated again', async () => {
    given.json('get', '/api/companies/:companyId/programme', {
      ...PROGRAMME, products: [{ ...row(f.ID.productGovernance), status: 'failed', error: 'LLM call failed: [503] upstream unavailable' }],
    });
    await renderTab();
    const item = await kind(GOVERNANCE);
    expect(item).toHaveTextContent('Version 1 · The generation failed');
    expect(within(item).getByText('LLM call failed: [503] upstream unavailable')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: `Generate a new version: ${GOVERNANCE}` })).toBeEnabled();
  });


  it('polls every 5 s while a product is being generated', async () => {
    const calls = given.capture('get', '/api/companies/:companyId/programme', PROGRAMME);
    fakeClock();
    await renderTab();
    await kind(RISKS);
    expect(calls).toHaveLength(1);
    await tick(5000);
    vi.useRealTimers();
    await waitFor(() => expect(calls).toHaveLength(2));
  });


  it('does not poll when nothing is on its way', async () => {
    const calls = given.capture('get', '/api/companies/:companyId/programme', { ...PROGRAMME, products: PROGRAMME.products.filter((product) => product.status !== 'running') });
    fakeClock();
    await renderTab();
    await kind(RISKS);
    await tick(11000);
    vi.useRealTimers();
    expect(calls).toHaveLength(1);
  });


  it('a list that fails to load says so, with a retry that brings it', async () => {
    given.sequence('get', '/api/companies/:companyId/programme', [{ status: 500, body: { error: 'x', code: 'SERVER_ERROR' } }, { body: PROGRAMME }]);
    const { user } = await renderTab();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The compliance programme could not be loaded');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await kind(POLICY)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Generating
// -----------------------------------------------------------

describe('CompanyProgramme — generating', () => {

  it('asks first: what it takes and costs, the version it makes, and the language — the interface\'s', async () => {
    const posts = given.spy('post', '/api/companies/:companyId/programme');
    const { user } = await renderTab();
    await user.click(within(await kind(POLICY)).getByRole('button', { name: `Generate a new version: ${POLICY}` }));
    const dialog = await screen.findByRole('dialog', { name: `Generate: ${POLICY}` });
    expect(within(dialog).getByText('The generation runs in the background and takes about five minutes. It spends about $0.50 of today\'s AI budget.')).toBeInTheDocument();
    expect(within(dialog).getByText('A new version (3) is made; the earlier versions stay.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/^Not generated yet:/)).toBeNull();
    const language = within(dialog).getByRole('group', { name: 'Document language' });
    expect(within(language).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(language).getByRole('button', { name: 'Lithuanian' })).toHaveAttribute('aria-pressed', 'false');
    expect(posts).toHaveLength(0);
  });


  it('starts the generation: POST {kind, language}, a toast, the dialog closes and the list is read again', async () => {
    const lists = given.spy('get', '/api/companies/:companyId/programme');
    const posts = given.spy('post', '/api/companies/:companyId/programme');
    const { user } = await renderTab();
    await user.click(within(await kind(GOVERNANCE)).getByRole('button', { name: `Generate a new version: ${GOVERNANCE}` }));
    const dialog = await screen.findByRole('dialog', { name: `Generate: ${GOVERNANCE}` });
    await user.click(within(dialog).getByRole('button', { name: 'Lithuanian' }));
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(`http://localhost:3000/api/companies/${f.ID.pavyzdys}/programme`);
    expect(posts[0].body).toEqual({ kind: 'governance', language: 'lt' });
    expect(await screen.findByText('Generation started')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(lists.length).toBeGreaterThanOrEqual(2));
  });


  it('sends the interface language when none was picked', async () => {
    const posts = given.spy('post', '/api/companies/:companyId/programme');
    const { user } = await renderTab();
    await user.click(within(await kind(POLICY)).getByRole('button', { name: `Generate a new version: ${POLICY}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ kind: 'policy', language: 'en' });
  });


  it('names the kinds a product builds on that are not there yet — it can be generated without them', async () => {
    const { user } = await renderTab({ id: f.ID.kreditas });
    await user.click(within(await kind(RISKS)).getByRole('button', { name: `Generate: ${RISKS}` }));
    const dialog = await screen.findByRole('dialog', { name: `Generate: ${RISKS}` });
    expect(within(dialog).getByRole('status')).toHaveTextContent(`Not generated yet: ${POLICY}, ${GOVERNANCE}. The document can be generated without them, only it is then less well grounded.`);
    expect(within(dialog).queryByText(/^A new version/)).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Generate' })).toBeEnabled();
  });


  it('a company without readable documents is refused in plain words inside the dialog — no toast', async () => {
    const { user } = await renderTab({ id: f.ID.kreditas });
    await user.click(within(await kind(POLICY)).getByRole('button', { name: `Generate: ${POLICY}` }));
    const dialog = await screen.findByRole('dialog', { name: `Generate: ${POLICY}` });
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The company has no readable documents — upload them first.');
    expect(screen.getAllByText('The company has no readable documents — upload them first.')).toHaveLength(1);
    expect(EMPTY.products).toEqual([]);
  });


  it.each([
    ['ALREADY_RUNNING', 409, 'This document is already being generated.'],
    ['BUDGET_EXCEEDED', 429, 'Today\'s AI usage budget is spent. Try again tomorrow.'],
    ['SERVER_ERROR', 500, 'Server error. Try again later.'],
  ])('%s is said in the dialog, and a new try starts clean', async (code, status, sentence) => {
    given.apiError('post', '/api/companies/:companyId/programme', code, { status });
    const { user } = await renderTab();
    await user.click(within(await kind(POLICY)).getByRole('button', { name: `Generate a new version: ${POLICY}` }));
    const dialog = await screen.findByRole('dialog', { name: `Generate: ${POLICY}` });
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(sentence);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(within(await kind(POLICY)).getByRole('button', { name: `Generate a new version: ${POLICY}` }));
    expect(within(await screen.findByRole('dialog')).queryByRole('alert')).toBeNull();
  });


  it('the default backend refuses a kind that is being generated already', async () => {
    const response = await fetch(`http://localhost:3000/api/companies/${f.ID.pavyzdys}/programme`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'risks' }) });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('ALREADY_RUNNING');
    const started = await fetch(`http://localhost:3000/api/companies/${f.ID.pavyzdys}/programme`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'policy', language: 'en' }) });
    expect(started.status).toBe(201);
    expect(await started.json()).toMatchObject({ id: f.ID.newProduct, kind: 'policy', version: 3, status: 'queued', language: 'en', title: 'Compliance policy' });
  });


  it('speaks Lithuanian — titles, states, the dialog and its amount', async () => {
    const { user } = await renderTab({ locale: 'lt' });
    expect(screen.getByRole('tab', { name: 'Programa' })).toHaveAttribute('aria-selected', 'true');
    const item = await kind(p.KINDS[0].title.lt);
    expect(within(screen.getByRole('tabpanel')).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(p.KINDS.map((entry) => entry.title.lt));
    expect(item).toHaveTextContent('2 versija · parengta 2026-09-25');
    expect(within(item).getByText('Pažeistos privalomos taisyklės: 1')).toBeInTheDocument();
    expect(within(item).getByText('Ankstesnės versijos')).toBeInTheDocument();
    expect(await kind(p.KINDS[2].title.lt)).toHaveTextContent('2 iš 4 etapų · Rengiami rizikos scenarijai');
    expect(await kind(p.KINDS[1].title.lt)).toHaveTextContent('Remiasi: Atitikties politika.');
    await user.click(within(item).getByRole('button', { name: 'Generuoti naują versiją: Atitikties politika' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generuoti: Atitikties politika' });
    expect(within(dialog).getByText('Generavimas vyksta fone ir trunka apie penkias minutes. Jis sunaudos apie 0,50 USD šios dienos DI biudžeto.')).toBeInTheDocument();
    expect(within(within(dialog).getByRole('group', { name: 'Dokumento kalba' })).getByRole('button', { name: 'Lietuvių' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Generuoti' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/companies/:companyId/programme',
  fixture: PROGRAMME,
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=programme`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Compliance programme' }),
  loaded: async () => { await screen.findByRole('link', { name: `Open: ${POLICY}, version 2` }); },
  loading: () => screen.getByRole('tabpanel').querySelector('.MuiSkeleton-root'),
});
