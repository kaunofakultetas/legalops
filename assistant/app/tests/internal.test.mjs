// -----------------------------------------------------------
//  [*] Tests — the internal doors (/internal/llm, /internal/mcp)
//
//  The real app on a random port, with mock models and a
//  local stand-in for the gateway's model list. /generate reads
//  its model as a stream, so the mocks answer in stream parts.
//  The worker's
//  side of the contract is Django's assistant/gateway.py: it
//  reads a refusal's message and error code and retries only
//  transient statuses, so each failure's status is pinned.
//  internal-mcp.test.mjs covers the MCP door in full.
//
//  Defects guarded here:
//
//    ASSISTANT-ROUTES-5  — a gateway error emptied the model list
//    ASSISTANT-ROUTES-8  — a schema-forced answer went unchecked
//    ASSISTANT-ROUTES-9  — the JSON parser ran before the gate
//    ASSISTANT-ROUTES-10 — a quota 429 was retried
//    ASSISTANT-ROUTES-11 — a call without a model went unpriced
// -----------------------------------------------------------

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import "./env.mjs";
import { APICallError, simulateReadableStream } from "ai";
import { MockEmbeddingModelV4, MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";


// The generate ceiling this file runs with (config.js loads
// in before(), after this line)
const GENERATE_TIMEOUT_MS = 400;
process.env.GENERATE_TIMEOUT_MS = String(GENERATE_TIMEOUT_MS);

// The gateway's /models answer (OpenAI list format with
// Bifrost's extra fields), in its own order: `created` in
// seconds, two models of one date, one model without a date
const GATEWAY_MODELS = { data: [
  { id: "azure/gpt-5.5", normalized_name: "GPT-5.5", created: 1776816000, context_length: 400_000, max_output_tokens: 128_000,
    pricing: { prompt: "0.000005", completion: "0.00003", input_cache_read: "0.0000005" } },
  { id: "azure/text-embedding-3-small", created: 1706140800, pricing: { prompt: "0.00000002", completion: "0" } },
  { id: "azure/gpt-5.6-luna", created: 1783555200,
    pricing: { prompt: "abc", input_cache_read: "0.00000002", input_cache_write: "0.00000025" } },
  { id: "azure/unpriced" },
  { id: "azure/gpt-5.6-sol", created: 1783555200 },
] };

// The strict schema the object tests force
const SCHEMA = { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false };

// Set up in before(): the app, the gateway stand-in, the
// default mock models and the provider's model switch
let base;
let server;
let setModelForTests;
let generateModel;
let embeddingModel;
let gateway;







// -----------------------------------------------------------
// call
// -----------------------------------------------------------
//
// One JSON request to the app, returning its status and
// parsed body. It carries the shared secret unless a test
// passes another or none, and POSTs unless told otherwise.
//
// Used by:
//   - the tests (below)
// -----------------------------------------------------------

async function call(path, body, secret = "s3cret", method = "POST") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(secret ? { "X-Internal-Secret": secret } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}







// -----------------------------------------------------------
// startGateway
// -----------------------------------------------------------
//
// A stand-in for the gateway's model list on a random local
// port. It answers whatever a test sets as its answer — a
// status with a JSON body, or "hangup", which drops the
// connection — and records each request's path and the two
// headers that carry the key.
//
// Used by:
//   - before (below)
// -----------------------------------------------------------

async function startGateway() {
  const state = { answer: { status: 200, json: GATEWAY_MODELS }, requests: [] };
  const listener = http.createServer((req, res) => {
    state.requests.push({ path: req.url, vk: req.headers["x-bf-vk"] ?? null, auth: req.headers.authorization ?? null });
    if (state.answer === "hangup") {
      req.socket.destroy();
      return;
    }
    res.writeHead(state.answer.status, { "Content-Type": "application/json" }).end(JSON.stringify(state.answer.json));
  });
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${listener.address().port}/v1`;
  state.close = () => {
    listener.closeAllConnections();
    return new Promise((resolve) => listener.close(resolve));
  };
  return state;
}







// -----------------------------------------------------------
// answerParts
// -----------------------------------------------------------
//
// The stream parts of one answer: the text in two deltas (no
// text part at all for an empty text), then the finish with
// its reason and usage.
//
// Used by:
//   - generating, before (below)
//   - the broken stream test (below) — the parts before the
//     failure
// -----------------------------------------------------------

function answerParts(text, { finish = "stop", usage } = {}) {
  const half = Math.ceil(text.length / 2);
  return [
    { type: "stream-start", warnings: [] },
    ...(text ? [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: text.slice(0, half) },
      { type: "text-delta", id: "t1", delta: text.slice(half) },
      { type: "text-end", id: "t1" },
    ] : []),
    { type: "finish", finishReason: { unified: finish, raw: finish },
      usage: usage ?? { inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 2, reasoning: 1 } } },
  ];
}







// -----------------------------------------------------------
// generating
// -----------------------------------------------------------
//
// A mock language model for /generate that streams the given
// text, or what a function of the call's options picks, with
// the finish reason and usage a test sets; it records its
// calls.
//
// Used by:
//   - the /generate tests (below)
// -----------------------------------------------------------

function generating(text, options = {}) {
  return new MockLanguageModelV4({
    doStream: async (call) => ({
      stream: convertArrayToReadableStream(answerParts(typeof text === "function" ? text(call) : text, options)),
    }),
  });
}







// -----------------------------------------------------------
// failing
// -----------------------------------------------------------
//
// A mock language model whose every attempt throws a fresh
// error from the given factory; its recorded calls count the
// SDK's retries.
//
// Used by:
//   - the provider failure and quota tests (below)
// -----------------------------------------------------------

function failing(makeError) {
  return new MockLanguageModelV4({ doStream: async () => { throw makeError(); } });
}







// -----------------------------------------------------------
// providerError
// -----------------------------------------------------------
//
// An APICallError as a provider SDK throws it; a retryable
// one carries retry-after-ms so the SDK's backoff takes a
// millisecond, not seconds.
//
// Used by:
//   - the failure tests (below)
// -----------------------------------------------------------

function providerError(statusCode, message, retryable = false) {
  return new APICallError({
    message, url: "http://gateway/v1/chat/completions", requestBodyValues: {}, statusCode, isRetryable: retryable,
    responseHeaders: retryable ? { "retry-after-ms": "1" } : undefined, responseBody: JSON.stringify({ error: { message } }),
  });
}


before(async () => {
  gateway = await startGateway();
  process.env.AI_GATEWAY_URL = gateway.url;
  ({ setModelForTests } = await import("../llm/provider.js"));
  generateModel = generating((options) => (options.responseFormat?.type === "json" ? '{"answer":42}' : "Sugeneruota"));
  embeddingModel = new MockEmbeddingModelV4({
    doEmbed: async ({ values }) => ({ embeddings: values.map((v) => [v.length, 1, 0]), usage: { tokens: values.length }, warnings: [] }),
  });
  setModelForTests({ language: generateModel, embedding: embeddingModel });
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  setModelForTests({});
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await gateway.close();
});


test("the internal door refuses a missing or wrong secret", async () => {
  assert.equal((await call("/internal/llm/generate", { prompt: "x" }, null)).status, 403);
  const wrong = await call("/internal/llm/generate", { prompt: "x" }, "nope");
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error.code, "INTERNAL_ONLY");
  assert.equal((await call("/internal/mcp/list-tools", { url: "http://x" }, null)).status, 403);
});


test("/generate answers text, or a schema-forced object, with usage", async () => {
  const text = await call("/internal/llm/generate", { prompt: "Sakinys", system: "Be brief", model: "gateway:azure/gpt-5.5" });
  assert.equal(text.status, 200);
  assert.equal(text.body.text, "Sugeneruota");
  assert.equal(text.body.model, "gateway:azure/gpt-5.5");
  assert.deepEqual(text.body.usage, { inputTokens: 7, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 3, reasoningTokens: 1 });
  const sent = generateModel.doStreamCalls.at(-1).prompt;
  assert.deepEqual(sent[0], { role: "system", content: "Be brief" }, "system → instructions reaches the model");

  const object = await call("/internal/llm/generate", {
    prompt: "Kiek?", schema: { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false },
  });
  assert.equal(object.status, 200);
  assert.deepEqual(object.body.object, { answer: 42 });
  assert.equal(object.body.text, null);
});


test("/generate places a step's shared data behind the instructions — the one part of a request the provider caches", async () => {
  const instructions = () => generateModel.doStreamCalls.at(-1).prompt[0];
  const asked = () => generateModel.doStreamCalls.at(-1).prompt.at(-1).content.map((part) => part.text).join("");
  await call("/internal/llm/generate", { prompt: "ACT: MiCA", system: "Assess the obligations.", shared: "COMPANY\nUAB Kripto\n\nDOCUMENTS\n<document ref=\"D1\">" });
  assert.deepEqual(instructions(), { role: "system", content: "Assess the obligations.\n\nCOMPANY\nUAB Kripto\n\nDOCUMENTS\n<document ref=\"D1\">" });
  assert.equal(asked(), "ACT: MiCA", "the part that differs from call to call stays the message");
  await call("/internal/llm/generate", { prompt: "ACT: DORA", shared: "COMPANY\nUAB Kripto" });
  assert.deepEqual(instructions(), { role: "system", content: "COMPANY\nUAB Kripto" }, "shared data alone is the instructions");
  await call("/internal/llm/generate", { prompt: "ACT: DORA", system: "Assess.", shared: "" });
  assert.deepEqual(instructions(), { role: "system", content: "Assess." });
  const refused = await call("/internal/llm/generate", { prompt: "x", shared: ["COMPANY"] });
  assert.deepEqual([refused.status, refused.body.error.code], [400, "INVALID_SHARED"]);
});


test("a provider's rate limit is a 429 the worker waits out — also one reported inside the stream — with the wait the provider names", async () => {
  // Azure's token rate limit under a report's large calls, as it
  // arrived on 2026-11-10: an error event in a stream that had
  // begun, which the SDK hands on without a status
  const inStream = new Error('Type validation failed: Value: {"type":"error","error":{"type":"too_many_requests","code":"rate_limit_exceeded",'
    + '"message":"Your requests to gpt-6.1-sol for gpt-6.1-sol in swedencentral have exceeded token rate limit."}}');
  const worded = "Your requests have exceeded the call rate limit for your current OpenAI S0 pricing tier. Please retry after 22 seconds.";
  const withHeader = new APICallError({ message: "Rate limit reached for requests", url: "u", requestBodyValues: {}, statusCode: 429,
                                        isRetryable: false, responseHeaders: { "retry-after": "7" } });
  const cases = [
    [() => ({ stream: convertArrayToReadableStream([{ type: "stream-start", warnings: [] }, { type: "error", error: inStream }]) }), 429, undefined],
    [() => { throw providerError(429, worded); }, 429, 22],
    [() => { throw withHeader; }, 429, 7],
    [() => { throw providerError(429, "Rate limit reached for requests"); }, 429, undefined],
    // Neither a spent quota nor an outage is a pause to sit out
    [() => { throw providerError(429, "You exceeded your current quota, please check your plan and billing details"); }, 402, undefined],
    [() => { throw providerError(503, "Service Unavailable"); }, 503, undefined],
  ];
  try {
    for (const [doStream, status, retryAfterS] of cases) {
      setModelForTests({ language: new MockLanguageModelV4({ doStream: async () => doStream() }), embedding: embeddingModel });
      const answer = await call("/internal/llm/generate", { prompt: "x" });
      assert.deepEqual([answer.status, answer.body.error.retryAfterS], [status, retryAfterS], answer.body.message);
    }
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("/generate validates its body", async () => {
  assert.equal((await call("/internal/llm/generate", {})).body.error.code, "INVALID_PROMPT");
  assert.equal((await call("/internal/llm/generate", { prompt: "x", temperature: 9 })).body.error.code, "INVALID_TEMPERATURE");
  assert.equal((await call("/internal/llm/generate", { prompt: "x", schema: [1] })).body.error.code, "INVALID_SCHEMA");
  assert.equal((await call("/internal/llm/generate", { prompt: "x", maxOutputTokens: 0 })).body.error.code, "INVALID_MAX_TOKENS");
});


test("/embed answers one vector per text and caps the batch", async () => {
  const answer = await call("/internal/llm/embed", { texts: ["abc", ""] });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.embeddings, [[3, 1, 0], [1, 1, 0]], "an empty text embeds as one space");
  assert.equal(answer.body.dimensions, 3);
  assert.equal((await call("/internal/llm/embed", { texts: [] })).body.error.code, "INVALID_TEXTS");
  assert.equal((await call("/internal/llm/embed", { texts: Array(257).fill("x") })).body.error.code, "TOO_MANY_TEXTS");
});


test("/embed asks a text-embedding-3 model for 1536 dimensions and shortens a longer vector to them, renormalised", async () => {
  const seen = [];
  const wide = new MockEmbeddingModelV4({
    doEmbed: async ({ values, providerOptions }) => {
      seen.push(providerOptions);
      // 3072 wide, the length text-embedding-3-large answers natively
      return { embeddings: values.map(() => [3, 4, ...Array(3070).fill(1)]), usage: { tokens: 1 }, warnings: [] };
    },
  });
  setModelForTests({ language: generateModel, embedding: wide });
  try {
    const answer = await call("/internal/llm/embed", { model: "gateway:azure/text-embedding-3-large", texts: ["a"] });
    assert.equal(answer.status, 200);
    assert.deepEqual(seen.at(-1), { openaiCompatible: { dimensions: 1536 }, openai: { dimensions: 1536 } });
    const [vector] = answer.body.embeddings;
    assert.equal(answer.body.dimensions, 1536);
    assert.equal(vector.length, 1536);
    const norm = Math.hypot(3, 4, ...Array(1534).fill(1));
    assert.ok(Math.abs(vector[0] - 3 / norm) < 1e-12 && Math.abs(vector[1] - 4 / norm) < 1e-12, "the prefix, renormalised");
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-9, "a unit vector, as the provider's own shortening answers");

    // Another family is not asked for a width it may not support
    await call("/internal/llm/embed", { model: "ollama:nomic-embed-text", texts: ["a"] });
    assert.equal(seen.at(-1), undefined);
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("/models lists the configured providers", async () => {
  const answer = await call("/internal/llm/models", undefined, "s3cret", "GET");
  assert.equal(answer.status, 200);
  assert.ok(answer.body.providers.includes("gateway"));
  assert.ok(Array.isArray(answer.body.models));
});


test("/mcp/list-tools validates the server and reports an unreachable one as 502 MCP_UNREACHABLE", async () => {
  assert.equal((await call("/internal/mcp/list-tools", { url: "ftp://x" })).body.error.code, "INVALID_URL");
  assert.equal((await call("/internal/mcp/list-tools", { url: "http://x", transport: "ws" })).body.error.code, "INVALID_TRANSPORT");
  assert.equal((await call("/internal/mcp/list-tools", { url: "http://x", headers: { a: 1 } })).body.error.code, "INVALID_HEADERS");
  const down = await call("/internal/mcp/list-tools", { url: "http://127.0.0.1:9/mcp", transport: "http", headers: { Authorization: "Bearer SECRET-TOKEN" } });
  assert.equal(down.status, 502);
  assert.equal(down.body.error.code, "MCP_UNREACHABLE");
  assert.ok(!JSON.stringify(down.body).includes("SECRET-TOKEN"), "credentials are never echoed");
});


test("a malformed JSON body on the internal door is a 400, not a 500", async () => {
  const response = await fetch(`${base}/internal/llm/generate`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Secret": "s3cret" }, body: "{oops",
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_JSON");
});


test("a spent provider budget is a 402 AI_BUDGET_EXHAUSTED on /generate and /embed", async () => {
  const spent = () => new APICallError({
    message: "Budget exceeded: Team budget exceeded: 10.1796 >= 10.0000 dollars", url: "http://gateway/v1/chat/completions",
    requestBodyValues: {}, statusCode: 402, responseBody: '{"error":{"message":"Budget exceeded"}}',
  });
  setModelForTests({
    language: new MockLanguageModelV4({ doStream: async () => { throw spent(); } }),
    embedding: new MockEmbeddingModelV4({ doEmbed: async () => { throw spent(); } }),
  });
  const generate = await call("/internal/llm/generate", { prompt: "x" });
  assert.equal(generate.status, 402);
  assert.equal(generate.body.error.code, "AI_BUDGET_EXHAUSTED");
  assert.match(generate.body.error.message, /budget is exhausted/);
  const embed = await call("/internal/llm/embed", { texts: ["x"] });
  assert.equal(embed.status, 402);
  assert.equal(embed.body.error.code, "AI_BUDGET_EXHAUSTED");

  const quota429 = new APICallError({ message: "You exceeded your current quota", url: "u", requestBodyValues: {}, statusCode: 429 });
  const rate429 = new APICallError({ message: "Rate limit reached for requests", url: "u", requestBodyValues: {}, statusCode: 429 });
  const { classifyProviderError } = await import("../middleware/errors.js");
  assert.equal(classifyProviderError(quota429).budget, true);
  assert.equal(classifyProviderError(rate429).budget, false, "a plain rate limit is not a budget failure");
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("every internal route demands the secret before reading anything; an empty configured secret refuses all", async () => {
  const before = generateModel.doStreamCalls.length;
  const routes = [
    ["POST", "/internal/llm/generate", { prompt: "x" }], ["POST", "/internal/llm/embed", { texts: ["x"] }],
    ["GET", "/internal/llm/models", undefined], ["POST", "/internal/mcp/list-tools", { url: "http://127.0.0.1:9/mcp" }],
    ["GET", "/internal/llm/nothing-here", undefined],
  ];
  for (const [method, path, body] of routes) {
    for (const secret of [null, "", "S3CRET", "s3cret-", "s3cre", "x".repeat(300)]) {
      const response = await fetch(`${base}${path}`, {
        method, body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "X-Internal-Secret": secret }) },
      });
      const answer = await response.json();
      assert.deepEqual([response.status, answer.error.code], [403, "INTERNAL_ONLY"], `${method} ${path} with ${JSON.stringify(secret)}`);
    }
  }
  assert.equal(generateModel.doStreamCalls.length, before, "no model was called");
  assert.equal((await call("/internal/llm/nothing-here", undefined, "s3cret", "GET")).body.error.code, "NOT_FOUND",
               "past the gate an unknown path is a plain 404");

  const configured = process.env.ASSISTANT_INTERNAL_SECRET;
  process.env.ASSISTANT_INTERNAL_SECRET = "";
  try {
    for (const secret of ["", "s3cret"]) {
      assert.equal((await call("/internal/llm/models", undefined, secret, "GET")).status, 403, `fail closed (${JSON.stringify(secret)})`);
    }
  } finally {
    process.env.ASSISTANT_INTERNAL_SECRET = configured;
  }
});


test("the secret is checked before the body is read: a caller without it learns nothing about its body (ASSISTANT-ROUTES-9, FIXED 2026-09-27 in app.js)", async () => {
  for (const body of ["{not json", JSON.stringify({ prompt: "x".repeat(17 * 1024 * 1024) })]) {
    const response = await fetch(`${base}/internal/llm/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(response.status, 403, `a ${body.length}-byte body without the secret`);
  }
});


