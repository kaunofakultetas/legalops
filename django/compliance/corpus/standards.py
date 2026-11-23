############################################################
#  [*] corpus.standards — a standard's text → its clause tree
#
#  Standards are not built like acts. ISO, IEC, EN and ETSI
#  standards, and their LST editions in English or
#  Lithuanian, are numbered clauses (a top-level clause and
#  its subclauses to any depth) followed by lettered annexes,
#  normative or informative, that have clauses of their own.
#  This module reads that structure from the plain text of an
#  uploaded copy, finds the clause a reference names, and
#  picks the clauses whose requirements are extracted.
#
#  Its rules come from what real copies give once a PDF is
#  turned into text (ISO/IEC 27001, 27002 and 42001 as their
#  publisher typesets them, ETSI EN 303 645, the Lithuanian
#  LST guides):
#
#    - Every page repeats lines that are not the standard:
#      the designation, the copyright line, a licence or
#      preview stamp of several lines, the page number —
#      glued to the copyright line on one page, on a line of
#      its own on the next. They are peeled off each page's
#      edges by where they stand, not by what they say.
#    - The table of contents lists every clause before the
#      body does. Its lines end in dot leaders and go; an
#      entry wrapped over several lines goes whole. Contents
#      printed without leaders open clauses that take no
#      text: when the numbering starts over, they are thrown
#      away and the body replaces them.
#    - A line opens a clause only when it continues the
#      numbering — a child, the next sibling, or an ancestor's
#      next sibling, a few lost headings allowed — so a
#      sentence that starts with a number stays text. An
#      annex can only open after the body has: an annex named
#      in the contents or the foreword never swallows the
#      body. An annex starts a page; one named in the middle
#      of a page is taken on trial and undone when the body's
#      numbering goes on after it (a standard that shows an
#      annex's heading as an example).
#    - Many standards number their paragraphs instead of
#      giving every subclause a heading. Such a paragraph is a
#      clause without a heading, kept apart from a reference
#      that merely starts a line by where the sentence before
#      it ended.
#    - A heading may wrap, in a table column even break a word
#      with a hyphen; a term entry prints its number on a line
#      of its own. Inside an annex, a number without the annex
#      letter belongs to the annex: the control table of
#      ISO/IEC 27001:2022 Annex A numbers its controls
#      5.1–8.34, cited as A.5.1–A.8.34.
#
#  What comes before the first clause (cover, foreword,
#  introduction) becomes the preamble, and the bibliography a
#  text unit.
#
#  Not every standard is numbered this way (a framework with
#  its own identifiers, a guide without any), and clause
#  numbers may not survive the extraction (a DOCX with
#  automatic numbering). structure_ok says whether the rules
#  here read the document; when they did not, or left a clause
#  too long to cite, corpus/outline.py goes on — the model
#  marks the headings, and pages stand in when nothing else
#  does. For that the lines keep their page: a mark line
#  stands where each page begins and travels with the text
#  into whatever unit holds it, until strip_marks takes the
#  marks out of the finished tree.
############################################################


import math
import re
from collections import Counter


from compliance.corpus.structure import ParsedUnit


# Headings a lost line may skip: 4.1 → 4.4 still continues
# the numbering, 4.1 → 4.5 does not. A subclause printed with
# its heading may skip more of its siblings (5.3 → 5.21): a
# run of headings the text lost must not cost the rest of
# their clause — while a number alone on its line, or one
# before a paragraph, could as well be a slip or a reference
MAX_GAP = 2
MAX_HEADING_GAP = 20

# Page furniture: how many lines from a page's top and bottom
# may be peeled, the share of pages a line must stand on at
# the same distance from that edge, and the fewest pages that
# make a pattern
EDGE_TOP = 6
EDGE_BOTTOM = 12
FURNITURE_SHARE = 0.25
FURNITURE_MIN_PAGES = 3

# A line outermost on this many pages in a row is furniture
# too, even without a page number in it (see _peel_runs)
RUN_MIN_PAGES = 5

# A line found at a page edge that often is dropped wherever
# it occurs once it is this long (a lone page number is not);
# a longer line on at least half the pages is a stamp, at the
# edge or not
ANYWHERE_KEY_CHARS = 8
STAMP_KEY_CHARS = 25
STAMP_SHARE = 0.5

# The longest line a clause or annex heading may be, and the
# longest heading printed on the line after its number
MAX_HEADING_CHARS = 160
MAX_SPLIT_HEADING_CHARS = 90

# A heading's wrapped end: a short line in lower case, taken
# at most this many times; in the body only a long first line
# wraps, in an annex (narrow table columns) any does
WRAP_FROM_CHARS = 40
WRAP_MAX_CHARS = 80
MAX_WRAPS = 4

# A numbered line this long, going on in lower case on the
# next line, is a paragraph's first line, not a heading; one
# as long as the page is wide is no heading whatever follows
# (the longest clause headings of the standards read stay
# under 75 characters)
PARAGRAPH_FROM_CHARS = 60
FULL_LINE_CHARS = 85

# A text line this long that ends without punctuation was cut
# by the page width: its sentence is still open
OPEN_FROM_CHARS = 60
CLOSERS = (".", ";", ":", "?", "!", "”", "“", "\"", ")")

# How a standard's numbering may start: a numbered
# introduction (0, 0.1) or clause 1
FIRST_NUMBERS = {(0,), (0, 1), (1,), (1, 1)}

# The top-level numbers an annex may start from — an annex
# whose clauses carry no letter can open at any of them (the
# 27001:2022 control table opens at 5)
MAX_ANNEX_START = 20

# The items of a numbered list stand at most this many lines
# apart (see _Builder.clause)
LIST_REACH = 12

# A standard is read by these rules when they find this many
# clauses and no more than this share of its text lies before
# the first one (a copy whose numbers were lost reads as one
# long preamble)
MIN_STANDARD_CLAUSES = 3
MAX_PREAMBLE_SHARE = 0.6

# What opens a page mark — a line of its own that says which
# page the lines after it are on; no text line can open with
# it, as the extraction keeps form feeds between pages only
PAGE_MARK = "\f"

# A clause number, optionally with an annex letter, then the
# heading
CLAUSE = re.compile(r"^(?:([A-Z]{1,2})\.)?(\d{1,2}(?:\.\d{1,3}){0,5})\.?(?:\s+(.+))?$")

# An annex heading, in English or Lithuanian, then whatever
# shares its line (status, title)
ANNEX_EN = re.compile(r"^(?:Annex|ANNEX|Appendix|APPENDIX)\s+([A-Z]{1,2})\b\s*(.*)$")
ANNEX_LT = re.compile(r"^([A-Z]{1,2})\s+(?:priedas|PRIEDAS)\b\s*(.*)$")

# An annex's status, alone or before its title, and the
# punctuation some publishers put after it ("(informative):",
# "(norminis).")
ANNEX_STATUS = re.compile(r"^\((normative|informative|norminis|normatyvinis|informacinis)\)\s*(.*)$", re.IGNORECASE)
LEAD_PUNCTUATION = re.compile(r"^[.:,;—–-]+\s*")
INFORMATIVE = re.compile(r"\((informative|informacinis)\)", re.IGNORECASE)

