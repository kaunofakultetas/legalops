// -----------------------------------------------------------
//  [*] programmeUtils — what the programme pages know about
//      a work product
//
//  A work product is a document of a company's compliance
//  programme: the compliance policy, the governance product
//  (structure, process and RACI matrix) or the legal risk
//  register. The backend generates it, checks it against the
//  rules of its kind and stores it; a person edits and
//  approves it. This module holds the fixed vocabulary of
//  that contract — the kinds in their order, the formats
//  each exports in, the steps of each kind's generation, the
//  tabs of each kind's page, the values a field may take —
//  and the small readings of a product several screens
//  share.
//
//  Nothing here works out a level, a score or a band of a
//  risk scenario: those are the server's alone. What is
//  derived on this side is only what the page needs before
//  the server answers — whether a step of the RACI matrix
//  keeps the golden rule as the cells stand, whether a
//  scenario's scores were changed since the server last
//  scored it, and whether a scenario or a provision is one
//  the server has not seen yet.
//
//  Split into:
//
//    KIND_ORDER       — the kinds, in their order
//    EXPORT_FORMATS   — kind → the formats it exports in
//    KIND_STEPS       — kind → the steps of its generation
//    KIND_TABS        — kind → the tabs of its page
//    LINES            — the lines of the three lines model
//    NODE_KINDS       — what a node of a structure can be
//    RACI_VALUES      — the letters of a RACI cell
//    LEVELS           — the levels of the document hierarchy
//    MISSING_LEVELS   — the levels of a missing document
//    PRIORITIES       — a missing document's priorities
//    RESPONSES        — the responses to a risk
//    LIKELIHOOD_DIMENSIONS — what a likelihood is scored on
//    IMPACT_DIMENSIONS — what an impact is scored on
//    SOURCES          — what a step of the process may rest on
//    CATEGORIES       — the types of legal risk
//    TYPOLOGIES       — the three typologies beside them
//    MAX_CATEGORIES   — how many types a scenario may have
//    BAND_TINTS       — the five steps of the matrix's ramp
//    RACI_TINTS       — the two filled letters of the matrix
//    listOf           — a list of objects, or []
//    isActive         — queued or running
//    runProgress      — where a generation stands
//    isProduct        — an answer that is a product
//    brokenRules      — the rules a product breaks
//    nextId           — an id no row of a list has yet
//    provisionLabel   — a provision as it is cited
//    provisionPending — a provision the server has not looked up
//    provisionFlag    — what is wrong with a provision
//    paragraphs       — a text as its paragraphs
//    patchAt          — a list with one row changed
//    withoutAt        — a list without one row
//    raciValue        — the letter of one cell
//    goldenRule       — a step's breach of the golden rule
//    NEW_SCENARIO     — the mark of a scenario added here
//    isNewScenario    — a scenario the server has not numbered
//    scenarioUnset    — a scenario with a score not given
//    scenarioPending  — scores changed since the last save
//    bandOfCell       — the band a cell's score falls in
// -----------------------------------------------------------







// -----------------------------------------------------------
// KIND_ORDER
// -----------------------------------------------------------
//
// The three kinds of work product in the order each builds
// on the ones before it: the policy, the governance product,
// the risk register. A kind outside this list is one this
// build cannot draw.
//
// Used by:
//   - isProduct (below)
//   - pages/Companies/CompanyProgramme.jsx — the rows of the tab
//   - Provenance.jsx — the earlier products, in order
// -----------------------------------------------------------

export const KIND_ORDER = ['policy', 'governance', 'risks'];







// -----------------------------------------------------------
// EXPORT_FORMATS
// -----------------------------------------------------------
//
// The formats each kind is exported in, in the order of their
// buttons: every kind as a PDF, the policy also as a Word
// file, the register also as a workbook.
//
// Used by:
//   - ProductExports.jsx
// -----------------------------------------------------------

