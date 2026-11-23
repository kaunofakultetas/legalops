// -----------------------------------------------------------
//  [*] Tests — Obligations page (the admin's review queue)
//
//  The /obligations page end to end against the backend
//  double — the page frame and its admin-only route, and the
//  ObligationsPanel it holds:
//
//    the list      — the proposed ones first (the preselected
//                    status), the act, the provision, the
//                    domain, the severity and the status per
//                    row, "showing n of total", the truncation
//                    note, the empty and filtered-empty states,
//                    a failed load and its retry, the grid's
//                    own paging of the loaded rows
//    the filters   — act (?document=), status, domain
//                    (?category=), the debounced ?q= — each
//                    down to the exact query — and severity on
//                    the loaded rows; a filter change drops
//                    the selection; coming back: the filters
//                    and the grid's page read from and
//                    replaced in the address (the default
//                    status absent, "all" for every status),
//                    unknown values ignored, the selection
//                    never kept
//    single review — approve / reject through POST
//                    /api/obligations/review with the one id,
//                    the toasts, the disabled states, the edit
//                    and delete dialogs, the refusals
//    bulk review   — the selection bar, POST /review {ids,
//                    status} in chunks of 500, the progress,
//                    the fallback to one PATCH per row when
//                    the route is missing (404 / 405), the
//                    partial failure, a refusal keeping the
//                    selection
//    the dialog    — ObligationDialog: the legal basis linked
//                    to the provisions, every field, a PATCH
//                    of only the changed fields, the checks,
//                    the refusals, Cancel discarding the
//                    edits, the read-only view
//    the check     — what the judge (a second model) made of
//                    each obligation: the chip per verdict
//                    after the title and its tone, the note
//                    and what is off under a doubted row's
//                    title, the count
//                    line, the check filter
//                    (?verification=), the doubted first
//                    (?order=review — the queue's default,
//                    behind a switch), the dialog's check
//                    result, and a save whose answer comes
//                    back without a verdict clearing the chip
//
//  both languages, and the backend contract matrix for
//  GET /api/obligations.
// -----------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, renderApp, authData, userAuthData } from '../support/render';
import { given, server, url, readBody } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Obligations from '@/pages/Obligations/Obligations';


// The route table imports every page — a one-time cost that
// would otherwise land on the first renderApp test
beforeAll(async () => {
  await import('@/router');
});


const byId = (id) => f.obligations.find((row) => row.id === id);

// The four proposed obligations, in the view's order — what
// the queue opens on
const PROPOSED = f.obligations.filter((row) => row.status === 'proposed');

const AI_RISK = byId(f.ID.obAiRisk);
const INCIDENTS = byId(f.ID.obIncidentReport);
const REGISTER = byId(f.ID.obRegister);
const CREDITWORTHINESS = byId(f.ID.obCreditworthiness);
const LICENCE = byId(f.ID.obLicence);
const FEES = byId(f.ID.obFeeDisclosure);
const STANDARD = byId(f.ID.obStandard);

// n obligations with their own ids, for paging and chunking
const many = (n) => Array.from({ length: n }, (_, i) => ({
  ...AI_RISK, id: `0b000000-0000-4000-8000-${String(500000 + i).padStart(12, '0')}`, title: `Pareiga nr. ${i + 1}`,
}));







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderObligations: the page on its route. record: every
// request to an endpoint (query and body) while the default
// handler still answers. shownTitles: the obligations the
// grid shows, top to bottom. rowOf: a row by its title.
// choose: an MUI select / autocomplete option. selectRows:
// ticks the rows' checkboxes. bulkBar: the selection bar.
// openDialog: a row click → the obligation dialog.
// -----------------------------------------------------------

function renderObligations({ session = authData, locale } = {}) {
  return renderPage(<Obligations authData={session} />, { route: '/obligations', path: '/obligations', locale });
}

function record(method, path) {
  const calls = [];
  server.use(http[method](url(path), async ({ request }) => {
    calls.push({ url: request.url, query: Object.fromEntries(new URL(request.url).searchParams), body: await readBody(request.clone()) });
  }));
  return calls;
}

const shownTitles = () => within(screen.getByRole('grid')).getAllByRole('row').slice(1)
  .map((row) => row.querySelector('[data-field="title"] span')?.textContent);

const rowOf = async (title) => (await screen.findByText(title)).closest('[role="row"]');

const cell = (row, field) => row.querySelector(`[data-field="${field}"]`);

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

async function selectRows(user, ...titles) {
  for (const title of titles) {
    await user.click(within(await rowOf(title)).getByRole('checkbox', { name: 'Select row' }));
  }
}

const bulkBar = (count) => screen.findByRole('region', { name: `Selected: ${count}` });

async function openDialog(user, row, name) {
  await user.click(await screen.findByText(row.title));
  return screen.findByRole('dialog', { name });
}

const withObligations = (rows, total = rows.length) => given.json('get', '/api/obligations', { obligations: rows, total });







// -----------------------------------------------------------
// The page and its route
// -----------------------------------------------------------

