// -----------------------------------------------------------
//  [*] tableRows — a backend list made safe to use by id
//
//  A malformed answer (not a list, empty objects, null ids,
//  one id repeated) must not take a page down. The DataTable
//  drops such rows before the grid, but the corpus pages use
//  their rows outside it too — the catalogue's counts and
//  filters, the versions tab's empty state, the provision
//  tree's React keys — so they pass the list through here
//  first: objects with an id, each id once, in the order
//  received; anything that is not a list becomes an empty
//  one.
// -----------------------------------------------------------







// -----------------------------------------------------------
// tableRows (default export)
// -----------------------------------------------------------
//
//   tableRows(data.documents) → the rows a page can show
//
// Used by:
//   - CorpusCatalogue.jsx — the acts
//   - ActVersions.jsx — an act's versions
//   - ProvisionTree.jsx — each page of provisions
// -----------------------------------------------------------

export default function tableRows(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((row) => {
    if (!row || typeof row !== 'object' || row.id == null || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