export const EXPORT_FORMATS = { policy: ['pdf', 'docx'], governance: ['pdf'], risks: ['pdf', 'xlsx'] };







// -----------------------------------------------------------
// KIND_STEPS
// -----------------------------------------------------------
//
// The steps of a generation job per kind, in the order the
// job runs them: the documents are read, the kind's two
// parts are written, the references are checked.
//
// Used by:
//   - runProgress (below)
// -----------------------------------------------------------

export const KIND_STEPS = {
  policy: ['documents', 'policy', 'document_gaps', 'references'],
  governance: ['documents', 'structure', 'process_raci', 'references'],
  risks: ['documents', 'criteria', 'scenarios', 'references'],
};







// -----------------------------------------------------------
// KIND_TABS
// -----------------------------------------------------------
//
// The content tabs of each kind's page, in order — also the
// values of ?tab=. The provenance tab follows them on every
// kind.
//
// Used by:
//   - ProductPage.jsx
// -----------------------------------------------------------

export const KIND_TABS = {
  policy: ['policy', 'documents'],
  governance: ['structure', 'raci', 'positions'],
  risks: ['register', 'criteria'],
};







// -----------------------------------------------------------
// LINES
// -----------------------------------------------------------
//
// The lines of the three lines model a node or a position
// stands on, with the governing bodies above them and
// external assurance beside them.
//
// Used by:
//   - GovernanceStructure.jsx — a node's line
//   - GovernancePositions.jsx — a position's and a gap's line
// -----------------------------------------------------------

export const LINES = ['governing', 'first', 'second', 'third', 'external'];







// -----------------------------------------------------------
// NODE_KINDS
// -----------------------------------------------------------
//
// What a node of the structure can be.
//
// Used by:
//   - GovernanceStructure.jsx
// -----------------------------------------------------------

export const NODE_KINDS = ['body', 'committee', 'function', 'unit'];







// -----------------------------------------------------------
// RACI_VALUES
// -----------------------------------------------------------
//
// The letters a role may hold in a step: responsible,
// accountable, both at once, consulted, informed.
//
// Used by:
//   - GovernanceRaci.jsx — the choices of a cell
// -----------------------------------------------------------

export const RACI_VALUES = ['R', 'A', 'AR', 'C', 'I'];







// -----------------------------------------------------------
// LEVELS
// -----------------------------------------------------------
//
// The levels of the document hierarchy in the order they are
// read: the policy level, thematic policies, procedures and
// instructions — and 0 last, for a text that is no rule.
//
// Used by:
//   - PolicyDocuments.jsx — the groups, a document's level
// -----------------------------------------------------------

export const LEVELS = [1, 2, 3, 0];







// -----------------------------------------------------------
// MISSING_LEVELS
// -----------------------------------------------------------
//
// The levels a missing document may have: the policy itself
// is the first level, so what is missing lies below it.
//
// Used by:
//   - PolicyDocuments.jsx — a missing document's level
// -----------------------------------------------------------

export const MISSING_LEVELS = [2, 3];







// -----------------------------------------------------------
// PRIORITIES
// -----------------------------------------------------------
//
// The priorities of a missing document, the most urgent
// first.
//
// Used by:
//   - PolicyDocuments.jsx
// -----------------------------------------------------------

export const PRIORITIES = ['high', 'medium', 'low'];







// -----------------------------------------------------------
// RESPONSES
// -----------------------------------------------------------
//
// The responses to a risk the method knows.
//
// Used by:
//   - ScenarioCard.jsx, ScenarioEditor.jsx — a scenario's response
//   - RiskCriteria.jsx — the responses a band allows
// -----------------------------------------------------------

export const RESPONSES = ['accept', 'increase', 'mitigate', 'transfer', 'avoid'];







