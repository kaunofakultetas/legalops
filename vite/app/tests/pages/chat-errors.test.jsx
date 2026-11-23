// -----------------------------------------------------------
//  [*] Tests — Chat errors (chatErrors.js and the banner)
//
//  What a failed turn tells the user, from the three shapes a
//  chat failure arrives in (assistant/app/middleware/
//  errors.js and llm/stream.js):
//
//    - a refusal before the stream — the AI SDK's
//      APICallError with the status and the envelope
//      {message, error: {code, message, retryAfterS?}};
//    - an error chunk inside the stream — an Error whose
//      message IS the envelope (MODEL_TIMEOUT, …);
//    - an axios failure of the thread / history / upload
//      calls — utils/errors.js translates those;
//
//  and the network in between. chatErrors.js on its own
//  (parseEnvelope, chatErrorInfo, describeChatError — every
//  code of CODE_KEYS to its sentence in both languages, the
//  order of the fallbacks), then through the page: every code
//  as a refused turn (table-driven), the stream codes as an
//  error chunk (the partial reply kept, with its note), 429
//  with and without retryAfterS, the 401 (the session ends,
//  the login page), a connection that fails before or during
//  the answer, a proxy's HTML page, an unknown code, a
//  conversation that cannot be created (said once — no toast
//  on top of the banner), one whose create came back without
//  an id (the GUI's own THREAD_NOT_CREATED — the turn is
//  never sent under assistant-ui's draft id); the
//  banner itself (an alert, dismissable, cleared by the next
//  send and by a switch — only for the thread left behind),
//  and a language switch re-translating a banner already on
//  screen.
// -----------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { http, HttpResponse } from 'msw';
import { translate } from '@/i18n';
import en from '@/messages/PAGES/chat/en.json';
import lt from '@/messages/PAGES/chat/lt.json';
import {
  CODE_KEYS, LOCAL_KEYS, chatErrorInfo, chatFailure, describeChatError, parseEnvelope,
} from '@/pages/Chat/chatErrors';
import { given, server, url } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import {
  address, errorChunk, errorEnvelope, givenChatRefusal, givenChatStream, openChatStream, renderChat, resetChatLayout,
  sendMessage, textReply,
} from '../support/chat';


afterEach(() => {
  resetChatLayout();
});


// The two conversations of the fixture world
const DORA = f.thread(f.ID.doraThread);
const LICENCE = f.thread(f.ID.licenceThread);
const LICENCE_REPLY = /kriptoturto paslaugų teikėjo leidimo/;

// The status each code arrives with from the assistant (the
// sentence follows the code, whatever the status — the table
// only keeps the refusals realistic; 401 is its own test)
const CODE_STATUS = {
  RATE_LIMITED: 429, BUDGET_EXCEEDED: 429, AI_BUDGET_EXHAUSTED: 402, MODEL_TIMEOUT: 504, MODEL_UNAVAILABLE: 502,
  MODEL_REFUSED: 400, MODEL_CONTEXT_EXCEEDED: 400, MODEL_CONTENT_FILTERED: 400, MODEL_ACCESS_DENIED: 403,
  STREAM_FAILED: 500, NOT_CONFIGURED: 503, PROMPT_NOT_CONFIGURED: 503, PROMPT_UNAVAILABLE: 503, THREAD_NOT_FOUND: 404,
  INPUT_TOO_LARGE: 400, PAYLOAD_TOO_LARGE: 413, EMPTY_MESSAGE: 400, AUTH_REQUIRED: 401, SESSION_INVALID: 401,
  HISTORY_UNREADABLE: 500, DJANGO_UNREACHABLE: 502, DJANGO_API_ERROR: 502, ASSISTANT_ERROR: 500, INTERNAL_ERROR: 500,
  SHUTTING_DOWN: 503, INVALID_JSON: 400, INVALID_BODY: 400, INVALID_MESSAGE: 400, INVALID_PART: 400, INVALID_PARENT: 400,
  INVALID_THREAD: 400, INVALID_TRIGGER: 400, MESSAGE_ID_TAKEN: 409, UNSUPPORTED_ENCODING: 415,
};

