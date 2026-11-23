############################################################
#  [*] URL routing — the whole surface, one file
#
#  Every route of the service lives here, grouped by app
#  with each group's imports next to its paths — the file
#  reads as a table of contents for the whole API. Caddy
#  proxies /api/* to this container and never /internal/*
#  (the assistant container's door, isolated network only).
#  No trailing slashes anywhere (APPEND_SLASH is off).
#
#  Who may call what is not decided here — @require_auth /
#  @require_role on the views own that.
############################################################


from django.urls import path


urlpatterns = []

# Unknown routes and unhandled exceptions answer the JSON
# error envelope, never Django's HTML pages
handler400 = "compliance.common.http.bad_request"
handler403 = "compliance.common.http.forbidden"
handler404 = "compliance.common.http.not_found"
handler500 = "compliance.common.http.server_error"








############################################################
# Ops — the readiness probe
############################################################

from compliance.ops.api.views import health

urlpatterns += [
    path("api/health", health),                            # GET — 200 ok / 503 with the first reason
]








############################################################
# Auth — the caller's own session
############################################################
#
# Views live in compliance/users/api/auth_views.py.
############################################################

from compliance.users.api.auth_views import change_password, checkauth_admin, login, logout, logout_all, me

urlpatterns += [
    path("api/auth/login", login),                         # POST — email + password → session token
    path("api/auth/me", me),                               # GET  — the caller's profile
    path("api/auth/checkauth/admin", checkauth_admin),     # GET  — the admin tools' gate (Caddy forward_auth, /dbgate)
    path("api/auth/logout", logout),                       # POST — kill the presented session
    path("api/auth/logout-all", logout_all),               # POST — kill every session
    path("api/auth/change-password", change_password),     # POST — rotate; every OTHER session dies
]








############################################################
# Users — the admin's account directory
############################################################

from compliance.users.api.users_views import reset_password, user_item, users_collection

urlpatterns += [
    path("api/users", users_collection),                   # GET the directory / POST create
    path("api/users/<str:user_id>", user_item),            # GET / PATCH role,name,active / DELETE deactivate
    path("api/users/<str:user_id>/reset-password", reset_password),  # POST — admin sets a new password
]








############################################################
# Jobs — the queue monitor
############################################################

from compliance.jobs.api.views import cancel_job, get_job, job_counts, list_jobs

urlpatterns += [
    path("api/jobs", list_jobs),                           # GET — own jobs (admins: all)
    path("api/jobs/counts", job_counts),                   # GET — per-status counts
    path("api/jobs/<str:job_id>", get_job),                # GET — one job with its steps
    path("api/jobs/<str:job_id>/cancel", cancel_job),      # POST — cancel queued / request stop
]








############################################################
# Audit — the action trail
############################################################

from compliance.audit.api.views import list_audit

urlpatterns += [
    path("api/audit", list_audit),                         # GET — newest first (admin)
]








############################################################
# Companies — profiles, credentials, standards, roles, documents
############################################################
#
# The assistant's tools call these with the user's bearer,
# so the tenancy rule (own companies; admins see all) lives
# in the views once.
############################################################

from compliance.companies.api.company_views import (
    companies_collection, company_item, credential_item, credentials_collection,
)
from compliance.companies.api.document_views import (
    document_item, document_text, documents_collection, search as document_search,
)
from compliance.companies.api.role_views import role_item, roles_collection
from compliance.companies.api.standard_views import standard_item, standards_collection

urlpatterns += [
    path("api/companies", companies_collection),                                  # GET ?scope=own&q= / POST create
    path("api/companies/<str:company_id>", company_item),                         # GET detail / PUT partial / DELETE
    path("api/companies/<str:company_id>/credentials", credentials_collection),   # GET / POST a credential
    path("api/companies/<str:company_id>/credentials/<str:credential_id>", credential_item),  # PATCH / DELETE
    path("api/companies/<str:company_id>/standards", standards_collection),       # GET / POST an adopted standard
    path("api/companies/<str:company_id>/standards/<str:standard_id>", standard_item),  # PATCH / DELETE
    path("api/companies/<str:company_id>/roles", roles_collection),               # GET / POST a role profile
    path("api/companies/<str:company_id>/roles/<str:role_id>", role_item),        # GET / PATCH / DELETE
    path("api/documents", documents_collection),                                  # GET own list / POST multipart upload
    path("api/documents/search", document_search),                                # GET ?q=&companyId= — passages
    path("api/documents/<str:document_id>", document_item),                       # GET meta+outline / PATCH / DELETE
    path("api/documents/<str:document_id>/text", document_text),                  # GET — a window of the extracted text
]








