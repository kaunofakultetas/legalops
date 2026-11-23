// -----------------------------------------------------------
//  [*] CompanyProgramme — a company's compliance programme
//
//  GET /api/companies/{id}/programme: the work products of
//  the company's compliance programme and the kinds there
//  are, polled every 5 s while any product is queued or
//  running. Three kinds, each building on the ones before
//  it: the compliance policy; the governance product
//  (structure, compliance process, RACI matrix); the legal
//  risk criteria and register. Each is generated in the
//  background from the company's documents and its latest
//  report, checked by the backend against the rules of its
//  kind, then edited and approved by a person on its own
//  page (pages/Programme).
//
//  The tab is one sheet with a row per kind, in that order:
//  the kind's title, a line on what it is and what it builds
//  on, and where its newest version stands — not generated
//  yet; waiting or being generated, with the step it is on;
//  a draft, with how many blocking rules it breaks; approved,
//  by whom and when; failed, with the error; cancelled. The
//  earlier versions of the kind stand quietly under it. The
//  buttons fit the state: "open" the newest version, and
//  "generate" — or "generate a new version" — unless one is
//  being generated already.
//
//  Generating asks first (POST …/programme {kind, language}):
//  the dialog says it runs in the background for about five
//  minutes and what it costs of today's AI budget, names the
//  kinds the product builds on that are not there yet — it
//  can be generated without them, only less well grounded —
//  and takes the document's language, which follows the
//  interface until the person picks one. A refusal is said in
//  the dialog in plain words: no readable documents, this
//  kind already being generated, today's budget spent. On
//  success the list is read again and the row shows the run.
//
//  Split into (root component last):
//
//    RUN_COST_USD   — what a generation costs, roughly
//    stampOf        — the date a version is known by
//    GenerateDialog — the confirmation
//    RunLine        — a queued or running version
//    VersionState   — where the newest version stands
//    OlderVersions  — the earlier versions of a kind
//    KindRow        — one kind
//    CompanyProgramme — the tab (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import toast from '@/utils/toast';
import { useLocale, useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import ErrorState from '@/components/ErrorState/ErrorState';
import SectionCard from '@/components/SectionCard/SectionCard';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import { productPath } from '@/paths';
import ProductStatus from '@/pages/Programme/ProductStatus';
import { fetchCompanyProgramme, programmeKeys, startProduct } from '@/pages/Programme/programmeApi';
import { KIND_ORDER, brokenRules, isActive, runProgress } from '@/pages/Programme/programmeUtils';
import useRefusal from '@/pages/Programme/useRefusal';


// What one generation spends of the caller's daily AI
// budget, roughly — the backend's own figure is 0.4–0.5 USD
const RUN_COST_USD = 0.5;







// -----------------------------------------------------------
// stampOf
// -----------------------------------------------------------
//
// The moment a version is known by: its approval, else the
// end of its generation, else its start.
//
// Used by:
//   - VersionState, OlderVersions (below)
// -----------------------------------------------------------

function stampOf(product) {
  return product.approvedAt || product.finishedAt || product.createdAt;
}







// -----------------------------------------------------------
// GenerateDialog
// -----------------------------------------------------------
//
// The confirmation before a generation starts: what it takes
// and costs, which version it makes, what it will lack, and
// the language of the document. `target` is the kind to
// generate — {kind, title, version, missing} — kept while the
// dialog fades out. A refusal shows inside the dialog.
//
// Used by:
//   - CompanyProgramme (below)
// -----------------------------------------------------------

function GenerateDialog({ open, target, company, onClose, onExited }) {

  const t = useTranslations('PAGES.company.PROGRAMME.GENERATE');
  const label = useEnumLabel();
  const locale = useLocale();
  const fmt = useFormat();
  const refusal = useRefusal();
  const queryClient = useQueryClient();
  // null = follow the interface language until one is picked
  const [picked, setPicked] = useState(null);
  const language = picked || locale;


  const start = useMutation({
    mutationFn: () => startProduct(company.id, { kind: target.kind, language }),
    onSuccess: () => {
      toast.success(t('started'));
      queryClient.invalidateQueries({ queryKey: programmeKeys.company(company.id) });
      onClose();
    },
  });


  const reset = () => {
    setPicked(null);
    start.reset();
    onExited();
  };


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={() => start.mutate()} onExited={reset} busy={start.isPending}
                    error={start.error ? refusal(start.error) : null} title={t('title', { title: target?.title ?? '' })} confirmLabel={t('submit')}>
      <div className="flex flex-col gap-4 pt-1">
        <Typography>{t('text', { cost: fmt.usd(RUN_COST_USD) })}</Typography>
        {target?.version > 1 && <Typography variant="body2" color="text.secondary">{t('newVersion', { version: target.version })}</Typography>}
        {target?.missing.length > 0 && <Alert severity="info" role="status">{t('missingNeeds', { kinds: target.missing.join(', ') })}</Alert>}
        <div className="flex flex-col gap-1">
          <Typography variant="body2" color="text.secondary" id="programme-language-label">{t('language')}</Typography>
          <ToggleButtonGroup exclusive size="small" color="primary" value={language} aria-labelledby="programme-language-label"
                             onChange={(_, value) => value && setPicked(value)}>
            <ToggleButton value="lt" className="px-4">{label('language', 'lt')}</ToggleButton>
            <ToggleButton value="en" className="px-4">{label('language', 'en')}</ToggleButton>
          </ToggleButtonGroup>
        </div>
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// RunLine
// -----------------------------------------------------------
//
// A version that waits or is being generated: a bar — moving
// without a measure while it waits, at the run's percentage
// once the job reports one — and in words how many of the
// kind's steps are done and which one is running.
//
// Used by:
//   - VersionState (below)
// -----------------------------------------------------------

function RunLine({ product, title }) {

  const t = useTranslations('PAGES.company.PROGRAMME');
  const tSteps = useTranslations('PAGES.programme.PROGRESS.STEPS');
  const { steps, index, percent } = runProgress(product);
  const running = product.status === 'running' && index >= 0;


  return (
    <div className="flex flex-col gap-1 max-w-md" role="status">
      <LinearProgress variant={running && percent != null ? 'determinate' : 'indeterminate'} value={percent ?? 0} aria-label={t('progressLabel', { title })} />
      <span className="text-sm text-muted">
        {running ? t('progress', { done: index, total: steps.length, step: tSteps(steps[index]) }) : t('queued')}
      </span>
    </div>
  );
}







// -----------------------------------------------------------
// VersionState
// -----------------------------------------------------------
//
// Where the newest version of a kind stands, as a chip and a
// line: nothing generated yet; the run and its step; a draft
// with its broken blocking rules (in words and with a mark —
// never by colour alone) and its notes; who approved it and
// when; the error of a failed run; that it was cancelled.
//
// Used by:
//   - KindRow (below)
// -----------------------------------------------------------

function VersionState({ product, title }) {

  const t = useTranslations('PAGES.company.PROGRAMME');
  const fmt = useFormat();


  if (!product) return <Typography variant="body2" color="text.secondary">{t('none')}</Typography>;
  const { blocking, notes } = brokenRules(product.checks);
  const version = t('version', { version: product.version });
  const facts = {
    draft: [version, t('generated', { date: fmt.date(stampOf(product)) })],
    approved: [version, product.approvedByName
      ? t('approvedBy', { name: product.approvedByName, date: fmt.date(product.approvedAt) })
      : t('approvedAt', { date: fmt.date(product.approvedAt) })],
    failed: [version, t('failed')],
    cancelled: [version, t('cancelled')],
  }[product.status] ?? [version];


  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-sm">
        <ProductStatus status={product.status} />
        <span>{facts.join(' · ')}</span>
      </div>
      {isActive(product) && <RunLine product={product} title={title} />}
      {product.status === 'draft' && (
        <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-sm">
          {blocking.length > 0
            ? <span className="inline-flex items-center gap-1 font-semibold text-red-700"><ErrorOutlineIcon sx={{ fontSize: 16 }} aria-hidden />{t('draftBroken', { count: blocking.length })}</span>
            : <span>{t('draftKept')}</span>}
          {notes.length > 0 && <span className="text-muted">{t('draftNotes', { count: notes.length })}</span>}
        </div>
      )}
      {product.status === 'failed' && product.error && (
        <div className="text-sm text-red-700 [overflow-wrap:anywhere] line-clamp-3">{String(product.error)}</div>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// OlderVersions
// -----------------------------------------------------------
//
// The earlier versions of a kind, newest first, each on a
// quiet line: version, status, date, and the link that opens
// it. Nothing when the kind has one version or none.
//
// Used by:
//   - KindRow (below)
// -----------------------------------------------------------

function OlderVersions({ rows, title }) {

  const t = useTranslations('PAGES.company.PROGRAMME');
  const label = useEnumLabel();
  const fmt = useFormat();


  if (rows.length === 0) return null;
  return (
    <div className="text-sm text-muted">
      <div>{t('older')}</div>
      <ul className="list-none m-0 p-0" aria-label={t('olderOf', { title })}>
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-x-2 flex-wrap">
            <span>{t('version', { version: row.version })} · {label('productStatus', row.status)} · {fmt.date(stampOf(row))}</span>
            <Link to={productPath(row.id)} className="text-primary" aria-label={t('openLabel', { title, version: row.version })}>{t('open')}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}







// -----------------------------------------------------------
// KindRow
// -----------------------------------------------------------
//
// One kind of the programme: what it is, what it builds on,
// where its newest version stands, its earlier versions, and
// the buttons that fit — "open" for a version that exists,
// and "generate" unless one is on its way. `rows` are the
// kind's versions, newest first; `needs` the titles of the
// kinds it builds on.
//
// Used by:
//   - CompanyProgramme (below)
// -----------------------------------------------------------

function KindRow({ kind, title, needs, rows, onGenerate }) {

  const t = useTranslations('PAGES.company.PROGRAMME');
  const [newest, ...older] = rows;
  const action = newest ? t('generateNew') : t('generate');


  return (
    <li className="py-4 first:pt-0 last:pb-0 border-t border-edge first:border-t-0 grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex flex-col gap-2 min-w-0">
        <div>
          <Typography variant="subtitle1" component="h3">{title}</Typography>
          <Typography variant="body2" color="text.secondary" className="max-w-3xl">
            {t(`ABOUT.${kind}`)}{needs.length > 0 ? ` ${t('buildsOn', { kinds: needs.join(', ') })}` : ''}
          </Typography>
        </div>
        <VersionState product={newest} title={title} />
        <OlderVersions rows={older} title={title} />
      </div>
      <div className="flex gap-2 flex-wrap items-start md:justify-end">
        {newest && (
          <Button component={Link} to={productPath(newest.id)} variant="contained" aria-label={t('openLabel', { title, version: newest.version })}>{t('open')}</Button>
        )}
        {!isActive(newest) && (
          <Button variant={newest ? 'outlined' : 'contained'} onClick={onGenerate} aria-label={t('generateLabel', { action, title })}>{action}</Button>
        )}
      </div>
    </li>
  );
}







// -----------------------------------------------------------
// CompanyProgramme (default export)
// -----------------------------------------------------------
//
// Owns the list query (polling while a product is on its
// way) and the generate dialog. The kinds' titles and what
// each builds on come with the answer, in both languages;
// the fixed order and the enum's titles stand in when the
// answer names none.
//
// Used by:
//   - CompanyDetail.jsx — the programme tab
// -----------------------------------------------------------

export default function CompanyProgramme({ company }) {

  const t = useTranslations('PAGES.company.PROGRAMME');
  const label = useEnumLabel();
  const locale = useLocale();
  // {kind, title, version, missing, open} — kept through the
  // dialog's close animation
  const [dialog, setDialog] = useState(null);


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: programmeKeys.company(company.id),
    queryFn: () => fetchCompanyProgramme(company.id),
    refetchInterval: (query) => (query.state.data?.products.some(isActive) ? 5000 : false),
  });


  const products = data?.products ?? [];
  const described = Object.fromEntries((data?.kinds ?? []).map((row) => [row.kind, row]));
  const titleOf = (kind) => (typeof described[kind]?.title?.[locale] === 'string' ? described[kind].title[locale] : label('productKind', kind));
  const needsOf = (kind) => (Array.isArray(described[kind]?.needs) ? described[kind].needs.filter((need) => KIND_ORDER.includes(need)) : []);
  const versionsOf = (kind) => products.filter((row) => row.kind === kind).sort((a, b) => Number(b.version) - Number(a.version));
  // A kind a product can build on: one with a draft or an
  // approved version
  const usable = (kind) => versionsOf(kind).some((row) => ['draft', 'approved'].includes(row.status));
  const generate = (kind) => setDialog({
    kind, title: titleOf(kind), open: true,
    version: Math.max(0, ...versionsOf(kind).map((row) => Number(row.version) || 0)) + 1,
    missing: needsOf(kind).filter((need) => !usable(need)).map(titleOf),
  });


  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')}>
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {isLoading && <Skeleton variant="rounded" height={240} />}
      {data && (
        <ul className="list-none m-0 p-0">
          {KIND_ORDER.map((kind) => (
            <KindRow key={kind} kind={kind} title={titleOf(kind)} needs={needsOf(kind).map(titleOf)} rows={versionsOf(kind)} onGenerate={() => generate(kind)} />
          ))}
        </ul>
      )}
      <GenerateDialog open={Boolean(dialog?.open)} target={dialog} company={company} onClose={() => setDialog((current) => current && { ...current, open: false })}
                      onExited={() => setDialog(null)} />
    </SectionCard>
  );
}
