############################################################
#  [*] corpus.citations — verify a claimed provision
#
#    check_citations(items, user_id=None, use_model=True,
#                    job_step_id=None, raise_on_budget=False)
#        → one verdict per claimed citation (one article each)
#    check_references(items, user_id=None, use_model=True)
#        → one verdict per reference as written — a range or
#          list of articles ("Art. 77–78", "6–9, 26–29, 53")
#          answered by its best article
#
#  A citation is "MiCA Art. 78" plus, optionally, what the
#  claimant says the article is about ("execution of orders on
#  behalf of clients"). The check finds the unit in the
#  current version and has a model (prompt
#  corpus.check_citations) compare the claim with the unit's
#  heading and opening text by MEANING — the claim is often
#  English while the act is Lithuanian, where embedding
#  similarity proved unreliable (correct and wrong pairs
#  scored in the same range). Without the model (gateway down,
#  prompt missing) a same-language word overlap stands in.
#  The verdict stays a signal for the reader: "match" /
#  "mismatch" / "unknown", next to the real heading, a note
#  and an excerpt with a link — and `judgedBy` says which
#  judge gave it ("model" / "overlap").
#
#  Callers: the citation checker route through
#  check_references (the caller's own budget decides
#  use_model; the chat's checkCitations tool uses the same
#  route) and the report pipeline's citation audit, which
#  expands references itself (citation_lookups,
#  series_result), files the judge's calls under its job step
#  and lets a budget refusal fail the step.
############################################################


import difflib
import logging
import re


from compliance.assistant import gateway
from compliance.assistant.llm import run_prompt
from compliance.corpus.links import citation_url
from compliance.corpus.models import LegalUnit
from compliance.corpus.search import resolve_document
from compliance.corpus.standards import find_clause
from compliance.corpus.structure import number_spellings
from compliance.prompts.schemas import FILLED
from compliance.prompts.store import PromptNotConfigured


logger = logging.getLogger(__name__)

MAX_ITEMS = 50
# Article lookups one checker request may make (check_references)
MAX_LOOKUPS = 2 * MAX_ITEMS
EXCERPT_CHARS = 600
WORD = re.compile(r"\w{4,}", re.UNICODE)

JUDGE_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["verdicts"],
    "properties": {"verdicts": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["ref", "verdict", "note"],
        "properties": {"ref": FILLED,
                       "verdict": {"type": "string", "enum": ["match", "mismatch", "unclear"]},
                       "note": FILLED}}}},
}

# A range or list of articles as documents write it ("17–23",
# "28 to 30", "6–9, 26–29, 53"): the audit checks each of its
# articles, at most MAX_SERIES_ARTICLES of them
ARTICLE_LIST_SEPARATOR = re.compile(r"\s*(?:,|;|&|\band\b|\bir\b)\s*", re.IGNORECASE)
ARTICLE_RANGE = re.compile(r"^(\d+)\s*(–|—|-|\bto\b|\biki\b)\s*(\d+)$", re.IGNORECASE)
MAX_SERIES_ARTICLES = 15
# Which found member of a range speaks for it: a match, then
# an undecided claim, then a mismatch
SERIES_RANK = {"match": 0, "unknown": 1, "mismatch": 2}
# An EU-style article written with its paragraph and point
# ("63(2)(a)") when the model left them in the article
ARTICLE_WITH_PARTS = re.compile(r"^(\d+[a-z]?)\((\w+)\)(?:\((\w+)\))?$", re.IGNORECASE)
# Words around a paragraph or point number ("2 dalis",
# "point (b)", "par. 3")
PART_WORDS = re.compile(r"(?i)\b(?:subparagraph|paragraph|para|par|point|pt|dalis|dalies|punktas|punkto)\b\.?"
                        r"|\b[dp]\.(?=\s|$)")








############################################################
# _judge
############################################################
#
# One model call for every claim that can be compared:
# comparisons [(index, claim, heading, opening, label)] →
# {index: (verdict, note)}, or None when the model is
# unavailable (the caller then falls back to the overlap).
# The call is logged against `job_step_id` when one is given,
# so a pipeline step's usage and its report's cost count it.
# With raise_on_budget a 402 (the AI provider's budget is
# used up) is raised instead of swallowed — the report
# pipeline fails such a step like any other model call.
#
# Used by:
#   - check_citations (below)
############################################################

