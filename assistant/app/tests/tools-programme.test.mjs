// -----------------------------------------------------------
//  [*] Tests — the programme tools (llm/tools/programme.js)
//
//  The two work-product tools against a Django stub that
//  answers as programme/api/views.py and its serializer do:
//  the company's list with the kinds, one product with its
//  content, the start and its 400 / 404 / 409 / 429 refusals.
//  A start is asked for one kind of one company and answers
//  where the draft will be; what Django refuses of it comes
//  back as a result the model can relay, never as a failure,
//  and a start refused as already running names the product
//  in generation. A product must be reachable without the
//  user: listed by company, read by kind, an earlier version
//  by the id the list names.
//
//  What the model reads is pinned whole, kind by kind, on
//  small hand-made products: provisions as one string with
//  their warning marks, quotes as document titles, the
//  structure as an outline, the matrix by role name, the
//  rules not kept in words. The three real products of
//  tests/fixtures/ — generated for the demo company and cut
//  down, every field kept — prove the size and that nothing
//  of the raw content leaks: no quote, no hash, no lookup.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { assertAsUser, call, refuses, startToolStub, toolSet } from "./helpers/toolKit.mjs";


// The kinds as the company's list names them
// (programme/kinds.py)
const KINDS = [
  { kind: "policy", title: { lt: "Atitikties politika", en: "Compliance policy" }, needs: [] },
  { kind: "governance", title: { lt: "Valdymo struktūra, atitikties procesas ir RACI", en: "Structure, compliance process and RACI" },
    needs: ["policy"] },
  { kind: "risks", title: { lt: "Teisinės atitikties rizikos vertinimo kriterijai ir registras",
                            en: "Legal compliance risk criteria and register" }, needs: ["policy", "governance"] },
];

// What every product row carries beside its kind's own fields
const ROW = {
  companyId: "c1", companyName: "UAB Kripto", language: "lt", error: null, jobId: "j1", createdBy: "u1",
  stats: { tokens: 162_067, costUsd: 0.54, provenance: { models: ["gateway:azure/gpt-6.1-sol"],
                                                         prompts: [{ slug: "programme.policy", version: 2, model: "gateway:azure/gpt-6.1-sol" }] } },
  createdAt: "2026-11-12T15:50:15+00:00", startedAt: "2026-11-12T15:50:16+00:00", finishedAt: "2026-11-12T15:56:21+00:00",
  editedByName: null, editedAt: null, approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: "",
  progress: {}, jobStatus: "done",
};

// The documents a product's basis records, as they stood
const DOCUMENTS = [
  { id: "d1", title: "F01 Valdymas", sha256: "a1".repeat(32) }, { id: "d2", title: "03 Personalas", sha256: "b2".repeat(32) },
  { id: "d3", title: "01 Prieigos tvarka", sha256: "c3".repeat(32) },
];

// A draft compliance policy as the single-product route
// answers it, small: two parts, a document on every level,
// four missing documents out of their order, one blocking
// rule broken and two notes
const POLICY = {
  ...ROW, id: "p-pol", kind: "policy", version: 2, status: "draft", title: "UAB Kripto atitikties politika",
  checks: [
    { rule: "parts", ok: true, detail: "", blocking: true },
    { rule: "provisions", ok: false, detail: "MiCA 199", blocking: true },
    { rule: "provisions_unverified", ok: false, detail: "Darbo kodeksas", blocking: false },
    { rule: "provision_subjects", ok: true, detail: "", blocking: false },
    { rule: "quotes", ok: false, detail: "F01 Valdymas", blocking: false },
    { rule: "hierarchy", ok: true, detail: "", blocking: false },
  ],
  basis: { reportId: "r1", products: {}, documents: DOCUMENTS.slice(0, 2) },
  content: {
    title: "UAB Kripto atitikties politika",
    parts: [
      { key: "purpose", heading: "Įvadas: tikslas, apimtis ir tinkamumas", text: "Pirma pastraipa.\n\nAntra pastraipa.", decisions: [],
        sources: [{ documentId: "d1", document: "F01 Valdymas", quote: "The management body bears ultimate responsibility.", start: 2300 },
                  { documentId: "d1", document: "F01 Valdymas", quote: "A second passage of the same document.", start: null },
                  { documentId: "d2", document: "03 Personalas", quote: "Employees report breaches.", start: 10 }],
        legalBasis: [provision("MiCA", "68", "4")] },
      { key: "mandate", heading: "Atitikties funkcijos įgaliojimai (mandatas)", text: "T".repeat(3_100),
        decisions: ["[Valdyba nusprendžia: kas skiria atitikties pareigūną]"], sources: [],
        legalBasis: [provision("MiCA", "199", "", { status: "not_found" }),
                     provision("Darbo kodeksas", "58", "1", { status: "act_not_in_corpus" }),
                     provision("DORA", "6", "4", { match: "mismatch" })] },
    ],
    hierarchy: [
      { documentId: "d0", document: "00 Profilis", level: 0, topic: "Veiklos aprašymas", note: "Not for the model" },
      { documentId: "d9", document: "Elgesio kodeksas", level: 1, topic: "Vertybės", note: "" },
      { documentId: "d1", document: "F01 Valdymas", level: 2, topic: "Valdymas", note: "" },
      { documentId: "d2", document: "03 Personalas", level: 2, topic: "Personalas", note: "" },
      { documentId: "d3", document: "01 Prieigos tvarka", level: 3, topic: "Prieiga", note: "" },
    ],
    missing: [
      { level: 3, title: "Mokymų planas", purpose: "P".repeat(250), supports: "processes", priority: "low", legalBasis: [],
        partlyCoveredBy: [{ documentId: "d2", document: "03 Personalas" }] },
      { level: 2, title: "Asmens duomenų apsaugos politika", purpose: "Nustato tvarkymo tikslus.", supports: "compliance", priority: "high",
        legalBasis: [provision("GDPR", "24", "2")], partlyCoveredBy: [] },
      { level: 3, title: "Pažeidimų tyrimo tvarka", purpose: "Nustato nešališką tyrimą.", supports: "consequences", priority: "medium",
        legalBasis: [], partlyCoveredBy: [] },
      { level: 3, title: "Rizikos vertinimo tvarka", purpose: "Nustato vertinimo periodiškumą.", supports: "processes", priority: "high",
        legalBasis: [provision("MiCA", "68", "4"), provision("DORA", "6", "")], partlyCoveredBy: [] },
    ],
  },
};

