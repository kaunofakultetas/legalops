// -----------------------------------------------------------
//  [*] Assistant tools — companies, credentials, standards,
//      roles
//
//  The company profile the conversation builds, through
//  Django's public API as the user (tenancy lives there):
//
//    listCompanies · getCompany · createCompany · updateCompany
//    setThreadCompany · addCredential · updateCredential
//    removeCredential · setCompanyStandard ·
//    removeCompanyStandard · listRoles · saveRole ·
//    setThreadRole
//
//  Unknown facts stay null, never a guessed false. What is
//  recorded is never lost by saying less: an update of the
//  profile keeps the members of `attributes` and
//  `financialMarket` it does not name, and a credential that
//  exists is completed, not emptied or un-verified, by being
//  recorded again; an update that names no field is refused,
//  not answered as done. The model
//  cannot pile up duplicates: createCompany refuses a name the
//  user already has, addCredential updates the credential of
//  the same kind and name, setCompanyStandard the record of
//  the same standard, and saveRole the role of the same name.
//  A standard is named the way people name it ("ISO 27001")
//  and found among the corpus's standards by its designation. listCompanies finds a company as people name it:
//  Django matches word by word, and when that finds nothing
//  the tool offers the user's companies most like the query —
//  for a typo, missing diacritics or extra words.
//
//  Split into:
//
//    triState         — the nullable yes/no field
//    isoDate          — a date that is a day of the calendar
//    nothingGiven     — the refusal of an update without a field
//    mergeMembers     — an object field, merged member by member
//    sendWithEvidence — a credential whose evidence may not be
//                       the company's document yet
//    sameName         — name equality for the duplicate guards
//    nameWords        — a name's distinctive words, plain
//    wordLikeness     — how alike two words are
//    closestCompanies — the companies most like a query
//    designationOf    — a standard's number, part and year
//    pickStandard     — the corpus standard a name means
//    companySummary   — one company of a list
//    credentialRow    — one credential, compacted
//    standardRow      — one adopted standard, compacted
//    roleRow          — one role profile
//    companyProfile   — the full profile, compacted
//    companyTools     — the group (named export)
// -----------------------------------------------------------

import { z } from "zod";

import {
  CREDENTIAL_KINDS, CREDENTIAL_STATUSES, INSTITUTION_TYPES, SIZE_CATEGORIES, STANDARD_STATUSES,
  ToolFailure, defineTool, filled, id, query, trimText, url,
} from "./shared.js";


// The financial-market classification kept on the profile —
// conclusions live here, never in attributes
const FINANCIAL_MARKET = z.strictObject({
  markets: z.array(z.string().max(200)).max(20).optional().describe("Financial markets the company operates in"),
  serviceCategory: z.string().max(500).optional().describe("The exact service category under the governing act"),
  institutes: z.array(z.string().max(200)).max(30).optional().describe("Institutes of financial law that govern it"),
  licenseRequired: z.boolean().nullable().optional(),
  authorisation: z.string().max(500).optional().describe("Licence / authorisation / notification / register entry needed, or none"),
  authority: z.string().max(200).optional().describe("The issuing or supervising authority"),
  legalBasis: z.string().max(1000).optional().describe("Act and article, as verified"),
  crossCuttingRegimes: z.array(z.string().max(200)).max(30).optional(),
  reasoning: z.string().max(4000).optional(),
  citations: z.array(z.string().max(300)).max(40).optional(),
  verified: z.boolean().optional().describe("true only when every citation was retrieved from the corpus"),
}).describe("The classification conclusion (Task 1)");

