############################################################
#  [*] corpus.sanctions — what a breach of an act can cost
#
#    sanction_provisions(act) → the units that lay down sanctions
#    sanction_reading(act, job_step_id=None) → the tiers read, unsaved
#    read_sanctions(acts, job_step_id=None) → how many acts were read
#    Consequences() — every tier of the corpus, ready to be asked
#      .of(document_id, paths) → the tiers that cover a provision
#    job corpus.read_sanctions {document_ids?, again?}
#
#  A finding says what the company lacks. Whoever reads it
#  asks next what that can cost — the lecture's "so what" —
#  and the act itself answers: its sanction provisions say
#  which infringements carry which ceiling and which measures.
#  They are read once per act version into tiers and kept on
#  the version (LegalDocumentVersion.sanctions); a finding is
#  then given the tier that covers its provision by code, with
#  no model call of its own.
#
#  A tier may concern another act: a national law lays down
#  the fines for breaching an EU regulation that leaves them
#  to the Member States. Such a tier is kept with the act it
#  is written in and remembers the act it concerns, so a
#  finding under the regulation is shown the national ceiling.
#
#  A level 2 act — a technical standard adopted under an
#  article of a regulation — lays down no sanction at all: it
#  says in detail what that article requires, and breaching it
#  is breaching the article. The catalogue names the articles
#  each such act was adopted under (adopted_under), and a
#  finding under the standard is shown what those articles of
#  the parent can cost, saying through which article.
#
#  An article is told from its neighbours by its whole number:
#  47-7, inserted after Article 47, and 45a are articles of
#  their own, and a tier that names one covers that article
#  and no other of the same number.
#
#  A sanction article may fine "the infringements referred to
#  in" another article of its act — one that only lists them.
#  That article is read with it, so the tiers name the
#  provisions the list names and not the list.
#
#  A sanction article may bind only some of the persons its
#  act regulates — cash handlers in a law about a central
#  bank, issuers of significant tokens, financial institutions
#  as distinct from other obliged entities — and name no
#  article, or set one ceiling for one kind of person and
#  another for the next for the same articles. The reading
#  says whom such a tier binds (persons),
#  and a finding shown the tier is told so. Where the register
#  addresses obligations to those persons in the tier's own
#  part of the act and nowhere else — a regime closed in one
#  section — the tier is narrowed to those articles; anywhere
#  else it stays a tier for any infringement, because the
#  words of a provision do not tell which kind of person a
#  company is.
#
#  Nothing here is filled in from memory: a ceiling the text
#  does not state stays empty, and an act without sanction
#  provisions is read as having none. The model's calls are
#  shared corpus work, charged to nobody. Without the prompt
#  or the gateway nothing is read and findings carry no
#  consequence, as before.
############################################################


import functools
import logging
import re
from pathlib import Path

import yaml

from compliance.assistant.gateway import GatewayError
from compliance.assistant.llm import run_prompt
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocument, LegalDocumentVersion, LegalUnit, Obligation
from compliance.corpus.search import resolve_document
from compliance.corpus.structure import FROM_SUPERSCRIPT
from compliance.jobs.registry import register
from compliance.prompts.schemas import FILLED
from compliance.prompts.store import PromptNotConfigured


logger = logging.getLogger(__name__)

# The catalogue: where a level 2 act names the provisions it
# was adopted under
CATALOG = Path(__file__).resolve().parent / "catalog.yaml"

# An article number as the corpus and a tier write it: the
# number, a letter (45a), and what an inserted article adds —
# after a hyphen as the register's markup carries it (47-7),
# or raised as the text parser keeps it (47⁷)
NUMBER = re.compile(r"(\d+)([a-z]?)(?:-(\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹]+))?")

# The articles whose heading speaks of sanctions, how many of
# them one reading takes and how much of each
HEADING = re.compile(r"sankcij|baud|nuobaud|poveikio priemon|penalt|sanction|\bfines?\b|administrative measures",
                     re.IGNORECASE)
ARTICLES = 8

