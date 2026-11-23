############################################################
#  [*] Reports API — gap analyses of companies
#
#    GET    /api/reports?companyId=&status=&scope=own → {reports}
#    POST   /api/reports {companyId, language?, documentIds?, review?, internal?} → report + job
#    GET    /api/reports/{id}                        → report + acts + findings + actions
#    DELETE /api/reports/{id}
#    POST   /api/reports/{id}/cancel
#    POST   /api/reports/{id}/scope                  {acts?, approved?} → the price of the
#                                                    selection, or the report on its way again
#    PATCH  /api/reports/{id}/findings/{fid}         {overrideStatus?, reviewerNote?, cause?}
#    GET    /api/companies/{id}/actions              → the company's action register
#    GET    /api/companies/{id}/actions/export       → the register as a workbook
#    PATCH  /api/actions/{id}                        {status?, owner?, dueDate?, note?}
#    GET    /api/companies/{id}/law-changes          → what changed in the acts of its latest report
#    GET    /api/reports/{id}/export?format=pdf|xlsx → the file
#
#  Tenancy follows the company: a user sees the reports of
#  their own companies, an admin all. One report per company
#  runs at a time, and a run needs daily USD budget left.
############################################################


import re
import uuid
from datetime import date


from django.db import transaction
from django.http import HttpResponse


from compliance.analysis import register
from compliance.analysis.models import ACTION_STATES, FINDING_STATUSES, CompanyAction, Finding, Report, ReportAct
from compliance.analysis.pipeline import finding_counts
from compliance.analysis.serializers import serialize_company_action, serialize_finding, serialize_report
from compliance.assistant.usage import budget_status
from compliance.audit.log import audit
from compliance.common.http import get_json_object, json_error, json_response, methods, str_id
from compliance.common.timestamps import utc_now
from compliance.companies.api.company_views import visible_companies
from compliance.corpus.models import LegalDocument
from compliance.jobs.models import Job
from compliance.jobs.queue import enqueue
from compliance.users.auth import require_auth

# Tokens a run needs left in the day's budget to start
# USD a user must have left today to start an analysis (a run
# may then overdraw — it is never stopped halfway)
MIN_BUDGET_TO_START_USD = 0.25








############################################################
# visible_reports
############################################################
#
# The reports of the companies the caller may see.
#
# Used by:
#   - every route in this file
#   - the assistant's report tools (through these routes)
############################################################

def visible_reports(request):
    return Report.objects.filter(company__in=visible_companies(request)).select_related("company", "job")








############################################################
# reports_collection
############################################################
#
# GET  /api/reports?companyId=&status=&scope=own
# POST /api/reports
#
# The list is the newest 200 the caller may see; the filters
# narrow it before that cut, so a status asked for is not
# lost behind newer reports of another. scope=own narrows an
# admin to the reports of their own companies.
#
# Used by:
#   - Reports.jsx, CompanyDetail.jsx
#   - the assistant's runComplianceAnalysis / listReports tools
############################################################

