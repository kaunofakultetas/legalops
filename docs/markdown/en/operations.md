# Compliance assistant — operations

Day-to-day running of the stack. Installation, the `.env` reference, the
outer proxy and production mode are in [deployment.md](deployment.md). All
commands run as root in
`/apps/aplikacijos/comp-assistant`. Nothing is installed on the host for
the stack (there is no node and no pip): every tool runs in a container.

## 1. Everyday commands

```bash
docker compose ps                                   # state of every service
docker compose logs -f --tail 100 legalops-django # follow one service
docker compose logs -f legalops-worker            # the job loop
docker compose restart legalops-endpoint          # e.g. after editing endpoint/Caddyfile
docker compose exec legalops-django python3 manage.py <command>
docker compose exec legalops-postgres psql -U legalops -d legalops   # superuser, local socket
```

`legalops-worker` only runs the job loop inside legalops-django, so its
log is the loop's log. When legalops-django restarts, the loop dies with
it: the worker container exits, and its restart policy starts a new loop. A
worker restarted on its own takes over instead: the new loop asks the one
still running to stop (its job goes back to the queue without spending an
attempt) and starts in its place.

A changed `endpoint/Caddyfile` or `exit/Caddyfile` takes effect when that
container restarts. `vite/Caddyfile` is baked into the production image and
needs `./runUpdateThisStack.sh`.

## 2. Updates

```bash
git pull
./runUpdateThisStack.sh
```

The script takes the whole stack down, rebuilds the images (cached layers
make a code-only change take seconds), starts everything again and runs
`migrate` (deployment.md §3). The site is down from the `down` until the
containers are back; running `docker compose build` first keeps the build
out of that window. Nothing runs `seed_prompts` on its own: after an update
that changes `django/compliance/prompts/defaults/`, run it by hand.

```bash
docker compose exec legalops-django python3 manage.py seed_prompts
```

`git pull` does not touch `docker-compose.yml` either: it is the
installation's own copy of `docker-compose.sample.yml` (deployment.md §3),
so a change to the sample reaches it only when someone carries it over.

What users notice: every container stops, and Docker kills it after its
default 10 s (the compose file sets no `stop_grace_period`).

- **django:** requests still running after 10 s are cut; the endpoint
  answers 502 until Django is back.
- **worker:** the loop dies with legalops-django. A job it was running is
  re-queued by the next loop once its heartbeat is two minutes old, and that
  run counts as one of the job's attempts.
- **assistant:** node refuses new connections at once (a request on a
  kept-alive connection gets 503 `SHUTTING_DOWN`) and lets the live chat
  turns finish, but Docker kills it after 10 s: a turn still running then
  loses its answer.
- **endpoint:** open connections close, SSE streams included.

Base images are pinned by tag, not all to the same depth:
`caddy:2.11-alpine`, `vuknf/caddy-l4:2.11` and `python:3.13-slim` follow a
minor line and `docker:27-cli` a major line, while `node:24.16.0-alpine`,
`postgres:17.11-alpine3.24` and `dbgate/dbgate:7.3.3-alpine` name an exact
release: a newer release of those three arrives only with a new tag (§10).
To pick up what is published anew under the tags of the images built here,
once a month:

```bash
docker compose build --pull && ./runUpdateThisStack.sh
docker image prune -f        # dangling layers of the previous builds
```

A build does not touch the images compose only pulls — the endpoint's, the
exit's, the worker's and DbGate's. `docker compose pull <service>` before
the update refreshes one of them.

Run the test suites (§12) before an update that changes code.

## 3. Logs

- Every container logs to stdout. Neither the compose file nor the Docker
  daemon rotates the logs, so a container's log grows until the container
  is removed; every update removes them (§2).
- **Endpoint:** JSON access log, one line per request, with the TCP peer
  (`request.remote_ip`, the outer proxy for public traffic), the status and
  the duration. `Authorization` and `Cookie` are redacted by Caddy.
- **Django:** in production, gunicorn's access line starts with the
  request's `X-Real-IP`, which the endpoint sets from the `X-Forwarded-For`
  it received (deployment.md §5), then the request, status, bytes and
  milliseconds. Application logs follow the verbose format of `settings.py`.
- **Postgres:** statements slower than 2 s are logged
  (`log_min_duration_statement=2000`).

```bash
docker compose logs --no-log-prefix --since 1h legalops-endpoint | jq -c 'select(.status >= 500) | {ts, uri: .request.uri, status, client: .request.client_ip}'
docker compose logs --since 1h legalops-django | grep -E '" (4|5)[0-9]{2} '
```

## 4. Secret rotation

`.env` values are only read when a container is created, so every rotation
ends with `docker compose up -d`, which recreates the containers that use
the value.

| Secret | Procedure | Effect |
|---|---|---|
| `AI_GATEWAY_KEY` | Edit `.env` (and delete or update the copy in `AI.txt`), then `docker compose up -d legalops-assistant` | The chat and pipeline switch to the new key |
| `ASSISTANT_INTERNAL_SECRET` | `sed -i "s/^ASSISTANT_INTERNAL_SECRET=.*/ASSISTANT_INTERNAL_SECRET=$(openssl rand -hex 32)/" .env`, then `docker compose up -d` | django (the worker loop with it) and the assistant are recreated together; internal calls fail for the few seconds in between |
| `DJANGO_SECRET_KEY` | Same `sed` pattern, then `docker compose up -d` | Nothing users notice: sessions are bearer tokens stored hashed, and nothing is encrypted with the key (MCP header values are stored in plain text) |
| The database password | See below | Django and DbGate reconnect with the new password |
| An admin's password | Change it in the GUI (Paskyra) | Locked out: see below |

