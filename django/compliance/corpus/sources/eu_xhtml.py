############################################################
#  [*] eu_xhtml — CELLAR XHTML → legal unit tree 
#
#  Turns the XHTML manifestation of an EU act, fetched from
#  the Publications Office CELLAR by content negotiation,
#  into a JSON tree of units {type, number, heading, text,
#  children} with an Akoma-Ntoso-like eId and a citation
#  string on every unit (e.g. "59 str. 1 d. a p." for the
#  Lithuanian text, "Art. 59(1)(a)" for the English one).
#
#  Three XHTML flavours are recognised:
#    oj        — Official Journal text (CONVEX + ELI markup):
#                div.eli-subdivision#art_N, div#NNN.NNN
#                paragraphs, 2-column tables for points,
#                p.oj-* classes, footnotes p.oj-note
#    cons      — consolidated text with ELI divs (CONVEX 9 /
#                fmx2xhtml 9): div.norm > span.no-parag
#                paragraphs, div.grid-list points,
#                p.title-* classes, ►M1 … ◄ / ▼M1 markers
#    cons_flat — old consolidated text (fmx2xhtml 7.x) with
#                no ELI divs: best-effort linear parse of
#                p.title-article-norm / p.norm
#
#  Standard library only — CELLAR XHTML is well-formed XML,
#  so xml.etree is enough (no lxml / bs4 needed).
#
#    parse_bytes(xhtml_bytes) → the document unit (a dict tree)
############################################################


import re
import xml.etree.ElementTree as ET








# ELI subdivision id prefix (last dotted segment) → unit type
DIV_TYPES = {"tis": "title", "prt": "part", "cpt": "chapter", "sct": "section",
             "sbs": "subsection", "art": "article", "anx": "annex"}

# unit type → eId token (Akoma Ntoso naming)
EID = {"title": "title", "part": "part", "chapter": "chp", "section": "sec",
       "subsection": "subsec", "article": "art", "paragraph": "para",
       "point": "point", "indent": "indent", "annex": "annex",
       "recital": "rec", "citation": "cit", "group": "grp", "text": "txt",
       "preamble": "preamble", "final": "final", "division": "div"}

# elements that start a new block (anything else is inline text)
BLOCK = {"p", "div", "table", "tbody", "thead", "tr", "td", "th", "ul", "ol",
         "li", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "col", "colgroup"}

# point labels as they appear in the label cell: a) (a) i) (iv) 1) (1) 1. —
LABEL = re.compile(r"^(?:\((?P<a>[0-9]{1,3}[a-z]?|[a-z]{1,6})\)|(?P<b>[0-9]{1,3}[a-z]?|[a-z]{1,6})\)"
                   r"|(?P<c>[0-9]{1,3}[a-z]?)\.|(?P<d>[—–\-•]))$")

# the same labels glued to the start of a text line (flat consolidated text)
INLINE_LABEL = re.compile(r"^(\([0-9]{1,3}[a-z]?\)|\([a-z]{1,6}\)|[0-9]{1,3}[a-z]?\)|[a-z]{1,6}\)|—|–)\s+")

# paragraph number at the start of the first line: "1.   Asmuo…"
LEAD_NUM = re.compile(r"^(\d+[a-z]?)\.\s+")

# consolidated amendment markers: ►M1 ▼C1 ◄ (and ►B)
MARKERS = re.compile(r"[►▼]\s*[A-Z]\d*|◄")

# annex labels: "I PRIEDAS", "PRIEDAS", "ANNEX IV", "Annex"
ANNEX_LABEL = re.compile(r"^(?:(?P<n1>[IVXLC]+|\d+[a-z]?)\s+PRIEDAS|PRIEDAS|ANNEX(?:\s+(?P<n2>[IVXLC]+|\d+[a-z]?))?)$", re.I)

