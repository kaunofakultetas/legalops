############################################################
#  [*] programme.exports — a work product as a file
#
#    FORMATS — kind → the formats it is exported in
#    render_html(product) → the product as the PDF's HTML
#    render_pdf(product) → bytes
#    render_docx(product) → bytes (the compliance policy)
#    render_xlsx(product) → bytes (the risk register)
#
#  The PDF is the product as it is handed over: a cover saying
#  whether a person approved it, then the product itself, then
#  the rules of its kind as it met or broke them and what it
#  was made from. It wears the report's page furniture and
#  faces (analysis/pdf.py — the stylesheet, the fonts, the
#  mark), so a company's report and its programme read as one
#  set. The structure of a governance product is the chart
#  drawn by programme/chart.py, and the wide tables — the
#  RACI matrix, the register — stand on landscape pages.
#
#  A compliance policy also comes as a Word file, because a
#  board edits a policy before adopting it; a risk register
#  also as a workbook, because a register is kept. Every text
#  is escaped, nothing is fetched, and no workbook cell
#  becomes a formula.
############################################################


import io
import re
from html import escape
from types import SimpleNamespace

from compliance.analysis import pdf as report_pdf
from compliance.analysis.exports import _link
from compliance.programme import governance, policy, risks
from compliance.programme.chart import structure_svg


FORMATS = {"policy": ("pdf", "docx"), "governance": ("pdf",), "risks": ("pdf", "xlsx")}
TITLES = {"policy": policy.TITLE, "governance": governance.TITLE, "risks": risks.TITLE}
# The landscape page's content box in millimetres (under the section's
# heading), the largest a chart's pixel is drawn, and the RACI matrix's
# step column and header height
WIDE_W, WIDE_H, CHART_SCALE, STEP_W, ROLE_H = 263, 146, 0.30, 62, 46

# The three typologies a scenario is placed in beside its type
# of legal risk — what the risk comes from, what it costs,
# what it threatens: the scenario's field, then the keys of
# its label and of its names in TEXT
TYPOLOGIES = (("sourceType", "source_type", "source_types"), ("consequenceType", "consequence_type", "consequence_types"),
              ("objectiveType", "objective_type", "objective_types"))

