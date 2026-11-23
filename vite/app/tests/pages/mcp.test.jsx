// -----------------------------------------------------------
//  [*] Tests — MCP servers page (external tool servers,
//      admin)
//
//  The /settings/mcp page end to end against the backend
//  double: the frame (heading, subtitle, the "Add a server"
//  action, the egress note as a status — never an alert); one
//  card per server (name, description, address and the
//  transport label, the on/off switch, the header NAMES with
//  their values hidden, the allowed tools or "all tools",
//  when it was last checked, the last error as an alert, the
//  discovered tools behind an accordion — an opened one kept
//  open for the tab —, a listing that names a tool twice);
//  the loading spinner, the failed, malformed
//  and empty lists, hostile strings; the enable switch (PATCH
//  {enabled}, the toast, busy, a refusal — and the saved
//  address of a server from before the address rule, which
//  Django refuses: one sentence, "no longer allowed, edit it
//  first", with the part that is wrong in the dialog's
//  words, on the switch and on the test); the connection
//  test (POST …/test, busy with its wording, ok with the tool
//  count, ok: false, HTTP and network failures); the delete
//  confirmation (DELETE, the toast, a refusal inside it, one
//  DELETE for a double click or a click while it closes); the
//  add / edit dialog (McpServerDialog: the blank form and the
//  pre-filled one, the slug rule for the name, the backend's
//  address rule — https on the standard port to a public DNS
//  name, each failing part named (not https, a port, an IP
//  address in any spelling, a container or local name, too
//  long), the server's own refusal of the address shown on
//  the field, a row saved before the rule still editable
//  while off — the transport, header values write-only — a
//  new value replaces, a removed row sends null, a removed
//  and re-added header keeps its new value — the allowed
//  tools, the enabled switch, the exact POST body and a PATCH
//  with only the changed fields, nothing sent for an
//  untouched edit, DUPLICATE_NAME on the name field until the
//  name changes, the other refusals in the dialog — one
//  naming a field gone when that field changes — busy,
//  Enter, a double click, the blank form on reopening); both
//  languages; and the backend contract matrix for GET
//  /api/mcp/servers.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle, HOSTILE_STRING } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import McpServers from '@/pages/Mcp/McpServers';


const [EU, REGISTRY] = f.mcpServers;

// The servers answer with one row changed
const serversWith = (id, change) => ({ servers: f.mcpServers.map((row) => (row.id === id ? { ...row, ...change } : row)) });

// The egress note, word for word
const EGRESS_NOTE = 'The server\'s address must be on the egress allowlist (exit/Caddyfile and extra_hosts) — an infrastructure change, see docs/markdown/en/operations.md. Otherwise the test ends with a connection error.';

// The card's sentence when Django refuses the saved address
// of lt_registry (a server saved before the address rule)
const ADDRESS_REFUSED = 'The address of “lt_registry” is no longer allowed — edit it first.';

// url_problem's refusal of a host that is no public DNS
// name, word for word
const PUBLIC_HOST_PROSE = 'url must name a public host (a DNS name — not an address, a container or a local name)';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderMcp: the page on its real route (/settings/mcp).
//
// cardOf: a server's card — the list item its name heads.
//
// openAdd / openEdit: the "Add a server" button, or a card's
// Edit, → the dialog. The dialog's fields are found by their
// labels; a header value is a password input (no ARIA role),
// so it is found by its label too.
//
// headerRows: each header row of the dialog as { name,
// value, remove } — the name textbox, the value input and
// the row's remove button, in order.
//
// pillsOf: the pills of one line of a card ("Headers: …",
// "Allowed tools: …") — a Chip without an action has no
// role, so MUI's label class is the handle on it.
//
// dialogClosed: the dialog is gone after its close
// animation.
// -----------------------------------------------------------

const renderMcp = (options = {}) => renderPage(<McpServers authData={authData} />, { route: '/settings/mcp', path: '/settings/mcp', ...options });

const cardOf = async (name) => (await screen.findByRole('heading', { level: 2, name })).closest('li');

const openAdd = async (user, { button = 'Add a server', title = 'New MCP server' } = {}) => {
  await cardOf(EU.name);
  await user.click(screen.getByRole('button', { name: button }));
  return screen.findByRole('dialog', { name: title });
};

const openEdit = async (user, name, { button = 'Edit', title = 'Edit MCP server' } = {}) => {
  await user.click(within(await cardOf(name)).getByRole('button', { name: button }));
  return screen.findByRole('dialog', { name: title });
};

const headerRows = (dialog) => {
  const names = within(dialog).queryAllByRole('textbox', { name: 'Header name' });
  const values = within(dialog).queryAllByLabelText('Header value');
  const removes = within(dialog).queryAllByRole('button', { name: 'Remove the header' });
  return names.map((name, i) => ({ name, value: values[i], remove: removes[i] }));
};

const pillsOf = (card, label) => [...within(card).getByText(`${label}:`, { exact: false }).parentElement.querySelectorAll('.MuiChip-label')]
  .map((chip) => chip.textContent);

const dialogClosed = async (title) => {
  await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
};

// Fills the add form with a valid server
const fillAdd = async (user, dialog, { name = 'lt_registrai', address = 'https://registrai.example.lt/mcp' } = {}) => {
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), name);
  await user.type(within(dialog).getByRole('textbox', { name: 'Address' }), address);
};

const save = (user, dialog) => user.click(within(dialog).getByRole('button', { name: 'Save' }));







// -----------------------------------------------------------
// MCP servers page — the frame
// -----------------------------------------------------------

describe('MCP servers page — the frame', () => {

  it('frames the servers in the page layout: heading, subtitle and the "Add a server" action', async () => {
    renderMcp();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'MCP servers' })).toBeInTheDocument();
    expect(within(main).getByText('External tool servers (Model Context Protocol) whose tools the chat assistant may use.')).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: 'Add a server' })).toBeEnabled();
    expect(await cardOf(EU.name)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });


  it('shows the egress note as a status, not an alert — a static note is not urgent', async () => {
    renderMcp();
    await cardOf(EU.name);
    const note = screen.getByText(EGRESS_NOTE).closest('[role]');
    expect(note).toHaveAttribute('role', 'status');
    // The only alert on the page is the registry's last error
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(REGISTRY.lastError);
  });


  it('asks for the servers once', async () => {
    const calls = given.capture('get', '/api/mcp/servers', { servers: f.mcpServers });
    renderMcp();
    await cardOf(EU.name);
    await settle(100);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({});
  });
});







// -----------------------------------------------------------
// The server cards
// -----------------------------------------------------------

