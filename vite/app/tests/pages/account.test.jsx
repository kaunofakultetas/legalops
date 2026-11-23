// -----------------------------------------------------------
//  [*] Tests — Account page (profile, password, log out everywhere)
//
//  The /account page end to end against the backend double,
//  for every signed-in user:
//
//    - the profile card (name, email, role) of the
//      administrator and of a plain user
//    - the change-password form: three masked fields with
//      the browser's password-manager hints, the policy hint,
//      the client-side checks the way users/auth.py counts
//      them (at least 10 characters as code points — an emoji
//      is one — and at most 72 bytes of UTF-8, where ą or ž
//      take two), the repeat, the captured POST body, Enter,
//      the busy state, the success toast and the cleared
//      form, every refusal shown translated under the form
//      (WRONG_PASSWORD, WEAK_PASSWORD with the minimum and
//      the maximum sentence, a server error, a dropped
//      connection) and a lost session's 401
//    - "log out everywhere": the confirmation, the POST, the
//      token dropped and the hard move to /login whatever
//      the backend answers
//    - the language switch in the top bar, both locales, and
//      both roles through the real route table
//
//  The page reads no endpoint of its own (the profile is the
//  session's), so there is no contract matrix; the two
//  mutations' failures are covered one by one.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderPage, renderApp, authData, userAuthData } from '../support/render';
import { signIn, TOKEN_KEY } from '../support/auth';
import { given, apiError } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Account from '@/pages/Account/Account';


const CHANGE_URL = '/api/auth/change-password';
const LOGOUT_ALL_URL = '/api/auth/logout-all';

// A valid pair: the current password and a new one of 14
const CURRENT = 'SenasSlaptažodis1';
const NEXT = 'NaujasSlaptas14';

const HINT = 'At least 10 characters and at most 72 bytes (a letter like ą or ž takes two).';
const TOO_SHORT = 'The password must be at least 10 characters long';
const TOO_LONG = 'The password is too long: at most 72 bytes (a letter like ą or ž takes two)';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// The navbar repeats the user's name in its account button,
// so the profile is read inside the <main> landmark. The
// password inputs have no ARIA role (type="password"): they
// are found by their labels, which carry MUI's required " *".
// fillForm types a submission (the repeat defaults to the
// new password); setNext sets a value in one go where typing
// astral characters key by key would be the test's problem,
// not the page's.
// -----------------------------------------------------------

const renderAccount = (options = {}) => renderPage(<Account authData={authData} />, { route: '/account', path: '/account', ...options });

const main = () => screen.getByRole('main');

const fields = () => ({
  current: screen.getByLabelText(/^Current password/),
  next: screen.getByLabelText(/^New password/),
  repeat: screen.getByLabelText(/^Repeat the new password/),
});

const saveButton = () => within(main()).getByRole('button', { name: 'Save' });

const profileCard = () => within(main()).getByRole('heading', { level: 2, name: 'Profile' }).parentElement;

async function fillForm(user, { current = CURRENT, next = NEXT, repeat = next } = {}) {
  const inputs = fields();
  if (current) await user.type(inputs.current, current);
  if (next) await user.type(inputs.next, next);
  if (repeat) await user.type(inputs.repeat, repeat);
}

// Sets the new password and its repeat without typing
function setNext(value) {
  fireEvent.change(fields().next, { target: { value } });
  fireEvent.change(fields().repeat, { target: { value } });
}







// -----------------------------------------------------------
// Profile
// -----------------------------------------------------------

