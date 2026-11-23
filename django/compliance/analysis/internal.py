############################################################
#  [*] analysis.internal — the company's own rules as criteria
#
#    source_documents(company) → its policy-level documents
#    read_requirements(company, …) → how many documents were read
#    internal_data(document, obligations) → what one call is asked
#    internal_estimate(company) → {documents, requirements, usd}
#    step_internal(pc) → the findings of the group
#
#  A report measures a company against the law. A compliance
#  function also has to know whether the company does what it
#  told itself to do: whether its procedures carry out what
#  its own policies require. A report started with the
#  `internal` option adds that as a group of its own.
#
#  The requirements are read out of the company's
#  policy-level documents — level 1 and 2 of its compliance
#  policy's document hierarchy when the company has one, the
#  documents filed as policies otherwise — one document a
#  call, each requirement with the passage it comes from,
#  placed in the document. They are kept as obligations of
#  the kind "internal" (corpus.Obligation), read once per
#  uploaded file and prompt version; a person's approved or
#  rejected ones survive a re-reading.
#
#  Each is then judged against the company's whole library,
#  as the gap analysis judges a legal obligation, with one
#  difference the prompt carries: the policy that states a
#  requirement is the criterion and never the evidence — what
#  counts is another document that carries it out. The
#  findings hang on one act row of the report (doc_type
#  "internal") and are counted apart from the acts
#  (stats.internal): they are gaps between the company's
#  policies and its procedures, not breaches of law. Their
#  open ones go into the action plan with the rest.
#
#  The step stands beside the report's main path and changes
#  nothing in it. A library too large to send whole is not
#  assessed this way: the step says so and adds nothing.
############################################################


import uuid
from datetime import timedelta

from django.db import transaction

from compliance.analysis import pipeline
from compliance.analysis.models import FINDING_STATUSES, SEVERITIES, Finding, ReportAct
from compliance.assistant.llm import run_prompt
from compliance.assistant.usage import cost_of
from compliance.common.timestamps import utc_now
from compliance.companies.models import CompanyDocument
from compliance.corpus.models import OBLIGATION_CATEGORIES, Obligation
from compliance.prompts.schemas import FILLED
from compliance.prompts.store import active_version


# How many requirements one document may give, how much of it
# is read, and how many a call judges
REQUIREMENTS_PER_DOCUMENT = 20
READ_CHARS = 80_000
PER_CALL = 15
# What an unread policy document is expected to give, for the estimate
EXPECTED_PER_DOCUMENT = 8

TITLE = {"lt": "Įmonės vidaus reikalavimai", "en": "The company's own requirements"}
SHORT = {"lt": "Vidaus reikalavimai", "en": "Own requirements"}
REASONING = {
    "lt": ("Įmonės politikos lygmens dokumentų nustatyti reikalavimai, vertinami pagal tai, ar juos įgyvendina kiti "
           "įmonės dokumentai. Tai įmonės pačios sau nustatytos taisyklės, ne teisės aktų pareigos."),
    "en": ("Requirements the company's policy-level documents set, assessed by whether its other documents carry "
           "them out. They are rules the company set for itself, not duties under an act."),
}

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["requirements"],
    "properties": {"requirements": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["title", "text", "section", "quote", "addressee", "category", "severity"],
        "properties": {
            "title": FILLED,
            "text": FILLED,
            "section": {"type": "string"},
            # Located in the document, and what a requirement is known by when the policy is read again
            "quote": FILLED,
            "addressee": {"type": "string"},
            "category": {"type": "string", "enum": list(OBLIGATION_CATEGORIES)},
            "severity": {"type": "string", "enum": list(SEVERITIES)},
        }}}},
}








############################################################
# source_documents
############################################################
#
# The documents whose requirements are the criteria: those
# the company's compliance policy places on level 1 or 2 of
# its document hierarchy (the approved policy, or the latest
# draft when none is approved); without a policy product, the
# documents filed as policies. Only documents with text.
#
# Used by:
#   - read_requirements, internal_estimate, step_internal (below)
############################################################

def source_documents(company):
    from compliance.programme.models import WorkProduct

    documents = list(CompanyDocument.objects.filter(company=company).exclude(text="").order_by("uploaded_at"))
    products = WorkProduct.objects.filter(company=company, kind="policy")
    product = (products.filter(status="approved").order_by("-version").first()
               or products.filter(status="draft").order_by("-version").first())
    levels = {row.get("documentId"): row.get("level") for row in ((product.content or {}).get("hierarchy") or [])} \
        if product is not None else {}
    if any(level in (1, 2) for level in levels.values()):
        return [document for document in documents if levels.get(document.id) in (1, 2)]
    return [document for document in documents if document.kind == "policy"]








