// -----------------------------------------------------------
//  [*] Tests — StartAnalysisDialog ("run a compliance
//      analysis")
//
//  The dialog end to end against the backend double: the
//  company picker (required, the caller's companies) and the
//  fixed company of the company and report pages; the report
//  language, defaulting to the UI language — also after a
//  switch made while the page was open; the corpus scope
//  (only the enabled, ingested acts of GET
//  /api/corpus/documents); the cost estimate (GET
//  /api/reports/estimate with companyId and documentIds, the
//  shared extraction part, unknown prices — the total then a
//  floor, "at least" —, the unlimited or remaining budget,
//  the over-budget note measured against the user's own part
//  only (a floor over the budget included), a failed estimate
//  with its retry); the review of the list of acts (asked
//  for by default — review: true — and left out once the
//  "continue without waiting" box is ticked); the exact POST
//  body; the toast, the list refresh and the new report's
//  page; the in-flight state (a double click starts one
//  analysis); the three refusals (409 ALREADY_RUNNING with
//  the link to the report in the way — running, or waiting
//  for its approval — 409 CORPUS_EMPTY, 429 BUDGET_EXCEEDED)
//  shown inside the dialog without a toast; the reset on
//  reopening; Lithuanian; and
//  the contract matrices for the dialog's GET /api/companies,
//  GET /api/corpus/documents and GET /api/reports/estimate.
//
//  And the company's own requirements: the option, unticked
//  by default; ticked, the estimate asked again with
//  internal=true and its part shown as a line of its own,
//  counted against the budget with the analysis; the POST
//  with internal: true; the option off from the start, saying
//  why, for a company whose estimate counts no policy-level
//  document (policyDocuments — no tick needed to find out);
//  and no estimate asked by a closed dialog.
// -----------------------------------------------------------

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, makeQueryClient } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Reports from '@/pages/Reports/Reports';
import StartAnalysisDialog from '@/pages/Reports/StartAnalysisDialog';


const TITLE = 'Compliance analysis';
const SUBMIT = 'Start the analysis';

// The box that lets a run go through without the approval of
// its list of acts
const UNATTENDED = 'Continue without waiting for the list of acts to be approved';

// The box that adds the company's own requirements, the
// sentence under it, the one that replaces it for a company
// without a policy-level document, and the estimate's line
// for UAB Pavyzdys (one policy, eight requirements expected)
const OWN = 'Also assess the company\'s own requirements';
const OWN_HINT = 'Checks whether the procedures carry out what the company\'s own policies require; these findings are counted apart.';
const OWN_NONE = 'The company has no policy-level documents.';
const OWN_LINE = 'Of which ~$0.21 is the assessment of the company\'s own requirements (policy-level documents: 1, requirements: ~8).';

// The catalogue acts the scope offers: enabled and ingested
// (the repealed TFR is disabled, the Bank of Lithuania rules
// have no version yet)
const SCOPE_OPTIONS = ['DI aktas', 'DORA', 'MiCA', 'PPTFPĮ', 'VKĮ'];

// A plain user's view of the estimate: an own 5 USD budget
const withBudget = (companyId, remaining, extra = {}) => ({
  ...f.estimate(companyId), ...extra, budget: { limit: 5, used: 5 - remaining, remaining, unit: 'USD' },
});







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// DialogHarness: the dialog as its pages hold it — open state
// outside, a button to reopen — so the reset after a close is
// visible. renderDialog: the harness on the reports route
// (a navigate() ends on the "navigated away" probe).
// pickCompany / pickActs: the two autocompletes (their
// listboxes are poppers outside the dialog, hence screen).
// -----------------------------------------------------------

function DialogHarness({ companyId = null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Reopen</button>
      <StartAnalysisDialog open={open} onClose={() => setOpen(false)} companyId={companyId} />
    </>
  );
}

function renderDialog({ companyId = null, ...options } = {}) {
  return renderPage(<DialogHarness companyId={companyId} />, { route: '/reports', path: '/reports', ...options });
}

const dialogOf = (name = TITLE) => screen.findByRole('dialog', { name });

async function pickCompany(user, dialog, name, label = /^Company/) {
  await user.click(within(dialog).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name }));
}

async function pickActs(user, dialog, names, label = 'Only these legal acts (optional)') {
  for (const name of names) {
    await user.click(within(dialog).getByRole('combobox', { name: label }));
    await user.click(await screen.findByRole('option', { name }));
  }
}

