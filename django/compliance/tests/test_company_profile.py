############################################################
#  [*] Tests — tri-state flags, credentials status, roles,
#      document outline, text windows and passage search
############################################################


import io
import uuid
from unittest import mock


from django.test import TestCase


from compliance.assistant import gateway
from compliance.chat.models import ChatThread
from compliance.companies.models import CompanyDocument, CompanyDocumentChunk, CompanyRole
from compliance.companies.outline import build_outline, heading_at
from compliance.tests.utils import create_admin, create_user, post_json, signed_in


POLICY = """ATITIKTIES POLITIKA

1. Bendrosios nuostatos
Ši politika nustato atitikties funkcijos veikimą.

7. Atitikties funkcija
7.2. Atitikties pareigūnas
Atitikties pareigūnas atsiskaito valdybai ir yra nepriklausomas.
Pinigų plovimo prevencijos pareigūnas (AML) veikia atskirai.
"""


class CompanyProfileTests(TestCase):

    def setUp(self):
        self.user = create_user()
        self.client_user = signed_in(self.user)
        self.cid = post_json(self.client_user, "/api/companies", {"name": "UAB Kripto"}).json()["id"]

    def test_flags_are_tri_state_and_strict(self):
        body = self.client_user.get(f"/api/companies/{self.cid}").json()
        self.assertIsNone(body["usesAi"], "unknown until someone says")
        self.assertIsNone(body["processesPersonalData"])
        r = self.client_user.put(f"/api/companies/{self.cid}", data={"usesAi": False, "providesAi": None},
                                 content_type="application/json")
        self.assertIs(r.json()["usesAi"], False)
        for bad in ({"usesAi": "false"}, {"employees": -1}, {"employees": 2.5}, {"naceCodes": [1]},
                    {"attributes": [1]}, {"legalForm": {"x": 1}}, {"name": "  "}):
            r = self.client_user.put(f"/api/companies/{self.cid}", data=bad, content_type="application/json")
            self.assertEqual(r.status_code, 400, bad)

    def test_a_two_letter_country_is_stored_as_the_code(self):
        for sent, stored in (("lv", "LV"), (" ee ", "EE"), ("Lithuania", "Lithuania"), ("LT", "LT")):
            r = self.client_user.put(f"/api/companies/{self.cid}", data={"country": sent},
                                     content_type="application/json")
            self.assertEqual(r.json()["country"], stored, sent)

    def test_a_credential_date_refusal_names_its_field(self):
        r = post_json(self.client_user, f"/api/companies/{self.cid}/credentials",
                      {"kind": "license", "name": "Licencija", "validTo": "2026-13-45"})
        self.assertEqual((r.status_code, r.json()["code"]), (400, "INVALID_FIELD"))
        self.assertTrue(r.json()["error"].startswith("validTo"), r.json()["error"])

    def test_admin_scope_own_and_search(self):
        admin = create_admin()
        admin_client = signed_in(admin)
        post_json(admin_client, "/api/companies", {"name": "Admino UAB", "registrationCode": "305000111"})
        self.assertEqual(len(admin_client.get("/api/companies").json()["companies"]), 2)
        own = admin_client.get("/api/companies?scope=own").json()["companies"]
        self.assertEqual([c["name"] for c in own], ["Admino UAB"])
        self.assertEqual(own[0]["ownerName"], admin.display_name)
        self.assertEqual(len(admin_client.get("/api/companies?q=305000").json()["companies"]), 1)

    def test_credential_status_evidence_and_patch(self):
        doc = self.client_user.post("/api/documents", {"file": io.BytesIO(b"Licencija Nr. 1"),
                                                        "companyId": self.cid}).json()
        r = post_json(self.client_user, f"/api/companies/{self.cid}/credentials",
                      {"kind": "license", "name": "CASP licencija"})
        self.assertEqual((r.status_code, r.json()["status"]), (201, "claimed"))
        url = f"/api/companies/{self.cid}/credentials/{r.json()['id']}"
        r = self.client_user.patch(url, data={"status": "verified", "evidenceDocumentId": doc["id"]},
                                   content_type="application/json")
        self.assertEqual(r.json()["status"], "verified")
        self.assertEqual(r.json()["verifiedBy"], self.user.id)
        self.assertEqual(r.json()["evidenceDocumentId"], doc["id"])
        r = self.client_user.patch(url, data={"status": "claimed"}, content_type="application/json")
        self.assertIsNone(r.json()["verifiedAt"])

        # Evidence must be this company's own document
        other_doc = self.client_user.post("/api/documents", {"file": io.BytesIO(b"x")}).json()
        r = self.client_user.patch(url, data={"evidenceDocumentId": other_doc["id"]}, content_type="application/json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client_user.patch(url, data={"status": "maybe"},
                                                content_type="application/json").status_code, 400)

    def test_roles_crud_and_thread_adoption(self):
        url = f"/api/companies/{self.cid}/roles"
        r = post_json(self.client_user, url, {"name": "Atitikties pareigūnas", "context": "Atsiskaito valdybai.",
                                              "sources": [{"title": "F06", "section": "§3.1"}]})
        self.assertEqual(r.status_code, 201)
        role = r.json()
        self.assertEqual(post_json(self.client_user, url, {"name": "Atitikties pareigūnas"}).json()["code"],
                         "DUPLICATE_NAME")
        self.assertEqual(post_json(self.client_user, url, {"name": "X", "context": "y" * 7000}).status_code, 400)
        self.assertEqual(len(self.client_user.get(f"/api/companies/{self.cid}").json()["roles"]), 1)

        thread = post_json(self.client_user, "/api/chat/threads", {"companyId": self.cid}).json()
        self.assertEqual([t["id"] for t in self.client_user.get(f"/api/chat/threads?companyId={self.cid}")
                          .json()["threads"]], [thread["id"]])
        self.assertEqual(self.client_user.get(f"/api/companies/{self.cid}").json()["ownerName"],
                         self.user.display_name)
        r = self.client_user.patch(f"/api/chat/threads/{thread['id']}", data={"roleId": role["id"]},
                                   content_type="application/json")
        self.assertEqual(r.json()["role"]["context"], "Atsiskaito valdybai.")

        # Another company's thread cannot adopt it; changing the company drops it
        other_cid = post_json(self.client_user, "/api/companies", {"name": "Kita"}).json()["id"]
        r = self.client_user.patch(f"/api/chat/threads/{thread['id']}", data={"companyId": other_cid},
                                   content_type="application/json")
        self.assertIsNone(r.json()["roleId"])
        r = self.client_user.patch(f"/api/chat/threads/{thread['id']}", data={"roleId": role["id"]},
                                   content_type="application/json")
        self.assertEqual(r.status_code, 404)

        # Strangers see nothing; deleting unlinks threads
        stranger = signed_in(create_user(email="kitas@knf.vu.lt"))
        self.assertEqual(stranger.get(f"{url}/{role['id']}").status_code, 404)
        ChatThread.objects.filter(id=thread["id"]).update(company_id=self.cid, role_id=role["id"])
        self.assertEqual(self.client_user.delete(f"{url}/{role['id']}").status_code, 200)
        self.assertIsNone(ChatThread.objects.get(id=thread["id"]).role_id)

    # A document of the company, uploaded under `name`
    def _company_document(self, name):
        upload = io.BytesIO(b"5. Kontroles funkcijos")
        upload.name = name
        return self.client_user.post("/api/documents", {"file": upload, "companyId": self.cid}).json()["id"]

    def test_a_role_source_names_its_document_by_id_and_title_whichever_it_came_with(self):
        governance = self._company_document("F01-governance-accountability.md")
        security = self._company_document("08-information-security.md")
        url = f"/api/companies/{self.cid}/roles"
        role = post_json(self.client_user, url, {"name": "Vidaus auditas", "context": "Trečioji gynybos linija.", "sources": [
            {"title": "F01-governance-accountability.md", "section": "§5"},          # a title alone
            {"title": " 08-INFORMATION-security ", "section": "§3.5"},               # no extension, other case
            {"documentId": security, "section": "§9.14"},                            # an id alone
            {"documentId": "no-such-document", "title": "F01-governance-accountability.md", "section": "§7"},
            {"title": "Role Definitions Glossary", "section": "—"},                  # not held by the platform
        ]}).json()
        expected = [
            {"documentId": governance, "title": "F01-governance-accountability.md", "section": "§5"},
            {"documentId": security, "title": "08-information-security.md", "section": "§3.5"},
            {"documentId": security, "title": "08-information-security.md", "section": "§9.14"},
            {"documentId": governance, "title": "F01-governance-accountability.md", "section": "§7"},
            {"title": "Role Definitions Glossary", "section": "—"},
        ]
        self.assertEqual(role["sources"], expected)
        self.assertEqual(CompanyRole.objects.get(id=role["id"]).sources, expected, "stored so, not only answered so")

        # A role saved before its document reached the company (the
        # assistant files both in one turn): named in full once it has
        CompanyRole.objects.filter(id=role["id"]).update(sources=[{"title": "F02-crypto-safeguarding.md", "section": "§4"}])
        item = f"{url}/{role['id']}"
        self.assertEqual(self.client_user.get(item).json()["sources"],
                         [{"title": "F02-crypto-safeguarding.md", "section": "§4"}])
        custody = self._company_document("F02-crypto-safeguarding.md")
        named = [{"documentId": custody, "title": "F02-crypto-safeguarding.md", "section": "§4"}]
        self.assertEqual(self.client_user.get(item).json()["sources"], named)
        self.assertEqual(self.client_user.get(url).json()["roles"][0]["sources"], named)
        self.assertEqual(self.client_user.get(f"/api/companies/{self.cid}").json()["roles"][0]["sources"], named)

        # Saved again, the source keeps the id — and then the title
        # follows the document when it is renamed
        self.client_user.patch(item, data={"sources": [{"title": "F02-crypto-safeguarding.md", "section": "§4"}]},
                               content_type="application/json")
        self.assertEqual(CompanyRole.objects.get(id=role["id"]).sources, named)
        self.client_user.patch(f"/api/documents/{custody}", data={"title": "Saugojimo politika.md"},
                               content_type="application/json")
        self.assertEqual(self.client_user.get(item).json()["sources"][0],
                         {"documentId": custody, "title": "Saugojimo politika.md", "section": "§4"})

        # Two documents of one title: none is guessed
        CompanyRole.objects.filter(id=role["id"]).update(sources=[{"title": "08-information-security.md"}])
        self._company_document("08-information-security.md")
        self.assertEqual(self.client_user.get(item).json()["sources"], [{"title": "08-information-security.md"}])

        # Another company's document of the same title is not this one's
        other_cid = post_json(self.client_user, "/api/companies", {"name": "Kita"}).json()["id"]
        other = post_json(self.client_user, f"/api/companies/{other_cid}/roles",
                          {"name": "Vidaus auditas", "sources": [{"title": "F01-governance-accountability.md"}]}).json()
        self.assertEqual(other["sources"], [{"title": "F01-governance-accountability.md"}])


