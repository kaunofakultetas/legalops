// -----------------------------------------------------------
//  [*] Tests — Audit page (the action trail, admin)
//
//  The /audit page end to end against the backend double:
//  the frame (heading, subtitle, the three filters, the
//  labelled grid, the loaded count); the first request
//  (?limit=200, nothing else); the trail (newest first, the
//  stamp, "System" for a row without a user, every action
//  Django audits labelled in the UI language — users.purge
//  included — an unknown action humanised, every target
//  type labelled with its short id and linked to its page
//  where there is one, a finding through its report, the
//  details summarised, the IP) and the columns a phone
//  keeps; the entry dialog (label, when, who, from where,
//  the code, the target, the details as label/value rows —
//  the keyboard's way in, the time's button, is covered by
//  audit-keyboard.test.jsx); the filters (the grouped action
//  picker offering every audited action, a whole area as a
//  prefix, one action, a user from GET /api/users, both
//  together, "until (inclusive)" as the cursor after the
//  chosen minute, clearing them, a filter that matches
//  nothing, a failed users list); coming back (the filters
//  and the table's page read from and replaced in the
//  address, unknown values ignored); the "load older" paging
//  (?before=&beforeId= — the cursor the answer's `next`
//  hands out, sent back as it is — a page boundary inside a
//  run of equal stamps skipping nothing, the button gone
//  when `next` is null, a full last page included, the
//  filters kept, busy while it loads, a failed page keeping
//  the entries on screen with its own retry); the loading,
//  failed, malformed (a broken `next` included) and empty
//  states, a failed refresh keeping the entries, hostile
//  strings and swapped types; both languages; and the
//  backend contract matrix for GET /api/audit.
// -----------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest';
import { screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData } from '../support/render';
import { mediaQueryMatches } from '../support/setup';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle, HOSTILE_STRING } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import { messagesMap } from '@/messages';
import Audit from '@/pages/Audit/Audit';


// The fixture rows the tests single out, by id suffix
const byNumber = (n) => f.auditEntries.find((row) => row.id.endsWith(`00${n}`));
const REPORT_STARTED = byNumber('16');
const MCP_CHANGED = byNumber('04');
const LOGIN_FAILED = byNumber('01');

// Below the md breakpoint (theme.breakpoints.down('md')) —
// the phone layout of the grid
const PHONE = '(max-width:899.95px)';

// Every action the Django code audits (grep of audit( in
// django/compliance) with its English label
const DJANGO_ACTIONS = {
  'auth.login': 'Sign-in',
  'auth.login_failed': 'Failed sign-in',
  'auth.logout_all': 'Sign-out everywhere',
  'auth.change_password': 'Password change',
  'users.create': 'User created',
  'users.update': 'User changed',
  'users.reset_password': 'Password set',
  'users.deactivate': 'User deactivated',
  'users.purge': 'User deleted',
  'companies.create': 'Company created',
  'companies.update': 'Company profile changed',
  'companies.delete': 'Company deleted',
  'companies.credential_add': 'Credential recorded',
  'companies.credential_update': 'Credential changed',
  'companies.credential_remove': 'Credential removed',
  'companies.role_create': 'Role created',
  'companies.role_update': 'Role changed',
  'companies.role_delete': 'Role deleted',
  'documents.upload': 'Document uploaded',
  'documents.update': 'Document changed',
  'documents.delete': 'Document deleted',
  'corpus.create': 'Legal act added',
  'corpus.update': 'Legal act changed',
  'corpus.delete': 'Legal act deleted',
  'corpus.refresh': 'Legal act refreshed',
  'corpus.upload': 'New version uploaded',
  'corpus.reembed': 'Re-embedding',
  'corpus.refresh_all': 'Source check (all acts)',
  'obligations.create': 'Obligation created',
  'obligations.update': 'Obligation changed',
  'obligations.delete': 'Obligation deleted',
  'obligations.extract': 'Obligation extraction',
  'obligations.review': 'Obligations reviewed',
  'reports.create': 'Analysis started',
  'reports.delete': 'Report deleted',
  'reports.cancel': 'Analysis cancelled',
  'reports.review_finding': 'Finding reviewed',
  'reports.export': 'Report exported',
  'reports.approve': 'Report approved',
  'reports.unapprove': 'Report approval withdrawn',
  'prompts.version_create': 'Prompt version created',
  'prompts.activate': 'Prompt activated',
  'mcp.create': 'MCP server added',
  'mcp.update': 'MCP server changed',
  'mcp.delete': 'MCP server deleted',
  'mcp.test': 'MCP server tested',
  'jobs.cancel': 'Job cancelled',
};

// Every target type Django writes, with its English label
const DJANGO_TARGET_TYPES = {
  user: 'User',
  company: 'Company',
  document: 'Document',
  legal_document: 'Legal act',
  obligation: 'Obligation',
  report: 'Report',
  finding: 'Finding',
  prompt: 'AI prompt',
  job: 'Job',
  mcp_server: 'MCP server',
};

