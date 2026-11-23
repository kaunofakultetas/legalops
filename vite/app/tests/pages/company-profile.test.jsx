// -----------------------------------------------------------
//  [*] Tests — CompanyProfile (the profile editor tab)
//
//  The profile tab of /companies/:companyId end to end
//  against the backend double, rendered in its page: the
//  five sections and every saved value in its field; every
//  field type edited — the texts (trimmed, an emptied
//  optional one sent as null), the two selects, the numbers
//  (digits only, the caps, an emptied one as null), the NACE
//  chips (Enter adds, Backspace removes, blanks dropped, the
//  20-character cut), the four tri-state flags (null is
//  "unknown" — sent as null, never guessed), the activities
//  and AI texts with their counter and caps; the attributes
//  bag (the readable view, the JSON editor, invalid JSON and
//  "not an object", the size cap, {} for an empty text); the
//  read-only financial-market classification (every key the
//  assistant's tool writes labelled in its order, the flags
//  in words, the citations as a list, an unknown key kept,
//  the empty note); the PUT carrying only the changed fields,
//  the toast, the re-sync from the answer, the busy bar, the
//  refusals (the backend's prose in English, the named field
//  in Lithuanian) and failures; Discard; the unsaved-changes
//  guard (the router blocker with Stay / Leave, the browser's
//  beforeunload, a hand-reverted edit is clean again); a
//  background refetch that replaces a clean form but never a
//  dirty one; Lithuanian.
//
//  The company detail's contract matrix runs on this tab (the
//  page's default) in company-detail.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { http } from 'msw';
import { given, apiError, server, url } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PAVYZDYS = f.company(f.ID.pavyzdys);
const KREDITAS = f.company(f.ID.kreditas);
const MARKET = PAVYZDYS.financialMarket;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderProfile: the company page on the profile tab, with
// the company answered as given; waits for its fields.
//
// section / field / flag: the section by its heading, a
// text field by its label, a tri-state flag's group.
//
// replaceText: clears a field and pastes the new text (paste
// is fast for long texts and does not read "{" as a key).
//
// savePut: captures the PUT, answering what the view would
// (the detail with the body merged, updatedAt at NOW).
//
// saveBar / save: the "unsaved changes" bar and its Save.
// -----------------------------------------------------------

