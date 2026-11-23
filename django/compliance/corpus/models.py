############################################################
#  [*] corpus — legal acts, versions, structure, chunks
#
#  Models:
#    - LegalDocument        — one act in the catalogue (MiCA,
#                             Mokėjimo įstaigų įstatymas, an LB
#                             licensing page…) or one standard
#                             (ISO/IEC 27001, an uploaded
#                             licensed copy) with its source,
#                             applicability hints and the
#                             version currently in use
#    - LegalDocumentVersion — one immutable fetched/uploaded
#                             text, its hash and ingest state;
#                             a refresh that finds the same hash
#                             creates nothing
#    - LegalUnit            — the structure tree of a version:
#                             chapters, articles, paragraphs,
#                             points, annexes, recitals — or a
#                             standard's clauses and annexes;
#                             `path` is the human citation
#                             ("59 str. 1 d." / "Art. 59(1)" /
#                             "6.1.2")
#                             and `text` the unit's FULL text
#                             including its children
#    - LegalChunk           — the retrieval unit: an article (or
#                             a run of paragraphs of a long one)
#                             with its embedding
#
#  Retrieval only ever reads chunks of a document's CURRENT
#  version. The embedding width is fixed (EMBED_DIMENSIONS) —
#  the HNSW index needs it and a different model means a
#  re-embed job, not a schema change.
#
#  Tables: legal_documents, legal_document_versions,
#          legal_units, legal_chunks
############################################################


from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector
from django.db import models
from pgvector.django import HnswIndex, VectorField


from compliance.users.models import User


EMBED_DIMENSIONS = 1536

# INTL = an international standard (ISO, IEC) — an adopted
# national edition (LST EN ISO …) keeps its own jurisdiction
JURISDICTIONS = ("EU", "LT", "INTL")
DOC_TYPES = ("regulation", "directive", "law", "resolution", "order", "guideline", "licensing", "standard", "other")
# eseimas = the legacy name of etar (e-seimas blocks unattended
# clients; the same register is read through e-tar.lt)
SOURCE_KINDS = ("cellar", "etar", "eseimas", "lb", "url", "upload")
DOC_STATUSES = ("in_force", "not_yet_applicable", "repealed")
VERSION_STATUSES = ("pending", "parsing", "embedding", "ready", "failed")
# clause = a numbered clause of a standard ("4", "6.1.2", "A.5.15")
UNIT_TYPES = ("part", "title", "chapter", "section", "subsection", "article", "paragraph", "point",
              "subpoint", "annex", "recital", "preamble", "text", "clause")








# -----------------------------------------------------------
# LegalDocument
# -----------------------------------------------------------
#
# The catalogue row. `applies_to` lists the institution types
# the act typically governs ("casp", "emi", … or "all") and
# `domains` its subject tags — the applicability screen uses
# both to pick candidates before the model reads the scope
# articles. A standard (doc_type "standard") skips that
# screen: it applies to a company that adopted it
# (companies.CompanyStandard), and its short title is its
# designation ("ISO/IEC 27001:2022"). `enabled` false hides
# the row from retrieval and analysis without deleting its
# versions.
#
# Table: legal_documents
# -----------------------------------------------------------

class LegalDocument(models.Model):
    id = models.TextField(primary_key=True)
    slug = models.TextField(unique=True)
    title = models.TextField()
    title_en = models.TextField(blank=True, default="")
    short_title = models.TextField(blank=True, default="")
    jurisdiction = models.TextField()
    doc_type = models.TextField(default="other")
    source_kind = models.TextField(default="upload")
    external_id = models.TextField(blank=True, default="")
    source_url = models.TextField(blank=True, default="")
    language = models.TextField(default="lt")
    domains = models.JSONField(default=list, blank=True)
    applies_to = models.JSONField(default=list, blank=True)
    applicability_notes = models.TextField(blank=True, default="")
    status = models.TextField(default="in_force")
    enabled = models.BooleanField(default=True)
    current_version = models.ForeignKey("LegalDocumentVersion", null=True, blank=True,
                                        on_delete=models.SET_NULL, related_name="+")
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "legal_documents"
        constraints = [
            models.CheckConstraint(condition=models.Q(jurisdiction__in=JURISDICTIONS), name="legal_documents_jurisdiction_check"),
            models.CheckConstraint(condition=models.Q(doc_type__in=DOC_TYPES), name="legal_documents_doc_type_check"),
            models.CheckConstraint(condition=models.Q(source_kind__in=SOURCE_KINDS), name="legal_documents_source_check"),
            models.CheckConstraint(condition=models.Q(status__in=DOC_STATUSES), name="legal_documents_status_check"),
        ]








# -----------------------------------------------------------
# LegalDocumentVersion
# -----------------------------------------------------------
#
# One immutable text. The raw bytes stay on disk (file_path
# under UPLOAD_DIR/corpus/) so a re-parse never needs a
# re-fetch; `text` is the extracted plain text the structure
# parser read.
#
# Table: legal_document_versions
# -----------------------------------------------------------

