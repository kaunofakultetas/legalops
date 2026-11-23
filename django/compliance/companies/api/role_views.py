############################################################
#  [*] Company roles API — role profiles a thread can adopt
#
#    GET    /api/companies/{id}/roles           → {roles}
#    POST   /api/companies/{id}/roles           {name, context, sources?}
#    GET    /api/companies/{id}/roles/{rid}
#    PATCH  /api/companies/{id}/roles/{rid}     any subset of {name, context, sources}
#    DELETE /api/companies/{id}/roles/{rid}
#
#  A role (the compliance officer, the AML officer, …) is
#  distilled from the company's own documents into a short
#  ROLE_CONTEXT block; a chat thread that adopts the role gets
#  it in its instructions. Tenancy follows the company.
############################################################


import uuid


from django.db import IntegrityError, transaction


from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods
from compliance.common.timestamps import utc_now
from compliance.companies.api.company_views import visible_companies
from compliance.companies.models import CompanyRole
from compliance.companies.serializers import role_sources, serialize_role
from compliance.users.auth import require_auth


MAX_NAME_CHARS = 200
MAX_CONTEXT_CHARS = 6_000
MAX_SOURCES = 50








############################################################
# _apply_role
############################################################
#
# Copies {name, context, sources} onto the row; answers an
# error message or None. sources: [{documentId?, title?,
# section?}] with short strings only; a source that names
# one of the company's documents is stored with that
# document's id and title, whichever of the two it came with
# (role_sources).
#
# Used by:
#   - roles_collection, role_item (below)
############################################################

def _apply_role(row, data):
    if "name" in data:
        if not isinstance(data["name"], str) or not data["name"].strip():
            return "name is required"
        row.name = data["name"].strip()[:MAX_NAME_CHARS]
    if "context" in data:
        if not isinstance(data["context"], str):
            return "context must be text"
        if len(data["context"]) > MAX_CONTEXT_CHARS:
            return f"context is limited to {MAX_CONTEXT_CHARS} characters"
        row.context = data["context"].strip()
    if "sources" in data:
        sources = data["sources"] or []
        if not isinstance(sources, list) or len(sources) > MAX_SOURCES or not all(
                isinstance(item, dict) and all(isinstance(v, str) and len(v) <= 300 for v in item.values())
                for item in sources):
            return "sources must be a list of {documentId, title, section} objects"
        given = [{k: item[k] for k in ("documentId", "title", "section") if k in item} for item in sources]
        row.sources = role_sources(given, list(row.company.documents.values_list("id", "title")))
    return None








############################################################
# _save
############################################################
#
# Saves in a savepoint so a duplicate name answers 409
# instead of breaking the request's transaction.
#
# Used by:
#   - roles_collection, role_item (below)
############################################################

def _save(row):
    try:
        with transaction.atomic():
            row.save()
    except IntegrityError:
        return json_error("This company already has a role with that name", 409, code="DUPLICATE_NAME")
    return None








############################################################
# roles_collection
############################################################
#
# GET  /api/companies/{id}/roles
# POST /api/companies/{id}/roles
#
# Used by:
#   - the assistant's listRoles / saveRole tools
#   - CompanyDetail.jsx
############################################################

@methods("GET", "POST")
@require_auth
def roles_collection(request, company_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        titles = list(company.documents.values_list("id", "title"))
        return json_response({"roles": [serialize_role(r, titles) for r in company.roles.order_by("name")]})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    if "name" not in data:
        return json_error("name is required", 400, code="MISSING_FIELDS")
    now = utc_now()
    row = CompanyRole(id=str(uuid.uuid4()), company=company, created_by=request.user, created_at=now,
                      updated_at=now)
    error = _apply_role(row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    conflict = _save(row)
    if conflict:
        return conflict
    audit(request, "companies.role_create", "company", company.id, {"roleId": row.id, "name": row.name})
    return json_response(serialize_role(row), status=201)








############################################################
# role_item
############################################################
#
# GET    /api/companies/{id}/roles/{rid}
# PATCH  /api/companies/{id}/roles/{rid}
# DELETE /api/companies/{id}/roles/{rid}
#
# Deleting a role unlinks it from its threads (SET_NULL).
#
# Used by:
#   - the assistant's saveRole tool (update)
#   - CompanyDetail.jsx
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def role_item(request, company_id, role_id):
    company = visible_companies(request).filter(id=company_id).first()
    row = company.roles.filter(id=role_id).first() if company else None
    if row is None:
        return json_error("Role not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        return json_response(serialize_role(row))

    if request.method == "DELETE":
        row.delete()
        audit(request, "companies.role_delete", "company", company.id, {"roleId": role_id, "name": row.name})
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    error = _apply_role(row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    row.updated_at = utc_now()
    conflict = _save(row)
    if conflict:
        return conflict
    audit(request, "companies.role_update", "company", company.id, {"roleId": row.id, "fields": sorted(data)})
    return json_response(serialize_role(row))
