# API reference

The Django service answers every route below under `/api/*`. The node assistant answers `/api/assistant/*`. The Caddy ingress exposes both on the same origin as the GUI. `django/compliance/urls.py` is the authoritative table of contents: every view file starts with a header listing its routes and body shapes.

## Conventions

- **Auth.** `Authorization: Bearer <token>`. Obtain a token from `POST /api/auth/login`; it lasts 30 days, and an account keeps its 10 newest sessions (an 11th login ends the oldest). The API takes no cookie auth (the one cookie, the gate cookie below, is read only by the admin tools' gate) and there is no self-registration.
- **Roles.**
  - `user` sees only their own companies, documents, threads, reports, jobs and usage.
  - `admin` additionally manages users, the corpus, obligations, prompts, MCP servers and the audit trail. An admin sees every company, document, report, job and model call (the usage log, chat transcripts included), but never other users' chat threads.
  - Denied reads answer 404, not 403: a row the caller may not see does not exist for them. A plain user on an admin-only route gets 403 `FORBIDDEN`.
- **Paths.** Django's routes have no trailing slash; the same path with one is a 404.
- **Bodies.** JSON in and out, UTF-8 kept literal.
  - Datetimes are ISO 8601 with offset (`2026-09-27T18:00:00+00:00`).
  - Ids are uuid4 strings.
  - Bodies containing NaN/Infinity (also overflowed numbers such as `1e999`), NUL characters or lone surrogates, or nesting deeper than 32 levels are refused as a missing body (400 `INVALID_BODY` on most routes).
  - The endpoint caps no body. Django refuses a file over its per-file limit (413 `FILE_TOO_LARGE`, the limits under each upload route), the assistant a chat body over 512 kB (413 `PAYLOAD_TOO_LARGE`).
- **Errors.** Django always answers `{"error": "prose", "code": "SLUG"}`, with a meaningful HTTP status; a 502 from the endpoint itself (an upstream down or restarting) has an empty body, and so has its 403 to a request whose `Origin` header names another site (a page of another origin calling the API; a client that sends no `Origin` is not affected). The node assistant (`/api/assistant/*`) answers `{"message": "prose", "error": {"code": "SLUG", "message": "prose", "retryAfterS"?}}`. The Django codes:

| Status | Codes |
|---|---|
| 400 | `INVALID_BODY`, `MISSING_FIELDS`, `INVALID_FIELD`, `INVALID_QUERY`, `INVALID_VALUE`, `EMPTY_UPDATE`, `BAD_REQUEST`, `MISSING_FILE`, `INVALID_EMAIL`, `INVALID_ROLE`, `WEAK_PASSWORD`, `WRONG_PASSWORD`, `LAST_ADMIN`, `SELF_LOCKOUT`, `UNKNOWN_MODEL`, `NOTHING_TO_ASSESS`, `NOTE_REQUIRED` |
| 401 | `AUTH_REQUIRED` (no or dead session), `INVALID_CREDENTIALS` (login) |
| 402 | `AI_BUDGET_EXHAUSTED` — from the assistant (the AI provider's own budget is used up); a report run that died of it carries the code at the start of its error text |
| 403 | `FORBIDDEN`, `ROLE_NOT_ALLOWED`, `INTERNAL_ONLY` |
| 404 | `NOT_FOUND`, `PROMPT_NOT_CONFIGURED` (the internal door: a prompt without an active version) |
| 405 | `METHOD_NOT_ALLOWED` (with an `Allow` header) |
| 409 | `ALREADY_RUNNING`, `CORPUS_EMPTY`, `NOT_CANCELLABLE`, `STILL_RUNNING`, `NOT_FINISHED`, `NOT_INGESTED`, `DUPLICATE_NAME`, `SLUG_TAKEN`, `MESSAGE_ID_TAKEN`, `EMAIL_TAKEN`, `UNCHANGED`, `NO_FILE`, `ALREADY_ADOPTED`, `NOT_WAITING`, `CLOSED_BY_REPORT`, `NO_DOCUMENTS`, `NOT_DRAFT`, `RULES_BROKEN`, `NOT_APPROVED`, `NEWER_VERSION`, `NOT_READY`, `UNKNOWN_KIND` |
| 413 | `FILE_TOO_LARGE`, `QUOTA_EXCEEDED`, `MESSAGE_TOO_LARGE` |
| 429 | `RATE_LIMITED` (with `Retry-After`), `BUDGET_EXCEEDED` |
| 500 | `SERVER_ERROR` |
| 502 | `MODEL_ERROR` |
| 503 | `MODELS_UNAVAILABLE` (the gateway's model list could not be read) |

  The assistant's chat routes add: 400 `INVALID_JSON`, `INVALID_THREAD`, `INVALID_TRIGGER`, `INVALID_MESSAGE`, `INVALID_PARENT`, `INVALID_PART`, `INPUT_TOO_LARGE`, `EMPTY_MESSAGE`; 401 `SESSION_INVALID`; 404 `THREAD_NOT_FOUND`; 413 `PAYLOAD_TOO_LARGE`; 415 `UNSUPPORTED_ENCODING`; 500 `HISTORY_UNREADABLE`; 502 `DJANGO_UNREACHABLE`; 503 `NOT_CONFIGURED`, `PROMPT_NOT_CONFIGURED`, `PROMPT_UNAVAILABLE`, `SHUTTING_DOWN`. A failure after the stream started arrives inside the stream as an error chunk carrying `MODEL_TIMEOUT`, `STREAM_FAILED`, `AI_BUDGET_EXHAUSTED`, or a code that says whether trying again can help: `MODEL_UNAVAILABLE` (a passing failure — the network, a rate limit, the provider's 5xx: try again later), `MODEL_REFUSED` (the model will not take this request: pick another model), `MODEL_CONTEXT_EXCEEDED` (the conversation is longer than the model takes: start a new one), `MODEL_CONTENT_FILTERED` (the provider's content filter stopped it: rephrase) or `MODEL_ACCESS_DENIED` (the gateway refused the assistant's key: an administrator's matter). The assistant's internal routes answer further codes that only Django reads, 502 `MCP_UNREACHABLE` among them ("Internal door", below).

- **Budgets.** Model calls are logged with their USD cost (search-query embeddings are not logged). A user may spend `LLM_DAILY_BUDGET_USD` per UTC day (default $10.00), or their own `dailyBudgetUsd`; admins default to unlimited. Chat turns and prompt test runs are refused once it is spent. Starting a report needs at least $0.25 left; a started run is never stopped halfway. Document indexing counts too: once the budget is spent, an upload's `documents.index` job embeds nothing and re-queues itself for 00:05 UTC (its result: `{waitingForBudget: true, resumesAt}`). Obligation extraction inside a report run is shared corpus work and is not charged to the report's user; an extraction an admin queues from the corpus page is logged against that admin. When the AI provider's own budget is used up, calls fail with `AI_BUDGET_EXHAUSTED`.

## Health

| | |
|---|---|
| `GET /api/health` | `200 {status: "ok", service: "legalops-django", database: "ok", uploads: "ok"}`, or `503 {status: "error", service, reason: "database"\|"uploads", database, uploads}` naming the first failed check (never why; that is in the log). Public; `HEAD` works too. |

## Authentication — `users/api/auth_views.py`

| Route | Body → answer |
|---|---|
| `POST /api/auth/login` | `{email, password}` → `{token, user}`. The email is matched case-insensitively. An unknown email, a wrong password and a deactivated account all answer the same 401 `INVALID_CREDENTIALS`. Limited to `LOGIN_RATE_PER_IP` attempts per minute per client IP (default 60 — generous, because a classroom behind one proxy shares an IP) and 10 attempts per 10 minutes per account (the brute-force guard; every attempt counts, keyed on the account the email resolves to, whatever its spelling) → 429 `RATE_LIMITED` with `Retry-After`. Logins and failures are audited. |
| `GET /api/auth/me` | → `user` = `{id, email, displayName, role, active, dailyBudgetUsd, createdAt, lastLoginAt}` |
| `GET /api/auth/checkauth/admin` | The admin tools' gate, asked by Caddy's `forward_auth` before it passes a request on to `/dbgate/` → `user` for an active admin, 401 `AUTH_REQUIRED` without a valid session, 403 `FORBIDDEN` for any other role. The session counts from the bearer or, as a tool opened in the browser sends only cookies, from the gate cookie `compliance_gate` that login sets (HttpOnly, SameSite=Strict, Secure outside DEBUG, the session's 30 days) and both logouts expire. No other route reads that cookie. |
| `POST /api/auth/logout` | Kills the presented session and expires the gate cookie → `{ok: true}`. |
| `POST /api/auth/logout-all` | Kills every session of the caller, the presented one included, and expires the gate cookie → `{ok: true}`. Audited. |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` → `{ok: true}`. Password rules: at least 10 characters, at most 72 bytes (400 `WEAK_PASSWORD`; a wrong current password is 400 `WRONG_PASSWORD`). Every other session dies. The current-password check counts in the account's login window (429 `RATE_LIMITED`); a wrong one is audited. |

## Users (admin) — `users/api/users_views.py`

| Route | Body → answer |
|---|---|
| `GET /api/users` | → `{users}`: every account, deactivated ones included, oldest first. |
| `POST /api/users` | `{email, displayName, role?: "user"\|"admin" (default user), password}` → 201 user. The email is stored lower-cased; one taken in any casing is 409 `EMAIL_TAKEN`. Also 400 `INVALID_EMAIL`, `MISSING_FIELDS`, `INVALID_ROLE`, `WEAK_PASSWORD`. |
| `GET /api/users/{id}` | → user |
| `PATCH /api/users/{id}` | `{displayName?, role?, active?: bool, dailyBudgetUsd?: null\|number}` → user. For `dailyBudgetUsd` (0–10000), `null` means the default and `0` means unlimited. Deactivating drops the account's sessions. An empty change is 400 `EMPTY_UPDATE`. |
| `DELETE /api/users/{id}` | Deactivates the account and drops its sessions → the deactivated user. |
| `DELETE /api/users/{id}?purge=true` | Deletes the account for good, active or not, together with what it owns: its companies (their reports, credentials and roles), its documents (text, search chunks, and the files once committed) and its conversations → `{ok: true, removed: {companies, reports, documents, threads}}`. A document another account put into one of its companies stays, detached. The usage log keeps its calls and costs but loses the chat transcripts; usage and audit rows keep their history without the account link. Never the caller's own account (400 `SELF_LOCKOUT`) or the last active admin (400 `LAST_ADMIN`); 409 `STILL_RUNNING` while an analysis of one of its companies is queued or running. Audited (`users.purge`, with the email and the counts). |
| `POST /api/users/{id}/reset-password` | `{password}` → `{ok: true}`. Every session of that account dies. |

The last active admin cannot be demoted or deactivated (400 `LAST_ADMIN`), and nobody can demote or deactivate themselves (400 `SELF_LOCKOUT`). Every change is audited.

## Companies — `companies/api/company_views.py`, `standard_views.py`, `role_views.py`

| Route | Body → answer |
|---|---|
| `GET /api/companies?scope=own&q=` | → `{companies}`, at most 500, most recently updated first. `q` matches word by word: every word must appear in the name or the registration code, in any order and case; punctuation, legal forms (UAB, LTD, …) and "company" / "įmonė" are skipped, and a query of those words alone is matched whole. `scope=own` narrows an admin to their own companies. Every company carries `ownerId` and `ownerName` (the owner's display name, else the email). |
| `POST /api/companies` | `{name, …profile}` → 201, the company with `credentials`, `standards`, `roles`, `documents` |
| `GET /api/companies/{id}` | The same detail shape. |
| `PUT /api/companies/{id}` | A partial update: any subset of the profile fields; unknown keys are ignored. A wrong value is 400 `INVALID_FIELD`. |
| `DELETE /api/companies/{id}` | Deletes credentials, adopted standards, roles, reports and work products; documents are detached, not deleted → `{ok: true}`. Returns 409 `STILL_RUNNING` while an analysis runs or a work product is being generated. |

**Profile fields**

| Field | Type |
|---|---|
| `name` | Required text (≤ 500 characters) |
| `registrationCode`, `legalForm`, `sector` | Text (≤ 500 characters) |
| `country` | Text, default `LT`; a two-letter code is stored upper-cased |
| `naceCodes` | List of up to 50 codes (≤ 20 characters each) |
| `sizeCategory` | `micro\|small\|medium\|large\|unknown` (default `unknown`) |
| `employees`, `annualTurnoverEur` | Int ≥ 0 (≤ 10 000 000 employees, ≤ 10¹⁴ EUR) or null |
| `activities`, `aiDescription` | Text (≤ 20 000 / ≤ 10 000 characters) |
| `usesAi`, `providesAi`, `processesPersonalData`, `isPublicSector` | `true\|false\|null`, where **null = unknown** (never guessed) |
| `institutionType` | `bank\|credit_union\|payment_institution\|emi\|casp\|crowdfunding\|consumer_credit\|real_estate_credit\|currency_exchange\|investment_firm\|insurance\|other_financial\|none\|unknown` (default `unknown`) |
| `financialMarket`, `attributes` | Objects (≤ 60 000 characters as JSON) or null |

| Route | Body → answer |
|---|---|
| `GET` / `POST /api/companies/{id}/credentials` | GET → `{credentials}`. POST `{kind: certificate\|license\|permit\|registration, name, issuer?, identifier?, validFrom?, validTo? (ISO dates), scope?, notes?, status?: claimed\|verified, evidenceDocumentId?}` → 201 credential; a new one is `claimed` unless the body says `verified`. |
| `PATCH` / `DELETE /api/companies/{id}/credentials/{cid}` | PATCH takes any subset of the same fields. Setting `status: "verified"` stamps `verifiedBy` / `verifiedAt`; `claimed` clears them. The evidence must be one of the company's own documents. DELETE → `{ok: true}`. |
| `GET` / `POST /api/companies/{id}/standards` | The standards the company adopted. GET → `{standards: [{id, documentId, shortTitle, title, ready, status, scope, certificateId, notes, …}]}` — `ready` says whether the corpus copy is enabled and ingested (an analysis skips it otherwise). POST `{documentId, status?: certified\|implementing\|planned (default implementing), scope?, certificateId?, notes?}` → 201. `documentId` must be a corpus document of type `standard` (400 `INVALID_FIELD`), `certificateId` one of the company's own credentials; adopting a standard twice is 409 `ALREADY_ADOPTED`. Every report of the company assesses its adopted standards. |
| `PATCH` / `DELETE /api/companies/{id}/standards/{sid}` | PATCH takes any subset of `{status, scope, certificateId, notes}` (`certificateId: null` unlinks it); the standard itself never changes. DELETE → `{ok: true}`. Audited (`companies.standard_add`, `standard_update`, `standard_remove`). |
| `GET` / `POST /api/companies/{id}/roles` | GET → `{roles}`. POST `{name, context (≤ 6000 chars), sources?: [{documentId?, title?, section?}] (≤ 50)}` → 201 role. A source names its document by `documentId` or by `title`; where that is one of the company's documents — by id, or by a title that is one and only one of them, with or without its file extension — the role is stored and returned with both, the title being the document's present one. Any other source is kept as written. A duplicate name within the company returns 409 `DUPLICATE_NAME`. |
| `GET` / `PATCH` / `DELETE /api/companies/{id}/roles/{rid}` | A role profile, e.g. the compliance officer. A chat thread can adopt it; deleting the role unlinks it from its threads. |

## Documents — `companies/api/document_views.py`

| Route | Body → answer |
|---|---|
| `GET /api/documents?companyId=&q=&scope=own&limit=&offset=` | → `{documents, total}`, newest first; `limit` 1–500 (default 500). The text is never included. `q` matches the title. `scope=own` narrows an admin to their own uploads. |
| `POST /api/documents` | multipart `file` (≤ 50 MiB), `companyId?`, `title?` (default the file name, ≤ 300 characters), `kind?: policy\|procedure\|contract\|register\|other` (default `other`) → 201 document. The text is extracted at once in a sandbox (PDF, DOCX, HTML, and text: `.txt`, `.md`, `.csv`, `.json`); the evidence index (job `documents.index`) is queued when there is text. Any other file is still stored, with `extractionStatus: failed` ("Unsupported file type"); a PDF without a text layer ends `empty`. The leading bytes win over the name: binary content named `.txt` or `.html` counts as unsupported. The per-account quota is `UPLOAD_QUOTA_FILES` / `UPLOAD_QUOTA_BYTES` (1000 files / 2 GiB); beyond it the upload returns 413 `QUOTA_EXCEEDED`. A larger file is 413 `FILE_TOO_LARGE`, no file part 400 `MISSING_FILE`. |
| `GET /api/documents/search?q=&companyId=&documentIds=a,b&scope=own&k=8` | → `{hits: [{documentId, title, companyId, chunkId, heading, charStart, text, score}]}`. Hybrid vector + full-text search over documents with extracted text; `q` is required (≤ 1000 characters), `k` 1–30, `documentIds` up to 50. `scope=own` narrows an admin to their own uploads (the chat assistant's unfiltered search). |
| `GET /api/documents/{id}` | Metadata plus `outline: [{title, level, offset}]`, `inventory` (the evidence inventory), `documentType`, `inventorySummary`, `indexedAt` |
| `PATCH /api/documents/{id}` | `{companyId?: id\|null, title?, kind?}` → document; `companyId: null` detaches it. An empty change is 400 `EMPTY_UPDATE`. |
| `DELETE /api/documents/{id}` | Deletes the row, then the file → `{ok: true}` |
| `GET /api/documents/{id}/text?offset=0&limit=20000` | → `{id, title, text, offset, limit (≤100000), total, extractionStatus}` |

## Chat — `chat/api/views.py`

| Route | Body → answer |
|---|---|
| `GET /api/chat/models` | → `{default, models: [{id, name, pricing: {promptPerToken, completionPerToken} \| null}]}`: the gateway's chat models, newest first, which a conversation may answer with, and `default`, the model of the active `chat.assistant` version (`null` when none is active). Any signed-in user. While the gateway cannot be reached the list is empty. |
| `GET /api/chat/threads?companyId=` / `POST` | GET → `{threads}`: the caller's own unarchived threads (admins included), most recently updated first, at most 300. POST `{companyId?, title?}` → 201 thread. |
| `GET` / `PATCH` / `DELETE /api/chat/threads/{id}` | The thread: `{id, userId, companyId, companyName, roleId, role, title, model, messageCount, archived, createdAt, updatedAt}`. PATCH `{title? (≤ 200 characters), companyId?, roleId?, model?}`: `companyId: null` unlinks the company, and changing or unlinking it drops the role; `roleId` must be a role of the thread's company (404 otherwise); `model` is one of the ids `GET /api/chat/models` lists (400 `UNKNOWN_MODEL` otherwise, 503 `MODELS_UNAVAILABLE` while the gateway's list cannot be read), or `null` for the default. The assistant answers each turn with the thread's `model`, else with the active `chat.assistant` version's. DELETE archives → `{ok: true}`; the rows stay. A thread without a title takes the first 80 characters of its first user message; while it still carries that automatic title, the assistant replaces it once with a few words from its model (prompt `chat.title`), never a title the user set. |
| `GET` / `POST /api/chat/threads/{id}/messages` | GET → the assistant-ui history rows, a bare list of `{id, parent_id, format, content}`. POST upserts one row within the thread → `{ok, created, autoTitle}`, `autoTitle` saying whether the thread still carries the automatic title (the assistant then asks its model for a better one). Only user messages may be written here (403 `ROLE_NOT_ALLOWED`; the assistant writes its own through the internal door); a message over 400 000 characters is 413 `MESSAGE_TOO_LARGE`; an id belonging to another thread returns 409 `MESSAGE_ID_TAKEN`. |
| `POST /api/assistant/chat` | The node assistant's streaming chat (SSE, AI SDK UI-message stream). The body is slim: `{id, trigger: "submit-message"\|"regenerate-message", messageId, message, parentId, locale: "lt"\|"en"}` — one new user message of up to 30 parts (`text`, together at most 60 000 characters, or `data-document` markers of uploaded documents); the history is Django's. Limits before any model call: 12 turns per user per minute (429 `RATE_LIMITED`), the daily budget (429 `BUDGET_EXCEEDED`), 512 kB of JSON. A turn runs at most 180 s. See `assistant/README.md`. |
| `POST /api/assistant/chat/{threadId}/stop` | Stops the caller's live turn in that thread → `{stopped}`; the partial reply is stored as stopped. |
| `GET /api/assistant/chat/{threadId}/status` | → `{running, startedAt}` — whether the caller's thread has a live turn (the GUI polls it after a reload mid-answer). |

## Legal corpus — `corpus/api/views.py`, `obligation_views.py`

Reading is open to every signed-in user; writing is admin-only and audited. The corpus holds legal acts and standards: a standard is a document of `docType: standard` (usually `jurisdiction: INTL`), uploaded, whose units are clauses (`unitType: clause`, numbered `4`, `6.1.2`, `A.5.15`) and annexes. Wherever an act's article is named (`article`, the citation check's `article`), a standard's clause reference goes: `6.1.2`, `clause 6.1.2`, `A.5.15`, `Annex A 5.15`, `Annex A`; a bare control number the body lacks (`5.15`) is looked for in the annexes. A reference that says "control" (`control 5.15`) means the annex's clause even when the body has that number. A standard that is not numbered this way is cited by what its units carry: a framework's own identifier (`AC-2`, `AC-2(1)`, `GV.OC-01`, `03.01.02` — also found as `ac 2`, `3.1.2`), a heading, or the page of a standard indexed by its pages (`p. 12`, `page 12`, `12 psl.`); the `path` of a search hit or provision always works as a reference. A standard may be named by its designation with or without publisher and year (`ISO 27001`, `ISO/IEC 27001:2022`) — the latest edition when no year is given; an international standard and its national or European adoption answer for each other across their different years (`ISO/IEC 27001:2022` ↔ `LST EN ISO/IEC 27001:2023`).

| Route | Body → answer |
|---|---|
| `GET /api/corpus/documents?q=&jurisdiction=&docType=&domain=` | → `{documents}`, each with its current version, status, last error and obligation count. Users see enabled acts only; admins see all. `docType=standard` lists the standards. |
| `POST /api/corpus/documents` | `{title, jurisdiction: EU\|LT\|INTL, sourceKind: cellar\|etar\|eseimas\|lb\|url\|upload, externalId?, sourceUrl?, shortTitle?, titleEn?, docType?, language?, domains?, appliesTo?, applicabilityNotes?, status?, enabled?}` → 201 act. `cellar`, `etar` and `eseimas` (a legacy name of `etar`) need `externalId`; `lb` needs a `www.lb.lt` `sourceUrl`; `url` needs an https `sourceUrl` on port 443 (whether its host is reachable is the egress allowlist's call). A fetchable act queues its ingestion; an `upload` act waits for its file. 409 `SLUG_TAKEN`. A standard (`docType: standard`) is uploaded; its short title is its designation (`ISO/IEC 27001:2022`). |
| `GET` / `PATCH` / `DELETE /api/corpus/documents/{id}` | Detail with versions and `latestJob` (absent when no job ran), and what the models read from the current version's own text — `scopeReading` (`types`, `reasoning`, `readAt`) and `sanctionsReading` (`tiers` — the number of tiers, `note`, `readAt`), each `null` until it is read; a user gets 404 for a disabled act. PATCH edits the same fields (admin). DELETE removes every version, provision, chunk and stored file → `{ok: true}` (admin). |
| `POST /api/corpus/documents/{id}/refresh` | `{force?, structure?}` queues a fetch and ingest → 202 job (the running job when one is already queued or running). An unchanged source ends as "unchanged"; `force` re-processes it anyway. An `upload` act re-processes its current file (409 `NO_FILE` before the first). `structure` (`auto` \| `rules` \| `ai` \| `pages`; a standard only, else 400 `INVALID_FIELD`) says how the standard's structure is read this time: the clause rules with the model where they fall short (`auto`, the default), the rules alone, the model over the whole text, or the pages. The job's result carries `parser` (`standard`, `standard-refined`, `standard-ai`, `standard-pages`) and `notes` on what did not go as asked. Obligations of the version stay on the units of the same citation; proposals whose units are gone are deleted. |
| `POST /api/corpus/documents/{id}/upload` | multipart `file` (≤ 60 MiB) becomes a new version and ingest job → 202 job. A file identical to the current version is 409 `UNCHANGED`. A standard's text is read by its structure: page furniture and the table of contents are dropped; numbered clauses and annexes are read by rules, a document the rules cannot read (identifiers of its own, no numbering, a DOCX whose automatic numbers were lost) by the model (prompt `corpus.standard_outline`, charged to nobody), and by its pages when neither works — the version's `parser` says which. Only a file without readable text fails its version: a PDF that needs a password or is locked by a rights-management plug-in, a scanned copy. |
| `GET /api/corpus/documents/{id}/units?type=&q=&version=&offset=&limit=` | The provisions of the current (or the given) version in document order → `{units, total, offset, limit}`; `type` is a comma-separated list, `limit` ≤ 1000 (default 200). |
| `GET /api/corpus/units/{id}` | One provision in full, with its act, `versionNo`, `isCurrent` and `citationUrl`, the link to the official text: for an EU act the EUR-Lex page at the article's anchor; otherwise the address the catalogue gives the act or, for an act from e-tar, the act's page in the register of legal acts (`https://www.e-tar.lt/portal/lt/legalAct/<id>/asr`), which opens the act and not the article; empty when the act has neither. Every `citationUrl` in this document is built the same way; those a report stores are built when the report runs, so a report made before 2026-11-16 keeps the links of its day — none for an act from e-tar. |
| `GET /api/corpus/provision?document=&article=&paragraph=&type=` | The exact text: `{path, heading, text, docType, versionNo, versionDate, citationUrl, externalId, …}`, or 404. `document` may be a short title, slug, id, CELEX or a standard's designation; a standard's clause may come as `clause=` instead of `article=`. An inserted article may be asked for as `12-1` or as `12¹`: it is found whichever way the act's parser stored it, here and in the citation check. |
| `POST /api/corpus/search` | `{query, k? (1–30, default 8), documents? (≤ 50 acts by id, slug, short title or CELEX), jurisdiction?: EU\|LT\|INTL, kind?: acts\|standards}` → `{hits: [{path, heading, text, shortTitle, citationUrl, score, …}]}`. Hybrid search over the current versions; a document is named as any lookup of an act takes it, whatever the case, and a name that means no act narrows the search to nothing; the query embedding is not logged or charged. |
| `POST /api/corpus/check-citations` | `{citations: [{act, article, paragraph?, point?, claimedHeading?}]}` (≤ 50) → `{results: [{status: found\|not_found\|act_not_in_corpus, path, heading, excerpt, citationUrl, headingMatch: match\|mismatch\|unknown, note, judgedBy: model\|overlap\|null}]}`, one per citation in order, echoing what was asked. Each field ≤ 300 characters. A range or list of articles (`77–78`, `6–9, 26–29, 53`) is looked up article by article and answered by its best article (at most 100 lookups per request); `63(2)(a)` in the article field is split into article, paragraph and point. With the caller's daily budget spent (or the model unavailable), the heading is judged by word overlap instead of the model; `judgedBy` says which judged (null when no claim was given). The act may be named by short title, slug, CELEX / TAR number, a unique title fragment, an EU act's type and number (`Regulation (EU) 2023/1113`) or a reference that opens with a short title (`MiCA Regulation`). |
| `POST /api/corpus/reembed` | `{documentId?}` → 202 job (admin). Without an id every act is re-embedded; an unknown id is 404. Needed only after a change of the embedding model. |
| `POST /api/corpus/refresh-all` | → 202 job (admin). Also scheduled weekly. |
| `GET /api/obligations?document=&status=&category=&verification=&order=&q=&limit=&offset=` | → `{obligations, total}`; `limit` 1–2000 (default 500). `status` takes one state (`proposed`, `approved`, `rejected`) or several with commas between. `verification` filters by the judge's verdict (`supported`, `partly`, `unsupported`, `doubt` for the last two, `unchecked`); `order=review` puts the doubted first, the gravest first among them. Each obligation carries `verification: {verdict, issue, note, model, promptVersionId, checkedAt}` or null. Readable by every signed-in user; company-internal obligations are never listed. |
| `POST /api/obligations` | A "standard" obligation entered by hand (admin): `{title, text, documentId?, …}` → 201, approved at once. |
| `GET` / `PATCH` / `DELETE /api/obligations/{id}` | PATCH edits the fields and `status: proposed\|approved\|rejected` (admin); a status stamps the reviewer, and an edited title or text is re-embedded and loses the judge's verdict. |
| `POST /api/obligations/review` | `{ids (1–500), status}` bulk review (admin) → `{updated, status}` |
| `POST /api/corpus/documents/{id}/extract-obligations` | `{language?: "en"}` (Lithuanian otherwise) → 202 job, or the running one (admin). 409 `NOT_INGESTED` before the act has a version. The extraction is charged to the admin who queues it. For a standard it extracts the standard's requirements (prompt `corpus.extract_requirements`) from its clauses, skipping the introduction, scope, normative references, terms and informative annexes; they are obligations of `sourceKind: standard` that apply to every company that adopted it. |
| `POST /api/corpus/documents/{id}/verify-obligations` | `{again?}` → 202 job, or the running one (admin). The judge compares every obligation of the current version not yet judged (all of them with `again`) with the full text of the provisions it cites and keeps the verdict on the obligation. It approves nothing. Charged to the admin who queued it. |

**Sources.**
- **CELLAR** (`cellar`, `externalId` = CELEX): the newest consolidated version in force, Lithuanian XHTML.
- **e-tar** (`etar`, `externalId` = the e-tar document id such as `TAR.4A05AB3730DD`, not the e-seimas id): the edition valid today.
- **lb.lt** (`lb`, `sourceUrl` on `www.lb.lt`).
- **Plain HTTPS** (`url`): only on hosts in the allowlist.
- **Uploads.**

## Reports — `analysis/api/views.py`

| Route | Body → answer |
|---|---|
| `GET /api/reports?companyId=&status=&scope=own` | → `{reports}`: the newest 200 the caller may see, newest first. `companyId` and `status` (`queued`, `running`, `scope_review`, `done`, `failed`, `cancelled`) narrow the list before that cut, and `scope=own` narrows an admin to the reports of their own companies; an unknown status matches nothing. |
| `GET /api/reports/estimate?companyId=&documentIds=&internal=` | → `{acts, obligations, actsToExtract, documentsToRead, citationChecks, analysisUsd, extractionUsd, totalUsd, upperBound: true, pricesKnown, budget}`; with `internal=true` also `internal: {documents, requirements, usd}` — the company's policy-level documents, the requirements they hold or are expected to give, and what reading and assessing them costs, counted into `totalUsd`. The upper-bound cost of a run now, priced for each step's active model; `pricesKnown` is false when a model's price is unknown (the total is then a floor). `documentsToRead`: documents whose evidence inventory the run reads (again) — none cached yet, or cached for another text, inventory prompt version or inventory shape. `citationChecks`: the citation audit's judge calls (≤ 50 lookups each; a reference to a range or list of articles is one lookup per article). 400 `INVALID_FIELD` for `documentIds` the start would refuse — an act that is not in the corpus, or disabled. |
| `POST /api/reports` | `{companyId, language: lt\|en, documentIds?, review?, internal?}` (`documentIds`: the corpus scope) → 201 report. With `internal: true` the report also assesses the company's own requirements (architecture.md §3): an extra act row with `docType: "internal"`, its findings with `sourceKind: "internal"` and citations that point into a company document (`documentId`, `quote`, `start`), counted apart in `stats.internal`. With `review: true` the run stops in `scope_review` once it has decided which acts apply and waits for `POST /api/reports/{id}/scope`; without it the report runs through and stamps the approval itself (a time and nobody). Refusals: 409 `CORPUS_EMPTY` / `ALREADY_RUNNING` (also while a report of the company waits for its scope), 429 `BUDGET_EXCEEDED`. |
| `GET /api/reports/{id}` | The full report: `acts`, `findings`, `actions`, `citations` (the citation audit's rows, below), `summary`, `stats`, `outdatedActs` (acts with a newer version since the run), `approvedBy` / `approvedByName` / `approvedAt` / `approvalNote`, and the run's `jobId` / `jobStatus` / `progress` (list rows and the create answer carry the same three). The parts are described below. |
| `PATCH /api/reports/{id}` | `{approved: true\|false, note?}`. The sign-off of a finished report, audited. Any later finding override withdraws it. |
| `DELETE /api/reports/{id}` | Returns 409 `STILL_RUNNING` while the analysis runs. |
| `POST /api/reports/{id}/cancel` | Stops a queued or running analysis; cancels at once one that waits for its scope. |
| `POST /api/reports/{id}/scope` | `{acts?: {reportActId: "assess"\|"skip"}, approved?}` for a report in `scope_review`. `assess` takes an act in whatever the verdict said (one waiting for facts, a directive, an act that does not bind the company — assessed then by choice, as good practice, with all of its obligations); `skip` leaves an assessed act out; an act not named keeps what the run decided. Without `approved` nothing is stored: → `{estimate: {pricesKnown, acts: [{id, obligations, toExtract}], obligations, analysisUsd, extractionUsd, totalUsd, upperBound}, budget}`, the price of the second part for that selection. With `approved: true` the choices are applied, the approval is stamped and audited with every change, and the job is queued again → the report. Refusals: 400 `INVALID_FIELD` / `NOTHING_TO_ASSESS`, 409 `NOT_WAITING`, 429 `BUDGET_EXCEEDED`. |
| `PATCH /api/reports/{id}/findings/{fid}` | `{overrideStatus?: met\|partial\|missing\|unknown\|not_applicable\|null, reviewerNote?, cause?}`. The reviewer's verdict wins everywhere, including the exports. `cause` (up to 2000 characters, null clears it) is why the gap exists — written only by a person; it may be sent alone. Audited. |
| `GET /api/reports/{id}/export?format=pdf\|xlsx` | The attachment. Only finished reports export. |

A finding also carries `consequence` — what a breach of its provision can cost, from the sanction tiers the corpus held when the report ran: `[{act, path, where, condition, maxFineEur, maxFinePercent, benefitMultiple, persons, measures, measuresFrom, via?}]` (`persons`: the kinds of person the tier binds, when it binds only some of those the act regulates; absent from a report made before 19 November 2026) (empty for a report made before the tiers were read, for a standard's requirement and for a requirement of the company's own) — and `cause`. Under a level 2 act the entries of `consequence` are those of the article of the parent act it was adopted under, each with `via: {act, path}` naming that act and article.

**The citation audit.** Every report (from 2026-09-28 on) checks the references the company's documents make to specific legal provisions (the `citations` of each document's evidence inventory) against the corpus: does the act's current version hold that article / paragraph / point, and does the provision regulate what the document claims. A reference several documents make word for word is judged once; each document still gets its own row. A reference to a range or list of articles ("Art. 17–23") is judged article by article and answered by its best article (a match, else an undecided claim, else a mismatch) — the row's `unitPath` / `heading` name that article. `stats.citations` carries the counts — `{checked, match, mismatch, notFound, notInCorpus, unknown}` — on every list row too; the rows travel only with the full report, problems first:

```
citations: [{
  id, documentId,            // the company document (null once it is deleted)
  documentTitle,             // its title when the report ran
  act, article, paragraph, point,   // the reference exactly as the document wrote it ("" when absent)
  claim,                     // what the document says the provision requires / covers
  quote,                     // ≤ 200 characters of the document where it cites it
  status: found | not_found | act_not_in_corpus,
  headingMatch: match | mismatch | unknown | null,   // null unless found
  verdict: mismatch | not_found | unknown | act_not_in_corpus | match,
  judgedBy: model | overlap | null,                  // who compared claim and provision
  legalDocumentId, shortTitle,   // the act it resolved to (null / "" when not in the corpus)
  unitId, unitPath, heading,     // the provision found (null / "" unless found)
  note, excerpt, citationUrl     // the judge's note, the provision's opening, the official link
}]
```

`verdict` is what the GUI and the exports show: `match` — correct; `mismatch` — the provision regulates something else; `not_found` — the act has no such provision; `act_not_in_corpus` — the act is not in the corpus (not checked); `unknown` — the claim could not be judged. A report from before the audit has `citations: []` and no `stats.citations`. The action plan reads the mismatches and missing provisions, the summary the counts; the PDF and Excel exports carry a citation-audit section / sheet.

**Finding statuses** (Lithuanian labels):

| Status | LT | Meaning |
|---|---|---|
| `met` | atitinka | |
| `partial` | iš dalies | |
| `missing` | neatitinka | |
| `unknown` | neįrodyta | Not evidenced: no provided document deals with the subject, or the one that would is referenced but was not provided. |
| `not_applicable` | netaikoma | |

**Acts.** Each act carries the verdict (`applicability: applies\|not_applies\|uncertain`, `confidence`, `reasoning`, `conditionsToVerify`, `citations`), its `docType` (`standard` for an adopted standard, which applies by the adoption without a model verdict), `screenedOut`, and what the report did with it:

| `assessment` | Meaning |
|---|---|
| `assessed` | The act binds the company: its obligations were assessed, and their findings are the report's result. |
| `upcoming` | It binds the company only from `appliesFrom` (a date): assessed as preparation, counted apart. |
| `unconfirmed` | Whether it applies depends on facts the profile does not state: **not assessed**; `conditionsToVerify` holds the questions to answer. |
| `indirect` | It binds the company through something else: a directive (`docType` `directive`) through the national law that transposes it, which is assessed in its place; an act that organises an authority or a procedure before it, through that authority's decisions. |
| `none` | It does not apply (judged so, or screened out by the catalogue). |

**Scope approval.** `scopeApprovedAt` and `scopeApprovedBy` / `scopeApprovedByName` say when and by whom the list of acts was approved; a report that ran without the review carries the time alone. While a report waits in `scope_review` it has its acts and citation audit, no findings, and `stats` holds what the first part cost. The person approving may decide against the verdict, and the row then shows both: `assessment` `assessed` or `upcoming` with `applicability: not_applies` is an act assessed by the company's choice (its findings are gaps against good practice, not breaches); `assessment: none` with `applicability: applies` is an act that applies and was left out.

An act the report's scope (`documentIds`) names is assessed through doubt — an `uncertain` verdict, an `indirect` treatment — but not against a negative catalogue screen or a `not_applies` verdict: such an act a person may take in at the scope review (`assess`), as good practice. Reports made before 2026-11-10 assessed every applicable and uncertain act: their acts read `assessed` (or `none`).

**Findings.** A finding of an `upcoming` act carries that act's `appliesFrom`; every other has null. Its `severity` (`critical` / `high` / `medium` / `low`) is the obligation's own weight, not a rating of the gap. Its `evidence` is `[{kind: credential\|document\|passage\|profile, id, title, quote}]`; a passage — a quote from a company document — also carries `documentId` and `charStart`, the place of the quote in the document's text (the `offset` of `GET /api/documents/{id}/text`); null when the document does not hold the quote word for word (in a report made before 2026-11-10: when the passage is gone). The finding review's answer carries the same.

**Stats.** `findings` (per effective status) and `openBySeverity` count the acts in force for the company; `upcoming: {findings, openBySeverity}` counts the acts assessed as preparation and is present only when the report has any. `acts` counts the acts by verdict (`applies`, `uncertain`, `not_applies`) and by assessment (`assessed`, `upcoming`, `unconfirmed`, `indirect`); then `actions`, `citations` (the audit's counts), `reviewedObligations`, `provenance: {prompts, models, corpus}`, `tokens` and `costUsd`. A review recounts the findings.

### The action register — `analysis/register.py`

| Route | Does |
|---|---|
| `GET /api/companies/{id}/actions` | `{actions, counts}`: the company's register, the live actions first (late before the others, by due date), then the closed; `counts` by state as shown (`late`, `open`, `in_progress`, `done`, `closed`). |
| `PATCH /api/actions/{id}` `{status?, owner?, dueDate?, note?}` | A person's hand on one action. `status`: `open`, `in_progress`, `done`, `closed`; closing by hand needs a note (400 `NOTE_REQUIRED`); a closure by hand is taken back by setting another status, one a report made is not (409 `CLOSED_BY_REPORT` — review the finding in that report instead). `done` stamps when: only a report made after that can send the action back to work. Audited. |
| `GET /api/companies/{id}/actions/export?language=` | The register as a workbook (`.xlsx`). |
| `GET /api/companies/{id}/law-changes` | `{reportId, reportDate, acts}`: for the latest finished report, the assessed acts that have a newer version — `changed`, `added`, `removed` provisions, `recorded` (false when a version in between was ingested before changes were recorded) and the `findings` that rest on a changed provision. |

An action: `id`, `companyId`, `reportId`, `reportDate`, `title`, `description`, `category`, `priority`, `effort`, `owner`, `dueDate`, `status`, `state` (the status, or `late` when not closed and past due), `items` (the findings it is to close: `obligationId`, `findingId`, `title`, `act`, `path`, `sourceKind`, `status`, `confirmed` — null or `{reportId, at}`), `byHandOnly` (no report can ever confirm it: it closes no finding, or a finding of it lost its obligation), `note`, `closedAt`, `closedByName`, `closedHow` (`confirmed` by a later report, or `manual`), `confirmedReportId`.

The register moves only on a report's sign-off: `PATCH /api/reports/{id} {approved: true}` also answers `register: {added, covered, confirmed, closed, reopened}`, and `{approved: false}` answers `register: {withdrawn}`. Deleting a signed-off report (`DELETE /api/reports/{id}`) withdraws its sign-off first. An item's `obligationId` is served as null once its obligation no longer exists (its act or policy was read again) and the item is not confirmed. A full report's findings each carry `history` (`[{reportId, date, status}]`, the same obligation in earlier reports), and `stats.changes` (`{since, sinceDate, closed, new, back}`, each `{count, titles}`) when the company has an earlier report.

## Programme — `programme/api/views.py`

The work products of a company's compliance programme (architecture.md §3): the compliance policy (`policy`), the governance structure with the compliance process and RACI (`governance`), the legal risk criteria and register (`risks`). Tenancy follows the company.

| Route | Does |
|---|---|
| `GET /api/companies/{id}/programme` | `{products, kinds}`: the company's products by kind, newest version first, each with its job's `progress` and `jobStatus` and without its content; the kinds with their titles (`lt`, `en`) and what each builds on (`needs`). |
| `POST /api/companies/{id}/programme` `{kind, language?}` | Starts the generation of a new version (job `programme.generate`, 4–6 minutes, about $0.4–0.5 of the caller's daily budget). 201 with the queued product. `INVALID_FIELD`; 409 `NO_DOCUMENTS` (no readable document), 409 `ALREADY_RUNNING` (one of this kind is queued or running), 429 `BUDGET_EXCEEDED` (under $0.25 left today). |
| `GET /api/programme/{id}` | The product with its `content`. |
| `PUT /api/programme/{id}/content` `{content}` | A person's edit of a draft, whole. The content is brought into the kind's shape and checked against its rules without a model call; the answer is the product as stored — what is derived is recomputed (a scenario's levels, score and band; ids; looked-up provisions; placed quotes). 400 `MISSING_FIELDS`, `INVALID_FIELD`; 409 `NOT_DRAFT`, `UNKNOWN_KIND` (a product of a kind the code no longer has). |
| `PATCH /api/programme/{id}` `{approved: true, note?}` | A person's approval of a draft. 409 `NOT_DRAFT`; 409 `RULES_BROKEN` while a blocking rule of the kind is broken (the message names them). |
| `POST /api/programme/{id}/revise` | A new draft, version + 1, copied from an approved product. 409 `NOT_APPROVED`, `NEWER_VERSION`. |
| `POST /api/programme/{id}/cancel` | Stops a generation that is queued or running. 409 `NOT_CANCELLABLE`. |
| `DELETE /api/programme/{id}` | Removes a version. 409 `STILL_RUNNING`. |
| `GET /api/programme/{id}/chart` | `image/svg+xml`: the structure of a governance product as an organisation chart — the drawing its PDF carries. 404 when the product has no structure. |
| `GET /api/programme/{id}/export?format=` | The product as a file: `pdf` for every kind, `docx` for a policy, `xlsx` for a risk register. Only a draft or an approved product (409 `NOT_READY`); 400 `INVALID_QUERY` for a format the kind does not have. |

A product: `id`, `companyId`, `companyName`, `kind`, `version`, `language`, `status` (`queued`, `running`, `draft`, `approved`, `failed`, `cancelled`), `title`, `checks` (one row per rule of the kind: `rule`, `ok`, `detail`, `blocking`), `basis` (the report, the earlier products with their versions and the documents it was made from), `stats` (tokens, `costUsd`, `provenance` with prompt versions and models), `error`, `jobId`, who created, edited and approved it and when, `approvalNote`.

Content by kind:

- **policy** — `title`; `parts` (always eight, keys `purpose`, `commitment`, `mandate`, `compliance`, `roles`, `processes`, `whistleblowing`, `consequences`): `heading`, `text`, `decisions`, `sources` (placed quotes: `documentId`, `document`, `quote`, `start`), `legalBasis` (looked-up provisions); `hierarchy`: every document with its `level` (1, 2, 3; 0 = not a rule), `topic`, `note`; `missing`: `level` (2 or 3), `title`, `purpose`, `supports` (a part's key), `priority`, `legalBasis`, `partlyCoveredBy`.
- **governance** — `positions` (`name`, `unit`, `line`, `duties`, `sources`), `gaps` (`role`, `line`, `why`), `structure` (nodes: `id`, `name`, `kind` body / committee / function / unit, `line` governing / first / second / third / external, `parentId`, `proposed`, `note`), `process` (steps: `id`, `name`, `description`, `frequency`, `basis` as `{source, ref}`), `raci` (cells: `stepId`, `roleId` — a node's id — and `value` R, A, AR, C or I).
- **risks** — `criteria` (`likelihood`: five rows with `control`, `clarity`, `counterparty`, `frequency`; `impact`: five rows with `financial`, `regulatory`, `reputation`, `reach`; `calibration`), `appetite` (the five bands: `band`, `name`, `from`, `to`, `responses`, `comment`, `decision`), `scenarios`: `id` (LR-01 …), `area`, `unit`, `sentence` with its four parts (`event`, `source`, `consequences`, `objective`), `categories` (1–6, at most two), `legalBasis`, `policies`, `internalConclusion`, `externalConclusion`, `likelihood` and `impact` (the four levels, `level`, `why`), `score`, `band`, `response`, `actions`, `owners`, `deadline`.

A looked-up provision is `{act, article, paragraph, why, found, status (found / not_found / act_not_in_corpus), match (match / mismatch / unknown), shortTitle, path, citationUrl}`. An edit sends a provision back whole, which keeps the verdict the citation judge gave it at generation (`match`), or only `act`, `article`, `paragraph` and `why` for a provision a person adds; the server looks every one up again and judges none, so a provision added by hand has no `match`. A product's `progress` while it is generated is the job's `{step, percent, message}`.

## Prompts (admin) — `prompts/api/views.py`

| Route | Body → answer |
|---|---|
| `GET /api/prompts` | → `{prompts: [{slug, name, kind, variables, activeVersion, activeModel, pendingDefault, …}]}` |
| `GET /api/prompts/{slug}` | With `versions`, newest first (`{version, text, model, temperature, maxTokens, note, source: default\|user, createdBy, createdAt}`). |
| `POST /api/prompts/{slug}/versions` | `{text (≤ 60 000 characters), model, temperature? (0–2), maxTokens? (1–128000), note? (≤ 500), activate?}` → 201 version. `model` is `provider:model` (`gateway:azure/gpt-5.5`); a bare id means the gateway. |
| `POST /api/prompts/{slug}/versions/{n}/activate` | → the prompt |
| `POST /api/prompts/{slug}/test` | `{input (≤ 200 000 characters), versionNo? \| text?, model?, temperature?, maxTokens?, variables? (≤ 50)}` → `{text, object, model, finishReason, usage, costUsd, durationMs, renderedInstructions}`. Runs one model call on the step's strict schema (the active version unless `versionNo` or a draft `text` is given) and counts against the caller's budget: 429 `BUDGET_EXCEEDED` once it is spent, 502 `MODEL_ERROR` when the call fails. Audited either way. |
| `GET /api/llm/models` | → `{providers, models: [{id, name, kind: chat\|embedding, contextLength, maxOutputTokens, pricing: {promptPerToken, completionPerToken, cacheReadPerToken, cacheWritePerToken} \| null}]}`, newest first. The two cache prices — of input read from the provider's prompt cache and written to it — are null where the gateway names none. |

**Upgrades.** Shipped defaults live in `django/compliance/prompts/defaults/*.yaml`. `manage.py seed_prompts` activates a changed default while the prompt still runs a shipped text: a shipped default, or one an admin only moved to another model or other settings (the same text, word for word) — the new text is then activated on those settings, as a version of the admin's beside the default as shipped. A text an admin wrote stays active; the new default is offered as `pendingDefault`.

## MCP servers (admin) — `assistant/api/mcp_views.py`

| Route | Body → answer |
|---|---|
| `GET` / `POST /api/mcp/servers` | GET → `{servers}`. POST `{name, url, transport?: http\|sse, headers?, allowedTools?, description?, enabled?}` → 201 server. `name` is 2–31 characters: lowercase letters, digits and `_`, starting with a letter. `url` must be `https://` on port 443 to a public DNS name — no IP address, container or local name (`.local`, `.internal`, …), no user:password (the assistant connects from inside the isolated network). At most 10 headers; header values are never returned, only `headerNames`. `allowedTools` empty = every tool of the server. A new server starts disabled. A duplicate name is 409 `DUPLICATE_NAME`. |
| `GET` / `PATCH` / `DELETE /api/mcp/servers/{id}` | PATCH takes any subset of the same fields; in `headers`, a value of `null` removes that header and the others are kept. A server whose saved URL breaks the rule cannot be enabled (400 `INVALID_FIELD`). |
| `POST /api/mcp/servers/{id}/test` | Connects through the assistant (up to 45 s) and lists the tools → 200 `{…server, ok}`: on success `tools` holds the listing, on failure `ok` is false and `lastError` says why. Audited. A saved URL that breaks the rule is 400 `INVALID_FIELD`. |

The server's host must also be on the egress allowlist; see [operations.md](operations.md).

## Jobs, usage, audit

| Route | Body → answer |
|---|---|
| `GET /api/jobs?status=&kind=&subject=&limit=` | → `{jobs}`, newest first; `limit` 1–500 (default 100); an unknown `status` is 400 `INVALID_QUERY`. Own jobs; admins see all. A job about a legal act (`subject` `corpus:<id>` or `obligations:<id>`) carries the act's name in `subjectTitle` (its short title, else the first 80 characters of its title); any other job has `subjectTitle: null`. |
| `GET /api/jobs/counts` | → `{queued, running, done, failed, cancelled}` over the jobs the caller can see |
| `GET /api/jobs/{id}` | With `steps` (name, status, input and output summaries, duration, error, and what the step's model calls used, filled from its usage-log rows when it ends, done or failed: `usage: {calls, inputTokens, outputTokens, costUsd, models: [{model, calls, inputTokens, outputTokens, costUsd}]}` (most calls first), `model` (the most-used one) and `promptVersionId` (when exactly one prompt version was used)). Next to the bare id, `prompt` names that version: `{slug, version}` (e.g. `{"slug": "report.summary", "version": 3}`), or null when no version was recorded or its row is gone. A step without model calls has `usage: {}`, and a `model` only when its handler named one. |
| `POST /api/jobs/{id}/cancel` | A queued job is cancelled at once; a running one gets `cancelRequested` and stops at its next check → the job. A finished job is 409 `NOT_CANCELLABLE`. Audited. |
| `GET /api/usage?days=30&scope=all&userId=` | → `{days: [{date, calls, inputTokens, outputTokens, costUsd}], from, to, byKind, byModel, byUser?, totals, budget: {limit, used, remaining, unit: "USD"}}`. `days` 1–366, zero-filled UTC days. Everyone reads their own usage; an admin widens it with `scope=all` (which adds `byUser`) or looks at one account with `userId` (a user asking for either gets 403 `FORBIDDEN`). `budget` is the looked-at account's today; `remaining` is null when unlimited. |
| `GET /api/usage/calls?kind=&limit=&offset=&scope=all&userId=` | → `{calls, total}`, newest first, in the same scope as above; `kind` is `chat\|job_step\|embed\|prompt_test`, `limit` 1–200 (default 50). Each call carries `userName`, `toolCallCount` and its tokens: `inputTokens` (the whole input), of which `cachedInputTokens` were read from the provider's prompt cache and `cacheWriteTokens` written to it, `outputTokens` and `reasoningTokens`. `costUsd` prices each kind of input at its own price. |
| `GET /api/usage/calls/{id}` | With `toolCalls` and, for a chat turn, the `transcript` `{user, assistant}` (what the user asked and what the assistant answered). A user reads their own calls only; an admin reads every call. |
| `GET /api/audit?limit=&before=&beforeId=&action=&user=` | → `{entries: [{id, userId, userName, action, targetType, targetId, details, ip, createdAt}], next}` (admin). Newest first by `(createdAt, id)`; `limit` is clamped to 1–500 (default 100; not a number: 400 `INVALID_QUERY`), `action` is a prefix (`users.`), `user` one account's id. `next` is the following page's cursor, `{before, beforeId}` (the oldest entry's stamp and id): pass both back as they are, URL-encoded. It is `null` after the last page. `before` alone is a strict "earlier than" bound; a `beforeId` without it, or a `before` that is not an ISO 8601 datetime, is 400 `INVALID_QUERY`. |

## Internal door (isolated network only)

The `/internal/*` routes are not proxied (the endpoint forwards only `/api/…` to Django and the assistant) and require the `X-Internal-Secret` header, compared in constant time. They fail closed when the secret is unset: 403 `INTERNAL_ONLY`.

| Route | Purpose |
|---|---|
| `GET /internal/assistant/prompt?slug=` | The active prompt version with its text, or 404 `PROMPT_NOT_CONFIGURED` (the chat then answers 503). |
| `POST /internal/assistant/turn-log` | One chat turn's telemetry — its tokens (`input_tokens`, of which `cached_input_tokens` and `cache_write_tokens`; `output_tokens`, `reasoning_tokens`), tool calls, duration, outcome — and transcript (the user's text up to 20 000 characters, the answer up to 100 000) → 201 `{id, budget}`. |
| `GET /internal/assistant/budget?user_id=` | The user's budget today: `{limit, used, remaining, unit: "USD"}` (`remaining` null = unlimited). |
| `POST /internal/assistant/threads/{id}/messages` | `{user_id, id, parent_id, format, content}`: the only writer of assistant messages; the thread must belong to `user_id`. |
| `POST /internal/assistant/threads/{id}/title` | `{user_id, title}` → `{ok, applied}`: the model's title for a thread, applied only while the thread still carries its automatic title (a title the user set always stays); trimmed and cut to 200 characters. The thread must belong to `user_id` (404 otherwise); a blank title is 400 `INVALID_FIELD`. |
| `GET /internal/assistant/mcp-servers` | Enabled servers, with credentials; a server whose saved URL breaks the address rule is left out. |

The node assistant serves these to the worker and the web service, behind the same shared secret:

| Route | Purpose |
|---|---|
| `POST /internal/llm/generate` | `{prompt, system?, shared?, model?, schema?, schemaName?, temperature?, maxOutputTokens?}` → `{model, text, object, finishReason, usage: {inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens}, durationMs}`. One model call; with a JSON schema the answer is validated against it (502 when it does not match). `shared` is data every call of one step carries (a report's company profile and documents): it is placed behind the instructions, the one part of a request the provider caches. A reasoning model (GPT-5 and later) is sent no temperature. Aborted after `GENERATE_TIMEOUT_MS` (default 900 s). A spent provider budget is 402 `AI_BUDGET_EXHAUSTED`; a provider's rate limit is 429 with `retryAfterS` when the provider names a wait — Django's worker waits it out. |
| `POST /internal/llm/embed` | Embeddings for a batch of up to 256 texts; aborted after `EMBED_TIMEOUT_MS` (default 60 s, under Django's 120 s). |
| `GET /internal/llm/models` | The gateway's model list with prices, newest first by the date the gateway gives each model (an undated model last); cached for 10 minutes, and a failed refresh keeps the last good list. |
| `POST /internal/mcp/list-tools` | Connects to one MCP server and lists its tools (the admin page's connection test); a failure is 502 `MCP_UNREACHABLE`. |
| `GET /health` | Liveness and configuration: `{status, model: "configured"\|"missing-key", providers, activeTurns}` (not proxied; the compose file sets no healthcheck, so nothing asks it by itself — the live smoke test does). |
