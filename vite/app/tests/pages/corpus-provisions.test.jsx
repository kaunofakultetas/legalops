// -----------------------------------------------------------
//  [*] Tests — CorpusDocument: the structure tab (provision
//      tree + unit viewer)
//
//  The act page's structure tab end to end against the
//  backend double:
//
//    ProvisionTree — GET /api/corpus/documents/:id/units in
//                    pages of 200 ("show more" counts and
//                    appends), the skeleton by default (the
//                    type list), the filter (every provision,
//                    articles, recitals, annexes), the text
//                    search debounced to one request, the
//                    rows indented by depth, collapse / expand
//                    (aria-expanded, named toggles), picking a
//                    unit (aria-current, ?unit= replaced), the
//                    empty, failed and loading states, an act
//                    never ingested; coming back (the filter
//                    and the search in the address, the
//                    collapsed units kept per act and filter,
//                    the tree's scroller keeping its place)
//    UnitViewer    — GET /api/corpus/units/:id: the act and
//                    version, the path and heading, the full
//                    text, the older-version note (a status),
//                    the official text (the EUR-Lex article
//                    anchor of citationUrl, the act's own page
//                    for a Lithuanian act, the source page
//                    when citationUrl is absent), copying the
//                    citation, the failed and loading states,
//                    the deep link, the phone drawer and its
//                    close button
//
//  both languages, and the backend contract matrices for the
//  two endpoints.
// -----------------------------------------------------------

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import { mediaQueryMatches } from '../support/setup';
import * as f from '../support/backend/fixtures';
import CorpusDocument from '@/pages/Corpus/CorpusDocument';


// The structure tab's layout query (theme.breakpoints.up('md')):
// matched → the viewer beside the tree, else a drawer.
// setup.js keeps a matched query for the rest of the file, so
// it is undone after every test
const WIDE = '(min-width:900px)';

afterEach(() => {
  mediaQueryMatches(WIDE, false);
});

const MICA = f.ID.mica;
const EUR_LEX_MICA = 'https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32023R1114';

// The tree's default ?type= (the act's skeleton)
const SKELETON = 'part,title,chapter,section,subsection,article,clause,annex';

// MiCA version 2's skeleton as the tree shows it, top to bottom
const MICA_TREE = [
  'KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS',
  'Kriptoturto paslaugų teikėjų veiklos leidimas',
  '59 str. Kriptoturto paslaugų teikėjų veiklos leidimas',
  'Visiems kriptoturto paslaugų teikėjams taikomi įpareigojimai',
  '70 str. Klientų kriptoturto ir lėšų apsauga',
  'Su konkrečiomis kriptoturto paslaugomis susiję įpareigojimai',
  '75 str. Kriptoturto saugojimas ir administravimas klientų vardu',
];







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderAct: the act page on its route (the structure tab is
// the default). record: every request to an endpoint while
// the default handler still answers. tree: the provision
// list. shownUnits: the units' text, top to bottom. unitButton
// / toggle: a unit's button and its collapse toggle. indent:
// a row's left padding in px. viewer: the unit viewer's
// article. choose: an MUI select option.
// -----------------------------------------------------------

function renderAct({ id = MICA, session = authData, query = '', locale, wide = false } = {}) {
  if (wide) mediaQueryMatches(WIDE);
  return renderPage(<CorpusDocument authData={session} />, { route: `/corpus/${id}${query}`, path: '/corpus/:documentId', locale });
}

function record(method, path) {
  const calls = [];
  server.use(http[method](url(path), ({ request }) => {
    calls.push({ url: request.url, query: Object.fromEntries(new URL(request.url).searchParams) });
  }));
  return calls;
}

const tree = (name = 'The act\'s provisions') => screen.findByRole('list', { name });

const shownUnits = () => within(screen.getByRole('list', { name: 'The act\'s provisions' })).getAllByRole('listitem')
  .map((item) => within(item).getAllByRole('button').at(-1).textContent);

const unitButton = (name) => screen.findByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });

const toggle = (verb, heading) => screen.getByRole('button', { name: `${verb}: ${heading}` });

const indent = (button) => Number.parseInt(button.closest('li').style.paddingLeft, 10);

const viewer = (name) => screen.findByRole('article', { name });

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}







// -----------------------------------------------------------
// ProvisionTree — the skeleton and its rows
// -----------------------------------------------------------

