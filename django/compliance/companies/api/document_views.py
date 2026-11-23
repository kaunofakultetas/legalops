############################################################
#  [*] Documents API — uploads and their text
#
#    GET    /api/documents?companyId=&q=&scope=own&limit=&offset=  → {documents, total}
#    POST   /api/documents                     multipart: file, companyId?, title?, kind?
#    GET    /api/documents/search?q=&companyId=&documentIds=&scope=own&k=  → {hits}
#    GET    /api/documents/{id}                → metadata + outline + inventory
#    PATCH  /api/documents/{id}                {companyId?, title?, kind?}
#    DELETE /api/documents/{id}
#    GET    /api/documents/{id}/text?offset=&limit=  → {text, offset, limit, total}
#
#  A file is stored under UPLOAD_DIR/documents and its text
#  extracted at upload in a resource-limited child process
#  (common/sandbox.py). Documents are owned by the uploader; a
#  company can be attached at upload or later (the chat drops
#  files before a profile exists). The worker then builds the
#  evidence index (documents.index).
############################################################


import hashlib
import logging
import os
import re
import uuid


from django.conf import settings
from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import Substr


from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods, query_int, str_id
from compliance.common.sandbox import extract_text_sandboxed
from compliance.common.timestamps import utc_now
from compliance.companies.api.company_views import visible_companies
from compliance.companies.models import DOCUMENT_KINDS, CompanyDocument
from compliance.companies.outline import build_outline
from compliance.companies.search import search_documents
from compliance.companies.serializers import serialize_document
from compliance.jobs.queue import enqueue
from compliance.users.auth import require_auth


logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 50 * 1024 * 1024
DEFAULT_TEXT_WINDOW = 20_000
MAX_TEXT_WINDOW = 100_000
MAX_LISTED = 500

# The stored file is <uuid><extension>; an extension that is
# not a plain short one (".t xt", ".<script>") is dropped —
# Django already strips directories from upload names
SAFE_EXTENSION = re.compile(r"^\.[a-z0-9]{1,9}\Z")
QUOTA_MESSAGE = "Your document storage quota is used up — delete documents you no longer need"








############################################################
# visible_documents
############################################################
#
# The tenancy rule for documents: own rows, all for admins.
#
# Used by:
#   - every route in this file
############################################################

def visible_documents(request):
    rows = CompanyDocument.objects.all()
    if request.user.role != "admin":
        rows = rows.filter(owner=request.user)
    return rows








############################################################
# _resolve_company
############################################################
#
# companyId → a visible Company, None for an empty id, or an
# error response for an id the caller may not use.
#
# Used by:
#   - documents_collection, document_item (below)
############################################################

def _resolve_company(request, company_id):
    if not company_id:
        return None, None
    company = visible_companies(request).filter(id=str_id(company_id)).first()
    if company is None:
        return None, json_error("Company not found", 404, code="NOT_FOUND")
    return company, None








############################################################
# _store_upload
############################################################
#
# Writes the bytes, extracts the text and creates the row —
# outside any transaction (the extraction may take a minute),
# the INSERT in autocommit; a failure after the file landed
# removes the file again. Answers the row.
#
# Used by:
#   - documents_collection (below)
############################################################

def _store_upload(request, upload, company, kind, title):
    data = upload.read()
    digest = hashlib.sha256(data).hexdigest()
    document_id = str(uuid.uuid4())
    ext = os.path.splitext(upload.name or "")[1].lower()
    ext = ext if SAFE_EXTENSION.match(ext) else ""
    directory = os.path.join(settings.UPLOAD_DIR, "documents")
    os.makedirs(directory, exist_ok=True)
    file_path = os.path.join(directory, f"{document_id}{ext}")
    with open(file_path, "wb") as handle:
        handle.write(data)
    try:
        text, error = extract_text_sandboxed(data, upload.name, upload.content_type, timeout=60)
        if error == "unsupported":
            status, error_text = "failed", "Unsupported file type"
        elif error:
            status, error_text = "failed", error
        elif not text:
            status, error_text = "empty", None
        else:
            status, error_text = "done", None
        return CompanyDocument.objects.create(
            id=document_id, owner=request.user, company=company, title=title, kind=kind,
            file_path=file_path, mime=(upload.content_type or "")[:200] or None, size=len(data), sha256=digest,
            text=text, char_count=len(text), extraction_status=status, extraction_error=error_text,
            outline=build_outline(text), uploaded_at=utc_now(),
        )
    except BaseException:
        _remove_file(file_path)
        raise








