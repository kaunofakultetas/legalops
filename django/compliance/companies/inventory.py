############################################################
#  [*] companies.inventory — what a document proves
#
#  Before judging a company against its obligations, each of
#  its documents is read once (prompt `report.inventory`) into
#  an evidence inventory: its type, what it covers, the
#  controls/procedures it establishes (with short quotes), the
#  roles and registers it names, approval and review data,
#  the laws it cites, the references it makes to specific
#  legal provisions (`citations` — what the report's citation
#  audit checks) and the weaknesses a reviewer would flag.
#  The inventory is cached on the document under
#  "<text sha256>:<prompt version id>:s<SCHEMA_VERSION>" —
#  re-used by every report until the text, the prompt or the
#  inventory's shape changes.
#
#    ensure_inventory(document, …)          → the inventory dict
#    inventory_is_current(document, vid)    → is the cache usable
#    inventory_citations(inventory)         → its citations, clean
#    citation_key(citation)                 → one reference's identity
############################################################


import hashlib


from compliance.assistant.llm import run_prompt
from compliance.common.timestamps import utc_now
from compliance.companies.models import CompanyDocument
from compliance.prompts.schemas import FILLED
from compliance.prompts.store import active_version

# Characters of a document the inventory reads (~40k tokens)
MAX_DOCUMENT_CHARS = 160_000

# The inventory's shape, part of every cache key: bump it
# whenever SCHEMA changes, so each inventory cached under the
# old shape is read again once — also under an admin's own
# (non-default) prompt version, whose id a new shipped
# default does not change. 2 = `citations` added.
SCHEMA_VERSION = 2

# The fields of one citation, and the longest value each keeps
# (the quote is at most 200 characters by the prompt; the
# rest bounds what a runaway answer can store)
CITATION_FIELDS = {"act": 300, "article": 60, "paragraph": 60, "point": 60, "claim": 1000, "quote": 200}

# A citation names its act and its article, or it is none;
# the rest may be empty
CITATION_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": list(CITATION_FIELDS),
    "properties": {field: FILLED if field in ("act", "article") else {"type": "string"} for field in CITATION_FIELDS},
}

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["documentType", "summary", "scope", "controls", "roles", "registers", "approval",
                 "reviewCycle", "lawsReferenced", "citations", "weaknesses"],
    "properties": {
        "documentType": {"type": "string", "enum": ["policy", "procedure", "register", "contract", "plan",
                                                    "report", "profile", "other"]},
        "summary": FILLED,
        "scope": {"type": "string"},
        "controls": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["name", "description", "quote"],
            "properties": {"name": FILLED, "description": {"type": "string"},
                           "quote": {"type": "string"}}}},
        "roles": {"type": "array", "items": {"type": "string"}},
        "registers": {"type": "array", "items": {"type": "string"}},
        "approval": {"type": "string"},
        "reviewCycle": {"type": "string"},
        "lawsReferenced": {"type": "array", "items": {"type": "string"}},
        "citations": {"type": "array", "items": CITATION_SCHEMA},
        "weaknesses": {"type": "array", "items": {"type": "string"}},
    },
}








############################################################
# inventory_key
############################################################
#
# "<sha256 of the text>:<inventory prompt version>:s<SCHEMA_VERSION>".
# Keys written before the schema version was part of them
# ("<sha256>:<version>") never match again, so those
# inventories are read once more.
#
# Used by:
#   - ensure_inventory, inventory_is_current (below)
############################################################

def inventory_key(document, version_id):
    return f"{hashlib.sha256((document.text or '').encode()).hexdigest()}:{version_id}:s{SCHEMA_VERSION}"








############################################################
# inventory_is_current
############################################################
#
# True when the document's cached inventory was read from its
# current text, under prompt version `version_id` and the
# current SCHEMA — a report would use it without a model call.
#
# Used by:
#   - ensure_inventory (below)
#   - analysis/estimate.py — which inventories a run re-reads
############################################################

def inventory_is_current(document, version_id):
    return bool(document.inventory) and document.inventory_key == inventory_key(document, version_id)








############################################################
# ensure_inventory
############################################################
#
# The cached inventory when its key is current, else a fresh
# model read (saved back). Documents without text answer an
# empty inventory without a model call. The call fills the
# three placeholders every prompt of a report may use — the
# language, the day and the company's name; the shipped text
# names the company and the language.
#
# Used by:
#   - analysis/pipeline.py — the documents step
#   - programme/run.py — Run.prepare, the documents of a
#     work product
############################################################

def ensure_inventory(document, *, language="Lithuanian", step_id=None, user_id=None):
    if not (document.text or "").strip():
        return {"documentType": "other", "summary": "", "scope": "", "controls": [], "roles": [], "registers": [],
                "approval": "", "reviewCycle": "", "lawsReferenced": [], "citations": [],
                "weaknesses": ["No readable text"]}
    version = active_version("report.inventory")
    if inventory_is_current(document, version.id):
        return document.inventory
    key = inventory_key(document, version.id)
    text = document.text[:MAX_DOCUMENT_CHARS]
    truncated = "" if len(document.text) <= MAX_DOCUMENT_CHARS else \
        f"\n\n[The document continues for {len(document.text) - MAX_DOCUMENT_CHARS} more characters that were not read.]"
    data = f"Document title: {document.title}\nDeclared kind: {document.kind}\n\n<document>\n{text}{truncated}\n</document>"
    run = run_prompt("report.inventory", data, schema=SCHEMA, schema_name="inventory",
                     variables={"LANGUAGE": language, "TODAY": utc_now().date().isoformat(),
                                "COMPANY_NAME": document.company.name if document.company_id else "the company"},
                     job_step_id=step_id, user_id=user_id)
    inventory = run.object or {}
    CompanyDocument.objects.filter(id=document.id).update(inventory=inventory, inventory_key=key)
    return inventory








############################################################
# inventory_citations
############################################################
#
#   inventory_citations(document.inventory)
#     → [{"act": "MiCA", "article": "63", "paragraph": "", "point": "",
#         "claim": "…", "quote": "…"}, …]
#
# The inventory's citations with every field a trimmed
# string within its CITATION_FIELDS length. Tolerant by
# design: an inventory cached before `citations` existed, a
# missing or malformed list and entries that are not objects
# all read as no citations — never as an error.
#
# Used by:
#   - analysis/pipeline.py — collect_citations
############################################################

def inventory_citations(inventory):
    items = inventory.get("citations") if isinstance(inventory, dict) else None
    if not isinstance(items, list):
        return []
    citations = []
    for item in items:
        if not isinstance(item, dict):
            continue
        citation = {}
        for field, limit in CITATION_FIELDS.items():
            value = item.get(field)
            value = str(value) if isinstance(value, (str, int, float)) and not isinstance(value, bool) else ""
            citation[field] = " ".join(value.split())[:limit]
        citations.append(citation)
    return citations








############################################################
# citation_key
############################################################
#
#   citation_key({"act": "MiCA", "article": "63", …}) → ("mica", "63", "", "", "…")
#
# What makes two references the same for the audit: act,
# article, paragraph, point and claim, compared without
# regard to spacing or letter case (the quote does not
# count — the same claim quoted twice is judged once).
#
# Used by:
#   - analysis/pipeline.py — collect_citations
############################################################

def citation_key(citation):
    return tuple(" ".join(str(citation.get(field) or "").split()).casefold()
                 for field in ("act", "article", "paragraph", "point", "claim"))
