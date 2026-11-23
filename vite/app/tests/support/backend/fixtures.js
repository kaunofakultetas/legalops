// -----------------------------------------------------------
//  [*] Test support — canonical backend answers
//
//  One realistic body per endpoint the SPA calls, in the
//  exact wire shape the Django serializers and the node
//  assistant produce: every key the serializer writes,
//  camelCase, the model enums, null where a column can be
//  NULL, aware stamps as isoformat() writes them
//  ('2026-09-21T09:15:00+00:00'), bare 'YYYY-MM-DD' for date
//  columns, costs as numbers. The rows agree with each other,
//  so a page that joins two answers sees one world: UAB
//  Pavyzdys is the crypto-asset service provider whose
//  verified licence cites its own "Leidimo išrašas" document;
//  its finished report read MiCA version 1, so MiCA shows as
//  outdated since version 2 arrived; that report's job, steps
//  and model calls are the ones the jobs and usage pages
//  list, and its stats are summed from those calls. The
//  world's clock stands at NOW (2026-09-27 10:00 UTC); the
//  default session is the administrator (`me`). One report
//  stands beside the lists: UAB Pavyzdys' newest analysis,
//  started with the review of its list of acts and waiting
//  for that approval (waitingReport) — its detail, its scope
//  price and its approval resolve, the lists do not carry it.
//  So does a second one: the analysis of UAB Pavyzdys that
//  also assessed the company's own requirements (ownReport),
//  the one report of this world with that group — every other
//  is without it. And a third: the company's first analysis,
//  of 2026-09-08 (earlierReport) — signed off the day after,
//  it is where the company's action register began: its plan
//  came in then, and the finished report's sign-off of
//  2026-09-22 confirmed the obligations that were met by
//  then, closed one action and brought two of its own.
//
//  handlers.js serves these by default; a test that needs a
//  variation copies and edits (`{ ...company(ID.pavyzdys),
//  … }`) rather than changing the fixture, which other tests
//  share. Nothing here is real data: people, companies,
//  licence numbers, register ids and hosts are made up; the
//  legal acts are real acts, their texts paraphrased.
//
//  Names are the endpoint's noun; functions take the path
//  params (and the query) where the answer depends on them
//  and answer undefined for an unknown id (handlers.js turns
//  that into the 404 envelope). The ids a create hands out
//  (NEW) resolve on the pages a create navigates to — user,
//  company, company document, chat thread, legal act, report
//  and the jobs they queue — answering the template, since
//  the double keeps no state.
//
//  Sections, in the order the file declares them:
//
//    clock and ids    — NOW, TODAY, ID
//    accounts         — adminUser … login
//    companies        — companies, company
//    documents        — companyDocuments … documentHits
//    obligations      — obligations
//    legal corpus     — acts … checkCitations
//    chat             — threads … chatStatus
//    jobs             — jobs … queuedJob
//    models, prompts  — llmModels … promptTest
//    usage            — usageCalls, usageCall, usage
//    reports          — reports … reportExport
//    action register  — companyActions … lawChanges
//    MCP servers      — mcpServers, mcpTest
//    audit            — auditEntries
//    templates        — NEW
//
//  The work products of a compliance programme (the f0 ids)
//  live in a file of their own, programme.js, which reads
//  the clock, the ids and the people from here.
//
//  Used by:
//    - handlers.js — the default handlers
//    - auth.js — the two sessions (adminUser, plainUser)
//    - tests — the values they send and assert on
// -----------------------------------------------------------







// -----------------------------------------------------------
// NOW
// -----------------------------------------------------------
//
// The world's clock: every "just now" stamp a mutation
// answers carries it, and the fixture history lies before
// it.
//
// Used by:
//   - handlers.js — created / updated / reviewed stamps
//   - NEW, queuedJob, mcpTest (below)
// -----------------------------------------------------------

export const NOW = '2026-09-27T10:00:00+00:00';







// -----------------------------------------------------------
// TODAY
// -----------------------------------------------------------
//
// NOW's UTC date — the "today" of the usage budgets and the
// last day of every usage series.
//
// Used by:
//   - budgetOf, usage, promptTest (below)
// -----------------------------------------------------------

export const TODAY = '2026-09-27';







// -----------------------------------------------------------
// ID
// -----------------------------------------------------------
//
// Every id a test may need, uuid4-shaped and stable. The
// first group names the table, the last counts; *ff is the
// id a create hands out (NEW):
//
//   a0 users          c0 companies       c1 credentials
//   c2 company roles  c3 documents       c4 adopted standards
//   ca chat threads
//   d0 legal acts     d1 act versions    d2 provisions
//   0b obligations    e0 reports         e2 findings
//   e4 report citations                  b0 jobs
//   5e MCP servers    f0 work products   ac register actions
//
// Chat message ids follow assistant-ui ("msg-…") and the
// assistant ("srv-<uuid>"), as the stored rows carry them.
//
// Used by:
//   - every fixture (below), handlers.js
//   - tests — the path params of the pages they open
// -----------------------------------------------------------

export const ID = Object.freeze({
  admin: 'a0000000-0000-4000-8000-000000000001',
  jonas: 'a0000000-0000-4000-8000-000000000002',
  lina: 'a0000000-0000-4000-8000-000000000003',
  newUser: 'a0000000-0000-4000-8000-0000000000ff',

  pavyzdys: 'c0000000-0000-4000-8000-000000000001',
  kreditas: 'c0000000-0000-4000-8000-000000000002',
  newCompany: 'c0000000-0000-4000-8000-0000000000ff',
  licence: 'c1000000-0000-4000-8000-000000000001',
  iso27001: 'c1000000-0000-4000-8000-000000000002',
  newCredential: 'c1000000-0000-4000-8000-0000000000ff',
  amlOfficer: 'c2000000-0000-4000-8000-000000000001',
  complianceOfficer: 'c2000000-0000-4000-8000-000000000002',
  newRole: 'c2000000-0000-4000-8000-0000000000ff',
  isoAdoption: 'c4000000-0000-4000-8000-000000000001',
  newAdoption: 'c4000000-0000-4000-8000-0000000000ff',

  policyDoc: 'c3000000-0000-4000-8000-000000000001',
  procedureDoc: 'c3000000-0000-4000-8000-000000000002',
  licenceDoc: 'c3000000-0000-4000-8000-000000000003',
  registerDoc: 'c3000000-0000-4000-8000-000000000004',
  contractDoc: 'c3000000-0000-4000-8000-000000000005',
  scanDoc: 'c3000000-0000-4000-8000-000000000006',
  complaintsDoc: 'c3000000-0000-4000-8000-000000000007',
  newDocument: 'c3000000-0000-4000-8000-0000000000ff',

  licenceThread: 'ca000000-0000-4000-8000-000000000001',
  doraThread: 'ca000000-0000-4000-8000-000000000002',
  jonasThread: 'ca000000-0000-4000-8000-000000000003',
  newThread: 'ca000000-0000-4000-8000-0000000000ff',
  question1: 'msg-u-0001',
  answer1: 'srv-ca100000-0000-4000-8000-000000000001',
  question2: 'msg-u-0002',
  answer2: 'srv-ca100000-0000-4000-8000-000000000002',

  aiAct: 'd0000000-0000-4000-8000-000000000001',
  dora: 'd0000000-0000-4000-8000-000000000002',
  mica: 'd0000000-0000-4000-8000-000000000003',
  tfr: 'd0000000-0000-4000-8000-000000000004',
  lbRules: 'd0000000-0000-4000-8000-000000000005',
  aml: 'd0000000-0000-4000-8000-000000000006',
  consumerCredit: 'd0000000-0000-4000-8000-000000000007',
  iso27001Standard: 'd0000000-0000-4000-8000-000000000010',
  iso9001Standard: 'd0000000-0000-4000-8000-000000000011',
  newAct: 'd0000000-0000-4000-8000-0000000000ff',
  micaV1: 'd1000000-0000-4000-8000-000000000001',
  micaV2: 'd1000000-0000-4000-8000-000000000002',
  doraV1: 'd1000000-0000-4000-8000-000000000003',
  aiActV1: 'd1000000-0000-4000-8000-000000000004',
  tfrV1: 'd1000000-0000-4000-8000-000000000005',
  amlV1: 'd1000000-0000-4000-8000-000000000006',
  consumerCreditV1: 'd1000000-0000-4000-8000-000000000007',

  micaV1Art2: 'd2000000-0000-4000-8000-000000000101',
  micaV1Art59: 'd2000000-0000-4000-8000-000000000102',
  micaV1Art59Par1: 'd2000000-0000-4000-8000-000000000103',
  micaV1Art66: 'd2000000-0000-4000-8000-000000000104',
  micaV1Art66Par4: 'd2000000-0000-4000-8000-000000000105',
  micaV1Art70: 'd2000000-0000-4000-8000-000000000106',
  micaV1Art70Par1: 'd2000000-0000-4000-8000-000000000107',
  micaRecital76: 'd2000000-0000-4000-8000-000000000201',
  micaTitleV: 'd2000000-0000-4000-8000-000000000202',
  micaChapter1: 'd2000000-0000-4000-8000-000000000203',
  micaArt59: 'd2000000-0000-4000-8000-000000000204',
  micaArt59Par1: 'd2000000-0000-4000-8000-000000000205',
  micaArt59Par2: 'd2000000-0000-4000-8000-000000000206',
  micaChapter2: 'd2000000-0000-4000-8000-000000000207',
  micaArt70: 'd2000000-0000-4000-8000-000000000208',
  micaArt70Par1: 'd2000000-0000-4000-8000-000000000209',
  micaChapter3: 'd2000000-0000-4000-8000-000000000210',
  micaArt75: 'd2000000-0000-4000-8000-000000000211',
  micaArt75Par1: 'd2000000-0000-4000-8000-000000000212',
  doraArt2: 'd2000000-0000-4000-8000-000000000301',
  doraChapter3: 'd2000000-0000-4000-8000-000000000302',
  doraArt19: 'd2000000-0000-4000-8000-000000000303',
  doraArt19Par1: 'd2000000-0000-4000-8000-000000000304',
  doraChapter5: 'd2000000-0000-4000-8000-000000000305',
  doraArt28: 'd2000000-0000-4000-8000-000000000306',
  doraArt28Par3: 'd2000000-0000-4000-8000-000000000307',
  aiArt6: 'd2000000-0000-4000-8000-000000000401',
  aiArt6Par2: 'd2000000-0000-4000-8000-000000000402',
  aiAnnex3: 'd2000000-0000-4000-8000-000000000403',
  amlArt9: 'd2000000-0000-4000-8000-000000000501',
  amlArt9Par1: 'd2000000-0000-4000-8000-000000000502',
  amlArt14: 'd2000000-0000-4000-8000-000000000503',
  amlArt14Par3: 'd2000000-0000-4000-8000-000000000504',
  amlArt22: 'd2000000-0000-4000-8000-000000000505',
  amlArt22Par3: 'd2000000-0000-4000-8000-000000000506',
  tfrArt4: 'd2000000-0000-4000-8000-000000000601',
  vkiArt17: 'd2000000-0000-4000-8000-000000000701',
  vkiArt17Par1: 'd2000000-0000-4000-8000-000000000702',

  obAiRisk: '0b000000-0000-4000-8000-000000000001',
  obIncidentReport: '0b000000-0000-4000-8000-000000000002',
  obRegister: '0b000000-0000-4000-8000-000000000003',
  obLicence: '0b000000-0000-4000-8000-000000000004',
  obSafeguarding: '0b000000-0000-4000-8000-000000000005',
  obFeeDisclosure: '0b000000-0000-4000-8000-000000000006',
  obAmlOfficer: '0b000000-0000-4000-8000-000000000007',
  obCorrespondent: '0b000000-0000-4000-8000-000000000008',
  obCreditworthiness: '0b000000-0000-4000-8000-000000000009',
  obStandard: '0b000000-0000-4000-8000-000000000010',

  reportFailed: 'e0000000-0000-4000-8000-000000000001',
  reportDone: 'e0000000-0000-4000-8000-000000000002',
  reportRunning: 'e0000000-0000-4000-8000-000000000003',
  reportWaiting: 'e0000000-0000-4000-8000-000000000004',
  reportOwn: 'e0000000-0000-4000-8000-000000000005',
  reportEarlier: 'e0000000-0000-4000-8000-000000000006',
  newReport: 'e0000000-0000-4000-8000-0000000000ff',
  findingSafeguarding: 'e2000000-0000-4000-8000-000000000001',
  findingRegister: 'e2000000-0000-4000-8000-000000000002',
  findingIncidents: 'e2000000-0000-4000-8000-000000000003',
  findingAiRisk: 'e2000000-0000-4000-8000-000000000004',
  findingLicence: 'e2000000-0000-4000-8000-000000000005',
  findingAmlOfficer: 'e2000000-0000-4000-8000-000000000006',
  findingCorrespondent: 'e2000000-0000-4000-8000-000000000007',
  findingOwnReports: 'e2000000-0000-4000-8000-000000000011',
  findingOwnRisk: 'e2000000-0000-4000-8000-000000000012',
  findingOwnScope: 'e2000000-0000-4000-8000-000000000013',

  jobReportFailed: 'b0000000-0000-4000-8000-000000000001',
  jobReportDone: 'b0000000-0000-4000-8000-000000000002',
  jobIngestMica: 'b0000000-0000-4000-8000-000000000003',
  jobExtractVki: 'b0000000-0000-4000-8000-000000000004',
  jobReembed: 'b0000000-0000-4000-8000-000000000005',
  jobMaintenance: 'b0000000-0000-4000-8000-000000000006',
  jobIngestLb: 'b0000000-0000-4000-8000-000000000007',
  jobIndexComplaints: 'b0000000-0000-4000-8000-000000000008',
  jobReportRunning: 'b0000000-0000-4000-8000-000000000009',
  jobExtractMica: 'b0000000-0000-4000-8000-00000000000a',
  jobReportWaiting: 'b0000000-0000-4000-8000-00000000000b',
  jobProductRunning: 'b0000000-0000-4000-8000-00000000000c',
  jobReportOwn: 'b0000000-0000-4000-8000-00000000000d',
  newReportJob: 'b0000000-0000-4000-8000-0000000000fe',
  newJob: 'b0000000-0000-4000-8000-0000000000ff',

  mcpEu: '5e000000-0000-4000-8000-000000000001',
  mcpRegistry: '5e000000-0000-4000-8000-000000000002',
  newMcpServer: '5e000000-0000-4000-8000-0000000000ff',

  actionRegister: 'ac000000-0000-4000-8000-000000000001',
  actionMica: 'ac000000-0000-4000-8000-000000000002',
  actionAmlOfficer: 'ac000000-0000-4000-8000-000000000003',
  actionCorrespondent: 'ac000000-0000-4000-8000-000000000004',
  actionAiLiteracy: 'ac000000-0000-4000-8000-000000000005',
  actionAiRisk: 'ac000000-0000-4000-8000-000000000006',
  actionIncidents: 'ac000000-0000-4000-8000-000000000007',
  actionReferences: 'ac000000-0000-4000-8000-000000000008',

  productPolicyApproved: 'f0000000-0000-4000-8000-000000000001',
  productPolicy: 'f0000000-0000-4000-8000-000000000002',
  productGovernance: 'f0000000-0000-4000-8000-000000000003',
  productRisks: 'f0000000-0000-4000-8000-000000000004',
  productRisksRunning: 'f0000000-0000-4000-8000-000000000005',
  newProduct: 'f0000000-0000-4000-8000-0000000000ff',
});







// -----------------------------------------------------------
// find
// -----------------------------------------------------------
//
// The row with that id, or undefined — the lookup every
// "by path param" fixture starts with.
//
// Used by:
//   - the lookup functions (below)
// -----------------------------------------------------------

function find(rows, id) {
  return rows.find((row) => row.id === id);
}







// -----------------------------------------------------------
// adminUser
// -----------------------------------------------------------
//
// The administrator — the default session (GET /api/auth/me
// answers it). No own budget: admins default to unlimited.
//
// Used by:
//   - me, users (below), auth.js — authData
// -----------------------------------------------------------

export const adminUser = {
  id: ID.admin,
  email: 'admin@example.lt',
  displayName: 'Rūta Administratorė',
  role: 'admin',
  active: true,
  dailyBudgetUsd: null,
  createdAt: '2026-09-01T08:00:00+00:00',
  lastLoginAt: '2026-09-27T07:45:12+00:00',
};







// -----------------------------------------------------------
// plainUser
// -----------------------------------------------------------
//
// A plain user with an own daily budget of 5 USD — the owner
// of UAB Pavyzdys and the starter of its analyses.
//
// Used by:
//   - users (below), auth.js — userAuthData
// -----------------------------------------------------------

export const plainUser = {
  id: ID.jonas,
  email: 'jonas@example.lt',
  displayName: 'Jonas Naudotojas',
  role: 'user',
  active: true,
  dailyBudgetUsd: 5,
  createdAt: '2026-09-02T09:30:00+00:00',
  lastLoginAt: '2026-09-27T08:12:40+00:00',
};







// -----------------------------------------------------------
// inactiveUser
// -----------------------------------------------------------
//
// A deactivated account (it owns nothing, so it could be
// purged).
//
// Used by:
//   - users (below)
// -----------------------------------------------------------

export const inactiveUser = {
  id: ID.lina,
  email: 'lina@example.lt',
  displayName: 'Lina Buvusi',
  role: 'user',
  active: false,
  dailyBudgetUsd: null,
  createdAt: '2026-09-02T09:35:00+00:00',
  lastLoginAt: '2026-09-11T16:20:05+00:00',
};







// -----------------------------------------------------------
// users
// -----------------------------------------------------------
//
// The directory, oldest first as GET /api/users orders it
// (deactivated rows included).
//
// Used by:
//   - handlers.js — GET /api/users
// -----------------------------------------------------------

export const users = [adminUser, plainUser, inactiveUser];







// -----------------------------------------------------------
// me
// -----------------------------------------------------------
//
// The signed-in caller: what GET /api/auth/me answers and
// whose id every create stamps as owner / creator.
//
// Used by:
//   - handlers.js — /api/auth/me, the creates, scope=own
//   - login, queuedJob, budgetOf, usage, estimate, NEW (below)
// -----------------------------------------------------------

export const me = adminUser;







// -----------------------------------------------------------
// ownedBy
// -----------------------------------------------------------
//
// What deleting an account removed — the `removed` counts of
// DELETE /api/users/{id}?purge=true — counted in the fixture
// world as Django counts it: its companies, their reports,
// its documents and its conversations. It reads the lists
// below at call time.
//
// Used by:
//   - handlers.js — the purge's answer
//   - tests/pages/users.test.jsx — the toast it shows
// -----------------------------------------------------------

export function ownedBy(userId) {
  const owned = new Set(companies.filter((row) => row.ownerId === userId).map((row) => row.id));
  return {
    companies: owned.size,
    reports: reports.filter((row) => owned.has(row.companyId)).length,
    documents: companyDocuments.filter((row) => row.ownerId === userId).length,
    threads: threads.filter((row) => row.userId === userId).length,
  };
}







// -----------------------------------------------------------
// user
// -----------------------------------------------------------
//
//   user(ID.jonas) → the account, or undefined
//
// NEW is only touched for its own id: this runs while the
// module is still initialising (llmCall, auditEntries), when
// NEW does not exist yet.
//
// Used by:
//   - handlers.js — /api/users/{id} and its reset-password
//   - budgetOf, llmCall, usage, auditEntries (below)
// -----------------------------------------------------------

export function user(id) {
  return find(users, id) ?? (id === ID.newUser ? NEW.user : undefined);
}







// -----------------------------------------------------------
// SESSION_TOKEN
// -----------------------------------------------------------
//
// The raw bearer a login mints (a uuid4 string; the backend
// keeps only its sha256).
//
// Used by:
//   - login (below)
// -----------------------------------------------------------

export const SESSION_TOKEN = '7e57c0de-0000-4000-8000-000000000001';







// -----------------------------------------------------------
// login
// -----------------------------------------------------------
//
//   login('jonas@example.lt') → { token, user: plainUser }
//
// POST /api/auth/login's answer: the active account with
// that email (case-insensitive), else the administrator —
// the happy path signs anybody in; a refusal (401
// INVALID_CREDENTIALS) is a test's own `given`.
//
// Used by:
//   - handlers.js — POST /api/auth/login
// -----------------------------------------------------------

export function login(email) {
  const key = String(email ?? '').trim().toLowerCase();
  const account = users.find((row) => row.active && row.email === key) ?? me;
  return { token: SESSION_TOKEN, user: account };
}







// UAB Pavyzdys as stored (serialize_company minus ownerName):
// a CASP with a full profile — isPublicSector null is the
// tri-state "nobody said"
const pavyzdysProfile = {
  id: ID.pavyzdys,
  ownerId: ID.jonas,
  name: 'UAB Pavyzdys',
  registrationCode: '300000001',
  country: 'LT',
  legalForm: 'UAB',
  naceCodes: ['66.19', '62.01'],
  sector: 'Kriptoturto paslaugos',
  sizeCategory: 'small',
  employees: 24,
  annualTurnoverEur: 3200000,
  activities: 'Kriptoturto saugojimas ir administravimas klientų vardu, kriptoturto keitimas į lėšas ir į kitą kriptoturtą, pavedimų dėl kriptoturto vykdymas.',
  usesAi: true,
  providesAi: false,
  aiDescription: 'Sandorių stebėsenos sistema naudoja mašininio mokymosi modelį įtartiniems sandoriams žymėti.',
  processesPersonalData: true,
  isPublicSector: null,
  institutionType: 'casp',
  financialMarket: {
    markets: ['Kriptoturto rinka'],
    serviceCategory: 'Kriptoturto saugojimas ir administravimas klientų vardu; kriptoturto keitimas į lėšas',
    institutes: ['Kriptoturto paslaugų teikėjų leidimai ir priežiūra', 'Pinigų plovimo ir teroristų finansavimo prevencija'],
    licenseRequired: true,
    authorisation: 'Kriptoturto paslaugų teikėjo leidimas',
    authority: 'Lietuvos bankas',
    legalBasis: 'MiCA 59 str. 1 d.',
    crossCuttingRegimes: ['DORA', 'PPTFPĮ', 'BDAR'],
    reasoning: 'Bendrovė saugo klientų kriptoturtą ir keičia jį į lėšas — tai kriptoturto paslaugos, kurioms reikia leidimo.',
    citations: ['MiCA 59 str. 1 d.', 'MiCA 75 str.'],
    verified: true,
  },
  attributes: {
    clientTypes: ['mažmeniniai', 'profesionalieji'],
    countries: ['LT', 'LV', 'EE'],
    inferred: { travelRule: { value: true, reason: 'Pervedimai tarp kriptoturto paslaugų teikėjų' } },
  },
  createdAt: '2026-09-03T08:20:00+00:00',
  updatedAt: '2026-09-26T11:30:00+00:00',
};

// UAB Kreditas as stored: a consumer-credit lender with a
// sparse profile (unknown size, unknown AI use)
const kreditasProfile = {
  id: ID.kreditas,
  ownerId: ID.admin,
  name: 'UAB Kreditas',
  registrationCode: '300000002',
  country: 'LT',
  legalForm: 'UAB',
  naceCodes: ['64.92'],
  sector: null,
  sizeCategory: 'unknown',
  employees: null,
  annualTurnoverEur: null,
  activities: 'Vartojimo kreditų teikimas internetu.',
  usesAi: null,
  providesAi: null,
  aiDescription: '',
  processesPersonalData: true,
  isPublicSector: false,
  institutionType: 'consumer_credit',
  financialMarket: null,
  attributes: {},
  createdAt: '2026-09-24T14:05:00+00:00',
  updatedAt: '2026-09-24T14:20:00+00:00',
};

// The credentials (serialize_credential), oldest first: a
// licence the administrator verified against its evidence
// document, and a certificate the company only claims
const credentialRows = [
  {
    id: ID.licence,
    companyId: ID.pavyzdys,
    kind: 'license',
    name: 'Kriptoturto paslaugų teikėjo leidimas',
    issuer: 'Lietuvos bankas',
    identifier: 'KTPT-2026-017',
    validFrom: '2026-07-01',
    validTo: null,
    scope: 'Kriptoturto saugojimas ir administravimas klientų vardu; kriptoturto keitimas į lėšas',
    notes: 'Patikrinta pagal leidimo išrašą.',
    status: 'verified',
    evidenceDocumentId: ID.licenceDoc,
    verifiedBy: ID.admin,
    verifiedAt: '2026-09-10T12:30:00+00:00',
    createdAt: '2026-09-05T10:20:00+00:00',
    updatedAt: '2026-09-10T12:30:00+00:00',
  },
  {
    id: ID.iso27001,
    companyId: ID.pavyzdys,
    kind: 'certificate',
    name: 'ISO/IEC 27001 sertifikatas',
    issuer: 'UAB Sertifikavimo centras',
    identifier: 'ISMS-2025-0042',
    validFrom: '2025-11-15',
    validTo: '2028-11-14',
    scope: 'Informacijos saugumo valdymo sistema',
    notes: 'Įmonė teigia turinti; sertifikato kopija nepateikta.',
    status: 'claimed',
    evidenceDocumentId: null,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: '2026-09-06T08:45:00+00:00',
    updatedAt: '2026-09-06T08:45:00+00:00',
  },
];

// The adopted standards (serialize_standard), oldest first:
// UAB Pavyzdys is certified to ISO/IEC 27001, proved by its
// claimed certificate
const standardRows = [
  {
    id: ID.isoAdoption,
    companyId: ID.pavyzdys,
    documentId: ID.iso27001Standard,
    shortTitle: 'ISO/IEC 27001:2022',
    title: 'Information security, cybersecurity and privacy protection — Information security management systems — Requirements',
    ready: true,
    status: 'certified',
    scope: 'Kriptoturto saugojimo platformos IT paslaugos',
    certificateId: ID.iso27001,
    notes: '',
    createdAt: '2026-09-06T09:00:00+00:00',
    updatedAt: '2026-09-06T09:00:00+00:00',
  },
];

// The role profiles (serialize_role), by name as the detail
// orders them; the compliance officer is the licence
// thread's role
const amlOfficerRole = {
  id: ID.amlOfficer,
  companyId: ID.pavyzdys,
  name: 'AML pareigūnas',
  context: 'Atsakingas už pinigų plovimo ir teroristų finansavimo prevencijos priemonių įgyvendinimą: klientų tapatybės nustatymą, sandorių stebėseną ir pranešimus Finansinių nusikaltimų tyrimo tarnybai. Pavaldus vadovui, kas ketvirtį atsiskaito valdybai.',
  sources: [{ documentId: ID.procedureDoc, title: 'Pinigų plovimo prevencijos procedūra', section: '3 Atsakingi asmenys' }],
  createdBy: ID.jonas,
  createdAt: '2026-09-08T11:00:00+00:00',
  updatedAt: '2026-09-08T11:00:00+00:00',
};
const complianceOfficerRole = {
  id: ID.complianceOfficer,
  companyId: ID.pavyzdys,
  name: 'Atitikties pareigūnas',
  context: 'Vadovauja atitikties funkcijai: vertina atitikties riziką, konsultuoja valdybą, stebi teisės aktų pokyčius ir kas ketvirtį teikia ataskaitą valdybai. Funkcija nepriklausoma nuo verslo padalinių; interesų konfliktai deklaruojami.',
  sources: [{ documentId: ID.policyDoc, title: 'Atitikties politika', section: '7.2 Atitikties pareigūnas' }],
  createdBy: ID.jonas,
  createdAt: '2026-09-08T10:30:00+00:00',
  updatedAt: '2026-09-12T14:10:00+00:00',
};
const roleRows = [amlOfficerRole, complianceOfficerRole];







// -----------------------------------------------------------
// companies
// -----------------------------------------------------------
//
// GET /api/companies's rows (serialize_company without the
// related lists), newest-updated first. ownerName rides on
// every row — the view always select_related("owner").
//
// Used by:
//   - handlers.js — GET /api/companies (q, scope filters)
//   - company (below)
// -----------------------------------------------------------

export const companies = [
  { ...pavyzdysProfile, ownerName: plainUser.displayName },
  { ...kreditasProfile, ownerName: adminUser.displayName },
];







// -----------------------------------------------------------
// company
// -----------------------------------------------------------
//
//   company(ID.pavyzdys) → the detail, or undefined
//
// The detail GET /api/companies/{id} (and PUT, POST) answer:
// the row plus credentials and adopted standards (oldest
// first), roles (by name) and documents (oldest upload
// first, list shape).
//
// Used by:
//   - handlers.js — the company, credential and role routes,
//     the chat thread's company, POST /api/reports
// -----------------------------------------------------------

export function company(id) {
  if (id === ID.newCompany) return NEW.company;
  const row = find(companies, id);
  if (!row) return undefined;
  return {
    ...row,
    credentials: credentialRows.filter((credential) => credential.companyId === id),
    standards: standardRows.filter((adoption) => adoption.companyId === id),
    roles: roleRows.filter((role) => role.companyId === id),
    documents: companyDocuments.filter((doc) => doc.companyId === id)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
  };
}







// The extracted texts, per document; charCount, the outline
// offsets, the text windows and the search hits are all
// derived from them, so they cannot disagree
const DOC_TEXT = {
  [ID.policyDoc]: [
    'I. BENDROSIOS NUOSTATOS',
    '1. Ši politika nustato UAB Pavyzdys atitikties funkcijos tikslus, organizavimą ir atsakomybes.',
    '2. Politika taikoma visiems darbuotojams ir valdybos nariams.',
    'II. ATITIKTIES FUNKCIJA',
    '7. Atitikties funkcija',
    '7.1. Atitikties funkcija yra nepriklausoma nuo verslo padalinių ir tiesiogiai atskaitinga valdybai.',
    '7.2. Atitikties pareigūnas',
    'Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką. Atitikties rizikos vertinimas atliekamas ne rečiau kaip kartą per metus.',
    'III. BAIGIAMOSIOS NUOSTATOS',
    'Politika peržiūrima kasmet ir tvirtinama valdybos sprendimu.',
  ].join('\n'),
  [ID.procedureDoc]: [
    'PINIGŲ PLOVIMO IR TERORISTŲ FINANSAVIMO PREVENCIJOS PROCEDŪRA',
    '1. Paskirtis',
    'Procedūra nustato klientų tapatybės nustatymo, sandorių stebėsenos ir pranešimų teikimo tvarką.',
    '3. Atsakingi asmenys',
    '3.1. Už procedūros įgyvendinimą atsako vadovo paskirtas AML pareigūnas.',
    '5. Sandorių stebėsena',
    '5.1. Įtartini sandoriai žymimi automatiškai ir peržiūrimi per vieną darbo dieną.',
    '5.2. Didelės rizikos klientams taikomas sustiprintas tapatybės nustatymas (PPTFPĮ 9 straipsnio 1 dalis).',
    '5.3. Nuotolinis tapatybės nustatymas atliekamas pagal FNTT direktoriaus įsakymo Nr. V-314 12 punktą.',
    '5.4. Kiti reikalavimai nustatyti PPTFPĮ 22 straipsnio 3 dalyje.',
  ].join('\n'),
  [ID.licenceDoc]: [
    'LIETUVOS BANKO SPRENDIMO IŠRAŠAS',
    'Dėl kriptoturto paslaugų teikėjo leidimo išdavimo UAB Pavyzdys',
    'Leidimo Nr. KTPT-2026-017. Leidimas galioja nuo 2026-07-01.',
    'Leidžiamos paslaugos: kriptoturto saugojimas ir administravimas klientų vardu; kriptoturto keitimas į lėšas.',
    'Leidimas išduotas pagal MiCA 59 straipsnio 1 dalį.',
    'Saugojimo paslauga teikiama laikantis MiCA 66 straipsnio 4 dalies.',
    'Skundų nagrinėjimo tvarka turi atitikti MiCA 82a straipsnį.',
  ].join('\n'),
  [ID.registerDoc]: [
    'Data;Incidentas;Klasifikacija;Pranešta priežiūros institucijai',
    '2026-08-14;Mokėjimų sąsajos sutrikimas 2 val.;Didelis;Taip, per 4 val.',
    '2026-09-02;Nepavykęs prisijungimas prie administravimo sistemos;Nedidelis;Ne',
  ].join('\n'),
  [ID.complaintsDoc]: [
    'KLIENTŲ SKUNDŲ NAGRINĖJIMO TVARKA',
    '1. Skundai priimami raštu arba el. paštu.',
    '2. Į skundą atsakoma ne vėliau kaip per 15 darbo dienų.',
  ].join('\n'),
  [ID.newDocument]: [
    'KLIENTŲ INFORMAVIMO TVARKA',
    '1. Prieš sudarant sutartį klientui pateikiama paslaugų kainodara.',
  ].join('\n'),
};

