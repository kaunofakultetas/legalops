// -----------------------------------------------------------
//  [*] Tests — src/hooks
//
//  useDebounced (the value settles before it changes),
//  useEnumLabel (machine values → translated labels, dotted
//  values as nested keys, the humanised fallback for a value
//  the table does not know, "—" for nothing), useJobText (a
//  job's subject as a label + link, its progress in words)
//  and useUnsavedChanges (the router door held by useBlocker,
//  the browser door by beforeunload, same-path moves free).
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Link, RouterProvider, createMemoryRouter, useSearchParams } from 'react-router-dom';
import { IntlProvider, useSetLocale } from '@/i18n';
import useDebounced from '@/hooks/useDebounced';
import useEnumLabel from '@/hooks/useEnumLabel';
import useJobText from '@/hooks/useJobText';
import useUnsavedChanges from '@/hooks/useUnsavedChanges';


// Renders a hook's result as JSON inside the IntlProvider
function renderHookText(useHook, props = {}) {
  function Probe(p) {
    return <pre data-testid="out">{JSON.stringify(useHook(p))}</pre>;
  }
  const result = render(<IntlProvider><Probe {...props} /></IntlProvider>);
  return {
    read: () => JSON.parse(screen.getByTestId('out').textContent),
    rerender: (next) => result.rerender(<IntlProvider><Probe {...next} /></IntlProvider>),
  };
}







// -----------------------------------------------------------
// useDebounced
// -----------------------------------------------------------

