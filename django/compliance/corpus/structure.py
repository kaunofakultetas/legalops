############################################################
#  [*] corpus.structure — plain text → the provision tree
#
#  One line-oriented parser for Lithuanian and EU acts in
#  Lithuanian or English, whatever the source format (the
#  extractors deliver one provision per line):
#
#    part / title / chapter / section  — "I SKYRIUS", "1 SKIRSNIS",
#                                        "TITLE II", "CHAPTER 3",
#                                        "I ANTRAŠTINĖ DALIS"
#    article                           — "59 straipsnis. Antraštė",
#                                        "59 straipsnis" + heading line,
#                                        "Article 59" + heading line
#    paragraph                         — "1. …" inside an article
#    point / subpoint                  — "1) …", "a) …", "(a) …", "(i) …"
#    annex                             — "I PRIEDAS", "ANNEX II", "… 1 priedas"
#    recital                           — "(12) …" before the enacting
#                                        formula of an EU act
#
#  Acts without articles (Bank of Lithuania resolutions and
#  the rules they approve) are numbered points: "12.", "12.1."
#  become top-level `point` units under their chapters. A
#  supervisor's guidelines number their paragraphs "4.1.",
#  "4.2." under a heading that carries no number of its own
#  ("4 gairė. …", "Guideline 4: …"): the heading opens a
#  section and each paragraph is a point there.
#  Editorial noise of consolidated texts (e-seimas amendment
#  notes, EUR-Lex ►M1 / ▼B markers) is dropped.
#
#    parse_structure(text, language) → [ParsedUnit, …]
#    iter_units(tree)                → depth-first with parents
############################################################


import re
from dataclasses import dataclass, field


ROMAN = r"[IVXLC]+"

# Inserted articles are numbered 12¹ (printed "12(1)" or "12^1"
# by some exports) — normalised to the superscript form so
# 12¹ never collides with article 121
TO_SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
FROM_SUPERSCRIPT = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")

# Lithuanian ordinal words of parts/sections ("PIRMOJI DALIS",
# "ANTRASIS SKIRSNIS") → their number
LT_ORDINALS = {
    "PIRM": "1", "ANTR": "2", "TREČ": "3", "TREC": "3", "KETVIRT": "4", "PENKT": "5", "ŠEŠT": "6", "SEST": "6",
    "SEPTINT": "7", "AŠTUNT": "8", "ASTUNT": "8", "DEVINT": "9", "DEŠIMT": "10", "DESIMT": "10",
}

# Container markers: (unit_type, regex) — the first match wins
CONTAINER_PATTERNS = [
    ("part", re.compile(rf"^(?:PART\s+({ROMAN}|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)|({ROMAN})\s+DALIS|([A-ZĄČĘĖĮŠŲŪŽ]+(?:OJI|ASIS))\s+DALIS)$")),
    ("title", re.compile(rf"^(?:TITLE\s+({ROMAN})|({ROMAN})\s+ANTRAŠTINĖ\s+DALIS)$")),
    ("chapter", re.compile(rf"^(?:CHAPTER\s+({ROMAN}|\d+)|({ROMAN}|\d+)\s+SKYRIUS)$", re.IGNORECASE)),
    ("section", re.compile(rf"^(?:SECTION\s+({ROMAN}|\d+)|(\d+|{ROMAN})\s+SKIRSNIS|([A-ZĄČĘĖĮŠŲŪŽ]+(?:ASIS|OJI))\s+SKIRSNIS)$", re.IGNORECASE)),
]

ARTICLE_LT = re.compile(r"^(\d+[a-z]?(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+|\(\d+\)|\^\d+)?)\s*straipsnis\.?\s*(.*)$", re.IGNORECASE)
ARTICLE_EN = re.compile(r"^Article\s+(\d+[a-z]?)\s*\.?\s*(.*)$")
ANNEX = re.compile(rf"^(?:ANNEX\s*({ROMAN}|\d+)?|({ROMAN}|\d+)\s+PRIEDAS|PRIEDAS|.*\b(\d+)\s+priedas)$", re.IGNORECASE)