// One trail row with a distinct id — the variations the
// tests build from the first fixture row
const entryOf = (n, change) => ({ ...REPORT_STARTED, id: `ad100000-0000-4000-8000-${String(n).padStart(12, '0')}`, ...change });







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderAudit: the page on its real route, so a target link
// lands on renderPage's "navigated away" probe.
//
// given.spy records every GET /api/audit and lets the
// default handler answer it, so a test sees both what was
// asked and the backend's own filtering; lastQuery reads
// the newest request's query off its calls. servePages:
// answers GET /api/audit with the given pages in order (the
// last repeats) and records the queries. serveTrail: a
// keyset double of the view over the given rows (newest
// first by (createdAt, id), as Django orders them) — before
// alone a strict "earlier than", before + beforeId the
// position after that entry, `next` while more follow; it
// records the queries too.
//
// trail(n, from, tag): n entries newest first, one minute
// apart, starting at `from` — a page of the paging tests;
// stamps written the way Django writes them (+00:00).
// pageOf(entries, {more}): one page as Django answers it —
// with more to come, `next` is the stamp and id of its
// oldest entry; otherwise null.
//
// rowOf / cellOf / titled / shownActions / gridLoading: the
// grid as a reader sees it — see users.test.jsx for why a
// header is matched by the title it starts with; while it
// loads the grid is aria-busy with a "Loading…" status.
//
// pick: opens a select by its label and clicks an option.
// -----------------------------------------------------------

const renderAudit = (options = {}) => renderPage(<Audit authData={authData} />, { route: '/audit', path: '/audit', ...options });

const lastQuery = (calls) => calls.at(-1)?.query;

const servePages = (...pages) => {
  const queries = [];
  server.use(http.get(url('/api/audit'), ({ request }) => {
    queries.push(Object.fromEntries(new URL(request.url).searchParams));
    const page = pages[Math.min(queries.length - 1, pages.length - 1)];
    return page.status ? HttpResponse.json(page.body, { status: page.status }) : HttpResponse.json(page);
  }));
  return queries;
};

