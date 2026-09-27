/**
 * FlowState brand mark: one continuous chain that folds back on itself, with a
 * node at each end (trigger → last action).
 *
 * It is deliberately a single unbranched line — the engine runs exactly one
 * ordered chain per workflow, and the brand shouldn't promise a DAG any more
 * than the canvas does.
 *
 * The path is drawn on a 24x24 grid and is symmetric about (12, 12), so a call
 * site can size it with a single `size-*` class and trust it to sit centred.
 */
const MARK_PATH = 'M4 5h9.5a3.5 3.5 0 0 1 0 7H10a3.5 3.5 0 0 0 0 7H20';

const NODE_RADIUS = 2.25;

export function LogoMark({ className = 'size-5', strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d={MARK_PATH}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={4} cy={5} r={NODE_RADIUS} fill="currentColor" />
      <circle cx={20} cy={19} r={NODE_RADIUS} fill="currentColor" />
    </svg>
  );
}

/** The mark on an ink tile, beside the serif wordmark — the one brand lockup. */
export function BrandLockup({ size = 'md', wordmark = true }: { size?: 'sm' | 'md'; wordmark?: boolean }) {
  const tile = size === 'sm' ? 'size-7 rounded-[5px]' : 'size-8 rounded-[6px]';
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`flex shrink-0 items-center justify-center bg-ink text-paper ${tile}`}>
        <LogoMark className={size === 'sm' ? 'size-4' : 'size-[18px]'} />
      </span>
      {wordmark && (
        <span className={`font-serif leading-none text-ink ${size === 'sm' ? 'text-[20px]' : 'text-[22px]'}`}>FlowState</span>
      )}
    </span>
  );
}