############################################################
# _over_quota
############################################################
#
# True when the account's stored documents plus the ones
# about to be added exceed UPLOAD_QUOTA_FILES /
# UPLOAD_QUOTA_BYTES.
#
# Used by:
#   - documents_collection (below)
############################################################

def _over_quota(user, extra_files=0, extra_bytes=0):
    used = CompanyDocument.objects.filter(owner=user).aggregate(files=Count("id"), size=Sum("size"))
    return (used["files"] + extra_files > settings.UPLOAD_QUOTA_FILES
            or (used["size"] or 0) + extra_bytes > settings.UPLOAD_QUOTA_BYTES)








############################################################
# _remove_file
############################################################
#
# Used by:
#   - _store_upload, document_item (this file)
############################################################

def _remove_file(path):
    try:
        os.remove(path)
    except OSError:
        pass








############################################################
# documents_collection
############################################################
#
# GET  /api/documents
# POST /api/documents
#
# An upload beyond the account's quota (UPLOAD_QUOTA_FILES /
# UPLOAD_QUOTA_BYTES) answers 413 QUOTA_EXCEEDED.
#
# The list is newest first, paged (limit ≤ 500), filtered by
# company, a title search and scope=own (an admin's own
# uploads — what the chat assistant lists), and never loads
# the texts. The
# upload stores the bytes, extracts the text and answers with
# the row; the evidence index is queued for the worker. Not
# wrapped in the request transaction: the extraction can take
# a minute and must not hold one open.
#
# Used by:
#   - the chat composer's attachment adapter (upload)
#   - the assistant's listDocuments tool
#   - CompanyDetail.jsx
############################################################

@transaction.non_atomic_requests
@methods("GET", "POST")
@require_auth
def documents_collection(request):
    if request.method == "GET":
        rows = visible_documents(request).defer("text", "outline").order_by("-uploaded_at", "-id")
        if request.GET.get("scope") == "own":
            rows = rows.filter(owner=request.user)
        if request.GET.get("companyId"):
            rows = rows.filter(company_id=request.GET["companyId"])
        if request.GET.get("q", "").strip():
            rows = rows.filter(title__icontains=request.GET["q"].strip())
        limit = query_int(request, "limit", MAX_LISTED, 1, MAX_LISTED)
        offset = query_int(request, "offset", 0, 0, 10_000_000)
        if limit is None or offset is None:
            return json_error(f"limit must be 1..{MAX_LISTED} and offset ≥ 0", 400, code="INVALID_QUERY")
        return json_response({"documents": [serialize_document(d) for d in rows[offset:offset + limit]],
                              "total": rows.count()})


    # STEP 1: the multipart parts
    # ===========================
    upload = request.FILES.get("file")
    if upload is None:
        return json_error("multipart field 'file' is required", 400, code="MISSING_FILE")
    if upload.size > MAX_FILE_BYTES:
        return json_error("File too large", 413, code="FILE_TOO_LARGE")
    if _over_quota(request.user, 1, upload.size):
        return json_error(QUOTA_MESSAGE, 413, code="QUOTA_EXCEEDED")
    company, error = _resolve_company(request, request.POST.get("companyId"))
    if error:
        return error
    kind = request.POST.get("kind") or "other"
    if kind not in DOCUMENT_KINDS:
        return json_error(f"kind must be one of {', '.join(DOCUMENT_KINDS)}", 400, code="INVALID_FIELD")
    title = (request.POST.get("title") or upload.name or "document").replace("\x00", "").strip()[:300] or "document"


    # STEP 2: store, extract, record — then queue the index
    # =====================================================
    row = _store_upload(request, upload, company, kind, title)
    # Concurrent uploads each passed the check above; counted
    # again with the row in place, the upload that tipped the
    # account over is undone (both, when two land together)
    if _over_quota(request.user):
        row.delete()
        _remove_file(row.file_path)
        return json_error(QUOTA_MESSAGE, 413, code="QUOTA_EXCEEDED")
    if row.extraction_status == "done":
        enqueue("documents.index", {"document_id": row.id}, subject=f"document:{row.id}", created_by=request.user,
                priority=5)
    audit(request, "documents.upload", "document", row.id,
          {"title": title, "status": row.extraction_status, "size": row.size})
    return json_response(serialize_document(row), status=201)








############################################################
# search
############################################################
#
# GET /api/documents/search?q=&companyId=&documentIds=a,b&scope=own&k=8
#
# Passages of the caller's documents (admins: all) that match
# the query, with their section heading and offset — the
# assistant cites them as "document §section" and can open
# the text at charStart. scope=own narrows an admin to their
# own uploads, like the list (the assistant's unfiltered
# search).
#
# Used by:
#   - the assistant's searchCompanyDocuments tool
#   - CompanyDetail.jsx — the document search box
############################################################

