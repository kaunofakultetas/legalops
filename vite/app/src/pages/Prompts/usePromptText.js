// -----------------------------------------------------------
//  [*] usePromptText — a prompt's name and description
//
//  The backend seeds the shipped prompts with English names
//  and descriptions. Those slugs are translated in
//  PAGES.prompts.NAMES / DESCRIPTIONS (a dotted slug is a
//  nested key there); a prompt the table does not know keeps
//  the text the API sent.
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// usePromptText (default export)
// -----------------------------------------------------------
//
//   const text = usePromptText();
//   text.name(prompt)        → "Vadovybės santrauka"
//   text.description(prompt) → "Iš taikytinumo sprendimų…"
//
// Used by:
//   - Prompts.jsx — the list
//   - PromptEditor.jsx — the page title and subtitle
// -----------------------------------------------------------

export default function usePromptText() {
  const t = useTranslations('PAGES.prompts');
  return useMemo(() => {
    const pick = (group, prompt, fallback) => {
      const key = `${group}.${prompt.slug}`;
      const text = t(key);
      return typeof text === 'string' && text !== key ? text : fallback;
    };
    return {
      name: (prompt) => pick('NAMES', prompt, prompt.name),
      description: (prompt) => pick('DESCRIPTIONS', prompt, prompt.description),
    };
  }, [t]);
}
