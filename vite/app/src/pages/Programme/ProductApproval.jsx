// -----------------------------------------------------------
//  [*] ProductApproval — a person's approval of a product
//
//  The system never approves a work product itself: PATCH
//  /api/programme/{id} {approved: true, note?} is a person's
//  act, and the backend takes it only from a draft that
//  breaks no blocking rule of its kind. Approval freezes the
//  product — there is no withdrawing it; a change afterwards
//  is a new version.
//
//  Two pieces. The "approve" button of the page header, with
//  the dialog that says what approving means and takes an
//  optional note; while something stands in the way — a
//  blocking rule is broken, or the draft has unsaved edits
//  the server has not checked — the button is off and says
//  why (the sentence is the button's description, so a
//  keyboard and a screen reader get it too). And the notice
//  of an approved product: who approved it and when, with
//  the note — a state, so role="status", not an alarm.
//
//  Split into (root component last):
//
//    ApproveButton   — the button and its dialog (named export)
//    ProductApproval — the approved notice (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import toast from '@/utils/toast';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { approveProduct, programmeKeys } from '@/pages/Programme/programmeApi';
import useRefusal from '@/pages/Programme/useRefusal';







// -----------------------------------------------------------
// ApproveButton
// -----------------------------------------------------------
//
// "Approve" and its dialog with the optional note. `blocked`
// is the sentence saying why the draft cannot be approved
// right now, or nothing when it can. An approval the backend
// refuses all the same is said inside the dialog. On success
// the approved product replaces the draft in the cache and
// the company's list is read again.
//
// Used by:
//   - ProductPage.jsx — the header of a draft
// -----------------------------------------------------------

export function ApproveButton({ product, blocked = null }) {

  const t = useTranslations('PAGES.programme.APPROVAL');
  const refusal = useRefusal();
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');


  const approve = useMutation({
    mutationFn: () => approveProduct(product.id, note),
    onSuccess: (approved) => {
      queryClient.setQueryData(programmeKeys.product(product.id), (current) => ({ ...current, ...approved }));
      queryClient.invalidateQueries({ queryKey: programmeKeys.company(product.companyId) });
      toast.success(t('approved'));
      setOpen(false);
    },
  });


  return (
    <>
      <Tooltip title={blocked ?? ''}>
        <span className="inline-flex">
          <Button variant="contained" startIcon={<VerifiedOutlinedIcon />} disabled={Boolean(blocked)} aria-describedby={blocked ? reasonId : undefined}
                  onClick={() => { approve.reset(); setNote(''); setOpen(true); }}>
            {t('approve')}
          </Button>
        </span>
      </Tooltip>
      {blocked && <span id={reasonId} className="sr-only">{blocked}</span>}
      <UniversalModal open={open} onClose={() => setOpen(false)} onSubmit={() => approve.mutate()} busy={approve.isPending}
                      error={approve.error ? refusal(approve.error) : null} title={t('title')} confirmLabel={t('approve')}>
        <div className="flex flex-col gap-3 pt-1">
          <Typography>{t('text')}</Typography>
          <TextField label={t('note')} value={note} onChange={(event) => setNote(event.target.value.slice(0, 2000))} multiline minRows={2} autoFocus />
        </div>
      </UniversalModal>
    </>
  );
}







// -----------------------------------------------------------
// ProductApproval (default export)
// -----------------------------------------------------------
//
// The notice of an approved product: who approved it and
// when (the date alone when the name is not known), and the
// approver's note with its line breaks kept. Nothing for a
// product that is not approved.
//
// Used by:
//   - ProductPage.jsx — above the tabs
// -----------------------------------------------------------

export default function ProductApproval({ product }) {

  const t = useTranslations('PAGES.programme.APPROVAL');
  const fmt = useFormat();


  if (product.status !== 'approved') return null;
  const date = fmt.dateTime(product.approvedAt);
  return (
    <Alert severity="success" role="status" icon={<VerifiedOutlinedIcon />} className="mb-4">
      <div className="font-semibold">
        {product.approvedByName ? t('approvedBy', { name: product.approvedByName, date }) : t('approvedAt', { date })}
      </div>
      {product.approvalNote && <div className="whitespace-pre-wrap">{product.approvalNote}</div>}
    </Alert>
  );
}
