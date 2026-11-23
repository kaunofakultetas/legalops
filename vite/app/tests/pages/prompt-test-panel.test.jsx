// -----------------------------------------------------------
//  [*] Tests — PromptTestPanel (one model run of a prompt)
//
//  The editor's "Test" tab end to end against the backend
//  double, rendered inside the real PromptEditor so the draft
//  it runs is the editor's own: what to test (the draft or a
//  saved version), the input and the declared variables, the
//  cost note (a status, not an alert), the request body for
//  "test the draft" ({input, text, model, temperature,
//  maxTokens, variables}) against "test a saved version"
//  ({input, versionNo, variables}), an invalid draft blocking
//  a draft run only, the result (a text or a structured
//  object, the model, the tokens, cost, duration, finish
//  reason and the final instructions), the failures a run
//  meets (BUDGET_EXCEEDED, MODEL_ERROR, AI_BUDGET_EXHAUSTED,
//  a missing version, the backend's validation prose, a
//  dropped connection, a 401), coming back (the form and the
//  last answer kept per prompt through a tab switch and a
//  new visit, a kept source the prompt lost read as the
//  draft) and both locales.
//
//  The panel reads no endpoint of its own — its data is the
//  editor's prompt, whose contract matrix lives in
//  prompt-editor.test.jsx.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderPage, authData } from '../support/render';
import { given } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import PromptEditor from '@/pages/Prompts/PromptEditor';


// The chat prompt: v2 (temperature 0.2, max 4000) is active
const chat = f.promptDetail('chat.assistant');
const v2 = chat.versions.find((v) => v.version === 2);

const TEST_URL = '/api/prompts/chat.assistant/test';

// What the double answers for a run of the chat prompt's
// draft: a text, 1,840 + 412 tokens at gpt-5.5's price
const CHAT_RUN = f.promptTest('chat.assistant', { text: v2.text });

const COST_NOTE = 'The test calls the AI model — the cost counts against your daily budget.';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderPanel opens the editor straight on ?tab=test. The
// panel's fields are found inside the tab panel by their
// labels; the editor's own fields (the draft) on the left.
// -----------------------------------------------------------

const renderPanel = ({ slug = 'chat.assistant', locale } = {}) =>
  renderPage(<PromptEditor authData={authData} />, { route: `/prompts/${slug}?tab=test`, path: '/prompts/:slug', locale });

const ready = (name = 'Chat assistant') => screen.findByRole('heading', { level: 1, name });

const panel = () => screen.getByRole('tabpanel');
const sourceSelect = () => within(panel()).getByRole('combobox', { name: /^What to test/ });
const inputField = () => within(panel()).getByRole('textbox', { name: /^Input data/ });
const variableField = (name) => within(panel()).getByRole('textbox', { name: `{${name}}` });
const runButton = () => within(panel()).getByRole('button', { name: 'Run the test' });
const statusNotes = () => within(panel()).queryAllByRole('status').map((node) => node.textContent);

// The editor's draft fields (the left column)
const temperatureField = () => screen.getByRole('textbox', { name: 'Temperature' });
const maxTokensField = () => screen.getByRole('textbox', { name: 'Maximum answer length (tokens)' });
const textField = () => screen.getByRole('textbox', { name: /^Prompt text/ });

// The result section: its heading and the lines under it
const resultSection = async (heading = 'Answer') => (await within(panel()).findByRole('heading', { level: 3, name: heading })).closest('section');

