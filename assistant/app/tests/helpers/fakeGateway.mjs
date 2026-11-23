// -----------------------------------------------------------
//  [*] Tests — a local stand-in for the model gateway
//
//  An http server speaking the OpenAI wire format — the
//  Responses API (the gateway's language models) and chat
//  completions (Ollama's, OpenAI-compatible), plain or
//  streamed, and embeddings — so the real providers
//  llm/provider.js builds run with no network and no spend.
//  A Responses stream has the events the real gateway sends,
//  as named SSE events with no [DONE] at the end. Answers are
//  scripted per request, in order; a request without a script
//  gets a plain success.
//
//  Split into:
//
//    USAGE            — the chat usage of a built-in success
//    RESPONSE_USAGE   — the same in the Responses format
//    chatChunks       — the stream chunks of one text answer
//    responseEvents   — the stream events of one Responses answer
//    responseObject   — one Responses answer, not streamed
//    defaultAnswer    — what an unscripted request gets
//    startFakeGateway — the server
// -----------------------------------------------------------

import http from "node:http";


// The token usage every built-in success reports, in the chat
// completions format and in the Responses format
const USAGE = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18,
                completion_tokens_details: { reasoning_tokens: 2 } };
const RESPONSE_USAGE = { input_tokens: 11, input_tokens_details: { cached_tokens: 0 }, output_tokens: 7,
                         output_tokens_details: { reasoning_tokens: 2 }, total_tokens: 18 };







// -----------------------------------------------------------
// chatChunks
// -----------------------------------------------------------
//
// The chunks of one streamed text answer: the text in two
// deltas, the finish reason, then the usage-only chunk that
// include_usage asks for.
//
// Used by:
//   - defaultAnswer (below)
//   - tests/provider.test.mjs
// -----------------------------------------------------------

export function chatChunks(text, finish = "stop") {
  const base = { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1_790_000_000, model: "fake" };
  const half = Math.ceil(text.length / 2);
  return [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: text.slice(0, half) }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: { content: text.slice(half) }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] },
    { ...base, choices: [], usage: USAGE },
  ];
}







// -----------------------------------------------------------
// responseEvents
// -----------------------------------------------------------
//
// The events of one streamed Responses answer, in the order
// the real gateway sends them: the response opens, then its
// output items — a reasoning item carrying its encrypted
// content, a function call with its arguments in two deltas,
// a message with its text in two deltas, each when asked for
// — and the response completes with its usage.
//
// Used by:
//   - defaultAnswer (below)
//   - tests/provider.test.mjs
// -----------------------------------------------------------

export function responseEvents({ text = null, call = null, reasoning = null } = {}) {
  const response = { id: "resp_1", object: "response", created_at: 1_790_000_000, model: "fake", status: "in_progress",
                     output: [], usage: null };
  const events = [{ type: "response.created", response }];
  const halves = (value) => [value.slice(0, Math.ceil(value.length / 2)), value.slice(Math.ceil(value.length / 2))];
  let index = 0;
  if (reasoning != null) {
    const item = { id: "rs_1", type: "reasoning", summary: [], encrypted_content: reasoning };
    events.push({ type: "response.output_item.added", output_index: index, item },
                { type: "response.output_item.done", output_index: index, item });
    index += 1;
  }
  if (call != null) {
    const args = JSON.stringify(call.input ?? {});
    const item = { id: "fc_1", type: "function_call", call_id: call.id ?? "call_1", name: call.name, arguments: "",
                   status: "in_progress" };
    events.push({ type: "response.output_item.added", output_index: index, item },
                ...halves(args).map((delta) => ({ type: "response.function_call_arguments.delta", item_id: "fc_1",
                                                  output_index: index, delta })),
                { type: "response.output_item.done", output_index: index,
                  item: { ...item, arguments: args, status: "completed" } });
    index += 1;
  }
  if (text != null) {
    const item = { id: "msg_1", type: "message", role: "assistant", status: "in_progress", content: [] };
    events.push({ type: "response.output_item.added", output_index: index, item },
                ...halves(text).map((delta) => ({ type: "response.output_text.delta", item_id: "msg_1",
                                                  output_index: index, delta })),
                { type: "response.output_item.done", output_index: index,
                  item: { ...item, status: "completed", content: [{ type: "output_text", text, annotations: [] }] } });
  }
  events.push({ type: "response.completed",
                response: { ...response, status: "completed", incomplete_details: null, usage: RESPONSE_USAGE } });
  return events;
}







