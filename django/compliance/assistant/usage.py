############################################################
#  [*] assistant.usage — telemetry, prices and budgets
#
#    record_call(kind=, purpose=, model=, input_tokens=, …)
#        → one LlmCall row with its USD cost (never raises)
#    cost_of(model, input_tokens, output_tokens,
#            cached_tokens=0, cache_write_tokens=0) → Decimal
#    spent_today_usd(user_id)                    → Decimal
#    budget_status(user_id)                      → {limit, used, remaining, unit}
#
#  Prices come from the gateway's /models list (per-token USD
#  for prompt and completion and, where the gateway names
#  them, for input read from the provider's prompt cache and
#  written to it), fetched through the assistant and cached
#  for an hour; every successful fetch is also
#  stored (model_prices), so a gateway hiccup or a restart
#  keeps the last known prices, and the prices known when this
#  was written stand in for a fresh installation. A model with
#  no price at all costs 0 and is logged once. The daily budget (LLM_DAILY_BUDGET_USD, or the
#  account's own daily_budget_usd; USD per user per UTC day,
#  0 = unlimited) is enforced by the chat route, prompt test
#  runs and before report runs.
############################################################


import logging
import threading
import time
import uuid
from datetime import datetime, time as dtime, timezone
from decimal import Decimal


from django.conf import settings
from django.db import transaction
from django.db.models import Sum


from compliance.assistant import gateway
from compliance.assistant.models import CALL_KINDS, LlmCall, ModelPrice
from compliance.common.timestamps import utc_now
from compliance.users.models import User


logger = logging.getLogger(__name__)

PRICE_TTL_S = 3600

PRICE_RETRY_S = 300

# USD per token of the faculty gateway's models — (prompt,
# completion) or (prompt, completion, cache read, cache
# write) — on 2026-09-27, the GPT-6 ones and the cache prices
# on 2026-11-10: the last resort before any fetch
KNOWN_PRICES = {
    "gateway:azure/gpt-6-astra": (Decimal("0.00001"), Decimal("0.00005"), Decimal("0.000001"), Decimal("0.0000125")),
    "gateway:azure/gpt-6-sol": (Decimal("0.000002"), Decimal("0.00001"), Decimal("0.0000002"), Decimal("0.0000025")),
    "gateway:azure/gpt-6.1-sol": (Decimal("0.000002"), Decimal("0.00001"), Decimal("0.0000001"), Decimal("0.0000025")),
    "gateway:azure/gpt-5.5": (Decimal("0.000005"), Decimal("0.00003"), Decimal("0.0000005"), None),
    "gateway:azure/gpt-5.6-sol": (Decimal("0.000004"), Decimal("0.00002")),
    "gateway:azure/gpt-5.6-terra": (Decimal("0.000002"), Decimal("0.000012"), Decimal("0.0000002"), Decimal("0.0000025")),
    "gateway:azure/gpt-5.6-luna": (Decimal("0.0000002"), Decimal("0.0000012"), Decimal("0.00000002"), Decimal("0.00000025")),
    "gateway:azure/text-embedding-3-small": (Decimal("0.00000002"), Decimal("0")),
    "gateway:azure/text-embedding-3-large": (Decimal("0.00000013"), Decimal("0")),
}

# {"at": monotonic, "table": {model_id: (prompt, completion[, cache read, cache write])}}
_prices = {"at": -PRICE_TTL_S, "table": {}}
_prices_lock = threading.Lock()
_refreshing = threading.Lock()
_unknown_logged = set()








############################################################
# price_table
############################################################
#
# model id → (USD per prompt token, USD per completion
# token, USD per token read from the prompt cache, USD per
# token written to it — the last two None where the gateway
# names no such price), refreshed hourly. One thread refreshes while the
# others keep answering from the old table (the lock is never
# held across the network call); a failed refresh falls back
# to the stored table, then to KNOWN_PRICES, and is retried
# after PRICE_RETRY_S. Never raises — a gateway hiccup must
# not cost the telemetry row, nor zero the budgets.
#
# Used by:
#   - cost_of (below)
############################################################

