// -----------------------------------------------------------
//  [*] Tests — the company tools (llm/tools/companies.js)
//
//  Every company, credential and role tool against a Django
//  stub that answers as companies/api and chat/api do: the
//  same shapes, the word-by-word company search, the 404 and
//  409 codes. Each tool is held to its input schema, the exact
//  request Django gets and the result the model reads.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-13 — a name variant created a duplicate
//    ASSISTANT-LLM-25 — a reworded company name found nothing
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";

import "./env.mjs";
import { assertAsUser, call, refuses, startToolStub, toolSet } from "./helpers/toolKit.mjs";


// The companies Django holds for the test user
const COMPANIES = [
  { id: "c1", ownerId: "u1", ownerName: "Tomas", name: "UAB Kripto", registrationCode: "305000000", country: "LT",
    legalForm: "UAB", institutionType: "casp", sizeCategory: "small", employees: 12, usesAi: null,
    activities: "Kriptoturto saugojimas", createdAt: "2026-09-01T10:00:00+00:00", updatedAt: "2026-09-27T10:00:00+00:00" },
  { id: "c2", ownerId: "u1", ownerName: "Tomas", name: "MB Konsultacijos", registrationCode: null, country: "LT",
    legalForm: "MB", institutionType: "none", sizeCategory: "micro", updatedAt: "2026-09-20T10:00:00+00:00" },
];

let stub;
let state;







// -----------------------------------------------------------
// freshState
// -----------------------------------------------------------
//
// The rows the stub serves, rebuilt before every test.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function freshState() {
  return {
    companies: COMPANIES.map((c) => ({ ...c })),
    credentials: { c1: [{ id: "cr1", companyId: "c1", kind: "license", name: "CASP leidimas", issuer: "Lietuvos bankas",
                          identifier: null, validFrom: null, validTo: null, scope: "", notes: "", status: "claimed",
                          evidenceDocumentId: null, verifiedBy: null }] },
    standards: { c1: [] },
    corpus: [
      { id: "iso-27001-2022", shortTitle: "ISO/IEC 27001:2022", title: "Information security management systems",
        docType: "standard", enabled: true },
      { id: "iso-27001-2013", shortTitle: "ISO/IEC 27001:2013", title: "Information security management systems",
        docType: "standard", enabled: true },
      { id: "iso-9001", shortTitle: "ISO 9001:2015", title: "Quality management systems", docType: "standard", enabled: true },
    ],
    roles: { c1: [{ id: "r-aml", companyId: "c1", name: "AML pareigūnas", context: "A".repeat(500),
                    sources: [{ documentId: "d1", section: "9.1" }], createdBy: "u1", updatedAt: "2026-09-27" }] },
    documents: { c1: [{ id: "d1", ownerId: "u1", companyId: "c1", title: "AML politika", kind: "policy", charCount: 18_400,
                        extractionStatus: "done", documentType: "policy", inventorySummary: "S".repeat(400), sha256: "x" }] },
    thread: { id: "t1", userId: "u1", companyId: null, companyName: null, roleId: null, role: null },
  };
}







// -----------------------------------------------------------
// detail
// -----------------------------------------------------------
//
// A company as Django's detail route serializes it, with its
// credentials, adopted standards, roles and documents from
// `state`.
//
// Used by:
//   - routes (below)
// -----------------------------------------------------------

function detail(company) {
  return { ...company, credentials: state.credentials[company.id] ?? [], standards: state.standards[company.id] ?? [],
           roles: state.roles[company.id] ?? [], documents: state.documents[company.id] ?? [] };
}







// -----------------------------------------------------------
// idsOf
// -----------------------------------------------------------
//
// The decoded path segments after /api/companies/.
//
// Used by:
//   - routes (below)
// -----------------------------------------------------------

function idsOf(url) {
  return url.pathname.split("/").slice(3).map(decodeURIComponent);
}







