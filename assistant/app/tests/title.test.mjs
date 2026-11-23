// -----------------------------------------------------------
//  [*] Tests — the conversation's title (services/title.js)
//
//  cleanTitle on what a model may wrap its title in, and the
//  title through the real chat route (helpers/chatApp.mjs):
//  asked only while Django says the thread still carries its
//  automatic title, from the opening of the thread's first
//  message fenced as data, on the chat.title prompt's model,
//  stored through the internal door before the turn's stream
//  ends, logged as its own call (purpose chat_title) — and
//  never at the answer's expense: with no active chat.title
//  version, or a failing model, the answer streams and is
//  stored as always, and the automatic title stays.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { PROMPT, THREAD, postTurn, resetStub, settle, startChatApp } from "./helpers/chatApp.mjs";
import { readSse, textOf } from "./helpers/sse.mjs";
import { textStream } from "./mockModel.mjs";


// The usage the title call reports
const USAGE = {
  inputTokens: { total: 40, noCache: 4, cacheRead: 30, cacheWrite: 6 },
  outputTokens: { total: 6, text: 6, reasoning: 0 },
};

// The active chat.title version the stub serves
const TITLE_PROMPT = {
  id: "pv-title", version: 1, model: "gateway:azure/gpt-5.6-luna", temperature: 0.2, maxTokens: null,
  text: "Name the conversation in 2 to 6 words.",
};

// The first message of a new thread, and what the model says
const FIRST = "Mūsų UAB saugo klientų kriptoturtą. Kokio leidimo reikia?";
const ANSWER = "Reikia CASP leidimo.";

let bench;
let stub;
let base;
let setModelForTests;
let cleanTitle;
let resetPromptCacheForTests;
let TITLE_INPUT_CHARS;







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// modelSaying: one mock model for both calls of a turn — the
// answer streamed, the title generated (or the title call
// failing). titleAnswer: the stub's answer to the user
// message's upsert, with Django's autoTitle. titlePosts: the
// titles the internal door received. firstTurn: a turn that
// opens a new thread (no parent), read to its end.
// -----------------------------------------------------------

function modelSaying(title, { fails = false } = {}) {
  return new MockLanguageModelV4({
    doStream: async () => textStream(ANSWER),
    doGenerate: async () => {
      if (fails) throw new Error("gateway down");
      return { content: [{ type: "text", text: title }], finishReason: { unified: "stop", raw: "stop" }, usage: USAGE, warnings: [] };
    },
  });
}

function titleAnswer(autoTitle) {
  stub.routes[`POST /api/chat/threads/${THREAD}/messages`] = () => ({ json: { ok: true, created: true, autoTitle } });
}

const titlePosts = () => stub.requests.filter((r) => r.method === "POST" && r.path === `/internal/assistant/threads/${THREAD}/title`);

async function firstTurn(body = {}) {
  const response = await postTurn(base, { id: "u-new", text: FIRST, parentId: null, ...body });
  assert.equal(response.status, 200);
  return (await readSse(response)).chunks;
}


before(async () => {
  bench = await startChatApp();
  ({ stub, base, setModelForTests } = bench);
  ({ cleanTitle } = await import("../services/title.js"));
  ({ resetPromptCacheForTests } = await import("../services/prompts.js"));
  ({ TITLE_INPUT_CHARS } = await import("../config.js"));
});

beforeEach(() => {
  resetStub(stub);
  resetPromptCacheForTests();
  stub.routes["GET /internal/assistant/prompt"] = (_b, _req, url) => ({
    json: url.searchParams.get("slug") === "chat.title" ? TITLE_PROMPT : PROMPT,
  });
  stub.routes[`POST /internal/assistant/threads/${THREAD}/title`] = () => ({ json: { ok: true, applied: true } });
});

after(async () => {
  await bench.close();
});







// -----------------------------------------------------------
// cleanTitle
// -----------------------------------------------------------

test("cleanTitle keeps the words: quotes, a final full stop, markdown, a label and extra lines go", () => {
  assert.equal(cleanTitle("„Kriptoturto saugojimo leidimas.“"), "Kriptoturto saugojimo leidimas");
  assert.equal(cleanTitle('**Title:** "DORA incidentų pranešimai"'), "DORA incidentų pranešimai");
  assert.equal(cleanTitle("# MiCA licencija\nAntra eilutė"), "MiCA licencija");
  assert.equal(cleanTitle("\n\n  Pavadinimas: AML politika ;  "), "AML politika");
  assert.equal(cleanTitle("- CASP   leidimas\tLietuvoje."), "CASP leidimas Lietuvoje");
  assert.equal(cleanTitle("Ar reikia CASP leidimo?"), "Ar reikia CASP leidimo?", "a question keeps its mark");
});


test("cleanTitle cuts a rambling answer at 80 characters, counting characters, not code units", () => {
  assert.equal(cleanTitle("ž".repeat(120)), "ž".repeat(80));
  assert.equal(Array.from(cleanTitle("𝔞".repeat(120))).length, 80);
});


test("cleanTitle answers nothing when nothing usable is left", () => {
  for (const empty of ["", "   ", '""', "„“", "**", "\n\n", null, undefined]) {
    assert.equal(cleanTitle(empty), "", JSON.stringify(empty));
  }
});







