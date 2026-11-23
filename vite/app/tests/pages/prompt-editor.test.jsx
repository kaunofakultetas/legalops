// -----------------------------------------------------------
//  [*] Tests — PromptEditor page (editor, versions, diff)
//
//  The /prompts/:slug page end to end against the backend
//  double, on the chat prompt whose administrator's v2 is
//  active while the shipped default v3 waits:
//
//    - the frame: title, back link, subtitle, description,
//      the tab bar with its ARIA wiring and ?tab=, the
//      loading and failed states, a malformed answer, a
//      prompt without an active version, a failed refetch
//      that must keep the editor, and a slug change that
//      must start a fresh editor
//    - the waiting default: a status (not an alert) with
//      "compare" and "activate", a failed activation
//    - the form: the base version, the placeholder chips
//      inserting at the caret, the unknown-placeholder note,
//      the model picker fed by GET /api/llm/models (its
//      failure and retry), the numeric inputs, validation
//    - saving a new version (the POST body with and without
//      "activate", trimming and omissions, the toast, the
//      refetch, refusals and failures)
//    - the unsaved-changes guard (the router door, the
//      browser's beforeunload, free tab switches)
//    - the version history (activate with confirmation,
//      load into the editor, compare)
//    - the diff (two versions or the draft, the added and
//      removed lines, the stats, the settings changes)
//    - coming back: the diff's sides in the address (kept
//      through a tab switch, an unknown side read as the
//      default), the back link a real Back to the list
//
//  Both locales, and the backend contract matrix for GET
//  /api/prompts/{slug} and GET /api/llm/models. The test
//  panel has its own file (prompt-test-panel.test.jsx), the
//  pure draft helpers theirs (prompt-draft.test.js).
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { renderPage, authData, ListProbe, renderRoutes } from '../support/render';
import { given, apiError } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import PromptEditor from '@/pages/Prompts/PromptEditor';


// The chat prompt: v2 (the administrator's, temperature 0.2,
// max 4000, a note) is active, the shipped v3 waits; v1 is
// the first shipped default
const chat = f.promptDetail('chat.assistant');
const [v3, v2, v1] = chat.versions;
const summary = f.promptDetail('report.summary');

const VERSIONS_URL = '/api/prompts/chat.assistant/versions';
const DETAIL_URL = '/api/prompts/chat.assistant';

// The v2 text with its first line edited
const EDITED = v2.text.replace('Keep answers short', 'Keep answers brief');

// What POST …/versions answers for a saved draft: v4
const savedV4 = (changes = {}) => ({ ...f.NEW.promptVersion, text: EDITED, temperature: 0.2, maxTokens: 4000, ...changes });

// The detail after a save: v4 on top, active when `active`
const detailWithV4 = (version, active = false) => ({
  ...chat,
  ...(active ? { activeVersion: 4, activeModel: version.model, pendingDefault: null } : {}),
  versions: [version, ...chat.versions],
});







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderEditor puts the page on its real route pattern, so
// useParams reads the slug and a navigation away lands on the
// router's probe. The fields are found by their labels, as a
// user finds them; the MUI selects and the autocomplete are
// comboboxes whose name starts with the label.
// -----------------------------------------------------------

const renderEditor = ({ slug = 'chat.assistant', search = '', locale } = {}) =>
  renderPage(<PromptEditor authData={authData} />, { route: `/prompts/${slug}${search}`, path: '/prompts/:slug', locale });

const ready = (name = 'Chat assistant') => screen.findByRole('heading', { level: 1, name });

const main = () => screen.getByRole('main');
const textField = () => screen.getByRole('textbox', { name: /^Prompt text/ });
const modelField = () => screen.getByRole('combobox', { name: /^Model/ });
const baseSelect = () => screen.getByRole('combobox', { name: /^Based on/ });
const temperatureField = () => screen.getByRole('textbox', { name: 'Temperature' });
const maxTokensField = () => screen.getByRole('textbox', { name: 'Maximum answer length (tokens)' });
const noteField = () => screen.getByRole('textbox', { name: 'Change note' });
const activateBox = () => screen.getByRole('checkbox', { name: 'Activate right away' });
const saveButton = () => within(main()).getByRole('button', { name: /^(Save as a new version|No changes)$/ });
const backLink = () => within(main()).getByRole('link', { name: 'AI prompts' });
const panel = () => screen.getByRole('tabpanel');
const subtitle = () => screen.getByRole('heading', { level: 1 }).nextElementSibling;

// The waiting-default notice (a status region inside main)
const pendingNotice = () => within(main()).queryAllByRole('status').find((node) => /New default version v3 waiting/.test(node.textContent)) ?? null;

// One version's card in the history tab, by its number
const versionCard = (n) => within(panel()).getByRole('heading', { level: 3, name: `v${n}` }).closest('li');

// The options of the open listbox, as the user reads them
const optionTexts = async () => (await screen.findAllByRole('option')).map((option) => option.textContent);

// The diff table as [old no., new no., sign, text] per row
const diffRows = () => within(within(panel()).getByRole('table')).getAllByRole('row')
  .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));

// Replaces the text field's value in one go (typing 60,000
// characters key by key would take minutes)
const setText = (value) => fireEvent.change(textField(), { target: { value } });

// Makes the draft dirty with a small typed edit
async function editText(user, suffix = ' Be concise.') {
  await user.type(textField(), suffix);
  await waitFor(() => expect(saveButton()).toHaveTextContent('Save as a new version'));
}

// Picks an option from a MUI select by the select's label
async function choose(user, select, option) {
  await user.click(select);
  await user.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

// A cancelable beforeunload, dispatched; answers whether the
// page asked the browser to confirm
const unloadPrevented = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};







// -----------------------------------------------------------
// Frame
// -----------------------------------------------------------

