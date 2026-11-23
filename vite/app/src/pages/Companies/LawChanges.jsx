// -----------------------------------------------------------
//  [*] LawChanges — what the law did since the last report
//
//  GET /api/companies/{id}/law-changes: for the company's
//  latest finished report, every act it assessed that has a
//  newer version now — the version the report read and the
//  one in force, the provisions the versions since changed,
//  added or removed, and the report's findings that rest on
//  a changed or removed provision: the ones to look at
//  again. The section stands under the action register,
//  because both answer the same question — what has moved
//  since the company was last assessed.
//
//  It says one of four things. Nothing at all, when the
//  company has no finished report: there is nothing to
//  compare. One quiet line, when the acts under the latest
//  report have not moved. Otherwise a row per act; and for an
//  act whose change was taken in before changes were
//  recorded, that it changed and nobody can say where.
//
//  A finding links to its report's findings tab narrowed to
//  it (actionRegister findingPath); an act links to its page
//  in the corpus. The section loads after the register and
//  shows nothing while it does; a failed load says so in
//  place, with a retry.
//
//  Split into (root component last):
//
//    SHOWN      — how many provisions a list names
//    Provisions — the provisions of one kind of change
//    ActChange  — one act that moved
//    LawChanges — the section (default export)
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import ErrorState from '@/components/ErrorState/ErrorState';
import SectionCard from '@/components/SectionCard/SectionCard';
import { actionKeys, fetchLawChanges, findingPath } from '@/pages/Companies/actionRegister';
import FindingStatusIcon from '@/pages/Reports/FindingStatusIcon';


// How many provisions one list names before it says how
// many more there are — a recast act changes hundreds
const SHOWN = 12;







// -----------------------------------------------------------
// Provisions
// -----------------------------------------------------------
//
// The provisions one kind of change touched, as a short line
// under its label: the first few named, in the serif of the
// law, then how many more. Nothing for an empty list.
//
// Used by:
//   - ActChange (below)
// -----------------------------------------------------------

function Provisions({ label, paths }) {

  const t = useTranslations('PAGES.company.LAW');
  const list = Array.isArray(paths) ? paths.map(String) : [];


  if (list.length === 0) return null;
  return (
    <div className="flex gap-x-2 flex-wrap text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0">
        <span className="font-serif">{list.slice(0, SHOWN).join(', ')}</span>
        {list.length > SHOWN && <span className="text-muted"> {t('more', { count: list.length - SHOWN })}</span>}
      </dd>
    </div>
  );
}







// -----------------------------------------------------------
// ActChange
// -----------------------------------------------------------
//
// One act that moved: its name (the way to its page in the
// corpus), the version the report assessed and the one in
// force with its date, what changed, and the findings to
// look at again — each with its verdict's mark and word, its
// provision and the way to its card in the report. An act
// whose change was never recorded says that instead of
// leaving empty lists to be read as "nothing changed".
//
// Used by:
//   - LawChanges (below)
// -----------------------------------------------------------

function ActChange({ act, reportId }) {

  const t = useTranslations('PAGES.company.LAW');
  const label = useEnumLabel();
  const fmt = useFormat();
  const name = act.act == null ? '—' : String(act.act);
  const findings = Array.isArray(act.findings) ? act.findings.filter((finding) => finding && typeof finding === 'object') : [];


  return (
    <li className="py-3.5 first:pt-0 last:pb-0 border-t border-edge first:border-t-0 flex flex-col gap-2">
      <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
        <Typography variant="subtitle1" component="h3">
          {act.documentId ? <Link to={`/corpus/${act.documentId}`} className="text-primary">{name}</Link> : name}
        </Typography>
        <span className="text-sm text-muted">
          {t('versions', { assessed: act.assessedVersion ?? '—', current: act.currentVersion ?? '—', date: fmt.date(act.currentDate) })}
        </span>
      </div>
      {act.recorded === false && <Typography variant="body2">{t('unrecorded')}</Typography>}
      <dl className="m-0 flex flex-col gap-0.5">
        <Provisions label={t('changed')} paths={act.changed} />
        <Provisions label={t('added')} paths={act.added} />
        <Provisions label={t('removed')} paths={act.removed} />
      </dl>
      {findings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Typography variant="caption" color="text.secondary" component="h4" className="font-semibold">{t('findings')}</Typography>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {findings.map((finding, index) => (
              <li key={`${finding.id}-${index}`} className="border-l-2 border-edge pl-3 flex items-center gap-x-4 gap-y-0.5 flex-wrap text-sm">
                {reportId
                  ? <Link to={findingPath(reportId, finding.title)} className="text-primary">{String(finding.title ?? '—')}</Link>
                  : <span>{String(finding.title ?? '—')}</span>}
                {finding.path && <span className="font-serif">{String(finding.path)}</span>}
                <span className="inline-flex items-center gap-1 text-muted">
                  <FindingStatusIcon status={finding.status} sx={{ fontSize: 16 }} />{label('findingStatus', finding.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}







// -----------------------------------------------------------
// LawChanges (default export)
// -----------------------------------------------------------
//
// Owns the query and decides what the section says: nothing
// while it loads and nothing for a company without a
// finished report; the quiet "not changed" line with the
// date of the report compared against; or the acts that
// moved.
//
// Used by:
//   - CompanyActions.jsx — under the register
// -----------------------------------------------------------

export default function LawChanges({ company }) {

  const t = useTranslations('PAGES.company.LAW');
  const fmt = useFormat();


  const { data, error, refetch } = useQuery({
    queryKey: actionKeys.law(company.id),
    queryFn: () => fetchLawChanges(company.id),
  });


  if (error) {
    return (
      <SectionCard title={t('title')}>
        <ErrorState error={error} onRetry={refetch} title={t('loadError')} />
      </SectionCard>
    );
  }
  if (!data?.reportId) return null;
  const date = fmt.date(data.reportDate);
  if (data.acts.length === 0) {
    return (
      <SectionCard title={t('title')}>
        <Typography variant="body2" color="text.secondary">{t('unchanged', { date })}</Typography>
      </SectionCard>
    );
  }
  return (
    <SectionCard title={t('title')} subtitle={t('subtitle', { date })}>
      <ul className="m-0 p-0 list-none">
        {data.acts.map((act, index) => <ActChange key={`${act.actId}-${index}`} act={act} reportId={data.reportId} />)}
      </ul>
    </SectionCard>
  );
}
