// -----------------------------------------------------------
//  [*] Assistant tools — compliance analyses (reports)
//
//  The gap-analysis pipeline runs in Django's worker; these
//  tools price it, start it, approve what it assesses, stop
//  it, find and read its reports and record a reviewer's
//  verdict:
//
//    estimateAnalysisCost · runComplianceAnalysis
//    approveReportScope · cancelAnalysis · listReports
//    getReport · overrideFinding
//
//  A report is found, never asked for: listReports answers
//  the user's reports (one company's, when named), and every
//  turn's company context lists the linked company's (llm/
//  prompt.js). getReport then reads one: with the id alone
//  the overview — the counts by status whole and per act, the
//  summary, the plan, the citation audit — and with a filter
//  (status, severity, act) or an offset its findings only, a
//  page at a time, so every finding of a report of thousands
//  can be reached without the overview repeated on each page.
//
//  A report's result is what binds the company today. The
//  findings of an act that applies only from a later date are
//  preparation: counted apart (counts.upcoming), listed after
//  today's and marked with that date, so the model never
//  presents them as a breach. The overview also names the
//  acts the report did NOT assess — applicability waiting for
//  facts, with the questions that decide it, directives
//  standing behind their national law, and acts that only
//  organise an authority or a procedure before it.
//
//  A report is made in two parts. The first decides which
//  acts apply and is cheap; the second judges every
//  obligation of those acts and is where the money goes. A
//  run started here stops between them, in scope_review,
//  unless the user said to run it without the review:
//  getReport then answers the list of acts — what the run
//  would assess, what it would not and why — with the price
//  of the second part, and approveReportScope continues the
//  run once the user has seen both and said yes, with the
//  acts they took in or left out. An act taken in although
//  it does not bind the company is assessed as good practice;
//  a finished report names those acts apart, and the acts
//  that apply but were left out.
//
//  A run spends real money from a small shared AI budget, so
//  both steps are gated: runComplianceAnalysis re-prices the
//  scope and starts only when the total the user accepted
//  covers it — otherwise COST_NOT_CONFIRMED — and
//  approveReportScope does the same with the acts chosen. An
//  estimate with no total, or with a model whose price is
//  unknown (the total is then only a floor), is refused as
//  COST_UNKNOWN: the gate fails closed, and the Reports page
//  can still start the run or approve its acts.
//
//  The report answers share one card shape, which the chat
//  renders with a link to the report's page. That card
//  follows a run live, so a start's answer tells the model
//  not to read the report again in the same turn. A start
//  Django refuses as ALREADY_RUNNING answers the report that
//  holds the company instead — running, or waiting for its
//  scope — so the model can follow it with getReport.
//
//  A finding says what a breach of its provision can cost
//  (canCost): the ceiling of the fine and the measures the
//  act itself provides, in one English line, for a gap only
//  and only under an act already in force. It is a ceiling,
//  never a forecast of what the company will pay. Why the
//  gap exists (cause) is the one part of a finding only a
//  person writes, in the finding's review dialog on the
//  report's page: the row carries it once written, and no
//  tool here writes or files one — overrideFinding's reason
//  is a reviewer's note on a verdict, not a cause.
//
//  A report can also measure the company against itself:
//  whether its procedures carry out what its own policies
//  require, when the estimate and the start are given
//  internalRequirements. Those findings are gaps between the
//  company's policies and its procedures, not breaches of
//  law, so they stand apart everywhere: counted under
//  ownRequirements, absent from the counts and the lists of
//  the acts, and listed only when asked for as the act
//  "internal" — each with the passage of the policy that is
//  its criterion where a legal provision would be.
//
//  A finished report also looks back, once the company has
//  earlier ones. A finding says how the same obligation stood
//  in them (before): the earlier statuses with their dates,
//  the newest first. The overview says what moved since the
//  previous report (sinceLastReport): the gaps that are met
//  now, the new gaps, and the obligations that were met and
//  are a gap again. What became of a report's plan is not
//  told here: once a person signs the report off on its page,
//  its actions live in the company's register (llm/tools/
//  actions.js). No tool here signs a report off.
//
//  Split into:
//
//    countBy           — a tally of rows by a key
//    ownShareOf        — what the own requirements add
//    estimateOf        — the estimate, compacted
//    scopeEstimateOf   — the price of a report's second part
//    costShares        — what an estimate's total is made of
//    tally             — findings by status, open by severity
//    reportCard        — the shared report shape
//    ownRequirementsOf — the own requirements, counted apart
//    actOf             — the name a report shows an act by
//    assessmentOf      — what a report does with an act
//    countsByAct       — the finding counts of every act
//    actGroups         — the acts by what the report did
//    scopeOf           — the acts a waiting report asks about
//    canCostOf         — what a breach can cost, in words
//    beforeOf          — how an obligation stood before
//    findingRow        — one finding for the model
//    sinceLastOf       — what moved since the previous report
//    citationAudit     — the audit of the documents' references
//    reportTools       — the group (named export)
// -----------------------------------------------------------

import { z } from "zod";

import {
  FINDING_STATUSES, REPORT_STATUSES, SEVERITIES, ToolFailure, defineTool, filled, id, query, trimText, url,
} from "./shared.js";


// Findings the user must act on first come first (those of
// the acts in force before preparation for later ones)
const STATUS_ORDER = ["missing", "partial", "unknown", "met", "not_applicable"];

// The most findings getReport lists in one answer
const MAX_FINDINGS = 25;

// The most reports listReports answers, newest first
const MAX_REPORTS = 20;

// The most actions of the plan getReport lists
const MAX_ACTIONS = 25;

// The most acts of one group getReport lists
const MAX_ACTS = 15;

// The verdicts that are an open gap
const OPEN_STATUSES = ["missing", "partial"];

// The most wrong references of the citation audit it lists
const MAX_CITATION_PROBLEMS = 15;

// The audit's verdicts that are a problem in a document
const CITATION_PROBLEMS = ["mismatch", "not_found"];

// The states in which a report holds its company: Django
// starts no other until it has ended or been stopped
const ACTIVE_STATUSES = ["queued", "running", "scope_review"];

