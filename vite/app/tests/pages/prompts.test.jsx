// -----------------------------------------------------------
//  [*] Tests — Prompts page (the versioned prompt store list)
//
//  The /prompts page end to end against the backend double:
//  the frame (title, subtitle, the sidebar's current item,
//  the document title), the grid (every prompt in the
//  backend's kind-then-slug order, the translated name as a
//  link with its description, the slug, the purpose label,
//  the active version and model, the updated stamp, the "new
//  default waiting" marker on the one prompt that has one,
//  a prompt without an active version, a prompt the
//  translations do not know, sorting by the translated
//  name — the order kept in the address, an unknown column
//  ignored), opening the editor by the link and by a row click,
//  the empty, loading and failed states with the retry, a
//  malformed answer and rows the grid cannot key, both
//  locales and a language switch, both roles through the
//  real route table (a plain user never reaches the list),
//  and the backend contract matrix for GET /api/prompts.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import { renderPage, renderApp, authData } from '../support/render';
import { given, apiError } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Prompts from '@/pages/Prompts/Prompts';


// The slugs in the order GET /api/prompts answers them
// (serialize order: kind, then slug)
const FIXTURE_ORDER = f.prompts.map((row) => row.slug);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderList renders the page on its own route, so a link or
// a row click lands on the router's "navigated away" probe.
// The grid rows are read through the DataGrid's own
// data-field attribute — the only handle on a column inside
// a row; the header row carries the same attribute on its
// column headers, so only gridcells count.
// -----------------------------------------------------------

const renderList = (options = {}) => renderPage(<Prompts authData={authData} />, { route: '/prompts', path: '/prompts', ...options });

const grid = () => screen.getByRole('grid', { name: 'AI prompts' });

const cellOf = (row, field) => row.querySelector(`[role="gridcell"][data-field="${field}"]`);

const dataRows = () => within(grid()).queryAllByRole('row').filter((row) => cellOf(row, 'slug'));

const shownSlugs = () => dataRows().map((row) => cellOf(row, 'slug').textContent);

// The grid row that links to the prompt with this name
const rowOf = async (name) => (await screen.findByRole('link', { name })).closest('[role="row"]');

const probe = () => screen.getByTestId('navigated-away');







// -----------------------------------------------------------
// Frame
// -----------------------------------------------------------

describe('Prompts page — frame', () => {

  it('titles the page, explains it and marks "AI prompts" as the current sidebar item', async () => {
    renderList();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'AI prompts' })).toBeInTheDocument();
    expect(within(main).getByText('The versioned instructions the chat assistant and every analysis step follow.')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'AI prompts' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('grid', { name: 'AI prompts' })).toBeInTheDocument();
  });


  it('labels the columns in reading order', async () => {
    renderList();
    await rowOf('Chat assistant');
    expect(within(grid()).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Prompt', 'Identifier', 'Purpose', 'Active version', 'Model', 'Updated']);
  });
});







// -----------------------------------------------------------
// The rows
// -----------------------------------------------------------

