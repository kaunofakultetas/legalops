############################################################
#  [*] analysis.exports — the report as Excel, and what the
#      PDF shares with it
#
#    render_xlsx(report) → bytes (openpyxl, one sheet per part)
#
#  The workbook is the working copy of a report: filterable
#  sheets with everything the PDF holds (analysis/pdf.py, the
#  document for the board) and the obligations that do not
#  apply besides. Both read the SNAPSHOTTED report rows, in
#  the report's language, with reviewer overrides applied,
#  through the same label table and helpers, which live here.
#  Both keep the acts assessed as preparation apart from
#  today's result: the overview counts them on rows of their
#  own, every act says what the report did with it, and a
#  finding of such an act carries the date it applies from.
#  A report from before the citation audit existed (no
#  stats.citations) says the audit was not run for it.
#
#  Hardening: no workbook cell becomes a formula (a finding
#  text starting with "=" stays text); a link is kept only
#  when it is https.
############################################################


import io
import re
from html import escape


from compliance.analysis.serializers import VERDICTS, VERDICT_STAT_KEYS, citation_verdict, effective_status


LABELS = {
    "lt": {
        "title": "Atitikties spragų ataskaita", "company": "Įmonė", "date": "Data", "summary": "Santrauka",
        "acts": "Taikomi teisės aktai", "screened": "Atmesti teisės aktai (netaikomi pagal katalogą)",
        "acts_and_standards": "Taikomi teisės aktai ir standartai", "standard": "Standartas",
        "findings": "Išvados", "actions": "Veiksmų planas", "profile": "Įmonės profilis",
        "credentials": "Licencijos, leidimai ir registracijos", "claimed": "Nurodyta įmonės, nepatikrinta",
        "verified": "Patikrinta", "methodology": "Metodika ir apribojimai", "provenance": "Kilmė",
        "act": "Teisės aktas", "applicability": "Taikymas", "confidence": "Patikimumas",
        "reasoning": "Pagrindimas", "status": "Būsena", "severity": "Reikšmingumas", "obligation": "Pareiga",
        "analysis": "Vertinimas", "recommendation": "Rekomendacija", "evidence": "Įrodymai",
        "register": "Veiksmų registras", "closes": "Šalinamos išvados", "due": "Terminas", "state": "Būsena",
        "from_report": "Ataskaita", "closed_on": "Uždaryta", "closed_how": "Kaip uždaryta", "notes": "Pastaba",
        "states": {"open": "Atviras", "in_progress": "Vykdomas", "late": "Vėluojantis", "done": "Įvykdytas, laukia patikros",
                   "closed": "Uždarytas"},
        "closed_ways": {"confirmed": "patvirtino vėlesnė ataskaita", "manual": "uždarė asmuo"},
        "item_confirmed": "patvirtinta",
        "consequence": "Pasekmė", "cause": "Priežastis", "fine": "bauda iki", "of_turnover": "metinės apyvartos (pajamų)",
        "or": "arba", "benefit": "kartų gautos naudos ar išvengtų nuostolių", "also": "taip pat", "decimal": ",",
        "via": "šis aktas priimtas pagal", "only_for": "tik šiems asmenims",
        "measures": {"withdrawal": "leidimo panaikinimas ar sustabdymas", "restriction": "veiklos apribojimas ar sustabdymas",
                     "cease": "nurodymas nutraukti pažeidimą", "public_statement": "viešas pranešimas apie pažeidimą",
                     "management_ban": "vadovų nušalinimas ar draudimas eiti pareigas",
                     "disgorgement": "gautos naudos grąžinimas", "periodic_penalty": "periodinė bauda",
                     "criminal": "baudžiamoji atsakomybė", "other": "kitos poveikio priemonės"},
        "citation": "Nuoroda", "priority": "Prioritetas", "effort": "Pastangos", "timeframe": "Terminas",
        "owner": "Atsakingas", "category": "Kategorija", "note": "Peržiūros pastaba",
        "deadline": "Terminas / periodiškumas", "overview": "Apžvalga", "none": "—",
        "applies": "Taikomas", "not_applies": "Netaikomas", "uncertain": "Neaišku",
        "met": "Atitinka", "partial": "Iš dalies", "missing": "Neatitinka", "unknown": "Neįrodyta",
        "not_applicable": "Netaikoma", "critical": "Kritinė", "high": "Aukšta", "medium": "Vidutinė", "low": "Žema",
        "effort_low": "Mažos", "effort_medium": "Vidutinės", "effort_high": "Didelės",
        "immediate": "Nedelsiant", "30_days": "Per 30 d.", "90_days": "Per 90 d.", "12_months": "Per 12 mėn.",
        "unreviewed": "Pareiga neperžiūrėta žmogaus", "reviewed": "Peržiūrėta žmogaus",
        "generated": "Sugeneruota", "prompts": "Instrukcijų versijos", "models": "Modeliai",
        "approved": "Patvirtino", "not_approved": "Ataskaita dar nepatvirtinta žmogaus",
        "corpus": "Teisės aktų versijos", "reviewed_obligations": "Išvados pagal žmogaus patvirtintas pareigas",
        "field": "Laukas", "value": "Reikšmė", "issuer": "Išdavė", "number": "Nr.", "validity": "Galioja",
        "institution": "Įstaigos tipas", "activities": "Veikla", "size": "Dydis", "unknown_value": "nežinoma",
        "code": "Įmonės kodas", "employees": "darbuotojų",
        "institutions": {
            "bank": "Bankas", "credit_union": "Kredito unija", "payment_institution": "Mokėjimo įstaiga",
            "emi": "Elektroninių pinigų įstaiga", "casp": "Kriptoturto paslaugų teikėjas",
            "crowdfunding": "Sutelktinio finansavimo paslaugų teikėjas", "consumer_credit": "Vartojimo kredito davėjas",
            "real_estate_credit": "Su nekilnojamuoju turtu susijusio kredito davėjas",
            "currency_exchange": "Valiutos keityklos operatorius", "investment_firm": "Finansų maklerio įmonė",
            "insurance": "Draudimo įmonė", "other_financial": "Kita finansų įstaiga", "none": "Ne finansų įstaiga",
            "unknown": "Nenustatyta"},
        "sizes": {"micro": "Labai maža", "small": "Maža", "medium": "Vidutinė", "large": "Didelė", "unknown": "Nenustatyta"},
        "yes": "taip", "no": "ne", "uses_ai": "Naudoja DI sistemas", "processes_data": "Tvarko asmens duomenis",
        "citations": "Teisės aktų nuorodų patikra",
        "citations_intro": (
            "Patikrintos įmonės dokumentuose nurodytos konkrečios teisės aktų nuostatos: ar tokia nuostata yra "
            "galiojančioje akto redakcijoje ir ar ji reglamentuoja tai, ką teigia dokumentas (vertino DI modelis, o "
            "jam esant nepasiekiamam — žodžių sutapimas). Pirmiausia pateikiamos problemos."),
        "citations_not_run": "Šiai ataskaitai teisės aktų nuorodų patikra nebuvo atlikta.",
        "citations_none": "Įmonės dokumentuose nerasta nuorodų į konkrečias teisės aktų nuostatas.",
        "checked": "Patikrinta nuorodų", "document": "Dokumentas", "cited_as": "Nurodyta dokumente",
        "claim": "Dokumento teiginys", "quote": "Citata", "verdict": "Išvada", "actual": "Tikroji nuostata",
        "judge_note": "Patikros pastaba", "judged_by": "Vertino", "judge_model": "DI modelis",
        "judge_overlap": "žodžių sutapimas", "article": "Straipsnis", "paragraph": "Dalis", "point": "Punktas",
        "heading": "Nuostatos antraštė",
        "citation_match": "Teisinga", "citation_mismatch": "Ne ta nuostata",
        "citation_not_found": "Tokios nuostatos nėra", "citation_act_not_in_corpus": "Akto nėra bazėje",
        "citation_unknown": "Nepavyko įvertinti",
        "treatment": "Ataskaitoje", "assessment_assessed": "Įvertintas",
        "assessment_upcoming": "Įvertintas pasirengimas",
        "assessment_unconfirmed": "Nevertintas — taikymą reikia patvirtinti",
        "assessment_indirect": "Nevertintas — taikomas per nacionalinę teisę",
        "assessment_institutional": "Nevertintas — nustato institucijos veiklą ar procedūras",
        "assessment_none": "Nevertintas — netaikomas",
        "assessment_chosen": "Įvertintas įmonės pasirinkimu — neprivalomas",
        "assessment_left_out": "Nevertintas — taikomas, neįtrauktas apimtį tvirtinusio asmens sprendimu",
        "scope_approved": "Vertinamų aktų sąrašą patvirtino",
        "scope_unattended": "Niekas — ataskaita paleista be apimties peržiūros",
        "applies_from": "Taikomas nuo", "to_confirm": "Ką patvirtinti",
        "upcoming": "Vėliau taikomi aktai (pasirengimas)",
    },
    "en": {
        "title": "Compliance gap report", "company": "Company", "date": "Date", "summary": "Executive summary",
        "acts": "Applicable legal acts", "screened": "Acts screened out (not applicable per the catalogue)",
        "acts_and_standards": "Applicable legal acts and standards", "standard": "Standard",
        "findings": "Findings", "actions": "Action plan", "profile": "Company profile",
        "credentials": "Licences, permits and registrations", "claimed": "Claimed by the company, not verified",
        "verified": "Verified", "methodology": "Methodology and limitations", "provenance": "Provenance",
        "act": "Act", "applicability": "Applicability", "confidence": "Confidence", "reasoning": "Reasoning",
        "status": "Status", "severity": "Severity", "obligation": "Obligation", "analysis": "Assessment",
        "recommendation": "Recommendation", "evidence": "Evidence", "citation": "Citation",
        "register": "Action register", "closes": "Findings to close", "due": "Due", "state": "State",
        "from_report": "Report", "closed_on": "Closed", "closed_how": "How it was closed", "notes": "Note",
        "states": {"open": "Open", "in_progress": "In progress", "late": "Late", "done": "Done, awaiting re-test",
                   "closed": "Closed"},
        "closed_ways": {"confirmed": "confirmed by a later report", "manual": "closed by a person"},
        "item_confirmed": "confirmed",
        "consequence": "Consequence", "cause": "Cause", "fine": "a fine of up to", "of_turnover": "of annual turnover (income)",
        "or": "or", "benefit": "times the benefit gained or loss avoided", "also": "also", "decimal": ".",
        "via": "this act was adopted under", "only_for": "only for",
        "measures": {"withdrawal": "withdrawal or suspension of the authorisation", "restriction": "restriction or suspension of an activity",
                     "cease": "an order to end the breach", "public_statement": "a public statement on the breach",
                     "management_ban": "removal of managers or a ban on management functions",
                     "disgorgement": "surrender of the benefit gained", "periodic_penalty": "a periodic penalty",
                     "criminal": "criminal liability", "other": "other measures"},
        "priority": "Priority", "effort": "Effort", "timeframe": "Timeframe", "owner": "Owner",
        "category": "Category", "note": "Reviewer note", "deadline": "Deadline / frequency",
        "overview": "Overview", "none": "—",
        "applies": "Applies", "not_applies": "Does not apply", "uncertain": "Uncertain",
        "met": "Met", "partial": "Partial", "missing": "Not met", "unknown": "Not evidenced",
        "not_applicable": "Not applicable", "critical": "Critical", "high": "High", "medium": "Medium", "low": "Low",
        "effort_low": "Low", "effort_medium": "Medium", "effort_high": "High",
        "immediate": "Immediately", "30_days": "Within 30 days", "90_days": "Within 90 days",
        "12_months": "Within 12 months",
        "unreviewed": "Obligation not reviewed by a person", "reviewed": "Reviewed by a person",
        "generated": "Generated", "prompts": "Instruction versions", "models": "Models",
        "approved": "Approved by", "not_approved": "Not yet approved by a person",
        "corpus": "Legal act versions", "reviewed_obligations": "Findings on person-approved obligations",
        "field": "Field", "value": "Value", "issuer": "Issuer", "number": "No.", "validity": "Valid",
        "institution": "Institution type", "activities": "Activities", "size": "Size",
        "code": "Company code", "employees": "employees",
        "institutions": {
            "bank": "Bank", "credit_union": "Credit union", "payment_institution": "Payment institution",
            "emi": "Electronic money institution", "casp": "Crypto-asset service provider",
            "crowdfunding": "Crowdfunding service provider", "consumer_credit": "Consumer credit provider",
            "real_estate_credit": "Real-estate credit provider", "currency_exchange": "Currency exchange operator",
            "investment_firm": "Investment firm", "insurance": "Insurance undertaking",
            "other_financial": "Other financial institution", "none": "Not a financial institution",
            "unknown": "Not determined"},
        "sizes": {"micro": "Micro", "small": "Small", "medium": "Medium", "large": "Large", "unknown": "Not determined"},
        "unknown_value": "unknown", "yes": "yes", "no": "no", "uses_ai": "Uses AI systems",
        "processes_data": "Processes personal data",
        "citations": "Citation audit",
        "citations_intro": (
            "The references the company's documents make to specific legal provisions were checked: does the "
            "provision exist in the act's current version, and does it regulate what the document says (judged by "
            "an AI model, or by word overlap when the model was unavailable). Problems are listed first."),
        "citations_not_run": "The citation audit was not run for this report.",
        "citations_none": "No legal references to specific provisions were found in the company's documents.",
        "checked": "References checked", "document": "Document", "cited_as": "Cited as",
        "claim": "What the document says", "quote": "Quote", "verdict": "Verdict", "actual": "Actual provision",
        "judge_note": "Check note", "judged_by": "Judged by", "judge_model": "AI model",
        "judge_overlap": "word overlap", "article": "Article", "paragraph": "Paragraph", "point": "Point",
        "heading": "Provision heading",
        "citation_match": "Correct", "citation_mismatch": "Wrong provision",
        "citation_not_found": "No such provision", "citation_act_not_in_corpus": "Act not in the corpus",
        "citation_unknown": "Could not judge",
        "treatment": "In this report", "assessment_assessed": "Assessed",
        "assessment_upcoming": "Assessed as preparation",
        "assessment_unconfirmed": "Not assessed — applicability to confirm",
        "assessment_indirect": "Not assessed — applies through national law",
        "assessment_institutional": "Not assessed — organises an authority or a procedure",
        "assessment_none": "Not assessed — does not apply",
        "assessment_chosen": "Assessed by the company's choice — not binding",
        "assessment_left_out": "Not assessed — applies, left out by the person who approved the scope",
        "scope_approved": "List of assessed acts approved by",
        "scope_unattended": "Nobody — the report ran without the scope review",
        "applies_from": "Applies from", "to_confirm": "To confirm",
        "upcoming": "Acts that apply later (readiness)",
    },
}

