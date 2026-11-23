############################################################
#  [*] eval_prompts — measure the prompts against their cases
#
#  Runs the suites of prompts/evals (all of them, or those
#  named) against the real model, through the code the product
#  itself runs, and prints every case the model got wrong with
#  what was expected. Each suite's score is compared with the
#  one recorded for it in prompts/evals/baseline.json: a suite
#  that scores below its baseline fails the command, so a
#  prompt change that made the model worse shows before it is
#  shipped. A suite whose answers vary a little from run to
#  run (the gap analysis: a case or two of seventy) carries a
#  `slack` in its baseline and fails only below that.
#  --record writes the scores as the new baseline,
#  with the prompt version and model that earned them — after
#  a person has looked at what is still wrong. The version is
#  named by its number in this installation's database: the
#  same wording may carry another number elsewhere.
#
#  A run spends real money, shown at the end: about a dollar
#  for the six suites, nearly half of it the gap analysis
#  (measured 2026-11-12), cents for each of the others. The
#  scope and citations suites read this installation's corpus.
#
#  Used by:
#    - whoever changes a prompt, by hand, before and after
#      (docs/markdown/en/operations.md §12)
############################################################


import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum

from compliance.assistant.models import LlmCall
from compliance.common.timestamps import utc_now
from compliance.prompts.evals import suites
from compliance.prompts.store import PromptNotConfigured, active_version


BASELINE = Path(suites.__file__).parent / "baseline.json"








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
    help = "Run the prompts' labelled cases against the real model and compare with the recorded baseline"






    ############################################################
    # add_arguments
    ############################################################
    #
    # Suite names limit the run; --record accepts its scores
    # as the baseline; --baseline names another file for it.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def add_arguments(self, parser):
        parser.add_argument("suites", nargs="*", help=f"suites to run (default: all of {', '.join(suites.SUITES)})")
        parser.add_argument("--record", action="store_true", help="write the scores as the new baseline")
        parser.add_argument("--baseline", default=str(BASELINE), help="the baseline file")






    ############################################################
    # handle
    ############################################################
    #
    # Runs each suite, prints its misses and its score beside
    # the baseline's, then what the run cost. Fails when a
    # suite scored below its baseline, unless the scores are
    # being recorded.
    #
    # Used by:
    #   - Django's command runner
    ############################################################

    def handle(self, *args, **options):
        names = options["suites"] or list(suites.SUITES)
        unknown = sorted(set(names) - set(suites.SUITES))
        if unknown:
            raise CommandError(f"No suite is called {', '.join(unknown)} (there are: {', '.join(suites.SUITES)})")
        path = Path(options["baseline"])
        baseline = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        started, worse = utc_now(), []
        for name in names:
            slug = suites.SUITES[name][0]
            try:
                version = active_version(slug)
            except PromptNotConfigured as exc:
                raise CommandError(f"{exc} (run seed_prompts first)")
            results = suites.run(name)
            passed = sum(result["ok"] for result in results)
            for result in results:
                if not result["ok"]:
                    self.stdout.write(f"  MISS {name}/{result['id']}: expected {result['expected']}, got {result['got']}")
            before = baseline.get(name)
            against = (f" (baseline {before['passed']} of {before['of']}"
                       + (f", fails below {before['passed'] - before['slack']}" if before.get("slack") else "")
                       + f", {before['prompt']})") if before else " (no baseline)"
            self.stdout.write(f"{name}: {passed} of {len(results)} with {slug} v{version.version_no} on {version.model}{against}")
            # A suite whose answers vary from run to run by a case or
            # two carries that as its slack
            slack = (before or {}).get("slack", 0)
            if before and passed < before["passed"] - slack:
                worse.append(name)
            baseline[name] = {"passed": passed, "of": len(results), **({"slack": slack} if slack else {}),
                              "prompt": f"{slug} v{version.version_no}", "model": version.model,
                              "date": started.date().isoformat()}
        spent = LlmCall.objects.filter(created_at__gte=started).aggregate(usd=Sum("cost_usd"))["usd"] or 0
        self.stdout.write(f"Model calls since the run began cost ${float(spent):.2f}")
        if options["record"]:
            path.write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            self.stdout.write(f"Recorded as the baseline in {path}")
        elif worse:
            raise CommandError(f"Below the baseline: {', '.join(worse)}")
