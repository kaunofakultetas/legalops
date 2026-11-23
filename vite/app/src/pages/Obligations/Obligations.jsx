// -----------------------------------------------------------
//  [*] Obligations — the admin's review queue
//
//  Every obligation the model extracted from the corpus,
//  proposed ones first (the default filter): approve, edit
//  or reject one by one or in bulk. Approved obligations are
//  what the gap analysis judges companies against; rejected
//  ones never reach a report. The queue opens with the
//  obligations a second model doubted first — that is where
//  a review starts. The whole list lives in ObligationsPanel,
//  shared with an act's obligations tab.
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';
import PageLayout from '@/components/layout/PageLayout';
import ObligationsPanel from '@/pages/Obligations/ObligationsPanel';







// -----------------------------------------------------------
// Obligations (default export)
// -----------------------------------------------------------
//
// The page frame around the panel (act picker on, status
// "proposed" preselected, the doubted obligations first).
//
// Used by:
//   - router.jsx — route /obligations (adminOnly)
// -----------------------------------------------------------

export default function Obligations({ authData }) {
  const t = useTranslations('PAGES.obligations');
  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}>
      <ObligationsPanel isAdmin={authData.role === 'admin'} defaultStatus="proposed" reviewOrder />
    </PageLayout>
  );
}
