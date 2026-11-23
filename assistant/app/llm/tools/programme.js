// -----------------------------------------------------------
//  [*] Assistant tools — work products of the programme
//
//  A work product is a document of a company's compliance
//  programme. Django's worker writes it from the company's
//  documents and its latest report and checks it against the
//  rules of its kind; a person then edits and approves it on
//  its page. There are three kinds, each building on the ones
//  before it: the compliance policy with the documents it
//  still needs, the governance structure with the compliance
//  process and its RACI matrix, and the legal risk criteria
//  with the register. Two tools serve them:
//
//    startWorkProduct · getWorkProduct
//
//  A start spends the user's AI budget and runs for minutes,
//  so its description tells the model to start one only when
//  the user asked for that document, and to look first for a
//  draft or an approved version. What Django refuses of a
//  start is answered, not thrown: a result that names the
//  refusal and says what to do next. A start refused because
//  one is being generated names that one.
//
//  getWorkProduct is the one read tool, and a product is
//  found, never asked for. With the company alone it lists
//  the newest version of every kind, or that there is none;
//  with a kind it reads that kind's newest version; an
//  earlier version is read by the id the list names.
//
//  A product's content is some 80 kB as Django keeps it —
//  every quote with its place in a document, every provision
//  with its lookup — and is never passed through. What the
//  model reads is rebuilt small: a provision is one string, a
//  quote the title of its document, the structure an indented
//  outline, the matrix one line a step with the roles by
//  name. The rules the product does not keep come in words,
//  the blocking ones apart from the reviewer's notes. The
//  large tables are read on request only: the risk criteria
//  and the positions the documents name.
//
//  The assistant neither edits nor approves: both happen on
//  the product's page, whose link every answer carries.
//
//  Split into:
//
//    rows           — a list, whatever Django answered
//    rest           — how many rows a capped list left out
//    provisionOf    — a looked-up provision as one string
//    titlesOf       — the documents a list of references names
//    pageOf         — the product's page, as the router has it
//    cardOf         — the product's identity
//    progressOf     — how far a generation is
//    versionRow     — one product in the list
//    earlierOf      — the versions before the newest
//    listOf         — the newest version of every kind
//    rulesOf        — the rules not kept, in words
//    policyOf       — a compliance policy, compacted
//    outlineOf      — the structure as an indented outline
//    raciOf         — one step's row of the matrix
//    governanceOf   — a governance product, compacted
//    positionsOf    — the positions the documents name
//    risksOf        — a risk register, compacted
//    criteriaOf     — the two criteria tables
//    productOf      — one product as the model reads it
//    generatingOf   — the product of a kind being generated
//    programmeTools — the group (named export)
// -----------------------------------------------------------

import { z } from "zod";

import { PRODUCT_KINDS, defineTool, id, trimText, url } from "./shared.js";


// The states in which a product is still being generated
const GENERATING = ["queued", "running"];

// The states in which a product has content to read
const READABLE = ["draft", "approved"];

// What to do with a product whose generation ended without
// content, by its state
const ENDED = {
  failed: "the generation failed — tell the user why; start a new one with startWorkProduct only if they ask",
  cancelled: "the generation was stopped — there is nothing to read; start a new one with startWorkProduct only if the user asks",
};

// The formats a kind exports in, as Django's FORMATS
// (programme/exports.py) has them
const EXPORT_FORMATS = { policy: ["pdf", "docx"], governance: ["pdf"], risks: ["pdf", "xlsx"] };

// The parts of a product getWorkProduct reads apart from the
// rest, each with the kind it belongs to: the criteria tables
// of a risk register, the positions a governance product found
// in the documents. A section asked for without a kind is
// read from that kind
const SECTION_KINDS = { criteria: "risks", positions: "governance" };
const SECTIONS = Object.keys(SECTION_KINDS);