async function renderProfile({ company = PAVYZDYS, locale = 'en' } = {}) {
  if (company !== PAVYZDYS) given.json('get', '/api/companies/:companyId', company);
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${company.id}`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: company.name });
  return view;
}

const section = (name) => screen.getByRole('region', { name });

const field = (name) => screen.getByRole('textbox', { name });

const flag = (name) => screen.getByRole('group', { name });

const pressed = (group) => within(group).getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent);

async function replaceText(user, input, value) {
  await user.clear(input);
  if (value) {
    await user.click(input);
    await user.paste(value);
  }
}

function savePut(answer) {
  const calls = given.capture('put', '/api/companies/:companyId', answer ?? PAVYZDYS);
  return calls;
}

const saveBar = () => screen.queryByRole('region', { name: 'You have unsaved changes' });

async function save(user) {
  await user.click(within(saveBar()).getByRole('button', { name: 'Save the profile' }));
}

// The label/value rows of a definition list, as [dt, dd] texts
const definitions = (list) => within(list).getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling.textContent]);







// -----------------------------------------------------------
// The form
// -----------------------------------------------------------
//
// The sections and every saved value in its field.
// -----------------------------------------------------------

describe('CompanyProfile — the form', () => {

  it('groups the profile in five sections', async () => {
    await renderProfile();
    for (const name of ['Basic data', 'Activities', 'Artificial intelligence and personal data', 'Financial market classification', 'Additional data']) {
      expect(section(name)).toBeInTheDocument();
    }
  });


  it('shows every saved value of the basic data in its field', async () => {
    await renderProfile();
    expect(field('Name')).toHaveValue('UAB Pavyzdys');
    expect(field('Name')).toBeRequired();
    expect(field('Registration code')).toHaveValue('300000001');
    expect(field('Legal form')).toHaveValue('UAB');
    expect(field('Country')).toHaveValue('LT');
    expect(field('Country')).toBeRequired();
    expect(field('Sector')).toHaveValue('Kriptoturto paslaugos');
    expect(screen.getByRole('combobox', { name: 'Financial institution type' })).toHaveTextContent('Crypto-asset service provider');
    expect(screen.getByRole('combobox', { name: 'Size category' })).toHaveTextContent('Small');
    expect(field('Employees')).toHaveValue('24');
    expect(field('Annual turnover, EUR')).toHaveValue('3200000');
    const basic = section('Basic data');
    expect(within(basic).getByText('66.19')).toBeInTheDocument();
    expect(within(basic).getByText('62.01')).toBeInTheDocument();
  });


  it('explains the fields that need it: legal form, country, NACE codes', async () => {
    await renderProfile();
    expect(screen.getByText('E.g. UAB, AB, MB.')).toBeInTheDocument();
    expect(screen.getByText('E.g. LT.')).toBeInTheDocument();
    expect(screen.getByText('NACE Rev. 2 codes, e.g. 64.19 — type and press Enter.')).toBeInTheDocument();
  });


  it('shows the activities with the hint and the character counter', async () => {
    await renderProfile();
    expect(field('Description of activities')).toHaveValue(PAVYZDYS.activities);
    expect(screen.getByText(`What the company does: services, clients, markets. ${PAVYZDYS.activities.length} / 20000 chars`)).toBeInTheDocument();
  });


  it('shows the four flags as yes / no / unknown toggles — null reads as "Unknown", the pressed state announced', async () => {
    await renderProfile();
    expect(pressed(flag('Uses AI systems'))).toEqual(['Yes']);
    expect(pressed(flag('Develops or provides AI systems'))).toEqual(['No']);
    expect(pressed(flag('Processes personal data'))).toEqual(['Yes']);
    expect(pressed(flag('Public-sector body'))).toEqual(['Unknown']);
    expect(screen.getByText('“Unknown” means nobody confirmed it — the analysis then keeps the acts this flag would rule out.')).toBeInTheDocument();
    expect(field('Description of AI use')).toHaveValue(PAVYZDYS.aiDescription);
  });


  it('a sparse profile: empty fields, the "Not determined" selects, every unknown flag as "Unknown"', async () => {
    await renderProfile({ company: KREDITAS });
    expect(field('Sector')).toHaveValue('');
    expect(field('Employees')).toHaveValue('');
    expect(field('Annual turnover, EUR')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Size category' })).toHaveTextContent('Not determined');
    expect(screen.getByRole('combobox', { name: 'Financial institution type' })).toHaveTextContent('Consumer credit provider');
    expect(pressed(flag('Uses AI systems'))).toEqual(['Unknown']);
    expect(pressed(flag('Develops or provides AI systems'))).toEqual(['Unknown']);
    expect(pressed(flag('Public-sector body'))).toEqual(['No']);
  });


  it('shows no "unsaved changes" bar while nothing changed', async () => {
    await renderProfile();
    expect(saveBar()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save the profile' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Editing — the PUT carries only what changed
// -----------------------------------------------------------
//
// Every field type, one at a time, against the captured PUT.
// -----------------------------------------------------------

describe('CompanyProfile — editing and the PUT', () => {

  it('a changed text shows the bar; Save sends a PUT with ONLY that field, trimmed; then the toast and the bar goes', async () => {
    const puts = savePut({ ...PAVYZDYS, sector: 'Kriptoturto ir IT paslaugos' });
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), '  Kriptoturto ir IT paslaugos ');
    expect(saveBar()).toBeInTheDocument();
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}`));
    expect(puts[0].body).toEqual({ sector: 'Kriptoturto ir IT paslaugos' });
    expect(await screen.findByText('Profile saved')).toBeInTheDocument();
    await waitFor(() => expect(saveBar()).toBeNull());
    expect(field('Sector')).toHaveValue('Kriptoturto ir IT paslaugos');
  });


  it('several changes travel together, the untouched fields stay out', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Name'), 'UAB Pavyzdys ir partneriai');
    await replaceText(user, field('Legal form'), 'AB');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ name: 'UAB Pavyzdys ir partneriai', legalForm: 'AB' });
  });


  it('an emptied optional text is sent as null', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.clear(field('Registration code'));
    await user.clear(field('Legal form'));
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ registrationCode: null, legalForm: null });
  });


  it('an edit reverted by hand is no change: the bar goes again (the form is diffed, not "touched")', async () => {
    const { user } = await renderProfile();
    await user.type(field('Sector'), 'X');
    expect(saveBar()).toBeInTheDocument();
    await user.type(field('Sector'), '{Backspace}');
    expect(saveBar()).toBeNull();
  });


  it('surrounding spaces alone are no change either', async () => {
    const { user } = await renderProfile();
    await user.type(field('Name'), '   ');
    expect(saveBar()).toBeNull();
  });


  it('the institution type and the size category are picked from their translated lists and sent as their values', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(screen.getByRole('combobox', { name: 'Financial institution type' }));
    await user.click(await screen.findByRole('option', { name: 'Electronic money institution' }));
    await user.click(screen.getByRole('combobox', { name: 'Size category' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent))
      .toEqual(['Not determined', 'Micro', 'Small', 'Medium', 'Large']);
    await user.click(screen.getByRole('option', { name: 'Medium' }));
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ institutionType: 'emi', sizeCategory: 'medium' });
  });


  it('the numbers take digits only (anything else is dropped as typed) and are sent as numbers', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.clear(field('Employees'));
    await user.type(field('Employees'), '3a0 -');
    expect(field('Employees')).toHaveValue('30');
    await user.clear(field('Annual turnover, EUR'));
    await user.type(field('Annual turnover, EUR'), '4,500,000');
    expect(field('Annual turnover, EUR')).toHaveValue('4500000');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ employees: 30, annualTurnoverEur: 4500000 });
  });


  it('an emptied number is sent as null ("unknown"), not as 0', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.clear(field('Employees'));
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ employees: null });
  });


  it('0 is a number like any other', async () => {
    const puts = savePut();
    const { user } = await renderProfile({ company: KREDITAS });
    await user.type(field('Employees'), '0');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ employees: 0 });
  });


  it('refuses more than 10 000 000 employees and a turnover over 10¹⁴ with the rule, and sends nothing', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Employees'), '10000001');
    await replaceText(user, field('Annual turnover, EUR'), '100000000000001');
    await save(user);
    expect(await screen.findByText('Enter a whole number from 0 to 10,000,000')).toBeInTheDocument();
    expect(screen.getByText('Enter a whole number from 0 to 10¹⁴')).toBeInTheDocument();
    expect(field('Employees')).toHaveAttribute('aria-invalid', 'true');
    await settle(100);
    expect(puts).toHaveLength(0);
  });


  it('the limits themselves are allowed', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Employees'), '10000000');
    await replaceText(user, field('Annual turnover, EUR'), '100000000000000');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ employees: 10000000, annualTurnoverEur: 100000000000000 });
  });


  it('a NACE code typed and confirmed with Enter becomes a chip and joins the list in the PUT', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.type(screen.getByRole('combobox', { name: 'NACE codes' }), '64.19{Enter}');
    expect(within(section('Basic data')).getByText('64.19')).toBeInTheDocument();
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ naceCodes: ['66.19', '62.01', '64.19'] });
  });


  it('Backspace in the empty NACE input removes the last chip', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(screen.getByRole('combobox', { name: 'NACE codes' }));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(within(section('Basic data')).queryByText('62.01')).toBeNull());
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ naceCodes: ['66.19'] });
  });


  it('a NACE code is trimmed and cut to 20 characters; a blank one is dropped', async () => {
    const puts = savePut();
    const { user } = await renderProfile({ company: KREDITAS });
    const nace = screen.getByRole('combobox', { name: 'NACE codes' });
    await user.type(nace, '   {Enter}');
    await user.type(nace, '  ABCDEFGHIJKLMNOPQRSTUVWXYZ {Enter}');
    expect(within(section('Basic data')).getByText('ABCDEFGHIJKLMNOPQRST')).toBeInTheDocument();
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ naceCodes: ['64.92', 'ABCDEFGHIJKLMNOPQRST'] });
  });


  it('a flag goes from "Unknown" to "Yes" as true, and from "Yes" to "Unknown" as null — never as false', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(within(flag('Public-sector body')).getByRole('button', { name: 'Yes' }));
    expect(pressed(flag('Public-sector body'))).toEqual(['Yes']);
    await user.click(within(flag('Uses AI systems')).getByRole('button', { name: 'Unknown' }));
    expect(pressed(flag('Uses AI systems'))).toEqual(['Unknown']);
    await user.click(within(flag('Develops or provides AI systems')).getByRole('button', { name: 'Yes' }));
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ isPublicSector: true, usesAi: null, providesAi: true });
  });


  it('"No" is sent as false', async () => {
    const puts = savePut();
    const { user } = await renderProfile({ company: KREDITAS });
    await user.click(within(flag('Uses AI systems')).getByRole('button', { name: 'No' }));
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ usesAi: false });
  });


  it('clicking the pressed button again keeps the value — nothing becomes unset', async () => {
    const { user } = await renderProfile();
    await user.click(within(flag('Uses AI systems')).getByRole('button', { name: 'Yes' }));
    expect(pressed(flag('Uses AI systems'))).toEqual(['Yes']);
    await user.click(within(flag('Public-sector body')).getByRole('button', { name: 'Unknown' }));
    expect(pressed(flag('Public-sector body'))).toEqual(['Unknown']);
    expect(saveBar()).toBeNull();
  });


  it('the activities and the AI description are sent as typed (not trimmed — they are prose), the counter follows', async () => {
    const puts = savePut();
    const { user } = await renderProfile({ company: KREDITAS });
    const activities = 'Vartojimo kreditai internetu.\nKlientai — gyventojai.';
    await replaceText(user, field('Description of activities'), activities);
    expect(screen.getByText(`What the company does: services, clients, markets. ${activities.length} / 20000 chars`)).toBeInTheDocument();
    await replaceText(user, field('Description of AI use'), 'Kreditingumo vertinimo modelis. ');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ activities: 'Vartojimo kreditai internetu.\nKlientai — gyventojai.', aiDescription: 'Kreditingumo vertinimo modelis. ' });
  });


  it('an emptied name or country is refused as required, before any request', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.clear(field('Name'));
    await user.clear(field('Country'));
    // No message before the first save attempt
    expect(screen.queryByText('Required')).toBeNull();
    await save(user);
    expect(await screen.findAllByText('Required')).toHaveLength(2);
    expect(field('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Country')).toHaveAttribute('aria-invalid', 'true');
    // The country's error takes its hint's place
    expect(screen.queryByText('E.g. LT.')).toBeNull();
    await settle(100);
    expect(puts).toHaveLength(0);
  });


  it('short texts are capped at 500 characters, the activities at 20 000, the AI description at 10 000', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 's'.repeat(501));
    await replaceText(user, field('Description of activities'), 'a'.repeat(20_001));
    await replaceText(user, field('Description of AI use'), 'd'.repeat(10_001));
    await save(user);
    expect(await screen.findByText('Too long (at most 500 characters)')).toBeInTheDocument();
    expect(screen.getByText('Too long (at most 20000 characters)')).toBeInTheDocument();
    expect(screen.getByText('Too long (at most 10000 characters)')).toBeInTheDocument();
    await settle(100);
    expect(puts).toHaveLength(0);
  });


  it('fixing a refused field clears its message at once (the rules re-run as you type)', async () => {
    const { user } = await renderProfile();
    await user.clear(field('Name'));
    await save(user);
    await screen.findByText('Required');
    await user.type(field('Name'), 'UAB Pavyzdys 2');
    expect(screen.queryByText('Required')).toBeNull();
  });
});







