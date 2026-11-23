// -----------------------------------------------------------
//  [*] Tests — external MCP sources (llm/mcp.js)
//
//  The real @ai-sdk/mcp client against local MCP doubles
//  (helpers/mcpServer.mjs), with the Django stub serving the
//  registry. A test imports a fresh copy of llm/mcp.js, so its
//  caches start empty; the cache tests freeze the Date clock.
//  The last two run whole chat turns through the app, which
//  holds a copy of its own.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-01 — a failed listing leaked its open client
//    ASSISTANT-LLM-02 — endless or slow pages hung the turn
//    ASSISTANT-LLM-03 — structured content was sent twice
//    ASSISTANT-LLM-04 — a name collision took a random suffix
//    ASSISTANT-LLM-05 — MCP calls were missing from the turn log
//    ASSISTANT-LLM-18 — a non-object schema failed every turn
//    ASSISTANT-LLM-22 — a broken nested schema failed every turn
//    ASSISTANT-LLM-23 — arguments reached the server unchecked
// -----------------------------------------------------------

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, mock, test } from "node:test";

import "./env.mjs";
import { z } from "zod";

import { startMcpServer, tool } from "./helpers/mcpServer.mjs";
import { startStubDjango } from "./stubDjango.mjs";


// The draft zod-to-json-schema declares on everything it writes
const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

// A schema used twice, the way zod-to-json-schema writes that
// by default: the second use is a JSON pointer to the first
const ADDRESS = {
  type: "object", properties: { street: { type: "string" }, city: { type: "string" } }, required: ["street", "city"],
  additionalProperties: false,
};
const ZOD_STYLE = {
  type: "object", properties: { home: ADDRESS, work: { $ref: "#/properties/home" }, past: { type: "array", items: { $ref: "#/properties/home" } } },
  required: ["home", "work"], additionalProperties: false, $schema: DRAFT_07,
};

// A named schema as zod-to-json-schema writes it: the root
// itself is a draft-07 "#/definitions/…" reference
const DRAFT07_NAMED = {
  $ref: "#/definitions/find_act", $schema: DRAFT_07, definitions: {
    find_act: { type: "object", properties: { celex: { $ref: "#/definitions/Celex" }, year: { type: "integer" } },
                required: ["celex"], additionalProperties: false },
    Celex: { type: "string", pattern: "^3\\d{4}[A-Z]\\d{4}$" },
  },
};

// A recursive schema, as zod-to-json-schema writes a z.lazy tree:
// the pointer names an ancestor of the $ref
const TREE = {
  type: "object", $schema: DRAFT_07, required: ["tree"], properties: {
    tree: { type: "object", required: ["label"],
            properties: { label: { type: "string" }, kids: { type: "array", items: { $ref: "#/properties/tree" } } } },
  },
};

// What GET /internal/assistant/mcp-servers answers
let registry = [];

// Whether the registry route answers the list, or a 500
let registryUp = true;

// Fresh module copies loaded so far (the query-string counter)
let loads = 0;

// The Django stub, and every MCP double to close after the file
let stub;
const doubles = [];







// -----------------------------------------------------------
// freshMcp
// -----------------------------------------------------------
//
// A new copy of llm/mcp.js with empty caches: ESM caches a
// module by its URL, so a query string makes a new one.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function freshMcp() {
  loads += 1;
  return import(`../llm/mcp.js?case=${loads}`);
}







// -----------------------------------------------------------
// server
// -----------------------------------------------------------
//
// One registry row pointing at a double, as Django's registry
// route answers it. Its default credential is the one the
// tests check never reaches a log line.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function server(name, double, { id = `id-${name}`, allowedTools = [], headers = { Authorization: "Bearer SERVER-SECRET" },
                                transport = "http" } = {}) {
  return { id, name, url: transport === "sse" ? double.sseUrl : double.url, transport, headers, allowedTools };
}







// -----------------------------------------------------------
// double
// -----------------------------------------------------------
//
// Starts an MCP double and keeps it, so after() can close it.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function double(options) {
  const started = await startMcpServer(options);
  doubles.push(started);
  return started;
}







// -----------------------------------------------------------
// within
// -----------------------------------------------------------
//
// The promise's own outcome, or a failure naming what hung
// once the given milliseconds have passed — code that never
// settles fails its test instead of hanging the suite.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function within(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}







// -----------------------------------------------------------
// rpcs
// -----------------------------------------------------------
//
// The JSON-RPC methods a double received, in order.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

function rpcs(mcp) {
  return mcp.requests.filter((r) => r.rpc).map((r) => r.rpc);
}


before(async () => {
  stub = await startStubDjango({
    "GET /internal/assistant/mcp-servers": () => (registryUp
      ? { json: { servers: registry } }
      : { status: 500, json: { error: "down", code: "SERVER_ERROR" } }),
  });
  process.env.DJANGO_URL = stub.url;
});

beforeEach(() => {
  registry = [];
  registryUp = true;
  stub.requests.length = 0;
  mock.timers.reset();
});

after(async () => {
  mock.timers.reset();
  await Promise.all(doubles.map((d) => d.close()));
  await stub.close();
});


test("toolKey folds any server and tool name into a provider-safe, namespaced function name", async () => {
  const { toolKey } = await freshMcp();
  assert.equal(toolKey("EUR-Lex search", "find_act"), "mcp_eur_lex_search_find_act");
  assert.equal(toolKey("Teisės aktai", "Paieška"), "mcp_teises_aktai_paieska", "diacritics dropped");
  assert.equal(toolKey("srv", "files/read.v2"), "mcp_srv_files_read_v2");
  assert.equal(toolKey("", ""), "mcp_server_tool");
  assert.equal(toolKey(null, undefined), "mcp_server_tool");
  assert.equal(toolKey("中文", "🙂"), "mcp_server_tool", "nothing foldable left → the placeholders");
  assert.equal(toolKey("a".repeat(40), "t"), `mcp_${"a".repeat(24)}_t`, "the server part is capped at 24");
  const long = toolKey("server", "x".repeat(100));
  assert.equal(long.length, 64);
  for (const key of [long, toolKey("EUR-Lex / ELI", "a b-c"), toolKey("ĄČĘĖĮŠŲŪŽ", "Ž")]) {
    assert.match(key, /^[A-Za-z0-9_-]{1,64}$/, key);
  }
});


test("the registry comes through the internal door; no enabled server means no MCP traffic at all", async () => {
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  assert.deepEqual(mcp.tools, {});
  await mcp.close();
  const call = stub.requests.find((r) => r.path === "/internal/assistant/mcp-servers");
  assert.equal(call.method, "GET");
  assert.equal(call.secret, "s3cret", "the shared secret rides the internal door");
  assert.equal(call.auth, null, "no user bearer on the internal door");
});


