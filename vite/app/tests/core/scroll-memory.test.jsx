// -----------------------------------------------------------
//  [*] Tests — coming back to a page where it was left
//
//  The pages scroll inside PageLayout's scrolling area (the
//  `main` of this file), which every page renders afresh.
//  Covered here, on a small app of three PageLayout pages (a
//  list, an item with a back link, an unrelated page) behind
//  the real NavigationMemory tracker:
//
//    - useScrollMemory: Back / Forward bring the entry's
//      position back, a new page (a new item of the same
//      component included) starts at the top, a replace on
//      the same page moves nothing and Back to it finds the
//      position, a pushed link to another view of the same
//      page starts at the top; late content (the restore
//      waits for the height), the user's own wheel or key
//      ending a waiting restore, a #hash target, a fragment
//      jump of the browser's own (the skip link), no focus
//      taken
//    - useReturnTo through PageHeader's back link: the list
//      right behind → a real Back (its entry, address and
//      place); reached from elsewhere → the list as last seen
//      (a new entry, restored by address); never seen → the
//      bare address at the top; a double click goes Back
//      once; a modified click is the browser's
//    - navigationMemory's stored copy: a reload finds the
//      positions, a reused key at another address is not
//      believed, the lists are capped, a stored copy of the
//      wrong shape and a storage that throws cost nothing
//    - restoreScroll on its own: holding a reached position
//      through a scroll-anchoring jump, the time limit,
//      cancel and a scroller that left the page (no listener
//      or frame left behind)
//    - useKeptScroll (a scroller that unmounts with a drawer)
//    - useOverlayParam (?job= drawers: Back closes them,
//      closing is Back or a replace, bad ids read as closed,
//      the page's scroll never moves)
//
//  jsdom has no layout: the `layout` double answers
//  scrollHeight / clientHeight for <main> and the kept
//  scroller, and a user's scroll is scrollTop set by hand
//  plus the scroll event the browser would fire.
// -----------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Outlet, RouterProvider, createMemoryRouter, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import Providers from '@/providers';
import NavigationMemory from '@/components/layout/NavigationMemory';
import PageLayout from '@/components/layout/PageLayout';
import useKeptScroll from '@/hooks/useKeptScroll';
import useOverlayParam from '@/hooks/useOverlayParam';
import useViewParams from '@/hooks/useViewParams';
import restoreScroll, { RESTORE_TIMEOUT_MS } from '@/utils/restoreScroll';
import { noteNavigation, rememberScroll } from '@/utils/navigationMemory';
import { idParam } from '@/utils/viewParams';
import { authData, makeQueryClient, setLocaleCookie } from '../support/render';


// The heights jsdom cannot compute: the page scroller's
// content and viewport, and the kept scroller's (id "kept")
const layout = { main: { content: 3000, view: 600 }, kept: { content: 1500, view: 300 } };

// The rows of the list page
const ITEMS = Array.from({ length: 30 }, (_, i) => i + 1);







// -----------------------------------------------------------
// Layout double and helpers
// -----------------------------------------------------------
//
// scrollHeight / clientHeight / getBoundingClientRect are
// defined on HTMLElement.prototype for the test (shadowing
// jsdom's zeros on Element.prototype) and deleted after it.
// `rects` gives an element (by id) a viewport top — a number,
// or a function of the moment (an element inside <main> moves
// up as <main> scrolls).
// -----------------------------------------------------------

const rects = {};

beforeEach(() => {
  layout.main = { content: 3000, view: 600 };
  layout.kept = { content: 1500, view: 300 };
  for (const id of Object.keys(rects)) delete rects[id];
  const size = (element, key) => {
    if (element.id === 'page-scroll') return layout.main[key];
    if (element.id === 'kept') return layout.kept[key];
    return 0;
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return size(this, 'content'); } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return size(this, 'view'); } });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true, writable: true,
    value() {
      const rect = rects[this.id] ?? 0;
      const top = typeof rect === 'function' ? rect() : rect;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top };
    },
  });
});

afterEach(() => {
  delete HTMLElement.prototype.scrollHeight;
  delete HTMLElement.prototype.clientHeight;
  delete HTMLElement.prototype.getBoundingClientRect;
});

// The page's scroller: PageLayout's scrolling area
const main = () => document.getElementById('page-scroll');

// The user scrolls <main> (or `element`) to `top`
function userScrolls(top, element = main()) {
  act(() => {
    element.scrollTop = top;
    fireEvent.scroll(element);
  });
}

