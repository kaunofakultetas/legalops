// -----------------------------------------------------------
//  [*] Test support — the chat page's harness
//
//  The chat is the one page whose backend is not only JSON:
//  a turn answers the AI SDK v7 UI message stream as SSE
//  (assistant/app/routes/chat.js + llm/stream.js), a failed
//  turn the assistant's own envelope {message, error: {code,
//  message, retryAfterS?}}, and the composer uploads files
//  as multipart. This module builds those answers the way the
//  node assistant writes them, renders the page on both of
//  its routes, and drives the composer:
//
//    renderChat({ route })  — Chat on "/" AND "/chat/:threadId"
//                             (one element, so a URL change
//                             keeps the page mounted, like the
//                             real route table), any other
//                             path a "navigated away" probe,
//                             at a phone's, a small tablet's,
//                             a laptop's or a wide screen's
//                             width; resetChatLayout() undoes
//                             its media queries, address()
//                             reads its URL
//    sse / textChunks / toolChunks / textReply / toolReply /
//    errorEnvelope / errorChunk
//                           — the wire format of a turn
//    givenChatStream(chunks) — POST /api/assistant/chat
//                             answers that stream (captured)
//    givenChatRefusal(…)     — the pre-stream JSON envelope
//    openChatStream()        — a stream the TEST writes, chunk
//                             by chunk (incremental rendering,
//                             stop, a drop mid-answer)
//    historyRow / userRow / assistantRow — stored history
//    sendMessage / composer  — the composer as a user uses it
//    fakeFile / oversizedFile / pickFiles / dropFiles /
//    pasteFiles             — uploads
//    holdUploads()           — POST /api/documents answered
//                             when the test says so
//
//  Nothing here reaches the network: every answer is an msw
//  handler registered with server.use, dropped by the reset
//  in setup.js after the test.
//
//  Used by:
//    - tests/pages/chat*.test.jsx
// -----------------------------------------------------------

import { createElement as h } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import '@/zodSetup';
import Providers from '@/providers';
import NavigationMemory from '@/components/layout/NavigationMemory';
import Chat from '@/pages/Chat/Chat';
import { TestErrorBoundary, makeQueryClient, setLocaleCookie, authData as adminAuthData } from './render';
import { signIn } from './auth';
import { installLocationDouble } from './location';
import { mediaQueryMatches } from './setup';
import { readBody, server, url } from './backend/server';


// The chat turn's route (ChatRuntime CHAT_API)
export const CHAT_PATH = '/api/assistant/chat';

// The ai package's UI_MESSAGE_STREAM_HEADERS — what
// pipeToResponse writes before the first event
export const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'x-vercel-ai-ui-message-stream': 'v1',
  'x-accel-buffering': 'no',
};

// The prose of the assistant's generic stream-error envelope
// (llm/stream.js streamErrorText)
export const STREAM_ERROR_MESSAGE = 'The assistant could not finish the answer';

// The media queries Chat.jsx lays itself out by: sm (the
// header's conversations button has room for its words), lg
// (the thread list is a column) and 1200 px (the company
// panel is one)
export const ROOMY = '(min-width:640px)';
export const WIDE = '(min-width:1024px)';
export const EXTRA_WIDE = '(min-width:1200px)';







// -----------------------------------------------------------
// ChatAddress
// -----------------------------------------------------------
//
// A probe beside the page: the memory router's path, read
// like an address bar (the URL follows the open thread).
//
// Used by:
//   - renderChat (below)
// -----------------------------------------------------------

function ChatAddress() {
  const { pathname, search } = useLocation();
  return h('div', { 'data-testid': 'chat-address', hidden: true }, `${pathname}${search}`);
}







// -----------------------------------------------------------
// NavigatedAway
// -----------------------------------------------------------
//
// What the router shows on any path but the chat's own — a
// sidebar link, the report card's link or the company page
// link ends here.
//
// Used by:
//   - renderChat (below)
// -----------------------------------------------------------