# division labels of the flat flavour: "I ANTRAŠTINĖ DALIS", "2 SKYRIUS", "TITLE II"
DIVISION_LABEL = re.compile(r"^(?:(?P<n>[IVXLC]+|\d+)\s+(?P<k>ANTRAŠTINĖ DALIS|ANTRAŠTINĖ|DALIS|SKYRIUS|SKIRSNIS|POSKIRSNIS)"
                            r"|(?P<k2>TITLE|PART|CHAPTER|SECTION|SUBSECTION)\s+(?P<n2>[IVXLC]+|\d+))$", re.I)

DIVISION_TYPE = {"antraštinė dalis": "title", "antraštinė": "title", "dalis": "part", "skyrius": "chapter",
                 "skirsnis": "section", "poskirsnis": "subsection", "title": "title", "part": "part",
                 "chapter": "chapter", "section": "section", "subsection": "subsection"}








############################################################
# local
############################################################
#
# Tag name without the XHTML namespace.
#
# Used by:
#   - every walker below
############################################################

def local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""








############################################################
# classes
############################################################
#
# The class attribute as a set ("norm inline-element" →
# {"norm", "inline-element"}).
#
# Used by:
#   - handle, handle_p, text_of, parse_flat
############################################################

def classes(el):
    return set((el.get("class") or "").split())








############################################################
# clean
############################################################
#
# Collapses whitespace (NBSP included — OJ pads paragraph
# numbers with three NBSPs), drops soft hyphens and the
# empty "()" left behind when a consolidated footnote
# reference "(<a>1</a>)" is removed.
#
# Used by:
#   - text_of, walk, parse_flat
############################################################

def clean(text):
    text = text.replace("\u00ad", "").replace("\u00a0", " ")
    text = re.sub(r"\(\s*\)", "", text)
    return re.sub(r"\s+", " ", text).strip()








############################################################
# text_of
############################################################
#
# Inline text of an element for indexing: footnote
# references are dropped (OJ: a[href^="#ntr"], consolidated:
# a[id^="src."]), amendment markers ►M1 / ◄ are stripped
# (their CELEX is recorded by collect_amendments), <br>
# becomes a space. The element's own tail is NOT included.
#
# Used by:
#   - handle, handle_p, point_units, recital_unit, parse_flat
############################################################

def text_of(el):
    parts = []

    def rec(e):
        tag = local(e.tag)
        href = e.get("href") or ""
        if tag == "a" and (href.startswith("#ntr") or (e.get("id") or "").startswith("src.")):
            parts.append(e.tail or "")
            return
        if tag in ("script", "style"):
            parts.append(e.tail or "")
            return
        if tag == "br":
            parts.append(" ")
        parts.append(e.text or "")
        for c in e:
            rec(c)
        parts.append(e.tail or "")

    parts.append(el.text or "")
    for c in el:
        rec(c)
    return clean(MARKERS.sub(" ", "".join(parts)))








############################################################
# new_unit
############################################################
#
# The unit record every parser in this folder emits. eId
# and cite are filled in afterwards by assign_ids.
#
# Used by:
#   - every builder below
############################################################

def new_unit(kind, number=None, heading=None, text=""):
    return {"type": kind, "number": number, "heading": heading, "text": text, "children": []}








############################################################
# add_text
############################################################
#
# Appends a text block to a unit. Text that arrives AFTER
# the unit already has children (e.g. the closing sentence
# after a list of points) becomes an unnumbered "text"
# child so the document order survives in the tree.
#
# Used by:
#   - walk, handle, handle_p, parse_flat
############################################################

def add_text(unit, text):
    if not text:
        return
    if unit["children"]:
        unit["children"].append(new_unit("text", text=text))
    else:
        unit["text"] = unit["text"] + "\n" + text if unit["text"] else text








############################################################
# join
############################################################
#
# Joins heading fragments ("I ANTRAŠTINĖ" + "DALIS …").
#
# Used by:
#   - set_heading, handle_p, parse_flat
############################################################

def join(a, b):
    return b if not a else a + " " + b








