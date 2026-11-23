############################################################
#  [*] Users — an account deleted with its data
#
#  An admin may delete an account for good, and with it what
#  the account owns: its companies (their reports,
#  credentials, adopted standards and roles go with them),
#  its documents (their text, search chunks and files) and
#  its conversations. The record of what happened stays —
#  the usage log keeps its calls and costs, the audit log its
#  rows, neither linked to anyone any more — but the chat
#  transcripts the usage log kept are erased: they are the
#  account's own words. A document another account put into
#  one of these companies stays with its owner, detached, as
#  when a company is deleted on its own. The files go only
#  once the deletion is committed, so a rolled-back request
#  keeps them.
############################################################


import os


from django.db import transaction


from compliance.analysis.models import Report
from compliance.assistant.models import LlmCall
from compliance.chat.models import ChatThread
from compliance.companies.models import Company, CompanyDocument


# The report states of an analysis still at work
RUNNING = ("queued", "running")








############################################################
# owned_data
############################################################
#
# What deleting the account would remove, as counts: its
# companies, their reports, its documents and its
# conversations, archived ones included.
#
# Used by:
#   - users/api/users_views.py — user_item's purge, its answer
#     and its audit row
############################################################

def owned_data(user):
    return {
        "companies": Company.objects.filter(owner=user).count(),
        "reports": Report.objects.filter(company__owner=user).count(),
        "documents": CompanyDocument.objects.filter(owner=user).count(),
        "threads": ChatThread.objects.filter(user=user).count(),
    }








############################################################
# analysis_running
############################################################
#
# Whether one of the account's companies has an analysis
# queued or running: it must be cancelled before the company
# can go, as for a company's own delete.
#
# Used by:
#   - users/api/users_views.py — user_item's purge
############################################################

def analysis_running(user):
    return Report.objects.filter(company__owner=user, status__in=RUNNING).exists()








############################################################
# _remove_files
############################################################
#
# Removes the deleted documents' files; one already gone is
# no error, the same rule as a single document's delete.
#
# Used by:
#   - purge_account (below)
############################################################

def _remove_files(paths):
    for path in paths:
        try:
            os.remove(path)
        except OSError:
            pass








############################################################
# purge_account
############################################################
#
# Deletes the account and what it owns (see the header) in
# the caller's transaction. The owner's links refuse a plain
# delete while the account owns anything, so its documents
# go first, then its companies, then the account itself.
#
# Used by:
#   - users/api/users_views.py — user_item's purge
############################################################

def purge_account(user):
    # STEP 1: the account's words in the usage log
    # ============================================
    LlmCall.objects.filter(user=user).update(transcript=None)


    # STEP 2: its documents, their files once committed
    # =================================================
    documents = CompanyDocument.objects.filter(owner=user)
    paths = list(documents.values_list("file_path", flat=True))
    documents.delete()
    transaction.on_commit(lambda: _remove_files(paths))


    # STEP 3: its companies; another owner's document in one
    # of them stays, detached
    # ======================================================
    CompanyDocument.objects.filter(company__owner=user).update(company=None)
    Company.objects.filter(owner=user).delete()


    # STEP 4: the account — its sessions and conversations go
    # with it, every other row keeps its history unlinked
    # =======================================================
    user.delete()