describe('ProvisionTree — the skeleton and its rows', () => {

  it('lists the act\'s skeleton by default — titles, chapters and articles of the current version — in one request', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    renderAct();
    await tree();
    expect(shownUnits()).toEqual(MICA_TREE);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(url(`/api/corpus/documents/${MICA}/units?offset=0&limit=200&type=${encodeURIComponent(SKELETON)}`));
    expect(screen.getByRole('combobox', { name: 'Show' })).toHaveTextContent('Structure (chapters, articles, clauses)');
    expect(screen.queryByRole('button', { name: /^Show more/ })).toBeNull();
  });


  it('indents each unit by its depth; a container shows its heading once, an article its path and heading', async () => {
    renderAct();
    await tree();
    expect(indent(await unitButton('KRIPTOTURTO PASLAUGŲ'))).toBe(0);
    expect(indent(await unitButton('Kriptoturto paslaugų teikėjų veiklos leidimas'))).toBe(14);
    const article = await unitButton('59 str.');
    expect(indent(article)).toBe(28);
    expect(article).toHaveTextContent('59 str. Kriptoturto paslaugų teikėjų veiklos leidimas');
    // The chapter's path IS its heading — shown once
    expect(await unitButton('Kriptoturto paslaugų teikėjų veiklos leidimas')).toHaveTextContent(/^Kriptoturto paslaugų teikėjų veiklos leidimas$/);
  });


  it('gives every unit with deeper units after it a named collapse toggle, and leaves the others without one', async () => {
    renderAct();
    await tree();
    for (const heading of ['KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS', 'Kriptoturto paslaugų teikėjų veiklos leidimas', 'Visiems kriptoturto paslaugų teikėjams taikomi įpareigojimai']) {
      expect(toggle('Collapse', heading)).toHaveAttribute('aria-expanded', 'true');
    }
    expect(screen.queryByRole('button', { name: /^Collapse: 59 str\./ })).toBeNull();
  });


  it('collapsing a unit hides everything deeper under it; expanding brings back what was not collapsed itself', async () => {
    const { user } = renderAct();
    await tree();
    await user.click(toggle('Collapse', 'Kriptoturto paslaugų teikėjų veiklos leidimas'));
    expect(shownUnits()).toEqual(MICA_TREE.filter((unit) => !unit.startsWith('59 str.')));
    expect(toggle('Expand', 'Kriptoturto paslaugų teikėjų veiklos leidimas')).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle('Collapse', 'KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS'));
    expect(shownUnits()).toEqual([MICA_TREE[0]]);

    await user.click(toggle('Expand', 'KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS'));
    // The chapter collapsed before stays collapsed
    expect(shownUnits()).toEqual(MICA_TREE.filter((unit) => !unit.startsWith('59 str.')));
    await user.click(toggle('Expand', 'Kriptoturto paslaugų teikėjų veiklos leidimas'));
    expect(shownUnits()).toEqual(MICA_TREE);
  });


  it('an act never ingested shows the note instead of a tree, and asks for no provisions', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    renderAct({ id: f.ID.lbRules });
    expect(await screen.findByRole('status')).toHaveTextContent('The act is not ingested yet — its structure appears after ingestion.');
    await settle(50);
    expect(screen.queryByRole('list', { name: 'The act\'s provisions' })).toBeNull();
    expect(calls).toHaveLength(0);
  });


  it('a standard\'s clauses: a heading beside its number, a numbered paragraph previewed without its number twice', async () => {
    const clause = (id, number, depth, heading, text) => ({
      id, versionId: 'v1', parentId: null, ordinal: Number(id.slice(1)), depth, unitType: 'clause', number, path: number, heading, text,
    });
    given.json('get', '/api/corpus/documents/:documentId/units', { total: 3, offset: 0, limit: 200, units: [
      { ...clause('u1', '8', 0, 'Rengimas', '8 Rengimas'), path: '8 skyrius' },
      clause('u2', '8.4', 1, 'Viešoji apklausa', '8.4 Viešoji apklausa'),
      clause('u3', '8.4.3', 2, '', '8.4.3 Gavus komentarų, projektas svarstomas iš naujo.'),
    ] });
    renderAct();
    await tree();
    expect(shownUnits()).toEqual(['8 skyrius Rengimas', '8.4 Viešoji apklausa', '8.4.3 Gavus komentarų, projektas svarstomas iš naujo.']);
  });


  it('says there are no provisions when the version has none of the kind asked for', async () => {
    given.json('get', '/api/corpus/documents/:documentId/units', { units: [], total: 0, offset: 0, limit: 200 });
    renderAct();
    expect(await screen.findByText('No provisions')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'The act\'s provisions' })).toBeNull();
  });


  it('spins while the provisions load', async () => {
    given.hang('get', '/api/corpus/documents/:documentId/units');
    renderAct();
    await screen.findByRole('heading', { level: 1, name: 'MiCA' });
    await settle(50);
    expect(within(screen.getByRole('tabpanel')).getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('No provisions')).toBeNull();
  });


  it('a failed load shows the translated error with a retry that loads the tree', async () => {
    given.sequence('get', '/api/corpus/documents/:documentId/units', [{ status: 500, body: { error: 'x', code: 'SERVER_ERROR' } }, { body: f.units(MICA, { type: SKELETON }) }]);
    const { user } = renderAct();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await tree();
    expect(shownUnits()).toEqual(MICA_TREE);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a plain user browses the same tree', async () => {
    renderAct({ session: userAuthData });
    await tree();
    expect(shownUnits()).toEqual(MICA_TREE);
  });
});