function NavigatedAway() {
  const { pathname, search } = useLocation();
  return h('div', { 'data-testid': 'navigated-away' }, `${pathname}${search}`);
}







// -----------------------------------------------------------
// renderChat
// -----------------------------------------------------------
//
//   const { user, router } = renderChat();                       — "/" (a new chat)
//   renderChat({ route: `/chat/${f.ID.licenceThread}` })         — a deep link
//   renderChat({ authData: userAuthData, locale: 'lt' })
//   renderChat({ layout: 'narrow' })  — below sm, a phone: list + panel
//                                       are drawers, the header's list
//                                       button an icon
//   renderChat({ layout: 'small' })   — sm..md: the same drawers, the
//                                       list button in words
//   renderChat({ layout: 'panel' })   — lg and up: the panel is a column
//
// The production frame of renderPage (query client, a memory
// data router, Providers, the history tracker) with the chat
// page on both of its
// routes, signed in (the bearer token the api client and the
// chat transport send). The default layout is md..lg: the
// thread list is a column, the company panel a drawer.
//
// Used by:
//   - tests/pages/chat*.test.jsx
// -----------------------------------------------------------

export function renderChat({ route = '/', authData = adminAuthData, locale = 'en', client, layout = 'wide' } = {}) {
  setLocaleCookie(locale);
  installLocationDouble(route);
  signIn();
  if (layout !== 'narrow') mediaQueryMatches(ROOMY);
  if (layout !== 'narrow' && layout !== 'small') mediaQueryMatches(WIDE);
  if (layout === 'panel') mediaQueryMatches(EXTRA_WIDE);
  const queryClient = client ?? makeQueryClient();
  const user = userEvent.setup();

  // No JSX in a .js module — the elements by hand
  const page = h(TestErrorBoundary, null, h(Chat, { authData }), h(ChatAddress));
  const router = createMemoryRouter([
    {
      element: h(Providers, null, h(NavigationMemory), h(Outlet)),
      children: [
        { path: '/', element: page },
        { path: '/chat/:threadId', element: page },
        { path: '*', element: h(NavigatedAway) },
      ],
    },
  ], { initialEntries: [route] });

  const result = render(h(QueryClientProvider, { client: queryClient }, h(RouterProvider, { router })));

  return { ...result, router, queryClient, user };
}







// -----------------------------------------------------------
// resetChatLayout
// -----------------------------------------------------------
//
// Undoes the media queries renderChat switched on — call it
// in an afterEach of every chat test file (setup.js keeps the
// matching queries for the whole file otherwise).
//
// Used by:
//   - tests/pages/chat*.test.jsx
// -----------------------------------------------------------

export function resetChatLayout() {
  mediaQueryMatches(ROOMY, false);
  mediaQueryMatches(WIDE, false);
  mediaQueryMatches(EXTRA_WIDE, false);
}







// -----------------------------------------------------------
// address
// -----------------------------------------------------------
//
// The chat's current path ("/chat/ca…01") — the URL the
// page keeps in step with the open thread.
//
// Used by:
//   - tests/pages/chat*.test.jsx
// -----------------------------------------------------------

export function address() {
  return screen.getByTestId('chat-address').textContent;
}







// -----------------------------------------------------------
// sse
// -----------------------------------------------------------
//
//   sse([{ type: 'start' }, …]) → 'data: {"type":"start"}\n\n…data: [DONE]\n\n'
//
// The ai package's JsonToSseTransformStream: one "data:"
// event per chunk, then the [DONE] terminator (left out with
// { done: false } — a stream cut before its end).
//
// Used by:
//   - givenChatStream, openChatStream (below)
// -----------------------------------------------------------

