// -----------------------------------------------------------
//  [*] Tests — the provider registry (llm/provider.js)
//
//  Model ids, resolving, the gateway wire — the Responses API,
//  every call stateless — and how refusals and timeouts
//  surface: the real providers, aimed at a local fake gateway
//  (helpers/fakeGateway.mjs) — no network, no spend. Other
//  configurations run in a child process each, since
//  config.js reads the keys at import.
//
//  Defects guarded here:
//
//    ASSISTANT-LLM-10    — a spec naming no model failed late
//    ASSISTANT-LLM-11    — Anthropic's spent credit missed
//    ASSISTANT-ROUTES-10 — a quota 429 was retried
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

import "./env.mjs";
import { APICallError, Output, embedMany, generateText, jsonSchema, stepCountIs, streamText, tool } from "ai";
import { MockEmbeddingModelV4, MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import { responseEvents, startFakeGateway } from "./helpers/fakeGateway.mjs";


// The app directory — the child processes run there
const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

// Set by before(): the fake gateway, then the modules under
// test, imported after its URL is set (config.js reads it)
let gateway;
let provider;
let streamErrorText;
let classifyProviderError;







// -----------------------------------------------------------
// codeOf
// -----------------------------------------------------------
//
// The error code the chat stream would show for a failure
// (streamErrorText's envelope, parsed).
//
// Used by:
//   - the refusal tests (below)
// -----------------------------------------------------------

function codeOf(error) {
  return JSON.parse(streamErrorText(error)).error.code;
}







// -----------------------------------------------------------
// failureOf
// -----------------------------------------------------------
//
// Makes one call that must fail, every attempt answered alike
// by a freshly cleared gateway: generateText on the gateway
// model, or the given call with the retry count. Returns the
// error and how many requests the gateway saw.
//
// Used by:
//   - the refusal tests (below)
// -----------------------------------------------------------

async function failureOf(answer, { maxRetries = 0, call = null } = {}) {
  gateway.script.length = 0;
  gateway.requests.length = 0;
  for (let i = 0; i <= maxRetries; i += 1) gateway.script.push(answer);
  try {
    if (call) await call(maxRetries);
    else await generateText({ model: provider.resolveModel("gateway:azure/gpt-5.5"), prompt: "x", maxRetries });
  } catch (error) {
    return { error, attempts: gateway.requests.length };
  }
  throw new Error("the call did not fail");
}







// -----------------------------------------------------------
// inChild
// -----------------------------------------------------------
//
// Runs a code body in a fresh node process whose environment
// holds only PATH and the given variables — config.js reads
// the keys at import, so each configuration needs a process
// of its own. The body sees provider (llm/provider.js) and
// ai; what it returns comes back parsed from JSON.
//
// Used by:
//   - the refusals and configured-providers tests (below)
// -----------------------------------------------------------

function inChild(env, code) {
  const script = `
    const provider = await import(${JSON.stringify(new URL("../llm/provider.js", import.meta.url).href)});
    const ai = await import("ai");
    const out = await (async () => { ${code} })();
    process.stdout.write(JSON.stringify(out));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script],
                        { cwd: APP_DIR, env: { PATH: process.env.PATH, ...env } });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (status) => {
      if (status !== 0) return reject(new Error(`child exited ${status}: ${err.slice(0, 800)}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error(`child printed no JSON: ${out.slice(0, 400)} ${err.slice(0, 400)}`)); }
    });
  });
}


before(async () => {
  gateway = await startFakeGateway();
  process.env.AI_GATEWAY_URL = gateway.url;
  provider = await import("../llm/provider.js");
  ({ streamErrorText } = await import("../llm/stream.js"));
  ({ classifyProviderError } = await import("../middleware/errors.js"));
});

beforeEach(() => {
  gateway.requests.length = 0;
  gateway.script.length = 0;
  provider.setModelForTests({});
});

after(async () => { await gateway.close(); });


