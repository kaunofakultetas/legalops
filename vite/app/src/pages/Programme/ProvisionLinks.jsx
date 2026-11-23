// -----------------------------------------------------------
//  [*] ProvisionLinks — the legal basis of a text
//
//  The provisions a part of a policy, a missing document or
//  a risk scenario rests on, each as the backend looked it
//  up in the legal corpus: cited by the act's short title and
//  the provision's path, set in the serif like every
//  reference to the law, and a link to the official text
//  (a new tab) when the corpus gave an https address. What
//  the provision was named for is its tooltip.
//
//  A provision a reviewer cannot rely on carries a warning
//  mark with the reason in words — the act does not have it,
//  the corpus does not hold the act, or it regulates
//  something else: in the mark's tooltip and, for a screen
//  reader, in the row itself.
//
//  In a draft being edited a provision can be taken out and
//  a new one added — which is how a person mends the rule
//  about articles that do not exist. A new provision is
//  named the way the corpus is asked for it: the act by its
//  short title (MiCA, DORA, PPTFPĮ…), the article's number
//  and, when there is one, the paragraph's. The page cannot
//  know whether it exists: until the save it stands in the
//  list as "to be looked up on save", and the save answers
//  it looked up — a link, or the warning mark.
//
//  Split into (root component last):
//
//    FLAG_TONES     — a flag's colour
//    ProvisionFlag  — the warning mark of one provision
//    Provision      — one provision: link, mark, remove
//    AddProvision   — the row that adds a provision
//    ProvisionLinks — the list (default export)
// -----------------------------------------------------------

import { useId, useState } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslations } from '@/i18n';
import { listOf, provisionFlag, provisionLabel, provisionPending } from '@/pages/Programme/programmeUtils';


// A provision that does not exist or regulates something else
// is an error; an act the corpus cannot vouch for is a doubt
const FLAG_TONES = { not_found: 'text-red-700', mismatch: 'text-red-700', act_not_in_corpus: 'text-amber-700' };







// -----------------------------------------------------------
// ProvisionFlag
// -----------------------------------------------------------
//
// The warning mark after a provision: an icon whose tooltip
// says what is wrong, with the same words in the row for a
// screen reader. It takes the keyboard's focus, so the
// tooltip can be reached without a pointer.
//
// Used by:
//   - Provision (below)
// -----------------------------------------------------------

function ProvisionFlag({ flag }) {
  const t = useTranslations('PAGES.programme.PROVISION.FLAG');
  return (
    <Tooltip title={t(flag)}>
      <span tabIndex={0} className={`inline-flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary ${FLAG_TONES[flag]}`}>
        <WarningAmberIcon sx={{ fontSize: 15 }} aria-hidden />
        <span className="sr-only">{t(flag)}</span>
      </span>
    </Tooltip>
  );
}







// -----------------------------------------------------------
// Provision
// -----------------------------------------------------------
//
// One provision by its citation: a link when the corpus gave
// an https address, plain text otherwise; then its warning
// mark, when it has one — or, for a provision the server has
// not looked up yet, the words saying it will be on the save
// — and, while the draft is edited, the button that takes it
// out.
//
// Used by:
//   - ProvisionLinks (below)
// -----------------------------------------------------------

function Provision({ entry, onRemove }) {

  const t = useTranslations('PAGES.programme.PROVISION');
  const label = provisionLabel(entry);
  const flag = provisionFlag(entry);
  const url = typeof entry.citationUrl === 'string' && entry.citationUrl.startsWith('https://') ? entry.citationUrl : null;


  const cited = url ? (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={t('open', { label })}
       className="font-serif text-inherit underline decoration-edge underline-offset-2 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary rounded-sm">
      {label}
    </a>
  ) : <span className="font-serif">{label}</span>;


  return (
    <li className={`inline-flex items-center gap-1 ${flag ? FLAG_TONES[flag] : ''}`}>
      {entry.why ? <Tooltip title={entry.why}>{cited}</Tooltip> : cited}
      {flag && <ProvisionFlag flag={flag} />}
      {provisionPending(entry) && <span className="font-sans text-xs text-muted">({t('pending')})</span>}
      {onRemove && (
        <IconButton size="small" aria-label={t('remove', { label })} onClick={onRemove} className="p-0.5">
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </li>
  );
}







// -----------------------------------------------------------
// AddProvision
// -----------------------------------------------------------
//
// The row under a legal basis that adds a provision to it:
// the act, the article and — optionally — the paragraph, and
// the button, which is off until an act and an article are
// named. Enter in a field adds as well. What is added
// carries no reason and no verdict: the server looks it up
// on the save. The line under the row says how to name the
// act, and is the act field's description.
//
// Used by:
//   - ProvisionLinks (below)
// -----------------------------------------------------------

function AddProvision({ onAdd }) {

  const t = useTranslations('PAGES.programme.PROVISION');
  const hintId = useId();
  const [act, setAct] = useState('');
  const [article, setArticle] = useState('');
  const [paragraph, setParagraph] = useState('');
  const ready = act.trim() !== '' && article.trim() !== '';


  const add = (event) => {
    event.preventDefault();
    if (!ready) return;
    onAdd({ act: act.trim(), article: article.trim(), paragraph: paragraph.trim(), why: '' });
    setAct('');
    setArticle('');
    setParagraph('');
  };


  return (
    <form onSubmit={add} noValidate aria-label={t('addTitle')} className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <TextField size="small" label={t('act')} value={act} onChange={(event) => setAct(event.target.value)} className="w-56"
                   slotProps={{ htmlInput: { 'aria-describedby': hintId } }} />
        <TextField size="small" label={t('article')} value={article} onChange={(event) => setArticle(event.target.value)} className="w-28" />
        <TextField size="small" label={t('paragraph')} value={paragraph} onChange={(event) => setParagraph(event.target.value)} className="w-44" />
        <Button type="submit" size="small" variant="outlined" startIcon={<AddIcon />} disabled={!ready}>{t('add')}</Button>
      </div>
      <span id={hintId} className="font-sans text-xs text-muted">{t('actHint')}</span>
    </form>
  );
}







// -----------------------------------------------------------
// ProvisionLinks (default export)
// -----------------------------------------------------------
//
// The provisions as a wrapping line of citations. `onRemove`,
// given the index of a provision, takes it out of the draft —
// its presence is what makes the remove buttons show;
// `onAdd`, given a new provision, appends it, and puts the
// adding row under the list. Without `onAdd` a basis with no
// provisions renders nothing.
//
// Used by:
//   - PolicyParts.jsx — a part's legal basis
//   - PolicyDocuments.jsx — a missing document's
//   - ScenarioCard.jsx, ScenarioEditor.jsx — a risk
//     scenario's
// -----------------------------------------------------------

export default function ProvisionLinks({ entries, onRemove = null, onAdd = null }) {
  const shown = listOf(entries);
  if (shown.length === 0 && !onAdd) return null;
  return (
    <>
      {shown.length > 0 && (
        <ul className="list-none m-0 p-0 inline-flex flex-wrap gap-x-3 gap-y-1 text-sm align-baseline">
          {shown.map((entry, index) => <Provision key={index} entry={entry} onRemove={onRemove ? () => onRemove(index) : null} />)}
        </ul>
      )}
      {onAdd && <AddProvision onAdd={onAdd} />}
    </>
  );
}
