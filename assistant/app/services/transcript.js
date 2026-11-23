// -----------------------------------------------------------
//  [*] Assistant — the server-side transcript
//
//  The conversation lives in Django; the browser sends only
//  the new user message. This module reads and writes it in
//  the row format of assistant-ui's history adapter
//  (aiSDKV6FormatAdapter), so the GUI loads server-written
//  rows as its own.
//
//  The user's message is upserted through the public route,
//  as the user. Replies go through the internal door, the
//  only writer of assistant rows, so the tool outputs the
//  model reads back are never browser-made. The history is
//  read as the user and cut to the active branch by walking
//  parent_id back from the new message's parent.
//
//  What the assistant writes is cleaned and fitted to
//  Django's row limit first, so one bad character or a few
//  long tool outputs do not cost a whole reply.
//
//  Split into:
//
//    MESSAGE_FORMAT       — the history row format
//    MESSAGE_ID           — what a message id may look like
//    MAX_STORED_CHARS     — Django's row ceiling, with margin
//    storable             — NUL and lone surrogates replaced
//    storedSize           — the size as Django measures it
//    encodeMessage        — a UIMessage as stored content
//    decodeRow            — a stored row as a UIMessage
//    messageText          — the text parts, joined
//    hasContent           — anything worth storing?
//    loadThread           — the thread row, as the user
//    saveUserMessage      — upsert the user's message
//    buildBranch          — the rows of the active branch
//    loadBranch           — the branch, fetched and decoded
//    fitStoredContent     — shrink oversized tool outputs
//    saveAssistantMessage — store a reply (internal door)
// -----------------------------------------------------------

import { MAX_HISTORY_MESSAGES } from "../config.js";
import { HttpError } from "../middleware/errors.js";
import { internalFetch } from "./django.js";







// -----------------------------------------------------------
// MESSAGE_FORMAT
// -----------------------------------------------------------
//
// assistant-ui's aiSDKV6FormatAdapter.format — the GUI only
// decodes rows of this format.
//
// Used by:
//   - saveUserMessage, saveAssistantMessage, decodeRow (below)
// -----------------------------------------------------------

export const MESSAGE_FORMAT = "ai-sdk/v6";







// -----------------------------------------------------------
// MESSAGE_ID
// -----------------------------------------------------------
//
// Django's message id rule (chat/store.py): the AI SDK's and
// assistant-ui's ids fit it, and so do the ids the chat route
// gives its own replies.
//
// Used by:
//   - routes/chat.js — readTurnBody
// -----------------------------------------------------------

export const MESSAGE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;







// -----------------------------------------------------------
// MAX_STORED_CHARS
// -----------------------------------------------------------
//
// Django refuses a row over 400 000 characters as it
// serializes them (413 MESSAGE_TOO_LARGE); replies are shrunk
// below this lower ceiling before they are stored.
//
// Used by:
//   - fitStoredContent (below)
// -----------------------------------------------------------

export const MAX_STORED_CHARS = 380_000;







// -----------------------------------------------------------
// storable
// -----------------------------------------------------------
//
// A copy of a JSON value the database will take: every
// string, keys included, with its NUL characters and lone
// surrogates (half an emoji) replaced by U+FFFD — the
// database refuses both — and everything else as it was.
//
// Used by:
//   - messageText, saveAssistantMessage (below)
// -----------------------------------------------------------

export function storable(value) {
  if (typeof value === "string") return value.replaceAll("\u0000", "\uFFFD").toWellFormed();
  if (Array.isArray(value)) return value.map(storable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [storable(key), storable(item)]));
  }
  return value;
}







// -----------------------------------------------------------
// storedSize
// -----------------------------------------------------------
//
// The size Django checks a row against, the length of its
// Python JSON text: Python writes a space after every comma
// and colon where JSON.stringify writes none, so each
// separator counts one more character. An emoji counts twice
// here and once there, so the measure errs on the safe side.
//
// Used by:
//   - fitStoredContent (below)
// -----------------------------------------------------------

