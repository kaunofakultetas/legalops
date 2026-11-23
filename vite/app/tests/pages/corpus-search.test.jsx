// -----------------------------------------------------------
//  [*] Tests — Corpus page: the search and citation tabs
//
//  The two reading tools of /corpus, opened by ?tab= like a
//  user opens them, end to end against the backend double:
//
//    CorpusSearch    — the form (question, result count,
//                      jurisdiction, acts), the POST
//                      /api/corpus/search body {query, k,
//                      documents, jurisdiction} with only the
//                      filters given, submit by button and by
//                      Enter (Shift+Enter is a new line), the
//                      hits (act · path — heading, the score,
//                      the passage with its named expand
//                      toggle, the link into the viewer and the
//                      official text: the EUR-Lex article
//                      anchor or the act's own page), nothing
//                      found, the busy state, the refusals
//    CitationChecker — the row editor (add up to the backend's
//                      50, remove, the act suggestions), the
//                      checks made before sending (an alert,
//                      each empty field invalid and described
//                      by it), the POST
//                      /api/corpus/check-citations body with
//                      only the parts given, the verdict per
//                      row (found / not found / act not in the
//                      corpus × heading match / differs /
//                      unclear, the model's note), the cost
//                      note (a status, not an alarm), the
//                      refusals
//
//  and, for both, coming back: what was typed and the last
//  answer kept for the tab (no second request), a kept value
//  of the wrong shape ignored — both in English and in
//  Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { renderPage, authData, userAuthData } from '../support/render';
import { given, server, url, readBody } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import Corpus from '@/pages/Corpus/Corpus';


const QUESTION = 'Kas gali teikti kriptoturto saugojimo paslaugas?';

const EUR_LEX_MICA = 'https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32023R1114';

// The verdicts the double computes for the request that meets
// every one of them (fixtures CITATION_CHECKS)
const VERDICTS = f.checkCitations(f.CITATION_CHECKS);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderTab: /corpus on one tab, as the address opens it.
// record: every request to an endpoint (query and body)
// while the default handler still answers. results: the
// result list items under the results heading. choose: an
// MUI select option. rowFields: the fields of citation row i.
// fillRow: types a citation into row i.
// -----------------------------------------------------------

function renderTab(tab, { session = authData, locale } = {}) {
  return renderPage(<Corpus authData={session} />, { route: `/corpus?tab=${tab}`, path: '/corpus', locale });
}

function record(method, path) {
  const calls = [];
  server.use(http[method](url(path), async ({ request }) => {
    calls.push({ url: request.url, body: await readBody(request.clone()) });
  }));
  return calls;
}

async function results(heading) {
  const title = await screen.findByRole('heading', { level: 2, name: heading });
  return within(title.closest('section')).queryAllByRole('listitem');
}

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

function rowFields(i) {
  return {
    act: screen.getAllByRole('combobox', { name: /^Legal act/ })[i],
    article: screen.getAllByRole('textbox', { name: /^Article/ })[i],
    paragraph: screen.getAllByRole('textbox', { name: 'Paragraph' })[i],
    point: screen.getAllByRole('textbox', { name: 'Point' })[i],
    topic: screen.getAllByRole('textbox', { name: 'Stated topic (optional)' })[i],
    remove: screen.getAllByRole('button', { name: 'Remove the row' })[i],
  };
}

async function fillRow(user, i, { act, article, paragraph, point, claimedHeading }) {
  const row = rowFields(i);
  if (act) await user.type(row.act, act);
  if (article) await user.type(row.article, article);
  if (paragraph) await user.type(row.paragraph, paragraph);
  if (point) await user.type(row.point, point);
  if (claimedHeading) await user.type(row.topic, claimedHeading);
}







// -----------------------------------------------------------
// CorpusSearch — the form and the request
// -----------------------------------------------------------