PARAGRAPH = re.compile(r"^(\d+)\.\s+(.+)$")
DOTTED_POINT = re.compile(r"^(\d+(?:\.\d+)+)\.\s+(.+)$")
# The heading of one guideline of a supervisor's guidelines: "4 gairė. Deramo klientų tikrinimo priemonės",
# "Guideline 4: Customer due diligence" — the nominative at the head of the line, never a mention in a sentence
GUIDELINE = re.compile(r"^(?:(\d+)\s+gairė[.:]|Guideline\s+(\d+)[.:])\s*(.*)$", re.IGNORECASE)
POINT_NUM = re.compile(r"^(\d+)\)\s+(.+)$")
POINT_LETTER = re.compile(r"^\(?([a-z]{1,2})\)\s+(.+)$")
POINT_ROMAN = re.compile(r"^\(?((?:x{0,3})(?:ix|iv|v?i{0,3}))\)\s+(.+)$")
RECITAL = re.compile(r"^\((\d+)\)\s+(.+)$")

# The line after which an EU act's articles begin
ENACTING = re.compile(r"(HAVE ADOPTED THIS|HAS ADOPTED THIS|PRIĖMĖ ŠĮ|PRIĖMĖ ŠIĄ|PRIĖMĖ ŠIUOS|PRIĖMĖ ŠIAS)", re.IGNORECASE)

# Editorial noise of consolidated texts
NOISE = [
    re.compile(r"^(Straipsnio|Punkto|Dalies|Skyriaus|Skirsnio|Priedo|Papunkčio)\s+(pakeitimai|dalies pakeitimai)\s*:?$", re.IGNORECASE),
    re.compile(r"^(Papildyta|Papildytas|Pakeistas|Pakeista|Neteko galios|Pripažinta netekusia galios)\s.*:\s*$", re.IGNORECASE),
    re.compile(r"^Nr\.\s*[IVXLC]+-\d+.*paskelbta\s+TAR", re.IGNORECASE),
    re.compile(r"^Nr\.\s*\d+[-\d]*,\s*\d{4}-\d{2}-\d{2}.*(paskelbta|TAR|Žin\.)", re.IGNORECASE),
    re.compile(r"^[►▼◄]\s*[A-Z]\d*\s*$"),
]
INLINE_MARKERS = re.compile(r"[►▼◄]\s*[A-Z]\d*\s*")








############################################################
# ParsedUnit
############################################################
#
# One node: its kind, number, heading, the text lines that
# belong to it directly, and its children. full_text() is
# the heading + own lines + every descendant, in order.
#
# Used by:
#   - parse_structure (below) and corpus/ingest.py
############################################################

@dataclass
class ParsedUnit:
    unit_type: str
    number: str = ""
    heading: str = ""
    lines: list = field(default_factory=list)
    children: list = field(default_factory=list)
    # The citation a structural parser printed ("59 str. 1 d.");
    # empty → computed from the chain (citation_path)
    path: str = ""






    ############################################################
    # full_text
    ############################################################
    #
    # The unit as a reader sees it: its heading line (for
    # articles "59 straipsnis. Antraštė"), its own lines, then
    # its children's full texts.
    #
    # Used by:
    #   - corpus/ingest.py — LegalUnit.text
    #   - corpus/chunking.py
    ############################################################

    def full_text(self, language="lt"):
        parts = []
        label = unit_label(self, language)
        if label:
            parts.append(label)
        parts.extend(self.lines)
        parts.extend(child.full_text(language) for child in self.children)
        return "\n".join(p for p in parts if p)








############################################################
# unit_label
############################################################
#
# The line that introduces a container/article/annex in the
# reconstructed text ("59 straipsnis. Leidimas", "Article 59
# — Authorisation", "II SKYRIUS BENDROSIOS NUOSTATOS"), and a
# standard's clause its number and heading ("6.1.2 Information
# security risk assessment"); paragraphs and points carry
# their number inside their own first line already, so they
# get none — nor does a standard's clause that has text but
# no heading: a numbered paragraph, whose first line opens
# with its number, or a page of a standard read by pages. A
# clause with neither (its heading line was lost) shows its
# number.
#
# Used by:
#   - ParsedUnit.full_text (above)
#   - corpus/chunking.py
############################################################

def unit_label(unit, language="lt"):
    heading = unit.heading.strip()
    if unit.unit_type == "article":
        base = f"{unit.number} straipsnis" if language == "lt" else f"Article {unit.number}"
        return f"{base}. {heading}" if heading else base
    if unit.unit_type == "annex":
        base = (f"{unit.number} PRIEDAS" if unit.number else "PRIEDAS") if language == "lt" else f"ANNEX {unit.number}".strip()
        return f"{base} {heading}".strip()
    if unit.unit_type == "clause":
        return f"{unit.number} {heading}".strip() if heading or not unit.lines else ""
    if unit.unit_type in ("part", "title", "chapter", "section"):
        return heading
    return ""








