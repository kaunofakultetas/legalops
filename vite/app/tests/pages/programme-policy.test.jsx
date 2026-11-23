// -----------------------------------------------------------
//  [*] Tests — ProductPage, a compliance policy
//
//  The two content tabs of a compliance policy against the
//  backend double. "Policy": the parts as a document —
//  numbered headings, paragraphs, the callout of what the
//  governing body must decide, the documents a part rests on
//  and its legal basis as links to the official text, with a
//  provision the act does not have marked in words.
//  "Documents": the hierarchy grouped by level and the
//  missing documents in the order of their priority.
//
//  Editing a draft: a part's text and decisions, a
//  document's level and topic, a missing document's fields
//  and its removal, a provision taken out and one added by
//  its act, article and paragraph (pending until the save,
//  then looked up by the server) — each saved with one PUT of
//  the WHOLE content, after which the page shows
//  what the server answered: the normalised content and the
//  rules run again (a part cut short breaks "parts"; the
//  unfound provision taken out mends "provisions" and frees
//  the approval). Discarding puts the server's text back.
//  And Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given } from '../support/backend/server';
import * as f from '../support/backend/fixtures';
import * as p from '../support/backend/programme';
import ProductPage from '@/pages/Programme/ProductPage';


const POLICY = p.product(f.ID.productPolicy);
const [PURPOSE, MANDATE, CONSEQUENCES] = POLICY.content.parts;

// The provision of the last part its act does not have
const UNFOUND = 'Lietuvos Respublikos darbo kodeksas 58';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderPolicy: the draft policy's page on a tab. part: the
// section of one part, found by its heading. startEditing:
// the page with "Edit" pressed. save: press "Save changes"
// and hand back the one PUT's content. rulesVerdict: the
// first line of the rules panel.
// write: puts a text into a field in one change — a paste
// where typing would make a change, and a render of the
// whole form, for every letter.
// -----------------------------------------------------------

function renderPolicy({ tab = '', id = f.ID.productPolicy, ...options } = {}) {
  return renderPage(<ProductPage authData={authData} />, { route: `/programme/${id}${tab ? `?tab=${tab}` : ''}`, path: '/programme/:productId', ...options });
}

const part = (heading) => screen.getByRole('heading', { level: 2, name: new RegExp(heading) }).closest('section');

async function startEditing(options) {
  const view = renderPolicy(options);
  await view.user.click(await screen.findByRole('button', { name: 'Edit' }));
  return view;
}

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

const rulesVerdict = () => within(screen.getByRole('region', { name: 'Rules' })).getAllByRole('status')[0];







// -----------------------------------------------------------
// The policy as a document
// -----------------------------------------------------------

