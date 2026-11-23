############################################################
#  [*] corpus.ingest — fetch → text → structure → vectors
#
#  The `corpus.ingest` job, one act per run:
#
#    1. fetch   — the source's bytes (or the uploaded file of
#                 the version the upload route created); an
#                 unchanged hash or source label (consolidated
#                 CELEX, e-tar edition) ends the run as
#                 "unchanged"
#    2. extract — the provision tree, in the sandbox: the
#                 publication's markup through a structural
#                 parser (corpus/sources) when one knows the
#                 format, else text extraction + the text
#                 structure parser — for a standard,
#                 corpus/outline.py: the clause rules, the
#                 model where they read nothing, the pages
#                 where neither did, so every readable
#                 standard is indexed
#    3. parse   — the tree → LegalUnit rows with citation
#                 paths; a version processed again keeps its
#                 obligations on the provisions of the same
#                 citation
#    4. chunk   — article-level LegalChunk rows (a
#                 standard's: clause-level)
#    5. embed   — batched through the gateway, one LlmCall
#                 row per batch
#    6. activate — the new version becomes current in one
#                 transaction; chunks of older versions are
#                 dropped from the index (their units stay, so
#                 old reports keep their citations)
#
#  Plus `corpus.reembed` (a new embedding model) and
#  `corpus.refresh_all` (the weekly check of every fetchable
#  act). Handlers register from jobs/handlers.py.
############################################################


import hashlib
import logging
import os
import re
import uuid


from django.conf import settings
from django.db import transaction


from compliance.assistant import gateway
from compliance.assistant.llm import run_prompt
from compliance.assistant.usage import record_call
from compliance.common.sandbox import extract_text_sandboxed, parse_structure_sandboxed
from compliance.common.timestamps import utc_now
from compliance.corpus.chunking import build_chunks, build_standard_chunks
from compliance.corpus.fetchers import FetchError, fetch_document
from compliance.corpus.models import LegalChunk, LegalDocument, LegalDocumentVersion, LegalUnit, Obligation
from compliance.corpus.obligations import carry_forward
from compliance.corpus.outline import METHODS, OUTLINE_SCHEMA, OutlineUnavailable, read_standard
from compliance.corpus.sources.bridge import detect_parser, to_parsed_units
from compliance.corpus.standards import without_furniture
from compliance.corpus.structure import citation_path, iter_units, parse_structure
from compliance.jobs.registry import register
from compliance.prompts.store import PromptNotConfigured


logger = logging.getLogger(__name__)

EMBED_BATCH = 64
EXTENSIONS = {"application/pdf": ".pdf", "text/html": ".html", "application/xhtml+xml": ".xhtml",
              "text/plain": ".txt", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"}








############################################################
# store_raw
############################################################
#
# Writes the bytes under UPLOAD_DIR/corpus/<document id>/ and
# answers the path — <version id><extension>, the extension
# kept only when it is a plain short one (a fetched URL's
# last segment is the filename here).
#
# Used by:
#   - ingest (below)
#   - corpus/api/views.py — upload_version
############################################################

def store_raw(document, version_id, raw, filename="", content_type=""):
    ext = os.path.splitext(filename or "")[1].lower()
    if not re.match(r"^\.[a-z0-9]{1,9}\Z", ext):
        ext = EXTENSIONS.get(content_type, ".bin")
    directory = os.path.join(settings.UPLOAD_DIR, "corpus", document.id)
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, f"{version_id}{ext}")
    with open(path, "wb") as handle:
        handle.write(raw)
    return path








############################################################
# next_version_no
############################################################
#
# Used by:
#   - ingest (below)
#   - corpus/api/views.py — upload_version
############################################################

def next_version_no(document):
    last = document.versions.order_by("-version_no").values_list("version_no", flat=True).first()
    return (last or 0) + 1








############################################################
# _fail
############################################################
#
# Records a failed version and the document's last error,
# then raises so the job fails with the same message.
#
# Used by:
#   - ingest (below)
############################################################

def _fail(document, version, message):
    if version is not None:
        LegalDocumentVersion.objects.filter(id=version.id).update(status="failed", error=message[:2000])
    LegalDocument.objects.filter(id=document.id).update(last_error=message[:2000], last_checked_at=utc_now())
    raise RuntimeError(message)








