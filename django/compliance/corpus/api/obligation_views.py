############################################################
#  [*] Obligations API — review of extracted duties
#
#    GET    /api/obligations?document=&status=&category=&q=   → {obligations}
#    POST   /api/obligations                                   a "standard" obligation (admin)
#    GET    /api/obligations/{id}
#    PATCH  /api/obligations/{id}   {status?, title?, text?, …} (admin)
#    DELETE /api/obligations/{id}                              (admin)
#    POST   /api/obligations/review  {ids, status}             bulk approve / reject (admin)
#    POST   /api/corpus/documents/{id}/extract-obligations     → job (admin)
#    POST   /api/corpus/documents/{id}/verify-obligations {again?} → job (admin)
#
#  The model PROPOSES obligations; an admin approves, edits or
#  rejects them. Approved rows survive re-extraction, rejected
#  ones never reach a report and are not proposed again.
#  Every change is audited; an edited text is re-embedded.
############################################################


import uuid


from django.db.models import Case, IntegerField, When


from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods, query_int, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.models import INSTITUTION_TYPES
from compliance.corpus.models import (
    OBLIGATION_CATEGORIES, OBLIGATION_STATUSES, SEVERITIES, LegalDocument, Obligation,
)
from compliance.corpus.verify import VERDICTS
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue, serialize_job
from compliance.users.auth import require_auth, require_role

APPLIES_TO = set(INSTITUTION_TYPES) | {"all"}
EDITABLE = {"title": "title", "titleEn": "title_en", "text": "text", "textEn": "text_en", "addressee": "addressee",
            "conditions": "conditions", "evidence": "evidence", "deadline": "deadline", "notes": "notes"}

# Characters per edited field — a duty is a sentence or a
# paragraph, and every report prompt carries it
MAX_TITLE_CHARS = 1_000
MAX_FIELD_CHARS = 20_000








############################################################
# serialize_obligation
############################################################
#
# Used by:
#   - every route in this file
############################################################

def serialize_obligation(row):
    return {
        "id": row.id,
        "sourceKind": row.source_kind,
        "documentId": row.document_id,
        "documentTitle": row.document.short_title or row.document.title if row.document_id else None,
        "versionId": row.version_id,
        "unitId": row.unit_id,
        "title": row.title,
        "titleEn": row.title_en,
        "text": row.text,
        "textEn": row.text_en,
        "addressee": row.addressee,
        "conditions": row.conditions,
        "appliesTo": row.applies_to,
        "category": row.category,
        "evidence": row.evidence,
        "deadline": row.deadline,
        "severity": row.severity,
        "citations": row.citations,
        "status": row.status,
        "model": row.model,
        "notes": row.notes,
        "verification": row.verification,
        "reviewedBy": row.reviewed_by_id,
        "reviewedAt": row.reviewed_at,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }








############################################################
# _apply
############################################################
#
# Validated wire fields → the row; answers an error or None
# and whether the text changed (re-embed).
#
# Used by:
#   - obligations_collection, obligation_item (below)
############################################################

def _apply(row, data):
    text_changed = False
    for wire, column in EDITABLE.items():
        if wire in data:
            if data[wire] is not None and not isinstance(data[wire], str):
                return f"{wire} must be text", False
            value = (data[wire] or "").strip()
            limit = MAX_TITLE_CHARS if wire in ("title", "titleEn") else MAX_FIELD_CHARS
            if len(value) > limit:
                return f"{wire} is limited to {limit} characters", False
            if wire in ("title", "text") and not value:
                return f"{wire} cannot be empty", False
            text_changed |= wire in ("title", "text") and value != getattr(row, column)
            setattr(row, column, value)
    if "category" in data:
        if data["category"] not in OBLIGATION_CATEGORIES:
            return f"category must be one of {', '.join(OBLIGATION_CATEGORIES)}", False
        row.category = data["category"]
    if "severity" in data:
        if data["severity"] not in SEVERITIES:
            return f"severity must be one of {', '.join(SEVERITIES)}", False
        row.severity = data["severity"]
    if "status" in data:
        if data["status"] not in OBLIGATION_STATUSES:
            return f"status must be one of {', '.join(OBLIGATION_STATUSES)}", False
        row.status = data["status"]
    if "appliesTo" in data:
        # Strings first: set() of a nested list or object raises
        # TypeError (a 500), not a refusal
        applies = data["appliesTo"]
        if not isinstance(applies, list) or not all(isinstance(a, str) for a in applies) \
                or not set(applies) <= APPLIES_TO:
            return f"appliesTo must be a list of: {', '.join(sorted(APPLIES_TO))}", False
        row.applies_to = sorted(set(data["appliesTo"]))
    return None, text_changed








