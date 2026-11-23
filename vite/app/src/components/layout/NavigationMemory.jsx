// -----------------------------------------------------------
//  [*] NavigationMemory — the history tracker
//
//  Renders nothing. It sees every location the router
//  commits — the pages without the frame (the chat) included
//  — and records it in utils/navigationMemory.js: a pushed
//  entry learns the address before it, a replacing one keeps
//  what the replaced one knew, and every page its last
//  address. The pages' "back" links (useReturnTo) and the
//  URL drawers (useOverlayParam) read it to go Back when the
//  page they return to is right behind.
//
//  It must sit above every route: a push observed by one page
//  only would record the wrong entry behind the next (a page
//  left through the chat would remember the page before the
//  chat).
// -----------------------------------------------------------

import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { noteNavigation } from '@/utils/navigationMemory';







// -----------------------------------------------------------
// NavigationMemory (default export)
// -----------------------------------------------------------
//
// Records each committed location with how it came (PUSH,
// REPLACE, POP) and the location before it — in a layout
// effect, so the record exists before any click on the new
// page.
//
// Used by:
//   - App.jsx — above every route
//   - tests/support/render.jsx — renderPage's frame, like App
// -----------------------------------------------------------

export default function NavigationMemory() {

  const location = useLocation();
  const action = useNavigationType();
  const last = useRef(null);


  useLayoutEffect(() => {
    noteNavigation(location, action, last.current);
    last.current = location;
  }, [location, action]);


  return null;
}
