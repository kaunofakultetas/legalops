// -----------------------------------------------------------
//  [*] Tests — the chat tools call Django as the user
//
//  The contract the whole tool set shares, against the Django
//  stub: the tool inventory, strict schemas, the user's bearer
//  and IP on every call of every tool, and Django's error code
//  reaching the model. Each group's main flows get one quick
//  pass; the per-tool detail is in the tools-*.test.mjs files.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { assertAsUser } from "./helpers/toolKit.mjs";
import { startStubDjango } from "./stubDjango.mjs";


// One valid call of every tool — the sweeps below run them all
const SWEEP = {
  listCompanies: {},
  getCompany: { companyId: "c1" },
  createCompany: { name: "MB Sweep" },
  updateCompany: { companyId: "c1", usesAi: true },
  setThreadCompany: { companyId: "c1" },
  addCredential: { companyId: "c1", kind: "license", name: "Sweep" },
  updateCredential: { companyId: "c1", credentialId: "cr1", status: "verified" },
  removeCredential: { companyId: "c1", credentialId: "cr1" },
  setCompanyStandard: { companyId: "c1", standard: "ISO 27001", status: "certified" },
  removeCompanyStandard: { companyId: "c1", adoptionId: "s1" },
  listRoles: { companyId: "c1" },
  saveRole: { companyId: "c1", name: "Sweep", context: "x", sources: [] },
  setThreadRole: { roleId: "r-aml" },
  listDocuments: { companyId: null },
  readDocument: { documentId: "d1" },
  searchCompanyDocuments: { query: "rizika", companyId: null },
  attachDocument: { documentId: "d1", companyId: "c1", kind: "policy" },
  searchLegalCorpus: { query: "leidimas" },
  getLegalProvision: { document: "MiCA", article: "59" },
  checkCitations: { citations: [{ act: "MiCA", article: "59" }] },
  listLegalActs: {},
  listObligations: { act: "ISO/IEC 27001:2022" },
  estimateAnalysisCost: { companyId: "c1" },
  runComplianceAnalysis: { companyId: "c1", confirmedCostUsd: 100 },
  approveReportScope: { reportId: "r1", confirmedCostUsd: 100 },
  cancelAnalysis: { reportId: "r1" },
  listReports: {},
  getReport: { reportId: "r1" },
  overrideFinding: { reportId: "r1", findingId: "f-crit", status: "met", reason: "sweep reason" },
  getActionRegister: { companyId: "c1" },
  startWorkProduct: { companyId: "c1", kind: "policy" },
  getWorkProduct: { companyId: "c1", kind: "policy" },
};

// A finished report as Django's detail route answers it: one
// finding with what a breach can cost, and the company's own
// requirements — their row among the acts, one finding, their
// counts apart
const REPORT = {
  id: "r1", companyId: "c1", companyName: "UAB Kripto", status: "done", jobStatus: "done", language: "lt",
  title: "Atitikties analizė", createdAt: "2026-09-27", finishedAt: "2026-09-27", progress: { step: "done", percent: 100 },
  stats: { acts: { applies: 3, uncertain: 1, not_applies: 2 },
           internal: { findings: { met: 0, partial: 1, missing: 0, unknown: 0, not_applicable: 0 }, openBySeverity: { medium: 1 } } },
  summary: "Santrauka",
  acts: [{ shortTitle: "MiCA", applicability: "applies", confidence: "high" }, { shortTitle: "CRR", applicability: "not_applies" },
         { shortTitle: "Vidaus reikalavimai", docType: "internal", applicability: "applies", assessment: "assessed" }],
  findings: [
    { id: "f-met", effectiveStatus: "met", severity: "high", citations: [] },
    { id: "f-low", effectiveStatus: "missing", severity: "low", citations: [] },
    { id: "f-crit", effectiveStatus: "missing", severity: "critical", overrideStatus: null,
      consequence: [{ act: "MiCA", path: "111 str.", where: "1 d.", condition: "", maxFineEur: 700_000, maxFinePercent: null,
                      benefitMultiple: null, measures: [], measuresFrom: [] }],
      citations: [{ path: "59 str.", documentTitle: "MiCA", url: "https://eur-lex" }] },
    { id: "f-part", effectiveStatus: "partial", severity: "medium", overrideStatus: "partial", citations: [] },
    { id: "f-own", sourceKind: "internal", shortTitle: "Vidaus reikalavimai", effectiveStatus: "partial", severity: "medium", consequence: [],
      citations: [{ path: "4.2 p.", documentTitle: "Rizikos valdymo politika", documentId: "d1" }] },
  ],
  actions: [{ title: "Gauti CASP leidimą", priority: "high", timeframe: "immediate", ownerRole: "CEO", findingIds: ["f-crit"] }],
};

