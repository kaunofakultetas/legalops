// -----------------------------------------------------------
//  [*] ReportDetail — one gap-analysis report
//
//  GET /api/reports/{id} (report + acts + findings +
//  actions), polled every 3 s while the analysis is queued
//  or running. The page has four faces:
//
//    - active    → the progress card (steps, live progress,
//                  elapsed time) with "stop" (POST …/cancel,
//                  confirmed)
//    - waiting   → a report started with the review, stopped
//                  once the acts that apply are decided
//                  (scope_review): a banner saying what is
//                  asked, and the tabs with the acts tab
//                  first in line — there it is the approval
//                  screen (ReportScope: a switch per act,
//                  the price of the rest, approve / cancel).
//                  Nothing runs, so nothing is polled; the
//                  citation audit and the frozen profile are
//                  there to read, and the tabs of what the
//                  second part will produce (summary,
//                  findings, plan) say it is not there yet.
//                  Approved, the report is queued again and
//                  the page shows it running; cancelled (the
//                  same POST …/cancel, confirmed in words of
//                  its own), it is the cancelled face
//    - failed /
//      cancelled → what happened and "run again"
//    - done      → the sign-off (approve / withdraw), a
//                  warning when an act got a newer version
//                  since the run (outdatedActs → run again),
//                  and tabs: summary, legal acts, findings
//                  (with the reviewer override dialog, and the
//                  document drawer an evidence link opens — at
//                  the cited passage), citations (the audit of
//                  the documents' legal references; a document
//                  opens in the same drawer), action plan,
//                  analysis data (the frozen profile)
//
//  Exports are authenticated blob downloads
//  (GET …/export?format=pdf|xlsx, the file named by the
//  server's Content-Disposition). The report's language is
//  in the subtitle. The tab lives in ?tab= — without one the
//  summary shows, or the acts while the report waits. A tab
//  opened from outside the tab list (the plan's "related
//  findings", the summary's link to the citation audit, the
//  waiting banner's way to the acts) takes the keyboard focus
//  onto the newly selected tab, since the control that held
//  it went away with the switch. An answer that is not a
//  report object counts as a failed load.
//
//  The view comes back as it was left: a tab switch keeps
//  the other parameters (the findings' and the citations'
//  filters live there, under findings.* and citations.*),
//  the plan's focus on one action's findings is
//  ?findings.action=<its id>, and the tabs keep their open
//  groups and "Show more" pages in sessionStorage. The back
//  link and the delete return to the list the way Back would
//  (useReturnTo).
//
//  Split into (root component last):
//
//    TABS           — the done-report tabs, in order
//    LATER_TABS     — the tabs empty until the approval
//    FOCUS_PARAM    — the plan focus's parameter
//    actionId       — an action's id for the address
//    ExportButtons  — PDF / Excel downloads
//    MoreMenu       — run again / delete
//    EndedNotice    — the failed / cancelled card
//    OutdatedNotice — acts updated since the run
//    ProfilePanel   — the frozen profile and the scope
//    ReportDetail   — the page (default export)
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableViewOutlinedIcon from '@mui/icons-material/TableViewOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import { downloadFile } from '@/utils/download';
import useEnumLabel from '@/hooks/useEnumLabel';
import useReturnTo from '@/hooks/useReturnTo';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import ErrorState from '@/components/ErrorState/ErrorState';
import JsonView from '@/components/JsonView/JsonView';
import SectionCard from '@/components/SectionCard/SectionCard';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import EmptyState from '@/components/EmptyState/EmptyState';
import DocumentDrawer from '@/pages/Companies/DocumentDrawer';
import FindingReviewDialog from '@/pages/Reports/FindingReviewDialog';
import ReportActionPlan from '@/pages/Reports/ReportActionPlan';
import ReportActs from '@/pages/Reports/ReportActs';
import ReportApproval, { ApproveButton } from '@/pages/Reports/ReportApproval';
import ReportCitations from '@/pages/Reports/ReportCitations';
import ReportFindings from '@/pages/Reports/ReportFindings';
import ReportOverview from '@/pages/Reports/ReportOverview';
import ReportProgress from '@/pages/Reports/ReportProgress';
import ReportScope, { ScopeNotice } from '@/pages/Reports/ReportScope';
import StartAnalysisDialog from '@/pages/Reports/StartAnalysisDialog';
import { citationAudit, isActive, isWaiting, reportTitle } from '@/pages/Reports/reportUtils';


