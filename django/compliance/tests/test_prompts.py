############################################################
#  [*] Tests — the prompt store and the internal door
############################################################


import tempfile
from decimal import Decimal
from pathlib import Path
from unittest import mock


import yaml
from django.test import TestCase, override_settings


from compliance.assistant import gateway
from compliance.assistant.models import LlmCall
from compliance.prompts.models import Prompt
from compliance.prompts.store import add_version, seed_defaults
from compliance.tests.utils import ApiClient, create_admin, create_user, post_json, signed_in


class PromptStoreTests(TestCase):

    def test_seed_is_idempotent_and_activates_v1(self):
        outcome = seed_defaults()
        self.assertIn("chat.assistant", outcome["created"])
        prompt = Prompt.objects.get(slug="chat.assistant")
        self.assertEqual(prompt.active_version.version_no, 1)
        self.assertEqual(prompt.active_version.source, "default")
        self.assertIn("{COMPANY_CONTEXT}", prompt.active_version.text)
        self.assertEqual(seed_defaults(), {"created": [], "upgraded": [], "pending": []}, "second run touches nothing")

    def test_changed_default_upgrades_only_untouched_prompts(self):
        with tempfile.TemporaryDirectory() as folder:
            spec = {"slug": "t.one", "name": "One", "kind": "pipeline", "model": "gateway:azure/gpt-5.5", "text": "v1 {TODAY}"}
            path = Path(folder) / "t.one.yaml"
            path.write_text(yaml.safe_dump(spec), encoding="utf-8")
            seed_defaults(folder)
            spec["text"] = "v2 {TODAY}"
            path.write_text(yaml.safe_dump(spec), encoding="utf-8")
            self.assertEqual(seed_defaults(folder)["upgraded"], ["t.one"])
            prompt = Prompt.objects.get(slug="t.one")
            self.assertEqual((prompt.active_version.version_no, prompt.active_version.text), (2, "v2 {TODAY}"))

            # An admin's own version stays active; the next default waits beside it
            add_version(prompt, "mine", "gateway:azure/gpt-5.5", activate=True)
            spec["text"] = "v3 {TODAY}"
            path.write_text(yaml.safe_dump(spec), encoding="utf-8")
            self.assertEqual(seed_defaults(folder)["pending"], ["t.one"])
            prompt.refresh_from_db()
            self.assertEqual(prompt.active_version.text, "mine")
            admin = signed_in(create_admin())
            self.assertEqual(admin.get("/api/prompts/t.one").json()["pendingDefault"], 4)

    def test_a_default_only_moved_to_another_model_follows_new_defaults_on_that_model(self):
        with tempfile.TemporaryDirectory() as folder:
            spec = {"slug": "t.two", "name": "Two", "kind": "pipeline", "model": "gateway:azure/gpt-5.5",
                    "temperature": 0.3, "text": "v1 {TODAY}"}
            path = Path(folder) / "t.two.yaml"

            def ship(**changes):
                spec.update(changes)
                path.write_text(yaml.safe_dump(spec), encoding="utf-8")
                return seed_defaults(folder)

            ship()
            prompt = Prompt.objects.get(slug="t.two")
            # An admin picks another model for the shipped text
            add_version(prompt, "v1 {TODAY}", "gateway:azure/gpt-6-astra", temperature=0.3, activate=True)
            self.assertEqual(ship(text="v2 {TODAY}"), {"created": [], "upgraded": ["t.two"], "pending": []})
            prompt.refresh_from_db()
            versions = {v.version_no: v for v in prompt.versions.all()}
            # The default as shipped, and the new text on the admin's model — active
            self.assertEqual([(v.source, v.model, v.text) for v in (versions[3], versions[4])],
                             [("default", "gateway:azure/gpt-5.5", "v2 {TODAY}"),
                              ("user", "gateway:azure/gpt-6-astra", "v2 {TODAY}")])
            self.assertEqual((prompt.active_version.version_no, prompt.active_version.temperature), (4, 0.3))
            self.assertEqual(ship(), {"created": [], "upgraded": [], "pending": []}, "a second run touches nothing")

            # A default that ships on the admin's own model needs no copy
            self.assertEqual(ship(text="v3 {TODAY}", model="gateway:azure/gpt-6-astra")["upgraded"], ["t.two"])
            prompt.refresh_from_db()
            self.assertEqual((prompt.versions.count(), prompt.active_version.version_no, prompt.active_version.source),
                             (5, 5, "default"))

            # A text the admin wrote is theirs: the next default waits
            add_version(prompt, "v3 {TODAY} and my own rule", "gateway:azure/gpt-6-astra", activate=True)
            self.assertEqual(ship(text="v4 {TODAY}")["pending"], ["t.two"])
            prompt.refresh_from_db()
            self.assertEqual(prompt.active_version.text, "v3 {TODAY} and my own rule")

    def test_versions_activate_and_admin_only(self):
        seed_defaults()
        admin = signed_in(create_admin())
        self.assertEqual(signed_in(create_user()).get("/api/prompts").status_code, 403)
        listed = admin.get("/api/prompts").json()["prompts"]
        self.assertEqual(listed[0]["activeVersion"], 1)

        r = post_json(admin, "/api/prompts/chat.assistant/versions",
                      {"text": "Naujas tekstas {TODAY}", "model": "gateway:azure/gpt-5.6-sol", "temperature": 0.1, "note": "test"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["version"], 2)
        self.assertEqual(admin.get("/api/prompts/chat.assistant").json()["activeVersion"], 1, "not active until asked")
        r = admin.post("/api/prompts/chat.assistant/versions/2/activate")
        self.assertEqual(r.json()["activeVersion"], 2)
        detail = admin.get("/api/prompts/chat.assistant").json()
        self.assertEqual([v["version"] for v in detail["versions"]], [2, 1])
        self.assertEqual(detail["versions"][0]["text"], "Naujas tekstas {TODAY}")
        self.assertEqual(post_json(admin, "/api/prompts/chat.assistant/versions", {"text": ""}).status_code, 400)
        self.assertEqual(admin.post("/api/prompts/nope/versions/1/activate").status_code, 404)
        for bad in ({"temperature": "0.1"}, {"temperature": 7}, {"maxTokens": 1.5}, {"model": "no spaces allowed"}):
            body = {"text": "x", "model": "gateway:azure/gpt-5.5", **bad}
            self.assertEqual(post_json(admin, "/api/prompts/chat.assistant/versions", body).status_code, 400, bad)

    def test_test_run_uses_the_draft_and_the_step_schema(self):
        seed_defaults()
        admin = signed_in(create_admin())
        fake = gateway.GenerateResult(text=None, object={"findings": []}, model="gateway:azure/gpt-5.5",
                                      finish_reason="stop", input_tokens=10, output_tokens=5,
                                      reasoning_tokens=0, duration_ms=12)
        with mock.patch.object(gateway, "generate", return_value=fake) as generate, \
                mock.patch("compliance.assistant.usage.price_table", return_value={}):
            r = post_json(admin, "/api/prompts/report.gap_analysis/test",
                          {"input": "data", "text": "Draft for {COMPANY_NAME} on {TODAY}",
                           "variables": {"COMPANY_NAME": "UAB Testas"}})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["object"], {"findings": []})
        kwargs = generate.call_args.kwargs
        self.assertTrue(kwargs["system"].startswith("Draft for UAB Testas on 20"))
        self.assertEqual(kwargs["schema_name"], "findings")
        self.assertIsNotNone(kwargs["schema"])
        self.assertEqual(LlmCall.objects.get().kind, "prompt_test")
        self.assertEqual(post_json(admin, "/api/prompts/report.gap_analysis/test", {"input": ""}).status_code, 400)
        self.assertEqual(post_json(signed_in(create_user()), "/api/prompts/report.gap_analysis/test",
                                   {"input": "x"}).status_code, 403)


