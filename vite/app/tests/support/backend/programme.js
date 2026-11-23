// -----------------------------------------------------------
//  [*] Test support — the work products of a programme
//
//  The answers of the programme routes (Django's
//  programme/api/views.py) for the fixture world: UAB
//  Pavyzdys has a compliance policy in two versions — the
//  first approved by the administrator, the second a draft
//  that names an article its act does not have, so a
//  blocking rule of its kind is broken — a draft of the
//  governance product that keeps every blocking rule, a
//  draft risk register, and a second version of the register
//  being generated right now, with its job. UAB Kreditas has
//  none.
//
//  The contents are three real products, cut down
//  (programme/*.json: three parts of the policy, seven nodes
//  and five steps of the governance product, five scenarios
//  of the register) with every field the serializer writes.
//  The company's name was replaced with the fixture world's;
//  the documents they quote are the real run's, not the
//  fixture company's library — a product carries their
//  titles itself. Here they are bound to the world's ids,
//  people and clock.
//
//  The double keeps no state, so an edit is answered and
//  forgotten: `normalise` brings an edited content into its
//  stored shape and runs the rules of the kind over it the
//  way the kinds' validate functions do (policy.py,
//  governance.py, risks.py) — the levels, the score and the
//  band of a scenario are worked out there, never taken from
//  the request — a scenario with a score left unset comes
//  back unscored. A provision a person added (it carries no
//  status yet) comes back looked up: found, with its path
//  and the address of its official text, when its act is one
//  the fixture world's corpus holds (CORPUS — the acts the
//  three products cite), not found otherwise; a provision
//  that was looked up before is kept as the request carries
//  it, and so is every placed quote. A scenario's policies
//  are kept when they are documents the product was made
//  from, under those documents' titles.
//
//  Split into:
//
//    KINDS               — the kinds and what each builds on
//    BANDS               — the bands of the risk matrix
//    FORMATS             — the formats a kind exports in
//    bound               — a real product in the fixture world
//    withoutUnfound      — a policy without unfound provisions
//    listed              — a product without its content
//    products            — the list rows of the fixture world
//    product             — one product with its content
//    companyProgramme    — a company's products and the kinds
//    newProduct          — the queued product a start answers
//    revisedProduct      — the draft a revision answers
//    productJob          — the job of the product being generated
//    check, text, rows   — the normalisers' small tools
//    CORPUS              — the acts the fixture corpus holds
//    lookedUp            — a provision, looked up
//    provisionsOf        — a legal basis, looked up
//    provisionChecks     — the rules about provisions
//    normalisePolicy     — a policy, checked again
//    normaliseGovernance — a governance product, checked again
//    bandOf              — the band of a score
//    normaliseRisks      — a register, scored and checked again
//    normalise           — an edited content, checked again
//    chartSvg            — a structure drawn as a tree
//    productExport       — a product as a file
//
//  Used by:
//    - handlers.js — the programme routes
//    - tests — the values they send and assert on
// -----------------------------------------------------------

import policyFile from './programme/policy.json';
import governanceFile from './programme/governance.json';
import risksFile from './programme/risks.json';
import { ID, NOW, adminUser, plainUser, me } from './fixtures';


// The model every product of the fixture world was written by
const MODEL = 'gateway:azure/gpt-6.1-sol';

// What a product that has not been generated yet carries
const EMPTY = {
  checks: [], basis: {}, stats: {}, error: null, startedAt: null, finishedAt: null, editedByName: null, editedAt: null,
  approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
};

// The parts of a policy in their order, the shortest text a
// part may have, and the values a missing document may take
const PART_KEYS = ['purpose', 'commitment', 'mandate', 'compliance', 'roles', 'processes', 'whistleblowing', 'consequences'];
const MIN_PART_CHARS = 150;
const PRIORITIES = ['high', 'medium', 'low'];

// The values of a governance product, and its shortest process
const LINES = ['governing', 'first', 'second', 'third', 'external'];
const NODE_KINDS = ['body', 'committee', 'function', 'unit'];
const RACI = ['R', 'A', 'AR', 'C', 'I'];
const MIN_STEPS = 5;

// The dimensions a scenario is scored on, the responses, the
// fewest scenarios and types of legal risk a register holds,
// and the words its sentence turns on
const LIKELIHOOD = ['control', 'clarity', 'counterparty', 'frequency'];
const IMPACT = ['financial', 'regulatory', 'reputation', 'reach'];
const RESPONSES = ['accept', 'increase', 'mitigate', 'transfer', 'avoid'];
const MIN_SCENARIOS = 5;
const MIN_CATEGORIES = 4;
const FORM = { lt: ['tikėtin', 'kylan', 'gali sukelti', 'paveik'], en: ['likely', 'arising from', 'may cause', 'affect'] };

// The colours the backend's chart gives a line: fill, stroke, text
const CHART_COLOURS = {
  governing: ['#173A6E', '#173A6E', '#FFFFFF'],
  first: ['#EEF3FA', '#8FB1E3', '#16202E'],
  second: ['#FFFFFF', '#3E6FB0', '#16202E'],
  third: ['#FFF6CC', '#C9A400', '#16202E'],
  external: ['#F4F6F9', '#A9B3C1', '#16202E'],
};

