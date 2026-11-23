// -----------------------------------------------------------
//  [*] PromptEditor — edit, compare, test and activate a prompt
//
//  GET /api/prompts/{slug} (the prompt with every version's
//  text). The editor holds a draft started from a stored
//  version (the active one by default); saving appends a new
//  immutable version (POST …/versions, optionally activated
//  at once). Beside it, tabs: the version history (activate,
//  load, compare), a line diff of any two versions or the
//  draft, and the test panel (one model run of the draft or
//  a version). A newer shipped default that waits beside an
//  administrator's active version is announced on top with
//  "compare" and "activate" — as a status, not an alert: it
//  describes the prompt's state, only a failed activation is
//  urgent. Unsaved draft changes are guarded against
//  navigation. The tab lives in ?tab=, the diff's two sides
//  in ?diff.left= / ?diff.right= ("draft" or a version
//  number; one the prompt does not have reads as the
//  default), so Back and a shared link find the same
//  comparison; the back link returns to the list the way
//  Back would (PageLayout).
//
//  The editor is keyed by the slug: a history jump from one
//  prompt straight to another keeps the route element
//  mounted, and a draft must never outlive its prompt (it
//  would be offered as the other prompt's next version).
//  Loading another version into a DIRTY draft (the base
//  select, "Edit from this one") asks first — the unsaved
//  changes would be gone without a trace.
//
//  Split into (root component last):
//
//    TABS             — the side tabs, in order
//    PendingNotice    — the waiting shipped default
//    ReplaceDraft     — "discard the changes and load vN?"
//    PromptEditorPage — one prompt's editor
//    PromptEditor     — the page (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import useUnsavedChanges from '@/hooks/useUnsavedChanges';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import ErrorState from '@/components/ErrorState/ErrorState';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog/UnsavedChangesDialog';
import PromptDiff from '@/pages/Prompts/PromptDiff';
import PromptEditorForm from '@/pages/Prompts/PromptEditorForm';
import PromptTestPanel from '@/pages/Prompts/PromptTestPanel';
import PromptVersions from '@/pages/Prompts/PromptVersions';
import { draftFrom, isDirty, readPrompt, validateDraft } from '@/pages/Prompts/promptDraft';
import usePromptText from '@/pages/Prompts/usePromptText';


// The side tabs (also the ?tab= values)
const TABS = ['versions', 'diff', 'test'];







// -----------------------------------------------------------
// PendingNotice
// -----------------------------------------------------------
//
// prompt.pendingDefault — a shipped default newer than the
// active administrator version — with compare / activate.
// The notice is role="status" (MUI's Alert defaults to an
// urgent role="alert"); a failed activation gets its own
// error alert under it.
//
// Used by:
//   - PromptEditorPage (below)
// -----------------------------------------------------------

