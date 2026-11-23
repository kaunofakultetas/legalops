// -----------------------------------------------------------
//  [*] Tests — structural rules of the SPA
//
//  Rules about the code base as a whole rather than one
//  component:
//    - the translation files pass the build guard
//      (scripts/check-messages.js, the same check the image
//      build runs);
//    - every backend call in src/ has a handler in the test
//      double (tests/support/backend/handlers.js), so the
//      double never falls behind the frontend — direct
//      api.<method>() calls, the path constants they are
//      built from, the queued-job URLs, the downloads and the
//      chat's fetch transport;
//    - only the login page calls axios directly, and every
//      toast goes through utils/toast (each shown as long as
//      it takes to read);
//    - the route table titles every page with a real message
//      in both languages, and its admin-only routes are the
//      ones the sidebar hides from a plain user;
//    - every source and test file opens with the house
//      banner, and every page folder has a page test.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defaultHandlers } from '../support/backend/handlers';
import { messagesMap } from '@/messages';


const APP_ROOT = process.cwd();
const SRC = join(APP_ROOT, 'src');
const TESTS = join(APP_ROOT, 'tests');


const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

const sourceFiles = () => walk(SRC).filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.includes('/messages/'));

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const resolveKey = (tree, key) => key.split('.').reduce((node, part) => node?.[part], tree);







// -----------------------------------------------------------
// readLiteral
// -----------------------------------------------------------
//
// The string literal starting at code[i] — '…', "…" or a
// template — as an endpoint path: every ${…} (nested
// templates and braces inside it included) becomes ":param",
// unless it is a bare name of a path constant of the file,
// which is spelled out. Answers { path, end } or null.
// -----------------------------------------------------------

function readLiteral(code, i, constants = {}) {
  const quote = code[i];
  if (quote === '"' || quote === "'") {
    const end = code.indexOf(quote, i + 1);
    return end < 0 ? null : { path: code.slice(i + 1, end), end: end + 1 };
  }
  if (quote !== '`') return null;

  let j = i + 1;
  let path = '';
  while (j < code.length && code[j] !== '`') {
    if (code[j] === '\\') {
      path += code.slice(j, j + 2);
      j += 2;
    } else if (code[j] === '$' && code[j + 1] === '{') {
      let k = j + 2;
      let depth = 1;
      while (k < code.length && depth > 0) {
        const c = code[k];
        if (c === '`') { k = readLiteral(code, k)?.end ?? code.length; continue; }
        if (c === '"' || c === "'") { k = code.indexOf(c, k + 1) + 1 || code.length; continue; }
        if (c === '{') depth += 1;
        if (c === '}') depth -= 1;
        k += 1;
      }
      const expression = code.slice(j + 2, k - 1).trim();
      path += /^\w+$/.test(expression) && constants[expression] ? constants[expression] : ':param';
      j = k;
    } else {
      path += code[j];
      j += 1;
    }
  }
  return { path, end: j + 1 };
}







// -----------------------------------------------------------
// backendCalls
// -----------------------------------------------------------
//
// Every endpoint src/ reaches, as { method, path, prefix,
// file } with template expressions turned into ":param" and
// the query string dropped. Besides the literal first
// argument of api.<method>() / axios.<method>() it follows:
//
//   - a path constant of the same file (`const base =
//     \`/api/companies/${id}/roles\``, CHAT_API) used as the
//     argument or inside the template
//   - the queued-job URLs (`url: …` for useQueueJob,
//     `onQueue(…)` in CorpusDocument) — POSTs
//   - downloadFile(…) — a GET
//   - the chat transport (`api: CHAT_API`) — the POST of
//     the streaming chat
//
// A template glued to a segment ("/api/reports${query}")
// stands for that path and anything nested under it
// (`prefix`).
// -----------------------------------------------------------

