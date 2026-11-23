// -----------------------------------------------------------
//  [*] RiskMatrix — the 5×5 matrix of the register
//
//  Impact runs up the side, likelihood along the bottom, as
//  on the exported page. Every cell shows its score — the
//  product of its two levels, the matrix's own arithmetic —
//  on the tint of the band that score belongs to, and the
//  ids of the scenarios the server placed there. The bands
//  and their ranges are read off the appetite table the
//  server sent; the five tints are the blue ramp of the PDF,
//  the two darkest with white text.
//
//  Colour is never the only carrier: a cell's score is
//  printed in it and its band is in the cell for a screen
//  reader, and a legend under the matrix names every band
//  with its range in words.
//
//  A scenario's place in the matrix is the server's. A
//  scenario whose scores were edited and not yet saved has
//  no place the page could vouch for: the register leaves it
//  out of what it hands over, and it is named in a line
//  under the matrix until the save brings its levels back. A
//  scenario with a score not set has no place at all.
//
//  Split into (root component last):
//
//    AXIS       — the levels of an axis
//    MatrixCell — one cell
//    Legend     — the bands in words
//    RiskMatrix — the matrix (default export)
// -----------------------------------------------------------

import { useId } from 'react';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import { BAND_TINTS, bandOfCell, listOf } from '@/pages/Programme/programmeUtils';
import { SCROLL } from '@/pages/Programme/tableClasses';


// The five levels of an axis, lowest first
const AXIS = [1, 2, 3, 4, 5];







// -----------------------------------------------------------
// MatrixCell
// -----------------------------------------------------------
//
// One cell: its score, its band for a screen reader, and the
// ids of the scenarios in it.
//
// Used by:
//   - RiskMatrix (below)
// -----------------------------------------------------------

function MatrixCell({ score, band, ids }) {
  const label = useEnumLabel();
  return (
    <td className="h-16 min-w-20 sm:w-32 sm:min-w-28 rounded p-1 text-center align-middle border border-edge" style={BAND_TINTS[band]}>
      <div className="font-bold tabular-nums">{score}</div>
      {band && <span className="sr-only">{label('riskBand', band)}</span>}
      {ids.length > 0 && (
        <div className="text-xs font-semibold leading-tight">
          {ids.map((id, index) => <span key={id} className="inline-block whitespace-nowrap">{id}{index < ids.length - 1 ? ',\u00a0' : ''}</span>)}
        </div>
      )}
    </td>
  );
}







// -----------------------------------------------------------
// Legend
// -----------------------------------------------------------
//
// The bands in words, lowest first: a swatch of the band's
// tint, its name and the scores it covers.
//
// Used by:
//   - RiskMatrix (below)
// -----------------------------------------------------------

function Legend({ appetite }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();


  if (appetite.length === 0) return null;
  return (
    <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-sm">
      <span className="text-muted">{t('legend')}:</span>
      <ul className="list-none m-0 p-0 flex gap-x-4 gap-y-1 flex-wrap">
        {appetite.map((row) => (
          <li key={row.band} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3.5 rounded-sm border border-edge" style={BAND_TINTS[row.band]} aria-hidden />
            {t('bandRange', { name: BAND_TINTS[row.band] ? label('riskBand', row.band) : String(row.name ?? row.band), from: row.from, to: row.to })}
          </li>
        ))}
      </ul>
    </div>
  );
}







// -----------------------------------------------------------
// RiskMatrix (default export)
// -----------------------------------------------------------
//
// The matrix of `scenarios` — the ones whose place the
// server vouches for — under the line that says which axis
// is which, outside the table, so it does not scroll away
// with a matrix wider than a phone. `pending` are the ids of
// the scenarios whose scores wait for a save: they are named
// under the matrix.
//
// Used by:
//   - RiskRegister.jsx — the top of the register tab
// -----------------------------------------------------------

export default function RiskMatrix({ scenarios, appetite, pending = [] }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();
  const captionId = useId();
  const bands = listOf(appetite);
  const idsAt = (likelihood, impact) => scenarios
    .filter((scenario) => scenario.likelihood?.level === likelihood && scenario.impact?.level === impact).map((scenario) => scenario.id);


  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm">
        <div className="font-semibold">{t('impactAxis')} ↑ · {t('likelihoodAxis')} →</div>
        <div id={captionId} className="text-muted max-w-[80ch]">{t('matrixCaption')}</div>
      </div>
      <div className={SCROLL}>
        <table className="border-separate border-spacing-1 text-sm" aria-label={t('matrix')} aria-describedby={captionId}>
          <tbody>
            {[...AXIS].reverse().map((impact) => (
              <tr key={impact}>
                <th scope="row" className="pr-2 text-right font-normal text-muted max-w-24 sm:max-w-40">{impact} — {label('impactLevel', impact)}</th>
                {AXIS.map((likelihood) => (
                  <MatrixCell key={likelihood} score={likelihood * impact} band={bandOfCell(bands, likelihood * impact)} ids={idsAt(likelihood, impact)} />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              {AXIS.map((likelihood) => (
                <th key={likelihood} scope="col" className="pt-1 font-normal text-muted align-top leading-tight">{likelihood} — {label('likelihoodLevel', likelihood)}</th>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <Legend appetite={bands} />
      {pending.length > 0 && <Typography variant="body2" color="text.secondary" role="status">{t('pending', { ids: pending.join(', ') })}</Typography>}
    </div>
  );
}
