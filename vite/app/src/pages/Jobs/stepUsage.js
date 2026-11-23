// -----------------------------------------------------------
//  [*] stepUsage — what a job step's model calls used
//
//  When a step ends, done or failed, the runner fills its
//  usage from the step's own model calls (jobs/runner.py
//  _usage_from_calls): {calls, inputTokens, outputTokens,
//  costUsd, models: [{model, calls, inputTokens,
//  outputTokens, costUsd}] — most calls first}, and its
//  `model` with the most-used one. A step still running, or
//  one that made no model call, has usage {}.
//
//  These read it defensively — anything that is not a step
//  with at least one call (a malformed answer included) is
//  no usage — and sum a job's steps, so the job drawer and
//  the report's progress card print the same numbers.
//
//  Split into:
//
//    stepUsage — one step's usage, or null
//    jobUsage  — the steps' usage summed, or null
// -----------------------------------------------------------







// -----------------------------------------------------------
// stepUsage
// -----------------------------------------------------------
//
//   stepUsage(step) → {calls, inputTokens, outputTokens,
//                      costUsd, models: [{model, calls}]}
//                     | null
//
// null unless usage.calls is a number above zero; any other
// count that is not a number reads as 0, and a models entry
// without a model name is left out.
//
// Used by:
//   - Jobs.jsx — StepUsage, one step's line
//   - jobUsage (below)
//   - pages/Reports/ReportProgress.jsx — a step's model and cost
// -----------------------------------------------------------

export function stepUsage(step) {
  const usage = step && typeof step === 'object' ? step.usage : null;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const calls = Number(usage.calls);
  if (usage.calls == null || !Number.isFinite(calls) || calls <= 0) return null;
  const count = (value) => (value != null && Number.isFinite(Number(value)) ? Number(value) : 0);
  const models = (Array.isArray(usage.models) ? usage.models : [])
    .filter((entry) => entry && typeof entry === 'object' && ['string', 'number'].includes(typeof entry.model) && entry.model !== '')
    .map((entry) => ({ model: String(entry.model), calls: count(entry.calls) }));
  return { calls, inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens), costUsd: count(usage.costUsd), models };
}







// -----------------------------------------------------------
// jobUsage
// -----------------------------------------------------------
//
//   jobUsage(job.steps) → {calls, inputTokens, outputTokens,
//                          costUsd} | null
//
// The job's total: the steps that recorded calls, summed —
// null when none did (nothing to say). Every attempt of a
// retried job counts: each paid for its calls.
//
// Used by:
//   - Jobs.jsx — DrawerBody, the job's total
//   - pages/Reports/ReportProgress.jsx — the cost so far
// -----------------------------------------------------------

export function jobUsage(steps) {
  const used = (Array.isArray(steps) ? steps : []).map(stepUsage).filter(Boolean);
  if (used.length === 0) return null;
  const sum = (key) => used.reduce((total, usage) => total + usage[key], 0);
  return { calls: sum('calls'), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), costUsd: sum('costUsd') };
}
