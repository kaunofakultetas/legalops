############################################################
#  [*] etar_html — e-tar.lt consolidated HTML → unit tree
#
#  Turns the HTML of a TAR consolidated edition
#    https://www.e-tar.lt/rs/actualedition/{docId}/{editionId}/
#  (or an original act, /rs/legalact/{docId}/) into a JSON
#  tree of units {type, number, heading, text, children}
#  with eId and a Lithuanian citation ("12 str. 3 d. 2 p.").
#
#  The HTML is Word "filtered" HTML (every paragraph is a
#  p.MsoNormal) BUT every structural part is wrapped in a
#  nested <div id="part_<32 hex>"> — the nesting IS the
#  tree; the unit type comes from the first line of the
#  part:
#    "I SKYRIUS"            chapter   "PIRMASIS SKIRSNIS" section
#    "5 straipsnis. Antr."  article   "1. …"  paragraph (in an
#    article) or point (elsewhere)    "5.1. …" subpoint
#    "1) …"  point           "a) …"  subpoint
#    "… priedas"             annex     "PATVIRTINTA …" the
#                                      approved document of a
#                                      resolution / order
#  TAR notes ("Straipsnio pakeitimai:" + "Nr. XV-303, …")
#  become unit.amendments, "Neteko galios nuo …" sets
#  unit.repealed, the "Pakeitimai:" list at the end becomes
#  document.amendment_history, Word footnotes (div#ftn1,
#  after the last part) become document.footnotes. Hidden
#  spans (display:none "part_…_end") are dropped;
#  21<sup>1</sup> is read as "21-1".
#
#  Standard library only (html.parser).
#
#    parse_bytes(html_bytes) → the document unit (a dict tree)
############################################################


import re
from html.parser import HTMLParser








# elements html.parser never closes
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

# ordinal words of section ("PIRMASIS SKIRSNIS") and part ("PIRMOJI DALIS") headings
ORD_M = ["PIRMASIS", "ANTRASIS", "TREČIASIS", "KETVIRTASIS", "PENKTASIS", "ŠEŠTASIS", "SEPTINTASIS",
         "AŠTUNTASIS", "DEVINTASIS", "DEŠIMTASIS", "VIENUOLIKTASIS", "DVYLIKTASIS", "TRYLIKTASIS",
         "KETURIOLIKTASIS", "PENKIOLIKTASIS", "ŠEŠIOLIKTASIS", "SEPTYNIOLIKTASIS", "AŠTUONIOLIKTASIS",
         "DEVYNIOLIKTASIS", "DVIDEŠIMTASIS"]
ORD_F = ["PIRMOJI", "ANTROJI", "TREČIOJI", "KETVIRTOJI", "PENKTOJI", "ŠEŠTOJI", "SEPTINTOJI", "AŠTUNTOJI",
         "DEVINTOJI", "DEŠIMTOJI"]

# division headings; inserted ones carry a superscript index
# ("SEPTINTASIS<sup>1</sup> SKIRSNIS" → "SEPTINTASIS-1"), some
# put the title on the same line, some are lower case
CHAPTER = re.compile(r"^([IVXLCDM]+)(?:-(\d+))?\s+SKYRIUS\b\s*(.*)$")
SECTION = re.compile(r"^(" + "|".join(ORD_M) + r")(?:-(\d+))?\s+SKIRSNIS\b\s*(.*)$", re.I)
PART = re.compile(r"^(" + "|".join(ORD_F) + r")(?:-(\d+))?\s+DALIS\b\s*(.*)$", re.I)
# "5 straipsnis. Heading", "21-1 straipsnis.", old "18(1) straipsnis."
ARTICLE = re.compile(r"^(\d+(?:-\d+|\(\d+\))?)\s+straipsnis\.?\s*(.*)$")
SUBPOINT_NUM = re.compile(r"^(\d+(?:\s?\.\s?\d+)+)\s?\.\s+(.*)$", re.S)
NUMBERED = re.compile(r"^(\d+(?:-\d+)?)\s?\.\s+(.*)$", re.S)
POINT = re.compile(r"^(\d+(?:-\d+)?)\s?\)\s+(.*)$", re.S)
LETTER = re.compile(r"^([a-ząčęėįšųūž])\s?\)\s+(.*)$", re.S)
ANNEX = re.compile(r"(?:^|\s)(?:(\d+)\s+)?priedas$", re.I)
REPEALED = re.compile(r"^Neteko galios nuo (\d{4}-\d{2}-\d{2})\.?$")
NOTE_HEAD = re.compile(r"^(?:[A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+(?:\s+[a-ząčęėįšųūž]+){0,3}\s+(?:pakeitimai|pakeitimas|naikinimas)"
                       r"|Papildyta\s+[^:]{1,60}|Pakeistas\s+[^:]{1,60}|Įstatymas papildytas\s+[^:]{1,80}"
                       r"|Nauja (?:įstatymo |nutarimo |įsakymo |taisyklių |aprašo )?redakcija nuo \d{4}-\d{2}-\d{2})\s*:$")
