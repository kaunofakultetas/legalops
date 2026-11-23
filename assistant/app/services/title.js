// -----------------------------------------------------------
//  [*] Assistant — the conversation's title
//
//  Django names a new conversation after the opening of its
//  first message (the automatic title) and says, whenever a
//  user message is stored, whether the thread still carries
//  that title. While it does, the chat route asks a small
//  model for a few words in its place — beside the answer,
//  on the chat.title prompt — and Django applies them only
//  while the automatic title is still there, so a title the
//  user set always stays. With no active chat.title version,
//  or when the model fails, the automatic title stays and the
//  answer is never touched. The call is logged like a turn
//  (purpose chat_title), so it counts toward the user's
//  budget and shows on the usage page.
//
//  Split into:
//
//    TITLE_PROMPT_SLUG — the prompt the call runs on
//    TITLE_MAX_CHARS   — the longest title kept
//    QUOTES            — quotation marks around a title
//    END_MARKS         — punctuation a title does not end in
//    cleanTitle        — the model's answer as a title
//    nameThread        — ask, store, log (never throws)
// -----------------------------------------------------------

import { generateText } from "ai";

import { TITLE_INPUT_CHARS, TITLE_TIMEOUT_MS } from "../config.js";
import { resolveModel } from "../llm/provider.js";
import { usageLog, usageOf } from "../llm/usage.js";
import { internalFetch } from "./django.js";
import { activePrompt } from "./prompts.js";


// The prompt slug the title call runs on
export const TITLE_PROMPT_SLUG = "chat.title";

// The longest title kept: a few words never come near it,
// and a model that rambles is cut where the automatic title
// would be
const TITLE_MAX_CHARS = 80;

// Quotation marks a model may wrap its title in, at either
// end (Lithuanian „…“ included)
const QUOTES = /^["'„“”«»‘’‚`]+|["'„“”«»‘’‚`]+$/gu;

// What a title does not end in: a full stop, a colon and the
// like, and the spaces before them
const END_MARKS = /[\s.:;,]+$/u;







// -----------------------------------------------------------
// cleanTitle
// -----------------------------------------------------------
//
// The model's answer made a title: its first line with any
// words, without a markdown marker, bold marks or a "Title:"
// label in front, quotation marks around it or a full stop
// at its end, its spaces collapsed, cut to TITLE_MAX_CHARS
// characters. Empty when nothing usable is left — the
// automatic title then stays.
//
// Used by:
//   - nameThread (below)
//   - tests/title.test.mjs
// -----------------------------------------------------------

export function cleanTitle(text) {
  const line = String(text ?? "").split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? "";
  const title = line
    .replace(/^(?:#+|[-*•>]+)\s*/u, "")
    .replace(/\*\*|__/g, "")
    .replace(/^(?:title|pavadinimas)\s*:\s*/iu, "")
    .replace(END_MARKS, "")
    .replace(QUOTES, "")
    .replace(END_MARKS, "")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(title).slice(0, TITLE_MAX_CHARS).join("").trim();
}







// -----------------------------------------------------------
// nameThread
// -----------------------------------------------------------
//
// Asks the chat.title prompt's model for a title from the
// opening of the conversation's first message (`text`, cut
// to TITLE_INPUT_CHARS and fenced as data the prompt says
// never to obey), cleans it, has Django apply it to
// `threadId` for `userId`, and logs the call with its
// tokens and what it read and wrote. It never throws and
// gives up after TITLE_TIMEOUT_MS: the chat route awaits it
// before the turn's stream ends, so the GUI finds the title
// when the answer is over.
//
// Used by:
//   - routes/chat.js — the chat route, while Django says the
//     thread still carries its automatic title
// -----------------------------------------------------------

export async function nameThread({ threadId, userId, text }) {
  const startedAt = Date.now();
  try {
    const prompt = await activePrompt(TITLE_PROMPT_SLUG);
    if (!prompt.text) return;
    const opening = Array.from(String(text ?? "")).slice(0, TITLE_INPUT_CHARS).join("");
    const result = await generateText({
      model: resolveModel(prompt.model),
      instructions: prompt.text,
      prompt: `<message>\n${opening}\n</message>`,
      temperature: prompt.temperature ?? undefined,
      maxOutputTokens: prompt.maxTokens ?? undefined,
      maxRetries: 0,
      timeout: TITLE_TIMEOUT_MS,
    });
    const title = cleanTitle(result.text);
    internalFetch("/internal/assistant/turn-log", {
      method: "POST",
      body: {
        kind: "chat",
        purpose: "chat_title",
        thread_id: threadId,
        user_id: userId,
        model: prompt.model,
        prompt_version_id: prompt.id,
        ...usageLog(usageOf(result.usage)),
        duration_ms: Date.now() - startedAt,
        outcome: title ? "ok" : "empty",
        transcript: { user: opening, assistant: title },
      },
    }).catch((err) => console.error("Title log failed:", err?.message));
    if (!title) return;
    await internalFetch(`/internal/assistant/threads/${encodeURIComponent(threadId)}/title`, {
      method: "POST",
      body: { user_id: userId, title },
    });
  } catch (err) {
    console.warn("Conversation title failed (the automatic title stays):", err?.message);
  }
}