// The rules of the three kinds in words: Django's English
// wording of every rule id (programme/exports.py, TEXT)
const RULES = {
  parts: "All eight parts of the policy are written",
  provisions: "The articles named are in their acts",
  provisions_unverified: "The acts named are in the legal corpus",
  provision_subjects: "The provisions named regulate what they are named for",
  quotes: "The quotes stand in the documents they name",
  hierarchy: "Every document of the company is placed on a level",
  structure: "The structure is a tree under a governing body",
  independence: "The second line is not under the first; internal audit reports to a governing body alone",
  process: "The process has at least five steps",
  raci_accountable: "Every step has exactly one accountable role (A)",
  raci_responsible: "Every step has at least one responsible role (R)",
  raci_everywhere: "No role takes part in every step",
  raci_heavy: "No role is accountable for more than half of the steps",
  process_basis: "Every step rests on a known clause of ISO 37301 or paragraph of the guidelines",
  criteria: "The criteria tables, the risk appetite and how they were fitted are filled in",
  scenarios: "There are at least five risk scenarios",
  categories: "The scenarios cover at least four types of legal risk",
  sentence: "Every scenario has all four parts of its sentence",
  ties: "Every scenario is tied to a unit and an internal policy",
  scores: "Every score is on the scale of 1 to 5",
  owners: "Every scenario has an owner and a deadline",
  response_fit: "The response fits the risk level",
  sentence_form: "The scenario's sentence keeps the set form",
};

// The six types of legal risk of ISO 31022 Annex A, Lithuanian
// then English: Django's CATEGORIES (programme/risks.py)
const CATEGORIES = {
  1: ["Teisinės aplinkos nenuspėjamumas", "Unpredictability of the legal environment"],
  2: ["Taikytinų teisės aktų nesilaikymas", "Non-compliance with applicable laws"],
  3: ["Sutarties pažeidimas", "Breach of contract"],
  4: ["Trečiųjų asmenų teisių pažeidimas", "Infringement of rights"],
  5: ["Neveikimas įgyvendinant teises", "Omission in exercising rights"],
  6: ["Netinkamas pasirinkimas", "Improper choice"],
};

// The four dimensions a likelihood level is described on, and
// the four of an impact level (programme/risks.py)
const LIKELIHOOD_DIMENSIONS = ["control", "clarity", "counterparty", "frequency"];
const IMPACT_DIMENSIONS = ["financial", "regulatory", "reputation", "reach"];

// The order of the missing documents: the most needed first
const PRIORITIES = ["high", "medium", "low"];

// A part of the policy is a page or so; a longer one — Django
// sets no bound on a person's edit — is cut here
const MAX_PART_TEXT = 3_000;

// The most decisions of one part of the policy
const MAX_DECISIONS = 10;

// The most documents of one level of the hierarchy
const MAX_TITLES = 40;

// The most missing documents a policy lists
const MAX_MISSING = 40;

// The most gaps, nodes of the structure, steps of the process
// and positions a governance product lists
const MAX_GAPS = 30;
const MAX_NODES = 80;
const MAX_STEPS = 30;
const MAX_POSITIONS = 60;

// How much of what a step of the process consists of is read
const MAX_STEP_TEXT = 240;

// The most scenarios a register lists, and actions of one
const MAX_SCENARIOS = 30;
const MAX_ACTIONS = 8;

// The most earlier versions of a kind the list names
const MAX_EARLIER = 5;

// What a start answers the model to do next
const STARTED_NEXT = "tell the user it is being generated in the background and takes a few minutes, and that the draft "
  + "will then be on the company's Programme tab (its own page: url) — read it with getWorkProduct once it is ready";

// What a refused start answers the model to do next, by
// Django's code; a start refused with any other code fails as
// every tool call does
const REFUSALS = {
  NO_DOCUMENTS: "nothing was started: a product is written from the company's documents and none is readable yet — ask "
    + "the user to upload them, then start it again",
  ALREADY_RUNNING: "nothing was started: one is already being generated — tell the user so and follow it with "
    + "getWorkProduct; do not start another",
  BUDGET_EXCEEDED: "nothing was started: the user's AI budget for today is spent — tell the user it can be started tomorrow",
  INVALID_FIELD: "nothing was started: kind is policy, governance or risks and language lt or en — correct the call",
  NOT_FOUND: "nothing was started: the user has no such company — take companyId from the company context or listCompanies",
};