TEXT = {
    "lt": {
        "product": "Atitikties asistentas", "draft": "Projektas — žmogaus dar nepatvirtintas",
        "approved": "Patvirtino", "generated_by": "Parengta Atitikties asistento; išvados yra pagalbinės ir negali pakeisti atitikties specialisto ar teisininko vertinimo.",
        "contents": "Turinys", "version": "versija", "sources": "Remiasi", "basis": "Teisinis pagrindas",
        "decisions": "Sprendžia valdymo organas", "hierarchy": "Dokumentų hierarchija", "missing": "Trūkstami dokumentai",
        "level": "Lygmuo", "document": "Dokumentas", "topic": "Tema", "note": "Pastaba", "title": "Pavadinimas",
        "purpose": "Paskirtis", "priority": "Prioritetas", "covered": "Iš dalies apima", "supports": "Politikos dalis",
        "levels": {0: "ne taisyklė", 1: "1 — politika", 2: "2 — teminė politika", 3: "3 — procedūra"},
        "priorities": {"high": "aukštas", "medium": "vidutinis", "low": "žemas"},
        "positions": "Dokumentuose įvardytos pareigybės ir padaliniai", "position": "Pareigybė ar padalinys",
        "unit": "Padalinys", "line": "Linija", "duties": "Atsako už", "gaps": "Trūkstamos rolės ir funkcijos",
        "structure": "Siūloma valdymo struktūra", "structure_notes": "Pastabos dėl struktūros",
        "process": "Atitikties valdymo procesas", "step": "Etapas", "what": "Kas daroma", "frequency": "Periodiškumas",
        "rests_on": "Pagrindas", "raci": "RACI matrica",
        "raci_key": "R — vykdo, A — atskaitingas, AR — vykdo ir atskaitingas, C — konsultuojamas, I — informuojamas",
        "lines": {"governing": "valdymo organas", "first": "pirmoji", "second": "antroji", "third": "trečioji", "external": "išorė"},
        "likelihood": "Tikimybės kriterijai", "impact": "Poveikio kriterijai", "calibration": "Kaip kriterijai pritaikyti",
        "matrix": "Rizikos matrica ir apetitas", "scenarios": "Rizikos scenarijai", "register": "Teisinės rizikos registras",
        "band": "Rizikos lygis", "score": "Balas", "meaning": "Ką tai reiškia", "decision": "Kas sprendžia",
        "responses_allowed": "Reagavimo būdai", "area": "Veiklos sritis", "scenario": "Rizikos scenarijus ir tipologija",
        "legal": "Teisinis pagrindas ir išvada", "internal": "Vidaus išvada", "external": "Išorės išvada",
        "plan": "Veiksmų planas", "owner": "Atsakingas / terminas", "policies": "Vidaus politikos",
        "t": "T", "p": "P", "likelihood_axis": "TIKIMYBĖ", "impact_axis": "POVEIKIS",
        "dimensions": {"control": "Vidaus kontrolė ir kompetencija", "clarity": "Teisinis aiškumas ir priežiūros praktika",
                       "counterparty": "Kontrahentų ir trečiųjų šalių patikimumas", "frequency": "Dažnumas ir tikimybė laike",
                       "financial": "Finansinis poveikis", "regulatory": "Teisinis, priežiūrinis ir licencinis poveikis",
                       "reputation": "Reputacija ir nematerialusis turtas", "reach": "Skvarba, mastas ir domino efektas"},
        "responses": {"accept": "Priimti", "increase": "Didinti", "mitigate": "Mažinti", "transfer": "Perkelti / dalytis", "avoid": "Vengti"},
        "source_type": "Šaltinio rūšis", "consequence_type": "Pasekmių rūšis", "objective_type": "Saugomo tikslo rūšis",
        "source_types": {1: "Reguliavimo ir teisėkūros institucijos", 2: "Sutartiniai partneriai ir tiekėjai",
                         3: "Klientai ir vartotojų bendruomenės", 4: "Išoriniai piktybiniai veikėjai",
                         5: "Organizacijos valdysena, personalas ir kultūra",
                         6: "Vidiniai procesai, kontrolės sistemos ir IT architektūra"},
        "consequence_types": {1: "Tiesioginės finansinės pasekmės", 2: "Priežiūros ir licencinės pasekmės",
                              3: "Reputacinės ir rinkos pasekmės", 4: "Operacinės ir verslo tęstinumo pasekmės",
                              5: "Organizacinio ir geografinio masto pasekmės"},
        "objective_types": {1: "Teisinės atitikties ir licenciniai tikslai", 2: "Strateginiai ir verslo plėtros tikslai",
                            3: "Finansinio stabilumo, kapitalo ir likvidumo tikslai",
                            4: "Operacinio atsparumo ir veiklos tęstinumo tikslai", 5: "Reputaciniai, pasitikėjimo ir ESG tikslai"},
        "checks": "Patikros ir kilmė", "rule": "Taisyklė", "result": "Rezultatas", "kept": "laikomasi", "broken": "pažeista",
        "warning": "pastaba", "made_from": "Parengta remiantis", "report_of": "atitikties ataskaita", "documents_read": "įmonės dokumentai",
        "prompts": "DI instrukcijos ir modeliai", "none": "—",
        "rules": {
            "parts": "Parašytos visos aštuonios politikos dalys", "provisions": "Nurodyti straipsniai yra teisės aktuose",
            "provisions_unverified": "Nurodyti teisės aktai yra teisės aktų bazėje", "provision_subjects": "Nurodytos nuostatos reglamentuoja tai, kam jos priskirtos",
            "quotes": "Citatos rastos nurodytuose dokumentuose", "hierarchy": "Visi įmonės dokumentai priskirti lygmeniui",
            "structure": "Struktūra yra medis su valdymo organu viršuje", "independence": "Antroji linija nepavaldi pirmajai, vidaus auditas pavaldus tik valdymo organui",
            "process": "Procesą sudaro bent penki etapai", "raci_accountable": "Kiekvienas etapas turi lygiai vieną atskaitingą (A)",
            "raci_responsible": "Kiekvienas etapas turi bent vieną vykdytoją (R)", "raci_everywhere": "Nė viena rolė nedalyvauja kiekviename etape",
            "raci_heavy": "Nė viena rolė nėra atskaitinga už daugiau kaip pusę etapų", "process_basis": "Kiekvienas etapas remiasi žinomu ISO 37301 punktu ar LB gairių punktu",
            "criteria": "Kriterijų lentelės, rizikos apetitas ir kriterijų pritaikymo paaiškinimas užpildyti", "scenarios": "Yra bent penki rizikos scenarijai",
            "categories": "Scenarijai apima bent keturias teisinės rizikos rūšis", "sentence": "Kiekvienas scenarijus turi visas keturias sakinio dalis",
            "ties": "Kiekvienas scenarijus susietas su padaliniu ir vidaus politika", "scores": "Visi vertinimai yra skalėje nuo 1 iki 5",
            "owners": "Kiekvienas scenarijus turi atsakingą asmenį ir terminą", "response_fit": "Reagavimo būdas atitinka rizikos lygį",
            "sentence_form": "Scenarijaus sakinys atitinka nustatytą formą"},
    },
    "en": {
        "product": "Compliance assistant", "draft": "Draft — not yet approved by a person",
        "approved": "Approved by", "generated_by": "Prepared by the Compliance assistant; its conclusions support, but cannot replace, the judgement of a compliance professional or a lawyer.",
        "contents": "Contents", "version": "version", "sources": "Rests on", "basis": "Legal basis",
        "decisions": "For the governing body to decide", "hierarchy": "Document hierarchy", "missing": "Missing documents",
        "level": "Level", "document": "Document", "topic": "Topic", "note": "Note", "title": "Title",
        "purpose": "Purpose", "priority": "Priority", "covered": "Partly covered by", "supports": "Policy part",
        "levels": {0: "not a rule", 1: "1 — policy", 2: "2 — thematic policy", 3: "3 — procedure"},
        "priorities": {"high": "high", "medium": "medium", "low": "low"},
        "positions": "Positions and units the documents name", "position": "Position or unit",
        "unit": "Unit", "line": "Line", "duties": "Answers for", "gaps": "Missing roles and functions",
        "structure": "Proposed governance structure", "structure_notes": "Notes on the structure",
        "process": "Compliance management process", "step": "Step", "what": "What is done", "frequency": "Frequency",
        "rests_on": "Basis", "raci": "RACI matrix",
        "raci_key": "R — responsible, A — accountable, AR — both, C — consulted, I — informed",
        "lines": {"governing": "governing body", "first": "first", "second": "second", "third": "third", "external": "external"},
        "likelihood": "Likelihood criteria", "impact": "Impact criteria", "calibration": "How the criteria were fitted",
        "matrix": "Risk matrix and appetite", "scenarios": "Risk scenarios", "register": "Legal risk register",
        "band": "Risk level", "score": "Score", "meaning": "What it means", "decision": "Who decides",
        "responses_allowed": "Responses", "area": "Area of activity", "scenario": "Risk scenario and type",
        "legal": "Legal basis and conclusion", "internal": "Internal conclusion", "external": "External conclusion",
        "plan": "Treatment plan", "owner": "Owner / deadline", "policies": "Internal policies",
        "t": "L", "p": "I", "likelihood_axis": "LIKELIHOOD", "impact_axis": "IMPACT",
        "dimensions": {"control": "Internal control and competence", "clarity": "Legal clarity and supervisory practice",
                       "counterparty": "Reliability of counterparties and third parties", "frequency": "Frequency and probability over time",
                       "financial": "Financial impact", "regulatory": "Legal, supervisory and licence impact",
                       "reputation": "Reputation and intangible assets", "reach": "Reach, scale and domino effects"},
        "responses": {"accept": "Accept", "increase": "Increase", "mitigate": "Mitigate", "transfer": "Transfer / share", "avoid": "Avoid"},
        "source_type": "Type of source", "consequence_type": "Type of consequences", "objective_type": "Type of protected objective",
        "source_types": {1: "Regulators and legislators", 2: "Contractual partners and suppliers",
                         3: "Clients and consumer communities", 4: "External malicious actors",
                         5: "Governance, staff and culture", 6: "Internal processes, control systems and IT architecture"},
        "consequence_types": {1: "Direct financial", 2: "Supervisory and licence", 3: "Reputational and market",
                              4: "Operational and business continuity", 5: "Organisational and geographic scale"},
        "objective_types": {1: "Legal compliance and licence", 2: "Strategy and business development",
                            3: "Financial stability, capital and liquidity", 4: "Operational resilience and continuity",
                            5: "Reputation, trust and ESG"},
        "checks": "Checks and provenance", "rule": "Rule", "result": "Result", "kept": "kept", "broken": "broken",
        "warning": "note", "made_from": "Made from", "report_of": "compliance report", "documents_read": "company documents",
        "prompts": "AI instructions and models", "none": "—",
        "rules": {
            "parts": "All eight parts of the policy are written", "provisions": "The articles named are in their acts",
            "provisions_unverified": "The acts named are in the legal corpus", "provision_subjects": "The provisions named regulate what they are named for",
            "quotes": "The quotes stand in the documents they name", "hierarchy": "Every document of the company is placed on a level",
            "structure": "The structure is a tree under a governing body", "independence": "The second line is not under the first; internal audit reports to a governing body alone",
            "process": "The process has at least five steps", "raci_accountable": "Every step has exactly one accountable role (A)",
            "raci_responsible": "Every step has at least one responsible role (R)", "raci_everywhere": "No role takes part in every step",
            "raci_heavy": "No role is accountable for more than half of the steps", "process_basis": "Every step rests on a known clause of ISO 37301 or paragraph of the guidelines",
            "criteria": "The criteria tables, the risk appetite and how they were fitted are filled in", "scenarios": "There are at least five risk scenarios",
            "categories": "The scenarios cover at least four types of legal risk", "sentence": "Every scenario has all four parts of its sentence",
            "ties": "Every scenario is tied to a unit and an internal policy", "scores": "Every score is on the scale of 1 to 5",
            "owners": "Every scenario has an owner and a deadline", "response_fit": "The response fits the risk level",
            "sentence_form": "The scenario's sentence keeps the set form"},
    },
}

