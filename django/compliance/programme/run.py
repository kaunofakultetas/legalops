############################################################
#  [*] programme.run — a work product is generated
#
#    job programme.generate {product_id}
#    Run — what a kind's generation is given
#    Library(company) — what a kind's rules are checked against
#    check(rule, ok, detail="", blocking=True) → one rule's result
#
#  The job reads the company the way a report does: its
#  profile, every document whole (the same block in every
#  call, so the provider caches it), its latest finished
#  report, and the earlier products this kind builds on — the
#  approved version of each, or the latest draft when none is
#  approved yet. The kind's module then asks the model
#  (generate) and the answer goes through the kind's rules
#  (validate), which also verify every reference it makes:
#  a quote must stand in the document it names, a provision
#  must be in the corpus and — judged once, when the product
#  is generated — regulate what the text says of it. The
#  product comes out a draft: a person edits it — through the
#  same rules — and approves it.
#
#  A document set too large to send whole is not supported
#  yet: the run fails saying so, rather than write a policy
#  from excerpts.
############################################################


import re

from django.db import transaction
from django.db.models import Sum

from compliance.analysis import pipeline
from compliance.analysis.models import Report
from compliance.assistant.llm import run_prompt
from compliance.assistant.models import LlmCall
from compliance.common.parallel import parallel_map
from compliance.common.timestamps import utc_now
from compliance.companies.inventory import ensure_inventory
from compliance.companies.models import CompanyStandard
from compliance.corpus.citations import MAX_ITEMS, check_citations
from compliance.jobs.models import JobStep
from compliance.jobs.registry import JobCancelled, JobLost, WorkerStopping, register
from compliance.programme.models import WorkProduct


# How far through a run each of its four steps begins, in per
# cent: the documents, the kind's two model calls, the references
STARTS = (0, 5, 50, 92)
from compliance.prompts.models import PromptVersion


WORKERS = 4








############################################################
# check
############################################################
#
# One rule of a kind as a product's content met or broke it.
# A broken blocking rule keeps the product from approval; the
# others are shown as warnings.
#
# Used by:
#   - the kinds' validate functions
############################################################

def check(rule, ok, detail="", blocking=True):
    return {"rule": rule, "ok": bool(ok), "blocking": blocking, "detail": detail}








############################################################
# _numbered
############################################################
#
# An article and a paragraph as bare numbers, whatever way
# the text names them: a plain article is its number, and an
# article named with its paragraph, in the Lithuanian or the
# EU manner, gives both — the corpus is looked up by number.
# An inserted article keeps its index, written as a
# superscript, after a caret or after a hyphen: it is another
# article than the one whose number it begins with, and the
# lookup knows both spellings (corpus/structure.py —
# number_spellings). A hyphen before a LARGER number is a
# range, read as its first article; its end is never taken
# for the paragraph.
#
# Used by:
#   - Library.provisions (below)
############################################################

def _numbered(article, paragraph):
    article, paragraph = str(article or "").strip(), str(paragraph or "").strip()
    numbers = re.findall(r"\d+[a-z]?", article)
    if not numbers:
        return article, paragraph
    first, rest = numbers[0], numbers[1:]
    inserted = re.match(r"\D*(\d+[a-z]?)(?:([⁰¹²³⁴⁵⁶⁷⁸⁹]+)|\^(\d+)|-(\d+))", article)
    if inserted:
        base, raised, caret, hyphen = inserted.groups()
        if raised:
            first = base + raised
        elif caret:
            first, rest = f"{base}^{caret}", numbers[2:]
        else:
            rest = numbers[2:]
            if int(hyphen) <= int(re.match(r"\d+", base).group()):
                first = f"{base}-{hyphen}"
    if not paragraph and rest and re.search(r"dal|\bd\.|para|\(", article, re.IGNORECASE):
        paragraph = rest[0]
    return first, (re.findall(r"\d+[a-z]?", paragraph) or [paragraph])[0]








############################################################
# Library
############################################################
#
# What a product's references are checked against: the
# company's documents (a quote must stand in the one it
# names) and the legal corpus (a provision must be there).
#
# Used by:
#   - generate (below), programme/api/views.py — a person's edit
############################################################

