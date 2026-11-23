// -----------------------------------------------------------
//  [*] Tests — pages/Reports/reportUtils.js
//
//  The pure facts every report view shares: which statuses
//  still move (and are polled) — and the one that waits for
//  a person instead, neither moving nor ended — the verdict
//  and pipeline orders the filters, the status bar and the
//  progress card are built on, the display title with its
//  date fallback, the effective status (the reviewer's
//  override wins), and the counts — by effective status when
//  the report carries its findings (the detail), from the
//  stored stats when it does not (a list row), including the
//  open findings per severity — all of them over the acts in
//  force, the findings of an act that applies later counted
//  apart; what a report did with an act (as it says, or as
//  reports from before said nothing did), and what the
//  person who approved its list of acts decided against a
//  verdict (an act assessed by choice, an applicable act
//  left out); and the citation audit's verdict of a row and
//  its counts — null ("not run") for a report from before the
//  audit, which is not the same as "nothing found". The
//  fixture's finished report is the world: its register
//  finding was overridden missing → partial, so the model's
//  stats and the effective counts disagree, and its audit
//  holds one row of every verdict but a second mismatch.
//
//  And what a finding means beyond its verdict: which
//  findings are gaps, and what a breach can cost — the
//  sanction tiers in the exports' own words, to the
//  character (the two real sentences of the API contract,
//  no-break spaces and the Lithuanian decimal comma
//  included), in both languages; and the company's own
//  requirements — which rows belong to that group, which
//  report holds it, its counts kept out of every headline
//  count, the run's steps with and without it, and its part
//  of a cost estimate.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import * as f from '../support/backend/fixtures';
import { AMLR, AMLR_GAP, reportToday } from '../support/reportToday';
import {
  ACTIVE_STATUSES, ASSESSMENTS, CITATION_STAT_KEYS, CITATION_VERDICTS, FINDING_COLORS, FINDING_STATUSES, GAP_STATUSES, OPEN_STATUSES,
  PIPELINE_STEPS, PROBLEM_VERDICTS, actAssessment, actChoice, chargedUsd, citationAudit, citationVerdict, consequenceText,
  effectiveStatus, findingCounts, hasInternal, isActive, isAssessed, isGap, isInternal, isUpcoming, isWaiting, openBySeverity,
  ownEstimate, policyDocuments, reportSteps, reportTitle,
} from '@/pages/Reports/reportUtils';
import { STATUS } from '@/components/charts/chartTokens';
import { messagesMap } from '@/messages';


// The finished, approved report of UAB Pavyzdys (detail) and
// its list row (no findings — the list leaves them out)
const DONE = f.report(f.ID.reportDone);
const DONE_ROW = f.reports.find((row) => row.id === f.ID.reportDone);

// A formatter that shows it was asked, as useFormat().date
const isoDate = (value) => `date(${value})`;

// The report that also assessed the company's own
// requirements (detail), and its row as a list would carry it
const OWN = f.report(f.ID.reportOwn);
const OWN_ROW = f.ownReport;

// The no-break space the exports set inside an amount and
// before the percent sign
const NBSP = String.fromCharCode(160);

// useTranslations('PAGES.report.CONSEQUENCE') outside React:
// the words of one language, a missing key answered as the
// key itself — as the hook's t() answers it
const words = (locale) => (key) => key.split('.').reduce((node, part) => node?.[part], messagesMap[locale].PAGES.report.CONSEQUENCE) ?? key;

// The two real findings of the API contract, as their tiers:
// MiCA's tier with the national law's beside it, whose
// measure comes from another provision; and PPTFPĮ's two
// tiers, the second bound to a kind of breach
const MICA_TIERS = [
  { act: 'MiCA', path: '111 str.', where: '2 d. a–c p.; 3 d. a, c p.', condition: '', maxFineEur: 5000000, maxFinePercent: 5, benefitMultiple: 2, measures: ['cease', 'public_statement'], measuresFrom: [] },
  { act: 'KRĮ', path: '15 str.', where: '1 d. 1 p.', condition: '', maxFineEur: 5000000, maxFinePercent: 10, benefitMultiple: null, measures: ['withdrawal'], measuresFrom: ['14 str. 1 d.'] },
];
const AML_TIERS = [
  { act: 'PPTFPĮ', path: '39 str.', where: '1 d. 1 p.', condition: '', maxFineEur: null, maxFinePercent: 5, benefitMultiple: null, measures: [], measuresFrom: [] },
  { act: 'PPTFPĮ', path: '39 str.', where: '1 d. 2 p.', condition: 'Sistemingas, vienas šiurkštus arba pakartotinis pažeidimas', maxFineEur: 5100000, maxFinePercent: 10, benefitMultiple: null, measures: [], measuresFrom: [] },
];







// -----------------------------------------------------------
// the constants
// -----------------------------------------------------------

