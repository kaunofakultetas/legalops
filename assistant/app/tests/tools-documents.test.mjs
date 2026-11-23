// -----------------------------------------------------------
//  [*] Tests — the document tools (llm/tools/documents.js)
//
//  The four document tools against a Django stub that answers
//  as companies/api/document_views.py does, with a real 45 000
//  character text the /text route windows by offset and limit
//  and the detail route's outline. readDocument gets the whole
//  walk: the first window, the offsets to the end, and the jump
//  to a heading.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-15 — an admin's chat listed all uploads
//    ASSISTANT-LLM-16 — section "§" jumped to the first heading
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { assertAsUser, call, refuses, startToolStub, toolSet } from "./helpers/toolKit.mjs";


// The extracted text of d1: 45 000 characters, a marker every
// 1000 so a window can be checked by its first characters
const TEXT = Array.from({ length: 45 }, (_, i) => `[${String(i * 1000).padStart(5, "0")}]`.padEnd(1_000, ".")).join("");

// d1's outline as build_outline stores it
const OUTLINE = [
  { title: "1. Bendrosios nuostatos", level: 1, offset: 0 },
  { title: "9. Rizikos valdymas", level: 1, offset: 20_000 },
  { title: "9.1. Rizikos vertinimas", level: 2, offset: 21_000 },
  { title: "9.10. Rizikos vertinimo peržiūra", level: 2, offset: 30_000 },
  { title: "Priedas Nr. 1 — Klientų rizikos veiksniai", level: 1, offset: 40_000 },
];

// d1 as the list and detail routes serialize it
const DOCUMENT = {
  id: "d1", ownerId: "u1", companyId: "c1", title: "AML politika", kind: "policy", mime: "application/pdf", size: 123_456,
  sha256: "abc", charCount: TEXT.length, extractionStatus: "done", extractionError: null, indexedAt: "x",
  uploadedAt: "2026-09-20T10:00:00+00:00", documentType: "policy", inventorySummary: "S".repeat(700),
};

let stub;







// -----------------------------------------------------------
// textWindow
// -----------------------------------------------------------
//
// Django's text route over TEXT: the requested slice, or its
// 400 when the offset or the limit is not a whole number in
// range (offset up to 2 000 000 000, limit 1 to 100 000).
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function textWindow(_body, _req, url) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 20_000);
  if (!Number.isInteger(offset) || offset < 0 || offset > 2_000_000_000 || !Number.isInteger(limit) || limit < 1 || limit > 100_000) {
    return { status: 400, json: { error: "offset must be ≥ 0 and limit 1..100000", code: "INVALID_QUERY" } };
  }
  return { json: { id: "d1", title: "AML politika", offset, limit, total: TEXT.length, extractionStatus: "done",
                   text: TEXT.slice(offset, offset + limit) } };
}


before(async () => {
  stub = await startToolStub();
});

beforeEach(() => {
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, {
    "GET /api/documents": (_b, _r, url) => ({ json: {
      documents: url.searchParams.get("q") === "none" ? [] : [DOCUMENT, { ...DOCUMENT, id: "d2", companyId: null, inventorySummary: null,
                                                                          documentType: null, extractionStatus: "failed", charCount: 0 }],
      total: 2 } }),
    "GET /api/documents/search": (_b, _r, url) => (!url.searchParams.get("q")
      ? { status: 400, json: { error: "q is required (at most 1000 characters)", code: "INVALID_QUERY" } }
      : { json: { hits: [
        { documentId: "d1", title: "AML politika", companyId: "c1", chunkId: "k1", heading: "9.1. Rizikos vertinimas", charStart: 21_000,
          text: "R".repeat(2_000), score: 0.8 },
        { documentId: "d2", title: "Procedūra", companyId: null, chunkId: "k2", heading: null, charStart: 0, text: "short", score: 0.4 },
      ] } }),
    "GET /api/documents/d1": () => ({ json: { ...DOCUMENT, outline: OUTLINE, inventory: { summary: "S" } } }),
    "GET /api/documents/empty": () => ({ json: { ...DOCUMENT, id: "empty", outline: [], extractionStatus: "empty", charCount: 0 } }),
    "GET /api/documents/empty/text": () => ({ json: { id: "empty", title: "Skenuota", offset: 0, limit: 20_000, total: 0,
                                                      extractionStatus: "empty", text: "" } }),
    "GET /api/documents/big": () => ({ json: { ...DOCUMENT, id: "big",
      outline: Array.from({ length: 150 }, (_, i) => ({ title: `${i}. ${"H".repeat(200)}`, offset: i * 10 })) } }),
    "GET /api/documents/big/text": textWindow,
    "GET /api/documents/d1/text": textWindow,
    "PATCH /api/documents/d1": (body) => (body.companyId === "c-hidden"
      ? { status: 404, json: { error: "Company not found", code: "NOT_FOUND" } }
      : { json: { ...DOCUMENT, ...(body.title ? { title: body.title } : {}), ...(body.kind ? { kind: body.kind } : {}),
                  companyId: body.companyId } }),
  });
});

