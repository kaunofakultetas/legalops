############################################################
#  [*] run_worker — the background worker loop
#
#  Polls the queue every --poll seconds when idle, runs one
#  job at a time and enqueues the periodic kinds; with --once
#  it runs at most one job and exits.
#
#  legalops-worker is only a Docker CLI: it starts this loop
#  inside legalops-django with docker exec. docker exec does
#  not stop the loop when that container restarts, so a new
#  loop takes over from the one still running: PID_FILE names
#  it, and it is asked to stop before the new one starts. A
#  --once run never takes over.
#
#  SIGTERM stops claiming and asks the running handler to stop
#  at its next check: its job goes back to the queue without
#  spending an attempt, and the next loop runs it. A loop
#  killed outright (legalops-django restarting) leaves its
#  job to recover_stale, which re-queues it after STALE_S.
#
#  Every loop touches HEARTBEAT_FILE, and a long job keeps it
#  fresh from the runner's heartbeat thread, so a healthcheck
#  can tell a stuck loop from a live one; none reads it at the
#  moment.
#
#  Used by:
#    - docker-compose.yml — the legalops-worker command
############################################################


import logging
import os
import signal
import time


from django.core.management.base import BaseCommand
from django.db import connection


from compliance.jobs.runner import STOPPING, WORKER_ID, run_once
from compliance.jobs.schedule import tick

# Seconds between schedule checks
SCHEDULE_EVERY_S = 60

# Touched every loop and every job heartbeat (see the header)
HEARTBEAT_FILE = os.environ.get("WORKER_HEARTBEAT_FILE", "/tmp/worker-heartbeat")

# The process id of the running loop, so the next one can take
# over from it; /tmp lives as long as the container
PID_FILE = os.environ.get("WORKER_PID_FILE", "/tmp/worker.pid")


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run background jobs from the queue"

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="run at most one job and exit")
        parser.add_argument("--poll", type=float, default=2.0, help="idle poll interval in seconds")

    def handle(self, *args, **options):
        # A signal only raises the flag — the running handler sees
        # it at its next check_cancelled and hands the job back
        def _stop(signum, frame):
            logger.info("Worker %s stopping — the running job goes back to the queue", WORKER_ID)
            STOPPING.set()

        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
        if not options["once"]:
            take_over()
        logger.info("Worker %s started", WORKER_ID)
        next_tick = 0.0

        try:
            while not STOPPING.is_set():
                touch_heartbeat()
                # The periodic kinds (maintenance, corpus refresh) are
                # enqueued here — a failure must never stop the loop
                if time.monotonic() >= next_tick:
                    next_tick = time.monotonic() + SCHEDULE_EVERY_S
                    try:
                        tick()
                    except Exception:
                        logger.exception("Schedule tick failed")
                job = run_once()
                # Fresh connection per iteration — a long idle poll
                # must not hold a stale server-side connection
                connection.close()
                if options["once"]:
                    break
                if job is None:
                    STOPPING.wait(options["poll"])
        finally:
            if not options["once"]:
                release_pid_file()








############################################################
# take_over
############################################################
#
# Asks the loop PID_FILE names to stop (SIGTERM, so its job
# goes back to the queue), then names this process instead.
# The old loop is not waited for: it stops claiming at once
# and finishes only the step in flight. A pid whose process
# is no worker loop — the file outlived its loop and the pid
# was reused — is left alone.
#
# Used by:
#   - Command.handle (above)
############################################################

def take_over():
    try:
        with open(PID_FILE) as handle:
            previous = int(handle.read().strip() or 0)
    except (OSError, ValueError):
        previous = 0
    if previous and previous != os.getpid() and is_worker_loop(previous):
        logger.info("Worker %s taking over from pid %s", WORKER_ID, previous)
        try:
            os.kill(previous, signal.SIGTERM)
        except OSError:
            pass
    try:
        with open(PID_FILE, "w") as handle:
            handle.write(str(os.getpid()))
    except OSError:
        logger.warning("Cannot write %s — the next worker loop will not stop this one", PID_FILE)








############################################################
# is_worker_loop
############################################################
#
# Whether the process is a run_worker loop, read from its
# command line in /proc; a process that is gone, or that is
# anything else, is not.
#
# Used by:
#   - take_over (above)
############################################################

def is_worker_loop(pid):
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as handle:
            return b"run_worker" in handle.read().split(b"\0")
    except OSError:
        return False








############################################################
# release_pid_file
############################################################
#
# Removes PID_FILE when the loop stops, but only while it
# still names this process — a newer loop may own it already.
#
# Used by:
#   - Command.handle (above)
############################################################

def release_pid_file():
    try:
        with open(PID_FILE) as handle:
            if handle.read().strip() != str(os.getpid()):
                return
        os.remove(PID_FILE)
    except OSError:
        pass








############################################################
# touch_heartbeat
############################################################
#
# Stamps HEARTBEAT_FILE; a read-only filesystem without /tmp
# only loses the stamp, never the loop.
#
# Used by:
#   - Command.handle (above)
#   - jobs/runner.py — _heartbeat_loop, during long jobs
############################################################

def touch_heartbeat():
    try:
        with open(HEARTBEAT_FILE, "a"):
            pass
        os.utime(HEARTBEAT_FILE, None)
    except OSError:
        pass
