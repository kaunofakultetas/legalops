// -----------------------------------------------------------
//  [*] Reports — every gap analysis the caller may see
//
//  GET /api/reports (own companies; admins all), filtered by
//  company on the server and by status here. The list polls
//  every 5 s while any analysis is queued or running, so the
//  progress bars move and a finished report flips to
//  "Baigta" by itself; a report waiting for its list of acts
//  to be approved changes only when a person acts, so it is
//  not polled. "Nauja analizė" opens the start dialog with a
//  company picker.
//
//  Both filters and the table's page and sort live in the
//  address (?company=<id>&status=done&page=2 — replaced), so
//  the list comes back as it was left. A company the caller's
//  list does not hold (a stale link, another user's company)
//  is ignored once the list is known.
//
//  Split into (root component last):
//
//    STATUSES — the status filter options
//    Filters  — company + status
//    Reports  — the page (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import useViewParams from '@/hooks/useViewParams';
import { idParam, oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import ErrorState from '@/components/ErrorState/ErrorState';
import EmptyState from '@/components/EmptyState/EmptyState';
import ReportsTable from '@/pages/Reports/ReportsTable';
import StartAnalysisDialog from '@/pages/Reports/StartAnalysisDialog';
import { isActive } from '@/pages/Reports/reportUtils';


// The report lifecycle, in order — a report started with the
// review waits (scope_review) between its two parts
const STATUSES = ['queued', 'running', 'scope_review', 'done', 'failed', 'cancelled'];







// -----------------------------------------------------------
// Filters
// -----------------------------------------------------------
//
// The company autocomplete (from the caller's companies,
// `companies` the page's query) and the status select;
// null / "" mean all. A company list that fails to load says
// so under the filters, with a retry — an empty picker would
// look like "no companies".
//
// Used by:
//   - Reports (below)
// -----------------------------------------------------------

function Filters({ companies: { data: companies = [], error, refetch }, companyId, status, onCompany, onStatus }) {

  const t = useTranslations('PAGES.reports');
  const label = useEnumLabel();


  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex gap-2 flex-wrap">
        <Autocomplete
          size="small"
          className="w-72 max-w-full"
          options={companies}
          value={companies.find((c) => c.id === companyId) ?? null}
          onChange={(_, company) => onCompany(company?.id ?? null)}
          getOptionLabel={(company) => company.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label={t('company')} placeholder={t('allCompanies')} />}
        />
        <TextField select size="small" label={t('status')} value={status} onChange={(e) => onStatus(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">{t('all')}</MenuItem>
          {STATUSES.map((s) => <MenuItem key={s} value={s}>{label('reportStatus', s)}</MenuItem>)}
        </TextField>
      </div>
      {error && <ErrorState error={error} onRetry={refetch} title={t('START.companiesFailed')} />}
    </div>
  );
}







// -----------------------------------------------------------
// Reports (default export)
// -----------------------------------------------------------
//
// Owns the filters (read from and written to the address),
// the companies query the company filter picks from and is
// checked against, the list query and the start dialog.
//
// Used by:
//   - router.jsx — route /reports
// -----------------------------------------------------------

export default function Reports({ authData }) {

  const t = useTranslations('PAGES.reports');
  const [params, setView] = useViewParams();
  const status = oneOf(params.get('status'), STATUSES);
  const [starting, setStarting] = useState(false);


  const companies = useQuery({
    queryKey: ['companies', { q: '', scope: '' }],
    queryFn: async () => (await api.get('/api/companies')).data.companies,
  });
  // The address's company, until the caller's list is known
  // not to hold it
  const wanted = idParam(params.get('company'));
  const known = !Array.isArray(companies.data) || companies.data.some((company) => company?.id === wanted);
  const companyId = wanted && known ? wanted : null;


  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey: ['reports', { companyId }],
    queryFn: async () => (await api.get(`/api/reports${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`)).data.reports,
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 5000 : false),
  });


  const shown = status ? reports.filter((r) => r.status === status) : reports;
  const filtered = Boolean(companyId || status);


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}
                actions={<Button variant="contained" onClick={() => setStarting(true)}>{t('new')}</Button>}>
      <Filters companies={companies} companyId={companyId} status={status}
               onCompany={(id) => setView({ company: id, page: null })} onStatus={(value) => setView({ status: value, page: null })} />
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && shown.length === 0 && (
        <EmptyState icon={AssessmentOutlinedIcon} title={filtered ? t('emptyFiltered') : t('empty')} text={filtered ? null : t('emptyText')}
                    action={filtered ? null : <Button variant="outlined" onClick={() => setStarting(true)}>{t('new')}</Button>} />
      )}
      {!error && (isLoading || shown.length > 0) && <ReportsTable reports={shown} loading={isLoading} hideCompany={Boolean(companyId)} persist />}
      <StartAnalysisDialog open={starting} onClose={() => setStarting(false)} />
    </PageLayout>
  );
}
