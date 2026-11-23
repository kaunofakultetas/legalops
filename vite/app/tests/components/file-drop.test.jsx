// -----------------------------------------------------------
//  [*] Tests — FileDrop (drop files here, or pick them)
//
//  The dashed drop area with a real file button inside: the
//  button opens the hidden picker (mouse and keyboard — the
//  keyboard path of the whole component); a pick or a drop
//  hands the files over ONCE, as an array (all of them with
//  `multiple`, the first accepted one without); the same
//  file picked twice fires twice; `accept` — extensions,
//  MIME types, families, any case — holds for a drop and for
//  a picker switched to "All files", the refused files named
//  in an alert that the next good pick clears; `maxSize` —
//  a larger file (dropped or picked) refused before anything
//  is handed over, named with the limit in the UI language,
//  exactly the limit taken, a wrong type and a size in one
//  alert, the limit under the hint and both describing the
//  button — and without it no size judged (the backend's
//  FILE_TOO_LARGE); the drag highlight; the browser never
//  opening a dropped file, even when disabled; disabled
//  taking nothing; a drop with no files; the label, the hint;
//  both languages.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from '../support/render';
import FileDrop from '@/components/FileDrop/FileDrop';


const ACCEPT = '.pdf,.docx,.txt,.md,.html,.htm,.csv,.json';

