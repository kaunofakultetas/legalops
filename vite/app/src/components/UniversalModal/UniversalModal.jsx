// -----------------------------------------------------------
//  [*] UniversalModal — the one dialog shape
//
//  Title, body, cancel + confirm buttons. Two modes:
//
//    - confirmation (onConfirm) — a plain button row
//    - form (onSubmit) — the dialog paper IS a <form>, so
//      Enter in a field submits and the confirm button is
//      type="submit"; validation stays with the caller
//      (noValidate: the browser's own bubbles would speak the
//      browser's language, not the UI's)
//
//  `busy` disables the buttons while a mutation runs (and
//  blocks closing), `danger` paints the confirm button with
//  the delete palette, `error` shows an inline alert above
//  the buttons, and `onExited` fires after the close
//  animation — the moment to clear the form, so the fields
//  never visibly blank out while the dialog fades. Without
//  onConfirm/onSubmit only the cancel button shows.
//
//  A confirm runs once per intent. `busy` only disables the
//  button after the caller's mutation has re-rendered, which
//  can come after the second click of a double click, so the
//  extra clicks of one burst are dropped on the spot
//  (MouseEvent.detail counts them; keyboard activation is 0).
//  A dialog that is closing — its buttons stay live through
//  the fade-out — confirms nothing either. An async
//  onConfirm / onSubmit that rejects is the caller's to
//  show (its mutation error); the rejection is caught here
//  so it never surfaces as an unhandled one.
//
//  Screen readers get the title as the dialog's name and, for
//  a confirmation, the body as its description — the question
//  is read out with the title when the dialog opens. A form
//  (its fields carry their own labels) and a read-only
//  details dialog (structured content, read in order) are not
//  described. `role="alertdialog"` marks a dialog that
//  interrupts the user's own intent (UnsavedChangesDialog).
//
//  Split into (root component last):
//
//    catchRejection — swallow a handler's rejected promise
//    UniversalModal — the dialog (default export)
// -----------------------------------------------------------

import { useId } from 'react';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// catchRejection
// -----------------------------------------------------------
//
// A handler's result, with a rejected promise caught: the
// caller shows its own failure (the mutation's error in the
// dialog), the modal only keeps it from becoming an
// unhandled rejection. Anything else passes untouched.
//
// Used by:
//   - UniversalModal (below) — onConfirm, onSubmit
// -----------------------------------------------------------

function catchRejection(result) {
  if (result && typeof result.then === 'function') result.then(undefined, () => {});
}







// -----------------------------------------------------------
// UniversalModal (default export)
// -----------------------------------------------------------
//
//   <UniversalModal open onClose onConfirm title>…</UniversalModal>
//   <UniversalModal open onClose onSubmit onExited error busy>
//     …fields…
//   </UniversalModal>
//
// Wide dialogs (maxWidth md and up) go full-screen on phones.
// `role` is "dialog" unless the caller asks for
// "alertdialog".
//
// Used by:
//   - every page's create / edit forms and delete / cancel
//     confirmations: Users, Account, Audit, Usage, Companies
//     (+ CompanyDetail, CompanyCredentials, CompanyDocuments,
//     CompanyRoles), Corpus (+ CorpusDocument, AddActDialog,
//     ActMetadataDialog), Obligations (ObligationsPanel,
//     ObligationDialog), Prompts (PromptEditor,
//     PromptVersions), Reports (ReportDetail, ReportApproval,
//     StartAnalysisDialog, FindingReviewDialog), MCP
//     (McpServers, McpServerDialog), Chat (Chat, Composer,
//     ThreadList)
//   - UnsavedChangesDialog.jsx
// -----------------------------------------------------------

export default function UniversalModal({
  open, onClose, onConfirm, onSubmit, onExited, title, children, confirmLabel, cancelLabel,
  busy = false, danger = false, maxWidth = 'sm', error = null, confirmDisabled = false, role = 'dialog',
}) {

  const t = useTranslations('COMPONENTS.universalModal');
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const bodyId = useId();
  const isForm = Boolean(onSubmit);
  // A confirmation's body is the question it asks (see the
  // header) — the dialog's description
  const describedBy = onConfirm && !isForm ? bodyId : undefined;


  const submit = (event) => {
    event.preventDefault();
    if (open && !busy) catchRejection(onSubmit(event));
  };


  // The 2nd, 3rd… click of one burst does nothing — in a form
  // the click's default action IS the submit, so it is
  // cancelled there
  const confirmClick = (event) => {
    if (event.detail > 1) {
      event.preventDefault();
      return;
    }
    if (!isForm && open && !busy) catchRejection(onConfirm(event));
  };


  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      role={role}
      aria-describedby={describedBy}
      fullWidth
      maxWidth={maxWidth}
      fullScreen={phone && ['md', 'lg', 'xl'].includes(maxWidth)}
      slotProps={{
        transition: { onExited },
        paper: isForm ? { component: 'form', onSubmit: submit, noValidate: true } : undefined,
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent id={bodyId} dividers>
        {children}
        {error && <Alert severity="error" className="mt-4">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{cancelLabel || t('cancel')}</Button>
        {(onConfirm || isForm) && (
          <Button
            type={isForm ? 'submit' : 'button'}
            onClick={confirmClick}
            variant="contained"
            color={danger ? 'delete' : 'primary'}
            disabled={confirmDisabled}
            loading={busy}
          >
            {confirmLabel || t('confirm')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