Rotating the database password. It is written in `docker-compose.yml`, in
`DATABASE_URL`, in `POSTGRES_PASSWORD` (which only a first init reads) and
in `PASSWORD_con1` of `legalops-dbgate`, which logs in as the same role.
The new value travels by environment into psql's `\getenv`, never on a
command line:

```bash
NEW="$(openssl rand -hex 32)"
NEW="$NEW" docker compose exec -T -e NEW legalops-postgres \
    psql -X -v ON_ERROR_STOP=1 -U legalops -d legalops <<'SQL'
\getenv p NEW
ALTER ROLE legalops PASSWORD :'p';
SQL
sed -i "s|//legalops:[^@]*@|//legalops:$NEW@|; s|POSTGRES_PASSWORD: .*|POSTGRES_PASSWORD: $NEW|; s|PASSWORD_con1: .*|PASSWORD_con1: $NEW|" docker-compose.yml
unset NEW
docker compose up -d
```

Postgres authenticates the other containers with scram-sha-256. Inside the
postgres container itself, the socket and 127.0.0.1 are `trust` (the official
image's default): whoever can `docker exec` there is already root on it.

**Admin lock-out.** `create_admin --reset` makes the account an active admin
again and sets the password. The password travels by environment, never on
the command line:

```bash
read -rsp 'New password: ' NEWPW; echo; export NEWPW
docker compose exec -T -e NEWPW legalops-django \
    python3 manage.py create_admin --email <admin email> --password-env NEWPW --reset
unset NEWPW
```

Setting a password this way ends every existing session of the account (as
after a suspected compromise it should) and is written to the audit log as
"Password set" (`users.reset_password`, no actor). A `--reset` without a
password only re-activates or promotes the account and keeps its sessions.

## 5. Scaling

**API (`legalops-django`).**

- `GUNICORN_WORKERS` × `GUNICORN_THREADS` (default 3 × 8 = 24) requests run
  in parallel.
- Processes give CPU parallelism for PDF and XLSX exports; threads cover the
  I/O waits (uploads under extraction, prompt test runs of up to 15 minutes).
- Every thread may hold one Postgres connection for `DB_CONN_MAX_AGE`
  seconds (60). Keep workers × threads + the worker loop's ~6 + ~10 for
  operators under `max_connections=100`. To go further, raise
  `-c max_connections=` in the postgres `command`; each connection costs
  about 10 MB.
- That is gunicorn. The development server of dev mode (§11) starts a new
  thread for every request, so a kept connection is orphaned with its
  thread and stays open and idle. There `DB_CONN_MAX_AGE` defaults to 0 and
  every request closes its own connection. (On 2026-11-17, with 60 in dev
  mode, two hours of use without a code reload left 100 idle connections —
  all Postgres has — and every request failed with "too many clients
  already"; 150 requests to a throwaway copy left 30 open, with 0 none.)
- Change the values in `.env`, then `docker compose up -d legalops-django`.
- Memory: about 150 MB per gunicorn worker at rest, plus up to 1.5 GB per
  running extraction child, the worker loop's included. The compose file
  sets no limit.

**Jobs (`legalops-worker`).**

- One worker loop runs one job at a time. A report run keeps up to 4 model
  calls (30–80 s each) in flight.
- The work is I/O-bound. The only CPU peaks are sandboxed parsing of large
  acts (about 1 s for a 13 MB act) inside a child capped at 1.5 GB of address
  space.
- The queue uses `SELECT … FOR UPDATE SKIP LOCKED`, so several loops are
  safe. To add one, copy the `legalops-worker` block as
  `legalops-worker-2` with its own `container_name`, and give its loop its
  own PID file (`docker exec -e WORKER_PID_FILE=/tmp/worker-2.pid
  legalops-django …`): a loop that finds the first one's PID file takes
  over from it instead of running beside it. Both loops run inside
  legalops-django.
- The practical ceiling is the gateway budget, not the host.

**Assistant.** A single node process streams many chats concurrently.

## 6. The corpus and its refresh schedule

The worker's scheduler (`compliance/jobs/schedule.py`, checked every minute)
enqueues a kind when its last run is older than the interval:

| Job | Interval | What it does |
|---|---|---|
| `ops.maintenance` | daily | Purges expired sessions; finished jobs older than 90 days (not the job a report points at — for a report made in two parts that is the second part's; the first part's job is purged like any other); model-call telemetry, chat transcripts included, older than 400 days; expired rate-limit windows; orphaned upload files (no document row, older than 6 hours); chat uploads nobody used (no company, never named in a chat message, older than 7 days) |
| `corpus.refresh_all` | weekly | Re-fetches every enabled act; a new version is stored only of a text that changed — the same bytes or the same edition label end the check at once, and other bytes that read as the text in force make no version either. An EU act whose version index does not answer is left as it is (the check fails for that act and is tried again the next week); a new version whose text the act has had before takes over the obligations and readings of that earlier version |

A kind that is still queued or running is never enqueued twice.

- **Manual refresh:** the admin GUI (Teisės aktų bazė), or
  `POST /api/corpus/refresh-all` for all acts and
  `POST /api/corpus/documents/{id}/refresh` for one.
- **First install:** the corpus comes with `postgres/bootstrap.sql.gz`
  (deployment.md §3), with its obligations but without embeddings. One
  "re-embed everything" on the corpus page embeds it (deployment.md §3).
  Nothing is fetched, and no obligations are extracted again. An empty database without the bootstrap starts with
  no corpus. Seed it with `seed_corpus`: it creates the 78 catalogue acts
  (68 enabled) and queues their ingestion (about 15–20 min, gateway tokens
  for the embeddings). Two of the enabled acts — the EBA's guidelines —
  are of the source "upload": nothing is fetched for them, and their rows
  wait for a file (below). With the gateway budget exhausted, or before
  the host has corpus egress, seed later or in parts:

  ```bash
  docker compose exec legalops-django python3 manage.py seed_corpus                   # every missing catalogue act, ingestion queued
  docker compose exec legalops-django python3 manage.py seed_corpus --only mica,dora  # just these slugs
  docker compose exec legalops-django python3 manage.py seed_corpus --no-ingest       # rows only; refresh them later
  ```

- **After the extraction prompt or its model changed:** the obligations
  already extracted are the work of the older prompt. Queue every enabled
  act that is behind — never read, or read before the prompt version now
  in force was written:

  ```bash
  docker compose exec legalops-django python3 manage.py extract_obligations             # every act that is behind
  docker compose exec legalops-django python3 manage.py extract_obligations mica dora   # these acts, whatever their state
  ```

  The worker reads the acts one after another, the smallest first, four
  model calls at a time. Measured on gpt-6.1-sol: the 51 acts enabled on
  2026-11-10 took 461 model calls, two and a half hours and $23.61; the 17
  enabled acts added on 2026-11-13 took 36 calls and $4.77 — 68 acts, 497
  calls and $28.38 in all, giving 5,960 obligations. The jobs wait
  below the work users start, so a report queued meanwhile goes first. An
  act keeps its present proposals until its new extraction has succeeded
  as a whole; obligations an admin reviewed are never touched. Reports
  made before keep their findings as they are. If some acts fail (a spent
  gateway budget, an outage), run the command again: it queues only what
  is still behind. The jobs and their errors are on the admin's jobs page.
- **What a breach can cost:** a report shows each gap the sanction its
  act provides. A report reads the acts it assesses by itself; the rest
  of the corpus — a national law that sets the fines for an EU regulation
  is found only once it has been read — is read by one job:

  ```bash
  docker compose exec legalops-django python3 manage.py read_sanctions             # every enabled act never read
  docker compose exec legalops-django python3 manage.py read_sanctions mica dora   # these acts
  docker compose exec legalops-django python3 manage.py read_sanctions --again     # read anew (after the prompt changed)
  ```

  Measured on 2026-11-13 over the whole corpus: 29 model calls and $0.71
  on gpt-6.1-sol, charged to nobody, giving 262 tiers in 27 acts; read
  anew on 2026-11-19 on a copy of the corpus: 29 calls, $0.61, 309 tiers
  in the same 27 acts with version 2 of the prompt; 29 calls, $0.63,
  288 tiers with version 3; on 2026-11-20 with version 4, 29 calls,
  $0.61, 302 tiers. A new
  version of an act is read by the next report that assesses it. Reports
  made before the reading keep their findings without a consequence.
- **The action register rests on reviewed obligations.** A company's
  register closes an action when a later signed-off report finds its
  obligations met, and it knows an obligation by its id. An obligation
  keeps its id across a re-reading of its act only once an admin has
  approved it; a "proposed" one is replaced. Review the register of
  obligations before re-extracting an act whose obligations are under
  open actions, or those actions can only be closed by hand.
- **Before a review of the register:** the obligations are a model's
  reading of the acts and stay "proposed" until an admin approves them
  on the obligations page. Have them judged first, so the review starts
  where it is needed:

  ```bash
  docker compose exec legalops-django python3 manage.py verify_obligations             # every act with unjudged obligations
  docker compose exec legalops-django python3 manage.py verify_obligations mica dora   # these acts
  docker compose exec legalops-django python3 manage.py verify_obligations --again     # judge anew (after the judge's prompt changed)
  ```

  A second model compares each obligation with the provisions it cites
  and marks it supported, partly or unsupported, with a note. About a
  minute and 15 cents per hundred obligations on gpt-6.1-sol; measured on
  2026-11-13, the whole register of 5,960 obligations took 369 calls and
  $9.80. The page then lists the doubted first. The judge approves and
  rejects nothing, and running the command again reads only what is still
  unjudged.
- **How the shipped register was reviewed (2026-11-13).** The register in
  `postgres/bootstrap.sql.gz` — 5,960 obligations of 68 acts — was judged
  whole (about $10) and then reviewed on the administrator's instruction
  by the AI coding assistant; a person did not read it entry by entry.
  The 5,777 entries the judge found supported were approved in bulk,
  after a sample of 25 was checked against the acts' text and found
  right. The 183 entries the judge doubted, or that shared a flaw with a
  doubted one, were read one by one against the provisions they cite:
  75 approved as written, 86 corrected (who is bound, a missing
  condition or deadline; the judge read the 38 reworded ones again), 10
  rejected — a duplicate cited to a form or an announcing article, or a
  duty of a Member State — and 12 left "proposed" for a person. Each of
  those 183 carries the reason in its notes ("Peržiūra 2026-11-13 …").
  The dump clears who reviewed an entry, as it clears every link to a
  person. Approved here means that the judge and the reviewer found the
  entry carried by its provisions; whoever relies on one for a decision
  still reads the provision.
- **Missing catalogue acts later:** `seed_corpus` creates the missing acts,
  such as ones the catalogue gained after the bootstrap was dumped, and
  skips existing ones. It would also re-create an act an admin deleted
  on purpose; `--only <slug,…>` limits it.
- **Level 2 acts, the supervisor's instructions, the EBA guidelines**
  (in the catalogue since 2026-11-12): the technical standards under MiCA
  and DORA that bind a provider's conduct (13 enabled; 7 ship disabled —
  those that bind only an applicant, a notifying entity or an entity
  picked for threat-led testing, and the two that are report and register
  templates field by field; enable one on its page and it is fetched), the Bank of
  Lithuania's instructions on money-laundering prevention (No 03-17) and
  on international sanctions (No 03-98), and the EBA's ML/TF risk factor
  guidelines (EBA/GL/2021/02 consolidated, and its amendment for
  crypto-asset service providers EBA/GL/2024/01). Ingested on a copy of
  the database on 2026-11-12, the disabled ones included: 24 acts — 22
  fetched and the two EBA guidelines uploaded — in 89 s, for $0.075 of
  embeddings.

  The EBA's site is not on the egress allowlist, so its two guidelines are
  uploaded: open each act on the corpus page, download the Lithuanian PDF
  from its source link and upload it with "Įkelti naują redakciją". (To
  fetch them instead, the exit's allowlist and the worker's `extra_hosts`
  would have to name `www.eba.europa.eu` and the act's source be changed
  to a web address.) A PDF's page headers and page numbers are removed
  before it is read; a guideline printed without its paragraph numbers —
  guideline 2 of the consolidated text — is kept and read as one part.

  Their obligations are extracted like any act's — by the first report
  that assesses the act, or ahead of it for all of them at once:

  ```bash
  docker compose exec legalops-django python3 manage.py extract_obligations   # every enabled act never read: the new ones
  ```

  About 36 model calls for the 17 enabled acts, about $5 on gpt-6.1-sol
  (measured on six of them: 10 to 18 cents a call, 30 to 65 obligations
  an act). A level 2 act is a candidate for the companies its parent act
  is a candidate for, so a crypto-asset service provider's report grows by
  up to 13 acts, the two instructions and the guidelines — several
  hundred findings more when all are taken in. The scope screen shows
  each act with the cost of taking it in, and a person leaves out what
  the company does not need.
- The fetchers pace themselves to 1 request per second per host and use
  HTTPS only. CELLAR's `303` answers carry `http://` locations, which the
  fetcher rewrites to https.

### Refreshing the bootstrap

`postgres/bootstrap.sql.gz` is a snapshot of this instance's corpus and prompts.
Re-dump it after a corpus refresh or an obligation extraction that new
installations should inherit:

```bash
scripts/db_bootstrap_dump.sh
```

The script copies the live database into a throwaway postgres (same image,
no network) and empties every table except the migrations, the corpus
tables and the prompts. It drops superseded act versions, clears references
to accounts and drops a company's own obligations. It also clears the
embeddings: as SQL text they were three quarters of a 156 MB file. It then
writes the gzipped plain SQL dump (about 11 MB on 2026-11-16, the file the repository ships; it took about 40 s when the dump was 9 MB). The live database is only read. A table
added later ships empty until it is added to the script's `KEEP` list. The
raw source files under `_DATA/django/uploads/corpus/` are not included:
nothing reads them once a version is ready.

### The 1009 LTD demo company

`scripts/demo_1009.py` recreates the course's sample company through the API. It fills the profile, records the claimed MiCA licence and uploads the 26 policies from the repository's own copy (`django/compliance/prompts/evals/data/1009-ltd/documents`; `MATERIALS` names another folder). It is idempotent, and `--analyse` also prints the cost estimate and starts a report scoped to the core CASP acts. The usage is in the script's header. Indexing costs cents; a report costs what the estimate prints.

## 7. Egress allowlist (corpus sources, MCP servers)

A container on the isolated network reaches an outside host only when BOTH
are in place:

1. an `@exit_<name> tls sni <host>` block with `proxy <host>:443` in
   `exit/Caddyfile`;
2. an `extra_hosts` line `"<host>:172.28.10.30"` on the consuming service in
   `docker-compose.yml`.

Then:

```bash
docker compose up -d
docker compose restart legalops-exit
```

`up -d` recreates the consumer; the exit needs the restart, because only its
Caddyfile changed.

| Consumer | Hosts today |
|---|---|
| `legalops-django` (the worker loop) | "Legal corpus sources": CELLAR/SPARQL `publications.europa.eu`, `www.e-tar.lt`, `www.lb.lt`. Its `extra_hosts` pin `ai.knf.vu.lt` too, though nothing in Django calls the gateway |
| `legalops-assistant` | The LLM gateway `ai.knf.vu.lt`; an external MCP server's host goes here too |

- **External MCP server registered in the GUI:** its host must be added as
  above, or its connection test fails with a connect error.
- `eur-lex.europa.eu` (AWS WAF challenge) and `e-seimas.lrs.lt` (Cloudflare JS
  challenge) are deliberately absent: unattended fetches cannot pass them.
- A missing entry shows up as `Cannot reach <host> (ConnectionError) — is it
  on the egress allowlist?` on the act, or as a DNS failure (`EAI_AGAIN`) in
  the assistant's log.

## 8. Budgets and quotas

- **The gateway key's team budget (on the faculty Bifrost gateway; $10 on
  2026-09-27, raised since)** is the hard limit of the whole installation. When it is used up, the gateway
  answers HTTP 402 to every call: the chat shows `AI_BUDGET_EXHAUSTED`, and
  pipeline and embedding jobs fail. Operators raise that budget at the
  gateway; nothing in this stack changes it. On 2026-09-27 it was exhausted
  ("Team budget exceeded: 10.18 >= 10.00 dollars").
