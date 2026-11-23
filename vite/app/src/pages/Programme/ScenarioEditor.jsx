// -----------------------------------------------------------
//  [*] ScenarioEditor — one risk scenario as a form
//
//  What a person may change in a scenario of a draft
//  register: the area and the unit; the types of legal risk
//  it belongs to — one or two of the six of ISO 31022, which
//  is what the register's rule about covering at least four
//  types counts; the sentence and the
//  four parts it is made of (the event, its source, the
//  consequences, the objective they affect); its place in
//  the lecture's three typologies — the kind of source, of
//  consequences and of protected objective; the eight
//  scores — four dimensions of likelihood, four of impact,
//  each a level from 1 to 5; the reason for each group; the
//  response, the actions, the owners and the deadline; the
//  internal policies it concerns, picked among the company's
//  documents the product was made from; the internal
//  conclusion, and the outside lawyer's conclusion, which
//  only a person writes. A provision of its legal basis can
//  be taken out and a new one added.
//
//  The form holds no level, score or band: those are the
//  server's. It only sends the eight scores; the save
//  answers the level they make. A score nobody has set — a
//  scenario added on the page starts with all eight unset —
//  is the dash of its select and travels as 0: the form
//  never puts a number where a person has not chosen one,
//  and the server keeps such a scenario unscored.
//
//  Split into (root component last):
//
//    LEVELS         — the scale of a score
//    ScoreGroup     — a group's four scores and its reason
//    CategoryPicker — the types of legal risk, two at most
//    PolicyPicker   — the internal policies, among the documents
//    ScenarioEditor — the form (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import useEnumLabel from '@/hooks/useEnumLabel';
import { ChoiceField, TextList } from '@/pages/Programme/EditFields';
import ProvisionLinks from '@/pages/Programme/ProvisionLinks';
import { ScenarioLevel } from '@/pages/Programme/ScenarioCard';
import { CATEGORIES, IMPACT_DIMENSIONS, LIKELIHOOD_DIMENSIONS, MAX_CATEGORIES, RESPONSES, TYPOLOGIES, listOf, withoutAt } from '@/pages/Programme/programmeUtils';


// The scale every dimension is scored on
const LEVELS = [1, 2, 3, 4, 5];







// -----------------------------------------------------------
// ScoreGroup
// -----------------------------------------------------------
//
// One group of scores — likelihood or impact: a select per
// dimension, each level with its name in words under a dash
// for "not set", and the reason for the group. `onChange`
// takes the changed fields of the group.
//
// Used by:
//   - ScenarioEditor (below)
// -----------------------------------------------------------

function ScoreGroup({ title, why, dimensions, levelEnum, values, onChange }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();
  const options = [{ value: 0, label: '—' }, ...LEVELS.map((level) => ({ value: level, label: `${level} — ${label(levelEnum, level)}` }))];
  // Anything that is no level of the scale reads as "not set"
  const levelOf = (value) => (LEVELS.includes(value) ? value : 0);


  return (
    <fieldset className="m-0 p-0 border-0 min-w-0 flex flex-col gap-3">
      <Typography variant="subtitle2" component="legend" className="p-0 mb-2">{title}</Typography>
      <div className="grid gap-3 sm:grid-cols-2">
        {dimensions.map((name) => (
          <ChoiceField key={name} label={t(`DIMENSIONS.${name}`)} value={levelOf(values?.[name])} options={options} onChange={(level) => onChange({ [name]: level })} />
        ))}
      </div>
      <TextField size="small" fullWidth multiline minRows={2} label={why} value={String(values?.why ?? '')} onChange={(event) => onChange({ why: event.target.value })} />
    </fieldset>
  );
}







// -----------------------------------------------------------
// CategoryPicker
// -----------------------------------------------------------
//
// The types of legal risk a scenario belongs to, as a choice
// of several among the six, each by its number and name. A
// scenario carries two at most: a third is not taken, and
// the line under the field says so until the next change —
// it is announced, since nothing else shows that the choice
// was refused. What it reports is the numbers, in order.
//
// Used by:
//   - ScenarioEditor (below)
// -----------------------------------------------------------

function CategoryPicker({ categories, onChange }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const label = useEnumLabel();
  // Whether the last choice was a third type, and refused
  const [refused, setRefused] = useState(false);
  const chosen = (Array.isArray(categories) ? categories : []).filter((number) => CATEGORIES.includes(number));


  const pick = (picked) => {
    if (picked.length > MAX_CATEGORIES) {
      setRefused(true);
      return;
    }
    setRefused(false);
    onChange([...picked].sort((a, b) => a - b));
  };


  return (
    <Autocomplete
      multiple size="small" options={CATEGORIES} value={chosen} disableCloseOnSelect onChange={(_, picked) => pick(picked)}
      getOptionLabel={(number) => `${number} ${label('riskCategory', number)}`}
      renderInput={(params) => (
        <TextField {...params} label={t('types')} error={refused} helperText={<span role={refused ? 'alert' : undefined}>{refused ? t('typesMax') : t('typesHint')}</span>} />
      )}
    />
  );
}







// -----------------------------------------------------------
// PolicyPicker
// -----------------------------------------------------------
//
// The internal policies a scenario concerns, as a choice of
// several among the company's documents — `documents`, the
// ones the product was made from, each {id, title}. A policy
// the scenario already names that is not among them stays
// choosable, so opening the form loses nothing. What it
// reports is the list as the content holds it: the
// document's id and its title.
//
// Used by:
//   - ScenarioEditor (below)
// -----------------------------------------------------------

