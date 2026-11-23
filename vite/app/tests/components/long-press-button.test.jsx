// -----------------------------------------------------------
//  [*] Tests — LongPressButton (hold-to-confirm state machine)
//
//  Ported with the component from the Tracer system.
//
//  Every way a hold starts, completes or dies: the pointer
//  hold that fires onComplete exactly once at `duration`, the
//  early release (with the toast when a message is given),
//  the pointer sliding off, a cancelled pointer, the window
//  blurring, the tab hiding, the button turning disabled
//  mid-hold, non-primary buttons and second pointers being
//  ignored, the pointer capture and its release, an unmount
//  mid-hold; the keyboard hold on Space/Enter with keyup, blur
//  and auto-repeat; the progress ring and pressedContent; the
//  aria-describedby hint in both locales; the tooltip wrapper
//  around a disabled button; the LongPressDeleteButton
//  preset; and the phone: a cancelled pointer ending the hold
//  quietly, the left-to-right fill of a held button.
//
//  Holds run under fake timers (Date.now and the animation
//  frame loop must advance together); the DOM is read
//  synchronously after each act(), so nothing awaits the
//  real clock.
// -----------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderPage, nodeText } from '../support/render';
import { mediaQueryMatches } from '../support/setup';
import LongPressButton, { LongPressDeleteButton } from '@/components/LongPressButton/LongPressButton';


const TIMER_APIS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'];







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// The clock, the pointer/keyboard gestures, and the two
// witnesses of a hold: the progress ring (two determinate
// progressbars) replaces the label while pressed.
// -----------------------------------------------------------

const tick = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

const press = (button, extra = {}) => fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1, ...extra });
const release = (button, extra = {}) => fireEvent.pointerUp(button, { pointerId: 1, ...extra });

const isHeld = () => screen.queryAllByRole('progressbar').length === 2;

const ringValue = () => Number(screen.getAllByRole('progressbar')[1].getAttribute('aria-valuenow'));

const hintOf = (button) => document.getElementById(button.getAttribute('aria-describedby'));


let errorToast;

beforeEach(() => {
  errorToast = vi.spyOn(toast, 'error');
  vi.useFakeTimers({ toFake: TIMER_APIS });
});

afterEach(() => {
  vi.useRealTimers();
});







// -----------------------------------------------------------
// Rendering
// -----------------------------------------------------------