// -----------------------------------------------------------
// routes
// -----------------------------------------------------------
//
// Django's company, credential, standard, role and thread
// routes and the corpus catalogue over `state`, with its
// answers and refusals.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function routes() {
  const company = (id) => state.companies.find((c) => c.id === id);
  const missing = { status: 404, json: { error: "Company not found", code: "NOT_FOUND" } };
  return {
    "GET /api/companies": (_b, _r, url) => {
      // Django's company_search: every word but the legal forms
      // must appear in the name or code (a query of legal forms
      // alone is matched whole); accents count, as in Postgres
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const noise = new Set(["uab", "ltd", "mb", "ab", "company", "co", "imone"]);
      const plain = (word) => word.normalize("NFKD").replace(/\p{M}/gu, "");
      const words = (q.match(/[\p{L}\p{N}_]+/gu) ?? []).filter((word) => !noise.has(plain(word)));
      const has = (c, part) => c.name.toLowerCase().includes(part) || String(c.registrationCode || "").toLowerCase().includes(part);
      const rows = state.companies.filter((c) => !q || (words.length ? words.every((word) => has(c, word)) : has(c, q)));
      return { json: { companies: rows } };
    },
    "POST /api/companies": (body) => {
      if (typeof body?.name !== "string" || !body.name.trim()) return { status: 400, json: { error: "name is required", code: "MISSING_FIELDS" } };
      if (body.sizeCategory === "giant") return { status: 400, json: { error: "sizeCategory must be one of …", code: "INVALID_FIELD" } };
      const created = { id: "c-new", ownerId: "u1", ...body, createdAt: "now", updatedAt: "now" };
      state.companies.push(created);
      return { status: 201, json: detail(created) };
    },
    "GET /api/companies/[^/]+": (_b, _r, url) => (company(idsOf(url)[0]) ? { json: detail(company(idsOf(url)[0])) } : missing),
    "PUT /api/companies/[^/]+": (body, _r, url) => {
      const row = company(idsOf(url)[0]);
      if (!row) return missing;
      Object.assign(row, body, { updatedAt: "later" });
      return { json: detail(row) };
    },
    "PATCH /api/chat/threads/[^/]+": (body, _r, url) => {
      if (url.pathname.split("/").at(-1) !== "t1") return { status: 404, json: { error: "Thread not found", code: "NOT_FOUND" } };
      if ("companyId" in body) {
        const row = body.companyId ? company(body.companyId) : null;
        if (body.companyId && !row) return missing;
        Object.assign(state.thread, { companyId: row?.id ?? null, companyName: row?.name ?? null, roleId: null, role: null });
      }
      if ("roleId" in body) {
        const role = (state.roles[state.thread.companyId] ?? []).find((r) => r.id === body.roleId);
        if (body.roleId && !role) return { status: 404, json: { error: "Role not found for the thread's company", code: "NOT_FOUND" } };
        Object.assign(state.thread, { roleId: role?.id ?? null, role: role ?? null });
      }
      return { json: { ...state.thread } };
    },
    "GET /api/companies/[^/]+/credentials": (_b, _r, url) => (company(idsOf(url)[0])
      ? { json: { credentials: state.credentials[idsOf(url)[0]] ?? [] } } : missing),
    "POST /api/companies/[^/]+/credentials": (body, _r, url) => {
      if (!company(idsOf(url)[0])) return missing;
      const row = { id: "cr-new", companyId: idsOf(url)[0], status: "claimed", scope: "", notes: "", ...body };
      (state.credentials[idsOf(url)[0]] ??= []).push(row);
      return { status: 201, json: row };
    },
    "PATCH /api/companies/[^/]+/credentials/[^/]+": (body, _r, url) => {
      const [companyId, , credentialId] = idsOf(url);
      const row = (state.credentials[companyId] ?? []).find((c) => c.id === credentialId);
      if (!row) return { status: 404, json: { error: "Credential not found", code: "NOT_FOUND" } };
      return { json: Object.assign(row, body) };
    },
    "DELETE /api/companies/[^/]+/credentials/[^/]+": (_b, _r, url) => {
      const [companyId, , credentialId] = idsOf(url);
      const rows = state.credentials[companyId] ?? [];
      if (!rows.some((c) => c.id === credentialId)) return { status: 404, json: { error: "Credential not found", code: "NOT_FOUND" } };
      state.credentials[companyId] = rows.filter((c) => c.id !== credentialId);
      return { json: { ok: true } };
    },
    "GET /api/corpus/documents": (_b, _r, url) => ({ json: { documents: state.corpus.filter(
      (d) => !url.searchParams.get("docType") || d.docType === url.searchParams.get("docType")) } }),
    "GET /api/companies/[^/]+/standards": (_b, _r, url) => (company(idsOf(url)[0])
      ? { json: { standards: state.standards[idsOf(url)[0]] ?? [] } } : missing),
    "POST /api/companies/[^/]+/standards": (body, _r, url) => {
      const companyId = idsOf(url)[0];
      const document = state.corpus.find((d) => d.id === body.documentId);
      if (!document) return { status: 400, json: { error: "documentId must be a standard of the corpus", code: "INVALID_FIELD" } };
      const row = { id: `s-${document.id}`, companyId, documentId: document.id, shortTitle: document.shortTitle,
                    title: document.title, ready: true, status: "implementing", scope: "", certificateId: null, notes: "",
                    ...body };
      (state.standards[companyId] ??= []).push(row);
      return { status: 201, json: row };
    },
    "PATCH /api/companies/[^/]+/standards/[^/]+": (body, _r, url) => {
      const [companyId, , adoptionId] = idsOf(url);
      const row = (state.standards[companyId] ?? []).find((a) => a.id === adoptionId);
      return row ? { json: Object.assign(row, body) } : { status: 404, json: { error: "Standard not found", code: "NOT_FOUND" } };
    },
    "DELETE /api/companies/[^/]+/standards/[^/]+": (_b, _r, url) => {
      const [companyId, , adoptionId] = idsOf(url);
      const rows = state.standards[companyId] ?? [];
      if (!rows.some((a) => a.id === adoptionId)) return { status: 404, json: { error: "Standard not found", code: "NOT_FOUND" } };
      state.standards[companyId] = rows.filter((a) => a.id !== adoptionId);
      return { json: { ok: true } };
    },
    "GET /api/companies/[^/]+/roles": (_b, _r, url) => (company(idsOf(url)[0])
      ? { json: { roles: state.roles[idsOf(url)[0]] ?? [] } } : missing),
    "POST /api/companies/[^/]+/roles": (body, _r, url) => {
      if (body.name === "Race") return { status: 409, json: { error: "This company already has a role with that name", code: "DUPLICATE_NAME" } };
      const row = { id: "r-new", companyId: idsOf(url)[0], sources: [], ...body, updatedAt: "now" };
      (state.roles[idsOf(url)[0]] ??= []).push(row);
      return { status: 201, json: row };
    },
    "PATCH /api/companies/[^/]+/roles/[^/]+": (body, _r, url) => {
      const [companyId, , roleId] = idsOf(url);
      const row = (state.roles[companyId] ?? []).find((r) => r.id === roleId);
      return row ? { json: Object.assign(row, body) } : { status: 404, json: { error: "Role not found", code: "NOT_FOUND" } };
    },
  };
}