export function sse(chunks, { done = true } = {}) {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}${done ? 'data: [DONE]\n\n' : ''}`;
}







// -----------------------------------------------------------
// replyId
// -----------------------------------------------------------
//
// A reply id as the assistant mints them ("srv-<uuid>").
//
// Used by:
//   - textReply, toolReply (below), tests
// -----------------------------------------------------------

export function replyId() {
  return `srv-${crypto.randomUUID()}`;
}







// -----------------------------------------------------------
// textChunks
// -----------------------------------------------------------
//
//   textChunks('Sveiki! Kuo galiu padėti?') → text-start, the
//   words as text-delta events, text-end
//
// One text part of a step, split into deltas at the spaces
// (what the openai-compatible provider streams: id "txt-0").
//
// Used by:
//   - textReply, toolReply (below), tests
// -----------------------------------------------------------

export function textChunks(text, id = 'txt-0') {
  return [
    { type: 'text-start', id },
    ...text.split(/(?<= )/).map((delta) => ({ type: 'text-delta', id, delta })),
    { type: 'text-end', id },
  ];
}







// -----------------------------------------------------------
// toolChunks
// -----------------------------------------------------------
//
//   toolChunks({ toolName: 'getCompany', input: {…}, output: {…} })
//   toolChunks({ toolName: 'getCompany', input, errorText: '[NOT_FOUND] …' })
//   toolChunks({ toolName: 'getCompany', input, pending: true })
//
// One tool call of a step: input start / available, then the
// output (or the tool error the assistant's streamErrorText
// writes; nothing with `pending` — the call is still running).
//
// Used by:
//   - toolReply (below), tests
// -----------------------------------------------------------

export function toolChunks({ toolName, input = {}, output, errorText, pending = false, toolCallId = `call_${toolName}_1` }) {
  const chunks = [
    { type: 'tool-input-start', toolCallId, toolName },
    { type: 'tool-input-available', toolCallId, toolName, input },
  ];
  if (pending) return chunks;
  if (errorText !== undefined) return [...chunks, { type: 'tool-output-error', toolCallId, errorText }];
  return [...chunks, { type: 'tool-output-available', toolCallId, output }];
}







// -----------------------------------------------------------
// textReply
// -----------------------------------------------------------
//
//   textReply('Atsakymas.') → the whole plain answer
//
// start (the reply id), one step with the text, finish — the
// order routes/chat.js streams a turn without tools in.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function textReply(text, { messageId = replyId(), finishReason = 'stop' } = {}) {
  return [
    { type: 'start', messageId },
    { type: 'start-step' },
    ...textChunks(text),
    { type: 'finish-step' },
    { type: 'finish', finishReason },
  ];
}







// -----------------------------------------------------------
// toolReply
// -----------------------------------------------------------
//
//   toolReply([toolChunks({…}), …], 'Final words.')
//
// A turn with tool calls: the first step carries the calls,
// the second the answer's text (omitted with text = null).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function toolReply(calls, text = 'Atlikta.', { messageId = replyId() } = {}) {
  return [
    { type: 'start', messageId },
    { type: 'start-step' },
    ...calls.flat(),
    { type: 'finish-step' },
    ...(text === null ? [] : [{ type: 'start-step' }, ...textChunks(text), { type: 'finish-step' }]),
    { type: 'finish', finishReason: text === null ? 'tool-calls' : 'stop' },
  ];
}







// -----------------------------------------------------------
// errorEnvelope
// -----------------------------------------------------------
//
//   errorEnvelope('MODEL_TIMEOUT') → '{"message":"The assistant could not finish the answer","error":{"code":"MODEL_TIMEOUT"}}'
//
// The generic envelope streamErrorText writes into an error
// chunk (a JSON STRING — the chunk's errorText).
//
// Used by:
//   - errorChunk (below), tests
// -----------------------------------------------------------

export function errorEnvelope(code, extra = {}) {
  return JSON.stringify({ message: STREAM_ERROR_MESSAGE, error: { code, ...extra } });
}







// -----------------------------------------------------------
// errorChunk
// -----------------------------------------------------------
//
// The stream's error event: { type: 'error', errorText }.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function errorChunk(code, extra) {
  return { type: 'error', errorText: errorEnvelope(code, extra) };
}







// -----------------------------------------------------------
// captureRequest
// -----------------------------------------------------------
//
// One chat request as the test reads it back: the parsed
// body, the headers, the url.
//
// Used by:
//   - givenChatStream, givenChatRefusal, openChatStream (below)
// -----------------------------------------------------------

async function captureRequest(request) {
  return {
    url: request.url,
    body: await readBody(request),
    headers: Object.fromEntries(request.headers.entries()),
  };
}







// -----------------------------------------------------------
// givenChatStream
// -----------------------------------------------------------
//
//   const turns = givenChatStream(textReply('Labas.'))
//   givenChatStream((body, i) => textReply(`Answer ${i + 1}`))
//     → turns[i] = { url, body, headers } per POST
//
// POST /api/assistant/chat answers the SSE stream of `chunks`
// (or of what the function returns for the i-th request),
// with the stream headers; { done: false } leaves out the
// [DONE] terminator.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function givenChatStream(chunks, { done = true } = {}) {
  const turns = [];
  server.use(http.post(url(CHAT_PATH), async ({ request }) => {
    const turn = await captureRequest(request);
    turns.push(turn);
    const events = typeof chunks === 'function' ? chunks(turn.body, turns.length - 1) : chunks;
    return new HttpResponse(sse(events, { done }), { headers: STREAM_HEADERS });
  }));
  return turns;
}







// -----------------------------------------------------------
// givenChatRefusal
// -----------------------------------------------------------
//
//   givenChatRefusal(429, 'RATE_LIMITED', { retryAfterS: 12 })
//   givenChatRefusal(503, 'NOT_CONFIGURED')
//
// A turn refused before the stream: the error middleware's
// envelope {message, error: {code, message, retryAfterS?}}
// with the status (and Retry-After on a 429 that has one).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function givenChatRefusal(status, code, { retryAfterS, message = `${code} (test)` } = {}) {
  const turns = [];
  server.use(http.post(url(CHAT_PATH), async ({ request }) => {
    turns.push(await captureRequest(request));
    const error = { code, message, ...(retryAfterS ? { retryAfterS } : {}) };
    const headers = retryAfterS ? { 'Retry-After': String(retryAfterS) } : undefined;
    return HttpResponse.json({ message, error }, { status, headers });
  }));
  return turns;
}







// -----------------------------------------------------------
// openChatStream
// -----------------------------------------------------------
//
//   const turn = openChatStream();
//   await sendMessage(user, 'Labas');
//   await turn.requested();              — the POST arrived
//   await turn.write(...textChunks('Pirmas '));
//   await turn.end();                    — [DONE], closed
//   turn.drop();                         — the connection dies
//   turn.requests[0].body                — what was sent
//   turn.aborted                         — the browser hung up
//
// POST /api/assistant/chat answers at once with a stream the
// test feeds: every write() flushes its events and lets React
// render them, so a test can look at a half-written answer.
// Every request of the test shares the one handler; each
// gets its own stream, `write` / `end` / `drop` act on the
// newest.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function openChatStream() {

  const encoder = new TextEncoder();
  const streams = [];
  const requests = [];
  let waiting = [];
  const state = { aborted: false };


  server.use(http.post(url(CHAT_PATH), async ({ request }) => {
    requests.push(await captureRequest(request));
    let controller;
    const body = new ReadableStream({
      start(c) { controller = c; },
      cancel() { state.aborted = true; },
    });
    request.signal?.addEventListener('abort', () => { state.aborted = true; });
    streams.push({ get controller() { return controller; }, closed: false });
    waiting.forEach((resolve) => resolve());
    waiting = [];
    return new HttpResponse(body, { headers: STREAM_HEADERS });
  }));


  const current = () => streams.at(-1);

  // Enqueue on a stream the browser may already have left —
  // a cancelled stream throws, which is the browser's business
  const enqueue = (text) => {
    const stream = current();
    if (!stream || stream.closed) return;
    try { stream.controller.enqueue(encoder.encode(text)); } catch { stream.closed = true; }
  };

  const flush = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  };


  return {
    requests,
    get aborted() { return state.aborted; },

    async requested(count = 1) {
      if (requests.length >= count && streams.length >= count) return;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`the chat POST #${count} never came`)), 4000);
        const check = () => {
          if (streams.length >= count) { clearTimeout(timer); resolve(); } else waiting.push(check);
        };
        check();
      });
    },

    async write(...chunks) {
      enqueue(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(''));
      await flush();
    },

    async end() {
      enqueue('data: [DONE]\n\n');
      const stream = current();
      if (stream && !stream.closed) {
        stream.closed = true;
        try { stream.controller.close(); } catch { /* already cancelled */ }
      }
      await flush();
    },

    async drop(error = new TypeError('network error')) {
      const stream = current();
      if (stream && !stream.closed) {
        stream.closed = true;
        try { stream.controller.error(error); } catch { /* already cancelled */ }
      }
      await flush();
    },
  };
}







