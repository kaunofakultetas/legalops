############################################################
#  [*] analysis.pipeline — the `report.analyze` job
#
#  One company, one report, eight steps — nine when the
#  report also assesses the company's own requirements (each
#  a JobStep with its prompt version, model and usage):
#
#    1. profile        — freeze the company profile,
#                        credentials, adopted standards and
#                        document list
#    2. documents      — index + inventory every document
#                        (cached per text, prompt version and
#                        inventory shape)
#    3. citations      — the citation audit: every reference
#                        the documents make to a specific
#                        provision, checked against the corpus
#                        (corpus/citations.py — does it exist,
#                        does it regulate what the document
#                        claims; prompt corpus.check_citations)
#    4. applicability  — which acts apply, and from when:
#                        candidates from the catalogue
#                        metadata, verdicts from the model
#                        reading each act's scope provisions
#                        (prompt report.applicability); the
#                        standards the company adopted apply
#                        without a verdict. The verdict decides
#                        what the report does with the act
#                        (assessment_of)
#    5. obligations    — the obligations of the acts to assess
#                        and the requirements of the adopted
#                        standards (extracted once per version
#                        for everyone, then cached)
#    6. gap_analysis   — every obligation judged against the
#                        company's evidence: the profile, the
#                        credentials and the company's
#                        documents read WHOLE (prompt
#                        report.gap_analysis)
#       internal       — only when the report was started
#                        with it: the company's own policies
#                        as criteria, their requirements read
#                        once and the procedures judged
#                        against them (analysis/internal.py)
#    7. action_plan    — actions that close every open finding,
#                        drafted theme by theme, merged into
#                        one plan (prompt report.plan_merge),
#                        and correct the wrong references
#    8. summary        — the executive summary
#
#  What is assessed. Only an act that binds the company gets
#  its obligations assessed. An act whose applicability hangs
#  on facts the profile does not state is NOT assessed: the
#  report lists it with the questions to answer, and a later
#  run assesses it once the profile answers them (measured on
#  the 1009 LTD demo, 2026-11-10: seven such acts made 872 of
#  a report's 2 120 findings, nearly all "not applicable" or
#  "not evidenced"). A directive binds through the national
#  law that transposes it, which is assessed in its place; an
#  act that organises an authority or a procedure before it
#  (the law on the central bank, a rulebook for fines, a
#  licensing procedure) reaches the company through that
#  authority's decisions, and is not assessed either — a
#  company's documents have nothing to say on "recognise the
#  chair's independence" (in the report of 2026-11-11 five
#  such acts made 42 findings, none of them a gap). An
#  act that starts to apply later is assessed as preparation
#  and counted apart from today's result. An act the report's
#  scope names is assessed through that doubt — uncertain or
#  indirect — though not against a verdict that it does not
#  apply.
#
#  What the assessment reads. The gap analysis is given the
#  company's documents in full — the same set in every call,
#  so the model can tell "no document covers this" from "the
#  passage was not retrieved", and can see a document refer to
#  another that was not provided. What the calls of a step
#  share goes to the model apart from what differs (run_prompt's
#  `shared`): the provider caches it and bills a read at a
#  twentieth of the input price, which makes whole documents
#  cheaper than sending each obligation its nearest passages.
#  A set too large for one prompt falls back to the documents
#  nearest to each batch (document_pack). A quote the model
#  gives as evidence is located in the document it names, so
#  every stored quote opens at its place — and one that is not
#  there word for word is kept without a place rather than
#  trusted.
#
#  Model calls run four at a time — after the first of a step
#  that shares data, which runs alone to fill the provider's
#  cache (shared_first). A provider's rate limit is waited
#  out, not failed on (assistant/gateway.py). The report's
#  budget was checked when it started and a run is never
#  stopped halfway for it — only the AI provider's own refusal
#  (402) fails it. The report row mirrors the job: running →
#  done / failed / cancelled.
############################################################


import json
import logging
import re
import uuid
from datetime import date


from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce, Least
from pgvector.django import CosineDistance


from compliance.analysis.models import (
    APPLICABILITY, ASSESSMENTS, EFFORTS, FINDING_STATUSES, SEVERITIES, TIMEFRAMES, Action, Finding, Report,
    ReportAct, ReportCitation,
)
from compliance.analysis.exports import LABELS, consequence_text
from compliance.analysis.serializers import VERDICT_STAT_KEYS, VERDICTS, citation_verdict
from compliance.assistant.gateway import GatewayError
from compliance.assistant.llm import run_prompt
from compliance.assistant.models import LlmCall
from compliance.common.http import json_safe
from compliance.common.parallel import parallel_map
from compliance.common.timestamps import utc_now
from compliance.companies.indexing import index_document
from compliance.companies.inventory import citation_key, ensure_inventory, inventory_citations
from compliance.companies.models import CompanyDocumentChunk, CompanyStandard
from compliance.companies.serializers import serialize_company
from compliance.corpus.citations import (
    MAX_ITEMS as MAX_CITATIONS_PER_CHECK, check_citations, citation_lookups, series_result,
)
from compliance.corpus.links import citation_url
from compliance.corpus.models import OBLIGATION_CATEGORIES, LegalDocument, LegalUnit, Obligation
from compliance.corpus.obligations import embed_english, extract_for_document
from compliance.corpus.sanctions import Consequences, read_sanctions
from compliance.corpus.scope import covers, read_scopes, scope_batches, scope_provisions
from compliance.jobs.models import JobStep
from compliance.jobs.registry import JobCancelled, JobLost, WorkerStopping, register
from compliance.prompts.models import PromptVersion
from compliance.prompts.schemas import FILLED


logger = logging.getLogger(__name__)

WORKERS = 4
ACTS_PER_CALL = 4
SCOPE_CHARS = 5000
OBLIGATIONS_PER_CALL = 15
# The characters of company documents one gap-analysis call
# may carry. A set within it goes whole into every call (the
# 1009 LTD demo: 26 policies, 261 000 characters, about
# 59 000 tokens a call, nearly all of them read from the
# provider's cache); a larger one is cut to the documents
# nearest to each batch
DOCUMENT_PACK_CHARS = 600_000
# How the documents nearest to an obligation are found when
# the set does not fit: its company passages nearer than this
# (by the better of its Lithuanian and English vectors —
# distances of the Lithuanian vector alone to English
# documents sit at 0.68–0.73), the nearest six
EVIDENCE_PER_OBLIGATION = 6
EVIDENCE_MAX_DISTANCE = 0.7
# The open findings one planning call takes — whole themes,
# packed together up to this many
PLAN_FINDINGS_PER_CALL = 150
# References one citation check (one judge call) takes — the
# checker's own ceiling
CITATIONS_PER_CALL = MAX_CITATIONS_PER_CHECK
# The audit's problems the action plan reads at most (wrong
# provisions before missing ones — the order they are stored)
MAX_CITATIONS_FOR_PLAN = 60

# The questions of an act left "uncertain" and the
# recommendation of an open finding are asked for by the
# prompts, not by these schemas: what is needed in some
# answers only can be written as two shapes of the item
# (anyOf), and with that form the gap analysis judged
# differently — 64 and 65 of the evaluation's 71 cases
# against 67 and 68 without it (17 November 2026)
APPLICABILITY_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["acts"],
    "properties": {"acts": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["actRef", "applicability", "effect", "confidence", "reasoning", "conditionsToVerify", "appliesFrom",
                     "provisionRefs"],
        "properties": {
            "actRef": FILLED,
            "applicability": {"type": "string", "enum": ["applies", "not_applies", "uncertain"]},
            "effect": {"type": "string", "enum": ["direct", "institutional"]},
            "confidence": {"type": "number"},
            "reasoning": FILLED,
            "conditionsToVerify": {"type": "string"},
            # A date as YYYY-MM-DD, or empty
            "appliesFrom": {"type": "string", "pattern": "^([0-9]{4}-[0-9]{2}-[0-9]{2})?$"},
            "provisionRefs": {"type": "array", "items": {"type": "string"}},
        }}}},
}

GAP_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["findings"],
    "properties": {"findings": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["obligationRef", "status", "analysis", "recommendation", "evidence"],
        "properties": {
            "obligationRef": FILLED,
            "status": {"type": "string", "enum": list(FINDING_STATUSES)},
            "analysis": FILLED,
            "recommendation": {"type": "string"},
            "evidence": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["ref", "quote"],
                "properties": {"ref": FILLED, "quote": {"type": "string"}}}},
        }}}},
}

PLAN_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["actions"],
    "properties": {"actions": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["title", "description", "effort", "timeframe", "ownerRole", "category", "findingRefs"],
        "properties": {
            "title": FILLED,
            "description": FILLED,
            "effort": {"type": "string", "enum": list(EFFORTS)},
            "timeframe": {"type": "string", "enum": list(TIMEFRAMES)},
            "ownerRole": FILLED,
            "category": {"type": "string", "enum": list(OBLIGATION_CATEGORIES)},
            "findingRefs": {"type": "array", "items": {"type": "string"}},
        }}}},
}

MERGE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["actions"],
    "properties": {"actions": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["title", "description", "effort", "timeframe", "ownerRole", "category", "draftRefs"],
        "properties": {
            "title": FILLED,
            "description": FILLED,
            "effort": {"type": "string", "enum": list(EFFORTS)},
            "timeframe": {"type": "string", "enum": list(TIMEFRAMES)},
            "ownerRole": FILLED,
            "category": {"type": "string", "enum": list(OBLIGATION_CATEGORIES)},
            "draftRefs": {"type": "array", "items": {"type": "string"}},
        }}}},
}

SUMMARY_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["title", "summary"],
    "properties": {"title": FILLED, "summary": FILLED},
}

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

# What code writes where the model left an item of its answer
# out, in the report's language: the sentence stands among the
# model's own in the report a person reads
UNANSWERED = {
    "act": {"lt": "Modelis nepateikė šio akto taikymo vertinimo.", "en": "The model returned no verdict for this act."},
    "obligation": {"lt": "Modelis šios pareigos neįvertino.", "en": "The model did not assess this obligation."},
    "requirement": {"lt": "Modelis šio reikalavimo neįvertino.", "en": "The model did not assess this requirement."},
}
STATUS_ORDER = {"missing": 0, "partial": 1, "unknown": 2, "met": 3, "not_applicable": 4}

