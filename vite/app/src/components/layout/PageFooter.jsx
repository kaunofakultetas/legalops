// -----------------------------------------------------------
//  [*] PageFooter — the copyright band that closes a frame
//
//  A slim band in the navbar's ink with the copyright line in
//  white, after the tracer system's, as wide as the window.
//  On a narrow screen the line breaks into two even halves.
//
//  Where it stands is the frame's business:
//
//    - a page (PageLayout) ends with it: it is the last block
//      of the scrolling area, under the sidebar and the
//      content alike — at the bottom of the screen under a
//      short page, after the last row of a long one;
//    - the chat does not scroll as a page — its thread fills
//      the screen — so there it is the frame's last row, and
//      a phone, where every line counts, has none (the chat
//      passes the classes that hide it).
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';







// -----------------------------------------------------------
// PageFooter (default export)
// -----------------------------------------------------------
//
// The band itself, the frame's footer landmark. It never
// shrinks: a tall page pushes it down instead of squeezing
// it, and a table that stretches to the bottom of the screen
// leaves room for it (DataTable — useFillHeight). `className`
// adds to its classes.
//
// Used by:
//   - components/layout/PageLayout.jsx — the frame of a page
//   - pages/Chat/Chat.jsx — the chat frame
// -----------------------------------------------------------

export default function PageFooter({ className = '' }) {

  const t = useTranslations('COMPONENTS.common');


  return (
    <footer className={`shrink-0 px-4 py-1.5 text-center text-balance text-xs text-white bg-primary ${className}`}>
      {t('copyright')}
    </footer>
  );
}
