// -----------------------------------------------------------
//  [*] Tests — ReportApproval (the reviewer's sign-off)
//
//  The sign-off of a finished report on the report page,
//  against the backend double: the approved banner (a
//  status, not an alarm — who, when, the note) and the
//  header's "Approved" chip; withdrawing (confirmed, PATCH
//  {approved: false}); approving (the dialog with its
//  optional note, PATCH {approved: true, note}, the banner
//  that follows); refusals inside the dialogs, without a
//  toast; the approver's name — the report's own
//  approvedByName, else the caller's own name, else (for an
//  administrator only) the user directory, else the date
//  alone — for the administrator and a plain user, who may
//  both sign off (the backend checks visibility, not the
//  role); what a sign-off does to the company's action
//  register — the line in the dialog, the answer's `register`
//  told in words in the toast with the way to the register
//  (only the parts that are not zero; "did not change" when
//  all are; nothing for an answer without it), the register
//  read again, and a withdrawal saying how many actions it
//  changed; and Lithuanian.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderPage, authData, userAuthData } from '../support/render';
import { given } from '../support/backend/server';
import { settle } from '../support/backend/contract';
import * as f from '../support/backend/fixtures';
import ReportDetail from '@/pages/Reports/ReportDetail';


const DONE = f.report(f.ID.reportDone);

// The finished report before anybody signed it off
const UNAPPROVED = { ...DONE, approvedBy: null, approvedByName: null, approvedAt: null, approvalNote: '' };

// An older report: the approver's id without the name
const nameless = (approvedBy) => ({ ...DONE, approvedBy, approvedByName: null });







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// renderReport: the finished report's page as `session`
// sees it. banner: the approval banner, found among the
// page's status notes by its withdraw button (the outdated-
// acts note is a status too).
// -----------------------------------------------------------

function renderReport({ session = authData, ...options } = {}) {
  return renderPage(<ReportDetail authData={session} />, { route: `/reports/${f.ID.reportDone}`, path: '/reports/:reportId', ...options });
}

const banner = () => screen.queryAllByRole('status').find((element) => within(element).queryByRole('button', { name: /^(Withdraw the approval|Atšaukti patvirtinimą)$/ })) ?? null;

async function findBanner() {
  await waitFor(() => expect(banner()).not.toBeNull());
  return banner();
}







// -----------------------------------------------------------
// The approved report
// -----------------------------------------------------------

