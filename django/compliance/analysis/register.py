############################################################
#  [*] analysis.register — a company's actions across reports
#
#    sign_off(report, user) → what the sign-off did to the register
#    withdraw(report) → how many actions a withdrawn sign-off changed
#    standing(actions) → the obligations of their findings that still exist
#    state_of(action, today) → its state as shown (late is derived)
#    history(report) → earlier statuses of its findings' obligations
#    changes(report) → what closed, is new or went back since the
#                      company's previous report
#    law_changes(company) → the provisions that changed in the acts
#                      of its latest report, and the findings on them
#
#  A report's plan dies with the report: the next analysis
#  writes a new one, and nobody can say what became of the
#  old. The register keeps the plan. It moves on one event
#  only — a person signing a finished report off, or taking
#  that signature back:
#
#  - the actions the company already has are held against its
#    signed-off reports (_settle): a finding under an action
#    is confirmed when the reports made since the action's own
#    find its obligation met, and an action whose findings are
#    all confirmed is closed by the report that completed
#    them. An obligation a report did not assess confirms
#    nothing; one a report made after the owner called the
#    action done still finds open sends it back to work — a
#    closure is a re-test, not a statement;
#  - the report's own plan comes in: each action with the open
#    findings it is to close, an owner and a due date counted
#    from the sign-off. An obligation already under an action
#    that is not closed gets no second one. An action that
#    closes no finding (correcting references, finding out a
#    fact) comes in too, and only a person closes it; the next
#    report's action of the same kind is not added while it is
#    live.
#
#  The reports speak in the order they were made, not the
#  order they were signed: an old report signed late does not
#  overrule a newer one. A closed action stays closed — when
#  a later report finds its obligation open again, that
#  report's plan brings a new action. What a report closed
#  falls only with the evidence under it: a sign-off
#  withdrawn, by hand or by a reviewer changing a finding.
#
#  An obligation is known by its id. That id survives a
#  re-reading of its act only once a person has approved the
#  obligation (corpus/obligations.py): a finding whose
#  obligation was replaced since confirms nothing, and its
#  action stays for a person to close with a reason.
############################################################


from datetime import timedelta
import uuid

from django.db import transaction

from compliance.analysis.models import Action, CompanyAction, Finding, Report, ReportAct
from compliance.common.timestamps import utc_now
from compliance.corpus.models import LegalDocumentVersion, Obligation


# Days from the sign-off to an action's due date, by the plan's timeframe
DUE_DAYS = {"immediate": 14, "30_days": 30, "90_days": 90, "12_months": 365}
OPEN = ("missing", "partial", "unknown")
SETTLED = ("met", "not_applicable")
LIVE = ("open", "in_progress", "done")
# How many earlier assessments a finding's history goes back
HISTORY = 4








############################################################
# _effective
############################################################
#
# A finding's status as a reader sees it: the reviewer's
# override when there is one.
#
# Used by:
#   - sign_off, history, changes (below)
############################################################

def _effective(finding):
    return finding.override_status or finding.status








############################################################
# _later
############################################################
#
# What the company's signed-off reports made after this one
# found, obligation by obligation — the newest verdict each.
#
# Used by:
#   - sign_off (below)
############################################################

def _later(report):
    rows = Finding.objects.filter(report__company_id=report.company_id, report__status="done",
                                  report__approved_at__isnull=False, report__created_at__gt=report.created_at) \
        .exclude(obligation_id=None).order_by("report__created_at") \
        .values_list("obligation_id", "status", "override_status")
    return {obligation_id: override or status for obligation_id, status, override in rows}








############################################################
# _settle
############################################################
#
# Brings the confirmations under the company's actions in
# line with its signed-off reports, whatever order those
# were signed in. For a finding under an action the reports
# that count are the action's own and those made after it;
# for an action a report closed, only those up to the closing
# report — what came later does not reopen it. The finding is
# confirmed when the newest of them finds its obligation met,
# by the report that first found it so without a later one
# finding it open. Then:
#
# - a live action whose findings are all confirmed is closed
#   by the newest of the reports that confirmed them;
# - an action a report had closed, with a confirmation gone,
#   goes back to the state it was closed from;
# - an action called done goes back to work when a report
#   made after that still finds one of its obligations open.
#
# Actions a person closed, and those that close no finding,
# are left alone. Answers what changed: (findings newly
# confirmed, actions closed, actions sent back to work,
# actions touched at all).
#
# Used by:
#   - sign_off, withdraw (below)
############################################################