// The codes the assistant's stream error chunk carries
// (llm/stream.js streamErrorText)
const STREAM_CODES = [
  'MODEL_TIMEOUT', 'AI_BUDGET_EXHAUSTED', 'MODEL_UNAVAILABLE', 'MODEL_REFUSED', 'MODEL_CONTEXT_EXCEEDED',
  'MODEL_CONTENT_FILTERED', 'MODEL_ACCESS_DENIED', 'STREAM_FAILED',
];

// The sentence of a key, as the page renders it
const sentence = (key, locale = 'en', params) => translate(`PAGES.chat.ERRORS.${key}`, params, locale);

// describeChatError's `t` for a locale
const tFor = (locale) => (key, params) => sentence(key, locale, params);

// An axios failure with an HTTP answer
const axiosFailure = (status, data = {}, headers = {}) => {
  const error = new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE');
  error.response = { status, data, headers };
  return error;
};

// The AI SDK's APICallError as far as chatErrorInfo reads it
const apiCallError = (statusCode, responseBody) => Object.assign(new Error(responseBody || 'Failed to fetch the chat response.'), {
  name: 'AI_APICallError', statusCode, responseBody,
});

// The banner, once it is there
const banner = () => screen.findByRole('alert');







// -----------------------------------------------------------
// CODE_KEYS
// -----------------------------------------------------------
//
// Every code the assistant sends has a sentence of its own,
// in both languages — never the code, never English in the
// Lithuanian UI.
// -----------------------------------------------------------

describe('CODE_KEYS', () => {

  it('maps every code the assistant can send (the list its structural test keeps in step)', () => {
    expect(Object.keys(CODE_KEYS).sort()).toEqual(Object.keys(CODE_STATUS).sort());
  });


  it('maps the codes the assistant added lately: the server-side failures to SERVER, a redeploy to RESTARTING, an encoding to INVALID', () => {
    expect(CODE_KEYS).toMatchObject({
      ASSISTANT_ERROR: 'SERVER', DJANGO_API_ERROR: 'SERVER', INTERNAL_ERROR: 'SERVER',
      SHUTTING_DOWN: 'RESTARTING', UNSUPPORTED_ENCODING: 'INVALID',
    });
  });


  it('points every code at a sentence that exists in both languages', () => {
    for (const [code, key] of Object.entries(CODE_KEYS)) {
      expect(typeof en.ERRORS[key], `en ${code} → ${key}`).toBe('string');
      expect(typeof lt.ERRORS[key], `lt ${code} → ${key}`).toBe('string');
    }
  });


  for (const locale of ['en', 'lt']) {
    it(`describes every code in ${locale === 'en' ? 'English' : 'Lithuanian'} with its own sentence, never the code`, () => {
      const messages = locale === 'en' ? en : lt;
      for (const [code, key] of Object.entries(CODE_KEYS)) {
        const text = describeChatError({ code, status: CODE_STATUS[code], retryAfter: null, network: false, axios: null }, tFor(locale), locale);
        const expected = key === 'RATE_LIMITED' ? messages.ERRORS.RATE_LIMITED_NOWAIT : messages.ERRORS[key];
        expect(text, code).toBe(expected);
        expect(text, code).not.toContain(code);
      }
    });
  }


  it('says the assistant is restarting on SHUTTING_DOWN, in both languages', () => {
    const info = { code: 'SHUTTING_DOWN', status: 503, retryAfter: null, network: false, axios: null };
    expect(describeChatError(info, tFor('en'), 'en')).toBe('The assistant is restarting (an update is being installed, for example). Try again in a moment.');
    expect(describeChatError(info, tFor('lt'), 'lt')).toBe('Asistentas šiuo metu perkraunamas (pavyzdžiui, diegiamas atnaujinimas). Bandykite dar kartą po akimirkos.');
  });
});


