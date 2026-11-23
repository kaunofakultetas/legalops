############################################################
#  [*] analysis.pdf — the report as a printed document
#
#    render_html(report) → the printable HTML
#    render_pdf(report)  → bytes (WeasyPrint over that HTML)
#
#  The PDF is the document a compliance officer hands to the
#  board, so it reads from the conclusion down: a cover; the
#  contents, down to the numbered sub-headings of the long
#  sections (in the findings, every act), each with its page;
#  the result at a glance (the counts, the open gaps by
#  severity, every act as a row of its own); the executive
#  summary; the action
#  plan; then the material behind them — the company profile
#  the report ran on, the acts and why each applies, the
#  findings, the citation audit of the company's own documents
#  — and the methodology with what each status means and the
#  provenance (prompt versions, models, act versions).
#
#  The result is what binds the company today. An act that
#  starts to apply on a later date is assessed as preparation:
#  its findings stand apart, after the others and under their
#  own counts, and are never added to the result. The acts the
#  report did not assess — applicability still to confirm, a
#  directive behind its national law — are listed with the
#  reason, and the first with the questions to answer.
#
#  The findings are sorted for a reader, not as stored: within
#  an act the gaps come first (the gravest first; at equal
#  severity not met before partly met), each as a card with
#  the obligation, the assessment, the recommendation and the
#  quoted evidence;
#  what could not be evidenced follows as cards too; what is
#  met is a compact table — a report holds hundreds of
#  findings, and a board reads the gaps. Obligations that do
#  not apply are counted, and listed in the workbook only.
#
#  It wears the product's look: the Mozaika mark, ink and sky
#  blue, Source Serif 4 for titles and for everything quoted
#  from a law, Source Sans 3 for the rest (the font files sit
#  beside this module, fonts/), the yellow marker under the
#  evidence quoted from the company's documents.
#
#  Every page but the cover says where the reader is. Above a
#  hairline: the company with its legal form, and the section
#  — in the findings also the act being read. Below one: the
#  mark with the product and the date, and the page number. A
#  finding's card names its act before the provision for the
#  same reason: a card is read on its own, two hundred pages
#  into the section.
#
#  Hardening: the HTML is self-contained. WeasyPrint may read
#  the bundled font files and NOTHING else — a model-written
#  URL must never make the server request it; every text of a
#  model, a document or a user is escaped; the summary's
#  markdown keeps no image and no link that is not https.
############################################################


import re
from html import escape
from pathlib import Path


from compliance.analysis import exports as shared
from compliance.analysis.models import SEVERITIES
from compliance.analysis.serializers import VERDICTS, VERDICT_STAT_KEYS, citation_verdict, effective_status


FONT_DIR = Path(__file__).resolve().parent / "fonts"

# family, style, weight, file — one static file per face
FONT_FACES = (
    ("Source Sans 3", "normal", 400, "SourceSans3-Regular.ttf"),
    ("Source Sans 3", "normal", 600, "SourceSans3-Semibold.ttf"),
    ("Source Sans 3", "normal", 700, "SourceSans3-Bold.ttf"),
    ("Source Sans 3", "italic", 400, "SourceSans3-Italic.ttf"),
    ("Source Serif 4", "normal", 400, "SourceSerif4-Regular.ttf"),
    ("Source Serif 4", "normal", 600, "SourceSerif4-Semibold.ttf"),
)

# The marks a model leaves in its assessment to say which
# passage it read ("[D4#2]", "[C1, D7#3]") — codes of the
# prompt, meaningless on paper, where the evidence quoted
# under the assessment names the document
PASSAGE_REFS = re.compile(r"\s*\[(?:(?:D\d+(?:#\d+)?|C\d+|PROFILE)(?:\s*[,;]\s*)?)+\]")

# The statuses in the order a reader needs them: what is
# wrong first
OPEN = ("missing", "partial")
ASSESSED = ("missing", "partial", "unknown", "met")

