// -----------------------------------------------------------
//  [*] enums — the backend's value lists, in display order
//
//  The GUI's copy of the CHECK-constrained value sets of the
//  Django models, for selects and filters. The labels live
//  in messages/ENUMS (useEnumLabel); these lists only fix
//  WHICH values exist and in what order they are offered.
//  When the backend adds a value, add it here and label it
//  there — until then an unknown value still renders (it is
//  humanised), it just cannot be picked.
//
//  Split into:
//
//    INSTITUTION_TYPES   — companies.models
//    SIZE_CATEGORIES     — companies.models
//    CREDENTIAL_KINDS    — companies.models
//    STANDARD_STATUSES   — companies.models
//    DOCUMENT_KINDS      — companies.models
//    JURISDICTIONS       — corpus.models
//    DOC_TYPES           — corpus.models
//    SOURCE_KINDS        — corpus.models
//    DOC_STATUSES        — corpus.models
//    STRUCTURE_METHODS   — corpus.outline
//    STRUCTURE_PARSERS   — corpus.outline
//    OBLIGATION_STATUSES — corpus.models
//    CATEGORIES          — corpus.models (obligation domains)
//    SEVERITIES          — corpus / analysis models
//    ACTION_STATUSES     — analysis.models (the action register)
// -----------------------------------------------------------







// -----------------------------------------------------------
// INSTITUTION_TYPES
// -----------------------------------------------------------
//
// What kind of financial institution a company is; "unknown"
// first because it is the default of a new profile.
//
// Used by:
//   - pages/Companies/Companies.jsx — the create dialog
//   - pages/Companies/CompanyProfile.jsx — the profile
//   - pages/Corpus/AddActDialog.jsx, ActMetadataDialog.jsx,
//     pages/Obligations/ObligationDialog.jsx — "applies to"
// -----------------------------------------------------------

export const INSTITUTION_TYPES = [
  'unknown', 'bank', 'credit_union', 'payment_institution', 'emi', 'casp', 'crowdfunding', 'consumer_credit',
  'real_estate_credit', 'currency_exchange', 'investment_firm', 'insurance', 'other_financial', 'none',
];







// -----------------------------------------------------------
// SIZE_CATEGORIES
// -----------------------------------------------------------
//
// The company size classes, smallest first.
//
// Used by:
//   - pages/Companies/CompanyProfile.jsx
// -----------------------------------------------------------

export const SIZE_CATEGORIES = ['unknown', 'micro', 'small', 'medium', 'large'];







// -----------------------------------------------------------
// CREDENTIAL_KINDS
// -----------------------------------------------------------
//
// Licence first — the one the analysis cares most about.
//
// Used by:
//   - pages/Companies/CompanyCredentials.jsx
// -----------------------------------------------------------

export const CREDENTIAL_KINDS = ['license', 'permit', 'registration', 'certificate'];







// -----------------------------------------------------------
// STANDARD_STATUSES
// -----------------------------------------------------------
//
// How far a company is with a standard it adopted, the
// furthest first.
//
// Used by:
//   - pages/Companies/CompanyStandards.jsx
// -----------------------------------------------------------

export const STANDARD_STATUSES = ['certified', 'implementing', 'planned'];







// -----------------------------------------------------------
// DOCUMENT_KINDS
// -----------------------------------------------------------
//
// What an uploaded company document is.
//
// Used by:
//   - pages/Companies/CompanyDocuments.jsx
// -----------------------------------------------------------

export const DOCUMENT_KINDS = ['policy', 'procedure', 'contract', 'register', 'other'];







// -----------------------------------------------------------
// JURISDICTIONS
// -----------------------------------------------------------
//
// Where a legal act comes from; INTL is an international
// standard (ISO, IEC).
//
// Used by:
//   - pages/Corpus/CorpusCatalogue.jsx, AddActDialog.jsx,
//     ActMetadataDialog.jsx, CorpusSearch.jsx
// -----------------------------------------------------------

export const JURISDICTIONS = ['EU', 'LT', 'INTL'];







