// -----------------------------------------------------------
//  [*] programmeApi — the programme routes of the backend
//
//  Every call the programme pages make, in one place, with
//  the query keys their answers are cached under:
//
//    GET    /api/companies/{id}/programme   a company's
//           products, newest version of each kind first, and
//           the kinds there are
//    POST   /api/companies/{id}/programme   start generating
//           a new version of a kind
//    GET    /api/programme/{id}             one product with
//           its content
//    PATCH  /api/programme/{id}             a person's
//           approval, with an optional note
//    DELETE /api/programme/{id}             remove a version
//    PUT    /api/programme/{id}/content     the edited draft,
//           whole — answered as the server normalised it,
//           with the rules of its kind run again
//    POST   /api/programme/{id}/revise      a new draft
//           version of an approved product
//    POST   /api/programme/{id}/cancel      stop a generation
//    GET    /api/programme/{id}/chart       the structure of
//           a governance product, drawn as an image
//
//  The export (GET …/export?format=) is a file download and
//  goes through utils/download.js from ProductExports.jsx.
//
//  The writes are silent: every caller shows a refusal where
//  the user acted (a dialog, the save bar), in the words of
//  useRefusal, instead of the client's toast. An answer that
//  is not what the route promises — no product, no list —
//  counts as a failed load, so no screen reads fields off
//  nothing.
//
//  Split into:
//
//    programmeKeys         — the query keys
//    fetchCompanyProgramme — a company's products and kinds
//    startProduct          — generate a new version
//    fetchProduct          — one product
//    approveProduct        — the approval
//    removeProduct         — delete a version
//    saveContent           — the edited draft
//    reviseProduct         — a new draft of an approved one
//    cancelProduct         — stop a generation
//    fetchChart            — the structure's image
// -----------------------------------------------------------

import api from '@/api/client';
import { readBlobError } from '@/utils/errors';
import { isProduct, listOf } from '@/pages/Programme/programmeUtils';







// -----------------------------------------------------------
// programmeKeys
// -----------------------------------------------------------
//
// The query keys of the programme's answers. A product's
// chart is keyed by the moment the product was last edited
// as well: a saved edit changes it, so the image is fetched
// again.
//
// Used by:
//   - pages/Companies/CompanyProgramme.jsx — the list
//   - ProductPage.jsx — the product, and what its writes
//     refresh
//   - ProductApproval.jsx — the approved product
//   - GovernanceStructure.jsx — the chart
//   - pages/Chat/ToolCards.jsx — the product a card follows
// -----------------------------------------------------------

export const programmeKeys = {
  company: (companyId) => ['programme', 'company', companyId],
  product: (productId) => ['programme', 'product', productId],
  chart: (productId, editedAt) => ['programme', 'chart', productId, editedAt ?? null],
};







// -----------------------------------------------------------
// fetchCompanyProgramme
// -----------------------------------------------------------
//
// A company's products (without their content) ordered by
// kind and newest version first, and the kinds with their
// titles and what each builds on.
//
// Used by:
//   - pages/Companies/CompanyProgramme.jsx
// -----------------------------------------------------------

export async function fetchCompanyProgramme(companyId) {
  const { data } = await api.get(`/api/companies/${companyId}/programme`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The programme answer is not an object');
  return { products: listOf(data.products), kinds: listOf(data.kinds) };
}







// -----------------------------------------------------------
// startProduct
// -----------------------------------------------------------
//
// Starts the generation of a new version of a kind in the
// language asked for; the answer is the queued product.
//
// Used by:
//   - pages/Companies/CompanyProgramme.jsx — the generate
//     dialog
// -----------------------------------------------------------

export async function startProduct(companyId, { kind, language }) {
  return (await api.post(`/api/companies/${companyId}/programme`, { kind, language }, { silent: true })).data;
}







// -----------------------------------------------------------
// fetchProduct
// -----------------------------------------------------------
//
// One product with its content, its checks and — while it is
// being generated — its job's status.
//
// Used by:
//   - ProductPage.jsx — the page's query
//   - pages/Chat/ToolCards.jsx — a card following a
//     generation
// -----------------------------------------------------------

export async function fetchProduct(productId) {
  const { data } = await api.get(`/api/programme/${encodeURIComponent(productId)}`);
  if (!isProduct(data)) throw new Error('The product answer is not a product');
  return data;
}







// -----------------------------------------------------------
// approveProduct
// -----------------------------------------------------------
//
// A person's approval of a draft; the answer is the approved
// product. The backend refuses while a blocking rule of the
// kind is broken.
//
// Used by:
//   - ProductApproval.jsx — the approve dialog
// -----------------------------------------------------------

export async function approveProduct(productId, note) {
  return (await api.patch(`/api/programme/${productId}`, { approved: true, note }, { silent: true })).data;
}







// -----------------------------------------------------------
// removeProduct
// -----------------------------------------------------------
//
// Deletes one version; a product being generated must be
// cancelled first.
//
// Used by:
//   - ProductPage.jsx — the delete dialog
// -----------------------------------------------------------

export async function removeProduct(productId) {
  return (await api.delete(`/api/programme/${productId}`, { silent: true })).data;
}







// -----------------------------------------------------------
// saveContent
// -----------------------------------------------------------
//
// Sends an edited draft whole. The answer is the product
// with the content as the server stored it — ids, levels,
// scores and bands worked out again, provisions looked up
// again — and the checks of its kind run over it.
//
// Used by:
//   - ProductPage.jsx — the save bar
// -----------------------------------------------------------

export async function saveContent(productId, content) {
  const { data } = await api.put(`/api/programme/${productId}/content`, { content }, { silent: true });
  if (!isProduct(data)) throw new Error('The saved product answer is not a product');
  return data;
}







// -----------------------------------------------------------
// reviseProduct
// -----------------------------------------------------------
//
// Makes a new draft version out of an approved product; the
// answer is that draft.
//
// Used by:
//   - ProductPage.jsx — "new version"
// -----------------------------------------------------------

export async function reviseProduct(productId) {
  return (await api.post(`/api/programme/${productId}/revise`, null, { silent: true })).data;
}







// -----------------------------------------------------------
// cancelProduct
// -----------------------------------------------------------
//
// Asks a queued or running generation to stop; the answer is
// the product without its content.
//
// Used by:
//   - ProductPage.jsx — the stop dialog
// -----------------------------------------------------------

export async function cancelProduct(productId) {
  return (await api.post(`/api/programme/${productId}/cancel`, null, { silent: true })).data;
}







// -----------------------------------------------------------
// fetchChart
// -----------------------------------------------------------
//
// The structure of a governance product as the image the
// backend draws, fetched as a Blob so the request carries
// the bearer token — an image tag alone could not. A refusal
// arrives as a Blob too and is read back into an error the
// page can word.
//
// Used by:
//   - GovernanceStructure.jsx — the chart
// -----------------------------------------------------------

export async function fetchChart(productId) {
  try {
    return (await api.get(`/api/programme/${productId}/chart`, { responseType: 'blob' })).data;
  } catch (error) {
    throw await readBlobError(error);
  }
}