############################################################
# obligations_collection
############################################################
#
# GET  /api/obligations?document=&status=&category=&q=&limit=
# POST /api/obligations
#
# Reading covers legal and standard obligations; internal
# (company-specific) ones are listed with their company only.
# `status` takes one state or several with commas between.
#
# Used by:
#   - CorpusDocument.jsx — the obligations tab
#   - the assistant's listObligations tool
############################################################

@methods("GET", "POST")
@require_auth
def obligations_collection(request):
    if request.method == "GET":
        rows = Obligation.objects.select_related("document").exclude(source_kind="internal").order_by(
            "document__short_title", "created_at", "id")
        if request.GET.get("document"):
            rows = rows.filter(document_id=request.GET["document"])
        states = [state for state in request.GET.get("status", "").split(",") if state in OBLIGATION_STATUSES]
        if states:
            rows = rows.filter(status__in=states)
        if request.GET.get("category") in OBLIGATION_CATEGORIES:
            rows = rows.filter(category=request.GET["category"])
        if request.GET.get("q"):
            q = request.GET["q"].strip()[:200]
            rows = rows.filter(title__icontains=q) | rows.filter(text__icontains=q)
        # What the judge made of an obligation (corpus/verify.py):
        # one verdict, "doubt" for the two that need a person's
        # eye, "unchecked" for those never judged
        verdict = request.GET.get("verification")
        if verdict in VERDICTS:
            rows = rows.filter(verification__verdict=verdict)
        elif verdict == "doubt":
            rows = rows.filter(verification__verdict__in=("unsupported", "partly"))
        elif verdict == "unchecked":
            rows = rows.filter(verification__isnull=True)
        # order=review: where a reviewer should start — the
        # obligations the judge doubts, the gravest first
        if request.GET.get("order") == "review":
            rows = rows.annotate(
                doubt=Case(When(verification__verdict="unsupported", then=0), When(verification__verdict="partly", then=1),
                           When(verification__isnull=True, then=2), default=3, output_field=IntegerField()),
                weight=Case(*[When(severity=name, then=rank) for rank, name in enumerate(SEVERITIES)],
                            default=len(SEVERITIES), output_field=IntegerField()),
            ).order_by("doubt", "weight", "document__short_title", "created_at", "id")
        limit = query_int(request, "limit", 500, 1, 2000)
        offset = query_int(request, "offset", 0, 0, 10_000_000)
        if limit is None or offset is None:
            return json_error("limit must be 1..2000 and offset ≥ 0", 400, code="INVALID_QUERY")
        return json_response({"obligations": [serialize_obligation(r) for r in rows[offset:offset + limit]],
                              "total": rows.count()})

    if request.user.role != "admin":
        return json_error("Insufficient role", 403, code="FORBIDDEN")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    now = utc_now()
    row = Obligation(id=str(uuid.uuid4()), source_kind="standard", status="approved", reviewed_by=request.user,
                     reviewed_at=now, created_at=now, updated_at=now, applies_to=["all"])
    if data.get("documentId"):
        row.document = LegalDocument.objects.filter(id=str_id(data["documentId"])).first()
        if row.document is None:
            return json_error("Document not found", 404, code="NOT_FOUND")
        row.version_id = row.document.current_version_id
    if not isinstance(data.get("title"), str) or not data["title"].strip() \
            or not isinstance(data.get("text"), str) or not data["text"].strip():
        return json_error("title and text are required", 400, code="MISSING_FIELDS")
    error, _ = _apply(row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    row.save()
    _reembed(row)
    audit(request, "obligations.create", "obligation", row.id, {"title": row.title})
    return json_response(serialize_obligation(row), status=201)








############################################################
# _reembed
############################################################
#
# Refreshes one obligation's vector after its text changed;
# a gateway failure leaves the old vector (logged), it never
# fails the edit.
#
# Used by:
#   - obligations_collection, obligation_item (above/below)
############################################################

def _reembed(row):
    from compliance.corpus.obligations import embed_obligations

    try:
        embed_obligations([row])
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Re-embedding obligation %s failed", row.id)








############################################################
# obligation_item
############################################################
#
# GET    /api/obligations/{id}
# PATCH  /api/obligations/{id}
# DELETE /api/obligations/{id}
#
# A PATCH that sets status stamps the reviewer.
#
# Used by:
#   - CorpusDocument.jsx — approve / reject / edit
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def obligation_item(request, obligation_id):
    row = Obligation.objects.select_related("document").filter(id=obligation_id).exclude(source_kind="internal").first()
    if row is None:
        return json_error("Obligation not found", 404, code="NOT_FOUND")
    if request.method == "GET":
        return json_response(serialize_obligation(row))
    if request.user.role != "admin":
        return json_error("Insufficient role", 403, code="FORBIDDEN")
    if request.method == "DELETE":
        row.delete()
        audit(request, "obligations.delete", "obligation", obligation_id, {"title": row.title})
        return json_response({"ok": True})
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    error, text_changed = _apply(row, data)
    if error:
        return json_error(error, 400, code="INVALID_FIELD")
    if "status" in data:
        row.reviewed_by, row.reviewed_at = request.user, utc_now()
    if text_changed:
        # The judge read other words
        row.verification = None
    row.updated_at = utc_now()
    row.save()
    if text_changed:
        _reembed(row)
    audit(request, "obligations.update", "obligation", row.id, {"fields": sorted(data.keys()), "status": row.status})
    return json_response(serialize_obligation(row))








############################################################
# review
############################################################
#
# POST /api/obligations/review  {ids: [...], status}
#
# The review queue's bulk action: up to 500 obligations set
# to approved / rejected / proposed at once, each stamped
# with the reviewer; one audit row lists them.
#
# Used by:
#   - Obligations.jsx — the bulk buttons
############################################################

@methods("POST")
@require_role("admin")
def review(request):
    data = get_json_object(request)
    ids = data.get("ids") if data else None
    status = data.get("status") if data else None
    if not isinstance(ids, list) or not 0 < len(ids) <= 500 or not all(str_id(i) for i in ids):
        return json_error("ids must be a list of 1..500 obligation ids", 400, code="INVALID_FIELD")
    if status not in OBLIGATION_STATUSES:
        return json_error(f"status must be one of {', '.join(OBLIGATION_STATUSES)}", 400, code="INVALID_FIELD")
    now = utc_now()
    updated = Obligation.objects.filter(id__in=ids).exclude(source_kind="internal").update(
        status=status, reviewed_by=request.user, reviewed_at=now, updated_at=now)
    audit(request, "obligations.review", "obligation", None, {"status": status, "count": updated, "ids": ids[:500]})
    return json_response({"updated": updated, "status": status})








############################################################
# extract
############################################################
#
# POST /api/corpus/documents/{id}/extract-obligations  {language?}
#
# Queues extraction for the act's current version; answers
# the running job instead when one is already underway.
#
# Used by:
#   - CorpusDocument.jsx — the extract button
############################################################

@methods("POST")
@require_role("admin")
def extract(request, document_id):
    document = LegalDocument.objects.filter(id=document_id).first()
    if document is None:
        return json_error("Document not found", 404, code="NOT_FOUND")
    if document.current_version_id is None:
        return json_error("Ingest the act first", 409, code="NOT_INGESTED")
    subject = f"obligations:{document.id}"
    active = Job.objects.filter(subject=subject, status__in=("queued", "running")).first()
    if active is not None:
        return json_response(serialize_job(active), status=202)
    data = get_json_object(request) or {}
    language = "English" if data.get("language") == "en" else "Lithuanian"
    job = enqueue("corpus.extract_obligations", {"document_id": document.id, "language": language}, subject=subject,
                  created_by=request.user)
    audit(request, "obligations.extract", "legal_document", document.id)
    return json_response(serialize_job(job), status=202)








############################################################
# verify
############################################################
#
# POST /api/corpus/documents/{id}/verify-obligations  {again?}
#
# Queues the judge for the act's current version: every
# obligation not yet judged — all of them with `again` — is
# compared with the provisions it cites (corpus/verify.py).
# Answers the running job instead when one is underway.
#
# Used by:
#   - CorpusDocument.jsx — "Patikrinti pareigas" in the menu
#     of the act's page
############################################################

@methods("POST")
@require_role("admin")
def verify(request, document_id):
    document = LegalDocument.objects.filter(id=document_id).first()
    if document is None:
        return json_error("Document not found", 404, code="NOT_FOUND")
    if document.current_version_id is None:
        return json_error("Ingest the act first", 409, code="NOT_INGESTED")
    data = get_json_object(request) or {}
    again = data.get("again", False)
    if not isinstance(again, bool):
        return json_error("again must be true or false", 400, code="INVALID_FIELD")
    subject = f"verification:{document.id}"
    active = Job.objects.filter(subject=subject, status__in=("queued", "running")).first()
    if active is not None:
        return json_response(serialize_job(active), status=202)
    job = enqueue("corpus.verify_obligations", {"document_id": document.id, "again": again}, subject=subject,
                  created_by=request.user)
    audit(request, "obligations.verify", "legal_document", document.id, {"again": again})
    return json_response(serialize_job(job), status=202)

