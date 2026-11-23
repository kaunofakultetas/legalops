// -----------------------------------------------------------
//  [*] Site parts — what the public pages are built from
//
//  The public site is plain React and Tailwind: no MUI, so a
//  visitor who only reads about the product never downloads
//  the console's component library. These are its few shared
//  pieces — the column every page keeps, the three grounds a
//  band can have, headings and running text, the two kinds
//  of link, the verdict tag and the sheet a specimen of the
//  product is shown on.
//
//  The look is the console's own (vite/README.md, "Look"):
//  ink, paper and the grey-blue desk; the serif for titles
//  and for anything quoted from a source; sentence case; a
//  hairline where the console has one and a shadow only under
//  what floats. On ink the keyboard focus is the brand's
//  yellow ring, on paper an ink one.
//
//  Split into:
//
//    GROUNDS   — a band's ground: paper, desk or ink
//    FOCUS     — the focus ring per ground
//    Wrap      — the page's column
//    Band      — a full-width band of a page
//    Part      — a part of a band that arrives on reveal
//    Reveal    — a group that reveals on its own
//    PageHead  — the ink head of a page, with its h1
//    Title     — a band's heading
//    Lede      — the paragraph under a heading
//    Action    — a link drawn as a button
//    TextLink  — a link in running text
//    ConsoleLink — sign in / open the console
//    StatusTag — a verdict, tinted by its tone
//    Sheet     — the white sheet of a specimen
// -----------------------------------------------------------

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { getToken } from '@/auth/token';
import { TONES } from '@/brand';
import { useTranslations } from '@/i18n';
import { CONSOLE_BASE, CONSOLE_LOGIN } from '@/paths';
import { Mark } from '@/components/layout/Wordmark';
import Sculpture from '@/site/Sculpture';
import useSeen from '@/site/useSeen';


// A band's ground and the colour of the text set on it
const GROUNDS = {
  paper: 'bg-surface text-content',
  desk: 'bg-canvas text-content',
  ink: 'bg-primary text-white',
};

// The keyboard focus ring: ink on the light grounds, the
// brand's yellow on ink (where an ink ring would not show)
const FOCUS = {
  light: 'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
  ink: 'outline-none focus-visible:ring-2 focus-visible:ring-marker focus-visible:ring-offset-2 focus-visible:ring-offset-primary',
};







// -----------------------------------------------------------
// Wrap
// -----------------------------------------------------------
//
// The column of every page: 72rem at most, with a gutter of
// 16 px on a phone growing to 32 px, the same on both sides
// — so the edges of every band line up down the page.
//
// Used by:
//   - Band (below)
//   - SiteHeader.jsx, SiteFooter.jsx
// -----------------------------------------------------------

