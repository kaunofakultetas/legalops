#!/bin/sh
# -----------------------------------------------------------
#  [*] Frontend — regression test runner
#
#  Builds the builder stage of the PRODUCTION Dockerfile (the
#  same node image, the same `npm ci` from package-lock.json
#  and the same `npm run build` — translation guard included
#  — that produce dist/) and runs the vitest suite inside a
#  throwaway container with no network: what gets tested is
#  exactly what ships, the host needs no node, and a request
#  that slipped past the backend double cannot reach anything.
#
#    ./runTests.sh                               — the suite
#    ./runTests.sh tests/pages/users.test.jsx    — some files
#    ./runTests.sh -t 'route sweep'              — any vitest
#                                                  argument
#
#  Iterating on one file is faster against the working tree
#  (no image build; tests/README.md has the command).
#
#  Runs may overlap: the test container is named per run.
# -----------------------------------------------------------
set -e
cd "$(dirname "$0")"

sudo docker build --target builder -t legalops-vite-check .
sudo docker run --rm --name "legalops-vite-tests-$$" --network none --memory=6g --memory-swap=6g --cpus=6 \
  legalops-vite-check npx vitest run --maxWorkers=4 "$@"