test("tools are namespaced per server, marked external, and carry the server's own input schema", async () => {
  const eurlex = await double({ tools: [tool("find_act", "Finds an act by CELEX"), tool("get-text", "x".repeat(2_000))] });
  const lb = await double({ tools: [tool("find_act", "Bank of Lithuania register")] });
  registry = [server("eurlex", eurlex), server("lb_register", lb)];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  assert.deepEqual(Object.keys(mcp.tools).sort(), ["mcp_eurlex_find_act", "mcp_eurlex_get_text", "mcp_lb_register_find_act"]);
  const findAct = mcp.tools.mcp_eurlex_find_act;
  assert.equal(findAct.description, "[External source: eurlex — not the platform's corpus] Finds an act by CELEX");
  assert.deepEqual(await findAct.inputSchema.jsonSchema, { type: "object", properties: { q: { type: "string" } } });
  const long = mcp.tools.mcp_eurlex_get_text.description;
  assert.ok(long.length <= 70 + 900, "the server's description is capped");
  assert.ok(Object.keys(mcp.tools).every((key) => key.startsWith("mcp_")), "never shadows a platform tool");
  await mcp.close();
});


test("allowedTools narrows a server to the listed tools; an empty list allows all; MAX_TOOLS caps a server", async () => {
  const narrow = await double({ tools: [tool("search"), tool("delete_everything"), tool("fetch")] });
  const wide = await double({ tools: Array.from({ length: 45 }, (_, i) => tool(`t${i}`)), pageSize: 10 });
  registry = [server("narrow", narrow, { allowedTools: ["search", "fetch", "not_offered"] }), server("wide", wide)];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  const keys = Object.keys(mcp.tools);
  assert.deepEqual(keys.filter((k) => k.startsWith("mcp_narrow_")).sort(), ["mcp_narrow_fetch", "mcp_narrow_search"]);
  assert.equal(keys.filter((k) => k.startsWith("mcp_wide_")).length, 40, "MAX_TOOLS per server");
  assert.equal(rpcs(wide).filter((m) => m === "tools/list").length, 5, "every page was followed");
  await mcp.close();
});


test("colliding keys get deterministic suffixes — the same names every turn (ASSISTANT-LLM-04, FIXED)", async () => {
  const twins = await double({ tools: [tool("find-act"), tool("find_act"), tool("find act")] });
  registry = [server("srv", twins)];
  const names = [];
  for (let turn = 0; turn < 3; turn += 1) {
    const { openMcpTools } = await freshMcp();
    const mcp = await openMcpTools();
    names.push(Object.keys(mcp.tools));
    await mcp.close();
  }
  assert.deepEqual(names[0], ["mcp_srv_find_act", "mcp_srv_find_act_2", "mcp_srv_find_act_3"]);
  assert.deepEqual(names[1], names[0]);
  assert.deepEqual(names[2], names[0]);
});


test("two servers whose names fold alike keep their order: the registry's order decides, not the network", async () => {
  const slow = await double({ tools: [tool("search")], handlers: {
    "tools/list": async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { result: { tools: [tool("search")] } };
    },
  } });
  const fast = await double({ tools: [tool("search")] });
  registry = [server("eu_regulations_database_a", slow), server("eu_regulations_database_b", fast)];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  const keys = Object.keys(mcp.tools);
  assert.equal(keys.length, 2);
  assert.match(mcp.tools[keys[0]].description, /eu_regulations_database_a/, "the first registry row gets the plain key");
  assert.match(mcp.tools[keys[1]].description, /eu_regulations_database_b/);
  assert.ok(keys[1].endsWith("_2"));
  await mcp.close();
});


test("a refused, erroring, garbage-answering or malformed server is skipped — the others still serve", async () => {
  const good = await double({ tools: [tool("search")] });
  const error500 = await double({ handlers: { "server/discover": () => ({ http: 500, body: "boom" }),
                                              initialize: () => ({ http: 500, body: "boom" }) } });
  const garbage = await double({ handlers: { initialize: () => ({ raw: "<html>not json</html>" }) } });
  const listError = await double({ handlers: { "tools/list": () => ({ error: { code: -32603, message: "listing broke" } }) } });
  const malformed = await double({ handlers: { "tools/list": () => ({ result: { tools: [{ name: 5 }] } }) } });
  registry = [
    server("good", good), server("refused", { url: "http://127.0.0.1:9/mcp" }), server("error500", error500),
    server("garbage", garbage), server("list_error", listError), server("malformed", malformed),
  ];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await within(openMcpTools(), 8_000, "openMcpTools");
    assert.deepEqual(Object.keys(mcp.tools), ["mcp_good_search"]);
    const logged = warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
    for (const name of ["refused", "error500", "garbage", "list_error", "malformed"]) {
      assert.match(logged, new RegExp(`MCP server "${name}" skipped`));
    }
    assert.ok(!logged.includes("SERVER-SECRET"), "credentials never reach a log line");
    await mcp.close();
  } finally {
    warn.mock.restore();
  }
});


test("a server whose listing fails still has its connection closed (ASSISTANT-LLM-01, FIXED)", async () => {
  const listError = await double({ handlers: { "tools/list": () => ({ error: { code: -32603, message: "listing broke" } }) } });
  registry = [server("list_error", listError)];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await openMcpTools();
    assert.deepEqual(mcp.tools, {});
    assert.ok(await listError.waitFor(() => listError.closedSessions.length > 0, 2_000),
              "the session opened for the listing is ended (DELETE)");
  } finally {
    warn.mock.restore();
  }
});


test("endless pagination cannot hang the turn: the listing is bounded (ASSISTANT-LLM-02, FIXED)", async () => {
  const endless = await double({ handlers: { "tools/list": () => ({ result: { tools: [], nextCursor: "again" } }) } });
  const good = await double({ tools: [tool("search")] });
  registry = [server("endless", endless), server("good", good)];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await within(openMcpTools(), 5_000, "openMcpTools with an endlessly paging server");
    assert.ok(mcp.tools.mcp_good_search, "the healthy server still serves");
    assert.ok(rpcs(endless).filter((m) => m === "tools/list").length <= 50, "a page cap, not an endless loop");
    await mcp.close();
  } finally {
    warn.mock.restore();
  }
});


test("a tool whose input schema is no object schema is left out; a typeless one reads as an object (ASSISTANT-LLM-18, FIXED)", async () => {
  const odd = await double({ tools: [
    tool("good"), { name: "stringy", description: "x", inputSchema: { type: "string" } },
    { name: "arrayish", description: "x", inputSchema: { type: ["object", "null"] } },
    { name: "typeless", description: "x", inputSchema: { properties: { q: { type: "string" } } } },
  ] });
  registry = [server("odd", odd)];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await openMcpTools();
    assert.deepEqual(Object.keys(mcp.tools), ["mcp_odd_good", "mcp_odd_typeless"], "one bad tool must not make the provider refuse every turn");
    assert.deepEqual(await mcp.tools.mcp_odd_typeless.inputSchema.jsonSchema, { type: "object", properties: { q: { type: "string" } } });
    const logged = warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
    assert.match(logged, /MCP tool "stringy" of "odd" skipped/);
    assert.match(logged, /MCP tool "arrayish" of "odd" skipped/);
    await mcp.close();
  } finally {
    warn.mock.restore();
  }
});


