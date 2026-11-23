// -----------------------------------------------------------
//  [*] Tests — the report tools (llm/tools/reports.js)
//
//  The seven report tools against a Django stub that answers
//  as analysis/api/views.py and its serializers do: the
//  estimate, reports queued, running, waiting for their scope,
//  done and failed, the list, the cancel, the dry run and the
//  approval of a scope, the finding override and the 400 /
//  409 / 429 refusals. The money gates get the most care: a
//  run starts only for an accepted upper bound of the same
//  scope, priced again first, and its second part only for an
//  accepted upper bound of the acts chosen. A run started
//  here stops for the user's approval of its acts unless told
//  not to; the waiting report answers the list it asks about,
//  kept small. A report must be reachable without the user:
//  listed by company, and every finding of it by filter and
//  page. Its result is today's: the findings of an act that
//  applies later are counted and listed apart, the acts it
//  did not assess are named with the questions that decide
//  them, and so are the acts the person who approved the
//  scope took in or left out against the run's verdict.
//
//  What a finding means is told as the report tells it: what
//  a breach can cost in the wording of Django's
//  consequence_text, for a gap only and as a ceiling; the
//  cause only when a person wrote one. The company's own
//  requirements stay apart from the law at every step —
//  priced and started only when asked for, counted under
//  ownRequirements, absent from the acts' counts and lists,
//  and listed as the act "internal" with a passage of a
//  policy as the criterion.
//
//  A report of a company that has earlier ones looks back: a
//  finding says how the same obligation stood in them
//  (`before`), the overview what moved since the previous one
//  (`sinceLastReport`). A first report says neither.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-17 — the cost gate failed open with no total
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { assertAsUser, call, refuses, startToolStub, toolSet } from "./helpers/toolKit.mjs";


// A finished report as the detail route serializes it
const DONE = {
  id: "r1", companyId: "c1", companyName: "UAB Kripto", createdBy: "u1", jobId: "j1", status: "done", language: "lt",
  scope: { documentIds: [] }, title: "Atitikties analizė", summary: "S".repeat(3_500), error: null,
  stats: { acts: { applies: 3, uncertain: 1, not_applies: 2 }, findings: { met: 9 }, openBySeverity: {}, actions: 2,
           citations: { checked: 4, match: 1, mismatch: 1, notFound: 1, notInCorpus: 1, unknown: 0 } },
  createdAt: "2026-09-27T08:00:00+00:00", startedAt: "x", finishedAt: "2026-09-27T09:00:00+00:00",
  progress: { step: "done", percent: 100, message: "Baigta", extra: "not for the model" }, jobStatus: "done",
  acts: [
    ...Array.from({ length: 16 }, (_, i) => ({ shortTitle: `Aktas ${i}`, applicability: i % 2 ? "uncertain" : "applies", confidence: "high" })),
    { shortTitle: "", documentTitle: "Kapitalo reikalavimų reglamentas", applicability: "not_applies", confidence: "high" },
  ],
  findings: [
    { id: "f-met", effectiveStatus: "met", status: "met", severity: "high", obligationTitle: "Met one", citations: [] },
    { id: "f-low", effectiveStatus: "missing", status: "missing", severity: "low", obligationTitle: "Low one", citations: [] },
    { id: "f-crit", effectiveStatus: "missing", status: "missing", severity: "critical", overrideStatus: null, shortTitle: "MiCA",
      obligationTitle: "O".repeat(300), analysis: "A".repeat(500), recommendation: "R".repeat(400), deadline: "2026-12-30",
      reviewerNote: "", citations: [{ path: "59 str.", documentTitle: "MiCA", url: "https://eur-lex/#art_59", unitId: "u59" },
                                     { path: "60 str." }, { path: "61 str." }, { path: "62 str." }],
      evidence: [{ kind: "passage", id: "d1", title: "F07 Saugojimo politika", quote: "Q".repeat(250), charStart: 10 },
                 { kind: "credential", id: "cr1", title: "CASP leidimas", quote: "LB-1" }, { kind: "profile", title: "Profilis", quote: "x" }] },
    { id: "f-part", effectiveStatus: "partial", status: "missing", severity: "medium", overrideStatus: "partial",
      reviewerNote: "Policy covers half", documentTitle: "Pinigų plovimo prevencijos įstatymas", citations: [] },
    { id: "f-na", effectiveStatus: "not_applicable", status: "not_applicable", severity: "low", citations: [] },
    { id: "f-unk", effectiveStatus: "unknown", status: "unknown", severity: "high", citations: [] },
  ],
  actions: Array.from({ length: 27 }, (_, i) => ({ id: `a${i}`, title: `Veiksmas ${i}`, description: "D".repeat(350), priority: "high",
                                                   timeframe: "immediate", ownerRole: "CEO", effort: "low", findingIds: ["f-crit"] })),
  citations: [
    { id: "c-ok", documentTitle: "F00 Apžvalga", act: "MiCA", shortTitle: "MiCA", article: "70 str.", verdict: "match", heading: "Saugojimas" },
    { id: "c-bad", documentTitle: "F00 Apžvalga", act: "Reglamentas (ES) 2023/1114", shortTitle: "MiCA", article: "77 str.", paragraph: "1 d.",
      point: null, claim: "Konsultavimas dėl kriptoturto", verdict: "mismatch", heading: "Prekybos platformos veiklos taisyklės",
      citationUrl: "https://eur-lex/#art_77", quote: "not for the model" },
    { id: "c-none", documentTitle: "F12 Rinkodara", act: "MiCA", shortTitle: "", article: "199 str.", claim: "Reklama", verdict: "not_found",
      heading: "", citationUrl: null },
    { id: "c-out", documentTitle: "F12 Rinkodara", act: "PSD3", verdict: "act_not_in_corpus" },
  ],
};

// A queued report as POST /api/reports answers it
const QUEUED = { id: "r9", companyId: "c1", companyName: "UAB Kripto", status: "queued", language: "lt", title: "", stats: {},
                 progress: {}, jobStatus: "queued", createdAt: "2026-09-27T10:00:00+00:00", finishedAt: null, error: null };

// A report that waits for its scope, as the detail route
// serializes it: the acts judged, nothing assessed yet, no
// job at work
const WAITING = {
  ...QUEUED, id: "r-wait", status: "scope_review", jobStatus: "done", title: "",
  progress: { step: "applicability", percent: 30, message: "Laukia patvirtinimo" },
  stats: { acts: { applies: 3, uncertain: 1, not_applies: 3, assessed: 1, upcoming: 1, unconfirmed: 1, indirect: 1 }, costUsd: 0.42 },
  scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: null,
  acts: [
    { id: "a-crr", shortTitle: "CRR", docType: "regulation", applicability: "not_applies", confidence: 0.9,
      reasoning: "Įmonė nėra kredito įstaiga", conditionsToVerify: "", appliesFrom: null, assessment: "none", screenedOut: false },
    { id: "a-solv", shortTitle: "", documentTitle: "Mokumas II", docType: "directive", applicability: "not_applies", confidence: 1,
      reasoning: "", conditionsToVerify: "", appliesFrom: null, assessment: "none", screenedOut: true },
    { id: "a-amld", shortTitle: "AMLD6", docType: "directive", applicability: "applies", confidence: 0.8,
      reasoning: "Taikoma per PPTFPĮ", conditionsToVerify: "", appliesFrom: null, assessment: "indirect", screenedOut: false },
    { id: "a-ai", shortTitle: "AI Act", docType: "regulation", applicability: "uncertain", confidence: 0.4,
      reasoning: "W".repeat(250), conditionsToVerify: "K".repeat(450), appliesFrom: null, assessment: "unconfirmed", screenedOut: false },
    { id: "a-amlr", shortTitle: "AMLR", docType: "regulation", applicability: "applies", confidence: 0.9,
      reasoning: "Įpareigotasis subjektas", conditionsToVerify: "Not for the model: the act is not waiting", appliesFrom: "2027-07-10",
      assessment: "upcoming", screenedOut: false },
    { id: "a-mica", shortTitle: "MiCA", documentTitle: "Reglamentas (ES) 2023/1114", docType: "regulation", applicability: "applies",
      confidence: 0.95, reasoning: "Kriptoturto paslaugų teikėjas", conditionsToVerify: "", appliesFrom: null, assessment: "assessed",
      screenedOut: false, citations: [{ path: "not for the model" }], sourceUrl: "https://eur-lex/mica" },
    { id: "a-psd", shortTitle: "PSD2", docType: "directive", applicability: "not_applies", confidence: 1,
      reasoning: "", conditionsToVerify: "", appliesFrom: null, assessment: "none", screenedOut: true },
  ],
  findings: [], actions: [], citations: [],
};

// The user's daily budget as the dry run of a scope answers it
const SCOPE_BUDGET = { limit: 10, used: 1.42, remaining: 8.58, unit: "USD" };

// What the company's own requirements add to a price, as
// Django's estimate answers it under `internal`
const OWN_SHARE = { documents: 2, requirements: 16, usd: 1.25 };

// Sanction tiers as a finding keeps them (`consequence`): an
// act's own tier with every kind of ceiling, a tier of a
// share alone, its graver tier bound to a kind of breach with
// measures from another provision, and a tier of measures only
const TIER_MICA = { act: "MiCA", path: "111 str.", where: "3 d. a, c p.", condition: "", maxFineEur: 5_000_000, maxFinePercent: 5,
                    benefitMultiple: 2, measures: ["cease", "public_statement"], measuresFrom: [] };
const TIER_SHARE = { act: "PPTFPĮ", path: "39 str.", where: "1 d. 1 p.", condition: "", maxFineEur: null, maxFinePercent: 5,
                     benefitMultiple: null, measures: [], measuresFrom: [] };
const TIER_GRAVER = { act: "PPTFPĮ", path: "39 str.", where: "1 d. 2 p.", condition: "Sistemingas, vienas šiurkštus arba pakartotinis pažeidimas",
                      maxFineEur: 5_100_000, maxFinePercent: 12.5, benefitMultiple: null, measures: ["withdrawal"],
                      measuresFrom: ["14 str. 1 d."] };
const TIER_MEASURES = { act: "MiCA", path: "94 str.", where: "1 d.", condition: "", maxFineEur: null, maxFinePercent: null,
                        benefitMultiple: null, measures: ["restriction", "a_code_not_known_here"], measuresFrom: [] };

