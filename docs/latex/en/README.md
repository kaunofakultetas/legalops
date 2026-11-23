# System documentation (LaTeX)

The full documentation of the Compliance AI Assistant as a book: what the system does, how it
is built, and — at the greatest length — every place a language model is called, what it is
asked, how its answer is checked and where a person decides. It describes the system as
deployed on 16 November 2026.

The finished PDF is `docs/output/en/documentation.pdf`.

## Building

The host needs only Docker. `docs/buildDocs.sh` runs LuaLaTeX (through latexmk) in the
official TeX Live image, in a throwaway container with no network:

```bash
docs/buildDocs.sh       # both editions
docs/buildDocs.sh en    # this one alone → docs/output/en/documentation.pdf
```

The first run pulls `texlive/texlive:latest-full` (about 6 GB). The sources are mounted
read-only, and of what the build writes only the PDF is kept.

## Layout

| Path | What it holds |
|---|---|
| `main.tex` | The class, the order of the chapters, the date and author of the state described |
| `preamble.tex` | Everything the chapters share: fonts (Source Serif 4, Source Sans 3, Source Code Pro — the product's own faces), the brand colours, the inline macros (`\code`, `\file`, `\route`, `\prompt`, `\model`, `\ui`, `\lt`, `\status`), the boxes that mark who acts (`aibox`, `codebox`, `humanbox`, `lessonbox`), the path card of an AI call, the verbatim blocks, the drawing styles |
| `front/` | Title page and "About this document" (how to read the book) |
| `chapters/` | Nineteen chapters in three parts: the system at a glance; artificial intelligence in the system; using and running it |
| `appendices/` | The prompt catalogue, the chat tools, the catalogue of legal acts, configuration, glossary |
| `figures/samples/` | Pages of the system's own PDF exports for the course's sample company |
| `figures/screens/` | Screenshots of the console, made on fake data |

The first line of every chapter file is a status comment (`% STATUS: written`, `verified`,
`generated`). Appendix C is generated from the live database; it is refreshed by exporting
the list of acts again, not edited by hand.

## Conventions for anyone editing it

- The code is the truth: a statement in the book must be checkable in the repository, and
  names, constants and routes are written exactly as the code has them.
- Measurements are dated observations on the sample company, never general claims.
- Every model call has a path card with the same ten rows; a figure marks a model call in
  yellow, a check by code in blue, a person's decision in dark ink.
- No secrets, no personal data, no values from `.env` or `docker-compose.yml`.
- Inline code (`\code`, `\file`, `\model`) keeps spaces and colons; a literal with `#`, `%` or
  braces goes in `\texttt{…}` with the usual escapes.
- Every titled box asks for six lines of room before it starts (a hook in the preamble). A box
  whose first content is a block of code cannot split before that code, so give it room for the
  whole block with `\needspace{N\baselineskip}` (chapter 11 does this once).
