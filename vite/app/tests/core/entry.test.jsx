// -----------------------------------------------------------
//  [*] Tests — main.jsx, the one entry of index.html
//
//  The address decides which of the two applications starts:
//  the console under /console, the public site everywhere
//  else. Both are stood in for here — how each mounts is
//  covered where it lives (app.test.jsx, site.test.jsx) —
//  so what is checked is which one the entry asks for, that
//  it asks for one only, and that the root is made white for
//  the console alone.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { installLocationDouble } from '../support/location';


// The entry loaded afresh on `path`, with the #root of
// index.html; answers the root and what was started
async function enter(path) {
  const started = [];
  vi.resetModules();
  vi.doMock('@/console', () => { started.push('console'); return {}; });
  vi.doMock('@/site/main', () => { started.push('site'); return {}; });
  installLocationDouble(path);
  document.body.innerHTML = '<div id="root"></div>';
  await import('@/main');
  await vi.dynamicImportSettled();
  return { root: document.getElementById('root'), started };
}


describe('main.jsx — the entry point', () => {

  it.each([
    ['/console'],
    ['/console/'],
    ['/console/login'],
    ['/console/reports/7f2c?tab=acts'],
    ['/console/prompts/chat.assistant'],
  ])('%s starts the console, on a white root', async (path) => {
    const { root, started } = await enter(path);
    expect(started).toEqual(['console']);
    expect(root.getAttribute('style')).toBe('min-height: 100dvh; background: #FFFFFF;');
  });


  it.each([
    ['/'],
    ['/product'],
    ['/no-such-page'],
    ['/consolex'],
    ['/product/console'],
  ])('%s starts the public site and leaves the root as the page has it', async (path) => {
    const { root, started } = await enter(path);
    expect(started).toEqual(['site']);
    expect(root.hasAttribute('style')).toBe(false);
  });
});
