// -----------------------------------------------------------
//  [*] Tests — PageLoading (the full-page spinner)
//
//  What shows while the first page, the session check or a
//  redirect is on its way: one spinner filling the viewport,
//  NAMED in the UI language (an unnamed progressbar is
//  announced as a bare "progress bar" — axe's
//  aria-progressbar-name) — also outside every provider (the
//  router's hydrate fallback renders before App and its
//  IntlProvider exist), where the cookie decides.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderPage, setLocaleCookie } from '../support/render';
import { useSetLocale } from '@/i18n';
import PageLoading from '@/components/layout/PageLoading';







// -----------------------------------------------------------
// PageLoading
// -----------------------------------------------------------

describe('PageLoading', () => {

  it('shows one spinner, named "Loading…"', () => {
    renderPage(<PageLoading />);
    const spinner = screen.getByRole('progressbar', { name: 'Loading…' });
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    // indeterminate: no value to announce
    expect(spinner).not.toHaveAttribute('aria-valuenow');
  });


  it('speaks Lithuanian', () => {
    renderPage(<PageLoading />, { locale: 'lt' });
    expect(screen.getByRole('progressbar', { name: 'Įkeliama…' })).toBeInTheDocument();
  });


  it('fills the viewport and centres the spinner, with nothing else in the box', () => {
    renderPage(<PageLoading />);
    const box = screen.getByRole('progressbar').parentElement;
    // No layout in jsdom — the utility classes are the witness
    expect(box).toHaveClass('h-screen', 'flex', 'items-center', 'justify-center');
    expect(box.children).toHaveLength(1);
    expect(box).toHaveTextContent(/^$/);
  });


  it('outside every provider (the router\'s hydrate fallback) it still speaks the cookie\'s language', () => {
    setLocaleCookie('en');
    const { unmount } = render(<PageLoading />);
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeInTheDocument();
    unmount();

    setLocaleCookie('lt');
    render(<PageLoading />);
    expect(screen.getByRole('progressbar', { name: 'Įkeliama…' })).toBeInTheDocument();
  });


  it('without a locale cookie it speaks the app\'s default, Lithuanian', () => {
    document.cookie = 'locale=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    render(<PageLoading />);
    expect(screen.getByRole('progressbar', { name: 'Įkeliama…' })).toBeInTheDocument();
  });


  it('follows a live language switch of the frame around it', async () => {
    function Frame() {
      const setLocale = useSetLocale();
      return (
        <>
          <button type="button" onClick={() => setLocale('lt')}>to lt</button>
          <PageLoading />
        </>
      );
    }
    const { user } = renderPage(<Frame />);
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'to lt' }));
    expect(screen.getByRole('progressbar', { name: 'Įkeliama…' })).toBeInTheDocument();
  });
});
