############################################################
#  [*] create_admin — the bootstrap account
#
#  The one sanctioned way into an empty installation: there
#  is no self-registration and every admin route requires an
#  existing admin. --email names the account and --name its
#  display name. Idempotent — an existing account is left
#  alone (a password changed in the GUI survives a second
#  run); --reset makes it an active admin again and, when
#  --password is given, sets that password and ends every
#  session of the account (the operator's lock-out recovery —
#  often after a lost or stolen login). A reset is audited
#  (users.reset_password / users.update, no actor).
#
#  --password-env reads the password from that environment
#  variable instead of the command line, where every process
#  listing would show it. The password has no minimum length
#  here, unlike one set in the console — the operator on the
#  server chooses it; only bcrypt's ceiling applies.
#
#  Used by:
#    - runCreateAdmin.sh — the first admin
#      (docs/markdown/en/deployment.md §3)
#    - the operator, by hand: the lock-out recovery
#      (docs/markdown/en/operations.md §4)
############################################################


import os
import uuid


from django.core.management.base import BaseCommand, CommandError


from compliance.audit.log import audit
from compliance.common.timestamps import utc_now
from compliance.users.auth import hash_password, validate_new_password
from compliance.users.models import Session, User


class Command(BaseCommand):
    help = "Create (or promote) the administrator account"

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=False)
        parser.add_argument("--password-env", required=False,
                            help="Read the password from this environment variable")
        parser.add_argument("--name", default="Administrator")
        parser.add_argument("--reset", action="store_true",
                            help="Re-activate an existing account as admin and set --password")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        password = options.get("password")
        if options.get("password_env"):
            password = os.environ.get(options["password_env"]) or None
        now = utc_now()
        user = User.objects.filter(email__iexact=email).first()


        # STEP 1: no such account — create it as an admin
        # ===============================================
        if user is None:
            if not password:
                raise CommandError("--password is required for a new account")
            error = validate_new_password(password, min_length=0)
            if error:
                raise CommandError(error)
            User.objects.create(
                id=str(uuid.uuid4()), email=email, display_name=options["name"],
                password_hash=hash_password(password), role="admin", active=True,
                created_at=now, updated_at=now,
            )
            self.stdout.write(f"Created admin {email}")
            return


        # STEP 2: existing account — untouched unless --reset
        # ===================================================
        if not options["reset"]:
            self.stdout.write(f"Account {email} already exists — nothing to do (--reset to recover it)")
            return
        fields = []
        if user.role != "admin" or not user.active:
            user.role, user.active = "admin", True
            fields += ["role", "active"]
        if password:
            error = validate_new_password(password, min_length=0)
            if error:
                raise CommandError(error)
            user.password_hash = hash_password(password)
            fields.append("password_hash")
        if fields:
            user.updated_at = now
            user.save(update_fields=[*fields, "updated_at"])
            # A new password ends every session, as the GUI's
            # password change ends the others
            ended = Session.objects.filter(user=user).delete()[0] if password else 0
            audit(None, "users.reset_password" if password else "users.update", "user", user.id,
                  {"via": "create_admin --reset", "fields": fields, "sessionsEnded": ended})
            self.stdout.write(f"Updated admin {email} ({', '.join(fields)}); sessions ended: {ended}")
        else:
            self.stdout.write(f"Admin {email} already exists — nothing to do")