############################################################
# read_requirements
############################################################
#
# Reads the requirements out of every source document whose
# file or the prompt changed since it was last read — one
# document a call — and keeps them as the company's internal
# obligations: the proposed ones of a document are replaced,
# what a person approved or rejected stays. Each keeps the
# passage it comes from, placed in the document where it is
# found word for word. A requirement read again from the
# same passage is the same requirement and keeps its id — a
# policy edited elsewhere must not cut its earlier findings
# and the register's actions off from it. Answers how many
# documents were read.
#
# Used by:
#   - step_internal (below)
############################################################

def read_requirements(company, documents, language, step_id=None, user_id=None, tick=None):
    version = active_version("company.internal_requirements")
    read = 0
    for document in documents:
        key = f"{document.sha256}:{version.id}"
        if document.requirements_key == key:
            continue
        if tick is not None:
            tick(document)
        run = run_prompt("company.internal_requirements",
                         f'<document title="{document.title}" kind="{document.kind}">\n{document.text[:READ_CHARS]}\n</document>',
                         schema=SCHEMA, schema_name="internal_requirements",
                         variables={"LANGUAGE": language, "COMPANY_NAME": company.name},
                         job_step_id=step_id, user_id=user_id)
        now, rows = utc_now(), []
        for item in (run.object or {}).get("requirements", [])[:REQUIREMENTS_PER_DOCUMENT]:
            title, text = str(item.get("title") or "").strip(), str(item.get("text") or "").strip()
            if not title or not text:
                continue
            quote = str(item.get("quote") or "").strip()[:600]
            rows.append(Obligation(
                id=str(uuid.uuid4()), source_kind="internal", company=company, company_document=document,
                title=title[:300], text=text[:2000], addressee=str(item.get("addressee") or "")[:300],
                category=item.get("category") if item.get("category") in OBLIGATION_CATEGORIES else "other",
                severity=item.get("severity") if item.get("severity") in SEVERITIES else "medium",
                citations=[{"path": str(item.get("section") or "").strip()[:200], "documentId": document.id,
                            "documentTitle": document.title, "quote": quote,
                            "start": pipeline.locate_quote(document.text or "", quote) if quote else None}],
                status="proposed", prompt_version_id=version.id, model=run.result.model or version.model,
                # A step apart each, so the requirements keep the order the policy states them in
                created_at=now + timedelta(microseconds=len(rows)), updated_at=now))
        with transaction.atomic():
            proposed = Obligation.objects.filter(source_kind="internal", company=company, company_document=document,
                                                 status="proposed")
            passage = lambda row: " ".join(str((row.citations or [{}])[0].get("quote") or "").split())
            known = {passage(row): row.id for row in proposed if passage(row)}
            for row in rows:
                row.id = known.pop(passage(row), row.id)
            kept = [row for row in rows if proposed.filter(id=row.id).exists()]
            proposed.exclude(id__in=[row.id for row in kept]).delete()
            Obligation.objects.bulk_update(kept, ["title", "text", "addressee", "category", "severity", "citations",
                                                  "prompt_version_id", "model", "created_at", "updated_at"])
            Obligation.objects.bulk_create([row for row in rows if row not in kept])
            CompanyDocument.objects.filter(id=document.id).update(requirements_key=key)
        document.requirements_key = key
        read += 1
    return read








############################################################
# internal_data
############################################################
#
# What one call is asked: the policy the requirements come
# from, and the requirements to judge, each under a ref with
# the section and the passage that states it. The company's
# profile and its whole library travel apart, as the step's
# shared data.
#
# Used by:
#   - step_internal (below)
############################################################

def internal_data(document, obligations):
    blocks = []
    for index, ob in enumerate(obligations, 1):
        cited = (ob.citations or [{}])[0]
        blocks.append("\n".join([
            f'<obligation ref="O{index}" section="{cited.get("path", "")}" category="{ob.category}">',
            f"Title: {ob.title}", f"Requirement: {ob.text}", f"Addressee: {ob.addressee or '-'}",
            f"Stated in the policy as: \"{cited.get('quote', '')}\"", "</obligation>"]))
    return (f'INTERNAL POLICY: "{document.title}" — a rule-setting document of the company itself\n\n'
            "REQUIREMENTS TO ASSESS\n" + "\n\n".join(blocks))








############################################################
# internal_estimate
############################################################
#
# What the option adds to a report's price: the policy-level
# documents, how many of them are still to be read, the
# requirements there are or are expected, and the USD of
# reading and judging them — the judging priced like the gap
# analysis, one first call that writes the library to the
# provider's cache and the rest reading it.
#
# Used by:
#   - analysis/estimate.py — estimate_report, estimate_rest
############################################################

def internal_estimate(company):
    from compliance.analysis import estimate

    documents = source_documents(company)
    version = estimate._active_version("company.internal_requirements")
    unread = [d for d in documents if version is None or d.requirements_key != f"{d.sha256}:{version.id}"]
    known = Obligation.objects.filter(source_kind="internal", company=company,
                                      company_document__in=[d for d in documents if d not in unread]) \
        .exclude(status="rejected").count()
    requirements = known + len(unread) * EXPECTED_PER_DOCUMENT
    read_tokens = sum(min(d.char_count or len(d.text), READ_CHARS) for d in unread) / estimate.CHARS_PER_TOKEN
    usd = float(cost_of(estimate._model_of("company.internal_requirements"), int(read_tokens), int(len(unread) * 1500)))
    if requirements:
        usd += estimate._gap_price(company, requirements, "report.internal_gap")
    return {"documents": len(documents), "requirements": requirements, "usd": round(usd, 2)}