MD_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
HTML_IMG = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
UNSAFE_HREF = re.compile(r'href="(?!https://)[^"]*"', re.IGNORECASE)

# The workbook's cell fills for a severity, a status and a
# citation verdict
SEVERITY_COLORS = {"critical": "#8B0000", "high": "#C0392B", "medium": "#B9770E", "low": "#1E8449"}
STATUS_COLORS = {"met": "#1E8449", "partial": "#B9770E", "missing": "#C0392B", "unknown": "#566573",
                 "not_applicable": "#7F8C8D"}
VERDICT_COLORS = {"mismatch": "#C0392B", "not_found": "#8B0000", "unknown": "#566573",
                  "act_not_in_corpus": "#7F8C8D", "match": "#1E8449"}








############################################################
# _data
############################################################
#
# The report's rows in export order (the citation audit's
# problems first, as stored), with the label table of its
# language.
#
# Used by:
#   - render_xlsx (below), analysis/pdf.py
############################################################

def _data(report):
    labels = LABELS.get(report.language, LABELS["lt"])
    acts = list(report.acts.order_by("order"))
    findings = list(report.findings.order_by("order"))
    actions = list(report.actions.order_by("order"))
    citations = list(report.citations.order_by("order"))
    return labels, acts, findings, actions, citations