test("parseModelId reads provider prefixes and defaults to the gateway", () => {
  const { parseModelId } = provider;
  assert.deepEqual(parseModelId("gateway:azure/gpt-5.5"), { prefix: "gateway", id: "azure/gpt-5.5" });
  assert.deepEqual(parseModelId("azure/gpt-5.5"), { prefix: "gateway", id: "azure/gpt-5.5" });
  assert.deepEqual(parseModelId("ollama:llama3.1:8b"), { prefix: "ollama", id: "llama3.1:8b" });
  assert.deepEqual(parseModelId("anthropic:claude-sonnet-5"), { prefix: "anthropic", id: "claude-sonnet-5" });
  assert.deepEqual(parseModelId("openai:gpt-4.1"), { prefix: "openai", id: "gpt-4.1" });
  assert.deepEqual(parseModelId("mystery:model"), { prefix: "gateway", id: "mystery:model" }, "unknown prefix is no prefix");
  assert.deepEqual(parseModelId("Gateway:x"), { prefix: "gateway", id: "Gateway:x" }, "prefixes are case-sensitive");
  assert.deepEqual(parseModelId(":x"), { prefix: "gateway", id: ":x" });
  assert.deepEqual(parseModelId("  openai:gpt-4.1 "), { prefix: "openai", id: "gpt-4.1" });
  assert.deepEqual(parseModelId("gateway: azure/gpt-5.5"), { prefix: "gateway", id: "azure/gpt-5.5" }, "the id is trimmed too");
  assert.deepEqual(parseModelId("constructor:x"), { prefix: "gateway", id: "constructor:x" }, "no prototype prefix");
  assert.deepEqual(parseModelId(null), { prefix: "gateway", id: "" });
});


test("a provider without credentials fails loudly; the gateway resolves", () => {
  const { configuredProviders, isModelConfigured, resolveEmbeddingModel, resolveModel } = provider;
  assert.throws(() => resolveModel("anthropic:claude-sonnet-5"), /Model provider "anthropic" is not configured/);
  assert.throws(() => resolveModel("openai:gpt-4.1"), /not configured/);
  assert.throws(() => resolveModel("ollama:llama3.1"), /not configured/);
  assert.throws(() => resolveEmbeddingModel("anthropic:any"), /no embedding models/);
  assert.throws(() => resolveEmbeddingModel("openai:text-embedding-3-small"), /not configured/);
  const model = resolveModel("gateway:azure/gpt-5.5");
  assert.equal(model.modelId, "azure/gpt-5.5");
  assert.equal(model.provider, "gateway.responses");
  assert.equal(resolveModel().modelId, "azure/gpt-5.5", "the env default");
  assert.equal(resolveModel("azure/gpt-4o-mini").modelId, "azure/gpt-4o-mini", "a bare id is the gateway's");
  assert.equal(resolveEmbeddingModel().modelId, "azure/text-embedding-3-large");
  assert.equal(resolveEmbeddingModel().provider, "gateway.embedding");
  assert.deepEqual(configuredProviders(), ["gateway"]);
  assert.equal(isModelConfigured(), true);
});


test("a spec that names no model is refused at once, never sent (ASSISTANT-LLM-10, FIXED)", () => {
  const { resolveEmbeddingModel, resolveModel } = provider;
  for (const spec of ["gateway:", "   ", "gateway:   ", "ollama:", "openai:"]) {
    assert.throws(() => resolveModel(spec), /names no model/, JSON.stringify(spec));
  }
  assert.throws(() => resolveEmbeddingModel("gateway:"), /names no model/);
  assert.equal(resolveModel("").modelId, "azure/gpt-5.5", "an empty spec is 'no preference' — the default");
  assert.equal(resolveModel(null).modelId, "azure/gpt-5.5");
});


