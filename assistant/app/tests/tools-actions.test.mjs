// -----------------------------------------------------------
//  [*] Tests — the action register tool (llm/tools/actions.js)
//
//  getActionRegister against a Django stub that answers as
//  analysis/api/views.py does: the company's register as
//  serialize_company_action writes its rows — the live ones
//  first, the late before the others, then the closed — and
//  what the law did since the latest report
//  (register.law_changes). The tool only reads: the tests
//  prove that nothing but a GET of those two routes reaches
//  Django, since the register moves when a person signs a
//  report off on its page and never from the chat.
//
//  What the model reads is pinned whole: the live actions
//  unasked and the closed only when asked for, the counts by
//  state as shown, what an action closes in the wording of
//  Django's register workbook with the mark of a finding a
//  later report confirmed, the mark of an action only a
//  person can close, how a closed action was closed and by
//  whom, the date of the report an action came from, and the
//  law's changes with the findings to look at again. The
//  law's changes may fail to load: the register is then
//  answered without them. Only the register's own refusal
//  fails the call.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { assertAsUser, call, refuses, startToolStub, toolSet } from "./helpers/toolKit.mjs";


// What every row of the register carries beside its own
// fields, as serialize_company_action writes it: an open
// action of the September report
const ROW = {
  companyId: "c1", reportId: "r-sep", reportDate: "2026-09-01", description: "Not for the model: the plan's own text of the action",
  category: "policy", priority: 1, effort: "medium", owner: "Atitikties pareigūnas", status: "open", state: "open", items: [],
  byHandOnly: false, note: "",
  closedAt: null, closedByName: null, closedHow: null, confirmedReportId: null,
  createdAt: "2026-09-03T09:00:00.120000+00:00", updatedAt: "2026-09-03T09:00:00.120000+00:00",
};

// The confirmation a later signed-off report leaves on an item
const CONFIRMED = { reportId: "r-nov", at: "2026-11-10T08:30:00.500000+00:00" };

// The register of the demo company in Django's order: two
// late actions by due date, three open or in progress, one
// its owner calls done, then the closed — one by the November
// report, one by a person. Two of the live ones no report can
// ever confirm: a finding of a-prog lost its obligation, and
// a-bare closes no finding (its report is gone as well)
const REGISTER = [
  { ...ROW, id: "a-late", title: "Parengti klientų kriptoturto saugojimo politiką", dueDate: "2026-09-17", state: "late",
    items: [item("Klientų kriptoturto saugojimo politika", "MiCA", "70 str.")] },
  { ...ROW, id: "a-late2", title: "Atnaujinti rizikos vertinimą", dueDate: "2026-10-03", status: "in_progress", state: "late", priority: 2,
    owner: "AML pareigūnas", items: [item("Rizikos vertinimas", "PPTFPĮ", "29 str.", { status: "partial" })] },
  { ...ROW, id: "a-open", title: "Sutvarkyti skundų nagrinėjimą", dueDate: "2026-12-02",
    items: [item("Skundų nagrinėjimo tvarka", "MiCA", "71 str.", { confirmed: CONFIRMED }), item("Skundų registras", "MiCA", "71 str. 3 d.")] },
  { ...ROW, id: "a-prog", title: "T".repeat(250), dueDate: "2026-12-10", status: "in_progress", state: "in_progress", owner: "",
    note: "N".repeat(250), byHandOnly: true,
    items: [item("I".repeat(150), "DORA", "5 str."), item("Vien pavadinimas", "", ""), item("Tik aktas", "DORA", ""),
            item("Pakeista prievolė", "DORA", "6 str.", { obligationId: null }),
            ...Array.from({ length: 4 }, (_, i) => item(`Prievolė ${i}`, "DORA", `${7 + i} str.`))] },
  { ...ROW, id: "a-bare", title: "Ištaisyti dokumentų nuorodas į teisės aktus", dueDate: "2026-12-20", reportId: null, reportDate: null,
    category: "citations", byHandOnly: true },
  { ...ROW, id: "a-done", title: "Paskirti atsakingą asmenį", dueDate: "2026-10-01", status: "done", state: "done",
    items: [item("Atsakingo asmens paskyrimas", "PPTFPĮ", "22 str.")] },
  { ...ROW, id: "a-closed", title: "Patvirtinti interesų konfliktų politiką", dueDate: "2026-10-15", status: "closed", state: "closed",
    items: [item("Interesų konfliktų politika", "MiCA", "72 str.", { confirmed: CONFIRMED })],
    closedAt: "2026-11-10T08:30:00.500000+00:00", closedHow: "confirmed", confirmedReportId: "r-nov" },
  { ...ROW, id: "a-hand", title: "Įdiegti prekybos platformos taisykles", dueDate: "2026-11-01", status: "closed", state: "closed",
    reportId: "r-jun", reportDate: "2026-06-01", items: [item("Prekybos platformos veiklos taisyklės", "MiCA", "76 str.")],
    note: "Paslauga nebeteikiama nuo 2026-10-01", closedAt: "2026-11-11T14:05:00+00:00", closedByName: "Rasa Rasaitė", closedHow: "manual" },
];