// -----------------------------------------------------------
// rows
// -----------------------------------------------------------
//
// A list of Django's answer as an array: empty when the field
// is missing or is something else, so a degraded answer reads
// as nothing instead of crashing the tool.
//
// Used by:
//   - every function below
// -----------------------------------------------------------

function rows(value) {
  return Array.isArray(value) ? value : [];
}







// -----------------------------------------------------------
// rest
// -----------------------------------------------------------
//
// How many rows a capped list left out, under the key given —
// and nothing at all when the list fits, so an answer carries
// a counter only where something was cut.
//
// Used by:
//   - policyOf, governanceOf, positionsOf, risksOf (below)
// -----------------------------------------------------------

function rest(key, all, max) {
  return all.length > max ? { [key]: all.length - max } : {};
}







// -----------------------------------------------------------
// provisionOf
// -----------------------------------------------------------
//
// A looked-up provision as one string: the act's short title
// and the path the corpus gave it, or the article as it was
// named when the lookup found none. A mark follows where the
// lookup warns: the act has no such provision, the corpus does
// not hold the act (so nothing could be checked), or the
// provision regulates something else than it was named for.
//
// Used by:
//   - policyOf, risksOf (below)
// -----------------------------------------------------------

function provisionOf(entry) {
  const named = entry.article ? `art. ${entry.article}${entry.paragraph ? `(${entry.paragraph})` : ""}` : "";
  const name = [entry.shortTitle || entry.act, entry.path || named].filter(Boolean).join(" ");
  if (entry.status === "act_not_in_corpus") return `${name} (act not in corpus)`;
  if (entry.status === "not_found" || entry.found === false) return `${name} (not found)`;
  return entry.match === "mismatch" ? `${name} (subject mismatch)` : name;
}







// -----------------------------------------------------------
// titlesOf
// -----------------------------------------------------------
//
// The documents a list of references names, each title once
// and in the order met — what stands for a part's quotes and
// for the policies a scenario concerns. The quotes themselves
// and the document ids stay behind.
//
// Used by:
//   - policyOf, positionsOf, risksOf (below)
// -----------------------------------------------------------

function titlesOf(entries) {
  return [...new Set(rows(entries).map((entry) => entry?.document).filter(Boolean))];
}







// -----------------------------------------------------------
// pageOf
// -----------------------------------------------------------
//
// The product's page, where a person reads, edits and approves
// it — the link the chat gives the user. It is written as the
// console's router has it, without the console's base, like
// the link of a report: the chat's card adds the base.
//
// Used by:
//   - versionRow, productOf (below)
//   - programmeTools (below) — startWorkProduct
// -----------------------------------------------------------

function pageOf(product) {
  return `/programme/${product.id}`;
}







// -----------------------------------------------------------
// cardOf
// -----------------------------------------------------------
//
// The product's identity, which every answer about one product
// opens with: its id, kind, title, version and status.
//
// Used by:
//   - productOf (below)
//   - programmeTools (below) — startWorkProduct
// -----------------------------------------------------------

function cardOf(product) {
  return { id: product.id, kind: product.kind, title: product.title || null, version: product.version, status: product.status };
}







// -----------------------------------------------------------
// progressOf
// -----------------------------------------------------------
//
// How far a generation is, from its job: the step and what
// the job reports beside it — a percentage, a count done of a
// total, a message. Nothing when the job has reported none
// yet.
//
// Used by:
//   - versionRow, productOf (below)
// -----------------------------------------------------------

function progressOf(product) {
  const { step, percent, done, total, message } = product.progress ?? {};
  const known = Object.entries({ step, percent, done, total, message }).filter(([, value]) => value !== undefined && value !== null);
  return known.length ? Object.fromEntries(known) : null;
}







// -----------------------------------------------------------
// versionRow
// -----------------------------------------------------------
//
// One product in the list: its identity, who approved it and
// when, how many blocking rules it breaks and how many notes
// it carries for the reviewer, its progress while it is being
// generated, why it failed if it did, and its page.
//
// Used by:
//   - listOf (below)
// -----------------------------------------------------------

