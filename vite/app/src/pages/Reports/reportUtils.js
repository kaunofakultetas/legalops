// -----------------------------------------------------------
//  [*] reportUtils — small shared facts about reports
//
//  Pure helpers the report list, the report page and the
//  company page all need: which statuses are still moving,
//  a report's display title and its finding counts.
//
//  The counts follow the reviewer: a finding's effective
//  status (the override when a person set one) wins
//  everywhere a report's findings are at hand. The stored
//  stats were counted from the model's verdicts when the run
//  ended, so they are only the fallback for the list rows,
//  which carry no findings.
//
//  The counts are today's. A report also assesses the acts
//  that start to apply on a later date — as preparation: a
//  finding of such an act carries that date (appliesFrom),
//  and it is counted apart, never among the gaps of today.
//  Every act says what the report did with it
//  (actAssessment); a report made before acts said so
//  assessed every act that applied or might.
//
//  A report may be made in two parts with a person between
//  them: once the applicable acts are decided it waits in
//  "scope_review" until someone approves the list — changed
//  or not — and only then are the obligations judged. A
//  waiting report is not moving (nothing polls it, nothing
//  spins) and not finished either. The approver may go
//  against a verdict, and such an act says so ever after
//  (actChoice): one that does not bind the company and was
//  assessed all the same, as good practice, or one that
//  applies and was left out.
//
//  The citation audit (every reference the company's
//  documents make to a specific provision, checked against
//  the corpus) is a report of its own kind: a report from
//  before the audit carries no stats.citations, and
//  citationAudit answers null for it — "not run", which is
//  not the same as "no references found".
//
//  A finding has four parts — condition, criterion, cause,
//  consequence. The consequence is what a breach of the
//  provision can cost: the sanction tiers the report kept on
//  the finding, said in the words the PDF and the Excel
//  export print (consequenceText), and shown only for a gap
//  (isGap) of an act that binds the company today — a finding
//  of an act assessed as preparation (isUpcoming) carries
//  none. The cause is a person's sentence and needs no
//  helper.
//
//  A report may also assess the company's own rules: whether
//  its procedures carry out what its policies require. That
//  group hangs on one act row of its own and its findings are
//  told apart (isInternal) everywhere: they are gaps between
//  the company's policies and its procedures, not breaches of
//  law, so they are counted apart from the acts — never in
//  the headline counts — and a report without the group says
//  nothing of it (hasInternal). A cost estimate asked for the
//  group prices it apart (ownEstimate); it is the caller's
//  own expense, like the analysis itself (chargedUsd). Every
//  estimate says how many policy-level documents the company
//  has (policyDocuments) — with none there is nothing the
//  group could be read from.
//
//  Split into:
//
//    ACTIVE_STATUSES    — queued / running
//    FINDING_STATUSES   — the finding verdicts, worst first
//    FINDING_COLORS     — verdict → reserved status colour
//    PIPELINE_STEPS     — the analysis job's steps, in order
//    OPEN_STATUSES      — the verdicts that still need work
//    GAP_STATUSES       — the verdicts a breach may stand behind
//    CITATION_VERDICTS  — the citation audit's verdicts, problems first
//    CITATION_STAT_KEYS — verdict → its stats.citations key
//    PROBLEM_VERDICTS   — the verdicts that call for a correction
//    ASSESSMENTS        — what a report does with an act
//    isActive           — is the analysis still going
//    isWaiting          — does it wait for its acts' approval
//    reportTitle        — the title, or "Ataskaita, <date>"
//    effectiveStatus    — the reviewer's verdict, else the model's
//    actAssessment      — what the report did with an act
//    isAssessed         — does the report assess an act
//    actChoice          — an act decided against its verdict
//    isUpcoming         — is a finding preparation for a later date
//    isInternal         — does a row belong to the company's own rules
//    hasInternal        — does the report hold that group
//    reportSteps        — the steps of one report's run
//    ownEstimate        — an estimate's part for the company's own rules
//    policyDocuments    — how many policy-level documents an estimate counts
//    chargedUsd         — the part of an estimate the caller pays
//    isGap              — is a finding a gap
//    groupDigits        — a whole number, its thousands set apart
//    shortNumber        — a percentage or a multiple, as written
//    consequenceText    — what a breach can cost, in words
//    findingGroup       — which of the three counts a finding is in
//    reportFindings     — one group's findings, or null for a list row
//    findingCounts      — {met, partial, missing, unknown, not_applicable}
//    openBySeverity     — {critical, high, medium, low} of the open findings
//    citationVerdict    — one audit row's verdict
//    citationAudit      — the audit's counts, or null when it never ran
//    rowKeys            — a unique React key for every row of a list
// -----------------------------------------------------------