async function chooseSource(user, option) {
  await user.click(sourceSelect());
  await user.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

// Types an input and runs
async function run(user, input = 'UAB Pavyzdys teikia kriptoturto paslaugas.') {
  await user.type(inputField(), input);
  await user.click(runButton());
}







// -----------------------------------------------------------
// The form
// -----------------------------------------------------------

describe('PromptTestPanel — the form', () => {

  it('tests the editor\'s draft by default, or any saved version', async () => {
    const { user } = renderPanel();
    await ready();
    expect(sourceSelect()).toHaveTextContent('The editor\'s draft');
    await user.click(sourceSelect());
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['The editor\'s draft', 'Saved v3', 'Saved v2', 'Saved v1']);
  });


  it('asks for the input data, with a hint, and a field per declared variable — {TODAY} says it defaults to today', async () => {
    renderPanel();
    await ready();
    expect(inputField()).toBeRequired();
    expect(inputField()).toHaveAccessibleDescription('What the model receives as data (e.g. a company description or a document excerpt).');
    expect(within(panel()).getByText('Variables')).toBeInTheDocument();
    for (const name of chat.variables) expect(variableField(name)).toHaveValue('');
    expect(variableField('TODAY')).toHaveAccessibleDescription('Empty — today\'s date');
    expect(variableField('WEEKDAY')).not.toHaveAccessibleDescription();
  });


  it('says a run costs money — as a status, not an alert', async () => {
    renderPanel();
    await ready();
    expect(statusNotes()).toContain(COST_NOTE);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a prompt without variables has no variables section', async () => {
    renderPanel({ slug: 'corpus.check_citations' });
    await ready('Citation check');
    expect(within(panel()).queryByText('Variables')).toBeNull();
    expect(inputField()).toBeInTheDocument();
  });


  it('refuses to run without input data — blank or only whitespace — and sends nothing', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await user.click(runButton());
    expect(inputField()).toHaveAccessibleDescription('Enter the input data');
    expect(inputField()).toHaveAttribute('aria-invalid', 'true');
    await user.type(inputField(), '   ');
    await user.click(runButton());
    await settle(50);
    expect(calls).toHaveLength(0);
    await user.type(inputField(), 'x');
    expect(inputField()).not.toHaveAttribute('aria-invalid', 'true');
  });
});







// -----------------------------------------------------------
// The request
// -----------------------------------------------------------

describe('PromptTestPanel — the request', () => {

  it('runs the draft: the input, the draft\'s text, model and settings — and no variables when none are filled', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await run(user, 'Pirma eilutė{Enter}Antra eilutė ');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      input: 'Pirma eilutė\nAntra eilutė ',
      text: v2.text,
      model: 'gateway:azure/gpt-5.5',
      temperature: 0.2,
      maxTokens: 4000,
    });
  });


  it('runs the draft as edited in the editor: the new text, a comma temperature as a number, empty settings left out', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    fireEvent.change(textField(), { target: { value: 'Naujas juodraštis {TODAY}' } });
    await user.clear(temperatureField());
    await user.type(temperatureField(), '1,5');
    await user.clear(maxTokensField());
    await run(user);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ input: 'UAB Pavyzdys teikia kriptoturto paslaugas.', text: 'Naujas juodraštis {TODAY}', model: 'gateway:azure/gpt-5.5', temperature: 1.5 });
  });


  it('sends only the variables that were filled in', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await user.type(variableField('TODAY'), '2026-10-01');
    await user.type(variableField('LEADING_LANGUAGE'), 'lietuvių');
    await user.type(variableField('WEEKDAY'), '   ');
    await run(user);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.variables).toEqual({ TODAY: '2026-10-01', LEADING_LANGUAGE: 'lietuvių' });
  });


  it('runs a saved version by its number alone — no text, model or settings from the draft', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await chooseSource(user, 'Saved v3');
    await user.type(variableField('TODAY'), '2026-10-01');
    await run(user);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ input: 'UAB Pavyzdys teikia kriptoturto paslaugas.', versionNo: 3, variables: { TODAY: '2026-10-01' } });
  });


  it('Enter in a variable field runs the test', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await user.type(inputField(), 'Duomenys');
    await user.type(variableField('WEEKDAY'), 'pirmadienis{Enter}');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.variables).toEqual({ WEEKDAY: 'pirmadienis' });
  });


  it('an invalid draft blocks a draft run with a status note of its errors; a saved version still runs', async () => {
    const calls = given.capture('post', TEST_URL, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await user.clear(temperatureField());
    await user.type(temperatureField(), '5');
    await user.clear(maxTokensField());
    await user.type(maxTokensField(), '0');
    // No note before the panel's own attempt
    expect(statusNotes()).toEqual([COST_NOTE]);
    await run(user);
    await waitFor(() => expect(statusNotes()).toContain('Enter a number from 0 to 2 Enter a whole number from 1 to 128,000'));
    expect(screen.queryByRole('alert')).toBeNull();
    await settle(50);
    expect(calls).toHaveLength(0);

    await chooseSource(user, 'Saved v2');
    expect(statusNotes()).toEqual([COST_NOTE]);
    await user.click(runButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.versionNo).toBe(2);
  });
});