before(async () => {
  stub = await startToolStub();
});

beforeEach(() => {
  state = freshState();
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, routes());
});

after(async () => { await stub.close(); });


test("listCompanies: the user's OWN companies, compact rows, capped at 50 — and no way to widen the scope", async () => {
  const set = await toolSet();
  for (const input of [{ scope: "all" }, { userId: "u2" }, { ownerId: "u2" }, { query: "x".repeat(201) }, { query: 5 }]) {
    assert.equal(await refuses(set, "listCompanies", input), true, JSON.stringify(input));
  }
  const listed = await call(set, "listCompanies", {});
  assert.deepEqual(stub.requests.at(-1).query, { scope: "own" }, "no q when nothing was asked");
  assert.deepEqual(listed, { total: 2, companies: [
    { id: "c1", name: "UAB Kripto", registrationCode: "305000000", institutionType: "casp", legalForm: "UAB", country: "LT",
      sizeCategory: "small", updatedAt: "2026-09-27T10:00:00+00:00" },
    { id: "c2", name: "MB Konsultacijos", registrationCode: null, institutionType: "none", legalForm: "MB", country: "LT",
      sizeCategory: "micro", updatedAt: "2026-09-20T10:00:00+00:00" },
  ] }, "owner fields and the rest of the profile stay out of a list row");
  const found = await call(set, "listCompanies", { query: "Kripto & Co" });
  assert.deepEqual(stub.requests.at(-1).query, { scope: "own", q: "Kripto & Co" });
  assert.deepEqual(found.companies.map((c) => c.name), ["UAB Kripto"], "Django matched the words, the legal form skipped");
  assert.equal("closest" in found, false, "a match needs no fallback");
  state.companies = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `Įmonė ${i}` }));
  const many = await call(set, "listCompanies", {});
  assert.equal(many.companies.length, 50);
  assert.equal(many.total, 60, "the total says there are more");
  assertAsUser(stub.requests);
});


test("listCompanies: a company named as its documents do is found; with no match, the closest names — typos and missing diacritics too (ASSISTANT-LLM-25)", async () => {
  const set = await toolSet();
  state.companies.push({ id: "c3", ownerId: "u1", name: "1009 LTD (demo)", registrationCode: null },
                       { id: "c4", ownerId: "u1", name: "UAB „Žalgiris“ ir partneriai", registrationCode: null });
  for (const query of ["1009", "1009, LTD", "1009 company", "demo 1009"]) {
    const found = await call(set, "listCompanies", { query });
    assert.deepEqual(found.companies.map((c) => c.id), ["c3"], query);
  }

  // Django finds nothing: the tool asks for the whole own
  // list once more and ranks it — a typo in the number, a
  // name without "ž"
  stub.requests.length = 0;
  const typo = await call(set, "listCompanies", { query: "10009" });
  assert.deepEqual(stub.requests.map((r) => r.query), [{ scope: "own", q: "10009" }, { scope: "own" }]);
  assert.deepEqual({ ...typo, closest: typo.closest.map((c) => [c.id, c.likeness]) },
                   { companies: [], total: 0, closest: [["c3", 0.86]] });
  assert.equal(typo.closest[0].name, "1009 LTD (demo)", "a closest row is a normal compact row");
  assert.equal("ownerId" in typo.closest[0], false);
  const plain = await call(set, "listCompanies", { query: "zalgiris" });
  assert.deepEqual(plain.closest.map((c) => [c.id, c.likeness]), [["c4", 1]]);
  const both = await call(set, "listCompanies", { query: "Kriptoo Zalgiris" });
  assert.deepEqual(both.closest.map((c) => c.id), ["c1", "c4"], "each ranked by the words it shares");

  // Nothing alike: an empty `closest`, never a guess
  const none = await call(set, "listCompanies", { query: "Alfa Beta" });
  assert.deepEqual(none, { companies: [], total: 0, closest: [] });
  assertAsUser(stub.requests);
});


test("getCompany: the full profile without owner fields; related rows compact; Django's 404 for the model", async () => {
  const set = await toolSet();
  assert.equal(await refuses(set, "getCompany", {}), true);
  assert.equal(await refuses(set, "getCompany", { companyId: "" }), true);
  assert.equal(await refuses(set, "getCompany", { companyId: "x".repeat(101) }), true);
  assert.equal(await refuses(set, "getCompany", { companyId: "c1", withOwner: true }), true);
  const profile = await call(set, "getCompany", { companyId: "c1" });
  assert.equal(stub.requests.at(-1).method, "GET");
  assert.equal(stub.requests.at(-1).path, "/api/companies/c1");
  assert.equal("ownerId" in profile || "ownerName" in profile, false, "the owner never reaches the model");
  assert.equal(profile.name, "UAB Kripto");
  assert.equal(profile.activities, "Kriptoturto saugojimas");
  assert.deepEqual(profile.credentials, [{ id: "cr1", kind: "license", name: "CASP leidimas", issuer: "Lietuvos bankas",
    identifier: null, validFrom: null, validTo: null, status: "claimed", evidenceDocumentId: null, scope: undefined, notes: undefined }]);
  assert.deepEqual(profile.documents, [{ id: "d1", title: "AML politika", kind: "policy", charCount: 18_400, extractionStatus: "done",
                                         documentType: "policy", summary: `${"S".repeat(300)} …[truncated]` }]);
  assert.deepEqual(profile.roles, [{ id: "r-aml", name: "AML pareigūnas", context: `${"A".repeat(200)} …[truncated]`,
                                     sources: undefined, updatedAt: "2026-09-27" }], "a role preview, not the whole block");
  await assert.rejects(call(set, "getCompany", { companyId: "c-other-users" }),
                       { name: "ToolFailure", message: "[NOT_FOUND] getCompany failed (HTTP 404): Company not found" });
  assert.equal(stub.requests.at(-1).path, "/api/companies/c-other-users");
  await call(set, "getCompany", { companyId: "x".repeat(100) }).catch(() => {});
  assertAsUser(stub.requests);
});


