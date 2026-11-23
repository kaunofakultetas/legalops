// -----------------------------------------------------------
//  [*] Tests — the documents tab hands its uploads to the
//      assistant (useDocumentIntake)
//
//  /companies/:companyId?tab=documents against the backend
//  double: when an upload batch is through, the tab opens a
//  conversation of the company (POST /api/chat/threads
//  {companyId}) and sends one turn in the user's name (POST
//  /api/assistant/chat — the slim body, the sentence that
//  says documents were uploaded, one data-document part per
//  document that has text, the bearer). The notice under the
//  drop zone: reading (with the link to the conversation, no
//  close button), done when the stream has ended (the company
//  fetched again, closable), not finished with the chat's own
//  sentence when the turn was refused (the empty conversation
//  archived, no link) or its stream carried an error (the
//  link stays). A batch without readable text starts nothing;
//  a batch uploaded while the assistant reads waits for a
//  conversation of its own; more documents than one message
//  carries go in two turns; a conversation that cannot be
//  opened; Lithuanian; and streamFailure on its own.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import { signIn } from '../support/auth';
import { given, apiError } from '../support/backend/server';
import { errorChunk, errorEnvelope, givenChatRefusal, givenChatStream, openChatStream, textReply } from '../support/chat';
import * as f from '../support/backend/fixtures';
import CompanyDetail from '@/pages/Companies/CompanyDetail';
import { streamFailure } from '@/pages/Companies/useDocumentIntake';


const THREAD = { ...f.NEW.thread, companyId: f.ID.pavyzdys, companyName: 'UAB Pavyzdys' };
const SECOND_THREAD = { ...THREAD, id: 'ca000000-0000-4000-8000-0000000000fe' };
const POLICY = { ...f.NEW.document, id: 'c3000000-0000-4000-8000-0000000000a1', companyId: f.ID.pavyzdys, title: 'politika.pdf', kind: 'policy', charCount: 4100 };
const PROCEDURE = { ...f.NEW.document, id: 'c3000000-0000-4000-8000-0000000000a2', companyId: f.ID.pavyzdys, title: 'tvarka.pdf', kind: 'policy', charCount: 900 };
const SCAN = { ...f.NEW.document, id: 'c3000000-0000-4000-8000-0000000000a3', companyId: f.ID.pavyzdys, title: 'skenuota.pdf', kind: 'policy', charCount: 0, extractionStatus: 'empty' };

const SENTENCE = "New documents were uploaded on the company's Documents tab. Read them and bring the company's records up to date.";
const READING = /^The assistant is reading the uploaded documents \((\d+)\) and filling in the company's records from them: the profile, the documents' kinds, licences, standards and roles\. It takes a few minutes; you can leave this page\./;
const DONE = /^The assistant has read the uploaded documents and updated the company's records\. What it filed and what it still asks is in the conversation\./;
const NOT_FINISHED = 'The assistant did not finish reading the uploaded documents.';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderDocuments: the company page on ?tab=documents.
//
// uploading: the documents the next uploads are answered
// with, one a request; upload: files through the hidden
// input, one per document named.
//
// part: the data-document part the tab sends for a document.
//
// notice: the tab's notice by the opening of its sentence.
// -----------------------------------------------------------

async function renderDocuments({ locale = 'en' } = {}) {
  const view = renderPage(<CompanyDetail authData={authData} />, { route: `/companies/${f.ID.pavyzdys}?tab=documents`, path: '/companies/:companyId', locale });
  await screen.findByRole('heading', { level: 1, name: 'UAB Pavyzdys' });
  return view;
}

const panel = () => screen.getByRole('tabpanel');

const fileInput = () => document.querySelector('input[type="file"]');

const pdf = (name) => new File([new Uint8Array(64)], name, { type: 'application/pdf' });

const uploading = (...documents) => given.sequence('post', '/api/documents', documents.map((body) => ({ status: 201, body })));

const upload = (user, ...documents) => user.upload(fileInput(), documents.map((row) => pdf(row.title)));

const part = (row) => ({
  type: 'data-document',
  data: { id: row.id, title: row.title, kind: row.kind, charCount: row.charCount, extractionStatus: row.extractionStatus },
});

const notice = (opening) => within(panel()).findByText(opening).then((node) => node.closest('[role="status"]'));