describe('useDebounced', () => {

  it('trails the value by the delay and restarts the wait on every change', () => {
    vi.useFakeTimers();
    const view = renderHookText(({ value }) => useDebounced(value, 300), { value: 'a' });
    expect(view.read()).toBe('a');
    view.rerender({ value: 'ab' });
    act(() => { vi.advanceTimersByTime(200); });
    view.rerender({ value: 'abc' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(view.read()).toBe('a');
    act(() => { vi.advanceTimersByTime(100); });
    expect(view.read()).toBe('abc');
  });


  it('waits 300 ms by default', () => {
    vi.useFakeTimers();
    const view = renderHookText(({ value }) => useDebounced(value), { value: 1 });
    view.rerender({ value: 2 });
    act(() => { vi.advanceTimersByTime(299); });
    expect(view.read()).toBe(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.read()).toBe(2);
  });
});







// -----------------------------------------------------------
// useEnumLabel
// -----------------------------------------------------------

describe('useEnumLabel', () => {

  const labels = (pairs) => () => {
    const label = useEnumLabel();
    return pairs.map(([group, value]) => label(group, value));
  };


  it('labels known values in the UI language', () => {
    expect(renderHookText(labels([['findingStatus', 'missing'], ['boolean', 'null'], ['boolean', 'true']])).read())
      .toEqual(['Not met', 'Unknown', 'Yes']);
  });


  it('resolves dotted values as nested keys (job kinds)', () => {
    expect(renderHookText(labels([['jobKind', 'report.analyze'], ['jobKind', 'corpus.extract_obligations']])).read())
      .toEqual(['Compliance analysis', 'Obligation extraction']);
  });


  it('humanises a value the table does not know instead of showing it raw', () => {
    expect(renderHookText(labels([['jobKind', 'new_kind'], ['severity', 'extra.high_risk'], ['nosuchgroup', 'x']])).read())
      .toEqual(['New kind', 'Extra high risk', 'X']);
  });


  it('does not hand back a subtree for a value that names a group node', () => {
    expect(renderHookText(labels([['jobKind', 'report']])).read()).toEqual(['Report']);
  });


  it('shows "—" for null, undefined and the empty string', () => {
    expect(renderHookText(labels([['severity', null], ['severity', undefined], ['severity', '']])).read()).toEqual(['—', '—', '—']);
  });


  it('speaks Lithuanian when the locale says so', () => {
    document.cookie = 'locale=lt; path=/';
    expect(renderHookText(labels([['findingStatus', 'unknown'], ['jobKind', 'ops.maintenance']])).read())
      .toEqual(['Neįrodyta', 'Sistemos priežiūra']);
  });
});







// -----------------------------------------------------------
// useJobText
// -----------------------------------------------------------

describe('useJobText', () => {

  const subjects = (values) => () => {
    const text = useJobText();
    return values.map((v) => text.subject(v));
  };

  const progresses = (values) => () => {
    const text = useJobText();
    return values.map((v) => text.progress(v));
  };


  it('turns a report / act / obligations subject into a label with a link to its page', () => {
    const id = '0c0a0000-0000-4000-8000-00000000abcd';
    expect(renderHookText(subjects([`report:${id}`, `corpus:${id}`, `obligations:${id}`])).read()).toEqual([
      { label: 'Report · 0c0a0000', to: `/reports/${id}` },
      { label: 'Legal act · 0c0a0000', to: `/corpus/${id}` },
      { label: 'Obligations of an act · 0c0a0000', to: `/corpus/${id}?tab=obligations` },
    ]);
  });


  it('the check of an act\'s obligations leads to that act\'s obligations too', () => {
    const id = '0c0a0000-0000-4000-8000-00000000abcd';
    expect(renderHookText(subjects([`verification:${id}`])).read()).toEqual([
      { label: 'Obligation check of an act · 0c0a0000', to: `/corpus/${id}?tab=obligations` },
    ]);
  });


  it('the generation of a work product leads to that product\'s page', () => {
    const id = '0c0a0000-0000-4000-8000-00000000abcd';
    expect(renderHookText(subjects([`product:${id}`])).read()).toEqual([
      { label: 'Programme document · 0c0a0000', to: `/programme/${id}` },
    ]);
  });


  it('names the steps of that generation in words', () => {
    expect(renderHookText(progresses([{ step: 'process_raci', percent: 50, message: null }])).read()).toEqual(['Process and RACI (50%)']);
  });


  it('says the progress of that check in words', () => {
    expect(renderHookText(progresses([{ step: 'verify', percent: 50, message: '2/4 batches' }])).read()).toEqual(['Checking — 2 of 4 batches (50%)']);
  });


  it('puts the subject\'s own name in place of its id when it is given one — and keeps the id for a name that is none', () => {
    const id = '0c0a0000-0000-4000-8000-00000000abcd';
    const named = (pairs) => () => {
      const text = useJobText();
      return pairs.map(([subject, title]) => text.subject(subject, title));
    };
    expect(renderHookText(named([[`obligations:${id}`, 'MiCA'], [`corpus:${id}`, '  DORA '], [`corpus:${id}`, ''], [`corpus:${id}`, '   '],
                                 [`report:${id}`, null], [`report:${id}`, 7], ['corpus:reembed', 'MiCA'], ['plain', 'Named']])).read()).toEqual([
      { label: 'Obligations of an act · MiCA', to: `/corpus/${id}?tab=obligations` },
      { label: 'Legal act · DORA', to: `/corpus/${id}` },
      { label: 'Legal act · 0c0a0000', to: `/corpus/${id}` },
      { label: 'Legal act · 0c0a0000', to: `/corpus/${id}` },
      { label: 'Report · 0c0a0000', to: `/reports/${id}` },
      { label: 'Report · 0c0a0000', to: `/reports/${id}` },
      { label: 'All legal acts', to: '/corpus' },
      { label: 'plain · Named', to: null },
    ]);
  });


  it('names the corpus-wide jobs and the scheduled ones', () => {
    expect(renderHookText(subjects(['corpus:reembed', 'corpus:refresh-all', 'schedule:ops.maintenance'])).read()).toEqual([
      { label: 'All legal acts', to: '/corpus' },
      { label: 'All sources', to: '/corpus' },
      { label: 'Scheduled job: Maintenance', to: null },
    ]);
  });


  it('labels a subject without a page, and an unknown prefix, without a link', () => {
    expect(renderHookText(subjects(['document:d1d1d1d1d1', 'mystery:1234567890', 'plain', '', null])).read()).toEqual([
      { label: 'Company document · d1d1d1d1', to: null },
      { label: 'mystery · 12345678', to: null },
      { label: 'plain', to: null },
      { label: '', to: null },
      { label: '', to: null },
    ]);
  });


  it('translates the worker\'s known progress messages and keeps an unknown one as data', () => {
    expect(renderHookText(progresses([
      { step: 'gap_analysis', percent: 30, message: '3/10 batches' },
      { step: 'obligations', message: 'extracting MiCA' },
      { step: 'internal', message: 'reading Atitikties politika' },
      { step: 'obligations', message: 'reading sanction provisions' },
      { message: '42 obligations' },
      { step: 'embed' },
      { step: 'parse', message: 'Straipsnis 5 of 120', percent: 0 },
      { step: 'brand_new_step' },
    ])).read()).toEqual([
      'Gap analysis — 3 of 10 batches (30%)',
      'Obligation selection — extracting obligations: MiCA',
      // Only the step of the company's own requirements names a document it reads
      'Assessing the company\'s own requirements — reading the document: Atitikties politika',
      'Obligation selection — reading sanction provisions',
      'obligations: 42',
      'Embedding',
      'Structure parsing — Straipsnis 5 of 120 (0%)',
      'Brand new step',
    ]);
  });


  it('answers nothing for a job without progress', () => {
    expect(renderHookText(progresses([null, undefined, {}, { percent: null }])).read()).toEqual(['', '', '', '']);
  });


  it('follows a language switch', async () => {
    function Probe() {
      const text = useJobText();
      const setLocale = useSetLocale();
      return (
        <>
          <p data-testid="p">{text.progress({ step: 'gap_analysis', percent: 30, message: '3/10 batches' })}</p>
          <button onClick={() => setLocale('lt')}>lt</button>
        </>
      );
    }
    render(<IntlProvider><Probe /></IntlProvider>);
    expect(screen.getByTestId('p')).toHaveTextContent('Gap analysis — 3 of 10 batches (30%)');
    await act(async () => { screen.getByText('lt').click(); });
    expect(screen.getByTestId('p').textContent).toBe('Atitikties spragų analizė — 3 iš 10 paketų (30 %)');
  });
});







// -----------------------------------------------------------
// useUnsavedChanges
// -----------------------------------------------------------

function Editor() {
  const [params, setParams] = useSearchParams();
  const dirty = params.get('dirty') === '1';
  const blocker = useUnsavedChanges(dirty);
  return (
    <div>
      <p data-testid="state">{blocker.state}</p>
      <button onClick={() => setParams({ dirty: '1' })}>make dirty</button>
      <button onClick={() => setParams({ dirty: '1', tab: 'b' })}>switch tab</button>
      <Link to="/elsewhere">leave</Link>
      {blocker.state === 'blocked' && (
        <>
          <button onClick={() => blocker.proceed()}>discard</button>
          <button onClick={() => blocker.reset()}>stay</button>
        </>
      )}
    </div>
  );
}

const mountEditor = (entry = '/edit') => {
  const router = createMemoryRouter([
    { path: '/edit', element: <Editor /> },
    { path: '/elsewhere', element: <p>elsewhere page</p> },
  ], { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
  return router;
};


describe('useUnsavedChanges', () => {

  it('lets a clean form leave freely', async () => {
    mountEditor();
    await act(async () => { screen.getByText('leave').click(); });
    expect(screen.getByText('elsewhere page')).toBeInTheDocument();
  });


  it('holds a dirty form at the router door — stay keeps it, discard leaves', async () => {
    const router = mountEditor('/edit?dirty=1');
    await act(async () => { screen.getByText('leave').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('blocked');
    await act(async () => { screen.getByText('stay').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('unblocked');
    expect(router.state.location.pathname).toBe('/edit');
    await act(async () => { screen.getByText('leave').click(); });
    await act(async () => { screen.getByText('discard').click(); });
    expect(screen.getByText('elsewhere page')).toBeInTheDocument();
  });


  it('lets a same-path move (a tab switch in the query) pass while dirty', async () => {
    const router = mountEditor('/edit?dirty=1');
    await act(async () => { screen.getByText('switch tab').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('unblocked');
    expect(router.state.location.search).toBe('?dirty=1&tab=b');
  });


  it('asks the browser to confirm a reload or close only while dirty', async () => {
    mountEditor();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await act(async () => { screen.getByText('make dirty').click(); });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });


  it('drops the browser prompt when the form unmounts', async () => {
    const router = mountEditor('/edit?dirty=1');
    await act(async () => { screen.getByText('leave').click(); });
    await act(async () => { screen.getByText('discard').click(); });
    expect(router.state.location.pathname).toBe('/elsewhere');
    const event = new Event('beforeunload', { cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