test("createCompany: every profile field validated; unknown stays null; the new company links the thread", async () => {
  const calls = [];
  const set = await toolSet({ calls });
  const refused = [
    {}, { name: "" }, { name: "x".repeat(501) }, { name: "N", country: "L" }, { name: "N", sizeCategory: "giant" },
    { name: "N", employees: -1 }, { name: "N", employees: 1.5 }, { name: "N", annualTurnoverEur: 1e15 }, { name: "N", usesAi: "yes" },
    { name: "N", institutionType: "hedge_fund" }, { name: "N", naceCodes: ["x".repeat(21)] }, { name: "N", naceCodes: Array(51).fill("64.19") },
    { name: "N", financialMarket: { markets: ["crypto"], secret: true } }, { name: "N", ownerId: "u2" }, { name: "N", threadId: "t9" },
  ];
  for (const input of refused) assert.equal(await refuses(set, "createCompany", input), true, JSON.stringify(input));

  const fields = { name: "MB Nauja", usesAi: null, providesAi: false, employees: 0, naceCodes: ["62.01"], sizeCategory: "micro",
                   financialMarket: { markets: ["none"], licenseRequired: null, verified: false }, attributes: { inferred: { x: 1 } } };
  const created = await call(set, "createCompany", fields);
  const [check, post, link] = stub.requests;
  assert.deepEqual([check.method, check.path, check.query], ["GET", "/api/companies", { scope: "own" }]);
  assert.deepEqual([post.method, post.path], ["POST", "/api/companies"]);
  assert.deepEqual(post.body, fields, "exactly the stated fields — null stays null");
  assert.deepEqual([link.method, link.path, link.body], ["PATCH", "/api/chat/threads/t1", { companyId: "c-new" }]);
  assert.equal(created.threadLinked, true);
  assert.equal(created.company.id, "c-new");
  assert.equal("ownerId" in created.company, false);
  assert.deepEqual(calls.map((c) => [c.name, c.ok]), [["createCompany", true]]);
  assertAsUser(stub.requests);
});


test("createCompany refuses a duplicate — case, spacing and quote variants included (ASSISTANT-LLM-13, FIXED)", async () => {
  const set = await toolSet();
  for (const name of ["UAB Kripto", "uab kripto", "UAB  Kripto ", "UAB „Kripto“", 'UAB "Kripto"', "UAB 'Kripto'"]) {
    stub.requests.length = 0;
    await assert.rejects(call(set, "createCompany", { name }), (err) => {
      assert.equal(err.code, "DUPLICATE_COMPANY", name);
      assert.equal(err.message, "[DUPLICATE_COMPANY] createCompany failed: the user already has \"UAB Kripto\" (id c1) — "
        + "use updateCompany or setThreadCompany instead");
      return true;
    });
    assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0, `${name}: nothing created`);
  }
  assert.equal(state.companies.length, 2);
});


test("createCompany: without a thread nothing is linked; a failed link is a log line, the company stands", async () => {
  const unthreaded = await toolSet({ threadId: null });
  const created = await call(unthreaded, "createCompany", { name: "MB Be gijos" });
  assert.equal(created.threadLinked, false);
  assert.equal(stub.requests.some((r) => r.path.startsWith("/api/chat/threads")), false);

  stub.routes["PATCH /api/chat/threads/[^/]+"] = () => ({ status: 500, json: { error: "db down", code: "SERVER_ERROR" } });
  const logged = mock.method(console, "error", () => {});
  try {
    const set = await toolSet();
    const answer = await call(set, "createCompany", { name: "MB Kita" });
    assert.equal(answer.threadLinked, false);
    assert.equal(answer.company.name, "MB Kita");
    assert.match(logged.mock.calls[0].arguments.join(" "), /Thread link failed/);
  } finally {
    logged.mock.restore();
  }
  stub.routes["POST /api/companies"] = () => ({ status: 400, json: { error: "name cannot be empty", code: "INVALID_FIELD" } });
  await assert.rejects(call(await toolSet(), "createCompany", { name: "MB Trečia" }),
                       { message: "[INVALID_FIELD] createCompany failed (HTTP 400): name cannot be empty" });
});


test("updateCompany: any subset, PUT without the id in the body; null clears; nothing unknown passes", async () => {
  const set = await toolSet();
  assert.equal(await refuses(set, "updateCompany", { name: "x" }), true, "the id is required");
  assert.equal(await refuses(set, "updateCompany", { companyId: "c1", name: "" }), true);
  assert.equal(await refuses(set, "updateCompany", { companyId: "c1", country: null }), true, "country cannot be cleared");
  assert.equal(await refuses(set, "updateCompany", { companyId: "c1", ownerId: "u2" }), true);
  const updated = await call(set, "updateCompany", { companyId: "c1", registrationCode: null, usesAi: true, employees: 14 });
  const put = stub.requests.at(-1);
  assert.deepEqual([put.method, put.path, put.body], ["PUT", "/api/companies/c1", { registrationCode: null, usesAi: true, employees: 14 }]);
  assert.equal(updated.employees, 14);
  assert.equal(updated.registrationCode, null);
  assert.equal("ownerName" in updated, false);
  await assert.rejects(call(set, "updateCompany", { companyId: "gone", usesAi: false }), { message: /^\[NOT_FOUND\] updateCompany failed \(HTTP 404\)/ });
  assertAsUser(stub.requests);
});


