// -----------------------------------------------------------
//  [*] ProductExports — a product as a file
//
//  GET /api/programme/{id}/export?format= hands the product
//  over as a file: every kind as a PDF, the compliance policy
//  also as a Word file (a board edits a policy before it
//  adopts it), the risk register also as a workbook (a
//  register is kept). A draft exports like an approved
//  product — its cover says which of the two it is.
//
//  The downloads are authenticated blob fetches
//  (utils/download.js), the file named by the server's
//  Content-Disposition. One button per format of the kind;
//  the busy one spins and the others wait, a failure toasts
//  its reason in the programme's own words (useRefusal).
//
//  Split into (root component last):
//
//    ICONS          — a format's icon
//    ProductExports — the buttons (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import Button from '@mui/material/Button';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableViewOutlinedIcon from '@mui/icons-material/TableViewOutlined';
import toast from '@/utils/toast';
import { useTranslations } from '@/i18n';
import { downloadFile } from '@/utils/download';
import { EXPORT_FORMATS } from '@/pages/Programme/programmeUtils';
import useRefusal from '@/pages/Programme/useRefusal';


// The icon each format's button wears
const ICONS = { pdf: PictureAsPdfOutlinedIcon, docx: DescriptionOutlinedIcon, xlsx: TableViewOutlinedIcon };







// -----------------------------------------------------------
// ProductExports (default export)
// -----------------------------------------------------------
//
// The export buttons of one product, in the order of its
// kind's formats.
//
// Used by:
//   - ProductPage.jsx — the header of a draft or an approved
//     product
// -----------------------------------------------------------

export default function ProductExports({ product }) {

  const t = useTranslations('PAGES.programme.EXPORT');
  const refusal = useRefusal();
  const [busy, setBusy] = useState(null);


  const download = async (format) => {
    setBusy(format);
    try {
      const name = await downloadFile(`/api/programme/${product.id}/export?format=${format}`, `${product.kind}.${format}`);
      toast.success(t('exported', { name }));
    } catch (error) {
      toast.error(t('failed', { error: refusal(error) }));
    } finally {
      setBusy(null);
    }
  };


  // The label keys are spelled out per format: the message
  // guard checks literal keys only
  const labels = { pdf: [t('pdf'), t('labelPdf')], docx: [t('docx'), t('labelDocx')], xlsx: [t('xlsx'), t('labelXlsx')] };
  return (EXPORT_FORMATS[product.kind] ?? []).map((format) => {
    const Icon = ICONS[format];
    const [text, name] = labels[format];
    return (
      <Button key={format} variant="outlined" startIcon={<Icon />} loading={busy === format} disabled={Boolean(busy)}
              onClick={() => download(format)} aria-label={name}>{text}</Button>
    );
  });
}