// The company's action register as Django answers it: a late
// action of the September report with the finding it is to
// close, and one a later signed-off report closed
const REGISTER = {
  actions: [
    { id: "a1", companyId: "c1", reportId: "r-old", reportDate: "2026-09-01", title: "Gauti CASP leidimą", priority: 1, owner: "CEO",
      dueDate: "2026-10-11", status: "open", state: "late", byHandOnly: false, note: "", closedAt: null, closedByName: null, closedHow: null,
      confirmedReportId: null,
      items: [{ obligationId: "o1", findingId: "f-crit", title: "Leidimas teikti paslaugas", act: "MiCA", path: "59 str.", sourceKind: "legal",
                status: "missing", confirmed: null }] },
    { id: "a2", companyId: "c1", reportId: "r-old", reportDate: "2026-09-01", title: "Patvirtinti skundų tvarką", priority: 2,
      owner: "Atitikties pareigūnas", dueDate: "2026-10-27", status: "closed", state: "closed", byHandOnly: false, note: "",
      closedAt: "2026-11-10T08:30:00+00:00", closedByName: null, closedHow: "confirmed", confirmedReportId: "r-live",
      items: [{ obligationId: "o2", findingId: "f-low", title: "Skundų nagrinėjimo tvarka", act: "MiCA", path: "71 str.", sourceKind: "legal",
                status: "missing", confirmed: { reportId: "r-live", at: "2026-11-10T08:30:00+00:00" } }] },
  ],
  counts: { late: 1, open: 0, in_progress: 0, done: 0, closed: 1 },
};

// What the law did since the company's latest report: one act
// with a newer version, and the finding that rests on it
const LAW_CHANGES = {
  reportId: "r-old", reportDate: "2026-09-01",
  acts: [{ actId: "ra1", documentId: "mica", act: "MiCA", assessedVersion: 3, currentVersion: 4, currentDate: "2026-11-01", recorded: true,
           changed: ["59 str."], added: [], removed: [],
           findings: [{ id: "f-crit", title: "Leidimas teikti paslaugas", status: "missing", path: "59 str." }] }],
};

let stub;
let createTools;
let userClient;







// -----------------------------------------------------------
// tools
// -----------------------------------------------------------
//
// A fresh tool set for the test user (bearer tok-123, end-user
// IP 198.51.100.7), each call's telemetry pushed into `calls`.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function tools(calls = [], threadId = "t1") {
  return createTools({
    django: userClient({ token: "tok-123", clientIp: "198.51.100.7" }), threadId, language: "lt",
    record: (c) => calls.push(c),
  });
}


before(async () => {
  stub = await startStubDjango();
  process.env.DJANGO_URL = stub.url;
  ({ createTools } = await import("../llm/tools.js"));
  ({ userClient } = await import("../services/django.js"));
});