// The writable profile fields (Django companies/serializers.py
// COMPANY_FIELDS), with Django's limits
const COMPANY_FIELDS = {
  name: filled(500).describe("Legal name"),
  registrationCode: z.string().max(500).nullable().optional().describe("Code in the register of legal entities"),
  country: filled(100, 2).optional()
    .describe("ISO 3166-1 alpha-2, e.g. LT — a new company is recorded as LT when this is left out"),
  legalForm: z.string().max(500).nullable().optional().describe("UAB, AB, MB, VšĮ, filialas, ..."),
  naceCodes: z.array(filled(20)).max(50).optional().describe("NACE Rev. 2.1 codes, e.g. 64.19"),
  sector: z.string().max(500).nullable().optional().describe("Plain-language sector"),
  sizeCategory: z.enum(SIZE_CATEGORIES).optional()
    .describe("'unknown' = not determined; on an update it replaces a recorded category — leave the field out to keep it"),
  employees: z.number().int().min(0).max(10_000_000).nullable().optional(),
  annualTurnoverEur: z.number().int().min(0).max(1e14).nullable().optional(),
  activities: z.string().max(20_000).optional().describe("What the company does, in the user's words"),
  usesAi: triState("Uses AI systems in its operations").optional(),
  providesAi: triState("Develops or provides AI systems to others").optional(),
  aiDescription: z.string().max(10_000).optional(),
  processesPersonalData: triState("Processes personal data").optional(),
  isPublicSector: triState("Is a public-sector body").optional(),
  institutionType: z.enum(INSTITUTION_TYPES).optional()
    .describe("The Bank of Lithuania licence category; 'none' = not a financial institution, 'unknown' = not "
      + "determined. On an update 'unknown' replaces a recorded category — leave the field out to keep it"),
  financialMarket: FINANCIAL_MARKET.optional(),
  attributes: z.record(z.string().max(100), z.unknown()).optional()
    .describe("Other stated facts. Inferred values go under attributes.inferred with a reason. Never legal "
      + "conclusions. On an update only the members given change; a member set to null is removed"),
};

// The writable credential fields (Django _apply_credential)
const CREDENTIAL_FIELDS = {
  kind: z.enum(CREDENTIAL_KINDS),
  name: filled(500).describe("e.g. 'Kriptoturto paslaugų teikėjo leidimas', 'ISO/IEC 27001:2022'"),
  issuer: z.string().max(500).nullable().optional().describe("e.g. 'Lietuvos bankas'"),
  identifier: z.string().max(500).nullable().optional().describe("Licence / certificate number"),
  validFrom: isoDate().nullable().optional().describe("ISO date, YYYY-MM-DD"),
  validTo: isoDate().nullable().optional().describe("ISO date, YYYY-MM-DD"),
  scope: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional(),
  status: z.enum(CREDENTIAL_STATUSES).optional()
    .describe("claimed (the default). verified ONLY when the user says in so many words that the credential was "
      + "checked — against the issuer's register or the document itself: verifying is the user's decision, recorded "
      + "in their name. An issuer and a number, or a linked document, are still a claim"),
  evidenceDocumentId: filled(100).nullable().optional()
    .describe("A document of this company that proves it (attach the document to the company first)"),
};

// How long a credential waits for its evidence document to
// be attached by a call of the same step, before trying again
const EVIDENCE_WAIT_MS = 1_500;

// Django's NAME_NOISE (companies/api/company_views.py): the
// words a name search skips, lower case, without diacritics
const NAME_NOISE = new Set([
  "ab", "akcine", "bendrove", "bendroves", "co", "company", "corp", "gmbh", "imone", "imones", "imonei",
  "imoneje", "inc", "limited", "llc", "ltd", "mb", "plc", "the", "uab", "uzdaroji", "vsi",
]);

// How alike a name must be (0–1) to be offered as `closest`
const CLOSEST_MIN = 0.34;

// Companies `closest` lists at most
const CLOSEST_MAX = 10;

// A standard's designation: a publisher (ISO, IEC, EN… — any
// of "LST EN ISO/IEC"), the number (ETSI writes it in two
// groups), an optional part and an optional year; Django's
// corpus/search.py DESIGNATION
const DESIGNATION = new RegExp("\\b(?:ISO|IEC|EN|LST|ETSI|CEN|CWA|BS|DIN|IEEE|NIST)\\b[^\\d]{0,12}?"
  + "(\\d{3,5}(?: \\d{3}(?!\\d))?)(?:\\s*-\\s*(\\d{1,3}))?(?:[-\\d]*\\s*:\\s*(\\d{4}))?", "i");