############################################################
# _has_provisions
############################################################
#
# True when a parsed tree holds real content: at least one
# article, point or paragraph, and some 200 characters of
# text — otherwise the structural parser missed the format
# and the text path takes over.
#
# Used by:
#   - ingest (below)
############################################################

def _has_provisions(tree, language):
    kinds = {unit.unit_type for unit, _, _ in iter_units(tree)}
    size = sum(len(unit.full_text(language)) for unit in tree)
    return bool(kinds & {"article", "point", "paragraph"}) and size >= 200








############################################################
# _cited_paths
############################################################
#
# What the obligations of a version cite, as unit id →
# citation path — taken before a version processed again
# loses its units.
#
# Used by:
#   - ingest (below)
############################################################

def _cited_paths(version):
    cited = set()
    for citations, unit_id in Obligation.objects.filter(version=version).values_list("citations", "unit_id"):
        cited.update(c.get("unitId") for c in citations or [] if c.get("unitId"))
        cited.add(unit_id)
    cited.discard(None)
    return dict(LegalUnit.objects.filter(version=version, id__in=cited).values_list("id", "path")) if cited else {}








############################################################
# _relink_obligations
############################################################
#
# Puts the obligations of a version processed again onto its
# new units: each citation goes to the unit of the same
# citation path. An obligation whose provisions are no
# longer there — the structure was read another way — is
# deleted when it was only proposed; a reviewed one stays,
# citing by path alone. Then the version counts as never
# extracted, so its requirements are read from the new
# structure. Answers (relinked, lost).
#
# Used by:
#   - ingest (below)
############################################################

def _relink_obligations(version, old_paths):
    rows = list(Obligation.objects.filter(version=version))
    if not rows:
        return 0, 0
    new = {}
    for unit_id, path in LegalUnit.objects.filter(version=version).order_by("ordinal").values_list("id", "path"):
        new.setdefault(path, unit_id)
    relinked = lost = 0
    for row in rows:
        citations = row.citations or []
        paths = [old_paths.get(c.get("unitId")) or c.get("path") or "" for c in citations]
        if paths and all(path in new for path in paths):
            row.citations = [{**c, "unitId": new[path], "path": path} for c, path in zip(citations, paths)]
            row.unit_id = new[paths[0]]
            relinked += 1
        elif row.status == "proposed":
            row.delete()
            lost += 1
            continue
        else:
            row.citations = [{**{k: v for k, v in c.items() if k != "unitId"}, "path": path}
                             for c, path in zip(citations, paths)]
            row.unit_id = None
            lost += 1
        row.save(update_fields=["unit", "citations"])
    if lost:
        LegalDocumentVersion.objects.filter(id=version.id).update(obligations_extracted_at=None)
    return relinked, lost








############################################################
# write_units
############################################################
#
# The provision tree → LegalUnit rows in document order, with
# parents before children; answers (unit id by ParsedUnit,
# citation path by ParsedUnit, article count — a standard's
# clauses counted as its articles).
#
# Used by:
#   - ingest (below)
############################################################

def write_units(version, tree, language):
    ids, paths, rows, chain = {}, {}, [], []
    articles = 0
    for ordinal, (unit, parent, depth) in enumerate(iter_units(tree)):
        chain = chain[:depth] + [unit]
        unit_id = str(uuid.uuid4())
        ids[id(unit)] = unit_id
        path = unit.path or citation_path(chain, language)
        paths[id(unit)] = path
        articles += unit.unit_type in ("article", "clause")
        rows.append(LegalUnit(
            id=unit_id, version=version, parent_id=ids.get(id(parent)) if parent is not None else None,
            ordinal=ordinal, depth=depth, unit_type=unit.unit_type, number=unit.number[:40], path=path[:200],
            heading=unit.heading[:500], text=unit.full_text(language),
        ))
    LegalUnit.objects.bulk_create(rows, batch_size=500)
    return ids, paths, articles








