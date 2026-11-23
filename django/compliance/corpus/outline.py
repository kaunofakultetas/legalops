############################################################
#  [*] corpus.outline — a standard's structure, whatever its form
#
#  corpus/standards.py reads a standard drafted the ISO way.
#  read_standard here gives every readable document a tree of
#  citable units, by the first of three ways that works:
#
#    1. rules — the numbered clauses and lettered annexes
#               (standards.py). A clause they leave too long
#               to cite is read further by the model when its
#               text carries identifiers of its own — a
#               control catalogue inside a numbered chapter
#    2. model — when the rules found no structure: the model
#               marks which lines are headings, and the tree
#               is built from those lines
#    3. pages — when neither did: each page is a unit, cited
#               by its number
#
#  The model only points at lines. Every heading, identifier
#  and line of text in the tree is the document's own: a line
#  outside the excerpt it was shown, an identifier the line
#  does not open with and a "heading" that reads as a
#  paragraph are dropped. The units built from its marks are
#  clauses like any other — the identifier as printed for a
#  number and a citation, the heading itself for a citation
#  when it has none — so the search, the citations and the
#  requirement extraction need not know how a standard was
#  read.
#
#  Whatever way was used, a unit still longer than
#  SPLIT_FROM_CHARS is cut by its pages, so a requirement is
#  never cited to forty pages at once.
############################################################


import itertools
import re
from collections import Counter
from dataclasses import dataclass, field


from compliance.common.parallel import parallel_map
from compliance.corpus.standards import (
    FRONT_MATTER, INFORMATIVE, LEAD_PUNCTUATION, MAX_HEADING_CHARS, MAX_SPLIT_HEADING_CHARS, PAGE_MARK,
    PARAGRAPH_FROM_CHARS, SENTENCE_BREAK, SENTENCE_WORDS, WRAP_FROM_CHARS, body_lines, clause_path, parse_marked,
    sentence_like, states_no_requirements, strip_marks, structure_ok, text_lines, text_size,
)
from compliance.corpus.structure import ParsedUnit, iter_units


# The ways a standard's structure can be read — the ingest's
# `structure` choice; "auto" tries them in the order above
METHODS = ("auto", "rules", "ai", "pages")

# What each way is recorded as on the version (its parser)
RULES, REFINED, MODEL, PAGES = "standard", "standard-refined", "standard-ai", "standard-pages"

# The model reads this much text per call, as numbered lines
# (~8k tokens), each line shown up to SHOWN_LINE_CHARS — no
# heading is longer — and is told the last CONTEXT_HEADINGS
# headings found before the excerpt
WINDOW_CHARS = 28_000
SHOWN_LINE_CHARS = 200
CONTEXT_HEADINGS = 14

# A document longer than this is never sent to the model
MAX_AI_CHARS = 2_500_000

# A clause the rules left longer than this is read further by
# the model, and its headings are taken when at least
# MIN_REFINED of them carry an identifier
REFINE_FROM_CHARS = 15_000
MIN_REFINED = 3

# The rules did not read a document whose single clause is
# longer than REFINE_FROM_CHARS and holds more than this
# share of the text: a numbered list near the start was
# taken for the clauses, and the rest fell under its last
# item
MAX_LEAF_SHARE = 0.5

# A unit without subclauses longer than this is cut by pages
# — into parts of PART_CHARS when the text shows no pages
SPLIT_FROM_CHARS = 24_000
PART_CHARS = 6_000

# What may follow an identifier on its line: the end, a
# space, or a sign and a space — never more of a word (ID is
# no identifier of a line that reads IDENTIFY)
AFTER_IDENTIFIER = re.compile(r"^(?:$|\s|[:.)\]|–—-](?:\s|$))")

# What the model may say of one heading: the lines it spans,
# how long its identifier is, how deep it sits
MAX_HEADING_LINES = 4
MAX_IDENTIFIER_CHARS = 30
MAX_LEVEL = 6

# A heading whose identifier another heading carries too, and
# that has less text than this under it, is an entry of a
# list of the real ones (a summary table, a contents page
# without leaders)
TINY_BODY_CHARS = 150

