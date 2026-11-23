// -----------------------------------------------------------
//  [*] ErrorState — a failed query, said out loud
//
//  A query that failed must not look like an empty list
//  (review #7). This is the red box that replaces the data:
//  the translated sentence for the failure and, when the
//  caller can refetch, a retry button.
// -----------------------------------------------------------

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';







// -----------------------------------------------------------
// ErrorState (default export)
// -----------------------------------------------------------
//
// `title` names what failed to load (optional); `onRetry`
// adds the retry button.
//
// Used by:
//   - every page and tab — each query's error branch
// -----------------------------------------------------------

export default function ErrorState({ error, onRetry, title, className = '' }) {

  const t = useTranslations('COMPONENTS.errors');
  const describe = useErrorMessage();


  const action = onRetry
    ? <Button color="inherit" size="small" onClick={() => onRetry()}>{t('retry')}</Button>
    : null;


  return (
    <Alert severity="error" className={className} action={action}>
      {title && <AlertTitle>{title}</AlertTitle>}
      {describe(error)}
    </Alert>
  );
}
