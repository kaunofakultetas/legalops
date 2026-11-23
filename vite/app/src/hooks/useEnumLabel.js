// -----------------------------------------------------------
//  [*] useEnumLabel — machine values → human labels
//
//  Every enum the backend sends (statuses, kinds, severities,
//  institution types, job kinds, audit actions…) is labelled
//  from messages/ENUMS, grouped by what it is:
//
//    label('findingStatus', 'missing')  → "Neatitinka"
//    label('jobKind', 'report.analyze') → "Atitikties analizė"
//
//  Dotted values resolve as nested keys. A value the table
//  does not know yet is humanised ("new_kind" → "New kind")
//  rather than shown raw, so a backend addition degrades
//  gracefully.
//
//  Split into:
//
//    humanize     — the fallback for unknown values
//    useEnumLabel — the hook (default export)
// -----------------------------------------------------------

import { useCallback } from 'react';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// humanize
// -----------------------------------------------------------
//
// "gap_analysis" → "Gap analysis"; the last resort label.
//
// Used by:
//   - useEnumLabel (below)
// -----------------------------------------------------------

function humanize(value) {
  const text = String(value).replace(/[._]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}







// -----------------------------------------------------------
// useEnumLabel (default export)
// -----------------------------------------------------------
//
//   const label = useEnumLabel();
//   label('severity', 'high')      → "Aukšta"
//   label('boolean', String(null)) → "Nežinoma"
//
// null/undefined/"" render as "—". Memoised per locale.
//
// Used by:
//   - every page that shows a status, kind or category
//   - StatusChip consumers pass its result as the label
// -----------------------------------------------------------

export default function useEnumLabel() {
  const t = useTranslations('ENUMS');
  return useCallback((group, value) => {
    if (value === null || value === undefined || value === '') return '—';
    const key = `${group}.${value}`;
    const text = t(key);
    return typeof text === 'string' && text !== key ? text : humanize(value);
  }, [t]);
}