describe('Account — profile', () => {

  it('titles the page and shows the administrator\'s name, email and role', () => {
    renderAccount();
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    const card = profileCard();
    expect(within(card).getByText('Rūta Administratorė')).toBeInTheDocument();
    expect(within(card).getByText('admin@example.lt')).toBeInTheDocument();
    expect(within(card).getByText('Administrator')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
  });


  it('shows a plain user\'s own profile with the "User" role', () => {
    renderPage(<Account authData={userAuthData} />, { route: '/account', path: '/account' });
    const card = profileCard();
    expect(within(card).getByText('Jonas Naudotojas')).toBeInTheDocument();
    expect(within(card).getByText('jonas@example.lt')).toBeInTheDocument();
    expect(within(card).getByText('User')).toBeInTheDocument();
    expect(within(card).queryByText('Administrator')).toBeNull();
  });
});







// -----------------------------------------------------------
// The password form — fields and client checks
// -----------------------------------------------------------

describe('Account — change password: the form', () => {

  it('offers three required, masked fields with the password-manager hints, the policy hint and the note', () => {
    renderAccount();
    expect(within(main()).getByRole('heading', { level: 2, name: 'Change password' })).toBeInTheDocument();
    expect(within(main()).getByText('Changing the password ends your other sessions.')).toBeInTheDocument();
    const { current, next, repeat } = fields();
    for (const input of [current, next, repeat]) {
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toBeRequired();
      expect(input).toHaveValue('');
      expect(input).not.toHaveAttribute('aria-invalid', 'true');
    }
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');
    expect(repeat).toHaveAttribute('autocomplete', 'new-password');
    expect(next).toHaveAccessibleDescription(HINT);
  });


  it('flags nothing before the first submit, then every problem at once — and sends nothing', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await user.type(fields().next, 'trumpas');
    await user.type(fields().repeat, 'kitoks');
    expect(fields().next).not.toHaveAttribute('aria-invalid', 'true');

    await user.click(saveButton());
    const { current, next, repeat } = fields();
    expect(current).toHaveAccessibleDescription('Required');
    expect(current).toHaveAttribute('aria-invalid', 'true');
    expect(next).toHaveAccessibleDescription(TOO_SHORT);
    expect(repeat).toHaveAccessibleDescription('Passwords do not match');
    await settle(50);
    expect(calls).toHaveLength(0);
  });


  it('after a failed submit the messages follow what is typed', async () => {
    const { user } = renderAccount();
    await user.click(saveButton());
    await user.type(fields().current, CURRENT);
    expect(fields().current).not.toHaveAttribute('aria-invalid', 'true');
    await user.type(fields().next, NEXT);
    expect(fields().next).toHaveAccessibleDescription(HINT);
    expect(fields().repeat).toHaveAccessibleDescription('Passwords do not match');
    await user.type(fields().repeat, NEXT);
    expect(fields().repeat).not.toHaveAttribute('aria-invalid', 'true');
  });


  it('takes exactly 10 characters and refuses 9', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await fillForm(user, { next: 'devyniaiX' });
    await user.click(saveButton());
    expect(fields().next).toHaveAccessibleDescription(TOO_SHORT);
    await user.type(fields().next, '1');
    await user.type(fields().repeat, '1');
    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.newPassword).toBe('devyniaiX1');
  });


  it('counts Lithuanian letters as one character each: ten of them (20 bytes) pass', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await fillForm(user, { next: 'ąčęėįšųūžĄ' });
    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.newPassword).toBe('ąčęėįšųūžĄ');
  });


  it('counts the ceiling in UTF-8 bytes: 36 × "ž" (72 bytes) pass, 37 (74 bytes, only 37 characters) are refused', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await user.type(fields().current, CURRENT);
    setNext('ž'.repeat(37));
    await user.click(saveButton());
    expect(fields().next).toHaveAccessibleDescription(TOO_LONG);
    await settle(50);
    expect(calls).toHaveLength(0);

    setNext('ž'.repeat(36));
    expect(fields().next).toHaveAccessibleDescription(HINT);
    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.newPassword).toBe('ž'.repeat(36));
  });


  it('refuses 73 plain characters and takes 72', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await user.type(fields().current, CURRENT);
    setNext('a'.repeat(73));
    await user.click(saveButton());
    expect(fields().next).toHaveAccessibleDescription(TOO_LONG);
    setNext('a'.repeat(72));
    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.newPassword).toHaveLength(72);
  });


  it('counts an emoji as one character like the backend: five are too short though they are ten UTF-16 units', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await user.type(fields().current, CURRENT);
    // Five astral emoji: 5 code points, 10 UTF-16 units
    const five = '💾🔑🔒🗝🧩';
    expect([five.length, [...five].length]).toEqual([10, 5]);
    setNext(five);
    await user.click(saveButton());
    expect(fields().next).toHaveAccessibleDescription(TOO_SHORT);

    // 18 four-byte emoji: 18 characters, exactly 72 bytes
    setNext('🔑'.repeat(18));
    expect(fields().next).toHaveAccessibleDescription(HINT);
    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.newPassword).toBe('🔑'.repeat(18));
  });
});







