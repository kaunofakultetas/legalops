// -----------------------------------------------------------
//  [*] Sidebar — the navigation, filtered by role
//
//  From md up a column that folds, like tracer's: pinned, it
//  is a classic column of icons and labels; unpinned, a
//  narrow rail of icons that holds its place in the layout,
//  and pointing at it — or tabbing into it — opens the full
//  panel OVER the page, which does not move, folding again a
//  moment after the pointer or the focus leaves; a page
//  opened from it keeps it open under the pointer. The pin
//  button atop the column — tracer's ink bar with a pin and
//  no words — switches between the two, and the choice is
//  kept in localStorage, so every page opens the column the
//  way the user left it. Pinned is the default.
//
//  Below md a temporary Drawer the navbar's menu button opens
//  (state shared through NavDrawer), so a phone page gets the
//  full width; it always shows the whole menu, pin or no
//  pin. The drawer closes itself on every route change and
//  when the window grows past md.
//
//  An item with `admin: true` is hidden from the user role
//  (the routes are guarded too — PageWrapper). An item is
//  active when the path matches one of its `match` patterns
//  (default: its own path), so Chat stays highlighted on
//  /chat/<id> and Companies on /companies/<id>. Labels come
//  from messages/sidebar as "<SECTION>.<key>".
//
//  Screen readers get what the eye gets: each section is a
//  group named by its title, the current page's link carries
//  aria-current, and the drawer — a modal dialog in MUI — is
//  named like the navigation it holds. On the rail the labels
//  and the titles are only faded out, so every link and group
//  keeps its name.
//
//  Split into (root component last):
//
//    SECTIONS       — the navigation tree
//    PINNED_KEY     — the pin's localStorage key
//    RAIL_WIDTH     — the folded column, in px
//    PANEL_WIDTH    — the open column, in px
//    CLOSE_DELAY_MS — the fly-over's grace before folding
//    isItemActive   — does the path belong to this item
//    readPinned     — the stored pin
//    usePinned      — the pin and its toggle, stored
//    useFlyOver     — the rail opened by pointer or focus
//    SidebarItem    — one link row
//    SectionTitle   — a group's title, a hairline on the rail
//    NavSections    — the titled groups
//    PinButton      — dock / undock, atop the column
//    RailColumn     — the folding column (md+)
//    DrawerHeader   — the phone drawer's title + close button
//    Sidebar        — both forms (default export)
// -----------------------------------------------------------

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslations } from '@/i18n';
import { useNavDrawer } from '@/components/layout/NavDrawer';
import Wordmark from '@/components/layout/Wordmark';
import IconAction from '@/components/IconAction/IconAction';


// The navigation tree; `match` lists the path patterns that
// keep an item highlighted (its detail pages)
const SECTIONS = [
  {
    key: 'MAIN',
    items: [
      { key: 'chat', to: '/', icon: ChatOutlinedIcon, match: ['/', '/chat/*'] },
      { key: 'dashboard', to: '/dashboard', icon: DashboardOutlinedIcon },
    ],
  },
  {
    key: 'COMPLIANCE',
    items: [
      { key: 'companies', to: '/companies', icon: BusinessOutlinedIcon, match: ['/companies/*'] },
      { key: 'reports', to: '/reports', icon: AssessmentOutlinedIcon, match: ['/reports/*'] },
    ],
  },
  {
    key: 'LAW',
    items: [
      { key: 'corpus', to: '/corpus', icon: GavelOutlinedIcon, match: ['/corpus/*'] },
      { key: 'obligations', to: '/obligations', icon: FactCheckOutlinedIcon, admin: true },
    ],
  },
  {
    key: 'ADMIN',
    items: [
      { key: 'prompts', to: '/prompts', icon: PsychologyOutlinedIcon, admin: true, match: ['/prompts/*'] },
      { key: 'mcp', to: '/settings/mcp', icon: HubOutlinedIcon, admin: true },
      { key: 'users', to: '/users', icon: PeopleOutlineIcon, admin: true },
      { key: 'audit', to: '/audit', icon: HistoryOutlinedIcon, admin: true },
    ],
  },
  {
    key: 'SYSTEM',
    items: [
      { key: 'usage', to: '/usage', icon: QueryStatsOutlinedIcon },
      { key: 'jobs', to: '/jobs', icon: PendingActionsOutlinedIcon },
      { key: 'account', to: '/account', icon: ManageAccountsOutlinedIcon },
    ],
  },
];

