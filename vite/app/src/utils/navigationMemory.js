// -----------------------------------------------------------
//  [*] navigationMemory — what the app remembers of this tab's
//      history
//
//  Every page scrolls inside its own <main> (PageLayout), so
//  the browser's scroll restoration never sees the position
//  and React Router's <ScrollRestoration> (window scroll only)
//  cannot help. The app keeps the memory itself, per history
//  entry (React Router's location.key):
//
//    - the entry's address and its scroll position — Back /
//      Forward bring the position back (useScrollMemory)
//    - the address of the entry BEFORE it, known when it was
//      pushed — a page's own "back" link can then be a real
//      Back (useReturnTo)
//    - per address: the last scroll position, and per page
//      (pathname): the last address — a "back" link whose page
//      is not right behind still returns to the list as it
//      was left (its filters, its place)
//    - the positions of kept scrollers (the conversation
//      list, a provision tree) by name (useKeptScroll)
//
//  It lives in memory and is mirrored to sessionStorage (one
//  JSON item, written a moment after the last change and when
//  the page is hidden), so a reload of the tab keeps it — the
//  browser keeps the history's keys through a reload. Each
//  list is capped, the oldest dropped first; a stored value
//  of the wrong shape is ignored, and a storage that refuses
//  (private mode, a full quota) only costs the reload case.
//
//  A key the browser gives a fresh load ("default" — history
//  state is empty then) can reappear for another address: an
//  entry is trusted only while its address matches.
//
//  Split into:
//
//    RETURNING              — the location state of a return
//    OVERLAY                — the location state of an overlay
//    urlOf                  — a location → "/path?query"
//    isUrl, isTop, isKey    — the stored shapes believed
//    load                   — the memory, read on first use
//    save, scheduleSave     — the sessionStorage mirror
//    put                    — newest in, oldest out
//    entryOf                — an entry, if still its address
//    noteNavigation         — record a committed location
//    previousUrl            — the address before an entry
//    lastUrlOf              — the last address of a page
//    rememberScroll         — an entry's scroll position
//    recallScroll           — …read back
//    rememberKept           — a kept scroller's position
//    recallKept             — …read back
//    noteSearch             — a view write not landed yet
//    currentSearch          — the query a write composes on
//    forgetNavigationMemory — a clean slate (the test suite)
// -----------------------------------------------------------

// The sessionStorage item holding the whole memory
const STORAGE_KEY = 'complianceNavigation';

// How many of each are kept (the oldest go first): history
// entries, addresses, pages (their last address), kept
// scrollers
const LIMITS = { entries: 200, urls: 100, pages: 60, kept: 40 };

// A burst of scroll events is written once, this long after
// the last one
const SAVE_DELAY_MS = 250;

// The memory (null until first used: read from storage then)
let memory = null;

// The pending write, and whether the pagehide flush is wired
let saveTimer = null;
let flushWired = false;

// A view write whose navigation has not landed yet:
// {key, search} (see noteSearch)
let pending = null;







// -----------------------------------------------------------
// RETURNING
// -----------------------------------------------------------
//
// The location state of a navigation that RETURNS to a page
// (a "back" link whose page is not right behind): the page
// takes the scroll position it was left at, looked up by its
// address, instead of starting at the top.
//
// Used by:
//   - hooks/useReturnTo.js — sets it
//   - hooks/useScrollMemory.js — reads it
// -----------------------------------------------------------

export const RETURNING = Object.freeze({ returning: true });







// -----------------------------------------------------------
// OVERLAY
// -----------------------------------------------------------
//
// The location state of an overlay pushed over the page on
// screen (a details drawer in the address): the page stays
// where it is, although the entry is new.
//
// Used by:
//   - hooks/useOverlayParam.js — sets it
//   - hooks/useScrollMemory.js — reads it
// -----------------------------------------------------------

export const OVERLAY = Object.freeze({ overlay: true });







// -----------------------------------------------------------
// urlOf
// -----------------------------------------------------------
//
//   urlOf({ pathname: '/jobs', search: '?status=failed' })
//     → '/jobs?status=failed'
//
// A location's address without the hash — what the memory
// keys pages by.
//
// Used by:
//   - the functions below
//   - hooks/useOverlayParam.js — the address behind a drawer
// -----------------------------------------------------------

export function urlOf(location) {
  return `${location.pathname}${location.search || ''}`;
}







// -----------------------------------------------------------
// isUrl
// -----------------------------------------------------------
//
// A stored address must start with "/" (and stay a sane
// length) to be believed.
//
// Used by:
//   - load (below)
// -----------------------------------------------------------

