// -----------------------------------------------------------
//  [*] tableClasses — how the programme's plain tables look
//
//  A product's content is full of small tables — documents
//  by level, the nodes of a structure, the steps of a
//  process, the criteria. They are plain HTML tables in the
//  look of the usage page's: muted column heads without
//  weight, hairlines between rows, cells aligned to the top
//  because their texts run to several lines. The classes are
//  kept here so every one of them is drawn alike. A table
//  that can be wider than a phone sits in a SCROLL box, so
//  it scrolls inside its sheet instead of pushing the page
//  sideways.
// -----------------------------------------------------------







// -----------------------------------------------------------
// SCROLL
// -----------------------------------------------------------
//
// The box around a table that may be wider than its sheet:
// the table scrolls sideways inside it.
//
// Used by:
//   - PolicyDocuments.jsx, GovernanceStructure.jsx,
//     GovernanceProcess.jsx, GovernanceRaci.jsx,
//     GovernancePositions.jsx, RiskMatrix.jsx,
//     RiskCriteria.jsx
// -----------------------------------------------------------

export const SCROLL = 'overflow-x-auto';







// -----------------------------------------------------------
// TABLE
// -----------------------------------------------------------
//
// The table itself: as wide as its box, collapsed borders,
// the interface's small text.
//
// Used by:
//   - PolicyDocuments.jsx, GovernanceStructure.jsx,
//     GovernanceProcess.jsx, GovernancePositions.jsx,
//     RiskCriteria.jsx
// -----------------------------------------------------------

export const TABLE = 'w-full text-sm border-collapse';







// -----------------------------------------------------------
// TH
// -----------------------------------------------------------
//
// A column head: muted, without weight, left-aligned, set on
// the bottom of its row.
//
// Used by:
//   - PolicyDocuments.jsx, GovernanceStructure.jsx,
//     GovernanceProcess.jsx, GovernanceRaci.jsx,
//     GovernancePositions.jsx, RiskCriteria.jsx
// -----------------------------------------------------------

export const TH = 'py-1.5 pr-4 font-normal text-left text-muted align-bottom';







// -----------------------------------------------------------
// ROW
// -----------------------------------------------------------
//
// A body row: a hairline above it.
//
// Used by:
//   - PolicyDocuments.jsx, GovernanceStructure.jsx,
//     GovernanceProcess.jsx, GovernanceRaci.jsx,
//     GovernancePositions.jsx, RiskCriteria.jsx
// -----------------------------------------------------------

export const ROW = 'border-t border-edge';







// -----------------------------------------------------------
// TD
// -----------------------------------------------------------
//
// A body cell: aligned to the top, its text free to break
// inside long words.
//
// Used by:
//   - PolicyDocuments.jsx, GovernanceStructure.jsx,
//     GovernanceProcess.jsx, GovernancePositions.jsx,
//     RiskCriteria.jsx
// -----------------------------------------------------------

export const TD = 'py-2 pr-4 align-top [overflow-wrap:anywhere]';
