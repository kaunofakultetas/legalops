############################################################
#  [*] Tests — standards that are not numbered the ISO way
#
#  corpus/outline.py gives every readable standard a tree:
#  the clause rules, the model where they read nothing, the
#  pages where neither did. The fixtures are a control
#  catalogue with identifiers of its own (families, controls
#  and bracketed enhancements), a framework whose outcomes
#  are sentences after their codes, a numbered standard with
#  a catalogue inside one long clause, and a text without any
#  structure. The model is the fake of tests/fakes.py, which
#  marks coded lines and lines in capitals — and whatever a
#  case adds to make it lie.
#
#  The layouts are copied from what the extractor gave for
#  real documents (2026-11): NIST SP 800-53 and SP 800-171,
#  the NIST Cybersecurity Framework, the OWASP ASVS. Each
#  of these cases failed on one of them before it was
#  written: a numbered list read as chapters, a requirement
#  printed 03.01.02, a heading whose first letter stands on
#  a line of its own, a running head that names its chapter,
#  a code behind a bullet or with a space inside it, a
#  function name that opens with its own abbreviation.
#
#  The first classes call read_standard alone; the last ones
#  go through the upload route and the ingest job.
############################################################


import re
from unittest import mock


from django.test import SimpleTestCase, TestCase


from compliance.corpus.models import LegalDocumentVersion, LegalUnit, Obligation
from compliance.corpus.obligations import provisions_of
from compliance.corpus.outline import OutlineUnavailable, read_standard
from compliance.corpus.search import find_provision
from compliance.corpus.standards import parse_standard
from compliance.corpus.structure import iter_units
from compliance.jobs.models import Job
from compliance.jobs.runner import run_once
from compliance.prompts.models import Prompt
from compliance.prompts.store import seed_defaults
from compliance.tests.fakes import FakeModel, fake_models
from compliance.tests.test_standards import ISO_TEXT, UNNUMBERED_TEXT, ingest_standard
from compliance.tests.utils import create_admin, post_json, signed_in


CATALOGUE_PAGES = [
    ["Security and Privacy Controls for Information Systems", "Revision 5",
     "This publication provides a catalog of security and privacy controls."],
    ["ACCESS CONTROL FAMILY",
     "AC-1 POLICY AND PROCEDURES",
     "Control: Develop, document, and disseminate an access control policy.",
     "Discussion: Access control policy and procedures address the controls in the AC family.",
     "AC-2 ACCOUNT MANAGEMENT",
     "Control: Define and document the types of accounts allowed for use within the system.",
     "Control Enhancements:",
     "(1) ACCOUNT MANAGEMENT | AUTOMATED SYSTEM ACCOUNT MANAGEMENT",
     "Support the management of system accounts using automated mechanisms.",
     "(2) ACCOUNT MANAGEMENT | AUTOMATED TEMPORARY ACCOUNT MANAGEMENT",
     "Automatically remove temporary accounts after a defined time period."],
    ["AUDIT AND ACCOUNTABILITY FAMILY",
     "AU-1 POLICY AND PROCEDURES",
     "Control: Develop, document, and disseminate an audit and accountability policy.",
     "AU-2 EVENT LOGGING",
     "Control: Identify the types of events that the system is capable of logging.",
     "(1) EVENT LOGGING | COMPILATION OF AUDIT RECORDS",
     "Withdrawn: incorporated into AU-12."],
]
CATALOGUE_TEXT = "\n\f\n".join("\n".join(page) for page in CATALOGUE_PAGES)

# Outcomes printed as sentences after their codes, each
# behind a bullet, under names that stand before a colon; a
# space inside one code, and a name over two lines
FRAMEWORK_LINES = [
    "The Cybersecurity Framework Core", "The Core is a set of cybersecurity outcomes arranged by function.",
    "GOVERN (GV): The organization’s cybersecurity risk management strategy, expectations, and",
    "policy are established, communicated, and monitored",
    "• Organizational Context (GV.OC): The circumstances surrounding the organization’s",
    "cybersecurity risk management decisions are understood",
    "o GV.OC-01: The organizational mission is understood and informs cybersecurity risk",
    "management",
    "o GV.OC-02: Internal and external stakeholders are understood",
    "IDENTIFY (ID): The organization’s current cybersecurity risks are understood",
    "• Risk Assessment (ID.RA): The cybersecurity risk to the organization is understood",
    "o ID .RA -01: Vulnerabilities in assets are identified, validated, and recorded",
]
FRAMEWORK_TEXT = "\n".join(FRAMEWORK_LINES)

