############################################################
#  [*] lb_html — lb.lt content page → unit tree 
#
#  Bank of Lithuania pages (e.g. the licensing guides
#  https://www.lb.lt/lt/mokejimo-istaigu-steigimas-ir-
#  licencijavimas) are server-rendered: the page title is
#  section#content h1, the body is the CKEditor HTML inside
#  div.text.clearfix (classic pages) or several
#  div.messages_widget … div.message > div.text blocks
#  (widget pages such as the CASP guide), the version
#  signal is
#  div.last_update ("Paskutinė atnaujinimo data: 2024-07-30").
#  h2 opens a section, h3 a subsection, p / li / table rows
#  are text; "[[#ex]]" paragraphs are accordion markers of
#  the site's JS and are dropped. Links are collected (they
#  point to e-tar, infolex.lt and /uploads/documents/… PDFs).
#
#  Standard library only.
#
#    parse_bytes(html_bytes) → the document unit (a dict tree)
############################################################


import re
from html.parser import HTMLParser








############################################################
# LbPage
############################################################
#
# Streaming html.parser that only records what sits inside
# the div.text containers (+ the h1 and the last-update line):
# a flat list of (kind, text) blocks, kind ∈ h2 | h3 | p |
# li | row, plus the links met inside the text.
#
# Used by:
#   - parse_bytes
############################################################

class LbPage(HTMLParser):






    ############################################################
    # LbPage.__init__
    ############################################################
    #
    # depth counts open divs inside div.text so the closing
    # </div> of the container is recognised.
    #
    # Used by:
    #   - parse_bytes
    ############################################################

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_text = False
        self.depth = 0
        self.block = None
        self.buf = []
        self.blocks = []
        self.links = []
        self.title = None
        self.in_h1 = False
        self.in_update = False
        self.updated = None
        self.cells = None






    ############################################################
    # LbPage.handle_starttag
    ############################################################
    #
    # Opens blocks (h2/h3/p/li, table rows) inside the text
    # container; notes h1, div.last_update and links.
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        # classic pages: one div.text.clearfix; widget pages (the
        # MiCA / CASP guides): several div.messages_widget …
        # div.message > div.text blocks — all are captured
        if tag == "div" and "text" in cls.split() and not self.in_text:
            self.in_text, self.depth = True, 0
            return
        if tag == "div" and "last_update" in cls.split():
            self.in_update, self.buf = True, []
        if tag == "h1" and self.title is None:
            self.in_h1, self.buf = True, []
        if not self.in_text:
            return
        if tag == "div":
            self.depth += 1
        if tag in ("h2", "h3", "h4", "p", "li"):
            self.block, self.buf = ("h3" if tag == "h4" else tag), []
        if tag == "tr":
            self.cells = []
        if tag in ("td", "th"):
            self.block, self.buf = "cell", []
        if tag == "a" and a.get("href"):
            href = a["href"]
            self.links.append(("https:" + href) if href.startswith("//") else href)
        if tag == "br":
            self.buf.append(" ")






    ############################################################
    # LbPage.handle_endtag
    ############################################################
    #
    # Closes a block and stores its text; the </div> that
    # balances div.text ends the capture.
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_endtag(self, tag):
        if self.in_h1 and tag == "h1":
            self.title, self.in_h1 = self.text(), False
        if self.in_update and tag == "div":
            # LT "2024-07-30", EN "15-09-2025" (day first) → ISO
            m = re.search(r"(\d{4}-\d{2}-\d{2})|(\d{2})-(\d{2})-(\d{4})", self.text())
            self.updated = (m.group(1) or f"{m.group(4)}-{m.group(3)}-{m.group(2)}") if m else None
            self.in_update = False
        if not self.in_text:
            return
        if tag == "div":
            if self.depth == 0:
                self.in_text = False
                return
            self.depth -= 1
        if tag in ("h2", "h3", "h4", "p", "li") and self.block:
            text = self.text()
            if text and text != "[[#ex]]":
                self.blocks.append((self.block, text))
            self.block = None
        if tag in ("td", "th") and self.cells is not None:
            self.cells.append(self.text())
            self.block = None
        if tag == "tr" and self.cells is not None:
            row = " | ".join(c for c in self.cells if c)
            if row:
                self.blocks.append(("row", row))
            self.cells = None






    ############################################################
    # LbPage.handle_data
    ############################################################
    #
    # Buffers text of the open block / h1 / last-update line.
    #
    # Used by:
    #   - HTMLParser.feed
    ############################################################

    def handle_data(self, data):
        if self.block or self.in_h1 or self.in_update:
            self.buf.append(data)






    ############################################################
    # LbPage.text
    ############################################################
    #
    # The buffered text, whitespace/NBSP collapsed.
    #
    # Used by:
    #   - LbPage.handle_endtag
    ############################################################

    def text(self):
        return re.sub(r"\s+", " ", "".join(self.buf).replace("\u00a0", " ")).strip()








############################################################
# new_unit
############################################################
#
# Same record as the CELLAR / e-tar parsers.
#
# Used by:
#   - parse_bytes
############################################################

def new_unit(kind, number=None, heading=None, text=""):
    return {"type": kind, "number": number, "heading": heading, "text": text, "children": []}








############################################################
# parse_bytes
############################################################
#
# Blocks → tree: h2 = section, h3 = subsection (under the
# current section), everything else is text of the current
# unit; "1) …" paragraphs and list items become points so
# requirement lists stay addressable ("§ MĮ licencija, 3 p.").
#
# Used by:
#   - main (CLI) — and corpus/ingest.py (through the sandbox)
############################################################

def parse_bytes(data):
    page = LbPage()
    page.feed(data.decode("utf-8", "replace"))
    doc = new_unit("document", heading=page.title)
    doc.update({"source": "lb-html", "language": "lt", "title": page.title, "updated": page.updated,
                "links": sorted(set(page.links))})
    section = subsection = None
    counters = {}
    for kind, text in page.blocks:
        if kind == "h2":
            section, subsection = new_unit("section", heading=text), None
            doc["children"].append(section)
            continue
        if kind == "h3":
            subsection = new_unit("subsection", heading=text)
            (section or doc)["children"].append(subsection)
            continue
        target = subsection or section or doc
        m = re.match(r"^(\d+)\)\s+(.*)$", text)
        if kind == "li" or m:
            key = id(target)
            counters[key] = counters.get(key, 0) + 1
            number = m.group(1) if m else str(counters[key])
            target["children"].append(new_unit("point", number, text=m.group(2) if m else text))
        elif target["children"]:
            target["children"].append(new_unit("text", text=text))
        else:
            target["text"] = (target["text"] + "\n" + text) if target["text"] else text
    return doc