# An adoption's status as the profile tells the prompts
# An institution type in Lithuanian: what a company is recorded
# as, and whom an act is written for
KIND_LT = {
    "bank": ("bankas", "bankams"), "credit_union": ("kredito unija", "kredito unijoms"),
    "payment_institution": ("mokėjimo įstaiga", "mokėjimo įstaigoms"),
    "emi": ("elektroninių pinigų įstaiga", "elektroninių pinigų įstaigoms"),
    "casp": ("kriptoturto paslaugų teikėjas", "kriptoturto paslaugų teikėjams"),
    "crowdfunding": ("sutelktinio finansavimo paslaugų teikėjas", "sutelktinio finansavimo paslaugų teikėjams"),
    "consumer_credit": ("vartojimo kredito davėjas", "vartojimo kredito davėjams"),
    "real_estate_credit": ("su nekilnojamuoju turtu susijusio kredito davėjas",
                           "su nekilnojamuoju turtu susijusio kredito davėjams"),
    "currency_exchange": ("valiutos keityklos operatorius", "valiutos keityklos operatoriams"),
    "investment_firm": ("finansų maklerio įmonė", "finansų maklerio įmonėms"),
    "insurance": ("draudimo įmonė", "draudimo įmonėms"),
    "other_financial": ("kita finansų įstaiga", "kitoms finansų įstaigoms"),
    "none": ("ne finansų įstaiga", "ne finansų įstaigoms"), "unknown": ("nenustatytos rūšies įmonė", "visiems"),
}
STANDARD_STATUS_TEXT = {"certified": "certified", "implementing": "being implemented",
                        "planned": "planned, not yet implemented"}








############################################################
# Context
############################################################
#
# What every step shares: the report, its company, the
# language, the day it runs, the acts its scope names, the
# evidence refs (C1…, D1…), the standards the company adopted
# and the rendered profile text the prompts read.
#
# Used by:
#   - every step (below)
############################################################

class Context:

    def __init__(self, report, ctx, user_id):
        self.report = report
        self.company = report.company
        self.ctx = ctx
        self.user_id = user_id
        self.language = "Lithuanian" if report.language == "lt" else "English"
        self.today = utc_now().date()
        self.scope_ids = set(report.scope.get("documentIds") or [])
        self.credentials = list(self.company.credentials.order_by("created_at"))
        self.standards = list(CompanyStandard.objects.filter(company=self.company)
                              .select_related("document", "certificate").order_by("created_at"))
        self.documents = [d for d in self.company.documents.order_by("uploaded_at")]
        self.credential_refs = {f"C{i}": c for i, c in enumerate(self.credentials, 1)}
        self.document_refs = {f"D{i}": d for i, d in enumerate(self.documents, 1)}
        self.inventories = {}
        self.profile_text = ""
        self.compact_profile_text = ""






    ############################################################
    # variables
    ############################################################
    #
    # The placeholders every pipeline prompt may use.
    #
    # Used by:
    #   - every step (below)
    ############################################################

    def variables(self):
        return {"LANGUAGE": self.language, "TODAY": self.today.isoformat(), "COMPANY_NAME": self.company.name}








############################################################
# shared_first
############################################################
#
# parallel_map for the calls of a step that carry the same
# shared data (run_prompt's `shared`): the first runs alone,
# so the provider holds that data in its cache by the time
# the others ask for it, WORKERS at a time — calls started
# together would each pay for writing it.
#
# Used by:
#   - step_applicability, step_gap_analysis (below)
############################################################

def shared_first(fn, items):
    return [fn(item) for item in items[:1]] + parallel_map(fn, items[1:], workers=WORKERS)








############################################################
# _flag
############################################################
#
# A tri-state profile flag as the prompts read it — "unknown"
# is said out loud, never folded into "no".
#
# Used by:
#   - render_profile (below)
############################################################

def _flag(value):
    return "unknown (not stated)" if value is None else ("yes" if value else "no")








############################################################
# render_profile
############################################################
#
# The company as the prompts read it: typed profile, other
# facts, credentials [C…], the standards it adopted (a
# certificate named by its credential ref) and documents [D…]
# with their inventory summaries and the controls they
# establish.
# `compact` lists each document by title and summary only —
# the gap analysis, which reads the documents themselves,
# and the action plan read that one.
#
# Used by:
#   - step_documents (below), after the inventories exist
############################################################

def render_profile(pc, compact=False):
    c = pc.company
    lines = [
        f"Company: {c.name} ({c.legal_form or 'legal form unknown'}, {c.country}); registration code {c.registration_code or '-'}",
        f"Financial institution type: {c.institution_type}",
        f"Size: {c.size_category}; employees: {c.employees if c.employees is not None else '-'}; "
        f"annual turnover EUR: {c.annual_turnover_eur if c.annual_turnover_eur is not None else '-'}",
        f"NACE codes: {', '.join(c.nace_codes) or '-'}; sector: {c.sector or '-'}",
        f"Activities: {c.activities or '-'}",
        f"Uses AI systems: {_flag(c.uses_ai)}; provides AI systems: {_flag(c.provides_ai)}; "
        f"AI description: {c.ai_description or '-'}",
        f"Processes personal data: {_flag(c.processes_personal_data)}; public sector: {_flag(c.is_public_sector)}",
        f"Financial-market classification on file: {json.dumps(c.financial_market, ensure_ascii=False) if c.financial_market else '-'}",
        f"Other facts: {json.dumps(c.attributes, ensure_ascii=False) if c.attributes else '-'}",
        "",
        "Credentials the company holds:" if pc.credentials else "Credentials the company holds: none recorded",
    ]
    for ref, cred in pc.credential_refs.items():
        validity = f"{cred.valid_from or '?'} – {cred.valid_to or 'open'}"
        lines.append(f"- [{ref}] {cred.kind}: {cred.name}; issuer {cred.issuer or '-'}; no. {cred.identifier or '-'}; "
                     f"valid {validity}; scope {cred.scope or '-'}; "
                     f"{'VERIFIED' if cred.status == 'verified' else 'CLAIMED by the company, not verified'}")
    if pc.standards:
        refs = {cred.id: ref for ref, cred in pc.credential_refs.items()}
        lines.append("")
        lines.append("Standards the company has adopted (it is assessed against their requirements):")
        for adoption in pc.standards:
            standard = adoption.document
            certificate = f"; certificate [{refs[adoption.certificate_id]}]" if adoption.certificate_id in refs else ""
            lines.append(f"- {standard.short_title or standard.title}: {STANDARD_STATUS_TEXT[adoption.status]}"
                         f"; scope {adoption.scope or '-'}{certificate}")
    roles = list(c.roles.order_by("name"))
    if roles:
        lines.append("")
        lines.append("Company roles (use them as action owners): " + "; ".join(
            f"{r.name}{' — ' + r.context[:200] if r.context else ''}" for r in roles))
    lines.append("")
    lines.append("Company documents:" if pc.documents else "Company documents: none uploaded")
    for ref, doc in pc.document_refs.items():
        inv = pc.inventories.get(doc.id) or {}
        if compact:
            lines.append(f"- [{ref}] \"{doc.title}\" ({inv.get('documentType') or doc.kind}); "
                         f"{(inv.get('summary') or 'no summary')[:240]}")
            continue
        controls = "; ".join(ctl.get("name", "") for ctl in inv.get("controls", [])[:25])
        lines.append(f"- [{ref}] \"{doc.title}\" ({inv.get('documentType') or doc.kind}); {inv.get('summary') or 'no summary'}"
                     f"{'; controls: ' + controls if controls else ''}"
                     f"{'; approval: ' + inv['approval'] if inv.get('approval') else ''}"
                     f"{'; review cycle: ' + inv['reviewCycle'] if inv.get('reviewCycle') else ''}")
    return "\n".join(lines)








############################################################
# freeze_profile
############################################################
#
# Copies the company — its profile, credentials, standards and
# roles as they are now — onto the report: what the exports
# and the report's page show as the company that was judged.
#
# Used by:
#   - step_profile (below)
#   - analyze (below) — again, when the second part starts
############################################################

def freeze_profile(pc):
    snapshot = json_safe(serialize_company(pc.company, with_related=True))
    Report.objects.filter(id=pc.report.id).update(profile_snapshot=snapshot)








############################################################
# step_profile
############################################################
#
# Freezes the profile the report ran on.
#
# Used by:
#   - analyze (below)
############################################################

def step_profile(pc):
    with pc.ctx.step("profile") as step:
        freeze_profile(pc)
        step.output = {"credentials": len(pc.credentials), "standards": len(pc.standards),
                       "documents": len(pc.documents)}








############################################################
# step_documents
############################################################
#
# Indexes documents that have no chunks yet and reads every
# document's inventory; then renders the profile text.
#
# Used by:
#   - analyze (below)
############################################################

def step_documents(pc):
    with pc.ctx.step("documents") as step:
        def prepare(document):
            pc.ctx.check_cancelled()
            if document.text and (document.indexed_at is None or not document.chunks.exists()):
                index_document(document, step_id=step.row.id, user_id=pc.user_id)
            return document.id, ensure_inventory(document, language=pc.language, step_id=step.row.id,
                                                 user_id=pc.user_id)

        for document_id, inventory in parallel_map(prepare, pc.documents, workers=WORKERS):
            pc.inventories[document_id] = inventory
        pc.profile_text = render_profile(pc)
        pc.compact_profile_text = render_profile(pc, compact=True)
        step.output = {"documents": len(pc.documents)}








############################################################
# collect_citations
############################################################
#
#   collect_citations(documents, {document.id: inventory})
#     → ([(document, citation, key), …], skipped)
#
# The references the audit checks, document by document in
# the given order: each inventory's citations (an inventory
# read before `citations` existed has none) that name an act
# and an article, keyed by citation_key; a reference repeated
# within one document counts once. `skipped` counts the
# entries naming no act or no article — nothing to look up.
#
# Used by:
#   - step_citations (below)
#   - analysis/estimate.py — the judge calls a run will make
############################################################

