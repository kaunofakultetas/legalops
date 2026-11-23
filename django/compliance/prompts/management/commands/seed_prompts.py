############################################################
#  [*] seed_prompts — load the default prompt texts
#
#  Idempotent. A changed shipped default becomes a new
#  version — live at once while the prompt still runs a
#  shipped default, otherwise waiting beside the admin's own
#  active version (see prompts/store.py seed_defaults).
#
#  Used by:
#    - the operator, by hand, after an update that changes
#      prompts/defaults/ — a new installation gets the prompts
#      from postgres/bootstrap.sql.gz (nothing else runs it)
############################################################


from django.core.management.base import BaseCommand


from compliance.prompts.store import seed_defaults


class Command(BaseCommand):
    help = "Load the shipped default prompts (new ones and changed defaults)"

    def handle(self, *args, **options):
        outcome = seed_defaults()
        for label, key in (("Seeded", "created"), ("Upgraded to the new default", "upgraded"),
                           ("New default waiting beside an admin version", "pending")):
            if outcome[key]:
                self.stdout.write(f"{label}: {', '.join(outcome[key])}")
        if not any(outcome.values()):
            self.stdout.write("Prompts up to date — nothing to do")