# A heading used as a citation is cut to this length
PATH_CHARS = 80

# A name that ends with its code in brackets — the function
# or category of a framework, whose definition follows a
# colon on the same line
CODED_NAME = re.compile(r"\([A-Z][A-Z0-9.\-]{0,11}\)$")

# What a list puts before its items: a control or an outcome
# of a framework is often printed as one, its code after the
# bullet
BULLET = re.compile(r"^(?:[•◦▪■●○·*–—-]|o)\s+")

OUTLINE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["headings"],
    "properties": {"headings": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["line", "lastLine", "level", "identifier"],
        "properties": {
            "line": {"type": "integer"},
            "lastLine": {"type": "integer"},
            "level": {"type": "integer"},
            "identifier": {"type": "string"},
        },
    }}},
}

PAGE_PATH = {"lt": "{page} psl.", "en": "p. {page}"}
PART_PATH = {"lt": "{part} dalis", "en": "Part {part}"}
PART_INSIDE = {"lt": "{part} dalis", "en": "part {part}"}








############################################################
# OutlineUnavailable
############################################################
#
# The model could not be asked — its prompt is not set up,
# or the gateway failed. read_standard then goes on without
# it.
#
# Used by:
#   - corpus/ingest.py — raised by the `ask` it passes
#   - read_standard (below)
############################################################

class OutlineUnavailable(Exception):
    pass








############################################################
# _Mark
############################################################
#
# One heading the model marked: where its lines stand among
# the unit's lines, its level, the identifier the model
# named, the heading's lines as printed and the line after
# them — and, once named (_name), its number as printed
# (`local`) and in full, its heading and the lines that open
# its text.
#
# Used by:
#   - _verified, _settle, _grow (below)
############################################################

@dataclass
class _Mark:
    at: int
    to: int
    level: int
    identifier: str
    printed: list
    following: str = ""
    local: str = ""
    number: str = ""
    heading: str = ""
    opening: list = field(default_factory=list)








############################################################
# _squeeze
############################################################
#
# A text without its spaces, in one case — how an identifier
# is compared with the line it should open, since a PDF may
# put a space inside a word.
#
# Used by:
#   - _verified, _name (below)
############################################################

def _squeeze(text):
    return re.sub(r"\s+", "", text).casefold()








############################################################
# _joined
############################################################
#
# The lines of a heading as one text, without the bullet that
# may open them: put together with spaces — except a lone
# capital letter and the lower-case line after it, which a
# PDF sets apart when it prints the first letter of a
# heading large.
#
# Used by:
#   - _verified, _name, _headings (below)
############################################################

def _joined(printed):
    whole = ""
    for line in printed:
        apart = whole[-1:].isupper() and (len(whole) == 1 or whole[-2] == " ")
        whole = f"{whole}{line}" if not whole or (apart and line[:1].islower()) else f"{whole} {line}"
    return BULLET.sub("", whole)








############################################################
# _tidy
############################################################
#
# An identifier without the spaces a PDF put inside it:
# those beside a full stop, a hyphen or a bracket, and the
# one after a lone letter that opens a word.
#
# Used by:
#   - _name (below)
############################################################

def _tidy(code):
    code = re.sub(r"\s*([.\-–()\[\]/])\s*", r"\1", code)
    return re.sub(r"\b([^\W\d_]) (?=[^\W\d_])", r"\1", code)








############################################################
# _windows
############################################################
#
# The (start, end) ranges of lines that make one excerpt
# each, under WINDOW_CHARS as the model is shown them.
#
# Used by:
#   - _headings, _planned (below)
############################################################

def _windows(texts):
    ranges, start, size = [], 0, 0
    for index, line in enumerate(texts):
        length = min(len(line), SHOWN_LINE_CHARS) + 8
        if index > start and size + length > WINDOW_CHARS:
            ranges.append((start, index))
            start, size = index, 0
        size += length
    if start < len(texts):
        ranges.append((start, len(texts)))
    return ranges








