// -----------------------------------------------------------
//  [*] Assistant — shaping the answer stream
//
//  Everything between streamText's parts and the bytes on the
//  wire. A turn never ends silent: a last step without text
//  gets a fallback line in the turn's language, and the turn's
//  own timeouts surface as an error the GUI shows. The browser
//  gets generic error codes, while a tool's error keeps its
//  own text, because the model reads it on the next turn.
//
//  Importing the module installs the AI SDK's warning logger,
//  minus the one warning the SDK causes itself.
//
//  Split into:
//
//    TurnTimeoutError — the turn ran out of time
//    shapeTurn        — the part transform
//    streamErrorText  — the UI stream's error text
//    pipeToResponse   — the SSE pump onto the response
//    sdkWarningText   — one SDK warning, as the SDK words it
//    quietSdkWarnings — the filtered warning logger
// -----------------------------------------------------------

import { JsonToSseTransformStream, UI_MESSAGE_STREAM_HEADERS } from "ai";

import { classifyProviderError, providerFailureKind } from "../middleware/errors.js";


// The start of the generic error envelope, recognised when
// the SDK hands our own text back as an error
const ENVELOPE_START = '{"message":"The assistant could not finish the answer"';

// A refused tool call's error as the SDK words it when it
// hands over only a string; group 1 drops the class name
const TOOL_INPUT_MESSAGE = /^(?:AI_(?:InvalidToolInput|NoSuchTool)Error: )?((?:Invalid input for tool |Model tried to call unavailable tool )[\s\S]*)$/;

// The SDK's stream headers with the charset named: browsers
// assume UTF-8, a client that trusts Content-Type does not
const SSE_HEADERS = { ...UI_MESSAGE_STREAM_HEADERS, "content-type": "text/event-stream; charset=utf-8" };

// The SDK's errors for a provider's failure: a refused
// request, a retry that gave up, a failure mid-stream
const PROVIDER_ERROR = /APICallError|RetryError|StreamProviderError/;

// The chat's code for each kind of provider failure
// (providerFailureKind): only a transient one is "try again
// later"; the others say what to do instead
const PROVIDER_CODES = {
  budget: "AI_BUDGET_EXHAUSTED",
  transient: "MODEL_UNAVAILABLE",
  context: "MODEL_CONTEXT_EXCEEDED",
  filtered: "MODEL_CONTENT_FILTERED",
  access: "MODEL_ACCESS_DENIED",
  refused: "MODEL_REFUSED",
};

// The deprecation warnings the SDK raises from its own code,
// kept out of the log by quietSdkWarnings
const SDK_OWN_WARNINGS = new Set(["rawInput in output-error UI message parts"]);

// Marks the filtered logger, so a second copy of this module
// (a query-string import) never wraps it again
const QUIET_LOGGER = Symbol.for("legalops-assistant.quiet-sdk-warnings");

// What the user reads when a turn ends without an answer or
// is cut short, by cause and language
const FALLBACK_TEXT = {
  "step-limit": {
    lt: "Pasiekiau vieno atsakymo veiksmų ribą ir nespėjau parašyti išvados. Parašykite „tęsk“ – tęsiu nuo čia.",
    en: "I reached the step limit for one answer before writing a conclusion. Reply \"continue\" and I will pick up from here.",
  },
  empty: {
    lt: "Modelis negrąžino atsakymo teksto. Pabandykite paklausti dar kartą.",
    en: "The model returned no answer text. Please ask again.",
  },
  length: {
    lt: "\n\n*(Atsakymas nutrūko – pasiektas ilgio limitas. Parašykite „tęsk“.)*",
    en: "\n\n*(The answer was cut off at the length limit. Reply \"continue\".)*",
  },
  "content-filter": {
    lt: "\n\n*(Atsakymą sustabdė modelio turinio filtras.)*",
    en: "\n\n*(The model's content filter stopped the answer.)*",
  },
};







// -----------------------------------------------------------
// TurnTimeoutError
// -----------------------------------------------------------
//
// One of the turn's timeouts (total, step or chunk) ran out.
// streamText reports a timeout as an abort; shapeTurn raises
// it as this error instead, so the GUI can say so and the
// reply is stored as timed out.
//
// Used by:
//   - shapeTurn, streamErrorText (below)
//   - routes/chat.js — streamTurn, the reply's status
//   - tests/stream.test.mjs
// -----------------------------------------------------------

export class TurnTimeoutError extends Error {
  constructor(reason) {
    super(`The answer took too long (${reason || "timeout"})`);
    this.name = "TurnTimeoutError";
  }
}







