############################################################
#  [*] assistant — the AI container's data home
#
#  Prompt versions, conversation threads, the retrieval
#  index (pgvector) and per-turn telemetry. Served to the
#  node container through /internal/assistant/*.
############################################################


from django.apps import AppConfig


class AssistantConfig(AppConfig):
    name = "compliance.assistant"
    label = "assistant"
