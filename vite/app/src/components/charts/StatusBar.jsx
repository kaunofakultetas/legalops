// -----------------------------------------------------------
//  [*] StatusBar — part-to-whole of a few statuses
//
//  One thin horizontal stacked bar (16 px, square at the
//  start, 4 px rounded at the end, 2 px surface gaps between
//  segments) and a legend under it that carries every value
//  as text — icon + label + count + share — so no number is
//  reachable by hover alone. Each segment is focusable and
//  shows its value in a tooltip on hover and focus. Items
//  with a zero count stay in the legend but draw nothing.
// -----------------------------------------------------------

import Tooltip from '@mui/material/Tooltip';
import { useFormat } from '@/utils/format';







// -----------------------------------------------------------
// StatusBar (default export)
// -----------------------------------------------------------
//
//   <StatusBar label="Išvados pagal būseną" items={[
//     { key: 'met', label: 'Atitinka', value: 40, color, icon }, …]} />
//
// Used by:
//   - pages/Reports/ReportOverview.jsx — findings by status
// -----------------------------------------------------------

export default function StatusBar({ label, items }) {

  const fmt = useFormat();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const drawn = items.filter((item) => item.value > 0);
  const share = (value) => fmt.percent(total ? value / total : 0);


  return (
    <figure className="m-0 flex flex-col gap-3" aria-label={label}>
      {total > 0 && (
        <div className="flex h-4 gap-[2px]">
          {drawn.map((item, index) => (
            <Tooltip key={item.key} title={`${item.label}: ${fmt.number(item.value)} (${share(item.value)})`} describeChild>
              <div
                tabIndex={0}
                role="img"
                aria-label={`${item.label}: ${fmt.number(item.value)} (${share(item.value)})`}
                className={`h-full outline-none focus-visible:ring-2 focus-visible:ring-primary hover:opacity-80 ${index === drawn.length - 1 ? 'rounded-r' : ''}`}
                style={{ width: `${(item.value / total) * 100}%`, minWidth: 4, background: item.color }}
              />
            </Tooltip>
          ))}
        </div>
      )}
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-sm">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
            {item.icon}
            <span>{item.label}</span>
            <span className="font-semibold">{fmt.number(item.value)}</span>
            <span className="text-muted">({share(item.value)})</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
