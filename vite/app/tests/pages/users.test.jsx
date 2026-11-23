// -----------------------------------------------------------
//  [*] Tests — Users page (the admin's account directory)
//
//  The /users page end to end against the backend double: the
//  frame (heading, subtitle, the "New user" action, the
//  labelled grid, the main navigation), the directory (rows
//  oldest first, the name, email, translated role and status,
//  the daily AI budget in its three modes — null the default,
//  0 unlimited, an amount in dollars — and the last sign-in),
//  the inactive account and the admin's own row (no
//  deactivate button for either), the order kept in the
//  address (a sort replaced into it, read back from it), the
//  columns a phone keeps,
//  the loading state, the failed list with its retry, a
//  failed refresh keeping the rows on screen under its error,
//  an answer that is not a list of rows with ids (the error
//  state, never a crash or an empty directory), hostile
//  strings shown as text; the create dialog (the blank form,
//  validation after the first submit, the POST body, the
//  toast, the refreshed grid, Enter, the busy state, every
//  refusal the backend defines — EMAIL_TAKEN, WEAK_PASSWORD
//  with its length, INVALID_EMAIL — and transport failures
//  shown in the dialog, never toasted, a refusal about a
//  field gone as soon as that field changes, the blank form
//  on reopening, one POST for a double click or a click while
//  it closes); the edit dialog (pre-filled, a PATCH with only
//  the changed fields — displayName, role, active and
//  dailyBudgetUsd as null / 0 / an amount — nothing sent for
//  an untouched form, the budget validation, the caller's own
//  role and status locked and never sent, the LAST_ADMIN and
//  SELF_LOCKOUT refusals — lifted by the role or the switch,
//  not the name — the named-field INVALID_FIELD gone with a
//  new amount, a failed request staying until the next save,
//  a record deleted meanwhile); the reset-password dialog; the
//  deactivate confirmation (DELETE, the refusals, the busy
//  state, one DELETE for a double click or a click while it
//  closes); the hold-to-delete button (held two seconds:
//  DELETE ?purge=true, a toast naming what went, the row
//  gone; let go early: nothing sent, the "hold" toast; its
//  name, hint and tooltip; the spinner while it runs; a
//  refusal toasted; never the admin's own row); a 401 on a
//  mutation; both languages; and the backend contract matrix
//  for GET /api/users.
// -----------------------------------------------------------

import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { signIn, TOKEN_KEY } from '../support/auth';
import { mediaQueryMatches } from '../support/setup';
import { given, apiError } from '../support/backend/server';
import { describeEndpointContract, settle, HOSTILE_STRING } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Users from '@/pages/Users/Users';


const RUTA = f.adminUser;
const JONAS = f.plainUser;
const LINA = f.inactiveUser;

// Below the md breakpoint (theme.breakpoints.down('md')) —
// the phone layout of the grid
const PHONE = '(max-width:899.95px)';

// A second administrator — the only way the directory can
// show an admin other than the caller
const ANTANAS = {
  ...f.plainUser, id: 'a0000000-0000-4000-8000-000000000004', email: 'antanas@example.lt',
  displayName: 'Antanas Antrasis', role: 'admin', dailyBudgetUsd: null, lastLoginAt: null,
};

// The users answer with one row changed
const usersWith = (id, change) => ({ users: f.users.map((row) => (row.id === id ? { ...row, ...change } : row)) });







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderUsers: the page on its real route (/users), so a
// hard redirect carries it as ?next=.
//
// rowOf: the grid row holding a cell with this text, once
// the grid shows it. cellOf: one cell of a row, found under
// its column header by the grid's aria-colindex (a cell has
// no name of its own). titled: a column header's accessible
// name carries its sort button's label after the title
// ("Email Sort"), so a header is matched by the title it
// starts with. shownNames: the first column, top to bottom —
// what a reader of the grid sees.
//
// gridLoading: while a list loads, the grid is aria-busy
// and a visually hidden status says "Loading…" (DataTable) —
// what a screen reader is told.
//
// openCreate / openRowDialog: the "New user" button, or one
// of a row's action buttons, → the dialog it opens.
//
// passwordField: a password input has no ARIA role, so it is
// found by its label (the required asterisk follows it).
// -----------------------------------------------------------

const renderUsers = (options = {}) => renderPage(<Users authData={authData} />, { route: '/users', path: '/users', ...options });

const rowOf = async (text) => (await within(await screen.findByRole('grid')).findByText(text)).closest('[role="row"]');

const titled = (title) => (name) => name === title || name.startsWith(`${title} `);

const cellOf = (row, header) => {
  const column = within(screen.getByRole('grid')).getByRole('columnheader', { name: titled(header) }).getAttribute('aria-colindex');
  return within(row).getAllByRole('gridcell').find((cell) => cell.getAttribute('aria-colindex') === column);
};

const gridLoading = () => screen.getByRole('grid', { busy: true }) && screen.getByText('Loading…', { selector: '[role="status"]' });

const shownNames = () => within(screen.getByRole('grid')).getAllByRole('row').slice(1)
  .map((row) => within(row).getAllByRole('gridcell')[0].textContent);

const openCreate = async (user, { button = 'New user', title = 'New user' } = {}) => {
  await rowOf(JONAS.displayName);
  await user.click(screen.getByRole('button', { name: button }));
  return screen.findByRole('dialog', { name: title });
};

const openRowDialog = async (user, name, action, title) => {
  const row = await rowOf(name);
  await user.click(within(row).getByRole('button', { name: action }));
  return screen.findByRole('dialog', { name: title });
};

const openEdit = (user, name) => openRowDialog(user, name, 'Edit', 'Edit user');

const passwordField = (dialog, label = /^Password/) => within(dialog).getByLabelText(label);

const dialogClosed = async (title) => {
  await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
};

// Fills the create form with a valid new account
const fillCreate = async (user, dialog, { name = 'Naujas Naudotojas', email = 'naujas@example.lt', password = 'Saugus-slaptazodis-1' } = {}) => {
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), name);
  await user.type(within(dialog).getByRole('textbox', { name: 'Email' }), email);
  await user.type(passwordField(dialog), password);
};







// -----------------------------------------------------------
// Users page — the frame
// -----------------------------------------------------------

describe('Users page — the frame', () => {

  it('frames the directory in the page layout: heading, subtitle, the "New user" action and the labelled grid', async () => {
    renderUsers();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(within(main).getByText('Accounts are created by an administrator; there is no self-registration.')).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: 'New user' })).toBeEnabled();
    expect(await within(main).findByRole('grid', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });


  it('asks for the directory once, with no query', async () => {
    const calls = given.capture('get', '/api/users', { users: f.users });
    renderUsers();
    await rowOf(JONAS.displayName);
    await settle(100);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({});
  });
});







// -----------------------------------------------------------
// The directory
// -----------------------------------------------------------
//
// What every row shows, the budget modes, the rows that
// cannot be deactivated, and the states around the list.
// -----------------------------------------------------------