# The words the PDF needs beyond the shared label table
TEXT = {
    "lt": {
        "contents": "Turinys", "glance": "Trumpai", "assessed": "Vertinta pareigų", "open": "Atviros spragos",
        "grave": "iš jų kritinio ir aukšto reikšmingumo", "by_severity": "Atviros spragos pagal reikšmingumą",
        "by_act": "Rezultatas pagal teisės aktą", "total": "Iš viso",
        "audit_line": "Įmonės dokumentų nuorodos į teisės aktus: patikrinta {checked}, klaidingų {wrong}.",
        "closes": "Uždaro išvadų: {count}", "documents": "Vertinti dokumentai",
        "assessed_acts": "Taikomi — įvertinti",
        "uncertain_acts": "Taikymas neaiškus — įvertinti", "not_applies_acts": "Įvertinus — netaikomi",
        "chosen_acts": "Neprivalomi — įvertinti įmonės pasirinkimu",
        "chosen_why": ("Šie aktai įmonei neprivalomi: jie skirti kitų rūšių įstaigoms. Ataskaitos apimtį patvirtinęs "
                       "asmuo įtraukė juos kaip gerąją praktiką, todėl jų išvados rodo atotrūkį nuo tos praktikos, "
                       "o ne teisės akto pažeidimą."),
        "left_out_acts": "Taikomi — apimtį tvirtinusio asmens sprendimu nevertinti",
        "left_out_why": ("Šie aktai įmonei taikomi, tačiau ataskaitos apimtį patvirtinęs asmuo jų į šią ataskaitą "
                         "neįtraukė. Jų pareigos nevertintos."),
        "moved": "Nuo ankstesnės ataskaitos ({date}): pašalinta spragų – {closed}, naujų spragų – {new}, vėl atsiradusių – {back}.",
        "own_result": "Įmonės vidaus reikalavimų laikymasis",
        "own_note": ("Vertinta, ar kiti įmonės dokumentai įgyvendina tai, ko reikalauja jos pačios politikos. Tai spragos "
                     "tarp įmonės politikų ir procedūrų, ne teisės aktų pažeidimai; į bendrą rezultatą jos neįskaičiuotos."),
        "applies_from": "taikomas nuo {date}", "upcoming_result": "Vėliau taikomi aktai — pasirengimas",
        "upcoming_note": ("Šie aktai įmonei pradedami taikyti nurodytą dieną. Jų išvados rodo pasirengimą ir į "
                          "rezultatą aukščiau neįskaičiuoti."),
        "unconfirmed_line": ("Teisės aktų, kurie nevertinti, nes jų taikymą dar reikia patvirtinti: {count} "
                             "(klausimai — skyriuje „{section}“)."),
        "upcoming_acts": "Taikomi vėliau — įvertintas pasirengimas",
        "upcoming_why": ("Šie aktai įmonei pradedami taikyti nurodytą dieną. Jų pareigos įvertintos kaip pasirengimas, "
                         "o išvados skaičiuojamos atskirai nuo šiandienos rezultato."),
        "unconfirmed_acts": "Taikymą reikia patvirtinti — nevertinti",
        "unconfirmed_why": ("Ar šie aktai taikomi, priklauso nuo faktų, kurių įmonės profilyje nėra, todėl jų pareigos "
                            "nevertintos. Atsakykite į klausimus ir papildykite profilį — kita ataskaita šiuos aktus "
                            "įvertins arba atmes."),
        "questions": "Atsakytini klausimai",
        "institutional_acts": "Institucijų veiklą ir procedūras nustatantys aktai — atskirai nevertinti",
        "institutional_why": ("Šie aktai nustato priežiūros institucijos uždavinius, įgaliojimus, poveikio priemones ar "
                              "procedūras. Įmonę jie veikia per institucijos sprendimus arba pačios įmonės kreipimusis, "
                              "todėl pagal įmonės dokumentus jų nuostatos atskirai nevertintos."),
        "indirect_acts": "Direktyvos — taikomos per nacionalinę teisę",
        "indirect_why": ("Direktyva įpareigoja valstybes nares; įmonei jos reikalavimai taikomi per ją perkeliančius "
                         "Lietuvos teisės aktus, kurie ir vertinami šioje ataskaitoje. Direktyvų pareigos atskirai "
                         "nevertintos."),
        "screened_why": ("Šių aktų dirbtinis intelektas nevertino: pagal katalogą jie skirti kitų rūšių subjektams, "
                         "o įmonės rūšis — „{kind}“."),
        "to_verify": "Patikrinti", "gaps": "Spragos", "not_evidenced": "Neįrodyta", "met_list": "Įvykdytos pareigos",
        "no_gaps": "Šiame akte spragų nenustatyta.",
        "not_applicable_count": "Įmonei netaikomų pareigų: {count} (jų sąrašas — ataskaitos Excel faile).",
        "all_unreviewed": ("Visas pareigas iš teisės aktų išgavo dirbtinis intelektas, ir žmogus jų dar neperžiūrėjo — "
                           "prieš remdamiesi išvada, sutikrinkite pareigą su nurodyta nuostata."),
        "none_found": "Išvadų nėra.", "generated_by": "Parengė „Atitikties asistentas“ (dirbtinio intelekto sistema)",
        "code": "Įmonės kodas", "product": "Atitikties asistentas", "page": "psl.",
        "employees": "darbuotojų: {count}", "valid_from": "nuo {date}", "valid_to": "iki {date}",
        "method": (
            "Ataskaitą parengė dirbtinio intelekto sistema. Taikomi teisės aktai nustatyti pagal įmonės profilį ir aktų "
            "taikymo srities nuostatas; pareigos išgautos iš indeksuotų oficialių teisės aktų tekstų ir palygintos su "
            "įmonės pateiktais dokumentais, licencijomis ir profilio duomenimis.",
            "Vertinta, ką nustato įmonės dokumentai (kaip tvarka sukurta), o ne kaip ji veikia praktikoje: veikimo "
            "įrodymai (registrai, protokolai, ataskaitos) nevertinti, o kur jie svarbūs, išvadoje nurodyta, ką patikrinti. "
            "Įmonės nurodytos, bet nepatikrintos licencijos pažymėtos atskirai.",
            "Vertinami tik įmonei taikomi teisės aktai. Aktai, kurių taikymas priklauso nuo profilyje nenurodytų faktų, "
            "išvardyti su klausimais ir nevertinti; direktyvos vertinamos per jas perkeliančius nacionalinius teisės "
            "aktus; institucijų veiklą ir procedūras nustatantys aktai atskirai nevertinami; vėliau pradedami taikyti "
            "aktai įvertinti kaip pasirengimas ir skaičiuojami atskirai.",
            "Kiekvieną pareigą modelis vertino perskaitęs visus įmonės pateiktus dokumentus ištisai. Išvados reikšmingumas yra "
            "pačios pareigos svarba (ką reiškia jos nevykdyti), o būsena parodo, kiek įmonė nuo jos nutolusi.",
            "Prie spragos nurodyta pasekmė yra didžiausia sankcija ir poveikio priemonės, kurias už tos nuostatos "
            "pažeidimą numato pats teisės aktas ar jį įgyvendinantis nacionalinis aktas; tai riba, ne prognozė. "
            "Techninis standartas sankcijų nenustato: jo spragos pasekmė yra to reglamento straipsnio, pagal kurį "
            "standartas priimtas, pasekmė, ir tas straipsnis nurodomas. "
            "Priežastį įrašo tik išvadą peržiūrėjęs asmuo: dokumentai parodo, ko trūksta, bet ne kodėl."),
        "statuses_title": "Ką reiškia būsenos",
        "statuses": {
            "met": "Dokumentai nustato visus pareigos elementus arba pareigą įvykdo turima licencija ar profilio faktas.",
            "partial": "Dokumentai pareigą aptaria, bet trūksta konkretaus jos reikalaujamo elemento.",
            "missing": "Šiam klausimui skirtas dokumentas apie pareigą nieko nenustato arba jai prieštarauja.",
            "unknown": ("Iš pateiktos medžiagos spręsti negalima: nepateiktas šį klausimą reglamentuojantis dokumentas "
                        "(arba tas, į kurį nukreipia pateiktasis), arba nei profilis, nei dokumentai nenurodo fakto, "
                        "kurio pareiga reikalauja."),
            "not_applicable": "Pareigos sąlygos įmonei netaikomos."},
        "limits": ("Išvados yra pagalbinės ir negali pakeisti teisininko ar atitikties specialisto vertinimo — kiekvieną "
                   "išvadą patikrinkite pagal nurodytą teisės akto nuostatą."),
    },
    "en": {
        "contents": "Contents", "glance": "At a glance", "assessed": "Obligations assessed", "open": "Open gaps",
        "grave": "of them critical or high", "by_severity": "Open gaps by severity",
        "by_act": "Result by legal act", "total": "Total",
        "audit_line": "References to legal acts in the company's documents: {checked} checked, {wrong} wrong.",
        "closes": "Closes findings: {count}", "documents": "Documents assessed",
        "assessed_acts": "Applicable — assessed",
        "uncertain_acts": "Applicability uncertain — assessed", "not_applies_acts": "Assessed as not applicable",
        "chosen_acts": "Not binding — assessed by the company's choice",
        "chosen_why": ("These acts do not bind the company: they are written for other kinds of institution. The "
                       "person who approved the report's scope took them in as good practice, so their findings "
                       "show a distance from that practice, not a breach of the act."),
        "left_out_acts": "Applicable — left out by the person who approved the scope",
        "left_out_why": ("These acts apply to the company, but the person who approved the report's scope left them "
                         "out of this report. Their obligations were not assessed."),
        "moved": "Since the previous report ({date}): gaps closed – {closed}, new gaps – {new}, went back – {back}.",
        "own_result": "The company's own requirements",
        "own_note": ("Assessed: whether the company's other documents carry out what its own policies require. These are "
                     "gaps between its policies and its procedures, not breaches of law; they are not counted in the "
                     "overall result."),
        "applies_from": "applies from {date}", "upcoming_result": "Acts that apply later — readiness",
        "upcoming_note": ("These acts start to apply to the company on the date shown. Their findings show readiness "
                          "and are not part of the result above."),
        "unconfirmed_line": ("Acts not assessed because their applicability is still to be confirmed: {count} "
                             "(the questions are in “{section}”)."),
        "upcoming_acts": "Applying later — readiness assessed",
        "upcoming_why": ("These acts start to apply to the company on the date shown. Their obligations were assessed "
                         "as preparation, and their findings are counted apart from today's result."),
        "unconfirmed_acts": "Applicability to confirm — not assessed",
        "unconfirmed_why": ("Whether these acts apply depends on facts the company profile does not state, so their "
                            "obligations were not assessed. Answer the questions and complete the profile — the next "
                            "report will assess these acts or leave them out."),
        "questions": "Questions to answer",
        "institutional_acts": "Acts that organise an authority or a procedure — not assessed separately",
        "institutional_why": ("These acts set out a supervisory authority's tasks, powers, sanctions or procedures. They "
                              "reach the company through the authority's decisions or the company's own applications, so "
                              "their provisions were not assessed against the company's documents."),
        "indirect_acts": "Directives — applied through national law",
        "indirect_why": ("A directive binds Member States; its requirements reach the company through the Lithuanian "
                         "acts that transpose it, which this report assesses. The directives' own obligations were not "
                         "assessed separately."),
        "screened_why": ("These acts were not assessed by the model: by the catalogue they address other kinds of "
                         "entity, and the company is recorded as “{kind}”."),
        "to_verify": "To verify", "gaps": "Gaps", "not_evidenced": "Not evidenced", "met_list": "Obligations met",
        "no_gaps": "No gaps were found under this act.",
        "not_applicable_count": "Obligations that do not apply to the company: {count} (listed in the report's Excel file).",
        "all_unreviewed": ("Every obligation was extracted from the acts by artificial intelligence and has not yet been "
                           "reviewed by a person — check an obligation against the cited provision before relying on a finding."),
        "none_found": "No findings.", "generated_by": "Prepared by the Compliance assistant (an AI system)",
        "code": "Company code", "product": "Compliance assistant", "page": "p.",
        "employees": "employees: {count}", "valid_from": "from {date}", "valid_to": "until {date}",
        "method": (
            "This report was produced by an AI system. Applicable acts were determined from the company profile and the "
            "acts' scope provisions; obligations were extracted from the indexed official legal texts and compared with "
            "the company's documents, licences and profile data.",
            "What was assessed is what the company's documents establish (the design of its arrangements), not how they "
            "operate in practice: operating evidence (registers, minutes, reports) was not assessed, and where it matters "
            "a finding says what to verify. Licences the company claimed but nobody verified are marked.",
            "Only acts that apply to the company are assessed. Acts whose applicability depends on facts the profile "
            "does not state are listed with the questions to answer and not assessed; directives are assessed through "
            "the national acts that transpose them; acts that only organise an authority or a procedure are not "
            "assessed separately; acts that start to apply later are assessed as preparation and counted apart.",
            "The model judged every obligation after reading all of the company's documents in full. A finding's "
            "severity is that of the obligation itself (what it means not to fulfil it); its status says how far the "
            "company is from it.",
            "The consequence shown with a gap is the highest sanction and the measures the act itself, or the national "
            "act that implements it, provides for a breach of that provision: a ceiling, not a forecast. A technical "
            "standard lays down no sanction: the consequence of a gap under it is that of the article of the "
            "regulation it was adopted under, and that article is named. The cause is "
            "written only by the person who reviewed the finding: documents show what is missing, not why."),
        "statuses_title": "What the statuses mean",
        "statuses": {
            "met": "The documents establish every element of the obligation, or a licence held or a profile fact fulfils it.",
            "partial": "The documents address the obligation but lack a specific element it requires.",
            "missing": "The document dedicated to the subject is silent about the obligation or contradicts it.",
            "unknown": ("What was provided cannot tell: no document governing the subject was provided (or the one a "
                        "provided document refers to), or neither the profile nor a document states the fact the "
                        "obligation asks for."),
            "not_applicable": "The obligation's conditions do not apply to the company."},
        "limits": ("The conclusions support, but cannot replace, the judgement of a lawyer or compliance professional — "
                   "verify each finding against the cited provision."),
    },
}