// The evidence inventories (companies/inventory.py SCHEMA)
// the analyses read; documents without one were uploaded
// later or never analysed. Every quote is verbatim from
// DOC_TEXT — the citations' too (the references the
// procedure and the licence extract make to specific
// provisions, which the finished report's audit checked)
const INVENTORY = {
  [ID.policyDoc]: {
    documentType: 'policy',
    summary: 'Atitikties funkcijos politika: atitikties pareigūno pavaldumas, nepriklausomumas ir ketvirtinės ataskaitos valdybai. Taikoma visiems darbuotojams ir valdybos nariams.',
    scope: 'Visi darbuotojai ir valdybos nariai',
    controls: [
      { name: 'Atitikties rizikos vertinimas', description: 'Atitikties rizika vertinama bent kartą per metus.', quote: 'Atitikties rizikos vertinimas atliekamas ne rečiau kaip kartą per metus.' },
      { name: 'Ataskaitos valdybai', description: 'Atitikties pareigūnas kas ketvirtį atsiskaito valdybai.', quote: 'Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką.' },
    ],
    roles: ['Valdyba', 'Atitikties pareigūnas'],
    registers: ['Atitikties rizikų registras'],
    approval: 'Tvirtinama valdybos sprendimu',
    reviewCycle: 'Kasmet',
    lawsReferenced: ['MiCA', 'PPTFPĮ'],
    citations: [],
    weaknesses: ['Nenurodyta, kas pavaduoja atitikties pareigūną jo nesant.'],
  },
  [ID.procedureDoc]: {
    documentType: 'procedure',
    summary: 'Pinigų plovimo ir teroristų finansavimo prevencijos procedūra: klientų tapatybės nustatymas, sandorių stebėsena ir pranešimai.',
    scope: 'Visi klientai ir sandoriai',
    controls: [
      { name: 'Atsakingas asmuo', description: 'Vadovas paskiria AML pareigūną.', quote: 'Už procedūros įgyvendinimą atsako vadovo paskirtas AML pareigūnas.' },
      { name: 'Įtartinų sandorių peržiūra', description: 'Automatiškai pažymėti sandoriai peržiūrimi per vieną darbo dieną.', quote: 'Įtartini sandoriai žymimi automatiškai ir peržiūrimi per vieną darbo dieną.' },
    ],
    roles: ['Vadovas', 'AML pareigūnas'],
    registers: ['Įtartinų sandorių žurnalas'],
    approval: '',
    reviewCycle: '',
    lawsReferenced: ['PPTFPĮ', 'FNTT įsakymas Nr. V-314'],
    citations: [
      { act: 'PPTFPĮ', article: '9', paragraph: '1', point: '', claim: 'Didelės rizikos klientams taikomas sustiprintas tapatybės nustatymas.', quote: 'Didelės rizikos klientams taikomas sustiprintas tapatybės nustatymas (PPTFPĮ 9 straipsnio 1 dalis).' },
      { act: 'FNTT direktoriaus įsakymas Nr. V-314', article: '12', paragraph: '', point: '', claim: 'Nuotolinio tapatybės nustatymo tvarka.', quote: 'Nuotolinis tapatybės nustatymas atliekamas pagal FNTT direktoriaus įsakymo Nr. V-314 12 punktą.' },
      { act: 'PPTFPĮ', article: '22', paragraph: '3', point: '', claim: 'Kiti reikalavimai.', quote: 'Kiti reikalavimai nustatyti PPTFPĮ 22 straipsnio 3 dalyje.' },
    ],
    weaknesses: ['Nenustatyta, kaip dokumentuojami atmesti įspėjimai.'],
  },
  [ID.licenceDoc]: {
    documentType: 'other',
    summary: 'Lietuvos banko sprendimo išrašas dėl kriptoturto paslaugų teikėjo leidimo Nr. KTPT-2026-017.',
    scope: 'Kriptoturto saugojimas ir administravimas; keitimas į lėšas',
    controls: [],
    roles: [],
    registers: [],
    approval: 'Lietuvos banko sprendimas',
    reviewCycle: '',
    lawsReferenced: ['MiCA'],
    citations: [
      { act: 'MiCA', article: '59', paragraph: '1', point: '', claim: 'Kriptoturto paslaugas galima teikti tik gavus leidimą.', quote: 'Leidimas išduotas pagal MiCA 59 straipsnio 1 dalį.' },
      { act: 'MiCA', article: '66', paragraph: '4', point: '', claim: 'Klientų kriptoturto saugojimas ir administravimas.', quote: 'Saugojimo paslauga teikiama laikantis MiCA 66 straipsnio 4 dalies.' },
      { act: 'MiCA', article: '82a', paragraph: '', point: '', claim: 'Klientų skundų nagrinėjimo tvarka.', quote: 'Skundų nagrinėjimo tvarka turi atitikti MiCA 82a straipsnį.' },
    ],
    weaknesses: [],
  },
  [ID.registerDoc]: {
    documentType: 'register',
    summary: 'Su IRT susijusių incidentų registras: data, aprašymas, klasifikacija ir ar pranešta priežiūros institucijai.',
    scope: 'IRT incidentai nuo 2026 m. rugpjūčio',
    controls: [
      { name: 'Incidentų registravimas', description: 'Kiekvienas incidentas įrašomas su klasifikacija.', quote: '2026-08-14;Mokėjimų sąsajos sutrikimas 2 val.;Didelis;Taip, per 4 val.' },
    ],
    roles: [],
    registers: ['IRT incidentų registras'],
    approval: '',
    reviewCycle: '',
    lawsReferenced: [],
    citations: [],
    weaknesses: ['Nėra patvirtintos incidentų klasifikavimo ir pranešimo procedūros.'],
  },
};

// The outlines build_outline finds in DOC_TEXT: [line as
// written, title, level] per heading; offsets computed
const OUTLINE_LINES = {
  [ID.policyDoc]: [
    ['I. BENDROSIOS NUOSTATOS', 'I. BENDROSIOS NUOSTATOS', 1],
    ['II. ATITIKTIES FUNKCIJA', 'II. ATITIKTIES FUNKCIJA', 1],
    ['7. Atitikties funkcija', '7 Atitikties funkcija', 1],
    ['7.2. Atitikties pareigūnas', '7.2 Atitikties pareigūnas', 2],
    ['III. BAIGIAMOSIOS NUOSTATOS', 'III. BAIGIAMOSIOS NUOSTATOS', 1],
  ],
  [ID.procedureDoc]: [
    ['PINIGŲ PLOVIMO IR TERORISTŲ FINANSAVIMO PREVENCIJOS PROCEDŪRA', 'PINIGŲ PLOVIMO IR TERORISTŲ FINANSAVIMO PREVENCIJOS PROCEDŪRA', 1],
    ['1. Paskirtis', '1 Paskirtis', 1],
    ['3. Atsakingi asmenys', '3 Atsakingi asmenys', 1],
    ['5. Sandorių stebėsena', '5 Sandorių stebėsena', 1],
  ],
  [ID.licenceDoc]: [['LIETUVOS BANKO SPRENDIMO IŠRAŠAS', 'LIETUVOS BANKO SPRENDIMO IŠRAŠAS', 1]],
  [ID.complaintsDoc]: [['KLIENTŲ SKUNDŲ NAGRINĖJIMO TVARKA', 'KLIENTŲ SKUNDŲ NAGRINĖJIMO TVARKA', 1]],
  [ID.newDocument]: [['KLIENTŲ INFORMAVIMO TVARKA', 'KLIENTŲ INFORMAVIMO TVARKA', 1]],
};

// The document rows before the derived fields: the policy,
// procedure, licence extract and register UAB Pavyzdys
// analysed, a contract still extracting, UAB Kreditas'
// scanned rules (no text) and a file dropped into the chat
// before any company existed
const documentBase = [
  { id: ID.contractDoc, ownerId: ID.jonas, companyId: ID.pavyzdys, title: 'IT paslaugų užsakomųjų paslaugų sutartis', kind: 'contract', mime: 'application/pdf', size: 312004, sha256: '89a9397ac851b91efad23ad82d2d77dc1cb65f52be5ba280f01f41cc1d68dd49', extractionStatus: 'pending', extractionError: null, indexedAt: null, uploadedAt: '2026-09-27T09:58:30+00:00' },
  { id: ID.complaintsDoc, ownerId: ID.admin, companyId: null, title: 'Klientų skundų nagrinėjimo tvarka', kind: 'other', mime: 'text/markdown', size: 142, sha256: 'a265d41837187f06dfc041a061e0d1a295ac28427a9825367d9a4c4415d1f9fa', extractionStatus: 'done', extractionError: null, indexedAt: '2026-09-26T13:10:09+00:00', uploadedAt: '2026-09-26T13:10:00+00:00' },
  { id: ID.scanDoc, ownerId: ID.admin, companyId: ID.kreditas, title: 'Kreditavimo taisyklės (skenuota kopija)', kind: 'policy', mime: 'application/pdf', size: 2211840, sha256: '3243197b7b22e8c598c85ef080acf75c97c3412e75861587a3fa9c7dc43c8586', extractionStatus: 'empty', extractionError: null, indexedAt: null, uploadedAt: '2026-09-24T14:18:00+00:00' },
  { id: ID.registerDoc, ownerId: ID.jonas, companyId: ID.pavyzdys, title: 'IRT incidentų registras', kind: 'register', mime: 'text/csv', size: 247, sha256: '8a0ce3d7688164a6e8b2c2b8e2ede9822cfa880e52eb721ebbac79f7cc7efe45', extractionStatus: 'done', extractionError: null, indexedAt: '2026-09-15T13:11:20+00:00', uploadedAt: '2026-09-15T13:11:02+00:00' },
  { id: ID.licenceDoc, ownerId: ID.jonas, companyId: ID.pavyzdys, title: 'Leidimo išrašas', kind: 'other', mime: 'application/pdf', size: 48122, sha256: '9841a11757162a05827162df33ee1ed469b86973bedd9f4d9f7e1c7538c3587b', extractionStatus: 'done', extractionError: null, indexedAt: '2026-09-05T10:21:10+00:00', uploadedAt: '2026-09-05T10:19:55+00:00' },
  { id: ID.procedureDoc, ownerId: ID.jonas, companyId: ID.pavyzdys, title: 'Pinigų plovimo prevencijos procedūra', kind: 'procedure', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 96256, sha256: 'c11e9c7ac83900e101c337d321f1050d8cd93c3e6de332da828eb2a3b7ba424d', extractionStatus: 'done', extractionError: null, indexedAt: '2026-09-05T10:06:40+00:00', uploadedAt: '2026-09-05T10:05:03+00:00' },
  { id: ID.policyDoc, ownerId: ID.jonas, companyId: ID.pavyzdys, title: 'Atitikties politika', kind: 'policy', mime: 'application/pdf', size: 184320, sha256: 'e5f8b5273e2b1563b3be9cc5c00680b76b5a2c0a8139044d608a85481c481254', extractionStatus: 'done', extractionError: null, indexedAt: '2026-09-05T10:02:31+00:00', uploadedAt: '2026-09-05T10:01:12+00:00' },
];







// -----------------------------------------------------------
// companyDocuments
// -----------------------------------------------------------
//
// GET /api/documents's rows (serialize_document, text and
// outline deferred), newest upload first: charCount from the
// text, documentType / inventorySummary from the inventory
// (null where none was read yet).
//
// Used by:
//   - handlers.js — GET /api/documents (companyId, q, scope)
//   - company, companyDocument, the report snapshots
//     (above/below)
// -----------------------------------------------------------

export const companyDocuments = documentBase.map((doc) => ({
  id: doc.id,
  ownerId: doc.ownerId,
  companyId: doc.companyId,
  title: doc.title,
  kind: doc.kind,
  mime: doc.mime,
  size: doc.size,
  sha256: doc.sha256,
  charCount: (DOC_TEXT[doc.id] ?? '').length,
  extractionStatus: doc.extractionStatus,
  extractionError: doc.extractionError,
  indexedAt: doc.indexedAt,
  uploadedAt: doc.uploadedAt,
  documentType: INVENTORY[doc.id]?.documentType ?? null,
  inventorySummary: INVENTORY[doc.id]?.summary ?? null,
}));







// -----------------------------------------------------------
// companyDocument
// -----------------------------------------------------------
//
//   companyDocument(ID.policyDoc) → the detail, or undefined
//
// GET /api/documents/{id}: the row plus the full evidence
// inventory (null when none) and the outline ([{title,
// level, offset}], [] for a text without headings).
//
// Used by:
//   - handlers.js — /api/documents/{id} (GET, PATCH, DELETE)
// -----------------------------------------------------------

export function companyDocument(id) {
  const row = find(companyDocuments, id) ?? (id === ID.newDocument ? NEW.document : undefined);
  if (!row) return undefined;
  const text = DOC_TEXT[id] ?? '';
  return {
    ...row,
    inventory: INVENTORY[id] ?? null,
    outline: (OUTLINE_LINES[id] ?? []).map(([line, title, level]) => ({ title, level, offset: text.indexOf(line) })),
  };
}







// -----------------------------------------------------------
// documentText
// -----------------------------------------------------------
//
//   documentText(ID.policyDoc, 0, 20000) → { id, title, offset,
//                                           limit, total,
//                                           extractionStatus,
//                                           text }
//
// A window of the extracted text; total is the whole
// document's charCount, so a reader knows when to stop.
//
// Used by:
//   - handlers.js — GET /api/documents/{id}/text
// -----------------------------------------------------------

export function documentText(id, offset = 0, limit = 20000) {
  const row = companyDocument(id);
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    offset,
    limit,
    total: row.charCount,
    extractionStatus: row.extractionStatus,
    text: (DOC_TEXT[id] ?? '').slice(offset, offset + limit),
  };
}







// -----------------------------------------------------------
// documentHits
// -----------------------------------------------------------
//
// GET /api/documents/search's hits for a question about the
// compliance officer: the passages under their headings,
// charStart where each window begins (the drawer opens the
// text there), RRF scores.
//
// Used by:
//   - handlers.js — GET /api/documents/search
// -----------------------------------------------------------

export const documentHits = [
  [ID.policyDoc, 'Atitikties politika', 'c4000000-0000-4000-8000-000000000001', '7.2. Atitikties pareigūnas', '7.2 Atitikties pareigūnas', 0.03279],
  [ID.procedureDoc, 'Pinigų plovimo prevencijos procedūra', 'c4000000-0000-4000-8000-000000000002', '3. Atsakingi asmenys', '3 Atsakingi asmenys', 0.01613],
].map(([documentId, title, chunkId, line, heading, score]) => ({
  documentId,
  title,
  companyId: ID.pavyzdys,
  chunkId,
  heading,
  charStart: DOC_TEXT[documentId].indexOf(line),
  text: DOC_TEXT[documentId].slice(DOC_TEXT[documentId].indexOf(line)),
  score,
}));







// -----------------------------------------------------------
// judged
// -----------------------------------------------------------
//
// One obligation's `verification` as the judge's run of
// 2026-09-26 stored it: the verdict, what is off ("none" and
// an empty note for a supported one), the second model that
// judged — not the one that extracted — its prompt version,
// and the stamp. The judge's prompt is not among this
// world's prompt rows: the prompts page predates it.
//
// Used by:
//   - obligations (below)
// -----------------------------------------------------------

function judged(verdict, issue = 'none', note = '') {
  return {
    verdict, issue, note, model: 'gateway:azure/gpt-5.5', promptVersionId: 'f1000000-0000-4000-8000-00000000000c',
    checkedAt: '2026-09-26T10:12:00+00:00',
  };
}







// -----------------------------------------------------------
// obligations
// -----------------------------------------------------------
//
// GET /api/obligations's rows (serialize_obligation), in the
// view's order: by the act's short title, then created —
// three proposed, five approved, one rejected, and one
// "standard" obligation an admin entered without an act.
// The MiCA ones still point at version 1 (version 2 was
// never extracted); documentTitle is the act's short title.
// Each carries what the judge made of it (`verification`,
// corpus/verify.py): the AI Act's one unsupported, DORA's
// two only partly supported — a deadline that is not in the
// provision, two duties merged — the MiCA and PPTFPĮ ones
// supported, and two never judged: the consumer credit one,
// extracted after the judge's run, and the standard one,
// which has no act to be compared with.
//
// Used by:
//   - handlers.js — /api/obligations (filters, the review
//     order, review, PATCH)
//   - acts, the reports (below) — counts and findings
// -----------------------------------------------------------

export const obligations = [
  {
    id: ID.obAiRisk, sourceKind: 'legal', documentId: ID.aiAct, documentTitle: 'DI aktas', versionId: ID.aiActV1, unitId: ID.aiArt6Par2,
    title: 'Įvertinti, ar naudojama DI sistema yra didelės rizikos',
    titleEn: 'Assess whether the AI system in use is high-risk',
    text: 'Diegėjas įvertina, ar jo naudojama DI sistema priskiriama III priede nurodytoms didelės rizikos DI sistemoms, ir, jei taip, vykdo diegėjams taikomas pareigas.',
    textEn: 'A deployer assesses whether the AI system it uses falls under the high-risk systems listed in Annex III and, if so, meets the deployer obligations.',
    addressee: 'DI sistemos diegėjas', conditions: 'Naudojama DI sistema', appliesTo: ['all'], category: 'ai_governance',
    evidence: 'DI sistemų sąrašas su rizikos vertinimu', deadline: '', severity: 'medium',
    citations: [{ unitId: ID.aiArt6Par2, path: '6 str. 2 d.' }], status: 'proposed', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: null, reviewedAt: null, createdAt: '2026-09-05T09:19:40+00:00', updatedAt: '2026-09-05T09:19:40+00:00',
    verification: judged('unsupported', 'duty', 'Article 6(2) says which AI systems count as high-risk; it puts no duty on a deployer to assess its own system. The obligation as worded is not in the cited provision.'),
  },
  {
    id: ID.obIncidentReport, sourceKind: 'legal', documentId: ID.dora, documentTitle: 'DORA', versionId: ID.doraV1, unitId: ID.doraArt19Par1,
    title: 'Pranešti apie didelius su IRT susijusius incidentus',
    titleEn: 'Report major ICT-related incidents',
    text: 'Finansų subjektas praneša kompetentingai institucijai apie didelius su IRT susijusius incidentus nustatytais terminais ir forma.',
    textEn: 'A financial entity reports major ICT-related incidents to the competent authority within the set time limits and form.',
    addressee: 'Finansų subjektas', conditions: 'Įvyko didelis su IRT susijęs incidentas', appliesTo: ['bank', 'casp', 'emi', 'investment_firm', 'payment_institution'], category: 'incident_reporting',
    evidence: 'Incidentų pranešimo procedūra; incidentų registras; pateikti pranešimai', deadline: 'Pradinis pranešimas per 4 val. nuo incidento klasifikavimo', severity: 'high',
    citations: [{ unitId: ID.doraArt19Par1, path: '19 str. 1 d.' }], status: 'proposed', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: null, reviewedAt: null, createdAt: '2026-09-05T09:01:10+00:00', updatedAt: '2026-09-05T09:01:10+00:00',
    verification: judged('partly', 'deadline', 'Article 19(1) requires major ICT-related incidents to be reported to the competent authority, but it sets no four-hour limit: the time limits come from the delegated act, which is not cited.'),
  },
  {
    id: ID.obRegister, sourceKind: 'legal', documentId: ID.dora, documentTitle: 'DORA', versionId: ID.doraV1, unitId: ID.doraArt28Par3,
    title: 'Tvarkyti IRT paslaugų sutarčių informacijos registrą',
    titleEn: 'Maintain the register of information on ICT service contracts',
    text: 'Finansų subjektas tvarko ir atnaujina informacijos registrą apie visus sutartinius susitarimus dėl IRT paslaugų, kurias teikia IRT trečiųjų šalių paslaugų teikėjai.',
    textEn: 'A financial entity maintains and updates a register of information on all contractual arrangements for ICT services provided by ICT third-party service providers.',
    addressee: 'Finansų subjektas', conditions: 'Naudojamos IRT trečiųjų šalių paslaugos', appliesTo: ['bank', 'casp', 'emi', 'investment_firm', 'payment_institution'], category: 'outsourcing',
    evidence: 'Informacijos registras; IRT paslaugų sutarčių sąrašas', deadline: 'Nuolat; teikiamas priežiūros institucijai jos prašymu', severity: 'medium',
    citations: [{ unitId: ID.doraArt28Par3, path: '28 str. 3 d.' }], status: 'proposed', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: null, reviewedAt: null, createdAt: '2026-09-05T09:01:12+00:00', updatedAt: '2026-09-05T09:01:12+00:00',
    verification: judged('partly', 'merged', 'Two duties of Article 28(3) are joined into one: keeping the register of information up to date, and making it available to the competent authority on request. Split them, or the gap analysis judges both as one.'),
  },
  {
    id: ID.obLicence, sourceKind: 'legal', documentId: ID.mica, documentTitle: 'MiCA', versionId: ID.micaV1, unitId: ID.micaV1Art59Par1,
    title: 'Gauti kriptoturto paslaugų teikėjo leidimą',
    titleEn: 'Obtain authorisation as a crypto-asset service provider',
    text: 'Kriptoturto paslaugas Sąjungoje galima teikti tik gavus kompetentingos institucijos leidimą veikti kaip kriptoturto paslaugų teikėjas.',
    textEn: 'Crypto-asset services may be provided in the Union only after authorisation as a crypto-asset service provider by the competent authority.',
    addressee: 'Kriptoturto paslaugų teikėjas', conditions: 'Teikiamos kriptoturto paslaugos Sąjungoje', appliesTo: ['casp'], category: 'licensing',
    evidence: 'Kompetentingos institucijos sprendimas išduoti leidimą; įrašas kriptoturto paslaugų teikėjų sąraše', deadline: 'Prieš pradedant teikti paslaugas', severity: 'critical',
    citations: [{ unitId: ID.micaV1Art59Par1, path: '59 str. 1 d.' }], status: 'approved', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: ID.admin, reviewedAt: '2026-09-06T09:10:00+00:00', createdAt: '2026-09-05T08:38:40+00:00', updatedAt: '2026-09-06T09:10:00+00:00',
    verification: judged('supported'),
  },
  {
    id: ID.obSafeguarding, sourceKind: 'legal', documentId: ID.mica, documentTitle: 'MiCA', versionId: ID.micaV1, unitId: ID.micaV1Art70Par1,
    title: 'Apsaugoti klientų kriptoturtą ir lėšas',
    titleEn: "Safeguard clients' crypto-assets and funds",
    text: 'Kriptoturto paslaugų teikėjas, turintis klientų kriptoturtą ar prieigos prie jo priemones, taiko priemones klientų nuosavybės teisėms apsaugoti ir nenaudoja klientų kriptoturto savo sąskaita.',
    textEn: "A crypto-asset service provider holding clients' crypto-assets or the means of access to them protects the clients' ownership rights and does not use the crypto-assets for its own account.",
    addressee: 'Kriptoturto paslaugų teikėjas', conditions: 'Laikomas klientų kriptoturtas ar prieigos prie jo priemonės', appliesTo: ['casp'], category: 'safeguarding',
    evidence: 'Klientų turto apsaugos politika; atskirų piniginių ir sąskaitų sąrašas', deadline: 'Nuolat', severity: 'high',
    citations: [{ unitId: ID.micaV1Art70Par1, path: '70 str. 1 d.' }], status: 'approved', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: ID.admin, reviewedAt: '2026-09-06T09:12:00+00:00', createdAt: '2026-09-05T08:38:44+00:00', updatedAt: '2026-09-06T09:12:00+00:00',
    verification: judged('supported'),
  },
  {
    id: ID.obFeeDisclosure, sourceKind: 'legal', documentId: ID.mica, documentTitle: 'MiCA', versionId: ID.micaV1, unitId: ID.micaV1Art66Par4,
    title: 'Skelbti kainodarą interneto svetainėje',
    titleEn: 'Publish pricing on the website',
    text: 'Kriptoturto paslaugų teikėjas savo interneto svetainėje skelbia kainodarą, išlaidas ir mokesčius.',
    textEn: 'A crypto-asset service provider publishes its pricing, costs and fees on its website.',
    addressee: 'Kriptoturto paslaugų teikėjas', conditions: '', appliesTo: ['casp'], category: 'disclosure',
    evidence: 'Kainodaros puslapis', deadline: 'Nuolat', severity: 'low',
    citations: [{ unitId: ID.micaV1Art66Par4, path: '66 str. 4 d.' }], status: 'rejected', model: 'gateway:azure/gpt-5.6-terra', notes: 'Dubliuoja bendrąją informavimo pareigą.',
    reviewedBy: ID.admin, reviewedAt: '2026-09-06T09:14:00+00:00', createdAt: '2026-09-05T08:38:47+00:00', updatedAt: '2026-09-06T09:14:00+00:00',
    verification: judged('supported'),
  },
  {
    id: ID.obAmlOfficer, sourceKind: 'legal', documentId: ID.aml, documentTitle: 'PPTFPĮ', versionId: ID.amlV1, unitId: ID.amlArt22Par3,
    title: 'Paskirti už pinigų plovimo prevenciją atsakingą vadovą',
    titleEn: 'Appoint a manager responsible for anti-money laundering',
    text: 'Finansų įstaiga paskiria vadovaujančias pareigas einantį darbuotoją, atsakingą už pinigų plovimo ir teroristų finansavimo prevencijos priemonių įgyvendinimą.',
    textEn: 'A financial institution appoints a senior employee responsible for implementing the anti-money-laundering and counter-terrorist-financing measures.',
    addressee: 'Finansų įstaiga', conditions: '', appliesTo: ['all'], category: 'aml_kyc',
    evidence: 'Vadovo įsakymas dėl paskyrimo; pareigybės aprašymas', deadline: 'Nuolat', severity: 'high',
    citations: [{ unitId: ID.amlArt22Par3, path: '22 str. 3 d.' }], status: 'approved', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: ID.admin, reviewedAt: '2026-09-06T09:20:00+00:00', createdAt: '2026-09-05T09:40:58+00:00', updatedAt: '2026-09-06T09:20:00+00:00',
    verification: judged('supported'),
  },
  {
    id: ID.obCorrespondent, sourceKind: 'legal', documentId: ID.aml, documentTitle: 'PPTFPĮ', versionId: ID.amlV1, unitId: ID.amlArt14Par3,
    title: 'Taikyti sustiprintą tapatybės nustatymą korespondentiniams santykiams',
    titleEn: 'Apply enhanced due diligence to correspondent relationships',
    text: 'Užmezgant korespondentinius santykius su trečiųjų valstybių respondentėmis įstaigomis taikomos sustiprintos kliento tapatybės nustatymo priemonės.',
    textEn: 'Enhanced customer due diligence measures apply when establishing correspondent relationships with respondent institutions from third countries.',
    addressee: 'Finansų įstaiga', conditions: 'Užmezgami korespondentiniai santykiai', appliesTo: ['all'], category: 'aml_kyc',
    evidence: 'Korespondentinių santykių vertinimo tvarka', deadline: 'Prieš užmezgant santykius', severity: 'low',
    citations: [{ unitId: ID.amlArt14Par3, path: '14 str. 3 d.' }], status: 'approved', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: ID.admin, reviewedAt: '2026-09-06T09:21:00+00:00', createdAt: '2026-09-05T09:41:02+00:00', updatedAt: '2026-09-06T09:21:00+00:00',
    verification: judged('supported'),
  },
  {
    id: ID.obCreditworthiness, sourceKind: 'legal', documentId: ID.consumerCredit, documentTitle: 'VKĮ', versionId: ID.consumerCreditV1, unitId: ID.vkiArt17Par1,
    title: 'Įvertinti vartotojo kreditingumą',
    titleEn: "Assess the consumer's creditworthiness",
    text: 'Kreditorius prieš sudarydamas vartojimo kredito sutartį įvertina vartotojo kreditingumą, remdamasis pakankama informacija.',
    textEn: "Before concluding a consumer credit agreement the creditor assesses the consumer's creditworthiness on the basis of sufficient information.",
    addressee: 'Kreditorius', conditions: 'Sudaroma vartojimo kredito sutartis', appliesTo: ['consumer_credit'], category: 'customer_protection',
    evidence: 'Kreditingumo vertinimo tvarka; vertinimų įrašai', deadline: 'Prieš sudarant sutartį', severity: 'high',
    citations: [{ unitId: ID.vkiArt17Par1, path: '17 str. 1 d.' }], status: 'proposed', model: 'gateway:azure/gpt-5.6-terra', notes: '',
    reviewedBy: null, reviewedAt: null, createdAt: '2026-09-24T14:35:50+00:00', updatedAt: '2026-09-24T14:35:50+00:00',
    verification: null,
  },
  {
    id: ID.obStandard, sourceKind: 'standard', documentId: null, documentTitle: null, versionId: null, unitId: null,
    title: 'Kasmet atnaujinti informacijos saugumo rizikos vertinimą',
    titleEn: 'Update the information security risk assessment every year',
    text: 'Informacijos saugumo rizikos vertinimas atnaujinamas bent kartą per metus ir po kiekvieno reikšmingo pokyčio.',
    textEn: 'The information security risk assessment is updated at least yearly and after every significant change.',
    addressee: '', conditions: '', appliesTo: ['all'], category: 'risk_management',
    evidence: 'Rizikos vertinimo ataskaita', deadline: 'Kasmet', severity: 'medium',
    citations: [], status: 'approved', model: '', notes: 'ISO/IEC 27001 praktika',
    reviewedBy: ID.admin, reviewedAt: '2026-09-08T12:00:00+00:00', createdAt: '2026-09-08T12:00:00+00:00', updatedAt: '2026-09-08T12:00:00+00:00',
    verification: null,
  },
];