class DocumentReadingTests(TestCase):

    def setUp(self):
        self.user = create_user()
        self.client_user = signed_in(self.user)

    def _upload(self, text, name="politika.md"):
        upload = io.BytesIO(text.encode())
        upload.name = name
        return self.client_user.post("/api/documents", {"file": upload}).json()

    def test_outline_and_windows(self):
        outline = build_outline(POLICY)
        titles = [entry["title"] for entry in outline]
        self.assertEqual(titles, ["ATITIKTIES POLITIKA", "1 Bendrosios nuostatos", "7 Atitikties funkcija",
                                  "7.2 Atitikties pareigūnas"])
        self.assertEqual(outline[3]["level"], 2)
        offset = POLICY.index("Atitikties pareigūnas atsiskaito")
        self.assertEqual(heading_at(outline, offset), "7.2 Atitikties pareigūnas")

        doc = self._upload(POLICY)
        detail = self.client_user.get(f"/api/documents/{doc['id']}").json()
        self.assertEqual(detail["outline"][3]["title"], "7.2 Atitikties pareigūnas")
        start = detail["outline"][3]["offset"]
        window = self.client_user.get(f"/api/documents/{doc['id']}/text?offset={start}&limit=25").json()
        self.assertEqual(window["text"], "7.2. Atitikties pareigūna")
        self.assertEqual(self.client_user.get(f"/api/documents/{doc['id']}/text?offset=-1").status_code, 400)
        self.assertEqual(self.client_user.get(f"/api/documents/{doc['id']}/text?limit=999999").status_code, 400)
        listed = self.client_user.get("/api/documents?limit=1").json()
        self.assertEqual((len(listed["documents"]), listed["total"]), (1, 1))

    def test_passage_search_is_tenant_scoped(self):
        doc = self._upload(POLICY)
        row = CompanyDocument.objects.get(id=doc["id"])
        CompanyDocumentChunk.objects.create(id=str(uuid.uuid4()), document=row, ordinal=0, char_start=10,
                                            heading="7.2 Atitikties pareigūnas",
                                            text="Atitikties pareigūnas atsiskaito valdybai ir yra nepriklausomas.")
        offline = gateway.GatewayError(0, "UNREACHABLE", "down")
        with mock.patch.object(gateway, "embed", side_effect=offline):
            hits = self.client_user.get("/api/documents/search?q=valdybai").json()["hits"]
            self.assertEqual(hits[0]["heading"], "7.2 Atitikties pareigūnas")
            self.assertEqual(hits[0]["documentId"], doc["id"])
            stranger = signed_in(create_user(email="kitas@knf.vu.lt"))
            self.assertEqual(stranger.get("/api/documents/search?q=valdybai").json()["hits"], [])
            # An admin sees every user's passages; scope=own narrows
            # them to the admin's own uploads (the chat's unfiltered
            # search)
            admin = signed_in(create_admin())
            self.assertEqual(len(admin.get("/api/documents/search?q=valdybai").json()["hits"]), 1)
            self.assertEqual(admin.get("/api/documents/search?q=valdybai&scope=own").json()["hits"], [])
            self.assertEqual(len(self.client_user.get("/api/documents/search?q=valdybai&scope=own").json()["hits"]), 1)
        self.assertEqual(self.client_user.get("/api/documents/search").status_code, 400)

    def test_failed_insert_removes_the_stored_file(self):
        import os
        import tempfile
        from django.test import override_settings
        # A private upload directory: the parallel runner's other
        # processes upload into the shared one meanwhile
        with tempfile.TemporaryDirectory() as upload_dir, override_settings(UPLOAD_DIR=upload_dir):
            with mock.patch.object(CompanyDocument.objects, "create", side_effect=RuntimeError("db down")):
                upload = io.BytesIO(b"tekstas")
                upload.name = "a.txt"
                with self.assertRaises(RuntimeError):
                    self.client_user.post("/api/documents", {"file": upload})
            directory = os.path.join(upload_dir, "documents")
            left = os.listdir(directory) if os.path.isdir(directory) else []
            self.assertEqual(left, [], "no orphan file left behind")


    def test_upload_quota(self):
        from django.test import override_settings
        with override_settings(UPLOAD_QUOTA_FILES=1):
            self.assertEqual(self._upload("vienas")["extractionStatus"], "done")
            upload = io.BytesIO(b"antras")
            upload.name = "b.txt"
            r = self.client_user.post("/api/documents", {"file": upload})
            self.assertEqual((r.status_code, r.json()["code"]), (413, "QUOTA_EXCEEDED"))