# The sections in the order they are printed and numbered
SECTIONS = ("glance", "summary", "actions", "profile", "acts", "findings", "citations", "methodology")

# The legal forms written after a company's name; every other
# form goes before it, as the Lithuanian ones do
TRAILING_FORMS = {"ltd", "limited", "llc", "plc", "inc", "corp", "gmbh", "sa", "bv", "nv", "oy", "oyj", "aps"}

# The longest act name a page's margin repeats
RUNNING_MAX = 60

# The mark: two quarter discs and two squares, the second disc
# always yellow. On the cover's ink the first disc is white
# and the squares sky; on paper, at the foot of every page, it
# is ink and the squares blue.
MARK = ('<svg class="mark" viewBox="0 0 24 24" width="{size}" height="{size}">'
        '<path fill="{disc}" d="M11.5 11.5H0A11.5 11.5 0 0 1 11.5 0Z"/>'
        '<rect x="12.5" y="0" width="11.5" height="11.5" rx="2" fill="{square}"/>'
        '<rect x="0" y="12.5" width="11.5" height="11.5" rx="2" fill="{square}"/>'
        '<path fill="#FFD84A" d="M12.5 12.5H24A11.5 11.5 0 0 1 12.5 24Z"/></svg>')
COVER_MARK = MARK.format(size="22mm", disc="#FFFFFF", square="#8FB1E3")
FOOT_MARK = MARK.format(size="3.4mm", disc="#173A6E", square="#3E6FB0")

