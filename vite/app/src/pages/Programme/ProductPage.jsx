// -----------------------------------------------------------
//  [*] ProductPage — one work product of a compliance
//      programme
//
//  GET /api/programme/{id} (the product with its content and
//  the checks of its kind), polled every 3 s while the
//  generation is queued or running. A work product is the
//  compliance policy, the governance product (structure,
//  process, RACI matrix) or the legal risk register of one
//  company, in one version. The page has four faces:
//
//    - active    → the progress card with "stop" (POST
//                  …/cancel, confirmed)
//    - failed /
//      cancelled → what happened, and the way back to the
//                  company's programme tab, where a new
//                  version is generated
//    - draft     → the rules of the kind, kept or broken,
//                  above the content in its tabs; the header
//                  offers "edit", "approve" (off, with the
//                  reason, while a blocking rule is broken or
//                  edits are unsaved) and the exports
//    - approved  → who approved it and when, the content
//                  read-only, the exports, and "new version"
//                  (POST …/revise, then the new draft opens)
//
//  The tabs follow the kind (KIND_TABS) and end with the
//  provenance; the tab lives in ?tab=. Deleting a version
//  (confirmed) returns to the company's programme tab.
//
//  Editing. "Edit" turns the content of a draft into forms.
//  The edits stay in this page — a draft copy of the content
//  — until the person saves or discards them in the bar that
//  appears with the first change; leaving the page with
//  unsaved edits asks first (useUnsavedChanges). A save
//  sends the WHOLE content (PUT …/content); the answer is the
//  content as the server normalised it and the checks run
//  again, and it replaces both the cached product and the
//  draft copy — so what is on screen after a save is what
//  the server holds, with any rule the edit broke or mended.
//  The page never works out a level, a score or a band
//  itself.
//
//  Split into (root component last):
//
//    PROVENANCE_TAB — the tab every kind ends with
//    MoreMenu       — the header's menu: delete
//    EndedNotice    — the failed / cancelled card
//    ProductFacts   — the header's two lines of facts
//    ProductContent — the kind's view for the open tab
//    ProductView    — one product id: the query, the edits
//    ProductPage    — the page (default export)
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileCopyOutlinedIcon from '@mui/icons-material/FileCopyOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import toast from '@/utils/toast';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { oneOf } from '@/utils/viewParams';
import useEnumLabel from '@/hooks/useEnumLabel';
import useUnsavedChanges from '@/hooks/useUnsavedChanges';
import useViewParams from '@/hooks/useViewParams';
import PageLayout from '@/components/layout/PageLayout';
import ErrorState from '@/components/ErrorState/ErrorState';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog/UnsavedChangesDialog';
import { companyProgrammePath, productPath } from '@/paths';
import EditBar from '@/pages/Programme/EditBar';
import GovernancePositions from '@/pages/Programme/GovernancePositions';
import GovernanceRaci from '@/pages/Programme/GovernanceRaci';
import GovernanceStructure from '@/pages/Programme/GovernanceStructure';
import PolicyDocuments from '@/pages/Programme/PolicyDocuments';
import PolicyParts from '@/pages/Programme/PolicyParts';
import ProductApproval, { ApproveButton } from '@/pages/Programme/ProductApproval';
import ProductExports from '@/pages/Programme/ProductExports';
import ProductProgress from '@/pages/Programme/ProductProgress';
import ProductStatus from '@/pages/Programme/ProductStatus';
import Provenance from '@/pages/Programme/Provenance';
import RiskCriteria from '@/pages/Programme/RiskCriteria';
import RiskRegister from '@/pages/Programme/RiskRegister';
import RulesPanel from '@/pages/Programme/RulesPanel';
import { cancelProduct, fetchProduct, programmeKeys, removeProduct, reviseProduct, saveContent } from '@/pages/Programme/programmeApi';
import { KIND_TABS, brokenRules, isActive } from '@/pages/Programme/programmeUtils';
import useRefusal from '@/pages/Programme/useRefusal';


// The last tab of every kind (also its ?tab= value)
const PROVENANCE_TAB = 'provenance';