############################################################
# embed_chunks
############################################################
#
# Embeds the given chunk rows in batches (label + path +
# heading + text, so "MiCA 59 str." is part of what the
# vector means) and saves the vectors; one LlmCall per batch.
# Answers the model id used.
#
# Used by:
#   - ingest (below), reembed (below)
############################################################

def embed_chunks(ctx, document, chunks, step_id=None):
    label = document.short_title or document.title[:80]
    model_used = settings.AI_EMBED_MODEL
    for start in range(0, len(chunks), EMBED_BATCH):
        ctx.check_cancelled()
        batch = chunks[start:start + EMBED_BATCH]
        texts = [f"{label} — {c.path}. {c.heading}\n{c.text}".strip() for c in batch]
        result = gateway.embed(texts, model=settings.AI_EMBED_MODEL)
        if len(result.embeddings) != len(batch):
            raise RuntimeError(f"The gateway answered {len(result.embeddings)} vectors for {len(batch)} texts")
        for chunk, vector in zip(batch, result.embeddings):
            chunk.embedding = vector
        LegalChunk.objects.bulk_update(batch, ["embedding"], batch_size=EMBED_BATCH)
        model_used = result.model or model_used
        record_call(kind="embed", purpose="corpus.embed", model=result.model, input_tokens=result.tokens,
                    duration_ms=result.duration_ms, job_step_id=step_id)
        ctx.progress("embed", int(min(start + EMBED_BATCH, len(chunks)) * 100 / max(len(chunks), 1)),
                     f"{min(start + EMBED_BATCH, len(chunks))}/{len(chunks)} chunks")
    return model_used








############################################################
# version_changes
############################################################
#
# What a new version of an act changed against the one before
# it, article by article: the paths whose text differs, those
# that are new and those that are gone, in the act's order —
# white space aside. An act without articles is compared by
# its top-level points. None for an act's first version.
#
# Used by:
#   - the corpus.ingest job (below), at activation
#   - analysis/register.py — law_changes
############################################################

def version_changes(previous, version):
    if previous is None or previous.id == version.id:
        return None

    def provisions(of):
        units = LegalUnit.objects.filter(version=of).order_by("ordinal")
        rows = list(units.filter(unit_type="article").values_list("path", "text")) \
            or list(units.filter(unit_type="point", depth__lte=2).values_list("path", "text"))
        return {path: " ".join((text or "").split()) for path, text in rows}

    old, new = provisions(previous), provisions(version)
    return {"from": previous.id,
            "changed": [path for path in new if path in old and old[path] != new[path]],
            "added": [path for path in new if path not in old],
            "removed": [path for path in old if path not in new]}








############################################################
# _take_over
############################################################
#
# What was read from an earlier version follows the act to
# `version` when that version held the same text: its
# obligations, whatever their state, each onto the unit of
# the same path and text; what was read of its scope and of
# its sanctions; and the mark that its obligations were
# extracted, when every one of them could follow. A source
# gives a text back — the consolidated version in place again
# after a fetch that had lost it, an act processed once more
# — and nothing read from that text has to be read by a model
# again. Answers the version taken from and the obligations
# moved, or None when the act never had this text.
#
# Used by:
#   - ingest (below)
############################################################

def _take_over(document, version, text):
    plain = " ".join(text.split())
    earlier = LegalDocumentVersion.objects.filter(document=document, status="ready").exclude(id=version.id)
    twin = next((held for held in earlier.order_by("-version_no") if " ".join((held.text or "").split()) == plain), None)
    if twin is None:
        return None
    held = Obligation.objects.filter(version=twin).count()
    moved = carry_forward(document, version, source=twin)
    LegalDocumentVersion.objects.filter(id=version.id).update(
        scope=twin.scope, sanctions=twin.sanctions,
        obligations_extracted_at=twin.obligations_extracted_at if moved == held else None)
    return {"fromVersion": twin.version_no, "obligations": moved}








############################################################
# ingest
############################################################
#
# The `corpus.ingest` job. Payload: {document_id, version_id?
# (an uploaded version waiting to be processed), force?
# (re-process even when the fetched bytes are unchanged),
# structure? (how a standard's structure is read — one of
# corpus/outline.py METHODS; "auto" when absent)}. A fetch
# makes a new version only of a new text: the same bytes or
# the same label end the run at once, and other bytes that
# read as the text in force end it after the reading. A new
# version whose text the act has had before takes over what
# was read from it then (_take_over).
#
# Used by:
#   - corpus/api/views.py — refresh, upload, create
#   - refresh_all (below), corpus/management/commands/seed_corpus.py
############################################################

