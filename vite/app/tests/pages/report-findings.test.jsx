// -----------------------------------------------------------
//  [*] Tests — ReportFindings (the findings tab) and
//      FindingReviewDialog
//
//  The findings of the finished UAB Pavyzdys report on the
//  report page (?tab=findings), against the backend double:
//  the groups (by act — worst first, open ones expanded —
//  and by domain), the cards (the effective status, the
//  severity, the "reviewed" mark with the model's verdict,
//  the "unreviewed obligation" mark, the domain), the
//  disclosure with the obligation, assessment, evidence
//  (quotes; a document or passage opens the document
//  drawer — a passage at the text page holding its
//  charStart, the quote marked and scrolled to, an unplaced
//  one at the top), recommendation, deadline and the
//  reviewer's note; the citations (corpus unit pages and EUR-Lex /
//  e-TAR); the status and severity filters with their counts
//  by effective status, the search, the "clear" button; the
//  focus the action plan hands over (a status note with
//  "Show all"); the findings of an act that applies from a
//  later date (their group last, dated and folded; their
//  cards dated) and a quote the document does not hold word
//  for word (said under it); the review flow (PATCH …/findings/:fid with
//  {overrideStatus, reviewerNote}, clearing an override with
//  null, a refusal inside the dialog, the approval the
//  server withdraws) followed on a stateful double; a long
//  report (folded groups mount no cards, 50 cards a page with
//  "Show N more" moving the focus to the first new card, the
//  pages kept through a refresh and reset by a new filter,
//  the plan's focus and the document drawer reaching cards
//  beyond the first page, the search box taking every
//  keystroke); coming back (the filters read from and
//  replaced in the address, unknown values ignored; the pages
//  opened, the groups toggled and the cards expanded kept per
//  report); and Lithuanian.
//
//  What a finding means beyond its verdict: the cause a
//  reviewer wrote and the consequence — what a breach can
//  cost, in the exports' words to the character — after the
//  assessment, the consequence for a gap only (never for a
//  duty that is met, nor beside "preparation"), once with the
//  note that it is a ceiling; the review dialog's cause field
//  (saved alone, cleared with null, left out of the request
//  when untouched). And the findings of the company's own
//  requirements in the one report that holds them: a group of
//  their own under either grouping, their criterion a passage
//  of the policy that opens the company document at the quote
//  (plain text when the quote has no place), their own words
//  — and never the "unreviewed obligation" mark. And a
//  finding's history: the quiet "Before" row with how the
//  same obligation stood in the company's earlier reports —
//  the three newest, each a link to its report.
// -----------------------------------------------------------

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderPage, authData } from '../support/render';
import { given, server, url } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import { AMLR_GAP, AMLR_MET, reportToday } from '../support/reportToday';
import ReportDetail from '@/pages/Reports/ReportDetail';
import ReportFindings from '@/pages/Reports/ReportFindings';


const DONE = f.report(f.ID.reportDone);

// The report that also assessed the company's own
// requirements: the finished one with that group added
const OWN = f.report(f.ID.reportOwn);

// The titles of its three findings of that group
const R = {
  reports: 'Kas ketvirtį teikti valdybai atitikties rizikos ataskaitą',
  risk: 'Bent kartą per metus atlikti atitikties rizikos vertinimą',
  scope: 'Taikyti politiką visiems darbuotojams ir valdybos nariams',
};

// The no-break space the exports set inside an amount and
// before the percent sign — the page prints the same
const NBSP = String.fromCharCode(160);

// What a breach of the safeguarding duty can cost, as the
// page must print it in English: MiCA's tier, then the
// national law's graver one with its condition and the
// provision its measure comes from
const SAFEGUARDING_COST = `a fine of up to 5${NBSP}000${NBSP}000 EUR or 5${NBSP}% of annual turnover (income) or 2 times the benefit gained or loss avoided; `
  + 'also: an order to end the breach, a public statement on the breach (MiCA 111 str. 2 d. a–c p.; 3 d. a, c p.); '
  + `a fine of up to 5${NBSP}000${NBSP}000 EUR or 10${NBSP}% of annual turnover (income); also: withdrawal or suspension of the authorisation `
  + '– Sistemingas arba pakartotinis pažeidimas (KRĮ 15 str. 1 d. 1 p., 14 str. 1 d.)';

const CEILING = 'The ceiling the act provides, not a forecast.';
const CAUSE = 'Procedūra parengta iki DORA taikymo pradžios ir po to neperžiūrėta; atsakingas asmuo nepaskirtas.';

// The obligation titles of the seven findings
const T = {
  safeguarding: 'Apsaugoti klientų kriptoturtą ir lėšas',
  register: 'Tvarkyti IRT paslaugų sutarčių informacijos registrą',
  incidents: 'Pranešti apie didelius su IRT susijusius incidentus',
  aiRisk: 'Įvertinti, ar naudojama DI sistema yra didelės rizikos',
  licence: 'Gauti kriptoturto paslaugų teikėjo leidimą',
  amlOfficer: 'Paskirti už pinigų plovimo prevenciją atsakingą vadovą',
  correspondent: 'Taikyti sustiprintą tapatybės nustatymą korespondentiniams santykiams',
};

const ACTION_TWO = 'Užbaigti IRT paslaugų sutarčių registrą ir incidentų pranešimo procedūrą';

// The policy's text as GET /api/documents/{id}/text serves it
const POLICY_TEXT = f.documentText(f.ID.policyDoc).text;

// A long policy: two and a quarter text pages of filler,
// then the section a finding cites (its spaces and line
// break not the quote's), then more — so the passage sits on
// the third page, 40 000–60 000
const QUOTE = 'Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką.';
const LONG_TEXT = `${'Bendroji nuostata. '.repeat(2400).slice(0, 45000)}7.2. Atitikties pareigūnas\n`
  + 'Atitikties pareigūnas  kas ketvirtį\nteikia valdybai ataskaitą apie atitikties riziką.\n'
  + 'Baigiamoji nuostata. '.repeat(1000);
const LONG_AT = LONG_TEXT.indexOf('7.2. Atitikties pareigūnas');







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderFindings: the report page on its findings tab (the
// review dialog and the document drawer live in the page).
// cardOf: a finding's card, found by its title. shownTitles:
// the titles of the cards mounted, in order (a folded group
// mounts none — openFolded opens every folded group first;
// groupHeaders tells open from closed). groupHeaders: the
// accordion headers — title, counts and state. many: a
// report of n more findings in the MiCA group (all "not met",
// so the group opens), titled "Pareiga 1…n", each citing the
// licence extract as a document.
// statefulReport: a double that REMEMBERS a review —
// the PATCH answers the reviewed finding (the cause as sent,
// kept when the request does not name it) and, as the view
// does, withdraws the report's approval; the next GET of the
// report says so.
// renderOwn: the findings tab of the report that also
// assessed the company's own requirements. headings: the
// titles of an expanded card's blocks, in order. blockText:
// the exact text under one of them — no-break spaces kept,
// which Testing Library's own matchers read as plain ones.
// withVerdict: the finished report with one finding's
// verdict overridden.
// -----------------------------------------------------------

function renderFindings(options = {}) {
  return renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportDone}?tab=findings`, path: '/reports/:reportId', ...options });
}

function renderOwn(options = {}) {
  return renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportOwn}?tab=findings`, path: '/reports/:reportId', ...options });
}

const headings = (card) => within(card).getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent);

const blockText = (card, title) => within(card).getByRole('heading', { level: 4, name: title }).nextElementSibling.textContent;

const withVerdict = (id, status) => ({
  ...DONE,
  findings: DONE.findings.map((row) => (row.id === id ? { ...row, overrideStatus: status, effectiveStatus: status } : row)),
});

const disclosure = (title, state = 'Show') => screen.getByRole('button', { name: `${title} — ${state} the finding's details` });

const cardOf = (title) => screen.getByText(title, { selector: 'span' }).closest('[id^="finding-"]');