############################################################
# _cited_as
############################################################
#
#   _cited_as("lt", row) → "MiCA 63 str. 2 d. a p."
#   _cited_as("en", row) → "MiCA Art. 63, para. 2, point a"
#
# A citation-audit row's reference as the document made it,
# in the report language's citation style.
#
# Used by:
#   - render_xlsx (below), analysis/pdf.py
############################################################

def _cited_as(language, citation):
    if language == "en":
        return (f"{citation.act} Art. {citation.article}" + (f", para. {citation.paragraph}" if citation.paragraph else "")
                + (f", point {citation.point}" if citation.point else ""))
    return (f"{citation.act} {citation.article} str." + (f" {citation.paragraph} d." if citation.paragraph else "")
            + (f" {citation.point} p." if citation.point else ""))








############################################################
# consequence_text
############################################################
#
# What a breach of a finding's provision can cost, in words:
# for each sanction tier the report kept on the finding, the
# act and provision it stands in, the ceiling of the fine —
# in euros, as a share of turnover, as a multiple of the
# benefit, whichever the act states — whom the tier binds,
# when it binds only certain persons, the kind of breach it
# is bound to, and the measures beside it with the
# provisions they come from. A finding under a level 2 act
# carries the tiers of the article that act was adopted
# under, and the text ends by naming it. A ceiling, not a
# forecast. Empty when the finding carries no tier.
#
# Used by:
#   - gap_consequence (below)
#   - analysis/pipeline.py — step_summary
############################################################