# note keywords for italic 10pt "…:" lines NOTE_HEAD does not know
NOTE_WORDS = re.compile(r"pakeitim|naikinim|papildyt|pakeist|redakcij|pripažint|neteko galios", re.I)
# "Nr. XV-303, 2025-06-19, paskelbta TAR …, i. k. …" (old: "2001 03 13")
NOTE_REF = re.compile(r"^Nr\.\s*([^,]+),\s*(\d{4}[-\s]\d{2}[-\s]\d{2}),\s*(.*?)(?:,\s*i\.\s*k\.\s*(\S+))?$")
SIGNATURE = re.compile(r"^(Skelbiu šį|Respublikos Prezident|RESPUBLIKOS PREZIDENT|Valdybos pirmininkas|Direktor|Ministr|"
                       r"Seimo Pirminink|Finansų ministr)", re.I)








############################################################
# Node
############################################################
#
# Minimal DOM node: tag, attrs, children (Node or str).
#
# Used by:
#   - TreeBuilder, every walker below
############################################################

class Node:
    __slots__ = ("tag", "attrs", "children")






    ############################################################
    # Node.__init__
    ############################################################
    #
    # Plain constructor; attrs is the dict html.parser gives.
    #
    # Used by:
    #   - TreeBuilder.handle_starttag / handle_startendtag
    ############################################################

    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = attrs
        self.children = []








############################################################
# TreeBuilder
############################################################
#
# html.parser → Node tree. Word HTML closes its tags, so a
# stack with "pop to the matching start tag" is enough;
# unmatched end tags are ignored and an open <p> is closed
# by the next <p>.
#
# Used by:
#   - parse_bytes
############################################################

class TreeBuilder(HTMLParser):






    ############################################################
    # TreeBuilder.__init__
    ############################################################
    #
    # Starts with a synthetic root on the stack.
    #
    # Used by:
    #   - parse_bytes
    ############################################################

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {})
        self.stack = [self.root]






    ############################################################
    # TreeBuilder.handle_starttag
    ############################################################
    #
    # Opens a node (void elements are leaves).
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_starttag(self, tag, attrs):
        if tag == "p" and self.stack[-1].tag == "p":
            self.stack.pop()
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)






    ############################################################
    # TreeBuilder.handle_startendtag
    ############################################################
    #
    # <br/> style tags: always a leaf.
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, dict(attrs)))






    ############################################################
    # TreeBuilder.handle_endtag
    ############################################################
    #
    # Pops back to the matching open tag, if there is one.
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return






    ############################################################
    # TreeBuilder.handle_data
    ############################################################
    #
    # Text nodes are plain strings among the children.
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_data(self, data):
        self.stack[-1].children.append(data)








############################################################
# hidden
############################################################
#
# display:none elements — e-tar hides "part_<id>_end"
# markers this way.
#
# Used by:
#   - line_of, collect
############################################################

