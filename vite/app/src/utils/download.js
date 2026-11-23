// -----------------------------------------------------------
//  [*] download — authenticated file downloads
//
//  A plain <a href> cannot carry the bearer token, so files
//  behind /api (the report exports) are fetched as a Blob
//  through the api client and handed to the browser through
//  a temporary object URL. The file name comes from the
//  server's Content-Disposition (RFC 6266 filename* first,
//  then filename), falling back to the caller's name.
//
//  Split into:
//
//    filenameFrom — Content-Disposition → a file name
//    downloadFile — fetch + save
// -----------------------------------------------------------

import api from '@/api/client';
import { readBlobError } from '@/utils/errors';







// -----------------------------------------------------------
// filenameFrom
// -----------------------------------------------------------
//
// 'attachment; filename="legalops-UAB-2026-09-27.pdf"'
// → "legalops-UAB-2026-09-27.pdf"; null when absent.
//
// Used by:
//   - downloadFile (below)
// -----------------------------------------------------------

export function filenameFrom(disposition) {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain parameter
    }
  }
  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}







// -----------------------------------------------------------
// downloadFile
// -----------------------------------------------------------
//
//   await downloadFile('/api/reports/1/export?format=pdf', 'report.pdf')
//
// Resolves once the browser was handed the file; rejects
// with the api error (its JSON body already parsed back out
// of the Blob, so errorMessage maps the code).
//
// Used by:
//   - pages/Reports/ReportDetail.jsx — the PDF / Excel exports
//   - pages/Programme/ProductExports.jsx — a work product's
//     exports
//   - pages/Companies/CompanyActions.jsx — the action
//     register as Excel
// -----------------------------------------------------------

export async function downloadFile(url, fallbackName) {
  let response;
  try {
    response = await api.get(url, { responseType: 'blob' });
  } catch (error) {
    throw await readBlobError(error);
  }
  const name = filenameFrom(response.headers?.['content-disposition']) || fallbackName;
  const href = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick — Safari needs the URL alive
  // while it starts the download
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return name;
}
