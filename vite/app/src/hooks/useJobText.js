// -----------------------------------------------------------
//  [*] useJobText — a job's subject and progress, in words
//
//  Jobs carry machine strings: a subject ("report:<uuid>",
//  "corpus:<uuid>", "product:<uuid>" for a work product of a
//  compliance programme, "schedule:ops.maintenance") and a
//  progress {step, percent, message} whose message the
//  worker writes in English ("3/10 batches", "extracting
//  MiCA"). This hook turns both into the UI language — the
//  subject into a label plus, where a page exists, a link,
//  with the subject's own name in place of its id when the
//  API gives one (a job about a legal act: "Teisės aktas ·
//  MiCA");
//  the known progress messages into translated phrases (an
//  unknown message passes through, it is data then). The
//  report's step that assesses the company's own requirements
//  names the policy document it is reading; only that step's
//  "reading …" is taken for a document's title.
//
//  Split into:
//
//    SUBJECT_ROUTES — subject prefix → page link builder
//    useJobText     — {subject, progress} (default export)
// -----------------------------------------------------------

import { useCallback, useMemo } from 'react';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import { productPath } from '@/paths';


// Where a subject's page lives (prefix → path); prefixes
// without an entry render as a label only
const SUBJECT_ROUTES = {
  report: (id) => `/reports/${id}`,
  corpus: (id) => `/corpus/${id}`,
  obligations: (id) => `/corpus/${id}?tab=obligations`,
  verification: (id) => `/corpus/${id}?tab=obligations`,
  product: productPath,
};







// -----------------------------------------------------------
// useJobText (default export)
// -----------------------------------------------------------
//
//   const text = useJobText();
//   text.subject('report:1c2…') → {label: 'Ataskaita · 1c2…', to: '/reports/1c2…'}
//   text.subject('corpus:d00…', 'MiCA') → {label: 'Teisės aktas · MiCA', to: '/corpus/d00…'}
//   text.progress({step: 'gap_analysis', percent: 30,
//                  message: '3/10 batches'})
//     → "Atitikties spragų analizė — 3 iš 10 paketų (30 %)"
//
// Used by:
//   - Jobs.jsx — the subject and progress columns, drawer
//   - Dashboard.jsx — the recent jobs list
//   - ReportProgress.jsx — the running analysis
//   - CorpusDocument.jsx — the latest job card
// -----------------------------------------------------------

export default function useJobText() {

  const t = useTranslations('COMPONENTS.jobText');
  const label = useEnumLabel();


  const subject = useCallback((value, title) => {
    const [prefix, rest] = String(value || '').split(/:(.*)/s);
    if (prefix === 'corpus' && rest === 'reembed') return { label: t('SUBJECT.allActs'), to: '/corpus' };
    if (prefix === 'corpus' && rest === 'refresh-all') return { label: t('SUBJECT.allSources'), to: '/corpus' };
    if (prefix === 'schedule') return { label: `${t('SUBJECT.schedule')}: ${label('jobKind', rest)}`, to: null };
    const known = t(`SUBJECT.${prefix}`);
    const name = known !== `SUBJECT.${prefix}` ? known : prefix;
    const route = SUBJECT_ROUTES[prefix];
    const own = typeof title === 'string' && title.trim() ? title.trim() : rest?.slice(0, 8);
    return { label: own ? `${name} · ${own}` : name, to: route && rest ? route(rest) : null };
  }, [t, label]);


  const progress = useCallback((value) => {
    if (!value?.step && !value?.message) return '';
    const parts = [];
    if (value.step) parts.push(label('stepName', value.step));
    const message = String(value.message || '');
    const batches = message.match(/^(\d+)\/(\d+) batches$/);
    const extracting = message.match(/^extracting (.+)$/);
    const obligations = message.match(/^(\d+) obligations$/);
    const reading = value.step === 'internal' ? message.match(/^reading (.+)$/) : null;
    if (batches) parts.push(t('PROGRESS.batches', { done: batches[1], total: batches[2] }));
    else if (extracting) parts.push(t('PROGRESS.extracting', { title: extracting[1] }));
    else if (reading) parts.push(t('PROGRESS.reading', { title: reading[1] }));
    else if (obligations) parts.push(t('PROGRESS.obligations', { count: obligations[1] }));
    else if (message) parts.push(message);
    const text = parts.join(' — ');
    return value.percent != null ? `${text} (${t('PROGRESS.percent', { percent: value.percent })})` : text;
  }, [t, label]);


  return useMemo(() => ({ subject, progress }), [subject, progress]);
}
