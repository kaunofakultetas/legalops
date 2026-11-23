############################################################
#  [*] Text extraction — bytes → plain text
#
#  One function per format, chosen by extension then MIME:
#
#    PDF   — pypdf, pages joined by form feeds
#    DOCX  — python-docx, paragraphs and table rows in order
#    HTML  — lxml, BLOCK-AWARE: every block element ends a
#            line, table cells of a row are joined by spaces,
#            inline markup never splits a sentence — the legal
#            structure parser relies on one provision per line
#    text  — txt / md / csv / json, UTF-8 with a cp1257
#            (Baltic) fallback; UTF-16 when it opens with a
#            byte-order mark
#
#  A caller that needs the page boundaries (the standards'
#  clause parser removes what every page repeats) asks for
#  them: the pages then stay apart, a form feed on a line of
#  its own between two of them. Everyone else gets the text
#  without them, as before.
#
#  The leading bytes win over the name: a PDF named .txt is
#  a PDF, and binary content named .txt / .html (a zip, an
#  image, anything with NUL bytes) is "unsupported" instead
#  of being stored — and embedded, and paid for — as garbage.
#  clean_text drops the control characters Postgres TEXT
#  cannot hold (NUL) and lone surrogates a broken font map
#  yields.
#
#  Never call these directly on untrusted input from a web or
#  worker process: common/sandbox.py runs them in a child
#  process with memory, CPU and zip-size limits.
############################################################


import io
import re
import zipfile


TEXT_EXTENSIONS = (".txt", ".md", ".markdown", ".csv", ".json")
HTML_EXTENSIONS = (".html", ".htm", ".xhtml")

# The most characters kept per document — a whole regulation
# is ~1M characters; anything beyond this is not a policy
MAX_CHARS = 4_000_000

# A DOCX is a zip — refuse archives that inflate past this
MAX_UNZIPPED_BYTES = 300 * 1024 * 1024

# Elements that end a line in the HTML walker
BLOCK_TAGS = {
    "p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "article",
    "header", "footer", "blockquote", "pre", "dt", "dd", "ul", "ol", "hr", "caption", "title",
}

# Elements whose text is never content
SKIP_TAGS = {"script", "style", "noscript", "head", "nav", "button", "form", "svg"}

# Leading bytes of formats never read as text (zip, PNG,
# gzip, JPEG, GIF, OLE2 .doc/.xls); anything else binary
# shows itself by NUL bytes near the start
BINARY_MAGIC = (b"PK\x03\x04", b"\x89PNG", b"\x1f\x8b", b"\xff\xd8\xff", b"GIF8", b"\xd0\xcf\x11\xe0")
UTF16_BOMS = (b"\xff\xfe", b"\xfe\xff")








############################################################
# UnreadableFile
############################################################
#
# A file that cannot be opened for a reason its uploader can
# act on — a password, a rights-management lock, a missing
# decryption package. Its message is the whole error the
# upload shows; any other failure carries its exception's
# name, as it is a defect to look into.
#
# Used by:
#   - _pdf, extract_text (below)
############################################################

class UnreadableFile(Exception):
    pass

# NUL and the other C0 controls (tab, newlines, vertical tab
# and form feed stay — the whitespace rules below fold them),
# DEL, and lone UTF-16 surrogates (UTF-8 cannot encode them)
UNREADABLE = re.compile("[\x00-\x08\x0e-\x1f\x7f\ud800-\udfff]")








############################################################
# clean_text
############################################################
#
# Normalises line endings, collapses runs of spaces and of
# blank lines, drops soft hyphens and zero-width characters
# the official portals sprinkle into texts. Form feeds go the
# way of spaces — unless `pages` asks to keep the pages apart:
# each page is then cleaned on its own and a form feed stands
# on a line of its own between two of them.
#
# Used by:
#   - extract_text (below)
#   - corpus/structure.py — before parsing
############################################################

def clean_text(text, pages=False):
    if pages:
        return "\n\f\n".join(clean_text(page) for page in text.split("\f"))[:MAX_CHARS]
    text = UNREADABLE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("­", "").replace("​", "").replace("﻿", "").replace("\xa0", " ")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:MAX_CHARS]








############################################################
# html_to_text
############################################################
#
# Walks the lxml tree: block elements open and close lines,
# table cells are separated by a space (EU acts lay out
# points "(a) text" as two-cell rows), <br> breaks a line.
#
# Used by:
#   - extract_text (below)
############################################################

def html_to_text(data):
    from lxml import html as lxml_html

    if isinstance(data, bytes):
        root = lxml_html.document_fromstring(data)
    else:
        root = lxml_html.document_fromstring(data.encode("utf-8"))
    lines, current = [], []

    def flush():
        line = "".join(current).strip()
        if line:
            lines.append(line)
        current.clear()

    def walk(element):
        tag = element.tag if isinstance(element.tag, str) else ""
        tag = tag.split("}")[-1].lower()
        if tag in SKIP_TAGS:
            if element.tail:
                current.append(element.tail)
            return
        block = tag in BLOCK_TAGS
        if block:
            flush()
        if tag in ("td", "th") and current and not current[-1].endswith(" "):
            current.append(" ")
        if element.text:
            current.append(element.text)
        for child in element:
            walk(child)
        if block or tag == "br":
            flush()
        if element.tail:
            current.append(element.tail)

    body = root.find(".//body")
    walk(body if body is not None else root)
    flush()
    return "\n".join(re.sub(r"\s+", " ", line) for line in lines)








