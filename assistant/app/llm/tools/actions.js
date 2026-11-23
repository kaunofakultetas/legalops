// -----------------------------------------------------------
//  [*] Assistant tools — the action register
//
//  A report's plan used to end with the report. Django keeps
//  it now: every company has a register of the actions its
//  signed-off reports called for, each with an owner, a due
//  date, a state and the open findings it is to close
//  (analysis/register.py). One tool reads it:
//
//    getActionRegister
//
//  The register moves on one event only — a person signing a
//  finished report off on the report's page. That sign-off
//  brings the report's plan in and holds the earlier actions
//  against what the report found: an action is closed by a
//  later signed-off report that finds its obligations met, or
//  by a person who says why. "done" is only the owner's word
//  that the action was carried out, waiting for that re-test,
//  and "late" is an open or in-progress action past its due
//  date. So the tool is read-only and its description says
//  what the model must never claim: that it opened, closed or
//  edited an action, or that an action is closed because a
//  document was uploaded. Owner, due date and state are a
//  person's to set, on the company's Actions tab, whose link
//  every answer carries.
//
//  The register is found, never asked for: by the company's
//  id, which the turn's company context holds. Unasked it
//  lists the live actions — late, open, in progress, done —
//  in Django's order, the late first; the closed ones only
//  when that state is asked for. An action says what it
//  closes in the words of Django's register workbook
//  (analysis/exports.py), so the chat and the file agree. One
//  that no later report can ever confirm — it closes no
//  finding, or a finding of it lost its obligation — is
//  marked: only a person closes it, and the answer says so.
//
//  Beside the register the tool reads what the law did after
//  the company's latest report: the acts with a newer
//  version, the provisions that changed and the findings that
//  rest on them. That part is left out when its route fails,
//  since the register stands without it.
//
//  Split into:
//
//    rows         — a list, whatever Django answered
//    dayOf        — the day of one of Django's timestamps
//    closesOf     — the findings an action is to close
//    closedOf     — how, when and by whom it was closed
//    actionRow    — one action for the model
//    pathsOf      — a capped list of provisions
//    lawChangesOf — what the law did since the latest report
//    actionTools  — the group (named export)
// -----------------------------------------------------------

import { z } from "zod";

import { defineTool, id, trimText, url } from "./shared.js";


// The states the register shows an action in, in its order:
// Django's four (analysis/models.py, ACTION_STATES) and late,
// which it derives for an open or in-progress action whose due
// date has passed
const STATES = ["late", "open", "in_progress", "done", "closed"];

// The states listed when none is asked for: all but closed
const LIVE = ["late", "open", "in_progress", "done"];

// The most actions one answer lists
const MAX_ACTIONS = 20;

// The most findings an action names of those it is to close
const MAX_ITEMS = 6;

// How much of an action's title, of the title of a finding it
// closes and of its note is read
const MAX_TITLE = 200;
const MAX_ITEM_TITLE = 120;
const MAX_NOTE = 200;

// The most acts the law's changes list, the most provisions of
// one kind — changed, added, removed — an act names, and the
// most findings to look at again under one act
const MAX_LAW_ACTS = 15;
const MAX_PATHS = 12;
const MAX_RECHECK = 6;

// How an action was closed, by Django's codes, in the words of
// its English register workbook (analysis/exports.py,
// LABELS.en.closed_ways) — keep the two alike
const CLOSED_WAYS = { confirmed: "confirmed by a later report", manual: "closed by a person" };

// What every answer tells the model to do with the register,
// and what is added when an action listed can be closed by a
// person only, when the law moved under the latest report and
// when an act's changes were not recorded
const NEXT = "nothing here is changed from the chat: actions come in and are closed when a person signs a finished report "
  + "off on the report's page; owner, due date and state are set on the company's Actions tab (url). Say an action is "
  + "closed only when its state is closed";
const NEXT_BY_HAND = "closedOnlyByHand: such an action is never closed by a report — a person closes it on the Actions tab "
  + "with a reason";
const NEXT_LAW = "lawChanges: these acts have a newer version than the latest report read, and findingsToRecheck rest on "
  + "provisions that changed or were removed — tell the user; a new analysis assesses them against the text in force";
const NEXT_UNRECORDED = "recorded false: that act changed but where was not recorded — the whole act is to be looked at again";