describe('the documents tab — an uploaded batch goes to the assistant', () => {

  it('opens a conversation of the company and sends one turn with the documents that have text', async () => {
    signIn('test-token');
    const threads = given.capture('post', '/api/chat/threads', THREAD, { status: 201 });
    const turn = openChatStream();
    uploading(POLICY, PROCEDURE, SCAN);
    const { user } = await renderDocuments();
    await upload(user, POLICY, PROCEDURE, SCAN);
    await turn.requested();

    expect(threads).toHaveLength(1);
    expect(threads[0].body).toEqual({ companyId: f.ID.pavyzdys });
    const { body, headers } = turn.requests[0];
    expect(body).toMatchObject({ id: THREAD.id, trigger: 'submit-message', parentId: null, locale: 'en' });
    expect(body.message.role).toBe('user');
    expect(body.message.id).toMatch(/^intake-[0-9a-f-]{36}$/);
    // The scan has no text to read: it is not handed over
    expect(body.message.parts).toEqual([{ type: 'text', text: SENTENCE }, part(POLICY), part(PROCEDURE)]);
    expect(headers.authorization).toBe('Bearer test-token');
    await turn.end();
  });


  it('says that the assistant is reading, with the way into the conversation, and then that it has read', async () => {
    given.json('post', '/api/chat/threads', THREAD, { status: 201 });
    const turn = openChatStream();
    uploading(POLICY, PROCEDURE);
    const { user } = await renderDocuments();
    await upload(user, POLICY, PROCEDURE);
    await turn.requested();

    const reading = await notice(READING);
    expect(reading).toHaveTextContent('(2)');
    expect(within(reading).getByRole('link', { name: 'Open the conversation' })).toHaveAttribute('href', `/chat/${THREAD.id}`);
    expect(within(reading).getByRole('progressbar', { name: 'The assistant is reading the documents' })).toBeInTheDocument();
    // A turn that still runs cannot be waved away
    expect(within(reading).queryByRole('button', { name: 'Close the message' })).toBeNull();

    // What the assistant filed is fetched when its turn ends
    const fetched = given.spy('get', '/api/companies/:companyId');
    await turn.write(...textReply('Įrašiau profilį ir tris roles.'));
    await turn.end();
    const done = await notice(DONE);
    expect(within(done).getByRole('link', { name: 'Open the conversation' })).toHaveAttribute('href', `/chat/${THREAD.id}`);
    expect(within(panel()).queryByText(READING)).toBeNull();
    await waitFor(() => expect(fetched.length).toBeGreaterThan(0));

    await user.click(within(done).getByRole('button', { name: 'Close the message' }));
    expect(within(panel()).queryByText(DONE)).toBeNull();
  });


  it('a batch with no readable text starts nothing', async () => {
    const threads = given.capture('post', '/api/chat/threads', THREAD, { status: 201 });
    const turns = givenChatStream(textReply('Atlikta.'));
    uploading(SCAN);
    const { user } = await renderDocuments();
    await upload(user, SCAN);
    await screen.findByText('Uploaded: skenuota.pdf');
    await waitFor(() => expect(within(panel()).getByRole('button', { name: 'Choose a file' })).toBeEnabled());
    expect(threads).toHaveLength(0);
    expect(turns).toHaveLength(0);
    expect(within(panel()).queryByText(READING)).toBeNull();
  });


  it('a batch whose every upload failed starts nothing either', async () => {
    const threads = given.capture('post', '/api/chat/threads', THREAD, { status: 201 });
    given.json('post', '/api/documents', apiError('QUOTA_EXCEEDED', 'Your document storage quota is used up'), { status: 413 });
    const { user } = await renderDocuments();
    await upload(user, POLICY);
    expect(await within(panel()).findByRole('alert')).toBeInTheDocument();
    expect(threads).toHaveLength(0);
  });
});







describe('the documents tab — a turn that did not go through', () => {

  it('a turn refused for the budget: the chat\'s sentence, the empty conversation put away, no link', async () => {
    given.json('post', '/api/chat/threads', THREAD, { status: 201 });
    const archived = given.capture('delete', '/api/chat/threads/:threadId', { ok: true });
    givenChatRefusal(429, 'BUDGET_EXCEEDED');
    uploading(POLICY);
    const { user } = await renderDocuments();
    await upload(user, POLICY);

    const failed = await notice(new RegExp(`^${NOT_FINISHED}`));
    expect(failed).toHaveTextContent(`${NOT_FINISHED} Your AI usage limit for today is spent. Try again tomorrow.`);
    expect(within(failed).queryByRole('link')).toBeNull();
    await waitFor(() => expect(archived).toHaveLength(1));
    expect(archived[0].url).toContain(`/api/chat/threads/${THREAD.id}`);
    await user.click(within(failed).getByRole('button', { name: 'Close the message' }));
    expect(within(panel()).queryByText(new RegExp(`^${NOT_FINISHED}`))).toBeNull();
  });


  it('an error inside the stream: the chat\'s sentence, and the conversation stays — it holds what was done', async () => {
    given.json('post', '/api/chat/threads', THREAD, { status: 201 });
    const archived = given.capture('delete', '/api/chat/threads/:threadId', { ok: true });
    givenChatStream([{ type: 'start', messageId: 'srv-1' }, { type: 'start-step' }, errorChunk('MODEL_TIMEOUT')]);
    uploading(POLICY);
    const { user } = await renderDocuments();
    await upload(user, POLICY);

    const failed = await notice(new RegExp(`^${NOT_FINISHED}`));
    expect(failed).toHaveTextContent(`${NOT_FINISHED} The answer took too long and was cut off.`);
    expect(within(failed).getByRole('link', { name: 'Open the conversation' })).toHaveAttribute('href', `/chat/${THREAD.id}`);
    expect(archived).toHaveLength(0);
  });


  it('a conversation that cannot be opened: said so, and no turn is sent', async () => {
    given.json('post', '/api/chat/threads', apiError('SERVER_ERROR', 'Internal server error'), { status: 500 });
    const turns = givenChatStream(textReply('Atlikta.'));
    uploading(POLICY);
    const { user } = await renderDocuments();
    await upload(user, POLICY);
    const failed = await notice(new RegExp(`^${NOT_FINISHED}`));
    expect(failed).toHaveTextContent(`${NOT_FINISHED} Server error. Try again later.`);
    expect(within(failed).queryByRole('link')).toBeNull();
    expect(turns).toHaveLength(0);
  });
});







