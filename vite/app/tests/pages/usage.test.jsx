// -----------------------------------------------------------
//  [*] Tests — Usage page (what the AI models cost)
//
//  The /usage page end to end against the backend double:
//  the summary over GET /api/usage (today's budget as a meter
//  — unlimited for an admin —, the period's totals in USD and
//  compact tokens, the cost and token charts one column per
//  day, the splits by purpose, by model and — for everyone's
//  usage — by user); the period and "whose" filters and the
//  exact query they send (days, scope=all, userId), the
//  previous numbers dimmed and busy while the next load; the
//  user picker (GET /api/users, an admin's only, its failure
//  said with a retry); the call log over GET /api/usage/calls
//  (the columns, the user column once scoped, the purpose
//  filter, paging by offset with "Load more", a call that
//  moved pages listed once, the empty and failed log); the
//  call dialog over GET /api/usage/calls/{id} (numbers, the
//  chat transcript, the tool calls in words, opened by a
//  click or from the keyboard); a plain user's own usage;
//  coming back (the period, the scope and the purpose read
//  from and replaced in the address — a scope the page does
//  not know read as "Mine" —, the open call as an entry of
//  its own, a chart's table view kept); the units in both
//  languages; and the backend contract matrix for all four
//  GETs.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Usage from '@/pages/Usage/Usage';


// A usage call's id by its two-digit number in the fixtures
const CALL = (n) => `11000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

// The calls of each account, newest first, as the double
// scopes them
const ADMIN_CALLS = f.usageCalls.filter((call) => call.userId === f.ID.admin);
const JONAS_CALLS = f.usageCalls.filter((call) => call.userId === f.ID.jonas);

// The licence chat turn: a question, a markdown answer and
// one tool call
const LICENCE_CALL = f.usageCall(CALL(7));

// 150 calls for the paging tests, each with its own id
const MANY_CALLS = Array.from({ length: 150 }, (_, i) => ({
  ...ADMIN_CALLS[0], id: `11000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
}));







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// main: the page's content landmark. section: a card is a
// <section> labelled by its heading (a region). statTile: a
// headline figure is a Paper holding its label <p>, value
// and period — the label is the only handle. pick opens a
// select by its label and clicks an option. The call log's
// DataGrid rows carry their call's id as data-id, its cells
// their field as data-field. columns reads the call log's
// header titles (a sortable one is named with its sort
// button too); text reads a cell with Intl's no-break
// spaces as plain ones. recordUsage answers GET /api/usage
// for the query's period and scope from the fixture world,
// recordCalls GET /api/usage/calls from `rows` by offset and
// limit — both record each query.
// -----------------------------------------------------------

const main = () => screen.getByRole('main');

const renderUsage = (session = authData, options = {}) =>
  renderPage(<Usage authData={session} />, { route: '/usage', path: '/usage', ...options });

const section = (name) => within(main()).getByRole('region', { name });

const statTile = (label) => within(main()).getByText(label, { selector: 'p' }).closest('.MuiPaper-root');

async function pick(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

const callLog = () => within(main()).getByRole('grid');

const callRow = (id) => callLog().querySelector(`[role="row"][data-id="${id}"]`);

const findCallRow = async (id) => {
  await waitFor(() => expect(callRow(id)).not.toBeNull());
  return callRow(id);
};

const cell = (row, field) => row.querySelector(`[data-field="${field}"]`);

const shownCallIds = () => [...callLog().querySelectorAll('[role="row"][data-id]')].map((row) => row.getAttribute('data-id'));

// Cell texts with Intl's no-break spaces read as plain ones
const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();

const columns = (grid) => within(grid).getAllByRole('columnheader').map(text);

const term = (container, name) => within(container).getByText(name, { selector: 'dt' }).nextElementSibling;

const splitRows = (name) => within(section(name)).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map(text));

const dayColumns = (chart) => within(screen.getByRole('group', { name: chart })).getAllByRole('img');

function recordUsage() {
  const queries = [];
  server.use(http.get(url('/api/usage'), ({ request }) => {
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    queries.push(query);
    return HttpResponse.json(f.usage({ days: Number(query.days), scope: query.scope ?? '', userId: query.userId ?? '' }));
  }));
  return queries;
}

function recordCalls(rows, total = rows.length) {
  const queries = [];
  server.use(http.get(url('/api/usage/calls'), ({ request }) => {
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    queries.push(query);
    const offset = Number(query.offset ?? 0);
    return HttpResponse.json({ calls: rows.slice(offset, offset + Number(query.limit ?? 50)), total });
  }));
  return queries;
}

async function openCall(user, id) {
  const row = await findCallRow(id);
  await user.click(within(cell(row, 'createdAt')).getByRole('button'));
  return screen.findByRole('dialog', { name: 'AI call' });
}







// -----------------------------------------------------------
// The summary
// -----------------------------------------------------------

