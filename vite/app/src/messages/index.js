// -----------------------------------------------------------
//  [*] Messages — per-page translation files (auto-discovered)
//
//  Each page/feature keeps its own lt.json + en.json pair in
//  a folder; files are discovered with import.meta.glob and
//  the useTranslations() namespace is the folder path with
//  "/" as ".":
//
//      messages/PAGES/jobs/lt.json → useTranslations("PAGES.jobs")
//
//  Adding translations for a new page: create the folder with
//  lt.json and en.json — nothing to register. In dev mode a
//  console warning is printed if the lt/en files of the same
//  folder have mismatched keys.
// -----------------------------------------------------------

// The two locales, lt first: it is the base the dev check
// compares the others against
const SUPPORTED_LOCALES = ["lt", "en"];

// Every locale JSON under messages/ (keys look like
// "./PAGES/users/lt.json"), loaded eagerly
const modules = import.meta.glob("./**/{lt,en}.json", { eager: true });







// -----------------------------------------------------------
// messagesMap
// -----------------------------------------------------------
//
// One message tree per locale, folder names as namespaces.
//
// Used by:
//   - i18n.jsx — every lookup
// -----------------------------------------------------------

export const messagesMap = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, {}]));

for (const [path, module] of Object.entries(modules)) {
  const segments = path.replace("./", "").replace(".json", "").split("/");
  const locale = segments.pop();
  if (!SUPPORTED_LOCALES.includes(locale)) continue;

  let node = messagesMap[locale];
  for (const segment of segments.slice(0, -1)) {
    node = node[segment] ??= {};
  }
  node[segments[segments.length - 1]] = module.default ?? module;
}







// -----------------------------------------------------------
// collectLeafPaths
// -----------------------------------------------------------
//
// Every dotted leaf key of a message tree — the dev-only
// consistency check compares these across locales.
//
// Used by:
//   - the dev check (below)
// -----------------------------------------------------------

function collectLeafPaths(obj, prefix = "") {
  const paths = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") paths.push(...collectLeafPaths(value, path));
    else paths.push(path);
  }
  return paths;
}


// Dev-only: warn when the lt/en pair of a folder disagrees
// on keys (a key translated in one language, forgotten in
// the other)
if (import.meta.env.DEV) {
  const [base, ...others] = SUPPORTED_LOCALES;
  const baseKeys = new Set(collectLeafPaths(messagesMap[base]));
  for (const locale of others) {
    const localeKeys = new Set(collectLeafPaths(messagesMap[locale]));
    const missing = [...baseKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !baseKeys.has(k));
    if (missing.length > 0)
      console.warn(`[messages] Keys present in "${base}" but missing in "${locale}":`, missing);
    if (extra.length > 0)
      console.warn(`[messages] Keys present in "${locale}" but missing in "${base}":`, extra);
  }
}
