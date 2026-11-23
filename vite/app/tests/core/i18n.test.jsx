// -----------------------------------------------------------
//  [*] Tests — i18n.jsx and messages/index.js
//
//  The hand-rolled translation layer: the message trees built
//  from the messages/ folder layout (Lithuanian and English
//  with the same keys — there is NO per-key fallback between
//  them), translate() and getLocale() for code outside React,
//  the IntlProvider with its cookie-backed locale and <html
//  lang>, the hooks (useTranslations with namespaces and
//  dotted keys, useLocale, useSetLocale), the placeholder
//  filling, and "show the key itself" for a key the active
//  language lacks.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { messagesMap } from '@/messages';
import { IntlProvider, getLocale, translate, useTranslations, useLocale, useSetLocale } from '@/i18n';


// Flattens a tree to "dotted.path" → leaf
const leaves = (obj, prefix = '') => Object.entries(obj).reduce((out, [k, v]) => {
  const path = prefix ? `${prefix}.${k}` : k;
  return v !== null && typeof v === 'object' ? { ...out, ...leaves(v, path) } : { ...out, [path]: v };
}, {});

const clearLocaleCookie = () => {
  document.cookie = 'locale=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
};







// -----------------------------------------------------------
// messagesMap
// -----------------------------------------------------------

describe('messagesMap', () => {

  it('holds an lt and an en tree keyed by the messages folder layout', () => {
    expect(Object.keys(messagesMap).sort()).toEqual(['en', 'lt']);
    for (const locale of ['lt', 'en']) {
      expect(messagesMap[locale]).toHaveProperty('navbar.title');
      expect(messagesMap[locale]).toHaveProperty('sidebar.MAIN.chat');
      expect(messagesMap[locale]).toHaveProperty('PAGES.users.TITLE');
      expect(messagesMap[locale]).toHaveProperty('COMPONENTS.errors.CODES.NOT_FOUND');
      expect(messagesMap[locale]).toHaveProperty('ENUMS');
    }
  });


  it('gives both languages exactly the same leaf keys — the runtime has no fallback between them', () => {
    const lt = Object.keys(leaves(messagesMap.lt)).sort();
    const en = Object.keys(leaves(messagesMap.en)).sort();
    expect(en.filter((key) => !lt.includes(key))).toEqual([]);
    expect(lt.filter((key) => !en.includes(key))).toEqual([]);
  });


  it('keeps the two trees apart', () => {
    expect(messagesMap.lt.navbar.logout).toBe('Atsijungti');
    expect(messagesMap.en.navbar.logout).toBe('Log out');
    expect(messagesMap.en).not.toBe(messagesMap.lt);
  });


  it('holds only strings at the leaves — no numbers, booleans or nulls a t() would hand to React raw', () => {
    for (const locale of ['lt', 'en']) {
      const odd = Object.entries(leaves(messagesMap[locale])).filter(([, value]) => typeof value !== 'string');
      expect(odd).toEqual([]);
    }
  });
});







// -----------------------------------------------------------
// translate / getLocale
// -----------------------------------------------------------

describe('translate and getLocale (outside React)', () => {

  it('formats a full key in the cookie locale, Lithuanian without a cookie', () => {
    clearLocaleCookie();
    expect(getLocale()).toBe('lt');
    expect(translate('navbar.logout')).toBe('Atsijungti');
    document.cookie = 'locale=en; path=/';
    expect(getLocale()).toBe('en');
    expect(translate('navbar.logout')).toBe('Log out');
  });


  it('takes an explicit locale over the cookie', () => {
    document.cookie = 'locale=en; path=/';
    expect(translate('navbar.logout', undefined, 'lt')).toBe('Atsijungti');
  });


  it('falls back to Lithuanian for an unknown cookie value or an unsupported explicit locale', () => {
    document.cookie = 'locale=de; path=/';
    expect(getLocale()).toBe('lt');
    expect(translate('navbar.logout')).toBe('Atsijungti');
    expect(translate('navbar.logout', undefined, 'fr')).toBe('Atsijungti');
  });


  it('fills {placeholders} from params and leaves the unfilled ones literal', () => {
    expect(translate('COMPONENTS.errors.RETRY_AFTER', { seconds: 30 }, 'en')).toBe('Try again in 30 s.');
    expect(translate('COMPONENTS.errors.RETRY_AFTER', { other: 1 }, 'en')).toBe('Try again in {seconds} s.');
    expect(translate('COMPONENTS.errors.RETRY_AFTER', undefined, 'en')).toBe('Try again in {seconds} s.');
  });


  it('fills a placeholder with 0 and the empty string, but not with undefined', () => {
    expect(translate('COMPONENTS.errors.RETRY_AFTER', { seconds: 0 }, 'en')).toBe('Try again in 0 s.');
    expect(translate('COMPONENTS.errors.RETRY_AFTER', { seconds: '' }, 'en')).toBe('Try again in  s.');
    expect(translate('COMPONENTS.errors.RETRY_AFTER', { seconds: undefined }, 'en')).toBe('Try again in {seconds} s.');
  });


  it('fills the same placeholder everywhere it appears', () => {
    expect(translate('navbar.accountMenu', { name: 'Rūta' }, 'lt')).toBe('Paskyros meniu: Rūta');
  });


  it('returns a subtree as-is when the key points at one', () => {
    expect(translate('sidebar.MAIN', undefined, 'en')).toEqual(messagesMap.en.sidebar.MAIN);
  });


  it('returns the key itself for a key the language does not have', () => {
    expect(translate('navbar.NO_SUCH_KEY', undefined, 'en')).toBe('navbar.NO_SUCH_KEY');
    expect(translate('NOWHERE.at.all', undefined, 'lt')).toBe('NOWHERE.at.all');
  });
});







