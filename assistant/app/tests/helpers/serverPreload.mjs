// -----------------------------------------------------------
//  [*] Tests — the model a spawned server.js streams
//
//  tests/server.test.mjs preloads this into its server.js
//  child with node's --import. It runs before server.js in
//  the same module graph, so setModelForTests reaches the
//  routes the server builds: every chat turn streams a
//  scripted model and no provider is touched. Each answer
//  numbers its parts, so a test can tell a complete reply
//  from a cut one.
//
//  TEST_MODEL_CHUNKS and TEST_MODEL_DELAY_MS set the deltas
//  per answer and the pause between them (4 and 100 ms by
//  default); TEST_UNHANDLED_REJECTION set to 1 adds one stray
//  promise rejection shortly after boot, which server.js must
//  log and survive.
// -----------------------------------------------------------

import { MockLanguageModelV4 } from "ai/test";

import { setModelForTests } from "../../llm/provider.js";
import { slowTextStream } from "../mockModel.mjs";


// How many deltas one answer streams
const CHUNKS = Number(process.env.TEST_MODEL_CHUNKS || 4);

// Milliseconds between two deltas
const DELAY_MS = Number(process.env.TEST_MODEL_DELAY_MS || 100);


setModelForTests({
  language: new MockLanguageModelV4({
    doStream: async () => slowTextStream(Array.from({ length: CHUNKS }, (_, i) => `part-${i + 1} `), DELAY_MS),
  }),
});

if (process.env.TEST_UNHANDLED_REJECTION === "1") {
  setTimeout(() => {
    Promise.reject(new Error("stray rejection from the preload"));
  }, 200);
}