function backendCalls() {
  const calls = [];
  const add = (method, path, file) => {
    if (!path?.startsWith('/api')) return;
    const bare = path.split('?')[0];
    const glued = bare.match(/^(.*?[^/]):param/);
    calls.push({ method: method.toUpperCase(), path: bare, prefix: glued ? glued[1] : null, file: relative(APP_ROOT, file) });
  };

  for (const file of sourceFiles()) {
    const code = stripComments(readFileSync(file, 'utf8'));

    // Path constants of this file: NAME → its path
    const constants = {};
    for (const m of code.matchAll(/\bconst\s+(\w+)\s*=\s*(?=["'`])/g)) {
      const literal = readLiteral(code, m.index + m[0].length);
      if (literal?.path.startsWith('/api')) constants[m[1]] = literal.path;
    }

    // `head` matched up to the argument; the argument is a
    // literal or a constant's name
    const scan = (re, methodOf) => {
      for (const m of code.matchAll(re)) {
        const at = m.index + m[0].length;
        const literal = readLiteral(code, at, constants);
        if (literal) {
          add(methodOf(m), literal.path, file);
          continue;
        }
        const name = code.slice(at).match(/^([A-Za-z_]\w*)\s*[,)]/)?.[1];
        if (name && constants[name]) {
          add(methodOf(m), constants[name], file);
          continue;
        }
        // An expression (`cond ? '/api/a' : '/api/b'`): every
        // path literal in it, up to the end of the argument
        const expression = code.slice(at, at + 400).split(/[,})](?=(?:[^'"`]*['"`][^'"`]*['"`])*[^'"`]*$)/)[0];
        for (const lit of expression.matchAll(/(['"`])(\/api[^'"`]*)\1/g)) add(methodOf(m), lit[2], file);
      }
    };
    scan(/\b(?:api|axios)\.(get|post|put|delete|patch)\(\s*/g, (m) => m[1]);
    scan(/\b(?:url:|onQueue\()\s*/g, () => 'post');
    scan(/\bdownloadFile\(\s*/g, () => 'get');
    for (const m of code.matchAll(/\bapi:\s*([A-Za-z_]\w*)/g)) {
      if (constants[m[1]]) add('post', constants[m[1]], file);
    }
  }
  return calls;
}

// A handler path like http://localhost:3000/api/users/:id,
// compared segment-wise; a :param on either side matches
// anything; a glued call matches its prefix path and below
const handlerMatches = (handler, call) => {
  const info = handler.info;
  if (info.method.toUpperCase() !== call.method) return false;
  const handlerPath = String(info.path).replace(/^https?:\/\/[^/]+/, '');
  if (call.prefix) return handlerPath === call.prefix || handlerPath.startsWith(`${call.prefix}/`);
  const hs = handlerPath.split('/');
  const cs = call.path.split('/');
  if (hs.length !== cs.length) return false;
  return hs.every((seg, i) => seg.startsWith(':') || cs[i].startsWith(':') || seg === cs[i]);
};







// -----------------------------------------------------------
// the rules
// -----------------------------------------------------------

describe('structural rules', () => {

  it('the translation files pass scripts/check-messages.js', () => {
    const out = execFileSync('node', [join(APP_ROOT, 'scripts', 'check-messages.js')], { encoding: 'utf8' });
    expect(out).toMatch(/^check-messages: ok/);
  });


  it('every backend call in src/ has a handler in the test double', () => {
    const calls = backendCalls();
    expect(calls.length).toBeGreaterThan(90);
    const unhandled = calls.filter((call) => !defaultHandlers.some((h) => handlerMatches(h, call)));
    expect(unhandled.map((c) => `${c.method} ${c.path} (${c.file})`)).toEqual([]);
  });


  it('the call scan follows the indirect paths too (constants, queued jobs, downloads, the chat stream)', () => {
    const seen = backendCalls().map((c) => `${c.method} ${c.path}`);
    const expected = [
      'PATCH /api/companies/:param/credentials/:param',
      'POST /api/companies/:param/roles',
      'POST /api/corpus/documents/:param/refresh',
      'POST /api/corpus/refresh-all',
      'GET /api/reports/:param/export',
      'GET /api/companies/:param/actions/export',
      'GET /api/companies/:param/actions',
      'GET /api/companies/:param/law-changes',
      'PATCH /api/actions/:param',
      'POST /api/assistant/chat',
      'POST /api/assistant/chat/:param/stop',
    ];
    expect(expected.filter((call) => !seen.includes(call))).toEqual([]);
  });


  it('only the login page calls axios directly — every other request goes through the shared client', () => {
    // A wrong password is a 401 there, which must not trip the
    // client's session-expired redirect
    const rawAxiosFiles = sourceFiles()
      .filter((f) => /\baxios\.(get|post|put|delete|patch|request)\(/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(APP_ROOT, f)).sort();
    expect(rawAxiosFiles).toEqual(['src/pages/Login/Login.jsx']);
  });


  it('every toast goes through utils/toast — react-hot-toast is imported only there and for the Toaster', () => {
    const importers = sourceFiles()
      .filter((f) => /from\s+['"]react-hot-toast['"]/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(APP_ROOT, f)).sort();
    expect(importers).toEqual(['src/providers.jsx', 'src/utils/toast.js']);
  });


  it('every route is titled by a message that exists in both languages', async () => {
    const { router } = await import('@/router');
    const children = router.routes[0].children;
    expect(children.length).toBeGreaterThan(15);
    for (const route of children) {
      const key = route.handle?.title;
      expect(key, `route ${route.path ?? '(index)'} has a title key`).toBeTruthy();
      for (const locale of ['lt', 'en']) {
        expect(typeof resolveKey(messagesMap[locale], key), `${locale}: ${key}`).toBe('string');
      }
    }
  });


  it('the admin-only routes are exactly the pages the sidebar keeps from a plain user', async () => {
    const { router } = await import('@/router');
    const adminOnly = [];
    for (const route of router.routes[0].children) {
      // A route the module-level browser router already loaded
      // carries its element instead of `lazy`
      const { element } = route.lazy ? await route.lazy() : route;
      if (element?.props?.adminOnly) adminOnly.push(route.path);
    }
    expect(adminOnly.sort()).toEqual(['audit', 'obligations', 'prompts', 'prompts/:slug', 'settings/mcp', 'users']);
  });


  it('every source and test file opens with the house banner', () => {
    const files = [...sourceFiles(), ...walk(TESTS).filter((f) => /\.(jsx?|mjs)$/.test(f)), join(APP_ROOT, 'scripts', 'check-messages.js')];
    const bare = files.filter((f) => !readFileSync(f, 'utf8').startsWith('// ---')).map((f) => relative(APP_ROOT, f));
    expect(bare).toEqual([]);
  });


  it('every page folder has a page test', () => {
    const pages = readdirSync(join(SRC, 'pages')).filter((name) => statSync(join(SRC, 'pages', name)).isDirectory());
    const missing = pages.filter((name) => !existsSync(join(TESTS, 'pages', `${name.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase())}.test.jsx`)));
    expect(missing).toEqual([]);
  });
});
