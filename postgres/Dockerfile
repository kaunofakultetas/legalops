############################################################
#  [*] legalops-postgres — postgres + pgvector
#
#  Stock alpine Postgres 17 with the pgvector extension
#  compiled in, so the retrieval index (embeddings over the
#  corpus and the company documents) lives in the one
#  database.
#
#  Django connects as the superuser POSTGRES_USER
#  ("legalops" in docker-compose.sample.yml). On an EMPTY data
#  dir the entrypoint loads postgres/bootstrap.sql.gz
#  (mounted read-only by compose; scripts/db_bootstrap_dump.sh
#  writes it): schema, vector extension, corpus without its
#  embeddings and prompts, so a new installation needs no
#  seeding — only one re-embed of the corpus.
#
#  Upgrades: a new 17.x minor or pgvector patch is a rebuild
#  + recreate (same on-disk format); after a pgvector bump
#  run ALTER EXTENSION vector UPDATE as the superuser — see
#  docs/markdown/en/operations.md. OPTFLAGS="" builds pgvector without
#  -march=native, so the image runs on any x86-64 host.
#
#  Also used by django/runTests.sh (throwaway test database,
#  no bootstrap mount) and scripts/db_bootstrap_dump.sh.
############################################################

FROM postgres:17.11-alpine3.24

ARG PGVECTOR_VERSION=v0.8.6

# Compiled with the LLVM the server's JIT was built with
# ($DOCKER_PG_LLVM_DEPS comes from the base image)
RUN apk add --no-cache --virtual .build-deps git build-base $DOCKER_PG_LLVM_DEPS \
    && git clone --branch "$PGVECTOR_VERSION" --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && make -C /tmp/pgvector OPTFLAGS="" \
    && make -C /tmp/pgvector OPTFLAGS="" install \
    && rm -rf /tmp/pgvector \
    && apk del .build-deps