// -----------------------------------------------------------
// MoreMenu
// -----------------------------------------------------------
//
// The header's menu with the one rare action: deleting this
// version. It is off while the draft has unsaved edits —
// they are saved or discarded first.
//
// Used by:
//   - ProductView (below)
// -----------------------------------------------------------

function MoreMenu({ canDelete, onDelete }) {

  const t = useTranslations('PAGES.programme');
  const [anchor, setAnchor] = useState(null);


  return (
    <>
      <IconButton aria-label={t('more')} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled={!canDelete} onClick={() => { setAnchor(null); onDelete(); }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>{t('delete')}
        </MenuItem>
      </Menu>
    </>
  );
}







// -----------------------------------------------------------
// EndedNotice
// -----------------------------------------------------------
//
// A generation that failed or was cancelled: what happened,
// the backend's error folded under "technical details", and
// the way to the company's programme tab, where the kind is
// generated again. A failure is announced (role="alert"); a
// cancelled run is a state the user chose, so it is a
// status.
//
// Used by:
//   - ProductView (below)
// -----------------------------------------------------------

function EndedNotice({ product }) {

  const t = useTranslations('PAGES.programme.ENDED');
  const failed = product.status === 'failed';


  return (
    <Alert severity={failed ? 'error' : 'warning'} role={failed ? 'alert' : 'status'}>
      <AlertTitle>{failed ? t('failedTitle') : t('cancelledTitle')}</AlertTitle>
      {failed ? t('failedText') : t('cancelledText')}
      <div className="mt-2">
        <Button component={Link} to={companyProgrammePath(product.companyId)} color="inherit" size="small" variant="outlined">{t('again')}</Button>
      </div>
      {failed && product.error && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer">{t('details')}</summary>
          <pre className="whitespace-pre-wrap m-0 mt-1">{String(product.error)}</pre>
        </details>
      )}
    </Alert>
  );
}







// -----------------------------------------------------------
// ProductFacts
// -----------------------------------------------------------
//
// The two lines under the title: the status as a chip, the
// kind — unless the title already is the kind's name, as it
// is until a generation gives the product a title of its own
// — the company, a link to its programme tab, and the
// version; then the product's language, when it was
// generated (or started, while it is not finished) and who
// last edited it.
//
// Used by:
//   - ProductView (below)
// -----------------------------------------------------------

function ProductFacts({ product }) {

  const t = useTranslations('PAGES.programme');
  const label = useEnumLabel();
  const fmt = useFormat();
  const kind = label('productKind', product.kind);
  const edited = product.editedAt
    ? (product.editedByName ? t('edited', { name: product.editedByName, date: fmt.dateTime(product.editedAt) }) : t('editedAt', { date: fmt.dateTime(product.editedAt) }))
    : null;
  const facts = [
    t('language', { language: label('language', product.language) }),
    product.finishedAt ? t('finished', { date: fmt.dateTime(product.finishedAt) }) : t('started', { date: fmt.dateTime(product.createdAt) }),
    edited,
  ].filter(Boolean).join(' · ');


  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        <ProductStatus status={product.status} />
        {kind !== product.title && <><span>{kind}</span><span aria-hidden>·</span></>}
        <Link to={companyProgrammePath(product.companyId)} className="text-primary">{product.companyName}</Link>
        <span aria-hidden>·</span>
        <span>{t('version', { version: product.version })}</span>
      </span>
      <span>{facts}</span>
    </span>
  );
}







// -----------------------------------------------------------
// ProductContent
// -----------------------------------------------------------
//
// The view of the open tab: the kind's own tabs, or the
// provenance. `content` is what is shown — the draft copy
// while there are edits — and `product.content` what the
// server last answered.
//
// Used by:
//   - ProductView (below)
// -----------------------------------------------------------

function ProductContent({ product, content, tab, editing, change }) {
  const shared = { content, editing, change };
  if (tab === PROVENANCE_TAB) return <Provenance product={product} />;
  if (tab === 'policy') return <PolicyParts {...shared} />;
  if (tab === 'documents') return <PolicyDocuments {...shared} />;
  if (tab === 'structure') return <GovernanceStructure product={product} {...shared} />;
  if (tab === 'raci') return <GovernanceRaci {...shared} />;
  if (tab === 'positions') return <GovernancePositions content={content} />;
  if (tab === 'register') return <RiskRegister saved={product.content} documents={product.basis?.documents} {...shared} />;
  if (tab === 'criteria') return <RiskCriteria {...shared} />;
  return null;
}







