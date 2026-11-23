############################################################
#  [*] gunicorn.conf.py — how the production API is served
#
#  Read by the image's CMD (gunicorn --config
#  gunicorn.conf.py); the dev runserver ignores it. The
#  process sizing can be overridden from compose / .env:
#
#    GUNICORN_WORKERS  — worker processes      (default 3)
#    GUNICORN_THREADS  — threads per worker    (default 8)
#
#  See docs/markdown/en/operations.md "Scaling" before raising them —
#  every thread may hold one Postgres connection.
############################################################


import os








############################################################
# Listening and process model
############################################################
#
# gthread: WORKERS processes × THREADS threads = 24
# requests in flight by default.
#
#   - processes give CPU parallelism past the GIL — a
#     WeasyPrint PDF export or openpyxl workbook renders on
#     one core for seconds to minutes, and must not stall
#     the whole API while it does;
#   - threads carry the I/O-bound majority: JSON reads,
#     uploads waiting on the sandboxed extraction child,
#     prompt test runs waiting up to 15 minutes on the
#     assistant's /internal/llm/generate.
#
# Memory: ~150 MB per worker at rest, plus up to 1.5 GB for
# each running extraction child and a few hundred MB per
# PDF render — compose gives the container 3 GB. Postgres:
# every thread keeps one connection for DB_CONN_MAX_AGE
# seconds, so 24 here + the worker's handful stay well under
# max_connections=100.
############################################################

bind = "0.0.0.0:8000"
worker_class = "gthread"
workers = int(os.environ.get("GUNICORN_WORKERS", "3"))
threads = int(os.environ.get("GUNICORN_THREADS", "8"))

# Recycle a worker after this many requests (jittered so
# they do not restart together) — contains slow memory
# growth in the PDF and XML libraries
max_requests = 2000
max_requests_jitter = 200








############################################################
# Timeouts
############################################################
#
# timeout 330 s: with gthread it only fires when a worker's
# main loop stops heartbeating, never because one request is
# slow — a report export takes minutes, and a prompt test
# run waits on its upstream for up to 930 s
# (GENERATE_TIMEOUT_S in assistant/gateway.py, half a minute
# past the assistant's own GENERATE_TIMEOUT_MS).
#
# graceful_timeout 25 s: on SIGTERM in-flight requests get
# this long to finish — but compose sets no
# stop_grace_period, so Docker kills the container after 10 s.
#
# keepalive 65 s: meant to outlast the endpoint's idle
# upstream connections, so gunicorn never closes one Caddy
# is about to reuse (that race is a 502). endpoint/Caddyfile
# no longer sets their timeout, and Caddy's default (2 min)
# outlasts this one, so the race is open again.
############################################################

timeout = 330
graceful_timeout = 25
keepalive = 65








############################################################
# Logging
############################################################
#
# Both logs to stdout/stderr — `docker logs
# legalops-django`. The access line starts with the real
# client address: the endpoint SETS X-Real-IP (overwriting
# anything the client sent) from the trusted outer proxy's
# X-Forwarded-For; %(h)s would only ever show Caddy.
############################################################

accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%({x-real-ip}i)s %(t)s "%(r)s" %(s)s %(b)s %(M)sms'








############################################################
# Read-only container
############################################################
#
# The root filesystem is read-only: the heartbeat files go
# to the /tmp tmpfs, and the control socket (which would
# live under $HOME) is off.
############################################################

worker_tmp_dir = "/tmp"
control_socket_disable = True
