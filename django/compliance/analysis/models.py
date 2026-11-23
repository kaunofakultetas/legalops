############################################################
#  [*] analysis — reports, acts, findings, actions
#
#  Models:
#    - Report    — one gap analysis of one company: the frozen
#                  profile it ran on, its language and scope,
#                  the executive summary and counts, and the
#                  reviewer's sign-off
#    - ReportAct — the applicability verdict for one act and
#                  how the report then treated it (assessed,
#                  assessed as preparation for a later date,
#                  left for the facts to be confirmed, …)
#    - Finding   — the verdict for one obligation: met /
#                  partial / missing / unknown (= not evidenced)
#                  / not_applicable,
#                  severity, analysis, recommendation, the
#                  company evidence and the legal citations;
#                  a human can override the status with a note
#    - Action    — one step of the prioritised action plan,
#                  linked to the findings it closes
#    - CompanyAction — one action of a company's register: a
#                  plan's step kept across reports once the
#                  report was signed off, until a later
#                  signed-off report confirms it or a person
#                  closes it
#    - ReportCitation — one reference a company document
#                  makes to a specific legal provision, as
#                  the document wrote it, with the citation
#                  audit's verdict on it
#
#  A report SNAPSHOTS every title and text it shows (act
#  titles, obligation texts, citation paths, provision
#  headings), so it reads the same after the corpus, the
#  obligations, the documents or the profile change; the
#  foreign keys are kept only for navigation.
#
#  Tables: reports, report_acts, report_findings, report_actions,
#          report_citations, company_actions
############################################################


from django.db import models


from compliance.companies.models import Company, CompanyDocument
from compliance.corpus.models import LegalDocument, LegalDocumentVersion, LegalUnit, Obligation
from compliance.jobs.models import Job
from compliance.users.models import User


# "scope_review": the run decided which acts apply and waits for
# a person to approve the list before the expensive part
REPORT_STATUSES = ("queued", "running", "scope_review", "done", "failed", "cancelled")
APPLICABILITY = ("applies", "not_applies", "uncertain")
# What a report does with an act once its applicability is
# judged:
#   assessed    — it binds the company today: its obligations
#                 are assessed, and their findings are the
#                 report's result
#   upcoming    — it binds the company only from a later date
#                 (applies_from): assessed as preparation, and
#                 counted apart from today's result
#   unconfirmed — whether it applies depends on facts the
#                 profile does not state: not assessed until
#                 they are confirmed (conditions_to_verify)
#   indirect    — it binds the company through something
#                 else, which is what counts: a directive
#                 through the national law that transposes it
#                 (assessed in its place); an act that
#                 organises an authority or a procedure before
#                 it, through that authority's decisions
#   none        — it does not apply (judged so, or screened
#                 out by the catalogue)
# An uncertain or indirect act the report's scope names is
# assessed all the same — whoever named it chose to.
ASSESSMENTS = ("assessed", "upcoming", "unconfirmed", "indirect", "none")
FINDING_STATUSES = ("met", "partial", "missing", "unknown", "not_applicable")
SEVERITIES = ("critical", "high", "medium", "low")
EFFORTS = ("low", "medium", "high")
TIMEFRAMES = ("immediate", "30_days", "90_days", "12_months")
# Where an action of a company's register stands. "done" is
# the owner's word that it was carried out; "closed" is a
# later signed-off report finding its obligations met, or a
# person closing it with a reason. Late is not a state: it is
# an open action past its due date
ACTION_STATES = ("open", "in_progress", "done", "closed")
# The citation checker's answers (corpus/citations.py)
CITATION_STATUSES = ("found", "not_found", "act_not_in_corpus")
HEADING_MATCHES = ("match", "mismatch", "unknown")
CITATION_JUDGES = ("model", "overlap")








# -----------------------------------------------------------
# Report
# -----------------------------------------------------------
#
# Table: reports
# -----------------------------------------------------------

class Report(models.Model):
    id = models.TextField(primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="reports")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    status = models.TextField(default="queued")
    language = models.TextField(default="lt")
    scope = models.JSONField(default=dict, blank=True)
    profile_snapshot = models.JSONField(default=dict, blank=True)
    title = models.TextField(blank=True, default="")
    summary = models.TextField(blank=True, default="")
    stats = models.JSONField(default=dict, blank=True)
    error = models.TextField(null=True, blank=True)
    # The sign-off: a person approved the reviewed report as the
    # company's assessment (cleared again by any later override)
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_note = models.TextField(blank=True, default="")
    # Who approved the list of acts the report assesses, and
    # when — before the obligations are judged (pipeline.py,
    # analyze). A run started without that review is stamped by
    # the pipeline: a time and nobody
    scope_approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    scope_approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reports"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=REPORT_STATUSES), name="reports_status_check"),
            models.CheckConstraint(condition=models.Q(language__in=("lt", "en")), name="reports_language_check"),
        ]
        indexes = [models.Index(fields=["company", "-created_at"], name="reports_company_idx")]








