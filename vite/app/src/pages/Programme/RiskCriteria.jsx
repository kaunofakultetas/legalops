// -----------------------------------------------------------
//  [*] RiskCriteria — how a risk is measured, and what the
//      company tolerates
//
//  The "criteria" tab of a risk product. Two tables say what
//  each of the five levels means for this company: the
//  likelihood over its four dimensions (internal control,
//  legal clarity and supervisory practice, counterparties,
//  frequency) and the impact over its four (financial,
//  supervisory and licence, reputation, reach). Under them,
//  how the criteria were fitted to the company. Then the
//  appetite: the five bands of the matrix, each with the
//  scores it covers, what a risk in it means for the
//  company, who decides on it, and the responses it allows.
//
//  The bands, their ranges and their responses are fixed by
//  the backend; the level names are the method's. What a
//  person edits in a draft is the wording: every cell of the
//  two tables, the note on the fitting, and each band's
//  meaning and decision.
//
//  Split into (root component last):
//
//    Cell          — a text, or the field that edits it
//    CriteriaTable — one of the two 5×4 tables
//    Appetite      — the appetite table
//    RiskCriteria  — the tab (default export)
// -----------------------------------------------------------

import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import SectionCard from '@/components/SectionCard/SectionCard';
import { BAND_TINTS, IMPACT_DIMENSIONS, LIKELIHOOD_DIMENSIONS, RESPONSES, listOf, patchAt } from '@/pages/Programme/programmeUtils';
import { ROW, SCROLL, TABLE, TD, TH } from '@/pages/Programme/tableClasses';







// -----------------------------------------------------------
// Cell
// -----------------------------------------------------------
//
// A cell's text as it reads, or — `onChange` given, a draft
// being edited — a field holding it, named by `label` since
// a table cell has no visible one.
//
// Used by:
//   - CriteriaTable, Appetite (below)
// -----------------------------------------------------------

function Cell({ value, label, onChange = null }) {
  if (!onChange) return value || '—';
  return (
    <TextField size="small" fullWidth multiline hiddenLabel value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}
               slotProps={{ htmlInput: { 'aria-label': label } }} />
  );
}







// -----------------------------------------------------------
// CriteriaTable
// -----------------------------------------------------------
//
// One criteria table: a row per level, lowest first, headed
// by the level's number and name; a column per dimension.
// `onPatch`, given a row's index and its changed fields,
// makes the cells editable.
//
// Used by:
//   - RiskCriteria (below)
// -----------------------------------------------------------

function CriteriaTable({ rows, dimensions, levelEnum, onPatch = null }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();


  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[60rem] table-fixed`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-40`}>{t('level')}</th>
            {dimensions.map((name) => <th key={name} scope="col" className={TH}>{t(`DIMENSIONS.${name}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const level = `${row.level} — ${label(levelEnum, row.level)}`;
            return (
              <tr key={row.level ?? index} className={ROW}>
                <th scope="row" className={`${TD} text-left font-semibold`}>{level}</th>
                {dimensions.map((name) => (
                  <td key={name} className={TD}>
                    <Cell value={row[name]} label={t('fieldOf', { field: t(`DIMENSIONS.${name}`), name: level })}
                          onChange={onPatch ? (value) => onPatch(index, { [name]: value }) : null} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// Appetite
// -----------------------------------------------------------
//
// The appetite table: a row per band, its name and range on
// the band's tint, what it means, who decides, and the
// responses it allows, in words. `onPatch` makes the meaning
// and the decision editable.
//
// Used by:
//   - RiskCriteria (below)
// -----------------------------------------------------------

function Appetite({ rows, onPatch = null }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();
  const band = (row) => (BAND_TINTS[row.band] ? label('riskBand', row.band) : String(row.name ?? row.band ?? '—'));


  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[56rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-36`}>{t('band')}</th>
            <th scope="col" className={`${TH} w-[36%]`}>{t('meaning')}</th>
            <th scope="col" className={TH}>{t('decision')}</th>
            <th scope="col" className={`${TH} w-40`}>{t('responsesAllowed')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.band ?? index} className={ROW}>
              <th scope="row" className="py-2 pr-4 align-top text-left font-normal">
                <span className="block rounded border border-edge px-2 py-1 text-center" style={BAND_TINTS[row.band]}>
                  <span className="block font-semibold">{band(row)}</span>
                  <span className="tabular-nums">{row.from}–{row.to}</span>
                </span>
              </th>
              <td className={TD}>
                <Cell value={row.comment} label={t('fieldOf', { field: t('meaning'), name: band(row) })} onChange={onPatch ? (comment) => onPatch(index, { comment }) : null} />
              </td>
              <td className={TD}>
                <Cell value={row.decision} label={t('fieldOf', { field: t('decision'), name: band(row) })} onChange={onPatch ? (decision) => onPatch(index, { decision }) : null} />
              </td>
              <td className={TD}>
                {(Array.isArray(row.responses) ? row.responses : []).map((response) => (RESPONSES.includes(response) ? label('riskResponse', response) : String(response))).join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// RiskCriteria (default export)
// -----------------------------------------------------------
//
// The criteria, the note on their fitting and the appetite
// of the content as it stands, read or — `editing` — with
// their wording in fields. `change` takes a function from
// the content to the edited content.
//
// Used by:
//   - ProductPage.jsx — the criteria tab of a risk product
// -----------------------------------------------------------

export default function RiskCriteria({ content, editing, change }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const criteria = content.criteria && typeof content.criteria === 'object' ? content.criteria : {};
  const patchCriteria = (fields) => change((current) => ({ ...current, criteria: { ...current.criteria, ...fields } }));
  const patchScale = (scale) => (index, fields) => change((current) => ({
    ...current, criteria: { ...current.criteria, [scale]: patchAt(listOf(current.criteria?.[scale]), index, fields) },
  }));
  const patchAppetite = (index, fields) => change((current) => ({ ...current, appetite: patchAt(listOf(current.appetite), index, fields) }));


  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('likelihoodCriteria')}>
        <CriteriaTable rows={listOf(criteria.likelihood)} dimensions={LIKELIHOOD_DIMENSIONS} levelEnum="likelihoodLevel" onPatch={editing ? patchScale('likelihood') : null} />
      </SectionCard>
      <SectionCard title={t('impactCriteria')}>
        <CriteriaTable rows={listOf(criteria.impact)} dimensions={IMPACT_DIMENSIONS} levelEnum="impactLevel" onPatch={editing ? patchScale('impact') : null} />
      </SectionCard>
      <SectionCard title={t('calibration')}>
        {editing
          ? <TextField fullWidth multiline minRows={4} label={t('calibration')} value={String(criteria.calibration ?? '')} onChange={(event) => patchCriteria({ calibration: event.target.value })} />
          : <Typography variant="body2" className="max-w-[90ch] whitespace-pre-wrap">{criteria.calibration || '—'}</Typography>}
      </SectionCard>
      <SectionCard title={t('appetite')}>
        <Appetite rows={listOf(content.appetite)} onPatch={editing ? patchAppetite : null} />
      </SectionCard>
    </div>
  );
}