# What the real model answered for such lines: the functions
# with their abbreviations for identifiers, the names over
# both their lines, the codes as it read them
FRAMEWORK_ANSWER = [
    {"line": 2, "lastLine": 3, "level": 1, "identifier": ""},
    {"line": 4, "lastLine": 5, "level": 2, "identifier": ""},
    {"line": 6, "lastLine": 6, "level": 3, "identifier": "GV.OC-01"},
    {"line": 8, "lastLine": 8, "level": 3, "identifier": "GV.OC-02"},
    {"line": 9, "lastLine": 9, "level": 1, "identifier": "ID"},
    {"line": 10, "lastLine": 10, "level": 2, "identifier": ""},
    {"line": 11, "lastLine": 11, "level": 3, "identifier": "ID .RA -01"},
]

HEAD = "NIST SP 800-171r3 Protecting Controlled Unclassified Information"

# A catalogue the rules read: chapters numbered with a full
# stop, families whose first letter is printed large,
# requirements numbered with zeros, numbered lists inside
# them — one that runs past the number of the chapter
REQUIREMENT_PAGES = [
    [HEAD, "May 2024", "1", "1. Introduction", "This publication protects controlled unclassified information.",
     "2. The Fundamentals", "The requirements were tailored from a moderate baseline."],
    [HEAD, "May 2024", "2", "3. The Security Requirements", "This section describes the families of requirements.",
     "3.1. A", "ccess Control", "03.01.01 Account Management",
     "a. Define the types of system accounts allowed and prohibited.", "f. Disable system accounts when:",
     "1. The accounts have expired,", "2. The accounts have been inactive for a defined period,",
     "3. The accounts are no longer associated with a user or individual,",
     "4. The accounts are in violation of organizational policy, or",
     "5. Significant risks associated with individuals are discovered.", "DISCUSSION",
     "This requirement focuses on account management for systems and applications."],
    [HEAD, "May 2024", "3", "03.01.02 Access Enforcement",
     "Enforce approved authorizations for logical access to information and system resources.",
     "3.2. A", "wareness and Training", "03.02.01 Literacy Training and Awareness",
     "a. Provide security literacy training to system users:", "1. As part of initial training for new users,",
     "2. When required by system changes,", "3. Following security incidents,", "4. Source of the event",
     "5. Outcome of the event", "6. Identity of the individuals associated with the event"],
]
REQUIREMENT_TEXT = "\n\f\n".join("\n".join(page) for page in REQUIREMENT_PAGES)

CONTROL = "The organization shall implement and review the measure described in this control every year. "

PROSE = "The operator keeps a record of every change to the processing environment. "
OPENING = ["1 Scope", "This document sets requirements for the handling of payment data.",
           "2 Normative references", "There are no normative references in this document.",
           "3 Terms and definitions", "No terms and definitions are listed in this document."]

# A numbered standard whose clause 4 is a catalogue of coded
# controls — less than half of the text, so the rules' tree
# is believed
NUMBERED_PAGES = [
    OPENING + ["4 Control catalogue"]
    + [line for number in range(1, 9) for line in (f"PD-{number} Control number {number}", *[CONTROL] * 22)],
    [line for number in range(5, 10) for line in (f"{number} Duties of role {number}", *[PROSE] * 60)],
]
NUMBERED_TEXT = "\n\f\n".join("\n".join(page) for page in NUMBERED_PAGES)

# … and one whose clause 4 is long prose over two pages
LONG_PAGES = [
    OPENING + ["4 Operation"] + [PROSE] * 160,
    ["Further duties of the operator follow from the contract with the acquirer. "] * 170,
]
LONG_TEXT = "\n\f\n".join("\n".join(page) for page in LONG_PAGES)








############################################################
# ask
############################################################
#
# The fake model as read_standard's `ask`, with the entries
# a case wants it to invent; `calls` collects what it was
# sent.
#
# Used by:
#   - the read_standard cases below
############################################################