function versionRow(product) {
  const unkept = rows(product.checks).filter((check) => !check.ok);
  return {
    kind: product.kind, title: product.title || null, id: product.id, version: product.version, status: product.status,
    approvedByName: product.approvedByName ?? null, approvedAt: product.approvedAt ?? null,
    brokenRules: unkept.filter((check) => check.blocking).length, notes: unkept.filter((check) => !check.blocking).length,
    ...(GENERATING.includes(product.status) ? { progress: progressOf(product) } : {}),
    ...(product.status === "failed" ? { error: trimText(product.error, 200) } : {}),
    url: pageOf(product),
  };
}







// -----------------------------------------------------------
// earlierOf
// -----------------------------------------------------------
//
// The versions of a kind before its newest, newest first, each
// with the id getWorkProduct reads it by: the approved version
// behind a newer draft, or the last readable one behind a
// generation that failed. Nothing when the newest is the only
// one.
//
// Used by:
//   - listOf (below)
//   - programmeTools (below) — getWorkProduct
// -----------------------------------------------------------

function earlierOf(versions) {
  if (versions.length < 2) return {};
  return { earlierVersions: versions.slice(1, 1 + MAX_EARLIER).map((p) => ({ id: p.id, version: p.version, status: p.status })) };
}







// -----------------------------------------------------------
// listOf
// -----------------------------------------------------------
//
// The company's programme as a list: for every kind its newest
// version, or — when none was generated — the kind's title in
// the turn's language and the kinds it builds on. The kinds
// and their order are Django's; an answer without them falls
// back to the kinds known here. Older versions are counted,
// and named under their kind.
//
// Used by:
//   - programmeTools (below) — getWorkProduct
// -----------------------------------------------------------

function listOf(answer, language) {
  const products = rows(answer?.products);
  const kinds = rows(answer?.kinds).length ? answer.kinds : PRODUCT_KINDS.map((kind) => ({ kind }));
  const listed = kinds.map(({ kind, title, needs }) => {
    const versions = products.filter((p) => p.kind === kind).sort((a, b) => b.version - a.version);
    if (!versions.length) return { older: 0, row: { kind, title: title?.[language] ?? title?.lt ?? null, status: "none", buildsOn: rows(needs) } };
    return { older: versions.length - 1, row: { ...versionRow(versions[0]), ...earlierOf(versions) } };
  });
  return { products: listed.map(({ row }) => row), olderVersions: listed.reduce((sum, { older }) => sum + older, 0) };
}







// -----------------------------------------------------------
// rulesOf
// -----------------------------------------------------------
//
// The rules of its kind a product does not keep, each in words
// with what broke it: the blocking ones, which stop approval
// until the draft is mended, apart from the notes, which only
// tell the reviewer where to look. A rule this file has no
// words for keeps its id.
//
// Used by:
//   - productOf (below)
// -----------------------------------------------------------

function rulesOf(checks) {
  const unkept = rows(checks).filter((check) => !check.ok);
  const row = (check) => ({ rule: RULES[check.rule] ?? String(check.rule), detail: trimText(check.detail, 300) });
  return { broken: unkept.filter((check) => check.blocking).map(row), notes: unkept.filter((check) => !check.blocking).map(row) };
}







// -----------------------------------------------------------
// policyOf
// -----------------------------------------------------------
//
// A compliance policy as the model reads it: every part with
// its heading, its text whole, the decisions it leaves to the
// governing body, its legal basis and the documents it rests
// on; the company's documents by their level in the hierarchy
// — the policy level, thematic policies, procedures, and what
// is no rule at all; and the documents the company lacks, the
// most needed first, each with its purpose cut short and the
// provisions that ask for it.
//
// Used by:
//   - productOf (below)
// -----------------------------------------------------------