############################################################
# step_internal
############################################################
#
# The report's `internal` step: reads the requirements of the
# policy-level documents that were not read yet, gives the
# report the act row the group hangs on, has the requirements
# judged — a policy's own at a time, the first call alone so
# that the others read the library from the provider's cache
# — and stores the findings after the report's others.
# Answers them. A company without policy-level documents, or
# with a library too large to send whole, gets no group.
#
# Used by:
#   - analysis/pipeline.py — analyze
############################################################

def step_internal(pc):
    report, language = pc.report, pc.report.language if pc.report.language in TITLE else "lt"
    with pc.ctx.step("internal") as step:
        sources = source_documents(pc.company)
        pack = pipeline.document_pack(pc)
        if not sources or pack is None:
            step.output = {"documents": len(sources), "skipped": "no policy-level documents" if not sources
                           else "the library is too large to read whole"}
            return []
        read = read_requirements(
            pc.company, sources, pc.language, step.row.id, pc.user_id,
            tick=lambda document: (pc.ctx.check_cancelled(),
                                   pc.ctx.progress("internal", None, f"reading {document.title[:60]}")))
        by_document = {}
        for ob in Obligation.objects.filter(source_kind="internal", company=pc.company, company_document__in=sources) \
                .exclude(status="rejected").order_by("created_at", "id"):
            by_document.setdefault(ob.company_document_id, []).append(ob)
        batches = [(document, by_document[document.id][i:i + PER_CALL]) for document in sources if document.id in by_document
                   for i in range(0, len(by_document[document.id]), PER_CALL)]
        if not batches:
            step.output = {"documents": len(sources), "read": read, "requirements": 0}
            return []
        act = ReportAct.objects.create(
            id=str(uuid.uuid4()), report=report, document=None, document_title=TITLE[language], short_title=SHORT[language],
            doc_type="internal", applicability="applies", confidence=1.0, reasoning=REASONING[language],
            assessment="assessed", order=(ReportAct.objects.filter(report=report).count() + 1))
        shared = f"COMPANY\n{pc.compact_profile_text}\n\nDOCUMENTS\n{pack or '(none provided)'}"
        done, quotes = {"n": 0}, {"placed": 0, "unplaced": 0}

        def assess(item):
            document, obligations = item
            pc.ctx.check_cancelled()
            run = run_prompt("report.internal_gap", internal_data(document, obligations), shared=shared,
                             schema=pipeline.GAP_SCHEMA, schema_name="findings", variables=pc.variables(),
                             job_step_id=step.row.id, user_id=pc.user_id)
            done["n"] += 1
            pc.ctx.progress("internal", int(done["n"] * 100 / len(batches)), f"{done['n']}/{len(batches)} batches")
            return obligations, run.object or {}

        rows = []
        for obligations, answer in pipeline.shared_first(assess, batches):
            verdicts = {verdict.get("obligationRef"): verdict for verdict in answer.get("findings", [])}
            for index, ob in enumerate(obligations, 1):
                verdict = verdicts.get(f"O{index}") or {"status": "unknown", "evidence": [], "recommendation": "",
                                                        "analysis": pipeline.UNANSWERED["requirement"][report.language]}
                rows.append(Finding(
                    id=str(uuid.uuid4()), report=report, act=act, obligation=ob, source_kind="internal",
                    document_title=act.document_title, short_title=act.short_title,
                    obligation_title=ob.title, obligation_text=ob.text, obligation_reviewed=ob.status == "approved",
                    category=ob.category,
                    status=verdict.get("status") if verdict.get("status") in FINDING_STATUSES else "unknown",
                    severity=ob.severity if ob.severity in SEVERITIES else "medium",
                    analysis=verdict.get("analysis", ""), recommendation=verdict.get("recommendation", ""),
                    evidence=pipeline._evidence_entries(pc, verdict.get("evidence", []), quotes),
                    citations=[dict(citation) for citation in ob.citations], deadline=""))
        rows.sort(key=lambda f: (pipeline.STATUS_ORDER.get(f.status, 9), pipeline.SEVERITY_ORDER.get(f.severity, 9)))
        after = Finding.objects.filter(report=report).count()
        for position, row in enumerate(rows, after + 1):
            row.order = position
        Finding.objects.bulk_create(rows, batch_size=200)
        step.output = {"documents": len(sources), "read": read, "requirements": len(rows),
                       **{status: sum(r.status == status for r in rows) for status in FINDING_STATUSES},
                       "quotesPlaced": quotes["placed"], "quotesUnplaced": quotes["unplaced"]}
    return rows