export function Wrap({ className = '', children }) {
  return <div className={`mx-auto w-full max-w-[72rem] px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}







// -----------------------------------------------------------
// Band
// -----------------------------------------------------------
//
// One full-width band of a page on its ground, its content
// in the page's column. `labelledBy` names the band after
// its heading, which makes it a region a screen reader can
// jump to; `className` sets the band's own spacing. With
// `reveal` the band holds its parts (Part, below) back until
// it has come into view and then lets them arrive — the
// movement itself is globals.css's (.reveal).
//
// Used by:
//   - every page of the site
// -----------------------------------------------------------

export function Band({ ground = 'paper', labelledBy, reveal = false, className = 'py-16 sm:py-20 lg:py-24', children }) {

  const section = useRef(null);
  const seen = useSeen(section, { share: 0.14, inset: '10%', off: !reveal });


  return (
    <section ref={section} aria-labelledby={labelledBy} className={`${GROUNDS[ground]} ${className} ${reveal ? `reveal ${seen ? 'is-seen' : ''}` : ''}`}>
      <Wrap>{children}</Wrap>
    </section>
  );
}







// -----------------------------------------------------------
// Part
// -----------------------------------------------------------
//
// A part of a band that arrives when the band is revealed:
// `move` is the way it comes (rise, left, right, tilt, pop —
// globals.css lists them) and `turn` its place in the order,
// counted in steps of ninety milliseconds. In a band that
// does not reveal, a Part is simply its element.
//
// Used by:
//   - pages/Home.jsx, Closing.jsx, Limits.jsx — the bands of
//     the first page
// -----------------------------------------------------------

export function Part({ as: Tag = 'div', move = 'rise', turn = 0, className, children }) {
  return <Tag data-rv={move} style={{ '--i': turn }} className={className}>{children}</Tag>;
}







// -----------------------------------------------------------
// Reveal
// -----------------------------------------------------------
//
// A group inside a band that holds its own parts back until
// it has come into view — what Band's `reveal` does for a
// whole band, for one piece of a band too tall to arrive at
// once (a long list). The band around it must not reveal
// itself: an outer reveal would let the inner one's parts go
// with its own.
//
// Used by:
//   - pages/Sources.jsx — each group of acts
// -----------------------------------------------------------

export function Reveal({ as: Tag = 'div', className = '', children }) {

  const group = useRef(null);
  const seen = useSeen(group, { share: 0.08, inset: '10%' });


  return <Tag ref={group} className={`reveal ${seen ? 'is-seen' : ''} ${className}`}>{children}</Tag>;
}







// -----------------------------------------------------------
// PageHead
// -----------------------------------------------------------
//
// The head of every page but the first: the page's one h1
// and a sentence under it, on the ink the bar above is made
// of, so the two read as one — and beside them the mark's
// four pieces as an object in three dimensions, in the
// `arrangement` that says what the page is about
// (Sculpture.jsx, on its small stage; under the words on a
// phone). The words arrive as the page opens, while the
// pieces come together.
//
// Used by:
//   - pages/Product.jsx, Method.jsx, Sources.jsx,
//     Documentation.jsx, About.jsx
// -----------------------------------------------------------

export function PageHead({ id, title, arrangement = 'mark', children }) {
  return (
    <section aria-labelledby={id} className="relative overflow-hidden bg-linear-to-br from-primary-dark via-primary to-primary text-white">
      <Wrap className="relative pb-6 pt-14 sm:pt-20 md:pb-20">
        <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[48%] bg-[radial-gradient(50%_60%_at_58%_50%,rgba(62,111,176,0.5),transparent_72%)] md:block" />
        <h1 id={id} className="hero-rise relative m-0 max-w-[46rem] font-serif text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.012em] text-balance sm:text-[3rem] md:max-w-[54%]">
          {title}
        </h1>
        <div className="hero-rise relative" style={{ '--i': 1 }}><Lede onInk className="mt-5 md:max-w-[50%]">{children}</Lede></div>
        <Sculpture arrangement={arrangement} small className="relative mt-4 h-48 md:absolute md:inset-y-0 md:right-0 md:mt-0 md:h-auto md:w-[44%]" />
      </Wrap>
    </section>
  );
}







// -----------------------------------------------------------
// Title
// -----------------------------------------------------------
//
// A band's heading, in the serif like every title of the
// product. It inherits the band's text colour, so it is
// white on ink without being told.
//
// Used by:
//   - every page of the site
// -----------------------------------------------------------

export function Title({ id, className = '', children }) {
  return (
    <h2 id={id} className={`m-0 font-serif font-semibold text-[1.75rem] sm:text-[2.125rem] leading-[1.15] tracking-[-0.01em] text-balance ${className}`}>
      {children}
    </h2>
  );
}







// -----------------------------------------------------------
// Lede
// -----------------------------------------------------------
//
// The paragraph under a heading: larger than the interface's
// text and kept to a reading measure. `onInk` softens the
// white of a band on ink; on the light grounds it is set in
// graphite.
//
// Used by:
//   - every page of the site
// -----------------------------------------------------------

export function Lede({ onInk = false, className = '', children }) {
  return (
    <p className={`m-0 max-w-[40rem] text-[1.125rem] leading-[1.6] text-pretty ${onInk ? 'text-white/80' : 'text-muted'} ${className}`}>
      {children}
    </p>
  );
}







// -----------------------------------------------------------
// Action
// -----------------------------------------------------------
//
// A link drawn as a button — the site has no buttons that
// are not links. `to` is a page of the site (a router link),
// `href` an address outside its router: the console, which
// is another application, or a file the endpoint serves.
// `tone` is the ground it stands on: a white button on ink,
// an ink one on the light grounds. It answers the pointer
// the way the console's buttons do — a darker shade under
// the pointer, one pixel down when pressed. Anything else it
// is given (a target, a rel) goes on to the link.
//
// Used by:
//   - ConsoleLink (below)
//   - pages/Documentation.jsx — the way to the book
// -----------------------------------------------------------

export function Action({ to, href, tone = 'light', className = '', children, ...rest }) {
  const look = tone === 'ink'
    ? `bg-white text-primary hover:bg-[#E8EEF7] ${FOCUS.ink}`
    : `bg-primary text-white hover:bg-primary-dark ${FOCUS.light}`;
  const classes = `inline-flex items-center justify-center rounded px-5 py-2.5 text-[1rem] font-semibold no-underline whitespace-nowrap transition-colors duration-150 active:translate-y-px ${look} ${className}`;
  return to ? <Link to={to} className={classes} {...rest}>{children}</Link> : <a href={href} className={classes} {...rest}>{children}</a>;
}







// -----------------------------------------------------------
// TextLink
// -----------------------------------------------------------
//
// A link in running text or under a paragraph: underlined
// always (colour alone would not say "link"), the line
// growing heavier under the pointer. `onInk` turns it white
// for a band on ink.
//
// Used by:
//   - every page of the site
// -----------------------------------------------------------

export function TextLink({ to, href, onInk = false, className = '', children }) {
  const classes = `rounded-sm font-semibold underline decoration-1 underline-offset-4 hover:decoration-2 ${onInk ? `text-white ${FOCUS.ink}` : `text-primary ${FOCUS.light}`} ${className}`;
  return to ? <Link to={to} className={classes}>{children}</Link> : <a href={href} className={classes}>{children}</a>;
}







// -----------------------------------------------------------
// ConsoleLink
// -----------------------------------------------------------
//
// The way into the console as a button: "Sign in", to the
// sign-in page, for a visitor; "Open the console", straight
// in, when the browser already holds a session token (the
// console checks it — a dead one ends at the sign-in page
// anyway). A plain link either way: the console is another
// application (paths.js). The token is read when the bar is drawn; a
// browser that refuses the storage simply reads as signed
// out.
//
// Used by:
//   - SiteHeader.jsx — in the bar and in the phone menu
//   - Closing.jsx — the band that ends a page
// -----------------------------------------------------------

export function ConsoleLink({ tone = 'ink', className = '' }) {

  const t = useTranslations('SITE.common');
  let signedIn = false;
  try { signedIn = Boolean(getToken()); } catch { /* storage refused: a visitor */ }


  return (
    <Action href={signedIn ? CONSOLE_BASE : CONSOLE_LOGIN} tone={tone} className={className}>
      {signedIn ? t('openConsole') : t('signIn')}
    </Action>
  );
}







// -----------------------------------------------------------
// StatusTag
// -----------------------------------------------------------
//
// A verdict as the console's reports draw it: a small tag in
// the tint of its tone (brand.js — TONES), always with its
// word, never colour alone. `tone` is success, warning,
// error or info; without one the tag is neutral, as "not
// evidenced" and "not applicable" are in a report.
//
// Used by:
//   - specimens.jsx — every verdict shown
//   - pages/Method.jsx — the five statuses
// -----------------------------------------------------------

export function StatusTag({ tone, children }) {
  const tint = TONES[tone];
  return (
    <span
      className="inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-xs font-semibold leading-none whitespace-nowrap border-edge bg-canvas text-muted"
      style={tint ? { backgroundColor: tint.bg, borderColor: tint.border, color: tint.ink } : undefined}
    >
      {children}
    </span>
  );
}







// -----------------------------------------------------------
// Sheet
// -----------------------------------------------------------
//
// The white sheet a specimen of the product is shown on: a
// figure named by `label` (what the specimen shows, for a
// reader who cannot see it), with the console's hairline and
// the shadow of something that floats. `bar` puts the
// console's ink bar with the mark and `bar` as its name on
// top, for a specimen of a whole page. The text inside is
// real text — it is read, translated and selected like the
// rest of the page.
//
// Used by:
//   - specimens.jsx — every specimen
// -----------------------------------------------------------

export function Sheet({ label, bar, className = '', children }) {
  return (
    <figure aria-label={label} className={`m-0 overflow-hidden rounded-md border border-edge bg-surface text-content shadow-float ${className}`}>
      {bar && (
        <div className="flex items-center gap-2 bg-primary px-4 py-2.5">
          <Mark size={18} onDark />
          <span className="font-serif text-sm font-semibold text-white">{bar}</span>
        </div>
      )}
      {children}
    </figure>
  );
}