// The EUR-Lex address of a CELEX number (Lithuanian text) —
// the acts' source pages and citation_url's base
const EUR_LEX = 'https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:';

// The provisions' texts (paraphrased, not the official
// wording), shared by the units, hits and chat answers
const LAW = {
  micaRecital76: 'Kriptoturto paslaugas Sąjungoje turėtų būti leidžiama teikti tik juridiniams asmenims, kurių registruota buveinė yra valstybėje narėje ir kurie gavo kompetentingos institucijos leidimą.',
  mica2: '1. Šis reglamentas taikomas fiziniams ir juridiniams asmenims bei kitoms įmonėms, kurie Sąjungoje užsiima kriptoturto išleidimu, siūlymu visuomenei ir įtraukimu į prekybą arba teikia su kriptoturtu susijusias paslaugas.',
  mica59Par1: 'Asmuo Sąjungoje teikia kriptoturto paslaugas tik tuo atveju, jei jis yra juridinis asmuo ar kita įmonė, gavę leidimą veikti kaip kriptoturto paslaugų teikėjas pagal 63 straipsnį, arba kitas šiame reglamente nurodytas subjektas.',
  mica59Par2: 'Kriptoturto paslaugų teikėjai, gavę leidimą pagal 63 straipsnį, turi registruotą buveinę valstybėje narėje, kurioje vykdo bent dalį savo kriptoturto paslaugų veiklos, o jų faktinė vadovybė yra Sąjungoje.',
  mica66Par4: 'Kriptoturto paslaugų teikėjai savo interneto svetainėje aiškiai skelbia savo kainodarą, išlaidas ir mokesčius.',
  mica70Par1: 'Kriptoturto paslaugų teikėjai, turintys klientams priklausantį kriptoturtą ar prieigos prie jo priemones, taiko tinkamas priemones klientų nuosavybės teisėms apsaugoti, ypač nemokumo atveju, ir užkerta kelią klientų kriptoturto naudojimui savo sąskaita.',
  mica75Par1: 'Kriptoturto paslaugų teikėjai, teikiantys kriptoturto saugojimo ir administravimo klientų vardu paslaugas, sudaro su klientais sutartį, kurioje nustatomos šalių pareigos ir atsakomybė.',
  dora2: '1. Šis reglamentas taikomas finansų subjektams, įskaitant kredito įstaigas, mokėjimo įstaigas, elektroninių pinigų įstaigas ir kriptoturto paslaugų teikėjus, gavusius leidimą pagal Reglamentą (ES) 2023/1114.',
  dora19Par1: 'Finansų subjektai praneša atitinkamai kompetentingai institucijai apie didelius su IRT susijusius incidentus, laikydamiesi nustatytų terminų ir pranešimų formų.',
  dora28Par3: 'Finansų subjektai tvarko ir atnaujina informacijos registrą apie visus sutartinius susitarimus dėl IRT paslaugų, kurias teikia IRT trečiųjų šalių paslaugų teikėjai.',
  ai6Par2: 'Be 1 dalyje nurodytų didelės rizikos DI sistemų, didelės rizikos DI sistemomis laikomos ir III priede nurodytos DI sistemos.',
  aiAnnex3: '5. Galimybė naudotis būtinosiomis privačiosiomis ir viešosiomis paslaugomis: b) DI sistemos, skirtos fizinių asmenų kreditingumui vertinti arba jų kredito balui nustatyti, išskyrus sistemas, naudojamas finansiniam sukčiavimui nustatyti.',
  aml9Par1: 'Finansų įstaigos privalo nustatyti kliento ir naudos gavėjo tapatybę prieš užmezgant dalykinius santykius arba prieš atliekant atsitiktinius sandorius.',
  aml14Par3: 'Užmezgant korespondentinius santykius su trečiųjų valstybių respondentėmis įstaigomis taikomos sustiprintos kliento tapatybės nustatymo priemonės.',
  aml22Par3: 'Finansų įstaigos paskiria vadovaujančias pareigas einantį darbuotoją, atsakingą už pinigų plovimo ir teroristų finansavimo prevencijos priemonių įgyvendinimą.',
  tfr4: '1. Mokėtojo mokėjimo paslaugų teikėjas užtikrina, kad prie lėšų pervedimų būtų pridedama informacija apie mokėtoją.',
  vki17Par1: 'Kreditorius, prieš sudarydamas vartojimo kredito sutartį, privalo įvertinti vartotojo kreditingumą, remdamasis pakankama informacija.',
};

// Every stored version (serialize_version), keyed by id
const legalVersions = {
  [ID.micaV1]: { id: ID.micaV1, versionNo: 1, status: 'ready', error: null, contentType: 'application/xhtml+xml', sourceUrl: 'https://publications.europa.eu/resource/celex/32023R1114', effectiveDate: '2023-06-29', label: '32023R1114', parser: 'eu_xhtml', obligationsExtractedAt: '2026-09-05T08:40:12+00:00', charCount: 1058870, unitCount: 1506, articleCount: 149, chunkCount: 630, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: '6997983c05261c37e09fa9239aa979010f9f74fdd60e7e03f4cfc97cb928f2a7', createdAt: '2026-09-04T07:31:05+00:00' },
  [ID.micaV2]: { id: ID.micaV2, versionNo: 2, status: 'ready', error: null, contentType: 'application/xhtml+xml', sourceUrl: 'https://publications.europa.eu/resource/celex/02023R1114-20240109', effectiveDate: '2024-01-09', label: '02023R1114-20240109', parser: 'eu_xhtml', obligationsExtractedAt: null, charCount: 1063422, unitCount: 1512, articleCount: 149, chunkCount: 634, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: '4a2f18901d2945c3fe55f5e6d3de693e9f5b5da5844f0cb004c2c5cb2e1a0f83', createdAt: '2026-09-24T07:05:40+00:00' },
  [ID.doraV1]: { id: ID.doraV1, versionNo: 1, status: 'ready', error: null, contentType: 'application/xhtml+xml', sourceUrl: 'https://publications.europa.eu/resource/celex/32022R2554', effectiveDate: '2025-01-17', label: '32022R2554', parser: 'eu_xhtml', obligationsExtractedAt: '2026-09-05T09:02:40+00:00', charCount: 612804, unitCount: 902, articleCount: 64, chunkCount: 355, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: '7a34d01e38fff59f8e863a2d2174ab9f7d0c9c22de5392213f80360810c63850', createdAt: '2026-09-04T07:33:10+00:00' },
  [ID.aiActV1]: { id: ID.aiActV1, versionNo: 1, status: 'ready', error: null, contentType: 'application/xhtml+xml', sourceUrl: 'https://publications.europa.eu/resource/celex/32024R1689', effectiveDate: '2024-08-01', label: '32024R1689', parser: 'eu_xhtml', obligationsExtractedAt: '2026-09-05T09:20:05+00:00', charCount: 1320547, unitCount: 1987, articleCount: 113, chunkCount: 802, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: '9313421fb22f6b3839950e1dadc54ee0c9876d107bf8cee8dab59ea41df5634a', createdAt: '2026-09-04T07:36:40+00:00' },
  [ID.tfrV1]: { id: ID.tfrV1, versionNo: 1, status: 'ready', error: null, contentType: 'application/xhtml+xml', sourceUrl: 'https://publications.europa.eu/resource/celex/32015R0847', effectiveDate: '2015-06-26', label: '32015R0847', parser: 'eu_xhtml', obligationsExtractedAt: null, charCount: 58211, unitCount: 96, articleCount: 28, chunkCount: 41, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: '801afcf6a206a8e223ff3c3de3092d309ce7ef6481341ac1e19a133b9386d364', createdAt: '2026-09-04T07:38:00+00:00' },
  [ID.amlV1]: { id: ID.amlV1, versionNo: 1, status: 'ready', error: null, contentType: 'text/html', sourceUrl: 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90/asr', effectiveDate: '2026-01-01', label: 'TAR.5C1E0F2A7B90/Qw3r8tYu2L', parser: 'etar_html', obligationsExtractedAt: '2026-09-05T09:41:30+00:00', charCount: 402117, unitCount: 688, articleCount: 62, chunkCount: 240, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: 'c5dc231c2f2f8aaae0ef3de428a60b5ddaa0b3580edada429c8efa6bc33e44dc', createdAt: '2026-09-04T07:40:15+00:00' },
  [ID.consumerCreditV1]: { id: ID.consumerCreditV1, versionNo: 1, status: 'ready', error: null, contentType: 'text/html', sourceUrl: 'https://www.e-tar.lt/portal/lt/legalAct/TAR.8D2B6E4C1A07/asr', effectiveDate: '2025-11-01', label: 'TAR.8D2B6E4C1A07/Lp0o9i8u7Y', parser: 'etar_html', obligationsExtractedAt: '2026-09-24T14:36:10+00:00', charCount: 188450, unitCount: 305, articleCount: 44, chunkCount: 118, embedModel: 'gateway:azure/text-embedding-3-small', contentHash: '0b3f134264f9e1dc0e54ef6614012252bee7f4cfc08436ccf9342261635cf8d4', createdAt: '2026-09-04T07:42:30+00:00' },
};

// Which act each version belongs to
const VERSION_ACT = {
  [ID.micaV1]: ID.mica,
  [ID.micaV2]: ID.mica,
  [ID.doraV1]: ID.dora,
  [ID.aiActV1]: ID.aiAct,
  [ID.tfrV1]: ID.tfr,
  [ID.amlV1]: ID.aml,
  [ID.consumerCreditV1]: ID.consumerCredit,
};

// The provisions the fixtures hold (serialize_unit, full
// text), per version in document order — a slice of each
// act, enough for the tree, the viewer and the citations.
// A container's path is its heading (citation_path)
const provisions = {
  [ID.micaV1]: [
    { id: ID.micaV1Art2, versionId: ID.micaV1, parentId: null, ordinal: 1, depth: 0, unitType: 'article', number: '2', path: '2 str.', heading: 'Taikymo sritis', text: LAW.mica2 },
    { id: ID.micaV1Art59, versionId: ID.micaV1, parentId: null, ordinal: 2, depth: 0, unitType: 'article', number: '59', path: '59 str.', heading: 'Kriptoturto paslaugų teikėjų veiklos leidimas', text: `1. ${LAW.mica59Par1}\n2. ${LAW.mica59Par2}` },
    { id: ID.micaV1Art59Par1, versionId: ID.micaV1, parentId: ID.micaV1Art59, ordinal: 3, depth: 1, unitType: 'paragraph', number: '1', path: '59 str. 1 d.', heading: '', text: LAW.mica59Par1 },
    { id: ID.micaV1Art66, versionId: ID.micaV1, parentId: null, ordinal: 4, depth: 0, unitType: 'article', number: '66', path: '66 str.', heading: 'Pareiga veikti sąžiningai, teisingai ir profesionaliai, atsižvelgiant į geriausius klientų interesus', text: `4. ${LAW.mica66Par4}` },
    { id: ID.micaV1Art66Par4, versionId: ID.micaV1, parentId: ID.micaV1Art66, ordinal: 5, depth: 1, unitType: 'paragraph', number: '4', path: '66 str. 4 d.', heading: '', text: LAW.mica66Par4 },
    { id: ID.micaV1Art70, versionId: ID.micaV1, parentId: null, ordinal: 6, depth: 0, unitType: 'article', number: '70', path: '70 str.', heading: 'Klientų kriptoturto ir lėšų apsauga', text: `1. ${LAW.mica70Par1}` },
    { id: ID.micaV1Art70Par1, versionId: ID.micaV1, parentId: ID.micaV1Art70, ordinal: 7, depth: 1, unitType: 'paragraph', number: '1', path: '70 str. 1 d.', heading: '', text: LAW.mica70Par1 },
  ],
  [ID.micaV2]: [
    { id: ID.micaRecital76, versionId: ID.micaV2, parentId: null, ordinal: 1, depth: 0, unitType: 'recital', number: '76', path: '76 konstatuojamoji dalis', heading: '', text: LAW.micaRecital76 },
    { id: ID.micaTitleV, versionId: ID.micaV2, parentId: null, ordinal: 2, depth: 0, unitType: 'title', number: 'V', path: 'KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS', heading: 'KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS', text: `KRIPTOTURTO PASLAUGŲ TEIKĖJŲ VEIKLOS LEIDIMAS IR VEIKLOS SĄLYGOS\n1. ${LAW.mica59Par1}` },
    { id: ID.micaChapter1, versionId: ID.micaV2, parentId: ID.micaTitleV, ordinal: 3, depth: 1, unitType: 'chapter', number: '1', path: 'Kriptoturto paslaugų teikėjų veiklos leidimas', heading: 'Kriptoturto paslaugų teikėjų veiklos leidimas', text: `Kriptoturto paslaugų teikėjų veiklos leidimas\n1. ${LAW.mica59Par1}` },
    { id: ID.micaArt59, versionId: ID.micaV2, parentId: ID.micaChapter1, ordinal: 4, depth: 2, unitType: 'article', number: '59', path: '59 str.', heading: 'Kriptoturto paslaugų teikėjų veiklos leidimas', text: `1. ${LAW.mica59Par1}\n2. ${LAW.mica59Par2}` },
    { id: ID.micaArt59Par1, versionId: ID.micaV2, parentId: ID.micaArt59, ordinal: 5, depth: 3, unitType: 'paragraph', number: '1', path: '59 str. 1 d.', heading: '', text: LAW.mica59Par1 },
    { id: ID.micaArt59Par2, versionId: ID.micaV2, parentId: ID.micaArt59, ordinal: 6, depth: 3, unitType: 'paragraph', number: '2', path: '59 str. 2 d.', heading: '', text: LAW.mica59Par2 },
    { id: ID.micaChapter2, versionId: ID.micaV2, parentId: ID.micaTitleV, ordinal: 7, depth: 1, unitType: 'chapter', number: '2', path: 'Visiems kriptoturto paslaugų teikėjams taikomi įpareigojimai', heading: 'Visiems kriptoturto paslaugų teikėjams taikomi įpareigojimai', text: `Visiems kriptoturto paslaugų teikėjams taikomi įpareigojimai\n1. ${LAW.mica70Par1}` },
    { id: ID.micaArt70, versionId: ID.micaV2, parentId: ID.micaChapter2, ordinal: 8, depth: 2, unitType: 'article', number: '70', path: '70 str.', heading: 'Klientų kriptoturto ir lėšų apsauga', text: `1. ${LAW.mica70Par1}` },
    { id: ID.micaArt70Par1, versionId: ID.micaV2, parentId: ID.micaArt70, ordinal: 9, depth: 3, unitType: 'paragraph', number: '1', path: '70 str. 1 d.', heading: '', text: LAW.mica70Par1 },
    { id: ID.micaChapter3, versionId: ID.micaV2, parentId: ID.micaTitleV, ordinal: 10, depth: 1, unitType: 'chapter', number: '3', path: 'Su konkrečiomis kriptoturto paslaugomis susiję įpareigojimai', heading: 'Su konkrečiomis kriptoturto paslaugomis susiję įpareigojimai', text: `Su konkrečiomis kriptoturto paslaugomis susiję įpareigojimai\n1. ${LAW.mica75Par1}` },
    { id: ID.micaArt75, versionId: ID.micaV2, parentId: ID.micaChapter3, ordinal: 11, depth: 2, unitType: 'article', number: '75', path: '75 str.', heading: 'Kriptoturto saugojimas ir administravimas klientų vardu', text: `1. ${LAW.mica75Par1}` },
    { id: ID.micaArt75Par1, versionId: ID.micaV2, parentId: ID.micaArt75, ordinal: 12, depth: 3, unitType: 'paragraph', number: '1', path: '75 str. 1 d.', heading: '', text: LAW.mica75Par1 },
  ],
  [ID.doraV1]: [
    { id: ID.doraArt2, versionId: ID.doraV1, parentId: null, ordinal: 1, depth: 0, unitType: 'article', number: '2', path: '2 str.', heading: 'Asmenų taikymo sritis', text: LAW.dora2 },
    { id: ID.doraChapter3, versionId: ID.doraV1, parentId: null, ordinal: 2, depth: 0, unitType: 'chapter', number: 'III', path: 'SU IRT SUSIJUSIŲ INCIDENTŲ VALDYMAS, KLASIFIKAVIMAS IR PRANEŠIMAS APIE JUOS', heading: 'SU IRT SUSIJUSIŲ INCIDENTŲ VALDYMAS, KLASIFIKAVIMAS IR PRANEŠIMAS APIE JUOS', text: `SU IRT SUSIJUSIŲ INCIDENTŲ VALDYMAS, KLASIFIKAVIMAS IR PRANEŠIMAS APIE JUOS\n1. ${LAW.dora19Par1}` },
    { id: ID.doraArt19, versionId: ID.doraV1, parentId: ID.doraChapter3, ordinal: 3, depth: 1, unitType: 'article', number: '19', path: '19 str.', heading: 'Pranešimas apie didelius su IRT susijusius incidentus', text: `1. ${LAW.dora19Par1}` },
    { id: ID.doraArt19Par1, versionId: ID.doraV1, parentId: ID.doraArt19, ordinal: 4, depth: 2, unitType: 'paragraph', number: '1', path: '19 str. 1 d.', heading: '', text: LAW.dora19Par1 },
    { id: ID.doraChapter5, versionId: ID.doraV1, parentId: null, ordinal: 5, depth: 0, unitType: 'chapter', number: 'V', path: 'IRT TREČIŲJŲ ŠALIŲ RIZIKOS VALDYMAS', heading: 'IRT TREČIŲJŲ ŠALIŲ RIZIKOS VALDYMAS', text: `IRT TREČIŲJŲ ŠALIŲ RIZIKOS VALDYMAS\n3. ${LAW.dora28Par3}` },
    { id: ID.doraArt28, versionId: ID.doraV1, parentId: ID.doraChapter5, ordinal: 6, depth: 1, unitType: 'article', number: '28', path: '28 str.', heading: 'Bendrieji principai', text: `3. ${LAW.dora28Par3}` },
    { id: ID.doraArt28Par3, versionId: ID.doraV1, parentId: ID.doraArt28, ordinal: 7, depth: 2, unitType: 'paragraph', number: '3', path: '28 str. 3 d.', heading: '', text: LAW.dora28Par3 },
  ],
  [ID.aiActV1]: [
    { id: ID.aiArt6, versionId: ID.aiActV1, parentId: null, ordinal: 1, depth: 0, unitType: 'article', number: '6', path: '6 str.', heading: 'Didelės rizikos DI sistemų klasifikavimo taisyklės', text: `2. ${LAW.ai6Par2}` },
    { id: ID.aiArt6Par2, versionId: ID.aiActV1, parentId: ID.aiArt6, ordinal: 2, depth: 1, unitType: 'paragraph', number: '2', path: '6 str. 2 d.', heading: '', text: LAW.ai6Par2 },
    { id: ID.aiAnnex3, versionId: ID.aiActV1, parentId: null, ordinal: 3, depth: 0, unitType: 'annex', number: 'III', path: 'III priedas', heading: 'Didelės rizikos DI sistemos, nurodytos 6 straipsnio 2 dalyje', text: LAW.aiAnnex3 },
  ],
  [ID.amlV1]: [
    { id: ID.amlArt9, versionId: ID.amlV1, parentId: null, ordinal: 1, depth: 0, unitType: 'article', number: '9', path: '9 str.', heading: 'Kliento ir naudos gavėjo tapatybės nustatymas', text: `1. ${LAW.aml9Par1}` },
    { id: ID.amlArt9Par1, versionId: ID.amlV1, parentId: ID.amlArt9, ordinal: 2, depth: 1, unitType: 'paragraph', number: '1', path: '9 str. 1 d.', heading: '', text: LAW.aml9Par1 },
    { id: ID.amlArt14, versionId: ID.amlV1, parentId: null, ordinal: 3, depth: 0, unitType: 'article', number: '14', path: '14 str.', heading: 'Sustiprintas kliento tapatybės nustatymas', text: `3. ${LAW.aml14Par3}` },
    { id: ID.amlArt14Par3, versionId: ID.amlV1, parentId: ID.amlArt14, ordinal: 4, depth: 1, unitType: 'paragraph', number: '3', path: '14 str. 3 d.', heading: '', text: LAW.aml14Par3 },
    { id: ID.amlArt22, versionId: ID.amlV1, parentId: null, ordinal: 5, depth: 0, unitType: 'article', number: '22', path: '22 str.', heading: 'Vidaus kontrolė', text: `3. ${LAW.aml22Par3}` },
    { id: ID.amlArt22Par3, versionId: ID.amlV1, parentId: ID.amlArt22, ordinal: 6, depth: 1, unitType: 'paragraph', number: '3', path: '22 str. 3 d.', heading: '', text: LAW.aml22Par3 },
  ],
  [ID.tfrV1]: [
    { id: ID.tfrArt4, versionId: ID.tfrV1, parentId: null, ordinal: 1, depth: 0, unitType: 'article', number: '4', path: '4 str.', heading: 'Informacija, pridedama prie lėšų pervedimų', text: LAW.tfr4 },
  ],
  [ID.consumerCreditV1]: [
    { id: ID.vkiArt17, versionId: ID.consumerCreditV1, parentId: null, ordinal: 1, depth: 0, unitType: 'article', number: '17', path: '17 str.', heading: 'Atsakingasis skolinimas', text: `1. ${LAW.vki17Par1}` },
    { id: ID.vkiArt17Par1, versionId: ID.consumerCreditV1, parentId: ID.vkiArt17, ordinal: 2, depth: 1, unitType: 'paragraph', number: '1', path: '17 str. 1 d.', heading: '', text: LAW.vki17Par1 },
  ],
};

// The same provisions in one flat list, for id lookups
const allProvisions = Object.values(provisions).flat();







// -----------------------------------------------------------
// countObligations
// -----------------------------------------------------------
//
// An act's obligationCount: every obligation of the act, of
// any status (the view's Count annotation).
//
// Used by:
//   - acts (below)
// -----------------------------------------------------------

function countObligations(actId) {
  return obligations.filter((row) => row.documentId === actId).length;
}







// -----------------------------------------------------------
// acts
// -----------------------------------------------------------
//
// GET /api/corpus/documents's catalogue (serialize_document
// with obligationCount), by jurisdiction, short title and
// title: the AI Act, DORA, MiCA (version 2 current, found by
// the admin's refresh on 2026-09-24), the repealed 2015 TFR
// (disabled — an admin still sees it), the Bank of Lithuania
// rules whose first fetch failed (lastError, no version),
// the Lithuanian AML law and the consumer credit law.
//
// Used by:
//   - handlers.js — the corpus routes (q, jurisdiction,
//     domain filters)
//   - act, unit, checkCitations, the reports (below)
// -----------------------------------------------------------

export const acts = [
  {
    id: ID.aiAct, slug: 'di-aktas',
    title: '2024 m. birželio 13 d. Europos Parlamento ir Tarybos reglamentas (ES) 2024/1689, kuriuo nustatomos suderintos dirbtinio intelekto taisyklės',
    titleEn: 'Regulation (EU) 2024/1689 laying down harmonised rules on artificial intelligence', shortTitle: 'DI aktas',
    jurisdiction: 'EU', docType: 'regulation', sourceKind: 'cellar', externalId: '32024R1689', sourceUrl: `${EUR_LEX}32024R1689`, language: 'lt',
    domains: ['ai'], appliesTo: [], applicabilityNotes: 'Taikoma pagal naudojamas DI sistemas, ne pagal įstaigos tipą.', status: 'in_force', enabled: true,
    currentVersion: legalVersions[ID.aiActV1], lastCheckedAt: '2026-09-04T07:39:20+00:00', lastError: null,
    createdAt: '2026-09-04T07:36:00+00:00', updatedAt: '2026-09-04T07:39:20+00:00', obligationCount: countObligations(ID.aiAct),
  },
  {
    id: ID.dora, slug: 'dora',
    title: '2022 m. gruodžio 14 d. Europos Parlamento ir Tarybos reglamentas (ES) 2022/2554 dėl finansų sektoriaus skaitmeninės veiklos atsparumo',
    titleEn: 'Regulation (EU) 2022/2554 on digital operational resilience for the financial sector', shortTitle: 'DORA',
    jurisdiction: 'EU', docType: 'regulation', sourceKind: 'cellar', externalId: '32022R2554', sourceUrl: `${EUR_LEX}32022R2554`, language: 'lt',
    domains: ['ict', 'operational_resilience'], appliesTo: ['bank', 'casp', 'credit_union', 'crowdfunding', 'emi', 'insurance', 'investment_firm', 'payment_institution'],
    applicabilityNotes: '', status: 'in_force', enabled: true,
    currentVersion: legalVersions[ID.doraV1], lastCheckedAt: '2026-09-04T07:35:30+00:00', lastError: null,
    createdAt: '2026-09-04T07:32:00+00:00', updatedAt: '2026-09-04T07:35:30+00:00', obligationCount: countObligations(ID.dora),
  },
  {
    id: ID.mica, slug: 'mica',
    title: '2023 m. gegužės 31 d. Europos Parlamento ir Tarybos reglamentas (ES) 2023/1114 dėl kriptoturto rinkų',
    titleEn: 'Regulation (EU) 2023/1114 on markets in crypto-assets', shortTitle: 'MiCA',
    jurisdiction: 'EU', docType: 'regulation', sourceKind: 'cellar', externalId: '32023R1114', sourceUrl: `${EUR_LEX}32023R1114`, language: 'lt',
    domains: ['crypto'], appliesTo: ['casp'], applicabilityNotes: 'Taikoma kriptoturto paslaugų teikėjams ir kriptoturto emitentams.', status: 'in_force', enabled: true,
    currentVersion: legalVersions[ID.micaV2], lastCheckedAt: '2026-09-24T07:12:30+00:00', lastError: null,
    createdAt: '2026-09-04T07:30:00+00:00', updatedAt: '2026-09-24T07:12:30+00:00', obligationCount: countObligations(ID.mica),
  },
  {
    id: ID.tfr, slug: 'tfr-2015',
    title: '2015 m. gegužės 20 d. Europos Parlamento ir Tarybos reglamentas (ES) 2015/847 dėl informacijos, pridedamos prie lėšų pervedimų',
    titleEn: 'Regulation (EU) 2015/847 on information accompanying transfers of funds', shortTitle: 'TFR (2015)',
    jurisdiction: 'EU', docType: 'regulation', sourceKind: 'cellar', externalId: '32015R0847', sourceUrl: `${EUR_LEX}32015R0847`, language: 'lt',
    domains: ['aml'], appliesTo: ['bank', 'emi', 'payment_institution'], applicabilityNotes: 'Panaikintas; pakeistas Reglamentu (ES) 2023/1113.', status: 'repealed', enabled: false,
    currentVersion: legalVersions[ID.tfrV1], lastCheckedAt: '2026-09-04T07:38:50+00:00', lastError: null,
    createdAt: '2026-09-04T07:37:30+00:00', updatedAt: '2026-09-15T12:05:00+00:00', obligationCount: countObligations(ID.tfr),
  },
  {
    id: ID.lbRules, slug: 'lb-ktpt-taisykles',
    title: 'Kriptoturto paslaugų teikėjų veiklos organizavimo taisyklės', titleEn: '', shortTitle: 'LB KTPT taisyklės',
    jurisdiction: 'LT', docType: 'resolution', sourceKind: 'lb', externalId: '', sourceUrl: 'https://www.lb.lt/lt/ktpt-veiklos-taisykles', language: 'lt',
    domains: ['crypto'], appliesTo: ['casp'], applicabilityNotes: '', status: 'in_force', enabled: true,
    currentVersion: null, lastCheckedAt: '2026-09-26T08:15:02+00:00', lastError: 'www.lb.lt answered HTTP 503 for https://www.lb.lt/lt/ktpt-veiklos-taisykles',
    createdAt: '2026-09-26T08:14:30+00:00', updatedAt: '2026-09-26T08:14:30+00:00', obligationCount: countObligations(ID.lbRules),
  },
  {
    id: ID.aml, slug: 'pptfpi',
    title: 'Lietuvos Respublikos pinigų plovimo ir teroristų finansavimo prevencijos įstatymas',
    titleEn: 'Law on the Prevention of Money Laundering and Terrorist Financing', shortTitle: 'PPTFPĮ',
    jurisdiction: 'LT', docType: 'law', sourceKind: 'etar', externalId: 'TAR.5C1E0F2A7B90', sourceUrl: 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90', language: 'lt',
    domains: ['aml'], appliesTo: ['all'], applicabilityNotes: '', status: 'in_force', enabled: true,
    currentVersion: legalVersions[ID.amlV1], lastCheckedAt: '2026-09-04T07:44:10+00:00', lastError: null,
    createdAt: '2026-09-04T07:39:50+00:00', updatedAt: '2026-09-04T07:44:10+00:00', obligationCount: countObligations(ID.aml),
  },
  {
    id: ID.consumerCredit, slug: 'vki',
    title: 'Lietuvos Respublikos vartojimo kredito įstatymas', titleEn: 'Law on Consumer Credit', shortTitle: 'VKĮ',
    jurisdiction: 'LT', docType: 'law', sourceKind: 'etar', externalId: 'TAR.8D2B6E4C1A07', sourceUrl: 'https://www.e-tar.lt/portal/lt/legalAct/TAR.8D2B6E4C1A07', language: 'lt',
    domains: ['consumer_credit'], appliesTo: ['consumer_credit'], applicabilityNotes: '', status: 'in_force', enabled: true,
    currentVersion: legalVersions[ID.consumerCreditV1], lastCheckedAt: '2026-09-04T07:46:00+00:00', lastError: null,
    createdAt: '2026-09-04T07:42:00+00:00', updatedAt: '2026-09-04T07:46:00+00:00', obligationCount: countObligations(ID.consumerCredit),
  },
];








// -----------------------------------------------------------
// standards
// -----------------------------------------------------------
//
// The corpus's standards (serialize_document, doc_type
// standard): ISO/IEC 27001:2022 ingested, ISO 9001:2015
// created but its copy not read yet. They are kept out of
// `acts`, whose counts the catalogue, dashboard and analysis
// tests pin; GET /api/corpus/documents answers them for
// ?docType=standard.
//
// Used by:
//   - handlers.js — GET /api/corpus/documents?docType=standard
// -----------------------------------------------------------

export const standards = [
  {
    id: ID.iso27001Standard, slug: 'iso-iec-27001-2022',
    title: 'Information security, cybersecurity and privacy protection — Information security management systems — Requirements',
    titleEn: '', shortTitle: 'ISO/IEC 27001:2022', jurisdiction: 'INTL', docType: 'standard', sourceKind: 'upload', externalId: '',
    sourceUrl: '', language: 'en', domains: [], appliesTo: [], applicabilityNotes: '', status: 'in_force', enabled: true,
    currentVersion: { id: 'd1000000-0000-4000-8000-000000000010', versionNo: 1, status: 'ready', error: null, contentType: 'application/pdf', sourceUrl: '', effectiveDate: null, label: '', parser: '', obligationsExtractedAt: null, charCount: 98544, unitCount: 147, articleCount: 140, chunkCount: 61, embedModel: 'gateway:azure/text-embedding-3-large', contentHash: '5f0c8a7e1b2d3c4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6', createdAt: '2026-09-05T10:00:00+00:00' },
    lastCheckedAt: '2026-09-05T10:02:00+00:00', lastError: null, createdAt: '2026-09-05T09:58:00+00:00', updatedAt: '2026-09-05T10:02:00+00:00',
    obligationCount: 0,
  },
  {
    id: ID.iso9001Standard, slug: 'iso-9001-2015', title: 'Quality management systems — Requirements', titleEn: '',
    shortTitle: 'ISO 9001:2015', jurisdiction: 'INTL', docType: 'standard', sourceKind: 'upload', externalId: '', sourceUrl: '',
    language: 'en', domains: [], appliesTo: [], applicabilityNotes: '', status: 'in_force', enabled: true, currentVersion: null,
    lastCheckedAt: null, lastError: null, createdAt: '2026-09-25T08:00:00+00:00', updatedAt: '2026-09-25T08:00:00+00:00',
    obligationCount: 0,
  },
];







// -----------------------------------------------------------
// act
// -----------------------------------------------------------
//
//   act(ID.mica) → the detail, or undefined
//
// GET /api/corpus/documents/{id}: the row with every version
// (newest first) and — only when a job ever ran for the act
// (subject "corpus:<id>") — latestJob; MiCA's is the ingest
// that found version 2, the Bank of Lithuania rules' the
// failed fetch. With them what the models read from the
// act's text (scopeReading, sanctionsReading; null until
// read): MiCA's scope names four kinds and nine sanction
// tiers were read from it; the Bank of Lithuania rules'
// scope provisions name no kind and its sanctions were
// never read; no other act was read.
//
// Used by:
//   - handlers.js — the act routes (GET, PATCH, DELETE,
//     refresh, upload, extract-obligations, units)
//   - units (below)
// -----------------------------------------------------------

export function act(id) {
  const unread = { scopeReading: null, sanctionsReading: null };
  if (id === ID.newAct) return { ...NEW.act, versions: [], latestJob: NEW.job, obligationCount: 0, ...unread };
  const row = find(acts, id);
  if (!row) return undefined;
  const latest = jobs.find((candidate) => candidate.subject === `corpus:${id}`);
  const readings = {
    [ID.mica]: {
      scopeReading: {
        types: ['bank', 'casp', 'emi', 'investment_firm'], readAt: '2026-09-24T07:15:00Z',
        reasoning: 'Article 2(1) applies the Regulation to persons that issue, offer or provide services related to crypto-assets.',
      },
      sanctionsReading: {
        tiers: 9, readAt: '2026-09-24T07:16:00Z',
        note: 'Article 111 states the ceilings Member States must provide for; national law may set higher ones.',
      },
    },
    [ID.lbRules]: {
      scopeReading: {
        types: [], readAt: '2026-09-24T07:15:00Z',
        reasoning: 'Points 1 to 6 hold headings only; they do not name the institutions the rules apply to.',
      },
      sanctionsReading: null,
    },
  };
  return {
    ...row,
    versions: Object.values(legalVersions).filter((version) => VERSION_ACT[version.id] === id)
      .sort((a, b) => b.versionNo - a.versionNo),
    ...(latest && { latestJob: latest }),
    ...unread, ...readings[id],
  };
}







// -----------------------------------------------------------
// units
// -----------------------------------------------------------
//
//   units(ID.mica, { type: 'article', q, offset, limit, version })
//     → { units, total, offset, limit }
//
// GET /api/corpus/documents/{id}/units: the provisions of
// the current version (or ?version=) in document order,
// filtered by the comma list of unit types and a text
// search, texts trimmed to 280 characters for the tree. An
// act without a version answers {units: [], total: 0}.
//
// Used by:
//   - handlers.js — GET /api/corpus/documents/{id}/units
// -----------------------------------------------------------

export function units(actId, { type = '', q = '', offset = 0, limit = 200, version = '' } = {}) {
  const row = act(actId);
  if (!row) return undefined;
  const versionId = version || row.currentVersion?.id;
  if (!versionId) return { units: [], total: 0 };
  const types = type ? String(type).split(',') : null;
  const needle = String(q ?? '').slice(0, 200).toLowerCase();
  const rows = (VERSION_ACT[versionId] === actId ? provisions[versionId] ?? [] : [])
    .filter((unit) => !types || types.includes(unit.unitType))
    .filter((unit) => !needle || unit.text.toLowerCase().includes(needle));
  return {
    units: rows.slice(offset, offset + limit)
      .map((unit) => ({ ...unit, text: unit.text.length > 280 ? `${unit.text.slice(0, 280)}…` : unit.text })),
    total: rows.length,
    offset,
    limit,
  };
}







// -----------------------------------------------------------
// unit
// -----------------------------------------------------------
//
//   unit(ID.micaArt59) → the provision in full, or undefined
//
// GET /api/corpus/units/{id}: the unit plus its act's id,
// titles and source page, the version number, whether that
// version is still the current one (the report's citations
// point at MiCA version 1 — isCurrent false) and the link to
// the official text (citationUrl).
//
// Used by:
//   - handlers.js — GET /api/corpus/units/{id}
// -----------------------------------------------------------

export function unit(id) {
  const row = find(allProvisions, id);
  if (!row) return undefined;
  const owner = find(acts, VERSION_ACT[row.versionId]);
  return {
    ...row,
    documentId: owner.id,
    documentTitle: owner.title,
    shortTitle: owner.shortTitle,
    sourceUrl: owner.sourceUrl,
    versionNo: legalVersions[row.versionId].versionNo,
    isCurrent: owner.currentVersion?.id === row.versionId,
    citationUrl: citationUrl(owner.id, row.id),
  };
}







// -----------------------------------------------------------
// citationUrl
// -----------------------------------------------------------
//
// corpus/links.py citation_url: EUR-Lex with the article
// anchor for a CELEX-numbered EU act (a paragraph links to
// its article), the act's own source page otherwise.
//
// Used by:
//   - unit (above), hit, checkCitations, finding (below)
// -----------------------------------------------------------

function citationUrl(actId, unitId) {
  const owner = find(acts, actId);
  if (owner.jurisdiction !== 'EU' || !/^[0-9]{5}[A-Z]{1,2}[0-9]{4}/.test(owner.externalId)) return owner.sourceUrl;
  let cursor = find(allProvisions, unitId);
  for (let depth = 0; cursor && cursor.unitType !== 'article' && depth < 6; depth += 1) {
    cursor = find(allProvisions, cursor.parentId);
  }
  return `${EUR_LEX}${owner.externalId}${cursor?.number ? `#art_${cursor.number}` : ''}`;
}







// -----------------------------------------------------------
// hit
// -----------------------------------------------------------
//
// One corpus search hit (corpus/search.py _hit) for a
// provision of an act's current version.
//
// Used by:
//   - corpusHits (below)
// -----------------------------------------------------------

function hit(actId, unitId, chunkId, score) {
  const owner = find(acts, actId);
  const row = find(allProvisions, unitId);
  return {
    chunkId,
    unitId,
    documentId: owner.id,
    documentSlug: owner.slug,
    documentTitle: owner.title,
    shortTitle: owner.shortTitle || owner.title.slice(0, 60),
    jurisdiction: owner.jurisdiction,
    path: row.path,
    heading: row.heading,
    text: row.text,
    sourceUrl: owner.sourceUrl,
    citationUrl: citationUrl(actId, unitId),
    score,
  };
}







// -----------------------------------------------------------
// corpusHits
// -----------------------------------------------------------
//
// POST /api/corpus/search's hits for a question about a
// custody licence: MiCA 59 and 75 str. (EUR-Lex anchors) and
// PPTFPĮ 22 str. (its e-TAR page), RRF scores.
//
// Used by:
//   - handlers.js — POST /api/corpus/search
// -----------------------------------------------------------

export const corpusHits = [
  hit(ID.mica, ID.micaArt59, 'd3000000-0000-4000-8000-000000000204', 0.03279),
  hit(ID.mica, ID.micaArt75, 'd3000000-0000-4000-8000-000000000211', 0.03175),
  hit(ID.aml, ID.amlArt22, 'd3000000-0000-4000-8000-000000000505', 0.01613),
];







// -----------------------------------------------------------
// resolveAct
// -----------------------------------------------------------
//
// corpus/search.py resolve_document: an enabled act with a
// current version by id, slug, short title or CELEX / TAR
// number (case-insensitive), else by a title fragment that
// matches exactly one act.
//
// Used by:
//   - checkCitations (below)
// -----------------------------------------------------------

function resolveAct(ref) {
  const raw = String(ref ?? '').trim();
  const key = raw.toLowerCase();
  if (!key || key.length > 300) return undefined;
  const live = acts.filter((row) => row.enabled && row.currentVersion);
  const exact = live.find((row) => row.id === raw
    || [row.slug, row.shortTitle, row.externalId].some((value) => value && value.toLowerCase() === key));
  if (exact) return exact;
  const titled = key.length >= 4
    ? live.filter((row) => row.title.toLowerCase().includes(key) || row.titleEn.toLowerCase().includes(key))
    : [];
  return titled.length === 1 ? titled[0] : undefined;
}







// -----------------------------------------------------------
// overlapVerdict
// -----------------------------------------------------------
//
// corpus/citations.py _overlap — the share of the claim's
// words (4+ letters) found in the heading and opening text:
// ≥ 0.6 match, < 0.2 mismatch, else unknown. The backend's
// verdict when the judging model is unavailable; the double
// always takes this path, so its notes stay empty.
//
// Used by:
//   - checkCitations (below)
// -----------------------------------------------------------

function overlapVerdict(claim, reference) {
  const words = (text) => new Set((text.match(/[\p{L}\p{N}_]{4,}/gu) ?? []).map((word) => word.toLowerCase()));
  const claimed = words(claim);
  if (!claimed.size) return 'unknown';
  const known = words(reference);
  const score = [...claimed].filter((word) => known.has(word)).length / claimed.size;
  if (score >= 0.6) return 'match';
  return score < 0.2 ? 'mismatch' : 'unknown';
}







// -----------------------------------------------------------
// CITATION_CHECKS
// -----------------------------------------------------------
//
// A citation-check request that meets every verdict: found
// with a matching heading, found with a mismatching one, an
// article the act does not have, an act the corpus does not
// hold, and a found provision with no claimed heading.
//
// Used by:
//   - nothing in support/ — for tests to send, and to pass
//     to checkCitations for the expected results
// -----------------------------------------------------------

export const CITATION_CHECKS = [
  { act: 'MiCA', article: '59', paragraph: '1', claimedHeading: 'Kriptoturto paslaugų teikėjų veiklos leidimas' },
  { act: 'DORA', article: '19', claimedHeading: 'IRT trečiųjų šalių rizikos valdymas' },
  { act: 'MiCA', article: '999' },
  { act: 'GDPR', article: '32' },
  { act: 'PPTFPĮ', article: '22', paragraph: '3' },
];







// -----------------------------------------------------------
// checkCitations
// -----------------------------------------------------------
//
//   checkCitations(CITATION_CHECKS) → [result, …] in order
//
// POST /api/corpus/check-citations's results, computed per
// requested citation as corpus/citations.py does: status
// act_not_in_corpus | not_found | found; a found one carries
// the real heading, the opening text, the citation url,
// headingMatch (unknown without a claimed heading) and
// judgedBy — the double judges by the word overlap, so it
// says "overlap" (null without a claimed heading).
//
// Used by:
//   - handlers.js — POST /api/corpus/check-citations
// -----------------------------------------------------------

export function checkCitations(items = []) {
  return items.slice(0, 50).map((item) => {
    const base = {
      act: item.act ?? null,
      article: item.article ?? null,
      paragraph: item.paragraph ?? null,
      point: item.point ?? null,
      claimedHeading: item.claimedHeading ?? null,
    };
    const owner = resolveAct(item.act);
    if (!owner) return { ...base, status: 'act_not_in_corpus' };
    const rows = provisions[owner.currentVersion.id] ?? [];
    const number = String(item.article ?? '').replace(/^(article|art\.?|straipsnis|str\.?)\s*/i, '').trim().toLowerCase().replace(/\s+/g, '');
    const article = rows.find((row) => row.unitType === 'article' && row.number.toLowerCase() === number)
      ?? rows.find((row) => row.unitType === 'annex' && row.number.toLowerCase() === number)
      ?? rows.find((row) => row.unitType === 'point' && row.depth <= 2 && row.number.toLowerCase() === number);
    let target = article;
    for (const key of ['paragraph', 'point']) {
      const value = String(item[key] ?? '').trim().replace(/^\(|\)$/g, '');
      if (value && target) target = rows.find((row) => row.parentId === target.id && row.number === value);
    }
    const shortTitle = owner.shortTitle || owner.title.slice(0, 60);
    if (!target) return { ...base, status: 'not_found', documentId: owner.id, shortTitle };
    const heading = target.heading || article.heading;
    const excerpt = target.text.slice(0, 600);
    const claim = String(item.claimedHeading ?? '').trim();
    return {
      ...base,
      status: 'found',
      documentId: owner.id,
      unitId: target.id,
      shortTitle,
      path: target.path,
      heading,
      excerpt,
      citationUrl: citationUrl(owner.id, target.id),
      headingMatch: claim ? overlapVerdict(claim, `${heading}\n${excerpt}`) : 'unknown',
      note: '',
      judgedBy: claim ? 'overlap' : null,
    };
  });
}







// The two conversations the administrator had, in the
// assistant-ui history format: {id, parent_id, format:
// 'ai-sdk/v6', content: the AI SDK UIMessage without its id}
// — the user's question, then the reply with its tool call
const threadHistory = {
  [ID.licenceThread]: [
    {
      id: ID.question1,
      parent_id: null,
      format: 'ai-sdk/v6',
      content: { role: 'user', parts: [{ type: 'text', text: 'Kokio leidimo reikia UAB Pavyzdys, jei ji saugo klientų kriptoturtą?' }] },
    },
    {
      id: ID.answer1,
      parent_id: ID.question1,
      format: 'ai-sdk/v6',
      content: {
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-searchLegalCorpus',
            toolCallId: 'call_licence_1',
            state: 'output-available',
            input: { query: 'kriptoturto saugojimo ir administravimo klientų vardu leidimas', documents: ['MiCA'], k: 3 },
            output: {
              hits: [{
                unitId: ID.micaV1Art59Par1, documentId: ID.mica, shortTitle: 'MiCA',
                title: '2023 m. gegužės 31 d. Europos Parlamento ir Tarybos reglamentas (ES) 2023/1114 dėl kriptoturto rinkų',
                jurisdiction: 'EU', path: '59 str. 1 d.', heading: '', citationUrl: `${EUR_LEX}32023R1114#art_59`,
                text: LAW.mica59Par1, score: 0.03279,
              }],
            },
          },
          { type: 'step-start' },
          {
            type: 'text',
            state: 'done',
            text: 'UAB Pavyzdys saugo ir administruoja kriptoturtą klientų vardu — tai kriptoturto paslauga, todėl reikia **kriptoturto paslaugų teikėjo leidimo** (MiCA 59 str. 1 d.). Leidimą išduoda Lietuvos bankas; bendrovės profilyje jau yra patikrintas leidimas Nr. KTPT-2026-017.',
          },
        ],
      },
    },
  ],
  [ID.doraThread]: [
    {
      id: ID.question2,
      parent_id: null,
      format: 'ai-sdk/v6',
      content: { role: 'user', parts: [{ type: 'text', text: 'Per kiek laiko reikia pranešti apie didelį su IRT susijusį incidentą?' }] },
    },
    {
      id: ID.answer2,
      parent_id: ID.question2,
      format: 'ai-sdk/v6',
      content: {
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-getLegalProvision',
            toolCallId: 'call_dora_1',
            state: 'output-available',
            input: { document: 'DORA', article: '19', paragraph: '1' },
            output: {
              provision: {
                unitId: ID.doraArt19Par1, documentId: ID.dora, shortTitle: 'DORA',
                title: '2022 m. gruodžio 14 d. Europos Parlamento ir Tarybos reglamentas (ES) 2022/2554 dėl finansų sektoriaus skaitmeninės veiklos atsparumo',
                jurisdiction: 'EU', path: '19 str. 1 d.', heading: '', citationUrl: `${EUR_LEX}32022R2554#art_19`,
                unitType: 'paragraph', externalId: '32022R2554', language: 'lt', versionNo: 1, versionDate: '2025-01-17',
                text: LAW.dora19Par1,
              },
            },
          },
          { type: 'step-start' },
          {
            type: 'text',
            state: 'done',
            text: 'Pagal DORA 19 str. 1 d. apie didelį su IRT susijusį incidentą finansų subjektas praneša kompetentingai institucijai nustatytais terminais. Pradinį pranešimą paprastai reikia pateikti per 4 valandas nuo incidento klasifikavimo (tikrintina techniniuose standartuose).',
          },
        ],
      },
    },
  ],
};