// The register's counts by state as shown
const COUNTS = { late: 2, open: 2, in_progress: 1, done: 1, closed: 2 };

// What the law did since the November report, as
// register.law_changes answers it: one act with its changes
// recorded and a finding that rests on a changed provision,
// one that changed before changes were recorded
const LAW = {
  reportId: "r-nov", reportDate: "2026-11-10",
  acts: [
    { actId: "ra-mica", documentId: "mica", act: "MiCA", assessedVersion: 3, currentVersion: 5, currentDate: "2026-11-01", recorded: true,
      changed: ["68 str.", "70 str."], added: ["70a str."], removed: [],
      findings: [{ id: "f-70", title: "Klientų kriptoturto saugojimo politika", status: "missing", path: "70 str. 1 d." },
                 { id: "f-68", title: "Organizaciniai reikalavimai", status: "met", path: "" }] },
    { actId: "ra-aml", documentId: "pptfpi", act: "PPTFPĮ", assessedVersion: 12, currentVersion: 13, currentDate: "2026-11-05", recorded: false,
      changed: [], added: [], removed: [], findings: [] },
  ],
};

// A register and a changed act too long to answer whole
const MANY = Array.from({ length: 23 }, (_, i) => ({ ...ROW, id: `m${i}`, title: `Veiksmas ${i}`, dueDate: "2026-12-01",
                                                      state: i < 2 ? "late" : "open" }));
const LONG_LAW = {
  reportId: "r-nov", reportDate: "2026-11-10",
  acts: Array.from({ length: 17 }, (_, n) => ({
    actId: `ra${n}`, documentId: `d${n}`, act: `Aktas ${n}`, assessedVersion: 1, currentVersion: 2, currentDate: "2026-11-02", recorded: true,
    changed: Array.from({ length: n ? 1 : 14 }, (_, i) => `${i + 1} str.`), added: [], removed: Array.from({ length: n ? 0 : 13 }, (_, i) => `${50 + i} str.`),
    findings: Array.from({ length: n ? 0 : 8 }, (_, i) => ({ id: `f${i}`, title: `Radinys ${i}`, status: "partial", path: `${i + 1} str.` })),
  })),
};

let stub;







// -----------------------------------------------------------
// item
// -----------------------------------------------------------
//
// One finding an action is to close, as register.sign_off
// keeps it on the action: the obligation with its act and
// provision, how the finding stood when the action came in,
// and no confirmation yet.
//
// Used by:
//   - REGISTER (above)
// -----------------------------------------------------------

function item(title, act, path, extra = {}) {
  return { obligationId: `o-${path || title}`, findingId: `f-${path || title}`, title, act, path, sourceKind: "legal", status: "missing",
           confirmed: null, ...extra };
}