describe('LOCAL_KEYS / chatFailure', () => {

  it('keeps the GUI\'s own codes out of CODE_KEYS — the assistant\'s list, which its structural test mirrors', () => {
    expect(Object.keys(LOCAL_KEYS)).toEqual(['THREAD_NOT_CREATED']);
    for (const code of Object.keys(LOCAL_KEYS)) expect(CODE_KEYS).not.toHaveProperty(code);
  });


  it('a chatFailure is its code and nothing else — whatever its message says', () => {
    const failure = chatFailure('THREAD_NOT_CREATED');
    expect(failure).toBeInstanceOf(Error);
    expect(chatErrorInfo(failure)).toEqual({ code: 'THREAD_NOT_CREATED', status: null, retryAfter: null, network: false, axios: null });
    // A code the GUI does not know is not taken on trust
    expect(chatErrorInfo(Object.assign(new Error('x'), { chatCode: 'SOMETHING' }))).toMatchObject({ code: null });
  });


  it('says a conversation could not be created, in both languages — never the code', () => {
    const info = chatErrorInfo(chatFailure('THREAD_NOT_CREATED'));
    expect(describeChatError(info, tFor('en'), 'en')).toBe('The conversation could not be created. Try again.');
    expect(describeChatError(info, tFor('lt'), 'lt')).toBe('Nepavyko sukurti pokalbio. Bandykite dar kartą.');
  });
});







// -----------------------------------------------------------
// parseEnvelope / chatErrorInfo / describeChatError
// -----------------------------------------------------------
//
// The facts of a failure and the sentence built from them.
// -----------------------------------------------------------

describe('parseEnvelope', () => {

  it('reads the assistant\'s nested envelope: the code and the 429 wait', () => {
    expect(parseEnvelope(JSON.stringify({ message: 'Too many', error: { code: 'RATE_LIMITED', message: 'Too many', retryAfterS: 12 } })))
      .toEqual({ code: 'RATE_LIMITED', retryAfter: 12 });
    expect(parseEnvelope(errorEnvelope('MODEL_TIMEOUT'))).toEqual({ code: 'MODEL_TIMEOUT', retryAfter: null });
  });


  it('reads a flat {code} too (Django\'s shape), and leading white space', () => {
    expect(parseEnvelope('  {"error": "Not found", "code": "NOT_FOUND"}')).toEqual({ code: 'NOT_FOUND', retryAfter: null });
  });


  it('answers null for anything that is not an envelope with a code', () => {
    for (const text of [undefined, null, 42, '', 'Failed to fetch', '<html>502</html>', '{broken', '{"message": "no code"}', '{"error": {"message": "no code"}}', '[1,2]']) {
      expect(parseEnvelope(text), String(text)).toBeNull();
    }
  });


  it('ignores a wait that is not a number', () => {
    expect(parseEnvelope('{"error": {"code": "RATE_LIMITED", "retryAfterS": "soon"}}')).toEqual({ code: 'RATE_LIMITED', retryAfter: null });
  });
});


describe('chatErrorInfo', () => {

  it('a refused turn (APICallError): the status, the code and the wait from its body', () => {
    const body = JSON.stringify({ message: 'x', error: { code: 'RATE_LIMITED', message: 'x', retryAfterS: 12 } });
    expect(chatErrorInfo(apiCallError(429, body))).toEqual({ code: 'RATE_LIMITED', status: 429, retryAfter: 12, network: false, axios: null });
  });


  it('a refusal without an envelope (a proxy\'s page): the status only', () => {
    expect(chatErrorInfo(apiCallError(502, '<html><h1>502</h1></html>'))).toEqual({ code: null, status: 502, retryAfter: null, network: false, axios: null });
  });


  it('the stream\'s error chunk (an Error whose message is the envelope): the code', () => {
    expect(chatErrorInfo(new Error(errorEnvelope('STREAM_FAILED')))).toEqual({ code: 'STREAM_FAILED', status: null, retryAfter: null, network: false, axios: null });
  });


  it('an axios failure keeps the error for the app-wide translator; without an answer it is the network', () => {
    const refused = axiosFailure(500, { error: 'x', code: 'SERVER_ERROR' });
    expect(chatErrorInfo(refused)).toEqual({ code: null, status: 500, retryAfter: null, network: false, axios: refused });
    const dropped = new AxiosError('Network Error', 'ERR_NETWORK');
    dropped.isAxiosError = true;
    expect(chatErrorInfo(dropped)).toMatchObject({ status: null, network: true, axios: dropped });
  });


  it('counts fetch\'s transport TypeError as the network — before or during the answer, in every engine\'s words', () => {
    for (const message of ['Failed to fetch', 'fetch failed', 'NetworkError when attempting to fetch resource.', 'network error', 'Load failed']) {
      expect(chatErrorInfo(new TypeError(message)).network, message).toBe(true);
    }
  });


  it('does not blame the connection for a TypeError from a bug (it said "No connection to the server")', () => {
    expect(chatErrorInfo(new TypeError('Cannot read properties of undefined (reading \'map\')'))).toEqual({
      code: null, status: null, retryAfter: null, network: false, axios: null,
    });
  });


  it('survives nothing at all and a plain Error', () => {
    for (const error of [null, undefined, new Error('boom'), 'text']) {
      expect(chatErrorInfo(error)).toMatchObject({ code: null, status: null, network: false, axios: null });
    }
  });
});