CSS = """
  @page { size: A4; margin: 22mm 17mm 20mm 17mm;
          @top-left { content: string(company); font: 8pt "Source Sans 3"; color: #5B6676; vertical-align: bottom;
                      width: 40%; padding-bottom: 1.8mm; margin-bottom: 6mm; border-bottom: 0.5pt solid #A9B3C1; }
          @top-right { content: string(section) string(sub, last); font: 8pt "Source Sans 3"; color: #5B6676;
                       vertical-align: bottom; width: 60%; padding-bottom: 1.8mm; margin-bottom: 6mm;
                       border-bottom: 0.5pt solid #A9B3C1; }
          @bottom-left { content: element(foot); vertical-align: top;
                         width: 60%; padding-top: 1.8mm; margin-top: 6mm; border-top: 0.5pt solid #A9B3C1; }
          @bottom-right { content: counter(page) " / " counter(pages); font: 8pt "Source Sans 3"; color: #5B6676;
                          vertical-align: top; width: 40%; padding-top: 1.8mm; margin-top: 6mm;
                          border-top: 0.5pt solid #A9B3C1; } }
  @page cover { margin: 0; @top-left { content: none } @top-right { content: none }
                @bottom-left { content: none } @bottom-right { content: none } }
  html { font-family: "Source Sans 3", "DejaVu Sans", sans-serif; font-size: 9.5pt; line-height: 1.42; color: #1B2533; }
  body { margin: 0; }
  a { color: #173A6E; text-decoration: none; border-bottom: 0.4pt solid #8FB1E3; }
  p { margin: 0 0 2.2mm; }
  .serif { font-family: "Source Serif 4", "DejaVu Serif", serif; }
  .muted { color: #5B6676; }
  .small { font-size: 8pt; }
  .running { position: running(foot); font: 8pt "Source Sans 3"; color: #5B6676; }
  .running svg { vertical-align: -0.75mm; margin-right: 1.5mm; }

  .cover { page: cover; height: 297mm; position: relative; }
  .cover .band { background: #173A6E; color: #FFFFFF; height: 118mm; padding: 26mm 22mm 0; }
  .cover .kind { font: 600 11pt "Source Sans 3"; color: #DCE6F4; margin-top: 16mm; }
  .cover h1 { font: 600 27pt/1.18 "Source Serif 4"; color: #FFFFFF; margin: 3mm 0 0; }
  .cover .facts { padding: 14mm 22mm 0; font-size: 11pt; }
  .cover .who { font: 600 17pt "Source Serif 4"; color: #173A6E; string-set: company content(); }
  .cover .when { margin-top: 2mm; color: #5B6676; }
  .cover .approval { margin-top: 9mm; padding: 3mm 4mm; border-left: 1.2mm solid #FFD84A; background: #F4F6F9; font-size: 9.5pt; }
  .cover .foot { position: absolute; left: 22mm; right: 22mm; bottom: 16mm; font-size: 8.5pt; color: #5B6676;
                 border-top: 0.5pt solid #DCE1E8; padding-top: 3mm; }

  h2 { font: 600 17pt/1.2 "Source Serif 4"; color: #173A6E; margin: 0 0 4mm; padding-bottom: 1.6mm;
       border-bottom: 1pt solid #173A6E; string-set: section attr(data-title), sub ""; page-break-after: avoid; }
  h2 .no, h3 .no { color: #3E6FB0; margin-right: 0.8mm; }
  section { page-break-before: always; }
  h3 { font: 600 12pt/1.25 "Source Serif 4"; color: #173A6E; margin: 6mm 0 2mm; page-break-after: avoid; }
  h3[data-sub] { string-set: sub attr(data-sub); }
  .act { page-break-before: always; }
  .act > h3:first-child { margin-top: 0; }
  h4 { font: 600 9.5pt "Source Sans 3"; color: #3E6FB0; margin: 4mm 0 1.5mm; page-break-after: avoid; }

  .toc { list-style: none; margin: 0; padding: 0; font-size: 10.5pt; }
  .toc li { margin: 0 0 2.4mm; }
  .toc a { border: 0; color: #1B2533; }
  .toc a::after { content: leader(".") target-counter(attr(href), page); color: #5B6676; }
  .toc .no { color: #3E6FB0; font-weight: 600; margin-right: 0.8mm; }
  .toc ol { list-style: none; margin: 1.8mm 0 3.6mm 6mm; padding: 0; font-size: 9.2pt; }
  .toc ol li { margin: 0 0 1.3mm; }
  .toc ol .no { display: inline-block; min-width: 9mm; margin-right: 0; font-weight: 400; }

  table { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #DCE6F4; color: #173A6E; text-align: left; font-weight: 600; font-size: 8.5pt; padding: 1.6mm 2mm;
       border-bottom: 0.6pt solid #8FB1E3; }
  td { border-bottom: 0.5pt solid #DCE1E8; padding: 1.6mm 2mm; vertical-align: top; font-size: 8.8pt; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total { page-break-before: avoid; }
  tr.total td { font-weight: 600; border-top: 0.6pt solid #8FB1E3; border-bottom: 0; }
  table.facts td:first-child { width: 31%; color: #5B6676; }
  table.statuses td:first-child { width: 24mm; }
  .prose { max-width: 150mm; }

  .chip { display: inline-block; border-radius: 1.2mm; padding: 0.2mm 1.7mm; font-size: 7.8pt; font-weight: 600; white-space: nowrap; }
  .c-met { background: #E4F2E8; color: #1E6B3A; }
  .c-partial { background: #FBEFD5; color: #8A5A00; }
  .c-missing { background: #FBE3E0; color: #A32020; }
  .c-unknown { background: #E9EDF2; color: #4A5568; }
  .c-not_applicable, .c-neutral { background: #EFF1F4; color: #5B6676; }
  .c-match { background: #E4F2E8; color: #1E6B3A; }
  .c-mismatch, .c-not_found { background: #FBE3E0; color: #A32020; }
  .c-act_not_in_corpus { background: #FBEFD5; color: #8A5A00; }
  .sev { font-size: 7.8pt; font-weight: 600; white-space: nowrap; }
  .s-critical { color: #7A1010; } .s-high { color: #A32020; } .s-medium { color: #8A5A00; } .s-low { color: #3E6FB0; }

  .kpis { display: flex; gap: 3mm; margin: 1mm 0 5mm; }
  .kpi { flex: 1; border: 0.5pt solid #DCE1E8; border-radius: 1.5mm; padding: 3mm 3.5mm; }
  .kpi .v { font: 600 21pt/1 "Source Serif 4"; color: #173A6E; }
  .kpi .l { margin-top: 1.5mm; font-size: 8.5pt; color: #5B6676; }
  .kpi.lead { background: #173A6E; border-color: #173A6E; }
  .kpi.lead .v { color: #FFFFFF; } .kpi.lead .l { color: #DCE6F4; }
  .bar { display: flex; height: 3.2mm; border-radius: 1mm; overflow: hidden; background: #EFF1F4; }
  .bar span { display: block; height: 100%; }
  .b-met { background: #4C9A68; } .b-partial { background: #D9A23B; } .b-missing { background: #C44A43; } .b-unknown { background: #A9B3C1; }
  .legend { margin: 1.5mm 0 5mm; font-size: 8.2pt; color: #5B6676; }
  .legend i { display: inline-block; width: 2.4mm; height: 2.4mm; border-radius: 0.6mm; margin: 0 1mm 0 3mm; vertical-align: -0.2mm; }
  .legend i:first-child { margin-left: 0; }
  td.barcell { width: 34mm; vertical-align: middle; }
  .sevs { display: flex; gap: 3mm; margin: 1mm 0 5mm; }
  .sevs div { flex: 1; border-left: 1.1mm solid #A9B3C1; background: #F4F6F9; padding: 1.6mm 3mm; font-size: 8.5pt; color: #5B6676; }
  .sevs b { display: block; font: 600 13pt/1.1 "Source Serif 4"; color: #1B2533; }
  .sevs .f-critical { border-left-color: #7A1010; } .sevs .f-high { border-left-color: #C44A43; }
  .sevs .f-medium { border-left-color: #D9A23B; } .sevs .f-low { border-left-color: #8FB1E3; }

  .summary h1, .summary h2, .summary h3 { font: 600 11pt "Source Sans 3"; color: #173A6E; border: 0; margin: 4mm 0 1.5mm; padding: 0;
                                          string-set: none; }
  .summary ul, .summary ol { margin: 0 0 2.2mm; padding-left: 5mm; }
  .summary li { margin-bottom: 1mm; }

  .action { display: flex; gap: 4mm; padding: 3mm 0; border-bottom: 0.5pt solid #DCE1E8; page-break-inside: avoid; }
  .action > div:last-child { flex: 1; min-width: 0; }
  .action .p { flex: none; width: 9mm; font: 600 16pt/1 "Source Serif 4"; color: #3E6FB0; text-align: right; }
  .action .t { font-weight: 600; font-size: 10pt; }
  .action .m { margin-top: 1.3mm; font-size: 8.2pt; color: #5B6676; }
  .action .m b { color: #1B2533; font-weight: 600; }

  .finding { border: 0.5pt solid #DCE1E8; border-left: 1.1mm solid #A9B3C1; border-radius: 1.2mm; padding: 2.6mm 3.2mm; margin: 2.4mm 0;
             orphans: 3; widows: 3; }
  .finding .top, .finding .title { page-break-after: avoid; }
  .finding .row, .finding .ev { page-break-inside: avoid; }
  .finding.f-critical { border-left-color: #7A1010; } .finding.f-high { border-left-color: #C44A43; }
  .finding.f-medium { border-left-color: #D9A23B; } .finding.f-low { border-left-color: #8FB1E3; }
  .finding .top { display: flex; gap: 2mm; align-items: baseline; font-size: 8.2pt; }
  .finding .cite { margin-left: auto; text-align: right; font-family: "Source Serif 4", serif; color: #173A6E; }
  .finding .title { font-weight: 600; font-size: 10pt; margin: 1.2mm 0 1mm; }
  .finding .law { font-family: "Source Serif 4", serif; color: #3A4658; margin-bottom: 1.6mm; }
  .row { margin-top: 1.1mm; }
  .k { color: #173A6E; font-weight: 600; }
  .ev { margin: 0.8mm 0 0 3mm; font-size: 8.4pt; }
  .q { font-family: "Source Serif 4", serif; background: #FFF0A8; padding: 0 0.6mm; }
  .note { margin-top: 1.4mm; font-size: 8pt; color: #5B6676; }
  .callout { background: #F4F6F9; border-left: 1.2mm solid #FFD84A; padding: 2.4mm 3.2mm; margin: 0 0 4mm; font-size: 8.8pt; }
  td.law { font-family: "Source Serif 4", serif; white-space: nowrap; color: #173A6E; }
"""








############################################################
# _fetcher
############################################################
#
# WeasyPrint's url fetcher for the export: it opens the font
# files that ship beside this module and refuses everything
# else — another file, http(s), a data URI of a hostile text.
# A refused resource is simply left out of the page.
#
# Used by:
#   - render_pdf (below)
############################################################

def _fetcher():
    from weasyprint.urls import URLFetcher

    class FontsOnly(URLFetcher):

        def fetch(self, url, headers=None):
            if url not in {(FONT_DIR / face[3]).as_uri() for face in FONT_FACES}:
                raise ValueError(f"External resources are disabled in exports: {url[:80]}")
            return super().fetch(url, headers)

    return FontsOnly()








############################################################
# _font_css
############################################################
#
# The @font-face rules for the bundled fonts.
#
# Used by:
#   - render_html (below)
############################################################

def _font_css():
    return "".join(f'@font-face {{ font-family: "{family}"; font-style: {style}; font-weight: {weight}; '
                   f'src: url("{(FONT_DIR / name).as_uri()}"); }}\n' for family, style, weight, name in FONT_FACES)








############################################################
# _prose
############################################################
#
# A model's assessment as text for the page: escaped, and
# without its passage marks.
#
# Used by:
#   - _card, _findings (below)
############################################################

def _prose(text):
    return escape(PASSAGE_REFS.sub("", text or ""))








############################################################
# _company_name
############################################################
#
# The company as the cover and the page margins name it: with
# its legal form, as the profile the report ran on records it
# (the company's own record for a report without one). The
# form goes before the name, as Lithuanian forms do, and after
# it for the forms written that way (TRAILING_FORMS). A name
# that already carries the form is left as it is.
#
# Used by:
#   - _cover (below)
############################################################

def _company_name(report):
    name = report.company.name
    form = ((report.profile_snapshot or {}).get("legalForm") or report.company.legal_form or "").strip()
    if not form or re.search(rf"(?<!\w){re.escape(form)}(?!\w)", name, re.IGNORECASE):
        return name
    return f"{name} {form}" if re.sub(r"\W", "", form).casefold() in TRAILING_FORMS else f"{form} {name}"








