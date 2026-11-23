// -----------------------------------------------------------
//  [*] Tests — JsonView (a JSON value, readable)
//
//  Stored JSON for people rather than as a <pre> (the
//  company's market classification and its user-edited
//  attributes bag, a job's result, an audit entry's details):
//  objects as definition lists with humanised or translated
//  keys (at every depth), booleans as Yes / No in the UI
//  language, lists of words as chips (a null or a boolean in
//  such a list reads like its scalar twin, never "null" /
//  "true"), lists of objects as an indented stack, "—" for
//  every kind of nothing, strings that keep their line
//  breaks and wrap anywhere — and keys or values of any
//  shape (Object.prototype names, markup, unicode, depth,
//  size) rendered as text without a crash.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderPage } from '../support/render';
import { useSetLocale } from '@/i18n';
import JsonView from '@/components/JsonView/JsonView';


// The rows of a definition list: [term, definition text]
const rowsOf = (dl) => [...dl.querySelectorAll(':scope > div')].map((row) => [
  row.querySelector(':scope > dt').textContent,
  row.querySelector(':scope > dd').textContent,
]);

// The top-level definition list of the rendered view
const topList = (container) => container.querySelector('dl');

// The texts of the chips under an element
const chipTexts = (element) => [...element.querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent);







// -----------------------------------------------------------
// Objects
// -----------------------------------------------------------

describe('JsonView objects', () => {

  it('turns an object into a definition list — humanised keys as terms, readable values as definitions', () => {
    const { container } = renderPage(<JsonView value={{ licenseRequired: true, market_segment: 'retail', 'ai.act-scope': 'high risk', employees: 42 }} />);
    expect(rowsOf(topList(container))).toEqual([
      ['License required', 'Yes'],
      ['Market segment', 'retail'],
      ['Ai act scope', 'high risk'],
      ['Employees', '42'],
    ]);
    const dl = topList(container);
    expect(dl.querySelectorAll('dt')).toHaveLength(4);
    expect(dl.querySelectorAll('dd')).toHaveLength(4);
  });


  it('translates the keys it has labels for and humanises the rest', () => {
    const { container } = renderPage(<JsonView value={{ markets: ['crypto'], casp: true }} labels={{ markets: 'Rinkos' }} />);
    expect(rowsOf(topList(container))).toEqual([['Rinkos', 'crypto'], ['Casp', 'Yes']]);
  });


  it('applies the labels at every depth and indents a nested object as its own list', () => {
    const { container } = renderPage(
      <JsonView value={{ outer: { markets: 'MiCA', deeper: { markets: 'DORA' } } }} labels={{ markets: 'Rinkos', outer: 'Išorė' }} />,
    );
    const outerRow = topList(container).querySelector(':scope > div');
    expect(outerRow.querySelector('dt')).toHaveTextContent('Išorė');
    const inner = outerRow.querySelector('dd > dl');
    expect(rowsOf(inner)).toEqual([['Rinkos', 'MiCA'], ['Deeper', 'RinkosDORA']]);
    expect(rowsOf(inner.querySelector('dd > dl'))).toEqual([['Rinkos', 'DORA']]);
  });


  it('humanises camelCase, snake_case, dotted and dashed keys the same way', () => {
    const { container } = renderPage(<JsonView value={{ aiDescription: 1, processes_personal_data: 2, 'a.b-c_d': 3, ID: 4, x2Y: 5 }} />);
    expect(rowsOf(topList(container)).map(([term]) => term)).toEqual(['Ai description', 'Processes personal data', 'A b c d', 'Id', 'X2 y']);
  });


  it.each([
    ['constructor'], ['toString'], ['valueOf'], ['hasOwnProperty'], ['__proto__'], ['__defineGetter__'],
  ])('a key named like an Object prototype member (%s) is humanised — no function or prototype as the term, no crash', (key) => {
    // JSON.parse makes "__proto__" an own key, the way a stored
    // attributes bag arrives from the backend
    const value = JSON.parse(`{"${key}": "stored value", "plain": 1}`);
    const { container } = renderPage(<JsonView value={value} />);
    const rows = rowsOf(topList(container));
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe('stored value');
    expect(rows[0][0]).toMatch(/^[A-Z][a-z ]+$/);
  });


  it('still takes a caller label for such a key', () => {
    const { container } = renderPage(<JsonView value={JSON.parse('{"constructor": "x"}')} labels={{ constructor: 'Konstruktorius' }} />);
    expect(rowsOf(topList(container))).toEqual([['Konstruktorius', 'x']]);
  });
});







// -----------------------------------------------------------
// Scalars and nothing
// -----------------------------------------------------------