// The first bytes of each export and its content type
const EXPORT_BYTES = { pdf: '%PDF-1.7\n', docx: 'PK\u0003\u0004docx', xlsx: 'PK\u0003\u0004xlsx' };
const EXPORT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Lithuanian letters as the export's file name folds them
const FOLD = { ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z', Ą: 'A', Č: 'C', Ę: 'E', Ė: 'E', Į: 'I', Š: 'S', Ų: 'U', Ū: 'U', Ž: 'Z' };







// -----------------------------------------------------------
// KINDS
// -----------------------------------------------------------
//
// The kinds of work product in their order, each with its
// title in both languages and the kinds it builds on — the
// `kinds` of GET /api/companies/{id}/programme.
//
// Used by:
//   - companyProgramme, newProduct (below)
//   - tests — the titles the company tab shows
// -----------------------------------------------------------

export const KINDS = [
  { kind: 'policy', title: { lt: 'Atitikties politika', en: 'Compliance policy' }, needs: [] },
  { kind: 'governance', title: { lt: 'Valdymo struktūra, atitikties procesas ir RACI', en: 'Structure, compliance process and RACI' }, needs: ['policy'] },
  { kind: 'risks', title: { lt: 'Teisinės atitikties rizikos vertinimo kriterijai ir registras', en: 'Legal compliance risk criteria and register' }, needs: ['policy', 'governance'] },
];







// -----------------------------------------------------------
// BANDS
// -----------------------------------------------------------
//
// The five bands of the risk matrix as risks.py holds them:
// the scores each covers, its name in both languages and the
// responses it allows.
//
// Used by:
//   - normalise (below) — a scenario's band, the appetite
//   - tests — the band a score must land in
// -----------------------------------------------------------

export const BANDS = {
  negligible: { from: 1, to: 3, lt: 'Nereikšminga', en: 'Negligible', responses: ['accept', 'increase'] },
  tolerable: { from: 4, to: 6, lt: 'Toleruotina', en: 'Tolerable', responses: ['accept', 'mitigate'] },
  medium: { from: 8, to: 12, lt: 'Vidutinė', en: 'Medium', responses: ['mitigate', 'transfer'] },
  high: { from: 15, to: 16, lt: 'Didelė', en: 'High', responses: ['mitigate', 'avoid'] },
  critical: { from: 20, to: 25, lt: 'Kritinė', en: 'Critical', responses: ['avoid'] },
};







// -----------------------------------------------------------
// FORMATS
// -----------------------------------------------------------
//
// The formats each kind exports in (exports.py FORMATS).
//
// Used by:
//   - productExport (below)
//   - tests — the export buttons a kind offers
// -----------------------------------------------------------

export const FORMATS = { policy: ['pdf', 'docx'], governance: ['pdf'], risks: ['pdf', 'xlsx'] };







// -----------------------------------------------------------
// bound
// -----------------------------------------------------------
//
// A real product as the fixture world holds it: of UAB
// Pavyzdys, started by its owner, resting on the company's
// finished report, with the stamps and the earlier products
// the caller gives. Its job is done, and its progress is the
// line the job ended on — the last step, which begins at 92
// per cent of a run.
//
// Used by:
//   - the products (below)
// -----------------------------------------------------------

function bound(file, { builtOn = {}, ...own }) {
  return {
    ...file,
    companyId: ID.pavyzdys,
    companyName: 'UAB Pavyzdys',
    createdBy: ID.jonas,
    basis: { ...file.basis, reportId: ID.reportDone, products: builtOn },
    progress: { step: 'references', percent: 92, message: null },
    jobStatus: 'done',
    ...own,
  };
}







// -----------------------------------------------------------
// withoutUnfound
// -----------------------------------------------------------
//
// A policy's content without the provisions the corpus does
// not hold — the first version, as it was approved.
//
// Used by:
//   - policyApproved (below)
// -----------------------------------------------------------

function withoutUnfound(content) {
  return { ...content, parts: content.parts.map((part) => ({ ...part, legalBasis: part.legalBasis.filter((entry) => entry.status === 'found') })) };
}


// The policy's second version: a draft whose last part names
// an article its act does not have
const policyDraft = bound(policyFile, {
  id: ID.productPolicy, version: 2, jobId: 'b0000000-0000-4000-8000-0000000000d2',
  createdAt: '2026-09-25T13:02:00+00:00', startedAt: '2026-09-25T13:02:03+00:00', finishedAt: '2026-09-25T13:08:11+00:00',
});

// The policy's first version, approved by the administrator
const policyApproved = bound(policyFile, {
  id: ID.productPolicyApproved, version: 1, status: 'approved', jobId: 'b0000000-0000-4000-8000-0000000000d1',
  content: withoutUnfound(policyFile.content),
  checks: policyFile.checks.map((check) => ({ ...check, ok: true, detail: '' })),
  stats: { ...policyFile.stats, tokens: 158412, costUsd: 0.5127 },
  createdAt: '2026-09-22T08:40:00+00:00', startedAt: '2026-09-22T08:40:02+00:00', finishedAt: '2026-09-22T08:46:30+00:00',
  approvedBy: ID.admin, approvedByName: adminUser.displayName, approvedAt: '2026-09-23T09:10:00+00:00',
  approvalNote: 'Patvirtinta valdybos posėdyje (protokolas Nr. 14).',
});

// The governance product: a draft its owner has edited once
const governanceDraft = bound(governanceFile, {
  id: ID.productGovernance, version: 1, jobId: 'b0000000-0000-4000-8000-0000000000d3',
  builtOn: { policy: { id: ID.productPolicy, version: 2, status: 'draft' } },
  createdAt: '2026-09-25T13:20:00+00:00', startedAt: '2026-09-25T13:20:02+00:00', finishedAt: '2026-09-25T13:25:44+00:00',
  editedByName: plainUser.displayName, editedAt: '2026-09-26T09:15:00+00:00',
});

// The risk register's first version, a draft
const risksDraft = bound(risksFile, {
  id: ID.productRisks, version: 1, jobId: 'b0000000-0000-4000-8000-0000000000d4',
  builtOn: {
    policy: { id: ID.productPolicy, version: 2, status: 'draft' },
    governance: { id: ID.productGovernance, version: 1, status: 'draft' },
  },
  createdAt: '2026-09-26T10:05:00+00:00', startedAt: '2026-09-26T10:05:02+00:00', finishedAt: '2026-09-26T10:09:58+00:00',
});

// How far the register's generation has come: the scenarios,
// the step that begins halfway through a run — what the job
// reports and the product repeats
const RUNNING_PROGRESS = { step: 'scenarios', percent: 50, message: null };

// The register's second version, being generated: no content
// yet, and a job that has reached its scenarios
const risksRunning = {
  ...EMPTY,
  id: ID.productRisksRunning, companyId: ID.pavyzdys, companyName: 'UAB Pavyzdys', kind: 'risks', version: 2, language: 'lt',
  status: 'running', title: KINDS[2].title.lt, jobId: ID.jobProductRunning, createdBy: ID.admin,
  createdAt: '2026-09-27T09:56:00+00:00', startedAt: '2026-09-27T09:56:02+00:00',
  progress: RUNNING_PROGRESS, jobStatus: 'running', content: {},
};

// Every product with its content, by kind and newest first —
// the order the list route answers in
const FULL = [governanceDraft, policyDraft, policyApproved, risksRunning, risksDraft];







// -----------------------------------------------------------
// listed
// -----------------------------------------------------------
//
// A product as the list and the cancel route answer it:
// everything but the content.
//
// Used by:
//   - products, newProduct (below)
//   - handlers.js — the cancel route
// -----------------------------------------------------------

export function listed(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'content'));
}







