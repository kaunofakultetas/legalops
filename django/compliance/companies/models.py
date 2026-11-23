############################################################
#  [*] companies — the company profile and what it holds
#
#  Models:
#    - Company              — the profile the analysis runs on
#    - CompanyCredential    — a certificate, licence, permit or
#                             registration the company holds
#                             (claimed until someone verifies it)
#    - CompanyStandard      — a standard of the corpus the
#                             company has adopted (certified,
#                             implementing or planned) — the
#                             reports assess it against that
#                             standard's requirements
#    - CompanyRole          — a role profile (e.g. the compliance
#                             officer) whose context a chat
#                             thread can adopt
#    - CompanyDocument      — an uploaded file with its extracted
#                             text, outline and evidence inventory
#    - CompanyDocumentChunk — a window of that text with its
#                             embedding (the evidence index)
#
#  Tenancy: a Company belongs to its owner; documents carry
#  their own owner because a file can be dropped into the chat
#  before any company exists and attached later.
#
#  Changes to these models require running:
#    python3 manage.py makemigrations
#    python3 manage.py migrate
############################################################


from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector
from django.db import models
from pgvector.django import HnswIndex, VectorField


from compliance.users.models import User


# The embedding width shared with the corpus (one model)
EMBED_DIMENSIONS = 1536


SIZE_CATEGORIES = ("micro", "small", "medium", "large", "unknown")
INSTITUTION_TYPES = (
    "bank", "credit_union", "payment_institution", "emi", "casp", "crowdfunding",
    "consumer_credit", "real_estate_credit", "currency_exchange", "investment_firm",
    "insurance", "other_financial", "none", "unknown",
)
CREDENTIAL_KINDS = ("certificate", "license", "permit", "registration")
# claimed = the user (or a document) says so; verified = a
# person checked it against the issuer's register or the act
CREDENTIAL_STATUSES = ("claimed", "verified")
# certified = a certificate covers it; implementing = the
# management system is being built; planned = the company
# means to adopt it (a report then shows the gap to close)
STANDARD_STATUSES = ("certified", "implementing", "planned")
DOCUMENT_KINDS = ("policy", "procedure", "contract", "register", "other")
EXTRACTION_STATUSES = ("pending", "done", "empty", "failed")








# -----------------------------------------------------------
# Company
# -----------------------------------------------------------
#
# One row per company profile. The typed columns are what the
# applicability screen filters on; `attributes` is the open
# JSON bag the conversation grows (anything the assistant
# learns that has no column yet); `financial_market` is the
# classification (market, service categories, authorisation).
# The four flags are tri-state: NULL means nobody said — the
# screen then keeps the acts they would gate, rather than
# reading silence as "no".
#
# Table: companies
# -----------------------------------------------------------

class Company(models.Model):
    id = models.TextField(primary_key=True)
    owner = models.ForeignKey(User, on_delete=models.PROTECT, related_name="companies")
    name = models.TextField()
    registration_code = models.TextField(null=True, blank=True)
    country = models.TextField(default="LT")
    legal_form = models.TextField(null=True, blank=True)
    nace_codes = models.JSONField(default=list, blank=True)
    sector = models.TextField(null=True, blank=True)
    size_category = models.TextField(default="unknown")
    employees = models.IntegerField(null=True, blank=True)
    annual_turnover_eur = models.BigIntegerField(null=True, blank=True)
    activities = models.TextField(blank=True, default="")
    uses_ai = models.BooleanField(null=True, blank=True)
    provides_ai = models.BooleanField(null=True, blank=True)
    ai_description = models.TextField(blank=True, default="")
    processes_personal_data = models.BooleanField(null=True, blank=True)
    is_public_sector = models.BooleanField(null=True, blank=True)
    institution_type = models.TextField(default="unknown")
    financial_market = models.JSONField(null=True, blank=True)
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "companies"
        constraints = [
            models.CheckConstraint(condition=models.Q(size_category__in=SIZE_CATEGORIES), name="companies_size_check"),
            models.CheckConstraint(condition=models.Q(institution_type__in=INSTITUTION_TYPES), name="companies_institution_check"),
        ]
        indexes = [models.Index(fields=["owner", "-updated_at"], name="companies_owner_updated_idx")]








# -----------------------------------------------------------
# CompanyCredential
# -----------------------------------------------------------
#
# What the company already holds — the gap analysis compares
# obligations against these rows first. A claimed credential
# counts as evidence only with that caveat; `verified_*`
# records who checked it (against the issuer's register or an
# evidence document).
#
# Table: company_credentials
# -----------------------------------------------------------

class CompanyCredential(models.Model):
    id = models.TextField(primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="credentials")
    kind = models.TextField()
    name = models.TextField()
    issuer = models.TextField(null=True, blank=True)
    identifier = models.TextField(null=True, blank=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)
    scope = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    status = models.TextField(default="claimed")
    evidence_document = models.ForeignKey("CompanyDocument", null=True, blank=True, on_delete=models.SET_NULL,
                                          related_name="evidenced_credentials")
    verified_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "company_credentials"
        constraints = [
            models.CheckConstraint(condition=models.Q(kind__in=CREDENTIAL_KINDS), name="company_credentials_kind_check"),
            models.CheckConstraint(condition=models.Q(status__in=CREDENTIAL_STATUSES),
                                   name="company_credentials_status_check"),
        ]








