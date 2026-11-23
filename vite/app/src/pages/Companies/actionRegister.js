// -----------------------------------------------------------
//  [*] actionRegister — a company's action register, as the
//      console reads and writes it
//
//  A report's plan used to end with the report. The register
//  keeps it: what the plans of the signed-off reports called
//  for, per company, each action with the findings it is to
//  close, an owner, a due date and a state. It moves on one
//  event only — a person signing a finished report off: that
//  report's plan comes in, and the actions already there are
//  held against its findings (an obligation found met is
//  confirmed; an action whose obligations are all confirmed
//  is closed by that report). In between a person keeps it up
//  by hand: who owns an action, when it is due, where it
//  stands, a note.
//
//    GET   /api/companies/{id}/actions       the register, the
//          late first, then the other live actions by due
//          date, then the closed — with the count of each
//          state
//    PATCH /api/actions/{id}                 a person's hand on
//          one action {status?, owner?, dueDate?, note?}
//    GET   /api/companies/{id}/law-changes   what the law did
//          since the company's latest finished report
//
//  The export (GET …/actions/export?language=) is a file
//  download and goes through utils/download.js from
//  CompanyActions.jsx.
//
//  The state a reader sees is the action's own status, or
//  "late" when it is open or in progress and its due date has
//  passed — worked out by the backend and never set by a
//  person. An answer that is not what the route promises
//  counts as a failed load; a row without an id of its own is
//  left out, so the list can be keyed.
//
//  Split into:
//
//    ACTION_STATES   — the states as shown, the late first
//    actionKeys      — the query keys
//    fetchActions    — a company's register
//    saveAction      — a person's change to one action
//    fetchLawChanges — the changes in the law
//    countsOf        — how many actions stand in each state
//    daysLate        — how far past its due date an action is
//    findingPath     — a report's findings tab, at one finding
// -----------------------------------------------------------

import api from '@/api/client';
import usableRows from '@/pages/Companies/usableRows';







// -----------------------------------------------------------
// ACTION_STATES
// -----------------------------------------------------------
//
// The states the register shows, in the order it counts and
// lists them: the late first — they are what calls for a
// person — then the open, the ones in work, the ones their
// owner calls done, and the closed.
//
// Used by:
//   - CompanyActions.jsx — the filter and its counts
//   - countsOf (below)
// -----------------------------------------------------------

export const ACTION_STATES = ['late', 'open', 'in_progress', 'done', 'closed'];







// -----------------------------------------------------------
// actionKeys
// -----------------------------------------------------------
//
// The query keys of the register's answers, per company. A
// sign-off moves the register, so the report's approval
// refreshes the company's key.
//
// Used by:
//   - CompanyActions.jsx — the register
//   - ActionRow.jsx — what a saved change refreshes
//   - LawChanges.jsx — the changes in the law
//   - pages/Reports/ReportApproval.jsx — a sign-off and its
//     withdrawal
// -----------------------------------------------------------

export const actionKeys = {
  company: (companyId) => ['actions', 'company', companyId],
  law: (companyId) => ['actions', 'law', companyId],
};







// -----------------------------------------------------------
// fetchActions
// -----------------------------------------------------------
//
// A company's register in the backend's order, with the
// counts it sent. An answer that is not an object fails the
// load; a list that is not one reads as an empty register.
//
// Used by:
//   - CompanyActions.jsx
// -----------------------------------------------------------

export async function fetchActions(companyId) {
  const { data } = await api.get(`/api/companies/${companyId}/actions`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The register answer is not an object');
  return { actions: usableRows(data.actions), counts: data.counts && typeof data.counts === 'object' ? data.counts : {} };
}







// -----------------------------------------------------------
// saveAction
// -----------------------------------------------------------
//
// Sends what a person changed on one action and answers the
// action as the backend stored it, its state worked out
// again. Silent: a refusal is shown in the row the person
// edited, not as a toast.
//
// Used by:
//   - ActionRow.jsx — the save
// -----------------------------------------------------------

export async function saveAction(actionId, changes) {
  return (await api.patch(`/api/actions/${actionId}`, changes, { silent: true })).data;
}







// -----------------------------------------------------------
// fetchLawChanges
// -----------------------------------------------------------
//
// What the law did after the company's latest finished
// report: that report's id and date (none when the company
// has no finished report) and the acts it assessed that have
// a newer version now — each with the provisions that
// changed and the findings that rest on them. An answer that
// is not an object fails the load.
//
// Used by:
//   - LawChanges.jsx
// -----------------------------------------------------------

export async function fetchLawChanges(companyId) {
  const { data } = await api.get(`/api/companies/${companyId}/law-changes`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The law changes answer is not an object');
  return {
    reportId: typeof data.reportId === 'string' && data.reportId ? data.reportId : null,
    reportDate: data.reportDate ?? null,
    acts: Array.isArray(data.acts) ? data.acts.filter((act) => act && typeof act === 'object') : [],
  };
}







// -----------------------------------------------------------
// countsOf
// -----------------------------------------------------------
//
// How many actions stand in each state: the backend's own
// count where it sent a number — its list is capped, its
// counts are not — otherwise counted from the rows at hand.
//
// Used by:
//   - CompanyActions.jsx — the filter's counts
// -----------------------------------------------------------

export function countsOf(register) {
  return Object.fromEntries(ACTION_STATES.map((state) => {
    const sent = register.counts[state];
    return [state, Number.isInteger(sent) && sent >= 0 ? sent : register.actions.filter((action) => action.state === state).length];
  }));
}







// -----------------------------------------------------------
// daysLate
// -----------------------------------------------------------
//
// The whole days between an action's due date and today,
// both read as UTC days the way the backend compares them;
// nothing when the due date is not a date or has not passed.
//
// Used by:
//   - ActionRow.jsx — the "late by" words of a late action
// -----------------------------------------------------------

export function daysLate(dueDate, now = Date.now()) {
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate)) ? Date.parse(`${dueDate}T00:00:00Z`) : NaN;
  const days = Math.floor((now - due) / 86_400_000);
  return Number.isFinite(days) && days > 0 ? days : null;
}







// -----------------------------------------------------------
// findingPath
// -----------------------------------------------------------
//
// A report's findings tab narrowed to one finding: the tab
// keeps its search in the address, so the finding's title as
// the search lands on its card. A finding has no address of
// its own.
//
// Used by:
//   - LawChanges.jsx — the findings to look at again
// -----------------------------------------------------------

export function findingPath(reportId, title) {
  const search = new URLSearchParams({ tab: 'findings' });
  if (typeof title === 'string' && title.trim()) search.set('findings.q', title.trim());
  return `/reports/${reportId}?${search}`;
}