// -----------------------------------------------------------
// products
// -----------------------------------------------------------
//
// The rows of GET /api/companies/{id}/programme for UAB
// Pavyzdys, ordered by kind and newest version first: the
// governance draft; the policy's draft and its approved
// first version; the register being generated and its first
// draft.
//
// Used by:
//   - companyProgramme, newProduct, revisedProduct (below)
//   - tests — the rows the company tab shows
// -----------------------------------------------------------

export const products = FULL.map(listed);







// -----------------------------------------------------------
// product
// -----------------------------------------------------------
//
// GET /api/programme/{id}: the product with its content, its
// job's progress and status; undefined for an unknown id.
// The id a start or a revision hands out answers the queued
// policy a start would have made — the double keeps no
// state.
//
// Used by:
//   - handlers.js — every /api/programme/{id} route
//   - tests — the product a page opens
// -----------------------------------------------------------

export function product(id) {
  if (id === ID.newProduct) return { ...newProduct({ kind: 'policy', language: 'lt', companyId: ID.pavyzdys }), content: {} };
  return FULL.find((row) => row.id === id);
}







// -----------------------------------------------------------
// companyProgramme
// -----------------------------------------------------------
//
// GET /api/companies/{id}/programme: the company's products
// in the list shape and the kinds there are.
//
// Used by:
//   - handlers.js — the list route
//   - tests — the answer the company tab starts from
// -----------------------------------------------------------

export function companyProgramme(companyId) {
  return { products: products.filter((row) => row.companyId === companyId), kinds: KINDS };
}







// -----------------------------------------------------------
// newProduct
// -----------------------------------------------------------
//
// What POST /api/companies/{id}/programme answers: the next
// version of the kind, queued, titled with the kind's title
// in the language asked for, started by the caller.
//
// Used by:
//   - handlers.js — the start route
//   - product (above) — the id a start hands out
// -----------------------------------------------------------

