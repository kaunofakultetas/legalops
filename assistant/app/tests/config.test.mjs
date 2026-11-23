// -----------------------------------------------------------
//  [*] Tests — configuration (config.js)
//
//  config.js reads the environment once, when first imported,
//  so each case loads a fresh copy under a crafted environment
//  (a cache-busting query string — config.js imports nothing,
//  so every copy stands alone). Child processes check what a
//  real process sees: one read, used by the providers and the
//  turn limiter.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";

import { runNode } from "./helpers/process.mjs";


// Every environment variable config.js reads
const VARIABLES = [
  "PORT", "DJANGO_URL", "ASSISTANT_INTERNAL_SECRET", "AI_GATEWAY_URL", "AI_GATEWAY_KEY", "AI_CHAT_MODEL",
  "AI_EMBED_MODEL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OLLAMA_BASE_URL", "CHAT_TIMEOUT_MS",
  "CHAT_STEP_TIMEOUT_MS", "CHAT_CHUNK_TIMEOUT_MS", "GENERATE_TIMEOUT_MS", "EMBED_TIMEOUT_MS", "RATE_LIMIT_TURNS",
  "IDENTITY_CACHE_MS", "SHUTDOWN_GRACE_MS",
];

// What config.js exports with an empty environment
const DEFAULTS = {
  PORT: 3000,
  DJANGO_URL: "http://legalops-django:8000",
  INTERNAL_SECRET: "",
  AI_GATEWAY_URL: "https://ai.knf.vu.lt/v1",
  AI_GATEWAY_KEY: "",
  AI_CHAT_MODEL: "gateway:azure/gpt-5.5",
  AI_EMBED_MODEL: "gateway:azure/text-embedding-3-large",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  OLLAMA_BASE_URL: "",
  CHAT_TIMEOUT_MS: 900_000,
  CHAT_STEP_TIMEOUT_MS: 300_000,
  CHAT_CHUNK_TIMEOUT_MS: 90_000,
  GENERATE_TIMEOUT_MS: 900_000,
  EMBED_TIMEOUT_MS: 60_000,
  MAX_STEPS: 24,
  MAX_MESSAGE_CHARS: 60_000,
  MAX_REQUEST_BYTES: "512kb",
  MAX_HISTORY_MESSAGES: 200,
  MAX_HISTORY_CHARS: 400_000,
  TITLE_TIMEOUT_MS: 8_000,
  TITLE_INPUT_CHARS: 2_000,
  RATE_LIMIT_TURNS: 12,
  RATE_LIMIT_WINDOW_MS: 60_000,
  IDENTITY_CACHE_MS: 15_000,
  SHUTDOWN_GRACE_MS: 190_000,
};

// The numeric variables, with the smallest value each accepts
const NUMERIC = {
  PORT: 1, CHAT_TIMEOUT_MS: 1, CHAT_STEP_TIMEOUT_MS: 1, CHAT_CHUNK_TIMEOUT_MS: 1, GENERATE_TIMEOUT_MS: 1,
  EMBED_TIMEOUT_MS: 1, RATE_LIMIT_TURNS: 1, IDENTITY_CACHE_MS: 0, SHUTDOWN_GRACE_MS: 0,
};

// Values no numeric setting accepts
const GARBAGE = ["abc", "3m", "-1", "1.5", "1e3", "180_000", "0x10", "Infinity", "NaN", "12 34", "+5"];

// How many copies of config.js have been loaded; each one's
// number is its cache-busting query string
let loads = 0;