test("a tool whose schema zod cannot compile — however deep the fault — is withheld, warned and recorded; sound nested schemas stay (ASSISTANT-LLM-22, FIXED 2026-09-28)", async () => {
  const broken = {
    nested_type: { type: "object", properties: { q: { type: "strng" } } },
    nested_not_schema: { type: "object", properties: { q: 5 } },
    array_items: { type: "object", properties: { list: { type: "array", items: "string" } } },
    bad_pattern: { type: "object", properties: { q: { type: "string", pattern: "([" } } },
    dangling_ref: { type: "object", properties: { q: { $ref: "#/$defs/Missing" } } },
    remote_ref: { type: "object", properties: { q: { $ref: "https://schemas.example/q.json" } } },
  };
  const sound = {
    defs_ref: { type: "object", properties: { act: { $ref: "#/$defs/Act" } },
                $defs: { Act: { type: "object", properties: { celex: { type: "string" } }, required: ["celex"] } } },
    nullable: { type: "object", properties: { year: { anyOf: [{ type: "integer" }, { type: "null" }] },
                                              kind: { type: ["string", "null"], enum: ["reg", "dir", null] } } },
    pydantic: { type: "object", title: "find_actArguments", required: ["query"],
                properties: { query: { title: "Query", type: "string" }, limit: { title: "Limit", type: "integer", default: 10 } } },
  };
  const odd = await double({ tools: [
    tool("good"), { name: "stringy", description: "x", inputSchema: { type: "string" } },
    ...Object.entries({ ...broken, ...sound }).map(([name, inputSchema]) => ({ name, description: name, inputSchema })),
  ] });
  registry = [server("odd", odd)];
  const recorded = [];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await openMcpTools({ record: (entry) => recorded.push(entry) });
    assert.deepEqual(Object.keys(mcp.tools), ["mcp_odd_good", "mcp_odd_defs_ref", "mcp_odd_nullable", "mcp_odd_pydantic"],
                     "one server's broken schema must not make the provider refuse every turn");
    assert.deepEqual(recorded, ["stringy", ...Object.keys(broken)].map((name) => ({
      name: `mcp_odd_${name}`, ms: 0, ok: false, code: "MCP_SCHEMA_INVALID",
    })), "the turn log's tool list says what was withheld");
    const logged = warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
    assert.match(logged, /MCP tool "nested_type" of "odd" skipped: its input schema cannot be read: Unsupported type: strng/);
    assert.match(logged, /MCP tool "dangling_ref" of "odd" skipped: its input schema cannot be read: .*#\/\$defs\/Missing/);
    assert.match(logged, /MCP tool "stringy" of "odd" skipped: its input schema is not an object/);
    assert.ok(!logged.includes("SERVER-SECRET"));
    assert.deepEqual(await mcp.tools.mcp_odd_pydantic.inputSchema.jsonSchema, sound.pydantic,
                     "a sound schema without references is offered as the server wrote it");
    // Offered with its reference resolved by inlineLocalRefs,
    // not as the server wrote it
    assert.deepEqual(await mcp.tools.mcp_odd_defs_ref.inputSchema.jsonSchema, {
      type: "object", properties: { act: sound.defs_ref.$defs.Act },
    });
    await mcp.close();
  } finally {
    warn.mock.restore();
  }
});


