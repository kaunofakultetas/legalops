// -----------------------------------------------------------
//  [*] CorpusDocument — one legal act
//
//  GET /api/corpus/documents/{id} (metadata + versions +
//  latest job), polled every 3 s while that job runs. Tabs
//  in ?tab=: the structure (provision tree + unit viewer; the
//  viewer follows ?unit=, which is also how report citations
//  deep-link here), the versions, the act's obligations and
//  the catalogue details. On phones the unit viewer opens as
//  a drawer over the tree.
//
//  The details end with what the models read from the act's
//  own text, beside what the catalogue says of it: whom the
//  act covers (the kinds of institution, or that its scope
//  provisions name none) and how many sanction tiers it lays
//  down — each with the note the model left for a reader, in
//  English as the model writes it, or "not read yet".
//
//  Coming back finds the act as it was left: the tab, the
//  unit, the tree's filter and search (?structure.type=,
//  ?structure.q=), the versions table's and the obligations
//  tab's filters and page (?obligations.status=…) all live
//  in the address; the tree's collapsed units and, beside the
//  viewer, its scroll position are kept for the act
//  (sessionStorage, useKeptScroll). The back link and the
//  delete return to the catalogue the way Back would
//  (useReturnTo).
//
//  Admins get the write side: refresh from the source (or
//  re-process an unchanged text), upload a new version (with
//  progress; a file over the backend's 60 MB is refused as
//  it is chosen), extract obligations (confirmed, with the
//  language), have the obligations checked (confirmed),
//  re-embed (confirmed), edit the metadata, enable / disable
//  and delete (confirmed). A standard can also be
//  re-processed with its structure read another way — by the
//  clause rules, the AI model or its pages — when the
//  automatic choice did not suit the copy. Users read. A
//  refused extraction or re-embed shows inside its
//  confirmation (the page behind a dialog is hidden from
//  assistive tech).
//
//  While the act's obligations are being extracted — the job
//  waiting or running — the obligations tab says so where its
//  empty list would be, with the job's progress, and the list
//  fills in by itself when the job ends.
//
//  The check of the obligations (POST …/verify-obligations)
//  queues the judge: a second model that compares every
//  obligation with the provisions it cites and decides
//  nothing. It takes the obligations not judged yet; once
//  none is left (GET /api/obligations?document=&verification=
//  unchecked, its total) the menu offers to check them all
//  again ({again: true}). The judge's job is not the act's
//  latestJob — that one is the ingest or the extraction — so
//  an admin's page asks the jobs for it by its subject
//  (GET /api/jobs?subject=verification:<id>&limit=1), follows
//  it every 3 s while it waits or runs and shows it the way
//  it shows the latest job; when it ends the obligations are
//  read again and their verdicts appear.
//
//  The notes that only describe the act's state (disabled,
//  a standard indexed by its pages, a job running) are
//  role="status"; only
//  failures (the last ingestion error, a failed job, a
//  refused action) are alerts. An answer that is not an act
//  at all is treated as a failed load.
//
//  Split into (root component last):
//
//    TABS            — the tab keys, in order
//    AdminActions    — the refresh button and the menu
//    ActionDialogs   — extract / re-embed / structure / delete /
//                      upload
//    LatestJob       — the act's latest job, live
//    Reading         — one thing a model read, with its note
//    ActInfo         — the catalogue details
//    StructurePanel  — tree + viewer, responsive
//    CorpusDocument  — the page (default export)
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import ScatterPlotOutlinedIcon from '@mui/icons-material/ScatterPlotOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useEnumLabel from '@/hooks/useEnumLabel';
import useJobText from '@/hooks/useJobText';
import useKeptScroll from '@/hooks/useKeptScroll';
import useReturnTo from '@/hooks/useReturnTo';
import useViewParams from '@/hooks/useViewParams';
import { oneOf } from '@/utils/viewParams';
import PageLayout from '@/components/layout/PageLayout';
import ErrorState from '@/components/ErrorState/ErrorState';
import FileDrop from '@/components/FileDrop/FileDrop';
import SectionCard from '@/components/SectionCard/SectionCard';
import StatusChip from '@/components/StatusChip/StatusChip';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import ObligationsPanel from '@/pages/Obligations/ObligationsPanel';
import ActMetadataDialog from '@/pages/Corpus/ActMetadataDialog';
import ActVersions from '@/pages/Corpus/ActVersions';
import ProvisionTree from '@/pages/Corpus/ProvisionTree';
import UnitViewer from '@/pages/Corpus/UnitViewer';
import useQueueJob from '@/pages/Corpus/useQueueJob';
import { ACT_ACCEPT, MAX_ACT_BYTES } from '@/constants/uploads';
import { STRUCTURE_METHODS, STRUCTURE_PARSERS } from '@/constants/enums';