describe('JsonView scalars', () => {

  it.each([
    ['null', null], ['undefined', undefined], ['the empty string', ''], ['an empty list', []], ['an empty object', {}],
  ])('%s reads "—" in the muted colour', (_, value) => {
    renderPage(<JsonView value={value} />);
    expect(screen.getByText('—')).toHaveClass('text-muted');
  });


  it('keeps 0, false and negative numbers as values, not as nothing', () => {
    const { container } = renderPage(<JsonView value={{ zero: 0, no: false, negative: -1.5, big: 1e21 }} />);
    expect(rowsOf(topList(container))).toEqual([['Zero', '0'], ['No', 'No'], ['Negative', '-1.5'], ['Big', '1e+21']]);
  });


  it('shows a lone scalar on its own', () => {
    const { container } = renderPage(
      <>
        <JsonView value="plain text" />
        <JsonView value={7} />
        <JsonView value />
      </>,
    );
    expect(screen.getByText('plain text')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(container.querySelector('dl')).toBeNull();
  });


  it('keeps a string\'s line breaks and lets a long unbroken one wrap anywhere', () => {
    const text = 'first line\nsecond line\nhttps://example.lt/'.concat('x'.repeat(300));
    renderPage(<JsonView value={{ notes: text }} />);
    const span = screen.getByText((_, node) => node?.tagName === 'SPAN' && node.textContent === text);
    // No layout in jsdom — the utility classes are the witness
    expect(span).toHaveClass('whitespace-pre-wrap', '[overflow-wrap:anywhere]');
    expect(span.closest('dd')).toHaveClass('min-w-0');
  });


  it('speaks Lithuanian: Taip / Ne — and follows a live switch', async () => {
    function Frame() {
      const setLocale = useSetLocale();
      return (
        <>
          <button type="button" onClick={() => setLocale('en')}>to en</button>
          <JsonView value={{ usesAi: true, providesAi: false }} />
        </>
      );
    }
    const { user, container } = renderPage(<Frame />, { locale: 'lt' });
    expect(rowsOf(topList(container))).toEqual([['Uses ai', 'Taip'], ['Provides ai', 'Ne']]);
    await user.click(screen.getByRole('button', { name: 'to en' }));
    expect(rowsOf(topList(container))).toEqual([['Uses ai', 'Yes'], ['Provides ai', 'No']]);
  });
});







// -----------------------------------------------------------
// Lists
// -----------------------------------------------------------

describe('JsonView lists', () => {

  it('shows a list of words and numbers as chips, in order', () => {
    const { container } = renderPage(<JsonView value={{ domains: ['MiCA', 'DORA', 2023] }} />);
    const dd = topList(container).querySelector('dd');
    expect(chipTexts(dd)).toEqual(['MiCA', 'DORA', '2023']);
    expect(dd.querySelectorAll('.MuiChip-root')).toHaveLength(3);
  });


  it('reads a null or a boolean inside a list of words like its scalar twin — never "null" or "true"', () => {
    const { container } = renderPage(<JsonView value={{ flags: [null, true, false, '', 'kept'] }} />);
    const chips = chipTexts(topList(container).querySelector('dd'));
    expect(chips).toEqual(['—', 'Yes', 'No', '—', 'kept']);
    expect(chips.join(' ')).not.toMatch(/null|true|false/);
  });


  it('stacks a list of objects as indented blocks, each its own definition list', () => {
    const { container } = renderPage(<JsonView value={{ roles: [{ name: 'AML officer' }, { name: 'DPO', since: 2024 }] }} />);
    const dd = topList(container).querySelector('dd');
    const blocks = [...dd.firstElementChild.children];
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block).toHaveClass('border-l-2', 'pl-3');
    expect(rowsOf(blocks[0].querySelector('dl'))).toEqual([['Name', 'AML officer']]);
    expect(rowsOf(blocks[1].querySelector('dl'))).toEqual([['Name', 'DPO'], ['Since', '2024']]);
  });


  it('stacks a mixed list (objects, words, nested lists) item by item', () => {
    const { container } = renderPage(<JsonView value={[{ a: 1 }, 'plain', ['x', 'y'], null]} />);
    const stack = container.querySelector('.flex-col.gap-2');
    const blocks = [...stack.children];
    expect(blocks).toHaveLength(4);
    expect(rowsOf(blocks[0].querySelector('dl'))).toEqual([['A', '1']]);
    expect(blocks[1]).toHaveTextContent(/^plain$/);
    expect(chipTexts(blocks[2])).toEqual(['x', 'y']);
    expect(blocks[3]).toHaveTextContent(/^—$/);
  });


  it('copes with a big list and a deep structure', () => {
    let deep = { leaf: 'bottom' };
    for (let i = 0; i < 25; i += 1) deep = { [`level${i}`]: deep };
    const { container } = renderPage(
      <>
        <JsonView value={{ many: Array.from({ length: 500 }, (_, i) => `item-${i}`) }} />
        <JsonView value={deep} />
      </>,
    );
    expect(container.querySelectorAll('.MuiChip-root')).toHaveLength(500);
    expect(screen.getByText('bottom')).toBeInTheDocument();
    expect(container.querySelectorAll('dl')).toHaveLength(1 + 26);
  });
});







// -----------------------------------------------------------
// Hostile content and styling
// -----------------------------------------------------------

describe('JsonView hostile content', () => {

  it('renders markup and unicode in keys, values and chips as text', () => {
    const hostile = '💾 Ąžuolas <img src=x onerror=alert(1)> <script>alert(2)</script>';
    const { container } = renderPage(<JsonView value={{ [hostile]: hostile, list: [hostile] }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getAllByText(hostile)).toHaveLength(2);
    expect(chipTexts(container)).toEqual([hostile]);
  });


  it('adds the caller\'s className to its root', () => {
    const { container } = renderPage(<JsonView value={{ a: 1 }} className="mt-2" />);
    expect(topList(container).parentElement).toHaveClass('mt-2');
  });


  it('is text only — nothing in it is focusable or interactive', () => {
    renderPage(<JsonView value={{ a: [1, 2], b: { c: true } }} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(within(document.body).queryAllByRole('checkbox')).toHaveLength(0);
  });
});