def ask(calls=None, extra=()):
    model = FakeModel()
    model.extra_headings = list(extra)

    def answer(data):
        if calls is not None:
            calls.append(data)
        return model._outline(data)["headings"]

    return answer








############################################################
# scripted
############################################################
#
# A model that answers every outline request with the given
# headings, whatever it is sent — as read_standard's `ask`,
# or (patched over the fake's own answer) for the ingest.
#
# Used by:
#   - FrameworkTests, IngestTests (below)
############################################################

def scripted(headings):
    return mock.patch.object(FakeModel, "_outline", lambda self, prompt: {"headings": headings})








############################################################
# rows
############################################################
#
# A tree as (depth, number, heading, path) rows in document
# order.
#
# Used by:
#   - the read_standard cases below
############################################################

def rows(tree):
    return [(depth, unit.number, unit.heading, unit.path) for unit, _, depth in iter_units(tree)]








############################################################
# body_text
############################################################
#
# Every line of a tree's text in document order, the labels
# the units print for themselves included.
#
# Used by:
#   - the read_standard cases below
############################################################

def body_text(tree):
    return "\n".join(unit.full_text("en") for unit in tree)








class CatalogueTests(SimpleTestCase):

    def setUp(self):
        self.calls = []
        self.tree, self.used, self.notes = read_standard(CATALOGUE_TEXT, "en", ask=ask(self.calls), workers=1)

    def test_the_model_reads_what_the_rules_cannot(self):
        self.assertEqual((self.used, self.notes), ("standard-ai", []))
        self.assertEqual(rows(self.tree)[1:], [
            (0, "", "ACCESS CONTROL FAMILY", "ACCESS CONTROL FAMILY"),
            (1, "AC-1", "POLICY AND PROCEDURES", "AC-1"),
            (1, "AC-2", "ACCOUNT MANAGEMENT", "AC-2"),
            (2, "AC-2(1)", "ACCOUNT MANAGEMENT | AUTOMATED SYSTEM ACCOUNT MANAGEMENT", "AC-2(1)"),
            (2, "AC-2(2)", "ACCOUNT MANAGEMENT | AUTOMATED TEMPORARY ACCOUNT MANAGEMENT", "AC-2(2)"),
            (0, "", "AUDIT AND ACCOUNTABILITY FAMILY", "AUDIT AND ACCOUNTABILITY FAMILY"),
            (1, "AU-1", "POLICY AND PROCEDURES", "AU-1"),
            (1, "AU-2", "EVENT LOGGING", "AU-2"),
            (2, "AU-2(1)", "EVENT LOGGING | COMPILATION OF AUDIT RECORDS", "AU-2(1)")])
        self.assertEqual(self.tree[0].unit_type, "preamble")

    def test_every_line_of_the_document_is_in_the_tree_once(self):
        text = body_text(self.tree)
        for page in CATALOGUE_PAGES:
            for line in page:
                self.assertEqual(text.count(line), 1, line)
        self.assertNotIn("\f", text)

    def test_the_model_sees_numbered_lines_and_the_headings_before(self):
        self.assertEqual(len(self.calls), 1)
        self.assertIn("L3| ACCESS CONTROL FAMILY", self.calls[0])
        self.assertIn("Headings found before this excerpt", self.calls[0])

    def test_what_the_model_invents_is_not_taken(self):
        invented = [
            # No such line; a line of another excerpt would look the same
            {"line": 9000, "lastLine": 9000, "level": 1, "identifier": "ZZ-1"},
            # A paragraph called a heading, and a label that only leads into what follows
            {"line": 11, "lastLine": 11, "level": 2, "identifier": ""},
            {"line": 9, "lastLine": 9, "level": 2, "identifier": ""},
            # An identifier the line does not open with: the heading stays, the number is not believed
            {"line": 0, "lastLine": 0, "level": 1, "identifier": "SP 800-53"},
            {"line": "4", "lastLine": None, "level": "x", "identifier": 7},
        ]
        tree, used, _ = read_standard(CATALOGUE_TEXT, "en", ask=ask(extra=invented), workers=1)
        found = rows(tree)
        self.assertEqual(used, "standard-ai")
        self.assertNotIn("ZZ-1", {number for _, number, _, _ in found})
        self.assertNotIn("SP 800-53", {number for _, number, _, _ in found})
        self.assertIn((0, "", "Security and Privacy Controls for Information Systems",
                       "Security and Privacy Controls for Information Systems"), found)
        units = {unit.number: unit for unit, _, _ in iter_units(tree)}
        self.assertEqual(units["AC-2(1)"].lines, [CATALOGUE_PAGES[1][8]], "the paragraph stayed its control's text")
        self.assertEqual(units["AC-2"].lines[-1], "Control Enhancements:")
        text = body_text(tree)
        for page in CATALOGUE_PAGES:
            for line in page:
                self.assertEqual(text.count(line), 1, line)

    def test_entries_of_a_list_of_the_controls_do_not_open_them_twice(self):
        listed = ["Summary of the controls", "AC-1 Policy and Procedures", "AC-2 Account Management",
                  "AU-1 Policy and Procedures", "AU-2 Event Logging"]
        pages = [CATALOGUE_PAGES[0] + listed] + CATALOGUE_PAGES[1:]
        tree, _, _ = read_standard("\n\f\n".join("\n".join(page) for page in pages), "en", ask=ask(), workers=1)
        numbers = [number for _, number, _, _ in rows(tree) if number]
        self.assertEqual(numbers, ["AC-1", "AC-2", "AC-2(1)", "AC-2(2)", "AU-1", "AU-2", "AU-2(1)"])
        self.assertIn("AC-2 Account Management", tree[0].full_text("en"), "the list stays in the front matter")