test("an update that names no field is refused, not answered as done", async () => {
  const set = await toolSet();
  await assert.rejects(call(set, "updateCompany", { companyId: "c1" }),
                       { message: "[NOTHING_TO_CHANGE] updateCompany failed: no field was given — name at least one field to change" });
  await assert.rejects(call(set, "updateCredential", { companyId: "c1", credentialId: "cr1" }),
                       { message: "[NOTHING_TO_CHANGE] updateCredential failed: no field was given — name at least one field to change" });
  assert.equal(stub.requests.length, 0, "Django would answer the unchanged record, and the model would read a change");
});


test("a text that must be given is trimmed before its bounds: spaces alone are no name, and a padded one travels bare", async () => {
  const set = await toolSet();
  for (const [tool, input] of [["createCompany", { name: "   " }], ["updateCompany", { companyId: "c1", name: " \n\t " }],
                               ["addCredential", { companyId: "c1", kind: "license", name: "  " }],
                               ["saveRole", { companyId: "c1", name: " ", context: "Pareigos.", sources: [] }],
                               ["saveRole", { companyId: "c1", name: "Vadovas", context: "   ", sources: [] }],
                               ["saveRole", { companyId: "c1", name: "Vadovas", context: "Pareigos.", sources: [{ title: "  " }] }],
                               ["getCompany", { companyId: "  " }]]) {
    assert.equal(await refuses(set, tool, input), true, `${tool} ${JSON.stringify(input)}`);
  }
  assert.equal(stub.requests.length, 0);
  await call(set, "updateCompany", { companyId: "c1", name: "  UAB Kripto  " });
  assert.deepEqual(stub.requests.at(-1).body, { name: "UAB Kripto" });
});


test("a credential's date is a day of the calendar, not only the form of one", async () => {
  const set = await toolSet();
  for (const day of ["2026-02-31", "2025-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-04-30", "2026-4-3"]) {
    assert.equal(await refuses(set, "updateCredential", { companyId: "c1", credentialId: "cr1", validTo: day }), true, day);
  }
  for (const day of ["2024-02-29", "2026-12-31", "2027-01-01", null]) {
    assert.equal(await refuses(set, "updateCredential", { companyId: "c1", credentialId: "cr1", validTo: day }), false, String(day));
  }
});


test("setThreadCompany: PATCH the thread; its answer names the company; no thread → a note, no call", async () => {
  const set = await toolSet();
  assert.equal(await refuses(set, "setThreadCompany", { companyId: "c1", threadId: "t9" }), true, "the thread is never the model's choice");
  assert.deepEqual(await call(set, "setThreadCompany", { companyId: "c1" }), { linked: true, companyId: "c1", companyName: "UAB Kripto" });
  assert.deepEqual(stub.requests.at(-1).body, { companyId: "c1" });
  await assert.rejects(call(set, "setThreadCompany", { companyId: "c-hidden" }), { code: "NOT_FOUND" });
  stub.requests.length = 0;
  assert.deepEqual(await call(await toolSet({ threadId: null }), "setThreadCompany", { companyId: "c1" }),
                   { linked: false, note: "This conversation has no persistent thread yet." });
  assert.equal(stub.requests.length, 0);
});


test("addCredential: a same kind + name credential is updated, anything else created; the row the model reads", async () => {
  const set = await toolSet();
  const refused = [
    { companyId: "c1", kind: "diploma", name: "x" }, { companyId: "c1", kind: "license" }, { companyId: "c1", kind: "license", name: "" },
    { companyId: "c1", kind: "license", name: "x", validTo: "2027-1-1" }, { companyId: "c1", kind: "license", name: "x", status: "trusted" },
    { companyId: "c1", kind: "license", name: "x", scope: "s".repeat(4_001) }, { kind: "license", name: "x" },
  ];
  for (const input of refused) assert.equal(await refuses(set, "addCredential", input), true, JSON.stringify(input));

  const same = await call(set, "addCredential", { companyId: "c1", kind: "license", name: "casp  LEIDIMAS", identifier: "LB-1" });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["GET /api/companies/c1/credentials", "PATCH /api/companies/c1/credentials/cr1"]);
  assert.deepEqual(stub.requests[1].body, { kind: "license", name: "casp  LEIDIMAS", identifier: "LB-1" }, "no companyId in the body");
  assert.equal(same.updatedExisting, true);
  assert.equal(same.credential.identifier, "LB-1");

  stub.requests.length = 0;
  const otherKind = await call(set, "addCredential", { companyId: "c1", kind: "permit", name: "CASP leidimas", validTo: "2027-01-01",
                                                        evidenceDocumentId: "d1" });
  assert.equal(otherKind.updatedExisting, false, "another kind is another credential");
  assert.deepEqual([stub.requests[1].method, stub.requests[1].path], ["POST", "/api/companies/c1/credentials"]);
  assert.deepEqual(otherKind.credential, { id: "cr-new", kind: "permit", name: "CASP leidimas", issuer: null, identifier: null,
    validFrom: null, validTo: "2027-01-01", status: "claimed", evidenceDocumentId: "d1", scope: undefined, notes: undefined });
  await assert.rejects(call(set, "addCredential", { companyId: "gone", kind: "license", name: "x" }), { code: "NOT_FOUND" });
  assertAsUser(stub.requests);
});