# The articles whose heading begins with the infringements —
# a list of them, read with the sanction provisions only when
# one of those sends the reader to it — and how many of them
# a reading takes. A heading that only mentions infringements
# (their reporting, the supervision of their remedies) is no
# list
LISTS = re.compile(r"\s*(pažeidim|infringement|breach)", re.IGNORECASE)
LISTS_READ = 2
READ_CHARS = 14_000
MAX_TIERS = 24

# How many kinds of person one tier may be said to bind, and
# the words that tell no kind of person from another
PERSONS = 6
SMALL = frozenset("ir ar arba bei su be kaip kitas kita kiti kitos kito kitų kitam kitai kitiems kitoms kitą kitus "
                  "and or of the other".split())

# Whom a tier is addressed to, and the measures a provision
# may allow beside a fine
ADDRESSEES = ("legal", "natural", "any")
MEASURES = ("withdrawal", "restriction", "cease", "public_statement", "management_ban", "disgorgement",
            "periodic_penalty", "criminal", "other")

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["tiers", "note"],
    "properties": {
        "tiers": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["provisionRef", "where", "infringedAct", "articles", "all", "condition", "addressee", "persons",
                         "maxFineEur", "maxFinePercent", "benefitMultiple", "measures"],
            "properties": {
                "provisionRef": FILLED,
                "where": {"type": "string"},
                "infringedAct": {"type": "string"},
                # An article ("59", "36a", "36-1") or a range ("64-83") — what _span reads
                "articles": {"type": "array", "items": {"type": "string", "pattern": "^[0-9]+[a-z]?(-[0-9]+[a-z]?)?$"}},
                "all": {"type": "boolean"},
                "condition": {"type": "string"},
                "addressee": {"type": "string", "enum": list(ADDRESSEES)},
                "persons": {"type": "array", "maxItems": PERSONS, "items": FILLED},
                "maxFineEur": {"type": ["number", "null"]},
                "maxFinePercent": {"type": ["number", "null"]},
                "benefitMultiple": {"type": ["number", "null"]},
                "measures": {"type": "array", "items": {"type": "string", "enum": list(MEASURES)}},
            }}},
        "note": {"type": "string"},
    },
}








############################################################
# sanction_provisions
############################################################
#
# The articles of an act's current version whose heading
# speaks of sanctions, fines or measures, in the act's order
# — and with them an article that lists the infringements,
# when one of those cites it by its number: a provision that
# fines "the infringements referred to in Article 29" cannot
# be read without Article 29. An act that has no sanction
# article answers an empty list.
#
# Used by:
#   - sanction_reading (below)
############################################################

def sanction_provisions(act):
    articles = list(LegalUnit.objects.filter(version_id=act.current_version_id, unit_type="article").order_by("ordinal")
                    .only("id", "number", "path", "heading", "text", "ordinal"))
    chosen = [unit for unit in articles if HEADING.search(unit.heading or "")][:ARTICLES]
    read = "\n".join(unit.text[:READ_CHARS] for unit in chosen)
    cited = lambda number: re.search(rf"(?<![\w-]){re.escape(number)}(?: ir \d+)? straipsn"
                                     rf"|\bArticles? {re.escape(number)}(?![\w-])", read)
    lists = [unit for unit in articles if unit not in chosen and LISTS.match(unit.heading or "") and unit.number
             and cited(unit.number)][:LISTS_READ]
    return sorted(chosen + lists, key=lambda unit: unit.ordinal)








############################################################
# _key
############################################################
#
# An article number as something to put in order: its number,
# then the number an inserted article adds to it, then its
# letter. An inserted article stands after the article it was
# inserted behind and before the next one, and is neither of
# them; both spellings of it give the same key. Nothing
# readable answers None.
#
# Used by:
#   - _span, _names, _article (below), Consequences
#   - prompts/evals/suites.py — the article a case asks about
############################################################