beforeEach(() => {
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, {
    "GET /api/companies": (_b, _r, url) => ({ json: { companies: url.searchParams.get("q") === "UAB Kripto"
      ? [{ id: "c1", name: "UAB  kripto" }] : [{ id: "c1", name: "UAB Kripto", institutionType: "casp", updatedAt: "x" }] } }),
    "POST /api/companies": (body) => ({ status: 201, json: { id: "c2", name: body.name, credentials: [], documents: [], roles: [] } }),
    "GET /api/companies/c1": () => ({ json: { id: "c1", name: "UAB Kripto", ownerId: "u", credentials: [], documents: [], roles: [] } }),
    "GET /api/companies/missing": () => ({ status: 404, json: { error: "Company not found", code: "NOT_FOUND" } }),
    "PATCH /api/chat/threads/t1": (body) => ({ json: { id: "t1", companyId: body.companyId ?? "c1", roleId: body.roleId ?? null,
                                                        role: body.roleId ? { name: "AML" } : null } }),
    "GET /api/companies/c1/credentials": () => ({ json: { credentials: [{ id: "cr1", kind: "license", name: "CASP leidimas" }] } }),
    "POST /api/companies/c1/credentials": (body) => ({ status: 201, json: { id: "cr2", ...body } }),
    "PATCH /api/companies/c1/credentials/cr1": (body) => ({ json: { id: "cr1", kind: "license", name: "CASP leidimas", ...body } }),
    "GET /api/corpus/documents": () => ({ json: { documents: [{ id: "iso-27001", shortTitle: "ISO/IEC 27001:2022",
                                                               title: "ISMS", docType: "standard" }] } }),
    "GET /api/companies/c1/standards": () => ({ json: { standards: [] } }),
    "POST /api/companies/c1/standards": (body) => ({ status: 201, json: { id: "s1", shortTitle: "ISO/IEC 27001:2022", ...body } }),
    "DELETE /api/companies/c1/standards/s1": () => ({ json: { ok: true } }),
    "GET /api/companies/c1/roles": () => ({ json: { roles: [{ id: "r-aml", name: "AML pareigūnas", context: "x" }] } }),
    "POST /api/companies/c1/roles": (body) => ({ status: 201, json: { id: "r-new", ...body } }),
    "PATCH /api/companies/c1/roles/r-aml": (body) => ({ json: { id: "r-aml", ...body } }),
    "GET /api/documents/d1": () => ({ json: { id: "d1", title: "AML politika", outline: [
      { title: "1. Bendrosios nuostatos", level: 1, offset: 0 }, { title: "9.1. Rizikos vertinimas", level: 2, offset: 4200 }] } }),
    "GET /api/documents/d1/text": (_b, _r, url) => ({ json: { id: "d1", title: "AML politika", offset: Number(url.searchParams.get("offset")),
      limit: Number(url.searchParams.get("limit")), total: 9000, extractionStatus: "done", text: "abc" } }),
    "GET /api/documents/search": () => ({ json: { hits: [{ documentId: "d1", title: "AML politika", heading: "9.1", charStart: 4200, text: "t", score: 1 }] } }),
    "POST /api/corpus/search": () => ({ json: { hits: [{ unitId: "u1", documentId: "mica", shortTitle: "MiCA", documentTitle: "Reglamentas",
      path: "59 str.", text: "Kriptoturto paslaugų teikėjai…", sourceUrl: "https://src", citationUrl: "https://eur-lex/#art_59", score: 0.9 }] } }),
    "GET /api/corpus/provision": () => ({ json: { unitId: "u1", documentId: "mica", shortTitle: "MiCA", documentTitle: "Reglamentas",
      path: "59 str.", text: "Visas tekstas", versionNo: 3, versionDate: "2024-12-30", citationUrl: "https://eur-lex/#art_59" } }),
    "POST /api/corpus/check-citations": (body) => ({ json: { results: body.citations.map((c, i) => ({
      ...c, status: i === 2 ? "act_not_in_corpus" : "found", headingMatch: i === 1 ? "mismatch" : "match", heading: "Real heading" })) } }),
    "POST /api/reports": (body) => (body.companyId === "busy" ? { status: 409, json: { error: "running", code: "ALREADY_RUNNING" } }
      : body.companyId === "empty" ? { status: 409, json: { error: "The legal corpus is empty", code: "CORPUS_EMPTY" } }
        : body.companyId === "broke" ? { status: 429, json: { error: "budget spent", code: "BUDGET_EXCEEDED" } }
          : { status: 201, json: { id: "r9", companyId: body.companyId, status: "queued", language: body.language } }),
    "GET /api/reports": () => ({ json: { reports: [{ id: "r-old", status: "done" }, { id: "r-live", status: "running", progress: { percent: 40 } }] } }),
    "GET /api/reports/estimate": (_b, _r, url) => ({ json: {
      pricesKnown: true, acts: url.searchParams.get("documentIds") ? 7 : 26, obligations: 300, actsToExtract: 2,
      analysisUsd: url.searchParams.get("documentIds") ? 5.5 : 20, extractionUsd: url.searchParams.get("documentIds") ? 1.5 : 7,
      ...(url.searchParams.get("internal") === "true" ? { internal: { documents: 2, requirements: 16, usd: 1.5 } } : {}),
      totalUsd: (url.searchParams.get("documentIds") ? 7 : 27) + (url.searchParams.get("internal") === "true" ? 1.5 : 0),
      upperBound: true, budget: { limit: 10, used: 1, remaining: 9, unit: "USD" } } }),
    "GET /api/reports/r1": () => ({ json: REPORT }),
    "POST /api/reports/r1/cancel": () => ({ json: { ...REPORT, status: "cancelled" } }),
    "POST /api/reports/r1/scope": (body) => ({ json: body.approved ? { ...REPORT, status: "queued" }
      : { estimate: { acts: [], obligations: 40, analysisUsd: 5, extractionUsd: 0, totalUsd: 5, upperBound: true, pricesKnown: true },
          budget: null } }),
    "GET /api/obligations": () => ({ json: { obligations: [], total: 0 } }),
    "PATCH /api/reports/r1/findings/f-crit": (body) => ({ json: { id: "f-crit", effectiveStatus: body.overrideStatus, overrideStatus: body.overrideStatus,
      reviewerNote: body.reviewerNote, severity: "critical", citations: [] } }),
    "GET /api/companies/c1/actions": () => ({ json: REGISTER }),
    "GET /api/companies/c1/law-changes": () => ({ json: LAW_CHANGES }),
    "POST /api/companies/c1/programme": (body) => (body.kind === "risks"
      ? { status: 409, json: { error: "The company has no readable documents — upload them first", code: "NO_DOCUMENTS" } }
      : { status: 201, json: { id: "p9", companyId: "c1", kind: body.kind, version: 2, language: body.language, status: "queued",
                               title: "Atitikties politika" } }),
    "GET /api/companies/c1/programme": () => ({ json: {
      products: [{ id: "p1", kind: "policy", version: 1, status: "draft", title: "UAB Kripto atitikties politika",
                   checks: [{ rule: "provisions", ok: false, blocking: true, detail: "MiCA 199" }] }],
      kinds: [{ kind: "policy", title: { lt: "Atitikties politika" }, needs: [] },
              { kind: "governance", title: { lt: "Valdymo struktūra, atitikties procesas ir RACI" }, needs: ["policy"] }] } }),
    "GET /api/programme/p1": () => ({ json: {
      id: "p1", kind: "policy", version: 1, status: "draft", language: "lt", title: "UAB Kripto atitikties politika",
      checks: [{ rule: "provisions", ok: false, blocking: true, detail: "MiCA 199" }],
      basis: { reportId: "r1", products: {}, documents: [{ id: "d1", title: "AML politika", sha256: "ab12" }] },
      content: { parts: [{ key: "purpose", heading: "Įvadas", text: "Politikos tikslas.", decisions: [],
                           sources: [{ documentId: "d1", document: "AML politika", quote: "a quote kept from the model", start: 4 }],
                           legalBasis: [{ act: "MiCA", article: "199", paragraph: "", found: false, status: "not_found", shortTitle: "MiCA", path: "" }] }],
                 hierarchy: [{ documentId: "d1", document: "AML politika", level: 2 }], missing: [] } } }),
  });
});

