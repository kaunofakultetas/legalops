// -----------------------------------------------------------
//  [*] Tests — CompanyDetail (the frame, the tabs, delete,
//      the new chat, the analysis)
//
//  The /companies/:companyId page end to end against the
//  backend double: the company's name as the page heading,
//  the subtitle (the translated institution type, the owner
//  for admins only, the update stamp), the back link, the
//  loading skeletons, a failed and an unknown company with
//  the retry; the nine tabs (their order, the counts, the
//  ?tab= deep link and its fallback, the click that replaces
//  ?tab= without a history entry, the tab/panel wiring, a
//  panel mounted on its first visit only and kept mounted
//  after — an unsaved profile edit survives a look at another
//  tab); the actions menu: delete (the confirmation, the
//  DELETE, the toast and the way back to the list, Cancel,
//  409 STILL_RUNNING said inside the dialog, the busy
//  dialog, a dropped connection, the error gone on
//  reopening) and "new chat about the company" (the POST with
//  the companyId, the toast and /chat/<id>, the chats tab's
//  own button, a failure toasted — the request is not silent
//  — and the busy menu item); "Run compliance analysis" (the
//  start dialog fixed to this company); coming back (a tab
//  switch keeping the tabs' own parameters, the back link and
//  the delete going Back to the list right behind — in both
//  languages); Lithuanian; the real route table; and the
//  backend contract matrix for GET /api/companies/:companyId.
//
//  The tabs' own content has its own files (company-profile,
//  -credentials, -documents, -roles, -reports-threads,
//  -actions, -programme).
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { act, screen, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ListProbe, renderPage, renderApp, renderRoutes, authData, userAuthData } from '../support/render';
import { given, apiError, server, url } from '../support/backend/server';
import { describeEndpointContract, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';


const PAVYZDYS = f.company(f.ID.pavyzdys);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderDetail: the page on its real route pattern, so
// useParams reads the id and a navigation lands on the
// "navigated away" probe (tab switches stay on the page:
// same path, another query).
//
// loaded: waits for the company's name as the page heading.
//
// tabNames: the tabs' accessible names, in order.
//
// openMenu: the ⋮ button → the actions menu.
//
// spy: records the query of every request to an endpoint
// and lets the default handler answer it.
// -----------------------------------------------------------

function renderDetail({ id = f.ID.pavyzdys, tab, session = authData, locale = 'en' } = {}) {
  const route = `/companies/${id}${tab ? `?tab=${tab}` : ''}`;
  return renderPage(<CompanyDetail authData={session} />, { route, path: '/companies/:companyId', locale });
}

const loaded = (name = 'UAB Pavyzdys') => screen.findByRole('heading', { level: 1, name });

const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

async function openMenu(user, name = 'More company actions') {
  await user.click(screen.getByRole('button', { name }));
  return screen.findByRole('menu');
}

function spy(method, path) {
  const calls = [];
  server.use(http[method](url(path), ({ request }) => {
    calls.push(Object.fromEntries(new URL(request.url).searchParams));
  }));
  return calls;
}

const navigatedTo = async (path) => {
  await waitFor(() => expect(screen.getByTestId('navigated-away')).toHaveTextContent(path));
};

// The back link to the list, inside the page (the sidebar
// has a "Companies" link of its own)
const backLink = (name = 'Companies') => within(screen.getByRole('main')).getByRole('link', { name });







// -----------------------------------------------------------
// The frame
// -----------------------------------------------------------
//
// Heading, subtitle, back link, the header actions; the
// loading, failed and unknown company.
// -----------------------------------------------------------

describe('CompanyDetail — the frame', () => {

  it('titles the page with the company\'s name; the subtitle has the translated type, the owner and the update stamp', async () => {
    renderDetail();
    const heading = await loaded();
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Crypto-asset service provider · Owner: Jonas Naudotojas · Updated 26/09/2026, 11:30')).toBeInTheDocument();
    expect(backLink()).toHaveAttribute('href', '/companies');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });


  it('a plain user\'s subtitle leaves the owner out (it is always them)', async () => {
    renderDetail({ session: userAuthData });
    await loaded();
    expect(screen.getByText('Crypto-asset service provider · Updated 26/09/2026, 11:30')).toBeInTheDocument();
    expect(screen.queryByText(/Owner:/)).toBeNull();
  });


  it('an admin sees no owner part when the company has no owner name', async () => {
    given.json('get', '/api/companies/:companyId', { ...f.company(f.ID.kreditas), ownerName: null, institutionType: 'unknown' });
    renderDetail({ id: f.ID.kreditas });
    await loaded('UAB Kreditas');
    expect(screen.getByText('Not determined · Updated 24/09/2026, 14:20')).toBeInTheDocument();
  });


  it('carries the two header actions: "Run compliance analysis" and the actions menu button', async () => {
    renderDetail();
    await loaded();
    expect(screen.getByRole('button', { name: 'Run compliance analysis' })).toBeEnabled();
    const more = screen.getByRole('button', { name: 'More company actions' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });


  it('the menu offers the new chat and the delete; it closes on Escape', async () => {
    const { user } = renderDetail();
    await loaded();
    const more = screen.getByRole('button', { name: 'More company actions' });
    const menu = await openMenu(user);
    // (the open menu hides the page behind it from the tree)
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent))
      .toEqual(['New chat about the company', 'Delete the company']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });


  it('while the company loads: skeletons under the back link, no tabs and no actions yet', async () => {
    given.hang('get', '/api/companies/:companyId');
    renderDetail();
    await settle(100);
    expect(backLink()).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('');
    expect(heading.querySelector('.MuiSkeleton-root')).not.toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run compliance analysis' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a failed load shows the translated error under the generic title with a retry; the retry loads the company', async () => {
    given.sequence('get', '/api/companies/:companyId', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: PAVYZDYS },
    ]);
    const { user } = renderDetail();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The company could not be loaded');
    expect(alert).toHaveTextContent('Server error. Try again later.');
    expect(screen.getByRole('heading', { level: 1, name: 'Company' })).toBeInTheDocument();
    expect(backLink()).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(9);
  });


  it('an unknown company (or another user\'s) reads as not found, with the way back to the list', async () => {
    renderDetail({ id: 'c0000000-0000-4000-8000-00000000dead' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    expect(backLink()).toHaveAttribute('href', '/companies');
  });


  it('an answer that is not a company (a JSON null) is a failed load with a retry, not a crash', async () => {
    // given.sequence answers a null body as {} — hence the own handler
    let calls = 0;
    server.use(http.get(url('/api/companies/:companyId'), () => {
      calls += 1;
      return calls === 1 ? HttpResponse.json(null) : HttpResponse.json(PAVYZDYS);
    }));
    const { user } = renderDetail();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The company could not be loaded');
    expect(alert).toHaveTextContent('Something unexpected went wrong.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await loaded()).toBeInTheDocument();
  });


  it('the back link returns to the list', async () => {
    const { user } = renderDetail();
    await loaded();
    await user.click(backLink());
    await navigatedTo('/companies');
  });
});







// -----------------------------------------------------------
// The tabs
// -----------------------------------------------------------
//
// Order and counts, ?tab= in and out, the wiring, the
// mounted-once panels.
// -----------------------------------------------------------

describe('CompanyDetail — the tabs', () => {

  it('nine tabs in order, the lists counted (credentials 2, standards 1, documents 5, roles 2); the profile is selected', async () => {
    renderDetail();
    await loaded();
    expect(screen.getByRole('tablist', { name: 'Company sections' })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Profile', 'Licences and credentials (2)', 'Standards (1)', 'Documents (5)', 'Roles (2)', 'Reports', 'Actions', 'Programme', 'Chats']);
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'company-panel-profile');
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Basic data' })).toBeInTheDocument();
  });


  it('an empty list has no count on its tab', async () => {
    renderDetail({ id: f.ID.kreditas });
    await loaded('UAB Kreditas');
    expect(tabNames()).toEqual(['Profile', 'Licences and credentials', 'Standards', 'Documents (1)', 'Roles', 'Reports', 'Actions', 'Programme', 'Chats']);
  });


  it('?tab= opens that tab on arrival — a deep link to /companies/<id>?tab=reports', async () => {
    renderDetail({ tab: 'reports' });
    await loaded();
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'company-panel-reports');
    expect(within(panel).getByRole('heading', { name: 'Compliance reports' })).toBeInTheDocument();
  });


  it('an unknown ?tab= falls back to the profile', async () => {
    renderDetail({ tab: 'nonsense' });
    await loaded();
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'company-panel-profile');
  });


  it('a click on a tab shows its panel and REPLACES ?tab= in the address — Back leaves the page, not the tab', async () => {
    const { user, router } = renderDetail();
    await loaded();
    await user.click(screen.getByRole('tab', { name: 'Roles (2)' }));
    expect(screen.getByRole('tab', { name: 'Roles (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.pathname).toBe(`/companies/${f.ID.pavyzdys}`);
    expect(router.state.location.search).toBe('?tab=roles');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Roles' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Chats' }));
    expect(router.state.location.search).toBe('?tab=threads');
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Related chats' })).toBeInTheDocument();
  });


  it('each tab is wired to its panel both ways (aria-controls / aria-labelledby)', async () => {
    const { user } = renderDetail();
    await loaded();
    for (const [name, key] of [['Profile', 'profile'], ['Documents (5)', 'documents'], ['Reports', 'reports']]) {
      await user.click(screen.getByRole('tab', { name }));
      const tab = screen.getByRole('tab', { name });
      expect(tab).toHaveAttribute('id', `company-tab-${key}`);
      expect(tab).toHaveAttribute('aria-controls', `company-panel-${key}`);
      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveAttribute('id', `company-panel-${key}`);
      expect(panel).toHaveAttribute('aria-labelledby', `company-tab-${key}`);
      expect(panel).toHaveAccessibleName(name);
    }
  });


  it('a panel is mounted on its first visit only: no documents request before the documents tab opens', async () => {
    const documents = spy('get', '/api/documents');
    const { user } = renderDetail();
    await loaded();
    await settle(100);
    expect(documents).toHaveLength(0);
    await user.click(screen.getByRole('tab', { name: 'Documents (5)' }));
    expect(await screen.findByText('Atitikties politika')).toBeInTheDocument();
    expect(documents).toEqual([{ companyId: f.ID.pavyzdys, limit: '500' }]);
  });


  it('a visited panel stays mounted, hidden: coming back asks nothing again', async () => {
    const documents = spy('get', '/api/documents');
    const { user } = renderDetail();
    await loaded();
    await user.click(screen.getByRole('tab', { name: 'Documents (5)' }));
    await screen.findByText('Atitikties politika');
    await user.click(screen.getByRole('tab', { name: 'Profile' }));
    // Still in the DOM, but hidden — out of the accessibility tree
    expect(document.getElementById('company-panel-documents')).toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: 'Atitikties politika' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Documents (5)' }));
    expect(screen.getByRole('button', { name: 'Atitikties politika' })).toBeInTheDocument();
    await settle(100);
    expect(documents).toHaveLength(1);
  });


  it('an unsaved profile edit survives a look at another tab, and the "unsaved changes" bar with it', async () => {
    const { user } = renderDetail();
    await loaded();
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'UAB Pavyzdys ir partneriai');
    expect(screen.getByRole('region', { name: 'You have unsaved changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Roles (2)' }));
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('UAB Pavyzdys ir partneriai');
    expect(screen.getByRole('region', { name: 'You have unsaved changes' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Delete
// -----------------------------------------------------------
//
// The confirmation, the DELETE and the way back, the refusal
// while an analysis runs or a work product is being
// generated, failures and the busy state.
// -----------------------------------------------------------

describe('CompanyDetail — delete', () => {

  const openDelete = async (user, name = 'UAB Pavyzdys') => {
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete the company' }));
    return screen.findByRole('dialog', { name: `Delete the company “${name}”?` });
  };


  it('asks first, naming the company and what goes with it', async () => {
    const { user } = renderDetail();
    await loaded();
    const dialog = await openDelete(user);
    expect(within(dialog).getByText('The profile, credentials, roles and reports are deleted. Uploaded documents stay in your document list, unlinked from the company.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();
    // The menu closed behind it
    expect(screen.queryByRole('menu')).toBeNull();
  });


  it('Delete sends the DELETE, toasts, and returns to the list replacing the history entry', async () => {
    const deletes = given.capture('delete', '/api/companies/:companyId', { ok: true });
    const { user, router } = renderDetail();
    await loaded();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].url).toBe(url(`/api/companies/${f.ID.pavyzdys}`));
    expect(await screen.findByText('Company deleted')).toBeInTheDocument();
    await navigatedTo('/companies');
    expect(router.state.historyAction).toBe('REPLACE');
  });


  it('Cancel keeps the company and sends nothing', async () => {
    const deletes = given.capture('delete', '/api/companies/:companyId', { ok: true });
    const { user } = renderDetail();
    await loaded();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletes).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1, name: 'UAB Pavyzdys' })).toBeInTheDocument();
  });


  it('409 STILL_RUNNING while an analysis runs is said inside the dialog — no toast, no navigation', async () => {
    // UAB Kreditas has an analysis running: the double refuses
    const { user } = renderDetail({ id: f.ID.kreditas });
    await loaded('UAB Kreditas');
    const dialog = await openDelete(user, 'UAB Kreditas');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cancel the running analysis or the document generation first.');
    expect(screen.getAllByText('Cancel the running analysis or the document generation first.')).toHaveLength(1);
    expect(screen.queryByTestId('navigated-away')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });


  it('the same refusal while one of the company\'s work products is being generated', async () => {
    // UAB Pavyzdys has a risk register being generated: the double refuses
    const { user } = renderDetail();
    await loaded();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cancel the running analysis or the document generation first.');
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('the refusal is gone when the dialog is opened again', async () => {
    const { user } = renderDetail({ id: f.ID.kreditas });
    await loaded('UAB Kreditas');
    let dialog = await openDelete(user, 'UAB Kreditas');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await within(dialog).findByRole('alert');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openDelete(user, 'UAB Kreditas');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });


  it('while the DELETE is on the wire both buttons are disabled and Escape does not close', async () => {
    given.hang('delete', '/api/companies/:companyId');
    const { user } = renderDetail();
    await loaded();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Delete/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await settle(100);
    expect(screen.getByRole('dialog', { name: 'Delete the company “UAB Pavyzdys”?' })).toBeInTheDocument();
  });


  it('a dropped connection is said inside the dialog', async () => {
    given.networkError('delete', '/api/companies/:companyId');
    const { user } = renderDetail();
    await loaded();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the server. Check your internet connection.');
  });
});







// -----------------------------------------------------------
// New chat about the company
// -----------------------------------------------------------
//
// POST /api/chat/threads {companyId} from the menu and from
// the chats tab; the request is not silent, so a failure is
// a toast.
// -----------------------------------------------------------

describe('CompanyDetail — new chat about the company', () => {

  it('the menu item creates a thread linked to the company, toasts and opens it in the chat', async () => {
    const posts = given.capture('post', '/api/chat/threads', { ...f.NEW.thread, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' }, { status: 201 });
    const { user } = renderDetail();
    await loaded();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'New chat about the company' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys });
    expect(await screen.findByText('Chat created')).toBeInTheDocument();
    await navigatedTo(`/chat/${f.ID.newThread}`);
  });


  it('the chats tab\'s own "New chat about the company" button does the same', async () => {
    const posts = given.capture('post', '/api/chat/threads', f.NEW.thread, { status: 201 });
    const { user } = renderDetail({ tab: 'threads' });
    await loaded();
    const panel = screen.getByRole('tabpanel');
    await user.click(within(panel).getByRole('button', { name: 'New chat about the company' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys });
    await navigatedTo(`/chat/${f.ID.newThread}`);
  });


  it('a failure is toasted in words (the request is not silent) and the page stays', async () => {
    given.apiError('post', '/api/chat/threads', 'SERVER_ERROR', { status: 500, error: 'Internal server error' });
    const { user } = renderDetail();
    await loaded();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'New chat about the company' }));
    expect(await screen.findByText('Server error. Try again later.')).toBeInTheDocument();
    expect(screen.queryByText('Chat created')).toBeNull();
    expect(screen.queryByTestId('navigated-away')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'UAB Pavyzdys' })).toBeInTheDocument();
  });


  it('while the thread is being created the menu item and the chats tab\'s button are busy', async () => {
    given.hang('post', '/api/chat/threads');
    const { user } = renderDetail({ tab: 'threads' });
    await loaded();
    let menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'New chat about the company' }));
    const panel = screen.getByRole('tabpanel');
    await waitFor(() => expect(within(panel).getByRole('button', { name: /New chat about the company/ })).toBeDisabled());
    menu = await openMenu(user);
    expect(within(menu).getByRole('menuitem', { name: 'New chat about the company' })).toHaveAttribute('aria-disabled', 'true');
  });
});