describe('reportUtils constants', () => {

  it('names queued and running as the statuses that still change', () => {
    expect(ACTIVE_STATUSES).toEqual(['queued', 'running']);
  });


  it('orders the verdicts worst first, as the filters and the status bar offer them', () => {
    expect(FINDING_STATUSES).toEqual(['missing', 'partial', 'unknown', 'met', 'not_applicable']);
  });


  it('counts "not met" and "partial" as open — the two the plan and the severity tiles are about', () => {
    expect(OPEN_STATUSES).toEqual(['missing', 'partial']);
  });


  it('paints the verdicts in the reserved status colours: met good, partial warning, missing critical, the rest neutral', () => {
    expect(FINDING_COLORS).toEqual({
      met: STATUS.good, partial: STATUS.warning, missing: STATUS.critical, unknown: STATUS.neutral, not_applicable: '#c5ccd6',
    });
    expect(Object.keys(FINDING_COLORS).sort()).toEqual([...FINDING_STATUSES].sort());
  });


  it('lists the steps of the analysis job in run order, the citation audit right after the documents and the company\'s own requirements after the gap analysis (django analysis/pipeline.py)', () => {
    expect(PIPELINE_STEPS).toEqual(['profile', 'documents', 'citations', 'applicability', 'obligations', 'gap_analysis', 'internal', 'action_plan', 'summary']);
  });


  it('names "not met", "partial" and "not evidenced" as the verdicts a breach may stand behind', () => {
    expect(GAP_STATUSES).toEqual(['missing', 'partial', 'unknown']);
  });


  it('orders the citation verdicts problems first (django analysis/serializers.py VERDICTS), each with its stats key', () => {
    expect(CITATION_VERDICTS).toEqual(['mismatch', 'not_found', 'unknown', 'act_not_in_corpus', 'match']);
    expect(PROBLEM_VERDICTS).toEqual(['mismatch', 'not_found']);
    expect(CITATION_STAT_KEYS).toEqual({ mismatch: 'mismatch', not_found: 'notFound', unknown: 'unknown', act_not_in_corpus: 'notInCorpus', match: 'match' });
    expect(Object.keys(CITATION_STAT_KEYS).sort()).toEqual([...CITATION_VERDICTS].sort());
  });
});







// -----------------------------------------------------------
// isActive
// -----------------------------------------------------------

describe('isActive', () => {

  it('is true while the analysis is queued or running, false once it ended', () => {
    expect(isActive({ status: 'queued' })).toBe(true);
    expect(isActive({ status: 'running' })).toBe(true);
    for (const status of ['done', 'failed', 'cancelled']) expect(isActive({ status }), status).toBe(false);
  });


  it('reads the fixture world: only UAB Kreditas\' analysis is still running', () => {
    expect(f.reports.filter(isActive).map((row) => row.companyName)).toEqual(['UAB Kreditas']);
    expect(isActive(f.report(f.ID.newReport))).toBe(true);
  });


  it('is false for nothing, a report without a status and a status it does not know', () => {
    for (const report of [null, undefined, {}, { status: null }, { status: 'paused' }, 'running']) {
      expect(isActive(report), JSON.stringify(report)).toBe(false);
    }
  });


  it('is false for a report that waits for its list of acts to be approved — nothing runs, nothing is polled', () => {
    expect(ACTIVE_STATUSES).not.toContain('scope_review');
    expect(isActive({ status: 'scope_review' })).toBe(false);
    expect(isActive(f.waitingReport)).toBe(false);
  });
});







// -----------------------------------------------------------
// isWaiting
// -----------------------------------------------------------

describe('isWaiting', () => {

  it('is true only while the report waits for its list of acts to be approved', () => {
    expect(isWaiting({ status: 'scope_review' })).toBe(true);
    for (const status of ['queued', 'running', 'done', 'failed', 'cancelled']) expect(isWaiting({ status }), status).toBe(false);
  });


  it('reads the fixture world: the waiting report waits, none of the listed ones does', () => {
    expect(isWaiting(f.report(f.ID.reportWaiting))).toBe(true);
    expect(f.reports.filter(isWaiting)).toEqual([]);
  });


  it('is false for nothing and for a report without a status', () => {
    for (const report of [null, undefined, {}, { status: null }, 'scope_review']) expect(isWaiting(report), JSON.stringify(report)).toBe(false);
  });
});







// -----------------------------------------------------------
// reportTitle
// -----------------------------------------------------------

describe('reportTitle', () => {

  it('answers the model-written title of a finished report, trimmed', () => {
    expect(reportTitle(DONE, 'Report, {date}', isoDate)).toBe('UAB Pavyzdys atitikties vertinimas: MiCA, DORA ir PPTFPĮ');
    expect(reportTitle({ ...DONE, title: '  Padded  ' }, 'Report, {date}', isoDate)).toBe('Padded');
  });


  it('falls back to "untitled" with the creation date for a report without a title yet', () => {
    const running = f.report(f.ID.reportRunning);
    expect(reportTitle(running, 'Report, {date}', isoDate)).toBe('Report, date(2026-09-27T09:40:00+00:00)');
    expect(reportTitle({ ...running, title: '   ' }, 'Ataskaita, {date}', isoDate)).toBe('Ataskaita, date(2026-09-27T09:40:00+00:00)');
    expect(reportTitle({ ...running, title: null }, 'Report, {date}', isoDate)).toBe('Report, date(2026-09-27T09:40:00+00:00)');
  });


  it('treats a title that is not text as none instead of throwing — a table cell must not crash on a broken row', () => {
    expect(reportTitle({ title: 12345, createdAt: '2026-09-20' }, 'Report, {date}', isoDate)).toBe('Report, date(2026-09-20)');
    expect(reportTitle({ title: { lt: 'x' }, createdAt: null }, 'Report, {date}', isoDate)).toBe('Report, date(null)');
    expect(reportTitle(null, 'Report, {date}', isoDate)).toBe('Report, date(undefined)');
  });
});