// localStorage key of the pin: "false" when the user folded
// the column to the rail; anything else is pinned
const PINNED_KEY = 'sidebar.pinned';

// The rail centres the row icons on it (a 3 px stripe, 16 px
// of padding, a 20 px icon), so they stay put while the
// panel opens and folds
const RAIL_WIDTH = 58;

// The open column, wide enough for the longest label in
// either language
const PANEL_WIDTH = 224;

// How long the fly-over stays open after the pointer or the
// focus leaves it
const CLOSE_DELAY_MS = 200;







// -----------------------------------------------------------
// isItemActive
// -----------------------------------------------------------
//
// True when `pathname` matches one of the item's patterns
// (exact match of `to` when it lists none).
//
// Used by:
//   - NavSections (below)
// -----------------------------------------------------------

function isItemActive(item, pathname) {
  return (item.match || [item.to]).some((pattern) => matchPath({ path: pattern, end: true }, pathname));
}







// -----------------------------------------------------------
// readPinned
// -----------------------------------------------------------
//
// The stored pin: pinned unless the user folded the column,
// and pinned too where storage is unavailable (a private
// window), so the menu is never hidden by accident.
//
// Used by:
//   - usePinned (below)
// -----------------------------------------------------------

function readPinned() {
  try {
    return localStorage.getItem(PINNED_KEY) !== 'false';
  } catch {
    return true;
  }
}







// -----------------------------------------------------------
// usePinned
// -----------------------------------------------------------
//
// The pin and its toggle. Every page mounts a sidebar of its
// own, so the choice is read on mount and stored on every
// switch — the next page opens the column the same way, with
// no animation on arrival.
//
// Used by:
//   - RailColumn (below)
// -----------------------------------------------------------

function usePinned() {

  const [pinned, setPinned] = useState(readPinned);


  const toggle = () => {
    const next = !pinned;
    setPinned(next);
    try { localStorage.setItem(PINNED_KEY, String(next)); } catch { /* storage off */ }
  };


  return [pinned, toggle];
}







// -----------------------------------------------------------
// useFlyOver
// -----------------------------------------------------------
//
// Whether the rail is opened over the page: the pointer or
// the keyboard focus entering the panel opens it at once,
// leaving folds it CLOSE_DELAY_MS later. The delay is what
// keeps a Tab from one link to the next (the focus leaves,
// then lands again) and a brief slip past the edge from
// flickering it shut.
//
// The pointer is also kept in NavDrawer's railPointer: a
// click on a link opens a page that mounts a sidebar of its
// own, and that one starts open when the pointer was over
// the old fly-over — it used to fold under the pointer until
// a move brought it back. The keyboard focus is not carried,
// as the new page does not keep it. A panel opened that way
// never saw the pointer come in, so it gets no mouseleave
// when the first move already lands outside it: that first
// move, watched on the document, decides.
//
// Used by:
//   - RailColumn (below) — `panelRef` is its panel
// -----------------------------------------------------------

function useFlyOver(panelRef) {

  const { railPointer } = useNavDrawer();
  const [shown, setShown] = useState(() => railPointer.current);
  const timer = useRef(null);


  const show = useCallback(() => {
    clearTimeout(timer.current);
    setShown(true);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), CLOSE_DELAY_MS);
  }, []);

  const enter = useCallback(() => {
    railPointer.current = true;
    show();
  }, [railPointer, show]);

  const leave = useCallback(() => {
    railPointer.current = false;
    hide();
  }, [railPointer, hide]);


  useEffect(() => () => clearTimeout(timer.current), []);


  // Opened by the previous page: the first move decides
  useEffect(() => {
    if (!railPointer.current) return undefined;
    const first = (event) => {
      document.removeEventListener('pointermove', first);
      if (!panelRef.current?.contains(event.target)) leave();
    };
    document.addEventListener('pointermove', first);
    return () => document.removeEventListener('pointermove', first);
  }, [railPointer, panelRef, leave]);


  return { shown, show, hide, enter, leave };
}







