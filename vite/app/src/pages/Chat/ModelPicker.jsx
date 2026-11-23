// -----------------------------------------------------------
//  [*] Chat — the conversation's model
//
//  The model button under the message field, on the right of
//  the AI notice (Composer.jsx). It names the model the
//  conversation answers with — the one its user picked, else
//  the default, the chat prompt's own — and opens a menu of
//  the gateway's chat models (GET /api/chat/models) upward,
//  each with its price per million tokens: a dearer model is
//  a deliberate choice, as the user's daily budget pays for
//  it. A pick is saved at once:
//
//    PATCH /api/chat/threads/{id}  {model}        — this model
//                                  {model: null}  — the default
//
//  Picking the default saves null, so the conversation
//  follows the default when an admin changes it. A new
//  conversation is created first, as the company link does
//  (ThreadLink.jsx), and Django's answer replaces the thread
//  row in the query cache; the next turn answers with the new
//  model, as the assistant reads it at every turn. A refusal
//  (a model no longer offered, the list unavailable) is the
//  api client's toast, and the saved model stays.
//
//  The button is quiet, as the notice beside it: the model's
//  name and a chevron, cut short when a phone has no room for
//  all of it — its accessible name and tooltip say it whole.
//
//  Split into (root component last):
//
//    MODELS_KEY  — the list's query key
//    modelLabel  — a model's readable name
//    PriceLine   — a model's price per million tokens
//    ModelPicker — the button and its menu (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAui, useAuiState } from '@assistant-ui/react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useThreadRow } from '@/pages/Chat/CompanyPanel';


// One list for every conversation; the assistant keeps the
// gateway's for ten minutes, the page as long
const MODELS_KEY = ['chat', 'models'];







// -----------------------------------------------------------
// modelLabel
// -----------------------------------------------------------
//
// A model's readable name: the gateway's name (or the last
// part of its id) with a GPT model written as its vendor
// does — "GPT-5.6 Luna" for "Gpt 5.6 Luna" or "gpt-5.6-luna".
// Any other name is shown as it is.
//
// Used by:
//   - ModelPicker (below) — the button and the menu
// -----------------------------------------------------------

function modelLabel(model) {
  const raw = String(model?.name || model?.id?.split('/').pop() || '').trim();
  const gpt = raw.match(/^gpt[\s-]*([\d.]+)[\s-]*(.*)$/i);
  if (!gpt) return raw;
  const rest = gpt[2].split(/[\s-]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  return rest ? `GPT-${gpt[1]} ${rest}` : `GPT-${gpt[1]}`;
}







// -----------------------------------------------------------
// PriceLine
// -----------------------------------------------------------
//
// What a model costs per million tokens, input and output,
// in the UI's money format; a model the gateway prices not
// says so.
//
// Used by:
//   - ModelPicker (below) — under each model in the menu
// -----------------------------------------------------------

function PriceLine({ pricing }) {
  const t = useTranslations('PAGES.chat.MODEL');
  const fmt = useFormat();
  const perMillion = (value) => fmt.usd(Number(value) * 1_000_000);
  const priced = pricing && Number.isFinite(Number(pricing.promptPerToken)) && Number.isFinite(Number(pricing.completionPerToken));
  return (
    <span className="text-xs text-muted">
      {priced ? t('price', { input: perMillion(pricing.promptPerToken), output: perMillion(pricing.completionPerToken) }) : t('noPrice')}
    </span>
  );
}







// -----------------------------------------------------------
// ModelPicker (default export)
// -----------------------------------------------------------
//
// The button (see the file header) and its menu, opening
// upward from the foot of the page: one radio item per chat
// model, the current one checked, the default marked. While a pick is saved the button shows it and
// waits. Without the list (still loading, or the gateway
// unreachable) the button names the saved or default model
// from its id and the menu says why it is empty.
//
// Used by:
//   - Composer.jsx — the row under the message field
// -----------------------------------------------------------

export default function ModelPicker() {

  const t = useTranslations('PAGES.chat.MODEL');
  const aui = useAui();
  const queryClient = useQueryClient();
  const menuId = useId();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const row = useThreadRow().data;
  const [anchor, setAnchor] = useState(null);
  const [pending, setPending] = useState(null);
  const list = useQuery({
    queryKey: MODELS_KEY,
    queryFn: async () => (await api.get('/api/chat/models')).data,
    staleTime: 10 * 60_000,
  });


  const models = Array.isArray(list.data?.models) ? list.data.models.filter((entry) => typeof entry?.id === 'string') : [];
  const defaultId = typeof list.data?.default === 'string' ? list.data.default : null;
  const savedId = typeof row?.model === 'string' && row.model ? row.model : null;
  const currentId = pending ?? savedId ?? defaultId;
  const current = models.find((entry) => entry.id === currentId) ?? (currentId ? { id: currentId } : null);
  const label = current ? modelLabel(current) : t('fallback');
  const name = current ? t('button', { model: label }) : label;


  // Creates a new conversation first, then PATCHes the row and
  // puts Django's answer in its cache — a read of the row
  // still under way is cancelled first, or it would bring the
  // old model back
  const pick = async (entry) => {
    setAnchor(null);
    if (entry.id === currentId) return;
    setPending(entry.id);
    try {
      const id = remoteId ?? (await aui.threadListItem().initialize()).remoteId;
      const { data } = await api.patch(`/api/chat/threads/${encodeURIComponent(id)}`, { model: entry.id === defaultId ? null : entry.id });
      const key = ['chat', 'thread', id];
      await queryClient.cancelQueries({ queryKey: key });
      if (data && typeof data === 'object' && data.id === id) queryClient.setQueryData(key, data);
      else await queryClient.invalidateQueries({ queryKey: key });
    } catch {
      // the api client's toast says why; the saved model stays
    } finally {
      setPending(null);
    }
  };


  return (
    <>
      <Button size="small" color="inherit" endIcon={<ExpandMoreIcon aria-hidden />} aria-label={name} title={name}
              onClick={(event) => setAnchor(event.currentTarget)} disabled={Boolean(pending)}
              aria-haspopup="menu" aria-expanded={Boolean(anchor)} aria-controls={anchor ? menuId : undefined}
              className="min-w-0 max-w-full text-xs font-medium text-muted hover:text-content">
        <span className="truncate">{label}</span>
      </Button>
      <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            slotProps={{ list: { 'aria-label': t('menu') } }}>
        {models.length === 0 && <MenuItem disabled>{list.isPending ? t('loading') : t('unavailable')}</MenuItem>}
        {models.map((entry) => (
          <MenuItem key={entry.id} role="menuitemradio" aria-checked={entry.id === currentId} selected={entry.id === currentId}
                    onClick={() => pick(entry)} className="flex items-start gap-2 max-w-[22rem]">
            <span className="w-5 pt-0.5 shrink-0">{entry.id === currentId && <CheckIcon fontSize="small" aria-hidden />}</span>
            <span className="flex flex-col min-w-0">
              <span className="font-semibold">
                {modelLabel(entry)}
                {/* The spaces sit between the spans: a name read from
                    content trims each span's own edges */}
                {entry.id === defaultId && <>{' '}<span className="font-normal text-muted">({t('default')})</span></>}
              </span>
              {' '}
              <PriceLine pricing={entry.pricing} />
            </span>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