// -----------------------------------------------------------
// companyOf
// -----------------------------------------------------------
//
// The company a request of the stub names: the id in the path
// of a company route.
//
// Used by:
//   - beforeEach (below)
// -----------------------------------------------------------

function companyOf(url) {
  return url.pathname.split("/")[3];
}


before(async () => {
  stub = await startToolStub();
});

beforeEach(() => {
  stub.requests.length = 0;
  for (const key of Object.keys(stub.routes)) delete stub.routes[key];
  Object.assign(stub.routes, {
    // c1 is the demo company; "quiet" has the same register
    // under a law that did not move, "first" no report and no
    // action, "lawless" a law-changes route that fails, "many"
    // more than one answer holds, "odd" answers nothing
    "GET /api/companies/[^/]+/actions": (_b, _r, url) => ({
      gone: { status: 404, json: { error: "Company not found", code: "NOT_FOUND" } },
      first: { json: { actions: [], counts: { late: 0, open: 0, in_progress: 0, done: 0, closed: 0 } } },
      many: { json: { actions: MANY, counts: { late: 2, open: 21, in_progress: 0, done: 0, closed: 0 } } },
      odd: { json: {} },
    }[companyOf(url)] ?? { json: { actions: REGISTER, counts: COUNTS } }),
    "GET /api/companies/[^/]+/law-changes": (_b, _r, url) => ({
      quiet: { json: { reportId: "r-nov", reportDate: "2026-11-10", acts: [] } },
      first: { json: { reportId: null, reportDate: null, acts: [] } },
      lawless: { status: 500, json: { error: "Server error", code: "SERVER_ERROR" } },
      many: { json: LONG_LAW },
      odd: { json: {} },
    }[companyOf(url)] ?? { json: LAW }),
  });
});

after(async () => { await stub.close(); });


test("getActionRegister: the schema — a company, and at most one of the five states the register shows", async () => {
  const set = await toolSet();
  for (const input of [{}, { companyId: "" }, { state: "late" }, { companyId: "c1", state: "overdue" }, { companyId: "c1", state: "in progress" },
                       { companyId: "c1", state: ["late", "open"] }, { companyId: "c1", status: "open" }, { companyId: "c1", limit: 5 },
                       { companyId: "c1", owner: "CEO" }, { companyId: "c1", actionId: "a-late", close: true }]) {
    assert.equal(await refuses(set, "getActionRegister", input), true, JSON.stringify(input));
  }
  for (const state of ["late", "open", "in_progress", "done", "closed"]) {
    assert.equal(await refuses(set, "getActionRegister", { companyId: "c1", state }), false, state);
  }
  const schema = await set.getActionRegister.inputSchema.jsonSchema;
  assert.deepEqual([schema.additionalProperties, schema.required, Object.keys(schema.properties), schema.properties.state.enum],
                   [false, ["companyId"], ["companyId", "state"], ["late", "open", "in_progress", "done", "closed"]]);
  assert.match(schema.properties.companyId.description, /from the company context, never asked of the user/);
  assert.match(schema.properties.state.description, /default: all but the closed, the late first, at most 20/);
  assert.equal(stub.requests.length, 0, "a refused input reaches nobody");
});


