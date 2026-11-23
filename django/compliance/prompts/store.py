############################################################
#  [*] prompts.store — create versions, activate, seed
#
#  The write side every caller shares (the API, the seed
#  command, the tests): a new version always gets the next
#  number (under a lock on the prompt row), activation is one
#  column flip.
#
#    add_version(prompt, text, model, ...)  → PromptVersion
#    activate_version(prompt, version)      → None
#    active_version(slug)                   → PromptVersion (or raise)
#    render(text, variables)                → the filled template
#    follows_defaults(prompt, version)      → does a new default replace it
#    seed_defaults(directory)               → {created, upgraded, pending}
############################################################


import hashlib
import json
import re
import uuid
from pathlib import Path


import yaml
from django.db import transaction


from compliance.common.timestamps import utc_now
from compliance.prompts.models import Prompt, PromptVersion


DEFAULTS_DIR = Path(__file__).resolve().parent / "defaults"
PLACEHOLDER = re.compile(r"\{([A-Z][A-Z0-9_]*)\}")








############################################################
# PromptNotConfigured
############################################################
#
# Raised when a pipeline step's prompt has no active version
# — the step fails with this message instead of running on
# an invisible default.
#
# Used by:
#   - active_version (below), assistant/llm.py
############################################################

class PromptNotConfigured(Exception):
    pass








############################################################
# active_version
############################################################
#
# The active PromptVersion of a slug.
#
# Used by:
#   - assistant/llm.py — run_prompt
############################################################

def active_version(slug):
    prompt = Prompt.objects.select_related("active_version").filter(slug=slug).first()
    if prompt is None or prompt.active_version is None:
        raise PromptNotConfigured(f"Prompt '{slug}' has no active version — activate one on the prompts page")
    return prompt.active_version








############################################################
# render
############################################################
#
#   render("Answer in {LANGUAGE}.", {"LANGUAGE": "Lithuanian"})
#
# Fills the placeholders present in `variables`; unknown
# placeholders stay visible so a typo in the editor shows.
#
# Used by:
#   - assistant/llm.py — run_prompt
#   - prompts/api/views.py — the test run
############################################################

def render(text, variables):
    return PLACEHOLDER.sub(lambda m: str(variables[m.group(1)]) if m.group(1) in variables else m.group(0), text)








############################################################
# add_version
############################################################
#
# Appends the next version to a prompt; `activate=True`
# makes it live at once. The prompt row is locked first, so
# two editors saving at once get consecutive numbers instead
# of one of them hitting the unique constraint.
#
# Used by:
#   - prompts/api/views.py — create_version
#   - seed_defaults (below)
############################################################

def add_version(prompt, text, model, temperature=None, max_tokens=None, note="", created_by=None, activate=False,
                source="user", default_hash=None):
    with transaction.atomic():
        prompt = Prompt.objects.select_for_update().get(id=prompt.id)
        last = prompt.versions.order_by("-version_no").values_list("version_no", flat=True).first() or 0
        version = PromptVersion.objects.create(
            id=str(uuid.uuid4()), prompt=prompt, version_no=last + 1, text=text, model=model,
            temperature=temperature, max_tokens=max_tokens, note=note, created_by=created_by,
            source=source, default_hash=default_hash, created_at=utc_now(),
        )
        if activate:
            activate_version(prompt, version)
    return version








############################################################
# activate_version
############################################################
#
# Used by:
#   - add_version (above)
#   - prompts/api/views.py — activate
############################################################

def activate_version(prompt, version):
    prompt.active_version = version
    prompt.updated_at = utc_now()
    prompt.save(update_fields=["active_version", "updated_at"])








############################################################
# default_hash
############################################################
#
# The identity of one shipped default: its text and model
# settings. A YAML edit changes it; a re-deploy of the same
# YAML does not.
#
# Used by:
#   - seed_defaults (below)
############################################################

def default_hash(spec):
    material = json.dumps([spec["text"].strip(), spec.get("model"), spec.get("temperature"),
                           spec.get("max_tokens")], ensure_ascii=False)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()








############################################################
# follows_defaults
############################################################
#
# Does a prompt's active version move on when a new default
# ships? It does while it is a shipped default itself (or
# there is none) — and while an admin changed only how it
# runs: a version of theirs whose text is a shipped default's
# word for word, on another model or other settings. Picking
# a model is not writing a prompt, and it must not leave the
# prompt on an old text. A text an admin wrote stays.
#
# Used by:
#   - seed_defaults (below)
############################################################

def follows_defaults(prompt, active):
    return (active is None or active.source == "default"
            or prompt.versions.filter(source="default", text=active.text).exists())








############################################################
# seed_defaults
############################################################
#
# Reads every prompts/defaults/*.yaml (slug, name, kind,
# description, variables, model, text, output_schema):
#
#   - a missing prompt is created with the default active
#   - the prompt's metadata (name, description, variables,
#     schema) always follows the YAML — the code reads them
#   - a default not seen before becomes a new version; it is
#     activated while the active version follows the defaults
#     (follows_defaults), else it waits ("pending") for an
#     admin to compare and activate
#   - where an admin had chosen their own model or settings
#     for the default's text, the new text is activated on
#     those: one more version, theirs, beside the default as
#     shipped
#
# Returns {"created": [...], "upgraded": [...], "pending": [...]}.
#
# Used by:
#   - management/commands/seed_prompts.py
#   - tests/test_prompts.py
############################################################

def seed_defaults(directory=DEFAULTS_DIR):
    outcome = {"created": [], "upgraded": [], "pending": []}
    for path in sorted(Path(directory).glob("*.yaml")):
        spec = yaml.safe_load(path.read_text(encoding="utf-8"))
        now = utc_now()


        # STEP 1: the prompt row, metadata synced from the YAML
        # =====================================================
        prompt, created = Prompt.objects.get_or_create(slug=spec["slug"], defaults={
            "id": str(uuid.uuid4()), "name": spec["name"], "created_at": now, "updated_at": now})
        prompt.name = spec["name"]
        prompt.description = (spec.get("description") or "").strip()
        prompt.kind = spec.get("kind", "pipeline")
        prompt.variables = spec.get("variables", [])
        prompt.output_schema = spec.get("output_schema")
        prompt.save(update_fields=["name", "description", "kind", "variables", "output_schema"])


        # STEP 2: a new default text becomes a version
        # ============================================
        digest = default_hash(spec)
        if prompt.versions.filter(default_hash=digest).exists():
            continue
        active = prompt.active_version
        takes_over = follows_defaults(prompt, active)
        shipped = add_version(prompt, spec["text"].strip(), spec.get("model", "gateway:azure/gpt-5.5"),
                              temperature=spec.get("temperature"), max_tokens=spec.get("max_tokens"),
                              note=f"shipped default ({now.date().isoformat()})", activate=takes_over,
                              source="default", default_hash=digest)
        chosen = (active.model, active.temperature, active.max_tokens) if active is not None else None
        if takes_over and active is not None and active.source != "default" \
                and chosen != (shipped.model, shipped.temperature, shipped.max_tokens):
            add_version(prompt, shipped.text, active.model, temperature=active.temperature,
                        max_tokens=active.max_tokens, activate=True,
                        note=f"shipped default ({now.date().isoformat()}) on the model settings of v{active.version_no}")
        if created or active is None:
            outcome["created"].append(prompt.slug)
        elif takes_over:
            outcome["upgraded"].append(prompt.slug)
        else:
            outcome["pending"].append(prompt.slug)
    return outcome
