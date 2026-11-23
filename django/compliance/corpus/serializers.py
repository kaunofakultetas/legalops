############################################################
#  [*] corpus — the wire shapes
############################################################








############################################################
# serialize_version
############################################################
#
# One version's state and counts; never its text.
#
# Used by:
#   - serialize_document (below)
############################################################

def serialize_version(version):
    if version is None:
        return None
    return {
        "id": version.id,
        "versionNo": version.version_no,
        "status": version.status,
        "error": version.error,
        "contentType": version.content_type,
        "sourceUrl": version.source_url,
        "effectiveDate": version.effective_date,
        "label": version.label,
        "parser": version.parser,
        "obligationsExtractedAt": version.obligations_extracted_at,
        "charCount": version.char_count,
        "unitCount": version.unit_count,
        "articleCount": version.article_count,
        "chunkCount": version.chunk_count,
        "embedModel": version.embed_model,
        "contentHash": version.content_hash,
        "createdAt": version.created_at,
    }








############################################################
# serialize_document
############################################################
#
# The catalogue row with its current version; the detail
# route adds every version and the latest ingest job.
#
# Used by:
#   - corpus/api/views.py
############################################################

def serialize_document(document, with_versions=False, latest_job=None, obligation_count=None):
    data = {
        "id": document.id,
        "slug": document.slug,
        "title": document.title,
        "titleEn": document.title_en,
        "shortTitle": document.short_title,
        "jurisdiction": document.jurisdiction,
        "docType": document.doc_type,
        "sourceKind": document.source_kind,
        "externalId": document.external_id,
        "sourceUrl": document.source_url,
        "language": document.language,
        "domains": document.domains,
        "appliesTo": document.applies_to,
        "applicabilityNotes": document.applicability_notes,
        "status": document.status,
        "enabled": document.enabled,
        "currentVersion": serialize_version(document.current_version) if document.current_version_id else None,
        "lastCheckedAt": document.last_checked_at,
        "lastError": document.last_error,
        "createdAt": document.created_at,
        "updatedAt": document.updated_at,
    }
    if obligation_count is not None:
        data["obligationCount"] = obligation_count
    if with_versions:
        data["versions"] = [serialize_version(v) for v in document.versions.defer("text").order_by("-version_no")]
        # What the models read from the current version's own text — whom the act
        # covers (corpus/scope.py), what a breach can cost (corpus/sanctions.py) —
        # each with the note the model left for a reader; None until it is read
        version = document.current_version if document.current_version_id else None
        scope, sanctions = (version.scope, version.sanctions) if version is not None else (None, None)
        data["scopeReading"] = {"types": scope.get("types") or [], "reasoning": scope.get("reasoning") or "",
                                "readAt": scope.get("readAt")} if scope else None
        data["sanctionsReading"] = {"tiers": len(sanctions.get("tiers") or []), "note": sanctions.get("note") or "",
                                    "readAt": sanctions.get("readAt")} if sanctions else None
    if latest_job is not None:
        from compliance.jobs.queue import serialize_job
        data["latestJob"] = serialize_job(latest_job)
    return data








############################################################
# serialize_unit
############################################################
#
# One provision; `preview=True` trims the text for tree
# listings.
#
# Used by:
#   - corpus/api/views.py — units, unit
############################################################

def serialize_unit(unit, preview=False):
    text = unit.text
    return {
        "id": unit.id,
        "versionId": unit.version_id,
        "parentId": unit.parent_id,
        "ordinal": unit.ordinal,
        "depth": unit.depth,
        "unitType": unit.unit_type,
        "number": unit.number,
        "path": unit.path,
        "heading": unit.heading,
        "text": (text[:280] + "…") if preview and len(text) > 280 else text,
    }