// -----------------------------------------------------------
// IntlProvider and the hooks
// -----------------------------------------------------------

function Probe({ namespace = 'navbar', keyName = 'logout', params }) {
  const t = useTranslations(namespace);
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <div>
      <span data-testid="text">{t(keyName, params)}</span>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => setLocale('lt')}>to-lt</button>
      <button onClick={() => setLocale('en')}>to-en</button>
      <button onClick={() => setLocale('xx')}>to-xx</button>
    </div>
  );
}

const mount = (props) => render(<IntlProvider><Probe {...props} /></IntlProvider>);


describe('IntlProvider + hooks', () => {

  it('starts in Lithuanian without a cookie and sets the document language', () => {
    clearLocaleCookie();
    mount();
    expect(screen.getByTestId('locale')).toHaveTextContent('lt');
    expect(screen.getByTestId('text')).toHaveTextContent('Atsijungti');
    expect(document.documentElement.lang).toBe('lt');
  });


  it('starts in English when the cookie says so', () => {
    document.cookie = 'locale=en; path=/';
    mount();
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('text')).toHaveTextContent('Log out');
    expect(document.documentElement.lang).toBe('en');
  });


  it('setLocale switches the language live, persists it for a year and updates the document language', async () => {
    mount();
    await act(async () => { screen.getByText('to-lt').click(); });
    expect(screen.getByTestId('text')).toHaveTextContent('Atsijungti');
    expect(document.cookie).toMatch(/(^|; )locale=lt(;|$)/);
    expect(document.documentElement.lang).toBe('lt');
    expect(getLocale()).toBe('lt');
    await act(async () => { screen.getByText('to-en').click(); });
    expect(screen.getByTestId('text')).toHaveTextContent('Log out');
    expect(document.documentElement.lang).toBe('en');
  });


  it('writes the cookie with a year of max-age, site-wide and SameSite=Lax', async () => {
    const writes = [];
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => descriptor.get.call(document),
      set: (value) => { writes.push(value); descriptor.set.call(document, value); },
    });
    try {
      mount();
      await act(async () => { screen.getByText('to-lt').click(); });
      expect(writes).toContain(`locale=lt; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`);
    } finally {
      delete document.cookie;
    }
  });


  it('ignores an unsupported locale', async () => {
    mount();
    await act(async () => { screen.getByText('to-xx').click(); });
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(document.cookie).not.toMatch(/locale=xx/);
  });


  it('useTranslations resolves dotted keys inside a namespace and fills params', () => {
    mount({ namespace: 'sidebar', keyName: 'ADMIN.users' });
    expect(screen.getByTestId('text')).toHaveTextContent('Users');
    mount({ namespace: 'navbar', keyName: 'accountMenu', params: { name: 'Rūta' } });
    expect(screen.getAllByTestId('text')[1]).toHaveTextContent('Account menu: Rūta');
  });


  it('useTranslations without a namespace reads the whole tree', () => {
    mount({ namespace: null, keyName: 'navbar.title' });
    expect(screen.getByTestId('text')).toHaveTextContent('Compliance assistant');
  });


  it('an unknown namespace or key shows the key itself', () => {
    mount({ namespace: 'PAGES.nowhere', keyName: 'TITLE' });
    expect(screen.getByTestId('text')).toHaveTextContent('TITLE');
    mount({ namespace: 'navbar', keyName: 'NOPE.NOPE' });
    expect(screen.getAllByTestId('text')[1]).toHaveTextContent('NOPE.NOPE');
  });


  it('the t() function is stable between renders and changes with the locale', async () => {
    const seen = [];
    function Watcher() {
      const t = useTranslations('navbar');
      seen.push(t);
      const setLocale = useSetLocale();
      return <button onClick={() => setLocale('lt')}>go</button>;
    }
    const { rerender } = render(<IntlProvider><Watcher /></IntlProvider>);
    rerender(<IntlProvider><Watcher /></IntlProvider>);
    expect(seen[1]).toBe(seen[0]);
    await act(async () => { screen.getByText('go').click(); });
    expect(seen.at(-1)).not.toBe(seen[0]);
  });


  it('outside a provider the hooks read Lithuanian and setLocale does nothing', async () => {
    render(<Probe />);
    expect(screen.getByTestId('locale')).toHaveTextContent('lt');
    expect(screen.getByTestId('text')).toHaveTextContent('Atsijungti');
    await act(async () => { screen.getByText('to-en').click(); });
    expect(screen.getByTestId('text')).toHaveTextContent('Atsijungti');
  });
});
