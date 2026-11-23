// -----------------------------------------------------------
//  [*] Assistant tools — the shared kit
//
//  What every tool group builds on, so a new tool is one
//  defineTool block in its group file. A tool's input is a
//  strict zod object: the AI SDK checks every call against it,
//  so a wrong key or value goes back to the model as an error
//  it can fix and never reaches Django. Django's enums are
//  mirrored here once, every id placed in a path goes through
//  url, and every failure ends as a ToolFailure the model
//  reads as it is.
//
//  Split into:
//
//    INSTITUTION_TYPES … PRODUCT_KINDS — Django's enums
//    ToolFailure — the error a tool call ends with
//    url         — a path with every value encoded
//    query       — a query string, empty values left out
//    filled      — the zod field for a text that must be given
//    id          — the zod field for an id
//    trimText    — a long text capped for the model
//    defineTool  — one tool, timed, its failures translated
// -----------------------------------------------------------

import { tool, zodSchema } from "ai";
import { z } from "zod";

import { HttpError } from "../../middleware/errors.js";







// -----------------------------------------------------------
// INSTITUTION_TYPES
// -----------------------------------------------------------
//
// Django's INSTITUTION_TYPES (companies/models.py): the Bank
// of Lithuania licence category of a company.
//
// Used by:
//   - llm/tools/companies.js — the profile fields
//   - llm/prompt.js — the company context's allowlist
// -----------------------------------------------------------

export const INSTITUTION_TYPES = [
  "bank", "credit_union", "payment_institution", "emi", "casp", "crowdfunding", "consumer_credit",
  "real_estate_credit", "currency_exchange", "investment_firm", "insurance", "other_financial", "none", "unknown",
];







// -----------------------------------------------------------
// SIZE_CATEGORIES
// -----------------------------------------------------------
//
// Django's SIZE_CATEGORIES: the size class of a company.
//
// Used by:
//   - llm/tools/companies.js, llm/prompt.js
// -----------------------------------------------------------

export const SIZE_CATEGORIES = ["micro", "small", "medium", "large", "unknown"];







// -----------------------------------------------------------
// CREDENTIAL_KINDS
// -----------------------------------------------------------
//
// Django's CREDENTIAL_KINDS: what sort of credential a
// company holds.
//
// Used by:
//   - llm/tools/companies.js, llm/prompt.js
// -----------------------------------------------------------

export const CREDENTIAL_KINDS = ["certificate", "license", "permit", "registration"];







// -----------------------------------------------------------
// CREDENTIAL_STATUSES
// -----------------------------------------------------------
//
// Django's CREDENTIAL_STATUSES: a credential stays "claimed"
// until a person has checked its issuer and number, or an
// evidence document.
//
// Used by:
//   - llm/tools/companies.js, llm/prompt.js
// -----------------------------------------------------------

export const CREDENTIAL_STATUSES = ["claimed", "verified"];







// -----------------------------------------------------------
// STANDARD_STATUSES
// -----------------------------------------------------------
//
// Django's STANDARD_STATUSES: how far a company is with a
// standard it adopted — certified, implementing it, or
// planning to (a report then shows the gap to close).
//
// Used by:
//   - llm/tools/companies.js — setCompanyStandard
// -----------------------------------------------------------

export const STANDARD_STATUSES = ["certified", "implementing", "planned"];







// -----------------------------------------------------------
// DOCUMENT_KINDS
// -----------------------------------------------------------
//
// Django's DOCUMENT_KINDS: the kind of an uploaded document.
//
// Used by:
//   - llm/tools/documents.js, llm/prompt.js
// -----------------------------------------------------------

export const DOCUMENT_KINDS = ["policy", "procedure", "contract", "register", "other"];







// -----------------------------------------------------------
// FINDING_STATUSES
// -----------------------------------------------------------
//
// Django's FINDING_STATUSES. The Lithuanian report calls them
// atitinka, iš dalies, neatitinka, neįrodyta and netaikoma,
// in the same order.
//
// Used by:
//   - llm/tools/reports.js — getReport, overrideFinding
// -----------------------------------------------------------

