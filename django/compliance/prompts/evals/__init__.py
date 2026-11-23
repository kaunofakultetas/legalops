############################################################
#  [*] prompts.evals — what the prompts are measured against
#
#  A prompt is changed by rewriting sentences, and nothing in
#  a sentence says whether the model now reads the law better
#  or worse. This package holds what does: cases with the
#  answer a careful reader gives, written down with the
#  reason and kept in the repository (cases/*.yaml), and the
#  suites that put each case to the real model through the
#  code the product itself runs (suites.py). The command
#  `manage.py eval_prompts` runs them, prints every case the
#  model got wrong, and compares the score with the one
#  recorded when the prompt in force was accepted
#  (baseline.json).
#
#  The labels are the assistant's (Claude), made by reading
#  the provisions and documents named in each case; a person
#  overrules one by editing it. They are not the unit tests:
#  those run against a fake model and prove the plumbing; a
#  suite spends real money (cents, the gap analysis about
#  forty) to prove a prompt.
############################################################
