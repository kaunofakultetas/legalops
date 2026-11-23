// -----------------------------------------------------------
//  [*] Tests — Chat company panel (and the header's company)
//
//  CompanyPanel.jsx and the chat header's company button:
//
//    - the toggle (aria-expanded / aria-controls), the panel
//      as a drawer below lg and as a column from lg (whose
//      open state is remembered), closing it;
//    - what the conversation knows about its company: GET
//      /api/chat/threads/:id says which company is linked,
//      GET /api/companies/:id what it is — the profile facts
//      (tri-state facts never read "no" for unknown), the
//      credentials (claimed vs verified), the documents (their
//      extraction), the role profiles with the conversation's
//      role marked, the link to the company page; a
//      conversation without a company, empty sections, the
//      loading state, a failed load (what, why, a retry);
//    - the header's company button labelled with the linked
//      company (the user guide's "the conversation header
//      shows the linked company") — it read "Company" always
//      — and the role the conversation adopts (out of sight
//      below sm, never out of the button's name);
//    - linking and unlinking in the panel (ThreadLink.jsx):
//      the user's companies (GET /api/companies) and the
//      linked company's roles as pickers — somebody else's
//      company (an administrator's list) named with its
//      owner, found by the owner's name too, two companies
//      of one name told apart, rows without an owner — the
//      exact PATCH /api/chat/threads/:id bodies ({companyId},
//      {companyId: null}, {roleId}, {roleId: null}), a
//      company change that drops the old company's role
//      (Django's answer), the panel and the header (company
//      and role) following at once, the
//      refusals said in the panel (a company that is not the
//      user's, a role of another company, a server error), a
//      save under way, a new conversation created first, the
//      next turn sent after the link;
//    - linking and unlinking by the assistant (its
//      setThreadCompany / setThreadRole tools): when a turn
//      ends the row and the company are read again, so the
//      panel and the header follow a link, an unlink or a new
//      role — the header even with the panel closed;
//    - both languages, both roles, and the contract matrices
//      of GET /api/companies/:id, of the thread row as the
//      open panel reads it and of the companies the picker
//      offers (GET /api/companies).
// -----------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { userAuthData } from '../support/render';
import { given, readBody, recordRequests, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import {
  address, givenChatStream, openChatStream, renderChat, resetChatLayout, sendMessage, textChunks, textReply, toolChunks,
} from '../support/chat';


afterEach(() => {
  resetChatLayout();
});


// The conversations: the licence one is linked to UAB
// Pavyzdys in its compliance-officer role, the DORA one to
// nothing
const DORA = f.thread(f.ID.doraThread);
const LICENCE = f.thread(f.ID.licenceThread);
const PAVYZDYS = f.company(f.ID.pavyzdys);

// The AML officer — the other role profile of UAB Pavyzdys
const AML = PAVYZDYS.roles.find((role) => role.id === f.ID.amlOfficer);

// The role the licence conversation adopts
const OFFICER = LICENCE.role.name;

// UAB Pavyzdys is the plain user's, so the administrator
// (the default session) is offered it with its owner under
// the name — which is part of the option's accessible name
const PAVYZDYS_OPTION = `UAB Pavyzdys Owner: ${PAVYZDYS.ownerName}`;

// Where the panel's open state is remembered (lg and up)
const PANEL_KEY = 'chat.companyPanel';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// panel: the panel's complementary landmark ("Company").
// companyButton: the header's toggle. openPanel: the toggle
// clicked, the panel found. facts: the profile's definition
// list as [term, value] pairs. threadRow: GET /api/chat/
// threads/:id answering whatever `row.current` is when asked
// — the row a test changes while a turn runs. companyField /
// roleField: the link editor's pickers; choose: a picker
// opened, an option clicked; openLinking: a conversation from
// lg with the panel open (a column — the header stays
// reachable beside it); patchesOf: the paths and bodies of
// spied PATCHes.
// -----------------------------------------------------------

const panel = () => screen.getByRole('complementary', { name: 'Company' });

const companyButton = () => within(screen.getByRole('main')).getByRole('button', { name: /^Company/ });

const openPanel = async (user) => {
  await user.click(companyButton());
  return screen.findByRole('complementary', { name: 'Company' });
};

const facts = (root) => {
  const terms = [...root.querySelectorAll('dt')];
  return terms.map((term) => [term.textContent, term.nextElementSibling.textContent]);
};

const threadRow = (initial) => {
  const row = { current: initial };
  server.use(http.get(url('/api/chat/threads/:threadId'), ({ params }) => HttpResponse.json({ ...row.current, id: params.threadId })));
  return row;
};

// A turn whose reply the test writes, the conversation open
// from lg — the panel a column that stays open while the
// user writes (a drawer would take the page)
const turnIn = async (route, options = {}) => {
  const turn = openChatStream();
  const view = renderChat({ route, layout: 'panel', ...options });
  return { ...view, turn };
};

const companyField = (name = 'Linked company') => within(panel()).getByRole('combobox', { name });

const roleField = (name = 'Conversation role') => within(panel()).getByRole('combobox', { name });

const choose = async (user, field, option) => {
  await user.click(field);
  await user.click(await screen.findByRole('option', { name: option }));
};

const openLinking = async (route, options = {}) => {
  const lt = options.locale === 'lt';
  localStorage.setItem(PANEL_KEY, 'open');
  const view = renderChat({ route, layout: 'panel', ...options });
  const aside = await screen.findByRole('complementary', { name: lt ? 'Įmonė' : 'Company' });
  await waitFor(() => expect(within(aside).getByRole('combobox', { name: lt ? 'Susieta įmonė' : 'Linked company' })).toBeEnabled());
  return view;
};

const patchesOf = (calls) => calls.map((call) => [new URL(call.url).pathname, call.body]);

// The assistant links the conversation, then says so
const linkingReply = (messageId) => [
  { type: 'start', messageId }, { type: 'start-step' },
  ...toolChunks({ toolName: 'setThreadCompany', input: { companyId: f.ID.pavyzdys }, output: { companyId: f.ID.pavyzdys } }),
  { type: 'finish-step' }, { type: 'start-step' }, ...textChunks('Susiejau.'), { type: 'finish-step' },
  { type: 'finish', finishReason: 'stop' },
];







// -----------------------------------------------------------
// The toggle and the layouts
// -----------------------------------------------------------

describe('the panel\'s toggle and layouts', () => {

  it('below lg the header\'s button opens the panel as a drawer and says so; the panel\'s close button closes it', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const button = companyButton();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'chat-company-panel');
    expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull();

    const aside = await openPanel(user);
    expect(aside).toHaveAttribute('id', 'chat-company-panel');
    expect(within(aside).getByRole('heading', { level: 2, name: 'Company' })).toBeInTheDocument();
    await user.click(within(aside).getByRole('button', { name: 'Close the company card' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull());
    expect(companyButton()).toHaveAttribute('aria-expanded', 'false');
  });


  it('Escape closes the drawer', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await openPanel(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull());
  });


  it('from lg it is a column beside the conversation, marked open on its button, and the choice is remembered', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}`, layout: 'panel' });
    expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull();
    await openPanel(user);
    expect(companyButton()).toHaveAttribute('aria-expanded', 'true');
    // A column: the rest of the page stays reachable (no modal)
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('presentation')).toBeNull();
    expect(localStorage.getItem(PANEL_KEY)).toBe('open');

    await user.click(within(panel()).getByRole('button', { name: 'Close the company card' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull());
    expect(localStorage.getItem(PANEL_KEY)).toBe('closed');
  });


  it('from lg it opens by itself when it was left open', async () => {
    localStorage.setItem(PANEL_KEY, 'open');
    renderChat({ route: `/chat/${f.ID.licenceThread}`, layout: 'panel' });
    expect(await screen.findByRole('complementary', { name: 'Company' })).toBeInTheDocument();
    expect(companyButton()).toHaveAttribute('aria-expanded', 'true');
  });


  it('below lg the drawer starts closed even when the column was left open, and a drawer choice is not remembered', async () => {
    localStorage.setItem(PANEL_KEY, 'closed');
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull();
    await openPanel(user);
    expect(localStorage.getItem(PANEL_KEY)).toBe('closed');
  });
});







// -----------------------------------------------------------
// What the panel shows
// -----------------------------------------------------------
//
// The linked company, the conversation without one, empty
// sections, loading and failure.
// -----------------------------------------------------------

describe('what the panel shows', () => {

  it('the linked company: its name, the conversation\'s role, the profile facts and a link to its page', async () => {
    const companies = given.capture('get', '/api/companies/:companyId', PAVYZDYS);
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    expect(await within(aside).findByText('UAB Pavyzdys')).toBeInTheDocument();
    expect(companies.map((call) => new URL(call.url).pathname)).toContain(`/api/companies/${f.ID.pavyzdys}`);
    expect(within(aside).getByText('Conversation role: Atitikties pareigūnas')).toBeInTheDocument();
    expect(facts(aside)).toEqual([
      ['Type', 'Crypto-asset service provider'],
      ['Legal form', 'UAB'],
      ['Country', 'LT'],
      ['Size', 'Small · employees: 24'],
      ['NACE', '66.19, 62.01'],
      ['Uses AI', 'Yes'],
      ['Provides AI', 'No'],
      ['Processes personal data', 'Yes'],
    ]);
    const link = within(aside).getByRole('link', { name: 'Open the company page' });
    expect(link).toHaveAttribute('href', `/companies/${f.ID.pavyzdys}`);
    await user.click(link);
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/companies/${f.ID.pavyzdys}`);
  });


  it('the credentials: claimed or verified in words, with kind, issuer and number', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    const section = (await within(aside).findByRole('heading', { level: 3, name: 'Licences and certificates' })).closest('section');
    const items = within(section).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Kriptoturto paslaugų teikėjo leidimasVerifiedLicence · Lietuvos bankas · KTPT-2026-017',
      'ISO/IEC 27001 sertifikatasClaimedCertificate · UAB Sertifikavimo centras · ISMS-2025-0042',
    ]);
  });


  it('the documents: their extraction state, kind and size (grouped the English way)', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    const section = (await within(aside).findByRole('heading', { level: 3, name: 'Documents' })).closest('section');
    const items = within(section).getAllByRole('listitem').map((item) => item.textContent);
    const policy = PAVYZDYS.documents.find((doc) => doc.id === f.ID.policyDoc);
    expect(items).toContain(`Atitikties politikaText extractedPolicy · ${policy.charCount.toLocaleString('en-GB')} chars`);
    expect(items).toContain('IT paslaugų užsakomųjų paslaugų sutartisPendingContract');
    expect(items).toHaveLength(PAVYZDYS.documents.length);
  });


  it('the role profiles, the conversation\'s own one marked', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    const section = (await within(aside).findByRole('heading', { level: 3, name: 'Roles' })).closest('section');
    expect(within(section).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'AML pareigūnas', 'Atitikties pareigūnasThis conversation\'s role',
    ]);
  });


  it('unknown facts read "Unknown", never "No"; an unknown size and no NACE read as such', async () => {
    given.json('get', '/api/companies/:companyId', {
      ...PAVYZDYS, usesAi: null, providesAi: null, processesPersonalData: false, sizeCategory: 'unknown', employees: null,
      naceCodes: [], legalForm: null, institutionType: 'unknown',
    });
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    await within(aside).findByText('UAB Pavyzdys');
    expect(facts(aside)).toEqual([
      ['Type', 'Not determined'], ['Legal form', '—'], ['Country', 'LT'], ['Size', 'Not determined'], ['NACE', '—'],
      ['Uses AI', 'Unknown'], ['Provides AI', 'Unknown'], ['Processes personal data', 'No'],
    ]);
  });


  it('a company with nothing recorded yet says so in each section', async () => {
    given.json('get', '/api/companies/:companyId', { ...PAVYZDYS, credentials: [], documents: [], roles: [] });
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    expect(await within(aside).findByText('None recorded.')).toBeInTheDocument();
    expect(within(aside).getByText('No documents.')).toBeInTheDocument();
    expect(within(aside).getByText('No role profiles.')).toBeInTheDocument();
  });


  it('a conversation without a company says so, and what to do about it — and fetches no company', async () => {
    const companies = given.capture('get', '/api/companies/:companyId', PAVYZDYS);
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    const aside = await openPanel(user);
    expect(await within(aside).findByText('This conversation is not linked to a company yet.')).toBeInTheDocument();
    expect(within(aside).getByText('Pick one of your companies above, or describe the company — the assistant creates its profile and links it to this conversation.')).toBeInTheDocument();
    await settle(100);
    expect(companies).toHaveLength(0);
  });


  it('a new conversation has no company yet — and nothing is fetched for it', async () => {
    const rows = given.capture('get', '/api/chat/threads/:threadId', LICENCE);
    const { user } = renderChat();
    const aside = await openPanel(user);
    expect(within(aside).getByText('This conversation is not linked to a company yet.')).toBeInTheDocument();
    await settle(100);
    expect(rows).toHaveLength(0);
  });


  it('shows a busy spinner while the company loads', async () => {
    given.hang('get', '/api/companies/:companyId');
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    expect(await within(aside).findByRole('status', { name: 'Loading the company…' })).toBeInTheDocument();
    expect(within(aside).queryByRole('alert')).toBeNull();
  });


  it('a company that fails to load says what and why, and "Try again" loads it', async () => {
    given.sequence('get', '/api/companies/:companyId', [
      { status: 500, body: { error: 'Internal', code: 'SERVER_ERROR' } },
      { body: PAVYZDYS },
    ]);
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    const alert = await within(aside).findByRole('alert');
    expect(alert).toHaveTextContent('The company could not be loaded.');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(aside).findByText('UAB Pavyzdys')).toBeInTheDocument();
    await waitFor(() => expect(within(aside).queryByRole('alert')).toBeNull());
  });


  it('a thread row that fails to load says so too — never "not linked"', async () => {
    given.apiError('get', '/api/chat/threads/:threadId', 'FORBIDDEN', { status: 403 });
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const aside = await openPanel(user);
    await waitFor(() => expect(within(aside).getByRole('alert')).toHaveTextContent('The company could not be loaded.You are not allowed to do this.'));
    expect(within(aside).queryByText('This conversation is not linked to a company yet.')).toBeNull();
  });


  it('is the same for a plain user', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}`, authData: userAuthData });
    const aside = await openPanel(user);
    expect(await within(aside).findByText('UAB Pavyzdys')).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: 'Open the company page' })).toBeInTheDocument();
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}`, locale: 'lt' });
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Įmonė/ }));
    const aside = await screen.findByRole('complementary', { name: 'Įmonė' });
    expect(await within(aside).findByText('Pokalbio rolė: Atitikties pareigūnas')).toBeInTheDocument();
    expect(facts(aside)).toEqual([
      ['Tipas', 'Kriptoturto paslaugų teikėjas'], ['Teisinė forma', 'UAB'], ['Šalis', 'LT'], ['Dydis', 'Maža · darbuotojai: 24'],
      ['EVRK', '66.19, 62.01'], ['Naudoja DI', 'Taip'], ['Teikia DI', 'Ne'], ['Tvarko asmens duomenis', 'Taip'],
    ]);
    expect(within(aside).getByRole('heading', { level: 3, name: 'Leidimai ir sertifikatai' })).toBeInTheDocument();
    expect(within(aside).getByText('Patikrinta')).toBeInTheDocument();
    expect(within(aside).getByText('Deklaruota')).toBeInTheDocument();
    expect(within(aside).getByText('Šio pokalbio rolė')).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: 'Atidaryti įmonės puslapį' })).toBeInTheDocument();
    expect(within(aside).getByRole('button', { name: 'Uždaryti įmonės kortelę' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The header's company
// -----------------------------------------------------------
//
// The button that opens the panel carries the linked
// company's name (it always read "Company") and the role the
// conversation adopts.
// -----------------------------------------------------------

describe('the header\'s company', () => {

  it('names the linked company and the conversation\'s role on the button — "Company: UAB Pavyzdys, role: Atitikties pareigūnas" to a screen reader', async () => {
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const button = await within(screen.getByRole('main')).findByRole('button', { name: `Company: UAB Pavyzdys, role: ${OFFICER}` });
    expect(button).toHaveTextContent(`UAB Pavyzdys · ${OFFICER}`);
    expect(button).toHaveAttribute('title', `UAB Pavyzdys · ${OFFICER}`);
  });


  it('keeps a phone header usable: the label is cut at its end, the role first, and below sm the role is out of sight — never out of the button\'s name', async () => {
    renderChat({ route: `/chat/${f.ID.licenceThread}`, layout: 'narrow' });
    const button = await within(screen.getByRole('main')).findByRole('button', { name: `Company: UAB Pavyzdys, role: ${OFFICER}` });
    expect(within(button).getByText(`· ${OFFICER}`)).toHaveClass('hidden', 'sm:inline');
    expect(within(button).getByText(`· ${OFFICER}`).parentElement).toHaveClass('truncate');
    expect(within(button).getByText(`· ${OFFICER}`).parentElement).not.toHaveClass('hidden');
    // Half the strip at most — the title keeps the rest
    expect(button).toHaveClass('max-w-[50%]');
  });


  it('a conversation linked without a role names the company alone', async () => {
    given.json('get', '/api/chat/threads/:threadId', { ...LICENCE, roleId: null, role: null });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const button = await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' });
    expect(button).toHaveTextContent(/^UAB Pavyzdys$/);
    expect(button).toHaveAttribute('title', 'UAB Pavyzdys');
  });


  it('a role it cannot read (no name) is left out — by the header and the panel alike (the panel printed "{name}")', async () => {
    given.json('get', '/api/chat/threads/:threadId', { ...LICENCE, role: { id: f.ID.complianceOfficer } });
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' })).toHaveTextContent(/^UAB Pavyzdys$/);
    const aside = await openPanel(user);
    expect(await within(aside).findByRole('heading', { level: 3, name: 'Roles' })).toBeInTheDocument();
    expect(within(aside).queryByText(/^Conversation role:/)).toBeNull();
  });


  it('a role without a company is never shown', async () => {
    given.json('get', '/api/chat/threads/:threadId', { ...DORA, role: LICENCE.role });
    renderChat({ route: `/chat/${f.ID.doraThread}` });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DORA.title));
    await settle(100);
    expect(companyButton()).toHaveAccessibleName('Company');
    expect(companyButton()).toHaveTextContent(/^Company$/);
  });


  it('reads "Company" for a conversation without one, and for a new one', async () => {
    renderChat({ route: `/chat/${f.ID.doraThread}` });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DORA.title));
    await settle(100);
    expect(companyButton()).toHaveAccessibleName('Company');
    expect(companyButton()).toHaveTextContent('Company');
  });


  it('follows the conversation: another conversation, another company — and no role', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await within(screen.getByRole('main')).findByRole('button', { name: `Company: UAB Pavyzdys, role: ${OFFICER}` });
    await user.click(within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('button', { name: DORA.title }));
    await waitFor(() => expect(companyButton()).toHaveAccessibleName('Company'));
    expect(companyButton()).not.toHaveTextContent(OFFICER);
  });


  it('a row that cannot be read leaves the plain "Company"', async () => {
    given.json('get', '/api/chat/threads/:threadId', { ...LICENCE, companyName: { nested: true } });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(/kriptoturto paslaugų teikėjo leidimo/);
    await settle(100);
    expect(companyButton()).toHaveAccessibleName('Company');
  });


  it('speaks Lithuanian', async () => {
    renderChat({ route: `/chat/${f.ID.licenceThread}`, locale: 'lt' });
    const button = await within(screen.getByRole('main')).findByRole('button', { name: `Įmonė: UAB Pavyzdys, rolė: ${OFFICER}` });
    expect(button).toHaveTextContent(`UAB Pavyzdys · ${OFFICER}`);
  });
});







