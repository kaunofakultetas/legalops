// -----------------------------------------------------------
//  [*] Tests — structural rules (source level)
//
//  Rules that hold across the whole service, checked by
//  reading the source instead of running it:
//
//    - every file opens with the house header; the shipped
//      source banners every top-level function and class,
//      with 7 blank lines before each section;
//    - the route table is exactly EXPECTED_ROUTES, each route
//      named in its file's header and the service README, and
//      the README names no route that is gone;
//    - no console call is handed a credential, request headers
//      or the environment;
//    - every fetch() carries a timeout signal, so a hung socket
//      never holds a turn or a worker call;
//    - only config.js reads the environment, beside an exact
//      list of call-time re-reads, and every variable it reads
//      is documented in its header;
//    - a known defect is pinned with expectFailure and its ID,
//      never as a todo: a todo never fails the run, so a fixed
//      defect would stay pinned unnoticed.
//
//  Only the service's own folder is read: the README rules
//  read runTests.sh's read-only mount of it and are skipped,
//  with the reason, when it is absent. Known gaps are exact
//  lists: a new gap fails at once, a fixed one until it is
//  struck off, and while a list is not empty its "closed"
//  test is an expectFailure pin.
//
//  Defects guarded here:
//
//    ASSISTANT-CORE-2 — the README did not name every route
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";


// The app directory (tests/..)
const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));

// The banner rule line: "// " + 59 dashes
const RULE = `// ${"-".repeat(59)}`;

// Every route the service serves (tests/app.test.mjs drives
// the same table); a new route goes here, in app.test.mjs and
// in the README
const EXPECTED_ROUTES = [
  "GET /api/assistant/chat/{}/status",
  "GET /health",
  "GET /internal/llm/models",
  "POST /api/assistant/chat",
  "POST /api/assistant/chat/{}/stop",
  "POST /internal/llm/embed",
  "POST /internal/llm/generate",
  "POST /internal/mcp/list-tools",
];

// ASSISTANT-CORE-2: the routes the service README does not
// name — strike an entry when the README gains it
const UNDOCUMENTED_IN_README = [];

// The environment reads allowed outside config.js — the
// call-time re-reads that let the tests repoint the stub
const ENV_READS_OUTSIDE_CONFIG = {
  "middleware/internal.js": ["ASSISTANT_INTERNAL_SECRET"],
  "services/django.js": ["ASSISTANT_INTERNAL_SECRET", "DJANGO_URL"],
};

// What a console.* call must never be handed
const FORBIDDEN_IN_LOGS = /\b(token|bearer|authorization|headers|secret|INTERNAL_SECRET|AI_GATEWAY_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|apiKey)\b|process\.env/i;