import { STATUS } from '@/components/charts/chartTokens';







// -----------------------------------------------------------
// ACTIVE_STATUSES
// -----------------------------------------------------------
//
// The report statuses that still change — pages poll while
// any row is in one of them. "scope_review" is not among
// them: such a report waits for a person, no job is at work
// and nothing changes until it is approved or cancelled.
//
// Used by:
//   - isActive (below)
// -----------------------------------------------------------

export const ACTIVE_STATUSES = ['queued', 'running'];







// -----------------------------------------------------------
// FINDING_STATUSES
// -----------------------------------------------------------
//
// FINDING_STATUSES of django analysis/models.py, in the
// order a reader triages them (worst first).
//
// Used by:
//   - ReportFindings.jsx — the filter chips
//   - FindingReviewDialog.jsx — the decision radios
//   - ReportOverview.jsx — the status bar
// -----------------------------------------------------------

export const FINDING_STATUSES = ['missing', 'partial', 'unknown', 'met', 'not_applicable'];







// -----------------------------------------------------------
// FINDING_COLORS
// -----------------------------------------------------------
//
// A verdict MEANS good / bad, so it wears the reserved
// status colours (always next to an icon and a label):
// met good, partial warning, missing critical; "not
// evidenced" and "not applicable" are neutral greys.
//
// Used by:
//   - ReportOverview.jsx — the status bar segments
// -----------------------------------------------------------

export const FINDING_COLORS = {
  met: STATUS.good, partial: STATUS.warning, missing: STATUS.critical, unknown: STATUS.neutral, not_applicable: '#c5ccd6',
};







// -----------------------------------------------------------
// PIPELINE_STEPS
// -----------------------------------------------------------
//
// The report.analyze job's JobStep names, in run order
// (django analysis/pipeline.py) — `citations` is the
// citation audit, right after the documents are read, and
// `internal` the assessment of the company's own
// requirements, which only a report started with that option
// runs (reportSteps).
//
// Used by:
//   - reportSteps (below)
//   - ReportProgress.jsx — where a run's first part ends
// -----------------------------------------------------------

export const PIPELINE_STEPS = ['profile', 'documents', 'citations', 'applicability', 'obligations', 'gap_analysis', 'internal', 'action_plan', 'summary'];







// -----------------------------------------------------------
// OPEN_STATUSES
// -----------------------------------------------------------
//
// The verdicts that still need work — an open finding is
// "not met" or "partial" (the stats' openBySeverity counts
// the same two).
//
// Used by:
//   - openBySeverity (below)
//   - ReportFindings.jsx — the groups' open counts
// -----------------------------------------------------------

export const OPEN_STATUSES = ['missing', 'partial'];







// -----------------------------------------------------------
// GAP_STATUSES
// -----------------------------------------------------------
//
// The verdicts behind which a breach may stand: not met,
// partial and — since nothing shows the duty is carried out —
// not evidenced. Only for these does a finding say what a
// breach can cost; the exports draw the same line.
//
// Used by:
//   - isGap (below)
// -----------------------------------------------------------

export const GAP_STATUSES = ['missing', 'partial', 'unknown'];







// -----------------------------------------------------------
// CITATION_VERDICTS
// -----------------------------------------------------------
//
// VERDICTS of django analysis/serializers.py, problems
// first: the document names a provision that regulates
// something else, one that does not exist, a claim that
// could not be judged, an act the corpus lacks (not
// checked), a correct reference.
//
// Used by:
//   - citationVerdict (below)
//   - ReportCitations.jsx — the filter toggles
//   - ReportOverview.jsx — the audit tile
// -----------------------------------------------------------

export const CITATION_VERDICTS = ['mismatch', 'not_found', 'unknown', 'act_not_in_corpus', 'match'];







// -----------------------------------------------------------
// CITATION_STAT_KEYS
// -----------------------------------------------------------
//
// Each verdict's key in stats.citations ({checked, match,
// mismatch, notFound, notInCorpus, unknown}).
//
// Used by:
//   - citationAudit (below)
//   - ReportOverview.jsx — the audit tile
// -----------------------------------------------------------