// -----------------------------------------------------------
// The result
// -----------------------------------------------------------

describe('PromptTestPanel — the result', () => {

  it('shows the answer text with the model, tokens, cost, duration, finish reason and the final instructions', async () => {
    const { user } = renderPanel();
    await ready();
    await user.type(variableField('LEADING_LANGUAGE'), 'lietuvių');
    await run(user);
    const section = await resultSection('Answer');
    expect(within(section).getByText('Sveiki! Esu atitikties asistentas. Kuo galiu padėti?')).toBeInTheDocument();
    expect(section).toHaveTextContent('Model: gateway:azure/gpt-5.5');
    expect(section).toHaveTextContent('Tokens: input 1,840, output 412, reasoning 0');
    expect(section).toHaveTextContent('Cost: $0.0216 · duration 6.2 s · finish reason: stop');
    // The instructions fold away under a summary; TODAY filled
    const summaryLine = within(section).getByText('Final instructions (with variables)');
    const details = summaryLine.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('Today is {WEEKDAY}, 2026-09-27.');
  });


  it('a pipeline prompt answers a structured object, shown as pretty JSON', async () => {
    const { user } = renderPanel({ slug: 'report.summary' });
    await ready('Executive summary');
    await run(user);
    const section = await resultSection('Structured answer (JSON)');
    const expected = JSON.stringify(f.promptTest('report.summary').object, null, 2);
    expect(within(section).getByText((_, node) => node.tagName === 'PRE' && node.textContent === expected)).toBeInTheDocument();
    expect(section).toHaveTextContent('Model: gateway:azure/gpt-5.5');
  });


  it('reads missing numbers as "—" and missing usage as zeros', async () => {
    given.json('post', TEST_URL, { ...CHAT_RUN, costUsd: null, finishReason: null, durationMs: null, usage: null, renderedInstructions: null });
    const { user } = renderPanel();
    await ready();
    await run(user);
    const section = await resultSection('Answer');
    expect(section).toHaveTextContent('Tokens: input 0, output 0, reasoning 0');
    expect(section).toHaveTextContent('Cost: — · duration — · finish reason: —');
    expect(within(section).queryByText('Final instructions (with variables)')).toBeNull();
  });


  it('a second run replaces the result', async () => {
    given.sequence('post', TEST_URL, [{ body: CHAT_RUN }, { body: { ...CHAT_RUN, text: 'Antras atsakymas' } }]);
    const { user } = renderPanel();
    await ready();
    await run(user);
    await resultSection('Answer');
    await user.click(runButton());
    expect(await within(panel()).findByText('Antras atsakymas')).toBeInTheDocument();
    expect(within(panel()).queryByText('Sveiki! Esu atitikties asistentas. Kuo galiu padėti?')).toBeNull();
  });


  it('is busy while the run is on the wire', async () => {
    given.slow('post', TEST_URL, 300, CHAT_RUN);
    const { user } = renderPanel();
    await ready();
    await run(user);
    await waitFor(() => expect(runButton()).toBeDisabled());
    await resultSection('Answer');
    expect(runButton()).toBeEnabled();
  });
});







// -----------------------------------------------------------
// Failures
// -----------------------------------------------------------
//
// A run's refusal is shown in the panel as an alert with the
// translated sentence — never toasted (the request is
// silent), never the backend's prose outside the English
// validation codes.
// -----------------------------------------------------------