// -----------------------------------------------------------
// effectiveStatus
// -----------------------------------------------------------

describe('effectiveStatus', () => {

  it('is the reviewer\'s verdict when there is one, the model\'s otherwise — as the serializer answers it', () => {
    const register = DONE.findings.find((row) => row.id === f.ID.findingRegister);
    const safeguarding = DONE.findings.find((row) => row.id === f.ID.findingSafeguarding);
    expect(register.status).toBe('missing');
    expect(effectiveStatus(register)).toBe('partial');
    expect(effectiveStatus(safeguarding)).toBe('missing');
  });


  it('falls back to the override, then the model status, for a row without effectiveStatus', () => {
    expect(effectiveStatus({ status: 'missing', overrideStatus: 'met' })).toBe('met');
    expect(effectiveStatus({ status: 'missing', overrideStatus: null })).toBe('missing');
    expect(effectiveStatus({ status: 'unknown' })).toBe('unknown');
  });


  it('answers null for nothing', () => {
    expect(effectiveStatus(null)).toBeNull();
    expect(effectiveStatus({})).toBeNull();
  });
});







// -----------------------------------------------------------
// findingCounts
// -----------------------------------------------------------

describe('findingCounts', () => {

  it('counts the detail\'s findings by effective status — the overridden register finding is partial, not missing', () => {
    expect(findingCounts(DONE)).toEqual({ met: 2, partial: 2, missing: 1, unknown: 1, not_applicable: 1 });
    // The stored stats agree — a review recounts them (FE-REPORTS-1, fixed)
    expect(DONE.stats.findings).toEqual({ met: 2, partial: 2, missing: 1, unknown: 1, not_applicable: 1 });
  });


  it('uses the stored stats for a list row, which carries no findings', () => {
    expect(DONE_ROW.findings).toBeUndefined();
    expect(findingCounts(DONE_ROW)).toEqual({ ...DONE_ROW.stats.findings });
    expect(findingCounts({ ...DONE_ROW, stats: { findings: { met: 3, partial: 1, missing: 2, unknown: 0, not_applicable: 0 } } }))
      .toEqual({ met: 3, partial: 1, missing: 2, unknown: 0, not_applicable: 0 });
  });


  it('follows a fresh override at once — a finding set to met leaves the "not met" count', () => {
    const findings = DONE.findings.map((row) => (row.id === f.ID.findingSafeguarding
      ? { ...row, overrideStatus: 'met', effectiveStatus: 'met' } : row));
    expect(findingCounts({ ...DONE, findings })).toEqual({ met: 3, partial: 2, missing: 0, unknown: 1, not_applicable: 1 });
  });


  it('answers zeros for a report without findings or stats yet (running, failed, just started)', () => {
    const zeros = { met: 0, partial: 0, missing: 0, unknown: 0, not_applicable: 0 };
    expect(findingCounts(f.report(f.ID.reportRunning))).toEqual(zeros);
    expect(findingCounts(f.reports.find((row) => row.id === f.ID.reportFailed))).toEqual(zeros);
    expect(findingCounts(f.report(f.ID.newReport))).toEqual(zeros);
    expect(findingCounts(null)).toEqual(zeros);
    expect(findingCounts({ stats: null })).toEqual(zeros);
  });


  it('turns counts sent as strings into numbers, so a total adds up instead of concatenating', () => {
    const counts = findingCounts({ stats: { findings: { met: '2', partial: '1', missing: 'x' } } });
    expect(counts).toEqual({ met: 2, partial: 1, missing: 0, unknown: 0, not_applicable: 0 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(3);
  });


  it('skips holes in a broken findings list and does not count a verdict it does not know', () => {
    const findings = [null, 'x', { status: 'met' }, { effectiveStatus: 'weird' }, { status: 'missing', overrideStatus: 'partial' }];
    expect(findingCounts({ findings })).toEqual({ met: 1, partial: 1, missing: 0, unknown: 0, not_applicable: 0 });
  });
});







// -----------------------------------------------------------
// actAssessment, isUpcoming and the counts kept apart
// -----------------------------------------------------------

describe('what a report did with an act, and the preparation it counts apart', () => {

  const TODAY = reportToday();


  it('reads what the report says it did with each act', () => {
    expect(ASSESSMENTS).toEqual(['assessed', 'upcoming', 'unconfirmed', 'indirect', 'none']);
    expect(TODAY.acts.map((act) => [act.shortTitle, actAssessment(act)])).toEqual([
      ['DORA', 'assessed'], ['MiCA', 'assessed'], ['DI aktas', 'unconfirmed'], ['PPTFPĮ', 'assessed'], ['VKĮ', 'none'],
      ['AMLR', 'upcoming'], ['AMLD6', 'indirect'], ['LBĮ', 'indirect'],
    ]);
  });


  it('a report from before acts said so assessed every act that applied or might, and left the rest', () => {
    const before = (act) => Object.fromEntries(Object.entries(act).filter(([key]) => key !== 'assessment'));
    expect(DONE.acts.map((act) => actAssessment(before(act)))).toEqual(['assessed', 'assessed', 'assessed', 'assessed', 'none']);
    expect(actAssessment({ applicability: 'not_applies' })).toBe('none');
    expect(actAssessment({ applicability: 'applies', assessment: 'someday' })).toBe('assessed');
    expect(actAssessment(null)).toBe('assessed');
  });


  it('a report assesses the acts it judges today and those it prepares for — the run\'s own decision on the approval screen', () => {
    const waiting = f.report(f.ID.reportWaiting);
    expect(waiting.acts.map((act) => [act.shortTitle, act.assessment, isAssessed(act)])).toEqual([
      ['DORA', 'assessed', true], ['MiCA', 'assessed', true], ['PPTFPĮ', 'assessed', true], ['DI aktas', 'upcoming', true],
      ['EPĮ', 'unconfirmed', false], ['AMLD6', 'indirect', false], ['MĮ', 'none', false], ['VKĮ', 'none', false],
    ]);
    expect(isAssessed({ applicability: 'applies' })).toBe(true);
    expect(isAssessed({ applicability: 'not_applies' })).toBe(false);
    expect(isAssessed(null)).toBe(true);
  });


  it('tells the acts a person decided against the verdict: assessed by choice, or applicable and left out', () => {
    expect(actChoice({ applicability: 'not_applies', assessment: 'assessed', screenedOut: false })).toBe('chosen');
    expect(actChoice({ applicability: 'not_applies', assessment: 'upcoming', screenedOut: false })).toBe('chosen');
    expect(actChoice({ applicability: 'applies', assessment: 'none', screenedOut: false })).toBe('leftOut');
    // Everything the report treated as its verdict says
    for (const act of [...TODAY.acts, ...f.report(f.ID.reportWaiting).acts]) expect(actChoice(act), act.shortTitle).toBeNull();
    expect(actChoice({ applicability: 'uncertain', assessment: 'assessed' })).toBeNull();
    expect(actChoice({ applicability: 'uncertain', assessment: 'none' })).toBeNull();
    expect(actChoice({ applicability: 'applies', assessment: 'indirect' })).toBeNull();
  });


  it('an act the catalogue screened out is never "left out", and a report from before the review decided nothing against a verdict', () => {
    expect(actChoice({ applicability: 'applies', assessment: 'none', screenedOut: true })).toBeNull();
    const before = (act) => Object.fromEntries(Object.entries(act).filter(([key]) => key !== 'assessment'));
    expect(DONE.acts.map((act) => actChoice(before(act)))).toEqual([null, null, null, null, null]);
    expect(actChoice(null)).toBeNull();
  });


  it('a finding of an act that applies later is preparation', () => {
    expect(TODAY.findings.filter(isUpcoming).map((row) => row.actId)).toEqual([AMLR.id, AMLR.id]);
    expect(isUpcoming(DONE.findings[0])).toBe(false);
    expect(isUpcoming(null)).toBe(false);
  });


  it('counts today\'s findings and the preparation apart — from the findings of a detail', () => {
    expect(findingCounts(TODAY)).toEqual({ met: 2, partial: 2, missing: 1, unknown: 0, not_applicable: 1 });
    expect(findingCounts(TODAY, { upcoming: true })).toEqual({ met: 1, partial: 1, missing: 0, unknown: 0, not_applicable: 0 });
    // The preparation's open finding (high) is no open obligation of today
    expect(TODAY.findings.find((row) => row.id === AMLR_GAP).severity).toBe('high');
    expect(openBySeverity(TODAY)).toEqual({ high: 2, medium: 1 });
    expect(findingCounts(DONE, { upcoming: true })).toEqual({ met: 0, partial: 0, missing: 0, unknown: 0, not_applicable: 0 });
  });


  it('and from the stored stats of a list row', () => {
    const row = { stats: { findings: { met: 2, partial: 2, missing: 1 }, upcoming: { findings: { met: 1, partial: 1 } } } };
    expect(findingCounts(row)).toEqual({ met: 2, partial: 2, missing: 1, unknown: 0, not_applicable: 0 });
    expect(findingCounts(row, { upcoming: true })).toEqual({ met: 1, partial: 1, missing: 0, unknown: 0, not_applicable: 0 });
    expect(findingCounts(DONE_ROW, { upcoming: true })).toEqual({ met: 0, partial: 0, missing: 0, unknown: 0, not_applicable: 0 });
  });
});







// -----------------------------------------------------------
// openBySeverity
// -----------------------------------------------------------

describe('openBySeverity', () => {

  it('counts the open findings (not met, partial — effective) per severity of the detail', () => {
    // safeguarding missing/high, register (partial by override)/medium,
    // incidents partial/high
    expect(openBySeverity(DONE)).toEqual({ high: 2, medium: 1 });
  });


  it('follows the override: a finding a reviewer set to met is no longer open', () => {
    const findings = DONE.findings.map((row) => (row.id === f.ID.findingSafeguarding
      ? { ...row, overrideStatus: 'met', effectiveStatus: 'met' } : row));
    expect(openBySeverity({ ...DONE, findings })).toEqual({ high: 1, medium: 1 });
  });


  it('an override that opens a finding counts it — a "met" critical licence set to missing', () => {
    const findings = DONE.findings.map((row) => (row.id === f.ID.findingLicence
      ? { ...row, overrideStatus: 'missing', effectiveStatus: 'missing' } : row));
    expect(openBySeverity({ ...DONE, findings })).toEqual({ critical: 1, high: 2, medium: 1 });
  });


  it('uses the stored stats for a list row, and answers an empty object when there is nothing', () => {
    expect(openBySeverity(DONE_ROW)).toEqual({ critical: 0, high: 2, medium: 1, low: 0 });
    expect(openBySeverity(f.report(f.ID.reportRunning))).toEqual({});
    expect(openBySeverity(null)).toEqual({});
    expect(openBySeverity({ stats: {} })).toEqual({});
  });


  it('hands back a copy — the caller cannot change the cached stats through it', () => {
    const row = { stats: { openBySeverity: { high: 1 } } };
    openBySeverity(row).high = 99;
    expect(row.stats.openBySeverity.high).toBe(1);
  });
});







// -----------------------------------------------------------
// citationVerdict
// -----------------------------------------------------------

describe('citationVerdict', () => {

  it('takes the verdict the server sent', () => {
    expect(DONE.citations.map(citationVerdict)).toEqual(['mismatch', 'mismatch', 'not_found', 'unknown', 'act_not_in_corpus', 'match']);
  });


  it('derives it the server\'s way for a row without one — a missing act or provision says so, a found one is its heading match', () => {
    expect(citationVerdict({ status: 'not_found' })).toBe('not_found');
    expect(citationVerdict({ status: 'act_not_in_corpus', headingMatch: 'match' })).toBe('act_not_in_corpus');
    expect(citationVerdict({ status: 'found', headingMatch: 'mismatch' })).toBe('mismatch');
    expect(citationVerdict({ status: 'found', headingMatch: 'match', verdict: 'nonsense' })).toBe('match');
    expect(citationVerdict({ status: 'found', headingMatch: 'unknown' })).toBe('unknown');
  });


  it('reads anything else as "could not judge" rather than throwing', () => {
    for (const row of [{}, null, undefined, 'x', { status: 'found' }, { status: 7, headingMatch: [] }]) {
      expect(citationVerdict(row), JSON.stringify(row)).toBe('unknown');
    }
  });
});







// -----------------------------------------------------------
// citationAudit
// -----------------------------------------------------------

describe('citationAudit', () => {

  it('counts the verdicts of the detail\'s rows', () => {
    expect(citationAudit(DONE)).toEqual({ checked: 6, match: 1, mismatch: 2, notFound: 1, notInCorpus: 1, unknown: 1 });
  });


  it('takes the stored counts for a list row (no rows) — the two agree for the fixture', () => {
    expect(citationAudit(DONE_ROW)).toEqual(citationAudit(DONE));
    expect(citationAudit({ stats: { citations: { checked: '3', mismatch: 2, match: 'x' } } }))
      .toEqual({ checked: 3, match: 0, mismatch: 2, notFound: 0, notInCorpus: 0, unknown: 0 });
  });


  it('answers null when the audit never ran for the report — no stats.citations, or not an object', () => {
    const { citations, ...before } = DONE.stats;
    expect(citations).toBeTruthy();
    for (const report of [{ ...DONE, stats: before, citations: [] }, f.report(f.ID.reportRunning), f.report(f.ID.reportFailed),
      { stats: { citations: [] } }, { stats: { citations: 5 } }, { stats: null }, null, undefined]) {
      expect(citationAudit(report)).toBeNull();
    }
  });


  it('an audit that found nothing counts zeros — not "not run"', () => {
    expect(citationAudit({ ...DONE, citations: [] })).toEqual({ checked: 0, match: 0, mismatch: 0, notFound: 0, notInCorpus: 0, unknown: 0 });
  });


  it('skips rows that are not objects, and counts an unreadable one as "could not judge"', () => {
    expect(citationAudit({ ...DONE, citations: [null, 'x', DONE.citations[0], {}] }))
      .toEqual({ checked: 2, match: 0, mismatch: 1, notFound: 0, notInCorpus: 0, unknown: 1 });
  });
});







// -----------------------------------------------------------
// isGap and consequenceText
// -----------------------------------------------------------

describe('what a breach can cost', () => {

  it('a finding is a gap by its effective verdict — the reviewer\'s override decides', () => {
    const verdicts = Object.fromEntries(DONE.findings.map((row) => [row.id, isGap(row)]));
    expect(verdicts).toEqual({
      [f.ID.findingSafeguarding]: true, [f.ID.findingRegister]: true, [f.ID.findingIncidents]: true, [f.ID.findingAiRisk]: true,
      [f.ID.findingLicence]: false, [f.ID.findingAmlOfficer]: false, [f.ID.findingCorrespondent]: false,
    });
    expect(isGap({ status: 'missing', overrideStatus: 'met' })).toBe(false);
    expect(isGap({ status: 'met', overrideStatus: 'unknown' })).toBe(true);
    expect(isGap(null)).toBe(false);
  });


  it('writes the contract\'s first real finding to the character: three ceilings, the measures, and the provision a measure comes from', () => {
    expect(consequenceText({ consequence: MICA_TIERS }, words('lt'))).toBe(
      `bauda iki 5${NBSP}000${NBSP}000 EUR arba 5${NBSP}% metinės apyvartos (pajamų) arba 2 kartų gautos naudos ar išvengtų nuostolių; `
      + 'taip pat: nurodymas nutraukti pažeidimą, viešas pranešimas apie pažeidimą (MiCA 111 str. 2 d. a–c p.; 3 d. a, c p.); '
      + `bauda iki 5${NBSP}000${NBSP}000 EUR arba 10${NBSP}% metinės apyvartos (pajamų); taip pat: leidimo panaikinimas ar sustabdymas (KRĮ 15 str. 1 d. 1 p., 14 str. 1 d.)`,
    );
  });


  it('writes the second: a share of turnover alone, and the graver tier bound to its kind of breach', () => {
    expect(consequenceText({ consequence: AML_TIERS }, words('lt'))).toBe(
      `bauda iki 5${NBSP}% metinės apyvartos (pajamų) (PPTFPĮ 39 str. 1 d. 1 p.); `
      + `bauda iki 5${NBSP}100${NBSP}000 EUR arba 10${NBSP}% metinės apyvartos (pajamų) – Sistemingas, vienas šiurkštus arba pakartotinis pažeidimas (PPTFPĮ 39 str. 1 d. 2 p.)`,
    );
  });


  it('says whom a tier binds when it binds only certain persons, before the kind of breach', () => {
    const persons = ['finansų įstaiga', 'užsienio finansų įstaigos filialas'];
    const [share, graver] = AML_TIERS;
    expect(consequenceText({ consequence: [{ ...share, persons }, { ...graver, persons }] }, words('lt'))).toBe(
      `bauda iki 5${NBSP}% metinės apyvartos (pajamų) – tik šiems asmenims: finansų įstaiga, užsienio finansų įstaigos filialas (PPTFPĮ 39 str. 1 d. 1 p.); `
      + `bauda iki 5${NBSP}100${NBSP}000 EUR arba 10${NBSP}% metinės apyvartos (pajamų) – tik šiems asmenims: finansų įstaiga, užsienio finansų įstaigos filialas; `
      + 'Sistemingas, vienas šiurkštus arba pakartotinis pažeidimas (PPTFPĮ 39 str. 1 d. 2 p.)',
    );
    expect(consequenceText({ consequence: [{ ...share, persons: ['grynųjų pinigų tvarkytojas'] }] }, words('en')))
      .toBe(`a fine of up to 5${NBSP}% of annual turnover (income) – only for: grynųjų pinigų tvarkytojas (PPTFPĮ 39 str. 1 d. 1 p.)`);
    // A tier for whoever breaches the act says nothing of persons, as a report made before they were read
    expect(consequenceText({ consequence: [{ ...share, persons: [] }] }, words('en')))
      .toBe(consequenceText({ consequence: [share] }, words('en')));
  });


  it('says the same in English, in the export\'s English words', () => {
    expect(consequenceText({ consequence: MICA_TIERS }, words('en'))).toBe(
      `a fine of up to 5${NBSP}000${NBSP}000 EUR or 5${NBSP}% of annual turnover (income) or 2 times the benefit gained or loss avoided; `
      + 'also: an order to end the breach, a public statement on the breach (MiCA 111 str. 2 d. a–c p.; 3 d. a, c p.); '
      + `a fine of up to 5${NBSP}000${NBSP}000 EUR or 10${NBSP}% of annual turnover (income); also: withdrawal or suspension of the authorisation (KRĮ 15 str. 1 d. 1 p., 14 str. 1 d.)`,
    );
  });


  it('ends by naming the article a technical standard was adopted under — once, however many tiers', () => {
    const via = { act: 'MiCA', path: '71 str.' };
    const through = MICA_TIERS.map((tier) => ({ ...tier, via }));
    expect(consequenceText({ consequence: through }, words('lt')))
      .toBe(`${consequenceText({ consequence: MICA_TIERS }, words('lt'))} – šis aktas priimtas pagal MiCA 71 str.`);
    expect(consequenceText({ consequence: through }, words('en')))
      .toBe(`${consequenceText({ consequence: MICA_TIERS }, words('en'))} – this act was adopted under MiCA 71 str.`);
    // A tier that says nothing says nothing of where it came from either
    expect(consequenceText({ consequence: [{ via }] }, words('lt'))).toBe('');
  });


  it('writes a fraction with the language\'s decimal mark — a comma in Lithuanian — and no trailing zeros', () => {
    const tier = { act: 'MiCA', path: '111 str.', where: '', condition: '', maxFineEur: 700000, maxFinePercent: 12.5, benefitMultiple: 2.0, measures: [], measuresFrom: [] };
    expect(consequenceText({ consequence: [tier] }, words('lt')))
      .toBe(`bauda iki 700${NBSP}000 EUR arba 12,5${NBSP}% metinės apyvartos (pajamų) arba 2 kartų gautos naudos ar išvengtų nuostolių (MiCA 111 str.)`);
    expect(consequenceText({ consequence: [tier] }, words('en')))
      .toBe(`a fine of up to 700${NBSP}000 EUR or 12.5${NBSP}% of annual turnover (income) or 2 times the benefit gained or loss avoided (MiCA 111 str.)`);
    expect(consequenceText({ consequence: [{ ...tier, maxFineEur: 999, maxFinePercent: 0.5, benefitMultiple: 1.5 }] }, words('lt')))
      .toBe(`bauda iki 999 EUR arba 0,5${NBSP}% metinės apyvartos (pajamų) arba 1,5 kartų gautos naudos ar išvengtų nuostolių (MiCA 111 str.)`);
  });


  it('a tier without a ceiling is its measures alone; a measure the table does not know stays the code it came as', () => {
    const tier = { act: 'DORA', path: '50 str.', where: '4 d.', condition: '', maxFineEur: null, maxFinePercent: null, benefitMultiple: null, measures: ['cease', 'asset_freeze'], measuresFrom: [] };
    expect(consequenceText({ consequence: [tier] }, words('lt'))).toBe('nurodymas nutraukti pažeidimą, asset_freeze (DORA 50 str. 4 d.)');
    expect(consequenceText({ consequence: [tier] }, words('en'))).toBe('an order to end the breach, asset_freeze (DORA 50 str. 4 d.)');
  });


  it('names every measure the backend knows, in both languages', () => {
    const codes = ['withdrawal', 'restriction', 'cease', 'public_statement', 'management_ban', 'disgorgement', 'periodic_penalty', 'criminal', 'other'];
    const tier = { act: 'X', path: '1 str.', measures: codes };
    expect(consequenceText({ consequence: [tier] }, words('lt'))).toBe(
      'leidimo panaikinimas ar sustabdymas, veiklos apribojimas ar sustabdymas, nurodymas nutraukti pažeidimą, viešas pranešimas apie pažeidimą, '
      + 'vadovų nušalinimas ar draudimas eiti pareigas, gautos naudos grąžinimas, periodinė bauda, baudžiamoji atsakomybė, kitos poveikio priemonės (X 1 str.)',
    );
    expect(consequenceText({ consequence: [tier] }, words('en'))).toBe(
      'withdrawal or suspension of the authorisation, restriction or suspension of an activity, an order to end the breach, a public statement on the breach, '
      + 'removal of managers or a ban on management functions, surrender of the benefit gained, a periodic penalty, criminal liability, other measures (X 1 str.)',
    );
  });


  it('says nothing for a tier with neither a ceiling nor a measure, for a finding without tiers and for a broken list', () => {
    expect(consequenceText({ consequence: [{ act: 'MiCA', path: '111 str.', maxFineEur: 0, measures: [] }] }, words('lt'))).toBe('');
    expect(consequenceText({ consequence: [] }, words('lt'))).toBe('');
    expect(consequenceText({}, words('lt'))).toBe('');
    expect(consequenceText(null, words('lt'))).toBe('');
    expect(consequenceText({ consequence: 'bauda' }, words('lt'))).toBe('');
    expect(consequenceText({ consequence: [null, 'x', { act: 'DORA', path: '50 str.', measures: ['cease'] }] }, words('lt')))
      .toBe('nurodymas nutraukti pažeidimą (DORA 50 str.)');
  });


  it('reads the fixture world: the safeguarding gap stands under two tiers, the register gap under none', () => {
    const byId = (id) => DONE.findings.find((row) => row.id === id);
    expect(consequenceText(byId(f.ID.findingSafeguarding), words('lt'))).toBe(
      `bauda iki 5${NBSP}000${NBSP}000 EUR arba 5${NBSP}% metinės apyvartos (pajamų) arba 2 kartų gautos naudos ar išvengtų nuostolių; `
      + 'taip pat: nurodymas nutraukti pažeidimą, viešas pranešimas apie pažeidimą (MiCA 111 str. 2 d. a–c p.; 3 d. a, c p.); '
      + `bauda iki 5${NBSP}000${NBSP}000 EUR arba 10${NBSP}% metinės apyvartos (pajamų); taip pat: leidimo panaikinimas ar sustabdymas `
      + '– Sistemingas arba pakartotinis pažeidimas (KRĮ 15 str. 1 d. 1 p., 14 str. 1 d.)',
    );
    expect(consequenceText(byId(f.ID.findingRegister), words('lt'))).toBe('');
  });
});







// -----------------------------------------------------------
// the company's own requirements
// -----------------------------------------------------------

describe('the company\'s own requirements, kept apart', () => {

  it('tells the rows of the group: the act row by its docType, the findings by their sourceKind', () => {
    expect(OWN.acts.filter(isInternal).map((row) => row.shortTitle)).toEqual(['Vidaus reikalavimai']);
    expect(OWN.findings.filter(isInternal).map((row) => row.id)).toEqual([f.ID.findingOwnReports, f.ID.findingOwnRisk, f.ID.findingOwnScope]);
    expect(DONE.acts.some(isInternal)).toBe(false);
    expect(DONE.findings.some(isInternal)).toBe(false);
    expect(isInternal(null)).toBe(false);
  });


  it('knows which report holds the group — by its stats (a list row), its findings or its act row', () => {
    expect(hasInternal(OWN)).toBe(true);
    expect(hasInternal(OWN_ROW)).toBe(true);
    expect(hasInternal({ findings: OWN.findings })).toBe(true);
    expect(hasInternal({ acts: OWN.acts })).toBe(true);
    expect(hasInternal(DONE)).toBe(false);
    expect(hasInternal(DONE_ROW)).toBe(false);
    expect(hasInternal(f.report(f.ID.reportWaiting))).toBe(false);
    expect(hasInternal({ stats: { internal: 'yes' } })).toBe(false);
    expect(hasInternal(null)).toBe(false);
  });


  it('counts the group apart: the headline counts and the open severities are those of the report without it', () => {
    expect(findingCounts(OWN)).toEqual(findingCounts(DONE));
    expect(openBySeverity(OWN)).toEqual(openBySeverity(DONE));
    expect(findingCounts(OWN, { upcoming: true })).toEqual({ met: 0, partial: 0, missing: 0, unknown: 0, not_applicable: 0 });
    expect(findingCounts(OWN, { internal: true })).toEqual({ met: 1, partial: 1, missing: 1, unknown: 0, not_applicable: 0 });
    expect(findingCounts(DONE, { internal: true })).toEqual({ met: 0, partial: 0, missing: 0, unknown: 0, not_applicable: 0 });
  });


  it('follows the reviewer inside the group too, and reads a list row\'s stats.internal', () => {
    const findings = OWN.findings.map((row) => (row.id === f.ID.findingOwnReports ? { ...row, overrideStatus: 'partial', effectiveStatus: 'partial' } : row));
    expect(findingCounts({ ...OWN, findings }, { internal: true })).toEqual({ met: 1, partial: 2, missing: 0, unknown: 0, not_applicable: 0 });
    expect(findingCounts({ ...OWN, findings })).toEqual(findingCounts(DONE));
    expect(findingCounts(OWN_ROW, { internal: true })).toEqual({ met: 1, partial: 1, missing: 1, unknown: 0, not_applicable: 0 });
    expect(findingCounts(OWN_ROW)).toEqual(findingCounts(DONE_ROW));
    expect(OWN_ROW.stats.internal.openBySeverity).toEqual({ critical: 0, high: 1, medium: 1, low: 0 });
  });


  it('lists the step of the group only for a run started with it — the fixture\'s finished job ran the eight others', () => {
    const plain = PIPELINE_STEPS.filter((name) => name !== 'internal');
    expect(reportSteps(DONE)).toEqual(plain);
    expect(f.job(f.ID.jobReportDone).steps.map((step) => step.name)).toEqual(plain);
    expect(reportSteps(null)).toEqual(plain);
    expect(reportSteps(OWN)).toEqual(PIPELINE_STEPS);
    // A progress that names the step shows it whatever the scope says
    expect(reportSteps({ scope: {}, progress: { step: 'internal' } })).toEqual(PIPELINE_STEPS);
  });


  it('reads the part of an estimate that prices the group — none when it was not asked for', () => {
    expect(ownEstimate(f.estimate(f.ID.pavyzdys, true))).toEqual({ documents: 1, requirements: 8, usd: 0.21 });
    expect(ownEstimate(f.estimate(f.ID.kreditas, true))).toEqual({ documents: 0, requirements: 0, usd: 0 });
    expect(ownEstimate(f.estimate(f.ID.pavyzdys))).toBeNull();
    expect(ownEstimate({ internal: { documents: '2', requirements: null } })).toEqual({ documents: 2, requirements: 0, usd: 0 });
    expect(ownEstimate({ internal: [] })).toBeNull();
    expect(ownEstimate('not an estimate')).toBeNull();
    expect(ownEstimate(null)).toBeNull();
  });


  it('reads how many policy-level documents a company has off any estimate — asked for the group or not', () => {
    expect(policyDocuments(f.estimate(f.ID.pavyzdys))).toBe(1);
    expect(policyDocuments(f.estimate(f.ID.pavyzdys, true))).toBe(1);
    expect(policyDocuments(f.estimate(f.ID.kreditas))).toBe(0);
    expect(policyDocuments(f.estimate(f.ID.newCompany))).toBe(0);
    // An answer from before estimates said so: the group's own count, when it was asked for
    expect(policyDocuments({ internal: { documents: 0, requirements: 0, usd: 0 } })).toBe(0);
    expect(policyDocuments({ internal: { documents: 3 } })).toBe(3);
    // Not said at all is not "none"
    expect(policyDocuments({ totalUsd: 1 })).toBeNull();
    expect(policyDocuments({ policyDocuments: '0' })).toBeNull();
    expect(policyDocuments({ policyDocuments: null })).toBeNull();
    expect(policyDocuments(undefined)).toBeNull();
  });


  it('charges the caller the analysis and the group, not the shared reading of acts', () => {
    expect(chargedUsd(f.estimate(f.ID.pavyzdys))).toBe(2.43);
    expect(chargedUsd(f.estimate(f.ID.pavyzdys, true))).toBeCloseTo(2.64, 10);
    expect(f.estimate(f.ID.pavyzdys, true).totalUsd).toBe(6.09);
    // An estimate that does not tell the analysis apart is charged whole
    expect(chargedUsd({ totalUsd: 4 })).toBe(4);
    expect(chargedUsd({})).toBeNaN();
  });
});