@methods("GET", "POST")
@require_auth
def reports_collection(request):
    if request.method == "GET":
        rows = visible_reports(request).order_by("-created_at", "-id")
        if request.GET.get("scope") == "own":
            rows = rows.filter(company__owner=request.user)
        if request.GET.get("companyId"):
            rows = rows.filter(company_id=request.GET["companyId"])
        if request.GET.get("status"):
            rows = rows.filter(status=request.GET["status"])
        return json_response({"reports": [serialize_report(r, job=r.job) for r in rows[:200]]})

    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    # The company row is locked for the rest of the request, so
    # two simultaneous starts cannot both pass ALREADY_RUNNING
    company = visible_companies(request).select_for_update().filter(id=str_id(data.get("companyId"))).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    language = data.get("language") or "lt"
    if language not in ("lt", "en"):
        return json_error("language must be lt or en", 400, code="INVALID_FIELD")
    document_ids = data.get("documentIds") or []
    if not isinstance(document_ids, list) or len(document_ids) > 200 \
            or not all(str_id(d) for d in document_ids) or (document_ids and LegalDocument.objects.filter(
                id__in=document_ids, enabled=True).count() != len(set(document_ids))):
        return json_error("documentIds must list enabled corpus documents", 400, code="INVALID_FIELD")
    if not LegalDocument.objects.filter(enabled=True, current_version__isnull=False).exists():
        return json_error("The legal corpus is empty — an admin must ingest acts first", 409, code="CORPUS_EMPTY")
    review = data.get("review", False)
    if not isinstance(review, bool):
        return json_error("review must be true or false", 400, code="INVALID_FIELD")
    internal = data.get("internal", False)
    if not isinstance(internal, bool):
        return json_error("internal must be true or false", 400, code="INVALID_FIELD")
    # A report waiting for its scope to be approved counts: it is
    # approved or cancelled before the next one starts
    running = Report.objects.filter(company=company, status__in=("queued", "running", "scope_review")).first()
    if running is not None:
        return json_error("An analysis of this company is already running", 409, code="ALREADY_RUNNING")
    budget = budget_status(request.user.id)
    if budget["remaining"] is not None and budget["remaining"] < MIN_BUDGET_TO_START_USD:
        return json_error("Today's AI usage budget is spent — try again tomorrow", 429, code="BUDGET_EXCEEDED")

    report = Report.objects.create(id=str(uuid.uuid4()), company=company, created_by=request.user, status="queued",
                                   language=language, created_at=utc_now(),
                                   scope={"documentIds": document_ids, **({"review": True} if review else {}),
                                          **({"internal": True} if internal else {})})
    job = enqueue("report.analyze", {"report_id": report.id}, subject=f"report:{report.id}", created_by=request.user)
    Report.objects.filter(id=report.id).update(job=job)
    report.job = job
    audit(request, "reports.create", "report", report.id, {"company": company.id, "language": language})
    return json_response(serialize_report(report, job=job), status=201)








############################################################
# estimate
############################################################
#
# GET /api/reports/estimate?companyId=&documentIds=a,b
#
# The upper-bound USD cost of analysing the company now
# (analysis/estimate.py) — shown before the user starts a run.
# A scope the start would refuse is refused here the same
# way: acts that are not there would be priced as nothing.
#
# Used by:
#   - StartAnalysisDialog.jsx
#   - the assistant's runComplianceAnalysis tool (to warn first)
############################################################

@methods("GET")
@require_auth
def estimate(request):
    from compliance.analysis.estimate import estimate_report

    company = visible_companies(request).filter(id=str_id(request.GET.get("companyId"))).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    scope = [d for d in request.GET.get("documentIds", "").split(",") if d][:200]
    if scope and LegalDocument.objects.filter(id__in=scope, enabled=True).count() != len(set(scope)):
        return json_error("documentIds must list enabled corpus documents", 400, code="INVALID_FIELD")
    internal = request.GET.get("internal") == "true"
    return json_response({**estimate_report(company, scope or None, internal=internal),
                          "budget": budget_status(request.user.id)})








############################################################
# report_item
############################################################
#
# GET    /api/reports/{id}
# PATCH  /api/reports/{id}   {approved: true|false, note?}
# DELETE /api/reports/{id}
#
# PATCH is the sign-off of a finished report. A running report
# cannot be deleted (cancel it first); a signed-off one takes
# what it alone confirmed in the action register with it.
#
# Used by:
#   - ReportDetail.jsx
#   - the assistant's getReport tool
############################################################

@methods("GET", "PATCH", "DELETE")
@require_auth
def report_item(request, report_id):
    report = visible_reports(request).filter(id=report_id).first()
    if report is None:
        return json_error("Report not found", 404, code="NOT_FOUND")
    if request.method == "GET":
        return json_response(serialize_report(report, full=True, job=report.job))
    if request.method == "PATCH":
        return _approve(request, report)
    if report.status in ("queued", "running"):
        return json_error("Cancel the running analysis first", 409, code="STILL_RUNNING")
    if report.approved_at:
        # A signed-off report takes its evidence with it: what it alone confirmed in the register goes back
        Report.objects.filter(id=report.id).update(approved_by=None, approved_at=None, approval_note="")
        register.withdraw(report)
    report.delete()
    audit(request, "reports.delete", "report", report_id)
    return json_response({"ok": True})








