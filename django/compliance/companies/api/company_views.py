############################################################
#  [*] Companies API — profiles and credentials
#
#    GET    /api/companies?scope=own&q=             → {companies}
#    POST   /api/companies                          {name, ...}
#    GET    /api/companies/{id}                     → company + credentials + roles + documents
#    PUT    /api/companies/{id}                     partial update, any subset of fields
#    DELETE /api/companies/{id}
#    GET    /api/companies/{id}/credentials         → {credentials}
#    POST   /api/companies/{id}/credentials         {kind, name, status?, evidenceDocumentId?, ...}
#    PATCH  /api/companies/{id}/credentials/{cid}   any subset of the same fields
#    DELETE /api/companies/{id}/credentials/{cid}
#
#  Tenancy: a user sees and edits only their own companies;
#  an admin sees all (scope=own narrows an admin's list to
#  their own — what the chat assistant uses). The assistant's
#  tools call these same routes with the user's bearer, so
#  the rule lives here once.
############################################################


import json
import re
import unicodedata
import uuid
from datetime import date


from django.db.models import Q


from compliance.audit.log import audit
from compliance.common.http import bounded_int, get_json_object, json_error, json_response, methods, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.models import (
    CREDENTIAL_KINDS, CREDENTIAL_STATUSES, INSTITUTION_TYPES, SIZE_CATEGORIES, Company, CompanyCredential,
    CompanyDocument,
)
from compliance.companies.serializers import COMPANY_FIELDS, serialize_company, serialize_credential
from compliance.users.auth import require_auth


BOOL_FIELDS = {"uses_ai", "provides_ai", "processes_personal_data", "is_public_sector"}
# column → inclusive upper bound
INT_FIELDS = {"employees": 10_000_000, "annual_turnover_eur": 10**14}
JSON_FIELDS = {"financial_market", "attributes"}
LONG_TEXT_FIELDS = {"activities": 20_000, "ai_description": 10_000}
MAX_TEXT_CHARS = 500
MAX_JSON_CHARS = 60_000
MAX_LISTED = 500

# Words a company search skips (compared without diacritics):
# legal forms and "company" in English and Lithuanian — so
# "1009, LTD", "1009 company" and "įmonė 1009" all look for
# "1009" (company_search)
NAME_NOISE = frozenset({
    "ab", "akcine", "bendrove", "bendroves", "co", "company", "corp", "gmbh", "imone", "imones", "imonei",
    "imoneje", "inc", "limited", "llc", "ltd", "mb", "plc", "the", "uab", "uzdaroji", "vsi",
})








############################################################
# visible_companies
############################################################
#
# The rows the caller may touch — the one tenancy rule.
#
# Used by:
#   - every route in this file
#   - companies/api/document_views.py — attaching a document
#   - chat/api/views.py — a thread's company
############################################################

def visible_companies(request):
    rows = Company.objects.all()
    if request.user.role != "admin":
        rows = rows.filter(owner=request.user)
    return rows








############################################################
# _apply_fields
############################################################
#
# Copies the accepted wire fields onto the row with strict
# type checks; answers an error message or None. Unknown keys
# are ignored so a client can send a whole profile back. The
# four flags take true / false / null (null = unknown — never
# guessed); a string "false" is refused, not read as true.
#
# Used by:
#   - companies_collection, company_item (below)
############################################################

def _apply_fields(company, data):
    for wire, column in COMPANY_FIELDS.items():
        if wire not in data:
            continue
        value = data[wire]
        if column == "name":
            if not isinstance(value, str) or not value.strip():
                return "name cannot be empty"
            value = value.strip()[:MAX_TEXT_CHARS]
        elif column in BOOL_FIELDS:
            if value is not None and not isinstance(value, bool):
                return f"{wire} must be true, false or null"
        elif column in INT_FIELDS:
            if value is not None:
                value = bounded_int(value, 0, INT_FIELDS[column])
                if value is None:
                    return f"{wire} must be a whole number from 0 to {INT_FIELDS[column]}"
        elif column == "size_category":
            if value not in SIZE_CATEGORIES:
                return f"{wire} must be one of {', '.join(SIZE_CATEGORIES)}"
        elif column == "institution_type":
            if value not in INSTITUTION_TYPES:
                return f"{wire} must be one of {', '.join(INSTITUTION_TYPES)}"
        elif column == "nace_codes":
            if not isinstance(value, list) or len(value) > 50 \
                    or not all(isinstance(v, str) and 0 < len(v.strip()) <= 20 for v in value):
                return "naceCodes must be a list of codes like \"64.19\""
            value = [v.strip() for v in value]
        elif column in JSON_FIELDS:
            if value is not None and not isinstance(value, dict):
                return f"{wire} must be an object"
            if value is not None and len(json.dumps(value, ensure_ascii=False)) > MAX_JSON_CHARS:
                return f"{wire} is too large"
        elif column in LONG_TEXT_FIELDS:
            if value is not None and not isinstance(value, str):
                return f"{wire} must be text"
            value = (value or "")[:LONG_TEXT_FIELDS[column]]
        elif column == "country":
            if not isinstance(value, str) or not value.strip():
                return "country must be text, e.g. LT"
            value = value.strip()[:100]
            # A two-letter code is stored as the code ("lt" → "LT")
            if len(value) == 2 and value.isalpha():
                value = value.upper()
        else:
            if value is not None and not isinstance(value, str):
                return f"{wire} must be text"
            value = (value or "").strip()[:MAX_TEXT_CHARS] or None
        setattr(company, column, value)
    return None








