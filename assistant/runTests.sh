#!/bin/sh
# -----------------------------------------------------------
#  [*] Assistant — regression test runner
#
#  Builds the production image and runs the node --test suite
#  in a throwaway container that runs like the real one —
#  read-only root, uid 1000, /tmp a tmpfs — with no network
#  and none of the stack's secrets, so no test can call out or
#  spend the AI budget. Only the service's own folder is
#  mounted, read-only: its tests and its README (which
#  structural.test.mjs checks against the routes) — nothing of
#  the other services. Extra arguments go to node --test.
#
#  --test-force-exit ends each file's process after its tests,
#  since a handle a test left open would hold the run forever.
#  The container is named per run, so runs may overlap. The
#  live smoke layer needs the running service and is skipped
#  here; tests/README.md has its commands and the quicker run
#  against the working tree.
# -----------------------------------------------------------
set -e
cd "$(dirname "$0")"

sudo docker build -q -t legalops-assistant-check . >/dev/null
sudo docker run --rm --name "legalops-assistant-tests-$$" --network none --cpus=4 --memory=3g --memory-swap=3g \
  --read-only --tmpfs /tmp --user 1000:1000 \
  -v "$PWD/app/tests:/app/tests:ro" \
  -v "$PWD/README.md:/README.md:ro" \
  legalops-assistant-check node --test --test-force-exit "$@"