def consequence_text(L, finding):
    parts = []
    for tier in finding.consequence or []:
        ceilings = []
        if tier.get("maxFineEur"):
            ceilings.append(f"{tier['maxFineEur']:,.0f}".replace(",", "\u00a0") + " EUR")
        if tier.get("maxFinePercent"):
            ceilings.append(f"{tier['maxFinePercent']:g}".replace(".", L["decimal"]) + f"\u00a0% {L['of_turnover']}")
        if tier.get("benefitMultiple"):
            ceilings.append(f"{tier['benefitMultiple']:g}".replace(".", L["decimal"]) + f" {L['benefit']}")
        measures = ", ".join(L["measures"].get(code, code) for code in tier.get("measures") or [])
        joiner = f" {L['or']} "
        fine = f"{L['fine']} {joiner.join(ceilings)}" if ceilings else ""
        what = fine + (f"; {L['also']}: {measures}" if fine and measures else measures)
        if what:
            where = " ".join(piece for piece in (tier.get("act"), tier.get("path"), tier.get("where")) if piece)
            also = "".join(f", {source}" for source in tier.get("measuresFrom") or [])
            persons = ", ".join(tier.get("persons") or [])
            limits = "; ".join(piece for piece in (f"{L['only_for']}: {persons}" if persons else "", tier.get("condition")) if piece)
            bound = f" – {limits}" if limits else ""
            parts.append(f"{what}{bound} ({where}{also})")
    via = next((tier["via"] for tier in finding.consequence or [] if isinstance(tier.get("via"), dict)), None)
    if parts and via and via.get("act"):
        return "; ".join(parts) + f" – {L['via']} {via['act']} {via.get('path') or ''}".rstrip()
    return "; ".join(parts)