describe('ReportApproval — an approved report', () => {

  it('says who approved it and when, with the note, as a status (not an alert), and chips the header', async () => {
    renderReport();
    const note = await findBanner();
    expect(note).toHaveTextContent('Approved by Rūta Administratorė, 22/09/2026, 08:30');
    expect(note).toHaveTextContent('Peržiūrėta su atitikties pareigūnu.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(screen.getByRole('main')).getByText('Approved', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve the report' })).toBeNull();
  });


  it('keeps the note\'s line breaks', async () => {
    given.json('get', '/api/reports/:reportId', { ...DONE, approvalNote: 'Pirma eilutė\nAntra eilutė' });
    renderReport();
    const note = await findBanner();
    const text = within(note).getByText(/Pirma eilutė/);
    expect(text.textContent).toBe('Pirma eilutė\nAntra eilutė');
    expect(text).toHaveClass('whitespace-pre-wrap');
  });


  it('withdraws after a confirmation: PATCH {approved: false}, a toast, the approve button back', async () => {
    const patches = given.capture('patch', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    const note = await findBanner();
    await user.click(within(note).getByRole('button', { name: 'Withdraw the approval' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw the report\'s approval?' });
    expect(within(dialog).getByText('The report is treated as not approved again.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw the approval' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ approved: false });
    expect(patches[0].url).toBe(`http://localhost:3000/api/reports/${f.ID.reportDone}`);
    expect(await screen.findByText('Approval withdrawn')).toBeInTheDocument();
    await waitFor(() => expect(banner()).toBeNull());
    expect(screen.getByRole('button', { name: 'Approve the report' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByText('Approved', { selector: '.MuiChip-label' })).toBeNull();
  });


  it('Cancel keeps the approval and sends nothing', async () => {
    const patches = given.capture('patch', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await user.click(within(await findBanner()).getByRole('button', { name: 'Withdraw the approval' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw the report\'s approval?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches).toHaveLength(0);
    expect(banner()).not.toBeNull();
  });


  it('a refused withdrawal says why in the dialog, without a toast, and the approval stands', async () => {
    given.apiError('patch', '/api/reports/:reportId', 'SERVER_ERROR', { status: 500 });
    const { user } = renderReport();
    await user.click(within(await findBanner()).getByRole('button', { name: 'Withdraw the approval' }));
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw the report\'s approval?' });
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw the approval' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server error. Try again later.');
    expect(screen.getAllByText('Server error. Try again later.')).toHaveLength(1);

    // The approval stands (the page behind an open dialog is
    // hidden from the accessibility tree — close it first), and
    // reopening starts without the old refusal
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(banner()).not.toBeNull();
    await user.click(within(banner()).getByRole('button', { name: 'Withdraw the approval' }));
    const again = await screen.findByRole('dialog', { name: 'Withdraw the report\'s approval?' });
    expect(within(again).queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Approving
// -----------------------------------------------------------

describe('ReportApproval — approving', () => {

  it('shows no banner while unapproved, and offers "Approve the report" in the header', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    renderReport();
    expect(await screen.findByRole('button', { name: 'Approve the report' })).toBeEnabled();
    expect(banner()).toBeNull();
    expect(screen.queryByText(/^Approved/)).toBeNull();
  });


  it('approves with a note: the dialog explains the sign-off, PATCHes {approved: true, note}, toasts and shows the banner', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const patches = given.capture('patch', '/api/reports/:reportId', {
      ...DONE, approvedBy: f.me.id, approvedByName: f.me.displayName, approvedAt: f.NOW, approvalNote: 'Aptarta valdyboje.',
    });
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    expect(within(dialog).getByText('By approving you state that you reviewed the findings and the action plan. Any later change to a finding withdraws this approval.')).toBeInTheDocument();
    const note = within(dialog).getByRole('textbox', { name: 'Note (optional)' });
    expect(note).toHaveFocus();
    await user.type(note, 'Aptarta valdyboje.');
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ approved: true, note: 'Aptarta valdyboje.' });
    expect(await screen.findByText('Report approved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const shown = await findBanner();
    expect(shown).toHaveTextContent('Approved by Rūta Administratorė, 27/09/2026, 10:00');
    expect(shown).toHaveTextContent('Aptarta valdyboje.');
    expect(screen.queryByRole('button', { name: 'Approve the report' })).toBeNull();
  });


  it('approves without a note — the default handler answers the sign-off', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));
    expect(await findBanner()).toHaveTextContent('Approved by Rūta Administratorė, 27/09/2026, 10:00');
  });


  it('sends an empty note when none was typed, and a multi-line note as typed', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const patches = given.capture('patch', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    let dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ approved: true, note: '' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Approve the report' }));
    dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    // Enter in the multi-line note is a new line, not a submit
    await user.type(within(dialog).getByRole('textbox', { name: 'Note (optional)' }), 'Pirma{Enter}Antra');
    await settle(50);
    expect(patches).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1].body).toEqual({ approved: true, note: 'Pirma\nAntra' });
  });


  it('caps the note at 2000 characters, as the backend does', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const patches = given.capture('patch', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    const note = within(dialog).getByRole('textbox', { name: 'Note (optional)' });
    await user.click(note);
    await user.paste('x'.repeat(2100));
    expect(note.value).toHaveLength(2000);
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body.note).toHaveLength(2000);
  });


  it('reopens the approve dialog empty after a Cancel', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    let dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Note (optional)' }), 'juodraštis');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Approve the report' }));
    dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    expect(within(dialog).getByRole('textbox', { name: 'Note (optional)' })).toHaveValue('');
  });


  it('a refused approval says why in the dialog, keeps the note and sends no toast', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    given.apiError('patch', '/api/reports/:reportId', 'FORBIDDEN', { status: 403 });
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Note (optional)' }), 'Tvirtinu');
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You are not allowed to do this.');
    expect(screen.getAllByText('You are not allowed to do this.')).toHaveLength(1);
    expect(within(dialog).getByRole('textbox', { name: 'Note (optional)' })).toHaveValue('Tvirtinu');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(banner()).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve the report' })).toBeInTheDocument();
  });


  it('a plain user may sign off too — the backend checks that the report is theirs to see, not the role', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const patches = given.capture('patch', '/api/reports/:reportId', {
      ...DONE, approvedBy: f.plainUser.id, approvedByName: f.plainUser.displayName, approvedAt: f.NOW, approvalNote: '',
    });
    const { user } = renderReport({ session: userAuthData });
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve the report' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(await findBanner()).toHaveTextContent('Approved by Jonas Naudotojas, 27/09/2026, 10:00');
    expect(within(banner()).getByRole('button', { name: 'Withdraw the approval' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The action register
// -----------------------------------------------------------
//
// A sign-off moves the company's action register, and says
// what it did. signedWith: the PATCH answering the signed
// report with the given `register`. approve / withdraw: the
// two confirmations, clicked through.
// -----------------------------------------------------------

describe('ReportApproval — what a sign-off does to the action register', () => {

  const SIGNED = { ...DONE, approvedBy: f.me.id, approvedByName: f.me.displayName, approvedAt: f.NOW, approvalNote: '' };
  const REGISTER_LINK = `/companies/${f.ID.pavyzdys}?tab=actions`;

  const signedWith = (register) => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    given.json('patch', '/api/reports/:reportId', register === undefined ? SIGNED : { ...SIGNED, register });
  };

  const approve = async (user, name = 'Approve the report') => {
    await user.click(await screen.findByRole('button', { name }));
    await user.click(within(await screen.findByRole('dialog', { name: `${name}?` })).getByRole('button', { name }));
  };

  const withdraw = async (user, name = 'Withdraw the approval', title = 'Withdraw the report\'s approval?') => {
    await user.click(within(await findBanner()).getByRole('button', { name }));
    await user.click(within(await screen.findByRole('dialog', { name: title })).getByRole('button', { name }));
  };


  it('the dialog says, before the button, what the sign-off does to the register', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await user.click(await screen.findByRole('button', { name: 'Approve the report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the report?' });
    const line = within(dialog).getByText('On sign-off the report\'s action plan goes into the company\'s action register, and earlier actions are checked against this report\'s findings.');
    const note = within(dialog).getByRole('textbox', { name: 'Note (optional)' });
    expect(note.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });


  it('tells in words what the sign-off did, with the way to the company\'s register — the default backend\'s answer', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const { user } = renderReport();
    await approve(user);
    expect(await screen.findByText('Report approved')).toBeInTheDocument();
    expect(f.signOff(f.ID.reportDone)).toEqual({ added: 2, covered: 2, confirmed: 2, closed: 1, reopened: 0 });
    expect(screen.getByText('Actions added to the action register: 2; left out, already under an action: 2; obligations confirmed met: 2; earlier actions closed: 1.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the action register' })).toHaveAttribute('href', REGISTER_LINK);
  });


  it.each([
    ['a plan that comes in whole', { added: 5, covered: 0, confirmed: 0, closed: 0, reopened: 0 }, 'Actions added to the action register: 5.'],
    ['actions closed and sent back', { added: 5, covered: 0, confirmed: 0, closed: 1, reopened: 1 }, 'Actions added to the action register: 5; earlier actions closed: 1; sent back to work: 1.'],
    ['nothing new, an obligation confirmed', { added: 0, covered: 3, confirmed: 1, closed: 0, reopened: 0 }, 'Left out, already under an action: 3; obligations confirmed met: 1.'],
    ['only an action sent back to work', { added: 0, covered: 0, confirmed: 0, closed: 0, reopened: 2 }, 'Sent back to work: 2.'],
    ['numbers missing from the answer', { added: 1 }, 'Actions added to the action register: 1.'],
  ])('names only the parts that are not zero — %s', async (_name, register, sentence) => {
    signedWith(register);
    const { user } = renderReport();
    await approve(user);
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the action register' })).toHaveAttribute('href', REGISTER_LINK);
  });


  it('says the register did not change when every number is zero — the link still there', async () => {
    signedWith({ added: 0, covered: 0, confirmed: 0, closed: 0, reopened: 0 });
    const { user } = renderReport();
    await approve(user);
    expect(await screen.findByText('The action register did not change.')).toBeInTheDocument();
    expect(screen.getByText('Report approved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the action register' })).toHaveAttribute('href', REGISTER_LINK);
  });


  it('an answer without `register` toasts the approval alone — no sentence, no link', async () => {
    signedWith(undefined);
    const { user } = renderReport();
    await approve(user);
    expect(await screen.findByText('Report approved')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open the action register' })).toBeNull();
    expect(screen.queryByText(/action register/)).toBeNull();
  });


  it('reads the company\'s register again after a sign-off and after a withdrawal', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    const { user, queryClient } = renderReport();
    const refreshed = vi.spyOn(queryClient, 'invalidateQueries');
    await approve(user);
    await screen.findByText('Report approved');
    expect(refreshed).toHaveBeenCalledWith({ queryKey: ['actions', 'company', f.ID.pavyzdys] });
    refreshed.mockClear();
    await withdraw(user);
    await screen.findByText('Approval withdrawn');
    expect(refreshed).toHaveBeenCalledWith({ queryKey: ['actions', 'company', f.ID.pavyzdys] });
  });


  it('a withdrawal says how many actions it changed in the register', async () => {
    const { user } = renderReport();
    await withdraw(user);
    expect(await screen.findByText('Approval withdrawn')).toBeInTheDocument();
    expect(f.withdrawal(f.ID.reportDone)).toBe(2);
    expect(screen.getByText('Confirmations withdrawn in the register: 2.')).toBeInTheDocument();
  });


  it.each([
    ['nothing was confirmed', { ...UNAPPROVED, register: { withdrawn: 0 } }],
    ['the answer carries no register', UNAPPROVED],
  ])('a withdrawal says nothing of the register when %s', async (_name, answer) => {
    given.json('patch', '/api/reports/:reportId', answer);
    const { user } = renderReport();
    await withdraw(user);
    expect(await screen.findByText('Approval withdrawn')).toBeInTheDocument();
    expect(screen.queryByText(/withdrawn in the register/)).toBeNull();
  });


  it('speaks Lithuanian: the dialog\'s line, the sentence, "did not change" and the withdrawal', async () => {
    given.json('get', '/api/reports/:reportId', UNAPPROVED);
    given.sequence('patch', '/api/reports/:reportId', [
      { body: { ...SIGNED, register: { added: 5, covered: 0, confirmed: 0, closed: 1, reopened: 1 } } },
      { body: { ...UNAPPROVED, register: { withdrawn: 2 } } },
      { body: { ...SIGNED, register: { added: 0, covered: 0, confirmed: 0, closed: 0, reopened: 0 } } },
    ]);
    const { user } = renderReport({ locale: 'lt' });
    await user.click(await screen.findByRole('button', { name: 'Patvirtinti ataskaitą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Patvirtinti ataskaitą?' });
    expect(within(dialog).getByText('Patvirtinus, ataskaitos veiksmų planas įtraukiamas į įmonės veiksmų registrą, o ankstesni veiksmai patikrinami pagal šios ataskaitos išvadas.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Patvirtinti ataskaitą' }));
    expect(await screen.findByText('Į veiksmų registrą įtraukta veiksmų: 5; uždaryta ankstesnių veiksmų: 1; grąžinta vykdyti: 1.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Atidaryti veiksmų registrą' })).toHaveAttribute('href', REGISTER_LINK);

    await withdraw(user, 'Atšaukti patvirtinimą', 'Atšaukti ataskaitos patvirtinimą?');
    expect(await screen.findByText('Atšaukta patvirtinimų registre: 2.')).toBeInTheDocument();

    await approve(user, 'Patvirtinti ataskaitą');
    expect(await screen.findByText('Veiksmų registras nepasikeitė.')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// The approver's name
// -----------------------------------------------------------

describe('ReportApproval — the approver\'s name', () => {

  it('an administrator looks an older report\'s approver up in the user directory', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.jonas));
    const lookups = given.capture('get', '/api/users', { users: f.users });
    renderReport();
    await waitFor(() => expect(banner()).toHaveTextContent('Approved by Jonas Naudotojas, 22/09/2026, 08:30'));
    expect(lookups).toHaveLength(1);
  });


  it('names the caller without asking when the caller approved it', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.admin));
    const lookups = given.capture('get', '/api/users', { users: f.users });
    renderReport();
    expect(await findBanner()).toHaveTextContent('Approved by Rūta Administratorė, 22/09/2026, 08:30');
    await settle(50);
    expect(lookups).toHaveLength(0);
  });


  it('a plain user cannot read the directory: another approver shows as the date alone, and nothing is asked', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.admin));
    const lookups = given.capture('get', '/api/users', { users: f.users });
    renderReport({ session: userAuthData });
    const note = await findBanner();
    expect(note).toHaveTextContent('Approved 22/09/2026, 08:30');
    expect(note).not.toHaveTextContent('Approved by');
    await settle(50);
    expect(lookups).toHaveLength(0);
  });


  it('a plain user who approved it sees their own name', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.jonas));
    renderReport({ session: userAuthData });
    expect(await findBanner()).toHaveTextContent('Approved by Jonas Naudotojas, 22/09/2026, 08:30');
  });


  it('the report\'s own name wins — no lookup even for an administrator', async () => {
    const lookups = given.capture('get', '/api/users', { users: f.users });
    renderReport();
    expect(await findBanner()).toHaveTextContent('Approved by Rūta Administratorė');
    await settle(50);
    expect(lookups).toHaveLength(0);
  });


  it('falls back to the date when the directory does not know the approver', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.lina.replace(/3$/, '9')));
    renderReport();
    const note = await findBanner();
    await settle(50);
    expect(note).toHaveTextContent('Approved 22/09/2026, 08:30');
  });


  it('a failed directory costs only the name — the banner still stands', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.jonas));
    given.apiError('get', '/api/users', 'SERVER_ERROR', { status: 500 });
    renderReport();
    const note = await findBanner();
    await settle(50);
    expect(note).toHaveTextContent('Approved 22/09/2026, 08:30');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Lithuanian