test("setModelForTests replaces both resolvers until it is cleared", () => {
  const language = new MockLanguageModelV4();
  const embedding = new MockEmbeddingModelV4();
  provider.setModelForTests({ language, embedding });
  assert.equal(provider.resolveModel("anthropic:not-configured"), language, "the override wins over any id");
  assert.equal(provider.resolveEmbeddingModel("anthropic:x"), embedding);
  assert.equal(provider.isModelConfigured(), true);
  provider.setModelForTests({});
  assert.throws(() => provider.resolveModel("anthropic:not-configured"), /not configured/);
});


test("the gateway wire: the Responses API at the base URL, the key as x-bf-vk and bearer, nothing stored, streamed usage, the text", async () => {
  gateway.script.push({ sse: responseEvents({ text: "Reikia CASP leidimo." }) });
  const result = streamText({ model: provider.resolveModel("gateway:azure/gpt-5.5"), prompt: "Kokios licencijos?",
                              temperature: 0.2, maxOutputTokens: 500 });
  assert.equal(await result.text, "Reikia CASP leidimo.");
  const usage = await result.usage;
  assert.equal(usage.inputTokens, 11);
  assert.equal(usage.outputTokens, 7);
  assert.equal(usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens, 2, "the reasoning tokens, for the turn log");
  const [request] = gateway.requests;
  assert.equal(request.method, "POST");
  assert.equal(request.path, "/v1/responses");
  assert.equal(request.headers["x-bf-vk"], "test-key");
  assert.equal(request.headers.authorization, "Bearer test-key");
  assert.equal(request.body.model, "azure/gpt-5.5");
  assert.equal(request.body.stream, true);
  assert.equal(request.body.store, false, "neither the gateway nor Azure keeps the call");
  assert.deepEqual(request.body.include, ["reasoning.encrypted_content"], "a reasoning model's reasoning comes back, encrypted");
  assert.equal(request.body.max_output_tokens, 500);
  assert.equal("temperature" in request.body, false, "a reasoning model takes no temperature");
  assert.deepEqual(request.body.input, [{ role: "user", content: [{ type: "input_text", text: "Kokios licencijos?" }] }]);
});


test("a reasoning model gets the system prompt as the developer message and no temperature; a model that does not reason keeps both", async () => {
  const specs = ["azure/gpt-5.5", "azure/gpt-6-astra", "azure/gpt-6.1-sol", "azure/o4-mini", "azure/gpt-4.1", "azure/gpt-5-chat-latest"];
  for (const spec of specs) {
    gateway.script.push({ sse: responseEvents({ text: "Gerai." }) });
    assert.equal(await streamText({ model: provider.resolveModel(spec), system: "Būk tikslus.", prompt: "Labas", temperature: 0.2 }).text, "Gerai.");
  }
  const sent = gateway.requests.map(({ body }) => ({
    model: body.model, role: body.input[0].role, temperature: body.temperature ?? null, include: body.include ?? null, store: body.store,
  }));
  const reasoning = { role: "developer", temperature: null, include: ["reasoning.encrypted_content"], store: false };
  const plain = { role: "system", temperature: 0.2, include: null, store: false };
  assert.deepEqual(sent, [
    { model: "azure/gpt-5.5", ...reasoning },
    { model: "azure/gpt-6-astra", ...reasoning },
    { model: "azure/gpt-6.1-sol", ...reasoning },
    { model: "azure/o4-mini", ...reasoning },
    { model: "azure/gpt-4.1", ...plain },
    { model: "azure/gpt-5-chat-latest", ...plain },
  ]);
});