BIBLIOGRAPHY = re.compile(r"^(Bibliography|BIBLIOGRAPHY|Bibliografija|BIBLIOGRAFIJA|Literatūra|LITERATŪRA)$")

# How a bibliography's first entry opens: a number in brackets
# or a document's designation
BIBLIOGRAPHY_ENTRY = re.compile(r"^(?:\[\d{1,3}\]|\d{1,3}[.)]\s|(?:ISO|IEC|EN|LST|CEN|CENELEC|ETSI|BS|DIN|IEEE|NIST|SD)\b)")

# The lines at a page's top among which a heading "starts
# the page" (a line of furniture may have stayed above it)
PAGE_TOP_LINES = 2

# The column word a control table prints after each
# control's name ("5.1 Policies for information security
# Control"), dropped from an annex clause's heading
TABLE_COLUMN = re.compile(r"\s+(?:Control|Kontrolė|Kontrolės priemonė)$")

# A list item's opening ("a)", "iv)") — never the end of a
# wrapped heading
LIST_ITEM = re.compile(r"^[a-z]{1,4}\)")

# Verbs a requirement is written with and a heading is not,
# and one sentence's end followed by the next one's start
SENTENCE_WORDS = re.compile(r"(?i)\b(?:shall|should|must|turi|privalo|turėtų)\b")
SENTENCE_BREAK = re.compile(r"[a-ząčęėįšųūž)]\. [A-ZĄČĘĖĮŠŲŪŽ]")

# A table-of-contents line with a dot leader
TOC_LEADER = re.compile(r"(?:\.\s?){4,}\s*[\divxlc]*\s*$|…{2,}\s*[\divxlc]*\s*$", re.IGNORECASE)

# A lone page number: arabic or roman, between dashes, or of
# a total
PAGE_NUMBER = re.compile(
    r"^(?:\d{1,4}|[ivxlc]{1,7}|[IVXLC]{1,7}|[-–—]\s?\d{1,4}\s?[-–—]|\d{1,4}\s?/\s?\d{1,4})$")

# A rule drawn across the page under a running head
RULE_LINE = re.compile(r"^[_=–—-]{5,}$")

# Lines no clause ever holds: a copyright line with or without
# the page number beside it, and the running title of a
# document's first page
COPYRIGHT_LINE = re.compile(r"^(?:(?:\d{1,4}|[ivxlcIVXLC]{1,7})\s*)?©.{0,90}$")
RUNNING_HEAD = re.compile(
    r"^(?:INTERNATIONAL\s+ST\s?ANDARD|EUROPEAN\s+ST\s?ANDARD|TECHNICAL\s+SPECIFICATION|TECHNICAL\s+REPORT|"
    r"LIETUVOS\s+STANDARTAS)\b.{0,60}$")

# How the headings of the top-level clauses that state no
# requirements open — scope, references, terms, symbols and
# abbreviations, and what a framework puts around its
# requirements (a frontispiece, an executive summary, a
# glossary, the revision history) — in lower case without
# spaces (a PDF may put a space inside a word)
NON_REQUIREMENT_HEADINGS = (
    "scope", "normativereferences", "references", "terms", "symbols", "abbreviat", "definition",
    "taikymosritis", "norminėsnuorodos", "nuorodos", "terminai", "simboliai", "santrumpos", "apibrėžtys",
    "foreword", "preface", "glossary", "acronym", "bibliograph", "tableofcontents", "revisionhistory",
    "documenthistory", "versionhistory", "changehistory", "changelog", "acknowledg", "frontispiece",
    "executivesummary", "abstract", "disclaimer", "listoffigures", "listoftables", "contributors",
    "pratarmė", "bibliografija", "literatūra", "žodynas", "santrauka",
)

# … and the headings that are one of these words and nothing
# more: a clause on the contents of a policy states
# requirements, the document's own contents page none
NON_REQUIREMENT_TITLES = ("introduction", "contents", "index", "copyright", "copyrightandlicense",
                          "copyrightandlicence", "license", "licence", "authors", "įvadas", "turinys", "rodyklė")

# The preamble's, the numbered introduction's and the
# bibliography's names, by language
FRONT_MATTER = {"lt": "Įvadinė dalis", "en": "Front matter"}
INTRODUCTION = {"lt": "Įvadas", "en": "Introduction"}
BIBLIOGRAPHY_NAME = {"lt": "Bibliografija", "en": "Bibliography"}

# Words around a clause reference that name nothing: "clause
# 6.1.2", "6.1.2 punktas", "control 5.15", "§ 4" — and those
# among them that say the reference means a control, which a
# standard lists in an annex
REFERENCE_WORDS = re.compile(
    r"(?i)\b(?:sub-?clauses?|clauses?|sections?|controls?|requirements?|punkt\w*|skyri\w*|poskyri\w*|"
    r"kontrol\w*|priemon\w*|reikalavim\w*|p\.|sk\.)|§")
CONTROL_WORDS = re.compile(r"(?i)\b(?:controls?|kontrol\w*|priemon\w*)")
REFERENCE_ANNEX = re.compile(r"(?i)\b(?:annex|appendix)\s+([A-Z]{1,2})\b|\b([A-Z]{1,2})\s+pried\w*")
REFERENCE_NUMBER = re.compile(r"(?:\b([A-Z]{1,2})\s*\.?\s*)?(?<!\d)(\d{1,2}(?:\.\d{1,3}){0,5})(?!\d)")

# A reference to a page of a standard read by its pages; the
# Lithuanian "12 p." is a clause (punktas), never a page
REFERENCE_PAGE = re.compile(r"(?i)^(?:p\.|pp\.|pg\.|page|psl\.)\s*(\d{1,4})$|^(\d{1,4})\s*psl\.?$")
REFERENCE_LIST_ITEM = re.compile(r"\b[a-z]{1,2}\)")

# A number with letters before it that are not part of how
# the standard numbers the unit: the V of a requirement its
# table prints as 1.2.3 and its users cite as V1.2.3
REFERENCE_PREFIXED = re.compile(r"^[A-Za-z]{1,2}[.\s]?(\d{1,2}(?:\.\d{1,3}){0,5})$")

# A clause's own text before its subclauses is read for
# requirements when it is at least this long — less is a
# status line or a few words that lead into them
OWN_TEXT_CHARS = 40








############################################################
# clause_path
############################################################
#
# The citation of a clause: a top-level clause of the body by
# its word ("Clause 4", "4 skyrius"), every other clause by
# its bare number, the way ISO texts refer to them; a
# numbered introduction's clause 0 by its name.
#
# Used by:
#   - _Builder (below) — every unit it opens
############################################################

def clause_path(number, language="lt"):
    if number == "0":
        return INTRODUCTION[language]
    if "." not in number and number.isdigit():
        return f"{number} skyrius" if language == "lt" else f"Clause {number}"
    return number








