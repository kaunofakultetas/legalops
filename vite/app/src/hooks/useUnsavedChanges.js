// -----------------------------------------------------------
//  [*] useUnsavedChanges — guard a dirty form
//
//  Two doors out of a page: the router (a sidebar link, the
//  back button) and the browser (reload, closing the tab).
//  The router door is held by useBlocker — the caller renders
//  UnsavedChangesDialog with the returned blocker — and the
//  browser door by the native beforeunload prompt. Search-
//  param changes on the same path (switching tabs) pass.
// -----------------------------------------------------------

import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';







// -----------------------------------------------------------
// useUnsavedChanges (default export)
// -----------------------------------------------------------
//
//   const blocker = useUnsavedChanges(isDirty);
//   <UnsavedChangesDialog blocker={blocker} />
//
// Used by:
//   - CompanyProfile.jsx — the profile editor
//   - PromptEditor.jsx — the prompt text editor
// -----------------------------------------------------------

export default function useUnsavedChanges(dirty) {

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname);


  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      // Legacy browsers read the prompt from returnValue
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);


  return blocker;
}
