// -----------------------------------------------------------
//  [*] promptDraft — the editor's draft, as plain data
//
//  The prompt editor works on a draft {text, model,
//  temperature, maxTokens, note, activate} built from a
//  stored version; these helpers convert between the two,
//  validate the draft with the backend's rules, find the
//  placeholders the text uses and read the prompt detail the
//  editor starts from.
//
//  The draft lives in the editor's state only — nothing is
//  persisted; a reload or a close is caught by the leave
//  guard (hooks/useUnsavedChanges.js) instead.
//
//  Split into:
//
//    MAX_TEXT      — the backend's text cap
//    MODEL_ID      — the backend's model id pattern
//    PLACEHOLDER   — the {NAME} pattern of prompts/store.py
//    draftFrom     — a version → a draft
//    isDirty       — does the draft differ from its base
//    validateDraft — draft → {field: message}
//    placeholders  — the {NAME}s a text uses
//    readPrompt    — GET /api/prompts/{slug} → the editor's prompt
// -----------------------------------------------------------







// -----------------------------------------------------------
// MAX_TEXT
// -----------------------------------------------------------
//
// MAX_TEXT_CHARS of django prompts/api/views.py.
//
// Used by:
//   - validateDraft (below), PromptEditorForm.jsx — the counter
// -----------------------------------------------------------

export const MAX_TEXT = 60_000;







// -----------------------------------------------------------
// MODEL_ID
// -----------------------------------------------------------
//
// MODEL_ID of django prompts/api/views.py: an optional
// provider prefix, then the model name, which never ends in
// ":" (a bare "gateway:" names no model).
//
// Used by:
//   - validateDraft (below)
// -----------------------------------------------------------

export const MODEL_ID = /^(?:(?:gateway|openai|anthropic|ollama):)?[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,118}[A-Za-z0-9._/-])?$/;







// -----------------------------------------------------------
// PLACEHOLDER
// -----------------------------------------------------------
//
// {UPPER_CASE} names — what render() fills.
//
// Used by:
//   - placeholders (below)
// -----------------------------------------------------------

export const PLACEHOLDER = /\{([A-Z][A-Z0-9_]*)\}/g;







// -----------------------------------------------------------
// draftFrom
// -----------------------------------------------------------
//
// A stored version (or nothing) → an editable draft; the
// numbers become strings for the inputs. A text or model
// that is not a string (a malformed answer) starts empty —
// every draft field must stay a string the inputs and
// validateDraft can trim.
//
// Used by:
//   - PromptEditor.jsx — load / reset the editor
//   - isDirty (below) — the base to compare with
// -----------------------------------------------------------

export function draftFrom(version) {
  return {
    text: typeof version?.text === 'string' ? version.text : '',
    model: typeof version?.model === 'string' ? version.model : '',
    temperature: version?.temperature == null ? '' : String(version.temperature),
    maxTokens: version?.maxTokens == null ? '' : String(version.maxTokens),
    note: '',
    activate: false,
  };
}







// -----------------------------------------------------------
// isDirty
// -----------------------------------------------------------
//
// True when the text or a model setting differs from the
// base version (the note and the activate box do not count).
//
// Used by:
//   - PromptEditor.jsx — the save button and the leave guard
// -----------------------------------------------------------

export function isDirty(draft, base) {
  const origin = draftFrom(base);
  return ['text', 'model', 'temperature', 'maxTokens'].some((key) => draft[key].trim() !== origin[key].trim());
}







// -----------------------------------------------------------
// validateDraft
// -----------------------------------------------------------
//
// The backend's rules: text required ≤ 60k, model matching
// MODEL_ID, temperature 0..2, maxTokens 1..128000.
//
// Used by:
//   - PromptEditor.jsx — before saving and testing
// -----------------------------------------------------------

export function validateDraft(draft, t) {
  const errors = {};
  if (!draft.text.trim()) errors.text = t('textRequired');
  else if (draft.text.length > MAX_TEXT) errors.text = t('tooLong', { max: MAX_TEXT });
  if (!MODEL_ID.test(draft.model.trim())) errors.model = t('modelInvalid');
  const temperature = draft.temperature.trim().replace(',', '.');
  if (temperature && (!/^\d+(\.\d+)?$/.test(temperature) || Number(temperature) > 2)) errors.temperature = t('temperatureInvalid');
  const maxTokens = draft.maxTokens.trim();
  if (maxTokens && (!/^\d+$/.test(maxTokens) || Number(maxTokens) < 1 || Number(maxTokens) > 128_000)) errors.maxTokens = t('maxTokensInvalid');
  return errors;
}







// -----------------------------------------------------------
// placeholders
// -----------------------------------------------------------
//
// The distinct {NAME}s in a text, in order of appearance.
//
// Used by:
//   - PromptEditorForm.jsx — the unknown-variables warning
// -----------------------------------------------------------

export function placeholders(text) {
  return [...new Set([...String(text).matchAll(PLACEHOLDER)].map((match) => match[1]))];
}







// -----------------------------------------------------------
// readPrompt
// -----------------------------------------------------------
//
// GET /api/prompts/{slug}'s answer as the editor uses it:
// the versions that carry a whole number, each number once
// (it keys every version list, select and diff side), and
// the declared variables as distinct names. A malformed
// answer degrades to fewer versions or placeholders instead
// of crashing the editor or repeating a React key; one that
// is not an object at all throws — the query's error state
// with its retry, not an editor for nothing.
//
// Used by:
//   - PromptEditor.jsx — the prompt query
// -----------------------------------------------------------

export function readPrompt(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The prompt answer is not an object');
  const numbers = new Set();
  const versions = (Array.isArray(data.versions) ? data.versions : []).filter((version) => {
    if (!Number.isInteger(version?.version) || numbers.has(version.version)) return false;
    numbers.add(version.version);
    return true;
  });
  const variables = [...new Set((Array.isArray(data.variables) ? data.variables : []).filter((name) => typeof name === 'string' && name))];
  return { ...data, versions, variables };
}