const languageButton = (dialog, name) => within(within(dialog).getByRole('group', { name: /^(Report language|Ataskaitos kalba)$/ })).getByRole('button', { name });







// -----------------------------------------------------------
// The company picker
// -----------------------------------------------------------

describe('StartAnalysisDialog — the company', () => {

  it('offers the caller\'s companies and requires one: an empty start says "Pick a company" and sends nothing', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog();
    const dialog = await dialogOf();
    const company = within(dialog).getByRole('combobox', { name: /^Company/ });
    expect(company).toHaveFocus();
    await user.click(company);
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['UAB Pavyzdys', 'UAB Kreditas']);
    await user.keyboard('{Escape}');

    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    expect(await within(dialog).findByText('Pick a company')).toBeInTheDocument();
    expect(company).toHaveAttribute('aria-invalid', 'true');
    await settle(50);
    expect(posts).toHaveLength(0);
  });


  it('the "Pick a company" hint goes once a company is picked', async () => {
    const { user } = renderDialog();
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await within(dialog).findByText('Pick a company');
    await pickCompany(user, dialog, 'UAB Kreditas');
    await waitFor(() => expect(within(dialog).queryByText('Pick a company')).toBeNull());
    expect(within(dialog).getByRole('combobox', { name: /^Company/ })).toHaveValue('UAB Kreditas');
  });


  it('with a fixed company (the company and report pages) there is no picker and the estimate loads at once', async () => {
    const estimates = given.capture('get', '/api/reports/estimate', f.estimate(f.ID.kreditas));
    renderDialog({ companyId: f.ID.kreditas });
    const dialog = await dialogOf();
    expect(within(dialog).queryByRole('combobox', { name: /^Company/ })).toBeNull();
    expect(await within(dialog).findByText('Upper-bound cost: ~$0.58 (3 legal acts, ~4 obligations).')).toBeInTheDocument();
    expect(estimates[0].query).toEqual({ companyId: f.ID.kreditas });
  });


  it('a failed company list says so with a retry, instead of an empty picker — and the retry fills it', async () => {
    given.sequence('get', '/api/companies', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { companies: f.companies } }]);
    const { user } = renderDialog();
    const dialog = await dialogOf();
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The companies could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
    await pickCompany(user, dialog, 'UAB Pavyzdys');
  });
});







// -----------------------------------------------------------
// The report language
// -----------------------------------------------------------

describe('StartAnalysisDialog — the report language', () => {

  it('defaults to the UI language — English here — and sends the one picked', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    expect(languageButton(dialog, 'English')).toHaveAttribute('aria-pressed', 'true');
    expect(languageButton(dialog, 'Lithuanian')).toHaveAttribute('aria-pressed', 'false');
    await user.click(languageButton(dialog, 'Lithuanian'));
    expect(languageButton(dialog, 'Lithuanian')).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'lt', review: true });
  });


  it('a click on the pressed language keeps it — the report always has one', async () => {
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(languageButton(dialog, 'English'));
    expect(languageButton(dialog, 'English')).toHaveAttribute('aria-pressed', 'true');
    expect(languageButton(dialog, 'Lithuanian')).toHaveAttribute('aria-pressed', 'false');
  });


  it('defaults to Lithuanian in the Lithuanian UI', async () => {
    renderDialog({ companyId: f.ID.pavyzdys, locale: 'lt' });
    const dialog = await dialogOf('Atitikties analizė');
    expect(languageButton(dialog, 'Lietuvių')).toHaveAttribute('aria-pressed', 'true');
    expect(languageButton(dialog, 'Anglų')).toHaveAttribute('aria-pressed', 'false');
  });


  it('follows a switch of the UI language made after the page loaded — the dialog was mounted in English', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderPage(<Reports authData={authData} />, { route: '/reports', path: '/reports' });
    await screen.findByRole('heading', { level: 1, name: 'Reports' });
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    await user.click(await screen.findByRole('button', { name: 'Nauja analizė' }));
    const dialog = await dialogOf('Atitikties analizė');
    expect(languageButton(dialog, 'Lietuvių')).toHaveAttribute('aria-pressed', 'true');
    await pickCompany(user, dialog, 'UAB Kreditas', /^Įmonė/);
    await user.click(within(dialog).getByRole('button', { name: 'Pradėti analizę' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.kreditas, language: 'lt', review: true });
  });
});







// -----------------------------------------------------------
// The corpus scope
// -----------------------------------------------------------