// What a report does with an act whose obligations it judges:
// assessed for today, or as preparation for a later date
const ASSESSED = ["assessed", "upcoming"];

// The most acts getReport lists of a report that waits for
// its scope — of those the run judged, and again of those the
// catalogue screened out
const MAX_SCOPE_ACTS = 40;

// The order of a waiting report's acts: what the run would
// assess first, then what it would not, by the reason
const SCOPE_ORDER = ["assessed", "upcoming", "unconfirmed", "indirect", "notApplicable"];

// The slack of both cost gates, in USD: half a cent for
// rounding, since the user accepted the total as shown, in
// cents
const COST_SLACK_USD = 0.005;

// Which corpus acts an analysis covers — one field for the
// estimate and the start, so both price the same scope
const SCOPE_FIELD = z.array(filled(100)).max(200).optional()
  .describe("Limit the analysis to these corpus acts (ids from listLegalActs) — narrower is cheaper");

// Django's word for the company's own requirements — its
// policies as criteria: the sourceKind of such a finding, the
// docType of the one act row they hang on, and what
// getReport's act filter takes to list them
const OWN = "internal";

// What ownRequirements says of itself in every answer, so no
// gap between a policy and a procedure is told as a breach
const OWN_NOTE = "the company's own policies as criteria — gaps between its policies and its procedures, counted apart "
  + "from the acts; not breaches of law";

// The verdicts that are a gap: what a breach can cost is said
// of these only, as on the report's own pages
const GAP_STATUSES = ["missing", "partial", "unknown"];

// The most characters of a finding's canCost — room for two
// whole sanction tiers, an act's own and a national act's —
// and of its cause
const MAX_CAN_COST = 500;
const MAX_CAUSE = 600;

// The most earlier statuses of its obligation a finding names
// (Django keeps four), and the most titles the overview names
// of the obligations that went back or are new since the
// previous report, each cut to so many characters
const MAX_BEFORE = 3;
const MAX_MOVED_TITLES = 3;
const MAX_MOVED_TITLE = 150;

// The measures a sanction tier names, by Django's codes, in
// the words of its English report (analysis/exports.py,
// LABELS.en.measures) — keep the two alike
const MEASURES = {
  withdrawal: "withdrawal or suspension of the authorisation", restriction: "restriction or suspension of an activity",
  cease: "an order to end the breach", public_statement: "a public statement on the breach",
  management_ban: "removal of managers or a ban on management functions", disgorgement: "surrender of the benefit gained",
  periodic_penalty: "a periodic penalty", criminal: "criminal liability", other: "other measures",
};







// -----------------------------------------------------------
// countBy
// -----------------------------------------------------------
//
// Tallies rows by the value a key function picks from each —
// the counts by status, severity and applicability a report
// card carries.
//
// Used by:
//   - tally, reportCard, countsByAct (below)
// -----------------------------------------------------------

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = key(row);
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}







// -----------------------------------------------------------
// ownShareOf
// -----------------------------------------------------------
//
// What assessing the company's own requirements adds to a
// price, from the `internal` block of Django's estimate: the
// policy-level documents the run would read, the requirements
// it expects of them and their USD, which the estimate's
// total already holds. No documents means the company has no
// policy-level document, and the option then does nothing. A
// figure Django leaves out reads as unknown, never as zero.
//
// Used by:
//   - estimateOf, scopeEstimateOf (below)
// -----------------------------------------------------------

function ownShareOf(block) {
  return { documents: block?.documents ?? null, requirements: block?.requirements ?? null, usd: block?.usd ?? null };
}







// -----------------------------------------------------------
// estimateOf
// -----------------------------------------------------------
//
// Django's estimate for a company and a scope, as the model
// needs it: the upper-bound USD total — the analysis plus the
// one-time extraction of obligations from acts not processed
// yet — what it covers, and the user's daily budget. With
// `own` the company's own requirements are priced too: the
// total then holds their share, answered as ownRequirements —
// with nothing in it known when Django answered no such
// block. A flag Django leaves out reads the cautious way: an
// upper bound, prices not known.
//
// Used by:
//   - reportTools (below) — estimateAnalysisCost,
//     runComplianceAnalysis
// -----------------------------------------------------------

async function estimateOf(django, companyId, documentIds, own = false) {
  const answer = await django.get(`/api/reports/estimate${query({
    companyId, documentIds: documentIds?.length ? documentIds.join(",") : null, internal: own ? true : null,
  })}`);
  return {
    totalUsd: answer?.totalUsd ?? null, analysisUsd: answer?.analysisUsd ?? null,
    extractionUsd: answer?.extractionUsd ?? null, upperBound: answer?.upperBound ?? true,
    pricesKnown: answer?.pricesKnown ?? false, acts: answer?.acts ?? null, obligations: answer?.obligations ?? null,
    actsToExtract: answer?.actsToExtract ?? null, ...(own ? { ownRequirements: ownShareOf(answer?.internal) } : {}),
    budget: answer?.budget ?? null,
  };
}







// -----------------------------------------------------------
// scopeEstimateOf
// -----------------------------------------------------------
//
// What the second part of a report that waits for its scope
// would cost: Django's dry run of the approval, which stores
// nothing. `choices` maps act ids to "assess" or "skip"; an
// act not named keeps what the run decided, so no choices
// price the run's own plan. The answer is the upper-bound USD
// total with its analysis and one-time extraction shares, the
// obligations to judge, the same count per act — with whether
// the act is yet to be read, its count then a guess — and the
// user's daily budget. A run started with the company's own
// requirements judges them in this part: Django's total then
// holds their share, answered as ownRequirements. A flag
// Django leaves out reads the cautious way: an upper bound,
// prices not known.
//
// Used by:
//   - reportTools (below) — getReport, approveReportScope
// -----------------------------------------------------------