export const CITATION_STAT_KEYS = { mismatch: 'mismatch', not_found: 'notFound', unknown: 'unknown', act_not_in_corpus: 'notInCorpus', match: 'match' };







// -----------------------------------------------------------
// PROBLEM_VERDICTS
// -----------------------------------------------------------
//
// The verdicts a reader must act on — a wrong or a
// non-existent provision (what the action plan is given to
// correct).
//
// Used by:
//   - ReportCitations.jsx — the problems count
//   - ReportOverview.jsx — the audit tile's headline
// -----------------------------------------------------------

export const PROBLEM_VERDICTS = ['mismatch', 'not_found'];







// -----------------------------------------------------------
// ASSESSMENTS
// -----------------------------------------------------------
//
// ASSESSMENTS of django analysis/models.py — what a report
// does with an act once its applicability is judged: it is
// assessed; assessed as preparation for the date it starts
// to apply; left until the facts that decide its
// applicability are confirmed; a directive, assessed through
// the national law that transposes it; or it does not apply.
//
// Used by:
//   - actAssessment (below)
// -----------------------------------------------------------

export const ASSESSMENTS = ['assessed', 'upcoming', 'unconfirmed', 'indirect', 'none'];







// -----------------------------------------------------------
// isActive
// -----------------------------------------------------------
//
// True while the analysis is queued or running — not while
// it waits for its list of acts to be approved (isWaiting).
//
// Used by:
//   - ReportsTable.jsx, Reports.jsx — polling + progress bar
//   - ReportDetail.jsx — polling, the progress card
//   - CompanyReports.jsx, Dashboard.jsx — polling, counts
//   - StartAnalysisDialog.jsx — the running report link
// -----------------------------------------------------------

export function isActive(report) {
  return ACTIVE_STATUSES.includes(report?.status);
}







// -----------------------------------------------------------
// isWaiting
// -----------------------------------------------------------
//
// True while the report waits in "scope_review": the acts
// that apply are decided, and a person is asked to approve
// the list before the obligations are judged. Neither active
// nor ended — the page shows the approval screen instead of
// the progress card or the result.
//
// Used by:
//   - ReportDetail.jsx — the approval screen, its default tab
//   - StartAnalysisDialog.jsx — the report blocking a start
//   - Dashboard.jsx — the reports waiting for approval
// -----------------------------------------------------------

export function isWaiting(report) {
  return report?.status === 'scope_review';
}







// -----------------------------------------------------------
// reportTitle
// -----------------------------------------------------------
//
// The model-written title of a finished report; before that
// (or when empty) "Ataskaita, 2026-09-27" via `untitled`.
// A title that is not text (a broken answer) counts as none
// rather than throwing inside a table cell.
//
// Used by:
//   - ReportsTable.jsx, ReportDetail.jsx, Dashboard.jsx
// -----------------------------------------------------------

export function reportTitle(report, untitled, formatDate) {
  const title = typeof report?.title === 'string' ? report.title.trim() : '';
  return title || untitled.replace('{date}', formatDate(report?.createdAt));
}







// -----------------------------------------------------------
// effectiveStatus
// -----------------------------------------------------------
//
//   effectiveStatus(finding) → 'partial'
//
// The verdict that counts: the reviewer's override when a
// person set one, else the model's (the serializer's
// effectiveStatus says the same; the fallbacks cover a row
// patched in the cache and older answers).
//
// Used by:
//   - isGap, findingCounts, openBySeverity (below)
//   - ReportFindings.jsx — the cards, filters and groups
// -----------------------------------------------------------

export function effectiveStatus(finding) {
  return finding?.effectiveStatus || finding?.overrideStatus || finding?.status || null;
}







// -----------------------------------------------------------
// actAssessment
// -----------------------------------------------------------
//
// What the report did with an act — one of ASSESSMENTS. A
// report made before acts carried this is read as it was
// made: an act that does not apply (judged so, or screened
// out by the catalogue) was left, every other was assessed.
//
// Used by:
//   - ReportActs.jsx — the groups
//   - ReportOverview.jsx — the acts waiting and those to come
// -----------------------------------------------------------

export function actAssessment(act) {
  if (ASSESSMENTS.includes(act?.assessment)) return act.assessment;
  return act?.screenedOut || act?.applicability === 'not_applies' ? 'none' : 'assessed';
}







