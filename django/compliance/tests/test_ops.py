############################################################
#  [*] Tests — operator commands and the daily maintenance
############################################################


import io
import os
import uuid
from datetime import timedelta


from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase


from compliance.assistant.models import LlmCall
from compliance.audit.models import AuditLog
from compliance.common.ratelimit import check_rate_limit
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.jobs.runner import run_once
from compliance.ops.models import RateLimitWindow
from compliance.tests.utils import ApiClient, create_admin, create_user, post_json, signed_in
from compliance.users.models import Session, User








class SeedCorpusTests(TestCase):

    def test_catalog_loads_and_reseeding_is_a_no_op(self):
        out = io.StringIO()
        call_command("seed_corpus", "--no-ingest", stdout=out)
        count = LegalDocument.objects.count()
        self.assertGreaterEqual(count, 50)
        mica = LegalDocument.objects.get(slug="mica")
        self.assertEqual((mica.source_kind, mica.external_id, mica.language), ("cellar", "32023R1114", "lt"))
        self.assertIn("casp", mica.applies_to)
        self.assertFalse(LegalDocument.objects.get(slug="crr").enabled, "CRR ships disabled")
        self.assertEqual(LegalDocument.objects.get(slug="pptfp-istatymas").source_kind, "etar")
        self.assertFalse(Job.objects.filter(kind="corpus.ingest").exists())
        call_command("seed_corpus", stdout=out)
        self.assertEqual(LegalDocument.objects.count(), count)
        self.assertIn("already present", out.getvalue())

    def test_only_queues_ingestion_for_the_named_acts(self):
        call_command("seed_corpus", "--only", "mica,dora", stdout=io.StringIO())
        self.assertEqual(set(LegalDocument.objects.values_list("slug", flat=True)), {"mica", "dora"})
        self.assertEqual(Job.objects.filter(kind="corpus.ingest").count(), 2)

    def test_the_catalogue_names_every_act_once_and_an_uploaded_one_waits_for_its_file(self):
        out = io.StringIO()
        call_command("seed_corpus", stdout=out)
        acts = list(LegalDocument.objects.all())
        for field in ("slug", "short_title"):
            values = [getattr(act, field) for act in acts]
            self.assertEqual(len(values), len(set(values)), f"{field} twice in the catalogue")
        fetched = [(act.source_kind, act.external_id) for act in acts if act.external_id]
        self.assertEqual(len(fetched), len(set(fetched)), "one source text under two acts")
        # The level 2 acts stand beside the acts they supplement; those for an applicant, and the two that are
        # templates field by field, ship disabled
        level2 = {act.slug: act for act in acts if act.slug.startswith(("mica-rts-", "mica-its-", "dora-rts-", "dora-its-"))}
        self.assertEqual(len(level2), 20)
        self.assertTrue(all(act.source_kind == "cellar" and act.jurisdiction == "EU" for act in level2.values()))
        self.assertEqual(sorted(slug for slug, act in level2.items() if not act.enabled),
                         ["dora-its-2024-2956", "dora-its-2025-302", "dora-rts-2025-1190", "mica-its-2025-304",
                          "mica-its-2025-306", "mica-rts-2025-303", "mica-rts-2025-305"])
        self.assertIn("casp", LegalDocument.objects.get(slug="lb-03-17-pptfp-nurodymai").applies_to)
        # Nothing is fetched for an act that is uploaded: no job, and the command says what it waits for
        uploaded = [act for act in acts if act.source_kind == "upload"]
        self.assertEqual(sorted(act.short_title for act in uploaded), ["EBA/GL/2021/02", "EBA/GL/2024/01"])
        self.assertTrue(all(act.source_url.startswith("https://www.eba.europa.eu/") for act in uploaded))
        queued = set(Job.objects.filter(kind="corpus.ingest").values_list("payload__document_id", flat=True))
        self.assertEqual(queued, {act.id for act in acts if act.enabled and act.source_kind != "upload"})
        self.assertIn("Waiting for an uploaded file (corpus page): eba-gl-2021-02-pp-tf-rizikos-veiksniai, "
                      "eba-gl-2024-01-rizikos-veiksniai-kriptoturtas", out.getvalue())