// -----------------------------------------------------------
// shapeTurn
// -----------------------------------------------------------
//
// Watches whether the last step, and the turn, wrote text. At
// the finish a last step without text gets its fallback line
// — the "empty answer" only when the whole turn wrote none, as
// an earlier step may hold the answer — and a cut answer gets
// its note; onNote reports which. An abort while the run has
// no stop reason is a timeout and becomes a TurnTimeoutError.
//
// The model's reasoning goes on to the browser and the stored
// reply only once it says something, and never with its
// provider metadata: on the Responses API a reasoning model's
// reasoning comes back as an encrypted blob with no text,
// which only the turn's next step needs — streamText hands it
// back itself, from its own copy of the steps.
//
// Used by:
//   - routes/chat.js — streamTurn
//   - tests/stream.test.mjs
// -----------------------------------------------------------

export function shapeTurn({ language = "lt", run = null, onNote = () => {} }) {
  const lang = language === "en" ? "en" : "lt";
  const noted = new Set(["length", "content-filter"]);
  let stepHasText = false;
  let turnHasText = false;
  let sawError = false;

  // Reasoning by part id: "held" until a delta with text
  // arrives, then "sent"; a start is sent along with that
  // first delta, and an end only after one
  const reasoning = new Map();
  const passReasoning = (part, controller) => {
    if (part.type === "reasoning-start") {
      reasoning.set(part.id, "held");
    } else if (part.type === "reasoning-delta") {
      if (!part.text) return;
      if (reasoning.get(part.id) === "held") controller.enqueue({ type: "reasoning-start", id: part.id });
      reasoning.set(part.id, "sent");
      controller.enqueue({ type: "reasoning-delta", id: part.id, text: part.text });
    } else {
      if (reasoning.get(part.id) !== "held") controller.enqueue({ type: "reasoning-end", id: part.id });
      reasoning.delete(part.id);
    }
  };

  // A standalone line loses the leading blank lines a note
  // appended to an answer needs
  const inject = (controller, kind, standalone) => {
    const id = `fallback-${crypto.randomUUID()}`;
    const text = FALLBACK_TEXT[kind][lang];
    controller.enqueue({ type: "text-start", id });
    controller.enqueue({ type: "text-delta", id, text: standalone ? text.trim() : text });
    controller.enqueue({ type: "text-end", id });
    onNote(kind);
  };

  return new TransformStream({
    transform(part, controller) {
      if (part.type.startsWith("reasoning-")) {
        passReasoning(part, controller);
        return;
      }
      if (part.type === "start-step") {
        stepHasText = false;
      } else if (part.type === "text-delta" && part.text?.trim()) {
        stepHasText = true;
        turnHasText = true;
      } else if (part.type === "error") {
        sawError = true;
      } else if (part.type === "finish" && !sawError) {
        if (!stepHasText) {
          const kind = part.finishReason === "tool-calls" ? "step-limit"
            : noted.has(part.finishReason) ? part.finishReason : "empty";
          if (kind !== "empty" || !turnHasText) inject(controller, kind, true);
        } else if (noted.has(part.finishReason)) {
          inject(controller, part.finishReason, false);
        }
      } else if (part.type === "abort" && run && run.stopReason == null) {
        console.warn("Chat turn timed out:", part.reason);
        controller.enqueue({ type: "error", error: new TurnTimeoutError(part.reason) });
        return;
      }
      controller.enqueue(part);
    },
  });
}







// -----------------------------------------------------------
// streamErrorText
// -----------------------------------------------------------
//
// The UI stream's error text, for stream errors and failed
// tool calls alike (the SDK has one hook for both). A tool's
// failure keeps its own message, and a malformed call — an
// error or the bare string the SDK passes on — reads
// INVALID_TOOL_INPUT with its reason: the model reads both
// when the turn is replayed. Anything else is a generic
// envelope with a code the GUI translates; the details stay
// in the log. A provider's failure gets the code of what it
// means for the user (PROVIDER_CODES) — only a passing one
// asks them to try again later.
//
// Used by:
//   - routes/chat.js — streamTurn, the UI stream's onError
//   - tests/stream.test.mjs, tests/provider.test.mjs,
//     tests/mcp.test.mjs
// -----------------------------------------------------------

