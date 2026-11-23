// -----------------------------------------------------------
//  [*] Navbar — the top bar
//
//  Shown on every signed-in page: the menu button (phones
//  only — it opens the navigation drawer), the wordmark as a
//  real link home, the LT/EN switch and the account menu
//  with "Account" and "Log out". Logging out asks the backend
//  to kill the session, drops the token either way and
//  replaces the page with /login (Back cannot return to the
//  signed-in page).
//
//  On phones the language switch shrinks to its code and the
//  account button to its icon; both keep a full accessible
//  name. The account menu is named after the person and
//  described by their e-mail and role, which it shows above
//  its items — a screen reader reads all three on entering.
//
//  Split into (root component last):
//
//    MenuButton     — opens the phone navigation drawer
//    LanguageButton — the LT/EN toggle
//    AccountHeader  — who is signed in, atop the menu
//    AccountMenu    — the name button and its menu
//    Navbar         — the bar itself (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popover from '@mui/material/Popover';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import api from '@/api/client';
import { clearToken } from '@/auth/token';
import { useLocale, useSetLocale, useTranslations } from '@/i18n';
import { useNavDrawer } from '@/components/layout/NavDrawer';
import Wordmark from '@/components/layout/Wordmark';
import useEnumLabel from '@/hooks/useEnumLabel';
import { CONSOLE_LOGIN } from '@/paths';







// -----------------------------------------------------------
// MenuButton
// -----------------------------------------------------------
//
// The hamburger below md; announces the drawer's state.
//
// Used by:
//   - Navbar (below)
// -----------------------------------------------------------

function MenuButton() {
  const t = useTranslations('COMPONENTS.common');
  const { open, toggle } = useNavDrawer();
  return (
    <IconButton
      color="inherit"
      edge="start"
      className="md:hidden"
      aria-label={open ? t('closeMenu') : t('openMenu')}
      aria-expanded={open}
      aria-controls="app-navigation-drawer"
      onClick={toggle}
    >
      <MenuIcon />
    </IconButton>
  );
}







// -----------------------------------------------------------
// LanguageButton
// -----------------------------------------------------------
//
// Shows the OTHER language (its name from sm up, its code
// below) and switches to it; the name is marked with its
// own lang so a screen reader pronounces it right.
//
// Used by:
//   - Navbar (below)
// -----------------------------------------------------------

function LanguageButton() {

  const t = useTranslations('navbar');
  const locale = useLocale();
  const setLocale = useSetLocale();
  const target = locale === 'lt' ? 'en' : 'lt';


  return (
    <Button
      size="small"
      color="inherit"
      onClick={() => setLocale(target)}
      aria-label={target === 'en' ? t('switchToEnglish') : t('switchToLithuanian')}
      lang={target}
    >
      <span className="hidden sm:inline">{target === 'en' ? t('english') : t('lithuanian')}</span>
      <span className="sm:hidden">{target.toUpperCase()}</span>
    </Button>
  );
}







// -----------------------------------------------------------
// AccountHeader
// -----------------------------------------------------------
//
// Who is signed in — name, e-mail, role — atop the account
// menu, OUTSIDE its role="menu" list: a menu holds only its
// items, and a screen reader inside one reads nothing else.
// The e-mail and the role carry the ids the list names as
// its description.
//
// Used by:
//   - AccountMenu (below)
// -----------------------------------------------------------

function AccountHeader({ authData, emailId, roleId }) {
  const label = useEnumLabel();
  return (
    <div className="px-4 py-2 max-w-72">
      <Typography variant="body2" className="font-semibold truncate">{authData?.displayName}</Typography>
      <Typography id={emailId} variant="caption" color="text.secondary" className="block truncate">{authData?.email}</Typography>
      <Typography id={roleId} variant="caption" color="text.secondary">{label('role', authData?.role)}</Typography>
    </div>
  );
}







// -----------------------------------------------------------
// AccountMenu
// -----------------------------------------------------------
//
// The display-name button opening Account / Log out. MUI's
// Menu puts everything it holds inside the menu list, so
// this is its documented composition instead: a Popover
// holding the AccountHeader, then a MenuList named after the
// button ("Account menu: <name>") and described by the
// header's e-mail and role — both read out as the focus
// enters the menu. The rest is Menu's behaviour: the first
// item takes the focus, Tab, Escape and a click outside
// close it, and the focus returns to the button.
//
// Used by:
//   - Navbar (below)
// -----------------------------------------------------------

function AccountMenu({ authData }) {

  const t = useTranslations('navbar');
  const navigate = useNavigate();
  const id = useId();
  const [anchor, setAnchor] = useState(null);
  const [buttonId, menuId, emailId, roleId] = ['button', 'menu', 'email', 'role'].map((part) => `${id}-${part}`);


  const close = () => setAnchor(null);


  // The token dies locally whatever the backend answers; a
  // dead token's 401 must not bounce through the "session
  // expired" redirect
  const logout = async () => {
    close();
    try { await api.post('/api/auth/logout', null, { skipAuthRedirect: true, silent: true }); } catch { /* already gone */ }
    clearToken();
    window.location.replace(CONSOLE_LOGIN);
  };


  // Tab leaves the menu, as in MUI's own Menu, instead of
  // circling inside the popover's focus trap
  const closeOnTab = (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    close();
  };


  return (
    <>
      <Button
        id={buttonId}
        size="small"
        color="inherit"
        startIcon={<AccountCircleIcon />}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={t('accountMenu', { name: authData?.displayName ?? '' })}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? menuId : undefined}
        className="min-w-0"
      >
        <span className="hidden sm:inline max-w-48 truncate">{authData?.displayName}</span>
      </Button>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <AccountHeader authData={authData} emailId={emailId} roleId={roleId} />
        <Divider />
        <MenuList id={menuId} autoFocusItem aria-labelledby={buttonId} aria-describedby={`${emailId} ${roleId}`} onKeyDown={closeOnTab}>
          <MenuItem onClick={() => { close(); navigate('/account'); }}>
            <ListItemIcon><ManageAccountsOutlinedIcon fontSize="small" /></ListItemIcon>
            {t('account')}
          </MenuItem>
          <MenuItem onClick={logout}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            {t('logout')}
          </MenuItem>
        </MenuList>
      </Popover>
    </>
  );
}







// -----------------------------------------------------------
// Navbar (default export)
// -----------------------------------------------------------
//
// The dense MUI AppBar: the brand's ink bar (the theme's
// AppBar) with the reversed wordmark, white controls and the
// yellow focus ring. The chat page renders it directly (with
// Sidebar) instead of PageLayout.
//
// Used by:
//   - PageLayout.jsx — every signed-in page
//   - pages/Chat/Chat.jsx — the chat frame
// -----------------------------------------------------------

export default function Navbar({ authData }) {
  const t = useTranslations('navbar');
  return (
    <AppBar position="static" elevation={0} component="header">
      <Toolbar variant="dense" className="flex justify-between gap-2 min-h-[52px]">
        <div className="flex items-center gap-1 min-w-0">
          <MenuButton />
          <Link
            to="/"
            aria-label={t('home')}
            className="flex min-w-0 no-underline rounded outline-none py-1 focus-visible:ring-2 focus-visible:ring-marker focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <Wordmark name={t('title')} onDark />
          </Link>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <LanguageButton />
          <AccountMenu authData={authData} />
        </div>
      </Toolbar>
    </AppBar>
  );
}
