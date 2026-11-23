// -----------------------------------------------------------
//  [*] Tests — the legal corpus tools (llm/tools/corpus.js)
//
//  The five corpus tools against a Django stub that answers in
//  the exact shapes of corpus/search.py, corpus/citations.py,
//  the catalogue serializer and the obligations register. The results carry the citation
//  block ToolCards.jsx renders as chips and the verdict rows of
//  a check, so their fields are pinned key by key.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-14 — the judge's note lost, a field invented
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { assertAsUser, call, refuses, startToolStub, toolSet } from "./helpers/toolKit.mjs";


// One search hit as corpus/search.py serializes it
const HIT = {
  chunkId: "ch1", unitId: "u59", documentId: "doc-mica", documentSlug: "mica", documentTitle: "Reglamentas (ES) 2023/1114",
  shortTitle: "MiCA", jurisdiction: "EU", docType: "regulation", path: "59 str. 1 d.",
  heading: "Kriptoturto paslaugų teikėjų leidimas", text: "T".repeat(2_000), sourceUrl: "https://eur-lex.europa.eu/eli/reg/2023/1114", score: 0.91234,
  citationUrl: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32023R1114#art_59",
};

// find_provision's answer
const PROVISION = {
  unitId: "u59", documentId: "doc-mica", documentSlug: "mica", documentTitle: "Reglamentas (ES) 2023/1114", shortTitle: "MiCA",
  externalId: "32023R1114", jurisdiction: "EU", docType: "regulation", language: "lt", unitType: "article", path: "59 str.",
  heading: "Leidimas",
  text: "P".repeat(25_000), versionNo: 3, versionDate: "2024-12-30", sourceUrl: "https://src", citationUrl: "",
};

// A catalogue row as corpus/serializers.py serializes it
const ACT = {
  id: "doc-mica", slug: "mica", title: "Reglamentas (ES) 2023/1114", titleEn: "MiCA", shortTitle: "MiCA", jurisdiction: "EU",
  docType: "regulation", sourceKind: "cellar", externalId: "32023R1114", sourceUrl: "https://src", language: "lt",
  domains: ["crypto"], appliesTo: ["casp"], applicabilityNotes: "admin notes", status: "in_force", enabled: true,
  currentVersion: { id: "v3", versionNo: 3, status: "ready", effectiveDate: "2024-12-30", error: null, charCount: 1, embedModel: "m" },
  lastCheckedAt: "x", lastError: "an ingest trace", createdAt: "x", updatedAt: "x", obligationCount: 120,
};

// An obligation as corpus/api/obligation_views.py serializes it
const OBLIGATION = {
  id: "ob1", sourceKind: "legal", documentId: "doc-mica", documentTitle: "MiCA", versionId: "v3", unitId: "u70",
  title: "Atskirti klientų kriptoturtą", titleEn: "Segregate client crypto-assets", text: "T".repeat(600), textEn: "E".repeat(600),
  addressee: "Kriptoturto paslaugų teikėjas", conditions: "C".repeat(350), appliesTo: ["casp"], category: "safeguarding",
  evidence: "V".repeat(250), deadline: "nuolat", severity: "critical",
  citations: [{ unitId: "u70", path: "70 str. 1 d." }, { path: "70 str. 2 d." }, { path: "75 str." }, { path: "76 str." }, { unitId: "x" }],
  status: "proposed", model: "gateway:azure/gpt-6.1-sol", notes: "admin notes", reviewedBy: null, reviewedAt: null, createdAt: "x", updatedAt: "x",
};

let stub;







