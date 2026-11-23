############################################################
#  [*] Tests — standards as real copies lay them out
#
#  The clause parser against the shapes a real PDF's text
#  takes. Every fixture here is written for the test, but its
#  layout is copied from what the extractor gave for real
#  documents (2026-11): ISO/IEC 27001, 27002 and 42001 as
#  their publisher typesets them, ETSI EN 303 645, the
#  ISO/IEC drafting directives and the Lithuanian LST guides.
#  Each case below failed, or would have, on one of them:
#
#    - a stamp of several lines under every page, the page
#      number glued to the copyright line on one page and
#      alone on a line on the next, the page number first on
#      a page, a running title on the first page of the body
#    - a contents entry wrapped over two lines, which opened
#      an annex before the body and swallowed it
#    - term numbers opening four pages in a row, which looked
#      like one repeated line once their digits were folded
#    - paragraphs numbered like clauses, and a reference that
#      merely starts a line
#    - a control table whose names wrap, break a word with a
#      hyphen, or share their line with the column word
#    - an annex's heading shown as an example in the text
#    - an annex named the ETSI and the LST way
#
#  The PDF cases go through the real extraction: a PDF built
#  here page by page, secured the ways a bought copy is.
############################################################


import io


from django.test import SimpleTestCase, TestCase


from compliance.common.extraction import extract_text
from compliance.corpus.models import LegalUnit
from compliance.corpus.search import find_provision, resolve_document
from compliance.corpus.standards import parse_standard
from compliance.corpus.structure import iter_units
from compliance.tests.fakes import fake_models
from compliance.tests.test_standards import ingest_standard
from compliance.tests.utils import create_admin, signed_in


HEAD = "ISO/IEC 99001:2026(E)"
RIGHTS = "© ISO/IEC 2026 – All rights reserved"

# What a reseller or a licence prints under every page
STAMP = ["Licensed copy for UAB Testas", "(order 1042, single user)", "Document Preview", "ISO/IEC 99001:2026",
         "https://shop.example.org/catalog/standards/iso-iec-99001-2026"]

# The words of the furniture — none may survive in a clause
FURNITURE = (HEAD, "©", "Licensed copy", "single user", "Document Preview", "shop.example.org", "Contents Page",
             "ST ANDARD")