############################################################
# Corpus — the indexed legal acts and their obligations
############################################################
#
# Reading is open to every signed-in user (it is public law);
# writing, refreshing and obligation review are admin-only.
# Ingestion and extraction run in the worker — these routes
# only queue jobs.
############################################################

from compliance.corpus.api.views import (
    citations, document_item, document_units, documents_collection, provision, refresh, refresh_all, reembed,
    search, unit_item, upload_version,
)
from compliance.programme.api.views import (
    cancel_product, company_programme, export_product, product_chart, product_content, product_item, revise_product,
)
from compliance.corpus.api.obligation_views import extract, obligation_item, obligations_collection, review, verify

urlpatterns += [
    path("api/corpus/documents", documents_collection),                           # GET the catalogue / POST add an act (admin)
    path("api/corpus/documents/<str:document_id>", document_item),                # GET detail / PATCH (admin) / DELETE (admin)
    path("api/corpus/documents/<str:document_id>/refresh", refresh),              # POST — queue fetch + ingest (admin)
    path("api/corpus/documents/<str:document_id>/upload", upload_version),        # POST multipart — a new version (admin)
    path("api/corpus/documents/<str:document_id>/units", document_units),         # GET — the provisions, paged
    path("api/corpus/documents/<str:document_id>/extract-obligations", extract),  # POST — queue extraction (admin)
    path("api/corpus/documents/<str:document_id>/verify-obligations", verify),    # POST — queue the judge (admin)
    path("api/corpus/units/<str:unit_id>", unit_item),                            # GET — one provision in full
    path("api/corpus/provision", provision),                                      # GET ?document=&article= — exact text
    path("api/corpus/search", search),                                            # POST — hybrid retrieval
    path("api/corpus/check-citations", citations),                                # POST — verify claimed article refs
    path("api/corpus/reembed", reembed),                                          # POST — queue re-embedding (admin)
    path("api/corpus/refresh-all", refresh_all),                                  # POST — queue a check of every source (admin)
    path("api/obligations", obligations_collection),                              # GET ?document=&status= / POST a standard obligation (admin)
    path("api/obligations/review", review),                                       # POST {ids, status} — bulk review (admin)
    path("api/obligations/<str:obligation_id>", obligation_item),                 # GET / PATCH review+edit (admin) / DELETE (admin)
]








############################################################
# Reports — gap analyses of companies
############################################################
#
# Tenancy follows the company. The analysis runs in the
# worker; the report row mirrors its job.
############################################################

from compliance.analysis.api.views import estimate as report_estimate
from compliance.analysis.api.views import (
    action_item, cancel_report, company_actions, company_law_changes, export_actions, export_report, finding_item,
    report_item, report_scope, reports_collection,
)

urlpatterns += [
    path("api/reports", reports_collection),                                           # GET ?companyId=&status= / POST start an analysis
    path("api/reports/estimate", report_estimate),                                     # GET ?companyId= — upper-bound USD cost
    path("api/companies/<str:company_id>/actions", company_actions),                   # GET — the company's action register
    path("api/companies/<str:company_id>/actions/export", export_actions),             # GET — the register as a workbook
    path("api/actions/<str:action_id>", action_item),                                  # PATCH — owner, due date, state, note
    path("api/companies/<str:company_id>/law-changes", company_law_changes),           # GET — changed provisions under its findings
    path("api/reports/<str:report_id>", report_item),                                  # GET the full report / PATCH sign-off / DELETE
    path("api/reports/<str:report_id>/cancel", cancel_report),                         # POST — stop a queued/running analysis
    path("api/reports/<str:report_id>/scope", report_scope),                           # POST — price or approve the acts to assess
    path("api/reports/<str:report_id>/findings/<str:finding_id>", finding_item),       # PATCH — reviewer override + note
    path("api/reports/<str:report_id>/export", export_report),                         # GET ?format=pdf|xlsx
    path("api/companies/<str:company_id>/programme", company_programme),               # GET the work products / POST generate one
    path("api/programme/<str:product_id>", product_item),                              # GET with content / PATCH approve / DELETE
    path("api/programme/<str:product_id>/content", product_content),                   # PUT — a person's edit of a draft
    path("api/programme/<str:product_id>/revise", revise_product),                     # POST — a new draft version of an approved one
    path("api/programme/<str:product_id>/cancel", cancel_product),                     # POST — stop a generation
    path("api/programme/<str:product_id>/chart", product_chart),                       # GET — the structure drawn as SVG
    path("api/programme/<str:product_id>/export", export_product),                     # GET ?format= — the product as a file
]








