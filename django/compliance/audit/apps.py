############################################################
#  [*] audit — who did what
############################################################


from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "compliance.audit"
    label = "audit"