test("a tool turn is stateless: the next step hands back the encrypted reasoning and the call in full, never a reference to a kept item", async () => {
  gateway.script.push({ sse: responseEvents({ reasoning: "enc-1", call: { name: "lookup", input: { reference: "MiCA 59" } } }) });
  gateway.script.push({ sse: responseEvents({ text: "Reikia leidimo." }) });
  const lookup = tool({ description: "Finds a provision.", inputSchema: z.object({ reference: z.string() }),
                        execute: async () => "59 straipsnis: leidimas" });
  const result = streamText({ model: provider.resolveModel("gateway:azure/gpt-6-astra"), prompt: "Ką reikalauja MiCA 59?",
                              tools: { lookup }, stopWhen: stepCountIs(3) });
  assert.equal(await result.text, "Reikia leidimo.");
  assert.equal(gateway.requests.length, 2);
  const [first, second] = gateway.requests.map((request) => request.body);
  assert.deepEqual(first.tools.map((t) => [t.type, t.name]), [["function", "lookup"]], "a function tool, as GPT-6 Astra takes it here");
  assert.deepEqual([first.store, second.store], [false, false]);
  const replayed = second.input.slice(1);
  assert.deepEqual(replayed.map((item) => item.type), ["reasoning", "function_call", "function_call_output"]);
  assert.equal(replayed[0].encrypted_content, "enc-1");
  assert.deepEqual([replayed[1].call_id, replayed[1].name, JSON.parse(replayed[1].arguments)], ["call_1", "lookup", { reference: "MiCA 59" }]);
  assert.equal(replayed[2].call_id, "call_1");
  assert.ok(!JSON.stringify(second.input).includes("item_reference"), "nothing refers to an item the gateway would have had to keep");
});


test("the gateway wire: a schema forces strict json_schema output; embeddings go to /embeddings", async () => {
  const schema = { type: "object", properties: { answer: { type: "number" } }, required: ["answer"], additionalProperties: false };
  const answer = await generateText({ model: provider.resolveModel(), prompt: "Kiek?",
                                      output: Output.object({ schema: jsonSchema(schema), name: "count" }) });
  assert.deepEqual(answer.output, { answer: 42 });
  const { format } = gateway.requests[0].body.text;
  assert.equal(format.type, "json_schema");
  assert.equal(format.name, "count");
  assert.deepEqual(format.schema, schema);
  assert.equal(format.strict, true);

  const embedded = await embedMany({ model: provider.resolveEmbeddingModel(), values: ["abc", "ąčę"] });
  assert.deepEqual(embedded.embeddings, [[3, 1, 0], [3, 1, 0]]);
  const request = gateway.requests[1];
  assert.equal(request.path, "/v1/embeddings");
  assert.equal(request.body.model, "azure/text-embedding-3-large");
  assert.deepEqual(request.body.input, ["abc", "ąčę"]);
  assert.equal(request.headers["x-bf-vk"], "test-key");
});


test("a 402 budget refusal is AI_BUDGET_EXHAUSTED and is never retried", async () => {
  const budget = { status: 402, json: { error: { message: "Budget exceeded: Team budget exceeded: 10.1796 >= 10.0000 dollars" } } };
  const { error, attempts } = await failureOf(budget, { maxRetries: 2 });
  assert.equal(attempts, 1, "a spent budget is not retryable");
  assert.ok(APICallError.isInstance(error));
  assert.equal(error.statusCode, 402);
  assert.equal(classifyProviderError(error).budget, true);
  assert.equal(codeOf(error), "AI_BUDGET_EXHAUSTED");
  assert.ok(!streamErrorText(error).includes("10.1796"), "the provider's detail stays off the wire");
  const plain = await failureOf({ status: 402, json: "Payment Required" });
  assert.equal(codeOf(plain.error), "AI_BUDGET_EXHAUSTED", "a 402 without a JSON body is still the budget");
});