class FrameworkTests(SimpleTestCase):

    def setUp(self):
        self.tree, self.used, _ = read_standard(FRAMEWORK_TEXT, "en", ask=lambda data: FRAMEWORK_ANSWER, workers=1)
        self.units = {unit.path: unit for unit, _, _ in iter_units(self.tree)}

    def test_functions_categories_and_outcomes_nest(self):
        self.assertEqual(self.used, "standard-ai")
        self.assertEqual([(depth, number, path) for depth, number, _, path in rows(self.tree)[1:]], [
            (0, "", "GOVERN (GV)"), (1, "", "Organizational Context (GV.OC)"), (2, "GV.OC-01", "GV.OC-01"),
            (2, "GV.OC-02", "GV.OC-02"), (0, "", "IDENTIFY (ID)"), (1, "", "Risk Assessment (ID.RA)"),
            (2, "ID.RA-01", "ID.RA-01")])

    def test_a_name_before_a_colon_is_the_heading_and_the_sentence_its_text(self):
        function = self.units["GOVERN (GV)"]
        self.assertEqual(function.lines, ["The organization’s cybersecurity risk management strategy, expectations, "
                                          "and policy are established, communicated, and monitored"])
        # The bullet is no part of the name
        self.assertEqual(self.units["Organizational Context (GV.OC)"].heading, "Organizational Context (GV.OC)")

    def test_an_abbreviation_that_opens_the_name_is_no_identifier(self):
        # ID is how IDENTIFY begins, not its number
        self.assertEqual((self.units["IDENTIFY (ID)"].number, self.units["IDENTIFY (ID)"].heading), ("", "IDENTIFY (ID)"))

    def test_a_code_behind_a_bullet_is_found_and_its_stray_spaces_go(self):
        # A sentence that goes on is the unit's text, as printed
        self.assertEqual((self.units["GV.OC-01"].heading, self.units["GV.OC-01"].lines), ("", FRAMEWORK_LINES[6:8]))
        self.assertEqual(self.units["ID.RA-01"].number, "ID.RA-01")
        self.assertIn("Vulnerabilities in assets are identified", self.units["ID.RA-01"].full_text("en"))
        text = body_text(self.tree)
        for words in ("Internal and external stakeholders are understood", "The cybersecurity risk to the organization",
                      "cybersecurity risk management decisions are understood"):
            self.assertEqual(text.count(words), 1, words)