############################################################
# _sub
############################################################
#
# A numbered sub-heading of a section; the number and the
# title are parted by a real space, so the viewer's bookmark
# panel and copied text read them apart. `place` is the section's
# record — its number, its anchor key and the sub-headings made
# so far — and gains this one, so the contents can list it
# with its page. `aside` is said after the title, quieter, in
# the heading and in the contents alike. `running` is what the
# page margin adds to the section's name from this heading on,
# cut at a word to RUNNING_MAX characters.
#
# Used by:
#   - _acts, _findings, _method (below)
############################################################

def _sub(place, title, aside="", running=""):
    index = len(place["subs"]) + 1
    anchor, number = f'{place["key"]}-{index}', f'{place["number"]}.{index}'
    place["subs"].append((anchor, number, title, aside))
    if len(running) > RUNNING_MAX:
        running = running[:RUNNING_MAX].rsplit(" ", 1)[0] + "…"
    margin = f' data-sub="{escape(" · " + running, quote=True)}"' if running else ""
    note = f' <span class="muted small">— {escape(aside)}</span>' if aside else ""
    return f'<h3 id="{anchor}"{margin}><span class="no">{number}</span> {escape(title)}{note}</h3>'








############################################################
# _provisions
############################################################
#
# The provisions a finding rests on, each a link to its
# official text. The act is named before the first provision
# of every run from the same act, so a card says which act it
# is about without the page around it.
#
# Used by:
#   - _card (below)
############################################################

def _provisions(finding):
    parts, named = [], None
    for cite in finding.citations:
        # A requirement of the company's own is cited by its document, with or without a section
        if not cite.get("path") and finding.source_kind != "internal":
            continue
        act = cite.get("documentTitle") or finding.short_title or finding.document_title
        parts.append(shared._link(cite["path"] if act == named else f'{act} {cite.get("path", "")}'.strip(), cite.get("url")))
        named = act
    return "; ".join(parts)








############################################################
# _chip
############################################################
#
# A status or a verdict as a tinted chip. It says its meaning
# in words; the colour only repeats it.
#
# Used by:
#   - the section builders (below)
############################################################

def _chip(label, kind):
    return f'<span class="chip c-{escape(kind)}">{escape(label)}</span>'








############################################################
# _severity
############################################################
#
# A severity as a coloured word.
#
# Used by:
#   - _card (below)
############################################################

def _severity(L, value):
    return f'<span class="sev s-{escape(value)}">{escape(L.get(value, value))}</span>'








############################################################
# _bar
############################################################
#
# The assessed findings of one act (or of the whole report)
# as one stacked bar: not met, partly met, not evidenced, met.
#
# Used by:
#   - _glance, _result_table (below)
############################################################

def _bar(counts):
    total = sum(counts.get(s, 0) for s in ASSESSED)
    if not total:
        return '<div class="bar"></div>'
    return '<div class="bar">' + "".join(
        f'<span class="b-{s}" style="width:{counts.get(s, 0) * 100 / total:.2f}%"></span>' for s in ASSESSED) + "</div>"








############################################################
# _by_act
############################################################
#
# The findings grouped by their act, as [(act label,
# [finding, …], the date the act applies from)]: the acts in
# force for the company (no date) in the order they first
# appear, then the acts assessed as preparation.
#
# Used by:
#   - render_html (below)
############################################################

def _by_act(findings, acts):
    later = {act.id: act.applies_from for act in acts if act.assessment == "upcoming" and act.applies_from}
    groups = {}
    for finding in findings:
        label = finding.short_title or finding.document_title
        groups.setdefault((later.get(finding.act_id), label), []).append(finding)
    return sorted(((label, rows, day) for (day, label), rows in groups.items()), key=lambda group: group[2] is not None)








############################################################
# _tally
############################################################
#
# Findings counted by their effective status (the assessed
# ones — an obligation that does not apply is not a result),
# and the open gaps among them by severity.
#
# Used by:
#   - _glance (below)
############################################################

def _tally(findings):
    counts = {status: 0 for status in ASSESSED}
    severities = {severity: 0 for severity in SEVERITIES}
    for finding in findings:
        status = effective_status(finding)
        if status in counts:
            counts[status] += 1
            if status in OPEN:
                severities[finding.severity] = severities.get(finding.severity, 0) + 1
    return counts, severities








############################################################
# _result_table
############################################################
#
# Acts as rows of counts — not met, partly met, not
# evidenced, met, the total and the same as a bar — with a
# closing row for `total` when one is given. `rows` holds
# (the act's cell as HTML, its counts).
#
# Used by:
#   - _glance (below)
############################################################

def _result_table(L, T, rows, total=None):
    parts = [f'<table><thead><tr><th>{escape(L["act"])}</th>'
             + "".join(f'<th class="n">{escape(L[s])}</th>' for s in ASSESSED)
             + f'<th class="n">{escape(T["total"])}</th><th></th></tr></thead><tbody>']
    for cell, own in rows:
        parts.append(f'<tr><td class="serif">{cell}</td>' + "".join(f'<td class="n">{own[s]}</td>' for s in ASSESSED)
                     + f'<td class="n">{sum(own.values())}</td><td class="barcell">{_bar(own)}</td></tr>')
    if total is not None:
        parts.append(f'<tr class="total"><td>{escape(T["total"])}</td>'
                     + "".join(f'<td class="n">{total[s]}</td>' for s in ASSESSED)
                     + f'<td class="n">{sum(total.values())}</td><td class="barcell">{_bar(total)}</td></tr>')
    return "".join(parts) + "</tbody></table>"








############################################################
# _cover
############################################################
#
# The first page: the mark and the title on the ink band, the
# company, the date and the sign-off below, and who prepared
# it at the foot. The company's line is also what the other
# pages' top margin repeats.
#
# Used by:
#   - render_html (below)
############################################################

def _cover(L, T, report, issued):
    return (f'<div class="cover"><div class="band">{COVER_MARK}'
            f'<div class="kind">{escape(L["title"])}</div>'
            f'<h1>{escape(report.title or L["title"])}</h1></div>'
            f'<div class="facts"><div class="who">{escape(_company_name(report))}</div>'
            f'<div class="when">{issued}</div>'
            f'<div class="approval">{escape(shared._approval(L, report))}</div></div>'
            f'<div class="foot">{escape(T["generated_by"])}</div></div>')








############################################################
# _contents
############################################################
#
# The contents: every section with its number and its page,
# and under it the sub-headings the section numbered.
#
# Used by:
#   - render_html (below)
############################################################

def _contents(place, titles):
    parts = ['<ol class="toc">']
    for key in SECTIONS:
        subs = "".join(
            f'<li><a href="#{anchor}"><span class="no">{number}</span> {escape(title)}'
            + (f' <span class="muted">— {escape(aside)}</span>' if aside else "") + "</a></li>"
            for anchor, number, title, aside in place[key]["subs"])
        parts.append(f'<li><a href="#{key}"><span class="no">{place[key]["number"]}</span> {escape(titles[key])}</a>'
                     + (f"<ol>{subs}</ol>" if subs else "") + "</li>")
    return "".join(parts) + "</ol>"








############################################################
# _glance
############################################################
#
# The result at a glance: how many obligations were assessed
# and how many gaps are open, the whole as one bar, the open
# gaps by severity and every act as a row — all of it for the
# acts in force. The acts assessed as preparation follow as
# rows of their own, never added to the result; then how many
# acts wait for their applicability to be confirmed, and the
# citation audit in a sentence.
#
# Used by:
#   - render_html (below)
############################################################