# -----------------------------------------------------------
# ReportAct
# -----------------------------------------------------------
#
# One act a report assessed, frozen as it was: the model's
# applicability verdict on it, or — for a standard the
# company adopted (doc_type "standard") — "applies" by that
# adoption, with no model call.
#
# Table: report_acts
# -----------------------------------------------------------

class ReportAct(models.Model):
    id = models.TextField(primary_key=True)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="acts")
    document = models.ForeignKey(LegalDocument, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    version = models.ForeignKey(LegalDocumentVersion, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    document_title = models.TextField()
    short_title = models.TextField(blank=True, default="")
    jurisdiction = models.TextField(blank=True, default="")
    # The catalogue's doc_type when the report ran — "standard"
    # rows are adopted standards, not acts the model judged
    doc_type = models.TextField(blank=True, default="")
    source_url = models.TextField(blank=True, default="")
    applicability = models.TextField()
    confidence = models.FloatField(default=0)
    reasoning = models.TextField(blank=True, default="")
    conditions_to_verify = models.TextField(blank=True, default="")
    # The date from which the act binds the company, when that
    # is later than the day the report ran
    applies_from = models.DateField(null=True, blank=True)
    assessment = models.TextField(default="assessed")
    citations = models.JSONField(default=list, blank=True)
    screened_out = models.BooleanField(default=False)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "report_acts"
        constraints = [
            models.CheckConstraint(condition=models.Q(applicability__in=APPLICABILITY), name="report_acts_applicability_check"),
            models.CheckConstraint(condition=models.Q(assessment__in=ASSESSMENTS), name="report_acts_assessment_check"),
        ]








# -----------------------------------------------------------
# Finding
# -----------------------------------------------------------
#
# `status`/`severity` are the model's verdict; a reviewer's
# `override_status` + `reviewer_note` win in every view and
# export when present.
#
# Table: report_findings
# -----------------------------------------------------------

class Finding(models.Model):
    id = models.TextField(primary_key=True)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="findings")
    act = models.ForeignKey(ReportAct, null=True, blank=True, on_delete=models.SET_NULL, related_name="findings")
    obligation = models.ForeignKey(Obligation, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    source_kind = models.TextField(default="legal")
    document_title = models.TextField(blank=True, default="")
    short_title = models.TextField(blank=True, default="")
    obligation_title = models.TextField()
    obligation_text = models.TextField(blank=True, default="")
    # Was the obligation approved by a person when the report
    # ran? A finding on a machine-proposed obligation says so
    obligation_reviewed = models.BooleanField(default=False)
    category = models.TextField(default="other")
    status = models.TextField()
    severity = models.TextField(default="medium")
    analysis = models.TextField(blank=True, default="")
    recommendation = models.TextField(blank=True, default="")
    evidence = models.JSONField(default=list, blank=True)
    citations = models.JSONField(default=list, blank=True)
    deadline = models.TextField(blank=True, default="")
    override_status = models.TextField(null=True, blank=True)
    reviewer_note = models.TextField(blank=True, default="")
    # What a breach of the provision can cost — the sanction
    # tiers that cover it, as the corpus held them when the
    # report ran (corpus/sanctions.py): [{act, path, where,
    # condition, maxFineEur, maxFinePercent, benefitMultiple,
    # measures, measuresFrom}]
    consequence = models.JSONField(default=list, blank=True)
    # Why the gap exists, in the reviewer's words. Only a person
    # writes it: documents show that something is missing, never why
    cause = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "report_findings"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=FINDING_STATUSES), name="report_findings_status_check"),
            models.CheckConstraint(condition=models.Q(severity__in=SEVERITIES), name="report_findings_severity_check"),
        ]
        indexes = [models.Index(fields=["report", "order"], name="report_findings_order_idx")]








# -----------------------------------------------------------
# Action
# -----------------------------------------------------------
#
# Table: report_actions
# -----------------------------------------------------------