- **`LLM_DAILY_BUDGET_USD`** (default 10.0, 0 = unlimited) is a per-account,
  per-UTC-day ceiling. It only keeps one account from draining the shared
  key.
  - The default was 2.0 until 2026-11-20. On the conversation model in use
    since November (gpt-6-astra) the turn that takes in a company's
    documents costs about $2.90 and a later turn of a conversation that has
    read them about $1.00, so one hand-over of documents spent an ordinary
    account's day. 10.0 holds that turn and a working day's conversation;
    a report needs only $0.25 left to start and may overdraw. Set the
    variable, or an account's own amount, to what the gateway budget
    allows.
  - Admins are unlimited unless an admin sets them an amount. On the Users
    page (Naudotojai) every account can get its own budget: the default,
    unlimited, or a USD amount (`dailyBudgetUsd`).
  - **What counts:** every model call logged against the account — chat
    turns, report runs (except the one-time obligation extraction inside a
    run, which is charged to nobody), prompt test runs, the model's
    judgement in citation checks, the embeddings of the account's uploaded
    documents, and obligation extractions an admin queues from the corpus
    page.
  - **What is refused once it is spent:** a chat turn; starting a report
    (it needs $0.25 left, and a started run is never stopped halfway); a
    prompt test run. A citation check then judges headings by word overlap
    instead of the model. An upload's indexing waits for the reset: the job
    re-queues itself for 00:05 UTC (see the operator checklist).
