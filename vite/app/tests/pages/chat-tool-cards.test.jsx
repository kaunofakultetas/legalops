// -----------------------------------------------------------
//  [*] Tests — Chat tool cards (how tool calls look in a
//      reply)
//
//  ToolCards.jsx through the page: a reply's tool parts —
//  stored in the history, or streamed in — rendered where the
//  model made them:
//
//    - ToolPill, the default: the translated tool name (an
//      MCP tool as "External source: …", an unknown tool by
//      its own name), the state in words AND an icon
//      (running / done / failed / stopped), a failed call's
//      bracketed code, and the details it expands to (the
//      request, the result or the error text);
//    - ReportToolCard (runComplianceAnalysis /
//      approveReportScope / getReport):
//      title, status, the counts by status and severity, the
//      "already running" note, the link to /reports/:id, and a
//      running report followed live through GET
//      /api/reports/:id (the progress, then the result); a
//      report waiting for its list of acts to be approved
//      names that status and keeps the link, with no bar, no
//      poll and no "already running"; the company's own
//      requirements of a report that assessed them, as one
//      quiet line under the chips and never among them;
//    - CorpusToolCard (searchLegalCorpus / getLegalProvision /
//      checkCitations): citation chips opening the official
//      text in a new tab, the version date, "nothing found",
//      and the verdict per checked reference;
//    - EstimateToolCard (estimateAnalysisCost): the upper-
//      bound total, its parts, the acts, the budget left or
//      unlimited, unknown prices;
//    - ProductToolCard (startWorkProduct / getWorkProduct): a
//      work product of a compliance programme — title,
//      version, status, the link to
//      /programme/:id; a generation followed live through GET
//      /api/programme/:id; a refused start in plain words,
//      with the product standing in the way; a list of the
//      kinds, one of them not generated yet; the blocking
//      rules a draft breaks and its notes;
//    - ActionsToolCard (getActionRegister): a company's
//      action register — the counts by state in words, the
//      late first, and the link to the company's Actions tab;
//    - a card's call still running or failed falls back to
//      the pill; markdown in the reply around the cards;
//      both languages; outputs of the wrong shape.
//
//  The outputs are built the way the assistant's tools build
//  them (assistant/app/llm/tools/reports.js reportCard and
//  estimateOf, corpus.js citationOf, and the programme tools'
//  answers as their contract gives them) from the fixture
//  world.
// -----------------------------------------------------------

import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { given } from '../support/backend/server';
import { expectNoCrash, settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import * as p from '../support/backend/programme';
import en from '@/messages/PAGES/chat/en.json';
import lt from '@/messages/PAGES/chat/lt.json';
import enumsEn from '@/messages/ENUMS/en.json';
import enumsLt from '@/messages/ENUMS/lt.json';
import {
  assistantRow, openChatStream, renderChat, resetChatLayout, sendMessage, textChunks, toolChunks, userRow,
} from '../support/chat';


afterEach(() => {
  resetChatLayout();
});


// Every tool with a name of its own, in both languages
const TOOL_NAMES = Object.keys(en.TOOLS.NAMES);

// The words a finished reply ends with — what a test waits for
const DONE_TEXT = 'Tai viskas.';

// The order the report card lists its counts in (ToolCards
// ReportCard): findings by concern, then open ones by severity
const FINDING_ORDER = ['missing', 'partial', 'unknown', 'met', 'not_applicable'];
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];







// -----------------------------------------------------------
// Tool outputs
// -----------------------------------------------------------
//
// The assistant's own shapes: reportCardOf (reports.js
// reportCard of a fixture report), hitOf (corpus.js
// citationOf plus the hit's text), the estimate (estimateOf
// of the fixture estimate), the citation check (results +
// counts of the fixture checks). countChips / effectiveCounts
// derive what a report card must show from the same fixture.
// -----------------------------------------------------------

const reportCardOf = (id, extra = {}) => {
  const r = f.report(id);
  return {
    report: {
      id: r.id, companyId: r.companyId, companyName: r.companyName, status: r.status, jobStatus: r.jobStatus,
      language: r.language, title: r.title || null, createdAt: r.createdAt, finishedAt: r.finishedAt,
      progress: r.progress ? { step: r.progress.step ?? null, percent: r.progress.percent ?? null, message: r.progress.message ?? null } : null,
      error: r.error, url: `/reports/${r.id}`,
    },
    counts: {
      acts: r.stats?.acts ?? null, findings: r.stats?.findings ?? null,
      openBySeverity: r.stats?.openBySeverity ?? null, actions: r.stats?.actions ?? null,
    },
    ...extra,
  };
};

const hitOf = (hit) => ({
  unitId: hit.unitId, documentId: hit.documentId, shortTitle: hit.shortTitle, title: hit.documentTitle,
  jurisdiction: hit.jurisdiction, path: hit.path, heading: hit.heading, citationUrl: hit.citationUrl || hit.sourceUrl,
  text: 'Tekstas…', score: hit.score,
});

const ESTIMATE = (() => {
  const e = f.estimate(f.ID.pavyzdys);
  return {
    totalUsd: e.totalUsd, analysisUsd: e.analysisUsd, extractionUsd: e.extractionUsd, upperBound: e.upperBound,
    pricesKnown: e.pricesKnown, acts: e.acts, obligations: e.obligations, actsToExtract: e.actsToExtract, budget: e.budget,
  };
})();

// The count chips a report card shows for these counts, in
// its order, zeros left out, labelled in the given language —
// derived from the fixture, never typed in
const countChips = (findings, openBySeverity = {}, locale = 'en') => {
  const enums = locale === 'lt' ? enumsLt : enumsEn;
  return [
    ...FINDING_ORDER.filter((key) => findings?.[key]).map((key) => `${enums.findingStatus[key]}: ${findings[key]}`),
    ...SEVERITY_ORDER.filter((key) => openBySeverity?.[key]).map((key) => `${enums.severity[key]}: ${openBySeverity[key]}`),
  ];
};

// The live findings of a report, counted by effective status
const effectiveCounts = (report) => report.findings.reduce(
  (acc, finding) => ({ ...acc, [finding.effectiveStatus]: (acc[finding.effectiveStatus] || 0) + 1 }), {},
);

// The same results as the assistant's tool passes them on: each
// row with what its reference claimed the article is about
const claimedRows = (checks) => ({ ...checks, results: checks.results.map((row, index) => ({ ...row, claimedHeading: f.CITATION_CHECKS[index].claimedHeading ?? null })) });

const CHECKS = (() => {
  const results = f.checkCitations(f.CITATION_CHECKS).map((row) => ({ ...row, headingMatch: row.headingMatch ?? 'unknown' }));
  return { results, counts: { found: 3, headingMismatch: 1, notFound: 1, actNotInCorpus: 1 } };
})();

const CLAIMED = claimedRows(CHECKS);







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// toolPart: one stored tool part as the AI SDK keeps it
// (tool-<name>, or dynamic-tool for an MCP tool). showReply:
// the licence conversation whose stored reply is the given
// parts followed by DONE_TEXT — resolved once the reply is
// on screen. reply: the assistant bubble. pillOf: a pill's
// button by the tool's label (its accessible name starts
// with it).
// -----------------------------------------------------------

const toolPart = (toolName, { state = 'output-available', input = {}, output, errorText, toolCallId = `call_${toolName}` } = {}) => ({
  ...(toolName.startsWith('mcp_') ? { type: 'dynamic-tool', toolName } : { type: `tool-${toolName}` }),
  toolCallId, state, input,
  ...(output !== undefined ? { output } : {}),
  ...(errorText !== undefined ? { errorText } : {}),
});

const showReply = async (parts, options = {}) => {
  given.json('get', '/api/chat/threads/:threadId/messages', [
    userRow('msg-u-1', 'Klausimas'),
    assistantRow('srv-1', [{ type: 'step-start' }, ...parts, { type: 'step-start' }, { type: 'text', state: 'done', text: DONE_TEXT }], 'msg-u-1'),
  ]);
  const view = renderChat({ route: `/chat/${f.ID.licenceThread}`, ...options });
  await screen.findByText(DONE_TEXT);
  return view;
};

const reply = () => screen.getByTestId('assistant-message');

const pillOf = (label) => within(reply()).getByRole('button', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });







// -----------------------------------------------------------
// ToolPill
// -----------------------------------------------------------
//
// The default rendering of every tool without a card, and of
// a card's call that is running or failed.
// -----------------------------------------------------------

describe('ToolPill', () => {

  it('names every tool the assistant has in words — never the function name', async () => {
    await showReply(TOOL_NAMES.filter((name) => !['runComplianceAnalysis', 'getReport', 'searchLegalCorpus', 'getLegalProvision', 'checkCitations', 'estimateAnalysisCost'].includes(name))
      .map((name, i) => toolPart(name, { toolCallId: `call_${i}`, output: { ok: true } })));
    for (const [name, label] of Object.entries(en.TOOLS.NAMES)) {
      if (['runComplianceAnalysis', 'getReport', 'searchLegalCorpus', 'getLegalProvision', 'checkCitations', 'estimateAnalysisCost'].includes(name)) continue;
      expect(pillOf(label)).toBeInTheDocument();
      expect(within(reply()).queryByText(name)).toBeNull();
    }
  });


  it('names them in Lithuanian', async () => {
    await showReply([toolPart('getCompany', { output: {} }), toolPart('setThreadRole', { toolCallId: 'c2', output: {} })], { locale: 'lt' });
    expect(pillOf(lt.TOOLS.NAMES.getCompany)).toHaveTextContent('Įmonės profilis·atlikta');
    expect(pillOf(lt.TOOLS.NAMES.setThreadRole)).toHaveTextContent('Pokalbio rolė·atlikta');
  });


  it('an approval of a report\'s list of acts that answered no report is a pill named in words', async () => {
    await showReply([toolPart('approveReportScope', { input: { reportId: f.ID.reportWaiting, confirmedCostUsd: 6 }, output: { approved: true } })]);
    expect(pillOf('Approving the list of acts')).toHaveTextContent('Approving the list of acts·done');
    expect(within(reply()).queryByText('approveReportScope')).toBeNull();
  });


  it('an MCP tool reads "External source: …", an unknown tool keeps its own name', async () => {
    await showReply([
      toolPart('mcp_eurlex_search_documents', { output: { results: [] } }),
      toolPart('brandNewTool', { toolCallId: 'c2', output: {} }),
    ]);
    expect(pillOf('External source: eurlex search documents')).toBeInTheDocument();
    expect(pillOf('brandNewTool')).toBeInTheDocument();
  });


  it('a finished call says "done" in words, with the check icon', async () => {
    await showReply([toolPart('getCompany', { output: { company: { name: 'UAB Pavyzdys' } } })]);
    const pill = pillOf('Company profile');
    expect(pill).toHaveTextContent('Company profile·done');
    expect(within(pill).getByTestId('CheckCircleOutlineIcon')).toBeInTheDocument();
    expect(pill).toHaveAttribute('aria-expanded', 'false');
  });


  it('expands to the request and the result, and folds back', async () => {
    const { user } = await showReply([toolPart('getCompany', { input: { companyId: f.ID.pavyzdys }, output: { company: { name: 'UAB Pavyzdys' } } })]);
    const pill = pillOf('Company profile');
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    const details = document.getElementById(pill.getAttribute('aria-controls'));
    expect(details).toHaveTextContent('Request');
    expect(details).toHaveTextContent(`"companyId": "${f.ID.pavyzdys}"`);
    expect(details).toHaveTextContent('Result');
    expect(details).toHaveTextContent('"name": "UAB Pavyzdys"');
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(pill.getAttribute('aria-controls'))).toBeNull();
  });


  it('a call without input shows no request section; a string result shows as it is', async () => {
    const { user } = await showReply([toolPart('listRoles', { input: {}, output: 'Rolių nėra.' })]);
    await user.click(pillOf('Role list'));
    const details = document.getElementById(pillOf('Role list').getAttribute('aria-controls'));
    expect(details).not.toHaveTextContent('Request');
    expect(details).toHaveTextContent('ResultRolių nėra.');
  });


  it('a failed call says "failed", shows the backend code the tool error opens with, and expands to the error text', async () => {
    const errorText = '[NOT_FOUND] getCompany failed (HTTP 404): Company not found';
    const { user } = await showReply([toolPart('getCompany', { state: 'output-error', input: { companyId: 'x' }, errorText })]);
    const pill = pillOf('Company profile');
    expect(pill).toHaveTextContent('Company profile·failedNOT_FOUND');
    expect(within(pill).getByTestId('ErrorOutlineIcon')).toBeInTheDocument();
    expect(within(pill).getByText('NOT_FOUND').tagName).toBe('CODE');
    await user.click(pill);
    const details = document.getElementById(pill.getAttribute('aria-controls'));
    expect(details).toHaveTextContent('Error');
    expect(details).toHaveTextContent(errorText);
  });


  it('a failure without a bracketed code shows no code', async () => {
    await showReply([toolPart('readDocument', { state: 'output-error', errorText: 'Something broke' })]);
    const pill = pillOf('Reading a document');
    expect(pill).toHaveTextContent('Reading a document·failed');
    expect(within(pill).queryByRole('code')).toBeNull();
    expect(pill.querySelector('code')).toBeNull();
  });


  it('a call still running says "running…" while the answer streams, then "done"', async () => {
    const turn = openChatStream();
    const { user } = renderChat();
    await sendMessage(user, 'Kokia įmonė?');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-tool-1' }, { type: 'start-step' },
      ...toolChunks({ toolName: 'getCompany', input: { companyId: f.ID.pavyzdys }, pending: true }));
    const pill = await within(await screen.findByTestId('assistant-message')).findByRole('button', { name: /^Company profile/ });
    expect(pill).toHaveTextContent('Company profile·running…');
    await turn.write({ type: 'tool-output-available', toolCallId: 'call_getCompany_1', output: { ok: true } }, { type: 'finish-step' },
      { type: 'start-step' }, ...textChunks('Radau.'), { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' });
    await turn.end();
    await waitFor(() => expect(pill).toHaveTextContent('Company profile·done'));
  });


  it('a call cut short by a stop says "stopped" — it used to spin "running…" for ever — and the reply carries the stop note', async () => {
    given.capture('post', '/api/assistant/chat/:threadId/stop', { stopped: true });
    const turn = openChatStream();
    const { user } = renderChat();
    await sendMessage(user, 'Kokia įmonė?');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-tool-2' }, { type: 'start-step' },
      ...toolChunks({ toolName: 'readDocument', input: { documentId: f.ID.policyDoc }, pending: true }));
    const pill = await within(await screen.findByTestId('assistant-message')).findByRole('button', { name: /^Reading a document/ });
    await user.click(screen.getByRole('button', { name: 'Stop the answer' }));
    await waitFor(() => expect(pill).toHaveTextContent('Reading a document·stopped'));
    expect(within(pill).getByTestId('BlockIcon')).toBeInTheDocument();
    expect(within(screen.getByTestId('assistant-message')).getByText('The answer was stopped.')).toBeInTheDocument();
  });


  it('a stored call that never got its result (the turn was interrupted) reads "stopped", and the stored status gives the note', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Klausimas'),
      assistantRow('srv-1', [{ type: 'step-start' }, toolPart('readDocument', { state: 'input-available', input: { documentId: f.ID.policyDoc } })],
        'msg-u-1', { status: 'interrupted' }),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    const pill = await within(await screen.findByTestId('assistant-message')).findByRole('button', { name: /^Reading a document/ });
    expect(pill).toHaveTextContent('Reading a document·stopped');
    expect(within(reply()).getByText('The answer was interrupted — the server restarted. You can regenerate it.')).toBeInTheDocument();
    expect(within(reply()).queryByText('The answer was stopped.')).toBeNull();
  });


  it('a failed call streamed in (tool-output-error) reads as failed with its code', async () => {
    const turn = openChatStream();
    const { user } = renderChat();
    await sendMessage(user, 'Pridėk licenciją');
    await turn.requested();
    await turn.write({ type: 'start', messageId: 'srv-tool-3' }, { type: 'start-step' },
      ...toolChunks({ toolName: 'addCredential', input: { name: 'Leidimas' }, errorText: '[FORBIDDEN] addCredential failed (HTTP 403): not yours' }),
      { type: 'finish-step' }, { type: 'start-step' }, ...textChunks('Nepavyko.'), { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' });
    await turn.end();
    const pill = await within(screen.getByTestId('assistant-message')).findByRole('button', { name: /^Recording a licence/ });
    expect(pill).toHaveTextContent('Recording a licence / certificate·failedFORBIDDEN');
  });
});