# What the product pages add to the report's stylesheet: the
# landscape page, the policy's reading measure, the matrix
CSS = """
  @page wide { size: A4 landscape; }
  .wide { page: wide; }
  .part p { max-width: 150mm; margin: 0 0 2.6mm; }
  .decision { background: #FFF9DB; }
  table.grid { width: 100%; border-collapse: collapse; font-size: 8pt; }
  table.grid th { text-align: left; font-weight: 600; color: #5B6676; border-bottom: 0.8pt solid #173A6E; padding: 1.2mm 1.4mm; vertical-align: bottom; }
  table.grid td { border-bottom: 0.4pt solid #D5DBE4; padding: 1.2mm 1.4mm; vertical-align: top; }
  table.grid td { font-size: 8pt; }
  table.grid td.c, table.grid th.c { text-align: center; }
  table.register { table-layout: fixed; }
  table.register td, table.register th { font-size: 7.4pt; padding: 1mm 1.2mm; }
  table.register tr { page-break-inside: auto; }
  table.register .note { margin-top: 0.8mm; font-size: 7pt; }
  table.raci { table-layout: fixed; }
  table.raci th.step { width: 62mm; vertical-align: bottom; }
  table.raci th.role { height: 46mm; padding: 0 0 1.2mm; vertical-align: bottom; overflow: visible; }
  table.raci th.role div { width: 44mm; line-height: 3mm; font-size: 7.4pt; text-align: left; overflow: hidden;
                           transform-origin: 0 100%; }
  table.raci td { padding: 1.2mm 0.6mm; }
  table.raci td:first-child { padding-left: 1.4mm; }
  table.raci td.c { font-weight: 700; }
  table.raci td.a { background: #173A6E; color: #FFFFFF; }
  table.raci td.r { background: #C9D9EF; }
  table.heat { border-collapse: separate; border-spacing: 0.8mm; font-size: 8pt; margin: 2mm 0 4mm; }
  table.heat td { width: 25mm; height: 15mm; text-align: center; vertical-align: middle; border-radius: 1mm; }
  table.heat th { font-weight: 600; color: #5B6676; font-size: 7.6pt; padding: 0 1.5mm; }
  table.heat .n { font-weight: 700; font-size: 9pt; }
  .b-negligible { background: #EEF3FA; } .b-tolerable { background: #C9D9EF; } .b-medium { background: #8FB1E3; }
  .b-high { background: #3E6FB0; color: #FFFFFF; } .b-critical { background: #173A6E; color: #FFFFFF; }
  .scenario { border: 0.5pt solid #D5DBE4; border-radius: 1.2mm; padding: 2.6mm 3.2mm; margin: 0 0 3mm; page-break-inside: avoid; }
  .scenario .id { font: 600 8pt "Source Sans 3"; color: #3E6FB0; }
  .scenario .s { font: 10.4pt "Source Serif 4"; margin: 0.8mm 0 1.6mm; }
  .chart { text-align: center; margin: 0 0 4mm; }
"""








