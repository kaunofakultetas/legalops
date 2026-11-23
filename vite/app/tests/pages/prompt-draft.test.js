// -----------------------------------------------------------
//  [*] Tests — the prompt editor's plain-data helpers
//
//  src/pages/Prompts/promptDraft.js without a screen: the
//  backend's limits the editor mirrors (MAX_TEXT, MODEL_ID —
//  the same pattern as django prompts/api/views.py), the
//  {PLACEHOLDER} scan, a stored version → the draft and back
//  (draftFrom), what counts as an unsaved change (isDirty —
//  the text and the model settings, never the note or the
//  activate box), the validation that gates a save and a
//  draft test run (validateDraft), and readPrompt, the
//  defensive read of GET /api/prompts/{slug} every editor
//  tab keys its lists by. Plus usePromptText, the name and
//  description a prompt shows in the UI language.
//
//  The draft is plain component state: nothing is persisted
//  (no storage key, no restore, no discard) — a reload or a
//  close is the leave guard's job, which prompt-editor.test
//  covers.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { IntlProvider, useSetLocale } from '@/i18n';
import * as f from '../support/backend/fixtures';
import { MAX_TEXT, MODEL_ID, PLACEHOLDER, draftFrom, isDirty, placeholders, readPrompt, validateDraft } from '@/pages/Prompts/promptDraft';
import usePromptText from '@/pages/Prompts/usePromptText';


// The chat prompt's versions: v2 is the admin's active one
// (temperature 0.2, max 4000, a note), v1 and v3 shipped
// defaults (temperature 0.3, no max)
const chat = f.promptDetail('chat.assistant');
const v1 = chat.versions.find((v) => v.version === 1);
const v2 = chat.versions.find((v) => v.version === 2);

// A t() that answers the key and its parameters, so a test
// reads which message validateDraft chose and what it filled
const keyT = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key);

// A valid draft of v2, varied per test
const draftOf = (changes = {}) => ({ ...draftFrom(v2), ...changes });







// -----------------------------------------------------------
// The backend's limits
// -----------------------------------------------------------

describe('MAX_TEXT, MODEL_ID and PLACEHOLDER', () => {

  it('caps the text at the backend\'s 60,000 characters', () => {
    expect(MAX_TEXT).toBe(60_000);
  });


  it('accepts the model ids the backend accepts — a known provider prefix or a bare gateway id', () => {
    for (const id of [
      'gateway:azure/gpt-5.5', 'gateway:azure/gpt-5.6-luna', 'openai:gpt-5', 'anthropic:claude-sonnet-4.5',
      'ollama:llama3.1:8b', 'gpt-5.5', 'azure/gpt-5.6-terra', 'a', `m${'x'.repeat(119)}`,
    ]) {
      expect(MODEL_ID.test(id), id).toBe(true);
    }
  });


  it('refuses ids the backend refuses — blanks, spaces, a leading symbol, other characters, over 120 characters, a trailing ":"', () => {
    for (const id of ['', ' ', 'gpt 5', ' gpt-5', 'gpt-5 ', '-gpt', '/gpt', ':gpt', 'gpt!', 'gpt?x', 'modelis-ž', `m${'x'.repeat(120)}`,
      'gateway:', 'ollama:', 'gpt-5:', 'ollama:llama3.1:']) {
      expect(MODEL_ID.test(id), JSON.stringify(id)).toBe(false);
    }
  });


  it('matches {UPPER_CASE} names only — what the backend\'s render() fills', () => {
    const names = (text) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
    expect(names('{TODAY} {COMPANY_NAME} {A1_B2}')).toEqual(['TODAY', 'COMPANY_NAME', 'A1_B2']);
    expect(names('{today} {1ST} {_X} { TODAY } {TO DAY} {Today}')).toEqual([]);
    expect(names('{{TODAY}}')).toEqual(['TODAY']);
  });
});







// -----------------------------------------------------------
// draftFrom
// -----------------------------------------------------------

describe('draftFrom', () => {

  it('turns a stored version into strings for the inputs, with an empty note and the activate box off', () => {
    expect(draftFrom(v2)).toEqual({ text: v2.text, model: 'gateway:azure/gpt-5.5', temperature: '0.2', maxTokens: '4000', note: '', activate: false });
  });


  it('leaves a setting the version does not pin empty — and keeps a temperature of 0 as "0"', () => {
    expect(draftFrom(v1)).toMatchObject({ temperature: '0.3', maxTokens: '' });
    expect(draftFrom({ ...v1, temperature: 0, maxTokens: null })).toMatchObject({ temperature: '0', maxTokens: '' });
    expect(draftFrom({ ...v1, temperature: undefined })).toMatchObject({ temperature: '' });
  });


  it('starts an empty draft from no version at all', () => {
    const empty = { text: '', model: '', temperature: '', maxTokens: '', note: '', activate: false };
    expect(draftFrom(undefined)).toEqual(empty);
    expect(draftFrom(null)).toEqual(empty);
  });


  it('never lets a non-string text or model into the draft — every field must stay trimmable', () => {
    const draft = draftFrom({ text: 12345, model: { id: 'x' }, temperature: 0.5, maxTokens: 10 });
    expect(draft).toMatchObject({ text: '', model: '', temperature: '0.5', maxTokens: '10' });
    expect(() => validateDraft(draft, keyT)).not.toThrow();
    expect(() => isDirty(draft, { text: 12345 })).not.toThrow();
  });
});