def _key(number):
    found = NUMBER.fullmatch(str(number).strip())
    if not found:
        return None
    inserted = found.group(3) or (found.group(4) or "").translate(FROM_SUPERSCRIPT)
    return (int(found.group(1)), int(inserted or 0), found.group(2))








############################################################
# _span
############################################################
#
# An article reference of a tier as the articles it covers:
# the first and the last, each as the reference writes it — a
# single article twice. Read leniently: the word
# "straipsnis", a dash of any kind. Two numbers with a hyphen
# between are a range, unless the act the tier concerns has
# an article of exactly that number (`known`, the keys of its
# articles) or the range would run backwards: then it is one
# inserted article. Nothing readable answers None.
#
# Used by:
#   - sanction_reading (below)
############################################################

def _span(text, known=()):
    text = re.sub(r"(?i)\b(articles?|art\.?|straipsni\w*|str\.?)\b", "", str(text or "")).strip(" .")
    span = re.match(r"^(\d+[a-z]?)\s*(?:–|—|-|to|iki)\s*(\d+[a-z]?)$", text)
    if span and _key(text) not in known and _key(span.group(2)) > _key(span.group(1)):
        return [span.group(1), span.group(2)]
    return [text, text] if _key(text) else None








############################################################
# _names
############################################################
#
# Whether a tier names one of the articles given (their
# keys): an article lies in a span when it stands between the
# span's first and last article, both included. A span of two
# numbers is a reading kept from before article numbers were
# stored whole; it reaches every article of those numbers, as
# it did then.
#
# Used by:
#   - Consequences._of (below)
#   - prompts/evals/suites.py — the sanctions suite
############################################################

def _names(tier, articles):
    spans = [((low, 0, ""), (high, float("inf"), "")) if isinstance(low, int) else (_key(low), _key(high))
             for low, high in tier["articles"]]
    return any(low <= article <= high for low, high in spans for article in articles)








############################################################
# _article
############################################################
#
# The article a citation path belongs to, as its key: the
# first number of the path with what was inserted after it,
# whether the path reads "59 str. 4 d." or "Art. 59(1)". A
# path without a number answers None.
#
# Used by:
#   - Consequences.of (below)
############################################################

def _article(path):
    found = NUMBER.search(str(path or ""))
    return _key(found.group(0)) if found else None








############################################################
# _cut
############################################################
#
# A text kept to a length: whole when it fits, otherwise cut
# back to its last whole word and closed with an ellipsis —
# what a report prints beside a finding never ends in the
# middle of a word.
#
# Used by:
#   - sanction_reading (below)
############################################################

def _cut(text, limit):
    text = str(text or "").strip()
    return text if len(text) <= limit else text[:limit].rsplit(None, 1)[0].rstrip(" ,;:–-") + "…"








############################################################
# sanction_reading
############################################################
#
# Asks the model for the tiers an act's sanction provisions
# lay down and answers the reading as it is kept: every tier
# with the provision it stands in, the act it concerns — the
# act itself, or another one of the corpus the tier names —
# the articles it covers as spans of article numbers, the
# kind of breach it is bound to (if any), whom it addresses,
# its ceilings and its measures; with what read it. A tier
# that states neither a ceiling nor a measure is dropped. A
# tier that names no article keeps the kinds of person the
# model says it binds (persons), when its provision binds
# only some of those the act regulates; naming the article it
# is written in, and no other, is naming none, and so is a
# tier that is a periodic penalty and nothing else: it
# compels what was ordered, whatever was breached. A tier that
# names its articles keeps its persons only beside another
# tier of the same articles that binds other persons: there
# the persons are what tells the two ceilings apart, anywhere
# else the articles already say whose breach it is.
# An act without sanction provisions is read as having no
# tiers without a call. Stores nothing. A missing prompt or a
# failing gateway is the caller's to handle.
#
# Used by:
#   - read_sanctions (below)
#   - prompts/evals/suites.py — the sanctions suite
############################################################