// -----------------------------------------------------------
// historyRow
// -----------------------------------------------------------
//
//   historyRow('msg-u-9', { role: 'user', parts: […] }, 'msg-u-8')
//
// One stored history row as GET /api/chat/threads/{id}/
// messages answers it: {id, parent_id, format: 'ai-sdk/v6',
// content: the UIMessage without its id}.
//
// Used by:
//   - userRow, assistantRow (below), tests
// -----------------------------------------------------------

export function historyRow(id, content, parentId = null) {
  return { id, parent_id: parentId, format: 'ai-sdk/v6', content };
}







// -----------------------------------------------------------
// userRow
// -----------------------------------------------------------
//
//   userRow('msg-u-9', 'Klausimas?', 'srv-…')
//
// A stored user message with one text part.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function userRow(id, text, parentId = null, extraParts = []) {
  return historyRow(id, { role: 'user', parts: [{ type: 'text', text }, ...extraParts] }, parentId);
}







// -----------------------------------------------------------
// assistantRow
// -----------------------------------------------------------
//
//   assistantRow('srv-1', 'Atsakymas.', 'msg-u-9')
//   assistantRow('srv-1', [{ type: 'tool-getCompany', … }, …], 'msg-u-9', { status: 'stopped' })
//
// A stored reply: a plain text (one done text part after a
// step-start) or the given parts; `metadata` as the
// assistant records it ({status: 'stopped' | …}).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function assistantRow(id, textOrParts, parentId = null, metadata) {
  const parts = typeof textOrParts === 'string'
    ? [{ type: 'step-start' }, { type: 'text', state: 'done', text: textOrParts }]
    : textOrParts;
  return historyRow(id, { role: 'assistant', parts, ...(metadata ? { metadata } : {}) }, parentId);
}







