// -----------------------------------------------------------
//  [*] Test support — default handlers for every UI endpoint
//
//  The happy path of the whole backend as the SPA sees it —
//  Django's /api/* and the node assistant's /api/assistant/*
//  — one msw handler per route the code under src/ calls,
//  answering the fixtures in the views' own shapes and
//  statuses: the list envelopes ({companies}, {documents,
//  total}, {jobs}, a bare list for the chat history), 201 on
//  the creates that answer 201, 202 with the job on the
//  queued corpus work, {ok: true} where a view answers it,
//  and Django's error envelope {error, code} — 404 NOT_FOUND
//  for an unknown id, so a sweep over the routes with the
//  fixture ids renders every page.
//
//  Refusals that follow from a fixture's own state are
//  answered as the view would (cancelling a finished job or
//  analysis, approving or exporting an unfinished report,
//  approving the scope of a report that does not wait for
//  it — or with every act left out — deleting a running one
//  or its company (a company is also kept while one of its
//  work products is being generated), purging an active
//  account, deactivating
//  or demoting yourself, extracting from — or checking the
//  obligations of — an act without a version; and for the
//  work products of a programme: starting one for a company
//  without a readable document or while that kind is being
//  generated, approving a draft that breaks a blocking rule,
//  editing or approving anything but a draft, revising a
//  product that is not approved or has a newer version,
//  cancelling, deleting or exporting in the wrong state;
//  and for an action of a company's register: closing it by
//  hand without a note that says why);
//  every other refusal —
//  validation, budgets, ALREADY_RUNNING, a plain user's 403 —
//  is a test's own `given`.
//
//  Stateless: nothing here mutates a fixture. A create
//  answers the body merged over its NEW template (whose id
//  the detail routes resolve), an update the record merged
//  with the body; nothing is remembered for the next
//  request. An edited work product is answered the way the
//  backend stores it — brought into its kind's shape, scored
//  and checked against the kind's rules again (programme.js
//  normalise) — and then forgotten like every other write.
//  An edited action of a register is answered with its state
//  worked out again from its status and its due date. A
//  sign-off answers what it did to the register, a
//  withdrawal how many actions it changed (fixtures.js
//  signOff, withdrawal). The caller is always the
//  administrator (f.me).
//
//  The assistant container answers its own envelope,
//  {message, error: {code, message}}; a chat turn answers the
//  AI SDK v7 UI message stream as SSE ("data: {json}" events,
//  then "data: [DONE]"), with the headers the ai package's
//  UI_MESSAGE_STREAM_HEADERS set.
//
//  Keep this in step with the SPA: the structural test
//  (tests/core/structural.test.js) extracts every api / axios
//  call, queued-job url, download and the chat transport from
//  src/ and fails when one has no handler here. Literal paths
//  come before the parametrised ones they would match
//  (/api/documents/search before /api/documents/:documentId).
//
//  Used by:
//    - server.js — setupServer(...defaultHandlers)
//    - structural.test.js — the handler coverage rule
// -----------------------------------------------------------

import { http, HttpResponse } from 'msw';
import * as f from './fixtures';
import * as p from './programme';
import { TEST_ORIGIN } from '../location';


// "/api/users" → the absolute url the handlers match on
const abs = (path) => `${TEST_ORIGIN}${path}`;

// A resolver answering one fixed JSON body
const json = (body) => () => HttpResponse.json(body);

// The answer of every view that only says it worked
const ok = json({ ok: true });

// The writable fields of each create / update, as the views
// copy them (unknown keys are ignored, as there)
const COMPANY_FIELDS = [
  'name', 'registrationCode', 'country', 'legalForm', 'naceCodes', 'sector', 'sizeCategory', 'employees',
  'annualTurnoverEur', 'activities', 'usesAi', 'providesAi', 'aiDescription', 'processesPersonalData',
  'isPublicSector', 'institutionType', 'financialMarket', 'attributes',
];
const CREDENTIAL_FIELDS = ['kind', 'name', 'issuer', 'identifier', 'validFrom', 'validTo', 'scope', 'notes', 'evidenceDocumentId'];
const ROLE_FIELDS = ['name', 'context', 'sources'];
const STANDARD_FIELDS = ['status', 'scope', 'certificateId', 'notes'];
const USER_FIELDS = ['displayName', 'role', 'active', 'dailyBudgetUsd'];
const ACT_FIELDS = [
  'title', 'titleEn', 'shortTitle', 'externalId', 'sourceUrl', 'applicabilityNotes', 'jurisdiction', 'docType',
  'sourceKind', 'status', 'language', 'domains', 'appliesTo', 'enabled',
];
const OBLIGATION_FIELDS = [
  'title', 'titleEn', 'text', 'textEn', 'addressee', 'conditions', 'evidence', 'deadline', 'notes', 'category',
  'severity', 'status', 'appliesTo',
];
const MCP_FIELDS = ['name', 'description', 'url', 'transport', 'allowedTools', 'enabled'];
const PROMPT_VERSION_FIELDS = ['text', 'model', 'temperature', 'maxTokens', 'note'];

// The statuses a person gives an action of the register
// (analysis/api/views.py ACTION_STATES) — "late" is never one
const ACTION_STATUSES = ['open', 'in_progress', 'done', 'closed'];

// The fields the list routes leave out of a detail
const REPORT_DETAIL_KEYS = ['summary', 'profileSnapshot', 'acts', 'outdatedActs', 'findings', 'actions'];

// The enums the list filters check (the views ignore or
// refuse anything else)
const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];
const CALL_KINDS = ['chat', 'job_step', 'embed', 'prompt_test'];
const OBLIGATION_STATUSES = ['proposed', 'approved', 'rejected'];
const CATEGORIES = [
  'licensing', 'registration', 'governance', 'policy', 'procedure', 'risk_management', 'ict_security',
  'outsourcing', 'incident_reporting', 'reporting', 'disclosure', 'record_keeping', 'customer_protection',
  'aml_kyc', 'capital', 'safeguarding', 'training', 'data_protection', 'ai_governance', 'other',
];
const VERDICTS = ['supported', 'partly', 'unsupported'];

// The severities, gravest first, and the judge's two doubts,
// graver first — what order=review ranks the obligations by
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const DOUBT_ORDER = ['unsupported', 'partly'];

// A thread id the assistant accepts (routes/chat.js THREAD_ID)
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The ai package's UI_MESSAGE_STREAM_HEADERS
const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'x-vercel-ai-ui-message-stream': 'v1',
  'x-accel-buffering': 'no',
};







// -----------------------------------------------------------
// apiError
// -----------------------------------------------------------
//
//   apiError(409, 'STILL_RUNNING', 'Cancel the running analysis first')
//
// Django's error answer: {error: prose, code: slug} with the
// status (common/http.py json_error).
//
// Used by:
//   - notFound, the handlers (below)
// -----------------------------------------------------------

function apiError(status, code, error) {
  return HttpResponse.json({ error, code }, { status });
}







// -----------------------------------------------------------
// notFound
// -----------------------------------------------------------
//
//   notFound('Company') → 404 {error: 'Company not found',
//                              code: 'NOT_FOUND'}
//
// The views' own prose for a missing (or invisible) record.
//
// Used by:
//   - found, the handlers (below)
// -----------------------------------------------------------

function notFound(what) {
  return apiError(404, 'NOT_FOUND', `${what} not found`);
}







// -----------------------------------------------------------
// found
// -----------------------------------------------------------
//
//   found(f.company(params.companyId), 'Company')
//
// The record as JSON, or the 404 envelope when the fixture
// lookup answered undefined.
//
// Used by:
//   - the detail handlers (below)
// -----------------------------------------------------------

function found(record, what) {
  return record === undefined ? notFound(what) : HttpResponse.json(record);
}







// -----------------------------------------------------------
// assistantError
// -----------------------------------------------------------
//
// The node assistant's error answer (middleware/errors.js):
// {message, error: {code, message}}.
//
// Used by:
//   - the /api/assistant/chat handlers (below)
// -----------------------------------------------------------