// -----------------------------------------------------------
// The attributes bag
// -----------------------------------------------------------
//
// The readable view, the JSON editor, its three refusals.
// -----------------------------------------------------------

describe('CompanyProfile — the attributes JSON', () => {

  it('reads as a list: humanised keys, chips for lists of words, nested objects indented, true as "Yes"', async () => {
    await renderProfile();
    const attributes = section('Additional data');
    expect(within(attributes).getByText('Free-form data the assistant collects in the chat. Must be a JSON object.')).toBeInTheDocument();
    expect(within(attributes).getByText('Client types')).toBeInTheDocument();
    expect(within(attributes).getByText('mažmeniniai')).toBeInTheDocument();
    expect(within(attributes).getByText('profesionalieji')).toBeInTheDocument();
    expect(within(attributes).getByText('Countries')).toBeInTheDocument();
    expect(within(attributes).getByText('EE')).toBeInTheDocument();
    expect(within(attributes).getByText('Travel rule')).toBeInTheDocument();
    expect(within(attributes).getByText('Yes')).toBeInTheDocument();
    expect(within(attributes).getByText('Pervedimai tarp kriptoturto paslaugų teikėjų')).toBeInTheDocument();
    expect(within(attributes).queryByRole('textbox')).toBeNull();
  });


  it('no attributes → "No additional data."', async () => {
    await renderProfile({ company: KREDITAS });
    expect(within(section('Additional data')).getByText('No additional data.')).toBeInTheDocument();
  });


  it('"Edit JSON" opens the pretty-printed JSON, "View" closes it', async () => {
    const { user } = await renderProfile();
    const attributes = section('Additional data');
    await user.click(within(attributes).getByRole('button', { name: 'Edit JSON' }));
    expect(within(attributes).getByRole('textbox', { name: 'Additional data' })).toHaveValue(JSON.stringify(PAVYZDYS.attributes, null, 2));
    await user.click(within(attributes).getByRole('button', { name: 'View' }));
    expect(within(attributes).queryByRole('textbox')).toBeNull();
    expect(within(attributes).getByText('Client types')).toBeInTheDocument();
  });


  it('a changed object is sent parsed, as an object', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(within(section('Additional data')).getByRole('button', { name: 'Edit JSON' }));
    await replaceText(user, field('Additional data'), '{"clientTypes": ["mažmeniniai"], "website": "https://pavyzdys.example"}');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ attributes: { clientTypes: ['mažmeniniai'], website: 'https://pavyzdys.example' } });
  });


  it('re-formatting the JSON is no change', async () => {
    const { user } = await renderProfile();
    await user.click(within(section('Additional data')).getByRole('button', { name: 'Edit JSON' }));
    await replaceText(user, field('Additional data'), JSON.stringify(PAVYZDYS.attributes));
    expect(saveBar()).toBeNull();
  });


  it('an emptied JSON text means an empty object', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(within(section('Additional data')).getByRole('button', { name: 'Edit JSON' }));
    await user.clear(field('Additional data'));
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ attributes: {} });
  });


  it('invalid JSON is refused with the parser\'s reason, nothing is sent, and the editor stays open even on "View"', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    const attributes = section('Additional data');
    await user.click(within(attributes).getByRole('button', { name: 'Edit JSON' }));
    await replaceText(user, field('Additional data'), '{"clientTypes": [}');
    await save(user);
    expect(await within(attributes).findByText(/^Invalid JSON: /)).toBeInTheDocument();
    expect(field('Additional data')).toHaveAttribute('aria-invalid', 'true');
    await user.click(within(attributes).getByRole('button', { name: 'View' }));
    // The broken text is not hidden behind the view
    expect(field('Additional data')).toHaveValue('{"clientTypes": [}');
    await settle(100);
    expect(puts).toHaveLength(0);
  });


  it('JSON that is not an object — a list, a string, null — is refused as "Must be a JSON object {…}"', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(within(section('Additional data')).getByRole('button', { name: 'Edit JSON' }));
    for (const text of ['["mažmeniniai"]', '"tekstas"', 'null']) {
      await replaceText(user, field('Additional data'), text);
      await save(user);
      expect(await screen.findByText('Must be a JSON object {…}')).toBeInTheDocument();
    }
    await settle(100);
    expect(puts).toHaveLength(0);
  });


  it('an object over 60 000 characters is refused as too long', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await user.click(within(section('Additional data')).getByRole('button', { name: 'Edit JSON' }));
    await replaceText(user, field('Additional data'), JSON.stringify({ notes: 'n'.repeat(60_000) }));
    await save(user);
    expect(await screen.findByText('Too long (at most 60000 characters)')).toBeInTheDocument();
    await settle(100);
    expect(puts).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// The financial-market classification
// -----------------------------------------------------------
//
// Read-only, written by the assistant's updateCompany tool:
// every key it writes labelled, in its order, in words.
// -----------------------------------------------------------

describe('CompanyProfile — the financial market classification', () => {

  it('labels every key the assistant writes, in the tool\'s order, and says it is read-only', async () => {
    await renderProfile();
    const market = section('Financial market classification');
    expect(within(market).getByText('Set by the assistant in the chat; read-only here.')).toBeInTheDocument();
    expect(within(market).getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Markets', 'Service category', 'Institutes of financial law', 'Licence required', 'Licence / authorisation needed',
      'Issuing / supervising authority', 'Legal basis', 'Cross-cutting regimes', 'Reasoning', 'Citations', 'Citations verified',
    ]);
    // Nothing is editable here
    expect(within(market).queryByRole('textbox')).toBeNull();
    expect(within(market).queryByRole('button')).toBeNull();
  });


  it('shows the values: lists of words as chips, texts as written, the licence flag and the verified flag in words', async () => {
    await renderProfile();
    const rows = Object.fromEntries(definitions(section('Financial market classification')));
    expect(rows).toMatchObject({
      Markets: 'Kriptoturto rinka',
      'Service category': MARKET.serviceCategory,
      'Institutes of financial law': MARKET.institutes.join(''),
      'Licence required': 'Yes',
      'Licence / authorisation needed': 'Kriptoturto paslaugų teikėjo leidimas',
      'Issuing / supervising authority': 'Lietuvos bankas',
      'Legal basis': 'MiCA 59 str. 1 d.',
      'Cross-cutting regimes': 'DORAPPTFPĮBDAR',
      Reasoning: MARKET.reasoning,
      'Citations verified': 'Yes — every citation was found in the legal corpus',
    });
  });


  it('shows the citations as a list, one item per citation', async () => {
    await renderProfile();
    const market = section('Financial market classification');
    const citations = within(market).getByRole('list');
    expect(within(citations).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['MiCA 59 str. 1 d.', 'MiCA 75 str.']);
  });


  it('never falls back to raw or humanised key names for the keys the tool writes', async () => {
    await renderProfile();
    const market = section('Financial market classification');
    for (const raw of ['serviceCategory', 'Service Category', 'Authorisation', 'Authority', 'Cross cutting regimes', 'Verified', 'license', 'Licence / authorisation']) {
      expect(within(market).queryByText(raw)).toBeNull();
    }
  });


  it('"No" for a licence not required; an unverified classification says so', async () => {
    await renderProfile({ company: { ...PAVYZDYS, financialMarket: { ...MARKET, licenseRequired: false, verified: false } } });
    const rows = Object.fromEntries(definitions(section('Financial market classification')));
    expect(rows['Licence required']).toBe('No');
    expect(rows['Citations verified']).toBe('No — not every citation was checked against the legal corpus');
  });


  it('a null licence flag reads "Unknown", and a verified flag that is not true is not a verification', async () => {
    await renderProfile({ company: { ...PAVYZDYS, financialMarket: { markets: ['Mokėjimų rinka'], licenseRequired: null, verified: 'true' } } });
    const rows = Object.fromEntries(definitions(section('Financial market classification')));
    expect(rows).toEqual({
      Markets: 'Mokėjimų rinka',
      'Licence required': 'Unknown',
      'Citations verified': 'No — not every citation was checked against the legal corpus',
    });
  });


  it('shows only the keys the classification has — an early one without citations lists no "Citations"', async () => {
    await renderProfile({ company: { ...PAVYZDYS, financialMarket: { markets: ['Kriptoturto rinka'], reasoning: 'Preliminarus vertinimas.' } } });
    const market = section('Financial market classification');
    expect(within(market).getAllByRole('term').map((term) => term.textContent)).toEqual(['Markets', 'Reasoning']);
    expect(within(market).queryByRole('list')).toBeNull();
  });


  it('a key a later version of the tool adds is not lost: it follows, humanised', async () => {
    await renderProfile({ company: { ...PAVYZDYS, financialMarket: { ...MARKET, passportingCountries: ['LV', 'EE'] } } });
    const market = section('Financial market classification');
    expect(within(market).getByText('Passporting countries')).toBeInTheDocument();
    expect(within(market).getByText('LV')).toBeInTheDocument();
    expect(within(market).getAllByRole('term').at(-1)).toHaveTextContent('Passporting countries');
  });


  it('no classification yet → the note that the assistant sets it in the chat, without the read-only subtitle', async () => {
    await renderProfile({ company: KREDITAS });
    const market = section('Financial market classification');
    expect(within(market).getByText('No classification yet — the assistant sets it in the chat.')).toBeInTheDocument();
    expect(within(market).queryByText('Set by the assistant in the chat; read-only here.')).toBeNull();
    expect(within(market).queryByRole('term')).toBeNull();
  });


  it('an empty object is no classification either', async () => {
    await renderProfile({ company: { ...PAVYZDYS, financialMarket: {} } });
    expect(within(section('Financial market classification')).getByText('No classification yet — the assistant sets it in the chat.')).toBeInTheDocument();
  });


  it('is never part of the PUT — the editor does not send what it does not edit', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).not.toHaveProperty('financialMarket');
  });


  it('speaks Lithuanian: the labels, the flags and the verification in words', async () => {
    await renderProfile({ locale: 'lt' });
    const market = section('Finansų rinkos klasifikacija');
    expect(within(market).getByText('Nustato asistentas pokalbyje; čia tik peržiūra.')).toBeInTheDocument();
    expect(definitions(market).map(([term]) => term)).toEqual([
      'Rinkos', 'Paslaugų kategorija', 'Taikomi finansų teisės institutai', 'Reikalinga licencija', 'Reikalinga licencija / leidimas',
      'Išduodanti / prižiūrinti institucija', 'Teisinis pagrindas', 'Horizontalieji teisiniai režimai', 'Pagrindimas',
      'Nuorodos į teisės aktus', 'Nuorodos patikrintos',
    ]);
    const rows = Object.fromEntries(definitions(market));
    expect(rows['Reikalinga licencija']).toBe('Taip');
    expect(rows['Nuorodos patikrintos']).toBe('Taip — visos nuorodos rastos teisės aktų bazėje');
  });
});







