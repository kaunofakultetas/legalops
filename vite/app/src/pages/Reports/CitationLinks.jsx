// -----------------------------------------------------------
//  [*] CitationLinks — the criterion of a finding or act
//
//  Each citation ({unitId, path, documentTitle, url?}) as a
//  small chip linking to the provision in the corpus viewer
//  (/corpus/<documentId>?unit=<unitId>), plus an external
//  icon link to the official text (EUR-Lex / e-TAR) when the
//  citation carries one. The chips are set in the serif,
//  like every reference to a source. The report snapshots
//  paths and titles, so a chip still reads right after the
//  corpus changes; the corpus link needs the act's document
//  id, which the caller passes (null → plain chips).
//
//  A finding of the company's own requirements is measured
//  against a passage of a company document, not against the
//  law: its citation names the policy and the section, and
//  carries the document's id, the quote and where the quote
//  starts ({path, documentTitle, documentId, quote, start}).
//  Given `onOpenDocument`, such a chip opens that document at
//  the quote's place, the way an evidence passage does —
//  named as the criterion, so the drawer does not call the
//  requirement itself evidence; a quote the document does not
//  hold word for word (`start` null) leaves the chip plain
//  text — there is no place to open it at. Such a citation
//  has no link to the law.
//
//  Split into (root component last):
//
//    CitationChip  — one citation's chip
//    CitationLinks — the list (default export)
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import Chip from '@mui/material/Chip';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// CitationChip
// -----------------------------------------------------------
//
// One citation as a chip: a button that opens the company
// document at the quote when the citation is a placed passage
// of one and the caller can open documents; a link to the
// provision in the corpus viewer when the act's document and
// the unit are known; plain text otherwise.
//
// Used by:
//   - CitationLinks (below)
// -----------------------------------------------------------

function CitationChip({ citation, label, documentId, onOpenDocument }) {

  const t = useTranslations('PAGES.report.FINDINGS');


  if (onOpenDocument && citation.documentId && Number.isInteger(citation.start)) {
    return (
      <Chip size="small" variant="outlined" clickable label={label} aria-label={`${t('openPassage')}: ${label}`} className="font-serif"
            onClick={() => onOpenDocument(citation.documentId, { charStart: citation.start, quote: citation.quote, criterion: true })} />
    );
  }
  if (documentId && citation.unitId) {
    return (
      <Chip size="small" variant="outlined" clickable component={Link} to={`/corpus/${documentId}?unit=${citation.unitId}`} label={label}
            aria-label={`${t('openUnit')}: ${label}`} className="font-serif" />
    );
  }
  return <Chip size="small" variant="outlined" label={label} className="font-serif" />;
}







// -----------------------------------------------------------
// CitationLinks (default export)
// -----------------------------------------------------------
//
// Renders nothing for an empty list; `documentId` is the
// act whose provisions the chips open in the corpus viewer,
// `onOpenDocument` the way to a company document for the
// citations that are passages of one — called with the
// document's id and the passage ({charStart, quote,
// criterion: true}).
//
// Used by:
//   - ReportFindings.jsx — a finding's legal basis, or the
//     passage of the company's policy it is measured against
//   - ReportActs.jsx — an act's scope provisions
// -----------------------------------------------------------

export default function CitationLinks({ citations, documentId, onOpenDocument = null }) {

  const t = useTranslations('PAGES.report.FINDINGS');


  if (!citations?.length) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-1">
      {citations.map((citation, index) => {
        const label = [citation.documentTitle, citation.path].filter(Boolean).join(' ');
        return (
          <li key={`${citation.unitId || citation.path}-${index}`} className="flex items-center">
            <CitationChip citation={citation} label={label} documentId={documentId} onOpenDocument={onOpenDocument} />
            {citation.url && (
              <a href={citation.url} target="_blank" rel="noopener noreferrer" className="inline-flex text-primary ml-0.5" aria-label={`${t('external')}: ${label}`}>
                <OpenInNewIcon sx={{ fontSize: 16 }} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
