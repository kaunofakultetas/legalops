// -----------------------------------------------------------
//  [*] Tests — the tools' shared kit (llm/tools/shared.js)
//
//  What every tool builds on — ToolFailure, the url and query
//  builders, defineTool and the enums — tested directly, with
//  no Django behind it.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-12 — url let ".." remove a path segment
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { mock, test } from "node:test";

import "./env.mjs";
import { z } from "zod";

import {
  CREDENTIAL_KINDS, CREDENTIAL_STATUSES, DOCUMENT_KINDS, FINDING_STATUSES, INSTITUTION_TYPES, JURISDICTIONS,
  PRODUCT_KINDS, REPORT_STATUSES, SEVERITIES, SIZE_CATEGORIES, STANDARD_STATUSES, ToolFailure, defineTool, id, query, trimText, url,
} from "../llm/tools/shared.js";
import { HttpError } from "../middleware/errors.js";







// -----------------------------------------------------------
// run
// -----------------------------------------------------------
//
// Calls a tool the way the AI SDK does, schema first, and
// hands back the outcome instead of throwing: the result, the
// error it threw, or a refusal marker when the schema said no.
//
// Used by:
//   - the defineTool tests (below)
// -----------------------------------------------------------

async function run(tool, input) {
  const verdict = await tool.inputSchema.validate(input);
  if (!verdict.success) return { refused: true };
  try {
    return await tool.execute(verdict.value, { toolCallId: "c", messages: [] });
  } catch (err) {
    return err;
  }
}


test("ToolFailure: '[CODE] tool failed (HTTP n): message' — the shape the model and the GUI pill read", () => {
  const failure = new ToolFailure("getCompany", "NOT_FOUND", "Company not found", 404);
  assert.ok(failure instanceof Error);
  assert.equal(failure.name, "ToolFailure");
  assert.equal(failure.message, "[NOT_FOUND] getCompany failed (HTTP 404): Company not found");
  assert.deepEqual([failure.code, failure.status, failure.toolName], ["NOT_FOUND", 404, "getCompany"]);
  assert.equal(new ToolFailure("t", "OWN_GUARD", "no").message, "[OWN_GUARD] t failed: no", "no status, no HTTP part");
  assert.equal(new ToolFailure("t", "X", "m".repeat(1_000)).message.length, "[X] t failed: ".length + 400, "the message is capped");
  assert.match(new ToolFailure("t", "X", { toString: () => "object" }).message, /: object$/);
  assert.match(failure.message, /^\[([A-Z0-9_]{2,40})\]/, "the GUI's errorCode() regex reads it");
});


test("url encodes every value: no id can add a segment, a query or a fragment", () => {
  assert.equal(url`/api/companies/${"c1"}`, "/api/companies/c1");
  assert.equal(url`/api/companies/${"../users/x?y=1#z"}/credentials/${"a b/c"}`,
               "/api/companies/..%2Fusers%2Fx%3Fy%3D1%23z/credentials/a%20b%2Fc");
  assert.equal(url`/api/documents/${"Ąžuolas 🙂"}`, "/api/documents/%C4%84%C5%BEuolas%20%F0%9F%99%82");
  assert.equal(url`/api/reports/${42}/findings/${"%2e%2e"}`, "/api/reports/42/findings/%252e%252e", "an encoded dot stays inert");
  assert.equal(url`/api/plain`, "/api/plain");
  assert.equal(url`/a/${"x"}${"y"}/b`, "/a/xy/b");
});


test("url refuses a dot segment, which fetch would resolve away (ASSISTANT-LLM-12, FIXED)", async () => {
  for (const bad of [".", ".."]) {
    assert.throws(() => url`/api/companies/c1/credentials/${bad}`,
                  (err) => err instanceof HttpError && err.code === "INVALID_ID" && err.status === 400, bad);
  }
  assert.equal(url`/api/documents/${"...."}`, "/api/documents/....", "only . and .. are dot segments");
  assert.equal(url`/api/documents/${".hidden"}`, "/api/documents/.hidden");
  const { createTools } = await import("../llm/tools.js");
  const sent = [];
  const django = { del: async (path) => { sent.push(path); return {}; }, get: async () => ({}), patch: async () => ({}), post: async () => ({}) };
  const tools = createTools({ django, threadId: "t1" });
  await assert.rejects(tools.removeCredential.execute({ companyId: "c1", credentialId: ".." }, {}),
                       (err) => err.name === "ToolFailure" && err.code === "INVALID_ID"
                         && err.message === "[INVALID_ID] removeCredential failed (HTTP 400): \"..\" is not an id");
  assert.deepEqual(sent, [], "nothing was sent — no DELETE /api/companies/c1/");
});


test("query: empties skipped, the rest encoded in order; nothing → ''", () => {
  assert.equal(query({ scope: "own", q: "Kripto", limit: null }), "?scope=own&q=Kripto");
  assert.equal(query({ q: "a&b=c #ž", k: 8, flag: false, none: undefined, empty: "" }), "?q=a%26b%3Dc+%23%C5%BE&k=8&flag=false");
  assert.equal(query({}), "");
  assert.equal(query({ a: null, b: undefined, c: "" }), "");
  assert.equal(query({ ids: ["a", "b"] }), "?ids=a%2Cb");
  assert.equal(query({ zero: 0 }), "?zero=0", "a zero is a value");
});