############################################################
# set_heading
############################################################
#
# Adds a heading line to a unit. The Lithuanian OJ splits
# "I ANTRAŠTINĖ DALIS" so that "DALIS" opens the heading
# line ("DALIS DALYKAS, TAIKYMO SRITIS…"); the word is
# moved back into the label.
#
# Used by:
#   - handle (div.eli-title), handle_p (division headings)
############################################################

def set_heading(unit, text):
    if (unit.get("label") or "").upper().endswith("ANTRAŠTINĖ") and text.upper().startswith("DALIS"):
        unit["label"] += " DALIS"
        text = text[5:].strip()
    if text:
        unit["heading"] = join(unit["heading"], text)








############################################################
# direct_rows
############################################################
#
# The <tr> rows of THIS table only (nested point tables
# live inside the second cell and must not be flattened).
#
# Used by:
#   - point_units, recital_unit, table_text
############################################################

def direct_rows(table):
    for c in table:
        if local(c.tag) == "tr":
            yield c
        elif local(c.tag) in ("tbody", "thead", "tfoot"):
            for r in c:
                if local(r.tag) == "tr":
                    yield r








############################################################
# label_number
############################################################
#
# Parses a point label and returns (unit type, number):
# "a)" / "(a)" → ("point", "a"), "1." → ("point", "1"),
# "—" → ("indent", "—"); None when it is not a label.
#
# Used by:
#   - point_units, handle (grid lists), parse_flat
############################################################

def label_number(label):
    m = LABEL.match(label.strip())
    if not m:
        return None
    if m.group("d"):
        return "indent", m.group("d")
    return "point", m.group("a") or m.group("b") or m.group("c")








############################################################
# point_units
############################################################
#
# OJ lists are one-row, two-cell tables: cell 1 holds the
# label ("a)"), cell 2 the text plus any NESTED tables for
# sub-points (some annexes add empty indent cells first). Returns the point units, or None when the
# table is a real data table (class oj-table, more cells,
# or a first cell that is not a label).
#
# Used by:
#   - handle
############################################################

def point_units(table, doc):
    if "oj-table" in classes(table):
        return None
    out = []
    for tr in direct_rows(table):
        cells = [c for c in tr if local(c.tag) in ("td", "th")]
        # nested list levels are indented with EMPTY leading cells
        # (MiCA annex V: "" | "1." | text) — drop them
        while len(cells) > 2 and not text_of(cells[0]):
            cells = cells[1:]
        if len(cells) != 2:
            return None
        parsed = label_number(text_of(cells[0]))
        if not parsed:
            return None
        kind, number = parsed
        u = new_unit(kind, number)
        walk(cells[1], u, doc)
        out.append(u)
    return out or None








############################################################
# table_text
############################################################
#
# A data table flattened to "cell | cell" lines — enough
# for retrieval; table structure is not modelled.
#
# Used by:
#   - handle
############################################################

def table_text(table):
    lines = []
    for tr in table.iter():
        if local(tr.tag) != "tr":
            continue
        cells = [text_of(c) for c in tr if local(c.tag) in ("td", "th")]
        cells = [c for c in cells if c]
        if cells:
            lines.append(" | ".join(cells))
    return "\n".join(lines)








############################################################
# recital_unit
############################################################
#
# div#rct_N: a table "(N)" | text in the OJ. The number is
# taken from the id, the text from the second cell (falls
# back to the whole div when there is no table).
#
# Used by:
#   - handle
############################################################

def recital_unit(el, number):
    for t in el.iter():
        if local(t.tag) == "table":
            for tr in direct_rows(t):
                cells = [c for c in tr if local(c.tag) == "td"]
                if len(cells) == 2:
                    return new_unit("recital", number, text=text_of(cells[1]))
    return new_unit("recital", number, text=text_of(el))