// -----------------------------------------------------------
// SidebarItem
// -----------------------------------------------------------
//
// One row; the active route gets the current-place tint (the
// mark's blue), ink text in bold, the brand's yellow as a
// stripe at its left edge — the marker on the page you are
// on — and aria-current="page". The other rows keep their
// icons in graphite, so the one place in ink is where the
// reader is. `folded` (the rail) fades the label out; it
// stays the link's name, and the row never wraps while the
// panel opens.
//
// Used by:
//   - NavSections (below)
// -----------------------------------------------------------

function SidebarItem({ to, icon: Icon, label, active, folded }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 px-4 py-[7px] text-sm no-underline whitespace-nowrap border-l-[3px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? 'border-marker bg-primary-light/12 text-primary font-semibold' : 'border-transparent text-content hover:bg-primary-light/6'}`}
    >
      <Icon fontSize="small" aria-hidden className={`shrink-0 ${active ? '' : 'text-muted'}`} />
      <span className={`transition-opacity duration-200 ${folded ? 'opacity-0' : 'opacity-100'}`}>{label}</span>
    </Link>
  );
}







// -----------------------------------------------------------
// SectionTitle
// -----------------------------------------------------------
//
// A group's small title, `id` naming the group. On the rail
// the words fade out and a hairline takes their place, so
// the groups stay apart; the words stay in the page — they
// still name the group for a screen reader — and the row
// keeps its height, so the links never jump while the panel
// opens.
//
// Used by:
//   - NavSections (below)
// -----------------------------------------------------------

function SectionTitle({ id, title, folded }) {
  return (
    <div className="relative h-6 flex items-end px-[19px] pb-1">
      <span id={id} className={`text-xs font-semibold text-muted whitespace-nowrap transition-opacity duration-200 ${folded ? 'opacity-0' : 'opacity-100'}`}>
        {title}
      </span>
      {folded && <span aria-hidden className="absolute left-3 right-3 top-1/2 border-t border-edge" />}
    </div>
  );
}







// -----------------------------------------------------------
// NavSections
// -----------------------------------------------------------
//
// The sections whose items survive the role filter, each
// under its small title — a group named by that title (the
// title ids are per instance: the column and the drawer both
// render the sections). The titles stay in sentence case, as
// written: tracked capitals are harder to read in Lithuanian,
// and some screen readers spell a short all-caps word letter
// by letter ("L-A-W"). `folded` draws them for the rail.
//
// Used by:
//   - RailColumn (below)
//   - Sidebar (below) — in the drawer
// -----------------------------------------------------------

function NavSections({ authData, folded = false }) {

  const t = useTranslations('sidebar');
  const { pathname } = useLocation();
  const id = useId();
  const isAdmin = authData?.role === 'admin';


  return SECTIONS.map((section) => {
    const items = section.items.filter((item) => !item.admin || isAdmin);
    if (items.length === 0) return null;
    const titleId = `${id}-${section.key}`;
    return (
      <div key={section.key} role="group" aria-labelledby={titleId} className="mb-4">
        <SectionTitle id={titleId} title={t(`${section.key}.TITLE`)} folded={folded} />
        {items.map((item) => (
          <SidebarItem key={item.key} to={item.to} icon={item.icon} label={t(`${section.key}.${item.key}`)}
                       active={isItemActive(item, pathname)} folded={folded} />
        ))}
      </div>
    );
  });
}







// -----------------------------------------------------------
// PinButton
// -----------------------------------------------------------
//
// The dock / undock bar atop the column, as in tracer: an ink
// strip across the column's width holding a white pin alone
// — solid while the column is pinned, outlined on the rail —
// so on the rail it narrows to the icons' width. The words
// are the button's name and its tooltip, and say what a
// click will do.
//
// Used by:
//   - RailColumn (below)
// -----------------------------------------------------------

function PinButton({ pinned, onToggle }) {

  const t = useTranslations('sidebar');
  const label = pinned ? t('PIN.unpin') : t('PIN.pin');
  const Icon = pinned ? PushPinIcon : PushPinOutlinedIcon;


  return (
    <div className="px-[10px] mb-2">
      <Tooltip title={label} placement="right" describeChild disableInteractive>
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          className="w-full h-[30px] flex items-center justify-center text-white bg-primary border-0 rounded cursor-pointer outline-none transition-colors hover:bg-primary-dark active:translate-y-px focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Icon aria-hidden sx={{ fontSize: 18, opacity: pinned ? 1 : 0.85 }} />
        </button>
      </Tooltip>
    </div>
  );
}







// -----------------------------------------------------------
// RailColumn
// -----------------------------------------------------------
//
// The column from md up, in two boxes as in tracer. The SLOT
// is the navigation landmark and holds the layout's width:
// the whole panel when pinned, the rail otherwise. The PANEL
// sits absolutely inside it, so on the rail the fly-over
// opens over the page, with the floating shadow, and nothing
// beside it moves. Both widths animate; reduced motion stops
// that (globals.css).
//
// The slot and the panel are as tall as the row they stand
// in, and under a page that row is as long as the page. The
// links are a block of their own inside the panel that keeps
// to the top of the screen while the page scrolls: it is as
// tall as the frame's scrolling area (a size container — the
// browser's own window where a frame has none, as in the
// chat) less the room the page's footer takes when it comes
// into sight at the page's end, so the footer never pushes
// the links off the screen.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function RailColumn({ authData }) {

  const t = useTranslations('sidebar');
  const panelRef = useRef(null);
  const [pinned, togglePinned] = usePinned();
  const { shown, show, hide, enter, leave } = useFlyOver(panelRef);
  const open = pinned || shown;


  return (
    <nav
      aria-label={t('LABEL')}
      className="hidden md:block relative shrink-0 transition-[width] duration-200 ease-out"
      style={{ width: pinned ? PANEL_WIDTH : RAIL_WIDTH }}
    >
      <div
        ref={panelRef}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={show}
        onBlur={hide}
        className={`absolute inset-y-0 left-0 z-40 bg-surface border-r border-edge transition-[width,box-shadow] duration-200 ease-out ${open && !pinned ? 'shadow-float' : ''}`}
        style={{ width: open ? PANEL_WIDTH : RAIL_WIDTH }}
      >
        <div className="sticky top-0 h-[calc(100cqh-2rem)] max-h-full overflow-y-auto overflow-x-hidden py-3">
          <PinButton pinned={pinned} onToggle={togglePinned} />
          <NavSections authData={authData} folded={!open} />
        </div>
      </div>
    </nav>
  );
}







// -----------------------------------------------------------
// DrawerHeader
// -----------------------------------------------------------
//
// The phone drawer's top row: the wordmark and a close
// button.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function DrawerHeader({ onClose }) {
  const t = useTranslations('navbar');
  const tCommon = useTranslations('COMPONENTS.common');
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-edge">
      <p className="m-0 min-w-0 flex"><Wordmark name={t('title')} /></p>
      <IconAction label={tCommon('closeMenu')} icon={<CloseIcon />} onClick={onClose} />
    </div>
  );
}







// -----------------------------------------------------------
// Sidebar (default export)
// -----------------------------------------------------------
//
// The folding column (md+) and the phone drawer; the column
// is hidden by CSS below md, so no flash on first paint.
//
// Used by:
//   - PageLayout.jsx — every signed-in page
//   - pages/Chat/Chat.jsx — the chat frame
// -----------------------------------------------------------

export default function Sidebar({ authData }) {

  const t = useTranslations('sidebar');
  const { open, setOpen } = useNavDrawer();
  const { pathname } = useLocation();
  const wide = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });


  // A tapped link means a new route — the drawer has done
  // its job
  useEffect(() => { setOpen(false); }, [pathname, setOpen]);


  // Growing past md shows the column; a drawer left open
  // would cover it
  useEffect(() => { if (wide) setOpen(false); }, [wide, setOpen]);


  return (
    <>
      <RailColumn authData={authData} />
      <Drawer
        id="app-navigation-drawer"
        variant="temporary"
        open={open && !wide}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { className: 'w-72 max-w-[85vw]', 'aria-label': t('LABEL') } }}
      >
        <DrawerHeader onClose={() => setOpen(false)} />
        <nav aria-label={t('LABEL')} className="overflow-y-auto py-3">
          <NavSections authData={authData} />
        </nav>
      </Drawer>
    </>
  );
}