############################################################
# annex_path
############################################################
#
# The citation of an annex by its letter.
#
# Used by:
#   - _Builder (below)
############################################################

def annex_path(letter, language="lt"):
    return f"{letter} priedas" if language == "lt" else f"Annex {letter}"








############################################################
# _starts_lower
############################################################
#
# True when a line's first letter is a small one — how a
# sentence, a heading or a contents entry goes on after the
# page width cut it.
#
# Used by:
#   - _without_contents, sentence_like, _Builder (below)
############################################################

def _starts_lower(line):
    return line[:1].islower()








############################################################
# _page_lines
############################################################
#
# The extracted text as pages of lines: split at form feeds
# (the extractor keeps one between a PDF's pages), white space
# of every kind turned into single spaces, empty lines gone.
#
# Used by:
#   - body_lines (below)
############################################################

def _page_lines(text):
    pages = []
    for page in text.replace("\r", "").split("\f"):
        lines = [re.sub(r"\s+", " ", line.replace("­", "").replace("​", "")).strip()
                 for line in page.split("\n")]
        pages.append([line for line in lines if line])
    return pages








############################################################
# _furniture_key
############################################################
#
# A line as it repeats from page to page: digits folded to one
# sign (page numbers, years and order numbers vary), so is a
# roman page number at either end; case and spaces ignored (a
# PDF's text now and then has a space inside a word).
#
# Used by:
#   - _edge_keys, _without_furniture (below)
############################################################

def _furniture_key(line):
    folded = re.sub(r"\d+", "#", line).casefold()
    folded = re.sub(r"^[ivxlc]{1,7}(?=[\s©])", "#", folded)
    return re.sub(r"\s+", "", re.sub(r"(?<=\s)[ivxlc]{1,7}$", "#", folded))








############################################################
# _edge_noise
############################################################
#
# True for a line that is furniture whatever the other pages
# hold, when it stands at a page's edge: a lone page number, a
# copyright line, a first page's running title, a rule drawn
# across the page.
#
# Used by:
#   - _without_furniture (below)
############################################################

def _edge_noise(line):
    return bool(PAGE_NUMBER.match(line) or COPYRIGHT_LINE.match(line) or RUNNING_HEAD.match(line)
                or RULE_LINE.match(line))








############################################################
# _edge_keys
############################################################
#
# The lines (as keys) that stand at about the same distance
# from the pages' top — or bottom — on at least `needed`
# pages: at one distance or the next, since left and right
# pages differ by a line. A stamp of five lines under every
# page gives five of them; a heading that happens to open a
# few pages, or a word found anywhere near the edge of many,
# gives none. Only lines with words count: with their digits
# folded, the term numbers that open four pages of a terms
# clause (3.3, 3.9, 3.18, 3.25) would look like one repeated
# line.
#
# Used by:
#   - _without_furniture (below)
############################################################

def _edge_keys(pages, top, needed):
    depth = EDGE_TOP if top else EDGE_BOTTOM
    found = {}
    for lines in pages:
        zone = lines[:depth] if top else lines[::-1][:depth]
        nearest = {}
        for offset, line in enumerate(zone):
            nearest.setdefault(_furniture_key(line), offset)
        for key, offset in nearest.items():
            found.setdefault(key, Counter())[offset] += 1
    return {key for key, offsets in found.items()
            if len(re.findall(r"[^\W\d_]", key)) >= 2
            and max(offsets[at] + offsets[at + 1] for at in offsets) >= needed}








############################################################
# _peel_runs
############################################################
#
# Takes off the pages' outermost lines — the first ones, or
# the last — while one line (as a key) is outermost on
# several pages in a row: the running head of one chapter or
# appendix, which names it and so is too rare for the whole
# document's furniture, or the header a table repeats on
# each of its pages. FURNITURE_MIN_PAGES pages are enough
# for a line with a number in it (the page's), RUN_MIN_PAGES
# for one without — a label of the text itself may open
# three or four pages in a row. Only those pages lose the
# line; a lone page number or a rule left outermost goes
# with it.
#
# Used by:
#   - _without_furniture (below)
############################################################

def _peel_runs(pages, top):
    edge = 0 if top else -1
    for _ in range(EDGE_TOP if top else EDGE_BOTTOM):
        keys = [_furniture_key(lines[edge]) if lines else "" for lines in pages]
        peeled, start = False, 0
        for index in range(1, len(pages) + 1):
            if index < len(pages) and keys[index] == keys[start]:
                continue
            needed = FURNITURE_MIN_PAGES if "#" in keys[start] else RUN_MIN_PAGES
            if index - start >= needed and len(re.findall(r"[^\W\d_]", keys[start])) >= 2:
                peeled = True
                for lines in pages[start:index]:
                    lines.pop(edge)
                    while lines and _edge_noise(lines[edge]):
                        lines.pop(edge)
            start = index
        if not peeled:
            break








############################################################
# _without_furniture
############################################################
#
# The pages without what every page repeats. Each page is
# peeled from its top and from its bottom while the line
# there is one that often stands at that edge, a lone page
# number, a copyright line or a running title — and no
# further, so a clause number alone on a line inside the page
# stays. The longer of those edge lines, the copyright lines
# and the running titles then go wherever they stand, as do
# long lines found on half the pages (a licence stamp printed
# across the page). What only a few pages in a row repeat at
# their very edge goes last (_peel_runs). Fewer than three
# pages show no pattern: only the lines that are furniture
# by their look go.
#
# Used by:
#   - without_furniture, body_lines (below)
############################################################

def _without_furniture(pages):
    top, bottom, anywhere = set(), set(), set()
    if len(pages) >= FURNITURE_MIN_PAGES:
        needed = max(FURNITURE_MIN_PAGES, math.ceil(FURNITURE_SHARE * len(pages)))
        top, bottom = _edge_keys(pages, True, needed), _edge_keys(pages, False, needed)
        anywhere = {key for key in top | bottom if len(key) >= ANYWHERE_KEY_CHARS}
        on_pages = Counter(key for lines in pages for key in {_furniture_key(line) for line in lines})
        anywhere.update(key for key, count in on_pages.items()
                        if len(key) >= STAMP_KEY_CHARS and count >= max(needed, STAMP_SHARE * len(pages)))
    cleaned = []
    for lines in pages:
        start, end = 0, len(lines)
        while start < min(end, EDGE_TOP) and (_furniture_key(lines[start]) in top or _edge_noise(lines[start])):
            start += 1
        while end > start and len(lines) - end < EDGE_BOTTOM \
                and (_furniture_key(lines[end - 1]) in bottom or _edge_noise(lines[end - 1])):
            end -= 1
        cleaned.append([line for line in lines[start:end]
                        if _furniture_key(line) not in anywhere
                        and not COPYRIGHT_LINE.match(line) and not RUNNING_HEAD.match(line)])
    if len(pages) >= FURNITURE_MIN_PAGES:
        _peel_runs(cleaned, True)
        _peel_runs(cleaned, False)
    return cleaned








