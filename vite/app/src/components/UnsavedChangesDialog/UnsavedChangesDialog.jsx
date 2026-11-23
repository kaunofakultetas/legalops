// -----------------------------------------------------------
//  [*] UnsavedChangesDialog — "leave without saving?"
//
//  Renders while a router blocker (useUnsavedChanges) holds
//  a navigation away from a dirty form: stay (reset the
//  blocker) or leave (proceed with the navigation).
//
//  It is an alertdialog, not a plain dialog: it interrupts
//  the user's own navigation and needs an answer before
//  anything else happens. A screen reader reads its title
//  and its question (the body, UniversalModal's description
//  of a confirmation) as it opens.
// -----------------------------------------------------------

import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import UniversalModal from '@/components/UniversalModal/UniversalModal';







// -----------------------------------------------------------
// UnsavedChangesDialog (default export)
// -----------------------------------------------------------
//
//   <UnsavedChangesDialog blocker={useUnsavedChanges(dirty)} />
//
// Open while the blocker is "blocked"; Stay (and Escape, and
// the backdrop) resets it, "Leave without saving" proceeds.
//
// Used by:
//   - CompanyProfile.jsx, PromptEditor.jsx
// -----------------------------------------------------------

export default function UnsavedChangesDialog({ blocker }) {
  const t = useTranslations('COMPONENTS.common');
  return (
    <UniversalModal
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
      role="alertdialog"
      title={t('unsavedTitle')}
      confirmLabel={t('unsavedLeave')}
      cancelLabel={t('unsavedStay')}
      danger
    >
      <Typography>{t('unsavedText')}</Typography>
    </UniversalModal>
  );
}