// -----------------------------------------------------------
// Run compliance analysis
// -----------------------------------------------------------
//
// The start dialog comes from the reports pages (its own
// tests); here only that it opens for THIS company.
// -----------------------------------------------------------

describe('CompanyDetail — run compliance analysis', () => {

  it('opens the start dialog fixed to this company: no company picker, its estimate, and Start opens the new report', async () => {
    const estimates = spy('get', '/api/reports/estimate');
    const posts = given.capture('post', '/api/reports', f.NEW.report, { status: 201 });
    const { user } = renderDetail();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Run compliance analysis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compliance analysis' });
    expect(within(dialog).queryByRole('combobox', { name: 'Company' })).toBeNull();
    expect(await within(dialog).findByText('Upper-bound cost: ~$5.88 (4 legal acts, ~332 obligations).')).toBeInTheDocument();
    expect(estimates[0]).toEqual({ companyId: f.ID.pavyzdys });

    await user.click(within(dialog).getByRole('button', { name: 'Start the analysis' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ companyId: f.ID.pavyzdys, language: 'en', review: true });
    await navigatedTo(`/reports/${f.ID.newReport}`);
  });


  it('asks nothing of the estimate before the dialog is opened', async () => {
    const estimates = spy('get', '/api/reports/estimate');
    renderDetail();
    await loaded();
    await settle(100);
    expect(estimates).toHaveLength(0);
  });
});







// -----------------------------------------------------------
// Coming back
// -----------------------------------------------------------
//
// A tab switch keeps the tabs' own parameters; the back link
// and the delete return to the list the way Back would — a
// real Back when the list is right behind (renderRoutes: the
// list probe, then the company).
// -----------------------------------------------------------

describe('CompanyDetail — coming back', () => {

  const openDelete = async (user) => {
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete the company' }));
    return screen.findByRole('dialog', { name: 'Delete the company “UAB Pavyzdys”?' });
  };

  const fromList = (locale = 'en') => renderRoutes([
    { path: '/companies', element: <ListProbe to={`/companies/${f.ID.pavyzdys}`} /> },
    { path: '/companies/:companyId', element: <CompanyDetail authData={authData} /> },
  ], { route: '/companies?q=pav&page=2', locale });


  it('a tab switch keeps the other parameters: a tab\'s table finds its order again', async () => {
    const { user, router } = renderDetail({ tab: 'documents' });
    await loaded();
    const route = `/companies/${f.ID.pavyzdys}?tab=documents&documents.sort=title.desc`;
    await act(async () => { await router.navigate(route, { replace: true }); });
    await user.click(screen.getByRole('tab', { name: 'Roles (2)' }));
    expect(router.state.location.search).toBe('?tab=roles&documents.sort=title.desc');
    await user.click(screen.getByRole('tab', { name: 'Documents (5)' }));
    expect(router.state.location.search).toBe('?tab=documents&documents.sort=title.desc');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('columnheader', { name: /^Title/ })).toHaveAttribute('aria-sort', 'descending');
  });


  it('with the list right behind, the back link is Back: the list\'s own entry, its search and page', async () => {
    const { user, router } = fromList();
    const listKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await loaded();
    await user.click(screen.getByRole('tab', { name: 'Roles (2)' }));
    await user.click(backLink());
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/companies?q=pav&page=2');
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(listKey);
  });


  it('in Lithuanian the back link ("Įmonės") does the same', async () => {
    const { user, router } = fromList('lt');
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await loaded();
    await user.click(backLink('Įmonės'));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/companies?q=pav&page=2');
    expect(router.state.historyAction).toBe('POP');
  });


  it('a delete with the list right behind goes Back to it — no second list entry in the history', async () => {
    given.capture('delete', '/api/companies/:companyId', { ok: true });
    const { user, router } = fromList();
    const listKey = router.state.location.key;
    await user.click(screen.getByRole('link', { name: 'Open the detail' }));
    await loaded();
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByTestId('list-probe')).toHaveTextContent('/companies?q=pav&page=2');
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(listKey);
  });
});







