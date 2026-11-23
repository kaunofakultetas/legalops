// -----------------------------------------------------------
//  [*] ReportApproval — the reviewer's sign-off
//
//  PATCH /api/reports/{id} {approved: true, note?} stamps who
//  approved the finished report and when; {approved: false}
//  withdraws it. Any later finding override withdraws the
//  approval on the server (a changed verdict needs a fresh
//  sign-off), which is why the review dialog refetches the
//  report. The report carries only the approver's id: the
//  name is the caller's own, or — for admins — looked up in
//  the user directory; otherwise the date alone is shown.
//
//  A sign-off is also the one event that moves the company's
//  action register: the report's plan comes in, and the
//  actions already there are checked against its findings.
//  The dialog says so before the button, and the answer's
//  `register` — how many actions came in, how much of the
//  plan was left out because an action already covers it,
//  how many obligations were confirmed met, how many earlier
//  actions were closed or sent back to work — is told in
//  words in the success toast, with the way to the company's
//  register; when every number is zero the toast says the
//  register did not change. A withdrawal takes back what
//  that sign-off confirmed and says how many actions it
//  changed, when any. An answer without `register` (a
//  backend from before the register) toasts as it always did.
//
//  Two pieces: the "approve" button (the page header) while
//  the report is not approved, and the green banner with
//  "withdraw" once it is — a state, so role="status", not
//  the urgent alert role.
//
//  Split into (root component last):
//
//    REGISTER_PARTS  — what a sign-off can do to the register
//    LINK_TOAST_MS   — how long a toast with a link stays
//    registerSummary — a sign-off's `register`, in words
//    useSignOff      — the PATCH as a mutation
//    useApproverName — the report's approver → a display name or null
//    ApproveButton   — the button + note dialog (named export)
//    ReportApproval  — the approved banner (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { companyActionsPath } from '@/paths';
import { actionKeys } from '@/pages/Companies/actionRegister';


// What a sign-off can do to the register, in the order it is
// told: its own plan first, then the earlier actions
const REGISTER_PARTS = ['added', 'covered', 'confirmed', 'closed', 'reopened'];

// A toast that carries a link stays long enough to reach it
const LINK_TOAST_MS = 8000;







// -----------------------------------------------------------
// registerSummary
// -----------------------------------------------------------
//
// What a sign-off did to the company's action register, as
// one sentence: the parts of the answer's `register` that are
// not zero, each with its number, in the order of
// REGISTER_PARTS — or that the register did not change when
// all are zero. Nothing when the answer carries no
// `register`.
//
// Used by:
//   - useSignOff (below)
// -----------------------------------------------------------

function registerSummary(register, t) {
  if (!register || typeof register !== 'object') return null;
  const count = (key) => (Number.isFinite(Number(register[key])) ? Number(register[key]) : 0);
  // Spelled out per part: the message guard checks literal
  // keys only
  const words = {
    added: t('REGISTER.added', { count: count('added') }),
    covered: t('REGISTER.covered', { count: count('covered') }),
    confirmed: t('REGISTER.confirmed', { count: count('confirmed') }),
    closed: t('REGISTER.closed', { count: count('closed') }),
    reopened: t('REGISTER.reopened', { count: count('reopened') }),
  };
  const told = REGISTER_PARTS.filter((key) => count(key) > 0).map((key) => words[key]).join('; ');
  return told ? `${told.charAt(0).toUpperCase()}${told.slice(1)}.` : t('REGISTER.unchanged');
}







// -----------------------------------------------------------
// useSignOff
// -----------------------------------------------------------
//
// The sign-off and its withdrawal as one mutation, fed the
// PATCH body. It swaps the answered report into the cache,
// refreshes the lists and the company's action register —
// both moved it — and toasts what happened: the approval
// with what it did to the register and the link to it, the
// withdrawal with how many actions it changed.
//
// Used by:
//   - ApproveButton, ReportApproval (below)
// -----------------------------------------------------------

