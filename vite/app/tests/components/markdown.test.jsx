// -----------------------------------------------------------
//  [*] Tests — Markdown (model-written markdown, rendered
//      safely)
//
//  The report's executive summary and the chat's answers are
//  markdown a model wrote — untrusted text. Pinned here: the
//  GFM the models use (headings, emphasis, strikethrough,
//  lists, task lists, tables in their own scrolling box,
//  code, quotes, autolinks); the headings moved under the
//  page's (two levels by default, headingOffset for the
//  chat's one or none, never past h6); links that open in a
//  new tab without opener, referrer or rank; only http(s)
//  and mailto surviving as links — javascript:, data:,
//  relative paths and fragments become plain text, never an
//  href="" that reloads the page; footnotes as in-page links
//  (reference to note and back, the ids of two answers kept
//  apart, the hidden heading and the back links' names in
//  both languages); images as links (no third-party request
//  from a report); raw HTML shown as text, never as
//  elements; nothing / a number (a swapped backend field)
//  rendered without a crash; the prose wrapper and the
//  caller's className.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderPage } from '../support/render';
import Markdown from '@/components/Markdown/Markdown';


// The wrapper div the markdown renders into
const body = (container) => container.querySelector('.prose');







// -----------------------------------------------------------
// Structure
// -----------------------------------------------------------

