// -----------------------------------------------------------
//  [*] Tests — ProductPage, a legal risk register
//
//  The two content tabs of a risk product against the
//  backend double. "Register": the 5×5 matrix — impact up,
//  likelihood across, every cell its score on the tint of
//  its band with the band said for a screen reader, the
//  scenarios in the cells the server put them in, a legend
//  naming the bands with their ranges — and the scenarios as
//  cards with everything the register records. "Criteria":
//  the two 5×4 tables, how they were fitted, the appetite.
//
//  Editing a draft: a scenario opened as a form — its texts,
//  its eight scores, its response, actions, owners, deadline
//  and conclusions, its internal policies picked among the
//  company's documents (which is what mends "ties"), its
//  types of legal risk, two at most (which is what mends
//  "at least four types"), a provision added to its legal
//  basis — and removed; a
//  scenario added, with none of its scores set ("not
//  scored", out of the matrix, the server's rules broken
//  until it is filled in); the criteria's wording and the
//  appetite's. The page never works out a level, a score
//  or a band: a scenario whose scores changed shows its
//  level as pending and leaves the matrix until the save,
//  and then shows what the server answered — checked here
//  against the double's own normaliser, never against a
//  number typed into the test. Removing a scenario lets the
//  server renumber the rest and break "at least five
//  scenarios". And Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given } from '../support/backend/server';
import * as f from '../support/backend/fixtures';
import * as p from '../support/backend/programme';
import enums from '@/messages/ENUMS/en.json';
import ProductPage from '@/pages/Programme/ProductPage';


const RISKS = p.product(f.ID.productRisks);
const SCENARIOS = RISKS.content.scenarios;
const [FIRST, SECOND, THIRD] = SCENARIOS;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderRisks: the draft register's page on a tab.
// startEditing: the same with "Edit" pressed. card: the
// article of one scenario, by its id. matrixRows: the matrix
// as rows of cell texts, non-breaking spaces made plain.
// level: how the page writes a scored scenario's level.
// save: press "Save changes" and hand back the one PUT's
// content.
// write: puts a text into a field in one change — a paste
// where typing would make a change, and a render of the
// whole form, for every letter.
// -----------------------------------------------------------

function renderRisks({ tab = '', ...options } = {}) {
  return renderPage(<ProductPage authData={authData} />, { route: `/programme/${f.ID.productRisks}${tab ? `?tab=${tab}` : ''}`, path: '/programme/:productId', ...options });
}

async function startEditing(options) {
  const view = renderRisks(options);
  await view.user.click(await screen.findByRole('button', { name: 'Edit' }));
  return view;
}

const card = (id) => screen.getAllByRole('article').find((article) => within(article).queryByRole('heading', { level: 3, name: new RegExp(`^${id}`) }));

const plain = (text) => text.replace(/\u00a0/g, ' ');

const matrixRows = () => within(screen.getByRole('table', { name: 'Risk matrix' })).getAllByRole('row')
  .map((row) => [...row.children].map((item) => plain(item.textContent)));

const level = (scenario) => `L${scenario.likelihood.level} × I${scenario.impact.level} = ${scenario.score} · ${enums.riskBand[scenario.band]}`;

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
// The register
// -----------------------------------------------------------

