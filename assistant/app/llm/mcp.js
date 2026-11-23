// -----------------------------------------------------------
//  [*] Assistant — external MCP sources
//
//  Django keeps the registry of MCP servers (the admin page);
//  this module offers the enabled servers' tools to the chat,
//  each named mcp_<server>_<tool>. Every turn lists each
//  server's tools (cached a minute) and keeps the allowed ones.
//
//  A tool is offered only when its input schema, its local
//  references resolved, is an object schema zod can compile:
//  one bad schema makes the provider refuse the whole tools
//  array. A call's arguments are checked against that schema
//  before the server sees them.
//
//  A failing server is skipped, never the turn: connecting and
//  listing share one deadline, a call has its own timeout and
//  its answer a size cap. The turn's connections stay open
//  until its close(). A server's headers are its credentials;
//  nothing here logs them.
//
//  Split into:
//
//    toolKey           — the provider-safe tool name
//    connect           — one MCP client for a server
//    listServerTools   — connect and list, the admin test too
//    loadServers       — the registry, cached
//    mirrorsJson       — does a text block repeat the JSON?
//    resultText        — a tool result as capped text
//    serverDefinitions — one server's tools, cached or listed
//    refPointer        — a local $ref as a JSON pointer
//    resolvePointer    — what a JSON pointer names
//    rewriteLocalRefs  — one pass over a schema's references
//    inlineLocalRefs   — a schema's local references resolved
//    objectSchema      — a tool's input schema, or null
//    toolSchema        — the schema resolved and compiled
//    issuesText        — a failed check as one line
//    externalTool      — one definition as a chat tool
//    openMcpTools      — the turn's MCP tools and close()
// -----------------------------------------------------------

import { isDeepStrictEqual } from "node:util";

import { createMCPClient } from "@ai-sdk/mcp";
import { jsonSchema, tool } from "ai";
import { z } from "zod";

import { internalFetch } from "../services/django.js";
import { ToolFailure } from "./tools/shared.js";


// How long the server registry is reused
const SERVERS_CACHE_MS = 60_000;

// How long one server's tool definitions are reused
const TOOLS_CACHE_MS = 60_000;

// One deadline for connecting to a server and listing its
// tools together, not one per request
const CONNECT_TIMEOUT_MS = 8_000;

// How long one call to an external tool may take
const CALL_TIMEOUT_MS = 30_000;

// Characters of an external tool's answer the model gets
const MAX_RESULT_CHARS = 20_000;

// Tools one server may contribute to a turn
const MAX_TOOLS = 40;

// Listing pages followed at most, so a server that pages
// forever cannot hold the turn
const MAX_PAGES = 50;

// Schema objects inlining may create — shared definitions can
// grow exponentially; past this each is kept once instead
const MAX_INLINED_NODES = 5_000;

// Levels of nesting inlining may reach before it does the same
const MAX_INLINED_DEPTH = 64;

// The keywords holding a subschema or a list of them (zod's
// own table); a $ref outside these and SUBSCHEMA_MAPS is data
const SUBSCHEMA_KEYWORDS = new Set([
  "additionalItems", "additionalProperties", "allOf", "anyOf", "contains", "contentSchema", "else", "if", "items",
  "not", "oneOf", "prefixItems", "propertyNames", "then", "unevaluatedItems", "unevaluatedProperties",
]);

// The keywords whose value maps names to subschemas (draft-07
// dependencies may map a name to a list of names — data)
const SUBSCHEMA_MAPS = new Set(["dependencies", "dependentSchemas", "patternProperties", "properties"]);

// The definition containers: dropped by the rewrite, which
// inlines what is used or keeps it once in a new container
const DEFINITION_CONTAINERS = new Set(["$defs", "definitions"]);

// Keywords that only annotate a $ref, laid over its target;
// other siblings constrain it (2019-09 on) and go under allOf
const REF_ANNOTATIONS = new Set([
  "$comment", "$schema", "default", "deprecated", "description", "examples", "readOnly", "title", "writeOnly",
]);

// The $schema values under which zod reads definitions, not
// $defs — spelled exactly as zod's detectVersion spells them
const DEFINITIONS_DIALECTS = new Set([
  "http://json-schema.org/draft-07/schema#", "http://json-schema.org/draft-04/schema#",
]);

