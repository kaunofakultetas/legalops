############################################################
#  [*] corpus.sources — structural parsers per source format
#
#    eu_xhtml  — CELLAR XHTML (Official Journal, consolidated
#                with ELI markup, old flat consolidated)
#    etar_html — e-tar.lt consolidated / original HTML
#    lb_html   — Bank of Lithuania (lb.lt) pages
#
#  Each module exposes parse_bytes(data) → a dict tree
#  {type, number, heading, text, children, cite, …}; bridge.py
#  turns it into the ingest's ParsedUnit tree. The parsers are
#  standard-library only and import nothing from Django — they
#  run inside the extraction sandbox (common/extract_cli.py).
############################################################


PARSER_NAMES = ("eu_xhtml", "etar_html", "lb_html")
