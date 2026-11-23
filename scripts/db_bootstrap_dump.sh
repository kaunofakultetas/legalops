#!/bin/bash
############################################################
#  [*] scripts/db_bootstrap_dump.sh — postgres/bootstrap.sql.gz
#
#  Writes the database a NEW installation starts from: the
#  schema, the migration history, the legal corpus (acts,
#  their current versions, structure, chunks and obligations)
#  and the prompts, as gzipped plain SQL. Compose mounts the
#  file read-only into /docker-entrypoint-initdb.d, so the
#  official entrypoint loads it once, when it initialises an
#  empty data directory — never on an existing cluster.
#
#  The embeddings are left out: as SQL text they were three
#  quarters of the file. A new installation runs the corpus
#  page's "re-embed everything" once (the corpus.reembed job:
#  every current chunk and both languages of every
#  obligation); until then search finds keyword matches only
#  and reports have no evidence matching. embed_model is
#  cleared with them, so the versions table shows which
#  versions still wait.
#
#  Nothing of the people using this instance goes in: users,
#  sessions, companies and everything under them (documents,
#  roles, credentials, a company's own obligations), reports,
#  chats and MCP servers are emptied, and so are the runtime
#  records (jobs, audit log, model calls, rate limits, the
#  price cache). It is an allow-list: a table not in KEEP
#  ships empty, so a new table never leaks by default.
#  References from kept rows to people (created_by,
#  reviewed_by) are cleared, as deleting the user in the app
#  would; superseded corpus versions are dropped — retrieval
#  reads only the current one. The raw source files under
#  uploads/corpus/ are not included: nothing reads them once a
#  version is ready.
#
#  The live database is never written: pg_dump copies it into
#  a throwaway postgres (same image, no network, tmpfs), the
#  cut runs there in ONE transaction — the deferred foreign
#  keys are checked at its commit, so a kept row still
#  pointing at an emptied table fails the run instead of the
#  new installation — and that copy is dumped as plain SQL.
############################################################

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

OUT=postgres/bootstrap.sql.gz
SCRATCH="legalops-bootstrap-$$"

if [ "$(id -u)" -eq 0 ]; then
    SUDO=()
else
    SUDO=(sudo)
fi
DOCKER=("${SUDO[@]}" docker)

trap '"${DOCKER[@]}" rm -f "$SCRATCH" > /dev/null 2>&1 || true; rm -f "$OUT.part"' EXIT



# STEP 1: a throwaway postgres from the same image
# ================================================
"${DOCKER[@]}" run -d --rm --name "$SCRATCH" --network none --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=legalops -e POSTGRES_DB=legalops -e POSTGRES_HOST_AUTH_METHOD=trust \
    legalops-postgres > /dev/null
until "${DOCKER[@]}" exec "$SCRATCH" pg_isready -q -h 127.0.0.1 -U legalops; do sleep 1; done



# STEP 2: the live database copied in, one consistent snapshot
# ============================================================
# The live container names its own role and database: an
# installation keeps the names its data directory was made with
echo "Copying the live database into $SCRATCH ..."
"${DOCKER[@]}" exec legalops-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    | "${DOCKER[@]}" exec -i "$SCRATCH" pg_restore -U legalops -d legalops --no-owner --no-privileges --exit-on-error



# STEP 3: the cut — only what a new installation needs
# ====================================================
"${DOCKER[@]}" exec -i "$SCRATCH" psql -X -q -v ON_ERROR_STOP=1 -U legalops -d legalops <<'SQL'
BEGIN;
SET CONSTRAINTS ALL DEFERRED;

-- A company's own duties, and the kept rows' links to people
DELETE FROM obligations WHERE company_id IS NOT NULL OR company_document_id IS NOT NULL;
UPDATE obligations SET reviewed_by_id = NULL;
UPDATE legal_documents SET created_by_id = NULL;
UPDATE legal_document_versions SET created_by_id = NULL;
UPDATE prompt_versions SET created_by_id = NULL;

-- No embeddings: the new installation embeds with its own gateway
UPDATE legal_chunks SET embedding = NULL;
UPDATE obligations SET embedding = NULL, embedding_en = NULL;
UPDATE legal_document_versions SET embed_model = '';

-- Superseded corpus versions (their chunks are already gone)
UPDATE obligations SET version_id = NULL, unit_id = NULL
    WHERE version_id NOT IN (SELECT current_version_id FROM legal_documents WHERE current_version_id IS NOT NULL);
DELETE FROM legal_chunks WHERE version_id NOT IN (SELECT current_version_id FROM legal_documents WHERE current_version_id IS NOT NULL);
DELETE FROM legal_units WHERE version_id NOT IN (SELECT current_version_id FROM legal_documents WHERE current_version_id IS NOT NULL);
DELETE FROM legal_document_versions WHERE id NOT IN (SELECT current_version_id FROM legal_documents WHERE current_version_id IS NOT NULL);

-- Every table outside KEEP ships empty
DO $$
DECLARE
    keep text[] := ARRAY['django_migrations', 'legal_documents', 'legal_document_versions', 'legal_units',
                         'legal_chunks', 'obligations', 'prompts', 'prompt_versions'];
    t text;
BEGIN
    FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
                                                AND NOT relname = ANY (keep) LOOP
        EXECUTE format('DELETE FROM %I', t);
    END LOOP;
END $$;
COMMIT;
SQL



# STEP 4: the gzipped plain SQL the entrypoint loads
# ==================================================
# Readable by the postgres container's uid 1000 through the
# mount — it holds no secrets
"${DOCKER[@]}" exec "$SCRATCH" pg_dump -U legalops -d legalops --no-owner --no-privileges | gzip -9 > "$OUT.part"
chmod 644 "$OUT.part"
mv "$OUT.part" "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