test("id: 1 to 100 characters, described for the model; trimText marks the cut", () => {
  const field = id("The company id");
  assert.equal(field.safeParse("").success, false);
  assert.equal(field.safeParse("x".repeat(100)).success, true);
  assert.equal(field.safeParse("x".repeat(101)).success, false);
  assert.equal(field.safeParse(5).success, false);
  assert.equal(field.description, "The company id");
  assert.equal(trimText("abc", 3), "abc");
  assert.equal(trimText("abcd", 3), "abc …[truncated]");
  assert.equal(trimText(null, 3), "");
  assert.equal(trimText(undefined, 3), "");
  assert.equal(trimText(12345, 2), "12 …[truncated]");
});


test("defineTool: a strict schema the model sees, the result as is, one telemetry record per call", async () => {
  const calls = [];
  const tool = defineTool("probe", {
    description: "A probe", input: z.strictObject({ n: z.number().int() }), run: async ({ n }) => ({ doubled: n * 2 }),
  }, { record: (c) => calls.push(c) });
  assert.equal(tool.description, "A probe");
  const schema = await tool.inputSchema.jsonSchema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["n"]);
  assert.deepEqual(await run(tool, { n: 2, extra: true }), { refused: true }, "an unknown key is refused");
  assert.deepEqual(await run(tool, { n: "2" }), { refused: true }, "no coercion");
  assert.deepEqual(await run(tool, { n: 21 }), { doubled: 42 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "probe");
  assert.equal(calls[0].ok, true);
  assert.ok(Number.isFinite(calls[0].ms) && calls[0].ms >= 0);
  assert.equal("code" in calls[0], false);
  const silent = defineTool("silent", { description: "d", input: z.strictObject({}), run: async () => "ok" }, {});
  assert.equal(await run(silent, {}), "ok", "no recorder, no crash");
});


test("defineTool: Django's code and status survive; a ToolFailure passes as is; a crash is TOOL_FAILED", async () => {
  const calls = [];
  const throwing = (err) => defineTool("probe", { description: "d", input: z.strictObject({}), run: async () => { throw err; } },
                                       { record: (c) => calls.push(c) });
  const django = await run(throwing(new HttpError(409, "ALREADY_RUNNING", "An analysis is already running")), {});
  assert.equal(django.message, "[ALREADY_RUNNING] probe failed (HTTP 409): An analysis is already running");
  assert.deepEqual([django.code, django.status], ["ALREADY_RUNNING", 409]);
  const nameless = await run(throwing(new HttpError(500, undefined, "boom")), {});
  assert.equal(nameless.code, "DJANGO_API_ERROR");
  const own = new ToolFailure("elsewhere", "OWN", "kept");
  assert.equal(await run(throwing(own), {}), own);
  const logged = mock.method(console, "error", () => {});
  try {
    const crash = await run(throwing(new TypeError("Cannot read properties of undefined (reading 'secret')")), {});
    assert.equal(crash.message, "[TOOL_FAILED] probe failed: Unexpected error while running the tool");
    assert.equal(crash.status, null);
    assert.match(logged.mock.calls[0].arguments.join(" "), /Tool probe crashed: TypeError: Cannot read properties/);
  } finally {
    logged.mock.restore();
  }
  assert.deepEqual(calls.map((c) => [c.ok, c.code]), [[false, "ALREADY_RUNNING"], [false, "DJANGO_API_ERROR"], [false, "OWN"], [false, "TOOL_FAILED"]]);
});


test("the enums mirror Django's CHECK constraints (companies/, analysis/, corpus/ models.py) and its kinds of work product", () => {
  assert.deepEqual(INSTITUTION_TYPES, ["bank", "credit_union", "payment_institution", "emi", "casp", "crowdfunding",
    "consumer_credit", "real_estate_credit", "currency_exchange", "investment_firm", "insurance", "other_financial",
    "none", "unknown"]);
  assert.deepEqual(SIZE_CATEGORIES, ["micro", "small", "medium", "large", "unknown"]);
  assert.deepEqual(CREDENTIAL_KINDS, ["certificate", "license", "permit", "registration"]);
  assert.deepEqual(CREDENTIAL_STATUSES, ["claimed", "verified"]);
  assert.deepEqual(DOCUMENT_KINDS, ["policy", "procedure", "contract", "register", "other"]);
  assert.deepEqual(FINDING_STATUSES, ["met", "partial", "missing", "unknown", "not_applicable"]);
  assert.deepEqual(SEVERITIES, ["critical", "high", "medium", "low"]);
  assert.deepEqual(REPORT_STATUSES, ["queued", "running", "scope_review", "done", "failed", "cancelled"],
                   "scope_review: the run waits for a person to approve its list of acts");
  assert.deepEqual(JURISDICTIONS, ["EU", "LT", "INTL"]);
  assert.deepEqual(STANDARD_STATUSES, ["certified", "implementing", "planned"]);
  assert.deepEqual(PRODUCT_KINDS, ["policy", "governance", "risks"], "programme/kinds.py, each kind building on the ones before it");
});
