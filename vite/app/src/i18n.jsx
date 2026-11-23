// -----------------------------------------------------------
//  [*] i18n — lightweight translations (lt / en)
//
//  Hand-rolled replacement for an i18n library. Messages live
//  in src/messages (one JSON tree per locale, merged by
//  messages/index.js into messagesMap). The active locale is
//  remembered for a year in the `locale` cookie; Lithuanian
//  is the default and the fallback for everything. The
//  provider also keeps <html lang> in step, so screen readers
//  and the browser's own UI (spellcheck, hyphenation) follow
//  the switch.
//
//  Split into (root component last):
//
//    getLocaleFromCookie — initial locale
//    getLocale           — the live locale outside React
//    resolve             — dotted path → subtree
//    formatMessage       — lookup + {param} interpolation
//    translate           — t() outside React
//    useTranslations     — t(key, params) for one namespace
//    useLocale           — current locale code
//    useSetLocale        — switch locale
//    IntlProvider        — the provider (named export)
// -----------------------------------------------------------

/* eslint-disable react-refresh/only-export-components --
   the provider and its hooks live in one module on purpose */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { messagesMap } from '@/messages';


// Lithuanian is the default and the fallback for every key
const DEFAULT_LOCALE = 'lt';

// The locales setLocale accepts; anything else is ignored
const SUPPORTED_LOCALES = ['lt', 'en'];

// One year — a session cookie forgot the choice with the tab
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

// The fallback tree, resolved once
const ltMessages = messagesMap.lt;

// { locale, messages, setLocale } — the defaults only serve
// a component rendered outside the provider
const IntlContext = createContext({
  locale: DEFAULT_LOCALE,
  messages: ltMessages,
  setLocale: () => {},
});







// -----------------------------------------------------------
// getLocaleFromCookie
// -----------------------------------------------------------
//
// The `locale` cookie if it holds a supported value,
// otherwise Lithuanian.
//
// Used by:
//   - IntlProvider (below) — initial state
//   - translate, getLocale (below) — outside React
// -----------------------------------------------------------

function getLocaleFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
  const locale = match ? match[1] : null;
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}







// -----------------------------------------------------------
// getLocale
// -----------------------------------------------------------
//
// The live locale for code outside React — the cookie is
// written on every switch, so it never lags the provider.
//
// Used by:
//   - utils/errors.js — errorMessage (the English prose rule)
// -----------------------------------------------------------

export function getLocale() {
  return getLocaleFromCookie();
}







// -----------------------------------------------------------
// resolve
// -----------------------------------------------------------
//
// Walks a dot-separated path into the message tree; returns
// undefined as soon as any step is missing.
//
// Used by:
//   - formatMessage, useTranslations (below)
// -----------------------------------------------------------

function resolve(obj, path) {
  const keys = path.split('.');
  let value = obj;
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) return undefined;
  }
  return value;
}







// -----------------------------------------------------------
// formatMessage
// -----------------------------------------------------------
//
// The one lookup+interpolation: a missing key comes back as
// the key itself (an untranslated string shows up literally
// instead of crashing); placeholders with no matching param
// stay literal so the gap is visible.
//
// Used by:
//   - translate, useTranslations (below)
// -----------------------------------------------------------

function formatMessage(messages, key, params) {
  const value = resolve(messages, key);
  if (value === undefined) return key;
  if (typeof value !== 'string') return value;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] !== undefined ? params[name] : `{${name}}`
  );
}







// -----------------------------------------------------------
// translate
// -----------------------------------------------------------
//
//   translate("COMPONENTS.errors.RETRY_AFTER", { seconds: 30 })
//
// t() for code that runs outside React — reads the locale
// from the cookie (unless one is passed) and formats a FULL
// key.
//
// Used by:
//   - utils/errors.js — every error sentence
// -----------------------------------------------------------

export function translate(key, params, locale) {
  const messages = messagesMap[locale || getLocaleFromCookie()] || ltMessages;
  return formatMessage(messages, key, params);
}







// -----------------------------------------------------------
// useTranslations
// -----------------------------------------------------------
//
//   const t = useTranslations("PAGES.users");
//   t("TITLE")                 → "Naudotojai"
//   t("greeting", { name })    → fills {name} placeholders
//
// The returned t() is memoized so components can list it in
// hook dependencies; it only changes on locale switch.
//
// Used by:
//   - Navbar, Sidebar, and every page
// -----------------------------------------------------------

export function useTranslations(namespace) {

  const { messages } = useContext(IntlContext);

  return useCallback((key, params) => {
    const section = namespace ? resolve(messages, namespace) : messages;
    if (!section) return key;
    return formatMessage(section, key, params);
  }, [messages, namespace]);
}







// -----------------------------------------------------------
// useLocale
// -----------------------------------------------------------
//
// Current locale code ("lt" | "en").
//
// Used by:
//   - Navbar.jsx, Login.jsx — the language switcher
//   - utils/errors.js, utils/format.js — locale-bound hooks
//   - StartAnalysisDialog.jsx — the default report language
// -----------------------------------------------------------

export function useLocale() {
  return useContext(IntlContext).locale;
}







// -----------------------------------------------------------
// useSetLocale
// -----------------------------------------------------------
//
// Switch the locale (validated, persisted to the cookie).
//
// Used by:
//   - Navbar.jsx, Login.jsx — the language switcher
// -----------------------------------------------------------

export function useSetLocale() {
  return useContext(IntlContext).setLocale;
}







// -----------------------------------------------------------
// IntlProvider
// -----------------------------------------------------------
//
// Holds the live locale and the matching message tree;
// setLocale validates, persists to the cookie and re-renders
// the app — no page reload. <html lang> follows the state.
//
// Used by:
//   - providers.jsx — the outermost provider
// -----------------------------------------------------------

export function IntlProvider({ children }) {

  const [locale, setLocaleState] = useState(getLocaleFromCookie);
  const messages = messagesMap[locale] || ltMessages;


  const setLocale = useCallback((newLocale) => {
    if (SUPPORTED_LOCALES.includes(newLocale)) {
      document.cookie = `locale=${newLocale}; path=/; max-age=${COOKIE_MAX_AGE_S}; SameSite=Lax`;
      setLocaleState(newLocale);
    }
  }, []);


  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);


  return (
    <IntlContext.Provider value={{ locale, messages, setLocale }}>
      {children}
    </IntlContext.Provider>
  );
}
