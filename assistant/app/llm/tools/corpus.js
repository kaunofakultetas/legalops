// -----------------------------------------------------------
//  [*] Assistant tools — the legal corpus
//
//  The indexed Lithuanian and EU acts, and the standards
//  (ISO/IEC, EN, LST) the admins uploaded as licensed copies —
//  open to every signed-in user:
//
//    searchLegalCorpus · getLegalProvision · checkCitations
//    listLegalActs · listObligations
//
//  Every hit and provision carries its citation — the act's
//  short title, the provision path and the official link (an
//  EUR-Lex deep link for EU acts) — which the chat shows as a
//  chip; only text retrieved here lets the model drop
//  "(tikrintina)" from a citation. checkCitations tells the
//  model when a claimed article is about something else. An
//  empty answer may only mean the corpus lacks that act. A
//  standard is read by its clauses: its "article" is the
//  clause's citation as the corpus shows it — a number, the
//  identifier a framework gives its controls, a heading, or
//  the page of a standard indexed by its pages.
//
//  listObligations reads the register of obligations the
//  platform extracted from each act — what an act requires,
//  of whom and by when — the same rows a compliance analysis
//  assesses a company against. An obligation is a model's
//  reading until an admin approved it (its status says which);
//  the provision it cites is the source.
//
//  Split into:
//
//    citationOf  — the citation block of a hit or provision
//    versionOf   — a catalogue row's current version
//    actNamed    — the catalogue row an act's name means
//    corpusTools — the group (named export)
// -----------------------------------------------------------

import { z } from "zod";

import {
  JURISDICTIONS, OBLIGATION_CATEGORIES, OBLIGATION_STATUSES, ToolFailure, defineTool, filled, query, trimText,
} from "./shared.js";


// What searchLegalCorpus may narrow to — Django's
// corpus/search.py KINDS
const SEARCH_KINDS = ["acts", "standards"];

// Characters of each search hit the model gets
const MAX_HIT_TEXT = 1_500;

// Characters of one provision's verbatim text
const MAX_PROVISION = 20_000;

// The most obligations listObligations answers in one page
const MAX_OBLIGATIONS = 30;

// How long a citation check may take: Django has a model
// compare every claim with its provision before it answers —
// 24 s for thirteen references, where the client's ordinary
// 15 s made the tool fail as "backend unreachable"
const JUDGE_TIMEOUT_MS = 150_000;







// -----------------------------------------------------------
// citationOf
// -----------------------------------------------------------
//
// The citation block of a hit, a provision or a checked
// citation: which act or standard, which provision, and where
// to read it officially — the citation link, else the act's
// source page.
//
// Used by:
//   - corpusTools (below) — searchLegalCorpus,
//     getLegalProvision, checkCitations
// -----------------------------------------------------------

function citationOf(row) {
  return {
    unitId: row.unitId ?? null, documentId: row.documentId ?? null, shortTitle: row.shortTitle ?? null,
    title: row.documentTitle ?? null, jurisdiction: row.jurisdiction ?? null, docType: row.docType ?? null,
    path: row.path ?? null,
    heading: row.heading ?? null, citationUrl: row.citationUrl || row.sourceUrl || null,
  };
}







// -----------------------------------------------------------
// versionOf
// -----------------------------------------------------------
//
// A catalogue row's current version — its number, effective
// date and status — or null while the act has none.
//
// Used by:
//   - corpusTools (below) — listLegalActs
// -----------------------------------------------------------

function versionOf(document) {
  const v = document?.currentVersion;
  if (!v) return null;
  return { versionNo: v.versionNo, effectiveDate: v.effectiveDate ?? null, status: v.status };
}







// -----------------------------------------------------------
// actNamed
// -----------------------------------------------------------
//
// The catalogue row the model means by an act's name: the one
// whose id, slug, short title or CELEX number it is, whatever
// the case; else the only one whose short title or title
// contains it. Nothing when no row or several fit.
//
// Used by:
//   - corpusTools (below) — listObligations
// -----------------------------------------------------------