def collect_citations(documents, inventories):
    entries, skipped = [], 0
    for document in documents:
        seen = set()
        for citation in inventory_citations(inventories.get(document.id)):
            if not citation["act"] or not citation["article"]:
                skipped += 1
                continue
            key = citation_key(citation)
            if key not in seen:
                seen.add(key)
                entries.append((document, citation, key))
    return entries, skipped








############################################################
# citation_counts
############################################################
#
#   citation_counts(rows)
#     → {"checked": 12, "match": 7, "mismatch": 2, "notFound": 1, "notInCorpus": 1, "unknown": 1}
#
# The audit's verdicts counted (stats.citations; the keys of
# VERDICT_STAT_KEYS) over ReportCitation rows or a queryset.
#
# Used by:
#   - step_citations, step_summary, report_stats (below)
############################################################

def citation_counts(rows):
    counts = {"checked": 0, **{key: 0 for key in VERDICT_STAT_KEYS.values()}}
    for row in rows:
        counts["checked"] += 1
        counts[VERDICT_STAT_KEYS[citation_verdict(row.status, row.heading_match)]] += 1
    return counts








############################################################
# step_citations
############################################################
#
# The citation audit. Every reference the documents'
# inventories make to a specific provision is checked
# against the corpus (corpus/citations.py): does the act's
# current version hold that article / paragraph / point, and
# does it regulate what the document claims. A reference
# made word for word the same (act, article, paragraph, point
# and claim — collect_citations) by several documents is
# judged once and fanned out to each of them; a range or list
# of articles is looked up article by article and answered
# by its best article (_series_result). The lookups go
# CITATIONS_PER_CALL to a check, one judge call each, run
# four at a time and filed under this step — the report's
# cost and the step's usage count them. When the judge is
# unavailable the checker's word overlap judges and each row
# says which did (judged_by); the AI provider's budget
# refusal (402) fails the step like any other model call.
# Rows are stored problems first (VERDICTS), then in the
# documents' order.
#
# Used by:
#   - analyze (below)
############################################################

def step_citations(pc):
    entries, skipped = collect_citations(pc.documents, pc.inventories)
    first = {}
    for _, citation, key in entries:
        first.setdefault(key, citation)
    unique = list(first)
    lookups = [(key, item) for key in unique for item in citation_lookups(first[key])]
    batches = [lookups[i:i + CITATIONS_PER_CALL] for i in range(0, len(lookups), CITATIONS_PER_CALL)]

    with pc.ctx.step("citations", input_ref={"citations": len(entries), "unique": len(unique),
                                             "lookups": len(lookups)}) as step:
        done = {"n": 0}

        def check(batch):
            pc.ctx.check_cancelled()
            results = check_citations([item for _, item in batch], user_id=pc.user_id,
                                      job_step_id=step.row.id, raise_on_budget=True)
            done["n"] += 1
            pc.ctx.progress("citations", int(done["n"] * 100 / len(batches)), f"{done['n']}/{len(batches)} batches")
            return [(key, result) for (key, _), result in zip(batch, results)]

        answers = {}
        for batch_answers in parallel_map(check, batches, workers=WORKERS):
            for key, result in batch_answers:
                answers.setdefault(key, []).append(result)
        checked = {key: series_result(results) for key, results in answers.items()}
        pc.ctx.check_cancelled()
        rows = []
        for position, (document, citation, key) in enumerate(entries):
            result = checked[key]
            found = result["status"] == "found"
            rows.append(ReportCitation(
                id=str(uuid.uuid4()), report=pc.report, company_document=document, document_title=document.title,
                act=citation["act"], article=citation["article"], paragraph=citation["paragraph"],
                point=citation["point"], claim=citation["claim"], quote=citation["quote"], status=result["status"],
                heading_match=result.get("headingMatch") if found else None,
                judged_by=result.get("judgedBy") if found else None,
                legal_document_id=result.get("documentId"), unit_id=result.get("unitId") if found else None,
                short_title=result.get("shortTitle") or "", unit_path=result.get("path") or "",
                heading=result.get("heading") or "", note=result.get("note") or "",
                excerpt=result.get("excerpt") or "", citation_url=result.get("citationUrl") or "", order=position))
        rows.sort(key=lambda row: (VERDICTS.index(citation_verdict(row.status, row.heading_match)), row.order))
        for position, row in enumerate(rows, 1):
            row.order = position
        ReportCitation.objects.bulk_create(rows, batch_size=500)
        judges = sorted({row.judged_by for row in rows if row.judged_by})
        step.output = {**citation_counts(rows), "unique": len(unique), "lookups": len(lookups), "skipped": skipped,
                       "checks": len(batches), "judgedBy": judges[0] if len(judges) == 1 else ("mixed" if judges else None)}
    return rows








############################################################
# candidate_acts
############################################################
#
# (candidates, screened_out) among enabled acts with an
# ingested version: an act is a candidate when its catalogue
# says it applies to everyone, to the company's institution
# type, or to a domain the company is flagged for (AI, personal
# data — an UNKNOWN flag keeps the domain in, the model then
# answers "uncertain"); when the type is unknown, every act is
# a candidate. The catalogue's list is written by hand and
# ages with its act, so an act is also a candidate when the
# reading of its own scope provisions names the company's type
# (corpus/scope.py): it is left out only when both agree.
# Standards are never candidates — they apply by adoption
# (adopted_standards).
#
# Used by:
#   - step_applicability (below)
#   - analysis/estimate.py — estimate_report
############################################################

def candidate_acts(company, scope_ids=None):
    acts = (LegalDocument.objects.filter(enabled=True, current_version__isnull=False).exclude(doc_type="standard")
            .select_related("current_version").defer("current_version__text").order_by("jurisdiction", "title"))
    if scope_ids:
        acts = acts.filter(id__in=scope_ids)
    kind = company.institution_type
    flags = set()
    if company.uses_ai is not False or company.provides_ai is not False:
        flags.add("ai")
    if company.processes_personal_data is not False:
        flags.add("data_protection")
    candidates, screened = [], []
    for act in acts:
        applies = set(act.applies_to or [])
        if (not applies or "all" in applies or kind in ("unknown", "other_financial") or kind in applies
                or flags & set(act.domains or []) or covers(act.current_version.scope, kind)):
            candidates.append(act)
        else:
            screened.append(act)
    return candidates, screened








############################################################
# adopted_standards
############################################################
#
# [(standard, adoption or None)] the report assesses, in
# designation order: every enabled, ingested standard the
# company adopted (companies.CompanyStandard) — or, when the
# report names its acts, those of them that are standards,
# adopted or not (the user chose to assess against them).
#
# Used by:
#   - step_applicability (below)
#   - analysis/estimate.py — estimate_report
############################################################

def adopted_standards(company, scope_ids=None):
    standards = LegalDocument.objects.filter(enabled=True, current_version__isnull=False, doc_type="standard")
    adoptions = {row.document_id: row for row in CompanyStandard.objects.filter(company=company)}
    if scope_ids:
        standards = standards.filter(id__in=scope_ids)
    else:
        standards = standards.filter(id__in=list(adoptions))
    return [(standard, adoptions.get(standard.id)) for standard in standards.order_by("short_title", "title")]








############################################################
# standard_reasoning
############################################################
#
# Why an adopted standard applies, in the report's language:
# how far the company is with it and the scope it covers, or
# that the report was asked to assess it.
#
# Used by:
#   - step_applicability (below)
############################################################

def standard_reasoning(adoption, language):
    lt = language == "lt"
    if adoption is None:
        return ("Standartas įtrauktas į ataskaitos apimtį — įmonė jo taikymo nėra nurodžiusi." if lt else
                "The standard was included in the report's scope — the company has not recorded adopting it.")
    status = {"certified": ("Įmonė sertifikuota pagal šį standartą.", "The company is certified to this standard."),
              "implementing": ("Įmonė diegia šį standartą.", "The company is implementing this standard."),
              "planned": ("Įmonė planuoja taikyti šį standartą — ataskaita parodo, ko dar trūksta.",
                          "The company plans to adopt this standard — the report shows what is still missing.")}
    text = status[adoption.status][0 if lt else 1]
    if adoption.scope:
        text += f" {'Taikymo sritis' if lt else 'Scope'}: {adoption.scope}"
    return text








############################################################
# screened_reasoning
############################################################
#
# Why an act was left out without a verdict, in the report's
# language: whom the catalogue says it is written for, what
# the company is recorded as, and what a reading of the act's
# own scope provisions says, when there is one: that it
# agrees — or that the provisions do not say whom the act
# covers, which is no agreement.
#
# Used by:
#   - step_applicability (below)
############################################################

def screened_reasoning(act, kind, language):
    reading = act.current_version.scope
    silent = bool(reading) and not reading.get("types")
    if language == "lt":
        return (f"Atmestas pagal katalogą: aktas skirtas {', '.join(KIND_LT.get(k, (k, k))[1] for k in act.applies_to)}, "
                f"o įmonė įrašyta kaip {KIND_LT.get(kind, (kind, kind))[0]}."
                + (" Akto taikymo srities nuostatos perskaitytos — jos nenurodo, kam aktas taikomas." if silent
                   else " Akto taikymo srities nuostatos perskaitytos — jos įmonės rūšies taip pat neapima." if reading else ""))
    return (f"Screened out by the catalogue: the act targets {', '.join(act.applies_to)}, "
            f"the company is recorded as '{kind}'."
            + (" The act's scope provisions were read and do not say whom it covers." if silent
               else " A reading of the act's scope provisions agrees." if reading else ""))








############################################################
# applies_from_of
############################################################
#
# The date a verdict names as the start of an act's
# application, or None: nothing given, no day of the calendar
# (the schema holds the answer to the form of a date, not to
# the calendar), or a date that has come — an act already in
# force has no date to wait for.
#
# Used by:
#   - step_applicability (below)
############################################################

