// -----------------------------------------------------------
//  [*] Markdown — model-written markdown, rendered safely
//
//  The report's executive summary and the chat's answers are
//  markdown a model wrote, so it is treated as untrusted:
//  only http(s) and mailto links survive (anything else is
//  dropped, never turned into a self-reloading href=""),
//  links open in a new tab without referrer, images render
//  as links (no third-party requests from a report), and
//  wide tables scroll inside their own box. Raw HTML in the
//  markdown is shown as text (react-markdown without
//  rehype-raw).
//
//  The markdown's headings move under the page's own: a
//  model's "#" would otherwise be a second h1 on a page that
//  has one, and its "##" a sibling of the section holding
//  it. The markdown's TOP level (whatever the model started
//  with, "#" or "##") lands at 1 + `headingOffset` and the
//  rest keep their distance below it — 2 by default, for
//  markdown inside a SectionCard (under its h2, the top
//  heading becomes h3); the chat, right under the
//  conversation's h1, passes 1. No level goes past h6.
//
//  GFM footnotes are in-page links: a reference jumps to its
//  note, the note's back link returns to the reference.
//  Their ids are per instance (a chat shows many answers,
//  each free to number its own [^1]) and their hidden texts
//  — the "Footnotes" heading each reference is described by,
//  the back links' names — speak the UI language. Only these
//  generated links may point at a #fragment; one a model
//  writes still renders as text.
//
//  Anything but a string or a number renders nothing:
//  react-markdown THROWS on a non-string child, and a report
//  whose summary arrives as the wrong type must not take its
//  page down.
//
//  Split into (root component last):
//
//    REMARK_PLUGINS     — GFM: tables, task lists, footnotes
//    FOOTNOTE_LABEL     — the footnotes heading's fixed id
//    COMPONENTS         — the element overrides
//    isFootnoteLink     — the links GFM made for footnotes
//    safeUrl            — the URL allow-list
//    sourceOf           — the markdown text of the children
//    eachElement        — a walk over a hast tree
//    shiftHeadings      — rehype: headings under the page's
//    scopeFootnoteLabel — rehype: that heading's id per use
//    MarkdownLink       — the link override
//    FootnotesSection   — the footnotes as small print
//    Markdown           — the renderer (default export)
// -----------------------------------------------------------

