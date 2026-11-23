// -----------------------------------------------------------
//  [*] Tests — Chat runtime (history, the turn, stop, the
//      status watcher, attachments, the composer)
//
//  Everything ChatRuntime.jsx wires between assistant-ui and
//  the stack, driven through the page as a user drives it:
//
//    - the pure helpers it exports for this file —
//      readableRows, isEmptyReply, toRepository, slimMessage;
//    - the history (GET /api/chat/threads/:id/messages):
//      decoding, legacy empty replies dropped, a missing
//      parent, branches and the version picker, the stored
//      reply notes, document chips (the data-document part
//      and the legacy attachment line), user text never read
//      as markdown, broken rows skipped, a failed load;
//    - the turn: the exact slim body POSTed to
//      /api/assistant/chat (id, trigger, messageId, message,
//      parentId, locale — never the history), the bearer
//      header, the new thread created first, the user message
//      appended to Django (only user messages), the reply
//      streaming in word by word (a stream the test writes),
//      the live region, suggestions, regenerate, edit, copy;
//    - stop: the stop route, the partial reply kept with its
//      note, Escape, a stop before the first word;
//    - the status watcher when a conversation reopens with
//      its last message the user's: still running → polled
//      until the reply is stored; not running → "no answer"
//      and a button that generates one;
//    - attachments: the picker (CHAT_ACCEPT), drop, paste,
//      the documents tab's types (an .htm page, a Word file
//      known by its MIME type alone),
//      the multipart upload, the progress state, the chip,
//      the data-document part sent, a failed upload,
//      removing (DELETE /api/documents/:id); the refusals —
//      a file over 50 MB or of a type nobody accepts, picked
//      ("All files"), dropped or pasted, never uploaded and
//      never silent: named with the reason in the banner
//      ("Not attached"), one notice for a mixed batch, a
//      file named once, cleared by the next question, both
//      languages — and the limit in the attach button's
//      description and the drop overlay; a message sent
//      while its upload runs (it waits and carries the
//      document), after an upload failed (no id-less part),
//      a chip removed mid-upload (its document deleted once
//      it exists);
//    - the composer: Enter vs Shift+Enter, empty input, Enter
//      a no-op while answering (no second send, no line
//      break — Shift+Enter still breaks it), nothing taken
//      before the history is in (and "loading the
//      conversation"), the AI notice, autofocus;
//    - the inline editor: Enter held while answering like
//      the composer (Shift+Enter and an IME's Enter pass,
//      in both inputs), a pasted file never attached — no
//      upload, no document part sent with the edit — and the
//      documents the message carries as the composer's chips
//      ("stays with the message"), sent with the edit, or
//      left out of it when removed (nothing deleted: the
//      original version keeps them);
//    - both languages, and the backend contract matrices of
//      the history and of GET /api/assistant/chat/:id/status.
//
//  The stream fakes follow assistant/app/routes/chat.js and
//  llm/stream.js (tests/support/chat.js).
// -----------------------------------------------------------

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { given, server, url } from '../support/backend/server';
import { describeEndpointContract, VARIANTS, expectNoCrash, settle } from '../support/backend/contract';
import { mediaQueryMatches } from '../support/setup';
import * as f from '../support/backend/fixtures';
import {
  assistantRow, composer, dropFiles, fakeFile, givenChatStream, historyRow, holdUploads, openChatStream, oversizedFile,
  pasteFiles, pickFiles, renderChat, resetChatLayout, sendMessage, textReply, userRow,
} from '../support/chat';
import { isEmptyReply, readableRows, slimMessage, toRepository } from '@/pages/Chat/ChatRuntime';


afterEach(() => {
  resetChatLayout();
  mediaQueryMatches('(hover: hover)', false);
});


// The licence conversation and its stored exchange
const LICENCE = f.thread(f.ID.licenceThread);
const LICENCE_QUESTION = 'Kokio leidimo reikia UAB Pavyzdys, jei ji saugo klientų kriptoturtą?';
const LICENCE_REPLY = /kriptoturto paslaugų teikėjo leidimo/;

// What the assistant accepts as a message id (services/
// transcript.js MESSAGE_ID)
const MESSAGE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

// constants/uploads.js CHAT_ACCEPT, as the file picker gets
// it — a copy, so a change to it shows up here: the
// documents tab's extensions, then their MIME types
const ACCEPTED_FILES = '.pdf,.docx,.txt,.md,.html,.htm,.csv,.json,application/pdf,'
  + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,text/csv,application/json';

// The refusals as the banner words them (utils/files.js)
const NOT_ACCEPTED = '— not an accepted file type (accepted: .pdf, .docx, .txt, .md, .html, .htm, .csv, .json)';

// The Word document's MIME type — what a clipboard names a
// .docx by
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// A question that carries two documents, and its reply — the
// message the inline editor takes over with its chips
const POLICY = { id: f.ID.policyDoc, title: 'Atitikties politika', kind: 'policy', charCount: 12345, extractionStatus: 'done' };
const REGISTER = { id: f.ID.registerDoc, title: 'IRT incidentų registras', kind: 'register', charCount: 247, extractionStatus: 'done' };
const CARRYING = [
  userRow('msg-u-1', 'Peržiūrėk dokumentus', null, [{ type: 'data-document', data: POLICY }, { type: 'data-document', data: REGISTER }]),
  assistantRow('srv-1', 'Perskaičiau abu.', 'msg-u-1'),
];
const TOO_LARGE = '— file too large (at most 50 MB)';

// The status line of a reopened conversation
const PENDING = 'The answer is still being written on the server — it will appear when it is done.';
const MISSING = 'This message has no answer.';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// bubbles: the conversation as the user reads it, top to
// bottom — "you: …" / "ai: …" with the bubble's text (the
// message roots carry data-testid, the only handle a whole
// bubble has). openLicence: the licence conversation, its
// reply on screen; newChat: "/", the list loaded.
// uploadAnswer: the upload's 201 row for a file (a fresh id
// per file). chipRemove: an attachment chip's remove button,
// which names the file.
// -----------------------------------------------------------

