# Compliance assistant — deployment

How to install the stack on a host, what the outer proxy must do, and how
to switch the compose file to production mode. Day-to-day operations
(updates, rotation, scaling, troubleshooting) are in
[operations.md](operations.md).

## 1. What runs

One Docker Compose project from `docker-compose.yml`, named after its folder
(`comp-assistant`). The file runs in dev mode; the lines tagged `# Dev` /
`# Prod` switch it (§6).

| Service | Image | Role |
|---|---|---|
| `legalops-endpoint` | caddy:2.11-alpine | Ingress on host port 80: `/api/assistant/*` to the assistant, `/api/*` to Django, `/dbgate/*` to DbGate behind `forward_auth` to Django's `/api/auth/checkauth/admin`, everything else to the GUI (the public site at the root, the console under `/console`); an Origin guard, and a CSP and HSTS on every answer it does not refuse (§5); a JSON access log |
| `legalops-exit` | vuknf/caddy-l4:2.11 | Egress: a TLS SNI allowlist at 172.28.10.30 |
| `legalops-vite` | `vite/Dockerfile.dev` (prod: `vite/Dockerfile`) | The GUI — the public site and the console: the vite dev server (prod: the built files, served by Caddy) |
| `legalops-django` | `django/Dockerfile` | The JSON API: `runserver` (prod: gunicorn, 3 workers × 8 threads). The worker loop runs inside it |
| `legalops-worker` | docker:27-cli | Starts the job loop inside legalops-django (`docker exec … manage.py run_worker`): corpus ingestion, document indexing, obligation extraction, the report pipeline, maintenance |
| `legalops-assistant` | `assistant/Dockerfile.dev` (prod: `assistant/Dockerfile`) | The chat (SSE) and every model call |
| `legalops-postgres` | `postgres/Dockerfile` | Postgres 17.11 + pgvector 0.8.6; an empty cluster loads `postgres/bootstrap.sql.gz` |
| `legalops-dbgate` | dbgate/dbgate:7.3.3-alpine | DbGate, a web client for the database, for administrators: served at `/dbgate/` behind Django's admin gate; it logs in to Postgres as the superuser `legalops` |

Every container has a read-only root filesystem. The endpoint, the exit,
Django and Postgres run as uid 1000. The GUI and the assistant run as their
image's default user, root: the `user: 1000:1000` line is commented out for
both in the compose file, and none of their Dockerfiles sets a `USER`.
`legalops-dbgate` runs as root too. So does `legalops-worker`, to use
the Docker socket, which makes it root on the host; it has no network and
runs nothing but that `docker exec`. The compose file sets no `init`,
capability drops, resource limits, healthchecks or start order: the services
start together, and the endpoint answers 502 until its upstreams are up.

Networks:

- `isolated` (172.28.10.0/24, `internal: true`; compose prefixes its name
  with the project) carries every service except the worker and has no
  route out.
- `external` (172.18.0.0/24) is not the compose project's own: it is a
  Docker network of exactly that name, which the compose file only refers
  to (`external: true`) and `runUpdateThisStack.sh` creates when the host
  has none. It is joined by the endpoint (it publishes port 80) and the
  exit, and in dev mode by vite and the assistant, for npm. Whatever else
  on the host uses a network of that name shares it: on the live host it
  was there before the stack, and the hosting's `sistema-endpoint` and
  `sistema-webssh2` sit on it too (seen 2026-11-16).

Egress goes through the exit. A container on the isolated network reaches an
outside host only through an `extra_hosts` pin to 172.28.10.30 plus an
`@exit_` block in `exit/Caddyfile`, and only over HTTPS (operations.md §7).
Today the assistant reaches `ai.knf.vu.lt`, and legalops-django (for the
worker loop) `publications.europa.eu`, `www.e-tar.lt` and `www.lb.lt`; the
compose file pins `ai.knf.vu.lt` for legalops-django as well, though
nothing in Django calls the gateway. In dev mode the assistant also sits on
the external network, past the allowlist.

## 2. Prerequisites

- A Linux host with Docker Engine (tested on 27.3.1) and both compose front
  ends: `runUpdateThisStack.sh` calls `docker-compose`, these docs and the
  scripts call `docker compose` (tested on 2.40.3 and 2.29.7). Nothing else
  is installed on the host (no node, no pip).
- 4 CPU cores and 8 GB RAM are comfortable. No container has a memory limit;
  the peaks are the sandboxed extraction children (1.5 GB of address space
  each) and PDF renders.