function actNamed(documents, name) {
  const wanted = name.trim().toLowerCase();
  const same = (value) => String(value ?? "").toLowerCase() === wanted;
  const exact = documents.find((d) => same(d.id) || same(d.slug) || same(d.shortTitle) || same(d.externalId));
  if (exact) return exact;
  const partial = documents.filter((d) => `${d.shortTitle ?? ""} ${d.title ?? ""}`.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}







// -----------------------------------------------------------
// corpusTools
// -----------------------------------------------------------
//
// The group's tools for one turn — all of them only read the
// corpus, through the turn's Django client.
//
// Used by:
//   - llm/tools.js — createTools
// -----------------------------------------------------------

export function corpusTools(ctx) {
  const { django, language } = ctx;


  const searchLegalCorpus = defineTool("searchLegalCorpus", {
    description: "Search the indexed legal acts for provisions relevant to a question (meaning + keyword). "
      + "The corpus texts are in LITHUANIAN: write the query in Lithuanian with the acts' own terms (e.g. "
      + "'didelis su IRT susijęs incidentas pranešimas terminas'), whatever language you answer in. When the "
      + "act and article are known, getLegalProvision is exact — prefer it. Returns provision paths, excerpts "
      + "and citation URLs. The corpus may be incomplete: no hit means 'not in the corpus', not 'no such rule'. "
      + "Standards (kind 'standards') are in the language of their copy, usually English — query them so.",
    input: z.strictObject({
      query: filled(2000, 2).describe("The terms in Lithuanian, as the acts word them"),
      documents: z.array(filled(100)).max(20).optional()
        .describe("Limit to acts or standards by id, slug, short title or CELEX, e.g. ['MiCA']"),
      jurisdiction: z.enum(JURISDICTIONS).optional(),
      kind: z.enum(SEARCH_KINDS).optional().describe("Only the legal acts, or only the standards"),
      k: z.number().int().min(1).max(30).optional().describe("Hits wanted, default 8"),
    }),
    run: async ({ query: q, documents, jurisdiction, kind, k = 8 }) => {
      const answer = await django.post("/api/corpus/search", { query: q, k, documents, jurisdiction, kind });
      const hits = (answer?.hits || []).map((h) => ({
        ...citationOf(h), text: trimText(h.text, MAX_HIT_TEXT), score: h.score,
      }));
      return hits.length ? { hits }
        : { hits, note: "No provision matched. The corpus may not contain this act — say so and mark the point (tikrintina)." };
    },
  }, ctx);


  const getLegalProvision = defineTool("getLegalProvision", {
    description: "The verbatim text of one provision (article, annex or point) of an indexed act, with its "
      + "version date and citation URL — exact, and the way to verify an article before citing it. Acts by "
      + "short title (MiCA, DORA, TFR, AMLR, PSD2, GDPR, PPTFPĮ, KRĮ, LB 03-126, …) or CELEX; a standard by its "
      + "designation ('ISO 27001'), its clause in `article` as the corpus cites it: a number ('6.1.2', 'A.5.15', "
      + "'Annex A'), a framework's own identifier ('AC-2', 'GV.OC-01'), a heading, or the page ('p. 12') of a "
      + "standard indexed by pages.",
    input: z.strictObject({
      document: filled(100).describe("Act id, slug, short title or CELEX, e.g. 'MiCA' or '32023R1114'"),
      article: filled(200)
        .describe("Article / annex / point number, e.g. '59' or 'IV'; a standard's clause, identifier or page"),
      paragraph: filled(20).optional(),
      type: z.enum(["article", "annex", "point"]).optional(),
    }),
    run: async ({ document, article, paragraph, type }) => {
      const found = await django.get(`/api/corpus/provision${query({ document, article, paragraph, type })}`);
      return {
        provision: {
          ...citationOf(found), unitType: found.unitType ?? null, externalId: found.externalId ?? null,
          language: found.language ?? null, versionNo: found.versionNo ?? null, versionDate: found.versionDate ?? null,
          text: trimText(found.text, MAX_PROVISION),
        },
      };
    },
  }, ctx);


  const checkCitations = defineTool("checkCitations", {
    description: "Verify claimed article references in one batch — ALWAYS before endorsing an article number "
      + "from a user's document, and for your own draft: for each, whether the provision exists in the corpus "
      + "and whether its real heading matches the claimed subject (works across Lithuanian/English). "
      + "'mismatch' means the article is about something else — show the real heading. A standard's clause "
      + "goes in `article` ('A.5.15', 'AC-2').",
    input: z.strictObject({
      citations: z.array(z.strictObject({
        act: filled(200).describe("Short title, slug, CELEX or a unique title fragment"),
        article: filled(200),
        paragraph: filled(20).optional(),
        point: filled(20).optional(),
        claimedHeading: filled(300).optional()
          .describe("What the source says the article is about — without it only the article's existence is checked"),
      })).min(1).max(50),
    }),
    run: async ({ citations }) => {
      const answer = await django.post("/api/corpus/check-citations", { citations }, { timeoutMs: JUDGE_TIMEOUT_MS });
      // Django's rows (corpus/citations.py): status, headingMatch,
      // the judge's note, the unit's citation block and excerpt
      const results = (answer?.results || []).map((r) => ({
        act: r.act, article: r.article, paragraph: r.paragraph ?? null, point: r.point ?? null,
        claimedHeading: r.claimedHeading ?? null, status: r.status, headingMatch: r.headingMatch ?? "unknown",
        note: r.note ? trimText(r.note, 300) : null, ...citationOf(r),
        excerpt: r.excerpt ? trimText(r.excerpt, 600) : null,
      }));
      const tally = (fn) => results.filter(fn).length;
      return {
        results,
        counts: {
          found: tally((r) => r.status === "found"),
          headingMismatch: tally((r) => r.headingMatch === "mismatch"),
          notFound: tally((r) => r.status === "not_found"),
          actNotInCorpus: tally((r) => r.status === "act_not_in_corpus"),
        },
      };
    },
  }, ctx);


  const listLegalActs = defineTool("listLegalActs", {
    description: "The catalogue of indexed legal acts and standards (short title, jurisdiction, type, domains, "
      + "current version) — what the corpus holds today; docType 'standard' lists the standards only.",
    input: z.strictObject({
      query: z.string().max(200).optional().describe("Title or short title contains"),
      jurisdiction: z.enum(JURISDICTIONS).optional(),
      docType: z.enum(["standard"]).optional().describe("'standard' for the standards only"),
      domain: z.string().max(40).optional().describe("A domain tag, e.g. aml, ict, crypto"),
    }),
    run: async ({ query: q, jurisdiction, docType, domain }) => {
      const answer = await django.get(`/api/corpus/documents${query({ q, jurisdiction, docType, domain })}`);
      const documents = answer?.documents || [];
      return {
        acts: documents.slice(0, 100).map((d) => ({
          id: d.id, shortTitle: d.shortTitle || null, title: d.title, jurisdiction: d.jurisdiction, docType: d.docType,
          externalId: d.externalId || null, status: d.status, domains: d.domains, appliesTo: d.appliesTo,
          sourceUrl: d.sourceUrl || null, version: versionOf(d),
        })),
        total: documents.length,
      };
    },
  }, ctx);


  const listObligations = defineTool("listObligations", {
    description: "The obligations the platform extracted from one act or standard — what it requires, of whom, "
      + "under which conditions and by when, each with the provision it comes from. The register a compliance "
      + "analysis assesses a company against: use it for 'what does this act require of us', narrowed by "
      + "category or a word of the obligation. status 'proposed' is a model's reading not yet reviewed by a "
      + "person: quote the provision (getLegalProvision) before relying on it. What a reviewer rejected is left "
      + "out — it is no requirement — unless status asks for it. Pages with offset.",
    input: z.strictObject({
      act: filled(200).describe("Act id, slug, short title or CELEX, e.g. 'DORA' (listLegalActs names them)"),
      category: z.enum(OBLIGATION_CATEGORIES).optional().describe("Only this category, e.g. incident_reporting"),
      query: filled(200, 2).optional().describe("A word the obligation contains, in Lithuanian, e.g. 'incident'"),
      status: z.enum(OBLIGATION_STATUSES).optional()
        .describe("Only obligations in this state; left out: the proposed and the approved, without the rejected"),
      offset: z.number().int().min(0).max(100_000).optional().describe("Obligations to skip, default 0"),
      limit: z.number().int().min(1).max(MAX_OBLIGATIONS).optional().describe("Obligations to list, default 15"),
    }),
    run: async ({ act, category, query: q, status, offset = 0, limit = 15 }) => {
      const catalogue = await django.get("/api/corpus/documents");
      const document = actNamed(catalogue?.documents || [], act);
      if (!document) {
        throw new ToolFailure("listObligations", "ACT_NOT_FOUND",
          `no single act of the corpus is named "${act.slice(0, 80)}" — run listLegalActs and pass its id`);
      }
      // What a report assesses: everything a reviewer did not reject
      const states = status || OBLIGATION_STATUSES.filter((state) => state !== "rejected").join(",");
      const answer = await django.get(`/api/obligations${query({ document: document.id, category, q, status: states, offset, limit })}`);
      const rows = answer?.obligations || [];
      const english = language === "en";
      return {
        act: { id: document.id, shortTitle: document.shortTitle || null, title: document.title, version: versionOf(document) },
        total: answer?.total ?? rows.length,
        obligations: rows.map((o) => ({
          id: o.id, title: (english && o.titleEn) || o.title, text: trimText((english && o.textEn) || o.text, 500),
          addressee: o.addressee || null, appliesTo: o.appliesTo ?? null, conditions: o.conditions ? trimText(o.conditions, 300) : null,
          category: o.category, severity: o.severity, deadline: o.deadline || null,
          expectedEvidence: o.evidence ? trimText(o.evidence, 200) : null,
          provisions: (o.citations || []).slice(0, 3).map((c) => c.path).filter(Boolean),
          status: o.status,
        })),
        more: Math.max(0, (answer?.total ?? rows.length) - offset - rows.length),
      };
    },
  }, ctx);


  return { searchLegalCorpus, getLegalProvision, checkCitations, listLegalActs, listObligations };
}