############################################################
# _shell
############################################################
#
# A product's pages around its sections: the cover — kind,
# title, company, date, version, and whether and by whom it
# was approved — the contents, the numbered sections, and
# the last one every kind shares: its rules and provenance.
#
# Used by:
#   - render_html (below)
############################################################

def _shell(product, T, kind_title, sections):
    company = report_pdf._company_name(SimpleNamespace(company=product.company, profile_snapshot={}))
    issued = f"{product.approved_at or product.edited_at or product.finished_at or product.created_at:%Y-%m-%d}"
    if product.status == "approved" and product.approved_by is not None:
        who = product.approved_by.display_name or product.approved_by.email
        note = f" — {product.approval_note}" if product.approval_note else ""
        approval = f"{T['approved']}: {who}, {product.approved_at:%Y-%m-%d}{note}"
    else:
        approval = T["draft"]
    sections = sections + [(T["checks"], _checks(product, T), "")]
    toc = "".join(f'<li><a href="#s{number}"><span class="no">{number}</span> {escape(title)}</a></li>'
                  for number, (title, _, _) in enumerate(sections, 1))
    parts = [f'<html lang="{escape(product.language)}"><head><meta charset="utf-8"><title>{escape(product.title)}</title>'
             f"<style>{report_pdf._font_css()}{report_pdf.CSS}{CSS}</style></head><body>",
             f'<div class="running">{report_pdf.FOOT_MARK}{escape(T["product"])} · {issued}</div>',
             f'<div class="cover"><div class="band">{report_pdf.COVER_MARK}<div class="kind">{escape(kind_title)}</div>'
             f'<h1>{escape(product.title or kind_title)}</h1></div>'
             f'<div class="facts"><div class="who">{escape(company)}</div>'
             f'<div class="when">{issued} · {escape(T["version"])} {product.version}</div>'
             f'<div class="approval">{escape(approval)}</div></div>'
             f'<div class="foot">{escape(T["generated_by"])}</div></div>',
             f'<section><h2 data-title="{escape(T["contents"], quote=True)}">{escape(T["contents"])}</h2>'
             f'<ol class="toc">{toc}</ol></section>']
    for number, (title, body, css_class) in enumerate(sections, 1):
        parts.append(f'<section id="s{number}" class="{css_class}"><h2 data-title="{escape(title, quote=True)}">'
                     f'<span class="no">{number}</span> {escape(title)}</h2>{body}</section>')
    parts.append("</body></html>")
    return "".join(parts)








############################################################
# _checks
############################################################
#
# The rules of the kind as the product met or broke them —
# a broken blocking rule in words, a broken warning as a
# note — and what the product was made from: the report, the
# earlier products, the documents, the prompts and models.
#
# Used by:
#   - _shell (above)
############################################################

def _checks(product, T):
    rows = []
    for item in product.checks or []:
        state = T["kept"] if item.get("ok") else (T["broken"] if item.get("blocking") else T["warning"])
        detail = f' <span class="muted">— {escape(str(item.get("detail") or ""))}</span>' if item.get("detail") and not item.get("ok") else ""
        rows.append(f'<tr><td>{escape(T["rules"].get(item.get("rule"), str(item.get("rule"))))}</td>'
                    f'<td>{escape(state)}{detail}</td></tr>')
    basis, stats, language = product.basis or {}, product.stats or {}, product.language if product.language in TEXT else "lt"
    made = [f'{len(basis.get("documents") or [])} {T["documents_read"]}']
    if basis.get("reportId"):
        made.append(T["report_of"])
    made += [f'{TITLES[kind][language]} ({T["version"]} {earlier["version"]})'
             for kind, earlier in (basis.get("products") or {}).items() if kind in TITLES]
    prompts = "<br>".join(escape(f"{p['slug']} v{p['version']} — {str(p.get('model', '')).split(':', 1)[-1]}")
                          for p in (stats.get("provenance") or {}).get("prompts", []))
    return (f'<table class="grid"><thead><tr><th>{escape(T["rule"])}</th><th>{escape(T["result"])}</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
            f'<table class="facts" style="margin-top:5mm"><tbody>'
            f'<tr><td>{escape(T["made_from"])}</td><td>{escape(", ".join(made))}</td></tr>'
            f'<tr><td>{escape(T["prompts"])}</td><td>{prompts or escape(T["none"])}</td></tr></tbody></table>')