// -----------------------------------------------------------
// composer
// -----------------------------------------------------------
//
// The composer's textarea, by its (visually hidden) label in
// the given language.
//
// Used by:
//   - sendMessage (below), tests
// -----------------------------------------------------------

export function composer(locale = 'en') {
  return screen.getByRole('textbox', { name: locale === 'lt' ? 'Žinutė asistentui' : 'Message to the assistant' });
}







// -----------------------------------------------------------
// sendMessage
// -----------------------------------------------------------
//
//   await sendMessage(user, 'Kokio leidimo reikia?')
//
// Types into the composer once the thread is ready (the
// input is disabled while a thread loads) and presses Enter.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export async function sendMessage(user, text, { locale = 'en' } = {}) {
  const input = await screen.findByRole('textbox', { name: locale === 'lt' ? 'Žinutė asistentui' : 'Message to the assistant' });
  await waitForEnabled(input);
  await user.click(input);
  await user.type(input, text);
  await user.keyboard('{Enter}');
}







// -----------------------------------------------------------
// waitForEnabled
// -----------------------------------------------------------
//
// Resolves once the element is no longer disabled (4 s at
// most) — the composer waits for the thread to load.
//
// Used by:
//   - sendMessage (above)
// -----------------------------------------------------------

async function waitForEnabled(element) {
  const deadline = Date.now() + 4000;
  while (element.disabled && Date.now() < deadline) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
}