export function streamErrorText(error) {
  if (error?.name === "ToolFailure") return error.message;
  const name = String(error?.name || "");
  if (name.includes("InvalidToolInput") || name.includes("NoSuchTool")) {
    return `[INVALID_TOOL_INPUT] ${String(error.message || "").slice(0, 400)}`;
  }
  const toolInput = typeof error === "string" ? TOOL_INPUT_MESSAGE.exec(error) : null;
  if (toolInput) return `[INVALID_TOOL_INPUT] ${toolInput[1].slice(0, 400)}`;
  if (String(error?.message || "").startsWith(ENVELOPE_START)) return error.message;
  const code = error instanceof TurnTimeoutError ? "MODEL_TIMEOUT"
    : classifyProviderError(error).budget ? "AI_BUDGET_EXHAUSTED"
      : PROVIDER_ERROR.test(name) ? PROVIDER_CODES[providerFailureKind(error)]
        : "STREAM_FAILED";
  return JSON.stringify({ message: "The assistant could not finish the answer", error: { code } });
}







// -----------------------------------------------------------
// pipeToResponse
// -----------------------------------------------------------
//
// Writes the UI message stream to the Express response as
// SSE under SSE_HEADERS, flushing each chunk when a compression
// layer offers it. Under backpressure it waits for 'drain' or
// 'close' — the SDK's own helper waits for drain alone and
// hangs on a vanished client. A closed connection cancels only
// this branch of the stream; the turn runs on.
//
// Used by:
//   - routes/chat.js — streamTurn
//   - tests/stream.test.mjs
// -----------------------------------------------------------

export async function pipeToResponse(uiStream, res) {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders?.();
  const reader = uiStream
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream())
    .getReader();

  let closed = false;
  const onClose = () => {
    closed = true;
    reader.cancel().catch(() => {});
  };
  res.once("close", onClose);

  try {
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      const canContinue = res.write(value);
      res.flush?.();
      if (!canContinue && !closed) {
        await new Promise((resolve) => {
          const settle = () => {
            res.off("drain", settle);
            res.off("close", settle);
            resolve();
          };
          res.once("drain", settle);
          res.once("close", settle);
        });
      }
    }
  } catch (err) {
    if (!closed) console.error("Stream pipe error:", err?.message);
  } finally {
    res.off("close", onClose);
    if (!res.writableEnded) res.end();
  }
}







// -----------------------------------------------------------
// sdkWarningText
// -----------------------------------------------------------
//
// One AI SDK warning, worded exactly as the SDK's default
// logger words it (the SDK does not export that wording), so
// the log reads the same with the filter installed.
//
// Used by:
//   - quietSdkWarnings (below)
// -----------------------------------------------------------

function sdkWarningText(warning, { provider, model } = {}) {
  const prefix = `AI SDK Warning${provider != null && model != null ? ` (${provider} / ${model})` : ""}:`;
  const details = warning.details ? ` ${warning.details}` : "";
  switch (warning.type) {
    case "unsupported":
      return `${prefix} The feature "${warning.feature}" is not supported.${details}`;
    case "compatibility":
      return `${prefix} The feature "${warning.feature}" is used in a compatibility mode.${details}`;
    case "deprecated":
      return `${prefix} Deprecated: "${warning.setting}". ${warning.message}`;
    case "other":
      return `${prefix} ${warning.message}`;
    default:
      return `${prefix} ${JSON.stringify(warning, null, 2)}`;
  }
}







// -----------------------------------------------------------
// quietSdkWarnings
// -----------------------------------------------------------
//
// Installs the SDK's global warning logger without the
// rawInput deprecation: the SDK raises it from its own code,
// once per refused tool call, and no operator can act on it.
// Every other warning reaches the logger set before, or goes
// out as the SDK's default would; logging switched off stays
// off. The filter can go once tests/stream.test.mjs sees the
// SDK stop writing the field.
//
// Used by:
//   - this module, once at import (below)
// -----------------------------------------------------------

function quietSdkWarnings() {
  const previous = globalThis.AI_SDK_LOG_WARNINGS;
  if (previous === false || previous?.[QUIET_LOGGER]) return;
  const logger = (options) => {
    const warnings = (options?.warnings ?? [])
      .filter((warning) => !(warning?.type === "deprecated" && SDK_OWN_WARNINGS.has(warning.setting)));
    if (warnings.length === 0) return;
    if (typeof previous === "function") {
      previous({ ...options, warnings });
      return;
    }
    for (const warning of warnings) {
      process.emitWarning(sdkWarningText(warning, options), { type: warning.type === "deprecated" ? "DeprecationWarning" : "Warning" });
    }
  };
  logger[QUIET_LOGGER] = true;
  globalThis.AI_SDK_LOG_WARNINGS = logger;
}

// Every chat turn streams through this module — the filter
// is in place before the first one
quietSdkWarnings();