export function newProduct({ kind, language, companyId }) {
  const earlier = products.filter((row) => row.companyId === companyId && row.kind === kind);
  return {
    ...EMPTY,
    id: ID.newProduct, companyId, companyName: companyId === ID.pavyzdys ? 'UAB Pavyzdys' : 'UAB Kreditas', kind,
    version: Math.max(0, ...earlier.map((row) => row.version)) + 1, language, status: 'queued',
    title: KINDS.find((row) => row.kind === kind).title[language], jobId: ID.newJob, createdBy: me.id, createdAt: NOW,
    progress: {}, jobStatus: 'queued',
  };
}







// -----------------------------------------------------------
// revisedProduct
// -----------------------------------------------------------
//
// What POST /api/programme/{id}/revise answers for an
// approved product: a draft one version on, with the
// approved one's content and checks, saying which product it
// was revised from — and no job, so no progress either.
//
// Used by:
//   - handlers.js — the revise route
//   - tests — the draft a revision opens
// -----------------------------------------------------------

export function revisedProduct(approved) {
  const row = Object.fromEntries(Object.entries(approved).filter(([key]) => !['progress', 'jobStatus'].includes(key)));
  const newest = Math.max(...products.filter((other) => other.companyId === row.companyId && other.kind === row.kind).map((other) => other.version), row.version);
  return {
    ...row, ...EMPTY,
    id: ID.newProduct, version: newest + 1, status: 'draft', checks: row.checks, stats: {}, jobId: null,
    basis: { ...row.basis, revisedFrom: row.id }, createdBy: me.id, createdAt: NOW, finishedAt: NOW,
  };
}







// -----------------------------------------------------------
// productJob
// -----------------------------------------------------------
//
// GET /api/jobs/{id} for the register being generated: the
// documents are read, the criteria written — with what that
// call used — and the scenarios are being written, which is
// also what the job's progress says. undefined for any other
// id.
//
// Used by:
//   - handlers.js — GET /api/jobs/{id}, when the jobs of
//     fixtures.js do not know the id
// -----------------------------------------------------------

export function productJob(id) {
  if (id !== ID.jobProductRunning) return undefined;
  const step = (ordinal, name, startedAt, finishedAt, extra = {}) => ({
    id: `b1000000-0000-4000-8000-000000000c0${ordinal}`, ordinal, name, status: finishedAt ? 'done' : 'running',
    promptVersionId: null, model: null, inputRef: {}, output: null, usage: {}, prompt: null,
    durationMs: finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : null, error: null, startedAt, finishedAt, ...extra,
  });
  const used = { calls: 1, inputTokens: 61240, outputTokens: 3890, costUsd: 0.1312 };
  return {
    id: ID.jobProductRunning, kind: 'programme.generate', subject: `product:${ID.productRisksRunning}`, status: 'running', priority: 0,
    progress: RUNNING_PROGRESS, result: null, error: null, attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: ID.admin,
    createdAt: '2026-09-27T09:56:00+00:00', startedAt: '2026-09-27T09:56:02+00:00', finishedAt: null,
    steps: [
      step(1, 'documents', '2026-09-27T09:56:02+00:00', '2026-09-27T09:56:04+00:00', { output: { documents: 16 } }),
      step(2, 'criteria', '2026-09-27T09:56:04+00:00', '2026-09-27T09:57:02+00:00', {
        model: MODEL, output: { likelihood: 5, impact: 5 }, prompt: { slug: 'programme.risk_criteria', version: 2 },
        usage: { ...used, models: [{ model: MODEL, ...used }] },
      }),
      step(3, 'scenarios', '2026-09-27T09:57:02+00:00', null),
    ],
  };
}







// -----------------------------------------------------------
// check
// -----------------------------------------------------------
//
// One rule of a kind as a content met or broke it (run.py
// check).
//
// Used by:
//   - normalisePolicy, normaliseGovernance, normaliseRisks
//     (below)
// -----------------------------------------------------------

function check(rule, ok, detail = '', blocking = true) {
  return { rule, ok: Boolean(ok), blocking, detail };
}







// -----------------------------------------------------------
// text
// -----------------------------------------------------------
//
// A value as stored text: trimmed and cut to the column's
// length, empty for nothing.
//
// Used by:
//   - the normalisers (below)
// -----------------------------------------------------------

function text(value, limit = 800) {
  return String(value ?? '').trim().slice(0, limit);
}







// -----------------------------------------------------------
// rows
// -----------------------------------------------------------
//
// The objects of a list, [] for anything that is not one.
//
// Used by:
//   - the normalisers (below)
// -----------------------------------------------------------

function rows(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [];
}







// -----------------------------------------------------------
// CORPUS
// -----------------------------------------------------------
//
// The acts the fixture world's legal corpus holds, as far as
// the programme goes: every act a provision of the three
// products was found in, by its short title in lower case,
// with the title as the corpus writes it and the address of
// its official text (empty for an act that has none).
//
// Used by:
//   - lookedUp (below)
//   - tests — which act a person can add a provision of
// -----------------------------------------------------------

