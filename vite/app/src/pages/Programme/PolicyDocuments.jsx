// -----------------------------------------------------------
//  [*] PolicyDocuments — the library around the policy
//
//  The "documents" tab of a compliance policy: where every
//  document of the company stands, and which documents are
//  still missing for the policy to work.
//
//  The hierarchy places each document on a level — 1 the
//  policy level, 2 thematic policies, 3 procedures and
//  instructions, and "not a rule" for a text that is none (a
//  profile, a register). It reads grouped by level, each
//  document with its topic and the generation's note on it.
//  The missing documents are a table in the order a reader
//  acts on them — the highest priority first — each with its
//  level, its title and purpose, the part of the policy it
//  makes workable, the documents that partly cover it
//  already, its priority and the provisions that ask for it.
//
//  In a draft being edited the hierarchy is one flat table in
//  the content's own order, so a row does not jump to another
//  group under the pointer the moment its level changes:
//  every document gets a level select and a topic field. A
//  missing document turns into a small form — title, purpose,
//  level, priority, the part of the policy it serves, its
//  provisions, which can be taken out and added to — and can
//  be removed whole.
//
//  Split into (root component last):
//
//    PRIORITY_ORDER — the order priorities are read in
//    HierarchyRead  — the documents grouped by level
//    HierarchyEdit  — the documents as an editable table
//    MissingRead    — the missing documents as a table
//    MissingEdit    — the missing documents as forms
//    PolicyDocuments — the tab (default export)
// -----------------------------------------------------------

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslations } from '@/i18n';
import SectionCard from '@/components/SectionCard/SectionCard';
import { CellSelect, ChoiceField } from '@/pages/Programme/EditFields';
import ProvisionLinks from '@/pages/Programme/ProvisionLinks';
import { LEVELS, MISSING_LEVELS, PRIORITIES, listOf, patchAt, withoutAt } from '@/pages/Programme/programmeUtils';
import { ROW, SCROLL, TABLE, TD, TH } from '@/pages/Programme/tableClasses';


// The place of each priority when the missing documents are
// read; an unknown one goes last
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };







// -----------------------------------------------------------
// HierarchyRead
// -----------------------------------------------------------
//
// The documents grouped by level, the policy level first and
// the texts that are no rule last; a level without documents
// is left out. Within a level the documents stand by title.
//
// Used by:
//   - PolicyDocuments (below)
// -----------------------------------------------------------

function HierarchyRead({ rows }) {

  const t = useTranslations('PAGES.programme.DOCUMENTS');
  const groups = LEVELS.map((level) => ({ level, rows: rows.filter((row) => row.level === level).sort((a, b) => String(a.document).localeCompare(String(b.document))) }))
    .filter((group) => group.rows.length > 0);


  if (groups.length === 0) return <Typography variant="body2" color="text.secondary">{t('noDocuments')}</Typography>;
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.level}>
          <Typography variant="subtitle2" component="h3" className="mb-1">{t(`LEVELS.${group.level}`)} ({group.rows.length})</Typography>
          <div className={SCROLL}>
            <table className={`${TABLE} min-w-[36rem]`}>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} w-[26%]`}>{t('document')}</th>
                  <th scope="col" className={`${TH} w-[24%]`}>{t('topic')}</th>
                  <th scope="col" className={TH}>{t('note')}</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, index) => (
                  <tr key={row.documentId ?? index} className={ROW}>
                    <td className={`${TD} font-medium`}>{row.document}</td>
                    <td className={TD}>{row.topic}</td>
                    <td className={`${TD} text-muted`}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}







// -----------------------------------------------------------
// HierarchyEdit
// -----------------------------------------------------------
//
// Every document on one row, in the content's order, with
// its level as a select and its topic as a field — each
// named after the document it belongs to, since the table
// has no room for a label per control. `onPatch` takes a
// row's index and its changed fields.
//
// Used by:
//   - PolicyDocuments (below)
// -----------------------------------------------------------

function HierarchyEdit({ rows, onPatch }) {

  const t = useTranslations('PAGES.programme.DOCUMENTS');
  const levels = LEVELS.map((level) => ({ value: level, label: t(`LEVELS.${level}`) }));


  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[44rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-[21%]`}>{t('document')}</th>
            <th scope="col" className={`${TH} w-[28%]`}>{t('level')}</th>
            <th scope="col" className={`${TH} w-[23%]`}>{t('topic')}</th>
            <th scope="col" className={TH}>{t('note')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.documentId ?? index} className={ROW}>
              <td className={`${TD} font-medium`}>{row.document}</td>
              <td className={TD}>
                <CellSelect label={t('fieldOf', { field: t('level'), name: row.document })} value={row.level} options={levels}
                            onChange={(level) => onPatch(index, { level })} className="w-full" />
              </td>
              <td className={TD}>
                <TextField size="small" fullWidth hiddenLabel value={String(row.topic ?? '')} onChange={(event) => onPatch(index, { topic: event.target.value })}
                           slotProps={{ htmlInput: { 'aria-label': t('fieldOf', { field: t('topic'), name: row.document }) } }} />
              </td>
              <td className={`${TD} text-muted`}>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// MissingRead
// -----------------------------------------------------------
//
// The missing documents as a table, the highest priority
// first and, within a priority, the higher level first: the
// level, the title with its purpose, the part of the policy
// it makes workable (`parts` are the policy's own, for their
// headings) and what already covers it in part, the priority
// in words, the legal basis.
//
// Used by:
//   - PolicyDocuments (below)
// -----------------------------------------------------------

