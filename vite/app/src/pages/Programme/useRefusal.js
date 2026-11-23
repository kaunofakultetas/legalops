// -----------------------------------------------------------
//  [*] useRefusal — a programme refusal, in plain words
//
//  The programme routes refuse with codes of their own
//  (NO_DOCUMENTS, RULES_BROKEN, NEWER_VERSION…) and with
//  codes the report routes use too (ALREADY_RUNNING,
//  STILL_RUNNING), whose shared sentences speak of an
//  analysis. Here a refusal is worded for a work product:
//  the code's sentence from PAGES.programme.REFUSALS when
//  there is one, otherwise the sentence every other failure
//  gets (utils/errors.js — a lost connection, a server
//  error, a validation message).
// -----------------------------------------------------------

import { useCallback } from 'react';
import { useTranslations } from '@/i18n';
import { errorInfo, useErrorMessage } from '@/utils/errors';







// -----------------------------------------------------------
// useRefusal (default export)
// -----------------------------------------------------------
//
// Hands back a function that turns a failed programme
// request into one translated sentence. It follows a switch
// of the interface language, so a stored error reads in the
// new language at once.
//
// Used by:
//   - pages/Companies/CompanyProgramme.jsx — the generate
//     dialog
//   - ProductPage.jsx — save, revise, cancel, delete
//   - ProductApproval.jsx — the approve dialog
//   - ProductExports.jsx — a failed download
// -----------------------------------------------------------

export default function useRefusal() {

  const t = useTranslations('PAGES.programme.REFUSALS');
  const describe = useErrorMessage();


  return useCallback((error) => {
    const { code } = errorInfo(error);
    const own = code ? t(code) : null;
    return typeof own === 'string' && own !== code ? own : describe(error);
  }, [t, describe]);
}
