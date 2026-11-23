############################################################
#  [*] corpus.obligations — an act's duties, extracted once
#
#  The `corpus.extract_obligations` job reads the provisions
#  of an act's current version in batches and asks the model
#  (prompt `corpus.extract_obligations`) for the concrete
#  obligations each batch imposes on regulated entities. A
#  standard goes the same way with its own prompt
#  (`corpus.extract_requirements`): the requirements its
#  clauses set for the organisation that adopts it, stored as
#  obligations of source "standard" that apply to everyone.
#  Guarantees:
#    - every obligation cites provisions of ITS batch — an
#      obligation citing nothing real is dropped
#    - admin-reviewed rows are never touched: approved ones
#      survive, and a new proposal duplicating an approved one
#      (same provision, near-identical title) is skipped;
#      rejected ones are not re-proposed
#    - the previous PROPOSED rows are replaced only when the
#      whole extraction succeeded
#    - a new version of the act (or edition of the standard)
#      inherits the APPROVED rows of earlier versions whose
#      cited provisions kept the same path and text
#      (carry_forward) — a consolidation that changed three
#      articles costs a review of three articles, not of the
#      whole act
#  Every new obligation is embedded (title + text, and its
#  English title + text) so the gap analysis can match it to
#  company evidence written in either language; rows from
#  before the English vectors get them once (embed_english).
#  An act is behind (is_behind) when it was never read, or was
#  read before the prompt version now in force existed; after
#  the prompt or its model changes, the extract_obligations
#  management command queues every act that is behind.
############################################################


import difflib
import logging
import uuid


from django.conf import settings
from django.db import transaction


from compliance.assistant import gateway
from compliance.assistant.llm import run_prompt
from compliance.assistant.usage import record_call
from compliance.common.parallel import parallel_map
from compliance.common.timestamps import utc_now
from compliance.companies.models import INSTITUTION_TYPES
from compliance.corpus.models import (
    OBLIGATION_CATEGORIES, SEVERITIES, LegalDocument, LegalDocumentVersion, LegalUnit, Obligation,
)
from compliance.corpus.standards import requirement_units
from compliance.jobs.registry import register
from compliance.prompts.schemas import FILLED
from compliance.prompts.store import active_version


logger = logging.getLogger(__name__)

# Characters of provisions per model call (~6k tokens)
BATCH_CHARS = 24_000

# A single provision longer than this is truncated in its batch
MAX_PROVISION_CHARS = 60_000

# A chapter or section that numbers none of its text is read
# whole when it holds more than a heading
WHOLE_PART_CHARS = 400

# Title similarity above which a proposal duplicates an
# approved obligation citing the same provision
DUPLICATE_RATIO = 0.75

# What an obligation may be said to apply to: the institution
# types and "all", without "unknown" — a duty has an
# addressee. The model reads the list with the two values
# that are no licence category said in words
APPLIES_TO_VALUES = [kind for kind in INSTITUTION_TYPES if kind != "unknown"] + ["all"]
APPLIES_TO_GLOSSES = {
    "other_financial": "a financial institution of another kind",
    "none": "an addressee that is no financial institution: an ICT provider, a project owner, an authority",
}
APPLIES_TO_WORDS = ", ".join(f"{kind} ({APPLIES_TO_GLOSSES[kind]})" if kind in APPLIES_TO_GLOSSES else kind
                             for kind in APPLIES_TO_VALUES)

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["obligations"],
    "properties": {"obligations": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["title", "titleEn", "text", "textEn", "addressee", "conditions", "appliesTo", "category",
                     "evidence", "deadline", "severity", "provisionRefs"],
        "properties": {
            "title": FILLED,
            "titleEn": FILLED,
            "text": FILLED,
            "textEn": FILLED,
            "addressee": FILLED,
            "conditions": {"type": "string"},
            "appliesTo": {"type": "array", "items": {"type": "string", "enum": APPLIES_TO_VALUES}},
            "category": {"type": "string", "enum": list(OBLIGATION_CATEGORIES)},
            "evidence": FILLED,
            "deadline": {"type": "string"},
            "severity": {"type": "string", "enum": list(SEVERITIES)},
            # An obligation without a provision behind it is discarded
            "provisionRefs": {"type": "array", "minItems": 1, "items": FILLED},
        },
    }}},
}

# A standard's requirements: an obligation's fields without
# appliesTo (a standard binds whoever adopts it), under their
# own name so the model reads them as requirements
_ITEM = SCHEMA["properties"]["obligations"]["items"]
REQUIREMENT_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["requirements"],
    "properties": {"requirements": {"type": "array", "items": {
        **_ITEM,
        "required": [name for name in _ITEM["required"] if name != "appliesTo"],
        "properties": {name: rule for name, rule in _ITEM["properties"].items() if name != "appliesTo"},
    }}},
}

