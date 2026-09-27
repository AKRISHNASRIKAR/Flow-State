'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useScrollProgress } from './useScrollProgress';

// Where the reader's eye is: the spine draws down to this line of the
// viewport, and a station lights as the line reaches it.
const READING_LINE = 0.62;

/**
 * The page's single connection line. It runs down the left edge of every
 * section, draws itself to where you're reading, and carries a signal-blue
 * packet at its tip — so scrolling the page *is* data moving through a flow.
 */
export function SpineTrack({ children }: { children: ReactNode }) {
  const ref = useScrollProgress<HTMLDivElement>({ mode: 'reader', start: READING_LINE, variable: '--spine' });
  return (
    <div ref={ref} className="relative" style={{ '--spine': 0 } as CSSProperties}>
      <div aria-hidden className="pointer-events-none absolute left-[21px] top-3 bottom-0 w-px">
        <span className="absolute inset-0 bg-rule" />
        <span
          className="absolute inset-0 origin-top"
          style={{
            transform: 'scaleY(var(--spine))',
            background: 'linear-gradient(to bottom, var(--color-ink) 0%, var(--color-ink) 86%, var(--color-signal) 100%)',
          }}
        />
        <span
          className="absolute left-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal"
          style={{
            top: 'calc(var(--spine) * 100%)',
            boxShadow: '0 0 0 4px var(--color-signal-soft), 0 0 18px 2px color-mix(in oklab, var(--color-signal) 45%, transparent)',
          }}
        />
      </div>
      {children}
    </div>
  );
}

/** A numbered stop on the spine: fills as the reading line reaches it. */
export function Station({ n, accent = false }: { n: string; accent?: boolean }) {
  const ref = useScrollProgress<HTMLSpanElement>({ mode: 'reader', start: READING_LINE });
  const fill = accent ? 'var(--color-signal)' : 'var(--color-ink)';
  return (
    <span
      ref={ref}
      aria-hidden
      className="sp absolute left-0 top-0 z-10 flex h-[26px] w-[44px] items-center justify-center rounded-[3px] border font-mono text-[11px] font-medium"
      style={
        {
          '--a': 0,
          '--span': 1,
          background: `color-mix(in oklab, ${fill} calc(var(--t) * 100%), var(--color-paper))`,
          borderColor: `color-mix(in oklab, ${fill} calc(var(--t) * 100%), var(--color-faint))`,
          color: `color-mix(in oklab, var(--color-paper) calc(var(--t) * 100%), var(--color-muted))`,
        } as CSSProperties
      }
    >
      {n}
    </span>
  );
}

/** Stage name + headline + lede, set against a station. */
export function SectionHead({
  n,
  stage,
  title,
  children,
  accent,
  id,
}: {
  n: string;
  stage: string;
  title: ReactNode;
  children?: ReactNode;
  accent?: boolean;
  id?: string;
}) {
  return (
    <header id={id} className="relative scroll-mt-24 pl-[64px] lg:pl-[88px]">
      <Station n={n} accent={accent} />
      <p className="label-caps pt-[7px] text-signal">{stage}</p>
      <h2 className="mt-4 max-w-[18ch] font-serif text-[40px] leading-[1.04] tracking-[-0.015em] text-ink sm:text-[52px] lg:text-[60px]">
        {title}
      </h2>
      {children && <div className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-graphite">{children}</div>}
    </header>
  );
}
