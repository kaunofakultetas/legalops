// -----------------------------------------------------------
//  [*] Assistant — the model's view of the conversation
//
//  Turns the thread's branch from Django, plus the new user
//  message, into what the model receives. Stored history is
//  not trusted: each role keeps only the parts it may carry,
//  tool parts only for this turn's tools, and a part a
//  provider would refuse is dropped — kept, it would fail
//  every later turn of the thread. An attached document
//  becomes a line with its id for readDocument. Old reasoning
//  and tool traffic are pruned, then whole old turns dropped
//  until the history fits MAX_HISTORY_CHARS.
//
//  Split into:
//
//    cleanLine        — a value made safe inside the note
//    documentNote     — an attached document as model text
//    wellFormed       — a part a provider accepts
//    withoutRawInput  — a refused call replayed by its input
//    sanitizeMessages — the parts each role may carry
//    fitHistory       — whole old turns dropped to fit
//    toModelMessages  — the whole pipeline
// -----------------------------------------------------------

import { convertToModelMessages, pruneMessages } from "ai";

import { MAX_HISTORY_CHARS } from "../config.js";


// The part types a user message may carry to the model
const USER_PARTS = new Set(["text", "data-document"]);

// The non-tool part types our assistant stream produces
const ASSISTANT_PARTS = new Set(["text", "reasoning", "step-start"]);







// -----------------------------------------------------------
// cleanLine
// -----------------------------------------------------------
//
// A user-typed value as one capped line, safe inside the
// note: no control characters (the C1 NEL breaks a line too),
// line separators, double quotes, angle brackets, backticks
// or backslashes — the same rule as prompt.js clean().
//
// Used by:
//   - documentNote (below)
// -----------------------------------------------------------

function cleanLine(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029"<>`\\]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
}







// -----------------------------------------------------------
// documentNote
// -----------------------------------------------------------
//
// The line the model reads for a document the user attached:
// its title, its id (what readDocument and attachDocument
// take) and how much text was extracted, or a warning that
// the text may be unavailable.
//
// Used by:
//   - toModelMessages (below) — its data-part conversion
//   - tests/messages.test.mjs
// -----------------------------------------------------------

export function documentNote(data) {
  const id = cleanLine(data?.id, 64);
  const title = cleanLine(data?.title || data?.name || "document", 200);
  const status = cleanLine(data?.extractionStatus, 20);
  const extraction = status === "done"
    ? `${Number(data?.charCount) || 0} characters of text extracted`
    : `text extraction ${status || "unknown"} — the text may be unavailable`;
  return `[Attached document "${title}" — document id ${id}; ${extraction}]`;
}







// -----------------------------------------------------------
// wellFormed
// -----------------------------------------------------------
//
// Whether a provider accepts the part. A text must hold more
// than whitespace: the GUI stores an empty one beside an
// attachment, models stream blank lines before a tool call,
// and Anthropic refuses both. A tool part must carry its
// toolCallId, or the provider refuses the whole request; our
// stream always writes one, so a part without it is damaged
// or forged and is dropped, not repaired.
//
// Used by:
//   - sanitizeMessages (below)
// -----------------------------------------------------------

function wellFormed(part) {
  if (part?.type === "text") return typeof part.text === "string" && part.text.trim() !== "";
  if (typeof part?.type === "string" && part.type.startsWith("tool-")) {
    return typeof part.toolCallId === "string" && part.toolCallId.trim() !== "";
  }
  return true;
}







// -----------------------------------------------------------
// withoutRawInput
// -----------------------------------------------------------
//
// A tool part as AI SDK 7 wants it replayed. The SDK still
// stores a refused call's input in the deprecated rawInput
// field, and convertToModelMessages then warns about it on
// every later turn. The value moves to input, which the
// conversion reads first anyway, so the model sees the same
// call. Other parts pass unchanged.
//
// Used by:
//   - sanitizeMessages (below)
// -----------------------------------------------------------

function withoutRawInput(part) {
  if (!part.type.startsWith("tool-") || !Object.hasOwn(part, "rawInput")) return part;
  const { rawInput, ...rest } = part;
  return rest.input === undefined ? { ...rest, input: rawInput } : rest;
}







// -----------------------------------------------------------
// sanitizeMessages
// -----------------------------------------------------------
//
// Keeps only user and assistant messages, and in each only
// the well-formed parts its role may carry. A tool part must
// name one of this turn's tools, so a renamed or forged tool
// never reaches the model. Messages left empty are dropped.
//
// Used by:
//   - toModelMessages (below)
//   - tests/messages.test.mjs, tests/transcript.test.mjs
// -----------------------------------------------------------

export function sanitizeMessages(messages, toolNames) {
  const out = [];
  for (const message of messages) {
    const allowed = message.role === "user"
      ? (part) => USER_PARTS.has(part?.type)
      : message.role === "assistant"
        ? (part) => ASSISTANT_PARTS.has(part?.type)
          || (typeof part?.type === "string" && part.type.startsWith("tool-") && toolNames.has(part.type.slice(5)))
        : () => false;
    const parts = (message.parts || []).filter((part) => allowed(part) && wellFormed(part)).map(withoutRawInput);
    if (parts.length > 0) out.push({ ...message, parts });
  }
  return out;
}







// -----------------------------------------------------------
// fitHistory
// -----------------------------------------------------------
//
// Drops whole turns — a user message and everything up to
// the next one — from the oldest end until the serialized
// messages fit, so a tool result never loses its call. The
// newest turn always stays, even over the limit.
//
// Used by:
//   - toModelMessages (below)
//   - tests/messages.test.mjs, tests/transcript.test.mjs
// -----------------------------------------------------------

export function fitHistory(messages, max = MAX_HISTORY_CHARS) {
  let kept = messages;
  while (kept.length > 1 && JSON.stringify(kept).length > max) {
    const nextTurn = kept.findIndex((message, index) => index > 0 && message.role === "user");
    if (nextTurn <= 0) break;
    kept = kept.slice(nextTurn);
  }
  return kept;
}







// -----------------------------------------------------------
// toModelMessages
// -----------------------------------------------------------
//
// The whole pipeline of the header: the parts checked, the
// messages converted (a stopped turn's unfinished tool calls
// skipped), reasoning before the last message and tool
// traffic before the last ten pruned, then cut to size.
//
// Used by:
//   - routes/chat.js — the POST handler
// -----------------------------------------------------------

export async function toModelMessages(uiMessages, tools) {
  const clean = sanitizeMessages(uiMessages, new Set(Object.keys(tools)));
  const converted = await convertToModelMessages(clean, {
    tools,
    ignoreIncompleteToolCalls: true,
    convertDataPart: (part) => (part.type === "data-document" ? { type: "text", text: documentNote(part.data) } : undefined),
  });
  const pruned = pruneMessages({
    messages: converted,
    reasoning: "before-last-message",
    toolCalls: "before-last-10-messages",
    emptyMessages: "remove",
  });
  return fitHistory(pruned);
}