// -----------------------------------------------------------
// triState
// -----------------------------------------------------------
//
// A fact that is known yes, known no, or unknown (null) —
// Django stores all three; an unknown is never defaulted to
// false.
//
// Used by:
//   - COMPANY_FIELDS (above)
// -----------------------------------------------------------

function triState(description) {
  return z.boolean().nullable()
    .describe(`${description}. true/false only when the user said so or a document shows it; null = unknown`);
}







// -----------------------------------------------------------
// isoDate
// -----------------------------------------------------------
//
// The zod field for a date written YYYY-MM-DD that is a day
// of the calendar. The form alone lets the 31st of February
// through; read back from the date it makes, such a day comes
// out as another one, and that is how it is told.
//
// Used by:
//   - CREDENTIAL_FIELDS (above)
// -----------------------------------------------------------

function isoDate() {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const day = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, "not a day of the calendar");
}







// -----------------------------------------------------------
// nothingGiven
// -----------------------------------------------------------
//
// The refusal of an update that names no field. Django
// answers such a request with the unchanged record, which the
// model would read as a change made; the model is told that
// nothing was sent instead.
//
// Used by:
//   - updateCompany, updateCredential (below)
// -----------------------------------------------------------

function nothingGiven(tool, fields) {
  if (Object.keys(fields).length) return;
  throw new ToolFailure(tool, "NOTHING_TO_CHANGE", "no field was given — name at least one field to change");
}







// -----------------------------------------------------------
// mergeMembers
// -----------------------------------------------------------
//
// An object field of the profile as an update leaves it: the
// recorded members, with the given ones over them. Django
// replaces such a field whole, so an update naming one member
// would delete all the others — the facts filed in earlier
// turns, the reasons of inferred values. A member given as
// null is removed; `inferred`, where those reasons are kept,
// is merged the same way one level down.
//
// Used by:
//   - updateCompany (below) — attributes, financialMarket
// -----------------------------------------------------------

function mergeMembers(recorded, given) {
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const merged = { ...(isObject(recorded) ? recorded : {}), ...given };
  if (isObject(recorded?.inferred) && isObject(given.inferred)) {
    merged.inferred = mergeMembers(recorded.inferred, given.inferred);
  }
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== null));
}







// -----------------------------------------------------------
// sendWithEvidence
// -----------------------------------------------------------
//
// Records a credential whose evidence document may not be
// the company's yet. Django refuses a credential that names
// such a document — and the model files a document and the
// licence it proves in one step, whose calls run together.
// The refusal is tried once more after a moment; if the
// document is still not the company's, the credential is
// recorded without the link and the answer says so: a
// licence that is not recorded at all is the worse outcome.
//
// Used by:
//   - addCredential (below)
// -----------------------------------------------------------

async function sendWithEvidence(send, fields) {
  const refused = (err) => Boolean(fields.evidenceDocumentId) && /evidenceDocumentId/.test(err?.message || "");
  try {
    return { row: await send(fields), evidenceLinked: true };
  } catch (err) {
    if (!refused(err)) throw err;
  }
  await new Promise((done) => setTimeout(done, EVIDENCE_WAIT_MS));
  try {
    return { row: await send(fields), evidenceLinked: true };
  } catch (err) {
    if (!refused(err)) throw err;
  }
  const { evidenceDocumentId: _document, ...rest } = fields;
  return { row: await send(rest), evidenceLinked: false };
}







// -----------------------------------------------------------
// sameName
// -----------------------------------------------------------
//
// Name equality for the duplicate guards, blind to case,
// quotation marks and spacing — diacritics still count.
//
// Used by:
//   - companyTools (below) — createCompany, addCredential, saveRole
// -----------------------------------------------------------

