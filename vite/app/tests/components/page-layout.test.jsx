// -----------------------------------------------------------
//  [*] Tests — PageLayout (the shared frame of every page)
//
//  The frame every page but Login and Chat renders in: the
//  skip link as the FIRST tab stop, visible only on focus,
//  pointing at the main landmark that can take the focus;
//  the banner (Navbar) and the navigation (Sidebar) fed the
//  session they are handed; the main landmark holding the
//  page header and the content; the header's back link (a
//  router link with a decorative arrow), the page's one h1
//  (text or an element, wrapping instead of overflowing),
//  the subtitle and the actions — each absent without its
//  prop; the dynamic-viewport frame; both languages.
// -----------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { renderPage, authData, userAuthData } from '../support/render';
import PageLayout from '@/components/layout/PageLayout';


const main = () => screen.getByRole('main');

// The area that scrolls: the sidebar, main and the footer
const area = () => document.querySelector('[data-page-scroll]');

// The header row above the content: the main's first child
const header = () => main().firstElementChild;







// -----------------------------------------------------------
// Landmarks and the skip link
// -----------------------------------------------------------

describe('PageLayout landmarks', () => {

  it('frames the page: banner, the main navigation, and main holding the header and the content', () => {
    renderPage(<PageLayout authData={authData} title="Companies"><p>the list</p></PageLayout>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(within(main()).getByRole('heading', { level: 1, name: 'Companies' })).toBeInTheDocument();
    expect(within(main()).getByText('the list')).toBeInTheDocument();
    // one h1 on the page
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });


  it('hands the session to the bars: a plain user\'s sidebar has no admin links', () => {
    renderPage(<PageLayout authData={userAuthData} title="Reports"><p>x</p></PageLayout>, { route: '/reports' });
    expect(screen.getByRole('button', { name: 'Account menu: Jonas Naudotojas' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'Users' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
  });


  it('opens with the skip link — the first tab stop, visible only on focus — pointing at main', async () => {
    const { user } = renderPage(<PageLayout authData={authData} title="Companies"><p>x</p></PageLayout>, { route: '/reports' });
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    await user.tab();
    expect(skip).toHaveFocus();
    // No layout in jsdom — the utility classes are the witness
    expect(skip).toHaveClass('sr-only', 'focus:not-sr-only');
    // before the bars in the page
    expect(skip.compareDocumentPosition(screen.getByRole('banner')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const target = document.querySelector(skip.getAttribute('href'));
    expect(target).toBe(main());
  });


  it('lets main take the focus the skip link sends — programmatically only, never as a tab stop', () => {
    renderPage(<PageLayout authData={authData} title="Companies"><p>x</p></PageLayout>);
    expect(main()).toHaveAttribute('id', 'main-content');
    expect(main()).toHaveAttribute('tabindex', '-1');
    main().focus();
    expect(main()).toHaveFocus();
  });


  it('fills the dynamic viewport and scrolls one area under the navbar: the sidebar, main and the footer together', () => {
    renderPage(<PageLayout authData={authData} title="Companies"><p>x</p></PageLayout>);
    // No layout in jsdom — the utility classes are the witness
    const frame = screen.getByRole('link', { name: 'Skip to content' }).parentElement;
    expect(frame).toHaveClass('h-dvh', 'flex', 'flex-col');
    expect(area().parentElement).toBe(frame);
    expect(area().previousElementSibling).toBe(screen.getByRole('banner'));
    // It scrolls, it is the containing block of what a page hides
    // off-screen, and the sidebar measures the screen by it
    expect(area()).toHaveClass('flex-1', 'min-h-0', 'overflow-auto', 'relative', '[container-type:size]');
    expect(main()).toHaveClass('flex-1', 'min-w-0');
    expect(main()).not.toHaveClass('overflow-auto');
  });


  it('past its ends the page keeps the colour it ends in: the desk above the first row, the band\'s ink below the last', () => {
    renderPage(<PageLayout authData={authData} title="Companies"><p>x</p></PageLayout>);
    // The scrolling area's own ground shows only when it is pulled
    // past its content: desk in its upper half, ink in its lower
    expect(area().className).toContain('bg-[linear-gradient(to_bottom,var(--mui-palette-background-default)_50%,var(--mui-palette-primary-main)_50%)]');
    expect(area()).not.toHaveClass('bg-canvas');
    // …so the row paints the desk itself, and the band its ink
    const row = area().firstElementChild;
    expect(row).toHaveClass('bg-canvas', 'grow');
    expect(row.contains(main())).toBe(true);
    expect(area().lastElementChild).toHaveClass('bg-primary');
    // Where the whole window is pulled, the ink is the document's:
    // the page paints the body in it (the console's white root
    // is the entry's doing — entry.test.jsx)
    const page = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(page).toContain('<body style="margin: 0; padding: 0; background: #173A6E;">');
  });


  it('ends the scrolling page with the copyright band: after the row of the sidebar and main, as wide as both', () => {
    renderPage(<PageLayout authData={authData} title="Companies"><p>x</p></PageLayout>);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/^Copyright ©/);
    // A slim band in the navbar's ink that keeps its height
    expect(footer).toHaveClass('bg-primary', 'text-white', 'py-1.5', 'shrink-0');
    expect(area().lastElementChild).toBe(footer);
    // The row above it holds the sidebar and main, and takes the
    // spare height: the band stands at the bottom of the screen
    // under a short page and after the last row of a long one
    const row = footer.previousElementSibling;
    expect(row).toHaveClass('flex', 'grow', 'shrink-0');
    expect(row.contains(screen.getByRole('navigation', { name: 'Main navigation' }))).toBe(true);
    expect(row.contains(main())).toBe(true);
    expect(main().contains(footer)).toBe(false);
  });


  it('words the copyright line in Lithuanian too', () => {
    renderPage(<PageLayout authData={authData} title="Įmonės"><p>x</p></PageLayout>, { locale: 'lt' });
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/^Copyright ©/);
  });


  it('speaks Lithuanian: the skip link and the landmarks', () => {
    renderPage(<PageLayout authData={authData} title="Įmonės"><p>x</p></PageLayout>, { locale: 'lt' });
    expect(screen.getByRole('link', { name: 'Pereiti prie turinio' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('navigation', { name: 'Pagrindinė navigacija' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Įmonės' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The page header
// -----------------------------------------------------------

describe('PageLayout header', () => {

  it('shows only the title without back link, subtitle and actions', () => {
    renderPage(<PageLayout authData={authData} title="Jobs"><p>x</p></PageLayout>);
    expect(header().querySelector('a')).toBeNull();
    expect(header()).toHaveTextContent(/^Jobs$/);
    expect(within(header()).queryByRole('button')).toBeNull();
  });


  it('puts the back link above the title: a router link with a decorative arrow', async () => {
    const { user, router } = renderPage(
      <PageLayout authData={authData} title="UAB Pavyzdys" back={{ to: '/companies', label: 'All companies' }}><p>x</p></PageLayout>,
      { route: '/companies/c1' },
    );
    const back = within(header()).getByRole('link', { name: 'All companies' });
    expect(back).toHaveAttribute('href', '/companies');
    expect(within(back).getByTestId('ArrowBackIcon')).toHaveAttribute('aria-hidden', 'true');
    const title = within(header()).getByRole('heading', { level: 1 });
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(back);
    expect(router.state.location.pathname).toBe('/companies');
    expect(window.location.navigations).toEqual([]);
  });


  it('shows the subtitle under the title as plain text, and the actions after them', async () => {
    const onNew = vi.fn();
    const { user } = renderPage(
      <PageLayout authData={authData} title="Companies" subtitle="Your companies and their profiles"
                  actions={<Button onClick={onNew}>New company</Button>}>
        <p>x</p>
      </PageLayout>,
    );
    const title = within(header()).getByRole('heading', { level: 1, name: 'Companies' });
    const subtitle = within(header()).getByText('Your companies and their profiles');
    const action = within(header()).getByRole('button', { name: 'New company' });
    expect(subtitle.tagName).toBe('DIV');
    expect(title.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(subtitle.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(action);
    expect(onNew).toHaveBeenCalledTimes(1);
  });


  it('takes an element as the subtitle and as the title (a loading skeleton)', () => {
    const { container } = renderPage(
      <PageLayout authData={authData} title={<Skeleton width={260} />} subtitle={<span>MiCA · <strong>v2</strong></span>}><p>x</p></PageLayout>,
    );
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.querySelector('.MuiSkeleton-root')).not.toBeNull();
    expect(within(header()).getByText('v2').tagName).toBe('STRONG');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });


  it('lets a long title wrap anywhere instead of pushing the actions off screen', () => {
    const long = `UAB ${'Labai ilgas pavadinimas be tarpų '.repeat(6)}${'x'.repeat(120)}`;
    renderPage(<PageLayout authData={authData} title={long} actions={<Button>Run analysis</Button>}><p>x</p></PageLayout>);
    // No layout in jsdom — the utility classes are the witness
    const h1 = screen.getByRole('heading', { level: 1, name: long });
    expect(h1).toHaveClass('[overflow-wrap:anywhere]');
    expect(h1.parentElement).toHaveClass('min-w-0', 'flex-1');
    expect(h1.parentElement.parentElement).toHaveClass('flex', 'flex-wrap');
  });


  it('renders markup and unicode in the header as text', () => {
    const hostile = '💾 Ąžuolas <script>alert(1)</script> <img src=x onerror=alert(2)>';
    const { container } = renderPage(<PageLayout authData={authData} title={hostile} subtitle={hostile} back={{ to: '/', label: hostile }}><p>x</p></PageLayout>);
    expect(screen.getByRole('heading', { level: 1, name: hostile })).toBeInTheDocument();
    expect(within(header()).getAllByText(hostile)).toHaveLength(3);
    expect(container.querySelector('script, img[src="x"]')).toBeNull();
  });
});
