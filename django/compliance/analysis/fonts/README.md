# Fonts of the report PDF

The faces `analysis/pdf.py` sets the report in. WeasyPrint reads them from
this folder and from nowhere else.

| File | Face |
|---|---|
| `SourceSans3-Regular.ttf`, `-Semibold.ttf`, `-Bold.ttf`, `-Italic.ttf` | Source Sans 3 — body text, tables, labels |
| `SourceSerif4-Regular.ttf`, `-Semibold.ttf` | Source Serif 4 — titles and everything quoted from a law |

Both families are Adobe's, under the SIL Open Font License 1.1
(`OFL-source-sans-3.txt`, `OFL-source-serif-4.txt`).

## How the files were made

They are static instances cut from the variable fonts of the npm packages
`@fontsource-variable/source-sans-3` and `@fontsource-variable/source-serif-4`
(the same packages the web interface uses), with fontTools:

1. each package ships a family as several subset files (Latin, Latin Extended,
   and so on); the Latin and Latin Extended subsets of a style are pinned to
   one weight with `fontTools.varLib.instancer`;
2. the two subsets are merged into one TrueType file with `fontTools.merge`.

One file per face is deliberate: given two subset files of one family,
WeasyPrint drew wrong glyphs for Lithuanian letters. Latin and Latin Extended
cover Lithuanian and English; a report in another script would need its subset
merged in the same way.