// -----------------------------------------------------------
// isDirty
// -----------------------------------------------------------

describe('isDirty', () => {

  it('a draft straight from its base is clean', () => {
    expect(isDirty(draftFrom(v2), v2)).toBe(false);
  });


  it('an edited text, model, temperature or max tokens makes it dirty', () => {
    expect(isDirty(draftOf({ text: `${v2.text} More.` }), v2)).toBe(true);
    expect(isDirty(draftOf({ model: 'gateway:azure/gpt-5.6-luna' }), v2)).toBe(true);
    expect(isDirty(draftOf({ temperature: '0.3' }), v2)).toBe(true);
    expect(isDirty(draftOf({ temperature: '' }), v2)).toBe(true);
    expect(isDirty(draftOf({ maxTokens: '4001' }), v2)).toBe(true);
  });


  it('the note and the activate box alone are not a change to save', () => {
    expect(isDirty(draftOf({ note: 'Tik pastaba', activate: true }), v2)).toBe(false);
  });


  it('whitespace around a value is not a change — the backend strips the text and the model', () => {
    expect(isDirty(draftOf({ text: `\n  ${v2.text}  \n` }), v2)).toBe(false);
    expect(isDirty(draftOf({ model: '  gateway:azure/gpt-5.5 ' }), v2)).toBe(false);
  });


  it('compares against another base: v2\'s settings differ from v1\'s', () => {
    expect(isDirty(draftFrom(v2), v1)).toBe(true);
    expect(isDirty(draftFrom(v1), v1)).toBe(false);
  });


  it('without a base, anything typed is a change and an empty draft is not', () => {
    expect(isDirty(draftFrom(undefined), undefined)).toBe(false);
    expect(isDirty({ ...draftFrom(undefined), text: 'Naujas tekstas' }, undefined)).toBe(true);
  });
});







// -----------------------------------------------------------
// validateDraft
// -----------------------------------------------------------

describe('validateDraft', () => {

  it('passes a stored version as it is', () => {
    for (const version of chat.versions) {
      expect(validateDraft(draftFrom(version), keyT), `v${version.version}`).toEqual({});
    }
  });


  it('requires a text that is not only whitespace', () => {
    expect(validateDraft(draftOf({ text: '' }), keyT)).toEqual({ text: 'textRequired' });
    expect(validateDraft(draftOf({ text: ' \n\t ' }), keyT)).toEqual({ text: 'textRequired' });
  });


  it('allows exactly 60,000 characters and refuses one more, naming the limit', () => {
    expect(validateDraft(draftOf({ text: 'x'.repeat(60_000) }), keyT)).toEqual({});
    expect(validateDraft(draftOf({ text: 'x'.repeat(60_001) }), keyT)).toEqual({ text: 'tooLong {"max":60000}' });
  });


  it('checks the trimmed model against MODEL_ID', () => {
    expect(validateDraft(draftOf({ model: '  gateway:azure/gpt-5.6-sol  ' }), keyT)).toEqual({});
    expect(validateDraft(draftOf({ model: '' }), keyT)).toEqual({ model: 'modelInvalid' });
    expect(validateDraft(draftOf({ model: 'gpt 5.5' }), keyT)).toEqual({ model: 'modelInvalid' });
  });


  it('takes a temperature from 0 to 2, with a decimal point or a Lithuanian decimal comma', () => {
    for (const temperature of ['', '0', '2', '1.5', '1,5', '0,25', '  0.7  ', '2.0']) {
      expect(validateDraft(draftOf({ temperature }), keyT), temperature).toEqual({});
    }
  });


  it('refuses a temperature above 2, below 0 or not a plain number', () => {
    for (const temperature of ['2.01', '3', '-1', 'abc', '1e0', '1.5.2', '0x1', 'Infinity']) {
      expect(validateDraft(draftOf({ temperature }), keyT), temperature).toEqual({ temperature: 'temperatureInvalid' });
    }
  });


  it('takes max tokens from 1 to 128,000 and refuses anything else', () => {
    for (const maxTokens of ['', '1', '4000', '128000']) {
      expect(validateDraft(draftOf({ maxTokens }), keyT), maxTokens).toEqual({});
    }
    for (const maxTokens of ['0', '128001', '1.5', '-1', 'abc', '1e3']) {
      expect(validateDraft(draftOf({ maxTokens }), keyT), maxTokens).toEqual({ maxTokens: 'maxTokensInvalid' });
    }
  });


  it('reports every broken field at once', () => {
    expect(Object.keys(validateDraft({ text: '', model: '?', temperature: '9', maxTokens: '0', note: '', activate: false }, keyT)))
      .toEqual(['text', 'model', 'temperature', 'maxTokens']);
  });
});