############################################################
# _basis
############################################################
#
# The provisions a text rests on, each a link to the official
# text where the corpus has it.
#
# Used by:
#   - _policy, _risks (below)
############################################################

def _basis(entries):
    return "; ".join(_link(f"{entry.get('shortTitle') or entry.get('act')} {entry.get('path') or entry.get('article')}",
                           entry.get("citationUrl")) for entry in entries or [])








############################################################
# _policy
############################################################
#
# The policy's eight parts as text a board reads — each with
# the documents it rests on and its legal basis in small
# print, and what the governing body has yet to decide marked
# — then the library by level and the missing documents.
#
# Used by:
#   - render_html (below)
############################################################

def _policy(product, T):
    content, sections = product.content or {}, []
    for part in content.get("parts") or []:
        paragraphs = "".join(f"<p>{escape(block.strip())}</p>" for block in part.get("text", "").split("\n\n") if block.strip())
        notes = ""
        if part.get("decisions"):
            notes += (f'<div class="callout decision"><strong>{escape(T["decisions"])}</strong><br>'
                      + "<br>".join(escape(decision) for decision in part["decisions"]) + "</div>")
        if part.get("sources"):
            notes += (f'<div class="note">{escape(T["sources"])}: '
                      + "; ".join(sorted({escape(source["document"]) for source in part["sources"]})) + "</div>")
        if part.get("legalBasis"):
            notes += f'<div class="note">{escape(T["basis"])}: {_basis(part["legalBasis"])}</div>'
        sections.append((part.get("heading", ""), f'<div class="part">{paragraphs}</div>{notes}', ""))
    rows = "".join(f'<tr><td>{escape(T["levels"].get(row["level"], str(row["level"])))}</td><td>{escape(row["document"])}</td>'
                   f'<td>{escape(row["topic"])}</td><td>{escape(row["note"])}</td></tr>'
                   for row in sorted(content.get("hierarchy") or [], key=lambda row: (row["level"] or 9, row["document"])))
    sections.append((T["hierarchy"], f'<table class="grid"><thead><tr><th>{escape(T["level"])}</th><th>{escape(T["document"])}</th>'
                                     f'<th>{escape(T["topic"])}</th><th>{escape(T["note"])}</th></tr></thead><tbody>{rows}</tbody></table>', ""))
    order = {"high": 0, "medium": 1, "low": 2}
    headings = {part.get("key"): part.get("heading") for part in content.get("parts") or []}
    rows = "".join(
        f'<tr><td>{row["level"]}</td><td><strong>{escape(row["title"])}</strong><br>{escape(row["purpose"])}'
        + (f'<div class="note">{escape(T["supports"])}: {escape(headings[row["supports"]])}</div>'
           if headings.get(row.get("supports")) else "")
        + (f'<div class="note">{escape(T["covered"])}: {escape(", ".join(d["document"] for d in row["partlyCoveredBy"]))}</div>'
           if row.get("partlyCoveredBy") else "")
        + f'</td><td>{escape(T["priorities"].get(row["priority"], row["priority"]))}</td><td>{_basis(row.get("legalBasis"))}</td></tr>'
        for row in sorted(content.get("missing") or [], key=lambda row: (order.get(row["priority"], 3), row["level"])))
    sections.append((T["missing"], f'<table class="grid"><thead><tr><th>{escape(T["level"])}</th><th>{escape(T["document"])}</th>'
                                   f'<th>{escape(T["priority"])}</th><th>{escape(T["basis"])}</th></tr></thead><tbody>{rows}</tbody></table>', ""))
    return sections








############################################################
# _fitted
############################################################
#
# A chart given the size it is printed at: as large as the
# landscape page's box under the section's heading allows,
# and never so large that a small structure is blown up. The
# drawing keeps its own coordinates; only the size the page
# gives it changes.
#
# Used by:
#   - _governance (below)
############################################################

def _fitted(svg):
    drawn = re.search(r'width="(\d+)" height="(\d+)"', svg)
    if drawn is None:
        return svg
    width, height = int(drawn.group(1)), int(drawn.group(2))
    scale = min(WIDE_W / width, WIDE_H / height, CHART_SCALE)
    return svg.replace(drawn.group(0), f'width="{width * scale:.1f}mm" height="{height * scale:.1f}mm"', 1)








############################################################
# _governance
############################################################
#
# The positions found, the roles missing, the structure as a
# chart on a landscape page with the notes under it, the
# process step by step, and the RACI matrix — steps down,
# roles across, the accountable cell in ink.
#
# Used by:
#   - render_html (below)
############################################################

