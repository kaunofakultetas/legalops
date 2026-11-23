############################################################
#  [*] Tests — login, sessions, roles
############################################################


from django.test import TestCase, override_settings


from compliance.common.ratelimit import reset_rate_limits
from compliance.users.models import Session
from compliance.tests.utils import PASSWORD, ApiClient, create_admin, create_user, post_json, signed_in


class LoginTests(TestCase):

    def setUp(self):
        reset_rate_limits()
        self.user = create_user()

    def test_login_mints_a_session_and_returns_the_profile(self):
        r = post_json(ApiClient(), "/api/auth/login", {"email": "TOMAS@knf.vu.lt", "password": PASSWORD})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["user"]["email"], "tomas@knf.vu.lt")
        self.assertNotIn("passwordHash", body["user"])
        self.assertEqual(Session.objects.filter(user=self.user).count(), 1)
        # The stored value is the sha256, never the raw token
        self.assertNotEqual(Session.objects.get(user=self.user).token_hash, body["token"])

        me = ApiClient(token=body["token"]).get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["id"], self.user.id)

    def test_wrong_password_unknown_email_and_inactive_all_answer_401(self):
        for email, password in [("tomas@knf.vu.lt", "wrong"), ("nobody@knf.vu.lt", PASSWORD)]:
            r = post_json(ApiClient(), "/api/auth/login", {"email": email, "password": password})
            self.assertEqual(r.status_code, 401, email)
            self.assertEqual(r.json()["code"], "INVALID_CREDENTIALS")
        self.user.active = False
        self.user.save()
        r = post_json(ApiClient(), "/api/auth/login", {"email": "tomas@knf.vu.lt", "password": PASSWORD})
        self.assertEqual(r.status_code, 401)

    def test_login_is_rate_limited_per_account(self):
        for _ in range(10):
            post_json(ApiClient(), "/api/auth/login", {"email": "x@y.lt", "password": "nope"})
        r = post_json(ApiClient(), "/api/auth/login", {"email": "x@y.lt", "password": "nope"})
        self.assertEqual(r.status_code, 429)
        self.assertTrue(r["Retry-After"])
        # Another account from the same address is not blocked by it
        r = post_json(ApiClient(), "/api/auth/login", {"email": "z@y.lt", "password": "nope"})
        self.assertEqual(r.status_code, 401)

    @override_settings(LOGIN_RATE_PER_IP=3)
    def test_login_is_rate_limited_per_ip(self):
        for n in range(3):
            post_json(ApiClient(), "/api/auth/login", {"email": f"u{n}@y.lt", "password": "nope"})
        r = post_json(ApiClient(), "/api/auth/login", {"email": "u9@y.lt", "password": "nope"})
        self.assertEqual(r.status_code, 429)

    def test_missing_or_bad_body_is_400(self):
        r = ApiClient().post("/api/auth/login", data="not json", content_type="application/json")
        self.assertEqual(r.status_code, 400)
        r = post_json(ApiClient(), "/api/auth/login", {"email": "a@b.lt"})
        self.assertEqual(r.status_code, 400)