class Library:

    def __init__(self, company):
        self.company = company
        self.documents = list(company.documents.order_by("uploaded_at"))
        self.by_id = {document.id: document for document in self.documents}






    ############################################################
    # sources
    ############################################################
    #
    # The quotes a text rests on, each tied to its document
    # and to the place it starts at — None when the document
    # does not hold it word for word. An entry naming no
    # document of the company is dropped.
    #
    # Used by:
    #   - the kinds' validate functions
    ############################################################

    def sources(self, entries):
        placed = []
        for entry in entries or []:
            document = self.by_id.get(entry.get("documentId"))
            quote = str(entry.get("quote", "")).strip()
            if document is None or not quote:
                continue
            placed.append({"documentId": document.id, "document": document.title, "quote": quote[:1000],
                           "start": pipeline.locate_quote(document.text or "", quote)})
        return placed






    ############################################################
    # provisions
    ############################################################
    #
    # The provisions a text names, each looked up in the
    # corpus: found or not, and when found its path, the act's
    # short title and the link to the official text. With a
    # job step to file the calls under, the citation judge
    # also says whether the provision regulates what the text
    # claims of it (`match`); without one — a person's edit —
    # an entry keeps the judgment it came with. Entries
    # without an act or an article are dropped.
    #
    # Used by:
    #   - the kinds' validate functions
    ############################################################

    def provisions(self, entries, judge=None):
        asked = [{"act": str(entry.get("act") or "").strip(),
                  **dict(zip(("article", "paragraph"), _numbered(entry.get("article"), entry.get("paragraph")))),
                  "why": str(entry.get("why", "") or "")[:600],
                  "match": entry.get("match") if entry.get("match") in ("match", "mismatch", "unknown") else None}
                 for entry in entries or [] if isinstance(entry, dict)]
        asked = [entry for entry in asked if entry["act"] and entry["article"]]
        answers = []
        for start in range(0, len(asked), MAX_ITEMS):
            items = [{**{k: entry[k] for k in ("act", "article", "paragraph") if entry[k]},
                      **({"claimedHeading": entry["why"]} if judge and entry["why"] else {})}
                     for entry in asked[start:start + MAX_ITEMS]]
            answers += check_citations(items, use_model=bool(judge), job_step_id=judge)
        return [{**entry, "found": answer["status"] == "found", "status": answer["status"],
                 "match": (answer.get("headingMatch") if judge and answer["status"] == "found" else entry["match"]),
                 "shortTitle": answer.get("shortTitle") or entry["act"], "path": answer.get("path") or "",
                 "citationUrl": answer.get("citationUrl") or ""} for entry, answer in zip(asked, answers)]








############################################################
# Run
############################################################
#
# What a kind's generation is given: the product, its
# company, the documents under their refs (D1…) and whole as
# the calls' shared data beside the profile, the latest
# finished report, the earlier products the kind builds on,
# and `ask` — one model call filed under the step it belongs
# to. The attributes a report's context carries are named the
# same, so the report's profile and document rendering serve
# here too.
#
# Used by:
#   - generate (below), the kinds' generate functions
############################################################

class Run:

    def __init__(self, product, ctx, user_id, needs=(), steps=()):
        self.product, self.company, self.ctx, self.user_id = product, product.company, ctx, user_id
        self.order = ("documents", *steps, "references")
        self.lt = product.language == "lt"
        self.language = "Lithuanian" if self.lt else "English"
        self.today = utc_now().date()
        self.library = Library(self.company)
        self.documents = self.library.documents
        self.credentials = list(self.company.credentials.order_by("created_at"))
        self.standards = list(CompanyStandard.objects.filter(company=self.company)
                              .select_related("document", "certificate").order_by("created_at"))
        self.credential_refs = {f"C{i}": c for i, c in enumerate(self.credentials, 1)}
        self.document_refs = {f"D{i}": d for i, d in enumerate(self.documents, 1)}
        self.inventories = {}
        self.report = Report.objects.filter(company=self.company, status="done").order_by("-created_at").first()
        self.earlier = {}
        for kind in needs:
            rows = WorkProduct.objects.filter(company=self.company, kind=kind, status__in=("approved", "draft"))
            self.earlier[kind] = (rows.filter(status="approved").order_by("-version").first()
                                  or rows.order_by("-version").first())
        self.shared = ""






    ############################################################
    # prepare
    ############################################################
    #
    # Reads every document's inventory (cached per document)
    # and builds what every call shares: the profile and the
    # documents whole.
    #
    # Used by:
    #   - generate (below)
    ############################################################

    def prepare(self, step):
        def read(document):
            self.ctx.check_cancelled()
            return document.id, ensure_inventory(document, language=self.language, step_id=step.row.id,
                                                 user_id=self.user_id)
        for document_id, inventory in parallel_map(read, self.documents, workers=WORKERS):
            self.inventories[document_id] = inventory
        pack = pipeline.document_pack(self)
        if pack is None:
            raise RuntimeError("The company's documents are too many to read whole — work products are not "
                               "generated from excerpts.")
        self.shared = (f"COMPANY\n{pipeline.render_profile(self, compact=True)}\n\n"
                       f"DOCUMENTS\n{pack or '(none provided)'}")






    ############################################################
    # step
    ############################################################
    #
    # Opens a step of the run and says on the job where the
    # run stands — the step's name and how far through the
    # whole it begins — which is what the page shows while a
    # person waits. The two model calls are nearly all of a
    # run's time; reading the documents and checking the
    # references are its edges.
    #
    # Used by:
    #   - generate (below), the kinds' generate functions
    ############################################################

    def step(self, name):
        self.ctx.progress(name, STARTS[self.order.index(name)] if name in self.order else None)
        return self.ctx.step(name)






    ############################################################
    # ask
    ############################################################
    #
    # One model call of the run, with the shared data, filed
    # under its step.
    #
    # Used by:
    #   - the kinds' generate functions
    ############################################################

    def ask(self, slug, data, schema, schema_name, step):
        self.ctx.check_cancelled()
        return run_prompt(slug, data, shared=self.shared, schema=schema, schema_name=schema_name,
                          variables={"LANGUAGE": self.language, "TODAY": self.today.isoformat(),
                                     "COMPANY_NAME": self.company.name},
                          job_step_id=step.row.id, user_id=self.user_id).object or {}






    ############################################################
    # document
    ############################################################
    #
    # The document a ref of the calls (D4) stands for, or None.
    #
    # Used by:
    #   - the kinds' generate functions
    ############################################################

    def document(self, ref):
        return self.document_refs.get(str(ref or "").strip())






    ############################################################
    # basis
    ############################################################
    #
    # What the run read, for the product's record: the report,
    # the earlier products and the documents as they stood.
    #
    # Used by:
    #   - generate (below)
    ############################################################

    def basis(self):
        return {"reportId": self.report.id if self.report else None,
                "products": {kind: {"id": product.id, "version": product.version, "status": product.status}
                             for kind, product in self.earlier.items() if product is not None},
                "documents": [{"id": d.id, "title": d.title, "sha256": d.sha256} for d in self.documents]}