// Thrown by rewriteLocalRefs when inlining outgrows its limits;
// inlineLocalRefs then keeps every referenced schema once
const TOO_LARGE = Symbol("the inlined schema outgrew its limits");

// The last registry answer and when it was fetched
let serversCache = { at: 0, servers: [] };

// server id → its last tool listing and when it was taken
const definitionsCache = new Map();

// tool definition → toolSchema's answer, kept with its cached
// listing so the next turn does not compile it again
const preparedSchemas = new WeakMap();







// -----------------------------------------------------------
// toolKey
// -----------------------------------------------------------
//
// The name a server's tool goes by in the chat: "mcp_", the
// server's name and the tool's, folded to lower-case letters,
// digits and underscores (diacritics dropped) — what every
// provider accepts in a function name — and 64 at most. The
// server part is capped at 24 so the tool's own name survives.
//
// Used by:
//   - openMcpTools (below)
//   - tests/mcp.test.mjs
// -----------------------------------------------------------

export function toolKey(serverName, toolName) {
  // NFKD splits each diacritic off as a combining mark, and the
  // first replace drops that block (U+0300–U+036F)
  const fold = (value) => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return `mcp_${fold(serverName).slice(0, 24) || "server"}_${fold(toolName) || "tool"}`.slice(0, 64);
}







// -----------------------------------------------------------
// connect
// -----------------------------------------------------------
//
// Opens an MCP client to one server, over its transport and
// with its headers. Redirects are refused, so an allowlisted
// host cannot bounce the connection elsewhere; the handshake
// ends at the caller's deadline, or after timeoutMs.
//
// Used by:
//   - listServerTools, openMcpTools (below)
// -----------------------------------------------------------

async function connect(server, timeoutMs = CONNECT_TIMEOUT_MS, signal = AbortSignal.timeout(timeoutMs)) {
  return createMCPClient({
    transport: {
      type: server.transport === "sse" ? "sse" : "http",
      url: server.url,
      headers: server.headers && typeof server.headers === "object" ? server.headers : undefined,
      redirect: "error",
    },
    clientName: "legalops-assistant",
    initializationOptions: { timeout: timeoutMs, signal },
  });
}







// -----------------------------------------------------------
// listServerTools
// -----------------------------------------------------------
//
// Connects and lists the server's tools page by page —
// stopping at MAX_PAGES pages or once 500 tools are in — all
// within one deadline of timeoutMs. The client is closed after
// the listing, and always on a failure, unless keepClient asks
// for it back open beside the tools; the caller closes it
// then. A failed connection or listing throws.
//
// Used by:
//   - routes/internalMcp.js — POST /internal/mcp/list-tools
//   - serverDefinitions (below)
//   - tests/mcp.test.mjs
// -----------------------------------------------------------

export async function listServerTools(server, timeoutMs = CONNECT_TIMEOUT_MS, keepClient = false) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const client = await connect(server, timeoutMs, deadline);
  let handedOver = false;
  try {
    const tools = [];
    let cursor;
    let pages = 0;
    do {
      const page = await client.listTools({
        params: cursor ? { cursor } : undefined, options: { timeout: timeoutMs, signal: deadline },
      });
      tools.push(...(page.tools || []));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && tools.length < 500 && pages < MAX_PAGES);
    if (!keepClient) return tools;
    handedOver = true;
    return { tools, client };
  } finally {
    if (!handedOver) await client.close().catch(() => {});
  }
}







// -----------------------------------------------------------
// loadServers
// -----------------------------------------------------------
//
// The enabled servers and their credentials, from Django's
// GET /internal/assistant/mcp-servers, cached for
// SERVERS_CACHE_MS. A failed fetch keeps the previous list (or
// none) and is retried after ten seconds.
//
// Used by:
//   - openMcpTools (below)
// -----------------------------------------------------------

