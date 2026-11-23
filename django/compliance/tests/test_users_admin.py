############################################################
#  [*] Tests — the admin's account directory
############################################################


import io
import os
import uuid


from django.test import TestCase


from compliance.analysis.models import Report
from compliance.assistant.models import LlmCall
from compliance.audit.models import AuditLog
from compliance.chat.models import ChatThread
from compliance.common.timestamps import utc_now
from compliance.companies.models import Company, CompanyDocument
from compliance.users.models import User
from compliance.tests.utils import PASSWORD, ApiClient, create_admin, create_user, patch_json, post_json, signed_in


class UsersAdminTests(TestCase):

    def setUp(self):
        self.admin = create_admin()
        self.client_admin = signed_in(self.admin)

    def test_create_lists_and_audits(self):
        r = post_json(self.client_admin, "/api/users",
                      {"email": "Rasa@knf.vu.lt", "displayName": "Rasa", "role": "user", "password": "slaptas-zodis-1"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["email"], "rasa@knf.vu.lt")
        self.assertEqual(len(self.client_admin.get("/api/users").json()["users"]), 2)
        self.assertTrue(AuditLog.objects.filter(action="users.create", user=self.admin).exists())
        # The new account can sign in
        r = post_json(ApiClient(), "/api/auth/login", {"email": "rasa@knf.vu.lt", "password": "slaptas-zodis-1"})
        self.assertEqual(r.status_code, 200)

    def test_create_rejects_duplicates_bad_roles_and_weak_passwords(self):
        create_user(email="rasa@knf.vu.lt")
        base = {"displayName": "R", "role": "user", "password": "slaptas-zodis-1"}
        self.assertEqual(post_json(self.client_admin, "/api/users", {**base, "email": "RASA@knf.vu.lt"}).status_code, 409)
        self.assertEqual(post_json(self.client_admin, "/api/users", {**base, "email": "n@x.lt", "role": "root"}).json()["code"], "INVALID_ROLE")
        self.assertEqual(post_json(self.client_admin, "/api/users", {**base, "email": "n@x.lt", "password": "x"}).json()["code"], "WEAK_PASSWORD")

    def test_deactivation_kills_sessions_and_never_deletes(self):
        user = create_user()
        client_user = signed_in(user)
        r = self.client_admin.delete(f"/api/users/{user.id}")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["active"])
        self.assertTrue(User.objects.filter(id=user.id).exists())
        self.assertEqual(client_user.get("/api/auth/me").status_code, 401)

    def test_last_admin_and_self_are_protected(self):
        r = patch_json(self.client_admin, f"/api/users/{self.admin.id}", {"role": "user"})
        self.assertEqual(r.json()["code"], "SELF_LOCKOUT")
        r = self.client_admin.delete(f"/api/users/{self.admin.id}")
        self.assertEqual(r.json()["code"], "SELF_LOCKOUT")
        other_admin = create_admin(email="second@knf.vu.lt")
        # Two admins: the second may be demoted by the first
        r = patch_json(self.client_admin, f"/api/users/{other_admin.id}", {"role": "user"})
        self.assertEqual(r.status_code, 200)
        # Now the first is the last admin again and the second (a user) cannot touch anything
        r = patch_json(signed_in(other_admin), f"/api/users/{self.admin.id}", {"active": False})
        self.assertEqual(r.status_code, 403)
        # And a second admin cannot deactivate the first if it would leave none
        other_admin.role = "admin"
        other_admin.save()
        self.admin.role = "user"
        self.admin.save()
        r = patch_json(signed_in(other_admin), f"/api/users/{other_admin.id}", {"active": False})
        self.assertEqual(r.json()["code"], "SELF_LOCKOUT")

    def test_reset_password_kills_sessions(self):
        user = create_user()
        client_user = signed_in(user)
        r = post_json(self.client_admin, f"/api/users/{user.id}/reset-password", {"password": "visai-nauja-2026"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(client_user.get("/api/auth/me").status_code, 401)
        r = post_json(ApiClient(), "/api/auth/login", {"email": user.email, "password": PASSWORD})
        self.assertEqual(r.status_code, 401)
        r = post_json(ApiClient(), "/api/auth/login", {"email": user.email, "password": "visai-nauja-2026"})
        self.assertEqual(r.status_code, 200)

    def test_unknown_user_is_404(self):
        self.assertEqual(self.client_admin.get("/api/users/nope").status_code, 404)



class PurgeTests(TestCase):

    def setUp(self):
        self.admin = create_admin()
        self.client_admin = signed_in(self.admin)
        self.owner = create_user(email="owner@knf.vu.lt")
        self.client_owner = signed_in(self.owner)

    def upload(self, client, name, **fields):
        data = io.BytesIO("# Politika\n\nMFA privaloma.".encode())
        data.name = name
        response = client.post("/api/documents", {"file": data, **fields})
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_an_account_goes_with_what_it_owns_while_the_history_stays_unlinked(self):
        company = post_json(self.client_owner, "/api/companies", {"name": "Turi duomenų"}).json()
        linked = self.upload(self.client_owner, "politika.md", companyId=company["id"])
        loose = self.upload(self.client_owner, "laisvas.md")
        others = self.upload(self.client_admin, "admino.md", companyId=company["id"])
        files = list(CompanyDocument.objects.filter(owner=self.owner).values_list("file_path", flat=True))
        thread = post_json(self.client_owner, "/api/chat/threads", {"companyId": company["id"]}).json()
        report = Report.objects.create(id=str(uuid.uuid4()), company_id=company["id"], created_by=self.owner, status="done",
                                       language="lt", created_at=utc_now())
        call = LlmCall.objects.create(id=str(uuid.uuid4()), kind="chat", user=self.owner, model="gateway:azure/gpt-5.5",
                                      cost_usd="0.012", transcript={"user": "Mano klausimas", "assistant": "Atsakymas"},
                                      created_at=utc_now())

        owned = {"companies": 1, "reports": 1, "documents": 2, "threads": 1}
        self.assertTrue(all(os.path.exists(path) for path in files))

        # An active account goes at once, with its sessions
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client_admin.delete(f"/api/users/{self.owner.id}?purge=true")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {"ok": True, "removed": owned})
        self.assertFalse(User.objects.filter(id=self.owner.id).exists())
        self.assertEqual(self.client_owner.get("/api/auth/me").status_code, 401)
        self.assertFalse(Company.objects.filter(id=company["id"]).exists())
        self.assertFalse(Report.objects.filter(id=report.id).exists())
        self.assertFalse(CompanyDocument.objects.filter(id__in=[linked["id"], loose["id"]]).exists())
        self.assertFalse(any(os.path.exists(path) for path in files), "the files go once the delete is committed")
        self.assertFalse(ChatThread.objects.filter(id=thread["id"]).exists())
        self.assertIsNone(CompanyDocument.objects.get(id=others["id"]).company_id, "another owner's document stays, detached")

        # The usage log keeps the call and its cost, not the words
        call.refresh_from_db()
        self.assertEqual((call.user_id, call.transcript, call.model), (None, None, "gateway:azure/gpt-5.5"))
        row = AuditLog.objects.get(action="users.purge", target_id=self.owner.id)
        self.assertEqual(row.user_id, self.admin.id)
        self.assertEqual(row.details, {"email": "owner@knf.vu.lt", **owned})

    def test_never_oneself_nor_during_an_analysis_and_only_for_admins(self):
        refused = self.client_admin.delete(f"/api/users/{self.admin.id}?purge=true")
        self.assertEqual((refused.status_code, refused.json()["code"]), (400, "SELF_LOCKOUT"))
        company = post_json(self.client_owner, "/api/companies", {"name": "Analizuojama"}).json()
        Report.objects.create(id=str(uuid.uuid4()), company_id=company["id"], created_by=self.owner, status="running",
                              language="lt", created_at=utc_now())
        running = self.client_admin.delete(f"/api/users/{self.owner.id}?purge=true")
        self.assertEqual((running.status_code, running.json()["code"]), (409, "STILL_RUNNING"))
        self.assertTrue(User.objects.filter(id=self.owner.id).exists())
        self.assertTrue(Company.objects.filter(id=company["id"]).exists(), "nothing is half-deleted")
        self.assertEqual(self.client_owner.delete(f"/api/users/{self.admin.id}?purge=true").status_code, 403, "admins only")
        self.assertEqual(self.client_admin.delete(f"/api/users/{uuid.uuid4()}?purge=true").status_code, 404)
