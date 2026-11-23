// -----------------------------------------------------------
//  [*] ScenarioCard — one risk scenario of the register
//
//  A scenario is one sentence in a fixed form — a likely
//  event, arising from a source, may cause consequences that
//  affect an objective — with everything the register
//  records around it. The card reads top down the way a
//  reviewer goes through it: the id, the area and the unit;
//  the level of the risk; the sentence, in the serif; the
//  types of legal risk it belongs to (ISO 31022) and its
//  place in the three typologies of sources, consequences
//  and protected objectives; what the
//  company's documents and its report show (the internal
//  conclusion) and, when a person wrote one, the outside
//  lawyer's conclusion; why the likelihood and the impact
//  are what they are, each with its four scores; the
//  internal policies and the provisions it concerns; the
//  response with its actions; the owners and the deadline.
//
//  The level reads "T × P = score" with the band in words on
//  the band's tint. All four numbers are the server's: the
//  likelihood is the mean of its four scores, the impact the
//  highest of its four, the score their product, the band
//  the score's. When the scores were edited and not saved
//  yet the card says the level is worked out on the save,
//  instead of showing a stale one or a guess of its own; and
//  a scenario with a score nobody has set — a new one — has
//  no level at all and reads "not scored".
//
//  Split into (root component last):
//
//    ScenarioLevel — the level, or that it is pending (named export)
//    Scores        — a group's four scores
//    Field         — one labelled block
//    ScenarioCard  — the card (default export)
// -----------------------------------------------------------

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import ProvisionLinks from '@/pages/Programme/ProvisionLinks';
import { BAND_TINTS, IMPACT_DIMENSIONS, LIKELIHOOD_DIMENSIONS, RESPONSES, TYPOLOGIES, listOf, scenarioUnset } from '@/pages/Programme/programmeUtils';







// -----------------------------------------------------------
// ScenarioLevel
// -----------------------------------------------------------
//
// The scenario's level as the server worked it out — the two
// levels, their product and the band in words, on the band's
// tint — or, for a scenario whose scores wait for a save,
// the sentence saying so. "Not scored" when one of its
// scores is not set — whatever level it had before — or the
// server gave it no band.
//
// Used by:
//   - ScenarioCard (below)
//   - ScenarioEditor.jsx — the head of the form
// -----------------------------------------------------------

export function ScenarioLevel({ scenario, pending }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();


  if (scenarioUnset(scenario) || (!pending && !scenario.band)) return <span className="rounded border border-edge px-2 py-1 text-sm text-muted">{t('unscored')}</span>;
  if (pending) return <span className="rounded border border-dashed border-field px-2 py-1 text-sm text-muted">{t('scorePending')}</span>;
  return (
    <span className="rounded border border-edge px-2 py-1 text-sm font-semibold whitespace-nowrap" style={BAND_TINTS[scenario.band]}>
      {t('scoreLine', { likelihood: scenario.likelihood?.level, impact: scenario.impact?.level, score: scenario.score })} · {label('riskBand', scenario.band)}
    </span>
  );
}







// -----------------------------------------------------------
// Scores
// -----------------------------------------------------------
//
// The four scores of a group — likelihood or impact — each
// under its dimension's name.
//
// Used by:
//   - ScenarioCard (below)
// -----------------------------------------------------------