// -----------------------------------------------------------
// ProvisionTree — the filter, the search and the paging
// -----------------------------------------------------------

describe('ProvisionTree — the filter, the search and the paging', () => {

  it('offers the skeleton, every provision, articles, recitals and annexes', async () => {
    const { user } = renderAct();
    await tree();
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Structure (chapters, articles, clauses)', 'All provisions', 'Articles only', 'Recitals', 'Annexes',
    ]);
  });


  it('"All provisions" drops the type list: recitals and paragraphs come in, a heading-less one previewed by its text', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    const { user } = renderAct();
    await tree();
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'All provisions');
    await waitFor(() => expect(shownUnits()).toHaveLength(12));
    expect(calls.at(-1).query).toEqual({ offset: '0', limit: '200' });
    const recital = await unitButton('76 konstatuojamoji dalis');
    expect(recital).toHaveTextContent(`76 konstatuojamoji dalis ${f.unit(f.ID.micaRecital76).text.slice(0, 90)}`);
    const paragraph = await unitButton('59 str. 1 d.');
    expect(paragraph).toHaveTextContent(`59 str. 1 d. ${f.unit(f.ID.micaArt59Par1).text.slice(0, 90)}`);
    expect(indent(paragraph)).toBe(42);
  });


  it('"Articles only" asks for the articles, shown flush left', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    const { user } = renderAct();
    await tree();
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'Articles only');
    await waitFor(() => expect(shownUnits()).toEqual([MICA_TREE[2], MICA_TREE[4], MICA_TREE[6]]));
    expect(calls.at(-1).query).toEqual({ offset: '0', limit: '200', type: 'article' });
    expect(indent(await unitButton('59 str.'))).toBe(0);
    expect(screen.queryByRole('button', { name: /^Collapse/ })).toBeNull();
  });


  it('"Recitals" and "Annexes" ask for those; MiCA has no annex in the corpus', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    const { user } = renderAct();
    await tree();
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'Recitals');
    await waitFor(() => expect(shownUnits()).toHaveLength(1));
    expect(calls.at(-1).query.type).toBe('recital');
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'Annexes');
    expect(await screen.findByText('No provisions')).toBeInTheDocument();
    expect(calls.at(-1).query.type).toBe('annex');
  });


  it('an annex shows its path and heading', async () => {
    const { user } = renderAct({ id: f.ID.aiAct });
    await tree();
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'Annexes');
    await waitFor(() => expect(shownUnits()).toEqual(['III priedas Didelės rizikos DI sistemos, nurodytos 6 straipsnio 2 dalyje']));
  });


  it('a new filter starts with nothing collapsed', async () => {
    const { user } = renderAct();
    await tree();
    await user.click(toggle('Collapse', 'KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS'));
    expect(shownUnits()).toHaveLength(1);
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'All provisions');
    await waitFor(() => expect(shownUnits()).toHaveLength(12));
  });


  it('searches the text once the typing settles — one request for the trimmed term, the matches indented from the shallowest', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    const { user } = renderAct();
    await tree();
    await user.type(screen.getByRole('textbox', { name: 'Search the text' }), '  saugojim ');
    await waitFor(() => expect(shownUnits()).toEqual([MICA_TREE[5], MICA_TREE[6]]));
    expect(calls.map((call) => call.query.q)).toEqual([undefined, 'saugojim']);
    expect(calls.at(-1).query.type).toBe(SKELETON);
    expect(indent(await unitButton('Su konkrečiomis'))).toBe(0);
    expect(indent(await unitButton('75 str.'))).toBe(14);
  });


  it('a search that matches nothing says so', async () => {
    const { user } = renderAct();
    await tree();
    await user.type(screen.getByRole('textbox', { name: 'Search the text' }), 'kosmosas');
    expect(await screen.findByText('No provisions')).toBeInTheDocument();
  });


  it('pages through a long act 200 at a time: the button counts what is shown, a click appends the next page, and it goes once all is shown', async () => {
    // An act of 250 articles, served the way the view pages
    const articles = Array.from({ length: 250 }, (_, i) => ({
      id: `d2000000-0000-4000-8000-${String(900000 + i).padStart(12, '0')}`, versionId: f.ID.micaV2, parentId: null, ordinal: i + 1,
      depth: 0, unitType: 'article', number: String(i + 1), path: `${i + 1} str.`, heading: `Straipsnis ${i + 1}`, text: `Straipsnio ${i + 1} tekstas.`,
    }));
    const calls = [];
    server.use(http.get(url('/api/corpus/documents/:documentId/units'), ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      calls.push(query);
      const offset = Number(query.offset);
      const limit = Number(query.limit);
      return HttpResponse.json({ units: articles.slice(offset, offset + limit), total: articles.length, offset, limit });
    }));
    const { user } = renderAct();
    await tree();
    expect(shownUnits()).toHaveLength(200);
    expect(calls).toEqual([{ offset: '0', limit: '200', type: SKELETON }]);
    await user.click(screen.getByRole('button', { name: 'Show more (200 of 250)' }));
    await waitFor(() => expect(shownUnits()).toHaveLength(250));
    expect(calls.at(-1)).toEqual({ offset: '200', limit: '200', type: SKELETON });
    expect(shownUnits().at(-1)).toBe('250 str. Straipsnis 250');
    expect(screen.queryByRole('button', { name: /^Show more/ })).toBeNull();
  }, 30000);
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The tree's filter and search live in the address
// (?structure.type=, ?structure.q=), the collapsed units are
// kept for the act, and beside the viewer the tree's own
// scroller keeps its place. Each test leaves the act
// (unmount) and comes back.
// -----------------------------------------------------------

