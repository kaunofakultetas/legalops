############################################################
#  [*] analysis — the wire shapes
#
#  A finding's effective status is the reviewer's override
#  when present, else the model's verdict — every consumer
#  (views, exports, the assistant) reads `effectiveStatus`.
#
#  A "passage" evidence entry is a quote from a company
#  document, stored with the place the quote was found at
#  when the report ran ({kind, id, title, quote, start} —
#  start is null when the document does not hold the quote
#  word for word). On the wire it carries documentId and
#  charStart, the place to open the document at. A report
#  made when passages were the document's indexed chunks
#  stored the chunk's ordinal instead ({…, chunk}); its
#  charStart is the chunk's start, resolved from the chunk
#  rows when the report is served — null when the chunk is
#  gone (the document was deleted, or re-indexed into fewer
#  windows).
#
#  An act says what the report did with it (`assessment`,
#  analysis/models.py ASSESSMENTS) and, when it starts to
#  apply later, from when (`appliesFrom`); a finding of such
#  an act carries that date too — it is preparation, not a
#  gap of today.
#
#  A citation-audit row goes out with its `verdict` — the one
#  word its status and heading match add up to (problems
#  first in VERDICTS) — so the GUI, the exports and the stats
#  never re-derive it differently.
############################################################


from compliance.companies.models import CompanyDocumentChunk


# A citation-audit row's verdicts, problems first: the claim
# names the wrong provision, the provision does not exist,
# the claim could not be judged, the act is not in the
# corpus, the reference is right
VERDICTS = ("mismatch", "not_found", "unknown", "act_not_in_corpus", "match")

# The report stats' key for each verdict (stats.citations)
VERDICT_STAT_KEYS = {"match": "match", "mismatch": "mismatch", "not_found": "notFound",
                     "act_not_in_corpus": "notInCorpus", "unknown": "unknown"}








############################################################
# effective_status
############################################################
#
# Used by:
#   - serialize_finding (below), analysis/exports.py
############################################################

def effective_status(finding):
    return finding.override_status or finding.status








############################################################
# citation_verdict
############################################################
#
#   citation_verdict("found", "mismatch")       → "mismatch"
#   citation_verdict("not_found", None)         → "not_found"
#   citation_verdict("act_not_in_corpus", None) → "act_not_in_corpus"
#
# One of VERDICTS: a missing provision or act says so; a
# found one is its heading match (match / mismatch, anything
# else "unknown" — nothing could be judged).
#
# Used by:
#   - serialize_citation (below), analysis/exports.py
#   - analysis/pipeline.py — the audit's order and counts
############################################################

def citation_verdict(status, heading_match):
    if status in ("not_found", "act_not_in_corpus"):
        return status
    return heading_match if heading_match in ("match", "mismatch") else "unknown"








############################################################
# serialize_report
############################################################
#
# The report row; `full=True` adds acts, findings, actions
# and the citation audit's rows (the detail route and the
# exports' data source) and `outdatedActs` — acts that
# received a newer version since the report read them (re-run
# to assess against it). The passages of every finding are
# resolved in one query; a finding of an act assessed as
# preparation carries the date that act applies from. List rows carry only the audit's
# counts (stats.citations), never its rows.
#
# Used by:
#   - analysis/api/views.py
############################################################

def serialize_report(report, full=False, job=None):
    data = {
        "id": report.id,
        "companyId": report.company_id,
        "companyName": report.company.name if report.company_id else None,
        "createdBy": report.created_by_id,
        "jobId": report.job_id,
        "status": report.status,
        "language": report.language,
        "scope": report.scope,
        "title": report.title,
        "stats": report.stats,
        "error": report.error,
        "approvedBy": report.approved_by_id,
        "approvedByName": (report.approved_by.display_name or report.approved_by.email)
                          if report.approved_by_id and report.approved_by else None,
        "approvedAt": report.approved_at,
        "approvalNote": report.approval_note,
        "scopeApprovedBy": report.scope_approved_by_id,
        "scopeApprovedByName": (report.scope_approved_by.display_name or report.scope_approved_by.email)
                               if report.scope_approved_by_id and report.scope_approved_by else None,
        "scopeApprovedAt": report.scope_approved_at,
        "createdAt": report.created_at,
        "startedAt": report.started_at,
        "finishedAt": report.finished_at,
    }
    if job is not None:
        data["progress"] = job.progress
        data["jobStatus"] = job.status
    if full:
        data["summary"] = report.summary
        data["profileSnapshot"] = report.profile_snapshot
        acts = list(report.acts.select_related("document").order_by("order"))
        data["acts"] = [serialize_act(a) for a in acts]
        data["outdatedActs"] = sorted({a.short_title or a.document_title for a in acts
                                       if not a.screened_out and a.document_id and a.version_id
                                       and a.document.current_version_id not in (None, a.version_id)})
        findings = list(report.findings.order_by("order"))
        starts = passage_starts(findings)
        upcoming = {a.id: a.applies_from for a in acts if a.assessment == "upcoming"}
        # How each obligation stood in the company's earlier reports (analysis/register.py)
        from compliance.analysis.register import history
        past = history(report)
        data["findings"] = [{**serialize_finding(f, starts, upcoming), "history": past.get(f.obligation_id, [])}
                            for f in findings]
        data["actions"] = [serialize_action(a) for a in report.actions.order_by("order")]
        data["citations"] = [serialize_citation(c) for c in report.citations.order_by("order")]
    return data








