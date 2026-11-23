// -----------------------------------------------------------
//  [*] Closing — the band that ends a public page
//
//  Where a page stops, the visitor is told how to begin: the
//  product starts with a conversation, and accounts are made
//  by an administrator — so the one action is to sign in,
//  and the honest sentence beside it says there is no
//  self-registration to look for.
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import { Band, ConsoleLink, Lede, Part, TextLink, Title } from '@/site/parts';







// -----------------------------------------------------------
// Closing (default export)
// -----------------------------------------------------------
//
// The band on the desk's grey-blue: the invitation on the
// left, the way into the console on the right with — unless
// `method` is false, as on the method page itself — a link
// to how the assistant assesses. With `reveal` (the first
// page) the two sides arrive as the band comes into view.
//
// Used by:
//   - every page of the site but "page not found"
// -----------------------------------------------------------

export default function Closing({ method = true, reveal = false }) {

  const t = useTranslations('SITE.common.closing');


  return (
    <Band ground="desk" labelledBy="closing-title" reveal={reveal} className="py-14 sm:py-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <Part>
          <Title id="closing-title">{t('title')}</Title>
          <Lede className="mt-3">{t('text')}</Lede>
        </Part>
        <Part move="pop" turn={2} className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-4">
          <ConsoleLink tone="light" />
          {method && <TextLink to="/method">{t('method')}</TextLink>}
        </Part>
      </div>
    </Band>
  );
}
