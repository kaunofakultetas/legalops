// -----------------------------------------------------------
//  [*] ReportScope — approving the list of acts
//
//  A report started with the review stops once the acts that
//  apply are decided (status "scope_review") and waits for a
//  person: the obligations of the approved acts are judged
//  only after that, and that second part is where the money
//  goes. This is the screen of that decision — the banner
//  above the report's tabs and the acts tab of a waiting
//  report: the price panel with the two buttons, then the
//  acts in the groups the run put them in, each with its
//  "assess" switch (ReportActs.jsx).
//
//  POST /api/reports/{id}/scope carries the decision. Its
//  body names only the acts the person decided differently
//  from the run — "assess" takes an act in whatever the
//  verdict said, "skip" leaves an assessed one out; an act
//  not named keeps what the run decided. Without `approved`
//  the call stores nothing and answers the price of the
//  second part for that selection, with the caller's budget:
//  it is asked when the screen opens and again, after a
//  pause, each time a switch moves. With `approved: true` it
//  applies the choices and queues the rest of the run; the
//  answer is the report, which the page then shows running.
//
//  The switches are kept per report in sessionStorage, as
//  their difference from the run's decision, so a look at
//  another tab or a reload does not lose a half-made
//  selection.
//
//  A report started with the assessment of the company's own
//  requirements has that in the price of its second part too
//  (the estimate's `internal`): the panel says how much of
//  the total it is, so the parts add up, and it counts
//  against the caller's budget with the assessment of the
//  acts. It is no act — should the report's acts hold its
//  row, the row gets no switch and is not among the acts
//  counted here.
//
//  Refusals show in the panel, translated: 400
//  NOTHING_TO_ASSESS, 429 BUDGET_EXCEEDED, and 409
//  NOT_WAITING — someone approved or cancelled the report
//  meanwhile — after which the report is read again and the
//  page shows what it has become. Cancelling is the report
//  page's own stop, asked through `onCancel`.
//
//  Split into (root component last):
//
//    PRICE_DELAY    — the pause before a new price is asked
//    isSwitches     — a stored {actId: on} map
//    actKey         — an act's id as the choices name it
//    scopeChoices   — the switches that differ from the run
//    assessedCount  — how many acts a set of choices assesses
//    useScopeReview — the switches, the price, the approval
//    ScopeNotice    — the banner over the tabs (named export)
//    ScopeFigures   — the price of the selection, in words
//    ScopePrice     — the price panel and the two buttons
//    ReportScope    — the approval screen (default export)
// -----------------------------------------------------------

