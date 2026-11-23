############################################################
#  [*] Test settings — the production settings, on Postgres
#
#  Imports the real settings.py so every regression test runs
#  under the production configuration, and swaps only what a
#  throwaway run must not depend on: the secret gets a
#  harmless default, the database comes from
#  TEST_DATABASE_URL (a throwaway Postgres + pgvector
#  container started by runTests.sh — the corpus search, SKIP
#  LOCKED and the functional unique indexes need the real
#  engine), uploads go to a temp dir (one per worker under
#  --parallel: tests/runner.py), logging is silenced
#  because the suite pins many 4xx/5xx answers on purpose.
############################################################


import os
import tempfile


import environ
from django.core.exceptions import ImproperlyConfigured


if not os.environ.get("TEST_DATABASE_URL"):
    raise ImproperlyConfigured("TEST_DATABASE_URL is not set — run the suite through django/runTests.sh")

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key")
os.environ.setdefault("ASSISTANT_INTERNAL_SECRET", "test-internal-secret")
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

from compliance.settings import *  # noqa: E402,F401,F403


DATABASES = {"default": environ.Env().db_url("TEST_DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
DATABASES["default"]["CONN_MAX_AGE"] = 0

UPLOAD_DIR = tempfile.mkdtemp(prefix="legalops-test-uploads-")

# Gives every --parallel worker its own UPLOAD_DIR
TEST_RUNNER = "compliance.tests.runner.ComplianceTestRunner"

# The suite never reaches a real gateway — tests that need
# model output patch compliance.assistant.gateway
ASSISTANT_URL = "http://gateway.invalid"

LOGGING = {"version": 1, "disable_existing_loggers": True}