############################################################
# group_heading
############################################################
#
# Headings that open an untyped group inside annexes (and
# occasionally articles): "A dalis. …", "Section A. …".
# Returns (level, text) or None.
#
# Used by:
#   - walk
############################################################

def group_heading(el):
    if local(el.tag) != "p":
        return None
    cls = classes(el)
    if cls & {"oj-ti-grseq-1", "title-gr-seq-level-1"}:
        return 1, text_of(el)
    if cls & {"oj-ti-grseq-2", "title-gr-seq-level-2"}:
        return 2, text_of(el)
    if cls & {"title-gr-seq-level-3"}:
        return 3, text_of(el)
    return None








############################################################
# walk
############################################################
#
# Feeds the children of a container element into a unit.
# An element without block children is one text block.
# Group headings open nested "group" units that collect
# the following siblings until a heading of the same or
# higher level; stray text between blocks (div.text / tails)
# is kept as text.
#
# Used by:
#   - handle (recursively), point_units, parse_bytes
############################################################

def walk(el, unit, doc):
    if not any(local(c.tag) in BLOCK for c in el):
        add_text(unit, text_of(el))
        return
    groups = []
    if el.text and el.text.strip():
        add_text(unit, clean(MARKERS.sub(" ", el.text)))
    for child in el:
        target = groups[-1][1] if groups else unit
        heading = group_heading(child)
        if heading and heading[1]:
            level, text = heading
            while groups and groups[-1][0] >= level:
                groups.pop()
            parent = groups[-1][1] if groups else unit
            if parent["type"] == "annex" and not parent["heading"] and not parent["children"] and not parent["text"]:
                parent["heading"] = text
            else:
                g = new_unit("group", heading=text)
                parent["children"].append(g)
                groups.append((level, g))
        else:
            handle(child, target, doc)
        if child.tail and child.tail.strip():
            add_text(groups[-1][1] if groups else unit, clean(MARKERS.sub(" ", child.tail)))








############################################################
# handle
############################################################
#
# Dispatches one element by ELI id / class:
#   div#tis_/cpt_/sct_/art_/anx_  → division / article / annex
#   div.eli-title                → heading of the parent
#   div#rct_N / #cit_N           → recital / citation
#   div#pbl_1 / #fnp_1 / #enc_1  → preamble / final / (flat)
#   div#NNN.NNN (OJ)             → paragraph
#   div.norm > span.no-parag     → paragraph (consolidated)
#   div.grid-container.grid-list → point (consolidated)
#   2-cell table with a label    → point (OJ)
#   div#L_… with "I PRIEDAS"     → annex without an anx_ id
#                                  (defensive: never hit in the
#                                  68 test files once ids are
#                                  whitespace-normalised)
# Anything else is a transparent container.
#
# Used by:
#   - walk
############################################################