def applies_from_of(pc, verdict):
    try:
        day = date.fromisoformat(str(verdict.get("appliesFrom") or "").strip()[:10])
    except ValueError:
        return None
    return day if day > pc.today else None








############################################################
# assessment_of
############################################################
#
# What the report does with an act the model judged (the
# values of models.ASSESSMENTS): an act that does not apply
# is left; one whose applicability is uncertain waits for the
# facts; a directive stands behind its national law, and an
# `institutional` act — one that organises an authority or a
# procedure — behind that authority's decisions: both are
# "indirect". An act the report's scope names is assessed
# through that doubt — uncertain or indirect, it is the
# user's word to assess it anyway — but not against a verdict
# that it does not apply: such an act a person may take in at
# the scope review, as good practice. An act that applies
# from a later date is assessed as preparation; every other
# is assessed.
#
# Used by:
#   - step_applicability (below)
############################################################

def assessment_of(pc, act, applicability, applies_from, institutional=False):
    if applicability == "not_applies":
        return "none"
    chosen = act.id in pc.scope_ids
    if applicability == "uncertain" and not chosen:
        return "unconfirmed"
    if (act.doc_type == "directive" or institutional) and not chosen:
        return "indirect"
    return "upcoming" if applies_from else "assessed"








############################################################
# applicability_data
############################################################
#
# What one applicability call is asked: the acts of a batch,
# each under a ref with what the catalogue says of it, how
# its scope provisions were read, and those provisions
# themselves under refs of their own. Answers the text and
# what every ref stands for. The company's profile travels
# apart, as the step's shared data.
#
# Used by:
#   - step_applicability (below)
#   - prompts/evals/suites.py — the applicability suite
############################################################

def applicability_data(batch):
    refs, blocks = {}, []
    for a_index, act in enumerate(batch, 1):
        act_ref = f"A{a_index}"
        reading = act.current_version.scope
        parts = [f'<act ref="{act_ref}" title="{act.title}" short="{act.short_title}" '
                 f'jurisdiction="{act.jurisdiction}" type="{act.doc_type}">',
                 f"Catalogue: typically applies to {', '.join(act.applies_to) or 'unspecified'}; "
                 f"domains {', '.join(act.domains) or '-'}; note: {act.applicability_notes or '-'}"
                 + ("" if not reading
                    else f"; its scope provisions were read as covering {', '.join(reading['types'])}" if reading["types"]
                    else "; its scope provisions were read and do not say whom the act covers")]
        for p_index, unit in enumerate(scope_provisions(act), 1):
            ref = f"{act_ref}.P{p_index}"
            refs[ref] = unit
            parts.append(f'<provision ref="{ref}" path="{unit.path}">\n{unit.text[:SCOPE_CHARS]}\n</provision>')
        parts.append("</act>")
        blocks.append("\n".join(parts))
        refs[act_ref] = act
    return "ACTS TO ASSESS\n" + "\n\n".join(blocks), refs








############################################################
# step_applicability
############################################################
#
# ReportAct rows for every candidate (the model's verdict
# and what the report does with the act — assessment_of),
# every screened-out act (not_applies, screened_out) and every
# standard the report assesses (applies, by adoption — no
# model call). Before an act is left out on the catalogue's
# word, its own scope provisions are read, once per version
# (corpus/scope.py): the acts the reading brings back join
# the candidates. Answers the acts whose obligations the
# report assesses: those in force for the company and those
# to prepare for.
#
# Used by:
#   - analyze (below)
############################################################

def step_applicability(pc):
    scope_ids = pc.report.scope.get("documentIds")
    candidates, screened = candidate_acts(pc.company, scope_ids)
    with pc.ctx.step("applicability", input_ref={"candidates": len(candidates)}) as step:
        unread = [act for act in screened if act.current_version.scope is None]
        scopes_read = sum(parallel_map(lambda batch: read_scopes(batch, step.row.id), scope_batches(unread),
                                       workers=WORKERS))
        if scopes_read:
            candidates, screened = candidate_acts(pc.company, scope_ids)
        batches = [candidates[i:i + ACTS_PER_CALL] for i in range(0, len(candidates), ACTS_PER_CALL)]

        def judge(batch):
            pc.ctx.check_cancelled()
            data, refs = applicability_data(batch)
            # The profile is the same in every call: it goes as the
            # step's shared data, the acts as what differs
            run = run_prompt("report.applicability", data,
                             shared=f"COMPANY\n{pc.profile_text}", schema=APPLICABILITY_SCHEMA,
                             schema_name="applicability", variables=pc.variables(), job_step_id=step.row.id,
                             user_id=pc.user_id)
            return batch, refs, run.object or {}

        rows, order = [], 0
        for batch, refs, answer in shared_first(judge, batches):
            verdicts = {v.get("actRef"): v for v in answer.get("acts", [])}
            for a_index, act in enumerate(batch, 1):
                verdict = verdicts.get(f"A{a_index}") or {"applicability": "uncertain", "confidence": 0,
                                                          "reasoning": UNANSWERED["act"][pc.report.language],
                                                          "conditionsToVerify": "", "provisionRefs": []}
                cited = [refs[r] for r in verdict.get("provisionRefs", []) if isinstance(refs.get(r), LegalUnit)]
                applicability = verdict.get("applicability") if verdict.get("applicability") in APPLICABILITY else "uncertain"
                applies_from = applies_from_of(pc, verdict) if applicability != "not_applies" else None
                order += 1
                rows.append(ReportAct(
                    id=str(uuid.uuid4()), report=pc.report, document=act, version_id=act.current_version_id,
                    document_title=act.title, short_title=act.short_title, jurisdiction=act.jurisdiction,
                    doc_type=act.doc_type, source_url=act.source_url, applicability=applicability,
                    confidence=max(0.0, min(1.0, float(verdict.get("confidence") or 0))),
                    reasoning=verdict.get("reasoning", ""), conditions_to_verify=verdict.get("conditionsToVerify", ""),
                    applies_from=applies_from,
                    assessment=assessment_of(pc, act, applicability, applies_from, verdict.get("effect") == "institutional"),
                    citations=[{"unitId": u.id, "path": u.path, "documentTitle": act.short_title or act.title} for u in cited],
                    order=order))
        for act in screened:
            order += 1
            rows.append(ReportAct(
                id=str(uuid.uuid4()), report=pc.report, document=act, version_id=act.current_version_id,
                document_title=act.title, short_title=act.short_title, jurisdiction=act.jurisdiction,
                doc_type=act.doc_type, source_url=act.source_url, applicability="not_applies", confidence=0.6,
                reasoning=screened_reasoning(act, pc.company.institution_type, pc.report.language),
                assessment="none", screened_out=True, order=order))
        for standard, adoption in adopted_standards(pc.company, pc.report.scope.get("documentIds")):
            order += 1
            rows.append(ReportAct(
                id=str(uuid.uuid4()), report=pc.report, document=standard, version_id=standard.current_version_id,
                document_title=standard.title, short_title=standard.short_title, jurisdiction=standard.jurisdiction,
                doc_type="standard", source_url=standard.source_url, applicability="applies", confidence=1.0,
                reasoning=standard_reasoning(adoption, pc.report.language), order=order))
        ReportAct.objects.bulk_create(rows)
        step.output = {"applies": sum(r.applicability == "applies" for r in rows),
                       **({"scopesRead": scopes_read} if scopes_read else {}),
                       "standards": sum(r.doc_type == "standard" for r in rows),
                       "uncertain": sum(r.applicability == "uncertain" for r in rows),
                       "notApplies": sum(r.applicability == "not_applies" for r in rows),
                       **{mode: sum(r.assessment == mode for r in rows) for mode in ASSESSMENTS if mode != "none"}}
    return [r for r in rows if r.assessment in ("assessed", "upcoming")]








############################################################
# step_obligations
############################################################
#
# For each act the report assesses: extract its obligations
# if its current version never was, then keep the
# non-rejected ones whose applies_to fits the company (all /
# its type / unknown type). The sanction provisions of the
# acts assessed are read here too when nobody read them yet
# (corpus/sanctions.py) — once per act version, so that the
# findings can say what a breach can cost.
# Answers [(ReportAct, [Obligation, …]), …].
#
# Used by:
#   - analyze (below)
############################################################

def step_obligations(pc, acts):
    kind = pc.company.institution_type
    selected = []
    with pc.ctx.step("obligations", input_ref={"acts": len(acts)}) as step:
        extracted = 0
        for act in acts:
            pc.ctx.check_cancelled()
            document = act.document
            if document is None:
                continue
            usable = Obligation.objects.filter(document=document, version_id=document.current_version_id).exclude(status="rejected")
            if document.current_version.obligations_extracted_at is None:
                # Corpus-level work every later report reuses — recorded as
                # shared cost, not against the starter's daily budget
                pc.ctx.progress("obligations", None, f"extracting {document.short_title or document.title[:40]}")
                extract_for_document(document, pc.ctx, user_id=None, step_id=step.row.id)
                extracted += 1
            # An act a person had assessed although it does not bind
            # the company is read whole: its obligations name the
            # institutions it was written for
            chosen = act.applicability == "not_applies"
            rows = [o for o in usable.order_by("created_at")
                    if chosen or not o.applies_to or "all" in o.applies_to or kind in ("unknown", "other_financial")
                    or kind in o.applies_to]
            selected.append((act, rows))
        # Shared corpus work as well; a standard has no sanctions to read
        unread = [act.document for act, _ in selected
                  if act.doc_type != "standard" and act.document.current_version.sanctions is None]
        if unread:
            pc.ctx.progress("obligations", None, "reading sanction provisions")
        sanctions_read = read_sanctions(unread, step.row.id)
        step.output = {"acts": len(selected), "extracted": extracted,
                       "obligations": sum(len(rows) for _, rows in selected),
                       **({"sanctionsRead": sanctions_read} if unread else {})}
    return selected








############################################################
# evidence_for
############################################################
#
# The company passages nearest to an obligation, as
# [(ref, chunk)]: at most EVIDENCE_PER_OBLIGATION, each under
# EVIDENCE_MAX_DISTANCE by the better of the obligation's two
# vectors — its Lithuanian one and, when it has one, its
# English one — so a company whose documents are in English
# (or in Lithuanian) meets the obligation in its own language.
# It ranks the documents of a set too large to send whole.
#
# Used by:
#   - nearest_documents (below)
############################################################

