############################################################
#  [*] Tests — the readiness probe
#
#  Pins the two published keys of /api/health and that the
#  route is reachable without credentials — and the setting
#  that keeps the database reachable at all: how long a
#  connection is kept. The development server starts a thread
#  for every request, so a kept connection is orphaned with
#  its thread; on 17 November 2026 a hundred of them took
#  every connection Postgres has and each request failed.
############################################################


import os
import subprocess
import sys

from django.test import SimpleTestCase, TestCase


class HealthTests(TestCase):

    def test_health_answers_ok_without_credentials(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["service"], "legalops-django")






class ConnectionKeepingTests(SimpleTestCase):

    # The seconds a connection is kept, as a fresh process
    # reads them with `given` in its environment — settings.py
    # is read once per process, so each case needs its own
    def kept(self, **given):
        environment = {key: value for key, value in os.environ.items()
                       if key not in ("DJANGO_RUNSERVER", "DB_CONN_MAX_AGE")}
        code = "from compliance import settings; print(settings.DATABASES['default']['CONN_MAX_AGE'])"
        done = subprocess.run([sys.executable, "-c", code], env={**environment, **given},
                              capture_output=True, text=True, check=True)
        return int(done.stdout.strip())

    def test_the_development_server_keeps_no_connection_and_gunicorn_keeps_it_a_minute(self):
        self.assertEqual(self.kept(DJANGO_RUNSERVER="True"), 0)
        self.assertEqual(self.kept(), 60)
        self.assertEqual(self.kept(DJANGO_RUNSERVER="True", DB_CONN_MAX_AGE="30"), 30, "a value set by hand wins")