############################################################
# without_furniture
############################################################
#
# A paged text — a PDF's pages, kept apart by form feeds — as
# one run of lines without what every page repeats: running
# titles, page numbers, stamps. A text of one page shows no
# pattern and comes back as it is. For an act or a guideline
# published as a PDF: read as extracted, a page's header would
# stand in the middle of whatever provision the page break
# cuts.
#
# Used by:
#   - corpus/ingest.py — an act read from its plain text
############################################################

def without_furniture(text):
    pages = _page_lines(text)
    if len(pages) < 2:
        return text
    return "\n".join(line for page in _without_furniture(pages) for line in page)








############################################################
# _without_contents
############################################################
#
# The lines (each with its page-top mark) without the table
# of contents' dot-leader lines.
# An entry too long for its line is printed over two or
# three, only the last with the leader: when a leader line
# starts in lower case, the lines before it go too, back to
# the one that opens the entry with a clause number or an
# annex's name — but only when such an opening is found, so a
# dotted line of a form takes nothing with it.
#
# Used by:
#   - body_lines (below)
############################################################

def _without_contents(marked):
    kept = []
    for line, top in marked:
        if not TOC_LEADER.search(line):
            kept.append((line, top))
            continue
        if not _starts_lower(line):
            continue
        for back in range(1, min(3, len(kept)) + 1):
            entry = kept[-back][0]
            opening = CLAUSE.match(entry)
            if (opening is not None and opening.group(3)) or ANNEX_EN.match(entry) or ANNEX_LT.match(entry):
                del kept[-back:]
                break
            if not _starts_lower(entry):
                break
    return kept








############################################################
# body_lines
############################################################
#
# The extracted text as the lines the parser reads: page by
# page without its furniture, then without the table of
# contents' entries; nothing else is changed. Each line comes
# with whether it stands at the top of its page, and a mark
# line goes before each page's lines — neither for a text of
# one page, which shows no page breaks.
#
# Used by:
#   - parse_standard (below)
#   - corpus/outline.py — read_standard
############################################################

def body_lines(text):
    pages = _without_furniture(_page_lines(text))
    paged = len(pages) > 1
    marked = []
    for number, page in enumerate(pages, 1):
        if paged and page:
            marked.append((f"{PAGE_MARK}{number}", False))
        marked.extend((line, paged and index < PAGE_TOP_LINES) for index, line in enumerate(page))
    return _without_contents(marked)








############################################################
# _heading_like
############################################################
#
# True when a line can be a heading: short, holding words,
# not ending like a sentence or a list item. A heading met on
# the line after its lone number may start in lower case —
# a term entry of the terms clause is printed that way.
#
# Used by:
#   - _Builder (below)
############################################################

def _heading_like(text, relaxed=False):
    text = text.strip()
    if not text or len(text) > MAX_HEADING_CHARS or len(re.findall(r"[^\W\d_]", text)) < 2:
        return False
    if text.endswith((".", ";", ",", ":")):
        return False
    first = text[0]
    return first.isupper() or (relaxed and first.isalpha())








############################################################
# sentence_like
############################################################
#
# True when the text after a clause number reads as a
# sentence, not a heading: it says shall or must, one
# sentence ends and another begins inside it, it is as long
# as the page is wide, or it fills its line and goes on in
# lower case on the next one — as a long line or to a full
# stop, which the wrapped end of a heading is not.
#
# Used by:
#   - _Builder.opens (below)
#   - corpus/outline.py — a marked heading that is a paragraph
############################################################

def sentence_like(text, following=""):
    if SENTENCE_WORDS.search(text) or len(text) >= FULL_LINE_CHARS or SENTENCE_BREAK.search(text):
        return True
    return (len(text) >= PARAGRAPH_FROM_CHARS and bool(following) and _starts_lower(following)
            and (len(following) > WRAP_MAX_CHARS or following.endswith(CLOSERS)))








############################################################
# _accepts
############################################################
#
# True when the numbers `candidate` continue the numbering
# after `previous` (both tuples of integers). Accepted: a
# descendant of the previous clause, or a later sibling of it
# or of one of its ancestors — at most MAX_GAP numbers
# skipped, or `reach` of them among the subclauses of one
# top-level clause — and in both cases a deeper start only
# through first children (5.1 after 4.4 opens clause 5 whose
# heading was lost). With no previous clause, `starts` holds
# the numbers allowed to open the numbering.
#
# Used by:
#   - _Builder.continues (below)
############################################################

def _accepts(previous, candidate, starts, reach=MAX_GAP):
    if previous is None:
        return candidate in starts
    shared = 0
    while shared < min(len(previous), len(candidate)) and previous[shared] == candidate[shared]:
        shared += 1
    if shared == len(candidate):
        return False
    if shared == len(previous):
        first = candidate[shared]
    elif previous[shared] < candidate[shared] <= previous[shared] + 1 + (reach if shared else MAX_GAP):
        first = 1
    else:
        return False
    return 1 <= first <= 1 + MAX_GAP and all(n == 1 for n in candidate[shared + 1:])








############################################################
# _Builder
############################################################
#
# The state of one parse: the preamble, the units opened so
# far, the open clause chain of the body or of the current
# annex, the annexes on trial, the unit that takes the next
# text line, the annex still waiting for its title, the
# heading that may go on over the next lines, and whether the
# last text line left its sentence open.
#
# Used by:
#   - parse_standard (below)
############################################################