def sanction_reading(act, job_step_id=None, purpose=None):
    provisions = sanction_provisions(act)
    if not provisions:
        return {"tiers": [], "note": "", "provisions": [], "promptVersionId": None, "model": "",
                "readAt": utc_now().isoformat()}
    blocks = "\n".join(f'<provision ref="P{index}" path="{unit.path}" heading="{unit.heading}">\n'
                       f"{unit.text[:READ_CHARS]}\n</provision>" for index, unit in enumerate(provisions, 1))
    run = run_prompt("corpus.sanctions",
                     f'ACT: {act.title} (short title: {act.short_title or "-"}; jurisdiction {act.jurisdiction}; '
                     f"type {act.doc_type})\n\nSANCTION PROVISIONS\n{blocks}",
                     schema=SCHEMA, schema_name="sanctions", job_step_id=job_step_id, purpose=purpose)
    answer = run.object or {}
    by_ref = {f"P{index}": unit for index, unit in enumerate(provisions, 1)}
    number = lambda value: float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else None
    # The articles of an act a tier concerns, as keys: what tells an inserted article from a range
    known = functools.lru_cache(maxsize=None)(lambda version_id: {_key(value) for value in LegalUnit.objects.filter(
        version_id=version_id, unit_type="article").values_list("number", flat=True)} - {None})
    tiers = []
    for tier in answer.get("tiers", [])[:MAX_TIERS]:
        unit = by_ref.get(tier.get("provisionRef"))
        if unit is None:
            continue
        named = str(tier.get("infringedAct") or "").strip()
        own = named.lower() in ("", "this") or named.lower() in ((act.short_title or "").lower(), act.title.lower())
        other = None if own else resolve_document(named)
        named_articles = tier.get("articles") or []
        concerned = act if own else other
        spans = [span for span in (_span(item, known(concerned.current_version_id) if concerned is not None else ())
                                   for item in named_articles) if span]
        # Articles were named and none can be read: the tier is not one "for any breach"
        if named_articles and not spans and not tier.get("all"):
            continue
        # A tier that names the article it is written in, and no other, names nothing: "the breaches
        # listed in this Article" says where they are listed, not which provisions they breach
        here = _key(unit.number)
        if own and spans and all(_key(first) == _key(last) == here for first, last in spans):
            named_articles, spans = [], []
        measures = [code for code in dict.fromkeys(tier.get("measures") or []) if code in MEASURES]
        ceilings = [number(tier.get(key)) for key in ("maxFineEur", "maxFinePercent", "benefitMultiple")]
        if not measures and not any(ceilings):
            continue
        # A periodic penalty compels what the supervisor ordered: an article named with it is the one the
        # order was given under ("the instructions given under Article 33"), not one that was breached
        if measures == ["periodic_penalty"] and not any(ceilings):
            named_articles, spans = [], []
        tiers.append({
            "path": unit.path, "where": str(tier.get("where") or "")[:80],
            "condition": _cut(tier.get("condition"), 200).rstrip("."),
            # The act a tier concerns: this one, another of the corpus, or one the corpus does not hold
            "documentId": act.id if own else (other.id if other is not None else None),
            "infringedAct": "" if own else named[:200],
            "articles": spans, "all": bool(tier.get("all")) or not named_articles,
            "addressee": tier.get("addressee") if tier.get("addressee") in ADDRESSEES else "any",
            "persons": [_cut(person, 200) for person in tier.get("persons") or [] if _words(person)][:PERSONS],
            "maxFineEur": ceilings[0], "maxFinePercent": ceilings[1], "benefitMultiple": ceilings[2],
            "measures": measures})
    # Whom a tier binds matters where it names no article, and where two tiers of the same articles bind
    # different persons; on any other tier that names its articles the persons say nothing the articles do not
    kinds = {}
    for tier in tiers:
        if tier["persons"]:
            kinds.setdefault((tier["documentId"], repr(tier["articles"])), set()).add(tuple(tier["persons"]))
    for tier in tiers:
        if tier["articles"] and len(kinds.get((tier["documentId"], repr(tier["articles"])), ())) < 2:
            tier["persons"] = []
    return {"tiers": tiers, "note": str(answer.get("note") or "")[:1000],
            "provisions": [unit.path for unit in provisions], "promptVersionId": run.version.id,
            "model": run.result.model, "readAt": utc_now().isoformat()}