// A defect pinned as a todo, in the option or the method form
const TODO_PIN = /[{,]\s*todo\s*:|\.todo\s*\(/;

// The expectFailure option, and a pin written in full: the
// option names its defect's ID and says what is wrong
const EXPECT_FAILURE_OPTION = /[{,]\s*expectFailure\s*:/;
const EXPECT_FAILURE_PIN = /[{,]\s*expectFailure\s*:\s*"ASSISTANT-(CORE|ROUTES|LLM)-\d+: \S/;

// The service README: runTests.sh's mount of it, or the file
// itself in the repo
const README = firstExisting([fileURLToPath(new URL("../../README.md", import.meta.url))]);

// The skip reason when it is absent
const NO_README = README ? false : "the service README is not mounted (runTests.sh mounts it at /README.md)";







// -----------------------------------------------------------
// firstExisting
// -----------------------------------------------------------
//
// The first path of the list that exists, or null.
//
// Used by:
//   - README (above)
// -----------------------------------------------------------

function firstExisting(paths) {
  return paths.find((path) => existsSync(path)) ?? null;
}







// -----------------------------------------------------------
// walk
// -----------------------------------------------------------
//
// Every .js and .mjs file under a directory, with its text and
// its path relative to the app root; node_modules and dot
// entries are skipped.
//
// Used by:
//   - sourceFiles, testFiles (below)
// -----------------------------------------------------------

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (/\.m?js$/.test(entry.name)) files.push({ rel: relative(APP_ROOT, path), text: readFileSync(path, "utf8") });
  }
  return files;
}







// -----------------------------------------------------------
// sourceFiles
// -----------------------------------------------------------
//
// The shipped source: every .js file outside tests/.
//
// Used by:
//   - the rules (below)
// -----------------------------------------------------------

function sourceFiles() {
  return walk(APP_ROOT).filter((file) => !file.rel.startsWith("tests/") && file.rel.endsWith(".js"));
}







// -----------------------------------------------------------
// testFiles
// -----------------------------------------------------------
//
// The suite itself: tests/ and tests/helpers/.
//
// Used by:
//   - the header and expectFailure rules (below)
// -----------------------------------------------------------

function testFiles() {
  return walk(join(APP_ROOT, "tests"));
}







// -----------------------------------------------------------
// callText
// -----------------------------------------------------------
//
// The argument text of the call whose "(" sits at `open`, up
// to its balanced ")", or the rest of the source if it never
// closes. String and template literals are skipped whole, so
// a parenthesis inside one does not count.
//
// Used by:
//   - the console and fetch rules (below)
// -----------------------------------------------------------

function callText(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i += 1; i < source.length && source[i] !== ch; i += 1) if (source[i] === "\\") i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")" && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}







// -----------------------------------------------------------
// codeOnly
// -----------------------------------------------------------
//
// Code with its literal text removed — string contents
// emptied, a template literal reduced to its embedded
// expressions — so a rule sees identifiers, not prose.
//
// Used by:
//   - the console rule (below)
// -----------------------------------------------------------

function codeOnly(text) {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      for (i += 1; i < text.length && text[i] !== ch; i += 1) if (text[i] === "\\") i += 1;
      out += '""';
    } else if (ch === "`") {
      for (i += 1; i < text.length && text[i] !== "`"; i += 1) {
        if (text[i] === "\\") {
          i += 1;
        } else if (text[i] === "$" && text[i + 1] === "{") {
          let depth = 1;
          let expression = "";
          for (i += 2; i < text.length && depth > 0; i += 1) {
            if (text[i] === "{") depth += 1;
            if (text[i] === "}") depth -= 1;
            if (depth > 0) expression += text[i];
          }
          i -= 1;
          out += ` ${codeOnly(expression)} `;
        }
      }
    } else {
      out += ch;
    }
  }
  return out;
}







// -----------------------------------------------------------
// headerOf
// -----------------------------------------------------------
//
// A file's header banner: the lines up to the rule that
// closes it, or nothing when no rule closes it.
//
// Used by:
//   - the header, route-index and env rules (below)
// -----------------------------------------------------------

function headerOf(text) {
  const lines = text.split("\n");
  const end = lines.indexOf(RULE, 1);
  return end < 0 ? "" : lines.slice(0, end + 1).join("\n");
}







// -----------------------------------------------------------
// normalizePath
// -----------------------------------------------------------
//
// A path, or a whole document, with every route parameter —
// Express's colon form or the documents' braces — written as
// "{}", so the code's routes and the documents' compare.
//
// Used by:
//   - routeTable, undocumented and the route rules (below)
// -----------------------------------------------------------

function normalizePath(path) {
  return path.replace(/:\w+|\{\w*\}/g, "{}");
}







// -----------------------------------------------------------
// routeTable
// -----------------------------------------------------------
//
// The routes the source registers, each as "METHOD /path"
// with the file that registers it: app.js's own routes, and
// every route of a routes/ module at the prefix app.js mounts
// it on.
//
// Used by:
//   - undocumented and the route rules (below)
// -----------------------------------------------------------

function routeTable() {
  const app = readFileSync(join(APP_ROOT, "app.js"), "utf8");
  const imports = Object.fromEntries([...app.matchAll(/import (\w+) from "\.\/(routes\/\w+\.js)"/g)].map((m) => [m[1], m[2]]));
  const routes = [];
  for (const m of app.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
    routes.push({ route: `${m[1].toUpperCase()} ${normalizePath(m[2])}`, file: "app.js" });
  }
  for (const m of app.matchAll(/app\.use\(\s*"([^"]+)"\s*,([^)]*)\)/g)) {
    const name = m[2].split(",").map((part) => part.trim()).reverse().find((part) => imports[part]);
    if (!name) continue;
    const module = readFileSync(join(APP_ROOT, imports[name]), "utf8");
    for (const r of module.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      const path = r[2] === "/" ? m[1] : `${m[1]}${r[2]}`;
      routes.push({ route: `${r[1].toUpperCase()} ${normalizePath(path)}`, file: imports[name] });
    }
  }
  return routes;
}