// -----------------------------------------------------------
// through the chat route
// -----------------------------------------------------------

test("a new thread with its automatic title: the model names it beside the answer, and the stream ends once the title is stored", async () => {
  titleAnswer(true);
  const model = modelSaying("„Kriptoturto saugojimo leidimas.“");
  setModelForTests({ language: model });

  const chunks = await firstTurn();
  assert.equal(textOf(chunks), ANSWER, "the answer is untouched");
  // The stream ended: the title is in already
  assert.equal(titlePosts().length, 1);
  const [posted] = titlePosts();
  assert.equal(posted.secret, "s3cret");
  assert.deepEqual(posted.body, { user_id: "u1", title: "Kriptoturto saugojimo leidimas" });

  const [call] = model.doGenerateCalls;
  assert.equal(call.prompt.find((m) => m.role === "system").content, TITLE_PROMPT.text);
  assert.equal(call.prompt.find((m) => m.role === "user").content.map((p) => p.text).join(""), `<message>\n${FIRST}\n</message>`);
  assert.equal(call.temperature, 0.2);

  const log = await stub.waitFor((r) => r.path === "/internal/assistant/turn-log" && r.body.purpose === "chat_title");
  assert.equal(log.body.kind, "chat");
  assert.equal(log.body.thread_id, THREAD);
  assert.equal(log.body.user_id, "u1");
  assert.equal(log.body.model, TITLE_PROMPT.model);
  assert.equal(log.body.prompt_version_id, "pv-title");
  assert.equal(log.body.input_tokens, 40);
  assert.deepEqual([log.body.cached_input_tokens, log.body.cache_write_tokens], [30, 6]);
  assert.equal(log.body.output_tokens, 6);
  assert.equal(log.body.outcome, "ok");
  assert.deepEqual(log.body.transcript, { user: FIRST, assistant: "Kriptoturto saugojimo leidimas" });
});


test("a later turn of an older thread that still has its automatic title is named after the thread's first message", async () => {
  titleAnswer(true);
  const model = modelSaying("Pasisveikinimas");
  setModelForTests({ language: model });

  const response = await postTurn(base, { id: "u-2", text: "Kokios licencijos reikia?", parentId: "a-1" });
  await readSse(response);
  assert.equal(model.doGenerateCalls[0].prompt.find((m) => m.role === "user").content[0].text, "<message>\nLabas\n</message>");
  assert.deepEqual(titlePosts()[0].body, { user_id: "u1", title: "Pasisveikinimas" });
});


test("the model reads only the opening of a long first message", async () => {
  titleAnswer(true);
  const model = modelSaying("Ilgas dokumentas");
  setModelForTests({ language: model });

  await firstTurn({ text: `${"Politika. ".repeat(500)}PABAIGA` });
  const asked = model.doGenerateCalls[0].prompt.find((m) => m.role === "user").content[0].text;
  assert.equal(asked.length, TITLE_INPUT_CHARS + "<message>\n\n</message>".length);
  assert.doesNotMatch(asked, /PABAIGA/);
});


test("no title is asked once the title is not the automatic one — the user set it, or a model did", async () => {
  for (const autoTitle of [false, undefined]) {
    resetStub(stub);
    titleAnswer(autoTitle);
    const model = modelSaying("Nereikalingas");
    setModelForTests({ language: model });

    const chunks = await firstTurn();
    assert.equal(textOf(chunks), ANSWER);
    await settle();
    assert.equal(model.doGenerateCalls.length, 0, String(autoTitle));
    assert.equal(titlePosts().length, 0);
  }
});


test("no active chat.title version means no AI titles: the answer is untouched and the automatic title stays", async () => {
  titleAnswer(true);
  stub.routes["GET /internal/assistant/prompt"] = (_b, _req, url) => (url.searchParams.get("slug") === "chat.title"
    ? { status: 404, json: { error: "No active version", code: "NOT_FOUND" } }
    : { json: PROMPT });
  const model = modelSaying("Nereikalingas");
  setModelForTests({ language: model });

  const chunks = await firstTurn();
  assert.equal(textOf(chunks), ANSWER);
  assert.equal(model.doGenerateCalls.length, 0);
  assert.equal(titlePosts().length, 0);
  await stub.waitFor((r) => r.path === `/internal/assistant/threads/${THREAD}/messages`);
});


test("a failing title model, or an empty title, never costs the answer: the automatic title stays", async () => {
  titleAnswer(true);
  setModelForTests({ language: modelSaying("", { fails: true }) });
  assert.equal(textOf(await firstTurn()), ANSWER);
  await stub.waitFor((r) => r.path === `/internal/assistant/threads/${THREAD}/messages`);
  assert.equal(titlePosts().length, 0);

  resetStub(stub);
  titleAnswer(true);
  setModelForTests({ language: modelSaying("„“") });
  assert.equal(textOf(await firstTurn()), ANSWER);
  const log = await stub.waitFor((r) => r.path === "/internal/assistant/turn-log" && r.body.purpose === "chat_title");
  assert.equal(log.body.outcome, "empty");
  assert.equal(titlePosts().length, 0);
});