// The tabs, in display order (also the ?tab= values)
const TABS = ['structure', 'versions', 'obligations', 'info'];

// What a version read by its pages records as its parser
const BY_PAGES = 'standard-pages';







// -----------------------------------------------------------
// AdminActions
// -----------------------------------------------------------
//
// "Refresh from the source" plus a menu of the rest; each
// menu entry opens its dialog (or acts at once: force
// refresh, enable/disable). Only a standard offers another
// way to read its structure. The check of the obligations
// sits under their extraction; with `checkAgain` (every
// obligation is judged already) it offers to check them all
// again, and an act without obligations has nothing to check.
//
// Used by:
//   - CorpusDocument (below)
// -----------------------------------------------------------

function AdminActions({ act, checkAgain, onDialog, onQueue, onToggleEnabled }) {

  const t = useTranslations('PAGES.corpusDocument.ACTIONS');
  const [anchor, setAnchor] = useState(null);
  const pick = (fn) => () => { setAnchor(null); fn(); };
  const canRefresh = act.sourceKind !== 'upload' || Boolean(act.currentVersion);


  return (
    <>
      <Button variant="outlined" startIcon={<SyncOutlinedIcon />} disabled={!canRefresh}
              onClick={() => onQueue(`/api/corpus/documents/${encodeURIComponent(act.id)}/refresh`, {})}>{t('refresh')}</Button>
      <IconButton aria-label={t('more')} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled={!canRefresh} onClick={pick(() => onQueue(`/api/corpus/documents/${encodeURIComponent(act.id)}/refresh`, { force: true }))}>
          <ListItemIcon><RestartAltOutlinedIcon fontSize="small" /></ListItemIcon>{t('refreshForce')}
        </MenuItem>
        {act.docType === 'standard' && (
          <MenuItem disabled={!act.currentVersion} onClick={pick(() => onDialog('structure'))}>
            <ListItemIcon><AccountTreeOutlinedIcon fontSize="small" /></ListItemIcon>{t('structure')}
          </MenuItem>
        )}
        <MenuItem onClick={pick(() => onDialog('upload'))}>
          <ListItemIcon><UploadFileOutlinedIcon fontSize="small" /></ListItemIcon>{t('upload')}
        </MenuItem>
        <MenuItem disabled={!act.currentVersion} onClick={pick(() => onDialog('extract'))}>
          <ListItemIcon><FactCheckOutlinedIcon fontSize="small" /></ListItemIcon>{t('extract')}
        </MenuItem>
        <MenuItem disabled={!act.currentVersion || !act.obligationCount} onClick={pick(() => onDialog('verify'))}>
          <ListItemIcon><RuleOutlinedIcon fontSize="small" /></ListItemIcon>{checkAgain ? t('verifyAgain') : t('verify')}
        </MenuItem>
        <MenuItem disabled={!act.currentVersion} onClick={pick(() => onDialog('reembed'))}>
          <ListItemIcon><ScatterPlotOutlinedIcon fontSize="small" /></ListItemIcon>{t('reembed')}
        </MenuItem>
        <MenuItem onClick={pick(() => onDialog('edit'))}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>{t('edit')}
        </MenuItem>
        <MenuItem onClick={pick(onToggleEnabled)}>
          <ListItemIcon>{act.enabled ? <ToggleOffOutlinedIcon fontSize="small" /> : <ToggleOnOutlinedIcon fontSize="small" />}</ListItemIcon>
          {act.enabled ? t('disable') : t('enable')}
        </MenuItem>
        <MenuItem onClick={pick(() => onDialog('delete'))}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>{t('delete')}
        </MenuItem>
      </Menu>
    </>
  );
}