def hidden(node):
    return "display:none" in (node.attrs.get("style") or "").replace(" ", "").lower()








############################################################
# line_of
############################################################
#
# One <p> → {text, italic, small, center, bold}. A <sup>
# right after a digit or an upper-case word is an inserted
# unit index ("21<sup>1</sup> straipsnis" → "21-1
# straipsnis", "SEPTINTASIS<sup>1</sup> SKIRSNIS" →
# "SEPTINTASIS-1 SKIRSNIS"); other superscripts are kept
# inline. NBSP → space; letter-spaced words
# ("Į S T A T Y M A S") are closed up.
#
# Used by:
#   - collect
############################################################

def line_of(p):
    parts, flags = [], {"italic": False, "bold": False}
    style = (p.attrs.get("style") or "").replace(" ", "").lower()
    align = (p.attrs.get("align") or "").lower()

    def rec(node, italic, bold, small):
        for c in node.children:
            if isinstance(c, str):
                if c.strip():
                    flags["italic"] = flags["italic"] or italic
                    flags["bold"] = flags["bold"] or bold
                    flags.setdefault("small", small)
                parts.append(c)
                continue
            if hidden(c) or c.tag in ("script", "style"):
                continue
            if c.tag == "br":
                parts.append(" ")
                continue
            if c.tag == "sup":
                sup = "".join(x for x in c.children if isinstance(x, str)).strip()
                prev = "".join(parts).rstrip()
                # digit or upper-case word before it: an inserted
                # unit index; "m<sup>2</sup>" stays "m2"
                if sup.isdigit() and (prev[-1:].isdigit() or prev[-1:].isupper()):
                    parts.append("-" + sup)
                    continue
            cstyle = (c.attrs.get("style") or "").replace(" ", "").lower()
            rec(c, italic or c.tag == "i", bold or c.tag == "b",
                small or "font-size:10.0pt" in cstyle or "font-size:10pt" in cstyle)

    rec(p, False, False, False)
    text = re.sub(r"\s+", " ", "".join(parts).replace("\u00a0", " ").replace("\u00ad", "")).strip()
    text = re.sub(r"\b(?:[A-ZĄČĘĖĮŠŲŪŽ] ){3,}[A-ZĄČĘĖĮŠŲŪŽ]\b", lambda m: m.group(0).replace(" ", ""), text)
    return {"text": text, "italic": flags["italic"], "bold": flags["bold"], "small": flags.get("small", False),
            "center": align == "center" or "text-align:center" in style}








############################################################
# table_lines
############################################################
#
# A Word table → one "cell | cell" line per row.
#
# Used by:
#   - collect
############################################################

def table_lines(table):
    rows = []

    def find_rows(node):
        for c in node.children:
            if isinstance(c, Node):
                if c.tag == "tr":
                    rows.append(c)
                elif c.tag != "table":
                    find_rows(c)

    find_rows(table)
    out = []
    for tr in rows:
        cells = []
        for td in tr.children:
            if isinstance(td, Node) and td.tag in ("td", "th"):
                ps = []
                collect(td, ps)
                cell = " ".join(i[1]["text"] for i in ps if i[0] == "line" and i[1]["text"])
                if cell:
                    cells.append(cell)
        if cells:
            out.append({"text": " | ".join(cells), "italic": False, "bold": False, "small": False, "center": False})
    return out








############################################################
# is_part
############################################################
#
# The structural wrapper: <div id="part_<32 hex>">.
#
# Used by:
#   - collect, parse_bytes
############################################################

def is_part(node):
    return isinstance(node, Node) and node.tag == "div" and (node.attrs.get("id") or "").startswith("part_")








############################################################
# collect
############################################################
#
# Flattens a part's OWN content in document order into
# ("line", line) / ("part", node) items, without descending
# into child parts.
#
# Used by:
#   - build_unit, table_lines, parse_bytes
############################################################