def handle(e, unit, doc):
    tag = local(e.tag)
    if tag in ("col", "colgroup", "hr", "script", "style", "img"):
        return
    cls = classes(e)
    # ids are NOT always clean: 'anx_I ' (LT AI Act, CRA, TFR,
    # AMLA, eIDAS) and 'anx_ I' (EN AMLR) both occur
    eid = re.sub(r"\s+", "", e.get("id") or "")
    m = re.match(r"^([a-z]{3})_([0-9A-Za-z]+)$", eid.rsplit(".", 1)[-1])
    kind = m.group(1) if m else None


    # STEP 1: ELI-identified containers
    # =================================
    if tag == "div" and "eli-title" in cls:
        set_heading(unit, text_of(e))
        return
    if tag == "div" and kind in DIV_TYPES:
        u = new_unit(DIV_TYPES[kind], m.group(2))
        unit["children"].append(u)
        walk(e, u, doc)
        return
    if tag == "div" and kind == "rct":
        unit["children"].append(recital_unit(e, m.group(2)))
        return
    if tag == "div" and kind == "cit":
        unit["children"].append(new_unit("citation", m.group(2), text=text_of(e)))
        return
    if tag == "div" and kind == "tit":
        doc["title"] = text_of(e)
        return
    if tag == "div" and kind in ("pbl", "fnp"):
        u = new_unit("preamble" if kind == "pbl" else "final")
        unit["children"].append(u)
        walk(e, u, doc)
        return


    # STEP 2: paragraphs — OJ div#059.001, consolidated div.norm > span.no-parag
    # ==========================================================================
    if tag == "div" and re.match(r"^\d{3}\.\d{3}$", eid):
        u = new_unit("paragraph", str(int(eid.split(".")[1])))
        unit["children"].append(u)
        walk(e, u, doc)
        lead = LEAD_NUM.match(u["text"])
        if lead:
            u["number"], u["text"] = lead.group(1), u["text"][lead.end():]
        return
    kids = list(e)
    if tag == "div" and "norm" in cls and kids and "no-parag" in classes(kids[0]):
        u = new_unit("paragraph", text_of(kids[0]).rstrip(".").strip())
        unit["children"].append(u)
        if kids[0].tail and kids[0].tail.strip():
            add_text(u, clean(kids[0].tail))
        for k in kids[1:]:
            handle(k, u, doc)
            if k.tail and k.tail.strip():
                add_text(u, clean(MARKERS.sub(" ", k.tail)))
        return


    # STEP 3: points — consolidated grid lists, OJ label tables
    # =========================================================
    if tag == "div" and {"grid-container", "grid-list"} <= cls:
        label = next((c for c in kids if "grid-list-column-1" in classes(c)), None)
        body = next((c for c in kids if "grid-list-column-2" in classes(c)), None)
        parsed = label_number(text_of(label)) if label is not None else None
        if parsed and body is not None:
            u = new_unit(*parsed)
            unit["children"].append(u)
            walk(body, u, doc)
            return
    if tag == "table":
        points = point_units(e, doc)
        if points:
            unit["children"].extend(points)
        else:
            add_text(unit, table_text(e))
        return


    # STEP 4: annex document divs without an anx_ id (defensive)
    # ==========================================================
    if tag == "div" and eid.startswith("L_") and unit is doc["root"]:
        has_eli = any("eli-container" in classes(d) for d in e.iter() if local(d.tag) == "div")
        first = next((p for p in e.iter() if local(p.tag) == "p" and "oj-doc-ti" in classes(p)), None)
        am = ANNEX_LABEL.match(text_of(first)) if first is not None else None
        if am and not has_eli:
            u = new_unit("annex", am.group("n1") or am.group("n2"))
            unit["children"].append(u)
            walk(e, u, doc)
            return


    # STEP 5: paragraphs of text, headings, notes; else transparent
    # =============================================================
    if tag == "p":
        handle_p(e, cls, unit, doc)
        return
    walk(e, unit, doc)








############################################################
# handle_p
############################################################
#
# One <p>: article/division labels and headings go to the
# current unit's label/heading, footnotes to doc
# ["footnotes"], consolidated header boilerplate is
# dropped, everything else is text. In the LT OJ the word
# "DALIS" of "I ANTRAŠTINĖ DALIS" is printed at the start
# of the heading line — it is moved back into the label.
#
# Used by:
#   - handle
############################################################

