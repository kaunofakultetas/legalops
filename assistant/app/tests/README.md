# Assistant regression tests

Regression tests for the node AI service (`assistant/app`): the Express
app, the chat stream, the internal doors, the model layer, the Django
clients and the process itself. They are plain `node --test` files
(ESM, `node:test` + `node:assert/strict`, no test dependency) and run
**inside a container, never on the host** — the host has no node.

Everything is local: Django is a scripted stub, every model is a
`MockLanguageModelV4` or a local fake, MCP servers are local doubles.
No test calls a provider, the gateway or anything past loopback, except
the opt-in **live smoke layer** (`live-smoke.test.mjs`), which checks
the running service and is skipped unless `RUN_LIVE=1`.

## Running

From `assistant/`:

```bash
./runTests.sh                                   # the whole suite
./runTests.sh tests/server.test.mjs             # some files
./runTests.sh --test-name-pattern='SIGTERM'     # any node --test flag
```

`runTests.sh` builds the **production image** (`assistant/Dockerfile`:
`npm ci --omit=dev` from `package-lock.json`, tagged
`legalops-assistant-check`), so the suite proves the shipped
dependencies suffice. The container runs like the real one — read-only
root, uid 1000, `/tmp` a tmpfs, `NODE_ENV=production` — with
`--network none` (a test that reaches past loopback fails instead of
calling out), none of the stack's secrets (the tests set fake ones) and
the shared host's limits (`--cpus=4 --memory=3g`). It is named per run
(`legalops-assistant-tests-<pid>`), so two runs may overlap.
`--test-force-exit` ends each file's process once its tests are done.
Without it, a handle a test leaves open would hold the run forever,
because node's `--test-timeout` does not bound a file's process. The
suite does not lean on it today: every file exits on its own within a
second of its last test.
The tests are never baked into the image (`.dockerignore` drops
`app/tests`); they are mounted read-only, and nothing outside the
service's own folder is — no test reads another service's files:

| Mount | From | Read by |
|---|---|---|
| `/app/tests` | `app/tests` | the suite itself |
| `/README.md` | `assistant/README.md` | every route is in the service README |

Iterating on one file is faster against the working tree — no image
build, the dev dependencies of the bind mount:

```bash
sudo docker run --rm --network none -v /apps/aplikacijos/comp-assistant/assistant/app:/app -w /app \
  --cpus=4 --memory=3g node:24.16.0 node --test --test-force-exit tests/<file>.test.mjs
```

Without the mount the README rules are **skipped with the
reason** (`﹣ … # the service README is not mounted …`), so a bare run can pass
while never checking them — before a deploy, always go through
`runTests.sh`. The dev container bind-mounts `app/` under nodemon:
saving a file restarts the dev assistant, which is expected.

### The live smoke layer

`live-smoke.test.mjs` checks the **running** assistant, at no cost and
without starting a chat turn:

- `/health` answers and names a configured model.
- The 404 and 405 envelopes come back as JSON.
- The chat refuses a request with no bearer (`AUTH_REQUIRED`), and a
  made-up bearer after asking Django (`SESSION_INVALID`). The second
  check proves Django answers the assistant.
- The internal door refuses a missing or a wrong secret.
- With the service's own secret, the gateway's model list holds the
  configured chat and embedding models.
- No answer carries the gateway key or the secret.

It is skipped unless `RUN_LIVE=1`, so `runTests.sh` never runs it. In
dev mode, run it inside the running container (`app/` is mounted
there):

```bash
sudo docker exec -w /app -e RUN_LIVE=1 legalops-assistant node --test tests/live-smoke.test.mjs
```

The production image does not carry the tests. In either mode, run
them from `assistant/` in a throwaway container of the stack's own image
that shares the running assistant's network. `--env-file ../.env` gives
it the stack's secret and key, for the gateway check and the leak check;
leave it out and the gateway check is skipped with its reason.

```bash
sudo docker run --rm --network container:legalops-assistant --read-only --tmpfs /tmp --user 1000:1000 \
  --env-file ../.env -e RUN_LIVE=1 -v "$PWD/app/tests:/app/tests:ro" -w /app \
  legalops-assistant node --test tests/live-smoke.test.mjs
```