// -----------------------------------------------------------
// ActionDialogs
// -----------------------------------------------------------
//
// The confirmations (extract with its language, the check of
// the obligations — which says what the judge does and does
// not do, and sends `again` when `checkAgain` — re-embed,
// re-processing a standard with its structure read the way
// picked, delete — which returns to the catalogue) and the
// new-version upload with progress.
//
// Used by:
//   - CorpusDocument (below)
// -----------------------------------------------------------

function ActionDialogs({ act, dialog, checkAgain, onClose, onQueue, queueBusy, queueError }) {

  const t = useTranslations('PAGES.corpusDocument');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const returnTo = useReturnTo();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState('lt');
  const [method, setMethod] = useState(STRUCTURE_METHODS[0]);
  const parser = act.currentVersion?.parser;
  const [file, setFile] = useState(null);
  const [percent, setPercent] = useState(null);
  const name = act.shortTitle || act.title;


  const remove = useMutation({
    mutationFn: () => api.delete(`/api/corpus/documents/${encodeURIComponent(act.id)}`, { silent: true }),
    onSuccess: () => { toast.success(t('TOASTS.deleted')); queryClient.invalidateQueries({ queryKey: ['corpus'] }); returnTo('/corpus', { replace: true }); },
  });
  const upload = useMutation({
    mutationFn: () => {
      const data = new FormData();
      data.append('file', file);
      setPercent(0);
      return api.post(`/api/corpus/documents/${encodeURIComponent(act.id)}/upload`, data, {
        silent: true, onUploadProgress: (e) => setPercent(e.total ? Math.round((e.loaded * 100) / e.total) : 0),
      });
    },
    onSuccess: () => { toast.success(t('TOASTS.uploaded')); queryClient.invalidateQueries({ queryKey: ['corpus'] }); onClose(); },
    onSettled: () => setPercent(null),
  });


  return (
    <>
      <UniversalModal open={dialog === 'extract'} onClose={onClose} busy={queueBusy} title={t('CONFIRM.extractTitle', { name })} confirmLabel={t('CONFIRM.run')}
                      error={queueError ? describe(queueError) : null}
                      onConfirm={() => onQueue(`/api/corpus/documents/${encodeURIComponent(act.id)}/extract-obligations`, { language })}>
        <Typography className="mb-3">{t('CONFIRM.extractText')}</Typography>
        <Typography variant="body2" color="text.secondary" id="extract-language">{t('CONFIRM.extractLanguage')}</Typography>
        <RadioGroup row value={language} onChange={(e) => setLanguage(e.target.value)} aria-labelledby="extract-language">
          {['lt', 'en'].map((l) => <FormControlLabel key={l} value={l} control={<Radio />} label={label('language', l)} />)}
        </RadioGroup>
      </UniversalModal>
      <UniversalModal open={dialog === 'verify'} onClose={onClose} busy={queueBusy} confirmLabel={t('CONFIRM.run')}
                      title={checkAgain ? t('CONFIRM.verifyAgainTitle', { name }) : t('CONFIRM.verifyTitle', { name })}
                      error={queueError ? describe(queueError) : null}
                      onConfirm={() => onQueue(`/api/corpus/documents/${encodeURIComponent(act.id)}/verify-obligations`, checkAgain ? { again: true } : {})}>
        <Typography className="mb-3">{t('CONFIRM.verifyText')}</Typography>
        <Typography variant="body2" color="text.secondary">{checkAgain ? t('CONFIRM.verifyAgainScope') : t('CONFIRM.verifyScope')}</Typography>
      </UniversalModal>
      <UniversalModal open={dialog === 'reembed'} onClose={onClose} busy={queueBusy} title={t('CONFIRM.reembedTitle', { name })} confirmLabel={t('CONFIRM.run')}
                      error={queueError ? describe(queueError) : null}
                      onConfirm={() => onQueue('/api/corpus/reembed', { documentId: act.id })}>
        <Typography>{t('CONFIRM.reembedText')}</Typography>
      </UniversalModal>
      <UniversalModal open={dialog === 'structure'} onClose={onClose} busy={queueBusy} title={t('METHOD.title', { name })} confirmLabel={t('METHOD.run')}
                      error={queueError ? describe(queueError) : null} onExited={() => setMethod(STRUCTURE_METHODS[0])}
                      onConfirm={() => onQueue(`/api/corpus/documents/${encodeURIComponent(act.id)}/refresh`, { force: true, structure: method })}>
        <Typography className="mb-3">{t('METHOD.text')}</Typography>
        {STRUCTURE_PARSERS.includes(parser) && (
          <Typography variant="body2" color="text.secondary" className="mb-2">{t('METHOD.current', { parser: t(`VERSIONS.PARSERS.${parser}`) })}</Typography>
        )}
        <RadioGroup value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t('METHOD.label')}>
          {STRUCTURE_METHODS.map((way) => (
            <FormControlLabel key={way} value={way} control={<Radio />} className="items-start mb-1"
                              label={<span className="block pt-2"><span className="block">{t(`METHOD.${way}`)}</span>
                                <Typography variant="body2" color="text.secondary" component="span" className="block">{t(`METHOD.${way}Hint`)}</Typography></span>} />
          ))}
        </RadioGroup>
      </UniversalModal>
      <UniversalModal open={dialog === 'delete'} onClose={onClose} danger busy={remove.isPending} error={remove.error ? describe(remove.error) : null}
                      title={t('CONFIRM.deleteTitle', { name })} confirmLabel={t('ACTIONS.delete')} onConfirm={() => remove.mutate()}
                      onExited={() => remove.reset()}>
        <Typography>{t('CONFIRM.deleteText')}</Typography>
      </UniversalModal>
      <UniversalModal open={dialog === 'upload'} onClose={onClose} busy={upload.isPending} error={upload.error ? describe(upload.error) : null}
                      title={t('UPLOAD.title')} confirmLabel={t('UPLOAD.submit')} confirmDisabled={!file} onConfirm={() => upload.mutate()}
                      onExited={() => { setFile(null); upload.reset(); }}>
        <div className="flex flex-col gap-3">
          <Typography>{t('UPLOAD.text')}</Typography>
          <FileDrop accept={ACT_ACCEPT} maxSize={MAX_ACT_BYTES} onFiles={([chosen]) => setFile(chosen)} disabled={upload.isPending} />
          {file && <Typography variant="body2">{file.name}</Typography>}
          {percent != null && (
            <div>
              <Typography variant="caption">{t('UPLOAD.progress', { percent })}</Typography>
              <LinearProgress variant="determinate" value={percent} />
            </div>
          )}
        </div>
      </UniversalModal>
    </>
  );
}