describe('MCP servers page — the cards', () => {

  it('shows one card per server in the backend\'s order, each headed by its name', async () => {
    renderMcp();
    await cardOf(EU.name);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['eu_compliance', 'lt_registry']);
  });


  it('an enabled server: description, address with the transport, the switch on, its header name, allowed tools and last check', async () => {
    renderMcp();
    const card = await cardOf(EU.name);
    expect(within(card).getByText('Išorinis ES atitikties šaltinių serveris (bandomasis).')).toBeInTheDocument();
    expect(within(card).getByText('https://mcp.example.eu/mcp · HTTP (streamable)')).toBeInTheDocument();
    expect(within(card).getByRole('switch', { name: 'Enabled' })).toBeChecked();
    expect(within(card).getByTitle('value hidden')).toHaveTextContent(/^Authorization: ••••$/);
    expect(pillsOf(card, 'Headers')).toEqual(['Authorization: ••••']);
    expect(pillsOf(card, 'Allowed tools')).toEqual(['get_article', 'search_eu_law']);
    expect(within(card).queryByText('All of the server\'s tools')).toBeNull();
    expect(within(card).getByText('Checked 20/09/2026, 11:04')).toBeInTheDocument();
    expect(within(card).queryByRole('alert')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Tools found (3)' })).toBeInTheDocument();
    for (const action of ['Test the connection', 'Edit', 'Delete']) {
      expect(within(card).getByRole('button', { name: action })).toBeEnabled();
    }
  });


  it('a disabled server: SSE, the switch off, every tool allowed, and its last error as an alert', async () => {
    renderMcp();
    const card = await cardOf(REGISTRY.name);
    expect(within(card).getByText('https://registrai.example.lt/sse · SSE')).toBeInTheDocument();
    expect(within(card).getByRole('switch', { name: 'Disabled' })).not.toBeChecked();
    expect(within(card).getByTitle('value hidden')).toHaveTextContent(/^X-Api-Key: ••••$/);
    expect(within(card).getByText('All of the server\'s tools')).toBeInTheDocument();
    expect(pillsOf(card, 'Allowed tools')).toEqual([]);
    expect(within(card).getByText('Checked 19/09/2026, 15:30')).toBeInTheDocument();
    expect(within(card).getByRole('alert')).toHaveTextContent('Cannot reach registrai.example.lt (ConnectError) — is it on the egress allowlist?');
    expect(within(card).getByRole('button', { name: 'Tools found (0)' })).toBeInTheDocument();
  });


  it('the tools behind the accordion: each name with its description, or the hint to run the test', async () => {
    const { user } = renderMcp();
    const card = await cardOf(EU.name);
    const toggle = within(card).getByRole('button', { name: 'Tools found (3)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const region = within(card).getByRole('region');
    expect(within(region).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'search_eu_law — Search EU financial regulation by keyword.',
      'get_article — Return one article of an EU act by CELEX number and article.',
      'list_sources — List the acts the server indexes.',
    ]);

    const registry = await cardOf(REGISTRY.name);
    await user.click(within(registry).getByRole('button', { name: 'Tools found (0)' }));
    expect(within(within(registry).getByRole('region')).getByText('No tools yet — run the test.')).toBeInTheDocument();
  });


  it('a tool list the admin opened is open again when they come back — the others stay folded', async () => {
    const first = renderMcp();
    await first.user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Tools found (3)' }));
    first.unmount();
    renderMcp();
    expect(within(await cardOf(EU.name)).getByRole('button', { name: 'Tools found (3)' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(await cardOf(REGISTRY.name)).getByRole('button', { name: 'Tools found (0)' })).toHaveAttribute('aria-expanded', 'false');
  });


  it('never shows a header value — only the names, with the value masked', async () => {
    given.json('get', '/api/mcp/servers', { servers: [{ ...EU, headerNames: ['Authorization', 'X-Tenant'] }] });
    renderMcp();
    const card = await cardOf(EU.name);
    expect(within(card).getAllByTitle('value hidden').map((chip) => chip.textContent)).toEqual(['Authorization: ••••', 'X-Tenant: ••••']);
    expect(card.textContent).not.toMatch(/Bearer|secret/i);
  });


  it('a server never checked, without headers and description, says so', async () => {
    given.json('get', '/api/mcp/servers', { servers: [f.NEW.mcpServer] });
    renderMcp();
    const card = await cardOf('naujas_serveris');
    expect(within(card).getByText('Not checked yet')).toBeInTheDocument();
    expect(within(card).getByText('None')).toBeInTheDocument();
    expect(within(card).queryByTitle('value hidden')).toBeNull();
    expect(within(card).getByText('https://mcp.example.com/mcp · HTTP (streamable)')).toBeInTheDocument();
    expect(within(card).getByRole('switch', { name: 'Disabled' })).not.toBeChecked();
  });


  it('a listing that names a tool twice shows both lines and both chips without tripping over them', async () => {
    const twice = { name: 'get_article', description: 'Return one article.' };
    given.json('get', '/api/mcp/servers', { servers: [{ ...EU, allowedTools: ['get_article', 'get_article'], tools: [twice, twice] }] });
    const { user } = renderMcp();
    const card = await cardOf(EU.name);
    await user.click(within(card).getByRole('button', { name: 'Tools found (2)' }));
    expect(within(within(card).getByRole('region')).getAllByRole('listitem')).toHaveLength(2);
    expect(pillsOf(card, 'Allowed tools')).toEqual(['get_article', 'get_article']);
  });


  it('shows markup in every string as text, never as elements', async () => {
    given.json('get', '/api/mcp/servers', {
      servers: f.mcpServers.map((row) => ({
        ...row, description: HOSTILE_STRING, url: HOSTILE_STRING, transport: HOSTILE_STRING, lastError: HOSTILE_STRING,
        headerNames: [HOSTILE_STRING], allowedTools: [HOSTILE_STRING, HOSTILE_STRING], tools: [{ name: HOSTILE_STRING, description: HOSTILE_STRING }],
      })),
    });
    renderMcp();
    const card = await cardOf(EU.name);
    expect(within(card).getByRole('alert').textContent).toContain('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});







// -----------------------------------------------------------
// States
// -----------------------------------------------------------

describe('MCP servers page — loading, failed, malformed and empty', () => {

  it('holds the place of the cards with a spinner that says it is loading — no alert, no empty state', async () => {
    given.hang('get', '/api/mcp/servers');
    renderMcp();
    expect(await screen.findByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await settle(100);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('No MCP servers')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a server' })).toBeEnabled();
  });


  it('a failed list shows the page\'s error with the translated sentence and a retry that brings the cards', async () => {
    given.sequence('get', '/api/mcp/servers', [{ status: 500, body: apiError('SERVER_ERROR', 'Internal server error') }, { body: { servers: f.mcpServers } }]);
    const { user } = renderMcp();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The MCP servers could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByText('No MCP servers')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await cardOf(EU.name)).toBeInTheDocument();
    expect(screen.queryByText('The MCP servers could not be loaded')).toBeNull();
  });


  it.each([
    ['servers without ids', { servers: [{ name: 'be_id' }, { name: 'irgi_be_id' }] }],
    ['two servers sharing one id', { servers: [EU, { ...EU, name: 'eu_antrininkas' }] }],
    ['no servers list at all', { items: f.mcpServers }],
    ['a list for the whole answer', f.mcpServers],
  ])('an answer with %s fails like any bad answer — the error state and its retry, never mixed-up cards', async (_, body) => {
    given.sequence('get', '/api/mcp/servers', [{ body }, { body: { servers: f.mcpServers } }]);
    const { user } = renderMcp();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The MCP servers could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByText('No MCP servers')).toBeNull();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await cardOf(EU.name)).toBeInTheDocument();
  });


  it('no servers: the empty state with a way forward', async () => {
    given.json('get', '/api/mcp/servers', { servers: [] });
    renderMcp();
    expect(await screen.findByText('No MCP servers')).toBeInTheDocument();
    expect(screen.getByText('Add a server, e.g. an EU compliance database, so the assistant can use its tools.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a server' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Enable switch
// -----------------------------------------------------------
//
// PATCH /api/mcp/servers/{id} {enabled}. A refusal is a
// toast in the api client's words — except Django refusing
// the saved address of a server saved before the address
// rule (400 INVALID_FIELD on "url"): that is one sentence,
// the address is no longer allowed and to edit it first,
// with the part that is wrong in the dialog's words.
// -----------------------------------------------------------

describe('MCP servers page — the enable switch', () => {

  it('switching a server on PATCHes enabled: true, toasts and the refreshed card shows it on', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', { ...REGISTRY, enabled: true });
    given.sequence('get', '/api/mcp/servers', [{ body: { servers: f.mcpServers } }, { body: serversWith(REGISTRY.id, { enabled: true }) }]);
    const { user } = renderMcp();
    const card = await cardOf(REGISTRY.name);
    await user.click(within(card).getByRole('switch', { name: 'Disabled' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(`http://localhost:3000/api/mcp/servers/${REGISTRY.id}`);
    expect(patches[0].body).toEqual({ enabled: true });
    expect(await screen.findByText('Server enabled')).toBeInTheDocument();
    expect(await within(await cardOf(REGISTRY.name)).findByRole('switch', { name: 'Enabled' })).toBeChecked();
  });


  it('switching a server off PATCHes enabled: false and toasts "Server disabled"', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', { ...EU, enabled: false });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('switch', { name: 'Enabled' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ enabled: false });
    expect(await screen.findByText('Server disabled')).toBeInTheDocument();
  });


  it('the switch is disabled while its PATCH is on the wire', async () => {
    given.hang('patch', '/api/mcp/servers/:serverId');
    const { user } = renderMcp();
    const card = await cardOf(REGISTRY.name);
    const toggle = within(card).getByRole('switch', { name: 'Disabled' });
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
    // The other server's switch is not held
    expect(within(await cardOf(EU.name)).getByRole('switch', { name: 'Enabled' })).toBeEnabled();
  });


  it('a refused switch toasts the translated error and the card keeps its state', async () => {
    given.apiError('patch', '/api/mcp/servers/:serverId', 'SERVER_ERROR', { status: 500, error: 'Internal server error' });
    const { user } = renderMcp();
    const card = await cardOf(REGISTRY.name);
    await user.click(within(card).getByRole('switch', { name: 'Disabled' }));
    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    expect(screen.queryByText('Server enabled')).toBeNull();
    await waitFor(() => expect(within(card).getByRole('switch', { name: 'Disabled' })).toBeEnabled());
    expect(within(card).getByRole('switch', { name: 'Disabled' })).not.toBeChecked();
  });


  it('switching on a server saved before the address rule: Django refuses its address, and the card says in one sentence that it is no longer allowed and to edit it first — with the part that is wrong in the dialog\'s words, never "invalid field"', async () => {
    given.json('get', '/api/mcp/servers', serversWith(REGISTRY.id, { url: 'http://registrai.example.lt:8080/sse' }));
    given.apiError('patch', '/api/mcp/servers/:serverId', 'INVALID_FIELD', { status: 400, error: 'url must be an https:// URL on the standard port' });
    const patches = given.spy('patch', '/api/mcp/servers/:serverId');
    const { user } = renderMcp();
    const card = await cardOf(REGISTRY.name);
    await user.click(within(card).getByRole('switch', { name: 'Disabled' }));
    expect(await screen.findByText(ADDRESS_REFUSED)).toBeInTheDocument();
    expect(screen.getByText('The address must start with https://')).toBeInTheDocument();
    expect(patches.map((call) => call.body)).toEqual([{ enabled: true }]);
    // Neither the backend's prose (what it said) nor the
    // generic field sentence
    expect(screen.queryByText(/^url must/)).toBeNull();
    expect(screen.queryByText('A field has an invalid value.')).toBeNull();
    expect(screen.queryByText('Server enabled')).toBeNull();
    await waitFor(() => expect(within(card).getByRole('switch', { name: 'Disabled' })).toBeEnabled());
    expect(within(card).getByRole('switch', { name: 'Disabled' })).not.toBeChecked();
  });


  it('names the rule itself when only the server sees what is wrong with the address (an IDN host the browser writes out as punycode)', async () => {
    given.json('get', '/api/mcp/servers', serversWith(REGISTRY.id, { url: 'https://registrai.ėxample.lt/sse' }));
    given.apiError('patch', '/api/mcp/servers/:serverId', 'INVALID_FIELD', { status: 400, error: PUBLIC_HOST_PROSE });
    const { user } = renderMcp();
    await user.click(within(await cardOf(REGISTRY.name)).getByRole('switch', { name: 'Disabled' }));
    expect(await screen.findByText(ADDRESS_REFUSED)).toBeInTheDocument();
    expect(screen.getByText('The https:// address of a public server (its DNS name, the standard port)')).toBeInTheDocument();
  });


  it('any other refusal keeps its own words — only the address gets the sentence', async () => {
    given.apiError('patch', '/api/mcp/servers/:serverId', 'INVALID_FIELD', { status: 400, error: 'enabled must be true or false' });
    const { user } = renderMcp();
    await user.click(within(await cardOf(REGISTRY.name)).getByRole('switch', { name: 'Disabled' }));
    expect(await screen.findByText('enabled must be true or false')).toBeInTheDocument();
    expect(screen.queryByText(ADDRESS_REFUSED)).toBeNull();
  });


  it('switching such a server off is not held up by its address', async () => {
    given.json('get', '/api/mcp/servers', serversWith(EU.id, { url: 'https://10.0.0.5/mcp' }));
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', { ...EU, url: 'https://10.0.0.5/mcp', enabled: false });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('switch', { name: 'Enabled' }));
    expect(await screen.findByText('Server disabled')).toBeInTheDocument();
    expect(patches.map((call) => call.body)).toEqual([{ enabled: false }]);
    expect(screen.queryByText(ADDRESS_REFUSED)).toBeNull();
  });


  it('the connection test of such a server says the same — not "The test failed" with an invalid field', async () => {
    given.json('get', '/api/mcp/servers', serversWith(REGISTRY.id, { url: 'https://10.0.0.5/sse' }));
    given.apiError('post', '/api/mcp/servers/:serverId/test', 'INVALID_FIELD', { status: 400, error: PUBLIC_HOST_PROSE });
    const { user } = renderMcp();
    await user.click(within(await cardOf(REGISTRY.name)).getByRole('button', { name: 'Test the connection' }));
    expect(await screen.findByText(ADDRESS_REFUSED)).toBeInTheDocument();
    expect(screen.getByText('Use the server\'s DNS name, not an IP address')).toBeInTheDocument();
    expect(screen.queryByText(/^The test failed/)).toBeNull();
  });
});







// -----------------------------------------------------------
// Connection test
// -----------------------------------------------------------
//
// POST /api/mcp/servers/{id}/test → {…server, ok}; slow, so
// the button says how long it may take.
// -----------------------------------------------------------

describe('MCP servers page — the connection test', () => {

  it('POSTs to the server\'s test route, says it is testing, then toasts the tool count and refreshes the card', async () => {
    let answer;
    const answered = new Promise((resolve) => { answer = resolve; });
    const calls = [];
    server.use(http.post(url('/api/mcp/servers/:serverId/test'), async ({ request, params }) => {
      calls.push({ id: params.serverId, body: await request.text() });
      await answered;
      return HttpResponse.json(f.mcpTest(params.serverId));
    }));
    given.sequence('get', '/api/mcp/servers', [
      { body: { servers: f.mcpServers } },
      { body: serversWith(REGISTRY.id, { lastError: null, lastCheckedAt: f.NOW, tools: f.mcpTest(REGISTRY.id).tools }) },
    ]);
    const { user } = renderMcp();
    const card = await cardOf(REGISTRY.name);
    await user.click(within(card).getByRole('button', { name: 'Test the connection' }));

    const busy = await within(card).findByRole('button', { name: /Testing… \(up to 45 s\)/ });
    expect(busy).toBeDisabled();
    expect(calls).toEqual([{ id: REGISTRY.id, body: '' }]);
    answer();

    expect(await screen.findByText('The connection works — tools found: 1')).toBeInTheDocument();
    expect(await within(card).findByRole('button', { name: 'Tools found (1)' })).toBeInTheDocument();
    expect(within(card).getByText('Checked 27/09/2026, 10:00')).toBeInTheDocument();
    expect(within(card).queryByRole('alert')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Test the connection' })).toBeEnabled();
  });


  it('an answer with ok: false toasts that the test failed, and the refreshed card shows the new error', async () => {
    const failedAt = { lastError: 'Connection refused (ConnectError)', lastCheckedAt: f.NOW };
    given.json('post', '/api/mcp/servers/:serverId/test', { ...EU, ...failedAt, ok: false });
    given.sequence('get', '/api/mcp/servers', [{ body: { servers: f.mcpServers } }, { body: serversWith(EU.id, failedAt) }]);
    const { user } = renderMcp();
    const card = await cardOf(EU.name);
    await user.click(within(card).getByRole('button', { name: 'Test the connection' }));
    expect(await screen.findByText('The test failed')).toBeInTheDocument();
    expect(await within(card).findByRole('alert')).toHaveTextContent('Connection refused (ConnectError)');
    expect(screen.queryByText(/The connection works/)).toBeNull();
  });


  it.each([
    ['a proxy\'s HTML error page', () => given.html('post', '/api/mcp/servers/:serverId/test'), 'The test failed: The server is temporarily unreachable. Try again.'],
    ['a dropped connection', () => given.networkError('post', '/api/mcp/servers/:serverId/test'), 'The test failed: Could not reach the server. Check your internet connection.'],
    ['a server deleted meanwhile (404)', () => given.apiError('post', '/api/mcp/servers/:serverId/test', 'NOT_FOUND', { status: 404, error: 'MCP server not found' }), 'The test failed: Not found — it may have been deleted.'],
  ])('a test that meets %s toasts the failure with its reason', async (_, arrange, text) => {
    arrange();
    const { user } = renderMcp();
    const card = await cardOf(EU.name);
    await user.click(within(card).getByRole('button', { name: 'Test the connection' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Test the connection' })).toBeEnabled());
  });


  it('testing one server leaves the other card\'s test button alone', async () => {
    given.hang('post', '/api/mcp/servers/:serverId/test');
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Test the connection' }));
    expect(await within(await cardOf(EU.name)).findByRole('button', { name: /Testing…/ })).toBeDisabled();
    expect(within(await cardOf(REGISTRY.name)).getByRole('button', { name: 'Test the connection' })).toBeEnabled();
  });
});







// -----------------------------------------------------------
// Delete confirmation
// -----------------------------------------------------------

describe('MCP servers page — the delete confirmation', () => {

  it('names the server, says what deleting means, and Cancel sends nothing', async () => {
    const deletes = given.capture('delete', '/api/mcp/servers/:serverId', { ok: true });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “eu_compliance”?' });
    expect(within(dialog).getByText('The assistant can no longer use this server\'s tools. The header values are deleted.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('Delete the MCP server “eu_compliance”?');
    await settle(50);
    expect(deletes).toHaveLength(0);
  });


  it('confirming DELETEs the server, toasts, closes and the list is refreshed without it', async () => {
    const deletes = given.capture('delete', '/api/mcp/servers/:serverId', { ok: true });
    given.sequence('get', '/api/mcp/servers', [{ body: { servers: f.mcpServers } }, { body: { servers: [REGISTRY] } }]);
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “eu_compliance”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(`http://localhost:3000/api/mcp/servers/${EU.id}`);
    expect(await screen.findByText('Server deleted')).toBeInTheDocument();
    await dialogClosed('Delete the MCP server “eu_compliance”?');
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: EU.name })).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: REGISTRY.name })).toBeInTheDocument();
  });


  it('a refused delete is said inside the confirmation, which stays open — no toast', async () => {
    given.apiError('delete', '/api/mcp/servers/:serverId', 'NOT_FOUND', { status: 404, error: 'MCP server not found' });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “eu_compliance”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found — it may have been deleted.');
    expect(screen.getAllByText('Not found — it may have been deleted.')).toHaveLength(1);
    expect(screen.queryByText('Server deleted')).toBeNull();
  });


  it('a new confirmation starts without the previous refusal', async () => {
    given.apiError('delete', '/api/mcp/servers/:serverId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “eu_compliance”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('Delete the MCP server “eu_compliance”?');

    await user.click(within(await cardOf(REGISTRY.name)).getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “lt_registry”?' });
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('a fast double click on Delete sends one DELETE', async () => {
    const deletes = given.capture('delete', '/api/mcp/servers/:serverId', { ok: true });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “eu_compliance”?' });
    await user.dblClick(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Server deleted')).toBeInTheDocument();
    await dialogClosed('Delete the MCP server “eu_compliance”?');
    await settle(100);
    expect(deletes).toHaveLength(1);
  });


  it('a second click on Delete while the confirmation closes after the success sends nothing', async () => {
    const deletes = given.capture('delete', '/api/mcp/servers/:serverId', { ok: true });
    const { user } = renderMcp();
    await user.click(within(await cardOf(EU.name)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the MCP server “eu_compliance”?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    await user.click(confirm);
    await user.click(confirm);
    expect(await screen.findByText('Server deleted')).toBeInTheDocument();
    await dialogClosed('Delete the MCP server “eu_compliance”?');
    await settle(100);
    expect(deletes).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Add dialog
// -----------------------------------------------------------
//
// POST /api/mcp/servers with every field; the name and
// address rules, the headers, the allowed tools.
// -----------------------------------------------------------

describe('McpServerDialog — adding a server', () => {

  it('opens a blank form: the name focused with its rule, HTTP, the address rule, no headers, all tools, switched off', async () => {
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(name).toHaveFocus();
    expect(within(dialog).getByText('2–31 characters: lowercase letters, digits and _, starting with a letter')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Transport' })).toHaveTextContent('HTTP (streamable)');
    expect(within(dialog).getByRole('textbox', { name: 'Address' })).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: 'Address' }))
      .toHaveAccessibleDescription('The https:// address of a public server (its DNS name, the standard port)');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('');
    expect(headerRows(dialog)).toHaveLength(0);
    expect(within(dialog).getByRole('button', { name: 'Add a header' })).toBeEnabled();
    expect(within(dialog).getByRole('combobox', { name: 'Allowed tools' })).toHaveValue('');
    expect(within(dialog).getByText('Empty — every tool of the server is allowed. Type and press Enter.')).toBeInTheDocument();
    // A new server starts disabled — test it, then enable it:
    // the switch appears once the server exists
    expect(within(dialog).queryByRole('switch', { name: 'Enabled (used in chats)' })).toBeNull();
    expect(within(dialog).getByText('A new server is created disabled until you test it.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('offers the two transports', async () => {
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await user.click(within(dialog).getByRole('combobox', { name: 'Transport' }));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['HTTP (streamable)', 'SSE']);
  });


  it('checks the name and the address once the form was submitted, and sends nothing', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    expect(within(dialog).queryByText('The name does not match the format')).toBeNull();
    await save(user, dialog);
    expect(await within(dialog).findByText('The name does not match the format')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the server\'s https:// address')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('textbox', { name: 'Address' })).toHaveAttribute('aria-invalid', 'true');
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it.each([
    ['eu', true],
    ['eu_law_2', true],
    [`a${'b'.repeat(30)}`, true],
    ['e', false],
    ['EU', false],
    ['1eu', false],
    ['_eu', false],
    ['eu-law', false],
    ['eu.law', false],
    ['ąžuolas', false],
    [`a${'b'.repeat(31)}`, false],
  ])('the name "%s" follows the backend\'s slug rule: %s', async (name, accepted) => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog, { name });
    await save(user, dialog);
    if (accepted) {
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0].body.name).toBe(name);
    } else {
      expect(await within(dialog).findByText('The name does not match the format')).toBeInTheDocument();
      await settle(100);
      expect(posts).toHaveLength(0);
    }
  });


  it('drops spaces from the name as it is typed', async () => {
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.type(name, ' eu law ');
    expect(name).toHaveValue('eulaw');
  });


  // The backend's url_problem part by part (https on the
  // standard port to a public DNS name): what passes, and the
  // message naming what does not. Pasted, not typed — "[" is
  // a key descriptor to user.type
  it.each([
    ['https://mcp.example.eu/mcp', null],
    ['  https://mcp.example.eu/mcp  ', null],
    ['HTTPS://MCP.Example.EU/mcp', null],
    ['https://mcp.example.eu:443/mcp', null],
    ['https://registrai.example.lt/sse?token=a&b=c', null],
    ['http://mcp.example.eu/mcp', 'The address must start with https://'],
    ['http://localhost:8080/mcp', 'The address must start with https://'],
    ['mcp.example.eu/mcp', 'The address must start with https://'],
    ['ftp://mcp.example.eu', 'The address must start with https://'],
    ['javascript:alert(1)', 'The address must start with https://'],
    ['https:mcp.example.eu', 'The address must start with https://'],
    ['https://', 'Enter the server\'s https:// address'],
    ['https://mcp example.eu', 'Enter the server\'s https:// address'],
    [`https://mcp.example.eu/${'a'.repeat(480)}`, 'The address is too long (at most 500 characters)'],
    ['https://mcp.example.eu:8443/mcp', 'Leave out the port — only the standard https port (443) is reachable'],
    ['https://127.0.0.1/mcp', 'Use the server\'s DNS name, not an IP address'],
    ['https://0x7f.1/mcp', 'Use the server\'s DNS name, not an IP address'],
    ['https://2130706433/mcp', 'Use the server\'s DNS name, not an IP address'],
    ['https://[::1]/mcp', 'Use the server\'s DNS name, not an IP address'],
    ['https://legalops-django/api', 'Use a public server — not a container, localhost or a local name (.local, .internal …)'],
    ['https://localhost/mcp', 'Use a public server — not a container, localhost or a local name (.local, .internal …)'],
    ['https://mcp.local/mcp', 'Use a public server — not a container, localhost or a local name (.local, .internal …)'],
    ['https://registry.internal/mcp', 'Use a public server — not a container, localhost or a local name (.local, .internal …)'],
    ['https://svc.home.arpa/mcp', 'Use a public server — not a container, localhost or a local name (.local, .internal …)'],
  ])('the address "%s" is held to the backend\'s rule — refused with: %s', async (value, message) => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'lt_registrai');
    const address = within(dialog).getByRole('textbox', { name: 'Address' });
    await user.click(address);
    await user.paste(value);
    await save(user, dialog);
    if (!message) {
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0].body.url).toBe(value.trim());
    } else {
      await waitFor(() => expect(address).toHaveAccessibleDescription(message));
      expect(address).toHaveAttribute('aria-invalid', 'true');
      await settle(100);
      expect(posts).toHaveLength(0);
    }
  });


  it('adds a server: POSTs every field — trimmed texts, the transport, the header with its value, the tools, off — toasts and closes', async () => {
    const posts = given.capture('post', '/api/mcp/servers', { ...f.NEW.mcpServer, name: 'lt_registrai' }, { status: 201 });
    given.sequence('get', '/api/mcp/servers', [
      { body: { servers: f.mcpServers } },
      { body: { servers: [...f.mcpServers, { ...f.NEW.mcpServer, name: 'lt_registrai' }] } },
    ]);
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog, { name: 'lt_registrai', address: ' https://registrai.example.lt/mcp ' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Transport' }));
    await user.click(await screen.findByRole('option', { name: 'SSE' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), ' Registrų centro duomenys ');
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    const [header] = headerRows(dialog);
    await user.type(header.name, 'X-Api-Key');
    await user.type(header.value, 'slaptas-raktas');
    expect(header.value).toHaveAttribute('type', 'password');
    await user.type(within(dialog).getByRole('combobox', { name: 'Allowed tools' }), 'find_company{Enter}');
    expect(within(dialog).getByRole('button', { name: 'find_company' })).toBeInTheDocument();
    await save(user, dialog);

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({
      name: 'lt_registrai',
      description: 'Registrų centro duomenys',
      url: 'https://registrai.example.lt/mcp',
      transport: 'sse',
      allowedTools: ['find_company'],
      enabled: false,
      headers: { 'X-Api-Key': 'slaptas-raktas' },
    });
    expect(await screen.findByText('Server added')).toBeInTheDocument();
    await dialogClosed('New MCP server');
    expect(await cardOf('lt_registrai')).toBeInTheDocument();
  });


  it('sends no headers key when the new server has no header rows', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await save(user, dialog);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({
      name: 'lt_registrai', description: '', url: 'https://registrai.example.lt/mcp', transport: 'http', allowedTools: [], enabled: false,
    });
  });


  it('a new server is always created disabled — there is no switch to create it enabled', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    expect(within(dialog).queryByRole('switch')).toBeNull();
    await save(user, dialog);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.enabled).toBe(false);
  });


  it('refuses user:password in the address before any request — the credentials belong in a header', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    const address = within(dialog).getByRole('textbox', { name: 'Address' });
    await user.clear(address);
    await user.type(address, 'https://vardas:slaptas@registrai.example.lt/mcp');
    await save(user, dialog);
    expect(await within(dialog).findByText('Do not put user:password in the address — add the credentials as a header')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('a new header with a name but no value blocks the save instead of vanishing', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    await user.type(headerRows(dialog)[0].name, 'X-Api-Key');
    await save(user, dialog);
    expect(await within(dialog).findByText('Enter the header\'s value, or remove the row')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(0);
    await user.type(headerRows(dialog)[0].value, 'raktas');
    await save(user, dialog);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.headers).toEqual({ 'X-Api-Key': 'raktas' });
  });


  it('refuses a header name the backend would refuse, and sends nothing', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    await user.type(headerRows(dialog)[0].name, 'X Api Key');
    await user.type(headerRows(dialog)[0].value, 'raktas');
    await save(user, dialog);
    expect(await within(dialog).findByText('Header name: letters, digits and hyphens')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(0);
  });


  it('the header rows\' refusal is an alert — it belongs to no one field, so no helper text carries it to a screen reader', async () => {
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    await user.type(headerRows(dialog)[0].name, 'X Api Key');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await save(user, dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Header name: letters, digits and hyphens');
    await user.clear(headerRows(dialog)[0].name);
    await user.type(headerRows(dialog)[0].name, 'X-Api-Key');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the header\'s value, or remove the row');
    await user.type(headerRows(dialog)[0].value, 'raktas');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('a blank header row blocks the save until it is filled or removed; a removed new row is not sent', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    await save(user, dialog);
    expect(await within(dialog).findByText('Header name: letters, digits and hyphens')).toBeInTheDocument();
    await user.click(headerRows(dialog)[0].remove);
    expect(headerRows(dialog)).toHaveLength(0);
    await save(user, dialog);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).not.toHaveProperty('headers');
  });


  it('allows ten headers — the backend\'s cap — and no more', async () => {
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    const add = within(dialog).getByRole('button', { name: 'Add a header' });
    for (let i = 0; i < 10; i += 1) await user.click(add);
    expect(headerRows(dialog)).toHaveLength(10);
    expect(add).toBeDisabled();
    await user.click(headerRows(dialog)[9].remove);
    expect(add).toBeEnabled();
  });


  it('shows DUPLICATE_NAME on the name field, not as an alert, and a new name then goes through', async () => {
    given.sequence('post', '/api/mcp/servers', [
      { status: 409, body: apiError('DUPLICATE_NAME', 'An MCP server with that name exists') },
      { status: 201, body: f.NEW.mcpServer },
    ]);
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog, { name: 'eu_compliance' });
    await save(user, dialog);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveAccessibleDescription('This name is already in use.'));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'New MCP server' })).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'eu_compliance_2');
    await save(user, dialog);
    expect(await screen.findByText('Server added')).toBeInTheDocument();
  });


  it('DUPLICATE_NAME leaves the name field as soon as the name changes — not when another field does, and without a request', async () => {
    const posts = given.capture('post', '/api/mcp/servers', apiError('DUPLICATE_NAME', 'An MCP server with that name exists'), { status: 409 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog, { name: 'eu_compliance' });
    await save(user, dialog);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveAccessibleDescription('This name is already in use.'));
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'ES teisė');
    expect(name).toHaveAccessibleDescription('This name is already in use.');
    // A space is trimmed away — no change to the name yet
    await user.type(name, ' ');
    expect(name).toHaveAccessibleDescription('This name is already in use.');
    await user.type(name, '2');
    expect(name).not.toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('2–31 characters: lowercase letters, digits and _, starting with a letter');
    expect(within(dialog).queryByText('This name is already in use.')).toBeNull();
    expect(posts).toHaveLength(1);
  });


  it('the server\'s refusal of the address — the backstop of the form\'s own check — shows on the address field, and goes as soon as the address changes, not the name', async () => {
    const refusal = 'url must name a public host (a DNS name — not an address, a container or a local name)';
    given.apiError('post', '/api/mcp/servers', 'INVALID_FIELD', { status: 400, error: refusal });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await save(user, dialog);
    const address = within(dialog).getByRole('textbox', { name: 'Address' });
    await waitFor(() => expect(address).toHaveAccessibleDescription(refusal));
    expect(address).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '_2');
    expect(address).toHaveAccessibleDescription(refusal);
    await user.type(address, '/v2');
    expect(address).toHaveAccessibleDescription('The https:// address of a public server (its DNS name, the standard port)');
    expect(address).not.toHaveAttribute('aria-invalid', 'true');
  });


  // The other refusals and the transport failures: the
  // dialog's own alert, the dialog left open
  const FAILURES = [
    ['INVALID_FIELD with the backend\'s prose', () => given.apiError('post', '/api/mcp/servers', 'INVALID_FIELD', { status: 400, error: 'transport must be one of http, sse' }), 'transport must be one of http, sse'],
    ['MISSING_FIELDS', () => given.apiError('post', '/api/mcp/servers', 'MISSING_FIELDS', { status: 400, error: 'name and url are required' }), 'name and url are required'],
    ['a server error', () => given.apiError('post', '/api/mcp/servers', 'SERVER_ERROR', { status: 500, error: 'Internal server error' }), 'Server error. Try again later.'],
    ['a dropped connection', () => given.networkError('post', '/api/mcp/servers'), 'Could not reach the server. Check your internet connection.'],
  ];

  for (const [what, arrange, text] of FAILURES) {
    it(`shows ${what} in the dialog, which stays open with what was typed — no toast`, async () => {
      arrange();
      const { user } = renderMcp();
      const dialog = await openAdd(user);
      await fillAdd(user, dialog);
      await save(user, dialog);
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('lt_registrai');
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getAllByText(text)).toHaveLength(1);
      expect(screen.queryByText('Server added')).toBeNull();
    });
  }


  it('Enter in a field submits the form once', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '{Enter}');
    expect(await screen.findByText('Server added')).toBeInTheDocument();
    await settle(100);
    expect(posts).toHaveLength(1);
  });


  it('a fast double click on Save sends one POST', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await user.dblClick(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Server added')).toBeInTheDocument();
    await dialogClosed('New MCP server');
    await settle(100);
    expect(posts).toHaveLength(1);
  });


  it('while the POST is on the wire the dialog is busy: both buttons disabled, Escape does not close it', async () => {
    given.hang('post', '/api/mcp/servers');
    const { user } = renderMcp();
    const dialog = await openAdd(user);
    await fillAdd(user, dialog);
    await save(user, dialog);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Save/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await settle(300);
    expect(screen.getByRole('dialog', { name: 'New MCP server' })).toBeInTheDocument();
  });


  it('Cancel sends nothing, and the next opening starts blank — no leftover values or messages', async () => {
    const posts = given.capture('post', '/api/mcp/servers', f.NEW.mcpServer, { status: 201 });
    const { user } = renderMcp();
    let dialog = await openAdd(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'X');
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    await save(user, dialog);
    expect(await within(dialog).findByText('The name does not match the format')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('New MCP server');

    dialog = await openAdd(user);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(headerRows(dialog)).toHaveLength(0);
    expect(within(dialog).queryByText('The name does not match the format')).toBeNull();
    expect(posts).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Edit dialog
// -----------------------------------------------------------
//
// PATCH /api/mcp/servers/{id} with only the changed fields;
// header values write-only (a value replaces, null removes).
// -----------------------------------------------------------

describe('McpServerDialog — editing a server', () => {

  it('is pre-filled from the server; its header shows the name only, the value empty meaning "unchanged"', async () => {
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('eu_compliance');
    expect(within(dialog).getByRole('combobox', { name: 'Transport' })).toHaveTextContent('HTTP (streamable)');
    expect(within(dialog).getByRole('textbox', { name: 'Address' })).toHaveValue('https://mcp.example.eu/mcp');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('Išorinis ES atitikties šaltinių serveris (bandomasis).');
    const [header] = headerRows(dialog);
    expect(headerRows(dialog)).toHaveLength(1);
    expect(header.name).toHaveValue('Authorization');
    expect(header.name).toBeDisabled();
    expect(header.value).toHaveValue('');
    expect(header.value).toHaveAttribute('placeholder', 'Unchanged (leave empty)');
    expect(within(dialog).getByRole('button', { name: 'get_article' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'search_eu_law' })).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Enabled (used in chats)' })).toBeChecked();
    expect(within(dialog).queryByText('A new server is created disabled until you test it.')).toBeNull();
  });


  it('an untouched form closes on Save without a request or a toast', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await save(user, dialog);
    await dialogClosed('Edit MCP server');
    await settle(100);
    expect(patches).toHaveLength(0);
    expect(screen.queryByText('Saved')).toBeNull();
  });


  it('a changed description PATCHes the description alone (trimmed), toasts "Saved" and closes', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    const description = within(dialog).getByRole('textbox', { name: 'Description' });
    await user.clear(description);
    await user.type(description, ' ES teisės aktų serveris ');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe(`http://localhost:3000/api/mcp/servers/${EU.id}`);
    expect(patches[0].body).toEqual({ description: 'ES teisės aktų serveris' });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await dialogClosed('Edit MCP server');
  });


  it('a new value for the existing header replaces it — the header alone is sent', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.type(headerRows(dialog)[0].value, 'Bearer naujas-raktas');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ headers: { Authorization: 'Bearer naujas-raktas' } });
  });


  it('removing the existing header sends it as null', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.click(headerRows(dialog)[0].remove);
    expect(headerRows(dialog)).toHaveLength(0);
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ headers: { Authorization: null } });
  });


  it('a header removed and added again under the same name is sent with its new value, not deleted', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.click(headerRows(dialog)[0].remove);
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    await user.type(headerRows(dialog)[0].name, 'Authorization');
    await user.type(headerRows(dialog)[0].value, 'Bearer pakeistas');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ headers: { Authorization: 'Bearer pakeistas' } });
  });


  it('a new header travels next to the kept one', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('button', { name: 'Add a header' }));
    const [, added] = headerRows(dialog);
    expect(added.name).toBeEnabled();
    await user.type(added.name, 'X-Tenant');
    await user.type(added.value, 'knf');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ headers: { 'X-Tenant': 'knf' } });
  });


  it('offers the tools the last test found, and a picked one joins the allowed list', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('combobox', { name: 'Allowed tools' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['search_eu_law', 'get_article', 'list_sources']);
    await user.click(screen.getByRole('option', { name: 'list_sources' }));
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ allowedTools: ['get_article', 'search_eu_law', 'list_sources'] });
  });


  it('a tool the list does not know can be typed in; Backspace takes the last one off', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    const tools = within(dialog).getByRole('combobox', { name: 'Allowed tools' });
    await user.click(tools);
    await user.keyboard('{Backspace}');
    await user.type(tools, ' naujas_irankis {Enter}');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ allowedTools: ['get_article', 'naujas_irankis'] });
  });


  it('clearing the allowed tools sends an empty list — every tool allowed', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('button', { name: 'Clear' }));
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ allowedTools: [] });
  });


  it('a listing that names a tool twice offers it once', async () => {
    const twice = { name: 'get_article', description: '' };
    given.json('get', '/api/mcp/servers', { servers: [{ ...EU, allowedTools: [], tools: [twice, twice, { name: 'list_sources', description: '' }] }] });
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('combobox', { name: 'Allowed tools' }));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['get_article', 'list_sources']);
  });


  it('the name, the transport and the switch each travel alone when they alone changed', async () => {
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', EU);
    const { user } = renderMcp();
    let dialog = await openEdit(user, EU.name);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'eu_teise');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ name: 'eu_teise' });
    await dialogClosed('Edit MCP server');

    dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('combobox', { name: 'Transport' }));
    await user.click(await screen.findByRole('option', { name: 'SSE' }));
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1].body).toEqual({ transport: 'sse' });
    await dialogClosed('Edit MCP server');

    dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('switch', { name: 'Enabled (used in chats)' }));
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(3));
    expect(patches[2].body).toEqual({ enabled: false });
  });


  it('a renamed server whose new name is taken shows DUPLICATE_NAME on the name field', async () => {
    given.apiError('patch', '/api/mcp/servers/:serverId', 'DUPLICATE_NAME', { status: 409, error: 'An MCP server with that name exists' });
    const { user } = renderMcp();
    const dialog = await openEdit(user, EU.name);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'lt_registry');
    await save(user, dialog);
    await waitFor(() => expect(name).toHaveAccessibleDescription('This name is already in use.'));
    expect(within(dialog).queryByRole('alert')).toBeNull();
    // Renaming again takes it off
    await user.type(name, '_2');
    expect(name).toHaveAccessibleDescription('2–31 characters: lowercase letters, digits and _, starting with a letter');
  });


  it('an edit refused as a server error is said in the dialog; Cancel and reopening shows the server as it is', async () => {
    given.apiError('patch', '/api/mcp/servers/:serverId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderMcp();
    let dialog = await openEdit(user, EU.name);
    await user.click(headerRows(dialog)[0].remove);
    await save(user, dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('Edit MCP server');

    dialog = await openEdit(user, EU.name);
    expect(headerRows(dialog)).toHaveLength(1);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('opening another server loads its values, not the previous one\'s', async () => {
    const { user } = renderMcp();
    let dialog = await openEdit(user, EU.name);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await dialogClosed('Edit MCP server');
    dialog = await openEdit(user, REGISTRY.name);
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('lt_registry');
    expect(within(dialog).getByRole('combobox', { name: 'Transport' })).toHaveTextContent('SSE');
    expect(headerRows(dialog)[0].name).toHaveValue('X-Api-Key');
    expect(within(dialog).getByRole('switch', { name: 'Enabled (used in chats)' })).not.toBeChecked();
    expect(within(dialog).queryByRole('button', { name: 'get_article' })).toBeNull();
  });


  it('a server saved before the address rule can still be edited while off — its address is not judged, and not sent', async () => {
    given.json('get', '/api/mcp/servers', serversWith(REGISTRY.id, { url: 'http://registrai.example.lt:8080/sse' }));
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', REGISTRY);
    const { user } = renderMcp();
    const dialog = await openEdit(user, REGISTRY.name);
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), ' Senas.');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ description: `${REGISTRY.description} Senas.` });
  });


  it('…but switching it on judges its address, as the backend does: nothing sent until the address is fixed', async () => {
    given.json('get', '/api/mcp/servers', serversWith(REGISTRY.id, { url: 'http://registrai.example.lt:8080/sse' }));
    const patches = given.capture('patch', '/api/mcp/servers/:serverId', REGISTRY);
    const { user } = renderMcp();
    const dialog = await openEdit(user, REGISTRY.name);
    await user.click(within(dialog).getByRole('switch', { name: 'Enabled (used in chats)' }));
    await save(user, dialog);
    const address = within(dialog).getByRole('textbox', { name: 'Address' });
    await waitFor(() => expect(address).toHaveAccessibleDescription('The address must start with https://'));
    await settle(100);
    expect(patches).toHaveLength(0);

    await user.clear(address);
    await user.paste('https://registrai.example.lt/sse');
    await save(user, dialog);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ url: 'https://registrai.example.lt/sse', enabled: true });
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('MCP servers page — Lithuanian', () => {

  it('speaks Lithuanian: heading, the note, the cards, their buttons and the switch toast', async () => {
    given.capture('patch', '/api/mcp/servers/:serverId', { ...REGISTRY, enabled: true });
    const { user } = renderMcp({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'MCP serveriai' })).toBeInTheDocument();
    expect(screen.getByText(/^Serverio adresas turi būti leidžiamų išeinančių ryšių sąraše/).closest('[role]')).toHaveAttribute('role', 'status');
    const card = await cardOf(EU.name);
    expect(within(card).getByRole('switch', { name: 'Įjungtas' })).toBeChecked();
    expect(within(card).getByText('https://mcp.example.eu/mcp · HTTP (srautinis)')).toBeInTheDocument();
    expect(within(card).getByTitle('reikšmė paslėpta')).toBeInTheDocument();
    expect(within(card).getByText('Tikrinta 2026-09-20 11:04')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Rasti įrankiai (3)' })).toBeInTheDocument();
    for (const action of ['Tikrinti ryšį', 'Redaguoti', 'Ištrinti']) {
      expect(within(card).getByRole('button', { name: action })).toBeInTheDocument();
    }
    const registry = await cardOf(REGISTRY.name);
    expect(within(registry).getByText('Visi serverio įrankiai')).toBeInTheDocument();
    await user.click(within(registry).getByRole('switch', { name: 'Išjungtas' }));
    expect(await screen.findByText('Serveris įjungtas')).toBeInTheDocument();
  });


  it('the dialog in Lithuanian: labels, the rules, a duplicate name and the toast', async () => {
    given.sequence('post', '/api/mcp/servers', [
      { status: 409, body: apiError('DUPLICATE_NAME', 'An MCP server with that name exists') },
      { status: 201, body: f.NEW.mcpServer },
    ]);
    const { user } = renderMcp({ locale: 'lt' });
    const dialog = await openAdd(user, { button: 'Pridėti serverį', title: 'Naujas MCP serveris' });
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await within(dialog).findByText('Pavadinimas neatitinka formato')).toBeInTheDocument();
    expect(within(dialog).getByText('Įveskite serverio https:// adresą')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: 'Pavadinimas' }), 'eu_compliance');
    await user.type(within(dialog).getByRole('textbox', { name: 'Adresas' }), 'https://mcp.example.eu/v2');
    await user.click(within(dialog).getByRole('button', { name: 'Pridėti antraštę' }));
    expect(within(dialog).getByRole('textbox', { name: 'Antraštės pavadinimas' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Antraštės reikšmė')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Pašalinti antraštę' }));
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Pavadinimas' })).toHaveAccessibleDescription('Toks pavadinimas jau naudojamas.'));

    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    expect(await screen.findByText('Serveris pridėtas')).toBeInTheDocument();
  });


  it('a saved address Django refuses, in Lithuanian: no longer allowed, fix it first — and why, in the dialog\'s words', async () => {
    given.json('get', '/api/mcp/servers', serversWith(REGISTRY.id, { url: 'http://registrai.example.lt:8080/sse' }));
    given.apiError('patch', '/api/mcp/servers/:serverId', 'INVALID_FIELD', { status: 400, error: 'url must be an https:// URL on the standard port' });
    const { user } = renderMcp({ locale: 'lt' });
    await user.click(within(await cardOf(REGISTRY.name)).getByRole('switch', { name: 'Išjungtas' }));
    expect(await screen.findByText('Serverio „lt_registry“ adresas nebeleidžiamas — pirmiausia jį pataisykite.')).toBeInTheDocument();
    expect(screen.getByText('Adresas turi prasidėti https://')).toBeInTheDocument();
    expect(screen.queryByText('Neteisinga lauko reikšmė.')).toBeNull();
  });


  it('the address rule and the server\'s refusal of it in Lithuanian', async () => {
    given.apiError('post', '/api/mcp/servers', 'INVALID_FIELD', { status: 400, error: 'url must name a public host (a DNS name — not an address, a container or a local name)' });
    const { user } = renderMcp({ locale: 'lt' });
    const dialog = await openAdd(user, { button: 'Pridėti serverį', title: 'Naujas MCP serveris' });
    const address = within(dialog).getByRole('textbox', { name: 'Adresas' });
    expect(address).toHaveAccessibleDescription('Viešojo serverio https:// adresas (jo DNS vardas, standartinis prievadas)');
    await user.type(within(dialog).getByRole('textbox', { name: 'Pavadinimas' }), 'eu_compliance');
    await user.click(address);
    await user.paste('https://10.0.0.5/mcp');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(address).toHaveAccessibleDescription('Nurodykite serverio DNS vardą, ne IP adresą'));
    await user.clear(address);
    await user.paste('https://legalops-django:8000/');
    expect(address).toHaveAccessibleDescription('Nenurodykite prievado — pasiekiamas tik standartinis https prievadas (443)');
    await user.clear(address);
    await user.paste('https://mcp.example.eu/mcp');
    await user.click(within(dialog).getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(address).toHaveAccessibleDescription('Neteisinga lauko „Adresas“ reikšmė.'));
    expect(address).toHaveAttribute('aria-invalid', 'true');
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the list's endpoint.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/mcp/servers',
  fixture: { servers: f.mcpServers },
  render: () => renderMcp(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'MCP servers' }),
  loaded: async () => { await cardOf(EU.name); },
  loading: () => screen.getByRole('status', { name: 'Loading…' }),
});
