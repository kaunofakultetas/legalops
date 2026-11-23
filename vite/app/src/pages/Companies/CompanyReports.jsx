// -----------------------------------------------------------
//  [*] CompanyReports — one company's gap analyses
//
//  GET /api/reports?companyId= through the shared reports
//  table (company column hidden; its page and sort in the
//  address as ?reports.page=…), polled every 5 s while an
//  analysis of this company is queued or running. The empty
//  state offers the same "run analysis" the page header has.
// -----------------------------------------------------------

import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import SectionCard from '@/components/SectionCard/SectionCard';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import ReportsTable from '@/pages/Reports/ReportsTable';
import { isActive } from '@/pages/Reports/reportUtils';







// -----------------------------------------------------------
// CompanyReports (default export)
// -----------------------------------------------------------
//
//   <CompanyReports company={…} onRun={() => …} />
//
// Used by:
//   - CompanyDetail.jsx — the reports tab
// -----------------------------------------------------------

export default function CompanyReports({ company, onRun }) {

  const t = useTranslations('PAGES.company.REPORTS');
  const tCompany = useTranslations('PAGES.company');


  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey: ['reports', { companyId: company.id }],
    queryFn: async () => (await api.get(`/api/reports?companyId=${company.id}`)).data.reports,
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 5000 : false),
  });


  return (
    <SectionCard title={t('title')}>
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!error && !isLoading && reports.length === 0 && (
        <EmptyState icon={AssessmentOutlinedIcon} title={t('empty')} text={t('emptyText')}
                    action={<Button variant="contained" onClick={onRun}>{tCompany('runAnalysis')}</Button>} />
      )}
      {!error && (isLoading || reports.length > 0) && <ReportsTable reports={reports} loading={isLoading} hideCompany persist="reports" />}
    </SectionCard>
  );
}
