// -----------------------------------------------------------
//  [*] EditBar — the unsaved edits of a draft
//
//  Edits of a draft stay in the page until the person saves
//  them. While there are any, this bar sticks to the bottom
//  of the scrolling area, the way the company profile's
//  does: it says the draft has unsaved changes and offers the
//  two ways out — discard them, or save them, which sends the
//  whole content to the backend and shows what it answers. A
//  refused save is said in the bar, in the programme's words.
// -----------------------------------------------------------

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// EditBar (default export)
// -----------------------------------------------------------
//
// The bar of a draft with unsaved edits; `error` is the
// sentence of a refused save, shown above the buttons.
//
// Used by:
//   - ProductPage.jsx — under the content of a dirty draft
// -----------------------------------------------------------

export default function EditBar({ busy, error, onDiscard, onSave }) {
  const t = useTranslations('PAGES.programme');
  return (
    <Paper elevation={6} className="sticky bottom-0 z-10 mt-4 p-3 flex flex-col gap-2" role="region" aria-label={t('unsaved')}>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Typography variant="body2" className="font-semibold">{t('unsaved')}</Typography>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onDiscard} disabled={busy}>{t('discard')}</Button>
          <Button variant="contained" onClick={onSave} loading={busy}>{t('save')}</Button>
        </div>
      </div>
    </Paper>
  );
}
