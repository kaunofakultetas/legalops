// -----------------------------------------------------------
//  [*] Entry point — starts one of the two applications
//
//  The one script of index.html. The origin holds two
//  applications (paths.js): the console under /console and
//  the public site everywhere else. The address decides
//  which one starts, and only that one is downloaded — a
//  visitor who never signs in never fetches the console.
//
//  The document's ground is the brand's ink (index.html), so
//  a window pulled past the page ends in it. Under the
//  console the root is made white first: its pages are
//  white, and the ink must not flash before they are drawn.
// -----------------------------------------------------------

import { CONSOLE_BASENAME } from '@/paths';

const { pathname } = window.location;

if (pathname === CONSOLE_BASENAME || pathname.startsWith(`${CONSOLE_BASENAME}/`)) {
  document.getElementById('root').setAttribute('style', 'min-height: 100dvh; background: #FFFFFF;');
  import('@/console');
} else {
  import('@/site/main');
}
