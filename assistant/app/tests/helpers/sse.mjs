// -----------------------------------------------------------
//  [*] Tests — reading the chat's event stream
//
//  The chat route answers the AI SDK's UI message stream as
//  Server-Sent Events: one data line per chunk, then [DONE].
//  These helpers read that wire strictly (a malformed frame
//  fails the test instead of being skipped), incrementally
//  (for the stop and disconnect tests), and the way the GUI
//  does — through the SDK's own transport, each chunk checked
//  against its schema and the reply rebuilt.
//
//  Split into:
//
//    parseSse       — wire text to chunks, strictly
//    readSse        — a whole response, parsed
//    openSse        — an incremental reader
//    textOf         — the text the chunks showed
//    guiTransport   — the GUI's transport, for a base URL
//    sendLikeTheGui — one turn, sent and read like the GUI
// -----------------------------------------------------------

import { DefaultChatTransport, readUIMessageStream } from "ai";


// The part types ChatRuntime.jsx's slimMessage keeps
const USER_PARTS = new Set(["text", "data-document"]);







// -----------------------------------------------------------
// parseSse
// -----------------------------------------------------------
//
// Parses the wire text strictly: every event exactly one data
// line and a blank line, nothing after [DONE]. Answers the
// chunks and whether the stream ended with [DONE]; any other
// framing throws.
//
// Used by:
//   - readSse, openSse (below)
//   - tests/chat.test.mjs
// -----------------------------------------------------------

export function parseSse(text) {
  if (text.length && !text.endsWith("\n\n")) throw new Error(`SSE: unterminated frame at the end: ${JSON.stringify(text.slice(-80))}`);
  const frames = text.length ? text.slice(0, -2).split("\n\n") : [];
  const chunks = [];
  let done = false;
  for (const frame of frames) {
    if (done) throw new Error(`SSE: a frame after [DONE]: ${JSON.stringify(frame.slice(0, 80))}`);
    if (!frame.startsWith("data: ") || frame.includes("\n")) throw new Error(`SSE: malformed frame ${JSON.stringify(frame.slice(0, 80))}`);
    const data = frame.slice("data: ".length);
    if (data === "[DONE]") done = true;
    else chunks.push(JSON.parse(data));
  }
  return { chunks, done };
}







// -----------------------------------------------------------
// readSse
// -----------------------------------------------------------
//
// Reads the whole body and parses it strictly, keeping the
// raw text alongside the chunks.
//
// Used by:
//   - tests/chat*.test.mjs
//   - tests/title.test.mjs
// -----------------------------------------------------------

export async function readSse(response) {
  const raw = await response.text();
  return { ...parseSse(raw), raw };
}







// -----------------------------------------------------------
// openSse
// -----------------------------------------------------------
//
// An incremental reader over a live response: until() reads
// on until a chunk matches and throws if the stream ends
// first; rest() drains the remainder. The chunks accumulate
// as they arrive.
//
// Used by:
//   - tests/chat-runs.test.mjs — the live-turn cases
// -----------------------------------------------------------

export function openSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { chunks: [], done: false, reader };

  const drainFrames = () => {
    let cut;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const { chunks, done } = parseSse(buffer.slice(0, cut + 2));
      buffer = buffer.slice(cut + 2);
      state.chunks.push(...chunks);
      state.done ||= done;
    }
  };

  state.until = async (predicate) => {
    let seen = 0;
    for (;;) {
      const hit = state.chunks.slice(seen).find(predicate);
      if (hit) return hit;
      seen = state.chunks.length;
      const { done, value } = await reader.read();
      if (done) throw new Error(`SSE: the stream ended before the expected chunk (${state.chunks.map((c) => c.type)})`);
      buffer += decoder.decode(value, { stream: true });
      drainFrames();
    }
  };

  state.rest = async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drainFrames();
    }
    if (buffer.length) throw new Error(`SSE: trailing bytes ${JSON.stringify(buffer.slice(0, 80))}`);
    return { chunks: state.chunks, done: state.done };
  };

  return state;
}







// -----------------------------------------------------------
// textOf
// -----------------------------------------------------------
//
// The text a stream showed the user: every text delta joined.
//
// Used by:
//   - tests/chat.test.mjs, tests/chat-limits.test.mjs,
//     tests/chat-mcp.test.mjs, tests/chat-runs.test.mjs
//   - tests/title.test.mjs
// -----------------------------------------------------------

export function textOf(chunks) {
  return chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
}







// -----------------------------------------------------------
// guiTransport
// -----------------------------------------------------------
//
// The AI SDK transport the GUI's AssistantChatTransport
// extends, sending ChatRuntime.jsx's slim body: the last
// message only, with its text and document parts, its parent
// and the UI locale. Kept in step with createTransport and
// slimMessage in vite/app/src/pages/Chat/ChatRuntime.jsx by
// hand — the GUI module cannot be imported here.
//
// Used by:
//   - sendLikeTheGui (below)
// -----------------------------------------------------------

export function guiTransport(base, { token = "tok", locale = "lt" } = {}) {
  const slimMessage = (message) => ({
    id: message?.id,
    role: message?.role,
    parts: (message?.parts || []).filter((part) => USER_PARTS.has(part?.type))
      .map((part) => (part.type === "text" ? { type: "text", text: part.text } : { type: part.type, data: part.data })),
    ...(message?.metadata ? { metadata: message.metadata } : {}),
  });
  return new DefaultChatTransport({
    api: `${base}/api/assistant/chat`,
    headers: () => ({ Authorization: `Bearer ${token}` }),
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
      body: {
        id,
        trigger,
        messageId: messageId ?? null,
        message: slimMessage(messages.at(-1)),
        parentId: messages.at(-2)?.id ?? null,
        locale,
      },
    }),
  });
}







// -----------------------------------------------------------
// sendLikeTheGui
// -----------------------------------------------------------
//
// One turn through the GUI's transport. A refused request
// throws the SDK's APICallError, carrying the status and body
// chatErrors.js reads; an accepted stream is checked against
// the SDK's chunk schema (an invalid chunk throws) and the
// reply rebuilt as useChat would. Answers the message, the
// chunks and the errors the stream reported.
//
// Used by:
//   - tests/chat.test.mjs, tests/chat-gate.test.mjs
// -----------------------------------------------------------

export async function sendLikeTheGui(base, {
  threadId, messages, trigger = "submit-message", messageId, token, locale, abortSignal,
}) {
  const stream = await guiTransport(base, { token, locale }).sendMessages({
    chatId: threadId, messages, trigger, messageId, abortSignal, headers: undefined, body: undefined, metadata: undefined,
  });
  const chunks = [];
  const [forMessage, forChunks] = stream.tee();
  const collected = (async () => {
    for await (const chunk of forChunks) chunks.push(chunk);
  })();
  let message = null;
  const errors = [];
  for await (const snapshot of readUIMessageStream({ stream: forMessage, onError: (err) => errors.push(err) })) {
    message = snapshot;
  }
  await collected;
  return { message, chunks, errors };
}