function assistantError(status, code, message) {
  return HttpResponse.json({ message, error: { code, message } }, { status });
}







// -----------------------------------------------------------
// readJson
// -----------------------------------------------------------
//
// The request's JSON object, or {} for no body, bad JSON or
// anything but an object — get_json_object's None, read as
// "nothing sent" (the happy path does not validate bodies).
//
// Used by:
//   - every POST / PUT / PATCH handler (below)
// -----------------------------------------------------------

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}







// -----------------------------------------------------------
// readForm
// -----------------------------------------------------------
//
//   const { fields, file } = await readForm(request)
//
// A multipart upload: the text fields and the "file" part
// ({name, size, type}); empty when the body cannot be read
// as a form.
//
// Used by:
//   - POST /api/documents (below)
// -----------------------------------------------------------

async function readForm(request) {
  try {
    const form = await request.formData();
    const fields = {};
    let file = null;
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') fields[key] = value;
      else if (key === 'file') file = value;
    }
    return { fields, file };
  } catch {
    return { fields: {}, file: null };
  }
}







// -----------------------------------------------------------
// pick
// -----------------------------------------------------------
//
//   pick({ name: 'X', evil: 1 }, ['name']) → { name: 'X' }
//
// The keys of `keys` the body carries — what a view copies
// onto the row.
//
// Used by:
//   - the create / update handlers (below)
// -----------------------------------------------------------

function pick(body, keys) {
  return Object.fromEntries(keys.filter((key) => key in body).map((key) => [key, body[key]]));
}







// -----------------------------------------------------------
// omit
// -----------------------------------------------------------
//
//   omit(f.report(id), REPORT_DETAIL_KEYS) → the list shape
//
// A detail without the keys only the detail route writes —
// the shape the mutations that do not re-read the detail
// answer.
//
// Used by:
//   - the PATCH / cancel / activate handlers (below)
// -----------------------------------------------------------

function omit(record, keys) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}







// -----------------------------------------------------------
// query
// -----------------------------------------------------------
//
// The request's query string as URLSearchParams.
//
// Used by:
//   - intParam, the list handlers (below)
// -----------------------------------------------------------

function query(request) {
  return new URL(request.url).searchParams;
}







// -----------------------------------------------------------
// reviewRank
// -----------------------------------------------------------
//
// An obligation's place under order=review (corpus/api/
// obligation_views.py): the judge's doubts first —
// unsupported, then partly — then the rows it never judged,
// then the supported ones, and within each of them the
// gravest severity first. One number, the verdict's rank
// outweighing the severity's.
//
// Used by:
//   - GET /api/obligations (below)
// -----------------------------------------------------------

function reviewRank(row) {
  const verdict = row.verification?.verdict;
  const doubt = DOUBT_ORDER.includes(verdict) ? DOUBT_ORDER.indexOf(verdict) : (row.verification ? 3 : 2);
  const weight = SEVERITY_ORDER.includes(row.severity) ? SEVERITY_ORDER.indexOf(row.severity) : SEVERITY_ORDER.length;
  return doubt * 10 + weight;
}







// -----------------------------------------------------------
// intParam
// -----------------------------------------------------------
//
//   intParam(params, 'limit', 50, 1, 200) → 50 when absent,
//   the value when a whole number in range, else null
//
// common/http.py query_int — the handler answers 400
// INVALID_QUERY on null, as the view does.
//
// Used by:
//   - the paged list handlers (below)
// -----------------------------------------------------------

function intParam(params, name, fallback, low, high) {
  const raw = (params.get(name) ?? '').trim();
  if (!raw) return fallback;
  if (!/^-?\d{1,12}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= low && value <= high ? value : null;
}







// -----------------------------------------------------------
// clampedLimit
// -----------------------------------------------------------
//
// The jobs and audit views' limit: int() of the query (null
// when it is not one — the handler answers 400), clamped to
// 1..500, default 100.
//
// Used by:
//   - GET /api/jobs, GET /api/audit (below)
// -----------------------------------------------------------

function clampedLimit(params) {
  const raw = (params.get('limit') ?? '100').trim();
  if (!/^[+-]?\d+$/.test(raw)) return null;
  return Math.max(1, Math.min(Number(raw), 500));
}







// -----------------------------------------------------------
// slugify
// -----------------------------------------------------------
//
//   slugify('Mokėjimo įstaigų įstatymas') → 'mokejimo-istaigu-istatymas'
//
// corpus/api/views.py slugify — Lithuanian letters folded,
// 80 characters at most, "act" when nothing is left.
//
// Used by:
//   - POST /api/corpus/documents (below)
// -----------------------------------------------------------

function slugify(value) {
  const fold = { ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z' };
  const folded = [...String(value ?? '').toLowerCase()].map((letter) => fold[letter] ?? letter).join('');
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'act';
}







// -----------------------------------------------------------
// verified
// -----------------------------------------------------------
//
// A credential after a write that may carry a status
// (companies/api/company_views.py _apply_credential):
// "verified" stamps who and when (unless it already was),
// "claimed" clears both, no status leaves them.
//
// Used by:
//   - POST / PATCH /api/companies/{id}/credentials (below)
// -----------------------------------------------------------

function verified(credential, status) {
  if (status === 'verified' && credential.status !== 'verified') {
    return { ...credential, status, verifiedBy: f.me.id, verifiedAt: f.NOW };
  }
  if (status === 'claimed') return { ...credential, status, verifiedBy: null, verifiedAt: null };
  return status === 'verified' ? { ...credential, status } : credential;
}







// -----------------------------------------------------------
// headerNames
// -----------------------------------------------------------
//
//   headerNames(['X-Api-Key'], { Authorization: 'Bearer …',
//                                'X-Api-Key': null })
//     → ['Authorization']
//
// The MCP server's header names after a write: headers
// merge, a null value removes one (assistant/api/
// mcp_views.py _apply); the values are never answered.
//
// Used by:
//   - POST / PATCH /api/mcp/servers (below)
// -----------------------------------------------------------

function headerNames(current, headers) {
  if (!headers || typeof headers !== 'object') return current;
  const names = new Set(current);
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) names.delete(name);
    else names.add(name);
  }
  return [...names].sort();
}







// -----------------------------------------------------------
// sse
// -----------------------------------------------------------
//
//   sse([{ type: 'start' }, …]) → 'data: {"type":"start"}\n\n…data: [DONE]\n\n'
//
// The ai package's JsonToSseTransformStream: one "data:"
// event per chunk, then the [DONE] terminator.
//
// Used by:
//   - POST /api/assistant/chat (below)
// -----------------------------------------------------------

function sse(chunks) {
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}







// -----------------------------------------------------------
// defaultHandlers
// -----------------------------------------------------------
//
// Grouped like urls.py: auth, users, companies (credentials,
// adopted standards, roles), documents, chat and the
// assistant, the corpus,
// obligations, reports, the action register, the programme's
// work products, prompts and models, MCP servers,
// jobs, usage, audit. Param handlers compute their answer
// from the path (and the query); an unknown id is the view's
// 404.
//
// Used by:
//   - server.js
//   - structural.test.js — handlerMatches
// -----------------------------------------------------------