// -----------------------------------------------------------
// LIKELIHOOD_DIMENSIONS
// -----------------------------------------------------------
//
// The four dimensions a scenario's likelihood is scored on,
// in the order of the criteria table's columns.
//
// Used by:
//   - scenarioUnset, scenarioPending (below)
//   - ScenarioCard.jsx, ScenarioEditor.jsx, RiskCriteria.jsx
//   - RiskRegister.jsx — the scores of a new scenario
// -----------------------------------------------------------

export const LIKELIHOOD_DIMENSIONS = ['control', 'clarity', 'counterparty', 'frequency'];







// -----------------------------------------------------------
// IMPACT_DIMENSIONS
// -----------------------------------------------------------
//
// The four dimensions a scenario's impact is scored on, in
// the order of the criteria table's columns.
//
// Used by:
//   - scenarioUnset, scenarioPending (below)
//   - ScenarioCard.jsx, ScenarioEditor.jsx, RiskCriteria.jsx
//   - RiskRegister.jsx — the scores of a new scenario
// -----------------------------------------------------------

export const IMPACT_DIMENSIONS = ['financial', 'regulatory', 'reputation', 'reach'];







// -----------------------------------------------------------
// SOURCES
// -----------------------------------------------------------
//
// The two sources a step of the compliance process may rest
// on, as the backend names them: a clause of ISO 37301 or a
// paragraph of the Bank of Lithuania's guidelines. They are
// names of documents and read the same in both languages.
//
// Used by:
//   - GovernanceProcess.jsx — the source of a step's basis
// -----------------------------------------------------------

export const SOURCES = ['ISO 37301', 'LB gairės'];







// -----------------------------------------------------------
// CATEGORIES
// -----------------------------------------------------------
//
// The six types of legal risk of ISO 31022 (Annex A) by
// their numbers; their names are the riskCategory enum's.
//
// Used by:
//   - ScenarioEditor.jsx — the types a scenario is given
// -----------------------------------------------------------

export const CATEGORIES = [1, 2, 3, 4, 5, 6];







// -----------------------------------------------------------
// TYPOLOGIES
// -----------------------------------------------------------
//
// The three typologies of the lecture a scenario is placed in
// beside its type of legal risk — what the risk comes from,
// what it costs, what it threatens. Each row: the scenario's
// field, the enum its names are under, and the numbers the
// backend takes (programme/risks.py).
//
// Used by:
//   - ScenarioCard.jsx — the line under the scenario's types
//   - ScenarioEditor.jsx — the three choices of a scenario
// -----------------------------------------------------------

export const TYPOLOGIES = [
  { field: 'sourceType', group: 'riskSource', values: [1, 2, 3, 4, 5, 6] },
  { field: 'consequenceType', group: 'riskConsequence', values: [1, 2, 3, 4, 5] },
  { field: 'objectiveType', group: 'riskObjective', values: [1, 2, 3, 4, 5] },
];







// -----------------------------------------------------------
// MAX_CATEGORIES
// -----------------------------------------------------------
//
// How many types of legal risk one scenario may carry — the
// backend keeps the first two and drops the rest, so the
// page does not let a third be chosen.
//
// Used by:
//   - ScenarioEditor.jsx — the types a scenario is given
// -----------------------------------------------------------

export const MAX_CATEGORIES = 2;







// -----------------------------------------------------------
// BAND_TINTS
// -----------------------------------------------------------
//
// The five steps of the risk matrix's ramp, as the exported
// PDF draws them: a band's ground and the ink that reads on
// it — white on the two darkest. A band outside the table
// has no tint.
//
// Used by:
//   - RiskMatrix.jsx — the cells and the legend
//   - ScenarioCard.jsx — a scenario's level
//   - RiskCriteria.jsx — the appetite's bands
// -----------------------------------------------------------

export const BAND_TINTS = {
  negligible: { backgroundColor: '#EEF3FA', color: '#161E2B' },
  tolerable: { backgroundColor: '#C9D9EF', color: '#161E2B' },
  medium: { backgroundColor: '#8FB1E3', color: '#161E2B' },
  high: { backgroundColor: '#3E6FB0', color: '#FFFFFF' },
  critical: { backgroundColor: '#173A6E', color: '#FFFFFF' },
};