# What differs between reading an act and reading a standard:
# the prompt, the schema and its list, the source recorded
KINDS = {
    "legal": ("corpus.extract_obligations", SCHEMA, "obligations"),
    "standard": ("corpus.extract_requirements", REQUIREMENT_SCHEMA, "requirements"),
}








############################################################
# provisions_of
############################################################
#
# The units obligations are read from, in document order:
# articles and annexes, or — for acts without articles (LB
# resolutions, a supervisor's guidelines) — top-level points,
# and a chapter or section that numbers none of its text (a
# guideline printed without its paragraph numbers) whole; a
# standard's from its clauses that state requirements
# (corpus/standards.py requirement_units).
#
# Used by:
#   - extract_for_document (below)
############################################################

def provisions_of(version):
    units = LegalUnit.objects.filter(version=version).order_by("ordinal")
    if version.document.doc_type == "standard":
        return requirement_units(list(units))
    articles = list(units.filter(unit_type__in=("article", "annex")))
    if any(u.unit_type == "article" for u in articles):
        return articles
    points = list(units.filter(unit_type__in=("point", "annex"), depth__lte=2))
    if not points:
        return articles
    holders = set(units.exclude(parent=None).exclude(unit_type="text").values_list("parent_id", flat=True))
    whole = [unit for unit in units.filter(unit_type__in=("chapter", "section"))
             if unit.id not in holders and len(unit.text) > WHOLE_PART_CHARS]
    return sorted(points + whole, key=lambda unit: unit.ordinal)








############################################################
# batches_of
############################################################
#
# Packs provisions into batches under BATCH_CHARS; each
# provision gets a batch-local ref ("P1", "P2", …).
#
# Used by:
#   - extract_for_document (below)
############################################################

def batches_of(provisions):
    batches, current, size = [], [], 0
    for unit in provisions:
        length = min(len(unit.text), MAX_PROVISION_CHARS)
        if current and size + length > BATCH_CHARS:
            batches.append(current)
            current, size = [], 0
        current.append(unit)
        size += length
    if current:
        batches.append(current)
    return batches








############################################################
# render_batch
############################################################
#
# The user message of one call: the act's (or standard's)
# identity, then each provision in a tagged block with its ref
# and citation path.
#
# Used by:
#   - extract_for_document (below)
############################################################

def render_batch(document, units):
    if document.doc_type == "standard":
        head = (f"Standard: {document.title}\nDesignation: {document.short_title or document.external_id or '-'}\n"
                f"Catalogue note: {document.applicability_notes or '-'}\n\nClauses:\n")
    else:
        head = (f"Act: {document.title}\nShort title: {document.short_title or '-'}\n"
                f"Jurisdiction: {document.jurisdiction}\nType: {document.doc_type}\n"
                f"Catalogue note on scope: {document.applicability_notes or '-'}\n\nProvisions:\n")
    blocks = []
    for index, unit in enumerate(units, 1):
        text = unit.text[:MAX_PROVISION_CHARS]
        blocks.append(f'<provision ref="P{index}" path="{unit.path}">\n{text}\n</provision>')
    return head + "\n\n".join(blocks)








############################################################
# _is_duplicate
############################################################
#
# True when an approved obligation cites one of the same
# units with a near-identical title — or has the title and
# cites no unit any more (its provision went when the
# version was processed again).
#
# Used by:
#   - extract_for_document (below)
############################################################

def _is_duplicate(candidate, unit_ids, approved):
    for row in approved:
        cited = {c.get("unitId") for c in row.citations} - {None}
        if (cited & unit_ids or not cited) and difflib.SequenceMatcher(None, row.title.lower(), candidate.lower()).ratio() >= DUPLICATE_RATIO:
            return True
    return False








############################################################
# embed_obligations
############################################################
#
# (title + text) vectors for the given rows, and the English
# (title_en + text_en) ones where a row has English text, in
# batches of 32 rows (at most 64 texts), one LlmCall per batch.
#
# Used by:
#   - extract_for_document (below)
#   - corpus/api/obligation_views.py — after an admin edit
############################################################

def embed_obligations(rows, job_step_id=None):
    for start in range(0, len(rows), 32):
        batch = rows[start:start + 32]
        english = [r for r in batch if r.title_en or r.text_en]
        texts = [f"{r.title}\n{r.text}" for r in batch] + [f"{r.title_en}\n{r.text_en}" for r in english]
        result = gateway.embed(texts, model=settings.AI_EMBED_MODEL)
        vectors = iter(result.embeddings)
        for row in batch:
            row.embedding = next(vectors)
            row.embedding_en = None
        for row in english:
            row.embedding_en = next(vectors)
        Obligation.objects.bulk_update(batch, ["embedding", "embedding_en"], batch_size=64)
        record_call(kind="embed", purpose="obligations.embed", model=result.model, input_tokens=result.tokens,
                    duration_ms=result.duration_ms, job_step_id=job_step_id)