// -----------------------------------------------------------
// Lithuanian and the real route
// -----------------------------------------------------------

describe('CompanyDetail — Lithuanian and the route table', () => {

  it('speaks Lithuanian: the subtitle, the tabs, the menu and the delete dialog', async () => {
    // UAB Pavyzdys has a document being generated, which the
    // double would refuse the delete for — here it goes through
    given.json('delete', '/api/companies/:companyId', { ok: true });
    const { user } = renderDetail({ locale: 'lt' });
    await loaded();
    expect(screen.getByText('Kriptoturto paslaugų teikėjas · Savininkas: Jonas Naudotojas · Atnaujinta 2026-09-26 11:30')).toBeInTheDocument();
    expect(backLink('Įmonės')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Įmonės skiltys' })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Profilis', 'Leidimai ir licencijos (2)', 'Standartai (1)', 'Dokumentai (5)', 'Rolės (2)', 'Ataskaitos', 'Veiksmai', 'Programa', 'Pokalbiai']);
    expect(screen.getByRole('button', { name: 'Pradėti atitikties analizę' })).toBeInTheDocument();

    const menu = await openMenu(user, 'Daugiau veiksmų su įmone');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent))
      .toEqual(['Naujas pokalbis apie įmonę', 'Ištrinti įmonę']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Ištrinti įmonę' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ištrinti įmonę „UAB Pavyzdys“?' });
    expect(within(dialog).getByRole('button', { name: 'Atšaukti' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ištrinti' }));
    expect(await screen.findByText('Įmonė ištrinta')).toBeInTheDocument();
  });


  it('a failed load and the refusal to delete in Lithuanian', async () => {
    given.sequence('get', '/api/companies/:companyId', [
      { status: 503, body: apiError('SERVER_ERROR', 'Unavailable') },
      { body: f.company(f.ID.kreditas) },
    ]);
    const { user } = renderDetail({ id: f.ID.kreditas, locale: 'lt' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nepavyko įkelti įmonės');
    expect(screen.getByRole('heading', { level: 1, name: 'Įmonė' })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Bandyti dar kartą' }));
    await loaded('UAB Kreditas');

    const menu = await openMenu(user, 'Daugiau veiksmų su įmone');
    await user.click(within(menu).getByRole('menuitem', { name: 'Ištrinti įmonę' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ištrinti įmonę „UAB Kreditas“?' });
    await user.click(within(dialog).getByRole('button', { name: 'Ištrinti' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pirmiausia atšaukite vykdomą analizę arba dokumento generavimą.');
  });


  it('the real route /companies/:companyId?tab=roles opens the page for the id in the path, titled "Company"', async () => {
    await renderApp({ route: `/companies/${f.ID.pavyzdys}?tab=roles` });
    expect(await screen.findByRole('heading', { level: 1, name: 'UAB Pavyzdys' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Company · Compliance assistant'));
    expect(screen.getByRole('tab', { name: 'Roles (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('AML pareigūnas')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Backend contract
// -----------------------------------------------------------
//
// Every response variant against the company detail, on the
// default (profile) tab; the credentials and roles tabs run
// the same matrix in their own files.
// -----------------------------------------------------------

describeEndpointContract({
  path: '/api/companies/:companyId',
  fixture: PAVYZDYS,
  render: () => renderDetail(),
  chrome: () => backLink(),
  loaded: async () => { await loaded(); },
  // The heading holds a skeleton while the company loads
  loading: () => screen.getByRole('heading', { level: 1 }).querySelector('.MuiSkeleton-root'),
});