def handle_p(e, cls, unit, doc):
    text = text_of(e)
    if not text:
        return
    if cls & {"oj-ti-art", "title-article-norm"}:
        unit["label"] = text
        return
    if cls & {"oj-sti-art", "stitle-article-norm"}:
        unit["heading"] = join(unit["heading"], text)
        return
    if cls & {"oj-ti-section-1", "title-division-1"}:
        unit["label"] = join(unit.get("label"), text)
        return
    if cls & {"oj-ti-section-2", "title-division-2"}:
        set_heading(unit, text)
        return
    if cls & {"oj-doc-ti", "title-annex-1", "title-annex-2"} and unit["type"] == "annex":
        if not unit.get("label") and ANNEX_LABEL.match(text):
            unit["label"] = text
        else:
            unit["heading"] = join(unit["heading"], text)
        return
    if cls & {"oj-note", "footnote"}:
        doc["footnotes"].append(text)
        return
    if cls & {"modref", "arrow", "reference", "disclaimer", "hd-modifiers", "hd-toc-1", "hd-toc-2", "hd-toc-3",
              "title-fam-member", "title-fam-member-star", "toc-1", "toc-2", "oj-hd-date", "oj-hd-lg", "oj-hd-ti",
              "oj-hd-oj"}:
        return
    inline = INLINE_LABEL.match(text)
    lead = LEAD_NUM.match(text)
    opening = unit["type"] == "paragraph" and not unit["text"] and not unit["children"]
    if (inline and label_number(inline.group(1))) or (lead and not opening):
        # LT OJ texts often print lists as "1)   <b>asmens duomenys</b>– …"
        # or "1.   <b>elektroninė atpažintis</b>– …" paragraphs instead of
        # label tables (GDPR Art. 4, eIDAS Art. 3, EMD2 Art. 2). Real OJ
        # paragraphs always sit in div#NNN.NNN, so an "N." line anywhere
        # but the opening line of such a div is a list item.
        kind, number = label_number(inline.group(1)) if inline else ("point", lead.group(1))
        point = new_unit(kind, number, text=text[(inline or lead).end():])
        point["_inline"] = True
        unit["children"].append(point)
        return
    add_text(unit, text)








############################################################
# parse_flat
############################################################
#
# Old consolidated XHTML (fmx2xhtml 7.x, e.g. EMD2 LT
# 02009L0110-20180113) has no ELI divs: a flat run of
# p.title-division-*, p.title-article-norm, p.norm,
# p.dlist-term/definition. Divisions become flat
# "division" units (no nesting), articles hold paragraphs
# ("1.  …") and points ("a) …"). Best effort only.
#
# Used by:
#   - parse_bytes (when no eli-subdivision exists)
############################################################

def parse_flat(body, doc):
    root = doc["root"]
    division = None
    article = None
    paragraph = None
    annex = None
    term = None
    for p in body.iter():
        if local(p.tag) != "p":
            continue
        cls = classes(p)
        text = text_of(p)
        if not text:
            continue


        # STEP 1: document title and division / annex headings
        # ====================================================
        if cls & {"title-doc-first", "title-doc-last"}:
            if text not in (doc.get("title") or ""):
                doc["title"] = join(doc.get("title"), text)
            continue
        if cls & {"title-division-1", "title-division-2"}:
            if division is None or division["children"] or division["heading"]:
                division = new_unit("division")
                (annex or root)["children"].append(division)
                article = paragraph = None
            if division.get("label") and not DIVISION_LABEL.match(division["label"]):
                division["label"] = join(division["label"], text)
            elif division.get("label"):
                division["heading"] = join(division["heading"], text)
            else:
                division["label"] = text
            continue
        if cls & {"title-annex-1"}:
            am = ANNEX_LABEL.match(text)
            annex = new_unit("annex", (am.group("n1") or am.group("n2")) if am else None)
            annex["label"] = text
            root["children"].append(annex)
            division = article = paragraph = None
            continue


        # STEP 2: articles and their headings
        # ===================================
        if cls & {"title-article-norm"}:
            num = re.match(r"^(\d+[a-z]?)", text) or re.search(r"(\d+[a-z]?)$", text)
            article = new_unit("article", num.group(1) if num else None)
            article["label"] = text
            (division or annex or root)["children"].append(article)
            paragraph = None
            continue
        if cls & {"stitle-article-norm"} and article is not None:
            article["heading"] = join(article["heading"], text)
            continue
        if cls & {"footnote"}:
            doc["footnotes"].append(text)
            continue
        if cls & {"modref", "arrow", "reference", "disclaimer", "hd-modifiers", "toc-1", "toc-2",
                  "title-fam-member", "title-fam-member-star", "hd-toc-1", "hd-toc-2", "hd-toc-3"}:
            continue


        # STEP 3: definition lists, paragraphs, points, plain text
        # ========================================================
        container = paragraph or article or annex or division
        if container is None:
            continue
        if cls & {"dlist-term"}:
            parsed = label_number(text)
            term = new_unit(*(parsed or ("point", text.rstrip(".)"))))
            container["children"].append(term)
            continue
        if cls & {"dlist-definition"} and term is not None:
            add_text(term, text)
            term = None
            continue
        lead = LEAD_NUM.match(text)
        if lead and article is not None and container in (article, paragraph):
            paragraph = new_unit("paragraph", lead.group(1), text=text[lead.end():])
            article["children"].append(paragraph)
            continue
        inline = INLINE_LABEL.match(text)
        if inline and label_number(inline.group(1)):
            point = new_unit(*label_number(inline.group(1)), text=text[inline.end():])
            container["children"].append(point)
            continue
        add_text(container, text)