export const FINDING_STATUSES = ["met", "partial", "missing", "unknown", "not_applicable"];







// -----------------------------------------------------------
// SEVERITIES
// -----------------------------------------------------------
//
// Django's finding SEVERITIES, most severe first — the order
// getReport lists the findings of one status in.
//
// Used by:
//   - llm/tools/reports.js — getReport
// -----------------------------------------------------------

export const SEVERITIES = ["critical", "high", "medium", "low"];







// -----------------------------------------------------------
// REPORT_STATUSES
// -----------------------------------------------------------
//
// The states of a compliance report, as Django's
// analysis/models.py names them: waiting for the worker, being
// analysed, waiting for a person to approve the list of acts
// it will assess (scope_review — the run has decided which
// acts apply and judges nothing until then), finished, failed,
// stopped by the user.
//
// Used by:
//   - llm/tools/reports.js — listReports' filter
//   - llm/prompt.js — the reports of the company context
// -----------------------------------------------------------

export const REPORT_STATUSES = ["queued", "running", "scope_review", "done", "failed", "cancelled"];







// -----------------------------------------------------------
// OBLIGATION_CATEGORIES
// -----------------------------------------------------------
//
// The categories an extracted obligation is filed under, as
// Django's corpus/models.py names them.
//
// Used by:
//   - llm/tools/corpus.js — listObligations' filter
// -----------------------------------------------------------

export const OBLIGATION_CATEGORIES = [
  "licensing", "registration", "governance", "policy", "procedure", "risk_management", "ict_security",
  "outsourcing", "incident_reporting", "reporting", "disclosure", "record_keeping", "customer_protection",
  "aml_kyc", "capital", "safeguarding", "training", "data_protection", "ai_governance", "other",
];







// -----------------------------------------------------------
// OBLIGATION_STATUSES
// -----------------------------------------------------------
//
// Where an extracted obligation stands in its review, as
// Django's corpus/models.py names it: a model's reading not
// yet looked at, one a reviewer approved, one a reviewer
// rejected — which is then no requirement, and no report
// assesses it.
//
// Used by:
//   - llm/tools/corpus.js — listObligations' filter
// -----------------------------------------------------------

export const OBLIGATION_STATUSES = ["proposed", "approved", "rejected"];







// -----------------------------------------------------------
// JURISDICTIONS
// -----------------------------------------------------------
//
// Django's corpus JURISDICTIONS: EU and Lithuanian acts, and
// international standards (ISO, IEC).
//
// Used by:
//   - llm/tools/corpus.js — searchLegalCorpus, listLegalActs
// -----------------------------------------------------------

export const JURISDICTIONS = ["EU", "LT", "INTL"];







// -----------------------------------------------------------
// PRODUCT_KINDS
// -----------------------------------------------------------
//
// Django's KINDS (programme/kinds.py): the kinds of work
// product a compliance programme has, each building on the
// ones before it — the compliance policy, the governance
// structure with its process and RACI matrix, the legal risk
// criteria with the register.
//
// Used by:
//   - llm/tools/programme.js — startWorkProduct,
//     getWorkProduct
// -----------------------------------------------------------

export const PRODUCT_KINDS = ["policy", "governance", "risks"];







// -----------------------------------------------------------
// ToolFailure
// -----------------------------------------------------------
//
// The error a tool call ends with. Its message is the code in
// brackets, the tool, the HTTP status when there was one and
// the cause, cut to 400 characters: the model reads it as it
// is, and the chat's tool pill shows the code. The name is set
// by hand because streamErrorText recognises the error by it.
//
// Used by:
//   - defineTool (below)
//   - llm/tools/companies.js, reports.js — their own refusals
//   - llm/mcp.js — the external tools' failures
//   - llm/stream.js — streamErrorText, by its name
// -----------------------------------------------------------

export class ToolFailure extends Error {
  constructor(toolName, code, message, status = null) {
    super(`[${code}] ${toolName} failed${status ? ` (HTTP ${status})` : ""}: ${String(message).slice(0, 400)}`);
    this.name = "ToolFailure";
    this.code = code;
    this.status = status;
    this.toolName = toolName;
  }
}







