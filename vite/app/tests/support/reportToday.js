// -----------------------------------------------------------
//  [*] Test support — a report as the pipeline writes one today
//
//  The fixture world's finished report (UAB Pavyzdys) is from
//  before reports said what they did with each act: all of
//  its acts that applied or might were assessed. This module
//  derives from it the report a run makes now, so the parts
//  of the report page can be shown both:
//
//    - DORA, MiCA and PPTFPĮ assessed — the result of today;
//    - the AML regulation (AMLR) assessed as preparation: it
//      applies from 2027-07-10, and its two findings carry
//      that date;
//    - the AI Act not assessed — whether it applies hangs on
//      a fact the profile does not state (its question is the
//      fixture's condition to confirm), so it has no finding;
//    - the AML directive (AMLD6) not assessed either: it
//      binds through the national law — nor the law on the
//      central bank (LBĮ), which organises an authority;
//    - the consumer credit law screened out, as before.
//
//  Split into:
//
//    APPLIES_FROM — the day the AML regulation starts to apply
//    AMLR         — the act assessed as preparation
//    AMLD6        — the directive behind the national law
//    LBI          — the law that organises an authority
//    AMLR_GAP     — the id of AMLR's open finding
//    AMLR_MET     — the id of AMLR's met finding
//    reportToday  — the report
// -----------------------------------------------------------

import * as f from './backend/fixtures';


// The day the AML regulation starts to apply
export const APPLIES_FROM = '2027-07-10';

// The ids of the two findings of the AML regulation
export const AMLR_GAP = 'e2000000-0000-4000-8000-0000000000a1';
export const AMLR_MET = 'e2000000-0000-4000-8000-0000000000a2';

// The AML regulation as a report act: it applies, from a
// later date
export const AMLR = {
  id: 'e1000000-0000-4000-8000-0000000000a1',
  documentId: null,
  documentTitle: 'Reglamentas (ES) 2024/1624 dėl finansų sistemos naudojimo pinigų plovimui ar teroristų finansavimui prevencijos',
  shortTitle: 'AMLR',
  jurisdiction: 'EU',
  sourceUrl: '',
  applicability: 'applies',
  confidence: 0.9,
  reasoning: 'Kriptoturto paslaugų teikėjai yra įpareigotieji subjektai; reglamentas taikomas nuo 2027 m. liepos 10 d.',
  conditionsToVerify: '',
  appliesFrom: APPLIES_FROM,
  assessment: 'upcoming',
  citations: [],
  screenedOut: false,
};

// The AML directive: it applies, through the law that
// transposes it
export const AMLD6 = {
  ...AMLR,
  id: 'e1000000-0000-4000-8000-0000000000a2',
  documentTitle: 'Direktyva (ES) 2024/1640 dėl mechanizmų, kuriuos valstybės narės turi nustatyti',
  shortTitle: 'AMLD6',
  docType: 'directive',
  reasoning: 'Direktyvą į Lietuvos teisę perkelia PPTFPĮ, pagal kurį įmonė ir vertinama.',
  appliesFrom: null,
  assessment: 'indirect',
};







// The law on the central bank: it applies, through the
// authority's decisions
export const LBI = {
  ...AMLD6,
  id: 'e1000000-0000-4000-8000-0000000000a3',
  documentTitle: 'Lietuvos Respublikos Lietuvos banko įstatymas',
  shortTitle: 'LBĮ',
  jurisdiction: 'LT',
  docType: 'law',
  reasoning: 'Įstatymas nustato Lietuvos banko uždavinius ir priežiūros įgaliojimus.',
};







// -----------------------------------------------------------
// reportToday
// -----------------------------------------------------------
//
// The finished fixture report as a run makes it now (see the
// header). Today's findings: one not met, two partial (one by
// the reviewer's override), two met, one not applicable — the
// AI Act's "not evidenced" finding is gone with its
// assessment. The preparation: one partial (high), one met.
//
// Used by:
//   - tests/pages/report-parts.test.jsx,
//     report-findings.test.jsx, report-utils.test.js
// -----------------------------------------------------------

export function reportToday() {
  const done = f.report(f.ID.reportDone);
  const later = (source, id) => ({
    ...source, id, actId: AMLR.id, shortTitle: AMLR.shortTitle, documentTitle: AMLR.documentTitle, appliesFrom: APPLIES_FROM,
  });
  const byId = (id) => done.findings.find((row) => row.id === id);
  return {
    ...done,
    stats: { ...done.stats, acts: { applies: 6, uncertain: 1, not_applies: 1, assessed: 3, upcoming: 1, unconfirmed: 1, indirect: 2 } },
    acts: [...done.acts.map((row) => (row.applicability === 'uncertain' ? { ...row, assessment: 'unconfirmed' } : row)), AMLR, AMLD6, LBI],
    findings: [
      ...done.findings.filter((row) => row.id !== f.ID.findingAiRisk),
      later(byId(f.ID.findingIncidents), AMLR_GAP),
      later(byId(f.ID.findingAmlOfficer), AMLR_MET),
    ],
  };
}