ISO_PAGES = [
    ["Information security — Management systems — Requirements", "Third edition", "Reference number", HEAD,
     "© ISO/IEC 2026", *STAMP],
    ["ii", HEAD, "COPYRIGHT PROTECTED DOCUMENT",
     "All rights reserved. Unless otherwise specified, no part of this publication may be reproduced.", RIGHTS, *STAMP],
    [HEAD, "Foreword ................................................................ iv",
     "0  Introduction ......................................................... v",
     "1  Scope ................................................................... 1",
     "3  Terms and definitions .................................................. 1",
     "4.2  Understanding the needs and expectations of interested parties  ......2",
     "Annex A  (normative) Reference controls for the security of information and of the",
     "systems that process it ................................................... 11",
     "Bibliography .............................................................. 19",
     f"iii{RIGHTS}  ", "Contents Page", *STAMP],
    [HEAD, "Foreword", "This document was prepared by the committee on information security.",
     "Annex A of this document lists the reference controls.", f"iv    {RIGHTS}", *STAMP],
    [HEAD, "0  Introduction", "0.1   General",
     "This document provides requirements for establishing a management system.", RIGHTS, "v", *STAMP],
    [HEAD, "Information security — Management systems —", "Requirements", "1  Scope",
     "This document specifies the requirements for establishing the management system.",
     "2  Normative references", "The following documents are referred to in the text.",
     "3  Terms and definitions", "For the purposes of this document, the following terms apply.",
     "3.1", "organization", "person or group of people that has its own functions to achieve its objectives",
     "3.2", "interested party", "person or organization that can affect or be affected by a decision",
     f"INTERNATIONAL ST ANDARD {HEAD}", f"1{RIGHTS}  ", *STAMP],
    [HEAD, "3.3", "top management", "person or group of people who directs an organization at the highest level",
     "3.4", "management system", "set of interrelated elements of an organization to establish policies",
     f"2    {RIGHTS}", *STAMP],
    [HEAD, "3.5", "policy", "intentions and direction of an organization", "3.6", "objective",
     "result to be achieved", RIGHTS, " ", "3", *STAMP],
    [HEAD, "3.7", "risk", "effect of uncertainty", "3.8", "process",
     "set of interrelated activities that uses inputs to deliver a result", f"4    {RIGHTS}", *STAMP],
    [HEAD, "3.9", "competence", "ability to apply knowledge and skills to achieve intended results",
     "4  Context of the organization", "4.1  Understanding the organization and its context",
     "The organization shall determine external and internal issues that are relevant to its purpose and that",
     "affect its ability to achieve the intended outcome(s) of its management system.", RIGHTS, "5", *STAMP],
    [HEAD, "The organization shall keep this determination up to date as its context changes over time and",
     "review it at planned intervals.", "4.2  Understanding the needs and expectations of interested parties",
     "The organization shall determine:", "a) interested parties that are relevant to the management system;",
     "b) the relevant requirements of these interested parties.", "5  Leadership",
     "5.1  Leadership and commitment", "Top management shall demonstrate leadership and commitment.",
     f"6    {RIGHTS}", *STAMP],
    [HEAD, "Annex A", "(normative)", "Reference controls", "Table A.1 — Controls", "5  Organizational controls",
     "5.1 Policies for information secu-", "rity", "Control",
     "Information security policy and topic-specific policies shall be de-", "fined and approved by management.",
     "5.2 Information security roles and", "responsibilities", "Control",
     "Information security roles and responsibilities shall be defined and allocated.",
     "5.3 Segregation of duties Control", "Conflicting duties and areas of responsibility shall be segregated.",
     "5.4", "Management responsibilities", "Control",
     "Management shall require all personnel to apply information security.",
     "5.5 Managing information secu-", "rity in the information and com-", "munication technology (ICT) sup-",
     "ply chain", "Control", "Processes shall be defined to manage the risks of the supply chain.",
     RIGHTS, "7", *STAMP],
    [HEAD, "Bibliography", "[1] ISO/IEC 27002:2022, Information security controls", f"8    {RIGHTS}", *STAMP],
]
ISO_TEXT = "\n\f\n".join("\n".join(page) for page in ISO_PAGES)

LST_HEAD = "LST 9999:2026"
LST_PAGES = [
    [f"© Lietuvos standartizacijos departamentas, 2026 1", LST_HEAD, "Įmonės valdymo sistema. Reikalavimai",
     "1 Taikymo sritis", "Šiame standarte nustatomi reikalavimai įmonės valdymo sistemai.",
     "4 Bendrieji reikalavimai",
     "4.1 Organizacija turi nustatyti ir dokumentuoti savo valdymo sistemos taikymo sritį, atsižvelgdama į išorės ir",
     "vidaus aplinkybes bei suinteresuotųjų šalių poreikius.",
     "4.2 Vadovybė paskiria už valdymo sistemą atsakingą asmenį.",
     "4.3 Atsakingas asmuo kasmet peržiūri rizikos vertinimą ir apie jo rezultatus praneša vadovybei, kaip nurodyta",
     "4.5 punkte, ir saugo peržiūros įrašus."],
    [LST_HEAD, "2 © Lietuvos standartizacijos departamentas, 2026",
     "4.4 Peržiūros rezultatai aptariami vadovybės posėdyje ne vėliau kaip per mėnesį nuo peržiūros pabaigos, o",
     "sprendimai įforminami protokolu.", "5 Dokumentai", "5.1 Dokumentų valdymas",
     "5.1.1 Dokumentai peržiūrimi kasmet.", "5.1.2 Pasenę dokumentai pašalinami iš naudojimo vietų."],
    [f"© Lietuvos standartizacijos departamentas, 2026 3", LST_HEAD, "A priedas (norminis)",
     "Rizikos vertinimo forma, naudojama atliekant kasmetinę valdymo sistemos", "peržiūrą",
     "Forma pildoma kasmet ir saugoma penkerius metus."],
    [LST_HEAD, "4 © Lietuvos standartizacijos departamentas, 2026", "Bibliografija",
     "LST EN ISO 9001:2015 Kokybės vadybos sistemos. Reikalavimai"],
]
LST_TEXT = "\n\f\n".join("\n".join(page) for page in LST_PAGES)