async function scopeEstimateOf(django, reportId, choices = {}) {
  const answer = await django.post(url`/api/reports/${reportId}/scope`, { acts: choices });
  const estimate = answer?.estimate;
  return {
    totalUsd: estimate?.totalUsd ?? null, analysisUsd: estimate?.analysisUsd ?? null,
    extractionUsd: estimate?.extractionUsd ?? null, upperBound: estimate?.upperBound ?? true,
    pricesKnown: estimate?.pricesKnown ?? false, obligations: estimate?.obligations ?? null,
    ...(estimate?.internal ? { ownRequirements: ownShareOf(estimate.internal) } : {}),
    acts: Array.isArray(estimate?.acts) ? estimate.acts : [], budget: answer?.budget ?? null,
  };
}







// -----------------------------------------------------------
// costShares
// -----------------------------------------------------------
//
// What an estimate's total is made of, for the refusal of a
// cost gate: the analysis and the one-time extraction, and
// the company's own requirements when the estimate prices
// them — without that share the parts named would not add up
// to the total the user is asked to accept.
//
// Used by:
//   - reportTools (below) — runComplianceAnalysis,
//     approveReportScope
// -----------------------------------------------------------

function costShares(estimate) {
  const own = estimate.ownRequirements?.usd;
  return `analysis $${(estimate.analysisUsd ?? 0).toFixed(2)} + extraction $${(estimate.extractionUsd ?? 0).toFixed(2)}`
    + (Number.isFinite(own) ? ` + own requirements $${own.toFixed(2)}` : "");
}







// -----------------------------------------------------------
// tally
// -----------------------------------------------------------
//
// Findings counted by their effective status — a reviewer's
// override winning over the model's verdict — and the open
// ones among them by severity.
//
// Used by:
//   - reportCard, ownRequirementsOf (below)
// -----------------------------------------------------------

function tally(findings) {
  return {
    findings: countBy(findings, (f) => f.effectiveStatus),
    openBySeverity: countBy(findings.filter((f) => OPEN_STATUSES.includes(f.effectiveStatus)), (f) => f.severity),
  };
}







// -----------------------------------------------------------
// reportCard
// -----------------------------------------------------------
//
// The shared report shape: the report row — status, progress,
// error, the page's link — and its counts. The finding counts
// are those of the acts in force for the company; the
// findings of acts that apply from a later date are counted
// under `upcoming`, present only when the report has any.
// With the findings loaded (the detail route) both follow the
// effective status; without them they are the pipeline's
// stats. The company's own requirements are no act: neither
// the row they hang on nor their findings are counted here,
// as Django's stats leave them out (ownRequirementsOf counts
// them).
//
// Used by:
//   - reportTools (below) — runComplianceAnalysis,
//     approveReportScope, cancelAnalysis, listReports,
//     getReport
// -----------------------------------------------------------

function reportCard(report) {
  const findings = Array.isArray(report.findings) ? report.findings.filter((f) => f.sourceKind !== OWN) : null;
  const today = findings ? tally(findings.filter((f) => !f.appliesFrom)) : null;
  const later = findings ? findings.filter((f) => f.appliesFrom) : null;
  const upcoming = later ? (later.length ? tally(later) : null) : report.stats?.upcoming ?? null;
  return {
    report: {
      id: report.id, companyId: report.companyId, companyName: report.companyName ?? null,
      status: report.status, jobStatus: report.jobStatus ?? null, language: report.language,
      title: report.title || null, createdAt: report.createdAt, finishedAt: report.finishedAt ?? null,
      progress: report.progress
        ? { step: report.progress.step ?? null, percent: report.progress.percent ?? null, message: report.progress.message ?? null }
        : null,
      error: report.error ? trimText(report.error, 300) : null,
      url: `/reports/${report.id}`,
    },
    counts: {
      acts: report.stats?.acts
        ?? (Array.isArray(report.acts) ? countBy(report.acts.filter((a) => a.docType !== OWN), (a) => a.applicability) : null),
      findings: today ? today.findings : report.stats?.findings ?? null,
      openBySeverity: today ? today.openBySeverity : report.stats?.openBySeverity ?? null,
      ...(upcoming ? { upcoming } : {}),
      actions: report.stats?.actions ?? (Array.isArray(report.actions) ? report.actions.length : null),
    },
  };
}







// -----------------------------------------------------------
// ownRequirementsOf
// -----------------------------------------------------------
//
// The company's own requirements of a report that assessed
// them — whether its procedures carry out what its own
// policies require — counted apart from the acts: the
// findings by effective status, the open ones by severity,
// and a note that says what they are, since such a gap is
// never a breach of law. With the findings loaded the counts
// follow the effective status, as the card's do; without
// them they are the pipeline's (stats.internal). Nothing for
// a report without the group.
//
// Used by:
//   - reportTools (below) — getReport
// -----------------------------------------------------------

function ownRequirementsOf(report) {
  const rows = (Array.isArray(report.findings) ? report.findings : []).filter((f) => f.sourceKind === OWN);
  const counted = rows.length ? tally(rows) : report.stats?.internal;
  if (!counted) return null;
  return { counts: counted.findings ?? null, openBySeverity: counted.openBySeverity ?? null, note: OWN_NOTE };
}







// -----------------------------------------------------------
// actOf
// -----------------------------------------------------------
//
// The act a finding belongs to, by the name the report shows:
// its short title, else its full title. An act's own row
// carries the same two fields and is named the same way.
//
// Used by:
//   - countsByAct, scopeOf, findingRow (below)
//   - reportTools (below) — getReport's act filter
// -----------------------------------------------------------

function actOf(finding) {
  return finding.shortTitle || finding.documentTitle || null;
}







// -----------------------------------------------------------
// assessmentOf
// -----------------------------------------------------------
//
// What a report does with an act, as Django's ASSESSMENTS
// name it: assessed, upcoming, unconfirmed, indirect or none.
// A report made before acts carried this is read as it was
// made: every act that applied, or might, was assessed.
//
// Used by:
//   - actGroups, scopeOf (below)
// -----------------------------------------------------------

function assessmentOf(act) {
  return act.assessment ?? (act.applicability === "not_applies" ? "none" : "assessed");
}







// -----------------------------------------------------------
// countsByAct
// -----------------------------------------------------------
//
// The finding counts of every act of a report, by effective
// status, the acts with the most open gaps (not met, partly
// met) first — the answer to "how compliant are we, and
// where". An act that applies only from a later date carries
// that date and stands after the acts in force. The caller
// hands it the findings of the acts only: the company's own
// requirements are no act and have no row here.
//
// Used by:
//   - reportTools (below) — getReport
// -----------------------------------------------------------