const shownTitles = () => [...document.querySelectorAll('[id^="finding-"] button[aria-expanded]')]
  .map((button) => button.getAttribute('aria-label').replace(/ — (Show|Hide) the finding's details$/, ''));

const groupHeaders = () => [...document.querySelectorAll('.MuiAccordionSummary-root')]
  .map((button) => `${button.textContent} [${button.getAttribute('aria-expanded') === 'true' ? 'open' : 'closed'}]`);

const toggle = (name) => screen.getByRole('button', { name });

async function openFolded(user) {
  for (const header of [...document.querySelectorAll('.MuiAccordionSummary-root[aria-expanded="false"]')]) await user.click(header);
}

const LICENCE_FINDING = DONE.findings.find((row) => row.id === f.ID.findingLicence);

function many(n, extra = {}) {
  const generated = Array.from({ length: n }, (_, i) => ({
    ...LICENCE_FINDING, id: `gen-${i + 1}`, obligationTitle: `Pareiga ${i + 1}`, status: 'missing', effectiveStatus: 'missing',
  }));
  return { ...DONE, findings: generated, ...extra };
}

function statefulReport() {
  let current = structuredClone(DONE);
  const patches = [];
  server.use(
    http.get(url('/api/reports/:reportId'), () => HttpResponse.json(current)),
    http.patch(url('/api/reports/:reportId/findings/:findingId'), async ({ params, request }) => {
      const body = await request.json();
      patches.push({ findingId: params.findingId, body });
      const before = current.findings.find((row) => row.id === params.findingId);
      const override = 'overrideStatus' in body ? body.overrideStatus : before.overrideStatus;
      const after = {
        ...before, overrideStatus: override, effectiveStatus: override || before.status,
        reviewerNote: body.reviewerNote ?? before.reviewerNote, cause: 'cause' in body ? body.cause ?? '' : before.cause,
        reviewedBy: f.me.id, reviewedAt: f.NOW,
      };
      current = {
        ...current, approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
        findings: current.findings.map((row) => (row.id === after.id ? after : row)),
      };
      return HttpResponse.json(after);
    }),
  );
  return patches;
}

// The finished report with the incidents finding citing a
// passage of the policy instead of the register
const citing = (passage) => ({
  ...DONE,
  findings: DONE.findings.map((row) => (row.id === f.ID.findingIncidents
    ? { ...row, evidence: [{ kind: 'passage', id: f.ID.policyDoc, chunk: 25, title: 'Atitikties politika', documentId: f.ID.policyDoc, ...passage }] }
    : row)),
});

// The policy as LONG_TEXT: its detail and text windows
function serveLongPolicy() {
  given.json('get', '/api/documents/:documentId', { ...f.companyDocument(f.ID.policyDoc), charCount: LONG_TEXT.length });
  server.use(http.get(url('/api/documents/:documentId/text'), ({ request }) => {
    const query = new URL(request.url).searchParams;
    const offset = Number(query.get('offset'));
    const limit = Number(query.get('limit'));
    return HttpResponse.json({ id: f.ID.policyDoc, title: 'Atitikties politika', offset, limit, total: LONG_TEXT.length, extractionStatus: 'done', text: LONG_TEXT.slice(offset, offset + limit) });
  }));
}

// Opens the incidents finding's (only) evidence link
async function openCitedDocument(user, title = 'Atitikties politika') {
  await screen.findByText('Showing 7 of 7');
  await user.click(disclosure(T.incidents));
  await user.click(within(cardOf(T.incidents)).getByRole('button', { name: title }));
  return screen.findByRole('dialog', { name: title });
}

async function openReview(user, title) {
  await user.click(within(cardOf(title)).getByRole('button', { name: 'Review' }));
  return screen.findByRole('dialog', { name: 'Review the finding' });
}







// -----------------------------------------------------------
// Groups and cards
// -----------------------------------------------------------

describe('ReportFindings — groups and cards', () => {

  it('groups by legal act, the act with the worst verdict first, and opens only the groups with open findings', async () => {
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    expect(groupHeaders()).toEqual([
      'MiCAFindings: 2 · open: 1 [open]',
      'DORAFindings: 2 · open: 2 [open]',
      'DI aktasFindings: 1 · open: 0 [closed]',
      'PPTFPĮFindings: 2 · open: 0 [closed]',
    ]);
    // A folded group mounts no cards at all
    expect(shownTitles()).toEqual([T.safeguarding, T.licence, T.register, T.incidents]);
  });


  it('a closed group opens on a click and folds again', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const pptfpi = screen.getByRole('button', { name: /^PPTFPĮ/ });
    expect(pptfpi).toHaveAttribute('aria-expanded', 'false');
    await user.click(pptfpi);
    expect(pptfpi).toHaveAttribute('aria-expanded', 'true');
    await user.click(pptfpi);
    expect(pptfpi).toHaveAttribute('aria-expanded', 'false');
  });


  it('a card shows the effective verdict, the severity and the domain — the override marked "Reviewed" with the model\'s verdict', async () => {
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    const register = cardOf(T.register);
    expect(within(register).getByText('Partial')).toBeInTheDocument();
    expect(within(register).queryByText('Not met')).toBeNull();
    expect(within(register).getByText('Medium')).toBeInTheDocument();
    expect(within(register).getByText('Outsourcing')).toBeInTheDocument();
    expect(within(register).getByText('Reviewed')).toBeInTheDocument();
    // The tooltip names the model's own verdict
    expect(within(register).getByLabelText('The status was changed by a reviewer. AI assessment: Not met.')).toBeInTheDocument();

    const safeguarding = cardOf(T.safeguarding);
    expect(within(safeguarding).getByText('Not met')).toBeInTheDocument();
    expect(within(safeguarding).getByText('High')).toBeInTheDocument();
    expect(within(safeguarding).queryByText('Reviewed')).toBeNull();
  });


  it('marks the findings resting on an obligation no person approved yet', async () => {
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    const hint = 'This obligation was extracted by the AI and not yet approved by a person — weigh it with care.';
    expect(within(cardOf(T.register)).getByLabelText(hint)).toHaveTextContent('Unreviewed obligation');
    expect(within(cardOf(T.incidents)).getByLabelText(hint)).toBeInTheDocument();
    expect(within(cardOf(T.safeguarding)).queryByText('Unreviewed obligation')).toBeNull();
    expect(within(cardOf(T.licence)).queryByText('Unreviewed obligation')).toBeNull();
  });


  it('the disclosure opens the obligation, the assessment, the evidence, the recommendation, the deadline and the reviewer\'s note', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const button = disclosure(T.register);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(disclosure(T.register, 'Hide')).toHaveAttribute('aria-expanded', 'true');
    const card = cardOf(T.register);
    expect(within(card).getAllByRole('heading', { level: 4 }).map((h) => h.textContent))
      .toEqual(['Obligation', 'Assessment', 'Evidence', 'Recommendation', 'Deadline', 'Reviewer\'s note']);
    expect(within(card).getByText(/^Finansų subjektas tvarko ir atnaujina informacijos registrą/)).toBeInTheDocument();
    expect(within(card).getByText('Informacijos registro apie IRT paslaugų sutartis nepateikta.')).toBeInTheDocument();
    expect(within(card).getByText('No evidence found')).toBeInTheDocument();
    expect(within(card).getByText('Sudaryti informacijos registrą ir įtraukti visus IRT paslaugų teikėjus.')).toBeInTheDocument();
    expect(within(card).getByText('Nuolat; teikiamas priežiūros institucijai jos prašymu')).toBeInTheDocument();
    expect(within(card).getByText('Registras pradėtas pildyti 2026-09-20; trūksta dviejų IRT paslaugų teikėjų duomenų.')).toBeInTheDocument();
    expect(within(card).getByText('Reviewed 22/09/2026, 08:10')).toBeInTheDocument();

    await user.click(disclosure(T.register, 'Hide'));
    expect(within(card).queryByText('Informacijos registro apie IRT paslaugų sutartis nepateikta.')).toBeNull();
  });


  it('leaves out the blocks a finding has nothing for — no recommendation, no deadline, no review', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.licence));
    expect(within(cardOf(T.licence)).getAllByRole('heading', { level: 4 }).map((h) => h.textContent))
      .toEqual(['Obligation', 'Assessment', 'Evidence', 'Deadline']);
  });


  it('lists the evidence with its kind and quote; a credential or the profile is text, a document opens the drawer', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.licence));
    const card = cardOf(T.licence);
    expect(within(card).getByText('Licence / credential:', { exact: false })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Kriptoturto paslaugų teikėjo leidimas' })).toBeNull();
    expect(within(card).getByText('„Leidimo Nr. KTPT-2026-017, galioja nuo 2026-07-01“')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Leidimo išrašas' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Leidimo išrašas' })).toBeInTheDocument();
  });


  it('a passage opens its document in the drawer too', async () => {
    const calls = given.capture('get', '/api/documents/:documentId', f.companyDocument(f.ID.registerDoc));
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.incidents));
    const card = cardOf(T.incidents);
    expect(within(card).getByText('Document passage:', { exact: false })).toBeInTheDocument();
    expect(within(card).getByText('„2026-08-14;Mokėjimų sąsajos sutrikimas 2 val.;Didelis;Taip, per 4 val.“')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'IRT incidentų registras' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'IRT incidentų registras' })).toBeInTheDocument();
    expect(calls[0].url).toBe(`http://localhost:3000/api/documents/${f.ID.registerDoc}`);
    // At its place: the quoted row of the register is marked
    const dialog = screen.getByRole('dialog', { name: 'IRT incidentų registras' });
    expect(await within(dialog).findByText('2026-08-14;Mokėjimų sąsajos sutrikimas 2 val.;Didelis;Taip, per 4 val.', { selector: 'mark' })).toBeInTheDocument();
  });


  it('a passage deep in a long document opens the page of text holding it — not the top — its quote marked and scrolled into view', async () => {
    given.json('get', '/api/reports/:reportId', citing({ charStart: LONG_AT, quote: QUOTE }));
    serveLongPolicy();
    const windows = given.spy('get', '/api/documents/:documentId/text');
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { user } = renderFindings();
    const dialog = await openCitedDocument(user);
    // Found across the text's own spacing and line break
    const mark = await within(dialog).findByText(QUOTE, { selector: 'mark' });
    expect(windows.map((call) => call.query)).toEqual([{ offset: '40000', limit: '20000' }]);
    expect(within(dialog).getByText(`40,001–60,000 of ${LONG_TEXT.length.toLocaleString('en-GB')} characters`)).toBeInTheDocument();
    expect(within(dialog).getByText('Highlighted: the passage the finding cites as evidence.')).toBeInTheDocument();
    // The heading leading up to it is on the page too
    expect(mark.parentElement.textContent).toContain('7.2. Atitikties pareigūnas\nAtitikties pareigūnas  kas');
    await waitFor(() => expect(scrolled.mock.contexts).toContain(mark));
  });


  it('turning the page away and back keeps the mark on its page, and does not pull the reader back to it', async () => {
    given.json('get', '/api/reports/:reportId', citing({ charStart: LONG_AT, quote: QUOTE }));
    serveLongPolicy();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { user } = renderFindings();
    const dialog = await openCitedDocument(user);
    await within(dialog).findByText(QUOTE, { selector: 'mark' });
    const marksScrolled = () => scrolled.mock.contexts.filter((element) => element.tagName === 'MARK').length;
    await waitFor(() => expect(marksScrolled()).toBe(1));

    await user.click(within(dialog).getByRole('button', { name: 'Previous page' }));
    await within(dialog).findByText(/^20,001–40,000 of/);
    expect(dialog.querySelector('mark')).toBeNull();
    expect(within(dialog).queryByText('Highlighted: the passage the finding cites as evidence.')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Next page' }));
    expect(await within(dialog).findByText(QUOTE, { selector: 'mark' })).toBeInTheDocument();
    expect(marksScrolled()).toBe(1);
  });


  it('a quote found away from where its passage starts (the document was re-indexed since) is still what gets marked', async () => {
    // The page starts 5 000 characters before the quote — out
    // of reach of the passage's own span
    given.json('get', '/api/reports/:reportId', citing({ charStart: 40000, quote: QUOTE }));
    serveLongPolicy();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { user } = renderFindings();
    const dialog = await openCitedDocument(user);
    const mark = await within(dialog).findByText(QUOTE, { selector: 'mark' });
    await waitFor(() => expect(scrolled.mock.contexts).toContain(mark));
  });


  it('a passage whose quote the text does not hold marks the line the passage starts on', async () => {
    given.json('get', '/api/reports/:reportId', citing({ charStart: POLICY_TEXT.indexOf('7.2. Atitikties pareigūnas'), quote: 'Atitikties pareigūnas atsiskaito kas mėnesį.' }));
    const windows = given.spy('get', '/api/documents/:documentId/text');
    const { user } = renderFindings();
    const dialog = await openCitedDocument(user);
    expect(await within(dialog).findByText('7.2. Atitikties pareigūnas', { selector: 'mark' })).toBeInTheDocument();
    expect(windows.map((call) => call.query.offset)).toEqual(['0']);
    expect(within(dialog).getByText('Highlighted: the passage the finding cites as evidence.')).toBeInTheDocument();
  });


  it('a passage without its place — its chunk is gone, or the answer predates charStart — opens the document at its top, unmarked', async () => {
    const quote = 'Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką.';
    for (const passage of [{ charStart: null, quote }, { quote }, { charStart: '328', quote }, { charStart: -1, quote }]) {
      given.json('get', '/api/reports/:reportId', citing(passage));
      const windows = given.spy('get', '/api/documents/:documentId/text');
      const { user, unmount } = renderFindings();
      const dialog = await openCitedDocument(user);
      await within(dialog).findByText(/^1–601 of 601 characters$/);
      expect(windows.map((call) => call.query.offset), JSON.stringify(passage)).toEqual(['0']);
      expect(dialog.querySelector('mark')).toBeNull();
      expect(within(dialog).queryByText('Highlighted: the passage the finding cites as evidence.')).toBeNull();
      unmount();
      // Each case is a first visit: the card expanded above is
      // remembered for the tab otherwise
      sessionStorage.clear();
    }
  });


  it('a whole document opens at its top, unmarked, even when a passage was open before', async () => {
    given.json('get', '/api/reports/:reportId', citing({ charStart: POLICY_TEXT.indexOf('7.2. Atitikties pareigūnas'), quote: QUOTE }));
    const { user } = renderFindings();
    let dialog = await openCitedDocument(user);
    await within(dialog).findByText(QUOTE, { selector: 'mark' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(disclosure(T.licence));
    await user.click(within(cardOf(T.licence)).getByRole('button', { name: 'Leidimo išrašas' }));
    dialog = await screen.findByRole('dialog', { name: 'Leidimo išrašas' });
    await within(dialog).findByText(/^1–\d+ of \d+ characters$/);
    expect(dialog.querySelector('mark')).toBeNull();
  });


  it('shows a finding without an id, or repeating one, like any other — React is left no key to trip on', async () => {
    const findings = DONE.findings.map((row, index) => ({ ...row, id: index === 0 ? undefined : (index % 2 ? 'same' : row.id) }));
    given.json('get', '/api/reports/:reportId', { ...DONE, findings });
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await openFolded(user);
    await waitFor(() => expect(shownTitles()).toHaveLength(7));
    expect(shownTitles()).toEqual(expect.arrayContaining(Object.values(T)));
  });


  it('links each citation to the provision in the corpus and to the official text in a new window', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const card = cardOf(T.safeguarding);
    const unit = within(card).getByRole('link', { name: 'Open the provision in the corpus: MiCA 70 str. 1 d.' });
    expect(unit).toHaveAttribute('href', `/corpus/${f.ID.mica}?unit=${f.ID.micaV1Art70Par1}`);
    const official = within(card).getByRole('link', { name: 'Official text (opens in a new window): MiCA 70 str. 1 d.' });
    expect(official).toHaveAttribute('href', 'https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32023R1114#art_70');
    expect(official).toHaveAttribute('target', '_blank');
    expect(official).toHaveAttribute('rel', 'noopener noreferrer');
    await user.click(unit);
    expect(await screen.findByTestId('navigated-away')).toHaveTextContent(`/corpus/${f.ID.mica}?unit=${f.ID.micaV1Art70Par1}`);
  });


  it('a Lithuanian act\'s citation leads to its e-TAR page', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(screen.getByRole('button', { name: /^PPTFPĮ/ }));
    const card = await waitFor(() => cardOf(T.amlOfficer));
    expect(within(card).getByRole('link', { name: 'Official text (opens in a new window): PPTFPĮ 22 str. 3 d.' }))
      .toHaveAttribute('href', 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90');
  });


  it('groups by domain on request, the domains with open findings first', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(toggle('Domain'));
    await waitFor(() => expect(groupHeaders()).toEqual([
      'Safeguarding of client fundsFindings: 1 · open: 1 [open]',
      'OutsourcingFindings: 1 · open: 1 [open]',
      'Incident reportingFindings: 1 · open: 1 [open]',
      'AI governanceFindings: 1 · open: 0 [closed]',
      'LicensingFindings: 1 · open: 0 [closed]',
      'AML/CTF and KYCFindings: 2 · open: 0 [closed]',
    ]));
    expect(toggle('Domain')).toHaveAttribute('aria-pressed', 'true');
    // A second click on the pressed grouping keeps it
    await user.click(toggle('Domain'));
    expect(toggle('Domain')).toHaveAttribute('aria-pressed', 'true');
  });


  it('says "No findings." for a report without any, without the filters', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, findings: [] });
    renderFindings();
    expect(await screen.findByText('No findings.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search the findings' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Findings (0)' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Cause and consequence
// -----------------------------------------------------------

describe('ReportFindings — the cause and the consequence of a finding', () => {

  it('a gap says what a breach can cost, in the exports\' words to the character, once with the note that it is a ceiling — after the assessment', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.safeguarding));
    const card = cardOf(T.safeguarding);
    expect(headings(card)).toEqual(['Obligation', 'Assessment', 'Consequence', 'Evidence', 'Recommendation', 'Deadline']);
    expect(blockText(card, 'Consequence')).toBe(SAFEGUARDING_COST);
    expect(within(card).getAllByText(CEILING)).toHaveLength(1);
  });


  it('the cause a reviewer wrote stands between the assessment and the consequence', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.incidents));
    const card = cardOf(T.incidents);
    expect(headings(card)).toEqual(['Obligation', 'Assessment', 'Cause', 'Consequence', 'Evidence', 'Recommendation', 'Deadline', 'Reviewer\'s note']);
    expect(blockText(card, 'Cause')).toBe(CAUSE);
    // A tier without a fine is its measures alone
    expect(blockText(card, 'Consequence')).toBe('an order to end the breach, a public statement on the breach (DORA 50 str. 4 d.)');
    expect(within(card).getAllByText(CEILING)).toHaveLength(1);
    expect(within(card).getByText('Reviewed 22/09/2026, 08:12')).toBeInTheDocument();
  });


  it('a finding without a cause or a tier shows neither row — the register gap stands under no sanction', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.register));
    const card = cardOf(T.register);
    expect(headings(card)).not.toContain('Cause');
    expect(headings(card)).not.toContain('Consequence');
    expect(within(card).queryByText(CEILING)).toBeNull();
  });


  it('a duty that is met shows no consequence, whatever tiers the report kept on it', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    // The licence finding carries MiCA's graver tier
    expect(DONE.findings.find((row) => row.id === f.ID.findingLicence).consequence).toHaveLength(1);
    await user.click(disclosure(T.licence));
    expect(headings(cardOf(T.licence))).toEqual(['Obligation', 'Assessment', 'Evidence', 'Deadline']);
    expect(within(cardOf(T.licence)).queryByText(CEILING)).toBeNull();
  });


  it('follows the reviewer: a met duty set to "not met" shows its tier — a fraction with its decimal point — and a gap set to met loses it', async () => {
    given.json('get', '/api/reports/:reportId', withVerdict(f.ID.findingLicence, 'missing'));
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.licence));
    expect(blockText(cardOf(T.licence), 'Consequence')).toBe(
      `a fine of up to 5${NBSP}000${NBSP}000 EUR or 12.5${NBSP}% of annual turnover (income) or 2 times the benefit gained or loss avoided; `
      + 'also: an order to end the breach, a public statement on the breach, removal of managers or a ban on management functions (MiCA 111 str. 2 d. d p.; 3 d. d p.)',
    );
  });


  it('a gap a reviewer set to met says no more what a breach would cost', async () => {
    given.json('get', '/api/reports/:reportId', withVerdict(f.ID.findingSafeguarding, 'met'));
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(screen.getByRole('button', { name: /^MiCA/ }));
    await user.click(disclosure(T.safeguarding));
    expect(headings(cardOf(T.safeguarding))).toEqual(['Obligation', 'Assessment', 'Evidence', 'Recommendation', 'Deadline']);
  });


  it('"not evidenced" is a gap too: the AI finding says what the AI Act provides', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(screen.getByRole('button', { name: /^DI aktas/ }));
    await user.click(disclosure(T.aiRisk));
    expect(blockText(cardOf(T.aiRisk), 'Consequence')).toBe(`a fine of up to 15${NBSP}000${NBSP}000 EUR or 3${NBSP}% of annual turnover (income) (DI aktas 99 str. 4 d.)`);
  });


  it('a finding of an act that applies later shows no consequence beside "preparation" — even when an older report kept one on it', async () => {
    const today = reportToday();
    // Derived from the incidents finding: the cause and the tier travel with it
    expect(today.findings.find((row) => row.id === AMLR_GAP).consequence).toHaveLength(1);
    given.json('get', '/api/reports/:reportId', today);
    const { user } = renderFindings();
    await screen.findByText('Showing 8 of 8');
    await user.click(screen.getByRole('button', { name: /^AMLR/ }));
    const card = await waitFor(() => document.getElementById(`finding-${AMLR_GAP}`));
    await user.click(within(card).getByRole('button', { name: /Show the finding's details$/ }));
    expect(headings(card)).toEqual(['Obligation', 'Assessment', 'Cause', 'Evidence', 'Recommendation', 'Deadline', 'Reviewer\'s note']);
    expect(within(card).queryByText(CEILING)).toBeNull();
  });


  it('speaks Lithuanian: "Priežastis", "Pasekmė" in the export\'s Lithuanian words, the decimal a comma', async () => {
    given.json('get', '/api/reports/:reportId', {
      ...DONE,
      findings: DONE.findings.map((row) => (row.id === f.ID.findingIncidents
        ? { ...row, consequence: DONE.findings.find((other) => other.id === f.ID.findingLicence).consequence } : row)),
    });
    const { user } = renderFindings({ locale: 'lt' });
    await screen.findByText('Rodoma 7 iš 7');
    await user.click(screen.getByRole('button', { name: `${T.incidents} — Rodyti išvados detales` }));
    const card = cardOf(T.incidents);
    expect(headings(card)).toEqual(['Pareiga', 'Vertinimas', 'Priežastis', 'Pasekmė', 'Įrodymai', 'Rekomendacija', 'Terminas', 'Peržiūrėtojo pastaba']);
    expect(blockText(card, 'Priežastis')).toBe(CAUSE);
    expect(blockText(card, 'Pasekmė')).toBe(
      `bauda iki 5${NBSP}000${NBSP}000 EUR arba 12,5${NBSP}% metinės apyvartos (pajamų) arba 2 kartų gautos naudos ar išvengtų nuostolių; `
      + 'taip pat: nurodymas nutraukti pažeidimą, viešas pranešimas apie pažeidimą, vadovų nušalinimas ar draudimas eiti pareigas (MiCA 111 str. 2 d. d p.; 3 d. d p.)',
    );
    expect(within(card).getAllByText('Didžiausia teisės akte numatyta riba, ne prognozė.')).toHaveLength(1);
  });
});







// -----------------------------------------------------------
// The company's own requirements
// -----------------------------------------------------------

describe('ReportFindings — the company\'s own requirements', () => {

  const OWN_GROUP = 'Vidaus reikalavimaiGaps between the company\'s policies and its procedures; not breaches of law · Findings: 3 · open: 2 [open]';
  const PASSAGE = 'Open the document at the cited passage: Atitikties politika 7.2 p.';


  it('form a group of their own after the acts, saying what they are — the other groups stay as they were', async () => {
    renderOwn();
    await screen.findByText('Showing 10 of 10');
    expect(groupHeaders()).toEqual([
      'MiCAFindings: 2 · open: 1 [open]',
      'DORAFindings: 2 · open: 2 [open]',
      'DI aktasFindings: 1 · open: 0 [closed]',
      'PPTFPĮFindings: 2 · open: 0 [closed]',
      OWN_GROUP,
    ]);
    expect(shownTitles().slice(-3)).toEqual([R.reports, R.risk, R.scope]);
  });


  it('a report without the group shows no such group — in either grouping', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    expect(groupHeaders().some((header) => header.startsWith('Vidaus reikalavimai'))).toBe(false);
    await user.click(toggle('Domain'));
    await waitFor(() => expect(groupHeaders()[0]).toMatch(/^Safeguarding of client funds/));
    expect(groupHeaders().some((header) => header.startsWith('Vidaus reikalavimai'))).toBe(false);
    expect(screen.queryByText(/not breaches of law/)).toBeNull();
  });


  it('grouped by domain they stay one group, the last — never spread among the breaches of law', async () => {
    const { user } = renderOwn();
    await screen.findByText('Showing 10 of 10');
    await user.click(toggle('Domain'));
    await waitFor(() => expect(groupHeaders()).toEqual([
      'Safeguarding of client fundsFindings: 1 · open: 1 [open]',
      'OutsourcingFindings: 1 · open: 1 [open]',
      'Incident reportingFindings: 1 · open: 1 [open]',
      'AI governanceFindings: 1 · open: 0 [closed]',
      'LicensingFindings: 1 · open: 0 [closed]',
      'AML/CTF and KYCFindings: 2 · open: 0 [closed]',
      OWN_GROUP,
    ]));
  });


  it('the filters reach them like any finding: "not met" leaves the safeguarding gap and the quarterly report', async () => {
    const { user } = renderOwn();
    await screen.findByText('Showing 10 of 10');
    await user.click(toggle('Not met (2)'));
    await screen.findByText('Showing 2 of 10');
    expect(shownTitles()).toEqual([T.safeguarding, R.reports]);
    expect(groupHeaders()).toEqual([
      'MiCAFindings: 1 · open: 1 [open]',
      'Vidaus reikalavimaiGaps between the company\'s policies and its procedures; not breaches of law · Findings: 1 · open: 1 [open]',
    ]);
  });


  it('cites the criterion as the policy and its section, which opens the company document at the quote — no link to the law', async () => {
    const calls = given.capture('get', '/api/documents/:documentId', f.companyDocument(f.ID.policyDoc));
    const { user } = renderOwn();
    await screen.findByText('Showing 10 of 10');
    const card = cardOf(R.reports);
    expect(within(card).queryByRole('link')).toBeNull();
    await user.click(within(card).getByRole('button', { name: PASSAGE }));
    const dialog = await screen.findByRole('dialog', { name: 'Atitikties politika' });
    expect(calls[0].url).toBe(`http://localhost:3000/api/documents/${f.ID.policyDoc}`);
    expect(await within(dialog).findByText('Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką.', { selector: 'mark' })).toBeInTheDocument();
    // The mark is the requirement itself, and the drawer says so — a criterion is not evidence
    expect(within(dialog).getByText('Highlighted: the passage that states the requirement the finding assesses.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Highlighted: the passage the finding cites as evidence.')).toBeNull();
  });


  it('a criterion whose quote has no place in the document is plain text', async () => {
    renderOwn();
    await screen.findByText('Showing 10 of 10');
    const card = cardOf(R.scope);
    expect(within(card).getByText('Atitikties politika 2 p.')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Atitikties politika 2 p\./ })).toBeNull();
    expect(within(card).queryByRole('link')).toBeNull();
  });


  it('a card speaks of a requirement, not an obligation, and of no sanction — the evidence still opens its document', async () => {
    const { user } = renderOwn();
    await screen.findByText('Showing 10 of 10');
    const card = cardOf(R.risk);
    await user.click(disclosure(R.risk));
    expect(headings(card)).toEqual(['Own requirement', 'Assessment', 'Evidence', 'Recommendation']);
    expect(within(card).queryByText(CEILING)).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Pinigų plovimo prevencijos procedūra' }));
    const drawer = await screen.findByRole('dialog', { name: 'Pinigų plovimo prevencijos procedūra' });
    expect(await within(drawer).findByText('Highlighted: the passage the finding cites as evidence.')).toBeInTheDocument();
  });


  it('never carries the "unreviewed" mark — there is no register to review a requirement in; the findings of the acts keep theirs', async () => {
    renderOwn();
    await screen.findByText('Showing 10 of 10');
    // No person approved any of the three requirements
    expect(OWN.findings.filter((row) => row.sourceKind === 'internal').map((row) => row.obligationReviewed)).toEqual([false, false, false]);
    for (const title of Object.values(R)) {
      expect(within(cardOf(title)).queryByText(/^Unreviewed/)).toBeNull();
      expect(within(cardOf(title)).queryByLabelText(/not yet approved by a person/)).toBeNull();
    }
    const hint = 'This obligation was extracted by the AI and not yet approved by a person — weigh it with care.';
    expect(within(cardOf(T.register)).getByLabelText(hint)).toHaveTextContent('Unreviewed obligation');
    expect(within(cardOf(T.incidents)).getByLabelText(hint)).toBeInTheDocument();
  });


  it('a review works on them like on any finding — the group\'s count follows', async () => {
    const patches = given.capture('patch', '/api/reports/:reportId/findings/:findingId',
      { ...OWN.findings.find((row) => row.id === f.ID.findingOwnReports), overrideStatus: 'met', effectiveStatus: 'met', reviewedBy: f.me.id, reviewedAt: f.NOW });
    const { user } = renderOwn();
    await screen.findByText('Showing 10 of 10');
    const dialog = await openReview(user, R.reports);
    await user.click(within(dialog).getByRole('radio', { name: 'Met' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(new URL(patches[0].url).pathname).toBe(`/api/reports/${f.ID.reportOwn}/findings/${f.ID.findingOwnReports}`);
    expect(patches[0].body).toEqual({ overrideStatus: 'met', reviewerNote: '' });
  });


  it('speaks Lithuanian: the group, the requirement, the way to the passage — and no "unreviewed" mark', async () => {
    const { user } = renderOwn({ locale: 'lt' });
    await screen.findByText('Rodoma 10 iš 10');
    expect(groupHeaders().at(-1)).toBe('Vidaus reikalavimaiSpragos tarp įmonės politikų ir procedūrų; ne teisės aktų pažeidimai · Išvadų: 3 · neįvykdytų: 2 [open]');
    const card = cardOf(R.reports);
    expect(within(card).queryByText(/^Nepatvirtint/)).toBeNull();
    expect(within(cardOf(T.register)).getByText('Nepatvirtinta pareiga')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Atidaryti dokumentą ties cituojama vieta: Atitikties politika 7.2 p.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `${R.reports} — Rodyti išvados detales` }));
    expect(headings(card)).toEqual(['Vidaus reikalavimas', 'Vertinimas', 'Įrodymai', 'Rekomendacija']);
  });
});