// A draft governance product: six nodes — a child listed
// before its parent, one proposed, a second root — three
// steps (one without an accountable role) and two positions
const GOVERNANCE = {
  ...ROW, id: "p-gov", kind: "governance", version: 1, status: "draft", title: "UAB Kripto valdymo struktūra",
  checks: [
    { rule: "structure", ok: true, detail: "", blocking: true },
    { rule: "raci_accountable", ok: false, detail: "Ataskaitos valdybai", blocking: true },
    { rule: "raci_everywhere", ok: false, detail: "Atitikties pareigūnas", blocking: false },
    { rule: "a_rule_of_tomorrow", ok: false, detail: "x", blocking: false },
  ],
  basis: { reportId: null, products: { policy: { id: "p-pol", version: 2, status: "draft" } }, documents: DOCUMENTS },
  content: {
    title: "UAB Kripto valdymo struktūra",
    positions: [
      { name: "Valdyba", unit: "", line: "governing", duties: "Tvirtina strategiją.",
        sources: [{ documentId: "d1", document: "F01 Valdymas", quote: "The management body approves the strategy.", start: 2300 },
                  { documentId: "d4", document: "08 Saugumas", quote: "Approved by the Management Board.", start: 5 }] },
      { name: "Sistemos administratorius", unit: "Technologijų padalinys", line: "first", duties: "D".repeat(320),
        sources: [{ documentId: "d3", document: "01 Prieigos tvarka", quote: "The system administrator grants access.", start: 40 }] },
    ],
    gaps: [{ role: "Vidaus audito funkcija", line: "third", why: "W".repeat(320) },
           { role: "Duomenų apsaugos pareigūnas", line: "second", why: "Nepaskirtas." }],
    structure: [
      { id: "n4", name: "Technologijų padalinys", kind: "unit", line: "first", parentId: "n2", proposed: false, note: "" },
      { id: "n1", name: "Valdyba", kind: "body", line: "governing", parentId: null, proposed: false, note: "Not for the model" },
      { id: "n2", name: "Generalinis direktorius", kind: "function", line: "first", parentId: "n1", proposed: false, note: "" },
      { id: "n3", name: "Atitikties pareigūnas", kind: "function", line: "second", parentId: "n1", proposed: false, note: "" },
      { id: "n5", name: "Vidaus auditas", kind: "function", line: "third", parentId: "n1", proposed: true, note: "" },
      { id: "n6", name: "Išorės teisininkai", kind: "unit", line: "external", parentId: null, proposed: false, note: "" },
    ],
    process: [
      { id: "s1", name: "Prievolių nustatymas", description: "S".repeat(260), frequency: "Nuolat; kas ketvirtį",
        basis: [{ source: "ISO 37301", ref: "4.5" }, { source: "LB gairės", ref: "53" }] },
      { id: "s2", name: "Ataskaitos valdybai", description: "Atitikties pareigūnas teikia ataskaitą valdybai.", frequency: "Kas ketvirtį",
        basis: [{ source: "ISO 37301", ref: "9.1.4" }] },
      { id: "s3", name: "Mokymai", description: "", frequency: "Kasmet", basis: [] },
    ],
    raci: [
      { stepId: "s1", roleId: "n3", value: "AR" }, { stepId: "s1", roleId: "n2", value: "I" }, { stepId: "s1", roleId: "n6", value: "C" },
      { stepId: "s1", roleId: "n4", value: "C" }, { stepId: "s2", roleId: "n3", value: "R" }, { stepId: "s2", roleId: "n2", value: "R" },
      { stepId: "s3", roleId: "n1", value: "A" }, { stepId: "s3", roleId: "n3", value: "R" }, { stepId: "s3", roleId: "n5", value: "I" },
      { stepId: "s3", roleId: "n2", value: "I" },
    ],
  },
};

// The level names of both criteria tables, as Django's
// programme/risks.py has them
const LIKELIHOOD = ["Labai mažai tikėtina", "Mažai tikėtina", "Vidutiniškai tikėtina", "Tikėtina", "Beveik neabejotina"];
const IMPACT = ["Nereikšmingas", "Mažas", "Vidutinis", "Didelis", "Katastrofinis"];

// A draft risk register: both tables, the five bands and two
// scenarios — one with a provision named for something else,
// one a person added an outside lawyer's view to
const RISKS = {
  ...ROW, id: "p-risk", kind: "risks", version: 1, status: "draft", title: "UAB Kripto teisinės rizikos registras",
  checks: [{ rule: "criteria", ok: true, detail: "", blocking: true },
           { rule: "provision_subjects", ok: false, detail: "MiCA 81 str. 4 d.", blocking: false }],
  basis: { reportId: "r1", products: { policy: { id: "p-pol-1", version: 1, status: "approved" },
                                       governance: { id: "p-gov", version: 1, status: "draft" } }, documents: DOCUMENTS },
  content: {
    title: "UAB Kripto teisinės rizikos registras",
    criteria: {
      likelihood: LIKELIHOOD.map((name, i) => ({ level: i + 1, name, control: `Kontrolė ${i + 1}`, clarity: `Aiškumas ${i + 1}`,
                                                 counterparty: `Kontrahentai ${i + 1}`, frequency: `Dažnumas ${i + 1}` })),
      impact: IMPACT.map((name, i) => ({ level: i + 1, name, financial: `Finansinis ${i + 1}`, regulatory: `Priežiūrinis ${i + 1}`,
                                         reputation: `Reputacija ${i + 1}`, reach: `Mastas ${i + 1}` })),
      calibration: "Kriterijai pritaikyti mažai bendrovei.",
    },
    appetite: [
      { band: "negligible", name: "Nereikšminga", from: 1, to: 3, responses: ["accept", "increase"], comment: "Not for the model",
        decision: "Padalinio vadovas" },
      { band: "tolerable", name: "Toleruotina", from: 4, to: 6, responses: ["accept", "mitigate"], comment: "", decision: "Padalinio vadovas" },
      { band: "medium", name: "Vidutinė", from: 8, to: 12, responses: ["mitigate", "transfer"], comment: "", decision: "Generalinis direktorius" },
      { band: "high", name: "Didelė", from: 15, to: 16, responses: ["mitigate", "avoid"], comment: "", decision: "Valdyba" },
      { band: "critical", name: "Kritinė", from: 20, to: 25, responses: ["avoid"], comment: "", decision: "Valdyba nedelsiant" },
    ],
    scenarios: [
      { id: "LR-01", area: "Pavedimų perdavimas", unit: "Operacijų padalinys",
        sentence: "Tikėtinas draudžiamo atlygio priėmimas, kylantis iš bendrojo paskatų leidimo, gali sukelti baudas, kurios paveiks teisę teikti paslaugas.",
        event: "draudžiamo atlygio priėmimas", source: "bendrojo paskatų leidimo", consequences: "baudas", objective: "teisę teikti paslaugas",
        categories: [2, 6], sourceType: 6, consequenceType: 2, objectiveType: 1,
        legalBasis: [provision("MiCA", "80", "2"), provision("MiCA", "81", "4", { match: "mismatch" })],
        policies: [{ documentId: "d5", document: "F04 Interesų konfliktai" }, { documentId: "d1", document: "F01 Valdymas" }],
        internalConclusion: "I".repeat(450), externalConclusion: "",
        likelihood: { control: 5, clarity: 1, counterparty: 3, frequency: 3, level: 3, why: "Not for the model" },
        impact: { financial: 2, regulatory: 3, reputation: 2, reach: 3, level: 3, why: "Not for the model" },
        score: 9, band: "medium", response: "mitigate", actions: ["Įtvirtinami draudimai.", "Patikrinami susitarimai."],
        owners: ["Operacijų vadovas", "Atitikties pareigūnas"], deadline: "2027 Q1" },
      { id: "LR-02", area: "Tiekėjų sutartys", unit: "Pirkimų funkcija",
        sentence: "Tikėtinas sutarties nutraukimo teisės neįgyvendinimas, kylantis iš neaiškių sąlygų, gali sukelti nuostolius, kurie paveiks tęstinumą.",
        event: "teisės neįgyvendinimas", source: "neaiškių sąlygų", consequences: "nuostolius", objective: "tęstinumą",
        categories: [5], sourceType: 2, consequenceType: 1, objectiveType: 4, legalBasis: [], policies: [],
        internalConclusion: "Trumpa išvada.", externalConclusion: "Išorės teisininko nuomonė: rizika valdoma.",
        likelihood: { control: 2, clarity: 2, counterparty: 2, frequency: 2, level: 2, why: "" },
        impact: { financial: 2, regulatory: 1, reputation: 1, reach: 1, level: 2, why: "" },
        score: 4, band: "tolerable", response: "accept", actions: [], owners: [], deadline: "" },
    ],
  },
};