EXAMPLE_PAGES = [
    ["ISO GUIDE 5", "1 Scope", "This guide says how a standard is laid out.", "2 Normative references", "None.",
     "3 Terms and definitions", "No terms are defined.", "4 Annexes", "4.1 Purpose",
     "Annexes give additional information.", "4.2 Layout", "EXAMPLE The heading of an annex:", "Annex A",
     "(informative)", "Example form", "The example ends here.", "4.3 Numbering", "Annexes are lettered.",
     "5 Bibliography", "5.1 Purpose", "A checklist names the list of referenced documents so:", "Bibliography",
     "(Clause 5)", "The body ends here."],
    ["ISO GUIDE 5", "Annex A", "(informative)", "Checklist", "A.1 General", "Use this checklist before publication."],
    ["ISO GUIDE 5", "Bibliography", "[1] ISO/IEC Directives, Part 2"],
]
EXAMPLE_TEXT = "\n\f\n".join("\n".join(page) for page in EXAMPLE_PAGES)

ETSI_TEXT = """1 Scope
The present document specifies provisions for devices.
2 References
2.1 Normative references
Not applicable.
3 Definition of terms, symbols and abbreviations
3.1 Terms
No terms are defined.
4 Reporting implementation
Annex A (informative) of the present document has been included to provide context.
A justification shall be recorded for each recommendation that is not fulfilled.
5 Provisions
5.1 No universal default passwords
Provision 5.1-1 Where passwords are used, they shall be unique per device.
Annex A (informative):
Basic concepts and models
A.1 Architecture
A device is a collection of hardware and software components.
Annex B (informative): Implementation statement
5.1 No universal default passwords
The table row names the provisions of clause 5.1.
History"""








############################################################
# units_of
############################################################
#
# A parsed tree as {number or type: unit} and its rows of
# (type, number, heading) in document order.
#
# Used by:
#   - the test cases below
############################################################

def units_of(text, language):
    tree = parse_standard(text, language)
    rows = [(unit.unit_type, unit.number, unit.heading) for unit, _, _ in iter_units(tree)]
    by_number = {unit.number or unit.unit_type: unit for unit, _, _ in iter_units(tree)}
    return tree, rows, by_number








############################################################
# text_pdf
############################################################
#
# A real PDF with the given pages of text lines (Latin-1),
# one line under the other — and, when asked, secured the way
# pypdf's writer secures one.
#
# Used by:
#   - the PDF test cases below
############################################################

def text_pdf(pages, **security):
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    font = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica")}))
    for lines in pages:
        page = writer.add_blank_page(595, 842)
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
        escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
        shown = " ".join(f"({line}) Tj 0 -12 Td" for line in escaped)
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 9 Tf 50 800 Td {shown} ET".encode("latin-1"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    if security:
        writer.encrypt(**security)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


# A standard of five pages as a PDF: a header, a footer with
# the page number and a licence line on each
PDF_PAGES = [
    ["ISO 99002:2026", "1 Scope", "This document specifies the requirements for the system.",
     "2 Normative references", "There are no normative references.", "Licensed to UAB Testas, order 1042",
     "Page 1"],
    ["ISO 99002:2026", "3 Terms and definitions", "No terms are defined.", "4 Context of the organization",
     "4.1 Understanding the organization", "The organization shall determine its context.",
     "Licensed to UAB Testas, order 1042", "Page 2"],
    ["ISO 99002:2026", "4.2 Interested parties", "The organization shall determine the interested parties.",
     "5 Leadership", "5.1 Commitment", "Top management shall demonstrate commitment.",
     "Licensed to UAB Testas, order 1042", "Page 3"],
    ["ISO 99002:2026", "Annex A", "(normative)", "Controls", "A.1 Policy", "A policy shall be defined.",
     "Licensed to UAB Testas, order 1042", "Page 4"],
    ["ISO 99002:2026", "Bibliography", "[1] ISO 9000, Quality management systems",
     "Licensed to UAB Testas, order 1042", "Page 5"],
]








