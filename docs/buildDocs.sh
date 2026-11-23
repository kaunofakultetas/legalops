#!/bin/sh
# -----------------------------------------------------------
#  [*] Documentation — build runner
#
#  Builds the book of each edition (en, lt) with LuaLaTeX in
#  a throwaway container with no network. The sources
#  (latex/<edition>) are mounted read-only and what the build
#  writes stays in the container; only the finished PDF comes
#  out, as output/<edition>/documentation.pdf.
#
#    ./buildDocs.sh       — both editions
#    ./buildDocs.sh lt    — one
#
#  Runs may overlap: the container is named per run.
# -----------------------------------------------------------
set -e
cd "$(dirname "$0")"

for edition in ${*:-en lt}; do
  mkdir -p "output/$edition"
  # The output folders of the included files have to exist; a failed run shows the end of its log
  sudo docker run --rm --name "legalops-docs-build-$$" --network none --cpus=4 --memory=6g --memory-swap=6g \
    -v "$PWD/latex/$edition:/doc:ro" -w /doc texlive/texlive:latest-full sh -c '
      mkdir -p /out/chapters /out/appendices
      latexmk -lualatex -interaction=nonstopmode -halt-on-error -outdir=/out main.tex > /out/build.log 2>&1 \
        || { tail -n 40 /out/build.log >&2; exit 1; }
      cat /out/main.pdf' > "output/$edition/documentation.pdf.new"
  mv "output/$edition/documentation.pdf.new" "output/$edition/documentation.pdf"
  echo "Built output/$edition/documentation.pdf"
done