function PolicyPicker({ policies, documents, onChange }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const chosen = listOf(policies).map((entry) => ({ id: entry.documentId, title: entry.document }));
  const known = listOf(documents).map((entry) => ({ id: entry.id, title: entry.title }));
  const options = [...known, ...chosen.filter((entry) => !known.some((other) => other.id === entry.id))];


  return (
    <Autocomplete
      multiple size="small" options={options} value={chosen} disableCloseOnSelect
      onChange={(_, picked) => onChange(picked.map((entry) => ({ documentId: entry.id, document: entry.title })))}
      getOptionLabel={(entry) => String(entry.title ?? '')} isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => <TextField {...params} label={t('policies')} helperText={t('policiesHint')} />}
    />
  );
}







// -----------------------------------------------------------
// ScenarioEditor (default export)
// -----------------------------------------------------------
//
// The form of one scenario, headed by what it goes by —
// `name`: its id, or "new scenario" — and by its level as
// the server last worked it out, or, `pending`, by the
// sentence that the level waits for the save. `documents`
// are the company's documents its policies are picked from,
// `closeLabel` what the button that folds the form says.
// `onChange` takes the changed fields of the scenario;
// `onDone` folds the form back into the card (the edits stay
// in the draft either way).
//
// Used by:
//   - RiskRegister.jsx — the scenario opened for editing
// -----------------------------------------------------------

export default function ScenarioEditor({ scenario, name = scenario.id, documents, pending = false, closeLabel, onChange, onDone }) {

  const t = useTranslations('PAGES.programme.RISKS');
  const tProvision = useTranslations('PAGES.programme.PROVISION');
  const label = useEnumLabel();
  const responses = RESPONSES.map((value) => ({ value, label: label('riskResponse', value) }));
  const field = (name, extra = {}) => (
    <TextField size="small" fullWidth label={t(name)} value={String(scenario[name] ?? '')} onChange={(event) => onChange({ [name]: event.target.value })} {...extra} />
  );


  return (
    <Paper variant="outlined" component="article" className="p-4 flex flex-col gap-4 border-primary">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Typography variant="subtitle2" component="h3"><span className="text-primary-light">{name}</span></Typography>
        <div className="flex items-center gap-2 flex-wrap">
          <ScenarioLevel scenario={scenario} pending={pending} />
          <Button size="small" variant="outlined" onClick={onDone}>{closeLabel}</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {field('area')}
        {field('unit')}
      </div>
      <CategoryPicker categories={scenario.categories} onChange={(categories) => onChange({ categories })} />
      <TextField size="small" fullWidth multiline minRows={3} label={t('sentence')} helperText={t('sentenceHint')} value={String(scenario.sentence ?? '')}
                 onChange={(event) => onChange({ sentence: event.target.value })} />
      <div className="grid gap-3 md:grid-cols-2">
        {field('event', { multiline: true })}
        {field('source', { multiline: true })}
        {field('consequences', { multiline: true })}
        {field('objective', { multiline: true })}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {TYPOLOGIES.map(({ field: name, group, values }) => (
          <ChoiceField key={name} label={t(name)} value={scenario[name]} options={values.map((value) => ({ value, label: label(group, value) }))}
                       onChange={(value) => onChange({ [name]: value })} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ScoreGroup title={t('likelihoodGroup')} why={t('likelihoodWhy')} dimensions={LIKELIHOOD_DIMENSIONS} levelEnum="likelihoodLevel" values={scenario.likelihood}
                    onChange={(fields) => onChange({ likelihood: { ...scenario.likelihood, ...fields } })} />
        <ScoreGroup title={t('impactGroup')} why={t('impactWhy')} dimensions={IMPACT_DIMENSIONS} levelEnum="impactLevel" values={scenario.impact}
                    onChange={(fields) => onChange({ impact: { ...scenario.impact, ...fields } })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ChoiceField label={t('response')} value={scenario.response} options={responses} onChange={(response) => onChange({ response })} />
        {field('deadline')}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Typography variant="subtitle2" component="h4">{t('actions')}</Typography>
          <TextList items={scenario.actions} onChange={(actions) => onChange({ actions })} multiline itemLabel={(number) => t('action', { number })} addLabel={t('addAction')} />
        </div>
        <div className="flex flex-col gap-2">
          <Typography variant="subtitle2" component="h4">{t('owners')}</Typography>
          <TextList items={scenario.owners} onChange={(owners) => onChange({ owners })} itemLabel={(number) => t('owner', { number })} addLabel={t('addOwner')} />
        </div>
      </div>
      <PolicyPicker policies={scenario.policies} documents={documents} onChange={(policies) => onChange({ policies })} />
      <TextField size="small" fullWidth multiline minRows={3} label={t('internal')} value={String(scenario.internalConclusion ?? '')}
                 onChange={(event) => onChange({ internalConclusion: event.target.value })} />
      <TextField size="small" fullWidth multiline minRows={2} label={t('external')} value={String(scenario.externalConclusion ?? '')}
                 onChange={(event) => onChange({ externalConclusion: event.target.value })} />
      <div className="text-sm">
        <span className="text-muted">{tProvision('basis')}: </span>
        <ProvisionLinks entries={scenario.legalBasis} onRemove={(index) => onChange({ legalBasis: withoutAt(listOf(scenario.legalBasis), index) })}
                        onAdd={(entry) => onChange({ legalBasis: [...listOf(scenario.legalBasis), entry] })} />
      </div>
    </Paper>
  );
}