- **`UPLOAD_QUOTA_FILES` / `UPLOAD_QUOTA_BYTES`** (1000 files / 2 GiB per
  account) cap stored documents: company documents and chat attachments
  alike. A deleted document frees its share.
- **Request bodies.** The endpoint caps nothing. Django refuses a document
  or chat attachment over 50 MiB (`MAX_FILE_BYTES` in
  `django/compliance/companies/api/document_views.py`) and a legal act over
  60 MiB (`MAX_UPLOAD_BYTES` in `django/compliance/corpus/api/views.py`),
  once the body has been spooled (operator checklist, "The upload spool").
  The assistant takes at most 512 kB of JSON on the chat routes. The GUI
  refuses a larger file before it sends anything; its copies of the two
  numbers, and of the file types each upload takes, are in
  `vite/app/src/constants/uploads.js`. Change a limit in both places, then
  run `./runUpdateThisStack.sh`.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `502` from the endpoint | An upstream is down or still starting (during an update, until it is back) | `docker compose ps`; `docker compose logs --tail 100 <service>` |
| `runUpdateThisStack.sh` ends with a migration error | A migration failed; the stack runs on the old schema | Fix it, then `docker compose exec legalops-django python3 manage.py migrate` |
| A pipeline step fails: "Prompt '…' has no active version" | `seed_prompts` never ran on a database that did not start from the bootstrap | `docker compose exec legalops-django python3 manage.py seed_prompts` |
| Jobs stay queued | No worker loop: `legalops-worker` is restarting, or legalops-django is down | `docker compose logs --tail 20 legalops-worker`; `docker compose exec legalops-django cat /tmp/worker.pid` |
| `/api/health` 503 `"reason": "database"` | Postgres down, a wrong password in `DATABASE_URL`, or every connection taken ("too many clients already" in the API's log) | `docker compose logs legalops-postgres`; compare `docker-compose.yml` with the role (§4); taken connections: `docker compose restart legalops-django` frees them — then find what keeps them (§5) |
| `/api/health` 503 `"reason": "uploads"`, or upload errors "Permission denied" | Root-owned files in `_DATA/django` | `chown -R 1000:1000 _DATA/django` (the update script does this) |
| postgres restarts with "data directory has wrong ownership / invalid permissions" | `_DATA/postgres` not uid 1000 / mode 0700 | `chown -R 1000:1000 _DATA/postgres && chmod 700 _DATA/postgres` |
| Chat answers 503 or shows `AI_BUDGET_EXHAUSTED`; jobs fail with `[402] … budget exceeded` | Gateway team budget used up, or `AI_GATEWAY_KEY` empty | §8 — raise the budget at the gateway / set the key |
| The chat says the assistant is restarting (`SHUTTING_DOWN`) | An update is restarting the assistant | Wait a few seconds |
| A corpus act fails: "Cannot reach <host> … egress allowlist?" | The host is not allowlisted | §7 |
| Sign-in answers "Per daug bandymų" (429 `RATE_LIMITED`) | 10 attempts per account per 10 minutes, or `LOGIN_RATE_PER_IP` (60) per minute from one address — and the visitors who reach the outer proxy through the hop in front of it are all one address | Wait for `Retry-After`; see "Client address" |
| Users share one IP, `172.16.0.1`, in the audit log | They reach the outer proxy through a hop whose address it passes on, and the endpoint copies the `X-Forwarded-For` it receives into `X-Real-IP` (deployment.md §5) | Expected until the outer proxy learns the visitor's address from that hop; see "Client address" |
| Pages load, but sign-in and every other write answer 403 with an empty body | The endpoint's Origin guard: the browser's `Origin` does not end in `://<host>` of the request — the site is opened on a port other than the default one, or the outer proxy changes the `Host` header | Open the site at its public address; deployment.md §5 |
| Chat answer arrives all at once, or is cut after 60 s | The outer proxy buffers SSE, or its read timeout is too short | deployment.md §5 |
| A document stays "Teksto nėra" (`extractionStatus: empty`) | A scanned PDF without a text layer; there is no OCR | Upload a PDF with text, or a DOCX |
| A Caddyfile edit has no effect | The container still runs the old file | `docker compose restart legalops-endpoint` (or `-exit`) |
| An upload is refused as too large | Over Django's per-file limit (§8) | Expected |

## 10. Upgrading components

- **Postgres 17.x minor:** change the `FROM` tag in `postgres/Dockerfile`,
  then `./runUpdateThisStack.sh`. The on-disk format is the same.
- **A new major** (18) needs the database dumped with `pg_dump` and loaded
  with `pg_restore` into an empty cluster of the new version; nothing in
  the repository automates it.
- **pgvector:** bump `PGVECTOR_VERSION`, rebuild, then update the extension
  as the superuser:

  ```bash
  docker compose exec legalops-postgres psql -U legalops -d legalops -c "ALTER EXTENSION vector UPDATE"
  ```

- **Caddy, node, python, DbGate:** bump the tag in the Dockerfile or compose
  file, then `./runUpdateThisStack.sh`.

## 11. Dev mode

`docker-compose.yml` runs in dev mode; deployment.md §6 switches it to
production. Dev mode means:

- the vite dev server with HMR, nodemon for the assistant, Django's
  `runserver`;
- bind-mounted sources: a saved file reloads the GUI, the dev assistant and
  Django. The worker loop does not reload: `docker compose restart
  legalops-worker` starts one on the new code;
- vite and the assistant on the external network for npm, which also gives
  the assistant egress past the exit's allowlist.

## 12. Tests

Every suite runs in containers. `runUpdateThisStack.sh` runs none of them:
run them before deploying a code change.

| Runner | Builds | Runs |
|---|---|---|
| `django/runTests.sh` | `legalops-postgres` from `postgres/` and `legalops-django-test` from `django/` (the current source baked in) | A throwaway Postgres + pgvector (data on tmpfs) on a private network, then `makemigrations --check --dry-run` and `manage.py test` with 4 parallel workers. The model and the embedder are fakes |
| `assistant/runTests.sh` | The production image as `legalops-assistant-check` (`npm ci --omit=dev`) | `node --test` with no network, a read-only root, uid 1000, 4 CPUs and 3 GB, in a container named `legalops-assistant-tests-<pid>`. The tests and the service README are mounted read-only; nothing outside `assistant/` is |
| `vite/runTests.sh` | The builder stage of `vite/Dockerfile` as `legalops-vite-check` (`npm ci`, then `npm run build` with the translation guard) | vitest (jsdom, an msw double of the backend) with no network, in a container named `legalops-vite-tests-<pid>`, 4 workers |

- **The prompts' own cases.** The suites above run against a fake model:
  they prove the plumbing, not the prompts. What a prompt change does to
  the model's answers is measured by labelled cases kept in the repository
  (`django/compliance/prompts/evals/cases/*.yaml`, each with the answer a
  careful reader gives and the reason):

  ```bash
  docker compose exec legalops-django python3 manage.py eval_prompts            # every suite
  docker compose exec legalops-django python3 manage.py eval_prompts verify     # one suite
  docker compose exec legalops-django python3 manage.py eval_prompts --record   # accept the scores as the baseline
  ```

  It calls the real model through the code the product runs (about a
  dollar for the six suites, measured 2026-11-12 — the judge of the
  register, the scope of an act, the citation check, which acts apply to a
  company, what a breach can cost, and the gap analysis, which is nearly
  half of it at $0.42),
  prints every case the model got wrong, and fails when a suite scores
  below `prompts/evals/baseline.json`. Run it before and after changing
  one of these prompts, its model or the schema of its answer — the form
  of a schema is part of what the model reads (on 2026-11-17 a schema
  written in two shapes cost the gap suite three cases) — and compare the
  two runs of the same day, not only each with the baseline: the provider's
  model drifts, and that day one sanctions case failed with the unchanged
  code too. Run one suite at a time: suites run side by side exceed the
  gateway's token rate, and a run that is refused fails. Record a new
  baseline only after reading what is still wrong. The baseline names a prompt's version by
  its number in the database where it was recorded: the same wording may
  carry another number on another installation.
  The scope, citation, applicability and
  sanction suites read this installation's corpus; the gap suite also reads the demo company's 26
  policies and profile, kept beside the cases
  (`prompts/evals/data/1009-ltd`), so it judges the same documents on any
  installation. Its 71 cases were labelled by two readers who did not see
  the model's answers; a case where a careful reader could go either way
  lists the second answer under `accept`. The model's answers vary a
  little from run to run, so a baseline entry may carry `slack` — the
  number of cases a run may lose before the suite fails (2 for the gap
  suite). A label is overruled by editing its case.
- **Overlap.** The three runners can run at the same time, each also beside
  a second run of itself:
  - Django names its database container and network per run
    (`legalops-test-db-<run>`), and every parallel worker gets its own
    upload folder (`compliance/tests/runner.py`);
  - the GUI and assistant runners name their containers per run.
- `django/runTests.sh` tags the Postgres image it builds `legalops-postgres`,
  the tag the stack uses: after an edit of `postgres/Dockerfile`, the stack's
  next `up` recreates postgres from the tested image.
- The assistant suite reads the service README (`assistant/README.md`, which
  the runner mounts beside the tests) and no file under `docs/`: a route
  missing from the README, or a path there that the assistant does not
  serve, fails it.

Running parts of a suite:

```bash
django/runTests.sh compliance.tests.test_corpus               # one module
django/runTests.sh compliance.tests.test_audit.AuditPagingTests  # one class
PARALLEL=1 VERBOSITY=2 django/runTests.sh compliance.tests.test_jobs   # serial, verbose

assistant/runTests.sh tests/server.test.mjs                    # some files (paths inside app/)
assistant/runTests.sh --test-name-pattern='SIGTERM'            # any node --test flag

vite/runTests.sh tests/pages/users.test.jsx                    # some files (paths inside app/)
vite/runTests.sh -t 'route sweep'                              # any vitest argument
```

Iterating on one file is faster against the working tree, without an image
build:

```bash
docker run --rm --network none -v "$PWD/assistant/app:/app" -w /app --cpus=4 --memory=3g \
    node:24.16.0 node --test --test-force-exit tests/<file>.test.mjs
docker run --rm --network none -v "$PWD/vite/app:/app" -w /app node:24.16.0 npx vitest run tests/pages/users.test.jsx
docker run --rm --network none -v "$PWD/vite/app:/app" -w /app node:24.16.0 npm run lint   # eslint + the translation guard
```

These use the `node_modules` the dev containers installed in the bind mounts
(on a fresh checkout, run `npm ci` in the same container first). Without the
runner's mounts the assistant's README rules are skipped, so the full
`runTests.sh` is the run that counts before a deploy. The suites' layout and
conventions are in `assistant/app/tests/README.md` and
`vite/app/tests/README.md`.

**Live smoke (assistant).** `assistant/app/tests/live-smoke.test.mjs` checks
the running assistant at no cost: `/health`, the refusals, Django answering
the identity check, the gateway's model list holding the configured models,
and no secret in any answer. It starts no chat turn. The runner skips it; run
it after a deploy:

```bash
# Dev mode: app/ is mounted in the running container
docker exec -w /app -e RUN_LIVE=1 legalops-assistant node --test tests/live-smoke.test.mjs

# Either mode (the production image carries no tests): the stack's own image, on the assistant's network
docker run --rm --network container:legalops-assistant --read-only --tmpfs /tmp --user 1000:1000 \
    --env-file .env -e RUN_LIVE=1 -v "$PWD/assistant/app/tests:/app/tests:ro" -w /app \
    legalops-assistant node --test tests/live-smoke.test.mjs
```

## Client address

On the live host, public requests reach `legalops-endpoint` from the outer proxy `172.19.2.3`. That proxy sends `X-Forwarded-For: 172.16.0.1`, a private address of the hop in front of it, so the real visitor address is already lost before our stack (verified 2026-09-27). The likely cause is Docker's userland proxy on the outer proxy's published port, or another proxy hop. The endpoint's own access log of 2026-11-09 13:16 to 2026-11-16 10:00 UTC narrows that: of the 59,993 requests that carried the header, 47,407 named `172.16.0.1` — among them 7,573 of the 7,795 that came with an `Authorization` header, the signed-in use — 12,585 a public address, 258 different ones, and one another private address; 2,345 more requests carried no such header (they did not come through the proxy). The header held exactly one address every time, never a list. So the address is lost for the visitors who reach the proxy through that hop, which is nearly all signed-in use, while a visitor the proxy sees directly arrives under a public address.

The endpoint copies the `X-Forwarded-For` it receives into `X-Real-IP`, replacing an `X-Real-IP` the client sent, and Django takes the client address from that header — the peer address when it is empty; the assistant hands it on with the calls it makes for a user (deployment.md §5). Consequences:
- Every visitor behind that hop appears as the one address `172.16.0.1` in the audit log and the per-IP login limit; a visitor the proxy sees directly appears under the public address the proxy names. A request that reaches the endpoint with no `X-Forwarded-For` — one made on the host itself — appears as the endpoint's own address.
- For the visitors behind the hop the per-IP login limit (`LOGIN_RATE_PER_IP`, default 60 per minute) is therefore one window they all share: it tells none of them apart, and 60 attempts a minute, whoever of them makes them, hold sign-in back for all of them until the window ends. The per-account limit (10 per 10 minutes) is the brute-force guard.
- A client cannot choose its address through the public route: the outer proxy overwrites an `X-Forwarded-For` the client sends. Tested on 2026-11-16 with one request to the public address carrying a made-up `X-Forwarded-For` and `X-Real-IP`: the endpoint received the proxy's own `X-Forwarded-For` (`172.16.0.1`), and the made-up `X-Real-IP`, which the proxy let through, is replaced by the endpoint. A client that reaches the endpoint directly, from the host or the hosting's network, can still send any address.
- Fixing the rest is the outer proxy's part alone now: for the traffic that comes through the hop it must learn the visitor's address (trust the hop in front, or disable Docker's `userland-proxy` so published ports keep the source address) and put that, and only that, into `X-Forwarded-For`. The endpoint already hands the header on. Then check an audit row (`auth.login_failed`) for the real address.

## Operator checklist (residual risks)

What the code does not cover and the operator must decide or do. Checked on
the live host on 2026-09-28.

1. **No trustworthy client address.** See "Client address". The audit log's
   IP column shows one address, `172.16.0.1`, for every visitor who reaches
   the outer proxy through the hop in front of it — nearly all signed-in
   use — and the per-IP login limit is one window they all share. (The
   endpoint's part as `endpoint/Caddyfile` stands on 2026-11-16; the
   proxy's header as the endpoint's access log of 2026-11-09 to 2026-11-16
   shows it.)
2. **The hosting's management plane can read and write this folder.**
   - `sistema-filebrowser` mounts `/apps/aplikacijos` read-write;
     `sistema-dockge` mounts it read-write together with the Docker socket.
     Both reach `.env`, the uploads and `_DATA/postgres`.
   - They are served by `sistema-endpoint` (host port 10080, which also
     proxies the Docker socket and a web SSH). It admits only the hosting's
     control proxies by source address (172.19.2.2 and 172.19.2.11).
   - Restrict who can reach those control proxies, and treat everyone who
     can as root on this host.
3. **Dev mode is live.**
   `docker-compose.yml` runs the dev servers on bind-mounted sources, with
   the assistant on the external network (open egress); production mode
   (deployment.md §6) ends that. The endpoint itself now guards the Origin
   and sends the CSP and HSTS (deployment.md §5, as `endpoint/Caddyfile`
   stands on 2026-11-16); its CSP still allows inline scripts and styles and
   `eval`.
4. **The gateway key.** `.env` and `AI.txt` are mode 600 now; they were
   world-readable (644) on the live host before. If other local users, or
   the management plane's users, could read them then, rotate
   `AI_GATEWAY_KEY` at the gateway (§4). `AI.txt` only duplicates the key:
   delete it once `.env` holds the key.
5. **Leftovers in `.env` (checked 2026-11-04).** The old update script wrote
   `ADMIN_EMAIL` and `ADMIN_PASSWORD`, the first admin's password in plain
   text, into the live `.env`, and `AI_EMBED_DIMENSIONS` is gone from the
   code. Nothing reads the three: delete them, and change the admin password
   on Paskyra if it was never changed.
6. **Document embedding and the budget.** Indexing an upload is charged to
   the uploader. Once their daily budget is spent, the indexing job embeds
   nothing: it queues itself again for 00:05 UTC, after the reset, and its
   result says so on the Jobs page ("Waiting for the daily AI budget").
   Accounts with an unlimited budget (admins by default) are never held back.
   - The upload quota bounds what one account holds at once. At the defaults
     (1000 files, 2 GiB, at most 4 million extracted characters per
     document, text-embedding-3-large at $0.13 per million tokens) that is
     roughly $65–100 for 2 GiB of plain text, and about $160–195 at most
     when 1000 compressed PDFs or DOCX files each reach the character cap.
   - Deleting documents frees the quota, so an account that uploads and
     deletes in a loop spends up to its daily budget every day — no more.
   - Watch the usage page ("Vektorizavimas"); lower the account's budget or
     `UPLOAD_QUOTA_*`, or deactivate the account, if it happens.
7. **The upload spool.** Django keeps request files up to 5 MB in memory
   (`FILE_UPLOAD_MAX_MEMORY_SIZE`) and spools larger ones to `/tmp`
   (`FILE_UPLOAD_TEMP_DIR` is not set). In `legalops-django` that is a
   512 MB tmpfs in the host's memory, shared with WeasyPrint's font cache.
   About ten concurrent maximum-size uploads fill it, and so does a single
   oversized body, since the endpoint caps nothing; later uploads then fail
   until the spool drains.
8. **Prompt injection across companies.** A chat acts with its user's
   rights, and an admin's rights reach every company.
   - An instruction planted in a document that an admin's chat reads could
     make the model call the company and report tools on other companies:
     read or edit profiles, credentials and roles, override findings, start
     an analysis within the admin's budget.
   - The tools cannot reach users, the corpus, prompts, MCP settings or the
     audit trail.
   - Admins should link each conversation to the company it is about, check
     the tool pills of every answer, and use a plain user account for
     everyday analysis work.
9. **MCP servers see what the model sends them.** An enabled server
    receives the arguments of its tool calls, which can carry company data
    from the conversation. Enable only servers you trust, with
    `allowedTools` narrowed to what is needed.
10. **The admin database tool.** `/dbgate/` gives every signed-in
    administrator the whole database: DbGate logs in to Postgres as the
    superuser, and what is read or changed there goes past the API — no
    validation, no tenancy rule, no audit row (the endpoint's access log
    shows the requests, not the statements). An administrator's account, or
    a stolen administrator session, is therefore full database access: keep
    the administrators few. (Read from `endpoint/Caddyfile` and the
    versioned compose sample on 2026-11-16; the tool was running on the live
    host that day.)