// -----------------------------------------------------------
// isAssessed
// -----------------------------------------------------------
//
// True when the report judges the act's obligations: it is
// assessed, or assessed as preparation for the date it starts
// to apply. On the approval screen this is the run's own
// decision — where an act's switch starts.
//
// Used by:
//   - actChoice (below)
//   - ReportActs.jsx — the note on a switch moved off
//   - ReportScope.jsx — the switches, and what differs
// -----------------------------------------------------------

export function isAssessed(act) {
  return ['assessed', 'upcoming'].includes(actAssessment(act));
}







// -----------------------------------------------------------
// actChoice
// -----------------------------------------------------------
//
// What the person who approved the list of acts decided
// against the verdict, read off the act itself: "chosen" for
// an act that does not bind the company and is assessed all
// the same (as good practice — its findings are a distance
// from that practice, not a breach), "leftOut" for an act
// that applies and is not assessed; null for every act the
// report treated as its verdict says. An act the catalogue
// screened out was never judged to apply, so it is never
// "left out".
//
// Used by:
//   - ReportActs.jsx — the two groups of their own
// -----------------------------------------------------------

export function actChoice(act) {
  if (isAssessed(act) && act?.applicability === 'not_applies') return 'chosen';
  if (actAssessment(act) === 'none' && act?.applicability === 'applies' && !act?.screenedOut) return 'leftOut';
  return null;
}







// -----------------------------------------------------------
// isUpcoming
// -----------------------------------------------------------
//
// True for a finding of an act that starts to apply on a
// later date (its appliesFrom): preparation, not a gap of
// today.
//
// Used by:
//   - findingGroup (below)
//   - ReportFindings.jsx — the groups and the cards' mark
//   - ReportActionPlan.jsx — the actions that only prepare
// -----------------------------------------------------------

export function isUpcoming(finding) {
  return Boolean(finding?.appliesFrom);
}







// -----------------------------------------------------------
// isInternal
// -----------------------------------------------------------
//
// True for a row of the company's own rules: the act row the
// group hangs on (its docType says "internal") and each of
// its findings (their sourceKind does). Such a row is no
// legal act and no breach of one — every view keeps it apart
// from the acts.
//
// Used by:
//   - hasInternal, findingGroup (below)
//   - ReportActs.jsx — the group of its own
//   - ReportScope.jsx — the acts a person decides on
//   - ReportFindings.jsx — the group and its cards' wording
// -----------------------------------------------------------

export function isInternal(row) {
  return row?.docType === 'internal' || row?.sourceKind === 'internal';
}







// -----------------------------------------------------------
// hasInternal
// -----------------------------------------------------------
//
// True when the report assessed the company's own
// requirements: its stats count them (stats.internal — all a
// list row carries), or its findings or acts hold a row of
// the group. A report without the group shows nothing of it.
//
// Used by:
//   - ReportOverview.jsx — the line of counts
// -----------------------------------------------------------

export function hasInternal(report) {
  const stored = report?.stats?.internal;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) return true;
  return [report?.findings, report?.acts].some((rows) => Array.isArray(rows) && rows.some(isInternal));
}







// -----------------------------------------------------------
// reportSteps
// -----------------------------------------------------------
//
// The steps of one report's run, in order: PIPELINE_STEPS
// without the assessment of the company's own requirements,
// unless the report was started with it (scope.internal) or
// its progress names that step all the same.
//
// Used by:
//   - ReportProgress.jsx — the step list and the overall bar
// -----------------------------------------------------------

export function reportSteps(report) {
  const own = report?.scope?.internal === true || report?.progress?.step === 'internal';
  return own ? PIPELINE_STEPS : PIPELINE_STEPS.filter((name) => name !== 'internal');
}







// -----------------------------------------------------------
// ownEstimate
// -----------------------------------------------------------
//
// The part of a cost estimate that prices the assessment of
// the company's own requirements — {documents, requirements,
// usd}, as numbers: the policy-level documents to read, the
// requirements expected, the cost — or null when the estimate
// was not asked for it. No documents is still an answer: the
// company has no policy-level document, and the option would
// do nothing.
//
// Used by:
//   - policyDocuments, chargedUsd (below)
//   - StartAnalysisDialog.jsx — the line in the estimate
//   - ReportScope.jsx — the line in the price panel
// -----------------------------------------------------------