# -----------------------------------------------------------
# CompanyStandard
# -----------------------------------------------------------
#
# A standard the company has adopted: a corpus document of
# doc_type "standard", how far the company is with it, the
# scope it covers ("ISVS taikoma IT paslaugoms") and the
# certificate that proves it, when there is one (a credential
# of the same company). One row per company and standard.
# Every report of the company assesses its adopted standards
# alongside the acts that apply (analysis/pipeline.py
# step_applicability).
#
# Table: company_standards
# -----------------------------------------------------------

class CompanyStandard(models.Model):
    id = models.TextField(primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="standards")
    document = models.ForeignKey("corpus.LegalDocument", on_delete=models.CASCADE, related_name="adoptions")
    status = models.TextField(default="implementing")
    scope = models.TextField(blank=True, default="")
    certificate = models.ForeignKey(CompanyCredential, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="standards")
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "company_standards"
        constraints = [
            models.UniqueConstraint(fields=["company", "document"], name="company_standards_unique_document"),
            models.CheckConstraint(condition=models.Q(status__in=STANDARD_STATUSES),
                                   name="company_standards_status_check"),
        ]








# -----------------------------------------------------------
# CompanyRole
# -----------------------------------------------------------
#
# A role profile inside the company — duties, reporting line,
# independence, conflicts — distilled into `context`, the
# ROLE_CONTEXT block a chat thread can adopt (the course's
# warm-up task 2). `sources` lists the document sections it
# was built from ([{documentId, title, section}]).
#
# Table: company_roles
# -----------------------------------------------------------

class CompanyRole(models.Model):
    id = models.TextField(primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="roles")
    name = models.TextField()
    context = models.TextField(blank=True, default="")
    sources = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "company_roles"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="company_roles_unique_name"),
        ]








# -----------------------------------------------------------
# CompanyDocument
# -----------------------------------------------------------
#
# An uploaded file and its extracted text. The file lives at
# file_path under UPLOAD_DIR; the text is what the assistant
# reads (readDocument) and what later phases chunk and embed.
# company is NULL for a file dropped before a profile exists.
#
# Table: company_documents
# -----------------------------------------------------------

class CompanyDocument(models.Model):
    id = models.TextField(primary_key=True)
    owner = models.ForeignKey(User, on_delete=models.PROTECT, related_name="documents")
    company = models.ForeignKey(Company, null=True, blank=True, on_delete=models.SET_NULL, related_name="documents")
    title = models.TextField()
    kind = models.TextField(default="other")
    file_path = models.TextField()
    mime = models.TextField(null=True, blank=True)
    size = models.IntegerField(default=0)
    sha256 = models.TextField()
    text = models.TextField(blank=True, default="")
    char_count = models.IntegerField(default=0)
    extraction_status = models.TextField(default="pending")
    extraction_error = models.TextField(null=True, blank=True)
    # The evidence inventory (what controls, roles, registers
    # the document proves, which provisions it cites) and the
    # key it was computed for — "<text sha256>:<prompt version
    # id>:s<schema version>" (companies/inventory.py); a new
    # text, prompt version or inventory shape makes it stale
    inventory = models.JSONField(null=True, blank=True)
    inventory_key = models.TextField(blank=True, default="")
    # What the document's own requirements were last read for —
    # "<sha256 of the uploaded file>:<prompt version id>"
    # (analysis/internal.py);
    # empty = never read. A new text or prompt version reads it anew
    requirements_key = models.TextField(blank=True, default="")
    indexed_at = models.DateTimeField(null=True, blank=True)
    # [{title, level, offset}] — the headings found in the text,
    # so a reader can jump to "§7.2" instead of paging blind
    outline = models.JSONField(default=list, blank=True)
    uploaded_at = models.DateTimeField()

    class Meta:
        db_table = "company_documents"
        constraints = [
            models.CheckConstraint(condition=models.Q(kind__in=DOCUMENT_KINDS), name="company_documents_kind_check"),
            models.CheckConstraint(condition=models.Q(extraction_status__in=EXTRACTION_STATUSES), name="company_documents_extraction_check"),
        ]
        indexes = [models.Index(fields=["owner", "-uploaded_at"], name="company_documents_owner_idx")]









# -----------------------------------------------------------
# CompanyDocumentChunk
# -----------------------------------------------------------
#
# A window of a company document's text with its embedding —
# what the gap analysis retrieves as evidence for one
# obligation and what the assistant's document search reads.
#
# Table: company_document_chunks
# -----------------------------------------------------------

class CompanyDocumentChunk(models.Model):
    id = models.TextField(primary_key=True)
    document = models.ForeignKey(CompanyDocument, on_delete=models.CASCADE, related_name="chunks")
    ordinal = models.IntegerField()
    char_start = models.IntegerField(default=0)
    # The nearest heading above the window ("7.2 Atitikties
    # pareigūnas") — the section a citation of this chunk names
    heading = models.TextField(blank=True, default="")
    text = models.TextField()
    embedding = VectorField(dimensions=EMBED_DIMENSIONS, null=True, blank=True)

    class Meta:
        db_table = "company_document_chunks"
        indexes = [
            models.Index(fields=["document", "ordinal"], name="company_chunks_doc_ord_idx"),
            HnswIndex(name="company_chunks_embedding_hnsw", fields=["embedding"], m=16, ef_construction=64,
                      opclasses=["vector_cosine_ops"]),
            GinIndex(SearchVector("text", config="simple"), name="company_chunks_fts"),
        ]