############################################################
# normalize_number
############################################################
#
#   normalize_number("12(1)") → "12¹"   normalize_number("12^1") → "12¹"
#   normalize_number("59")    → "59"
#
# The one spelling of an article number for the text parser
# and for whoever asks for an article by number.
#
# Used by:
#   - _article, number_spellings (below)
############################################################

def normalize_number(raw):
    value = str(raw or "").strip().lower().replace(" ", "")
    match = re.match(r"^(\d+[a-z]?)(?:\((\d+)\)|\^(\d+)|-(\d+))$", value)
    if match:
        suffix = next(g for g in match.groups()[1:] if g)
        return match.group(1) + suffix.translate(TO_SUPERSCRIPT)
    return value








############################################################
# number_spellings
############################################################
#
# Every way the corpus may hold the number a lookup asks
# for. An inserted article has two: the text parser keeps the
# superscript form normalize_number gives, while the e-tar
# parser stores the index after a hyphen, as that register's
# markup carries it (corpus/sources/etar_html.py). A lookup
# that knew one spelling missed every act read by the other
# parser. Any other number has the one spelling.
#
# Used by:
#   - corpus/search.py — find_provision
#   - corpus/citations.py — _locate
############################################################

def number_spellings(raw):
    number = normalize_number(raw)
    match = re.match(r"^(\d+[a-z]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$", number)
    if not match:
        return [number]
    return [number, f"{match.group(1)}-{match.group(2).translate(FROM_SUPERSCRIPT)}"]








############################################################
# _is_noise
############################################################
#
# True for an editorial line of a consolidated text.
#
# Used by:
#   - parse_structure (below)
############################################################

def _is_noise(line):
    return any(pattern.match(line) for pattern in NOISE)








############################################################
# _container
############################################################
#
# (unit_type, number) when the line is a part/title/chapter/
# section marker, else None. Ordinal words become digits.
#
# Used by:
#   - parse_structure (below)
############################################################

def _container(line):
    candidate = line.strip()
    if len(candidate) > 60:
        return None
    for unit_type, pattern in CONTAINER_PATTERNS:
        match = pattern.match(candidate)
        if match:
            number = next((g for g in match.groups() if g), "")
            for stem, digit in LT_ORDINALS.items():
                if number.upper().startswith(stem):
                    number = digit
                    break
            return unit_type, number
    return None








############################################################
# _article
############################################################
#
# (number, inline heading) for an article marker line, else
# None. A marker must be short or carry its heading after a
# full stop — "pagal 5 straipsnio 2 dalį" inside a sentence
# is not a marker (it has no "straipsnis" nominative anyway).
#
# Used by:
#   - parse_structure (below)
############################################################

def _article(line):
    match = ARTICLE_LT.match(line) or ARTICLE_EN.match(line)
    if not match:
        return None
    number = normalize_number(match.group(1))
    heading = match.group(2).strip(" .–—-")
    # A long trailing clause means prose that happens to start
    # with "Article 5 of …" — not a marker
    if heading and len(heading) > 250:
        return None
    return number, heading








############################################################
# _annex
############################################################
#
# The annex number (possibly "") for an annex marker, else
# None. Only short, marker-like lines count.
#
# Used by:
#   - parse_structure (below)
############################################################

def _annex(line):
    if len(line) > 120:
        return None
    match = ANNEX.match(line.strip())
    if not match:
        return None
    return next((g for g in match.groups() if g), "")








############################################################
# _point
############################################################
#
# (kind, number, text) for a point line inside a paragraph:
# "1) …" and "a) …"/"(a) …" are points, "(i) …" a subpoint
# when the enclosing point is a letter (so "(i)" after "(h)"
# stays a letter point).
#
# Used by:
#   - parse_structure (below)
############################################################

def _point(line, last_letter):
    match = POINT_NUM.match(line)
    if match:
        return "point", match.group(1), line
    roman = POINT_ROMAN.match(line)
    letter = POINT_LETTER.match(line)
    if roman and roman.group(1) and last_letter and not (roman.group(1) == "i" and last_letter == "h") \
            and not (roman.group(1) == "v" and last_letter == "u") and not (roman.group(1) == "x" and last_letter == "w"):
        return "subpoint", roman.group(1), line
    if letter:
        return "point", letter.group(1), line
    return None








############################################################
# parse_structure
############################################################
#
#   parse_structure(text, "lt") → [ParsedUnit(...), ...]
#
# A single pass keeping a stack of open containers and the
# open article → paragraph → point. Lines that belong to no
# provision (titles, enacting clauses, signatures) become
# `text` units so nothing read is lost.
#
# Used by:
#   - corpus/ingest.py — every ingested version
############################################################