def _settle(company_id, now):
    actions = [action for action in CompanyAction.objects.select_related("report", "confirmed_report")
               .filter(company_id=company_id).exclude(items=[])
               if action.status in LIVE or action.confirmed_report_id]
    wanted = {item.get("obligationId") for action in actions for item in action.items} - {None}
    said = {}
    if wanted:
        rows = Finding.objects.filter(report__company_id=company_id, report__status="done",
                                      report__approved_at__isnull=False, obligation_id__in=wanted) \
            .order_by("report__created_at") \
            .values_list("obligation_id", "report_id", "report__created_at", "status", "override_status")
        for obligation_id, report_id, made, status, override in rows:
            said.setdefault(obligation_id, []).append((made, report_id, override or status))

    # For each finding of the action: the report that first found its obligation met with no later one
    # finding it open, among the reports made from `since` to `until` — and whether the newest of them,
    # made after the action was called done, still finds one open
    def read(action, since, until):
        firsts, still_open = [], False
        for item in action.items:
            verdicts = [verdict for verdict in said.get(item.get("obligationId"), ())
                        if verdict[0] >= since and (until is None or verdict[0] <= until)]
            first = None
            for made, report_id, status in verdicts:
                first = (first or (made, report_id)) if status in SETTLED else None
            firsts.append(first)
            if verdicts and verdicts[-1][2] in OPEN and verdicts[-1][0] > (action.done_at or since):
                still_open = True
        return firsts, still_open

    confirmed = closed = reopened = touched = 0
    for action in actions:
        was_closed = action.status == "closed"
        since = action.report.created_at if action.report_id else action.created_at
        before = ([(item.get("confirmed") or {}).get("reportId") for item in action.items], action.status,
                  action.confirmed_report_id)
        closer = action.confirmed_report if was_closed and action.confirmed_report.approved_at else None
        firsts, still_open = read(action, since, closer.created_at if closer else None)
        if was_closed and not all(firsts):
            # The closure does not stand: the action is live again, and every signed-off report counts
            action.status, action.closed_from = action.closed_from or "open", ""
            action.closed_at, action.confirmed_report = None, None
            firsts, still_open = read(action, since, None)
        for item, first in zip(action.items, firsts):
            mark = item.get("confirmed") or {}
            if first is None:
                item["confirmed"] = None
            elif mark.get("reportId") != first[1]:
                item["confirmed"] = {"reportId": first[1], "at": now.isoformat()}
                confirmed += not mark
        if all(firsts):
            if action.status != "closed":
                action.closed_from, action.status, action.closed_at, action.closed_by = action.status, "closed", now, None
                closed += 1
            action.confirmed_report_id = max(firsts)[1]
        elif action.status == "done" and still_open:
            action.status, reopened = "in_progress", reopened + 1
        after = ([(item.get("confirmed") or {}).get("reportId") for item in action.items], action.status,
                 action.confirmed_report_id)
        if after != before:
            action.updated_at = now
            action.save(update_fields=["items", "status", "closed_from", "closed_at", "closed_by", "confirmed_report",
                                       "updated_at"])
            touched += 1
    return confirmed, closed, reopened, touched








############################################################
# sign_off
############################################################
#
# What a person's sign-off of a finished report does to the
# company's register: first the actions there are get held
# against the signed-off reports, this one now among them,
# then its own plan comes in — without the findings a newer
# signed-off report already finds met. Bringing the plan in a
# second time — a sign-off withdrawn and given again — adds
# nothing. Answers {added, covered, confirmed, closed,
# reopened}.
#
# Used by:
#   - analysis/api/views.py — _approve
############################################################