Do not run the dev-mode command right after saving a file under `app/`:
the restart nodemon triggers can catch the first checks.

## The environment

- **Process isolation.** `node --test` runs every file in its own
  process, and `config.js` reads the environment once per process. A
  file imports `./env.mjs` first (ESM hoists imports): it sets the
  internal secret (`s3cret`), a gateway key and URL
  (`http://gateway.invalid/v1`, never reached) and lifts the turn limit
  to 1000 — before `config.js` loads. A file that needs other settings
  sets them before its first dynamic import (`ratelimit.test.mjs`,
  `chat-limits.test.mjs`, `internal.test.mjs`, `embed-timeout.test.mjs`)
  or spawns a child (`config.test.mjs`, `server.test.mjs`,
  `internal-auth.test.mjs`).
- **Django** is `stubDjango.mjs`: routes as `"METHOD /regex"` → `{ status,
  json }`, every request recorded with its bearer, secret, X-Real-IP and
  body; `DJANGO_URL` is read at call time, so the stub's random port is
  set after import. `helpers/rawServer.mjs` is the misbehaving upstream
  (HTML pages, empty bodies, bodies cut off, silence).
- **Models** are `mockModel.mjs` scripts (`textStream`,
  `toolCallStream`, `slowTextStream`, `scripted`) planted with
  `setModelForTests`; `helpers/liveModel.mjs` adds provider-like timing
  and aborts, `helpers/fakeGateway.mjs` is a local OpenAI-format gateway
  for the real provider code, `helpers/serverPreload.mjs` plants a
  model in a spawned `server.js`.
- **Time.** Caches and windows are tested with `Date.now` mocked
  (`t.mock.method(Date, "now", …)`), ceilings by capping
  `AbortSignal.timeout` — never by sleeping through a real 15 s or 60 s.
- **Test hooks in the source**, exported for the tests only:
  `setModelForTests` (llm/provider.js), `resetIdentityCacheForTests`,
  `resetPromptCacheForTests`, `trackedWindowsForTests`.

## Conventions

- **House style** for test files too: the `// ---` banner header
  saying what the file pins, a banner (with "Used by") per helper, 7
  blank lines between top-level sections, double quotes.
  `structural.test.mjs` enforces the header on every file and the
  full banner rules on the shipped source.
- **Known defects are `expectFailure` tests with an ID**, the correct
  behaviour asserted:

  ```js
  test("… [ASSISTANT-CORE-2]", { expectFailure: "ASSISTANT-CORE-2: <one line>" }, async () => { … });
  ```

  While the defect is there, the test fails as expected and passes the
  suite (`✔ … # EXPECTED FAILURE`). Once the defect is fixed, the test
  passes, and that **fails the run** ("test was expected to fail but
  passed"), which is the cue to drop the option. The reporter does not
  print the option's text, so the ID also goes into the test name. A
  `todo` test is the wrong tool: node counts a todo that passes as a
  pass, so a fixed defect would stay pinned in silence.
  `structural.test.mjs` refuses todo tests and unnamed pins. IDs are
  per area: `ASSISTANT-CORE-*` (config, app, server, middleware,
  services, structural rules), `ASSISTANT-ROUTES-*` (routes/),
  `ASSISTANT-LLM-*` (llm/). A defect pinned in someone else's area is
  reported with file:line and a suggested fix, never edited there.
- **Fixing one**: drop the `expectFailure` option, name the test "(…
  FIXED <date>)" and keep it as the regression guard; the file header
  lists the fixed defects. The structural rules keep their known gaps
  as **exact** lists next to the pinned test: a new gap fails at once,
  and a closed one fails too until it is struck from its list.
- **A turn a test stops mid-answer runs on `helpers/liveModel.mjs`**,
  whose stream stops on the abort the way a provider's does.
  `mockModel.mjs`'s `slowTextStream` keeps talking after an abort. The
  stop tests once used it, and that hid a wiring difference from the
  route and kept the AI SDK's 90 s chunk timer alive after the test.
