#!/usr/bin/env python3
############################################################
#  [*] manage.py — Django's command-line entry point
#
#  Standard except for the default settings module, which
#  points at compliance.settings. The test suite overrides
#  it with --settings=compliance.tests.settings (see
#  runTests.sh).
############################################################


import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "compliance.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