############################################################
# _verified
############################################################
#
# The model's answer for one excerpt as marks, with what
# cannot be true left out: an entry that is not a line of
# this excerpt or overlaps the heading before it is dropped,
# a heading spans its first line alone unless its last line
# is one of the next few, and an identifier the heading does
# not open with is forgotten. `positions` says where each
# numbered line stands among the unit's lines.
#
# Used by:
#   - _headings (below)
############################################################

def _verified(answer, texts, positions, start, end):
    marks, taken = [], start - 1
    items = [item for item in answer if isinstance(item, dict) and type(item.get("line")) is int]
    for item in sorted(items, key=lambda item: item["line"]):
        first, last, level = item["line"], item.get("lastLine"), item.get("level")
        if not taken < first < end:
            continue
        if type(last) is not int or not first <= last < min(first + MAX_HEADING_LINES, end):
            last = first
        printed = texts[first:last + 1]
        identifier = " ".join(str(item.get("identifier") or "").split())
        if (not 0 < len(identifier) <= MAX_IDENTIFIER_CHARS or not re.search(r"\w", identifier)
                or not _squeeze(_joined(printed)).startswith(_squeeze(identifier))):
            identifier = ""
        marks.append(_Mark(at=positions[first], to=positions[last],
                           level=min(max(level, 1), MAX_LEVEL) if type(level) is int else 1,
                           identifier=identifier, printed=printed,
                           following=texts[last + 1] if last + 1 < len(texts) else ""))
        taken = last
    return marks








############################################################
# _name
############################################################
#
# Gives a mark its number and heading from its own lines, or
# answers False when the lines are no heading at all.
#
# The identifier is cut off the line as printed — its letters
# and digits the document's, its spacing the model's and
# tidied, since a PDF may put a space inside a code — and is
# believed only when it ends where a word ends. What follows
# it is the heading, unless it reads as a sentence, goes on
# in lower case on the next line or is not there at all:
# then the unit has no heading and the lines open its text,
# as a numbered paragraph does. An identifier that is the
# whole line and has no digit is a heading that names its
# division in words.
#
# A line without an identifier may hold a short name, a
# colon and a sentence (or, after a name that ends with its
# code in brackets, a definition of any length) — the name
# is the heading and the rest its first line; otherwise one
# that reads as a sentence or ends like one is a paragraph
# the model mistook.
#
# Used by:
#   - _headings (below)
############################################################

def _name(mark):
    head = _joined(mark.printed)
    number, rest = "", head
    if mark.identifier:
        wanted, cut = len(_squeeze(mark.identifier)), 0
        while len(_squeeze(head[:cut])) < wanted:
            cut += 1
        printed = iter(re.sub(r"\s+", "", head[:cut]))
        number = "".join(" " if sign == " " else next(printed, "") for sign in mark.identifier)
        number = _tidy(number.strip().rstrip(".:;,"))
        rest = LEAD_PUNCTUATION.sub("", head[cut:].strip())
        if not AFTER_IDENTIFIER.match(head[cut:]) or (not rest and not re.search(r"\d", number)):
            number, rest = "", head
    if len(mark.printed) == 1:
        prose = sentence_like(rest, mark.following)
    else:
        prose = bool(len(rest) > MAX_HEADING_CHARS or SENTENCE_WORDS.search(rest) or SENTENCE_BREAK.search(rest))
    if number:
        mark.local = mark.number = number
        cut_short = len(mark.printed) == 1 and len(rest) >= WRAP_FROM_CHARS and mark.following[:1].islower()
        if rest and not prose and not cut_short:
            mark.heading = rest
        else:
            mark.opening = list(mark.printed)
        return True
    name, colon, text = head.partition(": ")
    if (colon and 3 <= len(name) <= MAX_SPLIT_HEADING_CHARS and not sentence_like(name)
            and (prose or len(text) >= PARAGRAPH_FROM_CHARS or CODED_NAME.search(name))):
        mark.heading, mark.opening = name, [text]
        return True
    if prose or rest.endswith((".", ";", ",", ":")):
        return False
    mark.heading = rest
    return len(re.findall(r"[^\W\d_]", rest)) >= 2








