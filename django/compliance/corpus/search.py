############################################################
#  [*] corpus.search — hybrid retrieval and exact lookup
#
#  Three entries: search_corpus answers the best provisions
#  for a question, find_provision one provision's exact text
#  (an act's article, a standard's clause), resolve_document
#  the act or standard a reference names — by its id, short
#  title, title, CELEX number, or a standard's designation
#  with or without its publisher and year.
#
#  Hybrid search: a vector half (pgvector cosine over chunk
#  embeddings, HNSW) and a keyword half (Postgres full text,
#  'simple' config, websearch syntax), merged by reciprocal
#  rank fusion — the keyword half rescues exact terms and
#  numbers ("03-17", "Article 59") the vector half blurs, the
#  vector half carries Lithuanian inflection the keyword half
#  cannot. Only chunks of each document's CURRENT version of
#  ENABLED documents are searched.
############################################################


import re


from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import F, Q
from pgvector.django import CosineDistance


from compliance.assistant import gateway
from compliance.corpus.links import citation_url
from compliance.corpus.models import JURISDICTIONS, LegalChunk, LegalDocument, LegalUnit
from compliance.corpus.standards import find_clause
from compliance.corpus.structure import number_spellings

# Reciprocal-rank-fusion constant (the usual 60)
RRF_K = 60

# Candidates each half contributes before fusion
CANDIDATES = 40

# The first EU act a reference names by type and number, the
# way documents cite them ("Regulation (EU) 2023/1114",
# "reglamento (ES) Nr. 575/2013", "Directive 2009/110/EC") —
# the catalogue knows EU acts by the CELEX number that maps to
EU_ACT_NUMBER = re.compile(r"(?i)\b(regulation|reglament\w*|directive|direktyv\w*)\b\D{0,30}?(\d{1,4})\s*/\s*(\d{1,4})")

# A standard's designation as references write it: a
# publisher (ISO, IEC, EN… — any of "LST EN ISO/IEC"), the
# number (ETSI writes it in two groups, "303 645"), an
# optional part and an optional year
DESIGNATION = re.compile(
    r"(?i)\b(?:ISO|IEC|EN|LST|ETSI|CEN|CWA|BS|DIN|IEEE|NIST)\b[^\d]{0,12}?"
    r"(\d{3,5}(?: \d{3}(?!\d))?)(?:\s*-\s*(\d{1,3}))?(?:[-\d]*\s*:\s*(\d{4}))?")

# The publishers of a designation that say it is a national
# or European adoption of an international standard, and the
# most years an adoption follows the edition it adopts (EN
# ISO/IEC 27017:2021 adopts the 2015 text; two editions of
# one standard lie further apart)
ADOPTION = re.compile(r"(?i)\b(?:EN|LST|BS|DIN)\b")
ADOPTION_LAG = 6

# What search_corpus's `kind` narrows to
KINDS = ("acts", "standards")

# The shortest catalogue short title a reference may merely
# open with ("MiCA Regulation"); shorter ones ("MĮ", "BĮ")
# are too ambiguous to be recognised that way
MIN_OPENING_SHORT_TITLE = 3








############################################################
# _base_queryset
############################################################
#
# Chunks of current versions of enabled documents, optionally
# narrowed to some documents, a jurisdiction, or a kind — the
# acts or the standards. A document is named as anywhere else
# (resolve_document: its id, slug, short title or CELEX,
# whatever the case); a name that means none narrows to
# nothing.
#
# Used by:
#   - search_corpus (below)
############################################################

def _base_queryset(documents=None, jurisdiction=None, kind=None):
    rows = LegalChunk.objects.filter(document__enabled=True, version_id=F("document__current_version_id"))
    if documents:
        named = (resolve_document(ref) for ref in documents)
        rows = rows.filter(document_id__in={document.id for document in named if document is not None})
    if jurisdiction in JURISDICTIONS:
        rows = rows.filter(document__jurisdiction=jurisdiction)
    if kind == "standards":
        rows = rows.filter(document__doc_type="standard")
    elif kind == "acts":
        rows = rows.exclude(document__doc_type="standard")
    return rows.select_related("document", "unit")








############################################################
# _hit
############################################################
#
# One chunk → the shape every consumer reads (the chat tool,
# the GUI search box, the pipeline's evidence packs).
#
# Used by:
#   - search_corpus, find_provision (below)
############################################################

def _hit(chunk, score):
    document = chunk.document
    return {
        "chunkId": chunk.id,
        "unitId": chunk.unit_id,
        "documentId": document.id,
        "documentSlug": document.slug,
        "documentTitle": document.title,
        "shortTitle": document.short_title or document.title[:60],
        "jurisdiction": document.jurisdiction,
        "docType": document.doc_type,
        "path": chunk.path,
        "heading": chunk.heading,
        "text": chunk.text,
        "sourceUrl": document.source_url,
        "citationUrl": citation_url(document, chunk.unit),
        "score": round(score, 5),
    }








