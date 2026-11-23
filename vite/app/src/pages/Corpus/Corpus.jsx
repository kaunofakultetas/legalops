// -----------------------------------------------------------
//  [*] Corpus — the legal corpus
//
//  Everybody reads it (it is public law): the catalogue of
//  acts, the retrieval playground and the citation checker,
//  as tabs kept in ?tab= (a switch keeps the other
//  parameters — the catalogue's filters and table page live
//  there too). Admins also get the write side in
//  the header: add an act, and — behind a menu, each
//  confirmed — "check all sources" (POST /refresh-all) and
//  "re-embed everything" (POST /reembed; costs model calls).
//  For users the admin controls simply do not render.
//
//  Split into (root component last):
//
//    TABS          — the tab keys, in order
//    AdminActions  — add + the bulk menu with confirmations
//    Corpus        — the page (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import ScatterPlotOutlinedIcon from '@mui/icons-material/ScatterPlotOutlined';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import { oneOf } from '@/utils/viewParams';
import useViewParams from '@/hooks/useViewParams';
import PageLayout from '@/components/layout/PageLayout';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import AddActDialog from '@/pages/Corpus/AddActDialog';
import CitationChecker from '@/pages/Corpus/CitationChecker';
import CorpusCatalogue from '@/pages/Corpus/CorpusCatalogue';
import CorpusSearch from '@/pages/Corpus/CorpusSearch';
import useQueueJob from '@/pages/Corpus/useQueueJob';


// The tabs, in display order (also the ?tab= values)
const TABS = ['catalogue', 'search', 'citations'];







// -----------------------------------------------------------
// AdminActions
// -----------------------------------------------------------
//
// "Add a legal act" and the bulk menu; the two bulk jobs
// are confirmed first (they touch every act).
//
// Used by:
//   - Corpus (below)
// -----------------------------------------------------------

function AdminActions({ onAdd }) {

  const t = useTranslations('PAGES.corpus');
  const describe = useErrorMessage();
  const queue = useQueueJob();
  const [anchor, setAnchor] = useState(null);
  const [confirm, setConfirm] = useState(null);


  const run = () => queue.mutate(
    { url: confirm === 'refreshAll' ? '/api/corpus/refresh-all' : '/api/corpus/reembed' },
    { onSuccess: () => setConfirm(null) },
  );


  return (
    <>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>{t('ACTIONS.add')}</Button>
      <IconButton aria-label={t('ACTIONS.more')} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setAnchor(null); queue.reset(); setConfirm('refreshAll'); }}>
          <ListItemIcon><SyncOutlinedIcon fontSize="small" /></ListItemIcon>{t('ACTIONS.refreshAll')}
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); queue.reset(); setConfirm('reembed'); }}>
          <ListItemIcon><ScatterPlotOutlinedIcon fontSize="small" /></ListItemIcon>{t('ACTIONS.reembed')}
        </MenuItem>
      </Menu>
      <UniversalModal open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={run} busy={queue.isPending}
                      error={queue.error ? describe(queue.error) : null} confirmLabel={t('CONFIRM.confirm')}
                      title={confirm === 'reembed' ? t('CONFIRM.reembedTitle') : t('CONFIRM.refreshAllTitle')}>
        <Typography>{confirm === 'reembed' ? t('CONFIRM.reembedText') : t('CONFIRM.refreshAllText')}</Typography>
      </UniversalModal>
    </>
  );
}







// -----------------------------------------------------------
// Corpus (default export)
// -----------------------------------------------------------
//
// The tabs; the admin-only header actions and add dialog.
//
// Used by:
//   - router.jsx — route /corpus
// -----------------------------------------------------------

export default function Corpus({ authData }) {

  const t = useTranslations('PAGES.corpus');
  const isAdmin = authData.role === 'admin';
  const [params, setView] = useViewParams();
  const tab = oneOf(params.get('tab'), TABS, 'catalogue');
  const [adding, setAdding] = useState(false);


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}
                actions={isAdmin ? <AdminActions onAdd={() => setAdding(true)} /> : null}>
      <Tabs value={tab} onChange={(_, next) => setView({ tab: next })} variant="scrollable" allowScrollButtonsMobile
            aria-label={t('TABS.label')} className="mb-4 border-b border-edge">
        {TABS.map((key) => <Tab key={key} value={key} label={t(`TABS.${key}`)} id={`corpus-tab-${key}`} aria-controls={`corpus-panel-${key}`} />)}
      </Tabs>
      <div role="tabpanel" id={`corpus-panel-${tab}`} aria-labelledby={`corpus-tab-${tab}`}>
        {tab === 'catalogue' && <CorpusCatalogue isAdmin={isAdmin} />}
        {tab === 'search' && <CorpusSearch />}
        {tab === 'citations' && <CitationChecker />}
      </div>
      {isAdmin && <AddActDialog open={adding} onClose={() => setAdding(false)} />}
    </PageLayout>
  );
}
