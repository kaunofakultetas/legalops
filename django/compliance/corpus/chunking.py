############################################################
#  [*] corpus.chunking — the provision tree → retrieval units
#
#  The retrieval unit is the ARTICLE: a lawyer asks about an
#  article, cites an article, and an article is usually short
#  enough to embed whole. Long articles are split between
#  paragraphs (never inside one unless a single paragraph is
#  itself too long), each piece repeating the article's label
#  line so it stands alone. Recitals, top-level points (acts
#  without articles) and loose text are grouped into runs.
#
#  A standard has no articles: its retrieval unit is the
#  clause without subclauses, opened by the headings of the
#  clauses it sits in (build_standard_chunks).
############################################################


import re
from dataclasses import dataclass


from compliance.corpus.structure import unit_label

# Characters per chunk: ~800 tokens of Lithuanian text, well
# under the embedding model's 8k-token input
MAX_CHUNK_CHARS = 3200

# A standard's clause this short shares a chunk with its
# short siblings, up to RUN_CHARS (a terms clause's entries,
# a control table's one-line controls)
SHORT_CLAUSE_CHARS = 700
RUN_CHARS = 2000








############################################################
# ChunkSpec
############################################################
#
# One chunk before it has a row: the ParsedUnit it belongs
# to (an article, annex, recital run…), its citation path,
# heading and text.
#
# Used by:
#   - build_chunks (below), corpus/ingest.py
############################################################

@dataclass
class ChunkSpec:
    unit: object
    path: str
    heading: str
    text: str








############################################################
# _windows
############################################################
#
# Splits one over-long text at line then sentence boundaries
# into pieces under the limit (a hard cut only when a single
# sentence exceeds it).
#
# Used by:
#   - _split_article, build_chunks, build_standard_chunks (below)
############################################################

def _windows(text, limit=MAX_CHUNK_CHARS):
    pieces, current = [], ""
    for sentence in re.split(r"(?<=[.;:])\s+|\n", text):
        sentence = sentence.strip()
        if not sentence:
            continue
        while len(sentence) > limit:
            pieces.append(sentence[:limit])
            sentence = sentence[limit:]
        if current and len(current) + len(sentence) + 1 > limit:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces








############################################################
# _split_article
############################################################
#
# An over-long article → runs of whole paragraphs under the
# limit; the path names the paragraph range ("59 str. 1–3 d."
# / "Art. 59(1)-(3)").
#
# Used by:
#   - build_chunks (below)
############################################################

def _split_article(article, path, language):
    label = unit_label(article, language)
    head = "\n".join([label, *article.lines]).strip()
    groups, current, numbers = [], [], []
    budget = MAX_CHUNK_CHARS - len(label) - 1
    for child in article.children:
        text = child.full_text(language)
        if len(text) > budget:
            if current:
                groups.append((numbers, current))
                current, numbers = [], []
            for piece in _windows(text, budget):
                groups.append(([child.number], [piece]))
            continue
        if current and sum(len(t) + 1 for t in current) + len(text) > budget:
            groups.append((numbers, current))
            current, numbers = [], []
        current.append(text)
        numbers.append(child.number)
    if current:
        groups.append((numbers, current))

    specs = []
    for index, (nums, texts) in enumerate(groups):
        span = nums[0] if len(set(nums)) == 1 else f"{nums[0]}–{nums[-1]}"
        piece_path = (f"{path} {span} d." if language == "lt" else f"{path}({span})") if span else path
        body = "\n".join(texts)
        text = f"{head}\n{body}" if index == 0 and article.lines else f"{label}\n{body}"
        specs.append(ChunkSpec(article, piece_path, article.heading, text))
    return specs or [ChunkSpec(article, path, article.heading, head[:MAX_CHUNK_CHARS])]








############################################################
# build_chunks
############################################################
#
#   build_chunks(tree, "lt", paths) → [ChunkSpec, …]
#
# `paths` maps id(ParsedUnit) → its citation path (computed
# once by the ingest step). Articles and annexes chunk on
# their own; recitals, top-level points and loose text are
# grouped into runs under the limit.
#
# Used by:
#   - corpus/ingest.py
############################################################