############################################################
# read_sanctions
############################################################
#
# Reads the sanction provisions of the acts given and keeps
# each reading on the act's current version. Answers how many
# acts were read. A missing prompt or a failing gateway reads
# nothing more and leaves the rest for the next caller.
#
# Used by:
#   - analysis/pipeline.py — step_obligations
#   - management command read_sanctions
############################################################

def read_sanctions(acts, job_step_id=None):
    read = 0
    for act in acts:
        try:
            reading = sanction_reading(act, job_step_id)
        except (PromptNotConfigured, GatewayError) as exc:
            logger.warning("The sanctions of %s were not read: %s", act.short_title or act.title, exc)
            break
        LegalDocumentVersion.objects.filter(id=act.current_version_id).update(sanctions=reading)
        act.current_version.sanctions = reading
        read += 1
    return read








############################################################
# adopted_under
############################################################
#
# The level 2 acts of the catalogue, each with the act and
# the articles it was adopted under: the slug of the act, the
# slug of its parent and the article numbers, as the
# catalogue's adopted_under key gives them. Read once for the
# life of the process; an entry without a parent or without
# articles is left out.
#
# Used by:
#   - Consequences (below)
############################################################

@functools.lru_cache(maxsize=1)
def adopted_under():
    with open(CATALOG, encoding="utf-8") as handle:
        entries = (yaml.safe_load(handle) or {}).get("acts") or []
    links = {}
    for entry in entries:
        link = entry.get("adopted_under") or {}
        articles = tuple(number for number in link.get("articles") or [] if isinstance(number, int) and number > 0)
        if entry.get("slug") and link.get("act") and articles:
            links[entry["slug"]] = (str(link["act"]), articles)
    return links








############################################################
# _words
############################################################
#
# The words of a kind of person or of an obligation's
# addressee that tell it from another: lower case, without
# the small words that join or only say "other".
#
# Used by:
#   - _addressed (below), sanction_reading (above)
############################################################

def _words(text):
    return [word for word in re.findall(r"[^\W_]+", str(text or "").lower()) if len(word) > 1 and word not in SMALL]








############################################################
# _addressed
############################################################
#
# Whether an obligation's addressee names one of the kinds of
# person given: every word of that kind stands in the
# addressee, in whatever grammatical form — two words are the
# same when they begin alike and differ only in a short
# ending, which is how Lithuanian inflects a noun and its
# adjectives. The test runs one way: a kind named with more
# words than the addressee has is not found in it, so a fine
# for the issuers of significant tokens is not tied to duties
# addressed to issuers at large.
#
# Used by:
#   - _narrow (below)
############################################################

def _addressed(persons, addressee):
    def same(one, other):
        shared = next((index for index, (a, b) in enumerate(zip(one, other)) if a != b), min(len(one), len(other)))
        return shared >= min(4, len(one), len(other)) and max(len(one), len(other)) - shared <= 4

    there = _words(addressee)
    return any(words and all(any(same(word, held) for held in there) for word in words)
               for words in map(_words, persons))








############################################################
# _own_part
############################################################
#
# The articles of the part of an act a provision stands in —
# its section or chapter — as keys; None when the act is not
# divided into parts, or when the part is all of it.
#
# Used by:
#   - _narrow (below)
############################################################

def _own_part(version_id, path):
    articles = LegalUnit.objects.filter(version_id=version_id, unit_type="article")
    parent_id = articles.filter(path=path).values_list("parent_id", flat=True).first()
    if parent_id is None or not articles.exclude(parent_id=parent_id).exists():
        return None
    return {_key(number) for number in articles.filter(parent_id=parent_id).values_list("number", flat=True)}








