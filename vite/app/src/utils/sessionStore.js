// -----------------------------------------------------------
//  [*] sessionStore — the ephemeral view state of this tab
//
//  What a user would expect to find again but nobody would
//  share — which accordions are open, how many "Show more"
//  pages a list shows, which cards are expanded, the last
//  answer of a search tool — is kept per page part in
//  sessionStorage: it survives leaving the page and coming
//  back (Back, a link, a reload of the tab) and dies with the
//  tab. Shareable view state goes to the address instead
//  (useViewParams).
//
//  Every value is one JSON item under "view.<key>". At most
//  MAX_KEYS are kept — the least recently written go first —
//  so a long session over many reports and acts cannot fill
//  the quota. A stored value that does not parse or that the
//  caller's check refuses reads as the caller's default; a
//  storage that throws (private mode, a full quota) keeps
//  nothing and breaks nothing.
//
//  Split into:
//
//    PREFIX            — the items' key prefix
//    INDEX_KEY         — the item listing the keys, oldest first
//    MAX_KEYS          — how many values are kept
//    readSession       — a value, checked
//    remember          — the index: newest in, oldest out
//    writeSession      — a value, stored
// -----------------------------------------------------------

// The prefix of every item this store writes
const PREFIX = 'view.';

// The item listing the stored keys, least recently written
// first (the eviction order)
const INDEX_KEY = 'view.index';

// How many values are kept at most
const MAX_KEYS = 60;







// -----------------------------------------------------------
// readSession
// -----------------------------------------------------------
//
//   readSession('report.42.pages', { key: '', limits: {} }, isPaging)
//
// The value stored under `key`, when it parses and
// `valid(value)` accepts it — else `fallback`.
//
// Used by:
//   - hooks/useSessionState.js — the initial value
//   - pages/Reports/ReportFindings.jsx — the cards' and
//     groups' memories, read once per report
// -----------------------------------------------------------

export function readSession(key, fallback, valid = () => true) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}







// -----------------------------------------------------------
// remember
// -----------------------------------------------------------
//
// Moves `key` to the newest end of the index and drops the
// values beyond MAX_KEYS, oldest first. Throws what the
// storage throws (writeSession catches it).
//
// Used by:
//   - writeSession (below)
// -----------------------------------------------------------

function remember(key) {
  let index;
  try {
    index = JSON.parse(sessionStorage.getItem(INDEX_KEY) || '[]');
  } catch {
    index = [];
  }
  const keys = [...(Array.isArray(index) ? index.filter((item) => typeof item === 'string' && item !== key) : []), key];
  while (keys.length > MAX_KEYS) sessionStorage.removeItem(PREFIX + keys.shift());
  sessionStorage.setItem(INDEX_KEY, JSON.stringify(keys));
}







// -----------------------------------------------------------
// writeSession
// -----------------------------------------------------------
//
//   writeSession('report.42.pages', { key, limits })
//
// Stores a JSON-able value under `key`; a storage that
// refuses is ignored.
//
// Used by:
//   - hooks/useSessionState.js — every change
//   - pages/Reports/ReportFindings.jsx — the cards' and
//     groups' memories
// -----------------------------------------------------------

export function writeSession(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    remember(key);
  } catch {
    // Full or blocked — the value lives on in the page only
  }
}

