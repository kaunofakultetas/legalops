############################################################
#  [*] ops — operational commands
#
#  The home of the health probe and the management
#  commands an operator runs by hand.
############################################################


from django.apps import AppConfig


class OpsConfig(AppConfig):
    name = "compliance.ops"
    label = "ops"