@register("corpus.ingest", max_attempts=2)
def ingest(job, ctx):
    document = LegalDocument.objects.get(id=job.payload["document_id"])
    version = None


    # STEP 1: the bytes — an uploaded version, or a fetch
    # ===================================================
    with ctx.step("fetch", input_ref={"source": document.source_kind, "url": document.source_url}) as step:
        if job.payload.get("version_id"):
            version = LegalDocumentVersion.objects.get(id=job.payload["version_id"], document=document)
            with open(version.file_path, "rb") as handle:
                raw = handle.read()
            filename, content_type = os.path.basename(version.file_path), version.content_type
            # A standard is read by its clauses, never by an act's
            # structural parser
            parser = "" if document.doc_type == "standard" else (
                version.parser or detect_parser(raw, filename, content_type, document.source_kind))
            LegalDocumentVersion.objects.filter(id=version.id).update(parser=parser or "")
        else:
            try:
                fetched = fetch_document(document)
            except FetchError as exc:
                _fail(document, None, str(exc))
            raw, filename, content_type = fetched.raw, fetched.filename, fetched.content_type
            digest = hashlib.sha256(raw).hexdigest()
            current = document.current_version
            unchanged = current is not None and (
                current.content_hash == digest or (fetched.version_label and current.label == fetched.version_label))
            if unchanged and not job.payload.get("force"):
                LegalDocument.objects.filter(id=document.id).update(last_checked_at=utc_now(), last_error=None)
                step.output = {"unchanged": True, "version": current.version_no, "label": current.label}
                return {"unchanged": True, "version": current.version_no}
            parser = "" if document.doc_type == "standard" else (
                fetched.parser or detect_parser(raw, filename, content_type, document.source_kind))
            version_id = str(uuid.uuid4())
            version = LegalDocumentVersion.objects.create(
                id=version_id, document=document, version_no=next_version_no(document), content_hash=digest,
                file_path=store_raw(document, version_id, raw, filename, content_type),
                content_type=content_type, source_url=fetched.source_url, effective_date=fetched.effective_date,
                label=fetched.version_label[:200], parser=parser or "", status="parsing", created_at=utc_now(),
            )
        step.output = {"version": version.version_no, "bytes": len(raw), "contentType": content_type,
                       "parser": parser or "text"}
    ctx.check_cancelled()


    # Whatever stops the run from here (an error, a cancel, a
    # worker restart) leaves this version failed, never stuck in
    # parsing/embedding — a retry creates a fresh one
    try:
        # STEP 2: the provision tree — from the publication's
        # markup when a structural parser knows it, else from
        # the extracted text; both in the sandbox. A standard's
        # text is read by the clause rules, by the model where
        # they find nothing, by pages where neither does: the
        # model's calls are shared corpus work, charged to
        # nobody
        # =====================================================
        language = document.language if document.language in ("lt", "en") else "lt"
        standard = document.doc_type == "standard"
        method = job.payload.get("structure") if job.payload.get("structure") in METHODS else "auto"
        notes = []
        with ctx.step("extract", input_ref={"parser": "standard" if standard else parser or "text",
                                            **({"structure": method} if standard else {})}) as step:
            LegalDocumentVersion.objects.filter(id=version.id).update(status="parsing")
            tree, used = None, "text"

            def ask(data):
                ctx.check_cancelled()
                try:
                    run = run_prompt("corpus.standard_outline", data, schema=OUTLINE_SCHEMA, schema_name="outline",
                                     variables={"DOCUMENT_TITLE": document.title,
                                                "DESIGNATION": document.short_title or document.external_id or "-"},
                                     job_step_id=step.row.id, user_id=None)
                except (PromptNotConfigured, gateway.GatewayError) as exc:
                    raise OutlineUnavailable(str(exc) or type(exc).__name__) from exc
                return (run.object or {}).get("headings") or []

            if parser:
                parsed, error = parse_structure_sandboxed(raw, parser, timeout=240)
                tree = to_parsed_units(parsed, language) if parsed else None
                if tree is not None and not _has_provisions(tree, language):
                    tree, error = None, "no provisions found"
                if tree is None:
                    logger.warning("Structural parse (%s) of %s failed: %s — falling back to text",
                                   parser, document.slug, error)
                else:
                    used = parser
            if tree is None:
                # The pages are kept apart so that what every page
                # repeats can be removed: a standard's parser does it
                # itself, an act's text is cleaned before it is read
                text, error = extract_text_sandboxed(raw, filename, content_type, timeout=240, pages=True)
                if error or len(text) < 200:
                    _fail(document, version, "Text extraction failed: "
                          + (error or "the document has almost no text — a scanned copy has to be turned into "
                                      "text (OCR) before it is uploaded"))
                if standard:
                    tree, used, notes = read_standard(
                        text, language, method, ask,
                        progress=lambda done, total: ctx.progress("extract", None, f"structure {done}/{total}"))
                    if not tree:
                        _fail(document, version, "Text extraction failed: the document has no text besides what "
                                                 "every page repeats")
                    LegalDocumentVersion.objects.filter(id=version.id).update(parser=used)
                else:
                    text = without_furniture(text)
                    tree = parse_structure(text, language)
            else:
                text = "\n".join(unit.full_text(language) for unit in tree)
            step.output = {"chars": len(text), "parser": used, **({"notes": notes} if notes else {})}
            # A source may issue the edition the corpus holds once
            # more — the register under another edition id — with
            # not a character of its text changed. That is the
            # version in force, not a new one: it keeps its
            # obligations and what was read of its scope and its
            # sanctions, and takes the new label, so that the next
            # check knows the edition at once
            held = None if job.payload.get("version_id") or job.payload.get("force") else document.current_version
            if held is not None and " ".join((held.text or "").split()) == " ".join(text.split()):
                LegalDocumentVersion.objects.filter(id=version.id).delete()
                if os.path.exists(version.file_path):
                    os.remove(version.file_path)
                LegalDocumentVersion.objects.filter(id=held.id).update(label=version.label or held.label)
                LegalDocument.objects.filter(id=document.id).update(last_checked_at=utc_now(), last_error=None)
                step.output = {"unchanged": True, "sameText": True, "version": held.version_no,
                               "label": version.label or held.label}
                return {"unchanged": True, "version": held.version_no}


        # STEP 3: the units
        # =================
        with ctx.step("parse") as step:
            cited = _cited_paths(version)
            LegalUnit.objects.filter(version=version).delete()
            ids, paths, articles = write_units(version, tree, language)
            relinked, lost = _relink_obligations(version, cited)
            step.output = {"units": len(ids), "articles": articles,
                           **({"obligationsRelinked": relinked, "obligationsLost": lost} if relinked or lost else {})}
        ctx.check_cancelled()


        # STEP 4: retrieval chunks
        # ========================
        with ctx.step("chunk") as step:
            LegalChunk.objects.filter(version=version).delete()
            specs = (build_standard_chunks if standard else build_chunks)(tree, language, paths)
            chunks = [LegalChunk(id=str(uuid.uuid4()), version=version, document=document, unit_id=ids[id(spec.unit)],
                                 ordinal=ordinal, path=spec.path[:200], heading=spec.heading[:500], text=spec.text,
                                 char_count=len(spec.text))
                      for ordinal, spec in enumerate(specs)]
            LegalChunk.objects.bulk_create(chunks, batch_size=500)
            step.output = {"chunks": len(chunks)}


        # STEP 5: embeddings
        # ==================
        LegalDocumentVersion.objects.filter(id=version.id).update(status="embedding")
        with ctx.step("embed", model=settings.AI_EMBED_MODEL) as step:
            model_used = embed_chunks(ctx, document, chunks, step.row.id)
            step.output = {"chunks": len(chunks), "model": model_used}


        # STEP 6: activate atomically, noting what the version changed
        # ============================================================
        with transaction.atomic():
            LegalDocumentVersion.objects.filter(id=version.id).update(
                status="ready", error=None, text=text, char_count=len(text), unit_count=len(ids),
                article_count=articles, chunk_count=len(chunks), embed_model=model_used,
                changes=version_changes(LegalDocument.objects.get(id=document.id).current_version, version))
            LegalChunk.objects.filter(document=document).exclude(version=version).delete()
            LegalDocument.objects.filter(id=document.id).update(
                current_version=version, last_checked_at=utc_now(), last_error=None, updated_at=utc_now())
            taken = _take_over(document, version, text)
    except Exception as exc:
        LegalDocumentVersion.objects.filter(id=version.id).exclude(status="ready").update(
            status="failed", error=(str(exc) or type(exc).__name__)[:2000])
        raise
    ctx.progress("done", 100, None)
    return {"version": version.version_no, "units": len(ids), "articles": articles, "chunks": len(chunks),
            **({"parser": used, "notes": notes} if standard else {}), **({"takenOver": taken} if taken else {})}








