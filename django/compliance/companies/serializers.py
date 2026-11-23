############################################################
#  [*] companies — the wire shapes
#
#  camelCase out, one function per model. The document
#  serializer never carries the text (that is the /text
#  route's job) — only its size; the outline and inventory
#  ride along on the detail route only. A role's sources go
#  out with their documents named by id and title
#  (role_sources).
############################################################


import re


COMPANY_FIELDS = {
    # wire name → column
    "name": "name",
    "registrationCode": "registration_code",
    "country": "country",
    "legalForm": "legal_form",
    "naceCodes": "nace_codes",
    "sector": "sector",
    "sizeCategory": "size_category",
    "employees": "employees",
    "annualTurnoverEur": "annual_turnover_eur",
    "activities": "activities",
    "usesAi": "uses_ai",
    "providesAi": "provides_ai",
    "aiDescription": "ai_description",
    "processesPersonalData": "processes_personal_data",
    "isPublicSector": "is_public_sector",
    "institutionType": "institution_type",
    "financialMarket": "financial_market",
    "attributes": "attributes",
}








############################################################
# serialize_company
############################################################
#
# The profile; the owner's name when the row was loaded with
# select_related("owner") (admin lists); credentials, adopted
# standards, roles and documents ride along when the caller
# asks (the detail route).
#
# Used by:
#   - companies/api/company_views.py
############################################################

def serialize_company(company, with_related=False):
    data = {"id": company.id, "ownerId": company.owner_id}
    owner = company._state.fields_cache.get("owner")
    if owner is not None:
        data["ownerName"] = owner.display_name or owner.email
    for wire, column in COMPANY_FIELDS.items():
        data[wire] = getattr(company, column)
    data["createdAt"] = company.created_at
    data["updatedAt"] = company.updated_at
    if with_related:
        data["credentials"] = [serialize_credential(c) for c in company.credentials.order_by("created_at")]
        data["standards"] = [serialize_standard(s) for s in
                             company.standards.select_related("document").order_by("created_at")]
        titles = list(company.documents.values_list("id", "title"))
        data["roles"] = [serialize_role(r, titles) for r in company.roles.order_by("name")]
        data["documents"] = [serialize_document(d) for d in
                             company.documents.defer("text", "outline").order_by("uploaded_at")]
    return data








############################################################
# serialize_credential
############################################################
#
# Used by:
#   - serialize_company (above)
#   - companies/api/company_views.py — the credential routes
############################################################

def serialize_credential(row):
    return {
        "id": row.id,
        "companyId": row.company_id,
        "kind": row.kind,
        "name": row.name,
        "issuer": row.issuer,
        "identifier": row.identifier,
        "validFrom": row.valid_from,
        "validTo": row.valid_to,
        "scope": row.scope,
        "notes": row.notes,
        "status": row.status,
        "evidenceDocumentId": row.evidence_document_id,
        "verifiedBy": row.verified_by_id,
        "verifiedAt": row.verified_at,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }








############################################################
# serialize_standard
############################################################
#
# An adoption with the standard's designation, title and
# whether it is ready for analysis (enabled, a version
# ingested) — what the company page lists without a second
# request.
#
# Used by:
#   - serialize_company (above)
#   - companies/api/standard_views.py
############################################################

def serialize_standard(row):
    document = row.document
    return {
        "id": row.id,
        "companyId": row.company_id,
        "documentId": row.document_id,
        "shortTitle": document.short_title,
        "title": document.title,
        "ready": document.enabled and document.current_version_id is not None,
        "status": row.status,
        "scope": row.scope,
        "certificateId": row.certificate_id,
        "notes": row.notes,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }








############################################################
# role_sources
############################################################
#
# A role's sources, each with its document named by id AND
# title wherever the company holds that document. A source
# is written with whatever its writer had: the assistant
# often names a document by its title alone, and a role may
# be saved before its documents are attached to the company.
# The console's editor selects a document by its id, so a
# source without one showed an empty box although the
# document stood in the company's list.
#
# `documents` is the company's (id, title) pairs. A source
# whose id is one of them takes that document's present
# title. Otherwise a title that names one — and only one —
# of them, with or without its file extension, takes that
# document's id. Anything else is left as it was written: a
# document the platform does not hold is a source too.
#
# Used by:
#   - serialize_role (below) — what every reader is given
#   - companies/api/role_views.py — what is stored
############################################################

def role_sources(sources, documents):
    titles = dict(documents)
    named, stemmed = {}, {}
    for document_id, title in documents:
        folded = " ".join((title or "").split()).casefold()
        named.setdefault(folded, set()).add(document_id)
        stemmed.setdefault(re.sub(r"\.[a-z0-9]{1,5}$", "", folded), set()).add(document_id)

    resolved = []
    for source in sources or []:
        source = dict(source)
        if source.get("documentId") not in titles:
            folded = " ".join((source.get("title") or "").split()).casefold()
            found = (named.get(folded) or stemmed.get(re.sub(r"\.[a-z0-9]{1,5}$", "", folded)) or ()) if folded else ()
            if len(found) == 1:
                source["documentId"] = next(iter(found))
        if source.get("documentId") in titles:
            source["title"] = titles[source["documentId"]]
        resolved.append(source)
    return resolved








############################################################
# serialize_role
############################################################
#
# `documents` is the (id, title) pairs of the role's company,
# for its sources (role_sources); a caller that serializes
# several roles of one company reads them once and passes
# them, any other leaves them to be read here.
#
# Used by:
#   - serialize_company (above)
#   - companies/api/role_views.py
#   - chat/api/views.py — a thread's role
############################################################

def serialize_role(row, documents=None):
    if documents is None:
        documents = list(row.company.documents.values_list("id", "title"))
    return {
        "id": row.id,
        "companyId": row.company_id,
        "name": row.name,
        "context": row.context,
        "sources": role_sources(row.sources, documents),
        "createdBy": row.created_by_id,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }








############################################################
# serialize_document
############################################################
#
# Metadata only; the text has its own route. `detail` adds
# the outline and the full evidence inventory; lists carry
# the inventory's one-line summary when it is loaded.
#
# Used by:
#   - serialize_company (above)
#   - companies/api/document_views.py
############################################################

def serialize_document(row, detail=False):
    deferred = row.get_deferred_fields()
    data = {
        "id": row.id,
        "ownerId": row.owner_id,
        "companyId": row.company_id,
        "title": row.title,
        "kind": row.kind,
        "mime": row.mime,
        "size": row.size,
        "sha256": row.sha256,
        "charCount": row.char_count,
        "extractionStatus": row.extraction_status,
        "extractionError": row.extraction_error,
        "indexedAt": row.indexed_at,
        "uploadedAt": row.uploaded_at,
    }
    if "inventory" not in deferred:
        inventory = row.inventory or {}
        data["documentType"] = inventory.get("documentType")
        data["inventorySummary"] = inventory.get("summary")
        if detail:
            data["inventory"] = row.inventory
    if detail and "outline" not in deferred:
        data["outline"] = row.outline
    return data