// -----------------------------------------------------------
// loadConfig
// -----------------------------------------------------------
//
// Loads a fresh config.js with only `env` set among the
// variables it reads, and returns its exports and the warnings
// it printed (captured, not shown). This process's environment
// is restored afterwards.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function loadConfig(t, env = {}) {
  const saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of VARIABLES) delete process.env[name];
  Object.assign(process.env, env);
  const warn = t.mock.method(console, "warn", () => {});
  try {
    loads += 1;
    const config = { ...(await import(`../config.js?case=${loads}`)) };
    return { config, warnings: warn.mock.calls.map((call) => call.arguments.join(" ")) };
  } finally {
    warn.mock.restore();
    for (const name of VARIABLES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}


test("an empty environment gives every documented default, silently; the export list is exact", async (t) => {
  const { config, warnings } = await loadConfig(t);
  assert.deepEqual(config, DEFAULTS);
  assert.deepEqual(warnings, []);
});


test("every variable is read when valid (surrounding spaces trimmed from numbers and URLs)", async (t) => {
  const { config, warnings } = await loadConfig(t, {
    PORT: " 8080 ", DJANGO_URL: "http://django:9000", ASSISTANT_INTERNAL_SECRET: "sek", AI_GATEWAY_URL: "http://gw/v2",
    AI_GATEWAY_KEY: "gk", AI_CHAT_MODEL: "openai:gpt-4.1", AI_EMBED_MODEL: "ollama:nomic", ANTHROPIC_API_KEY: "ak",
    OPENAI_API_KEY: "ok", OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1", CHAT_TIMEOUT_MS: "1000", CHAT_STEP_TIMEOUT_MS: "900",
    CHAT_CHUNK_TIMEOUT_MS: "800", GENERATE_TIMEOUT_MS: "0042", EMBED_TIMEOUT_MS: "700", RATE_LIMIT_TURNS: "3",
    IDENTITY_CACHE_MS: "0", SHUTDOWN_GRACE_MS: "0",
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(config, {
    ...DEFAULTS, PORT: 8080, DJANGO_URL: "http://django:9000", INTERNAL_SECRET: "sek", AI_GATEWAY_URL: "http://gw/v2",
    AI_GATEWAY_KEY: "gk", AI_CHAT_MODEL: "openai:gpt-4.1", AI_EMBED_MODEL: "ollama:nomic", ANTHROPIC_API_KEY: "ak",
    OPENAI_API_KEY: "ok", OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1", CHAT_TIMEOUT_MS: 1000, CHAT_STEP_TIMEOUT_MS: 900,
    CHAT_CHUNK_TIMEOUT_MS: 800, GENERATE_TIMEOUT_MS: 42, EMBED_TIMEOUT_MS: 700, RATE_LIMIT_TURNS: 3, IDENTITY_CACHE_MS: 0,
    SHUTDOWN_GRACE_MS: 0,
  });
});


test("blank values are the default, without a warning — a whitespace-only key or secret is no key", async (t) => {
  for (const blank of ["", "   ", "\t \n"]) {
    const { config, warnings } = await loadConfig(t, Object.fromEntries(VARIABLES.map((name) => [name, blank])));
    assert.deepEqual(warnings, [], JSON.stringify(blank));
    assert.deepEqual(config, DEFAULTS, JSON.stringify(blank));
  }
});


test("a number that is not a plain integer falls back to its default, with a warning naming the variable", async (t) => {
  for (const [name] of Object.entries(NUMERIC)) {
    for (const value of GARBAGE) {
      const { config, warnings } = await loadConfig(t, { [name]: value });
      assert.equal(config[name], DEFAULTS[name], `${name}=${value}`);
      assert.equal(warnings.length, 1, `${name}=${value} warned once`);
      assert.ok(warnings[0].startsWith(`${name}=${JSON.stringify(value)} is not an integer`), warnings[0]);
      assert.match(warnings[0], new RegExp(`using ${DEFAULTS[name]}$`));
    }
  }
});


test("out-of-range numbers fall back too; the boundaries themselves are accepted", async (t) => {
  const cases = [
    ["PORT", "0", 3000], ["PORT", "65536", 3000], ["PORT", "1", 1], ["PORT", "65535", 65_535],
    ["CHAT_TIMEOUT_MS", "0", 900_000], ["CHAT_STEP_TIMEOUT_MS", "0", 300_000], ["CHAT_CHUNK_TIMEOUT_MS", "0", 90_000],
    ["GENERATE_TIMEOUT_MS", "0", 900_000], ["EMBED_TIMEOUT_MS", "0", 60_000], ["RATE_LIMIT_TURNS", "0", 12],
    ["RATE_LIMIT_TURNS", "1", 1],
    ["CHAT_TIMEOUT_MS", "2147483647", 2_147_483_647], ["CHAT_TIMEOUT_MS", "2147483648", 900_000],
    ["SHUTDOWN_GRACE_MS", "2147483648", 190_000], ["IDENTITY_CACHE_MS", "9007199254740993", 15_000],
    ["IDENTITY_CACHE_MS", "0", 0], ["SHUTDOWN_GRACE_MS", "0", 0],
  ];
  for (const [name, value, expected] of cases) {
    const { config, warnings } = await loadConfig(t, { [name]: value });
    assert.equal(config[name], expected, `${name}=${value}`);
    assert.equal(warnings.length, expected === DEFAULTS[name] && value !== String(DEFAULTS[name]) ? 1 : 0, `${name}=${value}`);
  }
});


test("every accepted timeout is usable by the timers the routes build from it", async (t) => {
  for (const value of ["1", "2147483647", "3m", "0", "-5", "NaN"]) {
    const { config } = await loadConfig(t, {
      CHAT_TIMEOUT_MS: value, CHAT_STEP_TIMEOUT_MS: value, CHAT_CHUNK_TIMEOUT_MS: value, GENERATE_TIMEOUT_MS: value,
      EMBED_TIMEOUT_MS: value,
    });
    for (const name of ["CHAT_TIMEOUT_MS", "CHAT_STEP_TIMEOUT_MS", "CHAT_CHUNK_TIMEOUT_MS", "GENERATE_TIMEOUT_MS", "EMBED_TIMEOUT_MS"]) {
      assert.doesNotThrow(() => AbortSignal.timeout(config[name]), `${name}=${value} → ${config[name]}`);
      assert.ok(config[name] > 0, "a zero timeout would abort every call at once");
    }
  }
});


test("a warning shows at most 40 characters of the bad value", async (t) => {
  const { warnings } = await loadConfig(t, { CHAT_TIMEOUT_MS: `${"9".repeat(30)}x${"y".repeat(70)}` });
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes("y".repeat(20)), warnings[0]);
});


test("base URLs lose their trailing slashes; other strings are taken as they are", async (t) => {
  const { config } = await loadConfig(t, {
    DJANGO_URL: " http://django:8000/// ", AI_GATEWAY_URL: "https://ai.knf.vu.lt/v1/", OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1/",
    AI_CHAT_MODEL: "gateway:azure/gpt-5.5/", AI_GATEWAY_KEY: " key-with-spaces ",
  });
  assert.equal(config.DJANGO_URL, "http://django:8000");
  assert.equal(config.AI_GATEWAY_URL, "https://ai.knf.vu.lt/v1");
  assert.equal(config.OLLAMA_BASE_URL, "http://10.0.0.5:11434/v1");
  assert.equal(config.AI_CHAT_MODEL, "gateway:azure/gpt-5.5/", "a model id is not a URL");
  assert.equal(config.AI_GATEWAY_KEY, " key-with-spaces ", "keys are never rewritten");
});


test("secrets fail closed: unset, empty or blank is empty; a real one is kept byte for byte and never printed", async (t) => {
  assert.equal((await loadConfig(t, {})).config.INTERNAL_SECRET, "");
  assert.equal((await loadConfig(t, { ASSISTANT_INTERNAL_SECRET: "" })).config.INTERNAL_SECRET, "");
  assert.equal((await loadConfig(t, { ASSISTANT_INTERNAL_SECRET: "   " })).config.INTERNAL_SECRET, "", "blank = unset");
  const spaced = await loadConfig(t, { ASSISTANT_INTERNAL_SECRET: "  s3cret  ", AI_GATEWAY_KEY: "gw-key" });
  assert.equal(spaced.config.INTERNAL_SECRET, "  s3cret  ", "the secret is compared exactly as Django compares it");
  assert.deepEqual(spaced.warnings, [], "no secret is ever echoed in a warning");

  const probe = `
    const { configuredProviders, isModelConfigured } = await import("./llm/provider.js");
    console.log(JSON.stringify({ configured: isModelConfigured(), providers: configuredProviders() }));
  `;
  for (const env of [{}, { AI_GATEWAY_KEY: "  ", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "\t", OLLAMA_BASE_URL: " " }]) {
    const run = await runNode(probe, { env });
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), { configured: false, providers: [] },
                     `no key → no provider, chat answers 503 (${JSON.stringify(env)})`);
  }
});