test("the other refusals: quota vs rate limit, 5xx retried, bad key, refused connection", async () => {
  const quota = await failureOf({ status: 429, json: { error: { message: "You exceeded your current quota, please check your plan and billing details." } } });
  assert.equal(codeOf(quota.error), "AI_BUDGET_EXHAUSTED");
  const rate = await failureOf({ status: 429, json: { error: { message: "Rate limit reached for requests" } } });
  assert.equal(rate.error.isRetryable, true);
  assert.equal(codeOf(rate.error), "MODEL_UNAVAILABLE", "a plain rate limit is not the budget");
  const down = await failureOf({ status: 503, json: { error: { message: "upstream unavailable" } } }, { maxRetries: 1 });
  assert.equal(down.attempts, 2, "a 5xx is retried maxRetries times");
  assert.match(down.error.name, /RetryError/);
  assert.equal(down.error.lastError.statusCode, 503);
  assert.equal(codeOf(down.error), "MODEL_UNAVAILABLE");
  const key = await failureOf({ status: 401, json: { error: { message: "Invalid virtual key" } } }, { maxRetries: 2 });
  assert.equal(key.attempts, 1);
  assert.equal(codeOf(key.error), "MODEL_ACCESS_DENIED", "a refused key is the administrator's matter, not a wait");
  const context = await failureOf({ status: 400, json: { error: { message: "context_length_exceeded: maximum context length" } } });
  assert.equal(classifyProviderError(context.error).budget, false, "an 'exceeded' without a money word is not the budget");
  assert.equal(codeOf(context.error), "MODEL_CONTEXT_EXCEEDED");

  // The refusal GPT-6 Astra gave on chat completions, as the
  // gateway words it: asked once, and no "try again later"
  const unsupported = await failureOf({ status: 400, json: { error: {
    message: "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
    type: "invalid_request_error", param: null, code: null } } }, { maxRetries: 2 });
  assert.equal(unsupported.attempts, 1);
  assert.equal(codeOf(unsupported.error), "MODEL_REFUSED");
  const gone = await failureOf({ status: 404, json: { error: { message: "The model `azure/gpt-4` does not exist", code: "model_not_found" } } });
  assert.equal(codeOf(gone.error), "MODEL_REFUSED", "a model the provider does not serve");
  const barred = await failureOf({ status: 403, json: { error: { message: "Model 'gpt-4' is not allowed for this virtual key" } } });
  assert.equal(codeOf(barred.error), "MODEL_REFUSED", "the gateway's own words for a model its key may not use");
  const filtered = await failureOf({ status: 400, json: { error: {
    message: "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.", code: "content_filter" } } });
  assert.equal(codeOf(filtered.error), "MODEL_CONTENT_FILTERED");

  const refused = await inChild({ AI_GATEWAY_KEY: "k", AI_GATEWAY_URL: "http://127.0.0.1:9/v1" }, `
    const { streamErrorText } = await import(${JSON.stringify(new URL("../llm/stream.js", import.meta.url).href)});
    try { await ai.generateText({ model: provider.resolveModel("gateway:m"), prompt: "x", maxRetries: 0 }); return null; }
    catch (error) { return { name: error.name, retryable: error.isRetryable, code: JSON.parse(streamErrorText(error)).error.code }; }`);
  assert.deepEqual(refused, { name: "AI_APICallError", retryable: true, code: "MODEL_UNAVAILABLE" }, "an unreachable gateway");
});


test("a failure inside the Responses stream gets its code too: before the first word thrown as a refusal, mid-answer as an outage", async () => {
  const opening = responseEvents({ text: "x" }).slice(0, 1);
  const failed = (code, message) => ({ type: "response.failed", sequence_number: 9,
                                       response: { error: { code, message }, incomplete_details: null, usage: null } });
  const errorCodeOf = async (events) => {
    gateway.script.push({ sse: events });
    const result = streamText({ model: provider.resolveModel("gateway:azure/gpt-6-astra"), prompt: "x", maxRetries: 0 });
    for await (const part of result.fullStream) if (part.type === "error") return codeOf(part.error);
    return null;
  };
  assert.equal(await errorCodeOf([...opening, failed("context_length_exceeded", "Your input exceeds the context window of this model.")]),
               "MODEL_CONTEXT_EXCEEDED");
  const started = responseEvents({ text: "Pradedu atsakyti" }).slice(0, 3);
  assert.equal(await errorCodeOf([...started, failed("server_error", "The server had an error while processing your request.")]),
               "MODEL_UNAVAILABLE");
});