############################################################
# _narrow
############################################################
#
# Narrows a tier of an act that binds only certain persons
# and names no article to the articles whose obligations, in
# the register, are addressed to those persons — when such
# obligations exist and all stand in the tier's own part of
# the act: a regime of its own, closed in one section, whose
# fines are no fines for the rest of the act. `by_document`
# holds, for each act, the tiers that concern it (as
# Consequences gathers them); its tiers are changed in place.
#
# One case only. Persons whose obligations stand in other
# parts too keep their tier for any infringement: an
# obligation is often addressed to a wider or a narrower
# kind of person than the one a fine names (obliged entities,
# financial institutions, crypto-asset service providers),
# and a tier narrowed by the names alone would be taken from
# findings it belongs under.
#
# Used by:
#   - Consequences (below)
#   - prompts/evals/suites.py — the sanctions suite
############################################################

def _narrow(by_document):
    for document_id, tiers in by_document.items():
        bound = [tier for tier in tiers if tier.get("persons") and tier["all"] and tier["own"]]
        if not bound:
            continue
        version_id = LegalDocument.objects.filter(id=document_id).values_list("current_version_id", flat=True).first()
        duties = [(addressee, {found.group(0) for found in (NUMBER.search(str(citation.get("path") or ""))
                                                             for citation in citations or []) if found})
                  for addressee, citations in Obligation.objects.filter(document_id=document_id, version_id=version_id)
                  .exclude(status="rejected").values_list("addressee", "citations")]
        for tier in bound:
            numbers = set().union(*(cited for addressee, cited in duties if _addressed(tier["persons"], addressee)))
            part = _own_part(version_id, tier["path"]) if numbers else None
            if part and all(_key(number) in part for number in numbers):
                tier["articles"], tier["all"] = [[number, number] for number in sorted(numbers, key=_key)], False








############################################################
# Consequences
############################################################
#
# Every tier the corpus has read, gathered once so that a
# report can ask of each finding what a breach of its
# provision can cost: the tiers written in the act itself and
# those another act lays down for it — a tier that binds only
# certain persons narrowed to their own part of the act, where
# their duties stand nowhere else (_narrow).
# Beside them, for every level 2 act of the corpus, the
# parent act and the articles it was adopted under — with the
# citation paths of those articles, as the parent's current
# version prints them.
#
# Used by:
#   - analysis/pipeline.py — step_gap_analysis
############################################################