@override_settings(ASSISTANT_INTERNAL_SECRET="s3cret")
class InternalDoorTests(TestCase):

    def test_prompt_and_turn_log_need_the_secret(self):
        seed_defaults()
        client = ApiClient()
        self.assertEqual(client.get("/internal/assistant/prompt?slug=chat.assistant").status_code, 403)
        self.assertEqual(client.get("/internal/assistant/prompt?slug=chat.assistant", HTTP_X_INTERNAL_SECRET="wrong").status_code, 403)
        r = client.get("/internal/assistant/prompt?slug=chat.assistant", HTTP_X_INTERNAL_SECRET="s3cret")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["version"], 1)
        self.assertTrue(r.json()["text"].startswith("You are the compliance assistant"))
        self.assertEqual(client.get("/internal/assistant/prompt?slug=missing", HTTP_X_INTERNAL_SECRET="s3cret").status_code, 404)

        user = create_user()
        r = client.post("/internal/assistant/turn-log", data={"user_id": user.id, "model": "gateway:azure/gpt-5.5",
                                                               "input_tokens": 120, "tool_calls": [{"name": "createCompany", "ok": True}]},
                        content_type="application/json", HTTP_X_INTERNAL_SECRET="s3cret")
        self.assertEqual(r.status_code, 201)
        row = LlmCall.objects.get()
        self.assertEqual(row.user_id, user.id)
        self.assertEqual(row.tool_calls[0]["name"], "createCompany")

    @override_settings(ASSISTANT_INTERNAL_SECRET="")
    def test_empty_secret_fails_closed(self):
        self.assertEqual(ApiClient().get("/internal/assistant/prompt?slug=x", HTTP_X_INTERNAL_SECRET="").status_code, 403)