def sign_off(report, user):
    now = utc_now()
    with transaction.atomic():
        # STEP 1: the actions there are, against what the signed-off reports found
        # ========================================================================
        confirmed, closed, reopened, _ = _settle(report.company_id, now)


        # STEP 2: the report's plan, without what is already under way
        # ============================================================
        later = _later(report)
        findings = {finding.id: finding for finding in Finding.objects.filter(report=report)}
        under_way = {item.get("obligationId") for action in CompanyAction.objects.filter(
            company_id=report.company_id, status__in=LIVE) for item in action.items if item.get("obligationId")}
        taken = set(CompanyAction.objects.filter(company_id=report.company_id, report=report)
                    .values_list("plan_action_id", flat=True))
        # An action that closes no finding — correcting the documents' references, finding out a fact the
        # profile lacks — has no obligation to be known by: while an earlier report's action of its kind
        # is still live, the next report's is the same work asked again, and is not brought in
        standing_kinds = {action.category for action in CompanyAction.objects.filter(
            company_id=report.company_id, status__in=LIVE).exclude(report=report) if not action.items}
        added = covered = 0
        for action in Action.objects.filter(report=report).order_by("order"):
            if action.id in taken:
                continue
            if not action.finding_ids and action.category in standing_kinds:
                covered += 1
                continue
            items = []
            for finding_id in action.finding_ids:
                finding = findings.get(finding_id)
                if finding is None or _effective(finding) not in OPEN:
                    continue
                if later.get(finding.obligation_id) in SETTLED:
                    # A newer signed-off report already finds it met: nothing is left to do
                    continue
                if finding.obligation_id and finding.obligation_id in under_way:
                    covered += 1
                    continue
                cited = (finding.citations or [{}])[0]
                items.append({
                    "obligationId": finding.obligation_id, "findingId": finding.id, "title": finding.obligation_title,
                    "act": cited.get("documentTitle") or finding.short_title or finding.document_title,
                    "path": cited.get("path", ""), "sourceKind": finding.source_kind, "status": _effective(finding),
                    "confirmed": None})
                if finding.obligation_id:
                    under_way.add(finding.obligation_id)
            if not items and action.finding_ids:
                continue
            CompanyAction.objects.create(
                id=str(uuid.uuid4()), company_id=report.company_id, report=report, plan_action_id=action.id,
                title=action.title, description=action.description, category=action.category, priority=action.priority,
                effort=action.effort, owner=action.owner_role,
                due_date=(now + timedelta(days=DUE_DAYS.get(action.timeframe, 90))).date(),
                status="open", items=items, created_at=now, updated_at=now, updated_by=user)
            added += 1
    return {"added": added, "covered": covered, "confirmed": confirmed, "closed": closed, "reopened": reopened}








############################################################
# withdraw
############################################################
#
# What a report's sign-off confirmed goes back when that
# sign-off is withdrawn — the caller has cleared it, or is
# about to delete the report: the register is held against
# the reports that are still signed off. A finding another
# signed-off report also finds met stays confirmed; a closure
# that rested on this report alone falls. The actions the
# report brought in stay — they are the company's now.
# Answers how many actions changed.
#
# Used by:
#   - analysis/api/views.py — _approve, finding_item,
#     report_item (a signed-off report deleted)
############################################################

def withdraw(report):
    with transaction.atomic():
        return _settle(report.company_id, utc_now())[3]








############################################################
# standing
############################################################
#
# The obligations among the actions' findings that still
# exist. An obligation nobody approved is replaced when its
# act — or, for a requirement of the company's own, its
# policy — is read again: no later report carries its id,
# and the finding under the action can no longer be
# confirmed by one.
#
# Used by:
#   - analysis/api/views.py — company_actions, action_item
############################################################

def standing(actions):
    ids = {item.get("obligationId") for action in actions for item in action.items if item.get("obligationId")}
    return set(Obligation.objects.filter(id__in=ids).values_list("id", flat=True)) if ids else set()








############################################################
# state_of
############################################################
#
# An action's state as the register shows it: its own, or
# "late" when it is not closed and its due date has passed.
#
# Used by:
#   - analysis/serializers.py — serialize_company_action
############################################################

def state_of(action, today):
    return "late" if action.status in ("open", "in_progress") and action.due_date < today else action.status








############################################################
# history
############################################################
#
# How the obligations of a report's findings stood before:
# obligation id → the last few times one of the company's
# earlier finished reports assessed it, the newest first
# ([{reportId, date, status}], HISTORY entries at most). A
# report that did not assess the obligation leaves no entry,
# so a narrow report in between hides nothing. Only
# obligations that were assessed before have an entry.
#
# Used by:
#   - analysis/serializers.py — serialize_report (full)
############################################################

def history(report):
    dates = dict(Report.objects.filter(company_id=report.company_id, status="done", created_at__lt=report.created_at)
                 .values_list("id", "created_at"))
    if not dates:
        return {}
    mine = set(Finding.objects.filter(report=report).exclude(obligation_id=None).values_list("obligation_id", flat=True))
    rows = Finding.objects.filter(report_id__in=dates, obligation_id__in=mine).order_by("-report__created_at") \
        .values_list("obligation_id", "report_id", "status", "override_status")
    past = {}
    for obligation_id, report_id, status, override in rows:
        entries = past.setdefault(obligation_id, [])
        if len(entries) < HISTORY:
            entries.append({"reportId": report_id, "date": dates[report_id].date().isoformat(), "status": override or status})
    return past