function policyOf(content) {
  const hierarchy = rows(content.hierarchy);
  const onLevel = (number) => hierarchy.filter((row) => row.level === number).map((row) => row.document).slice(0, MAX_TITLES);
  const documents = { level1: onLevel(1), level2: onLevel(2), level3: onLevel(3), notRules: onLevel(0) };
  const rank = (row) => PRIORITIES.indexOf(row.priority) + 1 || PRIORITIES.length + 1;
  const missing = [...rows(content.missing)].sort((a, b) => rank(a) - rank(b));
  return {
    parts: rows(content.parts).map((part) => ({
      key: part.key, heading: part.heading, text: trimText(part.text, MAX_PART_TEXT),
      decisions: rows(part.decisions).slice(0, MAX_DECISIONS),
      legalBasis: rows(part.legalBasis).map(provisionOf), sources: titlesOf(part.sources),
    })),
    documents,
    ...rest("moreDocuments", hierarchy, Object.values(documents).flat().length),
    missing: missing.slice(0, MAX_MISSING).map((row) => ({
      level: row.level, title: row.title, priority: row.priority, purpose: trimText(row.purpose, 240),
      legalBasis: rows(row.legalBasis).map(provisionOf),
    })),
    ...rest("moreMissing", missing, MAX_MISSING),
  };
}







// -----------------------------------------------------------
// outlineOf
// -----------------------------------------------------------
//
// The governance structure as an indented outline, one line a
// node: its name, its line of the three lines model and
// whether the product proposes it — the documents do not name
// it. A node stands under its parent, two spaces deeper, the
// roots first; a node whose parent is not in the structure is
// a root. Django keeps the structure a tree; a node a circle
// would hide is listed all the same, at the end.
//
// Used by:
//   - governanceOf (below)
// -----------------------------------------------------------

function outlineOf(nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  const seen = new Set();
  const lines = [];
  const walk = (node, depth) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    lines.push(`${"  ".repeat(depth)}${node.name} — ${node.line}${node.proposed ? " (proposed)" : ""}`);
    for (const child of nodes) if (child.parentId === node.id) walk(child, depth + 1);
  };
  for (const node of nodes) if (!ids.has(node.parentId)) walk(node, 0);
  for (const node of nodes) walk(node, 0);
  return lines;
}







// -----------------------------------------------------------
// raciOf
// -----------------------------------------------------------
//
// One step's row of the RACI matrix as a line: the accountable
// role, then the responsible, consulted and informed ones, by
// name. A role that both does the work and answers for it
// stands under both letters. The accountable and responsible
// groups are always written — a dash says the step has none,
// which breaks the golden rule — the other two only when
// someone is in them.
//
// Used by:
//   - governanceOf (below)
// -----------------------------------------------------------

function raciOf(stepId, cells, names) {
  const roles = (letter) => cells.filter((cell) => cell.stepId === stepId && String(cell.value).includes(letter))
    .map((cell) => names.get(cell.roleId) ?? cell.roleId).join(", ");
  return ["A", "R", "C", "I"].map((letter) => [letter, roles(letter)])
    .filter(([letter, held]) => held || letter === "A" || letter === "R")
    .map(([letter, held]) => `${letter}: ${held || "—"}`).join("; ");
}







// -----------------------------------------------------------
// governanceOf
// -----------------------------------------------------------
//
// A governance product as the model reads it: the roles and
// functions the company lacks or leaves unclear, each with its
// line and the reason cut short; the proposed structure as an
// outline; the compliance process step by step — numbered,
// with what is done in it cut short, its frequency, the
// clauses it rests on and its row of the matrix — and how many
// positions the documents name. The positions themselves are a
// section of their own.
//
// Used by:
//   - productOf (below)
// -----------------------------------------------------------

