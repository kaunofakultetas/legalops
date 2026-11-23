// -----------------------------------------------------------
//  [*] Tests — view state that survives coming back
//
//  The helpers the pages keep their view with:
//
//    - utils/viewParams.js: oneOf, listOf, listParam, idParam
//      and paramName — whatever the address holds, only known
//      values come out
//    - hooks/useViewParams.js: a write replaces the entry,
//      keeps every other parameter (the hash and the state
//      too), removes a cleared one, navigates nowhere when
//      nothing changes, and two writes in one moment compose
//    - hooks/useDraftText.js: the typing reaches the address
//      after a pause, trimmed; the field's own commit landing
//      leaves what was typed meanwhile, an outside change (a
//      clear button, Back) replaces the draft
//    - utils/sessionStore.js + hooks/useSessionState.js: a
//      value outlives its component, defaults write nothing,
//      a refused or unreadable value reads as the default,
//      another key reads its own, at most 60 values are kept,
//      and a storage that throws breaks nothing
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import useDraftText from '@/hooks/useDraftText';
import useSessionState from '@/hooks/useSessionState';
import useViewParams from '@/hooks/useViewParams';
import { readSession, writeSession } from '@/utils/sessionStore';
import { idParam, listOf, listParam, oneOf, paramName } from '@/utils/viewParams';







// -----------------------------------------------------------
// Probes
// -----------------------------------------------------------
//
// ViewProbe writes what its buttons say and shows the query;
// DraftProbe is a search box on ?q=; SessionProbe a counter
// kept under `name`. mount() puts a probe on a memory router
// at `entry` and counts the navigations.
// -----------------------------------------------------------

function ViewProbe() {
  const [params, setView] = useViewParams();
  return (
    <>
      <p data-testid="query">{params.toString()}</p>
      <button type="button" onClick={() => setView({ status: 'failed' })}>status</button>
      <button type="button" onClick={() => setView({ q: null, tab: '' })}>clear</button>
      <button type="button" onClick={() => setView({ tab: 'a' })}>same</button>
      <button type="button" onClick={() => { setView({ sort: 'name.desc' }); setView({ page: null }); }}>sort</button>
    </>
  );
}

function DraftProbe() {
  const [params, setView] = useViewParams();
  const q = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useDraftText(q, (text) => setView({ q: text }));
  return (
    <>
      <label>Search<input value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      <button type="button" onClick={() => setView({ q: null })}>clear filters</button>
    </>
  );
}

function SessionProbe({ name }) {
  const [count, setCount] = useSessionState(name, 0, Number.isInteger);
  return <button type="button" onClick={() => setCount((n) => n + 1)}>{`count ${count}`}</button>;
}

function mount(element, entry = '/p') {
  const router = createMemoryRouter([{ path: '/p', element }], { initialEntries: [entry] });
  const navigations = [];
  router.subscribe((state) => navigations.push(state.historyAction));
  render(<RouterProvider router={router} />);
  return { router, navigations, user: userEvent.setup() };
}







// -----------------------------------------------------------
// viewParams
// -----------------------------------------------------------

describe('viewParams — only known values come out of the address', () => {

  it('oneOf answers a listed value, else the fallback', () => {
    expect(oneOf('failed', ['queued', 'failed'])).toBe('failed');
    expect(oneOf('bogus', ['queued', 'failed'])).toBe('');
    expect(oneOf(null, ['category'], 'act')).toBe('act');
    expect(oneOf('toString', ['category'], 'act')).toBe('act');
  });


  it('listOf keeps the known values of a comma list, each once; listParam writes it back', () => {
    expect(listOf('missing,partial,bogus,missing', ['missing', 'partial', 'met'])).toEqual(['missing', 'partial']);
    expect(listOf('', ['met'])).toEqual([]);
    expect(listOf(null, ['met'])).toEqual([]);
    expect(listParam(['missing', 'partial'])).toBe('missing,partial');
    expect(listParam([])).toBeNull();
  });


  it('idParam passes id-shaped values only — nothing that could walk an API path', () => {
    expect(idParam('1c2d3e4f-0000-4000-8000-000000000001')).toBe('1c2d3e4f-0000-4000-8000-000000000001');
    expect(idParam('report.summary')).toBe('report.summary');
    for (const bad of ['../admin', 'a b', 'x?y=1', '', 'a'.repeat(101), null, 42]) expect(idParam(bad)).toBeNull();
  });


  it('paramName prefixes a part\'s names', () => {
    expect(paramName('', 'page')).toBe('page');
    expect(paramName('documents', 'page')).toBe('documents.page');
  });
});







// -----------------------------------------------------------
// useViewParams
// -----------------------------------------------------------

