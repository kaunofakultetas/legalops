############################################################
#  [*] corpus.sources.bridge — parser trees → ParsedUnit
#
#    detect_parser(raw, filename, content_type, source_kind) → "eu_xhtml" | … | None
#    to_parsed_units(tree, language) → [ParsedUnit]
#
#  The structural parsers (eu_xhtml, etar_html, lb_html) read
#  the markup of the official publication — far more exact
#  than re-parsing extracted text — and already print each
#  unit's citation ("59 str. 1 d. a p.", "Art. 59(1)(a)").
#  This bridge maps their unit types onto LegalUnit's, keeps
#  their citations as the unit paths, and puts the number
#  labels back into the text ("1. …", "a) …") so an article's
#  full text reads like the official one.
############################################################


import re


from compliance.corpus.structure import ParsedUnit


# parser unit type → LegalUnit type (None = unwrap: the
# children move up, the unit itself is not kept)
TYPE_MAP = {
    "document": None, "act": None, "block": None,
    "preamble": "preamble", "citation": "text", "recital": "recital",
    "title": "title", "part": "part", "chapter": "chapter", "section": "section", "subsection": "subsection",
    "division": "chapter", "group": "section", "approved_document": "part",
    "article": "article", "paragraph": "paragraph", "point": "point", "subpoint": "subpoint",
    "indent": "subpoint", "annex": "annex", "final": "text", "text": "text", "signature": None,
}
CONTAINERS = {"title", "part", "chapter", "section", "subsection"}
LT_CONTAINER_WORD = {"chapter": "SKYRIUS", "section": "SKIRSNIS", "part": "DALIS", "subsection": "POSKIRSNIS"}








############################################################
# detect_parser
############################################################
#
# The structural parser for a publication, or None (plain
# text extraction). Decided by the source kind and — for
# uploads — by sniffing the markup a file carries.
#
# Used by:
#   - corpus/ingest.py — the extract step
############################################################

def detect_parser(raw, filename="", content_type="", source_kind=""):
    head = raw[:400_000].decode("utf-8", "ignore")
    looks_html = "html" in (content_type or "") or (filename or "").lower().endswith((".html", ".htm", ".xhtml"))
    if not looks_html and not head.lstrip().startswith("<"):
        return None
    if "eli-subdivision" in head or "oj-ti-art" in head or "title-article-norm" in head:
        return "eu_xhtml"
    if re.search(r'<div[^>]+id="part_[0-9a-f]{32}"', head):
        return "etar_html"
    if source_kind == "lb" or "last_update" in head and "lb.lt" in head:
        return "lb_html"
    return None








############################################################
# _label
############################################################
#
# The number label the official text prints before a
# paragraph, point or recital, per language.
#
# Used by:
#   - _convert (below)
############################################################

def _label(kind, number, language):
    if not number:
        return ""
    if kind == "paragraph":
        return f"{number}. "
    if kind == "recital":
        return f"({number}) "
    if number in ("—", "–", "-", "•"):
        return "— "
    if kind == "subpoint" and "." in number:
        return f"{number}. "
    return f"{number}) " if language == "lt" else f"({number}) "








############################################################
# _heading
############################################################
#
# A container's heading as printed: its label ("I
# ANTRAŠTINĖ DALIS", "2 SKYRIUS") and its title.
#
# Used by:
#   - _convert (below)
############################################################

def _heading(node, kind, language):
    heading = (node.get("heading") or "").strip()
    label = (node.get("label") or "").strip()
    if not label and kind in LT_CONTAINER_WORD and node.get("number") and language == "lt":
        label = f"{node['number']} {LT_CONTAINER_WORD[kind]}"
    return " ".join(part for part in (label, heading) if part)








############################################################
# _convert
############################################################
#
# One parser node → ParsedUnit(s): unwrapped nodes return
# their converted children, the rest one unit.
#
# Used by:
#   - to_parsed_units (below)
############################################################

def _convert(node, language):
    kind = TYPE_MAP.get(node.get("type"), "text")
    children = [unit for child in node.get("children") or [] for unit in _convert(child, language)]
    text = (node.get("text") or "").strip()
    if kind is None:
        lead = [ParsedUnit("text", lines=[text])] if text and node.get("type") == "act" else []
        return lead + children
    number = str(node.get("number") or "").strip()
    if kind in CONTAINERS or kind in ("annex",):
        heading = _heading(node, kind, language) if kind in CONTAINERS else (node.get("heading") or "").strip()
    elif kind == "article":
        heading = (node.get("heading") or "").strip()
    else:
        heading = ""
    if node.get("repealed"):
        text = text or ("Neteko galios" if language == "lt" else "Repealed")
    lines = [f"{_label(kind, number, language)}{text}"] if text else []
    unit = ParsedUnit(kind, number=number[:40], heading=heading, lines=lines, children=children)
    unit.path = (node.get("cite") or "").strip()
    return [unit]








############################################################
# to_parsed_units
############################################################
#
# The whole document as top-level ParsedUnits.
#
# Used by:
#   - corpus/ingest.py — the parse step
############################################################

def to_parsed_units(tree, language):
    return _convert(tree, language)