test("getActionRegister: unasked, the live actions in Django's order — the late first — the closed left out, the counts whole", async () => {
  const set = await toolSet();
  const register = await call(set, "getActionRegister", { companyId: "c1" });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path, r.query]),
                   [["GET", "/api/companies/c1/actions", {}], ["GET", "/api/companies/c1/law-changes", {}]],
                   "the register first, then the law's changes — and nothing else");
  assert.deepEqual(Object.keys(register), ["counts", "actions", "moreActions", "lawChanges", "url", "next"]);
  assert.deepEqual(register.counts, { late: 2, open: 2, inProgress: 1, done: 1, closed: 2 }, "by state as shown, the closed counted too");
  assert.deepEqual(register.actions.map((a) => [a.id, a.state]),
                   [["a-late", "late"], ["a-late2", "late"], ["a-open", "open"], ["a-prog", "in_progress"], ["a-bare", "open"], ["a-done", "done"]]);
  assert.equal(register.moreActions, 0);
  assert.deepEqual(register.actions[0], {
    id: "a-late", title: "Parengti klientų kriptoturto saugojimo politiką", state: "late", owner: "Atitikties pareigūnas", due: "2026-09-17",
    priority: 1, closes: ["Klientų kriptoturto saugojimo politika (MiCA 70 str.)"], moreItems: 0, fromReport: "2026-09-01",
  }, "who owns it, by when, what it is to close and the report it came from — no key for a closure or a note it does not have");
  assert.deepEqual([register.actions[1].owner, register.actions[1].priority, register.actions[3].owner],
                   ["AML pareigūnas", 2, null], "an action nobody owns says so");
  assert.equal(register.url, "/companies/c1?tab=actions", "the company's Actions tab, as the console's router has it");
  assert.match(register.next, /^nothing here is changed from the chat: actions come in and are closed when a person signs a finished report off/);
  assert.match(register.next, /owner, due date and state are set on the company's Actions tab \(url\)\. Say an action is closed only when its state is closed/);
  const text = JSON.stringify(register);
  for (const raw of ["Not for the model", "obligationId", "findingId", "sourceKind", "confirmedReportId", "r-sep", "updatedAt", "reportId",
                     "reportDate", "byHandOnly"]) {
    assert.ok(!text.includes(raw), `${raw} stays behind`);
  }
  assert.ok(stub.requests.every((r) => r.method === "GET"), "the tool only reads");
  assertAsUser(stub.requests);
});


test("getActionRegister: a state lists that state alone — the closed only when asked for, each saying how, when and by whom", async () => {
  const set = await toolSet();
  const ids = async (state) => (await call(set, "getActionRegister", { companyId: "c1", state })).actions.map((a) => a.id);
  assert.deepEqual(await ids("late"), ["a-late", "a-late2"]);
  assert.deepEqual(await ids("open"), ["a-open", "a-bare"], "an open action past its due date is late, not open");
  assert.deepEqual(await ids("in_progress"), ["a-prog"]);
  assert.deepEqual(await ids("done"), ["a-done"], "done is the owner's word: past due it is not late, and it is not closed");
  const closed = await call(set, "getActionRegister", { companyId: "c1", state: "closed" });
  assert.deepEqual([closed.actions.map((a) => a.id), closed.moreActions, closed.counts],
                   [["a-closed", "a-hand"], 0, { late: 2, open: 2, inProgress: 1, done: 1, closed: 2 }], "the counts stay whole whatever is listed");
  assert.deepEqual(closed.actions[0], {
    id: "a-closed", title: "Patvirtinti interesų konfliktų politiką", state: "closed", owner: "Atitikties pareigūnas", due: "2026-10-15",
    priority: 1, closes: ["Interesų konfliktų politika (MiCA 72 str.) — confirmed"], moreItems: 0, fromReport: "2026-09-01",
    closed: { how: "confirmed by a later report", at: "2026-11-10" },
  }, "closed by the re-test: a later signed-off report found its obligation met");
  assert.deepEqual(closed.actions[1], {
    id: "a-hand", title: "Įdiegti prekybos platformos taisykles", state: "closed", owner: "Atitikties pareigūnas", due: "2026-11-01",
    priority: 1, closes: ["Prekybos platformos veiklos taisyklės (MiCA 76 str.)"], moreItems: 0, fromReport: "2026-06-01",
    closed: { how: "closed by a person", at: "2026-11-11", by: "Rasa Rasaitė" }, note: "Paslauga nebeteikiama nuo 2026-10-01",
  }, "closed by hand: who, when and the reason they gave — its finding was never confirmed");
  const live = await call(set, "getActionRegister", { companyId: "c1" });
  assert.deepEqual(live.actions.map((a) => "closed" in a), Array(6).fill(false), "a live action carries no closure");

  // A way of closing this service has no words for keeps
  // Django's code (the route's own key is replaced: the stub
  // answers with the first route that matches)
  stub.routes["GET /api/companies/[^/]+/actions"] = () => ({ json: { actions: [
    { ...REGISTER[7], closedHow: "superseded", closedByName: null },
    { ...REGISTER[7], id: "a-odd", closedHow: null, closedAt: null, closedByName: null }], counts: COUNTS } });
  const later = await call(set, "getActionRegister", { companyId: "later", state: "closed" });
  assert.deepEqual(later.actions.map((a) => a.closed), [{ how: "superseded", at: "2026-11-11" }, { how: null, at: null }]);
  assert.ok(stub.requests.every((r) => r.method === "GET"));
  assertAsUser(stub.requests);
});