function MissingRead({ rows, parts }) {

  const t = useTranslations('PAGES.programme.DOCUMENTS');
  const tProvision = useTranslations('PAGES.programme.PROVISION');
  const ordered = [...rows].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) || a.level - b.level);
  const priority = (value) => (PRIORITIES.includes(value) ? t(`PRIORITIES.${value}`) : String(value ?? '—'));
  const partOf = (key) => parts.find((part) => part.key === key)?.heading;


  if (ordered.length === 0) return <Typography variant="body2" color="text.secondary">{t('noMissing')}</Typography>;
  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[46rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-20`}>{t('level')}</th>
            <th scope="col" className={TH}>{t('document')}</th>
            <th scope="col" className={`${TH} w-28`}>{t('priority')}</th>
            <th scope="col" className={`${TH} w-[22%]`}>{tProvision('basis')}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row, index) => {
            const covered = listOf(row.partlyCoveredBy).map((document) => document.document).filter(Boolean);
            return (
              <tr key={index} className={ROW}>
                <td className={TD}>{row.level}</td>
                <td className={TD}>
                  <div className="font-semibold">{row.title}</div>
                  <div className="max-w-[80ch]">{row.purpose}</div>
                  {partOf(row.supports) && <div className="mt-1 text-muted">{t('supports')}: {partOf(row.supports)}</div>}
                  {covered.length > 0 && <div className="mt-1 text-muted">{t('covered')}: {covered.join(', ')}</div>}
                </td>
                <td className={TD}>{priority(row.priority)}</td>
                <td className={TD}><ProvisionLinks entries={row.legalBasis} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// MissingEdit
// -----------------------------------------------------------
//
// Every missing document as a small form, in the content's
// order: title, purpose, level, priority and the part of the
// policy it makes workable (one of `parts`), its provisions
// with a remove button each and the row that adds one, and
// the button that removes the document. `onPatch` takes a row's index and its changed fields,
// `onRemove` the index of the row to drop.
//
// Used by:
//   - PolicyDocuments (below)
// -----------------------------------------------------------

function MissingEdit({ rows, parts, onPatch, onRemove }) {

  const t = useTranslations('PAGES.programme.DOCUMENTS');
  const tProvision = useTranslations('PAGES.programme.PROVISION');
  const levels = MISSING_LEVELS.map((level) => ({ value: level, label: t(`LEVELS.${level}`) }));
  const priorities = PRIORITIES.map((value) => ({ value, label: t(`PRIORITIES.${value}`) }));
  const supported = parts.map((part) => ({ value: part.key, label: part.heading }));


  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">{t('noMissing')}</Typography>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <Paper key={index} variant="outlined" className="p-3 flex flex-col gap-3">
          <TextField size="small" fullWidth label={t('title')} value={String(row.title ?? '')} onChange={(event) => onPatch(index, { title: event.target.value })} />
          <TextField size="small" fullWidth multiline minRows={2} label={t('purpose')} value={String(row.purpose ?? '')}
                     onChange={(event) => onPatch(index, { purpose: event.target.value })} />
          <div className="flex gap-3 flex-wrap items-center">
            <ChoiceField label={t('level')} value={row.level} options={levels} onChange={(level) => onPatch(index, { level })} className="min-w-64" />
            <ChoiceField label={t('priority')} value={row.priority} options={priorities} onChange={(priority) => onPatch(index, { priority })} className="min-w-40" />
            <ChoiceField label={t('supports')} value={row.supports} options={supported} onChange={(supports) => onPatch(index, { supports })} className="min-w-64" />
            <Button color="delete" size="small" startIcon={<DeleteOutlineIcon />} className="ml-auto"
                    aria-label={t('remove', { title: row.title ?? '' })} onClick={() => onRemove(index)}>{t('removeShort')}</Button>
          </div>
          <div className="text-sm">
            <span className="text-muted">{tProvision('basis')}: </span>
            <ProvisionLinks entries={row.legalBasis} onRemove={(at) => onPatch(index, { legalBasis: withoutAt(listOf(row.legalBasis), at) })}
                            onAdd={(entry) => onPatch(index, { legalBasis: [...listOf(row.legalBasis), entry] })} />
          </div>
        </Paper>
      ))}
    </div>
  );
}







// -----------------------------------------------------------
// PolicyDocuments (default export)
// -----------------------------------------------------------
//
// The two sheets of the tab — the hierarchy and the missing
// documents — read or, `editing`, as their editors; `change`
// takes a function from the content to the edited content.
//
// Used by:
//   - ProductPage.jsx — the documents tab of a compliance
//     policy
// -----------------------------------------------------------

export default function PolicyDocuments({ content, editing, change }) {

  const t = useTranslations('PAGES.programme.DOCUMENTS');
  const hierarchy = listOf(content.hierarchy);
  const missing = listOf(content.missing);
  const parts = listOf(content.parts);
  const patchHierarchy = (index, fields) => change((current) => ({ ...current, hierarchy: patchAt(listOf(current.hierarchy), index, fields) }));
  const patchMissing = (index, fields) => change((current) => ({ ...current, missing: patchAt(listOf(current.missing), index, fields) }));
  const removeMissing = (index) => change((current) => ({ ...current, missing: withoutAt(listOf(current.missing), index) }));


  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t('hierarchy')} subtitle={t('hierarchyHint')}>
        {editing ? <HierarchyEdit rows={hierarchy} onPatch={patchHierarchy} /> : <HierarchyRead rows={hierarchy} />}
      </SectionCard>
      <SectionCard title={t('missing')} subtitle={t('missingHint')}>
        {editing ? <MissingEdit rows={missing} parts={parts} onPatch={patchMissing} onRemove={removeMissing} />
          : <MissingRead rows={missing} parts={parts} />}
      </SectionCard>
    </div>
  );
}
