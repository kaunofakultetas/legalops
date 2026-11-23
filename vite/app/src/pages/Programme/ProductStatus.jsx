// -----------------------------------------------------------
//  [*] ProductStatus — a work product's status, as a chip
//
//  The one place a product's status becomes a chip, so the
//  company tab, the product page and the chat card name and
//  colour it alike: waiting in the queue and "not generated
//  yet" neutral, being generated in the info blue, a draft in
//  ink, approved in green, failed in red, cancelled in the
//  warning tone (StatusChip's `product` table). The words
//  carry the state — the colour only repeats it. A status
//  this build does not know is shown by its own name, in the
//  neutral tone.
// -----------------------------------------------------------

import StatusChip from '@/components/StatusChip/StatusChip';
import useEnumLabel from '@/hooks/useEnumLabel';







// -----------------------------------------------------------
// ProductStatus (default export)
// -----------------------------------------------------------
//
// The chip of one status, labelled in the interface language
// from the productStatus enum.
//
// Used by:
//   - ProductPage.jsx — the page header
//   - pages/Companies/CompanyProgramme.jsx — every version
//   - pages/Chat/ToolCards.jsx — the product cards
// -----------------------------------------------------------

export default function ProductStatus({ status, className = '' }) {
  const label = useEnumLabel();
  return <StatusChip kind="product" value={status} label={label('productStatus', status)} className={className} />;
}
