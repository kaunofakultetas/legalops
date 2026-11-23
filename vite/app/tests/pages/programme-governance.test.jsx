// -----------------------------------------------------------
//  [*] Tests — ProductPage, a governance product
//
//  The three content tabs of a governance product against
//  the backend double. "Structure": the chart as the image
//  the backend draws — fetched with the bearer token, shown
//  through an object URL, its markup never put into the page,
//  fetched again after a save, its failure and its absence
//  said — and the nodes as a table; in a draft being edited
//  the nodes' controls, adding and removing a node. "Process
//  and RACI": the steps, and the matrix of the roles that
//  hold a letter; in a draft being edited a select per cell
//  named "<step> — <role>", a role added as a column, and the
//  golden rule marked on a step's row the moment a cell
//  breaks it, before anything is saved; then the save, and
//  the server's own verdict in the rules panel; and the
//  steps themselves as forms — a step's name, what is done,
//  frequency and basis edited, a step added at the end (no
//  letters: the golden rule's mark at once, and the server's
//  rules broken on the save), a step removed with its
//  letters. "Positions and gaps": what the documents name
//  and what they lack. And Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { signIn } from '../support/auth';
import { given } from '../support/backend/server';
import * as f from '../support/backend/fixtures';
import * as p from '../support/backend/programme';
import ProductPage from '@/pages/Programme/ProductPage';


const GOVERNANCE = p.product(f.ID.productGovernance);
const { structure: NODES, process: STEPS, raci: RACI } = GOVERNANCE.content;

// The roles that hold a letter, in the structure's order —
// the matrix's columns
const ROLES = NODES.filter((node) => RACI.some((cell) => cell.roleId === node.id));

// The second step and the role accountable for it
const STEP = STEPS[1];
const ACCOUNTABLE = NODES.find((node) => node.id === RACI.find((cell) => cell.stepId === STEP.id && cell.value === 'A').roleId);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderGovernance: the draft's page on a tab. startEditing:
// the same with "Edit" pressed. matrix: the RACI table (the
// second table of its tab). rowOf: a step's row of the
// matrix. cell: the select of a step and a role. save: press
// "Save changes" and hand back the one PUT's content.
// stepForm: the form of the step with that number.
// write: puts a text into a field in one change — a paste
// where typing would make a change, and a render of the
// whole form, for every letter.
// -----------------------------------------------------------

function renderGovernance({ tab = '', ...options } = {}) {
  return renderPage(<ProductPage authData={authData} />, { route: `/programme/${f.ID.productGovernance}${tab ? `?tab=${tab}` : ''}`, path: '/programme/:productId', ...options });
}

async function startEditing(options) {
  const view = renderGovernance(options);
  await view.user.click(await screen.findByRole('button', { name: 'Edit' }));
  return view;
}

const matrix = () => within(screen.getByRole('heading', { name: /^RACI (matrix|matrica)$/ }).closest('section')).getByRole('table');

const rowOf = (step) => within(matrix()).getByRole('row', { name: new RegExp(step.name) });

const cell = (step, role) => screen.getByRole('combobox', { name: `${step.name} — ${role.name}` });

const stepForm = (number) => screen.getByRole('region', { name: new RegExp(`^${number}\\. `) });

async function write(user, field, text) {
  await user.click(field);
  await user.paste(text);
}