class CreateAdminTests(TestCase):

    def test_existing_account_is_left_alone_unless_reset(self):
        call_command("create_admin", "--email", "boss@knf.vu.lt", "--password", "pirmas-slaptas-1", stdout=io.StringIO())
        user = User.objects.get(email="boss@knf.vu.lt")
        first_hash = user.password_hash
        call_command("create_admin", "--email", "boss@knf.vu.lt", "--password", "antras-slaptas-2", stdout=io.StringIO())
        self.assertEqual(User.objects.get(id=user.id).password_hash, first_hash, "a redeploy never resets it")
        User.objects.filter(id=user.id).update(active=False, role="user")
        call_command("create_admin", "--email", "boss@knf.vu.lt", "--password", "antras-slaptas-2", "--reset",
                     stdout=io.StringIO())
        user.refresh_from_db()
        self.assertEqual((user.role, user.active), ("admin", True))
        self.assertNotEqual(user.password_hash, first_hash)

    def test_a_reset_password_ends_every_session_and_is_audited(self):
        admin, other = create_admin(), create_user()
        stolen, kept = signed_in(admin), signed_in(other)
        self.assertEqual(stolen.get("/api/auth/me").status_code, 200)
        call_command("create_admin", "--email", admin.email, "--password", "naujas-slaptas-3", "--reset",
                     stdout=io.StringIO())
        self.assertEqual(stolen.get("/api/auth/me").status_code, 401)
        self.assertEqual(kept.get("/api/auth/me").status_code, 200, "other accounts keep theirs")
        entry = AuditLog.objects.get(action="users.reset_password", target_id=admin.id)
        self.assertEqual((entry.user_id, entry.details["sessionsEnded"]), (None, 1))

    def test_the_operator_chooses_the_password_without_a_minimum_length(self):
        call_command("create_admin", "--email", "boss@knf.vu.lt", "--password", "abc", stdout=io.StringIO())
        login = {"email": "boss@knf.vu.lt", "password": "abc"}
        self.assertEqual(post_json(ApiClient(), "/api/auth/login", login).status_code, 200)
        call_command("create_admin", "--email", "boss@knf.vu.lt", "--password", "x", "--reset", stdout=io.StringIO())
        self.assertEqual(post_json(ApiClient(), "/api/auth/login", {**login, "password": "x"}).status_code, 200)

        # Still refused: no password at all, and one past bcrypt's ceiling
        with self.assertRaisesMessage(CommandError, "--password is required"):
            call_command("create_admin", "--email", "new@knf.vu.lt", "--password", "", stdout=io.StringIO())
        with self.assertRaisesMessage(CommandError, "at most 72 bytes"):
            call_command("create_admin", "--email", "new@knf.vu.lt", "--password", "x" * 73, stdout=io.StringIO())
        self.assertFalse(User.objects.filter(email="new@knf.vu.lt").exists())

    def test_a_reset_without_a_password_keeps_the_sessions(self):
        admin = create_admin()
        User.objects.filter(id=admin.id).update(role="user")
        client = signed_in(admin)
        call_command("create_admin", "--email", admin.email, "--reset", stdout=io.StringIO())
        self.assertEqual(client.get("/api/auth/me").status_code, 200)
        self.assertEqual(AuditLog.objects.get(action="users.update", target_id=admin.id).details["fields"],
                         ["role", "active"])


class CreateAdminFromEnvTests(TestCase):

    def test_password_can_come_from_the_environment(self):
        from unittest import mock
        with mock.patch.dict(os.environ, {"BOOT_PASSWORD": "is-aplinkos-kintamojo"}):
            call_command("create_admin", "--email", "env@knf.vu.lt", "--password-env", "BOOT_PASSWORD",
                         stdout=io.StringIO())
        from compliance.users.auth import check_password
        user = User.objects.get(email="env@knf.vu.lt")
        self.assertTrue(check_password("is-aplinkos-kintamojo", user.password_hash))


class MaintenanceTests(TestCase):

    def test_purges_what_expired_and_keeps_the_rest(self):
        now = utc_now()
        user = create_user()
        Session.objects.create(id=str(uuid.uuid4()), user=user, token_hash="old", expires_at=now - timedelta(days=1),
                               created_at=now - timedelta(days=31))
        Session.objects.create(id=str(uuid.uuid4()), user=user, token_hash="live", expires_at=now + timedelta(days=1),
                               created_at=now)
        LlmCall.objects.create(id=str(uuid.uuid4()), kind="chat", model="m", created_at=now - timedelta(days=500))
        LlmCall.objects.create(id=str(uuid.uuid4()), kind="chat", model="m", created_at=now)
        check_rate_limit("login:1.2.3.4", 10, 60)
        RateLimitWindow.objects.update(reset_at=now - timedelta(minutes=1))
        old_job = enqueue("ops.noop", {"steps": 0})
        Job.objects.filter(id=old_job.id).update(status="done", finished_at=now - timedelta(days=100))
        directory = os.path.join(settings.UPLOAD_DIR, "documents")
        os.makedirs(directory, exist_ok=True)
        orphan = os.path.join(directory, "orphan.pdf")
        with open(orphan, "wb") as handle:
            handle.write(b"x")
        os.utime(orphan, (now.timestamp() - 86400, now.timestamp() - 86400))

        enqueue("ops.maintenance", {})
        result = run_once(heartbeat=False).result
        self.assertEqual(Session.objects.filter(token_hash="live").count(), 1)
        self.assertFalse(Session.objects.filter(token_hash="old").exists())
        self.assertEqual(LlmCall.objects.count(), 1)
        self.assertFalse(RateLimitWindow.objects.exists())
        self.assertFalse(Job.objects.filter(id=old_job.id).exists())
        self.assertFalse(os.path.exists(orphan))
        self.assertEqual(result["orphanFiles"], 1)

    def test_unused_chat_uploads_go_after_a_week(self):
        from compliance.chat.models import ChatMessage, ChatThread
        from compliance.companies.models import CompanyDocument
        user, now = create_user(), utc_now()
        old = now - timedelta(days=10)

        def document(title):
            return CompanyDocument.objects.create(id=str(uuid.uuid4()), owner=user, title=title, file_path="/nope",
                                                  sha256="x", uploaded_at=old)

        unused, sent = document("never sent"), document("sent in chat")
        thread = ChatThread.objects.create(id=str(uuid.uuid4()), user=user, created_at=now, updated_at=now)
        ChatMessage.objects.create(id="m1", thread=thread, format="ai-sdk/v6", role="user", created_at=now,
                                   content={"role": "user", "parts": [{"type": "data-document",
                                                                        "data": {"id": sent.id}}]})
        enqueue("ops.maintenance", {})
        result = run_once(heartbeat=False).result
        self.assertEqual(result["unusedUploads"], 1)
        self.assertFalse(CompanyDocument.objects.filter(id=unused.id).exists())
        self.assertTrue(CompanyDocument.objects.filter(id=sent.id).exists())