// The three real products of the demo company, cut down
const REAL = Object.fromEntries(["policy", "governance", "risks"].map((kind) => [
  kind, JSON.parse(readFileSync(new URL(`./fixtures/product-${kind}.json`, import.meta.url), "utf8")),
]));

// Fields of the raw product and its content that no answer
// about a draft may carry (an approved one has its approval
// note, the only "note" there is)
const RAW_KEYS = ["quote", "sha256", "documentId", "start", "citationUrl", "stats", "checks", "content", "jobId", "createdBy", "roleId",
                  "description", "comment", "event", "consequences", "objective", "sourceType", "partlyCoveredBy", "supports", "note"];

// Every product the single-product route knows, by id
const PRODUCTS = {
  "p-pol": POLICY,
  "p-pol-1": { ...POLICY, id: "p-pol-1", version: 1, status: "approved", checks: POLICY.checks.map((check) => ({ ...check, ok: true, detail: "" })),
               approvedBy: "u1", approvedByName: "Rasa Rasaitė", approvedAt: "2026-11-10T09:00:00+00:00", approvalNote: "Valdybos posėdis Nr. 7" },
  "p-gov": GOVERNANCE,
  "p-gov-2": { ...GOVERNANCE, id: "p-gov-2", version: 2, status: "running", jobStatus: "running", checks: [], basis: {}, stats: {},
               finishedAt: null, content: {}, progress: { step: "process_raci", percent: 50, message: null } },
  "p-starting": { ...RISKS, id: "p-starting", version: 4, status: "running", jobStatus: "running", checks: [], basis: {}, stats: {},
                  finishedAt: null, content: {}, progress: { step: "documents", percent: 0, message: null } },
  "p-risk": RISKS,
  "p-risk-en": { ...RISKS, id: "p-risk-en", language: "en" },
  "p-risk-2": { ...RISKS, id: "p-risk-2", version: 2, status: "failed", jobStatus: "failed", checks: [], basis: {}, content: {},
                error: "E".repeat(400) },
  "p-queued": { ...POLICY, id: "p-queued", version: 3, status: "queued", jobStatus: "queued", checks: [], basis: {}, content: {}, finishedAt: null },
  "p-cancelled": { ...POLICY, id: "p-cancelled", version: 3, status: "cancelled", jobStatus: "cancelled", checks: [], basis: {}, content: {} },
  ...Object.fromEntries(Object.values(REAL).map((product) => [product.id, product])),
};

// The products of every company the list route knows, in
// Django's order: by kind, the newest version first
const COMPANIES = {
  c1: ["p-gov-2", "p-gov", "p-pol", "p-pol-1"],
  busy: ["p-gov-2", "p-gov", "p-pol", "p-pol-1"],
  c3: ["p-risk-2", "p-risk"],
  empty: [],
  real: [REAL.governance.id, REAL.policy.id, REAL.risks.id],
};

let stub;

// Products one test adds to the single-product route, by id
let extra;







// -----------------------------------------------------------
// provision
// -----------------------------------------------------------
//
// A looked-up provision as Library.provisions answers it,
// every field present: found, with its path and link, unless
// told that the act has no such article or the corpus no such
// act.
//
// Used by:
//   - POLICY, RISKS (above)
// -----------------------------------------------------------

function provision(act, article, paragraph, { status = "found", match = "match" } = {}) {
  const found = status === "found";
  return {
    act, article, paragraph, why: `Why ${act} ${article} was named — not for the model`, found, status, match: found ? match : null,
    shortTitle: act, path: found ? `${article} str.${paragraph ? ` ${paragraph} d.` : ""}` : "",
    citationUrl: found ? `https://eur-lex.europa.eu/#art_${article}` : "",
  };
}







// -----------------------------------------------------------
// listed
// -----------------------------------------------------------
//
// A product as the company's list carries it: everything but
// its content.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function listed(product) {
  const { content: _content, ...row } = product;
  return row;
}







// -----------------------------------------------------------
// keysOf
// -----------------------------------------------------------
//
// Every key an answer uses, at any depth.
//
// Used by:
//   - the leak tests (below)
// -----------------------------------------------------------

function keysOf(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      keysOf(item, found);
    }
  }
  return found;
}







// -----------------------------------------------------------
// startRoute
// -----------------------------------------------------------
//
// POST /api/companies/{id}/programme as Django answers it: the
// queued first version of the kind, titled by its kind in the
// language asked, or — by the company's id — one of the
// refusals of the contract, and a failure that is none of
// them.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function startRoute(body, _request, url) {
  const companyId = url.pathname.split("/").at(-2);
  const running = { status: 409, json: { error: "This product is already being generated", code: "ALREADY_RUNNING" } };
  const refusal = {
    nodocs: { status: 409, json: { error: "The company has no readable documents — upload them first", code: "NO_DOCUMENTS" } },
    busy: running,
    blind: running,
    broke: { status: 429, json: { error: "Today's AI usage budget is spent — try again tomorrow", code: "BUDGET_EXCEEDED" } },
    odd: { status: 400, json: { error: "kind must be one of policy, governance, risks", code: "INVALID_FIELD" } },
    gone: { status: 404, json: { error: "Company not found", code: "NOT_FOUND" } },
    down: { status: 503, json: { error: "Django is restarting", code: "SERVER_ERROR" } },
  }[companyId];
  if (refusal) return refusal;
  return { status: 201, json: {
    ...ROW, id: "p-new", companyId, kind: body.kind, version: 1, language: body.language, status: "queued", jobStatus: "queued",
    title: KINDS.find((row) => row.kind === body.kind).title[body.language], checks: [], basis: {}, stats: {}, jobId: "j9",
    startedAt: null, finishedAt: null,
  } };
}


before(async () => {
  stub = await startToolStub();
});

beforeEach(() => {
  extra = {};
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, {
    "POST /api/companies/[^/]+/programme": startRoute,
    "GET /api/companies/[^/]+/programme": (_b, _r, url) => {
      const companyId = url.pathname.split("/").at(-2);
      if (companyId === "blind") return { status: 503, json: { error: "Django is restarting", code: "SERVER_ERROR" } };
      if (!COMPANIES[companyId]) return { status: 404, json: { error: "Company not found", code: "NOT_FOUND" } };
      return { json: { products: COMPANIES[companyId].map((id) => listed(PRODUCTS[id])), kinds: KINDS } };
    },
    "GET /api/programme/[^/]+": (_b, _r, url) => {
      const id = url.pathname.split("/").at(-1);
      const product = extra[id] ?? PRODUCTS[id];
      return product ? { json: product } : { status: 404, json: { error: "Product not found", code: "NOT_FOUND" } };
    },
  });
});

after(async () => { await stub.close(); });