############################################################
# gap_consequence
############################################################
#
# consequence_text for a finding that is a gap — not met,
# partly met or not evidenced, by the reviewer's verdict
# where there is one — and nothing for what is met or does
# not apply: what a breach can cost is shown only where
# there is something to breach. The PDF's card and the
# workbook's sheet ask here, so the two cannot differ.
#
# Used by:
#   - render_xlsx (below), analysis/pdf.py — _card
############################################################

def gap_consequence(L, finding):
    return consequence_text(L, finding) if effective_status(finding) in ("missing", "partial", "unknown") else ""








############################################################
# _treatment
############################################################
#
# What the report did with an act, in words. An act that
# binds the company indirectly says through what: a directive
# through national law, any other through the authority it
# organises. Where the person who approved the scope decided
# against the verdict, it says that: an act assessed by choice
# although it does not bind the company, an act that applies
# and was left out.
#
# Used by:
#   - render_xlsx (below)
############################################################

def _treatment(L, act):
    if act.assessment == "indirect" and act.doc_type != "directive":
        return L["assessment_institutional"]
    if act.assessment in ("assessed", "upcoming") and act.applicability == "not_applies":
        return L["assessment_chosen"]
    if act.assessment == "none" and act.applicability == "applies":
        return L["assessment_left_out"]
    return L["assessment_" + act.assessment]








############################################################
# _markdown
############################################################
#
# The summary's markdown → HTML; raw HTML in the model's text
# is escaped first so it can never inject markup, images
# become their alt text (no pixel can leak a read), and a
# link keeps its href only when it is https.
#
# Used by:
#   - analysis/pdf.py — the executive summary
############################################################

def _markdown(text):
    import markdown
    text = MD_IMAGE.sub(lambda m: m.group(1), text or "")
    html = markdown.markdown(escape(text), extensions=["tables", "sane_lists"])
    html = HTML_IMG.sub("", html)
    return UNSAFE_HREF.sub('href="#"', html)








############################################################
# _link
############################################################
#
# A citation as an https link (only https URLs become links —
# anything else stays text).
#
# Used by:
#   - analysis/pdf.py
############################################################

def _link(label, url):
    if isinstance(url, str) and url.startswith("https://"):
        return f'<a href="{escape(url, quote=True)}">{escape(label)}</a>'
    return escape(label)








############################################################
# _flag
############################################################
#
# A tri-state profile flag in the report language.
#
# Used by:
#   - _profile_rows (below)
############################################################