export const CORPUS = (() => {
  const acts = new Map();
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return undefined;
    if (value.status === 'found' && value.shortTitle) {
      const known = acts.get(value.shortTitle.toLowerCase());
      const base = String(value.citationUrl ?? '').split('#')[0];
      acts.set(value.shortTitle.toLowerCase(), { shortTitle: value.shortTitle, base: known?.base || base });
    }
    return Object.values(value).forEach(walk);
  };
  [policyFile, governanceFile, risksFile].forEach((file) => walk(file.content));
  return acts;
})();







// -----------------------------------------------------------
// lookedUp
// -----------------------------------------------------------
//
// A provision as the content stores it. One that carries a
// status was looked up before and is kept. One that does
// not — a person just added it — is looked up the way
// Library.provisions answers a person's edit (run.py): the
// act, the article and the paragraph as they were named, no
// judgement of its subject, and then either found — the
// corpus's short title, the path, the address of the article
// — when CORPUS holds the act, or not found.
//
// Used by:
//   - provisionsOf (below)
// -----------------------------------------------------------

function lookedUp(entry) {
  if (entry.status) return entry;
  const [act, article, paragraph] = [text(entry.act, 300), text(entry.article, 40), text(entry.paragraph, 40)];
  const asked = { act, why: text(entry.why, 600), article, paragraph, match: null };
  const known = CORPUS.get(act.toLowerCase());
  if (!known) return { ...asked, found: false, status: 'not_found', shortTitle: act, path: '', citationUrl: '' };
  return {
    ...asked, found: true, status: 'found', shortTitle: known.shortTitle, path: `${article} str.${paragraph ? ` ${paragraph} d.` : ''}`,
    citationUrl: known.base ? `${known.base}#art_${article}` : '',
  };
}







// -----------------------------------------------------------
// provisionsOf
// -----------------------------------------------------------
//
// A legal basis in its stored shape: the entries that name
// an act and an article, each looked up.
//
// Used by:
//   - normalisePolicy, normaliseRisks (below)
// -----------------------------------------------------------

function provisionsOf(list) {
  return rows(list).filter((entry) => text(entry.act) && text(entry.article)).map(lookedUp);
}







// -----------------------------------------------------------
// provisionChecks
// -----------------------------------------------------------
//
// The three rules every kind with a legal basis shares, read
// off the provisions as the request carries them — the
// double cannot look one up: an article its act does not
// have (blocking), an act the corpus does not hold, and a
// provision named for something it does not regulate.
//
// Used by:
//   - normalisePolicy, normaliseRisks (below)
// -----------------------------------------------------------

function provisionChecks(entries) {
  const unique = (list) => [...new Set(list)].sort();
  const wrong = unique(entries.filter((entry) => entry.status === 'not_found').map((entry) => `${entry.shortTitle} ${entry.article}`));
  const unverified = unique(entries.filter((entry) => entry.status === 'act_not_in_corpus').map((entry) => entry.act));
  const mismatched = unique(entries.filter((entry) => entry.match === 'mismatch').map((entry) => `${entry.shortTitle} ${entry.path}`));
  return [
    check('provisions', wrong.length === 0, wrong.join(', ')),
    check('provisions_unverified', unverified.length === 0, unverified.join(', '), false),
    check('provision_subjects', mismatched.length === 0, mismatched.join(', '), false),
  ];
}







// -----------------------------------------------------------
// normalisePolicy
// -----------------------------------------------------------
//
// A policy's content in its stored shape and its rules
// (policy.py validate): the parts the request carries in the
// fixed order, texts trimmed, empty decisions dropped; the
// documents with a level of 0–3; the missing documents with
// a title. A part shorter than 150 characters breaks "parts".
// The quotes and the library cannot be read here, so those
// two rules keep the verdict the stored product had.
//
// Used by:
//   - normalise (below)
// -----------------------------------------------------------

function normalisePolicy(content, stored) {
  const given = Object.fromEntries(rows(content.parts).map((part) => [part.key, part]));
  const parts = PART_KEYS.filter((key) => given[key]).map((key) => ({
    ...given[key], text: String(given[key].text ?? '').trim(),
    decisions: (Array.isArray(given[key].decisions) ? given[key].decisions : []).map((entry) => text(entry, 500)).filter(Boolean),
    sources: rows(given[key].sources), legalBasis: provisionsOf(given[key].legalBasis),
  }));
  const hierarchy = rows(content.hierarchy).filter((row) => [0, 1, 2, 3].includes(row.level))
    .map((row) => ({ ...row, topic: text(row.topic, 200), note: text(row.note, 600) }));
  const missing = rows(content.missing).filter((row) => text(row.title)).map((row) => ({
    ...row, level: [2, 3].includes(row.level) ? row.level : 3, title: text(row.title, 300), purpose: text(row.purpose, 1200),
    priority: PRIORITIES.includes(row.priority) ? row.priority : 'medium', legalBasis: provisionsOf(row.legalBasis), partlyCoveredBy: rows(row.partlyCoveredBy),
  }));
  const short = parts.filter((part) => part.text.length < MIN_PART_CHARS).map((part) => part.key);
  const kept = (rule) => stored.checks.find((row) => row.rule === rule) ?? check(rule, true, '', false);
  return {
    content: { title: text(content.title, 300), parts, hierarchy, missing },
    checks: [
      check('parts', short.length === 0, short.join(', ')),
      ...provisionChecks([...parts, ...missing].flatMap((owner) => owner.legalBasis)),
      kept('quotes'),
      kept('hierarchy'),
    ],
  };
}