function sameName(a, b) {
  const norm = (value) => String(value ?? "").toLocaleLowerCase("lt").replace(/["„“”']/g, "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}







// -----------------------------------------------------------
// nameWords
// -----------------------------------------------------------
//
// The words that tell one company from another: lower case,
// diacritics and punctuation dropped, NAME_NOISE skipped.
//
// Used by:
//   - closestCompanies (below)
// -----------------------------------------------------------

function nameWords(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((word) => word && !NAME_NOISE.has(word));
}







// -----------------------------------------------------------
// wordLikeness
// -----------------------------------------------------------
//
// How alike two words are, from 0 to 1: 1 when one starts the
// other, else the share of letter pairs they have in common
// (Dice) — enough for a typo or another spelling. A one-letter
// word therefore fully matches every word that begins with it.
//
// Used by:
//   - closestCompanies (below)
// -----------------------------------------------------------

function wordLikeness(a, b) {
  if (a.startsWith(b) || b.startsWith(a)) return 1;
  const pairs = (word) => Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2));
  const left = pairs(a);
  const pool = pairs(b);
  if (left.length === 0 || pool.length === 0) return 0;
  const total = left.length + pool.length;
  let shared = 0;
  for (const pair of left) {
    const at = pool.indexOf(pair);
    if (at >= 0) {
      shared += 1;
      pool.splice(at, 1);
    }
  }
  return (2 * shared) / total;
}







// -----------------------------------------------------------
// closestCompanies
// -----------------------------------------------------------
//
// The rows whose names are most like the query, best first —
// at most CLOSEST_MAX, none below CLOSEST_MIN. A name scores
// the mean, over the query's words, of each word's best match
// among its own words. listCompanies answers these when
// Django's search finds nothing; the model then takes the
// company clearly meant, or asks.
//
// Used by:
//   - companyTools (below) — listCompanies
// -----------------------------------------------------------

function closestCompanies(rows, query) {
  const wanted = nameWords(query);
  if (wanted.length === 0) return [];
  return rows
    .map((row) => {
      const words = nameWords(row?.name);
      const best = wanted.map((word) => Math.max(0, ...words.map((other) => wordLikeness(word, other))));
      return { row, score: best.reduce((sum, value) => sum + value, 0) / wanted.length };
    })
    .filter(({ score }) => score >= CLOSEST_MIN)
    .sort((a, b) => b.score - a.score || String(a.row.name).localeCompare(String(b.row.name), "lt"))
    .slice(0, CLOSEST_MAX)
    .map(({ row, score }) => ({ ...companySummary(row), likeness: Math.round(score * 100) / 100 }));
}







// -----------------------------------------------------------
// designationOf
// -----------------------------------------------------------
//
// The number, part and year (empty when not given) of the
// first standard designation a text holds, or null.
//
// Used by:
//   - pickStandard (below)
// -----------------------------------------------------------

function designationOf(text) {
  const match = DESIGNATION.exec(String(text ?? ""));
  return match ? { number: match[1].replace(" ", ""), part: match[2] ?? "", year: match[3] ?? "" } : null;
}







// -----------------------------------------------------------
// pickStandard
// -----------------------------------------------------------
//
// The corpus standard the user's words name, among the listed
// ones: the one with that id or exact designation, else the
// one whose number agrees (and the part, when given) — the
// edition of the year given, the latest when none was. A
// year no edition carries still names the standard when the
// corpus holds a single edition of it: an adoption and its
// international standard differ by their years (ISO/IEC
// 27001:2022 is LST EN ISO/IEC 27001:2023). Words without a
// designation name the one standard whose name holds them.
// None fits: a ToolFailure naming what the corpus holds, so
// the model can tell the user an admin must upload it; two
// editions tie: a ToolFailure asking which.
//
// Used by:
//   - companyTools (below) — setCompanyStandard
// -----------------------------------------------------------

