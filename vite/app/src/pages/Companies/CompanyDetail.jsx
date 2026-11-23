// -----------------------------------------------------------
//  [*] CompanyDetail — one company, all its facets
//
//  GET /api/companies/{id} (profile + credentials + adopted
//  standards + roles + documents) feeds nine tabs: profile
//  editor, licences and credentials, standards, documents,
//  roles, reports, the action register (what the signed-off
//  reports' plans called for, and what the law did since),
//  the compliance programme (its work products — policy,
//  governance, risk register) and linked chats.
//  The tab lives in ?tab= so Back and deep links work
//  (/companies/<id>?tab=reports); a tab switch keeps the
//  other parameters — the tabs' tables keep their page and
//  sort there (?documents.page=2). A tab is mounted on first
//  visit and then kept, so unsaved profile edits survive a
//  look at another tab. The back link and the delete return
//  to the list the way Back would (useReturnTo).
//
//  The header carries "run compliance analysis" (the start
//  dialog, company fixed) and a menu with "new chat about
//  the company" (POST /api/chat/threads {companyId}, then the
//  chat opens it) and "delete" (409 STILL_RUNNING while an
//  analysis runs — said in the dialog).
//
//  Split into (root component last):
//
//    TABS          — the tab keys, in order
//    HeaderActions — the analysis button and the menu
//    DeleteDialog  — the delete confirmation
//    TabPanels     — the kept-mounted panels
//    CompanyDetail — the page (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import useReturnTo from '@/hooks/useReturnTo';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import ErrorState from '@/components/ErrorState/ErrorState';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import CompanyProfile from '@/pages/Companies/CompanyProfile';
import CompanyCredentials from '@/pages/Companies/CompanyCredentials';
import CompanyStandards from '@/pages/Companies/CompanyStandards';
import CompanyDocuments from '@/pages/Companies/CompanyDocuments';
import CompanyRoles from '@/pages/Companies/CompanyRoles';
import CompanyReports from '@/pages/Companies/CompanyReports';
import CompanyActions from '@/pages/Companies/CompanyActions';
import CompanyProgramme from '@/pages/Companies/CompanyProgramme';
import CompanyThreads from '@/pages/Companies/CompanyThreads';
import StartAnalysisDialog from '@/pages/Reports/StartAnalysisDialog';


// The tabs, in display order (also the ?tab= values)
const TABS = ['profile', 'credentials', 'standards', 'documents', 'roles', 'reports', 'actions', 'programme', 'threads'];







// -----------------------------------------------------------
// HeaderActions
// -----------------------------------------------------------
//
// "Run compliance analysis" and the more-actions menu.
//
// Used by:
//   - CompanyDetail (below)
// -----------------------------------------------------------

function HeaderActions({ onRun, onNewChat, onDelete, chatBusy }) {

  const t = useTranslations('PAGES.company');
  const [anchor, setAnchor] = useState(null);


  return (
    <>
      <Button variant="contained" startIcon={<PlayArrowOutlinedIcon />} onClick={onRun}>{t('runAnalysis')}</Button>
      <IconButton aria-label={t('moreActions')} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled={chatBusy} onClick={() => { setAnchor(null); onNewChat(); }}>
          <ListItemIcon><ForumOutlinedIcon fontSize="small" /></ListItemIcon>{t('newChat')}
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDelete(); }} className="text-red-700">
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>{t('delete')}
        </MenuItem>
      </Menu>
    </>
  );
}







// -----------------------------------------------------------
// DeleteDialog
// -----------------------------------------------------------
//
// DELETE /api/companies/{id}; success returns to the list —
// Back to it when it is right behind, else the list replaces
// the deleted company's entry (useReturnTo).
//
// Used by:
//   - CompanyDetail (below)
// -----------------------------------------------------------

