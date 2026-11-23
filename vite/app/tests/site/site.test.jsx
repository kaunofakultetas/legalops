// -----------------------------------------------------------
//  [*] Tests — the public site (src/site/)
//
//  The half of the origin a visitor without an account
//  reads: its route table through a memory router, inside
//  the translations provider and nothing else — the site has
//  no MUI theme, no query client and no session, and asks the
//  backend for nothing (the msw double fails a test on any
//  request it was not told about).
//
//  Covered: every page of the table with its one h1, its
//  document title and both languages; the ink bar (the pages,
//  the current one, the language switch, the way into the
//  console for a visitor and for a signed-in user, the
//  phone's menu); the footer; the hero's object (the mark's
//  four pieces as data and as solids, and the flat picture a
//  browser without WebGL is shown — the test runner's DOM is
//  one), set out another way in the head of every other
//  page; the bands of every page arriving as they are
//  reached; the specimens (the product's own labels, the
//  marked evidence, the conversation played and the analysis
//  running); the documentation page's way to the book, in
//  the visitor's language; and the address the site
//  does not have — an old address of the console is handed
//  on under /console, anything else is "no such page".
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { IntlProvider } from '@/i18n';
import { messagesMap } from '@/messages';
import { router as siteRouter } from '@/site/router';
import { CONSOLE_SECTIONS, PAGES } from '@/site/sitemap';
import { EU_ACTS, HEADLINE_ACTS, LT_LAWS, SUPERVISOR_ACTS } from '@/site/acts';
import { ARRANGEMENTS, PIECE, PIECES, outline, rim, slab } from '@/site/sculpture';
import { signIn } from '../support/auth';
import { installLocationDouble } from '../support/location';
import { setLocaleCookie } from '../support/render';


// The site at `route`, in `locale`: the real route table on a
// memory router
function renderSite(route = '/', locale = 'en') {
  setLocaleCookie(locale);
  const router = createMemoryRouter(siteRouter.routes, { initialEntries: [route] });
  const result = render(<IntlProvider><RouterProvider router={router} /></IntlProvider>);
  return { ...result, router, user: userEvent.setup() };
}

// A message by its dotted key
const message = (locale, key) => key.split('.').reduce((node, part) => node[part], messagesMap[locale]);

// The pages of the table: the route, the namespace of its
// messages and where its h1 is kept
const ROUTES = [
  ['/', 'home', 'hero.title'],
  ['/product', 'product', 'head.title'],
  ['/method', 'method', 'head.title'],
  ['/sources', 'sources', 'head.title'],
  ['/documentation', 'documentation', 'head.title'],
  ['/about', 'about', 'head.title'],
];







// -----------------------------------------------------------
// the pages
// -----------------------------------------------------------

describe('the public site — its pages', () => {

  for (const locale of ['lt', 'en']) {
    it.each(ROUTES)(`%s has one h1, its document title and the frame (${locale})`, async (route, page, heading) => {
      renderSite(route, locale);
      const h1 = screen.getAllByRole('heading', { level: 1 });
      expect(h1).toHaveLength(1);
      expect(h1[0].textContent).toBe(message(locale, `SITE.${page}.${heading}`));
      await waitFor(() => expect(document.title).toBe(`${message(locale, `SITE.${page}.TITLE`)} · ${message(locale, 'navbar.title')}`));
      expect(screen.getByRole('banner')).toBeTruthy();
      expect(screen.getByRole('main')).toBeTruthy();
      expect(screen.getByRole('contentinfo')).toBeTruthy();
      expect(document.documentElement.lang).toBe(locale);
    });
  }


  it('every heading of a band names its band — no region is left without its name', () => {
    for (const [route] of ROUTES) {
      const { unmount, container } = renderSite(route);
      for (const section of container.querySelectorAll('section[aria-labelledby]')) {
        const heading = container.querySelector(`#${CSS.escape(section.getAttribute('aria-labelledby'))}`);
        expect(heading, `${route}: ${section.getAttribute('aria-labelledby')}`).not.toBeNull();
        expect(heading.textContent.trim()).not.toBe('');
      }
      unmount();
    }
  });


  it('no page shows a message key instead of its text', () => {
    for (const locale of ['lt', 'en']) {
      for (const [route] of ROUTES) {
        const { unmount, container } = renderSite(route, locale);
        expect(container.textContent, `${route} (${locale})`).not.toMatch(/\b(SITE|ENUMS|PAGES|COMPONENTS)\.[A-Za-z]/);
        expect(container.textContent, `${route} (${locale})`).not.toMatch(/\{[a-z]+\}/);
        unmount();
      }
    }
  });


  it('the first focusable thing skips to the content', async () => {
    const { user } = renderSite('/');
    await user.tab();
    expect(document.activeElement.getAttribute('href')).toBe('#content');
    expect(document.getElementById('content')).toBe(screen.getByRole('main'));
  });
});