describe('StartAnalysisDialog — the corpus scope', () => {

  it('offers only the enabled acts with a current version, by short title, and explains an empty scope', async () => {
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    expect(within(dialog).getByText('Empty — the analysis picks the applicable acts itself.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Only these legal acts (optional)' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(SCOPE_OPTIONS);
  });


  it('sends the picked acts as documentIds — to the estimate and in the POST', async () => {
    const estimates = given.capture('get', '/api/reports/estimate', f.estimate(f.ID.pavyzdys));
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await within(dialog).findByText(/^Upper-bound cost/);
    await pickActs(user, dialog, ['MiCA', 'DORA']);
    await waitFor(() => expect(estimates.at(-1).query).toEqual({ companyId: f.ID.pavyzdys, documentIds: `${f.ID.mica},${f.ID.dora}` }));
    expect(within(dialog).getByRole('button', { name: 'MiCA' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', documentIds: [f.ID.mica, f.ID.dora], review: true });
  });


  it('a failed act list says so with a retry — the start stays possible without a scope', async () => {
    given.apiError('get', '/api/corpus/documents', 'SERVER_ERROR', { status: 500 });
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The legal acts could not be loaded');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true });
  });
});







// -----------------------------------------------------------
// The cost estimate
// -----------------------------------------------------------

describe('StartAnalysisDialog — the cost estimate', () => {

  it('asks for nothing until a company is picked, then shows the upper bound, the shared extraction part and the budget', async () => {
    const estimates = given.capture('get', '/api/reports/estimate', f.estimate(f.ID.pavyzdys));
    const { user } = renderDialog();
    const dialog = await dialogOf();
    await settle(50);
    expect(estimates).toHaveLength(0);
    expect(within(dialog).queryByText('Estimated cost')).toBeNull();

    await pickCompany(user, dialog, 'UAB Pavyzdys');
    expect(await within(dialog).findByRole('heading', { name: 'Estimated cost' })).toBeInTheDocument();
    expect(within(dialog).getByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(within(dialog).getByText('Of which ~$3.46 is shared corpus work (obligations extracted for the first time: MiCA); it is paid from the shared budget, not your daily budget.')).toBeInTheDocument();
    // The administrator's budget is unlimited (remaining null)
    expect(within(dialog).getByText('Your daily AI budget is unlimited.')).toBeInTheDocument();
    expect(estimates[0].query).toEqual({ companyId: f.ID.pavyzdys });
  });


  it('leaves the extraction line out when every act\'s obligations exist already', async () => {
    const { user } = renderDialog();
    const dialog = await dialogOf();
    await pickCompany(user, dialog, 'UAB Kreditas');
    await within(dialog).findByText('Upper-bound cost: ~$0.58 (3 legal acts, ~4 obligations).');
    expect(within(dialog).queryByText(/shared corpus work/)).toBeNull();
  });


  it('says "Estimating the cost…" while the estimate is on the wire', async () => {
    given.hang('get', '/api/reports/estimate');
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    expect(await within(dialog).findByText('Estimating the cost…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: SUBMIT })).toBeEnabled();
  });


  it('says the prices are unknown and shows the total as a floor — "at least" — when a model has no price', async () => {
    given.json('get', '/api/reports/estimate', { ...f.estimate(f.ID.pavyzdys), pricesKnown: false });
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    expect(await within(dialog).findByText('The cost could not be estimated — the model prices are unknown.')).toBeInTheDocument();
    expect(within(dialog).getByText('At least $5.88 (4 legal acts, ~332 obligations) — without the models whose price is unknown.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Upper-bound cost/)).toBeNull();
    // The shared part priced so far is still told apart
    expect(within(dialog).getByText(/^Of which ~\$3\.46 is shared corpus work/)).toBeInTheDocument();
    expect(within(dialog).getByText('Your daily AI budget is unlimited.')).toBeInTheDocument();
  });


  it('shows no floor when no price at all was known — the note alone', async () => {
    given.json('get', '/api/reports/estimate', { ...f.estimate(f.ID.pavyzdys), pricesKnown: false, analysisUsd: 0, extractionUsd: 0, totalUsd: 0 });
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    expect(await within(dialog).findByText('The cost could not be estimated — the model prices are unknown.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/^At least/)).toBeNull();
    expect(within(dialog).queryByText(/shared corpus work/)).toBeNull();
  });


  it('shows a plain user\'s remaining daily budget', async () => {
    given.json('get', '/api/reports/estimate', withBudget(f.ID.kreditas, 4));
    renderDialog({ companyId: f.ID.kreditas });
    const dialog = await dialogOf();
    expect(await within(dialog).findByText('Your remaining AI budget today: $4.00.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('status')).toBeNull();
  });


  it('notes (role="status") when the user\'s own part exceeds the budget left — the start stays open: a started run is never stopped', async () => {
    given.json('get', '/api/reports/estimate', withBudget(f.ID.pavyzdys, 2));
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    const note = await within(dialog).findByRole('status');
    expect(note).toHaveTextContent('The estimate exceeds your remaining daily budget. A started analysis is not stopped, so today\'s spending may go over it.');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    const submit = within(dialog).getByRole('button', { name: SUBMIT });
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(posts).toHaveLength(1));
  });


  it('measures only the analysis against the budget — the shared extraction is not the user\'s to pay', async () => {
    // 2.43 analysis + 3.46 extraction = 5.88 total; 4.00 left
    given.json('get', '/api/reports/estimate', withBudget(f.ID.pavyzdys, 4));
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await within(dialog).findByText('Your remaining AI budget today: $4.00.');
    expect(within(dialog).getByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(within(dialog).queryByText(/exceeds your remaining daily budget/)).toBeNull();
  });


  it('notes a floor already over the budget left — the unpriced calls only add to it', async () => {
    // At least 2.43 for the analysis; 1.00 left
    given.json('get', '/api/reports/estimate', withBudget(f.ID.pavyzdys, 1, { pricesKnown: false }));
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await within(dialog).findByText('Your remaining AI budget today: $1.00.');
    expect(within(dialog).getByRole('status')).toHaveTextContent('The estimate exceeds your remaining daily budget.');
    expect(within(dialog).getByRole('button', { name: SUBMIT })).toBeEnabled();
  });


  it('gives no over-budget note for a floor within the budget left, nor for an unlimited budget', async () => {
    given.json('get', '/api/reports/estimate', withBudget(f.ID.pavyzdys, 4, { pricesKnown: false }));
    const view = renderDialog({ companyId: f.ID.pavyzdys });
    let dialog = await dialogOf();
    await within(dialog).findByText('Your remaining AI budget today: $4.00.');
    expect(within(dialog).queryByText(/exceeds your remaining daily budget/)).toBeNull();
    view.unmount();

    given.json('get', '/api/reports/estimate', { ...f.estimate(f.ID.pavyzdys), pricesKnown: false });
    renderDialog({ companyId: f.ID.pavyzdys });
    dialog = await dialogOf();
    await within(dialog).findByText('Your daily AI budget is unlimited.');
    expect(within(dialog).queryByText(/exceeds your remaining daily budget/)).toBeNull();
  });


  it('a failed estimate says so with a retry, and the start stays possible', async () => {
    given.sequence('get', '/api/reports/estimate', [{ status: 502, html: '<html>Bad Gateway</html>' }, { body: f.estimate(f.ID.pavyzdys) }]);
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The cost estimate could not be loaded');
    expect(alert).toHaveTextContent('The server is temporarily unreachable. Try again.');
    expect(within(dialog).getByRole('button', { name: SUBMIT })).toBeEnabled();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Starting
// -----------------------------------------------------------

describe('StartAnalysisDialog — starting', () => {

  it('POSTs exactly {companyId, language, review: true} without a scope, toasts, closes and opens the new report', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog();
    const dialog = await dialogOf();
    await pickCompany(user, dialog, 'UAB Pavyzdys');
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true });
    expect(await screen.findByText('Analysis started')).toBeInTheDocument();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.newReport}`);
  });


  it('asks for the review of the list of acts by default: the box is unticked and says what happens then', async () => {
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    const box = within(dialog).getByRole('checkbox', { name: UNATTENDED });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription('Unticked, the analysis stops once it has decided which legal acts apply and waits for you to approve the list. The obligations are judged only after that.');
  });


  it('ticking "continue without waiting" leaves the review out of the POST — the run goes through unattended', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('checkbox', { name: UNATTENDED }));
    expect(within(dialog).getByRole('checkbox', { name: UNATTENDED })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en' });
  });


  it('unticking the box again asks for the review again', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('checkbox', { name: UNATTENDED }));
    await user.click(within(dialog).getByRole('checkbox', { name: UNATTENDED }));
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true });
  });


  it('refreshes every report list after the start', async () => {
    const client = makeQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { user } = renderDialog({ companyId: f.ID.kreditas, client });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await screen.findByTestId('navigated-away');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] });
  });


  it('a double click starts one analysis — the second click lands on the busy button', async () => {
    // A start the test answers when it chooses, so the first POST
    // is still in flight when the second click arrives
    const posts = [];
    let answer;
    const answered = new Promise((resolve) => { answer = resolve; });
    server.use(http.post(url('/api/reports'), async ({ request }) => {
      posts.push(await request.json());
      await answered;
      return HttpResponse.json(f.NEW.report, { status: 201 });
    }));
    renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    const submit = within(dialog).getByRole('button', { name: SUBMIT });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(posts).toHaveLength(1));
    await settle(100);
    expect(posts).toHaveLength(1);
    answer();
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.newReport}`);
  });


  it('blocks a second start and the Cancel while the POST is on the wire', async () => {
    given.hang('post', '/api/reports');
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: SUBMIT })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });


  it('Cancel closes the dialog without a request', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts).toHaveLength(0);
  });


  it('reopens clean: the company, the picked language, the scope, the ticked box and the last refusal are gone', async () => {
    given.apiError('post', '/api/reports', 'CORPUS_EMPTY', { status: 409 });
    const { user } = renderDialog();
    let dialog = await dialogOf();
    await pickCompany(user, dialog, 'UAB Pavyzdys');
    await user.click(languageButton(dialog, 'Lithuanian'));
    await pickActs(user, dialog, ['DORA']);
    await user.click(within(dialog).getByRole('checkbox', { name: UNATTENDED }));
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await within(dialog).findByRole('alert');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    dialog = await dialogOf();
    expect(within(dialog).getByRole('combobox', { name: /^Company/ })).toHaveValue('');
    expect(languageButton(dialog, 'English')).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).queryByRole('button', { name: 'DORA' })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: UNATTENDED })).not.toBeChecked();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(within(dialog).queryByText('Pick a company')).toBeNull();
  });
});







// -----------------------------------------------------------
// The company's own requirements
// -----------------------------------------------------------

describe('StartAnalysisDialog — the company\'s own requirements', () => {

  it('offers the option unticked, saying what it checks — the estimate is asked without it, and so is the start', async () => {
    const estimates = given.spy('get', '/api/reports/estimate');
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    const box = within(dialog).getByRole('checkbox', { name: OWN });
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
    expect(box).toHaveAccessibleDescription(OWN_HINT);
    await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).');
    expect(estimates.map((call) => call.query)).toEqual([{ companyId: f.ID.pavyzdys }]);
    expect(within(dialog).queryByText(/company's own requirements \(/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true });
  });


  it('ticked, asks the estimate again with internal=true and shows its part as a line of its own — the total holds it', async () => {
    const estimates = given.spy('get', '/api/reports/estimate');
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).');
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    expect(await within(dialog).findByText(OWN_LINE)).toBeInTheDocument();
    expect(within(dialog).getByText('Upper-bound cost: ~$6.09 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Of which ~\$3\.46 is shared corpus work/)).toBeInTheDocument();
    expect(estimates.at(-1).query).toEqual({ companyId: f.ID.pavyzdys, internal: 'true' });
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeChecked();

    // Unticked again, the price is the one without it
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    expect(await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(within(dialog).queryByText(OWN_LINE)).toBeNull();
  });


  it('the start then sends internal: true — beside the scope, and with or without the review', async () => {
    const estimates = given.spy('get', '/api/reports/estimate');
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await pickActs(user, dialog, ['MiCA']);
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    await user.click(within(dialog).getByRole('checkbox', { name: UNATTENDED }));
    await within(dialog).findByText(OWN_LINE);
    expect(estimates.at(-1).query).toEqual({ companyId: f.ID.pavyzdys, documentIds: f.ID.mica, internal: 'true' });
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', documentIds: [f.ID.mica], internal: true });
  });


  it('with the review asked for, the POST is exactly {companyId, language, review: true, internal: true}', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    await within(dialog).findByText(OWN_LINE);
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true, internal: true });
  });


  it('a company without a policy-level document: the option is off from the start and says why — no tick needed, and the start does not ask for it', async () => {
    const estimates = given.spy('get', '/api/reports/estimate');
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ companyId: f.ID.kreditas });
    const dialog = await dialogOf();
    await within(dialog).findByText('Upper-bound cost: ~$0.58 (3 legal acts, ~4 obligations).');
    // The plain estimate counted no policy-level document
    const box = within(dialog).getByRole('checkbox', { name: OWN });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(OWN_NONE);
    expect(within(dialog).queryByText(OWN_HINT)).toBeNull();
    expect(within(dialog).queryByText(/company's own requirements \(/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.kreditas, language: 'en', review: true });
    // The estimate was never asked with the option
    expect(estimates.every((call) => !('internal' in call.query))).toBe(true);
  });


  it('the option is about the company picked: there to tick before one is, off for one without a policy, there again for the next', async () => {
    const { user } = renderDialog();
    const dialog = await dialogOf();
    // No company, nothing known: the option is there to tick
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeEnabled();
    await pickCompany(user, dialog, 'UAB Kreditas');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeDisabled());
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toHaveAccessibleDescription(OWN_NONE);
    await pickCompany(user, dialog, 'UAB Pavyzdys');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeEnabled());
    expect(within(dialog).getByRole('checkbox', { name: OWN })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toHaveAccessibleDescription(OWN_HINT);
  });


  it('ticked for one company, it goes off for the next without a policy — and is wanted still when the first comes back', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog();
    const dialog = await dialogOf();
    await pickCompany(user, dialog, 'UAB Pavyzdys');
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    await within(dialog).findByText(OWN_LINE);
    await pickCompany(user, dialog, 'UAB Kreditas');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeDisabled());
    expect(within(dialog).getByRole('checkbox', { name: OWN })).not.toBeChecked();
    // The price settles on the one without the option, and stays there
    expect(await within(dialog).findByText('Upper-bound cost: ~$0.58 (3 legal acts, ~4 obligations).')).toBeInTheDocument();
    await settle(150);
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeDisabled();
    expect(within(dialog).getByText('Upper-bound cost: ~$0.58 (3 legal acts, ~4 obligations).')).toBeInTheDocument();
    await pickCompany(user, dialog, 'UAB Pavyzdys');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeEnabled());
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeChecked();
    expect(await within(dialog).findByText(OWN_LINE)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true, internal: true });
  });


  it('an estimate that does not count the policy-level documents leaves the option on — until the one asked with it says there are none', async () => {
    // An answer from before estimates said so
    server.use(http.get(url('/api/reports/estimate'), ({ request }) => {
      const answer = f.estimate(f.ID.kreditas, new URL(request.url).searchParams.get('internal') === 'true');
      return HttpResponse.json(Object.fromEntries(Object.entries(answer).filter(([key]) => key !== 'policyDocuments')));
    }));
    const { user } = renderDialog({ companyId: f.ID.kreditas });
    const dialog = await dialogOf();
    await within(dialog).findByText('Upper-bound cost: ~$0.58 (3 legal acts, ~4 obligations).');
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeEnabled();
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeDisabled());
    expect(within(dialog).getByRole('checkbox', { name: OWN })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toHaveAccessibleDescription(OWN_NONE);
  });


  it('its cost is the user\'s own: it meets the budget left together with the analysis', async () => {
    // $2.43 of analysis fits $2.50; with $0.21 more it does not
    server.use(http.get(url('/api/reports/estimate'), ({ request }) => HttpResponse.json(
      withBudget(f.ID.pavyzdys, 2.5, f.estimate(f.ID.pavyzdys, new URL(request.url).searchParams.get('internal') === 'true')))));
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    expect(await within(dialog).findByText('Your remaining AI budget today: $2.50.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('status')).toBeNull();
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    await within(dialog).findByText(OWN_LINE);
    expect(within(dialog).getByRole('status')).toHaveTextContent('The estimate exceeds your remaining daily budget.');
    expect(within(dialog).getByRole('button', { name: SUBMIT })).toBeEnabled();
  });


  it('reopens with the option unticked', async () => {
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    let dialog = await dialogOf();
    await user.click(within(dialog).getByRole('checkbox', { name: OWN }));
    await within(dialog).findByText(OWN_LINE);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    dialog = await dialogOf();
    expect(within(dialog).getByRole('checkbox', { name: OWN })).toBeEnabled();
    expect(within(dialog).getByRole('checkbox', { name: OWN })).not.toBeChecked();
    expect(within(dialog).getByText(OWN_HINT)).toBeInTheDocument();
    await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).');
    expect(within(dialog).queryByText(OWN_LINE)).toBeNull();
  });


  it('a closed dialog asks for no estimate — its pages keep it mounted', async () => {
    const estimates = given.spy('get', '/api/reports/estimate');
    renderPage(<StartAnalysisDialog open={false} onClose={() => {}} companyId={f.ID.pavyzdys} />, { route: '/reports', path: '/reports' });
    await settle(100);
    expect(estimates).toHaveLength(0);
  });


  it('speaks Lithuanian: the option, what it checks, its line in the estimate — and why it is off', async () => {
    const { user } = renderDialog({ companyId: f.ID.pavyzdys, locale: 'lt' });
    const dialog = await dialogOf('Atitikties analizė');
    const box = within(dialog).getByRole('checkbox', { name: 'Įvertinti ir įmonės vidaus reikalavimų laikymąsi' });
    expect(box).toHaveAccessibleDescription('Tikrinama, ar procedūros įgyvendina tai, ko reikalauja pačios įmonės politikos; išvados skaičiuojamos atskirai.');
    await user.click(box);
    expect(await within(dialog).findByText('Iš jos ~0,21 USD — įmonės vidaus reikalavimų vertinimas (politikos lygmens dokumentų: 1, reikalavimų: ~8).')).toBeInTheDocument();
    expect(within(dialog).getByText('Didžiausia tikėtina kaina: ~6,09 USD (teisės aktų: 4, pareigų: ~332).')).toBeInTheDocument();
  });


  it('says in Lithuanian that the company has no policy-level documents', async () => {
    renderDialog({ companyId: f.ID.kreditas, locale: 'lt' });
    const dialog = await dialogOf('Atitikties analizė');
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Įvertinti ir įmonės vidaus reikalavimų laikymąsi' })).toBeDisabled());
    expect(within(dialog).getByRole('checkbox', { name: 'Įvertinti ir įmonės vidaus reikalavimų laikymąsi' })).toHaveAccessibleDescription('Įmonė neturi politikos lygmens dokumentų.');
  });
});







// -----------------------------------------------------------
// Refusals
// -----------------------------------------------------------

describe('StartAnalysisDialog — refusals', () => {

  it('409 ALREADY_RUNNING: a warning inside the dialog with the way to the running analysis, no toast', async () => {
    given.apiError('post', '/api/reports', 'ALREADY_RUNNING', { status: 409 });
    const lookups = given.capture('get', '/api/reports', { reports: f.reports.filter((row) => row.companyId === f.ID.kreditas) });
    const { user } = renderDialog({ companyId: f.ID.kreditas });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('A compliance analysis of this company is already running.');
    const link = await within(alert).findByRole('link', { name: 'Open the running analysis' });
    expect(link).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
    expect(lookups[0].query).toEqual({ companyId: f.ID.kreditas });
    expect(screen.getAllByText('A compliance analysis of this company is already running.')).toHaveLength(1);

    await user.click(link);
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.reportRunning}`);
  });


  it('409 ALREADY_RUNNING because a report waits for its list of acts: the link says so and leads to it', async () => {
    given.apiError('post', '/api/reports', 'ALREADY_RUNNING', { status: 409 });
    given.json('get', '/api/reports', { reports: [f.waitingReport, ...f.reports.filter((row) => row.companyId === f.ID.pavyzdys)] });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    const alert = await within(dialog).findByRole('alert');
    const link = await within(alert).findByRole('link', { name: 'Open the analysis awaiting approval' });
    expect(link).toHaveAttribute('href', `/reports/${f.ID.reportWaiting}`);
    expect(within(alert).queryByRole('link', { name: 'Open the running analysis' })).toBeNull();
  });


  it('409 ALREADY_RUNNING without a running report found (it just ended) offers no dead link', async () => {
    given.apiError('post', '/api/reports', 'ALREADY_RUNNING', { status: 409 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('A compliance analysis of this company is already running.');
    await settle(100);
    expect(within(alert).queryByRole('link')).toBeNull();
  });


  it('409 CORPUS_EMPTY: says an administrator must add acts first, and a second try goes out again', async () => {
    given.sequence('post', '/api/reports', [{ status: 409, body: apiError('CORPUS_EMPTY') }, { status: 201, body: f.NEW.report }]);
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The legal corpus is empty — an administrator must add legal acts first.');
    expect(within(alert).queryByRole('link')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/reports/${f.ID.newReport}`);
  });


  it('429 BUDGET_EXCEEDED: says today\'s budget is spent — an alert, the dialog stays', async () => {
    given.apiError('post', '/api/reports', 'BUDGET_EXCEEDED', { status: 429 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Today\'s AI usage budget is spent. Try again tomorrow.');
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('a refused start for a company that is gone (404) says "not found" in the dialog', async () => {
    given.apiError('post', '/api/reports', 'NOT_FOUND', { status: 404 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys });
    const dialog = await dialogOf();
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('StartAnalysisDialog in Lithuanian', () => {

  it('speaks Lithuanian: labels, the estimate in euro-style numbers, the budget and the start', async () => {
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDialog({ locale: 'lt' });
    const dialog = await dialogOf('Atitikties analizė');
    expect(within(dialog).getByText('Ataskaitos kalba')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Tik šie teisės aktai (neprivaloma)' })).toBeInTheDocument();
    expect(within(dialog).getByText('Tuščia — analizė pati atrinks taikytinus teisės aktus.')).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Tęsti nelaukiant aktų sąrašo patvirtinimo' })).not.toBeChecked();
    expect(within(dialog).getByText('Nepažymėjus analizė, nustačiusi taikomus teisės aktus, sustos ir lauks, kol patvirtinsite jų sąrašą. Pareigos vertinamos tik po to.')).toBeInTheDocument();
    await pickCompany(user, dialog, 'UAB Pavyzdys', /^Įmonė/);
    expect(await within(dialog).findByText('Didžiausia tikėtina kaina: ~5,88 USD (teisės aktų: 4, pareigų: ~332).')).toBeInTheDocument();
    expect(within(dialog).getByText('Iš jos ~3,46 USD — bendras korpuso darbas (pirmą kartą išskiriamos pareigos: MiCA); jis apmokamas iš bendro biudžeto, ne iš jūsų dienos biudžeto.')).toBeInTheDocument();
    expect(within(dialog).getByText('Jūsų dienos DI biudžetas neribotas.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Pradėti analizę' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'lt', review: true });
    expect(await screen.findByText('Analizė pradėta')).toBeInTheDocument();
  });


  it('says the unknown prices and the floor in Lithuanian', async () => {
    given.json('get', '/api/reports/estimate', { ...f.estimate(f.ID.pavyzdys), pricesKnown: false });
    renderDialog({ companyId: f.ID.pavyzdys, locale: 'lt' });
    const dialog = await dialogOf('Atitikties analizė');
    expect(await within(dialog).findByText('Kainos įvertinti nepavyko — modelių kainos nežinomos.')).toBeInTheDocument();
    expect(within(dialog).getByText('Ne mažiau kaip 5,88 USD (teisės aktų: 4, pareigų: ~332) — be modelių, kurių kaina nežinoma.')).toBeInTheDocument();
  });


  it('says the over-budget note and a refusal in Lithuanian', async () => {
    given.json('get', '/api/reports/estimate', withBudget(f.ID.pavyzdys, 1.5));
    given.apiError('post', '/api/reports', 'BUDGET_EXCEEDED', { status: 429 });
    const { user } = renderDialog({ companyId: f.ID.pavyzdys, locale: 'lt' });
    const dialog = await dialogOf('Atitikties analizė');
    expect(await within(dialog).findByText('Jūsų likęs šios dienos DI biudžetas: 1,50 USD.')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Apytikslė kaina viršija jūsų likusį dienos biudžetą. Pradėta analizė nenutraukiama, todėl šiandienos išlaidos gali jį viršyti.');
    await user.click(within(dialog).getByRole('button', { name: 'Pradėti analizę' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Šiandienos DI naudojimo limitas išnaudotas. Bandykite rytoj.');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The three lists the dialog reads, each through the dialog
// alone: the companies and the acts with the picker opened
// for the loaded check, the estimate with a fixed company.
// -----------------------------------------------------------

const openDialog = (props = {}) => renderPage(<StartAnalysisDialog open onClose={() => {}} {...props} />, { route: '/reports', path: '/reports' });

const openedOption = async (label, option) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  expect(await screen.findByRole('option', { name: option })).toBeInTheDocument();
};

describeEndpointContract({
  path: '/api/companies',
  fixture: { companies: f.companies },
  render: () => openDialog(),
  chrome: () => screen.getByRole('dialog', { name: TITLE }),
  loaded: () => openedOption(/^Company/, 'UAB Kreditas'),
});


describeEndpointContract({
  path: '/api/corpus/documents',
  fixture: { documents: f.acts },
  render: () => openDialog({ companyId: f.ID.pavyzdys }),
  chrome: () => screen.getByRole('dialog', { name: TITLE }),
  loaded: () => openedOption('Only these legal acts (optional)', 'MiCA'),
});


describeEndpointContract({
  path: '/api/reports/estimate',
  fixture: f.estimate(f.ID.pavyzdys),
  render: () => openDialog({ companyId: f.ID.pavyzdys }),
  chrome: () => screen.getByRole('dialog', { name: TITLE }),
  loaded: async () => { await screen.findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).'); },
  loading: () => screen.getByText('Estimating the cost…'),
});