// -----------------------------------------------------------
// checkResults
// -----------------------------------------------------------
//
// check_citations' answer for a request's items, in its exact
// keys. The verdicts cycle through a found citation with the
// judge's mismatch note, a found match, a not_found and an
// act_not_in_corpus.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function checkResults(items) {
  const verdicts = [
    { status: "found", documentId: "doc-mica", unitId: "u74", shortTitle: "MiCA", path: "74 str.", heading: "Pranešimai",
      excerpt: "E".repeat(900), citationUrl: "https://eur-lex/#art_74", headingMatch: "mismatch",
      note: "Article 74 is about notifications, not the RTO — see Article 72." },
    { status: "found", documentId: "doc-mica", unitId: "u59", shortTitle: "MiCA", path: "59 str.", heading: "Leidimas",
      excerpt: "Kriptoturto…", citationUrl: "https://eur-lex/#art_59", headingMatch: "match", note: "" },
    { status: "not_found", documentId: "doc-mica", shortTitle: "MiCA" },
    { status: "act_not_in_corpus" },
  ];
  return items.map((item, i) => ({
    act: item.act, article: item.article, paragraph: item.paragraph ?? null, point: item.point ?? null,
    claimedHeading: item.claimedHeading ?? null, ...verdicts[i % verdicts.length],
  }));
}


before(async () => {
  stub = await startToolStub();
});

beforeEach(() => {
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, {
    "POST /api/corpus/search": (body) => (body.query === "tuščia" ? { json: { hits: [] } }
      : body.query === "bad" ? { status: 400, json: { error: "k must be an integer from 1 to 30", code: "INVALID_FIELD" } }
        : { json: { hits: [HIT, { ...HIT, unitId: "u60", citationUrl: "", sourceUrl: "", text: "short" }] } }),
    "GET /api/corpus/provision": (_b, _r, url) => (url.searchParams.get("article") === "999"
      ? { status: 404, json: { error: "No such provision in the corpus", code: "NOT_FOUND" } } : { json: PROVISION }),
    "POST /api/corpus/check-citations": (body) => ({ json: { results: checkResults(body.citations) } }),
    "GET /api/corpus/documents": () => ({ json: { documents: [ACT, { ...ACT, id: "doc-x", shortTitle: "", externalId: "", sourceUrl: "",
                                                                 currentVersion: null }] } }),
    "GET /api/obligations": (_b, _r, url) => {
      const rows = url.searchParams.get("q") === "nieko" ? [] : [OBLIGATION, { ...OBLIGATION, id: "ob2", titleEn: "", textEn: "",
        conditions: "", evidence: "", deadline: "", addressee: "", citations: [], status: "approved" }];
      return { json: { obligations: rows, total: rows.length ? 40 : 0 } };
    },
  });
});

after(async () => { await stub.close(); });


test("searchLegalCorpus: the schema's bounds; one POST with the given filters only", async () => {
  const set = await toolSet();
  const refused = [
    {}, { query: "a" }, { query: "x".repeat(2_001) }, { query: "ab", k: 0 }, { query: "ab", k: 31 }, { query: "ab", k: 2.5 },
    { query: "ab", jurisdiction: "eu" }, { query: "ab", documents: Array(21).fill("MiCA") }, { query: "ab", documents: [""] },
    { query: "ab", scope: "all" }, { query: "ab", kind: "laws" },
  ];
  for (const input of refused) assert.equal(await refuses(set, "searchLegalCorpus", input), true, JSON.stringify(input).slice(0, 80));
  await call(set, "searchLegalCorpus", { query: "kriptoturto leidimas" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].body],
                   ["POST", "/api/corpus/search", { query: "kriptoturto leidimas", k: 8 }], "k defaults to 8; unset filters are not sent");
  await call(set, "searchLegalCorpus", { query: "incidentas", documents: ["DORA", "32022R2554"], jurisdiction: "EU", k: 30 });
  assert.deepEqual(stub.requests[1].body, { query: "incidentas", k: 30, documents: ["DORA", "32022R2554"], jurisdiction: "EU" });
  await call(set, "searchLegalCorpus", { query: "access control policy", kind: "standards", jurisdiction: "INTL" });
  assert.deepEqual(stub.requests[2].body, { query: "access control policy", k: 8, jurisdiction: "INTL", kind: "standards" },
                   "the standards only, an international one");
  assertAsUser(stub.requests);
});