// -----------------------------------------------------------
// responseObject
// -----------------------------------------------------------
//
// One Responses answer as a plain call gets it: the text in a
// single message, and the usage.
//
// Used by:
//   - defaultAnswer (below)
// -----------------------------------------------------------

function responseObject(text, model) {
  return { id: "resp_1", object: "response", created_at: 1_790_000_000, model, status: "completed",
           incomplete_details: null, usage: RESPONSE_USAGE,
           output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed",
                      content: [{ type: "output_text", text, annotations: [] }] }] };
}







// -----------------------------------------------------------
// defaultAnswer
// -----------------------------------------------------------
//
// What an unscripted request gets: an "OK" answer in the
// format the path asks for — a Responses answer or a chat
// completion, streamed or plain (a JSON object when a JSON
// schema was asked for) — or one small vector per embedded
// input.
//
// Used by:
//   - startFakeGateway (below)
// -----------------------------------------------------------

function defaultAnswer(request) {
  if (request.path.endsWith("/embeddings")) {
    const inputs = Array.isArray(request.body?.input) ? request.body.input : [request.body?.input];
    return { json: { object: "list", model: request.body?.model,
                     data: inputs.map((text, index) => ({ object: "embedding", index, embedding: [String(text).length, 1, 0] })),
                     usage: { prompt_tokens: inputs.length, total_tokens: inputs.length } } };
  }
  if (request.path.endsWith("/responses")) {
    const text = request.body?.text?.format?.type === "json_schema" ? '{"answer":42}' : "OK";
    return request.body?.stream ? { sse: responseEvents({ text }) } : { json: responseObject(text, request.body?.model) };
  }
  const content = request.body?.response_format?.type === "json_schema" ? '{"answer":42}' : "OK";
  if (request.body?.stream) return { sse: chatChunks(content) };
  return { json: { id: "chatcmpl-1", object: "chat.completion", created: 1_790_000_000, model: request.body?.model,
                   choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: USAGE } };
}







// -----------------------------------------------------------
// startFakeGateway
// -----------------------------------------------------------
//
// Starts the gateway on a random port, its URL ending in /v1.
// Each request takes the next scripted answer: a status with
// JSON and extra headers (retry-after-ms sets the SDK's
// backoff), a stream, a stream that stalls, no answer at all,
// or a function of the request. Every request is recorded,
// with whether the client hung up before the answer ended —
// an aborted or timed-out model call.
//
// Used by:
//   - tests/provider.test.mjs, tests/embed-timeout.test.mjs
// -----------------------------------------------------------

export async function startFakeGateway() {
  const requests = [];
  const script = [];
  const open = new Set();
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", async () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      const request = { method: req.method, path: new URL(req.url, "http://gw").pathname, headers: { ...req.headers },
                        body, hungUp: false };
      requests.push(request);
      res.on("close", () => { if (!res.writableFinished) request.hungUp = true; });
      const scripted = script.length ? script.shift() : null;
      const answer = typeof scripted === "function" ? await scripted(request) : scripted ?? defaultAnswer(request);
      if (answer.hang) {
        open.add(res);
        return;
      }
      if (answer.sse) {
        // A Responses stream names each event and has no [DONE]
        const named = request.path.endsWith("/responses");
        res.writeHead(answer.status || 200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        for (const chunk of answer.sse) res.write(`${named ? `event: ${chunk.type}\n` : ""}data: ${JSON.stringify(chunk)}\n\n`);
        if (answer.stall) {
          open.add(res);
          return;
        }
        res.end(named ? "" : "data: [DONE]\n\n");
        return;
      }
      res.writeHead(answer.status || 200, { "Content-Type": "application/json", ...(answer.headers || {}) });
      res.end(typeof answer.json === "string" ? answer.json : JSON.stringify(answer.json ?? {}));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    script,
    close: () => new Promise((resolve) => {
      for (const res of open) res.destroy();
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}