test("getActionRegister: what an action closes — each finding with its act and provision, marked once confirmed; six named, the rest counted", async () => {
  const set = await toolSet();
  const rows = Object.fromEntries((await call(set, "getActionRegister", { companyId: "c1" })).actions.map((a) => [a.id, a]));
  assert.deepEqual([rows["a-open"].closes, rows["a-open"].moreItems],
                   [["Skundų nagrinėjimo tvarka (MiCA 71 str.) — confirmed", "Skundų registras (MiCA 71 str. 3 d.)"], 0],
                   "in the wording of Django's register workbook: one of the two is confirmed, so the action stays open");
  assert.deepEqual(rows["a-prog"].closes, [
    `${"I".repeat(120)} …[truncated] (DORA 5 str.)`, "Vien pavadinimas", "Tik aktas (DORA)", "Pakeista prievolė (DORA 6 str.)",
    "Prievolė 0 (DORA 7 str.)", "Prievolė 1 (DORA 8 str.)",
  ], "a long title is cut with its mark; a finding without a provision has no empty brackets");
  assert.equal(rows["a-prog"].moreItems, 2, "eight findings: six named, two counted");
  assert.deepEqual([rows["a-bare"].closes, rows["a-bare"].moreItems], [[], 0], "an action that closes no finding names none");
  assert.deepEqual([rows["a-prog"].title, rows["a-prog"].note], [`${"T".repeat(200)} …[truncated]`, `${"N".repeat(200)} …[truncated]`],
                   "a title and a note are cut at 200");
  assert.equal("note" in rows["a-open"], false, "no note, no key");
  assertAsUser(stub.requests);
});


test("getActionRegister: the report an action came from is dated by the action's own row — unknown once that report is gone", async () => {
  const set = await toolSet();
  const from = async (state) => Object.fromEntries(
    (await call(set, "getActionRegister", { companyId: "c1", state })).actions.map((a) => [a.id, a.fromReport]));
  assert.deepEqual(await from(), { "a-late": "2026-09-01", "a-late2": "2026-09-01", "a-open": "2026-09-01", "a-prog": "2026-09-01",
                                   "a-bare": null, "a-done": "2026-09-01" }, "Django's reportDate; an action whose report was deleted has none");
  assert.deepEqual(await from("closed"), { "a-closed": "2026-09-01", "a-hand": "2026-06-01" }, "each action its own report's");
  assert.deepEqual([...new Set(stub.requests.map((r) => r.path))], ["/api/companies/c1/actions", "/api/companies/c1/law-changes"],
                   "the company's reports are not asked for the dates");
  assertAsUser(stub.requests);
});


