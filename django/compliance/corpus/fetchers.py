############################################################
#  [*] corpus.fetchers — where an act's bytes come from
#
#  One fetcher per LegalDocument.source_kind:
#
#    cellar  — EU acts from the Publications Office CELLAR:
#              the newest consolidated version in force (SPARQL)
#              negotiated as XHTML in the act's language
#    etar    — Lithuanian acts from e-tar.lt: the edition valid
#              today, as the register's structured HTML
#              ("eseimas" is the legacy name of this kind —
#              e-seimas itself blocks unattended clients)
#    lb      — Bank of Lithuania pages and PDFs on www.lb.lt
#    url     — a plain HTTPS GET of source_url
#    upload  — nothing to fetch: the bytes arrived through
#              POST /api/corpus/documents/{id}/upload
#
#  Every request goes through request(): https on port 443
#  only, checked again on every redirect hop — none of the
#  stack's own services serve that, so a source cannot point
#  the worker at them. At most one request per second per
#  host, size capped. Which hosts are reachable is the
#  network's call, not this module's: the worker resolves only
#  the hosts its extra_hosts pins, and the exit passes only its
#  allowlist.
#
#    fetch_document(document) → FetchResult
############################################################


import html
import json
import re
import threading
import time
from dataclasses import dataclass
from datetime import date
from urllib.parse import quote, urljoin, urlparse


import requests


USER_AGENT = "legalops-corpus/1.0 (+https://knf.vu.lt; legal corpus indexer)"
MAX_BYTES = 60 * 1024 * 1024
TIMEOUT_S = 120
MAX_REDIRECTS = 5
MIN_INTERVAL_S = 1.0

CELLAR = "https://publications.europa.eu"
SPARQL = f"{CELLAR}/webapi/rdf/sparql"
ETAR = "https://www.e-tar.lt"
LANG_CODES = {"lt": "LIT", "en": "ENG"}

# per-host time of the last request (politeness pacing)
_last_request = {}
_pacing_lock = threading.Lock()








############################################################
# FetchError / FetchResult
############################################################
#
# The failure (message shown on the document row) and the
# success: the bytes, how to read them (`parser` names a
# structural parser in corpus/sources, None = plain text
# extraction), where a human reads the same text, and the
# date the text is valid from.
#
# Used by:
#   - every fetcher (below), corpus/ingest.py
############################################################

class FetchError(Exception):
    pass


@dataclass
class FetchResult:
    raw: bytes
    content_type: str
    source_url: str
    filename: str = ""
    effective_date: object = None
    parser: str | None = None
    version_label: str = ""








############################################################
# check_url
############################################################
#
# The URL, normalised to https on port 443, or a FetchError.
# Plain http is upgraded (CELLAR redirects to http:// URLs of
# its own host).
#
# Used by:
#   - request (below), corpus/api/views.py — sourceUrl
############################################################

def check_url(url):
    parsed = urlparse(url or "")
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not host:
        raise FetchError(f"Not a web address: {url!r}")
    if parsed.port not in (None, 443):
        raise FetchError(f"Only the standard HTTPS port is allowed: {url!r}")
    return parsed._replace(scheme="https", netloc=host).geturl()








############################################################
# _pace
############################################################
#
# Waits so one host sees at most one request per
# MIN_INTERVAL_S from this process.
#
# Used by:
#   - request (below)
############################################################

def _pace(host):
    with _pacing_lock:
        wait = _last_request.get(host, 0) + MIN_INTERVAL_S - time.monotonic()
        _last_request[host] = time.monotonic() + max(0, wait)
    if wait > 0:
        time.sleep(wait)








############################################################
# request
############################################################
#
#   request("GET", url, headers={...}) → (status, headers, body, final_url)
#
# Redirects are followed by hand (each hop re-checked), the
# body is read size-capped. Network failures become a
# FetchError naming the host; statuses are the caller's.
#
# Used by:
#   - every network fetcher (below)
############################################################

