// -----------------------------------------------------------
//  [*] Provenance — what a product was made from
//
//  The quiet last tab of every product: so a reviewer can
//  trace a draft back to its inputs. It says what the
//  generation read — the company's compliance report, the
//  earlier products of the programme the kind builds on (each
//  by its kind and version, a link to that version), the
//  company's documents by their titles — and, for a draft
//  revised from an approved product, which version it came
//  from. Then how it was written: the AI instructions with
//  their versions and models, and what the run cost. A
//  product a person revised has no run of its own, so those
//  two lines then say so instead of showing nothing.
//
//  Split into (root component last):
//
//    Fact       — one labelled line
//    Provenance — the tab (default export)
// -----------------------------------------------------------

import { Link } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import SectionCard from '@/components/SectionCard/SectionCard';
import { productPath } from '@/paths';
import { KIND_ORDER, listOf } from '@/pages/Programme/programmeUtils';







// -----------------------------------------------------------
// Fact
// -----------------------------------------------------------
//
// One line of the provenance: what it is about, in the
// muted caption the detail pages use, and the value under
// it.
//
// Used by:
//   - Provenance (below)
// -----------------------------------------------------------

function Fact({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="dt">{label}</Typography>
      <dd className="m-0 text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}







// -----------------------------------------------------------
// Provenance (default export)
// -----------------------------------------------------------
//
// The provenance of one product, read off its `basis` and
// `stats`; every part of either may be missing.
//
// Used by:
//   - ProductPage.jsx — the provenance tab
// -----------------------------------------------------------

export default function Provenance({ product }) {

  const t = useTranslations('PAGES.programme.PROVENANCE');
  const label = useEnumLabel();
  const fmt = useFormat();
  const basis = product.basis && typeof product.basis === 'object' ? product.basis : {};
  const stats = product.stats && typeof product.stats === 'object' ? product.stats : {};
  const earlier = basis.products && typeof basis.products === 'object' ? basis.products : {};
  const builtOn = KIND_ORDER.filter((kind) => earlier[kind] && typeof earlier[kind] === 'object');
  const documents = listOf(basis.documents);
  const prompts = listOf(stats.provenance?.prompts);


  return (
    <SectionCard title={t('title')} subtitle={t('hint')}>
      <dl className="m-0 flex flex-col gap-3 max-w-3xl">
        <Fact label={t('madeFrom')}>
          {basis.reportId ? <Link to={`/reports/${basis.reportId}`} className="text-primary">{t('report')}</Link> : t('noReport')}
        </Fact>
        <Fact label={t('products')}>
          {builtOn.length === 0 ? t('noProducts') : (
            <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
              {builtOn.map((kind) => (
                <li key={kind}>
                  <Link to={productPath(earlier[kind].id)} className="text-primary">
                    {t('productVersion', { kind: label('productKind', kind), version: earlier[kind].version })}
                  </Link>
                  {earlier[kind].status && <span className="text-muted"> · {label('productStatus', earlier[kind].status)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Fact>
        {basis.revisedFrom && (
          <Fact label={t('revisedFrom')}>
            <Link to={productPath(basis.revisedFrom)} className="text-primary">{label('productKind', product.kind)}</Link>
          </Fact>
        )}
        <Fact label={t('documents', { count: fmt.number(documents.length) })}>
          {documents.map((document) => document.title).filter(Boolean).join(', ') || '—'}
        </Fact>
        <Fact label={t('prompts')}>
          {prompts.length === 0 ? t('noPrompts') : (
            <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
              {prompts.map((prompt, index) => (
                <li key={index}>{t('promptVersion', { slug: prompt.slug, version: prompt.version, model: String(prompt.model ?? '').split(':').pop() })}</li>
              ))}
            </ul>
          )}
        </Fact>
        <Fact label={t('cost')}>
          {stats.costUsd == null ? '—' : t('costValue', { cost: fmt.usd(stats.costUsd), tokens: fmt.number(stats.tokens) })}
        </Fact>
      </dl>
    </SectionCard>
  );
}