def _judge(comparisons, user_id=None, job_step_id=None, raise_on_budget=False):
    if not comparisons:
        return {}
    blocks = [f'<citation ref="C{i}" unit="{label}">\nClaimed subject: {claim}\nActual heading: {heading or "-"}\n'
              f"Actual text (opening): {opening}\n</citation>"
              for i, (_, claim, heading, opening, label) in enumerate(comparisons, 1)]
    try:
        run = run_prompt("corpus.check_citations", "\n\n".join(blocks), schema=JUDGE_SCHEMA, schema_name="verdicts",
                         user_id=user_id, job_step_id=job_step_id, purpose="citations.check")
    except gateway.GatewayError as exc:
        if raise_on_budget and exc.status == 402:
            raise
        logger.warning("Citation check falls back to word overlap: %s", exc)
        return None
    except PromptNotConfigured as exc:
        logger.warning("Citation check falls back to word overlap: %s", exc)
        return None
    answers = {v.get("ref"): v for v in (run.object or {}).get("verdicts", [])}
    verdicts = {}
    for i, comparison in enumerate(comparisons, 1):
        answer = answers.get(f"C{i}") or {}
        verdict = {"match": "match", "mismatch": "mismatch"}.get(answer.get("verdict"), "unknown")
        verdicts[comparison[0]] = (verdict, str(answer.get("note") or "")[:300])
    return verdicts








############################################################
# _overlap
############################################################
#
# The same-language fallback: the share of the claim's words
# found in the reference, or the string ratio → a verdict.
#
# Used by:
#   - check_citations (below)
############################################################

def _overlap(claim, reference):
    claim_words = {w.lower() for w in WORD.findall(claim)}
    if claim_words:
        score = len(claim_words & {w.lower() for w in WORD.findall(reference)}) / len(claim_words)
    else:
        score = difflib.SequenceMatcher(None, claim.lower(), reference.lower()).ratio()
    return "match" if score >= 0.6 else ("mismatch" if score < 0.2 else "unknown")








############################################################
# _locate
############################################################
#
# The unit an item names in the act's current version:
# article (or annex / point) by number, narrowed to a
# paragraph and then a point when given. Answers (unit,
# article) — the article gives a paragraph its heading. In a
# standard the item's "article" is a clause reference (find_
# clause) and the clause answers both; a list item named as
# its point is not a unit of its own, so the clause stands
# for it.
#
# Used by:
#   - check_citations (below)
############################################################

def _locate(document, item):
    if document.doc_type == "standard":
        unit = find_clause(document.current_version_id, item.get("article"), item.get("paragraph"))
        return (unit, unit) if unit is not None else (None, None)
    numbers = number_spellings(re.sub(r"(?i)^(article|art\.?|straipsnis|str\.?)\s*", "", str(item.get("article") or "")))
    units = LegalUnit.objects.filter(version_id=document.current_version_id, number__in=numbers)
    unit = (units.filter(unit_type="article").first() or units.filter(unit_type="annex").first()
            or units.filter(unit_type="point", depth__lte=2).first())
    if unit is None:
        return None, None
    article = unit
    for key in ("paragraph", "point"):
        value = str(item.get(key) or "").strip().strip("()")
        if value:
            child = LegalUnit.objects.filter(parent=unit, number__in={value, *number_spellings(value)}).first()
            if child is None:
                return None, None
            unit = child
    return unit, article








############################################################
# check_citations
############################################################
#
#   check_citations([{"act": "MiCA", "article": "78", "claimedHeading": "RTO"}])
#     → [{"status": "found", "headingMatch": "mismatch", "heading": "...", "note": "...", ...}]
#
# status: found | not_found (no such unit) | act_not_in_corpus
# headingMatch (found + a claim given): match | mismatch |
# unknown, and judgedBy: model | overlap. One model call
# covers the whole batch (at most MAX_ITEMS items — the rest
# are not checked); with use_model=False (the caller's daily
# budget is spent) the word overlap judges instead, as it does
# when the model is unavailable. job_step_id and
# raise_on_budget go to _judge.
#
# Used by:
#   - corpus/api/views.py — POST /api/corpus/check-citations
#   - analysis/pipeline.py — step_citations (the report's
#     citation audit)
############################################################