// -----------------------------------------------------------
// Linking and unlinking in the panel
// -----------------------------------------------------------
//
// The link editor on top of the panel: every pick is one
// PATCH /api/chat/threads/:id with exactly the field it
// changes, the answer is what the panel and the header show,
// and a refusal is said in the panel with the saved values
// back in the pickers. The default PATCH handler answers the
// way Django's thread_item does (a company change drops the
// role).
// -----------------------------------------------------------

describe('linking and unlinking in the panel', () => {

  it('shows what the conversation is linked to: the company, its role and the unlink button on top of the panel', async () => {
    await openLinking(`/chat/${f.ID.licenceThread}`);
    expect(within(panel()).getByRole('heading', { level: 3, name: 'This conversation' })).toBeInTheDocument();
    await waitFor(() => expect(companyField()).toHaveValue('UAB Pavyzdys'));
    expect(roleField()).toHaveTextContent('Atitikties pareigūnas');
    expect(within(panel()).getByRole('button', { name: 'Unlink the company' })).toBeInTheDocument();
  });


  it('on a deep link it waits until that conversation is open — a pick before would have gone to a fresh draft', async () => {
    // The row the deep link opens with waits for the test
    let answer = null;
    server.use(http.get(url('/api/chat/threads/:threadId'), () => (answer
      ? HttpResponse.json(LICENCE)
      : new Promise((resolve) => { answer = () => resolve(HttpResponse.json(LICENCE)); }))));
    localStorage.setItem(PANEL_KEY, 'open');
    renderChat({ route: `/chat/${f.ID.licenceThread}`, layout: 'panel' });
    const aside = await screen.findByRole('complementary', { name: 'Company' });
    await waitFor(() => expect(answer).not.toBeNull());
    await settle(100);
    expect(within(aside).queryByRole('combobox', { name: 'Linked company' })).toBeNull();
    await act(async () => { answer(); });
    await waitFor(() => expect(companyField()).toHaveValue('UAB Pavyzdys'));
  });


  it('a conversation without a company: an empty picker, no role and nothing to unlink', async () => {
    await openLinking(`/chat/${f.ID.doraThread}`);
    expect(await within(panel()).findByText('This conversation is not linked to a company yet.')).toBeInTheDocument();
    expect(companyField()).toHaveValue('');
    expect(companyField()).toHaveAttribute('placeholder', 'Choose one of your companies');
    expect(within(panel()).queryByRole('combobox', { name: 'Conversation role' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Unlink the company' })).toBeNull();
  });


  it('offers the user\'s companies from GET /api/companies — somebody else\'s with its owner under the name, the administrator\'s own without — and typing narrows them', async () => {
    const lists = given.capture('get', '/api/companies', { companies: f.companies });
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await user.click(companyField());
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName(PAVYZDYS_OPTION);
    expect(within(options[0]).getByText(`Owner: ${PAVYZDYS.ownerName}`)).toBeInTheDocument();
    // UAB Kreditas is the administrator's own
    expect(options[1]).toHaveAccessibleName('UAB Kreditas');
    expect(options[1]).toHaveTextContent(/^UAB Kreditas$/);
    expect(lists.map((call) => call.query)).toEqual([{}]);
    await user.type(companyField(), 'kred');
    await waitFor(() => expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['UAB Kreditas']));
    expect(companyField()).toHaveValue('kred');
  });


  it('typing the owner\'s name finds that user\'s companies — never by the administrator\'s own name, which no option shows', async () => {
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    // "Jonas Naudotojas" — case and accents aside
    await user.type(companyField(), 'NAUDOTOJ');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getByRole('option')).toHaveAccessibleName(PAVYZDYS_OPTION);
    // "Rūta Administratorė" owns UAB Kreditas
    await user.clear(companyField());
    await user.type(companyField(), 'administratore');
    expect(await screen.findByText('No options')).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
  });


  it('two users\' companies of one name are two options told apart by their owners; the one picked is the one linked, and the field reads its name alone', async () => {
    const twin = { ...f.companies[1], name: 'UAB Pavyzdys', ownerId: f.ID.lina, ownerName: 'Lina Buvusi' };
    given.json('get', '/api/companies', { companies: [f.companies[0], twin] });
    const patches = given.capture('patch', '/api/chat/threads/:threadId', { ...DORA, companyId: twin.id, companyName: twin.name });
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await user.click(companyField());
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      `UAB PavyzdysOwner: ${PAVYZDYS.ownerName}`, 'UAB PavyzdysOwner: Lina Buvusi',
    ]);
    await user.click(screen.getByRole('option', { name: 'UAB Pavyzdys Owner: Lina Buvusi' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ companyId: twin.id });
    await waitFor(() => expect(companyField()).toHaveValue('UAB Pavyzdys'));
  });


  it('a list row without its owner (an older answer, a malformed one) is offered by its name alone — never taken for somebody else\'s', async () => {
    given.json('get', '/api/companies', { companies: [
      { id: f.ID.pavyzdys, name: 'UAB Pavyzdys', ownerName: PAVYZDYS.ownerName },
      { id: f.ID.kreditas, name: 'UAB Kreditas', ownerId: 42, ownerName: { nested: true } },
    ] });
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await user.click(companyField());
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['UAB Pavyzdys', 'UAB Kreditas']);
    await user.type(companyField(), 'jonas');
    expect(await screen.findByText('No options')).toBeInTheDocument();
  });


  it('links a conversation to a company with PATCH {companyId} — nothing else — and the panel and the header follow', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await choose(user, companyField(), PAVYZDYS_OPTION);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { companyId: f.ID.pavyzdys }]]);
    expect(await within(panel()).findByText('UAB Pavyzdys')).toBeInTheDocument();
    expect(within(panel()).queryByText('This conversation is not linked to a company yet.')).toBeNull();
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' })).toBeInTheDocument();
    expect(companyField()).toHaveValue('UAB Pavyzdys');
    // Linked without a role, the company's roles to pick from
    expect(roleField()).toHaveTextContent('No role');
    expect(roleField()).not.toHaveAttribute('aria-disabled', 'true');
  });


  it('a switch to another company sends {companyId} alone; Django drops the old company\'s role and the panel says so', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    await within(panel()).findByText('Conversation role: Atitikties pareigūnas');
    await choose(user, companyField(), 'UAB Kreditas');
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.licenceThread}`, { companyId: f.ID.kreditas }]]);
    expect(await within(panel()).findByText('UAB Kreditas')).toBeInTheDocument();
    expect(within(panel()).queryByText(/^Conversation role: /)).toBeNull();
    // UAB Kreditas has no role profiles: nothing to pick
    expect(roleField()).toHaveTextContent('No role');
    expect(roleField()).toHaveAttribute('aria-disabled', 'true');
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Kreditas' })).toBeInTheDocument();
  });


  it('adopts a role with {roleId} and drops it with {roleId: null}; the caption, the marked role and the header follow', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    await within(panel()).findByText('Conversation role: Atitikties pareigūnas');
    await choose(user, roleField(), AML.name);
    expect(await within(panel()).findByText(`Conversation role: ${AML.name}`)).toBeInTheDocument();
    const roles = within(panel()).getByRole('heading', { level: 3, name: 'Roles' }).closest('section');
    expect(within(roles).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'AML pareigūnasThis conversation\'s role', 'Atitikties pareigūnas',
    ]);
    expect(companyButton()).toHaveAccessibleName(`Company: UAB Pavyzdys, role: ${AML.name}`);
    expect(companyButton()).toHaveTextContent(`UAB Pavyzdys · ${AML.name}`);

    await choose(user, roleField(), 'No role');
    await waitFor(() => expect(within(panel()).queryByText(/^Conversation role: /)).toBeNull());
    expect(roleField()).toHaveTextContent('No role');
    expect(companyButton()).toHaveAccessibleName('Company: UAB Pavyzdys');
    expect(companyButton()).toHaveTextContent(/^UAB Pavyzdys$/);
    expect(patchesOf(patches)).toEqual([
      [`/api/chat/threads/${f.ID.licenceThread}`, { roleId: f.ID.amlOfficer }],
      [`/api/chat/threads/${f.ID.licenceThread}`, { roleId: null }],
    ]);
  });


  it('unlinks with {companyId: null}: back to "not linked", no role, and "Company" in the header', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    await within(panel()).findByText('UAB Pavyzdys');
    await user.click(within(panel()).getByRole('button', { name: 'Unlink the company' }));
    expect(await within(panel()).findByText('This conversation is not linked to a company yet.')).toBeInTheDocument();
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.licenceThread}`, { companyId: null }]]);
    expect(companyField()).toHaveValue('');
    expect(within(panel()).queryByRole('combobox', { name: 'Conversation role' })).toBeNull();
    await waitFor(() => expect(companyButton()).toHaveAccessibleName('Company'));
  });


  it('while a change is saved the pickers show the pick and wait', async () => {
    given.hang('patch', '/api/chat/threads/:threadId');
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    await within(panel()).findByText('UAB Pavyzdys');
    await choose(user, companyField(), 'UAB Kreditas');
    expect(await within(panel()).findByRole('progressbar', { name: 'Saving…' })).toBeInTheDocument();
    expect(companyField()).toHaveValue('UAB Kreditas');
    expect(companyField()).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Unlink the company' })).toBeDisabled();
    // Still the saved link everywhere else
    expect(companyButton()).toHaveAccessibleName(`Company: UAB Pavyzdys, role: ${OFFICER}`);
  });


  it('a company that is not the user\'s (404) is refused in the panel — once, no toast — and the saved link stays', async () => {
    given.apiError('patch', '/api/chat/threads/:threadId', 'NOT_FOUND', { status: 404, error: 'Company not found' });
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    await within(panel()).findByText('UAB Pavyzdys');
    await choose(user, companyField(), 'UAB Kreditas');
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('The change was not saved.This company was not found or is not yours.');
    await waitFor(() => expect(companyField()).toHaveValue('UAB Pavyzdys'));
    expect(roleField()).toHaveTextContent('Atitikties pareigūnas');
    expect(companyButton()).toHaveAccessibleName(`Company: UAB Pavyzdys, role: ${OFFICER}`);
    expect(screen.queryByText('Not found — it may have been deleted.')).toBeNull();
  });


  it('a role of another company (404) is refused with its own sentence, the role as it was', async () => {
    given.apiError('patch', '/api/chat/threads/:threadId', 'NOT_FOUND', { status: 404, error: "Role not found for the thread's company" });
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    await within(panel()).findByText('Conversation role: Atitikties pareigūnas');
    await choose(user, roleField(), AML.name);
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('This role profile does not belong to the conversation\'s company.');
    await waitFor(() => expect(roleField()).toHaveTextContent('Atitikties pareigūnas'));
    expect(within(panel()).getByText('Conversation role: Atitikties pareigūnas')).toBeInTheDocument();
  });


  it('any other failure reads as the chat says it, and the next pick tries again', async () => {
    given.sequence('patch', '/api/chat/threads/:threadId', [
      { status: 500, body: { error: 'Internal', code: 'SERVER_ERROR' } },
      { body: { ...DORA, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' } },
    ]);
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await within(panel()).findByText('This conversation is not linked to a company yet.');
    await choose(user, companyField(), PAVYZDYS_OPTION);
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('The change was not saved.Server error. Try again later.');
    await waitFor(() => expect(companyField()).toHaveValue(''));
    await choose(user, companyField(), PAVYZDYS_OPTION);
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });


  it('a new conversation is created first (POST /api/chat/threads), then linked — and its first question goes to that thread', async () => {
    const creates = given.capture('post', '/api/chat/threads', f.NEW.thread, { status: 201 });
    const row = threadRow(f.NEW.thread);
    const patches = [];
    server.use(http.patch(url('/api/chat/threads/:threadId'), async ({ params, request }) => {
      patches.push([params.threadId, await readBody(request)]);
      row.current = { ...f.NEW.thread, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' };
      return HttpResponse.json({ ...row.current, id: params.threadId });
    }));
    const turns = givenChatStream(textReply('Kalbame apie UAB Pavyzdys.'));
    const { user } = await openLinking('/');
    await choose(user, companyField(), PAVYZDYS_OPTION);
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' })).toBeInTheDocument();
    expect(creates.map((call) => call.body)).toEqual([{}]);
    expect(patches).toEqual([[f.ID.newThread, { companyId: f.ID.pavyzdys }]]);
    await waitFor(() => expect(address()).toBe(`/chat/${f.ID.newThread}`));
    expect(await within(panel()).findByText('UAB Pavyzdys')).toBeInTheDocument();

    await sendMessage(user, 'Kokio leidimo reikia?');
    expect(await screen.findByText('Kalbame apie UAB Pavyzdys.')).toBeInTheDocument();
    expect(turns.map((turn) => turn.body.id)).toEqual([f.ID.newThread]);
    expect(creates).toHaveLength(1);
  });


  it('the next turn goes out after the link is saved — the assistant reads the thread\'s company itself', async () => {
    const seen = recordRequests();
    const turns = givenChatStream(textReply('Dabar žinau įmonę.'));
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await choose(user, companyField(), PAVYZDYS_OPTION);
    await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' });
    await sendMessage(user, 'Kokio leidimo reikia?');
    expect(await screen.findByText('Dabar žinau įmonę.')).toBeInTheDocument();
    expect(turns.map((turn) => turn.body.id)).toEqual([f.ID.doraThread]);
    const order = seen.map((request) => `${request.method} ${request.path}`);
    expect(order.indexOf(`PATCH /api/chat/threads/${f.ID.doraThread}`)).toBeGreaterThan(-1);
    expect(order.indexOf(`PATCH /api/chat/threads/${f.ID.doraThread}`)).toBeLessThan(order.indexOf('POST /api/assistant/chat'));
  });


  it('a companies list that fails says so beside the picker, with a retry; the rest of the panel stands', async () => {
    given.sequence('get', '/api/companies', [
      { status: 500, body: { error: 'Internal', code: 'SERVER_ERROR' } },
      { body: { companies: f.companies } },
    ]);
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`);
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Your companies could not be loaded.');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(panel()).getByText('UAB Pavyzdys')).toBeInTheDocument();
    // The linked company is still shown in the picker
    expect(companyField()).toHaveValue('UAB Pavyzdys');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(panel()).queryByRole('alert')).toBeNull());
    await user.click(companyField());
    expect(await screen.findByRole('option', { name: 'UAB Kreditas' })).toBeInTheDocument();
  });


  it('a user without companies is told how to get one', async () => {
    given.json('get', '/api/companies', { companies: [] });
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`);
    await user.click(companyField());
    expect(await screen.findByText('You have no companies yet — describe one to the assistant.')).toBeInTheDocument();
  });


  it('is the same for a plain user — whose own company names no owner', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`, { authData: userAuthData });
    // UAB Pavyzdys is the plain user's own: its name alone
    await choose(user, companyField(), 'UAB Pavyzdys');
    await waitFor(() => expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { companyId: f.ID.pavyzdys }]]));
    expect(await within(panel()).findByText('UAB Pavyzdys')).toBeInTheDocument();
  });


  it('speaks Lithuanian', async () => {
    given.apiError('patch', '/api/chat/threads/:threadId', 'NOT_FOUND', { status: 404 });
    const { user } = await openLinking(`/chat/${f.ID.licenceThread}`, { locale: 'lt' });
    const aside = screen.getByRole('complementary', { name: 'Įmonė' });
    expect(within(aside).getByRole('heading', { level: 3, name: 'Šis pokalbis' })).toBeInTheDocument();
    await waitFor(() => expect(within(aside).getByRole('combobox', { name: 'Susieta įmonė' })).toHaveValue('UAB Pavyzdys'));
    expect(within(aside).getByRole('combobox', { name: 'Pokalbio rolė' })).toHaveTextContent('Atitikties pareigūnas');
    expect(within(aside).getByRole('button', { name: 'Atsieti įmonę' })).toBeInTheDocument();
    await user.click(within(aside).getByRole('combobox', { name: 'Pokalbio rolė' }));
    expect(await screen.findByRole('option', { name: 'Be rolės' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: AML.name }));
    expect(await within(aside).findByRole('alert')).toHaveTextContent('Pakeitimas neišsaugotas.Ši rolė nepriklauso pokalbio įmonei.');
  });


  it('names the owner of somebody else\'s company in Lithuanian, and finds it by that name', async () => {
    const { user } = await openLinking(`/chat/${f.ID.doraThread}`, { locale: 'lt' });
    const field = within(screen.getByRole('complementary', { name: 'Įmonė' })).getByRole('combobox', { name: 'Susieta įmonė' });
    await user.type(field, 'jonas');
    const option = await screen.findByRole('option', { name: `UAB Pavyzdys Savininkas: ${PAVYZDYS.ownerName}` });
    expect(within(option).getByText(`Savininkas: ${PAVYZDYS.ownerName}`)).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Linking and unlinking (by the assistant)
// -----------------------------------------------------------
//
// The assistant's setThreadCompany / setThreadRole tools
// PATCH the thread themselves; when the turn ends, the row
// and the company are read again.
// -----------------------------------------------------------

describe('linking and unlinking by the assistant', () => {

  it('a turn that links the conversation to a company: the open panel and the header follow when the turn ends', async () => {
    const row = threadRow(DORA);
    const { user, turn } = await turnIn(`/chat/${f.ID.doraThread}`);
    const aside = await openPanel(user);
    expect(await within(aside).findByText('This conversation is not linked to a company yet.')).toBeInTheDocument();

    await sendMessage(user, 'Susiek su UAB Pavyzdys');
    await turn.requested();
    row.current = { ...DORA, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' };
    await turn.write(...linkingReply('srv-link-1'));
    await turn.end();

    expect(await within(aside).findByText('UAB Pavyzdys')).toBeInTheDocument();
    expect(within(aside).queryByText('This conversation is not linked to a company yet.')).toBeNull();
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' })).toBeInTheDocument();
  });


  it('the header follows a new link with the panel closed', async () => {
    const row = threadRow(DORA);
    const { user, turn } = await turnIn(`/chat/${f.ID.doraThread}`);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DORA.title));
    await sendMessage(user, 'Susiek su UAB Pavyzdys');
    await turn.requested();
    row.current = { ...DORA, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' };
    await turn.write(...linkingReply('srv-link-2'));
    await turn.end();
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Company: UAB Pavyzdys' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Company' })).toBeNull();
  });


  it('a new conversation the assistant links in its first turn shows the company once the turn ends', async () => {
    const row = threadRow(f.NEW.thread);
    const { user, turn } = await turnIn('/');
    const aside = await openPanel(user);
    await sendMessage(user, 'Mūsų įmonė — UAB Pavyzdys');
    await turn.requested();
    row.current = { ...f.NEW.thread, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' };
    await turn.write(...linkingReply('srv-link-3'));
    await turn.end();
    expect(await within(aside).findByText('UAB Pavyzdys')).toBeInTheDocument();
  });


  it('a turn that unlinks it: back to "not linked" and "Company"', async () => {
    const row = threadRow(LICENCE);
    const { user, turn } = await turnIn(`/chat/${f.ID.licenceThread}`);
    const aside = await openPanel(user);
    await within(aside).findByText('UAB Pavyzdys');
    await sendMessage(user, 'Atsiek įmonę');
    await turn.requested();
    row.current = { ...LICENCE, companyId: null, companyName: null, roleId: null, role: null };
    await turn.write({ type: 'start', messageId: 'srv-unlink' }, { type: 'start-step' },
      ...toolChunks({ toolName: 'setThreadCompany', input: { companyId: null }, output: { companyId: null } }),
      { type: 'finish-step' }, { type: 'finish', finishReason: 'tool-calls' });
    await turn.end();
    expect(await within(aside).findByText('This conversation is not linked to a company yet.')).toBeInTheDocument();
    await waitFor(() => expect(companyButton()).toHaveAccessibleName('Company'));
  });


  it('a turn that sets the conversation\'s role: the caption, the marked role and the header move', async () => {
    const row = threadRow(LICENCE);
    const { user, turn } = await turnIn(`/chat/${f.ID.licenceThread}`);
    const aside = await openPanel(user);
    expect(await within(aside).findByText('Conversation role: Atitikties pareigūnas')).toBeInTheDocument();
    await sendMessage(user, 'Būk AML pareigūnas');
    await turn.requested();
    const aml = PAVYZDYS.roles.find((role) => role.id === f.ID.amlOfficer);
    row.current = { ...LICENCE, roleId: aml.id, role: aml };
    await turn.write({ type: 'start', messageId: 'srv-role' }, { type: 'start-step' },
      ...toolChunks({ toolName: 'setThreadRole', input: { roleId: aml.id }, output: { roleId: aml.id } }),
      { type: 'finish-step' }, { type: 'start-step' }, ...textChunks('Gerai.'), { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' });
    await turn.end();
    expect(await within(aside).findByText('Conversation role: AML pareigūnas')).toBeInTheDocument();
    const roles = (await within(aside).findByRole('heading', { level: 3, name: 'Roles' })).closest('section');
    expect(within(roles).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'AML pareigūnasThis conversation\'s role', 'Atitikties pareigūnas',
    ]);
    expect(companyButton()).toHaveAccessibleName(`Company: UAB Pavyzdys, role: ${aml.name}`);
  });


  it('a turn that changed the company (a new credential) shows the change when it ends', async () => {
    const answers = { current: PAVYZDYS };
    server.use(http.get(url('/api/companies/:companyId'), () => HttpResponse.json(answers.current)));
    const { user, turn } = await turnIn(`/chat/${f.ID.licenceThread}`);
    const aside = await openPanel(user);
    await within(aside).findByText('UAB Pavyzdys');
    await sendMessage(user, 'Pridėk AML licenciją');
    await turn.requested();
    answers.current = { ...PAVYZDYS, credentials: [...PAVYZDYS.credentials, { ...f.NEW.credential, name: 'AML registracija', kind: 'registration' }] };
    await turn.write({ type: 'start', messageId: 'srv-cred' }, { type: 'start-step' },
      ...toolChunks({ toolName: 'addCredential', input: { name: 'AML registracija' }, output: { ok: true } }),
      { type: 'finish-step' }, { type: 'finish', finishReason: 'tool-calls' });
    await turn.end();
    expect(await within(aside).findByText('AML registracija')).toBeInTheDocument();
  });


  it('nothing is read again while the turn is still running', async () => {
    const rows = given.capture('get', '/api/chat/threads/:threadId', LICENCE);
    const { user, turn } = await turnIn(`/chat/${f.ID.licenceThread}`);
    await openPanel(user);
    await within(panel()).findByText('UAB Pavyzdys');
    const before = rows.length;
    await sendMessage(user, 'Klausimas');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-slow' }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Rašau…' });
    await settle(100);
    expect(rows.length).toBe(before);
    await turn.write({ type: 'text-end', id: 'txt-0' }, { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' });
    await turn.end();
    await waitFor(() => expect(rows.length).toBe(before + 1));
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The company as the open panel reads it (the licence
// conversation, lg, the panel left open), the thread row it
// starts from — which the deep link and the header read as
// well — and the companies the link editor offers (the
// picker opened for the loaded check).
// -----------------------------------------------------------

const openPanelChat = () => {
  localStorage.setItem(PANEL_KEY, 'open');
  return renderChat({ route: `/chat/${f.ID.licenceThread}`, layout: 'panel' });
};

describeEndpointContract({
  path: '/api/companies/:companyId',
  fixture: PAVYZDYS,
  render: openPanelChat,
  chrome: () => panel(),
  loaded: async () => { await within(panel()).findByText('UAB Pavyzdys'); },
  loading: () => within(panel()).getByRole('status', { name: 'Loading the company…' }),
  alert: () => within(panel()).findByRole('alert'),
});


describeEndpointContract({
  path: '/api/chat/threads/:threadId',
  fixture: LICENCE,
  render: openPanelChat,
  chrome: () => panel(),
  loaded: async () => { await within(panel()).findByText('Conversation role: Atitikties pareigūnas'); },
  alert: () => within(panel()).findByRole('alert'),
  skip: {
    '404 NOT_FOUND → alert': 'a gone conversation is no failure: the notice and "/" (chat.test.jsx)',
  },
});


describeEndpointContract({
  path: '/api/companies',
  fixture: { companies: f.companies },
  render: openPanelChat,
  chrome: () => panel(),
  loaded: async () => {
    const user = userEvent.setup();
    const field = await within(panel()).findByRole('combobox', { name: 'Linked company' });
    await waitFor(() => expect(field).toHaveValue('UAB Pavyzdys'));
    await user.click(field);
    expect(await screen.findByRole('option', { name: 'UAB Kreditas' })).toBeInTheDocument();
  },
  alert: () => within(panel()).findByRole('alert'),
});