describe('describeChatError', () => {

  const t = tFor('en');
  const info = (extra) => ({ code: null, status: null, retryAfter: null, network: false, axios: null, ...extra });


  it('says nothing for no failure', () => {
    expect(describeChatError(null, t, 'en')).toBe('');
  });


  it('a 429 names the real wait when the assistant sent one, and says "a moment" when not', () => {
    expect(describeChatError(info({ code: 'RATE_LIMITED', status: 429, retryAfter: 12 }), t, 'en')).toBe('Too many questions in a row. Wait 12 s and try again.');
    expect(describeChatError(info({ code: 'RATE_LIMITED', status: 429 }), t, 'en')).toBe('Too many questions in a row. Wait a moment and try again.');
    expect(describeChatError(info({ code: 'RATE_LIMITED', status: 429, retryAfter: 12 }), tFor('lt'), 'lt')).toBe('Per daug klausimų iš eilės. Palaukite 12 s ir bandykite dar kartą.');
  });


  it('a chat code wins over everything else', () => {
    expect(describeChatError(info({ code: 'NOT_CONFIGURED', status: 500, network: true }), t, 'en')).toBe(en.ERRORS.NOT_CONFIGURED);
  });


  it('an axios failure speaks through utils/errors, in the locale given', () => {
    expect(describeChatError(info({ status: 413, axios: axiosFailure(413, { error: 'x', code: 'FILE_TOO_LARGE' }) }), t, 'en')).toBe('The file is too large.');
    expect(describeChatError(info({ status: 413, axios: axiosFailure(413, { error: 'x', code: 'FILE_TOO_LARGE' }) }), tFor('lt'), 'lt')).toBe('Failas per didelis.');
  });


  it('then the network, then the status class, then the generic line — never a raw code', () => {
    expect(describeChatError(info({ network: true }), t, 'en')).toBe(en.ERRORS.NETWORK);
    expect(describeChatError(info({ status: 429 }), t, 'en')).toBe(en.ERRORS.RATE_LIMITED_NOWAIT);
    expect(describeChatError(info({ status: 401 }), t, 'en')).toBe(en.ERRORS.SESSION);
    expect(describeChatError(info({ status: 503 }), t, 'en')).toBe(en.ERRORS.SERVER);
    expect(describeChatError(info({ status: 422 }), t, 'en')).toBe(en.ERRORS.INVALID);
    expect(describeChatError(info({ code: 'SOMETHING_NEW', status: 409 }), t, 'en')).toBe(en.ERRORS.INVALID);
    expect(describeChatError(info({ code: 'SOMETHING_NEW' }), t, 'en')).toBe(en.ERRORS.UNKNOWN);
    expect(describeChatError(info({}), t, 'en')).toBe(en.ERRORS.UNKNOWN);
  });
});







// -----------------------------------------------------------
// A refused turn, through the page
// -----------------------------------------------------------
//
// Every code as the assistant's pre-stream refusal (a 401
// ends the session instead — its own test); the stream codes
// also as an error chunk.
// -----------------------------------------------------------