import { useEffect, useId, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { errorInfo, useErrorMessage } from '@/utils/errors';
import useDebounced from '@/hooks/useDebounced';
import useSessionState from '@/hooks/useSessionState';
import ErrorState from '@/components/ErrorState/ErrorState';
import { ActGroups } from '@/pages/Reports/ReportActs';
import { chargedUsd, isAssessed, isInternal, ownEstimate } from '@/pages/Reports/reportUtils';


// The pause after the last switch before the price of the
// new selection is asked — a run of clicks asks once
const PRICE_DELAY = 400;







// -----------------------------------------------------------
// isSwitches
// -----------------------------------------------------------
//
// A stored map of act ids to booleans — the switches the
// person moved away from the run's decision.
//
// Used by:
//   - useScopeReview (below) — useSessionState's check
// -----------------------------------------------------------

function isSwitches(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((flag) => typeof flag === 'boolean');
}







// -----------------------------------------------------------
// actKey
// -----------------------------------------------------------
//
// An act's id as the request names it — a non-empty string
// or a finite number, as text — else null: such an act (a
// malformed answer) is still listed, but cannot be switched.
//
// Used by:
//   - scopeChoices, assessedCount, useScopeReview (below)
// -----------------------------------------------------------

function actKey(act) {
  const id = act?.id;
  return (typeof id === 'string' && id !== '') || Number.isFinite(id) ? String(id) : null;
}







// -----------------------------------------------------------
// scopeChoices
// -----------------------------------------------------------
//
// The request's `acts` map: for every act whose switch stands
// differently from what the run decided, "assess" or "skip",
// in the report's own order. A stored switch of an act the
// report does not hold, or one that agrees with the run, is
// left out — the backend keeps the run's decision for every
// act it is not told about.
//
// Used by:
//   - useScopeReview (below)
// -----------------------------------------------------------

function scopeChoices(acts, switches) {
  const choices = {};
  for (const act of acts) {
    const key = actKey(act);
    if (key === null || !Object.hasOwn(switches, key) || switches[key] === isAssessed(act)) continue;
    choices[key] = switches[key] ? 'assess' : 'skip';
  }
  return choices;
}







// -----------------------------------------------------------
// assessedCount
// -----------------------------------------------------------
//
// How many of the acts the second part would assess under a
// set of choices: an act named there follows its choice,
// every other the run's decision.
//
// Used by:
//   - useScopeReview (below) — the count shown, and whether
//     there is anything to price
// -----------------------------------------------------------

function assessedCount(acts, choices) {
  return acts.filter((act) => {
    const key = actKey(act);
    return key !== null && Object.hasOwn(choices, key) ? choices[key] === 'assess' : isAssessed(act);
  }).length;
}







// -----------------------------------------------------------
// useScopeReview
// -----------------------------------------------------------
//
// Everything the approval screen decides and asks. It holds
// the switches (per report, in sessionStorage) and answers,
// for the cards: an act's state — on or off, and for an act
// switched on what the price says of it (its obligation
// count, or that it is yet to be read) — the way to move a
// switch, and whether the approval is on the wire. For the
// panel: how many acts are switched on, the price query of
// the selection as last asked, whether a newer price is
// still on its way, and the approval mutation.
//
// The price is keyed by the choices as text, taken after
// PRICE_DELAY of quiet: a value that is stable to wait on
// and to cache by, from which the request body is read back.
// Nothing is asked while no act is switched on — there is
// nothing to price. A switch that moves clears the last
// refusal: it was about another selection.
//
// A successful approval puts the answered report in the
// cache and reads it again, so the page turns to the running
// report at once; NOT_WAITING, from the approval or from the
// price, reads it again too.
//
// Used by:
//   - ReportScope (below)
// -----------------------------------------------------------

function useScopeReview(report) {

  const t = useTranslations('PAGES.report.SCOPE');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  // The row of the company's own requirements is no act to decide on
  const acts = useMemo(() => (Array.isArray(report.acts) ? report.acts.filter((act) => !isInternal(act)) : []), [report.acts]);
  const [switches, setSwitches] = useSessionState(`report.${report.id}.scope`, {}, isSwitches);
  const choices = useMemo(() => scopeChoices(acts, switches), [acts, switches]);
  const selected = assessedCount(acts, choices);
  const wanted = JSON.stringify(choices);
  const asked = useDebounced(wanted, PRICE_DELAY);
  const askedChoices = useMemo(() => JSON.parse(asked), [asked]);


  const estimate = useQuery({
    queryKey: ['reportScope', report.id, asked],
    queryFn: async () => {
      const { data } = await api.post(`/api/reports/${report.id}/scope`, { acts: askedChoices }, { silent: true });
      // An answer without an estimate prices nothing — a
      // failed load, shown with its retry
      if (!data?.estimate || typeof data.estimate !== 'object' || Array.isArray(data.estimate)) throw new Error('The scope answer carries no estimate');
      return data;
    },
    enabled: assessedCount(acts, askedChoices) > 0,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    retry: false,
  });


  const approve = useMutation({
    mutationFn: async () => (await api.post(`/api/reports/${report.id}/scope`, { acts: choices, approved: true }, { silent: true })).data,
    onSuccess: (updated) => {
      toast.success(t('approved'));
      if (updated && typeof updated === 'object' && !Array.isArray(updated)) queryClient.setQueryData(['report', report.id], updated);
      return queryClient.invalidateQueries({ queryKey: ['report', report.id] });
    },
    // The panel shows every refusal; this one also takes the
    // screen away (the report is no longer waiting), so it is
    // said in a toast that stays
    onError: (error) => {
      if (errorInfo(error).code !== 'NOT_WAITING') return;
      toast.error(describe(error));
      queryClient.invalidateQueries({ queryKey: ['report', report.id] });
    },
  });


  // The price was refused because the report waits no more
  const refused = estimate.error ? errorInfo(estimate.error).code : null;
  useEffect(() => {
    if (refused === 'NOT_WAITING') queryClient.invalidateQueries({ queryKey: ['report', report.id] });
  }, [refused, queryClient, report.id]);


  // The per-act rows of the price, by act id
  const priced = useMemo(() => {
    const rows = Array.isArray(estimate.data?.estimate?.acts) ? estimate.data.estimate.acts : [];
    return new Map(rows.filter((row) => row && typeof row === 'object').map((row) => [String(row.id), row]));
  }, [estimate.data]);


  const stateOf = (act) => {
    const key = actKey(act);
    if (key === null) return null;
    const on = Object.hasOwn(choices, key) ? choices[key] === 'assess' : isAssessed(act);
    return { on, priced: on ? priced.get(key) ?? null : null };
  };


  // Kept as the difference from the run: a switch put back
  // where the run had it is forgotten
  const toggle = (act, on) => {
    const key = actKey(act);
    if (key === null) return;
    if (approve.error) approve.reset();
    setSwitches((current) => {
      const next = { ...current };
      if (on === isAssessed(act)) delete next[key];
      else next[key] = on;
      return next;
    });
  };


  return { stateOf, toggle, busy: approve.isPending, selected, estimate, pending: wanted !== asked || estimate.isFetching, approve };
}







// -----------------------------------------------------------
// ScopeNotice
// -----------------------------------------------------------
//
// The banner of a waiting report: what happened and what is
// asked of the reader. A state the report is in, not an
// alarm, so it is a status. On any tab but the acts it
// offers the way to the list (`onOpen`).
//
// Used by:
//   - ReportDetail.jsx — above the tabs of a waiting report
// -----------------------------------------------------------

export function ScopeNotice({ onOpen = null }) {
  const t = useTranslations('PAGES.report.SCOPE');
  return (
    <Alert severity="info" role="status" className="mb-4"
           action={onOpen ? <Button color="inherit" size="small" onClick={onOpen}>{t('open')}</Button> : null}>
      <AlertTitle>{t('title')}</AlertTitle>
      {t('text')}
    </Alert>
  );
}







// -----------------------------------------------------------
// ScopeFigures
// -----------------------------------------------------------
//
// What the second part would do and cost for the acts
// switched on. How many they are comes straight from the
// switches, so it is there in every state; beside it, once
// the price landed: the obligations in all and the
// upper-bound price, and under them the one-time reading of
// acts never read as a part of that price (only when there
// is any), the assessment of the company's own requirements
// as another part of it (only for a report started with it,
// in the start dialog's words) and the budget the caller has
// left — with the same note as the start dialog when the
// assessment alone, the company's own requirements included,
// exceeds it (the reading is shared corpus work; a started
// run is never stopped halfway). With nothing switched on it
// says there is nothing to assess; a price that failed says
// so, with a retry — approving stays possible. The figures
// run along a line and wrap, which keeps the panel low while
// it stays in view.
//
// Used by:
//   - ScopePrice (below)
// -----------------------------------------------------------

function ScopeFigures({ review }) {

  const t = useTranslations('PAGES.report.SCOPE');
  const tStart = useTranslations('PAGES.reports.START');
  const fmt = useFormat();
  const { selected, estimate } = review;
  const price = estimate.data?.estimate;
  const remaining = estimate.data?.budget?.remaining;
  const count = <Typography variant="body2">{t('selected', { acts: fmt.number(selected) })}</Typography>;


  if (selected === 0) return <>{count}<Typography variant="body2">{t('nothing')}</Typography></>;
  if (estimate.error) return <>{count}<ErrorState error={estimate.error} onRetry={estimate.refetch} title={t('estimateFailed')} /></>;
  if (!price) return <>{count}<Typography variant="body2" color="text.secondary">{t('estimating')}</Typography></>;
  const own = ownEstimate(price);
  const over = remaining != null && chargedUsd(price) > Number(remaining);
  return (
    <>
      <div className="flex gap-x-6 gap-y-1 flex-wrap">
        {count}
        <Typography variant="body2">{t('obligationsTotal', { obligations: fmt.number(price.obligations) })}</Typography>
        <Typography variant="body2" className="font-semibold">{t('price', { total: fmt.usd(price.totalUsd) })}</Typography>
      </div>
      <div className="flex gap-x-6 gap-y-1 flex-wrap">
        {price.extractionUsd > 0 && (
          <Typography variant="body2" color="text.secondary">{t('reading', { extraction: fmt.usd(price.extractionUsd) })}</Typography>
        )}
        {own?.documents > 0 && (
          <Typography variant="body2" color="text.secondary">
            {tStart('estimateInternal', { usd: fmt.usd(own.usd), documents: fmt.number(own.documents), requirements: fmt.number(own.requirements) })}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {remaining == null ? tStart('budgetUnlimited') : tStart('budgetLeft', { remaining: fmt.usd(remaining) })}
        </Typography>
      </div>
      {over && <Alert severity="warning" role="status" className="mt-1">{tStart('overBudget')}</Alert>}
    </>
  );
}







// -----------------------------------------------------------
// ScopePrice
// -----------------------------------------------------------
//
// The panel above the acts: its title beside the two buttons
// — cancel the analysis, and approve and continue, which is
// off while nothing is switched on — then what the selection
// would do and cost (ScopeFigures), and a refused approval
// said under it. While a newer price is on its way a thin
// bar runs along the panel's lower edge, taking no room, so
// the panel does not jump as prices come and go. On wide
// screens the panel stays in view while the list scrolls
// under it: a switch far down the page shows what it does to
// the price.
//
// Used by:
//   - ReportScope (below)
// -----------------------------------------------------------

function ScopePrice({ review, onCancel }) {

  const t = useTranslations('PAGES.report.SCOPE');
  const describe = useErrorMessage();
  const titleId = useId();
  const { selected, pending, approve } = review;


  return (
    <Paper component="section" aria-labelledby={titleId} className="relative overflow-hidden p-4 flex flex-col gap-2 md:sticky md:top-0 md:z-10">
      <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <Typography id={titleId} variant="h6" component="h2">{t('priceTitle')}</Typography>
        <div className="flex gap-2 flex-wrap">
          <Button color="delete" variant="outlined" disabled={approve.isPending} onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="contained" loading={approve.isPending} disabled={selected === 0} onClick={() => approve.mutate()}>{t('approve')}</Button>
        </div>
      </div>
      <div className="flex flex-col gap-1" aria-live="polite">
        <ScopeFigures review={review} />
      </div>
      {approve.error && <Alert severity="error">{describe(approve.error)}</Alert>}
      {pending && selected > 0 && <LinearProgress aria-label={t('estimating')} className="absolute inset-x-0 bottom-0" />}
    </Paper>
  );
}







// -----------------------------------------------------------
// ReportScope (default export)
// -----------------------------------------------------------
//
// The acts tab of a report that waits for its list of acts
// to be approved: the price panel, then the acts with their
// switches. `onCancel` asks the page to cancel the analysis.
//
// Used by:
//   - ReportDetail.jsx — the acts tab of a waiting report
// -----------------------------------------------------------

export default function ReportScope({ report, onCancel }) {
  const review = useScopeReview(report);
  return (
    <div className="flex flex-col gap-4">
      <ScopePrice review={review} onCancel={onCancel} />
      <ActGroups report={report} review={review} />
    </div>
  );
}