// The tabs of a finished report (also the ?tab= values)
const TABS = ['summary', 'acts', 'findings', 'citations', 'plan', 'profile'];

// The tabs of what the second part of a run produces — on a
// report still waiting for its acts to be approved they have
// nothing to show yet
const LATER_TABS = ['summary', 'findings', 'plan'];

// The parameter naming the action whose findings the
// findings tab is focused on
const FOCUS_PARAM = 'findings.action';







// -----------------------------------------------------------
// actionId
// -----------------------------------------------------------
//
// An action's id as the address can carry it — a non-empty
// string or a finite number, as text — else null (such an
// action is still listed, rowKeys, but cannot be named).
//
// Used by:
//   - ReportDetail (below) — the plan's focus
// -----------------------------------------------------------

function actionId(action) {
  const id = action?.id;
  return (typeof id === 'string' && id !== '') || Number.isFinite(id) ? String(id) : null;
}







// -----------------------------------------------------------
// ExportButtons
// -----------------------------------------------------------
//
// One button per format; the busy one spins, a failure
// toasts the translated reason (NOT_FINISHED, a 5xx…).
//
// Used by:
//   - ReportDetail (below)
// -----------------------------------------------------------

function ExportButtons({ reportId }) {

  const t = useTranslations('PAGES.report');
  const describe = useErrorMessage();
  const [busy, setBusy] = useState(null);


  const download = async (format) => {
    setBusy(format);
    try {
      const name = await downloadFile(`/api/reports/${reportId}/export?format=${format}`, `report.${format}`);
      toast.success(t('exported', { name }));
    } catch (error) {
      toast.error(t('exportFailed', { error: describe(error) }));
    } finally {
      setBusy(null);
    }
  };


  return (
    <>
      <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} loading={busy === 'pdf'} disabled={Boolean(busy)}
              onClick={() => download('pdf')} aria-label={t('exportLabelPdf')}>{t('exportPdf')}</Button>
      <Button variant="outlined" startIcon={<TableViewOutlinedIcon />} loading={busy === 'xlsx'} disabled={Boolean(busy)}
              onClick={() => download('xlsx')} aria-label={t('exportLabelXlsx')}>{t('exportXlsx')}</Button>
    </>
  );
}







// -----------------------------------------------------------
// MoreMenu
// -----------------------------------------------------------
//
// "Run again" (a new analysis of the same company) and
// "delete" (not while the analysis runs).
//
// Used by:
//   - ReportDetail (below)
// -----------------------------------------------------------

function MoreMenu({ canDelete, onRerun, onDelete }) {

  const t = useTranslations('PAGES.report');
  const [anchor, setAnchor] = useState(null);


  return (
    <>
      <IconButton aria-label={t('more')} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setAnchor(null); onRerun(); }}>
          <ListItemIcon><ReplayOutlinedIcon fontSize="small" /></ListItemIcon>{t('rerun')}
        </MenuItem>
        <MenuItem disabled={!canDelete} onClick={() => { setAnchor(null); onDelete(); }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>{t('delete')}
        </MenuItem>
      </Menu>
    </>
  );
}







// -----------------------------------------------------------
// EndedNotice
// -----------------------------------------------------------
//
// A failed or cancelled report: what happened (the AI
// provider's exhausted budget named as such), the backend's
// error collapsed under "technical details", and run again.
// A failure is announced (role="alert"); a cancelled run is
// a state the user chose, so it is a status.
//
// Used by:
//   - ReportDetail (below)
// -----------------------------------------------------------