def _flag(L, value):
    return L["unknown_value"] if value is None else (L["yes"] if value else L["no"])








############################################################
# _approval
############################################################
#
# The sign-off line: who approved the report and when, or
# that nobody has yet.
#
# Used by:
#   - render_xlsx (below), analysis/pdf.py
############################################################

def _approval(L, report):
    if report.approved_at is None or report.approved_by is None:
        return L["not_approved"]
    who = report.approved_by.display_name or report.approved_by.email
    note = f" — {report.approval_note}" if report.approval_note else ""
    return f"{L['approved']}: {who}, {report.approved_at:%Y-%m-%d}{note}"








############################################################
# _scope_approval
############################################################
#
# Who approved the list of acts the report assesses, and
# when — or that the report ran without that review.
#
# Used by:
#   - render_xlsx (below), analysis/pdf.py
############################################################

def _scope_approval(L, report):
    if report.scope_approved_at is None or report.scope_approved_by is None:
        return L["scope_unattended"]
    who = report.scope_approved_by.display_name or report.scope_approved_by.email
    return f"{who}, {report.scope_approved_at:%Y-%m-%d}"








############################################################
# _profile_rows
############################################################
#
# (label, value) rows of the frozen profile — what the report
# actually ran on — in the report's words: the institution
# type and the size by their names, not their codes.
#
# Used by:
#   - render_xlsx (below), analysis/pdf.py
############################################################

def _profile_rows(L, report):
    snapshot = report.profile_snapshot or {}
    return [
        (L["company"], snapshot.get("name") or report.company.name),
        (L["code"], snapshot.get("registrationCode") or L["none"]),
        (L["institution"], L["institutions"].get(snapshot.get("institutionType"), snapshot.get("institutionType") or L["none"])),
        (L["size"], L["sizes"].get(snapshot.get("sizeCategory"), snapshot.get("sizeCategory") or L["none"])
         + (f" ({L['employees']}: {snapshot['employees']})" if snapshot.get("employees") else "")),
        ("NACE", ", ".join(snapshot.get("naceCodes") or []) or L["none"]),
        (L["activities"], (snapshot.get("activities") or L["none"])[:1500]),
        (L["uses_ai"], _flag(L, snapshot.get("usesAi"))),
        (L["processes_data"], _flag(L, snapshot.get("processesPersonalData"))),
    ]








############################################################
# render_xlsx
############################################################
#
# Sheets: overview (counts — those of the acts assessed as
# preparation on rows of their own — + summary + provenance),
# profile and credentials, acts (the verdict, what the report
# did with the act, the date it applies from, what is still
# to confirm), findings (filterable, severity/status coloured,
# citation links; the last column dates a finding of an act
# not yet in force), the citation audit (problems first,
# verdicts coloured, provision links), actions. Every text
# cell is stored as text — never as a formula.
#
# Used by:
#   - analysis/api/views.py — export_report
############################################################

