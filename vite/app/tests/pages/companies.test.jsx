// -----------------------------------------------------------
//  [*] Tests — Companies page (the list, search, scope,
//      the create dialog)
//
//  The /companies page end to end against the backend
//  double: the frame (heading, subtitle, the "New company"
//  action, the main navigation), the grid (rows newest-
//  updated first, the translated institution type, the code,
//  the country, the owner column for admins only, the stamp,
//  the dashes and the humanised unknown type, the name as a
//  real link and the row click), the loading overlay, the
//  empty list with its two ways forward, the failed list with
//  its retry, the debounced server search (?q=, trimmed, no
//  request per keystroke, the previous rows kept while the
//  next answer is on its way, the "nothing matches" state),
//  the admin's "Only mine" scope (?scope=own) and the plain
//  user without it, the create dialog (the four essentials,
//  the required name and country, the POST body, the toast,
//  the way to the new company, Enter, the busy state, a fast
//  double click, refusals and failures shown inside the
//  dialog without a toast, the blank form on reopening),
//  coming back to the list (the search, the scope and the
//  table's sort read from and replaced in the address; a
//  plain user's scope ignored), both languages, and the
//  backend contract matrix for GET /api/companies.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Companies from '@/pages/Companies/Companies';


const PAVYZDYS = f.companies.find((row) => row.id === f.ID.pavyzdys);
const KREDITAS = f.companies.find((row) => row.id === f.ID.kreditas);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderCompanies: the page on its real route, so a link or
// a navigate() lands on renderPage's "navigated away" probe.
//
// gridRows: the cell texts of every body row, top to bottom
// — what a reader of the grid sees, column by column.
//
// spyCompanies: records the query of every GET /api/companies
// and lets the default handler answer it (a resolver that
// returns nothing falls through to the next handler), so a
// test sees both what was asked and the real filtering.
//
// openCreate: the "New company" button → the dialog.
//
// gridLoading: the grid while its rows are on their way — it
// says so to assistive tech (aria-busy, and a polite
// "Loading…" status next to it).
//
// emptyStatus: an empty state's words, which are a polite
// status message (not an alert: the list loaded fine).
// -----------------------------------------------------------

function renderCompanies({ session = authData, locale = 'en' } = {}) {
  return renderPage(<Companies authData={session} />, { route: '/companies', path: '/companies', locale });
}

const gridRows = () => within(screen.getByRole('grid')).queryAllByRole('row')
  .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
  .filter((cells) => cells.length > 0);

const shownNames = () => gridRows().map((cells) => cells[0]);

function spyCompanies() {
  const calls = [];
  server.use(http.get(url('/api/companies'), ({ request }) => {
    calls.push(Object.fromEntries(new URL(request.url).searchParams));
  }));
  return calls;
}

async function openCreate(user, name = 'New company') {
  await user.click(screen.getAllByRole('button', { name })[0]);
  return screen.findByRole('dialog', { name });
}

const gridLoading = () => screen.getByRole('grid', { busy: true });

const emptyStatus = async (title) => (await screen.findByText(title)).closest('[role="status"]');

const navigatedTo = async (path) => {
  await waitFor(() => expect(screen.getByTestId('navigated-away')).toHaveTextContent(path));
};







// -----------------------------------------------------------
// The list
// -----------------------------------------------------------
//
// The frame, the rows and their formatting, the link and the
// row click, the loading, empty and failed states.
// -----------------------------------------------------------