class CatalogueByRulesTests(SimpleTestCase):

    def setUp(self):
        self.tree = parse_standard(REQUIREMENT_TEXT, "en")
        self.units = {unit.number: unit for unit, _, _ in iter_units(self.tree)}

    def test_numbered_lists_open_no_chapters(self):
        self.assertEqual([unit.number for unit, _, _ in iter_units(self.tree)],
                         ["1", "2", "3", "3.1", "03.01.01", "03.01.02", "3.2", "03.02.01"])
        # The items stay where they are printed — the fourth and fifth too, though chapter 4 was due
        self.assertIn("4. The accounts are in violation of organizational policy, or", self.units["03.01.01"].lines)
        self.assertEqual(self.units["03.02.01"].lines[-3:], REQUIREMENT_PAGES[2][-3:])

    def test_a_requirement_keeps_its_number_as_printed(self):
        requirement = self.units["03.01.02"]
        self.assertEqual((requirement.heading, requirement.path), ("Access Enforcement", "03.01.02"))

    def test_a_heading_whose_first_letter_stands_apart_is_put_together(self):
        self.assertEqual([self.units[number].heading for number in ("3.1", "3.2")],
                         ["Access Control", "Awareness and Training"])

    def test_the_running_head_of_one_chapter_goes_with_its_pages(self):
        head = "NIST SP 800-53, REV. 5 SECURITY AND PRIVACY CONTROLS"
        rule = "_" * 60
        pages = [[head, rule, f"CHAPTER THREE PAGE {number}"] + body for number, body in enumerate([
            ["1 Introduction", "This publication provides a catalog of controls."],
            ["2 Fundamentals", "Controls are organised into families."],
            ["3 Controls", "3.1 ACCESS CONTROL", "Access to the system is limited to authorized users."]]
            + [[f"Authorized users are identified in list number {number} of the system."] for number in range(13)], 1)]
        pages += [[head, rule, f"APPENDIX A PAGE {number}"] + body for number, body in enumerate([
            ["APPENDIX A", "GLOSSARY", "Terms used in this publication."], ["access control", "The process of granting access."],
            ["baseline", "A set of controls."], ["control", "A safeguard."]], 394)]
        tree = parse_standard("\n\f\n".join("\n".join(page) for page in pages), "en")
        text = "\n".join(unit.full_text("en") for unit in tree)
        for furniture in ("PAGE", "CHAPTER THREE", "SECURITY AND PRIVACY CONTROLS", "___"):
            self.assertNotIn(furniture, text, furniture)
        appendix = next(unit for unit in tree if unit.unit_type == "annex")
        self.assertEqual((appendix.number, appendix.heading), ("A", "GLOSSARY"))
        self.assertIn("A safeguard.", appendix.lines)








class FallbackTests(SimpleTestCase):

    def test_an_iso_standard_never_asks_the_model(self):
        def never(data):
            raise AssertionError("the model was asked")

        tree, used, notes = read_standard(ISO_TEXT, "en", ask=never, workers=1)
        self.assertEqual((used, notes), ("standard", []))
        self.assertIn("A.8.1", {unit.number for unit, _, _ in iter_units(tree)})

    def test_without_the_model_a_document_is_read_by_its_pages(self):
        def down(data):
            raise OutlineUnavailable("Prompt corpus.standard_outline has no active version")

        for given, said in ((down, "no active version"), (None, "indexed by its pages")):
            tree, used, notes = read_standard(CATALOGUE_TEXT, "en", ask=given, workers=1)
            self.assertEqual(used, "standard-pages")
            self.assertEqual(rows(tree), [(0, "p1", "", "p. 1"), (0, "p2", "", "p. 2"), (0, "p3", "", "p. 3")])
            self.assertEqual(tree[1].lines, CATALOGUE_PAGES[1])
            self.assertIn(said, notes[0])
            self.assertIn("indexed by its pages", notes[-1])
        lithuanian, _, _ = read_standard(CATALOGUE_TEXT, "lt", method="pages")
        self.assertEqual([unit.path for unit in lithuanian], ["1 psl.", "2 psl.", "3 psl."])

    def test_a_text_without_pages_is_cut_into_parts(self):
        tree, used, notes = read_standard(UNNUMBERED_TEXT * 12, "en", ask=ask(), workers=1)
        self.assertEqual(used, "standard-pages")
        self.assertIn("The model found no headings", notes[0])
        self.assertGreater(len(tree), 2)
        self.assertEqual([(unit.number, unit.path) for unit in tree[:2]], [("part1", "Part 1"), ("part2", "Part 2")])
        self.assertEqual("\n".join(line for unit in tree for line in unit.lines), UNNUMBERED_TEXT * 12)

    def test_the_admins_choice_is_followed(self):
        calls = []
        pages, used, notes = read_standard(ISO_TEXT, "en", method="pages", ask=ask(calls))
        self.assertEqual((used, notes, calls), ("standard-pages", [], []))
        self.assertEqual(pages[0].path, "p. 1")
        _, used, _ = read_standard(CATALOGUE_TEXT, "en", method="rules", ask=ask(calls))
        self.assertEqual((used, calls), ("standard-pages", []), "the rules alone, then the pages — never the model")
        _, used, _ = read_standard(CATALOGUE_TEXT, "en", method="ai", ask=ask(calls), workers=1)
        self.assertEqual((used, len(calls)), ("standard-ai", 1))








