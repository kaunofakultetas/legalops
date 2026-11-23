// -----------------------------------------------------------
//  [*] Tests — CompanyCredentials (licences, permits and
//      certificates tab)
//
//  The credentials tab of /companies/:companyId end to end
//  against the backend double, rendered in its page: the grid
//  (the translated kind, the issuer and number or a dash, the
//  validity in its four shapes, "Expired" for a past end
//  date, the claimed / verified pill and the verification
//  date, the evidence document's title, the row actions, the
//  order kept in ?credentials.sort=), the empty tab; the add
//  dialog (its fields, the evidence select
//  offering only this company's documents, the labelled
//  claimed / verified choice, the required name, the date
//  order, the POST body with nulls for the blanks, the toast,
//  the refreshed list); edit (pre-filled, the PATCH of the
//  changed fields only);
//  verify and unverify (the confirmation, the {status} PATCH,
//  the verification stamp the backend sets); remove; the
//  refusals said inside the dialog (INVALID_FIELD naming the
//  field — the prose in English, the label in Lithuanian),
//  failures and the busy dialog; Lithuanian; and the company
//  detail's contract matrix rendered on this tab.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given, apiError, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PAVYZDYS = f.company(f.ID.pavyzdys);
const KREDITAS = f.company(f.ID.kreditas);
const [LICENCE, ISO] = PAVYZDYS.credentials;
const LICENCE_NAME = 'Kriptoturto paslaugų teikėjo leidimas';
const ISO_NAME = 'ISO/IEC 27001 sertifikatas';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderCredentials: the company page on ?tab=credentials,
// the company answered as given (a list for a refetch — the
// detail is fetched again after every change); waits for
// the tab.
//
// gridRows / rowOf: the grid's cell texts; the row holding a
// text.
//
// openAdd / openEdit / rowAction: the doors into the dialogs.
//
// fillDate: a date input takes its ISO value (typing into a
// type="date" input is not what users do either — they pick).
// -----------------------------------------------------------