class Consequences:

    def __init__(self):
        self.by_document = {}
        rows = LegalDocument.objects.filter(enabled=True, current_version__isnull=False,
                                            current_version__sanctions__isnull=False) \
            .values_list("id", "short_title", "title", "current_version__sanctions")
        for document_id, short_title, title, reading in rows:
            for tier in (reading or {}).get("tiers") or []:
                if tier.get("documentId"):
                    self.by_document.setdefault(tier["documentId"], []).append(
                        {**tier, "act": short_title or title, "source": document_id,
                         "own": tier["documentId"] == document_id})
        _narrow(self.by_document)
        self.through = {}
        links = adopted_under()
        acts = {act.slug: act for act in LegalDocument.objects.filter(
            enabled=True, current_version__isnull=False,
            slug__in={*links, *(parent for parent, _ in links.values())})}
        for slug, (parent_slug, articles) in links.items():
            act, parent = acts.get(slug), acts.get(parent_slug)
            if act is None or parent is None:
                continue
            paths = dict(LegalUnit.objects.filter(version_id=parent.current_version_id, unit_type="article",
                                                  number__in=[str(number) for number in articles])
                         .values_list("number", "path"))
            self.through[act.id] = (parent.id, articles, {
                "act": parent.short_title or parent.title,
                "path": ", ".join(paths.get(str(number)) or str(number) for number in articles)})


    ############################################################
    # of
    ############################################################
    #
    # The consequences of breaching the provisions a finding
    # cites (their paths): what the act itself provides, then
    # what one other act provides for it — an act among those
    # that bind the company (`within`: several sector laws set
    # fines for the same regulation, each for its own kind of
    # institution), the one with the higher ceiling. From each
    # act: the ceiling that holds for
    # any breach of the provision (a tier naming its article
    # before one for any infringement, one for whoever
    # breaches the act before one for certain persons, a
    # company's and never a person's), then a higher one the
    # act binds to a kind of breach or to certain persons, said
    # with it; the measures of every tier that covers the
    # provision go with the first. An act nobody read, or one
    # whose sanctions do not reach the article, answers an
    # empty list.
    #
    # A level 2 act has no tier of its own: its findings are
    # answered with what the articles it was adopted under can
    # cost, each entry saying through which act and article
    # (`via`). Adopted under several articles, it gets a
    # consequence only when all of them cost the same — which
    # of them a provision of the standard details is not
    # recorded, and a ceiling is not guessed.
    #
    # Used by:
    #   - analysis/pipeline.py — step_gap_analysis
    ############################################################

    def of(self, document_id, paths, within=None):
        link = self.through.get(document_id)
        if link is not None and document_id not in self.by_document:
            parent_id, articles, via = link
            answers = [self._of(parent_id, {_key(article)}, within) for article in articles]
            if any(answer != answers[0] for answer in answers[1:]):
                return []
            return [{**entry, "via": via} for entry in answers[0]]
        return self._of(document_id, {article for article in map(_article, paths) if article}, within)






    ############################################################
    # _of
    ############################################################
    #
    # What the tiers that concern one act provide for the
    # articles given (their keys), by the rules `of` states.
    #
    # Used by:
    #   - of (above)
    ############################################################

    def _of(self, document_id, articles, within):
        by_act = {}
        for tier in self.by_document.get(document_id, []):
            named = _names(tier, articles)
            reaches = tier["own"] or within is None or tier["source"] in within
            if (named or tier["all"]) and tier["addressee"] != "natural" and reaches:
                by_act.setdefault((not tier["own"], tier["act"]), []).append((named, tier))
        own = [entry for (foreign, _), tiers in by_act.items() if not foreign for entry in _of_act(tiers)]
        others = [_of_act(tiers) for (foreign, _), tiers in sorted(by_act.items()) if foreign]
        other = max(others, key=lambda entries: max(_height(entry) for entry in entries), default=[])
        return own + other








############################################################
# _height
############################################################
#
# How high a tier's ceiling stands, for comparing two: the
# euros, then the share of turnover, then the multiple of the
# benefit.
#
# Used by:
#   - Consequences.of, _of_act
############################################################

def _height(tier):
    return (tier.get("maxFineEur") or 0, tier.get("maxFinePercent") or 0, tier.get("benefitMultiple") or 0)








############################################################
# _of_act
############################################################
#
# What one act provides for a provision, from the tiers of it
# that cover the provision (each with whether it names the
# article): the ceiling for any breach — one for whoever
# breaches the act before one that binds only certain
# persons, and completed from the tiers beside it when its
# provision gives the sum, the share of turnover and the
# multiple of the benefit in separate places — then a higher
# one bound to a kind of breach or, beside a ceiling for
# everyone, to certain persons, and — with the first — the
# measures of every covering tier, saying which other
# provisions they come from.
#
# Used by:
#   - Consequences.of (above)
############################################################