const isUrl = (value) => typeof value === 'string' && value.startsWith('/') && value.length <= 4000;







// -----------------------------------------------------------
// isTop
// -----------------------------------------------------------
//
// A stored scroll position must be a finite, non-negative
// number of pixels.
//
// Used by:
//   - load (below)
// -----------------------------------------------------------

const isTop = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;







// -----------------------------------------------------------
// isKey
// -----------------------------------------------------------
//
// A stored history key or scroller name must be a short,
// non-empty string.
//
// Used by:
//   - load (below)
// -----------------------------------------------------------

const isKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;







// -----------------------------------------------------------
// load
// -----------------------------------------------------------
//
// The memory, read from sessionStorage on first use; every
// stored row of the wrong shape is skipped, an unreadable
// item (or a storage that throws) gives an empty memory.
// Wires the flush on pagehide once.
//
// Used by:
//   - every exported function (below)
// -----------------------------------------------------------

function load() {
  if (memory) return memory;
  memory = { entries: new Map(), urls: new Map(), pages: new Map(), kept: new Map() };
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    for (const [key, entry] of Array.isArray(stored?.entries) ? stored.entries : []) {
      if (!isKey(key) || !isUrl(entry?.url)) continue;
      memory.entries.set(key, {
        url: entry.url,
        ...(isTop(entry.top) ? { top: entry.top } : {}),
        ...(isUrl(entry.previous) ? { previous: entry.previous } : {}),
      });
    }
    for (const [url, top] of Array.isArray(stored?.urls) ? stored.urls : []) if (isUrl(url) && isTop(top)) memory.urls.set(url, top);
    for (const [path, url] of Array.isArray(stored?.pages) ? stored.pages : []) if (isUrl(path) && isUrl(url)) memory.pages.set(path, url);
    for (const [name, top] of Array.isArray(stored?.kept) ? stored.kept : []) if (isKey(name) && isTop(top)) memory.kept.set(name, top);
  } catch {
    // Unreadable or no storage — start empty
  }
  if (!flushWired && typeof window !== 'undefined') {
    flushWired = true;
    window.addEventListener('pagehide', save);
  }
  return memory;
}







// -----------------------------------------------------------
// save
// -----------------------------------------------------------
//
// Writes the memory as one JSON item now; a storage that
// refuses (full, blocked) is ignored — the memory still works
// for this tab.
//
// Used by:
//   - load (above) — on pagehide
//   - scheduleSave (below) — the delayed write
// -----------------------------------------------------------

function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!memory) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      entries: [...memory.entries], urls: [...memory.urls], pages: [...memory.pages], kept: [...memory.kept],
    }));
  } catch {
    // Full or blocked — the memory still works for this tab
  }
}







// -----------------------------------------------------------
// scheduleSave
// -----------------------------------------------------------
//
// Saves SAVE_DELAY_MS after the last change, so a burst of
// scroll events costs one write.
//
// Used by:
//   - the recording functions (below)
// -----------------------------------------------------------

function scheduleSave() {
  if (saveTimer === null) saveTimer = setTimeout(save, SAVE_DELAY_MS);
}







// -----------------------------------------------------------
// put
// -----------------------------------------------------------
//
// Sets a value as the newest of its map, dropping the oldest
// beyond `limit` (a Map iterates in insertion order).
//
// Used by:
//   - the recording functions (below)
// -----------------------------------------------------------

function put(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}







// -----------------------------------------------------------
// entryOf
// -----------------------------------------------------------
//
// The stored entry of a location — only while its address
// still matches (a reused "default" key is another page).
//
// Used by:
//   - noteNavigation, rememberScroll, recallScroll (below)
// -----------------------------------------------------------

function entryOf(location) {
  const entry = load().entries.get(location.key);
  return entry && entry.url === urlOf(location) ? entry : null;
}







// -----------------------------------------------------------
// noteNavigation
// -----------------------------------------------------------
//
//   noteNavigation(location, 'PUSH', previousLocation)
//
// Records a committed location: a pushed entry learns the
// address before it, a replacing one inherits what the entry
// it replaced knew (a tab switch must not forget the list
// behind the page), a popped one keeps what was recorded when
// it was made. The page's last address follows. A view write
// still waiting to land is done with.
//
// Used by:
//   - components/layout/NavigationMemory.jsx — every
//     committed location
// -----------------------------------------------------------

