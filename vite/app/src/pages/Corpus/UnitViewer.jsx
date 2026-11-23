// -----------------------------------------------------------
//  [*] UnitViewer — one provision, in full
//
//  GET /api/corpus/units/{id}: the act's short title and the
//  provision's path and heading, its complete text (an
//  article includes its paragraphs and points), a note (a
//  status) when it belongs to an older version (a report
//  citation can point there), "copy the citation" and a link
//  to the official text (the EUR-Lex article anchor of
//  citationUrl when the backend knows one, else the act's
//  source address). An answer that is not a provision is a
//  failed load. The provision is set like the statute it
//  comes from: heading and text in the serif, the text at
//  reading size and measure.
// -----------------------------------------------------------

import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';







// -----------------------------------------------------------
// UnitViewer (default export)
// -----------------------------------------------------------
//
// The provision `unitId`, or the "choose a provision" hint
// without one; `onClose` adds the close button (the phone
// drawer has one, the desktop column does not).
//
// Used by:
//   - CorpusDocument.jsx — beside the tree (desktop) or in a
//     drawer (phones)
// -----------------------------------------------------------

export default function UnitViewer({ unitId, onClose }) {

  const t = useTranslations('PAGES.corpusDocument.UNIT');
  const tStructure = useTranslations('PAGES.corpusDocument.STRUCTURE');


  const { data: unit, isLoading, error, refetch } = useQuery({
    queryKey: ['corpus', 'unit', unitId],
    queryFn: async () => {
      // ?unit= is whatever the address says — encoded, it cannot
      // walk to another endpoint
      const data = (await api.get(`/api/corpus/units/${encodeURIComponent(unitId)}`)).data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The answer is not a provision');
      return data;
    },
    enabled: Boolean(unitId),
  });


  const copy = async () => {
    // A unit cited by its heading (a standard's unnumbered section) names it once
    const citation = `${unit.shortTitle || unit.documentTitle} ${unit.path}${unit.heading && unit.heading !== unit.path ? ` — ${unit.heading}` : ''}`;
    try {
      await navigator.clipboard.writeText(citation);
      toast.success(t('copied'));
    } catch {
      // clipboard blocked (http, permissions) — nothing to do
    }
  };


  if (!unitId) return <Typography color="text.secondary" className="p-2">{tStructure('select')}</Typography>;
  if (isLoading) return <CircularProgress size={24} aria-label={t('title')} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const official = unit.citationUrl || unit.sourceUrl;
  return (
    <article className="flex flex-col gap-2" aria-label={`${unit.shortTitle || unit.documentTitle} ${unit.path}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Typography variant="caption" color="text.secondary">{unit.shortTitle || unit.documentTitle} · {t('version', { version: unit.versionNo })}</Typography>
          <Typography variant="h6" component="h2" className="font-serif [overflow-wrap:anywhere]">{unit.path}{unit.heading && unit.heading !== unit.path ? ` — ${unit.heading}` : ''}</Typography>
        </div>
        {onClose && <IconAction label={t('close')} icon={<CloseIcon />} onClick={onClose} />}
      </div>
      {!unit.isCurrent && <Alert severity="info" role="status">{t('notCurrent', { version: unit.versionNo })}</Alert>}
      <div className="font-serif text-[1.0625rem] leading-[1.7] max-w-[68ch] whitespace-pre-wrap [overflow-wrap:anywhere]">{unit.text}</div>
      <div className="flex gap-2 flex-wrap mt-1">
        <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={copy}>{t('copy')}</Button>
        {official && (
          <Button size="small" component="a" href={official} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />}>{t('official')}</Button>
        )}
      </div>
    </article>
  );
}