function Scores({ dimensions, values }) {
  const t = useTranslations('PAGES.programme.RISKS');
  return (
    <ul className="list-none m-0 mt-1 p-0 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-xs text-muted">
      {dimensions.map((name) => (
        <li key={name} className="flex justify-between gap-2">
          <span>{t(`DIMENSIONS.${name}`)}</span><span className="font-semibold text-content tabular-nums">{values?.[name] ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}







// -----------------------------------------------------------
// Field
// -----------------------------------------------------------
//
// One labelled block of the card: the label in the muted
// caption, the value under it; `wide` takes both columns.
//
// Used by:
//   - ScenarioCard (below)
// -----------------------------------------------------------

function Field({ label, wide = false, children }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <Typography variant="caption" color="text.secondary" component="dt">{label}</Typography>
      <dd className="m-0 text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}







// -----------------------------------------------------------
// ScenarioCard (default export)
// -----------------------------------------------------------
//
// One scenario, read. `name` is what it goes by — its id, or
// "new scenario" for one the server has not numbered;
// `pending` — its scores were edited and not saved;
// `actions` — the buttons of a draft being edited (edit,
// remove), shown under the card's content.
//
// Used by:
//   - RiskRegister.jsx — every scenario that is not open in
//     the editor
// -----------------------------------------------------------

export default function ScenarioCard({ scenario, name = scenario.id, pending = false, actions = null }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const tProvision = useTranslations('PAGES.programme.PROVISION');
  const label = useEnumLabel();
  const types = (Array.isArray(scenario.categories) ? scenario.categories : []).map((number) => `${number} ${label('riskCategory', number)}`);
  const typology = TYPOLOGIES.filter(({ field, values }) => values.includes(scenario[field]))
    .map(({ field, group }) => `${t(field)}: ${label(group, scenario[field])}`);
  const policies = listOf(scenario.policies).map((document) => document.document).filter(Boolean);
  const actionsPlanned = (Array.isArray(scenario.actions) ? scenario.actions : []).filter(Boolean);
  const owners = (Array.isArray(scenario.owners) ? scenario.owners : []).filter(Boolean);


  return (
    <Paper variant="outlined" component="article" className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Typography variant="subtitle2" component="h3" className="[overflow-wrap:anywhere]">
          <span className="text-primary-light">{name}</span>
          <span className="font-normal">{[scenario.area, scenario.unit].filter(Boolean).map((text) => ` · ${text}`).join('')}</span>
        </Typography>
        <ScenarioLevel scenario={scenario} pending={pending} />
      </div>
      <p className="m-0 font-serif text-[1.0625rem] leading-relaxed max-w-[84ch]">{scenario.sentence}</p>
      {types.length > 0 && <div className="text-sm text-muted">{t('types')}: {types.join(', ')}</div>}
      {typology.length > 0 && <div className="text-sm text-muted">{typology.join(' · ')}</div>}
      <dl className="m-0 grid gap-x-8 gap-y-3 md:grid-cols-2">
        <Field label={t('internal')} wide><span className="block max-w-[100ch]">{scenario.internalConclusion || '—'}</span></Field>
        {scenario.externalConclusion && <Field label={t('external')} wide><span className="block max-w-[100ch] whitespace-pre-wrap">{scenario.externalConclusion}</span></Field>}
        <Field label={t('likelihoodWhy')}>
          {scenario.likelihood?.why || '—'}
          <Scores dimensions={LIKELIHOOD_DIMENSIONS} values={scenario.likelihood} />
        </Field>
        <Field label={t('impactWhy')}>
          {scenario.impact?.why || '—'}
          <Scores dimensions={IMPACT_DIMENSIONS} values={scenario.impact} />
        </Field>
        <Field label={t('policies')}>{policies.join(', ') || '—'}</Field>
        <Field label={tProvision('basis')}>{listOf(scenario.legalBasis).length ? <ProvisionLinks entries={scenario.legalBasis} /> : '—'}</Field>
        <Field label={t('response')} wide>
          <span className="font-semibold">{RESPONSES.includes(scenario.response) ? label('riskResponse', scenario.response) : String(scenario.response ?? '—')}</span>
          {actionsPlanned.length > 0 && (
            <ol className="m-0 mt-1 pl-5 list-decimal flex flex-col gap-0.5 max-w-[100ch]">
              {actionsPlanned.map((action, index) => <li key={index}>{action}</li>)}
            </ol>
          )}
        </Field>
        <Field label={t('owners')}>{owners.join(', ') || '—'}</Field>
        <Field label={t('deadline')}>{scenario.deadline || '—'}</Field>
      </dl>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </Paper>
  );
}