// -----------------------------------------------------------
// rows
// -----------------------------------------------------------
//
// A list of Django's answer as an array: empty when the field
// is missing or is something else, so a degraded answer reads
// as nothing instead of crashing the tool.
//
// Used by:
//   - closesOf, pathsOf, lawChangesOf (below)
//   - actionTools (below) — getActionRegister
// -----------------------------------------------------------

function rows(value) {
  return Array.isArray(value) ? value : [];
}







// -----------------------------------------------------------
// dayOf
// -----------------------------------------------------------
//
// The day of a timestamp as Django writes one — ISO, in UTC —
// which is the day its own register workbook prints. Nothing
// when there is no timestamp.
//
// Used by:
//   - closedOf (below)
// -----------------------------------------------------------

function dayOf(stamp) {
  return typeof stamp === "string" && stamp.length >= 10 ? stamp.slice(0, 10) : null;
}







// -----------------------------------------------------------
// closesOf
// -----------------------------------------------------------
//
// The findings an action is to close, each as one line in the
// wording of Django's register workbook: the obligation's
// title, in brackets the act and the provision it stands in,
// and a mark once a later signed-off report found it met. The
// first few are named and the rest counted. An action that
// closes no finding — correcting references, finding out a
// fact — names none.
//
// Used by:
//   - actionRow (below)
// -----------------------------------------------------------

function closesOf(action) {
  const items = rows(action.items);
  return {
    closes: items.slice(0, MAX_ITEMS).map((item) => {
      const where = [item?.act, item?.path].filter(Boolean).join(" ");
      return `${trimText(item?.title, MAX_ITEM_TITLE)}${where ? ` (${where})` : ""}${item?.confirmed ? " — confirmed" : ""}`;
    }),
    moreItems: Math.max(0, items.length - MAX_ITEMS),
  };
}







// -----------------------------------------------------------
// closedOf
// -----------------------------------------------------------
//
// How a closed action was closed: by a later report that
// confirmed its obligations, or by a person — then with that
// person's name — and on which day. A way this file has no
// words for keeps Django's code. Nothing for an action that
// is not closed.
//
// Used by:
//   - actionRow (below)
// -----------------------------------------------------------

function closedOf(action) {
  if (action.state !== "closed") return null;
  return {
    how: Object.hasOwn(CLOSED_WAYS, action.closedHow) ? CLOSED_WAYS[action.closedHow] : action.closedHow ?? null,
    at: dayOf(action.closedAt),
    ...(action.closedByName ? { by: action.closedByName } : {}),
  };
}







// -----------------------------------------------------------
// actionRow
// -----------------------------------------------------------
//
// One action as the model needs it to answer what is open,
// who owns it and by when: its title, the state as the
// register shows it, the owner, the due date, the priority,
// what it is to close, and the date of the report whose plan
// it came from — unknown once that report is gone. Three keys
// are there only when they have something to say: that no
// later report can ever confirm the action, so only a person
// closes it (Django's byHandOnly); how it was closed; and the
// note a person left on it, cut short.
//
// Used by:
//   - actionTools (below) — getActionRegister
// -----------------------------------------------------------

function actionRow(action) {
  const closed = closedOf(action);
  return {
    id: action.id, title: trimText(action.title, MAX_TITLE), state: action.state ?? null, owner: action.owner || null,
    due: action.dueDate ?? null, priority: action.priority ?? null,
    ...closesOf(action),
    fromReport: action.reportDate ?? null,
    ...(action.byHandOnly === true ? { closedOnlyByHand: true } : {}),
    ...(closed ? { closed } : {}),
    ...(action.note ? { note: trimText(action.note, MAX_NOTE) } : {}),
  };
}







// -----------------------------------------------------------
// pathsOf
// -----------------------------------------------------------
//
// The provisions of one kind — changed, added or removed — an
// act's newer versions name, under the key given: the first
// few, and how many were left out under a second key that is
// there only when the list was cut.
//
// Used by:
//   - lawChangesOf (below)
// -----------------------------------------------------------

function pathsOf(key, moreKey, paths) {
  const all = rows(paths);
  return { [key]: all.slice(0, MAX_PATHS), ...(all.length > MAX_PATHS ? { [moreKey]: all.length - MAX_PATHS } : {}) };
}