############################################################
# embed_english
############################################################
#
# The English vectors of rows that have English text but no
# `embedding_en` yet — obligations extracted before it
# existed — filled once, when a report first reads them. One
# LlmCall per 64 rows, charged to nobody: like the extraction
# itself, it is shared corpus work.
#
# Used by:
#   - analysis/pipeline.py — the gap analysis step
############################################################

def embed_english(rows, job_step_id=None):
    missing = [r for r in rows if r.embedding_en is None and (r.title_en or r.text_en)]
    for start in range(0, len(missing), 64):
        batch = missing[start:start + 64]
        result = gateway.embed([f"{r.title_en}\n{r.text_en}" for r in batch], model=settings.AI_EMBED_MODEL)
        for row, vector in zip(batch, result.embeddings):
            row.embedding_en = vector
        Obligation.objects.bulk_update(batch, ["embedding_en"], batch_size=64)
        record_call(kind="embed", purpose="obligations.embed_en", model=result.model, input_tokens=result.tokens,
                    duration_ms=result.duration_ms, job_step_id=job_step_id)
    return len(missing)








############################################################
# _same_text
############################################################
#
# Provision texts equal up to whitespace.
#
# Used by:
#   - carry_forward (below)
############################################################

def _same_text(a, b):
    return " ".join((a or "").split()) == " ".join((b or "").split())








############################################################
# carry_forward
############################################################
#
# Moves approved obligations of earlier versions onto
# `version` when every provision they cite exists there with
# the same path and the same text. Two units may share a
# path — an article and its one unnumbered paragraph, in the
# register's laws — so the provision is the unit of that path
# that holds the same text. Answers the count moved; the rest
# stay on their old version (visible, not used). With
# `source` — an earlier version of the same text — every
# obligation of that version is moved, whatever its state:
# nothing it was read from has changed.
#
# Used by:
#   - extract_for_document (below)
#   - corpus/ingest.py — a version whose text the act has had
#     before
############################################################

def carry_forward(document, version, source=None):
    new_units = {}
    for unit in LegalUnit.objects.filter(version=version).order_by("ordinal"):
        new_units.setdefault(unit.path, []).append(unit)
    moved = 0
    rows = (Obligation.objects.filter(version=source) if source is not None
            else Obligation.objects.filter(document=document, status="approved").exclude(version=version))
    for row in rows:
        old_units = LegalUnit.objects.in_bulk([c.get("unitId") for c in row.citations if c.get("unitId")])
        mapped = []
        for citation in row.citations:
            old = old_units.get(citation.get("unitId"))
            new = old and next((unit for unit in new_units.get(old.path, []) if _same_text(old.text, unit.text)), None)
            if new is None:
                mapped = None
                break
            mapped.append(new)
        if not mapped:
            continue
        row.version, row.unit = version, mapped[0]
        row.citations = [{"unitId": u.id, "path": u.path} for u in mapped]
        row.updated_at = utc_now()
        row.save(update_fields=["version", "unit", "citations", "updated_at"])
        moved += 1
    return moved








############################################################
# extract_for_document
############################################################
#
# The whole extraction of one act or standard (see the file
# header).
# Answers the number of new proposed obligations.
#
# Used by:
#   - extract_obligations (below) — the job
#   - analysis/pipeline.py — acts a report needs that have
#     never been extracted
############################################################