describe('CorpusSearch — the form and the request', () => {

  it('offers the question, the result count (8), the jurisdiction (All), the acts, and says what a search costs', async () => {
    const { user } = renderTab('search');
    const form = screen.getByRole('search');
    expect(within(form).getByRole('textbox', { name: 'Question or phrase' })).toHaveValue('');
    expect(within(form).getByText('Hybrid search over the acts\' text: semantic and keyword.')).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'Number of results' })).toHaveTextContent('8');
    await user.click(within(form).getByRole('combobox', { name: 'Number of results' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['5', '8', '15', '30']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    // "All" is the empty value: MUI shows the bare label for it
    await user.click(within(form).getByRole('combobox', { name: 'Jurisdiction' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['All', 'EU', 'Lithuania', 'International']);
    expect(screen.getByRole('option', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(within(form).getByRole('combobox', { name: 'Only in these legal acts' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Search' })).toBeEnabled();
    expect(within(form).getByText('The search uses the embedding model (a small cost).')).toBeInTheDocument();
    // Nothing is searched before the user asks (each search embeds)
    await settle(50);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });


  it('POSTs the trimmed question with the default result count and no filters', async () => {
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `  ${QUESTION}  `);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ query: QUESTION, k: 8 });
    expect(await results('Results: 3')).toHaveLength(3);
  });


  it('sends the result count, the jurisdiction and the picked acts (their ids) — and gets only their hits', async () => {
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), QUESTION);
    await choose(user, screen.getByRole('combobox', { name: 'Number of results' }), '15');
    await choose(user, screen.getByRole('combobox', { name: 'Jurisdiction' }), 'Lithuania');
    await choose(user, screen.getByRole('combobox', { name: 'Only in these legal acts' }), 'PPTFPĮ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ query: QUESTION, k: 15, jurisdiction: 'LT', documents: [f.ID.aml] });
    const items = await results('Results: 1');
    expect(within(items[0]).getByRole('heading', { level: 3 })).toHaveTextContent('PPTFPĮ · 22 str. — Vidaus kontrolė');
  });


  it('the acts picker offers the catalogue by short title, and several acts can be picked', async () => {
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search');
    const acts = screen.getByRole('combobox', { name: 'Only in these legal acts' });
    await user.click(acts);
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['DI aktas', 'DORA', 'MiCA', 'TFR (2015)', 'LB KTPT taisyklės', 'PPTFPĮ', 'VKĮ']);
    await user.click(screen.getByRole('option', { name: 'MiCA' }));
    await choose(user, acts, 'DORA');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), 'licencija{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.documents).toEqual([f.ID.mica, f.ID.dora]);
  });


  it('Enter in the question searches; Shift+Enter starts a new line instead', async () => {
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search');
    const question = screen.getByRole('textbox', { name: 'Question or phrase' });
    await user.type(question, 'Pirma eilutė{Shift>}{Enter}{/Shift}antra');
    await settle(50);
    expect(posts).toHaveLength(0);
    expect(question).toHaveValue('Pirma eilutė\nantra');
    await user.type(question, '{Enter}');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body.query).toBe('Pirma eilutė\nantra');
    await settle(50);
    expect(posts).toHaveLength(1);
  });


  it('a blank question searches nothing', async () => {
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), '{Enter}');
    await settle(50);
    expect(posts).toHaveLength(0);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });


  it('holds the button busy with a progress bar while the search runs', async () => {
    given.hang('post', '/api/corpus/search');
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), QUESTION);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Search/ })).toBeDisabled());
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a plain user searches too', async () => {
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search', { session: userAuthData });
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(await results('Results: 3')).toHaveLength(3);
  });
});







// -----------------------------------------------------------
// CorpusSearch — the hits
// -----------------------------------------------------------

