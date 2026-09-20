'use client';

import { useCallback, useRef } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';

/**
 * Touch-swipe navigation for the calendar surface.
 *
 * Uses NATIVE touch events (touchstart/move/end) bound in the CAPTURE phase,
 * so react-big-calendar / react-dnd handlers inside the calendar can never
 * swallow the gesture. Desktop mouse is untouched.
 *
 * A gesture is a swipe only when all of these hold:
 *  - a single touch pointer is involved (no pinch);
 *  - displacement is horizontal-dominant (|dx| > |dy| * RATIO), leaving every
 *    vertical scroll intact;
 *  - the threshold is crossed soon after touchstart (<= QUICK_MS), so the
 *    react-dnd 200ms long-press-drag (event dragging) never conflicts; anything
 *    slower is treated as a drag/selection, not navigation.
 *
 * react-big-calendar's touch slot-selection fires at touchend — before this
 * hook can know the final direction — so the "did swipe" flag is set during
 * touchmove (once the threshold is crossed), and the shell consumes it via
 * {@link justSwipedRef} to suppress the selection's modal/drawer side-effects.
 */

interface SwipeGesture {
  active: boolean;
  id: number | null;
  x0: number;
  y0: number;
  t0: number;
  swiping: boolean;
  dirX: number;
}

const SWIPE_THRESHOLD_PX = 40;
const DIRECTION_RATIO = 1.4;
const QUICK_MS = 400;

const IDLE: SwipeGesture = { active: false, id: null, x0: 0, y0: 0, t0: 0, swiping: false, dirX: 0 };

export function useSwipeNavigation(onSwipe: (direction: 1 | -1) => void) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const gesture = useRef<SwipeGesture>(IDLE);

  /** Set during `touchmove`, consumed by the shell to suppress selection side-effects. */
  const justSwipedRef = useRef(false);

  const onTouchStartCapture = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch || e.touches.length !== 1) {
      gesture.current = IDLE;
      return;
    }
    justSwipedRef.current = false;
    gesture.current = {
      active: true,
      id: touch.identifier,
      x0: touch.clientX,
      y0: touch.clientY,
      t0: e.timeStamp,
      swiping: false,
      dirX: 0,
    };
  }, []);

  const onTouchMoveCapture = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g.active) return;
    const touch = Array.from(e.touches).find((t) => t.identifier === g.id);
    if (!touch) return;
    const dx = touch.clientX - g.x0;
    const dy = touch.clientY - g.y0;
    if (g.swiping) {
      g.dirX = dx; // keep direction from the freshest position
      return;
    }
    if (e.timeStamp - g.t0 > QUICK_MS) {
      g.active = false; // held too long → drag / long-press, not a swipe
      return;
    }
    const absDx = Math.abs(dx);
    if (absDx < SWIPE_THRESHOLD_PX) return;
    if (absDx < Math.abs(dy) * DIRECTION_RATIO) {
      g.active = false; // vertical-dominant → scrolling, not navigation
      return;
    }
    g.swiping = true;
    g.dirX = dx;
    justSwipedRef.current = true;
  }, []);

  const onTouchEndCapture = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g.active) return;
    const stillTouching = Array.from(e.touches).some((t) => t.identifier === g.id);
    g.active = false;
    if (!g.swiping || stillTouching) return;
    gesture.current = IDLE;
    onSwipeRef.current(g.dirX < 0 ? 1 : -1);
  }, []);

  const onTouchCancelCapture = useCallback(() => {
    gesture.current = IDLE;
    justSwipedRef.current = false;
  }, []);

  return {
    onTouchStartCapture,
    onTouchMoveCapture,
    onTouchEndCapture,
    onTouchCancelCapture,
    justSwipedRef,
  };
}