after(async () => { await stub.close(); });


test("every tool schema is strict: additionalProperties false on every object, unknown keys refused", async () => {
  const set = tools();
  const walk = (schema, path) => {
    if (schema?.type === "object" && schema.properties) {
      assert.equal(schema.additionalProperties, false, `${path} must refuse extra keys`);
      for (const [key, child] of Object.entries(schema.properties)) walk(child, `${path}.${key}`);
    }
    for (const branch of schema?.anyOf || []) walk(branch, path);
    if (schema?.items) walk(schema.items, `${path}[]`);
  };
  for (const [name, tool] of Object.entries(set)) walk(await tool.inputSchema.jsonSchema, name);
  const verdict = await set.getCompany.inputSchema.validate({ companyId: "c1", sneaky: true });
  assert.equal(verdict.success, false);
  const badEnum = await set.addCredential.inputSchema.validate({ companyId: "c1", kind: "diploma", name: "x" });
  assert.equal(badEnum.success, false, "enums are enforced");
  for (const input of [{ companyId: "c1", close: "a1" }, { companyId: "c1", state: "overdue" }]) {
    assert.equal((await set.getActionRegister.inputSchema.validate(input)).success, false, `the register's tool refuses ${JSON.stringify(input)}`);
  }
});


test("listCompanies is the user's own list, with the bearer and the end user's IP", async () => {
  const listed = await tools().listCompanies.execute({}, {});
  assert.equal(listed.companies[0].name, "UAB Kripto");
  const request = stub.requests.at(-1);
  assert.equal(request.query.scope, "own");
  assert.equal(request.auth, "Bearer tok-123");
  assert.equal(request.realIp, "198.51.100.7");
});