export function storedSize(value) {
  // The separators JSON.stringify writes: between items and
  // after every key (members it leaves out are not counted)
  const separators = (item) => {
    if (Array.isArray(item)) {
      return Math.max(0, item.length - 1) + item.reduce((sum, member) => sum + separators(member), 0);
    }
    if (item && typeof item === "object") {
      const members = Object.values(item).filter((member) => member !== undefined && typeof member !== "function");
      return 2 * members.length - Math.min(1, members.length) + members.reduce((sum, member) => sum + separators(member), 0);
    }
    return 0;
  };
  return JSON.stringify(value).length + separators(value);
}







// -----------------------------------------------------------
// encodeMessage
// -----------------------------------------------------------
//
// The stored content of a UIMessage: everything but its id,
// as aiSDKV6FormatAdapter.encode stores it.
//
// Used by:
//   - saveUserMessage, saveAssistantMessage (below)
// -----------------------------------------------------------

export function encodeMessage(message) {
  const { id: _id, ...content } = message;
  return content;
}







// -----------------------------------------------------------
// decodeRow
// -----------------------------------------------------------
//
// A history row as a UIMessage, or null for a row of another
// format, role or shape, so a stored system row never reaches
// the model. Content that carries a message key is refused
// whatever it holds: a wrapped row could show Django one role
// and the model another, passing forged tool outputs off as a
// reply. Django refuses such rows too; this is the second
// line.
//
// Used by:
//   - loadBranch (below)
// -----------------------------------------------------------

export function decodeRow(row) {
  if (row?.format !== MESSAGE_FORMAT || !row.content || typeof row.content !== "object" || Array.isArray(row.content)) {
    return null;
  }
  if (Object.hasOwn(row.content, "message")) return null;
  const { role, parts, metadata } = row.content;
  if ((role !== "user" && role !== "assistant") || !Array.isArray(parts)) return null;
  return { id: row.id, role, parts, ...(metadata && typeof metadata === "object" ? { metadata } : {}) };
}







// -----------------------------------------------------------
// messageText
// -----------------------------------------------------------
//
// The text parts of a UIMessage, joined and trimmed, for the
// turn log's transcript — made storable, since a NUL in it
// would cost the turn its telemetry row.
//
// Used by:
//   - routes/chat.js — streamTurn, for the turn log
// -----------------------------------------------------------

export function messageText(message) {
  return storable((message?.parts || [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n\n")
    .trim());
}







// -----------------------------------------------------------
// hasContent
// -----------------------------------------------------------
//
// True when a reply has visible text or at least one tool
// call — an empty assistant message is never stored.
//
// Used by:
//   - routes/chat.js — streamTurn, at the end of a turn
// -----------------------------------------------------------

export function hasContent(message) {
  return (message?.parts || []).some((part) =>
    (part?.type === "text" && typeof part.text === "string" && part.text.trim())
    || (typeof part?.type === "string" && part.type.startsWith("tool-")));
}







// -----------------------------------------------------------
// loadThread
// -----------------------------------------------------------
//
// The thread row, fetched as the user so Django enforces
// tenancy: a thread the user cannot see is a 404
// THREAD_NOT_FOUND, and "not yours" reads like "not there".
//
// Used by:
//   - routes/chat.js — the POST handler, before every turn
// -----------------------------------------------------------

export async function loadThread(django, threadId) {
  try {
    return await django.get(`/api/chat/threads/${encodeURIComponent(threadId)}`);
  } catch (err) {
    if (err?.status === 404) throw new HttpError(404, "THREAD_NOT_FOUND", "Thread not found");
    throw err;
  }
}







// -----------------------------------------------------------
// saveUserMessage
// -----------------------------------------------------------
//
// Upserts the incoming user message through the public route,
// as the user: the GUI's history adapter makes the same call,
// so its own append of the message is a harmless repeat. It
// runs before the stream starts, so the reply's parent always
// exists, and Django titles a new thread from it. Answers
// Django's reply, whose autoTitle says whether the thread
// still carries that automatic title — whichever of the two
// calls stored the message first.
//
// Used by:
//   - routes/chat.js — the POST handler
// -----------------------------------------------------------

export async function saveUserMessage(django, threadId, message, parentId) {
  return django.post(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    id: message.id, parent_id: parentId, format: MESSAGE_FORMAT, content: encodeMessage(message),
  });
}







// -----------------------------------------------------------
// buildBranch
// -----------------------------------------------------------
//
// Walks parent_id from the head back to the root, safe from
// cycles, and returns the rows root first, capped to the
// newest MAX_HISTORY_MESSAGES, with a broken flag when the
// chain names a missing parent. The turn still runs on what
// was found, and the prompt tells the model.
//
// Used by:
//   - loadBranch (below)
// -----------------------------------------------------------

export function buildBranch(rows, headId, max = MAX_HISTORY_MESSAGES) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain = [];
  const seen = new Set();
  let cursor = headId;
  let broken = false;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) {
      broken = true;
      break;
    }
    chain.push(row);
    cursor = row.parent_id;
  }
  return { rows: chain.slice(0, max).reverse(), broken };
}







