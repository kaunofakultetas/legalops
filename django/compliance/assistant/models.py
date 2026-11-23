############################################################
#  [*] assistant — model-call telemetry
#
#  Models:
#    - LlmCall   — one row per model call: a chat turn (logged
#                  by the node assistant), a pipeline step or an
#                  embedding batch (logged by the worker through
#                  assistant.usage). Tokens — and how many of
#                  the input ones the provider read from its
#                  prompt cache or wrote to it, which it bills
#                  at other prices — a USD cost computed from
#                  the gateway's price list, duration, tool
#                  calls and outcome — what the usage page, the
#                  daily USD budget and cost control read.
#    - McpServer — an external MCP server (Streamable HTTP or
#                  SSE) whose tools the chat assistant may call,
#                  e.g. an external legal-corpus server; headers
#                  hold its credentials and never leave the
#                  isolated network
#    - ModelPrice — the last known USD per token of each model,
#                  refreshed from the gateway's list; what costs
#                  are computed with when the list is unreachable
#
#  Tables: llm_calls, mcp_servers, model_prices
############################################################


from django.db import models


from compliance.users.models import User


CALL_KINDS = ("chat", "job_step", "embed", "prompt_test")


class LlmCall(models.Model):
    id = models.TextField(primary_key=True)
    kind = models.TextField()
    purpose = models.TextField(blank=True, default="")
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="llm_calls")
    thread_id = models.TextField(null=True, blank=True)
    job_step_id = models.TextField(null=True, blank=True)
    prompt_version_id = models.TextField(null=True, blank=True)
    model = models.TextField()
    input_tokens = models.IntegerField(default=0)
    # Of the input tokens: those read from the provider's prompt
    # cache, and those written to it
    cached_input_tokens = models.IntegerField(default=0)
    cache_write_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    reasoning_tokens = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=14, decimal_places=6, default=0)
    duration_ms = models.IntegerField(default=0)
    tool_calls = models.JSONField(default=list, blank=True)
    outcome = models.TextField(default="ok")
    # Chat turns: {"user": text, "assistant": text} — the audit
    # of what the assistant told whom
    transcript = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "llm_calls"
        constraints = [
            models.CheckConstraint(condition=models.Q(kind__in=CALL_KINDS), name="llm_calls_kind_check"),
        ]
        indexes = [
            models.Index(fields=["-created_at"], name="llm_calls_created_idx"),
            models.Index(fields=["user", "created_at"], name="llm_calls_user_created_idx"),
            # A step's calls: its usage when it ends (jobs/runner.py)
            # and a report's cost and provenance (analysis/pipeline.py)
            models.Index(fields=["job_step_id"], name="llm_calls_job_step_idx"),
        ]



MCP_TRANSPORTS = ("http", "sse")


class McpServer(models.Model):
    id = models.TextField(primary_key=True)
    # Short slug; the assistant prefixes its tools with it
    name = models.TextField(unique=True)
    description = models.TextField(blank=True, default="")
    url = models.TextField()
    transport = models.TextField(default="http")
    headers = models.JSONField(default=dict, blank=True)
    # Tool names the assistant may use; empty = every tool
    allowed_tools = models.JSONField(default=list, blank=True)
    enabled = models.BooleanField(default=False)
    # The last successful tool listing: [{name, description}]
    tools = models.JSONField(default=list, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "mcp_servers"
        constraints = [
            models.CheckConstraint(condition=models.Q(transport__in=MCP_TRANSPORTS), name="mcp_servers_transport_check"),
        ]



class ModelPrice(models.Model):
    model = models.TextField(primary_key=True)
    prompt_per_token = models.DecimalField(max_digits=20, decimal_places=12)
    completion_per_token = models.DecimalField(max_digits=20, decimal_places=12)
    # Input read from / written to the prompt cache; null when
    # the gateway names no such price (the prompt price stands)
    cache_read_per_token = models.DecimalField(max_digits=20, decimal_places=12, null=True, blank=True)
    cache_write_per_token = models.DecimalField(max_digits=20, decimal_places=12, null=True, blank=True)
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "model_prices"
