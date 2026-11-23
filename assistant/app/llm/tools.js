// -----------------------------------------------------------
//  [*] Assistant — the chat tools
//
//  The assistant's own tools for one chat turn, gathered from
//  the groups in llm/tools/:
//
//    companies.js — profile, credentials, roles, linking
//    documents.js — the user's uploaded documents
//    corpus.js    — the indexed legal acts, citation checks
//    reports.js   — the gap-analysis pipeline
//    actions.js   — the register of the actions the
//                   signed-off reports called for
//    programme.js — the work products of a compliance
//                   programme
//
//  Every tool calls Django's public API as the user, so
//  tenancy is enforced in Django alone and the model can never
//  reach another user's data. A failed call ends as a
//  ToolFailure that the model reads and the GUI shows on the
//  tool's pill — it never ends the stream. A new tool is one
//  defineTool block in its group (llm/tools/shared.js), a new
//  group one more spread below.
// -----------------------------------------------------------

import { actionTools } from "./tools/actions.js";
import { companyTools } from "./tools/companies.js";
import { corpusTools } from "./tools/corpus.js";
import { documentTools } from "./tools/documents.js";
import { programmeTools } from "./tools/programme.js";
import { reportTools } from "./tools/reports.js";







// -----------------------------------------------------------
// createTools
// -----------------------------------------------------------
//
// Every group's tools in one set, sharing the turn's context:
// the user's Django client, the thread the linking tools
// attach a company or role to, the turn's language (the
// default for a new report or work product) and the recorder
// that receives each call's timing and outcome for the turn's
// telemetry.
//
// Used by:
//   - routes/chat.js — the POST handler, beside the MCP tools
//   - tests/tools.test.mjs, tests/messages.test.mjs,
//     tests/tools-shared.test.mjs
//   - tests/helpers/toolKit.mjs — toolSet
// -----------------------------------------------------------

export function createTools({ django, threadId = null, language = "lt", record = null }) {
  const ctx = { django, threadId, language, record };
  return {
    ...companyTools(ctx),
    ...documentTools(ctx),
    ...corpusTools(ctx),
    ...reportTools(ctx),
    ...actionTools(ctx),
    ...programmeTools(ctx),
  };
}