// -----------------------------------------------------------
// Filters and search
// -----------------------------------------------------------

describe('ReportFindings — filters and search', () => {

  it('counts every verdict and severity by effective status', async () => {
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    const statuses = within(screen.getByRole('group', { name: 'Status' })).getAllByRole('button').map((b) => b.textContent);
    expect(statuses).toEqual(['Not met (1)', 'Partial (2)', 'Not evidenced (1)', 'Met (2)', 'Not applicable (1)']);
    const severities = within(screen.getByRole('group', { name: 'Severity' })).getAllByRole('button').map((b) => b.textContent);
    expect(severities).toEqual(['Critical (1)', 'High (3)', 'Medium (2)', 'Low (1)']);
  });


  it('filters by effective status — the overridden register finding is "partial" — and several statuses add up', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(toggle('Partial (2)'));
    expect(toggle('Partial (2)')).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('Showing 2 of 7');
    expect(shownTitles()).toEqual([T.register, T.incidents]);
    await user.click(toggle('Not met (1)'));
    await screen.findByText('Showing 3 of 7');
    expect(shownTitles()).toEqual([T.safeguarding, T.register, T.incidents]);
  });


  it('status and severity narrow together', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(toggle('Partial (2)'));
    await user.click(toggle('High (3)'));
    await screen.findByText('Showing 1 of 7');
    expect(shownTitles()).toEqual([T.incidents]);
  });


  it('a filter keeps each group as the reader left it — open or closed — and recounts what it holds', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(toggle('Met (2)'));
    await screen.findByText('Showing 2 of 7');
    // MiCA was open (it held an open finding), PPTFPĮ closed
    expect(groupHeaders()).toEqual(['MiCAFindings: 1 · open: 0 [open]', 'PPTFPĮFindings: 1 · open: 0 [closed]']);
  });


  it('searches the titles, obligation texts, assessments and recommendations, case-insensitively', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const search = screen.getByRole('textbox', { name: 'Search the findings' });
    await user.type(search, 'INCIDENT');
    await screen.findByText('Showing 1 of 7');
    expect(shownTitles()).toEqual([T.incidents]);
    await user.clear(search);
    await user.type(search, 'kriptoturt');
    await screen.findByText('Showing 2 of 7');
    expect(shownTitles()).toEqual([T.safeguarding, T.licence]);
  });


  it('says so when nothing matches, and "Clear the filters" brings every finding back', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
    await user.click(toggle('Critical (1)'));
    await user.type(screen.getByRole('textbox', { name: 'Search the findings' }), 'nėra tokio');
    expect(await screen.findByText('No findings match the filters')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 7')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await screen.findByText('Showing 7 of 7');
    expect(screen.getByRole('textbox', { name: 'Search the findings' })).toHaveValue('');
    expect(toggle('Critical (1)')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
  });


  it('a search of blanks only is no filter', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.type(screen.getByRole('textbox', { name: 'Search the findings' }), '   ');
    await settle(50);
    expect(screen.getByText('Showing 7 of 7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Focus from the action plan
// -----------------------------------------------------------

describe('ReportFindings — the focus from the action plan', () => {

  it('"Related findings" on the plan opens the findings of that action with a note (role="status") and "Show all"', async () => {
    const { user, router } = renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportDone}?tab=plan`, path: '/reports/:reportId' });
    const plan = await screen.findByRole('list', { name: 'Action plan' });
    const action = within(plan).getByText(ACTION_TWO).closest('li');
    await user.click(within(action).getByRole('button', { name: 'Related findings (2)' }));

    expect(await screen.findByRole('tab', { name: 'Findings (7)', selected: true })).toBeInTheDocument();
    // The focus is in the address: Back and a reload keep it
    expect(router.state.location.search).toBe('?tab=findings&findings.action=e3000000-0000-4000-8000-000000000002');
    const note = screen.getAllByRole('status').find((element) => element.textContent.includes('Showing the findings of the action'));
    expect(note).toHaveTextContent(`Showing the findings of the action “${ACTION_TWO}”`);
    expect(screen.getByText('Showing 2 of 7')).toBeInTheDocument();
    expect(shownTitles()).toEqual([T.register, T.incidents]);

    await user.click(within(note).getByRole('button', { name: 'Show all' }));
    await screen.findByText('Showing 7 of 7');
    expect(screen.queryByText(/Showing the findings of the action/)).toBeNull();
    expect(router.state.location.search).toBe('?tab=findings');
  });


  it('the filters narrow within the focus', async () => {
    const { user } = renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportDone}?tab=plan`, path: '/reports/:reportId' });
    const plan = await screen.findByRole('list', { name: 'Action plan' });
    await user.click(within(within(plan).getByText(ACTION_TWO).closest('li')).getByRole('button', { name: 'Related findings (2)' }));
    await screen.findByText('Showing 2 of 7');
    await user.click(toggle('High (3)'));
    await screen.findByText('Showing 1 of 7');
    expect(shownTitles()).toEqual([T.incidents]);
  });


  it('as a component: no note without a focus, and the note\'s button hands the clearing back to the page', async () => {
    let cleared = 0;
    function FocusHarness() {
      const [focus, setFocus] = useState(null);
      return (
        <>
          <button type="button" onClick={() => setFocus({ ids: [f.ID.findingAiRisk], title: 'Vienas veiksmas' })}>Focus</button>
          <ReportFindings report={DONE} focus={focus} onClearFocus={() => { cleared += 1; setFocus(null); }} onReview={() => {}} onOpenDocument={() => {}} />
        </>
      );
    }
    const { user } = renderPage(<FocusHarness />);
    await screen.findByText('Showing 7 of 7');
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Focus' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Showing the findings of the action “Vienas veiksmas”');
    expect(screen.getByText('Showing 1 of 7')).toBeInTheDocument();
    expect(shownTitles()).toEqual([T.aiRisk]);
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(cleared).toBe(1);
    await screen.findByText('Showing 7 of 7');
  });
});







