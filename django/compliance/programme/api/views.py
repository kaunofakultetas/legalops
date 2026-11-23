############################################################
#  [*] Programme API — the work products of a company
#
#    GET    /api/companies/{id}/programme            → {products, kinds}
#    POST   /api/companies/{id}/programme {kind, language?} → product + job
#    GET    /api/programme/{id}                      → the product with its content
#    PUT    /api/programme/{id}/content {content}    → the edited draft, checked again
#    PATCH  /api/programme/{id} {approved: true, note?} → the approved product
#    POST   /api/programme/{id}/revise               → a new draft version of it
#    POST   /api/programme/{id}/cancel
#    DELETE /api/programme/{id}
#    GET    /api/programme/{id}/chart                → the structure as SVG
#    GET    /api/programme/{id}/export?format=       → the product as a file
#
#  Tenancy follows the company. One product of a kind is
#  generated at a time per company, and a run needs daily USD
#  budget left. A draft is edited whole: the content sent is
#  brought into the kind's shape and checked against its
#  rules, exactly as the model's answer was. Only a person
#  approves, and only a draft that breaks no blocking rule;
#  approval freezes the product — changing it afterwards is a
#  new version. A draft exports like an approved product —
#  its cover says which of the two it is.
############################################################


import re
import uuid

from django.db import transaction
from django.db.models import Max
from django.http import HttpResponse

from compliance.assistant.usage import budget_status
from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.api.company_views import visible_companies
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.programme.chart import structure_svg
from compliance.programme.kinds import KINDS
from compliance.programme.models import WorkProduct
from compliance.programme.run import Library
from compliance.programme.serializers import serialize_product
from compliance.users.auth import require_auth


# What a run costs at least: a product is not started on a
# budget that cannot pay for its first call
MIN_BUDGET_TO_START_USD = 0.25








############################################################
# _visible
############################################################
#
# The products the caller may see: those of the companies
# the caller may see.
#
# Used by:
#   - every view below
############################################################

def _visible(request):
    return WorkProduct.objects.select_related("company", "job", "approved_by", "edited_by").filter(
        company__in=visible_companies(request))








############################################################
# company_programme
############################################################
#
# GET, POST /api/companies/{id}/programme
#
# GET lists the company's products, the newest version of
# each kind first, and the kinds there are with what each
# builds on. POST starts the generation of a new version of
# a kind: {kind, language?}.
#
# Used by:
#   - vite: Companies/CompanyProgramme
#   - assistant: getWorkProduct, startWorkProduct tools
############################################################