// -----------------------------------------------------------
// fakeFile
// -----------------------------------------------------------
//
//   fakeFile('politika.pdf', { type: 'application/pdf', size: 2048 })
//
// A File (Node's — see setup.js) of `size` bytes, or with
// the given text as its content.
//
// Used by:
//   - dropFiles, pasteFiles (below), tests
// -----------------------------------------------------------

export function fakeFile(name, { type = 'text/plain', size, text } = {}) {
  const content = text ?? 'x'.repeat(size ?? 64);
  return new File([content], name, { type });
}







// -----------------------------------------------------------
// oversizedFile
// -----------------------------------------------------------
//
// A File that REPORTS more than the 50 MB the backend stores
// without holding the bytes (the size check reads file.size
// only).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function oversizedFile(name = 'didelis.pdf', bytes = 50 * 1024 * 1024 + 1) {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}







// -----------------------------------------------------------
// pickFiles
// -----------------------------------------------------------
//
//   await pickFiles(user, [fakeFile('a.pdf', …)])
//
// The attach button, then the files chosen in the picker it
// opens (assistant-ui appends a hidden file input to the
// body and clicks it — the newest one is this click's).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export async function pickFiles(user, files, { locale = 'en' } = {}) {
  await user.click(screen.getByRole('button', { name: locale === 'lt' ? 'Įkelti dokumentą' : 'Attach a document' }));
  const input = [...document.body.querySelectorAll('input[type="file"]')].at(-1);
  await user.upload(input, files);
}







// -----------------------------------------------------------
// holdUploads
// -----------------------------------------------------------
//
//   const uploads = holdUploads();
//   … drop a file — its chip says "Uploading…" …
//   await uploads.release(row)        — the oldest waiting
//                                       upload answers 201 row
//   await uploads.fail(500)           — or the error envelope
//   uploads.calls                     — { url, body, headers }
//
// POST /api/documents waits until the test answers it — the
// state of a chip (and of a message sent) while its upload
// is still under way.
//
// Used by:
//   - tests
// -----------------------------------------------------------

export function holdUploads() {

  const calls = [];
  const waiting = [];


  server.use(http.post(url('/api/documents'), async ({ request }) => {
    calls.push(await captureRequest(request));
    return new Promise((resolve) => { waiting.push(resolve); });
  }));


  const answer = async (response) => {
    const deadline = Date.now() + 4000;
    while (!waiting.length && Date.now() < deadline) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
    const resolve = waiting.shift();
    if (!resolve) throw new Error('no upload is waiting for an answer');
    await act(async () => {
      resolve(response);
      await new Promise((done) => setTimeout(done, 30));
    });
  };


  return {
    calls,
    release: (row) => answer(HttpResponse.json(row, { status: 201 })),
    fail: (status = 500, code = 'SERVER_ERROR') => answer(HttpResponse.json({ error: `${code} (test)`, code }, { status })),
  };
}







// -----------------------------------------------------------
// dropFiles
// -----------------------------------------------------------
//
// Drags `files` over `target` and drops them (the composer's
// drop zone listens in the capture phase).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export async function dropFiles(target, files) {
  const dataTransfer = { files, types: ['Files'], items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })), dropEffect: 'copy' };
  await act(async () => {
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
  });
}







// -----------------------------------------------------------
// pasteFiles
// -----------------------------------------------------------
//
// Pastes `files` into `target` (the composer's textarea adds
// pasted files as attachments).
//
// Used by:
//   - tests
// -----------------------------------------------------------

export async function pasteFiles(target, files) {
  await act(async () => {
    fireEvent.paste(target, { clipboardData: { files, types: ['Files'], getData: () => '' } });
  });
}