after(async () => { await stub.close(); });


test("listDocuments: the user's OWN uploads, paged, compact rows (ASSISTANT-LLM-15, FIXED)", async () => {
  const set = await toolSet();
  const all = { companyId: null };
  const refused = [{ ...all, limit: 0 }, { ...all, limit: 101 }, { ...all, offset: -1 }, { ...all, limit: 2.5 },
                   { ...all, query: "q".repeat(201) }, { ...all, scope: "all" }, { ...all, ownerId: "u2" }, { companyId: "" },
                   // Whose documents is always said: one company's, or null for all of the user's
                   {}];
  for (const input of refused) assert.equal(await refuses(set, "listDocuments", input), true, JSON.stringify(input));
  const listed = await call(set, "listDocuments", all);
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].query],
                   ["GET", "/api/documents", { scope: "own", limit: "50", offset: "0" }], "an admin's chat lists only their own uploads");
  assert.deepEqual(listed.documents[0], {
    id: "d1", title: "AML politika", kind: "policy", companyId: "c1", charCount: 45_000, extractionStatus: "done",
    documentType: "policy", summary: `${"S".repeat(300)} …[truncated]`, uploadedAt: "2026-09-20T10:00:00+00:00",
  }, "no owner, hash, size or mime");
  assert.deepEqual([listed.documents[1].companyId, listed.documents[1].summary, listed.documents[1].documentType], [null, null, null]);
  assert.equal(listed.total, 2);
  await call(set, "listDocuments", { companyId: "c1", query: "AML & KYC", limit: 100, offset: 200 });
  assert.deepEqual(stub.requests[1].query, { companyId: "c1", q: "AML & KYC", limit: "100", offset: "200" },
                   "one company's list is the company's documents, not only the caller's uploads");
  assert.deepEqual(await call(set, "listDocuments", { companyId: null, query: "none" }), { documents: [], total: 2 });
  assertAsUser(stub.requests);
});


test("readDocument: the schema's bounds", async () => {
  const set = await toolSet();
  const refused = [{}, { documentId: "" }, { documentId: "d1", limit: 999 }, { documentId: "d1", limit: 100_001 }, { documentId: "d1", offset: -1 },
                   { documentId: "d1", offset: 1.5 }, { documentId: "d1", section: "" }, { documentId: "d1", section: "s".repeat(201) },
                   { documentId: "d1", page: 2 }];
  for (const input of refused) assert.equal(await refuses(set, "readDocument", input), true, JSON.stringify(input));
  for (const input of [{ documentId: "d1", limit: 1_000 }, { documentId: "d1", limit: 100_000 }, { documentId: "d1", offset: 0 }]) {
    assert.equal(await refuses(set, "readDocument", input), false, JSON.stringify(input));
  }
});