test("ids are URL-encoded and Django's error code reaches the model", async () => {
  const calls = [];
  const set = tools(calls);
  await assert.rejects(() => set.getCompany.execute({ companyId: "../users/x?y=1" }, {}),
                       (err) => err.name === "ToolFailure");
  assert.equal(stub.requests.at(-1).path, "/api/companies/..%2Fusers%2Fx%3Fy%3D1");
  await assert.rejects(() => set.getCompany.execute({ companyId: "missing" }, {}),
                       (err) => err.message === "[NOT_FOUND] getCompany failed (HTTP 404): Company not found" && err.code === "NOT_FOUND");
  assert.deepEqual(calls.at(-1), { ...calls.at(-1), name: "getCompany", ok: false, code: "NOT_FOUND" });
});


test("createCompany refuses a duplicate name and otherwise links the thread", async () => {
  const set = tools();
  await assert.rejects(() => set.createCompany.execute({ name: "UAB Kripto" }, {}), (err) => err.code === "DUPLICATE_COMPANY");
  const created = await set.createCompany.execute({ name: "MB Nauja", usesAi: null }, {});
  assert.equal(created.company.id, "c2");
  assert.equal(created.threadLinked, true);
  const post = stub.requests.find((r) => r.method === "POST" && r.path === "/api/companies");
  assert.deepEqual(post.body, { name: "MB Nauja", usesAi: null }, "unknown stays null");
  assert.deepEqual(stub.requests.find((r) => r.method === "PATCH").body, { companyId: "c2" });
});


test("credentials: a same-name credential is updated, a new one posted; updateCredential patches", async () => {
  const set = tools();
  const same = await set.addCredential.execute({ companyId: "c1", kind: "license", name: "casp  LEIDIMAS", status: "claimed" }, {});
  assert.equal(same.updatedExisting, true);
  assert.equal(stub.requests.at(-1).method, "PATCH");
  const fresh = await set.addCredential.execute({ companyId: "c1", kind: "certificate", name: "ISO 27001" }, {});
  assert.equal(fresh.updatedExisting, false);
  assert.equal(fresh.credential.status, "claimed", "claimed unless verified");
  const verified = await set.updateCredential.execute({ companyId: "c1", credentialId: "cr1", status: "verified", identifier: "LB-1" }, {});
  assert.equal(verified.credential.status, "verified");
  assert.deepEqual(stub.requests.at(-1).body, { status: "verified", identifier: "LB-1" });
});


test("roles: saveRole updates the same-name role or creates one; setThreadRole patches the thread", async () => {
  const set = tools();
  const updated = await set.saveRole.execute({ companyId: "c1", name: "aml pareigūnas", context: "Pareigos" }, {});
  assert.equal(updated.created, false);
  assert.equal(stub.requests.at(-1).path, "/api/companies/c1/roles/r-aml");
  const created = await set.saveRole.execute({ companyId: "c1", name: "Atitikties pareigūnas", context: "Pareigos",
                                               sources: [{ documentId: "d1", section: "9.1" }] }, {});
  assert.equal(created.created, true);
  const linked = await set.setThreadRole.execute({ roleId: "r-aml" }, {});
  assert.deepEqual(linked, { roleId: "r-aml", roleName: "AML" });
});


