# legalops-assistant — the AI service

The node side of the stack: an Express service that owns every model
call. It streams the chat's answers (AI SDK, UI message stream over SSE)
to the Vite app through `/api/assistant/*`, and serves Django's worker
and web process their generations and embeddings on the internal door
(`/internal/llm/*`, `/internal/mcp/*`). It resolves who is asking against
Django and stores nothing itself: every thread, prompt version, retrieval
index and telemetry row lives in Django, behind `/internal/assistant/*`
(isolated network, shared secret).

## Layout

```
assistant/
├── Dockerfile          # prod: baked source, node server.js
├── Dockerfile.dev      # dev: bind mount + nodemon
├── runTests.sh         # the node --test suite in the prod image
└── app/
    ├── server.js       # the process: listen, graceful drain on SIGTERM
    ├── app.js          # the Express app: routes, 404/405 tail, errors
    ├── config.js       # every env variable and tuning constant
    ├── llm/
    │   ├── provider.js # "prefix:model" → AI SDK model (the gateway: Responses API)
    │   ├── prompt.js   # the system prompt rendered per turn (clock,
    │   │               #   user, the thread's company and role)
    │   ├── messages.js # stored UI messages → model messages
    │   ├── stream.js   # one turn: steps, tools, errors on the wire
    │   ├── usage.js    # a call's tokens: input, cached, written to the cache, output
    │   ├── mcp.js      # the admin's MCP servers as extra tools
    │   ├── tools.js    # the tool set, bound to the user's bearer
    │   └── tools/      # companies, documents, corpus, reports, actions, programme, shared kit
    ├── routes/
    │   ├── chat.js     # the chat stream, stop and status
    │   ├── internal.js # generate / embed / models for Django
    │   └── internalMcp.js # the MCP connection test
    ├── services/
    │   ├── django.js   # publicFetch / internalFetch
    │   ├── identity.js # bearer → { userId, role, token } via Django
    │   ├── prompts.js  # the active prompt version, cached a minute
    │   ├── title.js    # a conversation's title from its first message (chat.title)
    │   ├── transcript.js # history rows ↔ UI messages, the turn log
    │   ├── runs.js     # the live turns (stop, status, drain)
    │   ├── ratelimit.js
    │   └── clientIp.js # the end user's address (X-Real-IP)
    ├── middleware/
    │   ├── errors.js   # HttpError + the JSON error envelope
    │   └── internal.js # the shared-secret check of /internal/*
    └── tests/          # node --test (see tests/README.md)
```

## Endpoints

| Route | Who calls it |
|---|---|
| `POST /api/assistant/chat` | The GUI (via Caddy): one streamed turn (SSE, AI SDK UI-message stream) |
| `POST /api/assistant/chat/{threadId}/stop` | The GUI's stop button |
| `GET /api/assistant/chat/{threadId}/status` | The GUI, after a reload mid-answer |
| `POST /internal/llm/generate` | Django's worker and web process (shared secret) |
| `POST /internal/llm/embed` | Django (shared secret) |
| `GET /internal/llm/models` | Django — the prompt editor's model list, the prices (shared secret) |
| `POST /internal/mcp/list-tools` | Django — the MCP admin page's connection test (shared secret) |
| `GET /health` | Liveness (not proxied; the compose file sets no healthcheck — the live smoke test asks it) |

The public contract of each route is in [docs/markdown/en/api.md](../docs/markdown/en/api.md).

## One chat turn

1. Identity (`GET /api/auth/me` with the user's bearer, cached 15 s), the
   turn limit, the daily USD budget (`/internal/assistant/budget`; a failed
   check lets the turn through), the active `chat.assistant` prompt.
2. The thread as the user, then in parallel: the user message stored, the
   thread's company loaded with its compliance reports (ids, states, counts
   by status — reports that fail to load are left out, the turn goes on),
   the branch rebuilt from Django's history, the MCP tools opened.
3. The model streams with the tools; the answer is piped to the browser.
   The model is the thread's own `model` when its user picked one (Django
   checks it against the gateway's chat models), else the prompt version's.
   Meanwhile, while Django reports that the thread still carries its
   automatic title (the opening of its first message), the `chat.title`
   prompt's model writes a few words in its place, which Django applies
   through the internal door unless the user renamed the thread
   (`services/title.js`, logged as purpose `chat_title`). No active
   `chat.title` version, or a failing model, leaves the automatic title.