############################################################
# company_search
############################################################
#
#   company_search("1009, LTD") → name/code contains "1009"
#   company_search("demo 1009") → contains "demo" AND "1009"
#   company_search("UAB")       → contains "UAB" (nothing else to go on)
#
# The ?q= filter: every distinctive word must appear in the
# name or the registration code, in any order and case.
# Punctuation, legal forms and "company"/"įmonė" (NAME_NOISE)
# are skipped — a user or the assistant names a company as
# its documents write it ("1009, LTD") while it is stored as
# "1009 LTD (demo)", and the whole-string match found
# nothing. A query of noise words only is matched as a whole.
#
# Used by:
#   - companies_collection (below)
############################################################

def company_search(query):
    def plain(word):
        return "".join(c for c in unicodedata.normalize("NFKD", word.lower()) if not unicodedata.combining(c))

    # At most ten words: each is one more condition in the SQL
    words = [word for word in re.findall(r"\w+", query) if plain(word) not in NAME_NOISE][:10]
    if not words:
        return Q(name__icontains=query) | Q(registration_code__icontains=query)
    condition = Q()
    for word in words:
        condition &= Q(name__icontains=word) | Q(registration_code__icontains=word)
    return condition








############################################################
# companies_collection
############################################################
#
# GET  /api/companies
# POST /api/companies
#
# Newest-updated first, at most MAX_LISTED; ?q= matches the
# name or registration code word by word (company_search);
# ?scope=own limits an admin to their own. Creation needs
# only a name.
#
# Used by:
#   - the assistant's listCompanies / createCompany tools
#   - Companies.jsx, Dashboard.jsx
############################################################