############################################################
# reembed
############################################################
#
# The `corpus.reembed` job, run after changing AI_EMBED_MODEL:
# every chunk of every current version embedded again with
# today's model — and, unless it names one document, every
# other vector compared with them: the obligations (both
# languages) and the company documents' chunks. Vectors of two
# models cannot be compared, so a switch that left those on
# the old model would quietly break the reports' evidence and
# the obligation matching. The company documents are system
# work, charged to nobody.
#
# Used by:
#   - corpus/api/views.py — reembed
############################################################

@register("corpus.reembed", max_attempts=1)
def reembed(job, ctx):
    # Imported here: both modules sit above the ingestion
    from compliance.companies.indexing import index_document
    from compliance.companies.models import CompanyDocument
    from compliance.corpus.models import Obligation
    from compliance.corpus.obligations import embed_obligations

    documents = LegalDocument.objects.filter(current_version__isnull=False)
    if job.payload.get("document_id"):
        documents = documents.filter(id=job.payload["document_id"])
    total = 0
    for document in documents:
        with ctx.step(f"embed:{document.slug}", model=settings.AI_EMBED_MODEL) as step:
            chunks = list(LegalChunk.objects.filter(version_id=document.current_version_id).order_by("ordinal"))
            model_used = embed_chunks(ctx, document, chunks, step.row.id)
            LegalDocumentVersion.objects.filter(id=document.current_version_id).update(embed_model=model_used)
            step.output = {"chunks": len(chunks)}
            total += len(chunks)
    result = {"documents": documents.count(), "chunks": total}
    if job.payload.get("document_id"):
        return result

    with ctx.step("embed:obligations", model=settings.AI_EMBED_MODEL) as step:
        rows = list(Obligation.objects.order_by("created_at", "id"))
        embed_obligations(rows, job_step_id=step.row.id)
        step.output = {"obligations": len(rows)}
    with ctx.step("embed:company-documents", model=settings.AI_EMBED_MODEL) as step:
        indexed = chunk_count = 0
        for document in CompanyDocument.objects.exclude(text="").order_by("uploaded_at", "id"):
            ctx.check_cancelled()
            chunk_count += index_document(document, step_id=step.row.id)
            indexed += 1
        step.output = {"documents": indexed, "chunks": chunk_count}
    return {**result, "obligations": len(rows), "companyDocuments": indexed, "companyChunks": chunk_count}








############################################################
# refresh_all
############################################################
#
# The `corpus.refresh_all` job: one ingest job per enabled,
# fetchable act (the ingest itself stops early when nothing
# changed). Scheduled weekly by the worker.
#
# Used by:
#   - jobs/schedule.py — the weekly tick
#   - corpus/api/views.py — refresh_all
############################################################

@register("corpus.refresh_all", max_attempts=1)
def refresh_all(job, ctx):
    from compliance.jobs.queue import enqueue

    queued = 0
    for document in LegalDocument.objects.filter(enabled=True).exclude(source_kind="upload"):
        enqueue("corpus.ingest", {"document_id": document.id}, subject=f"corpus:{document.id}",
                created_by_id=job.created_by_id)
        queued += 1
    return {"queued": queued}