test("searchLegalCorpus: hits carry the citation block the GUI chips render, text capped; none → the note", async () => {
  const set = await toolSet();
  const found = await call(set, "searchLegalCorpus", { query: "kriptoturto leidimas" });
  assert.deepEqual(found.hits[0], {
    unitId: "u59", documentId: "doc-mica", shortTitle: "MiCA", title: "Reglamentas (ES) 2023/1114", jurisdiction: "EU",
    docType: "regulation", path: "59 str. 1 d.", heading: "Kriptoturto paslaugų teikėjų leidimas",
    citationUrl: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32023R1114#art_59",
    text: `${"T".repeat(1_500)} …[truncated]`, score: 0.91234,
  });
  assert.equal(found.hits[1].citationUrl, null, "no URL at all → null, a plain chip");
  assert.equal(found.note, undefined);
  const empty = await call(set, "searchLegalCorpus", { query: "tuščia" });
  assert.deepEqual(empty, { hits: [], note: "No provision matched. The corpus may not contain this act — say so and mark the point (tikrintina)." });
  await assert.rejects(call(set, "searchLegalCorpus", { query: "bad" }), { message: "[INVALID_FIELD] searchLegalCorpus failed (HTTP 400): k must be an integer from 1 to 30" });
});


test("getLegalProvision: the exact provision with its version and URL, text capped; Django's 404", async () => {
  const set = await toolSet();
  for (const input of [{ document: "MiCA" }, { article: "59" }, { document: "MiCA", article: "x".repeat(201) },
                       { document: "MiCA", article: "59", type: "chapter" }, { document: "MiCA", article: "59", paragraph: "" }]) {
    assert.equal(await refuses(set, "getLegalProvision", input), true, JSON.stringify(input));
  }
  const answer = await call(set, "getLegalProvision", { document: "MiCA", article: "59" });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].query],
                   ["GET", "/api/corpus/provision", { document: "MiCA", article: "59" }]);
  assert.deepEqual(answer, { provision: {
    unitId: "u59", documentId: "doc-mica", shortTitle: "MiCA", title: "Reglamentas (ES) 2023/1114", jurisdiction: "EU",
    docType: "regulation", path: "59 str.", heading: "Leidimas", citationUrl: "https://src", unitType: "article", externalId: "32023R1114", language: "lt", versionNo: 3,
    versionDate: "2024-12-30", text: `${"P".repeat(20_000)} …[truncated]`,
  } }, "an empty citationUrl falls back to the source URL");
  await call(set, "getLegalProvision", { document: "LB 03-126", article: "IV", paragraph: "2", type: "annex" });
  assert.deepEqual(stub.requests[1].query, { document: "LB 03-126", article: "IV", paragraph: "2", type: "annex" });
  await assert.rejects(call(set, "getLegalProvision", { document: "MiCA", article: "999" }),
                       { message: "[NOT_FOUND] getLegalProvision failed (HTTP 404): No such provision in the corpus" });
  assertAsUser(stub.requests);
});


