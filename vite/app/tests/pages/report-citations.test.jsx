// -----------------------------------------------------------
//  [*] Tests — ReportCitations (the citations tab) and the
//      citation audit's tile on the summary
//
//  The finished UAB Pavyzdys report's citation audit on the
//  report page (?tab=citations), against the backend double:
//  every reference the procedure and the licence extract
//  make to a specific provision, problems first, each with
//  its verdict chip (correct / wrong provision / no such
//  provision / act not in the corpus / could not judge), the
//  document (it opens in the document drawer; a deleted one
//  is plain text), the reference in the UI's citation style,
//  the claim and the quote; for a found provision its real
//  heading, the judge's note (and a word when the word
//  overlap judged), the excerpt and the links to the corpus
//  viewer and the official text; for a missing one the act
//  in the corpus. The verdict toggles with their counts, the
//  search, "Clear the filters"; the empty audit and the
//  report from before the audit (the tab says the audit was
//  not run, its label carries no count); the first page of
//  a long audit and "Show more" moving the focus; the tile
//  on the summary (the counts, the link that opens the tab
//  and hands the focus to it, "not run", "nothing found");
//  coming back (the verdicts and the search read from and
//  replaced in the address, kept through a tab switch; the
//  page shown kept per report); Lithuanian; and the contract
//  matrix of GET /api/reports/:id read by this tab.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { given } from '../support/backend/server';
import { describeEndpointContract } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import ReportDetail from '@/pages/Reports/ReportDetail';
import ReportOverview from '@/pages/Reports/ReportOverview';


const DONE = f.report(f.ID.reportDone);

// The finished report as a run from before the audit left it:
// no stats.citations, no rows
const { citations: AUDIT_COUNTS, ...STATS_BEFORE } = DONE.stats;
const BEFORE = { ...DONE, stats: STATS_BEFORE, citations: [] };

// An audit whose documents cited no specific provision
const NOTHING = { ...DONE, citations: [], stats: { ...DONE.stats, citations: { ...AUDIT_COUNTS, checked: 0, match: 0, mismatch: 0, notFound: 0, notInCorpus: 0, unknown: 0 } } };

// The e-TAR page of PPTFPĮ and the EUR-Lex anchor of MiCA 66
const PPTFPI_URL = 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90';
const MICA_66_URL = 'https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32023R1114#art_66';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderCitations: the report page on its citations tab.
// list / cards: the references' list and its cards (direct
// children — a card's own link chips are lists too).
// verdicts: each card's verdict chip, in order. cardOf: the
// card whose reference reads `cited`. toggle: a verdict
// toggle by its label. many: the audit of n references, one
// document citing MiCA articles 1…n — all of them missing.
// -----------------------------------------------------------