def evidence_for(pc, obligation, doc_ref_by_id):
    if obligation.embedding is None or not pc.documents:
        return []
    distance = CosineDistance("embedding", obligation.embedding)
    if obligation.embedding_en is not None:
        distance = Least(distance, CosineDistance("embedding", obligation.embedding_en))
    nearest = (CompanyDocumentChunk.objects.filter(document__company=pc.company, embedding__isnull=False)
               .annotate(distance=distance)
               .filter(distance__lt=EVIDENCE_MAX_DISTANCE).order_by("distance")[:EVIDENCE_PER_OBLIGATION])
    return [(f"{doc_ref_by_id.get(chunk.document_id, 'D?')}#{chunk.ordinal}", chunk) for chunk in nearest]








############################################################
# document_block
############################################################
#
# One company document as the gap analysis reads it: its
# ref, title and kind on the opening tag, then its text —
# whole, or (`passages`) only the given excerpts, which the
# tag then says.
#
# Used by:
#   - document_pack, nearest_documents (below)
############################################################

def document_block(pc, ref, document, passages=None):
    kind = (pc.inventories.get(document.id) or {}).get("documentType") or document.kind
    title = (document.title or "").replace('"', "'")
    if passages is None:
        return f'<document ref="{ref}" title="{title}" kind="{kind}">\n{document.text}\n</document>'
    return (f'<document ref="{ref}" title="{title}" kind="{kind}" excerpts="yes">\n'
            + "\n[…]\n".join(passages) + "\n</document>")








############################################################
# document_pack
############################################################
#
# Every document of the company that has text, whole, as one
# block of the prompt — or None when together they exceed
# DOCUMENT_PACK_CHARS. The block is the same in every call of
# a run: it is part of the step's shared data, which the
# provider reads from its cache after the first call.
#
# Used by:
#   - step_gap_analysis (below)
#   - analysis/estimate.py — what a gap-analysis call carries
############################################################

def document_pack(pc):
    readable = [(ref, doc) for ref, doc in pc.document_refs.items() if (doc.text or "").strip()]
    if sum(len(doc.text) for _, doc in readable) > DOCUMENT_PACK_CHARS:
        return None
    return "\n\n".join(document_block(pc, ref, doc) for ref, doc in readable)








############################################################
# nearest_documents
############################################################
#
# The documents block of one batch when the company's set is
# too large to send whole: the documents holding the passages
# nearest to the batch's obligations (evidence_for), the one
# with the most such passages first, each whole while
# DOCUMENT_PACK_CHARS lasts — and a document too long for what
# is left in its nearest passages only, marked as excerpts.
# The documents left out stay in the profile's list, by title
# and summary; the prompt tells the model they may hold what
# it looks for.
#
# Used by:
#   - step_gap_analysis (below)
############################################################

def nearest_documents(pc, obligations):
    doc_ref_by_id = {doc.id: ref for ref, doc in pc.document_refs.items()}
    hits = {}
    for obligation in obligations:
        for ref, chunk in evidence_for(pc, obligation, doc_ref_by_id):
            hits.setdefault(ref.split("#")[0], {}).setdefault(chunk.ordinal, chunk)
    blocks, room = [], DOCUMENT_PACK_CHARS
    for ref, chunks in sorted(hits.items(), key=lambda item: -len(item[1])):
        document = pc.document_refs.get(ref)
        if document is None or not (document.text or "").strip():
            continue
        if len(document.text) <= room:
            blocks.append(document_block(pc, ref, document))
            room -= len(document.text)
        else:
            passages = [chunk.text for _, chunk in sorted(chunks.items())]
            if sum(map(len, passages)) > room:
                break
            blocks.append(document_block(pc, ref, document, passages))
            room -= sum(map(len, passages))
    return "\n\n".join(blocks)








############################################################
# locate_quote
############################################################
#
# Where a quote stands in a document's text — the character
# it starts at — or None when the text does not hold it. The
# model's quotation marks and trailing ellipsis are not part
# of the quote, and runs of whitespace match any whitespace:
# the document's line breaks are the model's spaces.
#
# Used by:
#   - _evidence_entries (below)
############################################################

def locate_quote(text, quote):
    words = quote.strip().strip("\"'„“”«»").rstrip("….").split()
    if not words or not text:
        return None
    found = re.search(r"\s+".join(re.escape(word) for word in words), text)
    return found.start() if found else None








############################################################
# gap_data
############################################################
#
# What one gap-analysis call is asked: the act with the
# verdict that brought it into the report — an act that
# applies from a later date is to be read as preparation, one
# taken in by the company's choice as if the company were its
# addressee — and the obligations to assess, each under a
# ref. The company's profile and documents travel apart, as
# the step's shared data.
#
# Used by:
#   - step_gap_analysis (below)
#   - prompts/evals/suites.py — the gap suite
############################################################

def gap_data(act, obligations):
    blocks = []
    for index, ob in enumerate(obligations, 1):
        blocks.append("\n".join([
            f'<obligation ref="O{index}" act="{act.short_title or act.document_title}" '
            f'path="{", ".join(c.get("path", "") for c in ob.citations)}" category="{ob.category}">',
            f"Title: {ob.title}", f"Obligation: {ob.text}",
            f"Applies when: {ob.conditions or '-'}", f"Addressee: {ob.addressee or '-'}",
            f"Expected evidence: {ob.evidence or '-'}", f"Deadline/frequency: {ob.deadline or '-'}",
            "</obligation>"]))
    # A standard's requirements bind the company because it
    # adopted the standard, which the reasoning says
    heading = f"STANDARD: {act.short_title} — {act.document_title}" if act.doc_type == "standard" \
        else f"ACT: {act.document_title}"
    verdict = f"{act.applicability} — {act.reasoning}"
    if act.applies_from:
        verdict += f" It applies from {act.applies_from.isoformat()}: assess the company's readiness for it."
    if act.applicability == "not_applies":
        verdict += (" The company is assessed against it all the same, by its own choice, as good practice: "
                    "read every obligation as if the company were its addressee.")
    return f"{heading}\nApplicability verdict: {verdict}\n\nOBLIGATIONS TO ASSESS\n" + "\n\n".join(blocks)








############################################################
# step_gap_analysis
############################################################
#
# A finding for every selected obligation, fifteen to a model
# call. Each call carries the compact profile, the company's
# documents and the obligations with their conditions and
# expected evidence. The profile and the documents
# (document_pack: all of them, whole) are the step's shared
# data — the same in every call, cached by the provider after
# the first (shared_first). A set too large for that leaves
# only the profile shared, and each call brings the documents
# nearest to its own batch.
#
# The model decides the status; the severity is the
# obligation's own — its weight in the register, the same in
# every report — so a finding's severity says how much the
# obligation matters and its status how far the company is
# from it. An obligation the model skipped becomes an
# `unknown` finding saying so.
#
# Used by:
#   - analyze (below)
############################################################

def step_gap_analysis(pc, selected):
    batches = []
    for act, obligations in selected:
        for i in range(0, len(obligations), OBLIGATIONS_PER_CALL):
            batches.append((act, obligations[i:i + OBLIGATIONS_PER_CALL]))

    with pc.ctx.step("gap_analysis", input_ref={"batches": len(batches)}) as step:
        # What a breach of each provision can cost, from the tiers the corpus has read —
        # another act's tiers only when that act is among those the report assesses
        consequences = Consequences()
        binding = {act.document_id for act, _ in selected if act.document_id}
        pack = document_pack(pc)
        shared = f"COMPANY\n{pc.compact_profile_text}"
        if pack is None:
            # Ranking a large set needs both vectors of an obligation
            embed_english([ob for _, obligations in batches for ob in obligations], job_step_id=step.row.id)
        else:
            shared += f"\n\nDOCUMENTS\n{pack or '(none provided)'}"
        done = {"n": 0}
        quotes = {"placed": 0, "unplaced": 0}

        def assess(item):
            act, obligations = item
            pc.ctx.check_cancelled()
            documents = "" if pack is not None \
                else f"DOCUMENTS\n{nearest_documents(pc, obligations) or '(none provided)'}\n\n"
            data = documents + gap_data(act, obligations)
            run = run_prompt("report.gap_analysis", data, shared=shared, schema=GAP_SCHEMA, schema_name="findings",
                             variables=pc.variables(), job_step_id=step.row.id, user_id=pc.user_id)
            done["n"] += 1
            pc.ctx.progress("gap_analysis", int(done["n"] * 100 / max(len(batches), 1)),
                            f"{done['n']}/{len(batches)} batches")
            return act, obligations, run.object or {}

        unit_ids = {c.get("unitId") for _, obligations in batches for ob in obligations for c in ob.citations}
        units = LegalUnit.objects.in_bulk([u for u in unit_ids if u])
        answers = shared_first(assess, batches)
        rows, order = [], 0
        for act, obligations, answer in answers:
            verdicts = {v.get("obligationRef"): v for v in answer.get("findings", [])}
            for index, ob in enumerate(obligations, 1):
                verdict = verdicts.get(f"O{index}")
                if verdict is None:
                    verdict = {"status": "unknown", "evidence": [],
                               "analysis": UNANSWERED["obligation"][pc.report.language], "recommendation": ""}
                order += 1
                rows.append(Finding(
                    id=str(uuid.uuid4()), report=pc.report, act=act, obligation=ob, source_kind=ob.source_kind,
                    # No sanction hangs over an act that does not bind the company yet
                    consequence=(consequences.of(act.document_id, [c.get("path") for c in ob.citations], binding)
                                 if ob.source_kind == "legal" and act.document_id and act.assessment != "upcoming" else []),
                    document_title=act.document_title, short_title=act.short_title,
                    obligation_title=(ob.title_en if pc.report.language == "en" and ob.title_en else ob.title),
                    obligation_text=(ob.text_en if pc.report.language == "en" and ob.text_en else ob.text),
                    obligation_reviewed=ob.status == "approved",
                    category=ob.category,
                    status=verdict.get("status") if verdict.get("status") in FINDING_STATUSES else "unknown",
                    severity=ob.severity if ob.severity in SEVERITIES else "medium",
                    analysis=verdict.get("analysis", ""), recommendation=verdict.get("recommendation", ""),
                    evidence=_evidence_entries(pc, verdict.get("evidence", []), quotes),
                    citations=[{**c, "documentTitle": act.short_title or act.document_title,
                                "url": citation_url(act.document, units.get(c.get("unitId")))
                                if act.document_id else act.source_url} for c in ob.citations],
                    deadline=ob.deadline, order=order))
        rows.sort(key=lambda f: (STATUS_ORDER.get(f.status, 9), SEVERITY_ORDER.get(f.severity, 9)))
        for position, row in enumerate(rows, 1):
            row.order = position
        Finding.objects.bulk_create(rows, batch_size=200)
        counts = {status: sum(r.status == status for r in rows) for status in FINDING_STATUSES}
        step.output = {**counts, "documents": "all" if pack is not None else "nearest",
                       "quotesPlaced": quotes["placed"], "quotesUnplaced": quotes["unplaced"]}
    return rows