// -----------------------------------------------------------
// The password form — submitting
// -----------------------------------------------------------

describe('Account — change password: submitting', () => {

  it('POSTs the current and the new password (never the repeat), toasts, and clears the form without flags', async () => {
    signIn();
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await fillForm(user);
    await user.click(saveButton());

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
    expect(calls[0].headers['content-type']).toMatch(/application\/json/);
    expect(calls[0].headers.authorization).toBe('Bearer test-token');
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    const { current, next, repeat } = fields();
    for (const input of [current, next, repeat]) {
      expect(input).toHaveValue('');
      expect(input).not.toHaveAttribute('aria-invalid', 'true');
    }
    // This session survives the change: no redirect, token kept
    expect(window.location.navigations).toEqual([]);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token');
  });


  it('Enter in the repeat field submits', async () => {
    const calls = given.capture('post', CHANGE_URL, { ok: true });
    const { user } = renderAccount();
    await fillForm(user, { repeat: `${NEXT}{Enter}` });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
  });


  it('the save button is busy while the change is on the wire', async () => {
    given.slow('post', CHANGE_URL, 300, { ok: true });
    const { user } = renderAccount();
    await fillForm(user);
    await user.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });


  it('a wrong current password (WRONG_PASSWORD) is shown under the form, what was typed stays, nothing is toasted', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.apiError('post', CHANGE_URL, 'WRONG_PASSWORD', { status: 400, error: 'Current password is wrong' });
    const { user } = renderAccount();
    await fillForm(user);
    await user.click(saveButton());
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('The current password is wrong.');
    expect(alert).not.toHaveTextContent('Current password is wrong');
    const { current, next, repeat } = fields();
    expect(current).toHaveValue(CURRENT);
    expect(next).toHaveValue(NEXT);
    expect(repeat).toHaveValue(NEXT);
    expect(screen.queryByText('Password changed')).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
    await settle(50);
    expect(window.location.navigations).toEqual([]);
  });


  // The backend's own policy refusals, read back into the
  // translated sentence with the number the prose carries
  const WEAK = [
    ['the minimum', 'Password must be at least 10 characters', 'The password must be at least 10 characters long.'],
    ['the maximum', 'Password must be at most 72 bytes', 'The password is too long (at most 72 bytes).'],
    ['a rule without a number', 'Password is too common', 'The password does not meet the requirements.'],
  ];

  for (const [what, prose, sentence] of WEAK) {
    it(`WEAK_PASSWORD with ${what} reads "${sentence}"`, async () => {
      given.apiError('post', CHANGE_URL, 'WEAK_PASSWORD', { status: 400, error: prose });
      const { user } = renderAccount();
      await fillForm(user);
      await user.click(saveButton());
      expect(await within(main()).findByRole('alert')).toHaveTextContent(sentence);
    });
  }


  it('a server error and a dropped connection are shown in their own words', async () => {
    given.sequence('post', CHANGE_URL, [{ status: 500, body: apiError('SERVER_ERROR', 'boom') }, { error: true }]);
    const { user } = renderAccount();
    await fillForm(user);
    await user.click(saveButton());
    expect(await within(main()).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await user.click(saveButton());
    await waitFor(() => expect(within(main()).getByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.'));
  });


  it('the next successful change clears the refusal', async () => {
    given.sequence('post', CHANGE_URL, [{ status: 400, body: apiError('WRONG_PASSWORD', 'Current password is wrong') }, { body: { ok: true } }]);
    const { user } = renderAccount();
    await fillForm(user);
    await user.click(saveButton());
    expect(await within(main()).findByRole('alert')).toHaveTextContent('The current password is wrong.');
    await user.click(saveButton());
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(within(main()).queryByRole('alert')).toBeNull();
  });


  it('a lost session (401) goes to sign in again, back to /account afterwards, and drops the token', async () => {
    signIn();
    given.unauthorized('post', CHANGE_URL);
    const { user } = renderAccount();
    await fillForm(user);
    await user.click(saveButton());
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Faccount&expired=1']));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});







// -----------------------------------------------------------
// Log out everywhere
// -----------------------------------------------------------

describe('Account — log out everywhere', () => {

  const logoutButton = () => within(main()).getByRole('button', { name: 'Log out everywhere' });

  const confirmLogout = async (user) => {
    await user.click(logoutButton());
    const dialog = await screen.findByRole('dialog', { name: 'Log out on every device?' });
    await user.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }));
    return dialog;
  };


  it('explains the button, and asks first — "Cancel" sends nothing and keeps the session', async () => {
    signIn();
    const calls = given.capture('post', LOGOUT_ALL_URL, { ok: true });
    const { user } = renderAccount();
    expect(within(main()).getByText('Kills every session, including this one.')).toBeInTheDocument();
    await user.click(logoutButton());
    const dialog = await screen.findByRole('dialog', { name: 'Log out on every device?' });
    expect(dialog).toHaveTextContent('All your sessions — this browser included — will be ended. You will have to sign in again.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(calls).toHaveLength(0);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token');
    expect(window.location.navigations).toEqual([]);
  });


  it('confirmed, it posts with the bearer, drops the token and replaces the page with /login', async () => {
    signIn();
    const calls = given.capture('post', LOGOUT_ALL_URL, { ok: true });
    const { user } = renderAccount();
    await confirmLogout(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.authorization).toBe('Bearer test-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });


  // Whatever the backend answers, the local session ends
  const OUTCOMES = [
    ['a server error', () => given.apiError('post', LOGOUT_ALL_URL, 'SERVER_ERROR', { status: 500 })],
    ['a dead token (401 — no "session expired" detour)', () => given.unauthorized('post', LOGOUT_ALL_URL)],
    ['a dropped connection', () => given.networkError('post', LOGOUT_ALL_URL)],
  ];

  for (const [what, arrange] of OUTCOMES) {
    it(`after ${what} the token is dropped and the page goes to /login all the same, with no toast`, async () => {
      const toastError = vi.spyOn(toast, 'error');
      signIn();
      arrange();
      const { user } = renderAccount();
      await confirmLogout(user);
      await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(toastError).not.toHaveBeenCalled();
    });
  }


  it('keeps the dialog busy while the request is on the wire', async () => {
    signIn();
    given.slow('post', LOGOUT_ALL_URL, 300, { ok: true });
    const { user } = renderAccount();
    const dialog = await confirmLogout(user);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Log out on every device?' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login']));
  });
});







// -----------------------------------------------------------
// Language
// -----------------------------------------------------------

describe('Account — language', () => {

  it('the top bar\'s language switch re-renders the page in Lithuanian, keeps what was typed and remembers the choice', async () => {
    const { user } = renderAccount();
    await user.type(fields().current, CURRENT);
    await user.click(saveButton());
    expect(fields().next).toHaveAccessibleDescription(TOO_SHORT);

    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Paskyra' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Dabartinis slaptažodis/)).toHaveValue(CURRENT);
    expect(screen.getByLabelText(/^Naujas slaptažodis/)).toHaveAccessibleDescription('Slaptažodis turi būti ne trumpesnis nei 10 simbolių');
    expect(document.cookie).toMatch(/(^|;\s*)locale=lt(;|$)/);
    expect(document.documentElement.lang).toBe('lt');
    expect(screen.getByRole('button', { name: 'Switch the interface to English' })).toBeInTheDocument();
  });


  it('speaks Lithuanian: profile, form, hint, checks, a refusal, the toast and the logout dialog', async () => {
    given.sequence('post', CHANGE_URL, [{ status: 400, body: apiError('WRONG_PASSWORD', 'Current password is wrong') }, { body: { ok: true } }]);
    const { user } = renderAccount({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Paskyra' })).toBeInTheDocument();
    const card = within(main()).getByRole('heading', { level: 2, name: 'Profilis' }).parentElement;
    expect(within(card).getByText('Administratorius')).toBeInTheDocument();
    expect(within(main()).getByRole('heading', { level: 2, name: 'Keisti slaptažodį' })).toBeInTheDocument();
    expect(within(main()).getByText('Pakeitus slaptažodį, kitos jūsų sesijos bus nutrauktos.')).toBeInTheDocument();

    const current = screen.getByLabelText(/^Dabartinis slaptažodis/);
    const next = screen.getByLabelText(/^Naujas slaptažodis/);
    const repeat = screen.getByLabelText(/^Pakartokite naują slaptažodį/);
    expect(next).toHaveAccessibleDescription('Nuo 10 simbolių iki 72 baitų (raidė, pvz., ą ar ž, užima du baitus).');

    const save = within(main()).getByRole('button', { name: 'Išsaugoti' });
    await user.type(repeat, 'x');
    await user.click(save);
    expect(current).toHaveAccessibleDescription('Privalomas laukas');
    expect(next).toHaveAccessibleDescription('Slaptažodis turi būti ne trumpesnis nei 10 simbolių');
    expect(repeat).toHaveAccessibleDescription('Slaptažodžiai nesutampa');

    fireEvent.change(next, { target: { value: 'ž'.repeat(37) } });
    expect(next).toHaveAccessibleDescription('Slaptažodis per ilgas: leidžiama iki 72 baitų (raidė, pvz., ą ar ž, užima du baitus)');

    await user.type(current, CURRENT);
    fireEvent.change(next, { target: { value: NEXT } });
    fireEvent.change(repeat, { target: { value: NEXT } });
    await user.click(save);
    expect(await within(main()).findByRole('alert')).toHaveTextContent('Dabartinis slaptažodis neteisingas.');
    await user.click(save);
    expect(await screen.findByText('Slaptažodis pakeistas')).toBeInTheDocument();

    await user.click(within(main()).getByRole('button', { name: 'Atsijungti visuose įrenginiuose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atsijungti visuose įrenginiuose?' });
    expect(dialog).toHaveTextContent('Visos jūsų sesijos — ir šioje naršyklėje — bus nutrauktos. Teks prisijungti iš naujo.');
    expect(within(dialog).getByRole('button', { name: 'Atšaukti' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Both roles, through the real route table
// -----------------------------------------------------------

describe('Account route — both roles', () => {

  it('the administrator reaches /account, titled in the tab', async () => {
    renderApp({ route: '/account' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(within(profileCard()).getByText('admin@example.lt')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Account · Compliance assistant'));
  });


  it('a plain user reaches /account too — it is not an admin page — and sees their own profile', async () => {
    given.json('get', '/api/auth/me', f.plainUser);
    renderApp({ route: '/account' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(within(profileCard()).getByText('Jonas Naudotojas')).toBeInTheDocument();
    expect(within(profileCard()).getByText('User')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Access restricted' })).toBeNull();
  });
});