@methods("GET", "POST")
@require_auth
def company_programme(request, company_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    if request.method == "GET":
        rows = _visible(request).filter(company=company).order_by("kind", "-version")
        return json_response({"products": [serialize_product(row, job=row.job) for row in rows[:300]],
                              "kinds": [{"kind": kind, "title": module.TITLE, "needs": list(module.NEEDS)}
                                        for kind, module in KINDS.items()]})
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    kind, language = data.get("kind"), data.get("language") or "lt"
    if not isinstance(kind, str) or kind not in KINDS:
        return json_error(f"kind must be one of {', '.join(KINDS)}", 400, code="INVALID_FIELD")
    if language not in ("lt", "en"):
        return json_error("language must be lt or en", 400, code="INVALID_FIELD")
    if not company.documents.exclude(text="").exists():
        return json_error("The company has no readable documents — upload them first", 409, code="NO_DOCUMENTS")
    budget = budget_status(request.user.id)
    if budget["remaining"] is not None and budget["remaining"] < MIN_BUDGET_TO_START_USD:
        return json_error("Today's AI usage budget is spent — try again tomorrow", 429, code="BUDGET_EXCEEDED")
    with transaction.atomic():
        type(company).objects.select_for_update().filter(id=company.id).first()
        if WorkProduct.objects.filter(company=company, kind=kind, status__in=("queued", "running")).exists():
            return json_error("This product is already being generated", 409, code="ALREADY_RUNNING")
        latest = WorkProduct.objects.filter(company=company, kind=kind).aggregate(n=Max("version"))["n"] or 0
        product = WorkProduct.objects.create(id=str(uuid.uuid4()), company=company, kind=kind, version=latest + 1,
                                             language=language, status="queued", created_by=request.user,
                                             title=KINDS[kind].TITLE[language], created_at=utc_now())
        job = enqueue("programme.generate", {"product_id": product.id}, subject=f"product:{product.id}",
                      created_by=request.user)
        WorkProduct.objects.filter(id=product.id).update(job=job)
        product.job = job
    audit(request, "programme.create", "work_product", product.id, {"company": company.id, "kind": kind})
    return json_response(serialize_product(product, job=job), status=201)








############################################################
# product_item
############################################################
#
# GET, PATCH, DELETE /api/programme/{id}
#
# GET answers the product with its content. PATCH {approved:
# true, note?} is a person's approval: only of a draft, and
# only while no blocking rule of its kind is broken. DELETE
# removes a version that is not being generated.
#
# Used by:
#   - vite: Programme/ProductDetail
#   - assistant: getWorkProduct tool
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def product_item(request, product_id):
    product = _visible(request).filter(id=product_id).first()
    if product is None:
        return json_error("Product not found", 404, code="NOT_FOUND")
    if request.method == "GET":
        return json_response(serialize_product(product, full=True, job=product.job))
    if request.method == "DELETE":
        if product.status in ("queued", "running"):
            return json_error("Cancel the generation first", 409, code="STILL_RUNNING")
        product.delete()
        audit(request, "programme.delete", "work_product", product_id, {"kind": product.kind, "version": product.version})
        return json_response({"ok": True})
    data = get_json_object(request)
    if data is None or data.get("approved") is not True:
        return json_error("approved: true is required", 400, code="MISSING_FIELDS")
    note = data.get("note") or ""
    if not isinstance(note, str):
        return json_error("note must be text", 400, code="INVALID_FIELD")
    if product.status != "draft":
        return json_error("Only a draft can be approved", 409, code="NOT_DRAFT")
    broken = [c["rule"] for c in product.checks if c.get("blocking") and not c.get("ok")]
    if broken:
        return json_error(f"The draft breaks rules of its kind: {', '.join(broken)}", 409, code="RULES_BROKEN")
    product.status, product.approved_by, product.approved_at = "approved", request.user, utc_now()
    product.approval_note = note.strip()[:2000]
    product.save(update_fields=["status", "approved_by", "approved_at", "approval_note"])
    audit(request, "programme.approve", "work_product", product.id, {"kind": product.kind, "version": product.version})
    return json_response(serialize_product(product, full=True, job=product.job))








############################################################
# product_content
############################################################
#
# PUT /api/programme/{id}/content  {content}
#
# A person's edit of a draft, whole: the content is brought
# into the kind's shape and checked against its rules, and
# the checks are stored with it — an edit can break a rule or
# mend one. References keep working the same way: a quote is
# placed in its document again, a provision looked up again.
#
# Used by:
#   - vite: Programme/ProductDetail (the edit dialogs)
############################################################

@methods("PUT")
@require_auth
def product_content(request, product_id):
    product = _visible(request).filter(id=product_id).first()
    if product is None:
        return json_error("Product not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None or not isinstance(data.get("content"), dict):
        return json_error("content (an object) is required", 400, code="MISSING_FIELDS")
    if product.status != "draft":
        return json_error("Only a draft can be edited — revise an approved product first", 409, code="NOT_DRAFT")
    kind = KINDS.get(product.kind)
    if kind is None:
        return json_error("This kind of product is no longer supported", 409, code="UNKNOWN_KIND")
    try:
        content, checks = kind.validate(data["content"], Library(product.company), product.language)
    except (TypeError, ValueError, AttributeError, KeyError):
        return json_error("content does not have the shape of this kind of product", 400, code="INVALID_FIELD")
    product.content, product.checks = content, checks
    product.title = str(content.get("title") or product.title)[:300]
    product.edited_by, product.edited_at = request.user, utc_now()
    product.save(update_fields=["content", "checks", "title", "edited_by", "edited_at"])
    audit(request, "programme.edit", "work_product", product.id, {"kind": product.kind, "version": product.version})
    return json_response(serialize_product(product, full=True, job=product.job))








############################################################
# revise_product
############################################################
#
# POST /api/programme/{id}/revise
#
# A new draft version of an approved product, starting from
# its content: the approved one stays as it was approved.
#
# Used by:
#   - vite: Programme/ProductDetail
############################################################

@methods("POST")
@require_auth
def revise_product(request, product_id):
    product = _visible(request).filter(id=product_id).first()
    if product is None:
        return json_error("Product not found", 404, code="NOT_FOUND")
    if product.status != "approved":
        return json_error("Only an approved product is revised — a draft is edited as it is", 409, code="NOT_APPROVED")
    with transaction.atomic():
        latest = WorkProduct.objects.select_for_update().filter(company=product.company, kind=product.kind).order_by("-version").first()
        if latest.status in ("queued", "running", "draft"):
            return json_error("A newer version is already in work", 409, code="NEWER_VERSION")
        draft = WorkProduct.objects.create(
            id=str(uuid.uuid4()), company=product.company, kind=product.kind, version=latest.version + 1,
            language=product.language, status="draft", title=product.title, content=product.content,
            checks=product.checks, basis={**product.basis, "revisedFrom": product.id}, stats={},
            created_by=request.user, created_at=utc_now(), finished_at=utc_now())
    audit(request, "programme.revise", "work_product", draft.id, {"from": product.id, "version": draft.version})
    return json_response(serialize_product(draft, full=True), status=201)








############################################################
# cancel_product
############################################################
#
# POST /api/programme/{id}/cancel
#
# Stops a generation that waits or runs.
#
# Used by:
#   - vite: Programme/ProductDetail
############################################################

@methods("POST")
@require_auth
def cancel_product(request, product_id):
    product = _visible(request).filter(id=product_id).first()
    if product is None:
        return json_error("Product not found", 404, code="NOT_FOUND")
    if product.status not in ("queued", "running") or product.job_id is None:
        return json_error(f"The generation is already {product.status}", 409, code="NOT_CANCELLABLE")
    # Queued first, then running — a worker claiming the job
    # between the two writes still gets the flag
    now = utc_now()
    if Job.objects.filter(id=product.job_id, status="queued").update(status="cancelled", cancel_requested=True,
                                                                     finished_at=now):
        WorkProduct.objects.filter(id=product.id, status__in=("queued", "running")).update(status="cancelled",
                                                                                           finished_at=now)
    elif not Job.objects.filter(id=product.job_id, status="running").update(cancel_requested=True):
        product.refresh_from_db()
        return json_error(f"The generation is already {product.status}", 409, code="NOT_CANCELLABLE")
    audit(request, "programme.cancel", "work_product", product.id)
    product.refresh_from_db()
    return json_response(serialize_product(product, job=product.job))








############################################################
# product_chart
############################################################
#
# GET /api/programme/{id}/chart
#
# The structure of a governance product drawn as a tree, as
# SVG — the same drawing its PDF carries. 404 for a product
# that has no structure.
#
# Used by:
#   - vite: Programme/GovernanceView
############################################################

@methods("GET")
@require_auth
def product_chart(request, product_id):
    product = _visible(request).filter(id=product_id).first()
    nodes = (product.content or {}).get("structure") if product is not None else None
    if not nodes:
        return json_error("This product has no structure to draw", 404, code="NOT_FOUND")
    return HttpResponse(structure_svg(nodes, product.language), content_type="image/svg+xml")








############################################################
# export_product
############################################################
#
# GET /api/programme/{id}/export?format=pdf|docx|xlsx
#
# The product as a file: every kind as a PDF, the policy also
# as a Word file, the risk register also as a workbook. A
# product that is still being generated, or whose generation
# failed, has nothing to export. The filename carries the
# kind, the company and the version.
#
# Used by:
#   - vite: Programme/ProductPage — the export buttons (blob download)
############################################################

@methods("GET")
@require_auth
def export_product(request, product_id):
    from compliance.programme import exports

    product = _visible(request).filter(id=product_id).first()
    if product is None:
        return json_error("Work product not found", 404, code="NOT_FOUND")
    if product.status not in ("draft", "approved"):
        return json_error("Only a draft or an approved product can be exported", 409, code="NOT_READY")
    fmt = request.GET.get("format", "pdf")
    formats = exports.FORMATS.get(product.kind, ())
    if fmt not in formats:
        return json_error(f"format must be one of: {', '.join(formats)}", 400, code="INVALID_QUERY")
    body, mime = {
        "pdf": (exports.render_pdf, "application/pdf"),
        "docx": (exports.render_docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "xlsx": (exports.render_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }[fmt]
    name = product.company.name.translate(str.maketrans("ąčęėįšųūžĄČĘĖĮŠŲŪŽ", "aceeisuuzACEEISUUZ"))
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", f"{product.kind}-{name}-v{product.version}").strip("-")[:80] or product.kind
    audit(request, "programme.export", "work_product", product.id, {"format": fmt, "kind": product.kind})
    response = HttpResponse(body(product), content_type=mime)
    response["Content-Disposition"] = f'attachment; filename="{stem}.{fmt}"'
    response["Cache-Control"] = "no-store"
    return response