class IsoLayoutTests(SimpleTestCase):

    def setUp(self):
        self.tree, self.rows, self.units = units_of(ISO_TEXT, "en")

    def test_the_whole_tree_is_read(self):
        numbers = [number for kind, number, _ in self.rows if kind == "clause"]
        self.assertEqual(numbers, [
            "0", "0.1", "1", "2", "3", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9",
            "4", "4.1", "4.2", "5", "5.1", "A.5", "A.5.1", "A.5.2", "A.5.3", "A.5.4", "A.5.5"])
        self.assertEqual([(kind, number, heading) for kind, number, heading in self.rows if kind == "annex"],
                         [("annex", "A", "Reference controls")])
        self.assertEqual(self.rows[0][0], "preamble")
        self.assertEqual(self.tree[-1].path, "Bibliography")

    def test_nothing_a_page_repeats_is_left_in_a_clause(self):
        for unit in self.tree[1:]:
            text = unit.full_text("en")
            for word in FURNITURE:
                self.assertNotIn(word, text, f"{word!r} in {unit.unit_type} {unit.number}")
        # The page numbers that stood alone on their lines went too
        self.assertNotIn("\n3\n", f"\n{self.units['3.6'].full_text('en')}\n")
        self.assertEqual(self.units["4.1"].lines[-1], "review it at planned intervals.",
                         "the clause goes on over the page break, nothing between")

    def test_the_contents_open_nothing(self):
        # Neither its entries nor the annex its wrapped entry names
        text = "\n".join(unit.full_text("en") for unit in self.tree)
        self.assertEqual(text.count("Understanding the needs and expectations of interested parties"), 1)
        self.assertNotIn("Reference controls for the security of information", text)
        self.assertIn("Annex A of this document lists the reference controls.", self.tree[0].lines,
                      "the foreword names the annex and stays the foreword")

    def test_term_entries_keep_their_numbers_at_the_top_of_a_page(self):
        terms = {number: heading for kind, number, heading in self.rows if number.startswith("3.")}
        self.assertEqual(terms, {
            "3.1": "organization", "3.2": "interested party", "3.3": "top management", "3.4": "management system",
            "3.5": "policy", "3.6": "objective", "3.7": "risk", "3.8": "process", "3.9": "competence"})
        self.assertEqual(self.units["3.6"].lines, ["result to be achieved"], "a short definition is no heading's end")

    def test_the_control_table_gives_whole_names(self):
        names = {number: heading for kind, number, heading in self.rows if number.startswith("A.5.")}
        self.assertEqual(names, {
            "A.5.1": "Policies for information security",
            "A.5.2": "Information security roles and responsibilities",
            "A.5.3": "Segregation of duties",
            "A.5.4": "Management responsibilities",
            "A.5.5": "Managing information security in the information and communication technology (ICT) supply chain"})
        self.assertEqual(self.units["A.5.1"].lines, [
            "Control", "Information security policy and topic-specific policies shall be de-",
            "fined and approved by management."], "the text is kept as printed")
        self.assertEqual(self.units["A.5.3"].lines, ["Conflicting duties and areas of responsibility shall be segregated."])