def collect(node, out):
    for c in node.children:
        if not isinstance(c, Node) or hidden(c):
            continue
        if is_part(c):
            out.append(("part", c))
        elif c.tag == "p":
            ln = line_of(c)
            if ln["text"]:
                out.append(("line", ln))
        elif c.tag == "table":
            out.extend(("line", ln) for ln in table_lines(c))
        else:
            collect(c, out)
    return out








############################################################
# classify
############################################################
#
# Reads the opening lines of a part and returns
# (type, number, heading, lines consumed). parent_type
# decides "1. …": a paragraph (dalis) inside an article, a
# point (punktas) anywhere else.
#
# Used by:
#   - build_unit
############################################################

def classify(lines, parent_type):
    first = lines[0]["text"] if lines else ""
    second = lines[1]["text"] if len(lines) > 1 else None


    # STEP 1: divisions — heading on the next line
    # ============================================
    for regex, kind in ((CHAPTER, "chapter"), (SECTION, "section"), (PART, "part")):
        m = regex.match(first)
        if m:
            number = m.group(1)
            if kind == "section":
                number = str(ORD_M.index(number.upper()) + 1)
            elif kind == "part":
                number = str(ORD_F.index(number.upper()) + 1)
            if m.group(2):
                number += "-" + m.group(2)
            if m.group(3):
                return kind, number, m.group(3), 1
            return kind, number, second, 2 if second is not None else 1


    m = re.match(r"^(\d+(?:-\d+)?)\s+(skirsnis|skyrius)\.?\s*(.*)$", first)
    if m:
        # old numbering "13 skirsnis. Neteko galios nuo 2015-12-03"
        return ("section" if m.group(2) == "skirsnis" else "chapter"), m.group(1), m.group(3) or None, 1


    # STEP 2: article, numbered paragraph / point / subpoint
    # ======================================================
    m = ARTICLE.match(first)
    if m:
        return "article", m.group(1).replace("(", "-").rstrip(")"), m.group(2).strip() or None, 1
    m = SUBPOINT_NUM.match(first)
    if m:
        return "subpoint", re.sub(r"\s", "", m.group(1)), None, 0
    m = NUMBERED.match(first)
    if m:
        return ("paragraph" if parent_type == "article" else "point"), m.group(1), None, 0
    m = POINT.match(first)
    if m:
        return "point", m.group(1), None, 0
    m = LETTER.match(first)
    if m:
        return "subpoint", m.group(1), None, 0


    # STEP 3: annexes, approved documents, signatures
    # ===============================================
    for i, ln in enumerate(lines[:5]):
        am = ANNEX.search(ln["text"])
        if am and len(ln["text"]) < 120:
            heading = lines[i + 1]["text"] if i + 1 < len(lines) and lines[i + 1]["text"].isupper() else None
            return "annex", am.group(1), heading, i + 1 + (1 if heading else 0)
    if first.upper().startswith("PATVIRTINTA"):
        consumed = 1
        while consumed < len(lines) and not lines[consumed]["text"].isupper():
            consumed += 1
        heading = lines[consumed]["text"] if consumed < len(lines) else None
        return "approved_document", None, heading, consumed + (1 if heading else 0)
    if SIGNATURE.match(first):
        return "signature", None, None, 0
    if parent_type == "article":
        # unnumbered lead-in ("Mokėjimo paslaugas sudaro:") with
        # its "1) … 2) …" points: the article's only paragraph
        return "paragraph", None, None, 0
    return "block", None, None, 0








############################################################
# strip_number
############################################################
#
# Removes the "1. " / "1) " / "a) " / "5.1. " prefix from
# the first text line of a numbered unit.
#
# Used by:
#   - build_unit
############################################################

def strip_number(text, kind):
    for regex in (SUBPOINT_NUM, NUMBERED, POINT, LETTER):
        m = regex.match(text)
        if m:
            return m.group(2).strip()
    return text








############################################################
# note_entry
############################################################
#
# "Nr. XV-303, 2025-06-19, paskelbta TAR 2025-06-30, i. k.
# 2025-11972" → {act, date, published, ik}.
#
# Used by:
#   - build_unit, parse_history
############################################################

