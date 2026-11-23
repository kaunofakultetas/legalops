############################################################
#  [*] programme.models — the documents a compliance
#      programme is made of
#
#  Table: work_products
#
#  A report says where a company stands against the law. The
#  compliance function then has to write things down: the
#  compliance policy and what documents it still lacks, who
#  answers for what (structure, process, RACI), which legal
#  risks it runs (criteria, scenarios, register). Each is a
#  work product: generated in the background from the
#  company's own documents, its profile and its latest report,
#  checked by code against the rules its kind must keep,
#  edited by a person, and approved by a person — never by the
#  system. A later product builds on the approved ones before
#  it.
############################################################


from django.db import models

from compliance.companies.models import Company
from compliance.jobs.models import Job
from compliance.users.models import User


# The kinds shipped today (programme/kinds.py holds what each
# is). The column carries no constraint: a kind added later
# needs a module, not a migration
PRODUCT_KINDS = ("policy", "governance", "risks")
# "draft": generated or being edited, waiting for a person's
# approval; "approved": frozen — a change is a new version
PRODUCT_STATUSES = ("queued", "running", "draft", "approved", "failed", "cancelled")








# -----------------------------------------------------------
# WorkProduct
# -----------------------------------------------------------
#
# One version of one product of a company. `content` is the
# product itself, shaped by its kind; `checks` are the rules
# of the kind as the content last met or broke them (a broken
# blocking rule keeps the product from being approved);
# `basis` names what the run read — the report, the earlier
# products, the documents — so a reader can tell what a
# product rests on; `stats` hold its cost and provenance.
# Versions of a kind count up per company; approval freezes a
# row and a revision copies it into the next version.
#
# Table: work_products
# -----------------------------------------------------------

class WorkProduct(models.Model):
    id = models.TextField(primary_key=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="work_products")
    kind = models.TextField()
    version = models.IntegerField()
    language = models.TextField(default="lt")
    status = models.TextField(default="queued")
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    error = models.TextField(null=True, blank=True)
    title = models.TextField(blank=True, default="")
    content = models.JSONField(default=dict, blank=True)
    checks = models.JSONField(default=list, blank=True)
    basis = models.JSONField(default=dict, blank=True)
    stats = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    edited_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    edited_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "work_products"
        constraints = [
            models.UniqueConstraint(fields=["company", "kind", "version"], name="work_products_unique_version"),
            models.CheckConstraint(condition=models.Q(status__in=PRODUCT_STATUSES), name="work_products_status_check"),
            models.CheckConstraint(condition=models.Q(language__in=("lt", "en")), name="work_products_language_check"),
        ]
        indexes = [models.Index(fields=["company", "kind", "-version"], name="work_products_company_idx")]