export function ownEstimate(estimate) {
  const own = estimate?.internal;
  if (!own || typeof own !== 'object' || Array.isArray(own)) return null;
  return { documents: Number(own.documents) || 0, requirements: Number(own.requirements) || 0, usd: Number(own.usd) || 0 };
}







// -----------------------------------------------------------
// policyDocuments
// -----------------------------------------------------------
//
// How many policy-level documents the company has, as a cost
// estimate says it — every estimate does, asked for the
// company's own requirements or not — or null when this one
// does not say: none has loaded yet, or the answer is from
// before estimates said so. Such an answer may still price
// the requirements, and its count of documents is then
// taken. None means the option of the company's own
// requirements has nothing to read.
//
// Used by:
//   - StartAnalysisDialog.jsx — the option, off from the start
// -----------------------------------------------------------

export function policyDocuments(estimate) {
  const count = estimate?.policyDocuments;
  if (typeof count === 'number' && Number.isFinite(count)) return count;
  return ownEstimate(estimate)?.documents ?? null;
}







// -----------------------------------------------------------
// chargedUsd
// -----------------------------------------------------------
//
// The part of a cost estimate that meets the caller's own
// daily budget: the analysis and, when asked for, the
// assessment of the company's own requirements (the total
// holds it, analysisUsd does not) — but not the one-time
// reading of acts, which is shared corpus work. An estimate
// that does not tell the analysis apart is charged whole.
//
// Used by:
//   - StartAnalysisDialog.jsx, ReportScope.jsx — the
//     over-budget note
// -----------------------------------------------------------

export function chargedUsd(estimate) {
  if (estimate?.analysisUsd == null) return Number(estimate?.totalUsd);
  return Number(estimate.analysisUsd) + (ownEstimate(estimate)?.usd ?? 0);
}







// -----------------------------------------------------------
// isGap
// -----------------------------------------------------------
//
// True when the finding's effective verdict is one of
// GAP_STATUSES — the findings that may say what a breach can
// cost. A duty that is met, or does not apply, has no
// consequence to show whatever the report kept on it.
//
// Used by:
//   - ReportFindings.jsx — the consequence on a card
// -----------------------------------------------------------

export function isGap(finding) {
  return GAP_STATUSES.includes(effectiveStatus(finding));
}







// -----------------------------------------------------------
// groupDigits
// -----------------------------------------------------------
//
// A whole number with its thousands set apart by no-break
// spaces — how the exports write a fine in euros, in either
// language. Amounts are whole euros; a fraction is rounded.
//
// Used by:
//   - consequenceText (below)
// -----------------------------------------------------------

function groupDigits(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}







// -----------------------------------------------------------
// shortNumber
// -----------------------------------------------------------
//
// A percentage or a multiple as the exports write it
// (Python's %g): at most six significant digits, no trailing
// zeros, the language's decimal mark. The two notations agree
// over every value a share of turnover or a multiple of a
// benefit takes; they part only where %g turns to an
// exponent, from a million up.
//
// Used by:
//   - consequenceText (below)
// -----------------------------------------------------------

function shortNumber(value, decimal) {
  return String(Number(value.toPrecision(6))).replace('.', decimal);
}







// -----------------------------------------------------------
// consequenceText
// -----------------------------------------------------------
//
// What a breach of the finding's provision can cost, in the
// very words the PDF and the Excel export print (django
// analysis/exports.py consequence_text — the page and the
// file must agree to the character). For each sanction tier
// the report kept on the finding: the ceiling of the fine —
// in euros, as a share of annual turnover, as a multiple of
// the benefit, whichever the act states, joined by "or" —
// then the measures beside it, whom the tier binds when it
// binds only certain persons, the kind of breach it is bound
// to, and in brackets the act and provision it stands in
// with the provisions the measures come from. A tier
// without a ceiling is its measures alone; one with neither
// says nothing. Tiers are joined by "; ". A finding under a
// level 2 act carries the tiers of the article that act was
// adopted under (`via` on each), and the text ends by naming
// it. Empty when the finding carries no tier.
//
// `t` reads PAGES.report.CONSEQUENCE — the words of the
// export's LABELS in the UI language, a measure the table
// does not know staying the code it came as. The numbers
// keep the export's own spacing: no-break spaces inside an
// amount and before the percent sign.
//
// A ceiling the act provides, not a forecast — and whether a
// finding shows it at all is the caller's question: only a
// gap does (isGap), and not one of an act that does not bind
// the company yet (isUpcoming).
//
// Used by:
//   - ReportFindings.jsx — the consequence on a card
// -----------------------------------------------------------