############################################################
# _headings
############################################################
#
# The headings among a unit's lines, as the model marks them:
# the text lines go to it numbered, an excerpt at a time,
# each call told what the excerpt is part of and the last
# headings found before it, so the levels go on as they
# began. Page marks are not shown. Answers the named marks
# in document order.
#
# Used by:
#   - _model_tree, _refine (below)
############################################################

def _headings(lines, ask, about, tick):
    positions = [position for position, line in enumerate(lines) if not line.startswith(PAGE_MARK)]
    texts = [lines[position] for position in positions]
    ranges = _windows(texts)
    found = []
    for count, (start, end) in enumerate(ranges, 1):
        before = "\n".join(f"{mark.level}  {_joined(mark.printed)[:120]}" for mark in found[-CONTEXT_HEADINGS:])
        shown = "\n".join(f"L{index}| {texts[index][:SHOWN_LINE_CHARS]}" for index in range(start, end))
        answer = ask(f"{about} Excerpt {count} of {len(ranges)}.\n\n"
                     f"Headings found before this excerpt (level, heading), the latest last:\n{before or 'none'}\n\n"
                     f"Lines:\n{shown}")
        found.extend(mark for mark in _verified(answer if isinstance(answer, list) else [], texts, positions,
                                                start, end) if _name(mark))
        tick()
    return found








############################################################
# _shape
############################################################
#
# The pattern of an identifier: letters and digits each
# folded to one sign, so the controls of one catalogue share
# a shape whatever their family and number.
#
# Used by:
#   - _settle (below)
############################################################

def _shape(identifier):
    return re.sub(r"\d+", "9", re.sub(r"[^\W\d_]+", "A", identifier))








############################################################
# _body
############################################################
#
# How much text each mark would hold: its opening lines and
# the lines up to the next mark, with the text of the marks
# under it.
#
# Used by:
#   - _settle (below)
############################################################

def _body(marks, lines):
    own = []
    for index, mark in enumerate(marks):
        end = marks[index + 1].at if index + 1 < len(marks) else len(lines)
        text = [line for line in lines[mark.to + 1:end] if not line.startswith(PAGE_MARK)]
        own.append(sum(len(line) + 1 for line in text + mark.opening))
    sizes = []
    for index, mark in enumerate(marks):
        under = index + 1
        while under < len(marks) and marks[under].level > mark.level:
            under += 1
        sizes.append(sum(own[index:under]))
    return sizes








############################################################
# _settle
############################################################
#
# The marks of one unit made consistent, in document order.
# Identifiers of one shape that mix letters and digits (the
# codes of a catalogue) take the level most of them were
# given. An identifier in brackets counts on from the
# numbered heading above it — enhancement (1) of control
# AC-2 is AC-2(1) — or from `base`, the number of the clause
# being read. Of several headings with one number, those
# with next to no text under them go when another has more:
# they were entries of a list of the real ones. The levels
# are then counted anew from 1, a heading one deeper than
# the one it sits under whatever the model called it.
#
# Used by:
#   - _model_tree, _refine (below)
############################################################

def _settle(marks, lines, base=""):
    # STEP 1: one level per shape of code
    # ===================================
    votes = {}
    for mark in marks:
        shape = _shape(mark.local)
        if "A" in shape and "9" in shape:
            votes.setdefault(shape, Counter())[mark.level] += 1
    for mark in marks:
        counts = votes.get(_shape(mark.local))
        if counts:
            mark.level = min(counts, key=lambda level: (-counts[level], level))


    # STEP 2: the full numbers, then the list entries out —
    # again while any went, as a number may have counted on
    # from one of them
    # =====================================================
    while marks:
        chain = []
        for mark in marks:
            while chain and chain[-1].level >= mark.level:
                chain.pop()
            if mark.local.startswith("("):
                above = next((upper.number for upper in reversed(chain) if upper.number), base)
                mark.number = f"{above}{mark.local}"
            chain.append(mark)
        sizes = _body(marks, lines)
        most = {}
        for mark, size in zip(marks, sizes):
            if mark.number:
                most[mark.number.casefold()] = max(size, most.get(mark.number.casefold(), 0))
        kept = [mark for mark, size in zip(marks, sizes)
                if not mark.number or size >= TINY_BODY_CHARS or size >= most[mark.number.casefold()]]
        if len(kept) == len(marks):
            break
        marks = kept


    # STEP 3: the levels counted anew — as deep as the headings
    # a mark sits under are many
    # =========================================================
    above = []
    for mark in marks:
        while above and above[-1] >= mark.level:
            above.pop()
        above.append(mark.level)
        mark.level = len(above)
    return marks








