// -----------------------------------------------------------
//  [*] Tests — UniversalModal (the one dialog shape)
//
//  The dialog on its own inside the production frame: a
//  modal dialog named by its h2 title with the body inside;
//  a confirmation described by its body (a form or a
//  read-only dialog not) and the alertdialog role on
//  request; the translated Cancel / Confirm pair (Confirm
//  only with onConfirm or onSubmit) and custom labels; the
//  three ways out (Cancel, Escape, the backdrop) each
//  calling onClose
//  once; `busy` (both buttons off, the spinner, no way out);
//  `danger`, `confirmDisabled`, the inline error alert;
//  form mode (the paper is a noValidate form, Enter in a
//  field submits, the event's default is prevented, a
//  disabled or busy confirm blocks it); a confirm that runs
//  ONCE per intent — the second click of a double click, a
//  click during the fade-out and a click while busy do
//  nothing, while a second deliberate click after a failed
//  validation still works; an async handler that rejects
//  leaving no unhandled rejection; onExited after the close
//  animation; the width and the phone full screen; focus
//  moving in and back; both languages.
// -----------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderPage } from '../support/render';
import { mediaQueryMatches } from '../support/setup';
import { settle } from '../support/backend/contract';
import UniversalModal from '@/components/UniversalModal/UniversalModal';


// MUI's `theme.breakpoints.down('sm')` as useMediaQuery asks
// matchMedia for it — the width under which wide dialogs go
// full screen
const PHONE = '(max-width:599.95px)';


beforeEach(() => {
  mediaQueryMatches(PHONE, false);
});







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// dialog: the open dialog by its name. backdropOf: MUI's
// backdrop, the Modal root's aria-hidden first child — a
// click on it is what MUI reports as 'backdropClick'.
// Toggle: a page that opens the dialog from a button and
// closes it in onClose, the way every caller does.
// -----------------------------------------------------------

const dialog = (name) => screen.getByRole('dialog', { name });

const backdropOf = (dialogEl) => dialogEl.closest('.MuiDialog-root').querySelector('.MuiBackdrop-root');

const button = (name) => screen.getByRole('button', { name });

function Toggle({ onClose = () => {}, onExited = () => {}, ...props }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open the dialog</button>
      <UniversalModal open={open} title="Rename" onClose={(...args) => { onClose(...args); setOpen(false); }} onExited={onExited} {...props}>
        <input aria-label="Name" type="text" />
      </UniversalModal>
    </>
  );
}







// -----------------------------------------------------------
// Naming and content
// -----------------------------------------------------------

