// -----------------------------------------------------------
//  [*] Tests — CompanyRoles (the role profiles tab)
//
//  The roles tab of /companies/:companyId end to end against
//  the backend double, rendered in its page: the role cards
//  (the name as a heading, the context, the source count and
//  the stamp, edit and delete), the empty tab; the add dialog
//  (the name with its hint, the context with its counter and
//  the 6000-character cap, the sources — a company document
//  whose title is copied along, a section, rows added and
//  removed, the empty ones dropped, only this company's
//  documents offered — the required name, the POST body, the
//  toast and the refreshed cards); edit (pre-filled, the
//  PATCH); 409 DUPLICATE_NAME said on the name field instead
//  of the dialog's alert, until the name changes; other
//  failures in the dialog — one naming the context gone when
//  the context changes; delete; Lithuanian; and the company
//  detail's contract matrix rendered on this tab.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given, apiError, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PAVYZDYS = f.company(f.ID.pavyzdys);
const KREDITAS = f.company(f.ID.kreditas);
const [AML, COMPLIANCE] = PAVYZDYS.roles;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderRoles: the company page on ?tab=roles, the company
// answered as given (`then`: the answers of the refetches
// after a change); waits for the tab.
//
// card: the role's card, found by its heading.
//
// openAdd / openEdit: the doors into the dialog.
//
// sourceRows: the dialog's source rows (each a document
// select and a section field).
// -----------------------------------------------------------

