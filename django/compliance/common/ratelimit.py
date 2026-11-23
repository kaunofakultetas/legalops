############################################################
#  [*] Rate limiting — a fixed window per key, in Postgres
#
#    retry_after = check_rate_limit("login:1.2.3.4", 10, 60)
#
#  Returns 0 when the call is admitted (and counted), else
#  the seconds until the window resets. One atomic upsert on
#  rate_limit_windows (ops/models.py), so every gunicorn
#  worker and thread shares the same count and a restart
#  forgets nothing. The row lock the upsert takes also
#  serialises concurrent attempts on one key until the
#  request commits — a brute-forcer cannot fan out.
############################################################


from django.db import connection


UPSERT = """
    INSERT INTO rate_limit_windows (key, count, reset_at)
    VALUES (%s, 1, now() + make_interval(secs => %s))
    ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_windows.reset_at <= now() THEN 1
                     ELSE rate_limit_windows.count + 1 END,
        reset_at = CASE WHEN rate_limit_windows.reset_at <= now() THEN EXCLUDED.reset_at
                        ELSE rate_limit_windows.reset_at END
    RETURNING count, CEIL(EXTRACT(EPOCH FROM (reset_at - now())))::int
"""








############################################################
# check_rate_limit
############################################################
#
# Admits and counts, or answers the seconds to wait. A
# refused attempt still counts — hammering never shortens
# the wait. Keys longer than 300 characters are cut (an
# email is attacker-chosen).
#
# Used by:
#   - users/api/auth_views.py — login, per IP and per email
############################################################

def check_rate_limit(key, limit, window_s):
    with connection.cursor() as cursor:
        cursor.execute(UPSERT, [key[:300], window_s])
        count, seconds_left = cursor.fetchone()
    if count > limit:
        return max(1, seconds_left or 1)
    return 0








############################################################
# reset_rate_limits
############################################################
#
# Drops every window — the test suite calls it between
# cases so one test's burst never trips the next.
#
# Used by:
#   - tests/test_auth_flow.py
############################################################

def reset_rate_limits():
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM rate_limit_windows")