class LegalDocumentVersion(models.Model):
    id = models.TextField(primary_key=True)
    document = models.ForeignKey(LegalDocument, on_delete=models.CASCADE, related_name="versions")
    version_no = models.IntegerField()
    content_hash = models.TextField()
    file_path = models.TextField()
    content_type = models.TextField(blank=True, default="")
    source_url = models.TextField(blank=True, default="")
    effective_date = models.DateField(null=True, blank=True)
    # What the source calls this text: the consolidated CELEX
    # ("02023R1114-20240109"), the e-tar edition
    # ("TAR.4A05AB3730DD/qedRvVHdyG") — a refresh that finds the
    # same label has nothing new
    label = models.TextField(blank=True, default="")
    # The structural parser that read it (corpus/sources), or ""
    # for plain text extraction
    parser = models.TextField(blank=True, default="")
    text = models.TextField(blank=True, default="")
    char_count = models.IntegerField(default=0)
    unit_count = models.IntegerField(default=0)
    article_count = models.IntegerField(default=0)
    chunk_count = models.IntegerField(default=0)
    embed_model = models.TextField(blank=True, default="")
    status = models.TextField(default="pending")
    error = models.TextField(null=True, blank=True)
    # When obligation extraction last completed for this version
    # (NULL = never — a report run extracts it first)
    obligations_extracted_at = models.DateTimeField(null=True, blank=True)
    # Whom the act's own scope provisions cover, as a model read
    # them (corpus/scope.py): {types, reasoning, promptVersionId,
    # model, readAt}. NULL = never read — the catalogue's list
    # then decides alone which reports leave the act out
    scope = models.JSONField(null=True, blank=True)
    # What a breach of the act can cost, as a model read its
    # sanction provisions (corpus/sanctions.py): {tiers: [{path,
    # where, condition, documentId, infringedAct, articles, all,
    # addressee, maxFineEur, maxFinePercent, benefitMultiple,
    # measures}],
    # note, provisions, promptVersionId, model, readAt}. NULL =
    # never read — findings under the act then carry no
    # consequence
    sanctions = models.JSONField(null=True, blank=True)
    # What the version changed against the one before it, article
    # by article (corpus/ingest.py): {from, changed, added,
    # removed} — the paths. NULL = the act's first version, or
    # one ingested before changes were recorded
    changes = models.JSONField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()

    class Meta:
        db_table = "legal_document_versions"
        constraints = [
            models.UniqueConstraint(fields=["document", "version_no"], name="legal_document_versions_unique_no"),
            models.CheckConstraint(condition=models.Q(status__in=VERSION_STATUSES), name="legal_document_versions_status_check"),
        ]








# -----------------------------------------------------------
# LegalUnit
# -----------------------------------------------------------
#
# One node of the structure tree, in document order
# (`ordinal`). `path` is what a citation prints; `text` is
# the unit's full text including its children, so an article
# row alone answers "quote article 59".
#
# Table: legal_units
# -----------------------------------------------------------

class LegalUnit(models.Model):
    id = models.TextField(primary_key=True)
    version = models.ForeignKey(LegalDocumentVersion, on_delete=models.CASCADE, related_name="units")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    ordinal = models.IntegerField()
    depth = models.IntegerField(default=0)
    unit_type = models.TextField()
    number = models.TextField(blank=True, default="")
    path = models.TextField(blank=True, default="")
    heading = models.TextField(blank=True, default="")
    text = models.TextField(blank=True, default="")

    class Meta:
        db_table = "legal_units"
        constraints = [
            models.CheckConstraint(condition=models.Q(unit_type__in=UNIT_TYPES), name="legal_units_type_check"),
        ]
        indexes = [
            models.Index(fields=["version", "ordinal"], name="legal_units_version_ord_idx"),
            models.Index(fields=["version", "unit_type", "number"], name="legal_units_lookup_idx"),
        ]








# -----------------------------------------------------------
# LegalChunk
# -----------------------------------------------------------
#
# The retrieval unit. `document` is denormalised so search
# can filter by act without a join through the version;
# `embedding` stays NULL until the embed step has run (search
# skips those rows). The GIN index serves the keyword half of
# the hybrid search ('simple' config — Lithuanian has no
# Postgres stemmer, the vector half carries the inflection).
#
# Table: legal_chunks
# -----------------------------------------------------------

