############################################################
#  [*] Test runner — Django's, with one upload folder per worker
#
#  Under --parallel every worker process has its own test
#  database but, unchanged, would share settings.UPLOAD_DIR:
#  tests/settings.py makes the folder once, before the
#  workers start. A test that compares the folder before and
#  after an upload then saw another worker's file appear (a
#  flaky "no orphan file" failure), and the orphan sweep
#  (ops/maintenance.py) could delete a file that another
#  worker's database still names. Each worker now makes a
#  fresh folder as it starts; a serial run keeps the one from
#  tests/settings.py.
#
#  tests/settings.py names it as TEST_RUNNER.
############################################################


import tempfile


from django.conf import settings
from django.test.runner import DiscoverRunner, ParallelTestSuite, _init_worker








############################################################
# init_worker_with_own_uploads
############################################################
#
# The pool initializer of every worker: Django's own (the
# worker's database, the start method's setup), then this
# process's own upload folder.
#
# Used by:
#   - OwnUploadsParallelTestSuite (below)
############################################################

def init_worker_with_own_uploads(*args, **kwargs):
    _init_worker(*args, **kwargs)
    settings.UPLOAD_DIR = tempfile.mkdtemp(prefix="legalops-test-uploads-")








############################################################
# OwnUploadsParallelTestSuite
############################################################
#
# ParallelTestSuite with the initializer above (Django reads
# init_worker off the class for exactly this).
#
# Used by:
#   - ComplianceTestRunner (below)
############################################################

class OwnUploadsParallelTestSuite(ParallelTestSuite):
    init_worker = init_worker_with_own_uploads








############################################################
# ComplianceTestRunner
############################################################
#
# Used by:
#   - tests/settings.py — TEST_RUNNER
############################################################

class ComplianceTestRunner(DiscoverRunner):
    parallel_test_suite = OwnUploadsParallelTestSuite
