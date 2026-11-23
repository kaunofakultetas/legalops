// -----------------------------------------------------------
//  [*] PromptVersions — a prompt's version history
//
//  Newest first: number, source (shipped default or an
//  administrator's), model and settings, the change note and
//  the date; the active one is marked. Per version: activate
//  (POST …/versions/{n}/activate, confirmed), load it into
//  the editor, or compare it with the active version. Rows
//  are keyed by the version number (unique per prompt —
//  readPrompt keeps each once).
// -----------------------------------------------------------

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';







// -----------------------------------------------------------
// PromptVersions (default export)
// -----------------------------------------------------------
//
//   <PromptVersions prompt={…} onEdit={(n) => …} onCompare={(n) => …} />
//
// Used by:
//   - PromptEditor.jsx — the versions tab
// -----------------------------------------------------------

export default function PromptVersions({ prompt, onEdit, onCompare }) {

  const t = useTranslations('PAGES.promptEditor.VERSIONS');
  const label = useEnumLabel();
  const fmt = useFormat();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  // The confirmation: open, and the version it is about — the
  // number outlives the close so the fading dialog keeps its
  // title ("Activate vnull?" would flash otherwise)
  const [confirm, setConfirm] = useState({ open: false, version: null });
  const close = () => setConfirm((current) => ({ ...current, open: false }));


  const activate = useMutation({
    mutationFn: (version) => api.post(`/api/prompts/${prompt.slug}/versions/${version}/activate`, null, { silent: true }),
    onSuccess: (_, version) => {
      toast.success(t('activated', { version }));
      queryClient.invalidateQueries({ queryKey: ['prompt', prompt.slug] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      close();
    },
  });


  return (
    <>
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {(prompt.versions || []).map((v) => {
          const active = v.version === prompt.activeVersion;
          return (
            <Paper component="li" key={v.version} variant="outlined" className={`p-3 flex flex-col gap-1 ${active ? 'border-primary' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Typography variant="subtitle2" component="h3">v{v.version}</Typography>
                {active && <Chip size="small" color="primary" label={t('active')} />}
                <StatusChip kind="source" value={v.source} label={label('promptSource', v.source)} />
                <span className="text-xs text-muted">{t('createdAt', { date: fmt.dateTime(v.createdAt) })}</span>
              </div>
              <Typography variant="body2" className="font-mono text-xs">
                {v.model} · {t('settings', { temperature: v.temperature ?? '—', maxTokens: v.maxTokens ?? '—' })}
              </Typography>
              {v.note && <Typography variant="body2" color="text.secondary">{v.note}</Typography>}
              <div className="flex gap-1 flex-wrap">
                {!active && <Button size="small" onClick={() => { activate.reset(); setConfirm({ open: true, version: v.version }); }}>{t('activate')}</Button>}
                <Button size="small" onClick={() => onEdit(v.version)}>{t('edit')}</Button>
                {!active && prompt.activeVersion && <Button size="small" onClick={() => onCompare(v.version)}>{t('compare')}</Button>}
              </div>
            </Paper>
          );
        })}
      </ol>
      <UniversalModal open={confirm.open} onClose={close} onConfirm={() => activate.mutate(confirm.version)} busy={activate.isPending}
                      error={activate.error ? describe(activate.error) : null} title={t('activateTitle', { version: confirm.version })} confirmLabel={t('activate')}>
        <Typography>{t('activateText')}</Typography>
      </UniversalModal>
    </>
  );
}