test("checkCitations: the batch as sent; verdict rows with Django's note, no invented field (ASSISTANT-LLM-14, FIXED)", async () => {
  const set = await toolSet();
  for (const input of [{ citations: [] }, { citations: Array(51).fill({ act: "MiCA", article: "1" }) },
                       { citations: [{ act: "MiCA" }] }, { citations: [{ act: "MiCA", article: "1", url: "x" }] },
                       { citations: [{ act: "", article: "1" }] }, { citations: [{ act: "MiCA", article: "1", claimedHeading: "h".repeat(301) }] }]) {
    assert.equal(await refuses(set, "checkCitations", input), true, JSON.stringify(input).slice(0, 80));
  }
  const citations = [
    { act: "MiCA", article: "74", claimedHeading: "RTO" }, { act: "MiCA", article: "59", paragraph: "1", point: "a" },
    { act: "MiCA", article: "999" }, { act: "XYZ", article: "1" },
  ];
  const checked = await call(set, "checkCitations", { citations });
  assert.deepEqual([stub.requests[0].method, stub.requests[0].path, stub.requests[0].body],
                   ["POST", "/api/corpus/check-citations", { citations }]);
  assert.deepEqual(checked.results[0], {
    act: "MiCA", article: "74", paragraph: null, point: null, claimedHeading: "RTO", status: "found", headingMatch: "mismatch",
    note: "Article 74 is about notifications, not the RTO — see Article 72.",
    unitId: "u74", documentId: "doc-mica", shortTitle: "MiCA", title: null, jurisdiction: null, docType: null, path: "74 str.",
    heading: "Pranešimai",
    citationUrl: "https://eur-lex/#art_74", excerpt: `${"E".repeat(600)} …[truncated]`,
  });
  assert.ok(checked.results.every((row) => !("similarity" in row)), "no field Django never sends");
  assert.equal(checked.results[1].note, null, "an empty note is no note");
  assert.deepEqual(checked.results[2], {
    act: "MiCA", article: "999", paragraph: null, point: null, claimedHeading: null, status: "not_found", headingMatch: "unknown",
    note: null, unitId: null, documentId: "doc-mica", shortTitle: "MiCA", title: null, jurisdiction: null, docType: null,
    path: null, heading: null,
    citationUrl: null, excerpt: null,
  });
  assert.equal(checked.results[3].status, "act_not_in_corpus");
  assert.deepEqual(checked.counts, { found: 2, headingMismatch: 1, notFound: 1, actNotInCorpus: 1 });
  for (const row of checked.results) {
    for (const key of ["act", "article", "paragraph", "point", "status", "headingMatch", "heading", "unitId", "shortTitle", "path", "citationUrl"]) {
      assert.ok(key in row, `ToolCards' CitationVerdict reads ${key}`);
    }
  }
  assertAsUser(stub.requests);
});


test("listLegalActs: the catalogue as the model needs it — no admin fields; the filters given only", async () => {
  const set = await toolSet();
  for (const input of [{ jurisdiction: "US" }, { domain: "d".repeat(41) }, { query: "q".repeat(201) }, { enabled: false },
                       { docType: "regulation" }]) {
    assert.equal(await refuses(set, "listLegalActs", input), true, JSON.stringify(input));
  }
  const listed = await call(set, "listLegalActs", {});
  assert.deepEqual(stub.requests[0].query, {});
  assert.deepEqual(listed, { total: 2, acts: [
    { id: "doc-mica", shortTitle: "MiCA", title: "Reglamentas (ES) 2023/1114", jurisdiction: "EU", docType: "regulation",
      externalId: "32023R1114", status: "in_force", domains: ["crypto"], appliesTo: ["casp"], sourceUrl: "https://src",
      version: { versionNo: 3, effectiveDate: "2024-12-30", status: "ready" } },
    { id: "doc-x", shortTitle: null, title: "Reglamentas (ES) 2023/1114", jurisdiction: "EU", docType: "regulation",
      externalId: null, status: "in_force", domains: ["crypto"], appliesTo: ["casp"], sourceUrl: null, version: null },
  ] });
  await call(set, "listLegalActs", { query: "mokėjimo", jurisdiction: "LT", domain: "aml" });
  assert.deepEqual(stub.requests[1].query, { q: "mokėjimo", jurisdiction: "LT", domain: "aml" });
  await call(set, "listLegalActs", { docType: "standard" });
  assert.deepEqual(stub.requests[2].query, { docType: "standard" }, "the standards only");
  stub.routes["GET /api/corpus/documents"] = () => ({ json: { documents: Array.from({ length: 130 }, (_, i) => ({ ...ACT, id: `d${i}` })) } });
  const many = await call(set, "listLegalActs", {});
  assert.equal(many.acts.length, 100);
  assert.equal(many.total, 130);
  assertAsUser(stub.requests);
});