describe('Markdown structure', () => {

  it('renders headings (re-based under the card, see below), paragraphs, emphasis, strong text and strikethrough', () => {
    renderPage(<Markdown>{'## Summary\n\nThe company **mostly** complies, *with* ~~no~~ two gaps.\n\n### Gaps'}</Markdown>);
    // The text's top level ("##") lands at h3, "###" below it
    expect(screen.getByRole('heading', { level: 3, name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Gaps' })).toBeInTheDocument();
    expect(screen.getByText('mostly').tagName).toBe('STRONG');
    expect(screen.getByText('with').tagName).toBe('EM');
    expect(screen.getByText('no').tagName).toBe('DEL');
    expect(screen.getByText(/The company/).tagName).toBe('P');
  });


  it('renders ordered, unordered and nested lists', () => {
    renderPage(<Markdown>{'1. First\n2. Second\n   - nested a\n   - nested b\n\n- Loose'}</Markdown>);
    const lists = screen.getAllByRole('list');
    expect(lists.map((list) => list.tagName)).toEqual(['OL', 'UL', 'UL']);
    const [ordered] = lists;
    const items = within(ordered).getAllByRole('listitem');
    expect(items.map((item) => item.firstChild.textContent.trim())).toEqual(['First', 'Second', 'nested a', 'nested b']);
    expect(within(items[1]).getByRole('list')).toBeInTheDocument();
  });


  it('renders a GFM task list as read-only checkboxes', () => {
    renderPage(<Markdown>{'- [x] Appoint an AML officer\n- [ ] Register with the FNTT'}</Markdown>);
    const [done, open] = screen.getAllByRole('checkbox');
    expect(done).toBeChecked();
    expect(open).not.toBeChecked();
    expect(done).toBeDisabled();
    expect(open).toBeDisabled();
  });


  it('puts a GFM table in its own horizontally scrolling box, header and cells intact', () => {
    const table = '| Act | Status | Articles |\n|:---|:---:|---:|\n| MiCA | missing | 59, 70 |\n| DORA | met | 19 |';
    renderPage(<Markdown>{table}</Markdown>);
    const grid = screen.getByRole('table');
    expect(grid.parentElement).toHaveClass('overflow-x-auto');
    expect(within(grid).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Act', 'Status', 'Articles']);
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell').map((td) => td.textContent))).toEqual([
      ['MiCA', 'missing', '59, 70'],
      ['DORA', 'met', '19'],
    ]);
  });


  it('keeps inline code and fenced code blocks as code, their text untouched', () => {
    const { container } = renderPage(<Markdown>{'Call `budget_status()` first.\n\n```python\nif remaining <= 0:\n    raise BudgetExceeded\n```'}</Markdown>);
    expect(screen.getByText('budget_status()').tagName).toBe('CODE');
    const block = container.querySelector('pre > code');
    expect(block).toHaveClass('language-python');
    expect(block.textContent).toBe('if remaining <= 0:\n    raise BudgetExceeded\n');
  });


  it('renders block quotes and thematic breaks', () => {
    const { container } = renderPage(<Markdown>{'> Article 59 requires authorisation.\n\n---\n\nAfter the rule.'}</Markdown>);
    expect(container.querySelector('blockquote')).toHaveTextContent('Article 59 requires authorisation.');
    expect(container.querySelector('hr')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Headings
// -----------------------------------------------------------
//
// A model writes "#" and "##" as if its text were the page;
// the headings move under the page's own instead. OUTLINE
// uses all six levels; levels() reads the rendered ones.
// -----------------------------------------------------------

describe('Markdown headings', () => {

  const OUTLINE = '# Gap analysis\n\n## MiCA\n\n### Article 59\n\n#### Authorisation\n\n##### Scope\n\n###### Note';

  const levels = () => screen.getAllByRole('heading').map((heading) => [heading.tagName, heading.textContent]);


  it('moves every heading two levels down by default — inside a section card\'s h2, "#" is an h3 — and none past h6', () => {
    renderPage(<Markdown>{OUTLINE}</Markdown>);
    expect(levels()).toEqual([
      ['H3', 'Gap analysis'], ['H4', 'MiCA'], ['H5', 'Article 59'], ['H6', 'Authorisation'], ['H6', 'Scope'], ['H6', 'Note'],
    ]);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });


  it('headingOffset={1} puts "#" right under the page\'s h1 — the chat answer\'s place', () => {
    renderPage(<Markdown headingOffset={1}>{OUTLINE}</Markdown>);
    expect(levels()).toEqual([
      ['H2', 'Gap analysis'], ['H3', 'MiCA'], ['H4', 'Article 59'], ['H5', 'Authorisation'], ['H6', 'Scope'], ['H6', 'Note'],
    ]);
  });


  it('re-bases on the text\'s top level — a summary that starts at "##" does not skip h3', () => {
    renderPage(<Markdown>{'## Santrauka\n\ntext\n\n#### Deep\n\n### Middle'}</Markdown>);
    expect(levels()).toEqual([['H3', 'Santrauka'], ['H5', 'Deep'], ['H4', 'Middle']]);
  });


  it('headingOffset={0} keeps the levels the markdown wrote', () => {
    renderPage(<Markdown headingOffset={0}>{OUTLINE}</Markdown>);
    expect(levels()).toEqual([
      ['H1', 'Gap analysis'], ['H2', 'MiCA'], ['H3', 'Article 59'], ['H4', 'Authorisation'], ['H5', 'Scope'], ['H6', 'Note'],
    ]);
  });


  it('keeps the deep levels, which the typography plugin leaves unstyled, bold', () => {
    const { container } = renderPage(<Markdown>{OUTLINE}</Markdown>);
    // No CSS in jsdom — the modifier classes are the witness
    expect(body(container)).toHaveClass('prose-h5:font-semibold', 'prose-h6:font-semibold');
  });
});







// -----------------------------------------------------------
// Links and images
// -----------------------------------------------------------

describe('Markdown links', () => {

  it('opens an http(s) link in a new tab without opener, referrer or passed-on rank', () => {
    renderPage(<Markdown>{'See [MiCA on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1114/oj) and [the register](http://example.lt/r).'}</Markdown>);
    for (const [name, href] of [['MiCA on EUR-Lex', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj'], ['the register', 'http://example.lt/r']]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    }
  });


  it('keeps a mailto link', () => {
    renderPage(<Markdown>{'Write to [the DPO](mailto:dpo@example.lt).'}</Markdown>);
    expect(screen.getByRole('link', { name: 'the DPO' })).toHaveAttribute('href', 'mailto:dpo@example.lt');
  });


  it('turns bare URLs, www. addresses and e-mail addresses into safe links (GFM autolinks)', () => {
    renderPage(<Markdown>{'Sources: https://www.lb.lt/lt/ and www.fntt.lt, contact info@example.lt'}</Markdown>);
    expect(screen.getByRole('link', { name: 'https://www.lb.lt/lt/' })).toHaveAttribute('href', 'https://www.lb.lt/lt/');
    expect(screen.getByRole('link', { name: 'www.fntt.lt' })).toHaveAttribute('href', 'http://www.fntt.lt');
    expect(screen.getByRole('link', { name: 'info@example.lt' })).toHaveAttribute('href', 'mailto:info@example.lt');
    for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });


  it.each([
    ['javascript:', '[click me](javascript:alert(1))', 'click me'],
    ['upper-case JAVASCRIPT:', '[click me](JAVASCRIPT:alert(1))', 'click me'],
    ['data:', '[open](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)', 'open'],
    ['vbscript:', '[run](vbscript:msgbox(1))', 'run'],
    ['a relative path', '[the company](/companies/c1)', 'the company'],
    ['a fragment', '[jump](#section)', 'jump'],
    ['a fragment dressed as a footnote', '[note](#user-content-fn-1)', 'note'],
    ['a protocol-relative URL', '[cdn](//evil.example/x)', 'cdn'],
    ['a reference link to javascript:', '[ref link][x]\n\n[x]: javascript:alert(1)', 'ref link'],
  ])('%s becomes plain text — no link, no href at all', (_, source, text) => {
    const { container } = renderPage(<Markdown>{source}</Markdown>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    expect(screen.getByText(text).tagName).toBe('SPAN');
  });


  it('shows an image as a link to it, named by its alt text — no <img>, no request', () => {
    const { container } = renderPage(<Markdown>{'![MiCA scope diagram](https://example.lt/scope.png)'}</Markdown>);
    expect(container.querySelector('img')).toBeNull();
    const link = screen.getByRole('link', { name: 'MiCA scope diagram' });
    expect(link).toHaveAttribute('href', 'https://example.lt/scope.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });


  it('names an image link without alt text by its address', () => {
    renderPage(<Markdown>{'![](https://example.lt/scope.png)'}</Markdown>);
    expect(screen.getByRole('link', { name: 'https://example.lt/scope.png' })).toBeInTheDocument();
  });


  it('drops an image with an unsafe source entirely', () => {
    const { container } = renderPage(<Markdown>{'Before ![x](javascript:alert(1)) after'}</Markdown>);
    expect(container.querySelector('img, a, [href], [src]')).toBeNull();
    expect(body(container)).toHaveTextContent('Before after');
  });
});







// -----------------------------------------------------------
// Footnotes
// -----------------------------------------------------------
//
// GFM footnotes as the models write them: NOTES cites MiCA's
// note twice and DORA's once. targetOf: the element a
// #fragment link jumps to. references: the superscript
// links in the text, in order.
// -----------------------------------------------------------

describe('Markdown footnotes', () => {

  const NOTES = 'MiCA applies[^mica], so does DORA[^dora], and MiCA again[^mica].\n\n'
    + '[^mica]: Regulation (EU) 2023/1114, [on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1114/oj).\n'
    + '[^dora]: Regulation (EU) 2022/2554 — [not a link](javascript:alert(1)).';

  const targetOf = (link) => document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));

  it('puts the "Footnotes" heading one level under a text that starts with "#" — like a "##" of that text', () => {
    renderPage(<Markdown>{`# Išvada\n\n${NOTES}`}</Markdown>);
    expect(screen.getByRole('heading', { name: 'Išvada' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'Footnotes' }).tagName).toBe('H4');
  });

  const references = (scope = document.body) => within(scope).getAllByRole('link', { name: /^\d+$/ });


  it('makes each reference an in-page link to its note, numbered in citing order and described as a footnote', () => {
    renderPage(<Markdown>{NOTES}</Markdown>);
    const [mica, dora, micaAgain] = references();
    expect([mica, dora, micaAgain].map((link) => link.textContent)).toEqual(['1', '2', '1']);
    expect(mica.closest('sup')).not.toBeNull();
    for (const link of [mica, dora, micaAgain]) {
      expect(link.getAttribute('href')).toMatch(/^#./);
      expect(link).not.toHaveAttribute('target');
      expect(link).not.toHaveAttribute('rel');
      expect(link).toHaveAccessibleDescription('Footnotes');
    }
    expect(targetOf(mica).tagName).toBe('LI');
    expect(targetOf(mica)).toHaveTextContent(/^Regulation \(EU\) 2023\/1114/);
    expect(targetOf(dora)).toHaveTextContent(/^Regulation \(EU\) 2022\/2554/);
    expect(targetOf(micaAgain)).toBe(targetOf(mica));
  });


  it('links each note back to every place that cites it, each back link named in words', () => {
    renderPage(<Markdown>{NOTES}</Markdown>);
    const [mica, dora, micaAgain] = references();
    const back = (name) => targetOf(screen.getByRole('link', { name }));
    expect(back('Back to reference 1')).toBe(mica);
    expect(back('Back to reference 1-2')).toBe(micaAgain);
    expect(back('Back to reference 2')).toBe(dora);
    for (const link of screen.getAllByRole('link', { name: /^Back to reference/ })) {
      expect(link).not.toHaveAttribute('target');
      expect(targetOf(mica).closest('ol')).toContainElement(link);
    }
  });


  it('gathers the notes as small print under a hidden "Footnotes" heading, on the level of the markdown\'s "##"', () => {
    const { container } = renderPage(<Markdown>{NOTES}</Markdown>);
    const heading = screen.getByRole('heading', { name: 'Footnotes' });
    expect(heading).toHaveClass('sr-only');
    // GFM's h2 is this text's only heading, so it is the top
    // level: right under the card (offset 2 → h3)
    expect(heading.tagName).toBe('H3');
    const section = container.querySelector('section[data-footnotes]');
    expect(section).toContainElement(heading);
    expect(section).toContainElement(targetOf(references()[0]));
    expect(section).toHaveClass('footnotes', 'text-xs', 'border-t');
  });


  it('keeps the link rules inside a note: a safe link opens in a new tab, an unsafe one is text', () => {
    renderPage(<Markdown>{NOTES}</Markdown>);
    const eurLex = screen.getByRole('link', { name: 'on EUR-Lex' });
    expect(eurLex).toHaveAttribute('href', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj');
    expect(eurLex).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'not a link' })).toBeNull();
    expect(screen.getByText('not a link').tagName).toBe('SPAN');
  });


  it('a click on a reference jumps within the page — no new tab, no navigation', async () => {
    const { user } = renderPage(<Markdown>{NOTES}</Markdown>);
    const [mica] = references();
    await user.click(mica);
    expect(window.location.navigations).toEqual([]);
    expect(new URL(document.URL).hash).toBe(mica.getAttribute('href'));
  });


  it('keeps the footnotes of two answers on one page apart: no id twice, every link and description within its own answer', () => {
    const { container } = renderPage(<><Markdown>{NOTES}</Markdown><Markdown>{NOTES}</Markdown></>);
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    const answers = [...container.querySelectorAll('.prose')];
    expect(answers).toHaveLength(2);
    for (const answer of answers) {
      for (const link of within(answer).getAllByRole('link').filter((a) => a.getAttribute('href').startsWith('#'))) {
        expect(answer).toContainElement(targetOf(link));
      }
      for (const reference of references(answer)) {
        expect(answer).toContainElement(document.getElementById(reference.getAttribute('aria-describedby')));
      }
    }
  });


  it('speaks Lithuanian: the hidden heading and the back links', () => {
    renderPage(<Markdown>{NOTES}</Markdown>, { locale: 'lt' });
    expect(screen.getByRole('heading', { name: 'Išnašos' })).toHaveClass('sr-only');
    expect(references()[0]).toHaveAccessibleDescription('Išnašos');
    expect(screen.getByRole('link', { name: 'Grįžti į išnašos nuorodą 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grįžti į išnašos nuorodą 1-2' })).toBeInTheDocument();
    expect(screen.queryByText(/Footnotes|Back to reference/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Back to reference/ })).toBeNull();
  });


  it('a reference to a note that does not exist stays text', () => {
    const { container } = renderPage(<Markdown>{'Cited[^missing] without a note.'}</Markdown>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('section')).toBeNull();
    expect(body(container)).toHaveTextContent('Cited[^missing] without a note.');
  });
});







// -----------------------------------------------------------
// Raw HTML
// -----------------------------------------------------------

describe('Markdown raw HTML', () => {

  it('shows raw HTML as text — no script, image, frame, style or bold element is created', () => {
    const source = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(2)>',
      '<iframe src="https://evil.example"></iframe>',
      '<b>bold?</b> <a href="javascript:alert(3)">link?</a>',
      '<style>body{display:none}</style>',
      '<div onclick="alert(4)">div?</div>',
    ].join('\n\n');
    const { container } = renderPage(<Markdown>{source}</Markdown>);
    expect(container.querySelector('script, img, iframe, b, style, [onclick], [onerror]')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(body(container)).toHaveTextContent('<script>alert(1)</script>');
    expect(body(container)).toHaveTextContent('<img src=x onerror=alert(2)>');
    expect(body(container)).toHaveTextContent('<b>bold?</b>');
  });


  it('keeps HTML inside markdown text and inside code as literal text too', () => {
    const { container } = renderPage(<Markdown>{'Use `<b>` sparingly; a <em>tag</em> inline stays text.'}</Markdown>);
    expect(screen.getByText('<b>').tagName).toBe('CODE');
    expect(container.querySelector('em')).toBeNull();
    expect(body(container)).toHaveTextContent('a <em>tag</em> inline stays text.');
  });
});







// -----------------------------------------------------------
// Edge input and styling
// -----------------------------------------------------------

describe('Markdown edge input', () => {

  it.each([
    ['null', null], ['undefined', undefined], ['the empty string', ''],
  ])('%s renders an empty body', (_, value) => {
    const { container } = renderPage(<Markdown>{value}</Markdown>);
    expect(body(container)).toBeInTheDocument();
    expect(body(container)).toHaveTextContent(/^$/);
  });


  it('a number (a swapped backend field) is shown as its text instead of crashing the page', () => {
    const { container } = renderPage(<Markdown>{12345}</Markdown>);
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    expect(body(container)).toHaveTextContent(/^12345$/);
  });


  it('anything else that is not text (an object, a list, a boolean) renders an empty body instead of crashing', () => {
    const { container } = renderPage(
      <>
        <Markdown>{['a', 'b']}</Markdown>
        <Markdown>{{ summary: 'x' }}</Markdown>
        <Markdown>{true}</Markdown>
      </>,
    );
    expect(screen.queryByTestId('render-crashed')).toBeNull();
    const wrappers = container.querySelectorAll('.prose');
    expect(wrappers).toHaveLength(3);
    for (const wrapper of wrappers) expect(wrapper).toHaveTextContent(/^$/);
  });


  it('renders unicode and emoji as they are', () => {
    renderPage(<Markdown>{'Ąžuolas „kabutės“ — 💾 ✓ ∑'}</Markdown>);
    expect(screen.getByText('Ąžuolas „kabutės“ — 💾 ✓ ∑')).toBeInTheDocument();
  });


  it('lets a long unbroken word wrap anywhere, inside the typography wrapper with the caller\'s className', () => {
    const { container } = renderPage(<Markdown className="prose-p:my-2">{`https-less-${'x'.repeat(400)}`}</Markdown>);
    // No layout in jsdom — the utility classes are the witness
    expect(body(container)).toHaveClass('prose', 'prose-sm', 'max-w-none', '[overflow-wrap:anywhere]', 'prose-p:my-2');
  });


  it('copes with a long model answer', () => {
    const answer = Array.from({ length: 200 }, (_, i) => `- Finding ${i}: **Article ${i}** — [source](https://example.lt/${i})`).join('\n');
    renderPage(<Markdown>{answer}</Markdown>);
    expect(screen.getAllByRole('listitem')).toHaveLength(200);
    expect(screen.getAllByRole('link')).toHaveLength(200);
  });
});