describe('Companies — the list', () => {

  it('frames the list in the page layout: the heading, the subtitle, the "New company" action and the main navigation', async () => {
    renderCompanies();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Companies' })).toBeInTheDocument();
    expect(within(main).getByText('The company profiles the compliance analysis runs on.')).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: 'New company' })).toBeEnabled();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(await within(main).findByRole('grid', { name: 'Companies' })).toBeInTheDocument();
  });


  it('lists every company newest-updated first: name, translated institution type, code, country, owner and update stamp', async () => {
    renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Name', 'Institution type', 'Registration code', 'Country', 'Owner', 'Updated']);
    expect(gridRows()).toEqual([
      ['UAB Pavyzdys', 'Crypto-asset service provider', '300000001', 'LT', 'Jonas Naudotojas', '26/09/2026, 11:30'],
      ['UAB Kreditas', 'Consumer credit provider', '300000002', 'LT', 'Rūta Administratorė', '24/09/2026, 14:20'],
    ]);
  });


  it('the name is a real link to the company page (the keyboard path)', async () => {
    renderCompanies();
    const link = await screen.findByRole('link', { name: 'UAB Kreditas' });
    expect(link).toHaveAttribute('href', `/companies/${f.ID.kreditas}`);
  });


  it('following the name link opens that company', async () => {
    const { user } = renderCompanies();
    await user.click(await screen.findByRole('link', { name: 'UAB Pavyzdys' }));
    await navigatedTo(`/companies/${f.ID.pavyzdys}`);
  });


  it('a click anywhere on a row opens that company', async () => {
    const { user } = renderCompanies();
    await screen.findByText('UAB Kreditas');
    await user.click(screen.getByText('Consumer credit provider'));
    await navigatedTo(`/companies/${f.ID.kreditas}`);
  });


  it('a missing registration code and owner read as a dash, an unknown institution type is humanised rather than shown raw', async () => {
    given.json('get', '/api/companies', { companies: [{ ...KREDITAS, registrationCode: null, ownerName: null, institutionType: 'crypto_atm_operator' }] });
    renderCompanies();
    await screen.findByText('UAB Kreditas');
    expect(gridRows()).toEqual([['UAB Kreditas', 'Crypto atm operator', '—', 'LT', '—', '24/09/2026, 14:20']]);
  });


  it('the grid says it is busy while the list is on its way, and no empty state shows', async () => {
    given.hang('get', '/api/companies');
    renderCompanies();
    expect(await screen.findByRole('grid', { name: 'Companies', busy: true })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Loading…');
    await settle(100);
    expect(gridLoading()).toBeInTheDocument();
    expect(screen.queryByText('No companies yet')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('an empty list says so instead of an empty grid, with both ways forward', async () => {
    given.json('get', '/api/companies', { companies: [] });
    renderCompanies();
    const status = await emptyStatus('No companies yet');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('Create a company profile here, or describe the company in the chat — the assistant builds the profile itself.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
    // The header action and the empty state's own button
    expect(screen.getAllByRole('button', { name: 'New company' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Describe it in the chat' })).toBeInTheDocument();
  });


  it('the empty state\'s "Describe it in the chat" goes to the chat', async () => {
    given.json('get', '/api/companies', { companies: [] });
    const { user } = renderCompanies();
    await user.click(await screen.findByRole('button', { name: 'Describe it in the chat' }));
    await navigatedTo('/');
    expect(screen.getByTestId('navigated-away').textContent).toBe('/');
  });


  it('the empty state\'s "New company" opens the create dialog', async () => {
    given.json('get', '/api/companies', { companies: [] });
    const { user } = renderCompanies();
    await screen.findByText('No companies yet');
    // The header's button comes first in the page, the empty
    // state's own second
    await user.click(screen.getAllByRole('button', { name: 'New company' })[1]);
    expect(await screen.findByRole('dialog', { name: 'New company' })).toBeInTheDocument();
  });


  it('a failed list shows the translated error under its title with a retry, not an empty list; the retry loads the rows', async () => {
    given.sequence('get', '/api/companies', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { companies: f.companies } },
    ]);
    const { user } = renderCompanies();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The companies could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByText('No companies yet')).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
    // The way to create one stays open while the list is down
    expect(screen.getByRole('button', { name: 'New company' })).toBeEnabled();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('UAB Pavyzdys')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a dropped connection reads as the network sentence, never as raw prose', async () => {
    given.networkError('get', '/api/companies');
    renderCompanies();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });
});







// -----------------------------------------------------------
// Search and scope
// -----------------------------------------------------------
//
// The debounced server search (?q=) and the admin's "Only
// mine" switch (?scope=own); a plain user has neither the
// switch nor the owner column.
// -----------------------------------------------------------

describe('Companies — search and scope', () => {

  it('asks the server once the typing pauses — one request for the whole word, not one per keystroke', async () => {
    const calls = spyCompanies();
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    expect(calls).toEqual([{}]);

    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), 'Kreditas');
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
    expect(calls).toEqual([{}, { q: 'Kreditas' }]);
  });


  it('trims the search, so surrounding spaces ask the same question', async () => {
    const calls = spyCompanies();
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), '  pavyzdys  ');
    await waitFor(() => expect(shownNames()).toEqual(['UAB Pavyzdys']));
    expect(calls).toEqual([{}, { q: 'pavyzdys' }]);
  });


  it('spaces alone are no search: no new request, every company stays', async () => {
    const calls = spyCompanies();
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), '   ');
    await settle(500);
    expect(calls).toEqual([{}]);
    expect(shownNames()).toEqual(['UAB Pavyzdys', 'UAB Kreditas']);
  });


  it('finds a company by its registration code too (the server matches both)', async () => {
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), '300000002');
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
  });


  it('a search that matches nothing says so — without the "create one" call to action of an empty list', async () => {
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), 'Neegzistuojanti');
    expect(await screen.findByText('No companies match the search')).toBeInTheDocument();
    expect(screen.queryByText('No companies yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Describe it in the chat' })).toBeNull();
    // Only the header's "New company" is left
    expect(screen.getAllByRole('button', { name: 'New company' })).toHaveLength(1);
    expect(screen.queryByRole('grid')).toBeNull();
  });


  it('clearing the search brings every company back', async () => {
    const calls = spyCompanies();
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    const search = screen.getByRole('textbox', { name: 'Search by name or code' });
    await user.type(search, 'Kreditas');
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
    await user.clear(search);
    await waitFor(() => expect(shownNames()).toEqual(['UAB Pavyzdys', 'UAB Kreditas']));
    expect(calls.at(-1)).toEqual({});
  });


  it('keeps the previous rows on screen while the next answer is on its way, with no empty state in between', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let searched = false;
    server.use(http.get(url('/api/companies'), async ({ request }) => {
      if (!new URL(request.url).searchParams.get('q')) return undefined;
      searched = true;
      await gate;
      return undefined;
    }));
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), 'Kreditas');
    await waitFor(() => expect(searched).toBe(true));
    await settle(100);
    expect(shownNames()).toEqual(['UAB Pavyzdys', 'UAB Kreditas']);
    expect(screen.queryByText('No companies match the search')).toBeNull();

    release();
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
  });


  it('an admin\'s "Only mine" asks for scope=own and lists the admin\'s own companies; switched off, everybody\'s again', async () => {
    const calls = spyCompanies();
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    const onlyMine = screen.getByRole('switch', { name: 'Only mine' });
    expect(onlyMine).not.toBeChecked();

    await user.click(onlyMine);
    expect(onlyMine).toBeChecked();
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
    expect(calls).toEqual([{}, { scope: 'own' }]);

    await user.click(onlyMine);
    await waitFor(() => expect(shownNames()).toEqual(['UAB Pavyzdys', 'UAB Kreditas']));
  });


  it('the search and the scope combine into one request', async () => {
    const calls = spyCompanies();
    const { user } = renderCompanies();
    await screen.findByText('UAB Pavyzdys');
    await user.click(screen.getByRole('switch', { name: 'Only mine' }));
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), 'Pavyzdys');
    // The admin owns only UAB Kreditas — the narrowed search finds nothing
    expect(await screen.findByText('No companies match the search')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({ q: 'Pavyzdys', scope: 'own' });
  });


  it('"Only mine" alone, with nothing of the admin\'s own, reads as a search that matched nothing', async () => {
    given.json('get', '/api/companies', { companies: [] });
    const { user } = renderCompanies();
    await screen.findByText('No companies yet');
    await user.click(screen.getByRole('switch', { name: 'Only mine' }));
    expect(await screen.findByText('No companies match the search')).toBeInTheDocument();
  });


  it('a plain user sees their own companies without the "Only mine" switch or the owner column, and never sends a scope', async () => {
    // The backend answers a plain user with their own rows only
    const calls = [];
    server.use(http.get(url('/api/companies'), ({ request }) => {
      calls.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ companies: [PAVYZDYS] });
    }));
    const { user } = renderCompanies({ session: userAuthData });
    await screen.findByText('UAB Pavyzdys');
    expect(screen.queryByRole('switch', { name: 'Only mine' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).toBeNull();
    // (the navbar names the signed-in user; the grid does not)
    expect(within(screen.getByRole('grid')).queryByText('Jonas Naudotojas')).toBeNull();
    expect(gridRows()).toEqual([['UAB Pavyzdys', 'Crypto-asset service provider', '300000001', 'LT', '26/09/2026, 11:30']]);

    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), 'Pav');
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).toEqual([{}, { q: 'Pav' }]);
  });
});