############################################################
# point_level
############################################################
#
# List depth implied by a label: 1 = "1)", 2 = "a)", 3 =
# "i)", 4 = "—". "i", "v", "x" … continue an alphabetic run
# when the previous sibling is the preceding letter ("h)"
# → "i)" is a letter, not a roman numeral).
#
# Used by:
#   - nest_inline_points
############################################################

def point_level(point, previous):
    number = point["number"] or ""
    if point["type"] == "indent":
        return 4
    if number[:1].isdigit():
        return 1
    roman = re.fullmatch(r"[ivxlc]+", number) is not None
    if roman and previous and len(previous) == 1 and len(number) == 1 and ord(number) == ord(previous) + 1:
        return 2
    return 3 if roman else 2








############################################################
# nest_inline_points
############################################################
#
# Points built from inline-labelled paragraphs arrive as a
# flat run of siblings ("16) … :", then the "a)" / "b)"
# label tables, then "17) …"). A point whose label is deeper
# than the open inline point is moved under it; any other
# unit closes the run. Table-built points never open a run,
# so correctly nested OJ tables are left alone.
#
# Used by:
#   - parse_bytes (after the walk)
############################################################

def nest_inline_points(unit):
    for child in unit["children"]:
        nest_inline_points(child)
    kept, stack, last_label = [], [], {}
    for child in unit["children"]:
        if child["type"] not in ("point", "indent"):
            stack = []
            kept.append(child)
            continue
        parent = stack[-1][1] if stack else None
        level = point_level(child, last_label.get(id(parent)))
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent = stack[-1][1] if stack else None
        (parent["children"] if parent else kept).append(child)
        last_label[id(parent)] = child["number"]
        if child.pop("_inline", False):
            stack.append((level, child))
    unit["children"] = kept








############################################################
# attach_subparagraphs
############################################################
#
# In consolidated XHTML only the FIRST subparagraph of a
# numbered paragraph sits inside div.norm; the following
# subparagraphs and their point lists are siblings at the
# article level. Everything unnumbered that follows a
# paragraph inside an article is moved into that
# paragraph (a no-op for OJ text, which nests correctly).
#
# Used by:
#   - parse_bytes (after the walk, before assign_ids)
############################################################

def attach_subparagraphs(unit):
    for child in unit["children"]:
        attach_subparagraphs(child)
    if unit["type"] != "article":
        return
    kept, current = [], None
    for child in unit["children"]:
        if child["type"] == "paragraph":
            current = child
            kept.append(child)
        elif current is not None and child["type"] in ("text", "point", "indent", "group"):
            if child["type"] == "text":
                add_text(current, child["text"])
            else:
                current["children"].append(child)
        else:
            kept.append(child)
    unit["children"] = kept