describe('Obligations — the page and its route', () => {

  it('frames the queue: the title, the subtitle, the filters with "Proposed" preselected, the grid', async () => {
    renderObligations();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Obligation review' })).toBeInTheDocument();
    expect(within(main).getByText('Obligations the AI extracted from legal acts. Approved ones feed the analysis and survive re-extraction; rejected ones never reach a report.')).toBeInTheDocument();
    const act = within(main).getByRole('combobox', { name: 'Legal act' });
    expect(act).toHaveValue('');
    expect(act).toHaveAttribute('placeholder', 'All legal acts');
    expect(within(main).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Proposed');
    expect(within(main).getByRole('combobox', { name: 'Domain' })).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'Severity' })).toBeInTheDocument();
    expect(within(main).getByRole('textbox', { name: 'Search the obligations' })).toHaveValue('');
    expect(await within(main).findByRole('grid', { name: 'Obligation review' })).toBeInTheDocument();
  });


  it('the route keeps a plain user out ("Access restricted") without asking for any obligation', async () => {
    given.json('get', '/api/auth/me', userAuthData);
    const calls = record('get', '/api/obligations');
    await renderApp({ route: '/obligations' });
    expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeInTheDocument();
    await settle(100);
    expect(calls).toHaveLength(0);
  });


  it('the route opens the queue for an admin, titled in the tab', async () => {
    await renderApp({ route: '/obligations' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Obligation review' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Obligation review · Compliance assistant'));
    expect(await screen.findByText(AI_RISK.title)).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The list
// -----------------------------------------------------------

describe('ObligationsPanel — the list', () => {

  it('asks for the proposed obligations (1000 at most) and lists them in the view\'s order', async () => {
    const calls = record('get', '/api/obligations');
    renderObligations();
    await rowOf(AI_RISK.title);
    expect(calls[0].query).toEqual({ limit: '1000', status: 'proposed', order: 'review' });
    expect(shownTitles()).toEqual(PROPOSED.map((row) => row.title));
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument();
  });


  it('shows each obligation with its text, the act, the provision, the domain, the severity and the status', async () => {
    renderObligations();
    const row = await rowOf(INCIDENTS.title);
    // Between the two: the judge's verdict, what it found off, and its note
    expect(cell(row, 'title')).toHaveTextContent(`${INCIDENTS.title} PartlyWhat is off: deadline. ${INCIDENTS.verification.note}${INCIDENTS.text}`);
    expect(cell(row, 'documentTitle')).toHaveTextContent('DORA');
    expect(cell(row, 'citations')).toHaveTextContent('19 str. 1 d.');
    expect(cell(row, 'category')).toHaveTextContent('Incident reporting');
    expect(cell(row, 'severity')).toHaveTextContent('High');
    expect(cell(row, 'status')).toHaveTextContent('Proposed');
    for (const name of ['Obligation', 'Legal act', 'Provision', 'Domain', 'Severity', 'Status', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    // Asked for from the columns menu only
    expect(screen.queryByRole('columnheader', { name: /^Applies to/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Updated/ })).toBeNull();
  });


  it('joins several provisions and leaves a standard obligation\'s act empty', async () => {
    withObligations([{ ...LICENCE, citations: [{ unitId: f.ID.micaArt59Par1, path: '59 str. 1 d.' }, { unitId: f.ID.micaArt59Par2, path: '59 str. 2 d.' }] }, STANDARD]);
    renderObligations();
    expect(cell(await rowOf(LICENCE.title), 'citations')).toHaveTextContent('59 str. 1 d., 59 str. 2 d.');
    const standard = await rowOf(STANDARD.title);
    expect(cell(standard, 'documentTitle')).toHaveTextContent('');
    expect(cell(standard, 'citations')).toHaveTextContent('');
    expect(cell(standard, 'category')).toHaveTextContent('Risk management');
  });


  it('says so when the backend holds more obligations than were loaded', async () => {
    withObligations(PROPOSED, 1500);
    renderObligations();
    expect(await screen.findByText('The first 4 of 1500 obligations are loaded — narrow the filters.')).toBeInTheDocument();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });


  it('pages the loaded rows 50 at a time in the grid', async () => {
    withObligations(many(120));
    const { user } = renderObligations();
    await rowOf('Pareiga nr. 1');
    expect(screen.getByText('Showing 120 of 120')).toBeInTheDocument();
    expect(screen.getByText('1–50 of 120')).toBeInTheDocument();
    expect(shownTitles()).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(await screen.findByText('51–100 of 120')).toBeInTheDocument();
    expect(shownTitles()[0]).toBe('Pareiga nr. 51');
  });


  it('an empty queue under the preselected status says no obligation matches; "All" with none at all explains where they come from', async () => {
    withObligations([]);
    const { user } = renderObligations();
    expect(await screen.findByText('No obligations match the filters')).toBeInTheDocument();
    expect(screen.queryByText('Obligations appear once an administrator runs the extraction on a legal act\'s page.')).toBeNull();
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');
    expect(await screen.findByText('No obligations')).toBeInTheDocument();
    expect(screen.getByText('Obligations appear once an administrator runs the extraction on a legal act\'s page.')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });


  it('a failed load shows the translated error with a retry that brings the rows', async () => {
    given.sequence('get', '/api/obligations', [{ status: 503 }, { body: { obligations: PROPOSED, total: 4 } }]);
    const { user } = renderObligations();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The obligations could not be loaded');
    expect(alert).toHaveTextContent('The service is temporarily unavailable. Try again later.');
    expect(screen.queryByRole('grid')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(AI_RISK.title)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});







// -----------------------------------------------------------
// The filters
// -----------------------------------------------------------
//
// Act, status, domain and the search reach the backend as the
// exact query; severity narrows the loaded rows.
// -----------------------------------------------------------

describe('ObligationsPanel — the filters', () => {

  it('the act picker offers the acts by short title and asks for one act\'s obligations (?document=)', async () => {
    const calls = record('get', '/api/obligations');
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await user.click(screen.getByRole('combobox', { name: 'Legal act' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['DI aktas', 'DORA', 'MiCA', 'TFR (2015)', 'LB KTPT taisyklės', 'PPTFPĮ', 'VKĮ']);
    await user.click(screen.getByRole('option', { name: 'DORA' }));
    await waitFor(() => expect(shownTitles()).toEqual([INCIDENTS.title, REGISTER.title]));
    expect(calls.at(-1).query).toEqual({ limit: '1000', document: f.ID.dora, status: 'proposed', order: 'review' });
    expect(screen.getByRole('combobox', { name: 'Legal act' })).toHaveValue('DORA');

    // Clearing the act asks for every act again
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(4));
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'proposed', order: 'review' });
  });


  it('the status asks for all, approved or rejected obligations', async () => {
    const calls = record('get', '/api/obligations');
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');
    await waitFor(() => expect(shownTitles()).toHaveLength(10));
    expect(calls.at(-1).query).toEqual({ limit: '1000', order: 'review' });
    expect(screen.getByText('Showing 10 of 10')).toBeInTheDocument();

    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'Approved');
    await waitFor(() => expect(shownTitles()).toHaveLength(5));
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'approved', order: 'review' });

    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'Rejected');
    await waitFor(() => expect(shownTitles()).toEqual([FEES.title]));
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'rejected', order: 'review' });
  });


  it('the domain asks for one category', async () => {
    const calls = record('get', '/api/obligations');
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');
    await choose(user, screen.getByRole('combobox', { name: 'Domain' }), 'AML/CTF and KYC');
    await waitFor(() => expect(shownTitles()).toEqual([byId(f.ID.obAmlOfficer).title, byId(f.ID.obCorrespondent).title]));
    expect(calls.at(-1).query).toEqual({ limit: '1000', category: 'aml_kyc', order: 'review' });
  });


  it('the search is sent as ?q= once the typing settles, trimmed, in one request', async () => {
    const calls = record('get', '/api/obligations');
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await user.type(screen.getByRole('textbox', { name: 'Search the obligations' }), ' registr ');
    await waitFor(() => expect(shownTitles()).toEqual([REGISTER.title]));
    expect(calls.map((call) => call.query.q)).toEqual([undefined, 'registr']);
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'proposed', q: 'registr', order: 'review' });
  });


  it('the severity narrows the loaded rows without asking again', async () => {
    const calls = record('get', '/api/obligations');
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Severity' }), 'High');
    await waitFor(() => expect(shownTitles()).toEqual([INCIDENTS.title, CREDITWORTHINESS.title]));
    expect(screen.getByText('Showing 2 of 4')).toBeInTheDocument();
    await settle(50);
    expect(calls).toHaveLength(1);
  });


  it('combined filters that match nothing say so', async () => {
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Legal act' }), 'MiCA');
    expect(await screen.findByText('No obligations match the filters')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });


  it('a filter change drops the selection', async () => {
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, REGISTER.title);
    expect(await bulkBar(2)).toBeInTheDocument();
    await choose(user, screen.getByRole('combobox', { name: 'Severity' }), 'Medium');
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Selected/ })).toBeNull());
  });
});