- Disk: about 3 GB for images, plus `_DATA` (database and uploads).
- Host port 80 free, and the subnets 172.28.10.0/24 and 172.18.0.0/24 unused
  by other Docker networks. The first is set in `docker-compose.yml`: change
  it there if needed, and keep the exit's IP and every `extra_hosts` pin in
  step. The second is set in `runUpdateThisStack.sh`, which creates the
  network `external` with it; a host that already has a network of that
  name keeps it as it is, and the stack joins it.
- Outbound HTTPS from the host to `ai.knf.vu.lt`, `publications.europa.eu`,
  `www.e-tar.lt`, `www.lb.lt`, and during builds to Docker Hub, npm, PyPI,
  GitHub (pgvector) and the Debian and Alpine package mirrors.
- A TLS-terminating reverse proxy in front (§5).

## 3. Fresh install

```bash
git clone <repo> /apps/aplikacijos/comp-assistant
cd /apps/aplikacijos/comp-assistant
cp docker-compose.sample.yml docker-compose.yml
touch .env && chmod 600 .env
$EDITOR .env                  # one line: AI_GATEWAY_KEY=<the gateway key>
./runUpdateThisStack.sh
```

`docker-compose.yml` is not versioned: it is the installation's own copy of
`docker-compose.sample.yml`, and nothing copies it for you. There is no
`.env.sample` either: `.env` starts as the one line with the gateway key,
and the script adds the secrets it mints.

The script does the same on every run:

1. Creates `_DATA/django/uploads` and `_DATA/postgres` and gives `_DATA` to
   uid 1000.
