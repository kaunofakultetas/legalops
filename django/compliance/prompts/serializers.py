############################################################
#  [*] prompts — the wire shapes
############################################################








############################################################
# serialize_prompt
############################################################
#
# The prompt with its active version number and whether a
# newer shipped default waits beside an admin's own active
# version; versions ride along for the detail route.
#
# Used by:
#   - prompts/api/views.py
############################################################

def serialize_prompt(prompt, with_versions=False):
    active = prompt.active_version if prompt.active_version_id else None
    newest_default = prompt.versions.filter(source="default").order_by("-version_no").values_list(
        "version_no", flat=True).first()
    data = {
        "id": prompt.id,
        "slug": prompt.slug,
        "name": prompt.name,
        "description": prompt.description,
        "kind": prompt.kind,
        "variables": prompt.variables,
        "outputSchema": prompt.output_schema,
        "activeVersion": active.version_no if active else None,
        "activeModel": active.model if active else None,
        "pendingDefault": newest_default if active and newest_default and newest_default > active.version_no
                          and active.source != "default" else None,
        "createdAt": prompt.created_at,
        "updatedAt": prompt.updated_at,
    }
    if with_versions:
        data["versions"] = [serialize_version(v, with_text=True) for v in prompt.versions.order_by("-version_no")]
    return data








############################################################
# serialize_version
############################################################
#
# with_text=False keeps list answers small.
#
# Used by:
#   - serialize_prompt (above)
#   - prompts/api/views.py, assistant/api/internal_views.py
############################################################

def serialize_version(version, with_text=False):
    data = {
        "id": version.id,
        "promptSlug": version.prompt.slug,
        "version": version.version_no,
        "model": version.model,
        "temperature": version.temperature,
        "maxTokens": version.max_tokens,
        "note": version.note,
        "source": version.source,
        "createdBy": version.created_by_id,
        "createdAt": version.created_at,
    }
    if with_text:
        data["text"] = version.text
    return data
