// -----------------------------------------------------------
//  [*] useDraftText — a search box whose text lives in the
//      address
//
//  The committed search is a query parameter (useViewParams),
//  but a text field cannot be driven by the address: React
//  Router renders a new address in a transition, and a
//  controlled input updated in a transition drops keystrokes.
//  So the field types into a local draft, and the draft is
//  committed (trimmed) once the typing pauses — the same
//  pause the searches always had before asking the server.
//
//  An outside change of the committed text — Back to another
//  search, a "clear filters" button, a link to the page —
//  replaces the draft; the page's own commit coming back does
//  not (the user may have typed on meanwhile).
// -----------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useDebounced from '@/hooks/useDebounced';


// The typing pause before a draft is committed
const DELAY_MS = 300;







// -----------------------------------------------------------
// useDraftText (default export)
// -----------------------------------------------------------
//
//   const q = (params.get('q') ?? '').trim();
//   const [draft, setDraft] = useDraftText(q, (text) => setView({ q: text }));
//   <TextField value={draft} onChange={(e) => setDraft(e.target.value)} />
//
// `committed` is the text as the address holds it; `commit`
// writes one (it may change identity every render).
//
// Used by:
//   - pages/Companies/Companies.jsx — the company search
//   - pages/Corpus/CorpusCatalogue.jsx — the title search
//   - pages/Corpus/ProvisionTree.jsx — the provision search
//   - pages/Obligations/ObligationsPanel.jsx — the text search
//   - pages/Reports/ReportFindings.jsx, ReportCitations.jsx —
//     the list searches
//   - pages/Audit/Audit.jsx — the "until" moment (a date
//     field cannot follow the address either)
// -----------------------------------------------------------

export default function useDraftText(committed, commit, delay = DELAY_MS) {

  const [draft, setDraft] = useState(committed);
  const settled = useDebounced(draft.trim(), delay);
  // The text the address holds or is about to hold because of
  // this field (its own commit on the way)
  const sent = useRef(committed);
  const commitRef = useRef(commit);
  useLayoutEffect(() => { commitRef.current = commit; });


  // A committed text this field did not send came from
  // elsewhere — the draft follows it
  useEffect(() => {
    if (committed === sent.current) return;
    sent.current = committed;
    setDraft(committed);
  }, [committed]);


  // The draft goes to the address once the typing pauses
  useEffect(() => {
    if (settled === sent.current) return;
    sent.current = settled;
    commitRef.current(settled);
  }, [settled]);


  return [draft, setDraft];
}