// The avatar ("AI", aria-hidden) and the spoken "You:" /
// "Assistant:" prefix open every bubble's text
const bubbles = () => [...document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')]
  .map((node) => `${node.dataset.testid === 'user-message' ? 'you' : 'ai'}: ${node.textContent.replace(/^(AI)?(You|Assistant):/, '').trim()}`);

const openLicence = async (options = {}) => {
  const view = renderChat({ route: `/chat/${f.ID.licenceThread}`, ...options });
  await screen.findByText(LICENCE_REPLY);
  return view;
};

const newChat = async (options = {}) => {
  const view = renderChat(options);
  await screen.findByRole('button', { name: `${options.locale === 'lt' ? 'Pašalinti pokalbį' : 'Remove conversation'}: ${LICENCE.title}` });
  return view;
};

let uploadCount = 0;
const uploadAnswer = (name, extra = {}) => {
  uploadCount += 1;
  return {
    ...f.NEW.document,
    id: `c3000000-0000-4000-8000-0000000001${String(uploadCount).padStart(2, '0')}`,
    title: name,
    charCount: 12345,
    ...extra,
  };
};

const chipRemove = (name) => screen.getByRole('button', { name: `Remove “${name}”` });

// Waits for the open conversation's title in the header
const opened = async (name) => {
  await waitFor(() => expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toHaveTextContent(name));
};







// -----------------------------------------------------------
// The pure helpers
// -----------------------------------------------------------
//
// readableRows, isEmptyReply, toRepository, slimMessage —
// exported by ChatRuntime.jsx for these tests.
// -----------------------------------------------------------

describe('readableRows', () => {

  it('keeps the rows that are messages, as they are', () => {
    const rows = f.threadMessages(f.ID.licenceThread);
    expect(readableRows(rows)).toEqual(rows);
  });


  it('answers nothing for an answer that is not a list', () => {
    for (const data of [null, undefined, 'x', 42, {}, { messages: [] }]) expect(readableRows(data)).toEqual([]);
  });


  it('skips rows without a string id, without a message, with a role the chat does not show, or without a parts list', () => {
    const good = userRow('msg-good', 'Labas');
    const rows = [
      null, 'row', {},
      { ...good, id: 12 }, { ...good, id: '' },
      { ...good, content: null }, { ...good, content: 'text' },
      { ...good, content: { role: 'system', parts: [] } },
      { ...good, content: { role: 'user', parts: 'x' } },
      good,
    ];
    expect(readableRows(rows)).toEqual([good]);
  });


  it('keeps the first of two rows with the same id', () => {
    const first = userRow('msg-1', 'Pirmas');
    expect(readableRows([first, userRow('msg-1', 'Antras')])).toEqual([first]);
  });


  it('drops the parts no renderer can read and normalises a broken parent', () => {
    const row = historyRow('srv-9', {
      role: 'assistant',
      parts: [null, 'x', { text: 'no type' }, { type: 'text', text: 42 }, { type: 'text', text: 'Gerai.' }, { type: 'step-start' }],
    }, 12345);
    expect(readableRows([row])).toEqual([{
      ...row, parent_id: null, content: { role: 'assistant', parts: [{ type: 'text', text: 'Gerai.' }, { type: 'step-start' }] },
    }]);
  });
});


describe('isEmptyReply', () => {

  it('is true for an assistant message with no visible text and no tool call', () => {
    expect(isEmptyReply({ role: 'assistant', parts: [] })).toBe(true);
    expect(isEmptyReply({ role: 'assistant', parts: [{ type: 'step-start' }, { type: 'text', text: '  \n ' }] })).toBe(true);
    expect(isEmptyReply({ role: 'assistant', parts: [{ type: 'reasoning', text: 'thinking' }] })).toBe(true);
    expect(isEmptyReply({ role: 'assistant' })).toBe(true);
    expect(isEmptyReply({ role: 'assistant', parts: 'x' })).toBe(true);
  });


  it('is false for a reply with text or with a tool call, and for anything not a reply', () => {
    expect(isEmptyReply({ role: 'assistant', parts: [{ type: 'text', text: 'Taip.' }] })).toBe(false);
    expect(isEmptyReply({ role: 'assistant', parts: [{ type: 'tool-getCompany', toolCallId: 'c1', state: 'output-available' }] })).toBe(false);
    expect(isEmptyReply({ role: 'user', parts: [] })).toBe(false);
    expect(isEmptyReply(null)).toBe(false);
    expect(isEmptyReply(undefined)).toBe(false);
  });


  it('does not trip over a text part whose text is not a string', () => {
    expect(isEmptyReply({ role: 'assistant', parts: [{ type: 'text', text: 42 }] })).toBe(true);
  });
});


describe('toRepository', () => {

  const item = (id, role, parentId, parts = [{ type: 'text', text: id }]) => ({ parentId, message: { id, role, parts } });


  it('keeps the chain and heads it with the newest message', () => {
    const items = [item('u1', 'user', null), item('a1', 'assistant', 'u1'), item('u2', 'user', 'a1'), item('a2', 'assistant', 'u2')];
    expect(toRepository(items)).toEqual({ headId: 'a2', messages: items });
  });


  it('drops an empty legacy reply and hangs its child under the reply\'s parent', () => {
    const items = [item('u1', 'user', null), item('a1', 'assistant', 'u1', [{ type: 'step-start' }]), item('u2', 'user', 'a1')];
    expect(toRepository(items)).toEqual({ headId: 'u2', messages: [items[0], { ...items[2], parentId: 'u1' }] });
  });


  it('follows a chain of dropped replies to the first kept ancestor', () => {
    const items = [
      item('u1', 'user', null), item('a1', 'assistant', 'u1', []), item('a2', 'assistant', 'a1', []), item('u2', 'user', 'a2'),
    ];
    expect(toRepository(items).messages.map((m) => [m.message.id, m.parentId])).toEqual([['u1', null], ['u2', 'u1']]);
  });


  it('hangs a message whose parent was never stored under the message stored before it', () => {
    const items = [item('u1', 'user', null), item('a1', 'assistant', 'u1'), item('u2', 'user', 'lost'), item('a2', 'assistant', 'u2')];
    expect(toRepository(items).messages.map((m) => [m.message.id, m.parentId])).toEqual([
      ['u1', null], ['a1', 'u1'], ['u2', 'a1'], ['a2', 'u2'],
    ]);
  });


  it('is empty, headless, for no items or only empty replies', () => {
    expect(toRepository([])).toEqual({ headId: null, messages: [] });
    expect(toRepository([item('a1', 'assistant', null, [])])).toEqual({ headId: null, messages: [] });
  });


  it('a first message that claims a parent that is not stored becomes a root', () => {
    expect(toRepository([item('u1', 'user', 'nowhere')]).messages[0].parentId).toBeNull();
  });
});


describe('slimMessage', () => {

  it('keeps the id, the role, the text and document parts (only their fields) and the metadata', () => {
    const message = {
      id: 'msg-1', role: 'user', metadata: { custom: {} },
      parts: [
        { type: 'text', text: 'Labas', state: 'done', providerMetadata: { x: 1 } },
        { type: 'data-document', id: 'part-1', data: { id: 'doc-1', title: 'Politika.pdf' } },
        { type: 'file', url: 'http://internal/secret', mediaType: 'application/pdf' },
        { type: 'reasoning', text: 'hm' },
        { type: 'tool-getCompany', toolCallId: 'c1' },
        null,
      ],
    };
    expect(slimMessage(message)).toEqual({
      id: 'msg-1', role: 'user', metadata: { custom: {} },
      parts: [{ type: 'text', text: 'Labas' }, { type: 'data-document', data: { id: 'doc-1', title: 'Politika.pdf' } }],
    });
  });


  it('leaves the metadata out when there is none, and survives nothing at all', () => {
    expect(slimMessage({ id: 'm', role: 'user', parts: [] })).toEqual({ id: 'm', role: 'user', parts: [] });
    expect(slimMessage(undefined)).toEqual({ id: undefined, role: undefined, parts: [] });
  });
});







// -----------------------------------------------------------
// The history
// -----------------------------------------------------------
//
// GET /api/chat/threads/:id/messages decoded into bubbles.
// -----------------------------------------------------------

describe('the history', () => {

  it('loads the conversation from GET …/messages and shows it in order: the question, then the reply with its tool card', async () => {
    const calls = given.capture('get', '/api/chat/threads/:threadId/messages', f.threadMessages(f.ID.licenceThread));
    await openLicence();
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([`/api/chat/threads/${f.ID.licenceThread}/messages`]);
    const [question, reply] = bubbles();
    expect(question).toBe(`you: ${LICENCE_QUESTION}`);
    expect(reply).toMatch(/^ai: Searching the legal acts·doneMiCA 59 str\. 1 d\.UAB Pavyzdys saugo ir administruoja kriptoturtą/);
    // The reply's markdown: bold as <strong>
    expect(screen.getByText('kriptoturto paslaugų teikėjo leidimo').tagName).toBe('STRONG');
  });


  it('drops a legacy empty reply — no empty bubble — and continues the conversation under it', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Pirmas klausimas'),
      assistantRow('srv-empty', [{ type: 'step-start' }], 'msg-u-1'),
      userRow('msg-u-2', 'Antras klausimas', 'srv-empty'),
      assistantRow('srv-2', 'Antras atsakymas.', 'msg-u-2'),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Antras atsakymas.');
    expect(bubbles()).toEqual(['you: Pirmas klausimas', 'you: Antras klausimas', 'ai: Antras atsakymas.']);
  });


  it('a question whose reply failed to persist hangs under the message before it — the rest of the conversation is not hidden', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Pirmas'),
      userRow('msg-u-2', 'Antras', 'srv-never-stored'),
      assistantRow('srv-2', 'Antras atsakymas.', 'msg-u-2'),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Antras atsakymas.');
    expect(bubbles()).toEqual(['you: Pirmas', 'you: Antras', 'ai: Antras atsakymas.']);
  });


  it('opens the newest branch of an edited conversation and lets the user page back through the versions', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Senas klausimas'),
      assistantRow('srv-1', 'Senas atsakymas.', 'msg-u-1'),
      userRow('msg-u-2', 'Naujas klausimas'),
      assistantRow('srv-2', 'Naujas atsakymas.', 'msg-u-2'),
    ]);
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Naujas atsakymas.');
    expect(bubbles()).toEqual(['you: Naujas klausimas2 / 2', 'ai: Naujas atsakymas.']);
    await user.click(screen.getByRole('button', { name: 'Previous version' }));
    await screen.findByText('Senas atsakymas.');
    expect(bubbles()).toEqual(['you: Senas klausimas1 / 2', 'ai: Senas atsakymas.']);
    await user.click(screen.getByRole('button', { name: 'Next version' }));
    expect(await screen.findByText('Naujas atsakymas.')).toBeInTheDocument();
  });


  for (const [status, note] of [
    ['stopped', 'The answer was stopped.'],
    ['interrupted', 'The answer was interrupted — the server restarted. You can regenerate it.'],
    ['timeout', 'The answer was cut off — it took too long.'],
    ['error', 'The answer was cut off by an error.'],
    ['budget', 'No answer — the AI service budget is exhausted.'],
  ]) {
    it(`a stored reply with status "${status}" carries its note: "${note}"`, async () => {
      given.json('get', '/api/chat/threads/:threadId/messages', [
        userRow('msg-u-1', 'Klausimas'),
        assistantRow('srv-1', 'Dalinis atsakymas', 'msg-u-1', { status }),
      ]);
      renderChat({ route: `/chat/${f.ID.licenceThread}` });
      await screen.findByText('Dalinis atsakymas');
      expect(within(screen.getByTestId('assistant-message')).getByText(note)).toBeInTheDocument();
    });
  }


  it('a stored reply with an unknown status carries no note', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Klausimas'),
      assistantRow('srv-1', 'Atsakymas.', 'msg-u-1', { status: 'weird' }),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Atsakymas.');
    expect(bubbles()).toEqual(['you: Klausimas', 'ai: Atsakymas.']);
  });


  it('a document part is a chip with its title and size (grouped the English way) — never its id', async () => {
    const doc = { id: f.ID.policyDoc, title: 'Atitikties politika', kind: 'policy', charCount: 12345, extractionStatus: 'done' };
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Peržiūrėk politiką', null, [{ type: 'data-document', data: doc }]),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const bubble = await screen.findByTestId('user-message');
    await waitFor(() => expect(bubble).toHaveTextContent('Document:Atitikties politika· 12,345 chars'));
    expect(bubble.textContent).not.toContain(f.ID.policyDoc);
  });


  it('the chip reads the size the Lithuanian way in Lithuanian, and says when no text was extracted', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Dokumentai', null, [
        { type: 'data-document', data: { id: 'doc-1', title: 'Politika', charCount: 12345, extractionStatus: 'done' } },
        { type: 'data-document', data: { id: 'doc-2', title: 'Skenuota kopija', charCount: 0, extractionStatus: 'empty' } },
      ]),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}`, locale: 'lt' });
    const bubble = await screen.findByTestId('user-message');
    await waitFor(() => expect(bubble).toHaveTextContent('Dokumentas:Politika· 12 345 simb.'));
    expect(bubble).toHaveTextContent('Dokumentas:Skenuota kopija· tekstas neišgautas');
  });


  it('an old attachment line in a user message shows as a chip too', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', `Įkėliau dokumentą: "Rizikos politika.pdf" (document id ${f.ID.policyDoc}; 1234 characters extracted).`),
      userRow('msg-u-2', 'I attached a document: "Scan.pdf" (document id doc-2; no text).', 'msg-u-1'),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await waitFor(() => expect(bubbles()).toHaveLength(2));
    expect(bubbles()).toEqual([
      'you: Document:Rizikos politika.pdf· 1,234 chars',
      'you: Document:Scan.pdf· no text extracted',
    ]);
  });


  it('user text keeps its line breaks and is never read as markdown', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [userRow('msg-u-1', '**ne paryškinta**\nantra eilutė')]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const bubble = await screen.findByTestId('user-message');
    await waitFor(() => expect(bubble).toHaveTextContent('**ne paryškinta**'));
    expect(within(bubble).queryByText('ne paryškinta', { selector: 'strong' })).toBeNull();
    expect(within(bubble).getByText(/antra eilutė/).textContent).toBe('**ne paryškinta**\nantra eilutė');
  });


  it('skips history rows that are not messages and shows the rest', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      null, { id: 'x' }, historyRow('srv-sys', { role: 'system', parts: [{ type: 'text', text: 'Slapta instrukcija' }] }),
      userRow('msg-u-1', 'Tikras klausimas'),
      historyRow('srv-bad', { role: 'assistant', parts: [{ type: 'text', text: 7 }] }, 'msg-u-1'),
      assistantRow('srv-1', 'Tikras atsakymas.', 'msg-u-1'),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Tikras atsakymas.');
    expect(screen.queryByText('Slapta instrukcija')).toBeNull();
    expectNoCrash();
  });


  it('an empty history is the welcome state', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', []);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await opened(LICENCE.title);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeInTheDocument());
    expect(bubbles()).toEqual([]);
  });


  it('a failed history load shows the translated failure in the banner — not wiped by the switch that opened the thread', async () => {
    given.apiError('get', '/api/chat/threads/:threadId/messages', 'SERVER_ERROR', { status: 500 });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    expect(await screen.findByRole('alert')).toHaveTextContent('Chat error: Server error. Try again later.');
    await settle(200);
    expect(screen.getByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(bubbles()).toEqual([]);
  });


  it('a history that is gone (404) loads empty and silently — the thread itself was found', async () => {
    given.apiError('get', '/api/chat/threads/:threadId/messages', 'NOT_FOUND', { status: 404 });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await opened(LICENCE.title);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeInTheDocument());
    await settle(100);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// The turn
// -----------------------------------------------------------
//
// What is sent (the slim body, the headers, the append),
// how the answer arrives, and the actions on messages.
// -----------------------------------------------------------

describe('the turn', () => {

  it('POSTs the slim body to /api/assistant/chat: the thread, the trigger, the new message, its parent and the UI locale — never the history', async () => {
    const turns = givenChatStream(textReply('Taip, reikia.'));
    const { user } = await openLicence();
    await sendMessage(user, 'Ar reikia licencijos?');
    expect(await screen.findByText('Taip, reikia.')).toBeInTheDocument();

    expect(turns).toHaveLength(1);
    const { body, headers } = turns[0];
    expect(body).toEqual({
      id: f.ID.licenceThread,
      trigger: 'submit-message',
      messageId: null,
      message: { id: expect.stringMatching(MESSAGE_ID), role: 'user', parts: [{ type: 'text', text: 'Ar reikia licencijos?' }], metadata: { custom: {} } },
      parentId: f.ID.answer1,
      locale: 'en',
    });
    expect(body).not.toHaveProperty('messages');
    expect(headers.authorization).toBe('Bearer test-token');
    expect(headers['content-type']).toBe('application/json');
    expect(new URL(turns[0].url).pathname).toBe('/api/assistant/chat');
  });


  it('a new conversation is created first (POST /api/chat/threads {}), its id is the one sent, and the question has no parent', async () => {
    const creates = given.capture('post', '/api/chat/threads', f.NEW.thread, { status: 201 });
    const turns = givenChatStream(textReply('Labas!'));
    const { user } = await newChat();
    await sendMessage(user, 'Labas');
    await screen.findByText('Labas!');
    expect(creates.map((call) => call.body)).toEqual([{}]);
    expect(turns[0].body).toMatchObject({ id: f.ID.newThread, trigger: 'submit-message', parentId: null });
  });


  it('sends locale "lt" from the Lithuanian UI — it decides the answer\'s language', async () => {
    const turns = givenChatStream(textReply('Labas!'));
    const { user } = await newChat({ locale: 'lt' });
    await sendMessage(user, 'Labas', { locale: 'lt' });
    await screen.findByText('Labas!');
    expect(turns[0].body.locale).toBe('lt');
  });


  it('appends the question to Django (POST …/messages in assistant-ui\'s row format) — and never the reply', async () => {
    const appends = given.capture('post', '/api/chat/threads/:threadId/messages', { ok: true, created: false });
    const turns = givenChatStream(textReply('Taip.'));
    const { user } = await openLicence();
    await sendMessage(user, 'Ar tikrai?');
    await screen.findByText('Taip.');
    await settle(200);
    expect(appends).toHaveLength(1);
    expect(new URL(appends[0].url).pathname).toBe(`/api/chat/threads/${f.ID.licenceThread}/messages`);
    expect(appends[0].body).toEqual({
      id: turns[0].body.message.id,
      parent_id: f.ID.answer1,
      format: 'ai-sdk/v6',
      content: { role: 'user', parts: [{ type: 'text', text: 'Ar tikrai?' }], metadata: { custom: {} } },
    });
  });


  it('a failed append says so in the banner (the turn itself goes on)', async () => {
    given.apiError('post', '/api/chat/threads/:threadId/messages', 'SERVER_ERROR', { status: 500 });
    givenChatStream(textReply('Vis tiek atsakau.'));
    const { user } = await openLicence();
    await sendMessage(user, 'Klausimas');
    expect(await screen.findByText('Vis tiek atsakau.')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error. Try again later.');
  });


  it('the answer streams in word by word, with the dots before the first word and the live region announcing it', async () => {
    const turn = openChatStream();
    const { user } = await newChat();
    await sendMessage(user, 'Kas yra MiCA?');
    await turn.requested();
    expect(await screen.findByRole('status', { name: 'The assistant is writing' })).toBeInTheDocument();
    expect(screen.getByText('The assistant is writing an answer…')).toBeInTheDocument();

    await turn.write({ type: 'start', messageId: 'srv-stream-1' }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'MiCA yra ' });
    expect(await screen.findByText('MiCA yra')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'The assistant is writing' })).toBeNull();

    await turn.write({ type: 'text-delta', id: 'txt-0', delta: 'kriptoturto rinkų ' });
    expect(await screen.findByText('MiCA yra kriptoturto rinkų')).toBeInTheDocument();

    await turn.write({ type: 'text-delta', id: 'txt-0', delta: '**reglamentas**.' }, { type: 'text-end', id: 'txt-0' },
      { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' });
    await turn.end();
    expect(await screen.findByText('reglamentas')).toHaveProperty('tagName', 'STRONG');
    expect(await screen.findByText('The assistant\'s answer arrived.')).toBeInTheDocument();
  });


  it('shows the stop button instead of send while the answer is written, and send again after it', async () => {
    const turn = openChatStream();
    const { user } = await newChat();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    await sendMessage(user, 'Labas');
    await turn.requested();
    expect(await screen.findByRole('button', { name: 'Stop the answer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    await turn.write(...textReply('Labas.'));
    await turn.end();
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop the answer' })).toBeNull();
  });


  it('a second question hangs under the first reply (parentId = the reply\'s id)', async () => {
    const turns = givenChatStream((body, i) => textReply(`Atsakymas ${i + 1}.`, { messageId: `srv-turn-${i + 1}` }));
    const { user } = await newChat();
    await sendMessage(user, 'Pirmas');
    await screen.findByText('Atsakymas 1.');
    await sendMessage(user, 'Antras');
    await screen.findByText('Atsakymas 2.');
    expect(turns.map((turn) => turn.body.parentId)).toEqual([null, 'srv-turn-1']);
    expect(turns[1].body.message.parts).toEqual([{ type: 'text', text: 'Antras' }]);
    expect(bubbles()).toEqual(['you: Pirmas', 'ai: Atsakymas 1.', 'you: Antras', 'ai: Atsakymas 2.']);
  });


  it('a welcome suggestion is sent at once', async () => {
    const turns = givenChatStream(textReply('Vertinu.'));
    const { user } = await newChat();
    await user.click(screen.getByRole('button', { name: "Assess 1009 LTD's compliance with MiCA and DORA." }));
    await screen.findByText('Vertinu.');
    expect(turns[0].body.message.parts).toEqual([{ type: 'text', text: "Assess 1009 LTD's compliance with MiCA and DORA." }]);
  });


  it('regenerate asks the same question again (trigger regenerate-message) and keeps both answers as versions', async () => {
    const turns = givenChatStream(textReply('Naujas atsakymas.'));
    const { user } = await openLicence();
    await user.click(screen.getByRole('button', { name: 'Regenerate the answer' }));
    await screen.findByText('Naujas atsakymas.');
    expect(turns[0].body).toMatchObject({
      id: f.ID.licenceThread, trigger: 'regenerate-message', parentId: null,
      message: { id: f.ID.question1, role: 'user', parts: [{ type: 'text', text: LICENCE_QUESTION }] },
    });
    const reply = screen.getByTestId('assistant-message');
    expect(reply).toHaveTextContent('2 / 2');
    await user.click(within(reply).getByRole('button', { name: 'Previous version' }));
    expect(await screen.findByText(LICENCE_REPLY)).toBeInTheDocument();
  });


  it('editing a question sends it as a new branch from the same parent', async () => {
    const turns = givenChatStream(textReply('Atsakymas į pakeistą.'));
    const { user } = await openLicence();
    await user.click(screen.getByRole('button', { name: 'Edit the message' }));
    const editor = await screen.findByRole('textbox', { name: 'Message being edited' });
    expect(editor).toHaveValue(LICENCE_QUESTION);
    await user.clear(editor);
    await user.type(editor, 'Pakeistas klausimas');
    await user.click(screen.getByRole('button', { name: 'Send edited' }));
    await screen.findByText('Atsakymas į pakeistą.');
    expect(turns[0].body).toMatchObject({ trigger: 'submit-message', parentId: null, message: { parts: [{ type: 'text', text: 'Pakeistas klausimas' }] } });
    expect(screen.getByTestId('user-message')).toHaveTextContent('Pakeistas klausimas2 / 2');
  });


  it('cancelling an edit changes nothing and sends nothing', async () => {
    const turns = givenChatStream(textReply('x'));
    const { user } = await openLicence();
    await user.click(screen.getByRole('button', { name: 'Edit the message' }));
    await user.type(await screen.findByRole('textbox', { name: 'Message being edited' }), ' papildymas');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Message being edited' })).toBeNull());
    expect(screen.getByTestId('user-message')).toHaveTextContent(LICENCE_QUESTION);
    expect(turns).toHaveLength(0);
  });


  it('offers "Scroll to the latest message", idle while the view is at the bottom', async () => {
    await openLicence();
    expect(screen.getByRole('button', { name: 'Scroll to the latest message' })).toBeDisabled();
  });


  it('copy puts the reply\'s text on the clipboard', async () => {
    const { user } = await openLicence();
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copy the answer' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0][0]).toMatch(/^UAB Pavyzdys saugo ir administruoja kriptoturtą klientų vardu/);
  });


  it('speaks Lithuanian on the message actions', async () => {
    await openLicence({ locale: 'lt' });
    for (const name of ['Redaguoti žinutę', 'Kopijuoti atsakymą', 'Generuoti atsakymą iš naujo']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId('user-message')).toHaveTextContent(/^Jūs:/);
    expect(screen.getByTestId('assistant-message')).toHaveTextContent('Asistentas:');
  });
});







// -----------------------------------------------------------
// Stop
// -----------------------------------------------------------
//
// The stop button aborts the answer AND tells the server
// (closing the connection alone no longer stops a turn);
// the partial reply stays, with its note.
// -----------------------------------------------------------

describe('stop', () => {

  const halfAnswer = async () => {
    const stops = given.capture('post', '/api/assistant/chat/:threadId/stop', { stopped: true });
    const turn = openChatStream();
    const view = await newChat();
    await sendMessage(view.user, 'Parašyk ilgą atsakymą');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-stop-1' }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Pradžia be pabaigos' });
    await screen.findByText('Pradžia be pabaigos');
    return { ...view, turn, stops };
  };


  it('the stop button aborts the answer, calls POST /api/assistant/chat/:id/stop and keeps the partial reply with its note', async () => {
    const { user, turn, stops } = await halfAnswer();
    await user.click(screen.getByRole('button', { name: 'Stop the answer' }));
    await waitFor(() => expect(stops).toHaveLength(1));
    expect(new URL(stops[0].url).pathname).toBe(`/api/assistant/chat/${f.ID.newThread}/stop`);
    expect(turn.aborted).toBe(true);
    const reply = screen.getByTestId('assistant-message');
    expect(within(reply).getByText('Pradžia be pabaigos')).toBeInTheDocument();
    expect(await within(reply).findByText('The answer was stopped.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('Escape in the composer stops it the same way', async () => {
    const { user, stops } = await halfAnswer();
    await user.click(composer());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(stops).toHaveLength(1));
    expect(await screen.findByText('The answer was stopped.')).toBeInTheDocument();
  });


  it('a stop before the first word leaves no empty bubble — only the note', async () => {
    const stops = given.capture('post', '/api/assistant/chat/:threadId/stop', { stopped: true });
    const turn = openChatStream();
    const { user } = await newChat();
    await sendMessage(user, 'Labas');
    await turn.requested();
    await screen.findByRole('status', { name: 'The assistant is writing' });
    await user.click(screen.getByRole('button', { name: 'Stop the answer' }));
    await waitFor(() => expect(stops).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('status', { name: 'The assistant is writing' })).toBeNull());
    expect(bubbles().filter((bubble) => bubble.startsWith('ai:')).every((bubble) => !/Pradžia/.test(bubble))).toBe(true);
  });


  it('a stop route that fails changes nothing the user sees', async () => {
    given.apiError('post', '/api/assistant/chat/:threadId/stop', 'SERVER_ERROR', { status: 500 });
    const turn = openChatStream();
    const { user } = await newChat();
    await sendMessage(user, 'Labas');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-stop-2' }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Dalis' });
    await screen.findByText('Dalis');
    await user.click(screen.getByRole('button', { name: 'Stop the answer' }));
    expect(await screen.findByText('The answer was stopped.')).toBeInTheDocument();
    await settle(100);
    expect(screen.queryByText('Server error. Try again later.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('says so in Lithuanian', async () => {
    given.capture('post', '/api/assistant/chat/:threadId/stop', { stopped: true });
    const turn = openChatStream();
    const { user } = await newChat({ locale: 'lt' });
    await sendMessage(user, 'Labas', { locale: 'lt' });
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-stop-lt' }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Dalis' });
    await user.click(await screen.findByRole('button', { name: 'Stabdyti atsakymą' }));
    expect(await screen.findByText('Atsakymas sustabdytas.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Reopening a conversation whose last message is the user's
// -----------------------------------------------------------
//
// ReplyWatcher asks GET /api/assistant/chat/:id/status: a
// turn still running is polled (every 2.5 s) and the thread
// reloaded when its reply is stored; none running → "no
// answer" and a button that generates one.
// -----------------------------------------------------------

describe('reopening a conversation whose last message is the user\'s', () => {

  const unanswered = [userRow('msg-u-7', 'Klausimas, į kurį dar atsakoma')];


  it('asks whether the turn still runs; it does → "still being written", polled until the reply is stored, then the reply shows', async () => {
    given.sequence('get', '/api/chat/threads/:threadId/messages', [
      { body: unanswered },
      { body: [...unanswered, assistantRow('srv-7', 'Atsakymas, kurį serveris baigė.', 'msg-u-7')] },
    ]);
    const statuses = given.capture('get', '/api/assistant/chat/:threadId/status', { running: true, startedAt: f.NOW });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const line = await screen.findByText(PENDING);
    expect(line.closest('[role="status"]')).not.toBeNull();
    expect(new URL(statuses[0].url).pathname).toBe(`/api/assistant/chat/${f.ID.licenceThread}/status`);

    given.json('get', '/api/assistant/chat/:threadId/status', f.chatStatus);
    expect(await screen.findByText('Atsakymas, kurį serveris baigė.', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(PENDING)).toBeNull());
    expect(screen.queryByText(MISSING)).toBeNull();
  });


  it('keeps polling while the turn runs', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', unanswered);
    const statuses = given.capture('get', '/api/assistant/chat/:threadId/status', { running: true, startedAt: f.NOW });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(PENDING);
    await waitFor(() => expect(statuses.length).toBeGreaterThanOrEqual(2), { timeout: 6000 });
    expect(screen.getByText(PENDING)).toBeInTheDocument();
  });


  it('none running → "This message has no answer." with a button that generates one for it', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', unanswered);
    const turns = givenChatStream(textReply('Sugeneruotas atsakymas.'));
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const line = await screen.findByText(MISSING);
    expect(line.closest('[role="status"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Generate an answer' }));
    expect(await screen.findByText('Sugeneruotas atsakymas.')).toBeInTheDocument();
    expect(turns[0].body).toMatchObject({
      id: f.ID.licenceThread, trigger: 'regenerate-message', parentId: null,
      message: { id: 'msg-u-7', role: 'user', parts: [{ type: 'text', text: 'Klausimas, į kurį dar atsakoma' }] },
    });
    await waitFor(() => expect(screen.queryByText(MISSING)).toBeNull());
  });


  it('a status check that fails shows nothing — no line, no alert', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', unanswered);
    given.apiError('get', '/api/assistant/chat/:threadId/status', 'SERVER_ERROR', { status: 500 });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Klausimas, į kurį dar atsakoma');
    await settle(200);
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('asks nothing when the conversation ends with a reply', async () => {
    const statuses = given.capture('get', '/api/assistant/chat/:threadId/status', f.chatStatus);
    await openLicence();
    await settle(100);
    expect(statuses).toHaveLength(0);
  });


  it('speaks Lithuanian', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', unanswered);
    renderChat({ route: `/chat/${f.ID.licenceThread}`, locale: 'lt' });
    expect(await screen.findByText('Į šią žinutę atsakymo nėra.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generuoti atsakymą' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Attachments
// -----------------------------------------------------------
//
// A file picked, dropped or pasted uploads at once (POST
// /api/documents, multipart); the chip follows the upload;
// the message carries a data-document part per upload.
// -----------------------------------------------------------

describe('attachments', () => {

  it('the attach button opens a file picker for the accepted types, several at once', async () => {
    const { user } = await newChat();
    const before = document.body.querySelectorAll('input[type="file"]').length;
    await user.click(screen.getByRole('button', { name: 'Attach a document' }));
    const inputs = document.body.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(before + 1);
    const input = inputs[inputs.length - 1];
    expect(input.accept).toBe(ACCEPTED_FILES);
    expect(input.multiple).toBe(true);
    // Dismissing the picker takes its input away again
    fireEvent(input, new Event('cancel'));
    expect(input.isConnected).toBe(false);
  });


  it('a picked file uploads at once as multipart (the file part: name, size, type) and its chip says it is ready', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('politika.pdf'), { status: 201 });
    const { user } = await newChat();
    await pickFiles(user, [fakeFile('politika.pdf', { type: 'application/pdf', size: 2048 })]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(uploads[0].body).toEqual({ file: { name: 'politika.pdf', size: 2048, type: 'application/pdf' } });
    expect(await screen.findByText('Uploaded — sent with the message')).toBeInTheDocument();
    expect(chipRemove('politika.pdf')).toBeInTheDocument();
  });


  it('while the upload runs the chip says so, with its progress', async () => {
    const uploads = holdUploads();
    await newChat();
    await dropFiles(composer(), [fakeFile('didelis.pdf', { type: 'application/pdf' })]);
    const state = await screen.findByText('Uploading… 0 %');
    expect(state.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByText('Uploaded — sent with the message')).toBeNull();
    await uploads.release(uploadAnswer('didelis.pdf'));
    expect(await screen.findByText('Uploaded — sent with the message')).toBeInTheDocument();
  });


  it('a message sent while its document still uploads waits for the upload and carries the document (it went with an id-less part the assistant refuses)', async () => {
    const uploads = holdUploads();
    const turns = givenChatStream(textReply('Gavau su dokumentu.'));
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('didelis.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploading… 0 %');
    await user.type(composer(), 'Štai failas');
    await user.keyboard('{Enter}');
    await settle(100);
    expect(turns).toHaveLength(0);

    const answer = uploadAnswer('didelis.pdf');
    await uploads.release(answer);
    expect(await screen.findByText('Gavau su dokumentu.')).toBeInTheDocument();
    expect(turns).toHaveLength(1);
    expect(turns[0].body.message.parts).toEqual([
      { type: 'text', text: 'Štai failas' },
      { type: 'data-document', data: { id: answer.id, title: 'didelis.pdf', kind: 'other', charCount: 12345, extractionStatus: 'done' } },
    ]);
  });


  it('a message sent after its upload failed goes without the document — never with a part that has no id', async () => {
    const uploads = holdUploads();
    const turns = givenChatStream(textReply('Gavau be dokumento.'));
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('nepavyks.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploading… 0 %');
    await uploads.fail(500);
    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    await sendMessage(user, 'Vis tiek klausiu');
    expect(await screen.findByText('Gavau be dokumento.')).toBeInTheDocument();
    expect(turns[0].body.message.parts).toEqual([{ type: 'text', text: 'Vis tiek klausiu' }]);
  });


  it('a message sent while an upload runs, which then fails, goes without the document too', async () => {
    const uploads = holdUploads();
    const turns = givenChatStream(textReply('Atsakau be dokumento.'));
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('nepavyks.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploading… 0 %');
    await user.type(composer(), 'Klausimas');
    await user.keyboard('{Enter}');
    await uploads.fail(500);
    expect(await screen.findByText('Atsakau be dokumento.')).toBeInTheDocument();
    expect(turns[0].body.message.parts).toEqual([{ type: 'text', text: 'Klausimas' }]);
  });


  it('removing a chip while it uploads deletes its document once it is uploaded — nothing is left behind', async () => {
    const uploads = holdUploads();
    const deletes = given.capture('delete', '/api/documents/:documentId', { ok: true });
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('pusiaukelėje.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploading… 0 %');
    await user.click(chipRemove('pusiaukelėje.pdf'));
    const answer = uploadAnswer('pusiaukelėje.pdf');
    await uploads.release(answer);
    await waitFor(() => expect(deletes.map((call) => new URL(call.url).pathname)).toEqual([`/api/documents/${answer.id}`]));
    expect(screen.queryByRole('button', { name: 'Remove “pusiaukelėje.pdf”' })).toBeNull();
  });


  it('a dropped file uploads the same way, and the drop zone highlights while a file is dragged over it', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('tvarka.md'), { status: 201 });
    await newChat();
    const zone = composer().closest('[data-dragging], form > div');
    await dropFiles(composer(), [fakeFile('tvarka.md', { type: 'text/markdown' })]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].body.file).toMatchObject({ name: 'tvarka.md', type: 'text/markdown' });
    expect(await screen.findByText('Uploaded — sent with the message')).toBeInTheDocument();
    expect(zone).not.toHaveAttribute('data-dragging');
  });


  it('a pasted file uploads too', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('registras.csv'), { status: 201 });
    await newChat();
    await pasteFiles(composer(), [fakeFile('registras.csv', { type: 'text/csv' })]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].body.file.name).toBe('registras.csv');
    expect(await screen.findByRole('button', { name: 'Remove “registras.csv”' })).toBeInTheDocument();
  });


  it('takes what the documents tab takes: an .htm page, and a Word document pasted under a name that does not say what it is (its type does) — both upload, nothing is refused (the .htm was)', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('puslapis.htm'), { status: 201 });
    await newChat();
    await dropFiles(composer(), [fakeFile('puslapis.htm', { type: 'text/html' })]);
    await pasteFiles(composer(), [fakeFile('Sutartis', { type: DOCX_TYPE })]);
    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(uploads.map((call) => call.body.file.name)).toEqual(['puslapis.htm', 'Sutartis']);
    expect(await screen.findByRole('button', { name: 'Remove “puslapis.htm”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove “Sutartis”' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a dropped file of a type nobody accepts is not uploaded — and says so: the banner names it (it used to vanish without a word)', async () => {
    const uploads = given.capture('post', '/api/documents', {}, { status: 201 });
    await newChat();
    await dropFiles(composer(), [fakeFile('programa.exe', { type: 'application/x-msdownload' })]);
    expect(await screen.findByRole('alert')).toHaveTextContent(`Not attached: programa.exe ${NOT_ACCEPTED}`);
    await settle(200);
    expect(uploads).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Remove “programa.exe”' })).toBeNull();
  });


  it('a pasted file of another type — a screenshot — is named too, and nothing is uploaded', async () => {
    const uploads = given.capture('post', '/api/documents', {}, { status: 201 });
    await newChat();
    await pasteFiles(composer(), [fakeFile('image.png', { type: 'image/png' })]);
    expect(await screen.findByRole('alert')).toHaveTextContent(`Not attached: image.png ${NOT_ACCEPTED}`);
    await settle(200);
    expect(uploads).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Remove “image.png”' })).toBeNull();
  });


  it('a picked file of another type — the dialog switched to "All files" — is named too; the good file of the pick still uploads', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('politika.pdf'), { status: 201 });
    await newChat();
    // applyAccept off: the dialog's filter was switched to all files
    const user = userEvent.setup({ applyAccept: false });
    const sheet = fakeFile('lentele.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await pickFiles(user, [sheet, fakeFile('politika.pdf', { type: 'application/pdf' })]);
    expect(await screen.findByRole('alert')).toHaveTextContent(`Not attached: lentele.xlsx ${NOT_ACCEPTED}`);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].body.file.name).toBe('politika.pdf');
    expect(await screen.findByText('Uploaded — sent with the message')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove “lentele.xlsx”' })).toBeNull();
  });


  it('sending carries each upload as a data-document part (never the file) and the bubble shows the chips', async () => {
    const answer = uploadAnswer('politika.pdf', { kind: 'policy' });
    given.json('post', '/api/documents', answer, { status: 201 });
    const turns = givenChatStream(textReply('Perskaičiau.'));
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('politika.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploaded — sent with the message');
    await sendMessage(user, 'Peržiūrėk');
    await screen.findByText('Perskaičiau.');
    expect(turns[0].body.message.parts).toEqual([
      { type: 'text', text: 'Peržiūrėk' },
      { type: 'data-document', data: { id: answer.id, title: 'politika.pdf', kind: 'policy', charCount: 12345, extractionStatus: 'done' } },
    ]);
    expect(screen.getByTestId('user-message')).toHaveTextContent('Peržiūrėk');
    expect(screen.getByTestId('user-message')).toHaveTextContent('Document:politika.pdf· 12,345 chars');
    // The chip leaves the composer once sent
    expect(screen.queryByText('Uploaded — sent with the message')).toBeNull();
  });


  it('a document alone can be sent', async () => {
    given.json('post', '/api/documents', uploadAnswer('vien.pdf'), { status: 201 });
    const turns = givenChatStream(textReply('Gavau dokumentą.'));
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('vien.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploaded — sent with the message');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Gavau dokumentą.');
    expect(turns[0].body.message.parts.map((part) => part.type)).toEqual(['data-document']);
  });


  for (const [what, arrange, sentence] of [
    ['a refusal (413 FILE_TOO_LARGE)', () => given.apiError('post', '/api/documents', 'FILE_TOO_LARGE', { status: 413 }), 'The file is too large.'],
    ['a server error', () => given.apiError('post', '/api/documents', 'SERVER_ERROR', { status: 500 }), 'Server error. Try again later.'],
    ['a dropped connection', () => given.networkError('post', '/api/documents'), 'Could not reach the server. Check your internet connection.'],
  ]) {
    it(`a failed upload (${what}) marks the chip "Upload failed" and the banner says why — without a toast`, async () => {
      arrange();
      await newChat();
      await dropFiles(composer(), [fakeFile('nepavyks.pdf', { type: 'application/pdf' })]);
      expect(await screen.findByText('Upload failed')).toBeInTheDocument();
      expect(await screen.findByRole('alert')).toHaveTextContent(`Chat error: ${sentence}`);
      // The banner is the one message — the upload is silent
      expect(screen.getAllByText(sentence)).toHaveLength(1);
    });
  }


  it('a file over 50 MB is refused before any upload: no chip — nothing was attached — and the banner names it with the limit', async () => {
    const uploads = given.capture('post', '/api/documents', {}, { status: 201 });
    await newChat();
    await dropFiles(composer(), [oversizedFile('didelis.pdf')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(`Not attached: didelis.pdf ${TOO_LARGE}`);
    await settle(100);
    expect(uploads).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Remove “didelis.pdf”' })).toBeNull();
    expect(screen.queryByText('Upload failed')).toBeNull();
  });


  it('an oversized file picked or pasted is refused the same way, and both are named in the one notice', async () => {
    const uploads = given.capture('post', '/api/documents', {}, { status: 201 });
    const { user } = await newChat();
    await pickFiles(user, [oversizedFile('pasirinktas.pdf')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(`Not attached: pasirinktas.pdf ${TOO_LARGE}`);
    await pasteFiles(composer(), [oversizedFile('įklijuotas.pdf', 90 * 1024 * 1024)]);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(`Not attached: pasirinktas.pdf, įklijuotas.pdf ${TOO_LARGE}`));
    await settle(100);
    expect(uploads).toHaveLength(0);
  });


  it('a mixed drop: the good file uploads, ONE notice names the rest, a line per reason — and a file dropped again is not named twice', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('politika.pdf'), { status: 201 });
    await newChat();
    const exe = fakeFile('programa.exe', { type: 'application/x-msdownload' });
    await dropFiles(composer(), [exe, oversizedFile('didelis.pdf'), fakeFile('politika.pdf', { type: 'application/pdf' })]);
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveTextContent(`Not attached: programa.exe ${NOT_ACCEPTED} didelis.pdf ${TOO_LARGE}`));
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].body.file.name).toBe('politika.pdf');
    expect(await screen.findByText('Uploaded — sent with the message')).toBeInTheDocument();

    await dropFiles(composer(), [exe, oversizedFile('didelis.pdf')]);
    await settle(100);
    expect(screen.getByRole('alert').textContent.match(/programa\.exe/g)).toHaveLength(1);
    expect(screen.getByRole('alert').textContent.match(/didelis\.pdf/g)).toHaveLength(1);
    expect(uploads).toHaveLength(1);
  });


  it('the notice goes with the next question, like any banner — the refused file never travels with it', async () => {
    const turn = openChatStream();
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('programa.exe', { type: 'application/x-msdownload' })]);
    await screen.findByRole('alert');
    await sendMessage(user, 'Klausimas be failo');
    await turn.requested();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(turn.requests[0].body.message.parts).toEqual([{ type: 'text', text: 'Klausimas be failo' }]);
    await turn.write(...textReply('Gavau.'));
    await turn.end();
    expect(await screen.findByText('Gavau.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('the notice can be dismissed, and a later refusal starts a fresh one', async () => {
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('programa.exe', { type: 'application/x-msdownload' })]);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Close the message' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await dropFiles(composer(), [fakeFile('nuotrauka.png', { type: 'image/png' })]);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Not attached: nuotrauka.png ${NOT_ACCEPTED}`);
    expect(alert).not.toHaveTextContent('programa.exe');
  });


  it('says the 50 MB limit where a file is chosen: the attach button\'s description (its name unchanged) and the drop overlay', async () => {
    await newChat();
    expect(screen.getByRole('button', { name: 'Attach a document' }))
      .toHaveAccessibleDescription('PDF, DOCX, TXT, MD, HTML, CSV or JSON, at most 50 MB per file');
    expect(screen.getByText('Drop the file here — it is uploaded and passed to the assistant (at most 50 MB)')).toBeInTheDocument();
  });


  it('names the refused files, and says the limit, in Lithuanian', async () => {
    await newChat({ locale: 'lt' });
    expect(screen.getByRole('button', { name: 'Įkelti dokumentą' }))
      .toHaveAccessibleDescription('PDF, DOCX, TXT, MD, HTML, CSV arba JSON, daugiausia 50 MB vienam failui');
    expect(screen.getByText('Paleiskite failą čia — jis bus įkeltas ir perduotas asistentui (daugiausia 50 MB)')).toBeInTheDocument();
    await dropFiles(composer('lt'), [fakeFile('programa.exe', { type: 'application/x-msdownload' }), oversizedFile('didelis.pdf')]);
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveTextContent(
      'Neįkelta: programa.exe — netinkamas failo tipas (tinka: .pdf, .docx, .txt, .md, .html, .htm, .csv, .json) didelis.pdf — per didelis failas (daugiausia 50 MB)',
    ));
  });


  it('removing a chip deletes the upload (DELETE /api/documents/:id) and the chip goes', async () => {
    const answer = uploadAnswer('nereikalingas.pdf');
    given.json('post', '/api/documents', answer, { status: 201 });
    const deletes = given.capture('delete', '/api/documents/:documentId', { ok: true });
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('nereikalingas.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploaded — sent with the message');
    await user.click(chipRemove('nereikalingas.pdf'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove “nereikalingas.pdf”' })).toBeNull());
    expect(deletes.map((call) => new URL(call.url).pathname)).toEqual([`/api/documents/${answer.id}`]);
  });


  it('removing a failed chip deletes nothing; a DELETE that fails still removes the chip, silently', async () => {
    given.apiError('post', '/api/documents', 'SERVER_ERROR', { status: 500 });
    const deletes = given.capture('delete', '/api/documents/:documentId', { ok: true });
    const { user } = await newChat();
    await dropFiles(composer(), [fakeFile('blogas.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Upload failed');
    await user.click(chipRemove('blogas.pdf'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove “blogas.pdf”' })).toBeNull());
    expect(deletes).toHaveLength(0);

    given.json('post', '/api/documents', uploadAnswer('antras.pdf'), { status: 201 });
    given.apiError('delete', '/api/documents/:documentId', 'NOT_FOUND', { status: 404 });
    await dropFiles(composer(), [fakeFile('antras.pdf', { type: 'application/pdf' })]);
    await screen.findByText('Uploaded — sent with the message');
    await user.click(chipRemove('antras.pdf'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove “antras.pdf”' })).toBeNull());
    await settle(100);
    expect(screen.queryByText('Not found.')).toBeNull();
  });


  it('speaks Lithuanian on the chip', async () => {
    given.json('post', '/api/documents', uploadAnswer('politika.pdf'), { status: 201 });
    await newChat({ locale: 'lt' });
    await dropFiles(composer('lt'), [fakeFile('politika.pdf', { type: 'application/pdf' })]);
    expect(await screen.findByText('Įkelta — bus išsiųsta su žinute')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pašalinti „politika.pdf“' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The composer
// -----------------------------------------------------------
//
// Enter / Shift+Enter, empty input, Enter a no-op while
// answering, the AI notice, autofocus by pointer type.
// -----------------------------------------------------------

describe('the composer', () => {

  it('Enter sends, Shift+Enter breaks the line', async () => {
    const turns = givenChatStream(textReply('Gavau.'));
    const { user } = await newChat();
    await user.click(composer());
    await user.keyboard('Pirma eilutė{Shift>}{Enter}{/Shift}Antra eilutė');
    expect(composer()).toHaveValue('Pirma eilutė\nAntra eilutė');
    expect(turns).toHaveLength(0);
    await user.keyboard('{Enter}');
    await screen.findByText('Gavau.');
    expect(turns[0].body.message.parts).toEqual([{ type: 'text', text: 'Pirma eilutė\nAntra eilutė' }]);
    expect(composer()).toHaveValue('');
  });


  it('an empty or blank message cannot be sent: send is disabled and Enter does nothing', async () => {
    const turns = givenChatStream(textReply('x'));
    const { user } = await newChat();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(composer(), '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.keyboard('{Enter}');
    await settle(100);
    expect(turns).toHaveLength(0);
    await user.type(composer(), 'x');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });


  it('waits for the conversation\'s history before it takes a message, and says it is loading', async () => {
    given.hang('get', '/api/chat/threads/:threadId/messages');
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await opened(LICENCE.title);
    const loading = await screen.findByText('Loading the conversation…');
    expect(loading.closest('[role="status"]')).not.toBeNull();
    expect(composer()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.queryByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeNull();
  });


  it('a question can only be asked once the history is in — it went out without its parent (the assistant answered with no history) and vanished', async () => {
    let release;
    server.use(http.get(url('/api/chat/threads/:threadId/messages'), () => new Promise((resolve) => {
      release = () => resolve(HttpResponse.json(f.threadMessages(f.ID.licenceThread)));
    })));
    const turns = givenChatStream(textReply('Atsakymas su kontekstu.'));
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Loading the conversation…');
    await user.type(composer(), 'Ar tikrai?');
    await user.keyboard('{Enter}');
    await settle(100);
    expect(turns).toHaveLength(0);

    await act(async () => { release(); });
    await screen.findByText(LICENCE_REPLY);
    expect(screen.queryByText('Loading the conversation…')).toBeNull();
    await sendMessage(user, 'Ar tikrai?');
    expect(await screen.findByText('Atsakymas su kontekstu.')).toBeInTheDocument();
    expect(turns[0].body.parentId).toBe(f.ID.answer1);
    expect(bubbles().at(-2)).toBe('you: Ar tikrai?');
  });


  it('speaks Lithuanian while loading', async () => {
    given.hang('get', '/api/chat/threads/:threadId/messages');
    renderChat({ route: `/chat/${f.ID.licenceThread}`, locale: 'lt' });
    expect(await screen.findByText('Įkeliamas pokalbis…')).toBeInTheDocument();
  });


  it('the send button sends like Enter', async () => {
    const turns = givenChatStream(textReply('Gavau mygtuku.'));
    const { user } = await newChat();
    await user.type(composer(), 'Mygtukas');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Gavau mygtuku.');
    expect(turns[0].body.message.parts).toEqual([{ type: 'text', text: 'Mygtukas' }]);
  });


  it('while an answer is written, Enter does nothing — no second message and no line break (assistant-ui let it through as one)', async () => {
    const turn = openChatStream();
    const { user } = await newChat();
    await sendMessage(user, 'Pirmas');
    await turn.requested();
    await screen.findByRole('button', { name: 'Stop the answer' });
    await user.type(composer(), 'Antras');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await settle(100);
    expect(turn.requests).toHaveLength(1);
    expect(composer()).toHaveValue('Antras');
  });


  it('…while Shift+Enter still breaks the line, and once the answer is in Enter sends what was written', async () => {
    const turn = openChatStream();
    const { user } = await newChat();
    await sendMessage(user, 'Pirmas');
    await turn.requested();
    await screen.findByRole('button', { name: 'Stop the answer' });
    await user.type(composer(), 'Antras');
    await user.keyboard('{Shift>}{Enter}{/Shift}eilutė');
    expect(composer()).toHaveValue('Antras\neilutė');

    await turn.write(...textReply('Pirmas atsakymas.'));
    await turn.end();
    await screen.findByRole('button', { name: 'Send' });
    await user.click(composer());
    await user.keyboard('{Enter}');
    await turn.requested(2);
    expect(turn.requests[1].body.message.parts).toEqual([{ type: 'text', text: 'Antras\neilutė' }]);
    await turn.write(...textReply('Antras atsakymas.'));
    await turn.end();
    expect(await screen.findByText('Antras atsakymas.')).toBeInTheDocument();
  });


  it('the AI notice is a short line under the composer, its info button before it, and it cannot be hidden', async () => {
    // A browser that hid the old, longer notice shows this one
    localStorage.setItem('chat.aiNoticeDismissed', '1');
    await newChat();
    const notice = screen.getByText('AI can make mistakes');
    const info = screen.getByRole('button', { name: 'About the AI assistant' });
    expect(notice.parentElement).toContainElement(info);
    expect(composer().closest('form')).toContainElement(notice);
    expect(screen.queryByRole('button', { name: 'Hide this notice' })).toBeNull();
  });


  it('the info button opens the full notice (what the assistant is, where documents go) and Close closes it', async () => {
    const { user } = await newChat();
    await user.click(screen.getByRole('button', { name: 'About the AI assistant' }));
    const dialog = await screen.findByRole('dialog', { name: 'About the AI assistant' });
    expect(dialog).toHaveTextContent('You are talking to an artificial intelligence (AI) assistant.');
    expect(dialog).toHaveTextContent('ai.knf.vu.lt');
    expect(dialog).toHaveTextContent('The assistant\'s conclusions are not legal advice.');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('takes the focus on a device with a hover pointer…', async () => {
    mediaQueryMatches('(hover: hover)');
    await newChat();
    await waitFor(() => expect(composer()).toHaveFocus());
  });


  it('…and not on a touch device, where it would pop the keyboard over the thread', async () => {
    await newChat();
    await settle(100);
    expect(composer()).not.toHaveFocus();
  });


  it('speaks Lithuanian', async () => {
    await newChat({ locale: 'lt' });
    expect(screen.getByRole('button', { name: 'Siųsti' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Įkelti dokumentą' })).toBeInTheDocument();
    expect(screen.getByText('DI gali klysti')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apie DI asistentą' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The inline editor
// -----------------------------------------------------------
//
// A question edited in place (Messages.jsx UserEditComposer):
// Enter held while an answer is written, exactly as in the
// composer (the one useHoldEnter); the documents the message
// carries shown with the composer's chips, removable; and no
// paste-to-attach — new documents are the composer's job.
// -----------------------------------------------------------

describe('the inline editor', () => {

  // The licence conversation with a second question whose
  // answer is still being written, and the FIRST question
  // open in the editor
  const editWhileAnswering = async () => {
    const turn = openChatStream();
    const view = await openLicence();
    await sendMessage(view.user, 'Pirmas');
    await turn.requested();
    await screen.findByRole('button', { name: 'Stop the answer' });
    await view.user.click(screen.getAllByRole('button', { name: 'Edit the message' })[0]);
    const editor = await screen.findByRole('textbox', { name: 'Message being edited' });
    return { ...view, turn, editor };
  };


  it('while an answer is written, Enter in the editor does nothing — no line break (assistant-ui broke the line) and nothing sent; Shift+Enter still breaks it, and once the answer is in Enter sends the edit', async () => {
    const { user, turn, editor } = await editWhileAnswering();
    await user.type(editor, ' papildymas');
    await user.keyboard('{Enter}');
    expect(editor).toHaveValue(`${LICENCE_QUESTION} papildymas`);
    await user.keyboard('{Shift>}{Enter}{/Shift}eilutė');
    expect(editor).toHaveValue(`${LICENCE_QUESTION} papildymas\neilutė`);
    await settle(100);
    expect(turn.requests).toHaveLength(1);

    await turn.write(...textReply('Pirmas atsakymas.'));
    await turn.end();
    await screen.findByText('Pirmas atsakymas.');
    await user.click(editor);
    await user.keyboard('{Enter}');
    await turn.requested(2);
    expect(turn.requests[1].body).toMatchObject({
      trigger: 'submit-message', parentId: null,
      message: { parts: [{ type: 'text', text: `${LICENCE_QUESTION} papildymas\neilutė` }] },
    });
    await turn.write(...textReply('Atsakymas į pakeistą.'));
    await turn.end();
    expect(await screen.findByText('Atsakymas į pakeistą.')).toBeInTheDocument();
  });


  it('holds only a plain Enter, in the editor as in the composer: Shift+Enter and the Enter of an IME composing a word go through', async () => {
    const { turn, editor } = await editWhileAnswering();
    for (const input of [composer(), editor]) {
      // fireEvent answers false for a key that was cancelled
      expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
      expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
      expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true);
    }
    await settle(100);
    expect(turn.requests).toHaveLength(1);
  });


  it('a file pasted into the editor is not attached: nothing is uploaded, nothing said, and the edit goes without it — new documents are the composer\'s (it used to go along unseen)', async () => {
    const uploads = given.capture('post', '/api/documents', uploadAnswer('politika.pdf'), { status: 201 });
    const turns = givenChatStream(textReply('Atsakymas į pakeistą.'));
    const { user } = await openLicence();
    await user.click(screen.getByRole('button', { name: 'Edit the message' }));
    const editor = await screen.findByRole('textbox', { name: 'Message being edited' });
    await pasteFiles(editor, [fakeFile('politika.pdf', { type: 'application/pdf' })]);
    await settle(200);
    expect(uploads).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();

    await user.type(editor, ' papildymas');
    await user.click(screen.getByRole('button', { name: 'Send edited' }));
    await screen.findByText('Atsakymas į pakeistą.');
    expect(turns[0].body.message.parts).toEqual([{ type: 'text', text: `${LICENCE_QUESTION} papildymas` }]);
    expect(uploads).toHaveLength(0);
  });


  it('shows the documents the message carries as the composer\'s chips — by title, "stays with the message" — and they go with the edit', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', CARRYING);
    const turns = givenChatStream(textReply('Peržiūrėjau dar kartą.'));
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Perskaičiau abu.');
    await user.click(screen.getByRole('button', { name: 'Edit the message' }));
    const editor = await screen.findByRole('textbox', { name: 'Message being edited' });
    expect(editor).toHaveValue('Peržiūrėk dokumentus');
    const chips = editor.closest('form').querySelectorAll('[role="status"]');
    expect([...chips].map((chip) => chip.textContent)).toEqual(['Stays with the message', 'Stays with the message']);
    expect(screen.getByRole('button', { name: `Remove “${POLICY.title}”` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Remove “${REGISTER.title}”` })).toBeInTheDocument();

    await user.type(editor, ' dar kartą');
    await user.click(screen.getByRole('button', { name: 'Send edited' }));
    await screen.findByText('Peržiūrėjau dar kartą.');
    expect(turns[0].body.message.parts).toEqual([
      { type: 'text', text: 'Peržiūrėk dokumentus dar kartą' },
      { type: 'data-document', data: POLICY },
      { type: 'data-document', data: REGISTER },
    ]);
  });


  it('a document removed in the editor is left out of the edited message — and nothing is deleted: the original version keeps it', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', CARRYING);
    const deletes = given.spy('delete', '/api/documents/:documentId');
    const turns = givenChatStream(textReply('Tik registras.'));
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText('Perskaičiau abu.');
    await user.click(screen.getByRole('button', { name: 'Edit the message' }));
    await screen.findByRole('textbox', { name: 'Message being edited' });
    await user.click(screen.getByRole('button', { name: `Remove “${POLICY.title}”` }));
    await waitFor(() => expect(screen.queryByRole('button', { name: `Remove “${POLICY.title}”` })).toBeNull());
    expect(screen.getByRole('button', { name: `Remove “${REGISTER.title}”` })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send edited' }));
    await screen.findByText('Tik registras.');
    expect(turns[0].body.message.parts).toEqual([
      { type: 'text', text: 'Peržiūrėk dokumentus' },
      { type: 'data-document', data: REGISTER },
    ]);
    const edited = screen.getByTestId('user-message');
    expect(edited).not.toHaveTextContent(POLICY.title);
    await user.click(within(edited).getByRole('button', { name: 'Previous version' }));
    await waitFor(() => expect(screen.getByTestId('user-message')).toHaveTextContent(POLICY.title));
    await settle(100);
    expect(deletes).toHaveLength(0);
  });


  it('names a carried document\'s chip in Lithuanian', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', CARRYING);
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}`, locale: 'lt' });
    await screen.findByText('Perskaičiau abu.');
    await user.click(screen.getByRole('button', { name: 'Redaguoti žinutę' }));
    const editor = await screen.findByRole('textbox', { name: 'Redaguojama žinutė' });
    expect(screen.getByRole('button', { name: `Pašalinti „${POLICY.title}“` })).toBeInTheDocument();
    expect([...editor.closest('form').querySelectorAll('[role="status"]')].map((chip) => chip.textContent))
      .toEqual(['Lieka prie žinutės', 'Lieka prie žinutės']);
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The history as the licence deep link loads it: failures
// reach the banner (a 404 loads empty on purpose — asserted
// in "the history"). The status route as the watcher reads
// it: its failures are silent by design (asserted in
// "reopening a conversation…"), so only the answer variants
// run here — a wrong shape must not crash the page.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/chat/threads/:threadId/messages',
  fixture: f.threadMessages(f.ID.licenceThread),
  render: () => renderChat({ route: `/chat/${f.ID.licenceThread}` }),
  chrome: () => screen.getByRole('main') && screen.getByRole('textbox', { name: 'Message to the assistant' }),
  loaded: async () => { await screen.findByText(LICENCE_REPLY); },
  loading: () => screen.getByText('Loading the conversation…') && composer().disabled,
  skip: {
    '404 NOT_FOUND → alert': 'a thread whose history is gone loads empty and silently (see "a history that is gone")',
  },
});


const STATUS_FAILURES = VARIANTS.filter((variant) => variant.expect === 'alert').map((variant) => variant.name);

describeEndpointContract({
  path: '/api/assistant/chat/:threadId/status',
  fixture: f.chatStatus,
  render: () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [userRow('msg-u-7', 'Klausimas be atsakymo')]);
    return renderChat({ route: `/chat/${f.ID.licenceThread}` });
  },
  chrome: () => screen.getByRole('main') && screen.getByText('Klausimas be atsakymo'),
  loaded: async () => { await screen.findByText(MISSING); },
  only: VARIANTS.map((variant) => variant.name).filter((name) => !STATUS_FAILURES.includes(name)),
});