############################################################
# _path
############################################################
#
# The citation of a unit built from a mark, unlike every
# citation taken before it: its number (a top-level plain
# number by the word the rules use), or its heading when it
# has none — under its parent's citation when the heading
# alone is taken, then counted.
#
# Used by:
#   - _grow (below)
############################################################

def _path(unit, parent, language, taken):
    if unit.number:
        path = clause_path(unit.number, language) if parent is None else unit.number
    else:
        path = unit.heading if len(unit.heading) <= PATH_CHARS else unit.heading[:PATH_CHARS - 1].rstrip() + "…"
        if path.casefold() in taken and parent is not None and parent.path:
            path = f"{parent.path}, {path}"
    unique, count = path, 2
    while unique.casefold() in taken:
        unique, count = f"{path} ({count})", count + 1
    taken.add(unique.casefold())
    return unique








############################################################
# _grow
############################################################
#
# The units a unit's marks make of its lines: each mark opens
# a clause that takes the lines up to the next mark, nested
# by level. Answers the lines before the first mark and the
# top-level units; `under` is the clause the lines belong
# to, when they are not the whole document.
#
# Used by:
#   - _model_tree, _refine (below)
############################################################

def _grow(lines, marks, language, taken, under=None):
    units, chain = [], []
    for index, mark in enumerate(marks):
        end = marks[index + 1].at if index + 1 < len(marks) else len(lines)
        between = [line for line in lines[mark.at:mark.to + 1] if line.startswith(PAGE_MARK)]
        unit = ParsedUnit("clause", number=mark.number[:40], heading=mark.heading,
                          lines=mark.opening + between + lines[mark.to + 1:end])
        while chain and chain[-1][0] >= mark.level:
            chain.pop()
        parent = chain[-1][1] if chain else under
        unit.path = _path(unit, parent, language, taken)
        (chain[-1][1].children if chain else units).append(unit)
        chain.append((mark.level, unit))
    return (lines[:marks[0].at] if marks else lines), units








############################################################
# _model_tree
############################################################
#
# The tree of a whole document from the model's marks: what
# stands before the first heading is the preamble.
#
# Used by:
#   - read_standard (below)
############################################################

def _model_tree(marked, language, ask, tick):
    lines = [line for line, _ in marked]
    marks = _settle(_headings(lines, ask, "The lines of the whole document, in consecutive excerpts.", tick), lines)
    lead, units = _grow(lines, marks, language, set())
    preamble = ParsedUnit("preamble", heading=FRONT_MATTER[language], path=FRONT_MATTER[language], lines=lead)
    if text_lines(preamble):
        return [preamble] + units
    if units:
        units[0].lines[0:0] = lead
    return units








############################################################
# _informative
############################################################
#
# True for an annex that says it is informative: nothing in
# it is a requirement, so it is neither read further nor cut.
#
# Used by:
#   - _long_leaves (below)
############################################################

def _informative(unit):
    return unit.unit_type == "annex" and bool(INFORMATIVE.search("\n".join(text_lines(unit)[:3])))








############################################################
# _citable
############################################################
#
# The clauses and annexes a requirement may be cited to, in
# document order, each with the headings of the units it
# sits in — the preamble, the bibliography, a glossary or
# another top-level unit that states no requirements, and
# everything under an informative annex left out.
#
# Used by:
#   - _long_leaves, _split_long (below)
############################################################

