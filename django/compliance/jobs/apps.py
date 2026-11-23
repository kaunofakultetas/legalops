############################################################
#  [*] jobs — the queue and the worker
############################################################


from django.apps import AppConfig


class JobsConfig(AppConfig):
    name = "compliance.jobs"
    label = "jobs"

    def ready(self):
        # Handler modules register themselves on import; the
        # registry must be populated in the worker AND in the
        # web process (the API validates kinds on enqueue)
        from compliance.jobs import handlers  # noqa: F401