// -----------------------------------------------------------
// undocumented
// -----------------------------------------------------------
//
// The routes whose path a document never names, sorted. Only
// the path is matched, not the method, and only as a whole
// token, so "/health" inside "/api/health" does not count.
//
// Used by:
//   - the README rules (below)
// -----------------------------------------------------------

function undocumented(docPath) {
  const doc = normalizePath(readFileSync(docPath, "utf8"));
  return routeTable().map(({ route }) => route).filter((route) => {
    const path = route.split(" ")[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(^|[^\\w/{}.-])${path}(?![\\w/{}-])`).test(doc);
  }).sort();
}







test("every file opens with the house banner header, closed before the code", () => {
  for (const { rel, text } of [...sourceFiles(), ...testFiles()]) {
    const lines = text.split("\n");
    assert.equal(lines[0], RULE, `${rel}: line 1 is the banner rule`);
    assert.match(lines[1], /^\/\/ {2}\[\*\] \S/, `${rel}: line 2 is the "//  [*] Area — Name" title`);
    const header = headerOf(text).split("\n");
    assert.ok(header.length > 2, `${rel}: the header closes with the rule`);
    assert.ok(header.every((line) => line.startsWith("//")), `${rel}: nothing but comments inside the header`);
  }
});


test("the shipped source: every top-level function and class has its own banner, 7 blank lines before each section", () => {
  const offenders = [];
  for (const { rel, text } of sourceFiles()) {
    const lines = text.split("\n");
    const headerEnd = lines.indexOf(RULE, 1);
    lines.forEach((line, i) => {
      const declared = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class)\s+(\w+)/);
      if (declared) {
        let open = i - 2;
        while (open > 0 && !(lines[open] === RULE && lines[open + 2] === RULE)) open -= 1;
        const title = lines[open + 1] ?? "";
        if (lines[i - 1] !== "" || lines[i - 2] !== RULE || !title.includes(declared[1])) offenders.push(`${rel}:${i + 1} ${declared[1]}`);
      }
      if (i > headerEnd && line === RULE && lines[i + 2] === RULE && /^\/\/ \S/.test(lines[i + 1] ?? "")
          && lines[i - 1] === "") {
        let blanks = 0;
        while (lines[i - 1 - blanks] === "") blanks += 1;
        if (blanks !== 7) offenders.push(`${rel}:${i + 1} ${blanks} blank lines before "${lines[i + 1]}"`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});


test("the route table is exactly EXPECTED_ROUTES, and every route heads its own file's endpoint index", () => {
  const routes = routeTable();
  assert.deepEqual(routes.map(({ route }) => route).sort(), EXPECTED_ROUTES);
  for (const { route, file } of routes) {
    const [method, path] = route.split(" ");
    const header = normalizePath(headerOf(readFileSync(join(APP_ROOT, file), "utf8")));
    const index = file === "app.js" ? new RegExp(`${path}\\b`) : new RegExp(`${method} +${path.replace(/[{}]/g, "\\$&")}(?=\\s)`);
    assert.match(header, index, `${file}'s header names ${route}`);
  }
});


test("the service README: no route is undocumented beyond the known list (ASSISTANT-CORE-2)", { skip: NO_README }, () => {
  assert.deepEqual(undocumented(README), UNDOCUMENTED_IN_README);
});


test("the service README names every route of the assistant (ASSISTANT-CORE-2, FIXED)", {
  skip: NO_README,
}, () => {
  assert.deepEqual(undocumented(README), []);
});


test("the service README names no assistant route that does not exist", { skip: NO_README }, () => {
  const served = new Set(routeTable().map(({ route }) => route.split(" ")[1]));
  const phantoms = [];
  const text = normalizePath(readFileSync(README, "utf8"));
  for (const m of text.matchAll(/\/(?:api\/assistant|internal\/llm|internal\/mcp)[\w/{}.-]*(.?)/g)) {
    const path = m[0].slice(0, m[0].length - m[1].length).replace(/\/+$/, "");
    if (m[1] === "*") continue;
    if (!served.has(path)) phantoms.push(path);
  }
  assert.deepEqual(phantoms, []);
});


test("no console.* call is handed a bearer, a secret, a key, request headers or the environment", () => {
  const offenders = [];
  for (const { rel, text } of sourceFiles()) {
    for (const m of text.matchAll(/console\.(log|warn|error|info|debug|trace|dir)\(/g)) {
      const args = codeOnly(callText(text, m.index + m[0].length - 1));
      if (FORBIDDEN_IN_LOGS.test(args)) offenders.push(`${rel}:${text.slice(0, m.index).split("\n").length} ${args.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(FORBIDDEN_IN_LOGS.test(codeOnly("`MCP ${server.headers}`")), "the rule sees template expressions");
  assert.ok(!FORBIDDEN_IN_LOGS.test(codeOnly('"ASSISTANT_INTERNAL_SECRET is empty"')), "and ignores prose");
});


test("every fetch() carries a timeout signal", () => {
  const calls = [];
  for (const { rel, text } of sourceFiles()) {
    for (const m of text.matchAll(/(?<![\w.])fetch\(/g)) {
      calls.push([rel, /signal:\s*AbortSignal\.(timeout|any)\(/.test(callText(text, m.index + 5))]);
    }
  }
  assert.ok(calls.length >= 2, "the scan finds the Django and gateway clients");
  assert.deepEqual(calls.filter(([, bounded]) => !bounded), []);
});


test("a known defect is pinned with expectFailure and its ID, never todo — a passing todo test never fails the run", () => {
  const todo = [];
  const unnamed = [];
  for (const { rel, text } of testFiles()) {
    text.split("\n").forEach((line, index) => {
      if (line.trim().startsWith("//")) return;
      if (TODO_PIN.test(line)) todo.push(`${rel}:${index + 1} ${line.trim()}`);
      if (EXPECT_FAILURE_OPTION.test(line) && !EXPECT_FAILURE_PIN.test(line)) unnamed.push(`${rel}:${index + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(todo, [], "pin with expectFailure: it fails the run once the defect is fixed");
  assert.deepEqual(unnamed, [], "an expectFailure pin names its ID: \"ASSISTANT-<AREA>-<n>: <what is wrong>\"");
  const pin = (option, value) => `test("x", { ${option}: ${value} }, () => {});`;
  assert.ok(TODO_PIN.test(pin("todo", '"ASSISTANT-CORE-9: y"')) && TODO_PIN.test(`t.${"todo"}("later");`), "the rule sees both todo forms");
  assert.ok(EXPECT_FAILURE_PIN.test(pin("expectFailure", '"ASSISTANT-LLM-27: y"')), "and a pin written in full");
  assert.ok(EXPECT_FAILURE_OPTION.test(pin("expectFailure", "true")) && !EXPECT_FAILURE_PIN.test(pin("expectFailure", "true")), "and one without its ID");
});


test("config.js is the one reader of the environment; the call-time re-reads are an exact list", () => {
  const reads = {};
  for (const { rel, text } of sourceFiles()) {
    if (rel === "config.js") continue;
    const names = [...new Set([...text.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]))].sort();
    if (names.length) reads[rel] = names;
    assert.doesNotMatch(text, /process\.env\[/, `${rel} reads the environment by a computed name`);
  }
  assert.deepEqual(reads, ENV_READS_OUTSIDE_CONFIG);
});


test("every variable config.js reads is documented in its header", () => {
  const config = readFileSync(join(APP_ROOT, "config.js"), "utf8");
  const names = [...new Set([
    ...[...config.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]),
    ...[...config.matchAll(/FromEnv\(\s*"([A-Z_]+)"/g)].map((m) => m[1]),
  ])].sort();
  assert.ok(names.length >= 17, `the scan found the variables (${names.length})`);
  const header = headerOf(config);
  const missing = names.filter((name) => !new RegExp(`\\b${name}\\b`).test(header));
  assert.deepEqual(missing, []);
  for (const names2 of Object.values(ENV_READS_OUTSIDE_CONFIG)) {
    for (const name of names2) assert.ok(names.includes(name), `${name} is a config variable too`);
  }
});