// A few animation frames go by
const frames = (ms = 120) => act(() => new Promise((resolve) => { setTimeout(resolve, ms); }));

const settledAt = (top) => waitFor(() => expect(main().scrollTop).toBe(top));

const backLink = () => within(main()).getByRole('link', { name: 'All items' });







// -----------------------------------------------------------
// The little app
// -----------------------------------------------------------
//
// /items (a list with a filter that replaces the address),
// /items/:id (a detail with the back link, a tab that
// replaces the address, a #part-3 section, links onwards),
// /elsewhere (a page that links to an item), /jobs (a list
// with a ?job= drawer). renderPages mounts them with the
// providers and the NavigationMemory tracker, as App does.
// -----------------------------------------------------------

function ListPage() {
  const [, setView] = useViewParams();
  return (
    <PageLayout authData={authData} title="Items">
      <button type="button" onClick={() => setView({ q: 'x' })}>Filter</button>
      <ul>{ITEMS.map((n) => <li key={n}><Link to={`/items/${n}`}>{`Item ${n}`}</Link></li>)}</ul>
    </PageLayout>
  );
}

function ItemPage() {
  const { id } = useParams();
  const [, setView] = useViewParams();
  return (
    <PageLayout authData={authData} title={`Item ${id}`} back={{ to: '/items', label: 'All items' }}>
      <button type="button" onClick={() => setView({ tab: 'notes' })}>Notes tab</button>
      <Link to="?view=history">History view</Link>
      <Link to="/elsewhere">Elsewhere</Link>
      <Link to={`/items/${Number(id) + 1}`}>Next item</Link>
      <section id="part-3">Part 3</section>
    </PageLayout>
  );
}

function ElsewherePage() {
  return <PageLayout authData={authData} title="Elsewhere"><Link to="/items/7">Item seven</Link></PageLayout>;
}

function JobsPage() {
  const [job, openJob, closeJob] = useOverlayParam('job', idParam);
  return (
    <PageLayout authData={authData} title="Jobs">
      <button type="button" onClick={() => openJob('j1')}>Details</button>
      {job && <div role="dialog" aria-label="Job"><p>{`job ${job}`}</p><button type="button" onClick={closeJob}>Close</button></div>}
    </PageLayout>
  );
}