describe('the documents tab — documents wait their turn', () => {

  it('what is uploaded while the assistant reads goes into a conversation of its own, afterwards', async () => {
    const threads = [];
    given.sequence('post', '/api/chat/threads', [{ status: 201, body: THREAD }, { status: 201, body: SECOND_THREAD }]);
    const opened = given.spy('post', '/api/chat/threads');
    const turn = openChatStream();
    uploading(POLICY, PROCEDURE);
    const { user } = await renderDocuments();
    await upload(user, POLICY);
    await turn.requested();
    threads.push(opened.length);

    // The drop zone is free again: the next file goes up while the first turn runs
    await waitFor(() => expect(within(panel()).getByRole('button', { name: 'Choose a file' })).toBeEnabled());
    await upload(user, PROCEDURE);
    await screen.findByText('Uploaded: tvarka.pdf');
    expect(opened).toHaveLength(1);
    expect(turn.requests).toHaveLength(1);

    await turn.end();
    await turn.requested(2);
    expect(opened).toHaveLength(2);
    expect(turn.requests[1].body.id).toBe(SECOND_THREAD.id);
    expect(turn.requests[1].body.message.parts).toEqual([{ type: 'text', text: SENTENCE }, part(PROCEDURE)]);
    const reading = await notice(READING);
    expect(within(reading).getByRole('link', { name: 'Open the conversation' })).toHaveAttribute('href', `/chat/${SECOND_THREAD.id}`);
    await turn.end();
    expect(await notice(DONE)).toBeInTheDocument();
  });


  it('more documents than a message carries go in two turns', async () => {
    given.json('post', '/api/chat/threads', THREAD, { status: 201 });
    const turns = givenChatStream(() => textReply('Atlikta.'));
    given.json('post', '/api/documents', POLICY, { status: 201 });
    const { user } = await renderDocuments();
    await user.upload(fileInput(), Array.from({ length: 30 }, (_, index) => pdf(`dokumentas-${index + 1}.pdf`)));
    await waitFor(() => expect(turns).toHaveLength(2), { timeout: 15_000 });
    expect(turns.map((sent) => sent.body.message.parts.length)).toEqual([30, 2]);
    expect(await notice(DONE)).toBeInTheDocument();
  }, 30_000);
});







describe('the documents tab — the hand-over in Lithuanian', () => {

  it('the sentence and the notices follow the interface language', async () => {
    given.json('post', '/api/chat/threads', THREAD, { status: 201 });
    const turn = openChatStream();
    uploading(POLICY);
    const { user } = await renderDocuments({ locale: 'lt' });
    await upload(user, POLICY);
    await turn.requested();
    expect(turn.requests[0].body.locale).toBe('lt');
    expect(turn.requests[0].body.message.parts[0].text)
      .toBe('Įmonės dokumentų skiltyje įkelti nauji dokumentai. Perskaityk juos ir sutvarkyk įmonės duomenis.');
    const reading = await notice(/^Asistentas skaito įkeltus dokumentus \(1\) ir pagal juos pildo įmonės duomenis/);
    expect(within(reading).getByRole('link', { name: 'Atidaryti pokalbį' })).toBeInTheDocument();
    await turn.write(errorChunk('MODEL_UNAVAILABLE'));
    await turn.end();
    expect(await notice(/^Asistentas įkeltų dokumentų iki galo neperskaitė\./))
      .toHaveTextContent('DI modelis šiuo metu nepasiekiamas. Bandykite po kelių minučių.');
  });
});







describe('streamFailure — what a turn\'s stream says went wrong', () => {

  const lines = (...chunks) => chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';

  it('nothing for a turn that ended as it should', () => {
    expect(streamFailure(lines(...textReply('Atlikta.')))).toBeNull();
    expect(streamFailure('')).toBeNull();
    expect(streamFailure(undefined)).toBeNull();
    expect(streamFailure('data: not json\n\n: a comment\n\n')).toBeNull();
  });

  it('the error chunk\'s envelope, as the chat reads it', () => {
    const failure = streamFailure(lines({ type: 'start', messageId: 'srv-1' }, errorChunk('MODEL_TIMEOUT')));
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe(errorEnvelope('MODEL_TIMEOUT'));
  });

  it('a turn that was stopped or superseded did not finish either', () => {
    const failure = streamFailure(lines({ type: 'start', messageId: 'srv-1' }, { type: 'abort' }));
    expect(JSON.parse(failure.message)).toEqual({ error: { code: 'STREAM_FAILED' } });
  });
});