// -----------------------------------------------------------
// normaliseGovernance
// -----------------------------------------------------------
//
// A governance content in its stored shape and its rules
// (governance.py validate): nodes with a name and an id of
// their own, a parent that is a node (never the node
// itself), steps with a name, matrix cells that name a step
// and a node. The rules: a governing body at the root, the
// second line never under the first and the third under a
// governing body alone, at least five steps, exactly one
// accountable role and at least one responsible one in every
// step, no role in every step, no role accountable for more
// than half of them. The clauses a step rests on and the
// quotes cannot be checked here and keep their verdict.
//
// Used by:
//   - normalise (below)
// -----------------------------------------------------------

function normaliseGovernance(content, stored) {
  const seen = new Set();
  const structure = rows(content.structure).filter((row) => text(row.id) && text(row.name) && !seen.has(row.id) && seen.add(row.id)).map((row) => ({
    id: text(row.id, 40), name: text(row.name, 200), kind: NODE_KINDS.includes(row.kind) ? row.kind : 'function',
    line: LINES.includes(row.line) ? row.line : 'first', parentId: text(row.parentId, 40) || null, proposed: Boolean(row.proposed), note: text(row.note, 600),
  }));
  const byId = Object.fromEntries(structure.map((node) => [node.id, node]));
  for (const node of structure) {
    if (!byId[node.parentId] || node.parentId === node.id) node.parentId = null;
  }
  const process = rows(content.process).filter((row) => text(row.id) && text(row.name)).map((row) => ({
    id: text(row.id, 40), name: text(row.name, 200), description: text(row.description, 1000), frequency: text(row.frequency, 200), basis: rows(row.basis),
  }));
  const stepIds = new Set(process.map((step) => step.id));
  const cells = new Map();
  for (const cell of rows(content.raci)) {
    if (stepIds.has(cell.stepId) && byId[cell.roleId] && RACI.includes(cell.value)) cells.set(`${cell.stepId} ${cell.roleId}`, cell);
  }
  const raci = [...cells.values()].map(({ stepId, roleId, value }) => ({ stepId, roleId, value }));
  const letters = (stepId, letter) => raci.filter((cell) => cell.stepId === stepId && cell.value.includes(letter)).length;
  const accountable = process.filter((step) => letters(step.id, 'A') !== 1).map((step) => step.name);
  const responsible = process.filter((step) => letters(step.id, 'R') < 1).map((step) => step.name);
  const roles = [...new Set(raci.map((cell) => cell.roleId))];
  const everywhere = roles.filter((role) => process.length > 0 && process.every((step) => cells.has(`${step.id} ${role}`))).map((role) => byId[role].name);
  const heavy = roles.filter((role) => raci.filter((cell) => cell.roleId === role && cell.value.includes('A')).length * 2 > process.length).map((role) => byId[role].name);
  const subordinated = structure.filter((node) => node.parentId && (
    (node.line === 'second' && byId[node.parentId].line === 'first') || (node.line === 'third' && byId[node.parentId].line !== 'governing')
  )).map((node) => node.name);
  const kept = (rule) => stored.checks.find((row) => row.rule === rule) ?? check(rule, true, '', false);
  return {
    content: { title: text(content.title, 300), positions: rows(content.positions), gaps: rows(content.gaps), structure, process, raci },
    checks: [
      check('structure', structure.some((node) => node.parentId === null && node.line === 'governing'), structure.length ? '' : 'no structure'),
      check('independence', subordinated.length === 0, subordinated.join(', ')),
      check('process', process.length >= MIN_STEPS, String(process.length)),
      check('raci_accountable', process.length > 0 && accountable.length === 0, accountable.join(', ')),
      check('raci_responsible', process.length > 0 && responsible.length === 0, responsible.join(', ')),
      check('raci_everywhere', everywhere.length === 0, everywhere.join(', '), false),
      check('raci_heavy', heavy.length === 0, heavy.join(', '), false),
      kept('process_basis'),
      kept('quotes'),
    ],
  };
}







// -----------------------------------------------------------
// bandOf
// -----------------------------------------------------------
//
// The band of the matrix a score falls in (risks.py
// band_of): the first whose upper bound holds it.
//
// Used by:
//   - normaliseRisks (below)
// -----------------------------------------------------------

function bandOf(score) {
  return Object.keys(BANDS).find((band) => score <= BANDS[band].to) ?? 'critical';
}