// -----------------------------------------------------------
// ProductView
// -----------------------------------------------------------
//
// The page of one product id. It owns the product query —
// polling while the generation is on its way — the draft
// copy of the content, the edit mode, the save and the
// other writes (stop, delete, new version) with their
// dialogs. The frame is the same element while the product
// loads and once it is there, so the bars around the page
// are not built twice. When a generation ends, the company's
// list is read again: its row changed too.
//
// Used by:
//   - ProductPage (below) — mounted per product id
// -----------------------------------------------------------

function ProductView({ productId, authData }) {

  const t = useTranslations('PAGES.programme');
  const label = useEnumLabel();
  const refusal = useRefusal();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setView] = useViewParams();
  const [editing, setEditing] = useState(false);
  // The content as the person is editing it; null while
  // nothing was changed since the server's last answer
  const [draft, setDraft] = useState(null);
  const [dialog, setDialog] = useState(null);


  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: programmeKeys.product(productId),
    queryFn: () => fetchProduct(productId),
    refetchInterval: (query) => (isActive(query.state.data) ? 3000 : false),
  });
  const { status, companyId, jobId } = product ?? {};


  // A run that ended changes the company's list as well
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current && status && previous.current !== status) queryClient.invalidateQueries({ queryKey: programmeKeys.company(companyId) });
    previous.current = status;
  }, [status, companyId, queryClient]);


  const stored = product?.content;
  const saved = useMemo(() => (stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}), [stored]);
  const content = draft ?? saved;
  const dirty = useMemo(() => draft !== null && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const change = useCallback((update) => setDraft((current) => update(current ?? saved)), [saved]);
  const blocker = useUnsavedChanges(dirty);


  const refreshList = () => queryClient.invalidateQueries({ queryKey: programmeKeys.company(companyId) });
  const save = useMutation({
    mutationFn: () => saveContent(productId, draft),
    onSuccess: (answer) => {
      queryClient.setQueryData(programmeKeys.product(productId), answer);
      refreshList();
      setDraft(null);
      toast.success(t('saved'));
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelProduct(productId),
    onSuccess: (updated) => {
      toast.success(t('cancelled'));
      queryClient.setQueryData(programmeKeys.product(productId), (current) => ({ ...current, ...updated }));
      queryClient.invalidateQueries({ queryKey: ['jobs', updated?.jobId ?? jobId] });
      refreshList();
      setDialog(null);
    },
  });
  const remove = useMutation({
    mutationFn: () => removeProduct(productId),
    onSuccess: () => {
      toast.success(t('deleted'));
      refreshList();
      navigate(companyProgrammePath(companyId), { replace: true });
    },
  });
  const revise = useMutation({
    mutationFn: () => reviseProduct(productId),
    onSuccess: (next) => {
      toast.success(t('revised'));
      refreshList();
      navigate(productPath(next.id));
    },
    onError: (failure) => toast.error(refusal(failure)),
  });


  if (isLoading || error || !product) {
    return (
      <PageLayout authData={authData} title={error ? t('TITLE') : <Skeleton width={320} />}>
        {error ? <ErrorState error={error} onRetry={refetch} title={t('loadError')} /> : <Skeleton variant="rounded" height={320} />}
      </PageLayout>
    );
  }


  const active = isActive(product);
  const isDraft = status === 'draft';
  const shown = isDraft || status === 'approved';
  const inEdit = isDraft && editing;
  const tabs = [...(KIND_TABS[product.kind] ?? []), PROVENANCE_TAB];
  const tab = oneOf(params.get('tab'), tabs, tabs[0]);
  const { blocking } = brokenRules(product.checks);
  // Why the draft cannot be approved right now, if it cannot
  const blocked = dirty ? t('APPROVAL.unsavedFirst') : (blocking.length ? t('APPROVAL.blocked') : null);
  const stopButton = (
    <Button color="delete" variant="outlined" startIcon={<StopCircleOutlinedIcon />} onClick={() => { cancel.reset(); setDialog('cancel'); }}>{t('cancel')}</Button>
  );
  const actions = (
    <>
      {isDraft && (
        <Button variant="outlined" startIcon={<EditOutlinedIcon />} aria-pressed={editing} onClick={() => setEditing((on) => !on)}>
          {editing ? t('editDone') : t('edit')}
        </Button>
      )}
      {isDraft && <ApproveButton product={product} blocked={blocked} />}
      {status === 'approved' && (
        <Button variant="contained" startIcon={<FileCopyOutlinedIcon />} loading={revise.isPending} onClick={() => revise.mutate()}>{t('revise')}</Button>
      )}
      {shown && <ProductExports product={product} />}
      {!active && <MoreMenu canDelete={!dirty} onDelete={() => { remove.reset(); setDialog('delete'); }} />}
    </>
  );


  return (
    <PageLayout authData={authData} title={product.title || label('productKind', product.kind)} subtitle={<ProductFacts product={product} />}
                back={{ to: companyProgrammePath(companyId), label: t('back') }} actions={actions}>
      {active && <ProductProgress product={product} action={stopButton} />}
      {['failed', 'cancelled'].includes(status) && <EndedNotice product={product} />}
      {shown && (
        <>
          <ProductApproval product={product} />
          {isDraft && <RulesPanel checks={product.checks} stale={dirty} />}
          {inEdit && (
            <TextField label={t('titleField')} value={String(content.title ?? '')} fullWidth className="mb-4 max-w-3xl bg-surface"
                       onChange={(event) => change((current) => ({ ...current, title: event.target.value }))} />
          )}
          <Tabs value={tab} onChange={(_, next) => setView({ tab: next })} variant="scrollable" allowScrollButtonsMobile
                aria-label={t('TABS.label')} className="mb-4 border-b border-edge">
            {tabs.map((key) => (
              <Tab key={key} value={key} id={`product-tab-${key}`} aria-controls={`product-panel-${key}`} label={t(`TABS.${key}`)} />
            ))}
          </Tabs>
          <div role="tabpanel" id={`product-panel-${tab}`} aria-labelledby={`product-tab-${tab}`}>
            {status === 'approved' && tab !== PROVENANCE_TAB && <Typography variant="body2" color="text.secondary" className="mb-3">{t('readOnly')}</Typography>}
            <ProductContent product={product} content={content} tab={tab} editing={inEdit} change={change} />
          </div>
          {dirty && <EditBar busy={save.isPending} error={save.error ? refusal(save.error) : null} onDiscard={() => { setDraft(null); save.reset(); }} onSave={() => save.mutate()} />}
        </>
      )}

      <UniversalModal open={dialog === 'cancel'} onClose={() => setDialog(null)} onConfirm={() => cancel.mutate()} busy={cancel.isPending} danger
                      error={cancel.error ? refusal(cancel.error) : null} title={t('cancelTitle')} confirmLabel={t('cancelConfirm')}>
        <Typography>{t('cancelText')}</Typography>
      </UniversalModal>
      <UniversalModal open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={() => remove.mutate()} busy={remove.isPending} danger
                      error={remove.error ? refusal(remove.error) : null} title={t('deleteTitle')} confirmLabel={t('delete')}>
        <Typography>{t('deleteText')}</Typography>
      </UniversalModal>
      <UnsavedChangesDialog blocker={blocker} />
    </PageLayout>
  );
}







// -----------------------------------------------------------
// ProductPage (default export)
// -----------------------------------------------------------
//
// The route's page: one ProductView per product id. The id
// is its key, so the edits and the open dialogs of one
// product never carry over to another when a link — a new
// draft after "new version", an earlier product in the
// provenance — leads from product to product.
//
// Used by:
//   - router.jsx — route /programme/:productId
// -----------------------------------------------------------

export default function ProductPage({ authData }) {
  const { productId } = useParams();
  return <ProductView key={productId} productId={productId} authData={authData} />;
}