async function loadServers() {
  if (Date.now() - serversCache.at < SERVERS_CACHE_MS) return serversCache.servers;
  try {
    const answer = await internalFetch("/internal/assistant/mcp-servers");
    serversCache = { at: Date.now(), servers: Array.isArray(answer?.servers) ? answer.servers : [] };
  } catch (err) {
    console.warn("MCP registry unavailable (keeping the previous list):", err?.message);
    serversCache = { at: Date.now() - SERVERS_CACHE_MS + 10_000, servers: serversCache.servers };
  }
  return serversCache.servers;
}







// -----------------------------------------------------------
// mirrorsJson
// -----------------------------------------------------------
//
// Whether a text block already is the structured content as
// JSON, in any formatting. The SDK mirrors a structured-only
// result into a text block and the MCP spec asks servers to
// send both, so adding it again would double the answer.
//
// Used by:
//   - resultText (below)
// -----------------------------------------------------------

function mirrorsJson(pieces, value) {
  return pieces.some((text) => {
    if (!/^\s*[[{]/.test(text)) return false;
    try {
      return isDeepStrictEqual(JSON.parse(text), value);
    } catch {
      return false;
    }
  });
}







// -----------------------------------------------------------
// resultText
// -----------------------------------------------------------
//
// A tool's result as the one text the model reads: its text
// blocks, then its structured content as JSON unless a block
// already carries it. Other content is only named, and the
// whole is cut at MAX_RESULT_CHARS.
//
// Used by:
//   - externalTool (below)
// -----------------------------------------------------------

function resultText(result) {
  const pieces = [];
  for (const item of result?.content || []) {
    if (item?.type === "text") pieces.push(item.text);
    else if (item?.type) pieces.push(`[${item.type} content omitted]`);
  }
  if (result?.structuredContent != null && !mirrorsJson(pieces, result.structuredContent)) {
    pieces.push(JSON.stringify(result.structuredContent));
  }
  const text = pieces.join("\n").trim();
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)} …[truncated]` : text;
}







// -----------------------------------------------------------
// serverDefinitions
// -----------------------------------------------------------
//
// One server's tool definitions, from the cache while it is
// fresh or else listed now — keeping the listing's open client
// in clients for the turn's calls. A failure logs a warning
// and answers nothing, so the server sits this turn out (its
// client already closed).
//
// Used by:
//   - openMcpTools (below)
// -----------------------------------------------------------

async function serverDefinitions(server, clients) {
  try {
    const cached = definitionsCache.get(server.id);
    if (cached && Date.now() - cached.at <= TOOLS_CACHE_MS) return cached.definitions;
    const listed = await listServerTools(server, CONNECT_TIMEOUT_MS, true);
    clients.set(server.id, Promise.resolve(listed.client));
    definitionsCache.set(server.id, { at: Date.now(), definitions: listed.tools });
    return listed.tools;
  } catch (err) {
    console.warn(`MCP server "${server.name}" skipped:`, String(err?.message || err).slice(0, 200));
    return null;
  }
}







// -----------------------------------------------------------
// refPointer
// -----------------------------------------------------------
//
// The JSON pointer of a local $ref, the root's or a path from
// it, percent-decoded since it is a URI fragment. Anything else
// — another document, an anchor, not a string — is null and is
// left in place for zod to refuse.
//
// Used by:
//   - rewriteLocalRefs (below)
// -----------------------------------------------------------

function refPointer(ref) {
  if (ref === "#") return "";
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  try {
    return decodeURIComponent(ref.slice(1));
  } catch {
    return ref.slice(1);
  }
}







// -----------------------------------------------------------
// resolvePointer
// -----------------------------------------------------------
//
// What a JSON pointer names inside the schema, its escapes
// undone in the order RFC 6901 sets, or undefined when nothing
// is there.
//
// Used by:
//   - rewriteLocalRefs (below)
// -----------------------------------------------------------

function resolvePointer(root, pointer) {
  let node = root;
  for (const raw of pointer.split("/").slice(1)) {
    const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(node) && /^(0|[1-9]\d*)$/.test(token)) node = node[Number(token)];
    else if (node && typeof node === "object" && !Array.isArray(node) && Object.hasOwn(node, token)) node = node[token];
    else return undefined;
  }
  return node;
}







// -----------------------------------------------------------
// rewriteLocalRefs
// -----------------------------------------------------------
//
// One pass of inlineLocalRefs: copies the schema with every
// local reference replaced by its target. A reference into a
// schema still being expanded is recursion, so its target is
// kept once in the container zod reads — with keepOnce, every
// target is. A reference to nothing throws, inlining past the
// limits throws TOO_LARGE, and with nothing to rewrite the
// schema itself comes back.
//
// Used by:
//   - inlineLocalRefs (below)
// -----------------------------------------------------------

function rewriteLocalRefs(root, keepOnce) {
  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const pointerToken = (key) => String(key).replaceAll("~", "~0").replaceAll("/", "~1");
  const container = DEFINITIONS_DIALECTS.has(root.$schema) ? "definitions" : "$defs";
  const names = new Map();
  const pending = [];
  const path = new Set();
  let created = 0;
  let rewritten = false;


  // A kept schema's name in the container: the last token of
  // its pointer, identifier-safe, numbered when already taken
  const nameOf = (pointer) => {
    if (!names.has(pointer)) {
      const last = pointer.slice(pointer.lastIndexOf("/") + 1).replaceAll("~1", "/").replaceAll("~0", "~");
      const base = last.replace(/\W+/g, "_").slice(0, 40) || "schema";
      const taken = new Set(names.values());
      let name = base;
      for (let n = 2; taken.has(name); n += 1) name = `${base}_${n}`;
      names.set(pointer, name);
      pending.push(pointer);
    }
    return names.get(pointer);
  };


  // A subschema → its rewritten copy (a boolean schema as it
  // is); `location` is its pointer in the schema as sent, and
  // `path` the locations being expanded around it
  const walk = (node, location) => {
    if (!isObject(node)) return node;
    if (!keepOnce && (++created > MAX_INLINED_NODES || path.size >= MAX_INLINED_DEPTH)) throw TOO_LARGE;
    const entered = !path.has(location);
    if (entered) path.add(location);
    try {
      return refPointer(node.$ref) === null ? copy(node, location) : reference(node, location);
    } finally {
      if (entered) path.delete(location);
    }
  };


  // A subschema without a local $ref → a copy with its own
  // subschemas walked and its containers dropped
  const copy = (node, location) => {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (DEFINITION_CONTAINERS.has(key)) continue;
      const at = `${location}/${pointerToken(key)}`;
      if (SUBSCHEMA_KEYWORDS.has(key)) {
        out[key] = Array.isArray(value) ? value.map((item, index) => walk(item, `${at}/${index}`)) : walk(value, at);
      } else if (SUBSCHEMA_MAPS.has(key) && isObject(value)) {
        out[key] = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, `${at}/${pointerToken(name)}`)]));
      } else {
        out[key] = value;
      }
    }
    return out;
  };


  // A subschema with a local $ref → its target, inlined or
  // pointed at in the container ("#" stays: it is always
  // recursion, and zod reads it), with the $ref's siblings
  const reference = (node, location) => {
    const pointer = refPointer(node.$ref);
    let target = { $ref: "#" };
    if (pointer !== "") {
      const resolved = resolvePointer(root, pointer);
      if (typeof resolved !== "boolean" && !isObject(resolved)) throw new Error(`Reference not found: ${node.$ref}`);
      rewritten = true;
      target = keepOnce || path.has(pointer) ? { $ref: `#/${container}/${nameOf(pointer)}` } : walk(resolved, pointer);
    }
    const annotations = {};
    const constraints = {};
    for (const [key, value] of Object.entries(node)) {
      if (key !== "$ref" && !DEFINITION_CONTAINERS.has(key)) (REF_ANNOTATIONS.has(key) ? annotations : constraints)[key] = value;
    }
    const annotated = Object.keys(annotations).length > 0;
    if (Object.keys(constraints).length === 0) {
      if (isObject(target)) return { ...target, ...annotations };
      return annotated ? { allOf: [target], ...annotations } : target;
    }
    // zod checks an allOf branch by its own type only: the
    // target's is lent to the constraints (allOf demands it
    // anyway), so a maxLength beside a string $ref is checked
    const typed = isObject(target) && target.type !== undefined && constraints.type === undefined
      ? { type: target.type, ...constraints } : constraints;
    return { allOf: [target, copy(typed, location)], ...annotations };
  };


  const main = walk(root, "");
  const kept = {};
  for (let i = 0; i < pending.length; i += 1) kept[names.get(pending[i])] = walk(resolvePointer(root, pending[i]), pending[i]);
  if (!rewritten) return root;
  if (pending.length === 0) return main;
  return isObject(main) ? { ...main, [container]: kept } : { allOf: [main], [container]: kept };
}







