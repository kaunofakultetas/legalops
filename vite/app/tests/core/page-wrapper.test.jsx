// -----------------------------------------------------------
//  [*] Tests — PageWrapper.jsx
//
//  The bridge between the route table and the pages, under
//  the real AuthProvider: the spinner until the session check
//  has answered (a page never sees a null authData), the
//  session handed to the page as its authData prop, and the
//  admin-only door — the administrator gets the page, any
//  other role the "Access restricted" page inside the frame
//  without the page ever mounting (so it fetches nothing).
//  Once more through the whole app on a real admin-only
//  route, and in Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import PageWrapper from '@/PageWrapper';
import { AuthProvider } from '@/AuthGuard';
import { renderPage, renderApp } from '../support/render';
import { signIn, userAuthData } from '../support/auth';
import { server, given, url } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';


// A stand-in page that records every render's props
const makePage = () => {
  const renders = [];
  function Page(props) {
    renders.push(props);
    return <p data-testid="page">page for {props.authData.email}</p>;
  }
  return { Page, renders };
};

// PageWrapper under the real session check, signed in
const mountWrapper = (element, { session = f.me, locale = 'en' } = {}) => {
  if (session) given.json('get', '/api/auth/me', session);
  signIn();
  return renderPage(element, { route: '/somewhere', wrapper: AuthProvider, locale });
};

const restricted = () => screen.findByRole('heading', { level: 1, name: 'Access restricted' });







// -----------------------------------------------------------
// the spinner and authData
// -----------------------------------------------------------

describe('PageWrapper — until the session is known', () => {

  it('shows the spinner, and not the page, while the check runs; then the page', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    server.use(http.get(url('/api/auth/me'), async () => {
      await gate;
      return HttpResponse.json(f.me);
    }));
    const { Page, renders } = makePage();
    mountWrapper(<PageWrapper component={Page} />, { session: null });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await settle(50);
    expect(renders).toHaveLength(0);
    expect(screen.queryByTestId('page')).toBeNull();
    release();
    expect(await screen.findByText('page for admin@example.lt')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });


  it('hands the page the session as its one prop, authData — every field as the check answered it', async () => {
    const { Page, renders } = makePage();
    mountWrapper(<PageWrapper component={Page} />);
    await screen.findByTestId('page');
    expect(renders.every((props) => props.authData !== null)).toBe(true);
    expect(Object.keys(renders.at(-1))).toEqual(['authData']);
    expect(renders.at(-1).authData).toEqual(f.me);
  });


  it('a page open to everybody renders for a plain user', async () => {
    const { Page } = makePage();
    mountWrapper(<PageWrapper component={Page} />, { session: userAuthData });
    expect(await screen.findByText('page for jonas@example.lt')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// adminOnly
// -----------------------------------------------------------

describe('PageWrapper — adminOnly', () => {

  it('lets the administrator in', async () => {
    const { Page } = makePage();
    mountWrapper(<PageWrapper component={Page} adminOnly />);
    expect(await screen.findByText('page for admin@example.lt')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Access restricted' })).toBeNull();
  });


  it('shows a plain user "Access restricted" inside the frame — the page never mounts', async () => {
    const { Page, renders } = makePage();
    mountWrapper(<PageWrapper component={Page} adminOnly />, { session: userAuthData });
    expect(await restricted()).toBeInTheDocument();
    expect(screen.getByText('This page is for administrators only.')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    // The frame is the user's: the sidebar keeps the admin links hidden
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];
    expect(within(nav).getByRole('link', { name: 'Account' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Account menu: Jonas Naudotojas' })).toBeInTheDocument();
    await settle(50);
    expect(renders).toHaveLength(0);
  });


  it('an unknown role never reaches a page — the session check already refuses it as no account', async () => {
    const { Page, renders } = makePage();
    mountWrapper(<PageWrapper component={Page} adminOnly />, { session: { ...f.me, role: 'auditor' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something unexpected went wrong.');
    expect(screen.queryByRole('heading', { name: 'Access restricted' })).toBeNull();
    expect(renders).toHaveLength(0);
  });


  it('speaks Lithuanian', async () => {
    const { Page } = makePage();
    mountWrapper(<PageWrapper component={Page} adminOnly />, { session: userAuthData, locale: 'lt' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Prieiga ribojama' })).toBeInTheDocument();
    expect(screen.getByText('Šis puslapis skirtas tik administratoriams.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Į pradžią' })).toHaveAttribute('href', '/');
  });
});







// -----------------------------------------------------------
// through the whole app
// -----------------------------------------------------------

describe('PageWrapper — on the real route table', () => {

  it('a plain user on /users: "Access restricted", the tab still titled, and GET /api/users never sent', async () => {
    given.json('get', '/api/auth/me', userAuthData);
    const users = given.capture('get', '/api/users', { users: f.users });
    await renderApp({ route: '/users' });
    expect(await restricted()).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Users · Compliance assistant'));
    await settle(100);
    expect(users).toHaveLength(0);
  });


  it('the administrator on /users gets the page with its data', async () => {
    await renderApp({ route: '/users' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(await screen.findByText('Jonas Naudotojas')).toBeInTheDocument();
  });


  it('a plain user on a page open to everybody gets the page with their own session', async () => {
    given.json('get', '/api/auth/me', userAuthData);
    await renderApp({ route: '/account' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('jonas@example.lt')).toBeInTheDocument();
  });
});