function countsByAct(findings) {
  const acts = new Map();
  for (const finding of findings) {
    const act = actOf(finding) || "—";
    if (!acts.has(act)) acts.set(act, []);
    acts.get(act).push(finding);
  }
  const open = (counts) => (counts.missing || 0) + (counts.partial || 0);
  return [...acts]
    .map(([act, rows]) => ({
      act, ...(rows[0].appliesFrom ? { appliesFrom: rows[0].appliesFrom } : {}),
      total: rows.length, ...countBy(rows, (f) => f.effectiveStatus),
    }))
    .sort((a, b) => Boolean(a.appliesFrom) - Boolean(b.appliesFrom) || open(b) - open(a) || b.total - a.total);
}







// -----------------------------------------------------------
// actGroups
// -----------------------------------------------------------
//
// The acts of a report by what it did with them: those it
// assessed, those it assessed as preparation (with the date
// they apply from), those it left until the company answers
// the questions that decide their applicability, the
// directives it assessed through national law, and the acts
// that only organise an authority or a procedure. Two groups
// tell where the person who approved the scope decided
// against the run's verdict: assessedByChoice — acts that do
// not bind the company and were assessed all the same, as
// good practice, named there and not among the assessed —
// and leftOutByReviewer — acts that apply and were not
// assessed. Every other act that does not apply is left out,
// and so is a group with nothing in it. The row the company's
// own requirements hang on is in none of them: Django files
// it among the acts as assessed, and it is no act.
//
// Used by:
//   - reportTools (below) — getReport
// -----------------------------------------------------------

function actGroups(acts) {
  const name = (a) => a.shortTitle || a.documentTitle;
  const judged = acts.filter((a) => !a.screenedOut && a.docType !== OWN);
  const chosen = (a) => ASSESSED.includes(a.assessment) && a.applicability === "not_applies";
  const of = (wanted) => judged.filter((a) => !chosen(a) && assessmentOf(a) === wanted).slice(0, MAX_ACTS);
  const groups = {
    assessed: of("assessed").map((a) => ({ act: name(a), applicability: a.applicability, confidence: a.confidence })),
    upcoming: of("upcoming").map((a) => ({ act: name(a), appliesFrom: a.appliesFrom ?? null })),
    assessedByChoice: judged.filter(chosen).slice(0, MAX_ACTS).map(name),
    toConfirm: of("unconfirmed").map((a) => ({
      act: name(a), why: trimText(a.reasoning, 300), questions: trimText(a.conditionsToVerify, 600),
    })),
    throughNationalLaw: of("indirect").filter((a) => a.docType === "directive").map(name),
    institutional: of("indirect").filter((a) => a.docType !== "directive").map(name),
    leftOutByReviewer: judged.filter((a) => a.assessment === "none" && a.applicability === "applies")
      .slice(0, MAX_ACTS).map(name),
  };
  return Object.fromEntries(Object.entries(groups).filter(([, rows]) => rows.length));
}







// -----------------------------------------------------------
// scopeOf
// -----------------------------------------------------------
//
// What a report that waits for its scope asks its user to
// approve, kept small. Every act the run judged, with its id
// for approveReportScope: the run's verdict, the plan —
// assess or skip — and why: assessed, upcoming (with the date
// it applies from), unconfirmed (with the questions that
// decide it), indirect or notApplicable; the reasoning, cut
// short; and, for an act in the plan, how many obligations
// the second part would judge. The acts in the plan come
// first. The acts the catalogue screened out before any
// verdict are only counted and named, with their ids, since
// the user may take one in all the same. Beside them what the
// run has spent so far and the price of its second part.
//
// Used by:
//   - reportTools (below) — getReport
// -----------------------------------------------------------

function scopeOf(report, estimate) {
  const { acts: priced, ...price } = estimate;
  const acts = Array.isArray(report.acts) ? report.acts : [];
  const screened = acts.filter((a) => a.screenedOut);
  const rows = acts.filter((a) => !a.screenedOut).map((a) => {
    const mode = assessmentOf(a);
    const counted = priced.find((row) => row?.id === a.id);
    return {
      id: a.id, act: actOf(a), type: a.docType ?? null, verdict: a.applicability ?? null,
      plan: ASSESSED.includes(mode) ? "assess" : "skip", why: mode === "none" ? "notApplicable" : mode,
      ...(mode === "upcoming" ? { appliesFrom: a.appliesFrom ?? null } : {}),
      reason: trimText(a.reasoning, 200),
      ...(mode === "unconfirmed" ? { questions: trimText(a.conditionsToVerify, 400) } : {}),
      ...(counted ? { obligations: counted.obligations ?? null, toExtract: Boolean(counted.toExtract) } : {}),
    };
  }).sort((a, b) => SCOPE_ORDER.indexOf(a.why) - SCOPE_ORDER.indexOf(b.why));
  return {
    waiting: true,
    spentUsd: report.stats?.costUsd ?? null,
    acts: rows.slice(0, MAX_SCOPE_ACTS),
    moreActs: Math.max(0, rows.length - MAX_SCOPE_ACTS),
    screenedOut: {
      count: screened.length,
      acts: screened.slice(0, MAX_SCOPE_ACTS).map((a) => ({ id: a.id, act: actOf(a) })),
    },
    estimate: price,
    next: "show the user what will be assessed, what will not and why, and estimate.totalUsd; after their yes call "
      + "approveReportScope, naming in assess / skip only the acts whose plan the user changed",
  };
}







