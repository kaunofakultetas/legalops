############################################################
#  [*] Company standards API — the standards a company adopted
#
#    GET    /api/companies/{id}/standards           → {standards}
#    POST   /api/companies/{id}/standards           {documentId, status?, scope?, certificateId?, notes?}
#    PATCH  /api/companies/{id}/standards/{sid}     any subset of {status, scope, certificateId, notes}
#    DELETE /api/companies/{id}/standards/{sid}
#
#  An adoption ties a company to a standard of the corpus (a
#  document of doc_type "standard"): certified, implementing
#  or planned, the scope it covers and the certificate that
#  proves it — a credential of the same company. Every report
#  of the company then assesses it against that standard's
#  requirements. A company adopts a standard once; the
#  standard itself never changes through these routes.
#  Tenancy follows the company.
############################################################


import uuid


from django.db import IntegrityError, transaction


from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.api.company_views import visible_companies
from compliance.companies.models import STANDARD_STATUSES, CompanyCredential, CompanyStandard
from compliance.companies.serializers import serialize_standard
from compliance.corpus.models import LegalDocument
from compliance.users.auth import require_auth


MAX_TEXT_CHARS = 4_000








############################################################
# _apply_standard
############################################################
#
# Copies {status, scope, certificateId, notes} onto the row;
# answers an error message or None. The certificate must be
# one of the company's own credentials, or null to unlink it.
#
# Used by:
#   - standards_collection, standard_item (below)
############################################################

def _apply_standard(company, row, data):
    if "status" in data:
        if data["status"] not in STANDARD_STATUSES:
            return f"status must be one of {', '.join(STANDARD_STATUSES)}"
        row.status = data["status"]
    for wire in ("scope", "notes"):
        if wire in data:
            if data[wire] is not None and not isinstance(data[wire], str):
                return f"{wire} must be text"
            setattr(row, wire, (data[wire] or "").strip()[:MAX_TEXT_CHARS])
    if "certificateId" in data:
        certificate_id = data["certificateId"]
        if certificate_id is None:
            row.certificate = None
        else:
            certificate = CompanyCredential.objects.filter(id=str_id(certificate_id), company=company).first()
            if certificate is None:
                return "certificateId must be one of this company's credentials"
            row.certificate = certificate
    return None








############################################################
# standards_collection
############################################################
#
# GET  /api/companies/{id}/standards
# POST /api/companies/{id}/standards
#
# A new adoption names the standard by its corpus id; it is
# "implementing" unless the body says otherwise. Adopting a
# standard twice answers 409 — the existing row is changed
# with PATCH instead.
#
# Used by:
#   - the assistant's setCompanyStandard tool
#   - CompanyStandards.jsx
############################################################

@methods("GET", "POST")
@require_auth
def standards_collection(request, company_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        rows = company.standards.select_related("document").order_by("created_at", "id")
        return json_response({"standards": [serialize_standard(row) for row in rows]})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    if not data.get("documentId"):
        return json_error("documentId is required", 400, code="MISSING_FIELDS")
    # A switched-off standard is hidden from users, here too
    document = LegalDocument.objects.filter(id=str_id(data["documentId"]), doc_type="standard").first()
    if document is None or (not document.enabled and request.user.role != "admin"):
        return json_error("documentId must be a standard of the corpus", 400, code="INVALID_FIELD")
    now = utc_now()
    row = CompanyStandard(id=str(uuid.uuid4()), company=company, document=document, created_by=request.user,
                          created_at=now, updated_at=now)
    error = _apply_standard(company, row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    try:
        with transaction.atomic():
            row.save()
    except IntegrityError:
        return json_error("The company has already adopted this standard", 409, code="ALREADY_ADOPTED")
    company.updated_at = now
    company.save(update_fields=["updated_at"])
    audit(request, "companies.standard_add", "company", company.id,
          {"standard": document.short_title or document.title[:80], "status": row.status})
    return json_response(serialize_standard(row), status=201)








############################################################
# standard_item
############################################################
#
# PATCH  /api/companies/{id}/standards/{sid}
# DELETE /api/companies/{id}/standards/{sid}
#
# Used by:
#   - the assistant's setCompanyStandard / removeCompanyStandard
#     tools
#   - CompanyStandards.jsx
############################################################

@methods("PATCH", "DELETE")
@require_auth
def standard_item(request, company_id, standard_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    row = company.standards.select_related("document").filter(id=standard_id).first()
    if row is None:
        return json_error("Standard not found", 404, code="NOT_FOUND")
    name = row.document.short_title or row.document.title[:80]

    if request.method == "DELETE":
        row.delete()
        audit(request, "companies.standard_remove", "company", company.id,
              {"adoptionId": standard_id, "standard": name})
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    before = row.status
    error = _apply_standard(company, row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    row.updated_at = utc_now()
    row.save()
    audit(request, "companies.standard_update", "company", company.id,
          {"adoptionId": row.id, "standard": name, "fields": sorted(data), "status": [before, row.status]})
    return json_response(serialize_standard(row))