def price_table():
    with _prices_lock:
        if time.monotonic() - _prices["at"] < PRICE_TTL_S:
            return _prices["table"]
    if not _refreshing.acquire(blocking=False):
        return _prices["table"] or KNOWN_PRICES
    try:
        answer = gateway.list_models(timeout=10)
        table = {}
        for model in answer.get("models", []):
            pricing = model.get("pricing") or {}
            table[model["id"]] = (Decimal(str(pricing.get("promptPerToken") or 0)),
                                  Decimal(str(pricing.get("completionPerToken") or 0)),
                                  *(Decimal(str(pricing[key])) if pricing.get(key) is not None else None
                                    for key in ("cacheReadPerToken", "cacheWritePerToken")))
        if table:
            _store_prices(table)
        else:
            table = _stored_prices()
    except Exception as exc:
        logger.warning("Model prices could not be refreshed: %s", exc)
        table = _stored_prices()
    finally:
        _refreshing.release()
    with _prices_lock:
        if table:
            _prices["table"], _prices["at"] = {**KNOWN_PRICES, **table}, time.monotonic()
        else:
            _prices["table"] = _prices["table"] or KNOWN_PRICES
            _prices["at"] = time.monotonic() - PRICE_TTL_S + PRICE_RETRY_S
        return _prices["table"]








############################################################
# _store_prices
############################################################
#
# A fetched table into model_prices (upsert) — never raising:
# pricing must not fail a model call's record.
#
# Used by:
#   - price_table (above)
############################################################

def _store_prices(table):
    try:
        now = utc_now()
        with transaction.atomic():
            for model, entry in table.items():
                prompt, completion, read, write = (*entry, None, None)[:4]
                ModelPrice.objects.update_or_create(model=model, defaults={
                    "prompt_per_token": prompt, "completion_per_token": completion,
                    "cache_read_per_token": read, "cache_write_per_token": write, "updated_at": now})
    except Exception:
        logger.exception("Could not store model prices")








############################################################
# _stored_prices
############################################################
#
# The last stored table, or {} — never raising.
#
# Used by:
#   - price_table (above)
############################################################

def _stored_prices():
    try:
        return {row.model: (row.prompt_per_token, row.completion_per_token, row.cache_read_per_token,
                            row.cache_write_per_token) for row in ModelPrice.objects.all()}
    except Exception:
        logger.exception("Could not read stored model prices")
        return {}








############################################################
# cost_of
############################################################
#
# What a call cost, in USD. `input_tokens` is the whole input; of it,
# `cached_tokens` were read from the provider's prompt cache
# and `cache_write_tokens` written to it, each at its own
# price when the table has one (a model without cache prices
# is charged the prompt price for all its input). A long
# prompt whose opening repeats from call to call — a chat
# turn's steps, a report's gap analysis — costs a fraction of
# what its token count suggests; a call that only fills the
# cache costs a little more. Bare ids are read as gateway
# ids; unknown models cost 0.
#
# Used by:
#   - record_call (below)
#   - analysis/estimate.py — what a run would cost
############################################################

def cost_of(model, input_tokens, output_tokens, cached_tokens=0, cache_write_tokens=0):
    key = model if ":" in (model or "") else f"gateway:{model}"
    entry = price_table().get(key)
    if entry is None:
        if key not in _unknown_logged:
            _unknown_logged.add(key)
            logger.info("No price known for model %s — cost recorded as 0", key)
        return Decimal(0)
    prompt, completion, read, write = (*entry, None, None)[:4]
    total = max(int(input_tokens or 0), 0)
    cached = min(max(int(cached_tokens or 0), 0), total)
    written = min(max(int(cache_write_tokens or 0), 0), total - cached)
    cost = (prompt * (total - cached - written) + (prompt if read is None else read) * cached
            + (prompt if write is None else write) * written + completion * int(output_tokens or 0))
    return cost.quantize(Decimal("0.000001"))