class NumberedParagraphTests(SimpleTestCase):

    def setUp(self):
        self.tree, self.rows, self.units = units_of(LST_TEXT, "lt")

    def test_paragraphs_are_clauses_without_headings(self):
        self.assertEqual([(number, heading) for kind, number, heading in self.rows if kind == "clause"], [
            ("1", "Taikymo sritis"), ("4", "Bendrieji reikalavimai"), ("4.1", ""), ("4.2", ""), ("4.3", ""),
            ("4.4", ""), ("5", "Dokumentai"), ("5.1", "Dokumentų valdymas"), ("5.1.1", ""), ("5.1.2", "")])
        # Its text opens with its number once
        self.assertEqual(self.units["4.2"].full_text("lt"), "4.2 Vadovybė paskiria už valdymo sistemą atsakingą asmenį.")
        self.assertTrue(self.units["4.1"].full_text("lt").startswith("4.1 Organizacija turi nustatyti"))

    def test_a_reference_that_starts_a_line_stays_text(self):
        self.assertEqual(self.units["4.3"].lines[-1], "4.5 punkte, ir saugo peržiūros įrašus.")
        self.assertNotIn("4.5", self.units)

    def test_the_annex_takes_its_wrapped_title_and_the_footers_go(self):
        annex = self.units["A"]
        self.assertEqual(annex.heading, "Rizikos vertinimo forma, naudojama atliekant kasmetinę valdymo sistemos peržiūrą")
        self.assertEqual(annex.lines, ["(norminis)", "Forma pildoma kasmet ir saugoma penkerius metus."])
        self.assertEqual(self.tree[-1].lines, ["Bibliografija", "LST EN ISO 9001:2015 Kokybės vadybos sistemos. Reikalavimai"])
        self.assertNotIn("©", "\n".join(unit.full_text("lt") for unit in self.tree[1:]))








class AnnexTests(SimpleTestCase):

    def test_an_annex_shown_as_an_example_is_undone_when_the_body_goes_on(self):
        tree, rows, units = units_of(EXAMPLE_TEXT, "en")
        self.assertEqual([number for kind, number, _ in rows if kind == "clause"],
                         ["1", "2", "3", "4", "4.1", "4.2", "4.3", "5", "5.1", "A.1"])
        self.assertEqual([(number, heading) for kind, number, heading in rows if kind == "annex"], [("A", "Checklist")])
        # The example stayed where it was printed
        self.assertEqual(units["4.2"].lines, ["EXAMPLE The heading of an annex:", "Annex A", "(informative)",
                                              "Example form", "The example ends here."])
        # The word alone names no bibliography; the real one closes the document
        self.assertIn("Bibliography", units["5.1"].lines)
        self.assertEqual([unit.path for unit in tree if unit.unit_type == "text"], ["Bibliography"])

    def test_annexes_named_the_etsi_way(self):
        tree, rows, units = units_of(ETSI_TEXT, "en")
        self.assertEqual([(kind, number, heading) for kind, number, heading in rows if kind == "annex"], [
            ("annex", "A", "Basic concepts and models"), ("annex", "B", "Implementation statement")])
        self.assertEqual(units["A"].lines, ["(informative)"])
        # A sentence that opens with an annex's name is one
        self.assertIn("Annex A (informative) of the present document has been included to provide context.",
                      units["4"].lines)
        # A bare number in an annex is the annex's
        self.assertIn(("clause", "B.5.1", "No universal default passwords"), rows)