def render_xlsx(report):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    L, acts, findings, actions, citations = _data(report)
    stats = report.stats or {}
    book = Workbook()
    header_fill = PatternFill("solid", fgColor="1F3A5F")
    header_font = Font(color="FFFFFF", bold=True)
    wrap = Alignment(wrap_text=True, vertical="top")

    def as_text(ws):
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value[:1] in ("=", "+", "-", "@"):
                    cell.data_type = "s"

    def sheet(title, headers, rows, widths):
        ws = book.create_sheet(title[:31])
        ws.append(headers)
        for cell in ws[1]:
            cell.fill, cell.font = header_fill, header_font
        for row in rows:
            ws.append(row)
        for column, width in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(column)].width = width
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = wrap
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        as_text(ws)
        return ws


    # STEP 1: overview with counts, summary and provenance
    # ====================================================
    summary = book.active
    summary.title = L["overview"][:31]
    summary.append([L["title"], report.title])
    summary.append([L["company"], report.company.name])
    summary.append([L["date"], f"{report.finished_at or report.created_at:%Y-%m-%d}"])
    summary.append([L["approved"], _approval(L, report)])
    summary.append([L["scope_approved"], _scope_approval(L, report)])
    for status, count in stats.get("findings", {}).items():
        summary.append([L.get(status, status), count])
    for status, count in ((stats.get("upcoming") or {}).get("findings") or {}).items():
        summary.append([f"{L['upcoming']}: {L.get(status, status).lower()}", count])
    audit = stats.get("citations")
    if isinstance(audit, dict):
        summary.append([f"{L['citations']}: {L['checked'].lower()}", audit.get("checked", 0)])
        for verdict in VERDICTS:
            summary.append([f"{L['citations']}: {L['citation_' + verdict].lower()}",
                            audit.get(VERDICT_STAT_KEYS[verdict], 0)])
    else:
        summary.append([L["citations"], L["citations_not_run"]])
    summary.append([L["summary"], report.summary])
    provenance = stats.get("provenance") or {}
    summary.append([L["reviewed_obligations"], f"{stats.get('reviewedObligations', 0)} / {len(findings)}"])
    summary.append([L["prompts"], ", ".join(f"{p['slug']} v{p['version']}" for p in provenance.get("prompts", []))])
    summary.append([L["models"], ", ".join(provenance.get("models", []))])
    summary.append([L["corpus"], "; ".join(f"{c['act']} v{c['versionNo']} ({c['versionDate']})"
                                           for c in provenance.get("corpus", []))])
    summary.column_dimensions["A"].width, summary.column_dimensions["B"].width = 34, 120
    for row in summary.iter_rows():
        row[0].font = Font(bold=True)
        for cell in row:
            cell.alignment = wrap
    as_text(summary)


    # STEP 2: profile + credentials, acts, findings, the
    # citation audit, actions
    # ==================================================
    credentials = (report.profile_snapshot or {}).get("credentials") or []
    sheet(L["profile"], [L["field"], L["value"]],
          [[label, str(value)] for label, value in _profile_rows(L, report)]
          + [[f"{L['credentials']}: {c.get('name', '')}",
              f"{c.get('issuer') or L['none']}; {c.get('identifier') or L['none']}; "
              f"{L['verified'] if c.get('status') == 'verified' else L['claimed']}"] for c in credentials],
          [40, 100])

    sheet(L["acts"], [L["act"], "", L["applicability"], L["confidence"], L["reasoning"], L["citation"], L["treatment"],
                      L["applies_from"], L["to_confirm"]],
          [[a.short_title, a.document_title + (f" ({L['standard']})" if a.doc_type == "standard" else ""),
            L[a.applicability], round(a.confidence, 2), a.reasoning,
            ", ".join(c.get("path", "") for c in a.citations), _treatment(L, a),
            a.applies_from.isoformat() if a.applies_from else "", a.conditions_to_verify] for a in acts],
          [16, 50, 16, 12, 80, 30, 30, 14, 60])

    later = {a.id: a.applies_from.isoformat() for a in acts if a.assessment == "upcoming" and a.applies_from}
    ws = sheet(L["findings"], ["#", L["act"], L["citation"], L["obligation"], L["status"], L["severity"],
                               L["category"], L["analysis"], L["recommendation"], L["evidence"], L["deadline"],
                               L["note"], L["reviewed"], L["applies_from"], L["consequence"], L["cause"]],
               [[f.order, f.short_title or f.document_title,
                 "; ".join((f"{c.get('documentTitle', '')} {c.get('path', '')}".strip() if f.source_kind == "internal"
                            else c.get("path", "")) for c in f.citations),
                 f"{f.obligation_title}\n{f.obligation_text}", L[effective_status(f)], L[f.severity], f.category,
                 f.analysis, f.recommendation,
                 "\n".join(f"{e.get('title', '')}: {e.get('quote', '')}" for e in f.evidence), f.deadline,
                 f.reviewer_note, L["yes"] if f.obligation_reviewed else L["no"], later.get(f.act_id, ""),
                 gap_consequence(L, f), f.cause]
                for f in findings],
               [5, 14, 18, 60, 13, 11, 16, 60, 60, 50, 20, 30, 12, 14, 50, 40])
    colors = {L[k]: v.lstrip("#") for k, v in {**STATUS_COLORS, **SEVERITY_COLORS}.items()}
    for row in ws.iter_rows(min_row=2, min_col=5, max_col=6):
        for cell in row:
            if cell.value in colors:
                cell.fill = PatternFill("solid", fgColor=colors[cell.value])
                cell.font = Font(color="FFFFFF", bold=True)
    for finding, row in zip(findings, ws.iter_rows(min_row=2, min_col=3, max_col=3)):
        url = next((c.get("url") for c in finding.citations if str(c.get("url", "")).startswith("https://")), None)
        if url:
            row[0].hyperlink = url

    judges = {"model": L["judge_model"], "overlap": L["judge_overlap"]}
    ws = sheet(L["citations"], ["#", L["document"], L["cited_as"], L["act"], L["article"], L["paragraph"], L["point"],
                                L["claim"], L["quote"], L["verdict"], L["actual"], L["heading"], L["judge_note"],
                                L["judged_by"]],
               [[c.order, c.document_title, _cited_as(report.language, c), c.act, c.article, c.paragraph, c.point,
                 c.claim, c.quote, L["citation_" + citation_verdict(c.status, c.heading_match)],
                 f"{c.short_title} {c.unit_path}".strip(), c.heading, c.note, judges.get(c.judged_by, "")]
                for c in citations],
               [5, 30, 26, 16, 10, 10, 8, 50, 50, 18, 22, 40, 50, 16])
    verdict_colors = {L["citation_" + k]: v.lstrip("#") for k, v in VERDICT_COLORS.items()}
    for row in ws.iter_rows(min_row=2, min_col=10, max_col=10):
        for cell in row:
            if cell.value in verdict_colors:
                cell.fill = PatternFill("solid", fgColor=verdict_colors[cell.value])
                cell.font = Font(color="FFFFFF", bold=True)
    for citation, row in zip(citations, ws.iter_rows(min_row=2, min_col=11, max_col=11)):
        if citation.citation_url.startswith("https://"):
            row[0].hyperlink = citation.citation_url
    if not isinstance(stats.get("citations"), dict) or not citations:
        ws.append(["", L["citations_not_run"] if not isinstance(stats.get("citations"), dict) else L["citations_none"]])
        as_text(ws)

    sheet(L["actions"], [L["priority"], L["actions"], L["recommendation"], L["timeframe"], L["owner"], L["effort"],
                         L["category"]],
          [[a.priority, a.title, a.description, L.get(a.timeframe, a.timeframe), a.owner_role,
            L.get("effort_" + a.effort, a.effort), a.category] for a in actions],
          [9, 45, 90, 16, 24, 10, 18])

    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()








