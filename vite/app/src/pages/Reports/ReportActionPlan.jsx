// -----------------------------------------------------------
//  [*] ReportActionPlan — what to do, in order
//
//  The prioritised actions that close the open findings:
//  priority number, title, description, timeframe, effort
//  (sąnaudos), the responsible role and the domain. "Susiję
//  išvados" hands the action's finding ids to the findings
//  tab, which then shows only those. An action whose findings
//  all belong to acts not yet in force is marked as
//  preparation — the plan lists those last.
//
//  Split into (root component last):
//
//    ActionCard       — one action
//    ReportActionPlan — the tab (default export)
// -----------------------------------------------------------

import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import EmptyState from '@/components/EmptyState/EmptyState';
import { isUpcoming, rowKeys } from '@/pages/Reports/reportUtils';







// -----------------------------------------------------------
// ActionCard
// -----------------------------------------------------------
//
// The priority badge beside the action's text and chips;
// `preparation` adds the chip saying the action readies the
// company for an act that does not apply yet.
//
// Used by:
//   - ReportActionPlan (below)
// -----------------------------------------------------------

function ActionCard({ action, preparation, onShowFindings }) {

  const t = useTranslations('PAGES.report.PLAN');
  const label = useEnumLabel();


  return (
    <Paper component="li" variant="outlined" className="p-3 flex gap-3">
      <div className="shrink-0 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-semibold" aria-label={t('priority', { n: action.priority })}>
        {action.priority}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Typography variant="subtitle1" component="h3" className="font-semibold">{action.title}</Typography>
        {action.description && <Typography variant="body2" className="whitespace-pre-wrap">{action.description}</Typography>}
        <div className="flex gap-1 flex-wrap">
          {preparation && <Chip size="small" color="info" variant="outlined" label={t('preparation')} />}
          <Chip size="small" label={label('timeframe', action.timeframe)} />
          <Chip size="small" variant="outlined" label={t('effort', { effort: label('effort', action.effort) })} />
          {action.ownerRole && <Chip size="small" variant="outlined" label={t('owner', { owner: action.ownerRole })} />}
          <Chip size="small" variant="outlined" label={label('category', action.category)} />
        </div>
        {action.findingIds?.length > 0 && (
          <div><Button size="small" onClick={() => onShowFindings(action)}>{t('closes', { count: action.findingIds.length })}</Button></div>
        )}
      </div>
    </Paper>
  );
}







// -----------------------------------------------------------
// ReportActionPlan (default export)
// -----------------------------------------------------------
//
//   <ReportActionPlan report={…} onShowFindings={(action) => …} />
//
// An action without an id, or repeating one, is still
// listed (reportUtils rowKeys). An action is preparation
// when it closes findings and every one of them belongs to
// an act that applies from a later date.
//
// Used by:
//   - ReportDetail.jsx — the plan tab
// -----------------------------------------------------------

export default function ReportActionPlan({ report, onShowFindings }) {
  const t = useTranslations('PAGES.report.PLAN');
  const actions = [...(report.actions || [])].sort((a, b) => a.priority - b.priority);
  const keyOf = rowKeys(actions);
  const later = new Set((report.findings || []).filter(isUpcoming).map((finding) => finding.id));
  const prepares = (action) => action.findingIds?.length > 0 && action.findingIds.every((id) => later.has(id));
  if (actions.length === 0) return <EmptyState icon={ChecklistOutlinedIcon} title={t('empty')} />;
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-3" aria-label={t('title')}>
      {actions.map((action) => (
        <ActionCard key={keyOf.get(action)} action={action} preparation={prepares(action)} onShowFindings={onShowFindings} />
      ))}
    </ol>
  );
}