// -----------------------------------------------------------
// LatestJob
// -----------------------------------------------------------
//
// One job of the act — its most recent ingest or extraction,
// or the judge's check of its obligations: live progress
// while it runs (a status), the error when it failed (an
// alert); nothing once it finished well.
//
// Used by:
//   - CorpusDocument (below)
// -----------------------------------------------------------

function LatestJob({ job }) {

  const t = useTranslations('PAGES.corpusDocument.JOB');
  const label = useEnumLabel();
  const text = useJobText();


  if (!job || job.status === 'done' || job.status === 'cancelled') return null;
  const running = ['queued', 'running'].includes(job.status);
  return (
    <Alert severity={running ? 'info' : 'error'} role={running ? 'status' : 'alert'} className="mb-4"
           action={<Button component={Link} to="/jobs" color="inherit" size="small">{t('open')}</Button>}>
      <AlertTitle>{running ? t('running', { kind: label('jobKind', job.kind) }) : t('failed', { kind: label('jobKind', job.kind) })}</AlertTitle>
      {running && (
        <div className="flex flex-col gap-1 min-w-64">
          <span>{text.progress(job.progress) || label('jobStatus', job.status)}</span>
          {job.progress?.percent != null ? <LinearProgress variant="determinate" value={job.progress.percent} /> : <LinearProgress />}
        </div>
      )}
      {!running && job.error && <span className="whitespace-pre-wrap text-sm">{job.error}</span>}
    </Alert>
  );
}







// -----------------------------------------------------------
// Reading
// -----------------------------------------------------------
//
// One thing a model read from the act's text: what it found
// (`children`) and under it the note the model left, when it
// left one.
//
// Used by:
//   - ActInfo (below)
// -----------------------------------------------------------