test("startWorkProduct: POST the kind for the company, in the turn's language unless told; where the draft will be", async () => {
  const set = await toolSet({ language: "en" });
  for (const input of [{}, { companyId: "c1" }, { kind: "policy" }, { companyId: "c1", kind: "register" }, { companyId: "c1", kind: null },
                       { companyId: "c1", kind: "policy", language: "de" }, { companyId: "c1", kind: "policy", language: null },
                       { companyId: "c1", kind: "policy", confirmed: true }]) {
    assert.equal(await refuses(set, "startWorkProduct", input), true, JSON.stringify(input));
  }
  assert.equal(stub.requests.length, 0, "a refused input reaches nothing");
  const started = await call(set, "startWorkProduct", { companyId: "c1", kind: "governance" });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.body]),
                   [["POST", "/api/companies/c1/programme", { kind: "governance", language: "en" }]]);
  const { next, ...card } = started;
  assert.deepEqual(card, {
    started: true, product: { id: "p-new", kind: "governance", title: "Structure, compliance process and RACI", version: 1, status: "queued" },
    takesMinutes: "4-6", url: "/programme/p-new",
  });
  assert.match(next, /tell the user.+in the background.+a few minutes.+Programme tab.+getWorkProduct/, "what to tell the user, and how to read it");
  assert.ok(!next.includes("\n") && next.length < 300, "one line");
  await call(set, "startWorkProduct", { companyId: "c 1/x", kind: "risks", language: "lt" });
  assert.deepEqual([stub.requests.at(-1).path, stub.requests.at(-1).body], ["/api/companies/c%201%2Fx/programme", { kind: "risks", language: "lt" }],
                   "the language named wins; the id is encoded into its segment");
  assert.equal((await (await toolSet()).startWorkProduct.execute({ companyId: "c1", kind: "policy" }, {})).product.title, "Atitikties politika",
               "Lithuanian by default");
  assertAsUser(stub.requests);
});


test("startWorkProduct: whatever Django refuses is a result the model can relay — never thrown, with what to do next", async () => {
  const calls = [];
  const set = await toolSet({ calls });
  const refused = async (companyId) => call(set, "startWorkProduct", { companyId, kind: "policy" });
  const { next: upload, ...nodocs } = await refused("nodocs");
  assert.deepEqual(nodocs, { started: false, refused: "NO_DOCUMENTS", reason: "The company has no readable documents — upload them first" });
  assert.match(upload, /^nothing was started: .+ask the user to upload them/);
  const { next: tomorrow, ...broke } = await refused("broke");
  assert.deepEqual(broke, { started: false, refused: "BUDGET_EXCEEDED", reason: "Today's AI usage budget is spent — try again tomorrow" });
  assert.match(tomorrow, /^nothing was started: .+budget for today is spent.+tomorrow/);
  const { next: correct, ...odd } = await refused("odd");
  assert.deepEqual(odd, { started: false, refused: "INVALID_FIELD", reason: "kind must be one of policy, governance, risks" });
  assert.match(correct, /^nothing was started: .+correct the call/);
  const { next: find, ...gone } = await refused("gone");
  assert.deepEqual(gone, { started: false, refused: "NOT_FOUND", reason: "Company not found" });
  assert.match(find, /^nothing was started: .+company context or listCompanies/);
  for (const next of [upload, tomorrow, correct, find]) assert.ok(!next.includes("\n") && next.length < 300, "one line");
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["nodocs", "broke", "odd", "gone"].map((c) => `POST /api/companies/${c}/programme`),
                   "one request each: a refusal is not retried");
  assert.deepEqual(calls.map((c) => [c.name, c.ok]), Array(4).fill(["startWorkProduct", true]), "a relayed refusal is an answered call");

  await assert.rejects(refused("down"), { message: "[SERVER_ERROR] startWorkProduct failed (HTTP 503): Django is restarting" },
                       "a failure that is no refusal of the contract fails like any tool call");
  assert.deepEqual([calls.at(-1).ok, calls.at(-1).code], [false, "SERVER_ERROR"]);
  assertAsUser(stub.requests);
});


test("startWorkProduct: a start refused as already running names the product in generation and points to getWorkProduct", async () => {
  const set = await toolSet();
  const { next, ...busy } = await call(set, "startWorkProduct", { companyId: "busy", kind: "governance" });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["POST /api/companies/busy/programme", "GET /api/companies/busy/programme"]);
  assert.deepEqual(busy, {
    started: false, refused: "ALREADY_RUNNING", reason: "This product is already being generated", alreadyRunning: true,
    product: { id: "p-gov-2", kind: "governance", title: "UAB Kripto valdymo struktūra", version: 2, status: "running" },
    url: "/programme/p-gov-2",
  });
  assert.match(next, /^nothing was started: one is already being generated.+getWorkProduct; do not start another$/);

  // The refusal stands when the list no longer holds a
  // product in generation, or cannot be read at all
  const raced = await call(set, "startWorkProduct", { companyId: "busy", kind: "policy" });
  assert.deepEqual([raced.started, raced.alreadyRunning, raced.product, "url" in raced], [false, true, null, false]);
  const blind = await call(set, "startWorkProduct", { companyId: "blind", kind: "policy" });
  assert.deepEqual([blind.started, blind.refused, blind.product], [false, "ALREADY_RUNNING", null], "the list's own failure does not replace it");
  assertAsUser(stub.requests);
});


test("getWorkProduct: the schema — a company or a product, a kind and a section of those there are", async () => {
  const set = await toolSet();
  for (const input of [{}, { kind: "policy" }, { section: "criteria" }, { companyId: "" }, { companyId: "c1", kind: "register" },
                       { companyId: "c1", section: "raci" }, { companyId: "c1", kind: null }, { productId: "p-pol", version: 2 },
                       { companyId: "c1", productId: "x".repeat(101) }]) {
    assert.equal(await refuses(set, "getWorkProduct", input), true, JSON.stringify(input).slice(0, 80));
  }
  const neither = await set.getWorkProduct.inputSchema.validate({ kind: "policy" });
  assert.match(neither.error.message, /pass companyId \(from the company context\) or a productId/, "and the model is told what is missing");
  for (const input of [{ companyId: "c1" }, { productId: "p-pol" }, { companyId: "c1", kind: "risks", section: "criteria" },
                       { companyId: "c1", productId: "p-pol", kind: "policy", section: "positions" }]) {
    assert.equal(await refuses(set, "getWorkProduct", input), false, JSON.stringify(input));
  }
  assert.equal(stub.requests.length, 0);
});