############################################################
# search_corpus
############################################################
#
#   search_corpus("kriptoturto paslaugų teikėjo leidimas", k=6)
#
# `vector` may be passed when the caller already embedded the
# query (batch retrieval in the pipeline); `kind` ("acts" or
# "standards") keeps one of the two. A gateway failure
# degrades to keyword-only instead of failing the search.
#
# Used by:
#   - corpus/api/views.py — POST /api/corpus/search (the
#     console's search and the chat's searchLegalCorpus)
############################################################

def search_corpus(query, k=8, documents=None, jurisdiction=None, vector=None, kind=None):
    query = (query or "").strip()
    if not query:
        return []
    k = max(1, min(int(k), 30))
    base = _base_queryset(documents, jurisdiction, kind)
    scores, chunks = {}, {}


    # STEP 1: the vector half
    # =======================
    if vector is None:
        try:
            vector = gateway.embed([query]).embeddings[0]
        except (gateway.GatewayError, IndexError):
            vector = None
    if vector is not None:
        nearest = base.filter(embedding__isnull=False).annotate(
            distance=CosineDistance("embedding", vector)).order_by("distance")[:CANDIDATES]
        for rank, chunk in enumerate(nearest):
            chunks[chunk.id] = chunk
            scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (RRF_K + rank + 1)


    # STEP 2: the keyword half
    # ========================
    # The @@ filter on the indexed expression first (the GIN
    # index answers it), ts_rank only for the rows it matched
    ts_query = SearchQuery(query, config="simple", search_type="websearch")
    text_vector = SearchVector("text", config="simple")
    keyword = base.annotate(matchable=text_vector).filter(matchable=ts_query).annotate(
        rank=SearchRank(text_vector, ts_query)).order_by("-rank")[:CANDIDATES]
    for rank, chunk in enumerate(keyword):
        chunks.setdefault(chunk.id, chunk)
        scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (RRF_K + rank + 1)


    # STEP 3: fuse and answer
    # =======================
    best = sorted(scores, key=scores.get, reverse=True)[:k]
    return [_hit(chunks[chunk_id], scores[chunk_id]) for chunk_id in best]








############################################################
# _celex_named
############################################################
#
#   _celex_named("Regulation (EU) 2023/1113 (TFR)")  → "32023R1113"
#   _celex_named("Reglamentas (ES) Nr. 575/2013")    → "32013R0575"
#   _celex_named("Directive 2009/110/EC")            → "32009L0110"
#
# The CELEX number of the FIRST EU act the reference names by
# type and number (the year is whichever of the two numbers
# is one — before 2015 the EU wrote "No 575/2013"), or None.
# Only the first counts: a delegated act "supplementing
# Regulation (EU) 2023/1114" is not MiCA.
#
# Used by:
#   - resolve_document (below)
############################################################

def _celex_named(ref):
    match = EU_ACT_NUMBER.search(ref)
    if match is None:
        return None
    kind = "L" if match.group(1).lower().startswith(("directive", "direktyv")) else "R"
    for year, number in ((match.group(2), match.group(3)), (match.group(3), match.group(2))):
        if len(year) == 4 and 1950 <= int(year) <= 2099:
            return f"3{year}{kind}{int(number):04d}"
    return None








############################################################
# _designation
############################################################
#
# The first standard designation in a text, or None: its
# number, part and year — part and year empty when it gives
# none — and whether it names a national or European
# adoption (EN, LST, BS, DIN) rather than the international
# standard itself.
#
# Used by:
#   - _standard_named (below)
############################################################

def _designation(text):
    match = DESIGNATION.search(text or "")
    if not match:
        return None
    adoption = bool(ADOPTION.search(match.group(0)))
    return match.group(1).replace(" ", ""), match.group(2) or "", match.group(3) or "", adoption








############################################################
# _standard_named
############################################################
#
# The standard a reference names by its designation ("ISO
# 27001", "ISO/IEC 27001:2022", "LST EN ISO/IEC 27001:2023"),
# among the given rows. The number must agree, and the part
# when the reference gives one. The year decides between
# editions: with none given the latest wins; a given year
# must be the edition's own — except between an international
# standard and its adoption, which carry different years for
# one text (ISO/IEC 27001:2022 is EN ISO/IEC 27001:2023). The
# adoption is then the first edition of that year or later,
# the international standard the last one up to that year,
# within the years an adoption takes.
# No edition, or two that fit alike → None. A reference
# without such a designation names the one standard whose
# short title opens with it ("PCI DSS" for "PCI DSS v4.0.1").
#
# Used by:
#   - resolve_document (below)
############################################################

