// -----------------------------------------------------------
//  [*] ShowMore — the next page of a long report list
//
//  A report's long lists — one act's findings (a demo run has
//  700), the citation audit's references — render PAGE_SIZE
//  rows at first: hundreds of cards mounted at once made every
//  keystroke in the filter wait for the whole list. The button
//  reveals the next page; the list's useRevealFocus then moves
//  the keyboard focus to the first row it revealed, so a
//  keyboard user carries on where the new rows begin — the
//  button moved down, or vanished with the last page.
//
//  Split into (root component last):
//
//    PAGE_SIZE — rows per page
//    ShowMore  — the button (default export)
// -----------------------------------------------------------

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// PAGE_SIZE
// -----------------------------------------------------------
//
// Rows a list shows before "Show more" — and how many each
// click adds.
//
// Used by:
//   - ShowMore (below)
//   - ReportFindings.jsx — each group's first page
//   - ReportCitations.jsx — the list's first page
// -----------------------------------------------------------

export const PAGE_SIZE = 50;







// -----------------------------------------------------------
// ShowMore (default export)
// -----------------------------------------------------------
//
//   <ShowMore shown={50} total={180} onMore={() => …} />
//
// "Show 50 more" (fewer on the last page) with how many of
// the list are shown; nothing once every row is.
//
// Used by:
//   - ReportFindings.jsx — FindingGroup
//   - ReportCitations.jsx — the list
// -----------------------------------------------------------

export default function ShowMore({ shown, total, onMore }) {
  const t = useTranslations('PAGES.report.SHOW_MORE');
  if (total <= shown) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button size="small" variant="outlined" onClick={onMore}>{t('button', { count: Math.min(PAGE_SIZE, total - shown) })}</Button>
      <Typography variant="caption" color="text.secondary">{t('shown', { shown, total })}</Typography>
    </div>
  );
}