function renderCitations(options = {}) {
  return renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportDone}?tab=citations`, path: '/reports/:reportId', ...options });
}

const list = (name = 'Legal references in the company\'s documents') => screen.getByRole('list', { name });

const cards = (name) => [...list(name).querySelectorAll(':scope > li')];

const verdicts = (name) => cards(name).map((card) => card.querySelector('.MuiChip-label').textContent);

const cardOf = (cited) => cards().find((card) => card.querySelector('p')?.textContent === cited);

const toggle = (name) => screen.getByRole('button', { name });

function many(n) {
  const rows = Array.from({ length: n }, (_, i) => ({
    ...DONE.citations[2], id: `e4000000-0000-4000-8000-1${String(i).padStart(11, '0')}`, article: String(100 + i),
    claim: `Nuostata ${i + 1}`, quote: '',
  }));
  return { ...DONE, citations: rows, stats: { ...DONE.stats, citations: { ...AUDIT_COUNTS, checked: n, match: 0, mismatch: 0, notFound: n, notInCorpus: 0, unknown: 0 } } };
}







// -----------------------------------------------------------
// The references
// -----------------------------------------------------------

describe('ReportCitations — the references', () => {

  it('lists every reference problems first, each with its verdict, and counts what needs correcting', async () => {
    renderCitations();
    expect(await screen.findByText('Showing 6 of 6 · to correct: 3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Citations (6)', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Citations (6)' })).toContainElement(list());
    expect(verdicts()).toEqual(['Wrong provision', 'Wrong provision', 'No such provision', 'Could not judge', 'Act not in the corpus', 'Correct']);
    expect(cards().map((card) => card.querySelector('p').textContent)).toEqual([
      'PPTFPĮ Art. 9 para. 1', 'MiCA Art. 66 para. 4', 'MiCA Art. 82a', 'PPTFPĮ Art. 22 para. 3',
      'FNTT direktoriaus įsakymas Nr. V-314 Art. 12', 'MiCA Art. 59 para. 1',
    ]);
    expect(screen.getByText(/^Every reference the company's documents make to a specific legal provision/)).toBeInTheDocument();
  });


  it('a wrong provision shows the document, the claim and the quote, what the provision really covers, the judge\'s note, the excerpt and its links', async () => {
    renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    const card = cardOf('MiCA Art. 66 para. 4');
    expect(within(card).getByText('Document:')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Leidimo išrašas' })).toBeInTheDocument();
    expect(within(card).getByText('Klientų kriptoturto saugojimas ir administravimas.')).toBeInTheDocument();
    expect(within(card).getByText('The document says:', { exact: false })).toBeInTheDocument();
    expect(within(card).getByText('„Saugojimo paslauga teikiama laikantis MiCA 66 straipsnio 4 dalies.“')).toBeInTheDocument();
    expect(within(card).getByText('MiCA 66 str. 4 d. actually covers:', { exact: false }).parentElement)
      .toHaveTextContent('MiCA 66 str. 4 d. actually covers: Pareiga veikti sąžiningai, teisingai ir profesionaliai, atsižvelgiant į geriausius klientų interesus');
    expect(within(card).getByText('Nuostata reglamentuoja kainodaros, išlaidų ir mokesčių skelbimą, ne klientų kriptoturto saugojimą.')).toBeInTheDocument();
    expect(within(card).getByText('Kriptoturto paslaugų teikėjai savo interneto svetainėje aiškiai skelbia savo kainodarą, išlaidas ir mokesčius.')).toBeInTheDocument();
    expect(within(card).queryByText(/word overlap/)).toBeNull();
    const unit = within(card).getByRole('link', { name: 'Open the provision in the corpus: MiCA 66 str. 4 d.' });
    expect(unit).toHaveAttribute('href', `/corpus/${f.ID.mica}?unit=${f.ID.micaV1Art66Par4}`);
    const official = within(card).getByRole('link', { name: 'Official text (opens in a new window): MiCA 66 str. 4 d.' });
    expect(official).toHaveAttribute('href', MICA_66_URL);
    expect(official).toHaveAttribute('target', '_blank');
    expect(official).toHaveAttribute('rel', 'noopener noreferrer');
  });


  it('a Lithuanian act\'s provision links its e-TAR page; a corpus link leads to the provision', async () => {
    const { user } = renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    const card = cardOf('PPTFPĮ Art. 9 para. 1');
    expect(within(card).getByRole('link', { name: 'Official text (opens in a new window): PPTFPĮ 9 str. 1 d.' })).toHaveAttribute('href', PPTFPI_URL);
    expect(within(card).getByText('PPTFPĮ 9 str. 1 d. actually covers:', { exact: false }).parentElement).toHaveTextContent('Kliento ir naudos gavėjo tapatybės nustatymas');
    await user.click(within(card).getByRole('link', { name: 'Open the provision in the corpus: PPTFPĮ 9 str. 1 d.' }));
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${f.ID.aml}?unit=${f.ID.amlArt9Par1}`);
  });


  it('a provision the act does not have says so and links the act; an act outside the corpus says it could not be checked', async () => {
    renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    const missing = cardOf('MiCA Art. 82a');
    expect(within(missing).getByText(/^MiCA has no such provision in its current version\./)).toBeInTheDocument();
    expect(within(missing).getByRole('link', { name: 'Open MiCA in the corpus' })).toHaveAttribute('href', `/corpus/${f.ID.mica}`);
    expect(within(missing).queryByText(/actually covers/)).toBeNull();
    const outside = cardOf('FNTT direktoriaus įsakymas Nr. V-314 Art. 12');
    expect(within(outside).getByText('The act is not in the legal corpus, so the reference could not be checked.')).toBeInTheDocument();
    expect(within(outside).queryAllByRole('link')).toHaveLength(0);
  });


  it('a claim that could not be judged keeps the provision, its note and links; a correct one shows the same', async () => {
    renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    const unknown = cardOf('PPTFPĮ Art. 22 para. 3');
    expect(within(unknown).getByText('Could not judge')).toBeInTheDocument();
    expect(within(unknown).getByText('Teiginys per bendras, kad jį būtų galima palyginti su nuostata.')).toBeInTheDocument();
    const right = cardOf('MiCA Art. 59 para. 1');
    expect(within(right).getByText('Correct')).toBeInTheDocument();
    expect(within(right).getByText('MiCA 59 str. 1 d. actually covers:', { exact: false }).parentElement).toHaveTextContent('Kriptoturto paslaugų teikėjų veiklos leidimas');
  });


  it('says when the word overlap judged instead of the model', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, citations: DONE.citations.map((row) => (row.status === 'found' ? { ...row, judgedBy: 'overlap', note: '' } : row)) });
    renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    expect(screen.getAllByText('Judged by word overlap — the AI judge was unavailable when the report ran.')).toHaveLength(4);
  });


  it('the document opens in the drawer; a document deleted since is its title only', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, citations: DONE.citations.map((row) => (row.documentId === f.ID.procedureDoc ? { ...row, documentId: null } : row)) });
    const { user } = renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    expect(within(cardOf('PPTFPĮ Art. 9 para. 1')).queryByRole('button')).toBeNull();
    expect(within(cardOf('PPTFPĮ Art. 9 para. 1')).getByText('Pinigų plovimo prevencijos procedūra')).toBeInTheDocument();
    const document = within(cardOf('MiCA Art. 66 para. 4')).getByRole('button', { name: 'Leidimo išrašas' });
    await user.click(document);
    const dialog = await screen.findByRole('dialog', { name: 'Leidimo išrašas' });
    await within(dialog).findByText(/^1–\d+ of \d+ characters$/);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(window.document.activeElement).toBe(document));
  });


  it('shows a row without an id, or repeating one, like any other — and survives rows that are not objects', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, citations: [null, 'x', ...DONE.citations.map((row, i) => ({ ...row, id: i % 2 ? 'same' : undefined }))] });
    renderCitations();
    expect(await screen.findByText('Showing 6 of 6 · to correct: 3')).toBeInTheDocument();
    expect(cards()).toHaveLength(6);
  });
});