############################################################
# render_actions_xlsx
############################################################
#
# A company's action register as a workbook, in the columns
# of the course's findings-and-actions register: the action,
# the findings it is to close (each with its act and
# provision, and whether a later report confirmed it), the
# owner, the due date, the state as shown — late when past
# due — the report it came from, and how and when it was
# closed. Every text cell is stored as text.
#
# Used by:
#   - analysis/api/views.py — export_actions
############################################################

def render_actions_xlsx(company, language="lt"):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    from compliance.analysis.models import CompanyAction
    from compliance.analysis.register import state_of
    from compliance.common.timestamps import utc_now

    L, today = LABELS.get(language, LABELS["lt"]), utc_now().date()
    book = Workbook()
    ws = book.active
    ws.title = L["register"][:31]
    ws.append(["#", L["actions"], L["closes"], L["owner"], L["due"], L["state"], L["priority"], L["from_report"],
               L["closed_on"], L["closed_how"], L["notes"]])
    order = {"late": 0, "open": 1, "in_progress": 1, "done": 2, "closed": 3}
    rows = sorted(CompanyAction.objects.select_related("report").filter(company=company),
                  key=lambda action: (order[state_of(action, today)], action.due_date, action.priority))
    for number, action in enumerate(rows, 1):
        closes = "\n".join(
            f"{item.get('title', '')} ({' '.join(part for part in (item.get('act'), item.get('path')) if part)})"
            + (f" — {L['item_confirmed']}" if item.get("confirmed") else "") for item in action.items)
        how = ("confirmed" if action.confirmed_report_id else "manual") if action.status == "closed" else ""
        ws.append([number, f"{action.title}\n{action.description}".strip(), closes, action.owner,
                   action.due_date.isoformat(), L["states"][state_of(action, today)], action.priority,
                   f"{action.report.created_at:%Y-%m-%d}" if action.report_id and action.report else "",
                   f"{action.closed_at:%Y-%m-%d}" if action.closed_at else "", L["closed_ways"].get(how, ""), action.note])
    for cell in ws[1]:
        cell.font, cell.fill = Font(color="FFFFFF", bold=True), PatternFill("solid", fgColor="173A6E")
    for cells in ws.iter_rows():
        for cell in cells:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if isinstance(cell.value, str):
                cell.data_type = "s"
    for column, width in enumerate([5, 60, 70, 26, 12, 22, 9, 12, 12, 26, 40], 1):
        ws.column_dimensions[get_column_letter(column)].width = width
    ws.freeze_panes = "A2"
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()