4. When the turn ends, whether the browser is still there or not: the reply
   is stored through the internal door (a stopped, failed or timed-out
   partial reply carries its status), one telemetry row with the
   transcript and the turn's tokens is logged (`llm/usage.js`: every
   step's added up, the input the provider read from its prompt cache
   and wrote to it counted apart), and the stream ends once the title,
   if one is being written, is stored too, so the GUI finds it with the
   answer.

Leaving the page does not stop a turn; the stop route does, and so does a
newer turn in the same thread (the old one is stored as "interrupted").

## Tools

- **Companies:** listCompanies, getCompany, createCompany (links the thread), updateCompany, setThreadCompany, addCredential, updateCredential, removeCredential, setCompanyStandard (a standard the company is certified to, implements or plans — found in the corpus by its designation), removeCompanyStandard, listRoles, saveRole, setThreadRole.
- **Documents:** listDocuments, readDocument (windows over the extracted text, section jumps), searchCompanyDocuments, attachDocument.
- **Legal corpus:** searchLegalCorpus, getLegalProvision, checkCitations, listLegalActs, listObligations (the register of obligations extracted from an act: what it requires, of whom, by when — filtered by category or a word, paged) — the acts and the uploaded standards (a standard's clause goes where an act's article does: "6.1.2", "A.5.15" — or, for a standard not numbered that way, its own identifier "AC-2" or its page "p. 12").
- **Reports:** estimateAnalysisCost, runComplianceAnalysis (gated on the cost the user confirmed), approveReportScope, cancelAnalysis, listReports, getReport, overrideFinding. A report is made in two parts: the first decides which acts apply and is cheap, the second judges every obligation of those acts. A run started from the chat asks Django to stop between them (`review: true`, status `scope_review`) unless the user said to run it without the review (`autoApprove`). getReport on the waiting report answers `scope` instead of findings: every act the run judged with its id, the run's verdict, the plan (`assess` or `skip`) and why, the acts the catalogue screened out, what the run has spent and the price of the second part (Django's dry run of the approval). approveReportScope then continues the run with the acts the user took in or left out — gated like the start: the chosen list is priced again and approved only when the total the user accepted covers it, and never when a model's price is unknown (the total is then only a floor). An act taken in although it does not bind the company is assessed as good practice; a finished report names those under `acts.assessedByChoice`, the acts that apply but were left out under `acts.leftOutByReviewer`, and who approved the list (`scopeApprovedBy`). getReport answers the counts by status for the whole report and per act, the action plan and the citation audit, and the findings a page at a time — narrowed by status, severity or act — so each of a report's hundreds of findings can be reached. The counts are those of the acts in force for the company: the findings of an act that applies only from a later date are counted apart (`counts.upcoming`), listed after today's and dated, so the model never presents preparation as a breach. The overview also names the acts the report did not assess — `acts.toConfirm`, each with the questions that decide whether it applies, and `acts.throughNationalLaw`, the directives — which is what the chat prompt's "resolve the acts to confirm" rule works from. A finding row says what the finding means: `canCost` is what a breach of its provision can cost — the sanction tiers Django keeps on the finding (`consequence`) as one English line in the wording of the report's PDF (`consequence_text`), with plain thousands separators, capped at 500 characters (room for two whole tiers) — given only for a gap (`missing`, `partial`, `unknown`) whose provision the acts sanction, never for a finding of an act that applies only from a later date (a row carries `appliesFrom` or `canCost`, never both — Django keeps no tiers on such a finding, and an earlier report's are left out), and always a ceiling the act provides, never a forecast; `cause` is why the gap exists, present once a person wrote it in the finding's review dialog — no tool writes or files one: getReport's description tells the model to send the user there, and overrideFinding's that its reason is never the place for a cause. A report can also assess the company's own requirements — whether its procedures carry out what its own policies require: estimateAnalysisCost and runComplianceAnalysis take `internalRequirements` (Django's `internal=true` / `internal: true`), the estimate then answers their share as `ownRequirements` (`documents`, `requirements`, `usd` — already in the total; `documents: 0` means there is no policy-level document and the option does nothing), the start is gated on the total with that share, and so is the approval of the scope of a run started with them (`scope.estimate.ownRequirements`). In a finished report they stand apart from the law: getReport counts them under `ownRequirements` (`counts`, `openBySeverity` and a `note` that they are gaps between the company's policies and its procedures, not breaches of law), leaves their row (`docType: "internal"`) and their findings (`sourceKind: "internal"`) out of `counts`, `byAct`, `acts` and the findings it lists unasked, and lists them with `act: "internal"` — each row with its `criterion`, the policy and the section the requirement comes from, where a legal finding has `citations`. A report of a company that has earlier finished ones also looks back: a finding row carries `before` — how the same obligation stood in them, from the finding's `history`, as one line of dates and statuses, the newest first, three at most — and the overview `sinceLastReport`, from `stats.changes`: the date of the previous report, how many gaps are met now (`closed`), how many gaps are new (`new`) and how many obligations that were met are a gap again (`back`), with the first three titles of the last two (`backTitles`, `newTitles`). A company's first report carries neither.
- **Action register:** getActionRegister — read-only. Django keeps what the signed-off reports' plans called for as one register per company: each action with its owner, due date, state and the open findings it is to close. The register moves on one event only — a person signing a finished report off on the report's page, which brings that report's plan in and holds the earlier actions against what it found. So no tool signs a report off, and none opens, closes or edits an action; the tool's description tells the model so, and never to say an action is closed because a document was uploaded: an action is closed only by a later signed-off report that finds its obligations met (`closed.how: "confirmed by a later report"`) or by a person with a reason (`"closed by a person"`, with `by` and the `note`); `done` is the owner's word that it was carried out, awaiting that re-test, and `late` an open or in-progress action past its due date. Unasked the tool lists the live actions (late, open, in progress, done) in Django's order, the late first — at most 20, the rest counted in `moreActions`; `state` lists one state alone, and the closed are listed only that way; `counts` are the whole register's whatever is listed. A row says what the action `closes` in the wording of Django's register workbook — the finding's title with its act and provision in brackets, and "— confirmed" once a later signed-off report found it met; six at most, the rest in `moreItems` — and `fromReport`, the date of the report whose plan it came from (Django's `reportDate`; null once that report is gone). A row whose action no later report can ever confirm — it closes no finding, or one of its findings lost its obligation (Django's `byHandOnly`) — carries `closedOnlyByHand: true`, and `next` then says that a person closes such an action on the Actions tab with a reason. `lawChanges` is there when the law moved under the company's latest finished report: per act the two versions with the date of the current one, the provisions `changed`, `added` and `removed` (twelve of a kind, a cut counted), `recorded: false` when a version in between was read before changes were recorded — the act changed and nobody can say where — and `findingsToRecheck`, the report's findings that rest on a changed or removed provision. Two reads stand behind an answer, both as the user: the register (`/api/companies/{companyId}/actions`), then the law's changes (`/api/companies/{companyId}/law-changes`); only the first can fail the call — a failure of the second leaves `lawChanges` out. Every answer carries the `url` of the company's Actions tab (`/companies/{companyId}?tab=actions`, as the console's router has it), where a person sets owner, due date and state.
- **Programme:** startWorkProduct, getWorkProduct — the work products of a company's compliance programme. Django's worker writes one from the company's documents and its latest report and checks it against the rules of its kind; a person then edits and approves it on its page. Three kinds, each building on the ones before it: `policy` (the compliance policy, the document hierarchy and the documents still missing), `governance` (the governance structure, the compliance process and its RACI matrix) and `risks` (the legal risk criteria, the matrix and the register). startWorkProduct starts one kind for one company — 4–6 minutes in the background, about $0.5 of the user's daily budget — and its description tells the model to start one only when the user asked for that document and getWorkProduct shows no draft or approved version already. What Django refuses of a start (`NO_DOCUMENTS`, `ALREADY_RUNNING`, `BUDGET_EXCEEDED`, `INVALID_FIELD`, `NOT_FOUND`) comes back as a result the model relays — `started: false` with `refused`, Django's `reason` and what to do `next` — not as a failed call; `ALREADY_RUNNING` also names the product in generation. getWorkProduct is the one read tool: with the company alone it lists the newest version of every kind (or `status: "none"`, with the earlier versions' ids), with a kind it reads that kind's newest version, with a product id any version. A product is never passed through as Django keeps it (some 80 kB): a looked-up provision becomes one string, marked `(not found)`, `(act not in corpus)` or `(subject mismatch)` where the lookup warns; a quote becomes the title of its document; the structure an indented outline; a step of the process says what is done in it, cut short, and carries its row of the matrix as one line with the roles by name; and the rules the product does not keep come in words — `rules.broken` block its approval, `rules.notes` are for the reviewer. The large tables are read with `section`: `criteria` (a risk register's two criteria tables) and `positions` (the positions a governance product found in the documents). While a product is queued or running the answer is its progress and no content. The assistant neither edits nor approves: every answer carries the `url` of the product's page, written as the console's router has it (`/programme/{id}`, without the console's base), like a report's.

**The company's records are kept without being asked.** Rule 1 of the prompt's tools makes the assistant file, in the turn the facts arrive and before it answers, whatever the user states or their documents establish: the profile with its classification, each uploaded document with its kind, licences and certificates as claimed credentials, adopted standards, and a role profile for every management, officer or control position the documents define. What nothing settles stays empty and is asked for in the answer. A turn that takes in a company's documents therefore runs for minutes — about six and a half for 26 documents, in six model steps —, which is what `CHAT_TIMEOUT_MS`, `CHAT_STEP_TIMEOUT_MS` and `MAX_STEPS` (24) leave room for.

**Nothing the platform knows is asked of the user.** A tool that takes an id has a way to that id: the turn's company context lists the linked company's documents, credentials, roles and compliance reports with their ids, and listCompanies, listDocuments, listReports and listLegalActs find the rest; a work product is found by its kind (getWorkProduct with the company alone lists them, earlier versions included), and the action register by its company. A new tool that takes an id needs the same — a list tool, or its rows in the context.
**A tool's input says what the model must give.** A parameter is required when the tool cannot do its work without the model's decision (a document's kind in attachDocument, a role's sources in saveRole); required with `null` allowed when `null` is an answer of its own and leaving the key out would pick a behaviour unasked (the company in listDocuments and searchCompanyDocuments: `null` is every document of the user's); optional otherwise — and then a write keeps what it does not name. updateCompany sends the recorded members of `attributes` and `financialMarket` with the given ones over them, because Django replaces such a field whole; addCredential completes a credential that exists and never empties a field or withdraws a verification — updateCredential does both. An update that names no field is refused (`NOTHING_TO_CHANGE`) rather than answered with the unchanged record. A text with a lower bound is trimmed before the bound is checked (`filled` in `llm/tools/shared.js`), so spaces alone are no name, and a credential's date is a day of the calendar. A list without its filter is the user's own: listCompanies, listDocuments and listReports ask Django for `scope=own`, so an administrator's chat lists nobody else's data; listObligations leaves out what a reviewer rejected unless it is asked for. A new tool is marked by the same rule. checkCitations is the one call that gives Django 150 s to answer instead of 15 (`JUDGE_TIMEOUT_MS`): a model judges the claims first.

- Plus the tools of the MCP servers an administrator enabled, named `mcp_<server>_<tool>` (at most 40 per server; a call times out after 30 s, its answer is cut to 20 000 characters).

Every call goes to Django's public API with the user's bearer, so the model can never reach another user's data. The company and document lists are the user's own (`scope=own`), also for an admin. A failed call becomes a `[CODE] … failed` result the model reads and the GUI shows on the tool pill; it never ends the stream.

## Configuration and limits

Every variable is read once, in `app/config.js`, which documents it. A value
that is not a plain integer in range falls back to the default with a boot
warning.

| Variable | Default | Meaning |
|---|---|---|
| `DJANGO_URL` | `http://legalops-django:8000` | Django, for the public API and the internal door |
| `ASSISTANT_INTERNAL_SECRET` | empty | The shared secret of both internal doors; empty refuses every internal call |
| `AI_GATEWAY_URL` / `AI_GATEWAY_KEY` | `https://ai.knf.vu.lt/v1` / empty | The OpenAI-format gateway (see below); without a key the chat answers 503 `NOT_CONFIGURED` |
| `AI_CHAT_MODEL` / `AI_EMBED_MODEL` | `gateway:azure/gpt-5.5` / `gateway:azure/text-embedding-3-large` | The chat model when a prompt version names none; the embedding model (1536 dimensions — the width of Django's vector columns) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL` | empty | Optional providers for `anthropic:`, `openai:`, `ollama:` model ids |
| `CHAT_TIMEOUT_MS` / `CHAT_STEP_TIMEOUT_MS` / `CHAT_CHUNK_TIMEOUT_MS` | 900 000 / 300 000 / 90 000 | A whole turn / one model step / the silence between two chunks |
| `GENERATE_TIMEOUT_MS` / `EMBED_TIMEOUT_MS` | 900 000 / 60 000 | One internal generation, read from the provider as a stream (Django waits 930 s for it) / one embedding batch |
| `RATE_LIMIT_TURNS` | 12 | Chat turns per user a minute |
| `IDENTITY_CACHE_MS` | 15 000 | How long a validated bearer is trusted (0 = ask Django every turn) |
| `SHUTDOWN_GRACE_MS` | 190 000 | How long live turns may finish after SIGTERM (but Docker kills the container after 10 s: compose sets no `stop_grace_period`) |
| `PORT` | 3000 | |

Compose passes only `DJANGO_URL`, `ASSISTANT_INTERNAL_SECRET`, the two
gateway variables and the two model ids; the others take their defaults
unless you add them to the service's `environment`.

**The gateway.** Language models go to its Responses API (`/v1/responses`),
not chat completions: GPT-6 Astra and GPT-6.1 Sol take function tools only
there. Every call is stateless (`store: false`): nothing is kept at the
gateway or at Azure, and a tool turn sends its earlier steps back in full —
a reasoning model's reasoning as the encrypted item it came back as, which
never reaches the browser or the stored reply. Reasoning models (GPT-5 and
later, the o series) are sent no temperature. Embeddings go to
`/v1/embeddings`, the model list comes from `/v1/models`.

**What the provider caches.** A request's instructions, and a request as
a whole: a later request reads from the cache what it repeats word for word
from the start — the same instructions, or an earlier request it repeats or
extends — and nothing of a message that only begins alike. Input read from
the cache costs a tenth to a twentieth of the input price; every other input
token is billed as written to the cache, a quarter above the input price.
Measured 2026-11-10/11 on gpt-6.1-sol: an 8 800-token block sent twice was
read from the cache when it stood in the instructions, and written anew as
the opening of a user message whose end differed, as a message of its own
before a different one, with a `promptCacheKey` and with a retention hint; a
request that added an answer and a new question to an earlier one read all
of the earlier one. So:

- `/internal/llm/generate` takes a step's `shared` data (a report's company
  profile and documents) apart from the `prompt` and places it behind the
  instructions; Django runs the first call of such a step alone, and the
  rest read the block from the cache.
- A chat turn's steps each extend the one before, so a step reads its
  instructions and the earlier steps from the cache and pays in full only for
  what the last step added.
- Usage is counted in five numbers (`llm/usage.js`) and Django prices each
  part; `/internal/llm/models` carries the two cache prices.

**Rate limits.** The provider counts tokens per minute. The SDK retries a
429 twice; one that outlasts that — or arrives inside a stream that had
begun, as Azure's token rate limit does — is answered to Django as a 429
with the wait the provider names (`retryAfterS`), and a job step waits it
out instead of failing. In the chat it is a "try again" notice.

Fixed limits: one user message of at most 30 parts and 60 000 characters,
512 kB of JSON on the chat routes (16 MB on the internal door), 12 model
steps per turn (the last one without tools), a rebuilt history of at most
200 messages and 400 000 characters (whole old turns dropped first), at most
256 texts per embedding call.

**Shutdown.** On SIGTERM the process refuses new connections (503
`SHUTTING_DOWN` on a kept-alive one), lets the live turns finish for up to
`SHUTDOWN_GRACE_MS`, stores the stragglers as "interrupted" and exits 0.

## Tests

`./runTests.sh` (from `assistant/`) builds the production image and runs
the `node --test` suite inside it — no network, read-only, uid 1000 —
with only the service's own folder mounted (its tests and this README):
no test reads another service's files.
Django is a scripted stub, every model a mock or a local fake; nothing
leaves the machine. The opt-in live smoke layer
(`tests/live-smoke.test.mjs`, `RUN_LIVE=1`) checks the running service
after a deploy, at no cost. How to run one file or the live layer, the
conventions (`expectFailure` pins with `ASSISTANT-*` IDs, helper
ownership) and what every test file pins:
[app/tests/README.md](app/tests/README.md).

The structural rules read this README: every route must be named in it,
and it may not name an assistant path that does not exist.

## Development

The `# Dev` toggles on `legalops-assistant` in `docker-compose.yml` select
`Dockerfile.dev` (nodemon over the `./assistant/app:/app` bind mount) and
the external network for npm; saving a file restarts the dev assistant.
Production runs the baked image (`node server.js`, `npm ci --omit=dev`).
