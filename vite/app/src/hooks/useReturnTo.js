// -----------------------------------------------------------
//  [*] useReturnTo — a page's way back behaves like Back
//
//  The detail pages carry a "back" link to their list (the
//  company to Companies, the report to Reports…) and a delete
//  that returns there. Both used to PUSH the list's bare
//  address: a fresh list at the top, its filters, sort and
//  page gone. The rule now:
//
//    - the list is right behind this entry (the page was
//      opened from it)  → a real Back: history.go(-1) — the
//      list's own entry, with its address (filters, table
//      page) and its scroll position (useScrollMemory);
//    - otherwise (a deep link, the page reached from
//      elsewhere)       → the list at the last address it
//      was seen with, marked as a return (RETURNING): it takes
//      the scroll position last seen at that address; never
//      seen → its bare address, at the top.
//
//  "Right behind" is what NavigationMemory recorded when this
//  entry was pushed, compared by page (pathname) — a reload
//  keeps it (sessionStorage), an entry the app never saw
//  pushed (a link opened in a new tab) knows nothing, so it
//  never goes Back out of the app.
// -----------------------------------------------------------

import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RETURNING, lastUrlOf, previousUrl } from '@/utils/navigationMemory';


// A second return from the same entry this soon is the same
// click twice
const REPEAT_MS = 1000;







// -----------------------------------------------------------
// useReturnTo (default export)
// -----------------------------------------------------------
//
//   const returnTo = useReturnTo();
//   returnTo('/companies')                    — the back link
//   returnTo('/companies', { replace: true }) — after a delete:
//                                               the deleted
//                                               page's entry is
//                                               replaced when
//                                               the list is not
//                                               right behind
//
// `pathname` is the list's path, without a query.
//
// Used by:
//   - components/layout/PageLayout.jsx — PageHeader's back link
//   - pages/Companies/CompanyDetail.jsx — after the delete
//   - pages/Reports/ReportDetail.jsx — after the delete
//   - pages/Corpus/CorpusDocument.jsx — after the delete
// -----------------------------------------------------------

export default function useReturnTo() {

  const navigate = useNavigate();
  const { key } = useLocation();
  // The last return sent: a second one from the same entry
  // within REPEAT_MS is a double click — Back lands a moment
  // later, and going Back twice would leave the list too (a
  // later one is a new try: an unsaved-changes guard may have
  // kept the user here)
  const sent = useRef({ key: null, at: 0 });


  return useCallback((pathname, { replace = false } = {}) => {
    if (sent.current.key === key && Date.now() - sent.current.at < REPEAT_MS) return;
    sent.current = { key, at: Date.now() };
    const previous = previousUrl(key);
    if (previous && previous.split('?')[0] === pathname) {
      navigate(-1);
      return;
    }
    navigate(lastUrlOf(pathname) ?? pathname, { replace, state: RETURNING });
  }, [navigate, key]);
}