const pdf = (name = 'AML policy.pdf') => new File(['%PDF-1.7 policy'], name, { type: 'application/pdf' });
const docx = (name = 'Procedure.docx') => new File(['PK docx'], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
const exe = (name = 'setup.exe') => new File(['MZ'], name, { type: 'application/x-msdownload' });
const png = (name = 'scan.png') => new File(['\u0089PNG'], name, { type: 'image/png' });

// The backend's document limit, and a PDF that REPORTS `bytes`
// without holding them (only file.size is read)
const MB50 = 50 * 1024 * 1024;
const sized = (name, bytes) => {
  const file = pdf(name);
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
};

// The hidden file input and the dashed drop area
const picker = (container) => container.querySelector('input[type="file"]');
const zone = () => screen.getByText(/Drop files here or|Nutempkite failus čia arba/).closest('.border-dashed');

// A drop of these files on the area; answers whether the
// browser's default (opening the file) survived
const dropFiles = (files) => fireEvent.drop(zone(), { dataTransfer: { files, types: ['Files'] } });

// The names handed over by each onFiles call
const handed = (onFiles) => onFiles.mock.calls.map(([files]) => files.map((file) => file.name));







// -----------------------------------------------------------
// Structure and the picker
// -----------------------------------------------------------

describe('FileDrop picker', () => {

  it('invites a drop, offers a real "Choose a file" button and shows the hint', () => {
    const { container } = renderPage(<FileDrop onFiles={() => {}} accept={ACCEPT} hint="PDF, DOCX or text, up to 25 MB" />);
    expect(screen.getByText(/Drop files here or/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeEnabled();
    expect(screen.getByText('PDF, DOCX or text, up to 25 MB')).toBeInTheDocument();
    expect(screen.getByTestId('UploadFileOutlinedIcon')).toHaveAttribute('aria-hidden', 'true');
    const input = picker(container);
    expect(input).toHaveAttribute('hidden');
    expect(input).toHaveAttribute('accept', ACCEPT);
    expect(input).not.toHaveAttribute('multiple');
    // the input is no second tab stop — the button is the way in
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('opens the picker from the button by click, Enter and Space', async () => {
    const { container, user } = renderPage(<FileDrop onFiles={() => {}} />);
    const opened = vi.fn();
    picker(container).addEventListener('click', opened);
    await user.click(screen.getByRole('button', { name: 'Choose a file' }));
    expect(opened).toHaveBeenCalledTimes(1);
    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Choose a file' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(opened).toHaveBeenCalledTimes(3);
  });


  it('hands a picked file over once, as an array', async () => {
    const onFiles = vi.fn();
    const { container, user } = renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} />);
    await user.upload(picker(container), pdf());
    expect(handed(onFiles)).toEqual([['AML policy.pdf']]);
    expect(onFiles.mock.calls[0][0][0]).toBeInstanceOf(File);
  });


  it('fires again for the same file picked twice — the input is reset after every pick', async () => {
    const onFiles = vi.fn();
    const { container, user } = renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} />);
    const file = pdf();
    await user.upload(picker(container), file);
    expect(picker(container).value).toBe('');
    await user.upload(picker(container), file);
    expect(handed(onFiles)).toEqual([['AML policy.pdf'], ['AML policy.pdf']]);
  });


  it('with `multiple` the picker takes several files and hands them all over', async () => {
    const onFiles = vi.fn();
    const { container, user } = renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} multiple />);
    expect(picker(container)).toHaveAttribute('multiple');
    await user.upload(picker(container), [pdf(), docx()]);
    expect(handed(onFiles)).toEqual([['AML policy.pdf', 'Procedure.docx']]);
  });


  it('a picker switched to "All files" is held to `accept` too: the refused file is named, the rest handed over', async () => {
    const onFiles = vi.fn();
    const { container } = renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} multiple />);
    // applyAccept off: the dialog's filter was switched to all files
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(picker(container), [pdf(), exe()]);
    expect(handed(onFiles)).toEqual([['AML policy.pdf']]);
    expect(screen.getByRole('alert')).toHaveTextContent('setup.exe — not an accepted file type (accepted: .pdf, .docx, .txt, .md, .html, .htm, .csv, .json)');
  });


  it('shows the caller\'s button label', () => {
    renderPage(<FileDrop onFiles={() => {}} label="Upload a new version" />);
    expect(screen.getByRole('button', { name: 'Upload a new version' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose a file' })).toBeNull();
  });
});







// -----------------------------------------------------------
// Drag and drop
// -----------------------------------------------------------

describe('FileDrop drop', () => {

  it('hands dropped files over once, as an array — all of them with `multiple`', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} multiple />);
    dropFiles([pdf(), docx(), pdf('Register.PDF')]);
    expect(handed(onFiles)).toEqual([['AML policy.pdf', 'Procedure.docx', 'Register.PDF']]);
  });


  it('without `multiple` takes only the first accepted file of a drop', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} />);
    dropFiles([exe(), docx(), pdf()]);
    expect(handed(onFiles)).toEqual([['Procedure.docx']]);
  });


  it('keeps the browser from opening a dropped file — dragover and drop are both cancelled', () => {
    renderPage(<FileDrop onFiles={() => {}} />);
    // fireEvent answers false when the handler prevented the default
    expect(fireEvent.dragOver(zone())).toBe(false);
    expect(dropFiles([pdf()])).toBe(false);
  });


  it('highlights the area while a drag is over it, and not after it leaves or drops', () => {
    renderPage(<FileDrop onFiles={() => {}} />);
    expect(zone()).toHaveClass('border-edge');
    fireEvent.dragOver(zone());
    expect(zone()).toHaveClass('border-primary', 'bg-canvas');
    fireEvent.dragLeave(zone());
    expect(zone()).not.toHaveClass('border-primary');
    fireEvent.dragOver(zone());
    dropFiles([pdf()]);
    expect(zone()).not.toHaveClass('border-primary');
    expect(zone()).toHaveClass('border-edge');
  });


  it('a drop without files (dragged text) hands nothing over and names nothing', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept={ACCEPT} />);
    fireEvent.drop(zone(), { dataTransfer: { files: [], types: ['text/plain'] } });
    fireEvent.drop(zone(), {});
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// accept
// -----------------------------------------------------------

