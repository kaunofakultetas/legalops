// -----------------------------------------------------------
//  [*] Tests — Chat page (the frame and the conversation list)
//
//  The page after login, end to end against the backend
//  double: the app frame around the chat (the skip link, the
//  banner, the main navigation with Chat current, the
//  conversation list as a named landmark, the main landmark
//  titled by the open conversation), the layouts (the list
//  as a column or as a drawer — its header button the icon
//  alone on a phone, words from sm), both roles and both
//  languages; the conversation list itself — the rows from
//  GET /api/chat/threads, the skeleton, the empty state, a
//  failed or malformed list, the untitled fallback, its
//  place kept when the chat is left and come back to, its
//  edge as a splitter (dragged within its bounds, moved by
//  the keyboard, reset by a double click, the width
//  remembered; none in the drawer) — and
//  moving between conversations: a deep link /chat/:threadId,
//  a click on a row, "New conversation", a link to "/" from
//  an open conversation (the wordmark, the sidebar's Chat: a
//  fresh chat, the address settled on "/" — it used to bounce
//  between the two addresses for good), the conversation
//  remembered per user, a deep link to a thread that is gone
//  (the notice, "/", no phantom row), a deep link whose row
//  fails or is not a row (the crash the route sweep found:
//  the conversation still opens); removing a conversation
//  with its confirmation (the DELETE, the open one, a
//  refusal); renaming one from its row (the dialog, Enter /
//  Escape, a blank or too long title refused, the exact
//  PATCH body, the row and the header following, a refusal
//  put back, the drawer, Lithuanian); the title Django gives
//  a new conversation after its first turn (never a PATCH),
//  replaced by the model's once that first answer is over —
//  and never over a title the user set, even one set while
//  that title was being read; the leave guard while an
//  answer is being written (and that leaving does not stop
//  the turn on the server); and the backend contract
//  matrices of GET /api/chat/threads and
//  GET /api/chat/threads/:id.
//
//  The turn itself, the history, attachments and stop live
//  in chat-runtime.test.jsx; the tool cards, the error
//  banner and the company panel have files of their own.
// -----------------------------------------------------------

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { userAuthData } from '../support/render';
import { authData } from '../support/auth';
import { given, server, url } from '../support/backend/server';
import { describeEndpointContract, expectNoCrash, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import {
  address, givenChatStream, openChatStream, renderChat, resetChatLayout, sendMessage, textReply,
} from '../support/chat';


afterEach(() => {
  resetChatLayout();
});


// The two conversations of the fixture world, as listed
const DORA = f.thread(f.ID.doraThread);
const LICENCE = f.thread(f.ID.licenceThread);

// Words of each conversation's stored reply
const LICENCE_REPLY = /kriptoturto paslaugų teikėjo leidimo/;
const DORA_REPLY = /Pradinį pranešimą paprastai reikia pateikti per 4 valandas/;

// A thread id no fixture knows (the double answers 404)
const GONE_THREAD = 'ca000000-0000-4000-8000-00000000dead';

// The key the administrator's remembered conversation uses
const MEMORY_KEY = `chat.lastThread.${authData.id}`;

// The notice a deep link to a gone conversation leaves
const GONE_NOTICE = 'The conversation was not found or is not yours — a new conversation was opened.';

// The destinations only the administrator's sidebar lists
const ADMIN_LINKS = ['AI prompts', 'MCP servers', 'Users', 'Audit log', 'Obligation review'];

// The rename dialog's name, and the title Django keeps at most
// (chat/api/views.py thread_item: title[:200])
const RENAME = 'Rename the conversation';
const MAX_TITLE = 200;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// conversations: the list's navigation landmark. rowTitles:
// the rows top to bottom, read from their remove buttons
// ("Remove conversation: <title>" — the one accessible name
// every row carries, whatever its title). currentRow: the
// row marked aria-current="page". title: the main
// landmark's h1 — the open conversation's title. listed /
// opened wait for a list or a title. mainNav: the sidebar.
// openRename: a row's pencil clicked, its dialog found;
// titleField: the dialog's field. patchesOf: the paths and
// bodies of captured PATCHes.
// -----------------------------------------------------------

const conversations = () => screen.getByRole('navigation', { name: 'Conversations' });

const rowTitles = () => within(conversations()).queryAllByRole('button', { name: /^Remove conversation: / })
  .map((button) => button.getAttribute('aria-label').replace('Remove conversation: ', ''));

const currentRow = () => within(conversations()).queryByRole('button', { current: 'page' });

const title = () => within(screen.getByRole('main')).getByRole('heading', { level: 1 });

const rowButton = (name) => within(conversations()).getByRole('button', { name });

const mainNav = () => screen.getByRole('navigation', { name: 'Main navigation' });

const listed = async (titles) => {
  await waitFor(() => expect(rowTitles()).toEqual(titles));
};

const opened = async (name) => {
  await waitFor(() => expect(title()).toHaveTextContent(name));
};

const openRename = async (user, name, { label = 'Rename conversation', dialogName = RENAME } = {}) => {
  await user.click(await within(conversations()).findByRole('button', { name: `${label}: ${name}` }));
  return screen.findByRole('dialog', { name: dialogName });
};

const titleField = (dialog, name = 'Title') => within(dialog).getByRole('textbox', { name });

const patchesOf = (calls) => calls.map((call) => [new URL(call.url).pathname, call.body]);







// -----------------------------------------------------------
// The page frame
// -----------------------------------------------------------
//
// The landmarks and the chrome around the conversation, the
// layouts, both roles and both languages.
// -----------------------------------------------------------

describe('the page frame', () => {

  it('frames the chat in the app shell: skip link, banner, the main navigation with Chat current, the conversation list and the main landmark', async () => {
    renderChat();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Compliance assistant — home' })).toHaveAttribute('href', '/');
    expect(within(mainNav()).getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    expect(within(mainNav()).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');

    const list = conversations();
    expect(within(list).getByRole('button', { name: 'New conversation' })).toBeInTheDocument();
    expect(within(list).getByRole('heading', { level: 2, name: 'Conversations' })).toBeInTheDocument();

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(title()).toHaveTextContent('New conversation');
    expect(within(main).getByRole('button', { name: 'Company' })).toHaveAttribute('aria-controls', 'chat-company-panel');
    expect(within(main).getByRole('textbox', { name: 'Message to the assistant' })).toBeInTheDocument();
    await listed([DORA.title, LICENCE.title]);
  });


  it('opens on the welcome state: the question, what the assistant does, and three example prompts', async () => {
    renderChat();
    const main = screen.getByRole('main');
    expect(await within(main).findByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeInTheDocument();
    expect(within(main).getByText(/Describe the company — what it does, its legal form/)).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /^Our UAB provides crypto-asset exchange and custody services/ })).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: "Assess 1009 LTD's compliance with MiCA and DORA." })).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /^Check whether the MiCA articles cited in our uploaded policy/ })).toBeInTheDocument();
  });


  it('keeps Chat current in the main navigation on a conversation\'s own address', async () => {
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await opened(LICENCE.title);
    expect(within(mainNav()).getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  });


  it('lists the admin-only destinations for the administrator', async () => {
    renderChat();
    for (const name of ADMIN_LINKS) expect(within(mainNav()).getByRole('link', { name })).toBeInTheDocument();
    await listed([DORA.title, LICENCE.title]);
  });


  it('hides them from a plain user, whose chat is the same', async () => {
    renderChat({ authData: userAuthData });
    for (const name of ADMIN_LINKS) expect(within(mainNav()).queryByRole('link', { name })).toBeNull();
    for (const name of ['Chat', 'Overview', 'Companies', 'Reports', 'Legal corpus', 'AI usage', 'Jobs', 'Account']) {
      expect(within(mainNav()).getByRole('link', { name })).toBeInTheDocument();
    }
    await listed([DORA.title, LICENCE.title]);
    expect(screen.getByRole('textbox', { name: 'Message to the assistant' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeInTheDocument();
  });


  it('speaks Lithuanian: the skip link, the list, the header, the welcome state and the composer', async () => {
    renderChat({ locale: 'lt' });
    expect(screen.getByRole('link', { name: 'Pereiti prie turinio' })).toBeInTheDocument();
    const list = screen.getByRole('navigation', { name: 'Pokalbiai' });
    expect(within(list).getByRole('button', { name: 'Naujas pokalbis' })).toBeInTheDocument();
    expect(within(list).getByRole('heading', { level: 2, name: 'Pokalbiai' })).toBeInTheDocument();
    expect(await within(list).findByRole('button', { name: `Pašalinti pokalbį: ${LICENCE.title}` })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('Naujas pokalbis');
    expect(within(main).getByRole('heading', { level: 2, name: 'Apie kokią įmonę kalbėsime?' })).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: 'Įmonė' })).toBeInTheDocument();
    expect(within(main).getByRole('textbox', { name: 'Žinutė asistentui' })).toHaveAttribute('placeholder', 'Rašykite žinutę arba įkelkite dokumentą…');
    expect(within(main).getByText('DI gali klysti')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Pagrindinė navigacija' })).getByRole('link', { name: 'Pokalbis' }))
      .toHaveAttribute('aria-current', 'page');
  });


  it('below md the list is a drawer that the header\'s "Conversations" button opens, and picking a conversation closes it', async () => {
    const { user } = renderChat({ layout: 'narrow' });
    expect(screen.queryByRole('navigation', { name: 'Conversations' })).toBeNull();
    const toggle = within(screen.getByRole('main')).getByRole('button', { name: 'Conversations' });
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(toggle);
    const list = await screen.findByRole('navigation', { name: 'Conversations' });
    await user.click(await within(list).findByRole('button', { name: DORA.title }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Conversations' })).toBeNull());
    await opened(DORA.title);
    await waitFor(() => expect(address()).toBe(`/chat/${f.ID.doraThread}`));
  });


  it('below md "New conversation" in the drawer closes it too', async () => {
    const { user } = renderChat({ layout: 'narrow', route: `/chat/${f.ID.licenceThread}` });
    await opened(LICENCE.title);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Conversations' }));
    const list = await screen.findByRole('navigation', { name: 'Conversations' });
    await user.click(within(list).getByRole('button', { name: 'New conversation' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Conversations' })).toBeNull());
    await opened('New conversation');
    await waitFor(() => expect(address()).toBe('/'));
  });


  it('on a phone (below sm) the drawer\'s button is the conversations icon alone — the words took a third of a 360 px header — with the same name and popup', async () => {
    const { user } = renderChat({ layout: 'narrow' });
    const toggle = within(screen.getByRole('main')).getByRole('button', { name: 'Conversations' });
    expect(toggle.textContent).toBe('');
    expect(toggle.querySelector('[data-testid="ForumOutlinedIcon"]')).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(toggle);
    expect(await screen.findByRole('navigation', { name: 'Conversations' })).toBeInTheDocument();
  });


  it('from sm to md the button has room for its words again', async () => {
    const { user } = renderChat({ layout: 'small' });
    const toggle = within(screen.getByRole('main')).getByRole('button', { name: 'Conversations' });
    expect(toggle).toHaveTextContent(/^Conversations$/);
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(toggle);
    expect(await screen.findByRole('navigation', { name: 'Conversations' })).toBeInTheDocument();
  });


  it('names the drawer\'s icon in Lithuanian on a phone…', async () => {
    renderChat({ layout: 'narrow', locale: 'lt' });
    const toggle = within(screen.getByRole('main')).getByRole('button', { name: 'Pokalbiai' });
    expect(toggle.textContent).toBe('');
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
  });


  it('…and says it in words from sm', async () => {
    renderChat({ layout: 'small', locale: 'lt' });
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Pokalbiai' })).toHaveTextContent(/^Pokalbiai$/);
  });


  it('ends the frame with the copyright band — its last row, outside main — and hides it on a phone, whose screen the thread fills', async () => {
    renderChat();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/^Copyright ©/);
    const frame = screen.getByRole('link', { name: 'Skip to content' }).parentElement;
    expect(frame.lastElementChild).toBe(footer);
    expect(screen.getByRole('main').contains(footer)).toBe(false);
    // No layout in jsdom — the utility classes are the witness
    expect(footer).toHaveClass('hidden', 'md:block');
    await listed([DORA.title, LICENCE.title]);
  });


  it('from md the list is a column beside the conversation, without the drawer button', async () => {
    renderChat();
    expect(conversations()).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Conversations' })).toBeNull();
    await listed([DORA.title, LICENCE.title]);
  });
});







// -----------------------------------------------------------
// The conversation list
// -----------------------------------------------------------
//
// GET /api/chat/threads as rows; the loading, empty, failed
// and malformed lists.
// -----------------------------------------------------------

describe('the conversation list', () => {

  it('lists the caller\'s conversations from GET /api/chat/threads in the order Django sends them, each with its remove button', async () => {
    const calls = given.capture('get', '/api/chat/threads', { threads: f.threads });
    renderChat();
    await listed([DORA.title, LICENCE.title]);
    expect(rowButton(DORA.title)).toBeInTheDocument();
    expect(rowButton(LICENCE.title)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({});
    expect(calls[0].headers.authorization).toBe('Bearer test-token');
    // A fresh chat is none of the rows — nothing is current
    expect(currentRow()).toBeNull();
  });


  it('keeps its place: leaving the chat and coming back finds the list scrolled where it was', async () => {
    // jsdom has no layout: the list's scroller is 2000 px of rows in a 400 px column
    const rows = (element) => element.classList?.contains('overflow-y-auto') && element.closest?.('nav[aria-label="Conversations"]');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return rows(this) ? 2000 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return rows(this) ? 400 : 0; } });
    try {
      const first = renderChat();
      await listed([DORA.title, LICENCE.title]);
      const scroller = screen.getByRole('navigation', { name: 'Conversations' }).querySelector('.overflow-y-auto');
      scroller.scrollTop = 640;
      fireEvent.scroll(scroller);
      first.unmount();

      renderChat();
      await listed([DORA.title, LICENCE.title]);
      const again = screen.getByRole('navigation', { name: 'Conversations' }).querySelector('.overflow-y-auto');
      await waitFor(() => expect(again.scrollTop).toBe(640));
    } finally {
      delete HTMLElement.prototype.scrollHeight;
      delete HTMLElement.prototype.clientHeight;
    }
  });


  it('an untitled conversation reads "New conversation"', async () => {
    given.json('get', '/api/chat/threads', { threads: [{ ...DORA, title: null }, LICENCE] });
    renderChat();
    await listed(['New conversation', LICENCE.title]);
  });


  it('holds a busy skeleton, announced as loading, while the list is on its way — never "no conversations"', async () => {
    given.hang('get', '/api/chat/threads');
    renderChat();
    const skeleton = await screen.findByRole('status', { name: 'Loading conversations…' });
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    await settle(100);
    expect(screen.queryByText('No conversations yet')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('says there are no conversations yet, and how to start one, when the list is empty', async () => {
    given.json('get', '/api/chat/threads', { threads: [] });
    renderChat();
    const list = conversations();
    expect(await within(list).findByText('No conversations yet')).toBeInTheDocument();
    expect(within(list).getByText('Start a conversation — it will appear in this list.')).toBeInTheDocument();
    expect(rowTitles()).toEqual([]);
    expect(screen.queryByRole('status', { name: 'Loading conversations…' })).toBeNull();
  });


  it('shows a failed list in the chat banner with the translated sentence, the chat still usable', async () => {
    given.apiError('get', '/api/chat/threads', 'SERVER_ERROR', { status: 500, error: 'Internal server error' });
    renderChat();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Chat error: Server error. Try again later.');
    expect(within(conversations()).getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message to the assistant' })).toBeEnabled();
  });


  it('a refused list (403) says so — never the backend\'s prose', async () => {
    given.apiError('get', '/api/chat/threads', 'FORBIDDEN', { status: 403, error: 'Forbidden (backend prose)' });
    renderChat();
    expect(await screen.findByRole('alert')).toHaveTextContent('You are not allowed to do this.');
    expect(screen.queryByText(/backend prose/)).toBeNull();
  });


  it('as a column its edge is a splitter: named, focusable, valued in pixels, sizing the list', async () => {
    renderChat();
    await listed([DORA.title, LICENCE.title]);
    const edge = screen.getByRole('separator', { name: 'Resize the conversation list' });
    expect(edge).toHaveAttribute('aria-orientation', 'vertical');
    expect(edge).toHaveAttribute('tabindex', '0');
    expect(edge).toHaveAttribute('aria-valuenow', '256');
    expect(edge).toHaveAttribute('aria-valuemin', '208');
    expect(edge).toHaveAttribute('aria-controls', conversations().id);
    expect(conversations()).toHaveStyle({ width: '256px' });
  });


  it('dragging the edge follows the pointer within the bounds — 480 px at most — and the width is remembered', async () => {
    vi.stubGlobal('innerWidth', 1440);
    const first = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const edge = screen.getByRole('separator', { name: 'Resize the conversation list' });
    fireEvent.pointerDown(edge, { button: 0, clientX: 400 });
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');
    // The moves are read on the window: the pointer may leave the thin edge
    fireEvent.pointerMove(window, { clientX: 480 });
    expect(conversations()).toHaveStyle({ width: '336px' });
    fireEvent.pointerMove(window, { clientX: 900 });
    expect(conversations()).toHaveStyle({ width: '480px' });
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(conversations()).toHaveStyle({ width: '208px' });
    fireEvent.pointerMove(window, { clientX: 520 });
    fireEvent.pointerUp(window);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    expect(localStorage.getItem('chat.listWidth')).toBe('376');
    first.unmount();

    renderChat();
    await listed([DORA.title, LICENCE.title]);
    expect(conversations()).toHaveStyle({ width: '376px' });
    expect(screen.getByRole('separator', { name: 'Resize the conversation list' })).toHaveAttribute('aria-valuenow', '376');
  });


  it('never takes more than 35% of the window, so the thread keeps its room', async () => {
    // jsdom's window is 1024 px wide: 358 px at most
    localStorage.setItem('chat.listWidth', '470');
    renderChat();
    await listed([DORA.title, LICENCE.title]);
    const edge = screen.getByRole('separator', { name: 'Resize the conversation list' });
    expect(edge).toHaveAttribute('aria-valuenow', '358');
    expect(edge).toHaveAttribute('aria-valuemax', '358');
    expect(conversations()).toHaveClass('max-w-[35vw]');
  });


  it('the keyboard moves the edge a step at a time, Home and End to its bounds; a double click puts it back', async () => {
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const edge = screen.getByRole('separator', { name: 'Resize the conversation list' });
    act(() => edge.focus());
    await user.keyboard('{ArrowRight}');
    expect(edge).toHaveAttribute('aria-valuenow', '272');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(edge).toHaveAttribute('aria-valuenow', '240');
    await user.keyboard('{End}');
    expect(edge).toHaveAttribute('aria-valuenow', '358');
    await user.keyboard('{Home}');
    expect(edge).toHaveAttribute('aria-valuenow', '208');
    expect(conversations()).toHaveStyle({ width: '208px' });
    expect(localStorage.getItem('chat.listWidth')).toBe('208');
    await user.dblClick(edge);
    expect(edge).toHaveAttribute('aria-valuenow', '256');
    expect(localStorage.getItem('chat.listWidth')).toBe('256');
  });


  it('the drawer has no edge to drag: the list fills it', async () => {
    const { user } = renderChat({ layout: 'narrow' });
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Conversations' }));
    const list = await screen.findByRole('navigation', { name: 'Conversations' });
    expect(list).toHaveClass('w-full');
    expect(screen.queryByRole('separator', { name: 'Resize the conversation list' })).toBeNull();
  });


  it('skips rows it could not open (no id) and keeps the good ones', async () => {
    given.json('get', '/api/chat/threads', { threads: [{ title: 'Be id' }, null, 'eilutė', { id: 42, title: 'Skaičius' }, LICENCE] });
    renderChat();
    await listed([LICENCE.title]);
    expectNoCrash();
  });


  it('a list answer that is not {threads: [...]} lists nothing and breaks nothing', async () => {
    given.json('get', '/api/chat/threads', { threads: 'none' });
    renderChat();
    expect(await within(conversations()).findByText('No conversations yet')).toBeInTheDocument();
    expectNoCrash();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Opening and switching conversations
// -----------------------------------------------------------
//
// The deep link, a row click, "New conversation", the
// per-user memory, and the deep links that cannot be opened
// the normal way.
// -----------------------------------------------------------

describe('opening and switching conversations', () => {

  it('a deep link opens that conversation: its row is current, the header carries its title, the history is shown', async () => {
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await opened(LICENCE.title);
    await waitFor(() => expect(currentRow()).toHaveTextContent(LICENCE.title));
    const main = screen.getByRole('main');
    expect(await within(main).findByText(LICENCE_REPLY)).toBeInTheDocument();
    expect(within(main).getByText('Kokio leidimo reikia UAB Pavyzdys, jei ji saugo klientų kriptoturtą?')).toBeInTheDocument();
    expect(within(main).queryByRole('heading', { name: 'Which company shall we talk about?' })).toBeNull();
    expect(address()).toBe(`/chat/${f.ID.licenceThread}`);
  });


  it('a click on another row opens it and moves the address there, without asking', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await user.click(rowButton(DORA.title));
    await opened(DORA.title);
    expect(await screen.findByText(DORA_REPLY)).toBeInTheDocument();
    expect(screen.queryByText(LICENCE_REPLY)).toBeNull();
    await waitFor(() => expect(address()).toBe(`/chat/${f.ID.doraThread}`));
    expect(currentRow()).toHaveTextContent(DORA.title);
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('"New conversation" opens a fresh chat and takes the address back to "/"', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await user.click(within(conversations()).getByRole('button', { name: 'New conversation' }));
    await opened('New conversation');
    expect(await screen.findByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeInTheDocument();
    await waitFor(() => expect(address()).toBe('/'));
    expect(currentRow()).toBeNull();
    // A fresh chat is nobody's memory
    expect(localStorage.getItem(MEMORY_KEY)).toBeNull();
  });


  it.each([
    ['the navbar\'s wordmark', () => within(screen.getByRole('banner')).getByRole('link', { name: 'Compliance assistant — home' })],
    ['the sidebar\'s Chat link', () => within(mainNav()).getByRole('link', { name: 'Chat' })],
  ])('a link to "/" from an open conversation (%s) opens a fresh chat and the address stays on "/"', async (_, link) => {
    const { user, router } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await waitFor(() => expect(localStorage.getItem(MEMORY_KEY)).toBe(f.ID.licenceThread));
    const addresses = [];
    const unsubscribe = router.subscribe((state) => addresses.push(state.location.pathname));
    await user.click(link());
    expect(await screen.findByRole('heading', { level: 2, name: 'Which company shall we talk about?' })).toBeInTheDocument();
    await settle(400);
    unsubscribe();
    // It bounced between "/" and the conversation's address
    // for good: the address followed the runtime's old thread
    // before the switch to the fresh one had landed
    expect(addresses).not.toContain(`/chat/${f.ID.licenceThread}`);
    expect(address()).toBe('/');
    expect(title()).toHaveTextContent('New conversation');
    expect(currentRow()).toBeNull();
    expect(localStorage.getItem(MEMORY_KEY)).toBeNull();
  });


  it('remembers the open conversation per user…', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await waitFor(() => expect(localStorage.getItem(MEMORY_KEY)).toBe(f.ID.licenceThread));
    await user.click(rowButton(DORA.title));
    await waitFor(() => expect(localStorage.getItem(MEMORY_KEY)).toBe(f.ID.doraThread));
  });


  it('…and coming back to "/" reopens it', async () => {
    localStorage.setItem(MEMORY_KEY, f.ID.doraThread);
    renderChat();
    await waitFor(() => expect(address()).toBe(`/chat/${f.ID.doraThread}`));
    await opened(DORA.title);
    expect(await screen.findByText(DORA_REPLY)).toBeInTheDocument();
  });


  it('another user\'s memory is not reopened', async () => {
    localStorage.setItem(MEMORY_KEY, f.ID.doraThread);
    renderChat({ authData: userAuthData });
    await listed([DORA.title, LICENCE.title]);
    await settle(100);
    expect(address()).toBe('/');
    expect(title()).toHaveTextContent('New conversation');
  });


  it('a deep link to a conversation that is gone lands on "/" with a notice, opens nothing and forgets it', async () => {
    localStorage.setItem(MEMORY_KEY, GONE_THREAD);
    renderChat({ route: `/chat/${GONE_THREAD}` });
    expect(await screen.findByText(GONE_NOTICE)).toBeInTheDocument();
    await waitFor(() => expect(address()).toBe('/'));
    await listed([DORA.title, LICENCE.title]);
    await settle(200);
    // No phantom "New conversation" row for the gone thread,
    // and the page stays on "/" (it used to bounce back to the
    // dead address and sit on the phantom)
    expect(rowTitles()).toEqual([DORA.title, LICENCE.title]);
    expect(address()).toBe('/');
    expect(title()).toHaveTextContent('New conversation');
    expect(localStorage.getItem(MEMORY_KEY)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a deep link whose row fails (500) still opens the conversation and says what failed — the switch keeps the banner', async () => {
    given.apiError('get', '/api/chat/threads/:threadId', 'SERVER_ERROR', { status: 500 });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    expect(await screen.findByText(LICENCE_REPLY)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await waitFor(() => expect(currentRow()).toHaveTextContent(LICENCE.title));
  });


  it('a deep link whose every GET fails shows the failure instead of crashing', async () => {
    for (const path of ['/api/chat/threads', '/api/chat/threads/:threadId', '/api/chat/threads/:threadId/messages', '/api/assistant/chat/:threadId/status']) {
      given.apiError('get', path, 'SERVER_ERROR', { status: 500 });
    }
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await settle(300);
    expectNoCrash();
    expect(screen.getByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(address()).toBe(`/chat/${f.ID.licenceThread}`);
  });


  for (const [what, body] of [['a JSON string', 'not what you expected'], ['an empty object', {}]]) {
    it(`a deep link whose list and row answer ${what} still opens the conversation (it crashed: "Entry not available in the store")`, async () => {
      given.json('get', '/api/chat/threads', body);
      given.json('get', '/api/chat/threads/:threadId', body);
      renderChat({ route: `/chat/${f.ID.licenceThread}` });
      expect(await screen.findByText(LICENCE_REPLY)).toBeInTheDocument();
      await settle(200);
      expectNoCrash();
      expect(title()).toHaveTextContent('New conversation');
      expect(address()).toBe(`/chat/${f.ID.licenceThread}`);
    });
  }


  it('a deep link whose answer is another thread\'s row is not trusted: the address\'s conversation opens, untitled', async () => {
    given.json('get', '/api/chat/threads/:threadId', DORA);
    given.json('get', '/api/chat/threads', { threads: [] });
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    expect(await screen.findByText(LICENCE_REPLY)).toBeInTheDocument();
    await settle(100);
    expect(address()).toBe(`/chat/${f.ID.licenceThread}`);
    expect(title()).toHaveTextContent('New conversation');
  });
});







// -----------------------------------------------------------
// Removing a conversation
// -----------------------------------------------------------
//
// The trash icon, its confirmation, the DELETE (Django
// archives), the open conversation, a refusal.
// -----------------------------------------------------------

describe('removing a conversation', () => {

  it('asks first, naming the conversation; Cancel keeps it and sends nothing', async () => {
    const deletes = given.capture('delete', '/api/chat/threads/:threadId', { ok: true });
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await user.click(within(conversations()).getByRole('button', { name: `Remove conversation: ${DORA.title}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove the conversation?' });
    expect(dialog).toHaveTextContent(`“${DORA.title}” will disappear from the list. It cannot be brought back from this app.`);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rowTitles()).toEqual([DORA.title, LICENCE.title]);
    expect(deletes).toHaveLength(0);
  });


  it('Remove DELETEs /api/chat/threads/:id and the row goes', async () => {
    const deletes = given.capture('delete', '/api/chat/threads/:threadId', { ok: true });
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await user.click(within(conversations()).getByRole('button', { name: `Remove conversation: ${DORA.title}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await listed([LICENCE.title]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletes.map((call) => new URL(call.url).pathname)).toEqual([`/api/chat/threads/${f.ID.doraThread}`]);
  });


  it('removing the open conversation opens a fresh chat and takes the address to "/"', async () => {
    const { user } = renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(LICENCE_REPLY);
    await user.click(within(conversations()).getByRole('button', { name: `Remove conversation: ${LICENCE.title}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await listed([DORA.title]);
    await opened('New conversation');
    await waitFor(() => expect(address()).toBe('/'));
    expect(screen.queryByText(LICENCE_REPLY)).toBeNull();
  });


  it('a refused removal toasts why, keeps the dialog open and the row in place — nothing escapes as an unhandled rejection', async () => {
    given.apiError('delete', '/api/chat/threads/:threadId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await user.click(within(conversations()).getByRole('button', { name: `Remove conversation: ${DORA.title}` }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeEnabled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await listed([DORA.title, LICENCE.title]);
  });


  it('an untitled conversation is "New conversation" in its remove button and its dialog', async () => {
    given.json('get', '/api/chat/threads', { threads: [{ ...DORA, title: null }] });
    const { user } = renderChat();
    await listed(['New conversation']);
    await user.click(within(conversations()).getByRole('button', { name: 'Remove conversation: New conversation' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('“New conversation” will disappear from the list.');
  });


  it('speaks Lithuanian in the confirmation', async () => {
    const { user } = renderChat({ locale: 'lt' });
    const list = screen.getByRole('navigation', { name: 'Pokalbiai' });
    await user.click(await within(list).findByRole('button', { name: `Pašalinti pokalbį: ${DORA.title}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Pašalinti pokalbį?' });
    expect(dialog).toHaveTextContent(`Pokalbis „${DORA.title}“ dings iš sąrašo. Grąžinti jo per šią programą nebus galima.`);
    expect(within(dialog).getByRole('button', { name: 'Pašalinti' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Atšaukti' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Renaming a conversation
// -----------------------------------------------------------
//
// The pencil on a row, its dialog (Enter saves, Escape
// cancels), what is refused before any request, the exact
// PATCH /api/chat/threads/:id body, the row and the header
// following, a refusal put back. The rename PATCH branch of
// the adapter had no control at all before.
// -----------------------------------------------------------

describe('renaming a conversation', () => {

  it('each row has a rename button; its dialog holds the title, selected whole, with the 200-character limit and a count', async () => {
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    expect(within(conversations()).getByRole('button', { name: `Rename conversation: ${LICENCE.title}` })).toBeInTheDocument();
    const dialog = await openRename(user, DORA.title);
    const field = titleField(dialog);
    expect(field).toHaveValue(DORA.title);
    await waitFor(() => expect(field).toHaveFocus());
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, DORA.title.length]);
    expect(field).toHaveAttribute('maxLength', String(MAX_TITLE));
    expect(dialog).toHaveTextContent(`${DORA.title.length} / ${MAX_TITLE} chars`);
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });


  it('Save PATCHes /api/chat/threads/:id with {title} alone, trimmed — and the row and the header follow', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await opened(DORA.title);
    const dialog = await openRename(user, DORA.title);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), '  IRT incidentų terminai  ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { title: 'IRT incidentų terminai' }]]);
    await listed(['IRT incidentų terminai', LICENCE.title]);
    await opened('IRT incidentų terminai');
    expect(currentRow()).toHaveTextContent('IRT incidentų terminai');
    expect(address()).toBe(`/chat/${f.ID.doraThread}`);
  });


  it('Enter in the field saves', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const dialog = await openRename(user, LICENCE.title);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), 'KPT leidimas{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.licenceThread}`, { title: 'KPT leidimas' }]]);
    await listed([DORA.title, 'KPT leidimas']);
  });


  it('Escape — or Cancel — closes it without a request, the title as it was', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await opened(DORA.title);
    let dialog = await openRename(user, DORA.title);
    await user.type(titleField(dialog), 'Niekada neišsaugotas');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // A new opening starts from the title again, not from
    // what was typed the last time
    dialog = await openRename(user, DORA.title);
    expect(titleField(dialog)).toHaveValue(DORA.title);
    await user.type(titleField(dialog), ' irgi ne');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(patches).toHaveLength(0);
    expect(rowTitles()).toEqual([DORA.title, LICENCE.title]);
    expect(title()).toHaveTextContent(DORA.title);
  });


  it('a blank title is refused on the spot — no request — and typing clears the refusal', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const dialog = await openRename(user, DORA.title);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(titleField(dialog)).toHaveAccessibleDescription('Required');
    expect(titleField(dialog)).toHaveAttribute('aria-invalid', 'true');
    await settle(50);
    expect(patches).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: RENAME })).toBeInTheDocument();
    await user.type(titleField(dialog), 'x');
    expect(titleField(dialog)).toHaveAttribute('aria-invalid', 'false');
  });


  it('the field stops at the 200 characters Django keeps, and such a title is sent whole', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const dialog = await openRename(user, DORA.title);
    await user.clear(titleField(dialog));
    await user.paste('x'.repeat(MAX_TITLE + 50));
    expect(titleField(dialog)).toHaveValue('x'.repeat(MAX_TITLE));
    expect(dialog).toHaveTextContent(`${MAX_TITLE} / ${MAX_TITLE} chars`);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ title: 'x'.repeat(MAX_TITLE) });
  });


  it('a longer title that got past the field is refused, never cut', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const dialog = await openRename(user, DORA.title);
    fireEvent.change(titleField(dialog), { target: { value: 'y'.repeat(MAX_TITLE + 1) } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(titleField(dialog)).toHaveAccessibleDescription(`Too long (at most ${MAX_TITLE} characters)`);
    await settle(50);
    expect(patches).toHaveLength(0);
  });


  it('an unchanged title closes the dialog without a request', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const dialog = await openRename(user, LICENCE.title);
    await user.type(titleField(dialog), '  ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await settle(50);
    expect(patches).toHaveLength(0);
  });


  it('an untitled conversation reads "New conversation" on its button and gets its first title', async () => {
    given.json('get', '/api/chat/threads', { threads: [{ ...DORA, title: null }, LICENCE] });
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat();
    await listed(['New conversation', LICENCE.title]);
    const dialog = await openRename(user, 'New conversation');
    expect(titleField(dialog)).toHaveValue('');
    await user.type(titleField(dialog), 'DORA incidentai{Enter}');
    await listed(['DORA incidentai', LICENCE.title]);
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { title: 'DORA incidentai' }]]);
  });


  it('a refused rename keeps the dialog open with the reason and puts the old title back — no toast on top', async () => {
    given.apiError('patch', '/api/chat/threads/:threadId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await opened(DORA.title);
    const dialog = await openRename(user, DORA.title);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), 'Neišsaugosiu{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getAllByText('Server error. Try again later.')).toHaveLength(1);
    expect(titleField(dialog)).toHaveValue('Neišsaugosiu');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The page behind the dialog is aria-hidden while it is open
    await listed([DORA.title, LICENCE.title]);
    expect(title()).toHaveTextContent(DORA.title);
  });


  it('a conversation that is gone by now (404) says so in the dialog', async () => {
    given.apiError('patch', '/api/chat/threads/:threadId', 'NOT_FOUND', { status: 404 });
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    const dialog = await openRename(user, DORA.title);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), 'Per vėlu{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await listed([DORA.title, LICENCE.title]);
  });


  it('works from the list in the drawer below md', async () => {
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const { user } = renderChat({ layout: 'narrow' });
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Conversations' }));
    await screen.findByRole('navigation', { name: 'Conversations' });
    const dialog = await openRename(user, DORA.title);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), 'Iš stalčiaus{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: RENAME })).toBeNull());
    await listed(['Iš stalčiaus', LICENCE.title]);
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.doraThread}`, { title: 'Iš stalčiaus' }]]);
  });


  it('speaks Lithuanian', async () => {
    const { user } = renderChat({ locale: 'lt' });
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Pokalbiai' }))
      .getAllByRole('button', { name: /^Pervadinti pokalbį: / })).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: `Pervadinti pokalbį: ${DORA.title}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Pokalbio pervadinimas' });
    const field = titleField(dialog, 'Pavadinimas');
    expect(dialog).toHaveTextContent(`${DORA.title.length} / ${MAX_TITLE} simb.`);
    expect(within(dialog).getByRole('button', { name: 'Išsaugoti' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Atšaukti' })).toBeInTheDocument();
    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(field).toHaveAccessibleDescription('Privalomas laukas');
  });
});







// -----------------------------------------------------------
// The title of a new conversation
// -----------------------------------------------------------
//
// Django titles a thread from its first user message; the
// page pulls that title in after the first turn — locally,
// never with a PATCH of its own, and never over a title the
// user set: not when the user renamed the thread before the
// turn, nor while the title's read was on its way.
// -----------------------------------------------------------

describe('the title of a new conversation', () => {

  it('takes the title Django gave it after the first turn — in the header and the list — without a PATCH', async () => {
    const patches = given.capture('patch', '/api/chat/threads/:threadId', {});
    given.json('get', '/api/chat/threads/:threadId', { ...f.NEW.thread, title: 'Kokio leidimo reikia keityklai?', messageCount: 1 });
    givenChatStream(textReply('Reikia KPT leidimo.'));
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await sendMessage(user, 'Kokio leidimo reikia keityklai?');
    expect(await screen.findByText('Reikia KPT leidimo.')).toBeInTheDocument();
    await opened('Kokio leidimo reikia keityklai?');
    await waitFor(() => expect(rowTitles()).toContain('Kokio leidimo reikia keityklai?'));
    await waitFor(() => expect(address()).toBe(`/chat/${f.ID.newThread}`));
    expect(currentRow()).toHaveTextContent('Kokio leidimo reikia keityklai?');
    await settle(100);
    expect(patches).toHaveLength(0);
  });


  it('takes the model\'s title once the first answer is over, in place of the opening of the message — without a PATCH', async () => {
    const patches = given.capture('patch', '/api/chat/threads/:threadId', {});
    const opening = 'Mūsų UAB saugo klientų kriptoturtą. Kokio leidimo reikia?';
    const row = { current: { ...f.NEW.thread, title: opening, messageCount: 1 } };
    server.use(http.get(url('/api/chat/threads/:threadId'), () => HttpResponse.json(row.current)));
    const turn = openChatStream();
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await sendMessage(user, opening);
    await turn.requested();
    // Django's own title first: the opening of the message
    await opened(opening);
    // The assistant stores the model's title before the stream ends
    row.current = { ...row.current, title: 'Kriptoturto saugojimo leidimas' };
    await turn.write(...textReply('Reikia CASP leidimo.'));
    await turn.end();
    expect(await screen.findByText('Reikia CASP leidimo.')).toBeInTheDocument();
    await opened('Kriptoturto saugojimo leidimas');
    await waitFor(() => expect(rowTitles()).toContain('Kriptoturto saugojimo leidimas'));
    expect(rowTitles()).not.toContain(opening);
    await settle(100);
    expect(patches).toHaveLength(0);
  });


  it('a title the user sets during the first answer stays when it ends, whatever the row says then', async () => {
    const opening = 'Kokio leidimo reikia keityklai?';
    const row = { current: { ...f.NEW.thread, title: opening, messageCount: 1 } };
    server.use(http.get(url('/api/chat/threads/:threadId'), () => HttpResponse.json(row.current)));
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const turn = openChatStream();
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await sendMessage(user, opening);
    await turn.requested();
    await opened(opening);
    const dialog = await openRename(user, opening);
    await user.clear(titleField(dialog));
    await user.type(titleField(dialog), 'Keityklos licencija{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    row.current = { ...row.current, title: 'Kriptovaliutų keityklos leidimas' };
    await turn.write(...textReply('Reikia KPT leidimo.'));
    await turn.end();
    expect(await screen.findByText('Reikia KPT leidimo.')).toBeInTheDocument();
    await settle(150);
    expect(title()).toHaveTextContent('Keityklos licencija');
    expect(rowTitles()).toContain('Keityklos licencija');
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.newThread}`, { title: 'Keityklos licencija' }]]);
  });


  it('stays "New conversation" while Django has no title yet', async () => {
    givenChatStream(textReply('Labas.'));
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await sendMessage(user, 'Labas');
    expect(await screen.findByText('Labas.')).toBeInTheDocument();
    await settle(100);
    expect(title()).toHaveTextContent('New conversation');
  });


  it('a title refresh that fails leaves the title alone and says nothing', async () => {
    given.apiError('get', '/api/chat/threads/:threadId', 'SERVER_ERROR', { status: 500 });
    givenChatStream(textReply('Labas.'));
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await sendMessage(user, 'Labas');
    expect(await screen.findByText('Labas.')).toBeInTheDocument();
    await settle(100);
    expect(title()).toHaveTextContent('New conversation');
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('never replaces a title the user set while the first-turn title was being read — it did', async () => {
    // Every read of the new thread's row waits until the test
    // lets it through, then carries Django's own first-turn
    // title (read before the user's PATCH landed)
    const held = [];
    let open = false;
    const autoTitled = { ...f.NEW.thread, title: 'Kokio leidimo reikia keityklai?', messageCount: 1 };
    server.use(http.get(url('/api/chat/threads/:threadId'), () => (open
      ? HttpResponse.json(autoTitled)
      : new Promise((resolve) => { held.push(() => resolve(HttpResponse.json(autoTitled))); }))));
    const patches = given.spy('patch', '/api/chat/threads/:threadId');
    const turn = openChatStream();
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await sendMessage(user, 'Kokio leidimo reikia keityklai?');
    await turn.requested();
    // Two reads wait: the header's row, and the title's own
    // (sent once the turn was accepted)
    await waitFor(() => expect(held.length).toBeGreaterThanOrEqual(2));

    // The new row is there, untitled: the user names it
    await listed(['New conversation', DORA.title, LICENCE.title]);
    const dialog = await openRename(user, 'New conversation');
    await user.type(titleField(dialog), 'Keityklos licencija{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await listed(['Keityklos licencija', DORA.title, LICENCE.title]);

    // Only now does the title's read come back
    await act(async () => {
      open = true;
      held.splice(0).forEach((release) => release());
    });
    await turn.write(...textReply('Reikia KPT leidimo.'));
    await turn.end();
    expect(await screen.findByText('Reikia KPT leidimo.')).toBeInTheDocument();
    await settle(150);
    expect(rowTitles()).toEqual(['Keityklos licencija', DORA.title, LICENCE.title]);
    expect(title()).toHaveTextContent('Keityklos licencija');
    expect(patchesOf(patches)).toEqual([[`/api/chat/threads/${f.ID.newThread}`, { title: 'Keityklos licencija' }]]);
  });


  it('never replaces the title of an untitled conversation the user renamed before its next turn', async () => {
    given.json('get', '/api/chat/threads', { threads: [{ ...DORA, title: null }, LICENCE] });
    const row = { current: { ...DORA, title: null } };
    server.use(http.get(url('/api/chat/threads/:threadId'), () => HttpResponse.json(row.current)));
    givenChatStream(textReply('Keturios valandos.'));
    const { user } = renderChat({ route: `/chat/${f.ID.doraThread}` });
    await listed(['New conversation', LICENCE.title]);
    const dialog = await openRename(user, 'New conversation');
    await user.type(titleField(dialog), 'Mano DORA klausimai{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await opened('Mano DORA klausimai');
    // A row read after the turn that still carries a title of
    // Django's own
    row.current = { ...DORA, title: 'Django pavadinimas' };
    await sendMessage(user, 'O per kiek laiko galutinį pranešimą?');
    expect(await screen.findByText('Keturios valandos.')).toBeInTheDocument();
    await settle(150);
    expect(title()).toHaveTextContent('Mano DORA klausimai');
    expect(rowTitles()).toEqual(['Mano DORA klausimai', LICENCE.title]);
  });
});







// -----------------------------------------------------------
// The leave guard
// -----------------------------------------------------------
//
// While an answer is being written: leaving the chat through
// the router asks, reload / tab close gets the browser's own
// prompt; switching conversations does not ask. Leaving
// never stops the turn on the server.
// -----------------------------------------------------------

describe('the leave guard', () => {

  // A new chat whose first answer is half written
  const startAnswer = async ({ locale = 'en' } = {}) => {
    const stops = given.capture('post', '/api/assistant/chat/:threadId/stop', { stopped: true });
    const turn = openChatStream();
    const view = renderChat({ locale });
    await sendMessage(view.user, 'Kokio leidimo reikia?', { locale });
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-leave-1' }, { type: 'start-step' },
      { type: 'text-start', id: 'txt-0' }, { type: 'text-delta', id: 'txt-0', delta: 'Pirmoji dalis ' });
    await screen.findByText('Pirmoji dalis');
    return { ...view, turn, stops };
  };


  it('asks before leaving the chat while an answer is being written; Stay keeps the page and the answer flowing', async () => {
    const { user, turn } = await startAnswer();
    await user.click(within(mainNav()).getByRole('link', { name: 'Overview' }));
    // An alertdialog: it interrupts the user's own navigation
    const dialog = await screen.findByRole('alertdialog', { name: 'The answer is still being written' });
    expect(dialog).toHaveTextContent('The assistant is still writing its answer. It will be saved and shown when you come back to this conversation. Leave anyway?');
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByTestId('navigated-away')).toBeNull();
    await turn.write({ type: 'text-delta', id: 'txt-0', delta: 'ir antroji.' });
    expect(await screen.findByText('Pirmoji dalis ir antroji.')).toBeInTheDocument();
  });


  it('Leave goes — and does NOT stop the turn on the server: the reply is saved there for the way back', async () => {
    const { user, stops } = await startAnswer();
    await user.click(within(mainNav()).getByRole('link', { name: 'Overview' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/dashboard');
    await settle(200);
    expect(stops).toHaveLength(0);
  });


  it('switching conversations mid-answer does not ask', async () => {
    const { user } = await startAnswer();
    await user.click(await within(conversations()).findByRole('button', { name: DORA.title }));
    await opened(DORA.title);
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('a reload or tab close mid-answer gets the browser\'s prompt, and none once the answer is in', async () => {
    const { turn } = await startAnswer();
    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    await turn.write({ type: 'text-end', id: 'txt-0' }, { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' });
    await turn.end();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });


  it('an idle chat is left without a question', async () => {
    const { user } = renderChat();
    await listed([DORA.title, LICENCE.title]);
    await user.click(within(mainNav()).getByRole('link', { name: 'Companies' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/companies');
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('speaks Lithuanian', async () => {
    const { user, stops } = await startAnswer({ locale: 'lt' });
    await user.click(within(screen.getByRole('navigation', { name: 'Pagrindinė navigacija' })).getByRole('link', { name: 'Apžvalga' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Atsakymas dar rašomas' });
    expect(dialog).toHaveTextContent('Asistentas dar rašo atsakymą. Jis bus išsaugotas ir pasirodys, kai grįšite į šį pokalbį. Ar tikrai norite išeiti?');
    expect(within(dialog).getByRole('button', { name: 'Likti' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Išeiti' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/dashboard');
    expect(stops).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// The list on "/", and a conversation's row as its deep link
// reads it (the header's company label reads the same row).
// A gone thread is no alert but the notice and "/" —
// asserted in "opening and switching conversations".
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/chat/threads',
  fixture: { threads: f.threads },
  render: () => renderChat(),
  chrome: () => screen.getByRole('main') && conversations(),
  loaded: async () => { await within(conversations()).findByRole('button', { name: LICENCE.title }); },
  loading: () => screen.getByRole('status', { name: 'Loading conversations…' }),
});


describeEndpointContract({
  path: '/api/chat/threads/:threadId',
  fixture: LICENCE,
  render: () => renderChat({ route: `/chat/${f.ID.licenceThread}` }),
  chrome: () => screen.getByRole('main') && conversations(),
  loaded: async () => { await screen.findByText(LICENCE_REPLY); },
  skip: {
    '404 NOT_FOUND → alert': 'a gone conversation is no failure: the notice and "/" (see "a deep link to a conversation that is gone")',
  },
});