test("getWorkProduct: the company alone — the newest version of every kind or that there is none, older versions counted and named", async () => {
  const set = await toolSet();
  const list = await call(set, "getWorkProduct", { companyId: "c1" });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.query]), [["GET", "/api/companies/c1/programme", {}]]);
  assert.deepEqual(list, {
    products: [
      { kind: "policy", title: "UAB Kripto atitikties politika", id: "p-pol", version: 2, status: "draft", approvedByName: null, approvedAt: null,
        brokenRules: 1, notes: 2, url: "/programme/p-pol", earlierVersions: [{ id: "p-pol-1", version: 1, status: "approved" }] },
      { kind: "governance", title: "UAB Kripto valdymo struktūra", id: "p-gov-2", version: 2, status: "running", approvedByName: null,
        approvedAt: null, brokenRules: 0, notes: 0, progress: { step: "process_raci", percent: 50 }, url: "/programme/p-gov-2",
        earlierVersions: [{ id: "p-gov", version: 1, status: "draft" }] },
      { kind: "risks", title: "Teisinės atitikties rizikos vertinimo kriterijai ir registras", status: "none", buildsOn: ["policy", "governance"] },
    ],
    olderVersions: 2,
  }, "the kinds in the order each builds on the last, whatever order Django lists the rows in");

  const failed = await call(set, "getWorkProduct", { companyId: "c3" });
  assert.deepEqual(failed.products[2], {
    kind: "risks", title: "UAB Kripto teisinės rizikos registras", id: "p-risk-2", version: 2, status: "failed", approvedByName: null,
    approvedAt: null, brokenRules: 0, notes: 0, error: `${"E".repeat(200)} …[truncated]`, url: "/programme/p-risk-2",
    earlierVersions: [{ id: "p-risk", version: 1, status: "draft" }],
  }, "a failed generation says why, and the draft before it stays reachable");

  const nothing = await call(await toolSet({ language: "en" }), "getWorkProduct", { companyId: "empty" });
  assert.deepEqual(nothing, {
    products: [
      { kind: "policy", title: "Compliance policy", status: "none", buildsOn: [] },
      { kind: "governance", title: "Structure, compliance process and RACI", status: "none", buildsOn: ["policy"] },
      { kind: "risks", title: "Legal compliance risk criteria and register", status: "none", buildsOn: ["policy", "governance"] },
    ],
    olderVersions: 0,
  }, "a kind without a product is named in the turn's language");
  await assert.rejects(call(set, "getWorkProduct", { companyId: "gone" }), { code: "NOT_FOUND" });
  stub.routes["GET /api/companies/[^/]+/programme"] = () => ({ json: { products: [{ ...listed(POLICY), approvedByName: "Rasa Rasaitė",
                                                                                   approvedAt: "2026-11-12T16:00:00+00:00", status: "approved" }] } });
  const bare = await call(set, "getWorkProduct", { companyId: "c1" });
  assert.deepEqual(bare.products.map((p) => [p.kind, p.status, p.title]), [["policy", "approved", "UAB Kripto atitikties politika"],
                                                                         ["governance", "none", null], ["risks", "none", null]],
                   "an answer without the kinds falls back to the kinds known here");
  assert.deepEqual([bare.products[0].approvedByName, bare.products[0].approvedAt], ["Rasa Rasaitė", "2026-11-12T16:00:00+00:00"]);
  assertAsUser(stub.requests);
});


test("getWorkProduct: a compliance policy — the parts whole, provisions as one string with their marks, quotes as titles, the gaps by priority", async () => {
  const set = await toolSet();
  const policy = await call(set, "getWorkProduct", { productId: "p-pol" });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path]), [["GET", "/api/programme/p-pol"]]);
  assert.deepEqual(policy, {
    id: "p-pol", kind: "policy", title: "UAB Kripto atitikties politika", version: 2, status: "draft", language: "lt", approved: null,
    url: "/programme/p-pol",
    exports: [{ format: "pdf", url: "/api/programme/p-pol/export?format=pdf" }, { format: "docx", url: "/api/programme/p-pol/export?format=docx" }],
    rules: {
      broken: [{ rule: "The articles named are in their acts", detail: "MiCA 199" }],
      notes: [{ rule: "The acts named are in the legal corpus", detail: "Darbo kodeksas" },
              { rule: "The quotes stand in the documents they name", detail: "F01 Valdymas" }],
    },
    builtOn: { report: true, documents: 2, products: [] },
    parts: [
      { key: "purpose", heading: "Įvadas: tikslas, apimtis ir tinkamumas", text: "Pirma pastraipa.\n\nAntra pastraipa.", decisions: [],
        legalBasis: ["MiCA 68 str. 4 d."], sources: ["F01 Valdymas", "03 Personalas"] },
      { key: "mandate", heading: "Atitikties funkcijos įgaliojimai (mandatas)", text: `${"T".repeat(3_000)} …[truncated]`,
        decisions: ["[Valdyba nusprendžia: kas skiria atitikties pareigūną]"],
        legalBasis: ["MiCA art. 199 (not found)", "Darbo kodeksas art. 58(1) (act not in corpus)", "DORA 6 str. 4 d. (subject mismatch)"],
        sources: [] },
    ],
    documents: { level1: ["Elgesio kodeksas"], level2: ["F01 Valdymas", "03 Personalas"], level3: ["01 Prieigos tvarka"], notRules: ["00 Profilis"] },
    missing: [
      { level: 2, title: "Asmens duomenų apsaugos politika", priority: "high", purpose: "Nustato tvarkymo tikslus.", legalBasis: ["GDPR 24 str. 2 d."] },
      { level: 3, title: "Rizikos vertinimo tvarka", priority: "high", purpose: "Nustato vertinimo periodiškumą.",
        legalBasis: ["MiCA 68 str. 4 d.", "DORA 6 str."] },
      { level: 3, title: "Pažeidimų tyrimo tvarka", priority: "medium", purpose: "Nustato nešališką tyrimą.", legalBasis: [] },
      { level: 3, title: "Mokymų planas", priority: "low", purpose: `${"P".repeat(240)} …[truncated]`, legalBasis: [] },
    ],
  }, "a part's text whole up to 3 000 characters; a document named once however many quotes it gave");

  const approved = await call(set, "getWorkProduct", { productId: "p-pol-1" });
  assert.deepEqual(approved.approved, { by: "Rasa Rasaitė", at: "2026-11-10T09:00:00+00:00", note: "Valdybos posėdis Nr. 7" });
  assert.deepEqual([approved.status, approved.rules], ["approved", { broken: [], notes: [] }]);
  assert.deepEqual(await call(set, "getWorkProduct", { productId: "p-pol", section: "criteria" }), policy, "a section of another kind is ignored");
  assertAsUser(stub.requests);
});


test("getWorkProduct: a governance product — the structure as an outline, the process with its matrix by role name; the positions on request", async () => {
  const set = await toolSet();
  const governance = await call(set, "getWorkProduct", { productId: "p-gov" });
  assert.deepEqual(governance, {
    id: "p-gov", kind: "governance", title: "UAB Kripto valdymo struktūra", version: 1, status: "draft", language: "lt", approved: null,
    url: "/programme/p-gov", exports: [{ format: "pdf", url: "/api/programme/p-gov/export?format=pdf" }],
    rules: {
      broken: [{ rule: "Every step has exactly one accountable role (A)", detail: "Ataskaitos valdybai" }],
      notes: [{ rule: "No role takes part in every step", detail: "Atitikties pareigūnas" }, { rule: "a_rule_of_tomorrow", detail: "x" }],
    },
    builtOn: { report: false, documents: 3, products: [{ kind: "policy", version: 2, status: "draft" }] },
    gaps: [{ role: "Vidaus audito funkcija", line: "third", why: `${"W".repeat(300)} …[truncated]` },
           { role: "Duomenų apsaugos pareigūnas", line: "second", why: "Nepaskirtas." }],
    structure: [
      "Valdyba — governing",
      "  Generalinis direktorius — first",
      "    Technologijų padalinys — first",
      "  Atitikties pareigūnas — second",
      "  Vidaus auditas — third (proposed)",
      "Išorės teisininkai — external",
    ],
    process: [
      { step: 1, name: "Prievolių nustatymas", what: `${"S".repeat(240)} …[truncated]`, frequency: "Nuolat; kas ketvirtį",
        basis: ["ISO 37301 4.5", "LB gairės 53"],
        raci: "A: Atitikties pareigūnas; R: Atitikties pareigūnas; C: Išorės teisininkai, Technologijų padalinys; I: Generalinis direktorius" },
      { step: 2, name: "Ataskaitos valdybai", what: "Atitikties pareigūnas teikia ataskaitą valdybai.", frequency: "Kas ketvirtį",
        basis: ["ISO 37301 9.1.4"],
        raci: "A: —; R: Atitikties pareigūnas, Generalinis direktorius" },
      { step: 3, name: "Mokymai", what: "", frequency: "Kasmet", basis: [],
        raci: "A: Valdyba; R: Atitikties pareigūnas; I: Vidaus auditas, Generalinis direktorius" },
    ],
    positionsFound: 2,
  }, "a child stands under its parent wherever the list had it; what a step consists of is cut at 240 characters; AR is both letters; "
     + "a step without an accountable role shows the dash");

  const positions = await call(set, "getWorkProduct", { productId: "p-gov", section: "positions" });
  assert.deepEqual(positions, {
    id: "p-gov", kind: "governance", title: "UAB Kripto valdymo struktūra", version: 1, status: "draft", url: "/programme/p-gov",
    positions: [
      { name: "Valdyba", unit: null, line: "governing", duties: "Tvirtina strategiją.", sources: ["F01 Valdymas", "08 Saugumas"] },
      { name: "Sistemos administratorius", unit: "Technologijų padalinys", line: "first", duties: `${"D".repeat(300)} …[truncated]`,
        sources: ["01 Prieigos tvarka"] },
    ],
  }, "the positions alone, under the product's identity");

  // A circle Django would have cut hides no node
  extra["p-loop"] = { ...GOVERNANCE, id: "p-loop", content: { structure: [
    { id: "a", name: "A", line: "first", parentId: "b", proposed: false }, { id: "b", name: "B", line: "first", parentId: "a", proposed: false },
    { id: "c", name: "C", line: "governing", parentId: "nowhere", proposed: false }] } };
  const loop = await call(set, "getWorkProduct", { productId: "p-loop" });
  assert.deepEqual(loop.structure, ["C — governing", "A — first", "  B — first"], "a parent that is no node makes a root");
  assert.deepEqual([loop.gaps, loop.process, loop.positionsFound], [[], [], 0], "content without its lists reads as empty ones");
  assertAsUser(stub.requests);
});