function Reading({ note, children }) {

  const t = useTranslations('PAGES.corpusDocument.INFO');


  return (
    <>
      <div>{children}</div>
      {note && <div className="mt-1 text-muted">{t('modelNote', { note })}</div>}
    </>
  );
}







// -----------------------------------------------------------
// ActInfo
// -----------------------------------------------------------
//
// The catalogue record as a definition list, and after it
// what the models read from the current version's text: whom
// the act covers and what sanctions it lays down.
//
// Used by:
//   - CorpusDocument (below)
// -----------------------------------------------------------

function ActInfo({ act }) {

  const t = useTranslations('PAGES.corpusDocument.INFO');
  const label = useEnumLabel();
  const fmt = useFormat();
  const chips = (items, group) => (items?.length
    ? <div className="flex flex-wrap gap-1">{items.map((item) => <Chip key={item} size="small" label={group ? label(group, item) : item} />)}</div>
    : '—');


  const rows = [
    ['title', act.title], ['titleEn', act.titleEn || '—'], ['shortTitle', act.shortTitle || '—'], ['slug', act.slug],
    ['jurisdiction', label('jurisdiction', act.jurisdiction)], ['docType', label('docType', act.docType)],
    ['status', label('docStatus', act.status)], ['language', label('language', act.language)],
    ['sourceKind', label('sourceKind', act.sourceKind)], ['externalId', act.externalId || '—'],
    ['sourceUrl', act.sourceUrl ? <a href={act.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary [overflow-wrap:anywhere]">{act.sourceUrl}</a> : '—'],
    ['domains', chips(act.domains)], ['appliesTo', chips(act.appliesTo, 'institutionType')],
    ['applicabilityNotes', act.applicabilityNotes || '—'],
    ['scopeReading', act.scopeReading
      ? <Reading note={act.scopeReading.reasoning}>{act.scopeReading.types?.length ? chips(act.scopeReading.types, 'institutionType') : t('scopeSilent')}</Reading>
      : t('notRead')],
    ['sanctionsReading', act.sanctionsReading
      ? <Reading note={act.sanctionsReading.note}>{t('sanctionTiers', { count: act.sanctionsReading.tiers })}</Reading>
      : t('notRead')],
    ['lastCheckedAt', fmt.dateTime(act.lastCheckedAt)],
    ['createdAt', fmt.dateTime(act.createdAt)], ['updatedAt', fmt.dateTime(act.updatedAt)],
  ];
  return (
    <SectionCard>
      <dl className="grid grid-cols-1 sm:grid-cols-[minmax(10rem,max-content)_1fr] gap-x-4 gap-y-2 m-0 text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{t(key)}</dt>
            <dd className="m-0 whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}







// -----------------------------------------------------------
// StructurePanel
// -----------------------------------------------------------
//
// Desktop: the tree (in a scroller of its own, which keeps
// its place for the act) and the sticky viewer side by side.
// Phone: the tree, and the viewer in a right drawer.
//
// Used by:
//   - CorpusDocument (below)
// -----------------------------------------------------------

function StructurePanel({ act, unitId, onSelect }) {

  const t = useTranslations('PAGES.corpusDocument.STRUCTURE');
  const wide = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });
  const treeRef = useRef(null);
  useKeptScroll(treeRef, wide && act.currentVersion ? `corpus.tree.${act.id}` : null);


  if (!act.currentVersion) return <Alert severity="info" role="status">{t('notIngested')}</Alert>;
  const tree = <ProvisionTree documentId={act.id} selectedId={unitId} onSelect={onSelect} />;
  if (!wide) {
    return (
      <Paper className="p-3">
        {tree}
        <Drawer anchor="right" open={Boolean(unitId)} onClose={() => onSelect(null)}>
          <div className="w-screen max-w-[100vw] p-4">
            <UnitViewer unitId={unitId} onClose={() => onSelect(null)} />
          </div>
        </Drawer>
      </Paper>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
      <Paper ref={treeRef} className="p-3 max-h-[calc(100dvh-16rem)] overflow-auto">{tree}</Paper>
      <Paper className="p-4 sticky top-0 max-h-[calc(100dvh-16rem)] overflow-auto"><UnitViewer unitId={unitId} /></Paper>
    </div>
  );
}







// -----------------------------------------------------------
// CorpusDocument (default export)
// -----------------------------------------------------------
//
// Owns the act query (polling while its job runs), for an
// admin the judge's job and the count of obligations it has
// not seen, the tab and unit (URL — a change keeps the other
// parameters), the open dialog and the queue mutation. The
// header gives the act's official title in the serif, the
// law's own words, under the short name.
//
// Used by:
//   - router.jsx — route /corpus/:documentId
// -----------------------------------------------------------

export default function CorpusDocument({ authData }) {

  const t = useTranslations('PAGES.corpusDocument');
  const label = useEnumLabel();
  const fmt = useFormat();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const queue = useQueueJob();
  const isAdmin = authData.role === 'admin';
  const { documentId } = useParams();
  const [params, setView] = useViewParams();
  const unitId = params.get('unit');
  const tab = oneOf(params.get('tab'), TABS, 'structure');
  const [dialog, setDialog] = useState(null);


  const { data: act, isLoading, error, refetch } = useQuery({
    queryKey: ['corpus', 'document', documentId],
    queryFn: async () => {
      // The id comes from the address: encoded, it stays one path
      // segment whatever a crafted link puts there
      const data = (await api.get(`/api/corpus/documents/${encodeURIComponent(documentId)}`)).data;
      // An empty 200 or a bare value is no act — a failed load,
      // not a page of blanks (or a crash on null)
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The answer is not a legal act');
      return data;
    },
    refetchInterval: (query) => (['queued', 'running'].includes(query.state.data?.latestJob?.status) ? 3000 : false),
  });


  // The judge's job: the newest one of the act's verification
  // subject, followed while it waits or runs. Only an admin
  // starts it, and only an admin is shown every job
  const verifySubject = `verification:${documentId}`;
  const { data: verifyJob = null } = useQuery({
    queryKey: ['jobs', 'verification', documentId],
    queryFn: async () => {
      const jobs = (await api.get(`/api/jobs?subject=${encodeURIComponent(verifySubject)}&limit=1`)).data?.jobs;
      return Array.isArray(jobs) && jobs[0] && typeof jobs[0] === 'object' ? jobs[0] : null;
    },
    enabled: isAdmin,
    refetchInterval: (query) => (['queued', 'running'].includes(query.state.data?.status) ? 3000 : false),
  });


  // How many of the act's obligations the judge has not seen.
  // None left: the check can only be made again
  const { data: unchecked = null } = useQuery({
    queryKey: ['obligations', 'count', 'unchecked', documentId],
    queryFn: async () => {
      const total = (await api.get(`/api/obligations?document=${encodeURIComponent(documentId)}&verification=unchecked&limit=1`)).data?.total;
      return Number.isFinite(total) ? total : null;
    },
    enabled: isAdmin && Boolean(act?.currentVersion) && act?.obligationCount > 0,
  });
  const checkAgain = unchecked === 0;


  // The act's job while it waits or runs; its obligation
  // extraction is what the obligations tab shows in place of
  // "no obligations". When a job ends — the judge's too —
  // whatever it made is asked again: the obligations it
  // extracted, or their verdicts, come into a list that was
  // open all along.
  const activeJob = ['queued', 'running'].includes(act?.latestJob?.status) ? act.latestJob : null;
  const extraction = activeJob?.kind === 'corpus.extract_obligations' ? activeJob : null;
  const active = Boolean(activeJob) || ['queued', 'running'].includes(verifyJob?.status);
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) queryClient.invalidateQueries({ queryKey: ['obligations'] });
    wasActive.current = active;
  }, [active, queryClient]);


  const toggleEnabled = useMutation({
    mutationFn: () => api.patch(`/api/corpus/documents/${encodeURIComponent(documentId)}`, { enabled: !act.enabled }),
    onSuccess: () => { toast.success(act.enabled ? t('TOASTS.disabled') : t('TOASTS.enabled')); queryClient.invalidateQueries({ queryKey: ['corpus'] }); },
  });


  const setParam = (key, value) => setView({ [key]: value });
  const runQueue = (url, body) => queue.mutate({ url, body }, { onSuccess: () => { setDialog(null); refetch(); } });
  // A dialog starts clean — not with the last refused action's error
  const openDialog = (name) => { queue.reset(); setDialog(name); };


  const back = { to: '/corpus', label: t('back') };
  if (isLoading || error) {
    return (
      <PageLayout authData={authData} title={isLoading ? <Skeleton width={260} /> : t('TITLE')} back={back}>
        {error ? <ErrorState error={error} onRetry={refetch} title={t('loadError')} /> : <Skeleton variant="rounded" height={320} />}
      </PageLayout>
    );
  }


  const subtitle = (
    <span className="flex flex-col gap-1.5">
      {act.shortTitle && <span className="font-serif text-base text-content max-w-[80ch] [overflow-wrap:anywhere]">{act.title}</span>}
      <span className="flex items-center gap-1 flex-wrap">
        <StatusChip value={act.jurisdiction} label={label('jurisdiction', act.jurisdiction)} />
        <StatusChip value={act.docType} label={label('docType', act.docType)} />
        <StatusChip kind="docStatus" value={act.status} label={label('docStatus', act.status)} />
        {act.currentVersion && <StatusChip kind="version" value={act.currentVersion.status} label={`v${act.currentVersion.versionNo} · ${label('versionStatus', act.currentVersion.status)}`} />}
        {act.lastCheckedAt && <span className="text-xs">· {t('lastChecked', { date: fmt.dateTime(act.lastCheckedAt) })}</span>}
        {(act.currentVersion?.sourceUrl || act.sourceUrl) && (
          <a href={act.currentVersion?.sourceUrl || act.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-xs inline-flex items-center gap-0.5">
            {t('source')}<OpenInNewIcon sx={{ fontSize: 12 }} aria-hidden />
          </a>
        )}
      </span>
    </span>
  );


  return (
    <PageLayout
      authData={authData} title={act.shortTitle || act.title} subtitle={subtitle} back={back}
      actions={isAdmin
        ? <AdminActions act={act} checkAgain={checkAgain} onDialog={openDialog} onQueue={runQueue} onToggleEnabled={() => toggleEnabled.mutate()} />
        : null}
    >
      {!act.enabled && <Alert severity="warning" role="status" className="mb-4">{t('disabled')}</Alert>}
      {act.currentVersion?.parser === BY_PAGES && <Alert severity="info" role="status" className="mb-4">{t('pagesNote')}</Alert>}
      {act.lastError && (
        <Alert severity="error" className="mb-4"><AlertTitle>{t('lastError')}</AlertTitle><span className="whitespace-pre-wrap">{act.lastError}</span></Alert>
      )}
      {queue.error && <Alert severity="error" className="mb-4">{describe(queue.error)}</Alert>}
      <LatestJob job={act.latestJob} />
      <LatestJob job={verifyJob} />
      <Tabs value={tab} onChange={(_, next) => setParam('tab', next)} variant="scrollable" allowScrollButtonsMobile aria-label={t('TABS.label')}
            className="mb-4 border-b border-edge">
        {TABS.map((key) => (
          <Tab key={key} value={key} id={`act-tab-${key}`} aria-controls={`act-panel-${key}`}
               label={key === 'obligations' && act.obligationCount != null ? `${t(`TABS.${key}`)} (${act.obligationCount})` : t(`TABS.${key}`)} />
        ))}
      </Tabs>
      <div role="tabpanel" id={`act-panel-${tab}`} aria-labelledby={`act-tab-${tab}`}>
        {tab === 'structure' && <StructurePanel act={act} unitId={unitId} onSelect={(id) => setParam('unit', id)} />}
        {tab === 'versions' && <ActVersions versions={act.versions} currentId={act.currentVersion?.id} />}
        {tab === 'obligations' && (
          <Paper className="p-4">
            <ObligationsPanel documentId={act.id} isAdmin={isAdmin} defaultStatus={isAdmin ? '' : 'approved'} urlPrefix="obligations"
                              extraction={extraction} />
          </Paper>
        )}
        {tab === 'info' && <ActInfo act={act} />}
      </div>
      {isAdmin && (
        <>
          <ActionDialogs act={act} dialog={dialog} checkAgain={checkAgain} onClose={() => setDialog(null)} onQueue={runQueue}
                         queueBusy={queue.isPending} queueError={queue.error} />
          <ActMetadataDialog act={act} open={dialog === 'edit'} onClose={() => setDialog(null)} />
        </>
      )}
    </PageLayout>
  );
}