2. Appends to `.env` what it lacks, creating the file when there is none
   (then with the shell's default mode: `chmod 600 .env`):
   `DJANGO_SECRET_KEY` and `ASSISTANT_INTERNAL_SECRET` (hex), and
   `DBGATE_PASSWORD` (hex) together with `DBGATE_AUTH_HEADER` (the Base64 of
   `dbgate:<password>`). Each is minted only when `.env` has no line for it
   — the DbGate pair when it has no `DBGATE_PASSWORD` line. A line that is
   there, even an empty one, is left alone.
3. Creates the Docker network `external` (subnet 172.18.0.0/24). Where a
   network of that name exists — on every later run, or from the start on a
   host where another stack made it — Docker answers that it does, and the
   script goes on.
4. Takes the stack down and starts it again from freshly built images
   (`docker-compose down`, then `up -d --build`).
5. Waits 5 s and runs `manage.py migrate --noinput` in legalops-django.

It does not run `seed_prompts` (operations.md §2).

On the first start, postgres finds `_DATA/postgres` empty and loads
`postgres/bootstrap.sql.gz`, which compose mounts read-only. The file is
gzipped plain SQL, about 11 MB (the dump of 2026-11-19). It holds:

- the schema, with every migration applied;
- the legal corpus: 78 catalogue acts, and the current versions of the 68
  enabled ones with their structure, chunks and extracted obligations;
- the prompts: 23, in 91 versions, the newest of each active.

The embeddings are left out. It holds no accounts, companies or other data
of the instance it came from. The load takes about 10 s, longer than the
script's 5 s wait. Its `migrate` may
therefore fail with "connection refused". That is harmless: the bootstrap
is already migrated. Later starts find a cluster and load nothing.

Then, on the first install only, create the first admin, sign in and embed
the corpus:

```bash
./runCreateAdmin.sh           # asks for the admin's e-mail and password
```

There is no default login. The script runs `manage.py create_admin` in
legalops-django; the password reaches it by environment, never on a
command line.

- **Embedding.** On the corpus page (Teisės aktų bazė), the menu's
  "Perskaičiuoti visus vektorius" ("Re-embed everything") queues
  `corpus.reembed`. The job embeds every current chunk and both languages
  of every obligation through the gateway. That is about 4,100 chunks and
  11,900 obligation texts: several minutes and under $1. Until it has run:
  - corpus search finds keyword matches only;
  - a report on a company whose documents together exceed 600,000
    characters (`DOCUMENT_PACK_CHARS`) is given none of them: such a
    library is cut to the documents nearest to each obligation, by vector.
    A smaller library is sent whole and is not affected;
  - the act versions table shows "—" as the embedding model.
- The password reaches the container by name, never on a command line. The
  login form accepts any address of the form `something@something`, as
  Django does.
- The bootstrap is as current as its last dump. When the repository's
  prompt defaults or catalogue are newer, `seed_prompts` (operations.md §2)
  and `seed_corpus` (operations.md §6) add what is missing. The scheduled
  corpus refresh brings the acts up to date.

Check the result:

```bash
docker compose ps                       # every service Up
curl -s http://127.0.0.1/api/health     # {"status": "ok", ...}
```

Then sign in at the public URL and go through the operator checklist at
the end of
operations.md.

## 4. `.env` reference

`.env` is mode 600 and never committed. Compose interpolates it; the script
reads it with grep only, appends what is missing and never sources it. What
`docker-compose.yml` takes from it:

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | minted | django | Django internals only (API auth is bearer tokens; nothing is encrypted with it) |
| `ASSISTANT_INTERNAL_SECRET` | minted | django, assistant | Gates both `/internal/*` doors; empty = every internal call refused |
| `DBGATE_PASSWORD` | minted | dbgate | The password of DbGate's own login (user `dbgate`). Nobody types it: the endpoint presents it |
| `DBGATE_AUTH_HEADER` | minted with it | endpoint | The Base64 of `dbgate:<DBGATE_PASSWORD>`: the endpoint adds it as the Basic `Authorization` header on `/dbgate/*`, once Django's admin gate has let the request through. The two change together |
| `AI_GATEWAY_URL` | `https://ai.knf.vu.lt/v1` | assistant | The model gateway, OpenAI's API: `/responses` (language models), `/embeddings`, `/models` |
| `AI_GATEWAY_KEY` | — (set by hand) | assistant | Without it the chat and every pipeline step answer 503 |
| `AI_CHAT_MODEL` | `azure/gpt-5.5` | assistant | The chat model when a prompt version names none; the shipped prompts name theirs |
| `AI_EMBED_MODEL` | `azure/text-embedding-3-large` | assistant | Asked for 1536 dimensions (the width fixed in the models; a longer vector is cut to it, renormalised). Django's copy is written in `docker-compose.yml` itself: change both, then run the full re-embed (Corpus page → re-embed, or `corpus.reembed` without a document — it renews the corpus, the obligations and the company documents) |
| `LLM_DAILY_BUDGET_USD` | `10.0` | django | USD per account per UTC day, 0 = unlimited (operations.md §8) |
| `LOGIN_RATE_PER_IP` | `60` | django | Login attempts per client address per minute |
| `UPLOAD_QUOTA_FILES` | `1000` | django | Documents per account |
| `UPLOAD_QUOTA_BYTES` | `2147483648` | django | Bytes per account (2 GiB) |
| `GUNICORN_WORKERS` / `GUNICORN_THREADS` | `3` / `8` | django (production) | operations.md §5 |

The database role Django logs in as, the superuser `legalops`, and its
password are written in `docker-compose.yml` itself (`DATABASE_URL`,
`POSTGRES_PASSWORD`, and `PASSWORD_con1` of `legalops-dbgate`, which logs
in as the same role). Postgres is reachable only on the isolated network —
and, for an administrator, through DbGate at `/dbgate/`.

The assistant's tuning variables (the chat and model timeouts,
`RATE_LIMIT_TURNS`, `SHUTDOWN_GRACE_MS`, the optional `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `OLLAMA_BASE_URL`, …) are listed with their defaults in
`assistant/app/config.js`. Compose passes none of them, so setting one means
adding it to `legalops-assistant`'s `environment` in `docker-compose.yml`.
The same holds for the API's own: `DJANGO_DEBUG`, `DB_CONN_MAX_AGE`,
`UPLOAD_DIR` and `ASSISTANT_URL` (`django/compliance/settings.py`) keep
their defaults unless they are added to `legalops-django`'s `environment`.
The worker loop reads `WORKER_PID_FILE` and `WORKER_HEARTBEAT_FILE` from its
own environment (operations.md §5 passes the first with `docker exec -e`).

## 5. TLS and the outer proxy

`legalops-endpoint` speaks plain HTTP on host port 80. TLS for
https://compliance.knf-hosting.lt terminates at the hosting's outer reverse
proxy.

**How requests arrive (observed on the live host, 2026-09-27).**

- The public name resolves to 158.129.172.222, the hosting front.
- Inside the endpoint container the TCP peers of public traffic are
  **172.19.2.3**. The host sits at 172.19.2.128/24 behind gateway
  172.19.2.1, and Docker's iptables DNAT keeps the proxy's source address.
- Requests made on the host itself (`curl http://127.0.0.1/`) pass through
  docker-proxy instead and arrive from the external bridge's gateway:
  172.18.0.1 in the endpoint's access log of 2026-11-09 to 2026-11-16
  (172.28.11.1 when this was first observed, the bridge then being
  172.28.11.0/24).

**The client address.** The outer proxy sends `X-Forwarded-For: 172.16.0.1`
(seen on 2026-09-27), the address of a hop in front of it, so the visitor's
address is lost before the stack. The endpoint's access log of 2026-11-09 to
2026-11-16 shows that this holds for the visitors who reach the proxy
through that hop — four requests in five, nearly all signed-in use — while
the others arrive under a public address (operations.md, "Client address").
For the assistant, the API and the GUI the endpoint passes the
`X-Forwarded-For` it received on and sets `X-Real-IP` to that same value,
replacing an `X-Real-IP` the client sent. Django takes the client address
from `X-Real-IP` — the peer address when the header is empty — and the
assistant hands the header on with the calls it makes for a user. So the
address they log and rate-limit by is what the proxy in front of the
endpoint, or a client that reaches the endpoint directly, put in
`X-Forwarded-For`; with no such header every visitor is the endpoint's own
address. A client cannot choose its address by sending an
`X-Forwarded-For` of its own: the outer proxy overwrites that header
(tested on 2026-11-16 with a request to the public address — the endpoint
received the proxy's value, not the made-up one).

**What the endpoint does itself (`endpoint/Caddyfile`).** It answers 403,
with an empty body, to a request whose `Origin` header is set and does not
end in `://<the request's host>`: a page of another site calling this one.
A client that sends no `Origin` passes. The host is compared without a
port, and an `Origin` carries any port but the default one, so the site
must be served on the default port. Every other answer — a redirect, a
502 for an upstream that is down and the gate's refusal on `/dbgate/`
included — carries `Strict-Transport-Security: max-age=31536000` and a
`Content-Security-Policy`: everything from the site itself, scripts and
styles also inline, scripts also through `eval`, images and fonts also from
`data:` addresses, framing by the site itself only, and
`upgrade-insecure-requests` — a browser is told to fetch everything over
HTTPS, which the outer proxy provides. It sets no body limit and no
timeouts. `/dbgate` redirects to `/dbgate/`, and a request under it reaches
`legalops-dbgate` only after Django's `GET /api/auth/checkauth/admin` has
answered that the caller is an administrator; the endpoint then puts
DbGate's own Basic login (`DBGATE_AUTH_HEADER`, §4) in place of the
request's `Authorization` header. A refusal of the gate is handed back as
it is.

**What the outer proxy must do:**

- Forward `https://compliance.knf-hosting.lt/*` to `http://<host>:80`, with
  the `Host` header as the browser sent it: the Origin guard compares a
  request's `Origin` with it.
- Put the visitor's address, and only that, into `X-Forwarded-For`,
  overwriting what the client sent: the endpoint copies the header whole.
  The live proxy names a hop instead for the visitors who come through it
  (above).
- Not buffer `text/event-stream`. Chat answers stream over SSE for up to
  about 3 minutes, and nothing in the stack sends `X-Accel-Buffering: no`, so
  an nginx in front needs `proxy_buffering off` for `/api/assistant/`.
- Keep a read timeout of at least 330 s: report exports and prompt test runs
  are synchronous for minutes, and a reasoning model can be silent for 90 s
  before its first token. A test run of a slow model on a long input may
  last up to 15 minutes; a proxy that cuts it earlier shows an error in the
  prompt editor while the call still completes and is recorded.
- Allow request bodies of at least 62 MiB (legal act uploads; Django refuses
  a file over 60 MiB) and not rewrite them.
- Leave the endpoint's `Strict-Transport-Security` and
  `Content-Security-Policy` headers in place. It need not set HSTS itself:
  the endpoint sends it.

## 6. Production mode

In `docker-compose.yml`, comment out the lines tagged `# Dev` and uncomment
the ones tagged `# Prod`, then run `./runUpdateThisStack.sh`. Production then
runs:

- the built SPA (served by Caddy) and the assistant's production image
  (`node server.js`), without the source bind mounts and off the external
  network;
- Django under gunicorn from the baked image (`DJANGO_RUNSERVER` unset).

From then on a code change reaches the containers only through
`./runUpdateThisStack.sh`. What dev mode runs instead is in operations.md §11.
