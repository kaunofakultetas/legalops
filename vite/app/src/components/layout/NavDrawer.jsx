// -----------------------------------------------------------
//  [*] NavDrawer — the navigation's state across pages
//
//  Below the md breakpoint the sidebar is a temporary Drawer
//  opened by the navbar's menu button. The two live in
//  different components (and the chat page renders both on
//  its own), so the open flag is shared through this
//  context, provided once above every page.
//
//  Every page also mounts a sidebar of its own, so what the
//  desktop rail must remember across a page change lives
//  here too: whether the pointer is over its fly-over. A
//  page opened from the fly-over then starts with it open,
//  under the pointer that is still on it (Sidebar.jsx). That
//  one is a ref: it is read when a sidebar mounts, and a
//  hover must not re-render the bar.
//
//  Split into (root component last):
//
//    useNavDrawer      — {open, setOpen, toggle, railPointer}
//    NavDrawerProvider — the provider (named export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the provider and its hook belong together */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';


// The defaults serve a bar rendered outside the provider:
// the menu button then simply does nothing
const NavDrawerContext = createContext({ open: false, setOpen: () => {}, toggle: () => {}, railPointer: { current: false } });







// -----------------------------------------------------------
// useNavDrawer
// -----------------------------------------------------------
//
// The drawer state for the button that opens it and the
// sidebar that renders it, and the rail's pointer flag.
//
// Used by:
//   - Navbar.jsx — MenuButton
//   - Sidebar.jsx — the phone Drawer; the rail's fly-over
// -----------------------------------------------------------

export function useNavDrawer() {
  return useContext(NavDrawerContext);
}







// -----------------------------------------------------------
// NavDrawerProvider
// -----------------------------------------------------------
//
// Holds the flag and the rail's pointer ref; the value is
// memoised so the consumers re-render only when the drawer
// flag flips.
//
// Used by:
//   - providers.jsx — around every page
// -----------------------------------------------------------

export function NavDrawerProvider({ children }) {

  const [open, setOpen] = useState(false);
  const railPointer = useRef(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const value = useMemo(() => ({ open, setOpen, toggle, railPointer }), [open, toggle]);


  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
}
