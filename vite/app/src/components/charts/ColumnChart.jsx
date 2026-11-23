// -----------------------------------------------------------
//  [*] ColumnChart — a daily stacked column chart
//
//  Change over time for one or two series (the usage page's
//  input / output tokens per day). Thin columns (≤ 24 px,
//  4 px rounded tops, 2 px surface gap between the stacked
//  segments) on a hairline grid with three clean y ticks;
//  x labels thin out so they never collide. Every column is
//  focusable and shows the date, each series and the total
//  in a tooltip (hover and keyboard alike); the legend names
//  the series; "Rodyti lentelę" swaps in the table view —
//  the same numbers without the chart.
//
//  The plot, the legend and the table each carry a name of
//  their own, so a screen reader moving by group, list or
//  table tells them apart: the plot is the chart's label,
//  the legend "<label> — legenda", the table "<label> —
//  lentelė". With a `stateKey` the choice of view outlives
//  the page (sessionStorage): a user who reads the table
//  finds the table again.
//
//  Split into (root component last):
//
//    PLOT_HEIGHT — the plot's height in px (axis band extra)
//    ChartTable  — the table view
//    ColumnChart — the chart (default export)
// -----------------------------------------------------------

import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from '@/i18n';
import useSessionState from '@/hooks/useSessionState';
import { GRID, niceMax } from '@/components/charts/chartTokens';


// The plot area; the x-axis band sits below it, inside the
// figure, so the card never scrolls on its own
const PLOT_HEIGHT = 160;







// -----------------------------------------------------------
// ChartTable
// -----------------------------------------------------------
//
// Date, each series and the total — the accessibility twin
// of the chart, named after it ("<label> — lentelė").
//
// Used by:
//   - ColumnChart (below)
// -----------------------------------------------------------

function ChartTable({ label, data, series, format }) {
  const t = useTranslations('COMPONENTS.charts');
  return (
    <div className="overflow-x-auto max-h-80">
      <table aria-label={t('table', { label })} className="w-full text-sm tabular-nums border-collapse">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-4 font-normal">{t('date')}</th>
            {series.map((s) => <th key={s.label} className="py-1 pr-4 font-normal text-right">{s.label}</th>)}
            <th className="py-1 font-normal text-right">{t('total')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.key} className="border-t border-edge">
              <td className="py-1 pr-4">{row.label}</td>
              {row.values.map((value, i) => <td key={i} className="py-1 pr-4 text-right">{format(value)}</td>)}
              <td className="py-1 text-right font-semibold">{format(row.values.reduce((a, b) => a + b, 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// ColumnChart (default export)
// -----------------------------------------------------------
//
//   <ColumnChart label="Žetonai per dieną"
//                series={[{ label: 'Įvestis', color }, { label: 'Išvestis', color }]}
//                data={[{ key: '2026-09-27', label: '09-27', values: [950, 180] }]}
//                format={(n) => fmt.tokens(n)} stateKey="usage.tokensChart" />
//
// `stateKey` (optional) keeps the chart / table choice under
// that name.
//
// Used by:
//   - pages/Usage/Usage.jsx — cost and tokens per day
// -----------------------------------------------------------

export default function ColumnChart({ label, series, data, format = String, stateKey = null }) {

  const t = useTranslations('COMPONENTS.charts');
  const [asTable, setAsTable] = useSessionState(stateKey && `chart.${stateKey}`, false, (value) => typeof value === 'boolean');
  const totals = data.map((row) => row.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [max, max / 2, 0];
  const widest = ticks.map((tick) => format(tick)).reduce((a, b) => (b.length > a.length ? b : a), '');
  // At most ~8 x labels: every nth day counted back from the
  // last one, so the newest day is always labelled and the
  // spacing stays even (no two labels side by side)
  const every = Math.max(1, Math.ceil(data.length / 8));


  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ul className="m-0 p-0 list-none flex gap-4 flex-wrap" aria-label={t('legend', { label })}>
          {series.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 text-sm">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
        <Button size="small" onClick={() => setAsTable(!asTable)}>{asTable ? t('showChart') : t('showTable')}</Button>
      </div>

      {asTable ? <ChartTable label={label} data={data} series={series} format={format} /> : (
        <div className="grid grid-cols-[auto_1fr] gap-x-2" role="group" aria-label={label}>
          <div className="relative text-xs text-muted tabular-nums" style={{ height: PLOT_HEIGHT }}>
            {/* The labels are positioned on their gridlines; this
                hidden copy of the widest one gives the axis column
                its width */}
            <span className="invisible block whitespace-nowrap" aria-hidden>{widest}</span>
            {ticks.map((tick, i) => (
              <span key={i} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>{format(tick)}</span>
            ))}
          </div>
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {ticks.map((_, i) => (
              <div key={i} className="absolute left-0 right-0" aria-hidden
                   style={{ top: `${(i / (ticks.length - 1)) * 100}%`, borderTop: `1px solid ${i === ticks.length - 1 ? GRID.baseline : GRID.line}` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {data.map((row, index) => (
                <Tooltip
                  key={row.key}
                  describeChild
                  title={(
                    <div className="text-xs">
                      <div className="font-semibold">{row.label}</div>
                      {series.map((s, i) => <div key={s.label}>{s.label}: {format(row.values[i])}</div>)}
                      <div>{t('total')}: {format(totals[index])}</div>
                    </div>
                  )}
                >
                  <div tabIndex={0} role="img"
                       aria-label={`${row.label}: ${series.map((s, i) => `${s.label} ${format(row.values[i])}`).join(', ')}`}
                       className="flex-1 h-full flex flex-col justify-end items-center outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-canvas">
                    <div className="flex flex-col-reverse gap-[2px] w-full max-w-6">
                      {row.values.map((value, i) => (value > 0 ? (
                        <div key={i} className={i === row.values.length - 1 || row.values.slice(i + 1).every((v) => !v) ? 'rounded-t' : ''}
                             style={{ height: `${(value / max) * (PLOT_HEIGHT - 2)}px`, background: series[i].color }} />
                      ) : null))}
                    </div>
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>
          <div />
          <div className="flex gap-[2px] text-xs text-muted pt-1" aria-hidden>
            {data.map((row, index) => (
              <span key={row.key} className="flex-1 text-center whitespace-nowrap overflow-visible">
                {(data.length - 1 - index) % every === 0 ? row.label : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
