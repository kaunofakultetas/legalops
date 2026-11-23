// -----------------------------------------------------------
//  [*] useSessionState — useState that outlives the page
//
//  The ephemeral view state a user expects to find again
//  after leaving a page and coming back — an open accordion,
//  the "Show more" pages of a list, a search tool's last
//  answer — kept in sessionStorage under a key per page part
//  (utils/sessionStore.js: checked on the way in, capped,
//  failures ignored). A new key — the same component showing
//  another report or act — reads its own value.
// -----------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { readSession, writeSession } from '@/utils/sessionStore';







// -----------------------------------------------------------
// useSessionState (default export)
// -----------------------------------------------------------
//
//   const [open, setOpen] = useSessionState(`report.${id}.acts`, {}, isFlagMap);
//   setOpen({ ...open, notApplicable: true })
//   setOpen((current) => …)
//
//   useSessionState(null, false)  — a null key keeps nothing
//                                   (plain state)
//
// `valid(value)` screens what storage answers (anything it
// refuses reads as `initial`); the value must be JSON-able.
// Only a change is written — a page at its defaults stores
// nothing.
//
// Used by:
//   - pages/Reports/ReportFindings.jsx — the "Show more" pages
//   - pages/Reports/ReportCitations.jsx — the "Show more" page
//   - pages/Reports/ReportActs.jsx — the groups opened
//   - pages/Reports/ReportScope.jsx — the switches moved on
//     the approval screen
//   - pages/Corpus/ProvisionTree.jsx — the collapsed units
//   - pages/Corpus/CorpusSearch.jsx — the form, the answer
//   - pages/Corpus/CitationChecker.jsx — the rows, the answer
//   - pages/Companies/CompanyDocuments.jsx — the search
//   - pages/Prompts/PromptTestPanel.jsx — the test form, the
//     answer
//   - pages/Mcp/McpServers.jsx — the open tool lists
//   - components/charts/ColumnChart.jsx — the table view
// -----------------------------------------------------------

export default function useSessionState(key, initial, valid) {

  const [state, setState] = useState(() => ({ key, value: key ? readSession(key, initial, valid) : initial, changed: false }));
  let current = state;
  if (state.key !== key) {
    current = { key, value: key ? readSession(key, initial, valid) : initial, changed: false };
    setState(current);
  }


  // Written after the render that shows it, so the updater
  // stays pure
  useEffect(() => {
    if (state.key && state.changed) writeSession(state.key, state.value);
  }, [state]);


  const set = useCallback((next) => {
    setState((previous) => ({
      key: previous.key,
      value: typeof next === 'function' ? next(previous.value) : next,
      changed: true,
    }));
  }, []);


  return [current.value, set];
}