// -----------------------------------------------------------
// Preparation for a later act, and quotes without a place
// -----------------------------------------------------------

describe('ReportFindings — preparation and unplaced quotes', () => {

  // The finished report as a run makes it now, its two
  // findings of the AML regulation (which applies from
  // 2027-07-10) put FIRST in the list
  const TODAY = reportToday();
  const LATER_FIRST = { ...TODAY, findings: [...TODAY.findings.slice(-2), ...TODAY.findings.slice(0, -2)] };
  const tab = (report, options) => renderPage(
    <ReportFindings report={report} focus={null} onClearFocus={() => {}} onReview={() => {}} onOpenDocument={() => {}} />, options);
  const chipsOf = (id) => [...document.getElementById(`finding-${id}`).querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent);


  it('puts the act that applies later last, named with its date and folded — its open finding is no gap of today', async () => {
    tab(LATER_FIRST);
    await screen.findByText('Showing 8 of 8');
    expect(groupHeaders()).toEqual([
      'MiCAFindings: 2 · open: 1 [open]',
      'DORAFindings: 2 · open: 2 [open]',
      'PPTFPĮFindings: 2 · open: 0 [closed]',
      'AMLRApplies from 10/07/2027 — readiness · Findings: 2 · open: 1 [closed]',
    ]);
  });


  it('dates the cards of such an act, and no other', async () => {
    const { user } = tab(LATER_FIRST);
    await screen.findByText('Showing 8 of 8');
    await user.click(screen.getByRole('button', { name: /^AMLR/ }));
    expect(chipsOf(AMLR_GAP)).toContain('Applies from 10/07/2027');
    expect(chipsOf(AMLR_MET)).toContain('Applies from 10/07/2027');
    expect(chipsOf(f.ID.findingSafeguarding)).not.toContain('Applies from 10/07/2027');
    await user.hover(within(document.getElementById(`finding-${AMLR_GAP}`)).getByText('Applies from 10/07/2027'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('This act does not apply to the company yet: the finding shows readiness, not a gap of today.');
  });


  it('grouped by domain the dated cards stand among the others — a domain has no date', async () => {
    const { user } = tab(LATER_FIRST, { route: '/?findings.group=category' });
    await screen.findByText('Showing 8 of 8');
    expect(groupHeaders().some((header) => /Applies from/.test(header))).toBe(false);
    await openFolded(user);
    expect(chipsOf(AMLR_GAP)).toContain('Applies from 10/07/2027');
  });


  it('says under a quote that the document does not hold it word for word — and only there', async () => {
    const passage = { kind: 'passage', id: f.ID.policyDoc, documentId: f.ID.policyDoc, title: 'Atitikties politika', quote: 'Pareigūnas atsiskaito valdybai.' };
    const finding = {
      ...TODAY.findings[0],
      evidence: [{ ...passage, charStart: null }, { ...passage, charStart: 12 },
        { kind: 'credential', id: 'c1', title: 'Leidimas', quote: 'Leidimo Nr. KTPT-2026-017' }],
    };
    const { user } = tab({ ...TODAY, findings: [finding] });
    await user.click(disclosure(finding.obligationTitle));
    const entries = within(document.getElementById(`finding-${finding.id}`)).getAllByRole('listitem')
      .filter((item) => item.querySelector('blockquote'));
    expect(entries.map((item) => Boolean(within(item).queryByText('This quote could not be found word for word in the document — check it against the document.'))))
      .toEqual([true, false, false]);
  });


  it('speaks Lithuanian', async () => {
    const { user } = tab(LATER_FIRST, { locale: 'lt' });
    await screen.findByText('Rodoma 8 iš 8');
    expect(groupHeaders().at(-1)).toBe('AMLRTaikomas nuo 2027-07-10 — pasirengimas · Išvadų: 2 · neįvykdytų: 1 [closed]');
    await user.click(screen.getByRole('button', { name: /^AMLR/ }));
    expect(chipsOf(AMLR_GAP)).toContain('Taikoma nuo 2027-07-10');
  });
});







// -----------------------------------------------------------
// The review
// -----------------------------------------------------------

describe('FindingReviewDialog — the reviewer\'s verdict', () => {

  it('shows the finding, the model\'s verdict and "Keep the AI assessment" picked for an unreviewed finding', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.safeguarding);
    expect(within(dialog).getByText(T.safeguarding)).toBeInTheDocument();
    expect(within(dialog).getByText('AI assessment:')).toBeInTheDocument();
    expect(within(dialog).getByText('Not met', { selector: '.MuiChip-label' })).toBeInTheDocument();
    const decision = within(dialog).getByRole('radiogroup');
    expect(within(decision).getAllByRole('radio').map((radio) => radio.closest('label').textContent))
      .toEqual(['Keep the AI assessment', 'Not met', 'Partial', 'Not evidenced', 'Met', 'Not applicable']);
    expect(within(dialog).getByRole('radio', { name: 'Keep the AI assessment' })).toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: 'Note' })).toHaveValue('');
    expect(within(dialog).getByText('Why the assessment was changed or confirmed — the report\'s readers and the export show it.')).toBeInTheDocument();
  });


  it('overrides: PATCHes {overrideStatus, reviewerNote}, toasts, the card shows the new verdict — and the approval is withdrawn', async () => {
    const patches = statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    // Approved before the review
    expect(screen.getAllByRole('status').some((element) => element.textContent.includes('Approved by Rūta Administratorė'))).toBe(true);
    const dialog = await openReview(user, T.safeguarding);
    await user.click(within(dialog).getByRole('radio', { name: 'Met' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Politika patvirtinta 2026-09-25.');
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ findingId: f.ID.findingSafeguarding, body: { overrideStatus: 'met', reviewerNote: 'Politika patvirtinta 2026-09-25.' } });
    expect(await screen.findByText('Review saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const card = cardOf(T.safeguarding);
    await waitFor(() => expect(within(card).getByText('Met')).toBeInTheDocument());
    expect(within(card).getByLabelText('The status was changed by a reviewer. AI assessment: Not met.')).toBeInTheDocument();
    expect(toggle('Not met (0)')).toBeInTheDocument();
    expect(toggle('Met (3)')).toBeInTheDocument();
    // The server withdrew the sign-off; the re-read report says so
    expect(await screen.findByRole('button', { name: 'Approve the report' })).toBeInTheDocument();
    expect(screen.queryByText(/Approved by/)).toBeNull();
    expect(screen.queryByText('Approved', { selector: '.MuiChip-label' })).toBeNull();
  });


  it('an override moves the summary tiles too — the reviewer\'s verdict wins everywhere', async () => {
    statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.safeguarding);
    await user.click(within(dialog).getByRole('radio', { name: 'Met' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Summary' }));
    const panel = await screen.findByRole('tabpanel', { name: 'Summary' });
    const tile = within(panel).getByText('Not met', { selector: 'p' }).closest('.MuiPaper-root');
    await waitFor(() => expect(tile).toHaveTextContent('Not met0'));
  });


  it('clears an override: the reviewed finding opens with its verdict and note, "Keep the AI assessment" sends null', async () => {
    const patches = statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.register);
    expect(within(dialog).getByRole('radio', { name: 'Partial' })).toBeChecked();
    expect(within(dialog).getByText('Not met', { selector: '.MuiChip-label' })).toBeInTheDocument();
    const note = within(dialog).getByRole('textbox', { name: 'Note' });
    expect(note).toHaveValue('Registras pradėtas pildyti 2026-09-20; trūksta dviejų IRT paslaugų teikėjų duomenų.');
    await user.click(within(dialog).getByRole('radio', { name: 'Keep the AI assessment' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ overrideStatus: null, reviewerNote: 'Registras pradėtas pildyti 2026-09-20; trūksta dviejų IRT paslaugų teikėjų duomenų.' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const card = cardOf(T.register);
    await waitFor(() => expect(within(card).getByText('Not met')).toBeInTheDocument());
    expect(within(card).queryByText('Reviewed')).toBeNull();
    expect(toggle('Not met (2)')).toBeInTheDocument();
  });


  it('opening another finding loads its own review, not the last one\'s', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    let dialog = await openReview(user, T.register);
    expect(within(dialog).getByRole('textbox', { name: 'Note' })).not.toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openReview(user, T.incidents);
    expect(within(dialog).getByText(T.incidents)).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Keep the AI assessment' })).toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: 'Note' })).toHaveValue('');
  });


  it('a refused review says why inside the dialog, without a toast, and keeps what was typed', async () => {
    given.apiError('patch', '/api/reports/:reportId/findings/:findingId', 'FORBIDDEN', { status: 403 });
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.incidents);
    await user.click(within(dialog).getByRole('radio', { name: 'Met' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Procedūra patvirtinta');
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You are not allowed to do this.');
    expect(screen.getAllByText('You are not allowed to do this.')).toHaveLength(1);
    expect(within(dialog).getByRole('radio', { name: 'Met' })).toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: 'Note' })).toHaveValue('Procedūra patvirtinta');
  });


  it('Cancel sends nothing and leaves the finding as it was', async () => {
    const patches = given.capture('patch', '/api/reports/:reportId/findings/:findingId', {});
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.safeguarding);
    await user.click(within(dialog).getByRole('radio', { name: 'Met' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches).toHaveLength(0);
    expect(within(cardOf(T.safeguarding)).getByText('Not met')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The cause, in the review
// -----------------------------------------------------------

describe('FindingReviewDialog — the cause of a gap', () => {

  const HINT = 'Why the gap exists — written by the reviewer; the system never writes a cause.';
  const WRITTEN = 'Politika rengta prieš MiCA įsigaliojimą ir nuo tada neatnaujinta.';


  it('offers the cause as a field of its own, under the note: empty for a finding without one, loaded for one with', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    let dialog = await openReview(user, T.safeguarding);
    const field = within(dialog).getByRole('textbox', { name: 'Cause' });
    expect(field).toHaveValue('');
    expect(field).toHaveAccessibleDescription(HINT);
    expect(within(dialog).getAllByRole('textbox').map((box) => box.labels[0].textContent)).toEqual(['Note', 'Cause']);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openReview(user, T.incidents);
    expect(within(dialog).getByRole('textbox', { name: 'Cause' })).toHaveValue(CAUSE);
  });


  it('saves a cause alone — no override, no note: PATCH {overrideStatus: null, reviewerNote: "", cause}, and the card shows it', async () => {
    const patches = statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.safeguarding);
    await user.type(within(dialog).getByRole('textbox', { name: 'Cause' }), `  ${WRITTEN} `);
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    // Trimmed, as the backend stores it
    expect(patches[0]).toEqual({ findingId: f.ID.findingSafeguarding, body: { overrideStatus: null, reviewerNote: '', cause: WRITTEN } });
    expect(await screen.findByText('Review saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const card = cardOf(T.safeguarding);
    // The verdict is the model's still — a cause is no override
    expect(within(card).getByText('Not met')).toBeInTheDocument();
    expect(within(card).queryByText('Reviewed')).toBeNull();
    await user.click(disclosure(T.safeguarding));
    expect(headings(card)).toEqual(['Obligation', 'Assessment', 'Cause', 'Consequence', 'Evidence', 'Recommendation', 'Deadline', 'Reviewer\'s note']);
    expect(blockText(card, 'Cause')).toBe(WRITTEN);
    // Like an override, a cause withdraws the sign-off
    expect(await screen.findByRole('button', { name: 'Approve the report' })).toBeInTheDocument();
  });


  it('clearing the cause sends null and takes the row off the card', async () => {
    const patches = statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(disclosure(T.incidents));
    expect(headings(cardOf(T.incidents))).toContain('Cause');
    const dialog = await openReview(user, T.incidents);
    await user.clear(within(dialog).getByRole('textbox', { name: 'Cause' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ overrideStatus: null, reviewerNote: '', cause: null });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(headings(cardOf(T.incidents))).not.toContain('Cause'));
    expect(headings(cardOf(T.incidents))).toContain('Consequence');
  });


  it('a review that leaves the cause alone does not name it — the verdict changes, the cause stays', async () => {
    const patches = statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.incidents);
    await user.click(within(dialog).getByRole('radio', { name: 'Not met' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ overrideStatus: 'missing', reviewerNote: '' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(disclosure(T.incidents));
    expect(blockText(cardOf(T.incidents), 'Cause')).toBe(CAUSE);
  });


  it('saves the cause with an override and a note in the one request', async () => {
    const patches = statefulReport();
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.safeguarding);
    await user.click(within(dialog).getByRole('radio', { name: 'Partial' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Tvarka rengiama.');
    await user.type(within(dialog).getByRole('textbox', { name: 'Cause' }), WRITTEN);
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ overrideStatus: 'partial', reviewerNote: 'Tvarka rengiama.', cause: WRITTEN });
  });


  it('takes no more than the 2000 characters the backend keeps', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    const dialog = await openReview(user, T.safeguarding);
    const field = within(dialog).getByRole('textbox', { name: 'Cause' });
    await user.click(field);
    await user.paste('a'.repeat(2100));
    expect(field.value).toHaveLength(2000);
  });


  it('a refused save keeps the cause typed, and another finding\'s dialog does not inherit it', async () => {
    given.apiError('patch', '/api/reports/:reportId/findings/:findingId', 'INVALID_FIELD', { status: 400 });
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    let dialog = await openReview(user, T.safeguarding);
    await user.type(within(dialog).getByRole('textbox', { name: 'Cause' }), WRITTEN);
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Cause' })).toHaveValue(WRITTEN);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openReview(user, T.register);
    expect(within(dialog).getByRole('textbox', { name: 'Cause' })).toHaveValue('');
  });


  it('names the field and says who writes a cause in Lithuanian', async () => {
    const { user } = renderFindings({ locale: 'lt' });
    await screen.findByText('Rodoma 7 iš 7');
    await user.click(within(cardOf(T.incidents)).getByRole('button', { name: 'Peržiūrėti' }));
    const dialog = await screen.findByRole('dialog', { name: 'Išvados peržiūra' });
    const field = within(dialog).getByRole('textbox', { name: 'Priežastis' });
    expect(field).toHaveValue(CAUSE);
    expect(field).toHaveAccessibleDescription('Kodėl spraga atsirado — įrašo peržiūrintis asmuo; sistema priežasties nerašo.');
  });
});







// -----------------------------------------------------------
// A long report
// -----------------------------------------------------------

describe('ReportFindings — a long report', () => {

  it('a folded group mounts no cards; opening it mounts them, folding it unmounts them again', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    expect(screen.queryByText(T.amlOfficer, { selector: 'span' })).toBeNull();
    const pptfpi = screen.getByRole('button', { name: /^PPTFPĮ/ });
    await user.click(pptfpi);
    expect(await screen.findByText(T.amlOfficer, { selector: 'span' })).toBeInTheDocument();
    await user.click(pptfpi);
    await waitFor(() => expect(screen.queryByText(T.amlOfficer, { selector: 'span' })).toBeNull());
  });


  it('shows 50 cards a group, then "Show 50 more" — the focus moves to the first card revealed; the last page takes the button away', async () => {
    given.json('get', '/api/reports/:reportId', many(120));
    const { user } = renderFindings();
    await screen.findByText('Showing 120 of 120');
    expect(shownTitles()).toHaveLength(50);
    expect(shownTitles().at(-1)).toBe('Pareiga 50');
    expect(screen.getByText('50 of 120 shown')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(100));
    expect(document.activeElement).toBe(disclosure('Pareiga 51'));
    expect(screen.getByText('100 of 120 shown')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 20 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(120));
    expect(document.activeElement).toBe(disclosure('Pareiga 101'));
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
    expect(screen.queryByText(/ of 120 shown$/)).toBeNull();
  });


  it('a new search, filter or grouping starts every group on its first page again', async () => {
    given.json('get', '/api/reports/:reportId', many(120));
    const { user } = renderFindings();
    await screen.findByText('Showing 120 of 120');
    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(100));
    const search = screen.getByRole('textbox', { name: 'Search the findings' });
    await user.type(search, 'Pareiga');
    await waitFor(() => expect(shownTitles()).toHaveLength(50));

    // Back to no search at all: a filter met before starts on
    // its first page too
    await user.clear(search);
    await waitFor(() => expect(shownTitles()).toHaveLength(50));
    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(100));
    await user.click(toggle('Domain'));
    await waitFor(() => expect(shownTitles()).toHaveLength(50));
  });


  it('keeps the pages opened through a refresh of the report: a card reviewed beyond the first page stays, and the focus returns to it', async () => {
    const report = many(120);
    const patches = given.capture('patch', '/api/reports/:reportId/findings/:findingId',
      { ...report.findings[74], overrideStatus: 'met', effectiveStatus: 'met', reviewerNote: 'Patikrinta' });
    given.json('get', '/api/reports/:reportId', report);
    const { user } = renderFindings();
    await screen.findByText('Showing 120 of 120');
    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(100));
    const review = within(cardOf('Pareiga 75')).getByRole('button', { name: 'Review' });
    await user.click(review);
    const dialog = await screen.findByRole('dialog', { name: 'Review the finding' });
    await user.click(within(dialog).getByRole('radio', { name: 'Met' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save the review' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shownTitles()).toHaveLength(100);
    await waitFor(() => expect(document.activeElement).toBe(review));
  });


  it('the plan\'s findings beyond the first page of their group are all shown — and the focus lands on the findings tab', async () => {
    given.json('get', '/api/reports/:reportId', many(120, {
      actions: [{ ...DONE.actions[0], id: 'e3000000-0000-4000-8000-0000000000aa', title: 'Vienas veiksmas', findingIds: ['gen-60', 'gen-110'] }],
    }));
    const { user } = renderPage(<ReportDetail authData={authData} />, { route: `/reports/${f.ID.reportDone}?tab=plan`, path: '/reports/:reportId' });
    const plan = await screen.findByRole('list', { name: 'Action plan' });
    await user.click(within(plan).getByRole('button', { name: 'Related findings (2)' }));
    expect(await screen.findByText('Showing 2 of 120')).toBeInTheDocument();
    expect(shownTitles()).toEqual(['Pareiga 60', 'Pareiga 110']);
    // The button went with the plan's panel — the keyboard
    // focus carries on from the tab now selected
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Findings (120)' })));
  });


  it('a document opened from a card beyond the first page hands the focus back to the card\'s evidence link when the drawer closes', async () => {
    given.json('get', '/api/reports/:reportId', many(120));
    const { user } = renderFindings();
    await screen.findByText('Showing 120 of 120');
    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(100));
    await user.click(disclosure('Pareiga 75'));
    const link = within(cardOf('Pareiga 75')).getByRole('button', { name: 'Leidimo išrašas' });
    await user.click(link);
    const dialog = await screen.findByRole('dialog', { name: 'Leidimo išrašas' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shownTitles()).toHaveLength(100);
    await waitFor(() => expect(document.activeElement).toBe(link));
  });


  it('the search box takes every keystroke while the list follows the text', async () => {
    given.json('get', '/api/reports/:reportId', many(120));
    const { user } = renderFindings();
    await screen.findByText('Showing 120 of 120');
    const search = screen.getByRole('textbox', { name: 'Search the findings' });
    await user.type(search, 'Pareiga 11');
    expect(search).toHaveValue('Pareiga 11');
    expect(await screen.findByText('Showing 11 of 120')).toBeInTheDocument();
    await waitFor(() => expect(shownTitles()).toEqual(['Pareiga 11', ...Array.from({ length: 10 }, (_, i) => `Pareiga ${110 + i}`)]));
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// The filters live in the address (findings.*, read when the
// tab mounts, written as they change — replaced); the pages
// opened, the groups toggled and the cards expanded are kept
// for the report in sessionStorage. Each test leaves the page
// (unmount) and comes back (a new render), as Back does.
// -----------------------------------------------------------

describe('ReportFindings — coming back', () => {

  const route = (query) => `/reports/${f.ID.reportDone}?tab=findings${query}`;


  it('the status, severity, search and grouping come from the address: the list shows as it was left', async () => {
    renderFindings({ route: route('&findings.status=partial&findings.severity=high&findings.q=incident&findings.group=category') });
    expect(await screen.findByText('Showing 1 of 7')).toBeInTheDocument();
    expect(shownTitles()).toEqual([T.incidents]);
    expect(toggle('Partial (2)')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('High (3)')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Domain')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Search the findings' })).toHaveValue('incident');
  });


  it('the toggles, the grouping and the search write the address, replacing the entry; "Clear" takes the filters out', async () => {
    const { user, router } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await user.click(toggle('Partial (2)'));
    await user.click(toggle('Not met (1)'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=findings&findings.status=partial%2Cmissing'));
    expect(router.state.historyAction).toBe('REPLACE');
    await user.click(toggle('Domain'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=findings&findings.status=partial%2Cmissing&findings.group=category'));
    await user.type(screen.getByRole('textbox', { name: 'Search the findings' }), 'IRT');
    await waitFor(() => expect(router.state.location.search).toContain('&findings.q=IRT'));
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=findings&findings.group=category'));
  });


  it('values the page does not know are ignored', async () => {
    renderFindings({ route: route('&findings.status=bogus,partial&findings.severity=extreme&findings.group=sideways') });
    expect(await screen.findByText('Showing 2 of 7')).toBeInTheDocument();
    expect(toggle('Partial (2)')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Domain')).toHaveAttribute('aria-pressed', 'false');
  });


  it('the "Show more" pages come back with the report', async () => {
    given.json('get', '/api/reports/:reportId', many(120));
    const first = renderFindings();
    await first.findByText('Showing 120 of 120');
    await first.user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await waitFor(() => expect(shownTitles()).toHaveLength(100));
    first.unmount();

    renderFindings();
    await screen.findByText('Showing 120 of 120');
    expect(shownTitles()).toHaveLength(100);
    expect(screen.getByRole('button', { name: 'Show 20 more' })).toBeInTheDocument();
  });


  it('a group opened or folded and a card expanded come back as they were left', async () => {
    const first = renderFindings();
    await first.findByText('Showing 7 of 7');
    await first.user.click(screen.getByRole('button', { name: /^PPTFPĮ/ }));
    await first.user.click(await waitFor(() => disclosure(T.amlOfficer)));
    await first.user.click(screen.getByRole('button', { name: /^MiCA/ }));
    first.unmount();

    renderFindings();
    await screen.findByText('Showing 7 of 7');
    expect(screen.getByRole('button', { name: /^PPTFPĮ/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^MiCA/ })).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure(T.amlOfficer, 'Hide')).toHaveAttribute('aria-expanded', 'true');
  });


  it('another report keeps its own: nothing of this one\'s carries over', async () => {
    const first = renderFindings();
    await first.findByText('Showing 7 of 7');
    await first.user.click(screen.getByRole('button', { name: /^PPTFPĮ/ }));
    first.unmount();

    const other = 'e9000000-0000-4000-8000-000000000009';
    given.json('get', '/api/reports/:reportId', { ...DONE, id: other });
    renderFindings({ route: `/reports/${other}?tab=findings` });
    await screen.findByText('Showing 7 of 7');
    expect(screen.getByRole('button', { name: /^PPTFPĮ/ })).toHaveAttribute('aria-expanded', 'false');
  });


  it('in Lithuanian too', async () => {
    renderFindings({ route: route('&findings.status=partial&findings.q=IRT'), locale: 'lt' });
    expect(await screen.findByText('Rodoma 2 iš 7')).toBeInTheDocument();
    expect(toggle('Iš dalies (2)')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Ieškoti išvadose' })).toHaveValue('IRT');
  });
});







// -----------------------------------------------------------
// A finding's history
// -----------------------------------------------------------
//
// How the same obligation stood in the company's earlier
// finished reports: the quiet "Before" row of a card.
// before: that row's entries, as text. withHistory: the
// finished report with one finding's history replaced.
// -----------------------------------------------------------

describe('ReportFindings — a finding\'s history', () => {

  const before = (card, name = 'Before') => within(within(card).getByRole('list', { name })).getAllByRole('listitem');

  const withHistory = (id, history) => ({ ...DONE, findings: DONE.findings.map((row) => (row.id === id ? { ...row, history } : row)) });


  it('a finding assessed before says how it stood then — the date, the verdict in words, and the way to that report', async () => {
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    const card = cardOf(T.safeguarding);
    expect(within(card).getByText('Before')).toBeInTheDocument();
    const [entry] = before(card);
    expect(entry).toHaveTextContent('08/09/2026 — Not met');
    expect(within(entry).getByRole('link', { name: '08/09/2026 — Not met' })).toHaveAttribute('href', `/reports/${f.ID.reportEarlier}?tab=findings`);
    // The verdict's own mark stands beside its word
    expect(entry.querySelector('svg')).not.toBeNull();
    expect(before(card)).toHaveLength(1);
  });


  it('shows on the folded card and tells what moved: the incidents were met, the register not evidenced', async () => {
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    expect(disclosure(T.incidents)).toHaveAttribute('aria-expanded', 'false');
    expect(before(cardOf(T.incidents)).map((entry) => entry.textContent)).toEqual(['08/09/2026 — Met']);
    expect(before(cardOf(T.register)).map((entry) => entry.textContent)).toEqual(['08/09/2026 — Not evidenced']);
  });


  it('a finding assessed for the first time has no such row', async () => {
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await openFolded(user);
    expect(DONE.findings.find((row) => row.id === f.ID.findingAiRisk).history).toEqual([]);
    expect(within(cardOf(T.aiRisk)).queryByText('Before')).toBeNull();
    expect(within(cardOf(T.aiRisk)).queryByRole('list', { name: 'Before' })).toBeNull();
  });


  it('names the three newest of a longer history, newest first, each with its own report', async () => {
    const history = [
      { reportId: 'e0000000-0000-4000-8000-0000000000a4', date: '2026-08-30', status: 'partial' },
      { reportId: 'e0000000-0000-4000-8000-0000000000a3', date: '2026-06-01', status: 'missing' },
      { reportId: 'e0000000-0000-4000-8000-0000000000a2', date: '2026-03-01', status: 'unknown' },
      { reportId: 'e0000000-0000-4000-8000-0000000000a1', date: '2025-12-01', status: 'met' },
    ];
    given.json('get', '/api/reports/:reportId', withHistory(f.ID.findingSafeguarding, history));
    renderFindings();
    await screen.findByText('Showing 7 of 7');
    const entries = before(cardOf(T.safeguarding));
    expect(entries.map((entry) => entry.textContent)).toEqual(['30/08/2026 — Partial', '01/06/2026 — Not met', '01/03/2026 — Not evidenced']);
    expect(entries.map((entry) => within(entry).getByRole('link').getAttribute('href')))
      .toEqual(history.slice(0, 3).map((row) => `/reports/${row.reportId}?tab=findings`));
  });


  it('a history of the wrong shape, or a report without one, shows no row and breaks nothing', async () => {
    const odd = { ...DONE, findings: DONE.findings.map((row, index) => ({ ...row, history: [undefined, 'none', null, [{}], [null, 'x']][index % 5] })) };
    given.json('get', '/api/reports/:reportId', odd);
    const { user } = renderFindings();
    await screen.findByText('Showing 7 of 7');
    await openFolded(user);
    expect(shownTitles()).toHaveLength(7);
    // Only the finding whose history holds an entry — an empty
    // one — has the row: the date unknown, the verdict by its
    // fallback, and no link without a report to go to
    const rows = screen.getAllByRole('list', { name: 'Before' });
    expect(rows.map((row) => row.textContent)).toEqual(['— — —']);
    expect(within(rows[0]).queryByRole('link')).toBeNull();
  });


  it('speaks Lithuanian', async () => {
    renderFindings({ locale: 'lt' });
    await screen.findByText('Rodoma 7 iš 7');
    const card = cardOf(T.safeguarding);
    expect(within(card).getByText('Anksčiau')).toBeInTheDocument();
    expect(before(card, 'Anksčiau').map((entry) => entry.textContent)).toEqual(['2026-09-08 — Neatitinka']);
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('ReportFindings in Lithuanian', () => {

  it('speaks Lithuanian: filters with counts, groups, the count, the cards and the review dialog', async () => {
    const { user } = renderFindings({ locale: 'lt' });
    await screen.findByText('Rodoma 7 iš 7');
    expect(within(screen.getByRole('group', { name: 'Būsena' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Neatitinka (1)', 'Iš dalies (2)', 'Neįrodyta (1)', 'Atitinka (2)', 'Netaikoma (1)']);
    expect(within(screen.getByRole('group', { name: 'Reikšmingumas' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Kritinė (1)', 'Aukšta (3)', 'Vidutinė (2)', 'Žema (1)']);
    expect(screen.getByRole('textbox', { name: 'Ieškoti išvadose' })).toBeInTheDocument();
    expect(groupHeaders()[0]).toBe('MiCAIšvadų: 2 · neįvykdytų: 1 [open]');
    const register = screen.getByText(T.register, { selector: 'span' }).closest('[id^="finding-"]');
    expect(within(register).getByText('Iš dalies')).toBeInTheDocument();
    expect(within(register).getByText('Peržiūrėta')).toBeInTheDocument();
    expect(within(register).getByLabelText('Būseną pakeitė peržiūrėtojas. DI vertinimas: Neatitinka.')).toBeInTheDocument();
    expect(within(register).getByText('Nepatvirtinta pareiga')).toBeInTheDocument();
    expect(within(register).getByText('Užsakomosios paslaugos')).toBeInTheDocument();

    await user.click(within(register).getByRole('button', { name: 'Peržiūrėti' }));
    const dialog = await screen.findByRole('dialog', { name: 'Išvados peržiūra' });
    expect(within(dialog).getByRole('radio', { name: 'Palikti DI vertinimą' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Iš dalies' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Išsaugoti peržiūrą' })).toBeInTheDocument();
  });


  it('offers the next page in Lithuanian', async () => {
    given.json('get', '/api/reports/:reportId', many(60));
    renderFindings({ locale: 'lt' });
    await screen.findByText('Rodoma 60 iš 60');
    expect(screen.getByRole('button', { name: 'Rodyti dar 10' })).toBeInTheDocument();
    expect(screen.getByText('Rodoma 50 iš 60')).toBeInTheDocument();
  });


  it('says why a cited passage is marked in Lithuanian', async () => {
    given.json('get', '/api/reports/:reportId', citing({ charStart: LONG_AT, quote: QUOTE }));
    serveLongPolicy();
    const { user } = renderFindings({ locale: 'lt' });
    await screen.findByText('Rodoma 7 iš 7');
    await user.click(screen.getByRole('button', { name: `${T.incidents} — Rodyti išvados detales` }));
    await user.click(within(cardOf(T.incidents)).getByRole('button', { name: 'Atitikties politika' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atitikties politika' });
    expect(await within(dialog).findByText('Pažymėta: išvadoje kaip įrodymas cituojama ištrauka.')).toBeInTheDocument();
    expect(within(dialog).getByText(QUOTE, { selector: 'mark' })).toBeInTheDocument();
  });
});
