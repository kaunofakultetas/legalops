############################################################
#  [*] analysis.estimate — what an analysis will cost
#
#    estimate_report(company, scope_ids=None) → {acts, obligations, …, totalUsd}
#    estimate_rest(report, acts) → {acts, obligations, …, totalUsd}
#        — the second part of a report, for the acts a person
#          is about to approve
#
#  An UPPER BOUND before anything runs: every candidate act of
#  the catalogue screen is assumed to apply and to be assessed
#  (a run leaves out the acts whose applicability it finds
#  uncertain, and the directives — it cannot know which
#  before it reads them), and so is every standard the report
#  assesses (adopted_standards); obligations
#  already extracted are counted exactly (those fitting the
#  company's type), acts never extracted are estimated from
#  their article count and priced for the one-time extraction
#  too (shared corpus work — not charged to the user, but it
#  spends the gateway's budget all the same). Documents whose
#  cached inventory is missing or stale (a new text, a new
#  inventory prompt version or a new inventory shape —
#  companies/inventory.py) are priced for a re-read, and the
#  citation audit for one judge call per CITATIONS_PER_CALL
#  lookups (a reference to a range or list of articles is one
#  per article): counted exactly from the inventories that
#  stay, CITATIONS_PER_DOCUMENT assumed for each one re-read.
#
#  The gap analysis sends the company's documents with every
#  call (pipeline.document_pack) and the provider caches what
#  repeats: the first call is priced for writing that block to
#  the cache, the others for reading it — or, for a document
#  set too large to send whole, every call for a block of its
#  own. All other input is priced at the cache-write price,
#  which is what the provider charges for input it sees for
#  the first time. Token volumes per call are the ones
#  measured on the 1009 LTD demo; prices come from the
#  gateway's list for each step's ACTIVE model.
############################################################


import math


from compliance.analysis.pipeline import (
    CITATIONS_PER_CALL, DOCUMENT_PACK_CHARS, OBLIGATIONS_PER_CALL, PLAN_FINDINGS_PER_CALL, adopted_standards,
    candidate_acts, collect_citations,
)
from compliance.assistant.usage import cost_of, price_table
from compliance.companies.inventory import inventory_is_current
from compliance.corpus.citations import citation_lookups
from compliance.corpus.models import Obligation
from compliance.prompts.models import Prompt


# Measured per-call volumes (input, output tokens) on the
# 1009 LTD demo, 2026-11-10 (gpt-6.1-sol): an applicability
# call of four acts; a document's inventory with its
# citations; the judge's full check
APPLICABILITY_CALL_TOKENS = (24_000, 1_800)
INVENTORY_CALL_TOKENS = (2_800, 7_000)
# One citation check of up to CITATIONS_PER_CALL lookups
# (claim + the provision's heading and opening each)
CITATION_CALL_TOKENS = (13_000, 3_500)
# A gap-analysis call of fifteen obligations: what it adds to
# the profile and the documents — the obligations and the
# act's verdict — and the findings it writes
GAP_CALL_TOKENS = (5_500, 4_500)
# The profile and the instructions that open every
# gap-analysis call, before the documents
GAP_PREFIX_TOKENS = 5_000
# Characters of a company document per token (English and
# Lithuanian policies, measured: 271 500 characters, 58 000
# tokens)
DOCUMENT_CHARS_PER_TOKEN = 4.5
# One planning call (a part of up to PLAN_FINDINGS_PER_CALL
# open findings), and the summary
PLAN_CALL_TOKENS = (31_000, 5_000)
SUMMARY_TOKENS = (14_000, 2_000)
# The share of assessed obligations that end as open findings
# and are planned (measured: 621 of 1 248)
OPEN_SHARE = 0.5
# Extraction: output ≈ 0.7 × input; input ≈ chars / 3.2
EXTRACTION_OUTPUT_RATIO = 0.7
CHARS_PER_TOKEN = 3.2
# Obligations per article, for acts never extracted
OBLIGATIONS_PER_ARTICLE = 2.2
# References to specific provisions assumed for a document
# whose inventory is (re-)read — generous: a policy built on
# MiCA or DORA names a few dozen
CITATIONS_PER_DOCUMENT = 20








############################################################
# _active_version
############################################################
#
# The active PromptVersion of a slug, or None.
#
# Used by:
#   - _model_of, _inventory_work (below)
############################################################

def _active_version(slug):
    prompt = Prompt.objects.select_related("active_version").filter(slug=slug).first()
    return prompt.active_version if prompt else None








############################################################
# _model_of
############################################################
#
# The model the active version of a prompt uses.
#
# Used by:
#   - estimate_report (below)
############################################################

def _model_of(slug):
    version = _active_version(slug)
    return version.model if version else ""








############################################################
# _price
############################################################
#
# USD of `calls` calls of a step at the measured volumes,
# their input priced as written to the provider's cache —
# what input seen for the first time costs.
#
# Used by:
#   - estimate_report (below)
############################################################

