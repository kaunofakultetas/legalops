############################################################
#  [*] companies.outline — the headings of a policy text
#
#    build_outline(text) → [{title, level, offset}]
#    heading_at(outline, offset) → "7.2 Atitikties pareigūnas"
#
#  Company documents are policies and procedures: numbered
#  sections ("7.2. Atitikties pareigūnas"), markdown headings,
#  Roman-numbered chapters ("II. BENDROSIOS NUOSTATOS") and
#  all-caps titles. The outline lets a reader (the assistant's
#  readDocument, the GUI) jump to a section, and gives every
#  evidence chunk the section a citation names ("F10 §9.1").
#  Heuristic on purpose — a missed heading costs nothing, a
#  false one only adds an entry.
############################################################


import re


MAX_ENTRIES = 400
MAX_HEADING_CHARS = 140

MARKDOWN = re.compile(r"^(#{1,6})\s+(.+?)\s*#*$")
NUMBERED = re.compile(r"^((?:\d{1,3}\.){0,3}\d{1,3})\.?\s+(\S.*)$")
ROMAN = re.compile(r"^([IVXLC]{1,6})\.\s+(\S.*)$")
SECTION_SIGN = re.compile(r"^(§\s*\d+(?:\.\d+)*)\.?\s*(.*)$")
UPPER_LETTERS = re.compile(r"[A-ZĄČĘĖĮŠŲŪŽ]")
LOWER_LETTERS = re.compile(r"[a-ząčęėįšųūž]")








############################################################
# _classify
############################################################
#
# (level, title) when the stripped line reads as a heading,
# else None. Numbered lines must look like titles, not like
# list items: short, no final period, starting upper-case.
#
# Used by:
#   - build_outline (below)
############################################################

def _classify(line):
    if not line or len(line) > MAX_HEADING_CHARS:
        return None
    match = MARKDOWN.match(line)
    if match:
        return len(match.group(1)), match.group(2).strip()
    match = SECTION_SIGN.match(line)
    if match and len(line) <= 100:
        return 2, line
    match = ROMAN.match(line)
    if match and not line.endswith((".", ";", ",")):
        return 1, line
    match = NUMBERED.match(line)
    if match:
        number, rest = match.groups()
        if rest[:1].isupper() and not rest.endswith((".", ";", ",", ":")) and len(rest.split()) <= 14:
            return number.count(".") + 1, f"{number} {rest}"
        return None
    letters = UPPER_LETTERS.findall(line)
    if len(letters) >= 4 and not LOWER_LETTERS.search(line) and len(line.split()) <= 12:
        return 1, line
    return None








############################################################
# build_outline
############################################################
#
# One entry per heading line, in text order, with the char
# offset of the line start; at most MAX_ENTRIES.
#
# Used by:
#   - companies/api/document_views.py — upload and detail
#   - companies/indexing.py — chunk headings
############################################################

def build_outline(text):
    outline, offset = [], 0
    for raw in (text or "").splitlines(keepends=True):
        found = _classify(raw.strip().strip("*").strip())
        if found:
            level, title = found
            outline.append({"title": title, "level": level, "offset": offset})
            if len(outline) >= MAX_ENTRIES:
                break
        offset += len(raw)
    return outline








############################################################
# heading_at
############################################################
#
# The last heading at or before `offset` (a chunk start plus
# a little slack — a window often begins just above its
# heading), or "".
#
# Used by:
#   - companies/indexing.py
############################################################

def heading_at(outline, offset, slack=120):
    current = ""
    for entry in outline:
        if entry["offset"] > offset + slack:
            break
        current = entry["title"]
    return current
