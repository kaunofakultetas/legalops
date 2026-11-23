// -----------------------------------------------------------
//  [*] useDebounced — a value that settles before it changes
//
//  Search boxes type into state instantly but query the
//  backend — and write the address — only once the typing
//  pauses.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';







// -----------------------------------------------------------
// useDebounced (default export)
// -----------------------------------------------------------
//
//   const q = useDebounced(search, 300)  — trails by 300 ms
//
// Used by:
//   - useDraftText.js — the search boxes whose text lives in
//     the address (Companies, CorpusCatalogue,
//     ObligationsPanel, ProvisionTree, Audit, the report's
//     findings and citations)
//   - pages/Reports/ReportScope.jsx — the price asked once
//     the switches rest
// -----------------------------------------------------------

export default function useDebounced(value, delay = 300) {

  const [settled, setSettled] = useState(value);


  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);


  return settled;
}