############################################################
# _evidence_entries
############################################################
#
# The model's evidence → stored entries, each with its quote:
# a credential (C…), the profile, or a place in a document
# (D…) — kind "passage", with `start`, the character at which
# the quote stands in the document's text (locate_quote). A
# quote the document does not hold word for word keeps its
# document and gets no place: the reader sees what the model
# claimed, and that it could not be pointed to. Unknown refs
# are dropped. `quotes` counts the placed and the unplaced.
#
# Used by:
#   - step_gap_analysis (above)
############################################################

def _evidence_entries(pc, items, quotes):
    entries = []
    for item in items:
        ref, quote = str(item.get("ref", "")).strip().split("#")[0], str(item.get("quote", ""))[:600]
        if ref in pc.credential_refs:
            cred = pc.credential_refs[ref]
            entries.append({"kind": "credential", "id": cred.id, "title": cred.name, "quote": quote})
        elif ref in pc.document_refs:
            doc = pc.document_refs[ref]
            start = locate_quote(doc.text or "", quote)
            quotes["placed" if start is not None else "unplaced"] += 1
            entries.append({"kind": "passage", "id": doc.id, "title": doc.title, "quote": quote, "start": start})
        elif ref.upper() == "PROFILE":
            entries.append({"kind": "profile", "id": pc.company.id, "title": pc.company.name, "quote": quote})
    return entries








############################################################
# _problem_line
############################################################
#
# One wrong reference as the action plan reads it: the
# document, the reference as written and its claim, then what
# the provision really covers (a mismatch) or that the act
# has no such provision (not found).
#
# Used by:
#   - step_action_plan (below)
############################################################

def _problem_line(citation):
    cited = ", ".join([citation.act, f"article {citation.article}"]
                      + ([f"paragraph {citation.paragraph}"] if citation.paragraph else [])
                      + ([f"point {citation.point}"] if citation.point else []))
    line = f'- "{citation.document_title}" cites {cited} for: {citation.claim[:300]} — '
    if citation.status == "found":
        return (line + f"that provision ({citation.short_title} {citation.unit_path}) actually covers: "
                f"{citation.heading or '-'}. {citation.note[:300]}")
    return line + f"{citation.short_title or citation.act} has no such provision in its current version."








############################################################
# plan_parts
############################################################
#
# The open findings as the planning calls take them: a list
# of parts, each a list of themes with their findings. A
# theme is the obligation's category — which is also who owns
# the work. Whole themes are packed together, the largest
# first, up to PLAN_FINDINGS_PER_CALL findings a part; a
# theme larger than that is cut into parts of its own.
#
# Used by:
#   - step_action_plan (below)
#   - analysis/estimate.py — how many planning calls a run makes
############################################################

def plan_parts(findings):
    themes = {}
    for finding in findings:
        themes.setdefault(finding.category, []).append(finding)
    parts, current, size = [], [], 0
    for theme, rows in sorted(themes.items(), key=lambda item: (-len(item[1]), item[0])):
        for i in range(0, len(rows), PLAN_FINDINGS_PER_CALL):
            chunk = rows[i:i + PLAN_FINDINGS_PER_CALL]
            if current and size + len(chunk) > PLAN_FINDINGS_PER_CALL:
                parts.append(current)
                current, size = [], 0
            current.append((theme, chunk))
            size += len(chunk)
    if current:
        parts.append(current)
    return parts








############################################################
# _nearest_action
############################################################
#
# The action a finding joins when its planning call closed it
# with none: the drafted action whose findings are most like
# it — of the same act and theme, else of the same theme,
# else any — and among those the one that closes the most.
# None when the call drafted no action that closes anything.
#
# Used by:
#   - step_action_plan (below)
############################################################

def _nearest_action(drafts, finding):
    alike = (lambda f: f.act_id == finding.act_id and f.category == finding.category,
             lambda f: f.category == finding.category,
             lambda f: True)
    for test in alike:
        near = [draft for draft in drafts if any(test(f) for f in draft["findings"])]
        if near:
            return max(near, key=lambda draft: len(draft["findings"]))
    return None








############################################################
# merge_drafts
############################################################
#
# One plan out of the actions the planning calls drafted.
# Each call plans its part without sight of the others, so
# the drafts overlap — three of them amend the same policy,
# four ask the same officer for evidence. The model is given
# every draft that closes findings and answers the actions
# of the plan, each naming the drafts it merges (prompt
# report.plan_merge); an action then closes what its drafts
# closed, so no finding loses its action. A draft the answer
# left out stays an action as drafted; a ref it invented is
# ignored. The corrective and fact-finding drafts are few and
# pass through as they are.
#
# Used by:
#   - step_action_plan (below)
############################################################

def merge_drafts(pc, step, drafts, upcoming):
    merging = [d for d in drafts if d["kind"] == "findings"]
    refs = {f"A{i}": draft for i, draft in enumerate(merging, 1)}
    lines = []
    for ref, draft in refs.items():
        item = draft["item"]
        later = all(f.act_id in upcoming for f in draft["findings"])
        lines.append(f"- [{ref}] {'PREPARATION / ' if later else ''}{item.get('timeframe')} / {item.get('ownerRole') or '-'} / "
                     f"{item.get('category')} / effort {item.get('effort')} / closes {len(draft['findings'])} findings — "
                     f"{item.get('title')}: {str(item.get('description', ''))[:600]}")
    run = run_prompt("report.plan_merge", f"COMPANY\n{pc.compact_profile_text}\n\nDRAFT ACTIONS\n" + "\n".join(lines),
                     schema=MERGE_SCHEMA, schema_name="plan_merge", variables=pc.variables(),
                     job_step_id=step.row.id, user_id=pc.user_id)
    merged, taken = [], set()
    for item in (run.object or {}).get("actions", []):
        parts = [ref for ref in dict.fromkeys(item.get("draftRefs", [])) if ref in refs and ref not in taken]
        taken.update(parts)
        if parts:
            merged.append({"item": item, "kind": "findings", "findings": [f for ref in parts for f in refs[ref]["findings"]]})
    return (merged + [draft for ref, draft in refs.items() if ref not in taken]
            + [d for d in drafts if d["kind"] != "findings"])








############################################################
# step_action_plan
############################################################
#
# The plan that closes the report's gaps. Every open finding
# (missing / partial / unknown) is planned — theme by theme,
# in as many calls as plan_parts makes of them, each call
# told to close every finding it is given — so no gap is left
# without an action however many there are (a plan made in
# one call from the 160 gravest findings left four fifths of
# a large report's gaps unplanned). Two more calls, when
# there is something for them: the citation audit's wrong
# references (mismatch, not_found), which call for corrective
# actions, and the acts whose applicability waits for facts,
# which call for finding those facts out.
#
# What the model is not asked: which finding belongs to
# which call (the themes decide), and the order of the whole
# plan — an action's priority is its place when the actions
# are sorted by what they close: today's gaps before
# preparation for acts not yet in force, then the gravest
# obligation, a gap before a lack of evidence, the sooner
# timeframe, the more findings. A finding a call left out
# joins the action nearest to it (_nearest_action), and an
# action that closes nothing is dropped; the step's output
# counts the findings planned, those added this way and
# those left without an action. When the findings took more
# than one call, the drafts are merged into one plan
# (merge_drafts) — a report of 645 open findings came out as
# 48 overlapping drafts.
#
# Used by:
#   - analyze (below)
############################################################

