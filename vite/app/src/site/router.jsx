// -----------------------------------------------------------
//  [*] Site router — the public site's route table
//
//  createBrowserRouter at the root of the origin: the pages
//  a visitor without an account can read. The console is not
//  in this table — it is another application under /console
//  with a router of its own (src/router.jsx, paths.js), and a
//  link to it is a plain href.
//
//  Every page is a child of the SiteLayout route and carries
//  a handle.title, the message key the layout turns into the
//  document title. The pages are few and small, so they ship
//  in the site's one chunk — a visitor walks from page to
//  page without waiting. "*" is "there is no such page",
//  which also hands the console's old addresses on to it
//  (pages/Missing.jsx).
// -----------------------------------------------------------

import { createBrowserRouter } from 'react-router-dom';
import SiteLayout from '@/site/SiteLayout';
import About from '@/site/pages/About';
import Documentation from '@/site/pages/Documentation';
import Home from '@/site/pages/Home';
import Method from '@/site/pages/Method';
import Missing from '@/site/pages/Missing';
import Product from '@/site/pages/Product';
import Sources from '@/site/pages/Sources';







// -----------------------------------------------------------
// router
// -----------------------------------------------------------
//
// The route table. The paths are the ones sitemap.js lists
// for the header and the footer.
//
// Used by:
//   - site/main.jsx — passed to RouterProvider
// -----------------------------------------------------------

export const router = createBrowserRouter([
  {
    path: '/',
    element: <SiteLayout />,
    children: [
      { index: true, element: <Home />, handle: { title: 'SITE.home.TITLE' } },
      { path: 'product', element: <Product />, handle: { title: 'SITE.product.TITLE' } },
      { path: 'method', element: <Method />, handle: { title: 'SITE.method.TITLE' } },
      { path: 'sources', element: <Sources />, handle: { title: 'SITE.sources.TITLE' } },
      { path: 'documentation', element: <Documentation />, handle: { title: 'SITE.documentation.TITLE' } },
      { path: 'about', element: <About />, handle: { title: 'SITE.about.TITLE' } },
      { path: '*', element: <Missing />, handle: { title: 'SITE.missing.TITLE' } },
    ],
  },
]);