test("listObligations: the act by any of its names, the register's filters and page; rows as the model needs them", async () => {
  const set = await toolSet();
  for (const input of [{}, { act: "" }, { act: "MiCA", category: "fines" }, { act: "MiCA", query: "x" }, { act: "MiCA", limit: 31 },
                       { act: "MiCA", offset: -1 }, { act: "MiCA", status: "maybe" }, { act: "   " }]) {
    assert.equal(await refuses(set, "listObligations", input), true, JSON.stringify(input));
  }
  const listed = await call(set, "listObligations", { act: "mica" });
  assert.deepEqual(stub.requests.map((r) => `${r.method} ${r.path}`), ["GET /api/corpus/documents", "GET /api/obligations"]);
  assert.deepEqual(stub.requests[1].query, { document: "doc-mica", status: "proposed,approved", offset: "0", limit: "15" },
                   "the act's id, the first page — and what a reviewer rejected left out: it is no requirement");
  assert.deepEqual(listed.act, { id: "doc-mica", shortTitle: "MiCA", title: "Reglamentas (ES) 2023/1114",
                                 version: { versionNo: 3, effectiveDate: "2024-12-30", status: "ready" } });
  assert.deepEqual([listed.total, listed.more], [40, 38]);
  assert.deepEqual(listed.obligations[0], {
    id: "ob1", title: "Atskirti klientų kriptoturtą", text: `${"T".repeat(500)} …[truncated]`, addressee: "Kriptoturto paslaugų teikėjas",
    appliesTo: ["casp"], conditions: `${"C".repeat(300)} …[truncated]`, category: "safeguarding", severity: "critical", deadline: "nuolat",
    expectedEvidence: `${"V".repeat(200)} …[truncated]`, provisions: ["70 str. 1 d.", "70 str. 2 d.", "75 str."], status: "proposed",
  }, "no model, notes or reviewer; the provisions it cites; whether a person reviewed it");
  assert.deepEqual(listed.obligations[1], {
    id: "ob2", title: "Atskirti klientų kriptoturtą", text: `${"T".repeat(500)} …[truncated]`, addressee: null, appliesTo: ["casp"],
    conditions: null, category: "safeguarding", severity: "critical", deadline: null, expectedEvidence: null, provisions: [], status: "approved",
  });
  for (const name of ["doc-mica", "MiCA", "32023R1114", " MICA "]) {
    stub.requests.length = 0;
    await call(set, "listObligations", { act: name, category: "safeguarding", query: "klient", offset: 30, limit: 5 });
    assert.deepEqual(stub.requests[1].query, { document: "doc-mica", category: "safeguarding", q: "klient", status: "proposed,approved",
                                               offset: "30", limit: "5" }, name);
  }
  stub.requests.length = 0;
  await call(set, "listObligations", { act: "MiCA", status: "rejected" });
  assert.equal(stub.requests[1].query.status, "rejected", "the rejected ones are listed when they are asked for");
  assert.deepEqual((await call(set, "listObligations", { act: "MiCA", query: "nieko" })), { act: listed.act, total: 0, obligations: [], more: 0 });
  assertAsUser(stub.requests);
});


test("listObligations: English titles and texts in an English turn, the Lithuanian ones when there is none", async () => {
  const set = await toolSet({ language: "en" });
  const listed = await call(set, "listObligations", { act: "MiCA" });
  assert.deepEqual([listed.obligations[0].title, listed.obligations[0].text], ["Segregate client crypto-assets", `${"E".repeat(500)} …[truncated]`]);
  assert.equal(listed.obligations[1].title, "Atskirti klientų kriptoturtą");
});


test("listObligations: a name that is no act, or several, asks nothing of the register — ACT_NOT_FOUND points at the catalogue", async () => {
  const set = await toolSet();
  for (const act of ["PSD3", "Reglamentas"]) {
    stub.requests.length = 0;
    await assert.rejects(call(set, "listObligations", { act }), { code: "ACT_NOT_FOUND" }, act);
    assert.deepEqual(stub.requests.map((r) => r.path), ["/api/corpus/documents"]);
  }
  stub.routes["GET /api/corpus/documents"] = () => ({ json: { documents: [ACT, { ...ACT, id: "doc-dora", slug: "dora", shortTitle: "DORA",
                                                                                 externalId: "32022R2554", title: "Reglamentas (ES) 2022/2554" }] } });
  const dora = await call(set, "listObligations", { act: "2022/2554" });
  assert.equal(dora.act.id, "doc-dora", "the only act whose title holds the words");
});