test("addCredential on a credential that exists completes it: nothing is emptied and a verification is not withdrawn", async () => {
  const set = await toolSet();
  Object.assign(state.credentials.c1[0], { issuer: "Lietuvos bankas", identifier: "LB-123", status: "verified" });
  const again = await call(set, "addCredential", { companyId: "c1", kind: "license", name: "CASP leidimas", issuer: null,
                                                   identifier: "", status: "claimed", scope: "Saugojimas", validTo: null });
  assert.deepEqual(stub.requests.at(-1).body, { kind: "license", name: "CASP leidimas", scope: "Saugojimas" },
                   "nulls, empty texts and the default status are not sent over what is recorded");
  assert.deepEqual([again.credential.issuer, again.credential.identifier, again.credential.status, again.updatedExisting],
                   ["Lietuvos bankas", "LB-123", "verified", true]);
  await call(set, "addCredential", { companyId: "c1", kind: "license", name: "CASP leidimas", status: "verified" });
  assert.equal(stub.requests.at(-1).body.status, "verified", "verifying is still said this way, on the user's word");
});


test("addCredential with an evidence document not yet the company's: tried again, then recorded without the link — never not at all", async () => {
  const set = await toolSet();
  const post = stub.routes["POST /api/companies/[^/]+/credentials"];
  const refusal = { status: 400, json: { error: "evidenceDocumentId must be one of this company's documents", code: "INVALID_FIELD" } };
  const input = { companyId: "c1", kind: "permit", name: "Leidimas", evidenceDocumentId: "d-new" };

  // The document is attached by another call of the same step: the second try finds it
  let refusals = 1;
  stub.routes["POST /api/companies/[^/]+/credentials"] = (body, request, url) => (refusals-- > 0 ? refusal : post(body, request, url));
  stub.requests.length = 0;
  const linked = await call(set, "addCredential", input);
  assert.deepEqual(stub.requests.filter((r) => r.method === "POST").map((r) => r.body.evidenceDocumentId), ["d-new", "d-new"]);
  assert.equal(linked.credential.evidenceDocumentId, "d-new");
  assert.equal("note" in linked, false);

  // It never becomes the company's: the credential is recorded all the same, and the answer says what is missing
  stub.routes["POST /api/companies/[^/]+/credentials"] = (body, request, url) => (body.evidenceDocumentId ? refusal : post(body, request, url));
  stub.requests.length = 0;
  const unlinked = await call(set, "addCredential", { ...input, name: "Kitas leidimas" });
  assert.deepEqual(stub.requests.filter((r) => r.method === "POST").map((r) => r.body.evidenceDocumentId), ["d-new", "d-new", undefined]);
  assert.equal(unlinked.credential.name, "Kitas leidimas");
  assert.match(unlinked.note, /^Recorded without its evidence document/);

  // Any other refusal is the model's to read at once
  stub.routes["POST /api/companies/[^/]+/credentials"] = () => ({ status: 400, json: { error: "validTo: not a date", code: "INVALID_FIELD" } });
  stub.requests.length = 0;
  await assert.rejects(call(set, "addCredential", { ...input, name: "Trečias leidimas" }), { code: "INVALID_FIELD" });
  assert.equal(stub.requests.filter((r) => r.method === "POST").length, 1);
});


test("updateCompany keeps the members of attributes and financialMarket it is not given", async () => {
  const set = await toolSet();
  Object.assign(state.companies[0], {
    attributes: { groupStructure: "Patronuojanti įmonė LV", branches: ["EE"], inferred: { country: { value: "LT", reason: "F00 §3.2" } } },
    financialMarket: { markets: ["Kriptoturto rinka"], serviceCategory: "Saugojimas", verified: false },
  });
  stub.requests.length = 0;
  await call(set, "updateCompany", {
    companyId: "c1", employees: 40,
    attributes: { branches: null, headcount: { security: 5 }, inferred: { sizeCategory: { value: "small", reason: "40 darbuotojų" } } },
    financialMarket: { legalBasis: "MiCA 59 str.", verified: true },
  });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["GET /api/companies/c1", "PUT /api/companies/c1"],
                   "what is recorded is read first: Django replaces an object field whole");
  assert.deepEqual(stub.requests[1].body, {
    employees: 40,
    attributes: {
      groupStructure: "Patronuojanti įmonė LV", headcount: { security: 5 },
      inferred: { country: { value: "LT", reason: "F00 §3.2" }, sizeCategory: { value: "small", reason: "40 darbuotojų" } },
    },
    financialMarket: { markets: ["Kriptoturto rinka"], serviceCategory: "Saugojimas", legalBasis: "MiCA 59 str.", verified: true },
  }, "the members not given stay, the one given as null goes, inferred reasons add up");
  stub.requests.length = 0;
  await call(set, "updateCompany", { companyId: "c1", sector: "Finansai" });
  assert.deepEqual(stub.requests.map((r) => r.method), ["PUT"], "no object field given: nothing is read first");
});