test("a call's arguments are checked against the server's schema first: invalid ones are INVALID_TOOL_INPUT for the model and never reach the server (ASSISTANT-LLM-23, FIXED 2026-09-28)", async () => {
  const strict = { name: "find_act", description: "Finds an act", inputSchema: {
    type: "object", required: ["query"], additionalProperties: false,
    properties: { query: { type: "string", minLength: 1 }, year: { type: "integer" }, kind: { enum: ["regulation", "directive"] },
                  filters: { type: "object", properties: { lang: { type: "string" } } } },
  } };
  const open = { name: "search", description: "An open schema", inputSchema: { type: "object", properties: { q: { type: "string" } } } };
  const mcpServer = await double({ tools: [strict, open] });
  registry = [server("eurlex", mcpServer)];
  const calls = [];
  const { openMcpTools } = await freshMcp();
  const { streamErrorText } = await import("../llm/stream.js");
  const mcp = await openMcpTools({ record: (call) => calls.push(call) });
  const findAct = (args) => mcp.tools.mcp_eurlex_find_act.execute(args, { toolCallId: "c", messages: [] });
  try {
    const refusals = [
      [{}, /query: Invalid input: expected string/],
      [null, /query: Invalid input: expected string/],
      [{ query: 42 }, /query: Invalid input: expected string, received number/],
      [{ query: "MiCA", year: "2023" }, /year: /],
      [{ query: "MiCA", kind: "decision" }, /kind: Invalid option/],
      [{ query: "MiCA", filters: { lang: 5 } }, /filters\.lang: /],
      [{ query: "MiCA", extra: true }, /\(the arguments\): Unrecognized key: "extra"/],
      ["just a string", /\(the arguments\): Invalid input: expected object/],
    ];
    for (const [args, reason] of refusals) {
      await assert.rejects(findAct(args), (err) => {
        assert.deepEqual([err.name, err.code], ["ToolFailure", "INVALID_TOOL_INPUT"]);
        assert.match(err.message, /^\[INVALID_TOOL_INPUT\] mcp_eurlex_find_act failed: the arguments do not match the tool's input schema — /);
        assert.match(err.message, reason);
        assert.equal(streamErrorText(err), err.message, "the model reads it verbatim");
        return true;
      }, JSON.stringify(args));
    }
    assert.equal(rpcs(mcpServer).filter((m) => m === "tools/call").length, 0, "no invalid call reached the server");
    assert.deepEqual(calls.map((c) => [c.name, c.ok, c.code]), Array(refusals.length).fill(["mcp_eurlex_find_act", false, "INVALID_TOOL_INPUT"]));

    const valid = { query: "MiCA", year: 2023, kind: "regulation", filters: { lang: "lt", extra: 1 } };
    assert.deepEqual(JSON.parse((await findAct(valid)).text), valid, "the double echoes what it was sent");
    await mcp.tools.mcp_eurlex_search.execute({ q: "x", anything: [1] }, { toolCallId: "d", messages: [] });
    assert.deepEqual(mcpServer.requests.filter((r) => r.rpc === "tools/call").map((r) => r.params), [
      { name: "find_act", arguments: valid }, { name: "search", arguments: { q: "x", anything: [1] } },
    ], "valid calls go out exactly as the model wrote them; an open schema lets extra keys through, as JSON Schema does");
  } finally {
    await mcp.close();
  }
});


test("inlineLocalRefs resolves every local reference form — \"#/properties/…\", \"#/definitions/…\", \"#/$defs/…\", any pointer — by inlining (ASSISTANT-LLM-22, the $ref pre-pass)", async () => {
  const { inlineLocalRefs } = await freshMcp();
  const inputs = [];
  const run = (schema) => {
    inputs.push([schema, structuredClone(schema)]);
    return inlineLocalRefs(schema);
  };

  assert.deepEqual(run(ZOD_STYLE), { ...ZOD_STYLE, properties: { home: ADDRESS, work: ADDRESS, past: { type: "array", items: ADDRESS } } },
                   "zod-to-json-schema's reuse, inlined where it stood");
  assert.deepEqual(run(DRAFT07_NAMED), {
    type: "object", properties: { celex: DRAFT07_NAMED.definitions.Celex, year: { type: "integer" } }, required: ["celex"],
    additionalProperties: false, $schema: DRAFT_07,
  }, "a named root: its own $ref inlined, its $schema kept, the definitions gone");
  assert.deepEqual(run({ type: "object", properties: { a: { $ref: "#/definitions/A" } }, definitions: { A: ADDRESS } }),
                   { type: "object", properties: { a: ADDRESS } }, "draft-07 definitions without the $schema zod would need to read them");
  assert.deepEqual(run({ type: "object", properties: { addr: { $ref: "#/$defs/Address", description: "Kur", default: null } }, $defs: { Address: ADDRESS } }),
                   { type: "object", properties: { addr: { ...ADDRESS, description: "Kur", default: null } } },
                   "Pydantic's $ref with annotations: laid over the target");
  assert.deepEqual(run({ type: "object", properties: { s: { $ref: "#/$defs/A/properties/street" } }, $defs: { A: ADDRESS } }),
                   { type: "object", properties: { s: { type: "string" } } },
                   "a pointer INTO a definition names that subschema (zod alone takes the whole definition)");
  assert.deepEqual(run({ type: "object", properties: {
    "a/b": { type: "string" }, "c~d": { type: "integer" }, "e f": { type: "boolean" },
    x: { $ref: "#/properties/a~1b" }, y: { $ref: "#/properties/c~0d" }, w: { $ref: "#/properties/e%20f" },
  } }).properties, {
    "a/b": { type: "string" }, "c~d": { type: "integer" }, "e f": { type: "boolean" }, x: { type: "string" }, y: { type: "integer" }, w: { type: "boolean" },
  }, "RFC 6901 escapes and a percent-encoded fragment");
  assert.deepEqual(run({ type: "object", properties: { code: { $ref: "#/$defs/Code", maxLength: 3, description: "d" } }, $defs: { Code: { type: "string" } } })
    .properties.code, { allOf: [{ type: "string" }, { type: "string", maxLength: 3 }], description: "d" },
  "a constraining sibling joins the target under allOf, the target's type lent so zod checks it");

  const data = { type: "object", properties: {
    a: { enum: [{ $ref: "#/nowhere" }, 1] }, b: { const: { $ref: "#" } },
    c: { type: "object", default: { $ref: "#/nowhere" }, examples: [{ $ref: "#/nowhere" }] }, d: { $ref: "#/properties/c" },
  } };
  const resolved = run(data);
  assert.deepEqual(resolved.properties.d, data.properties.c, "a $ref under default or examples is data, never followed");
  assert.deepEqual([resolved.properties.a, resolved.properties.b], [data.properties.a, data.properties.b], "nor under enum or const");

  const plain = { type: "object", properties: { q: { type: "string" } }, definitions: { Unused: { type: "strng" } } };
  assert.equal(run(plain), plain, "nothing to resolve: the very schema the server wrote");
  const remote = { type: "object", properties: { q: { $ref: "https://schemas.example/q.json" } } };
  assert.equal(run(remote), remote, "another document's $ref is left for zod to refuse");
  assert.throws(() => run({ type: "object", properties: { q: { $ref: "#/definitions/Missing" } } }), /^Error: Reference not found: #\/definitions\/Missing$/);
  assert.throws(() => run({ type: "object", required: ["q"], properties: { q: { $ref: "#/required" } } }), /Reference not found: #\/required/,
                "a pointer to something that is no schema");
  for (const [input, before] of inputs) assert.deepEqual(input, before, "a definition — cached across turns — is never mutated");
});


test("inlineLocalRefs keeps a recursive reference once, in the container zod reads — and every reference so when inlining would blow up (ASSISTANT-LLM-22, the $ref pre-pass)", async () => {
  const { inlineLocalRefs } = await freshMcp();
  const checks = (schema, good, bad) => {
    const validator = z.fromJSONSchema(schema);
    assert.equal(validator.safeParse(good).success, true, JSON.stringify(good));
    assert.equal(validator.safeParse(bad).success, false, JSON.stringify(bad));
  };

  const root = { type: "object", required: ["n"], properties: { n: { type: "string" }, kids: { type: "array", items: { $ref: "#" } } } };
  assert.equal(inlineLocalRefs(root), root, "\"#\" stays: zod reads it");
  checks(root, { n: "a", kids: [{ n: "b", kids: [{ n: "c" }] }] }, { n: "a", kids: [{ n: "b", kids: [{ n: 3 }] }] });

  const node = { type: "object", required: ["label"],
                 properties: { label: { type: "string" }, kids: { type: "array", items: { $ref: "#/definitions/tree" } } } };
  const tree = inlineLocalRefs(TREE);
  assert.deepEqual(tree, { ...TREE, properties: { tree: node }, definitions: { tree: node } },
                   "a z.lazy tree: inlined once, then kept once under definitions — what zod reads beside a draft-07 $schema");
  checks(tree, { tree: { label: "a", kids: [{ label: "b", kids: [{ label: "c" }] }] } },
         { tree: { label: "a", kids: [{ label: "b", kids: [{ label: 5 }] }] } });
  const { $schema: _dialect, ...undeclared } = TREE;
  assert.deepEqual(Object.keys(inlineLocalRefs(undeclared).$defs), ["tree"], "and under $defs without one");

  const listed = inlineLocalRefs({ type: "object", required: ["head"], properties: { head: { $ref: "#/definitions/Node" } }, definitions: {
    Node: { type: "object", required: ["v"], properties: { v: { type: "number" }, next: { anyOf: [{ $ref: "#/definitions/Node" }, { type: "null" }] } } },
  } });
  assert.deepEqual(listed.properties.head.properties.next, { anyOf: [{ $ref: "#/$defs/Node" }, { type: "null" }] });
  checks(listed, { head: { v: 1, next: { v: 2, next: null } } }, { head: { v: 1, next: { v: "x", next: null } } });

  const mutual = inlineLocalRefs({ type: "object", properties: { a: { $ref: "#/$defs/A" } }, $defs: {
    A: { type: "object", properties: { b: { $ref: "#/$defs/B" } } },
    B: { type: "object", properties: { a: { $ref: "#/$defs/A" }, x: { type: "integer" } } },
  } });
  assert.deepEqual(Object.keys(mutual.$defs), ["A"], "A ↔ B: the cycle closes on A; B is inlined");
  checks(mutual, { a: { b: { a: { b: { x: 1 } } } } }, { a: { b: { a: { b: { x: "no" } } } } });

  // 25 levels, each using the next twice: 2^24 copies once
  // inlined — every referenced schema is kept once instead
  const definitions = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`D${i}`, {
    type: "object", properties: { l: { $ref: `#/definitions/D${i + 1}` }, r: { $ref: `#/definitions/D${i + 1}` } },
  }]));
  definitions.D24 = { type: "string" };
  const web = inlineLocalRefs({ type: "object", properties: { root: { $ref: "#/definitions/D0" } }, definitions });
  assert.deepEqual(Object.keys(web.$defs), Array.from({ length: 25 }, (_, i) => `D${i}`));
  assert.ok(JSON.stringify(web).length < 5_000, "a compact schema, not 2^24 copies");
  checks(web, { root: { l: { r: { l: {} } } } }, { root: { l: { r: 5 } } });
});


