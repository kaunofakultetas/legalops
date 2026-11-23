// -----------------------------------------------------------
//  [*] useViewParams — a page's view state in its address
//
//  What a user would want to find again and could share —
//  the tab, the filters, the search, the table's page and
//  sort — lives in the query string, so Back, a reload and a
//  copied link all bring it back. A change REPLACES the
//  history entry (a filter is not a step to walk back
//  through) and keeps every other parameter of the page: a
//  tab switch must not wipe the filters of the tab left, a
//  sort must not drop the search. Clearing a value (null, '')
//  removes its parameter, so a page at its defaults has a
//  bare address.
//
//  Two writes in one moment compose (utils/navigationMemory
//  noteSearch — React Router renders the new address in a
//  transition, so the second would otherwise start from the
//  query its component last rendered). The pages read the
//  values through utils/viewParams.js, which ignores
//  whatever they do not know.
// -----------------------------------------------------------

import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { currentSearch, noteSearch } from '@/utils/navigationMemory';







// -----------------------------------------------------------
// useViewParams (default export)
// -----------------------------------------------------------
//
//   const [params, setView] = useViewParams();
//   params.get('status')
//   setView({ status: 'failed', page: null })  — set / remove
//
// `params` is the current URLSearchParams (a new object only
// when the query changes); setView is stable while the entry
// is, and a write that changes nothing navigates nowhere.
//
// Used by:
//   - the pages that keep a view in the address (Companies,
//     CompanyDetail, CompanyActions, Reports, ReportDetail,
//     ReportFindings, ReportCitations, ReportOverview,
//     Corpus, CorpusCatalogue, CorpusDocument, ProvisionTree,
//     ObligationsPanel, Jobs, Usage, Audit, PromptEditor)
//   - components/DataTable/DataTable.jsx — page, size, sort
// -----------------------------------------------------------

export default function useViewParams() {

  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);


  const setView = useCallback((changes) => {
    const base = currentSearch(location);
    const next = new URLSearchParams(base);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null || value === undefined || value === '') next.delete(name);
      else next.set(name, String(value));
    }
    const search = next.toString() ? `?${next}` : '';
    if (search === (base === '?' ? '' : base)) return;
    noteSearch(location, search);
    navigate({ pathname: location.pathname, search, hash: location.hash }, { replace: true, state: location.state });
  }, [location, navigate]);


  return [params, setView];
}