import { useId, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from '@/i18n';


// One plugin list for every render
const REMARK_PLUGINS = [remarkGfm];

// The id remark-rehype gives the footnotes' hidden heading
// whatever the clobberPrefix — see scopeFootnoteLabel
const FOOTNOTE_LABEL = 'footnote-label';

// Element overrides — the link, image, table and footnote
// rules above (the two functions are declared below)
const COMPONENTS = {
  a: MarkdownLink,
  img: ({ src, alt }) => (src
    ? <a href={src} target="_blank" rel="noopener noreferrer nofollow">{alt || src}</a>
    : null),
  table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
  section: FootnotesSection,
};







// -----------------------------------------------------------
// isFootnoteLink
// -----------------------------------------------------------
//
// Whether a hast <a> is one GFM made for a footnote: a
// reference (dataFootnoteRef) or a note's back link
// (dataFootnoteBackref). Markdown syntax cannot set these
// properties and raw HTML never becomes an element here, so
// a model cannot forge one.
//
// Used by:
//   - safeUrl, MarkdownLink (below)
// -----------------------------------------------------------

function isFootnoteLink(node) {
  const properties = node?.properties ?? {};
  return node?.tagName === 'a' && ('dataFootnoteRef' in properties || 'dataFootnoteBackref' in properties);
}







// -----------------------------------------------------------
// safeUrl
// -----------------------------------------------------------
//
// react-markdown's urlTransform: http(s) and mailto pass,
// and so does the #fragment of a footnote link; everything
// else becomes "" (the link renders as text).
//
// Used by:
//   - Markdown (below)
// -----------------------------------------------------------

function safeUrl(url, key, node) {
  if (isFootnoteLink(node)) return String(url).startsWith('#') ? url : '';
  return /^(https?:|mailto:)/i.test(String(url || '').trim()) ? url : '';
}







// -----------------------------------------------------------
// sourceOf
// -----------------------------------------------------------
//
// The children as markdown text: a string as it is, a number
// as its digits, anything else (null, an object, a list) as
// nothing.
//
// Used by:
//   - Markdown (below)
// -----------------------------------------------------------

function sourceOf(children) {
  if (typeof children === 'string') return children;
  if (typeof children === 'number' && Number.isFinite(children)) return String(children);
  return '';
}







// -----------------------------------------------------------
// eachElement
// -----------------------------------------------------------
//
// Calls `visit` on every element of a hast tree, a parent
// before its children.
//
// Used by:
//   - shiftHeadings, scopeFootnoteLabel (below)
// -----------------------------------------------------------

function eachElement(node, visit) {
  if (node.type === 'element') visit(node);
  for (const child of node.children ?? []) eachElement(child, visit);
}







// -----------------------------------------------------------
// shiftHeadings
// -----------------------------------------------------------
//
//   rehypePlugins={[[shiftHeadings, 2]]}   — the top level → h3
//
// A rehype plugin: the text's top heading level becomes
// 1 + `offset` and every other keeps its distance below it
// (a summary that starts at "##" does not skip a level),
// never past h6 (nor above h1). It runs after remark-rehype,
// so the footnotes' hidden h2 moves along with the rest.
//
// Used by:
//   - Markdown (below)
// -----------------------------------------------------------

function shiftHeadings(offset) {
  const by = Number.isInteger(offset) ? offset : 0;
  const levelOf = (node) => Number(/^h([1-6])$/.exec(node.tagName)?.[1] || 0);
  return (tree) => {
    let top = 7;
    eachElement(tree, (node) => { const level = levelOf(node); if (level && level < top) top = level; });
    if (top === 7) return;
    eachElement(tree, (node) => {
      const level = levelOf(node);
      if (level) node.tagName = `h${Math.min(6, Math.max(1, level - top + 1 + by))}`;
    });
  };
}







// -----------------------------------------------------------
// scopeFootnoteLabel
// -----------------------------------------------------------
//
// A rehype plugin. remark-rehype puts the clobberPrefix on
// every footnote id but one: the hidden heading is always
// "footnote-label" — one id repeated in every answer of a
// chat, so each reference would be described by the first
// answer's heading. The heading and the references'
// aria-describedby get the instance's prefix too.
//
// Used by:
//   - Markdown (below)
// -----------------------------------------------------------

function scopeFootnoteLabel(prefix) {
  const scoped = (id) => (id === FOOTNOTE_LABEL ? `${prefix}${FOOTNOTE_LABEL}` : id);
  return (tree) => eachElement(tree, (node) => {
    const { properties } = node;
    if (!properties) return;
    if (properties.id !== undefined) properties.id = scoped(properties.id);
    if (Array.isArray(properties.ariaDescribedBy)) properties.ariaDescribedBy = properties.ariaDescribedBy.map(scoped);
  });
}







// -----------------------------------------------------------
// MarkdownLink
// -----------------------------------------------------------
//
// A safe link opens in a new tab without opener, referrer or
// passed-on rank; an unsafe one (its href emptied by
// safeUrl) is plain text. A footnote link stays in the page
// and keeps what GFM gave it: its id (the target of the
// link back), its description or its name.
//
// Used by:
//   - COMPONENTS (above) — every <a>
// -----------------------------------------------------------

function MarkdownLink({ node, href, children, ...props }) {
  if (!href) return <span>{children}</span>;
  if (isFootnoteLink(node)) return <a href={href} {...props}>{children}</a>;
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
}







// -----------------------------------------------------------
// FootnotesSection
// -----------------------------------------------------------
//
// The notes GFM gathers at the end — the only <section>
// markdown produces — as small print under a rule, apart
// from the text that cites them.
//
// Used by:
//   - COMPONENTS (above) — every <section>
// -----------------------------------------------------------

function FootnotesSection({ children }) {
  return <section data-footnotes className="footnotes mt-6 pt-2 border-t border-edge text-xs">{children}</section>;
}







// -----------------------------------------------------------
// Markdown (default export)
// -----------------------------------------------------------
//
//   <Markdown>{report.summary}</Markdown>          — top level → h3
//   <Markdown headingOffset={1}>{text}</Markdown>  — top level → h2
//
// headingOffset places the markdown's top heading level: 2
// for markdown inside a SectionCard, 1 right under the page's
// h1, 0 for a document of its own.
//
// Used by:
//   - ReportOverview.jsx — the executive summary (2)
//   - pages/Chat/Messages.jsx — the assistant's answers (1)
// -----------------------------------------------------------

export default function Markdown({ children, className = '', headingOffset = 2 }) {

  const t = useTranslations('COMPONENTS.markdown');
  // This instance's footnote ids — useId kept to the
  // characters an id and its #fragment spell alike
  const prefix = `${useId().replace(/[^\w-]/g, '')}-`;


  const remarkRehypeOptions = useMemo(() => ({
    clobberPrefix: prefix,
    footnoteLabel: t('footnotes'),
    footnoteLabelProperties: { className: ['sr-only'] },
    // A note cited twice has two back links, to "1" and "1-2"
    footnoteBackLabel: (note, citation) => t('footnoteBack', { ref: citation > 1 ? `${note + 1}-${citation}` : note + 1 }),
  }), [prefix, t]);
  const rehypePlugins = useMemo(() => [[shiftHeadings, headingOffset], [scopeFootnoteLabel, prefix]], [headingOffset, prefix]);


  // The typography plugin styles only h1–h4; h5 and h6,
  // where deep headings land after the shift, stay bold
  return (
    <div className={`prose prose-sm max-w-none [overflow-wrap:anywhere] prose-h5:font-semibold prose-h6:font-semibold ${className}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} remarkRehypeOptions={remarkRehypeOptions} rehypePlugins={rehypePlugins}
                     urlTransform={safeUrl} components={COMPONENTS}>
        {sourceOf(children)}
      </ReactMarkdown>
    </div>
  );
}