def check_citations(items, user_id=None, use_model=True, job_step_id=None, raise_on_budget=False):
    results, comparisons = [], []
    for item in items[:MAX_ITEMS]:
        base = {"act": item.get("act"), "article": item.get("article"), "paragraph": item.get("paragraph"),
                "point": item.get("point"), "claimedHeading": item.get("claimedHeading")}
        document = resolve_document(item.get("act"))
        if document is None:
            results.append({**base, "status": "act_not_in_corpus"})
            continue
        unit, article = _locate(document, item)
        if unit is None:
            results.append({**base, "status": "not_found", "documentId": document.id,
                            "shortTitle": document.short_title or document.title[:60]})
            continue
        heading = unit.heading or article.heading
        opening = unit.text[:EXCERPT_CHARS]
        results.append({**base, "status": "found", "documentId": document.id, "unitId": unit.id,
                        "shortTitle": document.short_title or document.title[:60], "path": unit.path,
                        "heading": heading, "excerpt": opening, "citationUrl": citation_url(document, unit),
                        "headingMatch": "unknown", "note": "", "judgedBy": None})
        claim = str(item.get("claimedHeading") or "").strip()
        if claim:
            label = f"{document.short_title or document.slug} {unit.path}"
            comparisons.append((len(results) - 1, claim[:500], heading, opening, label))


    # One model call judges every claim; the word overlap
    # stands in when the model is unavailable or not allowed
    verdicts = _judge(comparisons, user_id=user_id, job_step_id=job_step_id,
                      raise_on_budget=raise_on_budget) if use_model else None
    for index, claim, heading, opening, _ in comparisons:
        if verdicts is not None:
            results[index]["headingMatch"], results[index]["note"] = verdicts.get(index, ("unknown", ""))
            results[index]["judgedBy"] = "model"
        else:
            results[index]["headingMatch"] = _overlap(claim, f"{heading}\n{opening}")
            results[index]["judgedBy"] = "overlap"
    return results








############################################################
# _part
############################################################
#
#   _part("2 dalis") → "2"   _part("point (b)") → "b"   _part("1 p.") → "1"
#
# A paragraph or point designation as the corpus numbers it:
# the words and brackets around it dropped.
#
# Used by:
#   - citation_lookups (below)
############################################################

def _part(value):
    return PART_WORDS.sub(" ", value or "").strip(" ().")








############################################################
# _articles
############################################################
#
#   _articles("6–9, 26–29, 53") → ["6", "7", "8", "9", "26", "27", "28", "29", "53"]
#   _articles("17 to 23") → ["17", …, "23"]     _articles("12-1") → ["12-1"]
#
# The articles a reference names: a list split at its commas
# (and "and" / "ir"), each range expanded — a hyphen whose
# second number is not larger is the Lithuanian inserted
# article "12-1", kept whole — at most MAX_SERIES_ARTICLES in
# all; anything else stays as written.
#
# Used by:
#   - citation_lookups (below)
############################################################

def _articles(article):
    articles = []
    for part in ARTICLE_LIST_SEPARATOR.split(article):
        span = ARTICLE_RANGE.match(part)
        if span and not (span.group(2) == "-" and int(span.group(3)) <= int(span.group(1))):
            articles += [str(n) for n in range(int(span.group(1)), int(span.group(3)) + 1)]
        elif part:
            articles.append(part)
    return articles[:MAX_SERIES_ARTICLES]