class RefinementTests(SimpleTestCase):

    def setUp(self):
        self.calls = []
        self.tree, self.used, self.notes = read_standard(NUMBERED_TEXT, "en", ask=ask(self.calls), workers=1)
        self.units = {unit.path: unit for unit, _, _ in iter_units(self.tree)}

    def test_a_catalogue_inside_a_numbered_clause_is_read_by_the_model(self):
        self.assertEqual((self.used, self.notes), ("standard-refined", []))
        catalogue = self.units["Clause 4"]
        self.assertEqual([(unit.number, unit.heading, unit.path) for unit in catalogue.children][:2],
                         [("PD-1", "Control number 1", "PD-1"), ("PD-2", "Control number 2", "PD-2")])
        self.assertEqual(len(catalogue.children), 8)
        self.assertEqual(catalogue.lines, [])
        # Only the long clauses were sent, each said to be one clause's text
        self.assertTrue(all("The text of one clause of the document" in call for call in self.calls))
        self.assertTrue(any("Clause 4 Control catalogue" in call for call in self.calls))
        self.assertFalse(any("1 Scope" in call for call in self.calls))

    def test_a_clause_too_long_to_cite_is_cut_by_its_pages(self):
        # The model is asked first — one clause holds the whole
        # text — and finds nothing; the rules' tree stands
        for given in (ask(), None):
            tree, used, notes = read_standard(LONG_TEXT, "en", ask=given, workers=1)
            self.assertEqual(used, "standard")
            operation = next(unit for unit in tree if unit.number == "4")
            self.assertEqual([(unit.number, unit.path) for unit in operation.children],
                             [("4/p1", "Clause 4, p. 1"), ("4/p2", "Clause 4, p. 2")])
            self.assertEqual((operation.heading, operation.lines), ("Operation", []))
            self.assertTrue(operation.children[1].lines[0].startswith("Further duties of the operator"))
            self.assertEqual(bool(notes), given is not None)

    def test_long_text_before_the_subclauses_is_cut_too(self):
        pages = [OPENING + ["4 Operation"] + [PROSE] * 170, [PROSE] * 170 + ["4.1 Records", "Records shall be kept."]]
        tree, _, _ = read_standard("\n\f\n".join("\n".join(page) for page in pages), "en", method="rules")
        operation = next(unit for unit in tree if unit.number == "4")
        self.assertEqual([unit.path for unit in operation.children], ["Clause 4, p. 1", "Clause 4, p. 2", "4.1"])

    def test_without_the_model_the_rules_tree_stands(self):
        tree, used, notes = read_standard(NUMBERED_TEXT, "en", method="rules")
        self.assertEqual((used, notes), ("standard", []))
        paths = [unit.path for unit, _, _ in iter_units(tree)]
        self.assertIn("Clause 4", paths)
        self.assertNotIn("PD-1", paths)

    def test_a_numbered_list_taken_for_the_clauses_is_not_believed(self):
        # Three list items near the start read as clauses 1 to 3,
        # and the whole catalogue falls under the third
        listed = ["Purpose of this catalogue", "1 Confidentiality", "2 Integrity", "3 Availability"]
        controls = [line for number in range(1, 9) for line in (f"PD-{number} Control number {number}", *[CONTROL] * 22)]
        tree, used, _ = read_standard("\n".join(listed + controls), "en", ask=ask(), workers=1)
        self.assertEqual(used, "standard-ai")
        self.assertEqual([unit.number for unit in tree if unit.unit_type == "clause"], [f"PD-{n}" for n in range(1, 9)])