class UsageTests(TestCase):

    def test_usage_is_own_unless_admin_and_budget_override_applies(self):
        from compliance.assistant.usage import record_call
        user, admin = create_user(), create_admin()
        with mock.patch("compliance.assistant.usage.price_table", return_value={}):
            record_call(kind="chat", model="gateway:azure/gpt-5.5", input_tokens=100, output_tokens=20,
                        user_id=user.id, transcript={"user": "Klausimas", "assistant": "Atsakymas"})
            record_call(kind="job_step", model="gateway:azure/gpt-5.5", input_tokens=50, user_id=admin.id)
        mine = signed_in(user).get("/api/usage?days=7").json()
        self.assertEqual(mine["totals"]["inputTokens"], 100)
        self.assertEqual(len(mine["days"]), 7)
        self.assertEqual(mine["days"][-1]["calls"], 1)
        self.assertEqual(mine["budget"]["used"], 0, "unpriced model, no spend")
        self.assertEqual(signed_in(user).get("/api/usage?scope=all").status_code, 403)
        self.assertIsNone(signed_in(admin).get("/api/usage").json()["budget"]["remaining"], "admins: unlimited")
        wide = signed_in(admin).get("/api/usage?scope=all").json()
        self.assertEqual(wide["totals"]["calls"], 2)
        self.assertEqual({row["userId"] for row in wide["byUser"]}, {user.id, admin.id})

        calls = signed_in(user).get("/api/usage/calls").json()["calls"]
        self.assertNotIn("transcript", calls[0])
        self.assertEqual(calls[0]["toolCallCount"], 0)
        detail = signed_in(admin).get(f"/api/usage/calls/{calls[0]['id']}").json()
        self.assertEqual(detail["transcript"]["assistant"], "Atsakymas")
        self.assertEqual(signed_in(create_user(email="kitas@knf.vu.lt")).get(
            f"/api/usage/calls/{calls[0]['id']}").status_code, 404)

        # The list counts every call's tool calls without loading
        # them — the same number of queries for 3 calls as for 13
        with mock.patch("compliance.assistant.usage.price_table", return_value={}):
            for n in range(12):
                record_call(kind="chat", model="gateway:azure/gpt-5.5", user_id=admin.id,
                            tool_calls=[{"name": "getCompany"}] * (n % 3))
        admin_client = signed_in(admin)
        with self.assertNumQueries(5):
            listed = admin_client.get("/api/usage/calls?limit=100").json()["calls"]
        self.assertEqual(len(listed), 13)
        self.assertEqual(sorted(c["toolCallCount"] for c in listed if c["userId"] == admin.id)[-4:], [2, 2, 2, 2])

        r = signed_in(admin).patch(f"/api/users/{user.id}", data={"dailyBudgetUsd": 0.5},
                                   content_type="application/json")
        self.assertEqual(r.json()["dailyBudgetUsd"], 0.5)
        self.assertEqual(signed_in(user).get("/api/usage").json()["budget"]["remaining"], 0.5)
        r = signed_in(admin).patch(f"/api/users/{user.id}", data={"dailyBudgetUsd": 0}, content_type="application/json")
        self.assertIsNone(signed_in(user).get("/api/usage").json()["budget"]["remaining"], "0 = unlimited")
        for bad in ("lots", -1, True):
            self.assertEqual(signed_in(admin).patch(f"/api/users/{user.id}", data={"dailyBudgetUsd": bad},
                                                    content_type="application/json").status_code, 400)