def _price(slug, calls, tokens):
    return float(cost_of(_model_of(slug), tokens[0] * calls, tokens[1] * calls, 0, tokens[0] * calls))








############################################################
# _gap_price
############################################################
#
# USD of the gap analysis of `obligations` obligations for a
# company: OBLIGATIONS_PER_CALL to a call, each call opening
# with the instructions, the profile and the company's
# documents. A document set within DOCUMENT_PACK_CHARS is
# the same block in every call — written to the provider's
# cache by the first and read from it by the rest; a larger
# one makes every call carry, and pay for, a block of its
# own.
#
# Used by:
#   - estimate_report (below)
############################################################

def _gap_price(company, obligations, slug="report.gap_analysis"):
    calls = math.ceil(obligations / OBLIGATIONS_PER_CALL)
    if not calls:
        return 0.0
    chars = sum(len(text or "") for text in company.documents.values_list("text", flat=True))
    shared = GAP_PREFIX_TOKENS + int(min(chars, DOCUMENT_PACK_CHARS) / DOCUMENT_CHARS_PER_TOKEN)
    model, (added, answer) = _model_of(slug), GAP_CALL_TOKENS
    first = cost_of(model, shared + added, answer, 0, shared + added)
    if chars > DOCUMENT_PACK_CHARS:
        return float(first * calls)
    return float(first + cost_of(model, (shared + added) * (calls - 1), answer * (calls - 1),
                                 shared * (calls - 1), added * (calls - 1)))








############################################################
# _inventory_work
############################################################
#
#   _inventory_work(company) → (documents to read, citation checks)
#
# The documents with text whose cached inventory a run would
# not use (inventory_is_current under the active inventory
# prompt — every one when there is none), and the judge
# calls of the citation audit: the lookups of the unique
# references of the inventories that stay (the pipeline's
# own collect_citations and citation_lookups), plus
# CITATIONS_PER_DOCUMENT for each document read again,
# CITATIONS_PER_CALL to a call.
#
# Used by:
#   - estimate_report (below)
############################################################

def _inventory_work(company):
    version = _active_version("report.inventory")
    documents = [d for d in company.documents.filter(extraction_status="done").order_by("uploaded_at")
                 .only("id", "text", "inventory", "inventory_key") if (d.text or "").strip()]
    kept = [d for d in documents if version is not None and inventory_is_current(d, version.id)]
    entries, _ = collect_citations(kept, {d.id: d.inventory for d in kept})
    unique = {key: citation for _, citation, key in entries}
    to_read = len(documents) - len(kept)
    lookups = sum(len(citation_lookups(citation)) for citation in unique.values()) + to_read * CITATIONS_PER_DOCUMENT
    return to_read, math.ceil(lookups / CITATIONS_PER_CALL)








# The prompts the company's own requirements are read and judged with
INTERNAL_PROMPTS = ("company.internal_requirements", "report.internal_gap")








############################################################
# _internal
############################################################
#
# What assessing the company's own requirements adds to a
# report: the documents, the requirements and the USD
# (analysis/internal.py — fetched here, as that module reads
# this one).
#
# Used by:
#   - estimate_report, estimate_rest (below)
############################################################

def _internal(company):
    from compliance.analysis.internal import internal_estimate
    return internal_estimate(company)








############################################################
# _policy_documents
############################################################
#
# How many policy-level documents the company has — what the
# own-requirements option would read. A start dialog offers
# the option only when there are some.
#
# Used by:
#   - estimate_report (below)
############################################################

def _policy_documents(company):
    from compliance.analysis.internal import source_documents
    return len(source_documents(company))








############################################################
# estimate_report
############################################################
#
# Used by:
#   - analysis/api/views.py — GET /api/reports/estimate
############################################################

