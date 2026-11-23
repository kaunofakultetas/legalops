#!/bin/bash
############################################################
#  [*] Run the Django regression tests
#
#  Builds the images and runs the suite in a throwaway --rm
#  container against a throwaway Postgres + pgvector
#  container (tmpfs data) on a private network — nothing
#  running is touched, nothing survives the run.
#  `makemigrations --check` goes first: the migrations are
#  kept in step with models.py by hand, so drift must fail
#  HERE, never at a deploy.
#
#    ./runTests.sh                         — the whole suite
#    ./runTests.sh compliance.tests.test_corpus   — one module
#    PARALLEL=1 VERBOSITY=2 ./runTests.sh  — serial, verbose
#
#  Runs may overlap: the database container and its network
#  are named per run.
############################################################

set -euo pipefail
cd "$(dirname "$0")"

# Unique per run: two runs at once (two terminals, two agents)
# must not share — or remove — each other's database
RUN_ID="$$-$RANDOM"
NET="legalops-test-net-$RUN_ID"
DB="legalops-test-db-$RUN_ID"
LABELS="${*:-compliance.tests}"

cleanup() {
    sudo docker rm -f "$DB" >/dev/null 2>&1 || true
    sudo docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup


# STEP 1: images — the test image bakes the current source
# ========================================================
sudo docker build -q -t legalops-postgres ../postgres >/dev/null
sudo docker build -q -t legalops-django-test . >/dev/null


# STEP 2: the throwaway database, ready on TCP
# ============================================
sudo docker network create "$NET" >/dev/null
sudo docker run -d --name "$DB" --network "$NET" \
    -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test \
    --tmpfs /var/lib/postgresql/data legalops-postgres >/dev/null
until sudo docker exec "$DB" pg_isready -h 127.0.0.1 -U test -d test >/dev/null 2>&1; do
    sleep 1
done


# STEP 3: migrations check, then the suite
# ========================================
sudo docker run --rm --network "$NET" \
    -e TEST_DATABASE_URL="postgres://test:test@$DB:5432/test" \
    legalops-django-test sh -c "\
        python3 manage.py makemigrations --check --dry-run --settings=compliance.tests.settings && \
        python3 manage.py test $LABELS --settings=compliance.tests.settings \
            --parallel ${PARALLEL:-4} -v ${VERBOSITY:-1}"
