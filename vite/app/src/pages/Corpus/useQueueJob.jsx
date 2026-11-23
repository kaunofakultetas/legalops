// -----------------------------------------------------------
//  [*] useQueueJob — an admin action that queues a job
//
//  Refresh, re-embed, refresh-all, extract-obligations and
//  verify-obligations all answer 202 with the queued (or
//  already running) job. This hook wraps such a POST in a
//  mutation that toasts "queued" with a link to the jobs
//  page and refreshes the corpus and the jobs queries, so
//  every corpus page reacts the same way.
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// useQueueJob (default export)
// -----------------------------------------------------------
//
//   const queue = useQueueJob();
//   queue.mutate({ url: `/api/corpus/documents/${id}/refresh`, body: { force: true } })
//
// Used by:
//   - Corpus.jsx — refresh all / re-embed all
//   - CorpusCatalogue.jsx — per-act refresh / extract
//   - CorpusDocument.jsx — the act's admin actions
// -----------------------------------------------------------

export default function useQueueJob() {

  const t = useTranslations('COMPONENTS.common');
  const queryClient = useQueryClient();


  return useMutation({
    mutationFn: async ({ url, body = {} }) => (await api.post(url, body)).data,
    onSuccess: () => {
      toast.success(
        <span>{t('queuedJob')} · <Link to="/jobs" className="text-primary">{t('viewJob')}</Link></span>,
        { duration: 6000 },
      );
      queryClient.invalidateQueries({ queryKey: ['corpus'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