describe('LongPressButton rendering', () => {

  it('shows its children, no ring, and a hidden hint the button is described by', () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(isHeld()).toBe(false);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(hintOf(button)).toHaveTextContent('Hold for 2 seconds to confirm');
    expect(hintOf(button)).toHaveClass('sr-only');
    expect(button).toHaveAccessibleDescription('Hold for 2 seconds to confirm');
  });


  it('the hint follows the duration, to a tenth of a second', () => {
    const { unmount } = renderPage(<LongPressButton onComplete={() => {}} duration={1000}>A</LongPressButton>);
    expect(hintOf(screen.getByRole('button'))).toHaveTextContent('Hold for 1 seconds to confirm');
    unmount();
    renderPage(<LongPressButton onComplete={() => {}} duration={1500}>B</LongPressButton>);
    expect(hintOf(screen.getByRole('button'))).toHaveTextContent('Hold for 1.5 seconds to confirm');
  });


  it('the hint is Lithuanian under the lt locale', () => {
    renderPage(<LongPressButton onComplete={() => {}}>Trinti</LongPressButton>, { locale: 'lt' });
    expect(hintOf(screen.getByRole('button'))).toHaveTextContent('Laikykite 2 sek., kad patvirtintumėte');
  });


  it('is a red contained button by default and takes another colour, variant and size', () => {
    const { unmount } = renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    // the colour has no accessible handle — MUI's colour class is the witness
    expect(screen.getByRole('button')).toHaveClass('MuiButton-colorError', 'MuiButton-contained', 'MuiButton-sizeMedium');
    unmount();
    renderPage(<LongPressButton onComplete={() => {}} color="primary" variant="outlined" size="small" fullWidth>Promote</LongPressButton>);
    expect(screen.getByRole('button')).toHaveClass('MuiButton-colorPrimary', 'MuiButton-outlined', 'MuiButton-sizeSmall', 'MuiButton-fullWidth');
  });


  it('suppresses the context menu a touch hold would open', () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    // fireEvent returns false when the handler prevented the default
    expect(fireEvent.contextMenu(screen.getByRole('button'))).toBe(false);
  });


  it('passes extra props to the button (aria-label, onClick)', () => {
    const onClick = vi.fn();
    renderPage(<LongPressButton onComplete={() => {}} aria-label="Remove row" onClick={onClick}><span>x</span></LongPressButton>);
    const button = screen.getByRole('button', { name: 'Remove row' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});







// -----------------------------------------------------------
// Pointer holds
// -----------------------------------------------------------

describe('LongPressButton pointer hold', () => {

  it('shows the ring while held, completes once the duration elapses and fires onComplete exactly once', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button', { name: 'Delete' });

    press(button);
    expect(isHeld()).toBe(true);
    expect(screen.queryByText('Delete')).toBeNull();

    await tick(1000);
    expect(ringValue()).toBeGreaterThan(40);
    expect(ringValue()).toBeLessThan(60);
    await tick(900);
    expect(onComplete).not.toHaveBeenCalled();
    expect(isHeld()).toBe(true);

    await tick(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(isHeld()).toBe(false);
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(errorToast).not.toHaveBeenCalled();

    // nothing more happens without a new press
    await tick(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });


  it('honours a custom duration', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} duration={500}>Go</LongPressButton>);
    press(screen.getByRole('button'));
    await tick(400);
    expect(onComplete).not.toHaveBeenCalled();
    await tick(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });


  it('pressedContent replaces the ring while held', async () => {
    renderPage(<LongPressButton onComplete={() => {}} pressedContent={<span>Holding…</span>}>Delete</LongPressButton>);
    press(screen.getByRole('button'));
    expect(screen.getByText('Holding…')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    release(screen.getByRole('button'));
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });


  it('releasing early cancels and toasts the message for as long as it takes to read — an error\'s four seconds at least', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} uncompletedToastMessage="Hold 2 seconds to delete">Delete</LongPressButton>);
    const button = screen.getByRole('button', { name: 'Delete' });
    press(button);
    await tick(500);
    release(button);
    expect(isHeld()).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
    expect(nodeText(errorToast.mock.calls[0][0])).toBe('Hold 2 seconds to delete');
    expect(errorToast.mock.calls[0][1]).toEqual({ duration: 4000 });
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('releasing early without a message toasts nothing', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    await tick(500);
    release(button);
    expect(isHeld()).toBe(false);
    expect(errorToast).not.toHaveBeenCalled();
  });


  it('the pointer sliding off the button cancels; moving within it does not', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} uncompletedToastMessage="Hold!">Delete</LongPressButton>);
    const button = screen.getByRole('button');
    // jsdom has no layout — give the button a real box
    button.getBoundingClientRect = () => ({ left: 10, top: 10, right: 110, bottom: 50, width: 100, height: 40 });

    press(button);
    await tick(300);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 60, clientY: 30 });
    expect(isHeld()).toBe(true);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 150, clientY: 30 });
    expect(isHeld()).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a move of another pointer is ignored', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    button.getBoundingClientRect = () => ({ left: 10, top: 10, right: 110, bottom: 50, width: 100, height: 40 });
    press(button);
    fireEvent.pointerMove(button, { pointerId: 2, clientX: 500, clientY: 500 });
    expect(isHeld()).toBe(true);
  });


  it('a cancelled pointer (system gesture) cancels the hold', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} uncompletedToastMessage="Hold!">Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    await tick(300);
    fireEvent.pointerCancel(button, { pointerId: 1 });
    expect(isHeld()).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('the pointer leaving the button (no capture) cancels the hold', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    fireEvent.pointerLeave(button, { pointerId: 1 });
    expect(isHeld()).toBe(false);
  });


  it('the window losing focus cancels the hold', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} uncompletedToastMessage="Hold!">Delete</LongPressButton>);
    press(screen.getByRole('button'));
    await tick(300);
    fireEvent.blur(window);
    expect(isHeld()).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('the tab being hidden cancels the hold', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    press(screen.getByRole('button'));
    await tick(300);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    hidden.mockRestore();
    expect(isHeld()).toBe(false);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a visibility change that leaves the tab visible does not cancel', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    press(screen.getByRole('button'));
    fireEvent(document, new Event('visibilitychange'));
    expect(isHeld()).toBe(true);
  });


  it('becoming disabled mid-hold cancels it', async () => {
    const onComplete = vi.fn();
    // The same mounted button turning disabled (a request went
    // in flight) — a stateful host, so the prop changes in place
    function Host() {
      const [disabled, setDisabled] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setDisabled(true)}>disable</button>
          <LongPressButton onComplete={onComplete} disabled={disabled} uncompletedToastMessage="Hold!">Delete</LongPressButton>
        </>
      );
    }
    renderPage(<Host />);
    press(screen.getByRole('button', { name: 'Delete' }));
    await tick(500);
    expect(isHeld()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'disable' }));
    await tick(50);
    expect(isHeld()).toBe(false);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(errorToast).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a disabled button starts no hold', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} disabled>Delete</LongPressButton>);
    press(screen.getByRole('button'));
    expect(isHeld()).toBe(false);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a right or middle button, or a non-primary pointer, starts nothing', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button, { button: 2 });
    expect(isHeld()).toBe(false);
    press(button, { button: 1 });
    expect(isHeld()).toBe(false);
    press(button, { isPrimary: false, pointerId: 2 });
    expect(isHeld()).toBe(false);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a second pointer during the hold is ignored, its release too, and the first still completes once', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    await tick(500);
    press(button, { pointerId: 2, isPrimary: false });
    release(button, { pointerId: 2 });
    expect(isHeld()).toBe(true);
    await tick(1600);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });


  it('a pointerdown does not bubble to the row under the button', () => {
    const onRowPointerDown = vi.fn();
    renderPage(<div onPointerDown={onRowPointerDown}><LongPressButton onComplete={() => {}}>Delete</LongPressButton></div>);
    press(screen.getByRole('button'));
    expect(onRowPointerDown).not.toHaveBeenCalled();
  });


  it('captures the held pointer and releases the capture when the hold ends, early or complete', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    // jsdom has no pointer capture of its own — record it on the element
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = vi.fn(() => true);
    button.releasePointerCapture = vi.fn();

    press(button);
    expect(button.setPointerCapture).toHaveBeenCalledWith(1);
    release(button);
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1);

    press(button, { pointerId: 7 });
    expect(button.setPointerCapture).toHaveBeenLastCalledWith(7);
    await tick(2100);
    expect(isHeld()).toBe(false);
    expect(button.releasePointerCapture).toHaveBeenLastCalledWith(7);
    expect(button.releasePointerCapture).toHaveBeenCalledTimes(2);
  });


  it('unmounting mid-hold stops the loop: onComplete never fires', async () => {
    const onComplete = vi.fn();
    const { unmount } = renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    press(screen.getByRole('button'));
    await tick(1000);
    unmount();
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });
});







