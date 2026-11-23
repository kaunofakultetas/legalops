// -----------------------------------------------------------
//  [*] JsonView — a JSON value, readable
//
//  Structured data the backend stores as JSON (the company's
//  financial market classification, its attributes bag, a
//  job's result, an audit row's details) rendered for people
//  rather than as a <pre>: objects become label/value rows,
//  lists of words become chips, booleans Taip/Ne, nested
//  objects indent. `labels` translates known keys; unknown
//  keys are humanised ("licenseRequired" → "License required").
//
//  The attributes bag is typed by users, so any key can
//  arrive — "constructor" or "__proto__" too: a label is read
//  only from the labels' OWN keys (an inherited one would put
//  a function or Object.prototype in the page — a crash).
//
//  Split into (root component last):
//
//    humanizeKey — camelCase / snake_case → words
//    labelOf     — the translated or humanised key
//    scalarText  — one scalar as the words a chip shows
//    JsonValue   — one value of any type (recursive)
//    JsonView    — the object view (default export)
// -----------------------------------------------------------

import Chip from '@mui/material/Chip';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// humanizeKey
// -----------------------------------------------------------
//
// "licenseRequired" → "License required"; "ai_act" → "Ai act".
//
// Used by:
//   - labelOf (below)
// -----------------------------------------------------------

function humanizeKey(key) {
  const words = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}







// -----------------------------------------------------------
// labelOf
// -----------------------------------------------------------
//
// The caller's label for `key` when the labels have it as
// an own key, else the humanised key.
//
// Used by:
//   - JsonValue (below)
// -----------------------------------------------------------

function labelOf(key, labels) {
  return labels && Object.hasOwn(labels, key) ? labels[key] : humanizeKey(key);
}







// -----------------------------------------------------------
// scalarText
// -----------------------------------------------------------
//
// A scalar inside a list of words, said the way the same
// scalar reads on its own: nothing → "—", a boolean → Taip /
// Ne, anything else as its text (never "null" or "true").
//
// Used by:
//   - JsonValue (below) — the chips
// -----------------------------------------------------------

function scalarText(value, t) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  return String(value);
}







// -----------------------------------------------------------
// JsonValue
// -----------------------------------------------------------
//
// Strings keep their line breaks, lists of scalars become
// chips, lists of objects a stack, objects a definition
// list (recursing with the same labels).
//
// Used by:
//   - JsonView (below), and itself for nesting
// -----------------------------------------------------------

function JsonValue({ value, labels }) {

  const t = useTranslations('COMPONENTS.common');


  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>;
  if (typeof value === 'boolean') return <span>{value ? t('yes') : t('no')}</span>;
  if (typeof value !== 'object') return <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{String(value)}</span>;


  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">—</span>;
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, index) => <Chip key={index} size="small" label={scalarText(item, t)} />)}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="border-l-2 border-edge pl-3"><JsonValue value={item} labels={labels} /></div>
        ))}
      </div>
    );
  }


  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="text-muted">—</span>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[minmax(9rem,max-content)_1fr] gap-x-4 gap-y-2 m-0">
      {entries.map(([key, item]) => (
        <div key={key} className="contents">
          <dt className="text-sm text-muted">{labelOf(key, labels)}</dt>
          <dd className="text-sm m-0 min-w-0"><JsonValue value={item} labels={labels} /></dd>
        </div>
      ))}
    </dl>
  );
}







// -----------------------------------------------------------
// JsonView (default export)
// -----------------------------------------------------------
//
//   <JsonView value={company.financialMarket} labels={{ markets: 'Rinkos' }} />
//
// Used by:
//   - CompanyProfile.jsx — financial market, attributes
//   - Jobs.jsx — a job's result
//   - Audit.jsx — an entry's details
//   - ReportDetail.jsx — the frozen profile
//   - Usage.jsx — a model call's tool calls
// -----------------------------------------------------------

export default function JsonView({ value, labels = {}, className = '' }) {
  return <div className={className}><JsonValue value={value} labels={labels} /></div>;
}