describe('a risk register — the register tab', () => {

  it('draws the 5×5 matrix: impact up, likelihood across, each cell its score and band, the scenarios where the server put them', async () => {
    renderRisks();
    await screen.findByRole('table', { name: 'Risk matrix' });
    expect(matrixRows()).toEqual([
      ['5 — Catastrophic', '5Tolerable', '10Medium', '15High', '20Critical', '25Critical'],
      ['4 — Major', '4Tolerable', '8Medium', '12Medium', '16High', '20Critical'],
      ['3 — Moderate', '3Negligible', '6TolerableLR-02, LR-04, LR-05', '9MediumLR-01', '12MediumLR-03', '15High'],
      ['2 — Minor', '2Negligible', '4Tolerable', '6Tolerable', '8Medium', '10Medium'],
      ['1 — Insignificant', '1Negligible', '2Negligible', '3Negligible', '4Tolerable', '5Tolerable'],
      ['', '1 — Very unlikely', '2 — Unlikely', '3 — Possible', '4 — Likely', '5 — Almost certain'],
    ]);
    expect(screen.getByText('Impact ↑ · Likelihood →')).toBeInTheDocument();
  });


  it('tints the cells with the five-step ramp of the PDF — the two darkest with white text — and names every band with its range in a legend', async () => {
    renderRisks();
    const table = await screen.findByRole('table', { name: 'Risk matrix' });
    const cellOf = (text) => within(table).getAllByRole('cell').find((item) => plain(item.textContent).startsWith(text));
    expect(cellOf('1Negligible')).toHaveStyle({ backgroundColor: '#EEF3FA' });
    expect(cellOf('4Tolerable')).toHaveStyle({ backgroundColor: '#C9D9EF' });
    expect(cellOf('9Medium')).toHaveStyle({ backgroundColor: '#8FB1E3' });
    expect(cellOf('16High')).toHaveStyle({ backgroundColor: '#3E6FB0', color: '#FFFFFF' });
    expect(cellOf('25Critical')).toHaveStyle({ backgroundColor: '#173A6E', color: '#FFFFFF' });
    const legend = screen.getByText('Risk levels:').parentElement;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Negligible: 1–3', 'Tolerable: 4–6', 'Medium: 8–12', 'High: 15–16', 'Critical: 20–25',
    ]);
  });


  it('shows a scenario as a card: id, area, unit, the level in words, the sentence in the serif, the types of risk, the conclusion, the reasons with their scores, policies, legal basis, response and actions, owners, deadline', async () => {
    renderRisks();
    await screen.findByRole('table', { name: 'Risk matrix' });
    expect(screen.getByRole('heading', { name: `Risk scenarios (${SCENARIOS.length})` })).toBeInTheDocument();
    const article = card('LR-01');
    expect(within(article).getByRole('heading', { level: 3 })).toHaveTextContent(`LR-01 · ${FIRST.area} · ${FIRST.unit}`);
    expect(within(article).getByText(level(FIRST))).toHaveStyle({ backgroundColor: '#8FB1E3' });
    expect(level(FIRST)).toBe('L3 × I3 = 9 · Medium');
    const sentence = within(article).getByText(FIRST.sentence);
    expect(sentence).toHaveClass('font-serif');
    expect(within(article).getByText('Types of legal risk: 2 Non-compliance with applicable laws, 6 Improper choice')).toBeInTheDocument();
    // Its place in the lecture's three typologies: what the risk comes from, what it costs, what it threatens
    expect(within(article).getByText('Type of source: Internal processes, control systems and IT architecture'
      + ' · Type of consequences: Supervisory and licence · Type of protected objective: Legal compliance and licence')).toBeInTheDocument();
    expect(within(article).getByText('Internal conclusion').nextSibling).toHaveTextContent(FIRST.internalConclusion);
    expect(within(article).queryByText('Outside lawyer\'s conclusion')).toBeNull();
    const likelihood = within(article).getByText('Why this likelihood').nextSibling;
    expect(likelihood).toHaveTextContent(FIRST.likelihood.why);
    expect(within(likelihood).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Internal control and competence5', 'Legal clarity and supervisory practice1', 'Reliability of counterparties and third parties3', 'Frequency and probability over time3',
    ]);
    const impact = within(article).getByText('Why this impact').nextSibling;
    expect(within(impact).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Financial impact2', 'Legal, supervisory and licence impact3', 'Reputation and intangible assets2', 'Reach, scale and domino effects3',
    ]);
    expect(within(article).getByText('Internal policies').nextSibling).toHaveTextContent('F04-conflict-of-interest.md, F01-governance-accountability.md');
    const basis = within(article).getByText('Legal basis').nextSibling;
    expect(within(basis).getAllByRole('link').map((link) => link.textContent)).toEqual(['MiCA 80 str. 2 d.', 'MiCA 81 str. 4 d.']);
    expect(within(basis).getByText('The provision regulates something else')).toBeInTheDocument();
    const response = within(article).getByText('Response').nextSibling;
    expect(response).toHaveTextContent('Mitigate');
    expect(within(response).getAllByRole('listitem').map((item) => item.textContent)).toEqual(FIRST.actions);
    expect(within(article).getByText('Owners').nextSibling).toHaveTextContent(FIRST.owners.join(', '));
    expect(within(article).getByText('Deadline').nextSibling).toHaveTextContent(FIRST.deadline);
    // A read-only card has no buttons
    expect(within(article).queryByRole('button')).toBeNull();
  });


  it('shows the outside lawyer\'s conclusion when a person wrote one; a scenario the server could not score says so', async () => {
    const scenarios = [{ ...FIRST, externalConclusion: 'Išorės teisininko nuomone, rizika valdoma.' }, { ...SECOND, band: null, score: 0 }, ...SCENARIOS.slice(2)];
    given.json('get', '/api/programme/:productId', { ...RISKS, content: { ...RISKS.content, scenarios } });
    renderRisks();
    await screen.findByRole('table', { name: 'Risk matrix' });
    expect(within(card('LR-01')).getByText('Outside lawyer\'s conclusion').nextSibling).toHaveTextContent('Išorės teisininko nuomone, rizika valdoma.');
    expect(within(card('LR-02')).getByText('Not scored')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The criteria
// -----------------------------------------------------------

describe('a risk register — the criteria tab', () => {

  it('shows the two 5×4 tables level by level, how they were fitted, and the appetite band by band', async () => {
    renderRisks({ tab: 'criteria' });
    const likelihood = within((await screen.findByRole('heading', { name: 'Likelihood criteria' })).closest('section')).getByRole('table');
    expect(within(likelihood).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Level', 'Internal control and competence', 'Legal clarity and supervisory practice', 'Reliability of counterparties and third parties', 'Frequency and probability over time',
    ]);
    expect(within(likelihood).getAllByRole('rowheader').map((header) => header.textContent)).toEqual([
      '1 — Very unlikely', '2 — Unlikely', '3 — Possible', '4 — Likely', '5 — Almost certain',
    ]);
    const [low] = RISKS.content.criteria.likelihood;
    expect(within(within(likelihood).getAllByRole('row')[1]).getAllByRole('cell').map((item) => item.textContent)).toEqual([low.control, low.clarity, low.counterparty, low.frequency]);

    const impact = within(screen.getByRole('heading', { name: 'Impact criteria' }).closest('section')).getByRole('table');
    expect(within(impact).getAllByRole('rowheader').map((header) => header.textContent)).toEqual([
      '1 — Insignificant', '2 — Minor', '3 — Moderate', '4 — Major', '5 — Catastrophic',
    ]);
    const worst = RISKS.content.criteria.impact[4];
    expect(within(within(impact).getAllByRole('row')[5]).getAllByRole('cell').map((item) => item.textContent)).toEqual([worst.financial, worst.regulatory, worst.reputation, worst.reach]);

    expect(within(screen.getByRole('heading', { name: 'How the criteria were fitted' }).closest('section')).getByText(RISKS.content.criteria.calibration)).toBeInTheDocument();

    const appetite = within(screen.getByRole('heading', { name: 'Risk appetite' }).closest('section')).getByRole('table');
    expect(within(appetite).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Risk level', 'What it means', 'Who decides', 'Responses']);
    expect(within(appetite).getAllByRole('rowheader').map((header) => header.textContent)).toEqual(['Negligible1–3', 'Tolerable4–6', 'Medium8–12', 'High15–16', 'Critical20–25']);
    const [negligible] = RISKS.content.appetite;
    expect(within(within(appetite).getAllByRole('row')[1]).getAllByRole('cell').map((item) => item.textContent)).toEqual([negligible.comment, negligible.decision, 'Accept, Increase']);
    expect(within(within(appetite).getAllByRole('row')[5]).getAllByRole('cell')[2]).toHaveTextContent('Avoid');
  });


  it('edits the wording — a criteria cell, the note on the fitting, a band\'s meaning and decision — and PUTs it with the rest untouched', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'criteria' });
    const cellField = screen.getByRole('textbox', { name: 'Internal control and competence: 1 — Very unlikely' });
    expect(cellField).toHaveValue(RISKS.content.criteria.likelihood[0].control);
    await user.clear(cellField);
    await write(user, cellField, 'Kontrolės veikia.');
    const fitted = screen.getByRole('textbox', { name: 'How the criteria were fitted' });
    await user.clear(fitted);
    await write(user, fitted, 'Pritaikyta mažai bendrovei.');
    const meaning = screen.getByRole('textbox', { name: 'What it means: Critical' });
    await user.clear(meaning);
    await write(user, meaning, 'Veikla stabdoma.');
    const decision = screen.getByRole('textbox', { name: 'Who decides: Critical' });
    await user.clear(decision);
    await write(user, decision, 'Valdyba.');

    const sent = await save(user, puts);
    expect(sent.criteria.likelihood[0]).toEqual({ ...RISKS.content.criteria.likelihood[0], control: 'Kontrolės veikia.' });
    expect(sent.criteria.likelihood.slice(1)).toEqual(RISKS.content.criteria.likelihood.slice(1));
    expect(sent.criteria.impact).toEqual(RISKS.content.criteria.impact);
    expect(sent.criteria.calibration).toBe('Pritaikyta mažai bendrovei.');
    expect(sent.appetite[4]).toEqual({ ...RISKS.content.appetite[4], comment: 'Veikla stabdoma.', decision: 'Valdyba.' });
    expect(sent.scenarios).toEqual(SCENARIOS);
    expect(screen.getByRole('textbox', { name: 'Who decides: Critical' })).toHaveValue('Valdyba.');
  });
});