describe('FileDrop accept', () => {

  it('refuses a dropped file outside `accept`, naming it in an alert, and hands nothing over', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf,.docx" multiple />);
    dropFiles([exe(), png()]);
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('setup.exe, scan.png — not an accepted file type (accepted: .pdf, .docx)');
  });


  it('a mixed drop hands over the accepted files and names the refused ones', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf,.docx" multiple />);
    dropFiles([pdf(), exe(), docx()]);
    expect(handed(onFiles)).toEqual([['AML policy.pdf', 'Procedure.docx']]);
    expect(screen.getByRole('alert')).toHaveTextContent(/^setup\.exe — /);
  });


  it('clears the note on the next drop that is all good', () => {
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf" multiple />);
    dropFiles([exe()]);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    dropFiles([pdf()]);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it.each([
    ['an extension, any case', '.PDF', pdf('report.pdf'), true],
    ['an extension against a longer one', '.htm', new File(['x'], 'page.html', { type: 'text/html' }), false],
    ['a MIME type', 'application/pdf', pdf('no-extension'), true],
    ['a MIME family', 'image/*', png(), true],
    ['a MIME family against another family', 'image/*', pdf(), false],
    ['spaces around the rules', ' .txt , .pdf ', pdf(), true],
    ['no accept at all', undefined, exe(), true],
    ['an empty accept', '', exe(), true],
  ])('%s: %j takes the file → %s', (_, accept, file, taken) => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept={accept} />);
    dropFiles([file]);
    expect(onFiles).toHaveBeenCalledTimes(taken ? 1 : 0);
    expect(Boolean(screen.queryByRole('alert'))).toBe(!taken);
  });


  it('without `maxSize` judges no sizes — a 12 MB file is handed over as is; the backend answers FILE_TOO_LARGE', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf" />);
    const big = new File([new Uint8Array(12 * 1024 * 1024)], 'Scanned register.pdf', { type: 'application/pdf' });
    dropFiles([big]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0]).toBe(big);
    expect(onFiles.mock.calls[0][0][0].size).toBe(12 * 1024 * 1024);
  });


  it('wraps a long list of refused names instead of widening the page', () => {
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf" multiple />);
    dropFiles(Array.from({ length: 30 }, (_, i) => exe(`very-long-file-name-without-spaces-${i}.exe`)));
    // No layout in jsdom — the utility class is the witness
    expect(screen.getByRole('alert')).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByRole('alert').textContent.split(', ')).toHaveLength(30);
  });
});







// -----------------------------------------------------------
// maxSize
// -----------------------------------------------------------
//
// The backend's per-file limit, judged before anything is
// handed over — a file too large used to upload completely
// just to be answered 413 FILE_TOO_LARGE.
// -----------------------------------------------------------