class LegalChunk(models.Model):
    id = models.TextField(primary_key=True)
    version = models.ForeignKey(LegalDocumentVersion, on_delete=models.CASCADE, related_name="chunks")
    document = models.ForeignKey(LegalDocument, on_delete=models.CASCADE, related_name="+")
    unit = models.ForeignKey(LegalUnit, on_delete=models.CASCADE, related_name="chunks")
    ordinal = models.IntegerField()
    path = models.TextField(blank=True, default="")
    heading = models.TextField(blank=True, default="")
    text = models.TextField()
    char_count = models.IntegerField(default=0)
    embedding = VectorField(dimensions=EMBED_DIMENSIONS, null=True, blank=True)

    class Meta:
        db_table = "legal_chunks"
        indexes = [
            models.Index(fields=["version", "ordinal"], name="legal_chunks_version_ord_idx"),
            models.Index(fields=["document"], name="legal_chunks_document_idx"),
            HnswIndex(name="legal_chunks_embedding_hnsw", fields=["embedding"], m=16, ef_construction=64,
                      opclasses=["vector_cosine_ops"]),
            GinIndex(SearchVector("text", config="simple"), name="legal_chunks_text_fts"),
        ]








OBLIGATION_CATEGORIES = (
    "licensing", "registration", "governance", "policy", "procedure", "risk_management", "ict_security",
    "outsourcing", "incident_reporting", "reporting", "disclosure", "record_keeping", "customer_protection",
    "aml_kyc", "capital", "safeguarding", "training", "data_protection", "ai_governance", "other",
)
SEVERITIES = ("critical", "high", "medium", "low")
OBLIGATION_STATUSES = ("proposed", "approved", "rejected")
OBLIGATION_SOURCES = ("legal", "internal", "standard")








# -----------------------------------------------------------
# Obligation
# -----------------------------------------------------------
#
# One concrete duty a regulated entity must meet, extracted
# from an act's provisions (source "legal"), from a company's
# own policy ("internal") or from a standard's clauses — a
# requirement, extracted or entered by an admin ("standard").
# Every extracted obligation cites the units it comes from; `applies_to` narrows it to institution
# types; `embedding` (title + text) and `embedding_en` (the
# English title + text) match it to company evidence — the
# better of the two, so a company's English documents meet
# the Lithuanian obligations (analysis/pipeline.py
# evidence_for). `proposed` rows come from the model, an admin
# approves or rejects them — rejected rows never reach a
# report, approved rows survive re-extraction.
#
# Table: obligations
# -----------------------------------------------------------

class Obligation(models.Model):
    id = models.TextField(primary_key=True)
    source_kind = models.TextField(default="legal")
    document = models.ForeignKey(LegalDocument, null=True, blank=True, on_delete=models.CASCADE,
                                 related_name="obligations")
    version = models.ForeignKey(LegalDocumentVersion, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="obligations")
    unit = models.ForeignKey(LegalUnit, null=True, blank=True, on_delete=models.SET_NULL, related_name="obligations")
    company = models.ForeignKey("companies.Company", null=True, blank=True, on_delete=models.CASCADE,
                                related_name="internal_obligations")
    company_document = models.ForeignKey("companies.CompanyDocument", null=True, blank=True,
                                         on_delete=models.SET_NULL, related_name="obligations")
    title = models.TextField()
    title_en = models.TextField(blank=True, default="")
    text = models.TextField()
    text_en = models.TextField(blank=True, default="")
    addressee = models.TextField(blank=True, default="")
    conditions = models.TextField(blank=True, default="")
    applies_to = models.JSONField(default=list, blank=True)
    category = models.TextField(default="other")
    evidence = models.TextField(blank=True, default="")
    deadline = models.TextField(blank=True, default="")
    severity = models.TextField(default="medium")
    citations = models.JSONField(default=list, blank=True)
    status = models.TextField(default="proposed")
    prompt_version_id = models.TextField(null=True, blank=True)
    model = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    # What a judge model made of the obligation against the full
    # text of the provisions it cites (corpus/verify.py):
    # {verdict: supported | partly | unsupported, issue, note,
    # promptVersionId, model, checkedAt}. NULL = never judged, or
    # its text was edited since. It orders a person's review and
    # decides nothing
    verification = models.JSONField(null=True, blank=True)
    embedding = VectorField(dimensions=EMBED_DIMENSIONS, null=True, blank=True)
    embedding_en = VectorField(dimensions=EMBED_DIMENSIONS, null=True, blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "obligations"
        constraints = [
            models.CheckConstraint(condition=models.Q(category__in=OBLIGATION_CATEGORIES), name="obligations_category_check"),
            models.CheckConstraint(condition=models.Q(severity__in=SEVERITIES), name="obligations_severity_check"),
            models.CheckConstraint(condition=models.Q(status__in=OBLIGATION_STATUSES), name="obligations_status_check"),
            models.CheckConstraint(condition=models.Q(source_kind__in=OBLIGATION_SOURCES), name="obligations_source_check"),
        ]
        indexes = [
            models.Index(fields=["document", "status"], name="obligations_document_idx"),
            models.Index(fields=["company", "status"], name="obligations_company_idx"),
        ]