test("a process reads its environment once: the real config.js, later changes ignored, one module instance", async () => {
  const run = await runNode(`
    const first = await import("./config.js");
    process.env.PORT = "9999";
    process.env.RATE_LIMIT_TURNS = "99";
    const second = await import("./config.js");
    console.log(JSON.stringify({ same: first === second, port: second.PORT, turns: second.RATE_LIMIT_TURNS }));
  `, { env: { PORT: "abc", RATE_LIMIT_TURNS: "5" } });
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { same: true, port: 3000, turns: 5 });
  assert.match(run.stderr, /PORT="abc" is not an integer from 1 to 65535 — using 3000/);
});


test("a typo in RATE_LIMIT_TURNS no longer switches the turn limit off", async () => {
  const run = await runNode(`
    const { checkTurnLimit } = await import("./services/ratelimit.js");
    let admitted = 0;
    for (let turn = 0; turn < 40; turn += 1) {
      try { checkTurnLimit("user:typo"); admitted += 1; } catch (err) { if (err.status !== 429) throw err; }
    }
    console.log(admitted);
  `, { env: { RATE_LIMIT_TURNS: "twelve" } });
  assert.equal(run.code, 0, run.stderr);
  assert.equal(Number(run.stdout), 12, "the default limit holds");
});