def extract_for_document(document, ctx, user_id=None, step_id=None, language="Lithuanian"):
    version = document.current_version
    if version is None:
        raise RuntimeError(f"{document.slug} has no ingested version yet")
    carried = carry_forward(document, version)
    provisions = provisions_of(version)
    batches = batches_of(provisions)
    source = source_of(document)
    slug, schema, listed = KINDS[source]
    variables = {"LANGUAGE": language, "DOCUMENT_TITLE": document.title,
                 "JURISDICTION": document.jurisdiction, "INSTITUTION_TYPES": APPLIES_TO_WORDS}
    if source == "standard":
        variables = {"LANGUAGE": language, "DOCUMENT_TITLE": document.title,
                     "DESIGNATION": document.short_title or document.external_id or document.title}
    done = {"n": 0}


    # STEP 1: the model reads every batch (a few at a time)
    # =====================================================
    def extract(units):
        ctx.check_cancelled()
        run = run_prompt(slug, render_batch(document, units), schema=schema, schema_name=listed,
                         variables=variables, job_step_id=step_id, user_id=user_id)
        done["n"] += 1
        ctx.progress("extract", int(done["n"] * 90 / max(len(batches), 1)), f"{done['n']}/{len(batches)} batches")
        return units, run

    results = parallel_map(extract, batches, workers=4)


    # STEP 2: keep only cited, non-duplicate proposals
    # ================================================
    approved = list(Obligation.objects.filter(document=document, version=version, status="approved"))
    rejected_titles = set(Obligation.objects.filter(document=document, status="rejected")
                          .values_list("title", flat=True))
    now, rows, dropped = utc_now(), [], 0
    for units, run in results:
        refs = {f"P{i}": unit for i, unit in enumerate(units, 1)}
        for item in (run.object or {}).get(listed, []):
            cited = [refs[r] for r in item.get("provisionRefs", []) if r in refs]
            if not cited or not item.get("title") or not item.get("text"):
                dropped += 1
                continue
            unit_ids = {u.id for u in cited}
            if item["title"] in rejected_titles or _is_duplicate(item["title"], unit_ids, approved):
                dropped += 1
                continue
            rows.append(Obligation(
                id=str(uuid.uuid4()), source_kind=source, document=document, version=version, unit=cited[0],
                title=item["title"][:500], title_en=item.get("titleEn", "")[:500], text=item["text"],
                text_en=item.get("textEn", ""), addressee=item.get("addressee", "")[:500],
                conditions=item.get("conditions", ""),
                applies_to=["all"] if source == "standard" else sorted(set(item.get("appliesTo") or ["all"])),
                category=item.get("category") if item.get("category") in OBLIGATION_CATEGORIES else "other",
                evidence=item.get("evidence", ""), deadline=item.get("deadline", "")[:500],
                severity=item.get("severity") if item.get("severity") in SEVERITIES else "medium",
                citations=[{"unitId": u.id, "path": u.path} for u in cited], status="proposed",
                prompt_version_id=run.version.id, model=run.result.model, created_at=now, updated_at=now,
            ))


    # STEP 3: swap the proposals in one transaction, then embed
    # =========================================================
    with transaction.atomic():
        Obligation.objects.filter(document=document, status="proposed").delete()
        Obligation.objects.bulk_create(rows, batch_size=200)
    ctx.progress("embed", 95, f"{len(rows)} obligations")
    embed_obligations(rows, job_step_id=step_id)
    LegalDocumentVersion.objects.filter(id=version.id).update(obligations_extracted_at=utc_now())
    logger.info("Extracted %d obligations from %s (%d dropped, %d approved carried forward)",
                len(rows), document.slug, dropped, carried)
    return len(rows)








############################################################
# source_of
############################################################
#
# "standard" for a standard, "legal" for every other document
# — the key of KINDS, and the source recorded on the
# obligations read from it.
#
# Used by:
#   - extract_for_document (above), is_behind (below)
#   - management/commands/extract_obligations.py
############################################################

def source_of(document):
    return "standard" if document.doc_type == "standard" else "legal"








############################################################
# is_behind
############################################################
#
# True when the act's current version was never read, or was
# read before the prompt version now in force was written —
# its obligations are then the work of an older prompt or an
# older model. An act or standard without a version is not
# behind: there is nothing to read.
#
# Used by:
#   - extract_obligations (below) — a job of the bulk run
#   - management/commands/extract_obligations.py
############################################################

def is_behind(document):
    version = document.current_version
    if version is None:
        return False
    written = active_version(KINDS[source_of(document)][0]).created_at
    return version.obligations_extracted_at is None or version.obligations_extracted_at < written








############################################################
# extract_obligations
############################################################
#
# The `corpus.extract_obligations` job. Payload:
# {document_id, language?, only_behind?}. A job of the bulk
# run carries only_behind: by the time its turn comes a report
# may have read the act itself, and then nothing is read (or
# paid for) twice — the job ends as skipped.
#
# Used by:
#   - corpus/api/obligation_views.py — the extract button
#   - management/commands/extract_obligations.py — the bulk
#     run
############################################################

@register("corpus.extract_obligations", max_attempts=1)
def extract_obligations(job, ctx):
    document = LegalDocument.objects.select_related("current_version").get(id=job.payload["document_id"])
    if job.payload.get("only_behind") and not is_behind(document):
        return {"skipped": True}
    with ctx.step("extract", input_ref={"document": document.slug}) as step:
        count = extract_for_document(document, ctx, user_id=job.created_by_id, step_id=step.row.id,
                                     language=job.payload.get("language") or "Lithuanian")
        step.output = {"obligations": count}
    return {"obligations": count}