function useSignOff(report, onDone) {
  const t = useTranslations('PAGES.report.APPROVAL');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.patch(`/api/reports/${report.id}`, body, { silent: true })).data,
    onSuccess: (updated, body) => {
      queryClient.setQueryData(['report', report.id], updated);
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: actionKeys.company(report.companyId) });
      const moved = updated?.register;
      const summary = body.approved ? registerSummary(moved, t) : null;
      const withdrawn = body.approved ? 0 : Number(moved?.withdrawn) || 0;
      if (summary) {
        toast.success((
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{t('approved')}</span>
            <span>{summary} <Link to={companyActionsPath(report.companyId)} className="text-primary">{t('REGISTER.open')}</Link></span>
          </span>
        ), { duration: LINK_TOAST_MS });
      } else if (withdrawn > 0) {
        toast.success(<span className="flex flex-col gap-0.5"><span className="font-semibold">{t('withdrawn')}</span><span>{t('REGISTER.withdrawn', { count: withdrawn })}</span></span>);
      } else {
        toast.success(body.approved ? t('approved') : t('withdrawn'));
      }
      onDone();
    },
  });
}







// -----------------------------------------------------------
// useApproverName
// -----------------------------------------------------------
//
// The approver's display name: the report's own
// approvedByName, else the caller's own name, else (an admin,
// an older report) from GET /api/users.
//
// Used by:
//   - ReportApproval (below)
// -----------------------------------------------------------

function useApproverName(report, authData) {
  const { approvedBy, approvedByName } = report;
  const isAdmin = authData.role === 'admin';
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/api/users')).data.users,
    enabled: Boolean(approvedBy) && !approvedByName && isAdmin && approvedBy !== authData.id,
  });
  if (!approvedBy) return null;
  if (approvedByName) return approvedByName;
  if (approvedBy === authData.id) return authData.displayName;
  return users?.find((u) => u.id === approvedBy)?.displayName ?? null;
}







// -----------------------------------------------------------
// ApproveButton
// -----------------------------------------------------------
//
// "Approve the report" and its dialog with an optional note
// and, before the button, the line saying what the sign-off
// does to the company's action register.
//
// Used by:
//   - ReportDetail.jsx — the header of a finished, unapproved
//     report
// -----------------------------------------------------------

export function ApproveButton({ report }) {

  const t = useTranslations('PAGES.report.APPROVAL');
  const describe = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const sign = useSignOff(report, () => setOpen(false));


  return (
    <>
      <Button variant="contained" startIcon={<VerifiedOutlinedIcon />} onClick={() => { sign.reset(); setNote(''); setOpen(true); }}>
        {t('approve')}
      </Button>
      <UniversalModal open={open} onClose={() => setOpen(false)} onSubmit={() => sign.mutate({ approved: true, note })} busy={sign.isPending}
                      error={sign.error ? describe(sign.error) : null} title={t('title')} confirmLabel={t('approve')}>
        <div className="flex flex-col gap-3 pt-1">
          <Typography>{t('text')}</Typography>
          <TextField label={t('note')} value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} multiline minRows={2} autoFocus />
          <Typography variant="body2" color="text.secondary">{t('registerNote')}</Typography>
        </div>
      </UniversalModal>
    </>
  );
}







// -----------------------------------------------------------
// ReportApproval (default export)
// -----------------------------------------------------------
//
// The green "approved by … on …" banner with the note and
// "withdraw" (confirmed); nothing while unapproved.
//
// Used by:
//   - ReportDetail.jsx — above the tabs of a finished report
// -----------------------------------------------------------

export default function ReportApproval({ report, authData }) {

  const t = useTranslations('PAGES.report.APPROVAL');
  const fmt = useFormat();
  const describe = useErrorMessage();
  const name = useApproverName(report, authData);
  const [confirm, setConfirm] = useState(false);
  const sign = useSignOff(report, () => setConfirm(false));


  if (!report.approvedAt) return null;
  return (
    <>
      <Alert severity="success" role="status" icon={<VerifiedOutlinedIcon />} className="mb-4">
        <div className="font-semibold">
          {name ? t('approvedBy', { name, date: fmt.dateTime(report.approvedAt) }) : t('approvedAt', { date: fmt.dateTime(report.approvedAt) })}
        </div>
        {report.approvalNote && <div className="whitespace-pre-wrap">{report.approvalNote}</div>}
        <div className="mt-2">
          <Button color="inherit" size="small" variant="outlined" onClick={() => { sign.reset(); setConfirm(true); }}>{t('withdraw')}</Button>
        </div>
      </Alert>
      <UniversalModal open={confirm} onClose={() => setConfirm(false)} onConfirm={() => sign.mutate({ approved: false })} busy={sign.isPending} danger
                      error={sign.error ? describe(sign.error) : null} title={t('withdrawTitle')} confirmLabel={t('withdraw')}>
        <Typography>{t('withdrawText')}</Typography>
      </UniversalModal>
    </>
  );
}
