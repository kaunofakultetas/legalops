############################################################
#  [*] sandbox — text extraction in a limited child process
#
#  PDF and DOCX parsers are large C-and-Python attack
#  surfaces: a crafted file can inflate to gigabytes or spin
#  for minutes. Extraction therefore runs in a child Python
#  (common/extract_cli.py) that caps its own memory and CPU,
#  under a wall-clock timeout enforced here. The web process
#  and the worker survive whatever the file does.
############################################################


import json
import logging
import os
import subprocess
import sys


from django.conf import settings


logger = logging.getLogger(__name__)

# Child limits: address space and CPU seconds
CHILD_MEMORY_MB = 1536
CHILD_CPU_S = 120








############################################################
# extract_text_sandboxed
############################################################
#
# Runs the child with the bytes on stdin; a timeout, a crash
# (killed by RLIMIT_CPU / OOM) or unparsable output all come
# back as an error string, never an exception. Answers the
# text and the error (None on success); `pages` keeps the
# pages apart by form feeds (common/extraction.py clean_text).
#
# Used by:
#   - companies/api/document_views.py — every upload
#   - corpus/ingest.py — every fetched or uploaded act, a
#     standard with its pages
############################################################

def extract_text_sandboxed(data, filename=None, mime=None, timeout=90, pages=False):
    answer, error = _run_child([filename or "", mime or ""], data, timeout, ["pages"] if pages else [])
    if error:
        return "", error
    return answer.get("text") or "", answer.get("error")








############################################################
# parse_structure_sandboxed
############################################################
#
# One of the structural parsers (corpus/sources) over the
# publication's markup, in the same limited child — a 13 MB
# consolidated regulation parses in about a second.
#
# Used by:
#   - corpus/ingest.py — the extract step of CELLAR, e-tar
#     and lb.lt publications
############################################################

def parse_structure_sandboxed(data, parser, timeout=180):
    answer, error = _run_child(["--structure", parser], data, timeout)
    if error:
        return None, error
    return answer.get("tree"), answer.get("error")








############################################################
# _run_child
############################################################
#
# Runs extract_cli with the bytes on stdin; a timeout, a
# crash (killed by RLIMIT_CPU / OOM) or unparsable output all
# come back as an error string, never an exception. Answers
# (json answer, error). `extra` arguments follow the limits.
#
# Used by:
#   - extract_text_sandboxed, parse_structure_sandboxed (above)
############################################################

def _run_child(arguments, data, timeout, extra=()):
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "PYTHONPATH": str(settings.ROOT_DIR),
           "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"}
    command = [sys.executable, "-m", "compliance.common.extract_cli", *arguments,
               str(CHILD_MEMORY_MB), str(CHILD_CPU_S), *extra]
    try:
        completed = subprocess.run(command, input=data, capture_output=True, timeout=timeout, env=env,
                                   cwd=str(settings.ROOT_DIR), check=False)
    except subprocess.TimeoutExpired:
        return None, f"Extraction timed out after {timeout} s"
    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", "replace").strip().splitlines()
        logger.warning("Extraction child exited %s: %s", completed.returncode, stderr[-1:] if stderr else "")
        return None, f"Extraction failed (exit {completed.returncode}) — the file is too large or malformed"
    try:
        return json.loads(completed.stdout.decode("utf-8")), None
    except ValueError:
        return None, "Extraction produced no readable output"
