############################################################
#  [*] corpus.links — where a provision can be read
#
#    citation_url(document, unit=None) → https://…
#
#  EUR-Lex for CELEX-numbered acts, with the article anchor
#  EUR-Lex itself uses (#art_78 — a paragraph or point links
#  to its article); the act's own source page otherwise: the
#  address its catalogue entry gives (lb.lt), or for an act of
#  the register of legal acts, whose entry gives an id and no
#  address, the act's page there — the consolidated edition
#  in force, the page the fetcher records on every version.
#  What the assistant and the report put behind every
#  citation.
############################################################


import re


CELEX = re.compile(r"^[0-9][0-9]{4}[A-Z]{1,2}[0-9]{4}")

# An act's id in the register of legal acts (corpus/fetchers.py — fetch_etar) and its page there
ETAR_ID = re.compile(r"^(TAR\.[0-9A-F]{12}|[0-9a-f]{32})$")
ETAR_PAGE = "https://www.e-tar.lt/portal/lt/legalAct/{}/asr"








############################################################
# citation_url
############################################################
#
# Used by:
#   - corpus/search.py — hits and find_provision
#   - corpus/citations.py — check_citations
#   - analysis/exports.py — citation links in the report
############################################################

def citation_url(document, unit=None):
    external_id = (document.external_id or "").strip()
    if document.jurisdiction == "EU" and CELEX.match(external_id):
        language = "LT" if document.language == "lt" else "EN"
        anchor, depth = "", 0
        while unit is not None and unit.unit_type != "article" and depth < 6:
            unit, depth = unit.parent, depth + 1
        if unit is not None and unit.number:
            anchor = f"#art_{unit.number}"
        return f"https://eur-lex.europa.eu/legal-content/{language}/TXT/?uri=CELEX:{external_id}{anchor}"
    if document.source_url:
        return document.source_url
    if document.source_kind == "etar" and ETAR_ID.match(external_id):
        return ETAR_PAGE.format(external_id)
    return ""
