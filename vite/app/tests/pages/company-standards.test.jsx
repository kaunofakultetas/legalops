// -----------------------------------------------------------
//  [*] Tests — CompanyStandards (the standards tab)
//
//  The standards tab of /companies/:companyId against the
//  backend double, rendered in its page: the grid (the
//  designation over the title, the status pill, the scope,
//  the certificate's name, a warning while the corpus copy is
//  not indexed), the tab's count; the add dialog (the
//  corpus's standards with the adopted one disabled, the
//  three statuses saying what each means, only certificates
//  offered, the required standard, the POST body, the toast,
//  the refreshed list); edit (the standard fixed, the PATCH of
//  the changed fields only); remove; the empty tab, and the
//  corpus without any standard; Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given, url } from '../support/backend/server';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PAVYZDYS = f.company(f.ID.pavyzdys);
const KREDITAS = f.company(f.ID.kreditas);
const [ADOPTION] = PAVYZDYS.standards;
const ISO_27001 = 'ISO/IEC 27001:2022';
const ISO_9001 = 'ISO 9001:2015';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderStandards: the company page on ?tab=standards, the
// company answered as given (a list for a refetch — the
// detail is fetched again after every change); waits for
// the tab.
//
// gridRows / rowOf: the grid's cell texts; the row holding a
// text. openAdd / pick / saveButton: the dialog's doors.
// -----------------------------------------------------------

