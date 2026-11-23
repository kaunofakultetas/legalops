// -----------------------------------------------------------
//  [*] FindingReviewDialog — the reviewer's verdict
//
//  PATCH /api/reports/{id}/findings/{fid} with
//  {overrideStatus, reviewerNote, cause}. The model's verdict
//  stays visible; the reviewer either keeps it
//  (overrideStatus null — clears an earlier override) or
//  picks another status, and adds a note. The effective
//  status every view and export shows is the override when
//  present. On success the finding is swapped into the cached
//  report in place (the list keeps its scroll and filters)
//  and the report is re-read in the background: a review
//  withdraws the report's sign-off server-side.
//
//  The cause — why the gap exists — is the one part of a
//  finding only a person writes: the model never does. It is
//  a field of this dialog, saved with the same request, with
//  or without an override beside it. The request names the
//  cause only when the reviewer changed it — a review that
//  leaves it alone sends what it always sent, and the audit
//  trail marks a cause as touched only when it was; an
//  emptied field is sent as null, which clears the cause. The
//  backend keeps at most CAUSE_LIMIT characters, so the field
//  takes no more.
//
//  Split into (root component last):
//
//    NOTE_LIMIT          — the longest note the backend keeps
//    CAUSE_LIMIT         — the longest cause it keeps
//    FindingReviewDialog — the dialog (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import FindingStatusIcon from '@/pages/Reports/FindingStatusIcon';
import { FINDING_STATUSES } from '@/pages/Reports/reportUtils';


// The longest reviewer's note the backend keeps (it cuts a
// longer one silently, so the field stops there)
const NOTE_LIMIT = 4000;

// The longest cause the backend keeps
const CAUSE_LIMIT = 2000;







// -----------------------------------------------------------
// FindingReviewDialog (default export)
// -----------------------------------------------------------
//
// The dialog of one finding's review: the decision, the note
// and the cause, loaded from the finding each time another
// one opens and saved together. `onExited` tells the page the
// close animation ended, so it can let the finding go.
//
// Used by:
//   - ReportDetail.jsx — opened from a finding's "Peržiūrėti"
// -----------------------------------------------------------

export default function FindingReviewDialog({ reportId, finding, open, onClose, onExited }) {

  const t = useTranslations('PAGES.report.REVIEW');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState('');
  const [note, setNote] = useState('');
  const [cause, setCause] = useState('');
  const [loadedFor, setLoadedFor] = useState(null);


  // Opening another finding loads its current review
  if (finding && loadedFor !== finding.id) {
    setLoadedFor(finding.id);
    setDecision(finding.overrideStatus || '');
    setNote(finding.reviewerNote || '');
    setCause(finding.cause || '');
  }


  // The cause as it would be stored, and whether that differs
  // from what the finding holds
  const written = cause.trim();
  const causeChanged = written !== (finding?.cause || '');


  const save = useMutation({
    mutationFn: async () => (await api.patch(`/api/reports/${reportId}/findings/${finding.id}`,
      { overrideStatus: decision || null, reviewerNote: note, ...(causeChanged ? { cause: written || null } : {}) }, { silent: true })).data,
    onSuccess: (updated) => {
      queryClient.setQueryData(['report', reportId], (report) => (report
        ? { ...report, findings: report.findings.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)) }
        : report));
      // The server withdraws a sign-off on any review — the
      // report's approval state must be re-read
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      toast.success(t('saved'));
      onClose();
    },
  });


  const exited = () => { setLoadedFor(null); save.reset(); onExited?.(); };


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={() => save.mutate()} onExited={exited} busy={save.isPending}
                    error={save.error ? describe(save.error) : null} title={t('title')} confirmLabel={t('save')} maxWidth="md">
      {finding && (
        <div className="flex flex-col gap-4 pt-1">
          <Typography className="font-semibold">{finding.obligationTitle}</Typography>
          <div className="flex items-center gap-2 flex-wrap">
            <Typography variant="body2" color="text.secondary">{t('model')}:</Typography>
            <StatusChip kind="finding" value={finding.status} label={label('findingStatus', finding.status)}
                        icon={<FindingStatusIcon status={finding.status} />} />
          </div>
          <FormControl>
            <FormLabel>{t('decision')}</FormLabel>
            <RadioGroup value={decision} onChange={(e) => setDecision(e.target.value)}>
              <FormControlLabel value="" control={<Radio />} label={t('keepModel')} />
              {FINDING_STATUSES.map((status) => (
                <FormControlLabel key={status} value={status} control={<Radio />}
                                  label={<span className="inline-flex items-center gap-1"><FindingStatusIcon status={status} fontSize="small" />{label('findingStatus', status)}</span>} />
              ))}
            </RadioGroup>
          </FormControl>
          <TextField label={t('note')} value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_LIMIT))} multiline minRows={3}
                     helperText={t('noteHint')} autoFocus />
          <TextField label={t('cause')} value={cause} onChange={(e) => setCause(e.target.value.slice(0, CAUSE_LIMIT))} multiline minRows={2}
                     helperText={t('causeHint')} />
        </div>
      )}
    </UniversalModal>
  );
}