############################################################
# changes
############################################################
#
# What moved since the company's earlier finished reports,
# obligation by obligation. Each obligation is held against
# the last earlier report that assessed it — not only the
# report just before this one, which may have looked at a
# few documents or acts and would make everything else look
# new: gaps that are met now (closed), obligations that were
# met and are a gap again (back), and gaps on obligations no
# earlier report assessed or had not found open (new) — each
# as a count with a few titles. `since` names the report
# before this one. None when the company has no earlier
# report.
#
# Used by:
#   - analysis/pipeline.py — report_stats, step_summary
############################################################

def changes(report, findings=None):
    earlier = list(Report.objects.filter(company_id=report.company_id, status="done", created_at__lt=report.created_at)
                   .order_by("-created_at").values_list("id", "created_at"))
    if not earlier:
        return None
    gap = ("missing", "partial")
    rows = [finding for finding in (findings if findings is not None else Finding.objects.filter(report=report))
            if finding.obligation_id and finding.source_kind != "internal"]
    before = {}
    past = Finding.objects.filter(report_id__in=[report_id for report_id, _ in earlier],
                                  obligation_id__in={finding.obligation_id for finding in rows}) \
        .order_by("report__created_at").values_list("obligation_id", "status", "override_status")
    for obligation_id, status, override in past:
        before[obligation_id] = override or status
    moved = {"closed": [], "new": [], "back": []}
    for finding in rows:
        now, was = _effective(finding), before.get(finding.obligation_id)
        if was in gap and now in SETTLED:
            moved["closed"].append(finding.obligation_title)
        elif was in SETTLED and now in gap:
            moved["back"].append(finding.obligation_title)
        elif now in gap and was not in gap:
            moved["new"].append(finding.obligation_title)
    return {"since": earlier[0][0], "sinceDate": earlier[0][1].date().isoformat(),
            **{kind: {"count": len(titles), "titles": titles[:5]} for kind, titles in moved.items()}}








############################################################
# law_changes
############################################################
#
# What the law did after the company's latest finished
# report: for every act that report assessed and that has a
# newer version now, the provisions the versions since
# changed, added or removed (corpus/ingest.py records them at
# activation), and the report's findings that rest on a
# changed provision — the ones to look at again. `recorded`
# is false when a version in between was ingested before
# changes were recorded: the act changed, and nobody can say
# where. Answers {reportId, reportDate, acts} — None of them
# when the company has no finished report.
#
# Used by:
#   - analysis/api/views.py — company_law_changes
############################################################

def law_changes(company):
    report = Report.objects.filter(company=company, status="done").order_by("-created_at").first()
    if report is None:
        return {"reportId": None, "reportDate": None, "acts": []}
    rows = []
    acts = ReportAct.objects.select_related("document__current_version", "version").filter(
        report=report, assessment__in=("assessed", "upcoming")).exclude(document=None).exclude(version=None)
    for act in acts:
        current = act.document.current_version
        if current is None or current.id == act.version_id:
            continue
        since = list(LegalDocumentVersion.objects.filter(document=act.document, status="ready",
                                                         version_no__gt=act.version.version_no).order_by("version_no"))
        parts = {"changed": [], "added": [], "removed": []}
        for version in since:
            for kind in parts:
                parts[kind] += [path for path in (version.changes or {}).get(kind, []) if path not in parts[kind]]
        touched = parts["changed"] + parts["removed"]
        # "68 str. 4 d." and "Art. 68(1)" rest on "68 str." and "Art. 68": the article's path, then no further digit
        rests_on = lambda cited, article: cited == article or (cited.startswith(article) and not cited[len(article)].isdigit())
        findings = [
            {"id": finding.id, "title": finding.obligation_title, "status": _effective(finding),
             "path": next(c.get("path", "") for c in finding.citations
                          if any(rests_on(str(c.get("path", "")), article) for article in touched))}
            for finding in Finding.objects.filter(report=report, act=act).order_by("order")
            if any(rests_on(str(c.get("path", "")), article) for c in finding.citations for article in touched)]
        rows.append({
            "actId": act.id, "documentId": act.document_id, "act": act.short_title or act.document_title,
            "assessedVersion": act.version.version_no, "currentVersion": current.version_no,
            "currentDate": (current.effective_date or current.created_at.date()).isoformat(),
            "recorded": all(version.changes is not None for version in since), **parts, "findings": findings})
    return {"reportId": report.id, "reportDate": report.created_at.date().isoformat(), "acts": rows}

