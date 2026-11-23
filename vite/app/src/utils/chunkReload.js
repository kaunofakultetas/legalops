// -----------------------------------------------------------
//  [*] chunkReload — recover a tab that outlived a deploy
//
//  Pages are lazy chunks with hashed names. A tab opened
//  before a deploy asks for chunk files that no longer exist;
//  the dynamic import fails and the page would stay broken.
//  The fix is one full reload (the new index.html names the
//  new chunks). A timestamp in sessionStorage stops a reload
//  loop when the failure is real (the server is down): a
//  second failure within RELOAD_WINDOW_MS is left to the
//  error page instead.
//
//  Split into:
//
//    isChunkLoadError — does this error mean "chunk is gone"
//    reloadOnce       — reload, unless we just did
// -----------------------------------------------------------

// The storage key remembering the last automatic reload
const STORAGE_KEY = 'complianceChunkReloadAt';

// A failure again within this window is not retried
const RELOAD_WINDOW_MS = 30_000;

// The wordings Chrome, Firefox and Safari use for a failed
// dynamic import or CSS preload
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk .* failed/i;







// -----------------------------------------------------------
// isChunkLoadError
// -----------------------------------------------------------
//
// True for the browsers' "this module could not be fetched"
// errors, whatever wrapped them.
//
// Used by:
//   - pages/RouteError/RouteError.jsx — the route error page
// -----------------------------------------------------------

export function isChunkLoadError(error) {
  const message = typeof error === 'string' ? error : `${error?.message ?? ''} ${error?.cause?.message ?? ''}`;
  return CHUNK_ERROR.test(message);
}







// -----------------------------------------------------------
// reloadOnce
// -----------------------------------------------------------
//
// Reloads the page and answers true — or answers false
// without reloading when the previous automatic reload was
// less than RELOAD_WINDOW_MS ago.
//
// Used by:
//   - console.jsx — the vite:preloadError listener
//   - pages/RouteError/RouteError.jsx — a failed lazy page
// -----------------------------------------------------------

export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode) — reload anyway; the
    // worst case is one extra reload, not a loop, because the
    // error page shows when the reload fails the same way
  }
  window.location.reload();
  return true;
}