def _citable(tree):
    found = []

    def walk(units, trail):
        for unit in units:
            if (unit.unit_type not in ("clause", "annex") or _informative(unit)
                    or (not trail and states_no_requirements(unit.unit_type, unit.number, unit.heading))):
                continue
            label = f"{unit.path} {unit.heading}".strip()
            found.append((unit, " › ".join(trail + [label])))
            walk(unit.children, trail + [label])

    walk(tree, [])
    return found








############################################################
# _long_leaves
############################################################
#
# The citable units without subclauses that are longer than
# `limit`, each with the headings it sits under.
#
# Used by:
#   - _lopsided, _refine (below)
############################################################

def _long_leaves(tree, limit):
    return [(unit, trail) for unit, trail in _citable(tree) if not unit.children and text_size(unit) > limit]








############################################################
# _lopsided
############################################################
#
# True when one clause holds most of the document (see
# MAX_LEAF_SHARE): the rules found numbers, not the
# structure.
#
# Used by:
#   - read_standard (below)
############################################################

def _lopsided(tree):
    total = sum(text_size(unit) for unit in tree) or 1
    return any(text_size(unit) > MAX_LEAF_SHARE * total for unit, _ in _long_leaves(tree, REFINE_FROM_CHARS))








############################################################
# _refine
############################################################
#
# Reads further the clauses the rules left too long: the
# model marks the headings inside each (several clauses at a
# time), and a clause where enough of them carry an
# identifier gets them as its subclauses — its text before
# the first stays its own. Answers how many clauses were
# read further.
#
# Used by:
#   - read_standard (below)
############################################################

def _refine(tree, language, ask, tick, workers):
    leaves = _long_leaves(tree, REFINE_FROM_CHARS)

    def read(leaf):
        unit, trail = leaf
        return _headings(unit.lines, ask, f"The text of one clause of the document — “{trail}” — in consecutive "
                         "excerpts. Level 1 is a heading directly under that clause.", tick)

    answers = parallel_map(read, leaves, workers=workers)
    taken = {unit.path.casefold() for unit, _, _ in iter_units(tree)}
    refined = 0
    for (unit, _), marks in zip(leaves, answers):
        marks = _settle(marks, unit.lines, unit.number)
        if sum(1 for mark in marks if mark.number) < MIN_REFINED:
            continue
        unit.lines, unit.children = _grow(unit.lines, marks, language, taken, under=unit)
        refined += 1
    return refined








############################################################
# _planned
############################################################
#
# How many calls reading the given line lists will take.
#
# Used by:
#   - read_standard (below)
############################################################

def _planned(line_lists):
    return sum(len(_windows([line for line in lines if not line.startswith(PAGE_MARK)])) for lines in line_lists)








############################################################
# _cut
############################################################
#
# Cuts a unit's own lines into subclauses, one per page the
# text stands on — or, when the text shows no pages, into
# parts of PART_CHARS. Each is a clause without a heading,
# numbered and cited by its page (or part) under the unit's
# own citation; they come before the subclauses the unit
# already has. `page` is the page the unit starts on;
# answers the page it ends on.
#
# Used by:
#   - _split_long, read_standard (below)
############################################################

def _cut(unit, page, language):
    pieces = [[page, []]]
    for line in unit.lines:
        if line.startswith(PAGE_MARK):
            page = int(line[len(PAGE_MARK):])
            pieces.append([page, []])
        else:
            pieces[-1][1].append(line)
    pieces = [piece for piece in pieces if piece[1]]
    paged = len(pieces) > 1
    if paged and not pieces[0][0]:
        pieces[0][0] = max(1, pieces[1][0] - 1)
    if not paged:
        pieces, part = [], []
        for line in text_lines(unit):
            if part and sum(len(text) + 1 for text in part) + len(line) > PART_CHARS:
                pieces.append([len(pieces) + 1, part])
                part = []
            part.append(line)
        if part:
            pieces.append([len(pieces) + 1, part])
    children = []
    for ordinal, lines in pieces:
        code = f"p{ordinal}" if paged else f"part{ordinal}"
        if not unit.path:
            path = (PAGE_PATH if paged else PART_PATH)[language].format(page=ordinal, part=ordinal)
        else:
            path = f"{unit.path}, " + (PAGE_PATH if paged else PART_INSIDE)[language].format(page=ordinal, part=ordinal)
        children.append(ParsedUnit("clause", number=(f"{unit.number}/{code}" if unit.number else code)[:40],
                                   lines=lines, path=path))
    unit.lines, unit.children = [], children + unit.children
    return page