describe('UniversalModal naming and content', () => {

  it('is a modal dialog named by its h2 title, with the body inside', () => {
    renderPage(<UniversalModal open onClose={() => {}} title="Delete the company"><p>This cannot be undone.</p></UniversalModal>);
    const box = dialog('Delete the company');
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(within(box).getByRole('heading', { level: 2, name: 'Delete the company' })).toBeInTheDocument();
    expect(within(box).getByText('This cannot be undone.')).toBeInTheDocument();
  });


  it('renders nothing while closed', () => {
    renderPage(<UniversalModal open={false} onClose={() => {}} title="Hidden" onConfirm={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });


  it('offers only Cancel without onConfirm or onSubmit', () => {
    renderPage(<UniversalModal open onClose={() => {}} title="Details"><p>read only</p></UniversalModal>);
    expect(within(dialog('Details')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel']);
  });


  it('offers Cancel then Confirm with onConfirm — and the caller\'s own labels when given', () => {
    const { unmount } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Stock" />);
    expect(within(dialog('Stock')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Confirm']);
    unmount();
    renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Custom" confirmLabel="Delete" cancelLabel="Keep" />);
    expect(within(dialog('Custom')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep', 'Delete']);
  });


  it('speaks Lithuanian: Atšaukti and Patvirtinti', () => {
    renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Pervadinti" />, { locale: 'lt' });
    expect(within(dialog('Pervadinti')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Atšaukti', 'Patvirtinti']);
  });


  it('shows the inline error as an alert inside the dialog, after the body', () => {
    renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Save" error="This name is already in use."><p>body</p></UniversalModal>);
    const alert = within(dialog('Save')).getByRole('alert');
    expect(alert).toHaveTextContent('This name is already in use.');
    expect(within(dialog('Save')).getByText('body').compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });


  it('shows no alert without an error', () => {
    renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Save" error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('paints a danger confirm in the delete palette and a normal one in the primary colour', () => {
    const { unmount } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Delete" danger />);
    expect(button('Confirm')).toHaveClass('MuiButton-colorDelete', 'MuiButton-contained');
    unmount();
    renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Save" />);
    expect(button('Confirm')).toHaveClass('MuiButton-colorPrimary', 'MuiButton-contained');
  });


  it('keeps a long unicode title whole', () => {
    const title = `Ištrinti „${'Ąžuolas '.repeat(20).trim()}“ 💾`;
    renderPage(<UniversalModal open onClose={() => {}} title={title} />);
    expect(dialog(title)).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Description and role
// -----------------------------------------------------------
//
// A screen reader reads a dialog's name and description as
// it opens: a confirmation's body is its question, so it is
// the description; a form's fields and a details dialog's
// structured content are read in order instead.
// -----------------------------------------------------------

describe('UniversalModal description and role', () => {

  it('describes a confirmation by its body, the question read out with the title', () => {
    renderPage(
      <UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Delete the company">
        <p>This cannot be undone.</p>
      </UniversalModal>,
    );
    const box = dialog('Delete the company');
    expect(box).toHaveAccessibleDescription('This cannot be undone.');
    // the description is the body itself, not a copy of it
    expect(document.getElementById(box.getAttribute('aria-describedby'))).toHaveClass('MuiDialogContent-root');
  });


  it('describes each open confirmation by its own body', () => {
    renderPage(
      <>
        <UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Archive"><p>The chat moves to the archive.</p></UniversalModal>
        <UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Delete"><p>The chat is gone for good.</p></UniversalModal>
      </>,
    );
    // the later modal hides the earlier one from assistive
    // technology
    const archive = screen.getByRole('dialog', { name: 'Archive', hidden: true });
    const remove = screen.getByRole('dialog', { name: 'Delete' });
    expect(archive.getAttribute('aria-describedby')).not.toBe(remove.getAttribute('aria-describedby'));
    expect(archive).toHaveAccessibleDescription('The chat moves to the archive.');
    expect(remove).toHaveAccessibleDescription('The chat is gone for good.');
  });


  it('leaves a form undescribed — its fields carry their own labels', () => {
    renderPage(
      <UniversalModal open onClose={() => {}} onSubmit={() => {}} title="New role">
        <p>Roles are listed on the company page.</p>
        <input aria-label="Name" />
      </UniversalModal>,
    );
    expect(dialog('New role')).not.toHaveAttribute('aria-describedby');
    expect(dialog('New role')).toHaveAccessibleDescription('');
  });


  it('leaves a read-only dialog (only Cancel) undescribed — its content is read in order', () => {
    renderPage(<UniversalModal open onClose={() => {}} title="Audit entry"><p>Analysis started</p><pre>{'{"id": 1}'}</pre></UniversalModal>);
    expect(dialog('Audit entry')).not.toHaveAttribute('aria-describedby');
  });


  it('is a plain dialog by default and an alert dialog on request — named and described the same way', () => {
    const { unmount } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Save"><p>Save now?</p></UniversalModal>);
    expect(dialog('Save')).toHaveAttribute('role', 'dialog');
    unmount();
    renderPage(
      <UniversalModal open onClose={() => {}} onConfirm={() => {}} role="alertdialog" title="Leave the page?">
        <p>Unsaved work is lost.</p>
      </UniversalModal>,
    );
    const box = screen.getByRole('alertdialog', { name: 'Leave the page?' });
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(box).toHaveAccessibleDescription('Unsaved work is lost.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});







// -----------------------------------------------------------
// Closing
// -----------------------------------------------------------

describe('UniversalModal closing', () => {

  it('Cancel calls onClose exactly once', async () => {
    const onClose = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={onClose} onConfirm={() => {}} title="Ask" />);
    await user.click(button('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });


  it('Escape and a backdrop click call onClose once each, with MUI\'s reason', async () => {
    const onClose = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={onClose} title="Ask" />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0][1]).toBe('escapeKeyDown');
    fireEvent.click(backdropOf(dialog('Ask')));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose.mock.calls[1][1]).toBe('backdropClick');
  });


  it('fires onExited once, after the close animation — the moment a form may clear', async () => {
    const onExited = vi.fn();
    const { user } = renderPage(<Toggle onExited={onExited} />);
    await user.click(button('Open the dialog'));
    await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(button('Cancel'));
    expect(onExited).not.toHaveBeenCalled();
    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });


  it('moves focus into the dialog on open and back to the opener on close', async () => {
    const { user } = renderPage(<Toggle />);
    const opener = button('Open the dialog');
    await user.click(opener);
    const box = await screen.findByRole('dialog', { name: 'Rename' });
    await waitFor(() => expect(box.closest('.MuiDialog-root')).toContainElement(document.activeElement));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });
});







// -----------------------------------------------------------
// Busy
// -----------------------------------------------------------

describe('UniversalModal busy', () => {

  it('disables both buttons, spins inside Confirm and blocks every way out', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={onClose} onConfirm={onConfirm} title="Saving" busy />);
    expect(button('Cancel')).toBeDisabled();
    const confirm = within(dialog('Saving')).getAllByRole('button')[1];
    expect(confirm).toBeDisabled();
    expect(within(confirm).getByRole('progressbar')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    fireEvent.click(backdropOf(dialog('Saving')));
    fireEvent.click(confirm);
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });


  it('confirmDisabled turns off Confirm only', () => {
    renderPage(<UniversalModal open onClose={() => {}} onConfirm={() => {}} title="Pick one" confirmDisabled />);
    expect(button('Confirm')).toBeDisabled();
    expect(button('Cancel')).toBeEnabled();
  });
});







// -----------------------------------------------------------
// Confirmation mode
// -----------------------------------------------------------

describe('UniversalModal confirmation', () => {

  it('Confirm calls onConfirm exactly once with the click, and does not close by itself', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={onClose} onConfirm={onConfirm} title="Delete" />);
    expect(button('Confirm')).toHaveAttribute('type', 'button');
    await user.click(button('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toHaveProperty('type', 'click');
    expect(onClose).not.toHaveBeenCalled();
  });


  it('a double click confirms once', async () => {
    const onConfirm = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={onConfirm} title="Delete" />);
    await user.dblClick(button('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.tripleClick(button('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });


  it('two deliberate clicks confirm twice (a dialog that stays open may be confirmed again)', async () => {
    const onConfirm = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={onConfirm} title="Retry" />);
    await user.click(button('Confirm'));
    await user.click(button('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });


  it('confirms from the keyboard: Enter and Space on the button', async () => {
    const onConfirm = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={onConfirm} title="Delete" />);
    button('Confirm').focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });


  it('an async onConfirm that rejects leaves no unhandled rejection, and the dialog can be confirmed again', async () => {
    const unhandled = [];
    const record = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      // A plain function: a vi.fn() would itself attach handlers
      // to the promise it returns (mock.settledResults)
      let calls = 0;
      const onConfirm = () => { calls += 1; return Promise.reject(new Error('409 STILL_RUNNING')); };
      const { user } = renderPage(<UniversalModal open onClose={() => {}} onConfirm={onConfirm} title="Delete" />);
      await user.click(button('Confirm'));
      await settle(50);
      expect(unhandled).toEqual([]);
      await user.click(button('Confirm'));
      await settle(50);
      expect(calls).toBe(2);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });


  it('a click on Confirm while the dialog is already closing does nothing', async () => {
    const onConfirm = vi.fn();
    const { user } = renderPage(<Toggle onConfirm={onConfirm} />);
    await user.click(button('Open the dialog'));
    await screen.findByRole('dialog', { name: 'Rename' });
    await user.keyboard('{Escape}');
    // the fade-out keeps the buttons in the page for a moment
    const confirm = screen.getByRole('button', { name: 'Confirm', hidden: true });
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});







// -----------------------------------------------------------
// Form mode
// -----------------------------------------------------------

describe('UniversalModal form', () => {

  it('makes the paper a form without browser validation, with Confirm as its submit button', () => {
    renderPage(<UniversalModal open onClose={() => {}} onSubmit={() => {}} title="New role"><input aria-label="Name" required /></UniversalModal>);
    const form = dialog('New role');
    expect(form.tagName).toBe('FORM');
    expect(form).toHaveAttribute('novalidate');
    expect(button('Confirm')).toHaveAttribute('type', 'submit');
    expect(button('Cancel')).toHaveAttribute('type', 'button');
  });


  it('submits once on the button and once on Enter in a field — the page never navigates', async () => {
    const onSubmit = vi.fn((event) => expect(event.defaultPrevented).toBe(true));
    const { user } = renderPage(<Toggle onSubmit={onSubmit} />);
    await user.click(button('Open the dialog'));
    await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(button('Confirm'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText('Name'), 'Naujas pavadinimas{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(window.location.navigations).toEqual([]);
  });


  it('Cancel in a form closes without submitting', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={onClose} onSubmit={onSubmit} title="New role" />);
    await user.click(button('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });


  it('a double click on the submit button submits once — the form\'s own default is cancelled for the second click', async () => {
    const onSubmit = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={() => {}} onSubmit={onSubmit} title="New company" />);
    await user.dblClick(button('Confirm'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });


  it('a validation failure (nothing started, not busy) leaves the next deliberate submit working', async () => {
    // The Companies dialog's shape: submit validates first and
    // only then starts the mutation
    function Validating({ onSave }) {
      const [name, setName] = useState('');
      const [tried, setTried] = useState(false);
      return (
        <UniversalModal open onClose={() => {}} title="New company" error={tried && !name ? 'Fill in all required fields.' : null}
                        onSubmit={() => { setTried(true); if (name) onSave(name); }}>
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        </UniversalModal>
      );
    }
    const onSave = vi.fn();
    const { user } = renderPage(<Validating onSave={onSave} />);
    await user.click(button('Confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fill in all required fields.');
    await user.type(screen.getByLabelText('Name'), 'UAB Pavyzdys');
    await user.click(button('Confirm'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('UAB Pavyzdys');
  });


  it('an async onSubmit that rejects leaves no unhandled rejection, and the form can be submitted again', async () => {
    const unhandled = [];
    const record = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      let calls = 0;
      const onSubmit = () => { calls += 1; return Promise.reject(new Error('400 INVALID_FIELD')); };
      const { user } = renderPage(<UniversalModal open onClose={() => {}} onSubmit={onSubmit} title="New role"><input aria-label="Name" /></UniversalModal>);
      await user.type(screen.getByLabelText('Name'), 'AML{Enter}');
      await settle(50);
      await user.click(button('Confirm'));
      await settle(50);
      expect(calls).toBe(2);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });


  it('submits nothing while busy — neither Enter in a field nor a click', async () => {
    const onSubmit = vi.fn();
    const { user } = renderPage(
      <UniversalModal open onClose={() => {}} onSubmit={onSubmit} title="Saving" busy><input aria-label="Name" /></UniversalModal>,
    );
    await user.type(screen.getByLabelText('Name'), 'x{Enter}');
    fireEvent.submit(dialog('Saving'));
    expect(onSubmit).not.toHaveBeenCalled();
  });


  it('submits nothing on Enter while Confirm is disabled', async () => {
    const onSubmit = vi.fn();
    const { user } = renderPage(
      <UniversalModal open onClose={() => {}} onSubmit={onSubmit} title="Pick" confirmDisabled><input aria-label="Name" /></UniversalModal>,
    );
    await user.type(screen.getByLabelText('Name'), 'x{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });


  it('a submit that lands while the dialog fades out after a success sends nothing', async () => {
    // The Users create dialog's shape: success closes it, and a
    // second click can still reach the live button in the fade
    const onSubmit = vi.fn();
    function Closing() {
      const [open, setOpen] = useState(true);
      return (
        <UniversalModal open={open} onClose={() => setOpen(false)} title="New user" onSubmit={() => { onSubmit(); setOpen(false); }}>
          <input aria-label="Name" />
        </UniversalModal>
      );
    }
    renderPage(<Closing />);
    const confirm = button('Confirm');
    fireEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // still in the page while it fades
    expect(confirm).toBeInTheDocument();
    fireEvent.click(confirm);
    await settle(50);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });


  it('a confirm with both onSubmit and onConfirm is a submit — onConfirm is not called', async () => {
    const onSubmit = vi.fn();
    const onConfirm = vi.fn();
    const { user } = renderPage(<UniversalModal open onClose={() => {}} onSubmit={onSubmit} onConfirm={onConfirm} title="Both" />);
    await user.click(button('Confirm'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});







// -----------------------------------------------------------
// Width
// -----------------------------------------------------------

describe('UniversalModal width', () => {

  it('is a full-width small dialog by default and takes the caller\'s maxWidth', () => {
    const { unmount } = renderPage(<UniversalModal open onClose={() => {}} title="Small" />);
    expect(dialog('Small')).toHaveClass('MuiDialog-paperWidthSm', 'MuiDialog-paperFullWidth');
    unmount();
    renderPage(<UniversalModal open onClose={() => {}} title="Medium" maxWidth="md" />);
    expect(dialog('Medium')).toHaveClass('MuiDialog-paperWidthMd');
    expect(dialog('Medium')).not.toHaveClass('MuiDialog-paperFullScreen');
  });


  it('on a phone a wide dialog goes full screen, a small one stays a dialog', () => {
    mediaQueryMatches(PHONE);
    const { unmount } = renderPage(<UniversalModal open onClose={() => {}} title="Wide" maxWidth="md" />);
    expect(dialog('Wide')).toHaveClass('MuiDialog-paperFullScreen');
    unmount();
    renderPage(<UniversalModal open onClose={() => {}} title="Narrow" />);
    expect(dialog('Narrow')).not.toHaveClass('MuiDialog-paperFullScreen');
  });
});