test("getActionRegister: an action no later report can confirm is marked — and next says a person closes it, only when one is listed", async () => {
  const set = await toolSet();
  const sentence = /\. closedOnlyByHand: such an action is never closed by a report — a person closes it on the Actions tab with a reason/;
  const live = await call(set, "getActionRegister", { companyId: "c1" });
  assert.deepEqual(live.actions.map((a) => [a.id, a.closedOnlyByHand ?? null]),
                   [["a-late", null], ["a-late2", null], ["a-open", null], ["a-prog", true], ["a-bare", true], ["a-done", null]],
                   "a finding of a-prog lost its obligation, a-bare closes no finding: Django's byHandOnly — no key on the others");
  assert.deepEqual(live.actions[4], {
    id: "a-bare", title: "Ištaisyti dokumentų nuorodas į teisės aktus", state: "open", owner: "Atitikties pareigūnas", due: "2026-12-20",
    priority: 1, closes: [], moreItems: 0, fromReport: null, closedOnlyByHand: true,
  });
  assert.match(live.next, sentence);
  assert.match(live.next, /its state is closed\. closedOnlyByHand: .+ with a reason\. lawChanges: /, "after what every answer says, before the law");
  assert.match((await call(set, "getActionRegister", { companyId: "c1", state: "in_progress" })).next, sentence);
  for (const state of ["late", "done", "closed"]) {
    const listed = await call(set, "getActionRegister", { companyId: "c1", state });
    assert.deepEqual([listed.actions.some((a) => "closedOnlyByHand" in a), sentence.test(listed.next)], [false, false],
                     `${state}: no such action is listed, so nothing is said of one`);
  }

  // The mark follows Django's flag alone: a closed action keeps
  // it, and a row without the flag has none
  stub.routes["GET /api/companies/[^/]+/actions"] = () => ({ json: { actions: [
    { ...REGISTER[7], byHandOnly: true }, { ...REGISTER[6], id: "a-flagless", byHandOnly: undefined }], counts: COUNTS } });
  const closed = await call(set, "getActionRegister", { companyId: "c1", state: "closed" });
  assert.deepEqual(closed.actions.map((a) => [a.id, a.closedOnlyByHand ?? null, a.closed.how]),
                   [["a-hand", true, "closed by a person"], ["a-flagless", null, "confirmed by a later report"]]);
  assert.deepEqual(Object.keys(closed.actions[0]).slice(-4), ["fromReport", "closedOnlyByHand", "closed", "note"]);
  assert.match(closed.next, sentence);
  assertAsUser(stub.requests);
});


test("getActionRegister: what the law did since the latest report — the acts that moved, where, and the findings to look at again", async () => {
  const set = await toolSet();
  const register = await call(set, "getActionRegister", { companyId: "c1" });
  assert.deepEqual(register.lawChanges, {
    sinceReport: "2026-11-10",
    acts: [
      { act: "MiCA", version: "v3 → v5 (2026-11-01)", changed: ["68 str.", "70 str."], added: ["70a str."], removed: [], recorded: true,
        findingsToRecheck: ["Klientų kriptoturto saugojimo politika (70 str. 1 d.)", "Organizaciniai reikalavimai"], moreFindings: 0 },
      { act: "PPTFPĮ", version: "v12 → v13 (2026-11-05)", changed: [], added: [], removed: [], recorded: false, findingsToRecheck: [],
        moreFindings: 0 },
    ],
  }, "the versions, the provisions changed, added and removed, and the report's findings that rest on them");
  assert.match(register.next, /\. lawChanges: these acts have a newer version than the latest report read, and findingsToRecheck rest on/);
  assert.match(register.next, /rest on provisions that changed or were removed — tell the user; a new analysis assesses them against the text in force/);
  assert.match(register.next, /\. recorded false: that act changed but where was not recorded — the whole act is to be looked at again$/);
  const closed = await call(set, "getActionRegister", { companyId: "c1", state: "closed" });
  assert.deepEqual(closed.lawChanges, register.lawChanges, "whatever state is listed");

  // Long lists are capped and the cut is counted
  const many = await call(set, "getActionRegister", { companyId: "many" });
  const [first, second] = many.lawChanges.acts;
  assert.deepEqual([first.changed.length, first.changed.at(-1), first.moreChanged, first.removed.length, first.moreRemoved, "moreAdded" in first],
                   [12, "12 str.", 2, 12, 1, false], "twelve provisions of a kind, the rest counted — no counter where nothing was cut");
  assert.deepEqual([first.findingsToRecheck.length, first.findingsToRecheck[0], first.moreFindings], [6, "Radinys 0 (1 str.)", 2]);
  assert.deepEqual([Object.keys(second), many.lawChanges.acts.length, many.lawChanges.moreActs],
                   [["act", "version", "changed", "added", "removed", "recorded", "findingsToRecheck", "moreFindings"], 15, 2]);
  assert.doesNotMatch(many.next, /recorded false/, "every act's changes were recorded: nothing is said of an act that was not");

  // An act whose flag or versions Django leaves out reads the cautious way
  stub.routes["GET /api/companies/[^/]+/law-changes"] = () => ({ json: { reportId: "r-nov", acts: [{ act: "DORA", changed: ["5 str."] }] } });
  const bare = await call(set, "getActionRegister", { companyId: "bare" });
  assert.deepEqual(bare.lawChanges, { sinceReport: null, acts: [{ act: "DORA", version: "v? → v?", changed: ["5 str."], added: [], removed: [],
                                                                recorded: false, findingsToRecheck: [], moreFindings: 0 }] });
  assert.ok(stub.requests.every((r) => r.method === "GET"));
  assertAsUser(stub.requests);
});