function governanceOf(content) {
  const nodes = rows(content.structure);
  const names = new Map(nodes.map((node) => [node.id, node.name]));
  const cells = rows(content.raci);
  const gaps = rows(content.gaps);
  const steps = rows(content.process);
  return {
    gaps: gaps.slice(0, MAX_GAPS).map((gap) => ({ role: gap.role, line: gap.line, why: trimText(gap.why, 300) })),
    ...rest("moreGaps", gaps, MAX_GAPS),
    structure: outlineOf(nodes).slice(0, MAX_NODES),
    ...rest("moreNodes", nodes, MAX_NODES),
    process: steps.slice(0, MAX_STEPS).map((step, index) => ({
      step: index + 1, name: step.name, what: trimText(step.description, MAX_STEP_TEXT), frequency: step.frequency,
      basis: rows(step.basis).map((entry) => `${entry.source} ${entry.ref}`), raci: raciOf(step.id, cells, names),
    })),
    ...rest("moreSteps", steps, MAX_STEPS),
    positionsFound: rows(content.positions).length,
  };
}







// -----------------------------------------------------------
// positionsOf
// -----------------------------------------------------------
//
// The positions and units the company's documents name, as a
// governance product found them: the name, the unit, the line,
// what the position answers for and the documents that name
// it.
//
// Used by:
//   - productOf (below)
// -----------------------------------------------------------

function positionsOf(content) {
  const positions = rows(content.positions);
  return {
    positions: positions.slice(0, MAX_POSITIONS).map((position) => ({
      name: position.name, unit: position.unit || null, line: position.line, duties: trimText(position.duties, 300),
      sources: titlesOf(position.sources),
    })),
    ...rest("morePositions", positions, MAX_POSITIONS),
  };
}







// -----------------------------------------------------------
// risksOf
// -----------------------------------------------------------
//
// A legal risk register as the model reads it: how the
// criteria were fitted to the company, the five bands of the
// matrix with their score range, the responses each allows and
// who decides in it, and the scenarios — the sentence, the
// types of legal risk by name in the product's language, the
// likelihood and impact levels with their score and band, the
// treatment with its owners and deadline, the legal basis, the
// internal policies concerned and the internal conclusion cut
// short. The view of an outside lawyer is added only once a
// person has written one. The criteria tables are a section of
// their own.
//
// Used by:
//   - productOf (below)
// -----------------------------------------------------------

function risksOf(content, language) {
  const named = language === "lt" ? 0 : 1;
  const scenarios = rows(content.scenarios);
  return {
    calibration: trimText(content.criteria?.calibration, 1_500),
    appetite: rows(content.appetite).map((band) => ({
      band: band.band, name: band.name, range: `${band.from}–${band.to}`, responses: rows(band.responses), decision: band.decision,
    })),
    scenarios: scenarios.slice(0, MAX_SCENARIOS).map((scenario) => ({
      id: scenario.id, area: scenario.area, unit: scenario.unit, sentence: scenario.sentence,
      types: rows(scenario.categories).map((number) => `${number} ${CATEGORIES[number]?.[named] ?? ""}`.trim()),
      likelihood: scenario.likelihood?.level ?? null, impact: scenario.impact?.level ?? null,
      score: scenario.score, band: scenario.band, response: scenario.response,
      actions: rows(scenario.actions).slice(0, MAX_ACTIONS), owners: rows(scenario.owners), deadline: scenario.deadline,
      legalBasis: rows(scenario.legalBasis).map(provisionOf), policies: titlesOf(scenario.policies),
      internalConclusion: trimText(scenario.internalConclusion, 400),
      ...(scenario.externalConclusion ? { externalConclusion: trimText(scenario.externalConclusion, 400) } : {}),
    })),
    ...rest("moreScenarios", scenarios, MAX_SCENARIOS),
  };
}







// -----------------------------------------------------------
// criteriaOf
// -----------------------------------------------------------
//
// The criteria of a risk register alone: how they were fitted
// to the company, and the two tables — likelihood and impact —
// of five levels each, a level described on its four
// dimensions.
//
// Used by:
//   - productOf (below)
// -----------------------------------------------------------

function criteriaOf(content) {
  const table = (levels, dimensions) => rows(levels).slice(0, 5).map((row) => ({
    level: row.level, name: row.name, ...Object.fromEntries(dimensions.map((dimension) => [dimension, trimText(row[dimension], 500)])),
  }));
  return {
    criteria: {
      calibration: trimText(content.criteria?.calibration, 1_500),
      likelihood: table(content.criteria?.likelihood, LIKELIHOOD_DIMENSIONS),
      impact: table(content.criteria?.impact, IMPACT_DIMENSIONS),
    },
  };
}