// A finished report that says what its findings mean, as the
// detail route serializes it: the findings of two acts with
// what a breach can cost and, where a person wrote it, the
// cause — and the company's own requirements: the row they
// hang on among the acts, their findings with a passage of a
// policy as the criterion, their counts apart in the stats
// (stale on purpose: the rows' effective statuses must win)
const MEANT = {
  ...DONE, id: "r-meant",
  stats: { ...DONE.stats, acts: { applies: 2, uncertain: 0, not_applies: 0, assessed: 2 }, findings: { met: 9 }, openBySeverity: {},
           internal: { findings: { met: 1, partial: 0, missing: 2, unknown: 0, not_applicable: 0 },
                       openBySeverity: { critical: 0, high: 1, medium: 1, low: 0 } } },
  acts: [
    { id: "a-mica", shortTitle: "MiCA", docType: "regulation", applicability: "applies", confidence: 0.9, assessment: "assessed", screenedOut: false },
    { id: "a-aml", shortTitle: "PPTFPĮ", docType: "law", applicability: "applies", confidence: 0.9, assessment: "assessed", screenedOut: false },
    { id: "a-own", documentId: null, documentTitle: "Įmonės vidaus reikalavimai", shortTitle: "Vidaus reikalavimai", docType: "internal",
      applicability: "applies", confidence: 1, assessment: "assessed", reasoning: "Įmonės pačios sau nustatytos taisyklės", citations: [],
      screenedOut: false },
  ],
  findings: [
    { id: "f-fine", sourceKind: "legal", shortTitle: "MiCA", effectiveStatus: "missing", status: "missing", severity: "critical",
      consequence: [TIER_MICA], cause: "Nebuvo paskirtas atsakingas asmuo", citations: [{ path: "68 str.", documentTitle: "MiCA", url: "https://eur-lex/#art_68" }] },
    { id: "f-two", sourceKind: "legal", shortTitle: "PPTFPĮ", effectiveStatus: "partial", status: "partial", severity: "high",
      consequence: [TIER_SHARE, TIER_GRAVER], cause: "", citations: [] },
    { id: "f-unk", sourceKind: "legal", shortTitle: "MiCA", effectiveStatus: "unknown", status: "unknown", severity: "medium",
      consequence: [{ ...TIER_MEASURES, via: { act: "MiCA", path: "92 str." } }], cause: "", citations: [] },
    { id: "f-long", sourceKind: "legal", shortTitle: "MiCA", effectiveStatus: "missing", status: "missing", severity: "medium",
      consequence: [TIER_MICA, TIER_GRAVER, TIER_MEASURES, TIER_SHARE], cause: "C".repeat(700), citations: [] },
    { id: "f-bare", sourceKind: "legal", shortTitle: "MiCA", effectiveStatus: "missing", status: "missing", severity: "low",
      consequence: [{ act: "MiCA", path: "111 str.", where: "", condition: "", maxFineEur: null, maxFinePercent: null, benefitMultiple: null,
                      measures: [], measuresFrom: [] }], cause: "", citations: [] },
    { id: "f-ok", sourceKind: "legal", shortTitle: "MiCA", effectiveStatus: "met", status: "met", severity: "high",
      consequence: [TIER_MICA], cause: "", citations: [] },
    { id: "f-off", sourceKind: "legal", shortTitle: "PPTFPĮ", effectiveStatus: "not_applicable", status: "not_applicable", severity: "low",
      consequence: [TIER_SHARE], cause: "", citations: [] },
    { id: "o-miss", actId: "a-own", sourceKind: "internal", documentTitle: "Įmonės vidaus reikalavimai", shortTitle: "Vidaus reikalavimai",
      obligationTitle: "Rizikos vertinimas peržiūrimas kasmet", effectiveStatus: "missing", status: "missing", severity: "high",
      analysis: "Procedūra peržiūros nenumato", recommendation: "Papildyti procedūrą", consequence: [], cause: "", deadline: "",
      citations: [{ path: "4.2 p.", documentTitle: "Rizikos valdymo politika", documentId: "d7", quote: "Vertinimas peržiūrimas kasmet", start: 120 }],
      evidence: [{ kind: "passage", id: "d8", title: "Rizikos vertinimo procedūra", quote: "Peržiūra atliekama pagal poreikį" }] },
    { id: "o-part", actId: "a-own", sourceKind: "internal", documentTitle: "Įmonės vidaus reikalavimai", shortTitle: "Vidaus reikalavimai",
      effectiveStatus: "partial", status: "missing", overrideStatus: "partial", severity: "medium", consequence: [],
      cause: "Procedūra neatnaujinta po politikos pakeitimo", citations: [{ path: "", documentTitle: "Atitikties politika", documentId: "d9", start: null }] },
    { id: "o-met", actId: "a-own", sourceKind: "internal", documentTitle: "Įmonės vidaus reikalavimai", shortTitle: "Vidaus reikalavimai",
      effectiveStatus: "met", status: "met", severity: "low", consequence: [], cause: "", citations: [] },
  ],
};

let stub;







// -----------------------------------------------------------
// scopeRoute
// -----------------------------------------------------------
//
// POST /api/reports/{id}/scope as Django answers it. For the
// waiting report: the choices applied over the run's plan —
// an act that is not the report's refused — then, without
// `approved`, the price of the acts chosen and nothing kept;
// with it the report, queued again and stamped, or
// NOTHING_TO_ASSESS when no act is left. The other ids are
// the refusals: a finished report is NOT_WAITING at once,
// one approved elsewhere in the meantime only at the
// approval, one whose user's budget is spent
// BUDGET_EXCEEDED at the approval, one answers a dry run
// with no estimate in it, one prices its acts with a model
// whose price is unknown, and one was started with the
// company's own requirements: its second part judges them
// too, so its price holds their share.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function scopeRoute(body, _request, url) {
  const reportId = url.pathname.split("/").at(-2);
  const notWaiting = { status: 409, json: { error: "The report is not waiting for its scope to be approved", code: "NOT_WAITING" } };
  if (reportId === "r1") return notWaiting;
  if (reportId === "r-odd") return { json: { budget: null } };
  if (!["r-wait", "r-raced", "r-broke", "r-unpriced", "r-wait-own"].includes(reportId)) {
    return { status: 404, json: { error: "Report not found", code: "NOT_FOUND" } };
  }
  const own = reportId === "r-wait-own" ? OWN_SHARE : null;
  const choices = body?.acts || {};
  if (Object.keys(choices).some((act) => !WAITING.acts.some((a) => a.id === act))) {
    return { status: 400, json: { error: "acts names an act that is not in this report", code: "INVALID_FIELD" } };
  }
  const chosen = WAITING.acts.filter((a) => choices[a.id] === "assess"
    || (choices[a.id] !== "skip" && ["assessed", "upcoming"].includes(a.assessment)));
  if (!body?.approved) {
    const extractionUsd = chosen.some((a) => a.id === "a-amlr") ? 1.25 : 0;
    return { json: {
      estimate: { acts: chosen.map((a) => ({ id: a.id, obligations: 40, toExtract: a.id === "a-amlr" })), obligations: 40 * chosen.length,
                  analysisUsd: 2 * chosen.length, extractionUsd, ...(own ? { internal: own } : {}),
                  totalUsd: 2 * chosen.length + extractionUsd + (own ? own.usd : 0), upperBound: true,
                  pricesKnown: reportId !== "r-unpriced" },
      budget: SCOPE_BUDGET,
    } };
  }
  if (!chosen.length) return { status: 400, json: { error: "Nothing is left to assess — take at least one act in", code: "NOTHING_TO_ASSESS" } };
  if (reportId === "r-raced") return notWaiting;
  if (reportId === "r-broke") return { status: 429, json: { error: "Today's AI usage budget is spent — try again tomorrow", code: "BUDGET_EXCEEDED" } };
  return { json: { ...WAITING, status: "queued", jobStatus: "queued", progress: {}, scopeApprovedBy: "u1", scopeApprovedByName: "Rasa Rasaitė",
                   scopeApprovedAt: "2026-09-27T10:20:00+00:00" } };
}


before(async () => {
  stub = await startToolStub();
});

beforeEach(() => {
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, {
    "GET /api/reports/estimate": (_b, _r, url) => {
      const companyId = url.searchParams.get("companyId");
      if (companyId === "gone") return { status: 404, json: { error: "Company not found", code: "NOT_FOUND" } };
      if (companyId === "odd") return { json: { acts: 3, budget: null } };
      if (companyId === "unpriced") {
        return { json: { pricesKnown: false, acts: 26, obligations: 300, actsToExtract: [], analysisUsd: 0, extractionUsd: 0,
                         totalUsd: 0, upperBound: true, budget: { limit: 10, used: 1, remaining: 9, unit: "USD" } } };
      }
      const scoped = Boolean(url.searchParams.get("documentIds"));
      // The company's own requirements are priced only when
      // asked for, and then counted into the total; a company
      // without a policy-level document has nothing to read
      const own = url.searchParams.get("internal") !== "true" ? null
        : companyId === "nopolicy" ? { documents: 0, requirements: 0, usd: 0 } : OWN_SHARE;
      return { json: { pricesKnown: true, acts: scoped ? 2 : 26, obligations: scoped ? 40 : 300, actsToExtract: scoped ? [] : ["DORA", "MiCA"],
                       analysisUsd: scoped ? 1.5 : 20, extractionUsd: scoped ? 0 : 7, ...(own ? { internal: own } : {}),
                       totalUsd: (scoped ? 1.5 : 27) + (own ? own.usd : 0), upperBound: true,
                       budget: { limit: 10, used: 1, remaining: 9, unit: "USD" } } };
    },
    "POST /api/reports": (body) => ({
      busy: { status: 409, json: { error: "An analysis of this company is already running", code: "ALREADY_RUNNING" } },
      waiting: { status: 409, json: { error: "An analysis of this company is already running", code: "ALREADY_RUNNING" } },
      idle: { status: 409, json: { error: "An analysis of this company is already running", code: "ALREADY_RUNNING" } },
      empty: { status: 409, json: { error: "The legal corpus is empty — an admin must ingest acts first", code: "CORPUS_EMPTY" } },
      broke: { status: 429, json: { error: "Today's AI usage budget is spent — try again tomorrow", code: "BUDGET_EXCEEDED" } },
    }[body.companyId] ?? { status: 201, json: { ...QUEUED, language: body.language } }),
    // Django narrows the list by company and by status, before its cut at 200 reports
    "GET /api/reports": (_b, _r, url) => {
      const rows = {
        busy: [{ ...DONE, id: "r-old" }, { ...QUEUED, id: "r-live", status: "running", progress: { step: "gap_analysis", percent: 40 } }],
        waiting: [{ ...WAITING, acts: undefined, findings: undefined, actions: undefined, citations: undefined }, { ...DONE, id: "r-old" }],
      }[url.searchParams.get("companyId")] ?? [{ ...DONE, id: "r-old" }];
      const status = url.searchParams.get("status");
      return { json: { reports: rows.filter((r) => !status || r.status === status) } };
    },
    "GET /api/reports/r1": () => ({ json: DONE }),
    "GET /api/reports/r-meant": () => ({ json: MEANT }),
    "GET /api/reports/r-wait": () => ({ json: WAITING }),
    "GET /api/reports/r-wait-own": () => ({ json: { ...WAITING, id: "r-wait-own", scope: { documentIds: [], review: true, internal: true } } }),
    "POST /api/reports/[^/]+/scope": scopeRoute,
    "POST /api/reports/r-wait/cancel": () => ({ json: { ...WAITING, status: "cancelled", finishedAt: "2026-09-27T10:30:00+00:00" } }),
    "POST /api/reports/r-running/cancel": () => ({ json: { ...QUEUED, id: "r-running", status: "cancelled", jobStatus: "cancelled",
                                                           finishedAt: "2026-09-27T10:05:00+00:00" } }),
    "POST /api/reports/r1/cancel": () => ({ status: 409, json: { error: "The analysis is already done", code: "NOT_CANCELLABLE" } }),
    "GET /api/reports/r-running": () => ({ json: { ...QUEUED, id: "r-running", status: "running", jobStatus: "running",
                                                    progress: { step: "gap_analysis", percent: 40, message: "Analizuojama" } } }),
    "GET /api/reports/r-failed": () => ({ json: { ...QUEUED, id: "r-failed", status: "failed", error: "E".repeat(500), progress: null } }),
    "PATCH /api/reports/r1/findings/[^/]+": (body, _r, url) => {
      const id = url.pathname.split("/").at(-1);
      const finding = DONE.findings.find((f) => f.id === id);
      if (!finding) return { status: 404, json: { error: "Finding not found", code: "NOT_FOUND" } };
      return { json: { ...finding, overrideStatus: body.overrideStatus, effectiveStatus: body.overrideStatus ?? finding.status,
                       reviewerNote: body.reviewerNote } };
    },
  });
});

after(async () => { await stub.close(); });