// -----------------------------------------------------------
// loadBranch
// -----------------------------------------------------------
//
// The thread's history, read as the user, cut to the branch
// that ends at the new message's parent and decoded (rows
// that do not decode are dropped), with buildBranch's broken
// flag. A first message has no parent and needs no fetch.
//
// Used by:
//   - routes/chat.js — the POST handler
// -----------------------------------------------------------

export async function loadBranch(django, threadId, parentId) {
  if (!parentId) return { messages: [], broken: false };
  const rows = await django.get(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`);
  const { rows: branch, broken } = buildBranch(Array.isArray(rows) ? rows : [], parentId);
  return { messages: branch.map(decodeRow).filter(Boolean), broken };
}







// -----------------------------------------------------------
// fitStoredContent
// -----------------------------------------------------------
//
// A reply that read a few long documents can outgrow
// Django's row limit. Its tool outputs over 2 000 characters
// are replaced, largest first, by a short preview marked
// truncatedForStorage until the content fits by storedSize
// or nothing is left to cut. Text is never touched, and a
// preview never ends in half an emoji (storable has already
// run).
//
// Used by:
//   - saveAssistantMessage (below)
// -----------------------------------------------------------

export function fitStoredContent(content, max = MAX_STORED_CHARS) {
  let size = storedSize(content);
  if (size <= max) return content;
  const parts = content.parts.map((part) => ({ ...part }));
  const bySize = parts
    .map((part, index) => ({ index, size: JSON.stringify(part.output ?? null).length }))
    .filter((entry) => parts[entry.index].type?.startsWith("tool-") && entry.size > 2_000)
    .sort((a, b) => b.size - a.size);
  for (const { index } of bySize) {
    const preview = JSON.stringify(parts[index].output).slice(0, 2_000).replace(/[\uD800-\uDBFF]$/, "");
    parts[index].output = { truncatedForStorage: true, preview };
    size = storedSize({ ...content, parts });
    if (size <= max) break;
  }
  return { ...content, parts };
}







// -----------------------------------------------------------
// saveAssistantMessage
// -----------------------------------------------------------
//
// Stores a reply through the internal door, made storable and
// fitted first; Django checks that the thread is the user's
// and that the role is assistant. An upsert by id, so a retry
// never duplicates.
//
// Used by:
//   - routes/chat.js — streamTurn, at the end of a turn
// -----------------------------------------------------------

export async function saveAssistantMessage({ threadId, userId, message, parentId }) {
  await internalFetch(`/internal/assistant/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    body: {
      user_id: userId, id: message.id, parent_id: parentId, format: MESSAGE_FORMAT,
      content: fitStoredContent(storable(encodeMessage(message))),
    },
  });
}