############################################################
# _approve
############################################################
#
# The sign-off: {approved: true, note?} stamps who approved
# the finished report and when; {approved: false} withdraws
# it. A sign-off moves the company's action register
# (analysis/register.py): the earlier actions are held
# against the report, its plan comes in — the answer says
# what happened under `register`; a withdrawal takes the
# report's confirmations back. Audited.
#
# Used by:
#   - report_item (above)
############################################################

def _approve(request, report):
    data = get_json_object(request)
    if data is None or not isinstance(data.get("approved"), bool):
        return json_error("approved (true or false) is required", 400, code="MISSING_FIELDS")
    if report.status != "done":
        return json_error("Only finished reports can be approved", 409, code="NOT_FINISHED")
    note = data.get("note") or ""
    if not isinstance(note, str):
        return json_error("note must be text", 400, code="INVALID_FIELD")
    if data["approved"]:
        report.approved_by, report.approved_at, report.approval_note = request.user, utc_now(), note.strip()[:2000]
    else:
        report.approved_by, report.approved_at, report.approval_note = None, None, ""
    report.save(update_fields=["approved_by", "approved_at", "approval_note"])
    # The company's register moves on a sign-off and on nothing else
    moved = register.sign_off(report, request.user) if data["approved"] else {"withdrawn": register.withdraw(report)}
    audit(request, "reports.approve" if data["approved"] else "reports.unapprove", "report", report.id, {"register": moved})
    return json_response({**serialize_report(report, full=True, job=report.job), "register": moved})








############################################################
# cancel_report
############################################################
#
# POST /api/reports/{id}/cancel
#
# Used by:
#   - ReportDetail.jsx — the stop button
############################################################

@methods("POST")
@require_auth
def cancel_report(request, report_id):
    report = visible_reports(request).filter(id=report_id).first()
    if report is None:
        return json_error("Report not found", 404, code="NOT_FOUND")
    now = utc_now()
    # A report waiting for its scope has no job at work
    if Report.objects.filter(id=report.id, status="scope_review").update(status="cancelled", finished_at=now):
        audit(request, "reports.cancel", "report", report.id)
        report.refresh_from_db()
        return json_response(serialize_report(report, job=report.job))
    if report.status not in ("queued", "running") or report.job_id is None:
        return json_error(f"The analysis is already {report.status}", 409, code="NOT_CANCELLABLE")
    # Queued first, then running — a worker claiming the job
    # between the two writes still gets the flag
    if Job.objects.filter(id=report.job_id, status="queued").update(
            status="cancelled", cancel_requested=True, finished_at=now):
        Report.objects.filter(id=report.id, status__in=("queued", "running")).update(
            status="cancelled", finished_at=now)
    elif not Job.objects.filter(id=report.job_id, status="running").update(cancel_requested=True):
        report.refresh_from_db()
        return json_error(f"The analysis is already {report.status}", 409, code="NOT_CANCELLABLE")
    audit(request, "reports.cancel", "report", report.id)
    report.refresh_from_db()
    return json_response(serialize_report(report, job=report.job))








############################################################
# report_scope
############################################################
#
# POST /api/reports/{id}/scope
#
# The decision between the two parts of a report that waits
# in "scope_review": which of its acts the second part
# assesses. Body {acts: {reportActId: "assess" | "skip"},
# approved}. "assess" takes an act in whatever the verdict
# said — one waiting for facts, a directive, an act that does
# not bind the company and is assessed by choice, as good
# practice; "skip" leaves an act out; an act not named keeps
# what the run decided. The model's verdict stays on the row
# (applicability, reasoning): only what the report does with
# the act changes.
#
# Without `approved` nothing is stored and the answer prices
# the selection ({estimate, budget}). With it the choices are
# applied, the approval is stamped and audited with every
# change, and the job is queued for its second part.
#
# Used by:
#   - vite: Reports/ReportActs (the approval screen)
#   - assistant: approveReportScope tool
############################################################

