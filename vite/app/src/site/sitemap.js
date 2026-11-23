// -----------------------------------------------------------
//  [*] Sitemap — the public site's pages, and the console's
//
//  PAGES is the site's own list, in the order the header and
//  the footer show it. CONSOLE_SECTIONS is the other half of
//  the origin seen from here: until the public site took the
//  root, the console lived there, and its addresses — a
//  bookmarked report, a link to a conversation sent to a
//  colleague — still arrive at the site's router. The first
//  segment of such an address tells it apart, and the site
//  hands it on under the console's base (pages/Missing.jsx).
//  A new top-level route of the console (router.jsx) need not
//  be added: nothing links to it at the root.
// -----------------------------------------------------------

// The site's pages: the route and the key of its name
// (SITE.common.nav)
export const PAGES = [
  { to: '/product', key: 'product' },
  { to: '/method', key: 'method' },
  { to: '/sources', key: 'sources' },
  { to: '/documentation', key: 'documentation' },
  { to: '/about', key: 'about' },
];

// The first path segments the console answered to at the
// root before it moved under its base
export const CONSOLE_SECTIONS = [
  'login', 'chat', 'dashboard', 'companies', 'reports', 'corpus', 'obligations', 'prompts', 'settings', 'users',
  'audit', 'usage', 'jobs', 'account',
];
