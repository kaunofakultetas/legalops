// -----------------------------------------------------------
//  [*] Meter — a ratio against a limit
//
//  The daily AI budget: used / limit as a thin bar. The fill
//  carries severity (accent below 80 %, warning from 80 %,
//  critical from the limit on — at exactly 100 % the budget
//  is spent: the backend refuses the next call once nothing
//  remains) and the state is also written out with an icon —
//  never colour alone. The unfilled track is a lighter step
//  of the accent ramp. A null (or 0) limit means unlimited:
//  the bar is replaced by the word.
// -----------------------------------------------------------

import Typography from '@mui/material/Typography';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useTranslations } from '@/i18n';
import { METER_TRACK, SERIES, STATUS } from '@/components/charts/chartTokens';







// -----------------------------------------------------------
// Meter (default export)
// -----------------------------------------------------------
//
//   <Meter label="Šiandien" value={used} limit={limit}
//          format={(n) => fmt.tokens(n)} />
//
// Used by:
//   - Dashboard.jsx — the budget card
//   - pages/Usage/Usage.jsx — today's budget
// -----------------------------------------------------------

export default function Meter({ label, value, limit, format = String }) {

  const t = useTranslations('COMPONENTS.charts');
  const unlimited = !limit;
  const ratio = unlimited ? 0 : value / limit;
  const state = ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : 'ok';
  const fill = state === 'critical' ? STATUS.critical : state === 'warning' ? STATUS.warning : SERIES[0];
  const percent = Math.round(Math.min(ratio, 1) * 100);


  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="body2" className="font-semibold">
          {unlimited ? `${format(value)} · ${t('unlimited')}` : t('of', { value: format(value), limit: format(limit) })}
        </Typography>
      </div>
      {!unlimited && (
        <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(value, limit)}
             aria-valuetext={t('of', { value: format(value), limit: format(limit) })}
             className="h-2 rounded-full overflow-hidden" style={{ background: METER_TRACK }}>
          <div className="h-full rounded-full" style={{ width: `${percent}%`, background: fill }} />
        </div>
      )}
      {state !== 'ok' && !unlimited && (
        <Typography variant="caption" className="flex items-center gap-1" color="text.secondary">
          {state === 'critical' ? <ErrorOutlineIcon sx={{ fontSize: 16, color: STATUS.critical }} aria-hidden /> : <WarningAmberOutlinedIcon sx={{ fontSize: 16, color: '#b07800' }} aria-hidden />}
          {state === 'warning' ? t('nearLimit') : ratio > 1 ? t('overLimit') : t('atLimit')}
        </Typography>
      )}
    </div>
  );
}
