// -----------------------------------------------------------
//  [*] Tests — utils/files.js and constants/uploads.js
//
//  The checks a file meets before it is sent: acceptsFile
//  (the <input accept> rules — extensions, MIME types and
//  families, any case, a MIME type's parameters ignored, an
//  empty list taking everything), acceptedTypes (an accept
//  list as a refusal names it), screenFiles (the order of
//  the checks, only LARGER refused, no maxSize no size
//  judged) and describeRefused (a sentence per reason, types
//  first, the limit in the locale given); and the upload
//  limits against the Django constants they copy, and the
//  types — the chat taking exactly the documents tab's
//  files, plus their MIME types.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { acceptedTypes, acceptsFile, describeRefused, screenFiles } from '@/utils/files';
import { ACT_ACCEPT, CHAT_ACCEPT, DOCUMENT_ACCEPT, MAX_ACT_BYTES, MAX_DOCUMENT_BYTES } from '@/constants/uploads';


// A file-like of a name, a type and a size (the checks read
// nothing else)
const file = (name, type = '', size = 10) => ({ name, type, size });







// -----------------------------------------------------------
// acceptsFile / acceptedTypes
// -----------------------------------------------------------

describe('acceptsFile', () => {

  it.each([
    ['an extension', 'policy.pdf', '', '.pdf', true],
    ['an extension, any case', 'POLICY.PDF', '', '.pdf', true],
    ['a rule in capitals', 'policy.pdf', '', '.PDF', true],
    ['an extension it only contains', 'policy.pdf.exe', '', '.pdf', false],
    ['a MIME type', 'no-extension', 'application/pdf', 'application/pdf', true],
    ['a MIME type with parameters', 'notes', 'text/plain;charset=utf-8', 'text/plain', true],
    ['a MIME family', 'scan.png', 'image/png', 'image/*', true],
    ['another family', 'scan.pdf', 'application/pdf', 'image/*', false],
    ['spaces around the rules', 'a.txt', '', ' .txt , .pdf ', true],
    ['no type at all against MIME rules', 'blob', '', 'application/pdf,text/plain', false],
  ])('%s: %s (%s) against %j → %s', (_, name, type, accept, taken) => {
    expect(acceptsFile(file(name, type), accept)).toBe(taken);
  });


  it('takes everything without a list', () => {
    for (const accept of [undefined, null, '', ' , ']) expect(acceptsFile(file('setup.exe'), accept)).toBe(true);
  });


  it('agrees with the chat\'s list the way assistant-ui reads it: a screenshot or a spreadsheet refused, the documents tab\'s files taken — by name, or by MIME type when the name does not tell', () => {
    expect(acceptsFile(file('image.png', 'image/png'), CHAT_ACCEPT)).toBe(false);
    expect(acceptsFile(file('lentele.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), CHAT_ACCEPT)).toBe(false);
    expect(acceptsFile(file('senas.doc', 'application/msword'), CHAT_ACCEPT)).toBe(false);
    expect(acceptsFile(file('Registras.CSV', 'text/csv'), CHAT_ACCEPT)).toBe(true);
    // .htm was missing from the chat's list (the tab took it)
    expect(acceptsFile(file('page.htm', 'text/html'), CHAT_ACCEPT)).toBe(true);
    expect(acceptsFile(file('page.htm', ''), CHAT_ACCEPT)).toBe(true);
    for (const type of ['text/markdown', 'text/html', 'text/csv', 'application/json', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
      expect(acceptsFile(file('clipboard', type), CHAT_ACCEPT)).toBe(true);
    }
  });
});


describe('acceptedTypes', () => {

  it('names the extensions when there are any — the MIME types beside them only repeat them', () => {
    expect(acceptedTypes(CHAT_ACCEPT)).toBe('.pdf, .docx, .txt, .md, .html, .htm, .csv, .json');
    expect(acceptedTypes(' .pdf , .docx ')).toBe('.pdf, .docx');
  });


  it('names every rule when none is an extension, and nothing for no list', () => {
    expect(acceptedTypes('image/*,application/pdf')).toBe('image/*, application/pdf');
    expect(acceptedTypes(undefined)).toBe('');
  });
});







// -----------------------------------------------------------
// screenFiles / describeRefused
// -----------------------------------------------------------

describe('screenFiles', () => {

  it('sorts a batch in order: the files taken, and the refused with their reason', () => {
    const small = file('small.pdf', 'application/pdf', 100);
    const exact = file('exact.pdf', 'application/pdf', 1000);
    const { accepted, refused } = screenFiles([small, file('big.pdf', 'application/pdf', 1001), file('a.exe'), exact], { accept: '.pdf', maxSize: 1000 });
    expect(accepted).toEqual([small, exact]);
    expect(refused).toEqual([{ name: 'big.pdf', reason: 'size' }, { name: 'a.exe', reason: 'type' }]);
  });


  it('a wrong type is refused for its type, whatever its size', () => {
    expect(screenFiles([file('huge.exe', '', 5000)], { accept: '.pdf', maxSize: 1000 }).refused).toEqual([{ name: 'huge.exe', reason: 'type' }]);
  });


  it('judges no size without maxSize, and no type without accept', () => {
    const huge = file('huge.bin', '', 10 ** 12);
    expect(screenFiles([huge], {})).toEqual({ accepted: [huge], refused: [] });
    expect(screenFiles([huge])).toEqual({ accepted: [huge], refused: [] });
  });
});


describe('describeRefused', () => {

  const refused = [{ name: 'b.pdf', reason: 'size' }, { name: 'a.exe', reason: 'type' }, { name: 'c.pdf', reason: 'size' }, { name: 'd.png', reason: 'type' }];


  it('gives a sentence per reason, the types first, each naming its files', () => {
    expect(describeRefused(refused, { accept: CHAT_ACCEPT, maxSize: MAX_DOCUMENT_BYTES }, 'en')).toEqual([
      'a.exe, d.png — not an accepted file type (accepted: .pdf, .docx, .txt, .md, .html, .htm, .csv, .json)',
      'b.pdf, c.pdf — file too large (at most 50 MB)',
    ]);
  });


  it('speaks the locale given, the limit formatted in it', () => {
    expect(describeRefused(refused, { accept: '.pdf', maxSize: 1.5 * 1024 * 1024 }, 'lt')).toEqual([
      'a.exe, d.png — netinkamas failo tipas (tinka: .pdf)',
      'b.pdf, c.pdf — per didelis failas (daugiausia 1,5 MB)',
    ]);
  });


  it('says nothing for nothing refused, and only the reason there is', () => {
    expect(describeRefused([], { accept: '.pdf', maxSize: 1 }, 'en')).toEqual([]);
    expect(describeRefused([{ name: 'x.pdf', reason: 'size' }], { maxSize: MAX_ACT_BYTES }, 'en')).toEqual(['x.pdf — file too large (at most 60 MB)']);
  });
});







// -----------------------------------------------------------
// constants/uploads.js
// -----------------------------------------------------------

describe('the upload limits and types', () => {

  it('copy Django: MAX_FILE_BYTES (documents, 50 MB) and MAX_UPLOAD_BYTES (a legal act, 60 MB), in bytes', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(52428800);
    expect(MAX_ACT_BYTES).toBe(62914560);
  });


  it('keep each upload\'s own list of types', () => {
    expect(DOCUMENT_ACCEPT).toBe('.pdf,.docx,.txt,.md,.html,.htm,.csv,.json');
    expect(CHAT_ACCEPT).toBe('.pdf,.docx,.txt,.md,.html,.htm,.csv,.json,application/pdf,'
      + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,text/csv,application/json');
    expect(ACT_ACCEPT).toBe('.pdf,.docx,.html,.htm,.txt,.md,.xml');
  });


  it('the chat takes exactly the documents tab\'s extensions — the same upload — plus the MIME type of each of those formats, and nothing else', () => {
    const rules = CHAT_ACCEPT.split(',');
    expect(rules.filter((rule) => rule.startsWith('.'))).toEqual(DOCUMENT_ACCEPT.split(','));
    // Each format of the tab by its type — what django
    // common/extraction.py detect_kind reads besides the name
    expect(new Set(rules.filter((rule) => !rule.startsWith('.')))).toEqual(new Set([
      'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/markdown', 'text/html', 'text/csv', 'application/json',
    ]));
  });
});