// -----------------------------------------------------------
// Coming back to the queue
// -----------------------------------------------------------
//
// The filters and the table's page and sort live in the
// address (replaced): Back from a provision an obligation
// linked to finds the queue as it was left. The status is
// absent at the panel's default ("proposed" here), "all" for
// every status. The selection is never kept.
// -----------------------------------------------------------

describe('ObligationsPanel — coming back', () => {

  const renderAt = (route, locale) => renderPage(<Obligations authData={authData} />, { route, path: '/obligations', locale });


  it('the act, the status, the domain, the severity, the search and the page come from the address', async () => {
    const calls = record('get', '/api/obligations');
    renderAt(`/obligations?act=${f.ID.dora}&status=all&severity=high&q=IRT`);
    await waitFor(() => expect(shownTitles()).toEqual([INCIDENTS.title]));
    expect(calls[0].query).toEqual({ limit: '1000', document: f.ID.dora, q: 'IRT', order: 'review' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Legal act' })).toHaveValue('DORA'));
    // "All" is the empty choice: the select shows no value
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent.replace(/\u200b/g, '').trim()).toBe('');
    expect(screen.getByRole('combobox', { name: 'Severity' })).toHaveTextContent('High');
    expect(screen.getByRole('textbox', { name: 'Search the obligations' })).toHaveValue('IRT');
  });


  it('the filters write the address, replacing it — the default status leaves no parameter, a new filter the first page', async () => {
    const { user, router } = renderAt('/obligations?page=2');
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');
    await waitFor(() => expect(router.state.location.search).toBe('?status=all'));
    expect(router.state.historyAction).toBe('REPLACE');
    await choose(user, screen.getByRole('combobox', { name: 'Domain' }), 'AML/CTF and KYC');
    await waitFor(() => expect(router.state.location.search).toBe('?status=all&category=aml_kyc'));
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'Proposed');
    await waitFor(() => expect(router.state.location.search).toBe('?category=aml_kyc'));
  });


  it('the grid\'s page comes back: page 2 of a long queue', async () => {
    given.json('get', '/api/obligations', { obligations: many(120), total: 120 });
    renderAt('/obligations?page=2');
    await waitFor(() => expect(shownTitles()[0]).toBe('Pareiga nr. 51'));
  });


  it('an act the catalogue does not hold, a status or domain the panel does not know, is ignored', async () => {
    const calls = record('get', '/api/obligations');
    renderAt('/obligations?act=d9999999-0000-4000-8000-000000000099&status=forgotten&category=astrology');
    await waitFor(() => expect(calls.at(-1)?.query).toEqual({ limit: '1000', status: 'proposed', order: 'review' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(4));
    expect(screen.getByRole('combobox', { name: 'Legal act' })).toHaveValue('');
  });


  it('the rows picked are never kept: coming back starts with none', async () => {
    const first = renderAt('/obligations');
    await selectRows(first.user, AI_RISK.title, REGISTER.title);
    expect(await bulkBar(2)).toBeInTheDocument();
    first.unmount();
    renderAt('/obligations');
    await rowOf(AI_RISK.title);
    expect(screen.queryByRole('region', { name: /^Selected/ })).toBeNull();
  });


  it('in Lithuanian too', async () => {
    renderAt('/obligations?status=approved&severity=critical', 'lt');
    expect(await screen.findByRole('combobox', { name: 'Būsena' })).toHaveTextContent('Patvirtinta');
    expect(screen.getByRole('combobox', { name: 'Reikšmingumas' })).toHaveTextContent('Kritinė');
  });
});







// -----------------------------------------------------------
// Reviewing one obligation
// -----------------------------------------------------------

describe('ObligationsPanel — reviewing one obligation', () => {

  it('approve sends the one id to the review route, toasts, and the list is asked for again', async () => {
    const reviews = given.capture('post', '/api/obligations/review', { updated: 1, status: 'approved' });
    const gets = record('get', '/api/obligations');
    const { user } = renderObligations();
    await user.click(within(await rowOf(REGISTER.title)).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(reviews).toHaveLength(1));
    expect(reviews[0].body).toEqual({ ids: [f.ID.obRegister], status: 'approved' });
    expect(await screen.findByText('Obligation approved')).toBeInTheDocument();
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
    // The icon acted in place: no dialog
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('reject sends the one id with "rejected" and toasts', async () => {
    const reviews = given.capture('post', '/api/obligations/review', { updated: 1, status: 'rejected' });
    const { user } = renderObligations();
    await user.click(within(await rowOf(AI_RISK.title)).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(reviews).toHaveLength(1));
    expect(reviews[0].body).toEqual({ ids: [f.ID.obAiRisk], status: 'rejected' });
    expect(await screen.findByText('Obligation rejected')).toBeInTheDocument();
  });


  it('an approved obligation cannot be approved again, a rejected one not rejected again', async () => {
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');
    const approved = await rowOf(LICENCE.title);
    expect(within(approved).getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(approved).getByRole('button', { name: 'Reject' })).toBeEnabled();
    const rejected = await rowOf(FEES.title);
    expect(within(rejected).getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(within(rejected).getByRole('button', { name: 'Approve' })).toBeEnabled();
  });


  it('a refused review toasts the reason', async () => {
    given.apiError('post', '/api/obligations/review', 'FORBIDDEN', { status: 403 });
    const { user } = renderObligations();
    await user.click(within(await rowOf(REGISTER.title)).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('You are not allowed to do this.')).toBeInTheDocument();
    expect(screen.queryByText('Obligation approved')).toBeNull();
  });


  it('the pencil, the title and a click anywhere on the row all open the obligation', async () => {
    const { user } = renderObligations();
    await user.click(within(await rowOf(AI_RISK.title)).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Obligation — DI aktas' });
    expect(within(dialog).getByRole('textbox', { name: /^Title/ })).toHaveValue(AI_RISK.title);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const again = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    expect(within(again).getByRole('textbox', { name: /^Title/ })).toHaveValue(INCIDENTS.title);
    await user.click(within(again).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(cell(await rowOf(REGISTER.title), 'category'));
    const third = await screen.findByRole('dialog', { name: 'Obligation — DORA' });
    expect(within(third).getByRole('textbox', { name: /^Title/ })).toHaveValue(REGISTER.title);
  });


  it('the title is a button a keyboard reaches: Enter opens the obligation, for a plain user too', async () => {
    const { user } = renderObligations({ session: userAuthData });
    const title = within(await rowOf(CREDITWORTHINESS.title)).getByRole('button', { name: CREDITWORTHINESS.title });
    title.focus();
    await user.tab({ shift: true });
    expect(title).not.toHaveFocus();
    await user.tab();
    expect(title).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Obligation — VKĮ' });
    expect(within(dialog).getByRole('textbox', { name: /^Title/ })).toHaveValue(CREDITWORTHINESS.title);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('Space on the title opens the obligation too — the grid leaves the key to the button', async () => {
    const { user } = renderObligations({ session: userAuthData });
    within(await rowOf(CREDITWORTHINESS.title)).getByRole('button', { name: CREDITWORTHINESS.title }).focus();
    await user.keyboard(' ');
    const dialog = await screen.findByRole('dialog', { name: 'Obligation — VKĮ' });
    expect(within(dialog).getByRole('textbox', { name: /^Title/ })).toHaveValue(CREDITWORTHINESS.title);
  });


  it('delete asks first, naming the obligation, then DELETEs, toasts and closes', async () => {
    const deletes = given.capture('delete', '/api/obligations/:obligationId', { ok: true });
    const gets = record('get', '/api/obligations');
    const { user } = renderObligations();
    await user.click(within(await rowOf(REGISTER.title)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the obligation?' });
    expect(dialog).toHaveTextContent(REGISTER.title);
    expect(dialog).toHaveTextContent('The obligation is deleted. A re-extraction may propose it again — rejecting it is usually better.');
    expect(deletes).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/obligations/${f.ID.obRegister}`));
    expect(await screen.findByText('Obligation deleted')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
  });


  it('a refused delete toasts the reason and keeps the dialog', async () => {
    given.apiError('delete', '/api/obligations/:obligationId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderObligations();
    await user.click(within(await rowOf(REGISTER.title)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the obligation?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Delete the obligation?' })).toBeInTheDocument();
    expect(screen.queryByText('Obligation deleted')).toBeNull();
  });


  it('Cancel on the delete dialog sends nothing', async () => {
    const deletes = given.capture('delete', '/api/obligations/:obligationId', { ok: true });
    const { user } = renderObligations();
    await user.click(within(await rowOf(REGISTER.title)).getByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete the obligation?' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(deletes).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Reviewing many at once
// -----------------------------------------------------------

describe('ObligationsPanel — bulk review', () => {

  it('ticking rows brings the bar with the count and the three statuses; the header box selects them all', async () => {
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, CREDITWORTHINESS.title);
    const bar = await bulkBar(2);
    expect(within(bar).getAllByRole('button').map((button) => button.textContent)).toEqual(['Approve selected', 'Reject selected', 'Set back to proposed']);
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(await bulkBar(4)).toBeInTheDocument();
    // A tick is not a click on the row: no dialog
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('approves the selection in one request, toasts the count, clears the selection and refetches', async () => {
    const reviews = given.capture('post', '/api/obligations/review', { updated: 3, status: 'approved' });
    const gets = record('get', '/api/obligations');
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, INCIDENTS.title, CREDITWORTHINESS.title);
    await user.click(within(await bulkBar(3)).getByRole('button', { name: 'Approve selected' }));
    await waitFor(() => expect(reviews).toHaveLength(1));
    expect(reviews[0].body.status).toBe('approved');
    expect([...reviews[0].body.ids].sort()).toEqual([f.ID.obAiRisk, f.ID.obIncidentReport, f.ID.obCreditworthiness].sort());
    expect(await screen.findByText('Obligations updated: 3')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Selected/ })).toBeNull());
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
  });


  it('rejects or sets back to proposed the same way', async () => {
    const reviews = given.capture('post', '/api/obligations/review', { updated: 2, status: 'rejected' });
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, REGISTER.title);
    await user.click(within(await bulkBar(2)).getByRole('button', { name: 'Reject selected' }));
    await waitFor(() => expect(reviews).toHaveLength(1));
    expect(reviews[0].body.status).toBe('rejected');
    await screen.findByText('Obligations updated: 2');

    await selectRows(user, REGISTER.title);
    await user.click(within(await bulkBar(1)).getByRole('button', { name: 'Set back to proposed' }));
    await waitFor(() => expect(reviews).toHaveLength(2));
    expect(reviews[1].body).toEqual({ ids: [f.ID.obRegister], status: 'proposed' });
    // One obligation: the single toast
    expect(await screen.findByText('Obligation set back to proposed')).toBeInTheDocument();
  });


  it('holds the buttons and shows the progress while the review runs', async () => {
    given.hang('post', '/api/obligations/review');
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, REGISTER.title);
    const bar = await bulkBar(2);
    await user.click(within(bar).getByRole('button', { name: 'Approve selected' }));
    expect(await within(bar).findByText('Updating 0 of 2…')).toBeInTheDocument();
    expect(within(bar).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    for (const name of ['Approve selected', 'Reject selected', 'Set back to proposed']) {
      expect(within(bar).getByRole('button', { name })).toBeDisabled();
    }
  });


  it('sends a selection of more than 500 in chunks of 500 — select-all included', async () => {
    const rows = many(600);
    withObligations(rows);
    const reviews = given.capture('post', '/api/obligations/review', { updated: 0, status: 'approved' });
    const { user } = renderObligations();
    await rowOf('Pareiga nr. 1');
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    await user.click(within(await bulkBar(600)).getByRole('button', { name: 'Approve selected' }));
    await waitFor(() => expect(reviews).toHaveLength(2));
    expect(reviews.map((call) => call.body.ids.length)).toEqual([500, 100]);
    expect(new Set([...reviews[0].body.ids, ...reviews[1].body.ids])).toEqual(new Set(rows.map((row) => row.id)));
    expect(await screen.findByText('Obligations updated: 600')).toBeInTheDocument();
  }, 30000);


  // An older backend without the bulk route: one PATCH per row
  for (const status of [404, 405]) {
    it(`falls back to one PATCH per row when the review route answers ${status}`, async () => {
      given.apiError('post', '/api/obligations/review', status === 404 ? 'NOT_FOUND' : 'METHOD_NOT_ALLOWED', { status });
      const patches = given.capture('patch', '/api/obligations/:obligationId', AI_RISK);
      const { user } = renderObligations();
      await selectRows(user, AI_RISK.title, REGISTER.title);
      await user.click(within(await bulkBar(2)).getByRole('button', { name: 'Reject selected' }));
      await waitFor(() => expect(patches).toHaveLength(2));
      expect(patches.map((call) => call.url).sort()).toEqual([url(`/api/obligations/${f.ID.obAiRisk}`), url(`/api/obligations/${f.ID.obRegister}`)].sort());
      expect(patches.map((call) => call.body)).toEqual([{ status: 'rejected' }, { status: 'rejected' }]);
      expect(await screen.findByText('Obligations updated: 2')).toBeInTheDocument();
      // The fallback is silent per row: no route error toasted
      expect(screen.queryByText('Not found — it may have been deleted.')).toBeNull();
    });
  }


  it('the fallback counts the rows it could not update', async () => {
    given.apiError('post', '/api/obligations/review', 'NOT_FOUND', { status: 404 });
    server.use(http.patch(url('/api/obligations/:obligationId'), ({ params }) => (params.obligationId === f.ID.obRegister
      ? HttpResponse.json({ error: 'x', code: 'SERVER_ERROR' }, { status: 500 })
      : HttpResponse.json(AI_RISK))));
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, REGISTER.title, CREDITWORTHINESS.title);
    await user.click(within(await bulkBar(3)).getByRole('button', { name: 'Approve selected' }));
    expect(await screen.findByText('Updated 2 of 3; failed: 1')).toBeInTheDocument();
    expect(screen.queryByText(/^Obligations updated/)).toBeNull();
  });


  it('a refused bulk review toasts the reason, patches nothing and keeps the selection for another try', async () => {
    given.apiError('post', '/api/obligations/review', 'SERVER_ERROR', { status: 500 });
    const patches = given.capture('patch', '/api/obligations/:obligationId', AI_RISK);
    const { user } = renderObligations();
    await selectRows(user, AI_RISK.title, REGISTER.title);
    await user.click(within(await bulkBar(2)).getByRole('button', { name: 'Approve selected' }));
    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    await settle(50);
    expect(patches).toHaveLength(0);
    const bar = await bulkBar(2);
    expect(within(bar).getByRole('button', { name: 'Approve selected' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// ObligationDialog
// -----------------------------------------------------------
//
// One obligation read and edited: every field, the legal
// basis, a PATCH of only what changed, the checks, the
// refusals, Cancel.
// -----------------------------------------------------------

describe('ObligationDialog', () => {

  const textbox = (dialog, name) => within(dialog).getByRole('textbox', { name });


  it('shows the obligation: the legal basis linked to the provisions, every field and who extracted it', async () => {
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    const basis = within(dialog).getByRole('link', { name: '19 str. 1 d.' });
    expect(basis).toHaveAttribute('href', `/corpus/${f.ID.dora}?unit=${f.ID.doraArt19Par1}`);
    expect(textbox(dialog, /^Title/)).toHaveValue(INCIDENTS.title);
    expect(textbox(dialog, /^Obligation text/)).toHaveValue(INCIDENTS.text);
    expect(textbox(dialog, 'English title')).toHaveValue(INCIDENTS.titleEn);
    expect(textbox(dialog, 'English text')).toHaveValue(INCIDENTS.textEn);
    expect(textbox(dialog, 'Addressee')).toHaveValue('Finansų subjektas');
    expect(textbox(dialog, 'Deadline / frequency')).toHaveValue(INCIDENTS.deadline);
    expect(textbox(dialog, 'Conditions of application')).toHaveValue(INCIDENTS.conditions);
    expect(textbox(dialog, 'Expected evidence')).toHaveValue(INCIDENTS.evidence);
    expect(textbox(dialog, 'Notes')).toHaveValue('');
    expect(within(dialog).getByRole('combobox', { name: 'Domain' })).toHaveTextContent('Incident reporting');
    expect(within(dialog).getByRole('combobox', { name: 'Severity' })).toHaveTextContent('High');
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Proposed');
    for (const type of ['Bank', 'Crypto-asset service provider', 'Electronic money institution', 'Investment firm', 'Payment institution']) {
      expect(within(dialog).getByRole('button', { name: type })).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Extracted by: gateway:azure/gpt-5.6-terra')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
  });


  it('a reviewed obligation says when; a standard one has no act, no basis and no model', async () => {
    const { user } = renderObligations();
    await rowOf(AI_RISK.title);
    await choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');
    let dialog = await openDialog(user, LICENCE, 'Obligation — MiCA');
    expect(within(dialog).getByText('Extracted by: gateway:azure/gpt-5.6-terra · Reviewed 06/09/2026, 09:10')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await openDialog(user, STANDARD, 'Obligation');
    expect(within(dialog).queryByText(/^Legal basis/)).toBeNull();
    expect(within(dialog).getByText('Reviewed 08/09/2026, 12:00')).toBeInTheDocument();
    expect(textbox(dialog, 'Notes')).toHaveValue('ISO/IEC 27001 praktika');
  });


  it('a citation without a provision id is shown without a link', async () => {
    withObligations([{ ...INCIDENTS, citations: [{ unitId: null, path: '19 str. 1 d.' }, { unitId: f.ID.doraArt28Par3, path: '28 str. 3 d.' }] }]);
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    expect(within(dialog).getByText('19 str. 1 d.').closest('a')).toBeNull();
    expect(within(dialog).getByRole('link', { name: '28 str. 3 d.' })).toHaveAttribute('href', `/corpus/${f.ID.dora}?unit=${f.ID.doraArt28Par3}`);
  });


  it('following the legal basis opens the provision in the corpus', async () => {
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    await user.click(within(dialog).getByRole('link', { name: '19 str. 1 d.' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${f.ID.dora}?unit=${f.ID.doraArt19Par1}`);
  });


  it('saves only the changed fields, toasts, closes and refetches', async () => {
    const patches = given.capture('patch', '/api/obligations/:obligationId', INCIDENTS);
    const gets = record('get', '/api/obligations');
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    await user.clear(textbox(dialog, /^Title/));
    await user.type(textbox(dialog, /^Title/), 'Pranešti apie didelius IRT incidentus');
    await user.click(within(dialog).getByRole('combobox', { name: 'Severity' }));
    await user.click(await screen.findByRole('option', { name: 'Critical' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Approved' }));
    await user.type(textbox(dialog, 'Notes'), 'Patikrinta');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(url(`/api/obligations/${f.ID.obIncidentReport}`));
    expect(patches[0].body).toEqual({ title: 'Pranešti apie didelius IRT incidentus', notes: 'Patikrinta', severity: 'critical', status: 'approved' });
    expect(await screen.findByText('Obligation saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gets.length).toBeGreaterThanOrEqual(2));
  });


  it('edits the institution types: removing one sends the rest', async () => {
    const patches = given.capture('patch', '/api/obligations/:obligationId', INCIDENTS);
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    await user.click(within(dialog).getByRole('combobox', { name: 'Institution types' }));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Payment institution' })).toBeNull());
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ appliesTo: ['bank', 'casp', 'emi', 'investment_firm'] });
  });


  it('Save without a change just closes', async () => {
    const patches = given.capture('patch', '/api/obligations/:obligationId', INCIDENTS);
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(patches).toHaveLength(0);
    expect(screen.queryByText('Obligation saved')).toBeNull();
  });


  it('the title and the text are required', async () => {
    const patches = given.capture('patch', '/api/obligations/:obligationId', INCIDENTS);
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    await user.clear(textbox(dialog, /^Title/));
    await user.clear(textbox(dialog, /^Obligation text/));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getAllByText('Required')).toHaveLength(2));
    expect(textbox(dialog, /^Title/)).toHaveAttribute('aria-invalid', 'true');
    await settle(50);
    expect(patches).toHaveLength(0);
  });


  it('shows a refusal inside the dialog without a toast, keeping the edits', async () => {
    given.apiError('patch', '/api/obligations/:obligationId', 'INVALID_FIELD', { status: 400, error: 'title cannot be empty' });
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    await user.type(textbox(dialog, 'Notes'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('title cannot be empty');
    expect(screen.getAllByText('title cannot be empty')).toHaveLength(1);
    expect(textbox(dialog, 'Notes')).toHaveValue('x');
  });


  it('Cancel discards the edits: the same obligation reopens as it is, and Save then sends nothing', async () => {
    const patches = given.capture('patch', '/api/obligations/:obligationId', AI_RISK);
    const { user } = renderObligations();
    let dialog = await openDialog(user, AI_RISK, 'Obligation — DI aktas');
    await user.clear(textbox(dialog, /^Title/));
    await user.type(textbox(dialog, /^Title/), 'Juodraštis');
    await user.clear(textbox(dialog, /^Obligation text/));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await openDialog(user, AI_RISK, 'Obligation — DI aktas');
    expect(textbox(dialog, /^Title/)).toHaveValue(AI_RISK.title);
    expect(textbox(dialog, /^Obligation text/)).toHaveValue(AI_RISK.text);
    expect(within(dialog).queryByText('Required')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(patches).toHaveLength(0);
  });


  it('opening another obligation shows that one', async () => {
    const { user } = renderObligations();
    let dialog = await openDialog(user, AI_RISK, 'Obligation — DI aktas');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openDialog(user, CREDITWORTHINESS, 'Obligation — VKĮ');
    expect(textbox(dialog, /^Title/)).toHaveValue(CREDITWORTHINESS.title);
    expect(within(dialog).getByRole('combobox', { name: 'Domain' })).toHaveTextContent('Customer protection');
  });


  it('without admin rights the panel is read-only: no ticks, no actions, a dialog without Save', async () => {
    const { user } = renderObligations({ session: userAuthData });
    await rowOf(AI_RISK.title);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Actions/ })).toBeNull();
    const dialog = await openDialog(user, AI_RISK, 'Obligation — DI aktas');
    expect(textbox(dialog, /^Title/)).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: 'Institution types' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// The judge's check
// -----------------------------------------------------------
//
// A second model compared every obligation with the full
// text of the provisions it cites; the list shows what it
// made of each, and lets a reviewer start with its doubts.
// -----------------------------------------------------------

describe('ObligationsPanel — the judge\'s check', () => {

  const renderAt = (route, locale) => renderPage(<Obligations authData={authData} />, { route, path: '/obligations', locale });
  const check = (row) => cell(row, 'title').querySelector('.MuiChip-root');
  const chipOf = check;
  const everyStatus = async (user) => choose(user, screen.getByRole('combobox', { name: 'Status' }), 'All');


  it('shows the verdict of each obligation as a chip: the two doubts in the attention tones, the rest quiet', async () => {
    const { user } = renderObligations();
    expect(check(await rowOf(AI_RISK.title))).toHaveTextContent('Unsupported');
    expect(chipOf(await rowOf(AI_RISK.title))).toHaveClass('MuiChip-colorError');
    expect(check(await rowOf(INCIDENTS.title))).toHaveTextContent('Partly');
    expect(chipOf(await rowOf(INCIDENTS.title))).toHaveClass('MuiChip-colorWarning');
    expect(check(await rowOf(CREDITWORTHINESS.title))).toHaveTextContent('Not checked');
    expect(chipOf(await rowOf(CREDITWORTHINESS.title))).toHaveClass('MuiChip-colorDefault');
    // In the title's cell, right after the title — no column of its own to push the actions away
    expect(screen.queryByRole('columnheader', { name: /^Check/ })).toBeNull();
    expect(cell(await rowOf(AI_RISK.title), 'title')).toHaveTextContent(new RegExp(`^${AI_RISK.title} Unsupported`));
    await everyStatus(user);
    expect(check(await rowOf(LICENCE.title))).toHaveTextContent('Supported');
    expect(chipOf(await rowOf(LICENCE.title))).toHaveClass('MuiChip-colorDefault');
    // An obligation without an act was never judged
    expect(check(await rowOf(STANDARD.title))).toHaveTextContent('Not checked');
  });


  it('a doubted row says under its title what is off and the judge\'s note — in the model\'s English; the others say nothing', async () => {
    const { user } = renderObligations();
    const register = cell(await rowOf(REGISTER.title), 'title');
    expect(within(register).getByText('What is off: merged duties.')).toBeInTheDocument();
    const note = within(register).getByText(REGISTER.verification.note);
    expect(note).toHaveAttribute('lang', 'en');
    expect(cell(await rowOf(AI_RISK.title), 'title')).toHaveTextContent('What is off: duty.');
    expect(cell(await rowOf(CREDITWORTHINESS.title), 'title')).not.toHaveTextContent('What is off');
    await everyStatus(user);
    expect(cell(await rowOf(LICENCE.title), 'title')).toHaveTextContent(`${LICENCE.title} Supported${LICENCE.text}`);
  });


  it('a doubt without a named issue shows the note alone; a row with nothing to say shows neither', async () => {
    withObligations([
      { ...AI_RISK, verification: { ...AI_RISK.verification, issue: 'none' } },
      { ...INCIDENTS, verification: { ...INCIDENTS.verification, issue: null, note: '' } },
    ]);
    renderObligations();
    const first = cell(await rowOf(AI_RISK.title), 'title');
    expect(first).toHaveTextContent(AI_RISK.verification.note);
    expect(first).not.toHaveTextContent('What is off');
    expect(cell(await rowOf(INCIDENTS.title), 'title')).toHaveTextContent(`${INCIDENTS.title} Partly${INCIDENTS.text}`);
  });


  it('counts above the list what the judge left for a person — and says nothing while no row was judged', async () => {
    const view = renderObligations();
    await rowOf(AI_RISK.title);
    expect(screen.getByText('Doubted: 3 · not checked: 1')).toBeInTheDocument();
    view.unmount();

    withObligations(PROPOSED.map((row) => ({ ...row, verification: null })));
    renderObligations();
    await rowOf(AI_RISK.title);
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument();
    expect(screen.queryByText(/^Doubted:/)).toBeNull();
  });


  it('asks for the doubted first by default — a switch that says so, and that turns it off', async () => {
    const calls = record('get', '/api/obligations');
    const { user, router } = renderAt('/obligations?status=all');
    const order = await screen.findByRole('switch', { name: 'Doubted first' });
    expect(order).toBeChecked();
    // Unsupported, partly (the gravest first), never judged, supported
    await waitFor(() => expect(shownTitles().slice(0, 5)).toEqual([AI_RISK.title, INCIDENTS.title, REGISTER.title, CREDITWORTHINESS.title, STANDARD.title]));
    expect(calls[0].query).toEqual({ limit: '1000', order: 'review' });

    await user.click(order);
    expect(order).not.toBeChecked();
    // The view's own order: by act, then as extracted
    await waitFor(() => expect(shownTitles()).toEqual(f.obligations.map((row) => row.title)));
    expect(calls.at(-1).query).toEqual({ limit: '1000' });
    expect(router.state.location.search).toBe('?status=all&order=plain');
    expect(router.state.historyAction).toBe('REPLACE');

    await user.click(order);
    await waitFor(() => expect(router.state.location.search).toBe('?status=all'));
    expect(calls.at(-1).query).toEqual({ limit: '1000', order: 'review' });
  });


  it('the order switched off comes back from the address', async () => {
    const calls = record('get', '/api/obligations');
    renderAt('/obligations?order=plain');
    await rowOf(AI_RISK.title);
    expect(screen.getByRole('switch', { name: 'Doubted first' })).not.toBeChecked();
    expect(calls[0].query).toEqual({ limit: '1000', status: 'proposed' });
  });


  it('the check filter offers the doubts as one, each verdict and the unchecked — and asks the server (?verification=)', async () => {
    const calls = record('get', '/api/obligations');
    const { user, router } = renderAt('/obligations?page=2');
    await rowOf(AI_RISK.title);
    const filter = screen.getByRole('combobox', { name: 'Check' });
    await user.click(filter);
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['All', 'Doubted', 'Unsupported', 'Partly', 'Supported', 'Not checked']);
    await user.click(screen.getByRole('option', { name: 'Doubted' }));
    await waitFor(() => expect(shownTitles()).toEqual([AI_RISK.title, INCIDENTS.title, REGISTER.title]));
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'proposed', verification: 'doubt', order: 'review' });
    // A new filter is a new list: its first page
    expect(router.state.location.search).toBe('?verification=doubt');
    expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument();

    await choose(user, filter, 'Not checked');
    await waitFor(() => expect(shownTitles()).toEqual([CREDITWORTHINESS.title]));
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'proposed', verification: 'unchecked', order: 'review' });

    await choose(user, filter, 'Supported');
    expect(await screen.findByText('No obligations match the filters')).toBeInTheDocument();
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'proposed', verification: 'supported', order: 'review' });

    await choose(user, filter, 'All');
    await waitFor(() => expect(shownTitles()).toHaveLength(4));
    expect(router.state.location.search).toBe('');
  });


  it('the check filter comes back from the address; a value it does not know is ignored', async () => {
    const calls = record('get', '/api/obligations');
    const view = renderAt('/obligations?verification=unsupported');
    await waitFor(() => expect(shownTitles()).toEqual([AI_RISK.title]));
    expect(screen.getByRole('combobox', { name: 'Check' })).toHaveTextContent('Unsupported');
    expect(calls[0].query).toEqual({ limit: '1000', status: 'proposed', verification: 'unsupported', order: 'review' });
    view.unmount();

    renderAt('/obligations?verification=perhaps&order=sideways');
    await waitFor(() => expect(shownTitles()).toHaveLength(4));
    expect(calls.at(-1).query).toEqual({ limit: '1000', status: 'proposed', order: 'review' });
  });


  it('a filter change drops the selection, the check filter and the order too', async () => {
    const { user } = renderAt('/obligations');
    await selectRows(user, AI_RISK.title);
    await bulkBar(1);
    await user.click(screen.getByRole('switch', { name: 'Doubted first' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Selected: 1' })).toBeNull());
  });


  it('the dialog says what the judge found: the verdict, what is off, the whole note, when and by which model — and that an edit clears it', async () => {
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    const result = within(dialog).getByRole('region', { name: 'Check result' });
    expect(within(result).getByText('Partly')).toBeInTheDocument();
    expect(within(result).getByText('What is off: deadline')).toBeInTheDocument();
    expect(within(result).getByText(INCIDENTS.verification.note)).toHaveAttribute('lang', 'en');
    expect(within(result).getByText('Checked 26/09/2026, 10:12 · gateway:azure/gpt-5.5')).toBeInTheDocument();
    expect(within(result).getByText('Changing the title or the text clears this result: the obligation has to be checked again.')).toBeInTheDocument();
  });


  it('a supported obligation has no note and nothing off; one never judged says so', async () => {
    const { user } = renderAt('/obligations?status=all');
    let dialog = await openDialog(user, LICENCE, 'Obligation — MiCA');
    let result = within(dialog).getByRole('region', { name: 'Check result' });
    expect(within(result).getByText('Supported')).toBeInTheDocument();
    expect(result).not.toHaveTextContent('What is off');
    expect(within(result).getByText('Checked 26/09/2026, 10:12 · gateway:azure/gpt-5.5')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await openDialog(user, CREDITWORTHINESS, 'Obligation — VKĮ');
    result = within(dialog).getByRole('region', { name: 'Check result' });
    expect(within(result).getByText('Not checked')).toBeInTheDocument();
    expect(within(result).getByText('The second model has not checked this obligation yet — or its title or text was changed after the check.')).toBeInTheDocument();
    expect(result).not.toHaveTextContent('Changing the title or the text clears this result');
  });


  it('a verdict no model reached (the provisions are gone) gives the date alone; a reader is told nothing about editing', async () => {
    withObligations([{ ...AI_RISK, verification: { ...AI_RISK.verification, model: null, promptVersionId: null } }]);
    const { user } = renderObligations({ session: userAuthData });
    const dialog = await openDialog(user, AI_RISK, 'Obligation — DI aktas');
    const result = within(dialog).getByRole('region', { name: 'Check result' });
    expect(within(result).getByText('Checked 26/09/2026, 10:12')).toBeInTheDocument();
    expect(result).not.toHaveTextContent('Changing the title or the text clears this result');
    // The reviewer's order is not a reader's: no switch, no order asked
    expect(screen.queryByRole('switch', { name: 'Doubted first' })).toBeNull();
  });


  it('a save whose answer comes back without a verdict clears the row\'s chip and note at once — the title changed, the judge\'s word is gone', async () => {
    const patches = record('patch', '/api/obligations/:obligationId');
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    // From here on the list does not answer: only the PATCH's own answer can change the row
    given.hang('get', '/api/obligations');
    const title = within(dialog).getByRole('textbox', { name: /^Title/ });
    await user.clear(title);
    await user.type(title, 'Pranešti apie didelius IRT incidentus');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ title: 'Pranešti apie didelius IRT incidentus' });
    const row = await rowOf('Pranešti apie didelius IRT incidentus');
    expect(check(row)).toHaveTextContent('Not checked');
    expect(cell(row, 'title')).not.toHaveTextContent('What is off');
    expect(screen.getByText('Doubted: 2 · not checked: 2')).toBeInTheDocument();
  });


  it('a save that leaves the title and the text alone keeps the verdict', async () => {
    const { user } = renderObligations();
    const dialog = await openDialog(user, INCIDENTS, 'Obligation — DORA');
    given.hang('get', '/api/obligations');
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Patikrinta');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Obligation saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(check(await rowOf(INCIDENTS.title))).toHaveTextContent('Partly');
  });


  it('speaks Lithuanian: the chips, what is off, the counts, the filter, the switch and the dialog', async () => {
    const { user } = renderObligations({ locale: 'lt' });
    const row = await rowOf(INCIDENTS.title);
    expect(check(row)).toHaveTextContent('Iš dalies');
    expect(cell(row, 'title')).toHaveTextContent('Kas ne taip: terminas.');
    expect(check(await rowOf(AI_RISK.title))).toHaveTextContent('Nepagrįsta');
    expect(check(await rowOf(CREDITWORTHINESS.title))).toHaveTextContent('Netikrinta');
    expect(cell(await rowOf(REGISTER.title), 'title')).toHaveTextContent('Kas ne taip: sujungtos pareigos.');
    expect(screen.getByText('Abejotinų: 3 · netikrintų: 1')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Abejotinos pirmiausia' })).toBeChecked();
    await user.click(screen.getByRole('combobox', { name: 'Tikrinimas' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Visos', 'Abejotinos', 'Nepagrįstos', 'Iš dalies', 'Pagrįstos', 'Netikrintos']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await user.click(screen.getByText(INCIDENTS.title));
    const dialog = await screen.findByRole('dialog', { name: 'Pareiga — DORA' });
    const result = within(dialog).getByRole('region', { name: 'Tikrinimo išvada' });
    expect(within(result).getByText('Kas ne taip: terminas')).toBeInTheDocument();
    expect(within(result).getByText('Patikrinta 2026-09-26 10:12 · gateway:azure/gpt-5.5')).toBeInTheDocument();
    expect(within(result).getByText('Pakeitus pavadinimą ar tekstą, ši išvada panaikinama: pareigą reikės patikrinti iš naujo.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// In Lithuanian
// -----------------------------------------------------------

describe('Obligations — in Lithuanian', () => {

  it('speaks Lithuanian: the title, the filters, the columns and cells, the summary, the bulk bar and the toast', async () => {
    const { user } = renderObligations({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Pareigų peržiūra' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Teisės aktas' })).toHaveAttribute('placeholder', 'Visi teisės aktai');
    expect(screen.getByRole('combobox', { name: 'Būsena' })).toHaveTextContent('Pasiūlyta');
    expect(screen.getByRole('textbox', { name: 'Ieškoti pareigose' })).toBeInTheDocument();
    const row = await rowOf(AI_RISK.title);
    expect(cell(row, 'category')).toHaveTextContent('DI valdysena');
    expect(cell(row, 'severity')).toHaveTextContent('Vidutinė');
    expect(cell(row, 'status')).toHaveTextContent('Pasiūlyta');
    expect(screen.getByText('Rodoma 4 iš 4')).toBeInTheDocument();
    for (const name of ['Pareiga', 'Teisės aktas', 'Nuostata', 'Sritis', 'Reikšmingumas', 'Būsena', 'Veiksmai']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    await user.click(within(row).getByRole('checkbox', { name: 'Pažymėti eilutę' }));
    const bar = await screen.findByRole('region', { name: 'Pažymėta: 1' });
    await user.click(within(bar).getByRole('button', { name: 'Patvirtinti pažymėtas' }));
    expect(await screen.findByText('Pareiga patvirtinta')).toBeInTheDocument();
  });


  it('the dialog and the empty states in Lithuanian', async () => {
    given.sequence('get', '/api/obligations', [{ body: { obligations: PROPOSED, total: 4 } }, { body: { obligations: [], total: 0 } }]);
    const { user } = renderObligations({ locale: 'lt' });
    await user.click(await screen.findByText(INCIDENTS.title));
    const dialog = await screen.findByRole('dialog', { name: 'Pareiga — DORA' });
    expect(within(dialog).getByText('Teisinis pagrindas:')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /^Pareigos tekstas/ })).toHaveValue(INCIDENTS.text);
    expect(within(dialog).getByRole('combobox', { name: 'Reikšmingumas' })).toHaveTextContent('Aukšta');
    expect(within(dialog).getByText('Išskyrė: gateway:azure/gpt-5.6-terra')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Atšaukti' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await choose(user, screen.getByRole('combobox', { name: 'Būsena' }), 'Visos');
    expect(await screen.findByText('Pareigų nėra')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the queue's list.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/obligations',
  fixture: { obligations: PROPOSED, total: PROPOSED.length },
  render: () => renderObligations(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Obligation review' }),
  loaded: async () => { await screen.findByText(AI_RISK.title); },
});