def _glance(L, T, report, groups, acts, acts_title):
    stats = report.stats or {}
    current = [(escape(label), _tally(rows)[0]) for label, rows, day in groups if day is None]
    counts, severities = _tally([finding for _, rows, day in groups if day is None for finding in rows])
    assessed = sum(counts.values())
    opened = counts["missing"] + counts["partial"]
    grave = severities.get("critical", 0) + severities.get("high", 0)
    parts = ['<div class="kpis">',
             f'<div class="kpi lead"><div class="v">{opened}</div><div class="l">{escape(T["open"])}</div></div>',
             f'<div class="kpi"><div class="v">{grave}</div><div class="l">{escape(T["grave"])}</div></div>',
             f'<div class="kpi"><div class="v">{counts["unknown"]}</div><div class="l">{escape(L["unknown"])}</div></div>',
             f'<div class="kpi"><div class="v">{counts["met"]}</div><div class="l">{escape(L["met"])}</div></div>',
             f'<div class="kpi"><div class="v">{assessed}</div><div class="l">{escape(T["assessed"])}</div></div></div>',
             _bar(counts),
             '<div class="legend">' + "".join(f'<i class="b-{s}"></i>{escape(L[s])} {counts[s]}' for s in ASSESSED) + "</div>"]
    parts.append(f'<h4>{escape(T["by_severity"])}</h4><div class="sevs">'
                 + "".join(f'<div class="f-{s}"><b>{severities.get(s, 0)}</b>{escape(L[s])}</div>' for s in SEVERITIES) + "</div>")
    parts.append(f'<h4>{escape(T["by_act"])}</h4>'
                 + _result_table(L, T, [(cell, own) for cell, own in current if sum(own.values())], counts))
    later = [(f'{escape(label)} <span class="muted small">{escape(T["applies_from"].format(date=day.isoformat()))}</span>',
              _tally(rows)[0]) for label, rows, day in groups if day is not None]
    if later:
        parts.append(f'<h4>{escape(T["upcoming_result"])}</h4><p class="muted small prose">{escape(T["upcoming_note"])}</p>'
                     + _result_table(L, T, later))
    waiting = sum(1 for act in acts if act.assessment == "unconfirmed")
    if waiting:
        parts.append(f'<p class="muted">{escape(T["unconfirmed_line"].format(count=waiting, section=acts_title))}</p>')
    moved = stats.get("changes")
    if isinstance(moved, dict):
        parts.append(f'<p class="muted">{escape(T["moved"].format(date=moved.get("sinceDate", ""), **{kind: (moved.get(kind) or {}).get("count", 0) for kind in ("closed", "new", "back")}))}</p>')
    audit = stats.get("citations")
    if isinstance(audit, dict) and audit.get("checked"):
        wrong = audit.get("mismatch", 0) + audit.get("notFound", 0)
        parts.append(f'<p class="muted">{escape(T["audit_line"].format(checked=audit.get("checked", 0), wrong=wrong))}</p>')
    return "".join(parts)








############################################################
# _plan
############################################################
#
# The action plan: each action with its priority as a figure,
# what is to be delivered, and who does it, by when, with how
# much effort and how many findings it closes.
#
# Used by:
#   - render_html (below)
############################################################

def _plan(L, T, actions):
    if not actions:
        return f'<p class="muted">{escape(L["none"])}</p>'
    parts = []
    for action in actions:
        facts = [f'<b>{escape(L.get(action.timeframe, action.timeframe))}</b>',
                 f'{escape(L["owner"])}: <b>{escape(action.owner_role or L["none"])}</b>',
                 f'{escape(L["effort"])}: <b>{escape(L.get("effort_" + action.effort, action.effort))}</b>']
        if action.finding_ids:
            facts.append(escape(T["closes"].format(count=len(action.finding_ids))))
        parts.append(f'<div class="action"><div class="p">{action.priority}</div><div>'
                     f'<div class="t">{escape(action.title)}</div><div>{escape(action.description)}</div>'
                     f'<div class="m">{" &nbsp;·&nbsp; ".join(facts)}</div></div></div>')
    return "".join(parts)








############################################################
# _profile
############################################################
#
# The frozen profile the report ran on, and the company's
# licences, permits and registrations with what each rests on:
# verified by a person, or only claimed by the company.
#
# Used by:
#   - render_html (below)
############################################################

def _profile(L, T, report):
    snapshot = report.profile_snapshot or {}
    parts = ['<table class="facts"><tbody>']
    for label, value in shared._profile_rows(L, report):
        parts.append(f"<tr><td>{escape(label)}</td><td>{escape(str(value))}</td></tr>")
    parts.append("</tbody></table>")
    credentials = snapshot.get("credentials") or []
    if credentials:
        parts.append(f'<h3>{escape(L["credentials"])}</h3><table><thead><tr><th>{escape(L["credentials"])}</th>'
                     f'<th>{escape(L["issuer"])}</th><th>{escape(L["number"])}</th><th>{escape(L["validity"])}</th>'
                     f'<th>{escape(L["status"])}</th></tr></thead><tbody>')
        for cred in credentials:
            verified = cred.get("status") == "verified"
            valid = " ".join(T[key].format(date=str(cred[field])[:10]) for key, field in (("valid_from", "validFrom"), ("valid_to", "validTo"))
                             if cred.get(field))
            parts.append(f'<tr><td>{escape(cred.get("name") or "")}</td><td>{escape(cred.get("issuer") or L["none"])}</td>'
                         f'<td>{escape(cred.get("identifier") or L["none"])}</td><td>{escape(valid or L["none"])}</td>'
                         f'<td>{_chip(L["verified"] if verified else L["claimed"], "met" if verified else "partial")}</td></tr>')
        parts.append("</tbody></table>")
    return "".join(parts)








############################################################
# _acts
############################################################
#
# The acts by what the report did with them: those assessed
# (the ones whose applicability stayed uncertain apart —
# assessed because the report's scope named them, or in a
# report made when uncertain acts still were), those assessed
# as preparation with the date they apply from, those waiting
# for facts with the questions to answer, the directives
# behind national law, the acts that organise an authority
# or a procedure, those judged not to apply — each with
# the reasoning and the scope provisions it rests on — and
# those the catalogue screened out before any assessment,
# named only, under one sentence saying why (the stored
# reason of each is the same English sentence). The groups
# are numbered sub-headings of the section; a report whose
# acts all fall into one group shows it without a number, and
# the assessed acts then without a heading at all.
#
# Used by:
#   - render_html (below)
############################################################

def _acts(L, T, report, acts, place):
    judged = [act for act in acts if not act.screened_out]
    screened = [act for act in acts if act.screened_out]
    groups = (
        (T["assessed_acts"], None, [a for a in judged if a.assessment == "assessed" and a.applicability == "applies"]),
        (T["uncertain_acts"], None, [a for a in judged if a.assessment == "assessed" and a.applicability == "uncertain"]),
        (T["chosen_acts"], T["chosen_why"],
         [a for a in judged if a.assessment in ("assessed", "upcoming") and a.applicability == "not_applies"]),
        (T["upcoming_acts"], T["upcoming_why"],
         [a for a in judged if a.assessment == "upcoming" and a.applicability != "not_applies"]),
        (T["unconfirmed_acts"], T["unconfirmed_why"], [a for a in judged if a.assessment == "unconfirmed"]),
        (T["indirect_acts"], T["indirect_why"],
         [a for a in judged if a.assessment == "indirect" and a.doc_type == "directive"]),
        (T["institutional_acts"], T["institutional_why"],
         [a for a in judged if a.assessment == "indirect" and a.doc_type != "directive"]),
        (T["left_out_acts"], T["left_out_why"],
         [a for a in judged if a.assessment == "none" and a.applicability == "applies"]),
        (T["not_applies_acts"], None, [a for a in judged if a.assessment == "none" and a.applicability != "applies"]),
    )
    numbered = sum(1 for _, _, group in groups if group) + bool(screened) > 1
    parts = []
    for position, (heading, why, group) in enumerate(groups):
        if not group:
            continue
        if numbered:
            parts.append(_sub(place, heading))
        elif position:
            parts.append(f"<h3>{escape(heading)}</h3>")
        if why:
            parts.append(f'<p class="prose muted">{escape(why)}</p>')
        parts.append(f'<table><thead><tr><th style="width:27%">{escape(L["act"])}</th><th style="width:15%">{escape(L["applicability"])}</th>'
                     f'<th>{escape(L["reasoning"])}</th></tr></thead><tbody>')
        for act in group:
            cites = ", ".join(escape(c.get("path", "")) for c in act.citations if c.get("path"))
            kind = f' <span class="muted">({escape(L["standard"])})</span>' if act.doc_type == "standard" else ""
            chip = {"applies": "met", "uncertain": "partial", "not_applies": "neutral"}[act.applicability]
            # The date an act applies from says more than a confidence;
            # a number beside "uncertain" reads as its opposite, and a
            # standard applies by adoption, not by a model's judgement
            if act.assessment == "upcoming" and act.applies_from:
                sure = f'<br><span class="muted small">{escape(T["applies_from"].format(date=act.applies_from.isoformat()))}</span>'
            elif act.applicability != "uncertain" and act.doc_type != "standard":
                sure = f'<br><span class="muted small">{escape(L["confidence"])} {act.confidence:.0%}</span>'
            else:
                sure = ""
            ask = T["questions"] if act.assessment == "unconfirmed" else T["to_verify"]
            parts.append(
                f'<tr><td><span class="serif"><b>{shared._link(act.short_title or act.document_title, act.source_url)}</b></span>{kind}'
                f'<br><span class="muted small">{escape(act.document_title)}</span></td>'
                f'<td>{_chip(L[act.applicability], chip)}{sure}</td>'
                f'<td>{escape(act.reasoning)}'
                + (f'<div class="note serif">{cites}</div>' if cites else "")
                + (f'<div class="note"><span class="k">{escape(ask)}:</span> {escape(act.conditions_to_verify)}</div>'
                   if act.conditions_to_verify else "") + "</td></tr>")
        parts.append("</tbody></table>")
    if screened:
        kind = (report.profile_snapshot or {}).get("institutionType")
        parts.append((_sub(place, L["screened"]) if numbered else f'<h3>{escape(L["screened"])}</h3>')
                     + f'<p class="prose muted">{escape(T["screened_why"].format(kind=L["institutions"].get(kind, kind or L["none"])))}</p>'
                     '<table class="facts"><tbody>')
        for act in screened:
            parts.append(f'<tr><td class="serif">{escape(act.short_title)}</td><td class="muted">{escape(act.document_title)}</td></tr>'
                         if act.short_title else f'<tr><td class="serif" colspan="2">{escape(act.document_title)}</td></tr>')
        parts.append("</tbody></table>")
    return "".join(parts) or f'<p class="muted">{escape(L["none"])}</p>'