class SessionTests(TestCase):

    def setUp(self):
        reset_rate_limits()
        self.user = create_user()

    def test_no_token_bad_token_and_deactivated_account_are_401(self):
        self.assertEqual(ApiClient().get("/api/auth/me").status_code, 401)
        self.assertEqual(ApiClient(token="garbage").get("/api/auth/me").status_code, 401)
        client = signed_in(self.user)
        self.user.active = False
        self.user.save()
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_logout_kills_only_the_presented_session(self):
        a, b = signed_in(self.user), signed_in(self.user)
        self.assertEqual(a.post("/api/auth/logout").status_code, 200)
        self.assertEqual(a.get("/api/auth/me").status_code, 401)
        self.assertEqual(b.get("/api/auth/me").status_code, 200)

    def test_logout_all_kills_every_session(self):
        a, b = signed_in(self.user), signed_in(self.user)
        self.assertEqual(a.post("/api/auth/logout-all").status_code, 200)
        self.assertEqual(b.get("/api/auth/me").status_code, 401)

    def test_change_password_rotates_and_kills_other_sessions(self):
        a, b = signed_in(self.user), signed_in(self.user)
        r = post_json(a, "/api/auth/change-password", {"currentPassword": "wrong", "newPassword": "nauja-slapta-2026"})
        self.assertEqual(r.status_code, 400)
        r = post_json(a, "/api/auth/change-password", {"currentPassword": PASSWORD, "newPassword": "short"})
        self.assertEqual(r.json()["code"], "WEAK_PASSWORD")
        r = post_json(a, "/api/auth/change-password", {"currentPassword": PASSWORD, "newPassword": "nauja-slapta-2026"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(a.get("/api/auth/me").status_code, 200)
        self.assertEqual(b.get("/api/auth/me").status_code, 401)
        r = post_json(ApiClient(), "/api/auth/login", {"email": "tomas@knf.vu.lt", "password": "nauja-slapta-2026"})
        self.assertEqual(r.status_code, 200)

    def test_at_most_ten_sessions_are_kept_per_user(self):
        for _ in range(12):
            signed_in(self.user)
        self.assertEqual(Session.objects.filter(user=self.user).count(), 10)


class RoleTests(TestCase):

    def test_user_role_is_refused_on_admin_routes(self):
        user, admin = create_user(), create_admin()
        r = signed_in(user).get("/api/users")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["code"], "FORBIDDEN")
        self.assertEqual(signed_in(admin).get("/api/users").status_code, 200)


class GateTests(TestCase):

    GATE = "/api/auth/checkauth/admin"

    def setUp(self):
        reset_rate_limits()
        self.admin = create_admin()
        self.user = create_user()

    # A browser that signed in: no bearer, its cookie jar holds
    # the gate cookie
    def browser(self, user):
        client = ApiClient()
        r = post_json(client, "/api/auth/login", {"email": user.email, "password": PASSWORD})
        self.assertEqual(r.status_code, 200)
        return client, r

    def test_login_sets_the_gate_cookie_with_the_session_token(self):
        _, r = self.browser(self.admin)
        cookie = r.cookies["compliance_gate"]
        self.assertEqual(cookie.value, r.json()["token"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(cookie["path"], "/")
        self.assertEqual(int(cookie["max-age"]), 30 * 24 * 3600)
        self.assertTrue(cookie["secure"], "Secure outside DEBUG")

    def test_the_gate_opens_for_an_admin_by_cookie_or_by_bearer(self):
        client, _ = self.browser(self.admin)
        r = client.get(self.GATE)
        self.assertEqual((r.status_code, r.json()["role"], r.json()["email"]), (200, "admin", self.admin.email))
        self.assertEqual(signed_in(self.admin).get(self.GATE).status_code, 200, "a bearer counts too")

    def test_the_gate_refuses_a_user_a_stranger_and_a_made_up_cookie(self):
        client, _ = self.browser(self.user)
        r = client.get(self.GATE)
        self.assertEqual((r.status_code, r.json()["code"]), (403, "FORBIDDEN"))
        r = ApiClient().get(self.GATE)
        self.assertEqual((r.status_code, r.json()["code"]), (401, "AUTH_REQUIRED"))
        stranger = ApiClient()
        stranger.cookies["compliance_gate"] = "made-up"
        self.assertEqual(stranger.get(self.GATE).status_code, 401)
        self.assertEqual(post_json(ApiClient(), self.GATE, {}).status_code, 405)

    def test_a_deactivated_or_demoted_admin_is_shut_out_at_once(self):
        client, _ = self.browser(self.admin)
        self.admin.role = "user"
        self.admin.save(update_fields=["role"])
        self.assertEqual(client.get(self.GATE).status_code, 403)
        self.admin.role, self.admin.active = "admin", False
        self.admin.save(update_fields=["role", "active"])
        self.assertEqual(client.get(self.GATE).status_code, 401)

    def test_logout_and_logout_all_expire_the_cookie_and_its_session(self):
        for route in ("/api/auth/logout", "/api/auth/logout-all"):
            client, r = self.browser(self.admin)
            out = ApiClient(token=r.json()["token"]).post(route)
            self.assertEqual(out.status_code, 200, route)
            self.assertEqual((out.cookies["compliance_gate"].value, out.cookies["compliance_gate"]["max-age"]), ("", 0), route)
            self.assertEqual(client.get(self.GATE).status_code, 401, f"{route}: the session the cookie carried is gone")

    def test_the_api_never_takes_the_gate_cookie_for_a_session(self):
        client, _ = self.browser(self.admin)
        for path in ("/api/auth/me", "/api/users", "/api/chat/threads"):
            r = client.get(path)
            self.assertEqual((r.status_code, r.json()["code"]), (401, "AUTH_REQUIRED"), path)
        self.assertEqual(client.post("/api/auth/logout").status_code, 401, "nor a logout")
