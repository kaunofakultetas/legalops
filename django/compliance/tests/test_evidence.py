############################################################
#  [*] Tests — which company passages an obligation is judged on
#
#  evidence_for picks a company's passages by the better of an
#  obligation's two vectors — its Lithuanian one and its
#  English one — so English documents meet Lithuanian
#  obligations. On the 1009 LTD demo (2026-09-28) the
#  Lithuanian vector alone put every English passage above
#  the cut-off: the model judged from one-line summaries and
#  reported gaps the policies plainly close. embed_obligations
#  stores both vectors; embed_english fills the missing English
#  ones once, logged under the step that needed them. After a
#  change of embedding model, the full re-embed renews every
#  stored vector — the corpus, the obligations and the company
#  documents — since vectors of two models cannot be compared.
############################################################


import uuid
from types import SimpleNamespace
from unittest import mock


from django.test import TestCase


from compliance.analysis.pipeline import evidence_for
from compliance.assistant import gateway
from compliance.assistant.models import LlmCall
from compliance.corpus.models import LegalChunk
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.jobs.runner import run_once
from compliance.common.timestamps import utc_now
from compliance.companies.models import Company, CompanyDocument, CompanyDocumentChunk
from compliance.corpus.models import Obligation
from compliance.corpus.obligations import embed_english, embed_obligations
from compliance.tests.fakes import embed_text, fake_embed, fake_models
from compliance.tests.test_corpus import EU_EN, ingest_act
from compliance.tests.utils import create_admin, create_user, signed_in


COMPLAINTS = "Clients submit complaints free of charge through the complaints form; complaints are free of charge."
BACKUP = "Backup copies are encrypted, stored in a separate data centre and restored in quarterly tests."








############################################################
# obligation
############################################################
#
# One saved Obligation row with the given fields.
#
# Used by:
#   - EvidenceTests (below)
############################################################

def obligation(**fields):
    now = utc_now()
    fields = {"title": "Pareiga", "text": "Pareigos tekstas", **fields}
    return Obligation.objects.create(id=str(uuid.uuid4()), created_at=now, updated_at=now, **fields)








class EvidenceTests(TestCase):

    def setUp(self):
        user, now = create_user(), utc_now()
        self.company = Company.objects.create(id=str(uuid.uuid4()), owner=user, name="1009 LTD", created_at=now,
                                              updated_at=now)
        document = CompanyDocument.objects.create(
            id=str(uuid.uuid4()), owner=user, company=self.company, title="F05 Complaints", file_path="/nonexistent",
            sha256="0" * 64, text=COMPLAINTS + "\n" + BACKUP, extraction_status="done", uploaded_at=now)
        for ordinal, text in enumerate((COMPLAINTS, BACKUP)):
            CompanyDocumentChunk.objects.create(id=str(uuid.uuid4()), document=document, ordinal=ordinal, text=text,
                                                embedding=embed_text(text))
        self.pc = SimpleNamespace(company=self.company, documents=[document])
        self.refs = {document.id: "D1"}

    def test_english_documents_meet_a_lithuanian_obligation_through_its_english_vector(self):
        lt = ("Nemokamas skundų pateikimas", "Klientai skundus teikia nemokamai")
        en = ("Free submission of complaints", "Clients submit complaints free of charge")
        row = obligation(title=lt[0], text=lt[1], title_en=en[0], text_en=en[1], embedding=embed_text("\n".join(lt)))
        self.assertEqual(evidence_for(self.pc, row, self.refs), [],
                         "the Lithuanian vector alone meets no English passage")
        row.embedding_en = embed_text("\n".join(en))
        row.save(update_fields=["embedding_en"])
        found = [ref for ref, _ in evidence_for(self.pc, Obligation.objects.get(id=row.id), self.refs)]
        self.assertEqual(found, ["D1#0"], "the complaints passage, and not the unrelated backup one")

    def test_a_lithuanian_document_still_meets_it_through_its_lithuanian_vector(self):
        CompanyDocumentChunk.objects.filter(ordinal=0).update(embedding=embed_text("Klientai skundus teikia nemokamai"))
        row = obligation(title="Nemokamas skundų pateikimas", text="Klientai skundus teikia nemokamai",
                         title_en="Free submission of complaints", text_en="Clients submit complaints free of charge",
                         embedding=embed_text("Nemokamas skundų pateikimas\nKlientai skundus teikia nemokamai"),
                         embedding_en=embed_text("Free submission of complaints\nClients submit complaints free of charge"))
        self.assertEqual([ref for ref, _ in evidence_for(self.pc, row, self.refs)], ["D1#0"])

    def test_new_obligations_get_both_vectors_in_one_call(self):
        lithuanian = obligation(title="Registruoti", text="Registruoti skundus")
        both = obligation(title="Registruoti", text="Registruoti skundus", title_en="Register",
                          text_en="Register complaints")
        with mock.patch.object(gateway, "embed", side_effect=fake_embed) as embed:
            embed_obligations([lithuanian, both])
        self.assertEqual(embed.call_args.args[0], ["Registruoti\nRegistruoti skundus", "Registruoti\nRegistruoti skundus",
                                                   "Register\nRegister complaints"])
        lithuanian.refresh_from_db()
        both.refresh_from_db()
        self.assertIsNotNone(lithuanian.embedding)
        self.assertIsNone(lithuanian.embedding_en, "no English text, no English vector")
        expected = embed_text("Register\nRegister complaints")
        self.assertTrue(all(abs(a - b) < 1e-5 for a, b in zip(both.embedding_en, expected, strict=True)),
                        "the English vector is the English text's")

    def test_missing_english_vectors_are_filled_once_and_logged_under_the_step(self):
        missing = obligation(title_en="Keep records", text_en="Keep records for five years")
        no_english = obligation()
        filled = obligation(title_en="Report", text_en="Report incidents", embedding_en=embed_text("Report"))
        with mock.patch.object(gateway, "embed", side_effect=fake_embed) as embed:
            self.assertEqual(embed_english([missing, no_english, filled], job_step_id="step-1"), 1)
        self.assertEqual(embed.call_args.args[0], ["Keep records\nKeep records for five years"])
        self.assertIsNotNone(Obligation.objects.get(id=missing.id).embedding_en)
        self.assertIsNone(Obligation.objects.get(id=no_english.id).embedding_en)
        call = LlmCall.objects.get(purpose="obligations.embed_en")
        self.assertEqual((call.kind, call.job_step_id, call.user_id), ("embed", "step-1", None),
                         "shared corpus work: under the step, charged to nobody")

        with mock.patch.object(gateway, "embed", side_effect=fake_embed) as embed:
            self.assertEqual(embed_english([Obligation.objects.get(id=missing.id)]), 0)
        embed.assert_not_called()








