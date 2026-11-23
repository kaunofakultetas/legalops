// -----------------------------------------------------------
//  [*] diff — a line diff of two texts, client-side
//
//  Prompt versions differ in a handful of lines, so the diff
//  trims the common head and tail first and runs the classic
//  LCS table only over the changed middle. A middle too big
//  for the table (MAX_CELLS) degrades to "all old lines out,
//  all new lines in" — still correct, just less precise.
//
//  Output rows: {type: 'same' | 'add' | 'del', text, oldNo,
//  newNo} — line numbers are 1-based, null on the side where
//  the line does not exist.
//
//  Split into:
//
//    lcsMiddle — the LCS walk over the changed middle
//    diffLines — the public entry (head/tail trim + middle)
//    diffStats — added / removed line counts
// -----------------------------------------------------------

// 4 million table cells ≈ 16 MB of Uint32 — the ceiling
const MAX_CELLS = 4_000_000;







// -----------------------------------------------------------
// lcsMiddle
// -----------------------------------------------------------
//
// Diff rows for two line arrays via the LCS length table
// (filled from the end so the walk runs forwards). Deletions
// come before additions inside one changed run.
//
// Used by:
//   - diffLines (below)
// -----------------------------------------------------------

function lcsMiddle(a, b, oldStart, newStart) {

  const rows = [];
  const n = a.length;
  const m = b.length;


  if (n * m > MAX_CELLS) {
    a.forEach((text, i) => rows.push({ type: 'del', text, oldNo: oldStart + i, newNo: null }));
    b.forEach((text, j) => rows.push({ type: 'add', text, oldNo: null, newNo: newStart + j }));
    return rows;
  }


  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }


  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i], oldNo: oldStart + i, newNo: newStart + j });
      i += 1;
      j += 1;
    } else if (j >= m || (i < n && table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      rows.push({ type: 'del', text: a[i], oldNo: oldStart + i, newNo: null });
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j], oldNo: null, newNo: newStart + j });
      j += 1;
    }
  }
  return rows;
}







// -----------------------------------------------------------
// diffLines
// -----------------------------------------------------------
//
//   diffLines(oldText, newText) → [{type, text, oldNo, newNo}]
//
// Line endings are normalised (\r\n → \n) before splitting.
//
// Used by:
//   - pages/Prompts/PromptDiff.jsx — the version comparison
// -----------------------------------------------------------

export function diffLines(oldText, newText) {

  const a = String(oldText ?? '').replace(/\r\n/g, '\n').split('\n');
  const b = String(newText ?? '').replace(/\r\n/g, '\n').split('\n');


  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;


  const rows = [];
  for (let i = 0; i < head; i += 1) rows.push({ type: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 });
  rows.push(...lcsMiddle(a.slice(head, a.length - tail), b.slice(head, b.length - tail), head + 1, head + 1));
  for (let k = tail; k > 0; k -= 1) {
    rows.push({ type: 'same', text: a[a.length - k], oldNo: a.length - k + 1, newNo: b.length - k + 1 });
  }
  return rows;
}







// -----------------------------------------------------------
// diffStats
// -----------------------------------------------------------
//
// {added, removed} line counts of a diffLines result.
//
// Used by:
//   - pages/Prompts/PromptDiff.jsx — the summary line
// -----------------------------------------------------------

export function diffStats(rows) {
  return {
    added: rows.filter((r) => r.type === 'add').length,
    removed: rows.filter((r) => r.type === 'del').length,
  };
}