test("estimateAnalysisCost: GET the estimate for the company and scope; the shape EstimateToolCard renders", async () => {
  const set = await toolSet();
  for (const input of [{}, { companyId: "c1", documentIds: Array(201).fill("d") }, { companyId: "c1", documentIds: [""] }, { companyId: "c1", k: 1 }]) {
    assert.equal(await refuses(set, "estimateAnalysisCost", input), true, JSON.stringify(input).slice(0, 60));
  }
  const whole = await call(set, "estimateAnalysisCost", { companyId: "c1" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].query], ["GET", "/api/reports/estimate", { companyId: "c1" }]);
  assert.deepEqual(whole, { totalUsd: 27, analysisUsd: 20, extractionUsd: 7, upperBound: true, pricesKnown: true, acts: 26, obligations: 300,
                            actsToExtract: ["DORA", "MiCA"], budget: { limit: 10, used: 1, remaining: 9, unit: "USD" } });
  const scoped = await call(set, "estimateAnalysisCost", { companyId: "c1", documentIds: ["mica", "dora"] });
  assert.equal(stub.requests[1].query.documentIds, "mica,dora");
  assert.equal(scoped.totalUsd, 1.5);
  await call(set, "estimateAnalysisCost", { companyId: "c1", documentIds: [] });
  assert.deepEqual(stub.requests[2].query, { companyId: "c1" }, "an empty scope is the whole corpus");
  assert.deepEqual(await call(set, "estimateAnalysisCost", { companyId: "odd" }), {
    totalUsd: null, analysisUsd: null, extractionUsd: null, upperBound: true, pricesKnown: false, acts: 3, obligations: null,
    actsToExtract: null, budget: null }, "missing figures read as unknown, never as zero");
  await assert.rejects(call(set, "estimateAnalysisCost", { companyId: "gone" }), { message: "[NOT_FOUND] estimateAnalysisCost failed (HTTP 404): Company not found" });
  assertAsUser(stub.requests);
});


test("estimateAnalysisCost: the company's own requirements are priced only when asked for — their share apart, already in the total", async () => {
  const set = await toolSet();
  for (const input of [{ companyId: "c1", internalRequirements: "yes" }, { companyId: "c1", internalRequirements: null }, { companyId: "c1", internal: true }]) {
    assert.equal(await refuses(set, "estimateAnalysisCost", input), true, JSON.stringify(input));
  }
  const withOwn = await call(set, "estimateAnalysisCost", { companyId: "c1", internalRequirements: true });
  assert.deepEqual(stub.requests[0].query, { companyId: "c1", internal: "true" });
  assert.deepEqual(withOwn, { totalUsd: 28.25, analysisUsd: 20, extractionUsd: 7, upperBound: true, pricesKnown: true, acts: 26, obligations: 300,
                              actsToExtract: ["DORA", "MiCA"], ownRequirements: { documents: 2, requirements: 16, usd: 1.25 },
                              budget: { limit: 10, used: 1, remaining: 9, unit: "USD" } });
  const scoped = await call(set, "estimateAnalysisCost", { companyId: "c1", documentIds: ["mica"], internalRequirements: true });
  assert.deepEqual([stub.requests[1].query, scoped.totalUsd], [{ companyId: "c1", documentIds: "mica", internal: "true" }, 2.75]);
  const without = await call(set, "estimateAnalysisCost", { companyId: "c1", internalRequirements: false });
  assert.deepEqual(stub.requests[2].query, { companyId: "c1" }, "not asked for: Django is not asked either");
  assert.equal("ownRequirements" in without, false);
  const nothing = await call(set, "estimateAnalysisCost", { companyId: "nopolicy", internalRequirements: true });
  assert.deepEqual([nothing.ownRequirements, nothing.totalUsd], [{ documents: 0, requirements: 0, usd: 0 }, 27],
                   "no policy-level document: the option would do nothing, and the model can say so");
  assert.deepEqual((await call(set, "estimateAnalysisCost", { companyId: "odd", internalRequirements: true })).ownRequirements,
                   { documents: null, requirements: null, usd: null }, "asked for and not answered: unknown, never zero");
  assert.match(set.estimateAnalysisCost.description, /internalRequirements.+own\s+policies.+ownRequirements.+documents 0/);
  assertAsUser(stub.requests);
});


test("runComplianceAnalysis: re-priced first; below the total (half a cent's grace) nothing starts", async () => {
  const set = await toolSet();
  for (const input of [{ companyId: "c1" }, { companyId: "c1", confirmedCostUsd: -1 }, { companyId: "c1", confirmedCostUsd: 10_001 },
                       { companyId: "c1", confirmedCostUsd: "27" }, { companyId: "c1", confirmedCostUsd: 27, language: "de" }]) {
    assert.equal(await refuses(set, "runComplianceAnalysis", input), true, JSON.stringify(input));
  }
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 26.99 }), (err) => {
    assert.equal(err.code, "COST_NOT_CONFIRMED");
    assert.equal(err.message, "[COST_NOT_CONFIRMED] runComplianceAnalysis failed: this scope is estimated at up to $27.00 (analysis $20.00 "
      + "+ extraction $7.00) — tell the user, get an explicit yes, then call again with that amount; or propose a narrower scope");
    return true;
  });
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 1.5 }), { code: "COST_NOT_CONFIRMED" },
                       "the cheap scope's yes does not buy the whole corpus");
  assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0, "nothing started");
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), Array(2).fill("GET /api/reports/estimate"));
  const grace = await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 26.996 });
  assert.equal(grace.started, true, "rounding within half a cent is a yes");
  assertAsUser(stub.requests);
});


test("runComplianceAnalysis: an estimate without a total starts nothing (ASSISTANT-LLM-17, FIXED)", async () => {
  const set = await toolSet();
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "odd", confirmedCostUsd: 0 }), (err) => {
    assert.equal(err.code, "COST_UNKNOWN");
    assert.match(err.message, /^\[COST_UNKNOWN\] runComplianceAnalysis failed: /);
    return true;
  });
  assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0);
});


test("runComplianceAnalysis: an estimate with an unknown price is only a floor — a $0 confirmation starts nothing", async () => {
  const set = await toolSet();
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "unpriced", confirmedCostUsd: 0 }), (err) => {
    assert.equal(err.code, "COST_UNKNOWN");
    assert.match(err.message, /only a floor/);
    return true;
  });
  assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0);
});


test("runComplianceAnalysis: the POST — the turn's language unless told, the scope only when given; the report card", async () => {
  const set = await toolSet({ language: "en" });
  const started = await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 27 });
  const post = stub.requests.find((r) => r.method === "POST");
  assert.deepEqual([post.path, post.body], ["/api/reports", { companyId: "c1", language: "en", review: true }]);
  const { next, ...card } = started;
  assert.deepEqual(card, {
    started: true, stopsForScope: true,
    report: { id: "r9", companyId: "c1", companyName: "UAB Kripto", status: "queued", jobStatus: "queued", language: "en", title: null,
              createdAt: "2026-09-27T10:00:00+00:00", finishedAt: null, progress: { step: null, percent: null, message: null }, error: null,
              url: "/reports/r9" },
    counts: { acts: null, findings: null, openBySeverity: null, actions: null },
  });
  assert.equal(typeof next, "string");
  stub.requests.length = 0;
  await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 1.5, documentIds: ["mica", "dora"], language: "lt" });
  assert.equal(stub.requests[0].query.documentIds, "mica,dora", "the SAME scope is re-priced");
  assert.deepEqual(stub.requests[1].body, { companyId: "c1", language: "lt", documentIds: ["mica", "dora"], review: true });
  assertAsUser(stub.requests);
});


test("runComplianceAnalysis: the run stops for the user's approval of its acts, unless the user said to run without it", async () => {
  const set = await toolSet();
  for (const input of [{ companyId: "c1", confirmedCostUsd: 27, autoApprove: "yes" }, { companyId: "c1", confirmedCostUsd: 27, autoApprove: null },
                       { companyId: "c1", confirmedCostUsd: 27, review: false }]) {
    assert.equal(await refuses(set, "runComplianceAnalysis", input), true, JSON.stringify(input));
  }
  const reviewed = await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 27 });
  assert.equal(stub.requests.at(-1).body.review, true, "by default Django is asked to stop for the scope");
  assert.equal(reviewed.stopsForScope, true);
  assert.match(reviewed.next, /getReport.+scope_review.+approveReportScope/, "what comes next, by the tools' names");
  assert.match(reviewed.next, /their yes to that price too — the start's yes does not cover it/, "the approved list is confirmed again");
  assert.match(reviewed.next, /the card shows it live: no getReport in this turn\. When getReport shows scope_review/,
               "the run is not read again in the turn that started it — the chat's card follows it");
  assert.ok(!reviewed.next.includes("\n") && reviewed.next.length < 300, "one line");
  await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 27, autoApprove: false });
  assert.equal(stub.requests.at(-1).body.review, true);

  const unattended = await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 27, autoApprove: true });
  assert.deepEqual(stub.requests.at(-1).body, { companyId: "c1", language: "lt" }, "review is left out, as before the review existed");
  assert.deepEqual([unattended.started, unattended.stopsForScope, "next" in unattended, unattended.report.id], [true, false, false, "r9"]);
  stub.requests.length = 0;
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 1.5, autoApprove: true }), { code: "COST_NOT_CONFIRMED" },
                       "running unattended does not open the cost gate");
  assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0);
  assert.match(set.runComplianceAnalysis.description, /STOPS once it has decided which acts apply/);
  assert.match(set.runComplianceAnalysis.description, /getReport.+approveReportScope.+confirmed again/, "the model knows before it starts");

  // A report waiting for its scope holds the company as a
  // running one does
  const held = await call(set, "runComplianceAnalysis", { companyId: "waiting", confirmedCostUsd: 30 });
  assert.deepEqual([held.started, held.alreadyRunning, held.report.id, held.report.status], [false, true, "r-wait", "scope_review"]);
  assertAsUser(stub.requests);
});


test("runComplianceAnalysis: the company's own requirements are priced with the scope, and started only when asked for", async () => {
  const set = await toolSet();
  for (const input of [{ companyId: "c1", confirmedCostUsd: 30, internalRequirements: "yes" },
                       { companyId: "c1", confirmedCostUsd: 30, internalRequirements: null }, { companyId: "c1", confirmedCostUsd: 30, internal: true }]) {
    assert.equal(await refuses(set, "runComplianceAnalysis", input), true, JSON.stringify(input));
  }
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 27, internalRequirements: true }), (err) => {
    assert.equal(err.code, "COST_NOT_CONFIRMED");
    assert.equal(err.message, "[COST_NOT_CONFIRMED] runComplianceAnalysis failed: this scope is estimated at up to $28.25 (analysis $20.00 "
      + "+ extraction $7.00 + own requirements $1.25) — tell the user, get an explicit yes, then call again with that amount; or propose a "
      + "narrower scope");
    return true;
  }, "the yes to the acts alone does not buy the own requirements on top of them");
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.query]), [["GET", "/api/reports/estimate", { companyId: "c1", internal: "true" }]],
                   "priced as it would run — and nothing started");
  stub.requests.length = 0;
  const started = await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 28.25, internalRequirements: true });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.method === "GET" ? r.query : r.body]), [
    ["GET", "/api/reports/estimate", { companyId: "c1", internal: "true" }],
    ["POST", "/api/reports", { companyId: "c1", language: "lt", review: true, internal: true }],
  ]);
  assert.deepEqual([started.started, started.stopsForScope, started.report.id], [true, true, "r9"]);
  await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 2.75, documentIds: ["mica"], autoApprove: true, internalRequirements: true });
  assert.deepEqual(stub.requests.at(-1).body, { companyId: "c1", language: "lt", documentIds: ["mica"], internal: true });
  await call(set, "runComplianceAnalysis", { companyId: "c1", confirmedCostUsd: 27, internalRequirements: false });
  assert.deepEqual([stub.requests.at(-2).query, stub.requests.at(-1).body], [{ companyId: "c1" }, { companyId: "c1", language: "lt", review: true }],
                   "not asked for: neither priced nor started");
  const schema = await set.runComplianceAnalysis.inputSchema.jsonSchema;
  assert.match(schema.properties.internalRequirements.description,
               /only when the user asks to check whether the company's procedures follow its own policies.+ownRequirements/);
  assertAsUser(stub.requests);
});


