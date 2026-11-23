// -----------------------------------------------------------
//  [*] Tests — TriStateField (yes / no / unknown)
//
//  The company flags are tri-state on the wire — true /
//  false / null, where null means "nobody said". Pinned
//  here: a group named by its label with three toggle
//  buttons whose PRESSED state is announced (aria-pressed —
//  never colour alone); the wire value pressing the matching
//  button (anything that is not a boolean reads as unknown);
//  each click reporting its wire value exactly once, a click
//  on the pressed button reporting nothing; a controlled
//  parent cycling through all three; disabled; the helper
//  text describing the group; the keyboard; both languages.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import { renderPage } from '../support/render';
import { useSetLocale } from '@/i18n';
import TriStateField from '@/components/TriStateField/TriStateField';


// The pressed button's text in a group
const pressed = (group) => within(group).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

// A parent holding the wire value, showing it as JSON
function Controlled({ initial = null, onChange = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TriStateField label="Uses AI" value={value} onChange={(next) => { onChange(next); setValue(next); }} />
      <output data-testid="wire">{JSON.stringify(value)}</output>
    </>
  );
}







// -----------------------------------------------------------
// Structure
// -----------------------------------------------------------

describe('TriStateField structure', () => {

  it('is a group named by its label, holding Yes, No and Unknown as toggle buttons', () => {
    renderPage(<TriStateField label="Uses AI" value={null} onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Uses AI' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Yes', 'No', 'Unknown']);
    for (const button of buttons) expect(button).toHaveAttribute('aria-pressed');
  });


  it.each([
    [true, 'Yes'], [false, 'No'], [null, 'Unknown'], [undefined, 'Unknown'], ['true', 'Unknown'], [1, 'Unknown'], [0, 'Unknown'],
  ])('the wire value %j presses %s, and only it', (value, expected) => {
    renderPage(<TriStateField label="Uses AI" value={value} onChange={() => {}} />);
    expect(pressed(screen.getByRole('group', { name: 'Uses AI' }))).toEqual([expected]);
  });


  it('keeps two fields on one page apart — each group its own name', () => {
    renderPage(
      <>
        <TriStateField label="Uses AI" value onChange={() => {}} />
        <TriStateField label="Provides AI" value={false} onChange={() => {}} />
      </>,
    );
    expect(pressed(screen.getByRole('group', { name: 'Uses AI' }))).toEqual(['Yes']);
    expect(pressed(screen.getByRole('group', { name: 'Provides AI' }))).toEqual(['No']);
  });


  it('describes the group with its helper text', () => {
    renderPage(<TriStateField label="Public sector" value={null} onChange={() => {}} helperText="Unknown keeps the public-sector acts in the analysis." />);
    const group = screen.getByRole('group', { name: 'Public sector' });
    expect(group).toHaveAccessibleDescription('Unknown keeps the public-sector acts in the analysis.');
  });


  it('has no description and no helper line without helper text', () => {
    renderPage(<TriStateField label="Public sector" value={null} onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Public sector' });
    expect(group).not.toHaveAttribute('aria-describedby');
    expect(group.querySelectorAll('.MuiTypography-caption')).toHaveLength(0);
  });


  it('renders a unicode label whole', () => {
    renderPage(<TriStateField label="Tvarko asmens duomenis 💾" value={null} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Tvarko asmens duomenis 💾' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Changes
// -----------------------------------------------------------

describe('TriStateField changes', () => {

  it.each([
    ['Yes', null, true], ['No', null, false], ['Unknown', true, null], ['No', true, false], ['Yes', false, true],
  ])('clicking %s (from %j) reports %j exactly once', async (button, from, expected) => {
    const onChange = vi.fn();
    const { user } = renderPage(<TriStateField label="Uses AI" value={from} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: button }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expected);
  });


  it('clicking the pressed button again reports nothing — the value stays', async () => {
    const onChange = vi.fn();
    const { user } = renderPage(
      <>
        <TriStateField label="Uses AI" value onChange={onChange} />
        <TriStateField label="Provides AI" value={null} onChange={onChange} />
      </>,
    );
    await user.click(within(screen.getByRole('group', { name: 'Uses AI' })).getByRole('button', { name: 'Yes' }));
    await user.click(within(screen.getByRole('group', { name: 'Provides AI' })).getByRole('button', { name: 'Unknown' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(pressed(screen.getByRole('group', { name: 'Uses AI' }))).toEqual(['Yes']);
  });


  it('a controlled parent cycles through true → false → null → true', async () => {
    const onChange = vi.fn();
    const { user } = renderPage(<Controlled initial onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Uses AI' });
    expect(screen.getByTestId('wire')).toHaveTextContent('true');

    await user.click(within(group).getByRole('button', { name: 'No' }));
    expect(screen.getByTestId('wire')).toHaveTextContent('false');
    expect(pressed(group)).toEqual(['No']);

    await user.click(within(group).getByRole('button', { name: 'Unknown' }));
    expect(screen.getByTestId('wire')).toHaveTextContent('null');
    expect(pressed(group)).toEqual(['Unknown']);

    await user.click(within(group).getByRole('button', { name: 'Yes' }));
    expect(screen.getByTestId('wire')).toHaveTextContent('true');
    expect(onChange.mock.calls).toEqual([[false], [null], [true]]);
  });


  it('without a parent update the pressed button does not move on its own (fully controlled)', async () => {
    const { user } = renderPage(<TriStateField label="Uses AI" value={false} onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(pressed(screen.getByRole('group', { name: 'Uses AI' }))).toEqual(['No']);
  });


  it('disabled: every button is disabled and clicks report nothing', async () => {
    const onChange = vi.fn();
    const { user } = renderPage(<TriStateField label="Uses AI" value onChange={onChange} disabled />);
    const buttons = within(screen.getByRole('group', { name: 'Uses AI' })).getAllByRole('button');
    for (const button of buttons) expect(button).toBeDisabled();
    await user.click(buttons[1]);
    expect(onChange).not.toHaveBeenCalled();
    // the value still shows
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });


  it('works from the keyboard: each button a tab stop, Space and Enter choose', async () => {
    const { user } = renderPage(<Controlled initial={null} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByTestId('wire')).toHaveTextContent('true');
    await user.tab();
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('wire')).toHaveTextContent('false');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Unknown' })).toHaveFocus();
  });
});







// -----------------------------------------------------------
// Languages
// -----------------------------------------------------------

describe('TriStateField languages', () => {

  it('speaks Lithuanian: Taip, Ne, Nežinoma', () => {
    renderPage(<TriStateField label="Naudoja DI" value={false} onChange={() => {}} />, { locale: 'lt' });
    const group = screen.getByRole('group', { name: 'Naudoja DI' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Taip', 'Ne', 'Nežinoma']);
    expect(pressed(group)).toEqual(['Ne']);
  });


  it('follows a live switch without losing the pressed state', async () => {
    function Frame() {
      const setLocale = useSetLocale();
      return (
        <>
          <button type="button" onClick={() => setLocale('lt')}>to lt</button>
          <TriStateField label="Uses AI" value={null} onChange={() => {}} />
        </>
      );
    }
    const { user } = renderPage(<Frame />);
    await user.click(screen.getByRole('button', { name: 'to lt' }));
    expect(pressed(screen.getByRole('group', { name: 'Uses AI' }))).toEqual(['Nežinoma']);
  });
});