const trail = (n, from, tag) => Array.from({ length: n }, (_, i) => ({
  ...f.auditEntries[1],
  id: `ad${tag}0000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  createdAt: new Date(Date.parse(from) - i * 60_000).toISOString().replace('.000Z', '+00:00'),
}));

const pageOf = (entries, { more = false } = {}) => ({
  entries,
  next: more ? { before: entries.at(-1).createdAt, beforeId: entries.at(-1).id } : null,
});

const serveTrail = (rows) => {
  const queries = [];
  server.use(http.get(url('/api/audit'), ({ request }) => {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    queries.push(query);
    const before = query.before ? Date.parse(query.before) : null;
    const after = rows.filter((row) => before === null || Date.parse(row.createdAt) < before
      || (query.beforeId && Date.parse(row.createdAt) === before && row.id < query.beforeId));
    const page = after.slice(0, Number(query.limit));
    return HttpResponse.json(pageOf(page, { more: after.length > page.length }));
  }));
  return queries;
};

const rowOf = async (text) => (await within(await screen.findByRole('grid')).findAllByText(text))[0].closest('[role="row"]');

const titled = (title) => (name) => name === title || name.startsWith(`${title} `);

const cellOf = (row, header) => {
  const column = within(screen.getByRole('grid')).getByRole('columnheader', { name: titled(header) }).getAttribute('aria-colindex');
  return within(row).getAllByRole('gridcell').find((cell) => cell.getAttribute('aria-colindex') === column);
};

const bodyRows = () => within(screen.getByRole('grid')).getAllByRole('row').slice(1);

const shownActions = () => bodyRows().map((row) => cellOf(row, 'Action').textContent);

const gridLoading = () => screen.getByRole('grid', { busy: true }) && screen.getByText('Loading…', { selector: '[role="status"]' });

const pick = async (user, label, option) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getAllByRole('option', { name: option }).at(-1));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
};

const loaded = (count) => screen.findByText(`Entries loaded: ${count}`);







// -----------------------------------------------------------
// Audit page — the frame
// -----------------------------------------------------------

describe('Audit page — the frame', () => {

  it('frames the trail in the page layout: heading, subtitle, the three filters, the labelled grid and the count', async () => {
    renderAudit();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument();
    expect(within(main).getByText(/^Who changed what and when:/)).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'Action' })).toBeInTheDocument();
    expect(within(main).getByRole('combobox', { name: 'User' })).toBeInTheDocument();
    expect(within(main).getByLabelText('Until (inclusive)')).toHaveAttribute('type', 'datetime-local');
    expect(await within(main).findByRole('grid', { name: 'Audit log' })).toBeInTheDocument();
    expect(await loaded(16)).toBeInTheDocument();
    // Sixteen entries are the whole trail — `next` is null:
    // nothing older to ask for
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });


  it('asks for one page of 200 entries with no filter, and for the users the picker offers', async () => {
    const calls = given.spy('get', '/api/audit');
    const userCalls = given.capture('get', '/api/users', { users: f.users });
    renderAudit();
    await loaded(16);
    await settle(100);
    expect(calls.map((call) => call.query)).toEqual([{ limit: '200' }]);
    expect(userCalls).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// The trail
// -----------------------------------------------------------
//
// What a row shows: stamp, user, action label, target (with
// its link), details, IP; labels for every audited action and
// target type.
// -----------------------------------------------------------

describe('Audit page — the trail', () => {

  it('lists the entries newest first with the stamp, user, action, target, details and IP', async () => {
    renderAudit();
    await loaded(16);
    expect(shownActions().slice(0, 4)).toEqual(['Analysis started', 'Sign-in', 'Sign-in', 'Legal act added']);
    expect(shownActions().at(-1)).toBe('Failed sign-in');

    const first = bodyRows()[0];
    expect(cellOf(first, 'Time')).toHaveTextContent(/^27\/09\/2026, 09:40$/);
    expect(cellOf(first, 'User')).toHaveTextContent(/^Rūta Administratorė$/);
    expect(cellOf(first, 'Target')).toHaveTextContent(/^Report e0000000$/);
    expect(cellOf(first, 'Details')).toHaveTextContent(`company: ${f.ID.kreditas} · language: lt`);
    expect(cellOf(first, 'IP address')).toHaveTextContent(/^203\.0\.113\.10$/);

    // Jonas's own sign-in names him
    expect(cellOf(bodyRows()[1], 'User')).toHaveTextContent(/^Jonas Naudotojas$/);
  });


  it('names a row without an account "System" and shows its IP; a user target without an id has no link', async () => {
    renderAudit();
    await loaded(16);
    const failed = bodyRows().at(-1);
    expect(cellOf(failed, 'User')).toHaveTextContent(/^System$/);
    expect(cellOf(failed, 'Action')).toHaveTextContent(/^Failed sign-in$/);
    expect(cellOf(failed, 'Target')).toHaveTextContent(/^User$/);
    expect(within(cellOf(failed, 'Target')).queryByRole('link')).toBeNull();
    expect(cellOf(failed, 'Details')).toHaveTextContent(/^reason: unknown_email$/);
    expect(cellOf(failed, 'IP address')).toHaveTextContent(/^198\.51\.100\.23$/);
  });


  it('summarises the details: lists and objects as JSON, booleans as words, nothing for an empty object', async () => {
    renderAudit();
    await loaded(16);
    const mcp = await rowOf('MCP server changed');
    expect(cellOf(mcp, 'Details')).toHaveTextContent('fields: ["enabled"] · enabled: true · headerNames: ["Authorization"]');
    expect(cellOf(await rowOf('Legal act refreshed'), 'Details')).toHaveTextContent(/^force: false$/);
    expect(cellOf(await rowOf('Report approved'), 'Details')).toHaveTextContent(/^$/);
  });


  it('links each target to its page — a finding through its report — and leaves a job and "all" as text', async () => {
    given.json('get', '/api/audit', {
      entries: [
        ...f.auditEntries,
        entryOf(1, { action: 'corpus.reembed', targetType: 'legal_document', targetId: 'all', details: {} }),
      ],
    });
    renderAudit();
    await loaded(17);
    const linkIn = async (action) => within(cellOf(await rowOf(action), 'Target')).queryByRole('link');
    expect(await linkIn('Analysis started')).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
    expect(await linkIn('Company created')).toHaveAttribute('href', `/companies/${f.ID.kreditas}`);
    expect(await linkIn('Legal act added')).toHaveAttribute('href', `/corpus/${f.ID.lbRules}`);
    expect(await linkIn('Prompt activated')).toHaveAttribute('href', '/prompts/report.gap_analysis');
    expect(await linkIn('MCP server changed')).toHaveAttribute('href', '/settings/mcp');
    expect(await linkIn('User deactivated')).toHaveAttribute('href', '/users');
    expect(await linkIn('Finding reviewed')).toHaveAttribute('href', `/reports/${f.ID.reportDone}?tab=findings`);
    expect(await linkIn('Finding reviewed')).toHaveTextContent(/^Finding e2000000$/);
    expect(await linkIn('Job cancelled')).toBeNull();
    expect(cellOf(await rowOf('Job cancelled'), 'Target')).toHaveTextContent(/^Job b0000000$/);
    expect(await linkIn('Re-embedding')).toBeNull();
    expect(cellOf(await rowOf('Re-embedding'), 'Target')).toHaveTextContent(/^Legal act all$/);
  });


  it('a finding whose details name no report has no link', async () => {
    given.json('get', '/api/audit', { entries: [entryOf(1, { action: 'reports.review_finding', targetType: 'finding', targetId: f.ID.findingRegister, details: { override: 'met' } })] });
    renderAudit();
    const row = await rowOf('Finding reviewed');
    expect(cellOf(row, 'Target')).toHaveTextContent(/^Finding e2000000$/);
    expect(within(cellOf(row, 'Target')).queryByRole('link')).toBeNull();
  });


  it('a click on a target link opens that page without opening the entry', async () => {
    const { user } = renderAudit();
    await loaded(16);
    await user.click(within(cellOf(await rowOf('Company created'), 'Target')).getByRole('link'));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/companies/${f.ID.kreditas}`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });


  it('labels every action the Django code audits in the UI language — none humanised, users.purge included', async () => {
    given.json('get', '/api/audit', { entries: Object.keys(DJANGO_ACTIONS).map((action, i) => entryOf(i, { action, details: {} })) });
    renderAudit();
    await loaded(Object.keys(DJANGO_ACTIONS).length);
    expect(shownActions()).toEqual(Object.values(DJANGO_ACTIONS));
    for (const action of Object.keys(DJANGO_ACTIONS)) {
      const [group, name] = action.split('.');
      for (const locale of ['en', 'lt']) {
        expect(messagesMap[locale].ENUMS.auditAction[group]?.[name], `${locale}: ${action}`).toEqual(expect.any(String));
      }
    }
  });


  it('labels every target type the Django code writes', async () => {
    given.json('get', '/api/audit', {
      entries: Object.keys(DJANGO_TARGET_TYPES).map((targetType, i) => entryOf(i, { action: 'users.update', targetType, targetId: `x${i}`, details: {} })),
    });
    renderAudit();
    await loaded(Object.keys(DJANGO_TARGET_TYPES).length);
    expect(bodyRows().map((row) => cellOf(row, 'Target').textContent)).toEqual(Object.values(DJANGO_TARGET_TYPES).map((label, i) => `${label} x${i}`));
    for (const type of Object.keys(DJANGO_TARGET_TYPES)) {
      for (const locale of ['en', 'lt']) {
        expect(messagesMap[locale].ENUMS.targetType[type], `${locale}: ${type}`).toEqual(expect.any(String));
      }
    }
  });


  it('humanises an action the labels do not know yet instead of showing the code', async () => {
    given.json('get', '/api/audit', { entries: [entryOf(1, { action: 'reports.frobnicate', targetType: 'widget', details: {} })] });
    renderAudit();
    const row = await rowOf('Reports frobnicate');
    expect(cellOf(row, 'Target')).toHaveTextContent(/^Widget e0000000$/);
    expect(within(row).queryByText('reports.frobnicate')).toBeNull();
  });


  it('shows markup in every string as text, never as elements', async () => {
    given.json('get', '/api/audit', {
      entries: f.auditEntries.map((row) => ({ ...row, userName: HOSTILE_STRING, action: HOSTILE_STRING, targetType: HOSTILE_STRING, ip: HOSTILE_STRING, details: { note: HOSTILE_STRING } })),
    });
    renderAudit();
    await loaded(16);
    expect(cellOf(bodyRows()[0], 'User').textContent).toContain('<script>alert(1)</script>');
    expect(cellOf(bodyRows()[0], 'Details').textContent).toContain('<img src=x onerror=alert(2)>');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });


  it('survives numbers and strings swapped in every field of rows that keep their ids', async () => {
    given.json('get', '/api/audit', {
      entries: f.auditEntries.map((row, i) => ({
        ...row, userId: 12345, userName: 12345, action: 12345, targetType: 12345, targetId: 12345, ip: 12345,
        details: { count: '3', flag: 'true' }, createdAt: 1_790_000_000_000 - i,
      })),
    });
    renderAudit();
    await loaded(16);
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(cellOf(bodyRows()[0], 'Target')).toHaveTextContent('12345');
  });
});