export function consequenceText(finding, t) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const stated = (value) => typeof value === 'number' && Number.isFinite(value) && value !== 0;
  const measureName = (code) => (t(`MEASURES.${code}`) === `MEASURES.${code}` ? String(code) : t(`MEASURES.${code}`));
  const parts = [];
  for (const tier of list(finding?.consequence)) {
    if (!tier || typeof tier !== 'object') continue;
    const ceilings = [];
    if (stated(tier.maxFineEur)) ceilings.push(`${groupDigits(tier.maxFineEur)} EUR`);
    if (stated(tier.maxFinePercent)) ceilings.push(`${shortNumber(tier.maxFinePercent, t('decimal'))}\u00a0% ${t('ofTurnover')}`);
    if (stated(tier.benefitMultiple)) ceilings.push(`${shortNumber(tier.benefitMultiple, t('decimal'))} ${t('benefit')}`);
    const measures = list(tier.measures).map(measureName).join(', ');
    const fine = ceilings.length ? `${t('fine')} ${ceilings.join(` ${t('or')} `)}` : '';
    const what = fine && measures ? `${fine}; ${t('also')}: ${measures}` : fine || measures;
    if (!what) continue;
    const where = [tier.act, tier.path, tier.where].filter(Boolean).join(' ');
    const also = list(tier.measuresFrom).map((source) => `, ${source}`).join('');
    const persons = list(tier.persons).filter(Boolean).join(', ');
    const limits = [persons && `${t('onlyFor')}: ${persons}`, tier.condition].filter(Boolean).join('; ');
    const bound = limits ? ` – ${limits}` : '';
    parts.push(`${what}${bound} (${where}${also})`);
  }
  const via = list(finding?.consequence).find((tier) => tier && typeof tier.via === 'object' && tier.via?.act)?.via;
  if (parts.length && via) return `${parts.join('; ')} – ${[t('via'), via.act, via.path].filter(Boolean).join(' ')}`;
  return parts.join('; ');
}







// -----------------------------------------------------------
// findingGroup
// -----------------------------------------------------------
//
// Which of a report's three counts a finding belongs to:
// "internal" for one of the company's own requirements,
// "upcoming" for one of an act that applies from a later
// date, "current" for every other — the result of today.
//
// Used by:
//   - reportFindings (below)
// -----------------------------------------------------------

function findingGroup(finding) {
  if (isInternal(finding)) return 'internal';
  return isUpcoming(finding) ? 'upcoming' : 'current';
}







// -----------------------------------------------------------
// reportFindings
// -----------------------------------------------------------
//
// The report's findings of one group (findingGroup) as a list
// of rows — those of the acts in force, those of the acts
// assessed as preparation, or those of the company's own
// requirements — or null when the report carries none (a
// list row); anything else the answer holds there is ignored.
//
// Used by:
//   - findingCounts, openBySeverity (below)
// -----------------------------------------------------------

function reportFindings(report, group) {
  if (!Array.isArray(report?.findings)) return null;
  return report.findings.filter((finding) => finding && typeof finding === 'object' && findingGroup(finding) === group);
}







// -----------------------------------------------------------
// findingCounts
// -----------------------------------------------------------
//
// The per-status counts of the acts in force — or, with
// `upcoming`, of the acts assessed as preparation, or, with
// `internal`, of the company's own requirements — zeros for
// a report that has none: from the findings' effective
// statuses when the report carries them (the detail), else
// from the report's stats (the list rows — stats.findings,
// stats.upcoming.findings, stats.internal.findings). The
// three never mix: the headline counts hold neither the
// preparation nor the company's own requirements.
//
// Used by:
//   - ReportsTable.jsx — the findings column
//   - ReportOverview.jsx — the summary cards, the status bars,
//     the line of the company's own requirements
//   - pages/Chat/ToolCards.jsx — the report card of a run it
//     followed to its end
// -----------------------------------------------------------

export function findingCounts(report, { upcoming = false, internal = false } = {}) {
  const group = (internal && 'internal') || (upcoming && 'upcoming') || 'current';
  const findings = reportFindings(report, group);
  let counts = (group === 'current' ? report?.stats?.findings : report?.stats?.[group]?.findings) || {};
  if (findings) {
    counts = {};
    for (const finding of findings) counts[effectiveStatus(finding)] = (counts[effectiveStatus(finding)] || 0) + 1;
  }
  return {
    met: Number(counts.met) || 0,
    partial: Number(counts.partial) || 0,
    missing: Number(counts.missing) || 0,
    unknown: Number(counts.unknown) || 0,
    not_applicable: Number(counts.not_applicable) || 0,
  };
}