// -----------------------------------------------------------
// Keyboard holds
// -----------------------------------------------------------

describe('LongPressButton keyboard hold', () => {

  it.each([' ', 'Enter'])('holding %j completes the way a pointer hold does', async (key) => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    // the default is suppressed so Space cannot scroll and no synthetic click fires
    expect(fireEvent.keyDown(button, { key })).toBe(false);
    expect(isHeld()).toBe(true);
    await tick(1900);
    expect(onComplete).not.toHaveBeenCalled();
    await tick(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(isHeld()).toBe(false);
  });


  it('other keys start nothing', () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    expect(fireEvent.keyDown(button, { key: 'a' })).toBe(true);
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(isHeld()).toBe(false);
  });


  it('keyup cancels the hold with the toast', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} uncompletedToastMessage="Hold!">Delete</LongPressButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    await tick(500);
    expect(fireEvent.keyUp(button, { key: ' ' })).toBe(false);
    expect(isHeld()).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a keyup of another key does not end the hold', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(isHeld()).toBe(true);
  });


  it('losing focus cancels a keyboard hold', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    await tick(300);
    fireEvent.blur(button);
    expect(isHeld()).toBe(false);
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('a blur does not end a pointer hold', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    fireEvent.blur(button);
    expect(isHeld()).toBe(true);
  });


  it('auto-repeat keydowns neither start nor restart a hold', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    expect(isHeld()).toBe(false);

    fireEvent.keyDown(button, { key: ' ' });
    await tick(1500);
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    // the hold started 1500 ms ago and completes 500 ms later,
    // not 2000 ms after the repeats
    await tick(600);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });


  it('a pointer release does not end a keyboard hold, a keyup does not end a pointer hold', async () => {
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    release(button);
    fireEvent.pointerLeave(button, { pointerId: 1 });
    expect(isHeld()).toBe(true);
    fireEvent.keyUp(button, { key: ' ' });
    expect(isHeld()).toBe(false);

    press(button);
    fireEvent.keyUp(button, { key: ' ' });
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(isHeld()).toBe(true);
  });


  it('a pointer press during a keyboard hold neither restarts nor takes it over', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    await tick(1500);
    press(button);
    release(button);
    expect(isHeld()).toBe(true);
    // the key hold started 1500 ms ago and completes 500 ms later
    await tick(600);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});