describe('ProvisionTree — coming back', () => {

  it('the filter and the search come from the address, and write it (replacing)', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    const { user, router } = renderAct({ query: '?structure.type=article&structure.q=kripto' });
    await waitFor(() => expect(calls.at(-1)?.query).toEqual({ offset: '0', limit: '200', type: 'article', q: 'kripto' }));
    expect(screen.getByRole('combobox', { name: 'Show' })).toHaveTextContent('Articles only');
    expect(screen.getByRole('textbox', { name: 'Search the text' })).toHaveValue('kripto');

    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'All provisions');
    await waitFor(() => expect(router.state.location.search).toBe('?structure.type=all&structure.q=kripto'));
    expect(router.state.historyAction).toBe('REPLACE');
    await choose(user, screen.getByRole('combobox', { name: 'Show' }), 'Structure (chapters, articles, clauses)');
    await waitFor(() => expect(router.state.location.search).toBe('?structure.q=kripto'));
  });


  it('a filter the tree does not offer reads as the structure', async () => {
    const calls = record('get', '/api/corpus/documents/:documentId/units');
    renderAct({ query: '?structure.type=everything' });
    await tree();
    expect(calls[0].query).toEqual({ offset: '0', limit: '200', type: SKELETON });
  });


  it('the units collapsed come back collapsed — for the act and the filter they were collapsed under', async () => {
    const first = renderAct();
    await tree();
    await first.user.click(toggle('Collapse', 'Kriptoturto paslaugų teikėjų veiklos leidimas'));
    first.unmount();

    const second = renderAct();
    await tree();
    await waitFor(() => expect(shownUnits()).toEqual(MICA_TREE.filter((unit) => !unit.startsWith('59 str.'))));
    second.unmount();

    renderAct({ query: '?structure.type=all' });
    await tree();
    await waitFor(() => expect(shownUnits()).toHaveLength(12));
  });


  it('beside the viewer, the tree\'s scroller opens where it was left', async () => {
    const treeBox = (element) => element.classList?.contains('overflow-auto') && element.querySelector('[aria-label="The act\'s provisions"]');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return treeBox(this) ? 4000 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return treeBox(this) ? 500 : 0; } });
    try {
      const first = renderAct({ wide: true });
      const list = await tree();
      const box = list.closest('.overflow-auto');
      box.scrollTop = 900;
      fireEvent.scroll(box);
      first.unmount();

      renderAct({ wide: true });
      const again = (await tree()).closest('.overflow-auto');
      await waitFor(() => expect(again.scrollTop).toBe(900));
    } finally {
      delete HTMLElement.prototype.scrollHeight;
      delete HTMLElement.prototype.clientHeight;
    }
  });


  it('in Lithuanian too', async () => {
    renderAct({ query: '?structure.type=article', locale: 'lt' });
    await tree('Akto nuostatos');
    expect(screen.getByRole('combobox', { name: 'Rodyti' })).toHaveTextContent('Tik straipsniai');
  });
});