// -----------------------------------------------------------
// productOf
// -----------------------------------------------------------
//
// One product as the model reads it. While it is being
// generated: its identity, the job's progress and the advice
// to look again shortly. Failed or stopped: its identity, the
// error and what can be done. A draft or an approved product:
// its identity and language, who approved it, its page and
// exports, the rules it does not keep, what it was made from —
// the latest report or none, how many documents, the earlier
// products with their versions — and its content by kind. A
// section asked of the kind that has it answers that section
// alone under the identity; asked of another kind it is
// ignored.
//
// Used by:
//   - programmeTools (below) — getWorkProduct
// -----------------------------------------------------------

function productOf(product, section = null) {
  const card = cardOf(product);
  const page = pageOf(product);
  if (GENERATING.includes(product.status)) {
    return { ...card, progress: progressOf(product), next: "still being generated — check again in a minute or two", url: page };
  }
  if (!READABLE.includes(product.status)) {
    return {
      ...card, ...(product.error ? { error: trimText(product.error, 300) } : {}),
      ...(ENDED[product.status] ? { next: ENDED[product.status] } : {}), url: page,
    };
  }
  const content = product.content ?? {};
  if (section === "criteria" && product.kind === "risks") return { ...card, url: page, ...criteriaOf(content) };
  if (section === "positions" && product.kind === "governance") return { ...card, url: page, ...positionsOf(content) };
  const basis = product.basis ?? {};
  return {
    ...card, language: product.language,
    approved: product.status === "approved"
      ? { by: product.approvedByName ?? null, at: product.approvedAt ?? null, note: product.approvalNote || null } : null,
    url: page,
    exports: (EXPORT_FORMATS[product.kind] ?? []).map((format) => ({ format, url: `/api/programme/${product.id}/export?format=${format}` })),
    rules: rulesOf(product.checks),
    builtOn: {
      report: Boolean(basis.reportId), documents: rows(basis.documents).length,
      products: Object.entries(basis.products ?? {}).map(([kind, earlier]) => ({
        kind, version: earlier?.version ?? null, status: earlier?.status ?? null,
      })),
    },
    ...(product.kind === "policy" ? policyOf(content) : {}),
    ...(product.kind === "governance" ? governanceOf(content) : {}),
    ...(product.kind === "risks" ? risksOf(content, product.language) : {}),
  };
}







// -----------------------------------------------------------
// generatingOf
// -----------------------------------------------------------
//
// The product of a kind the company has in generation, from
// its list — what a start Django refused as already running
// points the model to. Nothing when the list cannot be read or
// no longer holds one: the refusal is then answered without
// it, never replaced by the list's own failure.
//
// Used by:
//   - programmeTools (below) — startWorkProduct
// -----------------------------------------------------------

