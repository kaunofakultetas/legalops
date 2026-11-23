############################################################
#  [*] companies.search — find passages in company documents
#
#    search_documents(documents, query, k=8) → [hit, ...]
#
#  The same hybrid as the corpus search (corpus/search.py):
#  the query's embedding against the chunk vectors (cosine)
#  and Postgres full-text search, merged by reciprocal rank
#  fusion — the vector half finds paraphrases, the text half
#  finds the exact register name or section number. The
#  caller passes the documents the user may see; the vector
#  half degrades to text-only when the gateway is down.
############################################################


import logging


from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from pgvector.django import CosineDistance


from compliance.assistant import gateway
from compliance.companies.models import CompanyDocumentChunk


logger = logging.getLogger(__name__)

RRF_K = 60
CANDIDATES = 40
MAX_HIT_CHARS = 2_000








############################################################
# _hit
############################################################
#
# The wire shape of one passage.
#
# Used by:
#   - search_documents (below)
############################################################

def _hit(chunk, score):
    document = chunk.document
    return {
        "documentId": document.id,
        "title": document.title,
        "companyId": document.company_id,
        "chunkId": chunk.id,
        "heading": chunk.heading,
        "charStart": chunk.char_start,
        "text": chunk.text[:MAX_HIT_CHARS],
        "score": round(score, 5),
    }








############################################################
# search_documents
############################################################
#
# Hybrid retrieval over the chunks of `documents` (a
# CompanyDocument queryset — the tenancy filter is the
# caller's). k is clamped to 1..30.
#
# Used by:
#   - companies/api/document_views.py — search
############################################################

def search_documents(documents, query, k=8):
    query = (query or "").strip()
    if not query:
        return []
    k = max(1, min(int(k), 30))
    base = CompanyDocumentChunk.objects.filter(document__in=documents).select_related("document")
    scores, chunks = {}, {}


    # STEP 1: the vector half
    # =======================
    try:
        vector = gateway.embed([query]).embeddings[0]
    except (gateway.GatewayError, IndexError) as exc:
        logger.warning("Document search runs text-only: %s", exc)
        vector = None
    if vector is not None:
        nearest = base.filter(embedding__isnull=False).annotate(
            distance=CosineDistance("embedding", vector)).order_by("distance")[:CANDIDATES]
        for rank, chunk in enumerate(nearest):
            chunks[chunk.id] = chunk
            scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (RRF_K + rank + 1)


    # STEP 2: the full-text half
    # ==========================
    # The @@ filter on the indexed expression first (the GIN
    # index answers it), ts_rank only for the rows it matched
    search = SearchQuery(query, config="simple", search_type="websearch")
    text_vector = SearchVector("text", config="simple")
    matched = base.annotate(matchable=text_vector).filter(matchable=search).annotate(
        rank=SearchRank(text_vector, search)).order_by("-rank")[:CANDIDATES]
    for rank, chunk in enumerate(matched):
        chunks[chunk.id] = chunk
        scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (RRF_K + rank + 1)

    best = sorted(scores, key=scores.get, reverse=True)[:k]
    return [_hit(chunks[chunk_id], scores[chunk_id]) for chunk_id in best]