// -----------------------------------------------------------
// inlineLocalRefs (exported for the tests)
// -----------------------------------------------------------
//
// zod reads no $ref but the root and its dialect's definition
// container, while real servers point anywhere into the schema
// (zod-to-json-schema's default, used by the MCP TypeScript
// SDK). So every local reference is inlined first — the form
// every provider accepts — except a recursive one, kept once
// where zod reads it; when inlining would blow up, every
// referenced schema is kept once instead. The listed schema is
// never changed, since listings are cached across turns.
//
// Used by:
//   - toolSchema (below)
//   - tests/mcp.test.mjs
// -----------------------------------------------------------

export function inlineLocalRefs(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  try {
    return rewriteLocalRefs(schema, false);
  } catch (err) {
    if (err !== TOO_LARGE) throw err;
    return rewriteLocalRefs(schema, true);
  }
}







// -----------------------------------------------------------
// objectSchema
// -----------------------------------------------------------
//
// The tool's input schema as an object schema, the only kind
// a provider takes: a missing type reads as object, no schema
// at all as an empty object. Anything else is null — offered
// anyway, one server's malformed tool would make the provider
// refuse the whole request.
//
// Used by:
//   - toolSchema (below)
// -----------------------------------------------------------

function objectSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { type: "object", properties: {} };
  if (schema.type === undefined) return { ...schema, type: "object" };
  return schema.type === "object" ? schema : null;
}