describe('Prompts page — the rows', () => {

  it('lists every prompt once, in the backend\'s order (by purpose, then identifier)', async () => {
    renderList();
    await rowOf('Chat assistant');
    expect(shownSlugs()).toEqual(FIXTURE_ORDER);
    expect(FIXTURE_ORDER).toHaveLength(8);
  });


  it('a row shows the translated name as a link to its editor, the description, the slug, purpose, active version, model and update stamp', async () => {
    renderList();
    const row = await rowOf('Chat assistant');
    expect(within(row).getByRole('link', { name: 'Chat assistant' })).toHaveAttribute('href', '/prompts/chat.assistant');
    expect(cellOf(row, 'name')).toHaveTextContent(/The system prompt of the conversational assistant — the main screen of the platform\./);
    expect(cellOf(row, 'slug')).toHaveTextContent('chat.assistant');
    expect(cellOf(row, 'kind')).toHaveTextContent('Chat');
    expect(cellOf(row, 'activeVersion')).toHaveTextContent(/^v2/);
    expect(cellOf(row, 'activeModel')).toHaveTextContent('gateway:azure/gpt-5.5');
    expect(cellOf(row, 'updatedAt')).toHaveTextContent('15/09/2026, 09:30');
  });


  it('every row links its own editor, and the purposes read as the enum labels', async () => {
    renderList();
    await rowOf('Chat assistant');
    for (const prompt of f.prompts) {
      const row = dataRows().find((r) => cellOf(r, 'slug').textContent === prompt.slug);
      expect(within(row).getByRole('link')).toHaveAttribute('href', `/prompts/${prompt.slug}`);
    }
    const purposes = Object.fromEntries(dataRows().map((row) => [cellOf(row, 'slug').textContent, cellOf(row, 'kind').textContent]));
    expect(purposes).toEqual({
      'chat.assistant': 'Chat',
      'corpus.check_citations': 'Legal corpus',
      'corpus.extract_obligations': 'Legal corpus',
      'report.action_plan': 'Analysis step',
      'report.applicability': 'Analysis step',
      'report.gap_analysis': 'Analysis step',
      'report.inventory': 'Analysis step',
      'report.summary': 'Analysis step',
    });
  });


  it('marks only the prompt whose newer shipped default waits beside the admin\'s own version', async () => {
    renderList();
    const chat = await rowOf('Chat assistant');
    expect(within(chat).getByText('New default v3 waiting')).toBeInTheDocument();
    expect(screen.getAllByText(/New default v\d+ waiting/)).toHaveLength(1);
    // The admin's own v2 of the gap analysis is active, but no
    // newer default waits: no marker there
    const gap = await rowOf('Gap analysis');
    expect(cellOf(gap, 'activeVersion').textContent).toBe('v2');
  });


  it('a prompt without an active version reads "Not activated" with no model', async () => {
    given.json('get', '/api/prompts', {
      prompts: f.prompts.map((row) => (row.slug === 'report.summary' ? { ...row, activeVersion: null, activeModel: null, pendingDefault: null } : row)),
    });
    renderList();
    const row = await rowOf('Executive summary');
    expect(cellOf(row, 'activeVersion').textContent).toBe('Not activated');
    expect(cellOf(row, 'activeModel').textContent).toBe('—');
  });


  it('a prompt the translations do not know keeps the name and description the API sent', async () => {
    const novel = { ...f.prompts[7], id: 'f0000000-0000-4000-8000-000000000009', slug: 'report.new_step', name: 'New analysis step', description: 'Checks something new.' };
    given.json('get', '/api/prompts', { prompts: [...f.prompts, novel] });
    renderList();
    const row = await rowOf('New analysis step');
    expect(within(row).getByText('Checks something new.')).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/prompts/report.new_step');
  });


  it('a prompt without a description shows its name alone', async () => {
    given.json('get', '/api/prompts', { prompts: [{ ...f.prompts[0], slug: 'chat.other', name: 'Other chat', description: '' }] });
    renderList();
    const row = await rowOf('Other chat');
    expect(cellOf(row, 'name').textContent).toBe('Other chat');
  });


  it('sorts by the translated name when the "Prompt" header is clicked', async () => {
    const { user, router } = renderList();
    await rowOf('Chat assistant');
    // The header's accessible name carries its sort control too
    await user.click(within(grid()).getByRole('columnheader', { name: /^Prompt/ }));
    await waitFor(() => expect(shownSlugs()).toEqual([
      'report.action_plan', 'report.applicability', 'chat.assistant', 'corpus.check_citations',
      'report.inventory', 'report.summary', 'report.gap_analysis', 'corpus.extract_obligations',
    ]));
    // The order goes into the address (replaced): the editor's
    // way back finds the list sorted so
    expect(router.state.location.search).toBe('?sort=name.asc');
    expect(router.state.historyAction).toBe('REPLACE');
  });


  it('comes back sorted: the address\'s order is the list\'s, and a column it does not have is ignored', async () => {
    const first = renderList({ route: '/prompts?sort=name.desc' });
    await rowOf('Chat assistant');
    expect(shownSlugs()[0]).toBe('corpus.extract_obligations');
    first.unmount();
    renderList({ route: '/prompts?sort=secret.desc' });
    await rowOf('Chat assistant');
    expect(shownSlugs()).toEqual(FIXTURE_ORDER);
  });
});







// -----------------------------------------------------------
// Opening the editor
// -----------------------------------------------------------

