// -----------------------------------------------------------
//  [*] uploads — what each upload takes, and how big
//
//  The GUI's copy of the backend's upload rules, so a file
//  that would be refused is refused BEFORE it is sent — the
//  backend reads the whole body before it answers 413
//  FILE_TOO_LARGE, a long wait for nothing on a slow line.
//  Each limit is the Django constant named in its banner;
//  Django refuses only a file LARGER than it (exactly the
//  limit passes), and so does utils/files.js. When the
//  backend changes a number, change it here too.
//
//  The sizes are binary megabytes (50 MB = 50 × 1024² bytes),
//  the unit formatBytes prints them in, so the hint reads the
//  backend's own number.
//
//  Split into:
//
//    MAX_DOCUMENT_BYTES — company documents, chat attachments
//    MAX_ACT_BYTES      — a legal act's file (corpus)
//    DOCUMENT_ACCEPT    — the company documents tab's types
//    CHAT_ACCEPT        — the same, plus their MIME types
//    ACT_ACCEPT         — a legal act's file types
// -----------------------------------------------------------







// -----------------------------------------------------------
// MAX_DOCUMENT_BYTES
// -----------------------------------------------------------
//
// 50 MB — MAX_FILE_BYTES of django companies/api/
// document_views.py, the per-file cap of POST /api/documents
// (company documents and chat attachments alike).
//
// Used by:
//   - pages/Companies/CompanyDocuments.jsx — the drop zone
//   - pages/Chat/ChatRuntime.jsx — the attachment adapter
//   - pages/Chat/Composer.jsx — the limit in the hints
//   - pages/Chat/Thread.jsx — the refusal notice
// -----------------------------------------------------------

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;







// -----------------------------------------------------------
// MAX_ACT_BYTES
// -----------------------------------------------------------
//
// 60 MB — MAX_UPLOAD_BYTES of django corpus/api/views.py,
// the cap of POST /api/corpus/documents/{id}/upload (a new
// version of a legal act).
//
// Used by:
//   - pages/Corpus/AddActDialog.jsx — an uploaded act's file
//   - pages/Corpus/CorpusDocument.jsx — a new version
// -----------------------------------------------------------

export const MAX_ACT_BYTES = 60 * 1024 * 1024;







// -----------------------------------------------------------
// DOCUMENT_ACCEPT
// -----------------------------------------------------------
//
// What the text extractor reads (django common/extraction.py
// detect_kind: .pdf, .docx, .html / .htm, and .txt / .md /
// .csv / .json as text) — the documents tab refuses anything
// else, because every stored file counts against the upload
// quota. POST /api/documents itself stores any file (and
// marks one it cannot read "failed"), so the GUI's lists are
// what keep such a file out.
//
// Used by:
//   - pages/Companies/CompanyDocuments.jsx — the drop zone
//   - CHAT_ACCEPT (below) — the chat takes the same files
// -----------------------------------------------------------

export const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md,.html,.htm,.csv,.json';







// -----------------------------------------------------------
// CHAT_ACCEPT
// -----------------------------------------------------------
//
// What the composer takes as a pick, a drop or a paste. It
// is the same upload as the documents tab, so it is built
// from DOCUMENT_ACCEPT (the two lists cannot drift apart),
// plus the MIME type of each of those formats: a file from
// the clipboard is judged by its type when its name does not
// tell. Every type here is one the extractor reads too
// (detect_kind takes application/pdf, the Word type, and
// text/html, text/* and application/json as text).
// assistant-ui refuses any other type without a word; the
// composer names it.
//
// Used by:
//   - pages/Chat/ChatRuntime.jsx — the attachment adapter
//   - pages/Chat/Composer.jsx — the picker and the screening
//   - pages/Chat/Thread.jsx — the refusal notice
// -----------------------------------------------------------

export const CHAT_ACCEPT = [
  DOCUMENT_ACCEPT,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
].join(',');







// -----------------------------------------------------------
// ACT_ACCEPT
// -----------------------------------------------------------
//
// The text of a legal act: the formats the ingestion takes a
// text from (django common/extraction.py — PDF, DOCX, HTML,
// plain text).
//
// Used by:
//   - pages/Corpus/AddActDialog.jsx — an uploaded act's file
//   - pages/Corpus/CorpusDocument.jsx — a new version
// -----------------------------------------------------------

export const ACT_ACCEPT = '.pdf,.docx,.html,.htm,.txt,.md,.xml';
