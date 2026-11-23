// -----------------------------------------------------------
//  [*] Tests — NavDrawer (the phone navigation's open flag)
//
//  The context the navbar's menu button and the sidebar's
//  drawer share: closed by default, toggle and setOpen, one
//  state for every consumer under the provider, the stable
//  toggle and value identities the consumers' effects rely
//  on, and the inert defaults for a bar rendered outside the
//  provider (the menu button then simply does nothing).
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NavDrawerProvider, useNavDrawer } from '@/components/layout/NavDrawer';


// A consumer showing the flag, with a button per operation;
// `seen` collects the context value of every render
function Consumer({ name, seen = [] }) {
  const drawer = useNavDrawer();
  seen.push(drawer);
  return (
    <div>
      <p data-testid={`${name}-state`}>{drawer.open ? 'open' : 'closed'}</p>
      <button type="button" onClick={drawer.toggle}>{`${name} toggle`}</button>
      <button type="button" onClick={() => drawer.setOpen(true)}>{`${name} open`}</button>
      <button type="button" onClick={() => drawer.setOpen(false)}>{`${name} close`}</button>
    </div>
  );
}

const click = (name) => act(() => { screen.getByRole('button', { name }).click(); });







// -----------------------------------------------------------
// NavDrawerProvider + useNavDrawer
// -----------------------------------------------------------

describe('NavDrawer', () => {

  it('starts closed; toggle flips it, setOpen sets it', () => {
    render(<NavDrawerProvider><Consumer name="a" /></NavDrawerProvider>);
    expect(screen.getByTestId('a-state')).toHaveTextContent('closed');
    click('a toggle');
    expect(screen.getByTestId('a-state')).toHaveTextContent('open');
    click('a toggle');
    expect(screen.getByTestId('a-state')).toHaveTextContent('closed');
    click('a open');
    click('a open');
    expect(screen.getByTestId('a-state')).toHaveTextContent('open');
    click('a close');
    expect(screen.getByTestId('a-state')).toHaveTextContent('closed');
  });


  it('shares one flag between every consumer — the menu button opens the sidebar\'s drawer', () => {
    render(
      <NavDrawerProvider>
        <Consumer name="navbar" />
        <Consumer name="sidebar" />
      </NavDrawerProvider>,
    );
    click('navbar toggle');
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
    click('sidebar close');
    expect(screen.getByTestId('navbar-state')).toHaveTextContent('closed');
  });


  it('keeps toggle and setOpen stable, and the value itself while the flag does not change', () => {
    const seen = [];
    const { rerender } = render(<NavDrawerProvider><Consumer name="a" seen={seen} /></NavDrawerProvider>);
    rerender(<NavDrawerProvider><Consumer name="a" seen={seen} /></NavDrawerProvider>);
    expect(seen[1]).toBe(seen[0]);

    click('a toggle');
    const afterToggle = seen.at(-1);
    expect(afterToggle).not.toBe(seen[0]);
    expect(afterToggle.toggle).toBe(seen[0].toggle);
    expect(afterToggle.setOpen).toBe(seen[0].setOpen);
  });


  it('two providers keep two independent flags', () => {
    render(
      <>
        <NavDrawerProvider><Consumer name="first" /></NavDrawerProvider>
        <NavDrawerProvider><Consumer name="second" /></NavDrawerProvider>
      </>,
    );
    click('first toggle');
    expect(screen.getByTestId('first-state')).toHaveTextContent('open');
    expect(screen.getByTestId('second-state')).toHaveTextContent('closed');
  });


  it('outside a provider it reads closed and every operation is a harmless no-op', () => {
    render(<Consumer name="bare" />);
    expect(screen.getByTestId('bare-state')).toHaveTextContent('closed');
    click('bare toggle');
    click('bare open');
    expect(screen.getByTestId('bare-state')).toHaveTextContent('closed');
  });
});
