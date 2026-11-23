// -----------------------------------------------------------
//  [*] PageWrapper — injects authData into each page
//
//  Thin bridge between the route table and the pages: reads
//  the session from AuthGuard and renders the page with
//  authData as a prop. Renders the spinner until the check
//  has answered, so pages never see a null authData. Admin-
//  only routes (`adminOnly`) render the "access restricted"
//  page for the user role instead of the page — the sidebar
//  hides their links, this closes the typed-URL door (the
//  backend refuses the data either way).
// -----------------------------------------------------------

import { useAuth } from '@/AuthGuard';
import PageLoading from '@/components/layout/PageLoading';
import NotFound from '@/pages/NotFound/NotFound';







// -----------------------------------------------------------
// PageWrapper (default export)
// -----------------------------------------------------------
//
// `component` is the page; it receives authData once known.
//
// Used by:
//   - router.jsx — wraps every page except /login
// -----------------------------------------------------------

export default function PageWrapper({ component: Component, adminOnly = false }) {
  const authData = useAuth();
  if (!authData) return <PageLoading />;
  if (adminOnly && authData.role !== 'admin') return <NotFound authData={authData} forbidden />;
  return <Component authData={authData} />;
}