class PdfTests(TestCase):

    def test_page_boundaries_survive_only_when_asked_for(self):
        data = text_pdf(PDF_PAGES)
        paged, error = extract_text(data, "standard.pdf", "application/pdf", pages=True)
        self.assertIsNone(error)
        self.assertEqual(paged.count("\f"), len(PDF_PAGES) - 1)
        plain, _ = extract_text(data, "standard.pdf", "application/pdf")
        self.assertNotIn("\f", plain)
        self.assertEqual(paged.replace("\n\f\n", "\n\n"), plain, "the same text otherwise")

    def test_secured_pdfs_open_or_say_why_not(self):
        for algorithm in ("RC4-128", "AES-128", "AES-256"):
            data = text_pdf(PDF_PAGES, user_password="", owner_password="owner", algorithm=algorithm)
            text, error = extract_text(data, "standard.pdf", "application/pdf")
            self.assertIsNone(error, algorithm)
            self.assertIn("The organization shall determine its context.", text, algorithm)
        locked = text_pdf(PDF_PAGES, user_password="secret", owner_password="owner", algorithm="AES-256")
        self.assertEqual(extract_text(locked, "standard.pdf", "application/pdf"),
                         ("", "the PDF is password-protected — upload a copy that opens without a password"))
        secured = text_pdf(PDF_PAGES, user_password="", owner_password="owner", algorithm="RC4-128")
        plugin = secured.replace(b"/Standard", b"/FOPNfLok")
        text, error = extract_text(plugin, "standard.pdf", "application/pdf")
        self.assertEqual(text, "")
        self.assertIn("rights-management plug-in", error)

    def test_an_uploaded_pdf_is_read_without_its_page_furniture(self):
        admin_client = signed_in(create_admin())
        with fake_models():
            standard = ingest_standard(admin_client, text_pdf(PDF_PAGES, user_password="", owner_password="owner",
                                                              algorithm="AES-256"),
                                       short_title="ISO 99002:2026", filename="iso-99002.pdf")
        version = standard.current_version
        self.assertEqual(version.status, "ready", version.error)
        units = LegalUnit.objects.filter(version=version).order_by("ordinal")
        self.assertEqual([unit.number for unit in units if unit.unit_type == "clause"],
                         ["1", "2", "3", "4", "4.1", "4.2", "5", "5.1", "A.1"])
        for unit in units.exclude(unit_type="preamble"):
            for word in ("ISO 99002:2026", "Licensed to", "Page "):
                self.assertNotIn(word, unit.text, f"{word!r} in {unit.path}")
        self.assertEqual(find_provision("ISO 99002", "4.1")["text"],
                         "4.1 Understanding the organization\nThe organization shall determine its context.")

    def test_a_password_protected_pdf_fails_with_a_reason_an_admin_can_act_on(self):
        admin_client = signed_in(create_admin())
        with fake_models():
            standard = ingest_standard(admin_client, text_pdf(PDF_PAGES, user_password="secret", owner_password="owner",
                                                              algorithm="AES-256"),
                                       short_title="ISO 99002:2026", filename="iso-99002.pdf")
        self.assertIsNone(standard.current_version)
        self.assertEqual(standard.last_error, "Text extraction failed: the PDF is password-protected — upload a copy "
                                              "that opens without a password")








class EditionTests(TestCase):

    def _standard(self, short_title):
        from compliance.common.timestamps import utc_now
        from compliance.corpus.models import LegalDocument, LegalDocumentVersion
        now = utc_now()
        slug = short_title.lower().replace("/", "-").replace(" ", "-").replace(":", "-")
        document = LegalDocument.objects.create(id=slug, slug=slug, title="Requirements", short_title=short_title,
                                                jurisdiction="INTL", doc_type="standard", created_at=now, updated_at=now)
        version = LegalDocumentVersion.objects.create(id=f"v-{slug}", document=document, version_no=1, content_hash="0" * 64,
                                                      file_path="/nonexistent", status="ready", created_at=now)
        LegalDocument.objects.filter(id=document.id).update(current_version=version)
        return document

    def test_an_adoption_answers_for_the_international_standard_and_back(self):
        adopted = self._standard("LST EN ISO/IEC 27001:2023")
        for ref in ("ISO/IEC 27001:2022", "ISO 27001", "EN ISO/IEC 27001:2023", "LST EN ISO/IEC 27001:2023"):
            self.assertEqual(resolve_document(ref), adopted, ref)
        # Another edition is another text
        for ref in ("ISO/IEC 27001:2013", "LST EN ISO/IEC 27001:2017", "ISO/IEC 27002:2022"):
            self.assertIsNone(resolve_document(ref), ref)
        international = self._standard("ISO 22301:2019")
        self.assertEqual(resolve_document("LST EN ISO 22301:2020"), international)
        self.assertIsNone(resolve_document("LST EN ISO 22301:2014"))

    def test_other_publishers_and_names_without_a_number(self):
        etsi = self._standard("ETSI EN 303 645 V2.1.1")
        pci = self._standard("PCI DSS v4.0.1")
        self.assertEqual(resolve_document("EN 303 645"), etsi)
        self.assertEqual(resolve_document("ETSI EN 303 645"), etsi)
        self.assertEqual(resolve_document("PCI DSS"), pci)
        self.assertIsNone(resolve_document("EN 303 646"))