@methods("GET")
@require_auth
def search(request):
    query = request.GET.get("q", "").strip()
    if not query or len(query) > 1000:
        return json_error("q is required (at most 1000 characters)", 400, code="INVALID_QUERY")
    documents = visible_documents(request).filter(extraction_status="done")
    if request.GET.get("companyId"):
        documents = documents.filter(company_id=request.GET["companyId"])
    if request.GET.get("documentIds"):
        documents = documents.filter(id__in=[d for d in request.GET["documentIds"].split(",")[:50] if d])
    if request.GET.get("scope") == "own":
        documents = documents.filter(owner=request.user)
    k = query_int(request, "k", 8, 1, 30)
    if k is None:
        return json_error("k must be 1..30", 400, code="INVALID_QUERY")
    return json_response({"hits": search_documents(documents, query, k=k)})








############################################################
# document_item
############################################################
#
# GET    /api/documents/{id}
# PATCH  /api/documents/{id}
# DELETE /api/documents/{id}
#
# GET carries the outline (headings with offsets, built on
# first read for documents uploaded before outlines existed)
# and the evidence inventory. PATCH attaches/detaches a
# company (companyId null detaches) and renames or re-kinds;
# DELETE removes the row, and the file once the deletion is
# committed (a rolled-back request keeps both).
#
# Used by:
#   - the assistant's readDocument / attachDocument tools
#   - CompanyDetail.jsx
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def document_item(request, document_id):
    row = visible_documents(request).defer("text").filter(id=document_id).first()
    if row is None:
        return json_error("Document not found", 404, code="NOT_FOUND")

    if request.method == "GET":
        if not row.outline and row.char_count:
            row.outline = build_outline(row.text)
            CompanyDocument.objects.filter(id=row.id).update(outline=row.outline)
        return json_response(serialize_document(row, detail=True))

    if request.method == "DELETE":
        path = row.file_path
        row.delete()
        transaction.on_commit(lambda: _remove_file(path))
        audit(request, "documents.delete", "document", document_id, {"title": row.title})
        return json_response({"ok": True})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    fields = []
    if "companyId" in data:
        company, error = _resolve_company(request, data["companyId"])
        if error:
            return error
        row.company = company
        fields.append("company")
    if "title" in data:
        if not isinstance(data["title"], str) or not data["title"].strip():
            return json_error("title cannot be empty", 400, code="MISSING_FIELDS")
        row.title = data["title"].strip()[:300]
        fields.append("title")
    if "kind" in data:
        if data["kind"] not in DOCUMENT_KINDS:
            return json_error(f"kind must be one of {', '.join(DOCUMENT_KINDS)}", 400, code="INVALID_FIELD")
        row.kind = data["kind"]
        fields.append("kind")
    if not fields:
        return json_error("Nothing to update", 400, code="EMPTY_UPDATE")
    row.save(update_fields=fields)
    audit(request, "documents.update", "document", row.id, {"fields": fields})
    return json_response(serialize_document(row))








############################################################
# document_text
############################################################
#
# GET /api/documents/{id}/text?offset=0&limit=20000
#
# A window of the extracted text, cut in SQL — a 100-page
# policy is never loaded whole to answer 20 000 characters;
# `total` tells the reader when to stop, the outline (on the
# detail route) where to jump.
#
# Used by:
#   - the assistant's readDocument tool
#   - CompanyDetail.jsx — the text viewer
############################################################

@methods("GET")
@require_auth
def document_text(request, document_id):
    offset = query_int(request, "offset", 0, 0, 2_000_000_000)
    limit = query_int(request, "limit", DEFAULT_TEXT_WINDOW, 1, MAX_TEXT_WINDOW)
    if offset is None or limit is None:
        return json_error(f"offset must be ≥ 0 and limit 1..{MAX_TEXT_WINDOW}", 400, code="INVALID_QUERY")
    row = (visible_documents(request).filter(id=document_id)
           .annotate(window=Substr("text", offset + 1, limit))
           .values("id", "title", "char_count", "extraction_status", "window").first())
    if row is None:
        return json_error("Document not found", 404, code="NOT_FOUND")
    return json_response({
        "id": row["id"],
        "title": row["title"],
        "offset": offset,
        "limit": limit,
        "total": row["char_count"],
        "extractionStatus": row["extraction_status"],
        "text": row["window"] or "",
    })