// -----------------------------------------------------------
// RACI_TINTS
// -----------------------------------------------------------
//
// The two filled cells of the RACI matrix, as the exported
// PDF draws them: the accountable role in ink, a responsible
// one pale blue.
//
// Used by:
//   - GovernanceRaci.jsx
// -----------------------------------------------------------

export const RACI_TINTS = {
  accountable: { backgroundColor: '#173A6E', color: '#FFFFFF' },
  responsible: { backgroundColor: '#C9D9EF', color: '#161E2B' },
};







// -----------------------------------------------------------
// listOf
// -----------------------------------------------------------
//
// The objects of a list, or an empty list for anything that
// is not one — a product's content is read defensively, so a
// malformed answer shows less instead of breaking the page.
//
// Used by:
//   - brokenRules (below)
//   - programmeApi.js — the list answer
//   - every view of a product's content under this folder
// -----------------------------------------------------------

export function listOf(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [];
}







// -----------------------------------------------------------
// isActive
// -----------------------------------------------------------
//
// A product whose generation is still on its way — queued or
// running. Such a product is polled, has nothing to show but
// its progress, and can be cancelled.
//
// Used by:
//   - ProductPage.jsx — the poll, the progress face
//   - pages/Companies/CompanyProgramme.jsx — the tab's poll
//   - pages/Chat/ToolCards.jsx — the product card's poll
// -----------------------------------------------------------

export function isActive(product) {
  return ['queued', 'running'].includes(product?.status);
}







// -----------------------------------------------------------
// runProgress
// -----------------------------------------------------------
//
// Where a generation stands, read off the progress the
// product repeats from its job: the steps of its kind, the
// place of the step that is running among them (-1 while
// none is named — a queued run, an older answer), and the
// percentage of the run that step begins at, or nothing when
// the progress carries no number.
//
// Used by:
//   - ProductProgress.jsx — the steps and the bar
//   - pages/Companies/CompanyProgramme.jsx — a running
//     version's line
//   - pages/Chat/ToolCards.jsx — a running product's card
// -----------------------------------------------------------

export function runProgress(product) {
  const steps = KIND_STEPS[product?.kind] ?? [];
  const progress = product?.progress && typeof product.progress === 'object' ? product.progress : {};
  const reported = progress.percent == null ? NaN : Number(progress.percent);
  return { steps, index: steps.indexOf(progress.step), percent: Number.isFinite(reported) ? Math.min(100, Math.max(0, reported)) : null };
}







// -----------------------------------------------------------
// isProduct
// -----------------------------------------------------------
//
// Whether an answer is a product the page can draw: an
// object with an id and one of the three kinds. Anything
// else — null, a list, an empty object, a kind this build
// does not know — is a failed load.
//
// Used by:
//   - programmeApi.js — fetchProduct
// -----------------------------------------------------------

export function isProduct(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && ['string', 'number'].includes(typeof value.id) && KIND_ORDER.includes(value.kind);
}







// -----------------------------------------------------------
// brokenRules
// -----------------------------------------------------------
//
// The rules of its kind a product breaks, apart: the
// blocking ones, which keep it from approval, and the others,
// which are notes for the reviewer.
//
// Used by:
//   - RulesPanel.jsx, ProductPage.jsx — what stops an approval
//   - pages/Companies/CompanyProgramme.jsx — a draft's state
//   - pages/Chat/ToolCards.jsx — a product card's counts
// -----------------------------------------------------------

export function brokenRules(checks) {
  const broken = listOf(checks).filter((check) => check.ok === false);
  return { blocking: broken.filter((check) => check.blocking !== false), notes: broken.filter((check) => check.blocking === false) };
}