function DeleteDialog({ open, company, onClose }) {

  const t = useTranslations('PAGES.company');
  const describe = useErrorMessage();
  const returnTo = useReturnTo();
  const queryClient = useQueryClient();


  const remove = useMutation({
    mutationFn: () => api.delete(`/api/companies/${company.id}`, { silent: true }),
    onSuccess: () => {
      toast.success(t('TOASTS.deleted'));
      queryClient.removeQueries({ queryKey: ['company', company.id] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      returnTo('/companies', { replace: true });
    },
  });


  return (
    <UniversalModal open={open} onClose={onClose} onConfirm={() => remove.mutate()} onExited={() => remove.reset()} danger
                    busy={remove.isPending} error={remove.error ? describe(remove.error) : null}
                    title={t('DELETE.title', { name: company.name })} confirmLabel={t('DELETE.confirm')}>
      <Typography>{t('DELETE.text')}</Typography>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// TabPanels
// -----------------------------------------------------------
//
// Renders every visited tab, hiding the inactive ones, so
// their state (a dirty profile form) survives switching.
//
// Used by:
//   - CompanyDetail (below)
// -----------------------------------------------------------

function TabPanels({ tab, visited, company, onRun, newChatButton }) {
  const panels = {
    profile: <CompanyProfile company={company} />,
    credentials: <CompanyCredentials company={company} />,
    standards: <CompanyStandards company={company} />,
    documents: <CompanyDocuments company={company} />,
    roles: <CompanyRoles company={company} />,
    reports: <CompanyReports company={company} onRun={onRun} />,
    actions: <CompanyActions company={company} />,
    programme: <CompanyProgramme company={company} />,
    threads: <CompanyThreads company={company} newChatButton={newChatButton} />,
  };
  return TABS.filter((key) => visited.includes(key)).map((key) => (
    <div key={key} role="tabpanel" id={`company-panel-${key}`} aria-labelledby={`company-tab-${key}`} hidden={key !== tab}>
      {panels[key]}
    </div>
  ));
}







// -----------------------------------------------------------
// CompanyDetail (default export)
// -----------------------------------------------------------
//
// Owns the company query, the tab state (URL), the visited
// tabs, the dialogs and the "new chat" mutation.
//
// Used by:
//   - router.jsx — route /companies/:companyId
// -----------------------------------------------------------

export default function CompanyDetail({ authData }) {

  const t = useTranslations('PAGES.company');
  const label = useEnumLabel();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { companyId } = useParams();
  const [params, setView] = useViewParams();
  const tab = oneOf(params.get('tab'), TABS, 'profile');
  const [visited, setVisited] = useState([tab]);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!visited.includes(tab)) setVisited([...visited, tab]);


  const { data: company, isLoading, error, refetch } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => {
      const answer = (await api.get(`/api/companies/${companyId}`)).data;
      // null, a list or a proxy's text is a failed load (the
      // error state), not a company to draw — the frame below
      // would crash reading its fields
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('The company answer is not an object');
      return answer;
    },
  });


  const newChat = useMutation({
    mutationFn: async () => (await api.post('/api/chat/threads', { companyId })).data,
    onSuccess: (thread) => { toast.success(t('TOASTS.chatCreated')); navigate(`/chat/${thread.id}`); },
  });


  const back = { to: '/companies', label: t('back') };
  if (isLoading || error) {
    return (
      <PageLayout authData={authData} title={isLoading ? <Skeleton width={260} /> : t('TITLE')} back={back}>
        {error ? <ErrorState error={error} onRetry={refetch} title={t('loadError')} /> : <Skeleton variant="rounded" height={320} />}
      </PageLayout>
    );
  }


  const subtitle = [
    label('institutionType', company.institutionType),
    authData.role === 'admin' && company.ownerName ? t('owner', { name: company.ownerName }) : null,
    t('updated', { date: fmt.dateTime(company.updatedAt) }),
  ].filter(Boolean).join(' · ');
  const counts = {
    credentials: company.credentials?.length, standards: company.standards?.length, documents: company.documents?.length,
    roles: company.roles?.length,
  };
  const newChatButton = <Button variant="outlined" onClick={() => newChat.mutate()} loading={newChat.isPending}>{t('newChat')}</Button>;


  return (
    <PageLayout
      authData={authData} title={company.name} subtitle={subtitle} back={back}
      actions={<HeaderActions onRun={() => setRunning(true)} onNewChat={() => newChat.mutate()} onDelete={() => setDeleting(true)} chatBusy={newChat.isPending} />}
    >
      <Tabs
        value={tab} onChange={(_, next) => setView({ tab: next })} variant="scrollable" allowScrollButtonsMobile
        aria-label={t('TABS.label')} className="mb-4 border-b border-edge"
      >
        {TABS.map((key) => (
          <Tab key={key} value={key} id={`company-tab-${key}`} aria-controls={`company-panel-${key}`}
               label={counts[key] ? `${t(`TABS.${key}`)} (${counts[key]})` : t(`TABS.${key}`)} />
        ))}
      </Tabs>
      <TabPanels tab={tab} visited={visited} company={company} onRun={() => setRunning(true)} newChatButton={newChatButton} />
      <StartAnalysisDialog open={running} onClose={() => setRunning(false)} companyId={company.id} />
      <DeleteDialog open={deleting} company={company} onClose={() => setDeleting(false)} />
    </PageLayout>
  );
}