describe('PromptEditor — frame', () => {

  it('titles the page with the translated name, links back to the list and states slug, purpose, active version and model', async () => {
    renderEditor();
    await ready();
    expect(backLink()).toHaveAttribute('href', '/prompts');
    expect(subtitle()).toHaveTextContent('chat.assistant · Chat · Active v2 · gateway:azure/gpt-5.5');
    expect(subtitle()).toHaveTextContent(/The system prompt of the conversational assistant — the main screen of the platform\./);
    expect(within(main()).getByRole('heading', { level: 2, name: 'Editor' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'AI prompts' })).toHaveAttribute('aria-current', 'page');
  });


  it('opens on the versions tab, the tablist named and each tab wired to the one panel', async () => {
    renderEditor();
    await ready();
    const tablist = screen.getByRole('tablist', { name: 'Prompt tools' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Versions', 'Compare', 'Test']);
    const versionsTab = within(tablist).getByRole('tab', { name: 'Versions' });
    expect(versionsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(panel()).toHaveAttribute('aria-labelledby', versionsTab.id);
    expect(versionsTab).toHaveAttribute('aria-controls', panel().id);
    expect(within(panel()).getByRole('heading', { level: 3, name: 'v3' })).toBeInTheDocument();
  });


  it('keeps the tab in ?tab= — a click replaces the entry, a deep link opens that tab, an unknown one falls back to versions', async () => {
    const { user, router } = renderEditor();
    await ready();
    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(router.state.location.search).toBe('?tab=diff');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true');
    expect(panel()).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Compare' }).id);
  });


  it('a deep link to ?tab=test opens the test tab, and a bogus ?tab= the versions tab', async () => {
    renderEditor({ search: '?tab=test' });
    await ready();
    expect(screen.getByRole('tab', { name: 'Test' })).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByRole('button', { name: 'Run the test' })).toBeInTheDocument();
  });


  it('an unknown ?tab= value falls back to the versions tab', async () => {
    renderEditor({ search: '?tab=secret' });
    await ready();
    expect(screen.getByRole('tab', { name: 'Versions' })).toHaveAttribute('aria-selected', 'true');
  });


  it('shows skeletons with the back link while the prompt loads, and no alert', async () => {
    given.hang('get', DETAIL_URL);
    renderEditor();
    await settle(50);
    expect(backLink()).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Prompt text/ })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('an unknown prompt shows the titled, translated 404 with a retry, under the generic title', async () => {
    renderEditor({ slug: 'report.nope' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The prompt could not be loaded');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.getByRole('heading', { level: 1, name: 'AI prompt' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(backLink()).toBeInTheDocument();
  });


  it('the retry after a failed load brings the editor', async () => {
    given.sequence('get', DETAIL_URL, [{ status: 503 }, { body: chat }]);
    const { user } = renderEditor();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The service is temporarily unavailable. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await ready();
    expect(textField()).toHaveValue(v2.text);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('an answer that is not a prompt is an error with a retry, never an empty editor', async () => {
    given.sequence('get', DETAIL_URL, [{ body: 'unexpected' }, { body: chat }]);
    const { user } = renderEditor();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The prompt could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByRole('textbox', { name: /^Prompt text/ })).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await ready();
  });


  it('a prompt without an active version says so and starts the draft from its newest version', async () => {
    given.json('get', DETAIL_URL, { ...chat, activeVersion: null, activeModel: null, pendingDefault: null });
    renderEditor();
    await ready();
    expect(subtitle()).toHaveTextContent('chat.assistant · Chat · No active version');
    expect(textField()).toHaveValue(v3.text);
    expect(baseSelect()).toHaveTextContent('v3');
    expect(pendingNotice()).toBeNull();
    expect(within(versionCard(3)).queryByText('active')).toBeNull();
    // No active version to compare against
    expect(within(panel()).queryByRole('button', { name: 'Compare with the active one' })).toBeNull();
  });


  it('a failed refetch keeps the editor and the saved draft on screen with the error above them, and the retry clears it', async () => {
    const saved = savedV4();
    given.capture('post', VERSIONS_URL, saved, { status: 201 });
    given.sequence('get', DETAIL_URL, [{ body: chat }, { status: 502, html: '<html><body>Bad Gateway</body></html>' }, { body: detailWithV4(saved) }]);
    const { user } = renderEditor();
    await ready();
    setText(EDITED);
    await user.click(saveButton());
    expect(await screen.findByText('Saved v4')).toBeInTheDocument();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The prompt could not be loaded');
    expect(alert).toHaveTextContent('The server is temporarily unreachable. Try again.');
    expect(textField()).toHaveValue(EDITED);
    expect(screen.getByRole('tablist', { name: 'Prompt tools' })).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(baseSelect()).toHaveTextContent('v4');
    expect(saveButton()).toHaveTextContent('No changes');
  });


  it('a move to another prompt starts a fresh editor — the old draft never becomes the new prompt\'s version', async () => {
    const { router } = renderEditor();
    await ready();
    await act(async () => { await router.navigate('/prompts/report.summary'); });
    await ready('Executive summary');
    expect(textField()).toHaveValue(summary.versions[0].text);
    expect(baseSelect()).toHaveTextContent('v1 (active)');
    expect(saveButton()).toHaveTextContent('No changes');
    expect(saveButton()).toBeDisabled();
  });
});







// -----------------------------------------------------------
// The waiting shipped default
// -----------------------------------------------------------

describe('PromptEditor — the waiting default', () => {

  it('announces the waiting v3 as a status, not an alert', async () => {
    renderEditor();
    await ready();
    const notice = pendingNotice();
    expect(notice).not.toBeNull();
    expect(notice).toHaveTextContent('New default version v3 waiting');
    expect(notice).toHaveTextContent('The deployment shipped a new default version of this prompt, but it is not active because an administrator\'s version is in use.');
    expect(within(notice).getByRole('button', { name: 'Compare' })).toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Activate v3' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('"Compare" opens the diff of the active v2 against v3, with the settings that change', async () => {
    const { user, router } = renderEditor();
    await ready();
    await user.click(within(pendingNotice()).getByRole('button', { name: 'Compare' }));
    // The left side is the draft's own start (v2) — the default,
    // no parameter; the right one is named
    expect(router.state.location.search).toBe('?tab=diff&diff.right=3');
    expect(screen.getByRole('combobox', { name: /^Left/ })).toHaveTextContent('v2');
    expect(screen.getByRole('combobox', { name: /^Right/ })).toHaveTextContent('v3');
    expect(within(panel()).getByText('+1 / −1 lines')).toBeInTheDocument();
    expect(within(panel()).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['Temperature: 0.2 → 0.3', 'Maximum answer length (tokens): 4000 → —']);
  });


  it('"Activate v3" posts the activation, and the refetched prompt runs v3 with the notice gone', async () => {
    const calls = given.capture('post', '/api/prompts/chat.assistant/versions/3/activate', { ...chat, versions: undefined, activeVersion: 3, pendingDefault: null });
    given.sequence('get', DETAIL_URL, [{ body: chat }, { body: { ...chat, activeVersion: 3, activeModel: v3.model, pendingDefault: null } }]);
    const { user } = renderEditor();
    await ready();
    await user.click(within(pendingNotice()).getByRole('button', { name: 'Activate v3' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toBeNull();
    await waitFor(() => expect(pendingNotice()).toBeNull());
    expect(subtitle()).toHaveTextContent('Active v3 · gateway:azure/gpt-5.5');
    expect(within(versionCard(3)).getByText('active')).toBeInTheDocument();
  });


  it('a failed activation is an alert with the translated sentence, the notice stays a status and nothing is toasted', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.apiError('post', '/api/prompts/chat.assistant/versions/3/activate', 'NOT_FOUND', { status: 404, error: 'Version not found' });
    const { user } = renderEditor();
    await ready();
    await user.click(within(pendingNotice()).getByRole('button', { name: 'Activate v3' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    expect(alert).not.toHaveTextContent('Version not found');
    expect(pendingNotice()).not.toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });


  it('a prompt running its own shipped default has no notice', async () => {
    renderEditor({ slug: 'report.summary' });
    await ready('Executive summary');
    expect(pendingNotice()).toBeNull();
    expect(within(main()).queryByText(/New default version/)).toBeNull();
  });
});







// -----------------------------------------------------------
// The form
// -----------------------------------------------------------

describe('PromptEditorForm — fields', () => {

  it('starts from the active version: its text, model and settings, a blank note, "activate" off and nothing to save', async () => {
    renderEditor();
    await ready();
    expect(baseSelect()).toHaveTextContent('v2 (active)');
    expect(textField()).toHaveValue(v2.text);
    expect(textField()).toHaveAccessibleDescription(`${v2.text.length} / 60000 chars`);
    expect(modelField()).toHaveValue('gateway:azure/gpt-5.5');
    expect(temperatureField()).toHaveValue('0.2');
    expect(maxTokensField()).toHaveValue('4000');
    expect(noteField()).toHaveValue('');
    expect(activateBox()).not.toBeChecked();
    expect(saveButton()).toHaveTextContent('No changes');
    expect(saveButton()).toBeDisabled();
  });


  it('offers every version as a base, newest first with the active one marked, and loading one toasts and stays clean', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(baseSelect());
    expect(await optionTexts()).toEqual(['v3', 'v2 (active)', 'v1']);
    await user.click(screen.getByRole('option', { name: 'v1' }));
    expect(await screen.findByText('Version v1 loaded into the editor')).toBeInTheDocument();
    expect(textField()).toHaveValue(v1.text);
    expect(temperatureField()).toHaveValue('0.3');
    expect(maxTokensField()).toHaveValue('');
    expect(baseSelect()).toHaveTextContent('v1');
    expect(saveButton()).toHaveTextContent('No changes');
  });


  it('asks before another version replaces a DIRTY draft — keep editing keeps it, discard loads the version', async () => {
    const { user } = renderEditor();
    await ready();
    await user.type(textField(), ' Papildyta.');
    await user.click(baseSelect());
    await user.click(await screen.findByRole('option', { name: 'v1' }));
    let dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    expect(dialog).toHaveTextContent('Loading v1 replaces the draft — your unsaved changes will be lost.');
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(textField().value.endsWith(' Papildyta.')).toBe(true);
    expect(baseSelect()).toHaveTextContent('v2');

    await user.click(within(versionCard(1)).getByRole('button', { name: 'Edit from this one' }));
    dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard and load v1' }));
    expect(await screen.findByText('Version v1 loaded into the editor')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(textField()).toHaveValue(v1.text);
    expect(saveButton()).toHaveTextContent('No changes');
  });


  it('asks in Lithuanian too', async () => {
    const { user } = renderEditor({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    await user.type(screen.getByRole('textbox', { name: /^Instrukcijos tekstas/ }), ' x');
    await user.click(within(versionCard(3)).getByRole('button', { name: 'Redaguoti nuo šios' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atmesti pakeitimus?' });
    expect(dialog).toHaveTextContent('Įkėlus v3, juodraštis bus pakeistas — neišsaugoti pakeitimai bus prarasti.');
    expect(within(dialog).getByRole('button', { name: 'Atmesti ir įkelti v3' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tęsti redagavimą' })).toBeInTheDocument();
  });


  it('lists the declared variables as chips, and a click inserts {NAME} at the caret and puts the caret after it', async () => {
    const { user } = renderEditor();
    await ready();
    expect(within(main()).getByText('Variables')).toBeInTheDocument();
    const chips = ['{WEEKDAY}', '{TODAY}', '{LEADING_LANGUAGE}', '{USER_CONTEXT}', '{COMPANY_CONTEXT}', '{ROLE_CONTEXT}'];
    for (const chip of chips) expect(within(main()).getByRole('button', { name: chip })).toBeInTheDocument();
    expect(within(main()).getByText('Click to insert at the cursor. The analysis replaces them with real values.')).toBeInTheDocument();

    setText('Labas . Viso gero');
    textField().setSelectionRange(6, 6);
    await user.click(within(main()).getByRole('button', { name: '{TODAY}' }));
    expect(textField()).toHaveValue('Labas {TODAY}. Viso gero');
    await waitFor(() => expect(textField()).toHaveFocus());
    expect(textField().selectionStart).toBe(13);
    expect(textField()).toHaveAccessibleDescription('24 / 60000 chars');
  });


  it('a chip replaces the selected text', async () => {
    const { user } = renderEditor();
    await ready();
    setText('Answer in LANGUAGE.');
    textField().setSelectionRange(10, 18);
    await user.click(within(main()).getByRole('button', { name: '{LEADING_LANGUAGE}' }));
    expect(textField()).toHaveValue('Answer in {LEADING_LANGUAGE}.');
  });


  it('notes placeholders the prompt does not declare — as a status — and drops the note once they are gone', async () => {
    renderEditor();
    await ready();
    setText(`${v2.text}\n{COMPANY} {FOO_BAR} {COMPANY} {lowercase} {TODAY}`);
    const note = await within(main()).findByText('Unknown variables (left as they are): {COMPANY}, {FOO_BAR}');
    expect(note.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    setText(v2.text);
    await waitFor(() => expect(within(main()).queryByText(/Unknown variables/)).toBeNull());
  });


  it('a prompt without variables shows no chips', async () => {
    renderEditor({ slug: 'corpus.check_citations' });
    await ready('Citation check');
    expect(within(main()).queryByText('Variables')).toBeNull();
    expect(within(main()).queryByText(/Click to insert/)).toBeNull();
  });


  it('offers the gateway\'s chat models newest first, as listed, with their prices per million tokens — never the embedding models', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(modelField());
    expect(await optionTexts()).toEqual([
      'gateway:azure/gpt-5.6-solgpt-5.6-sol · input $4.00 / output $20.00 per 1M tokens',
      'gateway:azure/gpt-5.6-terragpt-5.6-terra · input $2.00 / output $12.00 per 1M tokens',
      'gateway:azure/gpt-5.6-lunagpt-5.6-luna · input $0.20 / output $1.20 per 1M tokens',
      'gateway:azure/gpt-5.5gpt-5.5 · input $5.00 / output $30.00 per 1M tokens',
    ]);
    expect(modelField()).toHaveAccessibleDescription('E.g. gateway:azure/gpt-5.5');
  });


  it('picking a model puts it in the draft, which then has something to save', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(modelField());
    await user.click(await screen.findByRole('option', { name: /^gateway:azure\/gpt-5\.6-luna/ }));
    expect(modelField()).toHaveValue('gateway:azure/gpt-5.6-luna');
    expect(saveButton()).toHaveTextContent('Save as a new version');
    expect(saveButton()).toBeEnabled();
  });


  it('a model id the list does not offer can be typed', async () => {
    const { user } = renderEditor();
    await ready();
    await user.clear(modelField());
    await user.type(modelField(), 'openai:gpt-5');
    await user.tab();
    expect(modelField()).toHaveValue('openai:gpt-5');
    expect(saveButton()).toBeEnabled();
  });


  it('a failed model list says so under the field with a retry — the field still takes a typed id', async () => {
    given.sequence('get', '/api/llm/models', [{ status: 500, body: apiError('SERVER_ERROR', 'boom') }, { body: f.llmModels }]);
    const { user } = renderEditor();
    await ready();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The model list could not be loaded — you can still type the model id');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    await user.clear(modelField());
    await user.type(modelField(), 'gateway:azure/gpt-5.6-sol');
    expect(modelField()).toHaveValue('gateway:azure/gpt-5.6-sol');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await user.clear(modelField());
    await user.click(modelField());
    expect(await screen.findAllByRole('option')).toHaveLength(4);
  });


  it('a model list without models is an error with the retry, never an empty picker', async () => {
    given.json('get', '/api/llm/models', { providers: ['gateway'] });
    renderEditor();
    await ready();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The model list could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
  });


  it('the temperature and max-token inputs ask phones for a numeric keyboard', async () => {
    renderEditor();
    await ready();
    expect(temperatureField()).toHaveAttribute('inputmode', 'decimal');
    expect(maxTokensField()).toHaveAttribute('inputmode', 'numeric');
    expect(temperatureField()).toHaveAccessibleDescription('0–2; empty — the model\'s default');
    expect(maxTokensField()).toHaveAccessibleDescription('1–128,000; empty — the default');
  });


  it('max tokens keeps only digits, and the note stops at 500 characters', async () => {
    const { user } = renderEditor();
    await ready();
    await user.clear(maxTokensField());
    await user.type(maxTokensField(), '1a2.3 4-');
    expect(maxTokensField()).toHaveValue('1234');
    fireEvent.change(noteField(), { target: { value: 'x'.repeat(600) } });
    expect(noteField().value).toHaveLength(500);
    expect(noteField()).toHaveAccessibleDescription('What changed and why (other administrators see it)');
  });


  it('the note and the activate box alone leave nothing to save', async () => {
    const { user } = renderEditor();
    await ready();
    await user.type(noteField(), 'Tik pastaba');
    await user.click(activateBox());
    expect(activateBox()).toBeChecked();
    expect(saveButton()).toHaveTextContent('No changes');
    expect(saveButton()).toBeDisabled();
    expect(unloadPrevented()).toBe(false);
  });
});







// -----------------------------------------------------------
// Validation
// -----------------------------------------------------------

describe('PromptEditorForm — validation', () => {

  it('shows nothing before a save attempt, then every broken field — and sends nothing', async () => {
    const calls = given.capture('post', VERSIONS_URL, savedV4(), { status: 201 });
    const { user } = renderEditor();
    await ready();
    setText('   ');
    await user.clear(modelField());
    await user.type(modelField(), 'gpt 5');
    await user.clear(temperatureField());
    await user.type(temperatureField(), '2.5');
    await user.clear(maxTokensField());
    await user.type(maxTokensField(), '128001');
    expect(textField()).not.toHaveAttribute('aria-invalid', 'true');
    expect(temperatureField()).toHaveAccessibleDescription('0–2; empty — the model\'s default');

    await user.click(saveButton());
    expect(textField()).toHaveAccessibleDescription('Enter the prompt text');
    expect(textField()).toHaveAttribute('aria-invalid', 'true');
    expect(modelField()).toHaveAccessibleDescription('The model id does not match the format (provider:model)');
    expect(temperatureField()).toHaveAccessibleDescription('Enter a number from 0 to 2');
    expect(maxTokensField()).toHaveAccessibleDescription('Enter a whole number from 1 to 128,000');
    await settle(50);
    expect(calls).toHaveLength(0);
  });


  it('after a failed attempt the messages follow the fixes as they are typed', async () => {
    const { user } = renderEditor();
    await ready();
    await user.clear(temperatureField());
    await user.type(temperatureField(), '3');
    await user.click(saveButton());
    expect(temperatureField()).toHaveAccessibleDescription('Enter a number from 0 to 2');
    await user.clear(temperatureField());
    await user.type(temperatureField(), '1,5');
    expect(temperatureField()).toHaveAccessibleDescription('0–2; empty — the model\'s default');
    expect(temperatureField()).not.toHaveAttribute('aria-invalid', 'true');
  });


  it('refuses a text over 60,000 characters, naming the limit in place of the counter', async () => {
    const calls = given.capture('post', VERSIONS_URL, savedV4(), { status: 201 });
    const { user } = renderEditor();
    await ready();
    setText('x'.repeat(60_001));
    expect(textField()).toHaveAccessibleDescription('60001 / 60000 chars');
    await user.click(saveButton());
    expect(textField()).toHaveAccessibleDescription('Too long (at most 60000 characters)');
    await settle(50);
    expect(calls).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Saving a new version
// -----------------------------------------------------------

describe('PromptEditor — saving', () => {

  it('saves the draft as a new version without activating it, toasts, and continues from the saved v4', async () => {
    const saved = savedV4({ note: 'Trumpiau' });
    const calls = given.capture('post', VERSIONS_URL, saved, { status: 201 });
    given.sequence('get', DETAIL_URL, [{ body: chat }, { body: detailWithV4(saved) }]);
    const { user } = renderEditor();
    await ready();
    setText(EDITED);
    await user.type(noteField(), 'Trumpiau');
    await user.click(saveButton());

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ text: EDITED, model: 'gateway:azure/gpt-5.5', note: 'Trumpiau', activate: false, temperature: 0.2, maxTokens: 4000 });
    expect(await screen.findByText('Saved v4')).toBeInTheDocument();
    await waitFor(() => expect(baseSelect()).toHaveTextContent('v4'));
    expect(textField()).toHaveValue(EDITED);
    expect(noteField()).toHaveValue('');
    expect(saveButton()).toHaveTextContent('No changes');
    // Still v2 active, the default still waiting
    expect(subtitle()).toHaveTextContent('Active v2 · gateway:azure/gpt-5.5');
    expect(pendingNotice()).not.toBeNull();
    expect(within(panel()).getByRole('heading', { level: 3, name: 'v4' })).toBeInTheDocument();
  });


  it('with "activate right away" the version goes live: the body says so, the toast too, and the prompt runs v4', async () => {
    const saved = savedV4();
    const calls = given.capture('post', VERSIONS_URL, saved, { status: 201 });
    given.sequence('get', DETAIL_URL, [{ body: chat }, { body: detailWithV4(saved, true) }]);
    const { user } = renderEditor();
    await ready();
    setText(EDITED);
    await user.click(activateBox());
    await user.click(saveButton());

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.activate).toBe(true);
    expect(await screen.findByText('Saved and activated v4')).toBeInTheDocument();
    await waitFor(() => expect(subtitle()).toHaveTextContent('Active v4 · gateway:azure/gpt-5.5'));
    expect(baseSelect()).toHaveTextContent('v4 (active)');
    expect(activateBox()).not.toBeChecked();
    expect(pendingNotice()).toBeNull();
  });


  it('sends the model and note trimmed, a comma temperature as a number, and leaves empty settings out', async () => {
    const calls = given.capture('post', VERSIONS_URL, savedV4(), { status: 201 });
    const { user } = renderEditor();
    await ready();
    await user.clear(modelField());
    await user.type(modelField(), '  gateway:azure/gpt-5.6-luna  ');
    await user.clear(temperatureField());
    await user.type(temperatureField(), '1,5');
    await user.clear(maxTokensField());
    await user.type(noteField(), '  Pigesnis modelis  ');
    await user.click(saveButton());

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ text: v2.text, model: 'gateway:azure/gpt-5.6-luna', note: 'Pigesnis modelis', activate: false, temperature: 1.5 });
    expect(calls[0].headers['content-type']).toMatch(/application\/json/);
    expect(calls[0].headers.authorization).toBeUndefined();
  });


  it('an empty temperature is left out too, and a text change alone keeps the version\'s settings', async () => {
    const calls = given.capture('post', VERSIONS_URL, savedV4(), { status: 201 });
    const { user } = renderEditor();
    await ready();
    await user.clear(temperatureField());
    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ text: v2.text, model: 'gateway:azure/gpt-5.5', note: '', activate: false, maxTokens: 4000 });
  });


  it('the save button is busy while the save is on the wire', async () => {
    given.slow('post', VERSIONS_URL, 300, savedV4(), { status: 201 });
    const { user } = renderEditor();
    await ready();
    await editText(user);
    await user.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(await screen.findByText('Saved v4')).toBeInTheDocument();
  });


  it('a refused save shows the backend\'s English prose above the editor and keeps the draft — nothing is toasted', async () => {
    const toastError = vi.spyOn(toast, 'error');
    given.apiError('post', VERSIONS_URL, 'INVALID_FIELD', { status: 400, error: 'model must look like gateway:azure/gpt-5.5' });
    const { user } = renderEditor();
    await ready();
    await editText(user);
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('model must look like gateway:azure/gpt-5.5');
    expect(textField()).toHaveValue(`${v2.text} Be concise.`);
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(/^Saved/)).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });


  it('the next successful save clears the refusal', async () => {
    given.sequence('post', VERSIONS_URL, [{ status: 400, body: apiError('MISSING_FIELDS', 'text and model are required') }, { status: 201, body: savedV4() }]);
    const { user } = renderEditor();
    await ready();
    await editText(user);
    await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('text and model are required');
    await user.click(saveButton());
    expect(await screen.findByText('Saved v4')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it('a dropped connection on save shows the network sentence', async () => {
    given.networkError('post', VERSIONS_URL);
    const { user } = renderEditor();
    await ready();
    await editText(user);
    await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });


  it('a 401 on save sends the user to sign in again, back to this prompt afterwards', async () => {
    given.unauthorized('post', VERSIONS_URL);
    localStorage.setItem('complianceToken', 'test-token');
    const { user } = renderEditor();
    await ready();
    await editText(user);
    await user.click(saveButton());
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fprompts%2Fchat.assistant&expired=1']));
    expect(localStorage.getItem('complianceToken')).toBeNull();
  });
});







// -----------------------------------------------------------
// The unsaved-changes guard
// -----------------------------------------------------------

describe('PromptEditor — unsaved changes', () => {

  it('a clean editor leaves freely', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(backLink());
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/prompts');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });


  it('a dirty editor asks before leaving: "Stay" keeps the page and the draft', async () => {
    const { user, router } = renderEditor();
    await ready();
    await editText(user);
    await user.click(backLink());
    const dialog = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
    expect(dialog).toHaveTextContent('You have unsaved changes. Leave this page anyway?');
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/prompts/chat.assistant');
    expect(textField()).toHaveValue(`${v2.text} Be concise.`);
  });


  it('"Leave without saving" goes where the user was going', async () => {
    const { user } = renderEditor();
    await ready();
    await editText(user);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await user.click(within(nav).getByRole('link', { name: 'Users' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/users');
  });


  it('switching tabs with a dirty draft is free, and the draft survives it', async () => {
    const { user, router } = renderEditor();
    await ready();
    await editText(user);
    await user.click(screen.getByRole('tab', { name: 'Test' }));
    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(router.state.location.search).toBe('?tab=diff');
    expect(textField()).toHaveValue(`${v2.text} Be concise.`);
  });


  it('asks the browser to confirm a reload or close only while the draft is dirty — and not after it is saved', async () => {
    const saved = savedV4({ text: `${v2.text} Be concise.` });
    given.capture('post', VERSIONS_URL, saved, { status: 201 });
    given.sequence('get', DETAIL_URL, [{ body: chat }, { body: detailWithV4(saved) }]);
    const { user } = renderEditor();
    await ready();
    expect(unloadPrevented()).toBe(false);
    await editText(user);
    expect(unloadPrevented()).toBe(true);
    await user.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveTextContent('No changes'));
    expect(unloadPrevented()).toBe(false);
  });
});







// -----------------------------------------------------------
// The version history
// -----------------------------------------------------------

describe('PromptVersions', () => {

  it('lists the versions newest first with source, stamp, model and settings, and the note', async () => {
    renderEditor();
    await ready();
    expect(within(panel()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['v3', 'v2', 'v1']);

    const third = versionCard(3);
    expect(within(third).getByText('Shipped default')).toBeInTheDocument();
    expect(within(third).getByText('Created 24/09/2026, 06:00')).toBeInTheDocument();
    expect(within(third).getByText('gateway:azure/gpt-5.5 · temp. 0.3 · max —')).toBeInTheDocument();

    const second = versionCard(2);
    expect(within(second).getByText('Administrator')).toBeInTheDocument();
    expect(within(second).getByText('Created 15/09/2026, 09:30')).toBeInTheDocument();
    expect(within(second).getByText('gateway:azure/gpt-5.5 · temp. 0.2 · max 4000')).toBeInTheDocument();
    expect(within(second).getByText('Trumpesni atsakymai, visada nurodyti šaltinius')).toBeInTheDocument();

    expect(within(versionCard(1)).getByText('Created 01/09/2026, 06:00')).toBeInTheDocument();
  });


  it('marks the active version, which offers only "Edit from this one"; the others can be activated and compared', async () => {
    renderEditor();
    await ready();
    const active = versionCard(2);
    expect(within(active).getByText('active')).toBeInTheDocument();
    expect(within(active).getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit from this one']);
    for (const n of [3, 1]) {
      expect(within(versionCard(n)).queryByText('active')).toBeNull();
      expect(within(versionCard(n)).getAllByRole('button').map((b) => b.textContent)).toEqual(['Activate', 'Edit from this one', 'Compare with the active one']);
    }
  });


  it('activates a version after a confirmation: the POST, the toast, and the history marks it active', async () => {
    const calls = given.capture('post', '/api/prompts/chat.assistant/versions/1/activate', { ...chat, versions: undefined, activeVersion: 1, pendingDefault: null });
    given.sequence('get', DETAIL_URL, [{ body: chat }, { body: { ...chat, activeVersion: 1, activeModel: v1.model, pendingDefault: null } }]);
    const { user } = renderEditor();
    await ready();
    await user.click(within(versionCard(1)).getByRole('button', { name: 'Activate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activate v1?' });
    expect(dialog).toHaveTextContent('From now on the chat or the analysis step uses this version. The previous one stays in the history.');
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toBeNull();
    expect(await screen.findByText('Activated v1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(versionCard(1)).getByText('active')).toBeInTheDocument());
    expect(subtitle()).toHaveTextContent('Active v1');
  });


  it('"Cancel" sends nothing, and the closing dialog keeps its title instead of flashing "vnull"', async () => {
    const calls = given.capture('post', '/api/prompts/chat.assistant/versions/:version/activate', {});
    const { user } = renderEditor();
    await ready();
    await user.click(within(versionCard(3)).getByRole('button', { name: 'Activate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activate v3?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    // The dialog fades out: its title must still name v3
    expect(screen.queryByText(/vnull/)).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toHaveLength(0);
  });


  it('a refused activation shows the translated error inside the dialog and keeps it open; reopening starts clean', async () => {
    given.apiError('post', '/api/prompts/chat.assistant/versions/3/activate', 'NOT_FOUND', { status: 404, error: 'Version not found' });
    const { user } = renderEditor();
    await ready();
    await user.click(within(versionCard(3)).getByRole('button', { name: 'Activate' }));
    let dialog = await screen.findByRole('dialog', { name: 'Activate v3?' });
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.queryByText('Activated v3')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(within(versionCard(3)).getByRole('button', { name: 'Activate' }));
    dialog = await screen.findByRole('dialog', { name: 'Activate v3?' });
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('"Edit from this one" loads that version into the editor and says so', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(within(versionCard(3)).getByRole('button', { name: 'Edit from this one' }));
    expect(await screen.findByText('Version v3 loaded into the editor')).toBeInTheDocument();
    expect(textField()).toHaveValue(v3.text);
    expect(baseSelect()).toHaveTextContent('v3');
    expect(temperatureField()).toHaveValue('0.3');
    expect(maxTokensField()).toHaveValue('');
    expect(saveButton()).toHaveTextContent('No changes');
  });


  it('"Compare with the active one" opens the diff of the active v2 against that version', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(within(versionCard(1)).getByRole('button', { name: 'Compare with the active one' }));
    expect(screen.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: /^Left/ })).toHaveTextContent('v2');
    expect(screen.getByRole('combobox', { name: /^Right/ })).toHaveTextContent('v1');
  });
});







// -----------------------------------------------------------
// The diff
// -----------------------------------------------------------

describe('PromptDiff', () => {

  it('starts with the active version against the untouched draft: identical, no table, no settings', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(screen.getByRole('combobox', { name: /^Left/ })).toHaveTextContent('v2');
    expect(screen.getByRole('combobox', { name: /^Right/ })).toHaveTextContent('Draft (in the editor)');
    expect(within(panel()).getByText('The texts are identical')).toBeInTheDocument();
    expect(within(panel()).queryByRole('table')).toBeNull();
    expect(within(panel()).queryByRole('heading', { name: 'Settings' })).toBeNull();
  });


  it('shows an edited draft line as removed and added, with both numberings and the stats', async () => {
    const { user } = renderEditor();
    await ready();
    setText(EDITED);
    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(within(panel()).getByText('+1 / −1 lines')).toBeInTheDocument();
    const rows = diffRows();
    expect(rows.slice(0, 3)).toEqual([
      ['1', '', '−', v2.text.split('\n')[0]],
      ['', '1', '+', EDITED.split('\n')[0]],
      ['2', '2', '', ' '],
    ]);
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)).toEqual(['7', '7', '', '{ROLE_CONTEXT}']);
    // The sign carries the meaning, named for screen readers
    expect(within(panel()).getByLabelText('removed')).toHaveTextContent('−');
    expect(within(panel()).getByLabelText('added')).toHaveTextContent('+');
  });


  it('compares any two stored versions chosen on either side', async () => {
    const { user } = renderEditor({ search: '?tab=diff' });
    await ready();
    await choose(user, screen.getByRole('combobox', { name: /^Left/ }), 'v1');
    await user.click(screen.getByRole('combobox', { name: /^Right/ }));
    expect(await optionTexts()).toEqual(['Draft (in the editor)', 'v3', 'v2', 'v1']);
    await user.click(screen.getByRole('option', { name: 'v3' }));
    expect(within(panel()).getByText('+1 / −1 lines')).toBeInTheDocument();
    expect(diffRows()[0]).toEqual(['1', '', '−', v1.text.split('\n')[0]]);
    expect(diffRows()[1]).toEqual(['', '1', '+', v3.text.split('\n')[0]]);
    // v1 and v3 share model, temperature and max tokens
    expect(within(panel()).queryByRole('heading', { name: 'Settings' })).toBeNull();
  });


  it('lists each changed setting as "field: from → to", and swapping the sides swaps them', async () => {
    const { user } = renderEditor({ search: '?tab=diff' });
    await ready();
    await choose(user, screen.getByRole('combobox', { name: /^Left/ }), 'v3');
    await choose(user, screen.getByRole('combobox', { name: /^Right/ }), 'v2');
    expect(within(panel()).getByRole('heading', { level: 3, name: 'Settings' })).toBeInTheDocument();
    expect(within(panel()).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['Temperature: 0.3 → 0.2', 'Maximum answer length (tokens): — → 4000']);
    expect(diffRows()[0]).toEqual(['1', '', '−', v3.text.split('\n')[0]]);
  });


  it('names a changed model of the draft', async () => {
    const { user } = renderEditor();
    await ready();
    await user.click(modelField());
    await user.click(await screen.findByRole('option', { name: /^gateway:azure\/gpt-5\.6-luna/ }));
    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(within(panel()).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['Model: gateway:azure/gpt-5.5 → gateway:azure/gpt-5.6-luna']);
    // Only a setting changed: the texts still match
    expect(within(panel()).getByText('The texts are identical')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The diff's two sides live in the address (?diff.left=,
// ?diff.right= — "draft" or a version; one the prompt does
// not have reads as the default), a tab switch keeps them,
// and the back link is a real Back when the list is right
// behind.
// -----------------------------------------------------------

describe('PromptEditor — coming back', () => {

  it('the diff\'s sides come from the address, and a choice goes back into it (replacing)', async () => {
    const { user, router } = renderEditor({ search: '?tab=diff&diff.left=1&diff.right=3' });
    await ready();
    expect(screen.getByRole('combobox', { name: /^Left/ })).toHaveTextContent('v1');
    expect(screen.getByRole('combobox', { name: /^Right/ })).toHaveTextContent('v3');
    await choose(user, screen.getByRole('combobox', { name: /^Right/ }), 'Draft (in the editor)');
    await waitFor(() => expect(router.state.location.search).toBe('?tab=diff&diff.left=1'));
    expect(router.state.historyAction).toBe('REPLACE');
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(router.state.location.search).toBe('?tab=versions&diff.left=1');
    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(screen.getByRole('combobox', { name: /^Left/ })).toHaveTextContent('v1');
  });


  it('a side the prompt does not have reads as the default', async () => {
    renderEditor({ search: '?tab=diff&diff.left=99&diff.right=nonsense' });
    await ready();
    expect(screen.getByRole('combobox', { name: /^Left/ })).toHaveTextContent('v2');
    expect(screen.getByRole('combobox', { name: /^Right/ })).toHaveTextContent('Draft (in the editor)');
  });


  it('with the list right behind, the back link is Back — the list\'s own entry and order', async () => {
    const { user, router } = renderRoutes([
      { path: '/prompts', element: <ListProbe to="/prompts/chat.assistant" /> },
      { path: '/prompts/:slug', element: <PromptEditor authData={authData} /> },
    ], { route: '/prompts?sort=kind.desc' });
    const listKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await ready();
    await user.click(backLink());
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/prompts?sort=kind.desc');
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(listKey);
  });


  it('in Lithuanian the diff\'s sides come from the address too', async () => {
    renderEditor({ search: '?tab=diff&diff.left=1', locale: 'lt' });
    await ready('Pokalbių asistentas');
    expect(screen.getByRole('combobox', { name: /^Kairė/ })).toHaveTextContent('v1');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('PromptEditor — Lithuanian', () => {

  it('speaks Lithuanian: frame, waiting default, form, tabs and the version history', async () => {
    renderEditor({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    expect(within(main()).getByRole('link', { name: 'DI instrukcijos' })).toHaveAttribute('href', '/prompts');
    expect(subtitle()).toHaveTextContent('chat.assistant · Pokalbis · Aktyvi v2 · gateway:azure/gpt-5.5');
    const notice = within(main()).getAllByRole('status').find((node) => /Laukia nauja numatytoji versija v3/.test(node.textContent));
    expect(within(notice).getByRole('button', { name: 'Palyginti' })).toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Aktyvuoti v3' })).toBeInTheDocument();

    expect(within(main()).getByRole('heading', { level: 2, name: 'Redaktorius' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Pagrindas/ })).toHaveTextContent('v2 (aktyvi)');
    expect(screen.getByRole('textbox', { name: /^Instrukcijos tekstas/ })).toHaveValue(v2.text);
    expect(screen.getByRole('combobox', { name: /^Modelis/ })).toHaveAccessibleDescription('Pvz., gateway:azure/gpt-5.5');
    expect(screen.getByRole('textbox', { name: 'Temperatūra' })).toHaveValue('0.2');
    expect(screen.getByRole('textbox', { name: 'Didžiausias atsakymo ilgis (žetonais)' })).toHaveValue('4000');
    expect(screen.getByRole('checkbox', { name: 'Iš karto aktyvuoti' })).not.toBeChecked();
    expect(within(main()).getByRole('button', { name: 'Pakeitimų nėra' })).toBeDisabled();

    expect(screen.getByRole('tablist', { name: 'Instrukcijos įrankiai' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Versijos', 'Palyginimas', 'Bandymas']);
    const second = versionCard(2);
    expect(within(second).getByText('aktyvi')).toBeInTheDocument();
    expect(within(second).getByText('Administratoriaus')).toBeInTheDocument();
    expect(within(second).getByText('Sukurta 2026-09-15 09:30')).toBeInTheDocument();
    expect(within(second).getByText('gateway:azure/gpt-5.5 · temp. 0.2 · maks. 4000')).toBeInTheDocument();
    expect(within(versionCard(3)).getAllByRole('button').map((b) => b.textContent)).toEqual(['Aktyvuoti', 'Redaguoti nuo šios', 'Palyginti su aktyvia']);
    expect(within(versionCard(3)).getByText('Numatytoji')).toBeInTheDocument();
  });


  it('validates, saves and refuses in Lithuanian — never the backend\'s English prose', async () => {
    given.sequence('post', VERSIONS_URL, [
      { status: 400, body: apiError('INVALID_FIELD', 'temperature must be a number from 0 to 2') },
      { status: 201, body: savedV4() },
    ]);
    const { user } = renderEditor({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    const temperature = screen.getByRole('textbox', { name: 'Temperatūra' });
    await user.clear(temperature);
    await user.type(temperature, '5');
    const save = within(main()).getByRole('button', { name: 'Išsaugoti kaip naują versiją' });
    await user.click(save);
    expect(temperature).toHaveAccessibleDescription('Įveskite skaičių nuo 0 iki 2');

    await user.clear(temperature);
    await user.type(temperature, '0,4');
    await user.click(save);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Neteisinga lauko reikšmė.');
    expect(alert).not.toHaveTextContent('temperature must be');

    await user.click(save);
    expect(await screen.findByText('Išsaugota v4')).toBeInTheDocument();
  });


  it('the diff and the activation dialog speak Lithuanian', async () => {
    const { user } = renderEditor({ locale: 'lt' });
    await ready('Pokalbių asistentas');
    await user.click(within(versionCard(1)).getByRole('button', { name: 'Aktyvuoti' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aktyvuoti v1?' });
    expect(dialog).toHaveTextContent('Nuo šiol pokalbis ar analizės etapas naudos šią versiją.');
    await user.click(within(dialog).getByRole('button', { name: 'Atšaukti' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Palyginti' }));
    expect(screen.getByRole('combobox', { name: /^Kairė/ })).toHaveTextContent('v2');
    expect(screen.getByRole('combobox', { name: /^Dešinė/ })).toHaveTextContent('v3');
    expect(within(panel()).getByText('+1 / −1 eilučių')).toBeInTheDocument();
    expect(within(panel()).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['Temperatūra: 0.2 → 0.3', 'Didžiausias atsakymo ilgis (žetonais): 4000 → —']);
    expect(within(panel()).getByLabelText('pašalinta')).toHaveTextContent('−');
    expect(within(panel()).getByLabelText('pridėta')).toHaveTextContent('+');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the editor's own GET and
// against the model list its form reads. The editor's frame
// (the back link) stands in every state of the first; the
// loaded editor's title in every state of the second, whose
// data is seen landing in the model picker's options.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/prompts/:slug',
  fixture: chat,
  render: () => renderEditor(),
  chrome: () => backLink(),
  loaded: async () => {
    await ready();
    expect(textField()).toHaveValue(v2.text);
  },
});


describeEndpointContract({
  path: '/api/llm/models',
  fixture: f.llmModels,
  render: () => renderEditor(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Chat assistant' }),
  loaded: async () => {
    await ready();
    await userEvent.setup().click(modelField());
    expect(await screen.findByRole('option', { name: /^gateway:azure\/gpt-5\.6-luna/ })).toBeInTheDocument();
  },
});