test("getWorkProduct: a risk register — bands, scenarios with the types by name in the product's language; the criteria on request only", async () => {
  const set = await toolSet();
  const risks = await call(set, "getWorkProduct", { productId: "p-risk" });
  assert.deepEqual(risks, {
    id: "p-risk", kind: "risks", title: "UAB Kripto teisinės rizikos registras", version: 1, status: "draft", language: "lt", approved: null,
    url: "/programme/p-risk",
    exports: [{ format: "pdf", url: "/api/programme/p-risk/export?format=pdf" }, { format: "xlsx", url: "/api/programme/p-risk/export?format=xlsx" }],
    rules: { broken: [], notes: [{ rule: "The provisions named regulate what they are named for", detail: "MiCA 81 str. 4 d." }] },
    builtOn: { report: true, documents: 3, products: [{ kind: "policy", version: 1, status: "approved" },
                                                      { kind: "governance", version: 1, status: "draft" }] },
    calibration: "Kriterijai pritaikyti mažai bendrovei.",
    appetite: [
      { band: "negligible", name: "Nereikšminga", range: "1–3", responses: ["accept", "increase"], decision: "Padalinio vadovas" },
      { band: "tolerable", name: "Toleruotina", range: "4–6", responses: ["accept", "mitigate"], decision: "Padalinio vadovas" },
      { band: "medium", name: "Vidutinė", range: "8–12", responses: ["mitigate", "transfer"], decision: "Generalinis direktorius" },
      { band: "high", name: "Didelė", range: "15–16", responses: ["mitigate", "avoid"], decision: "Valdyba" },
      { band: "critical", name: "Kritinė", range: "20–25", responses: ["avoid"], decision: "Valdyba nedelsiant" },
    ],
    scenarios: [
      { id: "LR-01", area: "Pavedimų perdavimas", unit: "Operacijų padalinys",
        sentence: "Tikėtinas draudžiamo atlygio priėmimas, kylantis iš bendrojo paskatų leidimo, gali sukelti baudas, kurios paveiks teisę teikti paslaugas.",
        types: ["2 Taikytinų teisės aktų nesilaikymas", "6 Netinkamas pasirinkimas"], likelihood: 3, impact: 3, score: 9, band: "medium",
        response: "mitigate", actions: ["Įtvirtinami draudimai.", "Patikrinami susitarimai."], owners: ["Operacijų vadovas", "Atitikties pareigūnas"],
        deadline: "2027 Q1", legalBasis: ["MiCA 80 str. 2 d.", "MiCA 81 str. 4 d. (subject mismatch)"],
        policies: ["F04 Interesų konfliktai", "F01 Valdymas"], internalConclusion: `${"I".repeat(400)} …[truncated]` },
      { id: "LR-02", area: "Tiekėjų sutartys", unit: "Pirkimų funkcija",
        sentence: "Tikėtinas sutarties nutraukimo teisės neįgyvendinimas, kylantis iš neaiškių sąlygų, gali sukelti nuostolius, kurie paveiks tęstinumą.",
        types: ["5 Neveikimas įgyvendinant teises"], likelihood: 2, impact: 2, score: 4, band: "tolerable", response: "accept", actions: [],
        owners: [], deadline: "", legalBasis: [], policies: [], internalConclusion: "Trumpa išvada.",
        externalConclusion: "Išorės teisininko nuomonė: rizika valdoma." },
    ],
  }, "the levels as numbers, not their eight dimensions; an outside lawyer's view only once a person wrote one");
  assert.equal("criteria" in risks, false, "the tables are large: on request only");

  const criteria = await call(set, "getWorkProduct", { productId: "p-risk", section: "criteria" });
  assert.deepEqual(criteria, {
    id: "p-risk", kind: "risks", title: "UAB Kripto teisinės rizikos registras", version: 1, status: "draft", url: "/programme/p-risk",
    criteria: { calibration: "Kriterijai pritaikyti mažai bendrovei.", likelihood: RISKS.content.criteria.likelihood,
                impact: RISKS.content.criteria.impact },
  }, "the two tables of five levels on four dimensions and how they were fitted — nothing else");
  assert.deepEqual(await call(set, "getWorkProduct", { productId: "p-risk", section: "positions" }), risks, "a section of another kind is ignored");
  const english = await call(set, "getWorkProduct", { productId: "p-risk-en" });
  assert.deepEqual(english.scenarios.map((s) => s.types), [["2 Non-compliance with applicable laws", "6 Improper choice"],
                                                          ["5 Omission in exercising rights"]]);
  assertAsUser(stub.requests);
});


test("getWorkProduct: a section names its kind — with the company alone it reads the newest product of that kind", async () => {
  const set = await toolSet();
  const criteria = await call(set, "getWorkProduct", { companyId: "real", section: "criteria" });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["GET /api/companies/real/programme", `GET /api/programme/${REAL.risks.id}`]);
  assert.deepEqual([criteria.kind, "criteria" in criteria, "products" in criteria], ["risks", true, false], "not the list of every kind");
  assert.deepEqual(criteria, await call(set, "getWorkProduct", { companyId: "real", kind: "risks", section: "criteria" }), "the same read as with the kind named");
  const positions = await call(set, "getWorkProduct", { companyId: "real", section: "positions" });
  assert.deepEqual([positions.kind, "positions" in positions], ["governance", true]);
  const none = await call(set, "getWorkProduct", { companyId: "c1", section: "criteria" });
  assert.deepEqual([none.kind, none.status], ["risks", "none"], "a kind not generated yet says so");
  assertAsUser(stub.requests);
});