def _governance(product, T):
    content = product.content or {}
    rows = "".join(f'<tr><td><strong>{escape(row["name"])}</strong></td><td>{escape(row["unit"])}</td>'
                   f'<td>{escape(T["lines"].get(row["line"], row["line"]))}</td><td>{escape(row["duties"])}'
                   + (f'<div class="note">{escape("; ".join(sorted({s["document"] for s in row["sources"]})))}</div>' if row.get("sources") else "")
                   + "</td></tr>" for row in content.get("positions") or [])
    positions = (f'<table class="grid"><thead><tr><th>{escape(T["position"])}</th><th>{escape(T["unit"])}</th>'
                 f'<th>{escape(T["line"])}</th><th>{escape(T["duties"])}</th></tr></thead><tbody>{rows}</tbody></table>')
    gaps = "".join(f'<p class="prose"><strong>{escape(row["role"])}</strong> '
                   f'<span class="muted">({escape(T["lines"].get(row["line"], row["line"]))})</span><br>{escape(row["why"])}</p>'
                   for row in content.get("gaps") or [])
    nodes = content.get("structure") or []
    notes = "".join(f'<tr><td>{escape(node["name"])}</td><td>{escape(node["note"])}</td></tr>' for node in nodes if node.get("note"))
    chart = (f'<div class="chart">{_fitted(structure_svg(nodes, product.language))}</div>'
             + (f'<h3>{escape(T["structure_notes"])}</h3><table class="grid"><tbody>{notes}</tbody></table>' if notes else ""))
    steps = content.get("process") or []
    rows = "".join(f'<tr><td>{index}</td><td><strong>{escape(step["name"])}</strong><br>{escape(step["description"])}</td>'
                   f'<td>{escape(step["frequency"])}</td><td>{escape("; ".join(b["source"] + " " + b["ref"] for b in step["basis"]))}</td></tr>'
                   for index, step in enumerate(steps, 1))
    process = (f'<table class="grid"><thead><tr><th></th><th>{escape(T["what"])}</th><th>{escape(T["frequency"])}</th>'
               f'<th>{escape(T["rests_on"])}</th></tr></thead><tbody>{rows}</tbody></table>')
    cells = {(cell["stepId"], cell["roleId"]): cell["value"] for cell in content.get("raci") or []}
    roles = [node for node in nodes if any(role == node["id"] for _, role in cells)]
    # A role's name runs up its column: turned a quarter, on as many lines as the column is wide
    column = (WIDE_W - STEP_W) / max(len(roles), 1)
    block = max(3, min(9, int((column - 0.6) // 3) * 3))
    head = "".join(f'<th class="role"><div style="height: {block}mm; margin-left: {(column - block) / 2:.2f}mm; '
                   f'transform: translate({block}mm, 0) rotate(-90deg)">{escape(node["name"])}</div></th>' for node in roles)
    rows = ""
    for index, step in enumerate(steps, 1):
        marks = ""
        for node in roles:
            value = cells.get((step["id"], node["id"]), "")
            marks += f'<td class="c {"a" if "A" in value else "r" if value == "R" else ""}">{escape(value)}</td>'
        rows += f'<tr><td>{index}. {escape(step["name"])}</td>{marks}</tr>'
    raci = (f'<div class="note">{escape(T["raci_key"])}</div><table class="grid raci"><thead><tr><th class="step">{escape(T["step"])}</th>{head}'
            f'</tr></thead><tbody>{rows}</tbody></table>')
    return [(T["positions"], positions, ""), (T["gaps"], gaps, ""), (T["structure"], chart, "wide"),
            (T["process"], process, ""), (T["raci"], raci, "wide")]








############################################################
# _typology
############################################################
#
# A scenario's place in the three typologies as one line:
# each label with the name of the type chosen, those the
# scenario has. Empty for a scenario that has none.
#
# Used by:
#   - _risks, render_xlsx (below)
############################################################

def _typology(scenario, T):
    return " · ".join(f"{T[label]}: {T[names][scenario[field]]}" for field, label, names in TYPOLOGIES
                      if scenario.get(field) in T[names])








############################################################
# _risks
############################################################
#
# The criteria as two tables, the matrix with every scenario
# in the cell its levels put it in beside what each band
# means, the scenarios one by one, and the register on a
# landscape page in the lecture's columns.
#
# Used by:
#   - render_html (below)
############################################################

def _risks(product, T):
    content, index = product.content or {}, 0 if product.language == "lt" else 1
    criteria = content.get("criteria") or {}

    def scale(rows, dimensions):
        head = "".join(f'<th>{escape(T["dimensions"][dimension])}</th>' for dimension in dimensions)
        body = "".join(f'<tr><td><strong>{row["level"]} — {escape(row["name"])}</strong></td>'
                       + "".join(f'<td>{escape(row[dimension])}</td>' for dimension in dimensions) + "</tr>" for row in rows or [])
        return f'<table class="grid"><thead><tr><th></th>{head}</tr></thead><tbody>{body}</tbody></table>'

    calibration = (f'<h3>{escape(T["calibration"])}</h3><p class="prose">{escape(criteria.get("calibration", ""))}</p>'
                   if criteria.get("calibration") else "")
    scenarios = content.get("scenarios") or []
    grid = ""
    for impact in range(5, 0, -1):
        grid += f'<tr><th>{impact} — {escape(risks.IMPACT[impact][index])}</th>'
        for likelihood in range(1, 6):
            here = [s["id"] for s in scenarios if s["likelihood"]["level"] == likelihood and s["impact"]["level"] == impact]
            grid += (f'<td class="b-{risks.band_of(likelihood * impact)}"><span class="n">{likelihood * impact}</span>'
                     + (f'<br>{escape(", ".join(here))}' if here else "") + "</td>")
        grid += "</tr>"
    grid += "<tr><th></th>" + "".join(f'<th>{level} — {escape(risks.LIKELIHOOD[level][index])}</th>' for level in range(1, 6)) + "</tr>"
    appetite = "".join(
        f'<tr><td class="b-{row["band"]}" style="text-align:center"><strong>{escape(row["name"])}</strong><br>{row["from"]}–{row["to"]}</td>'
        f'<td>{escape(row["comment"])}</td><td>{escape(row["decision"])}</td>'
        f'<td>{escape(", ".join(T["responses"][response] for response in row["responses"]))}</td></tr>'
        for row in content.get("appetite") or [])
    matrix = (f'<div class="note">{escape(T["impact_axis"])} ↑ · {escape(T["likelihood_axis"])} →</div>'
              f'<table class="heat"><tbody>{grid}</tbody></table>'
              f'<table class="grid"><thead><tr><th>{escape(T["band"])}</th><th>{escape(T["meaning"])}</th><th>{escape(T["decision"])}</th>'
              f'<th>{escape(T["responses_allowed"])}</th></tr></thead><tbody>{appetite}</tbody></table>')
    kinds = lambda s: ", ".join(f"{number} {risks.CATEGORIES[number][index]}" for number in s["categories"])
    typology = lambda s: (f'<div class="note">{escape(_typology(s, T))}</div>' if _typology(s, T) else "")
    level = lambda s: (f'{s["score"]} · {escape(risks.BANDS[s["band"]][2 + index])}' if s.get("band") else "—")
    cards = "".join(
        f'<div class="scenario"><div class="id">{escape(s["id"])} · {escape(s["area"])} · {escape(s["unit"])} · '
        f'{T["t"]}{s["likelihood"]["level"]} × {T["p"]}{s["impact"]["level"]} = {level(s)}</div>'
        f'<div class="s">{escape(s["sentence"])}</div>'
        f'<div class="note">{escape(kinds(s))}</div>{typology(s)}'
        f'<p class="prose"><strong>{escape(T["internal"])}:</strong> {escape(s["internalConclusion"])}</p>'
        + (f'<p class="prose"><strong>{escape(T["external"])}:</strong> {escape(s["externalConclusion"])}</p>'
           if s.get("externalConclusion") else "") +
        f'<div class="note">{escape(T["t"])}: {escape(s["likelihood"]["why"])}<br>{escape(T["p"])}: {escape(s["impact"]["why"])}</div>'
        f'<div class="note">{escape(T["policies"])}: {escape(", ".join(d["document"] for d in s["policies"]))} · '
        f'{escape(T["basis"])}: {_basis(s["legalBasis"])}</div></div>' for s in scenarios)
    rows = "".join(
        f'<tr><td>{escape(s["id"])}</td><td>{escape(s["area"])}<br><span class="muted">{escape(s["unit"])}</span></td>'
        f'<td>{escape(s["sentence"])}<div class="note">{escape(kinds(s))}</div>{typology(s)}</td>'
        f'<td>{_basis(s["legalBasis"])}<div class="note">{escape(", ".join(d["document"] for d in s["policies"]))}</div>'
        f'<div class="note">{escape(T["internal"])}: {escape(s["internalConclusion"])}</div>'
        + (f'<div class="note">{escape(T["external"])}: {escape(s["externalConclusion"])}</div>' if s.get("externalConclusion") else "")
        + "</td>"
        f'<td class="c">{s["likelihood"]["level"]}</td><td class="c">{s["impact"]["level"]}</td>'
        f'<td class="c b-{s["band"] or "negligible"}">{level(s)}</td>'
        f'<td><strong>{escape(T["responses"].get(s["response"], s["response"]))}</strong><br>'
        + "<br>".join(f"{number}. {escape(action)}" for number, action in enumerate(s["actions"], 1))
        + f'</td><td>{escape(", ".join(s["owners"]))}<br>{escape(s["deadline"])}</td></tr>' for s in scenarios)
    # The lecture's nine columns, the wide ones sharing what the narrow ones leave of the page
    widths = "".join(f'<col style="width: {width}mm">' for width in (10, 25, 62, 62, 6, 6, 15, 53, 24))
    register = (f'<table class="grid register"><colgroup>{widths}</colgroup><thead><tr><th>ID</th><th>{escape(T["area"])}</th>'
                f'<th>{escape(T["scenario"])}</th>'
                f'<th>{escape(T["legal"])}</th><th class="c">{escape(T["t"])}</th><th class="c">{escape(T["p"])}</th>'
                f'<th class="c">{escape(T["score"])}</th><th>{escape(T["plan"])}</th><th>{escape(T["owner"])}</th></tr></thead>'
                f'<tbody>{rows}</tbody></table>')
    return [(T["likelihood"], scale(criteria.get("likelihood"), risks.LIKELIHOOD_DIMENSIONS), "wide"),
            (T["impact"], scale(criteria.get("impact"), risks.IMPACT_DIMENSIONS) + calibration, "wide"),
            (T["matrix"], matrix, ""), (T["scenarios"], cards, ""), (T["register"], register, "wide")]








############################################################
# render_html
############################################################
#
# The product as the HTML its PDF is made of.
#
# Used by:
#   - render_pdf (below), tests
############################################################

def render_html(product):
    T = TEXT.get(product.language, TEXT["lt"])
    sections = {"policy": _policy, "governance": _governance, "risks": _risks}[product.kind]
    return _shell(product, T, TITLES[product.kind].get(product.language, TITLES[product.kind]["lt"]), sections(product, T))








############################################################
# render_pdf
############################################################
#
# Used by:
#   - programme/api/views.py — export_product
############################################################

def render_pdf(product):
    from weasyprint import HTML
    return HTML(string=render_html(product), url_fetcher=report_pdf._fetcher(), base_url=None).write_pdf()








############################################################
# render_docx
############################################################
#
# The compliance policy as a Word file a board can edit: the
# title, whether it is a draft, the eight parts under their
# headings, and the points the governing body has yet to
# decide gathered at the end.
#
# Used by:
#   - programme/api/views.py — export_product
############################################################

def render_docx(product):
    from docx import Document
    T = TEXT.get(product.language, TEXT["lt"])
    document = Document()
    document.add_heading(product.title or policy.TITLE.get(product.language, policy.TITLE["lt"]), level=0)
    status = T["draft"] if product.status != "approved" else f'{T["approved"]}: {product.approved_at:%Y-%m-%d}'
    document.add_paragraph(f'{product.company.name} · {T["version"]} {product.version} · {status}')
    decisions = []
    for number, part in enumerate((product.content or {}).get("parts") or [], 1):
        document.add_heading(f'{number}. {part.get("heading", "")}', level=1)
        for block in part.get("text", "").split("\n\n"):
            if block.strip():
                document.add_paragraph(block.strip())
        decisions += part.get("decisions") or []
    if decisions:
        document.add_heading(T["decisions"], level=1)
        for decision in decisions:
            document.add_paragraph(decision, style="List Bullet")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()








############################################################
# render_xlsx
############################################################
#
# The risk register as a workbook: the register in the
# lecture's columns, then the criteria and the appetite. Every
# cell is stored as text or a number — never as a formula.
#
# Used by:
#   - programme/api/views.py — export_product
############################################################

def render_xlsx(product):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    T, index = TEXT.get(product.language, TEXT["lt"]), 0 if product.language == "lt" else 1
    content = product.content or {}
    book = Workbook()

    def sheet(ws, title, headers, rows, widths):
        ws.title = title[:31]
        ws.append(headers)
        for row in rows:
            ws.append(row)
        for cells in ws.iter_rows():
            for cell in cells:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
                if isinstance(cell.value, str):
                    cell.data_type = "s"
        for cell in ws[1]:
            cell.font, cell.fill = Font(color="FFFFFF", bold=True), PatternFill("solid", fgColor="173A6E")
        for column, width in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(column)].width = width
        ws.freeze_panes = "A2"

    basis = lambda s: "; ".join(f"{b.get('shortTitle') or b.get('act')} {b.get('path') or b.get('article')}" for b in s["legalBasis"])
    kinds = lambda s: ", ".join(f"{number} {risks.CATEGORIES[number][index]}" for number in s["categories"])
    sheet(book.active, T["register"],
          ["ID", T["area"], T["unit"], T["scenario"], T["legal"], T["policies"], T["internal"], T["external"], T["t"], T["p"], T["score"],
           T["band"], T["plan"], T["owner"]],
          [[s["id"], s["area"], s["unit"], "\n".join(filter(None, (s["sentence"], kinds(s), _typology(s, T)))), basis(s),
            ", ".join(d["document"] for d in s["policies"]), s["internalConclusion"], s.get("externalConclusion", ""), s["likelihood"]["level"],
            s["impact"]["level"], s["score"], risks.BANDS[s["band"]][2 + index] if s.get("band") else "",
            T["responses"].get(s["response"], s["response"]) + "\n" + "\n".join(f"{n}. {a}" for n, a in enumerate(s["actions"], 1)),
            f'{", ".join(s["owners"])}\n{s["deadline"]}'] for s in content.get("scenarios") or []],
          [8, 24, 22, 60, 26, 26, 50, 30, 5, 5, 7, 14, 50, 24])
    criteria = content.get("criteria") or {}
    for title, rows, dimensions in ((T["likelihood"], criteria.get("likelihood"), risks.LIKELIHOOD_DIMENSIONS),
                                    (T["impact"], criteria.get("impact"), risks.IMPACT_DIMENSIONS)):
        sheet(book.create_sheet(), title, ["", *[T["dimensions"][d] for d in dimensions]],
              [[f'{row["level"]} — {row["name"]}', *[row[d] for d in dimensions]] for row in rows or []], [24, 40, 40, 40, 40])
    sheet(book.create_sheet(), T["matrix"], [T["band"], T["score"], T["meaning"], T["decision"], T["responses_allowed"]],
          [[row["name"], f'{row["from"]}–{row["to"]}', row["comment"], row["decision"],
            ", ".join(T["responses"][r] for r in row["responses"])] for row in content.get("appetite") or []],
          [16, 10, 60, 40, 30])
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()