export function noteNavigation(location, action, from) {
  const { entries, pages } = load();
  const entry = { ...(entryOf(location) ?? { url: urlOf(location) }) };
  if (action === 'PUSH' && from) entry.previous = urlOf(from);
  if (action === 'REPLACE' && from) {
    const replaced = entries.get(from.key);
    if (replaced?.previous) entry.previous = replaced.previous;
    else delete entry.previous;
  }
  put(entries, location.key, entry, LIMITS.entries);
  put(pages, location.pathname, urlOf(location), LIMITS.pages);
  pending = null;
  scheduleSave();
}







// -----------------------------------------------------------
// previousUrl
// -----------------------------------------------------------
//
// The address of the history entry right before the entry
// `key` (known when that entry was pushed), or null.
//
// Used by:
//   - hooks/useReturnTo.js — is the list right behind?
//   - hooks/useOverlayParam.js — is the page without the
//     drawer right behind?
// -----------------------------------------------------------

export function previousUrl(key) {
  return load().entries.get(key)?.previous ?? null;
}







// -----------------------------------------------------------
// lastUrlOf
// -----------------------------------------------------------
//
//   lastUrlOf('/reports') → '/reports?status=done' (or null)
//
// The last address the page `pathname` was seen with.
//
// Used by:
//   - hooks/useReturnTo.js — the list as it was left
// -----------------------------------------------------------

export function lastUrlOf(pathname) {
  return load().pages.get(pathname) ?? null;
}







// -----------------------------------------------------------
// rememberScroll
// -----------------------------------------------------------
//
// Stores `top` as the scroll position of the location's
// entry and of its address.
//
// Used by:
//   - hooks/useScrollMemory.js — scrolls and positionings
// -----------------------------------------------------------

export function rememberScroll(location, top) {
  const { entries, urls } = load();
  const url = urlOf(location);
  put(entries, location.key, { ...(entryOf(location) ?? { url }), top }, LIMITS.entries);
  put(urls, url, top, LIMITS.urls);
  scheduleSave();
}







// -----------------------------------------------------------
// recallScroll
// -----------------------------------------------------------
//
//   recallScroll(location)                  — this entry's
//   recallScroll(location, { byUrl: true }) — the last one
//                                             at its address
//
// A remembered position, or undefined.
//
// Used by:
//   - hooks/useScrollMemory.js — Back / Forward and returns
// -----------------------------------------------------------

export function recallScroll(location, { byUrl = false } = {}) {
  if (byUrl) return load().urls.get(urlOf(location));
  return entryOf(location)?.top;
}







// -----------------------------------------------------------
// rememberKept
// -----------------------------------------------------------
//
// Stores the position of a kept scroller by its name
// ("chat.threads", "corpus.tree.<id>"): one position per
// name, whatever the history entry.
//
// Used by:
//   - hooks/useKeptScroll.js — its scrolls
// -----------------------------------------------------------

export function rememberKept(name, top) {
  put(load().kept, name, top, LIMITS.kept);
  scheduleSave();
}







// -----------------------------------------------------------
// recallKept
// -----------------------------------------------------------
//
// The remembered position of a kept scroller, or undefined.
//
// Used by:
//   - hooks/useKeptScroll.js — on mount
// -----------------------------------------------------------

export function recallKept(name) {
  return load().kept.get(name);
}







// -----------------------------------------------------------
// noteSearch
// -----------------------------------------------------------
//
// A view write (a filter, a table page) navigates with
// replace, and React Router renders the new address in a
// transition — so a second write in the same moment (the
// grid resets the page right after a sort) would compose on
// the query its component last RENDERED and undo the first.
// noteSearch records the query a write was sent with, for
// the entry it was sent from; noteNavigation drops it once
// the navigation lands.
//
// Used by:
//   - hooks/useViewParams.js, hooks/useOverlayParam.js
// -----------------------------------------------------------

export function noteSearch(location, search) {
  pending = { key: location.key, search };
}







// -----------------------------------------------------------
// currentSearch
// -----------------------------------------------------------
//
// The query the next write from this entry composes on: the
// one noteSearch recorded while its navigation is on its
// way, else the location's own.
//
// Used by:
//   - hooks/useViewParams.js, hooks/useOverlayParam.js
// -----------------------------------------------------------

export function currentSearch(location) {
  return pending && pending.key === location.key ? pending.search : (location.search || '');
}







// -----------------------------------------------------------
// forgetNavigationMemory
// -----------------------------------------------------------
//
// Drops the memory, its stored copy and any pending write —
// a test starts with a tab that has no history.
//
// Used by:
//   - tests/support/setup.js — the per-test slate
// -----------------------------------------------------------

export function forgetNavigationMemory() {
  clearTimeout(saveTimer);
  saveTimer = null;
  memory = null;
  pending = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // No storage — nothing stored either
  }
}
