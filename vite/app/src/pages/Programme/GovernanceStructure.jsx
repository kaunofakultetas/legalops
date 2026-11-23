// -----------------------------------------------------------
//  [*] GovernanceStructure — who stands where
//
//  The "structure" tab of a governance product: the proposed
//  structure of the company as a chart, and the same nodes as
//  a table.
//
//  The chart is the backend's own drawing — the one the
//  exported PDF carries — so the page and the paper cannot
//  differ. GET /api/programme/{id}/chart answers an SVG
//  image; it is fetched as a Blob (the request must carry
//  the bearer token) and shown through an object URL in an
//  image tag. The markup is never put into the page, so
//  nothing in it can run. A chart wider than the sheet
//  scrolls sideways inside it on narrow screens and is fitted
//  to the sheet on wide ones. The image follows the saved
//  product: it is fetched again after every save, and while
//  the draft's structure has unsaved edits a line under it
//  says the chart is still the old one.
//
//  The table lists every node — a body, a committee, a
//  function or a unit — with the line of the three lines
//  model it belongs to, the node it reports to, whether the
//  product proposes it (it is not named in the company's
//  documents) and the generation's note. In a draft being
//  edited each of these is a control, a node can be removed,
//  and a new one added; a node needs a name to be kept by
//  the backend.
//
//  Split into (root component last):
//
//    useObjectUrl        — a Blob as an address an image takes
//    StructureChart      — the chart
//    NodesRead           — the nodes as a table
//    NodesEdit           — the nodes as an editable table
//    GovernanceStructure — the tab (default export)
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslations } from '@/i18n';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import SectionCard from '@/components/SectionCard/SectionCard';
import { CellSelect } from '@/pages/Programme/EditFields';
import { fetchChart, programmeKeys } from '@/pages/Programme/programmeApi';
import { LINES, NODE_KINDS, listOf, nextId, patchAt } from '@/pages/Programme/programmeUtils';
import { ROW, SCROLL, TABLE, TD, TH } from '@/pages/Programme/tableClasses';







// -----------------------------------------------------------
// useObjectUrl
// -----------------------------------------------------------
//
// An address for a Blob that an image tag can load, for as
// long as the Blob is the one shown: made when the Blob
// arrives, released when it is replaced or the page leaves.
// Nothing while there is no Blob.
//
// Used by:
//   - StructureChart (below)
// -----------------------------------------------------------

