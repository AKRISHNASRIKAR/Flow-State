'use client';

import { useEffect, useRef } from 'react';

// How quickly the eased value catches up with the real scroll position, per
// 60 fps frame. Lower = smoother and lazier. 0.14 feels fluid without lag.
const EASE_PER_FRAME = 0.14;
const SETTLED = 0.0005;

type Mode =
  /** 0 when the element's top reaches the bottom of the viewport, 1 when its bottom leaves the top. */
  | 'through'
  /** 0 when the element's top reaches `start` (fraction of viewport height), 1 when its bottom reaches `end`. Used for sticky stories. */
  | 'pinned'
  /** How far a reading line (`start`, fraction of viewport height) has travelled down the element: 0 at its top, 1 at its bottom. */
  | 'reader';

interface Options {
  mode?: Mode;
  /** For 'pinned': viewport fraction where progress starts (top of element). */
  start?: number;
  /** For 'pinned': viewport fraction where progress ends (bottom of element). */
  end?: number;
  /** CSS custom property to write. */
  variable?: string;
  /** Called with the eased value each frame — for the few visuals that need discrete states. Keep it cheap. */
  onChange?: (p: number) => void;
}

/**
 * Scroll-linked progress for one element, written as a CSS custom property
 * (default `--p`, 0..1) on that element — never React state, so scrolling
 * never re-renders anything. The value eases toward the real position every
 * animation frame, which is what makes lines draw and nodes arrive smoothly
 * instead of stepping with each wheel tick. The page's own scrolling is left
 * untouched (no scroll-jacking).
 *
 * With prefers-reduced-motion the value snaps instead of easing.
 */
export function useScrollProgress<T extends HTMLElement>({
  mode = 'through',
  start = 0,
  end = 1,
  variable = '--p',
  onChange,
}: Options = {}) {
  const ref = useRef<T>(null);
  // Latest callback without re-subscribing the scroll listener.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let current = -1;
    let target = 0;
    let frame = 0;
    let last = performance.now();

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      let p: number;
      if (mode === 'reader') {
        p = rect.height <= 0 ? 0 : (vh * start - rect.top) / rect.height;
        // At the very bottom of the page everything has been read, even if the
        // reading line can't physically reach the last element.
        if (window.scrollY + vh >= document.documentElement.scrollHeight - 2) p = Math.max(p, rect.bottom <= vh ? 1 : p);
      } else if (mode === 'pinned') {
        // Distance travelled by the element's top past `start`, over the
        // scrollable distance until its bottom reaches `end`.
        const from = vh * start;
        const total = rect.height - (vh * end - vh * start);
        p = total <= 0 ? (rect.top <= from ? 1 : 0) : (from - rect.top) / total;
      } else {
        p = (vh - rect.top) / (vh + rect.height);
      }
      target = Math.min(1, Math.max(0, p));
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (current < 0 || reduce) {
        current = target;
      } else {
        // Frame-rate independent exponential ease.
        const k = 1 - Math.pow(1 - EASE_PER_FRAME, dt / 16.67);
        current += (target - current) * k;
      }
      if (Math.abs(target - current) <= SETTLED) current = target;
      el.style.setProperty(variable, current.toFixed(4));
      onChangeRef.current?.(current);
      frame = current === target ? 0 : requestAnimationFrame(tick);
    };

    const kick = () => {
      measure();
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    kick();
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      cancelAnimationFrame(frame);
    };
  }, [mode, start, end, variable]);

  return ref;
}