test("getActionRegister: no lawChanges when no act moved or the company has no report — nor when the route fails, and the register still stands", async () => {
  const set = await toolSet();
  const quiet = await call(set, "getActionRegister", { companyId: "quiet" });
  assert.deepEqual([Object.keys(quiet), quiet.actions.length], [["counts", "actions", "moreActions", "url", "next"], 6],
                   "the law under the report has not moved: no block at all");
  assert.doesNotMatch(quiet.next, /lawChanges|recorded/, "and nothing is said of it");

  const base = "nothing here is changed from the chat: actions come in and are closed when a person signs a finished report off on the "
    + "report's page; owner, due date and state are set on the company's Actions tab (url). Say an action is closed only when its state is closed";
  const first = await call(set, "getActionRegister", { companyId: "first" });
  assert.deepEqual(first, {
    counts: { late: 0, open: 0, inProgress: 0, done: 0, closed: 0 }, actions: [], moreActions: 0, url: "/companies/first?tab=actions", next: base,
  }, "a company without a signed-off report has an empty register, and next says how actions come in — and no more");

  stub.requests.length = 0;
  const lawless = await call(set, "getActionRegister", { companyId: "lawless" });
  assert.equal(stub.requests.some((r) => r.path === "/api/companies/lawless/law-changes"), true, "the route was asked");
  assert.deepEqual([Object.keys(lawless), lawless.actions.map((a) => a.id), lawless.counts, lawless.actions[0].fromReport],
                   [["counts", "actions", "moreActions", "url", "next"], ["a-late", "a-late2", "a-open", "a-prog", "a-bare", "a-done"],
                    { late: 2, open: 2, inProgress: 1, done: 1, closed: 2 }, "2026-09-01"],
                   "its failure is not the tool's: the block is left out and the register answered whole");

  const odd = await call(set, "getActionRegister", { companyId: "odd" });
  assert.deepEqual(odd, { counts: { late: null, open: null, inProgress: null, done: null, closed: null }, actions: [], moreActions: 0,
                          url: "/companies/odd?tab=actions", next: base }, "an answer with nothing in it: counts unknown, never zero");
  assertAsUser(stub.requests);
});