test("updateCredential / removeCredential: exact paths, only the changed fields, Django's 404", async () => {
  const set = await toolSet();
  assert.equal(await refuses(set, "updateCredential", { companyId: "c1", status: "verified" }), true, "the credential id is required");
  const verified = await call(set, "updateCredential", { companyId: "c1", credentialId: "cr1", status: "verified", issuer: null });
  assert.deepEqual([stub.requests.at(-1).method, stub.requests.at(-1).path, stub.requests.at(-1).body],
                   ["PATCH", "/api/companies/c1/credentials/cr1", { status: "verified", issuer: null }]);
  assert.equal(verified.credential.status, "verified");
  assert.equal(verified.credential.issuer, null);

  assert.deepEqual(await call(set, "removeCredential", { companyId: "c1", credentialId: "cr1" }), { removed: true, credentialId: "cr1" });
  assert.deepEqual([stub.requests.at(-1).method, stub.requests.at(-1).path, stub.requests.at(-1).body], ["DELETE", "/api/companies/c1/credentials/cr1", null]);
  await assert.rejects(call(set, "removeCredential", { companyId: "c1", credentialId: "cr1" }),
                       { message: "[NOT_FOUND] removeCredential failed (HTTP 404): Credential not found" });
  await assert.rejects(call(set, "removeCredential", { companyId: "c1", credentialId: "cr1/../../c1" }), { code: "NOT_FOUND" });
  assert.equal(stub.requests.at(-1).path, "/api/companies/c1/credentials/cr1%2F..%2F..%2Fc1", "a slash cannot climb");
  assertAsUser(stub.requests);
});


test("setCompanyStandard / removeCompanyStandard: named as people name it, the latest edition, one record each", async () => {
  const set = await toolSet();
  for (const input of [{ companyId: "c1", standard: "ISO 27001" }, { companyId: "c1", standard: "ISO 27001", status: "done" },
                       { companyId: "c1", standard: "", status: "planned" },
                       { companyId: "c1", standard: "ISO 27001", status: "planned", documentId: "iso-9001" }]) {
    assert.equal(await refuses(set, "setCompanyStandard", input), true, JSON.stringify(input));
  }
  const created = await call(set, "setCompanyStandard", { companyId: "c1", standard: "ISO 27001", status: "certified",
                                                          scope: "IT paslaugos", certificateId: "cr1" });
  assert.deepEqual([stub.requests.at(-1).method, stub.requests.at(-1).path, stub.requests.at(-1).body],
                   ["POST", "/api/companies/c1/standards",
                    { documentId: "iso-27001-2022", status: "certified", scope: "IT paslaugos", certificateId: "cr1" }],
                   "no year given: the latest edition");
  assert.deepEqual(created, { created: true, standard: {
    id: "s-iso-27001-2022", documentId: "iso-27001-2022", standard: "ISO/IEC 27001:2022",
    title: "Information security management systems", status: "certified", scope: "IT paslaugos", certificateId: "cr1",
    notes: undefined, ready: true } });

  const updated = await call(set, "setCompanyStandard", { companyId: "c1", standard: "iso/iec 27001:2022", status: "implementing" });
  assert.deepEqual([stub.requests.at(-1).method, stub.requests.at(-1).path, stub.requests.at(-1).body],
                   ["PATCH", "/api/companies/c1/standards/s-iso-27001-2022", { status: "implementing" }], "the same standard again");
  assert.equal(updated.created, false);
  await call(set, "setCompanyStandard", { companyId: "c1", standard: "ISO 27001:2013", status: "planned" });
  assert.equal(stub.requests.at(-1).body.documentId, "iso-27001-2013", "a year names its edition");
  await assert.rejects(call(set, "setCompanyStandard", { companyId: "c1", standard: "ISO 14001", status: "planned" }), {
    name: "ToolFailure",
    message: "[UNKNOWN_STANDARD] setCompanyStandard failed: the corpus holds no standard \"ISO 14001\" (it holds: "
      + "ISO/IEC 27001:2022, ISO/IEC 27001:2013, ISO 9001:2015) — an admin uploads standards on the corpus page",
  });
  const profile = await call(set, "getCompany", { companyId: "c1" });
  assert.deepEqual(profile.standards.map((a) => [a.standard, a.status]),
                   [["ISO/IEC 27001:2022", "implementing"], ["ISO/IEC 27001:2013", "planned"]]);

  assert.deepEqual(await call(set, "removeCompanyStandard", { companyId: "c1", adoptionId: "s-iso-27001-2013" }),
                   { removed: true, adoptionId: "s-iso-27001-2013" });
  assert.deepEqual([stub.requests.at(-1).method, stub.requests.at(-1).path, stub.requests.at(-1).body],
                   ["DELETE", "/api/companies/c1/standards/s-iso-27001-2013", null]);
  await assert.rejects(call(set, "removeCompanyStandard", { companyId: "c1", adoptionId: "s-iso-27001-2013" }),
                       { message: "[NOT_FOUND] removeCompanyStandard failed (HTTP 404): Standard not found" });
  assertAsUser(stub.requests);
});


test("setCompanyStandard: an adoption's other year, another publisher's number, a name without a number", async () => {
  state.corpus = [
    { id: "lst-27001", shortTitle: "LST EN ISO/IEC 27001:2023", title: "Informacijos saugumo valdymo sistemos", docType: "standard" },
    { id: "etsi-645", shortTitle: "ETSI EN 303 645 V2.1.1", title: "Cyber Security for Consumer Internet of Things", docType: "standard" },
    { id: "pci", shortTitle: "PCI DSS v4.0.1", title: "Payment Card Industry Data Security Standard", docType: "standard" },
  ];
  const set = await toolSet();
  for (const [standard, id] of [["ISO/IEC 27001:2022", "lst-27001"], ["EN 303 645", "etsi-645"], ["PCI DSS", "pci"],
                                ["Payment Card Industry", "pci"]]) {
    state.standards.c1 = [];
    await call(set, "setCompanyStandard", { companyId: "c1", standard, status: "planned" });
    assert.equal(stub.requests.at(-1).body.documentId, id, standard);
  }
  await assert.rejects(call(set, "setCompanyStandard", { companyId: "c1", standard: "ISO 9001", status: "planned" }),
                       { code: "UNKNOWN_STANDARD" });
});


