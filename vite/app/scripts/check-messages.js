// -----------------------------------------------------------
//  [*] Build guard — translation completeness
//
//  Runs before eslint (`npm run lint`) and before vite build
//  (`npm run build`, so the legalops-vite image cannot be
//  built with a broken message tree). Plain Node, no
//  dependencies. It checks src/messages the way
//  messages/index.js assembles it (folder path = namespace)
//  and fails on:
//
//    1. a leaf key present in lt but not in en, or vice versa
//       (array elements count as leaves, like at run time);
//    2. {placeholders} that differ between the two languages
//       for the same key — a param the component fills in one
//       language and not the other;
//    3. an en string byte-identical to its lt string — an
//       untranslated string — unless it is a non-translatable
//       token: a value without letters outside its
//       {placeholders} (formats, ranges) or one listed in
//       IDENTICAL_OK;
//    4. a literal key passed to a t() bound by
//       useTranslations("<ns>"), or to translate("<key>"), in
//       src/ that resolves nowhere in the Lithuanian tree.
//       Keys built at run time can't be checked: a template
//       literal with ${} only has its leading "A.B." prefix
//       verified as a namespace; a t that a file receives as
//       a prop (no binding in that file) is not checked at all.
//
//  It does NOT report unused keys: t() travels between files
//  as a prop and keys are built at run time (the enum labels,
//  the error codes), so a literal scan both misses dead keys
//  and flags live ones.
//
//  Exit 1 with one line per problem, 0 with a one-line count.
//  The runtime has NO per-key fallback between the languages
//  (i18n.jsx answers the key itself when the active tree
//  lacks it), so a slip here would show a dotted path to the
//  user — this script is what keeps the slip out of a
//  release.
//
//  Run by hand:  node scripts/check-messages.js
//
//  Used by:
//    - package.json — the lint, build and check:messages
//      scripts
//    - tests/core/structural.test.js — runs it as a test
// -----------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES_DIR = join(ROOT, 'src', 'messages');
const SRC_DIR = join(ROOT, 'src');
const LOCALES = ['lt', 'en'];
const BASE = 'lt';


// lt == en strings that are correct as they are: source and
// product names, protocol and file-format names, the "v"
// version prefix both languages use, a language's own name,
// the language switch's labels (each is written in the
// language it switches TO, so the reader finds it) and the
// footer's copyright line, worded alike in both. Anything
// else identical in both files is reported as untranslated
const IDENTICAL_OK = new Set([
  'EUR-Lex (CELEX)', 'e-TAR', 'e-seimas',
  'SSE', 'PDF', 'Excel', 'Word',
  'v{version}', 'v{version}{active}', 'v{no} · {status}', '{slug} v{version} ({model})',
  'Lietuvių', 'English',
  'Switch the interface to English', 'Perjungti sąsają į lietuvių kalbą',
  'Copyright © | All Rights Reserved | VU KnF',
]);







// -----------------------------------------------------------
// walk
// -----------------------------------------------------------
//
// Every file under `dir`, recursively, as absolute paths.
//
// Used by:
//   - loadTrees, scanUsages (below)
// -----------------------------------------------------------

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}







// -----------------------------------------------------------
// loadTrees
// -----------------------------------------------------------
//
// { lt: tree, en: tree } built exactly like messages/index.js:
// messages/PAGES/users/lt.json lands at tree.PAGES.users.
//
// Used by:
//   - main (below)
// -----------------------------------------------------------

function loadTrees() {
  const trees = Object.fromEntries(LOCALES.map((l) => [l, {}]));
  for (const file of walk(MESSAGES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const segments = relative(MESSAGES_DIR, file).replace(/\.json$/, '').split(sep);
    const locale = segments.pop();
    if (!LOCALES.includes(locale)) continue;
    let node = trees[locale];
    for (const segment of segments.slice(0, -1)) node = node[segment] ??= {};
    node[segments[segments.length - 1]] = JSON.parse(readFileSync(file, 'utf8'));
  }
  return trees;
}







// -----------------------------------------------------------
// leaves
// -----------------------------------------------------------
//
// Flattens a tree to { "dotted.path": value } — objects AND
// arrays recurse (array index as the key), like the runtime's
// resolve() would walk them.
//
// Used by:
//   - main (below)
// -----------------------------------------------------------

function leaves(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') Object.assign(out, leaves(value, path));
    else out[path] = value;
  }
  return out;
}







// -----------------------------------------------------------
// resolve
// -----------------------------------------------------------
//
// Same walk as i18n.jsx: a dotted path into a tree, undefined
// as soon as a step is missing.
//
// Used by:
//   - scanUsages (below)
// -----------------------------------------------------------

function resolve(obj, path) {
  let value = obj;
  for (const key of path.split('.')) {
    value = value?.[key];
    if (value === undefined) return undefined;
  }
  return value;
}







// -----------------------------------------------------------
// placeholders
// -----------------------------------------------------------
//
// The sorted, de-duplicated {names} of a message string —
// "a" for "{a} and {a}".
//
// Used by:
//   - main (below)
// -----------------------------------------------------------