// -----------------------------------------------------------
// normaliseRisks
// -----------------------------------------------------------
//
// A register's content in its stored shape and its rules
// (risks.py validate). The criteria come out level by level
// and the appetite band by band, with the fixed names, ranges
// and responses; the scenarios are numbered anew in their
// order and scored: the likelihood is the mean of its four
// dimensions with a half rounded up, the impact the highest
// of its four, the score their product, the band the
// score's — a scenario with a dimension off the scale of 1
// to 5 (0 is how an unset score travels) gets no level, no
// score and no band, and breaks "scores". A policy that is
// no document the product was made from is dropped, and a
// scenario left without one, or without a unit, breaks
// "ties".
//
// Used by:
//   - normalise (below)
// -----------------------------------------------------------

function normaliseRisks(content, stored) {
  const language = stored.language === 'en' ? 'en' : 'lt';
  const given = content.criteria && typeof content.criteria === 'object' ? content.criteria : {};
  const scale = (list, dimensions, was) => [1, 2, 3, 4, 5].map((level) => {
    const row = rows(list).find((entry) => entry.level === level) ?? {};
    return { level, name: was.find((entry) => entry.level === level)?.name ?? '', ...Object.fromEntries(dimensions.map((name) => [name, text(row[name], 500)])) };
  });
  const likelihood = scale(given.likelihood, LIKELIHOOD, stored.content.criteria.likelihood);
  const impact = scale(given.impact, IMPACT, stored.content.criteria.impact);
  const blank = likelihood.flatMap((row) => LIKELIHOOD.map((name) => row[name])).concat(impact.flatMap((row) => IMPACT.map((name) => row[name]))).filter((cell) => !cell).length;
  const appetite = Object.entries(BANDS).map(([band, fixed]) => {
    const stated = rows(content.appetite).find((row) => row.band === band) ?? {};
    return { band, name: fixed[language], from: fixed.from, to: fixed.to, responses: fixed.responses, comment: text(stated.comment), decision: text(stated.decision, 300) };
  });
  const level = (value) => (Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0);
  const library = new Map(rows(stored.basis?.documents).map((document) => [document.id, document.title]));
  const failing = { sentence: [], ties: [], scores: [], owners: [], response_fit: [], sentence_form: [] };
  const scenarios = rows(content.scenarios).map((row, index) => {
    const id = `LR-${String(index + 1).padStart(2, '0')}`;
    const chance = Object.fromEntries(LIKELIHOOD.map((name) => [name, level(row.likelihood?.[name])]));
    const harm = Object.fromEntries(IMPACT.map((name) => [name, level(row.impact?.[name])]));
    const scored = [...Object.values(chance), ...Object.values(harm)].every(Boolean);
    const t = scored ? Math.floor(Object.values(chance).reduce((sum, value) => sum + value, 0) / LIKELIHOOD.length + 0.5) : 0;
    const p = scored ? Math.max(...Object.values(harm)) : 0;
    const band = scored ? bandOf(t * p) : null;
    const sentence = text(row.sentence, 1500);
    const slots = Object.fromEntries(['event', 'source', 'consequences', 'objective'].map((slot) => [slot, text(row[slot], 600)]));
    const owners = (Array.isArray(row.owners) ? row.owners : []).map((owner) => text(owner, 200)).filter(Boolean);
    const response = RESPONSES.includes(row.response) ? row.response : 'mitigate';
    const policies = rows(row.policies).filter((entry) => library.has(entry.documentId))
      .map((entry) => ({ documentId: entry.documentId, document: library.get(entry.documentId) }));
    if (!sentence || !Object.values(slots).every(Boolean)) failing.sentence.push(id);
    if (!text(row.unit) || policies.length === 0) failing.ties.push(id);
    if (!scored) failing.scores.push(id);
    if (owners.length === 0 || !text(row.deadline)) failing.owners.push(id);
    if (band && !BANDS[band].responses.includes(response)) failing.response_fit.push(id);
    if (sentence && !FORM[language].every((marker) => sentence.toLowerCase().includes(marker))) failing.sentence_form.push(id);
    const typed = (value, highest) => (Number.isInteger(value) && value >= 1 && value <= highest ? value : null);
    return {
      id, area: text(row.area, 300), unit: text(row.unit, 200), sentence, ...slots,
      categories: [...new Set((Array.isArray(row.categories) ? row.categories : []).filter((kind) => [1, 2, 3, 4, 5, 6].includes(kind)))].sort().slice(0, 2),
      sourceType: typed(row.sourceType, 6), consequenceType: typed(row.consequenceType, 5), objectiveType: typed(row.objectiveType, 5),
      legalBasis: provisionsOf(row.legalBasis), policies,
      internalConclusion: text(row.internalConclusion, 1200), externalConclusion: text(row.externalConclusion, 1200),
      likelihood: { ...chance, level: t, why: text(row.likelihood?.why, 600) }, impact: { ...harm, level: p, why: text(row.impact?.why, 600) },
      score: t * p, band, response,
      actions: (Array.isArray(row.actions) ? row.actions : []).map((action) => text(action, 500)).filter(Boolean), owners, deadline: text(row.deadline, 60),
    };
  });
  const kinds = [...new Set(scenarios.flatMap((scenario) => scenario.categories))].sort();
  const [provisions, unverified, subjects] = provisionChecks(scenarios.flatMap((scenario) => scenario.legalBasis));
  return {
    content: { title: text(content.title, 300), criteria: { likelihood, impact, calibration: text(given.calibration, 1500) }, appetite, scenarios },
    checks: [
      check('criteria', blank === 0, blank ? String(blank) : ''),
      check('scenarios', scenarios.length >= MIN_SCENARIOS, String(scenarios.length)),
      check('categories', kinds.length >= MIN_CATEGORIES, kinds.join(', ')),
      check('sentence', failing.sentence.length === 0, failing.sentence.join(', ')),
      check('ties', failing.ties.length === 0, failing.ties.join(', ')),
      check('scores', failing.scores.length === 0, failing.scores.join(', ')),
      provisions, unverified, subjects,
      check('owners', failing.owners.length === 0, failing.owners.join(', '), false),
      check('response_fit', failing.response_fit.length === 0, failing.response_fit.join(', '), false),
      check('sentence_form', failing.sentence_form.length === 0, failing.sentence_form.join(', '), false),
    ],
  };
}