test("setCompanyStandard: two editions of the same year are asked about, never guessed", async () => {
  state.corpus.push({ id: "lst-27001", shortTitle: "LST EN ISO/IEC 27001:2022", title: "Lietuvos standartas", docType: "standard" });
  const set = await toolSet();
  await assert.rejects(call(set, "setCompanyStandard", { companyId: "c1", standard: "ISO 27001", status: "planned" }),
                       { code: "AMBIGUOUS_STANDARD" });
  assert.ok(!stub.requests.some((r) => r.method === "POST"), "nothing recorded");
});


test("listRoles / saveRole / setThreadRole: full profiles, a same-name role updated, the thread adopts it", async () => {
  const set = await toolSet();
  const listed = await call(set, "listRoles", { companyId: "c1" });
  assert.deepEqual(listed.roles[0], { id: "r-aml", name: "AML pareigūnas", context: "A".repeat(500),
                                      sources: [{ documentId: "d1", section: "9.1" }], updatedAt: "2026-09-27" }, "the whole block");
  const titled = { title: "AML politika" };
  for (const input of [{ companyId: "c1", name: "x", sources: [] }, { companyId: "c1", name: "x", context: "c".repeat(6_001), sources: [] },
                       { companyId: "c1", name: "", context: "c", sources: [] },
                       { companyId: "c1", name: "x", context: "c", sources: [{ ...titled, url: "http://x" }] },
                       { companyId: "c1", name: "x", context: "c", sources: Array(51).fill(titled) },
                       // The sources are said, and each names its document
                       { companyId: "c1", name: "x", context: "c" }, { companyId: "c1", name: "x", context: "c", sources: [{}] },
                       { companyId: "c1", name: "x", context: "c", sources: [{ section: "§5" }] },
                       { companyId: "c1", name: "x", context: "c", sources: [{ documentId: "d1", section: "§5" }] },
                       { companyId: "c1", name: "x", context: "c", sources: [{ title: "" }] }]) {
    assert.equal(await refuses(set, "saveRole", input), true, JSON.stringify(input).slice(0, 80));
  }
  stub.requests.length = 0;
  const updated = await call(set, "saveRole", { companyId: "c1", name: "aml  PAREIGŪNAS", context: "Naujos pareigos", sources: [] });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["GET /api/companies/c1/roles", "PATCH /api/companies/c1/roles/r-aml"]);
  assert.deepEqual(stub.requests[1].body, { name: "aml  PAREIGŪNAS", context: "Naujos pareigos", sources: [] },
                   "the sources always go along: saving a role replaces them, so none of an older text is left beside a new one");
  assert.equal(updated.created, false);
  const created = await call(set, "saveRole", { companyId: "c1", name: "Atitikties pareigūnas", context: "Pareigos",
                                                sources: [{ documentId: "d1", title: "AML politika", section: "2" }] });
  assert.equal(created.created, true);
  assert.deepEqual(stub.requests.at(-1).body.sources, [{ documentId: "d1", title: "AML politika", section: "2" }]);
  const titleOnly = await call(set, "saveRole", { companyId: "c1", name: "Rizikos pareigūnas", context: "Pareigos",
                                                  sources: [{ title: "F01-governance-accountability.md", section: "§5" }] });
  assert.equal(titleOnly.created, true, "a title alone names the document: Django completes the id");
  await assert.rejects(call(set, "saveRole", { companyId: "c1", name: "Race", context: "x", sources: [] }), { code: "DUPLICATE_NAME" });

  await call(set, "setThreadCompany", { companyId: "c1" });
  assert.deepEqual(await call(set, "setThreadRole", { roleId: "r-aml" }), { roleId: "r-aml", roleName: "aml  PAREIGŪNAS" });
  assert.deepEqual(stub.requests.at(-1).body, { roleId: "r-aml" });
  assert.deepEqual(await call(set, "setThreadRole", { roleId: null }), { roleId: null, roleName: null }, "null clears");
  assert.deepEqual(stub.requests.at(-1).body, { roleId: null });
  await assert.rejects(call(set, "setThreadRole", { roleId: "r-of-another-company" }), { code: "NOT_FOUND" });
  assert.equal(await refuses(set, "setThreadRole", {}), true, "roleId must be given (null to clear)");
  assert.deepEqual(await call(await toolSet({ threadId: null }), "setThreadRole", { roleId: "r-aml" }),
                   { linked: false, note: "This conversation has no persistent thread yet." });
  assertAsUser(stub.requests);
});


test("an unreachable Django is DJANGO_UNREACHABLE for the model, never a crash", async () => {
  const set = await toolSet();
  const saved = process.env.DJANGO_URL;
  process.env.DJANGO_URL = "http://127.0.0.1:9";
  try {
    await assert.rejects(call(set, "listCompanies", {}),
                         { name: "ToolFailure", message: "[DJANGO_UNREACHABLE] listCompanies failed (HTTP 502): Backend unreachable" });
  } finally {
    process.env.DJANGO_URL = saved;
  }
});
