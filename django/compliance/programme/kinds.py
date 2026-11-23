############################################################
#  [*] programme.kinds — the kinds of work product
#
#    KINDS — kind → its module
#
#  A kind is a module with TITLE (per language), NEEDS (the
#  kinds it builds on), generate(run) and validate(content,
#  library, language, judge=None). Adding a kind is adding
#  its module here, its prompts and its page — no table and
#  no migration.
############################################################


from compliance.programme import governance, policy, risks


KINDS = {"policy": policy, "governance": governance, "risks": risks}