############################################################
# citation_lookups
############################################################
#
#   citation_lookups({"act": "DORA", "article": "Art. 17–19", "claim": "…", …})
#     → [{"act": "DORA", "article": "17", "paragraph": "", "point": "", "claimedHeading": "…"}, … "19"]
#
# One inventory citation → the items check_citations looks
# up, the claim as each one's claimed heading: one per
# article it names (a range or list is judged article by
# article — combined by _series_result — each claim marked
# as one of the articles cited together, so the judge
# accepts an article covering part of the claimed subject),
# with the paragraph and point of a single one. The row
# keeps what the document
# wrote; only the lookup is lenient: an EU article written
# with its parts ("63(2)(a)", paragraph and point empty) is
# split, and the words around an article, paragraph or point
# number ("Art.", "straipsnis", "dalis", "point") are dropped.
#
# Used by:
#   - check_references (below)
#   - analysis/pipeline.py — step_citations
#   - analysis/estimate.py — the lookups a run will judge
############################################################

def citation_lookups(citation):
    article = re.sub(r"(?i)^(?:articles?|arts?\.?|straipsni\w*|str\.)\s*|\s*(?:straipsni\w*|str\.)$", "",
                     citation["article"].strip())
    paragraph, point = _part(citation["paragraph"]), _part(citation["point"])
    articles = _articles(article) or [article]
    if len(articles) > 1:
        claim = f"{citation['claim']} [one of the articles {article} cited together]"
        return [{"act": citation["act"], "article": number, "paragraph": "", "point": "", "claimedHeading": claim}
                for number in articles]
    article = articles[0]
    parts = ARTICLE_WITH_PARTS.match(article)
    if parts and not paragraph and not point:
        article, paragraph, point = parts.group(1), parts.group(2), parts.group(3) or ""
    return [{"act": citation["act"], "article": article, "paragraph": paragraph, "point": point,
             "claimedHeading": citation["claim"]}]








############################################################
# series_result
############################################################
#
# The one answer for a reference from its articles' answers
# (in order): the first found article whose claim matched,
# else one the judge could not decide, else the first found
# one (a mismatch); none found — the first "no such
# provision", else "act not in the corpus". A single article
# is its own answer.
#
# Used by:
#   - check_references (below)
#   - analysis/pipeline.py — step_citations
############################################################

def series_result(results):
    found = [result for result in results if result["status"] == "found"]
    if found:
        return min(found, key=lambda result: SERIES_RANK.get(result.get("headingMatch"), 1))
    return next((result for result in results if result["status"] == "not_found"), results[0])








############################################################
# check_references
############################################################
#
#   check_references([{"act": "MiCA", "article": "77–78", "claimedHeading": "Exchange"}])
#     → [{"act": "MiCA", "article": "77–78", "status": "found", "path": "77 str.", "headingMatch": "match", …}]
#
# The checker route's entry: each reference is looked up as
# the audit looks it up (citation_lookups — a range or list
# article by article, "63(2)(a)" split into its parts) and
# answered once (series_result), echoing what was asked.
# Without it a range read as one article number: "no such
# provision" for every "Art. 77–78" a user or the chat
# checked. At most MAX_LOOKUPS lookups (two judge calls) per
# request — a list of long ranges cannot multiply the cost;
# every reference gets its first article before any range
# gets its others, so each one is answered.
#
# Used by:
#   - corpus/api/views.py — POST /api/corpus/check-citations
############################################################

def check_references(items, user_id=None, use_model=True):
    items = items[:MAX_ITEMS]
    series = [citation_lookups({"act": str(item.get("act") or ""), "article": str(item.get("article") or ""),
                                "paragraph": str(item.get("paragraph") or ""), "point": str(item.get("point") or ""),
                                "claim": str(item.get("claimedHeading") or "")}) for item in items]
    chosen = [members[:1] for members in series]
    room = MAX_LOOKUPS - len(chosen)
    for index, members in enumerate(series):
        extra = members[1:1 + max(0, room)]
        chosen[index] += extra
        room -= len(extra)
    lookups = [(index, lookup) for index, members in enumerate(chosen) for lookup in members]
    answers = {}
    for start in range(0, len(lookups), MAX_ITEMS):
        batch = lookups[start:start + MAX_ITEMS]
        results = check_citations([lookup for _, lookup in batch], user_id=user_id, use_model=use_model)
        for (index, _), result in zip(batch, results):
            answers.setdefault(index, []).append(result)
    asked = ("act", "article", "paragraph", "point", "claimedHeading")
    return [{**series_result(answers[index]), **{key: item.get(key) for key in asked}}
            for index, item in enumerate(items)]