test("/generate validates every field and accepts the exact edges; nothing invalid reaches the model", async () => {
  const model = generating("Gerai");
  setModelForTests({ language: model, embedding: embeddingModel });
  const refused = [
    [{}, "INVALID_PROMPT"], [{ prompt: "" }, "INVALID_PROMPT"], [{ prompt: "  \n " }, "INVALID_PROMPT"],
    [{ prompt: 42 }, "INVALID_PROMPT"], [{ prompt: ["x"] }, "INVALID_PROMPT"], [[{ prompt: "x" }], "INVALID_PROMPT"],
    [{ prompt: "x", system: 42 }, "INVALID_SYSTEM"], [{ prompt: "x", system: { text: "x" } }, "INVALID_SYSTEM"],
    [{ prompt: "x", schema: [1] }, "INVALID_SCHEMA"], [{ prompt: "x", schema: "object" }, "INVALID_SCHEMA"],
    [{ prompt: "x", schema: 0 }, "INVALID_SCHEMA"], [{ prompt: "x", schema: true }, "INVALID_SCHEMA"],
    [{ prompt: "x", temperature: -0.1 }, "INVALID_TEMPERATURE"], [{ prompt: "x", temperature: 2.01 }, "INVALID_TEMPERATURE"],
    [{ prompt: "x", temperature: "hot" }, "INVALID_TEMPERATURE"], [{ prompt: "x", temperature: {} }, "INVALID_TEMPERATURE"],
    [{ prompt: "x", maxOutputTokens: 0 }, "INVALID_MAX_TOKENS"], [{ prompt: "x", maxOutputTokens: -5 }, "INVALID_MAX_TOKENS"],
    [{ prompt: "x", maxOutputTokens: 128_001 }, "INVALID_MAX_TOKENS"], [{ prompt: "x", maxOutputTokens: "many" }, "INVALID_MAX_TOKENS"],
    [{ prompt: "x", maxOutputTokens: 0.5 }, "INVALID_MAX_TOKENS"],
  ];
  for (const [body, code] of refused) {
    const answer = await call("/internal/llm/generate", body);
    assert.deepEqual([answer.status, answer.body.error.code], [400, code], JSON.stringify(body));
    assert.equal(typeof answer.body.message, "string", "the worker reads `message`");
  }
  const plain = await fetch(`${base}/internal/llm/generate`, {
    method: "POST", headers: { "Content-Type": "text/plain", "X-Internal-Secret": "s3cret" }, body: '{"prompt":"x"}',
  });
  assert.deepEqual([plain.status, (await plain.json()).error.code], [400, "INVALID_PROMPT"], "an unparsed body is no prompt");
  assert.equal(model.doStreamCalls.length, 0);

  const accepted = [
    [{ prompt: "x", temperature: 0 }, { temperature: 0 }],
    [{ prompt: "x", temperature: 2 }, { temperature: 2 }],
    [{ prompt: "x", temperature: "1.5" }, { temperature: 1.5 }],
    [{ prompt: "x", maxOutputTokens: 1 }, { maxOutputTokens: 1 }],
    [{ prompt: "x", maxOutputTokens: 128_000 }, { maxOutputTokens: 128_000 }],
    [{ prompt: "x", maxOutputTokens: 1.9 }, { maxOutputTokens: 1 }],
    [{ prompt: "x", maxOutputTokens: "64" }, { maxOutputTokens: 64 }],
    [{ prompt: "x", system: "", temperature: null, maxOutputTokens: null }, { temperature: undefined, maxOutputTokens: undefined }],
  ];
  for (const [body, expected] of accepted) {
    const answer = await call("/internal/llm/generate", body);
    assert.equal(answer.status, 200, JSON.stringify(body));
    const options = model.doStreamCalls.at(-1);
    for (const [key, value] of Object.entries(expected)) assert.equal(options[key], value, `${JSON.stringify(body)} → ${key}`);
  }
  assert.equal(model.doStreamCalls.at(-1).prompt.some((m) => m.role === "system"), false, "an empty system is no system message");
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("/generate hands the model the request as is: the instructions, the prompt as one user message, no response format without a schema", async () => {
  const model = generating("Atsakymas");
  setModelForTests({ language: model, embedding: embeddingModel });
  const prompt = "Straipsnis 59: … \n\n Antra pastraipa";
  const answer = await call("/internal/llm/generate", { prompt, system: "Tu esi teisininkas.", temperature: 0.3, maxOutputTokens: 2_000 });
  assert.equal(answer.status, 200);
  const options = model.doStreamCalls[0];
  assert.deepEqual(JSON.parse(JSON.stringify(options.prompt)), [
    { role: "system", content: "Tu esi teisininkas." },
    { role: "user", content: [{ type: "text", text: prompt }] },
  ]);
  assert.equal(options.responseFormat?.type ?? "text", "text");
  assert.equal(options.temperature, 0.3);
  assert.equal(options.maxOutputTokens, 2_000);
  assert.equal(answer.body.object, null);
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("schema-forced output: a strict json response format with the schema and its name; the parsed object answered; unparseable output is 502", async () => {
  const model = generating('{"answer":1}');
  setModelForTests({ language: model, embedding: embeddingModel });
  const object = await call("/internal/llm/generate", { prompt: "Kiek?", schema: SCHEMA, schemaName: "findings" });
  assert.equal(object.status, 200);
  assert.deepEqual([object.body.object, object.body.text], [{ answer: 1 }, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(model.doStreamCalls[0].responseFormat)), { type: "json", schema: SCHEMA, name: "findings" });

  await call("/internal/llm/generate", { prompt: "Kiek?", schema: SCHEMA, schemaName: 42 });
  assert.equal(model.doStreamCalls.at(-1).responseFormat.name, "result", "a missing or odd name is 'result'");
  await call("/internal/llm/generate", { prompt: "Kiek?", schema: SCHEMA, schemaName: "n".repeat(100) });
  assert.equal(model.doStreamCalls.at(-1).responseFormat.name, "n".repeat(64), "a long name is cut to the provider's 64");

  for (const text of ["not json at all", '{"answer": 1', ""]) {
    setModelForTests({ language: generating(text), embedding: embeddingModel });
    const broken = await call("/internal/llm/generate", { prompt: "Kiek?", schema: SCHEMA });
    assert.deepEqual([broken.status, broken.body.error.code], [502, "GENERATION_FAILED"], JSON.stringify(text));
    assert.match(broken.body.message, /^Model call failed: No (object|output) generated/, "the job step says why");
  }
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("a schema-forced answer that does not match its schema never reaches the worker; a schema the check cannot read still runs (ASSISTANT-ROUTES-8, FIXED 2026-09-27)", async () => {
  const drifts = [
    '{"answer":"forty-two"}',
    '{"answer":42,"extra":true}',
    '{"Answer":42}',
    '{}',
    '[42]',
  ];
  try {
    for (const text of drifts) {
      setModelForTests({ language: generating(text), embedding: embeddingModel });
      const drifted = await call("/internal/llm/generate", { prompt: "Kiek?", schema: SCHEMA });
      assert.deepEqual([drifted.status, drifted.body.error?.code], [502, "GENERATION_FAILED"], text);
      assert.match(drifted.body.message, /did not match schema/, "the job step says why");
    }
    const withEnum = { type: "object", additionalProperties: false, required: ["status", "priority"],
                       properties: { status: { type: "string", enum: ["met", "missing"] }, priority: { type: "integer" } } };
    for (const [text, status] of [['{"status":"met","priority":2}', 200], ['{"status":"maybe","priority":2}', 502], ['{"status":"met","priority":2.5}', 502]]) {
      setModelForTests({ language: generating(text), embedding: embeddingModel });
      assert.equal((await call("/internal/llm/generate", { prompt: "x", schema: withEnum })).status, status, text);
    }

    const unreadable = { type: "object", properties: { a: { $ref: "#/definitions/x" } }, definitions: { x: { type: "string" } } };
    setModelForTests({ language: generating('{"a":"anything"}'), embedding: embeddingModel });
    const trusted = await call("/internal/llm/generate", { prompt: "x", schema: unreadable });
    assert.deepEqual([trusted.status, trusted.body.object], [200, { a: "anything" }], "left to the provider's strict mode");
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("usage, finish reason and the model id the worker prices the call by", async () => {
  setModelForTests({ language: generating("x", { finish: "length", usage: {
    inputTokens: { total: 1200, noCache: 100, cacheRead: 900, cacheWrite: 200 }, outputTokens: { total: 300, text: 250, reasoning: 50 },
  } }), embedding: embeddingModel });
  const priced = await call("/internal/llm/generate", { prompt: "x", model: "gateway:azure/gpt-5.5" });
  assert.deepEqual(priced.body.usage, { inputTokens: 1200, cachedInputTokens: 900, cacheWriteTokens: 200, outputTokens: 300, reasoningTokens: 50 },
                   "the input whole, and the parts of it the provider read from its prompt cache and wrote to it");
  assert.equal(priced.body.finishReason, "length");
  assert.ok(Number.isInteger(priced.body.durationMs) && priced.body.durationMs >= 0);

  setModelForTests({ language: generating("x", { usage: { inputTokens: { total: undefined }, outputTokens: { total: undefined } } }), embedding: embeddingModel });
  assert.deepEqual((await call("/internal/llm/generate", { prompt: "x" })).body.usage,
                   { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 },
                   "unreported usage is zeros, never null");

  // With no model in the body the answer names the default it
  // ran on (ASSISTANT-ROUTES-11)
  const echoes = [
    ["gateway:azure/gpt-5.5", "gateway:azure/gpt-5.5"],
    ["azure/gpt-5.6-luna", "gateway:azure/gpt-5.6-luna"],
    ["  ollama:llama3.1:8b  ", "ollama:llama3.1:8b"],
    ["anthropic:claude-sonnet-5", "anthropic:claude-sonnet-5"],
    ["", "gateway:azure/gpt-5.5"],
    [undefined, "gateway:azure/gpt-5.5"],
  ];
  for (const [model, echoed] of echoes) {
    assert.equal((await call("/internal/llm/generate", { prompt: "x", model })).body.model, echoed, JSON.stringify(model));
  }
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("/generate without a model answers the model it ran on — the configured default, never null (ASSISTANT-ROUTES-11, FIXED 2026-09-28)", async () => {
  const { AI_CHAT_MODEL } = await import("../config.js");
  assert.equal(AI_CHAT_MODEL, "gateway:azure/gpt-5.5", "the default this file runs with");
  for (const body of [{ prompt: "x" }, { prompt: "x", model: null }, { prompt: "x", model: "" }, { prompt: "x", model: "   " },
                      { prompt: "x", model: 42 }, { prompt: "x", schema: SCHEMA }]) {
    const answer = await call("/internal/llm/generate", body);
    assert.equal(answer.status, 200, JSON.stringify(body));
    assert.equal(answer.body.model, AI_CHAT_MODEL, `${JSON.stringify(body)}: what the worker records and prices the call by`);
  }
});


test("provider failures keep their status class under GENERATION_FAILED, the cause in the message; 4xx once, 429/5xx retried first", async () => {
  const cases = [
    [() => providerError(400, "Invalid schema for response_format"), 400, "GENERATION_FAILED", 1],
    [() => providerError(401, "Invalid API key"), 401, "GENERATION_FAILED", 1],
    [() => providerError(404, "Unknown model azure/gpt-9"), 404, "GENERATION_FAILED", 1],
    [() => providerError(500, "Internal error", false), 500, "GENERATION_FAILED", 1],
    [() => providerError(503, "Service Unavailable", true), 503, "GENERATION_FAILED", 3],
    [() => providerError(429, "Rate limit reached for requests", true), 429, "GENERATION_FAILED", 3],
    [() => providerError(402, "Budget exceeded: Team budget exceeded"), 402, "AI_BUDGET_EXHAUSTED", 1],
    // A spent quota is asked once, however retryable its
    // status (ASSISTANT-ROUTES-10)
    [() => providerError(429, "You exceeded your current quota, please check your plan and billing details", true), 402, "AI_BUDGET_EXHAUSTED", 1],
    [() => providerError(400, "Your credit balance is too low to access the Anthropic API"), 402, "AI_BUDGET_EXHAUSTED", 1],
    [() => providerError(500, "quota service exceeded its deadline", false), 500, "GENERATION_FAILED", 1],
    [() => new TypeError("fetch failed"), 502, "GENERATION_FAILED", 1],
    [() => "a thrown string", 502, "GENERATION_FAILED", 1],
  ];
  for (const [makeError, status, code, attempts] of cases) {
    const model = failing(makeError);
    setModelForTests({ language: model, embedding: embeddingModel });
    const answer = await call("/internal/llm/generate", { prompt: "x" });
    const label = String(makeError()?.message ?? makeError());
    assert.deepEqual([answer.status, answer.body.error.code], [status, code], label);
    assert.equal(answer.body.message, answer.body.error.message, "the worker reads the top-level message");
    assert.equal(model.doStreamCalls.length, attempts, `${label}: attempts`);
    if (code === "GENERATION_FAILED") assert.match(answer.body.message, /^Model call failed: /);
    assert.ok(answer.body.message.includes(label.slice(0, 20)), `${label}: the cause rides in the message`);
  }
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("a budget or quota refusal is asked ONCE on /generate and /embed; a rate limit is still retried (ASSISTANT-ROUTES-10, FIXED 2026-09-28)", async () => {
  const quota = () => providerError(429, "You exceeded your current quota, please check your plan and billing details", true);
  const rate = () => providerError(429, "Rate limit reached for requests", true);
  try {
    const language = failing(quota);
    const embedding = new MockEmbeddingModelV4({ doEmbed: async () => { throw quota(); } });
    setModelForTests({ language, embedding });
    const generate = await call("/internal/llm/generate", { prompt: "x" });
    assert.deepEqual([generate.status, generate.body.error.code], [402, "AI_BUDGET_EXHAUSTED"]);
    assert.equal(language.doStreamCalls.length, 1, "one call, not three");
    const embed = await call("/internal/llm/embed", { texts: ["x"] });
    assert.deepEqual([embed.status, embed.body.error.code], [402, "AI_BUDGET_EXHAUSTED"]);
    assert.equal(embedding.doEmbedCalls.length, 1, "one embedding call, not three");

    let attempt = 0;
    const rateThenQuota = failing(() => (++attempt === 1 ? rate() : quota()));
    setModelForTests({ language: rateThenQuota, embedding: embeddingModel });
    const later = await call("/internal/llm/generate", { prompt: "x" });
    assert.deepEqual([later.status, later.body.error.code], [402, "AI_BUDGET_EXHAUSTED"]);
    assert.equal(rateThenQuota.doStreamCalls.length, 2, "the rate limit was retried, the quota that followed was final");

    const limited = new MockEmbeddingModelV4({ doEmbed: async () => { throw rate(); } });
    setModelForTests({ language: generateModel, embedding: limited });
    const busy = await call("/internal/llm/embed", { texts: ["x"] });
    assert.deepEqual([busy.status, busy.body.error.code], [429, "EMBEDDING_FAILED"], "the worker retries a plain rate limit itself");
    assert.equal(limited.doEmbedCalls.length, 3, "and the SDK still retried it twice first");
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("a model that does not answer within GENERATE_TIMEOUT_MS is cut: 502 naming the timeout, the provider call aborted, not retried", async () => {
  let aborted = null;
  const model = new MockLanguageModelV4({
    doStream: ({ abortSignal }) => new Promise((_, reject) => {
      abortSignal?.addEventListener("abort", () => {
        aborted = abortSignal.reason;
        reject(abortSignal.reason);
      }, { once: true });
    }),
  });
  setModelForTests({ language: model, embedding: embeddingModel });
  const started = Date.now();
  const answer = await call("/internal/llm/generate", { prompt: "x" });
  const elapsed = Date.now() - started;
  assert.deepEqual([answer.status, answer.body.error.code], [502, "GENERATION_FAILED"], "502: the worker retries it");
  assert.match(answer.body.message, /timeout/i);
  assert.ok(elapsed >= GENERATE_TIMEOUT_MS && elapsed < GENERATE_TIMEOUT_MS + 1_000, `${elapsed} ms`);
  assert.equal(aborted?.name, "TimeoutError", "the provider's request is aborted, not left running");
  assert.equal(model.doStreamCalls.length, 1);
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("a stream that fails after it began fails the call with the provider's own error: no partial answer reaches the worker", async () => {
  const begun = answerParts('{"answer":42}').slice(0, 3);
  const cases = [
    // The provider reports the failure as a part of the stream
    [() => convertArrayToReadableStream([...begun, { type: "error", error: providerError(503, "The stream was interrupted", true) }]), 503, /The stream was interrupted/],
    // The connection breaks under the stream
    [() => new ReadableStream({ start(controller) {
      for (const part of begun) controller.enqueue(part);
      controller.error(new TypeError("terminated"));
    } }), 502, /terminated/],
  ];
  try {
    for (const [makeStream, status, cause] of cases) {
      for (const body of [{ prompt: "x" }, { prompt: "x", schema: SCHEMA }]) {
        const model = new MockLanguageModelV4({ doStream: async () => ({ stream: makeStream() }) });
        setModelForTests({ language: model, embedding: embeddingModel });
        const answer = await call("/internal/llm/generate", body);
        const label = `${status} ${JSON.stringify(body)}`;
        assert.deepEqual([answer.status, answer.body.error.code], [status, "GENERATION_FAILED"], label);
        assert.match(answer.body.message, cause, `${label}: the cause, not "no output generated"`);
        assert.equal(answer.body.text ?? answer.body.object ?? null, null, `${label}: nothing of the half answer`);
        assert.equal(model.doStreamCalls.length, 1, `${label}: a begun stream is not asked again here — the worker retries`);
      }
    }
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("an answer that arrives in many small parts over time is answered whole", async () => {
  const text = JSON.stringify({ answer: 7 });
  const parts = [
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id: "r1" }, { type: "reasoning-delta", id: "r1", delta: "thinking" }, { type: "reasoning-end", id: "r1" },
    { type: "text-start", id: "t1" },
    ...[...text].map((delta) => ({ type: "text-delta", id: "t1", delta })),
    { type: "text-end", id: "t1" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 9, text: 5, reasoning: 4 } } },
  ];
  const slow = () => new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: parts, chunkDelayInMs: 5 }) }) });
  try {
    setModelForTests({ language: slow(), embedding: embeddingModel });
    const object = await call("/internal/llm/generate", { prompt: "Kiek?", schema: SCHEMA });
    assert.deepEqual([object.status, object.body.object, object.body.text], [200, { answer: 7 }, null]);
    assert.deepEqual(object.body.usage, { inputTokens: 20, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 9, reasoningTokens: 4 });
    setModelForTests({ language: slow(), embedding: embeddingModel });
    const plain = await call("/internal/llm/generate", { prompt: "Kiek?" });
    assert.deepEqual([plain.status, plain.body.text, plain.body.finishReason], [200, text, "stop"], "the reasoning is not part of the text");
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("an unconfigured or unknown provider is 400 UNKNOWN_MODEL before any call", async () => {
  setModelForTests({});
  try {
    for (const model of ["anthropic:claude-sonnet-5", "openai:gpt-4.1", "ollama:llama3.1"]) {
      const answer = await call("/internal/llm/generate", { prompt: "x", model });
      assert.deepEqual([answer.status, answer.body.error.code], [400, "UNKNOWN_MODEL"], model);
      assert.match(answer.body.message, /is not configured/);
    }
    const anthropicEmbed = await call("/internal/llm/embed", { texts: ["x"], model: "anthropic:voyage" });
    assert.deepEqual([anthropicEmbed.status, anthropicEmbed.body.error.code, anthropicEmbed.body.message],
                     [400, "UNKNOWN_MODEL", "Anthropic offers no embedding models"]);
    const openaiEmbed = await call("/internal/llm/embed", { texts: ["x"], model: "openai:text-embedding-3-small" });
    assert.deepEqual([openaiEmbed.status, openaiEmbed.body.error.code], [400, "UNKNOWN_MODEL"]);
  } finally {
    setModelForTests({ language: generateModel, embedding: embeddingModel });
  }
});


test("/embed validates its texts; the batch ceiling's edge passes", async () => {
  const refused = [
    [{}, "INVALID_TEXTS"], [{ texts: "one text" }, "INVALID_TEXTS"], [{ texts: [] }, "INVALID_TEXTS"],
    [{ texts: [1] }, "INVALID_TEXTS"], [{ texts: ["a", null] }, "INVALID_TEXTS"], [{ texts: [{ text: "a" }] }, "INVALID_TEXTS"],
    [{ texts: Array(257).fill("x") }, "TOO_MANY_TEXTS"], [["a"], "INVALID_TEXTS"],
  ];
  for (const [body, code] of refused) {
    const answer = await call("/internal/llm/embed", body);
    assert.deepEqual([answer.status, answer.body.error.code], [400, code], JSON.stringify(body).slice(0, 60));
  }
  const edge = await call("/internal/llm/embed", { texts: Array.from({ length: 256 }, (_, i) => `t${i}`) });
  assert.equal(edge.status, 200);
  assert.equal(edge.body.embeddings.length, 256);
});


test("/embed keeps the order across the provider's own batches, pads empty texts, sums usage and echoes the model", async () => {
  const batches = [];
  const model = new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: 2,
    doEmbed: async ({ values }) => {
      batches.push(values);
      return { embeddings: values.map((v) => [v.length, v.charCodeAt(0)]), usage: { tokens: values.length * 10 }, warnings: [] };
    },
  });
  setModelForTests({ language: generateModel, embedding: model });
  const answer = await call("/internal/llm/embed", { texts: ["a", "", "ccc", "   ", "eeeee"] });
  assert.equal(answer.status, 200);
  assert.deepEqual(batches.flat().sort(), [" ", " ", "a", "ccc", "eeeee"], "blank texts become one space");
  assert.deepEqual(batches.map((b) => b.length).sort(), [1, 2, 2], "split by the provider's batch size");
  assert.deepEqual(answer.body.embeddings, [[1, 97], [1, 32], [3, 99], [1, 32], [5, 101]], "one vector per text, in order");
  assert.deepEqual([answer.body.dimensions, answer.body.usage], [2, { tokens: 50 }]);
  assert.equal(answer.body.model, "gateway:azure/text-embedding-3-large", "the default model, qualified");
  assert.ok(Number.isInteger(answer.body.durationMs));

  assert.equal((await call("/internal/llm/embed", { texts: ["a"], model: "  gateway:azure/text-embedding-3-large " })).body.model,
               "gateway:azure/text-embedding-3-large");
  assert.equal((await call("/internal/llm/embed", { texts: ["a"], model: "azure/x-embed" })).body.model, "gateway:azure/x-embed");
  assert.equal((await call("/internal/llm/embed", { texts: ["a"], model: 42 })).body.model, "gateway:azure/text-embedding-3-large",
               "a model that is no string falls back to the default");
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("/embed failures are classified like /generate's: 402 for a spent budget, the status class under EMBEDDING_FAILED, 502 for the network", async () => {
  const cases = [
    [() => providerError(402, "Budget exceeded"), 402, "AI_BUDGET_EXHAUSTED"],
    [() => providerError(400, "Input too long for the embedding model"), 400, "EMBEDDING_FAILED"],
    [() => providerError(503, "Service Unavailable", true), 503, "EMBEDDING_FAILED"],
    [() => new TypeError("fetch failed"), 502, "EMBEDDING_FAILED"],
  ];
  for (const [makeError, status, code] of cases) {
    setModelForTests({ language: generateModel, embedding: new MockEmbeddingModelV4({ doEmbed: async () => { throw makeError(); } }) });
    const answer = await call("/internal/llm/embed", { texts: ["x"] });
    assert.deepEqual([answer.status, answer.body.error.code], [status, code], String(makeError().message));
    if (code === "EMBEDDING_FAILED") assert.match(answer.body.message, /^Embedding call failed: /);
  }
  setModelForTests({ language: generateModel, embedding: embeddingModel });
});


test("/models: the configured providers and the gateway's models, newest first, with per-token prices (the prompt cache's where named), fetched with the key both ways", async () => {
  const answer = await call("/internal/llm/models", undefined, "s3cret", "GET");
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.providers, ["gateway"], "only the providers with credentials");
  assert.deepEqual(answer.body.models, [
    { id: "gateway:azure/gpt-5.6-luna", name: "azure/gpt-5.6-luna", kind: "chat", contextLength: null, maxOutputTokens: null,
      pricing: { promptPerToken: 0, completionPerToken: 0, cacheReadPerToken: 0.00000002, cacheWritePerToken: 0.00000025 } },
    { id: "gateway:azure/gpt-5.6-sol", name: "azure/gpt-5.6-sol", kind: "chat", contextLength: null, maxOutputTokens: null, pricing: null },
    { id: "gateway:azure/gpt-5.5", name: "GPT-5.5", kind: "chat", contextLength: 400_000, maxOutputTokens: 128_000,
      pricing: { promptPerToken: 0.000005, completionPerToken: 0.00003, cacheReadPerToken: 0.0000005, cacheWritePerToken: null } },
    { id: "gateway:azure/text-embedding-3-small", name: "azure/text-embedding-3-small", kind: "embedding", contextLength: null,
      maxOutputTokens: null, pricing: { promptPerToken: 0.00000002, completionPerToken: 0, cacheReadPerToken: null, cacheWritePerToken: null } },
    { id: "gateway:azure/unpriced", name: "azure/unpriced", kind: "chat", contextLength: null, maxOutputTokens: null, pricing: null },
  ], "newest first, one date's models in the gateway's order, a model without a date last; ids qualified as Django's price table keys them (assistant/usage.py)");
  const fetched = gateway.requests[0];
  assert.deepEqual(fetched, { path: "/v1/models", vk: "test-key", auth: "Bearer test-key" });
});


test("/models is cached ten minutes; a gateway error, a malformed answer or no gateway keeps the last good list, retried after a minute (ASSISTANT-ROUTES-5, FIXED 2026-09-27)", async (t) => {
  const realNow = Date.now.bind(Date);
  let offset = 0;
  t.mock.method(Date, "now", () => realNow() + offset);
  const models = async () => (await call("/internal/llm/models", undefined, "s3cret", "GET")).body.models.map((m) => m.id);
  const asked = () => gateway.requests.length;
  const minutes = (n) => { offset += n * 60_000; };

  minutes(11);
  gateway.answer = { status: 200, json: { data: [{ id: "azure/first" }] } };
  let count = asked();
  assert.deepEqual(await models(), ["gateway:azure/first"], "a stale cache is refreshed");
  assert.equal(asked(), count + 1);
  minutes(9);
  assert.deepEqual(await models(), ["gateway:azure/first"]);
  assert.equal(asked(), count + 1, "reused within ten minutes");

  const failures = [
    { status: 500, json: { error: { message: "upstream down" } } },
    { status: 401, json: { error: { message: "invalid key" } } },
    { status: 200, json: { error: "not a list" } },
    "hangup",
  ];
  for (const failure of failures) {
    minutes(11);
    gateway.answer = failure;
    count = asked();
    assert.deepEqual(await models(), ["gateway:azure/first"], `${JSON.stringify(failure)}: the last good list stays`);
    assert.equal(asked(), count + 1);
    minutes(0.5);
    assert.deepEqual(await models(), ["gateway:azure/first"]);
    assert.equal(asked(), count + 1, "not asked again within the minute");
  }

  minutes(1);
  gateway.answer = { status: 200, json: { data: [{ id: "azure/second" }] } };
  assert.deepEqual(await models(), ["gateway:azure/second"], "retried after a minute and taken");
  minutes(11);
  gateway.answer = { status: 200, json: { data: [] } };
  assert.deepEqual(await models(), [], "an answered empty list is a real answer");
  gateway.answer = { status: 200, json: GATEWAY_MODELS };
});
