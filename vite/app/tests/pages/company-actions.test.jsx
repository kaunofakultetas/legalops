// -----------------------------------------------------------
//  [*] Tests — CompanyActions (the actions tab)
//
//  The actions tab of /companies/:companyId against the
//  backend double, rendered in its page. GET
//  /api/companies/{id}/actions: the register under its title
//  and the sentence saying when it moves; the toggles that
//  count and filter it (everything not closed by default, the
//  late first; "closed" shows the closed; the choice in the
//  address); a row's facts — state, owner, due date and by
//  how many days it is late, priority, the report it came
//  from; the opened row — the description, the findings to
//  close with their act and provision, how each stood and the
//  "confirmed" mark with the way to the confirming report,
//  the note of a finding no report can confirm, the line of
//  an action only a person can close (also one that closes no
//  finding), and how a closed action was closed.
//
//  Keeping an action up: owner, due date, status and note in
//  one PATCH /api/actions/{id} that carries only what
//  changed, the statuses offered (never "late"), the hint
//  under the select, closing by hand needing the note first
//  and the backend's NOTE_REQUIRED saying the same, the toast
//  and the register read again. The Excel export and its
//  address in both languages. The empty register and the way
//  to the reports. The changes in the law: an act that moved,
//  its provisions and the findings to look at again, a change
//  that was not recorded, "not changed", and nothing for a
//  company without a report. Lithuanian, and the contract
//  matrices of the two lists.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const REGISTER = f.companyActions(f.ID.pavyzdys);
const LAW = f.lawChanges(f.ID.pavyzdys);
const row = (id) => REGISTER.actions.find((action) => action.id === id);

// The titles of the fixture actions
const T = Object.fromEntries(['actionRegister', 'actionMica', 'actionAmlOfficer', 'actionCorrespondent', 'actionAiLiteracy', 'actionAiRisk', 'actionIncidents', 'actionReferences']
  .map((key) => [key.replace('action', '').toLowerCase(), row(f.ID[key]).title]));

