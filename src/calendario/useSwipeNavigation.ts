'use client';

import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Touch-swipe navigation for the calendar surface.
 *
 * A gesture counts as a swipe only when all of these hold:
 *  - it starts from a touch pointer (mouse never hijacks drag/drop/selection);
 *  - the displacement is horizontal-dominant (|dx| > |dy| * RATIO), so vertical
 *    scrolling in the time views is never eaten;
 *  - the threshold is crossed quickly (<= QUICK_MS), so react-dnd's 200ms
 *    long-press-drag (event dragging) never conflicts;
 *  - the pointer is not already inside a `.rbc-event` being moved/DnD'd.
 *
 * react-big-calendar's slot-selection fires on `touchend`, i.e. BEFORE this
 * hook's own `pointerup` — so the "did swipe" flag is set during `pointermove`
 * (once the threshold is crossed) and the shell consumes it via
 * {@link justSwipedRef} to ignore the selection's modal/opener side-effects.
 */

interface SwipeGesture {
  active: boolean;
  x0: number;
  y0: number;
  t0: number;
  swiping: boolean;
}

const SWIPE_THRESHOLD_PX = 48;
const DIRECTION_RATIO = 1.6;
const QUICK_MS = 300;

export function useSwipeNavigation(onSwipe: (direction: 1 | -1) => void) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const gesture = useRef<SwipeGesture>({ active: false, x0: 0, y0: 0, t0: 0, swiping: false });

  /** Set during `pointermove`, consumed by the shell to suppress selection side-effects. */
  const justSwipedRef = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch') return;
    justSwipedRef.current = false;
    gesture.current = { active: true, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, swiping: false };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g.active || e.pointerType !== 'touch') return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.swiping) return;
    if (e.timeStamp - g.t0 > QUICK_MS) {
      g.active = false; // held too long → treat as a drag / long-press, not a swipe
      return;
    }
    const absDx = Math.abs(dx);
    if (absDx < SWIPE_THRESHOLD_PX) return;
    if (absDx < Math.abs(dy) * DIRECTION_RATIO) {
      g.active = false; // vertical-dominant → scroll, not navigation
      return;
    }
    g.swiping = true;
    justSwipedRef.current = true;
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g.active || e.pointerType !== 'touch') return;
    g.active = false;
    if (!g.swiping) return;
    const dx = e.clientX - g.x0;
    onSwipeRef.current(dx < 0 ? 1 : -1);
    gesture.current.swiping = false;
  }, []);

  const onPointerCancel = useCallback(() => {
    const g = gesture.current;
    g.active = false;
    g.swiping = false;
    justSwipedRef.current = false;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    justSwipedRef,
  };
}