async function generatingOf(django, companyId, kind) {
  try {
    const answer = await django.get(url`/api/companies/${companyId}/programme`);
    return rows(answer?.products).find((p) => p.kind === kind && GENERATING.includes(p.status)) ?? null;
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// programmeTools
// -----------------------------------------------------------
//
// The group's tools for one turn. A product is written in the
// language the model names, else the turn's, else Lithuanian;
// the turn's language also names a kind that has no product
// yet.
//
// Used by:
//   - llm/tools.js — createTools
// -----------------------------------------------------------

export function programmeTools(ctx) {
  const { django, language } = ctx;


  const startWorkProduct = defineTool("startWorkProduct", {
    description: "Start generating a document of the company's compliance programme from its uploaded documents: "
      + "kind policy (the compliance policy and the documents it still needs), governance (governance structure, "
      + "compliance process, RACI matrix) or risks (legal risk criteria and register). It runs in the background "
      + "for 4-6 minutes and spends about $0.5 of the user's daily AI budget, so start one ONLY when the user "
      + "asked for that document, and FIRST check with getWorkProduct whether a draft or an approved version "
      + "already exists — offer that instead of generating again. Each kind builds on the ones before it (policy, "
      + "governance, risks) but can be generated without them. The result is a draft that a person edits and "
      + "approves on its page: tell the user it is being generated and where it will be (next, url). A refusal "
      + "comes back as started: false with what to do next.",
    input: z.strictObject({
      companyId: id("The company id (from the company context)"),
      kind: z.enum(PRODUCT_KINDS).describe("policy, governance (structure, process and RACI) or risks (criteria and register)"),
      language: z.enum(["lt", "en"]).optional().describe("The document's language, default the conversation's"),
    }),
    run: async ({ companyId, kind, language: productLanguage }) => {
      try {
        const product = await django.post(url`/api/companies/${companyId}/programme`,
                                          { kind, language: productLanguage || language || "lt" });
        return { started: true, product: cardOf(product), takesMinutes: "4-6", next: STARTED_NEXT, url: pageOf(product) };
      } catch (err) {
        if (!Object.hasOwn(REFUSALS, err?.code)) throw err;
        const refusal = { started: false, refused: err.code, reason: err.message, next: REFUSALS[err.code] };
        if (err.code !== "ALREADY_RUNNING") return refusal;
        const running = await generatingOf(django, companyId, kind);
        return {
          ...refusal, alreadyRunning: true, product: running ? cardOf(running) : null,
          ...(running ? { url: pageOf(running) } : {}),
        };
      }
    },
  }, ctx);


  const getWorkProduct = defineTool("getWorkProduct", {
    description: "The documents of a company's compliance programme. Use it whenever the user asks about the "
      + "company's compliance policy, missing documents or document hierarchy (kind policy), its governance "
      + "structure, compliance process or RACI matrix (kind governance), its risk criteria, risk matrix or legal "
      + "risk register (kind risks). Never ask the user for an id: companyId is in the company context and the "
      + "product is found by kind. companyId alone: the newest version of every kind with its status (none = not "
      + "generated yet). companyId and kind, or a productId: that product in full; rules.broken block its "
      + "approval, rules.notes are for the reviewer. section criteria: only the criteria tables of a risks "
      + "product; positions: only the positions a governance product found in the documents — a section names "
      + "its kind, so companyId and section are enough. While queued or running there is no content yet. "
      + "Editing and approval happen on the product's page in the console — give the user its url; you cannot approve.",
    input: z.strictObject({
      companyId: id("The company id (from the company context); alone it lists the newest version of every kind").optional(),
      kind: z.enum(PRODUCT_KINDS).optional().describe("With companyId: read the newest version of this kind in full"),
      productId: id("One product by its id, e.g. an earlier version the list names; kind is then not needed").optional(),
      section: z.enum(SECTIONS).optional()
        .describe("criteria: only the criteria tables of a risks product; positions: only the positions of a "
          + "governance product. With companyId alone it reads the newest product of that kind"),
    }).refine(({ companyId, productId }) => Boolean(companyId || productId),
              { message: "pass companyId (from the company context) or a productId" }),
    run: async ({ companyId, kind: asked, productId, section }) => {
      if (productId) return productOf(await django.get(url`/api/programme/${productId}`), section);
      const answer = await django.get(url`/api/companies/${companyId}/programme`);
      const kind = asked || SECTION_KINDS[section];
      if (!kind) return listOf(answer, language);
      const versions = rows(answer?.products).filter((p) => p.kind === kind).sort((a, b) => b.version - a.version);
      if (!versions.length) {
        const known = rows(answer?.kinds).find((row) => row.kind === kind);
        return {
          kind, title: known?.title?.[language] ?? known?.title?.lt ?? null, status: "none", buildsOn: rows(known?.needs),
          next: "not generated yet — offer to generate it with startWorkProduct if the user wants it",
        };
      }
      // The list row says all there is of a product without
      // content; only one with content is read from its route
      const newest = READABLE.includes(versions[0].status) ? await django.get(url`/api/programme/${versions[0].id}`) : versions[0];
      return { ...productOf(newest, section), ...earlierOf(versions) };
    },
  }, ctx);


  return { startWorkProduct, getWorkProduct };
}