// -----------------------------------------------------------
// UnitViewer — beside the tree (wide screens)
// -----------------------------------------------------------

describe('UnitViewer — beside the tree', () => {

  it('asks the user to pick a provision until one is chosen', async () => {
    renderAct({ wide: true });
    await tree();
    expect(screen.getByText('Pick a provision to read its text.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
  });


  it('picking a provision marks it current, replaces ?unit= in the address and shows it in full', async () => {
    const calls = record('get', '/api/corpus/units/:unitId');
    const { user, router } = renderAct({ wide: true });
    await tree();
    const button = await unitButton('59 str.');
    await user.click(button);
    expect(button).toHaveAttribute('aria-current', 'true');
    expect(router.state.location.search).toBe(`?unit=${f.ID.micaArt59}`);
    expect(router.state.historyAction).toBe('REPLACE');

    const article = await viewer('MiCA 59 str.');
    expect(calls[0].url).toBe(url(`/api/corpus/units/${f.ID.micaArt59}`));
    expect(within(article).getByText('MiCA · Version v2')).toBeInTheDocument();
    expect(within(article).getByRole('heading', { level: 2 })).toHaveTextContent('59 str. — Kriptoturto paslaugų teikėjų veiklos leidimas');
    // The article's whole text, both paragraphs
    expect(article).toHaveTextContent(f.unit(f.ID.micaArt59).text.replace('\n', ' '));
    expect(within(article).queryByRole('status')).toBeNull();
    expect(within(article).getByRole('button', { name: 'Copy the citation' })).toBeInTheDocument();
    expect(within(article).queryByRole('button', { name: 'Close' })).toBeNull();
  });


  it('links the official text to the EUR-Lex article anchor the backend gives (citationUrl), in a new tab', async () => {
    renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    const article = await viewer('MiCA 59 str.');
    const official = within(article).getByRole('link', { name: 'Official text' });
    expect(official).toHaveAttribute('href', `${EUR_LEX_MICA}#art_59`);
    expect(official).toHaveAttribute('target', '_blank');
    expect(official).toHaveAttribute('rel', 'noopener noreferrer');
  });


  it('a paragraph links to its article\'s anchor', async () => {
    renderAct({ wide: true, query: `?unit=${f.ID.micaArt70Par1}` });
    const article = await viewer('MiCA 70 str. 1 d.');
    expect(within(article).getByRole('heading', { level: 2 }).textContent).toBe('70 str. 1 d.');
    expect(within(article).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', `${EUR_LEX_MICA}#art_70`);
  });


  it('a Lithuanian act\'s provision links to its e-TAR page', async () => {
    renderAct({ id: f.ID.aml, wide: true, query: `?unit=${f.ID.amlArt22Par3}` });
    const article = await viewer('PPTFPĮ 22 str. 3 d.');
    expect(within(article).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90');
  });


  it('without a citationUrl (an older backend) it falls back to the act\'s source page, and without either shows no link', async () => {
    const { citationUrl, ...bare } = f.unit(f.ID.micaArt59);
    expect(citationUrl).toBe(`${EUR_LEX_MICA}#art_59`);
    given.sequence('get', '/api/corpus/units/:unitId', [{ body: bare }, { body: { ...f.unit(f.ID.micaArt70), citationUrl: undefined, sourceUrl: '' } }]);
    const { user } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    const article = await viewer('MiCA 59 str.');
    expect(within(article).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', EUR_LEX_MICA);
    await user.click(await unitButton('70 str.'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Official text' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Copy the citation' })).toBeInTheDocument();
  });


  it('a provision of an earlier version says so as a status, not an alarm', async () => {
    renderAct({ wide: true, query: `?unit=${f.ID.micaV1Art59Par1}` });
    const article = await viewer('MiCA 59 str. 1 d.');
    expect(within(article).getByText('MiCA · Version v1')).toBeInTheDocument();
    expect(within(article).getByRole('status')).toHaveTextContent('This provision is from an earlier version (v1).');
    expect(within(article).queryByRole('alert')).toBeNull();
    expect(within(article).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', `${EUR_LEX_MICA}#art_59`);
  });


  it('a deep link (?unit=) opens the provision at once and marks it in the tree', async () => {
    renderAct({ wide: true, query: `?unit=${f.ID.micaArt70}` });
    expect(await viewer('MiCA 70 str.')).toBeInTheDocument();
    await tree();
    expect(await unitButton('70 str.')).toHaveAttribute('aria-current', 'true');
    expect(await unitButton('59 str.')).not.toHaveAttribute('aria-current');
  });


  it('picking another provision replaces the one in the address and in the viewer', async () => {
    const { user, router } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt70}` });
    await viewer('MiCA 70 str.');
    await user.click(await unitButton('75 str.'));
    expect(await viewer('MiCA 75 str.')).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?unit=${f.ID.micaArt75}`);
    expect(await unitButton('70 str.')).not.toHaveAttribute('aria-current');
  });


  // user-event's clipboard stub cannot read back under the
  // suite's Node Blob (jsdom's FileReader refuses it), so the
  // tests read what was written
  it('copies "act path — heading" as the citation and says so', async () => {
    const { user } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    const article = await viewer('MiCA 59 str.');
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(article).getByRole('button', { name: 'Copy the citation' }));
    expect(await screen.findByText('Citation copied')).toBeInTheDocument();
    expect(write).toHaveBeenCalledWith('MiCA 59 str. — Kriptoturto paslaugų teikėjų veiklos leidimas');
  });


  it('a heading-less provision is copied as "act path"', async () => {
    const { user } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt59Par1}` });
    const article = await viewer('MiCA 59 str. 1 d.');
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(article).getByRole('button', { name: 'Copy the citation' }));
    await screen.findByText('Citation copied');
    expect(write).toHaveBeenCalledWith('MiCA 59 str. 1 d.');
  });


  it('an act without a short title is named and cited by its official title', async () => {
    given.json('get', '/api/corpus/units/:unitId', { ...f.unit(f.ID.micaArt59), shortTitle: '' });
    const { user } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    const article = await viewer(`${f.unit(f.ID.micaArt59).documentTitle} 59 str.`);
    expect(within(article).getByText(`${f.unit(f.ID.micaArt59).documentTitle} · Version v2`)).toBeInTheDocument();
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(article).getByRole('button', { name: 'Copy the citation' }));
    await screen.findByText('Citation copied');
    expect(write).toHaveBeenCalledWith(`${f.unit(f.ID.micaArt59).documentTitle} 59 str. — Kriptoturto paslaugų teikėjų veiklos leidimas`);
  });


  it('a blocked clipboard fails quietly: no toast, no crash', async () => {
    const { user } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    const article = await viewer('MiCA 59 str.');
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await user.click(within(article).getByRole('button', { name: 'Copy the citation' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await settle(50);
    expect(screen.queryByText('Citation copied')).toBeNull();
    expect(screen.getByRole('article', { name: 'MiCA 59 str.' })).toBeInTheDocument();
  });


  it('spins, named, while the provision loads', async () => {
    given.hang('get', '/api/corpus/units/:unitId');
    renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    expect(await screen.findByRole('progressbar', { name: 'Provision' })).toBeInTheDocument();
  });


  it('a provision that fails to load shows the translated error with a retry', async () => {
    given.sequence('get', '/api/corpus/units/:unitId', [{ status: 404, body: { error: 'Provision not found', code: 'NOT_FOUND' } }, { body: f.unit(f.ID.micaArt59) }]);
    const { user } = renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await viewer('MiCA 59 str.')).toBeInTheDocument();
  });


  it('a crafted ?unit= stays one path segment of the provision request', async () => {
    const calls = [];
    server.use(http.get(url('/api/*'), ({ request }) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith('/api/corpus/units/')) calls.push(pathname);
    }));
    renderAct({ wide: true, query: `?unit=${encodeURIComponent('../../users')}` });
    await screen.findByRole('alert');
    expect(calls).toEqual(['/api/corpus/units/..%2F..%2Fusers']);
  });
});







// -----------------------------------------------------------
// UnitViewer — in a drawer (phones)
// -----------------------------------------------------------

describe('UnitViewer — in a drawer on a phone', () => {

  it('opens the picked provision in a drawer with a close button that clears ?unit=', async () => {
    const { user, router } = renderAct();
    await tree();
    // No viewer until a unit is picked
    expect(screen.queryByText('Pick a provision to read its text.')).toBeNull();
    await user.click(await unitButton('59 str.'));
    const article = await viewer('MiCA 59 str.');
    expect(within(article).getByRole('heading', { level: 2 })).toHaveTextContent('59 str. — Kriptoturto paslaugų teikėjų veiklos leidimas');
    await user.click(within(article).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
    expect(router.state.location.search).toBe('');
  });


  it('Escape closes the drawer too', async () => {
    const { user, router } = renderAct({ query: `?unit=${f.ID.micaArt75}` });
    await viewer('MiCA 75 str.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
    expect(router.state.location.search).toBe('');
  });
});







// -----------------------------------------------------------
// In Lithuanian
// -----------------------------------------------------------

describe('The structure tab — in Lithuanian', () => {

  it('speaks Lithuanian: the filter and its options, the search, the toggles, the paging and the viewer', async () => {
    const all = f.units(MICA, { type: SKELETON }).units;
    given.sequence('get', '/api/corpus/documents/:documentId/units', [{ body: { units: all.slice(0, 5), total: 7, offset: 0, limit: 5 } }]);
    const { user } = renderAct({ locale: 'lt', wide: true });
    await tree('Akto nuostatos');
    expect(screen.getByRole('textbox', { name: 'Ieškoti tekste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suskleisti: KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rodyti daugiau (5 iš 7)' })).toBeInTheDocument();
    expect(screen.getByText('Pasirinkite nuostatą, kad pamatytumėte jos tekstą.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suskleisti: KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS' }));
    expect(screen.getByRole('button', { name: 'Išskleisti: KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Rodyti' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Struktūra (skyriai, straipsniai, punktai)', 'Visos nuostatos', 'Tik straipsniai', 'Konstatuojamosios dalys', 'Priedai',
    ]);
  });


  it('the viewer in Lithuanian: the version, the older-version note, copy and the official text', async () => {
    const { user } = renderAct({ locale: 'lt', wide: true, query: `?unit=${f.ID.micaV1Art59Par1}` });
    const article = await viewer('MiCA 59 str. 1 d.');
    expect(within(article).getByText('MiCA · Redakcija v1')).toBeInTheDocument();
    expect(within(article).getByRole('status')).toHaveTextContent('Ši nuostata — iš ankstesnės redakcijos (v1).');
    expect(within(article).getByRole('link', { name: 'Oficialus tekstas' })).toBeInTheDocument();
    await user.click(within(article).getByRole('button', { name: 'Kopijuoti citatą' }));
    expect(await screen.findByText('Citata nukopijuota')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the tree's endpoint and,
// with a unit deep-linked on a wide screen, the viewer's.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/corpus/documents/:documentId/units',
  fixture: f.units(MICA, { type: SKELETON }),
  render: () => renderAct(),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'MiCA' }),
  loaded: async () => { await screen.findByRole('button', { name: /^59 str\./ }); },
  loading: () => within(screen.getByRole('tabpanel')).getByRole('progressbar'),
});


describeEndpointContract({
  path: '/api/corpus/units/:unitId',
  fixture: f.unit(f.ID.micaArt59),
  render: () => renderAct({ wide: true, query: `?unit=${f.ID.micaArt59}` }),
  chrome: () => screen.getByRole('heading', { level: 1, name: 'MiCA' }),
  loaded: async () => { await screen.findByRole('heading', { level: 2, name: '59 str. — Kriptoturto paslaugų teikėjų veiklos leidimas' }); },
  loading: () => screen.getByRole('progressbar', { name: 'Provision' }),
});