class IngestTests(TestCase):

    def setUp(self):
        seed_defaults()
        self.admin_client = signed_in(create_admin())

    def _catalogue(self, text=CATALOGUE_TEXT):
        return ingest_standard(self.admin_client, text, title="Security and Privacy Controls",
                               short_title="NIST SP 800-53 Rev. 5")

    def test_a_catalogue_is_indexed_and_its_controls_are_found_by_their_codes(self):
        with fake_models() as model:
            standard = self._catalogue()
        version = standard.current_version
        self.assertEqual((version.status, version.parser), ("ready", "standard-ai"))
        self.assertEqual([name for name, _ in model.calls if name == "outline"], ["outline"])
        self.assertEqual(version.article_count, 9)
        for reference, path in (("AC-2", "AC-2"), ("ac 2", "AC-2"), ("control AC-2", "AC-2"), ("AC-2(1)", "AC-2(1)"),
                                ("AU-2 (1)", "AU-2(1)"), ("Access Control Family", "ACCESS CONTROL FAMILY")):
            found = find_provision("NIST SP 800-53", reference)
            self.assertIsNotNone(found, reference)
            self.assertEqual(found["path"], path, reference)
        self.assertEqual(find_provision("NIST SP 800-53", "AC-2", "1")["path"], "AC-2(1)")
        self.assertIsNone(find_provision("NIST SP 800-53", "AC-9"))
        job = Job.objects.filter(kind="corpus.ingest").latest("created_at")
        self.assertEqual(job.result["parser"], "standard-ai")

    def test_requirements_are_read_from_a_control_and_from_its_enhancements(self):
        with fake_models():
            standard = self._catalogue()
        provisions = {unit.path: unit.text for unit in provisions_of(standard.current_version)}
        # Not the families: a heading alone states nothing
        self.assertEqual(sorted(provisions), ["AC-1", "AC-2", "AC-2(1)", "AC-2(2)", "AU-1", "AU-2", "AU-2(1)"])
        # The control's own text, without the enhancements read on their own
        self.assertIn("Define and document the types of accounts", provisions["AC-2"])
        self.assertNotIn("Support the management of system accounts", provisions["AC-2"])
        stored = LegalUnit.objects.get(version=standard.current_version, number="AC-2")
        self.assertIn("Support the management of system accounts", stored.text, "the row itself is whole")

    def test_a_number_is_found_whatever_zeros_pad_it(self):
        with fake_models() as model:
            ingest_standard(self.admin_client, REQUIREMENT_TEXT, title="Protecting CUI", short_title="NIST SP 800-171 Rev. 3")
        self.assertFalse([name for name, _ in model.calls if name == "outline"], "the rules read it")
        for reference, path in (("03.01.02", "03.01.02"), ("3.1.2", "03.01.02"), ("requirement 3.2.1", "03.02.01"),
                                ("3.1", "3.1"), ("03.01", "3.1")):
            found = find_provision("NIST SP 800-171", reference)
            self.assertIsNotNone(found, reference)
            self.assertEqual(found["path"], path, reference)
        self.assertEqual(find_provision("NIST SP 800-171", "3.1", "1")["path"], "03.01.01")

    def test_a_requirement_cited_with_its_chapters_letter_is_found(self):
        lines = ["Application Security Verification Standard", "V1 Architecture", "V1.1 Secure Lifecycle",
                 "1.1.1 Verify the use of a secure software development lifecycle. ✓ ✓",
                 "1.1.2 Verify the use of threat modeling for every design change. ✓ ✓", "V2 Authentication",
                 "V2.1 Password Security", "2.1.1 Verify that user set passwords are at least 12 characters in length. ✓"]
        answer = [{"line": number, "lastLine": number, "level": level, "identifier": re.match(r"\S+", line).group()}
                  for number, line in enumerate(lines) if number
                  for level in [1 + line.split()[0].count(".") + (not line.startswith("V"))]]
        with fake_models(), scripted(answer):
            standard = ingest_standard(self.admin_client, "\n".join(lines), title="ASVS", short_title="OWASP ASVS 4.0.3")
        self.assertEqual(standard.current_version.parser, "standard-ai")
        for reference, path in (("V2.1", "V2.1"), ("2.1.1", "2.1.1"), ("V2.1.1", "2.1.1"), ("v1.1.2", "1.1.2")):
            found = find_provision("OWASP ASVS", reference)
            self.assertIsNotNone(found, reference)
            self.assertEqual(found["path"], path, reference)
        self.assertEqual(LegalUnit.objects.get(version=standard.current_version, number="2.1.1").parent.number, "V2.1")
        self.assertIsNone(find_provision("OWASP ASVS", "V9.9.9"))

    def test_a_copy_without_clause_numbers_is_indexed_by_parts(self):
        with fake_models():
            standard = ingest_standard(self.admin_client, UNNUMBERED_TEXT, short_title="ISO 9001:2015")
        version = standard.current_version
        self.assertEqual((version.status, version.parser), ("ready", "standard-pages"))
        self.assertIsNone(standard.last_error)
        self.assertEqual(find_provision("ISO 9001", "Part 1")["path"], "Part 1")
        step = Job.objects.filter(kind="corpus.ingest").latest("created_at").steps.get(name="extract")
        self.assertIn("indexed by its pages", " ".join(step.output["notes"]))

    def test_without_the_prompt_the_pages_stand_in(self):
        Prompt.objects.filter(slug="corpus.standard_outline").delete()
        with fake_models() as model:
            standard = self._catalogue()
        self.assertEqual(standard.current_version.parser, "standard-pages")
        self.assertFalse([name for name, _ in model.calls if name == "outline"])
        self.assertEqual(find_provision("NIST SP 800-53", "p. 2")["path"], "p. 2")
        self.assertEqual(find_provision("NIST SP 800-53", "page 3")["path"], "p. 3")
        self.assertIn("ACCESS CONTROL FAMILY", find_provision("NIST SP 800-53", "2 psl.")["text"])

    def test_the_structure_can_be_read_another_way_and_reviewed_requirements_stay(self):
        with fake_models():
            standard = self._catalogue()
            self.admin_client.post(f"/api/corpus/documents/{standard.id}/extract-obligations")
            while run_once(heartbeat=False):
                pass
            kept = Obligation.objects.filter(document=standard).order_by("created_at", "id").first()
            Obligation.objects.filter(id=kept.id).update(status="approved")
            proposed = Obligation.objects.filter(document=standard, status="proposed").count()
            self.assertTrue(proposed)
            base = f"/api/corpus/documents/{standard.id}/refresh"

            # The same structure again: every requirement finds its clause
            self.assertEqual(post_json(self.admin_client, base, {"structure": "ai"}).status_code, 202)
            while run_once(heartbeat=False):
                pass
            self.assertEqual(Obligation.objects.filter(document=standard, unit__isnull=False).count(), proposed + 1)
            version = LegalDocumentVersion.objects.get(id=standard.current_version_id)
            self.assertIsNotNone(version.obligations_extracted_at)
            relinked = Obligation.objects.get(id=kept.id)
            self.assertEqual(relinked.unit.path, relinked.citations[0]["path"])
            self.assertEqual(relinked.unit.version_id, version.id)

            # By pages: the clauses are gone, so are the proposals
            self.assertEqual(post_json(self.admin_client, base, {"structure": "pages"}).status_code, 202)
            while run_once(heartbeat=False):
                pass
        version = LegalDocumentVersion.objects.get(id=standard.current_version_id)
        self.assertEqual((version.status, version.parser), ("ready", "standard-pages"))
        self.assertIsNone(version.obligations_extracted_at)
        self.assertEqual(Obligation.objects.filter(document=standard, status="proposed").count(), 0)
        approved = Obligation.objects.get(id=kept.id)
        self.assertEqual((approved.status, approved.unit_id), ("approved", None))
        self.assertEqual([sorted(citation) for citation in approved.citations], [["path"]])

    def test_what_the_refresh_refuses(self):
        with fake_models():
            standard = self._catalogue()
        base = f"/api/corpus/documents/{standard.id}/refresh"
        self.assertEqual(post_json(self.admin_client, base, {"structure": "guess"}).json()["code"], "INVALID_FIELD")
        act = post_json(self.admin_client, "/api/corpus/documents", {
            "title": "Law", "shortTitle": "Law", "jurisdiction": "LT", "language": "lt", "docType": "law",
            "sourceKind": "upload"}).json()
        refused = post_json(self.admin_client, f"/api/corpus/documents/{act['id']}/refresh", {"structure": "pages"})
        self.assertEqual(refused.status_code, 400)
