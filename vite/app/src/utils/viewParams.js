// -----------------------------------------------------------
//  [*] viewParams — reading a view out of the address safely
//
//  The query string is whatever a link, a bookmark or a hand
//  put there. The pages read their view state through these
//  helpers, which answer only values the page knows — an
//  unknown tab, status or column, a malformed id or number
//  reads as the default, never as an error, and nothing from
//  the address reaches an API path unchecked.
//
//  Naming: a page's own state has plain names (?status=),
//  a part of a page that keeps its own state (a tab's
//  filters, a table inside a tab) prefixes its names with its
//  own ("findings.status", "documents.page") — so two parts
//  never read each other's parameters.
//
//  Split into:
//
//    ID_PATTERN — what an id from the address may look like
//    paramName  — a part's parameter name
//    oneOf      — one value out of a known list
//    listOf     — a comma list, known values only
//    listParam  — a list → its parameter value
//    idParam    — a plausible record id, or null
// -----------------------------------------------------------







// -----------------------------------------------------------
// ID_PATTERN
// -----------------------------------------------------------
//
// The ids the backend mints (uuid4 strings) and the slugs
// the app keys by: letters, digits, "-", "_" and ".", at
// most 100 of them.
//
// Used by:
//   - idParam (below)
// -----------------------------------------------------------

export const ID_PATTERN = /^[\w.-]{1,100}$/;







// -----------------------------------------------------------
// paramName
// -----------------------------------------------------------
//
//   paramName('', 'page')          → 'page'
//   paramName('documents', 'page') → 'documents.page'
//
// A parameter's name within a part of the page ('' = the
// page itself).
//
// Used by:
//   - components/DataTable/DataTable.jsx — page, size, sort
//   - pages/Obligations/ObligationsPanel.jsx — its filters
// -----------------------------------------------------------

export function paramName(prefix, name) {
  return prefix ? `${prefix}.${name}` : name;
}







// -----------------------------------------------------------
// oneOf
// -----------------------------------------------------------
//
//   oneOf(params.get('status'), STATUSES)            → 'failed' | ''
//   oneOf(params.get('group'), ['category'], 'act')  → 'category' | 'act'
//
// The value when `allowed` holds it, else `fallback`.
//
// Used by:
//   - the pages that read a choice from the address
// -----------------------------------------------------------

export function oneOf(value, allowed, fallback = '') {
  return value !== null && allowed.includes(value) ? value : fallback;
}







// -----------------------------------------------------------
// listOf
// -----------------------------------------------------------
//
//   listOf('missing,partial,bogus,missing', FINDING_STATUSES)
//     → ['missing', 'partial']
//
// A comma-separated parameter as a list of the known values,
// each once, in the order given ([] for none).
//
// Used by:
//   - pages/Reports/ReportFindings.jsx — status, severity
//   - pages/Reports/ReportCitations.jsx — verdicts
// -----------------------------------------------------------

export function listOf(value, allowed) {
  if (!value) return [];
  return [...new Set(value.split(','))].filter((item) => allowed.includes(item));
}







// -----------------------------------------------------------
// listParam
// -----------------------------------------------------------
//
//   listParam(['missing', 'partial']) → 'missing,partial'
//   listParam([])                     → null (no parameter)
//
// A list as the parameter value listOf reads.
//
// Used by:
//   - pages/Reports/ReportFindings.jsx, ReportCitations.jsx
// -----------------------------------------------------------

export function listParam(list) {
  return list.length ? list.join(',') : null;
}







// -----------------------------------------------------------
// idParam
// -----------------------------------------------------------
//
//   idParam('1c2d…-uuid') → '1c2d…-uuid'
//   idParam('../x?y')     → null
//
// A value shaped like a record id (ID_PATTERN), else null —
// safe to put in an API path or query.
//
// Used by:
//   - pages/Reports/Reports.jsx — the company filter
//   - pages/Obligations/ObligationsPanel.jsx — the act filter
//   - pages/Usage/Usage.jsx — the user scope
//   - pages/Audit/Audit.jsx — the user filter
//   - pages/Jobs/Jobs.jsx, pages/Usage/Usage.jsx — the
//     overlay ids
// -----------------------------------------------------------

export function idParam(value) {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}