// -----------------------------------------------------------
// the ink bar
// -----------------------------------------------------------

describe('the public site — the bar', () => {

  it('lists the pages as links and marks the one the visitor is on', async () => {
    const { user, router } = renderSite('/method');
    const nav = screen.getAllByRole('navigation', { name: 'Site pages' })[0];
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(PAGES.map((page) => page.to));
    expect(within(nav).getByRole('link', { name: 'Method' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Product' }).getAttribute('aria-current')).toBeNull();

    await user.click(within(nav).getByRole('link', { name: 'Legal acts' }));
    expect(router.state.location.pathname).toBe('/sources');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The acts the assistant reads');
  });


  it('the wordmark is the way home', async () => {
    const { user, router } = renderSite('/about');
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Compliance assistant — home' }));
    expect(router.state.location.pathname).toBe('/');
  });


  it('a visitor is offered the sign-in page — a plain link out of the site\'s router', () => {
    renderSite('/');
    const links = screen.getAllByRole('link', { name: 'Sign in' });
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) expect(link.getAttribute('href')).toBe('/console/login');
    expect(screen.queryByRole('link', { name: 'Open the console' })).toBeNull();
  });


  it('with a session token stored the way in reads "Open the console" and leads straight in', () => {
    signIn();
    renderSite('/');
    const links = screen.getAllByRole('link', { name: 'Open the console' });
    for (const link of links) expect(link.getAttribute('href')).toBe('/console/');
  });


  it('the language button switches the whole site and remembers the choice in the cookie the console reads', async () => {
    const { user } = renderSite('/', 'lt');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(message('lt', 'SITE.home.hero.title'));
    await user.click(screen.getByRole('button', { name: 'Switch the interface to English' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(message('en', 'SITE.home.hero.title'));
    expect(document.cookie).toContain('locale=en');
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('button', { name: 'Perjungti sąsają į lietuvių kalbą' }));
    expect(document.cookie).toContain('locale=lt');
  });


  it('the phone\'s menu opens, closes on Escape and closes when a page is chosen', async () => {
    const { user, router } = renderSite('/');
    const button = screen.getByRole('button', { name: 'Open the menu' });
    const menu = document.getElementById(button.getAttribute('aria-controls'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);

    await user.click(button);
    expect(screen.getByRole('button', { name: 'Close the menu' }).getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    await user.keyboard('{Escape}');
    expect(menu.hidden).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Open the menu' }));
    await user.click(within(menu).getByRole('link', { name: 'About' }));
    expect(router.state.location.pathname).toBe('/about');
    expect(menu.hidden).toBe(true);
  });
});







// -----------------------------------------------------------
// the hero's object
// -----------------------------------------------------------

describe('the public site — the mark as an object', () => {

  it('is the mark\'s four tiles: the white quarter disc, two pale blue squares, the yellow quarter disc', () => {
    expect(PIECES.map((piece) => `${piece.key}:${piece.shape}@${piece.at}`)).toEqual(['disc:A@-0.5,0.5', 'upper:S@0.5,0.5', 'lower:S@-0.5,-0.5', 'marked:B@0.5,-0.5']);
    expect(new Set(PIECES.map((piece) => piece.color)).size).toBe(3);
  });


  it.each(['S', 'A', 'B', 'C', 'D'])('the outline of shape %s runs counter-clockwise, is convex, stays inside its tile and faces outwards all the way round', (shape) => {
    const points = outline(shape);
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const [a, b, c] = [points[i], points[(i + 1) % points.length], points[(i + 2) % points.length]];
      area += a.x * b.y - b.x * a.y;
      // A left turn (or none) at every point
      expect((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(PIECE.half + 1e-9);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(PIECE.half + 1e-9);
      expect(Math.hypot(a.nx, a.ny)).toBeCloseTo(1, 6);
      // The normal never jumps: light can travel along the edge
      expect(a.nx * b.nx + a.ny * b.ny).toBeGreaterThan(0.9);
      // …and points away from the piece: along the way the edge is not running
      expect(a.nx * (b.x - a.x) + a.ny * (b.y - a.y)).toBeCloseTo(0, 1);
    }
    expect(area).toBeGreaterThan(0);
  });


  it('the four quarter discs are one shape turned: each bulges away from its own corner', () => {
    const corner = (shape) => {
      const points = outline(shape);
      const middle = points.reduce((sum, point) => [sum[0] + point.x / points.length, sum[1] + point.y / points.length], [0, 0]);
      return middle.map((value) => Math.sign(value));
    };
    expect(corner('A')).toEqual([1, -1]);
    expect(corner('D')).toEqual([1, 1]);
    expect(corner('B')).toEqual([-1, 1]);
    expect(corner('C')).toEqual([-1, -1]);
  });


  it('a solid is whole triangles with normals of length one, a face in front, a face behind and round shoulders between', () => {
    const solid = slab(outline('S'));
    expect(solid.length % 18).toBe(0);
    const kinds = new Set();
    for (let at = 0; at < solid.length; at += 6) {
      const [z, nx, ny, nz] = [solid[at + 2], solid[at + 3], solid[at + 4], solid[at + 5]];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(z).toBeGreaterThanOrEqual(-1e-6);
      expect(z).toBeLessThanOrEqual(PIECE.depth + 1e-6);
      kinds.add(nz > 0.99 ? 'front' : (nz < -0.99 ? 'back' : (Math.abs(nz) < 0.01 ? 'side' : 'shoulder')));
    }
    expect([...kinds].sort()).toEqual(['back', 'front', 'shoulder', 'side']);
  });


  it('the place a piece leaves is a thin flat band inside its outline', () => {
    const points = outline('B');
    const band = rim(points, 0.02, 0.1);
    expect(band.length).toBe(points.length * 6 * 6);
    for (let at = 0; at < band.length; at += 6) {
      expect(band[at + 2]).toBeCloseTo(0.1, 6);
      expect([band[at + 3], band[at + 4], band[at + 5]]).toEqual([0, 0, 1]);
      expect(Math.abs(band[at])).toBeLessThanOrEqual(PIECE.half + 1e-6);
    }
  });


  it('without WebGL the hero shows the mark as a flat picture on its stage, all of it hidden from assistive technology', () => {
    const { container } = renderSite('/');
    const hero = container.querySelector('section[aria-labelledby="hero-title"]');
    const picture = hero.querySelector('svg[viewBox="0 0 200 200"]');
    expect(picture).not.toBeNull();
    expect(picture.querySelectorAll('rect, path')).toHaveLength(4);
    expect(picture.closest('[aria-hidden]')).not.toBeNull();
    expect(hero.querySelector('canvas')).toBeNull();
    // The tiles out of focus behind it drift, and are decoration too
    const drifting = hero.querySelectorAll('svg.ghost-drift');
    expect(drifting.length).toBeGreaterThan(3);
    for (const tile of drifting) expect(tile.closest('[aria-hidden]')).not.toBeNull();
  });


  it('every arrangement is the same four pieces, set out another way', () => {
    expect(Object.keys(ARRANGEMENTS).sort()).toEqual(['layers', 'mark', 'shelf', 'steps']);
    for (const [name, arrangement] of Object.entries(ARRANGEMENTS)) {
      expect(arrangement.pieces.map((piece) => piece.key).sort(), name).toEqual(['disc', 'lower', 'marked', 'upper']);
      for (const piece of arrangement.pieces) {
        const own = PIECES.find((item) => item.key === piece.key);
        expect([piece.shape, piece.color], `${name}: ${piece.key}`).toEqual([own.shape, own.color]);
      }
      expect(arrangement.view.distance, name).toBeGreaterThan(3);
      expect(arrangement.view.fit, name).toBeGreaterThan(0.5);
    }
    // Only the mark itself lets its yellow piece wander
    expect(Object.entries(ARRANGEMENTS).filter(([, arrangement]) => arrangement.wander).map(([name]) => name)).toEqual(['mark']);
    // The steps rise to the yellow piece; the layers stand one behind another
    const steps = ARRANGEMENTS.steps.pieces;
    expect(steps.map((piece) => piece.at[1])).toEqual([...steps.map((piece) => piece.at[1])].sort((a, b) => a - b));
    expect(steps[steps.length - 1].key).toBe('marked');
    expect(new Set(ARRANGEMENTS.layers.pieces.map((piece) => piece.back)).size).toBe(4);
  });


  it.each(['/product', '/method', '/sources', '/about'])('the head of %s is signed with the object\'s stage — hidden from assistive technology, its words arriving in turn', (route) => {
    const { container } = renderSite(route);
    const head = container.querySelector('main > section');
    const stage = head.querySelector('[aria-hidden].pointer-events-none');
    expect(stage).not.toBeNull();
    // Without WebGL: the tiles out of focus and the pair of tiles, no canvas
    expect(stage.querySelector('canvas')).toBeNull();
    expect(stage.querySelectorAll('svg.ghost-drift')).toHaveLength(3);
    expect(stage.querySelectorAll('svg:not(.ghost-drift)')).toHaveLength(2);
    expect(head.querySelector('h1').className).toContain('hero-rise');
    expect(head.querySelectorAll('.hero-rise')).toHaveLength(2);
  });


  it('the hero\'s words arrive in turn as the page opens', () => {
    const { container } = renderSite('/');
    const hero = container.querySelector('section[aria-labelledby="hero-title"]');
    const arriving = [...hero.querySelectorAll('.hero-rise')];
    expect(arriving[0]).toBe(screen.getByRole('heading', { level: 1 }));
    expect(arriving.map((el) => el.style.getPropertyValue('--i'))).toEqual(['', '1', '2', '3']);
  });
});








// -----------------------------------------------------------
// the page moves as it is read
// -----------------------------------------------------------

describe('the public site — the bands arrive as they are reached', () => {

  // An IntersectionObserver the test fires by hand
  const watch = () => {
    const watchers = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback, options) { this.callback = callback; this.options = options; watchers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.element = null; }
    });
    return watchers;
  };


  it('every band of the first page under the hero waits, and arrives once when it comes into view', () => {
    const watchers = watch();
    const { container } = renderSite('/');
    const bands = [...container.querySelectorAll('main > section')].slice(1);
    expect(bands.map((band) => band.getAttribute('aria-labelledby'))).toEqual(
      ['proof-title', 'does-title', 'report-title', 'chat-title', 'sources-title', 'limits-title', 'closing-title'],
    );
    for (const band of bands) {
      expect(band.className).toContain('reveal');
      expect(band.className).not.toContain('is-seen');
      expect(band.querySelectorAll('[data-rv]').length, band.getAttribute('aria-labelledby')).toBeGreaterThan(1);
      // The heading of every band is one of the parts that arrive
      expect(band.querySelector('h2').closest('[data-rv]')).not.toBeNull();
    }

    const report = bands[2];
    const watcher = watchers.find((item) => item.element === report);
    act(() => watcher.callback([{ isIntersecting: false }]));
    expect(report.className).not.toContain('is-seen');
    act(() => watcher.callback([{ isIntersecting: true }]));
    expect(report.className).toContain('is-seen');
    expect(watcher.element).toBeNull();
    expect(bands[3].className).not.toContain('is-seen');
  });


  it('each band arrives in a way of its own', () => {
    watch();
    const { container } = renderSite('/');
    const ways = (id) => new Set([...container.querySelector(`section[aria-labelledby="${id}"]`).querySelectorAll('[data-rv]')].map((el) => el.dataset.rv));
    expect([...ways('proof-title')]).toEqual(expect.arrayContaining(['rise', 'tl', 'tr', 'bl', 'br']));
    expect([...ways('does-title')]).toEqual(expect.arrayContaining(['rise', 'grow']));
    expect([...ways('report-title')]).toEqual(expect.arrayContaining(['tilt', 'pop', 'grow']));
    expect([...ways('chat-title')]).toEqual(expect.arrayContaining(['left', 'pop']));
    expect([...ways('sources-title')]).toEqual(expect.arrayContaining(['rise', 'pop']));
  });


  it('the parts of a band take turns', () => {
    watch();
    const { container } = renderSite('/');
    const acts = [...container.querySelectorAll('section[aria-labelledby="sources-title"] li[data-rv]')];
    const turns = acts.map((el) => Number(el.style.getPropertyValue('--i')));
    expect(turns).toHaveLength(HEADLINE_ACTS.length);
    expect([...turns].sort((a, b) => a - b)).toEqual(turns);
    expect(new Set(turns).size).toBe(turns.length);
  });


  it('where the browser cannot tell what is in view, nothing waits', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = renderSite('/');
    const bands = [...container.querySelectorAll('main > section')].slice(1);
    for (const band of bands) expect(band.className).toContain('is-seen');
    expect(document.querySelector('mark').className).toBe('marked marked-draw');
  });


  it('every other page reveals too: each band under its head waits with parts of its own', () => {
    watch();
    for (const route of ['/product', '/method', '/documentation', '/about']) {
      const { container, unmount } = renderSite(route);
      const bands = [...container.querySelectorAll('main > section')].slice(1);
      expect(bands.length, route).toBeGreaterThan(2);
      for (const band of bands) {
        expect(band.className, `${route}: ${band.getAttribute('aria-labelledby')}`).toContain('reveal');
        expect(band.className).not.toContain('is-seen');
        expect(band.querySelectorAll('[data-rv]').length).toBeGreaterThan(1);
      }
      unmount();
    }
  });


  it('the long list of acts does not arrive as one: every group reveals on its own, its acts in turn', () => {
    const watchers = watch();
    const { container } = renderSite('/sources');
    const corpus = container.querySelector('section[aria-labelledby="corpus-title"]');
    expect(corpus.className).not.toContain('reveal');
    const groups = [...corpus.querySelectorAll('section.reveal')];
    expect(groups).toHaveLength(3);
    const [eu, lt] = groups;
    const turns = [...eu.querySelectorAll('dl > [data-rv]')].map((el) => Number(el.style.getPropertyValue('--i')));
    expect(turns).toHaveLength(EU_ACTS.length);
    expect([...turns].sort((a, b) => a - b)).toEqual(turns);
    // …and each says how many acts it holds
    expect(within(eu).getByRole('heading', { level: 3 }).textContent).toContain(String(EU_ACTS.length));

    act(() => watchers.find((item) => item.element === eu).callback([{ isIntersecting: true }]));
    expect(eu.className).toContain('is-seen');
    expect(lt.className).not.toContain('is-seen');
  });
});








// -----------------------------------------------------------
// what the pages show
// -----------------------------------------------------------

describe('the public site — the product on show', () => {

  it('the first finding quotes the duty and marks the passage that decides it', () => {
    renderSite('/', 'en');
    const finding = screen.getByRole('figure', { name: message('en', 'SITE.home.proof.specimen') });
    expect(within(finding).getByText(message('en', 'SITE.specimens.finding.duty'))).toBeTruthy();
    const marked = finding.querySelector('mark');
    expect(marked.textContent).toBe(message('en', 'SITE.specimens.finding.quote'));
    expect(marked.className).toContain('marked');
    expect(within(finding).getByText('Not met')).toBeTruthy();
  });


  it('the marker waits until the passage has come into view, then is drawn — and stays', () => {
    const watchers = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { this.callback = callback; watchers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.element = null; }
    });
    renderSite('/', 'en');
    const marked = document.querySelector('mark');
    const watcher = watchers.find((item) => item.element === marked);
    expect(marked.className).toBe('marked marked-wait');

    act(() => watcher.callback([{ isIntersecting: false }]));
    expect(marked.className).toBe('marked marked-wait');
    act(() => watcher.callback([{ isIntersecting: true }]));
    expect(marked.className).toBe('marked marked-draw');
    expect(watcher.element).toBeNull();
  });


  it('the product page draws the marker across its finding too, once it is seen', () => {
    renderSite('/product', 'en');
    expect(document.querySelector('mark').className).toBe('marked marked-wait');
  });


  it('the conversation is played: the question, the assistant\'s three dots for a moment, then the answer', () => {
    const { container } = renderSite('/product', 'en');
    const chat = screen.getByRole('figure', { name: message('en', 'SITE.product.chat.specimen') });
    const parts = [...chat.querySelectorAll('[data-rv]')];
    expect(parts.map((el) => el.dataset.rv)).toEqual(['pop', 'pop', 'think', 'rise']);
    const turns = parts.map((el) => Number(el.style.getPropertyValue('--i')));
    expect([...turns].sort((a, b) => a - b)).toEqual(turns);
    const dots = chat.querySelector('[data-rv="think"]');
    expect(dots.getAttribute('aria-hidden')).toBe('true');
    expect(dots.children).toHaveLength(3);
    // The answer itself is always in the document
    expect(within(chat).getByText(message('en', 'SITE.specimens.chat.answer'))).toBeTruthy();
    expect(container.querySelectorAll('[data-rv="think"]')).toHaveLength(1);
  });


  it('the analysis runs once it is seen: a stage finishes every tick, the cost climbs, and it starts over', () => {
    vi.useFakeTimers();
    try {
      const watchers = [];
      vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { this.callback = callback; watchers.push(this); }
        observe(element) { this.element = element; }
        disconnect() { this.element = null; }
      });
      renderSite('/product', 'en');
      const analysis = screen.getByRole('figure', { name: message('en', 'SITE.product.analysis.specimen') });
      const states = () => [...analysis.querySelectorAll('li')].map((li) => li.lastChild.textContent);
      const cost = () => analysis.querySelector('p:last-child').textContent;
      // At rest: the still picture
      expect(states()).toEqual(['done', 'done', 'done', 'done', 'running', 'waiting']);
      expect(cost()).toBe('AI cost so far: 0.52 USD · estimate: up to 5.80 USD');
      act(() => { vi.advanceTimersByTime(5000); });
      expect(states()).toEqual(['done', 'done', 'done', 'done', 'running', 'waiting']);

      const watcher = watchers.find((item) => item.element && item.element.contains(analysis));
      act(() => watcher.callback([{ isIntersecting: true }]));
      act(() => { vi.advanceTimersByTime(1150); });
      expect(states()).toEqual(['done', 'done', 'done', 'done', 'done', 'running']);
      expect(cost()).toContain('4.33 USD');
      act(() => { vi.advanceTimersByTime(1150); });
      expect(states()).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
      expect(cost()).toContain('5.02 USD');
      // Held finished for two ticks, then from the beginning
      act(() => { vi.advanceTimersByTime(2300); });
      expect(states()).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
      act(() => { vi.advanceTimersByTime(1150); });
      expect(states()).toEqual(['running', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
      expect(cost()).toContain('0.00 USD');
    } finally {
      vi.useRealTimers();
    }
  });


  it('the analysis counts its cost the way the visitor\'s language writes numbers', () => {
    renderSite('/product', 'lt');
    const analysis = screen.getByRole('figure', { name: message('lt', 'SITE.product.analysis.specimen') });
    expect(analysis.querySelector('p:last-child').textContent).toBe('DI kaina iki šiol: 0,52 USD · įvertis: iki 5,80 USD');
  });


  it('the specimens call the statuses what the console calls them', () => {
    for (const locale of ['lt', 'en']) {
      const { unmount } = renderSite('/method', locale);
      for (const status of ['met', 'partial', 'missing', 'unknown', 'not_applicable']) {
        expect(screen.getAllByText(message(locale, `ENUMS.findingStatus.${status}`)).length, `${status} (${locale})`).toBeGreaterThan(0);
      }
      unmount();
    }
  });


  it('the sample report\'s tabs are the report page\'s own', () => {
    renderSite('/', 'lt');
    const report = screen.getByRole('figure', { name: message('lt', 'SITE.home.report.specimen') });
    for (const tab of ['summary', 'acts', 'findings', 'plan', 'citations']) {
      expect(report.textContent).toContain(message('lt', `PAGES.report.TABS.${tab}`));
    }
  });


  it('the sources page lists every act of the three groups, each once, in the visitor\'s language', () => {
    const all = [...EU_ACTS, ...LT_LAWS, ...SUPERVISOR_ACTS];
    expect(new Set(all.map((act) => act.short)).size).toBe(all.length);
    for (const locale of ['lt', 'en']) {
      const { unmount } = renderSite('/sources', locale);
      const terms = [...document.querySelectorAll('dt')].map((dt) => dt.textContent);
      expect(terms).toEqual(all.map((act) => act.short));
      for (const act of all) expect(screen.getByText(act[locale])).toBeTruthy();
      unmount();
    }
  });


  it('the home page\'s act names are acts of the list', () => {
    const known = new Set([...EU_ACTS, ...LT_LAWS, ...SUPERVISOR_ACTS].map((act) => act.short));
    for (const act of HEADLINE_ACTS) expect(known.has(act), act).toBe(true);
  });


  it('the documentation page hands the book over in the visitor\'s language — a plain link, opened beside the site', async () => {
    const { user } = renderSite('/documentation', 'lt');
    const book = () => screen.getByRole('link', { name: /\(PDF\)$/ });
    expect(book().textContent).toBe(message('lt', 'SITE.documentation.open.action'));
    expect(book().getAttribute('href')).toBe('/docs/lt/documentation.pdf');
    expect(book().getAttribute('target')).toBe('_blank');
    expect(book().getAttribute('rel')).toBe('noopener');

    await user.click(screen.getByRole('button', { name: 'Switch the interface to English' }));
    expect(book().textContent).toBe(message('en', 'SITE.documentation.open.action'));
    expect(book().getAttribute('href')).toBe('/docs/en/documentation.pdf');
  });


  it('the method page\'s closing band does not link to the method page itself; the others do', () => {
    const closing = () => screen.getByRole('region', { name: 'Start with a conversation' });
    const first = renderSite('/method');
    expect(within(closing()).queryByRole('link', { name: 'Read the method' })).toBeNull();
    first.unmount();
    renderSite('/product');
    expect(within(closing()).getByRole('link', { name: 'Read the method' }).getAttribute('href')).toBe('/method');
  });
});







// -----------------------------------------------------------
// an address the site does not have
// -----------------------------------------------------------

describe('the public site — an address it does not have', () => {

  it.each(CONSOLE_SECTIONS)('hands the console\'s old address /%s on under /console, query and fragment kept', async (section) => {
    installLocationDouble(`/${section}/x1?tab=plan#f3`);
    const { container } = renderSite(`/${section}/x1?tab=plan#f3`);
    await waitFor(() => expect(window.location.navigations).toEqual([`/console/${section}/x1?tab=plan#f3`]));
    expect(container.querySelector('h1')).toBeNull();
  });


  it('hands the old sign-in address on with its way back', async () => {
    renderSite('/login?next=%2Freports%2Fr1&expired=1');
    await waitFor(() => expect(window.location.navigations).toEqual(['/console/login?next=%2Freports%2Fr1&expired=1']));
  });


  it('says "no such page" for anything else, with the way home, and goes nowhere', async () => {
    for (const locale of ['lt', 'en']) {
      const { unmount, user, router } = renderSite('/no/such/page', locale);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(message(locale, 'SITE.missing.TITLE'));
      expect(window.location.navigations).toEqual([]);
      await user.click(screen.getByRole('link', { name: message(locale, 'SITE.missing.home') }));
      expect(router.state.location.pathname).toBe('/');
      unmount();
    }
  });


  it('a page of the site whose name only starts like a console section is not handed on', () => {
    renderSite('/reports-and-more');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('There is no such page');
    expect(window.location.navigations).toEqual([]);
  });
});