test("runComplianceAnalysis: Django's refusals for the model; ALREADY_RUNNING answered with the running report", async () => {
  const set = await toolSet();
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "empty", confirmedCostUsd: 30 }),
                       { message: "[CORPUS_EMPTY] runComplianceAnalysis failed (HTTP 409): The legal corpus is empty — an admin must ingest acts first" });
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "broke", confirmedCostUsd: 30 }),
                       { message: "[BUDGET_EXCEEDED] runComplianceAnalysis failed (HTTP 429): Today's AI usage budget is spent — try again tomorrow" });
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "gone", confirmedCostUsd: 30 }), { code: "NOT_FOUND" },
                       "an unknown company fails at the estimate");
  stub.requests.length = 0;
  const busy = await call(set, "runComplianceAnalysis", { companyId: "busy", confirmedCostUsd: 30 });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path} ${JSON.stringify(r.query)}`), [
    "GET /api/reports/estimate {\"companyId\":\"busy\"}", "POST /api/reports {}", "GET /api/reports {\"companyId\":\"busy\"}",
  ]);
  assert.equal(busy.started, false);
  assert.equal(busy.alreadyRunning, true, "ReportToolCard shows 'already running'");
  assert.equal(busy.report.id, "r-live");
  assert.deepEqual(busy.report.progress, { step: "gap_analysis", percent: 40, message: null });
  await assert.rejects(call(set, "runComplianceAnalysis", { companyId: "idle", confirmedCostUsd: 30 }), { code: "ALREADY_RUNNING" },
                       "no running report found → the refusal itself");
  assertAsUser(stub.requests);
});


test("approveReportScope: the acts chosen are priced first; below their total (half a cent's grace) nothing is approved", async () => {
  const set = await toolSet();
  for (const input of [{ reportId: "r-wait" }, { confirmedCostUsd: 5.25 }, { reportId: "r-wait", confirmedCostUsd: -1 },
                       { reportId: "r-wait", confirmedCostUsd: 10_001 }, { reportId: "r-wait", confirmedCostUsd: "5.25" },
                       { reportId: "r-wait", confirmedCostUsd: 5.25, assess: "a-ai" }, { reportId: "r-wait", confirmedCostUsd: 5.25, skip: [""] },
                       { reportId: "r-wait", confirmedCostUsd: 5.25, assess: Array(201).fill("a-ai") },
                       { reportId: "r-wait", confirmedCostUsd: 5.25, acts: { "a-ai": "assess" } },
                       { reportId: "r-wait", confirmedCostUsd: 5.25, approved: true }]) {
    assert.equal(await refuses(set, "approveReportScope", input), true, JSON.stringify(input).slice(0, 80));
  }
  const both = await set.approveReportScope.inputSchema.validate({ reportId: "r-wait", confirmedCostUsd: 9, assess: ["a-ai", "a-crr"], skip: ["a-amlr", "a-ai"] });
  assert.equal(both.success, false, "an act cannot be taken in and left out at once");
  assert.match(both.error.message, /either in assess or in skip, never in both/, "and the model is told why");
  assert.equal(stub.requests.length, 0, "a refused input reaches nothing");

  await assert.rejects(call(set, "approveReportScope", { reportId: "r-wait", confirmedCostUsd: 5.24 }), (err) => {
    assert.equal(err.code, "COST_NOT_CONFIRMED");
    assert.equal(err.message, "[COST_NOT_CONFIRMED] approveReportScope failed: assessing these acts is estimated at up to $5.25 (analysis $4.00 "
      + "+ extraction $1.25) — tell the user, get an explicit yes, then call again with that amount; or leave more acts out");
    return true;
  });
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-wait", assess: ["a-ai"], confirmedCostUsd: 5.25 }),
                       (err) => err.code === "COST_NOT_CONFIRMED" && /up to \$7\.25 \(analysis \$6\.00/.test(err.message),
                       "the yes to the run's plan does not buy an act taken in on top of it");
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, "approved" in r.body]), Array(2).fill(["POST", "/api/reports/r-wait/scope", false]),
                   "two dry runs — nothing was approved");
  const grace = await call(set, "approveReportScope", { reportId: "r-wait", confirmedCostUsd: 5.246 });
  assert.equal(grace.approved, true, "rounding within half a cent is a yes");
  stub.requests.length = 0;
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-odd", confirmedCostUsd: 0 }), (err) => {
    assert.equal(err.code, "COST_UNKNOWN");
    assert.match(err.message, /^\[COST_UNKNOWN\] approveReportScope failed: the cost of assessing these acts could not be estimated/);
    return true;
  }, "a dry run without a total approves nothing, whatever was confirmed");
  assert.equal(stub.requests.length, 1);
  assertAsUser(stub.requests);
});


test("approveReportScope: an estimate with an unknown price is only a floor — no confirmation approves it", async () => {
  const set = await toolSet();
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-unpriced", confirmedCostUsd: 10_000 }), (err) => {
    assert.equal(err.code, "COST_UNKNOWN");
    assert.equal(err.message, "[COST_UNKNOWN] approveReportScope failed: a model's price is unknown, so the estimate ($5.25) is only a floor — "
      + "do not approve it from the chat; tell the user they can approve it on the report's page, which shows the estimate");
    return true;
  });
  assert.deepEqual(stub.requests.map((r) => "approved" in r.body), [false], "the dry run only — nothing was approved");
  stub.routes["GET /api/reports/r-unpriced"] = () => ({ json: { ...WAITING, id: "r-unpriced" } });
  const { scope } = await call(set, "getReport", { reportId: "r-unpriced" });
  assert.deepEqual([scope.estimate.pricesKnown, scope.estimate.totalUsd], [false, 5.25], "getReport says the total is only a floor before anyone is asked");
  assertAsUser(stub.requests);
});


test("approveReportScope: the approval — the choices as Django's acts map, priced and approved alike; the report card", async () => {
  const set = await toolSet();
  const approved = await call(set, "approveReportScope", { reportId: "r-wait", assess: ["a-ai", "a-crr"], skip: ["a-amlr"], confirmedCostUsd: 6 });
  const acts = { "a-ai": "assess", "a-crr": "assess", "a-amlr": "skip" };
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.body]), [
    ["POST", "/api/reports/r-wait/scope", { acts }],
    ["POST", "/api/reports/r-wait/scope", { acts, approved: true }],
  ], "the same choices are priced, then approved");
  assert.deepEqual(approved, {
    approved: true,
    report: { id: "r-wait", companyId: "c1", companyName: "UAB Kripto", status: "queued", jobStatus: "queued", language: "lt", title: null,
              createdAt: "2026-09-27T10:00:00+00:00", finishedAt: null, progress: { step: null, percent: null, message: null }, error: null,
              url: "/reports/r-wait" },
    counts: { acts: { applies: 3, uncertain: 1, not_applies: 3, assessed: 1, upcoming: 1, unconfirmed: 1, indirect: 1 },
              findings: {}, openBySeverity: {}, actions: 0 },
  }, "the card ReportToolCard renders: the run is queued again for its second part");
  stub.requests.length = 0;
  const asPlanned = await call(set, "approveReportScope", { reportId: "r-wait", confirmedCostUsd: 5.25 });
  assert.deepEqual(stub.requests.map((r) => r.body), [{ acts: {} }, { acts: {}, approved: true }], "no choices: the run's own plan");
  assert.equal(asPlanned.approved, true);
  await call(set, "approveReportScope", { reportId: "r-wait", assess: [], skip: ["a-amlr", "a-amlr"], confirmedCostUsd: 2 });
  assert.deepEqual(stub.requests.at(-1).body, { acts: { "a-amlr": "skip" }, approved: true });
  assert.match(set.approveReportScope.description, /ONLY after you showed the user/);
  assert.match(set.approveReportScope.description, /what will be assessed, what\s+will not and why/);
  assert.match(set.approveReportScope.description, /does not bind the company.+good practice/);
  assertAsUser(stub.requests);
});


test("approveReportScope: Django's refusals reach the model — not waiting, nothing left to assess, the budget spent", async () => {
  const calls = [];
  const set = await toolSet({ calls });
  await assert.rejects(call(set, "approveReportScope", { reportId: "r1", confirmedCostUsd: 100 }),
                       { message: "[NOT_WAITING] approveReportScope failed (HTTP 409): The report is not waiting for its scope to be approved" });
  assert.equal(stub.requests.length, 1, "a finished report is refused at the dry run");
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-raced", confirmedCostUsd: 5.25 }), { code: "NOT_WAITING" },
                       "approved or stopped elsewhere between the price and the approval");
  assert.equal(stub.requests.at(-1).body.approved, true);
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-wait", skip: ["a-mica", "a-amlr"], confirmedCostUsd: 0 }),
                       { message: "[NOTHING_TO_ASSESS] approveReportScope failed (HTTP 400): Nothing is left to assess — take at least one act in" });
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-broke", confirmedCostUsd: 5.25 }),
                       { message: "[BUDGET_EXCEEDED] approveReportScope failed (HTTP 429): Today's AI usage budget is spent — try again tomorrow" });
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-wait", assess: ["a-not-its"], confirmedCostUsd: 100 }),
                       { message: "[INVALID_FIELD] approveReportScope failed (HTTP 400): acts names an act that is not in this report" });
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-other-users", confirmedCostUsd: 100 }), { code: "NOT_FOUND" });
  assert.deepEqual(calls.map((c) => [c.name, c.ok, c.code]), ["NOT_WAITING", "NOT_WAITING", "NOTHING_TO_ASSESS", "BUDGET_EXCEEDED", "INVALID_FIELD",
                                                             "NOT_FOUND"].map((code) => ["approveReportScope", false, code]));
  assertAsUser(stub.requests);
});


test("getReport: a running report is its card only; a failed one says why (trimmed)", async () => {
  const set = await toolSet();
  for (const input of [{}, { reportId: "r1", limit: 0 }, { reportId: "r1", limit: 26 }, { reportId: "r1", status: "open" }]) {
    assert.equal(await refuses(set, "getReport", input), true, JSON.stringify(input));
  }
  const running = await call(set, "getReport", { reportId: "r-running" });
  assert.deepEqual(Object.keys(running), ["report", "counts"]);
  assert.deepEqual(running.report.progress, { step: "gap_analysis", percent: 40, message: "Analizuojama" });
  assert.equal(running.report.url, "/reports/r-running");
  const failed = await call(set, "getReport", { reportId: "r-failed" });
  assert.equal(failed.report.error, `${"E".repeat(300)} …[truncated]`);
  assert.equal(failed.report.progress, null);
  await assert.rejects(call(set, "getReport", { reportId: "r-other-users" }), { code: "NOT_FOUND" });
  assertAsUser(stub.requests);
});


test("getReport: a report waiting for its scope answers the acts it asks about and the price of the rest — the plan first, kept small", async () => {
  const set = await toolSet();
  const waiting = await call(set, "getReport", { reportId: "r-wait" });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.body]),
                   [["GET", "/api/reports/r-wait", null], ["POST", "/api/reports/r-wait/scope", { acts: {} }]],
                   "the dry run with no choices prices the run's own plan — nothing is approved by reading");
  assert.deepEqual(Object.keys(waiting), ["report", "counts", "scope"], "no findings overview: there is nothing to find yet");
  assert.deepEqual([waiting.report.status, waiting.report.url], ["scope_review", "/reports/r-wait"]);
  const { next, ...scope } = waiting.scope;
  assert.deepEqual(scope, {
    waiting: true, spentUsd: 0.42,
    acts: [
      { id: "a-mica", act: "MiCA", type: "regulation", verdict: "applies", plan: "assess", why: "assessed",
        reason: "Kriptoturto paslaugų teikėjas", obligations: 40, toExtract: false },
      { id: "a-amlr", act: "AMLR", type: "regulation", verdict: "applies", plan: "assess", why: "upcoming", appliesFrom: "2027-07-10",
        reason: "Įpareigotasis subjektas", obligations: 40, toExtract: true },
      { id: "a-ai", act: "AI Act", type: "regulation", verdict: "uncertain", plan: "skip", why: "unconfirmed",
        reason: `${"W".repeat(200)} …[truncated]`, questions: `${"K".repeat(400)} …[truncated]` },
      { id: "a-amld", act: "AMLD6", type: "directive", verdict: "applies", plan: "skip", why: "indirect", reason: "Taikoma per PPTFPĮ" },
      { id: "a-crr", act: "CRR", type: "regulation", verdict: "not_applies", plan: "skip", why: "notApplicable",
        reason: "Įmonė nėra kredito įstaiga" },
    ],
    moreActs: 0,
    screenedOut: { count: 2, acts: [{ id: "a-solv", act: "Mokumas II" }, { id: "a-psd", act: "PSD2" }] },
    estimate: { totalUsd: 5.25, analysisUsd: 4, extractionUsd: 1.25, upperBound: true, pricesKnown: true, obligations: 80,
                budget: SCOPE_BUDGET },
  }, "every judged act with its id, the run's verdict, the plan and why; questions only where they decide; the counts per act merged in");
  assert.match(next, /approveReportScope/);
  assert.ok(!next.includes("\n") && next.length < 300, "one line");
  const filtered = await call(set, "getReport", { reportId: "r-wait", status: "missing", limit: 5 });
  assert.deepEqual(filtered.scope.acts.map((a) => a.id), ["a-mica", "a-amlr", "a-ai", "a-amld", "a-crr"],
                   "a waiting report has no findings to filter: the list it waits on, whatever was asked");
  assert.match(set.getReport.description, /scope_review.+WAITS for the user.+approveReportScope/);
  assertAsUser(stub.requests);
});


test("getReport: a waiting report's long lists are capped and counted; a dry run that answers nothing leaves the price unknown", async () => {
  const act = (i, more) => ({ id: `a${i}`, shortTitle: `Aktas ${i}`, docType: "law", applicability: "applies", reasoning: "r", ...more });
  stub.routes["GET /api/reports/r-wide"] = () => ({ json: { ...WAITING, id: "r-wide", stats: {}, acts: [
    ...Array.from({ length: 44 }, (_, i) => act(i, { applicability: "not_applies", assessment: "none", screenedOut: true })),
    ...Array.from({ length: 30 }, (_, i) => act(100 + i, { applicability: "not_applies", assessment: "none", screenedOut: false })),
    ...Array.from({ length: 15 }, (_, i) => act(200 + i, { assessment: "assessed", screenedOut: false })),
  ] } });
  stub.routes["POST /api/reports/[^/]+/scope"] = () => ({ json: {} });
  const set = await toolSet();
  const { scope } = await call(set, "getReport", { reportId: "r-wide" });
  assert.deepEqual([scope.acts.length, scope.moreActs, scope.screenedOut.count, scope.screenedOut.acts.length], [40, 5, 44, 40]);
  assert.deepEqual(scope.acts.slice(0, 15).map((a) => a.plan), Array(15).fill("assess"), "the cut falls on what would not be assessed anyway");
  assert.deepEqual(scope.acts[0], { id: "a200", act: "Aktas 200", type: "law", verdict: "applies", plan: "assess", why: "assessed", reason: "r" },
                   "no count for an act the dry run did not price");
  assert.deepEqual(scope.screenedOut.acts[0], { id: "a0", act: "Aktas 0" }, "a screened-out act keeps its id: the user may take it in");
  assert.deepEqual([scope.spentUsd, scope.estimate], [null, { totalUsd: null, analysisUsd: null, extractionUsd: null, upperBound: true,
                                                              pricesKnown: false, obligations: null, budget: null }],
                   "missing figures read as unknown, never as zero — and the prices as not known");
  stub.routes["POST /api/reports/[^/]+/scope"] = scopeRoute;
  stub.routes["GET /api/reports/r1"] = () => ({ json: { ...WAITING, id: "r1" } });
  await assert.rejects(call(set, "getReport", { reportId: "r1" }), { code: "NOT_WAITING" },
                       "approved elsewhere between the read and the price: the next read shows it running");
});


test("a report started with the company's own requirements: its second part is priced with their share, shown and confirmed like the rest", async () => {
  const set = await toolSet();
  const { scope } = await call(set, "getReport", { reportId: "r-wait-own" });
  assert.deepEqual(scope.estimate, { totalUsd: 6.5, analysisUsd: 4, extractionUsd: 1.25, upperBound: true, pricesKnown: true, obligations: 80,
                                     ownRequirements: { documents: 2, requirements: 16, usd: 1.25 }, budget: SCOPE_BUDGET });
  await assert.rejects(call(set, "approveReportScope", { reportId: "r-wait-own", confirmedCostUsd: 5.25 }), (err) => {
    assert.equal(err.code, "COST_NOT_CONFIRMED");
    assert.equal(err.message, "[COST_NOT_CONFIRMED] approveReportScope failed: assessing these acts is estimated at up to $6.50 (analysis $4.00 "
      + "+ extraction $1.25 + own requirements $1.25) — tell the user, get an explicit yes, then call again with that amount; or leave more "
      + "acts out");
    return true;
  }, "the parts named add up to the total the user is asked to accept");
  assert.equal(stub.requests.some((r) => r.body?.approved), false, "nothing was approved");
  assert.equal((await call(set, "approveReportScope", { reportId: "r-wait-own", confirmedCostUsd: 6.5 })).approved, true);
  assert.equal("ownRequirements" in (await call(set, "getReport", { reportId: "r-wait" })).scope.estimate, false, "a run without them prices none");
  assertAsUser(stub.requests);
});


test("getReport: a tier that binds only certain persons says whom, before the kind of breach", async () => {
  const set = await toolSet();
  const persons = ["finansų įstaiga", "užsienio finansų įstaigos filialas"];
  stub.routes["GET /api/reports/r-meant"] = () => ({ json: { ...MEANT, findings: MEANT.findings.map((row) => (
    row.id === "f-two" ? { ...row, consequence: [{ ...TIER_SHARE, persons }, { ...TIER_GRAVER, persons }] } : row)) } });
  const report = await call(set, "getReport", { reportId: "r-meant", limit: 25 });
  assert.equal(report.topFindings.find((row) => row.id === "f-two").canCost,
               "a fine of up to 5% of annual turnover (income) – only for: finansų įstaiga, užsienio finansų įstaigos filialas "
               + "(PPTFPĮ 39 str. 1 d. 1 p.); a fine of up to EUR 5,100,000 or 12.5% of annual turnover (income); also: withdrawal or "
               + "suspension of the authorisation – only for: finansų įstaiga, užsienio finansų įstaigos filialas; Sistemingas, vienas "
               + "šiurkštus arba pakartotinis pažeidimas (PPTFPĮ 39 str. 1 d. 2 p., 14 str. 1 d.)");
});


test("getReport: a finding says what a breach can cost — a ceiling, in the report's wording, for a gap only — and its cause once a person wrote one", async () => {
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r-meant", limit: 25 });
  assert.deepEqual(report.topFindings.map((f) => f.id), ["f-fine", "f-long", "f-bare", "f-two", "f-unk", "f-ok", "f-off"]);
  const rows = Object.fromEntries(report.topFindings.map((f) => [f.id, f]));
  assert.equal(rows["f-fine"].canCost, "a fine of up to EUR 5,000,000 or 5% of annual turnover (income) or 2 times the benefit gained or loss avoided; "
    + "also: an order to end the breach, a public statement on the breach (MiCA 111 str. 3 d. a, c p.)",
               "every kind of ceiling the act states, then its measures, then where it stands");
  const graver = "a fine of up to EUR 5,100,000 or 12.5% of annual turnover (income); also: withdrawal or suspension of the authorisation – "
    + "Sistemingas, vienas šiurkštus arba pakartotinis pažeidimas (PPTFPĮ 39 str. 1 d. 2 p., 14 str. 1 d.)";
  assert.equal(rows["f-two"].canCost, `a fine of up to 5% of annual turnover (income) (PPTFPĮ 39 str. 1 d. 1 p.); ${graver}`,
               "two tiers joined by '; ': the graver one with the breach it is bound to and the provision its measure comes from");
  assert.equal(rows["f-unk"].canCost, "restriction or suspension of an activity, a_code_not_known_here (MiCA 94 str. 1 d.)"
    + " – this act was adopted under MiCA 92 str.",
               "without a ceiling a tier is its measures; a code this service does not know goes out as it is; "
               + "under a technical standard the line ends by naming the article the standard was adopted under");
  assert.deepEqual([rows["f-long"].canCost.length, rows["f-long"].canCost.startsWith(`${rows["f-fine"].canCost}; ${graver}; restriction or`),
                    rows["f-long"].canCost.endsWith(" …[truncated]")], [500 + " …[truncated]".length, true, true],
                   "capped at 500 with the cut marked: two whole tiers fit, down to the last provision named");
  for (const id of ["f-ok", "f-off", "f-bare"]) {
    assert.equal("canCost" in rows[id], false, `${id}: met, not applicable, or a tier that says nothing — no key at all`);
  }
  assert.ok(!/[  ]/.test(JSON.stringify(report.topFindings)), "no non-breaking space reaches the model");
  assert.deepEqual([rows["f-fine"].cause, "cause" in rows["f-two"], "cause" in rows["f-ok"], rows["f-long"].cause],
                   ["Nebuvo paskirtas atsakingas asmuo", false, false, `${"C".repeat(600)} …[truncated]`],
                   "the cause as the person wrote it (cut when long), no key while unwritten");
  assert.deepEqual(Object.keys(rows["f-fine"]), ["id", "act", "obligation", "status", "overridden", "severity", "analysis", "cause", "canCost",
                                                 "recommendation", "citations", "evidence", "deadline", "reviewerNote"],
                   "in the order the report's own card reads: the assessment, why, what it can cost, what to do");

  // A gap a reviewer closes costs nothing; the tool files the
  // verdict and its note, never a cause
  stub.routes["PATCH /api/reports/r-meant/findings/f-fine"] = (body) => ({ json: {
    ...MEANT.findings[0], overrideStatus: body.overrideStatus, effectiveStatus: body.overrideStatus ?? "missing", reviewerNote: body.reviewerNote } });
  const closed = await call(set, "overrideFinding", { reportId: "r-meant", findingId: "f-fine", status: "met", reason: "Atsakingas asmuo paskirtas" });
  assert.deepEqual(["canCost" in closed.finding, closed.finding.cause], [false, "Nebuvo paskirtas atsakingas asmuo"]);
  assert.deepEqual(stub.requests.at(-1).body, { overrideStatus: "met", reviewerNote: "Atsakingas asmuo paskirtas" });
  const reopened = await call(set, "overrideFinding", { reportId: "r-meant", findingId: "f-fine", status: null, reason: "Paskyrimas atšauktas" });
  assert.equal(reopened.finding.canCost, rows["f-fine"].canCost, "and a gap again says what it can cost");
  assert.match(set.getReport.description, /canCost is the ceiling the act provides for a breach of the provision, never a forecast —\s+say "up to"/);
  assert.match(set.getReport.description, /cause is written only by a person on the report page — you never write or file\s+one/);
  assert.match(set.getReport.description, /tell a user who names a cause to record it in the finding's review dialog/);
  assert.match(set.overrideFinding.description, /reason is never the place for a cause: why a gap exists is recorded by a person in the finding's\s+review dialog/);
  assertAsUser(stub.requests);
});


test("getReport: a finding under an act not yet in force never says what a breach can cost — a date it applies from and a cost never share a row", async () => {
  // A report made when Django still kept sanction tiers on the
  // findings of an act assessed as preparation
  const finding = (id, act, effectiveStatus, appliesFrom) => (
    { id, shortTitle: act, effectiveStatus, status: effectiveStatus, severity: "high", appliesFrom, consequence: [TIER_MICA], cause: "", citations: [] });
  const later = finding("later", "AMLR", "missing", "2027-07-10");
  stub.routes["GET /api/reports/r-early"] = () => ({ json: { ...DONE, id: "r-early", findings: [
    later, finding("later-part", "AMLR", "partial", "2027-07-10"), finding("today", "MiCA", "missing", null)] } });
  stub.routes["PATCH /api/reports/r-early/findings/later"] = (body) => ({ json: { ...later, overrideStatus: body.overrideStatus,
                                                                                   effectiveStatus: body.overrideStatus, reviewerNote: body.reviewerNote } });
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r-early" });
  assert.deepEqual(report.topFindings.map((f) => [f.id, f.appliesFrom ?? null, "canCost" in f]),
                   [["today", null, true], ["later", "2027-07-10", false], ["later-part", "2027-07-10", false]],
                   "what does not bind the company yet cannot be breached: preparation carries its date and no cost");
  assert.equal(report.topFindings.some((f) => f.appliesFrom && f.canCost), false);
  const page = await call(set, "getReport", { reportId: "r-early", act: "AMLR" });
  assert.deepEqual(page.topFindings.map((f) => "canCost" in f), [false, false], "on a page of the act's findings too");
  const reviewed = await call(set, "overrideFinding", { reportId: "r-early", findingId: "later", status: "unknown", reason: "Dar nevertinta" });
  assert.deepEqual([reviewed.finding.appliesFrom, "canCost" in reviewed.finding], ["2027-07-10", false], "nor after a review of it");
  assertAsUser(stub.requests);
});


test("getReport: the company's own requirements are counted apart, absent from the acts' counts and lists, and listed as the act 'internal'", async () => {
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r-meant" });
  assert.deepEqual(report.ownRequirements, {
    counts: { missing: 1, partial: 1, met: 1 }, openBySeverity: { high: 1, medium: 1 },
    note: "the company's own policies as criteria — gaps between its policies and its procedures, counted apart from the acts; not breaches of law",
  }, "by EFFECTIVE status: the reviewer's override (o-part) wins over the stored counts");
  assert.deepEqual(report.counts, {
    acts: { applies: 2, uncertain: 0, not_applies: 0, assessed: 2 }, actions: 2,
    findings: { missing: 3, partial: 1, unknown: 1, met: 1, not_applicable: 1 }, openBySeverity: { critical: 1, medium: 1, low: 1, high: 1 },
  }, "the acts' counts hold none of them");
  assert.deepEqual(report.byAct, [{ act: "MiCA", total: 5, missing: 3, unknown: 1, met: 1 }, { act: "PPTFPĮ", total: 2, partial: 1, not_applicable: 1 }],
                   "no row among the acts");
  assert.deepEqual(report.acts, { assessed: [{ act: "MiCA", applicability: "applies", confidence: 0.9 },
                                             { act: "PPTFPĮ", applicability: "applies", confidence: 0.9 }] },
                   "the row they hang on is no act the report assessed");
  assert.deepEqual([report.matchingFindings, report.topFindings.some((f) => f.id.startsWith("o-"))], [7, false],
                   "the overview's findings are the acts'");
  assert.deepEqual(Object.keys(report).slice(0, 4), ["report", "counts", "ownRequirements", "summary"]);
  const gaps = await call(set, "getReport", { reportId: "r-meant", status: "missing" });
  assert.deepEqual(gaps.topFindings.map((f) => f.id), ["f-fine", "f-long", "f-bare"], "a filter that names no act stays with the acts");
  assert.deepEqual(Object.keys(gaps), ["report", "counts", "ownRequirements", "matchingFindings", "topFindings", "moreFindings"]);

  const own = await call(set, "getReport", { reportId: "r-meant", act: "internal" });
  assert.deepEqual([own.topFindings.map((f) => f.id), own.matchingFindings, own.moreFindings], [["o-miss", "o-part", "o-met"], 3, 0]);
  assert.deepEqual(own.topFindings[0], {
    id: "o-miss", act: "Vidaus reikalavimai", obligation: "Rizikos vertinimas peržiūrimas kasmet", status: "missing", overridden: false,
    severity: "high", analysis: "Procedūra peržiūros nenumato", recommendation: "Papildyti procedūrą", criterion: "Rizikos valdymo politika 4.2 p.",
    evidence: [{ document: "Rizikos vertinimo procedūra", quote: "Peržiūra atliekama pagal poreikį" }], deadline: "", reviewerNote: null,
  }, "the criterion is a passage of the company's own policy — no legal provision, and nothing a breach of law would cost");
  assert.deepEqual(own.topFindings.slice(1).map((f) => [f.criterion, f.cause ?? null, f.overridden, "citations" in f, "canCost" in f]),
                   [["Atitikties politika", "Procedūra neatnaujinta po politikos pakeitimo", true, false, false], [null, null, false, false, false]],
                   "a policy without a section is named alone; a requirement without its passage has no criterion to name");
  assert.deepEqual([own.ownRequirements, own.counts], [report.ownRequirements, report.counts], "what they are is said on every page of them");
  const narrowed = await call(set, "getReport", { reportId: "r-meant", act: " Internal ", status: "partial", severity: "medium" });
  assert.deepEqual(narrowed.topFindings.map((f) => f.id), ["o-part"], "the other filters narrow them as they narrow an act's findings");
  const byName = await call(set, "getReport", { reportId: "r-meant", act: "vidaus reikalavimai" });
  assert.deepEqual(byName.topFindings.map((f) => f.id), ["o-miss", "o-part", "o-met"], "the name their rows carry finds them too");
  const paged = await call(set, "getReport", { reportId: "r-meant", act: "internal", offset: 1, limit: 1 });
  assert.deepEqual([paged.topFindings.map((f) => f.id), paged.moreFindings], [["o-part"], 1]);

  // Where the stats count no acts the tool counts the rows itself
  stub.routes["GET /api/reports/r-bare"] = () => ({ json: { ...MEANT, id: "r-bare", stats: { internal: MEANT.stats.internal } } });
  assert.deepEqual((await call(set, "getReport", { reportId: "r-bare" })).counts.acts, { applies: 2 }, "and leaves the row out");
  // Stored counts stand where no finding of the group is loaded
  stub.routes["GET /api/reports/r-stats"] = () => ({ json: { ...DONE, id: "r-stats", stats: { ...DONE.stats, internal: MEANT.stats.internal } } });
  assert.deepEqual((await call(set, "getReport", { reportId: "r-stats" })).ownRequirements.counts, MEANT.stats.internal.findings);
  assert.equal("ownRequirements" in (await call(set, "getReport", { reportId: "r1" })), false, "a report that did not assess them says nothing of them");
  assert.deepEqual((await call(set, "getReport", { reportId: "r1", act: "internal" })).topFindings, []);
  assert.match(set.getReport.description, /ownRequirements: gaps against the company's own policies, never breaches of law/);
  const schema = await set.getReport.inputSchema.jsonSchema;
  assert.match(schema.properties.act.description, /'internal' lists the findings of the company's own requirements \(ownRequirements\)/);
  assert.match(schema.properties.status.description, /met=atitinka.+not_applicable=netaikoma/, "the report's Lithuanian words for the statuses");
  assertAsUser(stub.requests);
});


test("getReport: a finished report — counts by EFFECTIVE status, the most urgent findings first, capped lists", async () => {
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r1" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path], ["GET", "/api/reports/r1"]);
  assert.deepEqual(report.counts, {
    acts: { applies: 3, uncertain: 1, not_applies: 2 }, actions: 2,
    findings: { met: 1, missing: 2, partial: 1, not_applicable: 1, unknown: 1 }, openBySeverity: { low: 1, critical: 1, medium: 1 },
  }, "the reviewer's override (f-part) wins over the pipeline's verdict and stats");
  assert.deepEqual(report.topFindings.map((f) => f.id), ["f-crit", "f-low", "f-part", "f-unk", "f-met", "f-na"]);
  assert.equal(report.moreFindings, 0);
  assert.deepEqual(report.topFindings[0], {
    id: "f-crit", act: "MiCA", obligation: `${"O".repeat(200)} …[truncated]`, status: "missing", overridden: false, severity: "critical",
    analysis: `${"A".repeat(400)} …[truncated]`, recommendation: `${"R".repeat(300)} …[truncated]`,
    citations: [{ path: "59 str.", act: "MiCA", url: "https://eur-lex/#art_59" }, { path: "60 str.", act: null, url: null },
                { path: "61 str.", act: null, url: null }],
    evidence: [{ document: "F07 Saugojimo politika", quote: `${"Q".repeat(200)} …[truncated]` }, { document: "CASP leidimas", quote: "LB-1" }],
    deadline: "2026-12-30", reviewerNote: null,
  }, "up to three citations and the two passages the verdict rests on");
  assert.deepEqual(report.topFindings[1].evidence, [], "a finding without evidence says so");
  assert.deepEqual([report.matchingFindings, report.moreFindings], [6, 0]);
  assert.deepEqual([report.topFindings[2].overridden, report.topFindings[2].act, report.topFindings[2].reviewerNote],
                   [true, "Pinigų plovimo prevencijos įstatymas", "Policy covers half"]);
  assert.equal(report.summary, `${"S".repeat(3_000)} …[truncated]`);
  assert.deepEqual(Object.keys(report.acts), ["assessed"], "a report from before acts said how they were treated: all that applied were assessed");
  assert.equal(report.acts.assessed.length, 15);
  assert.ok(report.acts.assessed.every((a) => a.applicability !== "not_applies"));
  assert.deepEqual([report.actions.length, report.moreActions], [25, 2], "the plan, capped and counted");
  assert.deepEqual(report.actions[0], { title: "Veiksmas 0", description: `${"D".repeat(300)} …[truncated]`, priority: "high",
                                        timeframe: "immediate", effort: "low", ownerRole: "CEO", closesFindings: 1 },
                   "how many findings an action closes, not their ids");
  assert.deepEqual(Object.keys(report), ["report", "counts", "summary", "byAct", "acts", "scopeApprovedBy", "matchingFindings", "topFindings",
                                         "moreFindings", "actions", "moreActions", "citationAudit", "exports"], "the overview, with the id alone");
  assert.equal(report.scopeApprovedBy, "nobody — ran without the review", "a report from before the review existed ran without it");
  assert.deepEqual(report.byAct, [
    { act: "—", total: 4, met: 1, missing: 1, not_applicable: 1, unknown: 1 },
    { act: "MiCA", total: 1, missing: 1 },
    { act: "Pinigų plovimo prevencijos įstatymas", total: 1, partial: 1 },
  ], "the counts of every act by effective status, the most open gaps first (a tie: the larger act)");
  assert.deepEqual(report.citationAudit, {
    counts: { checked: 4, match: 1, mismatch: 1, notFound: 1, notInCorpus: 1, unknown: 0 },
    problems: [
      { document: "F00 Apžvalga", act: "MiCA", cites: "77 str. 1 d.", claim: "Konsultavimas dėl kriptoturto", verdict: "mismatch",
        actual: "Prekybos platformos veiklos taisyklės", url: "https://eur-lex/#art_77" },
      { document: "F12 Rinkodara", act: "MiCA", cites: "199 str.", claim: "Reklama", verdict: "not_found", actual: null, url: null },
    ],
    moreProblems: 0,
  }, "only the wrong references, with what the provision really is");
  assert.deepEqual(report.exports, { pdf: "/api/reports/r1/export?format=pdf", xlsx: "/api/reports/r1/export?format=xlsx" });
  assert.equal(report.report.url, "/reports/r1");
  assert.equal("extra" in report.report.progress, false);
});


test("getReport: preparation for a later act is counted and listed apart, and the acts not assessed are named with their questions", async () => {
  const finding = (id, act, effectiveStatus, severity, appliesFrom = null) => (
    { id, shortTitle: act, effectiveStatus, status: effectiveStatus, severity, appliesFrom, citations: [] });
  stub.routes["GET /api/reports/r-new"] = () => ({ json: {
    ...DONE, id: "r-new",
    stats: { ...DONE.stats, acts: { applies: 4, uncertain: 1, not_applies: 1, assessed: 1, upcoming: 1, unconfirmed: 1, indirect: 2 } },
    acts: [
      { shortTitle: "MiCA", applicability: "applies", confidence: 0.9, assessment: "assessed" },
      { shortTitle: "AMLR", applicability: "applies", confidence: 0.9, assessment: "upcoming", appliesFrom: "2027-07-10" },
      { shortTitle: "AI Act", applicability: "uncertain", confidence: 0.4, assessment: "unconfirmed", reasoning: "W".repeat(350),
        conditionsToVerify: "Ar įmonė naudoja DI sistemas klientams vertinti?" },
      { shortTitle: "AMLD6", applicability: "applies", confidence: 0.8, assessment: "indirect", docType: "directive" },
      { shortTitle: "LBĮ", applicability: "applies", confidence: 0.9, assessment: "indirect", docType: "law" },
      { shortTitle: "CRR", applicability: "not_applies", confidence: 0.6, assessment: "none", screenedOut: true },
    ],
    findings: [
      finding("later-crit", "AMLR", "missing", "critical", "2027-07-10"),
      finding("today-med", "MiCA", "partial", "medium"),
      finding("later-met", "AMLR", "met", "low", "2027-07-10"),
      finding("today-met", "MiCA", "met", "high"),
    ],
  } });
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r-new" });
  assert.deepEqual(report.counts, {
    acts: { applies: 4, uncertain: 1, not_applies: 1, assessed: 1, upcoming: 1, unconfirmed: 1, indirect: 2 },
    findings: { partial: 1, met: 1 }, openBySeverity: { medium: 1 },
    upcoming: { findings: { missing: 1, met: 1 }, openBySeverity: { critical: 1 } },
    actions: 2,
  }, "the result is today's; what is not yet law for the company is counted apart");
  assert.deepEqual(report.byAct, [
    { act: "MiCA", total: 2, partial: 1, met: 1 },
    { act: "AMLR", appliesFrom: "2027-07-10", total: 2, missing: 1, met: 1 },
  ], "the later act last, whatever its gaps, with its date");
  assert.deepEqual(report.acts, {
    assessed: [{ act: "MiCA", applicability: "applies", confidence: 0.9 }],
    upcoming: [{ act: "AMLR", appliesFrom: "2027-07-10" }],
    toConfirm: [{ act: "AI Act", why: `${"W".repeat(300)} …[truncated]`, questions: "Ar įmonė naudoja DI sistemas klientams vertinti?" }],
    throughNationalLaw: ["AMLD6"],
    institutional: ["LBĮ"],
  }, "an act that does not apply is in none of them; a directive and an act that organises an authority stand apart");
  assert.deepEqual(report.topFindings.map((f) => [f.id, f.appliesFrom]),
                   [["today-med", undefined], ["today-met", undefined], ["later-crit", "2027-07-10"], ["later-met", "2027-07-10"]],
                   "today's findings first — a critical gap under an act not yet in force comes after them");
  const later = await call(set, "getReport", { reportId: "r-new", act: "AMLR", status: "missing" });
  assert.deepEqual(later.topFindings.map((f) => [f.id, f.appliesFrom]), [["later-crit", "2027-07-10"]]);
  assert.deepEqual(later.counts.upcoming, { findings: { missing: 1, met: 1 }, openBySeverity: { critical: 1 } });

  // A list row carries no findings: the stored counts stand
  stub.routes["GET /api/reports"] = () => ({ json: { reports: [{
    ...DONE, id: "r-new", findings: undefined,
    stats: { ...DONE.stats, findings: { met: 1, partial: 1 }, openBySeverity: { medium: 1 },
             upcoming: { findings: { missing: 1, met: 1 }, openBySeverity: { critical: 1 } } },
  }] } });
  const [listed] = (await call(set, "listReports", {})).reports;
  assert.deepEqual([listed.counts.findings, listed.counts.upcoming],
                   [{ met: 1, partial: 1 }, { findings: { missing: 1, met: 1 }, openBySeverity: { critical: 1 } }]);
});


test("getReport: a finished report says who approved its scope, and where that person decided against the run's verdict", async () => {
  stub.routes["GET /api/reports/r-chosen"] = () => ({ json: {
    ...DONE, id: "r-chosen", scopeApprovedBy: "u1", scopeApprovedByName: "Rasa Rasaitė", scopeApprovedAt: "2026-09-27T08:20:00+00:00",
    acts: [
      { shortTitle: "MiCA", applicability: "applies", confidence: 0.9, assessment: "assessed", screenedOut: false },
      { shortTitle: "CRR", applicability: "not_applies", confidence: 0.9, assessment: "assessed", screenedOut: false },
      { shortTitle: "DORA", applicability: "applies", confidence: 0.9, assessment: "none", screenedOut: false },
      { shortTitle: "AMLR", applicability: "applies", confidence: 0.9, assessment: "upcoming", appliesFrom: "2027-07-10", screenedOut: false },
      { shortTitle: "", documentTitle: "Mokumas II", applicability: "not_applies", confidence: 0.8, assessment: "upcoming",
        appliesFrom: "2027-01-01", screenedOut: false },
      { shortTitle: "PSD2", applicability: "not_applies", confidence: 0.9, assessment: "none", screenedOut: false },
      { shortTitle: "IDD", applicability: "not_applies", confidence: 1, assessment: "none", screenedOut: true },
      { shortTitle: "AI Act", applicability: "uncertain", confidence: 0.4, assessment: "none", screenedOut: false },
    ],
  } });
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r-chosen" });
  assert.deepEqual(report.acts, {
    assessed: [{ act: "MiCA", applicability: "applies", confidence: 0.9 }],
    upcoming: [{ act: "AMLR", appliesFrom: "2027-07-10" }],
    assessedByChoice: ["CRR", "Mokumas II"],
    leftOutByReviewer: ["DORA"],
  }, "an act assessed although it does not bind the company is good practice, named apart from the assessed; an act that applies "
     + "and was left out is named too — one judged not to apply, or screened out, is in no group");
  assert.equal(report.scopeApprovedBy, "Rasa Rasaitė");
  assert.equal(stub.requests.length, 1, "a finished report is read once — no price is asked");

  // A run without the review stamps the time and nobody
  stub.routes["GET /api/reports/r-alone"] = () => ({ json: { ...DONE, id: "r-alone", scopeApprovedBy: null, scopeApprovedByName: null,
                                                              scopeApprovedAt: "2026-09-27T08:05:00+00:00" } });
  assert.equal((await call(set, "getReport", { reportId: "r-alone" })).scopeApprovedBy, "nobody — ran without the review");
  const page = await call(set, "getReport", { reportId: "r-chosen", status: "missing" });
  assert.equal("scopeApprovedBy" in page || "acts" in page, false, "a page of findings carries neither");
});


test("getReport: the status filter and the limit (default 10, 'more' counted)", async () => {
  const set = await toolSet();
  const missing = await call(set, "getReport", { reportId: "r1", status: "missing" });
  assert.deepEqual(missing.topFindings.map((f) => f.id), ["f-crit", "f-low"]);
  assert.equal(missing.moreFindings, 0);
  assert.deepEqual(missing.counts.findings, { met: 1, missing: 2, partial: 1, not_applicable: 1, unknown: 1 }, "counts stay whole");
  assert.deepEqual(Object.keys(missing), ["report", "counts", "matchingFindings", "topFindings", "moreFindings"],
                   "a question about findings gets findings — no summary, plan or audit again");
  const two = await call(set, "getReport", { reportId: "r1", limit: 2 });
  assert.deepEqual([two.topFindings.length, two.moreFindings], [2, 4]);
  assert.ok("summary" in two && "byAct" in two, "a limit alone is still the overview");
  const none = await call(set, "getReport", { reportId: "r1", status: "not_applicable", limit: 25 });
  assert.deepEqual(none.topFindings.map((f) => f.id), ["f-na"]);
});


test("getReport: severity and act narrow the findings, offset pages through them — every finding can be reached", async () => {
  const set = await toolSet();
  for (const input of [{ reportId: "r1", severity: "urgent" }, { reportId: "r1", act: "" }, { reportId: "r1", offset: -1 }, { reportId: "r1", offset: 1.5 }]) {
    assert.equal(await refuses(set, "getReport", input), true, JSON.stringify(input));
  }
  const high = await call(set, "getReport", { reportId: "r1", severity: "high" });
  assert.deepEqual(high.topFindings.map((f) => f.id), ["f-unk", "f-met"]);
  const mica = await call(set, "getReport", { reportId: "r1", act: " mica " });
  assert.deepEqual([mica.topFindings.map((f) => f.id), mica.matchingFindings], [["f-crit"], 1], "the act by its name, whatever the case");
  assert.deepEqual((await call(set, "getReport", { reportId: "r1", act: "DORA" })).topFindings, [], "an act the report lacks matches nothing");
  const both = await call(set, "getReport", { reportId: "r1", status: "missing", severity: "low" });
  assert.deepEqual(both.topFindings.map((f) => f.id), ["f-low"]);
  const pages = [];
  for (let offset = 0; offset < 6; offset += 2) {
    const page = await call(set, "getReport", { reportId: "r1", offset, limit: 2 });
    pages.push([page.topFindings.map((f) => f.id), page.moreFindings]);
  }
  assert.deepEqual(pages, [[["f-crit", "f-low"], 4], [["f-part", "f-unk"], 2], [["f-met", "f-na"], 0]]);
  const past = await call(set, "getReport", { reportId: "r1", offset: 50 });
  assert.deepEqual([past.topFindings, past.moreFindings, past.matchingFindings], [[], 0, 6]);
  assert.equal("byAct" in past || "actions" in past, false, "a later page carries the findings only");
  assert.deepEqual(past.counts.findings, { met: 1, missing: 2, partial: 1, not_applicable: 1, unknown: 1 }, "the counts stay whole whatever the page");
});


test("getReport: a report from before the citation audit has none; one without a plan lists none", async () => {
  stub.routes["GET /api/reports/r-old"] = () => ({ json: { ...DONE, id: "r-old", stats: { ...DONE.stats, citations: undefined }, citations: [], actions: [] } });
  const old = await call(await toolSet(), "getReport", { reportId: "r-old" });
  assert.equal(old.citationAudit, null);
  assert.deepEqual([old.actions, old.moreActions], [[], 0]);
});


test("getReport: a finding says how its obligation stood before, the overview what moved since the previous report — a first report says neither", async () => {
  // The same obligation in the company's four earlier reports,
  // the newest first, as register.history answers it
  const history = [{ reportId: "r-sep", date: "2026-09-01", status: "missing" }, { reportId: "r-jun", date: "2026-06-01", status: "partial" },
                   { reportId: "r-mar", date: "2026-03-01", status: "met" }, { reportId: "r-jan", date: "2026-01-10", status: "unknown" }];
  const changes = { since: "r-sep", sinceDate: "2026-09-01", closed: { count: 4, titles: ["Not for the model: what closed is only counted"] },
                    new: { count: 7, titles: ["Nauja 1", "N".repeat(180), "Nauja 3", "Nauja 4", "Nauja 5"] },
                    back: { count: 1, titles: ["Skundų nagrinėjimo tvarka"] } };
  stub.routes["GET /api/reports/r-again"] = () => ({ json: {
    ...DONE, id: "r-again", stats: { ...DONE.stats, changes },
    findings: DONE.findings.map((f) => ({ ...f, history: { "f-crit": history, "f-part": history.slice(2, 3) }[f.id] ?? [] })),
  } });
  const set = await toolSet();
  const report = await call(set, "getReport", { reportId: "r-again" });
  assert.deepEqual(report.sinceLastReport, {
    date: "2026-09-01", closed: 4, new: 7, back: 1, backTitles: ["Skundų nagrinėjimo tvarka"],
    newTitles: ["Nauja 1", `${"N".repeat(150)} …[truncated]`, "Nauja 3"],
  }, "the three counts, and the first three titles of what went back and what is new — the ones to act on");
  assert.deepEqual(Object.keys(report).slice(0, 5), ["report", "counts", "summary", "sinceLastReport", "byAct"], "on the overview, after the summary");
  const rows = Object.fromEntries(report.topFindings.map((f) => [f.id, f]));
  assert.equal(rows["f-crit"].before, "2026-09-01 missing; 2026-06-01 partial; 2026-03-01 met", "the latest three, the newest first, each with its date");
  assert.equal(rows["f-part"].before, "2026-03-01 met", "was met, is partly met now: the row says what it was");
  assert.deepEqual(["f-low", "f-met", "f-na", "f-unk"].map((id) => "before" in rows[id]), [false, false, false, false],
                   "an obligation no earlier report assessed has no key at all");
  assert.deepEqual(Object.keys(rows["f-crit"]), ["id", "act", "obligation", "status", "overridden", "severity", "before", "analysis", "recommendation",
                                                 "citations", "evidence", "deadline", "reviewerNote"], "beside today's verdict");
  const page = await call(set, "getReport", { reportId: "r-again", status: "missing" });
  assert.deepEqual(["sinceLastReport" in page, page.topFindings.map((f) => f.before ?? null)], [false, [rows["f-crit"].before, null]],
                   "a page of findings carries each finding's past, and the overview's block only on the overview");

  // Nothing moved since the previous report: said as zeros,
  // not left out; a count Django leaves out reads as unknown
  stub.routes["GET /api/reports/r-still"] = () => ({ json: { ...DONE, id: "r-still", stats: { ...DONE.stats, changes: {
    since: "r-sep", sinceDate: "2026-09-01", closed: { count: 0, titles: [] }, new: { count: 0, titles: [] }, back: { count: 0, titles: [] } } } } });
  assert.deepEqual((await call(set, "getReport", { reportId: "r-still" })).sinceLastReport,
                   { date: "2026-09-01", closed: 0, new: 0, back: 0, backTitles: [], newTitles: [] });
  stub.routes["GET /api/reports/r-thin"] = () => ({ json: { ...DONE, id: "r-thin", stats: { ...DONE.stats, changes: { sinceDate: "2026-09-01" } } } });
  assert.deepEqual((await call(set, "getReport", { reportId: "r-thin" })).sinceLastReport,
                   { date: "2026-09-01", closed: null, new: null, back: null, backTitles: [], newTitles: [] });

  // A company's first report has no earlier one to look back at
  const first = await call(set, "getReport", { reportId: "r1" });
  assert.deepEqual(["sinceLastReport" in first, first.topFindings.some((f) => "before" in f)], [false, false]);
  // The override's answer is the finding alone, without its history
  const overridden = await call(set, "overrideFinding", { reportId: "r1", findingId: "f-crit", status: "met", reason: "LB licence LB-1 shown" });
  assert.equal("before" in overridden.finding, false);
  assert.match(set.getReport.description, /before is how the same obligation stood in\s+earlier reports; sinceLastReport what moved — "back" means it was met and is a gap again/);
  assert.match((await set.getReport.inputSchema.jsonSchema).properties.offset.description,
               /With an offset or a filter \(status, severity, act\) the answer is the findings only, paged, most urgent first/);
  assert.ok(set.getReport.description.length <= 1_024, `within the bound of a tool description (${set.getReport.description.length})`);
  assertAsUser(stub.requests);
});


test("listReports: the user's reports, newest first as Django sends them — the way a report is found without asking for its id", async () => {
  const set = await toolSet();
  for (const input of [{ status: "open" }, { companyId: "" }, { limit: 5 }]) {
    assert.equal(await refuses(set, "listReports", input), true, JSON.stringify(input));
  }
  const all = await call(set, "listReports", {});
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].query], ["GET", "/api/reports", { scope: "own" }],
                   "unfiltered means the user's own companies: an administrator's chat does not list every user's reports");
  assert.equal(all.total, 1);
  assert.deepEqual(all.reports[0], {
    id: "r-old", companyId: "c1", companyName: "UAB Kripto", status: "done", jobStatus: "done", language: "lt", title: "Atitikties analizė",
    createdAt: "2026-09-27T08:00:00+00:00", finishedAt: "2026-09-27T09:00:00+00:00", progress: { step: "done", percent: 100, message: "Baigta" },
    error: null, url: "/reports/r-old", approved: false,
    counts: { acts: { applies: 3, uncertain: 1, not_applies: 2 }, actions: 2,
              findings: { met: 1, missing: 2, partial: 1, not_applicable: 1, unknown: 1 }, openBySeverity: { low: 1, critical: 1, medium: 1 } },
  });
  const busy = await call(set, "listReports", { companyId: "busy" });
  assert.deepEqual(stub.requests[1].query, { companyId: "busy" });
  assert.deepEqual(busy.reports.map((r) => [r.id, r.status]), [["r-old", "done"], ["r-live", "running"]]);
  const running = await call(set, "listReports", { companyId: "busy", status: "running" });
  assert.deepEqual(stub.requests[2].query, { companyId: "busy", status: "running" },
                   "the state is Django's to filter by: its list is cut at 200 reports, and a filter after the cut would miss the older ones");
  assert.deepEqual([running.reports.map((r) => r.id), running.total], [["r-live"], 1]);
  assert.deepEqual((await call(set, "listReports", { status: "failed" })), { reports: [], total: 0 });
  const waiting = await call(set, "listReports", { companyId: "waiting", status: "scope_review" });
  assert.deepEqual([waiting.reports.map((r) => [r.id, r.status]), waiting.total], [[["r-wait", "scope_review"]], 1],
                   "a report waiting for its scope is found by its state");
  assert.match(set.listReports.description, /scope_review — waiting for the user to approve its list of acts/);
  stub.routes["GET /api/reports"] = () => ({ json: { reports: Array.from({ length: 23 }, (_, i) => ({ ...QUEUED, id: `r${i}`, approvedAt: i ? null : "2026-09-28" })) } });
  const many = await call(set, "listReports", {});
  assert.deepEqual([many.reports.length, many.total, many.reports[0].approved, many.reports[1].approved], [20, 23, true, false]);
  assertAsUser(stub.requests);
});


test("cancelAnalysis: POST the cancel — of a report waiting for its scope too; Django's refusal of a finished report reaches the model", async () => {
  const set = await toolSet();
  assert.equal(await refuses(set, "cancelAnalysis", {}), true);
  const stopped = await call(set, "cancelAnalysis", { reportId: "r-running" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path], ["POST", "/api/reports/r-running/cancel"]);
  assert.deepEqual([stopped.cancelled, stopped.report.id, stopped.report.status, stopped.report.url], [true, "r-running", "cancelled", "/reports/r-running"]);
  await assert.rejects(call(set, "cancelAnalysis", { reportId: "r1" }),
                       { message: "[NOT_CANCELLABLE] cancelAnalysis failed (HTTP 409): The analysis is already done" });
  await assert.rejects(call(set, "cancelAnalysis", { reportId: "r-other-users" }), { code: "NOT_FOUND" });
  const sent = stub.requests.length;
  const dropped = await call(set, "cancelAnalysis", { reportId: "r-wait" });
  assert.deepEqual(stub.requests.slice(sent).map((r) => [r.method, r.path]), [["POST", "/api/reports/r-wait/cancel"]],
                   "a waiting report is stopped like a running one: its state is Django's to judge, nothing is checked here");
  assert.deepEqual([dropped.cancelled, dropped.report.id, dropped.report.status], [true, "r-wait", "cancelled"]);
  assert.match(set.cancelAnalysis.description, /waiting for its list of acts to be\s+approved \(scope_review\)/);
  assertAsUser(stub.requests);
});


test("overrideFinding: a verdict needs its reason; PATCH the verdict and the note; null clears", async () => {
  const set = await toolSet();
  for (const input of [{ reportId: "r1", findingId: "f-crit", status: "met", reason: "ok" },
                       { reportId: "r1", findingId: "f-crit", status: "done", reason: "because" }, { reportId: "r1", findingId: "f-crit", reason: "because" },
                       { reportId: "r1", findingId: "f-crit", status: "met", reason: "r".repeat(4_001) },
                       { reportId: "r1", findingId: "f-crit", status: "met", reason: "   \n " }]) {
    assert.equal(await refuses(set, "overrideFinding", input), true, JSON.stringify(input).slice(0, 80));
  }
  await assert.rejects(call(set, "overrideFinding", { reportId: "r1", findingId: "f-crit", status: "met" }),
                       { message: "[REASON_REQUIRED] overrideFinding failed: a verdict needs the user's reason" });
  assert.equal(stub.requests.length, 0, "no verdict without its reason reaches Django");
  const overridden = await call(set, "overrideFinding", { reportId: "r1", findingId: "f-crit", status: "met", reason: "LB licence LB-1 shown" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].body],
                   ["PATCH", "/api/reports/r1/findings/f-crit", { overrideStatus: "met", reviewerNote: "LB licence LB-1 shown" }]);
  assert.equal(overridden.finding.status, "met");
  assert.equal(overridden.finding.overridden, true);
  assert.equal(overridden.reportUrl, "/reports/r1");
  const cleared = await call(set, "overrideFinding", { reportId: "r1", findingId: "f-crit", status: null, reason: "Reviewer withdrew it" });
  assert.deepEqual(stub.requests[1].body, { overrideStatus: null, reviewerNote: "Reviewer withdrew it" });
  assert.equal(cleared.finding.overridden, false);
  assert.equal(cleared.finding.status, "missing", "the model's verdict is back");
  // Withdrawn without a word of why: the note the reviewer wrote is not sent, so it stays
  await call(set, "overrideFinding", { reportId: "r1", findingId: "f-crit", status: null });
  assert.deepEqual(stub.requests[2].body, { overrideStatus: null });
  await assert.rejects(call(set, "overrideFinding", { reportId: "r1", findingId: "f-nope", status: "met", reason: "x-y-z" }),
                       { message: "[NOT_FOUND] overrideFinding failed (HTTP 404): Finding not found" });
  assertAsUser(stub.requests);
});