function EndedNotice({ report, onRerun }) {
  const t = useTranslations('PAGES.report');
  const tErrors = useTranslations('COMPONENTS.errors');
  const failed = report.status === 'failed';
  // The AI provider's own budget ran out (AI_BUDGET_EXHAUSTED;
  // runs from before that code carry the gateway's 402) — say
  // that plainly instead of the generic "failed"
  const budget = failed && /AI_BUDGET_EXHAUSTED|\[402\]|budget exceeded/i.test(String(report.error || ''));
  return (
    <Alert severity={failed ? 'error' : 'warning'} role={failed ? 'alert' : 'status'}>
      <AlertTitle>{failed ? t('FAILED.title') : t('CANCELLED.title')}</AlertTitle>
      {budget ? tErrors('CODES.AI_BUDGET_EXHAUSTED') : failed ? t('FAILED.text') : t('CANCELLED.text')}
      <div className="mt-2"><Button color="inherit" size="small" variant="outlined" onClick={onRerun}>{t('rerun')}</Button></div>
      {failed && report.error && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer">{t('FAILED.details')}</summary>
          <pre className="whitespace-pre-wrap m-0 mt-1">{report.error}</pre>
        </details>
      )}
    </Alert>
  );
}







// -----------------------------------------------------------
// OutdatedNotice
// -----------------------------------------------------------
//
// report.outdatedActs — the acts that got a newer version
// after the report read them — with "run again"; a note on
// the report's state (role="status"), not an alarm.
//
// Used by:
//   - ReportDetail (below)
// -----------------------------------------------------------

function OutdatedNotice({ acts, onRerun }) {
  const t = useTranslations('PAGES.report');
  if (!acts?.length) return null;
  return (
    <Alert severity="warning" role="status" className="mb-4">
      <AlertTitle>{t('OUTDATED.title')}</AlertTitle>
      {t('OUTDATED.text', { acts: acts.join(', ') })}
      <div className="mt-2"><Button color="inherit" size="small" variant="outlined" onClick={onRerun}>{t('rerun')}</Button></div>
    </Alert>
  );
}







// -----------------------------------------------------------
// ProfilePanel
// -----------------------------------------------------------
//
// The company profile as frozen when the analysis ran, with
// the profile's own field labels, and the analysis scope —
// the scoped acts by the names the report's acts carry (the
// scope itself stores corpus document ids), and, for a
// report started with that option, a line saying the
// company's own requirements were assessed too.
//
// Used by:
//   - ReportDetail (below)
// -----------------------------------------------------------

function ProfilePanel({ report }) {

  const t = useTranslations('PAGES.report.PROFILE');
  const tFields = useTranslations('PAGES.company.PROFILE.FIELDS');
  const tTabs = useTranslations('PAGES.company.TABS');
  const label = useEnumLabel();
  const snapshot = report.profileSnapshot || {};


  // The snapshot is the whole serialized company; show the
  // profile fields with their labels and machine values as
  // words (tri-state flags: yes / no / unknown)
  const flags = ['usesAi', 'providesAi', 'processesPersonalData', 'isPublicSector'];
  const keys = ['name', 'registrationCode', 'country', 'legalForm', 'sector', 'institutionType', 'sizeCategory', 'employees',
    'annualTurnoverEur', 'naceCodes', 'activities', ...flags, 'aiDescription', 'financialMarket', 'attributes'];
  const shown = Object.fromEntries(keys.filter((key) => key in snapshot).map((key) => {
    if (flags.includes(key)) return [key, label('boolean', String(snapshot[key]))];
    if (key === 'institutionType') return [key, label('institutionType', snapshot[key])];
    if (key === 'sizeCategory') return [key, label('sizeCategory', snapshot[key])];
    return [key, snapshot[key]];
  }));
  if (snapshot.credentials) {
    shown.credentials = snapshot.credentials.map((c) => `${label('credentialKind', c.kind)}: ${c.name}${c.status ? ` (${label('credentialStatus', c.status)})` : ''}`);
  }
  if (snapshot.documents) shown.documents = snapshot.documents.map((d) => d.title);
  const labels = { ...Object.fromEntries(keys.map((key) => [key, tFields(key)])), credentials: tTabs('credentials'), documents: tTabs('documents') };
  const actNames = Object.fromEntries((Array.isArray(report.acts) ? report.acts : []).map((a) => [a?.documentId, a?.shortTitle || a?.documentTitle]));
  const scoped = Array.isArray(report.scope?.documentIds) ? report.scope.documentIds : [];
  const scope = scoped.length ? scoped.map((id) => actNames[id] || id).join(', ') : t('allActs');


  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('title')} subtitle={t('hint')}>
        <JsonView value={shown} labels={labels} />
      </SectionCard>
      <SectionCard title={t('scope')}>
        <Typography variant="body2">{scope}</Typography>
        {report.scope?.internal === true && <Typography variant="body2">{t('ownRequirements')}</Typography>}
      </SectionCard>
    </div>
  );
}