function useObjectUrl(blob) {

  const [address, setAddress] = useState(null);


  useEffect(() => {
    if (!blob) {
      setAddress(null);
      return undefined;
    }
    const made = URL.createObjectURL(blob);
    setAddress(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);


  return address;
}







// -----------------------------------------------------------
// StructureChart
// -----------------------------------------------------------
//
// The chart of the saved structure as an image, in a box
// that scrolls sideways when the drawing is wider than the
// sheet. A product without a structure has nothing to draw
// and says so; a chart that cannot be loaded says that, with
// a retry. `stale` — the draft's structure has unsaved edits
// — adds the line saying the chart is redrawn on the save.
//
// Used by:
//   - GovernanceStructure (below)
// -----------------------------------------------------------

function StructureChart({ product, stale }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const drawn = listOf(product.content?.structure).length > 0;


  const { data: blob, error, isLoading, refetch } = useQuery({
    queryKey: programmeKeys.chart(product.id, product.editedAt),
    queryFn: () => fetchChart(product.id),
    enabled: drawn,
    retry: false,
  });
  const address = useObjectUrl(blob);


  return (
    <SectionCard title={t('chart')}>
      {!drawn && <Typography variant="body2" color="text.secondary">{t('chartEmpty')}</Typography>}
      {drawn && error && <ErrorState error={error} onRetry={refetch} title={t('chartFailed')} />}
      {drawn && isLoading && <Skeleton variant="rounded" height={280} />}
      {drawn && address && (
        <div className={SCROLL}>
          <img src={address} alt={t('chartAlt')} className="block h-auto max-w-none lg:max-w-full mx-auto" />
        </div>
      )}
      {stale && <Typography variant="body2" color="text.secondary" className="mt-2" role="status">{t('chartStale')}</Typography>}
    </SectionCard>
  );
}







// -----------------------------------------------------------
// NodesRead
// -----------------------------------------------------------
//
// The nodes as a table in the structure's own order: name,
// kind, line, the node each reports to, whether it is
// proposed — in words — and the note.
//
// Used by:
//   - GovernanceStructure (below)
// -----------------------------------------------------------

function NodesRead({ nodes }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const tCommon = useTranslations('COMPONENTS.common');
  const nameOf = Object.fromEntries(nodes.map((node) => [node.id, node.name]));


  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[52rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-[22%]`}>{t('name')}</th>
            <th scope="col" className={TH}>{t('kind')}</th>
            <th scope="col" className={TH}>{t('line')}</th>
            <th scope="col" className={`${TH} w-[16%]`}>{t('parent')}</th>
            <th scope="col" className={TH}>{t('proposed')}</th>
            <th scope="col" className={`${TH} w-[30%]`}>{t('note')}</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node, index) => (
            <tr key={node.id ?? index} className={ROW}>
              <td className={`${TD} font-semibold`}>{node.name}</td>
              <td className={TD}>{NODE_KINDS.includes(node.kind) ? t(`NODE_KINDS.${node.kind}`) : String(node.kind ?? '—')}</td>
              <td className={TD}>{LINES.includes(node.line) ? t(`LINES.${node.line}`) : String(node.line ?? '—')}</td>
              <td className={TD}>{nameOf[node.parentId] ?? '—'}</td>
              <td className={TD}>{node.proposed ? tCommon('yes') : tCommon('no')}</td>
              <td className={`${TD} text-muted`}>{node.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// NodesEdit
// -----------------------------------------------------------
//
// The nodes as rows of controls: the name and the note as
// fields, the kind, the line and the parent as selects (a
// node cannot report to itself), "proposed" as a checkbox,
// and a remove button. Every control is named after its
// column and its node. `onPatch` takes a row's index and its
// changed fields, `onRemove` the index of the row to drop.
//
// Used by:
//   - GovernanceStructure (below)
// -----------------------------------------------------------

function NodesEdit({ nodes, onPatch, onRemove }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const kinds = NODE_KINDS.map((value) => ({ value, label: t(`NODE_KINDS.${value}`) }));
  const lines = LINES.map((value) => ({ value, label: t(`LINES.${value}`) }));
  const named = (field, node) => t('fieldOf', { field, name: node.name || t('newNode') });


  return (
    <div className={SCROLL}>
      <table className={`${TABLE} min-w-[70rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-[24%]`}>{t('name')}</th>
            <th scope="col" className={TH}>{t('kind')}</th>
            <th scope="col" className={TH}>{t('line')}</th>
            <th scope="col" className={`${TH} w-[16%]`}>{t('parent')}</th>
            <th scope="col" className={TH}>{t('proposed')}</th>
            <th scope="col" className={`${TH} w-[25%]`}>{t('note')}</th>
            <th scope="col" className={`${TH} w-10`} />
          </tr>
        </thead>
        <tbody>
          {nodes.map((node, index) => {
            const parents = [{ value: null, label: t('noParent') }, ...nodes.filter((other) => other.id !== node.id).map((other) => ({ value: other.id, label: other.name || t('newNode') }))];
            return (
              <tr key={node.id ?? index} className={ROW}>
                <td className={TD}>
                  <TextField size="small" fullWidth hiddenLabel value={String(node.name ?? '')} onChange={(event) => onPatch(index, { name: event.target.value })}
                             slotProps={{ htmlInput: { 'aria-label': named(t('name'), node) } }} />
                </td>
                <td className={TD}><CellSelect label={named(t('kind'), node)} value={node.kind} options={kinds} onChange={(kind) => onPatch(index, { kind })} /></td>
                <td className={TD}><CellSelect label={named(t('line'), node)} value={node.line} options={lines} onChange={(line) => onPatch(index, { line })} /></td>
                <td className={TD}>
                  <CellSelect label={named(t('parent'), node)} value={node.parentId ?? null} options={parents} onChange={(parentId) => onPatch(index, { parentId: parentId ?? null })} className="w-full" />
                </td>
                <td className={TD}>
                  <Checkbox size="small" checked={Boolean(node.proposed)} onChange={(event) => onPatch(index, { proposed: event.target.checked })}
                            slotProps={{ input: { 'aria-label': named(t('proposed'), node) } }} />
                </td>
                <td className={TD}>
                  <TextField size="small" fullWidth multiline hiddenLabel value={String(node.note ?? '')} onChange={(event) => onPatch(index, { note: event.target.value })}
                             slotProps={{ htmlInput: { 'aria-label': named(t('note'), node) } }} />
                </td>
                <td className={TD}>
                  <IconAction label={t('removeNode', { name: node.name || t('newNode') })} icon={<DeleteOutlineIcon fontSize="small" />} onClick={() => onRemove(index)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// GovernanceStructure (default export)
// -----------------------------------------------------------
//
// The chart of the saved product over the table of the
// content as it stands — `content` is the draft while there
// are edits. Removing a node takes its letters out of the
// RACI matrix with it, as the backend would on the save.
// `change` takes a function from the content to the edited
// content.
//
// Used by:
//   - ProductPage.jsx — the structure tab of a governance
//     product
// -----------------------------------------------------------

export default function GovernanceStructure({ product, content, editing, change }) {

  const t = useTranslations('PAGES.programme.GOVERNANCE');
  const nodes = listOf(content.structure);
  const stale = JSON.stringify(nodes) !== JSON.stringify(listOf(product.content?.structure));


  const patch = (index, fields) => change((current) => ({ ...current, structure: patchAt(listOf(current.structure), index, fields) }));
  const remove = (index) => change((current) => {
    const gone = listOf(current.structure)[index]?.id;
    return {
      ...current,
      structure: listOf(current.structure).filter((_, at) => at !== index).map((node) => (node.parentId === gone ? { ...node, parentId: null } : node)),
      raci: listOf(current.raci).filter((cell) => cell.roleId !== gone),
    };
  });
  const add = () => change((current) => ({
    ...current,
    structure: [...listOf(current.structure), { id: nextId(listOf(current.structure), 'n'), name: '', kind: 'function', line: 'first', parentId: null, proposed: true, note: '' }],
  }));


  return (
    <div className="flex flex-col gap-4">
      <StructureChart product={product} stale={stale} />
      <SectionCard title={t('nodes')} subtitle={t('nodesHint')}
                   actions={editing ? <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={add}>{t('addNode')}</Button> : null}>
        {editing ? <NodesEdit nodes={nodes} onPatch={patch} onRemove={remove} /> : <NodesRead nodes={nodes} />}
      </SectionCard>
    </div>
  );
}