@methods("GET", "POST")
@require_auth
def companies_collection(request):
    if request.method == "GET":
        rows = visible_companies(request).select_related("owner").order_by("-updated_at", "-id")
        if request.GET.get("scope") == "own":
            rows = rows.filter(owner=request.user)
        query = request.GET.get("q", "").strip()
        if query:
            rows = rows.filter(company_search(query))
        return json_response({"companies": [serialize_company(c) for c in rows[:MAX_LISTED]]})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    if not isinstance(data.get("name"), str) or not data["name"].strip():
        return json_error("name is required", 400, code="MISSING_FIELDS")
    now = utc_now()
    company = Company(id=str(uuid.uuid4()), owner=request.user, created_at=now, updated_at=now)
    error = _apply_fields(company, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    company.save()
    audit(request, "companies.create", "company", company.id, {"name": company.name})
    return json_response(serialize_company(company, with_related=True), status=201)








############################################################
# company_item
############################################################
#
# GET    /api/companies/{id}
# PUT    /api/companies/{id}
# DELETE /api/companies/{id}
#
# PUT is a partial merge: any subset of the wire fields.
# DELETE removes the profile with its credentials, roles,
# reports and work products (a running analysis, and a
# product being generated, must be cancelled first);
# documents are detached, not deleted (they belong to the
# owner).
#
# Used by:
#   - the assistant's getCompany / updateCompany tools
#   - CompanyDetail.jsx
############################################################

@methods("GET", "PUT", "DELETE")
@require_auth
def company_item(request, company_id):
    company = visible_companies(request).select_related("owner").filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        return json_response(serialize_company(company, with_related=True))

    if request.method == "DELETE":
        if company.reports.filter(status__in=("queued", "running")).exists():
            return json_error("Cancel the running analysis first", 409, code="STILL_RUNNING")
        if company.work_products.filter(status__in=("queued", "running")).exists():
            return json_error("Cancel the document being generated first", 409, code="STILL_RUNNING")
        company.documents.update(company=None)
        company.delete()
        audit(request, "companies.delete", "company", company_id, {"name": company.name})
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    error = _apply_fields(company, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    company.updated_at = utc_now()
    company.save()
    audit(request, "companies.update", "company", company.id,
          {"fields": sorted(k for k in data if k in COMPANY_FIELDS)})
    return json_response(serialize_company(company, with_related=True))








############################################################
# _parse_date
############################################################
#
# ISO date or None; anything else is an error string.
#
# Used by:
#   - _apply_credential (below)
############################################################

def _parse_date(value):
    if value in (None, ""):
        return None, None
    if not isinstance(value, str):
        return None, f"{value!r} is not an ISO date"
    try:
        return date.fromisoformat(value), None
    except ValueError:
        return None, f"{value!r} is not an ISO date"








############################################################
# _apply_credential
############################################################
#
# Copies the accepted credential fields onto the row;
# answers an error message or None. Setting status
# "verified" stamps who and when; an evidence document must
# be one of the company's own documents.
#
# Used by:
#   - credentials_collection, credential_item (below)
############################################################

def _apply_credential(request, company, row, data):
    if "kind" in data:
        if data["kind"] not in CREDENTIAL_KINDS:
            return f"kind must be one of {', '.join(CREDENTIAL_KINDS)}"
        row.kind = data["kind"]
    if "name" in data:
        if not isinstance(data["name"], str) or not data["name"].strip():
            return "name is required"
        row.name = data["name"].strip()[:MAX_TEXT_CHARS]
    for wire, column in (("issuer", "issuer"), ("identifier", "identifier")):
        if wire in data:
            if data[wire] is not None and not isinstance(data[wire], str):
                return f"{wire} must be text"
            setattr(row, column, (data[wire] or "").strip()[:MAX_TEXT_CHARS] or None)
    for wire, column in (("scope", "scope"), ("notes", "notes")):
        if wire in data:
            if data[wire] is not None and not isinstance(data[wire], str):
                return f"{wire} must be text"
            setattr(row, column, (data[wire] or "")[:4000])
    for wire, column in (("validFrom", "valid_from"), ("validTo", "valid_to")):
        if wire in data:
            value, error = _parse_date(data[wire])
            if error:
                # The wire name first: the GUI names the field from it
                return f"{wire}: {error}"
            setattr(row, column, value)
    if "evidenceDocumentId" in data:
        document_id = data["evidenceDocumentId"]
        if document_id is None:
            row.evidence_document = None
        else:
            document = CompanyDocument.objects.filter(id=str_id(document_id), company=company).first()
            if document is None:
                return "evidenceDocumentId must be one of this company's documents"
            row.evidence_document = document
    if "status" in data:
        if data["status"] not in CREDENTIAL_STATUSES:
            return f"status must be one of {', '.join(CREDENTIAL_STATUSES)}"
        if data["status"] == "verified" and row.status != "verified":
            row.verified_by, row.verified_at = request.user, utc_now()
        elif data["status"] == "claimed":
            row.verified_by, row.verified_at = None, None
        row.status = data["status"]
    return None








############################################################
# credentials_collection
############################################################
#
# GET  /api/companies/{id}/credentials
# POST /api/companies/{id}/credentials
#
# A new credential is "claimed" unless the body says
# "verified" (a person checked it).
#
# Used by:
#   - the assistant's addCredential tool
#   - CompanyDetail.jsx
############################################################

@methods("GET", "POST")
@require_auth
def credentials_collection(request, company_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        rows = company.credentials.order_by("created_at", "id")
        return json_response({"credentials": [serialize_credential(c) for c in rows]})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    if "kind" not in data or "name" not in data:
        return json_error("kind and name are required", 400, code="MISSING_FIELDS")
    now = utc_now()
    row = CompanyCredential(id=str(uuid.uuid4()), company=company, created_at=now, updated_at=now)
    error = _apply_credential(request, company, row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    row.save()
    company.updated_at = now
    company.save(update_fields=["updated_at"])
    audit(request, "companies.credential_add", "company", company.id,
          {"kind": row.kind, "name": row.name, "status": row.status})
    return json_response(serialize_credential(row), status=201)








############################################################
# credential_item
############################################################
#
# PATCH  /api/companies/{id}/credentials/{cid}
# DELETE /api/companies/{id}/credentials/{cid}
#
# Used by:
#   - the assistant's updateCredential / removeCredential tools
#   - CompanyDetail.jsx
############################################################

@methods("PATCH", "DELETE")
@require_auth
def credential_item(request, company_id, credential_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    row = company.credentials.filter(id=credential_id).first()
    if row is None:
        return json_error("Credential not found", 404, code="NOT_FOUND")

    if request.method == "DELETE":
        row.delete()
        audit(request, "companies.credential_remove", "company", company.id,
              {"credentialId": credential_id, "name": row.name})
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    before = row.status
    error = _apply_credential(request, company, row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    row.updated_at = utc_now()
    row.save()
    audit(request, "companies.credential_update", "company", company.id,
          {"credentialId": row.id, "fields": sorted(data), "status": [before, row.status]})
    return json_response(serialize_credential(row))