// -----------------------------------------------------------
// threads
// -----------------------------------------------------------
//
// GET /api/chat/threads's rows (serialize_thread) — the
// caller's unarchived threads, most recently updated first:
// a plain question about DORA, and a thread about UAB
// Pavyzdys in its compliance-officer role (the whole role
// rides along).
//
// Used by:
//   - handlers.js — GET /api/chat/threads (companyId filter)
//   - thread, threadMessages (below)
// -----------------------------------------------------------

export const threads = [
  {
    id: ID.doraThread,
    userId: ID.admin,
    companyId: null,
    companyName: null,
    roleId: null,
    role: null,
    title: 'Per kiek laiko reikia pranešti apie didelį su IRT susijusį incidentą?',
    messageCount: 2,
    archived: false,
    createdAt: '2026-09-26T15:04:40+00:00',
    updatedAt: '2026-09-26T15:05:00+00:00',
  },
  {
    id: ID.licenceThread,
    userId: ID.admin,
    companyId: ID.pavyzdys,
    companyName: 'UAB Pavyzdys',
    roleId: ID.complianceOfficer,
    role: complianceOfficerRole,
    title: 'Kokio leidimo reikia UAB Pavyzdys?',
    messageCount: 2,
    archived: false,
    createdAt: '2026-09-21T09:00:12+00:00',
    updatedAt: '2026-09-21T09:02:40+00:00',
  },
];







// -----------------------------------------------------------
// thread
// -----------------------------------------------------------
//
//   thread(ID.licenceThread) → the thread, or undefined
//
// Used by:
//   - handlers.js — /api/chat/threads/{id}
//   - threadMessages (below)
// -----------------------------------------------------------

export function thread(id) {
  return find(threads, id) ?? (id === ID.newThread ? NEW.thread : undefined);
}







// -----------------------------------------------------------
// threadMessages
// -----------------------------------------------------------
//
//   threadMessages(ID.licenceThread) → [row, …] (a top-level
//                                       list), or undefined
//
// GET /api/chat/threads/{id}/messages: the history rows in
// created order; a new thread has none.
//
// Used by:
//   - handlers.js — /api/chat/threads/{id}/messages
// -----------------------------------------------------------

export function threadMessages(id) {
  if (!thread(id)) return undefined;
  return threadHistory[id] ?? [];
}







// -----------------------------------------------------------
// CHAT_REPLY_TEXT
// -----------------------------------------------------------
//
// What the double's assistant answers to any message.
//
// Used by:
//   - chatStream (below)
//   - tests — the reply they wait for
// -----------------------------------------------------------

export const CHAT_REPLY_TEXT = 'Sveiki! Kuo galiu padėti?';







// -----------------------------------------------------------
// chatStream
// -----------------------------------------------------------
//
//   chatStream('srv-…') → [chunk, …]
//
// The UI message chunks POST /api/assistant/chat streams for
// a plain text answer, in AI SDK v7's order (start with the
// reply's id, one step, the text as start / deltas / end,
// finish-step, finish). handlers.js writes each as an SSE
// "data: {json}" event and ends with "data: [DONE]"; the
// text id "txt-0" is the openai-compatible provider's.
//
// Used by:
//   - handlers.js — POST /api/assistant/chat
// -----------------------------------------------------------