// -----------------------------------------------------------
// The create dialog
// -----------------------------------------------------------
//
// The four essentials, validation, the POST and what follows
// it, the busy state, refusals and failures (inline — the
// dialog's request is silent), the reset on reopening.
// -----------------------------------------------------------

describe('Companies — the create dialog', () => {

  it('opens with the four essentials: the name (focused), the code, the type ("Not determined") and the country (LT)', async () => {
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue('');
    expect(name).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: 'Registration code' })).toHaveValue('');
    expect(within(dialog).getByRole('combobox', { name: 'Financial institution type' })).toHaveTextContent('Not determined');
    expect(within(dialog).getByRole('textbox', { name: 'Country' })).toHaveValue('LT');
    expect(within(dialog).getByText('Two-letter code, e.g. LT')).toBeInTheDocument();
    expect(within(dialog).getByText('You can fill in the rest of the profile on the company page.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });


  it('offers every institution type, translated, "Not determined" first', async () => {
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Financial institution type' }));
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(options).toEqual([
      'Not determined', 'Bank', 'Credit union', 'Payment institution', 'Electronic money institution',
      'Crypto-asset service provider', 'Crowdfunding service provider', 'Consumer credit provider',
      'Real-estate credit provider', 'Currency exchange operator', 'Investment firm', 'Insurance undertaking',
      'Other financial institution', 'Not a financial institution',
    ]);
  });


  it('Create without a name says the name is required and sends nothing', async () => {
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    // No error before the first attempt
    expect(within(dialog).queryByText('Enter a name')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');
    await settle(100);
    expect(posts).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'New company' })).toBeInTheDocument();
  });


  it('a name of spaces is no name, and an emptied country is required too', async () => {
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '   ');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Country' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a country')).toBeInTheDocument();
    // The country's error replaces its hint
    expect(within(dialog).queryByText('Two-letter code, e.g. LT')).toBeNull();
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('fixing the input clears the errors as it is typed, once they were shown', async () => {
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    expect(within(dialog).queryByText('Enter a name')).toBeNull();
  });


  it('creates the company: the POST carries the trimmed name, the code, the picked type and the upper-cased country; then the toast and the new company\'s page', async () => {
    const posts = given.capture('post', '/api/companies', { ...f.NEW.company, name: 'UAB Naujoji', registrationCode: '300000009', institutionType: 'payment_institution', country: 'LV' }, { status: 201 });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '  UAB Naujoji ');
    await user.type(within(dialog).getByRole('textbox', { name: 'Registration code' }), ' 300000009 ');
    await user.click(within(dialog).getByRole('combobox', { name: 'Financial institution type' }));
    await user.click(await screen.findByRole('option', { name: 'Payment institution' }));
    const country = within(dialog).getByRole('textbox', { name: 'Country' });
    await user.clear(country);
    await user.type(country, ' lv ');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ name: 'UAB Naujoji', registrationCode: '300000009', institutionType: 'payment_institution', country: 'LV' });
    expect(await screen.findByText('Company created')).toBeInTheDocument();
    await navigatedTo(`/companies/${f.ID.newCompany}`);
  });


  it('an empty registration code is sent as null, the untouched type as "unknown", the default country as LT', async () => {
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ name: 'UAB Naujoji', registrationCode: null, institutionType: 'unknown', country: 'LT' });
    await navigatedTo(`/companies/${f.ID.newCompany}`);
  });


  it('Enter in a field submits the form once — the dialog is a real form', async () => {
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    await settle(100);
    expect(posts).toHaveLength(1);
    expect(posts[0].body.name).toBe('UAB Naujoji');
  });


  it('a second click on Create right after the first sends no second POST — the button is busy by then', async () => {
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    const create = within(dialog).getByRole('button', { name: 'Create' });
    await user.click(create);
    await user.click(create);
    await navigatedTo(`/companies/${f.ID.newCompany}`);
    await settle(100);
    expect(posts).toHaveLength(1);
  });


  it('while the POST is on the wire the dialog is busy: Create and Cancel are disabled and Escape does not close it', async () => {
    given.hang('post', '/api/companies');
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Create/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await settle(100);
    expect(screen.getByRole('dialog', { name: 'New company' })).toBeInTheDocument();
  });


  it('a refusal is said inside the dialog in the backend\'s own words (English UI, a validation code) — no toast, the dialog and the input stay', async () => {
    given.apiError('post', '/api/companies', 'INVALID_FIELD', { status: 400, error: 'country must be text, e.g. LT' });
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('country must be text, e.g. LT');
    // The request is silent: the sentence is not toasted as well
    expect(screen.getAllByText('country must be text, e.g. LT')).toHaveLength(1);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('UAB Naujoji');
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('a server failure reads as the translated sentence inside the dialog, and a second try that succeeds opens the company', async () => {
    given.sequence('post', '/api/companies', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { status: 201, body: f.NEW.company },
    ]);
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await navigatedTo(`/companies/${f.ID.newCompany}`);
  });


  it('a dropped connection reads as the network sentence inside the dialog', async () => {
    given.networkError('post', '/api/companies');
    const { user } = renderCompanies();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });


  it('Cancel closes without a request, and reopening starts from a blank form without the old errors', async () => {
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies();
    let dialog = await openCreate(user);
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await within(dialog).findByText('Enter a name');
    await user.type(within(dialog).getByRole('textbox', { name: 'Registration code' }), '300000009');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await openCreate(user);
    expect(within(dialog).getByRole('textbox', { name: 'Registration code' })).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: 'Country' })).toHaveValue('LT');
    expect(within(dialog).queryByText('Enter a name')).toBeNull();
    expect(posts).toHaveLength(0);
  });


  it('Escape closes an idle dialog', async () => {
    const { user } = renderCompanies();
    await openCreate(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('a failed attempt is forgotten after closing: reopening shows no stale error', async () => {
    given.apiError('post', '/api/companies', 'SERVER_ERROR', { status: 500 });
    const { user } = renderCompanies();
    let dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await within(dialog).findByRole('alert');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openCreate(user);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Coming back to the list
// -----------------------------------------------------------
//
// The search, the scope and the table's page and sort live in
// the address (replaced, never pushed): the list comes back
// as it was left — Back from a company, its back link, a
// reload. renderAt puts the page on an address of its own.
// -----------------------------------------------------------

describe('Companies — coming back to the list', () => {

  const renderAt = (route, { session = authData, locale = 'en' } = {}) =>
    renderPage(<Companies authData={session} />, { route, path: '/companies', locale });


  it('the search, the scope and the sort come from the address: the list shows as it was left', async () => {
    const calls = spyCompanies();
    renderAt('/companies?q=UAB&scope=own&sort=name.asc');
    await waitFor(() => expect(shownNames()).toEqual(['UAB Kreditas']));
    expect(screen.getByRole('textbox', { name: 'Search by name or code' })).toHaveValue('UAB');
    expect(screen.getByRole('switch', { name: 'Only mine' })).toBeChecked();
    expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(calls).toEqual([{ q: 'UAB', scope: 'own' }]);
  });


  it('the typing and the switch write the address, replacing the entry — and a new search starts on the first page', async () => {
    const { router, user } = renderAt('/companies?page=2&sort=name.desc');
    await screen.findByText('UAB Pavyzdys');
    await user.type(screen.getByRole('textbox', { name: 'Search by name or code' }), 'Kred');
    await waitFor(() => expect(router.state.location.search).toBe('?sort=name.desc&q=Kred'));
    expect(router.state.historyAction).toBe('REPLACE');
    await user.click(screen.getByRole('switch', { name: 'Only mine' }));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=name.desc&q=Kred&scope=own'));
    await user.click(screen.getByRole('switch', { name: 'Only mine' }));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=name.desc&q=Kred'));
  });


  it('a scope in a plain user\'s address, or a column the table does not have, is ignored', async () => {
    const calls = [];
    server.use(http.get(url('/api/companies'), ({ request }) => {
      calls.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ companies: [PAVYZDYS, KREDITAS] });
    }));
    renderAt('/companies?scope=own&sort=ownerName.desc', { session: userAuthData });
    await waitFor(() => expect(shownNames()).toEqual(['UAB Pavyzdys', 'UAB Kreditas']));
    expect(calls).toEqual([{}]);
    expect(screen.queryByRole('switch', { name: 'Only mine' })).toBeNull();
  });


  it('in Lithuanian too: the search box and the switch show the address\'s search and scope', async () => {
    renderAt('/companies?q=Kred&scope=own', { locale: 'lt' });
    expect(await screen.findByRole('textbox', { name: 'Ieškoti pagal pavadinimą ar kodą' })).toHaveValue('Kred');
    expect(screen.getByRole('switch', { name: 'Tik mano' })).toBeChecked();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('Companies — Lithuanian', () => {

  it('speaks Lithuanian: the title, the columns, the enum labels, the stamps, the search and the switch', async () => {
    renderCompanies({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Įmonės' })).toBeInTheDocument();
    expect(screen.getByText('Įmonių profiliai, pagal kuriuos atliekama atitikties analizė.')).toBeInTheDocument();
    await screen.findByText('UAB Pavyzdys');
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Pavadinimas', 'Įstaigos tipas', 'Įmonės kodas', 'Šalis', 'Savininkas', 'Atnaujinta']);
    expect(gridRows()).toEqual([
      ['UAB Pavyzdys', 'Kriptoturto paslaugų teikėjas', '300000001', 'LT', 'Jonas Naudotojas', '2026-09-26 11:30'],
      ['UAB Kreditas', 'Vartojimo kredito davėjas', '300000002', 'LT', 'Rūta Administratorė', '2026-09-24 14:20'],
    ]);
    expect(screen.getByRole('textbox', { name: 'Ieškoti pagal pavadinimą ar kodą' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Tik mano' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nauja įmonė' })).toBeInTheDocument();
  });


  it('the empty list, the failed list and the create dialog in Lithuanian', async () => {
    given.sequence('get', '/api/companies', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { companies: [] } },
    ]);
    const posts = given.capture('post', '/api/companies', f.NEW.company, { status: 201 });
    const { user } = renderCompanies({ locale: 'lt' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nepavyko įkelti įmonių');
    await user.click(within(alert).getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('Įmonių dar nėra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprašyti pokalbyje' })).toBeInTheDocument();

    const dialog = await openCreate(user, 'Nauja įmonė');
    expect(within(dialog).getByRole('combobox', { name: 'Finansų įstaigos tipas' })).toHaveTextContent('Nenustatyta');
    expect(within(dialog).getByText('Dviejų raidžių kodas, pvz., LT')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Sukurti' }));
    expect(await within(dialog).findByText('Įveskite pavadinimą')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Pavadinimas' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Sukurti' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(await screen.findByText('Įmonė sukurta')).toBeInTheDocument();
  });


  it('a validation refusal in the Lithuanian UI names the field by its label, never the backend\'s English prose', async () => {
    given.apiError('post', '/api/companies', 'INVALID_FIELD', { status: 400, error: 'country must be text, e.g. LT' });
    const { user } = renderCompanies({ locale: 'lt' });
    const dialog = await openCreate(user, 'Nauja įmonė');
    await user.type(within(dialog).getByRole('textbox', { name: 'Pavadinimas' }), 'UAB Naujoji');
    await user.click(within(dialog).getByRole('button', { name: 'Sukurti' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Neteisinga lauko „Šalis“ reikšmė.');
    expect(alert).not.toHaveTextContent('country must be text');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the list's one endpoint.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/companies',
  fixture: { companies: f.companies },
  render: () => renderCompanies(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Companies' }),
  loaded: async () => { await screen.findByText('UAB Pavyzdys'); },
  loading: gridLoading,
});