test("readDocument: the first window carries the outline; a section jump starts at its offset", async () => {
  const set = tools();
  const first = await set.readDocument.execute({ documentId: "d1" }, {});
  assert.equal(first.outline.length, 2);
  assert.equal(first.nextOffset, 3);
  const jump = await set.readDocument.execute({ documentId: "d1", section: "9.1" }, {});
  assert.equal(jump.offset, 4200);
  assert.equal(jump.section.title, "9.1. Rizikos vertinimas");
  const missing = await set.readDocument.execute({ documentId: "d1", section: "42" }, {});
  assert.equal(missing.sectionNotFound, "42");
  const next = await set.readDocument.execute({ documentId: "d1", offset: 20000 }, {});
  assert.equal(next.outline, undefined, "later windows skip the outline");
  const hits = await set.searchCompanyDocuments.execute({ query: "rizika", documentIds: ["d1", "d2"] }, {});
  assert.equal(hits.hits[0].cite, "AML politika §9.1");
  assert.equal(stub.requests.at(-1).query.documentIds, "d1,d2");
});


test("corpus tools carry citation URLs, versions and citation verdicts", async () => {
  const set = tools();
  const search = await set.searchLegalCorpus.execute({ query: "kriptoturto paslaugų teikėjo leidimas" }, {});
  assert.equal(search.hits[0].citationUrl, "https://eur-lex/#art_59");
  const provision = await set.getLegalProvision.execute({ document: "MiCA", article: "59" }, {});
  assert.equal(provision.provision.versionDate, "2024-12-30");
  assert.equal(provision.provision.text, "Visas tekstas");
  const checked = await set.checkCitations.execute({ citations: [
    { act: "MiCA", article: "77" }, { act: "MiCA", article: "74", claimedHeading: "RTO" }, { act: "XYZ", article: "1" }] }, {});
  assert.deepEqual(checked.counts, { found: 2, headingMismatch: 1, notFound: 0, actNotInCorpus: 1 });
});


test("an analysis is priced first and only started for an accepted upper bound of the same scope", async () => {
  const set = tools();
  const estimate = await set.estimateAnalysisCost.execute({ companyId: "c1", documentIds: ["mica", "dora"] }, {});
  assert.equal(estimate.totalUsd, 7);
  assert.equal(estimate.budget.unit, "USD");
  assert.equal(stub.requests.at(-1).query.documentIds, "mica,dora");
  await assert.rejects(() => set.runComplianceAnalysis.execute({ companyId: "c1", confirmedCostUsd: 7 }, {}),
                       (err) => err.code === "COST_NOT_CONFIRMED" && /\$27\.00/.test(err.message), "the whole corpus costs more");
  assert.equal(stub.requests.filter((r) => r.method === "POST" && r.path === "/api/reports").length, 0, "nothing started");
  const started = await set.runComplianceAnalysis.execute({ companyId: "c1", confirmedCostUsd: 7, documentIds: ["mica", "dora"] }, {});
  assert.equal(started.started, true);
  assert.deepEqual(stub.requests.find((r) => r.path === "/api/reports" && r.method === "POST").body.documentIds, ["mica", "dora"]);
  const schema = await set.runComplianceAnalysis.inputSchema.validate({ companyId: "c1" });
  assert.equal(schema.success, false, "confirmedCostUsd is required");
  const own = await set.estimateAnalysisCost.execute({ companyId: "c1", internalRequirements: true }, {});
  assert.deepEqual([stub.requests.at(-1).query.internal, own.ownRequirements, own.totalUsd],
                   ["true", { documents: 2, requirements: 16, usd: 1.5 }, 28.5], "the company's own requirements are priced when asked for");
  await assert.rejects(() => set.runComplianceAnalysis.execute({ companyId: "c1", confirmedCostUsd: 27, internalRequirements: true }, {}),
                       (err) => err.code === "COST_NOT_CONFIRMED" && /\$28\.50 .+own requirements \$1\.50/.test(err.message));
  await set.runComplianceAnalysis.execute({ companyId: "c1", confirmedCostUsd: 28.5, internalRequirements: true }, {});
  assert.equal(stub.requests.at(-1).body.internal, true, "and started with them only for a total that covers them");
});