// -----------------------------------------------------------
// canCostOf
// -----------------------------------------------------------
//
// What a breach of a finding's provision can cost, as one
// English line: the wording of Django's consequence_text
// (analysis/exports.py) with its English labels, so the chat
// and the report's PDF say the same. For each sanction tier
// the report kept on the finding: the ceiling of the fine —
// in euros, as a share of annual turnover, as a multiple of
// the benefit, whichever the act states — the measures beside
// it, whom the tier binds when it binds only certain persons
// and the kind of breach it is bound to (both in the act's
// own language), and in brackets the act and provision the
// tier stands in, with the provisions its measures come from.
// A tier with neither a ceiling nor a measure says nothing.
// A finding under a level 2 act carries the tiers of the
// article that act was adopted under, and the line ends by
// naming it.
// The numbers are written for a model, not for print: commas
// between the thousands and no non-breaking space; a share
// and a multiple keep six significant digits, as Django's %g
// does. Empty when the finding carries no tier — a report
// made before findings carried them, or a requirement of the
// company's own.
//
// Used by:
//   - findingRow (below)
// -----------------------------------------------------------

function canCostOf(finding) {
  const plain = (value) => String(Number(Number(value).toPrecision(6)));
  const parts = [];
  for (const tier of finding.consequence || []) {
    const ceilings = [
      tier?.maxFineEur ? `EUR ${Math.round(tier.maxFineEur).toLocaleString("en-US")}` : "",
      tier?.maxFinePercent ? `${plain(tier.maxFinePercent)}% of annual turnover (income)` : "",
      tier?.benefitMultiple ? `${plain(tier.benefitMultiple)} times the benefit gained or loss avoided` : "",
    ].filter(Boolean);
    const measures = (tier?.measures || []).map((code) => (Object.hasOwn(MEASURES, code) ? MEASURES[code] : code)).join(", ");
    const fine = ceilings.length ? `a fine of up to ${ceilings.join(" or ")}` : "";
    const what = fine && measures ? `${fine}; also: ${measures}` : fine || measures;
    if (!what) continue;
    const where = [tier.act, tier.path, tier.where].filter(Boolean).join(" ");
    const sources = (tier.measuresFrom || []).map((source) => `, ${source}`).join("");
    const persons = (tier.persons || []).filter(Boolean).join(", ");
    const limits = [persons && `only for: ${persons}`, tier.condition].filter(Boolean).join("; ");
    parts.push(`${what}${limits ? ` – ${limits}` : ""} (${where}${sources})`);
  }
  const via = (finding.consequence || []).find((tier) => tier?.via?.act)?.via;
  if (parts.length && via) return `${parts.join("; ")} – this act was adopted under ${[via.act, via.path].filter(Boolean).join(" ")}`;
  return parts.join("; ");
}







// -----------------------------------------------------------
// beforeOf
// -----------------------------------------------------------
//
// How the obligation of a finding stood in the company's
// earlier finished reports, as one line: the date of each
// report with the status it gave, the newest first as Django
// keeps them (the finding's `history`), the latest few only.
// Empty when no earlier report assessed the obligation — a
// company's first report, an obligation new to the act, or a
// finding read from a route that carries no history.
//
// Used by:
//   - findingRow (below)
// -----------------------------------------------------------

function beforeOf(finding) {
  const earlier = Array.isArray(finding.history) ? finding.history : [];
  return earlier.slice(0, MAX_BEFORE).map((entry) => `${entry?.date} ${entry?.status}`).join("; ");
}







// -----------------------------------------------------------
// findingRow
// -----------------------------------------------------------
//
// One finding as the model needs it to explain or review it:
// its id for overrideFinding, the effective status and whether
// a reviewer set it, the severity, the obligation, up to three
// of its citations and up to two of the passages of the
// company's documents the verdict rests on. A finding of an
// act not yet in force says from when it applies. Three keys
// are there only when they have something to say: `before`,
// how the same obligation stood in the company's earlier
// reports; `cause`, why the gap exists in the words of the
// person who reviewed it; and `canCost`, what a breach of the
// provision can cost — for a gap (not met, partly met, not
// evidenced) whose provision the acts sanction, never for a
// finding that is met or not applicable. Nor for a finding of
// an act not yet in force: what does not bind the company yet
// cannot be breached, so a date it applies from and a cost of
// a breach never stand in one row. Django keeps no tiers on
// such a finding; a report made before it stopped still has
// them, and they are left out here. A requirement of the
// company's own has no legal provision: in place of the
// citations it names its `criterion`, the policy and the
// section of it the requirement comes from.
//
// Used by:
//   - reportTools (below) — getReport, overrideFinding
// -----------------------------------------------------------

function findingRow(f) {
  const cost = GAP_STATUSES.includes(f.effectiveStatus) && !f.appliesFrom ? canCostOf(f) : "";
  const before = beforeOf(f);
  const [policy] = f.citations || [];
  const criterion = f.sourceKind === OWN
    ? { criterion: trimText([policy?.documentTitle, policy?.path].filter(Boolean).join(" "), 200) || null }
    : { citations: (f.citations || []).slice(0, 3).map((c) => ({ path: c.path ?? null, act: c.documentTitle ?? null, url: c.url ?? null })) };
  return {
    id: f.id, act: actOf(f), ...(f.appliesFrom ? { appliesFrom: f.appliesFrom } : {}),
    obligation: trimText(f.obligationTitle, 200),
    status: f.effectiveStatus, overridden: Boolean(f.overrideStatus), severity: f.severity,
    ...(before ? { before } : {}),
    analysis: trimText(f.analysis, 400),
    ...(f.cause ? { cause: trimText(f.cause, MAX_CAUSE) } : {}),
    ...(cost ? { canCost: trimText(cost, MAX_CAN_COST) } : {}),
    recommendation: trimText(f.recommendation, 300),
    ...criterion,
    evidence: (f.evidence || []).slice(0, 2).map((e) => ({ document: e.title ?? null, quote: trimText(e.quote, 200) })),
    deadline: f.deadline ?? null, reviewerNote: f.reviewerNote ? trimText(f.reviewerNote, 300) : null,
  };
}







// -----------------------------------------------------------
// sinceLastOf
// -----------------------------------------------------------
//
// What moved since the company's previous finished report,
// from the report's stats (Django's `changes`): the date of
// that report and three counts — the gaps that are met now
// (closed), the gaps on obligations it had not found open
// (new), and the obligations that were met and are a gap
// again (back) — with the first titles of the last two, the
// ones to act on. A gap is a finding not met or partly met. A
// count Django leaves out reads as unknown, never as zero.
// Nothing when the company has no earlier report.
//
// Used by:
//   - reportTools (below) — getReport
// -----------------------------------------------------------