// -----------------------------------------------------------
// placeholders
// -----------------------------------------------------------

describe('placeholders', () => {

  it('lists the distinct {NAME}s in order of first appearance', () => {
    expect(placeholders(v2.text)).toEqual(['WEEKDAY', 'TODAY', 'LEADING_LANGUAGE', 'USER_CONTEXT', 'COMPANY_CONTEXT', 'ROLE_CONTEXT']);
    expect(placeholders('{B} {A} {B} {A} {C}')).toEqual(['B', 'A', 'C']);
  });


  it('answers the same on every call — the global pattern keeps no position between texts', () => {
    expect(placeholders('{TODAY}')).toEqual(['TODAY']);
    expect(placeholders('{TODAY}')).toEqual(['TODAY']);
    expect(placeholders('x {TODAY}')).toEqual(['TODAY']);
  });


  it('finds none in plain text, lowercase names or a non-string', () => {
    expect(placeholders('Be jokių kintamųjų, {vardas}.')).toEqual([]);
    expect(placeholders('')).toEqual([]);
    expect(placeholders(null)).toEqual([]);
  });
});







// -----------------------------------------------------------
// readPrompt
// -----------------------------------------------------------

describe('readPrompt', () => {

  it('passes a well-formed detail through unchanged', () => {
    expect(readPrompt(chat)).toEqual(chat);
  });


  it('keeps each version number once (the first) and drops versions without a whole number', () => {
    const versions = [v2, { ...v2, id: 'dup', text: 'later copy' }, { ...v1, version: '1' }, { ...v1, version: 1.5 }, null, 'v1', { ...v1 }];
    const read = readPrompt({ ...chat, versions });
    expect(read.versions.map((v) => [v.version, v.id])).toEqual([[2, v2.id], [1, v1.id]]);
  });


  it('keeps the declared variables as distinct non-empty names', () => {
    expect(readPrompt({ ...chat, variables: ['TODAY', 'TODAY', '', null, 7, { name: 'X' }, 'LANGUAGE'] }).variables).toEqual(['TODAY', 'LANGUAGE']);
  });


  it('reads missing or non-list versions and variables as none', () => {
    expect(readPrompt({ slug: 'x' })).toEqual({ slug: 'x', versions: [], variables: [] });
    expect(readPrompt({ slug: 'x', versions: {}, variables: 'TODAY' })).toMatchObject({ versions: [], variables: [] });
  });


  it('throws on an answer that is not an object — the query shows its error state instead of an empty editor', () => {
    for (const data of [null, undefined, '', 'unexpected', 42, [], [chat]]) {
      expect(() => readPrompt(data), JSON.stringify(data)).toThrow('The prompt answer is not an object');
    }
  });
});







// -----------------------------------------------------------
// usePromptText
// -----------------------------------------------------------

describe('usePromptText', () => {

  const wrapper = ({ children }) => createElement(IntlProvider, null, children);
  const prompt = (slug) => f.prompts.find((row) => row.slug === slug);


  it('names the shipped prompts from the translations, dotted slugs as nested keys', () => {
    const { result } = renderHook(() => usePromptText(), { wrapper });
    expect(result.current.name(prompt('chat.assistant'))).toBe('Chat assistant');
    expect(result.current.name(prompt('report.gap_analysis'))).toBe('Gap analysis');
    expect(result.current.description(prompt('report.summary'))).toMatch(/^Writes the report title and the executive summary/);
  });


  it('keeps the API\'s name and description for a prompt the table does not know', () => {
    const { result } = renderHook(() => usePromptText(), { wrapper });
    const novel = { slug: 'report.new_step', name: 'New step', description: 'Does something new.' };
    expect(result.current.name(novel)).toBe('New step');
    expect(result.current.description(novel)).toBe('Does something new.');
  });


  it('never answers a whole group of the table for a slug that names one', () => {
    const { result } = renderHook(() => usePromptText(), { wrapper });
    expect(result.current.name({ slug: 'report', name: 'Report group' })).toBe('Report group');
    expect(result.current.description({ slug: 'chat', description: 'Chat group' })).toBe('Chat group');
  });


  it('speaks Lithuanian, and follows a language switch', () => {
    document.cookie = 'locale=lt; path=/';
    const { result } = renderHook(() => ({ text: usePromptText(), setLocale: useSetLocale() }), { wrapper });
    expect(result.current.text.name(prompt('chat.assistant'))).toBe('Pokalbių asistentas');
    expect(result.current.text.name(prompt('report.summary'))).toBe('Vadovybės santrauka');
    act(() => { result.current.setLocale('en'); });
    expect(result.current.text.name(prompt('report.summary'))).toBe('Executive summary');
  });
});