test("getWorkProduct: found by kind — the list, then the newest version; the earlier ones named beside it", async () => {
  const set = await toolSet();
  const policy = await call(set, "getWorkProduct", { companyId: "c1", kind: "policy" });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["GET /api/companies/c1/programme", "GET /api/programme/p-pol"]);
  const { earlierVersions, ...read } = policy;
  assert.deepEqual(read, await call(set, "getWorkProduct", { productId: "p-pol" }), "the same read as by its id");
  assert.deepEqual(earlierVersions, [{ id: "p-pol-1", version: 1, status: "approved" }], "the approved version behind a newer draft is one call away");

  const unread = await call(set, "getWorkProduct", { companyId: "c3", kind: "risks", section: "criteria" });
  assert.deepEqual([unread.status, "criteria" in unread], ["failed", false], "a section asked of a product without content changes nothing");
  const none = await call(set, "getWorkProduct", { companyId: "c1", kind: "risks" });
  assert.deepEqual(none, { kind: "risks", title: "Teisinės atitikties rizikos vertinimo kriterijai ir registras", status: "none",
                           buildsOn: ["policy", "governance"],
                           next: "not generated yet — offer to generate it with startWorkProduct if the user wants it" });
  stub.requests.length = 0;
  const byId = await call(set, "getWorkProduct", { companyId: "c1", kind: "governance", productId: "p-pol-1" });
  assert.deepEqual([stub.requests.map((r) => r.path), byId.id, "earlierVersions" in byId], [["/api/programme/p-pol-1"], "p-pol-1", false],
                   "a product id is read as it is: no list, whatever kind was named beside it");
  await assert.rejects(call(set, "getWorkProduct", { companyId: "gone", kind: "policy" }),
                       { message: "[NOT_FOUND] getWorkProduct failed (HTTP 404): Company not found" });
  await assert.rejects(call(set, "getWorkProduct", { productId: "p-other-users" }),
                       { message: "[NOT_FOUND] getWorkProduct failed (HTTP 404): Product not found" });
  await assert.rejects(call(set, "getWorkProduct", { productId: ".." }), { code: "INVALID_ID" });
  assertAsUser(stub.requests);
});


test("getWorkProduct: a product being generated has no content yet; a failed one says why, a stopped one that nothing is there", async () => {
  const calls = [];
  const set = await toolSet({ calls });
  const running = await call(set, "getWorkProduct", { companyId: "c1", kind: "governance" });
  assert.deepEqual(stub.requests.map((r) => r.path), ["/api/companies/c1/programme"], "the list row says all there is: no second request");
  assert.deepEqual(running, {
    id: "p-gov-2", kind: "governance", title: "UAB Kripto valdymo struktūra", version: 2, status: "running",
    progress: { step: "process_raci", percent: 50 }, next: "still being generated — check again in a minute or two", url: "/programme/p-gov-2",
    earlierVersions: [{ id: "p-gov", version: 1, status: "draft" }],
  });
  const { earlierVersions: _earlier, ...alone } = running;
  assert.deepEqual(await call(set, "getWorkProduct", { productId: "p-gov-2", section: "positions" }), alone,
                   "the same by its id, whatever section was asked — without the list, no earlier versions");
  const starting = await call(set, "getWorkProduct", { productId: "p-starting" });
  assert.deepEqual([starting.status, starting.progress], ["running", { step: "documents", percent: 0 }],
                   "the job's first report: a percentage of zero is a percentage");
  const queued = await call(set, "getWorkProduct", { productId: "p-queued" });
  assert.deepEqual(queued, { id: "p-queued", kind: "policy", title: "UAB Kripto atitikties politika", version: 3, status: "queued", progress: null,
                             next: "still being generated — check again in a minute or two", url: "/programme/p-queued" },
                   "a job that has reported nothing yet has no progress");

  const { next: afterFailure, ...failed } = await call(set, "getWorkProduct", { companyId: "c3", kind: "risks" });
  assert.deepEqual(failed, { id: "p-risk-2", kind: "risks", title: "UAB Kripto teisinės rizikos registras", version: 2, status: "failed",
                             error: `${"E".repeat(300)} …[truncated]`, url: "/programme/p-risk-2",
                             earlierVersions: [{ id: "p-risk", version: 1, status: "draft" }] });
  assert.match(afterFailure, /failed.+tell the user why.+only if they ask/);
  const { next: afterStop, ...cancelled } = await call(set, "getWorkProduct", { productId: "p-cancelled" });
  assert.deepEqual(cancelled, { id: "p-cancelled", kind: "policy", title: "UAB Kripto atitikties politika", version: 3, status: "cancelled",
                                url: "/programme/p-cancelled" });
  assert.match(afterStop, /stopped.+nothing to read/);
  assert.ok(calls.every((c) => c.name === "getWorkProduct" && c.ok));
  assertAsUser(stub.requests);
});


