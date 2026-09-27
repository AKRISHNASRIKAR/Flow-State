import type { CSSProperties, ReactNode } from 'react';
import { GLYPHS } from '../lib/glyphs';
import { Icon } from './ui';

// The FlowState node system, shared by the landing page and the builder so a
// visitor meets the exact nodes they'll later build with.
//
//   trigger    ink-filled glyph — there is exactly one, always first
//   step       signal-tinted glyph — web request, email, Telegram, wait, log
//   result     ok-tinted glyph — the outcome of a run
//   condition  dashed and quiet — roadmap only; the engine has no branching
//
// Type is told by glyph and fill; color on the chip is execution state only.

export type NodeKind = 'trigger' | 'step' | 'result' | 'condition';
export type RunTone = 'idle' | 'queued' | 'running' | 'ok' | 'retry' | 'fail' | 'setup';

const GLYPH_BOX: Record<NodeKind, string> = {
  trigger: 'bg-ink text-paper',
  step: 'bg-signal-soft text-signal',
  result: 'bg-ok-soft text-ok',
  condition: 'border border-dashed border-faint/70 text-faint',
};

const TONE: Record<RunTone, string> = {
  idle: 'bg-paper-2 text-muted',
  queued: 'bg-wait-soft text-wait',
  running: 'bg-signal-soft text-signal',
  ok: 'bg-ok-soft text-ok',
  retry: 'bg-wait-soft text-wait',
  fail: 'bg-fail-soft text-fail',
  setup: 'bg-fail-soft text-fail',
};

export function StateChip({ tone, children, className = '' }: { tone: RunTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1.5 py-1 font-mono text-[11px] leading-none font-medium tabular-nums ${TONE[tone]} ${className}`}
    >
      {tone === 'running' && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-signal" />}
      {children}
    </span>
  );
}

interface FlowNodeCardProps {
  kind: NodeKind;
  /** Small caps line, e.g. "Step 1 · web request". */
  label: string;
  title: ReactNode;
  glyph?: string;
  state?: { tone: RunTone; text: string };
  /** The running / selected node: signal ring. */
  active?: boolean;
  /** A node that needs attention (misconfigured, failed). */
  alert?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function FlowNodeCard({ kind, label, title, glyph, state, active, alert, className = '', style, children }: FlowNodeCardProps) {
  const quiet = kind === 'condition';
  return (
    <div
      style={style}
      className={`relative w-full rounded-md px-3.5 py-3 text-left transition-[box-shadow,border-color,transform] duration-300 ${
        quiet
          ? 'border border-dashed border-faint/70 bg-transparent'
          : 'border bg-card shadow-[0_1px_0_rgba(15,27,45,0.04),0_12px_28px_-20px_rgba(15,27,45,0.45)]'
      } ${
        active
          ? 'border-signal shadow-[0_0_0_3px_var(--color-signal-soft),0_14px_30px_-20px_rgba(43,89,232,0.6)]'
          : alert
            ? 'border-fail/60'
            : quiet
              ? ''
              : 'border-rule'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-[4px] ${GLYPH_BOX[kind]}`}>
          <Icon path={glyph ?? GLYPHS.bolt} className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`label-caps ${quiet ? 'text-faint' : 'text-muted'}`}>{label}</p>
          <div className={`mt-1.5 text-[15px] leading-snug font-medium ${quiet ? 'text-faint' : 'text-ink'}`}>{title}</div>
        </div>
        {state && <StateChip tone={state.tone}>{state.text}</StateChip>}
      </div>
      {children}
    </div>
  );
}

/**
 * The line between two nodes. `drawn` 0..1 grows the ink line from the top;
 * `flowing` sends a signal-blue packet down it (data moving right now).
 */
export function Connector({
  height = 36,
  drawn = 1,
  flowing = false,
  className = '',
}: {
  height?: number;
  drawn?: number;
  flowing?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden className={`relative mx-auto w-px ${className}`} style={{ height }}>
      <span className="absolute inset-0 bg-rule" />
      <span
        className="absolute inset-x-0 top-0 h-full origin-top bg-ink/70 transition-transform duration-300"
        style={{ transform: `scaleY(${drawn})` }}
      />
      {flowing && (
        <span
          className="absolute left-1/2 top-0 h-2.5 w-[5px] -translate-x-1/2 rounded-full bg-signal"
          style={{ animation: 'packet 1.1s cubic-bezier(.45,0,.55,1) infinite', ['--packet-travel' as string]: `${height}px` }}
        />
      )}
    </div>
  );
}