test("zod-to-json-schema and draft-07 tools are offered resolved and their calls checked; a recursive one checks at depth; the broken are still withheld (ASSISTANT-LLM-22, the $ref pre-pass)", async () => {
  const refs = await double({ tools: [
    { name: "zod_style", description: "x", inputSchema: ZOD_STYLE },
    { name: "draft07_named", description: "x", inputSchema: DRAFT07_NAMED },
    { name: "tree", description: "x", inputSchema: TREE },
    { name: "dangling", description: "x", inputSchema: { type: "object", properties: { q: { $ref: "#/definitions/Missing" } } } },
    { name: "bad_target", description: "x",
      inputSchema: { type: "object", properties: { q: { $ref: "#/definitions/Bad" } }, definitions: { Bad: { type: "strng" } } } },
    { name: "self_only", description: "x", inputSchema: { $ref: "#" } },
  ] });
  registry = [server("refs", refs)];
  const recorded = [];
  const warn = mock.method(console, "warn", () => {});
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools({ record: (entry) => recorded.push(entry) });
  try {
    assert.deepEqual(Object.keys(mcp.tools), ["mcp_refs_zod_style", "mcp_refs_draft07_named", "mcp_refs_tree"]);
    assert.deepEqual(recorded.map((entry) => [entry.name, entry.code]), [
      ["mcp_refs_dangling", "MCP_SCHEMA_INVALID"], ["mcp_refs_bad_target", "MCP_SCHEMA_INVALID"], ["mcp_refs_self_only", "MCP_SCHEMA_INVALID"],
    ]);
    const logged = warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
    assert.match(logged, /"dangling" of "refs" skipped: its input schema cannot be read: Reference not found: #\/definitions\/Missing/);
    assert.match(logged, /"bad_target" of "refs" skipped: its input schema cannot be read: Unsupported type: strng/);
    assert.match(logged, /"self_only" of "refs" skipped: its input schema cannot be read: Maximum call stack size exceeded/,
                 "a schema that is only a reference to itself");

    const offered = JSON.stringify(await Promise.all(Object.values(mcp.tools).map((t) => t.inputSchema.jsonSchema)));
    assert.deepEqual([...new Set(offered.match(/"\$ref":"[^"]*"/g))], ['"$ref":"#/definitions/tree"'],
                     "the provider is sent resolved schemas: only the recursion keeps a reference");

    const call = (name, args) => mcp.tools[`mcp_refs_${name}`].execute(args, { toolCallId: name, messages: [] });
    const refused = [
      ["zod_style", { home: { street: "a", city: "b" }, work: { street: "c" } }, /work\.city: /],
      ["zod_style", { home: { street: "a", city: "b" }, work: { street: "c", city: "d" }, past: [{ street: 1, city: "x" }] }, /past\.0\.street: /],
      ["draft07_named", { celex: "MiCA" }, /celex: /],
      ["draft07_named", { celex: "32023R1114", extra: 1 }, /Unrecognized key: "extra"/],
      ["tree", { tree: { label: "a", kids: [{ label: "b", kids: [{ label: 5 }] }] } }, /tree\.kids\.0\.kids\.0\.label: /],
    ];
    for (const [name, args, reason] of refused) {
      await assert.rejects(call(name, args), (err) => err.code === "INVALID_TOOL_INPUT" && reason.test(err.message),
                           `${name} ${JSON.stringify(args)}`);
    }
    assert.equal(rpcs(refs).filter((m) => m === "tools/call").length, 0, "no refused call reached the server");

    const accepted = [
      ["zod_style", { home: { street: "a", city: "b" }, work: { street: "c", city: "d" }, past: [{ street: "e", city: "f" }] }],
      ["draft07_named", { celex: "32023R1114", year: 2023 }],
      ["tree", { tree: { label: "a", kids: [{ label: "b", kids: [{ label: "c", kids: [] }] }] } }],
    ];
    for (const [name, args] of accepted) assert.deepEqual(JSON.parse((await call(name, args)).text), args, `${name}: sent as written`);
    assert.deepEqual(refs.requests.filter((r) => r.rpc === "tools/call").map((r) => r.params.name), ["zod_style", "draft07_named", "tree"]);
  } finally {
    warn.mock.restore();
    await mcp.close();
  }
});


test("a listing's schemas are resolved and compiled once while it is cached, not every turn", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-28T10:00:00Z") });
  const mcpServer = await double({ tools: [{ name: "zod_style", description: "x", inputSchema: ZOD_STYLE }] });
  registry = [server("srv", mcpServer)];
  const { openMcpTools } = await freshMcp();
  const offered = async () => {
    const mcp = await openMcpTools();
    const schema = await mcp.tools.mcp_srv_zod_style.inputSchema.jsonSchema;
    await mcp.close();
    return schema;
  };
  const first = await offered();
  assert.equal(await offered(), first, "the next turn offers the very schema the first one prepared");
  mock.timers.tick(61_000);
  const relisted = await offered();
  assert.notEqual(relisted, first, "a new listing is prepared anew");
  assert.deepEqual(relisted, first);
});


test("a server that never answers is skipped after the connect budget; the chat is not held longer", { timeout: 30_000 }, async () => {
  const silent = await double({ hangAll: true });
  const stalls = await double({ handlers: { "tools/list": () => ({ hang: true }) } });
  const good = await double({ tools: [tool("search")] });
  registry = [server("silent", silent), server("stalls", stalls), server("good", good)];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const started = performance.now();
    const mcp = await within(openMcpTools(), 15_000, "openMcpTools with silent servers");
    const elapsed = performance.now() - started;
    assert.deepEqual(Object.keys(mcp.tools), ["mcp_good_search"]);
    assert.ok(elapsed < 10_000, `bounded by CONNECT_TIMEOUT_MS for connect AND listing (took ${Math.round(elapsed)} ms)`);
    await mcp.close();
  } finally {
    warn.mock.restore();
  }
});


test("the server's headers ride every request of both transports and of the modern protocol", async () => {
  const http1 = await double({ tools: [tool("search")] });
  const sse = await double({ tools: [tool("search")] });
  const modern = await double({ tools: [tool("search")], modern: true });
  const headers = { Authorization: "Bearer SERVER-SECRET", "X-Api-Key": "k-1" };
  registry = [server("h", http1, { headers }), server("s", sse, { headers, transport: "sse" }), server("m", modern, { headers })];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  for (const key of ["mcp_h_search", "mcp_s_search", "mcp_m_search"]) {
    await mcp.tools[key].execute({ q: "MiCA" }, { toolCallId: "c", messages: [] });
  }
  await mcp.close();
  for (const double of [http1, sse, modern]) {
    assert.ok(double.requests.length >= 3);
    for (const request of double.requests) {
      assert.equal(request.headers.authorization, "Bearer SERVER-SECRET", `${request.http} ${request.rpc}`);
      assert.equal(request.headers["x-api-key"], "k-1");
    }
    assert.ok(rpcs(double).includes("tools/call"));
  }
});


test("a redirecting server is refused, never followed to another host", async () => {
  const target = await double({ tools: [tool("search")] });
  const bouncer = http.createServer((req, res) => {
    req.resume();
    res.writeHead(307, { Location: target.url }).end();
  });
  await new Promise((resolve) => bouncer.listen(0, "127.0.0.1", resolve));
  registry = [{ id: "b", name: "bouncer", url: `http://127.0.0.1:${bouncer.address().port}/mcp`, transport: "http", headers: {}, allowedTools: [] }];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await openMcpTools();
    assert.deepEqual(mcp.tools, {});
    assert.equal(target.requests.length, 0, "the redirect target was never contacted");
  } finally {
    warn.mock.restore();
    await new Promise((resolve) => bouncer.close(resolve));
  }
});


