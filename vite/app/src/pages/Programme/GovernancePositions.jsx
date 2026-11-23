// -----------------------------------------------------------
//  [*] GovernancePositions — what the documents name, and
//      what they lack
//
//  The "positions and gaps" tab of a governance product, the
//  evidence under the proposed structure. The positions and
//  units the company's own documents name: each with its
//  unit, the line of the three lines model it stands on,
//  what it answers for, and the documents that name it. And
//  the roles and functions a financial market participant
//  needs that the documents do not show, or show unclearly:
//  the role, its line, and why it is missing.
//
//  Both are read-only: they record what the generation found
//  in the library, not what the company decides — that is
//  the structure and the matrix.
//
//  Split into (root component last):
//
//    Positions           — the positions found
//    Gaps                — the roles missing
//    GovernancePositions — the tab (default export)
// -----------------------------------------------------------

import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import SectionCard from '@/components/SectionCard/SectionCard';
import { LINES, listOf } from '@/pages/Programme/programmeUtils';
import { ROW, SCROLL, TABLE, TD, TH } from '@/pages/Programme/tableClasses';







// -----------------------------------------------------------
// Positions
// -----------------------------------------------------------
//
// The positions as a table; the documents a position is
// named in stand under its duties, each title once.
//
// Used by:
//   - GovernancePositions (below)
// -----------------------------------------------------------

function Positions({ rows }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const line = (value) => (LINES.includes(value) ? t(`LINES.${value}`) : String(value ?? '—'));


  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">{t('noPositions')}</Typography>;
  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[48rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-[22%]`}>{t('position')}</th>
            <th scope="col" className={`${TH} w-[18%]`}>{t('unit')}</th>
            <th scope="col" className={`${TH} w-[14%]`}>{t('line')}</th>
            <th scope="col" className={TH}>{t('duties')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const documents = [...new Set(listOf(row.sources).map((source) => source.document).filter(Boolean))].sort();
            return (
              <tr key={index} className={ROW}>
                <td className={`${TD} font-semibold`}>{row.name}</td>
                <td className={TD}>{row.unit || '—'}</td>
                <td className={TD}>{line(row.line)}</td>
                <td className={TD}>
                  <div className="max-w-[80ch]">{row.duties}</div>
                  {documents.length > 0 && <div className="mt-1 text-muted">{t('sources')}: {documents.join('; ')}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// Gaps
// -----------------------------------------------------------
//
// The missing roles as a list: the role with its line, then
// why the documents fall short of it.
//
// Used by:
//   - GovernancePositions (below)
// -----------------------------------------------------------

function Gaps({ rows }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const line = (value) => (LINES.includes(value) ? t(`LINES.${value}`) : String(value ?? '—'));


  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">{t('noGaps')}</Typography>;
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-4">
      {rows.map((row, index) => (
        <li key={index} className="max-w-[90ch]">
          <div><span className="font-semibold">{row.role}</span> <span className="text-muted">· {line(row.line)}</span></div>
          <div className="text-sm">{row.why}</div>
        </li>
      ))}
    </ul>
  );
}







// -----------------------------------------------------------
// GovernancePositions (default export)
// -----------------------------------------------------------
//
// The two sheets of the tab, read off the content.
//
// Used by:
//   - ProductPage.jsx — the positions tab of a governance
//     product
// -----------------------------------------------------------

export default function GovernancePositions({ content }) {
  const t = useTranslations('PAGES.programme.GOVERNANCE');
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('positions')}><Positions rows={listOf(content.positions)} /></SectionCard>
      <SectionCard title={t('gaps')}><Gaps rows={listOf(content.gaps)} /></SectionCard>
    </div>
  );
}