test("readDocument: the first window carries the outline and the inventory; the walk continues by nextOffset to the end", async () => {
  const set = await toolSet();
  const first = await call(set, "readDocument", { documentId: "d1" });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path} ${JSON.stringify(r.query)}`), [
    "GET /api/documents/d1 {}", "GET /api/documents/d1/text {\"offset\":\"0\",\"limit\":\"20000\"}",
  ]);
  assert.deepEqual(Object.keys(first), ["documentId", "title", "extractionStatus", "total", "offset", "nextOffset", "outline",
                                        "documentType", "summary", "text"]);
  assert.deepEqual([first.offset, first.nextOffset, first.total, first.text.length], [0, 20_000, 45_000, 20_000]);
  assert.equal(first.text.slice(0, 7), "[00000]");
  assert.deepEqual(first.outline[2], { title: "9.1. Rizikos vertinimas", level: 2, offset: 21_000 });
  assert.equal(first.summary, `${"S".repeat(500)} …[truncated]`);
  assert.equal(first.documentType, "policy");

  stub.requests.length = 0;
  const second = await call(set, "readDocument", { documentId: "d1", offset: first.nextOffset });
  assert.deepEqual(stub.requests.map((r) => r.path), ["/api/documents/d1/text"], "a later window skips the detail route");
  assert.equal(second.outline, undefined);
  assert.equal(second.text.slice(0, 7), "[20000]");
  const last = await call(set, "readDocument", { documentId: "d1", offset: second.nextOffset });
  assert.deepEqual([last.offset, last.text.length, last.nextOffset], [40_000, 5_000, null], "the end says so");
  const past = await call(set, "readDocument", { documentId: "d1", offset: 90_000 });
  assert.deepEqual([past.text, past.nextOffset], ["", null], "past the end: empty, and no next window");
  const small = await call(set, "readDocument", { documentId: "d1", offset: 44_500, limit: 1_000 });
  assert.equal(small.text.length, 500);
  const zero = await call(set, "readDocument", { documentId: "d1", offset: 0, limit: 5_000 });
  assert.ok(zero.outline, "offset 0 is a first window");
  assert.equal(zero.nextOffset, 5_000);
  assertAsUser(stub.requests);
});


test("readDocument: a section jump — exact, § prefix, prefix, contained, any case — opens at the heading's offset", async () => {
  const set = await toolSet();
  const jumps = [
    ["9.1. Rizikos vertinimas", 21_000], ["9.1", 21_000], ["§ 9.1", 21_000], ["§9.10", 30_000], ["rizikos VERTINIMO", 30_000],
    ["Priedas nr. 1", 40_000], ["klientų rizikos", 40_000], ["  9.   Rizikos   valdymas ", 20_000],
  ];
  for (const [section, offset] of jumps) {
    stub.requests.length = 0;
    const jump = await call(set, "readDocument", { documentId: "d1", section });
    assert.equal(jump.offset, offset, section);
    assert.equal(jump.section.offset, offset);
    assert.equal(stub.requests.at(-1).query.offset, String(offset));
    assert.equal(jump.text.slice(0, 7), `[${String(offset).padStart(5, "0")}]`);
    assert.equal(jump.outline, undefined, "a jump answers text, not the outline again");
  }
  const first = await call(set, "readDocument", { documentId: "d1", section: "9.1", offset: 5 });
  assert.equal(first.offset, 21_000, "a section wins over an offset");
});


test("readDocument: a heading that is not there answers the outline instead — no text read (ASSISTANT-LLM-16, FIXED)", async () => {
  const set = await toolSet();
  for (const section of ["42", "§", "§  ", " "]) {
    stub.requests.length = 0;
    const missing = await call(set, "readDocument", { documentId: "d1", section });
    assert.deepEqual(Object.keys(missing), ["documentId", "title", "sectionNotFound", "outline"], section);
    assert.equal(missing.sectionNotFound, section);
    assert.equal(missing.outline.length, 5);
    assert.deepEqual(stub.requests.map((r) => r.path), ["/api/documents/d1"], `${JSON.stringify(section)}: no text request`);
  }
});


test("readDocument: a long outline is capped (120 headings, 150-character titles); an empty extraction says so", async () => {
  const set = await toolSet();
  const big = await call(set, "readDocument", { documentId: "big" });
  assert.equal(big.outline.length, 120);
  assert.equal(big.outline[0].title, `0. ${"H".repeat(147)} …[truncated]`);
  assert.deepEqual([big.outline[5].level, big.outline[5].offset], [1, 50], "a missing level reads 1");
  const empty = await call(set, "readDocument", { documentId: "empty" });
  assert.deepEqual([empty.extractionStatus, empty.text, empty.total, empty.nextOffset], ["empty", "", 0, null]);
  await assert.rejects(call(set, "readDocument", { documentId: "gone" }), { message: "[NOT_FOUND] readDocument failed (HTTP 404): Not found" });
  await assert.rejects(call(set, "readDocument", { documentId: "d1", offset: 3_000_000_000 }),
                       { message: "[INVALID_QUERY] readDocument failed (HTTP 400): offset must be ≥ 0 and limit 1..100000" });
});


test("searchCompanyDocuments: one GET with the filters given (own uploads when unfiltered); hits with a ready citation and capped text", async () => {
  const set = await toolSet();
  const all = { companyId: null };
  const refused = [{}, { ...all, query: "" }, { ...all, query: "q".repeat(1_001) }, { ...all, query: "q", k: 31 },
                   { ...all, query: "q", documentIds: Array(51).fill("d") }, { ...all, query: "q", documentIds: [""] },
                   { ...all, query: "q", scope: "all" },
                   // Whose documents is always said: a search without it also read other companies' documents
                   { query: "q" }];
  for (const input of refused) assert.equal(await refuses(set, "searchCompanyDocuments", input), true, JSON.stringify(input).slice(0, 60));
  const found = await call(set, "searchCompanyDocuments", { query: "rizikos vertinimas", companyId: null });
  assert.deepEqual([stub.requests[0].path, stub.requests[0].query], ["/api/documents/search", { q: "rizikos vertinimas", k: "8", scope: "own" }],
                   "an unfiltered search is the user's own uploads, like the list");
  assert.deepEqual(found.hits, [
    { documentId: "d1", title: "AML politika", companyId: "c1", heading: "9.1. Rizikos vertinimas", charStart: 21_000,
      cite: "AML politika §9.1. Rizikos vertinimas", text: `${"R".repeat(1_500)} …[truncated]`, score: 0.8 },
    { documentId: "d2", title: "Procedūra", companyId: null, heading: null, charStart: 0, cite: "Procedūra", text: "short", score: 0.4 },
  ]);
  await call(set, "searchCompanyDocuments", { query: "KYC", companyId: "c1", documentIds: ["d1", "d2"], k: 30 });
  assert.deepEqual(stub.requests[1].query, { q: "KYC", companyId: "c1", k: "30", documentIds: "d1,d2" });
  await call(set, "searchCompanyDocuments", { query: "KYC", companyId: null, documentIds: [] });
  assert.deepEqual(stub.requests[2].query, { q: "KYC", k: "8", scope: "own" }, "an empty list is no filter");
  await call(set, "searchCompanyDocuments", { query: "KYC", companyId: null, documentIds: ["d9"] });
  assert.deepEqual(stub.requests[3].query, { q: "KYC", k: "8", documentIds: "d9" }, "named documents are searched whoever uploaded them");
  assertAsUser(stub.requests);
});


test("attachDocument: PATCH with the given fields (null detaches); the row back; Django's refusal", async () => {
  const set = await toolSet();
  const refused = [{ documentId: "d1", kind: "policy" }, { documentId: "d1", companyId: "c1", kind: "memo" },
                   { documentId: "d1", companyId: "c1", kind: "policy", title: "" },
                   { documentId: "d1", companyId: "c1", kind: "policy", ownerId: "u2" },
                   // A document is filed with its kind: left out, it stayed "other" and no check of the company's own rules read it
                   { documentId: "d1", companyId: "c1" }];
  for (const input of refused) assert.equal(await refuses(set, "attachDocument", input), true, JSON.stringify(input));
  const attached = await call(set, "attachDocument", { documentId: "d1", companyId: "c1", title: "AML politika v2", kind: "procedure" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].body],
                   ["PATCH", "/api/documents/d1", { companyId: "c1", title: "AML politika v2", kind: "procedure" }]);
  assert.equal(attached.title, "AML politika v2");
  assert.equal(attached.kind, "procedure");
  assert.equal("ownerId" in attached, false);
  const detached = await call(set, "attachDocument", { documentId: "d1", companyId: null, kind: "procedure" });
  assert.deepEqual(stub.requests[1].body, { companyId: null, kind: "procedure" });
  assert.equal(detached.companyId, null);
  await assert.rejects(call(set, "attachDocument", { documentId: "d1", companyId: "c-hidden", kind: "policy" }), { code: "NOT_FOUND" });
  assertAsUser(stub.requests);
});