// -----------------------------------------------------------
// nextId
// -----------------------------------------------------------
//
// An id for a row added on the page — a node of a structure,
// a step of a process: the given letter and the number after
// the highest one any row's id ends in, so it collides with
// none, the removed ones of this editing session aside.
//
// Used by:
//   - GovernanceStructure.jsx — a new node
//   - GovernanceRaci.jsx — a new step
// -----------------------------------------------------------

export function nextId(rows, letter) {
  const used = rows.map((row) => Number(String(row.id ?? '').replace(/^\D+/, ''))).filter(Number.isFinite);
  return `${letter}${Math.max(0, ...used) + 1}`;
}







// -----------------------------------------------------------
// provisionLabel
// -----------------------------------------------------------
//
// A provision as it is cited. Looked up, it is the act's
// short title and the provision's path; where the corpus
// found neither — or has not been asked yet — the act and
// the article as they were named, the paragraph in brackets.
//
// Used by:
//   - ProvisionLinks.jsx
// -----------------------------------------------------------

export function provisionLabel(entry) {
  const named = [entry.article, entry.paragraph ? `(${entry.paragraph})` : ''].filter(Boolean).join('');
  return [entry.shortTitle || entry.act, entry.path || named].filter(Boolean).join(' ') || '—';
}







// -----------------------------------------------------------
// provisionPending
// -----------------------------------------------------------
//
// A provision a person added on the page and the server has
// not looked up yet: it carries no status. The page says it
// will be checked on the save instead of marking it found or
// not.
//
// Used by:
//   - provisionFlag (below)
//   - ProvisionLinks.jsx
// -----------------------------------------------------------

export function provisionPending(entry) {
  return !entry.status;
}







// -----------------------------------------------------------
// provisionFlag
// -----------------------------------------------------------
//
// What a reviewer must know about a provision before relying
// on it: its act does not have it, the corpus does not hold
// the act, or it regulates something other than what it was
// named for. Nothing for a provision that stands, and
// nothing for one the server has not looked up yet.
//
// Used by:
//   - ProvisionLinks.jsx — the warning mark and its words
// -----------------------------------------------------------

export function provisionFlag(entry) {
  if (provisionPending(entry)) return null;
  if (entry.status === 'not_found' || entry.status === 'act_not_in_corpus') return entry.status;
  return entry.match === 'mismatch' ? 'mismatch' : null;
}







// -----------------------------------------------------------
// paragraphs
// -----------------------------------------------------------
//
// A plain text as its paragraphs: the backend separates them
// with a blank line.
//
// Used by:
//   - PolicyParts.jsx — a part's text
// -----------------------------------------------------------

export function paragraphs(text) {
  return String(text ?? '').split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
}







// -----------------------------------------------------------
// patchAt
// -----------------------------------------------------------
//
// A list with the row at `index` merged with `patch` — the
// one way the editors change a row, so the content is never
// mutated in place.
//
// Used by:
//   - PolicyParts.jsx, PolicyDocuments.jsx,
//     GovernanceStructure.jsx, GovernanceRaci.jsx,
//     GovernanceProcess.jsx, RiskRegister.jsx,
//     RiskCriteria.jsx
// -----------------------------------------------------------

export function patchAt(list, index, patch) {
  return list.map((row, at) => (at === index ? { ...row, ...patch } : row));
}







// -----------------------------------------------------------
// withoutAt
// -----------------------------------------------------------
//
// A list without the row at `index`.
//
// Used by:
//   - PolicyParts.jsx, PolicyDocuments.jsx,
//     GovernanceProcess.jsx, RiskRegister.jsx,
//     ScenarioEditor.jsx
// -----------------------------------------------------------

export function withoutAt(list, index) {
  return list.filter((_, at) => at !== index);
}







// -----------------------------------------------------------
// raciValue
// -----------------------------------------------------------
//
// The letter a role holds in a step, or an empty string.
//
// Used by:
//   - GovernanceRaci.jsx — a cell of the matrix
// -----------------------------------------------------------