// -----------------------------------------------------------
// lawChangesOf
// -----------------------------------------------------------
//
// What the law did after the company's latest finished report,
// from Django's law-changes answer: the date of that report
// and, for every act it assessed that has a newer version now,
// the two version numbers with the date of the current one,
// the provisions the versions since changed, added and
// removed, and the report's findings that rest on a changed or
// removed provision — the ones to look at again, each with its
// provision. `recorded` is false when a version in between was
// read before changes were recorded: the act changed and
// nobody can say where, and a flag Django leaves out reads
// that cautious way. Nothing when no act moved, when the
// company has no finished report, or when the route did not
// answer.
//
// Used by:
//   - actionTools (below) — getActionRegister
// -----------------------------------------------------------

function lawChangesOf(answer) {
  const acts = rows(answer?.acts);
  if (!acts.length) return null;
  return {
    sinceReport: answer.reportDate ?? null,
    acts: acts.slice(0, MAX_LAW_ACTS).map((act) => {
      const findings = rows(act.findings);
      return {
        act: act.act ?? null,
        version: `v${act.assessedVersion ?? "?"} → v${act.currentVersion ?? "?"}${act.currentDate ? ` (${act.currentDate})` : ""}`,
        ...pathsOf("changed", "moreChanged", act.changed),
        ...pathsOf("added", "moreAdded", act.added),
        ...pathsOf("removed", "moreRemoved", act.removed),
        recorded: act.recorded === true,
        findingsToRecheck: findings.slice(0, MAX_RECHECK)
          .map((finding) => `${trimText(finding?.title, MAX_ITEM_TITLE)}${finding?.path ? ` (${finding.path})` : ""}`),
        moreFindings: Math.max(0, findings.length - MAX_RECHECK),
      };
    }),
    ...(acts.length > MAX_LAW_ACTS ? { moreActs: acts.length - MAX_LAW_ACTS } : {}),
  };
}







// -----------------------------------------------------------
// actionTools
// -----------------------------------------------------------
//
// The group's tool for one turn. It only reads: the register
// first — a company the user cannot see fails the call there,
// before anything else is asked — then the law's changes,
// which may fail without taking the register with them.
//
// Used by:
//   - llm/tools.js — createTools
// -----------------------------------------------------------

export function actionTools(ctx) {
  const { django } = ctx;


  const getActionRegister = defineTool("getActionRegister", {
    description: "A company's action register: the actions its signed-off reports' plans called for, each with "
      + "its owner, due date, state and the findings it is to close. Use it for what is still open or late, who "
      + "owns what, what was closed, and whether the law changed under the findings (lawChanges: acts with a "
      + "newer version than the latest report read, and its findings to re-check). Never ask for an id: "
      + "companyId is in the company context. late = past its due date; done = the owner says it was carried "
      + "out and it awaits the re-test — not closed. An action is closed only by a later signed-off report that "
      + "finds its obligations met, or by a person with a reason. The register moves only when a person signs a "
      + "report off on the report page: you cannot open, close or edit an action, and never say one is closed "
      + "because a document was uploaded. Owner and due date are changed on the company's Actions tab (url).",
    input: z.strictObject({
      companyId: id("The company id — from the company context, never asked of the user"),
      state: z.enum(STATES).optional()
        .describe("List only the actions in this state; default: all but the closed, the late first, at most 20 — narrow "
          + "by state while moreActions > 0. late: open or in progress and past its due date — listed as late, not as open"),
    }),
    run: async ({ companyId, state }) => {
      const register = await django.get(url`/api/companies/${companyId}/actions`);
      // The register stands without the law's changes: a failed
      // read leaves that part of the answer out
      const lawChanges = lawChangesOf(await django.get(url`/api/companies/${companyId}/law-changes`).catch(() => null));
      const wanted = rows(register?.actions).filter((action) => (state ? action?.state === state : LIVE.includes(action?.state)));
      const actions = wanted.slice(0, MAX_ACTIONS).map(actionRow);
      const counts = register?.counts;
      return {
        counts: {
          late: counts?.late ?? null, open: counts?.open ?? null, inProgress: counts?.in_progress ?? null,
          done: counts?.done ?? null, closed: counts?.closed ?? null,
        },
        actions,
        moreActions: Math.max(0, wanted.length - MAX_ACTIONS),
        ...(lawChanges ? { lawChanges } : {}),
        url: url`/companies/${companyId}?tab=actions`,
        next: [
          NEXT, ...(actions.some((action) => action.closedOnlyByHand) ? [NEXT_BY_HAND] : []), ...(lawChanges ? [NEXT_LAW] : []),
          ...(lawChanges?.acts.some((act) => !act.recorded) ? [NEXT_UNRECORDED] : []),
        ].join(". "),
      };
    },
  }, ctx);


  return { getActionRegister };
}