describe('PromptTestPanel — failures', () => {

  const FAILURES = [
    ['429 BUDGET_EXCEEDED', 'BUDGET_EXCEEDED', 429, 'Today\'s AI usage budget is spent — try again tomorrow', 'Today\'s AI usage budget is spent. Try again tomorrow.'],
    ['502 MODEL_ERROR', 'MODEL_ERROR', 502, 'The model call failed: upstream timeout', 'The AI model call failed. Try again.'],
    ['402 AI_BUDGET_EXHAUSTED', 'AI_BUDGET_EXHAUSTED', 402, 'Budget exhausted', 'The AI service budget is used up — try again later or contact your administrator.'],
    ['404 NOT_FOUND (a version gone)', 'NOT_FOUND', 404, 'Version not found', 'Not found — it may have been deleted.'],
    ['400 INVALID_FIELD (the backend\'s English prose)', 'INVALID_FIELD', 400, 'input must be text of at most 200000 characters', 'input must be text of at most 200000 characters'],
  ];

  for (const [what, code, status, prose, sentence] of FAILURES) {
    it(`${what} → "${sentence}" in the panel, not toasted`, async () => {
      const toastError = vi.spyOn(toast, 'error');
      given.apiError('post', TEST_URL, code, { status, error: prose });
      const { user } = renderPanel();
      await ready();
      await run(user);
      const alert = await within(panel()).findByRole('alert');
      expect(alert).toHaveTextContent(sentence);
      if (prose !== sentence) expect(alert).not.toHaveTextContent(prose);
      expect(within(panel()).queryByRole('heading', { level: 3 })).toBeNull();
      expect(runButton()).toBeEnabled();
      expect(toastError).not.toHaveBeenCalled();
    });
  }


  it('a dropped connection shows the network sentence', async () => {
    given.networkError('post', TEST_URL);
    const { user } = renderPanel();
    await ready();
    await run(user);
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });


  it('a 401 sends the user to sign in again, back to this tab afterwards', async () => {
    given.unauthorized('post', TEST_URL);
    localStorage.setItem('complianceToken', 'test-token');
    const { user } = renderPanel();
    await ready();
    await run(user);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fprompts%2Fchat.assistant%3Ftab%3Dtest&expired=1']));
    expect(localStorage.getItem('complianceToken')).toBeNull();
  });


  it('the next successful run replaces the failure with the result', async () => {
    given.sequence('post', TEST_URL, [{ status: 502, body: { error: 'The model call failed', code: 'MODEL_ERROR' } }, { body: CHAT_RUN }]);
    const { user } = renderPanel();
    await ready();
    await run(user);
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('The AI model call failed. Try again.');
    await user.click(runButton());
    await resultSection('Answer');
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The form and the last answer are kept per prompt: a switch
// to another tab (which unmounts the panel) or leaving the
// editor loses neither the typed input nor the paid answer.
// -----------------------------------------------------------

describe('PromptTestPanel — coming back', () => {

  it('a tab switch and back keeps the source, the input, the variables and the answer — without a second run', async () => {
    const runs = given.capture('post', '/api/prompts/:slug/test', f.promptTest('chat.assistant'));
    const { user } = renderPanel();
    await ready();
    await chooseSource(user, 'Saved v1');
    await user.type(variableField('LEADING_LANGUAGE'), 'lietuvių');
    await run(user);
    await resultSection('Answer');
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    await user.click(screen.getByRole('tab', { name: 'Test' }));

    expect(sourceSelect()).toHaveTextContent('Saved v1');
    expect(inputField()).toHaveValue('UAB Pavyzdys teikia kriptoturto paslaugas.');
    expect(variableField('LEADING_LANGUAGE')).toHaveValue('lietuvių');
    expect(within(await resultSection('Answer')).getByText('Sveiki! Esu atitikties asistentas. Kuo galiu padėti?')).toBeInTheDocument();
    expect(runs).toHaveLength(1);
  });


  it('leaving the editor and coming back finds them too; another prompt keeps its own', async () => {
    const first = renderPanel();
    await ready();
    await first.user.type(inputField(), 'Kas yra MiCA?');
    first.unmount();

    const second = renderPanel();
    await ready();
    expect(inputField()).toHaveValue('Kas yra MiCA?');
    second.unmount();

    renderPanel({ slug: 'report.summary' });
    await ready('Executive summary');
    expect(inputField()).toHaveValue('');
  });


  it('a kept source the prompt no longer has reads as the draft', async () => {
    sessionStorage.setItem('view.prompt.chat.assistant.test', JSON.stringify({ source: '42', input: 'x', variables: {} }));
    renderPanel();
    await ready();
    expect(sourceSelect()).toHaveTextContent("The editor's draft");
    expect(inputField()).toHaveValue('x');
  });


  it('in Lithuanian too', async () => {
    const first = renderPanel({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    await first.user.type(within(panel()).getByRole('textbox', { name: /^Įvesties duomenys/ }), 'Klausimas');
    first.unmount();
    renderPanel({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    expect(within(panel()).getByRole('textbox', { name: /^Įvesties duomenys/ })).toHaveValue('Klausimas');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('PromptTestPanel — Lithuanian', () => {

  it('speaks Lithuanian: the form, the cost note, the result lines and the stamp formats', async () => {
    const { user } = renderPanel({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    expect(screen.getByRole('tab', { name: 'Bandymas' })).toHaveAttribute('aria-selected', 'true');
    const source = within(panel()).getByRole('combobox', { name: /^Kas bandoma/ });
    expect(source).toHaveTextContent('Juodraštis iš redaktoriaus');
    const input = within(panel()).getByRole('textbox', { name: /^Įvesties duomenys/ });
    expect(input).toHaveAccessibleDescription('Tai, ką modelis gaus kaip duomenis (pvz., įmonės aprašymas ar dokumento ištrauka).');
    expect(within(panel()).getByText('Kintamieji')).toBeInTheDocument();
    expect(within(panel()).getByRole('textbox', { name: '{TODAY}' })).toHaveAccessibleDescription('Tuščia — šiandienos data');
    expect(statusNotes()).toContain('Bandymas kviečia DI modelį — sąnaudos skaičiuojamos į jūsų dienos biudžetą.');

    await user.click(within(panel()).getByRole('button', { name: 'Paleisti bandymą' }));
    expect(input).toHaveAccessibleDescription('Įveskite įvesties duomenis');

    await user.type(input, 'Duomenys');
    await user.click(within(panel()).getByRole('button', { name: 'Paleisti bandymą' }));
    const section = (await within(panel()).findByRole('heading', { level: 3, name: 'Atsakymas' })).closest('section');
    expect(section).toHaveTextContent('Modelis: gateway:azure/gpt-5.5');
    expect(section).toHaveTextContent('Žetonai: įvestis 1 840, išvestis 412, samprotavimas 0');
    expect(section).toHaveTextContent('Kaina: 0,0216 USD · trukmė 6,2 s · pabaigos priežastis: stop');
    expect(within(section).getByText('Galutinės instrukcijos (su kintamaisiais)')).toBeInTheDocument();
  });


  it('a refusal speaks Lithuanian, never the backend\'s English prose', async () => {
    given.apiError('post', TEST_URL, 'BUDGET_EXCEEDED', { status: 429, error: 'Today\'s AI usage budget is spent — try again tomorrow' });
    const { user } = renderPanel({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    await user.type(within(panel()).getByRole('textbox', { name: /^Įvesties duomenys/ }), 'Duomenys');
    await user.click(within(panel()).getByRole('button', { name: 'Paleisti bandymą' }));
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Šiandienos DI naudojimo limitas išnaudotas. Bandykite rytoj.');
    expect(alert).not.toHaveTextContent('budget is spent');
  });
});
