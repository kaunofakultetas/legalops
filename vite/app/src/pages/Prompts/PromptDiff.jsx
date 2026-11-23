// -----------------------------------------------------------
//  [*] PromptDiff — compare two versions (or the draft)
//
//  A client-side line diff (utils/diff.js) of any two of: the
//  stored versions and the editor's unsaved draft. The
//  settings (model, temperature, max tokens) are compared
//  above the text; the text diff is unified, with old / new
//  line numbers, removed lines red with "−", added lines
//  green with "+" (the sign carries it, not the colour).
//
//  Split into (root component last):
//
//    SideSelect  — pick a version or the draft
//    DiffTable   — the unified line diff
//    PromptDiff  — the tab (default export)
// -----------------------------------------------------------

import { useMemo } from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/i18n';
import { diffLines, diffStats } from '@/utils/diff';
import SectionCard from '@/components/SectionCard/SectionCard';







// -----------------------------------------------------------
// SideSelect
// -----------------------------------------------------------
//
// "draft" or a version number.
//
// Used by:
//   - PromptDiff (below)
// -----------------------------------------------------------

function SideSelect({ label, value, onChange, versions }) {
  const t = useTranslations('PAGES.promptEditor.DIFF');
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 200 }}>
      <MenuItem value="draft">{t('draft')}</MenuItem>
      {versions.map((v) => <MenuItem key={v.version} value={String(v.version)}>{t('version', { version: v.version })}</MenuItem>)}
    </TextField>
  );
}







// -----------------------------------------------------------
// DiffTable
// -----------------------------------------------------------
//
// One row per line: old no., new no., sign, text.
//
// Used by:
//   - PromptDiff (below)
// -----------------------------------------------------------

function DiffTable({ rows }) {
  const t = useTranslations('PAGES.promptEditor.DIFF');
  return (
    <div className="overflow-auto max-h-[60vh] border border-edge rounded">
      <table className="w-full border-collapse font-mono text-xs">
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={row.type === 'add' ? 'bg-green-50' : row.type === 'del' ? 'bg-red-50' : ''}>
              <td className="px-2 text-right text-muted select-none w-10 align-top">{row.oldNo ?? ''}</td>
              <td className="px-2 text-right text-muted select-none w-10 align-top">{row.newNo ?? ''}</td>
              <td className={`px-1 select-none w-4 align-top ${row.type === 'add' ? 'text-green-800' : row.type === 'del' ? 'text-red-800' : ''}`}
                  aria-label={row.type === 'add' ? t('added') : row.type === 'del' ? t('removed') : undefined}>
                {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''}
              </td>
              <td className="px-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{row.text || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}







// -----------------------------------------------------------
// PromptDiff (default export)
// -----------------------------------------------------------
//
//   <PromptDiff prompt draft left right onLeft onRight />
//
// Used by:
//   - PromptEditor.jsx — the compare tab
// -----------------------------------------------------------

export default function PromptDiff({ prompt, draft, left, right, onLeft, onRight }) {

  const t = useTranslations('PAGES.promptEditor.DIFF');
  const tEditor = useTranslations('PAGES.promptEditor.EDITOR');
  const versions = prompt.versions || [];


  // A side → {text, model, temperature, maxTokens} strings
  const sideOf = (key) => {
    if (key === 'draft') return draft;
    const v = versions.find((x) => String(x.version) === String(key));
    return { text: v?.text ?? '', model: v?.model ?? '', temperature: v?.temperature == null ? '' : String(v.temperature), maxTokens: v?.maxTokens == null ? '' : String(v.maxTokens) };
  };
  const a = sideOf(left);
  const b = sideOf(right);
  const rows = useMemo(() => diffLines(a.text, b.text), [a.text, b.text]);
  const stats = diffStats(rows);
  const settings = [['model', 'model'], ['temperature', 'temperature'], ['maxTokens', 'maxTokens']]
    .filter(([key]) => (a[key] || '') !== (b[key] || ''))
    .map(([key, labelKey]) => t('changed', { field: tEditor(labelKey), from: a[key] || '—', to: b[key] || '—' }));


  return (
    <SectionCard>
      <div className="flex gap-2 flex-wrap mb-3">
        <SideSelect label={t('left')} value={left} onChange={onLeft} versions={versions} />
        <SideSelect label={t('right')} value={right} onChange={onRight} versions={versions} />
      </div>
      {settings.length > 0 && (
        <div className="mb-3">
          <Typography variant="subtitle2" component="h3">{t('settings')}</Typography>
          <ul className="m-0 pl-5 text-sm font-mono">{settings.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      <Typography variant="body2" color="text.secondary" className="mb-2" aria-live="polite">
        {stats.added || stats.removed ? t('summary', stats) : t('same')}
      </Typography>
      {(stats.added > 0 || stats.removed > 0) && <DiffTable rows={rows} />}
    </SectionCard>
  );
}
