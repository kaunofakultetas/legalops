// -----------------------------------------------------------
//  [*] Tests — the test harness itself (smoke)
//
//  Proves the foundation before anything is built on it: a
//  page's requests through the shared api client reach the
//  msw double and its answers reach the screen, a backend
//  refusal becomes the page's own error presentation, the
//  real route table boots at a route behind the session check
//  and titles the tab, and the guards work — a request the
//  double does not know is recorded (and fails any test that
//  did not declare it), a render crash shows its own message
//  and React's report of it is the console guard's to judge.
//  And the waits stay cheap: a find that will be tried again
//  throws its bare message, and only the one that gives up —
//  like a find outside a wait — prints the page (setup.js).
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import api from '@/api/client';
import Users from '@/pages/Users/Users';
import { renderPage, renderApp, authData } from '../support/render';
import { given, unhandledRequests } from '../support/backend/server';
import { allowUnhandledRequests, allowConsoleErrors } from '../support/setup';
import { ALERT_TEXT, expectNoCrash } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';


const renderUsers = () => renderPage(<Users authData={authData} />, { route: '/users', path: '/users' });

// A component that throws while rendering
const Crashing = () => {
  throw new Error('on purpose');
};







// -----------------------------------------------------------
// harness smoke
// -----------------------------------------------------------
//
// Uses the Users page — one query (GET /api/users) through
// the shared api client and a labelled grid.
// -----------------------------------------------------------

describe('harness smoke', () => {

  it('renders a page whose query reaches the backend double', async () => {
    renderUsers();

    const grid = await screen.findByRole('grid', { name: 'Users' });
    expect(await within(grid).findByText(f.plainUser.displayName)).toBeInTheDocument();
    expect(within(grid).getByText(f.adminUser.email)).toBeInTheDocument();
    expectNoCrash();
  });


  it('shows the page\'s own error when the backend refuses', async () => {
    given.apiError('get', '/api/users', 'SERVER_ERROR', { status: 500, error: 'Internal server error' });
    renderUsers();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The users could not be loaded');
    expect(alert).toHaveTextContent(ALERT_TEXT.serverError);
  });


  it('boots the real route table behind the session check and titles the tab', async () => {
    await renderApp({ route: '/users' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Users · Compliance assistant'));
  });


  it('records a request no handler answers (the test declares it expects one)', async () => {
    allowUnhandledRequests();

    await expect(api.get('/api/no-such-endpoint')).rejects.toThrow();
    expect(unhandledRequests.map(({ method, url }) => `${method} ${new URL(url).pathname}`)).toEqual(['GET /api/no-such-endpoint']);
  });


  it('shows a render crash with its message (the test declares the report it provokes)', async () => {
    allowConsoleErrors(/The above error occurred in/);
    renderPage(<Crashing />);

    expect(await screen.findByTestId('render-crashed')).toHaveTextContent('render crashed: on purpose');
  });


  it('a find that will be tried again throws its bare message — the one that gives up, like a find outside a wait, prints the page', async () => {
    renderUsers();
    await screen.findByRole('grid', { name: 'Users' });
    const missing = /^Unable to find an element with the text: Nowhere on the page/;
    const printed = /Ignored nodes: comments[\s\S]*<body/;

    // Outside a wait the error shows the page
    expect(() => screen.getByText('Nowhere on the page')).toThrow(printed);

    // Inside one every failed try is the message alone: the print
    // made a try longer than the pause before the next (setup.js)
    const tries = [];
    const find = () => {
      try {
        return screen.getByText('Nowhere on the page');
      } catch (error) {
        tries.push(error.message);
        throw error;
      }
    };
    const gaveUp = await waitFor(find, { timeout: 300 }).then(() => null, (error) => error);
    expect(tries.length).toBeGreaterThan(0);
    tries.forEach((message) => {
      expect(message).toMatch(missing);
      expect(message).not.toMatch(printed);
    });

    // … and the wait's last word still does
    expect(gaveUp.message).toMatch(missing);
    expect(gaveUp.message).toMatch(printed);
    await expect(screen.findByText('Nowhere on the page', {}, { timeout: 300 })).rejects.toThrow(printed);
  });
});