def step_action_plan(pc, acts, findings, citations=()):
    open_findings = [f for f in findings if f.status in ("missing", "partial", "unknown")]
    open_findings.sort(key=lambda f: (SEVERITY_ORDER.get(f.severity, 9), STATUS_ORDER.get(f.status, 9)))
    problems = [c for c in citations
                if citation_verdict(c.status, c.heading_match) in ("mismatch", "not_found")][:MAX_CITATIONS_FOR_PLAN]
    unconfirmed = [a for a in acts if a.assessment == "unconfirmed"]
    upcoming = {a.id: a.applies_from for a in acts if a.assessment == "upcoming" and a.applies_from}
    refs = {f"F{i}": f for i, f in enumerate(open_findings, 1)}
    ref_of = {f.id: ref for ref, f in refs.items()}

    jobs = []
    for part in plan_parts(open_findings):
        blocks = []
        for theme, rows in part:
            lines = [f"- [{ref_of[f.id]}] {f.severity.upper()} / {f.status}"
                     f"{' / applies from ' + upcoming[f.act_id].isoformat() if f.act_id in upcoming else ''} — "
                     f"{f.short_title or f.document_title} ({', '.join(c.get('path', '') for c in f.citations)}): "
                     f"{f.obligation_title}. Gap: {f.analysis[:280]} Fix: {f.recommendation[:220]}" for f in rows]
            blocks.append(f"THEME: {theme} ({len(rows)} findings)\n" + "\n".join(lines))
        jobs.append(("findings", [f for _, rows in part for f in rows], "OPEN FINDINGS\n" + "\n\n".join(blocks)))
    if problems:
        jobs.append(("citations", [], "CITATION PROBLEMS (the citation audit: references in the company's own documents "
                     "to a provision that regulates something else, or that does not exist)\n"
                     + "\n".join(_problem_line(c) for c in problems)))
    if unconfirmed:
        jobs.append(("acts", [], "ACTS TO CONFIRM (not assessed: whether they apply depends on facts the profile does "
                     "not state)\n" + "\n".join(
                         f"- {a.short_title or a.document_title}: {a.reasoning[:300]} Questions: {a.conditions_to_verify[:700]}"
                         for a in unconfirmed)))

    with pc.ctx.step("action_plan", input_ref={"openFindings": len(open_findings), "citationProblems": len(problems),
                                               "actsToConfirm": len(unconfirmed), "calls": len(jobs)}) as step:
        def plan(job):
            pc.ctx.check_cancelled()
            kind, given, block = job
            run = run_prompt("report.action_plan", f"COMPANY\n{pc.compact_profile_text}\n\n{block}",
                             schema=PLAN_SCHEMA, schema_name="action_plan", variables=pc.variables(),
                             job_step_id=step.row.id, user_id=pc.user_id)
            return kind, given, (run.object or {}).get("actions", [])

        drafts, repaired, unplanned = [], 0, 0
        for kind, given, actions in parallel_map(plan, jobs, workers=WORKERS):
            wanted = {ref_of[f.id]: f for f in given}
            taken, part = set(), []
            for item in actions:
                closes = [wanted[r] for r in dict.fromkeys(item.get("findingRefs", [])) if r in wanted and r not in taken]
                taken.update(ref_of[f.id] for f in closes)
                if closes or kind != "findings":
                    part.append({"item": item, "kind": kind, "findings": closes})
            for ref, finding in wanted.items():
                if ref in taken:
                    continue
                home = _nearest_action(part, finding)
                if home is None:
                    unplanned += 1
                else:
                    home["findings"].append(finding)
                    repaired += 1
            drafts += part
        drafted, calls = len(drafts), len(jobs)
        if sum(kind == "findings" for kind, _, _ in jobs) > 1:
            pc.ctx.check_cancelled()
            drafts, calls = merge_drafts(pc, step, drafts, upcoming), calls + 1

        def rank(draft):
            closes = draft["findings"]
            if not closes:
                # Finding the facts out comes with the high gaps; a wrong
                # reference is a low one
                return (0, 1 if draft["kind"] == "acts" else 3, 0, 0, 0)
            return (int(all(f.act_id in upcoming for f in closes)),
                    min(SEVERITY_ORDER.get(f.severity, 9) for f in closes),
                    min(STATUS_ORDER.get(f.status, 9) for f in closes),
                    TIMEFRAMES.index(draft["item"].get("timeframe")) if draft["item"].get("timeframe") in TIMEFRAMES else 2,
                    -len(closes))

        rows = []
        for order, draft in enumerate(sorted(drafts, key=rank), 1):
            item = draft["item"]
            rows.append(Action(
                id=str(uuid.uuid4()), report=pc.report, title=str(item.get("title", ""))[:500],
                description=item.get("description", ""), priority=order,
                effort=item.get("effort") if item.get("effort") in EFFORTS else "medium",
                timeframe=item.get("timeframe") if item.get("timeframe") in TIMEFRAMES else "90_days",
                owner_role=str(item.get("ownerRole", ""))[:200],
                category=item.get("category") if item.get("category") in OBLIGATION_CATEGORIES else "other",
                finding_ids=[f.id for f in draft["findings"]], order=order))
        Action.objects.bulk_create(rows)
        step.output = {"actions": len(rows), "drafted": drafted, "calls": calls,
                       "planned": sum(len(d["findings"]) for d in drafts), "repaired": repaired, "unplanned": unplanned}
    return rows








############################################################
# _status_line
############################################################
#
# Finding counts as the summary reads them — the statuses by
# the names a reader knows, not the database's ("unknown" is
# "not evidenced": a summary once called 551 such findings
# "unclear").
#
# Used by:
#   - step_summary (below)
############################################################

def _status_line(counts):
    names = (("met", "met"), ("partial", "partially met"), ("missing", "not met"),
             ("unknown", "not evidenced"), ("not_applicable", "not applicable"))
    return ", ".join(f"{name}: {counts.get(key, 0)}" for key, name in names)








############################################################
# step_summary
############################################################
#
# The executive summary (markdown) and the report title. It
# is told what the report assessed and what it did not — the
# acts in force with their finding counts, in all and act by
# act (where the documents are strong and which act nothing
# provided covers is the first thing a board asks), and the
# gravest gaps (each with its act and provision, which the
# summary names),
# the acts assessed as preparation with counts of their own,
# the acts waiting for facts, the directives behind national
# law and the acts that organise an authority — then the
# plan's first actions and the citation audit's counts.
#
# Used by:
#   - analyze (below)
############################################################

def step_summary(pc, acts, findings, actions, citations=(), own=()):
    # What a breach can cost, in the words the exports use
    cost = lambda finding: consequence_text(LABELS["en"], finding)[:420]
    with pc.ctx.step("summary") as step:
        def name(act):
            return f"{act.short_title or act.document_title}{' (standard)' if act.doc_type == 'standard' else ''}"

        # Why an act is among the assessed: the verdict's reason, or
        # the company's choice to be held to an act that does not
        # bind it
        def basis(act):
            if act.applicability == "not_applies":
                return ("does not bind the company — assessed by the company's own choice, as good practice; its "
                        "findings are gaps against that practice, not breaches")
            return act.reasoning[:200]

        def counts(rows):
            return {status: sum(f.status == status for f in rows) for status in FINDING_STATUSES}

        by_mode = {mode: [a for a in acts if a.assessment == mode] for mode in ASSESSMENTS}
        upcoming_ids = {a.id for a in by_mode["upcoming"]}
        current = [f for f in findings if f.act_id not in upcoming_ids]
        later = [f for f in findings if f.act_id in upcoming_ids]
        worst = [f for f in current if f.status in ("missing", "partial") and f.severity in ("critical", "high")][:25]
        # A report with hardly a grave gap still names the gaps it has, the weightier first
        if len(worst) < 5:
            lesser = [f for f in current if f.status in ("missing", "partial") and f not in worst]
            worst += sorted(lesser, key=lambda f: SEVERITY_ORDER.get(f.severity, 9))[:5 - len(worst)]
        unreviewed = sum(not f.obligation_reviewed for f in findings)
        data = (f"COMPANY\n{pc.compact_profile_text}\n\nACTS ASSESSED (in force for the company)\n"
                + ("\n".join(f"- {name(a)}: {basis(a)}" for a in by_mode["assessed"]) or "none")
                + f"\n\nFINDING COUNTS (acts in force)\n{_status_line(counts(current))}\n"
                + "\n".join(f"- {name(a)}: {_status_line(counts([f for f in current if f.act_id == a.id]))}"
                            for a in by_mode["assessed"])
                + f"\nFindings resting on obligations not yet reviewed by a person: {unreviewed} of {len(findings)}"
                + "\n\nMOST SEVERE OPEN FINDINGS\n"
                + ("\n".join(f"- {f.severity}/{f.status}: {f.obligation_title} ({f.short_title or f.document_title}, "
                              f"{', '.join(c.get('path', '') for c in f.citations)}) — {f.analysis[:300]}"
                              + (f" | a breach can cost: {cost(f)}" if cost(f) else "") for f in worst)
                   or "none"))
        if by_mode["upcoming"]:
            data += ("\n\nUPCOMING ACTS (not yet in force for the company; assessed as preparation — their findings "
                     f"are NOT in the counts above)\n{_status_line(counts(later))}\n"
                     + "\n".join(f"- {name(a)}: applies from {a.applies_from.isoformat() if a.applies_from else '?'}"
                                  for a in by_mode["upcoming"]))
        if by_mode["unconfirmed"]:
            data += ("\n\nACTS TO CONFIRM (NOT assessed: whether they apply depends on facts the profile does not state)\n"
                     + "\n".join(f"- {name(a)}: {a.conditions_to_verify[:240]}" for a in by_mode["unconfirmed"]))
        directives = [a for a in by_mode["indirect"] if a.doc_type == "directive"]
        institutional = [a for a in by_mode["indirect"] if a.doc_type != "directive"]
        if directives:
            data += ("\n\nDIRECTIVES (NOT assessed: they bind the company through the national law that transposes them)\n"
                     + "\n".join(f"- {name(a)}" for a in directives))
        if institutional:
            data += ("\n\nINSTITUTIONAL ACTS (NOT assessed: they organise an authority or a procedure before it, and reach "
                     "the company through that authority's decisions)\n" + "\n".join(f"- {name(a)}" for a in institutional))
        left_out = [a for a in by_mode["none"] if a.applicability == "applies"]
        if left_out:
            data += ("\n\nACTS LEFT OUT (NOT assessed: they apply to the company, and the person who approved the "
                     "report's scope left them out)\n" + "\n".join(f"- {name(a)}" for a in left_out))
        from compliance.analysis.register import changes
        moved = changes(pc.report, list(findings))
        if moved is not None:
            line = lambda kind: (f"{moved[kind]['count']}"
                                 + (f" ({'; '.join(moved[kind]['titles'])})" if moved[kind]["titles"] else ""))
            data += (f"\n\nSINCE THE PREVIOUS REPORT ({moved['sinceDate']}; obligation by obligation)\n"
                     f"- gaps closed (were open, are met now): {line('closed')}\n"
                     f"- new gaps (not open or not assessed before): {line('new')}\n"
                     f"- went back (were met, are a gap again): {line('back')}")
        if own:
            gaps = sorted((f for f in own if f.status in ("missing", "partial")),
                          key=lambda f: (STATUS_ORDER.get(f.status, 9), SEVERITY_ORDER.get(f.severity, 9)))[:5]
            data += ("\n\nTHE COMPANY'S OWN POLICIES AS CRITERIA (requirements its policy-level documents set, judged by "
                     "whether its other documents carry them out; counted apart from the acts — gaps between its "
                     f"policies and its procedures, not breaches of law)\n{_status_line(counts(list(own)))}\n"
                     + "\n".join(f"- {f.status}: {f.obligation_title} ({(f.citations or [{}])[0].get('documentTitle', '')}) "
                                  f"— {f.analysis[:240]}" for f in gaps))
        data += ("\n\nACTION PLAN\n"
                 + "\n".join(f"{a.priority}. {a.title} ({a.timeframe}, {a.owner_role})" for a in actions[:30])
                 + "\n\nCITATION AUDIT (references the company's documents make to specific provisions, checked "
                   "against the corpus — checked: how many; match: correct; mismatch: the provision regulates "
                   "something else; notFound: no such provision; notInCorpus: the act is not in the corpus, not "
                   "checked; unknown: could not be judged)\n" + json.dumps(citation_counts(citations)))
        run = run_prompt("report.summary", data, schema=SUMMARY_SCHEMA, schema_name="summary",
                         variables=pc.variables(), job_step_id=step.row.id, user_id=pc.user_id)
        answer = run.object or {}
        Report.objects.filter(id=pc.report.id).update(summary=answer.get("summary", ""),
                                                      title=answer.get("title", "")[:300])
        step.output = {"chars": len(answer.get("summary", ""))}