############################################################
# _card
############################################################
#
# One finding in full: status, severity and the provisions it
# rests on, under their act's name; the obligation in the
# law's voice; the assessment, the cause a reviewer wrote,
# what a breach can cost (for a gap), the recommendation,
# the deadline, the quoted evidence, a reviewer's note. `mark_unreviewed` adds the line that its
# obligation was not reviewed by a person — only in a report
# where some were.
#
# Used by:
#   - _findings (below)
############################################################

def _card(L, finding, mark_unreviewed):
    status = effective_status(finding)
    rows = [f'<div class="row"><span class="k">{escape(L["analysis"])}:</span> {_prose(finding.analysis)}</div>']
    # Why, in the reviewer's words; and what a breach can cost — for a gap, not for what is met
    if finding.cause:
        rows.append(f'<div class="row"><span class="k">{escape(L["cause"])}:</span> {_prose(finding.cause)}</div>')
    cost = shared.gap_consequence(L, finding)
    if cost:
        rows.append(f'<div class="row"><span class="k">{escape(L["consequence"])}:</span> {escape(cost)}</div>')
    if finding.recommendation:
        rows.append(f'<div class="row"><span class="k">{escape(L["recommendation"])}:</span> {_prose(finding.recommendation)}</div>')
    if finding.deadline:
        rows.append(f'<div class="row"><span class="k">{escape(L["deadline"])}:</span> {escape(finding.deadline)}</div>')
    evidence = [e for e in finding.evidence if e.get("quote")]
    if evidence:
        rows.append(f'<div class="row"><span class="k">{escape(L["evidence"])}:</span></div>' + "".join(
            f'<div class="ev">{escape(e.get("title", ""))}: <span class="q">„{escape(e["quote"])}“</span></div>' for e in evidence))
    if finding.override_status or finding.reviewer_note:
        rows.append(f'<div class="note"><span class="k">{escape(L["note"])}:</span> {escape(finding.reviewer_note)} '
                    f'({escape(L["reviewed"])})</div>')
    # A requirement of the company's own has no register to be reviewed in: its criterion is quoted on the card
    if mark_unreviewed and not finding.obligation_reviewed and finding.source_kind != "internal":
        rows.append(f'<div class="note">{escape(L["unreviewed"])}</div>')
    return (f'<div class="finding f-{escape(finding.severity)}"><div class="top">{_chip(L[status], status)} {_severity(L, finding.severity)}'
            f'<span class="cite">{_provisions(finding)}</span></div>'
            f'<div class="title">{escape(finding.obligation_title)}</div>'
            f'<div class="law">{escape(finding.obligation_text)}</div>{"".join(rows)}</div>')








############################################################
# _findings
############################################################
#
# The findings act by act, each act a numbered sub-heading
# that the contents list and the page margin names. Every act
# after the first starts a page, so the act in the margin is
# the act of everything on the page — the rows of a table of
# met obligations name their provision only. Under each act:
# its gaps as cards
# (not met before partly met, the gravest first), what could
# not be evidenced as cards, what is met as a table of
# obligation, provision and assessment, and how many
# obligations do not apply. The acts assessed as preparation
# come last, after a note saying what they are, each named
# with the date it applies from. A report whose obligations
# nobody reviewed says so once, at the top, instead of on
# every card.
#
# Used by:
#   - render_html (below)
############################################################

def _findings(L, T, groups, place, own=None):
    every = [finding for _, findings, _ in groups for finding in findings]
    if not every:
        return f'<p class="muted">{escape(T["none_found"])}</p>'
    reviewed = sum(1 for finding in every if finding.obligation_reviewed)
    parts = [f'<div class="callout">{escape(T["all_unreviewed"])}</div>'] if reviewed == 0 else []
    gravity = {value: index for index, value in enumerate(SEVERITIES)}
    first_later = next((position for position, group in enumerate(groups) if group[2] is not None), None)
    for position, (label, findings, day) in enumerate(groups):
        by_status = {}
        for finding in findings:
            by_status.setdefault(effective_status(finding), []).append(finding)
        parts.append('<div class="act">' if position else "<div>")
        if position == first_later:
            parts.append(f'<h3>{escape(T["upcoming_result"])}</h3><div class="callout">{escape(T["upcoming_note"])}</div>')
        if own is not None and label == own:
            parts.append(f'<h3>{escape(T["own_result"])}</h3><div class="callout">{escape(T["own_note"])}</div>')
        parts.append(_sub(place, label, T["applies_from"].format(date=day.isoformat()) if day else "", running=label))
        gaps = sorted(by_status.get("missing", []) + by_status.get("partial", []),
                      key=lambda f: (gravity.get(f.severity, 9), OPEN.index(effective_status(f))))
        parts.append(f'<h4>{escape(T["gaps"])} ({len(gaps)})</h4>')
        parts.append("".join(_card(L, finding, reviewed > 0) for finding in gaps) or f'<p class="muted">{escape(T["no_gaps"])}</p>')
        unknown = sorted(by_status.get("unknown", []), key=lambda f: gravity.get(f.severity, 9))
        if unknown:
            parts.append(f'<h4>{escape(T["not_evidenced"])} ({len(unknown)})</h4>' + "".join(_card(L, finding, reviewed > 0) for finding in unknown))
        met = by_status.get("met", [])
        if met:
            parts.append(f'<h4>{escape(T["met_list"])} ({len(met)})</h4><table><thead><tr><th style="width:30%">{escape(L["obligation"])}</th>'
                         f'<th style="width:17%">{escape(L["citation"])}</th><th>{escape(L["analysis"])}</th></tr></thead><tbody>')
            for finding in met:
                cites = "; ".join(shared._link(c.get("path", ""), c.get("url")) for c in finding.citations if c.get("path"))
                parts.append(f'<tr><td>{escape(finding.obligation_title)}</td><td class="law">{cites}</td>'
                             f'<td>{_prose(finding.analysis)}</td></tr>')
            parts.append("</tbody></table>")
        skipped = len(by_status.get("not_applicable", []))
        if skipped:
            parts.append(f'<p class="muted small">{escape(T["not_applicable_count"].format(count=skipped))}</p>')
        parts.append("</div>")
    return "".join(parts)








############################################################
# _citations
############################################################
#
# The citation audit: what was checked, the verdicts counted,
# and every reference — the problems first, as stored — with
# what the document cites and claims, the verdict, and the
# provision that is really there. A report from before the
# audit says it was not run; one whose documents cite nothing
# says that.
#
# Used by:
#   - render_html (below)
############################################################