async function renderStandards({ company = PAVYZDYS, then, locale = 'en' } = {}) {
  if (then) given.sequence('get', '/api/companies/:companyId', [{ body: company }, ...then.map((body) => ({ body }))]);
  else if (company !== PAVYZDYS) given.json('get', '/api/companies/:companyId', company);
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${company.id}?tab=standards`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: company.name });
  return view;
}

const panel = () => screen.getByRole('tabpanel');

const gridRows = () => within(screen.getByRole('grid')).queryAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
  .filter((cells) => cells.length > 0);

const rowOf = (text) => within(screen.getByRole('grid')).getByText(text).closest('[role="row"]');

async function openAdd(user, add = 'Add a standard', title = 'New standard') {
  await user.click(within(panel()).getByRole('button', { name: add }));
  return screen.findByRole('dialog', { name: title });
}

async function pick(user, dialog, label, option) {
  await user.click(within(dialog).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const saveButton = (dialog) => within(dialog).getByRole('button', { name: 'Save' });







// -----------------------------------------------------------
// The grid
// -----------------------------------------------------------

describe('CompanyStandards — the grid', () => {

  it('lists each adopted standard: designation over its title, the status, the scope, the certificate', async () => {
    await renderStandards();
    expect(within(panel()).getByRole('heading', { name: 'Standards' })).toBeInTheDocument();
    expect(within(screen.getByRole('grid')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Standard', 'Status', 'Scope', 'Certificate', 'Actions']);
    expect(gridRows()).toEqual([[`${ISO_27001}${ADOPTION.title}`, 'Certified', ADOPTION.scope, 'ISO/IEC 27001 sertifikatas', '']]);
    expect(within(rowOf(ISO_27001)).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Edit', 'Remove']);
    expect(screen.getByRole('tab', { name: 'Standards (1)' })).toHaveAttribute('aria-selected', 'true');
  });


  it('warns while the corpus has no indexed copy, since an analysis then skips the standard', async () => {
    await renderStandards({ company: { ...PAVYZDYS, standards: [{ ...ADOPTION, ready: false, certificateId: null, scope: '' }] } });
    const [cells] = gridRows();
    expect(cells[0]).toContain('Not indexed yet — an analysis skips it');
    expect(cells.slice(2, 4)).toEqual(['—', '—']);
  });


  it('a company without standards says what to record, and offers the corpus\'s standards', async () => {
    const { user } = await renderStandards({ company: KREDITAS });
    expect(within(panel()).getByText('No standards yet')).toBeInTheDocument();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Standard' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent))
      .toEqual([`${ISO_27001} — ${f.standards[0].title}`, `${ISO_9001} — ${f.standards[1].title}`]);
  });


  it('says so, with a retry, when the corpus\'s standards cannot be loaded', async () => {
    given.sequence('get', '/api/corpus/documents', [{ status: 502, html: '<html><body>Bad Gateway</body></html>' }, { body: { documents: f.standards } }]);
    const { user } = await renderStandards();
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('The standards in the corpus could not be loaded');
    expect(within(panel()).getByRole('button', { name: 'Add a standard' })).toBeDisabled();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(panel()).getByRole('button', { name: 'Add a standard' })).toBeEnabled());
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });


  it('says there is nothing left to add once every standard of the corpus is on the list', async () => {
    const second = { ...ADOPTION, id: 'c4000000-0000-4000-8000-000000000002', documentId: f.ID.iso9001Standard, shortTitle: ISO_9001,
                     title: f.standards[1].title, status: 'planned', certificateId: null };
    await renderStandards({ company: { ...PAVYZDYS, standards: [ADOPTION, second] } });
    expect(await within(panel()).findByText('Every standard the corpus holds is already on this list.')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Add a standard' })).toBeDisabled();
  });


  it('with no standard in the corpus at all, says an administrator must upload one, and offers nothing to add', async () => {
    given.json('get', '/api/corpus/documents', { documents: [] });
    await renderStandards({ company: KREDITAS });
    expect(await within(panel()).findByText(/The corpus holds no standards yet/)).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: 'Add a standard' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Adding, editing, removing
// -----------------------------------------------------------

describe('CompanyStandards — the dialogs', () => {

  it('adds a standard: the adopted one disabled, the status explained, only certificates offered; the POST, the toast, the list', async () => {
    const created = { ...f.NEW.adoption, documentId: f.ID.iso9001Standard, shortTitle: ISO_9001, title: f.standards[1].title,
                      ready: false, status: 'planned', scope: 'Klientų aptarnavimas' };
    const posts = given.capture('post', '/api/companies/:companyId/standards', created, { status: 201 });
    const { user } = await renderStandards({ then: [{ ...PAVYZDYS, standards: [...PAVYZDYS.standards, created] }] });
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole('combobox', { name: 'Standard' }));
    const adopted = await screen.findByRole('option', { name: new RegExp(`^${ISO_27001.replace(/[/.]/g, '\\$&')}`) });
    expect(adopted).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('option', { name: new RegExp(`^${ISO_9001.replace(/[.]/g, '\\.')}`) }));

    expect(within(dialog).getAllByRole('radio').map((radio) => radio.closest('label').textContent)).toEqual([
      'Certified — a valid certificate covers the scope below.',
      'Implementing — the management system is being built.',
      'Planned — the company means to adopt it; a report shows what is still missing.',
    ]);
    expect(within(dialog).getByRole('radio', { name: /^Implementing/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: /^Planned/ }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Scope' }), ' Klientų aptarnavimas ');

    await user.click(within(dialog).getByRole('combobox', { name: 'Certificate' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['None', 'ISO/IEC 27001 sertifikatas']);
    await user.click(screen.getByRole('option', { name: 'None' }));
    await user.click(saveButton(dialog));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/standards`));
    expect(posts[0].body).toEqual({ documentId: f.ID.iso9001Standard, status: 'planned', scope: 'Klientų aptarnavimas',
                                    certificateId: null, notes: '' });
    expect(await screen.findByText('Standard added')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(screen.getByRole('grid')).findByText(ISO_9001)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Standards (2)' })).toBeInTheDocument();
  });


  it('refuses to save without a standard, and says so at the field', async () => {
    const posts = given.capture('post', '/api/companies/:companyId/standards', f.NEW.adoption, { status: 201 });
    const { user } = await renderStandards({ company: KREDITAS });
    const dialog = await openAdd(user);
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByText('Pick a standard')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });


  it('edits with the standard fixed and sends only what changed', async () => {
    const patches = given.capture('patch', '/api/companies/:companyId/standards/:standardId', { ...ADOPTION, status: 'implementing' });
    const { user } = await renderStandards();
    await user.click(within(rowOf(ISO_27001)).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit standard' });
    expect(within(dialog).getByRole('combobox', { name: 'Standard' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('radio', { name: /^Certified/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: /^Implementing/ }));
    await user.click(saveButton(dialog));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/standards/${f.ID.isoAdoption}`));
    expect(patches[0].body).toEqual({ status: 'implementing' });
    expect(await screen.findByText('Standard updated')).toBeInTheDocument();
  });


  it('removes after a confirmation that says what changes', async () => {
    const deletes = given.capture('delete', '/api/companies/:companyId/standards/:standardId', { ok: true });
    const { user } = await renderStandards();
    await user.click(within(rowOf(ISO_27001)).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { name: `Remove “${ISO_27001}”?` });
    expect(within(dialog).getByText('The standard is removed from the company profile; later analyses no longer assess it.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}/standards/${f.ID.isoAdoption}`));
    expect(await screen.findByText('Standard removed')).toBeInTheDocument();
  });


  it('a refusal is said inside the dialog, which stays open', async () => {
    given.apiError('post', '/api/companies/:companyId/standards', 'ALREADY_ADOPTED', { status: 409 });
    const { user } = await renderStandards({ company: KREDITAS });
    const dialog = await openAdd(user);
    await pick(user, dialog, 'Standard', new RegExp(`^${ISO_9001.replace(/[.]/g, '\\.')}`));
    await user.click(saveButton(dialog));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New standard' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('CompanyStandards — Lithuanian', () => {

  it('speaks Lithuanian', async () => {
    const { user } = await renderStandards({ locale: 'lt' });
    expect(within(panel()).getByRole('heading', { name: 'Standartai' })).toBeInTheDocument();
    expect(gridRows()[0][1]).toBe('Sertifikuota');
    expect(screen.getByRole('tab', { name: 'Standartai (1)' })).toBeInTheDocument();
    const dialog = await openAdd(user, 'Pridėti standartą', 'Naujas standartas');
    expect(within(dialog).getByRole('radio', { name: /^Planuojama/ })).toBeInTheDocument();
  });
});