test("finalBudgetRefusals: the real provider's quota 429 is asked once, chat and embeddings; a rate limit is still retried (ASSISTANT-ROUTES-10, FIXED 2026-09-28)", async () => {
  const quota = { status: 429, json: { error: { message: "You exceeded your current quota, please check your plan and billing details." } },
                  headers: { "retry-after-ms": "1" } };
  const rate = { status: 429, json: { error: { message: "Rate limit reached for requests" } }, headers: { "retry-after-ms": "1" } };
  const chat = (retries) => generateText({
    model: provider.finalBudgetRefusals(provider.resolveModel("gateway:azure/gpt-5.5")), prompt: "x", maxRetries: retries,
  });
  const embed = (retries) => embedMany({
    model: provider.finalBudgetRefusals(provider.resolveEmbeddingModel()), values: ["a"], maxRetries: retries,
  });

  const bare = await failureOf(quota, { maxRetries: 2 });
  assert.equal(bare.attempts, 3, "unwrapped, the SDK sends a quota 429 three times — the defect");
  const spent = await failureOf(quota, { maxRetries: 2, call: chat });
  assert.equal(spent.attempts, 1, "wrapped: one request");
  assert.ok(APICallError.isInstance(spent.error), "the provider's own error, not a RetryError");
  assert.deepEqual([spent.error.statusCode, spent.error.isRetryable], [429, false]);
  assert.equal(codeOf(spent.error), "AI_BUDGET_EXHAUSTED");
  const spentEmbed = await failureOf(quota, { maxRetries: 2, call: embed });
  assert.equal(spentEmbed.attempts, 1, "an embedding batch too");
  assert.equal(classifyProviderError(spentEmbed.error).budget, true);

  const limited = await failureOf(rate, { maxRetries: 2, call: chat });
  assert.equal(limited.attempts, 3, "a plain rate limit is still retried");
  assert.equal(codeOf(limited.error), "MODEL_UNAVAILABLE");

  const wrapped = provider.finalBudgetRefusals(provider.resolveModel("gateway:azure/gpt-5.5"));
  assert.deepEqual([wrapped.modelId, wrapped.provider], ["azure/gpt-5.5", "gateway.responses"], "the model keeps its id and provider");
  const wrappedEmbedding = provider.finalBudgetRefusals(provider.resolveEmbeddingModel());
  assert.deepEqual([wrappedEmbedding.modelId, wrappedEmbedding.provider], ["azure/text-embedding-3-large", "gateway.embedding"]);
  gateway.script.push({ sse: responseEvents({ text: "Veikia." }) });
  assert.equal(await streamText({ model: wrapped, prompt: "x" }).text, "Veikia.", "and still answers");
});