class Action(models.Model):
    id = models.TextField(primary_key=True)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="actions")
    title = models.TextField()
    description = models.TextField(blank=True, default="")
    priority = models.IntegerField(default=1)
    effort = models.TextField(default="medium")
    timeframe = models.TextField(default="90_days")
    owner_role = models.TextField(blank=True, default="")
    category = models.TextField(default="other")
    finding_ids = models.JSONField(default=list, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "report_actions"
        constraints = [
            models.CheckConstraint(condition=models.Q(effort__in=EFFORTS), name="report_actions_effort_check"),
            models.CheckConstraint(condition=models.Q(timeframe__in=TIMEFRAMES), name="report_actions_timeframe_check"),
        ]








# -----------------------------------------------------------
# ReportCitation
# -----------------------------------------------------------
#
# One reference a company document makes to a specific
# provision ("MiCA Art. 63(2) — safekeeping of client
# crypto-assets"): act, article, paragraph, point, the claim
# (what the document says the provision covers) and the quote
# exactly as the document wrote them, then the audit's
# verdict — `status` (does the act's current version hold the
# provision) and, for a found one, `heading_match` (is the
# claim what the provision regulates; null otherwise) with
# the judge that decided it (`judged_by`: the small model, or
# the word overlap when the model was unavailable; null when
# nothing was compared). The provision's short title, path,
# heading, the judge's note, an excerpt and the official link
# are snapshotted with it. A reference several documents make
# was judged once — each document still gets its own row.
#
# Table: report_citations
# -----------------------------------------------------------

class ReportCitation(models.Model):
    id = models.TextField(primary_key=True)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="citations")
    company_document = models.ForeignKey(CompanyDocument, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name="+")
    document_title = models.TextField(blank=True, default="")
    act = models.TextField(blank=True, default="")
    article = models.TextField(blank=True, default="")
    paragraph = models.TextField(blank=True, default="")
    point = models.TextField(blank=True, default="")
    claim = models.TextField(blank=True, default="")
    quote = models.TextField(blank=True, default="")
    status = models.TextField()
    heading_match = models.TextField(null=True, blank=True)
    judged_by = models.TextField(null=True, blank=True)
    legal_document = models.ForeignKey(LegalDocument, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="+")
    unit = models.ForeignKey(LegalUnit, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    short_title = models.TextField(blank=True, default="")
    unit_path = models.TextField(blank=True, default="")
    heading = models.TextField(blank=True, default="")
    note = models.TextField(blank=True, default="")
    excerpt = models.TextField(blank=True, default="")
    citation_url = models.TextField(blank=True, default="")
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "report_citations"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=CITATION_STATUSES), name="report_citations_status_check"),
            models.CheckConstraint(condition=models.Q(heading_match__isnull=True) | models.Q(heading_match__in=HEADING_MATCHES),
                                   name="report_citations_heading_match_check"),
            models.CheckConstraint(condition=models.Q(judged_by__isnull=True) | models.Q(judged_by__in=CITATION_JUDGES),
                                   name="report_citations_judged_by_check"),
        ]
        indexes = [models.Index(fields=["report", "order"], name="report_citations_order_idx")]








# -----------------------------------------------------------
# CompanyAction
# -----------------------------------------------------------
#
# One action of a company's register: a measure a signed-off
# report's plan called for, kept across reports until it is
# closed. It comes in when a person signs a report off
# (analysis/register.py), with an owner and a due date a
# person may change, and with `items` — the open findings it
# is to close, each naming its obligation: [{obligationId,
# findingId, title, act, path, sourceKind, status,
# confirmed}]. `confirmed` is set on an item when a later
# signed-off report finds the obligation met ({reportId,
# at}); an action whose items are all confirmed is closed by
# that report (`confirmed_report`), and `closed_from`
# remembers the state it was closed from, so that a withdrawn
# sign-off can put it back. A person may also close one by
# hand, saying why in `note`. `done_at` is when its owner
# last called it done: only a report made after that can
# send it back to work.
#
# Table: company_actions
# -----------------------------------------------------------

class CompanyAction(models.Model):
    id = models.TextField(primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="actions")
    report = models.ForeignKey(Report, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    plan_action_id = models.TextField()
    title = models.TextField()
    description = models.TextField(blank=True, default="")
    category = models.TextField(default="other")
    priority = models.IntegerField(default=1)
    effort = models.TextField(default="medium")
    owner = models.TextField(blank=True, default="")
    due_date = models.DateField()
    status = models.TextField(default="open")
    items = models.JSONField(default=list, blank=True)
    note = models.TextField(blank=True, default="")
    done_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    closed_from = models.TextField(blank=True, default="")
    confirmed_report = models.ForeignKey(Report, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "company_actions"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=ACTION_STATES), name="company_actions_status_check"),
            models.UniqueConstraint(fields=["company", "plan_action_id"], name="company_actions_plan_action_key"),
        ]
        indexes = [models.Index(fields=["company", "status"], name="company_actions_status_idx")]

