// -----------------------------------------------------------
//  [*] Tests — the conversation's model (pages/Chat/ModelPicker.jsx)
//
//  The model button under the message field, against the
//  backend double: it names the model the conversation
//  answers with — the default on a new chat, the thread's
//  own once picked — and its menu lists the chat models with
//  their prices per million tokens, the current one checked,
//  the default marked. A pick is PATCHed at once and the
//  button follows Django's answer, the default saved as
//  null; a new conversation is created first; a refused pick
//  keeps the saved model and says why; a list that cannot be
//  read is said in the menu. Beside the AI notice, its name
//  shown on a phone too; Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { given, readBody, server, url } from '../support/backend/server';
import * as f from '../support/backend/fixtures';
import { composer, renderChat, resetChatLayout } from '../support/chat';


// The thread every saved-model test opens
const DORA = f.thread(f.ID.doraThread);

// The models of the double's gateway, by id
const LUNA = 'gateway:azure/gpt-5.6-luna';
const SOL = 'gateway:azure/gpt-5.6-sol';

// The PATCHes a spy saw, as [path, body]
const patchesOf = (calls) => calls.map((call) => [new URL(call.url).pathname, call.body]);

// The open menu and one of its models
const menu = (name = "The conversation's model") => screen.getByRole('menu', { name });
const option = (label, name) => within(menu(name)).getByRole('menuitemradio', { name: new RegExp(`^${label.replace('.', '\\.')}\\b`) });

// A row that keeps its PATCHes, as Django does — the double
// forgets them, and a new thread's row is read again once it
// opens; answers the [id, body] pairs it was sent
const keptRow = (initial) => {
  const row = { current: initial };
  const patches = [];
  server.use(
    http.get(url('/api/chat/threads/:threadId'), ({ params }) => HttpResponse.json({ ...row.current, id: params.threadId })),
    http.patch(url('/api/chat/threads/:threadId'), async ({ params, request }) => {
      const body = await readBody(request);
      patches.push([params.threadId, body]);
      row.current = { ...row.current, ...body };
      return HttpResponse.json({ ...row.current, id: params.threadId });
    }),
  );
  return patches;
};


afterEach(() => {
  resetChatLayout();
});







// -----------------------------------------------------------
// the button and its menu
// -----------------------------------------------------------

describe('the model button', () => {

  it('names the default model on a new chat', async () => {
    renderChat();
    const button = await screen.findByRole('button', { name: 'Model: GPT-5.5' });
    expect(button).toHaveTextContent('GPT-5.5');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
  });


  it('lists the chat models newest first, as Django lists them, with their prices, the current one checked and the default marked', async () => {
    const { user } = renderChat();
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.5' }));
    const rows = within(menu()).getAllByRole('menuitemradio');
    expect(rows.map((row) => row.textContent.split(' Per ')[0])).toEqual(['GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna', 'GPT-5.5 (default)']);
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true']);
    expect(rows[3]).toHaveAccessibleName('GPT-5.5 (default) Per 1M tokens: $5.00 in, $30.00 out');
    expect(option('GPT-5.6 Luna')).toHaveAccessibleName('GPT-5.6 Luna Per 1M tokens: $0.20 in, $1.20 out');
    expect(option('GPT-5.6 Luna')).not.toHaveTextContent('default');
  });


  it('names the thread\'s own model once it has one', async () => {
    given.json('get', '/api/chat/threads/:threadId', { ...DORA, model: LUNA });
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.6 Luna' }));
    expect(option('GPT-5.6 Luna')).toHaveAttribute('aria-checked', 'true');
    expect(option('GPT-5.5')).toHaveAttribute('aria-checked', 'false');
  });


  it('says so in the menu when the list cannot be read, and names the thread\'s model from its id', async () => {
    given.apiError('get', '/api/chat/models', 'SERVER_ERROR', { status: 500 });
    given.json('get', '/api/chat/threads/:threadId', { ...DORA, model: SOL });
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.6 Sol' }));
    const empty = within(menu()).getByRole('menuitem', { name: 'The model list could not be loaded' });
    expect(empty).toHaveAttribute('aria-disabled', 'true');
  });


  it('sits under the message field beside the AI notice, its name shown on a phone too', async () => {
    renderChat({ layout: 'narrow' });
    const button = await screen.findByRole('button', { name: 'Model: GPT-5.5' });
    expect(button).toHaveTextContent('GPT-5.5');
    const form = composer().closest('form');
    expect(form).toContainElement(button);
    expect(form).toHaveTextContent('AI can make mistakes');
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderChat({ locale: 'lt' });
    await user.click(await screen.findByRole('button', { name: 'Modelis: GPT-5.5' }));
    const name = 'Pokalbio modelis';
    expect(option('GPT-5.5', name)).toHaveTextContent('(numatytasis)');
    expect(option('GPT-5.6 Luna', name).textContent.replace(/\s/g, ' ')).toContain('1 mln. žetonų: įvestis 0,20 USD, išvestis 1,20 USD');
  });
});







// -----------------------------------------------------------
// picking a model
// -----------------------------------------------------------

describe('picking a model', () => {

  it('saves the pick on the conversation, and the button follows Django\'s answer', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.5' }));
    await user.click(option('GPT-5.6 Luna'));
    expect(await screen.findByRole('button', { name: 'Model: GPT-5.6 Luna' })).toBeInTheDocument();
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { model: LUNA }]]);
  });


  it('picking the default saves null, so the conversation follows the default from then on', async () => {
    given.json('get', '/api/chat/threads/:threadId', { ...DORA, model: LUNA });
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.6 Luna' }));
    await user.click(option('GPT-5.5'));
    expect(await screen.findByRole('button', { name: 'Model: GPT-5.5' })).toBeInTheDocument();
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { model: null }]]);
  });


  it('the model already in use is no change', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.5' }));
    await user.click(option('GPT-5.5'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(patches).toHaveLength(0);
  });


  it('a new conversation is created first, then given the model', async () => {
    const created = given.spy('post', '/api/chat/threads');
    const patches = keptRow(f.NEW.thread);
    const { user } = renderChat();
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.5' }));
    await user.click(option('GPT-5.6 Sol'));
    expect(await screen.findByRole('button', { name: 'Model: GPT-5.6 Sol' })).toBeInTheDocument();
    expect(created).toHaveLength(1);
    expect(patches).toEqual([[f.ID.newThread, { model: SOL }]]);
  });


  it('a refused pick keeps the saved model and says why', async () => {
    given.apiError('patch', '/api/chat/threads/:threadId', 'UNKNOWN_MODEL', { status: 400 });
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await user.click(await screen.findByRole('button', { name: 'Model: GPT-5.5' }));
    await user.click(option('GPT-5.6 Luna'));
    expect(await screen.findByText('That model is not offered — pick another one.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Model: GPT-5.5' })).toBeInTheDocument();
  });
});