// -----------------------------------------------------------
// Filters and search
// -----------------------------------------------------------

describe('ReportCitations — filters and search', () => {

  it('offers every verdict with its count', async () => {
    renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    expect(within(screen.getByRole('group', { name: 'Verdict' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Wrong provision (2)', 'No such provision (1)', 'Could not judge (1)', 'Act not in the corpus (1)', 'Correct (1)']);
  });


  it('filters by verdict — several add up — and "Clear the filters" brings every reference back', async () => {
    const { user } = renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
    await user.click(toggle('Wrong provision (2)'));
    expect(toggle('Wrong provision (2)')).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('Showing 2 of 6 · to correct: 3');
    expect(verdicts()).toEqual(['Wrong provision', 'Wrong provision']);
    await user.click(toggle('Correct (1)'));
    await screen.findByText('Showing 3 of 6 · to correct: 3');
    expect(verdicts()).toEqual(['Wrong provision', 'Wrong provision', 'Correct']);
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    expect(toggle('Wrong provision (2)')).toHaveAttribute('aria-pressed', 'false');
  });


  it('searches the document, the reference, the claim, the quote, the heading and the note, in any case', async () => {
    const { user } = renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    const search = screen.getByRole('textbox', { name: 'Search the references' });
    for (const [text, shown] of [['v-314', ['FNTT direktoriaus įsakymas Nr. V-314 Art. 12']], ['LEIDIMO IŠRAŠAS', ['MiCA Art. 66 para. 4', 'MiCA Art. 82a', 'MiCA Art. 59 para. 1']],
      ['sustiprintas', ['PPTFPĮ Art. 9 para. 1']], ['vidaus kontrolė', ['PPTFPĮ Art. 22 para. 3']], ['kainodaros', ['MiCA Art. 66 para. 4']], ['Art. 82a', ['MiCA Art. 82a']]]) {
      await user.clear(search);
      await user.type(search, text);
      await waitFor(() => expect(cards().map((card) => card.querySelector('p').textContent), text).toEqual(shown));
    }
  });


  it('says so when nothing matches', async () => {
    const { user } = renderCitations();
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    await user.type(screen.getByRole('textbox', { name: 'Search the references' }), 'nėra tokio');
    expect(await screen.findByText('No references match the filters')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 6 · to correct: 3')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Legal references in the company\'s documents' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Empty, old and long audits
// -----------------------------------------------------------

describe('ReportCitations — empty, old and long audits', () => {

  it('an audit that found no reference says so, without filters', async () => {
    given.json('get', '/api/reports/:reportId', NOTHING);
    renderCitations();
    const note = await screen.findByText('No legal references to specific provisions were found in the company\'s documents');
    expect(note.closest('[role="status"]')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Citations (0)', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search the references' })).toBeNull();
  });


  it('a report from before the audit says the audit was not run — its tab carries no count — rows or no rows', async () => {
    for (const report of [BEFORE, { ...BEFORE, citations: undefined }, { ...DONE, stats: STATS_BEFORE }, { ...BEFORE, stats: { ...STATS_BEFORE, citations: 'x' } }]) {
      given.json('get', '/api/reports/:reportId', report);
      const { unmount } = renderCitations();
      expect(await screen.findByText('The citation audit was not run for this report')).toBeInTheDocument();
      expect(screen.getByText(/^Reports produced before the audit existed did not check/)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Citations', selected: true })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Legal references in the company\'s documents' })).toBeNull();
      unmount();
    }
  });


  it('shows 50 references, then "Show more" — the focus moves to the first reference revealed', async () => {
    given.json('get', '/api/reports/:reportId', many(70));
    const { user } = renderCitations();
    await screen.findByText('Showing 70 of 70 · to correct: 70');
    expect(cards()).toHaveLength(50);
    expect(screen.getByText('50 of 70 shown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 20 more' }));
    await waitFor(() => expect(cards()).toHaveLength(70));
    expect(document.activeElement).toBe(cards()[50]);
    expect(within(cards()[50]).getByText('MiCA Art. 150')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
  });


  it('a new search starts on the first page again', async () => {
    given.json('get', '/api/reports/:reportId', many(70));
    const { user } = renderCitations();
    await screen.findByText('Showing 70 of 70 · to correct: 70');
    await user.click(screen.getByRole('button', { name: 'Show 20 more' }));
    await waitFor(() => expect(cards()).toHaveLength(70));
    await user.type(screen.getByRole('textbox', { name: 'Search the references' }), 'Nuostata');
    await waitFor(() => expect(cards()).toHaveLength(50));
  });
});







// -----------------------------------------------------------
// The tile on the summary
// -----------------------------------------------------------

describe('ReportOverview — the citation audit tile', () => {

  const tile = () => screen.getByRole('region', { name: 'Citation audit' });


  it('counts the references to correct of those checked, each verdict, and links the tab', () => {
    renderPage(<ReportOverview report={DONE} />);
    expect(within(tile()).getByText('The references the company\'s documents make to specific legal provisions, checked against the legal corpus.')).toBeInTheDocument();
    expect(within(tile()).getByText('3 of 6 references need correcting — they name the wrong provision or one that does not exist.')).toBeInTheDocument();
    expect(within(tile()).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['Wrong provision2', 'No such provision1', 'Could not judge1', 'Act not in the corpus1', 'Correct1']);
    expect(within(tile()).getByRole('link', { name: 'Open the citation audit' })).toHaveAttribute('href', '/?tab=citations');
  });


  it('the link opens the citations tab and hands the keyboard focus to it', async () => {
    const { user, router } = renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportDone}`, path: '/reports/:reportId' });
    const link = await within(await screen.findByRole('region', { name: 'Citation audit' })).findByRole('link', { name: 'Open the citation audit' });
    expect(link).toHaveAttribute('href', `/reports/${f.ID.reportDone}?tab=citations`);
    await user.click(link);
    expect(await screen.findByRole('tab', { name: 'Citations (6)', selected: true })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?tab=citations');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Citations (6)' })));
    expect(await screen.findByText('Showing 6 of 6 · to correct: 3')).toBeInTheDocument();
  });


  it('says when the audit found nothing, and when it was never run — then without a link', () => {
    const view = renderPage(<ReportOverview report={NOTHING} />);
    expect(within(tile()).getByText('No legal references to specific provisions were found in the company\'s documents.')).toBeInTheDocument();
    expect(within(tile()).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(tile()).getByRole('link', { name: 'Open the citation audit' })).toBeInTheDocument();
    view.unmount();
    renderPage(<ReportOverview report={BEFORE} />);
    expect(within(tile()).getByText('The citation audit was not run for this report.')).toBeInTheDocument();
    expect(within(tile()).queryByRole('link')).toBeNull();
  });


  it('counts from the stats when a row carries no references (a list row)', () => {
    renderPage(<ReportOverview report={{ ...DONE, citations: undefined }} />);
    expect(within(tile()).getByText('3 of 6 references need correcting — they name the wrong provision or one that does not exist.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The verdicts and the search live in the address
// (citations.*, read when the tab mounts, replaced as they
// change); the page shown is kept for the report. A tab
// switch keeps them all — the summary's link included.
// -----------------------------------------------------------

describe('ReportCitations — coming back', () => {

  const route = (query) => `/reports/${f.ID.reportDone}?tab=citations${query}`;


  it('the verdicts and the search come from the address', async () => {
    renderCitations({ route: route('&citations.verdict=mismatch,match&citations.q=mica') });
    expect(await screen.findByText('Showing 2 of 6 · to correct: 3')).toBeInTheDocument();
    expect(toggle('Wrong provision (2)')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Correct (1)')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Search the references' })).toHaveValue('mica');
  });


  it('the toggles and the search write the address, replacing it; unknown verdicts are ignored', async () => {
    const { user, router } = renderCitations({ route: route('&citations.verdict=exploded') });
    await screen.findByText('Showing 6 of 6 · to correct: 3');
    await user.click(toggle('No such provision (1)'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=citations&citations.verdict=not_found'));
    expect(router.state.historyAction).toBe('REPLACE');
    await user.type(screen.getByRole('textbox', { name: 'Search the references' }), 'MiCA');
    await waitFor(() => expect(router.state.location.search).toBe('?tab=citations&citations.verdict=not_found&citations.q=MiCA'));
  });


  it('a tab switch keeps them: back on the tab, the same references show', async () => {
    const { user, router } = renderCitations({ route: route('&citations.verdict=mismatch') });
    await screen.findByText('Showing 2 of 6 · to correct: 3');
    await user.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(router.state.location.search).toBe('?tab=summary&citations.verdict=mismatch');
    await user.click(await screen.findByRole('link', { name: 'Open the citation audit' }));
    expect(await screen.findByText('Showing 2 of 6 · to correct: 3')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?tab=citations&citations.verdict=mismatch');
  });


  it('the page shown ("Show more") comes back with the report', async () => {
    given.json('get', '/api/reports/:reportId', many(70));
    const first = renderCitations();
    await first.findByText('Showing 70 of 70 · to correct: 70');
    await first.user.click(screen.getByRole('button', { name: 'Show 20 more' }));
    await waitFor(() => expect(cards()).toHaveLength(70));
    first.unmount();
    renderCitations();
    await screen.findByText('Showing 70 of 70 · to correct: 70');
    expect(cards()).toHaveLength(70);
  });


  it('in Lithuanian too', async () => {
    renderCitations({ route: route('&citations.verdict=mismatch'), locale: 'lt' });
    expect(await screen.findByText('Rodoma 2 iš 6 · taisytinų: 3')).toBeInTheDocument();
    expect(toggle('Ne ta nuostata (2)')).toHaveAttribute('aria-pressed', 'true');
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('ReportCitations in Lithuanian', () => {

  it('speaks Lithuanian: the tab, the count, the toggles, the verdicts and the Lithuanian citation style', async () => {
    renderCitations({ locale: 'lt' });
    expect(await screen.findByText('Rodoma 6 iš 6 · taisytinų: 3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Nuorodos (6)', selected: true })).toBeInTheDocument();
    const name = 'Teisės aktų nuorodos įmonės dokumentuose';
    expect(verdicts(name)).toEqual(['Ne ta nuostata', 'Ne ta nuostata', 'Tokios nuostatos nėra', 'Nepavyko įvertinti', 'Akto nėra bazėje', 'Teisinga']);
    expect(cards(name).map((card) => card.querySelector('p').textContent)).toEqual([
      'PPTFPĮ 9 str. 1 d.', 'MiCA 66 str. 4 d.', 'MiCA 82a str.', 'PPTFPĮ 22 str. 3 d.', 'FNTT direktoriaus įsakymas Nr. V-314 12 str.', 'MiCA 59 str. 1 d.',
    ]);
    expect(within(screen.getByRole('group', { name: 'Išvada' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Ne ta nuostata (2)', 'Tokios nuostatos nėra (1)', 'Nepavyko įvertinti (1)', 'Akto nėra bazėje (1)', 'Teisinga (1)']);
    const card = cards(name)[1];
    expect(within(card).getByText('Dokumentas:')).toBeInTheDocument();
    expect(within(card).getByText('MiCA 66 str. 4 d. iš tikrųjų reglamentuoja:', { exact: false })).toBeInTheDocument();
    expect(within(cards(name)[2]).getByText(/^Galiojančioje MiCA redakcijoje tokios nuostatos nėra\./)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ieškoti nuorodose' })).toBeInTheDocument();
  });


  it('says "not run" and "nothing found" in Lithuanian, on the tab and on the tile', async () => {
    given.json('get', '/api/reports/:reportId', BEFORE);
    const { unmount } = renderCitations({ locale: 'lt' });
    expect(await screen.findByText('Šiai ataskaitai nuorodų patikra nebuvo atlikta')).toBeInTheDocument();
    unmount();
    const view = renderPage(<ReportOverview report={NOTHING} />, { locale: 'lt' });
    const tile = screen.getByRole('region', { name: 'Teisės aktų nuorodų patikra' });
    expect(within(tile).getByText('Įmonės dokumentuose nerasta nuorodų į konkrečias teisės aktų nuostatas.')).toBeInTheDocument();
    view.unmount();
    renderPage(<ReportOverview report={DONE} />, { locale: 'lt' });
    expect(within(screen.getByRole('region', { name: 'Teisės aktų nuorodų patikra' })).getByText('Taisytinos nuorodos: 3 iš 6 — jose nurodyta ne ta arba neegzistuojanti nuostata.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Atidaryti nuorodų patikrą' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/reports/:reportId',
  fixture: DONE,
  render: () => renderCitations(),
  chrome: () => within(screen.getByRole('main')).getByRole('link', { name: 'Reports' }),
  loaded: async () => { await screen.findByText('Showing 6 of 6 · to correct: 3'); },
  loading: () => screen.getByRole('main').querySelector('.MuiSkeleton-root'),
});
