// -----------------------------------------------------------
//  [*] toast — the app's toasts, each shown as long as it
//      takes to read
//
//  react-hot-toast with one rule on top: a toast stays for a
//  moment to be noticed plus a reading time for every
//  character it says. A short confirmation ("Išsaugota") goes
//  after a second and a half; a sentence that names what a
//  delete removed stays about four seconds; nothing stays
//  past the cap. An error never goes before four seconds, as
//  it says what went wrong and what to do about it. A
//  caller's own duration still wins. The message may be a
//  string or React elements — its words are read out of them.
//
//  Every toast of the app goes through here; react-hot-toast
//  itself is imported only by this module and by the Toaster
//  in providers.jsx (tests/core/structural.test.js keeps it
//  so).
//
//  Split into:
//
//    NOTICE_MS / CHAR_MS — the rule's two numbers
//    LIMITS              — the shortest and longest stay, by kind
//    textOf              — the words a toast shows
//    toastDuration       — how long a toast stays
//    timed               — one kind's toast, its duration set
//    toast               — react-hot-toast with the rule
//                          (default export)
// -----------------------------------------------------------

import { isValidElement } from 'react';
import hotToast from 'react-hot-toast';


// A moment to notice the toast, then a reading time for each
// character — about forty a second, a quick read of a line
const NOTICE_MS = 1000;
const CHAR_MS = 25;

// The shortest and longest stay of each kind, in ms: a
// confirmation may go quickly, an error stays long enough to
// act on
const LIMITS = { blank: [1500, 8000], success: [1500, 8000], error: [4000, 9000] };







// -----------------------------------------------------------
// textOf
// -----------------------------------------------------------
//
// The words a toast shows: a string or number as it is, the
// text of React elements gathered from their children, and
// nothing for anything else (a boolean, null, an icon).
//
// Used by:
//   - toastDuration (below)
// -----------------------------------------------------------

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props.children);
  return '';
}







// -----------------------------------------------------------
// toastDuration
// -----------------------------------------------------------
//
// How long a toast of a kind (blank, success or error) stays,
// in ms, by the length of its words with runs of white space
// counted once — the rule of the file header, kept within
// the kind's LIMITS.
//
// Used by:
//   - toast (below)
//   - tests/core/toast.test.js, tests/core/api-client.test.js
// -----------------------------------------------------------

export function toastDuration(message, kind = 'blank') {
  const [shortest, longest] = LIMITS[kind] ?? LIMITS.blank;
  const length = textOf(message).replace(/\s+/g, ' ').trim().length;
  return Math.min(longest, Math.max(shortest, NOTICE_MS + length * CHAR_MS));
}







// -----------------------------------------------------------
// timed
// -----------------------------------------------------------
//
// One kind's toast — a plain one, success or error — with its
// duration set by toastDuration unless the caller set its
// own. The library is looked up at each call, so a test that
// spies on it sees the toasts.
//
// Used by:
//   - toast (below)
// -----------------------------------------------------------

function timed(kind) {
  return (message, options = {}) => {
    const shown = { duration: toastDuration(message, kind), ...options };
    return kind === 'blank' ? hotToast(message, shown) : hotToast[kind](message, shown);
  };
}







// -----------------------------------------------------------
// toast (default export)
// -----------------------------------------------------------
//
// react-hot-toast's toast with its durations timed: callable
// as a plain toast, with success and error, and every other
// function of the library (dismiss, loading, promise…) as it
// is.
//
// Used by:
//   - every toast of the app: api/client.js (a failed
//     mutation), components/LongPressButton (an early
//     release), and the confirmations and refusals of the
//     pages — Users, Account, Companies, Corpus, Reports,
//     Obligations, Prompts, MCP servers, Jobs and the chat
// -----------------------------------------------------------

const toast = Object.assign(timed('blank'), hotToast, { success: timed('success'), error: timed('error') });

export default toast;
