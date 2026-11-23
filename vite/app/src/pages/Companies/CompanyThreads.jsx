// -----------------------------------------------------------
//  [*] CompanyThreads — the caller's chats about the company
//
//  GET /api/chat/threads?companyId= lists the caller's own
//  threads of this company (admins included — a transcript
//  is personal), each a link into the chat; a bar shows
//  while they load. The "new chat about the company" button
//  is the page's (CompanyDetail): it creates a thread
//  already linked (POST /api/chat/threads {companyId}) and
//  opens it.
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import LinearProgress from '@mui/material/LinearProgress';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import SectionCard from '@/components/SectionCard/SectionCard';
import EmptyState from '@/components/EmptyState/EmptyState';
import ErrorState from '@/components/ErrorState/ErrorState';
import usableRows from '@/pages/Companies/usableRows';







// -----------------------------------------------------------
// CompanyThreads (default export)
// -----------------------------------------------------------
//
//   <CompanyThreads company={…} newChatButton={<Button …/>} />
//
// Used by:
//   - CompanyDetail.jsx — the chats tab
// -----------------------------------------------------------

export default function CompanyThreads({ company, newChatButton }) {

  const t = useTranslations('PAGES.company.THREADS');
  const fmt = useFormat();


  const { data: threads = [], isLoading, error, refetch } = useQuery({
    queryKey: ['chatThreads', company.id],
    queryFn: async () => (await api.get(`/api/chat/threads?companyId=${encodeURIComponent(company.id)}`)).data.threads,
    // Only threads that can be keyed and linked
    select: usableRows,
  });


  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')} actions={newChatButton}>
      {isLoading && <LinearProgress aria-label={t('title')} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!error && !isLoading && threads.length === 0 && <EmptyState icon={ForumOutlinedIcon} title={t('empty')} />}
      {threads.length > 0 && (
        <ul className="m-0 p-0 list-none divide-y divide-edge">
          {threads.map((thread) => (
            <li key={thread.id} className="py-2 flex items-center justify-between gap-2 flex-wrap">
              <Link to={`/chat/${thread.id}`} className="text-primary">{thread.title || t('untitled')}</Link>
              <span className="text-sm text-muted">{t('updated', { date: fmt.dateTime(thread.updatedAt || thread.createdAt) })}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
