// -----------------------------------------------------------
//  [*] usableRows — the rows of a list React can key
//
//  The company tabs draw some lists outside a grid — the role
//  cards, the chat links, the documents offered as evidence
//  or as a role's source — each item keyed by its id. A
//  proxy, a bug or a half-migrated backend can send an item
//  without an id (React reports a missing key) or two with
//  the same one (React mixes them up), so those lists pass
//  through this first: objects with a string or number id,
//  the first of each id, in the answer's order. (The grids
//  need nothing of the kind: DataTable filters its own rows.)
//
//  Split into:
//
//    usableRows — the filter (default export)
// -----------------------------------------------------------







// -----------------------------------------------------------
// usableRows (default export)
// -----------------------------------------------------------
//
//   usableRows([{ id: 'a' }, {}, { id: 'a' }, null]) → [{ id: 'a' }]
//   usableRows(undefined)                            → []
//
// Anything that is not a list is no rows.
//
// Used by:
//   - CompanyCredentials.jsx — the evidence documents
//   - CompanyStandards.jsx — the adopted standards, the
//     credentials offered as certificates, the corpus's
//     standards
//   - CompanyRoles.jsx — the role cards, the source documents
//   - CompanyThreads.jsx — the chat links (the query's select)
//   - actionRegister.js — the actions of the register
// -----------------------------------------------------------

export default function usableRows(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((row) => {
    const id = row && typeof row === 'object' ? row.id : undefined;
    if ((typeof id !== 'string' && typeof id !== 'number') || id === '' || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