class CachePricingTests(TestCase):

    def test_input_read_from_the_cache_and_written_to_it_has_its_own_prices(self):
        from compliance.assistant import usage
        table = {
            "gateway:test/cached": (Decimal("0.00001"), Decimal("0.00005"), Decimal("0.000001"), Decimal("0.0000125")),
            "gateway:test/read-only": (Decimal("0.000005"), Decimal("0.00003"), Decimal("0.0000005"), None),
            "gateway:test/plain": (Decimal("0.000002"), Decimal("0.00001")),
        }
        user = create_user()
        with mock.patch("compliance.assistant.usage.price_table", return_value=table):
            # 100 000 input tokens: 80 000 read from the cache, 15 000
            # written to it, 5 000 neither — and 1 000 of output
            self.assertEqual(usage.cost_of("gateway:test/cached", 100_000, 1_000, 80_000, 15_000),
                             Decimal("0.05") + Decimal("0.08") + Decimal("0.1875") + Decimal("0.05"))
            self.assertEqual(usage.cost_of("gateway:test/cached", 100_000, 1_000), Decimal("1.05"))
            # No price for writing: those tokens cost what input costs
            self.assertEqual(usage.cost_of("gateway:test/read-only", 100_000, 0, 80_000, 15_000),
                             Decimal("0.025") + Decimal("0.04") + Decimal("0.075"))
            # No cache prices at all: every input token at the prompt price
            self.assertEqual(usage.cost_of("gateway:test/plain", 100_000, 0, 80_000, 15_000), Decimal("0.2"))
            # The parts never add up to more than the input
            self.assertEqual(usage.cost_of("gateway:test/cached", 1_000, 0, 5_000, 5_000), Decimal("0.001"))
            row = usage.record_call(kind="chat", model="gateway:test/cached", input_tokens=100_000, output_tokens=1_000,
                                    cached_input_tokens=80_000, cache_write_tokens=15_000, user_id=user.id)
        self.assertEqual((row.cached_input_tokens, row.cache_write_tokens, row.cost_usd),
                         (80_000, 15_000, Decimal("0.367500")))
        served = signed_in(user).get("/api/usage/calls").json()["calls"][0]
        self.assertEqual((served["inputTokens"], served["cachedInputTokens"], served["cacheWriteTokens"], served["costUsd"]),
                         (100_000, 80_000, 15_000, 0.3675))

    @override_settings(ASSISTANT_INTERNAL_SECRET="s3cret")
    def test_a_chat_turn_is_logged_with_what_it_read_from_the_cache(self):
        user = create_user()
        table = {"gateway:test/cached": (Decimal("0.00001"), Decimal("0.00005"), Decimal("0.000001"), Decimal("0.0000125"))}
        with mock.patch("compliance.assistant.usage.price_table", return_value=table):
            r = ApiClient().post("/internal/assistant/turn-log", data={
                "user_id": user.id, "model": "gateway:test/cached", "input_tokens": 246_000, "output_tokens": 2_000,
                "cached_input_tokens": 200_000, "cache_write_tokens": 40_000},
                content_type="application/json", HTTP_X_INTERNAL_SECRET="s3cret")
        self.assertEqual(r.status_code, 201)
        row = LlmCall.objects.get()
        self.assertEqual((row.cached_input_tokens, row.cache_write_tokens), (200_000, 40_000))
        # 6 000 plain + 200 000 read + 40 000 written + the answer —
        # not the 2.56 USD its token count alone would make
        self.assertEqual(row.cost_usd, Decimal("0.06") + Decimal("0.2") + Decimal("0.5") + Decimal("0.1"))


