############################################################
#  [*] Tests — the action trail
#
#  The writer (a sign-in is a row; audit() never raises) and
#  the admin's read: newest first by (created_at, id), paged
#  by the keyset cursor each answer hands out in `next` — a
#  page boundary inside a run of entries sharing one stamp
#  skips and repeats nothing, the last page says so (no empty
#  page after it), the filters page along, `before` alone
#  keeps its strict "earlier than" meaning for older clients,
#  and a cursor that is not one is refused.
############################################################


import uuid
from datetime import datetime, timedelta, timezone


from django.test import TestCase


from compliance.audit.log import audit
from compliance.audit.models import AuditLog
from compliance.tests.utils import PASSWORD, ApiClient, create_admin, create_user, post_json, signed_in


# The stamp the tied run shares — with microseconds, which the
# cursor must carry through the wire exactly
RUN_AT = datetime(2026, 9, 27, 9, 40, 0, 123456, tzinfo=timezone.utc)








class AuditTests(TestCase):

    def test_login_writes_a_row_and_admins_can_read_the_trail(self):
        admin = create_admin()
        post_json(ApiClient(), "/api/auth/login", {"email": admin.email, "password": PASSWORD})
        r = signed_in(admin).get("/api/audit?action=auth.")
        self.assertEqual(r.status_code, 200)
        entries = r.json()["entries"]
        self.assertEqual(entries[0]["action"], "auth.login")
        self.assertEqual(entries[0]["userId"], admin.id)
        self.assertIsNone(r.json()["next"], "one entry: nothing older")
        self.assertEqual(signed_in(create_user()).get("/api/audit").status_code, 403)

    def test_audit_never_raises(self):
        # A None request and a user-less action still produce a row
        audit(None, "ops.seed", "corpus", "x", {"n": 1})
        self.assertEqual(AuditLog.objects.filter(action="ops.seed").count(), 1)








class AuditPagingTests(TestCase):

    def setUp(self):
        self.admin = create_admin()
        self.client_admin = signed_in(self.admin)
        # Two newer entries, a run of five sharing one stamp, two
        # older ones — nine in all
        self.newer = [self._entry(RUN_AT + timedelta(seconds=s)) for s in (2, 1)]
        self.run = [self._entry(RUN_AT) for _ in range(5)]
        self.older = [self._entry(RUN_AT - timedelta(seconds=s)) for s in (1, 2)]

    def _entry(self, at, action="corpus.refresh"):
        return AuditLog.objects.create(id=str(uuid.uuid4()), user=self.admin, action=action,
                                       target_type="legal_document", target_id="x", created_at=at)

    def _pages(self, limit, **query):
        # Follows `next` until the trail ends; the query dict is
        # URL-encoded by the client, the way a browser sends it
        pages, cursor = [], {}
        while len(pages) < 20:
            r = self.client_admin.get("/api/audit", {"limit": limit, **query, **cursor})
            self.assertEqual(r.status_code, 200, r.content)
            pages.append(r.json())
            if pages[-1]["next"] is None:
                return pages
            cursor = pages[-1]["next"]
        self.fail("the cursor never reached the end of the trail")

    def _ids(self, pages):
        return [entry["id"] for page in pages for entry in page["entries"]]

    def _trail(self, **filters):
        # The expected order, as the database itself sorts it (the
        # ids compare under its collation, not Python's)
        return list(AuditLog.objects.filter(**filters).order_by("-created_at", "-id").values_list("id", flat=True))

    def test_a_page_boundary_inside_a_run_of_equal_stamps_skips_and_repeats_nothing(self):
        expected = self._trail()
        self.assertEqual(len(expected), 9)
        # Every limit cuts the run (2 and 3 twice, 4 once); with 3
        # the last page is a full one
        for limit, page_count in ((2, 5), (3, 3), (4, 3)):
            pages = self._pages(limit)
            self.assertEqual(self._ids(pages), expected, f"limit {limit}")
            self.assertEqual(len(pages), page_count, f"limit {limit}: no empty page after the last")
            for page in pages[:-1]:
                oldest = page["entries"][-1]
                self.assertEqual(page["next"], {"before": oldest["createdAt"], "beforeId": oldest["id"]})

    def test_the_cursor_carries_the_stamp_exactly_microseconds_and_offset_included(self):
        pages = self._pages(3)
        self.assertEqual(pages[0]["next"]["before"], "2026-09-27T09:40:00.123456+00:00")
        self.assertIn(pages[0]["next"]["beforeId"], {row.id for row in self.run})

    def test_the_filters_page_along_with_the_cursor(self):
        # Other actions inside the run and next to it, and one
        # entry of another account in the run
        for _ in range(3):
            self._entry(RUN_AT, action="users.update")
        self._entry(RUN_AT - timedelta(seconds=1), action="users.update")
        AuditLog.objects.create(id=str(uuid.uuid4()), user=create_user(), action="auth.login", created_at=RUN_AT)
        self.assertEqual(self._ids(self._pages(2, action="corpus.")), self._trail(action__startswith="corpus."))
        self.assertEqual(len(self._trail(action__startswith="corpus.")), 9)
        self.assertEqual(self._ids(self._pages(2, action="users.")), self._trail(action__startswith="users."))
        self.assertEqual(self._ids(self._pages(2, user=self.admin.id)), self._trail(user=self.admin))
        self.assertEqual(len(self._trail(user=self.admin)), 13)

    def test_before_alone_is_still_a_strict_earlier_than(self):
        older = [row.id for row in self.older]
        r = self.client_admin.get("/api/audit", {"before": RUN_AT.isoformat()})
        self.assertEqual(self._ids([r.json()]), older)
        # The "Z" form the GUI's "until" filter sends, and a naive
        # stamp — the database's zone, UTC
        for stamp in ("2026-09-27T09:40:00.123456Z", "2026-09-27T09:40:00.123456"):
            self.assertEqual(self._ids([self.client_admin.get("/api/audit", {"before": stamp}).json()]), older, stamp)

    def test_with_its_id_the_cursor_resumes_inside_the_run(self):
        run = self._trail(created_at=RUN_AT)
        r = self.client_admin.get("/api/audit", {"before": RUN_AT.isoformat(), "beforeId": run[1]})
        self.assertEqual(self._ids([r.json()]), run[2:] + [row.id for row in self.older])
        self.assertIsNone(r.json()["next"])

    def test_a_cursor_that_is_not_one_is_refused(self):
        for query in [
            {"beforeId": self.run[0].id},                            # an id without its stamp
            {"before": "vakar"},
            {"before": "2026-13-45T09:40:00"},                       # well formed, no such day
            {"before": "2026-09-27T09:40:00.123456 00:00"},          # an unencoded "+" read as a space
            {"before": "vakar", "beforeId": self.run[0].id},
        ]:
            r = self.client_admin.get("/api/audit", query)
            self.assertEqual((r.status_code, r.json()["code"]), (400, "INVALID_QUERY"), query)