def note_entry(text):
    m = NOTE_REF.match(text)
    if not m:
        return None
    return {"act": m.group(1).strip(), "date": m.group(2), "published": m.group(3).strip(), "ik": m.group(4)}








############################################################
# new_unit
############################################################
#
# Same record as eu_xhtml.new_unit so both sources feed
# one LegalUnit loader.
#
# Used by:
#   - build_unit, parse_bytes
############################################################

def new_unit(kind, number=None, heading=None, text=""):
    return {"type": kind, "number": number, "heading": heading, "text": text, "children": []}








############################################################
# add_text
############################################################
#
# Text before the first child goes into unit.text; text
# after children becomes an unnumbered "text" child so the
# order survives (e.g. the sentence after a list).
#
# Used by:
#   - build_unit
############################################################

def add_text(unit, text):
    if not text:
        return
    if unit["children"]:
        unit["children"].append(new_unit("text", text=text))
    else:
        unit["text"] = unit["text"] + "\n" + text if unit["text"] else text








############################################################
# build_unit
############################################################
#
# One part div → one unit (recursively). Amendment notes
# are recognised by their header line and swallow the
# "Nr. …" lines that follow; "Neteko galios nuo …" marks
# the unit repealed; a "Pakeitimai:" line starts the
# edition's amendment list, parked in unit["_history"] for
# parse_bytes. An approved document keeps its
# "PATVIRTINTA … nutarimu Nr. …" block in unit["approval"].
#
# Used by:
#   - build_unit (recursion), parse_bytes
############################################################

def build_unit(part, parent_type):
    items = collect(part, [])
    lead = []
    for kind, value in items:
        if kind != "line":
            break
        lead.append(value)


    # STEP 1: type, number and heading from the opening lines
    # =======================================================
    kind, number, heading, consumed = classify(lead, parent_type)
    unit = new_unit(kind, number, heading)
    if kind == "approved_document":
        # "PATVIRTINTA / Lietuvos banko valdybos / 2018 m. … nutarimu Nr. 03-126 / (… redakcija)"
        unit["approval"] = " ".join(ln["text"] for ln in lead[:consumed - 1])
    if heading and REPEALED.match(heading):
        unit["repealed"] = REPEALED.match(heading).group(1)
        unit["heading"] = None
    rest = items[consumed:]


    # STEP 2: remaining lines, notes and child parts in order
    # =======================================================
    note = None
    first_text = True
    history = None
    for kind_, value in rest:
        if history is not None:
            if kind_ == "line":
                history.append(value["text"])
            continue
        if kind_ == "line" and value["text"] == "Pakeitimai:":
            # the edition's amendment list closes the LAST part
            history = unit.setdefault("_history", [])
            continue
        if kind_ == "part":
            note = None
            child = build_unit(value, unit["type"])
            if not child["children"] and not child["text"] and not child["heading"] and not child.get("repealed"):
                continue
            if child["type"] == "block" and not child["children"] and child["text"]:
                add_text(unit, child["text"])
            else:
                unit["children"].append(child)
            continue
        text = value["text"]
        if NOTE_HEAD.match(text) or (value["italic"] and value["small"] and text.endswith(":")
                                     and len(text) < 120 and NOTE_WORDS.search(text)):
            note = {"note": text.rstrip(":").strip(), "refs": []}
            unit.setdefault("amendments", []).append(note)
            continue
        ref = note_entry(text)
        if note is not None and ref:
            note["refs"].append(ref)
            continue
        if ref and value["italic"] and value["small"]:
            # TAR sometimes prints a reference ABOVE its header line
            note = {"note": None, "refs": [ref]}
            unit.setdefault("amendments", []).append(note)
            continue
        if text.startswith("TAR pastaba"):
            unit.setdefault("tar_notes", []).append(text)
            continue
        if note is not None and value["italic"] and value["small"]:
            note["refs"].append({"text": text})
            continue
        note = None
        if first_text and unit["type"] in ("paragraph", "point", "subpoint"):
            text = strip_number(text, unit["type"])
            first_text = False
        rep = REPEALED.match(text)
        if rep:
            unit["repealed"] = rep.group(1)
            continue
        if re.match(r"^[_\-–—\s]{5,}$", text):
            # "_________________" closes laws and annexes
            continue
        add_text(unit, text)
    return unit








