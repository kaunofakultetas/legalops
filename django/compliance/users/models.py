############################################################
#  [*] users — accounts and bearer sessions
#
#  Shape rules every app's models follow:
#
#    - TEXT primary keys (uuid4 strings minted in Python)
#    - timestamps are DateTimeField holding aware UTC
#    - enum CHECK constraints live in Meta.constraints so
#      the database itself enforces them
#
#  Models:
#    - User     — the account row every table points at
#    - Session  — bearer sessions (sha256 of the token)
#
#  Changes to these models require running:
#    python3 manage.py makemigrations
#    python3 manage.py migrate
############################################################


from django.db import models
from django.db.models.functions import Lower


ROLES = ("admin", "user")








# -----------------------------------------------------------
# User
# -----------------------------------------------------------
#
# One row per account. `active` is the kill switch every
# authenticated request re-checks. Accounts are never
# hard-deleted — deactivation keeps audit rows and company
# ownership intact. Email uniqueness is case-INSENSITIVE by
# the functional index below.
#
# Table: users
# -----------------------------------------------------------

class User(models.Model):
    id = models.TextField(primary_key=True)
    email = models.TextField(unique=True)
    display_name = models.TextField()
    password_hash = models.TextField()
    role = models.TextField(default="user")
    active = models.BooleanField(default=True)
    # USD this account may spend on model calls per UTC day;
    # NULL = the installation default (LLM_DAILY_BUDGET_USD),
    # 0 = unlimited
    daily_budget_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "users"
        constraints = [
            models.CheckConstraint(condition=models.Q(role__in=ROLES), name="users_role_check"),
            models.UniqueConstraint(Lower("email"), name="users_email_lower_unique"),
        ]








# -----------------------------------------------------------
# Session
# -----------------------------------------------------------
#
# One row per issued bearer token: the sha256 of the raw
# token the client holds (secrets.token_urlsafe(32), users/
# auth.py), its expiry, and where it came from. Expired rows
# are purged lazily on lookup.
#
# Table: sessions
# -----------------------------------------------------------

class Session(models.Model):
    id = models.TextField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    token_hash = models.TextField(unique=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField()
    user_agent = models.TextField(null=True, blank=True)
    ip = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "sessions"
        indexes = [models.Index(fields=["user", "expires_at"], name="sessions_user_expires_idx")]