export function chatStream(messageId = 'srv-ca100000-0000-4000-8000-0000000000ff', text = CHAT_REPLY_TEXT) {
  return [
    { type: 'start', messageId },
    { type: 'start-step' },
    { type: 'text-start', id: 'txt-0' },
    ...text.split(/(?<= )/).map((delta) => ({ type: 'text-delta', id: 'txt-0', delta })),
    { type: 'text-end', id: 'txt-0' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ];
}







// -----------------------------------------------------------
// chatStatus
// -----------------------------------------------------------
//
// GET /api/assistant/chat/{id}/status for a thread with no
// live turn (services/runs.js runStatus).
//
// Used by:
//   - handlers.js — GET /api/assistant/chat/{id}/status
// -----------------------------------------------------------

export const chatStatus = { running: false, startedAt: null };







// The job steps the model calls below were recorded in
const STEP_ID = {
  failedDocuments: 'b1000000-0000-4000-8000-000000000102',
  failedApplicability: 'b1000000-0000-4000-8000-000000000103',
  failedGap: 'b1000000-0000-4000-8000-000000000105',
  doneCitations: 'b1000000-0000-4000-8000-000000000208',
  doneApplicability: 'b1000000-0000-4000-8000-000000000203',
  doneGap: 'b1000000-0000-4000-8000-000000000205',
  donePlan: 'b1000000-0000-4000-8000-000000000206',
  doneSummary: 'b1000000-0000-4000-8000-000000000207',
  micaEmbed: 'b1000000-0000-4000-8000-000000000305',
  vkiExtract: 'b1000000-0000-4000-8000-000000000401',
  complaintsEmbed: 'b1000000-0000-4000-8000-000000000801',
  runningApplicability: 'b1000000-0000-4000-8000-000000000903',
  runningGap: 'b1000000-0000-4000-8000-000000000905',
};

// Why the 2026-09-20 analysis stopped (failure_message of a
// gateway timeout) and why the Bank of Lithuania fetch did
const REPORT_FAILURE = '[504] GATEWAY_ERROR: Upstream request timed out after 120 s';
const LB_FAILURE = 'www.lb.lt answered HTTP 503 for https://www.lb.lt/lt/ktpt-veiklos-taisykles';

// The embedding model of the corpus and the documents
const EMBED_MODEL = 'gateway:azure/text-embedding-3-small';

// The executive summary the finished analysis wrote
// (markdown) — its summary step counts the characters
const DONE_SUMMARY = [
  '## Santrauka',
  '',
  'UAB Pavyzdys yra kriptoturto paslaugų teikėjas, turintis patikrintą Lietuvos banko leidimą. Įvertinti keturi teisės aktai (MiCA, DORA, PPTFPĮ; DI akto taikymas neaiškus) ir septyni įpareigojimai.',
  '',
  '**Svarbiausios spragos**',
  '',
  '- Nėra patvirtintos klientų kriptoturto ir lėšų apsaugos tvarkos (MiCA 70 str. 1 d.).',
  '- IRT paslaugų sutarčių informacijos registras neužbaigtas (DORA 28 str. 3 d.).',
  '- Incidentų pranešimo procedūra netvirtinta (DORA 19 str. 1 d.).',
  '',
  '**Kas atitinka**',
  '',
  '- Kriptoturto paslaugų teikėjo leidimas (MiCA 59 str. 1 d.).',
  '- Paskirtas už pinigų plovimo prevenciją atsakingas darbuotojas (PPTFPĮ 22 str. 3 d.).',
].join('\n');







// -----------------------------------------------------------
// step
// -----------------------------------------------------------
//
// One JobStep (jobs/queue.py serialize_step): running until
// it has a finish stamp, then done with its duration;
// `extra` sets the rest (status 'failed' with its error,
// inputRef, output, model).
//
// Used by:
//   - jobSteps (below)
// -----------------------------------------------------------

function step(id, ordinal, name, startedAt, finishedAt, extra = {}) {
  return {
    id,
    ordinal,
    name,
    status: finishedAt ? 'done' : 'running',
    promptVersionId: null,
    model: null,
    inputRef: {},
    output: null,
    usage: {},
    durationMs: finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : null,
    error: null,
    startedAt,
    finishedAt,
    ...extra,
  };
}







// The steps of every job that ran, in ordinal order. The
// failed fetch ran twice (two attempts), each attempt's step
// numbered 1 again, as the runner does. The analysis of
// 2026-09-20 predates the citation audit; the later two ran
// it — UAB Kreditas' one document cites no provision, so its
// audit had nothing to check
const jobSteps = {
  [ID.jobReportFailed]: [
    step('b1000000-0000-4000-8000-000000000101', 1, 'profile', '2026-09-20T15:02:03+00:00', '2026-09-20T15:02:04+00:00', { output: { credentials: 2, documents: 4 } }),
    step(STEP_ID.failedDocuments, 2, 'documents', '2026-09-20T15:02:04+00:00', '2026-09-20T15:02:52+00:00', { output: { documents: 4 } }),
    step(STEP_ID.failedApplicability, 3, 'applicability', '2026-09-20T15:02:52+00:00', '2026-09-20T15:03:31+00:00', { inputRef: { candidates: 4 }, output: { applies: 3, uncertain: 1, notApplies: 1 } }),
    step('b1000000-0000-4000-8000-000000000104', 4, 'obligations', '2026-09-20T15:03:31+00:00', '2026-09-20T15:03:32+00:00', { inputRef: { acts: 4 }, output: { acts: 4, extracted: 0, obligations: 7 } }),
    step(STEP_ID.failedGap, 5, 'gap_analysis', '2026-09-20T15:03:32+00:00', '2026-09-20T15:05:40+00:00', { status: 'failed', inputRef: { batches: 4 }, error: REPORT_FAILURE }),
  ],
  [ID.jobReportDone]: [
    step('b1000000-0000-4000-8000-000000000201', 1, 'profile', '2026-09-21T09:15:04+00:00', '2026-09-21T09:15:05+00:00', { output: { credentials: 2, documents: 4 } }),
    step('b1000000-0000-4000-8000-000000000202', 2, 'documents', '2026-09-21T09:15:05+00:00', '2026-09-21T09:15:09+00:00', { output: { documents: 4 } }),
    step(STEP_ID.doneCitations, 3, 'citations', '2026-09-21T09:15:09+00:00', '2026-09-21T09:15:12+00:00', { inputRef: { citations: 6, unique: 6 }, output: { checked: 6, match: 1, mismatch: 2, notFound: 1, notInCorpus: 1, unknown: 1, unique: 6, skipped: 0, checks: 1, judgedBy: 'model' } }),
    step(STEP_ID.doneApplicability, 4, 'applicability', '2026-09-21T09:15:12+00:00', '2026-09-21T09:16:21+00:00', { inputRef: { candidates: 4 }, output: { applies: 3, uncertain: 1, notApplies: 1 } }),
    step('b1000000-0000-4000-8000-000000000204', 5, 'obligations', '2026-09-21T09:16:21+00:00', '2026-09-21T09:16:22+00:00', { inputRef: { acts: 4 }, output: { acts: 4, extracted: 0, obligations: 7 } }),
    step(STEP_ID.doneGap, 6, 'gap_analysis', '2026-09-21T09:16:22+00:00', '2026-09-21T09:22:16+00:00', { inputRef: { batches: 4 }, output: { met: 2, partial: 1, missing: 2, unknown: 1, not_applicable: 1 } }),
    step(STEP_ID.donePlan, 7, 'action_plan', '2026-09-21T09:22:16+00:00', '2026-09-21T09:27:31+00:00', { inputRef: { openFindings: 4, citationProblems: 3 }, output: { actions: 3 } }),
    step(STEP_ID.doneSummary, 8, 'summary', '2026-09-21T09:27:31+00:00', '2026-09-21T09:31:46+00:00', { output: { chars: DONE_SUMMARY.length } }),
  ],
  [ID.jobIngestMica]: [
    step('b1000000-0000-4000-8000-000000000301', 1, 'fetch', '2026-09-24T07:05:02+00:00', '2026-09-24T07:05:40+00:00', { inputRef: { source: 'cellar', url: `${EUR_LEX}32023R1114` }, output: { version: 2, bytes: 2841233, contentType: 'application/xhtml+xml', parser: 'eu_xhtml' } }),
    step('b1000000-0000-4000-8000-000000000302', 2, 'extract', '2026-09-24T07:05:40+00:00', '2026-09-24T07:07:10+00:00', { inputRef: { parser: 'eu_xhtml' }, output: { chars: 1063422, parser: 'eu_xhtml' } }),
    step('b1000000-0000-4000-8000-000000000303', 3, 'parse', '2026-09-24T07:07:10+00:00', '2026-09-24T07:07:25+00:00', { output: { units: 1512, articles: 149 } }),
    step('b1000000-0000-4000-8000-000000000304', 4, 'chunk', '2026-09-24T07:07:25+00:00', '2026-09-24T07:07:31+00:00', { output: { chunks: 634 } }),
    step(STEP_ID.micaEmbed, 5, 'embed', '2026-09-24T07:07:31+00:00', '2026-09-24T07:12:29+00:00', { model: EMBED_MODEL, output: { chunks: 634, model: EMBED_MODEL } }),
  ],
  [ID.jobExtractVki]: [
    step(STEP_ID.vkiExtract, 1, 'extract', '2026-09-24T14:30:02+00:00', '2026-09-24T14:36:14+00:00', { inputRef: { document: 'vki' }, output: { obligations: 1 } }),
  ],
  [ID.jobIngestLb]: [
    step('b1000000-0000-4000-8000-000000000701', 1, 'fetch', '2026-09-26T08:14:31+00:00', '2026-09-26T08:14:32+00:00', { status: 'failed', inputRef: { source: 'lb', url: 'https://www.lb.lt/lt/ktpt-veiklos-taisykles' }, error: LB_FAILURE }),
    step('b1000000-0000-4000-8000-000000000702', 1, 'fetch', '2026-09-26T08:15:01+00:00', '2026-09-26T08:15:02+00:00', { status: 'failed', inputRef: { source: 'lb', url: 'https://www.lb.lt/lt/ktpt-veiklos-taisykles' }, error: LB_FAILURE }),
  ],
  [ID.jobIndexComplaints]: [
    step(STEP_ID.complaintsEmbed, 1, 'embed', '2026-09-26T13:10:03+00:00', '2026-09-26T13:10:09+00:00', { inputRef: { document: ID.complaintsDoc }, output: { chunks: 1 } }),
  ],
  [ID.jobReportRunning]: [
    step('b1000000-0000-4000-8000-000000000901', 1, 'profile', '2026-09-27T09:40:03+00:00', '2026-09-27T09:40:04+00:00', { output: { credentials: 0, documents: 1 } }),
    step('b1000000-0000-4000-8000-000000000902', 2, 'documents', '2026-09-27T09:40:04+00:00', '2026-09-27T09:40:05+00:00', { output: { documents: 1 } }),
    step('b1000000-0000-4000-8000-000000000910', 3, 'citations', '2026-09-27T09:40:05+00:00', '2026-09-27T09:40:05+00:00', { inputRef: { citations: 0, unique: 0 }, output: { checked: 0, match: 0, mismatch: 0, notFound: 0, notInCorpus: 0, unknown: 0, unique: 0, skipped: 0, checks: 0, judgedBy: null } }),
    step(STEP_ID.runningApplicability, 4, 'applicability', '2026-09-27T09:40:05+00:00', '2026-09-27T09:41:31+00:00', { inputRef: { candidates: 3 }, output: { applies: 2, uncertain: 1, notApplies: 2 } }),
    step('b1000000-0000-4000-8000-000000000904', 5, 'obligations', '2026-09-27T09:41:31+00:00', '2026-09-27T09:41:32+00:00', { inputRef: { acts: 3 }, output: { acts: 3, extracted: 0, obligations: 4 } }),
    step(STEP_ID.runningGap, 6, 'gap_analysis', '2026-09-27T09:41:32+00:00', null, { inputRef: { batches: 3 } }),
  ],
};







// -----------------------------------------------------------
// jobs
// -----------------------------------------------------------
//
// GET /api/jobs's rows (serialize_job, no steps), newest
// first — every status and every kind the registry runs:
// a queued MiCA extraction, the running analysis of UAB
// Kreditas, a finished document index, the failed Bank of
// Lithuania fetch (two attempts), the nightly maintenance, a
// cancelled re-embed, the consumer-credit extraction, the
// MiCA ingest, and UAB Pavyzdys' finished and failed
// analyses. A queued job's progress is {} (the column's
// default).
//
// Used by:
//   - handlers.js — GET /api/jobs (status, kind, subject),
//     the active job a refresh / extraction answers
//   - job, jobCounts, act, the reports (above/below)
// -----------------------------------------------------------

export const jobs = [
  { id: ID.jobExtractMica, kind: 'corpus.extract_obligations', subject: `obligations:${ID.mica}`, status: 'queued', priority: 0, progress: {}, result: null, error: null, attempts: 0, maxAttempts: 1, cancelRequested: false, createdBy: ID.admin, createdAt: '2026-09-27T09:59:00+00:00', startedAt: null, finishedAt: null },
  { id: ID.jobReportRunning, kind: 'report.analyze', subject: `report:${ID.reportRunning}`, status: 'running', priority: 0, progress: { step: 'gap_analysis', percent: 33, message: '1/3 batches' }, result: null, error: null, attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: ID.admin, createdAt: '2026-09-27T09:40:00+00:00', startedAt: '2026-09-27T09:40:03+00:00', finishedAt: null },
  { id: ID.jobIndexComplaints, kind: 'documents.index', subject: `document:${ID.complaintsDoc}`, status: 'done', priority: 5, progress: {}, result: { chunks: 1 }, error: null, attempts: 1, maxAttempts: 3, cancelRequested: false, createdBy: ID.admin, createdAt: '2026-09-26T13:10:02+00:00', startedAt: '2026-09-26T13:10:03+00:00', finishedAt: '2026-09-26T13:10:09+00:00' },
  { id: ID.jobIngestLb, kind: 'corpus.ingest', subject: `corpus:${ID.lbRules}`, status: 'failed', priority: 0, progress: {}, result: null, error: LB_FAILURE, attempts: 2, maxAttempts: 2, cancelRequested: false, createdBy: ID.admin, createdAt: '2026-09-26T08:14:30+00:00', startedAt: '2026-09-26T08:14:31+00:00', finishedAt: '2026-09-26T08:15:02+00:00' },
  { id: ID.jobMaintenance, kind: 'ops.maintenance', subject: 'schedule:ops.maintenance', status: 'done', priority: -5, progress: {}, result: { sessions: 3, jobs: 0, llmCalls: 0, orphanFiles: 1, rateLimitWindows: 14, unusedUploads: 0 }, error: null, attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: null, createdAt: '2026-09-26T02:00:00+00:00', startedAt: '2026-09-26T02:00:01+00:00', finishedAt: '2026-09-26T02:00:03+00:00' },
  { id: ID.jobReembed, kind: 'corpus.reembed', subject: 'corpus:reembed', status: 'cancelled', priority: 0, progress: {}, result: null, error: null, attempts: 0, maxAttempts: 1, cancelRequested: true, createdBy: ID.admin, createdAt: '2026-09-25T16:00:00+00:00', startedAt: null, finishedAt: '2026-09-25T16:02:00+00:00' },
  { id: ID.jobExtractVki, kind: 'corpus.extract_obligations', subject: `obligations:${ID.consumerCredit}`, status: 'done', priority: 0, progress: { step: 'embed', percent: 95, message: '1 obligations' }, result: { obligations: 1 }, error: null, attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: ID.admin, createdAt: '2026-09-24T14:30:00+00:00', startedAt: '2026-09-24T14:30:02+00:00', finishedAt: '2026-09-24T14:36:15+00:00' },
  { id: ID.jobIngestMica, kind: 'corpus.ingest', subject: `corpus:${ID.mica}`, status: 'done', priority: 0, progress: { step: 'done', percent: 100, message: null }, result: { version: 2, units: 1512, articles: 149, chunks: 634 }, error: null, attempts: 1, maxAttempts: 2, cancelRequested: false, createdBy: ID.admin, createdAt: '2026-09-24T07:05:00+00:00', startedAt: '2026-09-24T07:05:02+00:00', finishedAt: '2026-09-24T07:12:30+00:00' },
  { id: ID.jobReportDone, kind: 'report.analyze', subject: `report:${ID.reportDone}`, status: 'done', priority: 0, progress: { step: 'gap_analysis', percent: 100, message: '4/4 batches' }, result: { reportId: ID.reportDone, findings: 7, actions: 3 }, error: null, attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: ID.jonas, createdAt: '2026-09-21T09:15:00+00:00', startedAt: '2026-09-21T09:15:04+00:00', finishedAt: '2026-09-21T09:31:47+00:00' },
  { id: ID.jobReportFailed, kind: 'report.analyze', subject: `report:${ID.reportFailed}`, status: 'failed', priority: 0, progress: { step: 'gap_analysis', percent: 25, message: '1/4 batches' }, result: null, error: REPORT_FAILURE, attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: ID.jonas, createdAt: '2026-09-20T15:02:00+00:00', startedAt: '2026-09-20T15:02:03+00:00', finishedAt: '2026-09-20T15:05:40+00:00' },
];







// -----------------------------------------------------------
// stepWithCalls
// -----------------------------------------------------------
//
// A step as the runner leaves it once it ended, done or
// failed (jobs/runner.py _usage_from_calls): its model calls
// (callRows) summed into usage {calls, inputTokens,
// outputTokens, costUsd, models: [{model, calls, inputTokens,
// outputTokens, costUsd}] — most calls, then cost, first},
// the most-used model, and the prompt version when exactly
// one ran. A running step, or one without calls, is left as
// it is.
//
// Used by:
//   - job (below)
// -----------------------------------------------------------

function stepWithCalls(row) {
  const calls = callRows.filter((call) => call.jobStepId === row.id);
  if (row.status === 'running' || calls.length === 0) return row;
  const byModel = new Map();
  for (const call of calls) {
    const entry = byModel.get(call.model) ?? { model: call.model, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    byModel.set(call.model, { ...entry, calls: entry.calls + 1, inputTokens: entry.inputTokens + call.inputTokens,
      outputTokens: entry.outputTokens + call.outputTokens, costUsd: round(entry.costUsd + call.costUsd, 6) });
  }
  const models = [...byModel.values()].sort((a, b) => b.calls - a.calls || b.costUsd - a.costUsd || a.model.localeCompare(b.model));
  const versions = [...new Set(calls.map((call) => call.promptVersionId).filter(Boolean))];
  const sum = (key) => models.reduce((total, entry) => total + entry[key], 0);
  return {
    ...row,
    model: models[0].model,
    promptVersionId: versions.length === 1 ? versions[0] : row.promptVersionId,
    usage: { ...row.usage, calls: sum('calls'), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), costUsd: round(sum('costUsd'), 6), models },
  };
}







// -----------------------------------------------------------
// job
// -----------------------------------------------------------
//
//   job(ID.jobReportRunning) → the job with its steps, or
//                              undefined
//
// GET /api/jobs/{id} (serialize_job with_steps): the steps
// that ended carry what their model calls used
// (stepWithCalls), and every step names its prompt version
// as step_prompts does — {slug, version}, or null when it has
// none or the version is not among promptVersionRows. The
// jobs a create queues resolve too, without steps yet, and
// so does the finished first job of the waiting report.
//
// Used by:
//   - handlers.js — /api/jobs/{id} and its cancel
// -----------------------------------------------------------

export function job(id) {
  const created = { [ID.newReportJob]: () => NEW.reportJob, [ID.newJob]: () => NEW.job, [ID.jobReportWaiting]: () => waitingJob }[id];
  const row = find(jobs, id) ?? created?.();
  const named = (step) => {
    const version = promptVersionRows.find((entry) => entry.id === step.promptVersionId);
    return { ...step, prompt: version ? { slug: version.promptSlug, version: version.version } : null };
  };
  return row && { ...row, steps: (jobSteps[id] ?? []).map(stepWithCalls).map(named) };
}







// -----------------------------------------------------------
// jobCounts
// -----------------------------------------------------------
//
// GET /api/jobs/counts: how many of `jobs` are in each
// status, every status present.
//
// Used by:
//   - handlers.js — GET /api/jobs/counts
// -----------------------------------------------------------

export const jobCounts = Object.fromEntries(['queued', 'running', 'done', 'failed', 'cancelled']
  .map((status) => [status, jobs.filter((row) => row.status === status).length]));







// Attempts per kind (jobs/registry.py registrations); every
// other kind gets one
const MAX_ATTEMPTS = { 'corpus.ingest': 2, 'documents.index': 3 };







// -----------------------------------------------------------
// queuedJob
// -----------------------------------------------------------
//
//   queuedJob('corpus.ingest', `corpus:${ID.mica}`) → a job
//
// A job the caller just enqueued (jobs/queue.py enqueue):
// status queued, progress {}, no attempt yet, the kind's
// attempt budget. It answers the 202 of the queued corpus
// work; its id is ID.newJob.
//
// Used by:
//   - handlers.js — act creation, refresh, upload,
//     extract-obligations, reembed, refresh-all
//   - NEW (below) — the ingest a new act's upload queues
// -----------------------------------------------------------

export function queuedJob(kind, subject) {
  return {
    id: ID.newJob,
    kind,
    subject,
    status: 'queued',
    priority: 0,
    progress: {},
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS[kind] ?? 1,
    cancelRequested: false,
    createdBy: me.id,
    createdAt: NOW,
    startedAt: null,
    finishedAt: null,
  };
}







// -----------------------------------------------------------
// llmModels
// -----------------------------------------------------------
//
// GET /api/llm/models — the assistant's /internal/llm/models
// passed through: the configured provider prefixes and the
// gateway's models with USD per token, newest first (the chat
// models the prompt editor offers, the embedding models it
// filters out).
//
// Used by:
//   - handlers.js — GET /api/llm/models
//   - costOf (below) — every cost the fixtures state
// -----------------------------------------------------------

export const llmModels = {
  providers: ['gateway'],
  models: [
    { id: 'gateway:azure/gpt-5.6-sol', name: 'gpt-5.6-sol', kind: 'chat', contextLength: 400000, maxOutputTokens: 128000, pricing: { promptPerToken: 0.000004, completionPerToken: 0.00002 } },
    { id: 'gateway:azure/gpt-5.6-terra', name: 'gpt-5.6-terra', kind: 'chat', contextLength: 400000, maxOutputTokens: 128000, pricing: { promptPerToken: 0.000002, completionPerToken: 0.000012 } },
    { id: 'gateway:azure/gpt-5.6-luna', name: 'gpt-5.6-luna', kind: 'chat', contextLength: 200000, maxOutputTokens: 64000, pricing: { promptPerToken: 0.0000002, completionPerToken: 0.0000012 } },
    { id: 'gateway:azure/gpt-5.5', name: 'gpt-5.5', kind: 'chat', contextLength: 400000, maxOutputTokens: 128000, pricing: { promptPerToken: 0.000005, completionPerToken: 0.00003 } },
    { id: EMBED_MODEL, name: 'text-embedding-3-small', kind: 'embedding', contextLength: 8191, maxOutputTokens: null, pricing: { promptPerToken: 0.00000002, completionPerToken: 0 } },
    { id: 'gateway:azure/text-embedding-3-large', name: 'text-embedding-3-large', kind: 'embedding', contextLength: 8191, maxOutputTokens: null, pricing: null },
  ],
};








// -----------------------------------------------------------
// chatModels
// -----------------------------------------------------------
//
// GET /api/chat/models — what the conversation's model
// picker offers: the chat models of llmModels as {id, name,
// pricing}, and the default, the chat prompt's model.
//
// Used by:
//   - handlers.js — GET /api/chat/models, and the thread
//     PATCH's model check
// -----------------------------------------------------------

export const chatModels = {
  default: 'gateway:azure/gpt-5.5',
  models: llmModels.models.filter((row) => row.kind === 'chat').map(({ id, name, pricing }) => ({ id, name, pricing })),
};







// -----------------------------------------------------------
// round
// -----------------------------------------------------------
//
// `value` to `digits` decimals — the backend rounds costs to
// 6 and budgets to 4.
//
// Used by:
//   - costOf, totalsOf, budgetOf, the report stats (below)
// -----------------------------------------------------------

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}







// -----------------------------------------------------------
// costOf
// -----------------------------------------------------------
//
// assistant/usage.py cost_of: USD for the tokens at the
// model's price, 0 for a model without one.
//
// Used by:
//   - promptTest, llmCall (below)
// -----------------------------------------------------------

function costOf(model, inputTokens, outputTokens) {
  const pricing = llmModels.models.find((row) => row.id === model)?.pricing;
  if (!pricing) return 0;
  return round(pricing.promptPerToken * inputTokens + pricing.completionPerToken * outputTokens, 6);
}







