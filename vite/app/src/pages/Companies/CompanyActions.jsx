// -----------------------------------------------------------
//  [*] CompanyActions — a company's action register
//
//  GET /api/companies/{id}/actions: what the plans of the
//  company's signed-off reports called for, kept after the
//  reports themselves. The register moves only when a report
//  is signed off — its plan comes in, and the actions already
//  there are checked against its findings — and the card
//  says so under its title, because nothing on this tab adds
//  an action.
//
//  The tab is one sheet with the register and, under it, a
//  second one with what the law did since the latest report
//  (LawChanges). The register opens on everything that is not
//  closed, in the backend's order: the late first, then the
//  other live actions by due date. A row of toggles both
//  counts and filters it: "not closed" with all the live
//  ones, then each state with its number — the late with the
//  warning mark, so the state is never told by colour alone —
//  and "closed" last, which shows the closed. The choice
//  lives in the address (?actions.state=closed), so a look at
//  a report and Back finds the list as it was left. Each row
//  is an ActionRow, which opens to the findings it closes and
//  to the form a person keeps it up with.
//
//  "Excel" downloads the whole register as a workbook in the
//  interface language (GET …/actions/export?language=, an
//  authenticated blob download named by the server).
//
//  An empty register says how it fills — sign a finished
//  report off — and points to the company's reports tab.
//
//  Split into (root component last):
//
//    STATE_PARAM    — the filter's parameter
//    FILTERS        — what the filter offers
//    ExportButton   — the Excel download
//    StateFilter    — the toggles with their counts
//    CompanyActions — the tab (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import TableViewOutlinedIcon from '@mui/icons-material/TableViewOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import toast from '@/utils/toast';
import { useLocale, useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import { downloadFile } from '@/utils/download';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import SectionCard from '@/components/SectionCard/SectionCard';
import ActionRow from '@/pages/Companies/ActionRow';
import LawChanges from '@/pages/Companies/LawChanges';
import { ACTION_STATES, actionKeys, countsOf, fetchActions } from '@/pages/Companies/actionRegister';


// The filter's parameter ("live" is the default: absent)
const STATE_PARAM = 'actions.state';

// What the filter offers: everything not closed, then each
// state as the register counts them
const FILTERS = ['live', ...ACTION_STATES];







// -----------------------------------------------------------
// ExportButton
// -----------------------------------------------------------
//
// The register as an Excel workbook in the interface
// language: busy while the file is fetched, then a toast with
// the file's name — or with the translated reason of a
// failure.
//
// Used by:
//   - CompanyActions (below)
// -----------------------------------------------------------

function ExportButton({ companyId }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const locale = useLocale();
  const describe = useErrorMessage();
  const [busy, setBusy] = useState(false);


  const download = async () => {
    setBusy(true);
    try {
      const name = await downloadFile(`/api/companies/${companyId}/actions/export?language=${locale}`, 'actions.xlsx');
      toast.success(t('exported', { name }));
    } catch (error) {
      toast.error(t('exportFailed', { error: describe(error) }));
    } finally {
      setBusy(false);
    }
  };


  return (
    <Button variant="outlined" startIcon={<TableViewOutlinedIcon />} loading={busy} onClick={download} aria-label={t('exportLabel')}>{t('export')}</Button>
  );
}







// -----------------------------------------------------------
// StateFilter
// -----------------------------------------------------------
//
// One toggle per choice, each with how many actions it
// shows: the live ones together first, then every state in
// the register's order. Exactly one is on. The late toggle
// carries the warning mark while there is a late action.
//
// Used by:
//   - CompanyActions (below)
// -----------------------------------------------------------

function StateFilter({ counts, value, onChange }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const fmt = useFormat();
  const live = counts.late + counts.open + counts.in_progress + counts.done;
  // Spelled out per choice: the message guard checks literal
  // keys only
  const labels = {
    live: t('FILTER.live', { count: fmt.number(live) }),
    late: t('FILTER.late', { count: fmt.number(counts.late) }),
    open: t('FILTER.open', { count: fmt.number(counts.open) }),
    in_progress: t('FILTER.in_progress', { count: fmt.number(counts.in_progress) }),
    done: t('FILTER.done', { count: fmt.number(counts.done) }),
    closed: t('FILTER.closed', { count: fmt.number(counts.closed) }),
  };


  return (
    <ToggleButtonGroup exclusive size="small" value={value} aria-label={t('FILTER.label')} className="flex-wrap"
                       onChange={(_, next) => next && onChange(next)}>
      {FILTERS.map((choice) => (
        <ToggleButton key={choice} value={choice} className="gap-1 normal-case">
          {choice === 'late' && counts.late > 0 && <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: '#b07800' }} aria-hidden />}
          {labels[choice]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}







// -----------------------------------------------------------
// CompanyActions (default export)
// -----------------------------------------------------------
//
// Owns the register's query and the filter (in the address).
// An empty register shows how it fills instead of a filter
// over nothing; a filter that leaves no row says so quietly.
// The changes in the law load on their own under the card.
//
// Used by:
//   - CompanyDetail.jsx — the actions tab
// -----------------------------------------------------------

export default function CompanyActions({ company }) {

  const t = useTranslations('PAGES.company.ACTIONS');
  const [params, setView] = useViewParams();
  const shown = oneOf(params.get(STATE_PARAM), FILTERS, 'live');


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: actionKeys.company(company.id),
    queryFn: () => fetchActions(company.id),
  });


  const actions = data?.actions ?? [];
  const rows = actions.filter((action) => (shown === 'live' ? action.state !== 'closed' : action.state === shown));


  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('title')} subtitle={<span className="block max-w-3xl">{t('subtitle')}</span>}
                   actions={actions.length > 0 ? <ExportButton companyId={company.id} /> : null}>
        {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
        {isLoading && <Skeleton variant="rounded" height={240} />}
        {data && actions.length === 0 && (
          <EmptyState icon={ChecklistOutlinedIcon} title={t('empty')} text={t('emptyText')}
                      action={<Button component={Link} to={`/companies/${company.id}?tab=reports`} replace variant="outlined">{t('emptyOpen')}</Button>} />
        )}
        {actions.length > 0 && (
          <div className="flex flex-col gap-4">
            <StateFilter counts={countsOf(data)} value={shown} onChange={(next) => setView({ [STATE_PARAM]: next === 'live' ? null : next })} />
            {rows.length === 0
              ? <Typography variant="body2" color="text.secondary" role="status">{t('none')}</Typography>
              : (
                <ul className="list-none m-0 p-0" aria-label={t('list')}>
                  {rows.map((action) => <ActionRow key={action.id} action={action} companyId={company.id} />)}
                </ul>
              )}
          </div>
        )}
      </SectionCard>
      <LawChanges company={company} />
    </div>
  );
}