class CachedUsageTests(TestCase):

    def test_a_pipeline_call_records_what_the_assistant_says_was_cached(self):
        import requests as http
        from compliance.assistant.llm import run_prompt
        seed_defaults()
        answer = mock.Mock(status_code=200, json=lambda: {
            "text": "ok", "model": "gateway:test/cached", "finishReason": "stop", "durationMs": 7,
            "usage": {"inputTokens": 60_000, "cachedInputTokens": 55_000, "cacheWriteTokens": 4_000, "outputTokens": 3_000,
                      "reasoningTokens": 500}})
        table = {"gateway:test/cached": (Decimal("0.000002"), Decimal("0.00001"), Decimal("0.0000001"), Decimal("0.0000025"))}
        with mock.patch.object(http, "post", return_value=answer), \
                mock.patch("compliance.assistant.usage.price_table", return_value=table):
            result = gateway.generate("x")
            self.assertEqual((result.input_tokens, result.cached_input_tokens, result.cache_write_tokens), (60_000, 55_000, 4_000))
            run_prompt("report.summary", "data", variables={})
        row = LlmCall.objects.get()
        self.assertEqual((row.input_tokens, row.cached_input_tokens, row.cache_write_tokens, row.output_tokens),
                         (60_000, 55_000, 4_000, 3_000))
        # 1 000 plain + 55 000 read + 4 000 written + the answer:
        # a quarter of the 0.15 USD its token counts alone would make
        self.assertEqual(row.cost_usd, Decimal("0.002") + Decimal("0.0055") + Decimal("0.01") + Decimal("0.03"))
        # An assistant that reports no cache leaves both at zero
        plain = mock.Mock(status_code=200, json=lambda: {"text": "ok", "usage": {"inputTokens": 10, "outputTokens": 2}})
        with mock.patch.object(http, "post", return_value=plain):
            result = gateway.generate("x")
        self.assertEqual((result.cached_input_tokens, result.cache_write_tokens), (0, 0))


class GatewayRetryTests(TestCase):

    def test_connection_resets_are_retried_patiently_timeouts_not(self):
        import requests as http
        ok = mock.Mock(status_code=200, json=lambda: {"text": "ok", "usage": {}})
        with mock.patch.object(http, "post", side_effect=[http.ConnectionError("reset")] * 3 + [ok]) as post, \
                mock.patch("compliance.assistant.gateway.time.sleep"):
            self.assertEqual(gateway.generate("x").text, "ok")
        self.assertEqual(post.call_count, 4)
        with mock.patch.object(http, "post", side_effect=http.ReadTimeout("slow")) as post, \
                mock.patch("compliance.assistant.gateway.time.sleep"):
            with self.assertRaises(gateway.GatewayError):
                gateway.generate("x")
        self.assertEqual(post.call_count, 2, "a timeout is retried once, not five times")