def estimate_report(company, scope_ids=None, internal=False):
    acts, _ = candidate_acts(company, scope_ids)
    standards = [standard for standard, _ in adopted_standards(company, scope_ids)]
    kind = company.institution_type
    obligations, acts_to_extract = 0, []
    # Characters still to extract, by the prompt that reads them
    to_extract = {"corpus.extract_obligations": 0, "corpus.extract_requirements": 0}
    for act in acts + standards:
        version = act.current_version
        if version.obligations_extracted_at is not None:
            rows = Obligation.objects.filter(document=act, version=version).exclude(status="rejected")
            obligations += sum(1 for o in rows.only("applies_to")
                               if not o.applies_to or "all" in o.applies_to
                               or kind in ("unknown", "other_financial") or kind in o.applies_to)
        else:
            obligations += int(version.article_count * OBLIGATIONS_PER_ARTICLE)
            slug = "corpus.extract_requirements" if act.doc_type == "standard" else "corpus.extract_obligations"
            to_extract[slug] += version.char_count
            acts_to_extract.append(act.short_title or act.title[:60])
    documents, citation_checks = _inventory_work(company)
    extraction_usd = 0.0
    for slug, chars in to_extract.items():
        tokens = int(chars / CHARS_PER_TOKEN)
        extraction_usd += float(cost_of(_model_of(slug), tokens, int(tokens * EXTRACTION_OUTPUT_RATIO)))
    # Every theme of open findings is planned, PLAN_FINDINGS_PER_CALL
    # to a call, plus the calls for the wrong references and for
    # the acts whose applicability waits for facts
    plan_calls = math.ceil(obligations * OPEN_SHARE / PLAN_FINDINGS_PER_CALL) + 2
    analysis_usd = (_price("report.applicability", math.ceil(len(acts) / 4), APPLICABILITY_CALL_TOKENS)
                    + _gap_price(company, obligations)
                    + _price("report.inventory", documents, INVENTORY_CALL_TOKENS)
                    + _price("corpus.check_citations", citation_checks, CITATION_CALL_TOKENS)
                    + _price("report.action_plan", plan_calls, PLAN_CALL_TOKENS)
                    + _price("report.summary", 1, SUMMARY_TOKENS))
    prices = price_table()
    models = {_model_of(slug) for slug in ("report.applicability", "report.gap_analysis", "report.inventory",
                                           "corpus.check_citations", "report.action_plan", "report.summary",
                                           "corpus.extract_obligations", "corpus.extract_requirements")}
    # The company's own requirements, when the report is to assess them too
    own = _internal(company) if internal else None
    if own is not None:
        models |= {_model_of(slug) for slug in INTERNAL_PROMPTS}
    return {
        "pricesKnown": all(m in prices for m in models if m),
        "acts": len(acts) + len(standards),
        "obligations": obligations,
        "actsToExtract": acts_to_extract,
        "documentsToRead": documents,
        "citationChecks": citation_checks,
        "analysisUsd": round(analysis_usd, 2),
        "extractionUsd": round(extraction_usd, 2),
        **({"internal": own} if own is not None else {}),
        # Whether the company has documents the own-requirements option could read at all
        "policyDocuments": own["documents"] if own is not None else _policy_documents(company),
        "totalUsd": round(analysis_usd + extraction_usd + (own["usd"] if own else 0), 2),
        "upperBound": True,
    }








############################################################
# estimate_rest
############################################################
#
# What the second part of a report would cost for the acts a
# person is about to approve (ReportAct rows): the gap
# analysis of their obligations, the plan and the summary,
# and the one-time reading of the acts never read. An act
# assessed by choice although it does not bind the company
# counts all of its obligations, as the pipeline will. Per
# act it answers how many obligations there are, or that the
# act is yet to be read.
#
# Used by:
#   - analysis/api/views.py — report_scope
############################################################

def estimate_rest(report, acts):
    kind = report.company.institution_type
    obligations, rows, extraction_usd = 0, [], 0.0
    for act in acts:
        document = act.document
        version = document.current_version if document is not None else None
        if version is None:
            continue
        if version.obligations_extracted_at is not None:
            chosen = act.applicability == "not_applies"
            count = sum(1 for o in Obligation.objects.filter(document=document, version=version)
                        .exclude(status="rejected").only("applies_to")
                        if chosen or not o.applies_to or "all" in o.applies_to
                        or kind in ("unknown", "other_financial") or kind in o.applies_to)
            rows.append({"id": act.id, "obligations": count, "toExtract": False})
        else:
            count = int(version.article_count * OBLIGATIONS_PER_ARTICLE)
            slug = "corpus.extract_requirements" if act.doc_type == "standard" else "corpus.extract_obligations"
            tokens = int(version.char_count / CHARS_PER_TOKEN)
            extraction_usd += float(cost_of(_model_of(slug), tokens, int(tokens * EXTRACTION_OUTPUT_RATIO)))
            rows.append({"id": act.id, "obligations": count, "toExtract": True})
        obligations += count
    plan_calls = math.ceil(obligations * OPEN_SHARE / PLAN_FINDINGS_PER_CALL) + 2
    analysis_usd = (_gap_price(report.company, obligations) + _price("report.action_plan", plan_calls, PLAN_CALL_TOKENS)
                    + _price("report.summary", 1, SUMMARY_TOKENS)) if obligations else 0.0
    prices = price_table()
    models = {_model_of(slug) for slug in ("report.gap_analysis", "report.action_plan", "report.summary",
                                           "corpus.extract_obligations", "corpus.extract_requirements")}
    own = _internal(report.company) if report.scope.get("internal") else None
    if own is not None:
        models |= {_model_of(slug) for slug in INTERNAL_PROMPTS}
    return {"pricesKnown": all(model in prices for model in models if model), "acts": rows, "obligations": obligations,
            "analysisUsd": round(analysis_usd, 2), "extractionUsd": round(extraction_usd, 2),
            **({"internal": own} if own is not None else {}),
            "totalUsd": round(analysis_usd + extraction_usd + (own["usd"] if own else 0), 2), "upperBound": True}