def parse_structure(text, language="lt"):
    lines = [INLINE_MARKERS.sub("", raw).strip() for raw in text.split("\n")]
    lines = [line for line in lines if line and line != "\f" and not _is_noise(line)]
    has_articles = any(_article(line) for line in lines)
    has_enacting = any(ENACTING.search(line) for line in lines[:4000])

    root = ParsedUnit("root")
    containers = [root]
    article = paragraph = point = None
    preamble = None
    in_preamble = has_enacting
    pending_heading = None       # a container/article waiting for its heading line
    heading_lines_taken = 0      # lines already added to that heading
    wrapped = None               # a guideline's heading that may run on to the next line
    guideline_open = None        # the guideline whose paragraphs are being read
    last_letter = None
    rank = {"part": 1, "title": 2, "chapter": 3, "section": 4, "annex": 1}

    def attach(unit):
        containers[-1].children.append(unit)

    def close_provisions():
        nonlocal article, paragraph, point, last_letter
        article = paragraph = point = None
        last_letter = None

    for line in lines:
        # STEP 1: EU preamble — recitals until the enacting formula
        # ==========================================================
        if in_preamble:
            if ENACTING.search(line):
                in_preamble = False
                attach(ParsedUnit("text", lines=[line]))
                continue
            recital = RECITAL.match(line)
            if recital:
                if preamble is None:
                    preamble = ParsedUnit("preamble", heading="Preambulė" if language == "lt" else "Recitals")
                    attach(preamble)
                preamble.children.append(ParsedUnit("recital", number=recital.group(1), lines=[line]))
            elif preamble is not None and preamble.children:
                preamble.children[-1].lines.append(line)
            else:
                attach(ParsedUnit("text", lines=[line]))
            continue


        # STEP 2: a heading line owed to the previous marker
        # ==================================================
        if pending_heading is not None:
            is_marker = _container(line) or _article(line) or _annex(line) is not None
            first = not heading_lines_taken
            continues_caps = not first and line.isupper() and pending_heading.heading.isupper()
            numbered = PARAGRAPH.match(line) or DOTTED_POINT.match(line)
            if not is_marker and not numbered and len(line) <= 250 and (first or continues_caps):
                pending_heading.heading = f"{pending_heading.heading} {line}".strip()
                heading_lines_taken += 1
                # Articles take one heading line; container titles
                # may wrap over several upper-case lines
                if pending_heading.unit_type == "article" or not line.isupper():
                    pending_heading = None
                continue
            pending_heading = None


        # A guideline's title may run on to one more line, which
        # then starts in lower case and is no list item
        if wrapped is not None:
            heading, wrapped = wrapped, None
            if (len(line) <= 100 and line[0].islower() and not heading.heading.endswith(".")
                    and not POINT_LETTER.match(line)):
                heading.heading = f"{heading.heading} {line}"
                continue


        # STEP 3: containers and annexes close whatever is open
        # =====================================================
        container = _container(line)
        annex_number = None if container else _annex(line)
        if container or annex_number is not None:
            unit_type, number = container if container else ("annex", annex_number)
            close_provisions()
            while len(containers) > 1 and rank.get(containers[-1].unit_type, 9) >= rank[unit_type]:
                containers.pop()
            # A container's heading starts with its marker line
            # ("II SKYRIUS"); an annex's with its title line
            unit = ParsedUnit(unit_type, number=number, heading=line if unit_type != "annex" else "")
            attach(unit)
            containers.append(unit)
            pending_heading, heading_lines_taken = unit, 0
            continue


        # STEP 4: articles
        # ================
        found = _article(line) if has_articles else None
        if found:
            close_provisions()
            number, heading = found
            article = ParsedUnit("article", number=number, heading=heading)
            attach(article)
            if not heading:
                pending_heading, heading_lines_taken = article, 0
            continue


        # STEP 5: numbered provisions inside an article, or
        # top-level points of an act without articles
        # =================================================
        if article is not None:
            para = PARAGRAPH.match(line)
            if para:
                paragraph = ParsedUnit("paragraph", number=para.group(1), lines=[line])
                article.children.append(paragraph)
                point, last_letter = None, None
                continue
            found_point = _point(line, last_letter)
            if found_point:
                kind, number, content = found_point
                host = paragraph or article
                if kind == "subpoint" and point is not None:
                    point.children.append(ParsedUnit("subpoint", number=number, lines=[content]))
                else:
                    point = ParsedUnit("point", number=number, lines=[content])
                    host.children.append(point)
                    if number.isalpha():
                        last_letter = number
                continue
            target = point or paragraph or article
            target.lines.append(line)
            continue

        if not has_articles:
            guideline = GUIDELINE.match(line)
            if guideline and len(line) <= 250:
                # One guideline of a supervisor's guidelines: a section its numbered paragraphs stand in
                close_provisions()
                while len(containers) > 1 and rank.get(containers[-1].unit_type, 9) >= rank["section"]:
                    containers.pop()
                unit = ParsedUnit("section", number=guideline.group(1) or guideline.group(2), heading=line)
                attach(unit)
                containers.append(unit)
                wrapped = guideline_open = unit
                continue
            dotted = DOTTED_POINT.match(line)
            para = PARAGRAPH.match(line)
            if dotted or para:
                number = (dotted or para).group(1)
                # "12.1." stands under the open point "12."; where no such point is open — the paragraphs
                # "4.1.", "4.2." of a guideline — each is a provision of its own, beside the one before it
                inside = "." in number and paragraph is not None and paragraph.number == number.split(".")[0]
                unit = ParsedUnit("subpoint" if inside else "point", number=number, lines=[line])
                if inside:
                    paragraph.children.append(unit)
                else:
                    attach(unit)
                    paragraph = unit
                continue
            if paragraph is not None:
                paragraph.lines.append(line)
                continue
            # A guideline printed without its paragraph numbers: its text is one run, not a unit a line
            if containers[-1] is guideline_open and guideline_open.children and guideline_open.children[-1].unit_type == "text":
                guideline_open.children[-1].lines.append(line)
                continue

        attach(ParsedUnit("text", lines=[line]))

    return _drop_toc_duplicates(root.children)