function renderPages(initialEntries = ['/items'], initialIndex = undefined) {
  setLocaleCookie('en');
  const router = createMemoryRouter([{
    element: <Providers><NavigationMemory /><Outlet /></Providers>,
    children: [
      { path: '/items', element: <ListPage /> },
      { path: '/items/:id', element: <ItemPage /> },
      { path: '/elsewhere', element: <ElsewherePage /> },
      { path: '/jobs', element: <JobsPage /> },
    ],
  }], { initialEntries, initialIndex });
  render(<QueryClientProvider client={makeQueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, user: userEvent.setup() };
}

const go = (router, to) => act(async () => { await router.navigate(to); });







// -----------------------------------------------------------
// Back and Forward
// -----------------------------------------------------------

describe('Scroll memory — Back and Forward', () => {

  it('Back brings the list back where it was left, Forward the item', async () => {
    const { router, user } = renderPages();
    userScrolls(1200);
    await user.click(screen.getByRole('link', { name: 'Item 12' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 12' });
    expect(main().scrollTop).toBe(0);
    userScrolls(400);

    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    expect(router.state.historyAction).toBe('POP');
    await settledAt(1200);

    await go(router, 1);
    await screen.findByRole('heading', { level: 1, name: 'Item 12' });
    await settledAt(400);
  });


  it('a new page starts at the top — even another item on the same, still mounted component', async () => {
    const { router, user } = renderPages(['/items/1']);
    const first = main();
    userScrolls(700);
    await user.click(screen.getByRole('link', { name: 'Next item' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 2' });
    expect(main()).toBe(first);
    expect(main().scrollTop).toBe(0);
    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Item 1' });
    await settledAt(700);
  });


  it('another address of the same page (a replace) moves nothing, and Back to it finds the place', async () => {
    const { router, user } = renderPages();
    userScrolls(900);
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=x'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(main().scrollTop).toBe(900);

    await user.click(screen.getByRole('link', { name: 'Item 3' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 3' });
    await user.click(screen.getByRole('button', { name: 'Notes tab' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=notes'));
    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    expect(router.state.location.search).toBe('?q=x');
    await settledAt(900);
  });


  it('late content: the position waits until the page is tall enough, then lands', async () => {
    const { router, user } = renderPages();
    userScrolls(1500);
    await user.click(screen.getByRole('link', { name: 'Item 20' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 20' });
    // The list comes back before its rows: 400 px of page
    layout.main.content = 400;
    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    await frames();
    expect(main().scrollTop).toBe(0);
    layout.main.content = 3000;
    await settledAt(1500);
  });


  it('the user\'s own wheel ends a waiting restore — the page stays where they put it', async () => {
    const { router, user } = renderPages();
    userScrolls(1500);
    await user.click(screen.getByRole('link', { name: 'Item 20' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 20' });
    layout.main.content = 400;
    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    fireEvent.wheel(main(), { deltaY: 40 });
    layout.main.content = 3000;
    await frames(200);
    expect(main().scrollTop).toBe(0);
  });


  it('a key pressed anywhere ends it too — and a later scroll of the user is what the entry remembers', async () => {
    const { router, user } = renderPages();
    userScrolls(1500);
    await user.click(screen.getByRole('link', { name: 'Item 20' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 20' });
    layout.main.content = 400;
    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    layout.main.content = 3000;
    await frames(200);
    expect(main().scrollTop).toBe(0);

    userScrolls(250);
    await user.click(screen.getByRole('link', { name: 'Item 2' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 2' });
    await go(router, -1);
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    await settledAt(250);
  });


  it('takes no focus: the restore moves the view, not the keyboard', async () => {
    const { router, user } = renderPages();
    userScrolls(1200);
    await user.click(screen.getByRole('link', { name: 'Item 12' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 12' });
    await go(router, -1);
    await settledAt(1200);
    expect(document.activeElement).not.toBe(main());
    expect(within(main()).queryByRole('link', { name: 'Item 12' })).not.toHaveFocus();
  });


  it('a new page with a #hash opens at that element (once it is there)', async () => {
    rects['page-scroll'] = 50;
    rects['part-3'] = () => 950 - main().scrollTop;
    const { router } = renderPages();
    await go(router, '/items/4#part-3');
    await screen.findByRole('heading', { level: 1, name: 'Item 4' });
    await settledAt(900);
  });


  it('a link to another view of the same page (pushed) starts at the top; Back finds the place again', async () => {
    const { router, user } = renderPages(['/items/1']);
    userScrolls(700);
    await user.click(screen.getByRole('link', { name: 'History view' }));
    await waitFor(() => expect(router.state.location.search).toBe('?view=history'));
    expect(router.state.historyAction).toBe('PUSH');
    await settledAt(0);
    await go(router, -1);
    await settledAt(700);
  });


  it('a jump to a #fragment the browser made itself (the skip link, a footnote) moves nothing', async () => {
    // What React Router sees of it: a POP to an entry with an
    // empty history state and the hash — the key "default",
    // which the page's own first entry has too (here: the
    // first entry, left at 300, is where the jump lands)
    rects['part-3'] = () => 900 - main().scrollTop;
    const { router } = renderPages(['/items/1#part-3', '/items/1'], 0);
    await settledAt(900);
    await frames(400);
    userScrolls(300);
    await go(router, 1);
    // the browser's own scroll to the fragment
    userScrolls(600);
    await go(router, -1);
    expect(router.state.location.key).toBe('default');
    expect(router.state.location.hash).toBe('#part-3');
    await frames();
    expect(main().scrollTop).toBe(600);
  });
});







// -----------------------------------------------------------
// The back link
// -----------------------------------------------------------

describe('Scroll memory — the back link behaves like Back', () => {

  it('with the list right behind it IS Back: the list\'s own entry, its address and its place', async () => {
    const { router, user } = renderPages(['/items?q=x']);
    const listKey = router.state.location.key;
    userScrolls(1100);
    await user.click(screen.getByRole('link', { name: 'Item 11' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 11' });
    // a tab switch on the item does not hide the list behind it
    await user.click(screen.getByRole('button', { name: 'Notes tab' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=notes'));

    expect(backLink()).toHaveAttribute('href', '/items');
    await user.click(backLink());
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(listKey);
    expect(router.state.location.search).toBe('?q=x');
    await settledAt(1100);
  });


  it('reached from elsewhere, it opens the list as last seen — a new entry, at the place last seen there', async () => {
    const { router, user } = renderPages();
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=x'));
    userScrolls(1300);
    await go(router, '/elsewhere');
    await user.click(screen.getByRole('link', { name: 'Item seven' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 7' });

    await user.click(backLink());
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.search).toBe('?q=x');
    expect(router.state.location.state).toEqual({ returning: true });
    await settledAt(1300);
  });


  it('a list never seen opens at its bare address, at the top', async () => {
    const { router, user } = renderPages(['/items/5']);
    await user.click(backLink());
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.search).toBe('');
    await frames();
    expect(main().scrollTop).toBe(0);
  });


  it('a double click goes Back once, never past the list', async () => {
    const { router, user } = renderPages(['/elsewhere', '/items'], 1);
    await user.click(screen.getByRole('link', { name: 'Item 4' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 4' });
    await user.dblClick(backLink());
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    await frames();
    expect(router.state.location.pathname).toBe('/items');
  });


  it('a click with a modifier (a new tab) is left to the browser — the page stays', async () => {
    const { router, user } = renderPages(['/items', '/items/6'], 1);
    await screen.findByRole('heading', { level: 1, name: 'Item 6' });
    await user.keyboard('{Control>}');
    await user.click(backLink());
    await user.keyboard('{/Control}');
    expect(router.state.location.pathname).toBe('/items/6');
  });
});







// -----------------------------------------------------------
// The stored copy
// -----------------------------------------------------------

describe('navigationMemory — the stored copy', () => {

  const at = (key, pathname, search = '') => ({ key, pathname, search });


  it('a reload of the tab finds the positions again — and does not believe a reused key at another address', async () => {
    noteNavigation(at('k1', '/items', '?q=x'), 'POP', null);
    rememberScroll(at('k1', '/items', '?q=x'), 700);
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem('complianceNavigation')).toContain('/items?q=x');

    vi.resetModules();
    const reloaded = await import('@/utils/navigationMemory');
    expect(reloaded.recallScroll(at('k1', '/items', '?q=x'))).toBe(700);
    expect(reloaded.recallScroll(at('k1', '/reports'))).toBeUndefined();
    expect(reloaded.lastUrlOf('/items')).toBe('/items?q=x');
  });


  it('keeps at most 200 entries and 100 addresses, the oldest dropped', async () => {
    for (let i = 0; i < 250; i += 1) rememberScroll(at(`k${i}`, `/items/${i}`), i);
    // the write a moment after the last change (the reloaded
    // copies of the module above would answer a pagehide too)
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    const stored = JSON.parse(sessionStorage.getItem('complianceNavigation'));
    expect(stored.entries).toHaveLength(200);
    expect(stored.urls).toHaveLength(100);
    expect(stored.entries[0][0]).toBe('k50');

    vi.resetModules();
    const reloaded = await import('@/utils/navigationMemory');
    expect(reloaded.recallScroll(at('k10', '/items/10'))).toBeUndefined();
    expect(reloaded.recallScroll(at('k249', '/items/249'))).toBe(249);
  });


  it('a stored copy of the wrong shape (or no JSON at all) is ignored, row by row', async () => {
    sessionStorage.setItem('complianceNavigation', JSON.stringify({
      entries: [['k1', { url: 'no-slash', top: 5 }], ['k2', { url: '/ok', top: -3 }], ['k3', { url: '/good', top: 40 }], 'junk'],
      urls: 'nope', pages: [[1, 2]], kept: [['chat.threads', 'far']],
    }));
    vi.resetModules();
    let reloaded = await import('@/utils/navigationMemory');
    expect(reloaded.recallScroll(at('k1', 'no-slash'))).toBeUndefined();
    expect(reloaded.recallScroll(at('k2', '/ok'))).toBeUndefined();
    expect(reloaded.recallScroll(at('k3', '/good'))).toBe(40);
    expect(reloaded.recallKept('chat.threads')).toBeUndefined();

    sessionStorage.setItem('complianceNavigation', '<<< not json');
    vi.resetModules();
    reloaded = await import('@/utils/navigationMemory');
    expect(reloaded.recallScroll(at('k3', '/good'))).toBeUndefined();
  });


  it('a storage that throws (private mode, a full quota) costs nothing but the reload case', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const { router, user } = renderPages();
    userScrolls(1200);
    await user.click(screen.getByRole('link', { name: 'Item 12' }));
    await screen.findByRole('heading', { level: 1, name: 'Item 12' });
    await frames(300);
    window.dispatchEvent(new Event('pagehide'));
    await user.click(backLink());
    await screen.findByRole('heading', { level: 1, name: 'Items' });
    expect(router.state.historyAction).toBe('POP');
    await settledAt(1200);
  });
});







// -----------------------------------------------------------
// restoreScroll
// -----------------------------------------------------------

describe('restoreScroll', () => {

  const scroller = () => {
    const element = document.createElement('div');
    element.id = 'kept';
    document.body.append(element);
    return element;
  };


  it('holds a reached position until the content settles — a scroll-anchoring jump is undone', async () => {
    const element = scroller();
    const onEnd = vi.fn();
    restoreScroll(element, 900, { onEnd });
    expect(element.scrollTop).toBe(900);
    // the rows above are measured taller: the browser anchors
    layout.kept.content = 2500;
    element.scrollTop = 1900;
    await waitFor(() => expect(element.scrollTop).toBe(900));
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith('restored'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });


  it('gives up after RESTORE_TIMEOUT_MS, as far down as the content then lets it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const element = scroller();
    layout.kept.content = 700;
    const onEnd = vi.fn();
    restoreScroll(element, 900, { onEnd });
    vi.advanceTimersByTime(RESTORE_TIMEOUT_MS - 100);
    expect(onEnd).not.toHaveBeenCalled();
    expect(element.scrollTop).toBe(0);
    vi.advanceTimersByTime(200);
    expect(onEnd).toHaveBeenCalledWith('timeout');
    expect(element.scrollTop).toBe(400);
  });


  it('a cancel ends it — no frame and no listener is left behind', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const removed = vi.spyOn(window, 'removeEventListener');
    const element = scroller();
    layout.kept.content = 100;
    const onEnd = vi.fn();
    const cancel = restoreScroll(element, 900, { onEnd });
    cancel();
    expect(onEnd).toHaveBeenCalledWith('cancelled');
    expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    layout.kept.content = 3000;
    vi.advanceTimersByTime(500);
    expect(element.scrollTop).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });


  it('ends by itself once its scroller left the page', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const element = scroller();
    layout.kept.content = 100;
    const onEnd = vi.fn();
    restoreScroll(element, 900, { onEnd });
    element.remove();
    vi.advanceTimersByTime(50);
    expect(onEnd).toHaveBeenCalledWith('cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });


  it('a target of 0 is reached at once, before it returns', () => {
    const element = scroller();
    element.scrollTop = 300;
    const onEnd = vi.fn();
    restoreScroll(element, 0, { onEnd });
    expect(element.scrollTop).toBe(0);
    expect(onEnd).toHaveBeenCalledWith('restored');
  });
});







// -----------------------------------------------------------
// useKeptScroll
// -----------------------------------------------------------

// The kept scroller of a drawer-like panel
function KeptScroller({ name }) {
  const ref = useRef(null);
  useKeptScroll(ref, name);
  return <div id="kept" ref={ref}>rows</div>;
}

// A panel whose scroller unmounts while it is hidden
function Panel({ name }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown(!shown)}>Toggle</button>
      {shown && <KeptScroller name={name} />}
    </>
  );
}


describe('useKeptScroll', () => {


  it('the scroller opens again where it was left', async () => {
    const user = userEvent.setup();
    render(<Panel name="chat.threads" />);
    userScrolls(420, document.getElementById('kept'));
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(document.getElementById('kept')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await waitFor(() => expect(document.getElementById('kept').scrollTop).toBe(420));
  });


  it('keeps nothing without a name', async () => {
    const user = userEvent.setup();
    render(<Panel name={null} />);
    userScrolls(420, document.getElementById('kept'));
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await frames();
    expect(document.getElementById('kept').scrollTop).toBe(0);
  });
});







// -----------------------------------------------------------
// useOverlayParam
// -----------------------------------------------------------

describe('useOverlayParam — a drawer in the address', () => {

  it('opening pushes the id (Back closes it); closing is Back to the page\'s own entry', async () => {
    const { router, user } = renderPages(['/jobs?status=failed']);
    const pageKey = router.state.location.key;
    userScrolls(800);
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('dialog', { name: 'Job' })).toHaveTextContent('job j1');
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.search).toBe('?status=failed&job=j1');
    expect(main().scrollTop).toBe(800);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.key).toBe(pageKey);
    expect(main().scrollTop).toBe(800);

    await user.click(screen.getByRole('button', { name: 'Details' }));
    await screen.findByRole('dialog', { name: 'Job' });
    await go(router, -1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.search).toBe('?status=failed');
  });


  it('opened from a link (the address carried the id), closing replaces the address without it', async () => {
    const { router, user } = renderPages(['/jobs?status=failed&job=j1']);
    await screen.findByRole('dialog', { name: 'Job' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.search).toBe('?status=failed');
  });


  it('an id the page refuses reads as closed', async () => {
    renderPages(['/jobs?job=..%2Fadmin']);
    await screen.findByRole('heading', { level: 1, name: 'Jobs' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