describe('Users page — the directory', () => {

  it('keeps its order in the address: a sort goes in (replacing), and comes back from it', async () => {
    const first = renderUsers();
    await rowOf(JONAS.displayName);
    await first.user.click(within(screen.getByRole('grid')).getByRole('columnheader', { name: titled('Name') }).querySelector('.MuiDataGrid-columnHeaderTitleContainer'));
    await waitFor(() => expect(first.router.state.location.search).toBe('?sort=displayName.asc'));
    expect(first.router.state.historyAction).toBe('REPLACE');
    first.unmount();

    renderUsers({ route: '/users?sort=displayName.desc' });
    await rowOf(JONAS.displayName);
    expect(shownNames()).toEqual(['Rūta Administratorė', 'Lina Buvusi', 'Jonas Naudotojas']);
  });


  it('lists every account oldest first with its email, role, status, daily budget and last sign-in', async () => {
    renderUsers();
    const jonas = await rowOf(JONAS.displayName);
    expect(shownNames()).toEqual(['Rūta Administratorė', 'Jonas Naudotojas', 'Lina Buvusi']);

    const ruta = await rowOf(RUTA.displayName);
    expect(cellOf(ruta, 'Email')).toHaveTextContent('admin@example.lt');
    expect(cellOf(ruta, 'Role')).toHaveTextContent(/^Administrator$/);
    expect(cellOf(ruta, 'Status')).toHaveTextContent(/^Active$/);
    expect(cellOf(ruta, 'Daily AI budget')).toHaveTextContent(/^Default$/);
    expect(cellOf(ruta, 'Last login')).toHaveTextContent(/^27\/09\/2026, 07:45$/);

    expect(cellOf(jonas, 'Email')).toHaveTextContent('jonas@example.lt');
    expect(cellOf(jonas, 'Role')).toHaveTextContent(/^User$/);
    expect(cellOf(jonas, 'Status')).toHaveTextContent(/^Active$/);
    expect(cellOf(jonas, 'Daily AI budget')).toHaveTextContent(/^\$5\.00$/);
    expect(cellOf(jonas, 'Last login')).toHaveTextContent(/^27\/09\/2026, 08:12$/);

    const lina = await rowOf(LINA.displayName);
    expect(cellOf(lina, 'Status')).toHaveTextContent(/^Inactive$/);
    expect(cellOf(lina, 'Daily AI budget')).toHaveTextContent(/^Default$/);
    expect(cellOf(lina, 'Last login')).toHaveTextContent(/^11\/09\/2026, 16:20$/);
  });


  it('shows the daily budget in its three modes: null the default, 0 unlimited, an amount in dollars', async () => {
    given.json('get', '/api/users', {
      users: [
        RUTA,
        { ...JONAS, dailyBudgetUsd: 0 },
        { ...LINA, dailyBudgetUsd: 2.5 },
        { ...ANTANAS, dailyBudgetUsd: 0.5 },
        { ...ANTANAS, id: 'a0000000-0000-4000-8000-000000000005', displayName: 'Ona Penktoji', dailyBudgetUsd: 1250 },
      ],
    });
    renderUsers();
    expect(cellOf(await rowOf('Rūta Administratorė'), 'Daily AI budget')).toHaveTextContent(/^Default$/);
    expect(cellOf(await rowOf('Jonas Naudotojas'), 'Daily AI budget')).toHaveTextContent(/^Unlimited$/);
    expect(cellOf(await rowOf('Lina Buvusi'), 'Daily AI budget')).toHaveTextContent(/^\$2\.50$/);
    expect(cellOf(await rowOf('Antanas Antrasis'), 'Daily AI budget')).toHaveTextContent(/^\$0\.50$/);
    expect(cellOf(await rowOf('Ona Penktoji'), 'Daily AI budget')).toHaveTextContent(/^\$1,250\.00$/);
  });


  it('shows a dash for an account that never signed in', async () => {
    given.json('get', '/api/users', { users: [RUTA, ANTANAS] });
    renderUsers();
    expect(cellOf(await rowOf('Antanas Antrasis'), 'Last login')).toHaveTextContent(/^—$/);
    expect(cellOf(await rowOf('Antanas Antrasis'), 'Role')).toHaveTextContent(/^Administrator$/);
  });


  it('an inactive account reads "Inactive" and cannot be deactivated again, but can be edited and given a new password', async () => {
    renderUsers();
    const lina = await rowOf(LINA.displayName);
    expect(within(lina).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    expect(within(lina).getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(within(lina).getByRole('button', { name: 'Reset password' })).toBeEnabled();
  });


  it('the signed-in admin cannot reset their own password here — a reset would end their own session; the Account page changes it', async () => {
    renderUsers();
    const ruta = await rowOf(RUTA.displayName);
    const own = within(ruta).getByRole('button', { name: 'Change your own password on the Account page' });
    expect(own).toBeDisabled();
    expect(within(ruta).queryByRole('button', { name: 'Reset password' })).toBeNull();
    expect(within(await rowOf(JONAS.displayName)).getByRole('button', { name: 'Reset password' })).toBeEnabled();
  });


  it('the signed-in admin cannot deactivate their own account from the table; another active account can be', async () => {
    renderUsers();
    const ruta = await rowOf(RUTA.displayName);
    expect(within(ruta).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    expect(within(ruta).getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(within(await rowOf(JONAS.displayName)).getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });


  it('says it is loading while the directory is on its way — the grid busy, a status — not "No rows", not an alert', async () => {
    given.hang('get', '/api/users');
    renderUsers();
    await screen.findByRole('grid', { name: 'Users' });
    await settle(100);
    expect(screen.getByRole('grid', { name: 'Users', busy: true })).toBeInTheDocument();
    expect(screen.getByText('Loading…', { selector: '[role="status"]' })).toBeInTheDocument();
    expect(within(screen.getByRole('grid')).getAllByRole('row')).toHaveLength(1);
    expect(screen.queryByText('No rows')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'New user' })).toBeEnabled();
  });


  it('a failed list shows the page\'s error with the translated sentence and a retry that brings the rows', async () => {
    given.sequence('get', '/api/users', [{ status: 500, body: apiError('SERVER_ERROR', 'Internal server error') }, { body: { users: f.users } }]);
    const { user } = renderUsers();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The users could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByRole('grid')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await rowOf(JONAS.displayName)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it.each([
    ['a server error', { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') }, 'Server error. Try again later.'],
    ['an answer that is not a list', { body: { users: 'Jonas' } }, 'Something unexpected went wrong.'],
  ])('a refresh that fails with %s keeps the directory on screen with the error above it; its retry refreshes the rows', async (_, failure, text) => {
    given.sequence('get', '/api/users', [
      { body: { users: f.users } },
      failure,
      { body: usersWith(JONAS.id, { displayName: 'Jonas Naujasis' }) },
    ]);
    const { user, queryClient } = renderUsers();
    await rowOf(JONAS.displayName);
    // What a refetch on window focus does
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['users'] }); });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The users could not be loaded');
    expect(alert).toHaveTextContent(text);
    // The rows stay, under the error, and can still be worked on
    const grid = screen.getByRole('grid', { name: 'Users' });
    expect(alert.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shownNames()).toEqual(['Rūta Administratorė', 'Jonas Naudotojas', 'Lina Buvusi']);
    expect(within(await rowOf(JONAS.displayName)).getByRole('button', { name: 'Edit' })).toBeEnabled();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await rowOf('Jonas Naujasis')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it.each([
    ['rows without ids', { users: [{ displayName: 'Be id' }, { displayName: 'Irgi be id' }] }],
    ['two rows sharing one id', { users: [JONAS, { ...JONAS, displayName: 'Jonas Antrininkas' }] }],
    ['no users list at all', { accounts: f.users }],
    ['a list that is not one', { users: 'Jonas' }],
  ])('an answer with %s fails like any bad answer — the error state and its retry, not a crash or an empty directory', async (_, body) => {
    given.sequence('get', '/api/users', [{ body }, { body: { users: f.users } }]);
    const { user } = renderUsers();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The users could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByText('No rows')).toBeNull();
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await rowOf(JONAS.displayName)).toBeInTheDocument();
  });


  it('an empty directory shows the grid\'s "No rows", and a user can still be created', async () => {
    given.json('get', '/api/users', { users: [] });
    renderUsers();
    expect(await screen.findByText('No rows')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New user' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('shows markup in names and emails as text, never as elements', async () => {
    given.json('get', '/api/users', { users: f.users.map((row, i) => ({ ...row, displayName: `${HOSTILE_STRING} ${i}`, email: HOSTILE_STRING })) });
    renderUsers();
    const grid = await screen.findByRole('grid');
    await waitFor(() => expect(within(grid).getAllByRole('row')).toHaveLength(4));
    expect(shownNames().every((name) => name.includes('<script>alert(1)</script>'))).toBe(true);
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });


  it('speaks Lithuanian: heading, columns, roles, statuses, the budget modes, dates and amounts', async () => {
    given.json('get', '/api/users', { users: [RUTA, JONAS, LINA, { ...ANTANAS, dailyBudgetUsd: 0 }] });
    renderUsers({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Naudotojai' })).toBeInTheDocument();
    expect(screen.getByText('Paskyras kuria administratorius; savarankiškos registracijos nėra.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Naujas naudotojas' })).toBeInTheDocument();
    const jonas = await rowOf(JONAS.displayName);
    for (const header of ['Vardas', 'El. paštas', 'Rolė', 'Būsena', 'Dienos DI biudžetas', 'Paskutinis prisijungimas', 'Veiksmai']) {
      expect(screen.getByRole('columnheader', { name: titled(header) })).toBeInTheDocument();
    }
    expect(cellOf(jonas, 'Rolė')).toHaveTextContent(/^Naudotojas$/);
    expect(cellOf(jonas, 'Būsena')).toHaveTextContent(/^Aktyvus$/);
    expect(cellOf(jonas, 'Dienos DI biudžetas')).toHaveTextContent(/^5,00\sUSD$/);
    expect(cellOf(jonas, 'Paskutinis prisijungimas')).toHaveTextContent(/^2026-09-27 08:12$/);
    const ruta = await rowOf(RUTA.displayName);
    expect(cellOf(ruta, 'Rolė')).toHaveTextContent(/^Administratorius$/);
    expect(cellOf(ruta, 'Dienos DI biudžetas')).toHaveTextContent(/^Numatytasis$/);
    expect(cellOf(await rowOf(LINA.displayName), 'Būsena')).toHaveTextContent(/^Neaktyvus$/);
    expect(cellOf(await rowOf('Antanas Antrasis'), 'Dienos DI biudžetas')).toHaveTextContent(/^Neribotas$/);
    expect(within(jonas).getByRole('button', { name: 'Redaguoti' })).toBeInTheDocument();
    expect(within(jonas).getByRole('button', { name: 'Keisti slaptažodį' })).toBeInTheDocument();
    expect(within(jonas).getByRole('button', { name: 'Deaktyvuoti' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The directory on a phone
// -----------------------------------------------------------
//
// The page picks the columns a narrow screen drops; the
// media-query stub is module state, so it is switched back
// after every test.
// -----------------------------------------------------------

describe('Users page — the directory on a phone', () => {

  afterEach(() => {
    mediaQueryMatches(PHONE, false);
  });


  it('keeps the name, role, status and actions, and drops the email, budget and last sign-in', async () => {
    mediaQueryMatches(PHONE);
    renderUsers();
    const jonas = await rowOf(JONAS.displayName);
    for (const header of ['Name', 'Role', 'Status', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: titled(header) })).toBeInTheDocument();
    }
    for (const header of ['Email', 'Daily AI budget', 'Last login']) {
      expect(screen.queryByRole('columnheader', { name: titled(header) })).toBeNull();
    }
    expect(within(jonas).getByRole('button', { name: 'Edit' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// Create dialog
// -----------------------------------------------------------
//
// POST /api/users {email, displayName, role, password}; the
// validation after the first submit, the refusals inside
// the dialog (silent: no toast), the busy state.
// -----------------------------------------------------------

describe('Users page — the create dialog', () => {

  it('opens a blank form: the name focused, the email, the role (User by default), the password with its rule', async () => {
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(name).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: 'Email' })).toHaveValue('');
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toHaveTextContent('User');
    expect(passwordField(dialog)).toHaveValue('');
    expect(passwordField(dialog)).toHaveAttribute('type', 'password');
    expect(within(dialog).getByText('At least 10 characters. Hand it over through a safe channel.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'New user' })).toBeEnabled();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('offers the two roles', async () => {
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['User', 'Administrator']);
  });


  it('checks the fields only once the form was submitted, then names every problem and sends nothing', async () => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'ne-el-pastas');
    expect(within(dialog).queryByText('Enter a valid email address')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
    expect(within(dialog).getByText('The password must be at least 10 characters long')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');
    await settle(100);
    expect(posts).toHaveLength(0);

    // Fixing a field clears its message at once
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Naujas');
    expect(within(dialog).queryByText('Enter a name')).toBeNull();
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
  });


  it.each([
    ['naujas.example.lt', false],
    ['naujas@', false],
    ['@example.lt', false],
    ['nau jas@example.lt', false],
    ['admin@localhost', true],
    ['naujas@example.lt', true],
  ])('the email "%s" is %s accepted as an address', async (email, accepted) => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog, { email });
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    if (accepted) {
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0].body.email).toBe(email);
    } else {
      expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument();
      await settle(100);
      expect(posts).toHaveLength(0);
    }
  });


  it('refuses a 9-character password with the length rule and sends a 10-character one', async () => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog, { password: '123456789' });
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await within(dialog).findByText('The password must be at least 10 characters long')).toBeInTheDocument();
    expect(within(dialog).queryByText('At least 10 characters. Hand it over through a safe channel.')).toBeNull();
    await settle(50);
    expect(posts).toHaveLength(0);

    await user.type(passwordField(dialog), '0');
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.password).toBe('1234567890');
  });


  it('creates an account: POSTs the trimmed name and email with the chosen role, toasts, closes and the grid shows it', async () => {
    const posts = given.capture('post', '/api/users', { ...f.NEW.user, role: 'admin' }, { status: 201 });
    given.sequence('get', '/api/users', [{ body: { users: f.users } }, { body: { users: [...f.users, { ...f.NEW.user, role: 'admin' }] } }]);
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog, { name: '  Naujas Naudotojas ', email: ' Naujas@Example.lt ', password: 'Saugus-slaptazodis-1' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
    await user.click(await screen.findByRole('option', { name: 'Administrator' }));
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    // The email as typed, trimmed — the backend lowercases it
    expect(posts[0].body).toEqual({ email: 'Naujas@Example.lt', displayName: 'Naujas Naudotojas', role: 'admin', password: 'Saugus-slaptazodis-1' });
    expect(await screen.findByText('User created')).toBeInTheDocument();
    await dialogClosed('New user');
    const created = await rowOf('Naujas Naudotojas');
    expect(cellOf(created, 'Role')).toHaveTextContent(/^Administrator$/);
    expect(cellOf(created, 'Last login')).toHaveTextContent(/^—$/);
  });


  it('Enter in a field submits the form once', async () => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog);
    await user.type(passwordField(dialog), '{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(await screen.findByText('User created')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(1);
  });


  it('a fast double click on the create button sends one POST', async () => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog);
    await user.dblClick(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await screen.findByText('User created')).toBeInTheDocument();
    await dialogClosed('New user');
    await settle(100);
    expect(posts).toHaveLength(1);
  });


  // The dialog keeps its filled form and live buttons through
  // the close animation: a second click that lands after a
  // fast answer must not submit the form again
  it('a second click on the create button while the dialog closes after the success sends nothing', async () => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog);
    const create = within(dialog).getByRole('button', { name: 'New user' });
    await user.click(create);
    await user.click(create);
    expect(await screen.findByText('User created')).toBeInTheDocument();
    await dialogClosed('New user');
    await settle(100);
    expect(posts).toHaveLength(1);
  });


  it('while the POST is on the wire the dialog is busy: both buttons disabled, Escape does not close it', async () => {
    given.hang('post', '/api/users');
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /New user/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await settle(300);
    expect(screen.getByRole('dialog', { name: 'New user' })).toBeInTheDocument();
  });


  // Every refusal of the create route, and the failures without
  // an envelope: shown inside the dialog, which stays open with
  // what was typed — never a toast (the request is silent)
  const REFUSALS = [
    ['EMAIL_TAKEN (409)', () => given.apiError('post', '/api/users', 'EMAIL_TAKEN', { status: 409, error: 'An account with this email already exists' }), 'An account with this email address already exists.'],
    ['WEAK_PASSWORD with the minimum length', () => given.apiError('post', '/api/users', 'WEAK_PASSWORD', { status: 400, error: 'Password must be at least 12 characters' }), 'The password must be at least 12 characters long.'],
    ['WEAK_PASSWORD with the byte ceiling', () => given.apiError('post', '/api/users', 'WEAK_PASSWORD', { status: 400, error: 'Password must be at most 72 bytes' }), 'The password is too long (at most 72 bytes).'],
    ['INVALID_EMAIL', () => given.apiError('post', '/api/users', 'INVALID_EMAIL', { status: 400, error: 'A valid email is required' }), 'Enter a valid email address.'],
    ['INVALID_ROLE', () => given.apiError('post', '/api/users', 'INVALID_ROLE', { status: 400, error: 'Unknown role' }), 'Unknown role.'],
    ['MISSING_FIELDS (the backend prose in English)', () => given.apiError('post', '/api/users', 'MISSING_FIELDS', { status: 400, error: 'displayName is required' }), 'displayName is required'],
    ['a proxy\'s HTML error page', () => given.html('post', '/api/users'), 'The server is temporarily unreachable. Try again.'],
    ['a dropped connection', () => given.networkError('post', '/api/users'), 'Could not reach the server. Check your internet connection.'],
  ];

  for (const [what, arrange, text] of REFUSALS) {
    it(`shows ${what} inside the dialog, keeps what was typed and toasts nothing`, async () => {
      arrange();
      const { user } = renderUsers();
      const dialog = await openCreate(user);
      await fillCreate(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'New user' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(screen.getByRole('dialog', { name: 'New user' })).toBeInTheDocument();
      expect(within(dialog).getByRole('textbox', { name: 'Email' })).toHaveValue('naujas@example.lt');
      expect(within(dialog).getByRole('button', { name: 'New user' })).toBeEnabled();
      expect(screen.queryByText('User created')).toBeNull();
      // One place for the message: the dialog, not a toast as well
      expect(screen.getAllByText(text)).toHaveLength(1);
    });
  }


  it('after a refusal a corrected form goes through and the error is gone', async () => {
    given.sequence('post', '/api/users', [
      { status: 409, body: apiError('EMAIL_TAKEN', 'An account with this email already exists') },
      { status: 201, body: f.NEW.user },
    ]);
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog, { email: 'jonas@example.lt' });
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('An account with this email address already exists.');

    const email = within(dialog).getByRole('textbox', { name: 'Email' });
    await user.clear(email);
    await user.type(email, 'naujas@example.lt');
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await screen.findByText('User created')).toBeInTheDocument();
    await dialogClosed('New user');
  });


  it.each([
    ['EMAIL_TAKEN', 409, 'An account with this email already exists', 'An account with this email address already exists.', /^Email/, 'x'],
    ['WEAK_PASSWORD', 400, 'Password must be at least 12 characters', 'The password must be at least 12 characters long.', /^Password/, '!'],
  ])('%s leaves the dialog as soon as its field changes — not when another field does, and without a request', async (code, status, prose, text, field, typed) => {
    const posts = given.capture('post', '/api/users', apiError(code, prose), { status });
    const { user } = renderUsers();
    const dialog = await openCreate(user);
    await fillCreate(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    // The name is not what the refusal is about
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Jr');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(text);
    await user.type(within(dialog).getByLabelText(field), typed);
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(screen.queryByText(text)).toBeNull();
    expect(posts).toHaveLength(1);
  });


  it('Cancel sends nothing, and the next opening starts blank — no leftover values or messages', async () => {
    const posts = given.capture('post', '/api/users', f.NEW.user, { status: 201 });
    const { user } = renderUsers();
    let dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Nebaigtas');
    await user.click(within(dialog).getByRole('button', { name: 'New user' }));
    expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('New user');

    dialog = await openCreate(user);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(dialog).queryByText('Enter a valid email address')).toBeNull();
    expect(posts).toHaveLength(0);
  });


  it('speaks Lithuanian: the form, its validation, a refusal and the toast', async () => {
    given.sequence('post', '/api/users', [
      { status: 409, body: apiError('EMAIL_TAKEN', 'An account with this email already exists') },
      { status: 201, body: f.NEW.user },
    ]);
    const { user } = renderUsers({ locale: 'lt' });
    const dialog = await openCreate(user, { button: 'Naujas naudotojas', title: 'Naujas naudotojas' });
    expect(within(dialog).getByRole('combobox', { name: 'Rolė' })).toHaveTextContent('Naudotojas');
    expect(within(dialog).getByText('Ne trumpesnis nei 10 simbolių. Perduokite jį naudotojui saugiu kanalu.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Naujas naudotojas' }));
    expect(await within(dialog).findByText('Įveskite vardą')).toBeInTheDocument();
    expect(within(dialog).getByText('Įveskite teisingą el. pašto adresą')).toBeInTheDocument();
    expect(within(dialog).getByText('Slaptažodis turi būti ne trumpesnis nei 10 simbolių')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: 'Vardas' }), 'Naujas Naudotojas');
    await user.type(within(dialog).getByRole('textbox', { name: 'El. paštas' }), 'jonas@example.lt');
    await user.type(passwordField(dialog, /^Slaptažodis/), 'Saugus-slaptazodis-1');
    await user.click(within(dialog).getByRole('button', { name: 'Naujas naudotojas' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Paskyra su šiuo el. pašto adresu jau yra.');

    await user.click(within(dialog).getByRole('button', { name: 'Naujas naudotojas' }));
    expect(await screen.findByText('Naudotojas sukurtas')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Edit dialog
// -----------------------------------------------------------
//
// PATCH /api/users/{id} with only the changed fields; the
// budget's null / 0 / amount; the caller's own row; the
// refusals inside the dialog.
// -----------------------------------------------------------

describe('Users page — the edit dialog', () => {

  it('is pre-filled from the row: name, role, the active switch and a custom budget with its amount', async () => {
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Jonas Naudotojas');
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toHaveTextContent('User');
    expect(within(dialog).getByRole('switch', { name: 'Account active' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Custom' })).toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' })).toHaveValue('5');
    expect(within(dialog).getByText('$')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    // Name, role, status and budget only — the email is fixed
    expect(within(dialog).queryByRole('textbox', { name: 'Email' })).toBeNull();
  });


  it('shows an inactive account switched off and a default budget without an amount field', async () => {
    const { user } = renderUsers();
    const dialog = await openEdit(user, LINA.displayName);
    expect(within(dialog).getByRole('switch', { name: 'Account active' })).not.toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Default' })).toBeChecked();
    expect(within(dialog).queryByRole('textbox', { name: 'Amount per day (UTC), USD' })).toBeNull();
    expect(within(dialog).getByText(/^How much AI model cost \(in US dollars\) the user may incur per day\./)).toBeInTheDocument();
  });


  it('names the budget choice for screen readers: a radio group called "Daily AI budget"', async () => {
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    const group = within(dialog).getByRole('radiogroup', { name: 'Daily AI budget' });
    expect(within(group).getAllByRole('radio').map((radio) => radio.value)).toEqual(['default', 'unlimited', 'custom']);
  });


  it('an untouched form closes on Save without a request or a toast', async () => {
    const patches = given.capture('patch', '/api/users/:userId', JONAS);
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    // Retyping the same amount is no change either
    const amount = within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' });
    await user.clear(amount);
    await user.type(amount, '5.00');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await dialogClosed('Edit user');
    await settle(100);
    expect(patches).toHaveLength(0);
    expect(screen.queryByText('Saved')).toBeNull();
  });


  it('a rename PATCHes the trimmed name alone, toasts "Saved", closes and the grid shows the new name', async () => {
    const patches = given.capture('patch', '/api/users/:userId', { ...JONAS, displayName: 'Jonas Naujasis' });
    given.sequence('get', '/api/users', [{ body: { users: f.users } }, { body: usersWith(JONAS.id, { displayName: 'Jonas Naujasis' }) }]);
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, ' Jonas Naujasis  ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(`http://localhost:3000/api/users/${JONAS.id}`);
    expect(patches[0].body).toEqual({ displayName: 'Jonas Naujasis' });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await dialogClosed('Edit user');
    expect(await rowOf('Jonas Naujasis')).toBeInTheDocument();
  });


  it('an emptied name is refused in the dialog and nothing is sent', async () => {
    const patches = given.capture('patch', '/api/users/:userId', JONAS);
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    await settle(100);
    expect(patches).toHaveLength(0);
  });


  it('promoting to administrator sends the role alone', async () => {
    const patches = given.capture('patch', '/api/users/:userId', { ...JONAS, role: 'admin' });
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
    await user.click(await screen.findByRole('option', { name: 'Administrator' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ role: 'admin' });
  });


  it('switching an account off sends active: false, switching an inactive one on sends active: true', async () => {
    const patches = given.capture('patch', '/api/users/:userId', JONAS);
    const { user } = renderUsers();
    let dialog = await openEdit(user, JONAS.displayName);
    await user.click(within(dialog).getByRole('switch', { name: 'Account active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(`http://localhost:3000/api/users/${JONAS.id}`);
    expect(patches[0].body).toEqual({ active: false });
    await dialogClosed('Edit user');

    dialog = await openEdit(user, LINA.displayName);
    await user.click(within(dialog).getByRole('switch', { name: 'Account active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1].url).toBe(`http://localhost:3000/api/users/${LINA.id}`);
    expect(patches[1].body).toEqual({ active: true });
  });


  it.each([
    ['Default', JONAS, null],
    ['Unlimited', JONAS, 0],
    ['Unlimited', LINA, 0],
  ])('choosing "%s" for %s sends dailyBudgetUsd %s', async (mode, account, budget) => {
    const patches = given.capture('patch', '/api/users/:userId', account);
    const { user } = renderUsers();
    const dialog = await openEdit(user, account.displayName);
    await user.click(within(dialog).getByRole('radio', { name: mode }));
    expect(within(dialog).queryByRole('textbox', { name: 'Amount per day (UTC), USD' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ dailyBudgetUsd: budget });
  });


  it.each([
    ['7,5', 7.5],
    ['2.50', 2.5],
    ['12', 12],
    ['0.25', 0.25],
  ])('a custom budget typed "%s" is sent as %s dollars', async (typed, amount) => {
    const patches = given.capture('patch', '/api/users/:userId', LINA);
    const { user } = renderUsers();
    const dialog = await openEdit(user, LINA.displayName);
    await user.click(within(dialog).getByRole('radio', { name: 'Custom' }));
    const field = within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' });
    expect(field).toHaveValue('');
    await user.type(field, typed);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ dailyBudgetUsd: amount });
  });


  it('keeps only digits and one separator out of what is typed as the amount', async () => {
    const { user } = renderUsers();
    const dialog = await openEdit(user, LINA.displayName);
    await user.click(within(dialog).getByRole('radio', { name: 'Custom' }));
    const field = within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' });
    await user.type(field, 'US$ 3,5 per day');
    expect(field).toHaveValue('3,5');
  });


  it.each([
    ['0'],
    ['0.00'],
    ['1.234'],
    ['1234567'],
    ['1,2,3'],
    [''],
  ])('refuses the custom amount "%s" in the dialog and sends nothing', async (typed) => {
    const patches = given.capture('patch', '/api/users/:userId', LINA);
    const { user } = renderUsers();
    const dialog = await openEdit(user, LINA.displayName);
    await user.click(within(dialog).getByRole('radio', { name: 'Custom' }));
    if (typed) await user.type(within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' }), typed);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter an amount above 0 (e.g. 2.50)')).toBeInTheDocument();
    await settle(100);
    expect(patches).toHaveLength(0);
  });


  it('several changes at once travel together, and only those', async () => {
    const patches = given.capture('patch', '/api/users/:userId', JONAS);
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Jonas N.');
    await user.click(within(dialog).getByRole('radio', { name: 'Unlimited' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ displayName: 'Jonas N.', dailyBudgetUsd: 0 });
  });


  it('the admin\'s own row locks the role and the active switch, says why, and never sends either', async () => {
    const patches = given.capture('patch', '/api/users/:userId', RUTA);
    const { user } = renderUsers();
    let dialog = await openEdit(user, RUTA.displayName);
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByText('You cannot change your own role and status.')).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Account active' })).toBeDisabled();

    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Rūta A.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(`http://localhost:3000/api/users/${RUTA.id}`);
    expect(patches[0].body).toEqual({ displayName: 'Rūta A.' });
    await dialogClosed('Edit user');

    // The own budget stays the admin's to change
    dialog = await openEdit(user, RUTA.displayName);
    await user.click(within(dialog).getByRole('radio', { name: 'Custom' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' }), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1].body).toEqual({ dailyBudgetUsd: 3 });
  });


  it('another administrator\'s role and status stay editable', async () => {
    given.json('get', '/api/users', { users: [...f.users, ANTANAS] });
    const { user } = renderUsers();
    const dialog = await openEdit(user, 'Antanas Antrasis');
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).not.toHaveAttribute('aria-disabled');
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toHaveTextContent('Administrator');
    expect(within(dialog).getByRole('switch', { name: 'Account active' })).toBeEnabled();
    expect(within(dialog).queryByText('You cannot change your own role and status.')).toBeNull();
  });


  // The refusals of the PATCH route — inside the dialog, which
  // stays open; the continuity guard's two codes are 400s
  const REFUSALS = [
    ['LAST_ADMIN', 'The last active admin cannot be demoted', 'The last active administrator cannot be deactivated or demoted.'],
    ['SELF_LOCKOUT', 'You cannot demote yourself', 'You cannot remove your own administrator rights or deactivate your own account.'],
  ];

  for (const [code, prose, text] of REFUSALS) {
    it(`shows the ${code} refusal (400) inside the dialog and keeps it open`, async () => {
      given.json('get', '/api/users', { users: [...f.users, ANTANAS] });
      given.apiError('patch', `/api/users/${ANTANAS.id}`, code, { status: 400, error: prose });
      const { user } = renderUsers();
      const dialog = await openEdit(user, 'Antanas Antrasis');
      await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
      await user.click(await screen.findByRole('option', { name: 'User' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(screen.getByRole('dialog', { name: 'Edit user' })).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox', { name: 'Role' })).toHaveTextContent('User');
      expect(screen.queryByText('Saved')).toBeNull();
      expect(screen.getAllByText(text)).toHaveLength(1);
    });
  }


  // The continuity guard refuses a demotion or a deactivation:
  // either control lifts it, the name does not
  it.each([
    ['demoted', 'the role', async (user, dialog) => {
      await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
      await user.click(await screen.findByRole('option', { name: 'User' }));
    }, async (user, dialog) => {
      await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
      await user.click(await screen.findByRole('option', { name: 'Administrator' }));
    }],
    ['deactivated', 'the switch', async (user, dialog) => {
      await user.click(within(dialog).getByRole('switch', { name: 'Account active' }));
    }, async (user, dialog) => {
      await user.click(within(dialog).getByRole('switch', { name: 'Account active' }));
    }],
  ])('LAST_ADMIN on an admin %s goes as soon as %s is set back — not with the name', async (_, __, refused, lift) => {
    given.json('get', '/api/users', { users: [...f.users, ANTANAS] });
    const patches = given.capture('patch', `/api/users/${ANTANAS.id}`, apiError('LAST_ADMIN', 'The last active admin cannot be demoted'), { status: 400 });
    const text = 'The last active administrator cannot be deactivated or demoted.';
    const { user } = renderUsers();
    const dialog = await openEdit(user, 'Antanas Antrasis');
    await refused(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' A.');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(text);
    await lift(user, dialog);
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
    expect(patches).toHaveLength(1);
  });


  it('a refused budget goes as soon as the amount changes', async () => {
    given.apiError('patch', '/api/users/:userId', 'INVALID_FIELD', { status: 400, error: 'dailyBudgetUsd must be null or an amount from 0 to 10000' });
    const { user } = renderUsers();
    const dialog = await openEdit(user, LINA.displayName);
    await user.click(within(dialog).getByRole('radio', { name: 'Custom' }));
    const amount = within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' });
    await user.type(amount, '20000');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('dailyBudgetUsd must be null or an amount from 0 to 10000');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' B.');
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    await user.type(amount, '{Backspace}');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('a failure of the request itself stays while the fields change; the next save replaces it', async () => {
    given.sequence('patch', '/api/users/:userId', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { ...JONAS, displayName: 'Jonas N.x' } },
    ]);
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Jonas N.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await user.type(name, 'x');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await dialogClosed('Edit user');
  });


  it('names the budget field when the backend refuses the amount — its own prose in English, the field\'s label in Lithuanian', async () => {
    given.apiError('patch', '/api/users/:userId', 'INVALID_FIELD', { status: 400, error: 'dailyBudgetUsd must be null or an amount from 0 to 10000' });
    const { user } = renderUsers();
    const dialog = await openEdit(user, LINA.displayName);
    await user.click(within(dialog).getByRole('radio', { name: 'Custom' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Amount per day (UTC), USD' }), '20000');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('dailyBudgetUsd must be null or an amount from 0 to 10000');
  });


  it('in Lithuanian a refused amount names the field by its label, never the wire name', async () => {
    given.apiError('patch', '/api/users/:userId', 'INVALID_FIELD', { status: 400, error: 'dailyBudgetUsd must be null or an amount from 0 to 10000' });
    const { user } = renderUsers({ locale: 'lt' });
    const dialog = await openRowDialog(user, LINA.displayName, 'Redaguoti', 'Redaguoti naudotoją');
    await user.click(within(dialog).getByRole('radio', { name: 'Individualus' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Suma per parą (UTC), USD' }), '20000');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Neteisinga lauko „Dienos DI biudžetas“ reikšmė.');
    expect(alert).not.toHaveTextContent('dailyBudgetUsd');
  });


  it('an account deleted meanwhile answers 404 — said in the dialog', async () => {
    given.apiError('patch', '/api/users/:userId', 'NOT_FOUND', { status: 404, error: 'User not found' });
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    await user.click(within(dialog).getByRole('switch', { name: 'Account active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
  });


  it('a refused edit, cancelled, reopens with the row\'s values and no error', async () => {
    given.apiError('patch', '/api/users/:userId', 'SERVER_ERROR', { status: 500, error: 'Internal server error' });
    const { user } = renderUsers();
    let dialog = await openEdit(user, JONAS.displayName);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Kažkas kitas');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('Edit user');

    dialog = await openEdit(user, JONAS.displayName);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Jonas Naudotojas');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Reset-password dialog
// -----------------------------------------------------------
//
// POST /api/users/{id}/reset-password {password}.
// -----------------------------------------------------------

describe('Users page — the reset-password dialog', () => {

  it('explains that every session of the account ends and states the password rule', async () => {
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Reset password', 'Set a new password');
    expect(within(dialog).getByText('All of this user\'s sessions will be ended.')).toBeInTheDocument();
    expect(within(dialog).getByText('At least 10 characters. Hand it over through a safe channel.')).toBeInTheDocument();
    expect(passwordField(dialog)).toHaveValue('');
    expect(passwordField(dialog)).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });


  it('refuses a short password in the dialog and sends nothing', async () => {
    const posts = given.capture('post', '/api/users/:userId/reset-password', { ok: true });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Reset password', 'Set a new password');
    await user.type(passwordField(dialog), 'trumpas');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByText('The password must be at least 10 characters long')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('POSTs the new password for that account, toasts and closes', async () => {
    const posts = given.capture('post', '/api/users/:userId/reset-password', { ok: true });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Reset password', 'Set a new password');
    await user.type(passwordField(dialog), 'Naujas-slaptazodis-2');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe(`http://localhost:3000/api/users/${JONAS.id}/reset-password`);
    expect(posts[0].body).toEqual({ password: 'Naujas-slaptazodis-2' });
    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    await dialogClosed('Set a new password');
  });


  it('a refused password goes as soon as the password changes; a vanished account stays said', async () => {
    given.sequence('post', '/api/users/:userId/reset-password', [
      { status: 400, body: apiError('WEAK_PASSWORD', 'Password must be at most 72 bytes') },
      { status: 404, body: apiError('NOT_FOUND', 'User not found') },
    ]);
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Reset password', 'Set a new password');
    await user.type(passwordField(dialog), 'ą'.repeat(37));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The password is too long (at most 72 bytes).');
    await user.type(passwordField(dialog), '{Backspace}');
    expect(within(dialog).queryByRole('alert')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    await user.type(passwordField(dialog), '{Backspace}');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
  });


  it.each([
    ['WEAK_PASSWORD', 400, 'Password must be at most 72 bytes', 'The password is too long (at most 72 bytes).'],
    ['NOT_FOUND', 404, 'User not found', 'Not found — it may have been deleted.'],
  ])('shows %s inside the dialog, which stays open', async (code, status, prose, text) => {
    given.apiError('post', '/api/users/:userId/reset-password', code, { status, error: prose });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Reset password', 'Set a new password');
    await user.type(passwordField(dialog), 'ą'.repeat(37));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('dialog', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.queryByText('Password reset')).toBeNull();
  });


  it('speaks Lithuanian', async () => {
    given.capture('post', '/api/users/:userId/reset-password', { ok: true });
    const { user } = renderUsers({ locale: 'lt' });
    const dialog = await openRowDialog(user, JONAS.displayName, 'Keisti slaptažodį', 'Nustatyti naują slaptažodį');
    expect(within(dialog).getByText('Visos šio naudotojo sesijos bus nutrauktos.')).toBeInTheDocument();
    await user.type(passwordField(dialog, /^Slaptažodis/), 'Naujas-slaptazodis-2');
    await user.click(within(dialog).getByRole('button', { name: 'Patvirtinti' }));
    expect(await screen.findByText('Slaptažodis pakeistas')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Deactivate confirmation
// -----------------------------------------------------------
//
// DELETE /api/users/{id} — deactivation, never deletion.
// -----------------------------------------------------------

describe('Users page — the deactivate confirmation', () => {

  it('names the account, says it is disabled and not deleted, and Cancel sends nothing', async () => {
    const deletes = given.capture('delete', '/api/users/:userId', { ...JONAS, active: false });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Deactivate', 'Deactivate user Jonas Naudotojas?');
    expect(within(dialog).getByText('The account is disabled and every session is killed. The account is not deleted.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('Deactivate user Jonas Naudotojas?');
    await settle(50);
    expect(deletes).toHaveLength(0);
  });


  it('confirming DELETEs the account, toasts, closes and the grid shows it inactive', async () => {
    const deletes = given.capture('delete', '/api/users/:userId', { ...JONAS, active: false });
    given.sequence('get', '/api/users', [{ body: { users: f.users } }, { body: usersWith(JONAS.id, { active: false }) }]);
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Deactivate', 'Deactivate user Jonas Naudotojas?');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(`http://localhost:3000/api/users/${JONAS.id}`);
    expect(deletes[0].query).toEqual({});
    expect(await screen.findByText('User deactivated')).toBeInTheDocument();
    await dialogClosed('Deactivate user Jonas Naudotojas?');
    const jonas = await rowOf(JONAS.displayName);
    await waitFor(() => expect(cellOf(jonas, 'Status')).toHaveTextContent(/^Inactive$/));
    expect(within(await rowOf(JONAS.displayName)).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });


  it.each([
    ['LAST_ADMIN', 'The last active admin cannot be deactivated', 'The last active administrator cannot be deactivated or demoted.'],
    ['SELF_LOCKOUT', 'You cannot deactivate yourself', 'You cannot remove your own administrator rights or deactivate your own account.'],
  ])('shows the %s refusal (400) in the confirmation, which stays open', async (code, prose, text) => {
    given.json('get', '/api/users', { users: [...f.users, ANTANAS] });
    given.apiError('delete', `/api/users/${ANTANAS.id}`, code, { status: 400, error: prose });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, 'Antanas Antrasis', 'Deactivate', 'Deactivate user Antanas Antrasis?');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('dialog', { name: 'Deactivate user Antanas Antrasis?' })).toBeInTheDocument();
    expect(screen.queryByText('User deactivated')).toBeNull();
    expect(screen.getAllByText(text)).toHaveLength(1);
  });


  it('a fast double click on Deactivate sends one DELETE', async () => {
    const deletes = given.capture('delete', '/api/users/:userId', { ...JONAS, active: false });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Deactivate', 'Deactivate user Jonas Naudotojas?');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('User deactivated')).toBeInTheDocument();
    await dialogClosed('Deactivate user Jonas Naudotojas?');
    await settle(100);
    expect(deletes).toHaveLength(1);
  });


  it('a second click on Deactivate while the confirmation closes after the success sends nothing', async () => {
    const deletes = given.capture('delete', '/api/users/:userId', { ...JONAS, active: false });
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Deactivate', 'Deactivate user Jonas Naudotojas?');
    const confirm = within(dialog).getByRole('button', { name: 'Deactivate' });
    await user.click(confirm);
    await user.click(confirm);
    expect(await screen.findByText('User deactivated')).toBeInTheDocument();
    await dialogClosed('Deactivate user Jonas Naudotojas?');
    await settle(100);
    expect(deletes).toHaveLength(1);
  });


  it('while the DELETE is on the wire both buttons are disabled and Escape does not close it', async () => {
    given.hang('delete', '/api/users/:userId');
    const { user } = renderUsers();
    const dialog = await openRowDialog(user, JONAS.displayName, 'Deactivate', 'Deactivate user Jonas Naudotojas?');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Deactivate/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await settle(300);
    expect(screen.getByRole('dialog', { name: 'Deactivate user Jonas Naudotojas?' })).toBeInTheDocument();
  });


  it('speaks Lithuanian', async () => {
    given.capture('delete', '/api/users/:userId', { ...JONAS, active: false });
    const { user } = renderUsers({ locale: 'lt' });
    const dialog = await openRowDialog(user, JONAS.displayName, 'Deaktyvuoti', 'Deaktyvuoti naudotoją Jonas Naudotojas?');
    expect(within(dialog).getByText('Paskyra bus išjungta ir visos jos sesijos nutrauktos. Paskyra neištrinama.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Deaktyvuoti' }));
    expect(await screen.findByText('Naudotojas deaktyvuotas')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Hold to delete
// -----------------------------------------------------------
//
// The hold runs on the button's own clock — Date and the
// animation frames, faked from the press on — while the
// requests and the toasts keep real time once it is over.
// -----------------------------------------------------------

describe('Users page — the hold-to-delete button', () => {

  const HOLD_CLOCK = ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const deleteButton = async (name, label = 'Delete with all data') => within(await rowOf(name)).getByRole('button', { name: label });
  const press = (button) => {
    vi.useFakeTimers({ toFake: HOLD_CLOCK });
    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1 });
  };
  const wait = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
  const holdThrough = async (button) => {
    press(button);
    await wait(2100);
    vi.useRealTimers();
  };

  afterEach(() => {
    vi.useRealTimers();
  });


  it('held for two seconds, it deletes the account with all its data (?purge=true), toasts what went, and the row leaves the list', async () => {
    const deletes = given.capture('delete', '/api/users/:userId', { ok: true, removed: f.ownedBy(JONAS.id) });
    given.sequence('get', '/api/users', [{ body: { users: f.users } }, { body: { users: f.users.filter((row) => row.id !== JONAS.id) } }]);
    renderUsers();
    const button = await deleteButton(JONAS.displayName);
    press(button);
    await wait(1000);
    expect(deletes).toHaveLength(0);
    expect(within(button).getAllByRole('progressbar')).toHaveLength(2);
    await wait(1100);
    vi.useRealTimers();
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(`http://localhost:3000/api/users/${JONAS.id}?purge=true`);
    expect(deletes[0].query).toEqual({ purge: 'true' });
    const owned = f.ownedBy(JONAS.id);
    expect(await screen.findByText(`User Jonas Naudotojas deleted with all data (companies: ${owned.companies}, reports: ${owned.reports}, `
      + `documents: ${owned.documents}, conversations: ${owned.threads})`)).toBeInTheDocument();
    await waitFor(() => expect(shownNames()).not.toContain(JONAS.displayName));
  });


  it('let go early, it deletes nothing and says to hold the button for two seconds', async () => {
    const deletes = given.spy('delete', '/api/users/:userId');
    renderUsers();
    const button = await deleteButton(JONAS.displayName);
    press(button);
    await wait(800);
    fireEvent.pointerUp(button, { pointerId: 1 });
    await wait(3000);
    vi.useRealTimers();
    expect(await screen.findByText('Hold the button for 2 seconds to delete the user with all data')).toBeInTheDocument();
    await settle(50);
    expect(deletes).toHaveLength(0);
  });


  it('a press on it leaves the rest of the row alone — the grid moves no focus to the row\'s Edit button', async () => {
    renderUsers();
    const button = await deleteButton(JONAS.displayName);
    press(button);
    fireEvent.mouseDown(button);
    await wait(300);
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.mouseUp(button);
    fireEvent.click(button);
    vi.useRealTimers();
    await settle(50);
    expect(within(await rowOf(JONAS.displayName)).getByRole('button', { name: 'Edit' })).not.toHaveFocus();
  });


  it('is named for what it does, tells a screen reader to hold it, and its tooltip says so too', async () => {
    const { user } = renderUsers();
    const button = await deleteButton(JONAS.displayName);
    expect(button).toHaveAccessibleDescription('Hold for 2 seconds to confirm');
    await user.hover(button.parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Hold 2 seconds to delete with all data');
  });


  it('while the delete runs, its row shows a spinner and no other delete can start', async () => {
    given.hang('delete', '/api/users/:userId');
    renderUsers();
    const button = await deleteButton(JONAS.displayName);
    await holdThrough(button);
    await waitFor(() => expect(within(button).getByRole('progressbar')).toBeInTheDocument());
    expect(button).toBeDisabled();
    expect(await deleteButton(LINA.displayName)).toBeDisabled();
  });


  it('a refusal (an analysis still at work, 409) is toasted and the account stays', async () => {
    given.apiError('delete', '/api/users/:userId', 'STILL_RUNNING', { status: 409, error: "Cancel the running analysis of the account's company first" });
    renderUsers();
    await holdThrough(await deleteButton(JONAS.displayName));
    expect(await screen.findByText('Cancel the running analysis or the document generation first.')).toBeInTheDocument();
    expect(shownNames()).toContain(JONAS.displayName);
    expect(screen.queryByText(/deleted with all data/)).toBeNull();
  });


  it('the signed-in admin cannot delete their own account; any other can be, an inactive one too', async () => {
    renderUsers();
    expect(await deleteButton(RUTA.displayName)).toBeDisabled();
    expect(await deleteButton(JONAS.displayName)).toBeEnabled();
    expect(await deleteButton(LINA.displayName)).toBeEnabled();
  });


  it('speaks Lithuanian', async () => {
    const deletes = given.capture('delete', '/api/users/:userId', { ok: true, removed: f.ownedBy(JONAS.id) });
    renderUsers({ locale: 'lt' });
    const button = await deleteButton(JONAS.displayName, 'Ištrinti su visais duomenimis');
    expect(button).toHaveAccessibleDescription('Laikykite 2 sek., kad patvirtintumėte');
    await holdThrough(button);
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(await screen.findByText(/^Naudotojas Jonas Naudotojas ištrintas su visais duomenimis \(įmonės: /)).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Session
// -----------------------------------------------------------

describe('Users page — an expired session', () => {

  it('a 401 on a save drops the token and hard-redirects to /login with the page as ?next=, instead of an inline error', async () => {
    signIn();
    given.unauthorized('patch', '/api/users/:userId');
    const { user } = renderUsers();
    const dialog = await openEdit(user, JONAS.displayName);
    await user.click(within(dialog).getByRole('switch', { name: 'Account active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fusers&expired=1']));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the directory's endpoint.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/users',
  fixture: { users: f.users },
  render: () => renderUsers(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Users' }),
  loaded: async () => { await rowOf(JONAS.displayName); },
  loading: gridLoading,
});