test("the registry is cached 60 s; after that it is fetched again", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-27T10:00:00Z") });
  const { openMcpTools } = await freshMcp();
  const fetches = () => stub.requests.filter((r) => r.path === "/internal/assistant/mcp-servers").length;
  await (await openMcpTools()).close();
  await (await openMcpTools()).close();
  assert.equal(fetches(), 1, "cached");
  mock.timers.tick(60_001);
  await (await openMcpTools()).close();
  assert.equal(fetches(), 2, "refreshed after 60 s");
});


test("a failed registry fetch keeps the last list and is retried after 10 s, not on every turn", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-27T10:00:00Z") });
  const good = await double({ tools: [tool("search")] });
  registry = [server("good", good)];
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const fetches = () => stub.requests.filter((r) => r.path === "/internal/assistant/mcp-servers").length;
    await (await openMcpTools()).close();
    registryUp = false;
    mock.timers.tick(61_000);
    const kept = await openMcpTools();
    assert.ok(kept.tools.mcp_good_search, "the previous list is kept");
    await kept.close();
    assert.equal(fetches(), 2);
    mock.timers.tick(5_000);
    await (await openMcpTools()).close();
    assert.equal(fetches(), 2, "no retry storm within 10 s");
    registryUp = true;
    mock.timers.tick(5_001);
    await (await openMcpTools()).close();
    assert.equal(fetches(), 3, "retried after 10 s");
  } finally {
    warn.mock.restore();
  }
});


test("a registry that fails on a cold start means no external tools, not a failed turn", async () => {
  registryUp = false;
  const warn = mock.method(console, "warn", () => {});
  try {
    const { openMcpTools } = await freshMcp();
    const mcp = await openMcpTools();
    assert.deepEqual(mcp.tools, {});
    assert.match(warn.mock.calls[0].arguments.join(" "), /MCP registry unavailable/);
  } finally {
    warn.mock.restore();
  }
});


test("tool definitions are cached 60 s per server: a cached turn connects only when a tool is called", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-27T10:00:00Z") });
  const mcpServer = await double({ tools: [tool("search"), tool("fetch")] });
  registry = [server("srv", mcpServer)];
  const { openMcpTools } = await freshMcp();

  await (await openMcpTools()).close();
  assert.equal(rpcs(mcpServer).filter((m) => m === "tools/list").length, 1);

  mcpServer.requests.length = 0;
  mock.timers.tick(30_000);
  const cached = await openMcpTools();
  assert.equal(mcpServer.requests.length, 0, "a cached turn opens no connection");
  await cached.tools.mcp_srv_search.execute({ q: "a" }, { toolCallId: "1", messages: [] });
  await cached.tools.mcp_srv_fetch.execute({ q: "b" }, { toolCallId: "2", messages: [] });
  assert.equal(rpcs(mcpServer).filter((m) => m === "initialize").length, 1, "one connection per server per turn");
  assert.equal(rpcs(mcpServer).filter((m) => m === "tools/call").length, 2);
  assert.equal(rpcs(mcpServer).filter((m) => m === "tools/list").length, 0);
  await cached.close();
  assert.ok(await mcpServer.waitFor(() => mcpServer.closedSessions.length >= 2), "close() ends the turn's connection");

  mcpServer.requests.length = 0;
  mock.timers.tick(31_000);
  await (await openMcpTools()).close();
  assert.equal(rpcs(mcpServer).filter((m) => m === "tools/list").length, 1, "listed again after 60 s");
});


test("the listing's connection is reused by the turn's calls and closed by close()", async () => {
  const mcpServer = await double({ tools: [tool("search")] });
  registry = [server("srv", mcpServer)];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  await mcp.tools.mcp_srv_search.execute({ q: "x" }, { toolCallId: "1", messages: [] });
  assert.equal(rpcs(mcpServer).filter((m) => m === "initialize").length, 1);
  assert.equal(mcpServer.closedSessions.length, 0);
  await mcp.close();
  assert.ok(await mcpServer.waitFor(() => mcpServer.closedSessions.length === 1));
  await mcp.close();
});