// -----------------------------------------------------------
// Editing the scenarios
// -----------------------------------------------------------

describe('a risk register — editing', () => {

  it('in edit mode every card offers to edit and to remove its scenario; one opens as a form at a time', async () => {
    const { user } = await startEditing();
    expect(screen.getAllByRole('button', { name: /^Edit scenario LR-/ })).toHaveLength(SCENARIOS.length);
    expect(screen.getAllByRole('button', { name: /^Remove scenario LR-/ })).toHaveLength(SCENARIOS.length);
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-02' }));
    const form = card('LR-02');
    expect(within(form).getByRole('textbox', { name: 'The scenario\'s sentence' })).toHaveValue(SECOND.sentence);
    expect(within(form).getByRole('textbox', { name: 'Event' })).toHaveValue(SECOND.event);
    expect(within(form).getByRole('textbox', { name: 'Source' })).toHaveValue(SECOND.source);
    expect(within(form).getByRole('textbox', { name: 'Consequences' })).toHaveValue(SECOND.consequences);
    expect(within(form).getByRole('textbox', { name: 'Objective' })).toHaveValue(SECOND.objective);
    expect(within(form).getByRole('combobox', { name: 'Internal control and competence' })).toHaveDisplayValue('3 — Possible');
    expect(within(within(form).getByRole('combobox', { name: 'Financial impact' })).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '—', '1 — Insignificant', '2 — Minor', '3 — Moderate', '4 — Major', '5 — Catastrophic',
    ]);
    // The form is headed by the level the server last gave
    expect(within(form).getByText(level(SECOND))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-03' }));
    expect(screen.getAllByRole('textbox', { name: 'The scenario\'s sentence' })).toHaveLength(1);
    expect(within(card('LR-03')).getByRole('textbox', { name: 'Area of activity' })).toHaveValue(THIRD.area);
    await user.click(screen.getByRole('button', { name: 'Finish editing scenario LR-03' }));
    expect(screen.queryByRole('textbox', { name: 'The scenario\'s sentence' })).toBeNull();
  });


  it('a changed score makes the level pending — no guess on the page — and the save shows the level the server worked out', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-02' }));
    await user.selectOptions(within(card('LR-02')).getByRole('combobox', { name: 'Financial impact' }), '5 — Catastrophic');

    // Unsaved: the old level is gone, no new one is made up, and the scenario left its cell
    expect(within(card('LR-02')).getByText('The risk level is worked out on save')).toBeInTheDocument();
    expect(within(card('LR-02')).queryByText(level(SECOND))).toBeNull();
    expect(within(card('LR-02')).queryByText(/×/)).toBeNull();
    expect(matrixRows()[2][2]).toBe('6TolerableLR-04, LR-05');
    expect(matrixRows().flat().some((text) => text.includes('LR-02'))).toBe(false);
    expect(screen.getByText('Placed in a cell on save: LR-02')).toBeInTheDocument();
    // The others keep the levels the server gave them
    expect(within(card('LR-01')).getByText(level(FIRST))).toBeInTheDocument();

    const sent = await save(user, puts);
    expect(sent.scenarios[1].impact).toEqual({ ...SECOND.impact, financial: 5 });
    expect(sent.scenarios[1]).toMatchObject({ score: SECOND.score, band: SECOND.band });
    expect(sent.scenarios[0]).toEqual(FIRST);

    // What the server answers: the impact is the highest of its four, the score and the band follow
    const answered = p.normalise(RISKS, sent).content.scenarios[1];
    expect(answered).toMatchObject({ impact: { level: 5 }, likelihood: { level: SECOND.likelihood.level }, score: 5 * SECOND.likelihood.level, band: 'medium' });
    expect(within(card('LR-02')).getByText(level(answered))).toBeInTheDocument();
    expect(screen.queryByText(/^Placed in a cell on save/)).toBeNull();
    expect(matrixRows()[0][2]).toBe('10MediumLR-02');
  });


  it('a scenario\'s place in the three typologies is chosen in its form and travels with the save', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-01' }));
    const form = card('LR-01');
    const choice = (name) => within(form).getByRole('combobox', { name });
    expect(within(choice('Type of source')).getByRole('option', { selected: true })).toHaveTextContent('Internal processes, control systems and IT architecture');
    expect(within(choice('Type of consequences')).getAllByRole('option')).toHaveLength(5);
    await user.selectOptions(choice('Type of source'), 'External malicious actors');
    await user.selectOptions(choice('Type of protected objective'), 'Reputation, trust and ESG');
    const sent = await save(user, puts);
    expect(sent.scenarios[0]).toEqual({ ...FIRST, sourceType: 4, objectiveType: 5 });
    await user.click(screen.getByRole('button', { name: 'Finish editing scenario LR-01' }));
    expect(within(card('LR-01')).getByText(/^Type of source: External malicious actors · Type of consequences: Supervisory and licence · Type of protected objective: Reputation, trust and ESG$/)).toBeInTheDocument();
  });


  it('edits a scenario\'s texts, response, actions, owners, deadline and conclusions; the PUT carries them with the scores untouched', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-01' }));
    const form = card('LR-01');
    const retype = async (name, text) => {
      const field = within(form).getByRole('textbox', { name });
      await user.clear(field);
      await write(user, field, text);
    };
    await retype('Area of activity', 'Pavedimų vykdymas');
    await retype('Unit', 'Prekybos padalinys');
    await retype('Event', 'atlygio priėmimas');
    await retype('Why this likelihood', 'Kontrolės nėra.');
    await retype('Deadline', '2027 Q3');
    await retype('Outside lawyer\'s conclusion', 'Rizika reali.');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Response' }), 'Transfer / share');
    await user.click(within(form).getByRole('button', { name: 'Remove: Action 1' }));
    await user.click(within(form).getByRole('button', { name: 'Add an action' }));
    await write(user, within(form).getByRole('textbox', { name: 'Action 3' }), 'Apdrausti atsakomybę.');
    await user.click(within(form).getByRole('button', { name: 'Remove: Owner 2' }));
    await user.click(within(form).getByRole('button', { name: 'Add an owner' }));
    await write(user, within(form).getByRole('textbox', { name: 'Owner 2' }), 'Teisininkas');
    await user.click(within(form).getByRole('button', { name: 'Remove the reference “MiCA 81 str. 4 d.”' }));
    // Texts alone leave the level as the server gave it
    expect(within(form).getByText(level(FIRST))).toBeInTheDocument();

    const sent = await save(user, puts);
    expect(sent.scenarios[0]).toEqual({
      ...FIRST, area: 'Pavedimų vykdymas', unit: 'Prekybos padalinys', event: 'atlygio priėmimas', deadline: '2027 Q3',
      externalConclusion: 'Rizika reali.', response: 'transfer', likelihood: { ...FIRST.likelihood, why: 'Kontrolės nėra.' },
      actions: [...FIRST.actions.slice(1), 'Apdrausti atsakomybę.'], owners: [FIRST.owners[0], 'Teisininkas'], legalBasis: [FIRST.legalBasis[0]],
    });
    expect(sent.scenarios.slice(1)).toEqual(SCENARIOS.slice(1));
    // Folded back, the card shows what was saved
    await user.click(screen.getByRole('button', { name: 'Finish editing scenario LR-01' }));
    expect(within(card('LR-01')).getByText('Outside lawyer\'s conclusion').nextSibling).toHaveTextContent('Rizika reali.');
    expect(within(card('LR-01')).getByText('Response').nextSibling).toHaveTextContent('Transfer / share');
  });


  it('removing a scenario: the server numbers the rest anew and finds fewer than five — the rule breaks and the approval goes', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove scenario LR-03' }));
    // Until the save the page keeps the ids it was given
    expect(screen.getAllByRole('article').map((article) => within(article).getByRole('heading', { level: 3 }).textContent.slice(0, 5))).toEqual(['LR-01', 'LR-02', 'LR-04', 'LR-05']);
    expect(screen.getByRole('heading', { name: 'Risk scenarios (4)' })).toBeInTheDocument();

    const sent = await save(user, puts);
    expect(sent.scenarios.map((scenario) => scenario.id)).toEqual(['LR-01', 'LR-02', 'LR-04', 'LR-05']);
    expect(screen.getAllByRole('article').map((article) => within(article).getByRole('heading', { level: 3 }).textContent.slice(0, 5))).toEqual(['LR-01', 'LR-02', 'LR-03', 'LR-04']);
    expect(within(card('LR-03')).getByText(SCENARIOS[3].sentence)).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'Rules' });
    expect(within(panel).getAllByRole('status')[0]).toHaveTextContent('The document cannot be approved: 1 blocking rule(s) broken.');
    expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent('There are at least five risk scenarios— broken4');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });


  it('the internal policies are picked among the company\'s documents: a scenario left without one breaks "ties", and picking one mends it', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-01' }));
    const picker = () => within(card('LR-01')).getByRole('combobox', { name: 'Internal policies' });
    expect(within(card('LR-01')).getByText('The company\'s documents the scenario concerns — at least one.')).toBeInTheDocument();
    await user.click(picker());
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(RISKS.basis.documents.map((document) => document.title));
    expect(options.filter((option) => option.getAttribute('aria-selected') === 'true').map((option) => option.textContent).sort())
      .toEqual(FIRST.policies.map((policy) => policy.document).sort());
    // Both taken out
    for (const policy of FIRST.policies) await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: policy.document }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.content.scenarios[0].policies).toEqual([]);
    const panel = screen.getByRole('region', { name: 'Rules' });
    await waitFor(() => expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent('Every scenario is tied to a unit and an internal policy— brokenLR-01'));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();

    // One picked: the rule is kept again
    const document = RISKS.basis.documents.find((entry) => entry.title === '09-risk-management.md');
    await user.click(picker());
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: document.title }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].body.content.scenarios[0].policies).toEqual([{ documentId: document.id, document: document.title }]);
    await waitFor(() => expect(within(panel).getAllByRole('status')[0]).toHaveTextContent('Every blocking rule is kept'));
    await user.click(screen.getByRole('button', { name: 'Finish editing scenario LR-01' }));
    expect(within(card('LR-01')).getByText('Internal policies').nextSibling).toHaveTextContent('09-risk-management.md');
  });


  it('the types of legal risk are picked, two at most: taking one out breaks "at least four types", setting one mends it', async () => {
    // A register that covers exactly four types — 1, 2, 4 and 6
    const narrow = SCENARIOS.map((scenario, index) => (index > 2 ? { ...scenario, categories: [2] } : scenario));
    given.json('get', '/api/programme/:productId', { ...RISKS, content: { ...RISKS.content, scenarios: narrow } });
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    const picker = (id) => within(card(id)).getByRole('combobox', { name: 'Types of legal risk' });
    const option = (name) => within(screen.getByRole('listbox')).getByRole('option', { name });

    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-01' }));
    expect(within(card('LR-01')).getByText('One or two types, by ISO 31022.')).toBeInTheDocument();
    await user.click(picker('LR-01'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((item) => item.textContent)).toEqual([1, 2, 3, 4, 5, 6].map((number) => `${number} ${enums.riskCategory[number]}`));
    expect(options.filter((item) => item.getAttribute('aria-selected') === 'true').map((item) => item.textContent))
      .toEqual(FIRST.categories.map((number) => `${number} ${enums.riskCategory[number]}`));
    // A third type is not taken, and the field says why
    await user.click(option(`3 ${enums.riskCategory[3]}`));
    expect(within(card('LR-01')).getByRole('alert')).toHaveTextContent('No more than two types can be chosen — take one out first.');
    expect(screen.queryByRole('region', { name: 'There are unsaved changes' })).toBeNull();

    // The one scenario of type 1 loses it: three types are left
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-03' }));
    await user.click(picker('LR-03'));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: `1 ${enums.riskCategory[1]}` }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.content.scenarios.map((scenario) => scenario.categories)).toEqual([[2, 6], [2, 4], [2], [2], [2]]);
    const panel = screen.getByRole('region', { name: 'Rules' });
    await waitFor(() => expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent('The scenarios cover at least four types of legal risk— broken2, 4, 6'));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();

    // It is given another type: four again
    await user.click(picker('LR-03'));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: `3 ${enums.riskCategory[3]}` }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].body.content.scenarios[2].categories).toEqual([2, 3]);
    await waitFor(() => expect(within(panel).getAllByRole('status')[0]).toHaveTextContent('Every blocking rule is kept'));
    await user.click(screen.getByRole('button', { name: 'Finish editing scenario LR-03' }));
    expect(within(card('LR-03')).getByText(`Types of legal risk: 2 ${enums.riskCategory[2]}, 3 ${enums.riskCategory[3]}`)).toBeInTheDocument();
  });


  it('a provision is added to a scenario\'s legal basis and looked up on the save', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-03' }));
    const adding = within(card('LR-03')).getByRole('form', { name: 'A new provision' });
    await write(user, within(adding).getByRole('textbox', { name: 'Legal act' }), 'GDPR');
    await write(user, within(adding).getByRole('textbox', { name: 'Article' }), '32');
    await user.click(within(adding).getByRole('button', { name: 'Add the provision' }));
    expect(within(card('LR-03')).getByText('GDPR 32').closest('li')).toHaveTextContent('GDPR 32(to be looked up on save)');
    const sent = await save(user, puts);
    expect(sent.scenarios[2].legalBasis).toEqual([...THIRD.legalBasis, { act: 'GDPR', article: '32', paragraph: '', why: '' }]);
    expect(within(card('LR-03')).getByRole('link', { name: 'Open the official text of “GDPR 32 str.” (new tab)' })).toHaveAttribute('href', `${p.CORPUS.get('gdpr').base}#art_32`);
  });


  it('"Add a scenario" appends an empty one and opens its form: no score is set, it reads "not scored", stays out of the matrix — and the server keeps it unscored', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Add a scenario' }));
    expect(screen.getByRole('heading', { name: `Risk scenarios (${SCENARIOS.length + 1})` })).toBeInTheDocument();
    const form = () => card('New scenario');
    expect(within(form()).getByRole('textbox', { name: 'The scenario\'s sentence' })).toHaveValue('');
    // All eight scores are unset: a dash, never a number
    const dimensions = [
      'Internal control and competence', 'Legal clarity and supervisory practice', 'Reliability of counterparties and third parties', 'Frequency and probability over time',
      'Financial impact', 'Legal, supervisory and licence impact', 'Reputation and intangible assets', 'Reach, scale and domino effects',
    ];
    for (const name of dimensions) expect(within(form()).getByRole('combobox', { name })).toHaveDisplayValue('—');
    expect(within(form()).getByText('Not scored')).toBeInTheDocument();
    expect(within(form()).queryByText('The risk level is worked out on save')).toBeNull();
    expect(screen.queryByText(/^Placed in a cell on save/)).toBeNull();
    expect(within(form()).getByRole('button', { name: 'Finish editing the new scenario' })).toBeInTheDocument();
    await write(user, within(form()).getByRole('textbox', { name: 'Area of activity' }), 'Skundų nagrinėjimas');

    const sent = await save(user, puts);
    const added = sent.scenarios.at(-1);
    expect(sent.scenarios.slice(0, -1)).toEqual(SCENARIOS);
    expect(added).toMatchObject({
      area: 'Skundų nagrinėjimas', sentence: '', categories: [], policies: [], legalBasis: [], score: 0, band: null,
      likelihood: { control: 0, clarity: 0, counterparty: 0, frequency: 0 }, impact: { financial: 0, regulatory: 0, reputation: 0, reach: 0 },
    });
    // The server numbered it and left it unscored; three blocking rules are broken by it
    const answered = p.normalise(RISKS, sent);
    expect(answered.content.scenarios.at(-1)).toMatchObject({ id: 'LR-06', score: 0, band: null, likelihood: { level: 0 }, impact: { level: 0 } });
    expect(answered.checks.filter((check) => !check.ok && check.blocking).map((check) => [check.rule, check.detail])).toEqual([['sentence', 'LR-06'], ['ties', 'LR-06'], ['scores', 'LR-06']]);
    const saved = card('LR-06');
    expect(within(saved).getByRole('heading', { level: 3 })).toHaveTextContent('LR-06 · Skundų nagrinėjimas');
    expect(within(saved).getByText('Not scored')).toBeInTheDocument();
    expect(within(saved).queryByText(/×/)).toBeNull();
    expect(matrixRows().flat().some((text) => text.includes('LR-06'))).toBe(false);
    const panel = screen.getByRole('region', { name: 'Rules' });
    expect(within(panel).getAllByRole('status')[0]).toHaveTextContent('The document cannot be approved: 3 blocking rule(s) broken.');
    expect(within(panel).getByText('Every score is on the scale of 1 to 5').closest('li')).toHaveTextContent('— brokenLR-06');
  });


  it('a new scenario can be removed again before it is saved; a score set back to the dash makes a scored scenario "not scored"', async () => {
    const { user } = await startEditing();
    await user.click(screen.getByRole('button', { name: 'Add a scenario' }));
    await user.click(screen.getByRole('button', { name: 'Finish editing the new scenario' }));
    expect(within(card('New scenario')).getByRole('button', { name: 'Edit the new scenario' })).toBeInTheDocument();
    await user.click(within(card('New scenario')).getByRole('button', { name: 'Remove the new scenario' }));
    expect(card('New scenario')).toBeUndefined();
    expect(screen.queryByRole('region', { name: 'There are unsaved changes' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit scenario LR-01' }));
    await user.selectOptions(within(card('LR-01')).getByRole('combobox', { name: 'Financial impact' }), '—');
    expect(within(card('LR-01')).getByText('Not scored')).toBeInTheDocument();
    expect(within(card('LR-01')).queryByText(level(FIRST))).toBeNull();
    expect(matrixRows().flat().some((text) => text.includes('LR-01'))).toBe(false);
    expect(screen.queryByText(/^Placed in a cell on save/)).toBeNull();
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderRisks({ locale: 'lt' });
    await screen.findByRole('table', { name: 'Rizikos matrica' });
    expect(screen.getByText('Poveikis ↑ · Tikimybė →')).toBeInTheDocument();
    expect(within(card('LR-01')).getByText('T3 × P3 = 9 · Vidutinė')).toBeInTheDocument();
    expect(within(card('LR-01')).getByText('Teisinės rizikos rūšys: 2 Taikytinų teisės aktų nesilaikymas, 6 Netinkamas pasirinkimas')).toBeInTheDocument();
    expect(within(card('LR-01')).getByText('Reagavimo būdas').nextSibling).toHaveTextContent('Mažinti');
    expect(within(screen.getByText('Rizikos lygiai:').parentElement).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Nereikšminga: 1–3', 'Toleruotina: 4–6', 'Vidutinė: 8–12', 'Didelė: 15–16', 'Kritinė: 20–25',
    ]);
    await user.click(screen.getByRole('button', { name: 'Redaguoti' }));
    await user.click(screen.getByRole('button', { name: 'Redaguoti scenarijų LR-02' }));
    await user.selectOptions(within(card('LR-02')).getByRole('combobox', { name: 'Finansinis poveikis' }), '5 — Katastrofinis');
    expect(within(card('LR-02')).getByText('Rizikos lygis bus apskaičiuotas išsaugojus')).toBeInTheDocument();
    expect(screen.getByText('Bus priskirta langeliui išsaugojus: LR-02')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Kriterijai' }));
    expect(screen.getByRole('heading', { name: 'Rizikos apetitas' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Kas sprendžia: Kritinė' })).toBeInTheDocument();
  });
});