// -----------------------------------------------------------
// url
// -----------------------------------------------------------
//
// A tagged template for Django paths: every interpolated value
// is encoded, so no id the model produced can add a path
// segment or a query. "." and ".." are refused as 400
// INVALID_ID — encoding leaves them as they are, and fetch
// would resolve them as dot segments and drop part of the path.
//
// Used by:
//   - llm/tools/actions.js, companies.js, documents.js,
//     programme.js, reports.js
// -----------------------------------------------------------

export function url(strings, ...values) {
  return strings.reduce((out, chunk, index) => {
    if (index >= values.length) return out + chunk;
    const value = String(values[index]);
    if (value === "." || value === "..") throw new HttpError(400, "INVALID_ID", `"${value}" is not an id`);
    return out + chunk + encodeURIComponent(value);
  }, "");
}







// -----------------------------------------------------------
// query
// -----------------------------------------------------------
//
// An object's values as an encoded query string with its "?",
// leaving out empty, null and undefined values — an empty
// string when nothing is left.
//
// Used by:
//   - llm/tools/companies.js, corpus.js, documents.js,
//     reports.js
// -----------------------------------------------------------

export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}







// -----------------------------------------------------------
// filled
// -----------------------------------------------------------
//
// The zod field for a text the model must give, between `min`
// and `max` characters. The text is trimmed before its bounds
// are checked, so one of spaces alone is refused like an
// empty one and the lower bound means what it says; what
// reaches Django is the trimmed text.
//
// Used by:
//   - id (below)
//   - llm/tools/companies.js, corpus.js, documents.js,
//     reports.js — every text of a tool's input that has a
//     lower bound
// -----------------------------------------------------------

export function filled(max, min = 1) {
  return z.string().trim().min(min).max(max);
}







// -----------------------------------------------------------
// id
// -----------------------------------------------------------
//
// The zod field for a platform id, with the description the
// model reads. It only bounds the length: whether the id
// exists, and is the user's, is for Django to answer.
//
// Used by:
//   - llm/tools/actions.js, companies.js, documents.js,
//     programme.js, reports.js
// -----------------------------------------------------------

export function id(description) {
  return filled(100).describe(description);
}







// -----------------------------------------------------------
// trimText
// -----------------------------------------------------------
//
// Caps a long text for a tool result, marking the cut so the
// model knows there is more.
//
// Used by:
//   - every tool group
// -----------------------------------------------------------

export function trimText(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)} …[truncated]` : text;
}







// -----------------------------------------------------------
// defineTool
// -----------------------------------------------------------
//
// One AI SDK tool from its name, description, zod input and
// run function. Every call is timed and reported to ctx.record
// with its outcome, for the turn's log. Every throw ends as a
// ToolFailure: an HttpError keeps Django's code and status, a
// crash becomes TOOL_FAILED with its detail in the log only.
//
// Used by:
//   - llm/tools/actions.js, companies.js, corpus.js,
//     documents.js, programme.js, reports.js
// -----------------------------------------------------------

export function defineTool(name, { description, input, run }, ctx) {
  return tool({
    description,
    inputSchema: zodSchema(input),
    execute: async (args) => {
      const started = Date.now();
      try {
        const result = await run(args);
        ctx.record?.({ name, ms: Date.now() - started, ok: true });
        return result;
      } catch (err) {
        const failure = err instanceof ToolFailure ? err
          : err instanceof HttpError ? new ToolFailure(name, err.code || "DJANGO_API_ERROR", err.message, err.status)
            : new ToolFailure(name, "TOOL_FAILED", "Unexpected error while running the tool");
        if (!(err instanceof ToolFailure) && !(err instanceof HttpError)) {
          console.error(`Tool ${name} crashed:`, err?.stack || err?.message);
        }
        ctx.record?.({ name, ms: Date.now() - started, ok: false, code: failure.code });
        throw failure;
      }
    },
  });
}