async function save(user, puts) {
  await user.click(await screen.findByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  await screen.findByText('Changes saved');
  return puts[0].body.content;
}







// -----------------------------------------------------------
// The structure
// -----------------------------------------------------------

describe('a governance product — the structure tab', () => {

  it('shows the chart as the backend\'s image: fetched with the bearer token, through an object URL, never as markup in the page', async () => {
    signIn('chart-token');
    const calls = given.spy('get', '/api/programme/:productId/chart');
    renderGovernance();
    const image = await screen.findByRole('img', { name: 'Chart of the governance structure; the table under it lists the same nodes.' });
    expect(image).toHaveAttribute('src', 'blob:test');
    expect(image.tagName).toBe('IMG');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productGovernance}/chart`);
    expect(calls[0].headers.authorization).toBe('Bearer chart-token');
    // The drawing's own elements are nowhere in the document
    expect(screen.getByRole('tabpanel').querySelector('rect, path[d^="M"][stroke="#A9B3C1"]')).toBeNull();
    // It scrolls inside its sheet
    expect(image.parentElement).toHaveClass('overflow-x-auto');
  });


  it('the default chart route answers an SVG image, and 404 for a product without a structure', async () => {
    const drawn = await fetch(`http://localhost:3000/api/programme/${f.ID.productGovernance}/chart`);
    expect(drawn.headers.get('content-type')).toBe('image/svg+xml');
    expect(await drawn.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    const none = await fetch(`http://localhost:3000/api/programme/${f.ID.productPolicy}/chart`);
    expect(none.status).toBe(404);
    expect((await none.json()).code).toBe('NOT_FOUND');
  });


  it('a chart that cannot be loaded says so, with a retry — the table stays', async () => {
    given.apiError('get', '/api/programme/:productId/chart', 'SERVER_ERROR', { status: 500 });
    renderGovernance();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The chart of the structure could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Nodes of the structure' })).toBeInTheDocument();
  });


  it('a product without a structure asks for no chart and says there is none', async () => {
    const calls = given.spy('get', '/api/programme/:productId/chart');
    given.json('get', '/api/programme/:productId', { ...GOVERNANCE, content: { ...GOVERNANCE.content, structure: [], raci: [] } });
    renderGovernance();
    expect(await screen.findByText('There is no structure yet.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });


  it('lists the nodes: name, kind, line, the node each reports to, proposed in words, the note', async () => {
    renderGovernance();
    const table = within((await screen.findByRole('heading', { name: 'Nodes of the structure' })).closest('section')).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Name', 'Kind', 'Line', 'Reports to', 'Proposed', 'Note']);
    const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((item) => item.textContent));
    expect(rows.map((row) => row.slice(0, 5))).toEqual([
      ['Valdyba', 'Body', 'Governing body', '—', 'No'],
      ['Generalinis direktorius (CEO)', 'Function', 'First line', 'Valdyba', 'No'],
      ['Atitikties pareigūnas', 'Function', 'Second line', 'Valdyba', 'No'],
      ['Rizikos pareigūnas', 'Function', 'Second line', 'Valdyba', 'No'],
      ['Vidaus auditas', 'Function', 'Third line', 'Valdyba', 'No'],
      ['Operacijų padalinys', 'Unit', 'First line', 'Generalinis direktorius (CEO)', 'No'],
      ['Finansų apskaitos funkcija', 'Function', 'First line', 'Generalinis direktorius (CEO)', 'Yes'],
    ]);
    expect(rows[0][5]).toBe(NODES[0].note);
  });


  it('edits a node, adds one and removes one; the save PUTs the structure, and the chart is fetched again for the saved product', async () => {
    const charts = given.spy('get', '/api/programme/:productId/chart');
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await screen.findByRole('img');
    expect(charts).toHaveLength(1);

    const name = screen.getByRole('textbox', { name: 'Name: Rizikos pareigūnas' });
    await user.clear(name);
    await write(user, name, 'Rizikos valdymo pareigūnas');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Line: Vidaus auditas' }), 'External');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Reports to: Operacijų padalinys' }), 'Valdyba');
    await user.click(screen.getByRole('checkbox', { name: 'Proposed: Operacijų padalinys' }));
    await user.click(screen.getByRole('button', { name: 'Add a node' }));
    await write(user, screen.getByRole('textbox', { name: 'Name: New node' }), 'Teisės skyrius');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind: Teisės skyrius' }), 'Unit');
    await user.click(screen.getByRole('button', { name: 'Remove the node “Finansų apskaitos funkcija”' }));
    // The chart on screen is still the saved one, and the page says so
    expect(screen.getByText('The chart is drawn again when you save the changes.')).toBeInTheDocument();
    expect(charts).toHaveLength(1);

    const sent = await save(user, puts);
    expect(sent.structure.map((node) => node.name)).toEqual([
      'Valdyba', 'Generalinis direktorius (CEO)', 'Atitikties pareigūnas', 'Rizikos valdymo pareigūnas', 'Vidaus auditas', 'Operacijų padalinys', 'Teisės skyrius',
    ]);
    expect(sent.structure[4]).toMatchObject({ id: 'n8', line: 'external' });
    expect(sent.structure[5]).toMatchObject({ id: 'n19', parentId: 'n1', proposed: true });
    expect(sent.structure[6]).toEqual({ id: 'n21', name: 'Teisės skyrius', kind: 'unit', line: 'first', parentId: null, proposed: true, note: '' });
    // The removed node's letters went with it
    expect(sent.raci.some((entry) => entry.roleId === 'n20')).toBe(false);
    expect(sent.raci).toHaveLength(RACI.filter((entry) => entry.roleId !== 'n20').length);
    expect(sent.process).toEqual(STEPS);
    // The product was edited: its chart is another image now
    await waitFor(() => expect(charts).toHaveLength(2));
    expect(screen.queryByText('The chart is drawn again when you save the changes.')).toBeNull();
  });
});







// -----------------------------------------------------------
// The process and the matrix
// -----------------------------------------------------------

describe('a governance product — the process and RACI tab', () => {

  it('lists the steps in order: what is done, how often, and what each rests on', async () => {
    renderGovernance({ tab: 'raci' });
    const table = within((await screen.findByRole('heading', { name: 'Compliance management process' })).closest('section')).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(STEPS.length);
    const cells = within(rows[1]).getAllByRole('cell').map((item) => item.textContent);
    expect(cells).toEqual(['2', `${STEP.name}${STEP.description}`, STEP.frequency, 'ISO 37301 4.6LB gairės 53']);
  });


  it('draws the matrix: steps down, the roles that hold a letter across, each cell its letter — the accountable one in ink, the responsible one pale blue', async () => {
    renderGovernance({ tab: 'raci' });
    await screen.findByRole('heading', { name: 'RACI matrix' });
    expect(screen.getByText('R — responsible, A — accountable, AR — both, C — consulted, I — informed')).toBeInTheDocument();
    expect(within(matrix()).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Step', ...ROLES.map((role) => role.name)]);
    expect(ROLES.map((role) => role.name)).not.toContain('Vidaus auditas');
    const letters = (step) => within(rowOf(step)).getAllByRole('cell').map((item) => item.textContent);
    expect(letters(STEPS[0])).toEqual(['', 'I', 'AR', '', '', '']);
    expect(letters(STEPS[3])).toEqual(['', 'A', 'C', '', 'R', 'R']);
    const [, accountable, consulted, , responsible] = within(rowOf(STEPS[3])).getAllByRole('cell');
    expect(accountable).toHaveStyle({ backgroundColor: '#173A6E', color: '#FFFFFF' });
    expect(responsible).toHaveStyle({ backgroundColor: '#C9D9EF' });
    expect(consulted.getAttribute('style')).toBeNull();
    // "AR" answers for the step too
    expect(within(rowOf(STEPS[0])).getAllByRole('cell')[2]).toHaveStyle({ backgroundColor: '#173A6E' });
    // Every step keeps the golden rule: no mark anywhere
    expect(within(matrix()).queryByText(/accountable role \(A\) is needed/)).toBeNull();
  });


  it('a read-only matrix marks a step that breaks the golden rule too', async () => {
    const broken = RACI.filter((entry) => !(entry.stepId === STEP.id && entry.value === 'A'));
    given.json('get', '/api/programme/:productId', { ...GOVERNANCE, content: { ...GOVERNANCE.content, raci: broken } });
    renderGovernance({ tab: 'raci' });
    await screen.findByRole('heading', { name: 'RACI matrix' });
    expect(within(rowOf(STEP)).getByRole('status')).toHaveTextContent('Exactly one accountable role (A) is needed — there are 0 now.');
    expect(within(rowOf(STEPS[0])).getByRole('status')).toBeEmptyDOMElement();
  });


  it('in edit mode every cell is a select named "<step> — <role>" with the five letters and none', async () => {
    await startEditing({ tab: 'raci' });
    const select = cell(STEP, ACCOUNTABLE);
    expect(select).toHaveDisplayValue('A');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['—', 'R', 'A', 'AR', 'C', 'I']);
    expect(within(matrix()).getAllByRole('combobox')).toHaveLength(STEPS.length * ROLES.length);
    expect(cell(STEPS[0], ROLES[0])).toHaveDisplayValue('—');
  });


  it('marks the golden rule on the step\'s row the moment a cell breaks it — before anything is saved', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'raci' });
    const mark = () => within(rowOf(STEP)).getByRole('status');
    expect(mark()).toBeEmptyDOMElement();

    // No accountable role
    await user.selectOptions(cell(STEP, ACCOUNTABLE), 'C');
    expect(mark()).toHaveTextContent('Exactly one accountable role (A) is needed — there are 0 now.');
    // Two of them
    await user.selectOptions(cell(STEP, ACCOUNTABLE), 'A');
    expect(mark()).toBeEmptyDOMElement();
    await user.selectOptions(cell(STEP, ROLES[0]), 'AR');
    expect(mark()).toHaveTextContent('Exactly one accountable role (A) is needed — there are 2 now.');
    await user.selectOptions(cell(STEP, ROLES[0]), '—');
    expect(mark()).toBeEmptyDOMElement();
    // Nobody responsible: the step's one "R" goes
    const responsible = NODES.find((node) => node.id === RACI.find((entry) => entry.stepId === STEP.id && entry.value === 'R').roleId);
    await user.selectOptions(cell(STEP, responsible), 'I');
    expect(mark()).toHaveTextContent('At least one responsible role (R) is needed.');
    // The other steps are untouched, and nothing was sent
    expect(within(rowOf(STEPS[0])).getByRole('status')).toBeEmptyDOMElement();
    expect(puts).toHaveLength(0);
    // The server's own verdict is still the saved one
    expect(within(screen.getByRole('region', { name: 'Rules' })).getAllByRole('status')[0]).toHaveTextContent('Every blocking rule is kept');
  });


  it('saving a matrix that breaks the golden rule PUTs the cells and shows the server\'s verdict: the rule broken, the approval off', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'raci' });
    await user.selectOptions(cell(STEP, ACCOUNTABLE), 'C');
    await user.selectOptions(cell(STEPS[0], ROLES[0]), 'I');
    const sent = await save(user, puts);
    expect(sent.raci).toHaveLength(RACI.length + 1);
    expect(sent.raci).toContainEqual({ stepId: STEP.id, roleId: ACCOUNTABLE.id, value: 'C' });
    expect(sent.raci).toContainEqual({ stepId: STEPS[0].id, roleId: ROLES[0].id, value: 'I' });
    expect(sent.structure).toEqual(NODES);

    const panel = screen.getByRole('region', { name: 'Rules' });
    expect(within(panel).getAllByRole('status')[0]).toHaveTextContent('The document cannot be approved: 1 blocking rule(s) broken.');
    expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent(`Every step has exactly one accountable role (A)— broken${STEP.name}`);
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription('It cannot be approved while a blocking rule is broken.');
    // The mark stays on the row: it is what the server found as well
    expect(within(rowOf(STEP)).getByRole('status')).toHaveTextContent('there are 0 now');
  });


  it('clearing a cell takes its letter out of the content', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'raci' });
    const consulted = NODES.find((node) => node.id === RACI.find((entry) => entry.stepId === STEP.id && entry.value === 'C').roleId);
    await user.selectOptions(cell(STEP, consulted), '—');
    const sent = await save(user, puts);
    expect(sent.raci).toHaveLength(RACI.length - 1);
    expect(sent.raci.some((entry) => entry.stepId === STEP.id && entry.roleId === consulted.id)).toBe(false);
  });


  it('a role that holds no letter is added as a column from "Add a role"', async () => {
    const { user } = await startEditing({ tab: 'raci' });
    const picker = screen.getByRole('combobox', { name: 'Add a role' });
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual(['Choose a role…', 'Vidaus auditas']);
    await user.selectOptions(picker, 'Vidaus auditas');
    expect(within(matrix()).getAllByRole('columnheader').map((header) => header.textContent)).toContain('Vidaus auditas');
    const audit = NODES.find((node) => node.name === 'Vidaus auditas');
    expect(cell(STEPS[0], audit)).toHaveDisplayValue('—');
    // Every node has its column now: nothing left to add
    expect(screen.queryByRole('combobox', { name: 'Add a role' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Editing the process
// -----------------------------------------------------------

describe('a governance product — editing the process', () => {

  it('read, the steps are a table; in edit mode each is a form named by its number and name', async () => {
    const { user } = renderGovernance({ tab: 'raci' });
    await screen.findByRole('heading', { name: 'Compliance management process' });
    expect(screen.queryByRole('textbox', { name: 'Name of the step' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByRole('textbox', { name: 'Name of the step' }).map((field) => field.value)).toEqual(STEPS.map((step) => step.name));
    const form = stepForm(2);
    expect(form).toHaveAccessibleName(`2. ${STEP.name}`);
    expect(within(form).getByRole('textbox', { name: 'What is done' })).toHaveValue(STEP.description);
    expect(within(form).getByRole('textbox', { name: 'Frequency' })).toHaveValue(STEP.frequency);
    expect(within(form).getByRole('combobox', { name: 'Source 1' })).toHaveDisplayValue('ISO 37301');
    expect(within(within(form).getByRole('combobox', { name: 'Source 2' })).getAllByRole('option').map((option) => option.textContent)).toEqual(['ISO 37301', 'LB gairės']);
    expect(within(form).getByRole('combobox', { name: 'Source 2' })).toHaveDisplayValue('LB gairės');
    expect(within(form).getByRole('textbox', { name: 'Clause 2' })).toHaveValue('53');
  });


  it('a step\'s name, what is done, frequency and basis are edited; the matrix follows the name; the PUT carries the step whole', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'raci' });
    const retype = async (name, text) => {
      const field = within(stepForm(2)).getByRole('textbox', { name });
      await user.clear(field);
      await write(user, field, text);
    };
    await retype('Name of the step', 'Atitikties rizikos vertinimas');
    expect(within(matrix()).getByRole('row', { name: /^2\. Atitikties rizikos vertinimas/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: `Atitikties rizikos vertinimas — ${ACCOUNTABLE.name}` })).toHaveDisplayValue('A');
    await retype('What is done', 'Vertinama kartą per metus.');
    await retype('Frequency', 'Kasmet');
    // The basis: the second entry moves to ISO, the first goes, a new one is added
    await user.selectOptions(within(stepForm(2)).getByRole('combobox', { name: 'Source 2' }), 'ISO 37301');
    await user.click(within(stepForm(2)).getByRole('button', { name: 'Remove basis 1' }));
    expect(within(stepForm(2)).queryByRole('combobox', { name: 'Source 2' })).toBeNull();
    await user.click(within(stepForm(2)).getByRole('button', { name: 'Add a basis' }));
    await user.selectOptions(within(stepForm(2)).getByRole('combobox', { name: 'Source 2' }), 'LB gairės');
    await write(user, within(stepForm(2)).getByRole('textbox', { name: 'Clause 2' }), '57');

    const sent = await save(user, puts);
    expect(sent.process[1]).toEqual({
      id: STEP.id, name: 'Atitikties rizikos vertinimas', description: 'Vertinama kartą per metus.', frequency: 'Kasmet',
      basis: [{ source: 'ISO 37301', ref: '53' }, { source: 'LB gairės', ref: '57' }],
    });
    expect(sent.process.filter((step) => step.id !== STEP.id)).toEqual(STEPS.filter((step) => step.id !== STEP.id));
    expect(sent.raci).toEqual(RACI);
    // Read again: the table shows the saved step
    await user.click(screen.getByRole('button', { name: 'Finish editing' }));
    const table = within(screen.getByRole('heading', { name: 'Compliance management process' }).closest('section')).getByRole('table');
    expect(within(within(table).getAllByRole('row')[2]).getAllByRole('cell').map((item) => item.textContent)).toEqual([
      '2', 'Atitikties rizikos vertinimasVertinama kartą per metus.', 'Kasmet', 'ISO 37301 53LB gairės 57',
    ]);
  });


  it('a step added at the end has a new id and no letters: the golden rule marks its row at once, and on the save the server breaks the rules about it', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'raci' });
    await user.click(screen.getByRole('button', { name: 'Add a step' }));
    expect(stepForm(6)).toHaveAccessibleName('6. New step');
    const row = () => within(matrix()).getAllByRole('row').at(-1);
    expect(within(row()).getByRole('rowheader')).toHaveTextContent('6. New step');
    expect(within(row()).getByRole('status')).toHaveTextContent('Exactly one accountable role (A) is needed — there are 0 now. At least one responsible role (R) is needed.');
    expect(within(row()).getAllByRole('combobox').map((select) => select.value)).toEqual(ROLES.map(() => '0'));
    expect(screen.getByRole('combobox', { name: `New step — ${ROLES[0].name}` })).toHaveDisplayValue('—');
    await write(user, within(stepForm(6)).getByRole('textbox', { name: 'Name of the step' }), 'Metinė peržiūra');
    expect(within(row()).getByRole('rowheader')).toHaveTextContent('6. Metinė peržiūra');

    const sent = await save(user, puts);
    expect(sent.process).toHaveLength(STEPS.length + 1);
    expect(sent.process.at(-1)).toEqual({ id: 's6', name: 'Metinė peržiūra', description: '', frequency: '', basis: [] });
    expect(sent.raci).toEqual(RACI);
    const panel = screen.getByRole('region', { name: 'Rules' });
    expect(within(panel).getAllByRole('status')[0]).toHaveTextContent('The document cannot be approved: 2 blocking rule(s) broken.');
    expect(within(panel).getAllByRole('listitem').slice(0, 2).map((item) => item.textContent)).toEqual([
      'Every step has exactly one accountable role (A)— brokenMetinė peržiūra', 'Every step has at least one responsible role (R)— brokenMetinė peržiūra',
    ]);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    // One role that does the work and answers for it mends the row
    await user.selectOptions(screen.getByRole('combobox', { name: `Metinė peržiūra — ${ROLES[1].name}` }), 'AR');
    expect(within(row()).getByRole('status')).toBeEmptyDOMElement();
  });


  it('a step removed takes its letters with it; the rest keep their order, and the server finds the process too short', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'raci' });
    await user.click(screen.getByRole('button', { name: `Remove the step “${STEPS[0].name}”` }));
    expect(screen.getAllByRole('textbox', { name: 'Name of the step' }).map((field) => field.value)).toEqual(STEPS.slice(1).map((step) => step.name));
    expect(within(matrix()).getAllByRole('rowheader').map((header) => header.textContent)).toEqual(STEPS.slice(1).map((step, index) => `${index + 1}. ${step.name}`));

    const sent = await save(user, puts);
    expect(sent.process).toEqual(STEPS.slice(1));
    expect(sent.raci).toEqual(RACI.filter((entry) => entry.stepId !== STEPS[0].id));
    expect(sent.raci.length).toBeLessThan(RACI.length);
    const panel = screen.getByRole('region', { name: 'Rules' });
    expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent('The process has at least five steps— broken4');
  });
});







