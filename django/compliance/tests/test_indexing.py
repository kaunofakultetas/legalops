############################################################
#  [*] Tests — document indexing and the uploader's budget
#
#  The `documents.index` job embeds a document's windows
#  while the uploader's daily AI budget lasts; once it is
#  spent the job queues itself again for just after the
#  reset instead of embedding (an upload-and-delete loop
#  must not embed without end); an unlimited budget never
#  waits.
############################################################


import uuid
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from unittest import mock


from django.test import TestCase


from compliance.assistant import gateway
from compliance.assistant.models import LlmCall
from compliance.common.timestamps import utc_now
from compliance.companies.models import CompanyDocument, CompanyDocumentChunk
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.jobs.runner import run_once
from compliance.tests.fakes import fake_embed
from compliance.tests.utils import create_admin, create_user


TEXT = "Pinigų plovimo prevencijos politika. Atsakingas darbuotojas tikrina klientus.\n\n" * 40








############################################################
# queue_document
############################################################
#
# One extracted document of `user` and its indexing job, as
# the upload leaves them.
#
# Used by:
#   - IndexBudgetTests (below)
############################################################

def queue_document(user):
    document = CompanyDocument.objects.create(
        id=str(uuid.uuid4()), owner=user, title="Politika", file_path="/nonexistent/politika.txt", sha256="0" * 64,
        text=TEXT, char_count=len(TEXT), extraction_status="done", uploaded_at=utc_now())
    job = enqueue("documents.index", {"document_id": document.id}, subject=f"document:{document.id}", created_by=user)
    return document, job








class IndexBudgetTests(TestCase):

    def spend(self, user, usd):
        LlmCall.objects.create(id=str(uuid.uuid4()), kind="chat", user=user, model="m", cost_usd=Decimal(usd),
                               created_at=utc_now())

    def run_index(self):
        with mock.patch.object(gateway, "embed", side_effect=fake_embed) as embed:
            self.assertTrue(run_once(heartbeat=False))
        return embed

    def test_a_budget_that_lasts_embeds_the_document(self):
        user = create_user()
        user.daily_budget_usd = Decimal("1.00")
        user.save(update_fields=["daily_budget_usd"])
        document, job = queue_document(user)
        embed = self.run_index()
        self.assertTrue(embed.called)
        document.refresh_from_db()
        self.assertIsNotNone(document.indexed_at)
        self.assertGreater(CompanyDocumentChunk.objects.filter(document=document).count(), 0)
        self.assertEqual(Job.objects.get(id=job.id).result["chunks"],
                         CompanyDocumentChunk.objects.filter(document=document).count())

    def test_a_spent_budget_waits_for_the_reset_instead_of_embedding(self):
        user = create_user()
        user.daily_budget_usd = Decimal("0.01")
        user.save(update_fields=["daily_budget_usd"])
        self.spend(user, "0.02")
        document, job = queue_document(user)
        embed = self.run_index()
        self.assertFalse(embed.called, "no embedding past the budget")
        document.refresh_from_db()
        self.assertIsNone(document.indexed_at)
        self.assertFalse(CompanyDocumentChunk.objects.filter(document=document).exists())

        done = Job.objects.get(id=job.id)
        resumes = datetime.combine(utc_now().date() + timedelta(days=1), time.min, tzinfo=timezone.utc) \
            + timedelta(minutes=5)
        self.assertEqual((done.status, done.result), ("done", {"waitingForBudget": True,
                                                               "resumesAt": resumes.isoformat()}))
        again = Job.objects.exclude(id=job.id).get(kind="documents.index")
        self.assertEqual((again.status, again.subject, again.payload, again.created_by_id, again.run_after),
                         ("queued", job.subject, job.payload, user.id, resumes))
        self.assertFalse(run_once(heartbeat=False), "nothing runs before the reset")

    def test_an_unlimited_budget_never_waits(self):
        admin = create_admin()
        self.spend(admin, "50.00")
        document, _ = queue_document(admin)
        self.assertTrue(self.run_index().called)
        document.refresh_from_db()
        self.assertIsNotNone(document.indexed_at)
