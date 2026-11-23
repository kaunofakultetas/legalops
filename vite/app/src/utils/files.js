// -----------------------------------------------------------
//  [*] files — the checks a file meets before it is sent
//
//  What an upload refuses up front, so the user hears it at
//  once instead of after sending the whole file:
//
//    - a type outside the upload's accept list — the file
//      picker's own filter is only a default (a dialog can be
//      switched to "All files"), and a drop or a paste has
//      none at all;
//    - a size over the backend's limit (constants/uploads.js)
//      — only LARGER is refused, as Django does it.
//
//  A refusal is stored as a fact ({name, reason}) and turned
//  into a sentence at render, in the UI's language, so a
//  notice already on screen follows a language switch.
//
//  Split into:
//
//    acceptsFile     — does a file match an accept list
//    acceptedTypes   — an accept list as the user reads it
//    screenFiles     — a batch → the files taken, the refused
//    describeRefused — the refused → translated sentences
// -----------------------------------------------------------

import { translate } from '@/i18n';
import { formatBytes } from '@/utils/format';







// -----------------------------------------------------------
// acceptsFile
// -----------------------------------------------------------
//
//   acceptsFile(file, '.pdf,.docx')        — by extension
//   acceptsFile(file, 'application/pdf')   — by MIME type
//   acceptsFile(file, 'image/*')           — by MIME family
//
// The <input accept> semantics, case-insensitive, a MIME
// type's parameters (";charset=…") ignored — the same rules
// assistant-ui applies to the chat's attachments, so the
// composer's screening and the runtime never disagree. An
// empty or missing list accepts everything.
//
// Used by:
//   - screenFiles (below)
//   - tests/core/files.test.js
// -----------------------------------------------------------

export function acceptsFile(file, accept) {
  const rules = String(accept || '').split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return true;
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').split(';')[0].trim().toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}







// -----------------------------------------------------------
// acceptedTypes
// -----------------------------------------------------------
//
//   acceptedTypes('.pdf,.docx,application/pdf') → ".pdf, .docx"
//   acceptedTypes('image/*')                    → "image/*"
//
// An accept list as a refusal names it: the extensions when
// there are any (the MIME types beside them only repeat them
// for the clipboard), else every rule.
//
// Used by:
//   - describeRefused (below)
//   - tests/core/files.test.js
// -----------------------------------------------------------

export function acceptedTypes(accept) {
  const rules = String(accept || '').split(',').map((rule) => rule.trim()).filter(Boolean);
  const extensions = rules.filter((rule) => rule.startsWith('.'));
  return (extensions.length > 0 ? extensions : rules).join(', ');
}







// -----------------------------------------------------------
// screenFiles
// -----------------------------------------------------------
//
//   screenFiles(files, { accept, maxSize })
//     → { accepted: [File], refused: [{ name, reason }] }
//
// Sorts one batch, in order: a type outside `accept` is
// refused as 'type' (whatever its size), a file larger than
// `maxSize` bytes as 'size'; without `maxSize` no size is
// judged.
//
// Used by:
//   - components/FileDrop/FileDrop.jsx — every drop and pick
//   - pages/Chat/Composer.jsx — the types of a pick, a drop
//     or a paste
// -----------------------------------------------------------

export function screenFiles(files, { accept, maxSize } = {}) {
  const accepted = [];
  const refused = [];
  for (const file of files) {
    if (!acceptsFile(file, accept)) refused.push({ name: file.name, reason: 'type' });
    else if (maxSize && file.size > maxSize) refused.push({ name: file.name, reason: 'size' });
    else accepted.push(file);
  }
  return { accepted, refused };
}







// -----------------------------------------------------------
// describeRefused
// -----------------------------------------------------------
//
//   describeRefused(refused, { accept, maxSize }, 'en') →
//     ['setup.exe — not an accepted file type (accepted: .pdf)',
//      'scan.pdf — file too large (at most 50 MB)']
//
// One sentence per reason, types first, each naming its
// files; the limit is formatted in the locale given (the
// cookie's when none).
//
// Used by:
//   - components/FileDrop/FileDrop.jsx — its refusal alert
//   - pages/Chat/Thread.jsx — ChatErrorNotice ("Not attached")
// -----------------------------------------------------------

export function describeRefused(refused, { accept, maxSize } = {}, locale) {
  const names = (reason) => refused.filter((entry) => entry.reason === reason).map((entry) => entry.name);
  const wrongType = names('type');
  const tooLarge = names('size');
  const sentences = [];
  if (wrongType.length > 0) {
    sentences.push(translate('COMPONENTS.common.notAccepted', { names: wrongType.join(', '), types: acceptedTypes(accept) }, locale));
  }
  if (tooLarge.length > 0) {
    sentences.push(translate('COMPONENTS.common.tooLarge', { names: tooLarge.join(', '), limit: formatBytes(maxSize, locale) }, locale));
  }
  return sentences;
}
