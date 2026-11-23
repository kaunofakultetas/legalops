// -----------------------------------------------------------
//  [*] NotFound — the "*" route and the admin-only refusal
//
//  Rendered inside the normal frame (navbar + sidebar stay,
//  so the user is never stranded): an unknown path shows
//  "page not found", and an admin page opened by a user
//  shows "access restricted" (PageWrapper passes
//  forbidden). Both offer the way home.
//
//  Split into (root component last):
//
//    NotFound — the page (default export)
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useTranslations } from '@/i18n';
import PageLayout from '@/components/layout/PageLayout';







// -----------------------------------------------------------
// NotFound (default export)
// -----------------------------------------------------------
//
// `forbidden` switches the texts and the icon.
//
// Used by:
//   - router.jsx — the "*" route
//   - PageWrapper.jsx — an admin-only page for a user
// -----------------------------------------------------------

export default function NotFound({ authData, forbidden = false }) {

  const t = useTranslations('PAGES.notFound');
  const Icon = forbidden ? LockOutlinedIcon : SearchOffOutlinedIcon;


  return (
    <PageLayout authData={authData} title={forbidden ? t('FORBIDDEN_TITLE') : t('TITLE')}>
      <Paper className="p-6 max-w-xl flex flex-col gap-3 items-start">
        <Icon color="action" sx={{ fontSize: 40 }} aria-hidden />
        <Typography>{forbidden ? t('forbiddenText') : t('text')}</Typography>
        <div className="flex gap-2 flex-wrap">
          <Button variant="contained" component={Link} to="/">{t('home')}</Button>
          <Button component={Link} to="/dashboard">{t('dashboard')}</Button>
        </div>
      </Paper>
    </PageLayout>
  );
}