describe('a refused turn', () => {

  const answered = async (code, status) => {
    givenChatRefusal(status, code);
    const view = renderChat();
    await sendMessage(view.user, 'Labas');
    return view;
  };


  for (const [code, key] of Object.entries(CODE_KEYS).filter(([code]) => CODE_STATUS[code] !== 401)) {
    const expected = key === 'RATE_LIMITED' ? en.ERRORS.RATE_LIMITED_NOWAIT : en.ERRORS[key];
    it(`${code} (${CODE_STATUS[code]}) → "${expected}"`, async () => {
      await answered(code, CODE_STATUS[code]);
      expect(await banner()).toHaveTextContent(`Chat error: ${expected}`);
      expect(screen.queryByText(new RegExp(`\\b${code}\\b`))).toBeNull();
    });
  }


  for (const code of STREAM_CODES) {
    it(`${code} inside the stream → its sentence, the partial reply kept with the error note`, async () => {
      const turn = openChatStream();
      const { user } = renderChat();
      await sendMessage(user, 'Labas');
      await turn.requested();
      await turn.write({ type: 'start', messageId: `srv-${code}` }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
        { type: 'text-delta', id: 'txt-0', delta: 'Pradėjau rašyti ' }, errorChunk(code));
      await turn.end();
      expect(await banner()).toHaveTextContent(`Chat error: ${en.ERRORS[CODE_KEYS[code]]}`);
      const reply = screen.getByTestId('assistant-message');
      expect(within(reply).getByText('Pradėjau rašyti')).toBeInTheDocument();
      expect(within(reply).getByText('The answer was cut off by an error.')).toBeInTheDocument();
    });
  }


  it('the question stays in the conversation, the composer is free again, and "Regenerate" retries it', async () => {
    givenChatRefusal(503, 'NOT_CONFIGURED');
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await sendMessage(user, 'Ar dar reikia?');
    await banner();
    expect(screen.getAllByTestId('user-message').at(-1)).toHaveTextContent('Ar dar reikia?');
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    // Nothing was ever answered — only the note, no empty bubble;
    // not "cut off": the banner says why there is no answer
    const failed = screen.getAllByTestId('assistant-message').at(-1);
    expect(within(failed).getByText('No answer — see the notice above.')).toBeInTheDocument();
    expect(within(failed).queryByText('The answer was cut off by an error.')).toBeNull();

    const turn = openChatStream();
    await user.click(within(failed).getByRole('button', { name: 'Regenerate the answer' }));
    await turn.requested();
    // The new run clears the banner
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await turn.write(...textReply('Taip, vis dar reikia.'));
    await turn.end();
    expect(await screen.findByText('Taip, vis dar reikia.')).toBeInTheDocument();
    expect(turn.requests[0].body).toMatchObject({ trigger: 'regenerate-message', message: { parts: [{ type: 'text', text: 'Ar dar reikia?' }] } });
  });


  it('a conversation that cannot be created fails the turn: the banner says why — once, no toast — and nothing reaches the assistant', async () => {
    given.apiError('post', '/api/chat/threads', 'SERVER_ERROR', { status: 500 });
    const turns = givenChatStream(textReply('x'));
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: Server error. Try again later.');
    await settle(100);
    expect(screen.getAllByText('Server error. Try again later.', { exact: false })).toHaveLength(1);
    expect(turns).toHaveLength(0);
  });


  it('a conversation created without an id is not sent under assistant-ui\'s own draft id: the banner says so, once, and nothing reaches the assistant', async () => {
    // It went out as "__LOCALID_…", which the assistant refuses
    // (INVALID_THREAD)
    const creates = given.capture('post', '/api/chat/threads', { ...f.NEW.thread, id: undefined }, { status: 201 });
    const turns = givenChatStream(textReply('x'));
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: The conversation could not be created. Try again.');
    await settle(150);
    expect(turns).toHaveLength(0);
    expect(creates.length).toBeGreaterThan(0);
    expect(screen.getAllByText('The conversation could not be created. Try again.', { exact: false })).toHaveLength(1);
    // The draft stays a new conversation: no row, no address
    expect(address()).toBe('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New conversation');
  });


  it('…and once a create brings the id, the next question goes out under it', async () => {
    given.sequence('post', '/api/chat/threads', [
      { status: 201, body: { ...f.NEW.thread, id: undefined } },
      { status: 201, body: f.NEW.thread },
    ]);
    const turns = givenChatStream(textReply('Dabar pavyko.'));
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    await banner();
    await sendMessage(user, 'Bandau dar kartą');
    expect(await screen.findByText('Dabar pavyko.')).toBeInTheDocument();
    expect(turns.map((turn) => turn.body.id)).toEqual([f.ID.newThread]);
    await waitFor(() => expect(address()).toBe(`/chat/${f.ID.newThread}`));
  });


  it('says it in Lithuanian', async () => {
    given.json('post', '/api/chat/threads', { ...f.NEW.thread, id: undefined }, { status: 201 });
    const { user } = renderChat({ locale: 'lt' });
    await sendMessage(user, 'Labas', { locale: 'lt' });
    expect(await banner()).toHaveTextContent('Pokalbio klaida: Nepavyko sukurti pokalbio. Bandykite dar kartą.');
  });


  it('a refusal never calls the stop route', async () => {
    const stops = given.capture('post', '/api/assistant/chat/:threadId/stop', { stopped: true });
    await answered('STREAM_FAILED', 500);
    await banner();
    await settle(100);
    expect(stops).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// 429, 401, the network, the proxy, the unknown
// -----------------------------------------------------------

describe('rate limits, sessions, connections', () => {

  it('a 429 with retryAfterS names the wait', async () => {
    givenChatRefusal(429, 'RATE_LIMITED', { retryAfterS: 12 });
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: Too many questions in a row. Wait 12 s and try again.');
  });


  it('a 429 whose envelope has no wait says "a moment" (the chat reads the envelope, not the header)', async () => {
    server.use(http.post(url('/api/assistant/chat'), () => HttpResponse.json(
      { message: 'Too many', error: { code: 'RATE_LIMITED', message: 'Too many' } }, { status: 429, headers: { 'Retry-After': '30' } },
    )));
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Too many questions in a row. Wait a moment and try again.');
  });


  it('a 401 ends the session: the token goes, the page is replaced by /login (expired) and the banner says so', async () => {
    givenChatRefusal(401, 'AUTH_REQUIRED');
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await sendMessage(user, 'Labas');
    await waitFor(() => expect(window.location.navigations).toContain(`/console/login?next=${encodeURIComponent(`/chat/${f.ID.licenceThread}`)}&expired=1`));
    expect(localStorage.getItem('complianceToken')).toBeNull();
    expect(await banner()).toHaveTextContent('Your session has ended. Sign in again.');
  });


  it('a 401 on a fresh chat sends to /login without a way back to "/"', async () => {
    givenChatRefusal(401, 'SESSION_INVALID');
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    await waitFor(() => expect(window.location.navigations).toContain('/console/login?expired=1'));
  });


  it('a connection that fails before the answer: the network sentence', async () => {
    given.networkError('post', '/api/assistant/chat');
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: No connection to the server. Check your internet connection and try again.');
  });


  it('a connection that dies mid-answer: the network sentence, the partial reply kept with its note', async () => {
    const turn = openChatStream();
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-drop' }, { type: 'start-step' }, { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Pusė atsakymo ' });
    await turn.drop();
    expect(await banner()).toHaveTextContent('No connection to the server. Check your internet connection and try again.');
    const reply = screen.getByTestId('assistant-message');
    expect(within(reply).getByText('Pusė atsakymo')).toBeInTheDocument();
    expect(within(reply).getByText('The answer was cut off by an error.')).toBeInTheDocument();
  });


  it('a proxy\'s HTML error page (502): the server sentence', async () => {
    given.html('post', '/api/assistant/chat');
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: Server error. Try again later.');
  });


  it('an empty 504 from the proxy: the server sentence', async () => {
    given.empty('post', '/api/assistant/chat', 504);
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Server error. Try again later.');
  });


  it('a code nobody knows: its status class, never the code or the prose', async () => {
    givenChatRefusal(409, 'SOMETHING_NEW', { message: 'Brand new backend prose' });
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: The request was invalid — reload the page and try again.');
    expect(screen.queryByText(/SOMETHING_NEW|Brand new backend prose/)).toBeNull();
  });


  it('a stream that ends without a word or an error leaves no alert', async () => {
    givenChatStream([{ type: 'start', messageId: 'srv-empty' }, { type: 'finish', finishReason: 'stop' }]);
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
    await settle(100);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// The banner
// -----------------------------------------------------------
//
// One alert above the composer: dismissable, cleared by the
// next send and by a switch (for the thread left behind), and
// re-translated when the language changes.
// -----------------------------------------------------------

describe('the banner', () => {

  it('is an alert with a title, above the composer, and its close button dismisses it', async () => {
    givenChatRefusal(503, 'NOT_CONFIGURED');
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    const alert = await banner();
    expect(alert).toHaveTextContent('Chat error: The assistant is not configured yet — contact the administrator.');
    expect(within(alert).getByText('Chat error:').tagName).toBe('STRONG');
    await user.click(within(alert).getByRole('button', { name: 'Close the message' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it('clears when the next question is sent', async () => {
    givenChatRefusal(503, 'NOT_CONFIGURED');
    const { user } = renderChat();
    await sendMessage(user, 'Pirmas');
    await banner();
    const turn = openChatStream();
    await sendMessage(user, 'Antras');
    await turn.requested();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await turn.write(...textReply('Dabar veikia.'));
    await turn.end();
    expect(await screen.findByText('Dabar veikia.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('clears when the user switches to another conversation — and does not come back with the first one', async () => {
    givenChatRefusal(503, 'NOT_CONFIGURED');
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await sendMessage(user, 'Labas');
    await banner();
    await user.click(within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('button', { name: DORA.title }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DORA.title));
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('button', { name: LICENCE.title }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LICENCE.title));
    await settle(100);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a late failure of a conversation the user already left does not show in the open one — only back there', async () => {
    // The licence history fails only when the test says so —
    // after the user has moved on
    let fail = null;
    server.use(http.get(url('/api/chat/threads/:threadId/messages'), async ({ params }) => {
      if (params.threadId !== f.ID.licenceThread) return HttpResponse.json(f.threadMessages(params.threadId));
      await new Promise((resolve) => { fail = resolve; });
      return HttpResponse.json({ error: 'x', code: 'SERVER_ERROR' }, { status: 500 });
    }));
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LICENCE.title));
    await waitFor(() => expect(fail).not.toBeNull());
    await user.click(within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('button', { name: DORA.title }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DORA.title));
    await act(async () => { fail(); });
    await settle(200);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(within(screen.getByRole('navigation', { name: 'Conversations' })).getByRole('button', { name: LICENCE.title }));
    expect(await banner()).toHaveTextContent('Server error. Try again later.');
  });


  it('follows a language switch: the banner already on screen is re-translated, without a new request', async () => {
    const turns = givenChatRefusal(429, 'RATE_LIMITED', { retryAfterS: 12 });
    const { user } = renderChat();
    await sendMessage(user, 'Labas');
    expect(await banner()).toHaveTextContent('Chat error: Too many questions in a row. Wait 12 s and try again.');
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pokalbio klaida: Per daug klausimų iš eilės. Palaukite 12 s ir bandykite dar kartą.'));
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Uždaryti pranešimą' })).toBeInTheDocument();
    expect(turns).toHaveLength(1);
  });


  it('re-translates an axios failure (the list) as well', async () => {
    given.apiError('get', '/api/chat/threads', 'SERVER_ERROR', { status: 500 });
    const { user } = renderChat();
    expect(await banner()).toHaveTextContent('Server error. Try again later.');
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pokalbio klaida: Serverio klaida. Bandykite dar kartą vėliau.'));
  });


  it('speaks Lithuanian from the start', async () => {
    givenChatRefusal(402, 'AI_BUDGET_EXHAUSTED');
    const { user } = renderChat({ locale: 'lt' });
    await sendMessage(user, 'Labas', { locale: 'lt' });
    expect(await banner()).toHaveTextContent('Pokalbio klaida: DI paslaugos biudžetas išnaudotas — bandykite vėliau arba kreipkitės į administratorių.');
  });
});
