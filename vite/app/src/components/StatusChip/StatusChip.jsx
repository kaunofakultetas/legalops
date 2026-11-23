// -----------------------------------------------------------
//  [*] StatusChip — a coloured pill for enum states
//
//  The colour follows the value, the TEXT carries the
//  meaning (the caller passes the translated label), so the
//  state never depends on colour alone. Values that mean
//  different things in different enums ("high" severity vs
//  "high" effort) pick their table with `kind`; the flat
//  table covers job/report statuses, account states and
//  roles. Unknown values render neutral. A critical severity
//  is filled so it stands out in a long list. What the judge
//  of the obligations made of one (`verification`) is quiet
//  when the obligation is supported or was never checked, and
//  wears the attention tones for the two doubts. A work
//  product of a compliance programme (`product`) is ink while
//  it is a draft — the state a person works in — and green
//  only once a person approved it. An action of a company's
//  register (`action`) wears the warning tone while it is
//  late, ink once its owner calls it done — it then waits for
//  the re-test — and green only when it is closed.
// -----------------------------------------------------------

import Chip from '@mui/material/Chip';


// value → MUI Chip colour; unknown values fall to 'default'.
// A report waiting for its list of acts to be approved
// (scope_review) wears the warning tone: it is the one status
// that waits for a person
const COLORS = {
  queued: 'default',
  running: 'info',
  scope_review: 'warning',
  done: 'success',
  failed: 'error',
  cancelled: 'warning',
  skipped: 'default',
  active: 'success',
  inactive: 'default',
  admin: 'primary',
  user: 'default',
};

// kind → its own value → colour table
const KIND_COLORS = {
  severity: { critical: 'error', high: 'error', medium: 'warning', low: 'info' },
  finding: { met: 'success', partial: 'warning', missing: 'error', unknown: 'default', not_applicable: 'default' },
  applicability: { applies: 'primary', uncertain: 'warning', not_applies: 'default' },
  obligation: { proposed: 'warning', approved: 'success', rejected: 'default' },
  verification: { supported: 'default', partly: 'warning', unsupported: 'error', unchecked: 'default' },
  credential: { claimed: 'warning', verified: 'success' },
  standard: { certified: 'success', implementing: 'info', planned: 'default' },
  extraction: { pending: 'default', done: 'success', empty: 'warning', failed: 'error' },
  version: { pending: 'default', parsing: 'info', embedding: 'info', ready: 'success', failed: 'error' },
  docStatus: { in_force: 'success', not_yet_applicable: 'info', repealed: 'default' },
  outcome: {
    ok: 'success', error: 'error', aborted: 'warning', stopped: 'warning', interrupted: 'warning', timeout: 'error',
    budget: 'error', 'step-limit': 'warning', empty: 'warning', length: 'warning', 'content-filter': 'error',
  },
  source: { default: 'default', user: 'primary' },
  citation: { found: 'success', not_found: 'error', act_not_in_corpus: 'warning' },
  headingMatch: { match: 'success', mismatch: 'error', unknown: 'default' },
  citationVerdict: { match: 'success', mismatch: 'error', not_found: 'error', act_not_in_corpus: 'warning', unknown: 'default' },
  product: { none: 'default', queued: 'default', running: 'info', draft: 'primary', approved: 'success', failed: 'error', cancelled: 'warning' },
  action: { open: 'default', in_progress: 'info', late: 'warning', done: 'primary', closed: 'success' },
};

// The table's OWN entry only — a value like "constructor"
// would otherwise read Object.prototype and hand MUI a
// function as the colour (a render crash)
const own = (table, key) => (table && Object.hasOwn(table, key) ? table[key] : undefined);







// -----------------------------------------------------------
// StatusChip (default export)
// -----------------------------------------------------------
//
//   <StatusChip value={job.status} label={label('jobStatus', job.status)} />
//   <StatusChip kind="severity" value="critical" label="Kritinė" />
//
// `label` is the translated text; `value` (with `kind`)
// picks the colour.
//
// Used by:
//   - Users, Jobs, Dashboard, Account, Usage — state columns
//   - the company pages (CompanyCredentials, CompanyStandards,
//     CompanyDocuments, DocumentDrawer) and the chat's
//     CompanyPanel, ToolCards
//   - the report pages (ReportsTable, ReportDetail,
//     ReportOverview, ReportFindings, ReportActs,
//     ReportCitations, FindingReviewDialog)
//   - the corpus pages (CorpusCatalogue, CorpusDocument,
//     ActVersions, CitationChecker), ObligationsPanel,
//     ObligationDialog, PromptVersions
//   - pages/Programme/ProductStatus.jsx — a work product's
//     status wherever it is shown
//   - pages/Companies/ActionState.jsx — the state of an
//     action of the register
// -----------------------------------------------------------

export default function StatusChip({ value, label, kind, icon, className = '' }) {
  const color = own(own(KIND_COLORS, kind), value) || own(COLORS, value) || 'default';
  const filled = kind === 'severity' && value === 'critical';
  return (
    <Chip
      size="small"
      label={label ?? value}
      color={color}
      variant={filled ? 'filled' : 'outlined'}
      icon={icon}
      className={className}
    />
  );
}