############################################################
# finding_counts
############################################################
#
# The report's result in numbers: the findings per EFFECTIVE
# status (a reviewer's override wins, as in every view and
# export) and the open ones (missing / partial) per severity —
# over the acts in force for the company. The findings of
# acts assessed as preparation (assessment "upcoming") are
# counted apart, under "upcoming", when the report has any:
# what is not yet law for the company is not yet a gap. This
# is the part of the stats a review changes.
#
# Used by:
#   - report_stats (below)
#   - api/views.py — finding_item (a review recounts them)
############################################################

def finding_counts(report):
    findings = Finding.objects.filter(report=report).annotate(effective=Coalesce("override_status", "status"))

    def count(rows):
        return {
            "findings": {k: rows.filter(effective=k).count() for k in FINDING_STATUSES},
            "openBySeverity": {k: rows.filter(effective__in=("missing", "partial"), severity=k).count()
                               for k in SEVERITIES},
        }

    # The company's own requirements are counted apart from the acts
    own = findings.filter(act__doc_type="internal")
    findings = findings.exclude(act__doc_type="internal")
    later = findings.filter(act__assessment="upcoming")
    counts = count(findings.exclude(act__assessment="upcoming"))
    if later.exists():
        counts["upcoming"] = count(later)
    if own.exists():
        counts["internal"] = count(own)
    return counts








############################################################
# report_stats
############################################################
#
# Counts for the list views and the export cover page — the
# acts by verdict and by what the report did with them, the
# findings (finding_counts) — the tokens and USD the report's
# model calls cost over both parts of its run (the jobs filed
# under the report), and the
# provenance a reader needs to trust (or reproduce) it: which
# prompt version and model ran each step, which version of
# each act was read, how many findings rest on obligations a
# person approved. The citation audit goes in as counts only
# (stats travel with every list row; its rows are served
# with the full report).
#
# Used by:
#   - analyze (below)
############################################################

def report_stats(report):
    # The row the company's own requirements hang on is not an act
    acts = ReportAct.objects.filter(report=report).exclude(doc_type="internal")
    findings = Finding.objects.filter(report=report).exclude(source_kind="internal")
    # What moved since the company's previous report, when it has one (analysis/register.py)
    from compliance.analysis.register import changes
    moved = changes(report)
    step_ids = list(JobStep.objects.filter(job__subject=f"report:{report.id}").values_list("id", flat=True))
    calls = LlmCall.objects.filter(job_step_id__in=step_ids)
    usage = calls.aggregate(i=Sum("input_tokens"), o=Sum("output_tokens"), c=Sum("cost_usd"))
    versions = {v.id: v for v in PromptVersion.objects.select_related("prompt").filter(
        id__in=calls.exclude(prompt_version_id=None).values_list("prompt_version_id", flat=True).distinct())}
    prompts = sorted({(v.prompt.slug, v.version_no, v.model) for v in versions.values()})
    return {
        "acts": {**{k: acts.filter(applicability=k).count() for k in ("applies", "uncertain", "not_applies")},
                 **{k: acts.filter(assessment=k).count() for k in ASSESSMENTS if k != "none"}},
        **finding_counts(report),
        **({"changes": moved} if moved is not None else {}),
        "actions": Action.objects.filter(report=report).count(),
        "citations": citation_counts(ReportCitation.objects.filter(report=report).only("status", "heading_match")),
        "reviewedObligations": findings.filter(obligation_reviewed=True).count(),
        "tokens": int(usage["i"] or 0) + int(usage["o"] or 0),
        "costUsd": float(usage["c"] or 0),
        "provenance": {
            "prompts": [{"slug": slug, "version": number, "model": model} for slug, number, model in prompts],
            "models": sorted(set(calls.values_list("model", flat=True))),
            "corpus": [{"act": a.short_title or a.document_title, "versionNo": a.version.version_no,
                        "versionDate": (a.version.effective_date or a.version.created_at.date()).isoformat()}
                       for a in acts.filter(screened_out=False).select_related("version") if a.version_id],
        },
    }








############################################################
# failure_message
############################################################
#
# The report's error text: an exhausted AI budget (the
# gateway answers 402) is said in words the GUI maps; any
# other failure keeps its message.
#
# Used by:
#   - analyze (below)
############################################################

def failure_message(exc):
    if isinstance(exc, GatewayError) and exc.status == 402:
        return ("AI_BUDGET_EXHAUSTED: the AI provider refused the call because its budget is used up — "
                "run the analysis again when the budget resets. Work already done (document inventories, "
                "extracted obligations) is kept and not paid for again.")
    return str(exc)[:2000]








############################################################
# _abandoned
############################################################
#
# The on_abandon hook: the job ended without the handler
# seeing it (a dead worker, a cancel while queued) — the
# report follows it instead of staying "running".
#
# Used by:
#   - jobs/registry.py — abandon
############################################################

def _abandoned(job, status, error):
    Report.objects.filter(id=(job.payload or {}).get("report_id"), status__in=("queued", "running")).update(
        status=status, error=error, finished_at=utc_now())








############################################################
# analyze
############################################################
#
# The `report.analyze` job. Payload: {report_id}. A report
# is made in two parts with a person's decision between them.
# The first part decides which acts apply (profile, documents,
# citation audit, applicability) and is cheap; the second
# judges every obligation of those acts and is where the
# money goes. A report started with scope.review stops
# between them in "scope_review" until a person approves the
# list of acts — changed or not — and the job is queued a
# second time (analysis/api/views.py, report_scope); the
# stamp scope_approved_at tells the second part from the
# first. Without the review the run stamps itself and goes on.
#
# The second part reads the acts and the citation audit from
# their rows and the documents' inventories from their cache.
# The company it reads again, as it is when the scope is
# approved: a credential verified or a document added while
# the report waited counts. So the profile is frozen a second
# time there — the report shows the company its findings were
# judged on, not the one of the day it was started.
#
# A worker shutdown (WorkerStopping) or a takeover (JobLost)
# leaves the report as it is — the job is re-run from the
# start of its part, or already runs elsewhere.
#
# Used by:
#   - analysis/api/views.py — POST /api/reports,
#     POST /api/reports/{id}/scope
############################################################

@register("report.analyze", max_attempts=1, on_abandon=_abandoned)
def analyze(job, ctx):
    report = Report.objects.select_related("company").get(id=job.payload["report_id"])
    first = report.scope_approved_at is None
    # A run recovered after a worker died starts its part over —
    # rows of the interrupted attempt must not double up
    with transaction.atomic():
        Action.objects.filter(report=report).delete()
        Finding.objects.filter(report=report).delete()
        if first:
            ReportAct.objects.filter(report=report).delete()
            ReportCitation.objects.filter(report=report).delete()
        Report.objects.filter(id=report.id).update(status="running", started_at=report.started_at or utc_now(),
                                                   error=None, summary="", title="", stats={})
    pc = Context(report, ctx, job.created_by_id)
    try:


        # STEP 1: which acts apply — then a person's approval
        # ===================================================
        if first:
            step_profile(pc)
            step_documents(pc)
            citations = step_citations(pc)
            step_applicability(pc)
            if report.scope.get("review"):
                Report.objects.filter(id=report.id).update(status="scope_review", stats=report_stats(report))
                return {"reportId": report.id, "waiting": "scope"}
            Report.objects.filter(id=report.id).update(scope_approved_at=utc_now())
        else:
            freeze_profile(pc)
            step_documents(pc)
            citations = list(ReportCitation.objects.filter(report=report).order_by("order"))


        # STEP 2: the approved acts, obligation by obligation
        # ===================================================
        acts = list(ReportAct.objects.filter(report=report, assessment__in=("assessed", "upcoming"))
                    .select_related("document").order_by("order"))
        selected = step_obligations(pc, acts)
        findings = step_gap_analysis(pc, selected)
        judged = list(ReportAct.objects.filter(report=report, screened_out=False).order_by("order"))
        # The company's own rules as criteria, when the report was started with them:
        # a group beside the acts — planned with the rest, counted and summarised apart
        own = []
        if report.scope.get("internal"):
            from compliance.analysis.internal import step_internal
            own = step_internal(pc)
        actions = step_action_plan(pc, judged, findings + own, citations)
        step_summary(pc, judged, findings, actions, citations, own)
    except JobCancelled:
        Report.objects.filter(id=report.id).update(status="cancelled", finished_at=utc_now())
        raise
    except (WorkerStopping, JobLost):
        raise
    except Exception as exc:
        Report.objects.filter(id=report.id).update(status="failed", error=failure_message(exc), finished_at=utc_now())
        raise
    with transaction.atomic():
        Report.objects.filter(id=report.id).update(status="done", finished_at=utc_now(), stats=report_stats(report))
    return {"reportId": report.id, "findings": len(findings), "actions": len(actions)}