describe('CorpusSearch — the hits', () => {

  const search = async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    return results('Results: 3');
  };


  it('shows each hit as act · path — heading with its score and passage, in the backend\'s order', async () => {
    const { user } = renderTab('search');
    const items = await search(user);
    expect(items.map((item) => within(item).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'MiCA · 59 str. — Kriptoturto paslaugų teikėjų veiklos leidimas',
      'MiCA · 75 str. — Kriptoturto saugojimas ir administravimas klientų vardu',
      'PPTFPĮ · 22 str. — Vidaus kontrolė',
    ]);
    expect(within(items[0]).getByText('score 0.033')).toBeInTheDocument();
    expect(within(items[2]).getByText('score 0.016')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(f.corpusHits[0].text.split('\n')[0]);
  });


  it('links each hit into the corpus viewer and to the official text — the EUR-Lex article anchor, else the act\'s own page', async () => {
    const { user } = renderTab('search');
    const items = await search(user);
    expect(within(items[0]).getByRole('link', { name: 'Open the provision' })).toHaveAttribute('href', `/corpus/${f.ID.mica}?unit=${f.ID.micaArt59}`);
    const official = within(items[0]).getByRole('link', { name: 'Official text' });
    expect(official).toHaveAttribute('href', `${EUR_LEX_MICA}#art_59`);
    expect(official).toHaveAttribute('target', '_blank');
    expect(official).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(items[1]).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', `${EUR_LEX_MICA}#art_75`);
    // A Lithuanian act has no EUR-Lex anchor: its e-TAR page
    expect(within(items[2]).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90');
  });


  it('falls back to the act\'s source page when a hit has no citation address, and shows no official link without either', async () => {
    given.json('post', '/api/corpus/search', { hits: [
      { ...f.corpusHits[0], citationUrl: '' },
      { ...f.corpusHits[1], citationUrl: null, sourceUrl: '' },
    ] });
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    const items = await results('Results: 2');
    expect(within(items[0]).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', EUR_LEX_MICA);
    expect(within(items[1]).queryByRole('link', { name: 'Official text' })).toBeNull();
    expect(within(items[1]).getByRole('link', { name: 'Open the provision' })).toBeInTheDocument();
  });


  it('a heading-less hit shows act · path alone', async () => {
    given.json('post', '/api/corpus/search', { hits: [{ ...f.corpusHits[0], path: '59 str. 1 d.', heading: '' }] });
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    const items = await results('Results: 1');
    expect(within(items[0]).getByRole('heading', { level: 3 }).textContent).toBe('MiCA · 59 str. 1 d.');
  });


  it('opening a provision goes to the act page with the unit selected', async () => {
    const { user } = renderTab('search');
    const items = await search(user);
    await user.click(within(items[1]).getByRole('link', { name: 'Open the provision' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${f.ID.mica}?unit=${f.ID.micaArt75}`);
  });


  it('clamps a passage to four lines until its named toggle opens it, and closes it again', async () => {
    const { user } = renderTab('search');
    const items = await search(user);
    const passage = within(items[0]).getByText((_, node) => node?.tagName === 'P' && node.textContent === f.corpusHits[0].text);
    expect(passage).toHaveClass('line-clamp-4');
    const toggle = within(items[0]).getByRole('button', { name: 'Show the whole passage' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(passage).not.toHaveClass('line-clamp-4');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Show less');
    // The other passages stay clamped
    expect(within(items[1]).getByRole('button', { name: 'Show the whole passage' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(passage).toHaveClass('line-clamp-4');
  });


  it('says nothing was found when the search has no hits', async () => {
    given.json('post', '/api/corpus/search', { hits: [] });
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    expect(await results('Nothing found')).toHaveLength(0);
  });


  it('a new search replaces the previous hits', async () => {
    given.sequence('post', '/api/corpus/search', [{ body: { hits: f.corpusHits } }, { body: { hits: [f.corpusHits[2]] } }]);
    const { user } = renderTab('search');
    const question = screen.getByRole('textbox', { name: 'Question or phrase' });
    await user.type(question, `${QUESTION}{Enter}`);
    await results('Results: 3');
    await user.type(question, ' PPTFPĮ{Enter}');
    const items = await results('Results: 1');
    expect(within(items[0]).getByRole('heading', { level: 3 })).toHaveTextContent('PPTFPĮ · 22 str. — Vidaus kontrolė');
  });
});







// -----------------------------------------------------------
// CorpusSearch — refusals and failures
// -----------------------------------------------------------
//
// The search is a silent request: the translated sentence
// shows under the form, never as a toast; the next search
// clears it.
// -----------------------------------------------------------

describe('CorpusSearch — refusals and failures', () => {

  const FAILURES = [
    ['a 500', () => given.apiError('post', '/api/corpus/search', 'SERVER_ERROR', { status: 500 }), 'Server error. Try again later.'],
    ['the AI provider\'s 402', () => given.apiError('post', '/api/corpus/search', 'AI_BUDGET_EXHAUSTED', { status: 402 }), 'The AI service budget is used up — try again later or contact your administrator.'],
    ['a 429 with Retry-After', () => given.sequence('post', '/api/corpus/search', [{ status: 429, body: { error: 'Too many requests', code: 'RATE_LIMITED' }, headers: { 'Retry-After': '30' } }]), 'Too many attempts. Wait a moment and try again. Try again in 30 s.'],
    ['a proxy\'s HTML page', () => given.html('post', '/api/corpus/search'), 'The server is temporarily unreachable. Try again.'],
    ['a dropped connection', () => given.networkError('post', '/api/corpus/search'), 'Could not reach the server. Check your internet connection.'],
  ];

  for (const [what, arrange, text] of FAILURES) {
    it(`shows "${text}" under the form on ${what}, without a toast`, async () => {
      arrange();
      const { user } = renderTab('search');
      await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(screen.getAllByText(text)).toHaveLength(1);
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
      expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
    });
  }


  it('the next search that succeeds replaces the error with the hits', async () => {
    given.sequence('post', '/api/corpus/search', [{ status: 500, body: { error: 'x', code: 'SERVER_ERROR' } }, { body: { hits: f.corpusHits } }]);
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await results('Results: 3')).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a 401 sends the user to /login with the tab as ?next=', async () => {
    given.unauthorized('post', '/api/corpus/search');
    const { user } = renderTab('search');
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Fcorpus%3Ftab%3Dsearch']));
  });


  it('a failed act list leaves the picker empty but the search usable', async () => {
    given.apiError('get', '/api/corpus/documents', 'SERVER_ERROR', { status: 500 });
    const posts = record('post', '/api/corpus/search');
    const { user } = renderTab('search');
    await user.click(screen.getByRole('combobox', { name: 'Only in these legal acts' }));
    await settle(50);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    await user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), `${QUESTION}{Enter}`);
    await waitFor(() => expect(posts).toHaveLength(1));
  });
});







// -----------------------------------------------------------
// CorpusSearch — in Lithuanian
// -----------------------------------------------------------

describe('CorpusSearch — in Lithuanian', () => {

  it('speaks Lithuanian: the form, the results, the score and the links', async () => {
    const { user } = renderTab('search', { locale: 'lt' });
    const form = screen.getByRole('search');
    expect(within(form).getByRole('combobox', { name: 'Rezultatų skaičius' })).toBeInTheDocument();
    await user.click(within(form).getByRole('combobox', { name: 'Jurisdikcija' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Visi', 'ES', 'Lietuva', 'Tarptautinis']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(within(form).getByRole('combobox', { name: 'Tik šiuose teisės aktuose' })).toBeInTheDocument();
    expect(within(form).getByText('Paieška naudoja vektorizavimo modelį (nedidelės sąnaudos).')).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Klausimas ar frazė' }), QUESTION);
    await user.click(within(form).getByRole('button', { name: 'Ieškoti' }));
    const items = await results('Rezultatų: 3');
    expect(within(items[0]).getByText('atitikimas 0,033')).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Atidaryti nuostatą' })).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Oficialus tekstas' })).toBeInTheDocument();
    expect(within(items[0]).getByRole('button', { name: 'Rodyti visą ištrauką' })).toBeInTheDocument();
  });


  it('says nothing was found, and a refusal, in Lithuanian', async () => {
    given.sequence('post', '/api/corpus/search', [{ body: { hits: [] } }, { status: 402, body: { error: 'x', code: 'AI_BUDGET_EXHAUSTED' } }]);
    const { user } = renderTab('search', { locale: 'lt' });
    await user.type(screen.getByRole('textbox', { name: 'Klausimas ar frazė' }), `${QUESTION}{Enter}`);
    expect(await screen.findByRole('heading', { level: 2, name: 'Nieko nerasta' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ieškoti' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('DI paslaugos biudžetas išnaudotas — bandykite vėliau arba kreipkitės į administratorių.');
  });
});







// -----------------------------------------------------------
// CitationChecker — the row editor
// -----------------------------------------------------------

describe('CitationChecker — the row editor', () => {

  it('starts with one blank row, the intro, and no cost note', async () => {
    renderTab('citations');
    expect(screen.getByText('Check whether the legal articles an internal document cites exist and whether their headings match the stated topic.')).toBeInTheDocument();
    const row = rowFields(0);
    for (const input of [row.act, row.article, row.paragraph, row.point, row.topic]) expect(input).toHaveValue('');
    expect(screen.getAllByRole('textbox', { name: /^Article/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add a row' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Check the citations' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });


  it('suggests the corpus acts by short title in the act field, and takes free text too', async () => {
    const { user } = renderTab('citations');
    const { act } = rowFields(0);
    await user.click(act);
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['DI aktas', 'DORA', 'MiCA', 'TFR (2015)', 'LB KTPT taisyklės', 'PPTFPĮ', 'VKĮ']);
    await user.click(screen.getByRole('option', { name: 'PPTFPĮ' }));
    expect(act).toHaveValue('PPTFPĮ');
    await user.clear(act);
    await user.type(act, 'GDPR');
    expect(act).toHaveValue('GDPR');
  });


  it('adds rows up to the backend\'s cap of 50', async () => {
    const { user } = renderTab('citations');
    const add = screen.getByRole('button', { name: 'Add a row' });
    for (let i = 1; i < 50; i += 1) await user.click(add);
    expect(screen.getAllByRole('textbox', { name: /^Article/ })).toHaveLength(50);
    expect(add).toBeDisabled();
  }, 60000);


  it('removes the row asked for, the others keeping their values; the last row is cleared instead', async () => {
    const { user } = renderTab('citations');
    await user.click(screen.getByRole('button', { name: 'Add a row' }));
    await user.click(screen.getByRole('button', { name: 'Add a row' }));
    await fillRow(user, 0, { act: 'MiCA', article: '59' });
    await fillRow(user, 1, { act: 'DORA', article: '19', claimedHeading: 'Incidentai' });
    await fillRow(user, 2, { act: 'PPTFPĮ', article: '22', paragraph: '3' });

    await user.click(rowFields(0).remove);
    expect(screen.getAllByRole('textbox', { name: /^Article/ })).toHaveLength(2);
    expect(rowFields(0).act).toHaveValue('DORA');
    expect(rowFields(0).article).toHaveValue('19');
    expect(rowFields(0).topic).toHaveValue('Incidentai');
    expect(rowFields(1).act).toHaveValue('PPTFPĮ');
    expect(rowFields(1).paragraph).toHaveValue('3');

    await user.click(rowFields(1).remove);
    await user.click(rowFields(0).remove);
    expect(screen.getAllByRole('textbox', { name: /^Article/ })).toHaveLength(1);
    expect(rowFields(0).act).toHaveValue('');
    expect(rowFields(0).article).toHaveValue('');
    expect(rowFields(0).topic).toHaveValue('');
  });


  it('checks every row before sending: an act and an article in each', async () => {
    const posts = record('post', '/api/corpus/check-citations');
    const { user } = renderTab('citations');
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    expect(await screen.findByText('Give the act and the article')).toBeInTheDocument();
    expect(rowFields(0).act).toHaveAttribute('aria-invalid', 'true');
    expect(rowFields(0).article).toHaveAttribute('aria-invalid', 'true');

    await fillRow(user, 0, { act: 'MiCA', article: '59' });
    await user.click(screen.getByRole('button', { name: 'Add a row' }));
    await fillRow(user, 1, { act: 'DORA' });
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    expect(screen.getByText('Give the act and the article')).toBeInTheDocument();
    expect(rowFields(0).article).toHaveAttribute('aria-invalid', 'false');
    expect(rowFields(1).article).toHaveAttribute('aria-invalid', 'true');
    await settle(50);
    expect(posts).toHaveLength(0);

    await fillRow(user, 1, { article: '19' });
    expect(screen.queryByText('Give the act and the article')).toBeNull();
  });


  it('the refusal reaches a screen reader: an alert at once, and each empty field (only those) described by it', async () => {
    const { user } = renderTab('citations');
    await user.click(screen.getByRole('button', { name: 'Add a row' }));
    await fillRow(user, 0, { act: 'MiCA' });
    await fillRow(user, 1, { article: '19' });
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the act and the article');
    expect(rowFields(0).article).toHaveAccessibleDescription('Give the act and the article');
    expect(rowFields(1).act).toHaveAccessibleDescription('Give the act and the article');
    expect(rowFields(0).act).toHaveAttribute('aria-invalid', 'false');
    expect(rowFields(0).act).not.toHaveAttribute('aria-describedby');
    expect(rowFields(1).article).not.toHaveAttribute('aria-describedby');

    await fillRow(user, 0, { article: '59' });
    expect(rowFields(0).article).not.toHaveAttribute('aria-describedby');
    await fillRow(user, 1, { act: 'DORA' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rowFields(1).act).not.toHaveAttribute('aria-describedby');
  });


  it('shows the cost note as a status (not an alarm) while any row states a topic', async () => {
    const { user } = renderTab('citations');
    await fillRow(user, 0, { act: 'MiCA', article: '59' });
    expect(screen.queryByRole('status')).toBeNull();
    await user.type(rowFields(0).topic, 'Leidimas');
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('When a topic is given, the AI model judges the match — it counts against your daily budget.');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.clear(rowFields(0).topic);
    expect(screen.queryByRole('status')).toBeNull();
  });
});







// -----------------------------------------------------------
// CitationChecker — the check and the verdicts
// -----------------------------------------------------------

describe('CitationChecker — the check and the verdicts', () => {

  const fillChecks = async (user) => {
    for (let i = 1; i < f.CITATION_CHECKS.length; i += 1) await user.click(screen.getByRole('button', { name: 'Add a row' }));
    for (const [i, item] of f.CITATION_CHECKS.entries()) await fillRow(user, i, item);
  };


  it('POSTs one citation per row with only the parts given, trimmed', async () => {
    const posts = record('post', '/api/corpus/check-citations');
    const { user } = renderTab('citations');
    await fillChecks(user);
    await user.type(rowFields(2).act, '  ');
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ citations: f.CITATION_CHECKS });
  }, 30000);


  it('gives one verdict per row, in order: found with the heading matching or differing, not found, act not in the corpus, found without a topic', async () => {
    const { user } = renderTab('citations');
    await fillChecks(user);
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    const items = await results('Results');
    expect(items).toHaveLength(5);

    // MiCA 59(1) with its real heading as the topic
    expect(within(items[0]).getByText('Found')).toBeInTheDocument();
    expect(within(items[0]).getByText('MiCA 59 str. 1 d.')).toBeInTheDocument();
    expect(within(items[0]).getByText('→ MiCA 59 str. 1 d.')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('Actual heading: Kriptoturto paslaugų teikėjų veiklos leidimas');
    expect(within(items[0]).getByText('Heading matches')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(VERDICTS[0].excerpt);

    // DORA 19 claimed to be about third-party risk
    expect(within(items[1]).getByText('Found')).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Actual heading: Pranešimas apie didelius su IRT susijusius incidentus');
    expect(within(items[1]).getByText('Heading differs')).toBeInTheDocument();

    // An article MiCA does not have
    expect(within(items[2]).getByText('Not found')).toBeInTheDocument();
    expect(within(items[2]).getByText('MiCA 999 str.')).toBeInTheDocument();
    expect(within(items[2]).queryByText(/^Actual heading/)).toBeNull();
    expect(within(items[2]).queryByRole('link')).toBeNull();

    // An act the corpus does not hold
    expect(within(items[3]).getByText('Act not in the corpus')).toBeInTheDocument();
    expect(within(items[3]).getByText('GDPR 32 str.')).toBeInTheDocument();
    expect(within(items[3]).queryByRole('link')).toBeNull();

    // Found, no topic stated: no heading verdict at all
    expect(within(items[4]).getByText('Found')).toBeInTheDocument();
    expect(items[4]).toHaveTextContent('Actual heading: Vidaus kontrolė');
    expect(within(items[4]).queryByText(/^Heading|^Match unclear/)).toBeNull();
  }, 30000);


  it('links a found provision into the viewer and to its official text', async () => {
    const { user } = renderTab('citations');
    await fillChecks(user);
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    const items = await results('Results');
    expect(within(items[0]).getByRole('link', { name: 'Open in the corpus' })).toHaveAttribute('href', `/corpus/${f.ID.mica}?unit=${f.ID.micaArt59Par1}`);
    expect(within(items[0]).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', `${EUR_LEX_MICA}#art_59`);
    expect(within(items[0]).getByRole('link', { name: 'Official text' })).toHaveAttribute('target', '_blank');
    expect(within(items[4]).getByRole('link', { name: 'Official text' })).toHaveAttribute('href', 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90');
    await user.click(within(items[4]).getByRole('link', { name: 'Open in the corpus' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${f.ID.aml}?unit=${f.ID.amlArt22Par3}`);
  }, 30000);


  it('an inconclusive verdict on a stated topic reads "unclear", with the model\'s note beside it', async () => {
    const claim = { act: 'MiCA', article: '59', claimedHeading: 'Kriptoturto paslaugų priežiūra' };
    const [found] = f.checkCitations([{ act: 'MiCA', article: '59' }]);
    given.json('post', '/api/corpus/check-citations', { results: [{
      ...found, claimedHeading: claim.claimedHeading, headingMatch: 'unknown', note: 'Straipsnis apie leidimą; priežiūra — kitur.',
    }] });
    const { user } = renderTab('citations');
    await fillRow(user, 0, claim);
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    const [item] = await results('Results');
    expect(within(item).getByText('Match unclear')).toBeInTheDocument();
    // The chip only ever shows for a stated topic — "no heading
    // given" would contradict the row the user typed
    expect(within(item).queryByText('No heading given')).toBeNull();
    expect(within(item).getByText('Straipsnis apie leidimą; priežiūra — kitur.')).toBeInTheDocument();
  });


  it('a check in flight holds the button busy', async () => {
    given.hang('post', '/api/corpus/check-citations');
    const { user } = renderTab('citations');
    await fillRow(user, 0, { act: 'MiCA', article: '59' });
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Check the citations/ })).toBeDisabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });


  const FAILURES = [
    ['a 400 INVALID_FIELD (the backend\'s prose)', () => given.apiError('post', '/api/corpus/check-citations', 'INVALID_FIELD', { status: 400, error: 'citations must be a list of 1..50 items' }), 'citations must be a list of 1..50 items'],
    ['a 429 BUDGET_EXCEEDED', () => given.apiError('post', '/api/corpus/check-citations', 'BUDGET_EXCEEDED', { status: 429 }), 'Today\'s AI usage budget is spent. Try again tomorrow.'],
    ['a 500', () => given.apiError('post', '/api/corpus/check-citations', 'SERVER_ERROR', { status: 500 }), 'Server error. Try again later.'],
    ['a dropped connection', () => given.networkError('post', '/api/corpus/check-citations'), 'Could not reach the server. Check your internet connection.'],
  ];

  for (const [what, arrange, text] of FAILURES) {
    it(`shows "${text}" under the form on ${what}, keeping the rows`, async () => {
      arrange();
      const { user } = renderTab('citations');
      await fillRow(user, 0, { act: 'MiCA', article: '59' });
      await user.click(screen.getByRole('button', { name: 'Check the citations' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(screen.getAllByText(text)).toHaveLength(1);
      expect(rowFields(0).act).toHaveValue('MiCA');
      expect(screen.queryByRole('heading', { level: 2, name: 'Results' })).toBeNull();
    });
  }


  it('a plain user checks citations too', async () => {
    const posts = record('post', '/api/corpus/check-citations');
    const { user } = renderTab('citations', { session: userAuthData });
    await fillRow(user, 0, { act: 'DORA', article: '28', paragraph: '3' });
    await user.click(screen.getByRole('button', { name: 'Check the citations' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const [item] = await results('Results');
    expect(item).toHaveTextContent('Actual heading: Bendrieji principai');
  });
});







// -----------------------------------------------------------
// CitationChecker — in Lithuanian
// -----------------------------------------------------------

describe('CitationChecker — in Lithuanian', () => {

  it('speaks Lithuanian: the row, the buttons, the note and every verdict', async () => {
    const { user } = renderTab('citations', { locale: 'lt' });
    expect(screen.getByRole('combobox', { name: /^Teisės aktas/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Dalis' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Punktas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pašalinti eilutę' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tikrinti citatas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nurodykite teisės aktą ir straipsnį');

    for (let i = 1; i < f.CITATION_CHECKS.length; i += 1) await user.click(screen.getByRole('button', { name: 'Pridėti eilutę' }));
    for (const [i, item] of f.CITATION_CHECKS.entries()) {
      await user.type(screen.getAllByRole('combobox', { name: /^Teisės aktas/ })[i], item.act);
      await user.type(screen.getAllByRole('textbox', { name: /^Straipsnis/ })[i], item.article);
      if (item.paragraph) await user.type(screen.getAllByRole('textbox', { name: 'Dalis' })[i], item.paragraph);
      if (item.claimedHeading) await user.type(screen.getAllByRole('textbox', { name: 'Nurodyta tema (neprivaloma)' })[i], item.claimedHeading);
    }
    expect(screen.getByRole('status')).toHaveTextContent('Kai nurodyta tema, jos atitikimą įvertina DI modelis — tai skaičiuojama į jūsų dienos limitą.');
    await user.click(screen.getByRole('button', { name: 'Tikrinti citatas' }));
    const items = await results('Rezultatai');
    expect(items[0]).toHaveTextContent('Tikrasis pavadinimas: Kriptoturto paslaugų teikėjų veiklos leidimas');
    expect(within(items[0]).getByText('Rasta')).toBeInTheDocument();
    expect(within(items[0]).getByText('Pavadinimas sutampa')).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Atidaryti bazėje' })).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Oficialus tekstas' })).toBeInTheDocument();
    expect(within(items[1]).getByText('Pavadinimas nesutampa')).toBeInTheDocument();
    expect(within(items[2]).getByText('Nerasta')).toBeInTheDocument();
    expect(within(items[3]).getByText('Akto nėra bazėje')).toBeInTheDocument();
  }, 40000);


  it('an inconclusive verdict reads "Neaišku, ar sutampa"', async () => {
    const [found] = f.checkCitations([{ act: 'MiCA', article: '59' }]);
    given.json('post', '/api/corpus/check-citations', { results: [{ ...found, claimedHeading: 'Priežiūra', headingMatch: 'unknown', note: '' }] });
    const { user } = renderTab('citations', { locale: 'lt' });
    await user.type(screen.getByRole('combobox', { name: /^Teisės aktas/ }), 'MiCA');
    await user.type(screen.getByRole('textbox', { name: /^Straipsnis/ }), '59');
    await user.type(screen.getByRole('textbox', { name: 'Nurodyta tema (neprivaloma)' }), 'Priežiūra');
    await user.click(screen.getByRole('button', { name: 'Tikrinti citatas' }));
    const [item] = await results('Rezultatai');
    expect(within(item).getByText('Neaišku, ar sutampa')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Coming back to the tools
// -----------------------------------------------------------
//
// Both tools keep what was typed and the last answer for the
// tab (sessionStorage): Back from a provision an answer
// linked to finds them — without asking (and paying) again.
// Each test leaves the page (unmount) and comes back.
// -----------------------------------------------------------

describe('Corpus search and citation checker — coming back', () => {

  it('the search: the question, the filters and the hits come back without a new search', async () => {
    const posts = record('post', '/api/corpus/search');
    const first = renderTab('search');
    await first.user.type(screen.getByRole('textbox', { name: 'Question or phrase' }), QUESTION);
    await choose(first.user, screen.getByRole('combobox', { name: 'Number of results' }), '15');
    await choose(first.user, screen.getByRole('combobox', { name: 'Only in these legal acts' }), 'MiCA');
    await first.user.click(screen.getByRole('button', { name: 'Search' }));
    const before = await results('Results: 2');
    first.unmount();

    renderTab('search');
    expect(screen.getByRole('textbox', { name: 'Question or phrase' })).toHaveValue(QUESTION);
    expect(screen.getByRole('combobox', { name: 'Number of results' })).toHaveTextContent('15');
    expect(within(screen.getByRole('search')).getByRole('button', { name: 'MiCA' })).toBeInTheDocument();
    expect(await results('Results: 2')).toHaveLength(before.length);
    expect(posts).toHaveLength(1);
  });


  it('the checker: the rows typed and the verdicts come back without a new check', async () => {
    const posts = record('post', '/api/corpus/check-citations');
    const first = renderTab('citations');
    await fillRow(first.user, 0, { act: 'MiCA', article: '59', paragraph: '1' });
    await first.user.click(screen.getByRole('button', { name: 'Add a row' }));
    await fillRow(first.user, 1, { act: 'DORA', article: '19' });
    await first.user.click(screen.getByRole('button', { name: 'Check the citations' }));
    expect(await results('Results')).toHaveLength(2);
    first.unmount();

    renderTab('citations');
    expect(rowFields(0).act).toHaveValue('MiCA');
    expect(rowFields(0).paragraph).toHaveValue('1');
    expect(rowFields(1).article).toHaveValue('19');
    expect(await results('Results')).toHaveLength(2);
    expect(posts).toHaveLength(1);
  });


  it('a kept form or answer of the wrong shape is ignored — the tools start blank', () => {
    sessionStorage.setItem('view.corpus.search.form', JSON.stringify({ query: 7, k: 999 }));
    sessionStorage.setItem('view.corpus.search.answer', JSON.stringify({ hits: 'many' }));
    const first = renderTab('search');
    expect(screen.getByRole('textbox', { name: 'Question or phrase' })).toHaveValue('');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    first.unmount();

    sessionStorage.setItem('view.corpus.citations.rows', JSON.stringify([{ act: 1 }]));
    renderTab('citations');
    expect(rowFields(0).act).toHaveValue('');
    expect(screen.getAllByRole('combobox', { name: /^Legal act/ })).toHaveLength(1);
  });


  it('in Lithuanian too', async () => {
    const first = renderTab('search', { locale: 'lt' });
    await first.user.type(screen.getByRole('textbox', { name: 'Klausimas ar frazė' }), `${QUESTION}{Enter}`);
    await results('Rezultatų: 3');
    first.unmount();
    renderTab('search', { locale: 'lt' });
    expect(screen.getByRole('textbox', { name: 'Klausimas ar frazė' })).toHaveValue(QUESTION);
    expect(await results('Rezultatų: 3')).toHaveLength(3);
  });
});