test("reports: start, the 409/429 codes, ALREADY_RUNNING answered with the running report", async () => {
  const set = tools();
  const started = await set.runComplianceAnalysis.execute({ companyId: "c1", confirmedCostUsd: 30 }, {});
  assert.equal(started.report.url, "/reports/r9");
  assert.equal(stub.requests.find((r) => r.path === "/api/reports").body.language, "lt", "the turn's language by default");
  await assert.rejects(() => set.runComplianceAnalysis.execute({ companyId: "empty", confirmedCostUsd: 30 }, {}), (err) => err.code === "CORPUS_EMPTY");
  await assert.rejects(() => set.runComplianceAnalysis.execute({ companyId: "broke", confirmedCostUsd: 30 }, {}),
                       (err) => err.code === "BUDGET_EXCEEDED" && /HTTP 429/.test(err.message));
  const busy = await set.runComplianceAnalysis.execute({ companyId: "busy", confirmedCostUsd: 30 }, {});
  assert.equal(busy.alreadyRunning, true);
  assert.equal(busy.report.id, "r-live");
});


test("getReport summarises by effective status and lists the most urgent findings first", async () => {
  const report = await tools().getReport.execute({ reportId: "r1", limit: 3 }, {});
  assert.deepEqual(report.counts.findings, { met: 1, missing: 2, partial: 1 });
  assert.deepEqual(report.counts.openBySeverity, { low: 1, critical: 1, medium: 1 });
  assert.deepEqual(report.topFindings.map((f) => f.id), ["f-crit", "f-low", "f-part"]);
  assert.equal(report.moreFindings, 1);
  assert.equal(report.report.url, "/reports/r1");
  assert.deepEqual(report.acts.assessed.map((a) => a.act), ["MiCA"]);
  assert.equal(report.topFindings[0].canCost, "a fine of up to EUR 700,000 (MiCA 111 str. 1 d.)", "what a breach can cost, for a gap");
  assert.deepEqual([report.ownRequirements.counts, report.byAct.map((row) => row.act)], [{ partial: 1 }, ["—"]],
                   "the company's own requirements are counted apart from the acts");
  const own = await tools().getReport.execute({ reportId: "r1", act: "internal" }, {});
  assert.deepEqual(own.topFindings.map((f) => [f.id, f.criterion]), [["f-own", "Rizikos valdymo politika 4.2 p."]]);
  const overridden = await tools().overrideFinding.execute({ reportId: "r1", findingId: "f-crit", status: "met",
                                                              reason: "LB licence LB-1 shown" }, {});
  assert.equal(overridden.finding.status, "met");
  assert.deepEqual(stub.requests.at(-1).body, { overrideStatus: "met", reviewerNote: "LB licence LB-1 shown" });
});


test("work products: found by kind and read compact; started in the turn's language, a refusal relayed", async () => {
  const set = tools();
  const list = await set.getWorkProduct.execute({ companyId: "c1" }, {});
  assert.deepEqual(list.products.map((p) => [p.kind, p.status, p.brokenRules ?? null]), [["policy", "draft", 1], ["governance", "none", null]]);
  const policy = await set.getWorkProduct.execute({ companyId: "c1", kind: "policy" }, {});
  assert.equal(stub.requests.at(-1).path, "/api/programme/p1", "the newest version of the kind, found in the list");
  assert.deepEqual(policy.parts[0], { key: "purpose", heading: "Įvadas", text: "Politikos tikslas.", decisions: [],
                                      legalBasis: ["MiCA art. 199 (not found)"], sources: ["AML politika"] });
  assert.deepEqual([policy.rules.broken[0].rule, policy.url], ["The articles named are in their acts", "/programme/p1"]);
  assert.ok(!JSON.stringify(policy).includes("a quote kept from the model") && !JSON.stringify(policy).includes("ab12"));
  const started = await set.startWorkProduct.execute({ companyId: "c1", kind: "governance" }, {});
  assert.deepEqual(stub.requests.at(-1).body, { kind: "governance", language: "lt" });
  assert.deepEqual([started.started, started.product.id, started.url], [true, "p9", "/programme/p9"]);
  const refused = await set.startWorkProduct.execute({ companyId: "c1", kind: "risks" }, {});
  assert.deepEqual([refused.started, refused.refused], [false, "NO_DOCUMENTS"], "a result the model relays, not a failure");
});