describe('Prompts page — opening the editor', () => {

  it('the name link opens the prompt\'s editor, one history entry deep', async () => {
    const { user, router } = renderList();
    await user.click(await screen.findByRole('link', { name: 'Gap analysis' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent('/prompts/report.gap_analysis');
    // The link stops the row click: a second push would make
    // Back land on the editor again
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/prompts');
  });


  it('a click anywhere else on a row opens that prompt\'s editor too', async () => {
    const { user } = renderList();
    const row = await rowOf('Citation check');
    await user.click(cellOf(row, 'activeModel'));
    await waitFor(() => expect(probe()).toHaveTextContent('/prompts/corpus.check_citations'));
  });
});







// -----------------------------------------------------------
// Empty, loading, failed
// -----------------------------------------------------------

describe('Prompts page — empty, loading and failed', () => {

  it('says "No prompts" instead of an empty grid when the store is empty', async () => {
    given.json('get', '/api/prompts', { prompts: [] });
    renderList();
    expect(await screen.findByText('No prompts')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('holds the grid\'s loading skeleton while the answer is on its way, then shows the rows', async () => {
    given.slow('get', '/api/prompts', 300, { prompts: f.prompts });
    renderList();
    await settle(50);
    // The DataGrid's loading overlay is skeleton rows without a
    // role — its class is the only handle
    expect(document.querySelector('.MuiDataGrid-skeletonLoadingOverlay')).not.toBeNull();
    expect(dataRows()).toHaveLength(0);
    expect(screen.queryByText('No prompts')).toBeNull();
    expect(await screen.findByRole('link', { name: 'Executive summary' })).toBeInTheDocument();
    expect(document.querySelector('.MuiDataGrid-skeletonLoadingOverlay')).toBeNull();
  });


  // The DataGrid's own overlay is skeleton rows with no role,
  // no aria-busy and no text; the shared DataTable now marks
  // the grid busy and announces the load (FE-PROMPTS-1, fixed)
  it('tells assistive technology the list is loading — the grid is aria-busy or a status says so [FE-PROMPTS-1, FIXED in DataTable]', async () => {
    given.hang('get', '/api/prompts');
    renderList();
    await settle(50);
    const busy = grid().getAttribute('aria-busy') === 'true';
    const announced = screen.queryAllByRole('status').some((node) => /Loading/.test(node.textContent));
    expect(busy || announced).toBe(true);
  });


  it('a failed list shows the titled, translated error instead of the grid, and the retry brings the rows', async () => {
    given.sequence('get', '/api/prompts', [{ status: 500, body: apiError('SERVER_ERROR', 'Internal server error') }, { body: { prompts: f.prompts } }]);
    const { user } = renderList();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The prompts could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(alert).not.toHaveTextContent('Internal server error');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText('No prompts')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Chat assistant' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });


  it('an answer without a prompt list is an error with a retry — never "No prompts"', async () => {
    given.sequence('get', '/api/prompts', [{ body: { items: f.prompts } }, { body: { prompts: f.prompts } }]);
    const { user } = renderList();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The prompts could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByText('No prompts')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Chat assistant' })).toBeInTheDocument();
  });


  it('leaves out rows the grid cannot key — no slug, a blank one, a repeated one — and shows the rest', async () => {
    given.json('get', '/api/prompts', {
      prompts: [
        f.prompts[0],
        { ...f.prompts[1], slug: null },
        { ...f.prompts[2], slug: '' },
        { ...f.prompts[0], id: 'f0000000-0000-4000-8000-0000000000aa', name: 'Duplicate' },
        { name: 'Nothing else' },
        null,
        f.prompts[7],
      ],
    });
    renderList();
    await rowOf('Chat assistant');
    expect(shownSlugs()).toEqual(['chat.assistant', 'report.summary']);
    expect(screen.queryByText('Duplicate')).toBeNull();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('Prompts page — Lithuanian', () => {

  it('speaks Lithuanian: title, columns, names, purposes, the waiting default and the stamp format', async () => {
    renderList({ locale: 'lt' });
    expect(screen.getByRole('heading', { level: 1, name: 'DI instrukcijos' })).toBeInTheDocument();
    const row = await rowOf('Pokalbių asistentas');
    expect(within(screen.getByRole('grid', { name: 'DI instrukcijos' })).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Instrukcija', 'Identifikatorius', 'Paskirtis', 'Aktyvi versija', 'Modelis', 'Atnaujinta']);
    expect(cellOf(row, 'kind')).toHaveTextContent('Pokalbis');
    expect(within(row).getByText('Laukia nauja numatytoji v3')).toBeInTheDocument();
    expect(cellOf(row, 'updatedAt')).toHaveTextContent('2026-09-15 09:30');
    expect(cellOf(await rowOf('Vadovybės santrauka'), 'kind')).toHaveTextContent('Analizės etapas');
    expect(cellOf(await rowOf('Nuorodų tikrinimas'), 'kind')).toHaveTextContent('Teisės aktų bazė');
  });


  it('a language switch in the top bar re-labels the rows without reloading them', async () => {
    const calls = given.capture('get', '/api/prompts', { prompts: f.prompts });
    const { user } = renderList();
    await rowOf('Chat assistant');
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    expect(await screen.findByRole('link', { name: 'Pokalbių asistentas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'DI instrukcijos' })).toBeInTheDocument();
    expect(screen.getByText('Laukia nauja numatytoji v3')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// Both roles, through the real route table
// -----------------------------------------------------------

describe('Prompts route — both roles', () => {

  it('the administrator reaches the list at /prompts, titled in the tab', async () => {
    renderApp({ route: '/prompts' });
    expect(await screen.findByRole('link', { name: 'Chat assistant' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('AI prompts · Compliance assistant'));
  });


  it('a plain user gets the "access restricted" page and the list is never requested', async () => {
    given.json('get', '/api/auth/me', f.plainUser);
    const calls = given.capture('get', '/api/prompts', { prompts: f.prompts });
    renderApp({ route: '/prompts' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Access restricted' })).toBeInTheDocument();
    expect(screen.getByText('This page is for administrators only.')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'AI prompts' })).toBeNull();
    await settle(50);
    expect(calls).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the list's one endpoint.
// The loading state is the grid's skeleton overlay (no role;
// its class is the handle).
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/prompts',
  fixture: { prompts: f.prompts },
  render: () => renderList(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'AI prompts' }),
  loaded: async () => { await screen.findByRole('link', { name: 'Citation check' }); },
  loading: () => document.querySelector('.MuiDataGrid-skeletonLoadingOverlay'),
});