function sinceLastOf(report) {
  const moved = report.stats?.changes;
  if (!moved) return null;
  const titles = (kind) => (Array.isArray(moved[kind]?.titles) ? moved[kind].titles : [])
    .slice(0, MAX_MOVED_TITLES).map((title) => trimText(title, MAX_MOVED_TITLE));
  return {
    date: moved.sinceDate ?? null, closed: moved.closed?.count ?? null, new: moved.new?.count ?? null,
    back: moved.back?.count ?? null, backTitles: titles("back"), newTitles: titles("new"),
  };
}







// -----------------------------------------------------------
// citationAudit
// -----------------------------------------------------------
//
// The audit of the references the company's own documents
// make to legal provisions: its counts, and the references
// that are wrong — the provision regulates something else, or
// the act has no such provision — each with the document, what
// it cites and claims, and what the provision really is.
// Nothing for a report made before the audit existed.
//
// Used by:
//   - reportTools (below) — getReport
// -----------------------------------------------------------

function citationAudit(report) {
  if (!report.stats?.citations) return null;
  const problems = (report.citations || []).filter((c) => CITATION_PROBLEMS.includes(c.verdict));
  return {
    counts: report.stats.citations,
    problems: problems.slice(0, MAX_CITATION_PROBLEMS).map((c) => ({
      document: c.documentTitle ?? null, act: c.shortTitle || c.act || null,
      cites: [c.article, c.paragraph, c.point].filter(Boolean).join(" ") || null,
      claim: trimText(c.claim, 200), verdict: c.verdict,
      actual: c.heading ? trimText(c.heading, 200) : null, url: c.citationUrl ?? null,
    })),
    moreProblems: Math.max(0, problems.length - MAX_CITATION_PROBLEMS),
  };
}







// -----------------------------------------------------------
// reportTools
// -----------------------------------------------------------
//
// The group's tools for one turn. A report is written in the
// language the model names, else the turn's, else Lithuanian.
//
// Used by:
//   - llm/tools.js — createTools
// -----------------------------------------------------------