// -----------------------------------------------------------
// openBySeverity
// -----------------------------------------------------------
//
// How many open findings (OPEN_STATUSES, by effective
// status) of the acts in force each severity holds — from
// the findings when the report carries them, else
// report.stats.openBySeverity. A severity with none may be
// absent. The findings of an act that applies later and
// those of the company's own requirements are not among
// them.
//
// Used by:
//   - ReportOverview.jsx — the severity tiles
// -----------------------------------------------------------

export function openBySeverity(report) {
  const findings = reportFindings(report, 'current');
  if (!findings) return { ...(report?.stats?.openBySeverity || {}) };
  const counts = {};
  for (const finding of findings) {
    if (OPEN_STATUSES.includes(effectiveStatus(finding))) counts[finding.severity] = (counts[finding.severity] || 0) + 1;
  }
  return counts;
}







// -----------------------------------------------------------
// citationVerdict
// -----------------------------------------------------------
//
//   citationVerdict({ status: 'found', headingMatch: 'mismatch' }) → 'mismatch'
//
// One audit row's verdict: the `verdict` the server sent
// when it is one of CITATION_VERDICTS, else derived the way
// the server derives it (a missing act or provision says so;
// a found one is its heading match; anything else could not
// be judged).
//
// Used by:
//   - citationAudit (below)
//   - ReportCitations.jsx — the chips, the filter and its counts
// -----------------------------------------------------------

export function citationVerdict(row) {
  if (CITATION_VERDICTS.includes(row?.verdict)) return row.verdict;
  if (row?.status === 'not_found' || row?.status === 'act_not_in_corpus') return row.status;
  return ['match', 'mismatch'].includes(row?.headingMatch) ? row.headingMatch : 'unknown';
}







// -----------------------------------------------------------
// citationAudit
// -----------------------------------------------------------
//
//   citationAudit(report) → { checked: 12, match: 7, mismatch: 2, notFound: 1, notInCorpus: 1, unknown: 1 }
//   citationAudit(reportFromBefore) → null
//
// The citation audit's counts, or null when the report ran
// before the audit existed (its stats carry no `citations`
// object). Counted from the rows when the report carries
// them (the detail — what the tab lists), else taken from
// stats.citations (a list row).
//
// Used by:
//   - ReportCitations.jsx — "not run" vs "nothing found"
//   - ReportOverview.jsx — the audit tile
//   - ReportDetail.jsx — the tab's count
// -----------------------------------------------------------

export function citationAudit(report) {
  const stored = report?.stats?.citations;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  const counts = { checked: 0, match: 0, mismatch: 0, notFound: 0, notInCorpus: 0, unknown: 0 };
  if (Array.isArray(report?.citations)) {
    for (const row of report.citations) {
      if (!row || typeof row !== 'object') continue;
      counts.checked += 1;
      counts[CITATION_STAT_KEYS[citationVerdict(row)]] += 1;
    }
    return counts;
  }
  for (const key of Object.keys(counts)) counts[key] = Number(stored[key]) || 0;
  return counts;
}







// -----------------------------------------------------------
// rowKeys
// -----------------------------------------------------------
//
//   const keyOf = rowKeys(report.findings);
//   shown.map((f) => <FindingCard key={keyOf.get(f)} … />)
//
// A React key for every row of a report's list, by the row
// object: its id for the first row that carries it, else
// its position — so a row without an id, or repeating one (a
// malformed answer), is still shown, without React's missing
// or duplicate key. The prefixes keep an id "3" apart from
// position 3.
//
// Used by:
//   - ReportActs.jsx, ReportFindings.jsx, ReportActionPlan.jsx,
//     ReportCitations.jsx
// -----------------------------------------------------------

export function rowKeys(rows) {
  const keys = new Map();
  const seen = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const id = row && typeof row === 'object' ? row.id : undefined;
    const usable = (typeof id === 'string' || typeof id === 'number') && id !== '' && !seen.has(String(id));
    if (usable) seen.add(String(id));
    keys.set(row, usable ? `id:${id}` : `at:${index}`);
  });
  return keys;
}