test("a call answers { source, text }: text contents, other content named, structured content once (ASSISTANT-LLM-03, FIXED)", async () => {
  const results = {
    text: { content: [{ type: "text", text: "Art. 59" }, { type: "text", text: "MiCA" }] },
    mixed: { content: [{ type: "text", text: "See image" }, { type: "image", data: "aGk=", mimeType: "image/png" }] },
    structuredOnly: { structuredContent: { act: "MiCA", article: 59 } },
    both: { content: [{ type: "text", text: '{\n  "act": "MiCA"\n}' }], structuredContent: { act: "MiCA" } },
    summaryAndData: { content: [{ type: "text", text: "Found 1 act" }], structuredContent: { act: "MiCA" } },
    huge: { content: [{ type: "text", text: "x".repeat(25_000) }] },
  };
  const mcpServer = await double({ tools: [tool("run")], call: (_name, args) => results[args.q] });
  registry = [server("srv", mcpServer)];
  const calls = [];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools({ record: (c) => calls.push(c) });
  const run = (q) => mcp.tools.mcp_srv_run.execute({ q }, { toolCallId: q, messages: [] });

  assert.deepEqual(await run("text"), { source: "srv", text: "Art. 59\nMiCA" });
  assert.equal((await run("mixed")).text, "See image\n[image content omitted]");
  assert.equal((await run("structuredOnly")).text, '{"act":"MiCA","article":59}', "not twice");
  assert.equal((await run("both")).text, '{\n  "act": "MiCA"\n}', "the text block already carries the JSON");
  assert.equal((await run("summaryAndData")).text, 'Found 1 act\n{"act":"MiCA"}', "different data is kept");
  const huge = (await run("huge")).text;
  assert.equal(huge.length, 20_000 + " …[truncated]".length);
  assert.ok(huge.endsWith(" …[truncated]"));
  assert.deepEqual(calls.map((c) => [c.name, c.ok]), Array(6).fill(["mcp_srv_run", true]));
  assert.ok(calls.every((c) => Number.isFinite(c.ms) && c.ms >= 0));
  await mcp.close();
});


test("tool call failures reach the model as MCP_TOOL_ERROR / MCP_UNREACHABLE, never as a crash", async () => {
  const mcpServer = await double({ tools: [tool("run")], call: (_name, args) => {
    if (args.q === "tool-error") return { isError: true, content: [{ type: "text", text: "act not found" }] };
    if (args.q === "empty-error") return { isError: true, content: [] };
    throw new Error("internal server detail");
  } });
  registry = [server("srv", mcpServer)];
  const calls = [];
  const { openMcpTools } = await freshMcp();
  const { streamErrorText } = await import("../llm/stream.js");
  const mcp = await openMcpTools({ record: (c) => calls.push(c) });
  const run = (q) => mcp.tools.mcp_srv_run.execute({ q }, { toolCallId: q, messages: [] });
  const warn = mock.method(console, "warn", () => {});
  try {
    await assert.rejects(run("tool-error"), (err) => err.name === "ToolFailure" && err.code === "MCP_TOOL_ERROR"
      && err.message === "[MCP_TOOL_ERROR] mcp_srv_run failed: act not found");
    await assert.rejects(run("empty-error"), (err) => err.message.endsWith("the external tool reported an error"));
    await assert.rejects(run("rpc-error"), (err) => {
      assert.equal(err.message, "[MCP_UNREACHABLE] mcp_srv_run failed: the external source did not answer");
      assert.equal(streamErrorText(err), err.message, "the stream passes the tool failure through verbatim");
      return true;
    });
    assert.ok(!JSON.stringify(calls).includes("internal server detail"));
    assert.deepEqual(calls.map((c) => [c.ok, c.code]), [[false, "MCP_TOOL_ERROR"], [false, "MCP_TOOL_ERROR"], [false, "MCP_UNREACHABLE"]]);
  } finally {
    warn.mock.restore();
    await mcp.close();
  }
});


test("a server that went down after its tools were cached fails the call, not the turn", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-27T10:00:00Z") });
  const mcpServer = await startMcpServer({ tools: [tool("search")] });
  registry = [server("srv", mcpServer)];
  const { openMcpTools } = await freshMcp();
  await (await openMcpTools()).close();
  await mcpServer.close();
  const mcp = await openMcpTools();
  assert.ok(mcp.tools.mcp_srv_search, "offered from the cache");
  const warn = mock.method(console, "warn", () => {});
  try {
    await assert.rejects(mcp.tools.mcp_srv_search.execute({ q: "x" }, { toolCallId: "1", messages: [] }),
                         (err) => err.code === "MCP_UNREACHABLE");
    assert.match(warn.mock.calls.at(-1).arguments.join(" "), /MCP call mcp_srv_search failed/);
  } finally {
    warn.mock.restore();
    await mcp.close();
  }
});


test("a stopped turn aborts a slow external call at once", async () => {
  const mcpServer = await double({ tools: [tool("slow")], handlers: { "tools/call": () => ({ hang: true }) } });
  registry = [server("srv", mcpServer)];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  const controller = new AbortController();
  const warn = mock.method(console, "warn", () => {});
  try {
    const pending = mcp.tools.mcp_srv_slow.execute({ q: "x" }, { toolCallId: "1", messages: [], abortSignal: controller.signal });
    setTimeout(() => controller.abort(new Error("Turn user")), 100);
    await assert.rejects(within(pending, 3_000, "the aborted call"), (err) => err.code === "MCP_UNREACHABLE");
  } finally {
    warn.mock.restore();
    await mcp.close();
  }
});


test("the sse transport lists, calls and is closed like the http one", async () => {
  const mcpServer = await double({ tools: [tool("search")], call: () => ({ content: [{ type: "text", text: "over sse" }] }) });
  registry = [server("sse_srv", mcpServer, { transport: "sse" })];
  const { openMcpTools } = await freshMcp();
  const mcp = await openMcpTools();
  assert.equal((await mcp.tools.mcp_sse_srv_search.execute({ q: "x" }, { toolCallId: "1", messages: [] })).text, "over sse");
  assert.equal(mcpServer.openStreams(), 1);
  await mcp.close();
  assert.ok(await mcpServer.waitFor(() => mcpServer.openStreams() === 0), "the event stream is closed with the turn");
});


test("listServerTools (the admin test door) follows every page and always closes its client", async () => {
  const mcpServer = await double({ tools: Array.from({ length: 7 }, (_, i) => tool(`t${i}`)), pageSize: 3 });
  const { listServerTools } = await freshMcp();
  const listed = await listServerTools({ url: mcpServer.url, transport: "http", headers: { "X-Api-Key": "k" } }, 5_000);
  assert.deepEqual(listed.map((t) => t.name), ["t0", "t1", "t2", "t3", "t4", "t5", "t6"]);
  assert.ok(await mcpServer.waitFor(() => mcpServer.closedSessions.length === 1), "the client is closed");
  await assert.rejects(listServerTools({ url: "http://127.0.0.1:9/mcp", transport: "http" }, 2_000));

  const broken = await double({ handlers: { "tools/list": () => ({ error: { code: -32603, message: "broke" } }) } });
  await assert.rejects(listServerTools({ url: broken.url, transport: "http" }, 2_000), /broke/);
  assert.ok(await broken.waitFor(() => broken.closedSessions.length === 1), "closed on failure too");
});