############################################################
# Chat — threads and message history
############################################################

from compliance.chat.api.views import chat_models, thread_item, thread_messages, threads_collection

urlpatterns += [
    path("api/chat/models", chat_models),                               # GET the models a conversation may use, the default
    path("api/chat/threads", threads_collection),                       # GET own threads / POST create
    path("api/chat/threads/<str:thread_id>", thread_item),              # GET / PATCH title,company,model / DELETE archive
    path("api/chat/threads/<str:thread_id>/messages", thread_messages), # GET history / POST upsert one message
]








############################################################
# Prompts — the versioned store (admin)
############################################################

from compliance.prompts.api.views import activate, create_version, list_prompts, prompt_item, test_run

urlpatterns += [
    path("api/prompts", list_prompts),                                              # GET — every prompt + active version
    path("api/prompts/<str:slug>", prompt_item),                                    # GET — versions with text
    path("api/prompts/<str:slug>/versions", create_version),                        # POST — append a version
    path("api/prompts/<str:slug>/versions/<int:version_no>/activate", activate),    # POST — make it live
    path("api/prompts/<str:slug>/test", test_run),                                  # POST — one model run of a draft
]








############################################################
# Usage — model calls, costs and budgets
############################################################
#
# Own usage for everyone; an admin may widen the scope to
# every account (scope=all) or one (userId=).
############################################################

from compliance.assistant.api.usage_views import call_item, calls_list, usage_summary

urlpatterns += [
    path("api/usage", usage_summary),                      # GET ?days=&scope=all&userId= — per day / kind / model / user
    path("api/usage/calls", calls_list),                   # GET ?kind=&limit=&offset= — the call log
    path("api/usage/calls/<str:call_id>", call_item),      # GET — one call with tool calls + transcript
]








############################################################
# MCP servers and models — the assistant's external tools
############################################################
#
# Admin-only registry of MCP servers whose tools the chat may
# call; the model list feeds the prompt editor.
############################################################

from compliance.assistant.api.mcp_views import llm_models, server_item, servers_collection, test as mcp_test

urlpatterns += [
    path("api/mcp/servers", servers_collection),                   # GET / POST (admin)
    path("api/mcp/servers/<str:server_id>", server_item),          # GET / PATCH / DELETE (admin)
    path("api/mcp/servers/<str:server_id>/test", mcp_test),        # POST — connect and list tools (admin)
    path("api/llm/models", llm_models),                            # GET — models with prices
]








############################################################
# Assistant — the AI container's internal door
############################################################
#
# ISOLATED-NETWORK ONLY: Caddy never proxies /internal/*,
# and every view demands the compose-injected
# X-Internal-Secret header.
############################################################

from compliance.assistant.api.internal_views import active_prompt, budget, mcp_servers, thread_message, thread_title, turn_log

urlpatterns += [
    path("internal/assistant/prompt", active_prompt),      # GET ?slug= — the active version with text
    path("internal/assistant/turn-log", turn_log),         # POST — one LlmCall row (with cost)
    path("internal/assistant/budget", budget),             # GET ?user_id= — today's USD budget
    path("internal/assistant/threads/<str:thread_id>/messages", thread_message),  # POST — persist an assistant reply
    path("internal/assistant/threads/<str:thread_id>/title", thread_title),        # POST — an AI title over the automatic one
    path("internal/assistant/mcp-servers", mcp_servers),   # GET — enabled MCP servers with credentials
]