############################################################
# _drop_toc_duplicates
############################################################
#
# A table of contents repeats every article marker with no
# body; when an article number occurs twice under the same
# parent and the first occurrence is empty, the first is the
# TOC entry and goes.
#
# Used by:
#   - parse_structure (above)
############################################################

def _drop_toc_duplicates(units):
    seen = {}
    for index, unit in enumerate(units):
        if unit.children:
            unit.children = _drop_toc_duplicates(unit.children)
        if unit.unit_type == "article":
            if unit.number in seen and not units[seen[unit.number]].lines and not units[seen[unit.number]].children:
                units[seen[unit.number]] = None
            seen[unit.number] = index
    return [u for u in units if u is not None]








############################################################
# iter_units
############################################################
#
#   for unit, parent, depth in iter_units(tree): ...
#
# Depth-first, document order, with the parent ParsedUnit
# (None at the top).
#
# Used by:
#   - corpus/ingest.py — writing LegalUnit rows
############################################################

def iter_units(units, parent=None, depth=0):
    for unit in units:
        yield unit, parent, depth
        yield from iter_units(unit.children, unit, depth + 1)








############################################################
# citation_path
############################################################
#
#   citation_path([article, paragraph, point], "lt") → "59 str. 1 d. a p."
#   citation_path([article, paragraph, point], "en") → "Art. 59(1)(a)"
#
# From the chain of ancestors down to the unit; containers
# only name themselves when no article is involved.
#
# Used by:
#   - corpus/ingest.py
############################################################

def citation_path(chain, language="lt"):
    article = next((u for u in chain if u.unit_type == "article"), None)
    annex = next((u for u in chain if u.unit_type == "annex"), None)
    recital = next((u for u in chain if u.unit_type == "recital"), None)
    rest = [u for u in chain if u.unit_type in ("paragraph", "point", "subpoint") and u.number]
    if recital:
        return f"{recital.number} konstatuojamoji dalis" if language == "lt" else f"Recital ({recital.number})"
    if article:
        if language == "lt":
            parts = [f"{article.number} str."]
            for unit in rest:
                parts.append(f"{unit.number} d." if unit.unit_type == "paragraph" else f"{unit.number} p.")
            return " ".join(parts)
        return f"Art. {article.number}" + "".join(f"({u.number})" for u in rest)
    if annex:
        base = (f"{annex.number} priedas" if annex.number else "Priedas") if language == "lt" else f"Annex {annex.number}".strip()
        return base
    points = [u for u in chain if u.unit_type in ("point", "subpoint") and u.number]
    if points:
        return f"{points[-1].number} p." if language == "lt" else f"Point {points[-1].number}"
    container = next((u for u in reversed(chain) if u.unit_type in ("chapter", "section", "title", "part")), None)
    if container:
        return container.heading[:80]
    return ""