// -----------------------------------------------------------

describe('ReportApproval in Lithuanian', () => {

  it('speaks Lithuanian: the banner, the chip, withdrawing and approving', async () => {
    given.json('get', '/api/reports/:reportId', DONE);
    const { user } = renderReport({ locale: 'lt' });
    const note = await findBanner();
    expect(note).toHaveTextContent('Patvirtino Rūta Administratorė, 2026-09-22 08:30');
    expect(within(screen.getByRole('main')).getByText('Patvirtinta', { selector: '.MuiChip-label' })).toBeInTheDocument();
    await user.click(within(note).getByRole('button', { name: 'Atšaukti patvirtinimą' }));
    const dialog = await screen.findByRole('dialog', { name: 'Atšaukti ataskaitos patvirtinimą?' });
    expect(within(dialog).getByText('Ataskaita vėl bus laikoma nepatvirtinta.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Atšaukti patvirtinimą' }));
    expect(await screen.findByText('Patvirtinimas atšauktas')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Patvirtinti ataskaitą' }));
    const approve = await screen.findByRole('dialog', { name: 'Patvirtinti ataskaitą?' });
    expect(within(approve).getByRole('textbox', { name: 'Pastaba (neprivaloma)' })).toBeInTheDocument();
    await user.click(within(approve).getByRole('button', { name: 'Patvirtinti ataskaitą' }));
    expect(await screen.findByText('Ataskaita patvirtinta')).toBeInTheDocument();
    expect(await findBanner()).toHaveTextContent('Patvirtino Rūta Administratorė, 2026-09-27 10:00');
  });


  it('shows the date alone in Lithuanian when the name is unknown', async () => {
    given.json('get', '/api/reports/:reportId', nameless(f.ID.admin));
    renderReport({ session: userAuthData, locale: 'lt' });
    expect(await findBanner()).toHaveTextContent('Patvirtinta 2026-09-22 08:30');
  });
});
