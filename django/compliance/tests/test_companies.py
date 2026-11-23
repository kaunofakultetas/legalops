############################################################
#  [*] Tests — companies, credentials, documents
############################################################


import io


from django.test import TestCase, override_settings


from compliance.companies.models import Company, CompanyDocument
from compliance.tests.utils import create_admin, create_user, post_json, signed_in


class CompanyTests(TestCase):

    def setUp(self):
        self.user = create_user()
        self.client_user = signed_in(self.user)

    def test_create_list_update_and_tenancy(self):
        r = post_json(self.client_user, "/api/companies",
                      {"name": "UAB Kripto", "institutionType": "casp", "naceCodes": ["66.19"], "usesAi": True})
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(body["institutionType"], "casp")
        self.assertEqual(body["naceCodes"], ["66.19"])
        self.assertTrue(body["usesAi"])
        self.assertEqual(body["credentials"], [])
        cid = body["id"]

        r = self.client_user.put(f"/api/companies/{cid}", data={"employees": 40, "attributes": {"divisions": 4}},
                                 content_type="application/json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["employees"], 40)
        self.assertEqual(r.json()["attributes"], {"divisions": 4})
        self.assertEqual(r.json()["name"], "UAB Kripto", "a partial update keeps the rest")

        other = signed_in(create_user(email="kitas@knf.vu.lt"))
        self.assertEqual(other.get(f"/api/companies/{cid}").status_code, 404)
        self.assertEqual(len(other.get("/api/companies").json()["companies"]), 0)
        admin = signed_in(create_admin())
        self.assertEqual(admin.get(f"/api/companies/{cid}").status_code, 200)

    def test_the_search_matches_word_by_word_and_skips_legal_forms(self):
        for name, code in (("1009 LTD (demo)", None), ("UAB „Žalgiris“ ir partneriai", "305123456"), ("MB Konsultacijos", None)):
            post_json(self.client_user, "/api/companies", {"name": name, "registrationCode": code})

        def found(query):
            rows = self.client_user.get("/api/companies", {"q": query}).json()["companies"]
            return sorted(row["name"] for row in rows)

        # As documents and people write it: punctuation, legal forms,
        # "company" / "įmonė" and word order no longer matter
        for query in ("1009", "1009, LTD", "1009 LTD", "1009 company", "įmonė 1009", "demo 1009", "(demo)"):
            self.assertEqual(found(query), ["1009 LTD (demo)"], query)
        self.assertEqual(found("žalgiris partneriai"), ["UAB „Žalgiris“ ir partneriai"])
        self.assertEqual(found("305123456"), ["UAB „Žalgiris“ ir partneriai"], "the registration code still counts")
        # Every distinctive word must appear
        self.assertEqual(found("1009 Konsultacijos"), [])
        # Nothing but noise words: the query as a whole
        self.assertEqual(found("UAB"), ["UAB „Žalgiris“ ir partneriai"])
        self.assertEqual(found("MB"), ["MB Konsultacijos"])

    def test_validation(self):
        self.assertEqual(post_json(self.client_user, "/api/companies", {}).json()["code"], "MISSING_FIELDS")
        self.assertEqual(post_json(self.client_user, "/api/companies", {"name": "X", "sizeCategory": "huge"}).json()["code"], "INVALID_FIELD")
        self.assertEqual(post_json(self.client_user, "/api/companies", {"name": "X", "naceCodes": "66"}).json()["code"], "INVALID_FIELD")
        self.assertEqual(post_json(self.client_user, "/api/companies", {"name": "X", "employees": "many"}).json()["code"], "INVALID_FIELD")

    def test_credentials_and_delete_detaches_documents(self):
        cid = post_json(self.client_user, "/api/companies", {"name": "UAB Kripto"}).json()["id"]
        r = post_json(self.client_user, f"/api/companies/{cid}/credentials",
                      {"kind": "license", "name": "CASP licence", "issuer": "Lietuvos bankas", "validFrom": "2025-01-01"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["validFrom"], "2025-01-01")
        self.assertEqual(post_json(self.client_user, f"/api/companies/{cid}/credentials", {"kind": "badge", "name": "x"}).status_code, 400)
        self.assertEqual(post_json(self.client_user, f"/api/companies/{cid}/credentials", {"kind": "permit", "name": "x", "validTo": "soon"}).status_code, 400)
        self.assertEqual(len(self.client_user.get(f"/api/companies/{cid}").json()["credentials"]), 1)

        doc = self.client_user.post("/api/documents", {"file": io.BytesIO(b"Politika"), "companyId": cid}).json()
        self.assertEqual(doc["companyId"], cid)
        self.assertEqual(self.client_user.delete(f"/api/companies/{cid}").status_code, 200)
        self.assertFalse(Company.objects.filter(id=cid).exists())
        self.assertIsNone(CompanyDocument.objects.get(id=doc["id"]).company_id, "documents survive, detached")


class DocumentTests(TestCase):

    def setUp(self):
        self.user = create_user()
        self.client_user = signed_in(self.user)

    def _upload(self, name, data, **fields):
        upload = io.BytesIO(data)
        upload.name = name
        return self.client_user.post("/api/documents", {"file": upload, **fields})

    def test_text_upload_extracts_and_serves_windows(self):
        r = self._upload("politika.md", "# Prieigos kontrolė\n\nMFA privaloma.\n\n\n\nPabaiga.".encode())
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(body["extractionStatus"], "done")
        self.assertEqual(body["title"], "politika.md")
        self.assertNotIn("text", body)
        r = self.client_user.get(f"/api/documents/{body['id']}/text?offset=2&limit=8")
        self.assertEqual(r.json()["text"], "Prieigos")
        self.assertEqual(r.json()["total"], body["charCount"])
        full = self.client_user.get(f"/api/documents/{body['id']}/text").json()["text"]
        self.assertIn("MFA privaloma.\n\nPabaiga.", full, "blank runs collapse")

    def test_pdf_docx_and_unsupported(self):
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)
        buffer = io.BytesIO()
        writer.write(buffer)
        r = self._upload("blank.pdf", buffer.getvalue())
        self.assertEqual(r.json()["extractionStatus"], "empty")

        import docx
        document = docx.Document()
        document.add_paragraph("Rizikos valdymo politika")
        buffer = io.BytesIO()
        document.save(buffer)
        r = self._upload("rizika.docx", buffer.getvalue(), kind="policy")
        self.assertEqual(r.json()["extractionStatus"], "done")
        self.assertEqual(r.json()["kind"], "policy")
        self.assertIn("Rizikos valdymo", self.client_user.get(f"/api/documents/{r.json()['id']}/text").json()["text"])

        r = self._upload("photo.png", b"\x89PNG....")
        self.assertEqual(r.json()["extractionStatus"], "failed")
        self.assertEqual(r.json()["extractionError"], "Unsupported file type")

    def test_attach_rename_tenancy_and_delete(self):
        doc = self._upload("a.txt", b"abc").json()
        cid = post_json(self.client_user, "/api/companies", {"name": "UAB"}).json()["id"]
        r = self.client_user.patch(f"/api/documents/{doc['id']}", data={"companyId": cid, "title": "Politika"},
                                   content_type="application/json")
        self.assertEqual(r.json()["companyId"], cid)
        self.assertEqual(r.json()["title"], "Politika")
        self.assertEqual(len(self.client_user.get(f"/api/documents?companyId={cid}").json()["documents"]), 1)

        other = signed_in(create_user(email="kitas@knf.vu.lt"))
        self.assertEqual(other.get(f"/api/documents/{doc['id']}/text").status_code, 404)
        other_cid = post_json(other, "/api/companies", {"name": "Svetima"}).json()["id"]
        r = self.client_user.patch(f"/api/documents/{doc['id']}", data={"companyId": other_cid}, content_type="application/json")
        self.assertEqual(r.status_code, 404, "cannot attach to someone else's company")

        self.assertEqual(self.client_user.delete(f"/api/documents/{doc['id']}").status_code, 200)
        self.assertEqual(self.client_user.get(f"/api/documents/{doc['id']}").status_code, 404)

    def test_missing_file_is_400(self):
        self.assertEqual(self.client_user.post("/api/documents", {}).json()["code"], "MISSING_FILE")