############################################################
# parse_history
############################################################
#
# The trailing "Pakeitimai:" list of a consolidated
# edition: "1." / "Lietuvos Respublikos Seimas, Įstatymas" /
# "Nr. …" / title → [{no, issuer, act, date, published, ik,
# title}].
#
# Used by:
#   - parse_bytes
############################################################

def parse_history(texts):
    out, cur = [], None
    for t in texts:
        if re.match(r"^\d+\.$", t):
            cur = {"no": int(t[:-1])}
            out.append(cur)
        elif cur is not None:
            ref = note_entry(t)
            if ref:
                cur.update(ref)
            elif "issuer" not in cur:
                cur["issuer"] = t
            else:
                cur["title"] = (cur.get("title", "") + " " + t).strip()
    return out








############################################################
# assign_ids
############################################################
#
# eId (art_5__para_2__point_14) and the Lithuanian citation:
#   article → "5 str.", paragraph → "5 str. 2 d.",
#   point → "5 str. 2 d. 14 p.", subpoint → "… a pap.";
#   regulation-style points → "5 p.", "5.1 pap." (not
#   "5 p. 5.1 pap."); annexes prefix "1 priedas".
#
# Used by:
#   - parse_bytes
############################################################

def assign_ids(unit, prefix, cite):
    tokens = {"chapter": "chp", "section": "sec", "part": "part", "article": "art", "paragraph": "para",
              "point": "point", "subpoint": "subpoint", "annex": "annex", "approved_document": "doc",
              "signature": "sig", "block": "blk", "text": "txt", "act": "act"}
    counters = {}
    for child in unit["children"]:
        kind = child["type"]
        counters[kind] = counters.get(kind, 0) + 1
        number = child["number"] or str(counters[kind])
        token = tokens.get(kind, kind) + "_" + re.sub(r"[^0-9A-Za-z_]", "", number.replace(".", "_").replace("-", "_"))
        eid = prefix + "__" + token if prefix else token
        child_cite = cite
        if kind == "article":
            child_cite = f"{number} str."
        elif kind == "annex":
            child_cite = f"{number} priedas" if child["number"] else "priedas"
        elif kind == "paragraph" and child["number"]:
            child_cite = f"{cite} {number} d.".strip()
        elif kind == "point":
            child_cite = f"{cite} {number} p.".strip()
        elif kind == "subpoint" and "." in number and cite.endswith(" p."):
            # "5.1" already names its point: "5 p." → "5.1 pap."
            child_cite = re.sub(r"\S+ p\.$", f"{number} pap.", cite)
        elif kind == "subpoint":
            child_cite = f"{cite} {number} pap.".strip()
        child["eId"] = eid
        child["cite"] = child_cite
        assign_ids(child, eid, child_cite)








############################################################
# count
############################################################
#
# Unit type histogram for the output summary and tests.
#
# Used by:
#   - parse_bytes
############################################################

def count(unit, acc=None):
    acc = {} if acc is None else acc
    for c in unit["children"]:
        acc[c["type"]] = acc.get(c["type"], 0) + 1
        count(c, acc)
    return acc








############################################################
# read_header
############################################################
#
# The TAR header of an edition: "Suvestinė redakcija nuo
# …", "Įstatymas paskelbtas: …", "TAR pastaba. …", the
# upper-case title lines, "2009 m. gruodžio 10 d. Nr.
# XI-549", "Vilnius". Fills doc metadata and returns the
# lines that are none of these (kept as the act's text).
#
# Used by:
#   - parse_bytes
############################################################

