############################################################
#  [*] verify_obligations — have the register judged
#
#  Queues one corpus.verify_obligations job for every enabled
#  act and standard that holds obligations nobody has judged
#  yet: each is compared with the full text of the provisions
#  it cites and marked supported, partly or unsupported
#  (corpus/verify.py). The verdicts order a person's review on
#  the obligations page and decide nothing. Acts named by slug
#  are queued whatever their state, and with --again their
#  judged obligations are judged anew — after the judge's
#  prompt or its model changed.
#
#  The jobs wait below the work users start, an act already
#  waiting or being judged is not queued twice, and running
#  the command again after a failure pays for nothing twice:
#  only the obligations still unjudged are read.
#
#  Used by:
#    - the operator, by hand, before a review of the register
#      (docs/markdown/en/operations.md §6)
############################################################


from django.core.management.base import BaseCommand, CommandError

from compliance.corpus.models import LegalDocument, Obligation
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
    help = "Queue the judge for the acts whose obligations have not been compared with their provisions"






    ############################################################
    # add_arguments
    ############################################################
    #
    # Slugs name acts to judge whatever their state; without
    # any, every enabled act with unjudged obligations is taken.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def add_arguments(self, parser):
        parser.add_argument("slugs", nargs="*", help="acts to judge whatever their state")
        parser.add_argument("--again", action="store_true", help="judge anew the obligations already judged")






    ############################################################
    # handle
    ############################################################
    #
    # Chooses the acts, queues those not already waiting and
    # says what it did — the judge's prompt version and model
    # included, so a prompt that is not the expected one shows
    # before anything is spent.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def handle(self, *args, **options):
        slugs, again = options["slugs"], options["again"]
        try:
            version = active_version("corpus.verify_obligations")
        except PromptNotConfigured as exc:
            raise CommandError(f"{exc} (run seed_prompts first)")
        ingested = LegalDocument.objects.select_related("current_version").filter(current_version__isnull=False)


        # STEP 1: the named acts, or every enabled act with unjudged obligations
        # ======================================================================
        if slugs:
            documents = list(ingested.filter(slug__in=slugs))
            unknown = sorted(set(slugs) - {d.slug for d in documents})
            if unknown:
                raise CommandError(f"No ingested act is called {', '.join(unknown)}")
        else:
            documents = list(ingested.filter(enabled=True))
        waiting = []
        for document in documents:
            rows = Obligation.objects.filter(document=document, version=document.current_version).exclude(status="rejected")
            count = rows.count() if again else rows.filter(verification__isnull=True).count()
            if count:
                waiting.append((document, count))
        waiting.sort(key=lambda pair: (pair[1], pair[0].slug))


        # STEP 2: one job per act that is not waiting already
        # ===================================================
        queued = 0
        for document, count in waiting:
            subject = f"verification:{document.id}"
            if Job.objects.filter(subject=subject, status__in=("queued", "running")).exists():
                self.stdout.write(f"Already waiting: {document.slug}")
                continue
            enqueue("corpus.verify_obligations", {"document_id": document.id, "again": again}, subject=subject,
                    priority=PRIORITY)
            queued += 1
            self.stdout.write(f"Queued: {document.slug} ({count} obligations)")
        self.stdout.write(f"{queued} act(s) queued, {sum(count for _, count in waiting)} obligations to judge "
                          f"with corpus.verify_obligations v{version.version_no} on {version.model}")