const CLOSE_NEEDS_NOTE = 'To close an action without a report\'s confirmation, give the reason in the note.';
const BY_HAND_ONLY = 'No report can confirm this action — only a person closes it, giving the reason in the note.';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderTab: the company page on its actions tab (with more
// of the address when asked); waits for the page. worldClock:
// today as the fixture world has it, so "late by" is a fixed
// number. titles: the titles of the rows shown, in order.
// rowOf: the list item of one action. open: a row opened,
// answered as the item. filter: one toggle of the filter.
// form / field: an opened row's form and its controls.
// lawSection: the "changes in the law" card.
// -----------------------------------------------------------

async function renderTab({ id = f.ID.pavyzdys, locale = 'en', search = '' } = {}) {
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${id}?tab=actions${search}`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: f.company(id).name });
  return view;
}

const worldClock = () => vi.useFakeTimers({ toFake: ['Date'], now: new Date(f.NOW) });

const list = (name = 'Actions') => screen.findByRole('list', { name });

const titles = async () => within(await list()).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

const rowOf = async (title) => (await screen.findByRole('button', { name: title })).closest('li');

async function open(user, title) {
  const item = await rowOf(title);
  await user.click(within(item).getByRole('button', { name: title }));
  return item;
}

const filter = (name) => within(screen.getByRole('group', { name: /^(Actions shown|Rodomi veiksmai)$/ })).getByRole('button', { name });

const form = (item) => within(item).getByRole('form');

const field = (item) => ({
  owner: within(form(item)).getByRole('textbox', { name: 'Owner' }),
  due: within(form(item)).getByLabelText('Due'),
  state: within(form(item)).getByRole('combobox', { name: 'State' }),
  note: within(form(item)).getByRole('textbox', { name: 'Note' }),
  save: within(form(item)).getByRole('button', { name: 'Save' }),
});

const lawSection = () => screen.findByRole('region', { name: 'Changes in the law' });







// -----------------------------------------------------------
// The register
// -----------------------------------------------------------

describe('CompanyActions — the register', () => {

  it('is the "Actions" tab of the company, right after the reports, and says when the register moves', async () => {
    await renderTab();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs.slice(tabs.indexOf('Reports'))).toEqual(['Reports', 'Actions', 'Programme', 'Chats']);
    expect(screen.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true');
    const card = await screen.findByRole('region', { name: 'Action register' });
    expect(within(card).getByText('Actions from the plans of signed-off reports. The register moves only when a report is signed off: its plan comes in, and earlier actions are checked against its findings.')).toBeInTheDocument();
  });


  it('opens on everything that is not closed, in the backend\'s order: the late first, then by due date, the done last', async () => {
    await renderTab();
    expect(await titles()).toEqual([T.register, T.airisk, T.references, T.incidents, T.ailiteracy, T.mica]);
    expect(REGISTER.actions.map((action) => action.state)).toEqual(['late', 'open', 'open', 'in_progress', 'open', 'done', 'closed', 'closed']);
  });


  it('counts the states on the toggles, the late first — words with numbers', async () => {
    await renderTab();
    await list();
    const toggles = within(screen.getByRole('group', { name: 'Actions shown' })).getAllByRole('button');
    expect(toggles.map((toggle) => toggle.textContent)).toEqual(['Not closed (6)', 'Late (1)', 'Open (3)', 'In progress (1)', 'Awaiting re-test (1)', 'Closed (2)']);
    expect(toggles.map((toggle) => toggle.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
  });


  it('counts from the rows when the answer carries no counts', async () => {
    given.json('get', '/api/companies/:companyId/actions', { actions: REGISTER.actions });
    await renderTab();
    await list();
    expect(filter('Not closed (6)')).toBeInTheDocument();
    expect(filter('Closed (2)')).toBeInTheDocument();
  });


  it('a row says where the action stands: state, owner, due date, by how many days it is late, priority and the report it came from', async () => {
    worldClock();
    await renderTab();
    const item = await rowOf(T.register);
    expect(within(item).getByText('Late', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(item).toHaveTextContent('Owner: IT vadovas');
    expect(item).toHaveTextContent('Due: 23/09/2026');
    expect(within(item).getByText('late by 4 d.')).toBeInTheDocument();
    expect(item).toHaveTextContent('Priority 2');
    expect(within(item).getByRole('link', { name: 'From the report of 08/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportEarlier}`);
  });


  it('only a late action says "late by"; each state is named in words on its chip', async () => {
    worldClock();
    await renderTab();
    expect(within(await rowOf(T.airisk)).getByText('Open', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(await rowOf(T.incidents)).getByText('In progress', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(await rowOf(T.mica)).getByText('Done, awaiting re-test', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getAllByText(/^late by/)).toHaveLength(1);
    expect(within(await rowOf(T.airisk)).getByRole('link', { name: 'From the report of 21/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
  });


  it('an action whose report is gone has no link; one without the report\'s date names the report alone', async () => {
    given.json('get', '/api/companies/:companyId/actions', {
      ...REGISTER,
      actions: [{ ...row(f.ID.actionAiRisk), reportId: null, reportDate: null }, { ...row(f.ID.actionIncidents), reportDate: null }],
    });
    await renderTab();
    expect(within(await rowOf(T.airisk)).queryByRole('link')).toBeNull();
    expect(within(await rowOf(T.incidents)).getByRole('link', { name: 'From the report' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
  });


  it('"Closed" shows the closed, each state its own rows, and the choice goes into the address', async () => {
    const { user, router } = await renderTab();
    await list();
    await user.click(filter('Closed (2)'));
    expect(await titles()).toEqual([T.amlofficer, T.correspondent]);
    expect(filter('Closed (2)')).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.search).toBe('?tab=actions&actions.state=closed');
    expect(router.state.historyAction).toBe('REPLACE');

    await user.click(filter('Late (1)'));
    expect(await titles()).toEqual([T.register]);
    await user.click(filter('Open (3)'));
    expect(await titles()).toEqual([T.airisk, T.references, T.ailiteracy]);
    await user.click(filter('Not closed (6)'));
    expect(await titles()).toHaveLength(6);
    expect(router.state.location.search).toBe('?tab=actions');
  });


  it('the address opens the filter it names; an unknown one reads as "not closed"', async () => {
    await renderTab({ search: '&actions.state=closed' });
    expect(await titles()).toEqual([T.amlofficer, T.correspondent]);
  });


  it('an unknown filter in the address reads as "not closed"', async () => {
    await renderTab({ search: '&actions.state=everything' });
    expect(await titles()).toHaveLength(6);
    expect(filter('Not closed (6)')).toHaveAttribute('aria-pressed', 'true');
  });


  it('a filter that leaves no row says so quietly, without the warning mark on an empty "late"', async () => {
    const calm = REGISTER.actions.filter((action) => action.state !== 'late');
    given.json('get', '/api/companies/:companyId/actions', { actions: calm, counts: { ...REGISTER.counts, late: 0 } });
    const { user } = await renderTab();
    await list();
    expect(filter('Late (0)').querySelector('svg')).toBeNull();
    await user.click(filter('Late (0)'));
    expect(await screen.findByText('No such actions.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('list', { name: 'Actions' })).toBeNull();
  });


  it('a register that fails to load says so, with a retry that brings it', async () => {
    given.sequence('get', '/api/companies/:companyId/actions', [{ status: 500, body: { error: 'x', code: 'SERVER_ERROR' } }, { body: REGISTER }]);
    const { user } = await renderTab();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The action register could not be loaded');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await titles()).toHaveLength(6);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// The opened row
// -----------------------------------------------------------

describe('CompanyActions — an opened row', () => {

  it('opens to the description and the findings to close: title, act and provision, how the finding stood', async () => {
    const { user } = await renderTab();
    const item = await rowOf(T.register);
    expect(within(item).getByRole('button', { name: T.register })).toHaveAttribute('aria-expanded', 'false');
    expect(within(item).queryByText(row(f.ID.actionRegister).description)).toBeNull();
    await user.click(within(item).getByRole('button', { name: T.register }));
    expect(within(item).getByRole('button', { name: T.register })).toHaveAttribute('aria-expanded', 'true');
    expect(within(item).getByText(row(f.ID.actionRegister).description)).toBeInTheDocument();
    const closes = within(item).getByRole('heading', { level: 4, name: 'Findings to close' }).nextElementSibling;
    expect(within(closes).getAllByRole('listitem')).toHaveLength(1);
    expect(closes).toHaveTextContent('Tvarkyti IRT paslaugų sutarčių informacijos registrą');
    expect(within(closes).getByText('DORA 28 str. 3 d.')).toHaveClass('font-serif');
    expect(within(closes).getByText('In the report: Not evidenced')).toBeInTheDocument();
    expect(within(closes).queryByText(/^confirmed/)).toBeNull();
    expect(within(item).queryByText(BY_HAND_ONLY)).toBeNull();

    await user.click(within(item).getByRole('button', { name: T.register }));
    expect(within(item).queryByRole('form')).toBeNull();
  });


  it('a finding a later report found met carries "confirmed" with the date and the way to that report; the other does not', async () => {
    const { user } = await renderTab();
    const item = await open(user, T.mica);
    const [licence, safeguarding] = within(within(item).getByRole('heading', { level: 4, name: 'Findings to close' }).nextElementSibling).getAllByRole('listitem');
    expect(licence).toHaveTextContent('Gauti kriptoturto paslaugų teikėjo leidimą');
    expect(licence).toHaveTextContent('MiCA 59 str. 1 d.');
    expect(licence).toHaveTextContent('In the report: Partial');
    expect(within(licence).getByRole('link', { name: 'confirmed 22/09/2026' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(safeguarding).toHaveTextContent('In the report: Not met');
    expect(within(safeguarding).queryByRole('link')).toBeNull();
    expect(safeguarding).not.toHaveTextContent('confirmed');
  });


  it('a finding whose obligation was replaced says no report can confirm it, and its action that only a person closes it', async () => {
    const { user } = await renderTab();
    const item = await open(user, T.ailiteracy);
    expect(row(f.ID.actionAiLiteracy)).toMatchObject({ byHandOnly: true, items: [{ obligationId: null }] });
    expect(within(item).getByText('This finding\'s obligation was replaced since, because its act was read again — a later report cannot confirm it.')).toBeInTheDocument();
    expect(within(item).getByText(BY_HAND_ONLY)).toBeInTheDocument();
  });


  it('a finding of the company\'s own requirements names the policy that was read again', async () => {
    const own = { ...row(f.ID.actionAiLiteracy), items: [{ ...row(f.ID.actionAiLiteracy).items[0], sourceKind: 'internal', act: 'Atitikties politika', path: '7.2 p.' }] };
    given.json('get', '/api/companies/:companyId/actions', { ...REGISTER, actions: [own] });
    const { user } = await renderTab();
    const item = await open(user, T.ailiteracy);
    expect(within(item).getByText('The policy this requirement comes from was changed and read again since — a later report cannot confirm this finding.')).toBeInTheDocument();
    expect(within(item).queryByText(/its act was read again/)).toBeNull();
  });


  it('a long action lists its first findings and the rest when asked, and the row says how many it closes', async () => {
    const base = row(f.ID.actionAiLiteracy);
    const long = { ...base, byHandOnly: false, items: Array.from({ length: 11 }, (_, index) => ({
      ...base.items[0], obligationId: `ob-${index}`, findingId: `fi-${index}`, title: `Pareiga ${index + 1}`,
      confirmed: index === 0 ? { reportId: f.ID.reportDone, at: '2026-09-22T09:00:00+00:00' } : null })) };
    given.json('get', '/api/companies/:companyId/actions', { ...REGISTER, actions: [long, row(f.ID.actionReferences), row(f.ID.actionAiRisk)] });
    const { user } = await renderTab();
    const item = await open(user, T.ailiteracy);
    expect(item).toHaveTextContent('Findings confirmed: 1 of 11');
    const list = within(item).getByRole('heading', { level: 4, name: 'Findings to close' }).nextElementSibling;
    expect(within(list).getAllByRole('listitem').map((line) => line.firstChild.textContent)).toEqual(Array.from({ length: 8 }, (_, index) => `Pareiga ${index + 1}`));
    expect(within(item).getByText('Showing 8 of 11')).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Show all (11)' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(11);
    expect(within(item).queryByText('Showing 8 of 11')).toBeNull();
    await user.click(within(item).getByRole('button', { name: 'Show fewer' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    // A short action has no such button, one without findings no count
    expect(await rowOf(T.airisk)).toHaveTextContent(`Findings: ${row(f.ID.actionAiRisk).items.length}`);
    expect(within(await rowOf(T.airisk)).queryByRole('button', { name: /Show all/ })).toBeNull();
    expect(await rowOf(T.references)).not.toHaveTextContent('Findings:');
  });


  it('an action that closes no finding shows the "only a person closes it" line instead of an empty list', async () => {
    const { user } = await renderTab();
    const item = await open(user, T.references);
    expect(row(f.ID.actionReferences)).toMatchObject({ byHandOnly: true, items: [] });
    expect(within(item).getByText(row(f.ID.actionReferences).description)).toBeInTheDocument();
    expect(within(item).queryByRole('heading', { level: 4, name: 'Findings to close' })).toBeNull();
    expect(within(item).getByText(BY_HAND_ONLY)).toBeInTheDocument();
    expect(within(item).getByRole('form', { name: `Edit the action: ${T.references}` })).toBeInTheDocument();
  });


  it('an action closed by a later report says so, with the date and the way to that report', async () => {
    const { user } = await renderTab({ search: '&actions.state=closed' });
    const item = await open(user, T.amlofficer);
    expect(within(item).getByText('Closed', { selector: '.MuiChip-label' })).toBeInTheDocument();
    const how = within(item).getByRole('heading', { level: 4, name: 'How it was closed' }).nextElementSibling;
    expect(how).toHaveTextContent('Confirmed by a later report, 22/09/2026.');
    expect(within(how).getByRole('link', { name: 'Open the report' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(within(item).getByRole('link', { name: 'confirmed 22/09/2026' })).toBeInTheDocument();
  });


  it('what a report closed is not reopened by hand: the status is off and the hint says where to dispute it', async () => {
    const { user } = await renderTab({ search: '&actions.state=closed' });
    const item = await open(user, T.amlofficer);
    const fields = field(item);
    expect(fields.state).toBeDisabled();
    expect(fields.state).toHaveValue('closed');
    const hint = within(item).getByText('A signed-off report closed this action, so its state is not changed by hand. If you disagree with the closure, change the finding in that report — its sign-off is withdrawn and the action goes back to work.');
    expect(fields.state).toHaveAttribute('aria-describedby', hint.id);
    expect(within(item).queryByText(/awaiting the re-test; a later signed-off report/)).toBeNull();
    // The rest of the form is still the person's
    expect(fields.owner).toBeEnabled();
    expect(fields.note).toBeEnabled();
    // A closure by hand is the person's own, and theirs to take back
    const manual = await open(user, T.correspondent);
    expect(field(manual).state).toBeEnabled();
  });


  it('an action closed by hand names who closed it and when, and its note gives the reason', async () => {
    const { user } = await renderTab({ search: '&actions.state=closed' });
    const item = await open(user, T.correspondent);
    const how = within(item).getByRole('heading', { level: 4, name: 'How it was closed' }).nextElementSibling;
    expect(how).toHaveTextContent('Closed by a person — Rūta Administratorė, 15/09/2026.');
    expect(within(how).queryByRole('link')).toBeNull();
    expect(field(item).note).toHaveValue(row(f.ID.actionCorrespondent).note);
    expect(field(item).state).toHaveValue('closed');
  });


  it('a hand-closed action the backend does not name says "by a person" alone', async () => {
    given.json('get', '/api/companies/:companyId/actions', { ...REGISTER, actions: [{ ...row(f.ID.actionCorrespondent), closedByName: null }] });
    const { user } = await renderTab({ search: '&actions.state=closed' });
    const item = await open(user, T.correspondent);
    expect(within(item).getByText('Closed by a person, 15/09/2026.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Keeping an action up
// -----------------------------------------------------------

describe('CompanyActions — editing an action', () => {

  it('offers the owner, the due date, the status — never "late" — and the note, with the save off until something changes', async () => {
    const { user } = await renderTab();
    const item = await open(user, T.register);
    const fields = field(item);
    expect(fields.owner).toHaveValue('IT vadovas');
    expect(fields.due).toHaveValue('2026-09-23');
    expect(fields.due).toHaveAttribute('type', 'date');
    // A late action is "in progress" to the person who keeps it
    expect(fields.state).toHaveValue('in_progress');
    expect(within(fields.state).getAllByRole('option').map((option) => option.textContent)).toEqual(['Open', 'In progress', 'Done, awaiting re-test', 'Closed']);
    expect(fields.note).toHaveValue(row(f.ID.actionRegister).note);
    expect(fields.save).toBeDisabled();
    expect(within(item).queryByRole('button', { name: 'Discard changes' })).toBeNull();
  });


  it('says under the status what "done" means, tied to the select', async () => {
    const { user } = await renderTab();
    const item = await open(user, T.airisk);
    const hint = within(item).getByText('“Done” means carried out and awaiting the re-test; a later signed-off report that finds the obligations met closes it. A report made after that which still finds an obligation open sends the action back to work.');
    expect(field(item).state).toHaveAttribute('aria-describedby', hint.id);
  });


  it('saves in one PATCH what changed and nothing else, toasts and reads the register again', async () => {
    const lists = given.spy('get', '/api/companies/:companyId/actions');
    const patches = given.spy('patch', '/api/actions/:actionId');
    const { user } = await renderTab();
    const item = await open(user, T.airisk);
    const fields = field(item);
    await user.clear(fields.owner);
    await user.type(fields.owner, '  Rizikos vadovė ');
    fireEvent.change(fields.due, { target: { value: '2026-10-20' } });
    await user.selectOptions(fields.state, 'in_progress');
    expect(fields.save).toBeEnabled();
    await user.click(fields.save);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(`http://localhost:3000/api/actions/${f.ID.actionAiRisk}`);
    expect(patches[0].body).toEqual({ owner: 'Rizikos vadovė', dueDate: '2026-10-20', status: 'in_progress' });
    expect(await screen.findByText('Action saved')).toBeInTheDocument();
    await waitFor(() => expect(lists.length).toBeGreaterThanOrEqual(2));
  });


  it('a note alone travels alone, trimmed', async () => {
    const patches = given.spy('patch', '/api/actions/:actionId');
    const { user } = await renderTab();
    const item = await open(user, T.incidents);
    await user.type(field(item).note, 'Procedūros projektas parengtas. ');
    await user.click(field(item).save);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ note: 'Procedūros projektas parengtas.' });
  });


  it('"Discard changes" forgets what was typed and sends nothing', async () => {
    const patches = given.spy('patch', '/api/actions/:actionId');
    const { user } = await renderTab();
    const item = await open(user, T.airisk);
    await user.type(field(item).owner, ' ir IT vadovas');
    await user.click(within(item).getByRole('button', { name: 'Discard changes' }));
    expect(field(item).owner).toHaveValue('Atitikties pareigūnas');
    expect(field(item).save).toBeDisabled();
    expect(patches).toHaveLength(0);
  });


  it('closing by hand needs the note first: the save stays off and the note field says what is asked', async () => {
    const patches = given.spy('patch', '/api/actions/:actionId');
    const { user } = await renderTab();
    const item = await open(user, T.airisk);
    await user.selectOptions(field(item).state, 'closed');
    expect(field(item).save).toBeDisabled();
    expect(within(item).getByText(CLOSE_NEEDS_NOTE)).toBeInTheDocument();
    expect(field(item).note).toBeRequired();
    expect(field(item).note).toHaveAccessibleDescription(CLOSE_NEEDS_NOTE);

    await user.type(field(item).note, 'Modelis nebenaudojamas nuo 2026-09-25.');
    expect(within(item).queryByText(CLOSE_NEEDS_NOTE)).toBeNull();
    await user.click(field(item).save);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ status: 'closed', note: 'Modelis nebenaudojamas nuo 2026-09-25.' });
    expect(await screen.findByText('Action saved')).toBeInTheDocument();
  });


  it('an action that already has a note can be closed at once; "done" never asks for one', async () => {
    const { user } = await renderTab();
    const item = await open(user, T.register);
    await user.selectOptions(field(item).state, 'closed');
    expect(field(item).save).toBeEnabled();
    expect(within(item).queryByText(CLOSE_NEEDS_NOTE)).toBeNull();
    const other = await open(user, T.airisk);
    await user.selectOptions(field(other).state, 'done');
    expect(field(other).save).toBeEnabled();
  });


  it('the backend\'s NOTE_REQUIRED reads the same sentence, in the row, and the edit stays', async () => {
    given.apiError('patch', '/api/actions/:actionId', 'NOTE_REQUIRED', { status: 400, error: 'Say in the note why the action is closed without a report\'s confirmation' });
    const { user } = await renderTab();
    const item = await open(user, T.register);
    await user.selectOptions(field(item).state, 'closed');
    await user.click(field(item).save);
    expect(await within(item).findByRole('alert')).toHaveTextContent(CLOSE_NEEDS_NOTE);
    expect(screen.getAllByText(CLOSE_NEEDS_NOTE)).toHaveLength(1);
    expect(field(item).state).toHaveValue('closed');
    // The refusal goes with the next edit
    await user.selectOptions(field(item).state, 'done');
    expect(within(item).queryByRole('alert')).toBeNull();
  });


  it('any other refusal is said in the row too, without a toast', async () => {
    given.apiError('patch', '/api/actions/:actionId', 'SERVER_ERROR', { status: 500 });
    const { user } = await renderTab();
    const item = await open(user, T.airisk);
    await user.selectOptions(field(item).state, 'done');
    await user.click(field(item).save);
    expect(await within(item).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(screen.getAllByText('Server error. Try again later.')).toHaveLength(1);
    expect(field(item).save).toBeEnabled();
  });


  it('the default backend refuses a closure without a note, stamps one with a note and works the state out again', async () => {
    const patch = (id, body) => fetch(`http://localhost:3000/api/actions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const refused = await patch(f.ID.actionAiRisk, { status: 'closed' });
    expect(refused.status).toBe(400);
    expect((await refused.json()).code).toBe('NOTE_REQUIRED');
    const closed = await (await patch(f.ID.actionAiRisk, { status: 'closed', note: ' Nebeaktualu. ' })).json();
    expect(closed).toMatchObject({ status: 'closed', state: 'closed', note: 'Nebeaktualu.', closedHow: 'manual', closedByName: f.me.displayName, closedAt: f.NOW, confirmedReportId: null });
    // An open action given a due date in the past is late; a
    // closure by hand is taken back by hand, a report's is
    // not; "late" is no status
    expect(await (await patch(f.ID.actionAiRisk, { dueDate: '2026-09-01' })).json()).toMatchObject({ status: 'open', state: 'late' });
    expect(await (await patch(f.ID.actionCorrespondent, { status: 'in_progress' })).json()).toMatchObject({ status: 'in_progress', closedHow: null, closedAt: null, confirmedReportId: null });
    const kept = await patch(f.ID.actionAmlOfficer, { status: 'in_progress' });
    expect(kept.status).toBe(409);
    expect((await kept.json()).code).toBe('CLOSED_BY_REPORT');
    expect((await (await patch(f.ID.actionAiRisk, { status: 'late' })).json()).code).toBe('INVALID_FIELD');
    expect((await patch('ac000000-0000-4000-8000-0000000000aa', { owner: 'x' })).status).toBe(404);
  });
});







// -----------------------------------------------------------
// The export
// -----------------------------------------------------------

describe('CompanyActions — the Excel export', () => {

  const downloads = () => {
    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ href: this.href, download: this.download });
    });
    return clicks;
  };


  it('downloads the register in the interface language under the server\'s name and toasts it', async () => {
    const clicks = downloads();
    const calls = given.spy('get', '/api/companies/:companyId/actions/export');
    const { user } = await renderTab();
    await list();
    await user.click(screen.getByRole('button', { name: 'Download the action register as Excel' }));
    expect(await screen.findByText('Downloaded: actions-UAB-Pavyzdys-2026-09-27.xlsx')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(`/api/companies/${f.ID.pavyzdys}/actions/export`);
    expect(calls[0].query).toEqual({ language: 'en' });
    expect(clicks).toEqual([{ href: 'blob:test', download: 'actions-UAB-Pavyzdys-2026-09-27.xlsx' }]);
  });


  it('asks for the Lithuanian workbook from the Lithuanian interface', async () => {
    downloads();
    const calls = given.spy('get', '/api/companies/:companyId/actions/export');
    const { user } = await renderTab({ locale: 'lt' });
    await list('Veiksmai');
    await user.click(screen.getByRole('button', { name: 'Atsisiųsti veiksmų registrą Excel formatu' }));
    expect(await screen.findByText('Atsisiųsta: actions-UAB-Pavyzdys-2026-09-27.xlsx')).toBeInTheDocument();
    expect(calls[0].query).toEqual({ language: 'lt' });
  });


  it('a failed download toasts the translated reason and saves nothing', async () => {
    const clicks = downloads();
    given.apiError('get', '/api/companies/:companyId/actions/export', 'NOT_FOUND', { status: 404 });
    const { user } = await renderTab();
    await list();
    await user.click(screen.getByRole('button', { name: 'Download the action register as Excel' }));
    expect(await screen.findByText('The download failed: Not found — it may have been deleted.')).toBeInTheDocument();
    expect(clicks).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download the action register as Excel' })).toBeEnabled());
  });
});







// -----------------------------------------------------------
// The empty register
// -----------------------------------------------------------

describe('CompanyActions — an empty register', () => {

  it('says how the register fills and points to the company\'s reports — no filter, no export, no changes in the law', async () => {
    await renderTab({ id: f.ID.kreditas });
    const panel = screen.getByRole('tabpanel');
    expect(await within(panel).findByText('The register is empty')).toBeInTheDocument();
    expect(within(panel).getByText('Sign a finished report off — its action plan will appear here.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'The company\'s reports' })).toHaveAttribute('href', `/companies/${f.ID.kreditas}?tab=reports`);
    expect(within(panel).queryByRole('group')).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Download the action register as Excel' })).toBeNull();
    await settle(50);
    expect(within(panel).queryByRole('region', { name: 'Changes in the law' })).toBeNull();
  });


  it('the link opens the reports tab of the same company', async () => {
    const { user, router } = await renderTab({ id: f.ID.kreditas });
    await user.click(await screen.findByRole('link', { name: 'The company\'s reports' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true'));
    expect(router.state.location.search).toBe('?tab=reports');
  });
});







// -----------------------------------------------------------
// The changes in the law
// -----------------------------------------------------------

describe('CompanyActions — the changes in the law', () => {

  const [MICA] = LAW.acts;


  it('names an act that moved: the version assessed and the one in force, what changed, was added and removed', async () => {
    await renderTab();
    const card = await lawSection();
    expect(within(card).getByText('The acts assessed that changed after the last report (21/09/2026), and the findings worth another look.')).toBeInTheDocument();
    const act = within(card).getByRole('heading', { level: 3, name: 'MiCA' }).closest('li');
    expect(within(act).getByRole('link', { name: 'MiCA' })).toHaveAttribute('href', `/corpus/${f.ID.mica}`);
    expect(within(act).getByText('assessed v1, now v2 (09/01/2024)')).toBeInTheDocument();
    expect(within(act).getAllByRole('term').map((term) => `${term.textContent} ${term.nextElementSibling.textContent}`))
      .toEqual(['Changed: 59 str., 70 str.', 'Added: 75 str.', 'Removed: 66 str.']);
    expect(within(act).queryByText('The act changed, but which provisions was not recorded.')).toBeNull();
  });


  it('lists the findings to look at again — verdict in words, provision, and the way to the finding in its report', async () => {
    await renderTab();
    const card = await lawSection();
    const review = within(card).getByRole('heading', { level: 4, name: 'Findings to review' }).nextElementSibling;
    const items = within(review).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Apsaugoti klientų kriptoturtą ir lėšas70 str. 1 d.Not met',
      'Gauti kriptoturto paslaugų teikėjo leidimą59 str. 1 d.Met',
    ]);
    const target = new URLSearchParams({ tab: 'findings', 'findings.q': 'Apsaugoti klientų kriptoturtą ir lėšas' });
    expect(within(items[0]).getByRole('link', { name: 'Apsaugoti klientų kriptoturtą ir lėšas' })).toHaveAttribute('href', `/reports/${f.ID.reportDone}?${target}`);
    expect(MICA.findings.map((finding) => finding.id)).toEqual([f.ID.findingSafeguarding, f.ID.findingLicence]);
  });


  it('an act whose change was not recorded says so instead of showing empty lists', async () => {
    given.json('get', '/api/companies/:companyId/law-changes', { ...LAW, acts: [{ ...MICA, recorded: false, changed: [], added: [], removed: [], findings: [] }] });
    await renderTab();
    const card = await lawSection();
    expect(within(card).getByText('The act changed, but which provisions was not recorded.')).toBeInTheDocument();
    expect(within(card).queryByRole('term')).toBeNull();
    expect(within(card).queryByRole('heading', { level: 4 })).toBeNull();
    expect(within(card).getByText('assessed v1, now v2 (09/01/2024)')).toBeInTheDocument();
  });


  it('a long list of provisions names the first twelve and counts the rest', async () => {
    const changed = Array.from({ length: 15 }, (_, index) => `${index + 1} str.`);
    given.json('get', '/api/companies/:companyId/law-changes', { ...LAW, acts: [{ ...MICA, changed, added: [], removed: [] }] });
    await renderTab();
    const card = await lawSection();
    expect(within(card).getByRole('term').nextElementSibling).toHaveTextContent(`${changed.slice(0, 12).join(', ')} and 3 more`);
  });


  it('when the acts under the last report have not moved, one quiet line says so', async () => {
    given.json('get', '/api/companies/:companyId/law-changes', { ...LAW, acts: [] });
    await renderTab();
    const card = await lawSection();
    expect(within(card).getByText('The acts assessed have not changed since the last report (21/09/2026).')).toBeInTheDocument();
    expect(within(card).queryByRole('list')).toBeNull();
  });


  it('a company without a finished report shows nothing of it — also under a register that has actions', async () => {
    given.json('get', '/api/companies/:companyId/law-changes', { reportId: null, reportDate: null, acts: [] });
    await renderTab();
    await list();
    await settle(50);
    expect(screen.queryByRole('region', { name: 'Changes in the law' })).toBeNull();
    expect(screen.queryByText(/have not changed since/)).toBeNull();
  });


  it('a failed load says so under the register, which still stands; the retry brings the changes', async () => {
    given.sequence('get', '/api/companies/:companyId/law-changes', [{ status: 500, body: { error: 'x', code: 'SERVER_ERROR' } }, { body: LAW }]);
    const { user } = await renderTab();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The changes in the law could not be loaded');
    expect(await titles()).toHaveLength(6);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(await lawSection()).findByRole('link', { name: 'MiCA' })).toBeInTheDocument();
  });


  it('the default backend answers a company without a report with nothing to compare', async () => {
    const answer = await (await fetch(`http://localhost:3000/api/companies/${f.ID.kreditas}/law-changes`)).json();
    expect(answer).toEqual({ reportId: null, reportDate: null, acts: [] });
    expect(LAW).toMatchObject({ reportId: f.ID.reportDone, reportDate: '2026-09-21', acts: [{ act: 'MiCA', assessedVersion: 1, currentVersion: 2, recorded: true }] });
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('CompanyActions in Lithuanian', () => {

  it('speaks Lithuanian: the card, the toggles, a row, the opened row and its form', async () => {
    worldClock();
    const { user } = await renderTab({ locale: 'lt' });
    expect(screen.getByRole('tab', { name: 'Veiksmai' })).toHaveAttribute('aria-selected', 'true');
    const card = await screen.findByRole('region', { name: 'Veiksmų registras' });
    expect(within(card).getByText('Veiksmai iš patvirtintų ataskaitų planų. Registras keičiasi tik patvirtinus ataskaitą: naujos ataskaitos planas įtraukiamas, o ankstesni veiksmai patikrinami pagal jos išvadas.')).toBeInTheDocument();
    await list('Veiksmai');
    expect(within(screen.getByRole('group', { name: 'Rodomi veiksmai' })).getAllByRole('button').map((toggle) => toggle.textContent))
      .toEqual(['Neuždaryti (6)', 'Vėluoja (1)', 'Atviri (3)', 'Vykdomi (1)', 'Laukia patikros (1)', 'Uždaryti (2)']);

    const late = await rowOf(T.register);
    expect(within(late).getByText('Vėluojantis', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(late).toHaveTextContent('Atsakingas: IT vadovas');
    expect(late).toHaveTextContent('Terminas: 2026-09-23');
    expect(within(late).getByText('vėluoja 4 d.')).toBeInTheDocument();
    expect(late).toHaveTextContent('Prioritetas 2');
    expect(within(late).getByRole('link', { name: 'Iš 2026-09-08 ataskaitos' })).toBeInTheDocument();

    const done = await rowOf(T.mica);
    expect(within(done).getByText('Įvykdytas, laukia patikros', { selector: '.MuiChip-label' })).toBeInTheDocument();
    await user.click(within(done).getByRole('button', { name: T.mica }));
    expect(within(done).getByRole('heading', { level: 4, name: 'Šalinamos išvados' })).toBeInTheDocument();
    expect(within(done).getByText('Vertinimas ataskaitoje: Iš dalies')).toBeInTheDocument();
    expect(within(done).getByRole('link', { name: 'patvirtinta 2026-09-22' })).toBeInTheDocument();
    const fields = within(within(done).getByRole('form', { name: `Keisti veiksmą: ${T.mica}` }));
    expect(fields.getByRole('textbox', { name: 'Atsakingas' })).toBeInTheDocument();
    expect(fields.getByLabelText('Terminas')).toHaveValue('2026-10-09');
    expect(within(fields.getByRole('combobox', { name: 'Būsena' })).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Atviras', 'Vykdomas', 'Įvykdytas, laukia patikros', 'Uždarytas']);
    expect(fields.getByText('„Įvykdytas“ reiškia, kad veiksmas atliktas ir laukia patikros; uždaro jį vėlesnė patvirtinta ataskaita, radusi pareigas įvykdytas. Jei po to parengta ataskaita pareigą vis dar randa neįvykdytą, veiksmas grįžta į darbą.')).toBeInTheDocument();
    await user.selectOptions(fields.getByRole('combobox', { name: 'Būsena' }), 'open');
    expect(fields.getByRole('button', { name: 'Išsaugoti' })).toBeEnabled();
  });


  it('closing by hand, the note of a replaced obligation and the closures, in Lithuanian', async () => {
    const { user } = await renderTab({ locale: 'lt' });
    const open3 = await rowOf(T.airisk);
    await user.click(within(open3).getByRole('button', { name: T.airisk }));
    await user.selectOptions(within(open3).getByRole('combobox', { name: 'Būsena' }), 'closed');
    expect(within(open3).getByText('Uždarant veiksmą be ataskaitos patvirtinimo, pastaboje nurodykite priežastį.')).toBeInTheDocument();
    expect(within(open3).getByRole('button', { name: 'Išsaugoti' })).toBeDisabled();

    const replaced = await rowOf(T.ailiteracy);
    await user.click(within(replaced).getByRole('button', { name: T.ailiteracy }));
    expect(within(replaced).getByText('Šios išvados pareiga po to pakeista, nes teisės aktas perskaitytas iš naujo — vėlesnė ataskaita jos patvirtinti negali.')).toBeInTheDocument();
    expect(within(replaced).getByText('Šio veiksmo ataskaita patvirtinti negali — jį uždaro tik žmogus, pastaboje nurodęs priežastį.')).toBeInTheDocument();

    await user.click(filter('Uždaryti (2)'));
    const confirmed = await rowOf(T.amlofficer);
    await user.click(within(confirmed).getByRole('button', { name: T.amlofficer }));
    expect(within(confirmed).getByRole('heading', { level: 4, name: 'Kaip uždaryta' }).nextElementSibling).toHaveTextContent('Patvirtino vėlesnė ataskaita, 2026-09-22.');
    const manual = await rowOf(T.correspondent);
    await user.click(within(manual).getByRole('button', { name: T.correspondent }));
    expect(within(manual).getByText('Uždarė asmuo — Rūta Administratorė, 2026-09-15.')).toBeInTheDocument();
  });


  it('the empty register and the changes in the law, in Lithuanian', async () => {
    await renderTab({ locale: 'lt' });
    const card = await screen.findByRole('region', { name: 'Teisės aktų pokyčiai' });
    expect(within(card).getByText('vertinta v1, dabar v2 (2024-01-09)')).toBeInTheDocument();
    expect(within(card).getAllByRole('term').map((term) => term.textContent)).toEqual(['Pakeista:', 'Pridėta:', 'Panaikinta:']);
    expect(within(card).getByRole('heading', { level: 4, name: 'Peržiūrėtinos išvados' })).toBeInTheDocument();
    expect(within(card).getByText('Neatitinka')).toBeInTheDocument();
  });


  it('says the register is empty, the law unchanged and a change unrecorded, in Lithuanian', async () => {
    given.json('get', '/api/companies/:companyId/actions', { actions: [], counts: {} });
    given.json('get', '/api/companies/:companyId/law-changes', { ...LAW, acts: [] });
    await renderTab({ locale: 'lt' });
    expect(await screen.findByText('Registras tuščias')).toBeInTheDocument();
    expect(screen.getByText('Patvirtinkite baigtą ataskaitą — jos veiksmų planas atsiras čia.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Įmonės ataskaitos' })).toBeInTheDocument();
    expect(await screen.findByText('Nuo paskutinės ataskaitos (2026-09-21) vertinti teisės aktai nepasikeitė.')).toBeInTheDocument();
  });


  it('says a change was not recorded, in Lithuanian', async () => {
    given.json('get', '/api/companies/:companyId/law-changes', { ...LAW, acts: [{ ...LAW.acts[0], recorded: false, changed: [], added: [], removed: [], findings: [] }] });
    await renderTab({ locale: 'lt' });
    expect(await screen.findByText('Aktas pasikeitė, bet pakeistos nuostatos neužfiksuotos.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/companies/:companyId/actions',
  fixture: REGISTER,
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=actions`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Action register' }),
  loaded: async () => { await screen.findByRole('button', { name: T.register }); },
  loading: () => screen.getByRole('tabpanel').querySelector('.MuiSkeleton-root'),
});


describeEndpointContract({
  path: '/api/companies/:companyId/law-changes',
  fixture: LAW,
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=actions`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Action register' }),
  loaded: async () => { await within(await screen.findByRole('region', { name: 'Changes in the law' })).findByRole('link', { name: 'MiCA' }); },
});