// The versions of every prompt, oldest first (the detail
// lists them newest first). chat.assistant runs the admin's
// own version 2 while a newer shipped default (3) waits
const promptVersionRows = [
  { id: 'f1000000-0000-4000-8000-000000000001', promptSlug: 'chat.assistant', version: 1, model: 'gateway:azure/gpt-5.5', temperature: 0.3, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You are the compliance assistant of a LegalOps platform. Today is {WEEKDAY}, {TODAY}. Answer in {LEADING_LANGUAGE}.\n\n{USER_CONTEXT}\n\n{COMPANY_CONTEXT}\n\n{ROLE_CONTEXT}' },
  { id: 'f1000000-0000-4000-8000-000000000002', promptSlug: 'chat.assistant', version: 2, model: 'gateway:azure/gpt-5.5', temperature: 0.2, maxTokens: 4000, note: 'Trumpesni atsakymai, visada nurodyti šaltinius', source: 'user', createdBy: ID.admin, createdAt: '2026-09-15T09:30:00+00:00', text: 'You are the compliance assistant of a LegalOps platform. Today is {WEEKDAY}, {TODAY}. Answer in {LEADING_LANGUAGE}. Keep answers short and cite every provision you rely on.\n\n{USER_CONTEXT}\n\n{COMPANY_CONTEXT}\n\n{ROLE_CONTEXT}' },
  { id: 'f1000000-0000-4000-8000-000000000003', promptSlug: 'chat.assistant', version: 3, model: 'gateway:azure/gpt-5.5', temperature: 0.3, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-24T06:00:00+00:00', text: 'You are the compliance assistant of a LegalOps platform. Today is {WEEKDAY}, {TODAY}. Answer in {LEADING_LANGUAGE}. Verify every article number with checkCitations before citing it.\n\n{USER_CONTEXT}\n\n{COMPANY_CONTEXT}\n\n{ROLE_CONTEXT}' },
  { id: 'f1000000-0000-4000-8000-000000000004', promptSlug: 'corpus.check_citations', version: 1, model: 'gateway:azure/gpt-5.6-luna', temperature: 0, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You check legal citations. For each <citation> block compare the claimed subject with the actual heading and opening text by meaning, and answer match, mismatch or unclear with a short note.' },
  { id: 'f1000000-0000-4000-8000-000000000005', promptSlug: 'corpus.extract_obligations', version: 1, model: 'gateway:azure/gpt-5.6-terra', temperature: null, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You are a senior regulatory analyst. Extract the concrete obligations {DOCUMENT_TITLE} ({JURISDICTION}) imposes on regulated entities, in {LANGUAGE}, each cited to its provisions. Institution types: {INSTITUTION_TYPES}.' },
  { id: 'f1000000-0000-4000-8000-000000000006', promptSlug: 'report.action_plan', version: 1, model: 'gateway:azure/gpt-5.5', temperature: null, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You are the head of compliance of {COMPANY_NAME}. Today is {TODAY}. Turn the open findings into a prioritised action plan written in {LANGUAGE}.' },
  { id: 'f1000000-0000-4000-8000-000000000007', promptSlug: 'report.applicability', version: 1, model: 'gateway:azure/gpt-5.5', temperature: null, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You are a senior compliance lawyer. Today is {TODAY}. Decide for each act whether it applies to {COMPANY_NAME}; answer in {LANGUAGE}.' },
  { id: 'f1000000-0000-4000-8000-000000000008', promptSlug: 'report.gap_analysis', version: 1, model: 'gateway:azure/gpt-5.6-terra', temperature: null, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You are a senior compliance auditor assessing {COMPANY_NAME} against specific legal obligations. Today is {TODAY}. Write in {LANGUAGE}.' },
  { id: 'f1000000-0000-4000-8000-000000000009', promptSlug: 'report.gap_analysis', version: 2, model: 'gateway:azure/gpt-5.6-terra', temperature: 0.1, maxTokens: 16000, note: 'Griežtesni įrodymų reikalavimai', source: 'user', createdBy: ID.admin, createdAt: '2026-09-18T09:55:00+00:00', text: 'You are a senior compliance auditor assessing {COMPANY_NAME} against specific legal obligations. Today is {TODAY}. Write in {LANGUAGE}. Mark an obligation met only when a quoted passage proves it.' },
  { id: 'f1000000-0000-4000-8000-00000000000a', promptSlug: 'report.inventory', version: 1, model: 'gateway:azure/gpt-5.6-terra', temperature: null, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'You are a compliance auditor reviewing one internal document of {COMPANY_NAME}. Record in {LANGUAGE} what the document proves.' },
  { id: 'f1000000-0000-4000-8000-00000000000b', promptSlug: 'report.summary', version: 1, model: 'gateway:azure/gpt-5.5', temperature: null, maxTokens: null, note: '', source: 'default', createdBy: null, createdAt: '2026-09-01T06:00:00+00:00', text: 'Write the executive summary of the gap analysis of {COMPANY_NAME} in {LANGUAGE}, as markdown, with a short title. Today is {TODAY}.' },
];

// The version each prompt runs (the list's activeVersion)
const ACTIVE_VERSION = {
  'chat.assistant': 2,
  'corpus.check_citations': 1,
  'corpus.extract_obligations': 1,
  'report.action_plan': 1,
  'report.applicability': 1,
  'report.gap_analysis': 2,
  'report.inventory': 1,
  'report.summary': 1,
};







// -----------------------------------------------------------
// runningVersion
// -----------------------------------------------------------
//
//   runningVersion('report.gap_analysis') → its version 2 row
//
// The version a prompt runs — the one every model call of
// the fixtures ran on (each was made after its activation).
//
// Used by:
//   - prompts, callRows (below)
// -----------------------------------------------------------

function runningVersion(slug) {
  return promptVersionRows.find((row) => row.promptSlug === slug && row.version === ACTIVE_VERSION[slug]);
}







// -----------------------------------------------------------
// prompts
// -----------------------------------------------------------
//
// GET /api/prompts's rows (serialize_prompt), by kind then
// slug: the active version and its model, and pendingDefault
// — the newer shipped default waiting beside an admin's own
// active version (chat.assistant: 3), else null.
// outputSchema is null: the shipped YAML defines none.
//
// Used by:
//   - handlers.js — GET /api/prompts
//   - promptDetail (below)
// -----------------------------------------------------------

export const prompts = [
  ['f0000000-0000-4000-8000-000000000001', 'chat.assistant', 'Chat assistant', 'The system prompt of the conversational assistant — classifies the company, files what it learns, audits documents against the corpus and explains the gap analysis.', 'chat', ['WEEKDAY', 'TODAY', 'LEADING_LANGUAGE', 'USER_CONTEXT', 'COMPANY_CONTEXT', 'ROLE_CONTEXT'], '2026-09-15T09:30:00+00:00'],
  ['f0000000-0000-4000-8000-000000000002', 'corpus.check_citations', 'Citation check', 'Judges whether each claimed citation matches the provision the corpus holds under that number.', 'corpus', [], '2026-09-01T06:00:00+00:00'],
  ['f0000000-0000-4000-8000-000000000003', 'corpus.extract_obligations', 'Obligation extraction', 'Extracts the concrete obligations an act imposes, cited to its provisions; reviewed by an admin, reused by every report.', 'corpus', ['LANGUAGE', 'DOCUMENT_TITLE', 'JURISDICTION', 'INSTITUTION_TYPES'], '2026-09-01T06:00:00+00:00'],
  ['f0000000-0000-4000-8000-000000000004', 'report.action_plan', 'Action plan', 'Turns the open findings into a prioritised action plan with owners, effort and timeframes.', 'pipeline', ['LANGUAGE', 'TODAY', 'COMPANY_NAME'], '2026-09-01T06:00:00+00:00'],
  ['f0000000-0000-4000-8000-000000000005', 'report.applicability', 'Applicability of legal acts', 'Decides for each candidate act whether it applies to the company.', 'pipeline', ['LANGUAGE', 'TODAY', 'COMPANY_NAME'], '2026-09-01T06:00:00+00:00'],
  ['f0000000-0000-4000-8000-000000000006', 'report.gap_analysis', 'Gap analysis', 'Judges each applicable obligation against the company evidence and writes the finding.', 'pipeline', ['LANGUAGE', 'TODAY', 'COMPANY_NAME'], '2026-09-18T10:00:00+00:00'],
  ['f0000000-0000-4000-8000-000000000007', 'report.inventory', 'Document evidence inventory', 'Records what one internal document proves: controls, roles, registers, approval, weaknesses.', 'pipeline', ['LANGUAGE', 'TODAY', 'COMPANY_NAME'], '2026-09-01T06:00:00+00:00'],
  ['f0000000-0000-4000-8000-000000000008', 'report.summary', 'Executive summary', 'Writes the executive summary and the title of the report.', 'pipeline', ['LANGUAGE', 'TODAY', 'COMPANY_NAME'], '2026-09-01T06:00:00+00:00'],
].map(([id, slug, name, description, kind, variables, updatedAt]) => {
  const versions = promptVersionRows.filter((row) => row.promptSlug === slug);
  const active = runningVersion(slug);
  const newestDefault = Math.max(0, ...versions.filter((row) => row.source === 'default').map((row) => row.version));
  return {
    id,
    slug,
    name,
    description,
    kind,
    variables,
    outputSchema: null,
    activeVersion: active.version,
    activeModel: active.model,
    pendingDefault: newestDefault > active.version && active.source !== 'default' ? newestDefault : null,
    createdAt: '2026-09-01T06:00:00+00:00',
    updatedAt,
  };
});







// -----------------------------------------------------------
// promptDetail
// -----------------------------------------------------------
//
//   promptDetail('chat.assistant') → the prompt with its
//                                    versions, or undefined
//
// GET /api/prompts/{slug}: the row plus every version with
// its text, newest first.
//
// Used by:
//   - handlers.js — the prompt routes (detail, versions,
//     activate, test)
//   - promptTest (below)
// -----------------------------------------------------------

export function promptDetail(slug) {
  const row = prompts.find((prompt) => prompt.slug === slug);
  return row && {
    ...row,
    versions: promptVersionRows.filter((version) => version.promptSlug === slug).sort((a, b) => b.version - a.version),
  };
}







// What a test run of each schema-bound prompt returns (the
// step's strict output schema); the chat prompt has none and
// answers text
const PROMPT_TEST_OBJECTS = {
  'corpus.check_citations': { verdicts: [{ ref: 'C1', verdict: 'match', note: 'Straipsnis reglamentuoja kriptoturto paslaugų teikėjų leidimą.' }] },
  'corpus.extract_obligations': { obligations: [{ title: 'Gauti kriptoturto paslaugų teikėjo leidimą', titleEn: 'Obtain authorisation as a crypto-asset service provider', text: 'Kriptoturto paslaugas Sąjungoje galima teikti tik gavus leidimą.', textEn: 'Crypto-asset services may be provided only after authorisation.', addressee: 'Kriptoturto paslaugų teikėjas', conditions: '', appliesTo: ['casp'], category: 'licensing', evidence: 'Leidimas', deadline: 'Prieš pradedant teikti paslaugas', severity: 'critical', provisionRefs: ['P1'] }] },
  'report.action_plan': { actions: [{ title: 'Patvirtinti klientų kriptoturto apsaugos politiką', description: 'Parengti ir patvirtinti klientų turto atskyrimo tvarką.', priority: 1, effort: 'medium', timeframe: '30_days', ownerRole: 'Atitikties pareigūnas', category: 'safeguarding', findingRefs: ['F1'] }] },
  'report.applicability': { acts: [{ actRef: 'A1', applicability: 'applies', confidence: 0.95, reasoning: 'Bendrovė teikia kriptoturto paslaugas.', conditionsToVerify: '', provisionRefs: ['A1.P1'] }] },
  'report.gap_analysis': { findings: [{ obligationRef: 'O1', status: 'partial', severity: 'high', analysis: 'Registras vedamas, bet procedūra netvirtinta.', recommendation: 'Patvirtinti incidentų pranešimo procedūrą.', evidence: [{ ref: 'D1#0', quote: '2026-08-14;Mokėjimų sąsajos sutrikimas 2 val.;Didelis;Taip, per 4 val.' }] }] },
  'report.inventory': INVENTORY[ID.policyDoc],
  'report.summary': { title: 'UAB Pavyzdys atitikties vertinimas', summary: '## Santrauka\n\nBendrovė turi patikrintą leidimą; spragos — klientų turto apsauga ir IRT incidentų valdymas.' },
};







// -----------------------------------------------------------
// promptTest
// -----------------------------------------------------------
//
//   promptTest('report.summary', { versionNo?, text?, model? })
//     → the run, or undefined for an unknown prompt / version
//
// POST /api/prompts/{slug}/test's answer: one model run of a
// draft (text / model) or of a stored version (versionNo,
// else the active one) — text for the chat prompt, the
// schema's object for the pipeline ones, usage, cost at the
// model's price and the instructions with TODAY filled in.
//
// Used by:
//   - handlers.js — POST /api/prompts/{slug}/test
// -----------------------------------------------------------

export function promptTest(slug, { versionNo, text, model } = {}) {
  const detail = promptDetail(slug);
  if (!detail) return undefined;
  const base = detail.versions.find((version) => version.version === (versionNo ?? detail.activeVersion));
  if (!base) return undefined;
  const used = (typeof model === 'string' && model.trim()) || base.model;
  const object = PROMPT_TEST_OBJECTS[slug] ?? null;
  return {
    model: used,
    text: object ? null : 'Sveiki! Esu atitikties asistentas. Kuo galiu padėti?',
    object,
    finishReason: 'stop',
    usage: { inputTokens: 1840, outputTokens: 412, reasoningTokens: 0 },
    costUsd: costOf(used, 1840, 412),
    durationMs: 6210,
    renderedInstructions: (typeof text === 'string' ? text : base.text).replaceAll('{TODAY}', TODAY),
  };
}







// -----------------------------------------------------------
// llmCall
// -----------------------------------------------------------
//
// One LlmCall row with its detail (serialize_call +
// toolCalls, transcript): userName from the account, the
// cost at the model's price, toolCallCount from the calls;
// `extra` sets thread, job step, prompt version, duration,
// outcome, tool calls and transcript.
//
// Used by:
//   - callRows (below)
// -----------------------------------------------------------

function llmCall(id, createdAt, kind, purpose, userId, model, inputTokens, outputTokens, extra = {}) {
  const account = userId ? user(userId) : null;
  return {
    id,
    kind,
    purpose,
    userId,
    userName: account ? account.displayName || account.email : null,
    threadId: null,
    jobStepId: null,
    promptVersionId: null,
    model,
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens,
    reasoningTokens: 0,
    costUsd: costOf(model, inputTokens, outputTokens),
    durationMs: 0,
    outcome: 'ok',
    toolCallCount: (extra.toolCalls ?? []).length,
    createdAt,
    toolCalls: [],
    transcript: null,
    ...extra,
  };
}







// The two chat models the calls below ran on, and the small
// one that judges citations
const GPT = 'gateway:azure/gpt-5.5';
const TERRA = 'gateway:azure/gpt-5.6-terra';
const LUNA = 'gateway:azure/gpt-5.6-luna';

// Every model call, newest first: the two analyses of UAB
// Pavyzdys (Jonas — the finished one's citation audit on the
// small judge model), the running one of UAB Kreditas (the
// admin), the chats, a prompt test, the corpus work (MiCA
// embeddings without a user; the admin's VKĮ extraction is
// charged to the admin, as the extraction job does)
const callRows = [
  llmCall('11000000-0000-4000-8000-000000000023', '2026-09-27T09:52:10+00:00', 'job_step', 'report.gap_analysis', ID.admin, TERRA, 10200, 4300, { jobStepId: STEP_ID.runningGap, promptVersionId: runningVersion('report.gap_analysis').id, durationMs: 41800 }),
  llmCall('11000000-0000-4000-8000-000000000022', '2026-09-27T09:41:30+00:00', 'job_step', 'report.applicability', ID.admin, GPT, 19800, 1500, { jobStepId: STEP_ID.runningApplicability, promptVersionId: runningVersion('report.applicability').id, durationMs: 83900 }),
  llmCall('11000000-0000-4000-8000-000000000021', '2026-09-27T08:30:00+00:00', 'chat', 'chat', ID.jonas, GPT, 7400, 520, {
    threadId: ID.jonasThread, promptVersionId: runningVersion('chat.assistant').id, durationMs: 6100,
    transcript: { user: 'Ar mums reikia vesti su IRT susijusių incidentų registrą?', assistant: 'Taip. DORA reikalauja registruoti su IRT susijusius incidentus, o apie didelius — pranešti priežiūros institucijai (tikrintina: DORA 17 str.).' },
  }),
  llmCall('11000000-0000-4000-8000-000000000020', '2026-09-26T15:05:00+00:00', 'chat', 'chat', ID.admin, GPT, 9100, 640, {
    threadId: ID.doraThread, promptVersionId: runningVersion('chat.assistant').id, durationMs: 7800,
    toolCalls: [{ name: 'getLegalProvision', ms: 420, ok: true }],
    transcript: { user: threadHistory[ID.doraThread][0].content.parts[0].text, assistant: threadHistory[ID.doraThread][1].content.parts[3].text },
  }),
  llmCall('11000000-0000-4000-8000-000000000019', '2026-09-26T13:10:08+00:00', 'embed', 'documents.embed', ID.admin, EMBED_MODEL, 820, 0, { jobStepId: STEP_ID.complaintsEmbed, durationMs: 640 }),
  llmCall('11000000-0000-4000-8000-000000000018', '2026-09-25T13:20:00+00:00', 'prompt_test', 'report.summary', ID.admin, GPT, 5200, 900, { durationMs: 9100 }),
  llmCall('11000000-0000-4000-8000-000000000017', '2026-09-24T14:36:08+00:00', 'embed', 'obligations.embed', null, EMBED_MODEL, 310, 0, { jobStepId: STEP_ID.vkiExtract, durationMs: 410 }),
  llmCall('11000000-0000-4000-8000-000000000016', '2026-09-24T14:34:00+00:00', 'job_step', 'corpus.extract_obligations', ID.admin, TERRA, 41200, 26800, { jobStepId: STEP_ID.vkiExtract, promptVersionId: runningVersion('corpus.extract_obligations').id, durationMs: 232000 }),
  llmCall('11000000-0000-4000-8000-000000000015', '2026-09-24T07:11:40+00:00', 'embed', 'corpus.embed', null, EMBED_MODEL, 486200, 0, { jobStepId: STEP_ID.micaEmbed, durationMs: 21500 }),
  llmCall('11000000-0000-4000-8000-000000000014', '2026-09-21T09:30:55+00:00', 'job_step', 'report.summary', ID.jonas, GPT, 16200, 2700, { jobStepId: STEP_ID.doneSummary, promptVersionId: runningVersion('report.summary').id, durationMs: 55200 }),
  llmCall('11000000-0000-4000-8000-000000000013', '2026-09-21T09:27:30+00:00', 'job_step', 'report.action_plan', ID.jonas, GPT, 14800, 3900, { jobStepId: STEP_ID.donePlan, promptVersionId: runningVersion('report.action_plan').id, durationMs: 72400 }),
  llmCall('11000000-0000-4000-8000-000000000012', '2026-09-21T09:22:15+00:00', 'job_step', 'report.gap_analysis', ID.jonas, TERRA, 11900, 5000, { jobStepId: STEP_ID.doneGap, promptVersionId: runningVersion('report.gap_analysis').id, durationMs: 64100 }),
  llmCall('11000000-0000-4000-8000-000000000011', '2026-09-21T09:21:40+00:00', 'job_step', 'report.gap_analysis', ID.jonas, TERRA, 9400, 3100, { jobStepId: STEP_ID.doneGap, promptVersionId: runningVersion('report.gap_analysis').id, durationMs: 48700 }),
  llmCall('11000000-0000-4000-8000-000000000010', '2026-09-21T09:21:05+00:00', 'job_step', 'report.gap_analysis', ID.jonas, TERRA, 12100, 4800, { jobStepId: STEP_ID.doneGap, promptVersionId: runningVersion('report.gap_analysis').id, durationMs: 61900 }),
  llmCall('11000000-0000-4000-8000-000000000009', '2026-09-21T09:20:30+00:00', 'job_step', 'report.gap_analysis', ID.jonas, TERRA, 12600, 5200, { jobStepId: STEP_ID.doneGap, promptVersionId: runningVersion('report.gap_analysis').id, durationMs: 66300 }),
  llmCall('11000000-0000-4000-8000-000000000008', '2026-09-21T09:16:20+00:00', 'job_step', 'report.applicability', ID.jonas, GPT, 22400, 1850, { jobStepId: STEP_ID.doneApplicability, promptVersionId: runningVersion('report.applicability').id, durationMs: 67800 }),
  llmCall('11000000-0000-4000-8000-000000000024', '2026-09-21T09:15:11+00:00', 'job_step', 'citations.check', ID.jonas, LUNA, 2400, 380, { jobStepId: STEP_ID.doneCitations, promptVersionId: runningVersion('corpus.check_citations').id, durationMs: 2600 }),
  llmCall('11000000-0000-4000-8000-000000000007', '2026-09-21T09:02:40+00:00', 'chat', 'chat', ID.admin, GPT, 18234, 1210, {
    threadId: ID.licenceThread, promptVersionId: runningVersion('chat.assistant').id, reasoningTokens: 256, durationMs: 14230,
    toolCalls: [{ name: 'searchLegalCorpus', ms: 812, ok: true }],
    transcript: { user: threadHistory[ID.licenceThread][0].content.parts[0].text, assistant: threadHistory[ID.licenceThread][1].content.parts[3].text },
  }),
  llmCall('11000000-0000-4000-8000-000000000006', '2026-09-20T15:05:10+00:00', 'job_step', 'report.gap_analysis', ID.jonas, TERRA, 11800, 4900, { jobStepId: STEP_ID.failedGap, promptVersionId: runningVersion('report.gap_analysis').id, durationMs: 97800 }),
  llmCall('11000000-0000-4000-8000-000000000005', '2026-09-20T15:03:30+00:00', 'job_step', 'report.applicability', ID.jonas, GPT, 21840, 1760, { jobStepId: STEP_ID.failedApplicability, promptVersionId: runningVersion('report.applicability').id, durationMs: 37900 }),
  llmCall('11000000-0000-4000-8000-000000000004', '2026-09-20T15:02:50+00:00', 'job_step', 'report.inventory', ID.jonas, TERRA, 1900, 1100, { jobStepId: STEP_ID.failedDocuments, promptVersionId: runningVersion('report.inventory').id, durationMs: 9200 }),
  llmCall('11000000-0000-4000-8000-000000000003', '2026-09-20T15:02:41+00:00', 'job_step', 'report.inventory', ID.jonas, TERRA, 2200, 1400, { jobStepId: STEP_ID.failedDocuments, promptVersionId: runningVersion('report.inventory').id, durationMs: 10400 }),
  llmCall('11000000-0000-4000-8000-000000000002', '2026-09-20T15:02:30+00:00', 'job_step', 'report.inventory', ID.jonas, TERRA, 7400, 2600, { jobStepId: STEP_ID.failedDocuments, promptVersionId: runningVersion('report.inventory').id, durationMs: 21600 }),
  llmCall('11000000-0000-4000-8000-000000000001', '2026-09-20T15:02:20+00:00', 'job_step', 'report.inventory', ID.jonas, TERRA, 9800, 2900, { jobStepId: STEP_ID.failedDocuments, promptVersionId: runningVersion('report.inventory').id, durationMs: 24800 }),
];







// -----------------------------------------------------------
// usageCalls
// -----------------------------------------------------------
//
// GET /api/usage/calls's rows (serialize_call — no tool
// calls, no transcript, toolCallCount instead), every
// account's calls newest first; handlers.js scopes them to
// the caller (or scope=all / userId) and pages them.
//
// Used by:
//   - handlers.js — GET /api/usage/calls
// -----------------------------------------------------------

export const usageCalls = callRows.map((call) => Object.fromEntries(
  Object.entries(call).filter(([key]) => key !== 'toolCalls' && key !== 'transcript'),
));







// -----------------------------------------------------------
// usageCall
// -----------------------------------------------------------
//
//   usageCall(id) → the call with toolCalls ([{name, ms, ok,
//                   code?}]) and transcript ({user,
//                   assistant} for a chat turn, else null)
//
// Used by:
//   - handlers.js — GET /api/usage/calls/{id}
// -----------------------------------------------------------

export function usageCall(id) {
  return find(callRows, id);
}







// -----------------------------------------------------------
// shiftDate
// -----------------------------------------------------------
//
//   shiftDate('2026-09-27', -29) → '2026-08-29'
//
// Used by:
//   - usage, companyAction (below)
// -----------------------------------------------------------

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}







// -----------------------------------------------------------
// totalsOf
// -----------------------------------------------------------
//
// usage_views.py _totals of some calls: {calls, inputTokens,
// outputTokens, costUsd}.
//
// Used by:
//   - groupTotals, usage (below)
// -----------------------------------------------------------

function totalsOf(calls) {
  return {
    calls: calls.length,
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
    costUsd: round(calls.reduce((sum, call) => sum + call.costUsd, 0), 6),
  };
}







// -----------------------------------------------------------
// groupTotals
// -----------------------------------------------------------
//
//   groupTotals(calls, 'kind') → [{ kind, calls, …totals }]
//
// Used by:
//   - usage (below)
// -----------------------------------------------------------

function groupTotals(calls, key) {
  const values = [...new Set(calls.map((call) => call[key]))];
  return values.map((value) => ({ [key]: value, ...totalsOf(calls.filter((call) => call[key] === value)) }));
}







// -----------------------------------------------------------
// budgetOf
// -----------------------------------------------------------
//
// assistant/usage.py budget_status: the account's own daily
// budget, else unlimited (0) for an admin, else the
// installation default (2 USD); used = the account's spend
// since 00:00 UTC; remaining null when unlimited.
//
// Used by:
//   - usage, estimate (below)
// -----------------------------------------------------------

function budgetOf(userId) {
  const account = userId ? user(userId) : undefined;
  const limit = account?.dailyBudgetUsd ?? (account?.role === 'admin' ? 0 : 2);
  const used = callRows.filter((call) => call.userId === userId && call.createdAt.startsWith(TODAY))
    .reduce((sum, call) => sum + call.costUsd, 0);
  return {
    limit,
    used: round(used, 4),
    remaining: limit === 0 ? null : round(Math.max(0, limit - used), 4),
    unit: 'USD',
  };
}







// -----------------------------------------------------------
// usage
// -----------------------------------------------------------
//
//   usage({ days: 30, scope: 'all' | '', userId: '' })
//
// GET /api/usage for the default caller (the admin): own
// calls, or everybody's (scope=all), or one account's
// (userId) over the last `days` UTC days — the series
// zero-filled oldest first, the split by kind (by name) and
// by model (costliest first), the totals, the period, the
// looked-at account's budget, and byUser only for scope=all.
//
// Used by:
//   - handlers.js — GET /api/usage
// -----------------------------------------------------------

export function usage({ days = 30, scope = '', userId = '' } = {}) {
  const first = shiftDate(TODAY, 1 - days);
  const calls = callRows
    .filter((call) => (userId ? call.userId === userId : scope === 'all' || call.userId === me.id))
    .filter((call) => call.createdAt.slice(0, 10) >= first);
  const answer = {
    days: Array.from({ length: days }, (_, i) => shiftDate(first, i))
      .map((date) => ({ date, ...totalsOf(calls.filter((call) => call.createdAt.startsWith(date))) })),
    byKind: groupTotals(calls, 'kind').sort((a, b) => a.kind.localeCompare(b.kind)),
    byModel: groupTotals(calls, 'model').sort((a, b) => b.costUsd - a.costUsd),
    totals: totalsOf(calls),
    from: first,
    to: TODAY,
    budget: budgetOf(userId || me.id),
  };
  if (scope === 'all') {
    answer.byUser = groupTotals(calls, 'userId').sort((a, b) => b.costUsd - a.costUsd).map((row) => {
      const account = row.userId ? user(row.userId) : undefined;
      return { ...row, name: account?.displayName ?? null, email: account?.email ?? null };
    });
  }
  return answer;
}







// -----------------------------------------------------------
// finding
// -----------------------------------------------------------
//
// One report finding (serialize_finding) of an obligation
// under a report act: the obligation's title, text,
// category, deadline and citations snapshot (each citation
// with the act's short title and its url), whether a person
// had approved the obligation, then the verdict; the
// effective status is the reviewer's override when there is
// one. No sanction tier covers the provision, nobody wrote a
// cause and no earlier report assessed the obligation
// (`history`), unless the verdict says so.
//
// Used by:
//   - doneFindings (below)
// -----------------------------------------------------------

function finding(id, reportAct, obligationId, verdict) {
  const ob = find(obligations, obligationId);
  const row = {
    id,
    actId: reportAct.id,
    appliesFrom: null,
    obligationId,
    sourceKind: ob.sourceKind,
    documentTitle: reportAct.documentTitle,
    shortTitle: reportAct.shortTitle,
    obligationTitle: ob.title,
    obligationText: ob.text,
    obligationReviewed: ob.status === 'approved',
    category: ob.category,
    severity: ob.severity,
    analysis: '',
    recommendation: '',
    evidence: [],
    citations: ob.citations.map((citation) => ({
      ...citation,
      documentTitle: reportAct.shortTitle || reportAct.documentTitle,
      url: citationUrl(reportAct.documentId, citation.unitId),
    })),
    deadline: ob.deadline,
    consequence: [],
    cause: '',
    history: [],
    overrideStatus: null,
    reviewerNote: '',
    reviewedBy: null,
    reviewedAt: null,
    ...verdict,
  };
  return { ...row, effectiveStatus: row.overrideStatus || row.status };
}







// -----------------------------------------------------------
// reportAct
// -----------------------------------------------------------
//
// One report act (serialize_act) of an act of the catalogue:
// its titles snapshotted, then the verdict — applicability,
// confidence, reasoning, the provisions it rests on
// ({unitId, path, documentTitle}) and whether the catalogue
// screened the act out — and what the report did with the
// act. These runs are from before reports told that apart,
// so their rows say what such reports are given: every act
// that applied or might was assessed, the others left.
//
// Used by:
//   - doneActs, runningActs (below)
// -----------------------------------------------------------

function reportAct(id, actId, verdict) {
  const owner = find(acts, actId);
  const row = {
    id,
    documentId: owner.id,
    documentTitle: owner.title,
    shortTitle: owner.shortTitle,
    jurisdiction: owner.jurisdiction,
    sourceUrl: owner.sourceUrl,
    applicability: 'applies',
    confidence: 0,
    reasoning: '',
    conditionsToVerify: '',
    appliesFrom: null,
    citations: [],
    screenedOut: false,
    ...verdict,
  };
  return { assessment: row.screenedOut || row.applicability === 'not_applies' ? 'none' : 'assessed', ...row };
}







// The sanction tiers the finished run kept on its findings
// (corpus/sanctions.py — joined to a finding by its
// provision when the report ran), as the acts state them:
// MiCA's tier for a legal person with the measures beside it;
// its graver one, the percentage a fraction; the national
// crypto-asset markets law's tier, bound to a kind of breach,
// with the provision its measure comes from; DORA's, which
// leaves the fine to national law and names measures alone;
// the AI Act's
const TIERS = {
  mica: { act: 'MiCA', path: '111 str.', where: '2 d. a–c p.; 3 d. a, c p.', condition: '', maxFineEur: 5000000, maxFinePercent: 5, benefitMultiple: 2, measures: ['cease', 'public_statement'], measuresFrom: [] },
  micaGraver: { act: 'MiCA', path: '111 str.', where: '2 d. d p.; 3 d. d p.', condition: '', maxFineEur: 5000000, maxFinePercent: 12.5, benefitMultiple: 2, measures: ['cease', 'public_statement', 'management_ban'], measuresFrom: [] },
  kri: { act: 'KRĮ', path: '15 str.', where: '1 d. 1 p.', condition: 'Sistemingas arba pakartotinis pažeidimas', maxFineEur: 5000000, maxFinePercent: 10, benefitMultiple: null, measures: ['withdrawal'], measuresFrom: ['14 str. 1 d.'] },
  dora: { act: 'DORA', path: '50 str.', where: '4 d.', condition: '', maxFineEur: null, maxFinePercent: null, benefitMultiple: null, measures: ['cease', 'public_statement'], measuresFrom: [] },
  aiAct: { act: 'DI aktas', path: '99 str.', where: '4 d.', condition: '', maxFineEur: 15000000, maxFinePercent: 3, benefitMultiple: null, measures: [], measuresFrom: [] },
};

// The applicability verdicts of the UAB Pavyzdys runs (DORA,
// MiCA, the AI Act, PPTFPĮ; the consumer credit law screened
// out by its catalogue entry), in the report's order
const doneActs = [
  reportAct('e1000000-0000-4000-8000-000000000001', ID.dora, { confidence: 0.92, reasoning: 'UAB Pavyzdys yra kriptoturto paslaugų teikėjas, gavęs leidimą pagal MiCA, todėl jam taikomi DORA finansų subjektams nustatyti reikalavimai.', citations: [{ unitId: ID.doraArt2, path: '2 str.', documentTitle: 'DORA' }] }),
  reportAct('e1000000-0000-4000-8000-000000000002', ID.mica, { confidence: 0.97, reasoning: 'Bendrovė saugo ir administruoja kriptoturtą klientų vardu bei keičia jį į lėšas — tai kriptoturto paslaugos.', citations: [{ unitId: ID.micaV1Art2, path: '2 str.', documentTitle: 'MiCA' }] }),
  reportAct('e1000000-0000-4000-8000-000000000003', ID.aiAct, { applicability: 'uncertain', confidence: 0.55, reasoning: 'Bendrovė naudoja mašininio mokymosi modelį sandorių stebėsenai; neaišku, ar sistema priskirtina didelės rizikos DI sistemoms.', conditionsToVerify: 'Patikrinti, ar modelis naudojamas fizinių asmenų kreditingumui vertinti ar kitiems III priede nurodytiems tikslams.', citations: [{ unitId: ID.aiArt6, path: '6 str.', documentTitle: 'DI aktas' }] }),
  reportAct('e1000000-0000-4000-8000-000000000004', ID.aml, { confidence: 0.95, reasoning: 'Kriptoturto paslaugų teikėjai yra PPTFPĮ nurodytos finansų įstaigos.' }),
  reportAct('e1000000-0000-4000-8000-000000000005', ID.consumerCredit, { applicability: 'not_applies', confidence: 0.6, reasoning: "Screened out by the catalogue: the act targets consumer_credit, the company is recorded as 'casp'.", screenedOut: true }),
];

// The same verdicts in the failed 2026-09-20 run (the
// applicability step had finished before the failure)
const failedActs = doneActs.map((row, index) => ({ ...row, id: `e1000000-0000-4000-8000-0000000000${11 + index}` }));

// The UAB Kreditas run: the AI Act uncertain (AI use
// unknown), the AML and consumer credit laws apply, DORA and
// MiCA screened out
const runningActs = [
  reportAct('e1000000-0000-4000-8000-000000000021', ID.aiAct, { applicability: 'uncertain', confidence: 0.5, reasoning: 'Nežinoma, ar bendrovė naudoja DI sistemas; kreditingumo vertinimas DI sistema būtų didelės rizikos naudojimas.', conditionsToVerify: 'Išsiaiškinti, ar kreditingumas vertinamas naudojant DI sistemą.', citations: [{ unitId: ID.aiAnnex3, path: 'III priedas', documentTitle: 'DI aktas' }] }),
  reportAct('e1000000-0000-4000-8000-000000000022', ID.aml, { confidence: 0.93, reasoning: 'Vartojimo kredito davėjai yra PPTFPĮ nurodytos finansų įstaigos.' }),
  reportAct('e1000000-0000-4000-8000-000000000023', ID.consumerCredit, { confidence: 0.98, reasoning: 'Bendrovė teikia vartojimo kreditus internetu.', citations: [{ unitId: ID.vkiArt17, path: '17 str.', documentTitle: 'VKĮ' }] }),
  reportAct('e1000000-0000-4000-8000-000000000024', ID.dora, { applicability: 'not_applies', confidence: 0.6, reasoning: "Screened out by the catalogue: the act targets bank, casp, credit_union, crowdfunding, emi, insurance, investment_firm, payment_institution, the company is recorded as 'consumer_credit'.", screenedOut: true }),
  reportAct('e1000000-0000-4000-8000-000000000025', ID.mica, { applicability: 'not_applies', confidence: 0.6, reasoning: "Screened out by the catalogue: the act targets casp, the company is recorded as 'consumer_credit'.", screenedOut: true }),
];

// How the company's first analysis, of 2026-09-08, had found
// the obligations the finished run assessed again — what
// the finished run's findings carry as their history
// (analysis/register.py history: the same obligation in the
// earlier finished reports, newest first). The licence was
// only claimed then and the procedure named no officer; the
// incident procedure was taken to be in place, and nothing
// showed whether a register of ICT contracts was kept. The
// AI obligation of today was not assessed
const earlier = (status) => [{ reportId: ID.reportEarlier, date: '2026-09-08', status }];
const EARLIER_STATUS = {
  [ID.findingSafeguarding]: 'missing',
  [ID.findingRegister]: 'unknown',
  [ID.findingIncidents]: 'met',
  [ID.findingLicence]: 'partial',
  [ID.findingAmlOfficer]: 'missing',
  [ID.findingCorrespondent]: 'unknown',
};

// The findings of the finished run, sorted as the pipeline
// stores them (model status worst first, then severity):
// every status once or twice; the register finding carries
// the admin's override (missing → partial) made before the
// sign-off. What a breach can cost: the safeguarding gap
// stands under two tiers (MiCA's and the national law's
// graver one), the incidents gap under measures without a
// fine, the AI finding under the AI Act's; the register gap
// under none; the licence is met and keeps its tier all the
// same — a consequence is shown for a gap only. The admin
// wrote the cause of the incidents gap in the same review.
// Six of them were assessed before (EARLIER_STATUS)
const doneFindings = [
  finding(ID.findingSafeguarding, doneActs[1], ID.obSafeguarding, {
    status: 'missing', severity: 'high',
    analysis: 'Pateiktuose dokumentuose nėra klientų kriptoturto ir lėšų atskyrimo nuo nuosavo turto tvarkos.',
    recommendation: 'Parengti ir patvirtinti klientų turto apsaugos politiką su atskirų piniginių sąrašu ir kasdieniu likučių suderinimu.',
    consequence: [TIERS.mica, TIERS.kri],
    history: earlier(EARLIER_STATUS[ID.findingSafeguarding]),
  }),
  finding(ID.findingRegister, doneActs[0], ID.obRegister, {
    status: 'missing', severity: 'medium',
    analysis: 'Informacijos registro apie IRT paslaugų sutartis nepateikta.',
    recommendation: 'Sudaryti informacijos registrą ir įtraukti visus IRT paslaugų teikėjus.',
    overrideStatus: 'partial', reviewerNote: 'Registras pradėtas pildyti 2026-09-20; trūksta dviejų IRT paslaugų teikėjų duomenų.',
    reviewedBy: ID.admin, reviewedAt: '2026-09-22T08:10:00+00:00',
    history: earlier(EARLIER_STATUS[ID.findingRegister]),
  }),
  finding(ID.findingIncidents, doneActs[0], ID.obIncidentReport, {
    status: 'partial', severity: 'high',
    analysis: 'Registras rodo, kad apie didelį incidentą pranešta per 4 val., tačiau patvirtintos incidentų klasifikavimo ir pranešimo procedūros nėra.',
    recommendation: 'Patvirtinti incidentų klasifikavimo ir pranešimo priežiūros institucijai procedūrą.',
    evidence: [{ kind: 'passage', id: ID.registerDoc, chunk: 0, title: 'IRT incidentų registras', quote: '2026-08-14;Mokėjimų sąsajos sutrikimas 2 val.;Didelis;Taip, per 4 val.', documentId: ID.registerDoc, charStart: 0 }],
    consequence: [TIERS.dora],
    cause: 'Procedūra parengta iki DORA taikymo pradžios ir po to neperžiūrėta; atsakingas asmuo nepaskirtas.',
    reviewedBy: ID.admin, reviewedAt: '2026-09-22T08:12:00+00:00',
    history: earlier(EARLIER_STATUS[ID.findingIncidents]),
  }),
  finding(ID.findingAiRisk, doneActs[2], ID.obAiRisk, {
    status: 'unknown', severity: 'medium',
    analysis: 'Iš pateiktos informacijos negalima nustatyti, ar sandorių stebėsenos modelis yra didelės rizikos DI sistema.',
    recommendation: 'Pateikti DI sistemų sąrašą ir jų paskirties aprašymą.',
    evidence: [{ kind: 'profile', id: ID.pavyzdys, title: 'UAB Pavyzdys', quote: 'Sandorių stebėsenos sistema naudoja mašininio mokymosi modelį įtartiniems sandoriams žymėti.' }],
    consequence: [TIERS.aiAct],
  }),
  finding(ID.findingLicence, doneActs[1], ID.obLicence, {
    status: 'met', severity: 'critical',
    analysis: 'Bendrovė turi Lietuvos banko išduotą kriptoturto paslaugų teikėjo leidimą; leidimas patikrintas.',
    evidence: [
      { kind: 'credential', id: ID.licence, title: 'Kriptoturto paslaugų teikėjo leidimas', quote: 'Leidimo Nr. KTPT-2026-017, galioja nuo 2026-07-01' },
      { kind: 'document', id: ID.licenceDoc, title: 'Leidimo išrašas', quote: 'Leidimo Nr. KTPT-2026-017. Leidimas galioja nuo 2026-07-01.' },
    ],
    consequence: [TIERS.micaGraver],
    history: earlier(EARLIER_STATUS[ID.findingLicence]),
  }),
  finding(ID.findingAmlOfficer, doneActs[3], ID.obAmlOfficer, {
    status: 'met', severity: 'high',
    analysis: 'Procedūra numato vadovo paskirtą AML pareigūną.',
    evidence: [{ kind: 'passage', id: ID.procedureDoc, chunk: 1, title: 'Pinigų plovimo prevencijos procedūra', quote: 'Už procedūros įgyvendinimą atsako vadovo paskirtas AML pareigūnas.', documentId: ID.procedureDoc, charStart: DOC_TEXT[ID.procedureDoc].indexOf('3. Atsakingi asmenys') }],
    history: earlier(EARLIER_STATUS[ID.findingAmlOfficer]),
  }),
  finding(ID.findingCorrespondent, doneActs[3], ID.obCorrespondent, {
    status: 'not_applicable', severity: 'low',
    analysis: 'Bendrovė neturi korespondentinių santykių su trečiųjų valstybių įstaigomis.',
    evidence: [{ kind: 'profile', id: ID.pavyzdys, title: 'UAB Pavyzdys', quote: 'kriptoturto keitimas į lėšas ir į kitą kriptoturtą' }],
    history: earlier(EARLIER_STATUS[ID.findingCorrespondent]),
  }),
];

// The action plan of the finished run, by priority
const doneActions = [
  { id: 'e3000000-0000-4000-8000-000000000001', title: 'Patvirtinti klientų kriptoturto ir lėšų apsaugos politiką', description: 'Parengti ir valdybos sprendimu patvirtinti klientų kriptoturto ir lėšų atskyrimo, saugojimo ir apskaitos tvarką; numatyti kasdienį likučių suderinimą.', priority: 1, effort: 'medium', timeframe: '30_days', ownerRole: 'Atitikties pareigūnas', category: 'safeguarding', findingIds: [ID.findingSafeguarding] },
  { id: 'e3000000-0000-4000-8000-000000000002', title: 'Užbaigti IRT paslaugų sutarčių registrą ir incidentų pranešimo procedūrą', description: 'Įtraukti į informacijos registrą visus IRT paslaugų teikėjus, patvirtinti didelių incidentų klasifikavimo ir pranešimo procedūrą ir išbandyti ją pratybose.', priority: 2, effort: 'medium', timeframe: '90_days', ownerRole: 'IT vadovas', category: 'incident_reporting', findingIds: [ID.findingIncidents, ID.findingRegister] },
  { id: 'e3000000-0000-4000-8000-000000000003', title: 'Įvertinti sandorių stebėsenos modelio DI rizikos kategoriją', description: 'Dokumentuoti, kam naudojamas mašininio mokymosi modelis, ir įvertinti, ar jis nepatenka į DI akto III priedo kategorijas.', priority: 3, effort: 'low', timeframe: 'immediate', ownerRole: 'Atitikties pareigūnas', category: 'ai_governance', findingIds: [ID.findingAiRisk] },
];

// -----------------------------------------------------------
// reportCitation
// -----------------------------------------------------------
//
// One row of a report's citation audit (serialize_citation):
// the reference a document's inventory records
// (INVENTORY[documentId].citations[index]) as written, then
// what the check found in the act's version of the day —
// `check` names the act (actId; none when the corpus lacks
// it) and the provision (unitId; none when the act has no
// such one), the judge's heading match and note. Status,
// verdict, heading (a paragraph's is its article's), excerpt
// and link follow as the server derives them.
//
// Used by:
//   - doneCitations (below)
// -----------------------------------------------------------

function reportCitation(id, documentId, index, check) {
  const unit = check.unitId ? find(allProvisions, check.unitId) : null;
  const owner = check.actId ? find(acts, check.actId) : null;
  const status = unit ? 'found' : owner ? 'not_found' : 'act_not_in_corpus';
  const headingMatch = unit ? check.headingMatch : null;
  const article = unit && unit.unitType !== 'article' ? find(allProvisions, unit.parentId) : unit;
  return {
    id,
    documentId,
    documentTitle: find(companyDocuments, documentId).title,
    ...INVENTORY[documentId].citations[index],
    status,
    headingMatch,
    verdict: unit ? (['match', 'mismatch'].includes(headingMatch) ? headingMatch : 'unknown') : status,
    judgedBy: unit ? 'model' : null,
    legalDocumentId: owner?.id ?? null,
    shortTitle: owner?.shortTitle ?? '',
    unitId: unit?.id ?? null,
    unitPath: unit?.path ?? '',
    heading: unit ? (unit.heading || article?.heading || '') : '',
    note: unit ? check.note : '',
    excerpt: unit ? unit.text.slice(0, 600) : '',
    citationUrl: unit ? citationUrl(owner.id, unit.id) : '',
  };
}







// The finished run's citation audit, stored problems first:
// the procedure cites PPTFPĮ 9(1) for enhanced due diligence
// (the article sets ordinary identification) and a FNTT
// order the corpus lacks, and its "other requirements" of
// 22(3) could not be judged; the licence extract names MiCA
// 66(4) for safekeeping (it is the pricing disclosure) and an
// Article 82a MiCA does not have, and cites 59(1) rightly.
// One judge call compared the four found ones
const doneCitations = [
  reportCitation('e4000000-0000-4000-8000-000000000001', ID.procedureDoc, 0, {
    actId: ID.aml, unitId: ID.amlArt9Par1, headingMatch: 'mismatch',
    note: 'Nuostata reglamentuoja kliento ir naudos gavėjo tapatybės nustatymą prieš užmezgant santykius, ne sustiprintą tapatybės nustatymą (jį nustato 14 straipsnis).',
  }),
  reportCitation('e4000000-0000-4000-8000-000000000002', ID.licenceDoc, 1, {
    actId: ID.mica, unitId: ID.micaV1Art66Par4, headingMatch: 'mismatch',
    note: 'Nuostata reglamentuoja kainodaros, išlaidų ir mokesčių skelbimą, ne klientų kriptoturto saugojimą.',
  }),
  reportCitation('e4000000-0000-4000-8000-000000000003', ID.licenceDoc, 2, { actId: ID.mica }),
  reportCitation('e4000000-0000-4000-8000-000000000004', ID.procedureDoc, 2, {
    actId: ID.aml, unitId: ID.amlArt22Par3, headingMatch: 'unknown',
    note: 'Teiginys per bendras, kad jį būtų galima palyginti su nuostata.',
  }),
  reportCitation('e4000000-0000-4000-8000-000000000005', ID.procedureDoc, 1, {}),
  reportCitation('e4000000-0000-4000-8000-000000000006', ID.licenceDoc, 0, {
    actId: ID.mica, unitId: ID.micaV1Art59Par1, headingMatch: 'match',
    note: 'Nuostata leidžia teikti kriptoturto paslaugas tik gavus leidimą.',
  }),
];

// The model calls of the finished run (its job's steps) —
// what its stats sum
const doneStepIds = jobSteps[ID.jobReportDone].map((row) => row.id);
const doneCalls = callRows.filter((call) => doneStepIds.includes(call.jobStepId));

// UAB Pavyzdys as the analyses froze it (json_safe of the
// company detail, no ownerName: the pipeline's company row
// has no owner loaded): 22 employees then, the documents
// uploaded before the run — inventories read on 2026-09-20,
// so the first run's snapshot still has none
const pavyzdysSnapshot = {
  ...pavyzdysProfile,
  employees: 22,
  updatedAt: '2026-09-12T14:10:00+00:00',
  credentials: credentialRows,
  roles: roleRows,
  documents: companyDocuments.filter((doc) => doc.companyId === ID.pavyzdys && doc.uploadedAt < '2026-09-20')
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
};
const failedSnapshot = {
  ...pavyzdysSnapshot,
  documents: pavyzdysSnapshot.documents.map((doc) => ({ ...doc, documentType: null, inventorySummary: null })),
};

// The report fields the list leaves out (serialize_report
// full=True): summary, the frozen profile, acts, the acts
// outdated since (MiCA read at version 1, now 2), findings,
// actions and the citation audit's rows — per report
const reportDetails = {
  [ID.reportRunning]: { summary: '', profileSnapshot: { ...kreditasProfile, credentials: [], roles: [], documents: companyDocuments.filter((doc) => doc.companyId === ID.kreditas) }, acts: runningActs, outdatedActs: [], findings: [], actions: [], citations: [] },
  [ID.reportDone]: { summary: DONE_SUMMARY, profileSnapshot: pavyzdysSnapshot, acts: doneActs, outdatedActs: ['MiCA'], findings: doneFindings, actions: doneActions, citations: doneCitations },
  [ID.reportFailed]: { summary: '', profileSnapshot: failedSnapshot, acts: failedActs, outdatedActs: ['MiCA'], findings: [], actions: [], citations: [] },
};







// -----------------------------------------------------------
// reports
// -----------------------------------------------------------
//
// GET /api/reports's rows (serialize_report with the job:
// progress and jobStatus mirror it), newest first: UAB
// Kreditas' analysis running now, UAB Pavyzdys' finished and
// approved one — its stats (counts, provenance, tokens and
// cost) summed from its own findings and model calls, with
// what moved since the company's first analysis — and
// the earlier one that failed on a gateway timeout. All
// three ran before a report's list of acts could be
// reviewed, so none carries a scope approval.
//
// Used by:
//   - handlers.js — GET /api/reports (companyId filter),
//     company deletion
//   - report (below)
// -----------------------------------------------------------

export const reports = [
  {
    id: ID.reportRunning, companyId: ID.kreditas, companyName: 'UAB Kreditas', createdBy: ID.admin, jobId: ID.jobReportRunning,
    status: 'running', language: 'lt', scope: { documentIds: [] }, title: '', stats: {}, error: null,
    approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
    scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: null,
    createdAt: '2026-09-27T09:40:00+00:00', startedAt: '2026-09-27T09:40:03+00:00', finishedAt: null,
    progress: find(jobs, ID.jobReportRunning).progress, jobStatus: 'running',
  },
  {
    id: ID.reportDone, companyId: ID.pavyzdys, companyName: 'UAB Pavyzdys', createdBy: ID.jonas, jobId: ID.jobReportDone,
    status: 'done', language: 'lt', scope: { documentIds: [] }, title: 'UAB Pavyzdys atitikties vertinimas: MiCA, DORA ir PPTFPĮ',
    stats: {
      acts: Object.fromEntries(['applies', 'uncertain', 'not_applies'].map((key) => [key, doneActs.filter((row) => row.applicability === key).length])),
      // Counted from the EFFECTIVE statuses — a review recounts
      // them (analysis/pipeline.py finding_counts)
      findings: Object.fromEntries(['met', 'partial', 'missing', 'unknown', 'not_applicable'].map((key) => [key, doneFindings.filter((row) => (row.overrideStatus || row.status) === key).length])),
      openBySeverity: Object.fromEntries(['critical', 'high', 'medium', 'low'].map((key) => [key, doneFindings.filter((row) => ['missing', 'partial'].includes(row.overrideStatus || row.status) && row.severity === key).length])),
      actions: doneActions.length,
      // The citation audit's verdicts counted (pipeline.py
      // citation_counts) — the list rows carry no rows
      citations: {
        checked: doneCitations.length,
        ...Object.fromEntries([['match', 'match'], ['mismatch', 'mismatch'], ['notFound', 'not_found'], ['notInCorpus', 'act_not_in_corpus'], ['unknown', 'unknown']]
          .map(([key, verdict]) => [key, doneCitations.filter((row) => row.verdict === verdict).length])),
      },
      reviewedObligations: doneFindings.filter((row) => row.obligationReviewed).length,
      // What moved since the company's earlier report
      // (analysis/register.py changes): the licence and the AML
      // officer were gaps and are met; the register is a gap
      // the earlier report had not found open (nothing showed
      // then whether one was kept); the incident procedure was
      // met and is a gap again
      changes: {
        since: ID.reportEarlier, sinceDate: '2026-09-08',
        closed: { count: 2, titles: [ID.obLicence, ID.obAmlOfficer].map((id) => find(obligations, id).title) },
        new: { count: 1, titles: [find(obligations, ID.obRegister).title] },
        back: { count: 1, titles: [find(obligations, ID.obIncidentReport).title] },
      },
      tokens: doneCalls.reduce((sum, call) => sum + call.inputTokens + call.outputTokens, 0),
      costUsd: round(doneCalls.reduce((sum, call) => sum + call.costUsd, 0), 6),
      provenance: {
        prompts: [...new Set(doneCalls.map((call) => call.promptVersionId))]
          .map((id) => find(promptVersionRows, id))
          .map((version) => ({ slug: version.promptSlug, version: version.version, model: version.model }))
          .sort((a, b) => a.slug.localeCompare(b.slug)),
        models: [...new Set(doneCalls.map((call) => call.model))].sort(),
        corpus: [[ID.dora, ID.doraV1], [ID.mica, ID.micaV1], [ID.aiAct, ID.aiActV1], [ID.aml, ID.amlV1]]
          .map(([actId, versionId]) => ({ act: find(acts, actId).shortTitle, versionNo: legalVersions[versionId].versionNo, versionDate: legalVersions[versionId].effectiveDate })),
      },
    },
    error: null,
    approvedBy: ID.admin, approvedByName: adminUser.displayName, approvedAt: '2026-09-22T08:30:00+00:00', approvalNote: 'Peržiūrėta su atitikties pareigūnu.',
    scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: null,
    createdAt: '2026-09-21T09:15:00+00:00', startedAt: '2026-09-21T09:15:04+00:00', finishedAt: '2026-09-21T09:31:47+00:00',
    progress: find(jobs, ID.jobReportDone).progress, jobStatus: 'done',
  },
  {
    id: ID.reportFailed, companyId: ID.pavyzdys, companyName: 'UAB Pavyzdys', createdBy: ID.jonas, jobId: ID.jobReportFailed,
    status: 'failed', language: 'lt', scope: { documentIds: [] }, title: '', stats: {}, error: REPORT_FAILURE,
    approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
    scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: null,
    createdAt: '2026-09-20T15:02:00+00:00', startedAt: '2026-09-20T15:02:03+00:00', finishedAt: '2026-09-20T15:05:40+00:00',
    progress: find(jobs, ID.jobReportFailed).progress, jobStatus: 'failed',
  },
];







// -----------------------------------------------------------
// report
// -----------------------------------------------------------
//
//   report(ID.reportDone) → the full report, or undefined
//
// GET /api/reports/{id}: the row plus summary,
// profileSnapshot, acts, outdatedActs, findings, actions and
// citations. A report just started (NEW) has all of them
// empty; the one waiting for its list of acts to be approved
// (waitingReport) has its acts and its citation audit, and
// nothing of the second part yet; the one that also assessed
// the company's own requirements (ownReport) is the finished
// run with that group added — its row among the acts, its
// findings after the others, one more action, and the
// finished run in every finding's history; the company's
// first analysis (earlierReport) is the finished run as it
// stood then — the verdicts of EARLIER_STATUS, nothing
// reviewed, no history.
//
// Used by:
//   - handlers.js — the report routes (approve, cancel,
//     scope, delete, findings, export)
//   - reportExport (below)
// -----------------------------------------------------------

export function report(id) {
  if (id === ID.newReport) {
    return { ...NEW.report, summary: '', profileSnapshot: {}, acts: [], outdatedActs: [], findings: [], actions: [], citations: [] };
  }
  if (id === ID.reportWaiting) {
    return { ...waitingReport, summary: '', profileSnapshot: pavyzdysSnapshot, acts: waitingActs, outdatedActs: [], findings: [], actions: [], citations: doneCitations };
  }
  if (id === ID.reportOwn) {
    return {
      ...ownReport, ...reportDetails[ID.reportDone], acts: [...doneActs, ownAct], outdatedActs: [],
      findings: [...doneFindings.map((row) => ({ ...row, history: [{ reportId: ID.reportDone, date: '2026-09-21', status: row.effectiveStatus }, ...row.history] })), ...ownFindings],
      actions: [...doneActions, ownAction],
    };
  }
  if (id === ID.reportEarlier) {
    return { ...earlierReport, ...reportDetails[ID.reportDone], findings: earlierFindings, actions: earlierActions };
  }
  const row = find(reports, id);
  return row && { ...row, ...reportDetails[id] };
}







// The estimates (analysis/estimate.py) per company, at the
// gateway prices: UAB Pavyzdys pays for MiCA version 2's
// first extraction too (327 obligations estimated from 149
// articles); a new company of unknown type takes every act
const ESTIMATES = {
  [ID.pavyzdys]: { pricesKnown: true, acts: 4, obligations: 332, actsToExtract: ['MiCA'], analysisUsd: 2.43, extractionUsd: 3.46, totalUsd: 5.88, upperBound: true },
  [ID.kreditas]: { pricesKnown: true, acts: 3, obligations: 4, actsToExtract: [], analysisUsd: 0.58, extractionUsd: 0, totalUsd: 0.58, upperBound: true },
  [ID.newCompany]: { pricesKnown: true, acts: 5, obligations: 333, actsToExtract: ['MiCA'], analysisUsd: 2.59, extractionUsd: 3.46, totalUsd: 6.05, upperBound: true },
};

// What assessing a company's own requirements adds to its
// estimate (analysis/internal.py internal_estimate): UAB
// Pavyzdys has one policy-level document with text, its
// compliance policy, not read yet — eight requirements are
// expected of it; UAB Kreditas' only policy is a scan without
// text, and a new company has no document at all
const OWN_ESTIMATES = {
  [ID.pavyzdys]: { documents: 1, requirements: 8, usd: 0.21 },
};







// -----------------------------------------------------------
// estimate
// -----------------------------------------------------------
//
// GET /api/reports/estimate?companyId=[&internal=true]: the
// upper-bound cost of analysing the company, or undefined for
// a company the world lacks, plus the caller's budget (the
// admin's: unlimited, remaining null). Every answer says how
// many policy-level documents the company has
// (policyDocuments). Asked for the company's own
// requirements too (`internal`), it prices them apart — the
// documents, the requirements, the USD — and counts that
// into the total, not into the analysis; a company without a
// policy-level document answers zeros.
//
// Used by:
//   - handlers.js — GET /api/reports/estimate
//   - tests — the figures the start dialog must show
// -----------------------------------------------------------

export function estimate(companyId, internal = false) {
  const base = ESTIMATES[companyId];
  if (!base) return undefined;
  const own = OWN_ESTIMATES[companyId] ?? { documents: 0, requirements: 0, usd: 0 };
  return {
    ...base,
    ...(internal ? { internal: own, totalUsd: round(base.totalUsd + own.usd, 2) } : {}),
    policyDocuments: own.documents,
    budget: budgetOf(me.id),
  };
}







// The verdicts of UAB Pavyzdys' newest analysis, which waits
// for its list of acts to be approved — every kind of act a
// run hands over, in the report's order: DORA, MiCA and
// PPTFPĮ assessed (the verdicts of the finished run); the AI
// Act assessed as preparation, its high-risk rules applying
// from 2027-08-02; the e-money law waiting for a fact the
// profile does not state; the AML directive standing behind
// PPTFPĮ; the payments law judged not applicable; the
// consumer credit law screened out by its catalogue entry.
// The three acts the run leaves and this catalogue lacks
// carry no document
const waitingActs = [
  { ...doneActs[0], id: 'e1000000-0000-4000-8000-000000000031', docType: 'regulation' },
  { ...doneActs[1], id: 'e1000000-0000-4000-8000-000000000032', docType: 'regulation' },
  { ...doneActs[3], id: 'e1000000-0000-4000-8000-000000000033', docType: 'law' },
  reportAct('e1000000-0000-4000-8000-000000000034', ID.aiAct, {
    docType: 'regulation', confidence: 0.88, appliesFrom: '2027-08-02', assessment: 'upcoming',
    reasoning: 'Bendrovė sandorių stebėsenai naudoja mašininio mokymosi modelį; jai kaip diegėjai skirti didelės rizikos DI sistemų reikalavimai pradedami taikyti 2027 m. rugpjūčio 2 d.',
    citations: [{ unitId: ID.aiArt6, path: '6 str.', documentTitle: 'DI aktas' }],
  }),
  {
    id: 'e1000000-0000-4000-8000-000000000035', documentId: null, documentTitle: 'Lietuvos Respublikos elektroninių pinigų ir elektroninių pinigų įstaigų įstatymas',
    shortTitle: 'EPĮ', jurisdiction: 'LT', docType: 'law', sourceUrl: '', applicability: 'uncertain', confidence: 0.5,
    reasoning: 'Įstatymas būtų taikomas, jei bendrovė leistų elektroninių pinigų žetonus; profilyje apie tai nieko nenurodyta.',
    conditionsToVerify: 'Ar bendrovė leidžia elektroninių pinigų žetonus arba ketina tai daryti?', appliesFrom: null,
    assessment: 'unconfirmed', citations: [], screenedOut: false,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000036', documentId: null, documentTitle: 'Direktyva (ES) 2024/1640 dėl mechanizmų, kuriuos valstybės narės turi nustatyti',
    shortTitle: 'AMLD6', jurisdiction: 'EU', docType: 'directive', sourceUrl: '', applicability: 'applies', confidence: 0.9,
    reasoning: 'Direktyvą į Lietuvos teisę perkelia PPTFPĮ, pagal kurį įmonė ir vertinama.', conditionsToVerify: '', appliesFrom: null,
    assessment: 'indirect', citations: [], screenedOut: false,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000037', documentId: null, documentTitle: 'Lietuvos Respublikos mokėjimų įstatymas',
    shortTitle: 'MĮ', jurisdiction: 'LT', docType: 'law', sourceUrl: '', applicability: 'not_applies', confidence: 0.86,
    reasoning: 'Bendrovė neteikia mokėjimo paslaugų: kriptoturto keitimas į lėšas atliekamas per licencijuotą mokėjimo įstaigą.', conditionsToVerify: '',
    appliesFrom: null, assessment: 'none', citations: [], screenedOut: false,
  },
  { ...doneActs[4], id: 'e1000000-0000-4000-8000-000000000038', docType: 'law' },
];

// The first job of the waiting report: it ended when the run
// stopped for the approval, saying what the report waits for.
// Like the report, it is not among the lists
const waitingJob = {
  id: ID.jobReportWaiting, kind: 'report.analyze', subject: `report:${ID.reportWaiting}`, status: 'done', priority: 0,
  progress: { step: 'applicability', percent: 100, message: null }, result: { reportId: ID.reportWaiting, waiting: 'scope' }, error: null,
  attempts: 1, maxAttempts: 1, cancelRequested: false, createdBy: ID.admin,
  createdAt: '2026-09-27T09:50:00+00:00', startedAt: '2026-09-27T09:50:02+00:00', finishedAt: '2026-09-27T09:52:40+00:00',
};

// The prompts a run's first part calls — what a waiting
// report's provenance can name
const FIRST_PART_PROMPTS = ['corpus.check_citations', 'report.applicability', 'report.inventory'];

// analysis/estimate.py's guess for an act never read: this
// many obligations per article
const OBLIGATIONS_PER_ARTICLE = 2.2;

// The second part's price at the double's flat rates: what
// judging one obligation costs, and the plan and the summary
// every run ends with
const JUDGING_USD = 0.006;
const CLOSING_USD = 0.1;







// -----------------------------------------------------------
// waitingReport
// -----------------------------------------------------------
//
// UAB Pavyzdys' analysis started with the review of its list
// of acts, as serialize_report writes its row once the first
// part is done: status scope_review, the review asked for in
// its scope, nobody's approval yet, and the stats the
// pipeline stores before it stops — the acts by verdict and
// by what the run would do with them, no findings and no
// actions, the citation audit's counts (the documents are
// those the finished run read), the tokens and the cost so
// far, the provenance of the first part. Its job ended with
// the first part. It is not among `reports`: the world's
// lists are from before this run, and a test that wants it
// listed adds it.
//
// Used by:
//   - report (above) — its detail
//   - tests — a list that holds a waiting report
// -----------------------------------------------------------

export const waitingReport = {
  id: ID.reportWaiting, companyId: ID.pavyzdys, companyName: 'UAB Pavyzdys', createdBy: ID.admin, jobId: ID.jobReportWaiting,
  status: 'scope_review', language: 'lt', scope: { documentIds: [], review: true }, title: '',
  stats: {
    acts: {
      ...Object.fromEntries(['applies', 'uncertain', 'not_applies'].map((key) => [key, waitingActs.filter((row) => row.applicability === key).length])),
      ...Object.fromEntries(['assessed', 'upcoming', 'unconfirmed', 'indirect'].map((key) => [key, waitingActs.filter((row) => row.assessment === key).length])),
    },
    findings: { met: 0, partial: 0, missing: 0, unknown: 0, not_applicable: 0 },
    openBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    actions: 0,
    citations: find(reports, ID.reportDone).stats.citations,
    reviewedObligations: 0,
    tokens: 38420,
    costUsd: 0.1712,
    provenance: {
      prompts: find(reports, ID.reportDone).stats.provenance.prompts.filter((row) => FIRST_PART_PROMPTS.includes(row.slug)),
      models: [...new Set(find(reports, ID.reportDone).stats.provenance.prompts.filter((row) => FIRST_PART_PROMPTS.includes(row.slug)).map((row) => row.model))].sort(),
      corpus: [[ID.dora, ID.doraV1], [ID.mica, ID.micaV2], [ID.aml, ID.amlV1], [ID.aiAct, ID.aiActV1]]
        .map(([actId, versionId]) => ({ act: find(acts, actId).shortTitle, versionNo: legalVersions[versionId].versionNo, versionDate: legalVersions[versionId].effectiveDate })),
    },
  },
  error: null,
  approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
  scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: null,
  createdAt: waitingJob.createdAt, startedAt: waitingJob.startedAt, finishedAt: null,
  progress: waitingJob.progress, jobStatus: waitingJob.status,
};







// -----------------------------------------------------------
// scopeActs
// -----------------------------------------------------------
//
// The acts of the waiting report after a person's choices,
// as the scope view makes them (analysis/api/views.py
// report_scope): "assess" takes in an act the run left —
// assessed, or as preparation when it applies from a later
// date, and no longer screened out — "skip" leaves an
// assessed one out, an act not named keeps what the run
// decided; the verdict itself stays on the row. Undefined
// for any other report.
//
// Used by:
//   - scopeEstimate (below)
//   - handlers.js — the approval's answer
// -----------------------------------------------------------

export function scopeActs(reportId, choices = {}) {
  if (reportId !== ID.reportWaiting) return undefined;
  return waitingActs.map((act) => {
    const assessed = ['assessed', 'upcoming'].includes(act.assessment);
    if (choices[act.id] === 'assess' && !assessed) {
      return { ...act, assessment: act.appliesFrom && act.appliesFrom > TODAY ? 'upcoming' : 'assessed', screenedOut: false };
    }
    if (choices[act.id] === 'skip' && assessed) return { ...act, assessment: 'none' };
    return act;
  });
}







// -----------------------------------------------------------
// scopeEstimate
// -----------------------------------------------------------
//
// POST /api/reports/{id}/scope without `approved` — the dry
// run: what the second part of the waiting report would cost
// for the acts assessed after the choices
// (analysis/estimate.py estimate_rest), plus the caller's
// budget. Per act: the obligations a crypto-asset service
// provider is judged on, counted in this world — every
// obligation of an act that does not bind the company and is
// assessed by choice — or, for an act whose current version
// was never read (MiCA version 2), the guess from its
// articles and the flag that it is read first; an act
// without a document in the catalogue is priced nothing and
// has no row. The reading of MiCA costs what the start's
// estimate says; the judging follows the flat rates above.
// For a report started with the company's own requirements
// (`internal`) the dry run prices them too, as the start's
// estimate does: the same block, counted into the total and
// not into the analysis. Undefined for any other report.
//
// Used by:
//   - handlers.js — POST /api/reports/{id}/scope
//   - tests — the figures the approval screen must show
// -----------------------------------------------------------

export function scopeEstimate(reportId, choices = {}, internal = false) {
  const chosen = scopeActs(reportId, choices)?.filter((act) => ['assessed', 'upcoming'].includes(act.assessment));
  if (!chosen) return undefined;
  const kind = pavyzdysProfile.institutionType;
  const rows = [];
  let extractionUsd = 0;
  for (const act of chosen) {
    const version = find(acts, act.documentId)?.currentVersion;
    if (!version) continue;
    if (version.obligationsExtractedAt) {
      const everyone = act.applicability === 'not_applies';
      const count = obligations.filter((row) => row.documentId === act.documentId && row.status !== 'rejected'
        && (everyone || row.appliesTo.length === 0 || row.appliesTo.includes('all') || row.appliesTo.includes(kind))).length;
      rows.push({ id: act.id, obligations: count, toExtract: false });
    } else {
      rows.push({ id: act.id, obligations: Math.floor(version.articleCount * OBLIGATIONS_PER_ARTICLE), toExtract: true });
      extractionUsd += ESTIMATES[ID.pavyzdys].extractionUsd;
    }
  }
  const total = rows.reduce((sum, row) => sum + row.obligations, 0);
  const analysisUsd = total ? round(total * JUDGING_USD + CLOSING_USD, 2) : 0;
  const own = internal ? OWN_ESTIMATES[ID.pavyzdys] : null;
  return {
    estimate: {
      acts: rows, obligations: total, analysisUsd, extractionUsd: round(extractionUsd, 2),
      ...(own ? { internal: own } : {}),
      totalUsd: round(analysisUsd + extractionUsd + (own?.usd ?? 0), 2), upperBound: true,
    },
    budget: budgetOf(me.id),
  };
}







// The row the company's own requirements hang on in the
// report that assessed them (analysis/internal.py
// step_internal): no document of the corpus and no verdict
// of a model — the criterion is what the company's own
// policy-level documents require
const ownAct = {
  id: 'e1000000-0000-4000-8000-000000000041', documentId: null, documentTitle: 'Įmonės vidaus reikalavimai', shortTitle: 'Vidaus reikalavimai',
  jurisdiction: '', docType: 'internal', sourceUrl: '', applicability: 'applies', confidence: 1,
  reasoning: 'Įmonės politikos lygmens dokumentų nustatyti reikalavimai, vertinami pagal tai, ar juos įgyvendina kiti įmonės dokumentai. Tai įmonės pačios sau nustatytos taisyklės, ne teisės aktų pareigos.',
  conditionsToVerify: '', appliesFrom: null, assessment: 'assessed', citations: [], screenedOut: false,
};







// -----------------------------------------------------------
// ownFinding
// -----------------------------------------------------------
//
// One finding of the company's own requirements
// (serialize_finding of a row step_internal stores): it hangs
// on ownAct, its kind is "internal", no sanction tier stands
// behind it and no person approved the requirement yet. Its
// criterion is a passage of the compliance policy — the
// section, the document and the quote, placed where the
// policy's text holds it word for word (`start` null where
// it does not).
//
// Used by:
//   - ownFindings (below)
// -----------------------------------------------------------

function ownFinding(id, section, quote, row) {
  const start = DOC_TEXT[ID.policyDoc].indexOf(quote);
  return {
    id,
    actId: ownAct.id,
    appliesFrom: null,
    obligationId: null,
    sourceKind: 'internal',
    documentTitle: ownAct.documentTitle,
    shortTitle: ownAct.shortTitle,
    obligationReviewed: false,
    recommendation: '',
    evidence: [],
    citations: [{ path: section, documentId: ID.policyDoc, documentTitle: 'Atitikties politika', quote, start: start < 0 ? null : start }],
    deadline: '',
    consequence: [],
    cause: '',
    history: [],
    overrideStatus: null,
    reviewerNote: '',
    reviewedBy: null,
    reviewedAt: null,
    ...row,
    effectiveStatus: row.status,
  };
}







// What the compliance policy of UAB Pavyzdys requires of the
// company itself, judged against its other documents, worst
// first: no quarterly report to the board was ever filed; the
// yearly compliance risk assessment is carried out for money
// laundering alone; the policy's reach is reflected in the
// procedure (the model quoted that requirement with a word of
// its own, so the quote has no place in the text)
const ownFindings = [
  ownFinding(ID.findingOwnReports, '7.2 p.', 'Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką.', {
    obligationTitle: 'Kas ketvirtį teikti valdybai atitikties rizikos ataskaitą',
    obligationText: 'Atitikties pareigūnas kas ketvirtį teikia valdybai ataskaitą apie atitikties riziką.',
    category: 'reporting', status: 'missing', severity: 'high',
    analysis: 'Tarp pateiktų dokumentų nėra nė vienos valdybai teiktos atitikties rizikos ataskaitos ir nėra tvarkos, kuri nustatytų, kas ir kada ją rengia.',
    recommendation: 'Nustatyti ketvirtinės ataskaitos rengimo tvarką ir saugoti valdybai pateiktas ataskaitas.',
  }),
  ownFinding(ID.findingOwnRisk, '7.2 p.', 'Atitikties rizikos vertinimas atliekamas ne rečiau kaip kartą per metus.', {
    obligationTitle: 'Bent kartą per metus atlikti atitikties rizikos vertinimą',
    obligationText: 'Atitikties rizikos vertinimas atliekamas ne rečiau kaip kartą per metus.',
    category: 'risk_management', status: 'partial', severity: 'medium',
    analysis: 'Pinigų plovimo prevencijos procedūra numato nuolatinę sandorių stebėseną, tačiau visos bendrovės atitikties rizikos vertinimo tvarkos ir jo rezultatų nepateikta.',
    recommendation: 'Parengti metinio atitikties rizikos vertinimo metodiką ir dokumentuoti jo rezultatus.',
    evidence: [{ kind: 'passage', id: ID.procedureDoc, chunk: 2, title: 'Pinigų plovimo prevencijos procedūra', quote: 'Įtartini sandoriai žymimi automatiškai ir peržiūrimi per vieną darbo dieną.', documentId: ID.procedureDoc, charStart: DOC_TEXT[ID.procedureDoc].indexOf('5. Sandorių stebėsena') }],
  }),
  ownFinding(ID.findingOwnScope, '2 p.', 'Politika taikoma visiems darbuotojams bei valdybos nariams.', {
    obligationTitle: 'Taikyti politiką visiems darbuotojams ir valdybos nariams',
    obligationText: 'Politika taikoma visiems darbuotojams ir valdybos nariams.',
    category: 'governance', status: 'met', severity: 'low',
    analysis: 'Pinigų plovimo prevencijos procedūra taikoma visiems klientams ir sandoriams ir nurodo už ją atsakingą asmenį, todėl politikos taikymo sritis procedūroje atspindėta.',
    evidence: [{ kind: 'passage', id: ID.procedureDoc, chunk: 1, title: 'Pinigų plovimo prevencijos procedūra', quote: 'Už procedūros įgyvendinimą atsako vadovo paskirtas AML pareigūnas.', documentId: ID.procedureDoc, charStart: DOC_TEXT[ID.procedureDoc].indexOf('3. Atsakingi asmenys') }],
  }),
];

// The action the plan adds for the open ones — they go into
// the plan with the gaps against the law
const ownAction = { id: 'e3000000-0000-4000-8000-000000000004', title: 'Įgyvendinti atitikties politikoje nustatytą atskaitomybę valdybai', description: 'Nustatyti ketvirtinės atitikties rizikos ataskaitos ir metinio atitikties rizikos vertinimo tvarką, paskirti atsakingą asmenį ir saugoti valdybai pateiktus dokumentus.', priority: 4, effort: 'low', timeframe: '90_days', ownerRole: 'Atitikties pareigūnas', category: 'reporting', findingIds: [ID.findingOwnReports, ID.findingOwnRisk] };







// -----------------------------------------------------------
// ownReport
// -----------------------------------------------------------
//
// UAB Pavyzdys' analysis started with the assessment of the
// company's own requirements (scope.internal), as
// serialize_report writes its row: the finished run made
// again on 2026-09-26 by the administrator, not signed off
// yet, MiCA read at its current version. Its stats are the
// finished run's with one action more and the group's own
// counts (stats.internal — by effective status, the open
// ones per severity); the counts of the acts, of the
// findings and of the open findings do not hold the group.
// Since the finished run of 2026-09-21 nothing moved
// (stats.changes — every count zero).
// It is not among `reports`, and its job is not among the
// jobs: the page of a finished report asks for none.
//
// Used by:
//   - report (above) — its detail
//   - tests — a report that holds the group
// -----------------------------------------------------------

export const ownReport = {
  ...find(reports, ID.reportDone),
  id: ID.reportOwn, createdBy: ID.admin, jobId: ID.jobReportOwn, scope: { documentIds: [], internal: true },
  stats: {
    ...find(reports, ID.reportDone).stats,
    actions: doneActions.length + 1,
    changes: { since: ID.reportDone, sinceDate: '2026-09-21', closed: { count: 0, titles: [] }, new: { count: 0, titles: [] }, back: { count: 0, titles: [] } },
    internal: {
      findings: Object.fromEntries(['met', 'partial', 'missing', 'unknown', 'not_applicable'].map((key) => [key, ownFindings.filter((row) => row.effectiveStatus === key).length])),
      openBySeverity: Object.fromEntries(['critical', 'high', 'medium', 'low'].map((key) => [key, ownFindings.filter((row) => ['missing', 'partial'].includes(row.effectiveStatus) && row.severity === key).length])),
    },
    provenance: {
      ...find(reports, ID.reportDone).stats.provenance,
      corpus: [[ID.dora, ID.doraV1], [ID.mica, ID.micaV2], [ID.aiAct, ID.aiActV1], [ID.aml, ID.amlV1]]
        .map(([actId, versionId]) => ({ act: find(acts, actId).shortTitle, versionNo: legalVersions[versionId].versionNo, versionDate: legalVersions[versionId].effectiveDate })),
    },
  },
  approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
  createdAt: '2026-09-26T14:02:00+00:00', startedAt: '2026-09-26T14:02:05+00:00', finishedAt: '2026-09-26T14:21:30+00:00',
};







// The bodies of the exports: the head of a PDF and of a
// zip (an .xlsx is one) — enough for a Blob and a download
const EXPORT_BYTES = {
  pdf: new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),
  xlsx: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00]),
};

// Export content types by format
const EXPORT_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Lithuanian letters folded to ASCII for the file name
const FOLD = { ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z', Ą: 'A', Č: 'C', Ę: 'E', Ė: 'E', Į: 'I', Š: 'S', Ų: 'U', Ū: 'U', Ž: 'Z' };







// -----------------------------------------------------------
// reportExport
// -----------------------------------------------------------
//
//   reportExport(ID.reportDone, 'pdf') → { filename,
//                                         contentType, body }
//
// GET /api/reports/{id}/export: the file name the view puts
// in Content-Disposition ("legalops-UAB-Pavyzdys-2026-09-
// 21.pdf" — company and creation date, letters folded), the
// content type and a small body. undefined for an unknown
// report or a format other than pdf / xlsx.
//
// Used by:
//   - handlers.js — GET /api/reports/{id}/export
// -----------------------------------------------------------

export function reportExport(id, format) {
  const row = report(id);
  if (!row || !EXPORT_TYPES[format]) return undefined;
  const name = [...row.companyName].map((letter) => FOLD[letter] ?? letter).join('');
  const stem = `${name}-${row.createdAt.slice(0, 10)}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'report';
  return { filename: `legalops-${stem}.${format}`, contentType: EXPORT_TYPES[format], body: EXPORT_BYTES[format].slice() };
}







// -----------------------------------------------------------
// registerItem
// -----------------------------------------------------------
//
// One finding as an action of the register keeps it
// (analysis/register.py sign_off): the obligation's id, the
// finding it was, its title, the act and provision of its
// first citation, how the finding stood when the action came
// in, and — once a later signed-off report found the
// obligation met — which report confirmed it and when.
//
// Used by:
//   - REGISTER_ROWS (below)
// -----------------------------------------------------------

function registerItem(findingId, status, confirmed = null) {
  const row = find(doneFindings, findingId);
  const cited = row.citations[0] ?? {};
  return {
    obligationId: row.obligationId, findingId, title: row.obligationTitle, act: cited.documentTitle || row.shortTitle,
    path: cited.path ?? '', sourceKind: row.sourceKind, status, confirmed,
  };
}







// The two sign-offs that moved the register of UAB Pavyzdys:
// the first analysis' on 2026-09-09 and the finished run's
// on 2026-09-22 (its report's approvedAt)
const SIGNED_EARLIER = '2026-09-09T10:00:00+00:00';
const SIGNED_DONE = '2026-09-22T08:30:00+00:00';

// Days from a sign-off to an action's due date, by the
// plan's timeframe (analysis/register.py DUE_DAYS)
const DUE_DAYS = { immediate: 14, '30_days': 30, '90_days': 90, '12_months': 365 };

// What the finished run's sign-off confirmed
const CONFIRMED = { reportId: ID.reportDone, at: SIGNED_DONE };

// The register of UAB Pavyzdys as its two sign-offs and its
// people left it — each row with the report and the
// timeframe it came in with, and whatever a person or a
// later report did to it since. From the first analysis:
// the register of ICT contracts, due within two weeks and
// still in work — late; the two MiCA gaps in one action its
// owner calls done, the licence confirmed by the finished
// run, the safeguarding still to be re-tested; the AML
// officer, closed by that run; the correspondent
// relationships, closed by hand with the reason; and the AI
// literacy training, whose obligation was replaced when the
// AI Act was read again — no report can confirm it; and the
// correction of the documents' legal references, which
// closes no finding at all and so is a person's to close
// too. From the finished run: the AI risk category and the
// incident procedure (its plan's safeguarding and register
// findings were already under an action, so they brought
// none)
const REGISTER_ROWS = [
  {
    id: ID.actionRegister, reportId: ID.reportEarlier, signedAt: SIGNED_EARLIER, timeframe: 'immediate',
    title: 'Sudaryti IRT paslaugų sutarčių informacijos registrą',
    description: 'Surašyti visas IRT trečiųjų šalių paslaugų sutartis į informacijos registrą ir paskirti už jo atnaujinimą atsakingą asmenį.',
    category: 'outsourcing', priority: 2, effort: 'medium', owner: 'IT vadovas', status: 'in_progress',
    items: [registerItem(ID.findingRegister, 'unknown')],
    note: 'Registras pradėtas pildyti; trūksta dviejų IRT paslaugų teikėjų duomenų.', updatedAt: '2026-09-20T15:40:00+00:00',
  },
  {
    id: ID.actionMica, reportId: ID.reportEarlier, signedAt: SIGNED_EARLIER, timeframe: '30_days',
    title: 'Pateikti leidimo įrodymus ir patvirtinti klientų turto apsaugos tvarką',
    description: 'Įkelti Lietuvos banko išduoto leidimo išrašą ir valdybos sprendimu patvirtinti klientų kriptoturto ir lėšų atskyrimo, saugojimo ir apskaitos tvarką.',
    category: 'safeguarding', priority: 1, effort: 'medium', owner: 'Atitikties pareigūnas', status: 'done',
    items: [registerItem(ID.findingLicence, 'partial', CONFIRMED), registerItem(ID.findingSafeguarding, 'missing')],
    note: 'Klientų turto apsaugos tvarka patvirtinta valdybos 2026-09-25 sprendimu.', updatedAt: '2026-09-25T14:05:00+00:00',
  },
  {
    id: ID.actionAmlOfficer, reportId: ID.reportEarlier, signedAt: SIGNED_EARLIER, timeframe: 'immediate',
    title: 'Paskirti už pinigų plovimo prevenciją atsakingą vadovą',
    description: 'Vadovo įsakymu paskirti vadovaujančias pareigas einantį darbuotoją ir įrašyti jį į pinigų plovimo prevencijos procedūrą.',
    category: 'aml_kyc', priority: 3, effort: 'low', owner: 'Vadovas', status: 'closed',
    items: [registerItem(ID.findingAmlOfficer, 'missing', CONFIRMED)],
    note: '', closedAt: SIGNED_DONE, closedByName: null, confirmedReportId: ID.reportDone, updatedAt: SIGNED_DONE,
  },
  {
    id: ID.actionCorrespondent, reportId: ID.reportEarlier, signedAt: SIGNED_EARLIER, timeframe: '90_days',
    title: 'Nustatyti korespondentinių santykių vertinimo tvarką',
    description: 'Aprašyti sustiprinto tapatybės nustatymo priemones, taikomas užmezgant korespondentinius santykius su trečiųjų valstybių įstaigomis.',
    category: 'aml_kyc', priority: 4, effort: 'low', owner: 'Atitikties pareigūnas', status: 'closed',
    items: [registerItem(ID.findingCorrespondent, 'unknown')],
    note: 'Bendrovė korespondentinių santykių su trečiųjų valstybių įstaigomis neturi ir neplanuoja – tvarka nereikalinga.',
    closedAt: '2026-09-15T11:20:00+00:00', closedByName: adminUser.displayName, confirmedReportId: null, updatedAt: '2026-09-15T11:20:00+00:00',
  },
  {
    id: ID.actionAiLiteracy, reportId: ID.reportEarlier, signedAt: SIGNED_EARLIER, timeframe: '12_months',
    title: 'Organizuoti DI raštingumo mokymus',
    description: 'Parengti mokymų planą darbuotojams, dirbantiems su sandorių stebėsenos modeliu, ir saugoti dalyvavimo įrašus.',
    category: 'training', priority: 5, effort: 'low', owner: 'Personalo vadovas', status: 'open',
    items: [{
      obligationId: null, findingId: 'e2000000-0000-4000-8000-000000000021', title: 'Užtikrinti DI sistemas naudojančių darbuotojų DI raštingumą',
      act: 'DI aktas', path: '4 str.', sourceKind: 'legal', status: 'missing', confirmed: null,
    }],
    note: '', updatedAt: SIGNED_EARLIER,
  },
  {
    id: ID.actionReferences, reportId: ID.reportEarlier, signedAt: SIGNED_EARLIER, timeframe: '30_days',
    title: 'Ištaisyti dokumentuose nurodytas teisės aktų nuostatas',
    description: 'Pinigų plovimo prevencijos procedūroje ir leidimo išraše pataisyti nuorodas, kurios rodo ne į tą arba į neegzistuojančią teisės akto nuostatą.',
    category: 'record_keeping', priority: 6, effort: 'low', owner: 'Atitikties pareigūnas', status: 'open',
    items: [], note: '', updatedAt: SIGNED_EARLIER,
  },
  {
    id: ID.actionAiRisk, reportId: ID.reportDone, signedAt: SIGNED_DONE, timeframe: doneActions[2].timeframe,
    title: doneActions[2].title, description: doneActions[2].description, category: doneActions[2].category,
    priority: doneActions[2].priority, effort: doneActions[2].effort, owner: doneActions[2].ownerRole, status: 'open',
    items: [registerItem(ID.findingAiRisk, 'unknown')],
    note: '', updatedAt: SIGNED_DONE,
  },
  {
    id: ID.actionIncidents, reportId: ID.reportDone, signedAt: SIGNED_DONE, timeframe: doneActions[1].timeframe,
    title: doneActions[1].title, description: doneActions[1].description, category: doneActions[1].category,
    priority: doneActions[1].priority, effort: doneActions[1].effort, owner: doneActions[1].ownerRole, status: 'in_progress',
    items: [registerItem(ID.findingIncidents, 'partial')],
    note: '', updatedAt: '2026-09-24T09:30:00+00:00',
  },
];

// The order the register is listed in: the late first, the
// rest of the live ones, the ones called done, the closed
const STATE_ORDER = { late: 0, open: 1, in_progress: 1, done: 2, closed: 3 };

// The day each of the two reports was made — what an action
// carries beside the report it came from
const REPORT_DATES = { [ID.reportEarlier]: '2026-09-08', [ID.reportDone]: '2026-09-21' };







// -----------------------------------------------------------
// actionState
// -----------------------------------------------------------
//
// An action's state as the register shows it
// (analysis/register.py state_of): its own status, or "late"
// when it is open or in progress and its due date lies
// before the world's today.
//
// Used by:
//   - companyAction (below)
//   - handlers.js — PATCH /api/actions/{id}
// -----------------------------------------------------------

export function actionState(status, dueDate) {
  return ['open', 'in_progress'].includes(status) && dueDate < TODAY ? 'late' : status;
}







// -----------------------------------------------------------
// companyAction
// -----------------------------------------------------------
//
// One action of a register (serialize_company_action), or
// undefined: the date of the report it came from, its due
// date counted from the sign-off that brought it in, its
// state as shown, whether only a person can close it — it
// closes no finding, or one of its findings has no
// obligation a report could confirm — and how it was closed:
// by a later report, by a person, or not at all.
//
// Used by:
//   - companyActions (below)
//   - handlers.js — PATCH /api/actions/{id}
//   - tests — the rows they act on
// -----------------------------------------------------------

export function companyAction(id) {
  const row = find(REGISTER_ROWS, id);
  if (!row) return undefined;
  const { signedAt, timeframe, ...kept } = row;
  const dueDate = shiftDate(signedAt.slice(0, 10), DUE_DAYS[timeframe]);
  return {
    closedAt: null, closedByName: null, confirmedReportId: null,
    ...kept,
    companyId: ID.pavyzdys,
    reportDate: REPORT_DATES[row.reportId] ?? null,
    dueDate,
    state: actionState(row.status, dueDate),
    byHandOnly: row.items.length === 0 || row.items.some((item) => item.obligationId === null),
    closedHow: row.status === 'closed' ? (row.confirmedReportId ? 'confirmed' : 'manual') : null,
    createdAt: signedAt,
  };
}







// -----------------------------------------------------------
// companyActions
// -----------------------------------------------------------
//
// GET /api/companies/{id}/actions: the company's register in
// the view's order — the late before the other live ones,
// each group by due date, then the closed — and the count of
// each state as shown. UAB Pavyzdys has the eight actions
// above; any other company has none.
//
// Used by:
//   - handlers.js — GET /api/companies/{id}/actions
//   - tests — the register they read
// -----------------------------------------------------------

export function companyActions(companyId) {
  const actions = (companyId === ID.pavyzdys ? REGISTER_ROWS.map((row) => companyAction(row.id)) : [])
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.dueDate.localeCompare(b.dueDate) || a.priority - b.priority);
  return {
    actions,
    counts: Object.fromEntries(['late', 'open', 'in_progress', 'done', 'closed'].map((state) => [state, actions.filter((row) => row.state === state).length])),
  };
}







// -----------------------------------------------------------
// actionsExport
// -----------------------------------------------------------
//
// GET /api/companies/{id}/actions/export: the file name the
// view puts in Content-Disposition — the company's name with
// its letters folded and the world's date — the content type
// and a small body. undefined for an unknown company.
//
// Used by:
//   - handlers.js — GET /api/companies/{id}/actions/export
// -----------------------------------------------------------

export function actionsExport(companyId) {
  const row = company(companyId);
  if (!row) return undefined;
  const name = [...row.name].map((letter) => FOLD[letter] ?? letter).join('');
  const stem = `actions-${name}-${TODAY}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'actions';
  return { filename: `${stem}.xlsx`, contentType: EXPORT_TYPES.xlsx, body: EXPORT_BYTES.xlsx.slice() };
}







// -----------------------------------------------------------
// signOff
// -----------------------------------------------------------
//
// What the sign-off of a report does to its company's
// register (analysis/register.py sign_off), as the approval
// answers it under `register`. The finished run's brought
// two actions in, left two findings out that were already
// under an action (`covered` — which also counts a plan's
// action without findings when one of its kind is live),
// confirmed two obligations and closed one action; the run that also assessed the company's own
// requirements would bring its one action for them and leave
// the rest out; any other report changes nothing.
//
// Used by:
//   - handlers.js — PATCH /api/reports/{id} {approved: true}
//   - tests — the message a sign-off shows
// -----------------------------------------------------------

export function signOff(reportId) {
  if (reportId === ID.reportDone) return { added: 2, covered: 2, confirmed: 2, closed: 1, reopened: 0 };
  if (reportId === ID.reportOwn) return { added: 1, covered: 4, confirmed: 0, closed: 0, reopened: 0 };
  return { added: 0, covered: 0, confirmed: 0, closed: 0, reopened: 0 };
}







// -----------------------------------------------------------
// withdrawal
// -----------------------------------------------------------
//
// How many actions a withdrawn sign-off changes
// (analysis/register.py withdraw): the finished run's had
// confirmed an item of one action and closed another; no
// other report confirmed anything.
//
// Used by:
//   - handlers.js — PATCH /api/reports/{id} {approved: false}
// -----------------------------------------------------------

export function withdrawal(reportId) {
  return REGISTER_ROWS.filter((row) => row.items.some((item) => item.confirmed?.reportId === reportId)).length;
}







// -----------------------------------------------------------
// lawChanges
// -----------------------------------------------------------
//
// GET /api/companies/{id}/law-changes
// (analysis/register.py law_changes): for the company's
// latest finished report, the acts it assessed that have a
// newer version now, the provisions those versions changed,
// added or removed, and the report's findings that rest on a
// changed or removed one. UAB Pavyzdys' finished run read
// MiCA at version 1 and version 2 arrived since: two of its
// findings stand on changed articles. A company without a
// finished report answers nothing to compare; undefined for
// an unknown company.
//
// Used by:
//   - handlers.js — GET /api/companies/{id}/law-changes
//   - tests — the changes they read
// -----------------------------------------------------------

export function lawChanges(companyId) {
  if (!company(companyId)) return undefined;
  if (companyId !== ID.pavyzdys) return { reportId: null, reportDate: null, acts: [] };
  const act = doneActs[1];
  const changed = ['59 str.', '70 str.'];
  return {
    reportId: ID.reportDone,
    reportDate: find(reports, ID.reportDone).createdAt.slice(0, 10),
    acts: [{
      actId: act.id, documentId: act.documentId, act: act.shortTitle,
      assessedVersion: legalVersions[ID.micaV1].versionNo, currentVersion: legalVersions[ID.micaV2].versionNo,
      currentDate: legalVersions[ID.micaV2].effectiveDate, recorded: true,
      changed, added: ['75 str.'], removed: ['66 str.'],
      findings: doneFindings.filter((row) => row.actId === act.id && changed.some((article) => row.citations[0]?.path.startsWith(article)))
        .map((row) => ({ id: row.id, title: row.obligationTitle, status: row.effectiveStatus, path: row.citations[0].path })),
    }],
  };
}







// The finished run's findings as the first analysis had
// them: the six it assessed, with the verdicts of the day,
// nothing reviewed and nothing before them
const earlierFindings = doneFindings.filter((row) => row.id in EARLIER_STATUS).map((row) => ({
  ...row, status: EARLIER_STATUS[row.id], overrideStatus: null, effectiveStatus: EARLIER_STATUS[row.id], reviewerNote: '',
  reviewedBy: null, reviewedAt: null, cause: '', analysis: '', recommendation: '', evidence: [], history: [],
}));

// The first analysis' plan: the six actions its sign-off
// brought into the register, by priority
const earlierActions = REGISTER_ROWS.filter((row) => row.reportId === ID.reportEarlier).map((row, index) => ({
  id: `e3000000-0000-4000-8000-00000000001${index + 1}`, title: row.title, description: row.description, priority: row.priority,
  effort: row.effort, timeframe: row.timeframe, ownerRole: row.owner, category: row.category, findingIds: row.items.map((item) => item.findingId),
})).sort((a, b) => a.priority - b.priority);







// -----------------------------------------------------------
// earlierReport
// -----------------------------------------------------------
//
// The first analysis of UAB Pavyzdys, as serialize_report
// writes its row: run by the administrator on 2026-09-08 and
// signed off the day after — the sign-off that began the
// company's register. It stands beside the lists like the
// other two; its detail is the finished run as it stood
// then (earlierFindings, earlierActions), without what moved
// (there was no report before it). The one finding of its
// plan that the later run did not repeat — the AI literacy
// one — is not among the fixtures.
//
// Used by:
//   - report (above) — its detail
//   - the history of the finished run's findings, the
//     register's rows and stats.changes — the report they name
// -----------------------------------------------------------

export const earlierReport = {
  ...find(reports, ID.reportDone),
  id: ID.reportEarlier, createdBy: ID.admin, title: 'UAB Pavyzdys atitikties vertinimas: pirmoji analizė',
  stats: {
    ...Object.fromEntries(Object.entries(find(reports, ID.reportDone).stats).filter(([key]) => key !== 'changes')),
    findings: Object.fromEntries(['met', 'partial', 'missing', 'unknown', 'not_applicable'].map((key) => [key, earlierFindings.filter((row) => row.status === key).length])),
    openBySeverity: Object.fromEntries(['critical', 'high', 'medium', 'low'].map((key) => [key, earlierFindings.filter((row) => ['missing', 'partial'].includes(row.status) && row.severity === key).length])),
    actions: earlierActions.length,
  },
  approvedBy: ID.admin, approvedByName: adminUser.displayName, approvedAt: SIGNED_EARLIER, approvalNote: '',
  createdAt: '2026-09-08T09:00:00+00:00', startedAt: '2026-09-08T09:00:04+00:00', finishedAt: '2026-09-08T09:17:20+00:00',
};







// -----------------------------------------------------------
// mcpServers
// -----------------------------------------------------------
//
// GET /api/mcp/servers's rows (serialize_server), by name:
// an enabled Streamable-HTTP server with a credential header
// and two allowed tools, and a disabled SSE server whose last
// test could not reach it. Header values never leave Django —
// only headerNames.
//
// Used by:
//   - handlers.js — the MCP routes (list, detail, PATCH,
//     DELETE)
//   - mcpTest (below)
// -----------------------------------------------------------

export const mcpServers = [
  {
    id: ID.mcpEu,
    name: 'eu_compliance',
    description: 'Išorinis ES atitikties šaltinių serveris (bandomasis).',
    url: 'https://mcp.example.eu/mcp',
    transport: 'http',
    headerNames: ['Authorization'],
    allowedTools: ['get_article', 'search_eu_law'],
    enabled: true,
    tools: [
      { name: 'search_eu_law', description: 'Search EU financial regulation by keyword.' },
      { name: 'get_article', description: 'Return one article of an EU act by CELEX number and article.' },
      { name: 'list_sources', description: 'List the acts the server indexes.' },
    ],
    lastCheckedAt: '2026-09-20T11:04:30+00:00',
    lastError: null,
    createdAt: '2026-09-20T10:58:00+00:00',
    updatedAt: '2026-09-20T11:05:00+00:00',
  },
  {
    id: ID.mcpRegistry,
    name: 'lt_registry',
    description: 'Juridinių asmenų registro duomenys (neįjungtas).',
    url: 'https://registrai.example.lt/sse',
    transport: 'sse',
    headerNames: ['X-Api-Key'],
    allowedTools: [],
    enabled: false,
    tools: [],
    lastCheckedAt: '2026-09-19T15:30:12+00:00',
    lastError: 'Cannot reach registrai.example.lt (ConnectError) — is it on the egress allowlist?',
    createdAt: '2026-09-19T15:28:00+00:00',
    updatedAt: '2026-09-19T15:28:00+00:00',
  },
];







// -----------------------------------------------------------
// mcpTest
// -----------------------------------------------------------
//
//   mcpTest(ID.mcpRegistry) → { …server, ok: true }, or
//                             undefined
//
// POST /api/mcp/servers/{id}/test after a successful
// connection: the listing remembered on the row, checked
// now, the old error cleared.
//
// Used by:
//   - handlers.js — POST /api/mcp/servers/{id}/test
// -----------------------------------------------------------

export function mcpTest(id) {
  const server = find(mcpServers, id);
  if (!server) return undefined;
  const tools = server.tools.length ? server.tools : [{ name: 'find_company', description: 'Find a legal entity by its registration code.' }];
  return { ...server, tools, lastCheckedAt: NOW, lastError: null, ok: true };
}







// -----------------------------------------------------------
// auditEntries
// -----------------------------------------------------------
//
// GET /api/audit's entries (serialize_audit), newest first:
// the actions behind the world above — sign-ins (one failed,
// with no account), the analyses started, the finding
// override and the sign-off, corpus and prompt changes, a
// job cancel, an MCP change, a deactivation. userName is the
// display name (null for a system row); a finding's details
// name its report.
//
// Used by:
//   - handlers.js — GET /api/audit (action prefix, user,
//     before, limit)
// -----------------------------------------------------------

export const auditEntries = [
  ['16', ID.admin, 'reports.create', 'report', ID.reportRunning, { company: ID.kreditas, language: 'lt' }, '2026-09-27T09:40:00+00:00'],
  ['15', ID.jonas, 'auth.login', 'user', ID.jonas, {}, '2026-09-27T08:12:40+00:00'],
  ['14', ID.admin, 'auth.login', 'user', ID.admin, {}, '2026-09-27T07:45:12+00:00'],
  ['13', ID.admin, 'corpus.create', 'legal_document', ID.lbRules, { slug: 'lb-ktpt-taisykles', source: 'lb' }, '2026-09-26T08:14:30+00:00'],
  ['12', ID.admin, 'jobs.cancel', 'job', ID.jobReembed, { kind: 'corpus.reembed' }, '2026-09-25T16:02:00+00:00'],
  ['11', ID.admin, 'obligations.extract', 'legal_document', ID.consumerCredit, {}, '2026-09-24T14:30:00+00:00'],
  ['10', ID.admin, 'companies.create', 'company', ID.kreditas, { name: 'UAB Kreditas' }, '2026-09-24T14:05:00+00:00'],
  ['09', ID.admin, 'corpus.refresh', 'legal_document', ID.mica, { force: false }, '2026-09-24T07:05:00+00:00'],
  ['08', ID.admin, 'reports.approve', 'report', ID.reportDone, {}, '2026-09-22T08:30:00+00:00'],
  ['07', ID.admin, 'reports.review_finding', 'finding', ID.findingRegister, { override: 'partial', report: ID.reportDone }, '2026-09-22T08:10:00+00:00'],
  ['06', ID.jonas, 'reports.create', 'report', ID.reportDone, { company: ID.pavyzdys, language: 'lt' }, '2026-09-21T09:15:00+00:00'],
  ['05', ID.jonas, 'reports.create', 'report', ID.reportFailed, { company: ID.pavyzdys, language: 'lt' }, '2026-09-20T15:02:00+00:00'],
  ['04', ID.admin, 'mcp.update', 'mcp_server', ID.mcpEu, { fields: ['enabled'], enabled: true, headerNames: ['Authorization'] }, '2026-09-20T11:05:00+00:00'],
  ['03', ID.admin, 'prompts.activate', 'prompt', 'report.gap_analysis', { version: 2, previous: 1 }, '2026-09-18T10:00:00+00:00'],
  ['02', ID.admin, 'users.deactivate', 'user', ID.lina, {}, '2026-09-15T12:00:00+00:00'],
  ['01', null, 'auth.login_failed', 'user', null, { reason: 'unknown_email' }, '2026-09-12T07:58:31+00:00'],
].map(([n, userId, action, targetType, targetId, details, createdAt]) => ({
  id: `ad000000-0000-4000-8000-0000000000${n}`,
  userId,
  userName: userId ? user(userId).displayName : null,
  action,
  targetType,
  targetId,
  details,
  ip: userId ? '203.0.113.10' : '198.51.100.23',
  createdAt,
}));







// -----------------------------------------------------------
// NEW
// -----------------------------------------------------------
//
// What a create answers before the body is merged in — the
// complete record the view would write, stamped NOW, owned
// by `me`, with the ID.new* id — and what the detail routes
// answer for that id afterwards:
//
//   user, company (empty related lists), credential, role,
//   document (extracted, not yet indexed), thread, act (an
//   upload-kind act, no version), report (queued, list
//   shape) and its reportJob, job (the ingest a new act's
//   upload queues), promptVersion, mcpServer (disabled)
//
// Used by:
//   - handlers.js — every create
//   - the lookups (above) — user, company, companyDocument,
//     thread, act, job, report
// -----------------------------------------------------------

export const NEW = {
  user: { id: ID.newUser, email: 'naujas@example.lt', displayName: 'Naujas Naudotojas', role: 'user', active: true, dailyBudgetUsd: null, createdAt: NOW, lastLoginAt: null },
  company: {
    id: ID.newCompany, ownerId: me.id, ownerName: me.displayName, name: 'UAB Naujoji', registrationCode: null, country: 'LT', legalForm: null,
    naceCodes: [], sector: null, sizeCategory: 'unknown', employees: null, annualTurnoverEur: null, activities: '',
    usesAi: null, providesAi: null, aiDescription: '', processesPersonalData: null, isPublicSector: null,
    institutionType: 'unknown', financialMarket: null, attributes: {}, createdAt: NOW, updatedAt: NOW,
    credentials: [], standards: [], roles: [], documents: [],
  },
  credential: { id: ID.newCredential, companyId: ID.pavyzdys, kind: 'certificate', name: 'Naujas sertifikatas', issuer: null, identifier: null, validFrom: null, validTo: null, scope: '', notes: '', status: 'claimed', evidenceDocumentId: null, verifiedBy: null, verifiedAt: null, createdAt: NOW, updatedAt: NOW },
  role: { id: ID.newRole, companyId: ID.pavyzdys, name: 'Nauja rolė', context: '', sources: [], createdBy: me.id, createdAt: NOW, updatedAt: NOW },
  adoption: { id: ID.newAdoption, companyId: ID.pavyzdys, documentId: null, shortTitle: '', title: '', ready: true, status: 'implementing', scope: '', certificateId: null, notes: '', createdAt: NOW, updatedAt: NOW },
  document: {
    id: ID.newDocument, ownerId: me.id, companyId: null, title: 'Klientų informavimo tvarka.md', kind: 'other', mime: 'text/markdown', size: 96,
    sha256: '90f3f2926a14c386bb982ff17f4763f67b255180c3783fc86827d5e24f03c23e', charCount: DOC_TEXT[ID.newDocument].length,
    extractionStatus: 'done', extractionError: null, indexedAt: null, uploadedAt: NOW, documentType: null, inventorySummary: null,
  },
  thread: { id: ID.newThread, userId: me.id, companyId: null, companyName: null, roleId: null, role: null, title: null, model: null, messageCount: 0, archived: false, createdAt: NOW, updatedAt: NOW },
  act: {
    id: ID.newAct, slug: 'naujas-aktas', title: 'Naujas teisės aktas', titleEn: '', shortTitle: '', jurisdiction: 'LT', docType: 'other',
    sourceKind: 'upload', externalId: '', sourceUrl: '', language: 'lt', domains: [], appliesTo: [], applicabilityNotes: '',
    status: 'in_force', enabled: true, currentVersion: null, lastCheckedAt: null, lastError: null, createdAt: NOW, updatedAt: NOW,
  },
  report: {
    id: ID.newReport, companyId: ID.pavyzdys, companyName: 'UAB Pavyzdys', createdBy: me.id, jobId: ID.newReportJob,
    status: 'queued', language: 'lt', scope: { documentIds: [] }, title: '', stats: {}, error: null,
    approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '',
    scopeApprovedBy: null, scopeApprovedByName: null, scopeApprovedAt: null,
    createdAt: NOW, startedAt: null, finishedAt: null, progress: {}, jobStatus: 'queued',
  },
  reportJob: { ...queuedJob('report.analyze', `report:${ID.newReport}`), id: ID.newReportJob },
  job: queuedJob('corpus.ingest', `corpus:${ID.newAct}`),
  promptVersion: { id: 'f1000000-0000-4000-8000-0000000000ff', promptSlug: 'chat.assistant', version: 4, model: 'gateway:azure/gpt-5.5', temperature: null, maxTokens: null, note: '', source: 'user', createdBy: me.id, createdAt: NOW, text: '' },
  mcpServer: { id: ID.newMcpServer, name: 'naujas_serveris', description: '', url: 'https://mcp.example.com/mcp', transport: 'http', headerNames: [], allowedTools: [], enabled: false, tools: [], lastCheckedAt: null, lastError: null, createdAt: NOW, updatedAt: NOW },
};
