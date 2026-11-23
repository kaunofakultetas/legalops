// -----------------------------------------------------------
//  [*] Limits — what the assistant does not do
//
//  The three things a reader should know before relying on
//  a report, said as plainly as what the product does: it
//  does not replace a lawyer, it assesses documents and not
//  practice, and it does not guess. The home page ends with
//  them and the method page too — the two places where trust
//  is asked for.
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import { Band, Part, Title } from '@/site/parts';







// -----------------------------------------------------------
// Limits (default export)
// -----------------------------------------------------------
//
// The band: three short statements side by side, each under
// a hairline. `ground` is the band's ground, so the page can
// keep its grounds alternating; with `reveal` (the first
// page) the statements rise one after another as the band
// comes into view.
//
// Used by:
//   - pages/Home.jsx, pages/Method.jsx
// -----------------------------------------------------------

export default function Limits({ ground = 'paper', reveal = false }) {

  const t = useTranslations('SITE.home.limits');


  return (
    <Band ground={ground} labelledBy="limits-title" reveal={reveal}>
      <Part><Title id="limits-title">{t('title')}</Title></Part>
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {['lawyer', 'practice', 'guess'].map((limit, index) => (
          <Part key={limit} turn={1 + index * 1.5} className="border-t border-edge pt-5">
            <h3 className="m-0 font-serif text-[1.3125rem] font-semibold">{t(`${limit}.title`)}</h3>
            <p className="m-0 mt-2 leading-[1.6] text-muted">{t(`${limit}.text`)}</p>
          </Part>
        ))}
      </div>
    </Band>
  );
}