test("a stalled stream is cut off by the chunk timeout and its connection dropped", async () => {
  gateway.script.push({ sse: responseEvents({ text: "Pradedu atsakyti" }).slice(0, 3), stall: true });
  const result = streamText({ model: provider.resolveModel(), prompt: "x", maxRetries: 0, timeout: { chunkMs: 200 } });
  const parts = [];
  for await (const part of result.stream) parts.push(part.type);
  assert.ok(parts.includes("text-delta"), "the first words arrived");
  assert.equal(parts.at(-1), "abort", "the silence ends the stream as an abort (shapeTurn turns it into MODEL_TIMEOUT)");
  const deadline = performance.now() + 2_000;
  while (!gateway.requests[0].hungUp && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(gateway.requests[0].hungUp, true, "the upstream call is really cancelled");
});


test("a hanging call is bounded by the total timeout", async () => {
  gateway.script.push({ hang: true });
  const started = performance.now();
  await assert.rejects(generateText({ model: provider.resolveModel(), prompt: "x", maxRetries: 0, timeout: 300 }));
  assert.ok(performance.now() - started < 2_000);
  const deadline = performance.now() + 2_000;
  while (!gateway.requests[0].hungUp && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(gateway.requests[0].hungUp, true);
});


test("openai:, anthropic: and ollama: resolve to their own APIs and send their own credentials", async () => {
  const answered = await inChild({
    AI_GATEWAY_KEY: "gk", AI_GATEWAY_URL: gateway.url, OPENAI_API_KEY: "ok-key", OPENAI_BASE_URL: gateway.url,
    ANTHROPIC_API_KEY: "ak-key", ANTHROPIC_BASE_URL: gateway.url, OLLAMA_BASE_URL: gateway.url,
  }, `
    const out = { providers: provider.configuredProviders(), models: {}, embed: {} };
    for (const spec of ["openai:gpt-4.1", "anthropic:claude-sonnet-5", "ollama:llama3.1:8b"]) {
      const model = provider.resolveModel(spec);
      out.models[spec] = { provider: model.provider, id: model.modelId };
      // Only the request matters; the fake answers Anthropic in another API's format
      await ai.generateText({ model, prompt: "x", maxRetries: 0 }).catch(() => {});
    }
    for (const spec of ["openai:text-embedding-3-small", "ollama:nomic-embed-text"]) {
      const model = provider.resolveEmbeddingModel(spec);
      out.embed[spec] = model.provider;
    }
    return out;`);
  assert.deepEqual(answered.providers, ["gateway", "openai", "anthropic", "ollama"]);
  assert.deepEqual(answered.models, {
    "openai:gpt-4.1": { provider: "openai.responses", id: "gpt-4.1" },
    "anthropic:claude-sonnet-5": { provider: "anthropic.messages", id: "claude-sonnet-5" },
    "ollama:llama3.1:8b": { provider: "ollama.chat", id: "llama3.1:8b" },
  });
  assert.deepEqual(answered.embed, { "openai:text-embedding-3-small": "openai.embedding", "ollama:nomic-embed-text": "ollama.embedding" });

  const byPath = Object.fromEntries(gateway.requests.map((r) => [r.path, r]));
  assert.equal(byPath["/v1/responses"].headers.authorization, "Bearer ok-key", "OpenAI: the bearer");
  assert.equal(byPath["/v1/responses"].body.model, "gpt-4.1");
  assert.equal(byPath["/v1/messages"].headers["x-api-key"], "ak-key", "Anthropic: x-api-key");
  assert.equal(byPath["/v1/messages"].headers.authorization, undefined);
  assert.equal(byPath["/v1/messages"].body.model, "claude-sonnet-5");
  assert.equal(byPath["/v1/chat/completions"].headers.authorization, undefined, "Ollama: no credentials at all");
  assert.equal(byPath["/v1/chat/completions"].headers["x-bf-vk"], undefined, "the gateway key never leaks to another provider");
  assert.equal(byPath["/v1/chat/completions"].body.model, "llama3.1:8b");
});


test("isModelConfigured follows the DEFAULT chat model's provider", async () => {
  const answered = await inChild({ AI_CHAT_MODEL: "anthropic:claude-sonnet-5", AI_GATEWAY_KEY: "gk" }, `
    return { configured: provider.isModelConfigured(), providers: provider.configuredProviders() };`);
  assert.deepEqual(answered, { configured: false, providers: ["gateway"] }, "the gateway key does not make an Anthropic default usable");
  const bare = await inChild({}, "return { configured: provider.isModelConfigured(), providers: provider.configuredProviders() };");
  assert.deepEqual(bare, { configured: false, providers: [] }, "no key at all → the chat answers 503 NOT_CONFIGURED");
});


test("Anthropic's spent credit is a budget refusal too (ASSISTANT-LLM-11, FIXED in middleware/errors.js)", () => {
  const spent = new APICallError({
    message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
    url: "https://api.anthropic.com/v1/messages", requestBodyValues: {}, statusCode: 400,
    responseBody: '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}',
  });
  assert.equal(classifyProviderError(spent).budget, true);
  assert.equal(codeOf(spent), "AI_BUDGET_EXHAUSTED");
});