// -----------------------------------------------------------
// toolSchema
// -----------------------------------------------------------
//
// Readies a tool's input schema: local references resolved,
// an object schema, compiled by zod as routes/internal.js
// checks a generate schema. A broken nested schema would make
// the provider refuse every turn, so whatever zod cannot
// compile (keywords it does not read, such as not or if /
// then / else, included) withholds the tool. The answer is the
// schema and its validator, or the problem that withheld it.
//
// Used by:
//   - openMcpTools (below)
// -----------------------------------------------------------

function toolSchema(inputSchema) {
  try {
    const schema = objectSchema(inlineLocalRefs(inputSchema));
    if (!schema) return { problem: "its input schema is not an object" };
    const validator = z.fromJSONSchema(schema);
    // A schema that only refers to itself compiles, then
    // overflows the stack on every check
    validator.safeParse({});
    return { schema, validator };
  } catch (err) {
    return { problem: `its input schema cannot be read: ${String(err?.message || err).replace(/\s+/g, " ").slice(0, 200)}` };
  }
}







// -----------------------------------------------------------
// issuesText
// -----------------------------------------------------------
//
// A failed argument check as one line the model can act on:
// the path and message of the first five issues.
//
// Used by:
//   - externalTool (below)
// -----------------------------------------------------------

function issuesText(error) {
  const issues = (error?.issues ?? []).slice(0, 5)
    .map((issue) => `${issue.path?.length ? issue.path.join(".") : "(the arguments)"}: ${issue.message}`);
  return issues.join("; ") || "they do not match";
}







// -----------------------------------------------------------
// externalTool
// -----------------------------------------------------------
//
// One server tool as a chat tool named key, its description
// marked as an external source. execute() checks the arguments
// against the readied schema first — the SDK does not for a
// plain JSON schema — so a bad call comes back to the model as
// INVALID_TOOL_INPUT and never reaches the server. A valid call
// goes out as the model wrote it; the tool's own error is
// MCP_TOOL_ERROR, any other failure MCP_UNREACHABLE, and every
// call is recorded for the turn log.
//
// Used by:
//   - openMcpTools (below)
// -----------------------------------------------------------