test("getWorkProduct: three real products stay small and carry nothing of the raw content — no quote, no hash, no lookup", async () => {
  const set = await toolSet();
  const sizes = {};
  for (const kind of ["policy", "governance", "risks"]) {
    const raw = REAL[kind];
    const result = await call(set, "getWorkProduct", { companyId: "real", kind });
    const text = JSON.stringify(result);
    sizes[kind] = [Buffer.byteLength(JSON.stringify(raw)), Buffer.byteLength(text)];
    assert.ok(sizes[kind][1] < 14_000, `${kind}: ${sizes[kind][1]} bytes of ${sizes[kind][0]}`);
    assert.deepEqual([result.id, result.kind, result.status, result.url], [raw.id, kind, "draft", `/programme/${raw.id}`]);
    assert.deepEqual(RAW_KEYS.filter((key) => keysOf(result).has(key)), [], `${kind}: a key of the raw product`);
    const quotes = [...(raw.content.parts ?? []), ...(raw.content.positions ?? [])].flatMap((row) => row.sources.map((source) => source.quote));
    const lookups = [...(raw.content.parts ?? []), ...(raw.content.missing ?? []), ...(raw.content.scenarios ?? [])].flatMap((row) => row.legalBasis);
    assert.ok(kind === "risks" || quotes.length > 4, `${kind}: the fixture has quotes to leak`);
    assert.ok(kind === "governance" || lookups.length > 5, `${kind}: the fixture has lookups to leak`);
    for (const quote of quotes) assert.ok(!text.includes(quote.slice(0, 50)), `${kind}: a quote`);
    for (const lookup of lookups) assert.ok(lookup.why && !text.includes(lookup.why), `${kind}: a lookup's reason`);
    assert.ok(!text.includes("eur-lex"), `${kind}: a lookup's link`);
    assert.ok(!text.includes("/console"), `${kind}: the links are the router's, without the console's base`);
    for (const document of raw.basis.documents) assert.ok(!text.includes(document.sha256) && !text.includes(document.id), `${kind}: a hash or an id`);
  }

  const policy = await call(set, "getWorkProduct", { productId: REAL.policy.id });
  assert.deepEqual(policy.parts.map((part) => [part.key, part.text, part.decisions.length]),
                   REAL.policy.content.parts.map((part) => [part.key, part.text, part.decisions.length]), "the parts' text whole, as written");
  assert.deepEqual(policy.parts[2].legalBasis, ["Lietuvos Respublikos darbo kodeksas art. 58 (act not in corpus)", "PAĮ 10 str."]);
  assert.deepEqual(policy.rules, { broken: [{ rule: "The articles named are in their acts", detail: "Lietuvos Respublikos darbo kodeksas 58" }],
                                   notes: [] });
  assert.deepEqual(policy.missing.map((row) => row.priority), ["high", "high", "medium", "medium", "low"]);
  assert.deepEqual(policy.documents.notRules, ["00-company-profile.md", "F00-fintech-overview.md"]);
  assert.ok(policy.missing.every((row) => row.purpose.length <= 240 + " …[truncated]".length));

  const governance = await call(set, "getWorkProduct", { productId: REAL.governance.id });
  assert.deepEqual(governance.structure, [
    "Valdyba — governing",
    "  Generalinis direktorius (CEO) — first",
    "    Vyriausiasis technologijų vadovas (CTO) — first",
    "      Technologijų padalinys — first",
    "    Finansų apskaitos funkcija — first (proposed)",
    "  Atitikties pareigūnas — second",
    "  Rizikos pareigūnas — second",
    "  Vidaus auditas — third",
  ]);
  assert.deepEqual([governance.process.at(-1).basis, governance.process.at(-1).raci],
                   [["ISO 37301 9.2"], "A: Valdyba; R: Vidaus auditas; C: Atitikties pareigūnas; I: Generalinis direktorius (CEO)"]);
  assert.deepEqual(governance.process.map((step) => step.what),
                   REAL.governance.content.process.map((step) => `${step.description.slice(0, 240)} …[truncated]`),
                   "what each step consists of, cut short — the real descriptions run to some 700 characters");
  assert.deepEqual([governance.positionsFound, governance.builtOn.products], [6, [{ kind: "policy", version: 2, status: "draft" }]]);
  const positions = await call(set, "getWorkProduct", { productId: REAL.governance.id, section: "positions" });
  assert.deepEqual(positions.positions[0].sources, ["08-information-security.md", "F01-governance-accountability.md"]);
  assert.deepEqual(RAW_KEYS.filter((key) => keysOf(positions).has(key)), []);

  const risks = await call(set, "getWorkProduct", { productId: REAL.risks.id });
  assert.deepEqual(risks.scenarios.map((s) => [s.id, s.likelihood, s.impact, s.score, s.band]),
                   [["LR-01", 3, 3, 9, "medium"], ["LR-03", 3, 3, 9, "medium"], ["LR-05", 2, 3, 6, "tolerable"], ["LR-06", 4, 3, 12, "medium"],
                    ["LR-08", 2, 3, 6, "tolerable"]]);
  assert.deepEqual([risks.scenarios[0].types, risks.scenarios[0].legalBasis, risks.scenarios[0].policies],
                   [["2 Taikytinų teisės aktų nesilaikymas", "6 Netinkamas pasirinkimas"], ["MiCA 80 str. 2 d.", "MiCA 81 str. 4 d. (subject mismatch)"],
                    ["F04-conflict-of-interest.md", "F01-governance-accountability.md"]]);
  const criteria = await call(set, "getWorkProduct", { productId: REAL.risks.id, section: "criteria" });
  assert.deepEqual([Object.keys(criteria), criteria.criteria.likelihood.length, criteria.criteria.impact.length],
                   [["id", "kind", "title", "version", "status", "url", "criteria"], 5, 5]);
  assert.ok(Buffer.byteLength(JSON.stringify(criteria)) < 9_000);
  assertAsUser(stub.requests);
});


test("getWorkProduct: long lists are capped and counted — a counter only where something was cut", async () => {
  const many = (length, row) => Array.from({ length }, (_, i) => row(i));
  extra["p-wide"] = { ...POLICY, id: "p-wide", content: {
    parts: [{ ...POLICY.content.parts[0], decisions: many(12, (i) => `[Sprendimas ${i}]`) }],
    hierarchy: many(50, (i) => ({ documentId: `d${i}`, document: `Dokumentas ${i}`, level: i < 45 ? 2 : 3 })),
    missing: many(45, (i) => ({ level: 3, title: `Trūksta ${i}`, purpose: "p", priority: i === 44 ? "high" : "low", legalBasis: [] })),
  } };
  extra["g-wide"] = { ...GOVERNANCE, id: "g-wide", content: {
    positions: many(61, (i) => ({ name: `Pareigybė ${i}`, unit: "", line: "first", duties: "d", sources: [] })),
    gaps: many(31, (i) => ({ role: `Rolė ${i}`, line: "second", why: "w" })),
    structure: many(85, (i) => ({ id: `n${i}`, name: `Mazgas ${i}`, line: "first", parentId: i ? "n0" : null, proposed: false })),
    process: many(31, (i) => ({ id: `s${i}`, name: `Etapas ${i}`, frequency: "Kasmet", basis: [] })),
    raci: [],
  } };
  extra["r-wide"] = { ...RISKS, id: "r-wide", content: { ...RISKS.content,
    scenarios: many(32, (i) => ({ ...RISKS.content.scenarios[1], id: `LR-${i}`, actions: many(9, (n) => `Veiksmas ${n}`) })) } };
  const set = await toolSet();
  const policy = await call(set, "getWorkProduct", { productId: "p-wide" });
  assert.deepEqual([policy.parts[0].decisions.length, policy.documents.level2.length, policy.documents.level3.length, policy.moreDocuments],
                   [10, 40, 5, 5]);
  assert.deepEqual([policy.missing.length, policy.moreMissing, policy.missing[0].title], [40, 5, "Trūksta 44"],
                   "the cut falls on the least needed");
  const governance = await call(set, "getWorkProduct", { productId: "g-wide" });
  assert.deepEqual([governance.gaps.length, governance.moreGaps, governance.structure.length, governance.moreNodes, governance.process.length,
                    governance.moreSteps, governance.positionsFound], [30, 1, 80, 5, 30, 1, 61]);
  const positions = await call(set, "getWorkProduct", { productId: "g-wide", section: "positions" });
  assert.deepEqual([positions.positions.length, positions.morePositions], [60, 1]);
  const risks = await call(set, "getWorkProduct", { productId: "r-wide" });
  assert.deepEqual([risks.scenarios.length, risks.moreScenarios, risks.scenarios[0].actions.length], [30, 2, 8]);
  for (const product of ["p-pol", "p-gov", "p-risk"]) {
    const fits = await call(set, "getWorkProduct", { productId: product });
    assert.deepEqual(Object.keys(fits).filter((key) => key.startsWith("more")), [], `${product}: nothing was cut, nothing is counted`);
  }
});


test("the descriptions: start only what the user asked for and nothing that exists; read for every question the three kinds answer", async () => {
  const set = await toolSet();
  const start = set.startWorkProduct.description;
  assert.match(start, /4-6 minutes.+about \$0\.5 of the user's daily AI budget/);
  assert.match(start, /ONLY when the user asked for that document/);
  assert.match(start, /FIRST check with getWorkProduct whether a draft or an approved version already exists — offer that instead/);
  const read = set.getWorkProduct.description;
  for (const topic of ["compliance policy", "missing documents", "document hierarchy", "governance structure", "compliance process", "RACI matrix",
                       "risk criteria", "risk matrix", "legal risk register"]) {
    assert.ok(read.includes(topic), topic);
  }
  assert.match(read, /Never ask the user for an id: companyId is in the company context and the product is found by kind/);
  assert.match(read, /Editing and approval happen on the product's page in the console — give the user its url; you cannot approve/);
  assert.match(read, /rules\.broken block its approval/);
  for (const description of [start, read]) assert.ok(description.length <= 1_024, "within the bound tools.test.mjs sets");
});