test("the action register: read as the user — the live actions with what they close, and the law that moved under the findings", async () => {
  const set = tools();
  const register = await set.getActionRegister.execute({ companyId: "c1" }, {});
  assert.deepEqual(register.counts, { late: 1, open: 0, inProgress: 0, done: 0, closed: 1 });
  assert.deepEqual(register.actions.map((a) => [a.id, a.state, a.owner, a.due, a.closes, a.fromReport]),
                   [["a1", "late", "CEO", "2026-10-11", ["Leidimas teikti paslaugas (MiCA 59 str.)"], "2026-09-01"]],
                   "the closed action is listed only when asked for");
  assert.deepEqual(register.lawChanges, { sinceReport: "2026-09-01", acts: [{
    act: "MiCA", version: "v3 → v4 (2026-11-01)", changed: ["59 str."], added: [], removed: [], recorded: true,
    findingsToRecheck: ["Leidimas teikti paslaugas (59 str.)"], moreFindings: 0 }] });
  assert.equal(register.url, "/companies/c1?tab=actions");
  const closed = await set.getActionRegister.execute({ companyId: "c1", state: "closed" }, {});
  assert.deepEqual(closed.actions.map((a) => [a.id, a.closes, a.closed]),
                   [["a2", ["Skundų nagrinėjimo tvarka (MiCA 71 str.) — confirmed"], { how: "confirmed by a later report", at: "2026-11-10" }]]);
  assert.deepEqual([...new Set(stub.requests.map((r) => `${r.method} ${r.path} ${r.auth}`))],
                   ["GET /api/companies/c1/actions Bearer tok-123", "GET /api/companies/c1/law-changes Bearer tok-123"],
                   "it only reads, as the user: the register and the law's changes");
});


test("the tool inventory: the names a stored history and the GUI's cards rely on", () => {
  assert.deepEqual(Object.keys(tools()).sort(), Object.keys(SWEEP).sort(), "renaming a tool orphans its stored calls and its card");
  for (const [name, tool] of Object.entries(tools())) {
    assert.ok(tool.description.length >= 20 && tool.description.length <= 1_024, `${name}: a real, bounded description`);
    assert.equal(typeof tool.execute, "function");
  }
});


test("every tool, called once, speaks to Django only as the user — bearer, IP, no owner parameter", async () => {
  const calls = [];
  const set = tools(calls);
  for (const [name, input] of Object.entries(SWEEP)) {
    const verdict = await set[name].inputSchema.validate(input);
    assert.ok(verdict.success, `${name}: the sweep input is valid`);
    await set[name].execute(verdict.value, {}).catch(() => {});
  }
  assertAsUser(stub.requests);
  assert.deepEqual([...new Set(calls.map((c) => c.name))].sort(), Object.keys(SWEEP).sort(), "every call is recorded");
});


test("every tool turns a Django failure into a ToolFailure carrying Django's code — never a crash", async () => {
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    stub.routes[`${method} .*`] = () => ({ status: 503, json: { error: "Django is restarting", code: "SERVER_ERROR" } });
  }
  const calls = [];
  const set = tools(calls);
  for (const [name, input] of Object.entries(SWEEP)) {
    await assert.rejects(set[name].execute(input, {}), (err) => {
      assert.equal(err.name, "ToolFailure", name);
      assert.equal(err.message.split(" failed")[0], `[SERVER_ERROR] ${name}`);
      assert.match(err.message, /\(HTTP 503\): Django is restarting$/);
      return true;
    });
  }
  assert.ok(calls.every((c) => c.ok === false && c.code === "SERVER_ERROR"));
});


test("a degraded answer (an empty object) never crashes a tool into TOOL_FAILED", async () => {
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) stub.routes[`${method} .*`] = () => ({ json: {} });
  const calls = [];
  const set = tools(calls);
  for (const [name, input] of Object.entries(SWEEP)) {
    await set[name].execute(input, {}).catch((err) => assert.notEqual(err.code, "TOOL_FAILED", `${name} crashed: ${err.message}`));
  }
  assert.equal(calls.length, Object.keys(SWEEP).length);
});