export const defaultHandlers = [

  // Auth — the session: me is the administrator; login signs
  // in the fixture account with that email (else the admin)
  http.get(abs('/api/auth/me'), () => HttpResponse.json(f.me)),
  http.post(abs('/api/auth/login'), async ({ request }) => HttpResponse.json(f.login((await readJson(request)).email))),
  http.post(abs('/api/auth/logout'), ok),
  http.post(abs('/api/auth/logout-all'), ok),
  http.post(abs('/api/auth/change-password'), ok),

  // Users — the admin's directory; DELETE deactivates (the
  // user answered), ?purge=true removes an inactive account
  http.get(abs('/api/users'), () => HttpResponse.json({ users: f.users })),
  http.post(abs('/api/users'), async ({ request }) => {
    const body = await readJson(request);
    return HttpResponse.json({
      ...f.NEW.user,
      ...(typeof body.email === 'string' && { email: body.email.trim().toLowerCase() }),
      ...(typeof body.displayName === 'string' && { displayName: body.displayName.trim() }),
      ...(typeof body.role === 'string' && { role: body.role }),
    }, { status: 201 });
  }),
  http.get(abs('/api/users/:userId'), ({ params }) => found(f.user(params.userId), 'User')),
  http.patch(abs('/api/users/:userId'), async ({ params, request }) => {
    const account = f.user(params.userId);
    if (!account) return notFound('User');
    const changes = pick(await readJson(request), USER_FIELDS);
    if (account.id === f.me.id && 'role' in changes && changes.role !== 'admin') return apiError(400, 'SELF_LOCKOUT', 'You cannot demote yourself');
    if (account.id === f.me.id && changes.active === false) return apiError(400, 'SELF_LOCKOUT', 'You cannot deactivate yourself');
    return HttpResponse.json({ ...account, ...changes });
  }),
  http.delete(abs('/api/users/:userId'), ({ params, request }) => {
    const account = f.user(params.userId);
    if (!account) return notFound('User');
    if (query(request).get('purge') === 'true') {
      if (account.id === f.me.id) return apiError(400, 'SELF_LOCKOUT', 'You cannot delete yourself');
      return HttpResponse.json({ ok: true, removed: f.ownedBy(account.id) });
    }
    if (account.id === f.me.id) return apiError(400, 'SELF_LOCKOUT', 'You cannot deactivate yourself');
    return HttpResponse.json({ ...account, active: false });
  }),
  http.post(abs('/api/users/:userId/reset-password'), ({ params }) => (f.user(params.userId) ? HttpResponse.json({ ok: true }) : notFound('User'))),

  // Companies — ?q= matches name or registration code,
  // ?scope=own narrows to the caller's; creates and updates
  // answer the detail (credentials, roles, documents)
  http.get(abs('/api/companies'), ({ request }) => {
    const params = query(request);
    const q = (params.get('q') ?? '').trim().toLowerCase();
    return HttpResponse.json({
      companies: f.companies
        .filter((row) => params.get('scope') !== 'own' || row.ownerId === f.me.id)
        .filter((row) => !q || row.name.toLowerCase().includes(q) || (row.registrationCode ?? '').toLowerCase().includes(q)),
    });
  }),
  http.post(abs('/api/companies'), async ({ request }) => HttpResponse.json({ ...f.NEW.company, ...pick(await readJson(request), COMPANY_FIELDS) }, { status: 201 })),
  http.get(abs('/api/companies/:companyId'), ({ params }) => found(f.company(params.companyId), 'Company')),
  http.put(abs('/api/companies/:companyId'), async ({ params, request }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    return HttpResponse.json({ ...detail, ...pick(await readJson(request), COMPANY_FIELDS), updatedAt: f.NOW });
  }),
  http.delete(abs('/api/companies/:companyId'), ({ params }) => {
    if (!f.company(params.companyId)) return notFound('Company');
    const active = (row) => row.companyId === params.companyId && ['queued', 'running'].includes(row.status);
    // An analysis at work, or a work product being generated
    return f.reports.some(active) || p.products.some(active)
      ? apiError(409, 'STILL_RUNNING', 'Cancel the running analysis or the document generation first')
      : HttpResponse.json({ ok: true });
  }),

  // Credentials — status "verified" stamps the verifier
  http.get(abs('/api/companies/:companyId/credentials'), ({ params }) => {
    const detail = f.company(params.companyId);
    return detail ? HttpResponse.json({ credentials: detail.credentials }) : notFound('Company');
  }),
  http.post(abs('/api/companies/:companyId/credentials'), async ({ params, request }) => {
    if (!f.company(params.companyId)) return notFound('Company');
    const body = await readJson(request);
    const credential = { ...f.NEW.credential, companyId: params.companyId, ...pick(body, CREDENTIAL_FIELDS) };
    return HttpResponse.json(verified(credential, body.status), { status: 201 });
  }),
  http.patch(abs('/api/companies/:companyId/credentials/:credentialId'), async ({ params, request }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    const credential = detail.credentials.find((row) => row.id === params.credentialId);
    if (!credential) return notFound('Credential');
    const body = await readJson(request);
    return HttpResponse.json(verified({ ...credential, ...pick(body, CREDENTIAL_FIELDS), updatedAt: f.NOW }, body.status));
  }),
  http.delete(abs('/api/companies/:companyId/credentials/:credentialId'), ({ params }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    return detail.credentials.some((row) => row.id === params.credentialId) ? HttpResponse.json({ ok: true }) : notFound('Credential');
  }),

  // Adopted standards — a corpus standard, once per company
  http.get(abs('/api/companies/:companyId/standards'), ({ params }) => {
    const detail = f.company(params.companyId);
    return detail ? HttpResponse.json({ standards: detail.standards }) : notFound('Company');
  }),
  http.post(abs('/api/companies/:companyId/standards'), async ({ params, request }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    const body = await readJson(request);
    const standard = f.standards.find((row) => row.id === body.documentId);
    if (!standard) return apiError(400, 'INVALID_FIELD', 'documentId must be a standard of the corpus');
    if (detail.standards.some((row) => row.documentId === standard.id)) {
      return apiError(409, 'ALREADY_ADOPTED', 'The company has already adopted this standard');
    }
    return HttpResponse.json({
      ...f.NEW.adoption, companyId: params.companyId, documentId: standard.id, shortTitle: standard.shortTitle,
      title: standard.title, ready: Boolean(standard.enabled && standard.currentVersion), ...pick(body, STANDARD_FIELDS),
    }, { status: 201 });
  }),
  http.patch(abs('/api/companies/:companyId/standards/:standardId'), async ({ params, request }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    const adoption = detail.standards.find((row) => row.id === params.standardId);
    if (!adoption) return notFound('Standard');
    return HttpResponse.json({ ...adoption, ...pick(await readJson(request), STANDARD_FIELDS), updatedAt: f.NOW });
  }),
  http.delete(abs('/api/companies/:companyId/standards/:standardId'), ({ params }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    return detail.standards.some((row) => row.id === params.standardId) ? HttpResponse.json({ ok: true }) : notFound('Standard');
  }),

  // Roles — the role profiles a chat thread can adopt
  http.get(abs('/api/companies/:companyId/roles'), ({ params }) => {
    const detail = f.company(params.companyId);
    return detail ? HttpResponse.json({ roles: detail.roles }) : notFound('Company');
  }),
  http.post(abs('/api/companies/:companyId/roles'), async ({ params, request }) => {
    if (!f.company(params.companyId)) return notFound('Company');
    return HttpResponse.json({ ...f.NEW.role, companyId: params.companyId, ...pick(await readJson(request), ROLE_FIELDS) }, { status: 201 });
  }),
  http.get(abs('/api/companies/:companyId/roles/:roleId'), ({ params }) => found(f.company(params.companyId)?.roles.find((row) => row.id === params.roleId), 'Role')),
  http.patch(abs('/api/companies/:companyId/roles/:roleId'), async ({ params, request }) => {
    const role = f.company(params.companyId)?.roles.find((row) => row.id === params.roleId);
    if (!role) return notFound('Role');
    return HttpResponse.json({ ...role, ...pick(await readJson(request), ROLE_FIELDS), updatedAt: f.NOW });
  }),
  http.delete(abs('/api/companies/:companyId/roles/:roleId'), ({ params }) => (f.company(params.companyId)?.roles.some((row) => row.id === params.roleId)
    ? HttpResponse.json({ ok: true }) : notFound('Role'))),

  // Documents — the list is paged ({documents, total}); an
  // upload answers the row (201, extracted, not yet indexed);
  // search before the :documentId routes it would match
  http.get(abs('/api/documents'), ({ request }) => {
    const params = query(request);
    const limit = intParam(params, 'limit', 500, 1, 500);
    const offset = intParam(params, 'offset', 0, 0, 10_000_000);
    if (limit === null || offset === null) return apiError(400, 'INVALID_QUERY', 'limit must be 1..500 and offset ≥ 0');
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const rows = f.companyDocuments
      .filter((row) => !params.get('companyId') || row.companyId === params.get('companyId'))
      .filter((row) => params.get('scope') !== 'own' || row.ownerId === f.me.id)
      .filter((row) => !q || row.title.toLowerCase().includes(q));
    return HttpResponse.json({ documents: rows.slice(offset, offset + limit), total: rows.length });
  }),
  http.post(abs('/api/documents'), async ({ request }) => {
    const { fields, file } = await readForm(request);
    if (fields.companyId && !f.company(fields.companyId)) return notFound('Company');
    return HttpResponse.json({
      ...f.NEW.document,
      companyId: fields.companyId || null,
      title: fields.title || file?.name || f.NEW.document.title,
      kind: fields.kind || 'other',
      ...(file && { mime: file.type || null, size: file.size }),
    }, { status: 201 });
  }),
  http.get(abs('/api/documents/search'), ({ request }) => {
    const params = query(request);
    const q = (params.get('q') ?? '').trim();
    if (!q || q.length > 1000) return apiError(400, 'INVALID_QUERY', 'q is required (at most 1000 characters)');
    const k = intParam(params, 'k', 8, 1, 30);
    if (k === null) return apiError(400, 'INVALID_QUERY', 'k must be 1..30');
    const ids = (params.get('documentIds') ?? '').split(',').filter(Boolean);
    const hits = f.documentHits
      .filter((hit) => !params.get('companyId') || hit.companyId === params.get('companyId'))
      .filter((hit) => !ids.length || ids.includes(hit.documentId));
    return HttpResponse.json({ hits: hits.slice(0, k) });
  }),
  http.get(abs('/api/documents/:documentId'), ({ params }) => found(f.companyDocument(params.documentId), 'Document')),
  http.patch(abs('/api/documents/:documentId'), async ({ params, request }) => {
    const detail = f.companyDocument(params.documentId);
    if (!detail) return notFound('Document');
    const body = await readJson(request);
    const target = body.companyId ? f.company(body.companyId) : null;
    if (body.companyId && !target) return notFound('Company');
    return HttpResponse.json({
      ...omit(detail, ['inventory', 'outline']),
      ...pick(body, ['title', 'kind']),
      ...('companyId' in body && { companyId: target?.id ?? null }),
    });
  }),
  http.delete(abs('/api/documents/:documentId'), ({ params }) => (f.companyDocument(params.documentId) ? HttpResponse.json({ ok: true }) : notFound('Document'))),
  http.get(abs('/api/documents/:documentId/text'), ({ params, request }) => {
    const search = query(request);
    const offset = intParam(search, 'offset', 0, 0, 2_000_000_000);
    const limit = intParam(search, 'limit', 20000, 1, 100000);
    if (offset === null || limit === null) return apiError(400, 'INVALID_QUERY', 'offset must be ≥ 0 and limit 1..100000');
    return found(f.documentText(params.documentId, offset, limit), 'Document');
  }),

  // Chat threads and history — the history is a bare list of
  // assistant-ui rows; a POSTed row answers {ok, created}
  http.get(abs('/api/chat/threads'), ({ request }) => {
    const companyId = query(request).get('companyId');
    return HttpResponse.json({ threads: f.threads.filter((row) => !companyId || row.companyId === companyId) });
  }),
  http.post(abs('/api/chat/threads'), async ({ request }) => {
    const body = await readJson(request);
    const target = body.companyId != null ? f.company(body.companyId) : null;
    if (body.companyId != null && !target) return notFound('Company');
    return HttpResponse.json({
      ...f.NEW.thread,
      companyId: target?.id ?? null,
      companyName: target?.name ?? null,
      title: typeof body.title === 'string' ? body.title.trim().slice(0, 200) || null : null,
    }, { status: 201 });
  }),
  http.get(abs('/api/chat/models'), () => HttpResponse.json(f.chatModels)),
  http.get(abs('/api/chat/threads/:threadId'), ({ params }) => found(f.thread(params.threadId), 'Thread')),
  http.patch(abs('/api/chat/threads/:threadId'), async ({ params, request }) => {
    const current = f.thread(params.threadId);
    if (!current) return notFound('Thread');
    const body = await readJson(request);
    if (!['title', 'companyId', 'roleId', 'model'].some((key) => key in body)) return apiError(400, 'EMPTY_UPDATE', 'Nothing to update');
    const next = { ...current, updatedAt: f.NOW };
    if ('title' in body) next.title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) || null : null;
    if ('companyId' in body) {
      const target = body.companyId ? f.company(body.companyId) : null;
      if (body.companyId && !target) return notFound('Company');
      if (!target || target.id !== current.companyId) Object.assign(next, { roleId: null, role: null });
      Object.assign(next, { companyId: target?.id ?? null, companyName: target?.name ?? null });
    }
    if ('roleId' in body) {
      const role = body.roleId ? f.company(next.companyId)?.roles.find((row) => row.id === body.roleId) : null;
      if (body.roleId && !role) return apiError(404, 'NOT_FOUND', "Role not found for the thread's company");
      Object.assign(next, { roleId: role?.id ?? null, role: role ?? null });
    }
    if ('model' in body) {
      if (body.model !== null && !f.chatModels.models.some((row) => row.id === body.model)) return apiError(400, 'UNKNOWN_MODEL', 'Unknown model');
      next.model = body.model;
    }
    return HttpResponse.json(next);
  }),
  http.delete(abs('/api/chat/threads/:threadId'), ({ params }) => (f.thread(params.threadId) ? HttpResponse.json({ ok: true }) : notFound('Thread'))),
  http.get(abs('/api/chat/threads/:threadId/messages'), ({ params }) => found(f.threadMessages(params.threadId), 'Thread')),
  http.post(abs('/api/chat/threads/:threadId/messages'), async ({ params, request }) => {
    const rows = f.threadMessages(params.threadId);
    if (!rows) return notFound('Thread');
    const body = await readJson(request);
    return HttpResponse.json({ ok: true, created: !rows.some((row) => row.id === body.id) });
  }),

  // The assistant — one chat turn as the SSE UI message
  // stream (a fresh srv-<uuid> reply id per turn, as the
  // assistant mints them); no turn is ever live, and a stop
  // finds the one the user just interrupted
  http.post(abs('/api/assistant/chat'), async ({ request }) => {
    const body = await readJson(request);
    if (typeof body.id !== 'string' || !THREAD_ID.test(body.id)) return assistantError(400, 'INVALID_THREAD', "id must be the thread's id");
    const message = body.message ?? (Array.isArray(body.messages) ? body.messages.at(-1) : undefined);
    if (message?.role !== 'user') return assistantError(400, 'INVALID_MESSAGE', 'message must be one user message');
    return new HttpResponse(sse(f.chatStream(`srv-${crypto.randomUUID()}`)), { headers: STREAM_HEADERS });
  }),
  http.get(abs('/api/assistant/chat/:threadId/status'), ({ params }) => (THREAD_ID.test(params.threadId)
    ? HttpResponse.json(f.chatStatus, { headers: { 'Cache-Control': 'no-store' } })
    : assistantError(400, 'INVALID_THREAD', 'Not a thread id'))),
  http.post(abs('/api/assistant/chat/:threadId/stop'), ({ params }) => (THREAD_ID.test(params.threadId)
    ? HttpResponse.json({ stopped: true })
    : assistantError(400, 'INVALID_THREAD', 'Not a thread id'))),

  // Corpus — the catalogue (an admin sees disabled acts too;
  // the standards answer ?docType=standard — fixtures.js
  // standards), an act's detail, its provisions; the queued
  // work answers 202 with the job (an active one when there is)
  http.get(abs('/api/corpus/documents'), ({ request }) => {
    const params = query(request);
    const jurisdiction = params.get('jurisdiction');
    const docType = params.get('docType');
    const domain = params.get('domain');
    const q = (params.get('q') ?? '').trim().toLowerCase();
    return HttpResponse.json({
      documents: (docType === 'standard' ? f.standards : f.acts.filter((row) => !docType || row.docType === docType))
        .filter((row) => !['EU', 'LT', 'INTL'].includes(jurisdiction) || row.jurisdiction === jurisdiction)
        .filter((row) => !domain || row.domains.includes(domain))
        .filter((row) => !q || [row.title, row.shortTitle, row.slug].some((value) => value.toLowerCase().includes(q))),
    });
  }),
  http.post(abs('/api/corpus/documents'), async ({ request }) => {
    const created = { ...f.NEW.act, ...pick(await readJson(request), ACT_FIELDS) };
    const row = { ...created, slug: slugify(created.shortTitle || created.title) };
    return HttpResponse.json(row.sourceKind === 'upload' ? row : { ...row, latestJob: f.queuedJob('corpus.ingest', `corpus:${row.id}`) }, { status: 201 });
  }),
  http.get(abs('/api/corpus/documents/:documentId'), ({ params }) => found(f.act(params.documentId), 'Document')),
  http.patch(abs('/api/corpus/documents/:documentId'), async ({ params, request }) => {
    const detail = f.act(params.documentId);
    if (!detail) return notFound('Document');
    return HttpResponse.json({ ...omit(detail, ['versions', 'latestJob', 'obligationCount']), ...pick(await readJson(request), ACT_FIELDS), updatedAt: f.NOW });
  }),
  http.delete(abs('/api/corpus/documents/:documentId'), ({ params }) => (f.act(params.documentId) ? HttpResponse.json({ ok: true }) : notFound('Document'))),
  http.post(abs('/api/corpus/documents/:documentId/refresh'), ({ params }) => {
    const detail = f.act(params.documentId);
    if (!detail) return notFound('Document');
    if (detail.sourceKind === 'upload' && !detail.currentVersion) return apiError(409, 'NO_FILE', 'Upload a file first');
    const active = f.jobs.find((row) => row.subject === `corpus:${detail.id}` && ['queued', 'running'].includes(row.status));
    return HttpResponse.json(active ?? f.queuedJob('corpus.ingest', `corpus:${detail.id}`), { status: 202 });
  }),
  http.post(abs('/api/corpus/documents/:documentId/upload'), ({ params }) => (f.act(params.documentId)
    ? HttpResponse.json(f.queuedJob('corpus.ingest', `corpus:${params.documentId}`), { status: 202 })
    : notFound('Document'))),
  http.post(abs('/api/corpus/documents/:documentId/extract-obligations'), ({ params }) => {
    const detail = f.act(params.documentId);
    if (!detail) return notFound('Document');
    if (!detail.currentVersion) return apiError(409, 'NOT_INGESTED', 'Ingest the act first');
    const active = f.jobs.find((row) => row.subject === `obligations:${detail.id}` && ['queued', 'running'].includes(row.status));
    return HttpResponse.json(active ?? f.queuedJob('corpus.extract_obligations', `obligations:${detail.id}`), { status: 202 });
  }),
  http.post(abs('/api/corpus/documents/:documentId/verify-obligations'), ({ params }) => {
    const detail = f.act(params.documentId);
    if (!detail) return notFound('Document');
    if (!detail.currentVersion) return apiError(409, 'NOT_INGESTED', 'Ingest the act first');
    const active = f.jobs.find((row) => row.subject === `verification:${detail.id}` && ['queued', 'running'].includes(row.status));
    return HttpResponse.json(active ?? f.queuedJob('corpus.verify_obligations', `verification:${detail.id}`), { status: 202 });
  }),
  http.get(abs('/api/corpus/documents/:documentId/units'), ({ params, request }) => {
    const search = query(request);
    const offset = Number.parseInt(search.get('offset') ?? '0', 10);
    const limit = Number.parseInt(search.get('limit') ?? '200', 10);
    if (Number.isNaN(offset) || Number.isNaN(limit)) return apiError(400, 'INVALID_QUERY', 'offset and limit must be integers');
    return found(f.units(params.documentId, {
      type: search.get('type') ?? '',
      q: search.get('q') ?? '',
      version: search.get('version') ?? '',
      offset: Math.max(0, offset),
      limit: Math.max(1, Math.min(limit, 1000)),
    }), 'Document');
  }),
  http.get(abs('/api/corpus/units/:unitId'), ({ params }) => found(f.unit(params.unitId), 'Provision')),
  http.post(abs('/api/corpus/search'), async ({ request }) => {
    const body = await readJson(request);
    if (typeof body.query !== 'string' || !body.query.trim()) return apiError(400, 'MISSING_FIELDS', 'query is required');
    const refs = Array.isArray(body.documents) ? body.documents : [];
    const hits = f.corpusHits
      .filter((hit) => !body.jurisdiction || hit.jurisdiction === body.jurisdiction)
      .filter((hit) => !refs.length || refs.some((ref) => [hit.documentId, hit.documentSlug, hit.shortTitle].includes(ref)));
    return HttpResponse.json({ hits: hits.slice(0, Number.isInteger(body.k) ? body.k : 8) });
  }),
  http.post(abs('/api/corpus/check-citations'), async ({ request }) => {
    const items = (await readJson(request)).citations;
    if (!Array.isArray(items) || !items.length || items.length > 50) return apiError(400, 'INVALID_FIELD', 'citations must be a list of 1..50 items');
    return HttpResponse.json({ results: f.checkCitations(items) });
  }),
  http.post(abs('/api/corpus/reembed'), () => HttpResponse.json(f.queuedJob('corpus.reembed', 'corpus:reembed'), { status: 202 })),
  http.post(abs('/api/corpus/refresh-all'), () => HttpResponse.json(f.queuedJob('corpus.refresh_all', 'corpus:refresh-all'), { status: 202 })),

  // Obligations — filtered and paged ({obligations, total}),
  // by the judge's verdict too ("doubt" the two doubts as one,
  // "unchecked" the rows never judged), and with order=review
  // the doubted first, the gravest first among them; the bulk
  // review answers the rows it touched; a PATCH of the title
  // or the text drops the judge's verdict
  http.get(abs('/api/obligations'), ({ request }) => {
    const params = query(request);
    const limit = intParam(params, 'limit', 500, 1, 2000);
    const offset = intParam(params, 'offset', 0, 0, 10_000_000);
    if (limit === null || offset === null) return apiError(400, 'INVALID_QUERY', 'limit must be 1..2000 and offset ≥ 0');
    const status = params.get('status');
    const category = params.get('category');
    const q = (params.get('q') ?? '').trim().slice(0, 200).toLowerCase();
    const check = params.get('verification');
    const verdict = (row) => row.verification?.verdict ?? null;
    const rows = f.obligations
      .filter((row) => !params.get('document') || row.documentId === params.get('document'))
      .filter((row) => !OBLIGATION_STATUSES.includes(status) || row.status === status)
      .filter((row) => !CATEGORIES.includes(category) || row.category === category)
      .filter((row) => !q || row.title.toLowerCase().includes(q) || row.text.toLowerCase().includes(q))
      .filter((row) => !VERDICTS.includes(check) || verdict(row) === check)
      .filter((row) => check !== 'doubt' || ['unsupported', 'partly'].includes(verdict(row)))
      .filter((row) => check !== 'unchecked' || !row.verification);
    // The sort is stable: within a rank the view's own order stays
    if (params.get('order') === 'review') rows.sort((a, b) => reviewRank(a) - reviewRank(b));
    return HttpResponse.json({ obligations: rows.slice(offset, offset + limit), total: rows.length });
  }),
  http.post(abs('/api/obligations/review'), async ({ request }) => {
    const body = await readJson(request);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length || ids.length > 500) return apiError(400, 'INVALID_FIELD', 'ids must be a list of 1..500 obligation ids');
    if (!OBLIGATION_STATUSES.includes(body.status)) return apiError(400, 'INVALID_FIELD', 'status must be one of proposed, approved, rejected');
    return HttpResponse.json({ updated: f.obligations.filter((row) => ids.includes(row.id)).length, status: body.status });
  }),
  http.get(abs('/api/obligations/:obligationId'), ({ params }) => found(f.obligations.find((row) => row.id === params.obligationId), 'Obligation')),
  http.patch(abs('/api/obligations/:obligationId'), async ({ params, request }) => {
    const current = f.obligations.find((row) => row.id === params.obligationId);
    if (!current) return notFound('Obligation');
    const changes = pick(await readJson(request), OBLIGATION_FIELDS);
    return HttpResponse.json({
      ...current,
      ...changes,
      ...('status' in changes && { reviewedBy: f.me.id, reviewedAt: f.NOW }),
      // The judge compared the title and the text as they stood
      ...(('title' in changes || 'text' in changes) && { verification: null }),
      updatedAt: f.NOW,
    });
  }),
  http.delete(abs('/api/obligations/:obligationId'), ({ params }) => (f.obligations.some((row) => row.id === params.obligationId)
    ? HttpResponse.json({ ok: true }) : notFound('Obligation'))),

  // Reports — the list rows carry the job's progress; a start
  // answers the queued row (201), with the review and the
  // assessment of the company's own requirements it asked for
  // in its scope; estimate before :reportId, always counting
  // the company's policy-level documents and pricing those
  // requirements apart when asked (internal=true); the scope
  // of the waiting report is priced (a dry run — with the
  // company's own requirements, had it been started with
  // them) or approved, which answers it queued for its second
  // part; the sign-off answers the report with what it did to
  // the company's action register, a withdrawal with how many
  // actions it changed; a finding's review answers the finding with the
  // verdict, the note and the cause as sent (a cause trimmed,
  // null clearing it); the export is a file with its
  // Content-Disposition
  http.get(abs('/api/reports'), ({ request }) => {
    const companyId = query(request).get('companyId');
    return HttpResponse.json({ reports: f.reports.filter((row) => !companyId || row.companyId === companyId) });
  }),
  http.post(abs('/api/reports'), async ({ request }) => {
    const body = await readJson(request);
    const target = f.company(body.companyId);
    if (!target) return notFound('Company');
    return HttpResponse.json({
      ...f.NEW.report,
      companyId: target.id,
      companyName: target.name,
      language: body.language || 'lt',
      scope: {
        documentIds: Array.isArray(body.documentIds) ? body.documentIds : [],
        ...(body.review === true ? { review: true } : {}),
        ...(body.internal === true ? { internal: true } : {}),
      },
    }, { status: 201 });
  }),
  http.get(abs('/api/reports/estimate'), ({ request }) => found(
    f.estimate(query(request).get('companyId'), query(request).get('internal') === 'true'), 'Company')),
  http.get(abs('/api/reports/:reportId'), ({ params }) => found(f.report(params.reportId), 'Report')),
  http.patch(abs('/api/reports/:reportId'), async ({ params, request }) => {
    const detail = f.report(params.reportId);
    if (!detail) return notFound('Report');
    const body = await readJson(request);
    if (typeof body.approved !== 'boolean') return apiError(400, 'MISSING_FIELDS', 'approved (true or false) is required');
    if (detail.status !== 'done') return apiError(409, 'NOT_FINISHED', 'Only finished reports can be approved');
    return HttpResponse.json(body.approved
      ? { ...detail, approvedBy: f.me.id, approvedByName: f.me.displayName, approvedAt: f.NOW, approvalNote: typeof body.note === 'string' ? body.note.trim() : '', register: f.signOff(detail.id) }
      : { ...detail, approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '', register: { withdrawn: f.withdrawal(detail.id) } });
  }),
  http.delete(abs('/api/reports/:reportId'), ({ params }) => {
    const detail = f.report(params.reportId);
    if (!detail) return notFound('Report');
    return ['queued', 'running'].includes(detail.status)
      ? apiError(409, 'STILL_RUNNING', 'Cancel the running analysis first')
      : HttpResponse.json({ ok: true });
  }),
  http.post(abs('/api/reports/:reportId/cancel'), ({ params }) => {
    const detail = f.report(params.reportId);
    if (!detail) return notFound('Report');
    const row = omit(detail, REPORT_DETAIL_KEYS);
    // A queued job is cancelled at once; a running one only
    // gets the request (the report stays running until the
    // worker stops at its next check); a report waiting for
    // its scope has no job at work and is cancelled outright
    if (detail.status === 'queued') return HttpResponse.json({ ...row, status: 'cancelled', finishedAt: f.NOW, jobStatus: 'cancelled' });
    if (detail.status === 'scope_review') return HttpResponse.json({ ...row, status: 'cancelled', finishedAt: f.NOW });
    if (detail.status === 'running') return HttpResponse.json(row);
    return apiError(409, 'NOT_CANCELLABLE', `The analysis is already ${detail.status}`);
  }),
  http.post(abs('/api/reports/:reportId/scope'), async ({ params, request }) => {
    const detail = f.report(params.reportId);
    if (!detail) return notFound('Report');
    if (detail.status !== 'scope_review') return apiError(409, 'NOT_WAITING', 'The report is not waiting for its scope to be approved');
    const body = await readJson(request);
    const choices = body.acts && typeof body.acts === 'object' && !Array.isArray(body.acts) ? body.acts : {};
    if (body.approved !== true) return HttpResponse.json(f.scopeEstimate(detail.id, choices, detail.scope?.internal === true));
    const acts = f.scopeActs(detail.id, choices);
    if (!acts.some((act) => ['assessed', 'upcoming'].includes(act.assessment))) {
      return apiError(400, 'NOTHING_TO_ASSESS', 'Nothing is left to assess — take at least one act in');
    }
    return HttpResponse.json({
      ...detail, acts, status: 'queued', jobId: f.ID.newReportJob, jobStatus: 'queued', progress: {},
      scopeApprovedBy: f.me.id, scopeApprovedByName: f.me.displayName, scopeApprovedAt: f.NOW,
    });
  }),
  http.patch(abs('/api/reports/:reportId/findings/:findingId'), async ({ params, request }) => {
    const current = f.report(params.reportId)?.findings.find((row) => row.id === params.findingId);
    if (!current) return notFound('Finding');
    const body = await readJson(request);
    const override = 'overrideStatus' in body ? body.overrideStatus : current.overrideStatus;
    return HttpResponse.json({
      ...current,
      overrideStatus: override,
      effectiveStatus: override || current.status,
      reviewerNote: 'reviewerNote' in body ? String(body.reviewerNote ?? '').slice(0, 4000) : current.reviewerNote,
      cause: 'cause' in body ? String(body.cause ?? '').trim().slice(0, 2000) : current.cause,
      reviewedBy: f.me.id,
      reviewedAt: f.NOW,
    });
  }),
  http.get(abs('/api/reports/:reportId/export'), ({ params, request }) => {
    const detail = f.report(params.reportId);
    if (!detail) return notFound('Report');
    if (detail.status !== 'done') return apiError(409, 'NOT_FINISHED', 'Only finished reports can be exported');
    const file = f.reportExport(detail.id, query(request).get('format') || 'pdf');
    if (!file) return apiError(400, 'INVALID_QUERY', 'format must be pdf or xlsx');
    return new HttpResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }),

  // Action register — a company's actions with the count of
  // each state; a person's hand on one action (owner, due
  // date, status, note), answered with its state worked out
  // again: closing by hand needs a note and stamps who closed
  // it, any other status on a closed action reopens it; the
  // register as a workbook with its Content-Disposition; and
  // what the law did since the company's latest report
  http.get(abs('/api/companies/:companyId/actions'), ({ params }) => (f.company(params.companyId)
    ? HttpResponse.json(f.companyActions(params.companyId)) : notFound('Company'))),
  http.get(abs('/api/companies/:companyId/actions/export'), ({ params }) => {
    const file = f.actionsExport(params.companyId);
    if (!file) return notFound('Company');
    return new HttpResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }),
  http.patch(abs('/api/actions/:actionId'), async ({ params, request }) => {
    const current = f.companyAction(params.actionId);
    if (!current) return notFound('Action');
    const body = await readJson(request);
    const next = { ...current };
    if ('owner' in body) {
      if (typeof body.owner !== 'string') return apiError(400, 'INVALID_FIELD', 'owner must be text');
      next.owner = body.owner.trim().slice(0, 300);
    }
    if ('dueDate' in body) {
      const date = String(body.dueDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return apiError(400, 'INVALID_FIELD', 'dueDate must be a date (YYYY-MM-DD)');
      next.dueDate = date;
    }
    if ('note' in body) {
      if (body.note !== null && typeof body.note !== 'string') return apiError(400, 'INVALID_FIELD', 'note must be text');
      next.note = (body.note ?? '').trim().slice(0, 4000);
    }
    if ('status' in body) {
      if (!ACTION_STATUSES.includes(body.status)) return apiError(400, 'INVALID_FIELD', `status must be one of ${ACTION_STATUSES.join(', ')}`);
      if (body.status === 'closed' && current.status !== 'closed') {
        if (!next.note) return apiError(400, 'NOTE_REQUIRED', "Say in the note why the action is closed without a report's confirmation");
        Object.assign(next, { closedAt: f.NOW, closedByName: f.me.displayName, confirmedReportId: null, closedHow: 'manual' });
      } else if (body.status !== 'closed' && current.status === 'closed') {
        if (current.confirmedReportId) return apiError(409, 'CLOSED_BY_REPORT', 'A signed-off report closed this action — to dispute it, review the finding in that report');
        Object.assign(next, { closedAt: null, closedByName: null, confirmedReportId: null, closedHow: null });
      }
      next.status = body.status;
    }
    return HttpResponse.json({ ...next, state: f.actionState(next.status, next.dueDate), updatedAt: f.NOW });
  }),
  http.get(abs('/api/companies/:companyId/law-changes'), ({ params }) => found(f.lawChanges(params.companyId), 'Company')),

  // Programme — a company's work products by kind, newest
  // version first, with the kinds there are; a start answers
  // the queued product (201). One product with its content;
  // its approval by a person, refused while a blocking rule
  // is broken; an edit of the whole content, answered
  // normalised with the rules run again; a revision of an
  // approved product (201, a draft one version on); the
  // chart as an SVG image and the export as a file with its
  // Content-Disposition
  http.get(abs('/api/companies/:companyId/programme'), ({ params }) => (f.company(params.companyId)
    ? HttpResponse.json(p.companyProgramme(params.companyId)) : notFound('Company'))),
  http.post(abs('/api/companies/:companyId/programme'), async ({ params, request }) => {
    const detail = f.company(params.companyId);
    if (!detail) return notFound('Company');
    const body = await readJson(request);
    const language = body.language || 'lt';
    if (!p.KINDS.some((row) => row.kind === body.kind)) return apiError(400, 'INVALID_FIELD', 'kind must be one of policy, governance, risks');
    if (!['lt', 'en'].includes(language)) return apiError(400, 'INVALID_FIELD', 'language must be lt or en');
    if (!detail.documents.some((row) => row.charCount > 0)) return apiError(409, 'NO_DOCUMENTS', 'The company has no readable documents — upload them first');
    const running = p.products.some((row) => row.companyId === detail.id && row.kind === body.kind && ['queued', 'running'].includes(row.status));
    if (running) return apiError(409, 'ALREADY_RUNNING', 'This product is already being generated');
    return HttpResponse.json(p.newProduct({ kind: body.kind, language, companyId: detail.id }), { status: 201 });
  }),
  http.get(abs('/api/programme/:productId'), ({ params }) => found(p.product(params.productId), 'Product')),
  http.patch(abs('/api/programme/:productId'), async ({ params, request }) => {
    const detail = p.product(params.productId);
    if (!detail) return notFound('Product');
    const body = await readJson(request);
    if (body.approved !== true) return apiError(400, 'MISSING_FIELDS', 'approved: true is required');
    if (body.note != null && typeof body.note !== 'string') return apiError(400, 'INVALID_FIELD', 'note must be text');
    if (detail.status !== 'draft') return apiError(409, 'NOT_DRAFT', 'Only a draft can be approved');
    const broken = detail.checks.filter((row) => row.blocking && !row.ok).map((row) => row.rule);
    if (broken.length) return apiError(409, 'RULES_BROKEN', `The draft breaks rules of its kind: ${broken.join(', ')}`);
    return HttpResponse.json({
      ...detail, status: 'approved', approvedBy: f.me.id, approvedByName: f.me.displayName, approvedAt: f.NOW,
      approvalNote: typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '',
    });
  }),
  http.delete(abs('/api/programme/:productId'), ({ params }) => {
    const detail = p.product(params.productId);
    if (!detail) return notFound('Product');
    return ['queued', 'running'].includes(detail.status)
      ? apiError(409, 'STILL_RUNNING', 'Cancel the generation first')
      : HttpResponse.json({ ok: true });
  }),
  http.put(abs('/api/programme/:productId/content'), async ({ params, request }) => {
    const detail = p.product(params.productId);
    if (!detail) return notFound('Product');
    const { content } = await readJson(request);
    if (!content || typeof content !== 'object' || Array.isArray(content)) return apiError(400, 'MISSING_FIELDS', 'content (an object) is required');
    if (detail.status !== 'draft') return apiError(409, 'NOT_DRAFT', 'Only a draft can be edited — revise an approved product first');
    return HttpResponse.json(p.normalise(detail, content));
  }),
  http.post(abs('/api/programme/:productId/revise'), ({ params }) => {
    const detail = p.product(params.productId);
    if (!detail) return notFound('Product');
    if (detail.status !== 'approved') return apiError(409, 'NOT_APPROVED', 'Only an approved product is revised — a draft is edited as it is');
    const newest = p.products.find((row) => row.companyId === detail.companyId && row.kind === detail.kind);
    if (newest && ['queued', 'running', 'draft'].includes(newest.status)) return apiError(409, 'NEWER_VERSION', 'A newer version is already in work');
    return HttpResponse.json(p.revisedProduct(detail), { status: 201 });
  }),
  http.post(abs('/api/programme/:productId/cancel'), ({ params }) => {
    const detail = p.product(params.productId);
    if (!detail) return notFound('Product');
    // A queued job is cancelled at once; a running one only
    // gets the request and stops at its next step
    if (detail.status === 'queued') return HttpResponse.json({ ...p.listed(detail), status: 'cancelled', finishedAt: f.NOW, jobStatus: 'cancelled' });
    if (detail.status === 'running') return HttpResponse.json(p.listed(detail));
    return apiError(409, 'NOT_CANCELLABLE', `The generation is already ${detail.status}`);
  }),
  http.get(abs('/api/programme/:productId/chart'), ({ params }) => {
    const nodes = p.product(params.productId)?.content?.structure;
    if (!nodes?.length) return apiError(404, 'NOT_FOUND', 'This product has no structure to draw');
    return new HttpResponse(p.chartSvg(nodes), { headers: { 'Content-Type': 'image/svg+xml' } });
  }),
  http.get(abs('/api/programme/:productId/export'), ({ params, request }) => {
    const detail = p.product(params.productId);
    if (!detail) return apiError(404, 'NOT_FOUND', 'Work product not found');
    if (!['draft', 'approved'].includes(detail.status)) return apiError(409, 'NOT_READY', 'Only a draft or an approved product can be exported');
    const file = p.productExport(detail.id, query(request).get('format') || 'pdf');
    if (!file) return apiError(400, 'INVALID_QUERY', `format must be one of: ${p.FORMATS[detail.kind].join(', ')}`);
    return new HttpResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }),

  // Prompts and models — a new version answers itself (201,
  // numbered after the newest); activate answers the prompt
  http.get(abs('/api/prompts'), () => HttpResponse.json({ prompts: f.prompts })),
  http.get(abs('/api/prompts/:slug'), ({ params }) => found(f.promptDetail(params.slug), 'Prompt')),
  http.post(abs('/api/prompts/:slug/versions'), async ({ params, request }) => {
    const detail = f.promptDetail(params.slug);
    if (!detail) return notFound('Prompt');
    return HttpResponse.json({
      ...f.NEW.promptVersion,
      promptSlug: detail.slug,
      version: Math.max(...detail.versions.map((row) => row.version)) + 1,
      ...pick(await readJson(request), PROMPT_VERSION_FIELDS),
    }, { status: 201 });
  }),
  http.post(abs('/api/prompts/:slug/versions/:version/activate'), ({ params }) => {
    const detail = f.promptDetail(params.slug);
    if (!detail) return notFound('Prompt');
    const version = detail.versions.find((row) => row.version === Number(params.version));
    if (!version) return notFound('Version');
    const newestDefault = Math.max(0, ...detail.versions.filter((row) => row.source === 'default').map((row) => row.version));
    return HttpResponse.json({
      ...omit(detail, ['versions']),
      activeVersion: version.version,
      activeModel: version.model,
      pendingDefault: newestDefault > version.version && version.source !== 'default' ? newestDefault : null,
    });
  }),
  http.post(abs('/api/prompts/:slug/test'), async ({ params, request }) => {
    if (!f.promptDetail(params.slug)) return notFound('Prompt');
    return found(f.promptTest(params.slug, await readJson(request)), 'Version');
  }),
  http.get(abs('/api/llm/models'), json(f.llmModels)),

  // MCP servers — header values never come back, only names;
  // a new server starts disabled; a test answers {…server, ok}
  http.get(abs('/api/mcp/servers'), () => HttpResponse.json({ servers: f.mcpServers })),
  http.post(abs('/api/mcp/servers'), async ({ request }) => {
    const body = await readJson(request);
    return HttpResponse.json({
      ...f.NEW.mcpServer,
      ...pick(body, MCP_FIELDS),
      headerNames: headerNames([], body.headers),
      enabled: body.enabled === true,
    }, { status: 201 });
  }),
  http.get(abs('/api/mcp/servers/:serverId'), ({ params }) => found(f.mcpServers.find((row) => row.id === params.serverId), 'MCP server')),
  http.patch(abs('/api/mcp/servers/:serverId'), async ({ params, request }) => {
    const server = f.mcpServers.find((row) => row.id === params.serverId);
    if (!server) return notFound('MCP server');
    const body = await readJson(request);
    return HttpResponse.json({ ...server, ...pick(body, MCP_FIELDS), headerNames: headerNames(server.headerNames, body.headers), updatedAt: f.NOW });
  }),
  http.delete(abs('/api/mcp/servers/:serverId'), ({ params }) => (f.mcpServers.some((row) => row.id === params.serverId)
    ? HttpResponse.json({ ok: true }) : notFound('MCP server'))),
  http.post(abs('/api/mcp/servers/:serverId/test'), ({ params }) => found(f.mcpTest(params.serverId), 'MCP server')),

  // Jobs — newest first, filtered; counts before :jobId; a
  // queued job cancels at once, a running one is flagged.
  // The job of the work product being generated stands
  // beside the lists, like its product (programme.js)
  http.get(abs('/api/jobs'), ({ request }) => {
    const params = query(request);
    const status = params.get('status');
    if (status && !JOB_STATUSES.includes(status)) return apiError(400, 'INVALID_QUERY', 'Unknown status');
    const limit = clampedLimit(params);
    if (limit === null) return apiError(400, 'INVALID_QUERY', 'limit must be an integer');
    const rows = f.jobs
      .filter((row) => !status || row.status === status)
      .filter((row) => !params.get('kind') || row.kind === params.get('kind'))
      .filter((row) => !params.get('subject') || row.subject === params.get('subject'));
    return HttpResponse.json({ jobs: rows.slice(0, limit) });
  }),
  http.get(abs('/api/jobs/counts'), json(f.jobCounts)),
  http.get(abs('/api/jobs/:jobId'), ({ params }) => found(f.job(params.jobId) ?? p.productJob(params.jobId), 'Job')),
  http.post(abs('/api/jobs/:jobId/cancel'), ({ params }) => {
    const detail = f.job(params.jobId);
    if (!detail) return notFound('Job');
    const row = omit(detail, ['steps']);
    if (detail.status === 'queued') return HttpResponse.json({ ...row, status: 'cancelled', cancelRequested: true, finishedAt: f.NOW });
    if (detail.status === 'running') return HttpResponse.json({ ...row, cancelRequested: true });
    return apiError(409, 'NOT_CANCELLABLE', `Job is already ${detail.status}`);
  }),

  // Usage — the caller's own calls unless scope=all or
  // userId= (an admin's wider view); the call log is paged
  http.get(abs('/api/usage'), ({ request }) => {
    const params = query(request);
    const days = intParam(params, 'days', 30, 1, 366);
    if (days === null) return apiError(400, 'INVALID_QUERY', 'days must be 1..366');
    return HttpResponse.json(f.usage({ days, scope: params.get('scope') ?? '', userId: params.get('userId') ?? '' }));
  }),
  http.get(abs('/api/usage/calls'), ({ request }) => {
    const params = query(request);
    const kind = params.get('kind');
    if (kind && !CALL_KINDS.includes(kind)) return apiError(400, 'INVALID_QUERY', 'kind must be one of chat, job_step, embed, prompt_test');
    const limit = intParam(params, 'limit', 50, 1, 200);
    const offset = intParam(params, 'offset', 0, 0, 10_000_000);
    if (limit === null || offset === null) return apiError(400, 'INVALID_QUERY', 'limit must be 1..200 and offset ≥ 0');
    const userId = params.get('userId');
    const rows = f.usageCalls
      .filter((row) => (userId ? row.userId === userId : params.get('scope') === 'all' || row.userId === f.me.id))
      .filter((row) => !kind || row.kind === kind);
    return HttpResponse.json({ calls: rows.slice(offset, offset + limit), total: rows.length });
  }),
  http.get(abs('/api/usage/calls/:callId'), ({ params }) => found(f.usageCall(params.callId), 'Call')),

  // Audit — newest first by (createdAt, id), as the fixture
  // rows are; action is a prefix; before alone a strict
  // "earlier than", with beforeId the keyset cursor `next`
  // hands out (null after the last page)
  http.get(abs('/api/audit'), ({ request }) => {
    const params = query(request);
    const limit = clampedLimit(params);
    if (limit === null) return apiError(400, 'INVALID_QUERY', 'limit must be an integer');
    const action = params.get('action');
    const userId = params.get('user');
    const before = params.get('before') ? Date.parse(params.get('before')) : null;
    const beforeId = params.get('beforeId');
    if (beforeId && before === null) return apiError(400, 'INVALID_QUERY', 'beforeId needs before');
    if (Number.isNaN(before)) return apiError(400, 'INVALID_QUERY', 'before must be an ISO 8601 datetime');
    const rows = f.auditEntries
      .filter((row) => !action || row.action.startsWith(action))
      .filter((row) => !userId || row.userId === userId)
      .filter((row) => before === null || Date.parse(row.createdAt) < before
        || (beforeId && Date.parse(row.createdAt) === before && row.id < beforeId));
    const last = rows.length > limit ? rows[limit - 1] : null;
    return HttpResponse.json({ entries: rows.slice(0, limit), next: last && { before: last.createdAt, beforeId: last.id } });
  }),
];