export function reportTools(ctx) {
  const { django, language } = ctx;


  const estimateAnalysisCost = defineTool("estimateAnalysisCost", {
    description: "The upper-bound USD cost of a compliance analysis of a company for a scope of acts: the "
      + "analysis plus the one-time extraction of obligations from acts not yet processed, and the user's "
      + "remaining AI budget. Run it BEFORE runComplianceAnalysis, tell the user the total and ask for an "
      + "explicit yes; when it is large, propose a narrower scope (the acts that apply). With "
      + "internalRequirements the total also covers checking the company's procedures against its own "
      + "policies: ownRequirements has the policy documents to read, the requirements expected and their "
      + "USD share (documents 0: the company has no policy-level document, so the check would do nothing — "
      + "say so).",
    input: z.strictObject({
      companyId: id("The company id"),
      documentIds: SCOPE_FIELD,
      internalRequirements: z.boolean().optional()
        .describe("true to price the check of the company's procedures against its own policies too — only when the "
          + "user asks for that check; default false"),
    }),
    run: async ({ companyId, documentIds, internalRequirements = false }) => (
      estimateOf(django, companyId, documentIds, internalRequirements)),
  }, ctx);


  const runComplianceAnalysis = defineTool("runComplianceAnalysis", {
    description: "Start the automated gap analysis of a company against the legal corpus (runs for minutes "
      + "in the background and spends real money). Only after estimateAnalysisCost and the user's explicit "
      + "yes to that upper-bound total: pass the accepted amount as confirmedCostUsd (the scope is re-priced; "
      + "a lower amount is refused). Unless autoApprove, the run STOPS once it has decided which acts apply "
      + "(the cheap part, minutes) and waits for the user: once getReport shows status scope_review, show the "
      + "user the list of acts and the price of the rest, and continue it with approveReportScope — the total "
      + "accepted here is only a ceiling, the price of the approved list is confirmed again there. Answers "
      + "the report card; stop it with cancelAnalysis if the user asks.",
    input: z.strictObject({
      companyId: id("The company id"),
      confirmedCostUsd: z.number().min(0).max(10_000)
        .describe("The upper-bound total (USD) the user explicitly accepted for THIS scope"),
      language: z.enum(["lt", "en"]).optional().describe("Report language, default the conversation's"),
      documentIds: SCOPE_FIELD,
      autoApprove: z.boolean().optional()
        .describe("true only when the user explicitly said to run without reviewing the list of acts; default false"),
      internalRequirements: z.boolean().optional()
        .describe("true only when the user asks to check whether the company's procedures follow its own policies — it "
          + "adds the cost the estimate shows under ownRequirements (estimate with it first); default false"),
    }),
    run: async ({
      companyId, confirmedCostUsd, language: reportLanguage, documentIds, autoApprove = false, internalRequirements = false,
    }) => {
      // The same scope is priced as will run: with the company's
      // own requirements when the start asks for them
      const estimate = await estimateOf(django, companyId, documentIds, internalRequirements);
      if (!Number.isFinite(estimate.totalUsd)) {
        throw new ToolFailure("runComplianceAnalysis", "COST_UNKNOWN",
          "the cost of this scope could not be estimated — do not start it; run estimateAnalysisCost again or tell the user");
      }
      if (!estimate.pricesKnown) {
        throw new ToolFailure("runComplianceAnalysis", "COST_UNKNOWN",
          `a model's price is unknown, so the estimate ($${estimate.totalUsd.toFixed(2)}) is only a floor — do not `
          + "start it from the chat; tell the user they can start it on the Reports page, which shows the estimate");
      }
      if (confirmedCostUsd + COST_SLACK_USD < estimate.totalUsd) {
        throw new ToolFailure("runComplianceAnalysis", "COST_NOT_CONFIRMED",
          `this scope is estimated at up to $${estimate.totalUsd.toFixed(2)} (${costShares(estimate)}) — tell the user, `
          + "get an explicit yes, then call again with that amount; or propose a narrower scope");
      }
      try {
        // Django stops the run for its scope only when asked
        // to: a start without `review` runs to its end
        const report = await django.post("/api/reports", {
          companyId, language: reportLanguage || language || "lt", ...(documentIds?.length ? { documentIds } : {}),
          ...(autoApprove ? {} : { review: true }), ...(internalRequirements ? { internal: true } : {}),
        });
        if (autoApprove) return { started: true, stopsForScope: false, ...reportCard(report) };
        // The chat's card follows the run by itself, so the
        // model is told not to read the report again in the
        // turn that started it: the read would say nothing new
        return {
          started: true, stopsForScope: true,
          next: "the run stops once it has decided which acts apply (minutes); the card shows it live: no getReport in this "
            + "turn. When getReport shows scope_review, show the user its scope and the price of the rest, and get their yes "
            + "to that price too — the start's yes does not cover it — before approveReportScope",
          ...reportCard(report),
        };
      } catch (err) {
        if (err?.code !== "ALREADY_RUNNING") throw err;
        const listed = await django.get(`/api/reports${query({ companyId })}`);
        const running = (listed?.reports || []).find((r) => ACTIVE_STATUSES.includes(r.status));
        if (!running) throw err;
        return { started: false, alreadyRunning: true, ...reportCard(running) };
      }
    },
  }, ctx);


  const approveReportScope = defineTool("approveReportScope", {
    description: "Approve the list of acts a report waiting in scope_review will assess, which starts its "
      + "expensive part. Call it ONLY after you showed the user getReport's scope — what will be assessed, what "
      + "will not and why, in plain words, the essentials only — with its price (scope.estimate.totalUsd), and "
      + "the user said yes. assess takes in acts the plan skips, skip leaves out acts the plan assesses, an act "
      + "not named keeps its plan. An act taken in although it does not bind the company (verdict not_applies) "
      + "is assessed as good practice, not as an obligation — tell the user so. The chosen list is priced again: "
      + "pass the amount the user accepted for it as confirmedCostUsd; a lower amount is refused with the new "
      + "total, which the user must accept first. Answers the report card; follow it with getReport.",
    input: z.strictObject({
      reportId: id("The id of the report waiting in scope_review"),
      assess: z.array(filled(100)).max(200).optional()
        .describe("Ids of acts to take IN (getReport's scope.acts and scope.screenedOut.acts) — only those whose plan is skip"),
      skip: z.array(filled(100)).max(200).optional()
        .describe("Ids of acts to leave OUT — only those whose plan is assess"),
      confirmedCostUsd: z.number().min(0).max(10_000)
        .describe("The upper-bound total (USD) the user explicitly accepted for THIS list of acts"),
    }).refine(({ assess = [], skip = [] }) => !assess.some((act) => skip.includes(act)),
              { message: "an act is either in assess or in skip, never in both" }),
    run: async ({ reportId, assess = [], skip = [], confirmedCostUsd }) => {
      const choices = Object.fromEntries([...assess.map((act) => [act, "assess"]), ...skip.map((act) => [act, "skip"])]);
      const estimate = await scopeEstimateOf(django, reportId, choices);
      if (!Number.isFinite(estimate.totalUsd)) {
        throw new ToolFailure("approveReportScope", "COST_UNKNOWN",
          "the cost of assessing these acts could not be estimated — do not approve; call getReport again or tell the user");
      }
      if (!estimate.pricesKnown) {
        throw new ToolFailure("approveReportScope", "COST_UNKNOWN",
          `a model's price is unknown, so the estimate ($${estimate.totalUsd.toFixed(2)}) is only a floor — do not `
          + "approve it from the chat; tell the user they can approve it on the report's page, which shows the estimate");
      }
      if (confirmedCostUsd + COST_SLACK_USD < estimate.totalUsd) {
        throw new ToolFailure("approveReportScope", "COST_NOT_CONFIRMED",
          `assessing these acts is estimated at up to $${estimate.totalUsd.toFixed(2)} (${costShares(estimate)}) — tell the `
          + "user, get an explicit yes, then call again with that amount; or leave more acts out");
      }
      const report = await django.post(url`/api/reports/${reportId}/scope`, { acts: choices, approved: true });
      return { approved: true, ...reportCard(report) };
    },
  }, ctx);


  const cancelAnalysis = defineTool("cancelAnalysis", {
    description: "Stop a compliance analysis that is queued, running or waiting for its list of acts to be "
      + "approved (scope_review) — only when the user asks for it: what it has spent so far is not returned and "
      + "its findings are lost. Answers the report card.",
    input: z.strictObject({ reportId: id("The id of the report to stop (from listReports or the report card)") }),
    run: async ({ reportId }) => ({ cancelled: true, ...reportCard(await django.post(url`/api/reports/${reportId}/cancel`, {})) }),
  }, ctx);


  const listReports = defineTool("listReports", {
    description: "The user's compliance reports, newest first: id, company, status (queued, running, "
      + "scope_review — waiting for the user to approve its list of acts, done, failed, cancelled), dates and — "
      + "once done — the counts by status. This is how a report is found: never ask the user for a report id, a "
      + "link or a page address. Then read one with getReport.",
    input: z.strictObject({
      companyId: id("Only this company's reports; left out: the reports of the user's own companies").optional(),
      status: z.enum(REPORT_STATUSES).optional().describe("Only reports in this state, e.g. done"),
    }),
    run: async ({ companyId, status }) => {
      // Unfiltered means the user's own companies, as in listCompanies: an
      // administrator's chat does not list every user's reports
      const scope = companyId ? undefined : "own";
      const answer = await django.get(`/api/reports${query({ scope, companyId, status })}`);
      const reports = answer?.reports || [];
      return {
        reports: reports.slice(0, MAX_REPORTS).map((r) => {
          const card = reportCard(r);
          return { ...card.report, approved: Boolean(r.approvedAt), counts: card.counts };
        }),
        total: reports.length,
      };
    },
  }, ctx);


  const getReport = defineTool("getReport", {
    description: "One report: status, progress. In scope_review it WAITS for the user: show its `scope`, "
      + "then approveReportScope. Once done: counts by status and open gaps by severity, of the acts in "
      + "force; counts.upcoming: acts applying only later — preparation, never a breach; ownRequirements: "
      + "gaps against the company's own policies, never breaches of law. With the id alone: summary, byAct, "
      + "acts (toConfirm: NOT assessed until their questions are answered; throughNationalLaw, institutional: "
      + "not assessed separately; assessedByChoice: not binding, good practice; leftOutByReviewer: applies, "
      + "NOT assessed), plan, citation audit, top findings. before is how the same obligation stood in "
      + "earlier reports; sinceLastReport what moved — \"back\" means it was met and is a gap again. canCost "
      + "is the ceiling the act provides for a breach of the provision, never a forecast — say \"up to\"; "
      + "cause is written only by a person on the report page — you never write or file one: tell a user "
      + "who names a cause to record it in the finding's review dialog.",
    input: z.strictObject({
      reportId: id("The report id — from the company context or listReports, never asked of the user"),
      status: z.enum(FINDING_STATUSES).optional()
        .describe("List only findings with this effective status (met=atitinka, partial=iš dalies, missing=neatitinka, "
          + "unknown=neįrodyta, not_applicable=netaikoma)"),
      severity: z.enum(SEVERITIES).optional().describe("List only findings of this severity"),
      act: filled(200).optional()
        .describe("List only findings of this act — its name as byAct gives it, e.g. 'DORA'; 'internal' lists the findings "
          + "of the company's own requirements (ownRequirements), which no other call lists"),
      offset: z.number().int().min(0).max(100_000).optional()
        .describe("Findings to skip, default 0 — move on with it while moreFindings > 0. With an offset or a filter "
          + "(status, severity, act) the answer is the findings only, paged, most urgent first"),
      limit: z.number().int().min(1).max(MAX_FINDINGS).optional().describe("Findings to list, default 10"),
    }),
    run: async ({ reportId, status, severity, act, offset = 0, limit = 10 }) => {
      const report = await django.get(url`/api/reports/${reportId}`);
      const card = reportCard(report);
      // A report that waits has no findings to page through:
      // whatever was asked, the answer is the list it waits on
      if (report.status === "scope_review") {
        return { ...card, scope: scopeOf(report, await scopeEstimateOf(django, reportId)) };
      }
      if (report.status !== "done") return card;
      const own = ownRequirementsOf(report);
      const counted = { ...card, ...(own ? { ownRequirements: own } : {}) };
      const rows = report.findings || [];
      const all = rows.filter((f) => f.sourceKind !== OWN);
      const wanted = act?.trim().toLowerCase();
      // The company's own requirements are a group apart: their
      // findings are listed when asked for — as "internal", or by
      // the name their rows carry — and never among the acts'
      const asked = !wanted ? all
        : rows.filter((f) => (wanted === OWN ? f.sourceKind === OWN : (actOf(f) || "").toLowerCase() === wanted));
      const findings = asked
        .filter((f) => (!status || f.effectiveStatus === status) && (!severity || f.severity === severity))
        .sort((a, b) => Boolean(a.appliesFrom) - Boolean(b.appliesFrom)
          || STATUS_ORDER.indexOf(a.effectiveStatus) - STATUS_ORDER.indexOf(b.effectiveStatus)
          || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
      const page = {
        matchingFindings: findings.length,
        topFindings: findings.slice(offset, offset + limit).map(findingRow),
        moreFindings: Math.max(0, findings.length - offset - limit),
      };
      // A question about findings gets findings: the overview
      // is not repeated on every page of them
      if (status || severity || wanted || offset) return { ...counted, ...page };
      const sinceLast = sinceLastOf(report);
      return {
        ...counted,
        summary: trimText(report.summary, 3_000),
        ...(sinceLast ? { sinceLastReport: sinceLast } : {}),
        byAct: countsByAct(all),
        acts: actGroups(report.acts || []),
        scopeApprovedBy: report.scopeApprovedByName || "nobody — ran without the review",
        ...page,
        actions: (report.actions || []).slice(0, MAX_ACTIONS).map((a) => ({
          title: a.title, description: trimText(a.description, 300), priority: a.priority, timeframe: a.timeframe,
          effort: a.effort ?? null, ownerRole: a.ownerRole, closesFindings: (a.findingIds || []).length,
        })),
        moreActions: Math.max(0, (report.actions || []).length - MAX_ACTIONS),
        citationAudit: citationAudit(report),
        exports: { pdf: `/api/reports/${report.id}/export?format=pdf`, xlsx: `/api/reports/${report.id}/export?format=xlsx` },
      };
    },
  }, ctx);


  const overrideFinding = defineTool("overrideFinding", {
    description: "Record a reviewer's verdict on one finding (the user's decision, with the reason they "
      + "gave); the finding's id is in getReport's findings. status null clears an earlier override. The "
      + "reason is never the place for a cause: why a gap exists is recorded by a person in the finding's "
      + "review dialog on the report page.",
    input: z.strictObject({
      reportId: id("The report id"),
      findingId: id("The finding id"),
      status: z.enum(FINDING_STATUSES).nullable().describe("The new effective status, or null to clear"),
      reason: filled(4000, 3).optional()
        .describe("Why — the user's reason, e.g. the evidence they named. Required with a status. With status "
          + "null: give it only when the user said why the override is withdrawn — it then replaces the "
          + "reviewer's note; left out, the note stays as the reviewer wrote it"),
    }),
    run: async ({ reportId, findingId, status, reason }) => {
      if (status !== null && !reason) {
        throw new ToolFailure("overrideFinding", "REASON_REQUIRED", "a verdict needs the user's reason");
      }
      const finding = await django.patch(url`/api/reports/${reportId}/findings/${findingId}`,
                                         { overrideStatus: status, ...(reason ? { reviewerNote: reason } : {}) });
      return { finding: findingRow(finding), reportUrl: `/reports/${reportId}` };
    },
  }, ctx);


  return {
    estimateAnalysisCost, runComplianceAnalysis, approveReportScope, cancelAnalysis, listReports, getReport, overrideFinding,
  };
}