// -----------------------------------------------------------
// Tooltip wrapper and the delete preset
// -----------------------------------------------------------

describe('LongPressButton tooltip and presets', () => {

  it('without a tooltip the button sits directly in its parent, with one it gets a flex span wrapper', () => {
    const { unmount } = renderPage(<div data-testid="host"><LongPressButton onComplete={() => {}}>Delete</LongPressButton></div>);
    const bare = screen.getByRole('button');
    expect(bare.parentElement).toBe(screen.getByTestId('host'));
    unmount();
    renderPage(<LongPressButton onComplete={() => {}} tooltip="Nothing to delete" fullWidth>Delete</LongPressButton>);
    const wrapped = screen.getByRole('button');
    expect(wrapped.parentElement.tagName).toBe('SPAN');
    expect(wrapped.parentElement.style.display).toBe('flex');
    expect(wrapped.parentElement.style.width).toBe('100%');
  });


  it('the tooltip opens on hover even when the button is disabled', async () => {
    vi.useRealTimers();
    const { user } = renderPage(<LongPressButton onComplete={() => {}} tooltip="Nothing to delete" disabled>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.hover(button.parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Nothing to delete');
  });


  it('LongPressDeleteButton is the red preset — the app\'s delete colour — that holds like the base button', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressDeleteButton onComplete={onComplete} uncompletedToastMessage="Hold to delete">Delete row</LongPressDeleteButton>);
    const button = screen.getByRole('button', { name: 'Delete row' });
    expect(button).toHaveClass('MuiButton-colorDelete', 'MuiButton-contained');
    expect(hintOf(button)).toHaveTextContent('Hold for 2 seconds to confirm');
    press(button);
    await tick(500);
    release(button);
    expect(nodeText(errorToast.mock.calls[0][0])).toBe('Hold to delete');
    press(button);
    await tick(2100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});







// -----------------------------------------------------------
// On a phone
// -----------------------------------------------------------
//
// A cancelled pointer — the browser taking the touch over for
// a scroll — ends the hold without the "hold longer" toast,
// while an early release still asks for it. The held button
// fills from left to right as a background layer, the
// caller's own inline style kept, and the fill goes with the
// hold. The desktop never fills.
// -----------------------------------------------------------

describe('LongPressButton on a phone', () => {

  const PHONE = '(max-width: 767px)';

  beforeEach(() => {
    mediaQueryMatches(PHONE, true);
  });

  afterEach(() => {
    mediaQueryMatches(PHONE, false);
  });


  it('a cancelled pointer — the browser scrolling instead — ends the hold without the toast', async () => {
    const onComplete = vi.fn();
    renderPage(<LongPressButton onComplete={onComplete} uncompletedToastMessage="Hold!">Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    await tick(300);
    fireEvent.pointerCancel(button, { pointerId: 1 });
    expect(isHeld()).toBe(false);
    expect(errorToast).not.toHaveBeenCalled();
    await tick(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });


  it('an early release still asks to hold longer', async () => {
    renderPage(<LongPressButton onComplete={() => {}} uncompletedToastMessage="Hold!">Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    await tick(300);
    release(button);
    expect(isHeld()).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
  });


  it('fills the held button from left to right over the caller\'s own style, and the fill goes with the hold', async () => {
    renderPage(<LongPressButton onComplete={() => {}} style={{ color: 'yellow' }}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    expect(button.style.backgroundImage).toBe('');

    press(button);
    await tick(1000);
    // about half way after one of the two seconds
    expect(button.style.backgroundImage).toMatch(/^linear-gradient\(to right, rgba\(0, 0, 0, 0\.22\) [45]\d(\.\d+)?%, transparent [45]\d(\.\d+)?%\)$/);
    expect(button.style.color).toBe('yellow');

    release(button);
    expect(button.style.backgroundImage).toBe('');
    expect(button.style.color).toBe('yellow');
  });


  it('the desktop never fills', async () => {
    act(() => { mediaQueryMatches(PHONE, false); });
    renderPage(<LongPressButton onComplete={() => {}}>Delete</LongPressButton>);
    const button = screen.getByRole('button');
    press(button);
    await tick(1000);
    expect(isHeld()).toBe(true);
    expect(button.style.backgroundImage).toBe('');
  });
});
