// -----------------------------------------------------------
//  [*] CorpusSearch — the retrieval playground
//
//  POST /api/corpus/search {query, k, documents?,
//  jurisdiction?} — the same hybrid retrieval (vectors +
//  keywords over the current versions' chunks) the assistant
//  and the analysis use, so an admin or a student can see
//  what the model would be given for a question. Each hit
//  shows the act, the provision path and heading, the score
//  and the passage, with links to the provision in the
//  corpus viewer and to the official text.
//
//  The form and the last answer are kept in sessionStorage:
//  Back from a provision the answer linked to finds both —
//  without searching (and paying for the embedding) again.
//
//  Split into (root component last):
//
//    K_OPTIONS    — the result counts offered
//    EMPTY_FORM   — the form before any search
//    isForm       — a stored form the tab can use
//    isAnswer     — a stored answer the tab can show
//    SearchHit    — one passage
//    CorpusSearch — the tab (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import useEnumLabel from '@/hooks/useEnumLabel';
import useSessionState from '@/hooks/useSessionState';
import ErrorState from '@/components/ErrorState/ErrorState';
import { JURISDICTIONS } from '@/constants/enums';


// How many passages the search may return
const K_OPTIONS = [5, 8, 15, 30];

// The form before any search (the acts picked are kept as
// {id, shortTitle, title} — what the picker shows)
const EMPTY_FORM = { query: '', k: 8, jurisdiction: '', acts: [] };







// -----------------------------------------------------------
// isForm
// -----------------------------------------------------------
//
// A stored form the tab can use: a query, a count it offers,
// a known jurisdiction (or none) and acts with ids.
//
// Used by:
//   - CorpusSearch (below) — useSessionState's check
// -----------------------------------------------------------

function isForm(value) {
  return typeof value?.query === 'string' && K_OPTIONS.includes(value.k)
    && (value.jurisdiction === '' || JURISDICTIONS.includes(value.jurisdiction))
    && Array.isArray(value.acts) && value.acts.every((act) => typeof act?.id === 'string');
}







// -----------------------------------------------------------
// isAnswer
// -----------------------------------------------------------
//
// A stored answer the tab can show: {hits} with a list of
// hit objects.
//
// Used by:
//   - CorpusSearch (below) — useSessionState's check
// -----------------------------------------------------------

function isAnswer(value) {
  return Array.isArray(value?.hits) && value.hits.every((hit) => hit && typeof hit === 'object');
}







// -----------------------------------------------------------
// SearchHit
// -----------------------------------------------------------
//
// Act · path · heading, the score, the passage (the law's
// text, so in the serif; clamped, expandable — the +/−
// toggle is named and says whether it is open) and the two
// links.
//
// Used by:
//   - CorpusSearch (below)
// -----------------------------------------------------------

function SearchHit({ hit }) {

  const t = useTranslations('PAGES.corpus.SEARCH');
  const fmt = useFormat();
  const [full, setFull] = useState(false);


  return (
    <Paper variant="outlined" component="li" className="p-3 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <Typography variant="subtitle2" component="h3">
          {hit.shortTitle} · {hit.path}{hit.heading ? ` — ${hit.heading}` : ''}
        </Typography>
        <span className="text-xs text-muted">{t('score', { score: fmt.number(hit.score, { maximumFractionDigits: 3 }) })}</span>
      </div>
      <Typography variant="body2" className={`font-serif leading-relaxed whitespace-pre-wrap ${full ? '' : 'line-clamp-4'}`}>{hit.text}</Typography>
      <div className="flex gap-3 flex-wrap text-sm items-center">
        <Button size="small" onClick={() => setFull(!full)} aria-expanded={full} aria-label={full ? t('collapse') : t('expand')}>{full ? '−' : '+'}</Button>
        <Link to={`/corpus/${hit.documentId}?unit=${hit.unitId}`} className="text-primary">{t('openUnit')}</Link>
        {(hit.citationUrl || hit.sourceUrl) && (
          <a href={hit.citationUrl || hit.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1">
            {t('official')}<OpenInNewIcon sx={{ fontSize: 14 }} aria-hidden />
          </a>
        )}
      </div>
    </Paper>
  );
}







// -----------------------------------------------------------
// CorpusSearch (default export)
// -----------------------------------------------------------
//
// Owns the form and the search mutation (a POST, so it runs
// only on submit — each search embeds the query); both the
// form and the last answer are kept for the tab.
//
// Used by:
//   - Corpus.jsx — the search tab
// -----------------------------------------------------------

export default function CorpusSearch() {

  const t = useTranslations('PAGES.corpus.SEARCH');
  const tCorpus = useTranslations('PAGES.corpus');
  const label = useEnumLabel();
  const [form, setForm] = useSessionState('corpus.search.form', EMPTY_FORM, isForm);
  const [answer, setAnswer] = useSessionState('corpus.search.answer', null, isAnswer);


  const { data: documents = [] } = useQuery({
    queryKey: ['corpus', 'documents', { q: '', jurisdiction: '' }],
    queryFn: async () => (await api.get('/api/corpus/documents')).data.documents,
  });


  const search = useMutation({
    mutationFn: async () => (await api.post('/api/corpus/search', {
      query: form.query.trim(), k: form.k,
      ...(form.jurisdiction ? { jurisdiction: form.jurisdiction } : {}),
      ...(form.acts.length ? { documents: form.acts.map((a) => a.id) } : {}),
    }, { silent: true })).data.hits,
    onSuccess: (hits) => setAnswer({ hits: Array.isArray(hits) ? hits : [] }),
  });
  const hits = search.isPending || search.error ? null : answer?.hits;


  const submit = (event) => {
    event.preventDefault();
    if (form.query.trim()) search.mutate();
  };


  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <Paper component="form" onSubmit={submit} className="p-4 flex flex-col gap-3" role="search">
        <TextField label={t('query')} value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} multiline minRows={2}
                   helperText={t('hint')} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }} />
        <div className="flex gap-2 flex-wrap">
          <TextField select size="small" label={t('k')} value={form.k} onChange={(e) => setForm({ ...form, k: e.target.value })} sx={{ minWidth: 150 }}>
            {K_OPTIONS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('jurisdiction')} value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} sx={{ minWidth: 150 }}>
            <MenuItem value="">{tCorpus('all')}</MenuItem>
            {JURISDICTIONS.map((j) => <MenuItem key={j} value={j}>{label('jurisdiction', j)}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple size="small" className="flex-1 min-w-64" options={documents} value={form.acts}
            onChange={(_, acts) => setForm({ ...form, acts: acts.map(({ id, shortTitle, title }) => ({ id, shortTitle, title })) })}
            getOptionLabel={(d) => d.shortTitle || d.title}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label={t('acts')} />}
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="submit" variant="contained" loading={search.isPending}>{t('submit')}</Button>
          <Typography variant="caption" color="text.secondary">{t('cost')}</Typography>
        </div>
      </Paper>
      {search.isPending && <LinearProgress />}
      {search.error && <ErrorState error={search.error} />}
      {hits && (
        <section aria-live="polite" className="flex flex-col gap-2">
          <Typography variant="subtitle1" component="h2">{hits.length ? t('results', { count: hits.length }) : t('empty')}</Typography>
          <ol className="m-0 p-0 list-none flex flex-col gap-2">
            {hits.map((hit) => <SearchHit key={hit.chunkId} hit={hit} />)}
          </ol>
        </section>
      )}
    </div>
  );
}