def read_header(lines, doc):
    title, keep, notes = [], [], []
    for t in lines:
        m = re.match(r"^Suvestinė redakcija nuo (\d{4}-\d{2}-\d{2})", t)
        if m:
            doc["consolidated_from"] = m.group(1)
        elif re.match(r"^(Įstatymas|Nutarimas|Įsakymas|Sprendimas|Kodeksas|Aktas) paskelbtas:", t):
            doc["published"] = t.split(":", 1)[1].strip()
        elif t.startswith("TAR pastaba"):
            notes.append(t)
        elif t.isupper() and "date_number" not in doc:
            title.append(t)
        elif re.search(r"\d{4} m\. \w+ \d{1,2} d\. (?:nutarimas |įsakymas )?Nr\.", t) and "date_number" not in doc:
            doc["date_number"] = t
        elif t in ("Vilnius", "Kaunas") and not keep:
            continue
        else:
            keep.append(t)
    doc["tar_notes"] = notes
    doc["title"] = " ".join(title) or None
    return keep








############################################################
# parse_bytes
############################################################
#
# Entry point: HTML path → document unit. The outermost part
# divs are the act itself, the approved document (for
# resolutions / orders) and the annexes. The TAR header
# ("Suvestinė redakcija nuo …", "Įstatymas paskelbtas: …",
# "Nauja redakcija nuo …", the centred title) sits inside
# the act's root part — or, for small acts whose articles
# are top-level parts, before the first part; either way it
# goes to document metadata. Lines after "Pakeitimai:" are
# the amendment history; div#ftnN blocks are footnotes.
#
# Used by:
#   - main (CLI) — and corpus/ingest.py (through the sandbox)
############################################################

def parse_bytes(data):
    builder = TreeBuilder()
    builder.feed(data.decode("utf-8", "replace"))
    doc = new_unit("document")
    doc.update({"source": "e-tar-html", "language": "lt", "title": None, "consolidated_from": None,
                "published": None, "new_wording": None, "amendment_history": [], "footnotes": []})


    # STEP 1: outermost part divs (and stray lines between them)
    # ==========================================================
    top = []

    def outer(node):
        for c in node.children:
            if isinstance(c, Node):
                if c.tag == "div" and (c.attrs.get("id") or "").startswith("ftn"):
                    # Word footnotes (<div id="ftn1">), referenced as "[1]" in the text
                    doc["footnotes"].append(" ".join(v["text"] for k, v in collect(c, []) if k == "line"))
                elif is_part(c):
                    top.append(("part", c))
                elif c.tag == "p":
                    ln = line_of(c)
                    if ln["text"]:
                        top.append(("line", ln))
                elif not hidden(c):
                    outer(c)

    outer(builder.root)


    # STEP 2: header lines, top-level parts, trailing history
    # =======================================================
    header, parts, history, in_history = [], [], [], False
    for kind, value in top:
        if kind == "line":
            if value["text"] == "Pakeitimai:":
                in_history = True
            elif in_history:
                history.append(value["text"])
            elif not parts:
                header.append(value["text"])
            continue
        unit = build_unit(value, "document")
        history.extend(unit.pop("_history", []))
        if unit["children"] or unit["text"] or unit["heading"]:
            parts.append(unit)


    # STEP 3: the act — its own root part, or (small acts whose
    # articles are top-level parts) a synthetic one
    # =========================================================
    if parts and parts[0]["type"] == "block":
        act = parts.pop(0)
        header += act["text"].split("\n") if act["text"] else []
    else:
        act = new_unit("block")
        while parts and parts[0]["type"] not in ("annex", "approved_document"):
            act["children"].append(parts.pop(0))
    act["type"] = "act"
    act["text"] = "\n".join(read_header(header, doc))
    for note in act.pop("amendments", []):
        if (note["note"] or "").startswith("Nauja"):
            doc["new_wording"] = note
    doc["children"] = [act] + parts


    # STEP 4: amendment history, ids, citations, summary
    # ==================================================
    doc["amendment_history"] = parse_history(history)
    assign_ids(doc, "", "")
    doc["stats"] = count(doc)
    return doc