class _Builder:

    def __init__(self, language):
        self.language = language
        self.preamble = ParsedUnit("preamble", heading=FRONT_MATTER[language], path=FRONT_MATTER[language])
        self.units = []
        self.chain = []          # [(numbers, unit)] — the open clauses
        self.annex = None
        self.letters = []        # the annexes opened so far, by letter
        self.trials = []         # how to undo each annex still on trial
        self.current = self.preamble
        self.titling = None      # an annex waiting for its title line
        self.wrapping = None     # a heading that may go on over the next line
        self.wraps = 0           # the lines that heading took already
        self.open_sentence = False
        self.read_lines = 0      # how many lines were read so far
        self.listed = None       # (number, line) of the last list item that opened nothing






    ############################################################
    # numbering_start
    ############################################################
    #
    # The numbers the next clause may open with when no clause
    # of the body, or of the current annex, is open yet.
    #
    # Used by:
    #   - continues (below)
    ############################################################

    def numbering_start(self):
        if self.annex is None:
            return FIRST_NUMBERS
        return {(n,) for n in range(1, MAX_ANNEX_START + 1)} | {(n, 1) for n in range(1, MAX_ANNEX_START + 1)}






    ############################################################
    # all_units
    ############################################################
    #
    # Every unit opened so far, depth first.
    #
    # Used by:
    #   - has_body, looks_like_contents, restart (below)
    ############################################################

    def all_units(self):
        stack, found = list(reversed(self.units)), []
        while stack:
            unit = stack.pop()
            found.append(unit)
            stack.extend(reversed(unit.children))
        return found






    ############################################################
    # has_body
    ############################################################
    #
    # True once a clause of the body is open. Until then no
    # annex can open: what names one is the contents, the
    # foreword or the scope.
    #
    # Used by:
    #   - annex_heading, admits (below)
    ############################################################

    def has_body(self):
        return any(unit.unit_type == "clause" for unit in self.units)






    ############################################################
    # looks_like_contents
    ############################################################
    #
    # True when what was parsed so far is a table of contents:
    # clauses were opened, and no more than a quarter of them
    # took any text.
    #
    # Used by:
    #   - continues (below)
    ############################################################

    def looks_like_contents(self):
        clauses = [unit for unit in self.all_units() if unit.unit_type == "clause"]
        return bool(clauses) and sum(1 for unit in clauses if text_lines(unit)) <= max(1, len(clauses) // 4)






    ############################################################
    # restart
    ############################################################
    #
    # Throws away a table of contents: its entries go, any text
    # that landed under them (the foreword that followed it)
    # moves to the preamble, and the numbering starts afresh.
    #
    # Used by:
    #   - continues (below)
    ############################################################

    def restart(self):
        for unit in self.all_units():
            if unit.unit_type == "text":
                self.preamble.lines.extend(unit.lines[1:])
            else:
                self.preamble.lines.extend(unit.lines)
        self.units, self.chain, self.annex, self.letters, self.trials = [], [], None, [], []
        self.current, self.titling, self.wrapping = self.preamble, None, None






    ############################################################
    # continues
    ############################################################
    #
    # True when a clause numbered `numbers` may open here,
    # restarting the numbering first when what came before was
    # a table of contents. A bare first number (1, 0.1) after
    # contents that listed the annexes too restarts at once —
    # inside such an annex it would read as the annex's own
    # clause. A bare number that goes on with the body's
    # numbering while every annex opened so far is on trial
    # undoes them: the body had not ended. Once a bibliography
    # closed the body, only the restart can open a clause
    # again.
    #
    # Used by:
    #   - admits (below)
    ############################################################

    def continues(self, numbers, bare, reach=MAX_GAP):
        restartable = bare and numbers in FIRST_NUMBERS and bool(self.units) and self.looks_like_contents()
        if restartable and self.annex is not None:
            self.restart()
            return True
        if bare and self.trials and len(self.trials) == len(self.letters) \
                and self.trials[0]["chain"] and _accepts(self.trials[0]["chain"][-1][0], numbers, FIRST_NUMBERS):
            self.undo(0)
        if self.chain:
            previous = self.chain[-1][0]
        elif self.annex is not None or not self.has_body():
            previous = None
        else:
            if restartable:
                self.restart()
            return restartable
        if _accepts(previous, numbers, self.numbering_start(), reach):
            return True
        if restartable:
            self.restart()
        return restartable






    ############################################################
    # admits
    ############################################################
    #
    # True when a clause with this annex letter (or none) and
    # these numbers may open here: a bare number continues the
    # numbering of the body or of the open annex, a lettered
    # one that of its own annex. A lettered first clause of the
    # annex due next, met while that annex is not open, means
    # the annex's heading was lost: the annex opens without a
    # title. `reach` is how many sibling subclauses the number
    # may skip. May restart the numbering (continues), so it is
    # asked last.
    #
    # Used by:
    #   - opens (below)
    ############################################################

    def admits(self, letter, numbers, reach=MAX_GAP):
        if letter is None:
            return self.continues(numbers, True, reach)
        if self.annex is not None and letter == self.annex.number:
            return self.continues(numbers, False, reach)
        last = self.letters[-1] if self.letters else None
        due = "A" if last is None else (chr(ord(last) + 1) if len(last) == 1 else None)
        if self.has_body() and letter == due and numbers in ((1,), (1, 1)):
            self.open_annex(letter, "", "")
            self.titling = None
            return True
        return False






    ############################################################
    # open_clause
    ############################################################
    #
    # A new clause under the open chain: clauses that are not
    # its ancestors close first; a parent whose heading line
    # was lost (5.1 right after 4.4) is opened without a
    # heading, so the tree keeps its shape. A heading may go on
    # over the next lines (wrapped). The clause is numbered as
    # the document prints it — a requirement printed 03.01.02
    # is cited so.
    #
    # Used by:
    #   - opens (below)
    ############################################################

    def open_clause(self, numbers, heading, printed=None):
        if self.annex is not None:
            heading = TABLE_COLUMN.sub("", heading)
        while self.chain and self.chain[-1][0] != numbers[:len(self.chain[-1][0])]:
            self.chain.pop()
        depth = len(self.chain[-1][0]) if self.chain else 0
        unit = None
        for level in range(depth + 1, len(numbers) + 1):
            part = numbers[:level]
            number = ".".join(str(n) for n in part)
            if printed and level == len(numbers):
                number = printed
            if self.annex is not None:
                number = f"{self.annex.number}.{number}"
            title = heading if level == len(numbers) else ""
            if not title and self.annex is None and part == (0,):
                title = INTRODUCTION[self.language]
            unit = ParsedUnit("clause", number=number, heading=title,
                              path=clause_path(number, self.language) if self.annex is None else number)
            parent = self.chain[-1][1] if self.chain else self.annex
            (parent.children if parent is not None else self.units).append(unit)
            self.chain.append((part, unit))
        self.current, self.titling, self.open_sentence, self.listed = unit, None, False, None
        self.wrapping, self.wraps = (unit if unit.heading else None), 0
        return unit






    ############################################################
    # open_annex
    ############################################################
    #
    # A new annex at the top level; its status line, when it
    # shared the heading's line, is its first text line. An
    # annex without a title yet waits for it on the next line.
    # One that does not start a page is on trial: how to undo
    # it is kept (undo).
    #
    # Used by:
    #   - read, admits (in this class)
    ############################################################

    def open_annex(self, letter, status, title, firm=False):
        unit = ParsedUnit("annex", number=letter, heading="", path=annex_path(letter, self.language))
        if status:
            unit.lines.append(f"({status})")
        if firm:
            self.trials = []
        else:
            self.trials.append({"at": len(self.units), "chain": list(self.chain), "annex": self.annex,
                                "current": self.current, "letters": list(self.letters), "lines": []})
        self.units.append(unit)
        self.letters.append(letter)
        self.annex, self.chain, self.current = unit, [], unit
        self.titling, self.wrapping, self.open_sentence, self.listed = unit, None, False, None
        if title:
            self.entitle(unit, title)






    ############################################################
    # undo
    ############################################################
    #
    # Takes back the annexes on trial from the given one on:
    # the lines read since it opened go, as they were printed,
    # to the unit that was open before it, and the numbering
    # goes on where it stood.
    #
    # Used by:
    #   - continues, annex_heading (in this class)
    ############################################################

    def undo(self, index):
        trial = self.trials[index]
        for later in self.trials[index:]:
            trial["current"].lines.extend(later["lines"])
        del self.units[trial["at"]:]
        self.chain, self.annex, self.letters = trial["chain"], trial["annex"], trial["letters"]
        self.current, self.titling, self.wrapping = trial["current"], None, None
        del self.trials[index:]






    ############################################################
    # entitle
    ############################################################
    #
    # Gives a unit its heading, which may go on over the next
    # lines.
    #
    # Used by:
    #   - open_annex, read (in this class)
    ############################################################

    def entitle(self, unit, heading):
        unit.heading = heading
        self.titling, self.wrapping, self.wraps = None, unit, 0






    ############################################################
    # annex_heading
    ############################################################
    #
    # The letter, status and title of the annex a line opens —
    # its name alone, or with the status and the title after it,
    # whatever punctuation the publisher puts between them — or
    # None. A sentence that starts with an annex's name is not
    # one, nor is an annex whose letter does not come after the
    # last one's, nor any annex named before the body began. An
    # annex that starts a page displaces one of its letter (or
    # a later one) still on trial: that one was an example in
    # the text.
    #
    # Used by:
    #   - read (below)
    ############################################################

    def annex_heading(self, line, top):
        match = ANNEX_EN.match(line) or ANNEX_LT.match(line)
        if not match or not self.has_body():
            return None
        letter, rest = match.group(1), LEAD_PUNCTUATION.sub("", match.group(2).strip())
        status = ""
        found = ANNEX_STATUS.match(rest)
        if found:
            status, rest = found.group(1).lower(), LEAD_PUNCTUATION.sub("", found.group(2).strip())
        if rest and not _heading_like(rest):
            return None
        if top:
            for index, trial in enumerate(self.trials):
                on_trial = self.units[trial["at"]].number
                if (len(on_trial), on_trial) >= (len(letter), letter):
                    self.undo(index)
                    break
        if self.letters and (len(letter), letter) <= (len(self.letters[-1]), self.letters[-1]):
            return None
        return letter, status, rest






    ############################################################
    # opens
    ############################################################
    #
    # Opens the clause a numbered line starts, when it starts
    # one, and answers the lines it used (0 when the line is
    # text). Three shapes: a number alone on its line with the
    # heading on the next (a term entry; never a lone integer,
    # which is a page number or a table cell); a number and its
    # heading; a number and a paragraph — a clause without a
    # heading, which needs a subclause number, a capital letter
    # and the sentence before it to have ended. A heading whose
    # first letter the PDF set apart as a large capital comes
    # as that letter and, on the next line, the rest: the two
    # are put together.
    #
    # Used by:
    #   - clause (below)
    ############################################################

    def opens(self, match, line, following):
        letter, text, printed = match.group(1), match.group(3), match.group(2)
        numbers = tuple(int(n) for n in printed.split("."))
        if text is not None and len(text) <= 2 and text.isupper() and following[:1].islower():
            whole = f"{text}{following}".strip()
            if (_heading_like(whole) and not sentence_like(whole)
                    and self.admits(letter, numbers, MAX_HEADING_GAP)):
                self.open_clause(numbers, whole, printed)
                return 2
        if text is None:
            if (len(numbers) < 2 or not following or CLAUSE.match(following)
                    or len(following) > MAX_SPLIT_HEADING_CHARS or SENTENCE_WORDS.search(following)
                    or not _heading_like(following, relaxed=True) or not self.admits(letter, numbers)):
                return 0
            self.open_clause(numbers, following.strip(), printed)
            return 2
        if _heading_like(text) and not sentence_like(text, following):
            if not self.admits(letter, numbers, MAX_HEADING_GAP):
                return 0
            self.open_clause(numbers, text.strip(), printed)
            return 1
        starts = text[:1].isupper() or text[:1] in "„“\"(«"
        if len(numbers) < 2 or not starts or self.open_sentence or not self.admits(letter, numbers):
            return 0
        self.open_clause(numbers, "", printed).lines.append(line)
        self.open_sentence = len(line) >= OPEN_FROM_CHARS and not line.endswith(CLOSERS)
        return 1






    ############################################################
    # clause
    ############################################################
    #
    # A line that opens with a clause number: answers how many
    # lines it took to open a clause (opens), or 0 when it
    # opened none. An item of a numbered list is told from a
    # top-level heading by the run it stands in: a whole number
    # with a full stop that comes within LIST_REACH lines after
    # the number before it, which itself opened nothing, goes
    # on a list — its first items could not continue the
    # numbering, so none of them does.
    #
    # Used by:
    #   - place (below)
    ############################################################

    def clause(self, match, line, following):
        item = (match.group(1) is None and match.group(2).isdigit()
                and line[match.end(2):match.end(2) + 1] == ".")
        if item:
            number = int(match.group(2))
            if self.listed is not None and (number, True) == (
                    self.listed[0] + 1, self.read_lines - self.listed[1] <= LIST_REACH):
                self.listed = (number, self.read_lines)
                return 0
        used = self.opens(match, line, following)
        if item and not used:
            self.listed = (number, self.read_lines)
        return used






    ############################################################
    # wrapped
    ############################################################
    #
    # True when a line is the next part of the heading that may
    # still go on: after a hyphen that broke a word, or a short
    # line in lower case that does not end a sentence — in the
    # body only after a long first line, in an annex's narrow
    # columns after any. The line is then joined to the heading.
    #
    # Used by:
    #   - read (below)
    ############################################################

    def wrapped(self, line):
        unit = self.wrapping
        if unit is None or self.wraps >= MAX_WRAPS or not _starts_lower(line) or LIST_ITEM.match(line):
            return False
        broken = unit.heading.endswith("-")
        if not broken and (len(line) > WRAP_MAX_CHARS or line.endswith((".", ";", ":", ","))
                           or (self.annex is None and len(unit.heading) < WRAP_FROM_CHARS)):
            return False
        unit.heading = f"{unit.heading[:-1]}{line}" if broken else f"{unit.heading} {line}"
        if self.annex is not None:
            unit.heading = TABLE_COLUMN.sub("", unit.heading)
        self.wraps += 1
        return True






    ############################################################
    # read
    ############################################################
    #
    # One line, with the next one for what a heading or a
    # paragraph shows only there, and whether the line starts
    # a page; answers how many lines it used (1 or 2). While an
    # annex is on trial the lines read are kept for it (undo).
    #
    # Used by:
    #   - parse_standard (below)
    ############################################################

    def read(self, line, following, top=False):
        self.read_lines += 1
        used = self.place(line, following, top)
        if self.trials:
            self.trials[-1]["lines"].extend([line, following][:used])
        return used






    ############################################################
    # mark
    ############################################################
    #
    # A page mark, put where the text stands now: it stays with
    # the lines around it whatever unit takes them (and with an
    # annex on trial, should that be undone).
    #
    # Used by:
    #   - parse_marked (below)
    ############################################################

    def mark(self, line):
        self.current.lines.append(line)
        if self.trials:
            self.trials[-1]["lines"].append(line)






    ############################################################
    # place
    ############################################################
    #
    # Puts one line where it belongs — an annex's title, a new
    # annex, the bibliography, a new clause, a heading's next
    # part or the open unit's text — and answers how many lines
    # it used.
    #
    # Used by:
    #   - read (above)
    ############################################################

    def place(self, line, following, top):
        # STEP 1: the annex still owed its status and title lines
        # =======================================================
        if self.titling is not None:
            unit = self.titling
            status = ANNEX_STATUS.match(line)
            if status and not text_lines(unit):
                unit.lines.append(f"({status.group(1).lower()})")
                title = LEAD_PUNCTUATION.sub("", status.group(2).strip())
                if title:
                    self.entitle(unit, title)
                return 1
            if _heading_like(line) and not CLAUSE.match(line):
                self.entitle(unit, line)
                return 1
            self.titling = None


        # STEP 2: the bibliography — its heading at a page's top,
        # or before a line that opens like an entry of one (the
        # word alone names it in a checklist too) — and the
        # annexes
        # =======================================================
        if BIBLIOGRAPHY.match(line) and self.has_body() and (top or BIBLIOGRAPHY_ENTRY.match(following)):
            unit = ParsedUnit("text", lines=[line], path=BIBLIOGRAPHY_NAME[self.language])
            self.units.append(unit)
            self.chain, self.annex, self.current, self.wrapping = [], None, unit, None
            self.open_sentence, self.trials = False, []
            return 1
        annex = self.annex_heading(line, top)
        if annex is not None:
            self.open_annex(*annex, firm=top)
            return 1


        # STEP 3: a clause — its heading, or a numbered paragraph
        # =======================================================
        match = CLAUSE.match(line)
        if match is not None:
            used = self.clause(match, line, following)
            if used:
                return used


        # STEP 4: text — the next part of a wrapped heading, or a
        # line of the unit open now (a number alone on a line
        # that opened nothing stays: inside a page it is a table
        # cell or a cross-reference, the page numbers went with
        # the furniture)
        # =======================================================
        if self.wrapped(line):
            return 1
        self.wrapping = None
        self.current.lines.append(line)
        self.open_sentence = len(line) >= OPEN_FROM_CHARS and not line.endswith(CLOSERS)
        return 1








############################################################
# text_lines
############################################################
#
# A unit's own lines without the page marks among them.
#
# Used by:
#   - _Builder, strip_marks, structure_ok (in this module)
#   - corpus/outline.py
############################################################

def text_lines(unit):
    return [line for line in unit.lines if not line.startswith(PAGE_MARK)]








############################################################
# parse_marked
############################################################
#
# The clause tree of a standard's lines as body_lines gives
# them: the preamble (when anything preceded the first
# clause), the clauses, the annexes with their clauses, the
# bibliography. Every unit carries its citation path; the
# page marks are still among the units' lines.
#
# Used by:
#   - parse_standard (below)
#   - corpus/outline.py — read_standard
############################################################

def parse_marked(marked, language="lt"):
    language = language if language in FRONT_MATTER else "lt"
    builder = _Builder(language)
    index = 0
    while index < len(marked):
        line, top = marked[index]
        if line.startswith(PAGE_MARK):
            builder.mark(line)
            index += 1
            continue
        after = index + 1
        while after < len(marked) and marked[after][0].startswith(PAGE_MARK):
            after += 1
        following = marked[after][0] if after < len(marked) else ""
        if builder.read(line, following, top) == 2:
            for between in range(index + 1, after):
                builder.mark(marked[between][0])
            index = after + 1
        else:
            index += 1
    if text_lines(builder.preamble):
        return [builder.preamble] + builder.units
    # No front matter: the first unit keeps the marks of the
    # pages before it
    if builder.units:
        builder.units[0].lines[0:0] = builder.preamble.lines
    return builder.units








############################################################
# strip_marks
############################################################
#
# Takes the page marks out of a finished tree's lines.
#
# Used by:
#   - parse_standard (below)
#   - corpus/outline.py — read_standard
############################################################

def strip_marks(tree):
    stack = list(tree)
    while stack:
        unit = stack.pop()
        unit.lines = text_lines(unit)
        stack.extend(unit.children)
    return tree








############################################################
# parse_standard
############################################################
#
# The clause tree of a standard's extracted text, by the
# rules of this module alone.
#
# Used by:
#   - tests — the layouts of real copies
############################################################

def parse_standard(text, language="lt"):
    return strip_marks(parse_marked(body_lines(text), language))








############################################################
# text_size
############################################################
#
# The characters of a unit's heading and text, its
# subclauses' included, page marks left out.
#
# Used by:
#   - structure_ok (below)
#   - corpus/outline.py
############################################################

def text_size(unit):
    own = len(unit.heading) + sum(len(line) + 1 for line in text_lines(unit))
    return own + sum(text_size(child) for child in unit.children)








############################################################
# structure_ok
############################################################
#
# True when a tree holds the standard's structure: at least
# MIN_STANDARD_CLAUSES clauses, and no more than
# MAX_PREAMBLE_SHARE of the text before the first one.
#
# Used by:
#   - corpus/outline.py — read_standard
############################################################

def structure_ok(tree):
    total = sum(text_size(unit) for unit in tree) or 1
    front = sum(text_size(unit) for unit in tree if unit.unit_type == "preamble")
    return clause_count(tree) >= MIN_STANDARD_CLAUSES and front / total <= MAX_PREAMBLE_SHARE








############################################################
# clause_count
############################################################
#
# How many clauses a tree holds, annex clauses included.
#
# Used by:
#   - structure_ok (above)
#   - corpus/outline.py, corpus/ingest.py
############################################################

def clause_count(tree):
    stack, count = list(tree), 0
    while stack:
        unit = stack.pop()
        count += unit.unit_type == "clause"
        stack.extend(unit.children)
    return count








############################################################
# standard_reference
############################################################
#
# What a reference to a standard names, as ("clause", number)
# or ("annex", letter), or None when it names neither. The
# words around the number go ("clause", "punktas",
# "control"…); an annex named in words or as a letter prefix
# joins the number ("Annex A, 5.15", "A priedo 5.15", "A 5.15",
# "A5.15" are all A.5.15); a list item after the number
# ("6.1.3 d)") is ignored.
#
# Used by:
#   - find_clause (below)
############################################################

def standard_reference(raw):
    value = str(raw or "").strip()
    if not value or len(value) > 200:
        return None
    letter = None
    annex = REFERENCE_ANNEX.search(value)
    if annex:
        letter = (annex.group(1) or annex.group(2)).upper()
        value = value[:annex.start()] + " " + value[annex.end():]
    value = REFERENCE_WORDS.sub(" ", value)
    number = REFERENCE_NUMBER.search(value)
    if number is None:
        return ("annex", letter) if letter else None
    letter = letter or number.group(1)
    digits = number.group(2)
    return ("clause", f"{letter}.{digits}") if letter else ("clause", digits)








############################################################
# _numbered_only
############################################################
#
# True when a reference is nothing but a clause number the
# ISO way — with the words around it, an annex and a list
# item at most — and not an identifier of another kind that
# happens to hold digits.
#
# Used by:
#   - find_clause (below)
############################################################

def _numbered_only(value):
    rest = REFERENCE_WORDS.sub(" ", REFERENCE_ANNEX.sub(" ", value))
    rest = REFERENCE_LIST_ITEM.sub(" ", REFERENCE_NUMBER.sub(" ", rest, count=1))
    return not re.search(r"\w", rest)








############################################################
# find_clause
############################################################
#
# The unit of a standard's version a reference names, or
# None. A reference that is a unit's citation as the corpus
# shows it names that unit; a page names the page of a
# standard read by pages. Otherwise two readings are tried —
# first the one the reference looks like:
#
# The numbered one (see standard_reference). A bare number
# the body does not have is looked for in the normative
# annexes — "5.15" of ISO/IEC 27001 is its A.5.15 — when
# exactly one has it; a reference that says "control" means
# the annex's even when the body has a clause of that number
# (27001's 5.1 is leadership, its control 5.1 the policies).
# An informative annex never answers a bare number: its
# tables list the body's own clauses.
#
# The identifier one, for a standard with identifiers of its
# own: the unit numbered exactly so, with or without the
# words around it, then the only unit whose number has the
# same letters and digits, then the only one with that
# heading.
#
# A `part` (a paragraph or point of the reference) names a
# subclause: clause 6.1, part 2 is 6.1.2. When neither
# reading finds a unit and the reference is a number behind
# a letter or two, the number alone is tried.
#
# Used by:
#   - corpus/search.py — find_provision
#   - corpus/citations.py — _locate
############################################################

def find_clause(version_id, reference, part=None):
    from compliance.corpus.models import LegalUnit

    value = " ".join(str(reference or "").split())
    if not value or len(value) > 200:
        return None
    units = LegalUnit.objects.filter(version_id=version_id, unit_type__in=("clause", "annex"))
    clauses = units.filter(unit_type="clause")
    part = str(part or "").strip().strip("().")

    def only(rows):
        found = list(rows[:2])
        return found[0] if len(found) == 1 else None

    def numbered():
        found = standard_reference(value)
        if found is None:
            return None
        kind, number = found
        if kind == "annex":
            return units.filter(unit_type="annex", number=number).first()
        if part.isdigit():
            number = f"{number}.{part}"
        # Whatever zeros pad the parts: 3.1.2 is the 03.01.02 a
        # document prints, and the other way round
        padded = r"\.".join(f"0*{int(piece)}" if piece.isdigit() else re.escape(piece)
                            for piece in number.split("."))

        def in_annexes():
            informative = [annex.number for annex in units.filter(unit_type="annex")
                           if INFORMATIVE.search(annex.text[:400])]
            inside = [unit for unit in clauses.filter(number__regex=rf"^[A-Z]{{1,2}}\.{padded}$")[:5]
                      if unit.number.split(".")[0] not in informative]
            return inside[0] if len(inside) == 1 else None

        bare = number[0].isdigit()
        unit = in_annexes() if bare and CONTROL_WORDS.search(value) else None
        unit = unit or clauses.filter(number__regex=f"^{padded}$").first()
        return unit or (in_annexes() if bare else None)

    def identified():
        names = list(dict.fromkeys([value, REFERENCE_WORDS.sub(" ", value).strip()]))
        for name in names:
            for candidate in ([f"{name}.{part}", f"{name}({part})"] if part else []) + [name]:
                unit = clauses.filter(number__iexact=candidate).first()
                if unit is not None:
                    return unit
        wanted = {re.sub(r"[\W_]+", "", name).casefold() for name in names} - {""}
        alike = [unit_id for unit_id, number in clauses.exclude(number="").values_list("id", "number")
                 if re.sub(r"[\W_]+", "", number).casefold() in wanted]
        if len(alike) == 1:
            return units.get(id=alike[0])
        return only(units.filter(heading__iexact=value))


    # STEP 1: the citation as the corpus shows it, or a page
    # ======================================================
    if not part:
        unit = units.filter(path__iexact=value).first()
        if unit is not None:
            return unit
    page = REFERENCE_PAGE.match(value)
    if page:
        code = f"p{int(page.group(1) or page.group(2))}"
        unit = clauses.filter(number=code).first() or only(clauses.filter(number__endswith=f"/{code}"))
        if unit is not None:
            return unit


    # STEP 2: the two readings, the likelier one first
    # ================================================
    readings = (numbered, identified) if _numbered_only(value) else (identified, numbered)
    unit = readings[0]() or readings[1]()
    prefixed = REFERENCE_PREFIXED.match(value)
    if unit is None and prefixed:
        padded = r"\.".join(f"0*{int(piece)}" for piece in prefixed.group(1).split("."))
        unit = clauses.filter(number__regex=f"^{padded}$").first()
    return unit








############################################################
# states_no_requirements
############################################################
#
# True for a top-level clause or annex that by its heading
# states no requirements: the numbered introduction, the
# scope, references, terms and definitions, a glossary and
# the like (NON_REQUIREMENT_HEADINGS, NON_REQUIREMENT_TITLES).
#
# Used by:
#   - requirement_units (below)
#   - corpus/outline.py — _long_leaves
############################################################

def states_no_requirements(unit_type, number, heading):
    heading = re.sub(r"\s+", "", heading).casefold()
    return ((unit_type == "clause" and number == "0") or heading.startswith(NON_REQUIREMENT_HEADINGS)
            or heading in NON_REQUIREMENT_TITLES)








############################################################
# requirement_units
############################################################
#
# The units a standard's requirements are read from, among
# its version's units in document order: the clauses (and
# annexes) without subclauses, and those with subclauses
# whose own text before them is at least OWN_TEXT_CHARS —
# these answer with that text alone (changed on the row in
# memory, never saved), as their subclauses are read on
# their own. Left out, with everything under them: the
# preamble, the bibliography, the top-level clauses and
# annexes that state no requirements (the numbered
# introduction, scope, references, terms and definitions, a
# glossary…) and informative annexes.
#
# Used by:
#   - corpus/obligations.py — provisions_of
############################################################

def requirement_units(units):
    below = {}
    for unit in units:
        if unit.parent_id:
            below.setdefault(unit.parent_id, []).append(unit)
    skipped = set()
    for unit in units:
        if (unit.parent_id in skipped or unit.unit_type in ("preamble", "text")
                or (unit.depth == 0 and states_no_requirements(unit.unit_type, unit.number, unit.heading))
                or (unit.unit_type == "annex" and INFORMATIVE.search(unit.text[:400]))):
            skipped.add(unit.id)
    found = []
    for unit in units:
        if unit.unit_type not in ("clause", "annex") or unit.id in skipped:
            continue
        if unit.id in below:
            under = "\n".join(child.text for child in below[unit.id] if child.text)
            own = unit.text[:len(unit.text) - len(under)].strip() if unit.text.endswith(under) else ""
            if len(own) - len(unit.number) - len(unit.heading) < OWN_TEXT_CHARS:
                continue
            unit.text = own
        found.append(unit)
    return found