############################################################
# record_call
############################################################
#
# One LlmCall row, its cost computed from the three kinds of
# input token (cost_of); telemetry never fails the caller —
# the INSERT runs in its own savepoint, so a failure cannot
# poison the caller's transaction either. transcript is the
# chat turn's {user, assistant} text (the audit of what the
# assistant told a user).
#
# Used by:
#   - corpus/ingest.py, companies/indexing.py — embeddings
#   - corpus/obligations.py, analysis/pipeline.py — steps
#   - assistant/api/internal_views.py — chat turn logs
############################################################

def record_call(*, kind, model, purpose="", input_tokens=0, output_tokens=0, reasoning_tokens=0, duration_ms=0,
                user_id=None, thread_id=None, job_step_id=None, prompt_version_id=None, tool_calls=None, outcome="ok",
                transcript=None, cached_input_tokens=0, cache_write_tokens=0):
    try:
        cost = cost_of(model, input_tokens, output_tokens, cached_input_tokens, cache_write_tokens)
        with transaction.atomic():
            return LlmCall.objects.create(
                id=str(uuid.uuid4()), kind=kind if kind in CALL_KINDS else "chat", purpose=(purpose or "")[:80],
                user_id=user_id, thread_id=thread_id, job_step_id=job_step_id, prompt_version_id=prompt_version_id,
                model=model or "unknown", input_tokens=int(input_tokens or 0), output_tokens=int(output_tokens or 0),
                reasoning_tokens=int(reasoning_tokens or 0), cached_input_tokens=int(cached_input_tokens or 0),
                cache_write_tokens=int(cache_write_tokens or 0), cost_usd=cost,
                duration_ms=int(duration_ms or 0), tool_calls=tool_calls or [], outcome=(outcome or "ok")[:40],
                transcript=transcript, created_at=utc_now(),
            )
    except Exception:
        logger.exception("Could not record an LLM call (%s, %s)", kind, purpose)
        return None








############################################################
# spent_today_usd
############################################################
#
# The USD cost of the user's calls since 00:00 UTC.
#
# Used by:
#   - budget_status (below)
############################################################

def spent_today_usd(user_id):
    start = datetime.combine(utc_now().date(), dtime.min, tzinfo=timezone.utc)
    total = LlmCall.objects.filter(user_id=user_id, created_at__gte=start).aggregate(c=Sum("cost_usd"))["c"]
    return total or Decimal(0)








############################################################
# budget_status
############################################################
#
#   budget_status(user_id) → {"limit": 2.0, "used": 0.37, "remaining": 1.63, "unit": "USD"}
#
# The account's own daily_budget_usd when an admin set one,
# else the installation default — admins, the operators who
# set budgets, default to unlimited; limit 0 means unlimited
# (remaining is then None).
#
# Used by:
#   - assistant/api/internal_views.py — the chat route's check
#   - analysis/api/views.py — before a report run
#   - prompts/api/views.py — before a test run
#   - assistant/api/usage_views.py — the usage page
############################################################

def budget_status(user_id):
    row = User.objects.filter(id=user_id).values("daily_budget_usd", "role").first() if user_id else None
    own = row["daily_budget_usd"] if row else None
    if own is None and row and row["role"] == "admin":
        own = 0
    limit = Decimal(str(own if own is not None else settings.LLM_DAILY_BUDGET_USD or 0))
    used = spent_today_usd(user_id) if user_id else Decimal(0)
    remaining = None if limit == 0 else max(Decimal(0), limit - used)
    return {"limit": float(limit), "used": round(float(used), 4),
            "remaining": None if remaining is None else round(float(remaining), 4), "unit": "USD"}
