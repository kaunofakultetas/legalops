############################################################
#  [*] companies.indexing — company documents → evidence vectors
#
#  The `documents.index` job (queued after every upload with
#  text) splits a document's extracted text into overlapping
#  windows and embeds them, so the gap analysis can pull the
#  passages that prove — or fail to prove — an obligation,
#  and the assistant can search a company's policies.
#  Embedding is charged to the uploader's daily AI budget
#  like every model call; once that is spent, the job waits
#  for the reset (00:00 UTC) instead of spending past it.
#
#    index_document(document, step_id=None) → chunk count
############################################################


import re
import uuid
from datetime import datetime, time as dtime, timedelta, timezone


from django.conf import settings
from django.db import transaction


from compliance.assistant import gateway
from compliance.assistant.usage import budget_status, record_call
from compliance.common.timestamps import utc_now
from compliance.companies.models import CompanyDocument, CompanyDocumentChunk
from compliance.companies.outline import build_outline, heading_at
from compliance.jobs.queue import enqueue
from compliance.jobs.registry import register

# How long after the budget's reset (00:00 UTC) a deferred
# indexing job comes back
RESUME_AFTER_RESET = timedelta(minutes=5)

# Window size and overlap in characters (~450 / ~50 tokens)
WINDOW_CHARS = 1800
OVERLAP_CHARS = 200








############################################################
# split_windows
############################################################
#
# (char_start, text) windows on paragraph boundaries where
# possible, each overlapping the previous one a little so a
# requirement spanning a boundary is still found whole.
#
# Used by:
#   - index_document (below)
############################################################

def split_windows(text):
    windows, start = [], 0
    length = len(text)
    while start < length:
        end = min(length, start + WINDOW_CHARS)
        if end < length:
            cut = text.rfind("\n", start + WINDOW_CHARS // 2, end)
            if cut == -1:
                cut = max(text.rfind(". ", start + WINDOW_CHARS // 2, end) + 1, 0)
            end = cut if cut > start else end
        piece = text[start:end].strip()
        if piece:
            windows.append((start, piece))
        if end >= length:
            break
        start = max(end - OVERLAP_CHARS, start + 1)
    return windows








############################################################
# index_document
############################################################
#
# Replaces the document's chunks with fresh ones and embeds
# them; stamps indexed_at. Offsets stay those of the stored
# text (whitespace is squeezed per window, never before
# splitting), so a chunk's char_start opens the same place
# in /text; each chunk carries its section heading from the
# outline. Documents without text index to zero chunks.
#
# Used by:
#   - index (below) — the job
#   - analysis/pipeline.py — documents not indexed yet
############################################################

def index_document(document, step_id=None, user_id=None):
    text = document.text or ""
    outline = document.outline or build_outline(text)
    windows = split_windows(text)
    chunks = [CompanyDocumentChunk(id=str(uuid.uuid4()), document=document, ordinal=i, char_start=start,
                                   heading=heading_at(outline, start)[:300], text=re.sub(r"[ \t]+", " ", piece))
              for i, (start, piece) in enumerate(windows)]
    for begin in range(0, len(chunks), 64):
        batch = chunks[begin:begin + 64]
        result = gateway.embed([f"{document.title}\n{c.heading}\n{c.text}" for c in batch],
                               model=settings.AI_EMBED_MODEL)
        for chunk, vector in zip(batch, result.embeddings):
            chunk.embedding = vector
        record_call(kind="embed", purpose="documents.embed", model=result.model, input_tokens=result.tokens,
                    duration_ms=result.duration_ms, job_step_id=step_id, user_id=user_id)
    with transaction.atomic():
        CompanyDocumentChunk.objects.filter(document=document).delete()
        CompanyDocumentChunk.objects.bulk_create(chunks, batch_size=200)
        CompanyDocument.objects.filter(id=document.id).update(indexed_at=utc_now(), outline=outline)
    return len(chunks)








############################################################
# index
############################################################
#
# The `documents.index` job. Payload: {document_id}. A
# document deleted meanwhile ends the job quietly. When the
# uploader's daily AI budget is spent, nothing is embedded:
# the same job is queued again for just after the reset and
# this one answers {waitingForBudget, resumesAt} — without
# it, uploading and deleting in a loop would embed (and
# charge the gateway) without end. An unlimited budget (0,
# the admins' default) never waits.
#
# Used by:
#   - companies/api/document_views.py — after an upload
############################################################

@register("documents.index", max_attempts=3)
def index(job, ctx):
    document = CompanyDocument.objects.filter(id=job.payload["document_id"]).first()
    if document is None:
        return {"skipped": "document deleted"}
    if job.created_by_id and budget_status(job.created_by_id)["remaining"] == 0:
        tomorrow = datetime.combine(utc_now().date() + timedelta(days=1), dtime.min, tzinfo=timezone.utc)
        resumes = tomorrow + RESUME_AFTER_RESET
        enqueue("documents.index", job.payload, subject=job.subject, created_by_id=job.created_by_id,
                priority=job.priority, run_after=resumes)
        return {"waitingForBudget": True, "resumesAt": resumes.isoformat()}
    with ctx.step("embed", input_ref={"document": document.id}) as step:
        count = index_document(document, step_id=step.row.id, user_id=job.created_by_id)
        step.output = {"chunks": count}
    return {"chunks": count}