export function raciValue(raci, stepId, roleId) {
  return raci.find((cell) => cell.stepId === stepId && cell.roleId === roleId)?.value ?? '';
}







// -----------------------------------------------------------
// goldenRule
// -----------------------------------------------------------
//
// How one step stands against the golden rule of RACI as its
// cells are right now: how many roles are accountable ("A"
// or "AR" — there must be exactly one) and whether any is
// responsible ("R" or "AR"). The page marks a breach the
// moment a cell changes; the server's own check follows on
// the save.
//
// Used by:
//   - GovernanceRaci.jsx — the mark on a step's row
// -----------------------------------------------------------

export function goldenRule(raci, stepId) {
  const letters = raci.filter((cell) => cell.stepId === stepId).map((cell) => String(cell.value ?? ''));
  const accountable = letters.filter((value) => value.includes('A')).length;
  const responsible = letters.some((value) => value.includes('R'));
  return { accountable, responsible, kept: accountable === 1 && responsible };
}







// -----------------------------------------------------------
// NEW_SCENARIO
// -----------------------------------------------------------
//
// What the id of a scenario added on the page starts with.
// The register's ids — LR-01 and on — are the server's: it
// numbers the scenarios anew on every save. Until then a
// new scenario carries a handle of the page's own, which is
// never shown as an id.
//
// Used by:
//   - isNewScenario (below)
//   - RiskRegister.jsx — "add a scenario"
// -----------------------------------------------------------

export const NEW_SCENARIO = 'new-';







// -----------------------------------------------------------
// isNewScenario
// -----------------------------------------------------------
//
// Whether a scenario was added on the page and has not been
// saved — it has no id of the register yet.
//
// Used by:
//   - RiskRegister.jsx — the name a new scenario goes by
// -----------------------------------------------------------

export function isNewScenario(scenario) {
  return String(scenario.id ?? '').startsWith(NEW_SCENARIO);
}







// -----------------------------------------------------------
// scenarioUnset
// -----------------------------------------------------------
//
// Whether any of a scenario's eight scores is not given — a
// level outside 1 to 5, which is how a score nobody has set
// yet travels. Such a scenario has no level, no score and no
// band, on the page as on the server: it reads "not scored"
// until a person sets every one.
//
// Used by:
//   - RiskRegister.jsx — what the matrix and the pending
//     line leave out
//   - ScenarioCard.jsx — the level of a scenario
// -----------------------------------------------------------

export function scenarioUnset(scenario) {
  const given = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
  return !LIKELIHOOD_DIMENSIONS.every((name) => given(scenario.likelihood?.[name]))
    || !IMPACT_DIMENSIONS.every((name) => given(scenario.impact?.[name]));
}







// -----------------------------------------------------------
// scenarioPending
// -----------------------------------------------------------
//
// Whether a scenario's eight scores differ from the ones the
// server last worked its levels out of — or the server has
// not seen the scenario at all. Its likelihood, impact,
// score and band are then stale, and the page shows them as
// pending rather than guess.
//
// Used by:
//   - RiskRegister.jsx — the matrix, the cards and the form
// -----------------------------------------------------------

export function scenarioPending(scenario, saved) {
  if (!saved) return true;
  return LIKELIHOOD_DIMENSIONS.some((name) => scenario.likelihood?.[name] !== saved.likelihood?.[name])
    || IMPACT_DIMENSIONS.some((name) => scenario.impact?.[name] !== saved.impact?.[name]);
}







// -----------------------------------------------------------
// bandOfCell
// -----------------------------------------------------------
//
// The band a cell of the matrix belongs to, read off the
// appetite table the server sent: the band whose range holds
// the cell's score. Nothing when no range does.
//
// Used by:
//   - RiskMatrix.jsx — a cell's tint
// -----------------------------------------------------------

export function bandOfCell(appetite, score) {
  return appetite.find((row) => Number(row.from) <= score && score <= Number(row.to))?.band ?? null;
}