- **Helpers**: the shared ones (`env.mjs`, `stubDjango.mjs`,
  `mockModel.mjs`) never change the behaviour of an existing export;
  new helpers go into new files under `tests/helpers/`; appending an
  export to a shared helper is for the truly shared, re-reading it
  first.
- **Secrets in tests are distinctive** (`srv-internal-secret-4f2a`,
  `transcript-bearer-5d8e`, …) so a leak into a log, a body or a model
  prompt is unmistakable — several tests assert exactly that.

## Suites

| File | Pins |
|---|---|
| `app.test.mjs` | the app: the whole route table answering JSON, 405 + Allow for a wrong method and 404 for an unknown path as JSON envelopes, the /internal gate before everything on that door, no X-Powered-By, JSON-only (OPTIONS the router's text Allow list), the 512 kB / 16 MB body limits at the byte, routing quirks, /health |
| `chat.test.mjs` | one chat turn end to end: the slim body, the server-side transcript (user message upserted as the user, branch rebuilt from Django, reply persisted in the GUI's row format, turn log), the SSE wire as the GUI's own transport reads it (its charset named — a client decoding by Content-Type reads Lithuanian intact, ASSISTANT-LLM-19), locale, company and role in the prompt, tools and their failures, MAX_STEPS and the never-silent lines, stream errors as codes, persistence failures kept from the browser, the turn surviving the browser |
| `chat-gate.test.mjs` | every refusal before model spend, in its order: identity (no bearer AUTH_REQUIRED without asking Django, a refused bearer SESSION_INVALID, Django down or answering without a user 502 — never a sign-out), the body gate field by field with its size edges and the legacy body, bad JSON / content type / charset / size, the daily budget (spent, unlimited, failing open), the prompt store, thread tenancy, Django refusing the user message — each a JSON envelope with its status and code, also through the AI SDK's chat transport the GUI sends with. NOT_CONFIGURED and the turn limit need their own process: `chat-limits.test.mjs` |
| `chat-limits.test.mjs` | its own process (3 turns a window, short model timeouts, no gateway key): 503 NOT_CONFIGURED without credentials, before the turn limit (/health missing-key); the turn limit through the route (Retry-After, per user, a malformed request spends a turn); the chunk / step / turn timeouts as MODEL_TIMEOUT, the partial reply stored as "timeout" |
| `chat-mcp.test.mjs` | external MCP tools inside a turn: offered and labelled as external, credentials never leaking, a failing server skipped, connections closed however the turn ends, the calls in the turn log, arguments the server's schema refuses kept from the server (ASSISTANT-LLM-23) |
| `chat-runs.test.mjs` | a turn's life through the routes: status, stop (owner only, idempotent, "stopped"), the GUI's stop, a browser leaving never stopping the turn, supersede ("interrupted"), /health's live count |
| `clientIp.test.mjs` | the one trusted hop: X-Real-IP accepted only as a real IPv4 / IPv6 literal, the socket peer otherwise, every other forwarding header ignored, trust proxy off, what reaches Django and the log |
| `config.test.mjs` | every env variable's default, parsing and range; invalid numbers falling back with a warning (no more NaN timeouts or a disabled turn limit); URL trailing slashes; secrets byte for byte, blank = unset, failing closed; one load per process |
| `django.test.mjs` | publicFetch / internalFetch / userClient: which headers ride which door, the status and code map, empty / non-JSON / cut-off bodies, Django down / silent / stalled within the 15 s ceiling, DJANGO_URL at call time, the 401 broadcast |
| `embed-timeout.test.mjs` | its own process, the real gateway provider against `helpers/fakeGateway.mjs`: EMBED_TIMEOUT_MS — a healthy or a slow-but-in-time batch answers, a hung gateway is cut at the ceiling as 502 EMBEDDING_FAILED naming the timeout, the provider call aborted and not retried (ASSISTANT-CORE-4) |
| `errors.test.mjs` | the error envelope and HttpError, every body-parser failure, unknown errors as a bare 500 (the cause in the log only), a broken %-escape as 400, only a 429 exposing its wait, a failure after the headers, the 404 envelope, the provider-budget classification, plus the original cache pins |
| `identity.test.mjs` | bearer → user via /api/auth/me, the Django-identical header parse, guests, the cache (TTL, bound, eviction by any 401, the IP never cached), and the status map — only Django's 401 is a 401 |
| `internal-auth.test.mjs` | the shared-secret gate: every wrong shape refused on every internal route, constant-time compare (a timingSafeEqual spy), header case, failing closed without a secret, the gate before the JSON parser |
| `internal-mcp.test.mjs` | POST /internal/mcp/list-tools, the admin's connection test: the config validated field by field, both transports and protocol generations, pagination, every failure as 502 MCP_UNREACHABLE, credentials never echoed or logged |
| `internal.test.mjs` | /internal/llm/generate, /embed, /models for the worker: the secret checked before the body is read (ASSISTANT-ROUTES-9), validation and edges, the request as the model gets it, schema-forced objects checked, the answer read from the model's stream (many small parts answered whole; a stream that fails after it began is a failed call with the provider's own error, never a shorter answer), provider failures by status class, AI_BUDGET_EXHAUSTED after one call (ASSISTANT-ROUTES-10), the model used named even when the body names none (ASSISTANT-ROUTES-11), GENERATE_TIMEOUT_MS, the gateway model list and its cache |
| `live-smoke.test.mjs` | opt-in (`RUN_LIVE=1`), against the RUNNING assistant: /health, the 404 / 405 envelopes, the chat's AUTH_REQUIRED and — Django asked — SESSION_INVALID, the internal door's refusals, the gateway's model list holding the configured models, no secret in any answer; no chat turn, no cost |
| `mcp.test.mjs` | llm/mcp.js: the registry and its caches, tool namespacing, allowlists and caps, schemas compiled by zod — local `$ref`s resolved first (zod-to-json-schema's `#/properties/…`, draft-07 `#/definitions/…`, recursion kept once, a blow-up kept once throughout), a fault that remains withholds the tool, recorded in the turn log (ASSISTANT-LLM-22) — and arguments checked before the call (ASSISTANT-LLM-23), isolation of every kind of broken server, credentials, lazy connections and close(), result shaping, listServerTools |
| `messages.test.mjs` | llm/messages.js: documentNote, the per-role part allowlists, tool parts without a toolCallId dropped (ASSISTANT-LLM-21), a stored rawInput replayed as the input without the SDK's warning (ASSISTANT-LLM-24), toModelMessages (pruning, incomplete calls, unicode), fitHistory, and the forged-assistant-row guard (ASSISTANT-LLM-09) |
| `prompt.test.mjs` | llm/prompt.js: the Vilnius clock, every placeholder, the company / role / user blocks and their caps, the injection discipline (fences, enums, `$'` replacement patterns), "linked but not loaded", turn notes |
| `prompts-service.test.mjs` | services/prompts.js: the active version through the internal door, the one-minute cache, 404 as "no active prompt" (PROMPT_NOT_CONFIGURED through the route), stale-while-failing with a 5 s retry, a cold failure as 503 PROMPT_UNAVAILABLE, whatever the failure |
| `provider.test.mjs` | llm/provider.js: model id parsing, loud failures without credentials, the gateway wire against a local fake (x-bf-vk + bearer, usage, strict schemas, embeddings), failures as budget / unavailable (a quota 429 asked once through finalBudgetRefusals), the other providers in a child process |
| `ratelimit.test.mjs` | the turn limiter with a 3-turn limit and a mocked clock: the fixed window, Retry-After counting down, a refused turn not counting, isolation, the sweep of expired windows, the route order (after identity, before the body) |
| `runs.test.mjs` | the run registry: start, status and stop for the owner only, a double stop, idempotent finish, supersede, first reason wins, drainRuns (idle, early, stragglers aborted as "shutdown", the settle time) |
| `server.test.mjs` | server.js spawned for real: PORT and the log line, Keep-Alive 65 s, the boot warnings, SIGTERM / SIGINT drains (turns finish and persist, streams end cleanly, new connections refused, kept-alive ones closed, 503 SHUTTING_DOWN, stragglers "interrupted", exit 0), a second signal, unhandled rejections, a taken port, no secret in the output |
| `stream.test.mjs` | llm/stream.js: shapeTurn (the empty line only for a turn with no text, ASSISTANT-LLM-20), streamErrorText, pipeToResponse (the SDK's headers with the charset named, framing, backpressure, a vanished client), the SDK's own rawInput deprecation filtered while every other SDK warning is logged as the SDK words it (ASSISTANT-LLM-24), and whole turns through the real SDK loop wired as routes/chat.js wires it |
| `structural.test.mjs` | source-level rules: banner headers everywhere and the full banner rules in the source, the route table exact and named in the service README (and no route there that is gone), no secret handed to console.*, every fetch() bounded by a timeout, config.js the one env reader with every variable documented in its header, known defects pinned with `expectFailure` and an ID (never `todo`) |
| `title.test.mjs` | services/title.js: cleanTitle (quotes, a final full stop, markdown, a label, extra lines, the 80-character cut by characters), and the conversation's title through the chat route — asked only while Django reports the automatic title, from the opening of the thread's first message fenced as data, on the chat.title prompt's model, stored before the stream ends and logged as purpose chat_title; no active version or a failing model leaves the automatic title and never touches the answer |
| `tools.test.mjs` | the tool set as a whole: the inventory, strict schemas, the bearer and IP on every call of every tool, Django's code reaching the model, the main flows |
| `tools-actions.test.mjs` | the action register's one tool, which only reads (nothing but a GET of the register and of the law's changes reaches Django, whatever is asked): the live actions unasked in Django's order and the closed only when asked for, the counts by state as shown, what an action closes in the wording of Django's register workbook with the mark of a confirmed finding, the mark of an action only a person can close (`closedOnlyByHand`, with its sentence in `next` only when one is listed), how a closed action was closed and by whom, the date of the report it came from, the law's changes with the findings to look at again (present, absent, capped), the law-changes route failing softly while the register's own refusal fails the call, the strict schema, and a description that says what moves the register |
| `tools-companies.test.mjs` | the company tools one by one: schemas, the exact request as the user, the result the model reads, refusals, the duplicate guards (ASSISTANT-LLM-13) |
| `tools-corpus.test.mjs` | the legal corpus tools: schemas and bounds, the exact requests, the citation fields the GUI renders, the check verdicts with Django's note (ASSISTANT-LLM-14) |
| `tools-documents.test.mjs` | the document tools: the user's own uploads (ASSISTANT-LLM-15), readDocument's window walk and section jumps (ASSISTANT-LLM-16), search and attach |
| `tools-programme.test.mjs` | the two work-product tools: a start for one kind of one company and where its draft will be, Django's refusals relayed as results instead of failures (a start refused as already running names the product in generation), a product found by company and kind and an earlier version by the id the list names, the compact read of every kind pinned whole (provisions as one string with their warning marks, quotes as document titles, the structure outline, a step of the process with what is done in it and its matrix row by role name, the rules not kept in words, the criteria and the positions on request only), capped lists, and three real products (`fixtures/`) staying under 14 kB with nothing of the raw content in the answer |
| `tools-reports.test.mjs` | the report tools and the money gates: a run only for an accepted upper bound of the same scope, the cost gate failing closed (ASSISTANT-LLM-17), the stop for the user's approval of the acts (the waiting report's `scope`, the approval priced again, Django's refusals), the cards the GUI renders, what a finding means (`canCost` in the wording of Django's `consequence_text`, for a gap only, never under an act not yet in force, and capped; `cause` only once a person wrote it), and the company's own requirements kept apart from the law: priced and started only with `internalRequirements`, counted under `ownRequirements`, absent from the acts' counts and lists, listed as the act `internal` with a policy passage as the `criterion`; and the look back of a company with earlier reports — `before` on a finding, `sinceLastReport` on the overview, neither for a first report |
| `tools-shared.test.mjs` | the tools' shared kit: ToolFailure's shape, url encoding and the dot-segment guard (ASSISTANT-LLM-12), query, defineTool's telemetry and failure translation, the enums |
| `transcript.test.mjs` | services/transcript.js: the branch walk and row decoding (a wrapped, browser-forged row never decodes; a stored tool part without its toolCallId never reaches the provider, ASSISTANT-LLM-21), storable writes (NUL / lone surrogates), Django's size measure and the preview, the four Django calls, and one real turn's turn log: exact shape, tool calls, usage, unicode, no secret anywhere |

## Helpers

| Helper | What it is | Used by |
|---|---|---|
| `env.mjs` | the environment set before config.js loads (secret `s3cret`, a gateway key, `gateway.invalid`, 1000 turns) | most files |
| `stubDjango.mjs` | scripted Django: routes by `"METHOD /regex"`, every request recorded | the Django-facing files |
| `mockModel.mjs` | scripted `MockLanguageModelV4` streams | the model-facing files |
| `helpers/chatApp.mjs` | the chat bench: thread, stored history, the stub routes of a normal turn, the app, one slim-body POST | `chat*.test.mjs` |
| `helpers/sse.mjs` | the SSE wire read strictly, incrementally, and as the GUI's own transport reads it | `chat*.test.mjs` |
| `helpers/liveModel.mjs` | provider-like streams: timed chunks, stalls, aborts as undici delivers them — every turn a test stops mid-answer | `chat.test.mjs`, `chat-runs`, `chat-limits`, `stream` |
| `helpers/fakeMcp.mjs` | a scripted MCP server, both transports and protocol generations | `chat-mcp`, `internal-mcp` |
| `helpers/mcpServer.mjs` | a scripted MCP double for llm/mcp.js | `mcp.test.mjs` |
| `helpers/fakeGateway.mjs` | a local OpenAI-format gateway: chat (plain, streamed), embeddings, hang / stall scripts, extra answer headers (retry-after-ms) | `provider.test.mjs`, `embed-timeout` |
| `helpers/toolKit.mjs` | the tool kit: the stub, a user's tool set, schema-first calls, the tenancy check | `tools*.test.mjs` |
| `helpers/process.mjs` | child node processes: `runNode` (a script to its end), `spawnNode` (long-lived), `freePort` | `config`, `internal-auth`, `server` |
| `helpers/rawServer.mjs` | a misbehaving upstream: HTML pages, empty or cut bodies, silence | `django`, `identity`, `prompts-service` |
| `helpers/serverPreload.mjs` | the `--import` preload that plants a scripted model in a spawned `server.js` | `server.test.mjs` |
| `fixtures/product-*.json` | three real work products (policy, governance, risks) of the demo company as Django's single-product route answers them, cut down with every field kept | `tools-programme.test.mjs` |

## Open pins

The open pins are the `# EXPECTED FAILURE` lines of `./runTests.sh`;
today there are none. The last ones, ASSISTANT-CORE-1 … 3 (routes
missing from `docs/markdown/en/api.md` and the service README, codes missing from the GUI's
`CODE_KEYS`), were closed on 2026-09-27; the README's, ASSISTANT-CORE-2,
stays as a regression guard in `structural.test.mjs`. The other two read
files of other services and were dropped with the rule that the suite
reads nothing outside its own folder. The fixes of 2026-09-28 (ASSISTANT-LLM-19 …
26, ASSISTANT-ROUTES-10 and 11) are listed in the headers of the files
that guard them.

## Not covered here

- Django itself (its own suite: `django/runTests.sh`), Caddy's routing
  and headers (`endpoint/Caddyfile`), the GUI (`vite/runTests.sh`).
- The real providers over the internet — by design; the provider code
  runs against `helpers/fakeGateway.mjs`. The live smoke layer only
  reads the gateway's model list; no completion or embedding is asked
  for, because those spend the AI budget.
- `server.js`'s `requestTimeout = 0` / `headersTimeout` (only the
  Keep-Alive timeout is observable in a test).
