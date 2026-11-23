// -----------------------------------------------------------
//  [*] LongPressButton — hold-to-confirm button
//
//  Ported from the Tracer system's component of the same
//  name: the hold, its keyboard path and the phone behaviour
//  are Tracer's own; the tooltip wears this app's style, and
//  the "hold longer" toast stays as long as it takes to read
//  (utils/toast), not Tracer's fixed three seconds.
//
//  Button that must be held down (default 2 s) before it
//  fires — used for destructive actions instead of a confirm
//  dialog. While holding, the label is replaced by a circular
//  progress ring; releasing early cancels and can show an
//  error toast. Completing only fires onComplete — the
//  button never toasts success itself, because a completed
//  hold means "the request may start", not "it worked": the
//  caller toasts from its mutation's outcome (a refusal would
//  otherwise arrive right after a green "Deleted").
//
//  Built on Pointer Events, so mouse, touch and pen share
//  one code path, plus a keyboard path: holding Space or
//  Enter on the focused button is the same hold (key repeat
//  is ignored, the first keyup or losing focus cancels). Only
//  the primary button of the primary pointer starts a pointer
//  hold, and ANY way of not finishing it cancels: release, a
//  cancelled touch (system gesture, notification), the finger
//  or cursor sliding off the button, the window losing focus,
//  the tab being hidden, or the button becoming disabled
//  mid-hold — a drifting or cancelled touch never fires.
//
//  The hold is explained to assistive tech through a visually
//  hidden aria-describedby hint ("Hold for N seconds to
//  confirm"), messages under COMPONENTS.longPressButton.
//
//  On a phone (767 px and narrower) a hold is a thumb on a
//  touch screen, and three things change. A vertical swipe
//  that starts on the button still scrolls the page
//  (touch-action pan-y); the browser then cancels the
//  pointer, which ends the hold quietly, without the "hold
//  longer" toast — the finger was scrolling, not letting go
//  early. iOS shows no callout over the held button. And the
//  progress also fills the button from left to right
//  (pressFill), because the ring in its middle sits right
//  under the thumb.
//
//  Split into small pieces (main component near the end):
//
//    PHONE_QUERY            — where a hold is a thumb
//    PRESS_SX               — what a hold needs from the browser
//    pressFill              — the phone's left-to-right fill
//    useLongPress           — press state + rAF progress loop
//    PressProgress          — circular progress ring
//    ButtonTooltip          — tooltip that works when disabled
//    LongPressButton        — the button itself (default export)
//    LongPressDeleteButton  — the red "delete" preset
// -----------------------------------------------------------

import { useState, useEffect, useRef, useId } from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import toast from '@/utils/toast';
import { useTranslations } from '@/i18n';


// 2 seconds
const DEFAULT_DURATION = 2000;

// A phone — 767 px and narrower, Tracer's line: where a hold
// is a thumb on a touch screen (see the file header)
const PHONE_QUERY = '(max-width: 767px)';
const PHONE_MEDIA = `@media ${PHONE_QUERY}`;

// What a hold needs from the browser: no text selection while
// holding, and a touch hold is ours, not a scroll (which would
// cancel the pointer instead of letting the move handler
// decide) — except on a phone, where a vertical swipe stays a
// scroll and iOS gets no callout (see the file header). Comes
// first in the button's sx list, so a caller's own sx adds to
// it instead of replacing it.
const PRESS_SX = {
  userSelect: 'none',
  touchAction: 'none',
  [PHONE_MEDIA]: {
    touchAction: 'pan-y',
    WebkitTouchCallout: 'none',
  },
};

