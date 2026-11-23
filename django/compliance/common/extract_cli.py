############################################################
#  [*] extract_cli — the sandboxed extraction child
#
#  python3 -m compliance.common.extract_cli <filename> <mime> <mem_mb> <cpu_s> [pages]
#  python3 -m compliance.common.extract_cli --structure <parser> <mem_mb> <cpu_s>
#
#  Reads the file bytes from stdin, caps its own address
#  space and CPU time (RLIMIT_AS / RLIMIT_CPU — set inside the
#  child so the parent never needs preexec_fn, which is unsafe
#  under gunicorn threads), then either extracts the text —
#  printing {"text": ..., "error": ...}, its pages kept apart
#  by form feeds when the last argument is "pages" — or runs
#  one of the
#  structural parsers of corpus/sources on the markup —
#  printing {"tree": ..., "error": ...}. Imports nothing from
#  Django: it must start fast and touch no database.
#
#  Used by:
#    - common/sandbox.py — extract_text_sandboxed
############################################################


import json
import resource
import sys
from importlib import import_module


from compliance.common.extraction import extract_text


PARSERS = ("eu_xhtml", "etar_html", "lb_html")








############################################################
# main
############################################################
#
# The child's whole life: limits, read, extract, print.
#
# Used by:
#   - the __main__ guard (below)
############################################################

def main():
    structure = sys.argv[1] == "--structure"
    first, second, mem_mb, cpu_s = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    resource.setrlimit(resource.RLIMIT_AS, (mem_mb * 1024 * 1024, mem_mb * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s))
    data = sys.stdin.buffer.read()
    if structure:
        if second not in PARSERS:
            sys.stdout.write(json.dumps({"tree": None, "error": f"unknown parser {second}"}))
            return
        try:
            tree, error = import_module(f"compliance.corpus.sources.{second}").parse_bytes(data), None
        except MemoryError:
            tree, error = None, "MemoryError: the document needs more memory than allowed"
        except Exception as exc:
            tree, error = None, f"{type(exc).__name__}: {str(exc)[:300]}"
        sys.stdout.write(json.dumps({"tree": tree, "error": error}, ensure_ascii=False))
        return
    try:
        text, error = extract_text(data, first, second, pages=sys.argv[5:6] == ["pages"])
    except MemoryError:
        text, error = "", "MemoryError: the document needs more memory than allowed"
    sys.stdout.write(json.dumps({"text": text, "error": error}, ensure_ascii=False))


if __name__ == "__main__":
    main()