function placeholders(str) {
  return [...new Set([...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
}







// -----------------------------------------------------------
// literalKey
// -----------------------------------------------------------
//
// The key text of one matched call argument, from whichever
// quote style matched: "..." | '...' | `...`. A template with
// ${} is returned with `dynamic: true` so the caller only
// checks its literal prefix.
//
// Used by:
//   - scanUsages (below)
// -----------------------------------------------------------

function literalKey(match) {
  const [, dq, sq, tpl] = match;
  if (tpl !== undefined) return { key: tpl, dynamic: tpl.includes('${') };
  return { key: dq ?? sq, dynamic: false };
}







// -----------------------------------------------------------
// scanUsages
// -----------------------------------------------------------
//
// Walks src/ (messages/ excluded), strips comments, finds
// every `const NAME = useTranslations("ns")` binding and then
// every NAME("key") call of a bound name, plus translate("key")
// calls; verifies each key against the Lithuanian tree. Returns
// { problems, checked } — checked is the number of calls that
// were actually verified.
//
// Used by:
//   - main (below)
// -----------------------------------------------------------

function scanUsages(en) {
  const problems = [];
  let checked = 0;
  const ARG = String.raw`\(\s*(?:"([^"\\]*)"|'([^'\\]*)'|` + '`([^`]*)`)';
  const bindingRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*useTranslations\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g;

  // Whether a key resolves under one namespace. A dynamic key
  // "A.B.${x}" is only checkable up to its last dot; one with
  // no literal prefix at all cannot be checked and passes
  const resolves = (ns, { key, dynamic }) => {
    const full = ns ? `${ns}.${key}` : key;
    if (!dynamic) return resolve(en, full) !== undefined;
    const prefix = full.slice(0, full.indexOf('${')).replace(/\.[^.]*$/, '');
    if (!prefix || prefix.includes('${')) return true;
    return resolve(en, prefix) !== undefined;
  };

  for (const file of walk(SRC_DIR)) {
    if (!/\.(jsx?|mjs)$/.test(file) || file.startsWith(MESSAGES_DIR)) continue;
    const rel = relative(ROOT, file);
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    // name → namespaces bound in this file ('' = whole tree)
    const bindings = new Map();
    for (const m of code.matchAll(bindingRe)) {
      const set = bindings.get(m[1]) ?? new Set();
      set.add(m[2] ?? m[3] ?? '');
      bindings.set(m[1], set);
    }

    // One file may bind the same name to several namespaces
    // (a t per component); a key passes when any of them
    // resolves it
    for (const [name, namespaces] of bindings) {
      const callRe = new RegExp(String.raw`(?<![\w.$])` + name + ARG, 'g');
      for (const m of code.matchAll(callRe)) {
        const lit = literalKey(m);
        const shown = `${name}("${lit.key}")`;
        if ([...namespaces].some((ns) => resolves(ns, lit))) checked++;
        else problems.push(`${rel}: ${shown} — ${lit.dynamic ? 'no such namespace' : 'no such key'} under useTranslations(${[...namespaces].map((n) => `"${n}"`).join(' | ')})`);
      }
    }

    const translateRe = new RegExp(String.raw`(?<![\w.$])translate` + ARG, 'g');
    for (const m of code.matchAll(translateRe)) {
      const lit = literalKey(m);
      if (resolves('', lit)) checked++;
      else problems.push(`${rel}: translate("${lit.key}") — ${lit.dynamic ? 'no such namespace' : 'no such key'}`);
    }
  }
  return { problems, checked };
}







// -----------------------------------------------------------
// main
// -----------------------------------------------------------
//
// The four checks in order; prints every problem and exits 1
// if there was any.
//
// Used by:
//   - package.json — the lint, build and check:messages scripts
// -----------------------------------------------------------

function main() {
  const trees = loadTrees();
  const flat = Object.fromEntries(LOCALES.map((l) => [l, leaves(trees[l])]));
  const problems = [];

  for (const locale of LOCALES.filter((l) => l !== BASE)) {
    for (const key of Object.keys(flat[BASE])) {
      if (!(key in flat[locale])) problems.push(`missing in ${locale}: ${key}`);
    }
    for (const key of Object.keys(flat[locale])) {
      if (!(key in flat[BASE])) problems.push(`missing in ${BASE}: ${key} (present in ${locale})`);
    }
    for (const [key, value] of Object.entries(flat[BASE])) {
      const other = flat[locale][key];
      if (other === undefined || typeof value !== 'string' || typeof other !== 'string') continue;
      if (placeholders(value) !== placeholders(other)) {
        problems.push(`placeholders differ: ${key} — ${BASE} {${placeholders(value)}} vs ${locale} {${placeholders(other)}}`);
      }
      if (value === other && /\p{L}/u.test(value.replace(/\{\w+\}/g, '')) && !IDENTICAL_OK.has(value)) {
        problems.push(`untranslated in ${locale}: ${key} = ${JSON.stringify(value)}`);
      }
    }
  }

  const usage = scanUsages(trees[BASE]);
  problems.push(...usage.problems);

  if (problems.length) {
    console.error(`check-messages: ${problems.length} problem(s)`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log(`check-messages: ok — ${Object.keys(flat[BASE]).length} keys in ${LOCALES.join('/')}, ${usage.checked} translation calls verified`);
}

main();