// -----------------------------------------------------------
// Saving
// -----------------------------------------------------------
//
// After the PUT: the re-sync, the frame following, the busy
// bar; refusals and failures inline.
// -----------------------------------------------------------

describe('CompanyProfile — saving', () => {

  it('the form re-syncs from the answer: what the server stored is what the fields show', async () => {
    // The server has the last word (here it stored the country as
    // the code — the page sends a two-letter code upper-cased too)
    const puts = savePut({ ...PAVYZDYS, country: 'LV', updatedAt: f.NOW });
    const { user } = await renderProfile();
    await replaceText(user, field('Country'), 'lv');
    await save(user);
    await screen.findByText('Profile saved');
    await waitFor(() => expect(field('Country')).toHaveValue('LV'));
    expect(saveBar()).toBeNull();
    expect(puts[0].body.country).toBe('LV');
  });


  it('the page frame follows the saved company: a new name heads the page, the update stamp moves', async () => {
    savePut({ ...PAVYZDYS, name: 'UAB Pavyzdys ir partneriai', updatedAt: f.NOW });
    const { user } = await renderProfile();
    await replaceText(user, field('Name'), 'UAB Pavyzdys ir partneriai');
    await save(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'UAB Pavyzdys ir partneriai' })).toBeInTheDocument();
    expect(screen.getByText('Crypto-asset service provider · Owner: Jonas Naudotojas · Updated 27/09/2026, 10:00')).toBeInTheDocument();
  });


  it('while the PUT is on the wire the bar is busy: Save loading, Discard disabled, a second click sends nothing', async () => {
    // A PUT that is recorded and never answered
    const puts = [];
    server.use(http.put(url('/api/companies/:companyId'), async ({ request }) => {
      puts.push(await request.json());
      return new Promise(() => {});
    }));
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    await save(user);
    const saveButton = within(saveBar()).getByRole('button', { name: /Save the profile/ });
    await waitFor(() => expect(saveButton).toBeDisabled());
    expect(within(saveBar()).getByRole('button', { name: 'Discard changes' })).toBeDisabled();
    await user.click(saveButton);
    await settle(100);
    expect(puts).toEqual([{ sector: 'Kriptoturtas' }]);
  });


  it('a refusal shows the backend\'s own words in the English UI (a validation code) as an alert; the edit stays', async () => {
    given.apiError('put', '/api/companies/:companyId', 'INVALID_FIELD', { status: 400, error: 'employees must be a whole number from 0 to 10000000' });
    const { user } = await renderProfile();
    await replaceText(user, field('Employees'), '25');
    await save(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('employees must be a whole number from 0 to 10000000');
    // Silent request: no toast repeats it
    expect(screen.getAllByText('employees must be a whole number from 0 to 10000000')).toHaveLength(1);
    expect(field('Employees')).toHaveValue('25');
    expect(saveBar()).toBeInTheDocument();
  });


  it('in Lithuanian the same refusal names the field by its label, never the English prose', async () => {
    given.apiError('put', '/api/companies/:companyId', 'INVALID_FIELD', { status: 400, error: 'employees must be a whole number from 0 to 10000000' });
    const { user } = await renderProfile({ locale: 'lt' });
    await replaceText(user, field('Darbuotojų skaičius'), '25');
    await user.click(within(screen.getByRole('region', { name: 'Yra neišsaugotų pakeitimų' })).getByRole('button', { name: 'Išsaugoti profilį' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Neteisinga lauko „Darbuotojų skaičius“ reikšmė.');
    expect(alert).not.toHaveTextContent('employees must');
  });


  it('a server failure is said in words; saving again after it succeeds and clears the alert', async () => {
    given.sequence('put', '/api/companies/:companyId', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { ...PAVYZDYS, sector: 'Kriptoturtas' } },
    ]);
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    await save(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await save(user);
    expect(await screen.findByText('Profile saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it('a dropped connection is said in words', async () => {
    given.networkError('put', '/api/companies/:companyId');
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    await save(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });
});







// -----------------------------------------------------------
// Discard and the unsaved-changes guard
// -----------------------------------------------------------
//
// Discard; the router blocker (Stay / Leave); the browser's
// beforeunload prompt.
// -----------------------------------------------------------

describe('CompanyProfile — discard and the unsaved-changes guard', () => {

  const backLink = () => within(screen.getByRole('main')).getByRole('link', { name: 'Companies' });

  const beforeUnloadPrevented = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };


  it('Discard puts every field back and the bar goes', async () => {
    const { user } = await renderProfile();
    await replaceText(user, field('Name'), 'Kitas pavadinimas');
    await replaceText(user, field('Employees'), '99');
    await user.click(within(flag('Public-sector body')).getByRole('button', { name: 'No' }));
    await user.click(within(saveBar()).getByRole('button', { name: 'Discard changes' }));
    expect(field('Name')).toHaveValue('UAB Pavyzdys');
    expect(field('Employees')).toHaveValue('24');
    expect(pressed(flag('Public-sector body'))).toEqual(['Unknown']);
    expect(saveBar()).toBeNull();
  });


  it('Discard also drops the validation messages and a failed save\'s alert', async () => {
    given.apiError('put', '/api/companies/:companyId', 'SERVER_ERROR', { status: 500 });
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    await save(user);
    await screen.findByRole('alert');
    await user.clear(field('Name'));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    await user.click(within(saveBar()).getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Required')).toBeNull();
  });


  it('leaving the page with unsaved edits asks first: "Stay" keeps the edits on the page', async () => {
    const { user } = await renderProfile();
    await replaceText(user, field('Name'), 'Nebaigtas pavadinimas');
    await user.click(backLink());
    const dialog = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
    expect(within(dialog).getByText('You have unsaved changes. Leave this page anyway?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByTestId('navigated-away')).toBeNull();
    expect(field('Name')).toHaveValue('Nebaigtas pavadinimas');
  });


  it('"Leave without saving" goes where the user was going', async () => {
    const puts = savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Name'), 'Nebaigtas pavadinimas');
    await user.click(backLink());
    const dialog = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(screen.getByTestId('navigated-away')).toHaveTextContent('/companies'));
    expect(puts).toHaveLength(0);
  });


  it('a clean form leaves without asking, and so does a saved one', async () => {
    savePut();
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    await save(user);
    await screen.findByText('Profile saved');
    await user.click(backLink());
    await waitFor(() => expect(screen.getByTestId('navigated-away')).toHaveTextContent('/companies'));
    expect(screen.queryByRole('alertdialog', { name: 'Unsaved changes' })).toBeNull();
  });


  it('asks the browser to confirm a reload or a closed tab only while there are unsaved edits', async () => {
    savePut();
    const { user } = await renderProfile();
    expect(beforeUnloadPrevented()).toBe(false);
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    expect(beforeUnloadPrevented()).toBe(true);
    await save(user);
    await screen.findByText('Profile saved');
    await waitFor(() => expect(beforeUnloadPrevented()).toBe(false));
  });


  it('discarding lifts the browser prompt too', async () => {
    const { user } = await renderProfile();
    await replaceText(user, field('Sector'), 'Kriptoturtas');
    expect(beforeUnloadPrevented()).toBe(true);
    await user.click(within(saveBar()).getByRole('button', { name: 'Discard changes' }));
    expect(beforeUnloadPrevented()).toBe(false);
  });
});







// -----------------------------------------------------------
// A refetch while the tab is open
// -----------------------------------------------------------
//
// The assistant may edit the profile in the chat meanwhile:
// a clean form takes the new company, a dirty one keeps the
// user's edits until they are saved or discarded.
// -----------------------------------------------------------

describe('CompanyProfile — a refetch while the tab is open', () => {

  const refetched = { ...PAVYZDYS, sector: 'Kriptoturto ir mokėjimų paslaugos', employees: 30, updatedAt: f.NOW };

  // The refetch has landed once the frame shows its stamp
  const refetch = async (queryClient) => {
    await act(async () => { queryClient.setQueryData(['company', f.ID.pavyzdys], refetched); });
    await screen.findByText(/Updated 27\/09\/2026, 10:00$/);
  };


  it('a clean form takes the refetched company', async () => {
    const { queryClient } = await renderProfile();
    await refetch(queryClient);
    expect(field('Sector')).toHaveValue('Kriptoturto ir mokėjimų paslaugos');
    expect(field('Employees')).toHaveValue('30');
    expect(saveBar()).toBeNull();
  });


  it('a dirty form keeps the user\'s edits — and their PUT carries only their change', async () => {
    const puts = savePut();
    const { user, queryClient } = await renderProfile();
    await replaceText(user, field('Name'), 'UAB Pavyzdys ir partneriai');
    await refetch(queryClient);
    expect(field('Name')).toHaveValue('UAB Pavyzdys ir partneriai');
    expect(field('Sector')).toHaveValue('Kriptoturto paslaugos');
    await save(user);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ name: 'UAB Pavyzdys ir partneriai' });
  });


  it('after Discard the form shows the refetched company', async () => {
    const { user, queryClient } = await renderProfile();
    await replaceText(user, field('Name'), 'UAB Pavyzdys ir partneriai');
    await refetch(queryClient);
    await user.click(within(saveBar()).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(field('Sector')).toHaveValue('Kriptoturto ir mokėjimų paslaugos'));
    expect(field('Name')).toHaveValue('UAB Pavyzdys');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('CompanyProfile — Lithuanian', () => {

  it('speaks Lithuanian: the sections, the labels, the hints, the flags, the rules, the bar and the toast', async () => {
    savePut();
    const { user } = await renderProfile({ locale: 'lt' });
    for (const name of ['Pagrindiniai duomenys', 'Veikla', 'Dirbtinis intelektas ir asmens duomenys', 'Finansų rinkos klasifikacija', 'Papildomi duomenys']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(field('Pavadinimas')).toHaveValue('UAB Pavyzdys');
    expect(screen.getByRole('combobox', { name: 'Finansų įstaigos tipas' })).toHaveTextContent('Kriptoturto paslaugų teikėjas');
    expect(screen.getByRole('combobox', { name: 'Dydžio kategorija' })).toHaveTextContent('Maža');
    expect(screen.getByRole('combobox', { name: 'EVRK kodai' })).toBeInTheDocument();
    expect(screen.getByText('Pvz., UAB, AB, MB, VšĮ.')).toBeInTheDocument();
    expect(pressed(flag('Naudoja DI sistemas'))).toEqual(['Taip']);
    expect(pressed(flag('Viešojo sektoriaus subjektas'))).toEqual(['Nežinoma']);
    expect(within(screen.getByRole('region', { name: 'Papildomi duomenys' })).getByRole('button', { name: 'Redaguoti JSON' })).toBeInTheDocument();

    await user.clear(field('Pavadinimas'));
    await replaceText(user, field('Darbuotojų skaičius'), '10000001');
    const bar = screen.getByRole('region', { name: 'Yra neišsaugotų pakeitimų' });
    expect(within(bar).getByRole('button', { name: 'Atmesti pakeitimus' })).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Išsaugoti profilį' }));
    expect(await screen.findByText('Privalomas laukas')).toBeInTheDocument();
    // The limit grouped the Lithuanian way, whatever the browser's language
    expect(screen.getByText(/^Įveskite sveikąjį skaičių nuo 0 iki 10\s000\s000$/)).toBeInTheDocument();

    await replaceText(user, field('Pavadinimas'), 'UAB Pavyzdys');
    await replaceText(user, field('Darbuotojų skaičius'), '25');
    await user.click(within(screen.getByRole('region', { name: 'Yra neišsaugotų pakeitimų' })).getByRole('button', { name: 'Išsaugoti profilį' }));
    expect(await screen.findByText('Profilis išsaugotas')).toBeInTheDocument();
  });


  it('the unsaved-changes dialog in Lithuanian', async () => {
    const { user } = await renderProfile({ locale: 'lt' });
    await replaceText(user, field('Sektorius'), 'Kriptoturtas');
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Įmonės' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Neišsaugoti pakeitimai' });
    expect(within(dialog).getByRole('button', { name: 'Likti' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Išeiti neišsaugojus' })).toBeInTheDocument();
  });
});