async function renderCredentials({ company = PAVYZDYS, then, locale = 'en' } = {}) {
  if (then) given.sequence('get', '/api/companies/:companyId', [{ body: company }, ...then.map((body) => ({ body }))]);
  else if (company !== PAVYZDYS) given.json('get', '/api/companies/:companyId', company);
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${company.id}?tab=credentials`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: company.name });
  return view;
}

const panel = () => screen.getByRole('tabpanel');

const gridRows = () => within(screen.getByRole('grid')).queryAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
  .filter((cells) => cells.length > 0);

const rowOf = (text) => within(screen.getByRole('grid')).getByText(text).closest('[role="row"]');

async function openAdd(user, add = 'Add an entry', title = 'New licence or credential') {
  await user.click(within(panel()).getByRole('button', { name: add }));
  return screen.findByRole('dialog', { name: title });
}

async function rowAction(user, text, action) {
  await user.click(within(rowOf(text)).getByRole('button', { name: action }));
}

async function openEdit(user, text) {
  await rowAction(user, text, 'Edit');
  return screen.findByRole('dialog', { name: 'Edit licence or credential' });
}

const fillDate = (dialog, label, value) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });

async function pick(user, dialog, label, option) {
  await user.click(within(dialog).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const saveButton = (dialog) => within(dialog).getByRole('button', { name: 'Save' });







// -----------------------------------------------------------
// The grid
// -----------------------------------------------------------

describe('CompanyCredentials — the grid', () => {

  it('comes back in the order the address keeps under its own name (?credentials.sort=)', async () => {
    const view = renderPage(<CompanyDetail authData={authData} />, {
      route: `/companies/${PAVYZDYS.id}?tab=credentials&credentials.sort=name.desc`, path: '/companies/:companyId',
    });
    await screen.findByRole('heading', { level: 1, name: PAVYZDYS.name });
    const names = gridRows().map((cells) => cells[1]);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
    expect(within(screen.getByRole('grid')).getByRole('columnheader', { name: /^Name/ })).toHaveAttribute('aria-sort', 'descending');
    view.unmount();
  });


  it('titles the tab and explains what it is for', async () => {
    await renderCredentials();
    expect(within(panel()).getByRole('heading', { name: 'Licences, permits and certificates' })).toBeInTheDocument();
    expect(within(panel()).getByText('What the company already holds — the analysis checks obligations against these first.')).toBeInTheDocument();
    expect(within(panel()).getByRole('grid', { name: 'Licences, permits and certificates' })).toBeInTheDocument();
  });


  it('lists every credential oldest first: kind, name, issuer, number, validity, status with the verification date, the evidence document', async () => {
    await renderCredentials();
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Kind', 'Name', 'Issuer', 'Number', 'Validity', 'Status', 'Evidence', 'Actions']);
    expect(gridRows()).toEqual([
      ['Licence', LICENCE_NAME, 'Lietuvos bankas', 'KTPT-2026-017', 'from 01/07/2026', 'VerifiedVerified 10/09/2026', 'Leidimo išrašas', ''],
      ['Certificate', ISO_NAME, 'UAB Sertifikavimo centras', 'ISMS-2025-0042', '15/11/2025 – 14/11/2028', 'Claimed', '—', ''],
    ]);
  });


  it('a verified row offers "Set back to claimed", a claimed one "Mark as verified"; both can be edited and removed', async () => {
    await renderCredentials();
    const licence = rowOf(LICENCE_NAME);
    expect(within(licence).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Edit', 'Set back to claimed', 'Remove']);
    const iso = rowOf(ISO_NAME);
    expect(within(iso).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Edit', 'Mark as verified', 'Remove']);
  });


  it('the validity in its four shapes, and "Expired" for an end date already past', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-27T10:00:00Z') });
    const credential = (id, name, validFrom, validTo) => ({ ...ISO, id: `c1000000-0000-4000-8000-0000000000${id}`, name, validFrom, validTo });
    await renderCredentials({
      company: {
        ...PAVYZDYS,
        credentials: [
          credential('a1', 'Be datų', null, null),
          credential('a2', 'Tik pabaiga', null, '2027-01-31'),
          credential('a3', 'Pasibaigęs', '2024-01-01', '2026-09-26'),
          credential('a4', 'Baigiasi šiandien', null, '2026-09-27'),
        ],
      },
    });
    expect(gridRows().map((cells) => [cells[1], cells[4]])).toEqual([
      ['Be datų', '—'],
      ['Tik pabaiga', 'until 31/01/2027'],
      ['Pasibaigęs', '01/01/2024 – 26/09/2026Expired'],
      ['Baigiasi šiandien', 'until 27/09/2026'],
    ]);
  });


  it('"Expired" follows the local calendar: at 00:30 in Vilnius (still yesterday in UTC) yesterday\'s last valid day is over', async () => {
    const zone = process.env.TZ;
    process.env.TZ = 'Europe/Vilnius';
    try {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-26T21:30:00Z') });
      await renderCredentials({ company: { ...PAVYZDYS, credentials: [{ ...ISO, validFrom: null, validTo: '2026-09-26' }] } });
      expect(within(rowOf(ISO_NAME)).getByText('Expired')).toBeInTheDocument();
    } finally {
      process.env.TZ = zone;
    }
  });


  it('a missing issuer or number reads as a dash; an evidence document the company no longer has as a dash too', async () => {
    await renderCredentials({
      company: { ...PAVYZDYS, credentials: [{ ...LICENCE, issuer: null, identifier: null, evidenceDocumentId: f.ID.scanDoc }] },
    });
    const [cells] = gridRows();
    expect(cells[2]).toBe('—');
    expect(cells[3]).toBe('—');
    expect(cells[6]).toBe('—');
  });


  it('a company without credentials gets the empty state with its own "Add an entry", and no grid', async () => {
    await renderCredentials({ company: KREDITAS });
    // The empty state's words are a polite status
    const status = within(panel()).getByText('No entries yet').closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('Record the licences, permits, registrations and certificates the company holds.');
    expect(within(panel()).queryByRole('grid')).toBeNull();
    // One way in: the empty state's (the header has none then)
    expect(within(panel()).getAllByRole('button', { name: 'Add an entry' })).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Adding
// -----------------------------------------------------------

describe('CompanyCredentials — adding', () => {

  it('the dialog has every field: kind (Licence), name (focused), issuer, number, the dates, scope, notes, the evidence and the status choice', async () => {
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    expect(within(dialog).getByRole('combobox', { name: 'Kind' })).toHaveTextContent('Licence');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: 'Issuing authority' })).toHaveValue('');
    expect(within(dialog).getByText('E.g. Bank of Lithuania')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Number / identifier' })).toHaveValue('');
    expect(within(dialog).getByLabelText('Valid from')).toHaveAttribute('type', 'date');
    expect(within(dialog).getByLabelText('Valid to')).toHaveAttribute('type', 'date');
    expect(within(dialog).getByRole('textbox', { name: 'Scope' })).toHaveValue('');
    expect(within(dialog).getByText('Which activities or services it covers')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Notes' })).toHaveValue('');
    // Nothing picked: the select stays empty under its label ("None" is the list's first entry)
    expect(within(dialog).getByRole('combobox', { name: 'Evidence document' })).toHaveTextContent(/^\u200b?$/);
    expect(within(dialog).getByText('One of this company\'s uploaded documents.')).toBeInTheDocument();
  });


  it('the status is a labelled choice between claimed and verified, each saying what it means; claimed is the default', async () => {
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    const status = within(dialog).getByRole('radiogroup', { name: 'Status' });
    const claimed = within(status).getByRole('radio', { name: 'Claimed — stated by the company, nobody checked it.' });
    const verified = within(status).getByRole('radio', { name: 'Verified — a person checked it in the issuer\'s register or against an evidence document.' });
    expect(claimed).toBeChecked();
    expect(verified).not.toBeChecked();
  });


  it('offers every credential kind, translated, the licence first', async () => {
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Kind' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Licence', 'Permit', 'Registration', 'Certificate']);
  });


  it('the evidence select offers only THIS company\'s documents (oldest upload first) — not the chat\'s loose file, not another company\'s', async () => {
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Evidence document' }));
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(options).toEqual(['None', 'Atitikties politika', 'Pinigų plovimo prevencijos procedūra', 'Leidimo išrašas', 'IRT incidentų registras', 'IT paslaugų užsakomųjų paslaugų sutartis']);
    expect(options).not.toContain('Klientų skundų nagrinėjimo tvarka');
    expect(options).not.toContain('Kreditavimo taisyklės (skenuota kopija)');
  });


  it('a company without documents offers only "None"', async () => {
    const { user } = await renderCredentials({ company: { ...KREDITAS, documents: [] } });
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Evidence document' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['None']);
  });


  it('adds a full entry: the POST carries every field (trimmed), the picked evidence and the status; then the toast and the refreshed list', async () => {
    const created = { ...f.NEW.credential, kind: 'permit', name: 'Mokėjimo įstaigos licencija', status: 'verified', verifiedBy: f.ID.admin, verifiedAt: f.NOW, evidenceDocumentId: f.ID.licenceDoc };
    const posts = given.capture('post', '/api/companies/:companyId/credentials', created, { status: 201 });
    const { user } = await renderCredentials({ then: [{ ...PAVYZDYS, credentials: [...PAVYZDYS.credentials, created] }] });
    const dialog = await openAdd(user);
    await pick(user, dialog, 'Kind', 'Permit');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Mokėjimo įstaigos licencija ');
    await user.type(within(dialog).getByRole('textbox', { name: 'Issuing authority' }), 'Lietuvos bankas ');
    await user.type(within(dialog).getByRole('textbox', { name: 'Number / identifier' }), ' MI-2026-003');
    fillDate(dialog, 'Valid from', '2026-08-01');
    fillDate(dialog, 'Valid to', '2031-07-31');
    await user.type(within(dialog).getByRole('textbox', { name: 'Scope' }), 'Mokėjimo paslaugos');
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Išrašas pridėtas.');
    await pick(user, dialog, 'Evidence document', 'Leidimo išrašas');
    await user.click(within(dialog).getByRole('radio', { name: /^Verified/ }));
    await user.click(saveButton(dialog));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/credentials`));
    expect(posts[0].body).toEqual({
      kind: 'permit', name: 'Mokėjimo įstaigos licencija', issuer: 'Lietuvos bankas', identifier: 'MI-2026-003',
      validFrom: '2026-08-01', validTo: '2031-07-31', scope: 'Mokėjimo paslaugos', notes: 'Išrašas pridėtas.',
      status: 'verified', evidenceDocumentId: f.ID.licenceDoc,
    });
    expect(await screen.findByText('Entry added')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The page's company is fetched again and lists it
    expect(await within(screen.getByRole('grid')).findByText('Mokėjimo įstaigos licencija')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Licences and credentials (3)' })).toBeInTheDocument();
  });


  it('the blanks travel as null (issuer, number, dates, evidence), the texts as empty strings, the status as claimed', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', f.NEW.credential, { status: 201 });
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Naujas sertifikatas');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({
      kind: 'license', name: 'Naujas sertifikatas', issuer: null, identifier: null, validFrom: null, validTo: null,
      scope: '', notes: '', status: 'claimed', evidenceDocumentId: null,
    });
  });


  it('the empty tab\'s "Add an entry" adds the first one', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', { ...f.NEW.credential, companyId: f.ID.kreditas }, { status: 201 });
    const { user } = await renderCredentials({ company: KREDITAS });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Vartojimo kredito davėjų sąrašas');
    await pick(user, dialog, 'Kind', 'Registration');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/companies/${f.ID.kreditas}/credentials`));
    expect(posts[0].body).toMatchObject({ kind: 'registration', name: 'Vartojimo kredito davėjų sąrašas' });
  });


  it('refuses a missing name before any request, and says so only after the first attempt', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', f.NEW.credential, { status: 201 });
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    expect(within(dialog).queryByText('Enter a name')).toBeNull();
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '   ');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('refuses an end date before the start date, on the end date', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', f.NEW.credential, { status: 201 });
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Leidimas');
    fillDate(dialog, 'Valid from', '2026-08-01');
    fillDate(dialog, 'Valid to', '2026-07-31');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('The end date cannot be before the start date')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Valid to')).toHaveAttribute('aria-invalid', 'true');
    await settle(100);
    expect(posts).toHaveLength(0);

    // The same day is a valid one-day range
    fillDate(dialog, 'Valid to', '2026-08-01');
    expect(within(dialog).queryByText('The end date cannot be before the start date')).toBeNull();
    await user.click(saveButton(dialog));
    await waitFor(() => expect(posts).toHaveLength(1));
  });


  it('Enter in a field submits the form', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', f.NEW.credential, { status: 201 });
    const { user } = await renderCredentials();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Leidimas{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
  });


  it('Cancel closes without a request; the dialog opens blank again', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', f.NEW.credential, { status: 201 });
    const { user } = await renderCredentials();
    let dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Neišsaugotas');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openAdd(user);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(posts).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Editing
// -----------------------------------------------------------

describe('CompanyCredentials — editing', () => {

  it('the pencil opens the entry pre-filled — dates, evidence and status included', async () => {
    const { user } = await renderCredentials();
    const dialog = await openEdit(user, LICENCE_NAME);
    expect(within(dialog).getByRole('combobox', { name: 'Kind' })).toHaveTextContent('Licence');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(LICENCE_NAME);
    expect(within(dialog).getByRole('textbox', { name: 'Issuing authority' })).toHaveValue('Lietuvos bankas');
    expect(within(dialog).getByRole('textbox', { name: 'Number / identifier' })).toHaveValue('KTPT-2026-017');
    expect(within(dialog).getByLabelText('Valid from')).toHaveValue('2026-07-01');
    expect(within(dialog).getByLabelText('Valid to')).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: 'Scope' })).toHaveValue(LICENCE.scope);
    expect(within(dialog).getByRole('textbox', { name: 'Notes' })).toHaveValue('Patikrinta pagal leidimo išrašą.');
    expect(within(dialog).getByRole('combobox', { name: 'Evidence document' })).toHaveTextContent('Leidimo išrašas');
    expect(within(dialog).getByRole('radio', { name: /^Verified/ })).toBeChecked();
  });


  it('Save sends a PATCH with only the changed fields, then the toast and the refreshed list', async () => {
    const patches = given.capture('patch', '/api/companies/:companyId/credentials/:credentialId', { ...ISO, validTo: '2029-11-14' });
    const { user } = await renderCredentials({ then: [{ ...PAVYZDYS, credentials: [LICENCE, { ...ISO, validTo: '2029-11-14' }] }] });
    const dialog = await openEdit(user, ISO_NAME);
    fillDate(dialog, 'Valid to', '2029-11-14');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/credentials/${f.ID.iso27001}`));
    // Only the date: re-sending the status the page once showed
    // would un-verify an entry someone verified meanwhile
    expect(patches[0].body).toEqual({ validTo: '2029-11-14' });
    expect(await screen.findByText('Entry updated')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(screen.getByRole('grid')).findByText('15/11/2025 – 14/11/2029')).toBeInTheDocument();
  });


  it('an evidence document can be attached and detached again ("None" sends null)', async () => {
    const patches = given.capture('patch', '/api/companies/:companyId/credentials/:credentialId', LICENCE);
    const { user } = await renderCredentials();
    const dialog = await openEdit(user, LICENCE_NAME);
    await pick(user, dialog, 'Evidence document', 'None');
    await user.click(saveButton(dialog));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body.evidenceDocumentId).toBeNull();
  });


  it('a refusal is said inside the dialog in the backend\'s own words (English UI), the dialog stays', async () => {
    given.apiError('patch', '/api/companies/:companyId/credentials/:credentialId', 'INVALID_FIELD', { status: 400, error: 'evidenceDocumentId must be one of this company\'s documents' });
    const { user } = await renderCredentials();
    const dialog = await openEdit(user, ISO_NAME);
    await pick(user, dialog, 'Evidence document', 'Atitikties politika');
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('evidenceDocumentId must be one of this company\'s documents');
    // Silent: not toasted as well
    expect(screen.getAllByText('evidenceDocumentId must be one of this company\'s documents')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Edit licence or credential' })).toBeInTheDocument();
  });


  it('in Lithuanian an INVALID_FIELD refusal names the field by its label', async () => {
    given.apiError('patch', '/api/companies/:companyId/credentials/:credentialId', 'INVALID_FIELD', { status: 400, error: 'evidenceDocumentId must be one of this company\'s documents' });
    const { user } = await renderCredentials({ locale: 'lt' });
    await user.click(within(rowOf(ISO_NAME)).getByRole('button', { name: 'Redaguoti' }));
    const dialog = await screen.findByRole('dialog', { name: 'Redaguoti leidimą ar licenciją' });
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Neteisinga lauko „Įrodantis dokumentas“ reikšmė.');
    expect(alert).not.toHaveTextContent('evidenceDocumentId');
  });


  it('a server failure is said in words; the dialog is busy while the request is on the wire', async () => {
    given.sequence('patch', '/api/companies/:companyId/credentials/:credentialId', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
    ]);
    const { user } = await renderCredentials();
    const dialog = await openEdit(user, ISO_NAME);
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
  });


  it('while saving, Save and Cancel are disabled and Escape does not close', async () => {
    given.hang('patch', '/api/companies/:companyId/credentials/:credentialId');
    const { user } = await renderCredentials();
    const dialog = await openEdit(user, ISO_NAME);
    await user.click(saveButton(dialog));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Save/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await settle(100);
    expect(screen.getByRole('dialog', { name: 'Edit licence or credential' })).toBeInTheDocument();
  });


  it('an old refusal is gone when another entry is opened', async () => {
    given.apiError('patch', '/api/companies/:companyId/credentials/:credentialId', 'SERVER_ERROR', { status: 500 });
    const { user } = await renderCredentials();
    let dialog = await openEdit(user, ISO_NAME);
    await user.click(saveButton(dialog));
    await within(dialog).findByRole('alert');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openEdit(user, LICENCE_NAME);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Verify, unverify, remove
// -----------------------------------------------------------

describe('CompanyCredentials — verify, unverify, remove', () => {

  it('"Mark as verified" asks for the person\'s confirmation, PATCHes the status alone, and the list shows the stamp the backend set', async () => {
    const stamped = { ...ISO, status: 'verified', verifiedBy: f.ID.admin, verifiedAt: f.NOW };
    const patches = given.capture('patch', '/api/companies/:companyId/credentials/:credentialId', stamped);
    const { user } = await renderCredentials({ then: [{ ...PAVYZDYS, credentials: [LICENCE, stamped] }] });
    await rowAction(user, ISO_NAME, 'Mark as verified');
    const dialog = await screen.findByRole('dialog', { name: `Mark “${ISO_NAME}” as verified?` });
    expect(within(dialog).getByText(/You confirm that you personally checked this entry/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Mark as verified' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/credentials/${f.ID.iso27001}`));
    expect(patches[0].body).toEqual({ status: 'verified' });
    expect(await screen.findByText('Marked as verified')).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf(ISO_NAME)).getByText('Verified 27/09/2026')).toBeInTheDocument());
    expect(within(rowOf(ISO_NAME)).getByRole('button', { name: 'Set back to claimed' })).toBeInTheDocument();
  });


  it('"Set back to claimed" says the stamp goes, and PATCHes status claimed', async () => {
    const patches = given.capture('patch', '/api/companies/:companyId/credentials/:credentialId', { ...LICENCE, status: 'claimed', verifiedBy: null, verifiedAt: null });
    const { user } = await renderCredentials();
    await rowAction(user, LICENCE_NAME, 'Set back to claimed');
    const dialog = await screen.findByRole('dialog', { name: `Set “${LICENCE_NAME}” back to claimed?` });
    expect(within(dialog).getByText('The verification stamp (who checked it and when) is removed.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Set back to claimed' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ status: 'claimed' });
    expect(await screen.findByText('Set back to claimed')).toBeInTheDocument();
  });


  it('Cancel on the verification sends nothing', async () => {
    const patches = given.capture('patch', '/api/companies/:companyId/credentials/:credentialId', ISO);
    const { user } = await renderCredentials();
    await rowAction(user, ISO_NAME, 'Mark as verified');
    const dialog = await screen.findByRole('dialog', { name: `Mark “${ISO_NAME}” as verified?` });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches).toHaveLength(0);
  });


  it('a failed verification is said inside its dialog', async () => {
    given.apiError('patch', '/api/companies/:companyId/credentials/:credentialId', 'NOT_FOUND', { status: 404, error: 'Credential not found' });
    const { user } = await renderCredentials();
    await rowAction(user, ISO_NAME, 'Mark as verified');
    const dialog = await screen.findByRole('dialog', { name: `Mark “${ISO_NAME}” as verified?` });
    await user.click(within(dialog).getByRole('button', { name: 'Mark as verified' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
  });


  it('Remove asks first, then DELETEs the entry, toasts and the list refreshes', async () => {
    const deletes = given.capture('delete', '/api/companies/:companyId/credentials/:credentialId', { ok: true });
    const { user } = await renderCredentials({ then: [{ ...PAVYZDYS, credentials: [LICENCE] }] });
    await rowAction(user, ISO_NAME, 'Remove');
    const dialog = await screen.findByRole('dialog', { name: `Remove “${ISO_NAME}”?` });
    expect(within(dialog).getByText('The entry is removed from the company profile.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/credentials/${f.ID.iso27001}`));
    expect(await screen.findByText('Entry removed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(screen.getByRole('grid')).queryByText(ISO_NAME)).toBeNull());
    expect(screen.getByRole('tab', { name: 'Licences and credentials (1)' })).toBeInTheDocument();
  });


  it('a failed removal is said inside its dialog, which stays', async () => {
    given.networkError('delete', '/api/companies/:companyId/credentials/:credentialId');
    const { user } = await renderCredentials();
    await rowAction(user, ISO_NAME, 'Remove');
    const dialog = await screen.findByRole('dialog', { name: `Remove “${ISO_NAME}”?` });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
    // (the open dialog hides the page from the tree)
    expect(within(screen.getByRole('grid', { hidden: true })).getByText(ISO_NAME)).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('CompanyCredentials — Lithuanian', () => {

  it('speaks Lithuanian: the columns, the kinds, the dates, the statuses, the dialogs and the toast', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/credentials', f.NEW.credential, { status: 201 });
    const { user } = await renderCredentials({ locale: 'lt' });
    expect(within(panel()).getByRole('heading', { name: 'Leidimai, licencijos ir sertifikatai' })).toBeInTheDocument();
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Rūšis', 'Pavadinimas', 'Išdavė', 'Numeris', 'Galiojimas', 'Būsena', 'Įrodymas', 'Veiksmai']);
    expect(gridRows()).toEqual([
      ['Licencija', LICENCE_NAME, 'Lietuvos bankas', 'KTPT-2026-017', 'nuo 2026-07-01', 'PatikrintaPatikrinta 2026-09-10', 'Leidimo išrašas', ''],
      ['Sertifikatas', ISO_NAME, 'UAB Sertifikavimo centras', 'ISMS-2025-0042', '2025-11-15 – 2028-11-14', 'Deklaruota', '—', ''],
    ]);

    await user.click(within(panel()).getByRole('button', { name: 'Pridėti įrašą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Naujas leidimas ar licencija' });
    expect(within(dialog).getByRole('radiogroup', { name: 'Būsena' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await within(dialog).findByText('Įveskite pavadinimą')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Pavadinimas' }), 'Leidimas');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(await screen.findByText('Įrašas pridėtas')).toBeInTheDocument();
  });


  it('the verification dialog in Lithuanian', async () => {
    const { user } = await renderCredentials({ locale: 'lt' });
    await user.click(within(rowOf(ISO_NAME)).getByRole('button', { name: 'Pažymėti patikrintu' }));
    const dialog = await screen.findByRole('dialog', { name: `Pažymėti „${ISO_NAME}“ patikrintu?` });
    expect(within(dialog).getByText(/Patvirtinate, kad asmeniškai patikrinote šį įrašą/)).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The company detail's matrix again, rendered on this tab:
// the credentials and the evidence titles come from it.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/companies/:companyId',
  fixture: PAVYZDYS,
  render: () => renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=credentials`, path: '/companies/:companyId' }),
  chrome: () => within(screen.getByRole('main')).getByRole('link', { name: 'Companies' }),
  loaded: async () => { await screen.findByText(LICENCE_NAME); },
  loading: () => screen.getByRole('heading', { level: 1 }).querySelector('.MuiSkeleton-root'),
});
