############################################################
#  [*] prompts — immutable versions, one active
#
#  Models:
#    - Prompt        — one named prompt of the pipeline or
#                      the chat, with the placeholders it may
#                      use and the JSON schema its output must
#                      match (pipeline steps)
#    - PromptVersion — one immutable text + model settings;
#                      editing means a new version, activation
#                      flips prompt.active_version
#
#  Defaults ship as YAML in prompts/defaults/ and the
#  seed_prompts command loads them: a changed default
#  becomes a new version (source "default"), activated while
#  the prompt still runs a shipped text — a default, or a
#  default an admin only moved to another model, whose model
#  the new text then keeps. A text an admin wrote stays
#  active, and the new default waits beside it in the
#  editor.
#
#  Tables: prompts, prompt_versions
############################################################


from django.db import models


from compliance.users.models import User


PROMPT_KINDS = ("chat", "pipeline", "corpus")


class Prompt(models.Model):
    id = models.TextField(primary_key=True)
    slug = models.TextField(unique=True)
    name = models.TextField()
    description = models.TextField(blank=True, default="")
    kind = models.TextField(default="pipeline")
    variables = models.JSONField(default=list, blank=True)
    output_schema = models.JSONField(null=True, blank=True)
    active_version = models.ForeignKey("PromptVersion", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = "prompts"
        constraints = [
            models.CheckConstraint(condition=models.Q(kind__in=PROMPT_KINDS), name="prompts_kind_check"),
        ]


class PromptVersion(models.Model):
    id = models.TextField(primary_key=True)
    prompt = models.ForeignKey(Prompt, on_delete=models.CASCADE, related_name="versions")
    version_no = models.IntegerField()
    text = models.TextField()
    model = models.TextField()
    temperature = models.FloatField(null=True, blank=True)
    max_tokens = models.IntegerField(null=True, blank=True)
    note = models.TextField(blank=True, default="")
    # "default" = shipped in prompts/defaults/*.yaml (default_hash
    # names the exact shipped text); "user" = written in the editor
    source = models.TextField(default="user")
    default_hash = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="prompt_versions")
    created_at = models.DateTimeField()

    class Meta:
        db_table = "prompt_versions"
        constraints = [
            models.UniqueConstraint(fields=["prompt", "version_no"], name="prompt_versions_unique_no"),
        ]