def _standard_named(ref, rows):
    wanted = _designation(ref)
    if wanted is None:
        opening = list(rows.filter(doc_type="standard", short_title__istartswith=ref)[:2]) if len(ref) >= 3 else []
        return opening[0] if len(opening) == 1 else None
    number, part, year, adoption = wanted
    exact, across = [], []
    for row in rows.filter(doc_type="standard"):
        own = _designation(row.short_title) or _designation(row.external_id) or _designation(row.title)
        if own is None or own[0] != number or (part and own[1] != part):
            continue
        if not year or own[2] == year:
            exact.append((own[2], row))
        elif own[3] != adoption and own[2] and 0 <= (int(own[2]) - int(year)) * (1 if own[3] else -1) <= ADOPTION_LAG:
            across.append((own[2], row))
    # The latest of the editions that fit; of an adoption named
    # by its international year, the earliest
    editions = sorted(exact or across, key=lambda edition: edition[0],
                      reverse=bool(exact) or adoption)
    if not editions or (len(editions) > 1 and editions[0][0] == editions[1][0]):
        return None
    return editions[0][1]








############################################################
# resolve_document
############################################################
#
# A document among the enabled ones with a current version,
# by (first match wins):
#   1. id, slug, short title, CELEX / TAR number (exact, any
#      letter case)
#   2. a title fragment, when exactly one title holds it
#   3. a standard's designation ("ISO 27001", "ISO/IEC
#      27001:2022") — the latest edition when the reference
#      gives no year
#   4. the CELEX of the first EU act the reference names
#      ("Regulation (EU) 2023/1113 (Transfer of Funds
#      Regulation)") — how company documents cite EU acts
#   5. a short title the reference opens with ("MiCA
#      Regulation", "TFR (Reg. 2023/1113)"), when exactly one
#      does; never one named further in ("Guidelines under
#      MiCA" are not MiCA)
# Steps 3–5 only run when the earlier ones found nothing, so
# a reference that resolved before resolves the same.
#
# Used by:
#   - find_provision (below)
#   - corpus/citations.py — check_citations
############################################################

def resolve_document(ref):
    ref = str(ref or "").strip()
    if not ref:
        return None
    if len(ref) > 300:
        return None
    rows = LegalDocument.objects.filter(enabled=True, current_version__isnull=False)
    found = (rows.filter(id=ref).first() or rows.filter(slug__iexact=ref).first()
             or rows.filter(short_title__iexact=ref).first() or rows.filter(external_id__iexact=ref).first())
    if found is None and len(ref) >= 4:
        titled = list(rows.filter(Q(title__icontains=ref) | Q(title_en__icontains=ref))[:2])
        found = titled[0] if len(titled) == 1 else None
    if found is None:
        found = _standard_named(ref, rows)
    if found is None and _celex_named(ref):
        found = rows.filter(external_id__iexact=_celex_named(ref)).first()
    if found is None:
        opening = ref.casefold()
        if opening.startswith("the "):
            opening = opening[4:].lstrip()
        named = [row_id for row_id, short in rows.exclude(short_title="").values_list("id", "short_title")
                 if len(short) >= MIN_OPENING_SHORT_TITLE and opening.startswith(short.casefold())
                 and not opening[len(short):len(short) + 1].isalnum()]
        found = rows.filter(id=named[0]).first() if len(named) == 1 else None
    return found








############################################################
# find_provision
############################################################
#
# Exact, not semantic: the article (or annex / top-level
# point) with that number in the document's current version,
# narrowed to one paragraph when `paragraph` names it, or to
# one unit type. A standard is looked up by its clauses
# instead (corpus/standards.py find_clause): the number may be
# written as references write it ("clause 6.1.2", "Annex A
# 5.15", "A.5.15"). Answers None when nothing matches.
#
# Used by:
#   - corpus/api/views.py — GET /api/corpus/provision
############################################################

def find_provision(document_ref, number, paragraph=None, unit_type=None):
    document = resolve_document(document_ref)
    if document is None:
        return None
    if document.doc_type == "standard":
        unit = find_clause(document.current_version_id, number, paragraph)
        if unit is None:
            return None
        paragraph = None
    else:
        numbers = number_spellings(re.sub(r"(?i)^(article|art\.?|straipsnis|str\.?)\s*", "", str(number)))
        units = LegalUnit.objects.filter(version_id=document.current_version_id, number__in=numbers)
        unit = units.filter(unit_type=unit_type).first() if unit_type else (
            units.filter(unit_type="article").first() or units.filter(unit_type="annex").first()
            or units.filter(unit_type="point", depth__lte=2).first())
    if unit is None:
        return None
    if paragraph:
        asked = str(paragraph).strip()
        child = LegalUnit.objects.filter(parent=unit, number__in={asked, *number_spellings(asked)}).first()
        if child is not None:
            unit = child
    version = document.current_version
    return {
        "unitId": unit.id,
        "documentId": document.id,
        "documentSlug": document.slug,
        "documentTitle": document.title,
        "shortTitle": document.short_title or document.title[:60],
        "externalId": document.external_id,
        "jurisdiction": document.jurisdiction,
        "docType": document.doc_type,
        "language": document.language,
        "unitType": unit.unit_type,
        "path": unit.path,
        "heading": unit.heading,
        "text": unit.text,
        "versionNo": version.version_no if version else None,
        "versionDate": (version.effective_date or version.created_at.date()) if version else None,
        "sourceUrl": document.source_url,
        "citationUrl": citation_url(document, unit),
    }