describe('Usage — the summary', () => {

  it('frames the page: title, subtitle, the filters, then the budget, the totals, the charts, the splits and the call log', async () => {
    renderUsage();
    expect(within(main()).getByRole('heading', { level: 1, name: 'AI usage' })).toBeInTheDocument();
    expect(within(main()).getByText('How many AI model calls were made and what they cost: chat, analysis steps, embeddings, prompt tests.')).toBeInTheDocument();
    expect(within(main()).getByRole('combobox', { name: 'Period' })).toHaveTextContent('Last 30 days');
    expect(within(main()).getByRole('combobox', { name: 'Whose' })).toHaveTextContent('Mine');
    await within(main()).findByText('$0.8652');
    expect(within(main()).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Today\'s budget', 'Cost per day (USD)', 'Tokens per day', 'By purpose', 'By model', 'Call log',
    ]);
  });


  it('asks the last 30 days of the admin\'s own calls, and the call log without a scope', async () => {
    const usage = given.capture('get', '/api/usage', f.usage({ days: 30 }));
    const calls = recordCalls(ADMIN_CALLS);
    renderUsage();
    await within(main()).findByText('$0.8652');
    await findCallRow(CALL(23));
    expect(usage).toHaveLength(1);
    expect(usage[0].query).toEqual({ days: '30' });
    expect(calls).toEqual([{ limit: '100', offset: '0' }]);
  });


  it('shows the period\'s totals: the cost in USD with its period, the calls, and the tokens compactly', async () => {
    renderUsage();
    await within(main()).findByText('$0.8652');
    expect(statTile('Cost')).toHaveTextContent('Cost$0.8652Last 30 days');
    expect(statTile('Calls')).toHaveTextContent('Calls7');
    expect(statTile('Input tokens')).toHaveTextContent('Input tokens104.6k');
    expect(statTile('Output tokens')).toHaveTextContent('Output tokens35.4k');
  });


  it('shows today\'s budget — unlimited for an admin, so a sum without a bar — with how the day is counted', async () => {
    renderUsage();
    const card = await within(main()).findByRole('region', { name: 'Today\'s budget' });
    expect(within(card).getByText('The budget follows the UTC day and resets at midnight UTC.')).toBeInTheDocument();
    expect(within(card).getByText('Used today')).toBeInTheDocument();
    expect(within(card).getByText('$0.216 · Unlimited')).toBeInTheDocument();
    expect(within(card).queryByRole('meter')).toBeNull();
  });


  it('splits the period by purpose (labelled, by name) and by model (costliest first): calls, tokens, cost', async () => {
    renderUsage();
    await within(main()).findByText('$0.8652');
    expect(splitRows('By purpose')).toEqual([
      ['Chat', '2', '27.3k', '1.9k', '$0.1922'],
      ['Embedding', '1', '820', '0', '$0.00'],
      ['Analysis step', '3', '71.2k', '32.6k', '$0.62'],
      ['Prompt test', '1', '5.2k', '900', '$0.053'],
    ]);
    expect(within(section('By purpose')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Purpose', 'Calls', 'Input', 'Output', 'Cost']);
    expect(splitRows('By model')).toEqual([
      ['gateway:azure/gpt-5.6-terra', '2', '51.4k', '31.1k', '$0.476'],
      ['gateway:azure/gpt-5.5', '4', '52.3k', '4.3k', '$0.3892'],
      ['gateway:azure/text-embedding-3-small', '1', '820', '0', '$0.00'],
    ]);
    expect(within(main()).queryByRole('region', { name: 'By user' })).toBeNull();
  });


  it('draws the cost and the tokens per day as two charts, one column per day, each named with its date and values', async () => {
    renderUsage();
    await within(main()).findByText('$0.8652');
    const cost = dayColumns('Cost per day (USD)');
    expect(cost).toHaveLength(30);
    expect(cost[0]).toHaveAccessibleName('29/08: Cost $0.00');
    expect(cost.at(-1)).toHaveAccessibleName('27/09: Cost $0.216');
    expect(cost.at(-4)).toHaveAccessibleName('24/09: Cost $0.404');
    const tokens = dayColumns('Tokens per day');
    expect(tokens).toHaveLength(30);
    expect(tokens.at(-1)).toHaveAccessibleName('27/09: Input 30k, Output 5.8k');
    expect(tokens.at(-7)).toHaveAccessibleName('21/09: Input 18.2k, Output 1.2k');
  });


  it('shows a chart\'s numbers as a table on request', async () => {
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    const card = section('Cost per day (USD)');
    await user.click(within(card).getByRole('button', { name: 'Show table' }));
    const rows = within(card).getAllByRole('row');
    expect(rows).toHaveLength(31);
    expect(within(rows.at(-1)).getAllByRole('cell').map((c) => c.textContent)).toEqual(['27/09', '$0.216', '$0.216']);
    await user.click(within(card).getByRole('button', { name: 'Show chart' }));
    expect(dayColumns('Cost per day (USD)')).toHaveLength(30);
  });


  it('a period without calls says so, the totals at zero and no charts or splits', async () => {
    given.json('get', '/api/usage', f.usage({ days: 30, userId: f.ID.lina }));
    given.json('get', '/api/usage/calls', { calls: [], total: 0 });
    renderUsage();
    expect(await within(main()).findByText('No AI calls in this period')).toBeInTheDocument();
    expect(statTile('Cost')).toHaveTextContent('Cost$0.00Last 30 days');
    expect(statTile('Calls')).toHaveTextContent('Calls0');
    expect(statTile('Input tokens')).toHaveTextContent('Input tokens0');
    expect(within(main()).queryByRole('region', { name: 'Cost per day (USD)' })).toBeNull();
    expect(within(main()).queryByRole('region', { name: 'By purpose' })).toBeNull();
    expect(await within(section('Call log')).findByText('No calls')).toBeInTheDocument();
  });


  it('a failed summary shows the translated error with a retry, the filters standing; the retry shows the usage', async () => {
    given.sequence('get', '/api/usage', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: f.usage({ days: 30 }) }]);
    const { user } = renderUsage();
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('The usage could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(within(main()).getByRole('combobox', { name: 'Period' })).toBeInTheDocument();
    expect(within(main()).queryByRole('region', { name: 'Call log' })).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(main()).findByText('$0.8652')).toBeInTheDocument();
    await waitFor(() => expect(within(main()).queryByRole('alert')).toBeNull());
  });


  it('shows a spinner named after the page while the first answer is on its way', async () => {
    given.hang('get', '/api/usage');
    renderUsage();
    expect(await within(main()).findByRole('progressbar', { name: 'AI usage' })).toBeInTheDocument();
    expect(within(main()).queryByRole('region', { name: 'Call log' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// The period and "whose" selects, the exact queries they
// send, the stale numbers while the next arrive, and the
// user picker's own list.
// -----------------------------------------------------------

describe('Usage — filters', () => {

  it('offers the last 7, 30 and 90 days; a period asks for exactly that many days and draws one column per day', async () => {
    const usage = given.capture('get', '/api/usage', f.usage({ days: 7 }));
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await user.click(screen.getByRole('combobox', { name: 'Period' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Last 7 days', 'Last 30 days', 'Last 90 days']);
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }));
    await waitFor(() => expect(usage.at(-1).query).toEqual({ days: '7' }));
    await waitFor(() => expect(dayColumns('Cost per day (USD)')).toHaveLength(7));
    expect(statTile('Cost')).toHaveTextContent('Cost$0.8652Last 7 days');
  });


  it('a 90-day period asks for 90 days', async () => {
    const usage = given.capture('get', '/api/usage', f.usage({ days: 90 }));
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await pick(user, 'Period', 'Last 90 days');
    await waitFor(() => expect(usage.at(-1).query).toEqual({ days: '90' }));
    await waitFor(() => expect(dayColumns('Tokens per day')).toHaveLength(90));
  });


  it('keeps the previous numbers on screen, dimmed and marked busy, while another period loads', async () => {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    server.use(http.get(url('/api/usage'), async ({ request }) => {
      const days = Number(new URL(request.url).searchParams.get('days'));
      if (days === 7) await held;
      return HttpResponse.json(f.usage({ days }));
    }));
    const { user } = renderUsage();
    const cost = await within(main()).findByText('$0.8652');
    const content = cost.closest('[aria-busy]');
    expect(content).toHaveAttribute('aria-busy', 'false');

    await pick(user, 'Period', 'Last 7 days');
    await waitFor(() => expect(content).toHaveAttribute('aria-busy', 'true'));
    expect(content).toHaveClass('opacity-60');
    expect(dayColumns('Cost per day (USD)')).toHaveLength(30);

    release();
    await waitFor(() => expect(content).toHaveAttribute('aria-busy', 'false'));
    expect(content).not.toHaveClass('opacity-60');
    expect(dayColumns('Cost per day (USD)')).toHaveLength(7);
  });


  it('offers an admin their own usage, everyone\'s, and every account by name from GET /api/users', async () => {
    const users = given.capture('get', '/api/users', { users: f.users });
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await user.click(screen.getByRole('combobox', { name: 'Whose' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent))
      .toEqual(['Mine', 'All users', 'Rūta Administratorė', 'Jonas Naudotojas', 'Lina Buvusi']);
    expect(users).toHaveLength(1);
  });


  it('"All users" asks scope=all: everyone\'s totals, the split by user, no budget card, and the call log\'s user column', async () => {
    const usage = recordUsage();
    const calls = recordCalls(f.usageCalls);
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await pick(user, 'Whose', 'All users');

    await waitFor(() => expect(usage.at(-1)).toEqual({ days: '30', scope: 'all' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ scope: 'all', limit: '100', offset: '0' }));
    expect(await within(main()).findByText('$2.14')).toBeInTheDocument();
    expect(statTile('Calls')).toHaveTextContent('Calls24');
    expect(splitRows('By user')).toEqual([
      ['Jonas Naudotojas', '15', '164.1k', '42.1k', '$1.27'],
      ['Rūta Administratorė', '7', '104.6k', '35.4k', '$0.8652'],
      ['—', '2', '486.5k', '0', '$0.0097'],
    ]);
    expect(within(main()).queryByRole('region', { name: 'Today\'s budget' })).toBeNull();

    await findCallRow(CALL(21));
    expect(columns(callLog())).toEqual(['Time', 'User', 'Purpose', 'Task', 'Model', 'Input', 'Output', 'Cost', 'Duration', 'Outcome', 'Tools']);
    expect(cell(callRow(CALL(21)), 'userName')).toHaveTextContent('Jonas Naudotojas');
    expect(within(section('Call log')).getByText('Showing 24 of 24')).toBeInTheDocument();
  });


  it('an account asks userId=: that account\'s totals and today\'s budget as a meter, the call log scoped to them', async () => {
    const usage = recordUsage();
    const calls = recordCalls(JONAS_CALLS);
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await pick(user, 'Whose', 'Jonas Naudotojas');

    await waitFor(() => expect(usage.at(-1)).toEqual({ days: '30', userId: f.ID.jonas }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ userId: f.ID.jonas, limit: '100', offset: '0' }));
    expect(await within(main()).findByText('$1.27')).toBeInTheDocument();
    const card = section('Today\'s budget');
    expect(within(card).getByText('$0.0526 of $5.00')).toBeInTheDocument();
    expect(within(card).getByRole('meter', { name: 'Used today' })).toHaveAttribute('aria-valuemax', '5');
    expect(within(main()).queryByRole('region', { name: 'By user' })).toBeNull();
    await findCallRow(CALL(21));
    expect(shownCallIds()).toHaveLength(15);
    expect(cell(callRow(CALL(21)), 'userName')).toHaveTextContent('Jonas Naudotojas');
  });


  it('back to "Mine" asks without a scope again', async () => {
    const usage = recordUsage();
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await pick(user, 'Whose', 'All users');
    await waitFor(() => expect(usage.at(-1)).toEqual({ days: '30', scope: 'all' }));
    await pick(user, 'Whose', 'Mine');
    await waitFor(() => expect(within(main()).getByRole('region', { name: 'Today\'s budget' })).toBeInTheDocument());
    expect(usage[0]).toEqual({ days: '30' });
    expect(columns(callLog())).not.toContain('User');
  });


  it('a failed user list leaves "Mine" and "All users" on offer and says why, with a retry that brings the people', async () => {
    given.sequence('get', '/api/users', [{ status: 500, body: apiError('SERVER_ERROR') }, { body: { users: f.users } }]);
    const { user } = renderUsage();
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('The user list could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(await within(main()).findByText('$0.8652')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Whose' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Mine', 'All users']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(main()).queryByRole('alert')).toBeNull());
    await pick(user, 'Whose', 'Lina Buvusi');
  });


  it('offers an account without a display name by its email', async () => {
    given.json('get', '/api/users', { users: [f.adminUser, { ...f.plainUser, displayName: '' }] });
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await user.click(screen.getByRole('combobox', { name: 'Whose' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Mine', 'All users', 'Rūta Administratorė', 'jonas@example.lt']);
  });


  it('a plain user sees only their own usage: no "Whose" picker, no user list, their budget as a meter', async () => {
    const users = given.capture('get', '/api/users', { users: f.users });
    const usage = given.capture('get', '/api/usage', f.usage({ days: 30, userId: f.ID.jonas }));
    const calls = recordCalls(JONAS_CALLS);
    renderUsage(userAuthData);
    expect(await within(main()).findByText('$1.27')).toBeInTheDocument();
    expect(within(main()).queryByRole('combobox', { name: 'Whose' })).toBeNull();
    expect(within(section('Today\'s budget')).getByText('$0.0526 of $5.00')).toBeInTheDocument();
    await findCallRow(CALL(21));
    await settle(50);
    expect(users).toHaveLength(0);
    expect(usage[0].query).toEqual({ days: '30' });
    expect(calls).toEqual([{ limit: '100', offset: '0' }]);
    expect(columns(callLog())).not.toContain('User');
  });
});







// -----------------------------------------------------------
// The call log
// -----------------------------------------------------------

describe('Usage — the call log', () => {

  it('lists the calls newest first with every column in words and units', async () => {
    renderUsage();
    const row = await findCallRow(CALL(23));
    expect(shownCallIds()).toEqual(ADMIN_CALLS.map((call) => call.id));
    expect(columns(callLog())).toEqual(['Time', 'Purpose', 'Task', 'Model', 'Input', 'Output', 'Cost', 'Duration', 'Outcome', 'Tools']);
    const expected = {
      createdAt: '27/09/2026, 09:52', kind: 'Analysis step', purpose: 'report.gap_analysis', model: 'gateway:azure/gpt-5.6-terra',
      inputTokens: '10,200', outputTokens: '4,300', costUsd: '$0.072', durationMs: '41.8 s', outcome: 'Succeeded', toolCallCount: '0',
    };
    for (const [field, text] of Object.entries(expected)) expect(cell(row, field), field).toHaveTextContent(text);

    const chat = callRow(CALL(7));
    expect(cell(chat, 'kind')).toHaveTextContent('Chat');
    expect(cell(chat, 'costUsd')).toHaveTextContent('$0.1275');
    expect(cell(chat, 'durationMs')).toHaveTextContent('14.2 s');
    expect(cell(chat, 'toolCallCount')).toHaveTextContent('1');
    expect(cell(callRow(CALL(19)), 'durationMs')).toHaveTextContent('640 ms');
    expect(cell(callRow(CALL(16)), 'durationMs')).toHaveTextContent('3 min 52 s');
    expect(within(section('Call log')).getByText('Showing 7 of 7')).toBeInTheDocument();
    expect(within(section('Call log')).queryByRole('button', { name: 'Load more' })).toBeNull();
  });


  it('names an outcome that went wrong in words, and a call of no account "—" in the user column', async () => {
    given.json('get', '/api/usage/calls', { calls: [{ ...ADMIN_CALLS[0], outcome: 'budget' }, { ...f.usageCalls.find((c) => c.userId === null), outcome: 'timeout' }], total: 2 });
    const { user } = renderUsage();
    await within(main()).findByText('$0.8652');
    await pick(user, 'Whose', 'All users');
    await waitFor(() => expect(columns(callLog())).toContain('User'));
    expect(cell(callRow(CALL(23)), 'outcome')).toHaveTextContent('Budget exceeded');
    expect(cell(callRow(CALL(17)), 'outcome')).toHaveTextContent('Timed out');
    expect(cell(callRow(CALL(17)), 'userName')).toHaveTextContent('—');
  });


  it('pages by offset: "Load more" asks for the next 100 from what arrived and appends them, until every call is shown', async () => {
    const queries = recordCalls(MANY_CALLS);
    const { user } = renderUsage();
    const log = await within(main()).findByRole('region', { name: 'Call log' });
    expect(await within(log).findByText('Showing 100 of 150')).toBeInTheDocument();
    expect(queries).toEqual([{ limit: '100', offset: '0' }]);

    await user.click(within(log).getByRole('button', { name: 'Load more' }));
    expect(await within(log).findByText('Showing 150 of 150')).toBeInTheDocument();
    expect(queries.at(-1)).toEqual({ limit: '100', offset: '100' });
    expect(within(log).queryByRole('button', { name: 'Load more' })).toBeNull();
  });


  it('lists a call once when newer calls pushed it onto the next page while the log was open', async () => {
    // The second page starts with the first page's last call
    const queries = [];
    server.use(http.get(url('/api/usage/calls'), ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get('offset'));
      queries.push(offset);
      return HttpResponse.json({ calls: offset === 0 ? MANY_CALLS.slice(0, 100) : MANY_CALLS.slice(99, 149), total: 150 });
    }));
    const { user } = renderUsage();
    const log = await within(main()).findByRole('region', { name: 'Call log' });
    await user.click(await within(log).findByRole('button', { name: 'Load more' }));
    expect(await within(log).findByText('Showing 149 of 150')).toBeInTheDocument();
    expect(queries).toEqual([0, 100]);
    // The offset counts what the server sent — nothing left to ask
    expect(within(log).queryByRole('button', { name: 'Load more' })).toBeNull();
  });


  it('the purpose filter offers every kind in words and asks for one kind, keeping the scope', async () => {
    const queries = recordCalls(ADMIN_CALLS.filter((call) => call.kind === 'chat'));
    const { user } = renderUsage();
    await findCallRow(CALL(7));
    await user.click(within(section('Call log')).getByRole('combobox', { name: 'Purpose' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['All', 'Chat', 'Analysis step', 'Embedding', 'Prompt test']);
    await user.click(screen.getByRole('option', { name: 'Chat' }));
    await waitFor(() => expect(queries.at(-1)).toEqual({ limit: '100', offset: '0', kind: 'chat' }));
    await waitFor(() => expect(shownCallIds()).toEqual([CALL(20), CALL(7)]));

    await pick(user, 'Whose', 'All users');
    await waitFor(() => expect(queries.at(-1)).toEqual({ scope: 'all', limit: '100', offset: '0', kind: 'chat' }));
  });


  it('says "No calls" for an empty log', async () => {
    given.json('get', '/api/usage/calls', { calls: [], total: 0 });
    renderUsage();
    const log = await within(main()).findByRole('region', { name: 'Call log' });
    expect(await within(log).findByText('No calls')).toBeInTheDocument();
    expect(within(log).queryByRole('grid')).toBeNull();
  });


  it('a failed log says so with a retry, the summary standing', async () => {
    given.sequence('get', '/api/usage/calls', [{ status: 400, body: apiError('INVALID_QUERY', 'kind must be one of chat, job_step, embed, prompt_test') }, { body: { calls: ADMIN_CALLS, total: 7 } }]);
    const { user } = renderUsage();
    const log = await within(main()).findByRole('region', { name: 'Call log' });
    const alert = await within(log).findByRole('alert');
    expect(alert).toHaveTextContent('kind must be one of chat, job_step, embed, prompt_test');
    expect(within(log).queryByText('No calls')).toBeNull();
    expect(statTile('Calls')).toHaveTextContent('Calls7');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await findCallRow(CALL(23))).toBeInTheDocument();
  });


  it('leaves out a call without an id and a repeated one', async () => {
    given.json('get', '/api/usage/calls', { calls: [ADMIN_CALLS[0], ADMIN_CALLS[0], { ...ADMIN_CALLS[1], id: null }, ADMIN_CALLS[2]], total: 4 });
    renderUsage();
    await findCallRow(ADMIN_CALLS[2].id);
    expect(shownCallIds()).toEqual([ADMIN_CALLS[0].id, ADMIN_CALLS[2].id]);
  });
});







// -----------------------------------------------------------
// The call dialog
// -----------------------------------------------------------

describe('Usage — one call', () => {

  it('a click on a row opens the call: its kind, outcome, time, model, cost, duration and tokens with reasoning', async () => {
    const detail = given.capture('get', '/api/usage/calls/:callId', LICENCE_CALL);
    const { user } = renderUsage();
    const row = await findCallRow(CALL(7));
    await user.click(cell(row, 'model'));
    const dialog = await screen.findByRole('dialog', { name: 'AI call' });
    expect(detail[0].url).toMatch(new RegExp(`/api/usage/calls/${CALL(7)}$`));
    expect(await within(dialog).findByText('21/09/2026, 09:02 · gateway:azure/gpt-5.5 · $0.1275 · 14.2 s')).toBeInTheDocument();
    // The kind and the outcome are the dialog's two chips
    expect([...dialog.querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent)).toEqual(['Chat', 'Succeeded']);
    expect(within(dialog).getByText('Tokens: 18,234 / 1,210 (reasoning 256)')).toBeInTheDocument();
  });


  it('says how much of the input the provider read from its cache and wrote to it — when it did', async () => {
    given.json('get', '/api/usage/calls/:callId', { ...LICENCE_CALL, inputTokens: 246000, cachedInputTokens: 200000, cacheWriteTokens: 40000 });
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(7));
    expect(await within(dialog).findByText('Tokens: 246,000 / 1,210 (reasoning 256) · of the input, 200,000 read from the cache and 40,000 written to it'))
      .toBeInTheDocument();
  });


  it('a chat turn shows what the user asked and what the assistant answered — as recorded — and links to the chat', async () => {
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(7));
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Chat excerpt' })).toBeInTheDocument();
    const said = within(dialog).getByText('User').nextElementSibling;
    expect(said).toHaveTextContent(LICENCE_CALL.transcript.user);
    const answered = within(dialog).getByText('Assistant').nextElementSibling;
    expect(answered.textContent).toBe(LICENCE_CALL.transcript.assistant);
    expect(answered).toHaveTextContent('**kriptoturto paslaugų teikėjo leidimo**');
    expect(within(dialog).getByRole('link', { name: 'Open the chat' })).toHaveAttribute('href', `/chat/${f.ID.licenceThread}`);
  });


  it('lists the tool calls with their fields in words', async () => {
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(7));
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Tool calls' })).toBeInTheDocument();
    expect(term(dialog, 'Tool')).toHaveTextContent('searchLegalCorpus');
    expect(term(dialog, 'Duration (ms)')).toHaveTextContent('812');
    expect(term(dialog, 'Succeeded')).toHaveTextContent('Yes');
    expect(within(dialog).queryByText('Ms')).toBeNull();
  });


  it('names a failed tool call\'s error code', async () => {
    given.json('get', '/api/usage/calls/:callId', { ...LICENCE_CALL, toolCalls: [{ name: 'getLegalProvision', ms: 30011, ok: false, code: 'TIMEOUT' }] });
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(7));
    await within(dialog).findByRole('heading', { name: 'Tool calls' });
    expect(term(dialog, 'Tool')).toHaveTextContent('getLegalProvision');
    expect(term(dialog, 'Succeeded')).toHaveTextContent('No');
    expect(term(dialog, 'Error code')).toHaveTextContent('TIMEOUT');
  });


  it('a call without a chat excerpt says so, with no chat link and no tool calls', async () => {
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(23));
    expect(await within(dialog).findByText('This call has no chat excerpt.')).toBeInTheDocument();
    expect(within(dialog).getByText('Analysis step')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Open the chat' })).toBeNull();
    expect(within(dialog).queryByRole('heading', { name: 'Tool calls' })).toBeNull();
  });


  it('opens from the keyboard: the time is a button named after the call', async () => {
    const { user } = renderUsage();
    const row = await findCallRow(CALL(22));
    const button = within(cell(row, 'createdAt')).getByRole('button', { name: 'Open the call of 27/09/2026, 09:41' });
    button.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'AI call' });
    expect(await within(dialog).findByText('27/09/2026, 09:41 · gateway:azure/gpt-5.5 · $0.144 · 1 min 24 s')).toBeInTheDocument();
  });


  it('opens from the keyboard with Space too — the grid leaves the key to the time button', async () => {
    const { user } = renderUsage();
    const row = await findCallRow(CALL(22));
    within(cell(row, 'createdAt')).getByRole('button', { name: 'Open the call of 27/09/2026, 09:41' }).focus();
    await user.keyboard(' ');
    const dialog = await screen.findByRole('dialog', { name: 'AI call' });
    expect(await within(dialog).findByText('27/09/2026, 09:41 · gateway:azure/gpt-5.5 · $0.144 · 1 min 24 s')).toBeInTheDocument();
  });


  it('"Close" shuts the dialog', async () => {
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(20));
    await within(dialog).findByText('Tool calls');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('a failed call request shows the error in the dialog, with a retry that loads it', async () => {
    given.sequence('get', '/api/usage/calls/:callId', [{ status: 404, body: apiError('NOT_FOUND', 'Call not found') }, { body: LICENCE_CALL }]);
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(7));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByText('Chat excerpt')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
  });


  it('shows a spinner named after the dialog while the call loads', async () => {
    given.hang('get', '/api/usage/calls/:callId');
    const { user } = renderUsage();
    const dialog = await openCall(user, CALL(7));
    expect(within(dialog).getByRole('progressbar', { name: 'AI call' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The period, the scope, the log's purpose and its table page
// live in the address (replaced), the open call too (?call=,
// pushed: Back closes it, its chat link comes Back to it
// open); a chart shown as a table stays one. A scope the page
// does not know reads as "Mine".
// -----------------------------------------------------------

describe('Usage — coming back', () => {

  const renderAt = (route, session = authData, locale) => renderUsage(session, { route, locale });


  it('the period, the scope and the purpose come from the address', async () => {
    const usage = recordUsage();
    const calls = recordCalls(f.usageCalls.filter((call) => call.kind === 'chat'));
    renderAt('/usage?days=7&who=all&calls.kind=chat');
    await waitFor(() => expect(usage[0]).toEqual({ days: '7', scope: 'all' }));
    await waitFor(() => expect(calls[0]).toEqual({ scope: 'all', limit: '100', offset: '0', kind: 'chat' }));
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveTextContent('Last 7 days');
    expect(screen.getByRole('combobox', { name: 'Whose' })).toHaveTextContent('All users');
    expect(screen.getByRole('combobox', { name: 'Purpose' })).toHaveTextContent('Chat');
  });


  it('one account\'s scope holds once the directory knows them; the filters write the address (replacing)', async () => {
    const usage = recordUsage();
    const { user, router } = renderAt(`/usage?who=${f.ID.jonas}`);
    await waitFor(() => expect(usage[0]).toEqual({ days: '30', userId: f.ID.jonas }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Whose' })).toHaveTextContent('Jonas Naudotojas'));
    await pick(user, 'Period', 'Last 90 days');
    await waitFor(() => expect(router.state.location.search).toBe(`?who=${f.ID.jonas}&days=90`));
    expect(router.state.historyAction).toBe('REPLACE');
    await pick(user, 'Whose', 'Mine');
    await waitFor(() => expect(router.state.location.search).toBe('?days=90'));
  });


  it('a user the directory does not have, "everyone" for a plain user, or a period not offered reads as the default', async () => {
    const usage = recordUsage();
    const first = renderAt('/usage?who=a0000000-0000-4000-8000-0000000000ff&days=365');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Whose' })).toHaveTextContent('Mine'));
    await waitFor(() => expect(usage.at(-1)).toEqual({ days: '30' }));
    first.unmount();
    renderAt('/usage?who=all', userAuthData);
    await waitFor(() => expect(usage.at(-1)).toEqual({ days: '30' }));
  });


  it('an open call is an entry of its own: pushed, closed by Back, and a link with ?call= opens it', async () => {
    const { user, router } = renderAt('/usage');
    const listKey = router.state.location.key;
    await openCall(user, CALL(7));
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.search).toBe(`?call=${CALL(7)}`);
    await user.click(within(screen.getByRole('dialog', { name: 'AI call' })).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.key).toBe(listKey);

    const second = renderAt(`/usage?call=${CALL(7)}`);
    expect(await screen.findByRole('dialog', { name: 'AI call' })).toBeInTheDocument();
    second.unmount();
  });


  it('a chart shown as a table stays a table when the page comes back', async () => {
    const first = renderAt('/usage');
    await within(main()).findByText('$0.8652');
    await first.user.click(within(section('Cost per day (USD)')).getByRole('button', { name: 'Show table' }));
    first.unmount();
    renderAt('/usage');
    await within(main()).findByText('$0.8652');
    expect(within(section('Cost per day (USD)')).getByRole('button', { name: 'Show chart' })).toBeInTheDocument();
    expect(within(section('Tokens per day')).getByRole('button', { name: 'Show table' })).toBeInTheDocument();
  });


  it('in Lithuanian too', async () => {
    renderAt('/usage?days=7', authData, 'lt');
    expect(await screen.findByRole('combobox', { name: 'Laikotarpis' })).toHaveTextContent('Paskutinės 7 d.');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------
//
// The labels, and the units the Lithuanian way: the amount
// then "USD", a decimal comma, compact tokens in words
// ("tūkst."), digit groups split by a space. Intl's no-break
// spaces read as plain ones to the text queries; the
// accessible names keep them, hence \s there.
// -----------------------------------------------------------

describe('Usage in Lithuanian', () => {

  it('speaks Lithuanian: the filters, the budget, the totals, the charts and the splits', async () => {
    renderUsage(authData, { locale: 'lt' });
    expect(within(main()).getByRole('heading', { level: 1, name: 'DI sąnaudos' })).toBeInTheDocument();
    expect(within(main()).getByRole('combobox', { name: 'Laikotarpis' })).toHaveTextContent('Paskutinės 30 d.');
    expect(within(main()).getByRole('combobox', { name: 'Kieno' })).toHaveTextContent('Mano');
    await within(main()).findByText('0,8652 USD');

    const budget = section('Šios dienos biudžetas');
    expect(within(budget).getByText('Biudžetas skaičiuojamas pagal UTC parą ir atsinaujina vidurnaktį UTC.')).toBeInTheDocument();
    expect(within(budget).getByText('Išnaudota šiandien')).toBeInTheDocument();
    expect(within(budget).getByText('0,216 USD · Neribota')).toBeInTheDocument();

    expect(statTile('Kaina')).toHaveTextContent('Kaina0,8652 USDPaskutinės 30 d.');
    expect(statTile('Iškvietimai')).toHaveTextContent('Iškvietimai7');
    expect(statTile('Įvesties žetonai')).toHaveTextContent('Įvesties žetonai104,6 tūkst.');
    expect(statTile('Išvesties žetonai')).toHaveTextContent('Išvesties žetonai35,4 tūkst.');

    expect(dayColumns('Kaina per dieną (USD)').at(-1)).toHaveAccessibleName(/^09-27: Kaina 0,216\sUSD$/);
    expect(dayColumns('Žetonai per dieną').at(-1)).toHaveAccessibleName(/^09-27: Įvestis 30\stūkst\., Išvestis 5,8\stūkst\.$/);
    expect(splitRows('Pagal paskirtį')[0]).toEqual(['Pokalbis', '2', '27,3 tūkst.', '1,9 tūkst.', '0,1922 USD']);
    expect(splitRows('Pagal modelį')[0]).toEqual(['gateway:azure/gpt-5.6-terra', '2', '51,4 tūkst.', '31,1 tūkst.', '0,476 USD']);
  });


  it('speaks Lithuanian in the call log and the call dialog', async () => {
    const { user } = renderUsage(authData, { locale: 'lt' });
    const row = await findCallRow(CALL(23));
    const log = section('Iškvietimų žurnalas');
    expect(columns(callLog())).toEqual(['Laikas', 'Paskirtis', 'Tikslas', 'Modelis', 'Įvestis', 'Išvestis', 'Kaina', 'Trukmė', 'Rezultatas', 'Įrankiai']);
    expect(cell(row, 'createdAt')).toHaveTextContent('2026-09-27 09:52');
    expect(cell(row, 'kind')).toHaveTextContent('Analizės etapas');
    expect(cell(row, 'inputTokens')).toHaveTextContent('10 200');
    expect(cell(row, 'costUsd')).toHaveTextContent('0,072 USD');
    expect(cell(row, 'outcome')).toHaveTextContent('Sėkminga');
    expect(within(log).getByText('Rodoma 7 iš 7')).toBeInTheDocument();

    await user.click(within(cell(callRow(CALL(7)), 'createdAt')).getByRole('button', { name: 'Atidaryti 2026-09-21 09:02 iškvietimą' }));
    const dialog = await screen.findByRole('dialog', { name: 'DI iškvietimas' });
    expect(await within(dialog).findByText('Pokalbio ištrauka')).toBeInTheDocument();
    expect(within(dialog).getByText('Pokalbis')).toBeInTheDocument();
    expect(within(dialog).getByText('Žetonai: 18 234 / 1 210 (samprotavimas 256)')).toBeInTheDocument();
    expect(within(dialog).getByText('Naudotojas')).toBeInTheDocument();
    expect(within(dialog).getByText('Asistentas')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Atidaryti pokalbį' })).toBeInTheDocument();
    expect(within(dialog).getByText('Įrankių iškvietimai')).toBeInTheDocument();
    expect(term(dialog, 'Įrankis')).toHaveTextContent('searchLegalCorpus');
    expect(term(dialog, 'Trukmė (ms)')).toHaveTextContent('812');
    expect(term(dialog, 'Pavyko')).toHaveTextContent('Taip');
    expect(within(dialog).getByRole('button', { name: 'Uždaryti' })).toBeInTheDocument();
  });


  it('says the empty period and a failure in Lithuanian', async () => {
    given.json('get', '/api/usage', f.usage({ days: 30, userId: f.ID.lina }));
    given.json('get', '/api/usage/calls', { calls: [], total: 0 });
    const { unmount } = renderUsage(authData, { locale: 'lt' });
    expect(await within(main()).findByText('Šiuo laikotarpiu DI iškvietimų nebuvo')).toBeInTheDocument();
    expect(await within(main()).findByText('Iškvietimų nėra')).toBeInTheDocument();
    unmount();

    given.apiError('get', '/api/users', 'SERVER_ERROR', { status: 500 });
    renderUsage(authData, { locale: 'lt' });
    const alert = await within(main()).findByRole('alert');
    expect(alert).toHaveTextContent('Nepavyko įkelti naudotojų sąrašo');
    expect(alert).toHaveTextContent('Serverio klaida. Bandykite dar kartą vėliau.');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the summary, the call log,
// one call as its time button opens it (the log keeps its
// default answer), and the admin's user list. With the
// dialog open the page behind it is hidden from assistive
// technology, so the dialog is its chrome.
// -----------------------------------------------------------

const chrome = () => within(main()).getByRole('heading', { level: 1, name: 'AI usage' });

describeEndpointContract({
  path: '/api/usage',
  fixture: f.usage({ days: 30 }),
  render: () => renderUsage(),
  chrome,
  loaded: async () => { await within(main()).findByText('$0.8652'); },
  loading: () => within(main()).getByRole('progressbar', { name: 'AI usage' }),
});


describeEndpointContract({
  path: '/api/usage/calls',
  fixture: { calls: ADMIN_CALLS, total: ADMIN_CALLS.length },
  render: () => renderUsage(),
  chrome,
  loaded: async () => { await findCallRow(CALL(22)); },
  // A grid loading without rows draws skeleton rows — no
  // progressbar, and nothing else a query can reach
  loading: () => callLog().querySelector('.MuiDataGrid-skeletonLoadingOverlay'),
});


describeEndpointContract({
  path: '/api/usage/calls/:callId',
  fixture: LICENCE_CALL,
  render: async () => {
    const view = renderUsage();
    await openCall(view.user, CALL(7));
    return view;
  },
  chrome: () => screen.getByRole('dialog', { name: 'AI call' }),
  loaded: async () => { await within(screen.getByRole('dialog')).findByText('Chat excerpt'); },
  loading: () => within(screen.getByRole('dialog')).getByRole('progressbar', { name: 'AI call' }),
});


describeEndpointContract({
  path: '/api/users',
  fixture: { users: f.users },
  render: () => renderUsage(),
  chrome,
  loaded: async () => {
    // The picker's options are the proof the list landed; the
    // menu is shut again so the page is back for the chrome
    const user = userEvent.setup();
    await user.click(await within(main()).findByRole('combobox', { name: 'Whose' }));
    expect(await screen.findByRole('option', { name: 'Jonas Naudotojas' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
});