// -----------------------------------------------------------
// DOC_TYPES
// -----------------------------------------------------------
//
// The legal act types, binding force first.
//
// Used by:
//   - pages/Corpus/CorpusCatalogue.jsx, AddActDialog.jsx,
//     ActMetadataDialog.jsx
// -----------------------------------------------------------

export const DOC_TYPES = ['regulation', 'directive', 'law', 'resolution', 'order', 'guideline', 'licensing', 'standard', 'other'];







// -----------------------------------------------------------
// SOURCE_KINDS
// -----------------------------------------------------------
//
// Where the worker fetches an act's text: EUR-Lex by CELEX,
// e-TAR / e-seimas by id, a www.lb.lt page, any https URL,
// or an uploaded file.
//
// Used by:
//   - pages/Corpus/AddActDialog.jsx
// -----------------------------------------------------------

export const SOURCE_KINDS = ['cellar', 'etar', 'eseimas', 'lb', 'url', 'upload'];







// -----------------------------------------------------------
// DOC_STATUSES
// -----------------------------------------------------------
//
// Whether the act is in force.
//
// Used by:
//   - pages/Corpus/AddActDialog.jsx, ActMetadataDialog.jsx
// -----------------------------------------------------------

export const DOC_STATUSES = ['in_force', 'not_yet_applicable', 'repealed'];







// -----------------------------------------------------------
// STRUCTURE_METHODS
// -----------------------------------------------------------
//
// How a standard's structure can be read when it is
// processed again: the automatic choice first, then the
// clause rules alone, the AI model, the pages.
//
// Used by:
//   - pages/Corpus/CorpusDocument.jsx
// -----------------------------------------------------------

export const STRUCTURE_METHODS = ['auto', 'rules', 'ai', 'pages'];







// -----------------------------------------------------------
// STRUCTURE_PARSERS
// -----------------------------------------------------------
//
// What a standard's version records as its parser: the way
// its structure was read — by the rules, by the rules with
// the AI model inside long clauses, by the AI model, by
// pages. Other parsers are shown by their own names.
//
// Used by:
//   - pages/Corpus/ActVersions.jsx, CorpusDocument.jsx
// -----------------------------------------------------------

export const STRUCTURE_PARSERS = ['standard', 'standard-refined', 'standard-ai', 'standard-pages'];







// -----------------------------------------------------------
// OBLIGATION_STATUSES
// -----------------------------------------------------------
//
// The review states of an extracted obligation.
//
// Used by:
//   - pages/Obligations/ObligationsPanel.jsx, ObligationDialog.jsx
// -----------------------------------------------------------

export const OBLIGATION_STATUSES = ['proposed', 'approved', 'rejected'];







// -----------------------------------------------------------
// CATEGORIES
// -----------------------------------------------------------
//
// The obligation domains (OBLIGATION_CATEGORIES) — also the
// "domain" grouping of report findings and actions.
//
// Used by:
//   - pages/Obligations/ObligationsPanel.jsx, ObligationDialog.jsx
// -----------------------------------------------------------

export const CATEGORIES = [
  'licensing', 'registration', 'governance', 'policy', 'procedure', 'risk_management', 'ict_security', 'outsourcing',
  'incident_reporting', 'reporting', 'disclosure', 'record_keeping', 'customer_protection', 'aml_kyc', 'capital',
  'safeguarding', 'training', 'data_protection', 'ai_governance', 'other',
];







// -----------------------------------------------------------
// SEVERITIES
// -----------------------------------------------------------
//
// Worst first — obligations and findings share the scale.
//
// Used by:
//   - pages/Obligations/ObligationsPanel.jsx, ObligationDialog.jsx
//   - pages/Reports/ReportFindings.jsx, ReportOverview.jsx
// -----------------------------------------------------------

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];







// -----------------------------------------------------------
// ACTION_STATUSES
// -----------------------------------------------------------
//
// The statuses a person gives an action of a company's
// register, in the order a piece of work passes through
// them. "Late" is not among them: the register works it out
// from the due date and nobody sets it.
//
// Used by:
//   - pages/Companies/ActionRow.jsx — the status select
// -----------------------------------------------------------

export const ACTION_STATUSES = ['open', 'in_progress', 'done', 'closed'];