def _citations(L, report, citations):
    audit = (report.stats or {}).get("citations")
    if not isinstance(audit, dict):
        return f'<p class="muted">{escape(L["citations_not_run"])}</p>'
    if not citations:
        return f'<p class="prose">{escape(L["citations_intro"])}</p><p class="muted">{escape(L["citations_none"])}</p>'
    parts = [f'<p class="prose">{escape(L["citations_intro"])}</p><div class="kpis">',
             f'<div class="kpi"><div class="v">{audit.get("checked", len(citations))}</div><div class="l">{escape(L["checked"])}</div></div>']
    parts += [f'<div class="kpi"><div class="v">{audit.get(VERDICT_STAT_KEYS[verdict], 0)}</div>'
              f'<div class="l">{escape(L["citation_" + verdict])}</div></div>' for verdict in VERDICTS]
    parts.append(f'</div><table><thead><tr><th style="width:17%">{escape(L["document"])}</th><th style="width:22%">{escape(L["cited_as"])}</th>'
                 f'<th>{escape(L["claim"])}</th><th style="width:14%">{escape(L["verdict"])}</th>'
                 f'<th style="width:22%">{escape(L["actual"])}</th></tr></thead><tbody>')
    for citation in citations:
        verdict = citation_verdict(citation.status, citation.heading_match)
        actual = ""
        if citation.status == "found":
            actual = (f'<span class="serif">{shared._link(f"{citation.short_title} {citation.unit_path}", citation.citation_url)}</span>'
                      + (f"<br>{escape(citation.heading)}" if citation.heading else "")
                      + (f'<div class="note">{escape(citation.note)}</div>' if citation.note else "")
                      + (f'<div class="note">{escape(L["judged_by"])}: {escape(L["judge_overlap"])}</div>' if citation.judged_by == "overlap" else ""))
        quote = f'<div class="ev" style="margin-left:0"><span class="q">„{escape(citation.quote)}“</span></div>' if citation.quote else ""
        parts.append(f'<tr><td>{escape(citation.document_title)}</td>'
                     f'<td><b class="serif">{escape(shared._cited_as(report.language, citation))}</b>{quote}</td>'
                     f'<td>{escape(citation.claim)}</td>'
                     f'<td>{_chip(L["citation_" + verdict], verdict)}</td><td>{actual}</td></tr>')
    parts.append("</tbody></table>")
    return "".join(parts)








############################################################
# _method
############################################################
#
# How the report was made and what it cannot tell, what each
# status means (the definitions the gap analysis is instructed
# with — the two are kept in step), then the provenance: when
# it was generated, who approved the list of acts it assesses,
# how many findings rest on obligations a
# person approved, which prompt version and model ran each
# step, which version of each act was read. The last two are
# numbered sub-headings of the section.
#
# Used by:
#   - render_html (below)
############################################################

def _method(L, T, report, findings, place):
    stats = report.stats or {}
    provenance = stats.get("provenance") or {}
    # A model is stored as "provider:model"; the reader needs the model
    prompts = "<br>".join(escape(f"{p['slug']} v{p['version']}" + (f" — {p['model'].split(':', 1)[-1]}" if p.get("model") else ""))
                          for p in provenance.get("prompts", []))
    corpus = "<br>".join(escape(f"{c['act']} — v{c['versionNo']} ({c['versionDate']})") for c in provenance.get("corpus", []))
    rows = [(L["generated"], f"{report.finished_at or report.created_at:%Y-%m-%d %H:%M} UTC"),
            (L["scope_approved"], escape(shared._scope_approval(L, report))),
            (L["reviewed_obligations"], f"{stats.get('reviewedObligations', 0)} / {len(findings)}"),
            (L["prompts"], prompts or escape(L["none"])),
            (L["models"], escape(", ".join(model.split(":", 1)[-1] for model in provenance.get("models", []))) or escape(L["none"])),
            (L["corpus"], f'<span class="serif">{corpus}</span>' if corpus else escape(L["none"]))]
    statuses = "".join(f'<tr><td>{_chip(L[status], status)}</td><td>{escape(meaning)}</td></tr>' for status, meaning in T["statuses"].items())
    return ("".join(f'<p class="prose">{escape(paragraph)}</p>' for paragraph in T["method"])
            + f'<div class="callout prose">{escape(T["limits"])}</div>'
            + _sub(place, T["statuses_title"]) + f'<table class="facts statuses"><tbody>{statuses}</tbody></table>'
            + _sub(place, L["provenance"]) + '<table class="facts"><tbody>'
            + "".join(f"<tr><td>{escape(label)}</td><td>{value}</td></tr>" for label, value in rows) + "</tbody></table>")








############################################################
# render_html
############################################################
#
# The printable HTML the PDF is made from: the line the foot
# of every page repeats, the cover, the contents, then the
# numbered sections (SECTIONS), each starting a page and named
# in the page's margin.
#
# Used by:
#   - render_pdf (below)
#   - tests — the export's content, without rendering it
############################################################

def render_html(report):
    L, acts, findings, actions, citations = shared._data(report)
    T = TEXT.get(report.language, TEXT["lt"])
    # The company's own requirements stand apart from the acts: their row is no act, their
    # findings a last group of their own, their counts a table beside the result
    own_act = next((act for act in acts if act.doc_type == "internal"), None)
    own = [finding for finding in findings if finding.source_kind == "internal"]
    acts = [act for act in acts if act.doc_type != "internal"]
    findings = [finding for finding in findings if finding.source_kind != "internal"]
    own_label = (own_act.short_title or own_act.document_title) if own_act is not None else None
    own_group = [(own_label, own, None)] if own else []
    groups = _by_act(findings, acts)
    has_standard = any(act.doc_type == "standard" for act in acts)
    acts_title = L["acts_and_standards"] if has_standard else L["acts"]
    issued = f"{report.finished_at or report.created_at:%Y-%m-%d}"
    place = {key: {"key": key, "number": number, "subs": []} for number, key in enumerate(SECTIONS, 1)}
    titles = {"glance": T["glance"], "summary": L["summary"], "actions": L["actions"], "profile": L["profile"],
              "acts": acts_title, "findings": L["findings"], "citations": L["citations"], "methodology": L["methodology"]}
    bodies = {
        "glance": _glance(L, T, report, groups, acts, acts_title) + (
            f'<h4>{escape(T["own_result"])}</h4><p class="muted small prose">{escape(T["own_note"])}</p>'
            + _result_table(L, T, [(escape(own_label), _tally(own)[0])]) if own else ""),
        "summary": f'<div class="summary">{shared._markdown(report.summary)}</div>',
        "actions": _plan(L, T, actions),
        "profile": _profile(L, T, report),
        "acts": _acts(L, T, report, acts, place["acts"]) + (
            f'<h3>{escape(own_act.document_title)}</h3><p class="prose muted">{escape(own_act.reasoning)}</p>'
            if own_act is not None else ""),
        "findings": _findings(L, T, groups + own_group, place["findings"], own_label),
        "citations": _citations(L, report, citations),
        "methodology": _method(L, T, report, findings, place["methodology"]),
    }
    parts = [f'<html lang="{escape(report.language)}"><head><meta charset="utf-8"><title>{escape(report.title or L["title"])}</title>'
             f"<style>{_font_css()}{CSS}</style></head><body>",
             f'<div class="running">{FOOT_MARK}{escape(T["product"])} · {issued}</div>',
             _cover(L, T, report, issued),
             f'<section><h2 data-title="{escape(T["contents"], quote=True)}">{escape(T["contents"])}</h2>'
             f"{_contents(place, titles)}</section>"]
    for key in SECTIONS:
        parts.append(f'<section id="{key}"><h2 data-title="{escape(titles[key], quote=True)}"><span class="no">{place[key]["number"]}</span> '
                     f"{escape(titles[key])}</h2>{bodies[key]}</section>")
    parts.append("</body></html>")
    return "".join(parts)








############################################################
# render_pdf
############################################################
#
# The HTML through WeasyPrint, which may read the bundled
# fonts and nothing else.
#
# Used by:
#   - analysis/api/views.py — export_report
############################################################

def render_pdf(report):
    from weasyprint import HTML
    return HTML(string=render_html(report), url_fetcher=_fetcher(), base_url=None).write_pdf()