test("getActionRegister: at most twenty actions an answer, the rest counted — a state narrows them", async () => {
  const set = await toolSet();
  const many = await call(set, "getActionRegister", { companyId: "many" });
  assert.deepEqual([many.actions.length, many.moreActions, many.actions[0].id, many.actions.at(-1).id, many.counts.open], [20, 3, "m0", "m19", 21]);
  const late = await call(set, "getActionRegister", { companyId: "many", state: "late" });
  assert.deepEqual([late.actions.map((a) => a.id), late.moreActions], [["m0", "m1"], 0]);
  const open = await call(set, "getActionRegister", { companyId: "many", state: "open" });
  assert.deepEqual([open.actions.length, open.moreActions], [20, 1]);
  assert.deepEqual((await call(set, "getActionRegister", { companyId: "many", state: "closed" })).actions, []);
  assertAsUser(stub.requests);
});


test("getActionRegister: a company the user cannot see fails the call with Django's code, and nothing else is asked", async () => {
  const calls = [];
  const set = await toolSet({ calls });
  await assert.rejects(call(set, "getActionRegister", { companyId: "gone" }),
                       { message: "[NOT_FOUND] getActionRegister failed (HTTP 404): Company not found", code: "NOT_FOUND" });
  assert.deepEqual(stub.requests.map((r) => [r.method, r.path]), [["GET", "/api/companies/gone/actions"]], "the law's changes are not asked");
  assert.deepEqual([calls.at(-1).name, calls.at(-1).ok, calls.at(-1).code], ["getActionRegister", false, "NOT_FOUND"]);
  await call(set, "getActionRegister", { companyId: "a b/../c?d=1" });
  assert.deepEqual(stub.requests.slice(1).map((r) => r.path),
                   ["/api/companies/a%20b%2F..%2Fc%3Fd%3D1/actions", "/api/companies/a%20b%2F..%2Fc%3Fd%3D1/law-changes"],
                   "an id is one path segment, whatever it holds");
  const linked = await call(set, "getActionRegister", { companyId: "ą/1" });
  assert.equal(linked.url, "/companies/%C4%85%2F1?tab=actions", "in the link of the Actions tab too");
  assertAsUser(stub.requests);
});


test("getActionRegister: the description says what moves the register, and what the model must never claim", async () => {
  const { description } = (await toolSet()).getActionRegister;
  assert.match(description, /what is still open or late, who\s+owns what, what was closed, and whether the law changed under the findings/);
  assert.match(description, /Never ask for an id:\s+companyId is in the company context/);
  assert.match(description, /late = past its due date; done = the owner says it was carried\s+out and it awaits the re-test — not closed/);
  assert.match(description, /closed only by a later signed-off report that\s+finds its obligations met, or by a person with a reason/);
  assert.match(description, /The register moves only when a person signs a\s+report off on the report page/);
  assert.match(description, /you cannot open, close or edit an action, and never say one is closed\s+because a document was uploaded/);
  assert.match(description, /Owner and due date are changed on the company's Actions tab \(url\)/);
  assert.ok(description.length <= 1_024, `within the bound of a tool description (${description.length})`);
});


test("no tool signs a report off or changes the register: the sign-off stays a person's act on the report's page", async () => {
  const set = await toolSet();
  const names = Object.keys(set);
  assert.deepEqual(names.filter((name) => /action/i.test(name)), ["getActionRegister"], "the register has one tool, and it reads");
  assert.deepEqual(names.filter((name) => /sign|register/i.test(name)), ["getActionRegister"]);
  for (const state of [undefined, "late", "open", "in_progress", "done", "closed"]) {
    await call(set, "getActionRegister", { companyId: "c1", ...(state ? { state } : {}) });
  }
  assert.ok(stub.requests.length === 12 && stub.requests.every((r) => r.method === "GET" && r.body === null),
            "whatever is asked of it, nothing but a GET without a body reaches Django");
  assert.deepEqual([...new Set(stub.requests.map((r) => r.path))], ["/api/companies/c1/actions", "/api/companies/c1/law-changes"],
                   "never an action's own route, a report's or the export");
});