// -----------------------------------------------------------
// Positions and gaps
// -----------------------------------------------------------

describe('a governance product — the positions and gaps tab', () => {

  it('lists the positions the documents name with their sources, and the roles they lack with the reason', async () => {
    renderGovernance({ tab: 'positions' });
    const positions = (await screen.findByRole('heading', { name: 'Positions and units the documents name' })).closest('section');
    const rows = within(positions).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(GOVERNANCE.content.positions.length);
    const [first] = GOVERNANCE.content.positions;
    const cells = within(rows[0]).getAllByRole('cell').map((item) => item.textContent);
    expect(cells.slice(0, 3)).toEqual([first.name, '—', 'Governing body']);
    expect(cells[3]).toContain(first.duties);
    expect(cells[3]).toContain('Sources: 08-information-security.md; F01-governance-accountability.md');

    const gaps = screen.getByRole('heading', { name: 'Missing roles and functions' }).closest('section');
    const items = within(gaps).getAllByRole('listitem');
    expect(items).toHaveLength(GOVERNANCE.content.gaps.length);
    expect(items[0]).toHaveTextContent(`${GOVERNANCE.content.gaps[0].role} · Governing body`);
    expect(items[0]).toHaveTextContent(GOVERNANCE.content.gaps[0].why);
    // Read-only even in edit mode: nothing to type into here
    expect(within(screen.getByRole('tabpanel')).queryByRole('textbox')).toBeNull();
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderGovernance({ tab: 'raci', locale: 'lt' });
    await screen.findByRole('heading', { name: 'RACI matrica' });
    expect(screen.getByText('R — vykdo, A — atskaitingas, AR — vykdo ir atskaitingas, C — konsultuojamas, I — informuojamas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Atitikties valdymo procesas' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redaguoti' }));
    await user.selectOptions(cell(STEP, ACCOUNTABLE), 'C');
    expect(within(rowOf(STEP)).getByRole('status')).toHaveTextContent('Turi būti lygiai vienas atskaitingas (A) — dabar 0.');
    expect(screen.getByRole('combobox', { name: 'Pridėti rolę' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Struktūra' }));
    expect(await screen.findByRole('img', { name: 'Valdymo struktūros schema; tie patys mazgai išvardyti lentelėje po ja.' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Linija: Valdyba' })).toHaveDisplayValue('Valdymo organas');
    expect(screen.getByRole('button', { name: 'Pridėti mazgą' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Pareigybės ir spragos' }));
    expect(screen.getByRole('heading', { name: 'Trūkstamos rolės ir funkcijos' })).toBeInTheDocument();
  });
});