############################################################
# _pdf
############################################################
#
# Page texts joined with a form feed so page boundaries stay
# findable. A PDF secured against editing or copying opens
# with its empty user password (pypdf tries it); the ones
# that cannot be opened say why in words an administrator can
# act on: a password is needed, the file is locked by a
# rights-management plug-in (FileOpen and the like — neither
# pypdf nor any open reader can open those), or its AES
# encryption needs the `cryptography` package the image
# installs.
#
# Used by:
#   - extract_text (below)
############################################################

def _pdf(data):
    from pypdf import PdfReader
    from pypdf.errors import DependencyError, FileNotDecryptedError
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n\f\n".join((page.extract_text() or "") for page in reader.pages)
    except FileNotDecryptedError:
        raise UnreadableFile("the PDF is password-protected — upload a copy that opens without a password") from None
    except DependencyError:
        raise UnreadableFile("the PDF is AES-encrypted and this installation lacks the package that reads it "
                             "(cryptography) — rebuild the django image, or upload an unprotected copy") from None
    except NotImplementedError:
        raise UnreadableFile("the PDF is locked by a rights-management plug-in (e.g. FileOpen) and cannot be "
                             "read — ask the publisher for a copy without it") from None








############################################################
# _docx
############################################################
#
# Paragraphs and table rows in body order (python-docx keeps
# them in separate lists, so the body XML is walked). The
# archive's inflated size is checked first.
#
# Used by:
#   - extract_text (below)
############################################################

def _docx(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(info.file_size for info in archive.infolist()) > MAX_UNZIPPED_BYTES:
            raise ValueError("DOCX inflates past the size limit")
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = docx.Document(io.BytesIO(data))
    parts = []
    for child in document.element.body.iterchildren():
        tag = child.tag.split("}")[-1]
        if tag == "p":
            parts.append(Paragraph(child, document).text)
        elif tag == "tbl":
            for row in Table(child, document).rows:
                parts.append(" ".join(cell.text.strip() for cell in row.cells))
    return "\n".join(parts)








############################################################
# _text
############################################################
#
# UTF-16 when a byte-order mark says so (Windows "Unicode"
# text), else UTF-8 (a BOM is dropped), cp1257 (Baltic) as
# the fallback.
#
# Used by:
#   - extract_text (below)
############################################################

def _text(data):
    if data.startswith(UTF16_BOMS):
        return data.decode("utf-16", errors="replace")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1257", errors="replace")








############################################################
# _binary
############################################################
#
# True when bytes offered as text or HTML are something else
# — a known binary format, or NUL bytes in the first 8 KiB
# (UTF-16 with its byte-order mark is text).
#
# Used by:
#   - detect_kind (below)
############################################################

def _binary(data):
    head = (data or b"")[:8192]
    if head.startswith(UTF16_BOMS):
        return False
    return head.startswith(BINARY_MAGIC) or b"\x00" in head








############################################################
# detect_kind
############################################################
#
# "pdf" | "docx" | "html" | "text" | None from the name, the
# MIME type and the leading bytes (a PDF named .txt is still
# a PDF; a zip or an image named .txt is None).
#
# Used by:
#   - extract_text (below)
#   - common/sandbox.py — refuses unsupported kinds early
############################################################

def detect_kind(data, filename=None, mime=None):
    name = (filename or "").lower()
    mime = (mime or "").lower()
    head = data[:8] if data else b""
    if head.startswith(b"%PDF") or name.endswith(".pdf") or mime == "application/pdf":
        return "pdf"
    if name.endswith(".docx") or mime.endswith("wordprocessingml.document"):
        return "docx" if head.startswith(b"PK") else None
    if name.endswith(HTML_EXTENSIONS) or mime in ("text/html", "application/xhtml+xml"):
        return None if _binary(data) else "html"
    if name.endswith(TEXT_EXTENSIONS) or mime.startswith("text/") or mime == "application/json":
        return None if _binary(data) else "text"
    return None








############################################################
# extract_text
############################################################
#
# The text of a file and no error — or no text and why: the
# word "unsupported" for a format this module does not read,
# the reason a file cannot be opened (UnreadableFile), or the
# parser's own failure with its exception's name. `pages`
# keeps the pages of a PDF (and the form feeds of a text
# file) apart, see clean_text.
#
# Used by:
#   - common/extract_cli.py — inside the sandboxed child
############################################################

def extract_text(data, filename=None, mime=None, pages=False):
    kind = detect_kind(data, filename, mime)
    try:
        if kind == "pdf":
            return clean_text(_pdf(data), pages), None
        if kind == "docx":
            return clean_text(_docx(data)), None
        if kind == "html":
            return clean_text(html_to_text(data)), None
        if kind == "text":
            return clean_text(_text(data), pages), None
    except UnreadableFile as exc:
        return "", str(exc)
    except Exception as exc:
        return "", f"{type(exc).__name__}: {exc}"[:500]
    return "", "unsupported"
