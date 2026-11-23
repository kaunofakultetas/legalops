############################################################
#  [*] Django settings — the whole configuration in one file
#
#  Everything environment-specific comes in through env
#  variables (compose supplies them):
#
#    DJANGO_SECRET_KEY          — signing key (required)
#    DJANGO_DEBUG               — "True" only for local
#                                 debugging, never public
#    DATABASE_URL               — postgres://... (pgvector)
#    DB_CONN_MAX_AGE            — persistent connection secs
#    UPLOAD_DIR                 — stored files
#    ASSISTANT_URL              — the node assistant's door
#    ASSISTANT_INTERNAL_SECRET  — gates /internal/* both ways
#    AI_EMBED_MODEL             — embeddings model id
#    LLM_DAILY_BUDGET_USD       — model spend per user per UTC day
#
#  Deliberately NO admin site, NO django.contrib.auth, NO
#  sessions and NO templates of our own: the API
#  authenticates with opaque bearer tokens against its own
#  users/sessions tables (compliance/users/auth.py) and the
#  Vite app is the only GUI.
############################################################


from pathlib import Path

import environ


ROOT_DIR = Path(__file__).resolve(strict=True).parent.parent
env = environ.Env()








############################################################
# General
############################################################
#
# Aware UTC everywhere; the clients localise.
############################################################

DEBUG = env.bool("DJANGO_DEBUG", False)
SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-only-secret-key" if env.bool("DJANGO_DEBUG", False) else environ.Env.NOTSET)
TIME_ZONE = "UTC"
LANGUAGE_CODE = "en-us"
USE_I18N = False
USE_TZ = True








############################################################
# Hosting
############################################################
#
# The service only ever runs behind the Caddy endpoint,
# which forwards whatever Host the client sent. Nothing
# derives facts from the host (no absolute URLs, no
# redirects, no cookies).
############################################################

ALLOWED_HOSTS = ["*"]








############################################################
# Database
############################################################
#
# Postgres (+ pgvector) — the corpus search needs it, so it
# is the only supported engine (the test suite runs on a
# throwaway Postgres too). ATOMIC_REQUESTS wraps every
# request in one transaction.
############################################################

DATABASES = {
    "default": env.db("DATABASE_URL"),
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
# Under gunicorn a thread lives on and keeps its connection
# for a minute (a new TLS-less local connection per request
# is cheap, but not free), checked before reuse, so a Postgres
# restart never hands a request a dead socket. The development
# server starts a new thread for every request: a kept
# connection would be orphaned with its thread, open and idle,
# until all of Postgres's max_connections are taken and every
# request fails with "too many clients" — so there each
# request closes its own
DATABASES["default"]["CONN_MAX_AGE"] = env.int(
    "DB_CONN_MAX_AGE", default=0 if env.bool("DJANGO_RUNSERVER", False) else 60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

DEFAULT_AUTO_FIELD = "django.db.models.AutoField"








############################################################
# URLs
############################################################
#
# All routes live in one file (compliance/urls.py).
# APPEND_SLASH is off: the paths carry no trailing slashes
# and redirecting a POST would break the clients.
############################################################

ROOT_URLCONF = "compliance.urls"
WSGI_APPLICATION = "compliance.wsgi.application"
APPEND_SLASH = False








############################################################
# Uploads
############################################################

UPLOAD_DIR = env("UPLOAD_DIR", default="/data/uploads")

# Per-account upload quota (company documents): at most this
# many files and bytes — a runaway client cannot fill the disk
UPLOAD_QUOTA_FILES = env.int("UPLOAD_QUOTA_FILES", default=1000)
UPLOAD_QUOTA_BYTES = env.int("UPLOAD_QUOTA_BYTES", default=2 * 1024 * 1024 * 1024)

# JSON bodies up to 8 MB are read in memory; uploaded files
# above 5 MB spool to /tmp (a tmpfs) instead of holding up to
# 60 MB per request thread in RAM. Nothing in front caps a
# body (endpoint/Caddyfile sets no limit): Django refuses a
# larger JSON body itself, and the upload routes check the
# size of a file.
DATA_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024








############################################################
# AI assistant
############################################################
#
# Django never calls a model provider: generations and
# embeddings go through the node assistant's internal door
# (ASSISTANT_URL + /internal/llm/*, see assistant/gateway.py).
# ASSISTANT_INTERNAL_SECRET gates BOTH directions of that door
# (empty = every internal call is refused, failing closed).
# AI_EMBED_MODEL names the model every corpus chunk is stored
# with — changing it requires the re-embed job.
############################################################

ASSISTANT_URL = env("ASSISTANT_URL", default="http://legalops-assistant:3000")
ASSISTANT_INTERNAL_SECRET = env("ASSISTANT_INTERNAL_SECRET", default="")
AI_EMBED_MODEL = env("AI_EMBED_MODEL", default="gateway:azure/text-embedding-3-large")

# USD one user may spend on model calls per UTC day across chat
# turns, prompt tests, report runs and the embedding of their
# uploads (the obligations a report extracts are shared corpus
# work and charged to nobody; an extraction an admin queues is
# charged to that admin); 0 = unlimited. The gateway key has
# its own team budget — this keeps one account from draining it.
# The default holds a working day on the conversation model in
# use since November 2026: the turn that takes in a company's
# documents costs about 2.90 and a later turn of a conversation
# that has read them about 1.00 (both measured); a report needs
# only its start covered and may overdraw
LLM_DAILY_BUDGET_USD = env.float("LLM_DAILY_BUDGET_USD", default=10.0)

# Login attempts per client IP per minute (the per-account
# limit, 10 per 10 minutes, is fixed)
LOGIN_RATE_PER_IP = env.int("LOGIN_RATE_PER_IP", default=60)








############################################################
# Apps
############################################################
#
# Only the project's own apps — no contrib at all.
############################################################

INSTALLED_APPS = [
    "compliance.users.apps.UsersConfig",
    "compliance.audit.apps.AuditConfig",
    "compliance.jobs.apps.JobsConfig",
    "compliance.companies.apps.CompaniesConfig",
    "compliance.corpus.apps.CorpusConfig",
    "compliance.analysis.apps.AnalysisConfig",
    "compliance.programme.apps.ProgrammeConfig",
    "compliance.chat.apps.ChatConfig",
    "compliance.prompts.apps.PromptsConfig",
    "compliance.ops.apps.OpsConfig",
    "compliance.assistant.apps.AssistantConfig",
]








############################################################
# Middleware
############################################################
#
# The request guard (NUL characters, database-refused values
# → 400 JSON) and CommonMiddleware. No CSRF (bearer tokens,
# no cookie auth — nothing for a cross-site form to ride;
# Caddy also refuses foreign Origins), no sessions, no auth
# middleware — the decorators in compliance/users/auth.py
# resolve the bearer per route.
############################################################

MIDDLEWARE = [
    "compliance.common.middleware.RequestGuardMiddleware",
    "django.middleware.common.CommonMiddleware",
]








############################################################
# Templates
############################################################
#
# Only Django's debug error pages use these — the API itself
# is JSON-only and the report export builds its HTML in code
# (analysis/exports.py render_html).
############################################################

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    }
]








############################################################
# Logging
############################################################
#
# Everything to the console — that is what
# `docker logs legalops-django` shows.
############################################################

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(levelname)s %(asctime)s %(module)s "
            "%(process)d %(thread)d %(message)s"
        }
    },
    "handlers": {
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        }
    },
    "root": {"level": "INFO", "handlers": ["console"]},
}