class ReembedTests(TestCase):

    def test_a_full_reembed_renews_every_vector_and_one_act_only_its_own(self):
        admin = create_admin()
        with fake_models():
            act = ingest_act(signed_in(admin), EU_EN, title="Markets in crypto-assets", short_title="MiCA",
                             external_id="32023R1114")
        now = utc_now()
        company = Company.objects.create(id=str(uuid.uuid4()), owner=admin, name="1009 LTD", created_at=now, updated_at=now)
        document = CompanyDocument.objects.create(
            id=str(uuid.uuid4()), owner=admin, company=company, title="F05", file_path="/nonexistent", sha256="0" * 64,
            text=COMPLAINTS, extraction_status="done", uploaded_at=now)
        row = obligation(document=act, title="Skundai", text="Nagrinėti skundus", title_en="Complaints",
                         text_en="Handle complaints")
        LegalChunk.objects.update(embedding=None)

        # One act: its chunks only
        enqueue("corpus.reembed", {"document_id": act.id}, created_by=admin)
        with mock.patch.object(gateway, "embed", side_effect=fake_embed):
            while run_once(heartbeat=False):
                pass
        self.assertFalse(LegalChunk.objects.filter(embedding=None).exists())
        self.assertIsNone(Obligation.objects.get(id=row.id).embedding, "a single act leaves the rest alone")

        # Everything: the obligations (both languages) and the company documents too
        job = enqueue("corpus.reembed", {}, created_by=admin)
        with mock.patch.object(gateway, "embed", side_effect=fake_embed):
            while run_once(heartbeat=False):
                pass
        job.refresh_from_db()
        self.assertEqual(job.status, "done", job.error)
        row.refresh_from_db()
        self.assertIsNotNone(row.embedding)
        self.assertIsNotNone(row.embedding_en)
        self.assertTrue(CompanyDocumentChunk.objects.filter(document=document, embedding__isnull=False).exists())
        self.assertEqual({k: job.result[k] for k in ("obligations", "companyDocuments")}, {"obligations": 1,
                                                                                       "companyDocuments": 1})
        self.assertEqual(Job.objects.get(id=job.id).steps.filter(name="embed:company-documents").count(), 1)