@methods("POST")
@require_auth
def report_scope(request, report_id):
    from compliance.analysis.estimate import estimate_rest
    report = visible_reports(request).select_related("company").filter(id=report_id).first()
    if report is None:
        return json_error("Report not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    choices, approved = data.get("acts") or {}, data.get("approved", False)
    if not isinstance(choices, dict) or len(choices) > 500 \
            or not all(isinstance(value, str) and value in ("assess", "skip") for value in choices.values()):
        return json_error("acts must map act ids of the report to assess or skip", 400, code="INVALID_FIELD")
    if not isinstance(approved, bool):
        return json_error("approved must be true or false", 400, code="INVALID_FIELD")
    if report.status != "scope_review":
        return json_error("The report is not waiting for its scope to be approved", 409, code="NOT_WAITING")
    acts = list(report.acts.select_related("document__current_version").defer("document__current_version__text")
                .order_by("order"))
    if set(choices) - {act.id for act in acts}:
        return json_error("acts names an act that is not in this report", 400, code="INVALID_FIELD")


    # STEP 1: what the choices make of each act
    # =========================================
    today, changes = utc_now().date(), []
    for act in acts:
        choice, was = choices.get(act.id), act.assessment
        if choice == "assess" and was not in ("assessed", "upcoming"):
            if act.document is None or act.document.current_version_id is None:
                return json_error(f"{act.short_title or act.document_title} is no longer in the corpus", 400,
                                  code="INVALID_FIELD")
            act.assessment = "upcoming" if act.applies_from and act.applies_from > today else "assessed"
            act.screened_out = False
        elif choice == "skip" and was in ("assessed", "upcoming"):
            act.assessment = "none"
        if act.assessment != was:
            changes.append({"act": act.short_title or act.document_title, "from": was, "to": act.assessment})
    chosen = [act for act in acts if act.assessment in ("assessed", "upcoming")]
    if not approved:
        return json_response({"estimate": estimate_rest(report, chosen), "budget": budget_status(request.user.id)})
    if not chosen:
        return json_error("Nothing is left to assess — take at least one act in", 400, code="NOTHING_TO_ASSESS")
    budget = budget_status(request.user.id)
    if budget["remaining"] is not None and budget["remaining"] < MIN_BUDGET_TO_START_USD:
        return json_error("Today's AI usage budget is spent — try again tomorrow", 429, code="BUDGET_EXCEEDED")


    # STEP 2: the approval, and the second part of the run
    # ====================================================
    with transaction.atomic():
        if not Report.objects.filter(id=report.id, status="scope_review").update(
                status="queued", scope_approved_by=request.user, scope_approved_at=utc_now()):
            return json_error("The report is not waiting for its scope to be approved", 409, code="NOT_WAITING")
        ReportAct.objects.bulk_update(acts, ["assessment", "screened_out"])
        job = enqueue("report.analyze", {"report_id": report.id}, subject=f"report:{report.id}",
                      created_by=request.user)
        Report.objects.filter(id=report.id).update(job=job)
    audit(request, "reports.approve_scope", "report", report.id, {"changes": changes})
    report.refresh_from_db()
    return json_response(serialize_report(report, full=True, job=job))








############################################################
# finding_item
############################################################
#
# PATCH /api/reports/{id}/findings/{fid}  {overrideStatus, reviewerNote, cause}
#
# The human verdict: overrideStatus null clears it. `cause`
# is why the gap exists, in the reviewer's words — the one
# part of a finding only a person writes. Any of them
# withdraws a sign-off; the report's finding stats are
# recounted (effective statuses). Audited.
#
# Used by:
#   - ReportDetail.jsx — the finding review dialog
#   - the assistant's overrideFinding tool
############################################################

@methods("PATCH")
@require_auth
def finding_item(request, report_id, finding_id):
    finding = Finding.objects.filter(id=finding_id, report__in=visible_reports(request), report_id=report_id).first()
    if finding is None:
        return json_error("Finding not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    if "overrideStatus" in data:
        value = data["overrideStatus"]
        if value is not None and value not in FINDING_STATUSES:
            return json_error(f"overrideStatus must be one of {', '.join(FINDING_STATUSES)} or null", 400,
                              code="INVALID_FIELD")
        finding.override_status = value
    if "reviewerNote" in data:
        if data["reviewerNote"] is not None and not isinstance(data["reviewerNote"], str):
            return json_error("reviewerNote must be a string", 400, code="INVALID_FIELD")
        finding.reviewer_note = (data["reviewerNote"] or "")[:4000]
    if "cause" in data:
        if data["cause"] is not None and not isinstance(data["cause"], str):
            return json_error("cause must be a string", 400, code="INVALID_FIELD")
        finding.cause = (data["cause"] or "").strip()[:2000]
    finding.reviewed_by = request.user
    finding.reviewed_at = utc_now()
    finding.save(update_fields=["override_status", "reviewer_note", "cause", "reviewed_by", "reviewed_at"])
    # A changed verdict needs a fresh sign-off, and the counts
    # the list, the cover page and the exports read follow it;
    # what the withdrawn sign-off confirmed in the register goes back
    if Report.objects.filter(id=report_id).exclude(approved_at=None).update(approved_by=None, approved_at=None,
                                                                            approval_note=""):
        register.withdraw(Report.objects.get(id=report_id))
    report = Report.objects.get(id=report_id)
    if report.stats:
        Report.objects.filter(id=report_id).update(stats={**report.stats, **finding_counts(report)})
    audit(request, "reports.review_finding", "finding", finding.id,
          {"override": finding.override_status, "report": report_id, **({"cause": True} if "cause" in data else {})})
    return json_response(serialize_finding(finding))








############################################################
# export_report
############################################################
#
# GET /api/reports/{id}/export?format=pdf|xlsx
#
# Only finished reports export. The filename carries the
# company and the date.
#
# Used by:
#   - ReportDetail.jsx — the export buttons (blob download)
############################################################

@methods("GET")
@require_auth
def export_report(request, report_id):
    from compliance.analysis.exports import render_xlsx
    from compliance.analysis.pdf import render_pdf

    report = visible_reports(request).filter(id=report_id).first()
    if report is None:
        return json_error("Report not found", 404, code="NOT_FOUND")
    if report.status != "done":
        return json_error("Only finished reports can be exported", 409, code="NOT_FINISHED")
    fmt = request.GET.get("format", "pdf")
    name = report.company.name.translate(str.maketrans("ąčęėįšųūžĄČĘĖĮŠŲŪŽ", "aceeisuuzACEEISUUZ"))
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", f"{name}-{report.created_at:%Y-%m-%d}").strip("-")[:80] or "report"
    if fmt == "pdf":
        body, mime, ext = render_pdf(report), "application/pdf", "pdf"
    elif fmt == "xlsx":
        body, mime = render_xlsx(report), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    else:
        return json_error("format must be pdf or xlsx", 400, code="INVALID_QUERY")
    audit(request, "reports.export", "report", report.id, {"format": fmt})
    response = HttpResponse(body, content_type=mime)
    response["Content-Disposition"] = f'attachment; filename="legalops-{stem}.{ext}"'
    response["Cache-Control"] = "no-store"
    return response








############################################################
# company_actions
############################################################
#
# GET /api/companies/{id}/actions
#
# The company's action register: what the signed-off reports'
# plans called for, the live actions first — the late ones
# before the others, by due date — then the closed. `counts`
# gives the register at a glance by state as shown.
#
# Used by:
#   - vite: Companies/CompanyActions
#   - the assistant's getActionRegister tool
############################################################

@methods("GET")
@require_auth
def company_actions(request, company_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    today = utc_now().date()
    actions = list(CompanyAction.objects.select_related("closed_by", "report").filter(company=company))
    standing = register.standing(actions)
    rows = [serialize_company_action(action, today, standing) for action in actions]
    order = {"late": 0, "open": 1, "in_progress": 1, "done": 2, "closed": 3}
    rows.sort(key=lambda row: (order[row["state"]], row["dueDate"], row["priority"]))
    return json_response({"actions": rows[:500],
                          "counts": {state: sum(row["state"] == state for row in rows)
                                     for state in ("late", "open", "in_progress", "done", "closed")}})








############################################################
# action_item
############################################################
#
# PATCH /api/actions/{id}  {status?, owner?, dueDate?, note?}
#
# A person's hand on one action: who owns it, when it is due,
# where it stands, a note. Closing one by hand needs a note
# that says why — a closure without a later report's
# confirmation is a person's decision, and the register says
# whose, and that person's closure a person may take back.
# What a report closed is not reopened by hand (409
# CLOSED_BY_REPORT): its closure rests on that report's
# findings, and falls when a reviewer changes one of them
# there. Calling an action done stamps when — only a report
# made after that can send it back to work. Audited.
#
# Used by:
#   - vite: Companies/CompanyActions
############################################################

@methods("PATCH")
@require_auth
def action_item(request, action_id):
    action = CompanyAction.objects.select_related("closed_by", "report").filter(
        id=action_id, company__in=visible_companies(request)).first()
    if action is None:
        return json_error("Action not found", 404, code="NOT_FOUND")
    data = get_json_object(request)
    if data is None:
        return json_error("JSON body required", 400, code="INVALID_BODY")
    changed = {}
    if "owner" in data:
        if not isinstance(data["owner"], str):
            return json_error("owner must be text", 400, code="INVALID_FIELD")
        action.owner = changed["owner"] = data["owner"].strip()[:300]
    if "dueDate" in data:
        try:
            action.due_date = date.fromisoformat(str(data["dueDate"]))
        except ValueError:
            return json_error("dueDate must be a date (YYYY-MM-DD)", 400, code="INVALID_FIELD")
        changed["dueDate"] = action.due_date.isoformat()
    if "note" in data:
        if data["note"] is not None and not isinstance(data["note"], str):
            return json_error("note must be text", 400, code="INVALID_FIELD")
        action.note = (data["note"] or "").strip()[:4000]
        changed["note"] = True
    if "status" in data:
        status = data["status"]
        if status not in ACTION_STATES:
            return json_error(f"status must be one of {', '.join(ACTION_STATES)}", 400, code="INVALID_FIELD")
        if status == "closed" and action.status != "closed":
            if not action.note:
                return json_error("Say in the note why the action is closed without a report's confirmation", 400,
                                  code="NOTE_REQUIRED")
            action.closed_from, action.closed_at, action.closed_by = action.status, utc_now(), request.user
            action.confirmed_report = None
        elif status != "closed" and action.status == "closed":
            if action.confirmed_report_id:
                return json_error("A signed-off report closed this action — to dispute it, review the finding "
                                  "in that report", 409, code="CLOSED_BY_REPORT")
            action.closed_from, action.closed_at, action.closed_by = "", None, None
        if status != action.status:
            changed["status"] = status
            if status == "done":
                action.done_at = utc_now()
        action.status = status
    action.updated_at, action.updated_by = utc_now(), request.user
    action.save()
    audit(request, "actions.update", "company_action", action.id, {"company": action.company_id, **changed})
    return json_response(serialize_company_action(action, utc_now().date(), register.standing([action])))








############################################################
# export_actions
############################################################
#
# GET /api/companies/{id}/actions/export
#
# The register as a workbook: one row an action, with what it
# is to close, its owner, its due date and where it stands.
# Every cell is text or a number — never a formula.
#
# Used by:
#   - vite: Companies/CompanyActions — the export button
############################################################

@methods("GET")
@require_auth
def export_actions(request, company_id):
    from compliance.analysis.exports import render_actions_xlsx

    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    language = request.GET.get("language") if request.GET.get("language") in ("lt", "en") else "lt"
    name = company.name.translate(str.maketrans("ąčęėįšųūžĄČĘĖĮŠŲŪŽ", "aceeisuuzACEEISUUZ"))
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", f"actions-{name}-{utc_now():%Y-%m-%d}").strip("-")[:80] or "actions"
    audit(request, "actions.export", "company", company.id)
    response = HttpResponse(render_actions_xlsx(company, language),
                            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response["Content-Disposition"] = f'attachment; filename="{stem}.xlsx"'
    response["Cache-Control"] = "no-store"
    return response








############################################################
# company_law_changes
############################################################
#
# GET /api/companies/{id}/law-changes
#
# What the law did after the company's latest finished
# report: the acts that report assessed and that have a newer
# version, the provisions that changed, and the findings that
# rest on them (analysis/register.py — law_changes).
#
# Used by:
#   - vite: Companies/CompanyActions — the changes in the law
#   - the assistant's getActionRegister tool
############################################################

@methods("GET")
@require_auth
def company_law_changes(request, company_id):
    company = visible_companies(request).filter(id=company_id).first()
    if company is None:
        return json_error("Company not found", 404, code="NOT_FOUND")
    return json_response(register.law_changes(company))