// The phone's progress: a dark wash filling the held button
// from left to right, painted as a background layer — under
// the ring and any pressedContent, clipped to the rounding
const pressFill = (progress) => ({
  backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.22) ${progress}%, transparent ${progress}%)`,
});







// -----------------------------------------------------------
// useLongPress
// -----------------------------------------------------------
//
// All the press logic. The only real state is `pressedAt` —
// the timestamp when the hold started (null = not pressed).
// While it is set, an effect runs a requestAnimationFrame
// loop that updates the 0–100 progress and fires onComplete
// once the duration is reached; the same effect installs the
// window blur / visibility listeners that abort a hold nobody
// is watching.
//
// A hold is owned by whatever started it — `holdRef` records
// either the captured pointer (its id and target) or the held
// key — and only that owner's release ends it: a stray
// pointerleave does not cancel a keyboard hold, a keyup does
// not cancel a pointer hold. Cancelling early just clears
// `pressedAt` (and toasts, when a message is given); the
// effect cleanup stops the animation loop, which also covers
// unmount mid-press. With `quietPointerCancel` (a phone) a
// cancelled pointer ends the hold without the toast.
//
// Returns whether the button is pressed, the progress, and
// the handlers to spread onto the button: the pointer events
// (down starts; up, cancel, leave and a move off the button
// cancel) and the keyboard events (Space/Enter down starts,
// keyup or blur cancels).
//
// Used by:
//   - LongPressButton (below)
// -----------------------------------------------------------

function useLongPress({ onComplete, disabled, duration, uncompletedToastMessage, quietPointerCancel }) {

  const [pressedAt, setPressedAt] = useState(null);
  const [progress, setProgress] = useState(0);

  // Who owns the current hold: the pointer being held (id +
  // the element that captured it, so a second finger or a
  // different pointer cannot interfere and the capture can be
  // released on cancel) or the key being held
  const holdRef = useRef(null);


  // Press released or aborted early — the one exit path for
  // every "did not finish" case; `quiet` skips the toast
  const cancel = (quiet = false) => {
    if (pressedAt === null) return;
    releasePointer();

    if (!quiet && Date.now() - pressedAt < duration && uncompletedToastMessage) {
      toast.error(<b>{uncompletedToastMessage}</b>);
    }

    setPressedAt(null);
    setProgress(0);
  };


  const releasePointer = () => {
    const held = holdRef.current;
    holdRef.current = null;
    if (held?.target && held.target.hasPointerCapture?.(held.id)) {
      held.target.releasePointerCapture(held.id);
    }
  };


  // Animation loop — runs only while the button is held. The
  // blur / visibilitychange listeners live here too, so they
  // exist exactly as long as a hold does
  useEffect(() => {
    if (pressedAt === null) return;

    let frame;
    const tick = () => {
      // A hold cannot complete on a button that was disabled
      // meanwhile (a request went in flight, the row vanished)
      if (disabled) { cancel(); return; }

      const elapsed = Date.now() - pressedAt;
      setProgress(Math.min((elapsed / duration) * 100, 100));

      if (elapsed >= duration) {
        releasePointer();
        setPressedAt(null);
        setProgress(0);
        onComplete?.();
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    const abort = () => cancel();
    const onVisibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', abort);
    document.addEventListener('visibilitychange', onVisibility);

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // cancel/releasePointer are recreated per render on purpose;
    // the loop only needs the values captured for this hold
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressedAt, duration, onComplete, disabled]);


  // Press started — primary button of the primary pointer
  // only (right/middle mouse and a second finger are ignored).
  // Capturing the pointer keeps the move/up events coming to
  // this element even after it leaves the button, which is
  // what lets the move handler notice the drift and cancel
  const onPointerDown = (e) => {
    if (disabled || pressedAt !== null) return;
    if (e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();

    holdRef.current = { id: e.pointerId, target: e.currentTarget };
    e.currentTarget.setPointerCapture?.(e.pointerId);

    setProgress(0);
    setPressedAt(Date.now());
  };


  // While captured, "leave" never fires — so a move outside
  // the button's box is the drag-off signal
  const onPointerMove = (e) => {
    const held = holdRef.current;
    if (!held?.target || e.pointerId !== held.id) return;
    const box = e.currentTarget.getBoundingClientRect();
    const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if (outside) cancel();
  };


  // Only the held pointer's release ends a pointer hold; a
  // keyboard hold ignores pointer events altogether (the
  // cursor may well wander off while Space is held)
  const onPointerEnd = (e) => {
    const held = holdRef.current;
    if (!held?.target || e.pointerId !== held.id) return;
    e.stopPropagation();
    cancel();
  };


  // A cancelled pointer — on a phone usually the browser
  // taking the touch over for a scroll — ends the hold the
  // same way, quietly there
  const onPointerCancel = (e) => {
    const held = holdRef.current;
    if (!held?.target || e.pointerId !== held.id) return;
    e.stopPropagation();
    cancel(quietPointerCancel);
  };


  // Keyboard hold — Space or Enter on the focused button.
  // Auto-repeat keydowns are ignored so the hold is one press,
  // and the default is suppressed so Space does not scroll the
  // page and the browser's synthetic click (Enter on keydown,
  // Space on keyup) never fires
  const onKeyDown = (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || disabled || pressedAt !== null) return;

    holdRef.current = { key: e.key };
    setProgress(0);
    setPressedAt(Date.now());
  };


  const onKeyUp = (e) => {
    const held = holdRef.current;
    if (!held?.key || e.key !== held.key) return;
    e.preventDefault();
    cancel();
  };


  // Focus leaving the button ends a keyboard hold (Tab, a
  // modal closing, a click elsewhere) — a pointer hold is
  // ended by its own release, which comes first
  const onBlur = () => {
    if (holdRef.current?.key) cancel();
  };


  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel,
    onPointerLeave: onPointerEnd,
    onKeyDown,
    onKeyUp,
    onBlur,
  };

  return { isPressed: pressedAt !== null, progress, handlers };
}







// -----------------------------------------------------------
// PressProgress
// -----------------------------------------------------------
//
// The circular progress ring shown inside the button while
// it is held: a faint full circle in the background with the
// actual progress drawn on top. Transitions are disabled so
// the rAF-driven value animates smoothly.
//
// Used by:
//   - LongPressButton (below) — default pressed content
// -----------------------------------------------------------

function PressProgress({ progress, size, thickness, color, bgColor }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      {/* Background circle */}
      <CircularProgress
        variant="determinate"
        value={100}
        size={size}
        thickness={thickness}
        sx={{ color: bgColor, position: 'absolute' }}
      />

      {/* Progress circle */}
      <CircularProgress
        variant="determinate"
        value={progress}
        size={size}
        thickness={thickness}
        sx={{
          color,
          position: 'absolute',
          '& .MuiCircularProgress-circle': {
            strokeLinecap: 'round',
            transition: 'none',
          },
        }}
      />
    </div>
  );
}







// -----------------------------------------------------------
// ButtonTooltip
// -----------------------------------------------------------
//
// The app's own tooltip around the button. Renders the button
// as-is when no tooltip text is given; otherwise wraps it in
// a <span> so the tooltip also works on disabled buttons
// (disabled elements don't fire hover events themselves). The
// tooltip describes the button, as IconAction's does — its
// name is the button's own.
//
// Used by:
//   - LongPressButton (below)
// -----------------------------------------------------------

function ButtonTooltip({ tooltip, fullWidth, children }) {

  if (!tooltip) return children;

  return (
    <Tooltip title={tooltip} describeChild disableInteractive>
      <span style={{ display: 'flex', flex: 1, width: fullWidth ? '100%' : 'auto' }}>
        {children}
      </span>
    </Tooltip>
  );
}







// -----------------------------------------------------------
// LongPressButton (default export)
// -----------------------------------------------------------
//
// The button itself — spreads the useLongPress pointer and
// keyboard handlers onto the MUI Button and swaps the label
// for the progress ring (or custom pressedContent) while
// held; on a phone pressFill fills the button underneath it.
// PRESS_SX keeps text selection and (off a phone) scrolling
// out of a hold; the context menu is suppressed because a
// touch long-press would open it mid-hold. A visually hidden
// sibling carries the "hold for N seconds" hint that
// aria-describedby points at.
//
// Used by:
//   - LongPressDeleteButton (below)
// -----------------------------------------------------------

export default function LongPressButton({
  // Core functionality
  onComplete,              // Called when long press completes
  disabled = false,
  duration = DEFAULT_DURATION,

  // Button content
  children,                // Button content when not pressed
  pressedContent,          // Custom content while pressing (optional)

  // Appearance
  color = 'error',         // MUI color: a palette name ("error", "delete", "primary"…)
  variant = 'contained',   // MUI variant: "contained" | "outlined" | "text"
  fullWidth = false,
  size = 'medium',         // MUI size: "small" | "medium" | "large"
  sx = {},

  // Feedback — the early-release error toast only; success is
  // the caller's mutation to report (see the file header)
  uncompletedToastMessage,

  // Tooltip (shown on hover, works even when disabled)
  tooltip = '',

  // Inline style — the phone's fill joins it while held
  style,

  // Progress indicator customization
  progressSize = 24,
  progressThickness = 4,
  progressColor = 'white',
  progressBgColor = 'rgba(255,255,255,0.3)',

  // Other props passed to Button
  ...buttonProps
}) {

  const t = useTranslations('COMPONENTS.longPressButton');
  const hintId = useId();
  const phone = useMediaQuery(PHONE_QUERY, { noSsr: true });

  const { isPressed, progress, handlers } = useLongPress({
    onComplete,
    disabled,
    duration,
    uncompletedToastMessage,
    quietPointerCancel: phone,
  });


  return (
    <ButtonTooltip tooltip={tooltip} fullWidth={fullWidth}>
      <Button
        variant={variant}
        color={color}
        fullWidth={fullWidth}
        size={size}
        disabled={disabled}
        aria-describedby={hintId}
        {...handlers}
        onContextMenu={(e) => e.preventDefault()}
        sx={[PRESS_SX, ...(Array.isArray(sx) ? sx : [sx])]}
        style={phone && isPressed ? { ...style, ...pressFill(progress) } : style}
        {...buttonProps}
      >
        {isPressed
          ? (pressedContent || (
              <PressProgress
                progress={progress}
                size={progressSize}
                thickness={progressThickness}
                color={progressColor}
                bgColor={progressBgColor}
              />
            ))
          : children}
      </Button>
      <span id={hintId} className="sr-only">
        {t('holdHint', { seconds: Math.round(duration / 100) / 10 })}
      </span>
    </ButtonTooltip>
  );
}







// -----------------------------------------------------------
// LongPressDeleteButton (exported)
// -----------------------------------------------------------
//
// Preset: the hold-to-delete button in this app's
// destructive red (the `delete` palette colour every delete
// button wears).
//
// Used by:
//   - pages/Users/Users.jsx — UsersTable, the hold-to-delete
//     button of every account row
// -----------------------------------------------------------

export function LongPressDeleteButton({
  children,
  uncompletedToastMessage,
  ...props
}) {
  return (
    <LongPressButton
      color="delete"
      uncompletedToastMessage={uncompletedToastMessage}
      {...props}
    >
      {children}
    </LongPressButton>
  );
}