class RateLimitTests(TestCase):

    def test_background_work_waits_a_rate_limit_out_and_a_person_gets_the_refusal(self):
        import requests as http

        def limited(wait=None):
            error = {"code": "GENERATION_FAILED", "message": "rate limit", **({"retryAfterS": wait} if wait else {})}
            return mock.Mock(status_code=429, json=lambda: {"message": "Model call failed: rate limit", "error": error})

        ok = mock.Mock(status_code=200, json=lambda: {"text": "ok", "usage": {}})
        steady = mock.patch("compliance.assistant.gateway.random.uniform", return_value=1.0)

        # The provider says how long: that long, each time. It says
        # nothing: 20 s, then 40, then a minute at most
        for answers, waits in (([limited(22), limited(22), ok], [22, 22]),
                               ([limited(), limited(), limited(), limited(), ok], [20, 40, 60, 60])):
            with mock.patch.object(http, "post", side_effect=answers) as post, steady, \
                    mock.patch("compliance.assistant.gateway.time.sleep") as sleep:
                self.assertEqual(gateway.generate("x", patient=True).text, "ok")
            self.assertEqual([call.args[0] for call in sleep.call_args_list], waits)
            self.assertEqual(post.call_count, len(answers))

        # Its patience has an end: a quarter of an hour of waiting
        with mock.patch.object(http, "post", return_value=limited(60)) as post, steady, \
                mock.patch("compliance.assistant.gateway.time.sleep"):
            with self.assertRaises(gateway.GatewayError) as raised:
                gateway.generate("x", patient=True, retries=0)
        self.assertEqual((raised.exception.status, raised.exception.retry_after, post.call_count), (429, 60, 16))

        # A call a person waits for is retried like any transient
        # failure, briefly — and not at all when it asked for none
        with mock.patch.object(http, "post", return_value=limited(60)) as post, \
                mock.patch("compliance.assistant.gateway.time.sleep") as sleep:
            with self.assertRaises(gateway.GatewayError):
                gateway.generate("x")
            self.assertEqual((post.call_count, [call.args[0] for call in sleep.call_args_list]), (2, [2]))
            with self.assertRaises(gateway.GatewayError):
                gateway.generate("x", retries=0)
            self.assertEqual(post.call_count, 3)

    def test_a_job_steps_call_is_patient_and_carries_what_its_step_shares(self):
        from compliance.assistant.llm import run_prompt
        seed_defaults()
        answer = gateway.GenerateResult(text="ok", object=None, model="gateway:azure/gpt-6.1-sol", finish_reason="stop",
                                        input_tokens=1, output_tokens=1, reasoning_tokens=0, duration_ms=1)
        with mock.patch.object(gateway, "generate", return_value=answer) as generate, \
                mock.patch("compliance.assistant.usage.price_table", return_value={}):
            run_prompt("report.gap_analysis", "ACT: MiCA", shared="COMPANY\nUAB Kripto", job_step_id="step-1")
            run_prompt("corpus.check_citations", "blocks")
        step, person = (call.kwargs for call in generate.call_args_list)
        self.assertEqual((step["patient"], step["shared"]), (True, "COMPANY\nUAB Kripto"))
        self.assertEqual((person["patient"], person["shared"]), (False, None))
        self.assertNotIn("UAB Kripto", step["system"], "the shared data travels apart from the instructions")


class PriceTableTests(TestCase):

    def test_prices_survive_an_unreachable_gateway(self):
        from compliance.assistant import usage
        usage._prices.update({"at": -usage.PRICE_TTL_S, "table": {}})
        listing = {"models": [{"id": "gateway:azure/gpt-5.5",
                               "pricing": {"promptPerToken": "0.000006", "completionPerToken": "0.00003",
                                           "cacheReadPerToken": "0.0000006", "cacheWritePerToken": None}}]}
        with mock.patch.object(gateway, "list_models", return_value=listing):
            self.assertEqual(usage.cost_of("gateway:azure/gpt-5.5", 1_000_000, 0), Decimal("6.000000"))
            self.assertEqual(usage.cost_of("gateway:azure/gpt-5.5", 1_000_000, 0, 1_000_000), Decimal("0.600000"),
                             "input read from the provider's cache has the listed price of its own")
        # A restart (empty cache) with the gateway down still prices from the stored table
        usage._prices.update({"at": -usage.PRICE_TTL_S, "table": {}})
        with mock.patch.object(gateway, "list_models", return_value={"models": []}):
            self.assertEqual(usage.cost_of("gateway:azure/gpt-5.5", 1_000_000, 0), Decimal("6.000000"))
            self.assertEqual(usage.cost_of("gateway:azure/gpt-5.5", 1_000_000, 0, 1_000_000), Decimal("0.600000"))
            self.assertEqual(usage.cost_of("gateway:azure/gpt-5.6-luna", 1_000_000, 0), Decimal("0.200000"),
                             "known prices stand in for models never listed")
        usage._prices.update({"at": -usage.PRICE_TTL_S, "table": {}})