############################################################
# assign_ids
############################################################
#
# Fills eId (Akoma Ntoso style: art_59__para_1__point_a)
# and cite on every unit. LT: "59 str. 1 d. a p."; EN:
# "Art. 59(1)(a)". Divisions and text blocks keep the
# citation of the enclosing article/annex; a group adds its
# short label ("I priedas A dalis").
#
# Used by:
#   - parse_bytes
############################################################

def assign_ids(unit, prefix, cite, lang, depth=0):
    counters = {}
    for child in unit["children"]:
        kind = child["type"]
        counters[kind] = counters.get(kind, 0) + 1
        number = child["number"] if child["number"] not in (None, "", "—") else str(counters[kind])
        token = EID.get(kind, kind) + "_" + re.sub(r"[^0-9A-Za-z]", "", number)
        eid = prefix + "__" + token if prefix else token
        child_cite = cite
        if kind == "article":
            child_cite = f"{number} str." if lang == "lt" else f"Art. {number}"
        elif kind == "annex":
            child_cite = f"{number} priedas" if lang == "lt" else f"Annex {number}"
        elif kind == "recital":
            child_cite = f"{number} konstatuojamoji dalis" if lang == "lt" else f"Recital {number}"
        elif kind == "group" and cite and child["heading"]:
            short = child["heading"].split(".")[0].strip()
            child_cite = f"{cite} {short}" if len(short) <= 20 else cite
        elif kind == "paragraph" and cite:
            child_cite = f"{cite} {number} d." if lang == "lt" else f"{cite}({number})"
        elif kind in ("point", "indent") and cite:
            if lang == "lt":
                suffix = "p." if depth == 0 or not cite.endswith(" p.") and not cite.endswith(" pap.") else "pap."
                child_cite = f"{cite} {number} {suffix}" if kind == "point" else f"{cite} {counters[kind]} įtr."
            else:
                child_cite = f"{cite}({number})" if kind == "point" else f"{cite}, indent {counters[kind]}"
        child["eId"] = eid
        child["cite"] = child_cite
        nested = depth + 1 if kind in ("point", "indent") else depth
        assign_ids(child, eid, child_cite, lang, nested)








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
# parse_bytes
############################################################
#
# Entry point: XHTML bytes → document unit. Detects the
# flavour and language, walks the body-level containers
# (the OJ/consolidated header tables at body level are
# skipped), then numbers everything.
#
# Used by:
#   - main (CLI) — and corpus/ingest.py (through the sandbox)
############################################################

def parse_bytes(data):
    root = ET.fromstring(data)
    body = next((e for e in root.iter() if local(e.tag) == "body"), None)
    if body is None:
        raise ValueError("Not an XHTML document: no <body>")
    raw = ET.tostring(body, encoding="unicode")


    # STEP 1: flavour, language and the document shell
    # ================================================
    has_eli = "eli-subdivision" in raw
    if "oj-ti-art" in raw or "oj-normal" in raw:
        flavour = "oj"
    else:
        flavour = "cons" if has_eli else "cons_flat"
    lang = "lt" if re.search(r"\d+[a-z]?\s+straipsnis", raw) else "en"
    root = new_unit("document")
    doc = {"root": root, "footnotes": [], "title": None}
    ref = re.search(r'<p[^>]*class="reference"[^>]*>(.*?)</p>', raw, re.S)


    # STEP 2: walk — ELI containers, or the flat fallback
    # ===================================================
    if flavour == "cons_flat":
        parse_flat(body, doc)
    else:
        for child in body:
            if local(child.tag) == "div":
                handle(child, root, doc)


    # STEP 3: inline-list nesting, subparagraph fix-up, ids, citations
    # ================================================================
    nest_inline_points(root)
    attach_subparagraphs(root)
    assign_ids(root, "", "", lang)
    root.update({"source": "cellar-xhtml", "flavour": flavour, "language": lang, "title": doc["title"],
                 "consolidated_reference": clean(re.sub(r"<[^>]+>", " ", ref.group(1))) if ref else None,
                 "footnotes": doc["footnotes"], "stats": count(root)})
    return root
