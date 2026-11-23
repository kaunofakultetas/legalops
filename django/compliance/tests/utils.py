############################################################
#  [*] Test helpers — accounts and signed-in clients
#
#  Passwords default to a known value so login flows can
#  exercise the real bcrypt path; one hash is computed once
#  per process to keep the suite fast.
############################################################


import uuid


import bcrypt
from django.test import Client


from compliance.common.timestamps import utc_now
from compliance.users.auth import mint_session
from compliance.users.models import User


PASSWORD = "labai-slapta-2026"

# One bcrypt hash for every test account — hashing once keeps
# the suite fast, and the password path stays real where it
# matters (login)
PASSWORD_HASH = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()








############################################################
# create_user
############################################################
#
# One account row with the shared hash; the display name
# defaults to the mailbox part, capitalised.
#
# Used by:
#   - every test module
############################################################

def create_user(email="tomas@knf.vu.lt", role="user", active=True, display_name=None):
    now = utc_now()
    return User.objects.create(
        id=str(uuid.uuid4()), email=email, display_name=display_name or email.split("@")[0].capitalize(),
        password_hash=PASSWORD_HASH, role=role, active=active, created_at=now, updated_at=now,
    )








############################################################
# create_admin
############################################################
#
# create_user with the admin role.
#
# Used by:
#   - every test module that exercises an admin route
############################################################

def create_admin(email="admin@knf.vu.lt"):
    return create_user(email=email, role="admin")








############################################################
# ApiClient
############################################################
#
# A Django test client that sends the bearer on every call
# when it holds a token; an explicit HTTP_AUTHORIZATION in a
# call still wins.
#
# Used by:
#   - signed_in (below)
#   - the login tests — a token-less instance
############################################################

class ApiClient(Client):

    def __init__(self, token=None, **kwargs):
        super().__init__(**kwargs)
        self.token = token

    def generic(self, method, path, data="", content_type="application/octet-stream", secure=False, **extra):
        if self.token and "HTTP_AUTHORIZATION" not in extra:
            extra["HTTP_AUTHORIZATION"] = f"Bearer {self.token}"
        return super().generic(method, path, data, content_type, secure, **extra)








############################################################
# signed_in
############################################################
#
# A client holding a freshly minted session of the user —
# the real session path, not a shortcut.
#
# Used by:
#   - every test module
############################################################

def signed_in(user):
    return ApiClient(token=mint_session(user))








############################################################
# post_json
############################################################
#
# A JSON-bodied POST without repeating content_type at every
# site.
#
# Used by:
#   - every test module
############################################################

def post_json(client, path, body, **extra):
    return client.post(path, data=body, content_type="application/json", **extra)








############################################################
# patch_json
############################################################
#
# The PATCH twin of post_json.
#
# Used by:
#   - tests/test_users_admin.py
############################################################

def patch_json(client, path, body, **extra):
    return client.patch(path, data=body, content_type="application/json", **extra)