def _of_act(tiers):
    entry = lambda tier: {key: tier.get(key) for key in ("act", "path", "where", "condition", "maxFineEur", "maxFinePercent",
                                                         "benefitMultiple")} \
        | {"persons": list(tier.get("persons") or []), "measures": [], "measuresFrom": []}
    fined = [(named, tier) for named, tier in tiers if any(_height(tier))]
    # A tier for whoever breaches the act goes before one that binds only certain persons, however high
    order = lambda pair: (not pair[0], bool(pair[1].get("persons")), pair[1]["addressee"] != "legal",
                          tuple(-value for value in _height(pair[1])))
    plain = sorted((pair for pair in fined if not pair[1].get("condition")), key=order)
    base, base_named = (plain[0][1], plain[0][0]) if plain else (None, False)
    # One ceiling is often given in separate points — the sum in one, the share of turnover in the next, the
    # multiple of the benefit in a paragraph of its own — and a reading keeps them as one tier or as several.
    # What the base does not state is taken from the other unconditional tiers of its provision that cover
    # the article as closely and bind the same persons, so that either reading shows the same ceiling
    if base is not None:
        beside = [tier for named, tier in plain[1:]
                  if named == base_named and tier["path"] == base["path"] and tier["addressee"] in (base["addressee"], "any")
                  and (tier.get("persons") or []) == (base.get("persons") or [])]
        given = {key: max((tier[key] for tier in beside if tier.get(key)), default=None)
                 for key in ("maxFineEur", "maxFinePercent", "benefitMultiple") if not base.get(key)}
        added = [tier for tier in beside if any(value and tier.get(key) == value for key, value in given.items())]
        if added:
            base = {**base, **{key: value for key, value in given.items() if value},
                    "where": "; ".join(dict.fromkeys(place for place in (base["where"], *(tier["where"] for tier in added)) if place))}
    # Bound to a kind of breach or, beside a ceiling for everyone, to certain persons
    narrower = lambda tier: tier.get("condition") or (tier.get("persons") and base is not None and not base.get("persons"))
    bound = sorted((pair for pair in fined if narrower(pair[1])), key=lambda pair: tuple(-v for v in _height(pair[1])))
    # A graver tier must be as close to the provision as the base: beside a tier
    # that names the article, one for "any infringement" speaks of something else
    graver = next((tier for named, tier in bound
                   if (named or not base_named)
                   and (base is None or tier["maxFineEur"] and tier["maxFineEur"] > (base["maxFineEur"] or 0)
                        or tier["maxFinePercent"] and tier["maxFinePercent"] > (base["maxFinePercent"] or 0))), None)
    entries = [entry(tier) for tier in (base, graver) if tier is not None]
    # "Other measures" alone tells a reader nothing: without a ceiling they make no entry
    with_measures = [tier for _, tier in tiers if tier["measures"] and (entries or tier["measures"] != ["other"])]
    if with_measures:
        if not entries:
            entries.append(entry(max(with_measures, key=lambda tier: len(tier["measures"]))))
        first = entries[0]
        first["measures"] = [code for code in MEASURES if any(code in tier["measures"] for tier in with_measures)]
        here = (first["path"], first["where"])
        first["measuresFrom"] = list(dict.fromkeys(
            f"{tier['path']} {tier['where']}".strip() for tier in with_measures if (tier["path"], tier["where"]) != here))[:3]
    return entries








############################################################
# read_corpus_sanctions
############################################################
#
# The `corpus.read_sanctions` job. Payload: {document_ids?,
# again?}. Reads the acts named — or every enabled act — that
# were never read, or all of them with `again`, one after
# another, saying on the job how far it is. Shared corpus
# work, charged to nobody.
#
# Used by:
#   - corpus/management/commands/read_sanctions.py
############################################################

@register("corpus.read_sanctions", max_attempts=1)
def read_corpus_sanctions(job, ctx):
    rows = LegalDocument.objects.select_related("current_version").filter(current_version__isnull=False) \
        .exclude(doc_type="standard").order_by("jurisdiction", "slug")
    named = job.payload.get("document_ids")
    rows = rows.filter(id__in=named) if named else rows.filter(enabled=True)
    acts = [act for act in rows if job.payload.get("again") or act.current_version.sanctions is None]
    with ctx.step("sanctions", input_ref={"acts": len(acts)}) as step:
        read = tiers = 0
        for index, act in enumerate(acts, 1):
            ctx.check_cancelled()
            ctx.progress("sanctions", int((index - 1) * 100 / len(acts)), act.short_title or act.slug)
            if not read_sanctions([act], step.row.id):
                break
            read += 1
            tiers += len(act.current_version.sanctions["tiers"])
        step.output = {"acts": len(acts), "read": read, "tiers": tiers}
    return step.output