############################################################
# _stats
############################################################
#
# What a product's generation cost and what made it: tokens
# and USD of the job's model calls, the prompt versions and
# models behind them.
#
# Used by:
#   - generate (below)
############################################################

def _stats(job):
    calls = LlmCall.objects.filter(job_step_id__in=JobStep.objects.filter(job=job).values_list("id", flat=True))
    usage = calls.aggregate(i=Sum("input_tokens"), o=Sum("output_tokens"), c=Sum("cost_usd"))
    versions = PromptVersion.objects.select_related("prompt").filter(
        id__in=calls.exclude(prompt_version_id=None).values_list("prompt_version_id", flat=True).distinct())
    prompts = sorted({(v.prompt.slug, v.version_no, v.model) for v in versions})
    return {"tokens": int(usage["i"] or 0) + int(usage["o"] or 0), "costUsd": float(usage["c"] or 0),
            "provenance": {"prompts": [{"slug": slug, "version": number, "model": model}
                                       for slug, number, model in prompts],
                           "models": sorted(set(calls.values_list("model", flat=True)))}}








############################################################
# _abandoned
############################################################
#
# A product whose job died past its attempts fails instead of
# running for ever.
#
# Used by:
#   - the job registry, for programme.generate
############################################################

def _abandoned(job, status, error):
    WorkProduct.objects.filter(id=(job.payload or {}).get("product_id"), status__in=("queued", "running")).update(
        status=status, error=error, finished_at=utc_now())








############################################################
# generate
############################################################
#
# The `programme.generate` job. Payload: {product_id}. A run
# that is cancelled or fails leaves the product saying so; a
# worker shutdown or takeover leaves it as it is — the job
# runs again from the start.
#
# Used by:
#   - programme/api/views.py — POST /api/companies/{id}/programme
############################################################

@register("programme.generate", max_attempts=1, on_abandon=_abandoned)
def generate(job, ctx):
    from compliance.programme.kinds import KINDS
    product = WorkProduct.objects.select_related("company").get(id=job.payload["product_id"])
    kind = KINDS[product.kind]
    WorkProduct.objects.filter(id=product.id).update(status="running", started_at=utc_now(), error=None)
    run = Run(product, ctx, job.created_by_id, needs=kind.NEEDS, steps=kind.STEPS)
    try:
        with run.step("documents") as step:
            run.prepare(step)
            step.output = {"documents": len(run.documents)}
        content = kind.generate(run)
        with run.step("references") as step:
            content, checks = kind.validate(content, run.library, product.language, judge=step.row.id)
            step.output = {"rulesBroken": sum(not c["ok"] for c in checks)}
    except JobCancelled:
        WorkProduct.objects.filter(id=product.id).update(status="cancelled", finished_at=utc_now())
        raise
    except (WorkerStopping, JobLost):
        raise
    except Exception as exc:
        WorkProduct.objects.filter(id=product.id).update(status="failed", error=pipeline.failure_message(exc),
                                                         finished_at=utc_now())
        raise
    with transaction.atomic():
        WorkProduct.objects.filter(id=product.id).update(
            status="draft", content=content, checks=checks, basis=run.basis(), stats=_stats(job),
            title=str(content.get("title") or kind.TITLE[product.language])[:300], finished_at=utc_now())
    return {"productId": product.id, "checks": sum(not c["ok"] for c in checks)}