function pickStandard(standards, wanted) {
  const text = String(wanted ?? "").trim();
  const exact = standards.find((d) => d.id === text || (d.shortTitle || "").toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  const asked = designationOf(text);
  const numbered = !asked ? [] : standards
    .map((document) => ({ document, own: designationOf(document.shortTitle) || designationOf(document.title) }))
    .filter(({ own }) => own && own.number === asked.number && (!asked.part || own.part === asked.part))
    .sort((a, b) => b.own.year.localeCompare(a.own.year));
  const ofYear = numbered.filter(({ own }) => !asked.year || own.year === asked.year);
  const named = asked || text.length < 3 ? [] : standards
    .filter((d) => `${d.shortTitle || ""} ${d.title || ""}`.toLowerCase().includes(text.toLowerCase()))
    .map((document) => ({ document, own: { year: "" } }));
  const editions = ofYear.length > 0 ? ofYear : (numbered.length === 1 ? numbered : (named.length === 1 ? named : []));
  if (editions.length === 0) {
    const held = standards.map((d) => d.shortTitle || d.title).join(", ") || "none";
    throw new ToolFailure("setCompanyStandard", "UNKNOWN_STANDARD",
      `the corpus holds no standard "${text}" (it holds: ${held}) — an admin uploads standards on the corpus page`);
  }
  if (editions.length > 1 && editions[0].own.year === editions[1].own.year) {
    throw new ToolFailure("setCompanyStandard", "AMBIGUOUS_STANDARD",
      `"${text}" fits ${editions.map(({ document }) => document.shortTitle || document.title).join(" and ")} — name the edition`);
  }
  return editions[0].document;
}







// -----------------------------------------------------------
// companySummary
// -----------------------------------------------------------
//
// The compact company row of a list answer — the model reads
// these, not a person.
//
// Used by:
//   - closestCompanies (above)
//   - companyTools (below) — listCompanies
// -----------------------------------------------------------

function companySummary(company) {
  return {
    id: company.id,
    name: company.name,
    registrationCode: company.registrationCode ?? null,
    institutionType: company.institutionType,
    legalForm: company.legalForm ?? null,
    country: company.country,
    sizeCategory: company.sizeCategory,
    updatedAt: company.updatedAt,
  };
}







// -----------------------------------------------------------
// credentialRow
// -----------------------------------------------------------
//
// One credential with what the model needs to reason about
// it: claimed or verified, its validity and its evidence.
//
// Used by:
//   - companyProfile, companyTools (below)
// -----------------------------------------------------------

function credentialRow(row) {
  return {
    id: row.id, kind: row.kind, name: row.name, issuer: row.issuer ?? null, identifier: row.identifier ?? null,
    validFrom: row.validFrom ?? null, validTo: row.validTo ?? null, status: row.status ?? "claimed",
    evidenceDocumentId: row.evidenceDocumentId ?? null, scope: row.scope || undefined, notes: row.notes || undefined,
  };
}







// -----------------------------------------------------------
// standardRow
// -----------------------------------------------------------
//
// One adopted standard as the model reads it: its designation,
// how far the company is with it, the scope and the linked
// certificate, and whether the corpus copy is ready for an
// analysis.
//
// Used by:
//   - companyProfile, companyTools (below)
// -----------------------------------------------------------

function standardRow(row) {
  return {
    id: row.id, documentId: row.documentId ?? null, standard: row.shortTitle || row.title || null,
    title: row.title ?? null, status: row.status, scope: row.scope || undefined,
    certificateId: row.certificateId ?? null, notes: row.notes || undefined, ready: row.ready ?? null,
  };
}







// -----------------------------------------------------------
// roleRow
// -----------------------------------------------------------
//
// One role profile — whole, or as a preview without sources
// and with its context cut short when `full` is false.
//
// Used by:
//   - companyProfile, companyTools (below)
// -----------------------------------------------------------

function roleRow(row, full = true) {
  return {
    id: row.id, name: row.name,
    context: full ? row.context : trimText(row.context, 200),
    sources: full ? row.sources ?? [] : undefined,
    updatedAt: row.updatedAt,
  };
}







// -----------------------------------------------------------
// companyProfile
// -----------------------------------------------------------
//
// The full profile, compacted for the model: every field, the
// credentials, the adopted standards, the documents with the
// ids readDocument takes, and role previews. The owner's id
// and name are left out.
//
// Used by:
//   - companyTools (below) — getCompany, createCompany, updateCompany
// -----------------------------------------------------------

function companyProfile(company) {
  const { credentials = [], standards = [], documents = [], roles = [], ownerId: _o, ownerName: _n, ...fields } = company;
  return {
    ...fields,
    credentials: credentials.map(credentialRow),
    standards: standards.map(standardRow),
    documents: documents.map((d) => ({
      id: d.id, title: d.title, kind: d.kind, charCount: d.charCount, extractionStatus: d.extractionStatus,
      documentType: d.documentType ?? null, summary: d.inventorySummary ? trimText(d.inventorySummary, 300) : null,
    })),
    roles: roles.map((r) => roleRow(r, false)),
  };
}







// -----------------------------------------------------------
// companyTools
// -----------------------------------------------------------
//
// The group's tools for one turn, bound to its Django client
// and thread. The tools that link the conversation need the
// thread; without one they say so instead of failing.
//
// Used by:
//   - llm/tools.js — createTools
// -----------------------------------------------------------

export function companyTools(ctx) {
  const { django, threadId } = ctx;

  // Links the thread to a company; a failure here is a log
  // line, never a failed tool — the company itself was saved
  const linkThread = async (companyId) => {
    if (!threadId) return false;
    try {
      await django.patch(url`/api/chat/threads/${threadId}`, { companyId });
      return true;
    } catch (err) {
      console.error("Thread link failed:", err?.message);
      return false;
    }
  };


  const listCompanies = defineTool("listCompanies", {
    description: "Find or list the user's own companies on the platform (id, name, type). To find a company the user "
      + "names, pass a distinctive part of its name, e.g. \"1009\" for \"1009, LTD\": case, punctuation, word order, "
      + "legal forms (UAB, LTD, …) and \"company\" / \"įmonė\" do not matter. When nothing matches, `closest` lists "
      + "the user's companies most like the query (likeness 0–1): use the one clearly meant, otherwise ask the user. "
      + "Without a query it lists them all. Run it before createCompany.",
    input: z.strictObject({
      query: z.string().max(200).optional().describe("A distinctive part of the name, or the registration code"),
    }),
    run: async ({ query: q }) => {
      const answer = await django.get(`/api/companies${query({ scope: "own", q })}`);
      const companies = answer?.companies || [];
      const listed = { companies: companies.slice(0, 50).map(companySummary), total: companies.length };
      if (companies.length > 0 || !q?.trim()) return listed;
      // Nothing matched word by word: the user's companies whose
      // names are most like the query (a typo, no diacritics)
      const own = await django.get(`/api/companies${query({ scope: "own" })}`);
      return { ...listed, closest: closestCompanies(own?.companies || [], q) };
    },
  }, ctx);


  const getCompany = defineTool("getCompany", {
    description: "The full profile of one company: every field, its credentials (claimed/verified), the "
      + "standards it adopted, documents (with ids) and role profiles.",
    input: z.strictObject({ companyId: id("The company id") }),
    run: async ({ companyId }) => companyProfile(await django.get(url`/api/companies/${companyId}`)),
  }, ctx);


  const createCompany = defineTool("createCompany", {
    description: "Create a company profile from what the user stated and their documents establish. Fill "
      + "every field the facts settle; what nothing settles stays null. The conversation is linked to the new "
      + "company automatically.",
    input: z.strictObject(COMPANY_FIELDS),
    run: async (fields) => {
      // The whole own list, not ?q=: Django's search matches
      // differently, and only sameName decides what is a twin
      const existing = await django.get(`/api/companies${query({ scope: "own" })}`);
      const twin = (existing?.companies || []).find((c) => sameName(c.name, fields.name));
      if (twin) {
        throw new ToolFailure("createCompany", "DUPLICATE_COMPANY",
          `the user already has "${twin.name}" (id ${twin.id}) — use updateCompany or setThreadCompany instead`);
      }
      const company = await django.post("/api/companies", fields);
      return { company: companyProfile(company), threadLinked: await linkThread(company.id) };
    },
  }, ctx);


  const updateCompany = defineTool("updateCompany", {
    description: "Update any subset of a company's profile fields — at least one. Send only what changed: a field "
      + "left out keeps its value, and so does every member of attributes and financialMarket that is not given. null clears a "
      + "field that takes null.",
    input: z.strictObject({ companyId: id("The company id"), ...z.strictObject(COMPANY_FIELDS).partial().shape }),
    run: async ({ companyId, ...fields }) => {
      nothingGiven("updateCompany", fields);
      if (fields.attributes || fields.financialMarket) {
        const recorded = await django.get(url`/api/companies/${companyId}`);
        if (fields.attributes) fields.attributes = mergeMembers(recorded?.attributes, fields.attributes);
        if (fields.financialMarket) {
          fields.financialMarket = mergeMembers(recorded?.financialMarket, fields.financialMarket);
        }
      }
      return companyProfile(await django.put(url`/api/companies/${companyId}`, fields));
    },
  }, ctx);


  const setThreadCompany = defineTool("setThreadCompany", {
    description: "Link this conversation to an existing company so its profile is in context on every turn "
      + "(this also clears the conversation's role).",
    input: z.strictObject({ companyId: id("The company id") }),
    run: async ({ companyId }) => {
      if (!threadId) return { linked: false, note: "This conversation has no persistent thread yet." };
      const thread = await django.patch(url`/api/chat/threads/${threadId}`, { companyId });
      return { linked: true, companyId: thread.companyId, companyName: thread.companyName ?? null };
    },
  }, ctx);


  const addCredential = defineTool("addCredential", {
    description: "Record a certificate, licence, permit or registration the company holds or claims. "
      + "A credential with the same kind and name is completed instead of duplicated: the fields given with a "
      + "value are added to it, nothing recorded is emptied and a verification is not withdrawn (updateCredential "
      + "does both).",
    input: z.strictObject({ companyId: id("The company id"), ...CREDENTIAL_FIELDS }),
    run: async ({ companyId, ...fields }) => {
      const listed = await django.get(url`/api/companies/${companyId}/credentials`);
      const twin = (listed?.credentials || []).find((c) => c.kind === fields.kind && sameName(c.name, fields.name));
      // Recording a credential again says what else is known of
      // it — not that the rest is gone, or that it was not checked
      const known = !twin ? fields : Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
        value !== null && value !== "" && !(key === "status" && value === "claimed")));
      const { row, evidenceLinked } = await sendWithEvidence((body) => (twin
        ? django.patch(url`/api/companies/${companyId}/credentials/${twin.id}`, body)
        : django.post(url`/api/companies/${companyId}/credentials`, body)), known);
      return {
        credential: credentialRow(row), updatedExisting: Boolean(twin),
        ...(evidenceLinked ? {} : { note: "Recorded without its evidence document: that document is not one of "
          + "this company's yet — attach it (attachDocument), then link it with updateCredential." }),
      };
    },
  }, ctx);


  const updateCredential = defineTool("updateCredential", {
    description: "Change any subset of a credential's fields, at least one — e.g. add its issuer and number, or "
      + "link its evidence document. A field left out keeps its value, null empties it, and status 'claimed' withdraws a "
      + "verification. Mark it verified only on the user's explicit word that it was checked.",
    input: z.strictObject({
      companyId: id("The company id"),
      credentialId: id("The credential id"),
      ...z.strictObject(CREDENTIAL_FIELDS).partial().shape,
    }),
    run: async ({ companyId, credentialId, ...fields }) => {
      nothingGiven("updateCredential", fields);
      return { credential: credentialRow(await django.patch(url`/api/companies/${companyId}/credentials/${credentialId}`, fields)) };
    },
  }, ctx);


  const removeCredential = defineTool("removeCredential", {
    description: "Remove a credential recorded by mistake.",
    input: z.strictObject({ companyId: id("The company id"), credentialId: id("The credential id") }),
    run: async ({ companyId, credentialId }) => {
      await django.del(url`/api/companies/${companyId}/credentials/${credentialId}`);
      return { removed: true, credentialId };
    },
  }, ctx);


  const setCompanyStandard = defineTool("setCompanyStandard", {
    description: "Record a standard the company is certified to, is implementing or plans to adopt (ISO/IEC 27001, "
      + "ISO 9001, …): every later analysis then assesses the company against that standard's requirements. "
      + "Name it by its designation as the user does ('ISO 27001'); it must be in the corpus (listLegalActs with "
      + "docType 'standard'). The same standard again updates the record. A certificate is recorded with "
      + "addCredential (kind 'certificate') and linked here by its id.",
    input: z.strictObject({
      companyId: id("The company id"),
      standard: filled(200).describe("The designation or corpus id, e.g. 'ISO/IEC 27001:2022'"),
      status: z.enum(STANDARD_STATUSES).describe("certified · implementing · planned"),
      scope: z.string().max(4000).optional().describe("What the management system covers, in the user's words"),
      certificateId: filled(100).nullable().optional()
        .describe("The id of the company's certificate credential; null unlinks it"),
      notes: z.string().max(4000).optional(),
    }),
    run: async ({ companyId, standard, ...fields }) => {
      const corpus = await django.get(`/api/corpus/documents${query({ docType: "standard" })}`);
      const document = pickStandard(corpus?.documents || [], standard);
      const listed = await django.get(url`/api/companies/${companyId}/standards`);
      const twin = (listed?.standards || []).find((row) => row.documentId === document.id);
      const row = twin
        ? await django.patch(url`/api/companies/${companyId}/standards/${twin.id}`, fields)
        : await django.post(url`/api/companies/${companyId}/standards`, { documentId: document.id, ...fields });
      return { standard: standardRow(row), created: !twin };
    },
  }, ctx);


  const removeCompanyStandard = defineTool("removeCompanyStandard", {
    description: "Remove a standard recorded for the company by mistake — its id is in getCompany's standards.",
    input: z.strictObject({ companyId: id("The company id"), adoptionId: id("The id of the adopted standard") }),
    run: async ({ companyId, adoptionId }) => {
      await django.del(url`/api/companies/${companyId}/standards/${adoptionId}`);
      return { removed: true, adoptionId };
    },
  }, ctx);


  const listRoles = defineTool("listRoles", {
    description: "The company's saved role profiles (e.g. compliance officer) with their full ROLE_CONTEXT text.",
    input: z.strictObject({ companyId: id("The company id") }),
    run: async ({ companyId }) => {
      const answer = await django.get(url`/api/companies/${companyId}/roles`);
      return { roles: (answer?.roles || []).map((r) => roleRow(r)) };
    },
  }, ctx);


  const saveRole = defineTool("saveRole", {
    description: "Save a role profile for the company (create, or replace the role with the same name — its "
      + "context and its sources both). context is the role in at most 250 words of plain text, without a "
      + "heading — a conversation that adopts the role gets it in its instructions; sources name the documents "
      + "and sections it rests on.",
    input: z.strictObject({
      companyId: id("The company id"),
      name: filled(200).describe("Role name, e.g. 'Atitikties pareigūnas'"),
      context: filled(6000).describe("The role's text: duties, reporting line, independence, conflicts"),
      sources: z.array(z.strictObject({
        title: filled(300)
          .describe("The document's title, exactly as the company context or listDocuments gives it"),
        documentId: filled(100).optional()
          .describe("The document's id, when the platform holds the document"),
        section: z.string().max(300).optional().describe("The section, e.g. §5.1"),
      })).max(50).describe("The documents and sections the role rests on; [] only when it rests on none"),
    }),
    run: async ({ companyId, name, context, sources }) => {
      const listed = await django.get(url`/api/companies/${companyId}/roles`);
      const twin = (listed?.roles || []).find((r) => sameName(r.name, name));
      const body = { name, context, sources };
      const row = twin
        ? await django.patch(url`/api/companies/${companyId}/roles/${twin.id}`, body)
        : await django.post(url`/api/companies/${companyId}/roles`, body);
      return { role: roleRow(row), created: !twin };
    },
  }, ctx);


  const setThreadRole = defineTool("setThreadRole", {
    description: "Make this conversation act in a saved role of its company (its ROLE_CONTEXT joins the "
      + "instructions from the next turn); roleId null clears it.",
    input: z.strictObject({ roleId: filled(100).nullable().describe("The role id, or null") }),
    run: async ({ roleId }) => {
      if (!threadId) return { linked: false, note: "This conversation has no persistent thread yet." };
      const thread = await django.patch(url`/api/chat/threads/${threadId}`, { roleId });
      return { roleId: thread.roleId ?? null, roleName: thread.role?.name ?? null };
    },
  }, ctx);


  return {
    listCompanies, getCompany, createCompany, updateCompany, setThreadCompany,
    addCredential, updateCredential, removeCredential, setCompanyStandard, removeCompanyStandard,
    listRoles, saveRole, setThreadRole,
  };
}
