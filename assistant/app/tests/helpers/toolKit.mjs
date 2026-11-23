// -----------------------------------------------------------
//  [*] Tests — the tool test kit
//
//  What the tool test files share: the Django stub with
//  DJANGO_URL pointed at it, the test user's tool set, a call
//  that passes the tool's input schema first — as the AI SDK
//  does before execute() — and the tenancy check over
//  everything that reached Django.
//
//  Split into:
//
//    TOKEN / CLIENT_IP — the test user
//    OWNER_KEYS        — parameters that would name a user
//    startToolStub     — the Django stub, DJANGO_URL set
//    toolSet           — the test user's tools
//    call              — validate, then execute
//    refuses           — does the schema refuse this input?
//    assertAsUser      — every request as the user, no owner
// -----------------------------------------------------------

import assert from "node:assert/strict";

import { startStubDjango } from "../stubDjango.mjs";


// The bearer every tool call must carry
export const TOKEN = "tok-123";

// The end user's address every tool call must forward
export const CLIENT_IP = "198.51.100.7";

// Keys that would let a call name another user's data
const OWNER_KEYS = /^(user_?id|owner(_?id)?|owner_?name|created_?by|scope_?user)$/i;







// -----------------------------------------------------------
// startToolStub
// -----------------------------------------------------------
//
// Starts the Django stub with the test's routes and points
// DJANGO_URL at it — services/django.js reads it per call.
//
// Used by:
//   - tests/tools-actions, tools-companies, tools-corpus,
//     tools-documents, tools-programme and tools-reports
//     (.test.mjs)
// -----------------------------------------------------------

export async function startToolStub(routes = {}) {
  const stub = await startStubDjango(routes);
  process.env.DJANGO_URL = stub.url;
  return stub;
}







// -----------------------------------------------------------
// toolSet
// -----------------------------------------------------------
//
// The tools of one turn for the test user, in thread t1 and
// Lithuanian unless told otherwise, with their telemetry
// records collected into calls. The tools are imported on the
// first call, not with this module, so importing the kit
// never loads config.js.
//
// Used by:
//   - tests/tools-actions, tools-companies, tools-corpus,
//     tools-documents, tools-programme and tools-reports
//     (.test.mjs)
// -----------------------------------------------------------

export async function toolSet({ calls = [], threadId = "t1", language = "lt" } = {}) {
  const { createTools } = await import("../../llm/tools.js");
  const { userClient } = await import("../../services/django.js");
  return createTools({
    django: userClient({ token: TOKEN, clientIp: CLIENT_IP }), threadId, language, record: (c) => calls.push(c),
  });
}







// -----------------------------------------------------------
// call
// -----------------------------------------------------------
//
// Validates the input against the tool's schema — a refusal
// fails the test — then executes the tool with the validated
// value.
//
// Used by:
//   - tests/tools-actions, tools-companies, tools-corpus,
//     tools-documents, tools-programme and tools-reports
//     (.test.mjs)
// -----------------------------------------------------------

export async function call(set, name, input) {
  const verdict = await set[name].inputSchema.validate(input);
  assert.ok(verdict.success, `${name} refused ${JSON.stringify(input)?.slice(0, 200)}: ${verdict.error?.message?.slice(0, 300)}`);
  return set[name].execute(verdict.value, { toolCallId: `call-${name}`, messages: [] });
}







// -----------------------------------------------------------
// refuses
// -----------------------------------------------------------
//
// Whether the tool's schema refuses the input: the model then
// gets INVALID_TOOL_INPUT and nothing reaches Django.
//
// Used by:
//   - tests/tools-actions, tools-companies, tools-corpus,
//     tools-documents, tools-programme and tools-reports
//     (.test.mjs)
// -----------------------------------------------------------

export async function refuses(set, name, input) {
  return !(await set[name].inputSchema.validate(input)).success;
}







// -----------------------------------------------------------
// assertAsUser
// -----------------------------------------------------------
//
// Every recorded request carried the test user's bearer and
// address, no internal secret, and no parameter at any depth
// of its query or body that names a user or an owner: the
// tenancy rule is Django's, and only the bearer speaks for
// the user. An empty request log fails too.
//
// Used by:
//   - tests/tools-actions, tools-companies, tools-corpus,
//     tools-documents, tools-programme and tools-reports
//     (.test.mjs)
//   - tests/tools.test.mjs — the every-tool sweep
// -----------------------------------------------------------

export function assertAsUser(requests) {
  assert.ok(requests.length > 0, "at least one request reached Django");
  const walk = (value, path) => {
    if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        assert.ok(!OWNER_KEYS.test(key), `${path}.${key} would name a user`);
        walk(item, `${path}.${key}`);
      }
    }
  };
  for (const request of requests) {
    const where = `${request.method} ${request.path}`;
    assert.equal(request.auth, `Bearer ${TOKEN}`, `${where}: the user's own bearer`);
    assert.equal(request.realIp, CLIENT_IP, `${where}: the end user's IP`);
    assert.equal(request.secret, null, `${where}: never the internal secret`);
    walk(request.query, `${where} query`);
    walk(request.body, `${where} body`);
  }
}