// -----------------------------------------------------------
// The trail on a phone
// -----------------------------------------------------------
//
// The page picks the columns a narrow screen drops (the
// entry dialog still has them); the media-query stub is
// module state, so it is switched back after every test.
// -----------------------------------------------------------

describe('Audit page — the trail on a phone', () => {

  afterEach(() => {
    mediaQueryMatches(PHONE, false);
  });


  it('keeps the time, user and action, drops the target, details and IP — the entry still shows them', async () => {
    mediaQueryMatches(PHONE);
    const { user } = renderAudit();
    await loaded(16);
    for (const header of ['Time', 'User', 'Action']) {
      expect(screen.getByRole('columnheader', { name: titled(header) })).toBeInTheDocument();
    }
    for (const header of ['Target', 'Details', 'IP address']) {
      expect(screen.queryByRole('columnheader', { name: titled(header) })).toBeNull();
    }
    await user.click(cellOf(bodyRows()[0], 'Action'));
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText(/^Action code:/)).toHaveTextContent(`Report ${f.ID.reportRunning}`);
    expect(within(dialog).getByText('27/09/2026, 09:40 · Rūta Administratorė · 203.0.113.10')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Entry dialog
// -----------------------------------------------------------
//
// A row click → the whole entry.
// -----------------------------------------------------------

describe('Audit page — the entry dialog', () => {

  it('a row click opens the whole entry: the action, when, who, from where, the code, the target and the details', async () => {
    const { user } = renderAudit();
    await loaded(16);
    await user.click(cellOf(bodyRows()[0], 'Action'));
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('Analysis started')).toBeInTheDocument();
    expect(within(dialog).getByText('27/09/2026, 09:40 · Rūta Administratorė · 203.0.113.10')).toBeInTheDocument();
    expect(within(dialog).getByText(REPORT_STARTED.action, { selector: 'code' })).toBeInTheDocument();
    expect(within(dialog).getByText(/^Action code:/)).toHaveTextContent(`Action code: reports.create · Report ${f.ID.reportRunning}`);
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Details' })).toBeInTheDocument();
    expect(within(dialog).getByText('Company').nextElementSibling).toHaveTextContent(f.ID.kreditas);
    expect(within(dialog).getByText('Language').nextElementSibling).toHaveTextContent(/^lt$/);

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audit entry' })).toBeNull());
  });


  it('shows a row without an account as "System", and its reason', async () => {
    const { user } = renderAudit();
    await loaded(16);
    await user.click(cellOf(bodyRows().at(-1), 'Action'));
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('12/09/2026, 07:58 · System · 198.51.100.23')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Action code:/)).toHaveTextContent(/^Action code: auth\.login_failed · User\s*$/);
    expect(within(dialog).getByText('Reason').nextElementSibling).toHaveTextContent('unknown_email');
    expect(LOGIN_FAILED.userId).toBeNull();
  });


  it('shows lists in the details as chips and booleans as Yes / No', async () => {
    const { user } = renderAudit();
    await loaded(16);
    await user.click(cellOf(await rowOf('MCP server changed'), 'Action'));
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('Fields').nextElementSibling).toHaveTextContent(/^enabled$/);
    expect(within(dialog).getByText('Enabled').nextElementSibling).toHaveTextContent(/^Yes$/);
    expect(within(dialog).getByText('Header names').nextElementSibling).toHaveTextContent(/^Authorization$/);
    expect(MCP_CHANGED.details.headerNames).toEqual(['Authorization']);
  });


  it('an entry without details and without an IP shows dashes', async () => {
    given.json('get', '/api/audit', { entries: [entryOf(1, { details: {}, ip: null })] });
    const { user } = renderAudit();
    await user.click(cellOf(await rowOf('Analysis started'), 'Action'));
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(within(dialog).getByText('27/09/2026, 09:40 · Rūta Administratorė · —')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Details' }).nextElementSibling).toHaveTextContent(/^—$/);
  });
});







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// action (a prefix on the server), user, "until" — each one
// restarts the trail with the filter in the query.
// -----------------------------------------------------------

describe('Audit page — the filters', () => {

  it('the action picker offers every audited area — its heading, "All: <area>" and its actions — users.purge included', async () => {
    const { user } = renderAudit();
    await loaded(16);
    await user.click(screen.getByRole('combobox', { name: 'Action' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(options[0]).toBe('All actions');
    const users = options.indexOf('All: Users');
    expect(options.slice(users - 1, users + 7)).toEqual([
      'Users', 'All: Users', 'User created', 'User changed', 'Password set', 'User deactivated', 'User deleted', 'Companies',
    ]);
    // Every action Django audits can be picked on its own
    for (const label of Object.values(DJANGO_ACTIONS)) {
      expect(options, label).toContain(label);
    }
    for (const area of ['Sign-in', 'Users', 'Companies', 'Documents', 'Legal acts', 'Obligations', 'Reports', 'AI prompts', 'MCP servers', 'Jobs']) {
      expect(options).toContain(`All: ${area}`);
    }
  });


  it('a whole area asks for its prefix (?action=users.) and shows only its entries; "Clear the filters" appears', async () => {
    const calls = given.spy('get', '/api/audit');
    const { user } = renderAudit();
    await loaded(16);
    await pick(user, 'Action', 'All: Users');
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', action: 'users.' }));
    await loaded(1);
    expect(shownActions()).toEqual(['User deactivated']);
    expect(screen.getByRole('button', { name: 'Clear the filters' })).toBeInTheDocument();
  });


  it('one action asks for its exact code (?action=auth.login_failed) and shows only those entries', async () => {
    const calls = given.spy('get', '/api/audit');
    const { user } = renderAudit();
    await loaded(16);
    await pick(user, 'Action', 'Failed sign-in');
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', action: 'auth.login_failed' }));
    await loaded(1);
    expect(shownActions()).toEqual(['Failed sign-in']);
  });


  it('the user picker offers every account by name — the inactive one too — and asks for that user\'s id', async () => {
    const calls = given.spy('get', '/api/audit');
    const { user } = renderAudit();
    await loaded(16);
    await user.click(screen.getByRole('combobox', { name: 'User' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['All users', 'Rūta Administratorė', 'Jonas Naudotojas', 'Lina Buvusi']);
    await user.click(screen.getByRole('option', { name: 'Jonas Naudotojas' }));
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', user: f.ID.jonas }));
    await loaded(3);
    expect(shownActions()).toEqual(['Sign-in', 'Analysis started', 'Analysis started']);
    expect(bodyRows().every((row) => cellOf(row, 'User').textContent === 'Jonas Naudotojas')).toBe(true);
  });


  it('both filters travel together', async () => {
    const calls = given.spy('get', '/api/audit');
    const { user } = renderAudit();
    await loaded(16);
    await pick(user, 'Action', 'All: Reports');
    await loaded(5);
    await pick(user, 'User', 'Jonas Naudotojas');
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', action: 'reports.', user: f.ID.jonas }));
    await loaded(2);
    expect(shownActions()).toEqual(['Analysis started', 'Analysis started']);
  });


  it('"Until (inclusive)" keeps the chosen minute: the cursor is the start of the next one', async () => {
    const calls = given.spy('get', '/api/audit');
    renderAudit();
    await loaded(16);
    // The picker's value is local time; the suite runs in UTC
    fireEvent.change(screen.getByLabelText('Until (inclusive)'), { target: { value: '2026-09-24T14:05' } });
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', before: '2026-09-24T14:06:00.000Z' }));
    // "Company created" was written at 14:05 sharp — in; 14:30 — out
    await loaded(10);
    expect(shownActions()[0]).toBe('Company created');
    expect(shownActions()).not.toContain('Obligation extraction');
  });


  it('"Clear the filters" goes back to the whole trail and hides itself', async () => {
    const calls = given.spy('get', '/api/audit');
    const { user } = renderAudit();
    await loaded(16);
    await pick(user, 'Action', 'All: Users');
    await pick(user, 'User', 'Rūta Administratorė');
    fireEvent.change(screen.getByLabelText('Until (inclusive)'), { target: { value: '2026-09-20T12:00' } });
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', action: 'users.', user: f.ID.admin, before: '2026-09-20T12:01:00.000Z' }));
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await loaded(16);
    expect(lastQuery(calls)).toEqual({ limit: '200' });
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
    expect(screen.getByLabelText('Until (inclusive)')).toHaveValue('');
  });


  it('a filter nothing matches shows "No entries" and keeps the filters to change', async () => {
    const { user } = renderAudit();
    await loaded(16);
    await pick(user, 'Action', 'All: Documents');
    expect(await screen.findByText('No entries')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Action' })).toHaveTextContent('All: Documents');
    expect(screen.getByRole('button', { name: 'Clear the filters' })).toBeInTheDocument();
  });


  it('a failed users list leaves the user picker with "All users" only — the trail still loads', async () => {
    given.apiError('get', '/api/users', 'SERVER_ERROR', { status: 500 });
    const { user } = renderAudit();
    await loaded(16);
    await user.click(screen.getByRole('combobox', { name: 'User' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['All users']);
  });
});







// -----------------------------------------------------------
// Audit page — coming back
// -----------------------------------------------------------
//
// The filters and the table's page and sort live in the
// address (replaced): Back from a target's page finds the
// trail as it was left. An action the picker does not offer,
// a user the directory does not have or an unreadable moment
// is ignored.
// -----------------------------------------------------------

describe('Audit page — coming back', () => {

  it('the action, the user and the "until" moment come from the address', async () => {
    const calls = given.spy('get', '/api/audit');
    renderAudit({ route: `/audit?action=reports.&user=${f.ID.jonas}&before=2026-09-30T12:00` });
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200', action: 'reports.', user: f.ID.jonas, before: '2026-09-30T12:01:00.000Z' }));
    await loaded(2);
    expect(screen.getByRole('combobox', { name: 'Action' })).toHaveTextContent('All: Reports');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'User' })).toHaveTextContent('Jonas Naudotojas'));
    expect(screen.getByLabelText('Until (inclusive)')).toHaveValue('2026-09-30T12:00');
  });


  it('the filters write the address, replacing it (the table back on its first page); "Clear" empties it', async () => {
    const { user, router } = renderAudit({ route: '/audit?page=2' });
    await loaded(16);
    await pick(user, 'Action', 'All: Users');
    await waitFor(() => expect(router.state.location.search).toBe('?action=users.'));
    expect(router.state.historyAction).toBe('REPLACE');
    fireEvent.change(screen.getByLabelText('Until (inclusive)'), { target: { value: '2026-09-20T12:00' } });
    await waitFor(() => expect(router.state.location.search).toBe('?action=users.&before=2026-09-20T12%3A00'));
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });


  it('an action not offered, a user not in the directory and an unreadable moment are ignored', async () => {
    const calls = given.spy('get', '/api/audit');
    renderAudit({ route: '/audit?action=root.everything&user=a0000000-0000-4000-8000-0000000000ff&before=yesterday' });
    await waitFor(() => expect(lastQuery(calls)).toEqual({ limit: '200' }));
    await loaded(16);
    expect(screen.getByLabelText('Until (inclusive)')).toHaveValue('');
  });


  it('the table\'s page comes back: page 2 of the trail', async () => {
    servePages(pageOf(trail(120, '2026-09-27T12:00:00+00:00', 'aa')));
    renderAudit({ route: '/audit?page=2' });
    await loaded(120);
    await waitFor(() => expect(document.querySelector('.MuiDataGrid-footerContainer').textContent).toContain('51–100 of 120'));
  });


  it('in Lithuanian too', async () => {
    renderAudit({ route: '/audit?action=users.', locale: 'lt' });
    expect(await screen.findByRole('combobox', { name: 'Veiksmas' })).toHaveTextContent('Visi: Naudotojai');
  });
});







// -----------------------------------------------------------
// Paging
// -----------------------------------------------------------
//
// A page whose answer carries a `next` offers "Load older
// entries": the next request sends that cursor back as it
// is, before and beforeId. A null `next` ends the trail.
// -----------------------------------------------------------

describe('Audit page — load older entries', () => {

  const FIRST = trail(200, '2026-09-27T09:40:00Z', '11');
  const OLDER = trail(16, '2026-09-26T00:00:00Z', '22');
  // The cursor after FIRST, as the answer hands it out
  const AFTER_FIRST = { before: FIRST[199].createdAt, beforeId: FIRST[199].id };


  it('a page with a `next` offers the older entries; the next request sends that cursor back and the rows are appended', async () => {
    const queries = servePages(pageOf(FIRST, { more: true }), pageOf(OLDER));
    const { user } = renderAudit();
    await loaded(200);
    await user.click(screen.getByRole('button', { name: 'Load older entries' }));
    await loaded(216);
    expect(queries).toEqual([{ limit: '200' }, { limit: '200', ...AFTER_FIRST }]);
    // No `next`: the trail is complete
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
  });


  it('a full page whose `next` is null ends the trail — nothing older is offered or asked for', async () => {
    const queries = servePages(pageOf(FIRST));
    renderAudit();
    await loaded(200);
    await settle(100);
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
    expect(queries).toEqual([{ limit: '200' }]);
  });


  it('a page boundary inside a run of equal stamps skips nothing: the rest of the run comes next, then the older entries', async () => {
    // Ten entries written in one instant (ids descending, the
    // view's order) between 195 newer and 3 older ones — the
    // first page of 200 ends inside the run
    const run = Array.from({ length: 10 }, (_, i) => ({
      ...f.auditEntries[1], id: `ad330000-0000-4000-8000-${String(9 - i).padStart(12, '0')}`, createdAt: '2026-09-27T06:00:00.123456+00:00',
    }));
    const queries = serveTrail([...trail(195, '2026-09-27T09:40:00Z', '11'), ...run, ...trail(3, '2026-09-26T00:00:00Z', '44')]);
    const { user } = renderAudit();
    await loaded(200);
    await user.click(screen.getByRole('button', { name: 'Load older entries' }));
    // `before` alone would skip the five of the run still to come
    await loaded(208);
    expect(queries).toEqual([{ limit: '200' }, { limit: '200', before: '2026-09-27T06:00:00.123456+00:00', beforeId: run[4].id }]);
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
  });


  it('pages keep the filters, and "until" only starts the first page', async () => {
    // Every first page has more to come; the page after its
    // cursor is the last
    const queries = [];
    server.use(http.get(url('/api/audit'), ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      queries.push(query);
      return HttpResponse.json(query.beforeId === AFTER_FIRST.beforeId ? pageOf(OLDER) : pageOf(FIRST, { more: true }));
    }));
    const { user } = renderAudit();
    await loaded(200);
    await pick(user, 'Action', 'All: Sign-in');
    await pick(user, 'User', 'Jonas Naudotojas');
    fireEvent.change(screen.getByLabelText('Until (inclusive)'), { target: { value: '2026-09-27T09:40' } });
    await waitFor(() => expect(queries.at(-1)).toEqual({ limit: '200', action: 'auth.', user: f.ID.jonas, before: '2026-09-27T09:41:00.000Z' }));
    await user.click(await screen.findByRole('button', { name: 'Load older entries' }));
    await waitFor(() => expect(queries.at(-1)).toEqual({ limit: '200', action: 'auth.', user: f.ID.jonas, ...AFTER_FIRST }));
    await loaded(216);
  });


  it('the button is busy while the older page is on its way', async () => {
    let answer;
    const answered = new Promise((resolve) => { answer = resolve; });
    let calls = 0;
    server.use(http.get(url('/api/audit'), async () => {
      calls += 1;
      if (calls === 1) return HttpResponse.json(pageOf(FIRST, { more: true }));
      await answered;
      return HttpResponse.json(pageOf(OLDER));
    }));
    const { user } = renderAudit();
    await loaded(200);
    const more = screen.getByRole('button', { name: 'Load older entries' });
    await user.click(more);
    await waitFor(() => expect(more).toBeDisabled());
    answer();
    await loaded(216);
  });


  it('a failed older page keeps the entries on screen, says so under them and retries that page', async () => {
    const queries = servePages(pageOf(FIRST, { more: true }), { status: 502, body: apiError('SERVER_ERROR') }, pageOf(OLDER));
    const { user } = renderAudit();
    await loaded(200);
    await user.click(screen.getByRole('button', { name: 'Load older entries' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The older entries could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    // The 200 entries stay, the page's own load error is not shown
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('Entries loaded: 200')).toBeInTheDocument();
    expect(screen.queryByText('The audit log could not be loaded')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await loaded(216);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(queries.slice(1)).toEqual([
      { limit: '200', ...AFTER_FIRST },
      { limit: '200', ...AFTER_FIRST },
    ]);
  });
});







// -----------------------------------------------------------
// States
// -----------------------------------------------------------

describe('Audit page — loading, failed, malformed and empty', () => {

  it('says it is loading while the trail is on its way — the grid busy, a status — not "No entries", not an alert', async () => {
    given.hang('get', '/api/audit');
    renderAudit();
    await screen.findByRole('grid', { name: 'Audit log' });
    await settle(100);
    expect(screen.getByRole('grid', { name: 'Audit log', busy: true })).toBeInTheDocument();
    expect(screen.getByText('Loading…', { selector: '[role="status"]' })).toBeInTheDocument();
    expect(screen.queryByText('No entries')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a failed trail shows the page\'s error with the translated sentence and a retry that brings the entries', async () => {
    given.sequence('get', '/api/audit', [{ status: 500, body: apiError('SERVER_ERROR', 'Internal server error') }, { body: { entries: f.auditEntries } }]);
    const { user } = renderAudit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The audit log could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText('No entries')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await loaded(16)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it.each([
    ['entries without ids', { entries: [{ action: 'auth.login' }, { action: 'auth.logout_all' }] }],
    ['two entries sharing one id', { entries: [REPORT_STARTED, { ...REPORT_STARTED, action: 'reports.cancel' }] }],
    ['no entries list at all', { rows: f.auditEntries }],
    ['a list for the whole answer', f.auditEntries],
    // A trail that only looked complete would hide entries
    ['a `next` that is not a cursor', { entries: f.auditEntries, next: 'older' }],
    ['a `next` without its id', { entries: f.auditEntries, next: { before: LOGIN_FAILED.createdAt } }],
  ])('an answer with %s fails like any bad answer — the error state and its retry, never a crash', async (_, body) => {
    given.sequence('get', '/api/audit', [{ body }, { body: { entries: f.auditEntries } }]);
    const { user } = renderAudit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The audit log could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(screen.queryByText('No entries')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await loaded(16)).toBeInTheDocument();
  });


  it('a failed refresh keeps the entries on screen with the error above them; its retry refreshes the trail', async () => {
    given.sequence('get', '/api/audit', [
      { body: { entries: f.auditEntries } },
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { entries: f.auditEntries } },
    ]);
    const { user, queryClient } = renderAudit();
    await loaded(16);
    // What a refetch on window focus does
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['audit'] }); });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The audit log could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('Entries loaded: 16')).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Entries loaded: 16')).toBeInTheDocument();
  });


  it('an empty trail says "No entries" instead of showing an empty grid', async () => {
    given.json('get', '/api/audit', { entries: [] });
    renderAudit();
    expect(await screen.findByText('No entries')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText(/Entries loaded/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('Audit page — Lithuanian', () => {

  it('speaks Lithuanian: heading, filters, columns, action and target labels, "System", stamps, the count and the entry', async () => {
    const { user } = renderAudit({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'Veiksmų žurnalas' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Veiksmas' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Naudotojas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Iki (imtinai)')).toBeInTheDocument();
    expect(await screen.findByText('Įkelta įrašų: 16')).toBeInTheDocument();
    for (const header of ['Laikas', 'Naudotojas', 'Veiksmas', 'Objektas', 'Detalės', 'IP adresas']) {
      expect(screen.getByRole('columnheader', { name: titled(header) })).toBeInTheDocument();
    }
    const first = bodyRows()[0];
    expect(cellOf(first, 'Veiksmas')).toHaveTextContent(/^Analizės paleidimas$/);
    expect(cellOf(first, 'Laikas')).toHaveTextContent(/^2026-09-27 09:40$/);
    expect(cellOf(first, 'Objektas')).toHaveTextContent(/^Ataskaita e0000000$/);
    const failed = bodyRows().at(-1);
    expect(cellOf(failed, 'Naudotojas')).toHaveTextContent(/^Sistema$/);
    expect(cellOf(failed, 'Veiksmas')).toHaveTextContent(/^Nesėkmingas prisijungimas$/);

    await user.click(screen.getByRole('combobox', { name: 'Veiksmas' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('Visi: Naudotojai');
    expect(options).toContain('Naudotojo ištrynimas');
    await user.keyboard('{Escape}');

    await user.click(within(first).getByRole('button', { name: 'Atidaryti 2026-09-27 09:40 įrašą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Žurnalo įrašas' });
    expect(within(dialog).getByText(/^Veiksmo kodas:/)).toHaveTextContent('Veiksmo kodas: reports.create · Ataskaita');
    expect(within(dialog).getByRole('button', { name: 'Uždaryti' })).toBeInTheDocument();
  });


  it('says "Įrašų nėra" for an empty trail and the Lithuanian sentence for a failure', async () => {
    given.sequence('get', '/api/audit', [{ status: 503, body: apiError('SERVER_ERROR') }, { body: { entries: [] } }]);
    const { user } = renderAudit({ locale: 'lt' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nepavyko įkelti žurnalo');
    await user.click(within(alert).getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('Įrašų nėra')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the trail's endpoint.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/audit',
  fixture: { entries: f.auditEntries },
  render: () => renderAudit(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'Audit log' }),
  loaded: async () => { await loaded(16); },
  loading: gridLoading,
});
