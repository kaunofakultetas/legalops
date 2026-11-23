############################################################
#  [*] extract_obligations — read the acts again
#
#  Queues one corpus.extract_obligations job for every enabled
#  act and standard whose obligations are behind: never
#  extracted, or extracted before the prompt version now in
#  force was written (corpus/obligations.py is_behind). After
#  a change of the extraction prompt or of its model that is
#  the whole corpus; after a run in which some acts failed it
#  is only what is left — running the command again finishes
#  the work and pays for nothing twice. Acts named by slug
#  are queued whatever their state.
#
#  The worker reads the acts one after another, the smallest
#  first, so a fault shows early and costs little. The jobs
#  wait below the work users start: a report queued meanwhile
#  goes first, and an act that report had to read itself is
#  skipped when its turn comes. An act already waiting or
#  being read is not queued twice. Obligations an admin has
#  reviewed are never touched, and an act keeps its present
#  proposals until its new extraction has succeeded as a
#  whole (corpus/obligations.py).
#
#  Used by:
#    - the operator, by hand, after the extraction prompt or
#      its model changed (docs/markdown/en/operations.md §6)
############################################################


from django.core.management.base import BaseCommand, CommandError


from compliance.corpus.models import LegalDocument
from compliance.corpus.obligations import KINDS, is_behind, source_of
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
    help = "Queue obligation extraction for the acts whose obligations are older than the prompt in force"






    ############################################################
    # add_arguments
    ############################################################
    #
    # Slugs name acts to read again whatever their state;
    # without any, every enabled act that is behind is taken.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def add_arguments(self, parser):
        parser.add_argument("slugs", nargs="*", help="acts to read again whatever their state")






    ############################################################
    # handle
    ############################################################
    #
    # Chooses the acts, queues those not already waiting and
    # says what it did — the prompt version and the model the
    # acts will be read with included, so a prompt that is not
    # the expected one shows before anything is spent.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def handle(self, *args, **options):
        slugs = options["slugs"]
        ingested = LegalDocument.objects.select_related("current_version").filter(current_version__isnull=False)


        # STEP 1: the named acts, or every enabled act that is behind
        # ===========================================================
        try:
            if slugs:
                documents = list(ingested.filter(slug__in=slugs))
                unknown = sorted(set(slugs) - {d.slug for d in documents})
                if unknown:
                    raise CommandError(f"No ingested act is called {', '.join(unknown)}")
            else:
                documents = [d for d in ingested.filter(enabled=True) if is_behind(d)]
            versions = [active_version(slug) for slug in sorted({KINDS[source_of(d)][0] for d in documents})]
        except PromptNotConfigured as exc:
            raise CommandError(f"{exc} (run seed_prompts first)")
        documents.sort(key=lambda d: (d.current_version.char_count, d.slug))
        reading = " and ".join(f"{v.prompt.slug} v{v.version_no} on {v.model}" for v in versions)


        # STEP 2: one job per act that is not waiting already
        # ===================================================
        queued, waiting = [], []
        for document in documents:
            subject = f"obligations:{document.id}"
            if Job.objects.filter(subject=subject, status__in=("queued", "running")).exists():
                waiting.append(document.slug)
                continue
            enqueue("corpus.extract_obligations",
                    {"document_id": document.id, "language": "Lithuanian", "only_behind": not slugs},
                    subject=subject, priority=PRIORITY)
            queued.append(document.slug)
        if queued:
            self.stdout.write(f"Queued {len(queued)} act(s) for {reading}: {', '.join(queued)}")
        if waiting:
            self.stdout.write(f"Already waiting or being read: {', '.join(waiting)}")
        if not documents:
            self.stdout.write("Nothing is behind — every act was read with the prompt in force")