function externalTool(server, definition, schema, validator, key, clientFor, record) {
  return tool({
    description: `[External source: ${String(server.name).slice(0, 60)} — not the platform's corpus] `
      + String(definition.description || definition.name).slice(0, 900),
    inputSchema: jsonSchema(schema),
    execute: async (args, { abortSignal } = {}) => {
      const started = Date.now();
      try {
        let checked;
        // A schema referring to itself deeper than toolSchema's
        // empty check reached can still overflow the stack here
        try {
          checked = validator.safeParse(args ?? {});
        } catch {
          throw new ToolFailure(key, "MCP_SCHEMA_INVALID", "the tool's input schema cannot be checked — do not call it again");
        }
        if (!checked.success) {
          throw new ToolFailure(key, "INVALID_TOOL_INPUT",
                                `the arguments do not match the tool's input schema — ${issuesText(checked.error)}`);
        }
        const client = await clientFor(server);
        const signals = [AbortSignal.timeout(CALL_TIMEOUT_MS), abortSignal].filter(Boolean);
        const result = await client.callTool({
          name: definition.name, arguments: args ?? {},
          options: { timeout: CALL_TIMEOUT_MS, signal: AbortSignal.any(signals) },
        });
        const text = resultText(result);
        if (result?.isError) throw new ToolFailure(key, "MCP_TOOL_ERROR", text || "the external tool reported an error");
        record?.({ name: key, ms: Date.now() - started, ok: true });
        return { source: server.name, text };
      } catch (err) {
        const failure = err instanceof ToolFailure ? err
          : new ToolFailure(key, "MCP_UNREACHABLE", "the external source did not answer");
        if (!(err instanceof ToolFailure)) console.warn(`MCP call ${key} failed:`, err?.message);
        record?.({ name: key, ms: Date.now() - started, ok: false, code: failure.code });
        throw failure;
      }
    },
  });
}







// -----------------------------------------------------------
// openMcpTools
// -----------------------------------------------------------
//
// The turn's external tools and a close() for the connections
// they opened; with no enabled server the registry is all it
// asks for. Servers are listed in parallel but keyed in
// registry order, so a colliding name takes the same numbered
// suffix every turn. A tool withheld for its schema is recorded
// like a failed call, so the turn log shows what the model was
// not offered.
//
// Used by:
//   - routes/chat.js — the POST handler
//   - tests/mcp.test.mjs
// -----------------------------------------------------------

export async function openMcpTools({ record = null } = {}) {
  const servers = await loadServers();
  const clients = new Map();
  const tools = {};
  const close = async () => {
    await Promise.all([...clients.values()].map((pending) =>
      Promise.resolve(pending).then((client) => client?.close()).catch(() => {})));
    clients.clear();
  };
  if (servers.length === 0) return { tools, close };

  // One client per server per turn, opened on first use; a
  // failed connect is forgotten, so the next call tries again
  const clientFor = (server) => {
    if (!clients.has(server.id)) clients.set(server.id, connect(server).catch((err) => {
      clients.delete(server.id);
      throw err;
    }));
    return clients.get(server.id);
  };

  const listed = await Promise.all(servers.map((server) => serverDefinitions(server, clients)));
  servers.forEach((server, index) => {
    if (!listed[index]) return;
    const allowed = Array.isArray(server.allowedTools) && server.allowedTools.length ? new Set(server.allowedTools) : null;
    for (const definition of listed[index].filter((d) => !allowed || allowed.has(d.name)).slice(0, MAX_TOOLS)) {
      const base = toolKey(server.name, definition.name);
      if (!preparedSchemas.has(definition)) preparedSchemas.set(definition, toolSchema(definition.inputSchema));
      const prepared = preparedSchemas.get(definition);
      if (!prepared.validator) {
        console.warn(`MCP tool "${String(definition.name).slice(0, 80)}" of "${server.name}" skipped:`, prepared.problem);
        record?.({ name: base, ms: 0, ok: false, code: "MCP_SCHEMA_INVALID" });
        continue;
      }
      let key = base;
      for (let n = 2; tools[key]; n += 1) key = `${base.slice(0, 60)}_${n}`;
      tools[key] = externalTool(server, definition, prepared.schema, prepared.validator, key, clientFor, record);
    }
  });
  return { tools, close };
}