############################################################
# serialize_act
############################################################
#
# Used by:
#   - serialize_report (above)
############################################################

def serialize_act(act):
    return {
        "id": act.id,
        "documentId": act.document_id,
        "documentTitle": act.document_title,
        "shortTitle": act.short_title,
        "jurisdiction": act.jurisdiction,
        "docType": act.doc_type,
        "sourceUrl": act.source_url,
        "applicability": act.applicability,
        "confidence": act.confidence,
        "reasoning": act.reasoning,
        "conditionsToVerify": act.conditions_to_verify,
        "appliesFrom": act.applies_from,
        "assessment": act.assessment,
        "citations": act.citations,
        "screenedOut": act.screened_out,
    }








############################################################
# serialize_finding
############################################################
#
# `starts` is passage_starts() of the whole report when the
# caller serializes many findings; without it the finding's
# own passages are resolved (one query, none when it cites
# no passage) — the review answer carries them too, so the
# GUI's swapped-in finding keeps its passage links.
# `upcoming` is {act id: the date it applies from} for the
# report's acts assessed as preparation; without it the
# finding's own act is looked up. A finding of such an act
# says so with `appliesFrom` — it is preparation, not a gap
# of today.
#
# Used by:
#   - serialize_report (above), analysis/api/views.py
############################################################

def serialize_finding(finding, starts=None, upcoming=None):
    if starts is None:
        starts = passage_starts([finding])
    if upcoming is None:
        act = finding.act if finding.act_id else None
        upcoming = {act.id: act.applies_from} if act is not None and act.assessment == "upcoming" else {}
    return {
        "id": finding.id,
        "actId": finding.act_id,
        "appliesFrom": upcoming.get(finding.act_id),
        "obligationId": finding.obligation_id,
        "sourceKind": finding.source_kind,
        "documentTitle": finding.document_title,
        "shortTitle": finding.short_title,
        "obligationTitle": finding.obligation_title,
        "obligationText": finding.obligation_text,
        "obligationReviewed": finding.obligation_reviewed,
        "category": finding.category,
        "status": finding.status,
        "effectiveStatus": effective_status(finding),
        "severity": finding.severity,
        "analysis": finding.analysis,
        "recommendation": finding.recommendation,
        "evidence": serialize_evidence(finding.evidence, starts),
        "citations": finding.citations,
        "deadline": finding.deadline,
        "consequence": finding.consequence,
        "cause": finding.cause,
        "overrideStatus": finding.override_status,
        "reviewerNote": finding.reviewer_note,
        "reviewedBy": finding.reviewed_by_id,
        "reviewedAt": finding.reviewed_at,
    }








############################################################
# _passage_key
############################################################
#
# (document id, chunk ordinal) of a stored passage entry, or
# None for any other entry — and for a malformed one, which
# then simply resolves to no charStart.
#
# Used by:
#   - passage_starts, serialize_evidence (below)
############################################################

def _passage_key(entry):
    if not isinstance(entry, dict) or entry.get("kind") != "passage":
        return None
    document_id, ordinal = entry.get("id"), entry.get("chunk")
    if not isinstance(document_id, str) or type(ordinal) is not int:
        return None
    return document_id, ordinal








############################################################
# passage_starts
############################################################
#
#   passage_starts(findings) → {(document id, ordinal): char_start}
#
# Every passage the findings cite, in ONE query: the chunk
# rows of the cited documents with the cited ordinals (the
# two columns filtered apart — company_chunks_doc_ord_idx —
# and the pairs matched here). A pair whose chunk is gone is
# absent from the answer.
#
# Used by:
#   - serialize_report, serialize_finding (above)
############################################################