############################################################
# _split_long
############################################################
#
# Cuts by pages the own text of every citable unit where it
# is still longer than SPLIT_FROM_CHARS — a clause without
# subclauses, or the text a clause holds before them —
# keeping count of the page the text has reached: the page
# marks lie among the units' lines in document order.
#
# Used by:
#   - read_standard (below)
############################################################

def _split_long(tree, language):
    long = {id(unit) for unit, _ in _citable(tree)
            if sum(len(line) + 1 for line in text_lines(unit)) > SPLIT_FROM_CHARS}
    page = 0
    for unit, _, _ in list(iter_units(tree)):
        if id(unit) in long:
            page = _cut(unit, page, language)
            continue
        for line in unit.lines:
            if line.startswith(PAGE_MARK):
                page = int(line[len(PAGE_MARK):])








############################################################
# read_standard
############################################################
#
# The tree of a standard's extracted text, the way it was
# read (RULES, REFINED, MODEL or PAGES — recorded as the
# version's parser) and notes for the admin on what did not
# go as asked. `method` is one of METHODS: "rules" and
# "pages" never ask the model, "ai" asks it even when the
# rules read the document. `ask` takes the text of one
# request and answers the list of headings the model marked,
# or raises OutlineUnavailable; without it the model is not
# used. `progress`, when given, is called with the calls
# done and planned.
#
# Used by:
#   - corpus/ingest.py — the extract step of a standard
############################################################

def read_standard(text, language="lt", method="auto", ask=None, progress=None, workers=4):
    language = language if language in FRONT_MATTER else "lt"
    marked = body_lines(text)
    notes, tree, used = [], None, None
    model = ask is not None and method in ("auto", "ai")
    if model and sum(len(line) for line, _ in marked) > MAX_AI_CHARS:
        model = False
        notes.append(f"The document is longer than {MAX_AI_CHARS} characters: the model was not asked to read "
                     "its structure.")
    done = itertools.count(1)
    planned = [0]

    def tick():
        if progress is not None:
            progress(next(done), planned[0])


    # STEP 1: the rules
    # =================
    rules = parse_marked(marked, language) if method != "pages" else None
    readable = rules is not None and structure_ok(rules)


    # STEP 2: the model reads the whole text — when the rules
    # found no structure, or the admin asked for it
    # =======================================================
    if model and (method == "ai" or not readable or _lopsided(rules)):
        planned[0] = _planned([[line for line, _ in marked]])
        try:
            candidate = _model_tree(marked, language, ask, tick)
            if structure_ok(candidate):
                tree, used = candidate, MODEL
            else:
                notes.append("The model found no headings to build a structure from.")
        except OutlineUnavailable as exc:
            model = False
            notes.append(f"The model could not be asked to read the structure: {exc}")


    # STEP 3: the rules' tree, its long clauses read further
    # by the model
    # ======================================================
    if tree is None and readable:
        tree, used = rules, RULES
        if model and method == "auto":
            planned[0] = _planned([unit.lines for unit, _ in _long_leaves(tree, REFINE_FROM_CHARS)])
            done = itertools.count(1)
            try:
                if _refine(tree, language, ask, tick, workers):
                    used = REFINED
            except OutlineUnavailable as exc:
                notes.append(f"The model could not be asked to read the long clauses: {exc}")


    # STEP 4: the pages, when nothing read the structure —
    # and for every unit still too long to cite
    # ====================================================
    if tree is None:
        whole = ParsedUnit("clause", lines=[line for line, _ in marked])
        _cut(whole, 0, language)
        tree, used = whole.children, PAGES
        if method != "pages":
            notes.append("No clause structure was found: the document is indexed by its pages.")
    else:
        _split_long(tree, language)
    return strip_marks(tree), used, notes