describe('FileDrop maxSize', () => {

  it('refuses a dropped file larger than `maxSize` before handing anything over, naming the file and the limit', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf" maxSize={MB50} />);
    dropFiles([sized('Scanned register.pdf', MB50 + 1)]);
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Scanned register.pdf — file too large (at most 50 MB)');
  });


  it('refuses a picked file too — the picker has no size filter', async () => {
    const onFiles = vi.fn();
    const { container, user } = renderPage(<FileDrop onFiles={onFiles} accept=".pdf" maxSize={MB50} />);
    await user.upload(picker(container), sized('didelis.pdf', 80 * 1024 * 1024));
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('didelis.pdf — file too large (at most 50 MB)');
  });


  it('takes a file of exactly `maxSize` — only a larger one is refused, as the backend does it', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf" maxSize={2048} />);
    dropFiles([new File([new Uint8Array(2048)], 'exact.pdf', { type: 'application/pdf' })]);
    expect(handed(onFiles)).toEqual([['exact.pdf']]);
    dropFiles([new File([new Uint8Array(2049)], 'one-byte-more.pdf', { type: 'application/pdf' })]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('one-byte-more.pdf — file too large (at most 2 KB)');
  });


  it('a mixed drop hands over the files that fit and names the ones that do not', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf" maxSize={MB50} multiple />);
    dropFiles([pdf('small.pdf'), sized('huge.pdf', MB50 + 1), sized('bigger.pdf', 2 * MB50), pdf('other.pdf')]);
    expect(handed(onFiles)).toEqual([['small.pdf', 'other.pdf']]);
    expect(screen.getByRole('alert')).toHaveTextContent('huge.pdf, bigger.pdf — file too large (at most 50 MB)');
  });


  it('without `multiple` takes the first file that passes both checks', () => {
    const onFiles = vi.fn();
    renderPage(<FileDrop onFiles={onFiles} accept=".pdf" maxSize={MB50} />);
    dropFiles([exe(), sized('huge.pdf', MB50 + 1), pdf('fits.pdf'), pdf('second.pdf')]);
    expect(handed(onFiles)).toEqual([['fits.pdf']]);
  });


  it('names a wrong type and a size in one alert, a line each, the types first — a wrong type is never judged by its size', () => {
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf,.docx" maxSize={MB50} multiple />);
    const bigExe = exe('huge.exe');
    Object.defineProperty(bigExe, 'size', { value: MB50 + 1 });
    dropFiles([sized('huge.pdf', MB50 + 1), bigExe, png()]);
    const alert = screen.getByRole('alert');
    const lines = [...alert.children].map((line) => line.textContent);
    expect(lines).toEqual([
      'huge.exe, scan.png — not an accepted file type (accepted: .pdf, .docx)',
      'huge.pdf — file too large (at most 50 MB)',
    ]);
  });


  it('clears the size refusal on the next drop that fits', () => {
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf" maxSize={MB50} />);
    dropFiles([sized('huge.pdf', MB50 + 1)]);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    dropFiles([pdf()]);
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('says the limit under the hint, and both describe the file button', () => {
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf" maxSize={MB50} hint="PDF or DOCX." />);
    expect(screen.getByText('PDF or DOCX.')).toBeInTheDocument();
    expect(screen.getByText('Maximum file size: 50 MB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toHaveAccessibleDescription('PDF or DOCX. Maximum file size: 50 MB');
  });


  it('says the limit without a hint too; with neither the button has no description', () => {
    const { unmount } = renderPage(<FileDrop onFiles={() => {}} maxSize={60 * 1024 * 1024} />);
    expect(screen.getByRole('button', { name: 'Choose a file' })).toHaveAccessibleDescription('Maximum file size: 60 MB');
    unmount();
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf" />);
    expect(screen.getByRole('button', { name: 'Choose a file' })).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/^Maximum file size/)).toBeNull();
  });


  it('formats the limit in the UI language — "1.5 MB" in English, "1,5 MB" in Lithuanian', () => {
    const limit = 1.5 * 1024 * 1024;
    const { unmount } = renderPage(<FileDrop onFiles={() => {}} accept=".pdf" maxSize={limit} />);
    expect(screen.getByText('Maximum file size: 1.5 MB')).toBeInTheDocument();
    dropFiles([sized('scan.pdf', limit + 1)]);
    expect(screen.getByRole('alert')).toHaveTextContent('scan.pdf — file too large (at most 1.5 MB)');
    unmount();

    renderPage(<FileDrop onFiles={() => {}} accept=".pdf" maxSize={limit} />, { locale: 'lt' });
    expect(screen.getByText('Didžiausias failo dydis: 1,5 MB')).toBeInTheDocument();
    dropFiles([sized('skenas.pdf', limit + 1)]);
    expect(screen.getByRole('alert')).toHaveTextContent('skenas.pdf — per didelis failas (daugiausia 1,5 MB)');
  });
});







// -----------------------------------------------------------
// Disabled and languages
// -----------------------------------------------------------

describe('FileDrop disabled and languages', () => {

  it('disabled: the button is off, a drop is ignored and never highlighted — yet not opened by the browser', async () => {
    const onFiles = vi.fn();
    const { container, user } = renderPage(<FileDrop onFiles={onFiles} accept=".pdf" disabled />);
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeDisabled();
    expect(fireEvent.dragOver(zone())).toBe(false);
    expect(zone()).not.toHaveClass('border-primary');
    expect(dropFiles([pdf(), exe()])).toBe(false);
    await user.upload(picker(container), pdf());
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });


  it('speaks Lithuanian: the invitation, the button and the refusal', () => {
    renderPage(<FileDrop onFiles={() => {}} accept=".pdf,.docx" />, { locale: 'lt' });
    expect(screen.getByText(/Nutempkite failus čia arba/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pasirinkti failą' })).toBeInTheDocument();
    dropFiles([exe('įrašas.exe')]);
    expect(screen.getByRole('alert')).toHaveTextContent('įrašas.exe — netinkamas failo tipas (tinka: .pdf, .docx)');
  });
});
