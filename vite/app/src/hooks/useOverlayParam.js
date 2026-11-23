// -----------------------------------------------------------
//  [*] useOverlayParam — a details overlay that lives in the
//      address
//
//  The two read-only overlays that show one record by its id
//  and link away from the page — a job's details drawer
//  (?job=) and an AI call's dialog (?call=) — are history
//  entries of their own:
//
//    - opening one PUSHES the page's address plus the id, so
//      Back (a phone's back gesture too) closes it, and a
//      link followed from inside it comes Back to it open;
//    - closing one is a real Back when the page without it is
//      right behind (NavigationMemory), so opening and closing
//      leaves no trace in the history; opened from a link
//      (the address carried the id), closing REPLACES the
//      address without the id — Back then leaves the page as
//      it would have.
//
//  The page stays mounted throughout (same path), and the
//  pushed entry says it is an overlay (OVERLAY), so its
//  scroll never moves (useScrollMemory).
// -----------------------------------------------------------

import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OVERLAY, currentSearch, noteSearch, previousUrl } from '@/utils/navigationMemory';


// A second close from the same entry this soon is the same
// click twice
const REPEAT_MS = 1000;







// -----------------------------------------------------------
// sameAddress
// -----------------------------------------------------------
//
//   sameAddress('/jobs?kind=x&status=y', '/jobs?status=y&kind=x') → true
//
// Two addresses name the same page and query, whatever the
// parameters' order.
//
// Used by:
//   - useOverlayParam (below)
// -----------------------------------------------------------

function sameAddress(a, b) {
  const [pathA, queryA = ''] = a.split('?');
  const [pathB, queryB = ''] = b.split('?');
  const sorted = (query) => [...new URLSearchParams(query)].map(([k, v]) => `${k}=${v}`).sort().join('&');
  return pathA === pathB && sorted(queryA) === sorted(queryB);
}







// -----------------------------------------------------------
// useOverlayParam (default export)
// -----------------------------------------------------------
//
//   const [jobId, openJob, closeJob] = useOverlayParam('job', isId);
//   <IconAction onClick={() => openJob(row.id)} />
//   <Drawer open={Boolean(jobId)} onClose={closeJob} />
//
// `valid(value)` screens the address's value — anything it
// refuses reads as "closed" (default: any non-empty value).
//
// Used by:
//   - pages/Jobs/Jobs.jsx — the job details drawer (?job=)
//   - pages/Usage/Usage.jsx — the AI call dialog (?call=)
// -----------------------------------------------------------

export default function useOverlayParam(name, valid = Boolean) {

  const location = useLocation();
  const navigate = useNavigate();
  const raw = useMemo(() => new URLSearchParams(location.search).get(name), [location.search, name]);
  const value = raw && valid(raw) ? raw : null;
  // The last close sent: a second one from the same entry
  // within REPEAT_MS (a double click, Escape on top of a
  // click) must not go Back twice — out of the page
  const closed = useRef({ key: null, at: 0 });


  const open = useCallback((id) => {
    const next = new URLSearchParams(currentSearch(location));
    next.set(name, id);
    navigate({ pathname: location.pathname, search: `?${next}`, hash: location.hash }, { state: OVERLAY });
  }, [location, navigate, name]);


  const close = useCallback(() => {
    if (closed.current.key === location.key && Date.now() - closed.current.at < REPEAT_MS) return;
    closed.current = { key: location.key, at: Date.now() };
    const next = new URLSearchParams(currentSearch(location));
    next.delete(name);
    const search = next.toString() ? `?${next}` : '';
    const previous = previousUrl(location.key);
    if (previous && sameAddress(previous, `${location.pathname}${search}`)) {
      navigate(-1);
      return;
    }
    noteSearch(location, search);
    navigate({ pathname: location.pathname, search, hash: location.hash }, { replace: true });
  }, [location, navigate, name]);


  return [value, open, close];
}