// -----------------------------------------------------------
// ReportDetail (default export)
// -----------------------------------------------------------
//
// Owns the report query (polling while active — a waiting
// report is not), the tab, the findings focus handed over
// from the plan (in the address; an action without an id is
// held here), and the dialogs (stop, cancel a waiting
// report, delete, review, run again, document). The
// review and document handlers are stable callbacks: the
// findings and citations tabs memoise their cards on them.
//
// Used by:
//   - router.jsx — route /reports/:reportId
// -----------------------------------------------------------

export default function ReportDetail({ authData }) {

  const t = useTranslations('PAGES.report');
  const tReports = useTranslations('PAGES.reports');
  const label = useEnumLabel();
  const fmt = useFormat();
  const describe = useErrorMessage();
  const returnTo = useReturnTo();
  const queryClient = useQueryClient();
  const { reportId } = useParams();
  const [params, setView] = useViewParams();
  const [heldFocus, setHeldFocus] = useState(null);
  const [dialog, setDialog] = useState(null);
  // {finding, open} — kept through the close animation
  const [review, setReview] = useState(null);
  // {id, passage} — the document a finding's evidence (or the
  // criterion of an own requirement) opened, with the cited
  // passage ({charStart, quote, criterion?}) when it has one
  const [opened, setOpened] = useState(null);
  const openReview = useCallback((finding) => setReview({ finding, open: true }), []);
  const openDocument = useCallback((id, passage = null) => setOpened({ id, passage }), []);


  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      const { data } = await api.get(`/api/reports/${reportId}`);
      // An answer that is no report at all (null, empty, a list)
      // is a failed load — the page would otherwise read fields
      // off nothing
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The report answer is not a report');
      return data;
    },
    refetchInterval: (query) => (isActive(query.state.data) ? 3000 : false),
  });


  // The tab of the address; without one the summary — or the
  // acts while the report waits for their list to be
  // approved, since that is what the page then asks for
  const waiting = isWaiting(report);
  const defaultTab = waiting ? 'acts' : 'summary';
  const tab = oneOf(params.get('tab'), TABS, defaultTab);


  // The plan's focus: the action the address names (one the
  // report does not hold is ignored), else the one held here
  const focusParam = params.get(FOCUS_PARAM);
  const planActions = report?.actions;
  const focus = useMemo(() => {
    const action = focusParam && Array.isArray(planActions) ? planActions.find((item) => actionId(item) === focusParam) : null;
    if (!action) return heldFocus;
    return { ids: Array.isArray(action.findingIds) ? action.findingIds : [], title: action.title };
  }, [focusParam, planActions, heldFocus]);


  // A tab opened from inside a panel unmounted the control
  // that had the keyboard focus (it falls to <body>) — the
  // focus goes on to the tab now selected. A tab picked in
  // the tab list keeps its own focus. A default tab that
  // changed with the report's status (the report loaded, or
  // stopped waiting) is no switch of the user's and moves no
  // focus.
  const focusedTab = useRef({ tab, defaultTab });
  useEffect(() => {
    const last = focusedTab.current;
    focusedTab.current = { tab, defaultTab };
    if (last.tab === tab || last.defaultTab !== defaultTab) return;
    if (!document.activeElement || document.activeElement === document.body) document.getElementById(`report-tab-${tab}`)?.focus();
  }, [tab, defaultTab]);


  // A finished run changes the lists too (status, counts)
  const previous = useRef(report?.status);
  useEffect(() => {
    if (previous.current && previous.current !== report?.status) queryClient.invalidateQueries({ queryKey: ['reports'] });
    previous.current = report?.status;
  }, [report?.status, queryClient]);


  const cancel = useMutation({
    mutationFn: async () => (await api.post(`/api/reports/${reportId}/cancel`, null, { silent: true })).data,
    onSuccess: (updated) => {
      toast.success(t('cancelled'));
      queryClient.setQueryData(['report', reportId], (current) => ({ ...current, ...updated }));
      // The job carries the cancel flag the progress card shows —
      // re-read it now rather than at its next 3 s poll
      queryClient.invalidateQueries({ queryKey: ['jobs', updated?.jobId ?? report?.jobId] });
      setDialog(null);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/reports/${reportId}`, { silent: true }),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      returnTo('/reports', { replace: true });
    },
  });


  const back = { to: '/reports', label: t('back') };
  if (isLoading || error) {
    return (
      <PageLayout authData={authData} title={isLoading ? <Skeleton width={300} /> : t('TITLE')} back={back}>
        {error ? <ErrorState error={error} onRetry={refetch} title={t('loadError')} /> : <Skeleton variant="rounded" height={320} />}
      </PageLayout>
    );
  }


  const active = isActive(report);
  // A tab of the second part, on a report that has not had it
  const notYet = waiting && LATER_TABS.includes(tab);
  const showTab = (next) => setView({ tab: next });
  // The plan's "related findings": the findings tab, focused
  // on the action — named in the address when it has an id
  const showFindings = (action) => {
    const id = actionId(action);
    setHeldFocus(id ? null : { ids: action.findingIds ?? [], title: action.title });
    setView({ tab: 'findings', [FOCUS_PARAM]: id });
  };
  const clearFocus = () => {
    setHeldFocus(null);
    setView({ [FOCUS_PARAM]: null });
  };
  // A tab's label with its row count: the findings always
  // (none exist while the report waits — a zero would read as
  // a result), the citations once the audit ran for this
  // report
  const tabLabel = (key) => {
    if (key === 'findings' && !waiting) return `${t('TABS.findings')} (${report.findings?.length ?? 0})`;
    if (key === 'citations' && citationAudit(report)) return `${t('TABS.citations')} (${citationAudit(report).checked})`;
    return t(`TABS.${key}`);
  };
  const facts = [
    t('language', { language: label('language', report.language) }),
    t('created', { date: fmt.dateTime(report.createdAt) }),
    report.finishedAt ? t('finished', { date: fmt.dateTime(report.finishedAt) }) : null,
  ].filter(Boolean).join(' · ');
  const subtitle = (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 flex-wrap">
        <StatusChip value={report.status} label={label('reportStatus', report.status)} />
        {report.approvedAt && <StatusChip value="done" label={t('APPROVAL.chip')} />}
        <Link to={`/companies/${report.companyId}`} className="text-primary">{report.companyName}</Link>
      </span>
      <span>{facts}</span>
    </span>
  );
  const stopButton = (
    <Button color="delete" variant="outlined" startIcon={<StopCircleOutlinedIcon />} onClick={() => { cancel.reset(); setDialog('cancel'); }}>{t('cancel')}</Button>
  );
  const actions = (
    <>
      {report.status === 'done' && !report.approvedAt && <ApproveButton report={report} />}
      {report.status === 'done' && <ExportButtons reportId={report.id} />}
      <MoreMenu canDelete={!active} onRerun={() => setDialog('rerun')} onDelete={() => { remove.reset(); setDialog('delete'); }} />
    </>
  );


  return (
    <PageLayout authData={authData} title={reportTitle(report, tReports('untitled'), fmt.date)} subtitle={subtitle} back={back} actions={actions}>
      {active && <ReportProgress report={report} action={stopButton} />}
      {['failed', 'cancelled'].includes(report.status) && <EndedNotice report={report} onRerun={() => setDialog('rerun')} />}
      {waiting && <ScopeNotice onOpen={tab === 'acts' ? null : () => showTab('acts')} />}
      {(report.status === 'done' || waiting) && (
        <>
          {report.status === 'done' && <ReportApproval report={report} authData={authData} />}
          {report.status === 'done' && <OutdatedNotice acts={report.outdatedActs} onRerun={() => setDialog('rerun')} />}
          <Tabs value={tab} onChange={(_, next) => showTab(next)} variant="scrollable" allowScrollButtonsMobile
                aria-label={t('TABS.label')} className="mb-4 border-b border-edge">
            {TABS.map((key) => (
              <Tab key={key} value={key} id={`report-tab-${key}`} aria-controls={`report-panel-${key}`} label={tabLabel(key)} />
            ))}
          </Tabs>
          <div role="tabpanel" id={`report-panel-${tab}`} aria-labelledby={`report-tab-${tab}`}>
            {notYet && <EmptyState title={t('SCOPE.notYet')} text={t('SCOPE.notYetText')} />}
            {tab === 'summary' && !notYet && <ReportOverview report={report} />}
            {tab === 'acts' && waiting && <ReportScope key={report.id} report={report} onCancel={() => { cancel.reset(); setDialog('cancelScope'); }} />}
            {tab === 'acts' && !waiting && <ReportActs key={report.id} report={report} />}
            {tab === 'findings' && !notYet && (
              <ReportFindings key={report.id} report={report} focus={focus} onClearFocus={clearFocus}
                              onReview={openReview} onOpenDocument={openDocument} />
            )}
            {tab === 'citations' && <ReportCitations key={report.id} report={report} onOpenDocument={openDocument} />}
            {tab === 'plan' && !notYet && <ReportActionPlan report={report} onShowFindings={showFindings} />}
            {tab === 'profile' && <ProfilePanel report={report} />}
          </div>
        </>
      )}

      <UniversalModal open={dialog === 'cancel'} onClose={() => setDialog(null)} onConfirm={() => cancel.mutate()} busy={cancel.isPending} danger
                      error={cancel.error ? describe(cancel.error) : null} title={t('cancelTitle')} confirmLabel={t('cancelConfirm')}>
        <Typography>{t('cancelText')}</Typography>
      </UniversalModal>
      {/* Cancelling a waiting report — the same call, asked in its own
          words: nothing is running that would stop "at its next step".
          The way out is not called "cancel" here: beside "cancel the
          analysis" it would read as the same thing. */}
      <UniversalModal open={dialog === 'cancelScope'} onClose={() => setDialog(null)} onConfirm={() => cancel.mutate()} busy={cancel.isPending} danger
                      error={cancel.error ? describe(cancel.error) : null} title={t('SCOPE.cancelTitle')} confirmLabel={t('SCOPE.cancel')}
                      cancelLabel={t('SCOPE.cancelBack')}>
        <Typography>{t('SCOPE.cancelText')}</Typography>
      </UniversalModal>
      <UniversalModal open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={() => remove.mutate()} busy={remove.isPending} danger
                      error={remove.error ? describe(remove.error) : null} title={t('deleteTitle')} confirmLabel={t('delete')}>
        <Typography>{t('deleteText')}</Typography>
      </UniversalModal>
      <StartAnalysisDialog open={dialog === 'rerun'} onClose={() => setDialog(null)} companyId={report.companyId} />
      <FindingReviewDialog reportId={report.id} finding={review?.finding} open={Boolean(review?.open)}
                           onClose={() => setReview((current) => ({ ...current, open: false }))} onExited={() => setReview(null)} />
      <DocumentDrawer documentId={opened?.id ?? null} passage={opened?.passage ?? null} onClose={() => setOpened(null)} />
    </PageLayout>
  );
}