function PendingNotice({ prompt, onCompare }) {

  const t = useTranslations('PAGES.promptEditor.PENDING');
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const version = prompt.pendingDefault;


  const activate = useMutation({
    mutationFn: () => api.post(`/api/prompts/${prompt.slug}/versions/${version}/activate`, null, { silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt', prompt.slug] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });


  if (!version) return null;
  return (
    <>
      <Alert severity="warning" role="status" className="mb-4" action={(
        <div className="flex gap-1 flex-wrap">
          <Button color="inherit" size="small" onClick={onCompare}>{t('compare')}</Button>
          <Button color="inherit" size="small" onClick={() => activate.mutate()} loading={activate.isPending}>{t('activate', { version })}</Button>
        </div>
      )}>
        <AlertTitle>{t('title', { version })}</AlertTitle>
        {t('text')}
      </Alert>
      {activate.error && <Alert severity="error" className="mb-4">{describe(activate.error)}</Alert>}
    </>
  );
}







// -----------------------------------------------------------
// ReplaceDraft
// -----------------------------------------------------------
//
// The confirmation before another version replaces a dirty
// draft. `version` outlives `open`, so the dialog keeps its
// text while it fades out.
//
// Used by:
//   - PromptEditorPage (below)
// -----------------------------------------------------------

function ReplaceDraft({ open, version, onCancel, onConfirm }) {
  const t = useTranslations('PAGES.promptEditor.REPLACE');
  return (
    <UniversalModal open={open} onClose={onCancel} onConfirm={onConfirm} title={t('title')}
                    confirmLabel={t('confirm', { version })} cancelLabel={t('cancel')} danger>
      <Typography>{t('text', { version })}</Typography>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// PromptEditorPage
// -----------------------------------------------------------
//
// One prompt's editor: owns the prompt query, the draft and
// its base version, the diff sides (the address's, else the
// version the draft started from against the draft), the
// save mutation and the leave guard. Only a prompt that never
// loaded shows the error state in place of the editor; a
// failed refetch (the one after a save, a window-focus one)
// keeps the editor and its draft on screen with the error
// above them.
//
// Used by:
//   - PromptEditor (below) — keyed by the slug
// -----------------------------------------------------------

function PromptEditorPage({ authData, slug }) {

  const t = useTranslations('PAGES.promptEditor');
  const label = useEnumLabel();
  const text = usePromptText();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const [params, setView] = useViewParams();
  const tab = oneOf(params.get('tab'), TABS, 'versions');
  const [baseNo, setBaseNo] = useState(null);
  const [draft, setDraft] = useState(null);
  // The diff's left side when the address names none: the
  // version the first draft started from
  const [startSide, setStartSide] = useState('draft');
  const [tried, setTried] = useState(false);
  const [replacing, setReplacing] = useState({ open: false, version: null });


  const { data: prompt, isLoading, error, refetch } = useQuery({
    queryKey: ['prompt', slug],
    queryFn: async () => readPrompt((await api.get(`/api/prompts/${slug}`)).data),
  });


  // The first load starts the draft from the active version
  // (or the newest when none is active)
  const versions = prompt?.versions || [];
  if (prompt && draft === null) {
    const start = versions.find((v) => v.version === prompt.activeVersion) || versions[0];
    setBaseNo(start?.version ?? null);
    setDraft(draftFrom(start));
    setStartSide(String(start?.version ?? 'draft'));
  }
  const sideValues = ['draft', ...versions.map((v) => String(v.version))];
  const sides = {
    left: oneOf(params.get('diff.left'), sideValues, oneOf(startSide, sideValues, 'draft')),
    right: oneOf(params.get('diff.right'), sideValues, 'draft'),
  };
  const setSides = (next) => setView({
    'diff.left': next.left === startSide ? null : next.left,
    'diff.right': next.right === 'draft' ? null : next.right,
  });
  const base = versions.find((v) => v.version === baseNo);
  const dirty = Boolean(draft && isDirty(draft, base));
  const errors = draft ? validateDraft(draft, (key, p) => t(`EDITOR.${key}`, p)) : {};
  const blocker = useUnsavedChanges(dirty);


  const save = useMutation({
    mutationFn: async () => {
      const body = { text: draft.text, model: draft.model.trim(), note: draft.note.trim(), activate: draft.activate };
      if (draft.temperature.trim()) body.temperature = Number(draft.temperature.replace(',', '.'));
      if (draft.maxTokens.trim()) body.maxTokens = Number(draft.maxTokens);
      return (await api.post(`/api/prompts/${slug}/versions`, body, { silent: true })).data;
    },
    onSuccess: async (version) => {
      toast.success(draft.activate ? t('EDITOR.savedActive', { version: version.version }) : t('EDITOR.saved', { version: version.version }));
      await queryClient.invalidateQueries({ queryKey: ['prompt', slug] });
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setBaseNo(version.version);
      setDraft(draftFrom(version));
      setTried(false);
    },
  });


  const showTab = (next) => setView({ tab: next });
  const replaceDraft = (number) => {
    const version = versions.find((v) => v.version === number);
    setBaseNo(number);
    setDraft(draftFrom(version));
    toast.success(t('TOASTS.loaded', { version: number }));
  };
  // A dirty draft is replaced only after the confirmation
  const loadBase = (number) => (dirty ? setReplacing({ open: true, version: number }) : replaceDraft(number));
  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };
  const compareWithActive = (number) => {
    const left = String(prompt.activeVersion);
    const right = String(number);
    setView({ tab: 'diff', 'diff.left': left === startSide ? null : left, 'diff.right': right === 'draft' ? null : right });
  };


  const back = { to: '/prompts', label: t('back') };
  if (!prompt || !draft) {
    return (
      <PageLayout authData={authData} title={isLoading ? <Skeleton width={260} /> : t('TITLE')} back={back}>
        {error ? <ErrorState error={error} onRetry={refetch} title={t('loadError')} /> : <Skeleton variant="rounded" height={420} />}
      </PageLayout>
    );
  }


  const subtitle = (
    <span className="flex flex-col gap-1">
      <span><code>{prompt.slug}</code> · {label('promptKind', prompt.kind)} · {prompt.activeVersion
        ? t('active', { version: prompt.activeVersion, model: prompt.activeModel })
        : t('noActive')}</span>
      {prompt.description && <span>{text.description(prompt)}</span>}
    </span>
  );


  return (
    <PageLayout authData={authData} title={text.name(prompt)} subtitle={subtitle} back={back}>
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} className="mb-4" />}
      <PendingNotice prompt={prompt} onCompare={() => compareWithActive(prompt.pendingDefault)} />
      {save.error && <Alert severity="error" className="mb-4">{describe(save.error)}</Alert>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <PromptEditorForm prompt={prompt} draft={draft} setDraft={setDraft} errors={tried ? errors : {}} baseNo={baseNo}
                          onLoadBase={loadBase} onSave={submit} saving={save.isPending} dirty={dirty} />
        <div className="min-w-0">
          <Tabs value={tab} onChange={(_, next) => showTab(next)} aria-label={t('TABS.label')} className="mb-3 border-b border-edge"
                variant="scrollable" allowScrollButtonsMobile>
            {TABS.map((key) => <Tab key={key} value={key} label={t(`TABS.${key}`)} id={`prompt-tab-${key}`} aria-controls={`prompt-panel-${key}`} />)}
          </Tabs>
          <div role="tabpanel" id={`prompt-panel-${tab}`} aria-labelledby={`prompt-tab-${tab}`}>
            {tab === 'versions' && <PromptVersions prompt={prompt} onEdit={loadBase} onCompare={compareWithActive} />}
            {tab === 'diff' && (
              <PromptDiff prompt={prompt} draft={draft} left={sides.left} right={sides.right}
                          onLeft={(left) => setSides({ ...sides, left })} onRight={(right) => setSides({ ...sides, right })} />
            )}
            {tab === 'test' && <PromptTestPanel prompt={prompt} draft={draft} draftErrors={errors} />}
          </div>
        </div>
      </div>
      <UnsavedChangesDialog blocker={blocker} />
      <ReplaceDraft open={replacing.open} version={replacing.version}
                    onCancel={() => setReplacing({ ...replacing, open: false })}
                    onConfirm={() => { setReplacing({ ...replacing, open: false }); replaceDraft(replacing.version); }} />
    </PageLayout>
  );
}







// -----------------------------------------------------------
// PromptEditor (default export)
// -----------------------------------------------------------
//
// The route's element: one PromptEditorPage per slug, so a
// new :slug starts a fresh draft, base and diff instead of
// carrying the previous prompt's.
//
// Used by:
//   - router.jsx — route /prompts/:slug (adminOnly)
// -----------------------------------------------------------

export default function PromptEditor({ authData }) {
  const { slug } = useParams();
  return <PromptEditorPage key={slug} authData={authData} slug={slug} />;
}