// -----------------------------------------------------------
// normalise
// -----------------------------------------------------------
//
// PUT /api/programme/{id}/content: the edited content of a
// stored draft, brought into the shape of its kind and
// checked against the kind's rules — the product the route
// answers, stamped as edited by the caller just now.
//
// Used by:
//   - handlers.js — the content route
//   - tests — what an edit must come back as
// -----------------------------------------------------------

export function normalise(stored, content) {
  const byKind = { policy: normalisePolicy, governance: normaliseGovernance, risks: normaliseRisks };
  const answer = byKind[stored.kind](content, stored);
  return {
    ...stored, content: answer.content, checks: answer.checks, title: answer.content.title || stored.title,
    editedByName: me.displayName, editedAt: NOW,
  };
}







// -----------------------------------------------------------
// chartSvg
// -----------------------------------------------------------
//
// GET /api/programme/{id}/chart: a structure drawn as a
// tree, level under level, each node a box in the colours of
// its line and dashed when it is proposed. A plain stand-in
// for the backend's drawing (programme/chart.py) with the
// same colours — enough for the page to show an image of the
// structure it was given. Every text is escaped.
//
// Used by:
//   - handlers.js — the chart route
// -----------------------------------------------------------

export function chartSvg(nodes) {
  const escape = (value) => String(value).replace(/[&<>"]/g, (letter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[letter]));
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const depth = (node) => (byId[node.parentId] ? depth(byId[node.parentId]) + 1 : 0);
  const levels = [];
  for (const node of nodes) (levels[depth(node)] ??= []).push(node);
  const [boxW, boxH, gapX, gapY, margin] = [180, 60, 24, 40, 16];
  const widest = Math.max(...levels.map((level) => level.length));
  const width = margin * 2 + widest * boxW + (widest - 1) * gapX;
  const height = margin * 2 + levels.length * boxH + (levels.length - 1) * gapY;
  const place = {};
  levels.forEach((level, row) => {
    const rowWidth = level.length * boxW + (level.length - 1) * gapX;
    level.forEach((node, column) => { place[node.id] = { x: (width - rowWidth) / 2 + column * (boxW + gapX), y: margin + row * (boxH + gapY) }; });
  });
  const lines = nodes.filter((node) => byId[node.parentId]).map((node) => {
    const [from, to] = [place[node.parentId], place[node.id]];
    const middle = from.y + boxH + gapY / 2;
    return `<path d="M${from.x + boxW / 2} ${from.y + boxH} V${middle} H${to.x + boxW / 2} V${to.y}" fill="none" stroke="#A9B3C1"/>`;
  });
  const boxes = nodes.map((node) => {
    const { x, y } = place[node.id];
    const [fill, stroke, ink] = CHART_COLOURS[node.line] ?? CHART_COLOURS.first;
    return `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="4" fill="${fill}" stroke="${stroke}"${node.proposed ? ' stroke-dasharray="5 4"' : ''}/>`
      + `<text x="${x + boxW / 2}" y="${y + boxH / 2 + 4}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="${ink}">${escape(node.name.slice(0, 28))}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${lines.join('')}${boxes.join('')}</svg>`;
}







// -----------------------------------------------------------
// productExport
// -----------------------------------------------------------
//
// GET /api/programme/{id}/export: the file name the view
// puts in Content-Disposition — the kind, the company with
// its letters folded and the version — the content type and
// a small body. undefined for an unknown product or a format
// its kind does not export in.
//
// Used by:
//   - handlers.js — the export route
//   - tests — the name a download is saved under
// -----------------------------------------------------------

export function productExport(id, format) {
  const row = product(id);
  if (!row || !FORMATS[row.kind]?.includes(format)) return undefined;
  const name = [...row.companyName].map((letter) => FOLD[letter] ?? letter).join('');
  const stem = `${row.kind}-${name}-v${row.version}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || row.kind;
  return { filename: `${stem}.${format}`, contentType: EXPORT_TYPES[format], body: EXPORT_BYTES[format] };
}