def build_chunks(tree, language, paths):
    specs = []
    run = {"units": [], "texts": [], "kind": None}

    def flush_run():
        if not run["units"]:
            return
        first, last = run["units"][0], run["units"][-1]
        if run["kind"] == "recital":
            span = first.number if first is last else f"{first.number}–{last.number}"
            path = f"{span} konstatuojamoji dalis" if language == "lt" else f"Recitals ({span})"
        elif run["kind"] == "point":
            span = first.number if first is last else f"{first.number}–{last.number}"
            path = f"{span} p." if language == "lt" else f"Points {span}"
        else:
            path = paths.get(id(first), "")
        specs.append(ChunkSpec(first, path, "", "\n".join(run["texts"])))
        run["units"], run["texts"], run["kind"] = [], [], None

    def add_to_run(unit, kind):
        text = unit.full_text(language)
        if run["kind"] != kind or sum(len(t) + 1 for t in run["texts"]) + len(text) > MAX_CHUNK_CHARS:
            flush_run()
        run["kind"] = kind
        if len(text) > MAX_CHUNK_CHARS:
            for piece in _windows(text):
                run["units"].append(unit)
                run["texts"].append(piece)
                flush_run()
                run["kind"] = kind
            return
        run["units"].append(unit)
        run["texts"].append(text)

    def walk(units):
        for unit in units:
            if unit.unit_type == "article":
                flush_run()
                path = paths.get(id(unit), "")
                text = unit.full_text(language)
                specs.extend([ChunkSpec(unit, path, unit.heading, text)] if len(text) <= MAX_CHUNK_CHARS
                             else _split_article(unit, path, language))
            elif unit.unit_type == "annex":
                flush_run()
                path = paths.get(id(unit), "")
                label = unit_label(unit, language)
                for piece in _windows(unit.full_text(language)):
                    body = piece if piece.startswith(label) else f"{label}\n{piece}"
                    specs.append(ChunkSpec(unit, path, unit.heading, body))
            elif unit.unit_type == "recital":
                add_to_run(unit, "recital")
            elif unit.unit_type in ("point", "subpoint"):
                add_to_run(unit, "point")
            elif unit.unit_type == "text":
                add_to_run(unit, "text")
            else:
                flush_run()
                walk(unit.children)
        flush_run()

    walk(tree)
    return [spec for spec in specs if spec.text.strip()]








############################################################
# build_standard_chunks
############################################################
#
# A standard's clause tree → chunks. The retrieval unit is a
# clause without subclauses — what a reader cites — its text
# opened by the headings of the clauses and the annex it sits
# in, so a chunk of 6.1.2 still says it belongs to planning.
# Runs of short sibling clauses share a chunk under
# RUN_CHARS, its path naming the range ("3.1–3.12"); a clause
# too long for one chunk is cut into windows that each repeat
# those headings and its own. The preamble, the bibliography
# and a clause's or annex's own text before its subclauses
# chunk on their own. `paths` is the ingest's map of
# id(ParsedUnit) → citation path, as for build_chunks.
#
# Used by:
#   - corpus/ingest.py — the version of a standard
############################################################

def build_standard_chunks(tree, language, paths):
    specs = []

    def emit(unit, trail, text, path=None, heading=None):
        context = " › ".join(label for label in (unit_label(u, language) for u in trail) if label)
        label = unit_label(unit, language)
        budget = MAX_CHUNK_CHARS - len(context) - len(label) - 2
        pieces = _windows(text, budget) if len(text) > budget else [text]
        for index, piece in enumerate(pieces):
            if index and label and not piece.startswith(label):
                piece = f"{label}\n{piece}"
            specs.append(ChunkSpec(unit, paths.get(id(unit), "") if path is None else path,
                                   unit.heading if heading is None else heading,
                                   f"{context}\n{piece}" if context else piece))

    def walk(units, trail):
        run = []

        def flush():
            if not run:
                return
            first, last = run[0], run[-1]
            if first is last:
                emit(first, trail, first.full_text(language))
            else:
                emit(first, trail, "\n".join(u.full_text(language) for u in run), f"{first.number}–{last.number}",
                     trail[-1].heading if trail else "")
            run.clear()

        for unit in units:
            if unit.unit_type in ("clause", "annex") and unit.children:
                flush()
                if unit.lines:
                    emit(unit, trail, "\n".join([unit_label(unit, language), *unit.lines]).strip())
                walk(unit.children, trail + [unit])
                continue
            text = unit.full_text(language)
            if unit.unit_type == "clause" and len(text) <= SHORT_CLAUSE_CHARS:
                if run and sum(len(u.full_text(language)) + 1 for u in run) + len(text) > RUN_CHARS:
                    flush()
                run.append(unit)
                continue
            flush()
            if text.strip():
                emit(unit, trail, text)
        flush()

    walk(tree, [])
    return [spec for spec in specs if spec.text.strip()]