// -----------------------------------------------------------
// ReportToolCard
// -----------------------------------------------------------
//
// runComplianceAnalysis / getReport answered a report: the
// card; while the analysis runs, the card follows the live
// report.
// -----------------------------------------------------------

describe('ReportToolCard', () => {

  it('a finished report: the tool, the title, the status, the counts by status and by severity, and the link to the report', async () => {
    const { user } = await showReply([toolPart('getReport', { input: { reportId: f.ID.reportDone }, output: reportCardOf(f.ID.reportDone) })]);
    const card = reply();
    expect(within(card).getByText('Compliance report')).toBeInTheDocument();
    expect(within(card).getByText('UAB Pavyzdys atitikties vertinimas: MiCA, DORA ir PPTFPĮ')).toBeInTheDocument();
    expect(within(card).getByText('Finished')).toBeInTheDocument();
    // In the order of concern, zero counts left out — the
    // tool's snapshot of the stats
    const { stats } = f.report(f.ID.reportDone);
    const chips = within(card).getAllByText(/: \d+$/).map((chip) => chip.textContent);
    expect(chips).toEqual(countChips(stats.findings, stats.openBySeverity));
    expect(chips.length).toBeGreaterThan(3);
    // The report opens in a new tab — the conversation stays —
    // and the link says so to a screen reader
    const link = within(card).getByRole('link', { name: 'Open the report' });
    expect(link).toHaveTextContent('Open the report');
    expect(link).toHaveAttribute('href', `/reports/${f.ID.reportDone}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    await user.click(link);
    expect(screen.queryByTestId('navigated-away')).toBeNull();
  });


  it('a report that assessed the company\'s own requirements counts them in one quiet line under the chips — never among them', async () => {
    const own = f.ownReport.stats.internal;
    const output = reportCardOf(f.ID.reportOwn, {
      ownRequirements: { counts: own.findings, openBySeverity: own.openBySeverity, note: 'the company\'s own policies as criteria — not breaches of law' },
    });
    await showReply([toolPart('getReport', { input: { reportId: f.ID.reportOwn }, output })]);
    const card = reply();
    const line = within(card).getByText('Own requirements — Not met: 1 · Partial: 1 · Met: 1');
    expect(line.closest('.MuiChip-root')).toBeNull();
    // The chips are the acts' alone: those of the report without the group
    const { stats } = f.report(f.ID.reportDone);
    const chips = [...card.querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent).filter((label) => /: \d+$/.test(label));
    expect(chips).toEqual(countChips(stats.findings, stats.openBySeverity));
    // The tool's note is for the model — the card has its own words
    expect(within(card).queryByText(/as criteria/)).toBeNull();
  });


  it('a report without that group has no such line — nor has one whose group counts nothing', async () => {
    await showReply([
      toolPart('getReport', { toolCallId: 'c1', output: reportCardOf(f.ID.reportDone) }),
      toolPart('getReport', { toolCallId: 'c2', output: reportCardOf(f.ID.reportDone, { ownRequirements: { counts: null, openBySeverity: null, note: '' } }) }),
      toolPart('getReport', { toolCallId: 'c3', output: reportCardOf(f.ID.reportDone, { ownRequirements: 'x' }) }),
    ]);
    expect(within(reply()).getAllByText('Finished')).toHaveLength(3);
    expect(within(reply()).queryByText(/^Own requirements/)).toBeNull();
  });


  it('names the company\'s own requirements in Lithuanian', async () => {
    const own = f.ownReport.stats.internal;
    const output = reportCardOf(f.ID.reportOwn, { ownRequirements: { counts: own.findings, openBySeverity: own.openBySeverity, note: '' } });
    await showReply([toolPart('getReport', { output })], { locale: 'lt' });
    expect(within(reply()).getByText('Vidaus reikalavimai — Neatitinka: 1 · Iš dalies: 1 · Atitinka: 1')).toBeInTheDocument();
  });


  it('a finished report does not poll', async () => {
    const polls = given.capture('get', '/api/reports/:reportId', f.report(f.ID.reportDone));
    await showReply([toolPart('getReport', { output: reportCardOf(f.ID.reportDone) })]);
    await settle(100);
    expect(polls).toHaveLength(0);
  });


  it('an untitled report is "Compliance analysis: <company>"; "already running" says so', async () => {
    const card = reportCardOf(f.ID.reportFailed, { started: false, alreadyRunning: true });
    await showReply([toolPart('runComplianceAnalysis', { output: card })]);
    expect(within(reply()).getByText('Starting the compliance analysis')).toBeInTheDocument();
    expect(within(reply()).getByText('Compliance analysis: UAB Pavyzdys')).toBeInTheDocument();
    expect(within(reply()).getByText('Failed')).toBeInTheDocument();
    expect(within(reply()).getByText('This analysis is already running')).toBeInTheDocument();
  });


  it('a running analysis follows the live report: GET /api/reports/:id, its progress and step', async () => {
    const polls = given.capture('get', '/api/reports/:reportId', f.report(f.ID.reportRunning));
    await showReply([toolPart('runComplianceAnalysis', { output: reportCardOf(f.ID.reportRunning, { started: true }) })]);
    await waitFor(() => expect(polls.length).toBeGreaterThan(0));
    expect(new URL(polls[0].url).pathname).toBe(`/api/reports/${f.ID.reportRunning}`);
    const progress = within(reply()).getByRole('progressbar', { name: '33 % done' });
    expect(progress).toHaveAttribute('aria-valuenow', '33');
    expect(within(reply()).getByText('33 % done · Gap analysis')).toBeInTheDocument();
    expect(within(reply()).getByText('Running')).toBeInTheDocument();
  });


  it('when the live report finishes, the card shows its result — the counts from the reviewed findings', async () => {
    given.sequence('get', '/api/reports/:reportId', [
      { body: { ...f.report(f.ID.reportRunning), progress: { step: 'summary', percent: 90, message: null } } },
      { body: { ...f.report(f.ID.reportDone), id: f.ID.reportRunning } },
    ]);
    await showReply([toolPart('getReport', { output: reportCardOf(f.ID.reportRunning) })]);
    expect(await within(reply()).findByText('90 % done · Summary')).toBeInTheDocument();
    // The card polls every 5 s while the analysis runs
    expect(await within(reply()).findByText('Finished', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(reply()).queryByRole('progressbar')).toBeNull();
    // Counted from the live findings' effective status (a
    // reviewer's override wins), not the snapshot's stats
    const live = countChips(effectiveCounts(f.report(f.ID.reportDone)));
    const chips = within(reply()).getAllByText(/: \d+$/).map((chip) => chip.textContent);
    expect(chips.slice(0, live.length)).toEqual(live);
  }, 15000);


  it('a run followed to its end counts the company\'s own requirements from its live findings — in their line, apart from the acts', async () => {
    given.sequence('get', '/api/reports/:reportId', [
      { body: { ...f.report(f.ID.reportRunning), progress: { step: 'internal', percent: 50, message: '1/2 batches' } } },
      { body: { ...f.report(f.ID.reportOwn), id: f.ID.reportRunning } },
    ]);
    await showReply([toolPart('runComplianceAnalysis', { output: reportCardOf(f.ID.reportRunning, { started: true }) })]);
    expect(await within(reply()).findByText('50 % done · Assessing the company\'s own requirements')).toBeInTheDocument();
    expect(await within(reply()).findByText('Finished', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(reply()).getByText('Own requirements — Not met: 1 · Partial: 1 · Met: 1')).toBeInTheDocument();
    // The chips count the acts' findings only — the three of the group are not among them
    const live = countChips(effectiveCounts(f.report(f.ID.reportDone)));
    const chips = [...reply().querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent).filter((label) => /: \d+$/.test(label));
    expect(chips.slice(0, live.length)).toEqual(live);
  }, 15000);


  it('a queued report without a percentage reads "Running…"', async () => {
    const queued = reportCardOf(f.ID.reportRunning);
    queued.report = { ...queued.report, status: 'queued', progress: null };
    given.json('get', '/api/reports/:reportId', { ...f.report(f.ID.reportRunning), status: 'queued', progress: {} });
    await showReply([toolPart('runComplianceAnalysis', { output: queued })]);
    expect(await within(reply()).findByText('Running…')).toBeInTheDocument();
    expect(within(reply()).getByText('Queued')).toBeInTheDocument();
  });


  it('the approval of a report\'s list of acts answers the report card: the run it started, followed live, with the way to it', async () => {
    const polls = given.capture('get', '/api/reports/:reportId', f.report(f.ID.reportRunning));
    const card = { approved: true, ...reportCardOf(f.ID.reportRunning) };
    card.report = { ...card.report, status: 'queued', progress: null };
    await showReply([toolPart('approveReportScope', { input: { reportId: f.ID.reportRunning, confirmedCostUsd: 6 }, output: card })]);
    expect(within(reply()).getByText('Approving the list of acts')).toBeInTheDocument();
    expect(within(reply()).getByText('Compliance analysis: UAB Kreditas')).toBeInTheDocument();
    const link = within(reply()).getByRole('link', { name: 'Open the report' });
    expect(link).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
    expect(link).toHaveAttribute('target', '_blank');
    // Queued when the tool answered; the card follows the live report
    await waitFor(() => expect(polls.length).toBeGreaterThan(0));
    expect(await within(reply()).findByText('33 % done · Gap analysis')).toBeInTheDocument();
    expect(within(reply()).getByText('Running')).toBeInTheDocument();
    expect(within(reply()).queryByRole('button', { name: /^Approving the list of acts/ })).toBeNull();
  });


  it('names the approval card in Lithuanian', async () => {
    given.json('get', '/api/reports/:reportId', f.report(f.ID.reportRunning));
    await showReply([toolPart('approveReportScope', { output: { approved: true, ...reportCardOf(f.ID.reportRunning) } })], { locale: 'lt' });
    expect(within(reply()).getByText('Tvirtinamas aktų sąrašas')).toBeInTheDocument();
    expect(within(reply()).getByRole('link', { name: 'Atidaryti ataskaitą' })).toHaveAttribute('href', `/reports/${f.ID.reportRunning}`);
  });


  it('a report waiting for its list of acts: the status in words and the link — no progress, no counts, no poll', async () => {
    const polls = given.capture('get', '/api/reports/:reportId', f.report(f.ID.reportWaiting));
    await showReply([toolPart('getReport', { input: { reportId: f.ID.reportWaiting }, output: reportCardOf(f.ID.reportWaiting) })]);
    expect(within(reply()).getByText('Compliance analysis: UAB Pavyzdys')).toBeInTheDocument();
    expect(within(reply()).getByText('Awaiting scope approval')).toBeInTheDocument();
    const link = within(reply()).getByRole('link', { name: 'Open the report' });
    expect(link).toHaveAttribute('href', `/reports/${f.ID.reportWaiting}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(reply()).queryByRole('progressbar')).toBeNull();
    expect(within(reply()).queryAllByText(/: \d+$/)).toHaveLength(0);
    await settle(100);
    expect(polls).toHaveLength(0);
  });


  it('a start refused because that report waits shows it without "already running" — nothing is', async () => {
    const card = reportCardOf(f.ID.reportWaiting, { started: false, alreadyRunning: true });
    await showReply([toolPart('runComplianceAnalysis', { output: card })]);
    expect(within(reply()).getByText('Awaiting scope approval')).toBeInTheDocument();
    expect(within(reply()).queryByText('This analysis is already running')).toBeNull();
  });


  it('a running analysis that stops for the approval turns to that status and drops its bar', async () => {
    given.json('get', '/api/reports/:reportId', { ...f.report(f.ID.reportWaiting), id: f.ID.reportRunning });
    await showReply([toolPart('runComplianceAnalysis', { output: reportCardOf(f.ID.reportRunning, { started: true }) })]);
    expect(await within(reply()).findByText('Awaiting scope approval')).toBeInTheDocument();
    expect(within(reply()).queryByRole('progressbar')).toBeNull();
    expect(within(reply()).queryByText('Running')).toBeNull();
  });


  it('names the waiting status in Lithuanian', async () => {
    await showReply([toolPart('getReport', { output: reportCardOf(f.ID.reportWaiting) })], { locale: 'lt' });
    expect(within(reply()).getByText('Laukia apimties patvirtinimo')).toBeInTheDocument();
    expect(within(reply()).getByRole('link', { name: 'Atidaryti ataskaitą' })).toHaveAttribute('href', `/reports/${f.ID.reportWaiting}`);
  });


  it('a live report that cannot be read leaves the card as the tool left it', async () => {
    given.apiError('get', '/api/reports/:reportId', 'SERVER_ERROR', { status: 500 });
    await showReply([toolPart('getReport', { output: reportCardOf(f.ID.reportRunning) })]);
    await settle(100);
    expect(within(reply()).getByText('33 % done · Gap analysis')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('a failed call, or an answer without a report, is a pill', async () => {
    await showReply([
      toolPart('runComplianceAnalysis', { state: 'output-error', errorText: '[COST_NOT_CONFIRMED] runComplianceAnalysis failed: estimated at up to $5.88' }),
      toolPart('getReport', { toolCallId: 'c2', output: { note: 'nothing' } }),
    ]);
    expect(pillOf('Starting the compliance analysis')).toHaveTextContent('failedCOST_NOT_CONFIRMED');
    expect(pillOf('Compliance report')).toHaveTextContent('Compliance report·done');
    expect(within(reply()).queryByRole('link', { name: /Open the report/ })).toBeNull();
  });


  it('speaks Lithuanian', async () => {
    await showReply([toolPart('getReport', { output: reportCardOf(f.ID.reportDone) })], { locale: 'lt' });
    expect(within(reply()).getByText('Atitikties ataskaita')).toBeInTheDocument();
    expect(within(reply()).getByText('Baigta')).toBeInTheDocument();
    const { stats } = f.report(f.ID.reportDone);
    expect(within(reply()).getAllByText(/: \d+$/).map((chip) => chip.textContent))
      .toEqual(countChips(stats.findings, stats.openBySeverity, 'lt'));
    expect(within(reply()).getByText(`Neatitinka: ${stats.findings.missing}`)).toBeInTheDocument();
    expect(within(reply()).getByRole('link', { name: 'Atidaryti ataskaitą' })).toHaveTextContent('Atidaryti ataskaitą');
  });
});







// -----------------------------------------------------------
// CorpusToolCard
// -----------------------------------------------------------
//
// A pill that holds the articles that were read — links to
// the official text in a new tab (PAGES.chat.CITATIONS), the
// version date, a check's verdicts; opened, the call's exact
// input and output.
// -----------------------------------------------------------

describe('CorpusToolCard', () => {

  // The pill's frame around a call's button, the articles in
  // it, and the opened details the button controls
  const pill = (label) => pillOf(label).parentElement;
  const articles = (label) => within(pill(label)).queryAllByRole('listitem').map((item) => item.textContent);
  const details = (label) => document.getElementById(pillOf(label).getAttribute('aria-controls'));


  it('searchLegalCorpus: the articles it found inside the pill, each opening the official text in a new tab, safely', async () => {
    await showReply([toolPart('searchLegalCorpus', { input: { query: 'leidimas' }, output: { hits: f.corpusHits.map(hitOf) } })]);
    expect(pillOf('Searching the legal acts')).toHaveTextContent('Searching the legal acts·done');
    expect(pillOf('Searching the legal acts')).toHaveAttribute('aria-expanded', 'false');
    expect(articles('Searching the legal acts')).toEqual(['MiCA 59 str.', 'MiCA 75 str.', 'PPTFPĮ 22 str.']);
    const links = within(pill('Searching the legal acts')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Open the official text of “MiCA 59 str.” (new tab)',
      'Open the official text of “MiCA 75 str.” (new tab)',
      'Open the official text of “PPTFPĮ 22 str.” (new tab)',
    ]);
    expect(links[0]).toHaveAttribute('href', f.corpusHits[0].citationUrl);
    expect(links[2]).toHaveAttribute('href', 'https://www.e-tar.lt/portal/lt/legalAct/TAR.5C1E0F2A7B90');
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
      // A link is never inside the button that opens the pill
      expect(link.closest('button')).toBeNull();
    }
  });


  it('opened, a corpus call shows its exact input and output, and folds back — the articles stay', async () => {
    const output = { hits: f.corpusHits.map(hitOf) };
    const { user } = await showReply([toolPart('searchLegalCorpus', { input: { query: 'leidimas', k: 3 }, output })]);
    expect(details('Searching the legal acts')).toBeNull();
    await user.click(pillOf('Searching the legal acts'));
    expect(pillOf('Searching the legal acts')).toHaveAttribute('aria-expanded', 'true');
    const [request, result] = details('Searching the legal acts').querySelectorAll('pre');
    expect(within(details('Searching the legal acts')).getByText('Request')).toBeInTheDocument();
    expect(JSON.parse(request.textContent)).toEqual({ query: 'leidimas', k: 3 });
    expect(within(details('Searching the legal acts')).getByText('Result')).toBeInTheDocument();
    expect(JSON.parse(result.textContent)).toEqual(output);
    await user.click(pillOf('Searching the legal acts'));
    expect(details('Searching the legal acts')).toBeNull();
    expect(articles('Searching the legal acts')).toHaveLength(3);
  });


  it('an article\'s tooltip is the provision\'s heading', async () => {
    const { user } = await showReply([toolPart('searchLegalCorpus', { output: { hits: [hitOf(f.corpusHits[0])] } })]);
    await user.hover(within(reply()).getByRole('link', { name: 'Open the official text of “MiCA 59 str.” (new tab)' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Kriptoturto paslaugų teikėjų veiklos leidimas');
  });


  it('a hit without an address is plain text, not a link', async () => {
    await showReply([toolPart('searchLegalCorpus', { output: { hits: [{ ...hitOf(f.corpusHits[0]), citationUrl: null, heading: null }] } })]);
    expect(articles('Searching the legal acts')).toEqual(['MiCA 59 str.']);
    expect(within(reply()).queryByRole('link', { name: /Open the official text/ })).toBeNull();
  });


  it('no hits: "Nothing found in the legal corpus." inside the pill', async () => {
    await showReply([toolPart('searchLegalCorpus', { output: { hits: [], note: 'No provision matched.' } })]);
    expect(within(pill('Searching the legal acts')).getByText('Nothing found in the legal corpus.')).toBeInTheDocument();
    expect(articles('Searching the legal acts')).toEqual([]);
  });


  it('getLegalProvision: the provision with the version it quotes', async () => {
    await showReply(f.threadMessages(f.ID.doraThread)[1].content.parts.filter((part) => part.type.startsWith('tool-')));
    expect(articles('Legal provision')).toEqual(['DORA 19 str. 1 d. · version of 2025-01-17']);
    expect(within(pill('Legal provision')).getByRole('link', { name: 'Open the official text of “DORA 19 str. 1 d.” (new tab)' })).toBeInTheDocument();
  });


  it('checkCitations: every reference as it was claimed with a mark — a check for what stands, red with the error mark for what does not', async () => {
    await showReply([toolPart('checkCitations', { input: { citations: f.CITATION_CHECKS }, output: CLAIMED })]);
    const items = within(pill('Checking references to legal acts')).getAllByRole('listitem');
    // What the eye reads on a row is the citation alone; the words are sr-only
    const shown = (item) => [...item.querySelectorAll('a, span')].filter((el) => !el.classList.contains('sr-only') && el.children.length === 0)
      .map((el) => el.textContent).join('');
    expect(items.map(shown)).toEqual(['MiCA 59(1)', 'DORA 19', 'MiCA 999', 'GDPR 32', 'PPTFPĮ 22(3)']);
    const marks = items.map((item) => item.querySelector('svg').getAttribute('data-testid'));
    expect(marks).toEqual(['CheckCircleOutlineIcon', 'ErrorOutlineIcon', 'ErrorOutlineIcon', 'ErrorOutlineIcon', 'CheckCircleOutlineIcon']);
    expect(items.map((item) => item.querySelector('.text-red-700') !== null)).toEqual([false, true, true, true, false]);

    expect(within(items[0]).getByRole('link', { name: 'Open the official text of “MiCA 59 str. 1 d.” (new tab)' })).toHaveTextContent('MiCA 59(1)');
    expect(within(items[2]).queryByRole('link')).toBeNull();
    // A row without a link can still be reached, for its tooltip
    expect(items[2].querySelector('[tabindex="0"]')).not.toBeNull();
    expect(items[0].querySelector('[tabindex="0"]')).toBeNull();
  });


  it('a reference says the whole finding to a screen reader: the verdict, what was claimed, what the article is in fact', async () => {
    await showReply([toolPart('checkCitations', { input: { citations: f.CITATION_CHECKS }, output: CLAIMED })]);
    expect(articles('Checking references to legal acts')).toEqual([
      'MiCA 59(1)Reference confirmed. Claimed: Kriptoturto paslaugų teikėjų veiklos leidimas. Actually: Kriptoturto paslaugų teikėjų veiklos leidimas',
      'DORA 19The article governs a different matter. Claimed: IRT trečiųjų šalių rizikos valdymas. Actually: Pranešimas apie didelius su IRT susijusius incidentus',
      'MiCA 999The act contains no such provision',
      'GDPR 32The act is not in the corpus; the reference was not verified',
      expect.stringMatching(/^PPTFPĮ 22\(3\)The provision exists; its subject was not checked(\. Actually: .+)?$/),
    ]);
  });


  it('a reference\'s tooltip: the verdict as an underlined headline, then "Claimed: …" and "Actually: …" under underlined labels, the claim marked as failing or holding — as wide as its text', async () => {
    const { user } = await showReply([toolPart('checkCitations', { input: { citations: f.CITATION_CHECKS }, output: CLAIMED })]);
    await user.hover(within(pill('Checking references to legal acts')).getByText('DORA 19'));
    const tip = await screen.findByRole('tooltip');
    const lines = [...tip.querySelectorAll('span.block')];
    expect(lines.map((line) => line.textContent)).toEqual([
      'The article governs a different matter:',
      '❌ Claimed: IRT trečiųjų šalių rizikos valdymas',
      '✅ Actually: Pranešimas apie didelius su IRT susijusius incidentus',
    ]);
    expect(lines[0]).toHaveClass('font-semibold');
    // The colon is not part of the underlined headline
    expect(lines[0].querySelector('.underline')).toHaveTextContent(/^The article governs a different matter$/);
    expect(lines.slice(1).map((line) => line.querySelector('.underline').textContent)).toEqual(['Claimed', 'Actually']);
    // The marks are for the eye: a screen reader hears the words in the row
    expect(lines.slice(1).every((line) => line.querySelector('[aria-hidden]') !== null)).toBe(true);
    expect(lines[0].textContent[0]).toBe(lines[0].textContent[0].toUpperCase());
    expect(getComputedStyle(tip.querySelector('.MuiTooltip-tooltip')).maxWidth).not.toBe('300px');
    await user.unhover(within(pill('Checking references to legal acts')).getByText('DORA 19'));
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());

    // A claim that holds is marked as such
    await user.hover(within(pill('Checking references to legal acts')).getByText('MiCA 59(1)'));
    const held = await screen.findByRole('tooltip');
    expect([...held.querySelectorAll('span.block')].map((line) => line.textContent)).toEqual([
      'Reference confirmed:',
      '✅ Claimed: Kriptoturto paslaugų teikėjų veiklos leidimas',
      '✅ Actually: Kriptoturto paslaugų teikėjų veiklos leidimas',
    ]);
    await user.unhover(within(pill('Checking references to legal acts')).getByText('MiCA 59(1)'));
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());

    // Nothing was claimed and nothing was found: the headline alone
    await user.hover(within(pill('Checking references to legal acts')).getByText('MiCA 999'));
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(/^The act contains no such provision$/));
  });


  it('a reference with a point reads "Act 74(1) b"', async () => {
    const row = { act: 'MiCA', article: '74', paragraph: '1', point: 'b', status: 'not_found', headingMatch: 'unknown' };
    await showReply([toolPart('checkCitations', { output: { results: [row], counts: {} } })]);
    expect(articles('Checking references to legal acts')).toEqual(['MiCA 74(1) bThe act contains no such provision']);
    expect(within(pill('Checking references to legal acts')).getByText('The act contains no such provision')).toHaveClass('sr-only');
  });


  it('a check that looked at nothing says so', async () => {
    await showReply([toolPart('checkCitations', { output: { results: [], counts: {} } })]);
    expect(within(pill('Checking references to legal acts')).getByText('No reference was checked.')).toBeInTheDocument();
  });


  it('a search still running, or failed, is a pill', async () => {
    await showReply([toolPart('searchLegalCorpus', { state: 'output-error', errorText: '[CORPUS_EMPTY] searchLegalCorpus failed: empty' })]);
    expect(pillOf('Searching the legal acts')).toHaveTextContent('failedCORPUS_EMPTY');
  });


  it('speaks Lithuanian', async () => {
    await showReply([
      toolPart('searchLegalCorpus', { output: { hits: [hitOf(f.corpusHits[0])] } }),
      toolPart('checkCitations', { toolCallId: 'c2', output: CLAIMED }),
    ], { locale: 'lt' });
    expect(within(pill('Paieška teisės aktuose')).getAllByRole('link', { name: 'Atidaryti „MiCA 59 str.“ oficialų tekstą (nauja kortelė)' })).toHaveLength(1);
    expect(articles('Nuorodų į teisės aktus patikra').slice(0, 4)).toEqual([
      'MiCA 59(1)Nuoroda patvirtinta. Teigiama: Kriptoturto paslaugų teikėjų veiklos leidimas. Iš Tikrųjų: Kriptoturto paslaugų teikėjų veiklos leidimas',
      'DORA 19Straipsnis reglamentuoja kitą dalyką. Teigiama: IRT trečiųjų šalių rizikos valdymas. Iš Tikrųjų: Pranešimas apie didelius su IRT susijusius incidentus',
      'MiCA 999Tokios nuostatos teisės akte nėra',
      'GDPR 32Teisės akto nėra bazėje; nuoroda nepatikrinta',
    ]);
  });
});







// -----------------------------------------------------------
// EstimateToolCard
// -----------------------------------------------------------
//
// The cost of a run before the user says yes to it.
// -----------------------------------------------------------

describe('EstimateToolCard', () => {

  it('the upper-bound total, its parts, the acts and the budget: unlimited for the administrator', async () => {
    await showReply([toolPart('estimateAnalysisCost', { input: { companyId: f.ID.pavyzdys }, output: ESTIMATE })]);
    const card = reply();
    expect(within(card).getByText('Analysis cost estimate')).toBeInTheDocument();
    expect(within(card).getByText('Analysis cost: up to $5.88')).toBeInTheDocument();
    expect(within(card).getByText('analysis $2.43 + one-time processing of acts $3.46 · legal acts: 4')).toBeInTheDocument();
    expect(within(card).getByText('The AI budget is unlimited')).toBeInTheDocument();
    expect(within(card).queryByText(/Model prices are unknown/)).toBeNull();
  });


  it('a user with a budget sees what is left; unknown prices are said so', async () => {
    await showReply([toolPart('estimateAnalysisCost', { output: { ...ESTIMATE, pricesKnown: false, budget: { limit: 20, used: 7.5, remaining: 12.5, unit: 'USD' } } })]);
    expect(within(reply()).getByText('AI budget left: $12.50')).toBeInTheDocument();
    expect(within(reply()).getByText('Model prices are unknown — the estimate may be off.')).toBeInTheDocument();
  });


  it('without a total it is a pill', async () => {
    await showReply([toolPart('estimateAnalysisCost', { output: { ...ESTIMATE, totalUsd: null } })]);
    expect(pillOf('Analysis cost estimate')).toHaveTextContent('Analysis cost estimate·done');
    expect(within(reply()).queryByText(/Analysis cost: up to/)).toBeNull();
  });


  it('speaks Lithuanian, with Lithuanian amounts', async () => {
    await showReply([toolPart('estimateAnalysisCost', { output: { ...ESTIMATE, acts: 4, budget: { remaining: 12.5 } } })], { locale: 'lt' });
    expect(within(reply()).getByText('Analizės kaina: iki 5,88 USD')).toBeInTheDocument();
    expect(within(reply()).getByText('analizė 2,43 USD + vienkartinis teisės aktų apdorojimas 3,46 USD · teisės aktai: 4')).toBeInTheDocument();
    expect(within(reply()).getByText('Liko DI biudžeto: 12,50 USD')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// ProductToolCard
// -----------------------------------------------------------
//
// startWorkProduct and getWorkProduct: the work products of
// a company's compliance programme as a card. productOf: a product as the tools name it; listRow:
// a row of the list a tool answers.
// -----------------------------------------------------------

describe('ProductToolCard', () => {

  const productOf = (id) => {
    const row = p.product(id);
    return { id: row.id, kind: row.kind, title: row.title, version: row.version, status: row.status };
  };

  const listRow = (id, extra = {}) => {
    const row = p.product(id);
    const broken = row.checks.filter((check) => !check.ok && check.blocking).length;
    const notes = row.checks.filter((check) => !check.ok && !check.blocking).length;
    return { ...productOf(id), approvedByName: row.approvedByName, approvedAt: row.approvedAt, brokenRules: broken, notes, url: `/programme/${row.id}`, ...extra };
  };

  const POLICY_TITLE = p.product(f.ID.productPolicy).title;
  const RISKS_TITLE = p.product(f.ID.productRisksRunning).title;


  it('a started generation: the tool, the title, the version, the status and the link to the product — in a new tab', async () => {
    const started = { started: true, product: { ...productOf(f.ID.productRisksRunning), status: 'queued' }, takesMinutes: 5, next: 'Tell the user it runs in the background.', url: `/programme/${f.ID.productRisksRunning}` };
    await showReply([toolPart('startWorkProduct', { input: { companyId: f.ID.pavyzdys, kind: 'risks' }, output: started })]);
    const card = reply();
    expect(within(card).getByText('Generating a programme document')).toBeInTheDocument();
    expect(within(card).getByText(RISKS_TITLE)).toBeInTheDocument();
    expect(within(card).getByText('Version 2')).toBeInTheDocument();
    const link = within(card).getByRole('link', { name: `Open the document “${RISKS_TITLE}”` });
    expect(link).toHaveTextContent('Open the document');
    expect(link).toHaveAttribute('href', `/programme/${f.ID.productRisksRunning}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(within(card).queryByText('startWorkProduct')).toBeNull();
  });


  it('follows a generation live: GET /api/programme/:id, its status, its bar and the step it is on', async () => {
    const polls = given.spy('get', '/api/programme/:productId');
    const started = { started: true, product: { ...productOf(f.ID.productRisksRunning), status: 'queued' }, url: `/programme/${f.ID.productRisksRunning}` };
    await showReply([toolPart('startWorkProduct', { output: started })]);
    await waitFor(() => expect(polls).toHaveLength(1));
    expect(polls[0].url).toBe(`http://localhost:3000/api/programme/${f.ID.productRisksRunning}`);
    expect(await within(reply()).findByText('Generating', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(reply()).getByRole('progressbar', { name: 'Generating' })).toHaveAttribute('aria-valuenow', '50');
    expect(within(reply()).getByText('Writing the scenarios')).toBeInTheDocument();
  });


  it('when the generation ends, the card shows the draft and what it breaks', async () => {
    const draft = p.product(f.ID.productPolicy);
    given.json('get', '/api/programme/:productId', { ...draft, id: f.ID.productRisksRunning });
    await showReply([toolPart('startWorkProduct', { output: { started: true, product: { ...productOf(f.ID.productRisksRunning), status: 'running' }, url: `/programme/${f.ID.productRisksRunning}` } })]);
    expect(await within(reply()).findByText('Draft', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(reply()).queryByRole('progressbar')).toBeNull();
    // Read live, the product carries its checks: the card counts and names what they break
    expect(within(reply()).getByText('Blocking rules broken: 1')).toBeInTheDocument();
    expect(within(reply()).getByText('The articles named are in their acts')).toBeInTheDocument();
  });


  it('a finished product is not polled: one product with the rules it breaks and its notes', async () => {
    const polls = given.spy('get', '/api/programme/:productId');
    const row = p.product(f.ID.productPolicy);
    const one = {
      ...productOf(f.ID.productPolicy), language: 'lt', approved: null, url: `/programme/${row.id}`, exports: ['pdf', 'docx'],
      rules: { broken: [{ rule: 'provisions', detail: 'Lietuvos Respublikos darbo kodeksas 58' }], notes: [{ rule: 'quotes', detail: '02-backup.md' }, { rule: 'hierarchy', detail: '' }] },
      builtOn: {}, title: row.title,
    };
    await showReply([toolPart('getWorkProduct', { input: { productId: row.id }, output: one })]);
    const card = reply();
    expect(within(card).getByText('Compliance programme document')).toBeInTheDocument();
    expect(within(card).getByText(POLICY_TITLE)).toBeInTheDocument();
    expect(within(card).getByText('Draft', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(card).getByText('Version 2')).toBeInTheDocument();
    expect(within(card).getByText('Blocking rules broken: 1')).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['The articles named are in their acts']);
    expect(within(card).getByText('Notes for the reviewer: 2')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: `Open the document “${POLICY_TITLE}”` })).toHaveAttribute('href', `/programme/${row.id}`);
    await settle(100);
    expect(polls).toHaveLength(0);
  });


  it('a refused start says why in plain words; one that found the product already running shows it, with the way to it', async () => {
    await showReply([
      toolPart('startWorkProduct', { output: { started: false, refused: 'NO_DOCUMENTS', reason: 'The company has no readable documents — upload them first', next: 'Ask the user to upload documents.' } }),
      toolPart('startWorkProduct', {
        toolCallId: 'c2',
        output: { started: false, refused: 'ALREADY_RUNNING', reason: 'This product is already being generated', alreadyRunning: true, product: productOf(f.ID.productRisksRunning), url: `/programme/${f.ID.productRisksRunning}` },
      }),
      toolPart('startWorkProduct', { toolCallId: 'c3', output: { started: false, refused: 'BUDGET_EXCEEDED', reason: 'x' } }),
      toolPart('startWorkProduct', { toolCallId: 'c4', output: { started: false, refused: 'SOMETHING_NEW', reason: 'Brand new refusal', product: null } }),
      toolPart('startWorkProduct', { toolCallId: 'c5', output: { started: false, code: 'NO_DOCUMENTS', message: 'older shape' } }),
    ]);
    const card = reply();
    expect(within(card).getAllByText('The company has no readable documents — upload them first.')).toHaveLength(2);
    expect(within(card).getByText('This document is already being generated.')).toBeInTheDocument();
    expect(within(card).getByText('Today\'s AI usage budget is spent. Try again tomorrow.')).toBeInTheDocument();
    expect(within(card).getByText('The generation could not be started.')).toBeInTheDocument();
    expect(within(card).queryByText('Brand new refusal')).toBeNull();
    // Only the refusal that names a product links to one
    expect(within(card).getAllByRole('link', { name: /^Open the document/ })).toHaveLength(1);
    expect(within(card).getByRole('link', { name: `Open the document “${RISKS_TITLE}”` })).toHaveAttribute('href', `/programme/${f.ID.productRisksRunning}`);
  });


  it('a list: every kind with its status — a kind not generated yet has no version and no link — and no poll', async () => {
    const polls = given.spy('get', '/api/programme/:productId');
    const list = {
      products: [
        listRow(f.ID.productPolicy),
        listRow(f.ID.productPolicyApproved, { url: undefined }),
        listRow(f.ID.productRisksRunning, { progress: { step: 'scenarios', percent: 50, message: null } }),
        { kind: 'governance', title: 'Structure, compliance process and RACI', status: 'none' },
      ],
      olderVersions: 1,
    };
    await showReply([toolPart('getWorkProduct', { input: { companyId: f.ID.pavyzdys }, output: list })]);
    const card = reply();
    expect(within(card).getAllByText(POLICY_TITLE)).toHaveLength(2);
    expect(within(card).getByText('Blocking rules broken: 1')).toBeInTheDocument();
    expect(within(card).getByText('Approved', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(card).getByText('Generating', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(card).getByText('Writing the scenarios')).toBeInTheDocument();
    expect(within(card).getByText('Structure, compliance process and RACI')).toBeInTheDocument();
    expect(within(card).getByText('Not generated yet', { selector: '.MuiChip-label' })).toBeInTheDocument();
    // Three products can be opened — the approved one by its id, without a url of its own
    const links = within(card).getAllByRole('link', { name: /^Open the document/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/programme/${f.ID.productPolicy}`, `/programme/${f.ID.productPolicyApproved}`, `/programme/${f.ID.productRisksRunning}`,
    ]);
    await settle(100);
    expect(polls).toHaveLength(0);
  });


  it('an empty list says there are no documents yet', async () => {
    await showReply([toolPart('getWorkProduct', { output: { products: [] } })]);
    expect(within(reply()).getByText('Compliance programme document')).toBeInTheDocument();
    expect(within(reply()).getByText('There are no programme documents yet.')).toBeInTheDocument();
  });


  it('a product without a title is named by its kind; a call still running, failed or answering no product is a pill', async () => {
    await showReply([
      toolPart('getWorkProduct', { output: { id: f.ID.productGovernance, kind: 'governance', status: 'draft' } }),
      toolPart('getWorkProduct', { toolCallId: 'c2', state: 'output-error', errorText: '[NOT_FOUND] getWorkProduct failed: Product not found' }),
      toolPart('startWorkProduct', { toolCallId: 'c3', output: { ok: true } }),
    ]);
    expect(within(reply()).getByText('Structure, compliance process and RACI')).toBeInTheDocument();
    expect(within(reply()).getByRole('link', { name: 'Open the document “Structure, compliance process and RACI”' })).toHaveAttribute('href', `/programme/${f.ID.productGovernance}`);
    expect(pillOf('Compliance programme document')).toHaveTextContent('Compliance programme document·failedNOT_FOUND');
    expect(pillOf('Generating a programme document')).toHaveTextContent('Generating a programme document·done');
  });


  it('speaks Lithuanian', async () => {
    const list = { products: [listRow(f.ID.productPolicy), { kind: 'governance', title: 'Valdymo struktūra, atitikties procesas ir RACI', status: 'none' }] };
    await showReply([
      toolPart('getWorkProduct', { output: list }),
      toolPart('startWorkProduct', { toolCallId: 'c2', output: { started: false, refused: 'NO_DOCUMENTS', reason: 'x' } }),
    ], { locale: 'lt' });
    const card = reply();
    expect(within(card).getByText('Atitikties programos dokumentas')).toBeInTheDocument();
    expect(within(card).getByText('Programos dokumento generavimas')).toBeInTheDocument();
    expect(within(card).getByText('Projektas', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(card).getByText('2 versija')).toBeInTheDocument();
    expect(within(card).getByText('Pažeistos privalomos taisyklės: 1')).toBeInTheDocument();
    expect(within(card).getByText('Dar neparengta', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: `Atidaryti dokumentą „${POLICY_TITLE}“` })).toHaveTextContent('Atidaryti dokumentą');
    expect(within(card).getByText('Įmonė neturi perskaitomų dokumentų — pirmiausia juos įkelkite.')).toBeInTheDocument();
  });


  it('answers of the wrong shape do not break the page', async () => {
    await showReply([
      toolPart('getWorkProduct', { output: { products: 'none' } }),
      toolPart('getWorkProduct', { toolCallId: 'c2', output: { products: [null, 'x', { status: 42, version: {}, rules: 'no', brokenRules: 'many', url: 17 }] } }),
      toolPart('startWorkProduct', { toolCallId: 'c3', output: { started: true, product: 'soon' } }),
      toolPart('startWorkProduct', { toolCallId: 'c4', output: 'plain text' }),
      toolPart('getWorkProduct', { toolCallId: 'c5', output: { id: 5, kind: 'brand_new_kind', status: 'weird', title: '' } }),
    ]);
    expectNoCrash();
    expect(screen.getByText(DONE_TEXT)).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// ActionsToolCard
// -----------------------------------------------------------
//
// getActionRegister: the company's action register as the
// assistant's tool answers it (assistant/app/llm/tools/
// actions.js) — the counts under inProgress, the first
// actions, the Actions tab's address — built from the
// fixture register.
// -----------------------------------------------------------

describe('ActionsToolCard', () => {

  const REGISTER = f.companyActions(f.ID.pavyzdys);

  const registerOf = (extra = {}) => ({
    counts: { late: REGISTER.counts.late, open: REGISTER.counts.open, inProgress: REGISTER.counts.in_progress, done: REGISTER.counts.done, closed: REGISTER.counts.closed },
    actions: REGISTER.actions.filter((row) => row.state !== 'closed')
      .map((row) => ({ id: row.id, title: row.title, state: row.state, owner: row.owner, due: row.dueDate, priority: row.priority, closes: [], moreItems: 0, fromReport: row.reportDate })),
    moreActions: 0,
    url: `/companies/${f.ID.pavyzdys}?tab=actions`,
    next: 'nothing here is changed from the chat',
    ...extra,
  });


  it('tells the register in words — the counts by state, the late first — and links to the company\'s Actions tab, in both languages; odd answers break nothing', async () => {
    const view = await showReply([
      toolPart('getActionRegister', { input: { companyId: f.ID.pavyzdys }, output: registerOf() }),
      // An answer without an address: the company the call asked about; without counts: the pill's words alone
      toolPart('getActionRegister', { toolCallId: 'c2', input: { companyId: f.ID.kreditas }, output: { counts: { late: 0, open: 0, inProgress: 0, done: 0, closed: 0 }, actions: [], moreActions: 0 } }),
      toolPart('getActionRegister', { toolCallId: 'c3', output: { counts: 'none', actions: [null, 'x'], url: 17 } }),
      toolPart('getActionRegister', { toolCallId: 'c4', output: { counts: { late: 'many', open: null, inProgress: 2 }, url: 'https://elsewhere.example/x' } }),
      toolPart('getActionRegister', { toolCallId: 'c5', output: 'plain text' }),
      toolPart('getActionRegister', { toolCallId: 'c6', state: 'output-error', errorText: '[NOT_FOUND] getActionRegister failed: Company not found' }),
    ]);
    expectNoCrash();
    const card = reply();
    expect(within(card).getAllByText('Action register').length).toBeGreaterThanOrEqual(4);
    expect(within(card).queryByText('getActionRegister')).toBeNull();
    const chips = [...card.querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent);
    expect(chips.slice(0, 5)).toEqual(['Late: 1', 'Open: 3', 'In progress: 1', 'Done, awaiting re-test: 1', 'Closed: 2']);
    expect(within(card).getByText('Late: 1').closest('.MuiChip-root')).toHaveClass('MuiChip-colorWarning');
    // The fourth answer counts what it can: a number, nothing else
    expect(chips.slice(5)).toEqual(['In progress: 2']);
    expect(within(card).getAllByText('The register is empty.')).toHaveLength(2);
    const links = within(card).getAllByRole('link', { name: 'Open the action register' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/companies/${f.ID.pavyzdys}?tab=actions`, `/companies/${f.ID.kreditas}?tab=actions`]);
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener');
    // A failed call and an answer that is no register are pills
    const pills = within(card).getAllByRole('button', { name: /^Action register/ });
    expect(pills.map((pill) => pill.textContent)).toEqual(['Action register·done', 'Action register·failedNOT_FOUND']);

    view.unmount();
    await showReply([toolPart('getActionRegister', { input: { companyId: f.ID.pavyzdys }, output: registerOf() })], { locale: 'lt' });
    expect(within(reply()).getByText('Veiksmų registras')).toBeInTheDocument();
    expect([...reply().querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent))
      .toEqual(['Vėluojantis: 1', 'Atviras: 3', 'Vykdomas: 1', 'Įvykdytas, laukia patikros: 1', 'Uždarytas: 2']);
    expect(within(reply()).getByRole('link', { name: 'Atidaryti veiksmų registrą' })).toHaveAttribute('href', `/companies/${f.ID.pavyzdys}?tab=actions`);
  });
});







// -----------------------------------------------------------
// The reply around the cards
// -----------------------------------------------------------
//
// Cards sit where the model called the tools; the text is
// markdown through the shared safe renderer.
// -----------------------------------------------------------

describe('the reply around the cards', () => {

  it('keeps the parts in the order the model produced them', async () => {
    given.json('get', '/api/chat/threads/:threadId/messages', [
      userRow('msg-u-1', 'Klausimas'),
      assistantRow('srv-1', [
        { type: 'step-start' }, { type: 'text', state: 'done', text: 'Pirmiausia ieškau.' },
        toolPart('searchLegalCorpus', { output: { hits: [hitOf(f.corpusHits[0])] } }),
        { type: 'step-start' }, { type: 'text', state: 'done', text: DONE_TEXT },
      ], 'msg-u-1'),
    ]);
    renderChat({ route: `/chat/${f.ID.licenceThread}` });
    await screen.findByText(DONE_TEXT);
    expect(reply().textContent).toMatch(/Pirmiausia ieškau\..*Searching the legal acts.*MiCA 59 str\..*Tai viskas\./);
  });


  it('renders the reply\'s markdown — headings, lists, tables, emphasis, code — and keeps only safe links, opening in a new tab', async () => {
    const markdown = [
      '## Išvada', '', '**Reikia** leidimo; *tikrintina*.', '',
      '- MiCA 59 str.', '- DORA 19 str.', '',
      '| Aktas | Straipsnis |', '|---|---|', '| MiCA | 59 |', '',
      '`kodas`', '',
      '[EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1114/oj) [blogas](javascript:alert(1)) ![paveikslas](https://example.com/x.png)',
    ].join('\n');
    await showReply([{ type: 'text', state: 'done', text: markdown }]);
    const card = reply();
    // The reply's top heading lands right under the
    // conversation's h1 (Messages.jsx headingOffset 1; Markdown
    // re-bases on the text's top level, here "##")
    expect(within(card).getByRole('heading', { level: 2, name: 'Išvada' })).toBeInTheDocument();
    expect(within(card).getByText('Reikia').tagName).toBe('STRONG');
    expect(within(card).getByText('tikrintina').tagName).toBe('EM');
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['MiCA 59 str.', 'DORA 19 str.']);
    expect(within(card).getByRole('table')).toBeInTheDocument();
    expect(within(card).getByRole('columnheader', { name: 'Straipsnis' })).toBeInTheDocument();
    expect(within(card).getByText('kodas').tagName).toBe('CODE');
    const safe = within(card).getByRole('link', { name: 'EUR-Lex' });
    expect(safe).toHaveAttribute('href', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj');
    expect(safe).toHaveAttribute('target', '_blank');
    expect(safe).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    // A javascript: link is text; an image is a link, never loaded
    expect(within(card).queryByRole('link', { name: 'blogas' })).toBeNull();
    expect(within(card).getByText('blogas')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).getByRole('link', { name: 'paveikslas' })).toHaveAttribute('href', 'https://example.com/x.png');
  });


  it('markup in a reply is text, never elements', async () => {
    await showReply([{ type: 'text', state: 'done', text: 'Pavojinga: <script>alert(1)</script> <img src=x onerror=alert(2)>' }]);
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expectNoCrash();
  });


  it('outputs of the wrong shape do not break the page — a malformed stored output used to crash the whole chat', async () => {
    await showReply([
      toolPart('searchLegalCorpus', { output: { hits: 'none' } }),
      toolPart('checkCitations', { toolCallId: 'c2', output: { results: 'none' } }),
      toolPart('getReport', { toolCallId: 'c3', output: { report: { id: 'r1', status: 'weird' }, counts: 'x' } }),
      toolPart('estimateAnalysisCost', { toolCallId: 'c4', output: { totalUsd: 'abc', budget: 'x' } }),
      toolPart('getLegalProvision', { toolCallId: 'c5', output: 'plain text' }),
      toolPart('getCompany', { toolCallId: 'c6', output: null }),
    ]);
    expectNoCrash();
    expect(screen.getByText(DONE_TEXT)).toBeInTheDocument();
    expect(within(reply()).getByText('Searching the legal acts')).toBeInTheDocument();
    expect(within(reply()).getAllByText('Nothing found in the legal corpus.')).toHaveLength(2);
  });
});