describe('a compliance policy — the policy tab', () => {

  it('sets the parts as a document: numbered headings in the fixture\'s order, the text in paragraphs', async () => {
    renderPolicy();
    await screen.findByRole('tablist');
    expect(screen.getAllByRole('heading', { level: 2 }).filter((heading) => heading.closest('[role="tabpanel"]')).map((heading) => heading.textContent)).toEqual([
      `1${PURPOSE.heading}`, `2${MANDATE.heading}`, `3${CONSEQUENCES.heading}`,
    ]);
    const blocks = PURPOSE.text.split('\n\n');
    expect(blocks.length).toBeGreaterThan(2);
    const paragraphs = [...part(PURPOSE.heading).querySelectorAll('p')].map((node) => node.textContent);
    expect(paragraphs).toEqual(blocks);
  });


  it('marks what the governing body must decide as a callout under the part, and leaves it out where there is nothing to decide', async () => {
    renderPolicy();
    await screen.findByRole('tablist');
    const callout = within(part('mandatas')).getByRole('heading', { level: 3, name: 'For the governing body to decide' }).parentElement;
    expect(MANDATE.decisions).toHaveLength(2);
    expect(within(callout).getAllByRole('listitem').map((item) => item.textContent)).toEqual(MANDATE.decisions);
    expect(within(part(PURPOSE.heading)).queryByText('For the governing body to decide')).toBeNull();
  });


  it('names the documents a part rests on, each once, and its legal basis as links to the official text in a new tab', async () => {
    renderPolicy();
    await screen.findByRole('tablist');
    const section = part(PURPOSE.heading);
    expect(within(section).getByText('Rests on:').parentElement).toHaveTextContent('Rests on: 00-company-profile.md; F00-fintech-overview.md; F01-governance-accountability.md');
    const links = within(section).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['MiCA 68 str.', 'MiCA 73 str.', 'DORA 4 str.']);
    expect(links[0]).toHaveAccessibleName('Open the official text of “MiCA 68 str.” (new tab)');
    expect(links[0]).toHaveAttribute('href', PURPOSE.legalBasis[0].citationUrl);
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(links[0]).toHaveClass('font-serif');
  });


  it('a provision its act does not have is plain text with a warning said in words, not a link', async () => {
    renderPolicy();
    await screen.findByRole('tablist');
    const section = part(CONSEQUENCES.heading);
    const cited = within(section).getByText(UNFOUND);
    expect(cited.closest('a')).toBeNull();
    expect(within(cited.closest('li')).getByText('The act has no such provision')).toBeInTheDocument();
    // A provision that stands but has no address of its official text is plain text too — in the serif, unmarked
    const unlinked = within(section).getByText('PAĮ 10 str.');
    expect(unlinked).toHaveClass('font-serif');
    expect(unlinked.closest('a')).toBeNull();
    expect(within(unlinked.closest('li')).queryByText(/provision|corpus/)).toBeNull();
    expect(within(section).queryByRole('link')).toBeNull();
  });


  it.each([
    ['act_not_in_corpus', '', 'The act is not in the corpus — the reference was not checked'],
    ['found', 'mismatch', 'The provision regulates something else'],
  ])('a provision that is %s / "%s" says so', async (status, match, words) => {
    const flagged = { ...POLICY, content: { ...POLICY.content, parts: [{ ...PURPOSE, legalBasis: [{ ...PURPOSE.legalBasis[0], status, match }] }] } };
    given.json('get', '/api/programme/:productId', flagged);
    renderPolicy();
    await screen.findByRole('tablist');
    expect(within(part(PURPOSE.heading)).getByText(words)).toBeInTheDocument();
  });


  it('a policy without parts says so', async () => {
    given.json('get', '/api/programme/:productId', { ...POLICY, content: { ...POLICY.content, parts: [] } });
    renderPolicy();
    expect(await screen.findByText('The policy has no parts.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The library around the policy
// -----------------------------------------------------------

describe('a compliance policy — the documents tab', () => {

  it('groups the hierarchy by level — the rules first, the texts that are no rule last — with topic and note', async () => {
    renderPolicy({ tab: 'documents' });
    const card = (await screen.findByRole('heading', { name: 'Document hierarchy' })).closest('section');
    expect(within(card).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Level 2 — thematic policies (7)', 'Level 3 — procedures and instructions (2)', 'Not a rule (2)',
    ]);
    const tables = within(card).getAllByRole('table');
    expect(within(tables[1]).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['01-access-control.md', '02-backup.md']);
    const row = within(tables[2]).getByRole('row', { name: /00-company-profile\.md/ });
    const entry = POLICY.content.hierarchy.find((item) => item.document === '00-company-profile.md');
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([entry.document, entry.topic, entry.note]);
  });


  it('lists the missing documents by priority: level, title with purpose and what partly covers it, the priority in words, the legal basis', async () => {
    renderPolicy({ tab: 'documents' });
    const card = (await screen.findByRole('heading', { name: 'Missing documents' })).closest('section');
    const rows = within(card).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual(['High', 'High', 'Medium', 'Low']);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['2', '3', '3', '3']);
    const first = POLICY.content.missing.find((item) => item.title === 'Asmens duomenų apsaugos politika');
    expect(rows[0]).toHaveTextContent(first.title);
    expect(rows[0]).toHaveTextContent(first.purpose);
    expect(rows[0]).toHaveTextContent('Partly covered by: 03-human-resource.md, 06-operations-management.md');
    expect(within(rows[0]).getAllByRole('link').map((link) => link.textContent)).toEqual(['GDPR 24 str. 2 d.', 'GDPR 5 str. 1 d.', 'TFR 25 str.']);
  });


  it('a missing document names the part of the policy it makes workable, by that part\'s heading', async () => {
    const missing = POLICY.content.missing.map((row) => (row.title === 'Asmens duomenų apsaugos politika' ? { ...row, supports: 'mandate' } : row));
    given.json('get', '/api/programme/:productId', { ...POLICY, content: { ...POLICY.content, missing } });
    renderPolicy({ tab: 'documents' });
    const card = (await screen.findByRole('heading', { name: 'Missing documents' })).closest('section');
    const rows = within(card).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Policy part: Atitikties funkcijos įgaliojimai (mandatas)');
    // A part the product does not hold has no heading to print
    expect(rows[1]).not.toHaveTextContent('Policy part');
  });


  it('an empty library and no missing documents say so', async () => {
    given.json('get', '/api/programme/:productId', { ...POLICY, content: { ...POLICY.content, hierarchy: [], missing: [] } });
    renderPolicy({ tab: 'documents' });
    expect(await screen.findByText('There are no documents.')).toBeInTheDocument();
    expect(screen.getByText('No missing documents were found.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Editing the draft
// -----------------------------------------------------------

describe('a compliance policy — editing', () => {

  it('a part\'s text: PUT carries the whole content, and a part cut short comes back breaking "parts" — the page shows the server\'s verdict', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    const field = screen.getByRole('textbox', { name: PURPOSE.heading });
    expect(field).toHaveValue(PURPOSE.text);
    await user.clear(field);
    await write(user, field, '  Trumpas įvadas.  ');
    const sent = await save(user, puts);

    // The whole content: the edited part, and everything else as the server gave it
    expect(sent.parts[0]).toEqual({ ...PURPOSE, text: '  Trumpas įvadas.  ' });
    expect(sent.parts.slice(1)).toEqual([MANDATE, CONSEQUENCES]);
    expect(sent.hierarchy).toEqual(POLICY.content.hierarchy);
    expect(sent.missing).toEqual(POLICY.content.missing);
    expect(sent.title).toBe(POLICY.content.title);

    // The server trimmed the text and found the part too short
    expect(screen.getByRole('textbox', { name: PURPOSE.heading })).toHaveValue('Trumpas įvadas.');
    expect(rulesVerdict()).toHaveTextContent('The document cannot be approved: 2 blocking rule(s) broken.');
    const rows = within(screen.getByRole('region', { name: 'Rules' })).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows.slice(0, 2)).toEqual(['All eight parts of the policy are written— brokenpurpose', `The articles named are in their acts— broken${UNFOUND}`]);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    // Back in the reading view the document shows the saved text
    await user.click(screen.getByRole('button', { name: 'Finish editing' }));
    expect([...part(PURPOSE.heading).querySelectorAll('p')].map((node) => node.textContent)).toEqual(['Trumpas įvadas.']);
  });


  it('decisions: one added to a part without any, one removed from a part with two', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    await user.click(within(part(PURPOSE.heading)).getByRole('button', { name: 'Add a decision' }));
    await write(user, within(part(PURPOSE.heading)).getByRole('textbox', { name: 'Decision 1' }), 'Kas tvirtina politikos išimtis');
    const mandate = part('mandatas');
    expect(within(mandate).getByRole('textbox', { name: 'Decision 2' })).toHaveValue(MANDATE.decisions[1]);
    await user.click(within(mandate).getByRole('button', { name: 'Remove: Decision 1' }));
    expect(within(mandate).getByRole('textbox', { name: 'Decision 1' })).toHaveValue(MANDATE.decisions[1]);
    const sent = await save(user, puts);
    expect(sent.parts[0].decisions).toEqual(['Kas tvirtina politikos išimtis']);
    expect(sent.parts[1].decisions).toEqual([MANDATE.decisions[1]]);
    // Read again: the new callout stands under the first part
    await user.click(screen.getByRole('button', { name: 'Finish editing' }));
    expect(within(part(PURPOSE.heading)).getByText('Kas tvirtina politikos išimtis')).toBeInTheDocument();
  });


  it('taking the unfound provision out mends "provisions": after the save every blocking rule is kept and the approval is free', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await user.click(within(part(CONSEQUENCES.heading)).getByRole('button', { name: `Remove the reference “${UNFOUND}”` }));
    expect(within(part(CONSEQUENCES.heading)).queryByText(UNFOUND)).toBeNull();
    // Nothing is mended until the server says so
    expect(rulesVerdict()).toHaveTextContent('The document cannot be approved: 1 blocking rule(s) broken.');
    const sent = await save(user, puts);
    expect(sent.parts[2].legalBasis).toEqual(CONSEQUENCES.legalBasis.filter((entry) => entry.status === 'found'));
    // A provision travels whole — the judgement it came with included
    expect(sent.parts[0].legalBasis[0]).toEqual(PURPOSE.legalBasis[0]);
    expect(rulesVerdict()).toHaveTextContent('Every blocking rule is kept — the document can be approved.');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });


  it('a provision is added by act, article and paragraph: it waits for the save, and comes back looked up — found as a link, or marked', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    const adding = () => within(part(PURPOSE.heading)).getByRole('form', { name: 'A new provision' });
    expect(within(adding()).getByText('Write the act\'s short title, e.g. MiCA, DORA, PPTFPĮ.')).toBeInTheDocument();
    const add = within(adding()).getByRole('button', { name: 'Add the provision' });
    expect(add).toBeDisabled();
    await write(user, within(adding()).getByRole('textbox', { name: 'Legal act' }), 'mica');
    expect(add).toBeDisabled();
    await write(user, within(adding()).getByRole('textbox', { name: 'Article' }), '70');
    await write(user, within(adding()).getByRole('textbox', { name: 'Paragraph (optional)' }), '1');
    await user.click(add);

    // In the list, unverified: no link, no mark — only that the save will check it
    const pending = within(part(PURPOSE.heading)).getByText('mica 70(1)').closest('li');
    expect(pending).toHaveTextContent('mica 70(1)(to be looked up on save)');
    expect(within(pending).queryByRole('link')).toBeNull();
    expect(within(pending).getByRole('button', { name: 'Remove the reference “mica 70(1)”' })).toBeInTheDocument();
    expect(within(adding()).getByRole('textbox', { name: 'Legal act' })).toHaveValue('');
    // A second one, of an act the corpus does not hold — Enter adds as well
    await write(user, within(adding()).getByRole('textbox', { name: 'Legal act' }), 'Nežinomas aktas');
    await user.type(within(adding()).getByRole('textbox', { name: 'Article' }), '5{Enter}');
    expect(within(part(PURPOSE.heading)).getByText('Nežinomas aktas 5').closest('li')).toHaveTextContent('(to be looked up on save)');

    const sent = await save(user, puts);
    expect(sent.parts[0].legalBasis).toEqual([
      ...PURPOSE.legalBasis, { act: 'mica', article: '70', paragraph: '1', why: '' }, { act: 'Nežinomas aktas', article: '5', paragraph: '', why: '' },
    ]);
    // The server's answer replaces them: one found, with its path and the address of its text, one not
    const found = within(part(PURPOSE.heading)).getByRole('link', { name: 'Open the official text of “MiCA 70 str. 1 d.” (new tab)' });
    expect(found).toHaveAttribute('href', `${p.CORPUS.get('mica').base}#art_70`);
    const unfound = within(part(PURPOSE.heading)).getByText('Nežinomas aktas 5').closest('li');
    expect(within(unfound).getByText('The act has no such provision')).toBeInTheDocument();
    expect(within(part(PURPOSE.heading)).queryByText('(to be looked up on save)')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Rules' })).getAllByRole('listitem')[0])
      .toHaveTextContent(`The articles named are in their acts— broken${UNFOUND}, Nežinomas aktas 5`);
  });


  it('a missing document\'s legal basis takes a new provision too', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'documents' });
    const forms = screen.getAllByRole('form', { name: 'A new provision' });
    expect(forms).toHaveLength(POLICY.content.missing.length);
    await write(user, within(forms[0]).getByRole('textbox', { name: 'Legal act' }), 'DORA');
    await write(user, within(forms[0]).getByRole('textbox', { name: 'Article' }), '6');
    await user.click(within(forms[0]).getByRole('button', { name: 'Add the provision' }));
    const sent = await save(user, puts);
    expect(sent.missing[0].legalBasis).toEqual([...POLICY.content.missing[0].legalBasis, { act: 'DORA', article: '6', paragraph: '', why: '' }]);
    expect(screen.getByRole('link', { name: 'Open the official text of “DORA 6 str.” (new tab)' })).toBeInTheDocument();
  });


  it('"Discard changes" puts the server\'s text back', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing();
    const field = screen.getByRole('textbox', { name: PURPOSE.heading });
    await write(user, field, ' Papildymas.');
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('textbox', { name: PURPOSE.heading })).toHaveValue(PURPOSE.text);
    expect(puts).toHaveLength(0);
  });


  it('a document\'s level and topic: every row a select and a field named after its document', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'documents' });
    const level = screen.getByRole('combobox', { name: 'Level: 01-access-control.md' });
    expect(within(level).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Level 1 — policy', 'Level 2 — thematic policies', 'Level 3 — procedures and instructions', 'Not a rule',
    ]);
    expect(level).toHaveDisplayValue('Level 3 — procedures and instructions');
    await user.selectOptions(level, 'Level 2 — thematic policies');
    const topic = screen.getByRole('textbox', { name: 'Topic: 01-access-control.md' });
    await user.clear(topic);
    await write(user, topic, 'Prieigos politika');
    const sent = await save(user, puts);
    const row = sent.hierarchy.find((entry) => entry.document === '01-access-control.md');
    expect(row).toMatchObject({ level: 2, topic: 'Prieigos politika' });
    expect(sent.hierarchy.filter((entry) => entry.document !== '01-access-control.md')).toEqual(POLICY.content.hierarchy.filter((entry) => entry.document !== '01-access-control.md'));
    // Read again: the document moved to the second level
    await user.click(screen.getByRole('button', { name: 'Finish editing' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Level 2 — thematic policies (8)' })).toBeInTheDocument();
  });


  it('a missing document: its title, purpose, level and priority are edited, and a row is removed', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'documents' });
    const [first, second] = POLICY.content.missing;
    const title = screen.getAllByRole('textbox', { name: 'Title' })[0];
    expect(title).toHaveValue(first.title);
    await user.clear(title);
    await write(user, title, 'Atitikties stebėsenos tvarka');
    const purpose = screen.getAllByRole('textbox', { name: 'Purpose' })[0];
    await user.clear(purpose);
    await write(user, purpose, 'Nustato patikrų programą.');
    await user.selectOptions(screen.getAllByRole('combobox', { name: 'Level' })[0], 'Level 2 — thematic policies');
    await user.selectOptions(screen.getAllByRole('combobox', { name: 'Priority' })[0], 'Low');
    await user.click(screen.getByRole('button', { name: `Remove the document “${second.title}”` }));
    const sent = await save(user, puts);
    expect(sent.missing).toHaveLength(POLICY.content.missing.length - 1);
    expect(sent.missing[0]).toEqual({ ...first, title: 'Atitikties stebėsenos tvarka', purpose: 'Nustato patikrų programą.', level: 2, priority: 'low' });
    expect(sent.missing.map((row) => row.title)).not.toContain(second.title);
  });


  it('a missing document\'s part of the policy is chosen among the policy\'s own parts', async () => {
    const puts = given.spy('put', '/api/programme/:productId/content');
    const { user } = await startEditing({ tab: 'documents' });
    const part = screen.getAllByRole('combobox', { name: 'Policy part' })[0];
    expect(within(part).getAllByRole('option').map((option) => option.textContent).filter(Boolean))
      .toEqual(POLICY.content.parts.map((row) => row.heading));
    await user.selectOptions(part, 'Pasekmės už neatitikimą');
    const sent = await save(user, puts);
    expect(sent.missing[0]).toEqual({ ...POLICY.content.missing[0], supports: 'consequences' });
    expect(sent.missing.slice(1)).toEqual(POLICY.content.missing.slice(1));
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderPolicy({ locale: 'lt' });
    await screen.findByRole('tablist');
    expect(within(part('mandatas')).getByRole('heading', { level: 3, name: 'Sprendžia valdymo organas' })).toBeInTheDocument();
    expect(within(part(PURPOSE.heading)).getByText('Remiasi:')).toBeInTheDocument();
    expect(within(part(PURPOSE.heading)).getByText('Teisinis pagrindas:')).toBeInTheDocument();
    expect(within(part(CONSEQUENCES.heading)).getByText('Tokios nuostatos teisės akte nėra')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Dokumentai' }));
    expect(screen.getByRole('heading', { name: 'Dokumentų hierarchija' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '2 lygmuo — teminės politikos (7)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Ne taisyklė (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trūkstami dokumentai' })).toBeInTheDocument();
    expect(screen.getAllByText('Aukštas').length).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Redaguoti' }));
    expect(screen.getByRole('combobox', { name: 'Lygmuo: 01-access-control.md' })).toHaveDisplayValue('3 lygmuo — procedūros ir instrukcijos');
    expect(screen.getAllByRole('button', { name: /^Pašalinti dokumentą „/ })).toHaveLength(POLICY.content.missing.length);
  });
});