def request(method, url, headers=None, data=None):
    url = check_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        host = urlparse(url).hostname
        _pace(host)
        try:
            response = requests.request(method, url, headers={"User-Agent": USER_AGENT, **(headers or {})},
                                        data=data, timeout=TIMEOUT_S, stream=True, allow_redirects=False)
        except requests.RequestException as exc:
            raise FetchError(f"Cannot reach {host} ({type(exc).__name__}) — is it on the egress allowlist?") from exc
        with response:
            if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("Location"):
                url = check_url(urljoin(url, response.headers["Location"]))
                if response.status_code == 303:
                    method, data = "GET", None
                continue
            chunks, size = [], 0
            for chunk in response.iter_content(64 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise FetchError(f"{url} is larger than {MAX_BYTES // (1024 * 1024)} MB")
                chunks.append(chunk)
            return response.status_code, response.headers, b"".join(chunks), url
    raise FetchError(f"Too many redirects fetching {url}")








############################################################
# _get_ok
############################################################
#
# A GET that must answer 200.
#
# Used by:
#   - the fetchers (below)
############################################################

def _get_ok(url, headers=None):
    status, response_headers, body, final = request("GET", url, headers)
    if status != 200:
        raise FetchError(f"{urlparse(url).hostname} answered HTTP {status} for {url}")
    return response_headers, body, final








############################################################
# eu_versions
############################################################
#
# The base act and its consolidated versions from the CELLAR
# SPARQL endpoint: [{celex, date, formats: {LIT: [...]}}],
# oldest first.
#
# Used by:
#   - fetch_cellar (below)
############################################################

def eu_versions(celex):
    literal = celex.replace('"', "")
    query = f"""PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?celex ?date ?lang ?mtype WHERE {{
  ?base cdm:resource_legal_id_celex "{literal}"^^xsd:string .
  {{ ?w cdm:resource_legal_id_celex "{literal}"^^xsd:string . }}
  UNION
  {{ ?w cdm:act_consolidated_based_on_resource_legal ?base . }}
  ?w cdm:resource_legal_id_celex ?celex .
  OPTIONAL {{ ?w cdm:act_consolidated_date ?date }}
  OPTIONAL {{
    ?e cdm:expression_belongs_to_work ?w ; cdm:expression_uses_language ?lang .
    FILTER(?lang IN (<http://publications.europa.eu/resource/authority/language/LIT>,
                     <http://publications.europa.eu/resource/authority/language/ENG>))
    ?m cdm:manifestation_manifests_expression ?e ; cdm:manifestation_type ?mtype .
  }}
}}"""
    status, _, body, _ = request("POST", SPARQL, {"Accept": "application/sparql-results+json",
                                                  "Content-Type": "application/x-www-form-urlencoded"},
                                 data={"query": query})
    if status != 200:
        raise FetchError(f"The CELLAR SPARQL endpoint answered HTTP {status}")
    versions = {}
    for binding in json.loads(body)["results"]["bindings"]:
        entry = versions.setdefault(binding["celex"]["value"], {
            "celex": binding["celex"]["value"], "date": (binding.get("date", {}).get("value") or "")[:10] or None,
            "formats": {}})
        if "lang" in binding:
            formats = entry["formats"].setdefault(binding["lang"]["value"].rsplit("/", 1)[1], set())
            formats.add(binding["mtype"]["value"])
    return sorted(versions.values(), key=lambda v: (v["date"] or "", v["celex"]))








############################################################
# pick_eu_version
############################################################
#
# (celex, date) to ingest in a language: the newest
# consolidated version dated on or before `on` that has XHTML
# in that language, else the base act (Official Journal text,
# date None). Future-dated consolidations are skipped.
#
# Used by:
#   - fetch_cellar (below)
############################################################

def pick_eu_version(celex, versions, language_code, on=None):
    on = (on or date.today()).isoformat()
    consolidated = [v for v in versions if v["celex"].startswith("0") and v["date"] and v["date"] <= on
                    and "xhtml" in v["formats"].get(language_code, set())]
    if consolidated:
        return consolidated[-1]["celex"], date.fromisoformat(consolidated[-1]["date"])
    return celex, None








############################################################
# fetch_cellar
############################################################
#
# external_id = the base CELEX ("32023R1114"). The version
# comes from SPARQL; the text is content-negotiated from
# CELLAR, whose 303 answers point at http:// URLs of its own
# host — request() upgrades them to https.
#
# When the version index does not answer, nothing is fetched:
# the act stays as it is and the next check asks again. The
# base act is no substitute — it is the text as first
# published, and taken in an outage it replaced the
# consolidated text in force of fourteen acts with their
# unamended originals (17 November 2026).
#
# Used by:
#   - FETCHERS (below)
############################################################

def fetch_cellar(document):
    celex = (document.external_id or "").strip()
    if not re.match(r"^[0-9][0-9]{4}[A-Z]{1,2}[0-9]{4}", celex):
        raise FetchError(f"externalId must be a CELEX number such as 32023R1114, not {celex!r}")
    language_code = LANG_CODES.get(document.language, "LIT")
    try:
        picked, effective = pick_eu_version(celex, eu_versions(celex), language_code)
    except (KeyError, ValueError) as exc:
        raise FetchError(f"The CELLAR version index answered something unreadable for {celex} "
                         f"({type(exc).__name__})") from exc
    headers = {"Accept": "application/xhtml+xml", "Accept-Language": language_code.lower()}
    status, _, body, final = request("GET", f"{CELLAR}/resource/celex/{quote(picked, safe='')}", headers)
    if status == 404:
        raise FetchError(f"CELLAR has no XHTML of {picked} in {document.language}")
    if status != 200:
        raise FetchError(f"CELLAR answered HTTP {status} for {picked}")
    language = "LT" if document.language == "lt" else "EN"
    return FetchResult(raw=body, content_type="application/xhtml+xml",
                       source_url=f"https://eur-lex.europa.eu/legal-content/{language}/TXT/?uri=CELEX:{picked}",
                       filename=f"{picked}.xhtml", effective_date=effective, parser="eu_xhtml",
                       version_label=picked)








############################################################
# etar_editions
############################################################
#
# The consolidated editions of an e-tar act, newest first:
# [{from, to, edition}] — None when e-tar does not know the
# id (it answers 200 with a "not found" form).
#
# Used by:
#   - fetch_etar (below)
############################################################

def etar_editions(doc_id):
    _, body, _ = _get_ok(f"{ETAR}/portal/lt/legalActEditions/{quote(doc_id, safe='.')}")
    page = body.decode("utf-8", "replace")
    if "legalActNotFoundForm" in page or "Nurodytas teisės aktas nerastas" in page:
        return None
    rows = []
    for row in re.findall(r'<tr data-ri="\d+"[^>]*>(.*?)</tr>', page, flags=re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
        if len(cells) < 2:
            continue
        edition = re.search(r'href="/portal/lt/legalAct/%s/([A-Za-z0-9_]+)"' % re.escape(doc_id), cells[0])
        start = re.search(r"(\d{4}-\d{2}-\d{2})", html.unescape(cells[0]))
        end = re.search(r"(\d{4}-\d{2}-\d{2})", html.unescape(cells[1]))
        if edition:
            rows.append({"from": start.group(1) if start else None, "to": end.group(1) if end else None,
                         "edition": edition.group(1)})
    return rows








############################################################
# fetch_etar
############################################################
#
# external_id = the e-tar document id ("TAR.4A05AB3730DD" or
# a 32-hex id — NOT the e-seimas id). The edition valid today
# (a repealed act: its last edition; an act never
# consolidated: the original text) as the register's
# structured HTML.
#
# Used by:
#   - FETCHERS (below)
############################################################

def fetch_etar(document):
    doc_id = (document.external_id or "").strip()
    if not re.match(r"^(TAR\.[0-9A-F]{12}|[0-9a-f]{32})$", doc_id):
        raise FetchError(f"externalId must be an e-tar document id such as TAR.4A05AB3730DD, not {doc_id!r}")
    editions = etar_editions(doc_id)
    if editions is None:
        raise FetchError(f"e-tar does not know the document {doc_id}")
    today = date.today().isoformat()
    current = next((e for e in editions if e["from"] and e["from"] <= today and (e["to"] is None or e["to"] >= today)),
                   None) or next((e for e in editions if e["from"] and e["from"] <= today), None)
    if current:
        path = f"/rs/actualedition/{doc_id}/{current['edition']}/"
        effective, label = date.fromisoformat(current["from"]), f"{doc_id}/{current['edition']}"
    else:
        path, effective, label = f"/rs/legalact/{doc_id}/", None, doc_id
    _, body, _ = _get_ok(f"{ETAR}{path}")
    if b"legalActNotFoundForm" in body[:200_000]:
        raise FetchError(f"e-tar has no text for {label}")
    return FetchResult(raw=body, content_type="text/html",
                       source_url=f"{ETAR}/portal/lt/legalAct/{doc_id}/asr", filename=f"{doc_id}.html",
                       effective_date=effective, parser="etar_html", version_label=label)








############################################################
# fetch_lb
############################################################
#
# A www.lb.lt page (structured by the lb_html parser; its
# "last update" date becomes the version date and label) or
# PDF (plain text extraction). A PDF carries no label: the
# check for a new version compares its bytes, and then its
# text (corpus/ingest.py).
#
# Used by:
#   - FETCHERS (below)
############################################################

def fetch_lb(document):
    url = document.source_url or ""
    if urlparse(url).hostname not in ("www.lb.lt", "lb.lt"):
        raise FetchError("sourceUrl must be a www.lb.lt address")
    headers, body, final = _get_ok(url.replace("://lb.lt", "://www.lb.lt"))
    if body[:4] == b"%PDF":
        return FetchResult(raw=body, content_type="application/pdf", source_url=final,
                           filename=final.rsplit("/", 1)[-1] or "document.pdf")
    page = body.decode("utf-8", "replace")
    stamp = re.search(r'<div class="last_update">[^<]*?(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})', page)
    updated = None
    if stamp:
        value = stamp.group(1)
        updated = date.fromisoformat(value if value[4] == "-" else f"{value[6:]}-{value[3:5]}-{value[:2]}")
    return FetchResult(raw=body, content_type="text/html", source_url=final, filename="page.html",
                       effective_date=updated, parser="lb_html", version_label=str(updated or ""))








############################################################
# fetch_url
############################################################
#
# source_url as-is (allowlisted https hosts only); the
# filename is guessed from the path so extraction can tell a
# PDF from HTML when the server sends a generic type.
#
# Used by:
#   - FETCHERS (below)
############################################################

def fetch_url(document):
    if not document.source_url:
        raise FetchError("The document has no source URL")
    headers, body, final = _get_ok(document.source_url)
    filename = urlparse(final).path.rsplit("/", 1)[-1] or "document.html"
    if not re.search(r"\.[a-z0-9]{2,5}$", filename.lower()):
        filename += ".pdf" if body[:4] == b"%PDF" else ".html"
    content_type = (headers.get("Content-Type") or "").split(";")[0].strip()
    return FetchResult(raw=body, content_type=content_type, source_url=final, filename=filename)








############################################################
# fetch_upload
############################################################
#
# Uploaded acts are never re-fetched — a refresh of one is a
# no-op the caller reports as such.
#
# Used by:
#   - FETCHERS (below)
############################################################

def fetch_upload(document):
    raise FetchError("This act was uploaded — upload a new file to replace it")


# source_kind → fetcher
FETCHERS = {"cellar": fetch_cellar, "etar": fetch_etar, "eseimas": fetch_etar, "lb": fetch_lb,
            "url": fetch_url, "upload": fetch_upload}








############################################################
# fetch_document
############################################################
#
# Dispatches on the document's source_kind.
#
# Used by:
#   - corpus/ingest.py — the fetch step
############################################################

def fetch_document(document):
    fetcher = FETCHERS.get(document.source_kind)
    if fetcher is None:
        raise FetchError(f"No fetcher for source kind '{document.source_kind}'")
    return fetcher(document)