def passage_starts(findings):
    wanted = {key for finding in findings for key in map(_passage_key, finding.evidence or []) if key}
    if not wanted:
        return {}
    rows = CompanyDocumentChunk.objects.filter(
        document_id__in={document_id for document_id, _ in wanted},
        ordinal__in={ordinal for _, ordinal in wanted},
    ).values_list("document_id", "ordinal", "char_start")
    return {(document_id, ordinal): start for document_id, ordinal, start in rows if (document_id, ordinal) in wanted}








############################################################
# serialize_evidence
############################################################
#
# A finding's stored evidence as the wire carries it: every
# passage gains documentId and charStart — the place its
# quote was found at when the report ran (`start`; null when
# the document does not hold the quote word for word), or,
# for a report made when passages were document chunks, the
# chunk's start (null when the chunk is gone). Credentials,
# documents and the profile go out as stored.
#
# Used by:
#   - serialize_finding (above)
############################################################

def serialize_evidence(entries, starts):
    shown = []
    for entry in entries or []:
        if isinstance(entry, dict) and entry.get("kind") == "passage":
            start = entry["start"] if "start" in entry else starts.get(_passage_key(entry))
            entry = {**{k: v for k, v in entry.items() if k != "start"}, "documentId": entry.get("id"),
                     "charStart": start if type(start) is int else None}
        shown.append(entry)
    return shown








############################################################
# serialize_action
############################################################
#
# Used by:
#   - serialize_report (above)
############################################################

def serialize_action(action):
    return {
        "id": action.id,
        "title": action.title,
        "description": action.description,
        "priority": action.priority,
        "effort": action.effort,
        "timeframe": action.timeframe,
        "ownerRole": action.owner_role,
        "category": action.category,
        "findingIds": action.finding_ids,
    }








############################################################
# serialize_citation
############################################################
#
# One citation-audit row: the reference as the document
# wrote it (documentId is the company document — null once
# it is deleted), the checker's status / headingMatch /
# judgedBy and their `verdict`, and — when the corpus holds
# the act — the provision it resolved to (legalDocumentId,
# unitId, unitPath, heading), the judge's note, an excerpt of
# the provision and its official link.
#
# Used by:
#   - serialize_report (above)
############################################################

def serialize_citation(citation):
    return {
        "id": citation.id,
        "documentId": citation.company_document_id,
        "documentTitle": citation.document_title,
        "act": citation.act,
        "article": citation.article,
        "paragraph": citation.paragraph,
        "point": citation.point,
        "claim": citation.claim,
        "quote": citation.quote,
        "status": citation.status,
        "headingMatch": citation.heading_match,
        "verdict": citation_verdict(citation.status, citation.heading_match),
        "judgedBy": citation.judged_by,
        "legalDocumentId": citation.legal_document_id,
        "shortTitle": citation.short_title,
        "unitId": citation.unit_id,
        "unitPath": citation.unit_path,
        "heading": citation.heading,
        "note": citation.note,
        "excerpt": citation.excerpt,
        "citationUrl": citation.citation_url,
    }








############################################################
# serialize_company_action
############################################################
#
# One action of a company's register. `state` is what a
# reader sees: the action's own status, or "late" when it is
# not closed and its due date has passed; `closedHow` says
# whether a later report confirmed it or a person closed it;
# `byHandOnly` that no report can ever confirm it. `standing`
# is the set of obligations that still exist (register.py):
# an unconfirmed finding whose obligation was replaced since
# is served without its obligation, as one no report carries.
#
# Used by:
#   - analysis/api/views.py — company_actions, action_item
############################################################

def serialize_company_action(action, today, standing=None):
    from compliance.analysis.register import state_of

    items = [{**item, "obligationId": None} if standing is not None and not item.get("confirmed")
             and item.get("obligationId") not in standing else item for item in action.items]
    return {
        "id": action.id,
        "companyId": action.company_id,
        "reportId": action.report_id,
        "reportDate": action.report.created_at.date() if action.report_id and action.report else None,
        "title": action.title,
        "description": action.description,
        "category": action.category,
        "priority": action.priority,
        "effort": action.effort,
        "owner": action.owner,
        "dueDate": action.due_date,
        "status": action.status,
        "state": state_of(action, today),
        "items": items,
        # No later report can confirm an action that closes no finding, or one of whose findings lost its obligation
        "byHandOnly": not items or any(item.get("obligationId") is None and not item.get("confirmed") for item in items),
        "note": action.note,
        "closedAt": action.closed_at,
        "closedByName": (action.closed_by.display_name or action.closed_by.email) if action.closed_by_id and action.closed_by else None,
        "closedHow": ("confirmed" if action.confirmed_report_id else "manual") if action.status == "closed" else None,
        "confirmedReportId": action.confirmed_report_id,
        "createdAt": action.created_at,
        "updatedAt": action.updated_at,
    }