test("listServerTools keeps connect + listing inside ONE budget (the admin door answers before Django gives up)", async () => {
  const slowPages = await double({
    tools: Array.from({ length: 4 }, (_, i) => tool(`t${i}`)), pageSize: 1,
    handlers: { "tools/list": async (params) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const start = Number(params.cursor || 0);
      return { result: { tools: [tool(`t${start}`)], ...(start < 3 ? { nextCursor: String(start + 1) } : {}) } };
    } },
  });
  const { listServerTools } = await freshMcp();
  const started = performance.now();
  await assert.rejects(within(listServerTools({ url: slowPages.url, transport: "http" }, 1_000), 5_000, "listServerTools"));
  assert.ok(performance.now() - started < 1_800, "4 pages × 400 ms do not fit a 1 s budget — the listing gives up in time");
});


test("the chat turn's MCP calls reach the turn log (ASSISTANT-LLM-05, FIXED in routes/chat.js)", async () => {
  const { setModelForTests } = await import("../llm/provider.js");
  const { scripted, textStream, toolCallStream } = await import("./mockModel.mjs");
  const { createApp } = await import("../app.js");
  const thread = "0b6f8e8c-1c2d-4e5f-8a9b-0c1d2e3f4a5c";
  const mcpServer = await double({ tools: [tool("search")] });
  registry = [server("eurlex", mcpServer)];
  Object.assign(stub.routes, {
    "GET /api/auth/me": () => ({ json: { id: "u1", displayName: "Tomas", role: "user" } }),
    "GET /internal/assistant/prompt": () => ({ json: { id: "pv1", model: null, text: "Prompt {COMPANY_CONTEXT}" } }),
    "GET /internal/assistant/budget": () => ({ json: { remaining: 9 } }),
    [`GET /api/chat/threads/${thread}`]: () => ({ json: { id: thread, companyId: null } }),
    [`POST /api/chat/threads/${thread}/messages`]: () => ({ json: { ok: true } }),
    [`POST /internal/assistant/threads/${thread}/messages`]: () => ({ status: 201, json: { ok: true } }),
    "POST /internal/assistant/turn-log": () => ({ status: 201, json: { id: "log" } }),
  });
  setModelForTests({ language: scripted([toolCallStream("mcp_eurlex_search", { q: "MiCA" }), textStream("Radau.")]) });
  const app = createApp().listen(0);
  await new Promise((resolve) => app.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/api/assistant/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ id: thread, parentId: null, locale: "lt",
                             message: { id: "u-1", role: "user", parts: [{ type: "text", text: "Rask MiCA" }] } }),
    });
    await response.text();
    assert.ok(rpcs(mcpServer).includes("tools/call"), "the model's call reached the MCP server");
    const log = await stub.waitFor((r) => r.path === "/internal/assistant/turn-log");
    assert.deepEqual(log.body.tool_calls.map((c) => c.name), ["mcp_eurlex_search"]);
  } finally {
    setModelForTests({});
    await new Promise((resolve) => app.close(resolve));
  }
});


test("a chat turn's log records the tool it withheld for its schema, which the model is never offered (ASSISTANT-LLM-22, FIXED 2026-09-28)", { timeout: 20_000 }, async () => {
  // The app's own llm/mcp.js still caches the test above's
  // registry: the clock jumps past its 60 s. Only Date is
  // mocked, so the turn's timers stay real; the stub's waitFor
  // cannot time out on a frozen Date, so the log — posted
  // before the stream ended — is read from the requests
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 5 * 60_000 });
  const { setModelForTests } = await import("../llm/provider.js");
  const { scripted, textStream, toolCallStream } = await import("./mockModel.mjs");
  const { createApp } = await import("../app.js");
  const thread = "0b6f8e8c-1c2d-4e5f-8a9b-0c1d2e3f4a5d";
  const mcpServer = await double({ tools: [
    tool("search"), { name: "broken", description: "x", inputSchema: { type: "object", properties: { q: { type: "strng" } } } },
  ] });
  registry = [server("eurlex_two", mcpServer)];
  Object.assign(stub.routes, {
    "GET /api/auth/me": () => ({ json: { id: "u1", displayName: "Tomas", role: "user" } }),
    "GET /internal/assistant/prompt": () => ({ json: { id: "pv1", model: null, text: "Prompt {COMPANY_CONTEXT}" } }),
    "GET /internal/assistant/budget": () => ({ json: { remaining: 9 } }),
    [`GET /api/chat/threads/${thread}`]: () => ({ json: { id: thread, companyId: null } }),
    [`POST /api/chat/threads/${thread}/messages`]: () => ({ json: { ok: true } }),
    [`POST /internal/assistant/threads/${thread}/messages`]: () => ({ status: 201, json: { ok: true } }),
    "POST /internal/assistant/turn-log": () => ({ status: 201, json: { id: "log" } }),
  });
  const model = scripted([toolCallStream("mcp_eurlex_two_search", { q: "MiCA" }), textStream("Radau.")]);
  setModelForTests({ language: model });
  const warn = mock.method(console, "warn", () => {});
  const app = createApp().listen(0);
  await new Promise((resolve) => app.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/api/assistant/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ id: thread, parentId: null, locale: "lt",
                             message: { id: "u-1", role: "user", parts: [{ type: "text", text: "Rask MiCA" }] } }),
    });
    assert.equal(response.status, 200);
    await response.text();
    const offered = model.doStreamCalls[0].tools.map((t) => t.name);
    assert.ok(offered.includes("mcp_eurlex_two_search") && !offered.includes("mcp_eurlex_two_broken"), offered.join(", "));
    const log = stub.requests.find((r) => r.path === "/internal/assistant/turn-log");
    assert.ok(log, "the turn was logged");
    assert.deepEqual(log.body.tool_calls.map(({ name, ms, ok, code }) => ({ name, ms: name.endsWith("broken") ? ms : "any", ok, code })), [
      { name: "mcp_eurlex_two_broken", ms: 0, ok: false, code: "MCP_SCHEMA_INVALID" },
      { name: "mcp_eurlex_two_search", ms: "any", ok: true, code: undefined },
    ], "the withheld tool first (listed before any call), then the call");
    assert.match(warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n"), /MCP tool "broken" of "eurlex_two" skipped/);
  } finally {
    warn.mock.restore();
    setModelForTests({});
    await new Promise((resolve) => app.close(resolve));
  }
});
