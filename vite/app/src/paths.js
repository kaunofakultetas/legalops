// -----------------------------------------------------------
//  [*] paths — the two halves of the origin
//
//  One origin serves two applications from one entry
//  (index.html → main.jsx, which starts one of them by the
//  address). The public site — what the product is, for a
//  visitor without an account — owns the root (src/site/).
//  The console — the application itself, behind the sign-in
//  — lives under /console (console.jsx). Each has a router of
//  its own; a link from one to the other is a plain href that
//  loads the other application.
//
//  The console's router takes its base from here, so its
//  links and routes are written without the prefix; only
//  what leaves the router — the hard redirects to the
//  sign-in page, the links of the public site — spells the
//  address out, and reads it from this file.
//
//  Three addresses inside the console are built here as
//  well, because several pages link to them and must agree:
//  the page of one work product of a compliance programme,
//  the company's tab that lists them, and the company's tab
//  with its action register.
//
//  Split into:
//
//    CONSOLE_BASE         — the console's base, with the slash
//    CONSOLE_BASENAME     — the same, as the router wants it
//    CONSOLE_LOGIN        — the sign-in page
//    productPath          — one work product's page
//    companyProgrammePath — a company's programme tab
//    companyActionsPath   — a company's action register
// -----------------------------------------------------------

// The console's base, with the trailing slash the way Vite
// writes BASE_URL: also the address of its first page
export const CONSOLE_BASE = '/console/';

// The same without the slash — what the router calls its
// basename
export const CONSOLE_BASENAME = '/console';

// The sign-in page, the console's one page without a session
export const CONSOLE_LOGIN = '/console/login';







// -----------------------------------------------------------
// productPath
// -----------------------------------------------------------
//
// The page of one work product of a compliance programme,
// as the console's router is asked for it — without the
// base, like every link inside the console. The route
// itself is in router.jsx.
//
// Used by:
//   - pages/Companies/CompanyProgramme.jsx — a version's link
//   - pages/Programme/ProductPage.jsx — the draft a revision
//     opens; Provenance.jsx — the products it was built on
//   - pages/Chat/ToolCards.jsx — the product cards
//   - hooks/useJobText.js — the subject of a generation job
// -----------------------------------------------------------

export function productPath(productId) {
  return `/programme/${productId}`;
}







// -----------------------------------------------------------
// companyProgrammePath
// -----------------------------------------------------------
//
// The company page opened on its programme tab — where a
// product's versions are listed and a new one is generated.
//
// Used by:
//   - pages/Programme/ProductPage.jsx — the company link, the
//     way after a delete, "generate again"
// -----------------------------------------------------------

export function companyProgrammePath(companyId) {
  return `/companies/${companyId}?tab=programme`;
}







// -----------------------------------------------------------
// companyActionsPath
// -----------------------------------------------------------
//
// The company page opened on its actions tab — the register
// of what the signed-off reports' plans called for.
//
// Used by:
//   - pages/Reports/ReportApproval.jsx — the link a sign-off
//     shows after it moved the register
//   - pages/Chat/ToolCards.jsx — the register card, when the
//     tool's answer names no address
// -----------------------------------------------------------

export function companyActionsPath(companyId) {
  return `/companies/${companyId}?tab=actions`;
}