async function renderRoles({ company = PAVYZDYS, then, locale = 'en' } = {}) {
  if (then) given.sequence('get', '/api/companies/:companyId', [{ body: company }, ...then.map((body) => ({ body }))]);
  else if (company !== PAVYZDYS) given.json('get', '/api/companies/:companyId', company);
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${company.id}?tab=roles`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: company.name });
  return view;
}

const panel = () => screen.getByRole('tabpanel');

const card = (name) => within(panel()).getByRole('heading', { level: 3, name }).closest('.MuiPaper-root');

async function openAdd(user, add = 'New role', title = 'New role') {
  await user.click(within(panel()).getByRole('button', { name: add }));
  return screen.findByRole('dialog', { name: title });
}

async function openEdit(user, name) {
  await user.click(within(card(name)).getByRole('button', { name: 'Edit' }));
  return screen.findByRole('dialog', { name: 'Edit role' });
}

const sourceRows = (dialog) => within(dialog).queryAllByRole('combobox', { name: 'Document' })
  .map((select) => select.closest('.flex.gap-2'));

async function pickDocument(user, row, title) {
  await user.click(within(row).getByRole('combobox', { name: 'Document' }));
  await user.click(await screen.findByRole('option', { name: title }));
}

const saveButton = (dialog) => within(dialog).getByRole('button', { name: 'Save' });







// -----------------------------------------------------------
// The cards
// -----------------------------------------------------------

describe('CompanyRoles — the cards', () => {

  it('titles the tab and shows one card per role, by name', async () => {
    await renderRoles();
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Roles' })).toBeInTheDocument();
    expect(within(panel()).getByText('Role profiles (e.g. the compliance officer) a chat can adopt as context.')).toBeInTheDocument();
    expect(within(panel()).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['AML pareigūnas', 'Atitikties pareigūnas']);
  });


  it('a card has the context, the source count and the update stamp, and its edit and delete actions', async () => {
    await renderRoles();
    const aml = card('AML pareigūnas');
    expect(within(aml).getByText(AML.context)).toBeInTheDocument();
    expect(within(aml).getByText('Sources: 1 · Updated 08/09/2026, 11:00')).toBeInTheDocument();
    expect(within(aml).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Edit', 'Delete']);
    expect(within(card('Atitikties pareigūnas')).getByText('Sources: 1 · Updated 12/09/2026, 14:10')).toBeInTheDocument();
  });


  it('a role without context or sources shows a dash and "Sources: 0"', async () => {
    await renderRoles({ company: { ...PAVYZDYS, roles: [{ ...AML, context: '', sources: [] }] } });
    const aml = card('AML pareigūnas');
    expect(within(aml).getByText('—')).toBeInTheDocument();
    expect(within(aml).getByText(/^Sources: 0 · /)).toBeInTheDocument();
  });


  it('no roles → the empty state with its own "New role" (the header has none then)', async () => {
    await renderRoles({ company: KREDITAS });
    // The empty state's words are a polite status
    const status = within(panel()).getByText('No roles yet').closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('The assistant saves the roles it finds in the documents you upload, in a chat or on the Documents tab. You can also create one yourself, such as “Compliance officer”.');
    expect(within(panel()).getAllByRole('button', { name: 'New role' })).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Adding
// -----------------------------------------------------------

describe('CompanyRoles — adding', () => {

  it('the dialog: the name (focused, with its hint), the context with its counter, the sources and "Add a source"', async () => {
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toBeRequired();
    expect(within(dialog).getByText('E.g. Compliance officer')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Role context' })).toHaveValue('');
    expect(within(dialog).getByText('Duties, reporting line, independence, conflicts of interest. 0 / 6000 chars')).toBeInTheDocument();
    expect(within(dialog).getByText('Which documents and sections the role is drawn from.')).toBeInTheDocument();
    expect(sourceRows(dialog)).toHaveLength(0);
    expect(within(dialog).getByRole('button', { name: 'Add a source' })).toBeEnabled();
  });


  it('creates a role: the POST carries the trimmed name, the context and the sources with the document\'s title copied along', async () => {
    const created = { ...f.NEW.role, name: 'Duomenų apsaugos pareigūnas' };
    const posts = given.capture('post', '/api/companies/:companyId/roles', created, { status: 201 });
    const { user } = await renderRoles({ then: [{ ...PAVYZDYS, roles: [AML, COMPLIANCE, created] }] });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '  Duomenų apsaugos pareigūnas ');
    await user.type(within(dialog).getByRole('textbox', { name: 'Role context' }), 'Prižiūri asmens duomenų tvarkymą.');
    await user.click(within(dialog).getByRole('button', { name: 'Add a source' }));
    const [row] = sourceRows(dialog);
    await pickDocument(user, row, 'Atitikties politika');
    await user.type(within(row).getByRole('textbox', { name: 'Section' }), '7.2 Atitikties pareigūnas');
    await user.click(saveButton(dialog));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/roles`));
    expect(posts[0].body).toEqual({
      name: 'Duomenų apsaugos pareigūnas',
      context: 'Prižiūri asmens duomenų tvarkymą.',
      sources: [{ documentId: f.ID.policyDoc, title: 'Atitikties politika', section: '7.2 Atitikties pareigūnas' }],
    });
    expect(await screen.findByText('Role created')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(panel()).findByRole('heading', { level: 3, name: 'Duomenų apsaugos pareigūnas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Roles (3)' })).toBeInTheDocument();
  });


  it('a source may be a document alone or a section alone; an untouched row is dropped', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', f.NEW.role, { status: 201 });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Vidaus auditorius');
    for (let i = 0; i < 3; i += 1) await user.click(within(dialog).getByRole('button', { name: 'Add a source' }));
    const [first, second] = sourceRows(dialog);
    await pickDocument(user, first, 'IRT incidentų registras');
    await user.type(within(second).getByRole('textbox', { name: 'Section' }), 'Valdybos nutarimas Nr. 5');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.sources).toEqual([
      { documentId: f.ID.registerDoc, title: 'IRT incidentų registras' },
      { section: 'Valdybos nutarimas Nr. 5' },
    ]);
  });


  it('the document select offers only this company\'s documents, after a "—" for none', async () => {
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('button', { name: 'Add a source' }));
    await user.click(within(sourceRows(dialog)[0]).getByRole('combobox', { name: 'Document' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      '—', 'Atitikties politika', 'Pinigų plovimo prevencijos procedūra', 'Leidimo išrašas', 'IRT incidentų registras', 'IT paslaugų užsakomųjų paslaugų sutartis',
    ]);
  });


  it('"Remove the source" takes its row out', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', f.NEW.role, { status: 201 });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rizikos vadovas');
    await user.click(within(dialog).getByRole('button', { name: 'Add a source' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add a source' }));
    const [first, second] = sourceRows(dialog);
    await user.type(within(first).getByRole('textbox', { name: 'Section' }), 'Pirmas');
    await user.type(within(second).getByRole('textbox', { name: 'Section' }), 'Antras');
    await user.click(within(first).getByRole('button', { name: 'Remove the source' }));
    expect(sourceRows(dialog)).toHaveLength(1);
    await user.click(saveButton(dialog));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.sources).toEqual([{ section: 'Antras' }]);
  });


  it('a section is cut to 300 characters as it is typed', async () => {
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('button', { name: 'Add a source' }));
    const section = within(sourceRows(dialog)[0]).getByRole('textbox', { name: 'Section' });
    await user.click(section);
    await user.paste('s'.repeat(350));
    expect(section).toHaveValue('s'.repeat(300));
  });


  it('refuses a missing name before any request', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', f.NEW.role, { status: 201 });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '   ');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(within(dialog).queryByText('E.g. Compliance officer')).toBeNull();
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('the context counter follows the text; over 6000 characters is refused on the field', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', f.NEW.role, { status: 201 });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Ilgas');
    const context = within(dialog).getByRole('textbox', { name: 'Role context' });
    await user.click(context);
    await user.paste('k'.repeat(6000));
    expect(within(dialog).getByText('Duties, reporting line, independence, conflicts of interest. 6000 / 6000 chars')).toBeInTheDocument();
    await user.type(context, 'k');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('The context is too long (at most 6000 characters)')).toBeInTheDocument();
    expect(context).toHaveAttribute('aria-invalid', 'true');
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('exactly 6000 characters are allowed', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', f.NEW.role, { status: 201 });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Ilgas');
    await user.click(within(dialog).getByRole('textbox', { name: 'Role context' }));
    await user.paste('k'.repeat(6000));
    await user.click(saveButton(dialog));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.context).toHaveLength(6000);
  });


  it('409 DUPLICATE_NAME is said on the name field, not as the dialog\'s alert; the dialog stays', async () => {
    given.apiError('post', '/api/companies/:companyId/roles', 'DUPLICATE_NAME', { status: 409, error: 'This company already has a role with that name' });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.type(name, 'AML pareigūnas');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('This name is already in use.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('This name is already in use.');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    // Silent: no toast either
    expect(screen.getAllByText('This name is already in use.')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'New role' })).toBeInTheDocument();
  });


  it('the DUPLICATE_NAME leaves the name field as soon as the name changes — not when the context does, and without a request', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', apiError('DUPLICATE_NAME', 'This company already has a role with that name'), { status: 409 });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.type(name, 'AML pareigūnas');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('This name is already in use.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Role context' }), 'Atskaitomybė valdybai.');
    expect(name).toHaveAccessibleDescription('This name is already in use.');
    await user.type(name, ' 2');
    expect(within(dialog).queryByText('This name is already in use.')).toBeNull();
    expect(name).not.toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('E.g. Compliance officer');
    expect(posts).toHaveLength(1);
  });


  it('a refusal naming the context leaves the dialog as soon as the context changes, not the name', async () => {
    given.apiError('post', '/api/companies/:companyId/roles', 'INVALID_FIELD', { status: 400, error: 'context is limited to 6000 characters' });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rolė');
    await user.type(within(dialog).getByRole('textbox', { name: 'Role context' }), 'Pareigos.');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('context is limited to 6000 characters');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' 2');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('context is limited to 6000 characters');
    await user.type(within(dialog).getByRole('textbox', { name: 'Role context' }), '{Backspace}');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('any other failure is the dialog\'s alert, in words', async () => {
    given.apiError('post', '/api/companies/:companyId/roles', 'INVALID_FIELD', { status: 400, error: 'sources must be a list of {documentId, title, section} objects' });
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rolė');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('sources must be a list of {documentId, title, section} objects');
    expect(within(dialog).getByText('E.g. Compliance officer')).toBeInTheDocument();
  });


  it('a dropped connection is the dialog\'s alert; while saving the dialog is busy', async () => {
    given.networkError('post', '/api/companies/:companyId/roles');
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rolė');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });


  it('while saving, Save and Cancel are disabled', async () => {
    given.hang('post', '/api/companies/:companyId/roles');
    const { user } = await renderRoles();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rolė');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Save/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });


  it('the empty tab\'s "New role" creates the first one', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/roles', { ...f.NEW.role, companyId: f.ID.kreditas }, { status: 201 });
    const { user } = await renderRoles({ company: KREDITAS });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Atitikties pareigūnas{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/companies/${f.ID.kreditas}/roles`));
    expect(posts[0].body).toEqual({ name: 'Atitikties pareigūnas', context: '', sources: [] });
  });
});







// -----------------------------------------------------------
// Editing and deleting
// -----------------------------------------------------------

describe('CompanyRoles — editing and deleting', () => {

  it('the pencil opens the role pre-filled, its sources included', async () => {
    const { user } = await renderRoles();
    const dialog = await openEdit(user, 'AML pareigūnas');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('AML pareigūnas');
    expect(within(dialog).getByRole('textbox', { name: 'Role context' })).toHaveValue(AML.context);
    expect(within(dialog).getByText(`Duties, reporting line, independence, conflicts of interest. ${AML.context.length} / 6000 chars`)).toBeInTheDocument();
    const [row] = sourceRows(dialog);
    expect(within(row).getByRole('combobox', { name: 'Document' })).toHaveTextContent('Pinigų plovimo prevencijos procedūra');
    expect(within(row).getByRole('textbox', { name: 'Section' })).toHaveValue('3 Atsakingi asmenys');
  });


  it('a source naming a document the company does not hold shows no selection and says which document it names', async () => {
    const glossary = { ...AML, sources: [{ title: 'Role Definitions Glossary', section: '2' }, ...AML.sources] };
    const { user } = await renderRoles({ company: { ...PAVYZDYS, roles: [glossary] } });
    const dialog = await openEdit(user, 'AML pareigūnas');
    const [unknown, held] = sourceRows(dialog);
    expect(within(unknown).getByRole('combobox', { name: 'Document' })).not.toHaveTextContent('Role Definitions Glossary');
    expect(within(unknown).getByText('Not among the company\'s documents: Role Definitions Glossary')).toBeInTheDocument();
    expect(within(held).getByRole('combobox', { name: 'Document' })).toHaveTextContent('Pinigų plovimo prevencijos procedūra');
    expect(within(held).queryByText(/Not among the company's documents/)).not.toBeInTheDocument();
  });


  it('saving keeps a source that names a document the company does not hold, even without a section', async () => {
    const glossary = { ...AML, sources: [{ title: 'Role Definitions Glossary' }, ...AML.sources] };
    const { user } = await renderRoles({ company: { ...PAVYZDYS, roles: [glossary] } });
    const patches = given.capture('patch', '/api/companies/:companyId/roles/:roleId', glossary);
    const dialog = await openEdit(user, 'AML pareigūnas');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body.sources).toEqual([{ title: 'Role Definitions Glossary' }, ...AML.sources]);
  });


  it('Save PATCHes the role with the whole form, toasts and the cards refresh', async () => {
    const renamed = { ...AML, name: 'AML ir sankcijų pareigūnas' };
    const patches = given.capture('patch', '/api/companies/:companyId/roles/:roleId', renamed);
    const { user } = await renderRoles({ then: [{ ...PAVYZDYS, roles: [renamed, COMPLIANCE] }] });
    const dialog = await openEdit(user, 'AML pareigūnas');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'AML ir sankcijų pareigūnas');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/roles/${f.ID.amlOfficer}`));
    expect(patches[0].body).toEqual({
      name: 'AML ir sankcijų pareigūnas',
      context: AML.context,
      sources: [{ documentId: f.ID.procedureDoc, title: 'Pinigų plovimo prevencijos procedūra', section: '3 Atsakingi asmenys' }],
    });
    expect(await screen.findByText('Role updated')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(panel()).findByRole('heading', { level: 3, name: 'AML ir sankcijų pareigūnas' })).toBeInTheDocument();
  });


  it('picking another document for a source copies that document\'s title', async () => {
    const patches = given.capture('patch', '/api/companies/:companyId/roles/:roleId', AML);
    const { user } = await renderRoles();
    const dialog = await openEdit(user, 'AML pareigūnas');
    await pickDocument(user, sourceRows(dialog)[0], 'Atitikties politika');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body.sources).toEqual([{ documentId: f.ID.policyDoc, title: 'Atitikties politika', section: '3 Atsakingi asmenys' }]);
  });


  it('a DUPLICATE_NAME on a rename is said on the name field too', async () => {
    given.apiError('patch', '/api/companies/:companyId/roles/:roleId', 'DUPLICATE_NAME', { status: 409, error: 'This company already has a role with that name' });
    const { user } = await renderRoles();
    const dialog = await openEdit(user, 'AML pareigūnas');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Atitikties pareigūnas');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('This name is already in use.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    // Renaming again takes it off
    await user.type(name, ' (AML)');
    expect(within(dialog).queryByText('This name is already in use.')).toBeNull();
  });


  it('in Lithuanian an INVALID_FIELD refusal names the field by its label — the context, the sources', async () => {
    given.sequence('patch', '/api/companies/:companyId/roles/:roleId', [
      { status: 400, body: apiError('INVALID_FIELD', 'context is limited to 6000 characters') },
      { status: 400, body: apiError('INVALID_FIELD', 'sources must be a list of {documentId, title, section} objects') },
    ]);
    const { user } = await renderRoles({ locale: 'lt' });
    await user.click(within(card('AML pareigūnas')).getByRole('button', { name: 'Redaguoti' }));
    const dialog = await screen.findByRole('dialog', { name: 'Redaguoti rolę' });
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Neteisinga lauko „Rolės kontekstas“ reikšmė.');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Neteisinga lauko „Šaltiniai“ reikšmė.'));
  });


  it('the old refusal is gone when the dialog opens again', async () => {
    given.apiError('patch', '/api/companies/:companyId/roles/:roleId', 'DUPLICATE_NAME', { status: 409 });
    const { user } = await renderRoles();
    let dialog = await openEdit(user, 'AML pareigūnas');
    await user.click(saveButton(dialog));
    await within(dialog).findByText('This name is already in use.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openEdit(user, 'Atitikties pareigūnas');
    expect(within(dialog).queryByText('This name is already in use.')).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Atitikties pareigūnas');
  });


  it('Delete asks first, naming the role and what happens to its chats, then DELETEs it', async () => {
    const deletes = given.capture('delete', '/api/companies/:companyId/roles/:roleId', { ok: true });
    const { user } = await renderRoles({ then: [{ ...PAVYZDYS, roles: [COMPLIANCE] }] });
    await user.click(within(card('AML pareigūnas')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the role “AML pareigūnas”?' });
    expect(within(dialog).getByText('The role is unlinked from the chats that used it.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/roles/${f.ID.amlOfficer}`));
    expect(await screen.findByText('Role deleted')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(panel()).queryByRole('heading', { level: 3, name: 'AML pareigūnas' })).toBeNull());
  });


  it('Cancel on the delete sends nothing; a failed delete is said inside its dialog', async () => {
    given.apiError('delete', '/api/companies/:companyId/roles/:roleId', 'SERVER_ERROR', { status: 500 });
    const { user } = await renderRoles();
    await user.click(within(card('AML pareigūnas')).getByRole('button', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete the role “AML pareigūnas”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(within(card('AML pareigūnas')).getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete the role “AML pareigūnas”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('CompanyRoles — Lithuanian', () => {

  it('speaks Lithuanian: the cards, the dialog, the rules, the duplicate name and the toast', async () => {
    given.sequence('post', '/api/companies/:companyId/roles', [
      { status: 409, body: apiError('DUPLICATE_NAME', 'This company already has a role with that name') },
      { status: 201, body: f.NEW.role },
    ]);
    const { user } = await renderRoles({ locale: 'lt' });
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Rolės' })).toBeInTheDocument();
    expect(within(card('AML pareigūnas')).getByText('Šaltinių: 1 · Atnaujinta 2026-09-08 11:00')).toBeInTheDocument();

    const dialog = await openAdd(user, 'Nauja rolė', 'Nauja rolė');
    expect(within(dialog).getByText('Pareigos, atskaitomybė, nepriklausomumas, interesų konfliktai. 0 / 6000 simb.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Pridėti šaltinį' }));
    expect(within(dialog).getByRole('combobox', { name: 'Dokumentas' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Skirsnis' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await within(dialog).findByText('Įveskite pavadinimą')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Pavadinimas' }), 'AML pareigūnas');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await within(dialog).findByText('Toks pavadinimas jau naudojamas.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await screen.findByText('Rolė sukurta')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The company detail's matrix again, rendered on this tab:
// the role cards come from it.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/companies/:companyId',
  fixture: PAVYZDYS,
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=roles`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('main')).getByRole('link', { name: 'Companies' }),
  loaded: async () => { await screen.findByRole('heading', { level: 3, name: 'AML pareigūnas' }); },
  loading: () => screen.getByRole('heading', { level: 1 }).querySelector('.MuiSkeleton-root'),
});