describe('useViewParams — a view in the address', () => {

  it('a write replaces the entry and keeps every other parameter; a cleared one goes', async () => {
    const { router, user } = mount(<ViewProbe />, '/p?tab=a&q=x');
    await user.click(screen.getByRole('button', { name: 'status' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=a&q=x&status=failed'));
    expect(router.state.historyAction).toBe('REPLACE');
    await user.click(screen.getByRole('button', { name: 'clear' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=failed'));
  });


  it('keeps the hash and the location state, and navigates nowhere when nothing changes', async () => {
    const { router, navigations, user } = mount(<ViewProbe />, { pathname: '/p', search: '?tab=a', hash: '#top', state: { returning: true } });
    await user.click(screen.getByRole('button', { name: 'same' }));
    expect(navigations).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'status' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=a&status=failed'));
    expect(router.state.location.hash).toBe('#top');
    expect(router.state.location.state).toEqual({ returning: true });
  });


  it('two writes in one moment compose — a sort, and the page reset the grid follows it with', async () => {
    const { router, user } = mount(<ViewProbe />, '/p?page=3&q=x');
    await user.click(screen.getByRole('button', { name: 'sort' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=x&sort=name.desc'));
  });
});







// -----------------------------------------------------------
// useDraftText
// -----------------------------------------------------------

describe('useDraftText — a search box on the address', () => {

  it('starts from the address and commits the typing after a pause, trimmed', async () => {
    const { router, user } = mount(<DraftProbe />, '/p?q=abc');
    const box = screen.getByRole('textbox', { name: 'Search' });
    expect(box).toHaveValue('abc');
    await user.clear(box);
    await user.type(box, '  MiCA ');
    expect(router.state.location.search).toBe('?q=abc');
    await waitFor(() => expect(router.state.location.search).toBe('?q=MiCA'));
    expect(box).toHaveValue('  MiCA ');
  });


  it('its own commit landing leaves what was typed meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { router } = mount(<DraftProbe />);
    const box = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(box, { target: { value: 'aml' } });
    // the pause ends (the commit goes) and the user types on
    // before the new address has rendered
    act(() => {
      vi.advanceTimersByTime(300);
      fireEvent.change(box, { target: { value: 'aml risk' } });
    });
    expect(router.state.location.search).toBe('?q=aml');
    expect(box).toHaveValue('aml risk');
    act(() => { vi.advanceTimersByTime(300); });
    await act(async () => {});
    expect(router.state.location.search).toBe('?q=aml+risk');
    expect(box).toHaveValue('aml risk');
  });


  it('an outside change — a "clear filters" button, Back to another search — replaces the draft', async () => {
    const { router, user } = mount(<DraftProbe />);
    const box = screen.getByRole('textbox', { name: 'Search' });
    await user.type(box, 'aml');
    await waitFor(() => expect(router.state.location.search).toBe('?q=aml'));
    await user.click(screen.getByRole('button', { name: 'clear filters' }));
    await waitFor(() => expect(box).toHaveValue(''));
    expect(router.state.location.search).toBe('');

    await act(async () => { await router.navigate('/p?q=kyc', { replace: true }); });
    await waitFor(() => expect(box).toHaveValue('kyc'));
  });
});







// -----------------------------------------------------------
// sessionStore / useSessionState
// -----------------------------------------------------------

describe('useSessionState — ephemeral view state kept for the tab', () => {

  it('a value outlives its component; the default writes nothing', async () => {
    const user = userEvent.setup();
    const first = render(<SessionProbe name="probe.count" />);
    expect(sessionStorage.getItem('view.probe.count')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'count 0' }));
    await user.click(screen.getByRole('button', { name: 'count 1' }));
    first.unmount();
    render(<SessionProbe name="probe.count" />);
    expect(screen.getByRole('button', { name: 'count 2' })).toBeInTheDocument();
  });


  it('a stored value the check refuses, or no JSON at all, reads as the default', () => {
    sessionStorage.setItem('view.probe.a', JSON.stringify('three'));
    sessionStorage.setItem('view.probe.b', '{ not json');
    render(<><SessionProbe name="probe.a" /><SessionProbe name="probe.b" /></>);
    expect(screen.getAllByRole('button', { name: 'count 0' })).toHaveLength(2);
  });


  it('another key — the same component on another report — reads its own value', async () => {
    writeSession('probe.r1', 5);
    writeSession('probe.r2', 9);
    function Switcher() {
      const [name, setName] = useState('probe.r1');
      return <><button type="button" onClick={() => setName('probe.r2')}>other</button><SessionProbe name={name} /></>;
    }
    const user = userEvent.setup();
    render(<Switcher />);
    expect(screen.getByRole('button', { name: 'count 5' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'other' }));
    expect(screen.getByRole('button', { name: 'count 9' })).toBeInTheDocument();
  });


  it('keeps at most 60 values, the least recently written dropped first', () => {
    for (let i = 0; i < 65; i += 1) writeSession(`probe.${i}`, i);
    expect(readSession('probe.4', null)).toBeNull();
    expect(readSession('probe.5', null)).toBe(5);
    expect(readSession('probe.64', null)).toBe(64);
    writeSession('probe.5', 50);
    writeSession('probe.65', 65);
    expect(readSession('probe.5', null)).toBe(50);
    expect(readSession('probe.6', null)).toBeNull();
  });


  it('a storage that throws keeps nothing and breaks nothing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const user = userEvent.setup();
    render(<SessionProbe name="probe.count" />);
    await user.click(screen.getByRole('button', { name: 'count 0' }));
    expect(screen.getByRole('button', { name: 'count 1' })).toBeInTheDocument();
    expect(readSession('probe.count', 'fallback')).toBe('fallback');
  });
});
