############################################################
#  [*] read_sanctions — have the acts' sanctions read
#
#  Queues one corpus.read_sanctions job: the sanction
#  provisions of every enabled act that was never read — or
#  of the acts named by slug — are read into tiers
#  (corpus/sanctions.py) and kept on each act's version. A
#  report then shows a finding what a breach of its provision
#  can cost. With --again the acts already read are read
#  anew — after the prompt or its model changed.
#
#  A report reads the acts it assesses by itself; this command
#  is for the rest of the corpus — a national law that lays
#  down the fines for an EU regulation is found only once it
#  has been read. The job waits below the work users start
#  and is not queued twice.
#
#  Used by:
#    - the operator, by hand, once after the feature ships and
#      after a change of the prompt (docs/markdown/en/operations.md §6)
############################################################


from django.core.management.base import BaseCommand, CommandError

from compliance.corpus.models import LegalDocument
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.prompts.store import PromptNotConfigured, active_version


# Below the work users start (0), above the scheduled checks
PRIORITY = -1








############################################################
# Command
############################################################
#
# The command Django runs under this file's name; its help
# text is its line in the list of commands.
#
# Used by:
#   - the operator, through manage.py
############################################################

class Command(BaseCommand):
    help = "Queue the reading of the acts' sanction provisions into tiers"






    ############################################################
    # add_arguments
    ############################################################
    #
    # Slugs name the acts to read; without any, every enabled
    # act is taken.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def add_arguments(self, parser):
        parser.add_argument("slugs", nargs="*", help="acts to read; every enabled act when none is named")
        parser.add_argument("--again", action="store_true", help="read anew the acts already read")






    ############################################################
    # handle
    ############################################################
    #
    # Chooses the acts, queues the job unless one is waiting,
    # and says what it did — the prompt version and model
    # included, so a prompt that is not the expected one shows
    # before anything is spent.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def handle(self, *args, **options):
        slugs, again = options["slugs"], options["again"]
        try:
            version = active_version("corpus.sanctions")
        except PromptNotConfigured as exc:
            raise CommandError(f"{exc} (run seed_prompts first)")
        rows = LegalDocument.objects.select_related("current_version").filter(current_version__isnull=False) \
            .exclude(doc_type="standard")
        if slugs:
            documents = list(rows.filter(slug__in=slugs))
            unknown = sorted(set(slugs) - {document.slug for document in documents})
            if unknown:
                raise CommandError(f"No ingested act is called {', '.join(unknown)}")
        else:
            documents = list(rows.filter(enabled=True))
        waiting = [document for document in documents if again or document.current_version.sanctions is None]
        if not waiting:
            self.stdout.write("Every act has been read — nothing to do (use --again to read anew)")
            return
        if Job.objects.filter(kind="corpus.read_sanctions", status__in=("queued", "running")).exists():
            self.stdout.write("A reading is already waiting or running")
            return
        enqueue("corpus.read_sanctions", {"document_ids": [document.id for document in waiting] if slugs else None,
                                          "again": again}, subject="sanctions", priority=PRIORITY)
        self.stdout.write(f"Queued: {len(waiting)} act(s) to read with corpus.sanctions v{version.version_no} "
                          f"on {version.model}")
